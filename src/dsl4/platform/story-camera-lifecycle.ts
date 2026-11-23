import {type Dsl4CompositionMethod, validateCompositionMethods} from './composition-contract.js';
import {
  dsl4DefaultPosePreviewOpacity,
  dsl4DefaultPosePreviewPosition,
  validateDsl4PosePreviewOpacity,
  validateDsl4PosePreviewPosition,
} from './pose-preview-placement.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const recognitionCommands = new Set(['pose', 'poseInputToChangeScene', 'imageInputToChangeScene']);

export function storyUsesPoseRecognition(storyDocument: unknown) {
  if (!isRecord(storyDocument) || !Array.isArray(storyDocument.scenes)) return false;
  return storyDocument.scenes.some(
    (scene) =>
      isRecord(scene) &&
      Array.isArray(scene.actions) &&
      scene.actions.some(
        (action) => isRecord(action) && recognitionCommands.has(String(action.command)),
      ),
  );
}

/**
 * Own one camera stream for the complete story while pose actions own preview visibility.
 */
export function createDsl4StoryCameraLifecycle(options: unknown) {
  if (!isRecord(options) || !isRecord(options.composition)) {
    throw new TypeError('story camera lifecycle options and composition are required');
  }
  const composition = options.composition as Record<
    (typeof methods)[number],
    Dsl4CompositionMethod
  >;
  const methods = [
    'startCamera',
    'stopCamera',
    'isCameraRunning',
    'hidePreview',
    'isPreviewVisible',
    'setPreviewOpacity',
    'setPreviewPosition',
    'stopRecognition',
    'isRecognizing',
  ] as const;
  validateCompositionMethods(options.composition, 'story camera composition', methods);
  if (options.setBusy !== undefined && typeof options.setBusy !== 'function') {
    throw new TypeError('setBusy must be a function');
  }
  // The story owns the placement because the preview it prepares is the one every pose action
  // shows: a scene cannot be handed a preview the story did not ask for.
  const previewPosition =
    options.previewPosition === undefined
      ? dsl4DefaultPosePreviewPosition
      : validateDsl4PosePreviewPosition(options.previewPosition, 'story camera preview position');
  const previewOpacity =
    options.previewOpacity === undefined
      ? dsl4DefaultPosePreviewOpacity
      : validateDsl4PosePreviewOpacity(options.previewOpacity, 'story camera preview opacity');
  if (options.onCleanupError !== undefined && typeof options.onCleanupError !== 'function') {
    throw new TypeError('onCleanupError must be a function');
  }
  const onCleanupError = options.onCleanupError as ((error: unknown) => unknown) | undefined;
  const setBusy = options.setBusy as
    | ((
        payload: Readonly<{visible: boolean; source: string; label: string; cursor: string}>,
      ) => unknown)
    | undefined;

  let desired = false;
  let disposed = false;
  let previewPrepared = false;
  let generation = 0;
  let openingCamera: Promise<unknown> | null = null;
  let cancelCameraWait: (() => void) | null = null;
  let queue: Promise<boolean> = Promise.resolve(false);
  let disposePromise: Promise<boolean> | null = null;
  let disposeAttempt: Promise<boolean> | null = null;
  let disposeRunning = false;
  let cleanupRequired = false;
  let cleanupError: unknown = null;

  function reportCleanupError(error: unknown) {
    try {
      void Promise.resolve(onCleanupError?.(error)).catch(() => {});
    } catch {
      /* Diagnostic observers cannot change cleanup ownership. */
    }
  }

  function disposeCamera(late = false): Promise<boolean> {
    if (!late && disposeRunning) return disposeAttempt!;
    if (!late && disposeAttempt && !cleanupRequired) return disposeAttempt;
    disposed = true;
    // Late startup must schedule its own cleanup even if an earlier attempt is settling.
    const previous = disposeRunning ? disposeAttempt : null;
    const operation = (previous ? previous.catch(() => false) : Promise.resolve(false)).then(
      stopNow,
    );
    disposeRunning = cleanupRequired = true;
    disposeAttempt = disposePromise = operation;
    void operation.then(
      () => {
        if (disposeAttempt !== operation) return;
        disposeRunning = cleanupRequired = false;
        cleanupError = null;
      },
      (error) => {
        if (disposeAttempt === operation) {
          disposeRunning = false;
          disposeAttempt = null;
          cleanupRequired = true;
          cleanupError = error;
        }
        if (late) reportCleanupError(error);
      },
    );
    return operation;
  }

  function notifyBusy(visible: boolean) {
    try {
      void Promise.resolve(
        setBusy?.(
          Object.freeze({
            visible,
            source: 'camera',
            label: 'Starting camera',
            cursor: 'wait',
          }),
        ),
      ).catch(() => {});
    } catch {
      // Presentation observers cannot change camera ownership.
    }
  }

  function stopCameraResources() {
    const errors = [];
    // Validated above, and each pair is read once so the stop only runs while the state is active.
    for (const [active, stop] of [
      [composition.isPreviewVisible, composition.hidePreview],
      [composition.isRecognizing, composition.stopRecognition],
      [composition.isCameraRunning, composition.stopCamera],
    ] as ReadonlyArray<[Dsl4CompositionMethod, Dsl4CompositionMethod]>) {
      try {
        if (active.call(composition)) stop.call(composition);
      } catch (error) {
        errors.push(error);
      }
    }
    previewPrepared = false;
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, 'Story camera resources could not be stopped');
    }
    return false;
  }

  function cameraStartup() {
    if (openingCamera) return openingCamera;
    const opening = Promise.resolve(composition.startCamera()).then(() => {
      // Browser permission requests cannot be aborted. Reclaim a late result after the
      // story has stopped, while leaving a new claim on this composition intact.
      if (!desired) {
        if (disposed) return disposeCamera(true);
        try {
          stopCameraResources();
        } catch (error) {
          cleanupRequired = true;
          cleanupError = error;
          reportCleanupError(error);
          throw error;
        }
      }
      return false;
    });
    openingCamera = opening;
    const clearOpening = () => {
      if (openingCamera === opening) openingCamera = null;
    };
    void opening.then(clearOpening, clearOpening);
    return opening;
  }

  async function reconcile(expectedGeneration: number) {
    if (disposed || expectedGeneration !== generation) return false;
    if (!desired) return stopCameraResources();
    if (!previewPrepared) {
      composition.hidePreview();
      composition.setPreviewOpacity(previewOpacity);
      composition.setPreviewPosition(previewPosition);
      previewPrepared = true;
    }
    if (!composition.isCameraRunning()) {
      notifyBusy(true);
      let cancel = () => {};
      const cancelled = new Promise<false>((resolve) => {
        cancel = () => resolve(false);
      });
      cancelCameraWait = cancel;
      try {
        const started = await Promise.race([cameraStartup().then(() => true), cancelled]);
        if (!started || expectedGeneration !== generation) return false;
      } finally {
        if (cancelCameraWait === cancel) cancelCameraWait = null;
        notifyBusy(false);
      }
    }
    if (!desired) return stopCameraResources();
    return true;
  }

  function enqueue() {
    const expectedGeneration = generation;
    const operation = queue.catch(() => false).then(() => reconcile(expectedGeneration));
    queue = operation;
    return operation;
  }

  function stopNow() {
    desired = false;
    generation += 1;
    cancelCameraWait?.();
    // Do not enqueue cleanup behind getUserMedia: the person may never answer its prompt.
    try {
      return Promise.resolve(stopCameraResources());
    } catch (error) {
      return Promise.reject(error);
    }
  }

  return Object.freeze({
    start() {
      if (disposed) {
        return Promise.reject(new Error('Story camera lifecycle is disposed'));
      }
      desired = true;
      return enqueue();
    },
    stop() {
      if (disposePromise) return disposePromise;
      return stopNow();
    },
    hasPendingCleanup() {
      // A permission response may arrive after disposal succeeded and require another cleanup.
      return cleanupRequired || disposeRunning || (disposed && openingCamera !== null);
    },
    getCleanupError() {
      return cleanupError;
    },
    dispose() {
      return disposeCamera();
    },
  });
}
