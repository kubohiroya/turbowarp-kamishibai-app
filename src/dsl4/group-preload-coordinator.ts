import {createDsl4AssetDependencyIndex} from './asset-dependency-index.js';
import {
  createDsl4AssetGroupLifecycle,
  createDsl4DefaultAssetGroups,
} from './asset-group-lifecycle.js';
import {
  lifecycleError,
  type Dsl4AssetPreloadLifecycle,
  type Readiness,
} from './asset-preload-coordinator.js';

/** Give the controller timing authority while groups exclusively own materialized assets. */
export function createDsl4GroupPreloadCoordinator({
  storyDocument,
  segmentId,
  lifecycle,
  excludedStartupAssetIds = [],
  persistentAssetIds = [],
  onEvent = () => {},
}: {
  storyDocument: Readonly<Record<string, unknown>>;
  segmentId: string;
  excludedStartupAssetIds?: readonly string[];
  persistentAssetIds?: readonly string[];
  lifecycle: Dsl4AssetPreloadLifecycle;
  onEvent?: (type: string, details: Record<string, unknown>) => void;
}) {
  const prefix = `segment:${segmentId}`;
  const index = createDsl4AssetDependencyIndex(storyDocument);
  // Recognition models load in the background beside the scene groups, so a scene never waits for
  // them at its entry: the coordinator owns them itself, outside the group lifecycle.
  const backgroundAssetIds = new Set(
    Object.values(index.scenes).flatMap((scene) => scene.background),
  );
  const definitions = createDsl4DefaultAssetGroups(storyDocument, segmentId).map((group) => ({
    ...group,
    assetIds: group.id.startsWith(`${prefix}:scene:`)
      ? group.assetIds.filter((id) => !backgroundAssetIds.has(id))
      : group.id === `${prefix}:shared`
        ? group.assetIds.filter((id) => !excludedStartupAssetIds.includes(id))
        : group.id.startsWith(`${prefix}:retained:`)
          ? [
              ...new Set([
                ...group.assetIds,
                ...(index.scenes[group.id.slice(`${prefix}:retained:`.length)]?.all.filter((id) =>
                  persistentAssetIds.includes(id),
                ) ?? []),
              ]),
            ]
          : group.assetIds,
  }));
  const loadingAssetIds = index.loading.filter((id) => !excludedStartupAssetIds.includes(id));
  definitions.push({
    id: `${prefix}:loading`,
    scope: 'shared',
    assetIds: [...loadingAssetIds],
    dependencies: [],
  });
  let groups = createDsl4AssetGroupLifecycle({groups: definitions, lifecycle});
  let committed = new Set<string>();
  type Preparation = {
    phase: 'startup' | 'scene';
    sceneId: string | null;
    abort: AbortController;
    promise: Promise<Readiness>;
  };
  let pending: Preparation | null = null;
  let cleanup = Promise.resolve();
  let releasing: Promise<void> | null = null;
  let releaseRequired = false;
  const context = (signal: AbortSignal, generation: number, sceneId: string | null) => ({
    signal,
    generation,
    sceneId,
  });
  const freshContext = () => context(new AbortController().signal, 0, null);
  function reportCleanupError(error: unknown, sceneId: string | null) {
    if (!error) return;
    try {
      onEvent('assets.cleanup.error', {
        sceneId,
        message: error instanceof Error ? error.message : String(error),
        pendingReleaseAssetIds: groups.snapshot().pendingReleaseAssetIds,
      });
    } catch {
      // Diagnostic observers cannot turn a committed ownership change into a runtime failure.
    }
  }
  function cancel(reason: string) {
    const previous = pending;
    if (!previous) return;
    previous.abort.abort(reason);
    pending = null;
    const owner = groups;
    cleanup = cleanup.then(async () => {
      await previous.promise;
      // Full disposal owns cleanup while closing; a replacement manager owns a new session.
      if (releaseRequired || owner !== groups) return;
      const result = await owner.replaceGroups([...committed], freshContext());
      reportCleanupError(result.cleanupError, previous.sceneId);
    });
    void cleanup.catch(() => {});
  }
  async function withLoading<T>(
    operation: () => Promise<T>,
    ctx: ReturnType<typeof context>,
    loading = storyDocument.loading ?? null,
  ): Promise<T> {
    try {
      await lifecycle.setLoading({visible: true, sceneId: ctx.sceneId, loading}, ctx);
      onEvent('assets.loading.show', {sceneId: ctx.sceneId});
      return await operation();
    } finally {
      await lifecycle.setLoading({visible: false, sceneId: ctx.sceneId, loading}, ctx);
      onEvent('assets.loading.hide', {sceneId: ctx.sceneId});
    }
  }
  type BackgroundLoad = {sceneId: string; abort: AbortController; promise: Promise<void>};
  // Recognition models loading in the background, and those already loaded, by asset id.
  const background = new Map<string, BackgroundLoad>();
  const loadedBackground = new Map<string, string>();
  /** Identifies the latest scene to start background loads, so a stale one starts no prefetch. */
  let backgroundToken = 0;
  function prepareBackground(
    sceneId: string,
    assetId: string,
    ctx: ReturnType<typeof context>,
  ): Promise<void> {
    try {
      return Promise.resolve(
        lifecycle.prepare(Object.freeze({phase: 'scene', sceneId, assetIds: [assetId]}), ctx),
      ).then(() => {});
    } catch (error) {
      return Promise.reject(error);
    }
  }
  function releaseBackground(assetIds: readonly string[], reason: string, sceneId: string | null) {
    if (!assetIds.length) return;
    cleanup = cleanup.then(async () => {
      try {
        await lifecycle.releaseAssets(Object.freeze({assetIds: [...assetIds], reason, sceneId}));
      } catch (error) {
        reportCleanupError(error, sceneId);
      }
    });
    void cleanup.catch(() => {});
  }
  /** Stop the background loads a scene does not need; loaded models stay until the scene commits. */
  function stopBackground(keep: ReadonlySet<string>, reason: string) {
    const stopped: string[] = [];
    for (const [assetId, load] of background) {
      if (keep.has(assetId)) continue;
      background.delete(assetId);
      load.abort.abort(reason);
      stopped.push(assetId);
    }
    releaseBackground(stopped, reason, null);
  }
  /** Load one recognition model in the background, or join its load if one is running. */
  function loadBackground(
    sceneId: string,
    generation: number,
    assetId: string,
    prefetch: boolean,
  ): Promise<void> {
    if (loadedBackground.has(assetId)) return Promise.resolve();
    const running = background.get(assetId);
    if (running) return running.promise.catch(() => {});
    const abort = new AbortController();
    const load: BackgroundLoad = {sceneId, abort, promise: Promise.resolve()};
    background.set(assetId, load);
    onEvent('assets.background.start', {sceneId, assetIds: [assetId], prefetch});
    load.promise = prepareBackground(sceneId, assetId, context(abort.signal, generation, sceneId));
    return load.promise.then(
      () => {
        if (background.get(assetId) !== load) return;
        background.delete(assetId);
        loadedBackground.set(assetId, sceneId);
        onEvent('assets.background.ready', {sceneId, assetIds: [assetId], prefetch});
      },
      (error) => {
        if (background.get(assetId) !== load) return;
        background.delete(assetId);
        // The recognition action that needs the model reports the failure when it waits.
        onEvent('assets.background.error', {
          sceneId,
          assetIds: [assetId],
          prefetch,
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
  }
  /**
   * Start loading a scene's recognition models without holding up the scene. Once they have
   * settled, the models of the scenes it can move to next load too.
   */
  function startBackground(sceneId: string, generation: number) {
    const scene = index.scenes[sceneId];
    const own = scene?.background ?? [];
    const prefetch = scene?.prefetch ?? [];
    stopBackground(new Set([...own, ...prefetch]), 'scene-superseded');
    const token = ++backgroundToken;
    const loads = own.map((assetId) => loadBackground(sceneId, generation, assetId, false));
    void Promise.all(loads).then(() => {
      if (token !== backgroundToken) return;
      for (const assetId of prefetch) void loadBackground(sceneId, generation, assetId, true);
    });
  }
  /** Release loaded models that neither the committed scene nor the scenes after it use. */
  function commitBackground(sceneId: string) {
    const scene = index.scenes[sceneId];
    const keep = new Set([...(scene?.background ?? []), ...(scene?.prefetch ?? [])]);
    const unused = [...loadedBackground.keys()].filter((assetId) => !keep.has(assetId));
    for (const assetId of unused) loadedBackground.delete(assetId);
    releaseBackground(unused, 'scene-committed', sceneId);
  }
  function release(reason: string) {
    if (releasing) return releasing;
    releaseRequired = true;
    cancel(reason);
    for (const load of background.values()) load.abort.abort(reason);
    background.clear();
    loadedBackground.clear();
    backgroundToken += 1;
    releasing = (async () => {
      const errors: unknown[] = [];
      try {
        await cleanup;
      } catch (error) {
        errors.push(error);
      }
      // A reported queue failure must not poison a later explicit cleanup retry.
      cleanup = Promise.resolve();
      try {
        await groups.dispose();
      } catch (error) {
        errors.push(error);
      }
      try {
        await lifecycle.release({reason});
      } catch (error) {
        errors.push(error);
      }
      if (errors.length) throw new AggregateError(errors, 'Asset group coordinator cleanup failed');
      committed = new Set();
      groups = createDsl4AssetGroupLifecycle({groups: definitions, lifecycle});
      cleanup = Promise.resolve();
      releaseRequired = false;
    })().finally(() => {
      releasing = null;
    });
    // Controller stop/finish does not await cleanup; explicit owners still receive the rejection.
    void releasing.catch(() => {});
    return releasing;
  }
  return Object.freeze({
    prepareStartup(generation: number): Promise<Readiness> {
      // Start cleanup before publishing the candidate so release cannot cancel itself.
      const releaseWait =
        releaseRequired && !releasing ? release('startup-cleanup-retry') : releasing;
      cancel('startup-replaced');
      // Later cancellation can append a cleanup that waits for this candidate itself.
      const cleanupWait = cleanup;
      const abort = new AbortController();
      const candidate: Preparation = {
        phase: 'startup',
        sceneId: null,
        abort,
        promise: Promise.resolve({ok: true, prepared: false}),
      };
      pending = candidate;
      candidate.promise = (async (): Promise<Readiness> => {
        try {
          await releaseWait;
          await cleanupWait;
          if (abort.signal.aborted) return {ok: false, cancelled: true};
          const ctx = context(abort.signal, generation, null);
          // Bootstrap loading artwork before asking the presenter to use its URLs.
          if (loadingAssetIds.length) {
            await withLoading(() => groups.prepareGroup(`${prefix}:loading`, ctx), ctx, null);
          }
          const result = await withLoading(
            () => groups.replaceGroups([...committed, `${prefix}:startup`], ctx),
            ctx,
          );
          reportCleanupError(result.cleanupError, null);
          if (abort.signal.aborted) return {ok: false, cancelled: true};
          committed.add(`${prefix}:startup`);
          if (pending === candidate) pending = null;
          onEvent('assets.startup.ready', {});
          return {ok: true, prepared: true};
        } catch (error) {
          if (pending === candidate) pending = null;
          return abort.signal.aborted
            ? {ok: false, cancelled: true}
            : {ok: false, cancelled: false, error};
        }
      })();
      return candidate.promise;
    },
    beginScene(sceneId: string, generation: number) {
      cancel('scene-superseded');
      startBackground(sceneId, generation);
      const abort = new AbortController();
      const candidate: Preparation = {
        phase: 'scene',
        sceneId,
        abort,
        promise: Promise.resolve<Readiness>({ok: true, prepared: false}),
      };
      pending = candidate;
      candidate.promise = (async (): Promise<Readiness> => {
        try {
          await cleanup;
          const ctx = context(abort.signal, generation, sceneId);
          if (abort.signal.aborted) return {ok: false, cancelled: true};
          const result = await withLoading(
            () =>
              groups.replaceGroups(
                [...committed, `${prefix}:retained:${sceneId}`, `${prefix}:scene:${sceneId}`],
                ctx,
              ),
            ctx,
          );
          reportCleanupError(result.cleanupError, sceneId);
          if (abort.signal.aborted) return {ok: false, cancelled: true};
          onEvent('assets.scene.ready', {sceneId});
          return {ok: true, prepared: true};
        } catch (error) {
          return abort.signal.aborted
            ? {ok: false, cancelled: true}
            : {ok: false, cancelled: false, error};
        }
      })();
    },
    waitForScene(sceneId: string): Promise<Readiness> {
      return pending?.sceneId === sceneId
        ? pending.promise
        : Promise.resolve({ok: true, prepared: false});
    },
    /**
     * Wait until a recognition model is ready. Returns at once when it already is; joins its
     * background load while that is still running; loads it now if nothing started it.
     */
    async waitForSceneAsset(
      sceneId: string,
      assetId: string,
      generation: number,
      signal: AbortSignal,
    ): Promise<Readiness> {
      if (loadedBackground.has(assetId)) return Object.freeze({ok: true, prepared: false});
      const waiting = background.has(assetId);
      if (waiting) onEvent('assets.background.wait.start', {sceneId, assetIds: [assetId]});
      try {
        // The lifecycle joins a prepare of the same asset that is already running.
        await prepareBackground(sceneId, assetId, context(signal, generation, sceneId));
        if (signal.aborted) return Object.freeze({ok: false, cancelled: true});
        // A model loaded while the coordinator is being released belongs to that release.
        if (!releaseRequired) loadedBackground.set(assetId, sceneId);
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
    },
    async commitScene(sceneId: string, _reason: string) {
      if (!pending || pending.sceneId !== sceneId) throw new Error('No prepared asset group scene');
      const candidate = pending;
      const ready = await candidate.promise;
      if (!ready.ok || candidate !== pending) throw new Error('Asset group scene is not ready');
      const next = new Set(
        [...committed].filter(
          (id) => id !== `${prefix}:startup` && !id.startsWith(`${prefix}:scene:`),
        ),
      );
      next.add(`${prefix}:boot`);
      next.add(`${prefix}:retained:${sceneId}`);
      next.add(`${prefix}:scene:${sceneId}`);
      const result = await groups.replaceGroups(
        [...next],
        context(candidate.abort.signal, 0, sceneId),
      );
      committed = next;
      pending = null;
      commitBackground(sceneId);
      return result;
    },
    cancel,
    snapshot: () => groups.snapshot(),
    release,
  });
}
