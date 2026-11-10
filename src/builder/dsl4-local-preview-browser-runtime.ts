import {createDsl4BrowserPreviewRuntimeBridge} from '../dsl4/browser-preview-runtime-bridge.js';
import {
  createDsl4BrowserTurboWarpStage,
  dsl4BrowserTurboWarpStageDefaults,
  dsl4BrowserTurboWarpStageMaximumProjectBytes,
} from '../dsl4/browser-turbowarp-stage.js';
import {createDsl4TurboWarpPreviewSessionFactory} from '../dsl4/platform/turbowarp-preview-session.js';
import {
  createDsl4RuntimeApplicationMenu,
  dsl4RuntimeApplicationMenuDefaultIcons,
} from '../dsl4/platform/runtime-application-menu.js';
import {createDsl4RuntimeErrorIndicator} from '../dsl4/platform/runtime-error-indicator.js';
import {dsl4RuntimeProvenance} from '../dsl4/runtime-provenance.js';
import {createDsl4RuntimeTitleControls} from '../dsl4/platform/runtime-title-controls.js';
import type {Dsl4PreviewDocument, Dsl4PreviewElement} from '../dsl4/preview-dom.js';
import type {Dsl4SourceFrontend} from '../dsl4/source-frontend.js';
import {deepFreeze} from '../dsl4/story-document.js';
import {createDsl4RetryableCleanup} from '../dsl4/retryable-cleanup.js';
import {createDsl4FailedCreationOwners} from '../dsl4/failed-creation-owners.js';
import {createDsl4AssetObserverWaits} from '../dsl4/asset-cleanup-owners.js';
import {loadDsl4BrowserRuntimeComponent} from './dsl4-browser-runtime-component.js';

const standardRuntimeExtensionId = 'kubohiroyakamishibai4';
const runtimeFailureTitles = Object.freeze({
  en: 'Kamishibai runtime error',
  ja: '紙芝居の実行エラー',
});

type PreviewCallback = (...args: unknown[]) => unknown;

interface RuntimeGlobalObject extends Record<string, unknown> {
  Scratch?: unknown;
  navigator?: Readonly<{language?: string}>;
  open?: (url: string, target?: string, features?: string) => unknown;
}

interface RuntimeOptionsPort extends Record<string, unknown> {
  tmPoseRuntime?: unknown;
  setLoading?: unknown;
}

interface LocalPreviewBrowserRuntimeOptions extends Record<string, unknown> {
  projectBytes: Uint8Array;
  maxProjectBytes?: unknown;
  maxArchiveEntries?: unknown;
  maxProjectJsonBytes?: unknown;
  maxSourceBytes?: unknown;
  maxAssetFiles?: unknown;
  maxTotalAssetBytes?: unknown;
  maxGenerationMessageBytes?: number;
  sourceFrontend: Dsl4SourceFrontend;
  runtimeOptions: RuntimeOptionsPort;
  globalObject?: RuntimeGlobalObject;
  sessionId: string;
  featureFlags?: unknown;
  document: Dsl4PreviewDocument;
  mount: Dsl4PreviewElement;
  platform?: unknown;
  stageWidth?: number;
  stageHeight?: number;
  historyNavigationAvailable?: unknown;
  subtleCrypto?: unknown;
  prepareVm?: (vm: unknown) => unknown | Promise<unknown>;
  onBridgeEvent?: PreviewCallback;
  onRuntimeEvent?: PreviewCallback;
  onError?: (error: unknown) => unknown;
  onApplicationOpen?: () => unknown;
}

interface RuntimeComponentFailure {
  readonly ok: false;
  readonly diagnostics?: readonly unknown[];
}

interface RuntimeComponentSuccess extends Readonly<Record<string, unknown>> {
  readonly ok: true;
  readonly standardRuntimeMarkerRequired?: boolean;
  readonly sourceDocumentMarkerExtensionIds?: readonly string[];
}

type RuntimeComponentResult = RuntimeComponentFailure | RuntimeComponentSuccess;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredFunction(value: unknown, name: string) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
  return value as PreviewCallback;
}

function optionalFunction(value: unknown, name: string) {
  if (value !== undefined && typeof value !== 'function') {
    throw new TypeError(`${name} must be a function`);
  }
  return value as PreviewCallback | undefined;
}

function installRuntimeMarker(vm: unknown, extensionId: string) {
  if (!isRecord(vm)) {
    throw new TypeError('TurboWarp VM must be an object');
  }
  const extensionManager = vm.extensionManager;
  if (!isRecord(extensionManager) || typeof extensionManager.addBuiltinExtension !== 'function') {
    throw new TypeError('TurboWarp VM must provide extensionManager.addBuiltinExtension');
  }
  class StandardRuntimeMarker {
    getInfo() {
      return {
        id: extensionId,
        name: 'Kamishibai DSL 4.0 local preview marker',
        blocks: [],
      };
    }
  }
  extensionManager.addBuiltinExtension(extensionId, StandardRuntimeMarker);
}

function boundedInteger(value: unknown, name: string, maximum: number) {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) {
    throw new TypeError(`${name} must be a safe integer between 1 and ${maximum}`);
  }
  return Number(value);
}

function validateTMRuntime(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.Webcam !== 'function' ||
    typeof value.loadFromFiles !== 'function'
  ) {
    throw new TypeError('runtimeOptions.tmPoseRuntime must provide Webcam and loadFromFiles');
  }
}

export class Dsl4LocalPreviewBrowserRuntimeError extends Error {
  code: string;

  constructor(code: string, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : {cause});
    this.name = 'Dsl4LocalPreviewBrowserRuntimeError';
    this.code = code;
  }
}

/** @returns {Dsl4LocalPreviewBrowserRuntimeError} */
function disposedError() {
  return new Dsl4LocalPreviewBrowserRuntimeError(
    'K4-PREVIEW-RUNTIME-DISPOSED',
    'The local preview browser runtime is disposed',
  );
}

function componentError(result: RuntimeComponentFailure) {
  const first = Array.isArray(result.diagnostics) ? result.diagnostics[0] : null;
  const error = new Dsl4LocalPreviewBrowserRuntimeError(
    'K4-PREVIEW-RUNTIME-COMPONENT-001',
    'The local preview base runtime component is invalid',
  );
  Object.defineProperty(error, 'diagnostics', {
    value: deepFreeze(Array.isArray(result.diagnostics) ? [...result.diagnostics] : []),
  });
  if (isRecord(first) && typeof first.code === 'string') {
    Object.defineProperty(error, 'diagnosticCode', {value: first.code});
  }
  return error;
}

/**
 * Scope the legacy global expected by pinned block-free TurboWarp compositions to this page.
 * The exact prior value is restored when the browser runtime owner is disposed.
 */
function installScratchCompatibility(globalObject: RuntimeGlobalObject, runtime: unknown) {
  const hadScratch = Object.hasOwn(globalObject, 'Scratch');
  const previousScratch = globalObject.Scratch;
  const inheritedScratch = isRecord(previousScratch) ? previousScratch : {};
  const inheritedVm = isRecord(inheritedScratch.vm) ? inheritedScratch.vm : {};
  const inheritedCast = isRecord(inheritedScratch.Cast) ? inheritedScratch.Cast : {};
  globalObject.Scratch = Object.freeze({
    ...inheritedScratch,
    vm: Object.freeze({...inheritedVm, runtime}),
    Cast: Object.freeze({
      ...inheritedCast,
      toString:
        typeof inheritedCast.toString === 'function'
          ? inheritedCast.toString.bind(inheritedCast)
          : (value: unknown) => String(value ?? ''),
    }),
    translate:
      typeof inheritedScratch.translate === 'function'
        ? inheritedScratch.translate.bind(inheritedScratch)
        : (value: unknown) => String(value ?? ''),
  });
  let restored = false;
  return () => {
    if (restored) return;
    if (hadScratch) globalObject.Scratch = previousScratch;
    else delete globalObject.Scratch;
    restored = true;
  };
}

/**
 * Own the validated base component, one visible TurboWarp stage, and the generation bridge.
 * External source text and paths never cross this browser boundary.
 */
export function createDsl4LocalPreviewBrowserRuntime(optionsInput: object) {
  if (!isRecord(optionsInput)) {
    throw new TypeError('local preview browser runtime options are required');
  }
  const options = optionsInput as LocalPreviewBrowserRuntimeOptions;
  if (!(options.projectBytes instanceof Uint8Array) || options.projectBytes.byteLength < 1) {
    throw new TypeError('projectBytes must be a non-empty Uint8Array');
  }
  const maxProjectBytes = boundedInteger(
    options.maxProjectBytes ?? dsl4BrowserTurboWarpStageDefaults.maxProjectBytes,
    'maxProjectBytes',
    dsl4BrowserTurboWarpStageMaximumProjectBytes,
  );
  if (options.projectBytes.byteLength > maxProjectBytes) {
    throw new TypeError(`projectBytes must contain 1-${maxProjectBytes} bytes`);
  }
  if (!isRecord(options.sourceFrontend) || typeof options.sourceFrontend.parse !== 'function') {
    throw new TypeError('sourceFrontend must provide parse');
  }
  if (!isRecord(options.runtimeOptions)) {
    throw new TypeError('runtimeOptions must be an object');
  }
  const globalObject = isRecord(options.globalObject)
    ? options.globalObject
    : (globalThis as unknown as RuntimeGlobalObject);
  if (typeof options.sessionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(options.sessionId)) {
    throw new TypeError('sessionId must contain 1-128 URL-safe characters');
  }
  optionalFunction(options.onBridgeEvent, 'onBridgeEvent');
  optionalFunction(options.onRuntimeEvent, 'onRuntimeEvent');
  optionalFunction(options.onError, 'onError');
  optionalFunction(options.onApplicationOpen, 'onApplicationOpen');
  const featureFlags = options.featureFlags ?? {dsl4Runtime: true};
  let retainedProjectBytes = new Uint8Array(options.projectBytes);

  let status = 'idle';
  let disposed = false;
  let disposeRequested = false;
  let stage: ReturnType<typeof createDsl4BrowserTurboWarpStage> | null = null;
  let bridge: ReturnType<typeof createDsl4BrowserPreviewRuntimeBridge> | null = null;
  let applicationMenu: ReturnType<typeof createDsl4RuntimeApplicationMenu> | null = null;
  let titleControls: ReturnType<typeof createDsl4RuntimeTitleControls> | null = null;
  let errorIndicator: ReturnType<typeof createDsl4RuntimeErrorIndicator> | null = null;
  let applicationLocale: 'en' | 'ja' = /^ja(?:-|$)/iu.test(globalObject.navigator?.language ?? '')
    ? 'ja'
    : 'en';
  let restoreScratchCompatibility: (() => void) | null = null;
  let startPromise: Promise<Readonly<Record<string, unknown>>> | null = null;
  let cleanupPromise: Promise<void> | null = null;
  let stageJoin: Promise<void> | null = null;
  let disposePromise: Promise<Readonly<Record<string, unknown>>> | null = null;

  function snapshot() {
    return deepFreeze({
      version: 1,
      status,
      ready: status === 'ready',
      disposed,
      stage: stage?.getState() ?? null,
      bridge: bridge?.getState() ?? null,
    });
  }

  function reportError(error: unknown) {
    try {
      options.onError?.(error);
    } catch {
      // Error observers cannot change runtime ownership.
    }
  }

  const failedCreations = createDsl4FailedCreationOwners('Preview runtime factory cleanup failed');
  const observers = createDsl4AssetObserverWaits((error) => {
    void failedCreations.joinLateFailure(error)?.catch(reportError);
    reportError(error);
  });
  const resourceCleanup = createDsl4RetryableCleanup({
    message: 'Local preview browser runtime cleanup failed',
    steps: [
      async () => {
        await applicationMenu?.dispose();
        applicationMenu = null;
      },
      async () => {
        await titleControls?.dispose();
        titleControls = null;
      },
      async () => {
        await errorIndicator?.dispose();
        errorIndicator = null;
      },
      {
        isPending: () => bridge?.hasPendingCleanup() ?? false,
        async run() {
          await bridge?.dispose();
          if (bridge?.hasPendingCleanup()) throw new Error('Preview bridge cleanup is pending');
          bridge = null;
        },
      },
      {
        isPending: () => stage?.hasPendingCleanup() ?? false,
        async run() {
          const pending = stageJoin;
          stageJoin = null;
          if (pending) await pending;
          else await stage?.dispose();
          if (stage?.hasPendingCleanup()) throw new Error('Preview stage cleanup is pending');
          stage = null;
        },
      },
      () => {
        restoreScratchCompatibility?.();
        restoreScratchCompatibility = null;
      },
      () => {
        retainedProjectBytes.fill(0);
        retainedProjectBytes = new Uint8Array(0);
      },
    ],
  });
  let cleanupRunning: Promise<void> | null = null;
  let startSettled = false;
  function cleanup() {
    if (cleanupRunning) return cleanupRunning;
    const operation = Promise.resolve().then(async () => {
      const results = await Promise.allSettled([resourceCleanup.run()]);
      results.push(...(await Promise.allSettled([failedCreations.drain()])));
      const errors = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      );
      if (errors.length) throw new AggregateError(errors, 'Preview runtime cleanup failed');
    });
    cleanupPromise = cleanupRunning = operation;
    const settled = () => {
      if (cleanupRunning === operation) cleanupRunning = null;
    };
    void operation.then(settled, settled);
    return operation;
  }

  function start() {
    if (disposed || disposeRequested) throw disposedError();
    if (startPromise) return startPromise;
    status = 'starting';
    startPromise = (async () => {
      try {
        const component = (await loadDsl4BrowserRuntimeComponent({
          projectBytes: retainedProjectBytes,
          sourceFrontend: options.sourceFrontend,
          maxProjectBytes,
          maxArchiveEntries: options.maxArchiveEntries,
          maxProjectJsonBytes: options.maxProjectJsonBytes,
          maxSourceBytes: options.maxSourceBytes,
          maxAssetFiles: options.maxAssetFiles,
          maxTotalAssetBytes: options.maxTotalAssetBytes,
          historyNavigationAvailable: options.historyNavigationAvailable,
          subtleCrypto: options.subtleCrypto,
        })) as unknown as RuntimeComponentResult;
        if (!component.ok) throw componentError(component);
        if (disposeRequested) throw disposedError();
        const runtimeOptions = {...options.runtimeOptions};
        validateTMRuntime(runtimeOptions.tmPoseRuntime);
        requiredFunction(runtimeOptions.setLoading, 'runtimeOptions.setLoading');

        const activeStage = createDsl4BrowserTurboWarpStage({
          document: options.document,
          mount: options.mount,
          projectBytes: retainedProjectBytes,
          platform: options.platform,
          ...((component.storyDocument as Readonly<Record<string, unknown>>).viewport === undefined
            ? {}
            : {viewport: (component.storyDocument as Readonly<Record<string, unknown>>).viewport}),
          maxProjectBytes,
          ...(options.stageWidth === undefined ? {} : {stageWidth: options.stageWidth}),
          ...(options.stageHeight === undefined ? {} : {stageHeight: options.stageHeight}),
          async prepareVm(vm) {
            const markers = new Set(component.sourceDocumentMarkerExtensionIds ?? []);
            if (component.standardRuntimeMarkerRequired === true)
              markers.add(standardRuntimeExtensionId);
            for (const marker of markers) installRuntimeMarker(vm, marker);
            await options.prepareVm?.(vm);
          },
        });
        stage = activeStage;
        try {
          await activeStage.start();
        } catch (error) {
          stageJoin = activeStage.cleanupCompletion;
          throw error;
        }
        if (disposeRequested) throw disposedError();

        const canvas = activeStage.getCanvas();
        const presentationMount =
          (component.storyDocument as Readonly<Record<string, unknown>>).viewport === undefined
            ? options.mount
            : ((canvas as unknown as HTMLCanvasElement)
                .parentElement as unknown as Dsl4PreviewElement);
        const showApplicationMenu = () => {
          if (disposeRequested || disposed) return;
          titleControls?.hide();
          activeStage.showApplicationMenu(applicationLocale);
          applicationMenu?.show(applicationLocale);
        };
        const hideApplicationUi = () => {
          errorIndicator?.hide();
          applicationMenu?.hide();
          titleControls?.hide();
          activeStage.hideApplicationOverlay();
        };
        // A failed run never resolves as rejected, so without this the stage would just stop.
        const showRuntimeFailure = (diagnosticInput: unknown) => {
          if (disposeRequested || disposed) return;
          const diagnostic = isRecord(diagnosticInput)
            ? diagnosticInput
            : {message: String(diagnosticInput ?? 'DSL 4.0 story execution failed.')};
          try {
            applicationMenu?.hide();
            titleControls?.hide();
            errorIndicator ??= createDsl4RuntimeErrorIndicator({
              document: options.document,
              mount: options.mount,
              locales: {en: {title: runtimeFailureTitles.en}, ja: {title: runtimeFailureTitles.ja}},
              initialLocale: applicationLocale,
              runtimeVersion: dsl4RuntimeProvenance[0]!.version,
              onReturnToMenu() {
                errorIndicator?.hide();
                showApplicationMenu();
              },
            });
            errorIndicator.show(
              {
                ...diagnostic,
                title: runtimeFailureTitles[applicationLocale],
                phase: 'preview',
              },
              {returnToMenu: true},
            );
          } catch (indicatorError) {
            failedCreations.retain(indicatorError);
            reportError(indicatorError);
          }
        };
        applicationMenu = createDsl4RuntimeApplicationMenu({
          document: options.document,
          mount: presentationMount,
          locales: {
            en: {open: 'Open', reload: 'Reload', about: 'About', language: 'Language'},
            ja: {
              open: '台本を開く',
              reload: 'もう一度',
              about: 'アプリ情報',
              language: '言語',
            },
          },
          icons: dsl4RuntimeApplicationMenuDefaultIcons,
          onOpen() {
            const hostOpenButton = options.document.querySelector?.(
              '#dsl4-web-preview-open-project',
            );
            if (typeof hostOpenButton?.click === 'function') return hostOpenButton.click();
            if (options.onApplicationOpen) return options.onApplicationOpen();
            throw new Error('This preview host does not provide a project-open action.');
          },
          async onReload() {
            hideApplicationUi();
            try {
              await bridge?.restart('storyStart');
            } catch (error) {
              showApplicationMenu();
              throw error;
            }
          },
          onAbout() {
            applicationMenu?.hide();
            activeStage.showApplicationTitle(applicationLocale);
            titleControls?.show(applicationLocale);
          },
          onLocaleChange(locale) {
            applicationLocale = locale;
            showApplicationMenu();
          },
          onError: reportError,
        });
        titleControls = createDsl4RuntimeTitleControls({
          document: options.document,
          mount: presentationMount,
          locales: {
            en: {website: 'Open Official Website', close: 'Close', start: 'Start Kamishibai'},
            ja: {website: '公式Webサイトを開く', close: '閉じる', start: '紙芝居を始める'},
          },
          onWebsite() {
            globalObject.open?.(
              'https://kubohiroya.github.io/turbowarp-kamishibai-app/',
              '_blank',
              'noopener,noreferrer',
            );
          },
          onClose: showApplicationMenu,
          onError: reportError,
        });
        restoreScratchCompatibility = installScratchCompatibility(
          globalObject,
          activeStage.getRuntime(),
        );
        const createSession = createDsl4TurboWarpPreviewSessionFactory({
          ...runtimeOptions,
          featureFlags,
          runtimeComponent: component,
          runtime: activeStage.getRuntime(),
          resetManagedPresentation: () => activeStage.resetManagedPresentation(),
          inputTarget: canvas,
          stagePointerTarget: canvas,
          historyNavigationAvailable: options.historyNavigationAvailable,
          onEvent(event: Readonly<Record<string, unknown>>) {
            if (disposeRequested || disposed) return;
            if (event?.type === 'runtime.finish') {
              showApplicationMenu();
            } else if (event?.type === 'runtime.fail') {
              showRuntimeFailure(event.diagnostic);
            } else if (event?.type === 'runtime.start') {
              errorIndicator?.hide();
            }
            options.onRuntimeEvent?.(event);
          },
        });
        const activeBridge = createDsl4BrowserPreviewRuntimeBridge({
          createSession,
          sessionId: options.sessionId,
          ...(options.maxGenerationMessageBytes === undefined
            ? {}
            : {maxGenerationMessageBytes: options.maxGenerationMessageBytes}),
          onEvent: (event: unknown) => {
            if (disposeRequested || disposed) return;
            return observers.wait(() => options.onBridgeEvent?.(event));
          },
          onError: reportError,
        });
        bridge = activeBridge;
        await activeBridge.start();
        if (disposeRequested) throw disposedError();

        retainedProjectBytes.fill(0);
        retainedProjectBytes = new Uint8Array(0);
        status = 'ready';
        return snapshot();
      } catch (error) {
        failedCreations.retain(error);
        if (!disposeRequested) status = 'failed';
        try {
          await cleanup();
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            'Local preview browser runtime startup and cleanup failed',
          );
        }
        throw error;
      }
    })();
    const settled = () => {
      startSettled = true;
    };
    void startPromise.then(settled, settled);
    return startPromise;
  }

  function activeBridge() {
    if (disposed || disposeRequested) throw disposedError();
    if (status !== 'ready' || !bridge) {
      throw new Dsl4LocalPreviewBrowserRuntimeError(
        'K4-PREVIEW-RUNTIME-NOT-READY',
        'The local preview browser runtime is not ready',
      );
    }
    return bridge;
  }

  function dispose() {
    if (disposePromise) return disposePromise;
    disposeRequested = true;
    status = 'disposing';
    failedCreations.beginDispose();
    const pendingCleanup = cleanupRunning;
    const priorCleanup = cleanupPromise;
    const waitingForStart = startPromise !== null && !startSettled;
    const operation = Promise.resolve().then(async () => {
      if (startPromise) await startPromise.catch(() => {});
      // Join cleanup begun during startup; a later explicit call may retry its failure.
      if (pendingCleanup) await pendingCleanup;
      else if (waitingForStart && cleanupPromise && cleanupPromise !== priorCleanup)
        await cleanupPromise;
      else await cleanup();
      status = 'disposed';
      return snapshot();
    });
    disposePromise = operation;
    observers.close();
    disposed = true;
    const settled = () => {
      failedCreations.endDispose();
      status = 'disposed';
      disposePromise = null;
    };
    void operation.then(settled, settled);
    return operation;
  }

  return Object.freeze({
    start,
    accept(record: unknown) {
      return activeBridge().accept(record);
    },
    commit(choice: unknown) {
      return activeBridge().commit(choice);
    },
    restart(choice: unknown) {
      return activeBridge().restart(choice);
    },
    defer() {
      return activeBridge().defer();
    },
    async whenIdle() {
      await activeBridge().whenIdle();
      return snapshot();
    },
    dispose,
    getState: snapshot,
    hasPendingCleanup: () =>
      resourceCleanup.hasPendingCleanup() || failedCreations.hasPendingCleanup(),
    get cleanupCompletion() {
      return cleanupPromise;
    },
  });
}
