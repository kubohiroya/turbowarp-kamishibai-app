import {createDsl4BrowserTurboWarpPlatform} from '../browser-turbowarp-components.js';
import {composeBubbleStyles} from '../bubble-style.js';
import {createTurboWarpBubbleComposition} from '@kubohiroya/turbowarp-bubble/turbowarp-adapter';
import {
  createAssetManagerComposition,
  type AssetManagerCompositionRuntime,
} from '@kubohiroya/turbowarp-asset-cache/composition';
import {createDsl4BrowserTurboWarpStage} from '../browser-turbowarp-stage.js';
import {createDsl4OneShotBinaryEntryProvider} from '../binary-entry-provider.js';
import {
  createDsl4BlockIconPreviewProject,
  resolveDsl4BlockIconPreviewLocation,
  projectDsl4NamedBlockIconPreview,
} from '../block-icon-preview-location.js';
import type {Dsl4BlockPreviewReference} from '../block-icon-preview-location.js';
import {dsl4StandardProductionFeatureFlags, resolveDsl4FeatureFlags} from '../feature-flags.js';
import {createDsl4NavigationSession} from '../navigation-session.js';
import type {Dsl4NavigationSessionSurface} from '../navigation-session-surface.js';
import {
  loadDsl4BinaryEntryRuntimeComponent,
  loadDsl4RuntimeComponent,
} from '../runtime-artifact-loader.js';
import type {Dsl4RuntimePort} from '../runtime-port.js';
import type {Dsl4SourceFrontend} from '../source-frontend.js';
import {createDsl4BrowserRemoteAssetLoader} from './browser-remote-asset-loader.js';
import {prepareDsl4EmbeddedBlockStoryProject} from './embedded-block-story.js';
import {createDsl4StageArchive} from './stage-archive.js';
import {fitDsl4Stage} from '../browser-stage-layout.js';
import {createDsl4TurboWarpRuntimeEnvironment} from './turbowarp-runtime-host.js';
import {createDsl4TurboWarpTransitionPort} from './turbowarp-transition-port.js';
import {normalizeDsl4VmProjectSnapshot} from './vm-project-snapshot.js';
import {createDsl4ProjectTMRuntime} from './posenet-bundle.js';
import {resolveDsl4Viewport} from '../viewport.js';

type ValueRecord = Record<string, unknown>;
export type Dsl4BlockIconPreviewMode = 'still' | 'action' | 'scene';
export interface Dsl4BlockIconPreviewActor {
  readonly drawableID: number;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  setXY(x: number, y: number): void;
  setSize(size: number): void;
}

interface PreviewVm {
  readonly constructor: unknown;
  readonly runtime: ValueRecord & {targets?: unknown[]};
  toJSON(targetId?: string, options?: {allowOptimization?: boolean}): string;
  saveProjectSb3DontZip(): unknown | Promise<unknown>;
}

function record(value: unknown): value is ValueRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cancelled() {
  return new DOMException('プレビューを中止しました。', 'AbortError');
}
function check(signal: AbortSignal) {
  if (signal.aborted) throw cancelled();
}
function failure(message: string) {
  return Object.assign(new Error(message), {code: 'K4-BLOCK-PREVIEW-RUNTIME'});
}

/** Refuse legacy factories before they can bind global Scratch VM state. */
export function createDsl4IsolatedPreviewAssetManager(
  runtime: unknown,
  factory: typeof createAssetManagerComposition = createAssetManagerComposition,
): typeof createAssetManagerComposition {
  const isolated = factory as unknown as {
    supportsRuntimeIsolation?: boolean;
    (
      features: Parameters<typeof factory>[0],
      options: NonNullable<Parameters<typeof factory>[1]> & {
        runtime: AssetManagerCompositionRuntime;
      },
    ): ReturnType<typeof factory>;
  };
  if (isolated.supportsRuntimeIsolation !== true)
    throw failure(
      'この素材キャッシュは独立したプレビューVMに対応していません。TurboWarp Plus Editorの素材キャッシュを更新してください。',
    );
  if (
    !record(runtime) ||
    !record(runtime.renderer) ||
    !Array.isArray(runtime.targets) ||
    runtime.targets.some((target) => typeof target !== 'object' || target === null)
  )
    throw failure('プレビュー用の素材ランタイムにrendererとtargetsが必要です。');
  const owner = runtime as unknown as AssetManagerCompositionRuntime;
  return Object.assign(
    (
      features?: NonNullable<Parameters<typeof factory>[0]>,
      compositionOptions: NonNullable<Parameters<typeof factory>[1]> = {},
    ) => isolated(features, {...compositionOptions, runtime: owner}),
    {supportsRuntimeIsolation: true as const},
  );
}

/** Snapshot styles must neither reveal text incrementally nor start sound/frame animations. */
export function createDsl4BlockIconPreviewPresentation(
  storyDocument: Readonly<ValueRecord>,
  mode: Dsl4BlockIconPreviewMode,
): Readonly<ValueRecord> {
  if (mode !== 'still') return storyDocument;
  const still = structuredClone(storyDocument) as ValueRecord;
  if (record(still.bubbleStyles)) {
    const original = still.bubbleStyles as Readonly<Record<string, Readonly<ValueRecord>>>;
    const resolved: Record<string, ValueRecord> = {};
    for (const id of Object.keys(original)) {
      const style = composeBubbleStyles([id], original);
      const animated = [
        'showAnimation',
        'hideAnimation',
        'reveal',
        'audio',
        'continueIndicator',
      ].some((property) => Object.hasOwn(style, property));
      for (const property of [
        'showAnimation',
        'hideAnimation',
        'visibleAnimations',
        'reveal',
        'audio',
        'continueIndicator',
      ])
        delete style[property];
      if (record(style.portrait)) {
        delete style.portrait.blink;
        delete style.portrait.lipSync;
      }
      // A single complete block keeps custom layout without overriding other composed fragments.
      if (animated) style.reveal = {unit: 'BLOCK', intervalSeconds: 0};
      resolved[id] = style;
    }
    still.bubbleStyles = resolved;
  }
  return still;
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // Startup and animation failures may precede the caller receiving the handle.
  void promise.catch(() => {});
  return {promise, resolve, reject};
}

function hold(signal: AbortSignal): Promise<never> {
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(cancelled()), {once: true});
  });
}

const nonVisualCommands = new Set([
  'wait',
  'bgm',
  'stopBgm',
  'setBgmVolume',
  'sound',
  'audio',
  'audioControl',
  'say',
  'think',
  'broadcastMessageAndWait',
  'pose',
]);
const inputCommands = new Set([
  'keyInputToChangeScene',
  'touchInputToChangeScene',
  'poseInputToChangeScene',
  'imageInputToChangeScene',
]);

/** Accelerate only presentation reconstruction; selected move/speech use the real runtime port. */
export function createDsl4BlockIconPreviewSession(options: {
  storyDocument: Readonly<ValueRecord>;
  sceneId: string;
  actionPath: string | null;
  mode: Dsl4BlockIconPreviewMode;
  controlProfile?: string;
  port: Dsl4RuntimePort;
  signal: AbortSignal;
  assetLifecycle?: Parameters<typeof createDsl4NavigationSession>[0]['assetLifecycle'];
  evaluateCondition?: Parameters<typeof createDsl4NavigationSession>[0]['evaluateCondition'];
  onEvent?: (event: Readonly<ValueRecord>) => void;
  afterPaint?: () => Promise<void>;
  waitForSpeechRendered?: () => Promise<void>;
}) {
  const ready = deferred();
  const finished = deferred();
  let session: Dsl4NavigationSessionSurface | null = null;
  let selected = false;
  let enteredTargetScene = false;
  let completing = false;
  let stopped = false;
  let actionCount = 0;
  let paintScheduled = false;
  let disposePromise: Promise<void> | null = null;
  const retainedLifecycle = options.assetLifecycle
    ? {...options.assetLifecycle, release() {}}
    : undefined;
  const paintReady = () => {
    if (paintScheduled) return;
    paintScheduled = true;
    void (options.afterPaint?.() ?? Promise.resolve()).then(ready.resolve, ready.reject);
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    session?.stop('block-preview-stop');
    if (!paintScheduled) ready.resolve();
    finished.resolve();
  };
  const port: Dsl4RuntimePort = {...options.port};
  for (const [name, operation] of Object.entries(options.port)) {
    if (typeof operation !== 'function') continue;
    port[name] = (payload: Readonly<ValueRecord>, context: unknown) => {
      const fast = !selected || options.mode === 'still';
      if (name === 'hideSceneActors') {
        if (enteredTargetScene && payload.to !== options.sceneId) {
          if (!selected) {
            const error = failure('この分岐では対象ブロックが実行されません。');
            ready.reject(error);
            finished.reject(error);
          }
          completing = true;
          stop();
          return;
        }
        return operation(payload, context);
      }
      if (name === 'customAction')
        throw failure('独自アクションの結果はアイコンプレビューでは再現できません。');
      if (
        name === 'createSceneCrossfade' &&
        fast &&
        !(options.mode === 'scene' && record(context) && context.to === options.sceneId)
      )
        return Object.freeze({start() {}, finish() {}});
      if (inputCommands.has(name)) {
        if (!selected || options.mode !== 'scene')
          throw failure(
            '前の入力や認識結果によって実行経路が変わるため、この位置を自動再現できません。入力待ちより前の場面を再生して確認してください。',
          );
        return operation(payload, context);
      }
      if (fast && nonVisualCommands.has(name)) {
        if (selected && options.mode === 'still' && (name === 'say' || name === 'think')) {
          const speech: ValueRecord = {...payload, waitFor: 'advance'};
          for (const key of [
            'seconds',
            'bubbleReveal',
            'bubbleMotions',
            'startSound',
            'characterSound',
            'characterIntervalSeconds',
            'noSoundCharacters',
            'restCharacters',
            'restCharacterIntervalSeconds',
          ])
            delete speech[key];
          const result = operation(speech, context);
          if (options.waitForSpeechRendered)
            void options.waitForSpeechRendered().then(paintReady, ready.reject);
          else paintReady();
          return result;
        }
        return;
      }
      if (fast && name === 'loop') {
        const first = Array.isArray(payload.steps) ? payload.steps.find(record) : undefined;
        return first && typeof options.port.setSkin === 'function'
          ? options.port.setSkin({target: payload.target, skin: first.skin}, context)
          : undefined;
      }
      if (
        fast &&
        name === 'videoControl' &&
        ['playUntilDone', 'play', 'loop', 'resume'].includes(String(payload.operation))
      )
        return operation({id: payload.id, operation: 'pause'}, context);
      let next = payload;
      if (fast && ['moveTo', 'setTransparency', 'transition'].includes(name))
        next = {...next, seconds: 0};
      if (fast && record(next.transition))
        next = {...next, transition: {...next.transition, seconds: 0}};
      const result = operation(next, context);
      if (selected && ['moveTo', 'say', 'think', 'video', 'loop'].includes(name)) paintReady();
      return result;
    };
  }
  const created = createDsl4NavigationSession({
    storyDocument: options.storyDocument,
    controlProfile: options.controlProfile ?? 'production',
    port,
    // A controller stop freezes the current frame; the preview lifetime owns its assets.
    ...(retainedLifecycle ? {assetLifecycle: retainedLifecycle} : {}),
    ...(options.evaluateCondition ? {evaluateCondition: options.evaluateCondition} : {}),
    debugExecution: {
      getState: () => ({paused: completing}),
      beforeAction(action) {
        if (++actionCount > 4096) throw failure('プレビューで実行できる命令数を超えました。');
        if (completing) return hold(action.signal);
        if (
          action.sceneId === options.sceneId &&
          !selected &&
          action.actionPath === options.actionPath
        )
          selected = true;
        if (selected && options.mode === 'still' && inputCommands.has(action.command)) {
          completing = true;
          paintReady();
          stop();
          return hold(action.signal);
        }
        if (selected && options.mode === 'scene') paintReady();
      },
    },
    speechAdvanceTypewriterEnabled: true,
    turboWarpBubbleAdvancedPresentationEnabled: true,
    broadcastMessageAndWaitEnabled: true,
    crossfadeTransitionsEnabled: true,
    narrativeControlEnabled: true,
    onEvent(event) {
      options.onEvent?.(event);
      if (event.type === 'scene.enter' && event.sceneId === options.sceneId) {
        enteredTargetScene = true;
        if (options.mode === 'scene') {
          selected = true;
          paintReady();
        }
      }
      if (event.type === 'runtime.fail') {
        const state = session?.getState().runtime;
        const diagnostic = record(state) ? state.diagnostic : undefined;
        const error = record(diagnostic)
          ? Object.assign(failure(String(diagnostic.message)), diagnostic)
          : failure('プレビューの再生に失敗しました。');
        ready.reject(error);
        finished.reject(error);
      }
      if (event.type === 'action.commit' && event.actionPath === options.actionPath) {
        completing = true;
        paintReady();
        stop();
      }
      if (event.type === 'runtime.finish' && !stopped) {
        if (!selected) {
          const error = failure('この分岐では対象ブロックが実行されません。');
          ready.reject(error);
          finished.reject(error);
        } else {
          paintReady();
          finished.resolve();
        }
      }
    },
  });
  if (!created.ok || !('session' in created)) throw failure('この台本をプレビューできません。');
  session = created.session as Dsl4NavigationSessionSurface;
  const abort = () => {
    ready.reject(cancelled());
    stop();
  };
  options.signal.addEventListener('abort', abort, {once: true});
  if (options.signal.aborted) abort();
  return Object.freeze({
    ready: ready.promise,
    finished: finished.promise,
    start() {
      check(options.signal);
      void session!.start().catch((error: unknown) => {
        ready.reject(error);
        finished.reject(error);
      });
      return ready.promise;
    },
    attach(element: HTMLElement) {
      session!.attach(element);
      session!.attachStagePointer(element);
    },
    stop,
    dispose() {
      if (disposePromise) return disposePromise;
      const operation = (async () => {
        options.signal.removeEventListener('abort', abort);
        stop();
        try {
          await session!.dispose('block-preview-dispose');
        } finally {
          await options.assetLifecycle?.release({reason: 'block-preview-dispose'});
        }
      })();
      disposePromise = operation;
      void operation.catch(() => {
        disposePromise = null;
      });
      return operation;
    },
  });
}

/** Build previews from the host's pinned constructors; never execute or change the editor VM. */
export function createDsl4BlockIconPreviewRuntime(options: {
  vm: unknown;
  sourceFrontend: Dsl4SourceFrontend;
  runtimeVersion?: string;
  tmPoseRuntime?: unknown;
  resolveTMPoseRuntime?: () => unknown;
  createVm?: () => unknown;
  limits?: {maxSourceBytes?: number; maxAssetFiles?: number; maxTotalAssetBytes?: number};
}) {
  const host = options.vm as PreviewVm;
  const limits = {
    maxSourceBytes: options.limits?.maxSourceBytes ?? 1024 * 1024,
    maxAssetFiles: options.limits?.maxAssetFiles ?? 64,
    maxTotalAssetBytes: options.limits?.maxTotalAssetBytes ?? 64 * 1024 * 1024,
  };
  return Object.freeze({
    async open(request: {
      mount: HTMLElement;
      snapshot: Dsl4BlockPreviewReference;
      changes?: Readonly<Record<string, string | number | boolean>>;
      mode: Dsl4BlockIconPreviewMode;
      signal: AbortSignal;
    }) {
      const {signal, mount, snapshot, mode} = request;
      check(signal);
      if (typeof options.createVm !== 'function')
        throw failure(
          'このEditorには独立したプレビューVMを作成する機能がありません。TurboWarp Plus Editorを更新してください。',
        );
      const originalTarget = host.runtime.targets?.find(
        (target) => record(target) && target.id === snapshot.targetId,
      );
      const sprite =
        record(originalTarget) && record(originalTarget.sprite) ? originalTarget.sprite : {};
      const targetName = typeof sprite.name === 'string' ? sprite.name : undefined;
      const current = normalizeDsl4VmProjectSnapshot(
        JSON.parse(host.toJSON(undefined, {allowOptimization: false})) as ValueRecord,
      );
      const project = createDsl4BlockIconPreviewProject(
        current,
        snapshot,
        request.changes,
        targetName,
      );
      let stage: ReturnType<typeof createDsl4BrowserTurboWarpStage> | null = null;
      let element: HTMLElement | null = null;
      let releaseLayout: (() => void) | null = null;
      let environment: Awaited<ReturnType<typeof createDsl4TurboWarpRuntimeEnvironment>> | null =
        null;
      let preview: ReturnType<typeof createDsl4BlockIconPreviewSession> | null = null;
      let provider: Awaited<ReturnType<typeof createDsl4OneShotBinaryEntryProvider>> | null = null;
      let disposePromise: Promise<void> | null = null;
      let opened = false;
      let stageStarting = false;
      const dispose = () => {
        if (disposePromise) return disposePromise;
        const operation = (async () => {
          const failures: unknown[] = [];
          for (const release of [
            () => preview?.dispose(),
            () => environment?.dispose('block-preview-dispose'),
            () => {
              releaseLayout?.();
              releaseLayout = null;
            },
            () => stage?.dispose(),
            () => provider?.release(),
            () => {
              element?.remove();
              element = null;
            },
          ]) {
            try {
              await release();
            } catch (error) {
              failures.push(error);
            }
          }
          if (failures.length) throw new AggregateError(failures, 'Block preview cleanup failed');
        })();
        disposePromise = operation;
        void operation.catch(() => {
          disposePromise = null;
        });
        return operation;
      };
      const abort = () => {
        preview?.stop();
        if (stageStarting)
          void stage
            ?.dispose()
            .catch((error: unknown) =>
              console.warn('Block preview startup cleanup failed.', error),
            );
        if (opened)
          void dispose().catch((error: unknown) =>
            console.warn('Block preview cleanup failed.', error),
          );
      };
      signal.addEventListener('abort', abort, {once: true});
      try {
        const named = await projectDsl4NamedBlockIconPreview(
          project,
          options.sourceFrontend,
          limits,
        );
        const prepared =
          named?.project ??
          (await prepareDsl4EmbeddedBlockStoryProject(project, options.sourceFrontend, limits));
        check(signal);
        const storage = record(prepared.extensionStorage) ? prepared.extensionStorage : {};
        const bundle = record(storage.kubohiroyakamishibai4) ? storage.kubohiroyakamishibai4 : {};
        const components = record(bundle.components) ? bundle.components : {};
        const owner = record(storage.kubohiroyakamishibairuntime4)
          ? storage.kubohiroyakamishibairuntime4
          : components.kubohiroyakamishibairuntime4;
        const assets = record(owner) && record(owner.assets) ? owner.assets : {};
        const binary = assets.formatVersion === 2 || assets.formatVersion === 3;
        const result = binary
          ? await loadDsl4BinaryEntryRuntimeComponent(prepared, options.sourceFrontend, {
              ...limits,
              maxAssetFileBytes: limits.maxTotalAssetBytes,
            })
          : await loadDsl4RuntimeComponent(prepared, options.sourceFrontend, limits);
        if (!result.ok)
          throw failure(String(result.diagnostics[0]?.message ?? '台本の検証に失敗しました。'));
        let component = result as unknown as ValueRecord & {
          storyDocument: Readonly<ValueRecord>;
          assetBundle: ValueRecord;
        };
        if (mode === 'still') {
          // Loaded artifacts are immutable; presentation-only changes belong to this preview copy.
          component = {
            ...component,
            storyDocument: createDsl4BlockIconPreviewPresentation(component.storyDocument, mode),
          };
        }
        const location = resolveDsl4BlockIconPreviewLocation(
          project,
          snapshot,
          component.storyDocument,
          targetName,
          named?.blockSources,
        );
        const files = await host.saveProjectSb3DontZip();
        check(signal);
        if (binary) {
          provider = await createDsl4OneShotBinaryEntryProvider(
            component.storyDocument,
            component.assetBundle,
            {
              maxFiles: limits.maxAssetFiles,
              maxFileBytes: limits.maxTotalAssetBytes,
              maxTotalBytes: limits.maxTotalAssetBytes,
              maxCompressionRatio: 200,
              releaseAfterLastAsset: false,
              readEntry(entryName) {
                const value = record(files) ? files[entryName] : undefined;
                const bytes =
                  value instanceof Uint8Array
                    ? value
                    : value instanceof ArrayBuffer
                      ? new Uint8Array(value)
                      : null;
                if (!bytes) throw failure('プレビューで使用する素材の実体が見つかりません。');
                return {bytes, compressedSize: bytes.length};
              },
            },
          );
        }
        const constructorOf = (value: unknown) =>
          (value as {constructor?: unknown} | null)?.constructor;
        const platform = {
          ...createDsl4BrowserTurboWarpPlatform({
            VirtualMachine: host.constructor,
            Renderer: constructorOf(host.runtime.renderer),
            AudioEngine: constructorOf(host.runtime.audioEngine),
            Storage: constructorOf(host.runtime.storage),
            BitmapAdapter: constructorOf(host.runtime.v2BitmapAdapter),
          }),
          createVm: options.createVm,
        };
        const {bytes} = createDsl4StageArchive(project, files);
        check(signal);
        element = mount.ownerDocument.createElement('div');
        element.dataset.dsl4BlockPreviewStage = 'true';
        element.style.cssText = 'position:absolute;inset:0;background:white;';
        mount.appendChild(element);
        const viewport = resolveDsl4Viewport(component.storyDocument.viewport);
        stage = createDsl4BrowserTurboWarpStage({
          document: mount.ownerDocument,
          mount: element,
          projectBytes: bytes,
          platform,
          hostLayout: true,
          viewport,
        });
        stageStarting = true;
        try {
          await stage.start();
        } finally {
          stageStarting = false;
        }
        check(signal);
        const runtime = stage.getRuntime();
        const canvas = stage.getCanvas() as unknown as HTMLCanvasElement;
        releaseLayout = fitDsl4Stage({
          mount,
          element,
          canvas,
          width: viewport.width,
          height: viewport.height,
          fit: viewport.fit,
        });
        for (const target of Array.isArray(runtime.targets) ? runtime.targets : []) {
          if (record(target) && target.isStage !== true && typeof target.setVisible === 'function')
            target.setVisible(false);
        }
        const flags = resolveDsl4FeatureFlags({
          ...dsl4StandardProductionFeatureFlags,
          dsl4PoseFeedbackModes: false,
          dsl4CameraPreviewControls: false,
          dsl4PosePreviewMirroring: false,
          dsl4IndexedDBAssetSessionStore: false,
        });
        let lifecycleObserver: ((event: Readonly<ValueRecord>) => void) | null = null;
        const speechRendered = deferred();
        const tmPoseRuntime = options.tmPoseRuntime ?? options.resolveTMPoseRuntime?.();
        environment = await createDsl4TurboWarpRuntimeEnvironment(
          {
            runtime,
            createAssetManagerComposition: createDsl4IsolatedPreviewAssetManager(runtime),
            featureFlags: flags,
            ...limits,
            ...(options.runtimeVersion ? {runtimeVersion: options.runtimeVersion} : {}),
            ...(provider
              ? {
                  assetBundleFormat: 'binary-entry' as const,
                  binaryEntryProvider: provider,
                  binarySessionBackingPolicy: 'disabled' as const,
                }
              : {}),
            createHostPort: ({runtimeHost}) => createDsl4TurboWarpTransitionPort({runtimeHost}),
            loadRemoteAsset: createDsl4BrowserRemoteAssetLoader({
              maxBytes: limits.maxTotalAssetBytes,
            }),
            createObjectURL: (blob: Blob) => URL.createObjectURL(blob),
            revokeObjectURL: (url: string) => URL.revokeObjectURL(url),
            setLoading() {},
            ...(tmPoseRuntime
              ? {
                  tmPoseRuntime: createDsl4ProjectTMRuntime({
                    runtime: tmPoseRuntime,
                    globalObject: globalThis,
                    project: prepared,
                  }),
                }
              : {}),
            ...(mode === 'still'
              ? {
                  createBubbleComposition(...parameters: unknown[]) {
                    const create = createTurboWarpBubbleComposition as unknown as (
                      ...values: unknown[]
                    ) => {
                      show(...values: unknown[]): Promise<unknown>;
                      [name: string]: unknown;
                    };
                    const composition = create(...parameters);
                    return {
                      ...composition,
                      async show(...values: unknown[]) {
                        try {
                          const shown = await composition.show(...values);
                          speechRendered.resolve();
                          return shown;
                        } catch (error) {
                          speechRendered.reject(error);
                          throw error;
                        }
                      },
                    };
                  },
                }
              : {}),
            ...(mode === 'still'
              ? {actorScheduler: {now: () => 0, setTimeout: () => 0, clearTimeout() {}}}
              : {}),
          },
          component,
          () => {},
          () => {},
          (observer) => {
            lifecycleObserver = observer;
          },
          false,
          false,
          false,
          true,
        );
        check(signal);
        const afterPaint = async () => {
          const view = mount.ownerDocument.defaultView;
          if (view?.requestAnimationFrame)
            await new Promise<void>((resolve, reject) => {
              let frame = 0;
              const cleanup = () => {
                view.cancelAnimationFrame(frame);
                signal.removeEventListener('abort', abortPaint);
              };
              const abortPaint = () => {
                cleanup();
                reject(cancelled());
              };
              signal.addEventListener('abort', abortPaint, {once: true});
              frame = view.requestAnimationFrame(() => {
                frame = view.requestAnimationFrame(() => {
                  cleanup();
                  resolve();
                });
              });
              if (signal.aborted) abortPaint();
            });
          check(signal);
        };
        preview = createDsl4BlockIconPreviewSession({
          storyDocument: component.storyDocument,
          controlProfile: record(component.runtimeArtifact)
            ? String(component.runtimeArtifact.controlProfile)
            : 'production',
          ...location,
          mode,
          signal,
          port: environment.port,
          assetLifecycle: environment.assetLifecycle,
          evaluateCondition: environment.evaluateCondition,
          afterPaint,
          ...(mode === 'still' ? {waitForSpeechRendered: () => speechRendered.promise} : {}),
          onEvent(event) {
            // The preview owns its last frame until disposal, including DOM video/bubble overlays.
            if (event.type !== 'runtime.stop') lifecycleObserver?.(event);
          },
        });
        preview.attach(mount);
        await preview.start();
        check(signal);
        opened = true;
        return Object.freeze({
          runtime,
          canvas,
          finished: preview.finished,
          stop() {
            preview?.stop();
          },
          getActor(name: string): Dsl4BlockIconPreviewActor | null {
            const targets = Array.isArray(runtime.targets) ? runtime.targets : [];
            return (
              (targets.find(
                (target: unknown) =>
                  record(target) &&
                  record(target.sprite) &&
                  target.sprite.name === name &&
                  target.isStage !== true,
              ) as Dsl4BlockIconPreviewActor | undefined) ?? null
            );
          },
          async dispose() {
            signal.removeEventListener('abort', abort);
            await dispose();
          },
        });
      } catch (error) {
        signal.removeEventListener('abort', abort);
        try {
          await dispose();
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            'Block preview startup and cleanup failed',
          );
        }
        throw error;
      }
    },
  });
}
