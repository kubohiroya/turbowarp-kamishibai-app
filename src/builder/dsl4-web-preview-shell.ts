import {createDsl4PreviewOwnerCleanup} from '../dsl4/preview-owner-cleanup.js';
import {Dsl4PreviewReloadDisposedError} from '../dsl4/preview-reload-cancellation.js';
import type {Dsl4PreviewDocument, Dsl4PreviewElement} from '../dsl4/preview-dom.js';
import type {Dsl4PreviewReloadSurface} from '../dsl4/preview-reload-surface-contract.js';
import {createDsl4BrowserAssetReloadPipeline} from '../dsl4/browser-asset-reload-pipeline.js';
import {createDsl4BrowserPreviewCoordinator} from '../dsl4/browser-preview-coordinator.js';
import {createDsl4DiagnosticUiProjection} from '../dsl4/diagnostic-projection.js';
import {resolveDsl4FeatureFlags} from '../dsl4/feature-flags.js';
import {deepFreeze} from '../dsl4/story-document.js';
import {createDsl4PreviewReloadSurface} from './dsl4-preview-reload-surface.js';
import {createDsl4DevelopmentPreviewShell} from './dsl4-preview-shell.js';

const optionKeys = new Set([
  'assetPipelineOptions',
  'capabilities',
  'createAssetPipeline',
  'createCoordinator',
  'createReloadSurface',
  'document',
  'debugExecution',
  'environment',
  'featureFlags',
  'maxSourceBytes',
  'maxSourceFiles',
  'maxTotalSourceBytes',
  'maxIncludeDepth',
  'mount',
  'onError',
  'onDiagnostic',
  'onDistributionBuildState',
  'onProjectRoot',
  'prepareSourceResult',
  'protocolSession',
  'previewFormatTime',
  'previewLocale',
  'previewStageControls',
  'previewReducedMotion',
  'previewSafeArea',
  'previewStorage',
  'previewViewport',
  'presentation',
  'sessionId',
  'sourceFrontend',
  'sourceOptions',
]);
const requiredEnabledKeys = new Set([
  'document',
  'environment',
  'maxSourceBytes',
  'mount',
  'protocolSession',
  'sessionId',
  'sourceFrontend',
]);
const restartChoiceNames = Object.freeze({
  1: 'storyStart',
  2: 'currentScene',
  3: 'currentAction',
});
const restartAnchorNames = Object.freeze({
  story: 'storyStart',
  scene: 'currentScene',
  action: 'currentAction',
});
const fallbackDiagnosticCodes = new Set([
  'K4-WEB-PREVIEW-INSECURE-CONTEXT',
  'K4-WEB-PREVIEW-PERMISSION-DENIED',
  'K4-WEB-PREVIEW-PERMISSION-REVOKED',
  'K4-WEB-PREVIEW-UNSUPPORTED',
]);
const missingDiagnosticCodes = new Set(['K4-SOURCE-MISSING', 'K4-WEB-PREVIEW-MANIFEST-MISSING']);

export const dsl4WebPreviewShellManifest = deepFreeze({
  formatVersion: 1,
  production: false,
  module: 'src/builder/dsl4-web-preview-shell.js',
  featureFlags: [
    'dsl4Runtime',
    'dsl4AppShell',
    'dsl4WebPreviewAdapter',
    'dsl4BrowserDistributionBuild',
    'dsl4WebPreviewAssetLiveReload',
    'dsl4PreviewReloadOverlay',
    'dsl4Debugger',
  ],
  fallbackCommands: [
    'turbowarp-kamishibai preview-dsl4 --watch',
    'turbowarp-kamishibai validate-dsl4',
    'turbowarp-kamishibai build-dsl4',
  ],
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireElement(value: unknown, name: string) {
  if (!isRecord(value) || typeof value.appendChild !== 'function') {
    throw new TypeError(`${name} must be a DOM element`);
  }
  return value as unknown as Dsl4PreviewElement;
}

function requireDocument(value: unknown) {
  if (!isRecord(value) || typeof value.createElement !== 'function') {
    throw new TypeError('document must provide the DOM document contract');
  }
  return value as unknown as Dsl4PreviewDocument;
}

function element(document: Dsl4PreviewDocument, tag: string, text?: string) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function safeMessage(value: unknown) {
  const message = String(value ?? 'Web Preview status changed')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, ' ')
    .trim();
  return (message || 'Web Preview status changed').slice(0, 500);
}

function warningCount(value: unknown) {
  if (!Array.isArray(value)) return 0;
  return value.filter((diagnostic) => isRecord(diagnostic) && diagnostic.severity === 'warning')
    .length;
}

function collectionSize(value: unknown) {
  if (Array.isArray(value)) return value.length;
  return isRecord(value) ? Object.keys(value).length : 0;
}

interface WebPreviewDiagnostic {
  readonly formatVersion?: unknown;
  readonly version?: unknown;
  readonly code?: unknown;
  readonly severity?: unknown;
  readonly message?: unknown;
  readonly sourceId?: unknown;
  readonly range?: unknown;
  readonly storyPath?: unknown;
  readonly path?: unknown;
  readonly related?: unknown;
  readonly displayName?: unknown;
  readonly channel?: unknown;
}

interface WebPreviewStoryScene {
  readonly actions?: readonly unknown[];
}

interface WebPreviewStoryDocument {
  readonly scenes?: readonly WebPreviewStoryScene[];
  readonly assets?: unknown;
  readonly assetReferences?: unknown;
}

interface WebPreviewSourceSnapshot {
  readonly integrity?: unknown;
  readonly displayName?: unknown;
}

interface WebPreviewSourceResult {
  readonly ok?: unknown;
  readonly canonicalSource?: unknown;
  readonly diagnostics?: readonly WebPreviewDiagnostic[];
  readonly sourceSnapshot?: WebPreviewSourceSnapshot;
  readonly storyDocument?: WebPreviewStoryDocument;
}

interface WebPreviewSourceDetails {
  readonly integrity: string;
  readonly sourceDisplayName: string;
  readonly counts: Readonly<{scenes: number; actions: number; assets: number}>;
  readonly warningCount: number;
}

interface WebPreviewChoiceState {
  readonly enabled?: unknown;
  readonly reason?: unknown;
}

interface WebPreviewReloadChoices {
  readonly storyStart?: WebPreviewChoiceState;
  readonly currentScene?: WebPreviewChoiceState;
  readonly currentAction?: WebPreviewChoiceState;
}

interface WebPreviewProtocolRevision {
  readonly integrity?: unknown;
}

interface WebPreviewCandidate {
  readonly options?: unknown;
}

interface WebPreviewProtocolEvent {
  readonly type?: unknown;
  readonly diagnostics?: readonly WebPreviewDiagnostic[];
  readonly sourceIntegrity?: unknown;
  readonly candidate?: WebPreviewCandidate;
  readonly current?: WebPreviewProtocolRevision;
  readonly revision?: unknown;
}

interface WebPreviewSourceState {
  readonly started?: unknown;
  readonly status?: string;
  readonly sourceDisplayName?: unknown;
  readonly lastPublication?: {
    readonly kind?: unknown;
    readonly ok?: unknown;
    readonly integrity?: unknown;
  };
}

interface WebPreviewProtocolState {
  readonly current?: WebPreviewProtocolRevision | null;
  readonly candidate?: unknown;
  readonly pendingStages?: unknown;
  readonly status?: string;
}

interface WebPreviewCoordinatorState {
  readonly source: WebPreviewSourceState;
  readonly protocol: WebPreviewProtocolState;
}

interface WebPreviewAssetTransaction {
  readonly diagnostic?: unknown;
  readonly candidate?: unknown;
  readonly status?: string;
}

interface WebPreviewAssetPipelineState {
  readonly transaction?: WebPreviewAssetTransaction | null;
}

interface WebPreviewAssetPipelineOptions {
  readonly structuralFingerprint: string;
  readonly adapterOptions: unknown;
  readonly prepareGeneration: WebPreviewCallback;
  readonly restartGeneration?: WebPreviewCallback;
  readonly [name: string]: unknown;
}

type WebPreviewCallback = (...values: unknown[]) => unknown;
type WebPreviewAsyncCallback = (...values: unknown[]) => Promise<unknown> | unknown;

interface WebPreviewOptions {
  readonly assetPipelineOptions?: unknown;
  readonly capabilities?: unknown;
  readonly createAssetPipeline?: unknown;
  readonly createCoordinator?: unknown;
  readonly createReloadSurface?: unknown;
  readonly document?: unknown;
  readonly debugExecution?: unknown;
  readonly environment?: unknown;
  readonly featureFlags?: unknown;
  readonly maxSourceBytes?: unknown;
  readonly maxSourceFiles?: unknown;
  readonly maxTotalSourceBytes?: unknown;
  readonly maxIncludeDepth?: unknown;
  readonly mount?: unknown;
  readonly onError?: unknown;
  readonly onDiagnostic?: unknown;
  readonly onDistributionBuildState?: unknown;
  readonly onProjectRoot?: unknown;
  readonly prepareSourceResult?: unknown;
  readonly protocolSession?: unknown;
  readonly previewFormatTime?: unknown;
  readonly previewLocale?: 'en' | 'ja';
  readonly previewStageControls?: Parameters<
    typeof createDsl4PreviewReloadSurface
  >[0]['stageControls'];
  readonly previewReducedMotion?: unknown;
  readonly previewSafeArea?: unknown;
  readonly previewStorage?: unknown;
  readonly previewViewport?: unknown;
  readonly presentation?: unknown;
  readonly sessionId?: unknown;
  readonly sourceFrontend?: unknown;
  readonly sourceOptions?: unknown;
}

interface WebPreviewProjectRoot {
  readonly dsl4SourceOnly?: unknown;
}

interface WebPreviewReloadRequest {
  readonly actualAnchor?: unknown;
}

interface WebPreviewView {
  readonly formatVersion: 1;
  readonly phase: string;
  readonly sourceDisplayName: string;
  readonly currentIntegrity: unknown;
  readonly candidateIntegrity: unknown;
  readonly validationStatus: string;
  readonly counts: unknown;
  readonly anchor: unknown;
  readonly choices: unknown;
  readonly warningCount: number;
  readonly changeCategories: readonly string[];
  readonly safeStatusMessage: string;
}

function reloadDiagnostic(diagnostic: WebPreviewDiagnostic) {
  const keys = [
    'formatVersion',
    'version',
    'code',
    'severity',
    'message',
    'sourceId',
    'range',
    'storyPath',
    'path',
    'related',
  ] as const satisfies readonly (keyof WebPreviewDiagnostic)[];
  return deepFreeze(
    Object.fromEntries(
      keys.filter((key) => Object.hasOwn(diagnostic, key)).map((key) => [key, diagnostic[key]]),
    ),
  );
}

function isReloadChoices(value: unknown): value is WebPreviewReloadChoices {
  return (
    isRecord(value) &&
    isRecord(value.storyStart) &&
    isRecord(value.currentScene) &&
    isRecord(value.currentAction)
  );
}

function sourceDetails(result: unknown) {
  if (!isRecord(result)) return null;
  const snapshot = isRecord(result.sourceSnapshot) ? result.sourceSnapshot : null;
  const storyDocument = isRecord(result.storyDocument) ? result.storyDocument : null;
  if (!snapshot || typeof snapshot.integrity !== 'string' || !storyDocument) return null;
  const scenes = Array.isArray(storyDocument.scenes) ? storyDocument.scenes : [];
  return deepFreeze({
    integrity: snapshot.integrity,
    sourceDisplayName:
      typeof snapshot.displayName === 'string' ? snapshot.displayName : 'story.kamishibai.yaml',
    counts: {
      scenes: scenes.length,
      actions: scenes.reduce(
        (total, scene) =>
          total + (isRecord(scene) && Array.isArray(scene.actions) ? scene.actions.length : 0),
        0,
      ),
      assets: Math.max(
        collectionSize(storyDocument.assets),
        collectionSize(storyDocument.assetReferences),
      ),
    },
    warningCount: warningCount(result.diagnostics),
  });
}

/**
 * The collaborators the shell drives, named rather than indexed.
 *
 * Each interface lists exactly the members the validator below checks for and the shell calls. An
 * index signature would leave every one possibly undefined and say nothing about its arguments.
 */
interface PreviewCoordinatorSurface {
  openProject(handle?: unknown): unknown;
  start(projectRoot: unknown, context?: unknown): unknown;
  restart(anchor: unknown, context?: unknown): unknown;
  pollNow(): unknown;
  commit(choice: unknown, context?: unknown): unknown;
  defer(): unknown;
  dispose(): unknown;
  hasPendingCleanup?(): boolean;
  getState(): WebPreviewCoordinatorState;
  whenIdle(): Promise<unknown>;
}

interface PreviewAssetPipelineSurface {
  start(projectRoot: unknown, context?: unknown): unknown;
  updateSource(context: unknown): unknown;
  pollNow(): unknown;
  dispose(): unknown;
  hasPendingCleanup?(): boolean;
  getState(): WebPreviewAssetPipelineState;
  whenIdle(): Promise<unknown>;
}

function validateCoordinator(value: unknown, requireRestart: boolean) {
  if (
    !isRecord(value) ||
    typeof value.openProject !== 'function' ||
    typeof value.start !== 'function' ||
    typeof value.pollNow !== 'function' ||
    typeof value.commit !== 'function' ||
    typeof value.defer !== 'function' ||
    typeof value.dispose !== 'function' ||
    typeof value.getState !== 'function' ||
    typeof value.whenIdle !== 'function' ||
    (requireRestart && typeof value.restart !== 'function')
  ) {
    throw new TypeError('browser preview coordinator does not implement the required contract');
  }
  return value as unknown as PreviewCoordinatorSurface;
}

function validateAssetPipeline(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.start !== 'function' ||
    typeof value.updateSource !== 'function' ||
    typeof value.pollNow !== 'function' ||
    typeof value.dispose !== 'function' ||
    typeof value.getState !== 'function' ||
    typeof value.whenIdle !== 'function'
  ) {
    throw new TypeError('browser asset pipeline does not implement the required contract');
  }
  return value as unknown as PreviewAssetPipelineSurface;
}

function restartChoice(value: unknown) {
  if (typeof value !== 'string' || !Object.hasOwn(restartAnchorNames, value)) {
    throw new TypeError('preview reload anchor is invalid');
  }
  return restartAnchorNames[value as 'story' | 'scene' | 'action'];
}

function validateReloadSurface(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.setVisible !== 'function' ||
    typeof value.submitCandidate !== 'function' ||
    typeof value.setDiagnostic !== 'function' ||
    typeof value.setWatchState !== 'function' ||
    typeof value.acknowledgePreviewInput !== 'function' ||
    typeof value.registerReservedRect !== 'function' ||
    typeof value.updateReservedRect !== 'function' ||
    typeof value.unregisterReservedRect !== 'function' ||
    typeof value.updateViewport !== 'function' ||
    typeof value.dispose !== 'function' ||
    typeof value.getSnapshot !== 'function' ||
    typeof value.whenIdle !== 'function'
  ) {
    throw new TypeError('preview reload surface does not implement the required contract');
  }
  return value as unknown as Dsl4PreviewReloadSurface;
}

function validateAssetPipelineOptions(value: unknown, requireRestart: boolean) {
  if (!isRecord(value)) throw new TypeError('assetPipelineOptions must be an object');
  if (
    typeof value.structuralFingerprint !== 'string' ||
    !/^sha256-[A-Za-z0-9+/]{43}=$/u.test(value.structuralFingerprint)
  ) {
    throw new TypeError('assetPipelineOptions.structuralFingerprint must be canonical SHA-256 SRI');
  }
  if (!isRecord(value.adapterOptions) || typeof value.prepareGeneration !== 'function') {
    throw new TypeError('assetPipelineOptions must provide adapterOptions and prepareGeneration');
  }
  if (requireRestart && typeof value.restartGeneration !== 'function') {
    throw new TypeError(
      'assetPipelineOptions.restartGeneration is required with the shared reload overlay',
    );
  }
  return value as unknown as WebPreviewAssetPipelineOptions;
}

function geometry(value: unknown, fallback: Readonly<Record<string, number>>) {
  return isRecord(value) ? value : fallback;
}

function reloadAvailability(value: unknown) {
  if (!isRecord(value)) throw new TypeError('preview reload choices are invalid');
  function available(choice: unknown, fallbackReason: string) {
    if (!isRecord(choice) || typeof choice.enabled !== 'boolean') {
      throw new TypeError('preview reload choice is invalid');
    }
    return {
      available: choice.enabled,
      reason:
        choice.enabled === true
          ? null
          : safeMessage(
              typeof choice.reason === 'string' && choice.reason.length > 0
                ? choice.reason
                : fallbackReason,
            ).slice(0, 300),
    };
  }
  const story = available(value.storyStart, 'The story restart anchor is unavailable.');
  if (!story.available) throw new TypeError('story reload anchor must always be available');
  const scene = available(value.currentScene, 'The current scene is unavailable.');
  const action = available(value.currentAction, 'The current action is unavailable.');
  return deepFreeze({
    story,
    scene,
    action: {...action, replaySafe: action.available},
  });
}

/** Mount the development-only browser project picker and connect it to the reload shell. */
export function createDsl4WebPreviewShell(input: unknown = {}) {
  if (!isRecord(input)) throw new TypeError('web preview shell options must be an object');
  const options = input as WebPreviewOptions;
  const unknownKeys = Object.keys(input).filter((key) => !optionKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new TypeError(`Unknown web preview shell option: ${unknownKeys.sort().join(', ')}`);
  }
  const featureFlags = resolveDsl4FeatureFlags(options.featureFlags);
  if (!featureFlags.dsl4WebPreviewAdapter) {
    const snapshot = deepFreeze({version: 1, enabled: false, disposed: false, featureFlags});
    return Object.freeze({
      enabled: false,
      element: null,
      featureFlags,
      getSnapshot: () => snapshot,
      dispose: () => snapshot,
    });
  }

  const missing = [...requiredEnabledKeys].filter((key) => !Object.hasOwn(input, key));
  if (missing.length > 0) {
    throw new TypeError(`Web Preview requires options: ${missing.sort().join(', ')}`);
  }
  if (options.environment !== 'development') {
    throw new TypeError('Web Preview shell is available only in the development environment');
  }
  const document = requireDocument(options.document);
  const mount = requireElement(options.mount, 'mount');
  const presentation = options.presentation ?? 'full';
  if (!['full', 'runtime'].includes(String(presentation))) {
    throw new TypeError('Web Preview presentation must be full or runtime');
  }
  if (options.onError !== undefined && typeof options.onError !== 'function') {
    throw new TypeError('onError must be a function');
  }
  if (options.onDiagnostic !== undefined && typeof options.onDiagnostic !== 'function') {
    throw new TypeError('onDiagnostic must be a function');
  }
  if (
    options.onDistributionBuildState !== undefined &&
    typeof options.onDistributionBuildState !== 'function'
  ) {
    throw new TypeError('onDistributionBuildState must be a function');
  }
  if (options.onProjectRoot !== undefined && typeof options.onProjectRoot !== 'function') {
    throw new TypeError('onProjectRoot must be a function');
  }
  if (
    options.prepareSourceResult !== undefined &&
    typeof options.prepareSourceResult !== 'function'
  ) {
    throw new TypeError('prepareSourceResult must be a function');
  }
  if (
    featureFlags.dsl4Debugger &&
    (!isRecord(options.debugExecution) ||
      typeof options.debugExecution.beforeAction !== 'function' ||
      typeof options.debugExecution.getState !== 'function' ||
      typeof options.debugExecution.subscribe !== 'function' ||
      typeof options.debugExecution.setMode !== 'function' ||
      typeof options.debugExecution.resume !== 'function')
  ) {
    throw new TypeError('Web Preview requires debugExecution when dsl4Debugger is enabled');
  }
  const prepareSourceResult = options.prepareSourceResult as WebPreviewAsyncCallback | undefined;
  const projectRootObserver = options.onProjectRoot as WebPreviewAsyncCallback | undefined;
  const distributionBuildObserver = options.onDistributionBuildState as
    WebPreviewCallback | undefined;
  const errorObserver = options.onError as WebPreviewCallback | undefined;
  const diagnosticObserver = options.onDiagnostic as WebPreviewCallback | undefined;
  const createCoordinator = options.createCoordinator ?? createDsl4BrowserPreviewCoordinator;
  if (typeof createCoordinator !== 'function') {
    throw new TypeError('createCoordinator must be a function');
  }
  const assetPipelineOptions = featureFlags.dsl4WebPreviewAssetLiveReload
    ? validateAssetPipelineOptions(
        options.assetPipelineOptions,
        featureFlags.dsl4PreviewReloadOverlay,
      )
    : null;
  const createAssetPipeline = featureFlags.dsl4WebPreviewAssetLiveReload
    ? (options.createAssetPipeline ?? createDsl4BrowserAssetReloadPipeline)
    : null;
  if (createAssetPipeline !== null && typeof createAssetPipeline !== 'function') {
    throw new TypeError('createAssetPipeline must be a function');
  }
  const createReloadSurface = featureFlags.dsl4PreviewReloadOverlay
    ? (options.createReloadSurface ?? createDsl4PreviewReloadSurface)
    : null;
  if (createReloadSurface !== null && typeof createReloadSurface !== 'function') {
    throw new TypeError('createReloadSurface must be a function');
  }

  const cleanup = createDsl4PreviewOwnerCleanup('Web Preview shell cleanup failed');
  let disposed = false;
  try {
    const host = element(document, 'section');
    cleanup.add(() => host.remove());
    host.id = 'dsl4-web-preview-shell';
    host.setAttribute('data-dsl4-development-only', 'true');
    host.setAttribute('data-preview-presentation', String(presentation));
    host.setAttribute('aria-labelledby', 'dsl4-web-preview-title');
    const title = element(document, 'h1', 'DSL 4.0 Web Preview');
    title.id = 'dsl4-web-preview-title';
    const introduction = element(
      document,
      'p',
      'Select a project directory to validate and reload its DSL 4.0 source.',
    );
    const openButton = element(document, 'button', 'Open project directory');
    openButton.id = 'dsl4-web-preview-open-project';
    openButton.type = 'button';
    const watchStatus = element(document, 'p', 'Web Preview is idle.');
    watchStatus.id = 'dsl4-web-preview-watch-status';
    watchStatus.setAttribute('role', 'status');
    watchStatus.setAttribute('aria-live', 'polite');
    const diagnosticStatus = element(document, 'p');
    diagnosticStatus.id = 'dsl4-web-preview-diagnostic';
    diagnosticStatus.setAttribute('role', 'alert');
    diagnosticStatus.setAttribute('aria-live', 'assertive');
    const fallback = element(
      document,
      'p',
      'Browser folder access is unavailable. Use `turbowarp-kamishibai preview-dsl4 --watch`, `turbowarp-kamishibai validate-dsl4`, or `turbowarp-kamishibai build-dsl4` from a terminal.',
    );
    fallback.id = 'dsl4-web-preview-fallback';
    fallback.hidden = true;
    const reloadMount = element(document, 'div');
    reloadMount.id = 'dsl4-web-preview-reload-mount';
    host.appendChild(title);
    host.appendChild(introduction);
    host.appendChild(openButton);
    host.appendChild(watchStatus);
    host.appendChild(diagnosticStatus);
    host.appendChild(fallback);
    host.appendChild(reloadMount);
    if (presentation === 'runtime') {
      for (const element of [
        title,
        introduction,
        openButton,
        watchStatus,
        diagnosticStatus,
        fallback,
      ]) {
        element.hidden = true;
      }
      reloadMount.hidden = true;
    }
    mount.appendChild(host);

    let diagnosticCode: string | null = null;
    let sourceDisplayName = 'story.kamishibai.yaml';
    let activeDetails: WebPreviewSourceDetails | null = null;
    let candidateDetails: WebPreviewSourceDetails | null = null;
    let disposePromise: Promise<unknown> | null = null;
    const detailsByIntegrity = new Map<unknown, WebPreviewSourceDetails>();
    let selectedProjectRoot: WebPreviewProjectRoot | null = null;
    let latestValidSourceResult: WebPreviewSourceResult | null = null;
    let assetPipeline: PreviewAssetPipelineSurface | null = null;
    let assetPipelineStarted = false;
    let assetSourceQueue = Promise.resolve();
    let reloadSurface: Dsl4PreviewReloadSurface | null = null;
    let manualRestartDepth = 0;

    function reportError(error: unknown) {
      if (!disposed)
        diagnosticStatus.textContent = safeMessage(
          isRecord(error) && typeof error.message === 'string' ? error.message : error,
        );
      try {
        errorObserver?.(error);
      } catch {
        // Error observers cannot change Web Preview state.
      }
    }

    function observe(operation: Promise<unknown> | unknown) {
      Promise.resolve(operation).catch(reportError);
    }

    async function notifyAssetObserver(name: string, ...values: unknown[]) {
      const observer = assetPipelineOptions?.[name];
      if (typeof observer !== 'function') return;
      try {
        await observer(...values);
      } catch (error) {
        reportError(error);
      }
    }

    /** A source that declared `include` comes back composed, with the origin of every StoryPath. */
    function composedFromIncludes(result: WebPreviewSourceResult) {
      const storyDocument = (result as {storyDocument?: unknown}).storyDocument;
      return isRecord(storyDocument) && isRecord(storyDocument.sourceOrigins);
    }

    function queueAssetSource(result: WebPreviewSourceResult) {
      if (!assetPipeline || !assetPipelineOptions || !selectedProjectRoot || disposed) {
        return Promise.resolve();
      }
      const context = {
        sourceResult: result,
        structuralFingerprint: assetPipelineOptions.structuralFingerprint,
      };
      assetSourceQueue = assetSourceQueue.then(async () => {
        if (disposed || !assetPipeline) return;
        if (assetPipelineStarted) await assetPipeline.updateSource(context);
        else {
          assetPipelineStarted = true;
          await assetPipeline.start(selectedProjectRoot, context);
        }
      });
      observe(assetSourceQueue);
      return assetSourceQueue;
    }

    async function prepareIncludedSourceAssets(result: WebPreviewSourceResult) {
      requireActive();
      if (
        result.ok !== true ||
        !composedFromIncludes(result) ||
        !featureFlags.dsl4WebPreviewAssetLiveReload
      ) {
        await prepareSourceResult?.(result);
        return;
      }
      await queueAssetSource(result);
      requireActive();
      const transaction = assetPipeline?.getState()?.transaction;
      if (
        !transaction ||
        typeof transaction.status !== 'string' ||
        !['ready', 'active'].includes(transaction.status)
      ) {
        throw new TypeError('Source Graph assets must be stable before source candidate staging');
      }
      await prepareSourceResult?.(result);
    }

    async function setProjectRoot(projectRoot: WebPreviewProjectRoot) {
      requireActive();
      selectedProjectRoot = projectRoot;
      await projectRootObserver?.(projectRoot);
      requireActive();
      if (latestValidSourceResult) queueAssetSource(latestValidSourceResult);
      notifyDistributionBuildState();
    }

    function render(view: WebPreviewView) {
      if (disposed) return;
      try {
        previewShell.update(view);
      } catch (error) {
        reportError(error);
      }
    }

    function renderDiagnostic(
      diagnostic: WebPreviewDiagnostic,
      channel: 'source' | 'asset' = 'source',
    ) {
      if (disposed) return;
      const visibleDiagnostic = deepFreeze({
        ...diagnostic,
        channel,
        ...(typeof diagnostic.displayName === 'string' ? {} : {displayName: sourceDisplayName}),
      }) as WebPreviewDiagnostic;
      diagnosticCode = typeof visibleDiagnostic.code === 'string' ? visibleDiagnostic.code : null;
      const message = safeMessage(
        diagnosticCode
          ? `${diagnosticCode}: ${String(visibleDiagnostic.message ?? 'Web Preview failed')}`
          : visibleDiagnostic.message,
      );
      diagnosticStatus.textContent = message;
      try {
        diagnosticObserver?.(visibleDiagnostic, channel);
      } catch (error) {
        reportError(error);
      }
      if (reloadSurface)
        observe(reloadSurface.setDiagnostic(channel, reloadDiagnostic(diagnostic)));
      fallback.hidden = !diagnosticCode || !fallbackDiagnosticCodes.has(diagnosticCode);
      if (visibleDiagnostic.severity !== 'error') return;
      const currentIntegrity = coordinator?.getState()?.protocol?.current?.integrity ?? null;
      render({
        formatVersion: 1,
        phase: 'invalid',
        sourceDisplayName,
        currentIntegrity,
        candidateIntegrity: null,
        validationStatus:
          diagnosticCode && missingDiagnosticCodes.has(diagnosticCode) ? 'missing' : 'invalid',
        counts: null,
        anchor: null,
        choices: null,
        warningCount: 0,
        changeCategories: [],
        safeStatusMessage: message,
      });
    }

    function onProtocolEvent(event: WebPreviewProtocolEvent) {
      if (disposed) return;
      if (event.type === 'preview.handshake.ack') {
        watchStatus.textContent = 'Preview protocol connected. Select a project directory.';
        return;
      }
      if (event.type === 'preview.source.staged') {
        const diagnostics = Array.isArray(event.diagnostics) ? event.diagnostics : [];
        const blocking = diagnostics.find(
          (diagnostic) => isRecord(diagnostic) && diagnostic.severity === 'error',
        );
        if (blocking) {
          renderDiagnostic(blocking);
          return;
        }
        const details = detailsByIntegrity.get(event.sourceIntegrity) ?? null;
        if (!details) return;
        sourceDisplayName = details.sourceDisplayName;
        diagnosticCode = null;
        diagnosticStatus.textContent = '';
        fallback.hidden = true;
        if (reloadSurface) observe(reloadSurface.setDiagnostic('source', null));
        if (event.candidate) {
          candidateDetails = details;
          notifyDistributionBuildState();
          const choices = event.candidate.options;
          if (!isReloadChoices(choices)) {
            throw new TypeError('preview reload choices are invalid');
          }
          if (reloadSurface) {
            if (manualRestartDepth === 0) {
              observe(
                reloadSurface.submitCandidate({
                  channel: 'source',
                  channelRevision: event.revision,
                  availability: reloadAvailability(choices),
                  changedIds: ['source-generation'],
                  initiatingInputId: null,
                  async apply(request: WebPreviewReloadRequest) {
                    const choice = restartChoice(request.actualAnchor);
                    await coordinator.commit(choice);
                  },
                  async restart(request: WebPreviewReloadRequest) {
                    const choice = restartChoice(request.actualAnchor);
                    manualRestartDepth += 1;
                    try {
                      await coordinator.restart(choice);
                    } finally {
                      manualRestartDepth -= 1;
                    }
                  },
                }),
              );
            }
            return;
          }
          render({
            formatVersion: 1,
            phase: 'candidate',
            sourceDisplayName,
            currentIntegrity: event.current?.integrity ?? null,
            candidateIntegrity: details.integrity,
            validationStatus: 'valid',
            counts: details.counts,
            anchor: null,
            choices: {
              1: choices.storyStart,
              2: choices.currentScene,
              3: choices.currentAction,
            },
            warningCount: details.warningCount,
            changeCategories: ['source'],
            safeStatusMessage: 'A valid source change is ready. Choose where to restart.',
          });
          return;
        }
        if (event.current?.integrity) {
          activeDetails = details;
          candidateDetails = null;
          notifyDistributionBuildState();
          render({
            formatVersion: 1,
            phase: 'running',
            sourceDisplayName,
            currentIntegrity: event.current.integrity,
            candidateIntegrity: null,
            validationStatus: 'valid',
            counts: details.counts,
            anchor: null,
            choices: null,
            warningCount: details.warningCount,
            changeCategories: [],
            safeStatusMessage: 'The current immutable source is running.',
          });
        }
        return;
      }
      if (event.type === 'preview.source.committed') {
        activeDetails = candidateDetails ?? activeDetails;
        candidateDetails = null;
        notifyDistributionBuildState();
        if (!activeDetails || !event.current?.integrity) return;
        render({
          formatVersion: 1,
          phase: 'running',
          sourceDisplayName: activeDetails.sourceDisplayName,
          currentIntegrity: event.current.integrity,
          candidateIntegrity: null,
          validationStatus: 'valid',
          counts: activeDetails.counts,
          anchor: null,
          choices: null,
          warningCount: activeDetails.warningCount,
          changeCategories: [],
          safeStatusMessage: 'The selected source revision is running.',
        });
        return;
      }
      if (event.type === 'preview.source.deferred') {
        candidateDetails = null;
        notifyDistributionBuildState();
        if (!activeDetails || !event.current?.integrity) return;
        render({
          formatVersion: 1,
          phase: 'running',
          sourceDisplayName: activeDetails.sourceDisplayName,
          currentIntegrity: event.current.integrity,
          candidateIntegrity: null,
          validationStatus: 'valid',
          counts: activeDetails.counts,
          anchor: null,
          choices: null,
          warningCount: activeDetails.warningCount,
          changeCategories: [],
          safeStatusMessage: 'The changed source was deferred; the current run continues.',
        });
      }
    }

    function onSourceStatus(state: WebPreviewSourceState) {
      if (disposed) return;
      const statusLabels: Readonly<Record<string, string>> = {
        idle: 'Web Preview is idle.',
        selecting: 'Waiting for project directory selection…',
        'loading-manifest': 'Reading the project source manifest…',
        stabilizing: 'Waiting for a stable source snapshot…',
        'watching-visible': 'Watching the selected project for changes.',
        'background-throttled': 'Preview is in the background; polling is throttled.',
        diagnostic: 'Web Preview needs attention. See the diagnostic below.',
        disposed: 'Web Preview stopped.',
      };
      const sourceStatus = state.status;
      watchStatus.textContent = sourceStatus
        ? (statusLabels[sourceStatus] ?? 'Web Preview status changed.')
        : 'Web Preview status changed.';
      if (reloadSurface) {
        const reloadWatchState = (
          {
            idle: 'idle',
            selecting: 'idle',
            'loading-manifest': 'stabilizing',
            stabilizing: 'stabilizing',
            'watching-visible': 'watching',
            'background-throttled': 'paused',
            disposed: 'disconnected',
          } as Readonly<Record<string, string>>
        )[sourceStatus ?? ''];
        if (reloadWatchState) observe(reloadSurface.setWatchState('source', reloadWatchState));
      }
      if (typeof state.sourceDisplayName === 'string') sourceDisplayName = state.sourceDisplayName;
      openButton.disabled = state.started === true || state.status === 'selecting';
    }

    const previewShell = createDsl4DevelopmentPreviewShell({
      environment: 'development',
      document,
      mount: reloadMount,
      onReloadChoice(choice: number) {
        if (disposed) return;
        const name = restartChoiceNames[choice as 1 | 2 | 3];
        if (name) observe(coordinator.commit(name));
      },
      onDefer() {
        if (disposed) return;
        observe(coordinator.defer());
      },
      onError: reportError,
    });

    cleanup.own(previewShell);
    const coordinatorCandidate = createCoordinator({
      protocolSession: options.protocolSession,
      sessionId: options.sessionId,
      sourceFrontend: options.sourceFrontend,
      maxSourceBytes: options.maxSourceBytes,
      featureFlags,
      maxSourceFiles: options.maxSourceFiles,
      maxTotalSourceBytes: options.maxTotalSourceBytes,
      maxIncludeDepth: options.maxIncludeDepth,
      capabilities: options.capabilities,
      sourceOptions: options.sourceOptions,
      onProjectRoot: setProjectRoot,
      beforeSourceStage: prepareIncludedSourceAssets,
      onSourceResult(result: WebPreviewSourceResult) {
        if (disposed) return;
        const snapshot = isRecord(result.sourceSnapshot) ? result.sourceSnapshot : null;
        if (typeof snapshot?.displayName === 'string') {
          sourceDisplayName = snapshot.displayName;
        }
        const details = sourceDetails(result);
        if (details) detailsByIntegrity.set(details.integrity, details);
        if (result.ok === true) {
          latestValidSourceResult = result;
          // Assets of a source composed from includes are staged before its candidate instead.
          if (!composedFromIncludes(result)) queueAssetSource(latestValidSourceResult);
        } else if (
          typeof result.canonicalSource === 'string' &&
          Array.isArray(result.diagnostics) &&
          result.diagnostics.length > 0
        ) {
          const projection = createDsl4DiagnosticUiProjection(result.diagnostics, {
            canonicalSource: result.canonicalSource,
            displayName: sourceDisplayName,
          });
          const blocking = projection.diagnostics.find(
            (diagnostic) => diagnostic.severity === 'error',
          );
          if (blocking) renderDiagnostic(blocking);
        }
        notifyDistributionBuildState();
      },
      onProtocolEvent,
      onSourceStatus,
      onSourceDiagnostic(diagnostic: WebPreviewDiagnostic | null) {
        if (disposed) return;
        if (diagnostic === null) {
          diagnosticCode = null;
          diagnosticStatus.textContent = '';
          fallback.hidden = true;
          if (reloadSurface) observe(reloadSurface.setDiagnostic('source', null));
          try {
            diagnosticObserver?.(null, 'source');
          } catch (error) {
            reportError(error);
          }
          notifyDistributionBuildState();
          return;
        }
        renderDiagnostic(diagnostic);
        notifyDistributionBuildState();
      },
      onError: reportError,
    });
    cleanup.own(coordinatorCandidate);
    const coordinator = validateCoordinator(
      coordinatorCandidate,
      featureFlags.dsl4PreviewReloadOverlay,
    );

    if (featureFlags.dsl4PreviewReloadOverlay) {
      const reloadCandidate = (createReloadSurface as WebPreviewCallback)({
        surface: 'web',
        ...(options.previewLocale === undefined ? {} : {locale: options.previewLocale}),
        ...(options.previewStageControls === undefined
          ? {}
          : {stageControls: options.previewStageControls}),
        environment: 'development',
        document,
        mount: host,
        viewport: geometry(options.previewViewport, {
          width: Math.max(44, Number(mount.clientWidth) || 800),
          height: Math.max(44, Number(mount.clientHeight) || 600),
        }),
        safeArea: geometry(options.previewSafeArea, {top: 0, right: 0, bottom: 0, left: 0}),
        storage: options.previewStorage,
        reducedMotion: options.previewReducedMotion,
        formatTime: options.previewFormatTime,
        debugExecution: featureFlags.dsl4Debugger ? options.debugExecution : undefined,
        onError: reportError,
      });
      cleanup.own(reloadCandidate);
      reloadSurface = validateReloadSurface(reloadCandidate);
      if (presentation === 'runtime') reloadSurface.setVisible(false);
    }

    if (createAssetPipeline && assetPipelineOptions) {
      const surface = reloadSurface;
      // The pipeline borrows only notifications; the shell retains disposal ownership.
      // Terminal notifications must not mutate the surface once parallel cleanup starts.
      const assetReloadSurface =
        surface &&
        Object.freeze({
          async submitCandidate(candidate: unknown) {
            if (disposed) return;
            try {
              return await surface.submitCandidate(candidate);
            } catch (error) {
              // A transferred candidate may be cancelled after its owner starts closing.
              // Preserve genuine driver/validation failures, even when disposal overlaps.
              if (disposed && error instanceof Dsl4PreviewReloadDisposedError) return;
              throw error;
            }
          },
          setDiagnostic(channel: string, diagnostic: unknown) {
            if (disposed) return;
            return surface.setDiagnostic(channel, diagnostic);
          },
          setWatchState(channel: string, state: unknown) {
            if (disposed) return;
            return surface.setWatchState(channel, state);
          },
        });
      const pipelineCandidate = createAssetPipeline({
        ...assetPipelineOptions,
        sessionId: options.sessionId,
        ...(assetReloadSurface ? {reloadSurface: assetReloadSurface} : {}),
        onEvent: (event: unknown) => notifyAssetObserver('onEvent', event),
        onDiagnostic: async (diagnostic: WebPreviewDiagnostic | null) => {
          await notifyAssetObserver('onDiagnostic', diagnostic);
          if (disposed) return;
          if (diagnostic === null) {
            if (diagnosticCode?.startsWith('K4-ASSET-')) {
              diagnosticCode = null;
              diagnosticStatus.textContent = '';
            }
            if (reloadSurface) observe(reloadSurface.setDiagnostic('asset', null));
            try {
              diagnosticObserver?.(null, 'asset');
            } catch (error) {
              reportError(error);
            }
            return;
          }
          renderDiagnostic(diagnostic, 'asset');
        },
        onWatchStatus: (state: unknown) => notifyAssetObserver('onWatchStatus', state),
        onError: (error: unknown) => {
          void notifyAssetObserver('onError', error);
          reportError(error);
        },
      });
      cleanup.own(pipelineCandidate);
      assetPipeline = validateAssetPipeline(pipelineCandidate);
    }

    function openProject() {
      if (disposed) throw new TypeError('Web Preview shell is disposed');
      openButton.disabled = true;
      try {
        const operation = coordinator.openProject();
        return Promise.resolve(operation).finally(() => {
          if (!disposed) openButton.disabled = coordinator.getState().source.started === true;
        });
      } catch (error) {
        if (!disposed) openButton.disabled = false;
        throw error;
      }
    }

    function onOpenProject() {
      try {
        observe(openProject());
      } catch (error) {
        reportError(error);
      }
    }
    cleanup.listen(openButton, 'click', onOpenProject);

    function snapshot() {
      return deepFreeze({
        version: 1,
        enabled: true,
        disposed,
        featureFlags,
        diagnosticCode,
        sourceDisplayName,
        preview: previewShell.getSnapshot(),
        assetPipeline: assetPipeline?.getState() ?? null,
        reloadOverlay: reloadSurface?.getSnapshot() ?? null,
        coordinator: coordinator.getState(),
      });
    }

    function distributionBuildState() {
      if (disposed) return deepFreeze({enabled: false, reason: 'Web Preview shell is disposed.'});
      if (!featureFlags.dsl4BrowserDistributionBuild) {
        return deepFreeze({enabled: false, reason: 'Browser distribution build is disabled.'});
      }
      if (!selectedProjectRoot || coordinator.getState().source.started !== true) {
        return deepFreeze({enabled: false, reason: 'Open a project directory first.'});
      }
      if (selectedProjectRoot.dsl4SourceOnly === true) {
        return deepFreeze({enabled: false, reason: 'Open a complete project directory to build.'});
      }
      const coordinatorState = coordinator.getState();
      const publication = coordinatorState.source.lastPublication;
      const integrity = latestValidSourceResult?.sourceSnapshot?.integrity;
      if (
        diagnosticCode !== null ||
        publication?.kind !== 'source' ||
        publication.ok !== true ||
        typeof integrity !== 'string' ||
        publication.integrity !== integrity
      ) {
        return deepFreeze({
          enabled: false,
          reason: 'Fix the latest source or asset diagnostic before building.',
        });
      }
      if (
        coordinatorState.protocol.pendingStages !== 0 ||
        coordinatorState.protocol.candidate !== null ||
        (typeof coordinatorState.protocol.status === 'string' &&
          ['connecting', 'staging', 'committing', 'deferring', 'failed'].includes(
            coordinatorState.protocol.status,
          ))
      ) {
        return deepFreeze({enabled: false, reason: 'Wait for the latest validation to finish.'});
      }
      const assetTransaction = assetPipeline?.getState()?.transaction;
      if (
        assetTransaction?.diagnostic ||
        assetTransaction?.candidate ||
        (typeof assetTransaction?.status === 'string' &&
          ['preparing', 'applying', 'diagnostic', 'full-rebuild'].includes(assetTransaction.status))
      ) {
        return deepFreeze({
          enabled: false,
          reason: 'Apply or fix the latest asset change before building.',
        });
      }
      return deepFreeze({enabled: true, reason: null, integrity});
    }

    function notifyDistributionBuildState() {
      if (disposed) return;
      try {
        distributionBuildObserver?.(distributionBuildState());
      } catch (error) {
        reportError(error);
      }
    }

    function requireActive() {
      if (disposed) throw new TypeError('Web Preview shell is disposed');
    }

    async function settleLatestProjectFiles() {
      requireActive();
      await coordinator.pollNow();
      requireActive();
      await assetSourceQueue;
      requireActive();
      if (assetPipelineStarted && assetPipeline) await assetPipeline.pollNow();
      requireActive();
      await coordinator.whenIdle();
      requireActive();
      await assetSourceQueue;
      requireActive();
      if (assetPipelineStarted && assetPipeline) await assetPipeline.whenIdle();
      requireActive();
      await reloadSurface?.whenIdle();
      requireActive();
    }

    cleanup.add(async () => {
      // Source/update failures are diagnostics, not failed cleanup owners.
      // Child disposal retains resource failures separately; only wait for this queue to settle.
      await assetSourceQueue.catch(() => {});
    });
    cleanup.add(() => {
      detailsByIntegrity.clear();
      activeDetails = null;
      candidateDetails = null;
      selectedProjectRoot = null;
      latestValidSourceResult = null;
    });
    function dispose() {
      if (disposePromise) return disposePromise;
      disposed = true;
      cleanup.close();
      let resolve!: (value: ReturnType<typeof snapshot>) => void;
      let reject!: (error: unknown) => void;
      const operation = new Promise<ReturnType<typeof snapshot>>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      disposePromise = operation;
      // Publish the public attempt before a child release can reenter this owner.
      void cleanup.dispose().then(snapshot).then(resolve, reject);
      void operation.then(
        () => {
          disposePromise = null;
        },
        () => {
          disposePromise = null;
        },
      );
      return operation;
    }

    return Object.freeze({
      enabled: true,
      element: host,
      featureFlags,
      openProject,
      start(projectRoot: unknown) {
        if (disposed) throw new TypeError('Web Preview shell is disposed');
        openButton.disabled = true;
        // The coordinator publishes the root and owns observer work on its start promise.
        return coordinator.start(projectRoot);
      },
      async pollNow() {
        await settleLatestProjectFiles();
        return snapshot();
      },
      getDistributionBuildState: distributionBuildState,
      setReloadVisible(visible: boolean) {
        requireActive();
        reloadSurface?.setVisible(visible);
      },
      async prepareDistributionBuild() {
        if (disposed) throw new TypeError('Web Preview shell is disposed');
        await settleLatestProjectFiles();
        requireActive();
        const state = distributionBuildState();
        if (state.enabled !== true || !selectedProjectRoot || !latestValidSourceResult) {
          const error = new Error(state.reason ?? 'Browser distribution build is unavailable');
          Object.defineProperty(error, 'code', {value: 'K4-BROWSER-BUILD-NOT-READY'});
          throw error;
        }
        const integrity = latestValidSourceResult.sourceSnapshot?.integrity;
        if (typeof integrity !== 'string') {
          const error = new Error('Browser distribution build source integrity is unavailable');
          Object.defineProperty(error, 'code', {value: 'K4-BROWSER-BUILD-NOT-READY'});
          throw error;
        }
        return Object.freeze({
          projectRoot: selectedProjectRoot,
          sourceResult: latestValidSourceResult,
          integrity,
        });
      },
      restart(choice: 'storyStart' | 'currentScene' | 'currentAction') {
        if (disposed) throw new TypeError('Web Preview shell is disposed');
        return coordinator.restart(choice);
      },
      async whenIdle() {
        await coordinator.whenIdle();
        await assetSourceQueue;
        if (assetPipelineStarted && assetPipeline) await assetPipeline.whenIdle();
        await reloadSurface?.whenIdle();
        return snapshot();
      },
      submitReloadCandidate(candidate: unknown) {
        requireActive();
        if (!reloadSurface) throw new TypeError('preview reload overlay is disabled');
        return reloadSurface.submitCandidate(candidate);
      },
      setReloadDiagnostic(channel: 'source' | 'asset', diagnostic: unknown) {
        requireActive();
        if (!reloadSurface) throw new TypeError('preview reload overlay is disabled');
        return reloadSurface.setDiagnostic(channel, diagnostic);
      },
      setReloadWatchState(channel: 'source' | 'asset', status: unknown) {
        requireActive();
        if (!reloadSurface) throw new TypeError('preview reload overlay is disabled');
        return reloadSurface.setWatchState(channel, status);
      },
      acknowledgePreviewInput(inputId: string) {
        requireActive();
        return reloadSurface?.acknowledgePreviewInput(inputId) ?? snapshot();
      },
      registerPreviewControlRect(owner: string, rect: unknown) {
        requireActive();
        if (!reloadSurface) throw new TypeError('preview reload overlay is disabled');
        return reloadSurface.registerReservedRect(owner, rect);
      },
      updatePreviewControlRect(owner: string, rect: unknown) {
        requireActive();
        if (!reloadSurface) throw new TypeError('preview reload overlay is disabled');
        return reloadSurface.updateReservedRect(owner, rect);
      },
      unregisterPreviewControlRect(owner: string) {
        requireActive();
        if (!reloadSurface) throw new TypeError('preview reload overlay is disabled');
        return reloadSurface.unregisterReservedRect(owner);
      },
      registerReservedRect(owner: string, rect: unknown) {
        requireActive();
        if (!reloadSurface) throw new TypeError('preview reload overlay is disabled');
        return reloadSurface.registerReservedRect(owner, rect);
      },
      updateReservedRect(owner: string, rect: unknown) {
        requireActive();
        if (!reloadSurface) throw new TypeError('preview reload overlay is disabled');
        return reloadSurface.updateReservedRect(owner, rect);
      },
      unregisterReservedRect(owner: string) {
        requireActive();
        if (!reloadSurface) throw new TypeError('preview reload overlay is disabled');
        return reloadSurface.unregisterReservedRect(owner);
      },
      updatePreviewViewport(viewport: unknown, safeArea?: unknown) {
        requireActive();
        if (!reloadSurface) throw new TypeError('preview reload overlay is disabled');
        return reloadSurface.updateViewport(viewport, safeArea);
      },
      getSnapshot: snapshot,
      hasPendingCleanup: cleanup.hasPendingCleanup,
      dispose,
    });
  } catch (error) {
    disposed = true;
    return cleanup.fail(error);
  }
}
