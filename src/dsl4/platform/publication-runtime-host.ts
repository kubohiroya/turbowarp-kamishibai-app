import {createDsl4RetryableCleanup} from '../retryable-cleanup.js';
import {validateDsl4StoryIr} from '../compiled-story-artifact.js';
import {createDsl4SealedKeyCache, type Dsl4SealedUnlock} from '../sealed-story-artifact.js';
import {
  createDsl4PublicationLoader,
  createDsl4PublicationSourceProvider,
} from '../publication-loader.js';
import type {Dsl4SourceFrontend} from '../source-frontend.js';
import {createDsl4PublicationVideoPrefetch} from '../publication-video-prefetch.js';
import {createDsl4VerifiedVideoPrefetchResolver} from './publication-video-prefetch-resolver.js';
import {createDsl4PublicationLayout} from './publication-stage-layout.js';
import {createDsl4VideoAssetAdapter} from './video-asset-adapter.js';
import {createDsl4ObjectUrlOwner} from './object-url-owner.js';
import {
  publicationSegmentProject,
  readDsl4PublicationChapterText,
  readDsl4SealedPublicationChapter,
  validateDsl4PublicationProject,
} from './publication-project.js';
import {createDsl4TurboWarpRuntimeHost} from './turbowarp-runtime-host.js';

type HostOptions = Parameters<typeof createDsl4TurboWarpRuntimeHost>[0];
type HostResult = Awaited<ReturnType<typeof createDsl4TurboWarpRuntimeHost>>;
type Host = NonNullable<HostResult['host']>;
export interface Dsl4PublicationStage {
  readonly runtime: unknown;
  readonly element: HTMLElement;
  dispose(reason: string): unknown;
}
type Owner = {host: Host; stage: Dsl4PublicationStage};
type RunResult = Readonly<Record<string, unknown>>;
type Run = {
  promise: Promise<RunResult>;
  resolve(value: RunResult): void;
  reject(error: unknown): void;
};
type TransferResult = {outcome: 'committed' | 'retained'};
type Transfer = {
  source: Owner;
  segmentId: string;
  abort: AbortController;
  run: Run;
  committed: boolean;
  resolve(result: TransferResult): void;
};

/** Stage and controller ownership travel together; only scenario actions request chapter changes. */
export async function createDsl4PublicationRuntimeHost(
  options: HostOptions & {
    document: Document;
    publicationMount: HTMLElement;
    createPublicationStage: (
      project: Readonly<Record<string, unknown>>,
      signal?: AbortSignal,
      mount?: HTMLElement,
    ) => Promise<Dsl4PublicationStage>;
  },
) {
  const frontend = options.sourceFrontend as Dsl4SourceFrontend;
  const sourceProject = structuredClone(options.project);
  const publication = validateDsl4PublicationProject(sourceProject, frontend);
  const document = options.document;
  const {layout, stageMount, controls} = createDsl4PublicationLayout(document);
  // One owner per publication: equal images, and equal videos, keep one URL across chapters.
  const objectUrlOwner =
    options.objectUrlOwner ??
    createDsl4ObjectUrlOwner({
      ...(options.createObjectURL ? {createObjectURL: options.createObjectURL} : {}),
      ...(options.revokeObjectURL ? {revokeObjectURL: options.revokeObjectURL} : {}),
    });
  const video = options.videoAssetAdapter ?? createDsl4VideoAssetAdapter({objectUrlOwner});
  const status = document.createElement('output');
  status.setAttribute('aria-live', 'polite');
  type DownloadPublication = (options?: {distributionProfile?: 'compiled' | 'sealed'}) => unknown;
  const downloadPublication =
    typeof options.downloadPublication === 'function'
      ? (options.downloadPublication as DownloadPublication)
      : null;
  function saveButton(label: string, saveOptions?: {distributionProfile: 'compiled' | 'sealed'}) {
    const button = document.createElement('button');
    button.textContent = label;
    button.type = 'button';
    button.hidden = downloadPublication === null;
    button.addEventListener('click', () => {
      if (downloadPublication === null) return;
      button.disabled = true;
      void Promise.resolve()
        .then(() => (saveOptions ? downloadPublication(saveOptions) : downloadPublication()))
        .catch((error) => {
          status.textContent = String(error);
        })
        .finally(() => {
          button.disabled = false;
        });
    });
    return button;
  }
  // The plain save keeps the publication's profile. The others move it forward: without YAML
  // (compiled), or encrypted under a new password (sealed). A profile never moves back.
  const download = saveButton('Save SB3 / SB3を保存');
  const downloadCompiled = saveButton('Save SB3 without YAML / YAMLなしでSB3を保存', {
    distributionProfile: 'compiled',
  });
  const downloadSealed = saveButton('Save SB3 with password / パスワード付きでSB3を保存', {
    distributionProfile: 'sealed',
  });
  if (publication.profile !== 'source') downloadCompiled.hidden = true;
  if (publication.profile === 'sealed') downloadSealed.hidden = true;
  controls.append(download, downloadCompiled, downloadSealed, status);
  let target: unknown = null;
  let disposed = false;
  let pending: Transfer | null = null;
  let transitionWork: Promise<void> = Promise.resolve();
  let active: Owner | null = null;
  let initialResult: HostResult | null = null;
  let run: Run | null = null;
  let execution: object | null = null;
  let rewarm = false;
  function settle(current: Run, value: RunResult, error?: unknown) {
    if (run !== current) return;
    run = null;
    execution = null;
    if (error !== undefined) current.reject(error);
    else current.resolve(value);
  }
  function beginChapter(current: Run, startOptions?: {sceneId?: string}) {
    const owner = active!;
    layout.style.display = 'grid';
    owner.stage.element.style.display = '';
    const token = {};
    execution = token;
    try {
      void owner.host.start(startOptions).then(
        (result) => {
          if (execution === token && active === owner) settle(current, result as RunResult);
        },
        (error) => {
          if (execution === token && active === owner) settle(current, {}, error);
        },
      );
    } catch (error) {
      settle(current, {}, error);
    }
  }
  function startCurrent(startOptions?: {sceneId?: string}) {
    if (disposed) throw new Error('Publication disposed');
    // A stop cancelled the warm-up of the current chapter's links; resume it with the run.
    if (rewarm) {
      rewarm = false;
      const current = loader.getCurrent();
      if (current) prefetchAfter(current.segmentId);
    }
    const previousTransition = pending ? transitionWork : null;
    pending?.abort.abort('publication-restart');
    if (run) settle(run, {status: 'stopped', reason: 'restart'});
    let resolve!: Run['resolve'];
    let reject!: Run['reject'];
    const promise = new Promise<RunResult>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const current = {promise, resolve, reject};
    run = current;
    if (previousTransition) {
      void previousTransition.then(() => {
        if (!disposed && run === current) beginChapter(current, startOptions);
      });
    } else beginChapter(current, startOptions);
    return promise;
  }
  function transfer(source: Owner, segmentId: string, context: unknown): Promise<TransferResult> {
    if (disposed || active !== source || !run || pending)
      return Promise.reject(new Error('No active scenario chapter transition'));
    // The candidate resolves its own videos; a concurrent prefetch would only duplicate reads.
    prefetch.cancel('publication-transition');
    const currentId = loader.getCurrent()!.segmentId;
    const current = publication.manifest.segments.find((segment) => segment.id === currentId)!;
    if (!current.next.includes(segmentId))
      return Promise.reject(new Error('Chapter transition is not declared in manifest next'));
    const signal = (context as {signal?: AbortSignal})?.signal;
    const abort = new AbortController();
    const cancel = () => {
      if (!request.committed) abort.abort(signal?.reason);
    };
    let resolve!: Transfer['resolve'];
    const promise = new Promise<TransferResult>((yes) => {
      resolve = yes;
    });
    const request: Transfer = {source, segmentId, abort, run, resolve, committed: false};
    pending = request;
    signal?.addEventListener('abort', cancel, {once: true});
    if (signal?.aborted) cancel();
    status.textContent = 'Loading';
    transitionWork = loader
      .transition(segmentId, {signal: abort.signal})
      .then((result) => {
        status.textContent = result.cleanupError ? 'Chapter started; cleanup failed' : 'Ready';
        if (pending === request) pending = null;
        if (!disposed && run === request.run) beginChapter(request.run);
        prefetchAfter(segmentId);
      })
      .catch((error) => {
        status.textContent = String(error);
        if (!request.committed) {
          if (pending === request) pending = null;
          // Keep the source chapter paused at this action; do not execute its following actions.
          request.resolve({outcome: 'retained'});
          options.onEvent?.({
            type: 'publication.transition.failed',
            segmentId,
            error: String(error),
          });
          // The source chapter stays current; warm its links again so a retry can hit the cache.
          // A transition aborted by stop, restart or disposal must not start new reads.
          if (!abort.signal.aborted) prefetchAfter(currentId);
        } else if (!disposed && run === request.run) settle(request.run, {}, error);
      })
      .finally(() => {
        signal?.removeEventListener('abort', cancel);
        if (pending === request) pending = null;
      });
    void transitionWork.catch(() => {});
    return promise;
  }
  // One key cache per publication: the viewer's password derives the chapters' key once.
  const sealedKeyCache = publication.profile === 'sealed' ? createDsl4SealedKeyCache() : null;
  const unlockSealedStory = options.unlockSealedStory as Dsl4SealedUnlock | undefined;
  const provider = createDsl4PublicationSourceProvider({
    mode: 'offline',
    readEntry: async (entry) => {
      let text;
      if (publication.profile === 'sealed') {
        if (typeof unlockSealedStory !== 'function')
          throw new TypeError('This publication is sealed and needs a password to open');
        text = await readDsl4SealedPublicationChapter(publication, entry, unlockSealedStory, {
          keyCache: sealedKeyCache!,
        });
        if (text === null)
          throw new TypeError('This publication is sealed and no password was given');
      } else {
        text = readDsl4PublicationChapterText(publication, entry);
      }
      return text === undefined ? null : new TextEncoder().encode(text);
    },
  });
  const loader = createDsl4PublicationLoader({
    manifest: publication.manifest,
    provider,
    // A compiled chapter is already a Story IR whose bytes the manifest digest just verified.
    ...(publication.profile === 'source'
      ? {frontend}
      : {decode: (text: string) => validateDsl4StoryIr(JSON.parse(text))}),
    async prepare(segment, _storyDocument, signal, position) {
      const project = publicationSegmentProject(
        sourceProject,
        publication.components[segment.id],
        publication.assetFiles,
      );
      const stage = await options.createPublicationStage(project, signal, stageMount);
      if (stage.element.parentNode !== stageMount) stageMount.appendChild(stage.element);
      stage.element.style.visibility = 'hidden';
      let host: Host | null = null;
      let candidate: Owner | null = null;
      let committed = false;
      const cleanup = createDsl4RetryableCleanup({
        message: 'Publication VM cleanup failed',
        steps: [
          {
            run: () => host?.dispose('publication-segment-release'),
            isPending: () => host?.hasPendingCleanup?.() ?? false,
          },
          () => stage.dispose('publication-segment-release'),
        ],
      });
      function release() {
        committed = false;
        return cleanup.run('publication-segment-release');
      }
      try {
        const result = await createDsl4TurboWarpRuntimeHost({
          ...options,
          project,
          runtime: stage.runtime,
          publicationSegmentId: segment.id,
          ...(sealedKeyCache === null ? {} : {sealedKeyCache}),
          videoAssetAdapter: video,
          objectUrlOwner,
          async createHostPort(context) {
            const port = (await options.createHostPort?.(context)) ?? {};
            if ('gotoSegment' in port) throw new Error('Publication owns gotoSegment');
            return {
              ...port,
              gotoSegment(payload: RunResult, actionContext: unknown) {
                if (!committed || !candidate) throw new Error('Candidate chapter is not active');
                return transfer(candidate, String(payload.segment), actionContext);
              },
            };
          },
          // Hidden candidates do not publish global UI; committed chapters retain normal loading UI.
          setLoading(payload, context) {
            if (committed) return options.setLoading?.(payload, context);
          },
          setBusy(payload) {
            if (committed) return options.setBusy?.(payload);
          },
          setCursor(payload) {
            if (committed) return options.setCursor?.(payload);
          },
          onEvent(event) {
            if (committed) options.onEvent?.(event);
          },
        });
        if (!result.ok || !result.host)
          throw new Error(String(result.diagnostics[0]?.message ?? 'Publication runtime rejected'));
        host = result.host;
        if (!initialResult) initialResult = result;
        await host.preparePublicationScene(position.sceneId, signal);
      } catch (error) {
        try {
          await release();
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], 'Publication preparation failed');
        }
        throw error;
      }
      candidate = {host: host!, stage};
      const ready = candidate;
      return {
        value: ready,
        hasPendingCleanup: cleanup.hasPendingCleanup,
        commit() {
          if (disposed) throw new Error('Publication disposed');
          const previous = active;
          try {
            if (target) ready.host.attach(target);
            ready.host.attachStagePointer(stage.element);
            previous?.host.detach();
            previous?.host.detachStagePointer();
          } catch (error) {
            const failures = [error];
            for (const rollback of [
              () => ready.host.detach(),
              () => ready.host.detachStagePointer(),
              () => {
                if (target) previous?.host.attach(target);
              },
              () => {
                if (previous) previous.host.attachStagePointer(previous.stage.element);
              },
            ]) {
              try {
                rollback();
              } catch (failure) {
                failures.push(failure);
              }
            }
            if (failures.length > 1)
              throw new AggregateError(failures, 'Publication input rollback failed');
            throw error;
          }
          if (previous) previous.stage.element.style.display = 'none';
          stage.element.style.visibility = 'visible';
          committed = true;
          active = ready;
          if (pending?.source === previous && pending.segmentId === segment.id) {
            pending.committed = true;
            // Complete the source action before disposal waits for that action's run to settle.
            pending.resolve({outcome: 'committed'});
          }
        },
        release,
      };
    },
  });
  function cacheIdentityFor(segmentId: string) {
    if (options.cacheIdentity !== undefined) return options.cacheIdentity;
    const component = publication.components[segmentId] as {
      sourceDescriptor?: {cacheIdentity?: unknown};
    };
    return component?.sourceDescriptor?.cacheIdentity;
  }
  const loadRemoteAsset = options.loadRemoteAsset;
  const prefetch = createDsl4PublicationVideoPrefetch({
    manifest: publication.manifest,
    loadDocument: (segmentId, signal) => loader.prefetch(segmentId, signal),
    resolveRemoteVideo:
      typeof loadRemoteAsset === 'function'
        ? createDsl4VerifiedVideoPrefetchResolver({
            loadRemoteAsset,
            cacheIdentityFor,
            verifiedRemoteCacheOptions: options.verifiedRemoteCacheOptions,
          })
        : async (target) => {
            throw new Error(`Remote loading is unavailable for ${target.assetId}`);
          },
    onResult(result) {
      options.onEvent?.({type: 'publication.prefetch', ...result});
    },
  });
  function prefetchAfter(segmentId: string) {
    if (disposed) return;
    void prefetch.prefetchNext(segmentId).catch(() => {});
  }
  options.publicationMount.appendChild(layout);
  try {
    await loader.transition(publication.manifest.entrySegment);
  } catch (error) {
    try {
      await loader.dispose();
    } finally {
      layout.remove();
    }
    throw error;
  }
  status.textContent = 'Ready';
  prefetchAfter(publication.manifest.entrySegment);
  const cleanup = createDsl4RetryableCleanup({
    message: 'Publication cleanup failed',
    steps: [
      () => prefetch.cancel('publication-disposed'),
      () => pending?.abort.abort('publication-disposed'),
      () => layout.remove(),
      {
        isPending: () => loader.hasPendingCleanup(),
        async run() {
          try {
            await loader.dispose();
          } finally {
            active = null;
            if (run) settle(run, {status: 'stopped'});
          }
        },
      },
    ],
  });
  function checkOpen() {
    if (disposed) throw new Error('Publication disposed');
  }
  const delegate = new Proxy({} as Host, {
    get(_object, key) {
      if (key === 'start') return startCurrent;
      if (key === 'getRunPromise') return () => run?.promise ?? null;
      if (key === 'prepareMenu')
        return async () => {
          checkOpen();
          const owner = active!;
          const result = await owner.host.prepareMenu();
          if (!disposed && active === owner) {
            owner.stage.element.style.display = 'none';
            layout.style.display = 'none';
          }
          return result;
        };
      if (key === 'stop')
        return (reason?: string) => {
          checkOpen();
          prefetch.cancel(reason);
          rewarm = true;
          pending?.abort.abort(reason);
          const result = active!.host.stop(reason);
          if (run) settle(run, {status: 'stopped', reason});
          return result;
        };
      if (key === 'hasPendingCleanup') return () => cleanup.hasPendingCleanup();
      if (key === 'dispose')
        return () => {
          disposed = true;
          return cleanup.run('publication-disposed');
        };
      if (key === 'attach')
        return (next: unknown) => {
          checkOpen();
          target = next;
          return active!.host.attach(next);
        };
      if (key === 'detach')
        return () => {
          target = null;
          return active?.host.detach();
        };
      if (key === 'getPublicationState')
        return () => ({
          segmentId: loader.getCurrent()?.segmentId ?? null,
          assetGroups: active?.host.getAssetGroupSnapshot(),
          residentBytes: publication.resident,
          disposed,
        });
      if (key === 'transitionPublication') return undefined;
      checkOpen();
      const owner = active!.host;
      const value = Reflect.get(owner, key);
      return typeof value === 'function'
        ? (...args: unknown[]) => {
            checkOpen();
            return value.apply(owner, args);
          }
        : value;
    },
  });
  return {...(initialResult as unknown as HostResult), host: delegate};
}
