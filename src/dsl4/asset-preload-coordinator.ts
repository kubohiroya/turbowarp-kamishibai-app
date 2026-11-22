import {createDsl4AssetDependencyIndex} from './asset-dependency-index.js';

function sortedUnique(values: Iterable<string>) {
  return [...new Set(values)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

/** Give a lifecycle failure a stable error code without hiding a code it already carries. */
export function lifecycleError(error: unknown, fallbackCode: string, fallbackMessage: string) {
  const errorRecord =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};
  if (typeof errorRecord.code === 'string') return error;
  const wrapped = new Error(
    error instanceof Error && error.message ? error.message : fallbackMessage,
    {
      cause: error,
    },
  );
  Object.defineProperty(wrapped, 'code', {value: fallbackCode});
  return wrapped;
}

function validateLifecycle(lifecycle: unknown) {
  const candidate =
    typeof lifecycle === 'object' && lifecycle !== null
      ? (lifecycle as Record<string, unknown>)
      : {};
  if (
    typeof candidate.prepare !== 'function' ||
    typeof candidate.setLoading !== 'function' ||
    typeof candidate.releaseAssets !== 'function' ||
    typeof candidate.release !== 'function'
  ) {
    throw new TypeError(
      'assetLifecycle must provide prepare, setLoading, releaseAssets, and release methods',
    );
  }
  return lifecycle as Dsl4AssetPreloadLifecycle;
}

export interface Dsl4SceneAssetCoordinator {
  prepareStartup(generation: number): Promise<Readiness>;
  beginScene(sceneId: string, generation: number): void;
  waitForScene(sceneId: string): Promise<Readiness>;
  commitScene(sceneId: string, reason: string): Promise<void | Readonly<{cleanupError: unknown}>>;
  cancel(reason: string): void;
  release(reason: string): Promise<unknown>;
}

export interface Dsl4AssetPreloadLifecycle {
  readonly sceneCoordinator?: Dsl4SceneAssetCoordinator;
  prepare(
    payload: Readonly<Record<string, unknown>>,
    context: Readonly<{signal: AbortSignal; generation: number; sceneId: string | null}>,
  ): unknown;
  setLoading(
    payload: Readonly<Record<string, unknown>>,
    context: Readonly<{signal: AbortSignal; generation: number; sceneId: string | null}>,
  ): unknown;
  releaseAssets(
    payload: Readonly<{assetIds: readonly string[]; reason: string; sceneId: string | null}>,
  ): unknown;
  release(payload: Readonly<{reason: string}>): unknown;
}

export type Readiness =
  | Readonly<{ok: true; prepared: boolean}>
  | Readonly<{ok: false; cancelled: true}>
  | Readonly<{ok: false; cancelled: false; error: unknown}>;

export interface Preparation {
  token: number;
  phase: 'startup' | 'scene';
  sceneId: string | null;
  generation: number;
  assetIds: ReadonlyArray<string>;
  abortController: AbortController;
  status: 'pending' | 'ready' | 'failed';
  promise: Promise<void>;
  waitPromise: Promise<Readiness> | null;
  error: unknown;
}

/** Coordinate preparation timing without knowing how any asset kind is decoded or registered. */
export function createDsl4AssetPreloadCoordinator({
  storyDocument,
  lifecycle,
  onEvent,
  excludedStartupAssetIds = [],
  persistentAssetIds = [],
}: {
  storyDocument: Readonly<Record<string, unknown>>;
  lifecycle: unknown;
  onEvent: (type: string, details: Record<string, unknown>) => void;
  excludedStartupAssetIds?: ReadonlyArray<string>;
  persistentAssetIds?: ReadonlyArray<string>;
}) {
  const port = validateLifecycle(lifecycle);
  if (typeof onEvent !== 'function')
    throw new TypeError('asset preload onEvent must be a function');
  const index = createDsl4AssetDependencyIndex(storyDocument);
  if (
    !Array.isArray(excludedStartupAssetIds) ||
    excludedStartupAssetIds.some((id) => typeof id !== 'string')
  ) {
    throw new TypeError('excludedStartupAssetIds must contain strings');
  }
  if (
    !Array.isArray(persistentAssetIds) ||
    persistentAssetIds.some((id) => typeof id !== 'string')
  ) {
    throw new TypeError('persistentAssetIds must contain strings');
  }
  const excludedStartup = new Set(excludedStartupAssetIds);
  const startupAssetIds = sortedUnique([...index.startup, ...index.cover, ...index.actors]).filter(
    (assetId) => !excludedStartup.has(assetId),
  );
  const startupLoadingAssetIds = index.loading.filter((assetId) => !excludedStartup.has(assetId));
  const startupContentAssetIds = startupAssetIds.filter(
    (assetId) => !startupLoadingAssetIds.includes(assetId),
  );
  const sceneRetainedAssetIds = new Set(index.sceneRetained);
  const persistentSceneAssetIds = new Set([
    ...index.loading,
    ...index.actors,
    ...index.posePreviewControls,
    ...persistentAssetIds,
  ]);
  const loading = storyDocument.loading ?? null;
  let current: Preparation | null = null;
  let nextToken = 1;
  let releasePromise = Promise.resolve();
  let cleanupPromise = Promise.resolve();
  let cleanupErrors: unknown[] = [];
  let committedRequiredAssetIds = new Set([...index.cover, ...index.loading, ...index.actors]);
  /** Recognition models loading in the background for the scene that started them. */
  const background = new Map<string, {sceneId: string; controller: AbortController}>();

  function scheduleAssetRelease(
    assetIds: ReadonlyArray<string>,
    reason: string,
    sceneId: string | null,
  ) {
    const selected = sortedUnique(assetIds);
    if (selected.length === 0) return cleanupPromise;
    cleanupPromise = cleanupPromise.then(async () => {
      try {
        await port.releaseAssets(Object.freeze({assetIds: selected, reason, sceneId}));
        onEvent('assets.release', {assetIds: selected, reason, sceneId});
      } catch (error) {
        cleanupErrors.push(error);
      }
    });
    return cleanupPromise;
  }

  function takeCleanupFailure(message: string) {
    if (cleanupErrors.length === 0) return null;
    const errors = cleanupErrors;
    cleanupErrors = [];
    return new AggregateError(errors, message);
  }

  function context(preparation: Preparation) {
    return Object.freeze({
      signal: preparation.abortController.signal,
      generation: preparation.generation,
      sceneId: preparation.sceneId,
    });
  }

  function invokePrepare(preparation: Preparation, payload: Record<string, unknown>) {
    let operation;
    try {
      operation = port.prepare(Object.freeze(payload), context(preparation));
    } catch (error) {
      operation = Promise.reject(error);
    }
    const operationPromise = Promise.resolve(operation).then(
      () => {
        preparation.status = 'ready';
      },
      (error) => {
        preparation.status = 'failed';
        preparation.error = error;
        throw error;
      },
    );
    void operationPromise.catch(() => {});
    let rejectAborted: (reason?: unknown) => void = () => {};
    const abortedPromise = new Promise((_resolve, reject) => {
      rejectAborted = reject;
    });
    const handleAbort = () => {
      const error = new Error('Asset preparation was cancelled');
      error.name = 'AbortError';
      rejectAborted(error);
    };
    preparation.abortController.signal.addEventListener('abort', handleAbort, {once: true});
    preparation.promise = Promise.race([operationPromise, abortedPromise])
      .then(() => undefined)
      .finally(() => {
        preparation.abortController.signal.removeEventListener('abort', handleAbort);
      });
    void preparation.promise.catch(() => {});
  }

  function cancelCurrent(reason: string) {
    const preparation = current;
    if (!preparation) return;
    preparation.abortController.abort(reason);
    current = null;
    if (preparation.phase === 'scene') {
      scheduleAssetRelease(
        preparation.assetIds.filter(
          (assetId) =>
            sceneRetainedAssetIds.has(assetId) && !committedRequiredAssetIds.has(assetId),
        ),
        reason,
        preparation.sceneId,
      );
    }
  }

  async function prepareStartup(generation: number) {
    cancelCurrent('startup-replaced');
    const preparation: Preparation = {
      token: nextToken++,
      phase: 'startup',
      sceneId: null,
      generation,
      assetIds: startupAssetIds,
      abortController: new AbortController(),
      status: 'pending',
      promise: Promise.resolve(),
      waitPromise: null,
      error: null,
    };
    current = preparation;
    let loadingVisible = false;
    try {
      await releasePromise;
      if (current !== preparation || preparation.abortController.signal.aborted) {
        return Object.freeze({ok: false, cancelled: true});
      }
      onEvent('assets.startup.start', {assetIds: startupAssetIds});
      if (startupLoadingAssetIds.length > 0) {
        await port.setLoading(
          Object.freeze({visible: true, sceneId: null, loading: null, phase: 'startup'}),
          context(preparation),
        );
        loadingVisible = true;
        onEvent('assets.loading.show', {sceneId: null, phase: 'startup-bootstrap'});
        invokePrepare(preparation, {
          phase: 'startup',
          sceneId: null,
          assetIds: startupLoadingAssetIds,
        });
        await preparation.promise;
        await port.setLoading(
          Object.freeze({visible: false, sceneId: null, loading: null, phase: 'startup'}),
          context(preparation),
        );
        loadingVisible = false;
        onEvent('assets.loading.hide', {sceneId: null, phase: 'startup-bootstrap'});
      }
      if (startupContentAssetIds.length > 0) {
        await port.setLoading(
          Object.freeze({visible: true, sceneId: null, loading, phase: 'startup'}),
          context(preparation),
        );
        loadingVisible = true;
        onEvent('assets.loading.show', {sceneId: null, phase: 'startup'});
        invokePrepare(preparation, {
          phase: 'startup',
          sceneId: null,
          assetIds: startupContentAssetIds,
        });
        await preparation.promise;
        await port.setLoading(
          Object.freeze({visible: false, sceneId: null, loading, phase: 'startup'}),
          context(preparation),
        );
        loadingVisible = false;
        onEvent('assets.loading.hide', {sceneId: null, phase: 'startup'});
      }
      if (startupAssetIds.length === 0) {
        invokePrepare(preparation, {phase: 'startup', sceneId: null, assetIds: []});
        await preparation.promise;
      }
      if (current !== preparation || preparation.abortController.signal.aborted) {
        return Object.freeze({ok: false, cancelled: true});
      }
      current = null;
      onEvent('assets.startup.ready', {assetIds: startupAssetIds});
      return Object.freeze({ok: true, prepared: true});
    } catch (error) {
      if (loadingVisible) {
        try {
          await port.setLoading(
            Object.freeze({visible: false, sceneId: null, loading, phase: 'startup'}),
            context(preparation),
          );
          onEvent('assets.loading.hide', {sceneId: null, phase: 'startup-error'});
        } catch (hideError) {
          error = new AggregateError(
            [error, hideError],
            'Asset startup and Loading cleanup failed',
          );
        }
      }
      if (current === preparation) current = null;
      if (preparation.abortController.signal.aborted) {
        return Object.freeze({ok: false, cancelled: true});
      }
      return Object.freeze({
        ok: false,
        cancelled: false,
        error: lifecycleError(error, 'K4-ASSET-STARTUP-001', 'Asset startup preparation failed'),
      });
    }
  }

  /** Stop background loads the next scene does not need, and release what they already made. */
  function stopBackground(keep: ReadonlySet<string>, reason: string) {
    for (const [assetId, entry] of background) {
      if (keep.has(assetId)) continue;
      background.delete(assetId);
      entry.controller.abort(reason);
      if (!committedRequiredAssetIds.has(assetId)) {
        void scheduleAssetRelease([assetId], reason, entry.sceneId);
      }
    }
  }

  /**
   * Start loading a scene's recognition models without holding up the scene. A recognition action
   * waits for its model through {@link waitForSceneAsset}, and only while it is still loading.
   */
  function startBackground(sceneId: string, generation: number, assetIds: ReadonlyArray<string>) {
    stopBackground(new Set(assetIds), 'scene-superseded');
    for (const assetId of assetIds) {
      if (background.has(assetId)) continue;
      const controller = new AbortController();
      const entry = {sceneId, controller};
      background.set(assetId, entry);
      onEvent('assets.background.start', {sceneId, assetIds: [assetId]});
      let operation;
      try {
        operation = port.prepare(
          Object.freeze({phase: 'scene', sceneId, assetIds: [assetId]}),
          Object.freeze({signal: controller.signal, generation, sceneId}),
        );
      } catch (error) {
        operation = Promise.reject(error);
      }
      void Promise.resolve(operation).then(
        () => {
          if (background.get(assetId) !== entry) return;
          background.delete(assetId);
          onEvent('assets.background.ready', {sceneId, assetIds: [assetId]});
        },
        (error) => {
          if (background.get(assetId) !== entry) return;
          background.delete(assetId);
          // The recognition action that needs the model reports the failure when it waits.
          onEvent('assets.background.error', {
            sceneId,
            assetIds: [assetId],
            message: error instanceof Error ? error.message : String(error),
          });
        },
      );
    }
  }

  /**
   * Wait until a scene asset loaded in the background is ready. Returns at once when it already is;
   * joins the background load while it is still running; loads it now if nothing started it.
   */
  async function waitForSceneAsset(
    sceneId: string,
    assetId: string,
    generation: number,
    signal: AbortSignal,
  ): Promise<Readiness> {
    const waiting = background.has(assetId);
    if (waiting) onEvent('assets.background.wait.start', {sceneId, assetIds: [assetId]});
    try {
      await port.prepare(
        Object.freeze({phase: 'scene', sceneId, assetIds: [assetId]}),
        Object.freeze({signal, generation, sceneId}),
      );
      return Object.freeze({ok: true, prepared: true});
    } catch (error) {
      if (signal.aborted) return Object.freeze({ok: false, cancelled: true});
      return Object.freeze({
        ok: false,
        cancelled: false,
        error: lifecycleError(
          error,
          'K4-ASSET-PREPARE-001',
          `Recognition model ${assetId} could not be prepared`,
        ),
      });
    } finally {
      if (waiting) onEvent('assets.background.wait.end', {sceneId, assetIds: [assetId]});
    }
  }

  function beginScene(sceneId: string, generation: number) {
    cancelCurrent('scene-superseded');
    const scene = index.scenes[sceneId];
    if (!scene) throw new TypeError(`Unknown asset dependency scene: ${sceneId}`);
    const preparation: Preparation = {
      token: nextToken++,
      phase: 'scene',
      sceneId,
      generation,
      assetIds: scene.lazy,
      abortController: new AbortController(),
      status: scene.lazy.length === 0 ? 'ready' : 'pending',
      promise: Promise.resolve(),
      waitPromise: null,
      error: null,
    };
    current = preparation;
    onEvent('assets.preload.start', {sceneId, assetIds: scene.lazy});
    if (scene.lazy.length > 0) {
      invokePrepare(preparation, {phase: 'scene', sceneId, assetIds: scene.lazy});
    }
    startBackground(sceneId, generation, scene.background);
  }

  async function waitForScene(sceneId: string): Promise<Readiness> {
    const preparation = current;
    if (!preparation || preparation.phase !== 'scene' || preparation.sceneId !== sceneId) {
      return Object.freeze({ok: true, prepared: false});
    }
    if (!preparation.waitPromise) {
      preparation.waitPromise = (async () => {
        await Promise.resolve();
        if (current !== preparation || preparation.abortController.signal.aborted) {
          return Object.freeze({ok: false, cancelled: true});
        }

        let loadingVisible = false;
        let failure = null;
        if (preparation.status === 'pending') {
          try {
            await port.setLoading(
              Object.freeze({visible: true, sceneId, loading}),
              context(preparation),
            );
            if (current !== preparation || preparation.abortController.signal.aborted) {
              return Object.freeze({ok: false, cancelled: true});
            }
            loadingVisible = true;
            onEvent('assets.loading.show', {sceneId});
          } catch (error) {
            failure = error;
          }
        }
        if (!failure) {
          try {
            await preparation.promise;
          } catch (error) {
            failure = error;
          }
        }
        if (loadingVisible) {
          try {
            await port.setLoading(
              Object.freeze({visible: false, sceneId, loading}),
              context(preparation),
            );
            if (current === preparation && !preparation.abortController.signal.aborted) {
              onEvent('assets.loading.hide', {sceneId});
            }
          } catch (error) {
            failure ??= error;
          }
        }
        if (current !== preparation || preparation.abortController.signal.aborted) {
          return Object.freeze({ok: false, cancelled: true});
        }
        current = null;
        if (failure) {
          await scheduleAssetRelease(
            preparation.assetIds.filter(
              (assetId) =>
                sceneRetainedAssetIds.has(assetId) && !committedRequiredAssetIds.has(assetId),
            ),
            'scene-prepare-failed',
            sceneId,
          );
          const cleanupError = takeCleanupFailure(
            'Scene preparation cleanup could not release one or more assets',
          );
          if (cleanupError) {
            failure = new AggregateError(
              [failure, cleanupError],
              'Scene asset preparation and cleanup failed',
            );
          }
          return Object.freeze({
            ok: false,
            cancelled: false,
            error: lifecycleError(
              failure,
              'K4-ASSET-PREPARE-001',
              'Scene asset preparation failed',
            ),
          });
        }
        onEvent('assets.scene.ready', {sceneId, assetIds: preparation.assetIds});
        return Object.freeze({ok: true, prepared: true});
      })() as Promise<Readiness>;
    }
    return preparation.waitPromise;
  }

  async function commitScene(sceneId: string, reason: string) {
    const scene = index.scenes[sceneId];
    if (!scene) throw new TypeError(`Unknown asset dependency scene: ${sceneId}`);
    try {
      await cleanupPromise;
      const pendingFailure = takeCleanupFailure(
        'A superseded scene could not release one or more assets',
      );
      if (pendingFailure) throw pendingFailure;
      const required = new Set([...persistentSceneAssetIds, ...scene.all]);
      const releaseAssetIds = index.sceneRetained.filter((assetId) => !required.has(assetId));
      await scheduleAssetRelease(releaseAssetIds, reason, sceneId);
      const releaseFailure = takeCleanupFailure(
        'The previous scene could not release one or more assets',
      );
      if (releaseFailure) throw releaseFailure;
      committedRequiredAssetIds = required;
    } catch (error) {
      throw lifecycleError(error, 'K4-ASSET-RELEASE-001', 'Scene-retained asset release failed');
    }
  }

  function release(reason: string) {
    cancelCurrent(reason);
    for (const entry of background.values()) entry.controller.abort(reason);
    background.clear();
    releasePromise = releasePromise
      .catch(() => {})
      .then(async () => {
        await cleanupPromise;
        const errors = cleanupErrors;
        cleanupErrors = [];
        try {
          await port.release(Object.freeze({reason}));
        } catch (error) {
          errors.push(error);
        }
        if (errors.length > 0) {
          throw new AggregateError(errors, 'One or more asset lifecycle releases failed');
        }
      });
    void releasePromise.catch(() => {});
    return releasePromise;
  }

  return Object.freeze({
    prepareStartup,
    beginScene,
    waitForScene,
    commitScene,
    waitForSceneAsset,
    cancel: cancelCurrent,
    release,
  });
}
