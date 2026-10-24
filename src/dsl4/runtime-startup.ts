import {createDsl4RetryableCleanup} from './retryable-cleanup.js';
import type {Dsl4RuntimePort} from './runtime-port.js';
import type {Dsl4NavigationSessionSurface} from './navigation-session-surface.js';
import type {Dsl4AssetPreloadLifecycle} from './asset-preload-coordinator.js';
import {createDsl4NavigationSession} from './navigation-session.js';
import {
  loadDsl4BinaryEntryRuntimeComponent,
  loadDsl4RuntimeComponent,
} from './runtime-artifact-loader.js';
import {resolveDsl4FeatureFlags} from './feature-flags.js';
import type {Dsl4SourceFrontend} from './source-frontend.js';
import type {Dsl4SealedKeyCache, Dsl4SealedUnlock} from './sealed-story-artifact.js';
import {deepFreeze, sourceOriginForStoryPath} from './story-document.js';
import type {Dsl4SubtleCrypto} from './subtle-crypto.js';
import {dsl4FirstCrossfadeStoryPath} from './transition-spec.js';

export {
  dsl4DefaultFeatureFlags,
  dsl4NonEmbeddedDevelopmentFeatureFlags,
  dsl4StandardProductionFeatureFlags,
  resolveDsl4FeatureFlags,
} from './feature-flags.js';

export type RuntimeAssetLifecycle = Dsl4AssetPreloadLifecycle;

export interface RuntimeInputArbitration {
  shouldDeferNavigationKey(context: Readonly<{code: string; historyPaused: boolean}>): boolean;
  arbitrateNavigationPointer(
    context: Readonly<{pointerType: string; historyPaused: boolean}>,
  ): 'allow' | 'defer' | 'suppress';
  cancelNavigationPointer(context: Readonly<{pointerType: string}>): unknown;
}

export interface RuntimeDebugExecution {
  beforeAction(
    action: Readonly<{
      command: string;
      sceneId: string;
      actionIndex: number;
      actionPath: string;
      signal: AbortSignal;
    }>,
  ): unknown;
  getState(): Readonly<{paused?: boolean}>;
}

export type RuntimeStartupContext = Readonly<{
  channel: 'bundled' | 'unbundled';
  featureFlags: Readonly<{
    dsl4Runtime: boolean;
    dsl4BroadcastMessageAndWait: boolean;
    dsl4IndexedDBAssetSessionStore: boolean;
    dsl4AppShell: boolean;
    dsl4WebPreviewAdapter: boolean;
    dsl4BrowserDistributionBuild: boolean;
    dsl4WebPreviewAssetLiveReload: boolean;
    dsl4PreviewReloadOverlay: boolean;
    dsl4Debugger: boolean;
    dsl4PoseFeedbackModes: boolean;
    dsl4PosePreviewMirroring: boolean;
    dsl4CameraPreviewControls: boolean;
    dsl4SpeechAdvanceTypewriter: boolean;
    dsl4TurboWarpBubbleAdvancedPresentation: boolean;
    dsl4TurboWarpActionSurface: boolean;
    structuredDataIntegrationEnabled: boolean;
  }>;
}>;

interface RuntimeStartupComponent {
  readonly [key: string]: unknown;
  channel: 'bundled' | 'unbundled';
  storyDocument: Readonly<Record<string, unknown>>;
  runtimeArtifact: Readonly<{controlProfile: unknown}>;
}

export type RuntimeConditionEvaluator = (
  expression: string,
  variables: Readonly<Record<string, string | number | boolean>>,
  context: Record<string, unknown>,
) => boolean | Promise<boolean>;

export type RuntimeEnvironment = {
  port: Dsl4RuntimePort;
  assetLifecycle?: RuntimeAssetLifecycle;
  evaluateCondition?: RuntimeConditionEvaluator;
  inputArbitration?: RuntimeInputArbitration;
  dispose: (reason?: string) => unknown | Promise<unknown>;
  hasPendingCleanup?: () => boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function rejectInvalidRuntimeEnvironment(
  candidate: unknown,
  message: string,
): Promise<never> {
  const failure = new TypeError(message);
  if (isRecord(candidate) && typeof candidate.dispose === 'function') {
    try {
      await candidate.dispose('invalid-runtime-environment');
    } catch (disposeError) {
      throw new AggregateError(
        [failure, disposeError],
        'Invalid DSL 4.0 runtime environment cleanup failed',
      );
    }
  }
  throw failure;
}

/** Make the published navigation session the sole owner of its runtime environment. */
function ownRuntimeEnvironment(
  session: Dsl4NavigationSessionSurface,
  environment: RuntimeEnvironment,
) {
  const cleanup = createDsl4RetryableCleanup({
    message: 'DSL 4.0 runtime session disposal failed',
    steps: [
      () => session.dispose(),
      {
        run: (reason) => environment.dispose(reason),
        isPending: () => environment.hasPendingCleanup?.() ?? false,
      },
    ],
  });
  return Object.freeze({
    ...session,
    hasPendingCleanup: cleanup.hasPendingCleanup,
    dispose(reason: string = 'dispose') {
      return cleanup.run(reason);
    },
  });
}

/** Create a host-controlled runtime session behind one startup-fixed, default-off flag. */
export async function createDsl4RuntimeStartup(
  options: {
    featureFlags?: unknown;
    project?: unknown;
    sourceFrontend?: Dsl4SourceFrontend;
    maxSourceBytes?: number;
    maxAssetFiles?: number;
    maxAssetFileBytes?: number;
    maxTotalAssetBytes?: number;
    assetBundleFormat?: 'embedded-base64' | 'binary-entry';
    historyNavigationAvailable?: boolean;
    historyLimits?: {maxActionEntries: number; maxSceneVisits: number};
    port?: Dsl4RuntimePort;
    assetLifecycle?: RuntimeAssetLifecycle;
    createAssetLifecycle?: (
      runtimeComponent: Readonly<Record<string, unknown>>,
      context: RuntimeStartupContext,
    ) => RuntimeAssetLifecycle;
    createRuntimeEnvironment?: (
      runtimeComponent: Readonly<Record<string, unknown>>,
      context: RuntimeStartupContext,
    ) => RuntimeEnvironment | Promise<RuntimeEnvironment>;
    evaluateCondition?: (
      expression: string,
      variables: Readonly<Record<string, string | number | boolean>>,
      context: Record<string, unknown>,
    ) => boolean | Promise<boolean>;
    onEvent?: (event: Readonly<Record<string, unknown>>) => void;
    onInputError?: (
      error: unknown,
      context: Readonly<{command: string; code: string}>,
    ) => unknown | Promise<unknown>;
    debugExecution?: RuntimeDebugExecution;
    subtleCrypto?: Dsl4SubtleCrypto | undefined;
    /** Asks for the password of a sealed story; without it a sealed story is refused. */
    unlockSealedStory?: Dsl4SealedUnlock;
    sealedKeyCache?: Dsl4SealedKeyCache;
  } = {},
) {
  if (!isRecord(options)) throw new TypeError('DSL 4.0 startup options must be an object');
  const featureFlags = resolveDsl4FeatureFlags(options.featureFlags);
  if (!featureFlags.dsl4Runtime) {
    return deepFreeze({
      ok: true,
      enabled: false,
      featureFlags,
      session: null,
      diagnostics: [],
    });
  }
  if (
    featureFlags.dsl4Debugger &&
    (!isRecord(options.debugExecution) ||
      typeof options.debugExecution.beforeAction !== 'function' ||
      typeof options.debugExecution.getState !== 'function')
  ) {
    throw new TypeError('debugExecution is required when dsl4Debugger is enabled');
  }
  if (options.assetLifecycle !== undefined && options.createAssetLifecycle !== undefined) {
    throw new TypeError('Provide either assetLifecycle or createAssetLifecycle, not both');
  }
  if (
    options.createRuntimeEnvironment !== undefined &&
    (options.port !== undefined ||
      options.assetLifecycle !== undefined ||
      options.createAssetLifecycle !== undefined)
  ) {
    throw new TypeError(
      'createRuntimeEnvironment cannot be combined with port or asset lifecycle options',
    );
  }
  if (
    options.createAssetLifecycle !== undefined &&
    typeof options.createAssetLifecycle !== 'function'
  ) {
    throw new TypeError('createAssetLifecycle must be a function');
  }
  const createAssetLifecycle =
    typeof options.createAssetLifecycle === 'function' ? options.createAssetLifecycle : null;
  if (
    options.createRuntimeEnvironment !== undefined &&
    typeof options.createRuntimeEnvironment !== 'function'
  ) {
    throw new TypeError('createRuntimeEnvironment must be a function');
  }
  const createRuntimeEnvironment =
    typeof options.createRuntimeEnvironment === 'function'
      ? options.createRuntimeEnvironment
      : null;
  if (!createRuntimeEnvironment && !isRecord(options.port))
    throw new TypeError('port must be an object when DSL 4.0 is enabled');
  if (!options.sourceFrontend || typeof options.sourceFrontend.parse !== 'function') {
    throw new TypeError('sourceFrontend must provide parse when DSL 4.0 is enabled');
  }
  const {maxSourceBytes, maxAssetFiles, maxTotalAssetBytes} = options;
  if (
    maxSourceBytes === undefined ||
    maxAssetFiles === undefined ||
    maxTotalAssetBytes === undefined
  ) {
    throw new TypeError('DSL 4.0 startup requires explicit source and asset limits');
  }
  const assetBundleFormat = options.assetBundleFormat ?? 'embedded-base64';
  if (assetBundleFormat !== 'embedded-base64' && assetBundleFormat !== 'binary-entry') {
    throw new TypeError('assetBundleFormat must be embedded-base64 or binary-entry');
  }
  if (assetBundleFormat === 'binary-entry' && options.maxAssetFileBytes === undefined) {
    throw new TypeError('maxAssetFileBytes is required for binary-entry startup');
  }

  const loadRuntimeComponent =
    assetBundleFormat === 'binary-entry'
      ? loadDsl4BinaryEntryRuntimeComponent
      : loadDsl4RuntimeComponent;
  const loaded = await loadRuntimeComponent(options.project, options.sourceFrontend, {
    maxSourceBytes,
    maxAssetFiles,
    ...(assetBundleFormat === 'binary-entry' ? {maxAssetFileBytes: options.maxAssetFileBytes} : {}),
    maxTotalAssetBytes,
    historyNavigationAvailable: options.historyNavigationAvailable ?? false,
    subtleCrypto: options.subtleCrypto,
    ...(options.unlockSealedStory === undefined
      ? {}
      : {unlockSealedStory: options.unlockSealedStory}),
    ...(options.sealedKeyCache === undefined ? {} : {sealedKeyCache: options.sealedKeyCache}),
  });
  if (!loaded.ok) {
    return deepFreeze({
      ok: false,
      enabled: true,
      featureFlags,
      diagnostics: loaded.diagnostics,
    });
  }
  const component = loaded as unknown as RuntimeStartupComponent;
  const crossfadeStoryPath = dsl4FirstCrossfadeStoryPath(component.storyDocument);
  if (crossfadeStoryPath !== null && !featureFlags.dsl4CrossfadeTransitions) {
    const origin = sourceOriginForStoryPath(component.storyDocument, crossfadeStoryPath);
    return deepFreeze({
      ok: false,
      enabled: true,
      featureFlags,
      diagnostics: [
        {
          version: 1,
          code: 'K4-TRANSITION-FLAG-001',
          severity: 'error',
          message: 'dsl4CrossfadeTransitions must be enabled for crossfade transitions',
          sourceId: origin.sourceId,
          range: origin.range,
          storyPath: crossfadeStoryPath,
          path: crossfadeStoryPath,
          related: [],
        },
      ],
    });
  }
  const startupContext = deepFreeze({channel: component.channel, featureFlags});
  let runtimeEnvironment: RuntimeEnvironment | null = null;

  if (createRuntimeEnvironment) {
    const candidate = await createRuntimeEnvironment(component, startupContext);
    if (
      !isRecord(candidate) ||
      !isRecord(candidate.port) ||
      typeof candidate.dispose !== 'function'
    ) {
      await rejectInvalidRuntimeEnvironment(
        candidate,
        'runtime environment must provide port and dispose after component validation',
      );
    }
    if (
      candidate.hasPendingCleanup !== undefined &&
      typeof candidate.hasPendingCleanup !== 'function'
    ) {
      await rejectInvalidRuntimeEnvironment(
        candidate,
        'runtime environment hasPendingCleanup must be a function',
      );
    }
    if (Object.values(candidate.port).some((operation) => typeof operation !== 'function')) {
      await rejectInvalidRuntimeEnvironment(
        candidate,
        'runtime environment port values must be functions',
      );
    }
    if (
      candidate.assetLifecycle !== undefined &&
      (!isRecord(candidate.assetLifecycle) ||
        typeof candidate.assetLifecycle.prepare !== 'function' ||
        typeof candidate.assetLifecycle.setLoading !== 'function' ||
        typeof candidate.assetLifecycle.releaseAssets !== 'function' ||
        typeof candidate.assetLifecycle.release !== 'function')
    ) {
      await rejectInvalidRuntimeEnvironment(
        candidate,
        'runtime environment asset lifecycle must provide prepare, setLoading, releaseAssets, and release',
      );
    }
    if (
      candidate.evaluateCondition !== undefined &&
      typeof candidate.evaluateCondition !== 'function'
    ) {
      await rejectInvalidRuntimeEnvironment(
        candidate,
        'runtime environment evaluateCondition must be a function',
      );
    }
    if (
      candidate.inputArbitration !== undefined &&
      (!isRecord(candidate.inputArbitration) ||
        typeof candidate.inputArbitration.shouldDeferNavigationKey !== 'function' ||
        typeof candidate.inputArbitration.arbitrateNavigationPointer !== 'function' ||
        typeof candidate.inputArbitration.cancelNavigationPointer !== 'function')
    ) {
      await rejectInvalidRuntimeEnvironment(
        candidate,
        'runtime environment input arbitration must provide key and pointer decisions',
      );
    }
    runtimeEnvironment = candidate as unknown as RuntimeEnvironment;
  }

  let created;
  try {
    const recognition = isRecord(component.storyDocument.recognition)
      ? component.storyDocument.recognition
      : {};
    const posePreview = isRecord(recognition.preview) ? recognition.preview : {};
    const posePreviewControls = isRecord(posePreview.controls) ? posePreview.controls : {};
    const cameraMirroringControlEnabled =
      featureFlags.dsl4CameraPreviewControls && isRecord(posePreviewControls.mirroring);
    const resolvedAssetLifecycle = runtimeEnvironment?.assetLifecycle ?? options.assetLifecycle;
    const resolvedEvaluateCondition =
      runtimeEnvironment?.evaluateCondition ?? options.evaluateCondition;
    created = createDsl4NavigationSession({
      storyDocument: component.storyDocument,
      controlProfile: String(component.runtimeArtifact.controlProfile),
      historyNavigationAvailable: options.historyNavigationAvailable ?? false,
      ...(options.historyLimits === undefined ? {} : {historyLimits: options.historyLimits}),
      port: runtimeEnvironment?.port ?? (options.port as Dsl4RuntimePort),
      ...(resolvedAssetLifecycle === undefined ? {} : {assetLifecycle: resolvedAssetLifecycle}),
      ...(featureFlags.dsl4Debugger && options.debugExecution !== undefined
        ? {debugExecution: options.debugExecution}
        : {}),
      ...(createAssetLifecycle
        ? {createAssetLifecycle: () => createAssetLifecycle(component, startupContext)}
        : {}),
      ...(resolvedEvaluateCondition === undefined
        ? {}
        : {evaluateCondition: resolvedEvaluateCondition}),
      ...(options.onEvent === undefined ? {} : {onEvent: options.onEvent}),
      ...(options.onInputError === undefined ? {} : {onInputError: options.onInputError}),
      poseNavigationPolicyEnabled: featureFlags.dsl4PoseFeedbackModes,
      structuredDataIntegrationEnabled: featureFlags.structuredDataIntegrationEnabled,
      posePreviewMirroringEnabled:
        featureFlags.dsl4PosePreviewMirroring || cameraMirroringControlEnabled,
      cameraPreviewControlsEnabled: featureFlags.dsl4CameraPreviewControls,
      speechAdvanceTypewriterEnabled: featureFlags.dsl4SpeechAdvanceTypewriter,
      turboWarpBubbleAdvancedPresentationEnabled:
        featureFlags.dsl4TurboWarpBubbleAdvancedPresentation,
      broadcastMessageAndWaitEnabled: featureFlags.dsl4BroadcastMessageAndWait,
      crossfadeTransitionsEnabled: featureFlags.dsl4CrossfadeTransitions,
      narrativeControlEnabled: featureFlags.dsl4NarrativeControl,
      inputArbitration: runtimeEnvironment?.inputArbitration,
    });
  } catch (error) {
    if (!runtimeEnvironment) throw error;
    try {
      await runtimeEnvironment.dispose('navigation-session-creation-failed');
    } catch (disposeError) {
      throw new AggregateError(
        [error, disposeError],
        'DSL 4.0 startup and runtime environment cleanup failed',
      );
    }
    throw error;
  }
  if (!created.ok) {
    if (runtimeEnvironment) {
      await runtimeEnvironment.dispose('navigation-session-rejected');
    }
    return deepFreeze({
      ok: false,
      enabled: true,
      featureFlags,
      diagnostics: created.diagnostics,
    });
  }
  const success = created as unknown as {session: Dsl4NavigationSessionSurface};
  const publishedSession = runtimeEnvironment
    ? ownRuntimeEnvironment(success.session, runtimeEnvironment)
    : success.session;
  return deepFreeze({
    ok: true,
    enabled: true,
    featureFlags,
    channel: component.channel,
    runtimeComponent: loaded,
    session: publishedSession,
    diagnostics: [],
  });
}
