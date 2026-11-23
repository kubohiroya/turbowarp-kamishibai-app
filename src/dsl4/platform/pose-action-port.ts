import {validateCompositionMethods} from './composition-contract.js';
import {createDsl4PoseStateEvent} from '../pose-feedback-policy.js';
import {
  type Dsl4PosePreviewPosition,
  dsl4DefaultPosePreviewPosition,
  validateDsl4PosePreviewPosition,
} from './pose-preview-placement.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const feedbackModes = new Set(['scratchMirror', 'scratchBinding', 'presenter']);
const poseBindingKeys = new Set(['confidence', 'progress']);
const recognitionModes = new Set(['pose', 'image']);

function portError(code: string, message: string) {
  const error = new Error(message);
  Object.defineProperty(error, 'code', {value: code});
  return error;
}

function abortError(message: string) {
  const error = portError('K4-POSE-PORT-004', message);
  error.name = 'AbortError';
  return error;
}

function deferred() {
  let resolve = () => {};
  const promise: Promise<void> = new Promise((resolvePromise) => {
    resolve = () => resolvePromise();
  });
  return {promise, resolve};
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.length === 0) {
    throw portError('K4-POSE-PORT-001', `${label} must be a non-empty string`);
  }
  return value;
}

function requireNumber(value: unknown, label: string, accepts: (number: number) => boolean) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !accepts(value)) {
    throw portError('K4-POSE-PORT-001', `${label} is invalid`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string) {
  if (typeof value !== 'boolean') {
    throw portError('K4-POSE-PORT-001', `${label} must be boolean`);
  }
  return value;
}

function validatePoseStateBinding(value: unknown) {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw new TypeError('pose state binding must be an object');
  const keys = Object.keys(value);
  if (
    keys.length === 0 ||
    keys.some((key) => !poseBindingKeys.has(key)) ||
    keys.some((key) => {
      const number = value[key];
      return typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > 1;
    })
  ) {
    throw new TypeError('pose state binding must contain normalized confidence or progress');
  }
  return value as Readonly<{confidence?: number; progress?: number}>;
}

function validateContext(value: unknown) {
  const signal = isRecord(value) ? value.signal : null;
  if (
    !isRecord(signal) ||
    typeof signal.aborted !== 'boolean' ||
    typeof signal.addEventListener !== 'function' ||
    typeof signal.removeEventListener !== 'function'
  ) {
    throw portError('K4-POSE-PORT-001', 'pose action signal is invalid');
  }
  const actionSignal = isRecord(value) ? (value.actionSignal ?? signal) : null;
  if (
    !isRecord(actionSignal) ||
    typeof actionSignal.aborted !== 'boolean' ||
    typeof actionSignal.addEventListener !== 'function' ||
    typeof actionSignal.removeEventListener !== 'function'
  ) {
    throw portError('K4-POSE-PORT-001', 'pose action owner signal is invalid');
  }
  return {
    signal: signal as unknown as AbortSignal,
    actionSignal: actionSignal as unknown as AbortSignal,
  };
}

function validateTMComposition(value: unknown) {
  const methods = [
    'activatePoseModel',
    'isPoseModelRegistered',
    'getActivePoseModelName',
    'showPreview',
    'hidePreview',
    'isPreviewVisible',
    'setPreviewPosition',
    'startRecognition',
    'stopRecognition',
    'isRecognizing',
    'confidenceOf',
    'configureAccumulatedPose',
    'resetAccumulatedPose',
    'subscribeAccumulatedPose',
  ] as const;
  return validateCompositionMethods(value, 'TM composition', methods);
}

function validateAsyncInputComposition(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.waitForPoseCandidate !== 'function' ||
    typeof value.releaseAll !== 'function'
  ) {
    throw new TypeError('Async Input composition must provide waitForPoseCandidate and releaseAll');
  }
  return value as Record<
    'waitForPoseCandidate' | 'releaseAll',
    (...parameters: unknown[]) => unknown
  >;
}

function validateSequencePayload(value: unknown) {
  if (!isRecord(value) || !isRecord(value.recognition)) {
    throw portError('K4-POSE-PORT-001', 'waitForPose payload is invalid');
  }
  const recognition = value.recognition;
  const feedback = recognition.feedback === undefined ? {} : recognition.feedback;
  const navigation = recognition.navigation === undefined ? {} : recognition.navigation;
  if (!isRecord(feedback) || !isRecord(navigation)) {
    throw portError('K4-POSE-PORT-001', 'waitForPose policy is invalid');
  }
  const feedbackRecord = feedback as Record<string, unknown>;
  const navigationRecord = navigation as Record<string, unknown>;
  const feedbackMode =
    feedbackRecord.mode === undefined
      ? 'scratchMirror'
      : requireString(feedbackRecord.mode, 'feedback.mode');
  if (!feedbackModes.has(feedbackMode)) {
    throw portError('K4-POSE-PORT-001', 'feedback.mode is unsupported');
  }
  const stepIndex = requireNumber(
    value.stepIndex ?? 0,
    'stepIndex',
    (number) => Number.isSafeInteger(number) && number >= 0,
  );
  const stepCount = requireNumber(
    value.stepCount ?? 1,
    'stepCount',
    (number) => Number.isSafeInteger(number) && number >= 1,
  );
  if (stepIndex >= stepCount) {
    throw portError('K4-POSE-PORT-001', 'stepIndex must be less than stepCount');
  }
  return {
    target: requireString(value.target, 'target'),
    pose: requireString(value.pose, 'pose'),
    stepIndex,
    stepCount,
    recognitionModel: requireString(value.recognitionModel, 'recognitionModel'),
    confidenceThreshold: requireNumber(
      recognition.confidenceThreshold,
      'confidenceThreshold',
      (number) => number >= 0 && number <= 1,
    ),
    fullConfidenceHoldSeconds: requireNumber(
      recognition.fullConfidenceHoldSeconds,
      'fullConfidenceHoldSeconds',
      (number) => number > 0,
    ),
    idleChargePerSecond: requireNumber(
      recognition.idleChargePerSecond,
      'idleChargePerSecond',
      (number) => number >= 0,
    ),
    idleSound:
      recognition.idleSound === null ? null : requireString(recognition.idleSound, 'idleSound'),
    chargeSound:
      recognition.chargeSound === null
        ? null
        : requireString(recognition.chargeSound, 'chargeSound'),
    feedbackMode,
    allowSkip:
      navigationRecord.allowSkip === undefined
        ? false
        : requireBoolean(navigationRecord.allowSkip, 'navigation.allowSkip'),
  };
}

function validateSelectionPayload(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.labels) || !isRecord(value.recognition)) {
    throw portError('K4-POSE-PORT-001', 'poseInputToChangeScene payload is invalid');
  }
  const labels = (value.labels as unknown[]).map((label) =>
    requireString(label, 'recognition label'),
  );
  if (labels.length === 0 || new Set(labels).size !== labels.length) {
    throw portError('K4-POSE-PORT-001', 'recognition labels must be non-empty and unique');
  }
  const recognition = value.recognition;
  const recognitionMode =
    value.recognitionMode === undefined
      ? 'pose'
      : requireString(value.recognitionMode, 'recognitionMode');
  if (!recognitionModes.has(recognitionMode)) {
    throw portError('K4-POSE-PORT-001', 'recognitionMode is unsupported');
  }
  return {
    labels,
    recognitionModel: requireString(value.recognitionModel, 'recognitionModel'),
    recognitionMode,
    accumulationPerSecond: requireNumber(
      recognition.accumulationPerSecond,
      'accumulationPerSecond',
      (number) => number >= 0,
    ),
    decayPerSecond: requireNumber(
      recognition.decayPerSecond,
      'decayPerSecond',
      (number) => number >= 0 && number <= 1,
    ),
    scoreThreshold: requireNumber(
      recognition.scoreThreshold,
      'scoreThreshold',
      (number) => number >= 0,
    ),
  };
}

function defaultSchedule(callback: () => void, delayMilliseconds: number) {
  const timer = setTimeout(callback, delayMilliseconds);
  return () => clearTimeout(timer);
}

/** Create the two mutually exclusive DSL 4.0 pose action methods. */
export function createDsl4PoseActionPort(options: {
  tmComposition: unknown;
  asyncInputComposition: unknown;
  getPoseModelLabels: (poseModel: string) => ReadonlyArray<string> | null;
  playSound?: (
    sound: string,
    options?: Readonly<{untilDone?: boolean}>,
  ) => unknown | Promise<unknown>;
  stopSound?: (sound: string) => unknown | Promise<unknown>;
  setBusy?: (
    payload: Readonly<{visible: boolean; source: string; label: string; cursor?: string}>,
  ) => unknown | Promise<unknown>;
  setCursor?: (
    payload: Readonly<{visible: boolean; source: string; cursor: string}>,
  ) => unknown | Promise<unknown>;
  ensureCameraStarted?: () => Promise<unknown>;
  /** Where `recognition.preview.position` puts the preview; the DSL 3.2 full stage by default. */
  previewPosition?: Dsl4PosePreviewPosition;
  onPoseState?: (
    event: Readonly<{
      phase: 'waiting' | 'charging' | 'completed' | 'cancelled';
      target: string;
      pose: string;
      stepIndex: number;
      confidence: number;
      progress: number;
    }>,
  ) => unknown;
  readPoseStateBinding?: () => Readonly<{confidence?: number; progress?: number}> | null;
  schedule?: (callback: () => void, delayMilliseconds: number) => () => void;
  now?: () => number;
}) {
  if (!isRecord(options)) throw new TypeError('pose action port options must be an object');
  const tmComposition = validateTMComposition(options.tmComposition);
  const asyncInput = validateAsyncInputComposition(options.asyncInputComposition);
  if (typeof options.getPoseModelLabels !== 'function') {
    throw new TypeError('getPoseModelLabels must be a function');
  }
  const getPoseModelLabels = options.getPoseModelLabels;
  const playSound = options.playSound ?? (() => undefined);
  const stopSound = options.stopSound ?? (() => undefined);
  const setBusy = options.setBusy;
  const setCursor = options.setCursor;
  const ensureCameraStarted = options.ensureCameraStarted;
  const onPoseState = options.onPoseState;
  const readPoseStateBinding = options.readPoseStateBinding;
  const schedule = options.schedule ?? defaultSchedule;
  const now = options.now ?? (() => performance.now());
  for (const [name, value] of Object.entries({playSound, stopSound, schedule, now})) {
    if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
  }
  if (onPoseState !== undefined && typeof onPoseState !== 'function') {
    throw new TypeError('onPoseState must be a function');
  }
  if (readPoseStateBinding !== undefined && typeof readPoseStateBinding !== 'function') {
    throw new TypeError('readPoseStateBinding must be a function');
  }

  if (setBusy !== undefined && typeof setBusy !== 'function') {
    throw new TypeError('setBusy must be a function');
  }
  if (setCursor !== undefined && typeof setCursor !== 'function') {
    throw new TypeError('setCursor must be a function');
  }
  if (ensureCameraStarted !== undefined && typeof ensureCameraStarted !== 'function') {
    throw new TypeError('ensureCameraStarted must be a function');
  }
  const previewPosition =
    options.previewPosition === undefined
      ? dsl4DefaultPosePreviewPosition
      : validateDsl4PosePreviewPosition(options.previewPosition, 'pose action preview position');

  let released = false;
  let activeSequence: null | {
    controller: AbortController;
    done: Promise<void>;
    finish: () => void;
  } = null;
  let currentSelection: null | {
    controller: AbortController;
    done: Promise<void>;
    finish: () => void;
    wake: null | (() => void);
    detach: () => void;
  } = null;
  let disposePromise: Promise<void> | null = null;
  let recognitionQueue: Promise<void> = Promise.resolve();
  let chargePlayback: null | {sound: string; operation: Promise<unknown>} = null;
  let poseCursorId = 0;
  const previewOwners = new Set();
  let sequencePreview: null | {signal: AbortSignal; owner: object; handleAbort: () => void} = null;

  function ensureAvailable() {
    if (released) throw portError('K4-POSE-PORT-005', 'pose action port has been released');
  }

  function claimPreview(owner: unknown) {
    previewOwners.add(owner);
    tmComposition.setPreviewPosition(previewPosition);
  }

  function showClaimedPreview(owner: unknown) {
    if (previewOwners.has(owner)) tmComposition.showPreview();
  }

  function releasePreview(owner: unknown) {
    previewOwners.delete(owner);
    if (previewOwners.size === 0) tmComposition.hidePreview();
  }

  function releaseSequencePreview(owner: object) {
    const lease = sequencePreview;
    if (!lease || lease.owner !== owner) return;
    sequencePreview = null;
    lease.signal.removeEventListener('abort', lease.handleAbort);
    releasePreview(owner);
  }

  function claimSequencePreview(signal: AbortSignal) {
    if (sequencePreview?.signal === signal) return sequencePreview.owner;
    if (sequencePreview) releaseSequencePreview(sequencePreview.owner);
    const owner = {};
    const handleAbort = () => releaseSequencePreview(owner);
    sequencePreview = {signal, owner, handleAbort};
    claimPreview(owner);
    signal.addEventListener('abort', handleAbort, {once: true});
    if (signal.aborted) handleAbort();
    return owner;
  }

  function publishPoseState(
    input: ReturnType<typeof validateSequencePayload>,
    phase: 'waiting' | 'charging' | 'completed' | 'cancelled',
    confidence: number,
    progress: number,
  ) {
    if (!onPoseState) return;
    const event = createDsl4PoseStateEvent({
      phase,
      target: input.target,
      pose: input.pose,
      stepIndex: input.stepIndex,
      confidence,
      progress,
    });
    try {
      Promise.resolve(onPoseState(event)).catch(() => {});
    } catch {
      // A non-authoritative observer cannot change pose execution semantics.
    }
  }

  function readPoseBinding() {
    if (!readPoseStateBinding) return null;
    try {
      return validatePoseStateBinding(readPoseStateBinding());
    } catch {
      // Invalid or failed bindings are ignored at the authoritative tick boundary.
      return null;
    }
  }

  function notifyCameraBusy(visible: boolean) {
    if (!setBusy) return;
    try {
      void Promise.resolve(
        setBusy(
          Object.freeze({
            visible,
            source: 'camera',
            label: 'Starting camera',
            cursor: 'wait',
          }),
        ),
      ).catch(() => {});
    } catch {
      // Busy indicators are non-authoritative and cannot change pose execution semantics.
    }
  }

  function notifyPoseCursor(visible: boolean, source: string = 'pose') {
    if (!setCursor) return;
    try {
      void Promise.resolve(
        setCursor(
          Object.freeze({
            visible,
            source,
            cursor: 'progress',
          }),
        ),
      ).catch(() => {});
    } catch {
      // Cursor styling is non-authoritative and cannot change pose execution semantics.
    }
  }

  /**
   * Start a sound without making pose recognition or input cancellation wait for audio playback.
   * Synchronous startup failures remain authoritative; later playback failures are contained because
   * an already-running pose step cannot safely be rolled back from an audio callback.
   */
  function startBackgroundSound(sound: string, playOptions?: Readonly<{untilDone?: boolean}>) {
    const operation = Promise.resolve(playSound(sound, playOptions));
    void operation.catch(() => {});
    return operation;
  }

  function requestSoundStop(sound: string) {
    try {
      void Promise.resolve(stopSound(sound)).catch(() => {});
    } catch {
      // Sound cleanup cannot delay or replace the pose action's terminal result.
    }
  }

  function startChargeSound(sound: string) {
    if (chargePlayback) return;
    const playback = {sound, operation: startBackgroundSound(sound, {untilDone: true})};
    chargePlayback = playback;
    void playback.operation.then(
      () => {
        if (chargePlayback === playback) chargePlayback = null;
      },
      () => {
        if (chargePlayback === playback) chargePlayback = null;
      },
    );
  }

  function stopChargeSound() {
    const playback = chargePlayback;
    if (!playback) return;
    chargePlayback = null;
    requestSoundStop(playback.sound);
  }

  async function withCameraBusy<T>(operation: () => T | Promise<T>) {
    notifyCameraBusy(true);
    try {
      return await operation();
    } finally {
      notifyCameraBusy(false);
    }
  }

  function requireKnownPoses(poseModel: string, poses: ReadonlyArray<string>) {
    if (!tmComposition.isPoseModelRegistered(poseModel)) {
      throw portError('K4-POSE-PORT-002', `Pose model is not registered: ${poseModel}`);
    }
    const labels = getPoseModelLabels(poseModel);
    if (!Array.isArray(labels)) {
      throw portError('K4-POSE-PORT-002', `Pose model labels are unavailable: ${poseModel}`);
    }
    for (const pose of poses) {
      if (!labels.includes(pose)) {
        throw portError('K4-POSE-PORT-003', `Unknown pose ${pose} in model ${poseModel}`);
      }
    }
  }

  function waitForAbortableOperation(
    operation: Promise<void>,
    signal: AbortSignal,
    message: string,
  ) {
    if (signal.aborted) return Promise.reject(abortError(message));
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => signal.removeEventListener('abort', handleAbort);
      const handleAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(abortError(message));
      };
      signal.addEventListener('abort', handleAbort, {once: true});
      operation.then(
        () => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(undefined);
        },
        (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        },
      );
      if (signal.aborted) handleAbort();
    });
  }

  /**
   * Serialize camera/model startup because TM does not accept an AbortSignal. Each caller may
   * stop waiting immediately while an already-started camera request remains shared by later steps.
   */
  function queueRecognition(
    recognitionModel: string,
    recognitionMode: string,
    signal: AbortSignal,
    {
      restart = false,
      configure = () => {},
      cancelMessage,
    }: {restart?: boolean; configure?: () => void; cancelMessage: string},
  ) {
    const operation = recognitionQueue
      .catch(() => {})
      .then(async () => {
        if (signal.aborted) throw abortError(cancelMessage);
        if (restart && tmComposition.isRecognizing()) tmComposition.stopRecognition();
        if (tmComposition.getActivePoseModelName() !== recognitionModel) {
          if (tmComposition.isRecognizing()) tmComposition.stopRecognition();
          tmComposition.activatePoseModel(recognitionModel);
        }
        configure();
        if (signal.aborted) throw abortError(cancelMessage);
        if (!tmComposition.isRecognizing()) {
          if (ensureCameraStarted) {
            await ensureCameraStarted();
            await tmComposition.startRecognition();
          } else {
            await withCameraBusy(() => tmComposition.startRecognition());
          }
        }
        if (signal.aborted) throw abortError(cancelMessage);
      });
    recognitionQueue = operation;
    return waitForAbortableOperation(operation, signal, cancelMessage);
  }

  function ensureRecognition(recognitionModel: string, signal: AbortSignal) {
    return queueRecognition(recognitionModel, 'pose', signal, {
      cancelMessage: 'pose action was cancelled',
    });
  }

  function startSelectionRecognition(
    input: ReturnType<typeof validateSelectionPayload>,
    signal: AbortSignal,
  ) {
    return queueRecognition(input.recognitionModel, input.recognitionMode, signal, {
      restart: true,
      cancelMessage: 'pose candidate wait was cancelled',
      configure() {
        tmComposition.configureAccumulatedPose({
          accumulationPerSecond: input.accumulationPerSecond,
          decayPerSecond: input.decayPerSecond,
          scoreThreshold: input.scoreThreshold,
        });
      },
    });
  }

  function waitForTick(signal: AbortSignal) {
    if (signal.aborted) return Promise.reject(abortError('pose sequence was cancelled'));
    return new Promise((resolve, reject) => {
      let cancel = () => {};
      const cleanup = () => {
        cancel();
        signal.removeEventListener('abort', handleAbort);
      };
      const handleAbort = () => {
        cleanup();
        reject(abortError('pose sequence was cancelled'));
      };
      signal.addEventListener('abort', handleAbort, {once: true});
      cancel = schedule(() => {
        cleanup();
        resolve(now());
      }, 100);
      if (typeof cancel !== 'function') {
        cleanup();
        reject(portError('K4-POSE-PORT-001', 'schedule must return a cancellation function'));
      }
    });
  }

  function createOperation(externalSignal: AbortSignal) {
    const controller = new AbortController();
    const completion = deferred();
    const forwardAbort = () => controller.abort(externalSignal.reason);
    externalSignal.addEventListener('abort', forwardAbort, {once: true});
    if (externalSignal.aborted) forwardAbort();
    return {
      controller,
      done: completion.promise,
      finish: completion.resolve,
      detach() {
        externalSignal.removeEventListener('abort', forwardAbort);
      },
    };
  }

  function waitForSequenceEnd(
    selection: ReturnType<typeof createOperation> & {wake: null | (() => void)},
  ) {
    if (!activeSequence) return Promise.resolve();
    const sequenceEnd: Promise<void> = new Promise((resolve, reject) => {
      const handleAbort = () => {
        selection.controller.signal.removeEventListener('abort', handleAbort);
        selection.wake = null;
        reject(abortError('pose candidate wait was cancelled'));
      };
      selection.wake = () => {
        selection.controller.signal.removeEventListener('abort', handleAbort);
        selection.wake = null;
        resolve();
      };
      selection.controller.signal.addEventListener('abort', handleAbort, {once: true});
      if (selection.controller.signal.aborted) handleAbort();
    });
    return sequenceEnd;
  }

  const port = {
    async waitForPose(payload: unknown, context: unknown) {
      ensureAvailable();
      const input = validateSequencePayload(payload);
      const {signal: externalSignal, actionSignal} = validateContext(context);
      if (externalSignal.aborted || actionSignal.aborted) {
        throw abortError('pose sequence was cancelled');
      }
      requireKnownPoses(input.recognitionModel, [input.pose]);
      if (activeSequence) {
        throw portError('K4-POSE-PORT-006', 'another Actor pose sequence is already active');
      }

      const operation = createOperation(externalSignal);
      activeSequence = operation;
      const previewOwner = claimSequencePreview(actionSignal);
      const displacedSelection = currentSelection;
      displacedSelection?.controller.abort('actor-sequence-priority');
      let confidence = 0;
      let progress = 0;
      let statePublished = false;
      let terminalPhase = 'cancelled' as 'completed' | 'cancelled';
      try {
        publishPoseState(input, 'waiting', confidence, progress);
        statePublished = true;
        notifyPoseCursor(true, 'pose-sequence');
        if (displacedSelection) await displacedSelection.done;
        await ensureRecognition(input.recognitionModel, operation.controller.signal);
        showClaimedPreview(previewOwner);
        if (input.idleSound) startBackgroundSound(input.idleSound);
        if (operation.controller.signal.aborted) throw abortError('pose sequence was cancelled');
        let previousTime = now();
        while (progress < 1) {
          const timestamp = (await waitForTick(operation.controller.signal)) as number;
          const elapsedSeconds = Math.max(0, (timestamp - previousTime) / 1000);
          previousTime = timestamp;
          const binding = input.feedbackMode === 'scratchBinding' ? readPoseBinding() : null;
          const measuredConfidence = Number(tmComposition.confidenceOf(input.pose));
          if (
            !Number.isFinite(measuredConfidence) ||
            measuredConfidence < 0 ||
            measuredConfidence > 1
          ) {
            throw portError('K4-POSE-PORT-007', 'TM returned an invalid confidence');
          }
          confidence = binding?.confidence ?? measuredConfidence;
          progress = binding?.progress ?? progress;
          if (confidence >= input.confidenceThreshold) {
            progress += (confidence / input.fullConfidenceHoldSeconds) * elapsedSeconds;
            if (input.chargeSound) startChargeSound(input.chargeSound);
          } else {
            progress += input.idleChargePerSecond * elapsedSeconds;
          }
          progress = Math.min(1, progress);
          publishPoseState(
            input,
            confidence >= input.confidenceThreshold ? 'charging' : 'waiting',
            confidence,
            progress,
          );
        }
        terminalPhase = 'completed';
      } finally {
        const continuesToNextStep =
          input.stepIndex + 1 < input.stepCount &&
          (terminalPhase === 'completed' || (externalSignal.aborted && !actionSignal.aborted));
        if (!continuesToNextStep) releaseSequencePreview(previewOwner);
        if (statePublished) {
          statePublished = false;
          publishPoseState(input, terminalPhase, confidence, progress);
          notifyPoseCursor(false, 'pose-sequence');
        }
        if (input.idleSound) requestSoundStop(input.idleSound);
        if (!continuesToNextStep) stopChargeSound();
        operation.detach();
        if (activeSequence === operation) activeSequence = null;
        operation.finish();
        currentSelection?.wake?.();
      }
    },

    async poseInputToChangeScene(payload: unknown, context: unknown) {
      ensureAvailable();
      const input = validateSelectionPayload(payload);
      const {signal: externalSignal} = validateContext(context);
      if (externalSignal.aborted) throw abortError('pose candidate wait was cancelled');
      requireKnownPoses(input.recognitionModel, input.labels);

      const operation = Object.assign(createOperation(externalSignal), {wake: null}) as ReturnType<
        typeof createOperation
      > & {wake: null | (() => void)};
      const previousSelection = currentSelection;
      claimPreview(operation);
      previousSelection?.controller.abort('newer-pose-candidate-wait');
      currentSelection = operation;
      poseCursorId += 1;
      const cursorSource = `pose-selection-${poseCursorId}`;
      notifyPoseCursor(true, cursorSource);
      try {
        if (previousSelection) await previousSelection.done;
        await waitForSequenceEnd(operation);
        if (operation.controller.signal.aborted) {
          throw abortError('pose candidate wait was cancelled');
        }
        await startSelectionRecognition(input, operation.controller.signal);
        showClaimedPreview(operation);
        const selected = await asyncInput.waitForPoseCandidate({
          candidates: input.labels,
          signal: operation.controller.signal,
        });
        if (operation.controller.signal.aborted) {
          throw abortError('pose candidate wait was cancelled');
        }
        // The Async Input extension answers with whatever label it chose; this is the check.
        if (!(input.labels as readonly unknown[]).includes(selected)) {
          throw portError(
            'K4-POSE-PORT-008',
            `Async Input returned an unknown recognition label: ${selected}`,
          );
        }
        return selected;
      } finally {
        releasePreview(operation);
        notifyPoseCursor(false, cursorSource);
        operation.detach();
        operation.wake = null;
        if (currentSelection === operation) currentSelection = null;
        operation.finish();
      }
    },

    imageInputToChangeScene(payload: unknown, context: unknown) {
      if (!isRecord(payload)) {
        throw portError('K4-POSE-PORT-001', 'imageInputToChangeScene payload is invalid');
      }
      return port.poseInputToChangeScene({...payload, recognitionMode: 'image'}, context);
    },

    dispose() {
      if (disposePromise) return disposePromise;
      released = true;
      const sequence = activeSequence;
      const selection = currentSelection;
      sequence?.controller.abort('pose-port-dispose');
      selection?.controller.abort('pose-port-dispose');
      selection?.wake?.();
      stopChargeSound();
      if (sequencePreview) releaseSequencePreview(sequencePreview.owner);
      disposePromise = Promise.all([sequence?.done, selection?.done].filter(Boolean)).then(
        () => undefined,
      );
      return disposePromise;
    },
  };

  return Object.freeze(port);
}
