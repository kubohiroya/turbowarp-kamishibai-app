import type {Dsl4SealedKeyCache, Dsl4SealedUnlock} from '../sealed-story-artifact.js';
import {createDsl4RetryableCleanup} from '../retryable-cleanup.js';
import {dsl4CoreActionManifest} from '../core-action-manifest.js';
import {createDsl4AssetDependencyIndex} from '../asset-dependency-index.js';
import {createDsl4GroupPreloadCoordinator} from '../group-preload-coordinator.js';
import type {Dsl4RuntimePortOperation} from '../runtime-port.js';
import type {Dsl4NavigationSessionSurface} from '../navigation-session-surface.js';
import {type Dsl4ForwardedFactory, validateCompositionMethods} from './composition-contract.js';
import {createRuntimeExpressionComposition as createDefaultRuntimeExpressionComposition} from '@kubohiroya/turbowarp-runtime-expression/composition';
import {createSvgTextCompositionCapability} from '@kubohiroya/turbowarp-bubble/turbowarp-adapter';
import {
  createTurboWarpBroadcastPort,
  createTurboWarpRuntimeHost,
} from '@kubohiroya/turbowarp-runtime-adapter';

import {validateDsl4CacheIdentity} from '../cache-identity.js';
import {createDsl4InputArbitration} from '../input-arbitration.js';
import {
  createDsl4RuntimeStartup,
  resolveDsl4FeatureFlags,
  type RuntimeStartupContext,
} from '../runtime-startup.js';
import {
  createDsl4RuntimeStateExpressionComposition,
  createDsl4RuntimeVariableSnapshot,
} from '../runtime-variable-surface.js';
import type {Dsl4SourceFrontend} from '../source-frontend.js';
import {deepFreeze} from '../story-document.js';
import type {Dsl4SubtleCrypto} from '../subtle-crypto.js';
import {createDsl4ActorActionPort} from './actor-action-port.js';
import {createDsl4AsyncInputActionPort} from './async-input-action-port.js';
import {createDsl4BubblePlatform} from './bubble-platform.js';
import {createDsl4CameraPreviewControls} from './camera-preview-controls.js';
import {createDsl4MediaActionPort} from './media-action-port.js';
import {createDsl4AudioActionPort} from './audio-action-port.js';
import {createDsl4VideoActionPort} from './video-action-port.js';
import {releaseDsl4PlaybackAssets} from './playback-asset-release.js';
import {createDsl4PlatformAssetSession} from './platform-asset-session.js';
import {createDsl4PoseFeedbackPresenter} from './pose-feedback-presenter.js';
import {createDsl4ScratchPoseFeedbackAdapter} from './scratch-pose-feedback-adapter.js';
import {createDsl4SvgTextPlatform} from './svg-text-action-port.js';
import {createDsl4TurboWarpActorPlatform} from './turbowarp-actor-adapter.js';
import {createDsl4TurboWarpCrossfadePlatform} from './turbowarp-crossfade-platform.js';
import {
  createDsl4RuntimeCacheLeaseLifecycle,
  defaultCacheLeaseHeartbeatMs,
  defaultCacheLeaseHeartbeatSchedule,
} from './turbowarp-runtime-cache-lease.js';

export type HostPortContext = Readonly<{
  runtime: unknown;
  runtimeHost: unknown;
  storyDocument: Readonly<Record<string, unknown>>;
}>;

export type HostPort = {
  gotoSegment?: Dsl4RuntimePortOperation;
  wait?: Dsl4RuntimePortOperation;
  transition?: Dsl4RuntimePortOperation;
  keyInputToChangeScene?: Dsl4RuntimePortOperation;
  touchInputToChangeScene?: Dsl4RuntimePortOperation;
  dispose?: () => unknown;
};

export type RuntimeConditionEvaluator = (
  expression: string,
  variables: Readonly<Record<string, string | number | boolean>>,
  context: Record<string, unknown>,
) => boolean | Promise<boolean>;

type Dsl4ResolvedFeatureFlags = ReturnType<typeof resolveDsl4FeatureFlags>;
type CameraPreviewControlsOptions = Parameters<typeof createDsl4CameraPreviewControls>[0];
type AssetManagerCompositionFactory = NonNullable<
  Parameters<typeof createDsl4PlatformAssetSession>[0]['createAssetManagerComposition']
>;
type AsyncInputCompositionFactory = NonNullable<
  Parameters<typeof createDsl4PlatformAssetSession>[0]['createAsyncInputComposition']
>;
type PoseFeedbackPresenterOptions = Parameters<typeof createDsl4PoseFeedbackPresenter>[0];

interface ConfiguredPreviewControls extends Readonly<Record<string, unknown>> {
  readonly mirroring?: Readonly<{
    assets?: Readonly<{showMirrored?: unknown; showUnmirrored?: unknown}>;
  }>;
  readonly cameraMenu?: Readonly<{buttonAsset?: unknown}>;
}

interface SessionBackingHostOptions {
  readonly binaryBundleStoreOptions?: unknown;
  readonly sessionBacking?: unknown;
  readonly onSessionBackingWarning?: (warning: Readonly<Record<string, unknown>>) => unknown;
  readonly onSessionBackingFatalError?: (error: unknown) => unknown;
}

interface VerifiedRemoteCachePort {
  readonly identity: unknown;
  readonly getWarnings: () => unknown;
  readonly takeWarnings: () => unknown;
  readonly getStats: () => unknown;
  readonly prune: () => unknown;
  readonly clear: () => unknown;
  readonly listStoryCaches: () => unknown;
  readonly pruneStoryCaches: () => unknown;
  readonly deleteStoryCache: (databaseName: string) => unknown;
  readonly renewLease: () => unknown;
  readonly releaseLease: () => unknown;
}

interface BinarySessionBackingPort {
  readonly getState: () => unknown;
}

interface TurboWarpRuntimeHostOptions extends SessionBackingHostOptions {
  readonly [key: string]: unknown;
  readonly publicationSegmentId?: string;
  readonly actorFrameMilliseconds?: number;
  readonly actorScheduler?: unknown;
  readonly actorTouchSource?: unknown;
  readonly assetBundleFormat?: 'embedded-base64' | 'binary-entry';
  readonly binaryEntryProvider?: unknown;
  readonly binarySessionBackingPolicy?: 'prefer' | 'required' | 'disabled';
  readonly binarySessionId?: string;
  readonly cacheIdentity?: unknown;
  readonly cacheLeaseHeartbeatMs?: number;
  readonly cameraPreviewControls?: unknown;
  readonly createAssetManagerComposition?: AssetManagerCompositionFactory;
  readonly createAsyncInputComposition?: AsyncInputCompositionFactory;
  readonly createAudioVoice?: (assetId: string, options: Readonly<{gain: number}>) => unknown;
  readonly createBubbleComposition?: Dsl4ForwardedFactory;
  readonly createFile?: Dsl4ForwardedFactory;
  readonly createHostPort?: (context: HostPortContext) => HostPort | Promise<HostPort>;
  readonly createImageBitmap?: (canvas: HTMLCanvasElement) => Promise<ImageBitmap>;
  readonly videoAssetAdapter?: Parameters<
    typeof createDsl4PlatformAssetSession
  >[0]['videoAssetAdapter'];
  readonly objectUrlOwner?: Parameters<typeof createDsl4PlatformAssetSession>[0]['objectUrlOwner'];
  readonly materializationRetention?: Parameters<
    typeof createDsl4PlatformAssetSession
  >[0]['materializationRetention'];
  readonly createObjectURL?: (blob: Blob) => string;
  readonly createVideo?: () => HTMLVideoElement;
  readonly createRuntimeExpressionComposition?: Dsl4ForwardedFactory;
  readonly createSvgTextComposition?: Dsl4ForwardedFactory;
  readonly createTMComposition?: Dsl4ForwardedFactory;
  readonly evaluateCondition?: RuntimeConditionEvaluator;
  readonly featureFlags?: unknown;
  readonly historyLimits?: {maxActionEntries: number; maxSceneVisits: number};
  readonly historyNavigationAvailable?: boolean;
  readonly keySource?: unknown;
  readonly loadRemoteAsset?: (
    payload: Readonly<Record<string, unknown>>,
    context: Readonly<Record<string, unknown>>,
  ) => unknown | Promise<unknown>;
  readonly maxTotalAssetBytes?: number;
  readonly maxAssetFileBytes?: number;
  readonly maxAssetFiles?: number;
  readonly maxSourceBytes?: number;
  readonly onBackgroundActionError?: (
    error: unknown,
    context?: Readonly<Record<string, string>>,
  ) => unknown;
  readonly onEvent?: (event: Readonly<Record<string, unknown>>) => unknown;
  readonly onBinarySessionBackingWarning?: (warning: Readonly<Record<string, unknown>>) => unknown;
  readonly onBinarySessionBackingFatalError?: (error: unknown) => unknown;
  readonly onInputError?: (
    error: unknown,
    context: Readonly<{command: string; code: string}>,
  ) => unknown | Promise<unknown>;
  readonly onPoseState?: (event: Readonly<Record<string, unknown>>) => unknown;
  readonly poseArchiveLimits?: Readonly<Record<string, unknown>>;
  readonly poseFeedbackPresenter?: Readonly<Record<string, unknown>>;
  readonly poseNow?: Dsl4ForwardedFactory;
  readonly poseSchedule?: Dsl4ForwardedFactory;
  readonly project?: unknown;
  readonly runtime?: unknown;
  readonly runtimeVersion?: string;
  readonly scheduleCacheLeaseHeartbeat?: (callback: () => void, milliseconds: number) => () => void;
  readonly sessionBacking?: Readonly<{
    policy?: 'prefer' | 'required' | 'disabled';
    sessionId?: string;
    storeOptions?: Readonly<Record<string, unknown>>;
  }>;
  readonly sessionBinaryBackingOptions?: Readonly<Record<string, unknown>>;
  readonly setBusy?: (
    payload: Readonly<{visible: boolean; source: string; label: string; cursor?: string}>,
  ) => unknown | Promise<unknown>;
  readonly setCursor?: (
    payload: Readonly<{visible: boolean; source: string; cursor: string}>,
  ) => unknown;
  readonly setLoading?: (
    payload: Readonly<Record<string, unknown>>,
    context: Readonly<Record<string, unknown>>,
  ) => unknown | Promise<unknown>;
  readonly sourceFrontend?: Dsl4SourceFrontend;
  readonly subtleCrypto?: Dsl4SubtleCrypto;
  /** Asks the viewer for a sealed story's password; without it a sealed story is refused. */
  readonly unlockSealedStory?: Dsl4SealedUnlock;
  /** Shares derived keys across chapters of one sealed publication. */
  readonly sealedKeyCache?: Dsl4SealedKeyCache;
  readonly tmPoseRuntime?: unknown;
  readonly verifiedRemoteCacheOptions?: Readonly<Record<string, unknown>>;
  readonly waitSchedule?: (callback: () => void, milliseconds: number) => () => void;
  readonly revokeObjectURL?: (url: string) => void;
}

interface AssetPreparePayload extends Readonly<Record<string, unknown>> {
  readonly assetIds: readonly string[];
}

interface LoadingPayload extends Readonly<Record<string, unknown>> {
  readonly visible?: unknown;
  readonly loading?: unknown;
}

interface LoadingContext extends Readonly<Record<string, unknown>> {
  readonly signal?: AbortSignal;
}

function validateAssetPreparePayload(
  payload: Readonly<Record<string, unknown>>,
): AssetPreparePayload {
  if (
    !Array.isArray(payload.assetIds) ||
    payload.assetIds.some((assetId) => typeof assetId !== 'string')
  ) {
    throw new TypeError('asset lifecycle prepare payload must provide assetIds');
  }
  return payload as AssetPreparePayload;
}

const hostPortMethods = new Set([
  'gotoSegment',
  'wait',
  'transition',
  'keyInputToChangeScene',
  'touchInputToChangeScene',
]);
const controllerCommands = new Set([
  'goto',
  'branch',
  'pose',
  ...dsl4CoreActionManifest
    .filter((action) => action.runtimeDispatch === 'variable')
    .map((action) => action.command),
]);
const terminalRuntimeEvents = new Set(['runtime.finish', 'runtime.fail', 'runtime.stop']);
const terminalRuntimeStatuses = new Set(['finished', 'failed', 'stopped']);
const sessionBackingPolicies = new Set(['prefer', 'required', 'disabled']);
let fallbackSessionIdCounter = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createSessionBackingId() {
  const cryptoObject = globalThis.crypto;
  if (typeof cryptoObject?.randomUUID === 'function') return cryptoObject.randomUUID();
  if (typeof cryptoObject?.getRandomValues === 'function') {
    const bytes = cryptoObject.getRandomValues(new Uint8Array(16));
    return `dsl4-${[...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  }
  fallbackSessionIdCounter += 1;
  return `dsl4-${Date.now().toString(36)}-${fallbackSessionIdCounter.toString(36)}`;
}

export function resolveDsl4SessionBackingConfig(
  options: SessionBackingHostOptions,
  featureFlags: Dsl4ResolvedFeatureFlags,
  assetBundleFormat: 'embedded-base64' | 'binary-entry',
) {
  if (options.binaryBundleStoreOptions !== undefined) {
    throw new TypeError('binaryBundleStoreOptions was replaced by sessionBacking.storeOptions');
  }
  if (options.sessionBacking !== undefined && !isRecord(options.sessionBacking)) {
    throw new TypeError('sessionBacking must be an object');
  }
  if (
    options.onSessionBackingWarning !== undefined &&
    typeof options.onSessionBackingWarning !== 'function'
  ) {
    throw new TypeError('onSessionBackingWarning must be a function');
  }
  if (
    options.onSessionBackingFatalError !== undefined &&
    typeof options.onSessionBackingFatalError !== 'function'
  ) {
    throw new TypeError('onSessionBackingFatalError must be a function');
  }
  if (assetBundleFormat !== 'binary-entry') {
    if (
      options.sessionBacking !== undefined ||
      options.onSessionBackingWarning !== undefined ||
      options.onSessionBackingFatalError !== undefined
    ) {
      throw new TypeError('session backing options require assetBundleFormat binary-entry');
    }
    return null;
  }
  const input = isRecord(options.sessionBacking) ? options.sessionBacking : {};
  const unknown = Object.keys(input).filter(
    (key) => !['policy', 'sessionId', 'storeOptions'].includes(key),
  );
  if (unknown.length > 0) {
    throw new TypeError(`Unknown sessionBacking option: ${unknown.sort().join(', ')}`);
  }
  const policy =
    input.policy ?? (featureFlags.dsl4IndexedDBAssetSessionStore ? 'prefer' : 'disabled');
  if (typeof policy !== 'string' || !sessionBackingPolicies.has(policy)) {
    throw new TypeError('sessionBacking.policy must be prefer, required, or disabled');
  }
  const resolvedPolicy = policy as 'prefer' | 'required' | 'disabled';
  if (!featureFlags.dsl4IndexedDBAssetSessionStore && resolvedPolicy !== 'disabled') {
    throw new TypeError(
      'sessionBacking.policy prefer or required requires dsl4IndexedDBAssetSessionStore',
    );
  }
  if (input.sessionId !== undefined && (typeof input.sessionId !== 'string' || !input.sessionId)) {
    throw new TypeError('sessionBacking.sessionId must be a non-empty string');
  }
  if (input.storeOptions !== undefined && !isRecord(input.storeOptions)) {
    throw new TypeError('sessionBacking.storeOptions must be an object');
  }
  return Object.freeze({
    policy: resolvedPolicy,
    sessionId: input.sessionId ?? createSessionBackingId(),
    storeOptions: Object.freeze({...input.storeOptions}),
  });
}

function hostError(code: string, message: string) {
  const error = new Error(message);
  Object.defineProperty(error, 'code', {value: code});
  return error;
}

function abortError(message: string) {
  const error = hostError('K4-HOST-WAIT-002', message);
  error.name = 'AbortError';
  return error;
}

function validateSignal(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.aborted !== 'boolean' ||
    typeof value.addEventListener !== 'function' ||
    typeof value.removeEventListener !== 'function'
  ) {
    throw hostError('K4-HOST-WAIT-001', 'wait context must provide an AbortSignal');
  }
  return value as unknown as AbortSignal;
}

function defaultWaitSchedule(callback: () => void, milliseconds: number) {
  const timer = setTimeout(callback, milliseconds);
  return () => clearTimeout(timer);
}

function createWaitPort(schedule: (callback: () => void, milliseconds: number) => () => void) {
  return Object.freeze({
    wait(payload: unknown, context: unknown) {
      if (
        !isRecord(payload) ||
        Object.keys(payload).length !== 1 ||
        !Object.hasOwn(payload, 'seconds') ||
        typeof payload.seconds !== 'number' ||
        !Number.isFinite(payload.seconds) ||
        payload.seconds < 0
      ) {
        throw hostError(
          'K4-HOST-WAIT-001',
          'wait payload must provide one finite non-negative seconds value',
        );
      }
      const signal = validateSignal(isRecord(context) ? context.signal : undefined);
      if (signal.aborted) return Promise.reject(abortError('wait action was cancelled'));
      const milliseconds = payload.seconds * 1000;
      if (!Number.isFinite(milliseconds)) {
        throw hostError('K4-HOST-WAIT-001', 'wait duration is outside the supported range');
      }
      if (milliseconds === 0) return Promise.resolve();

      return new Promise((resolve, reject) => {
        let settled = false;
        let cancel = () => {};
        const cleanup = () => {
          signal.removeEventListener('abort', handleAbort);
          cancel();
        };
        const finish = () => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(undefined);
        };
        const handleAbort = () => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(abortError('wait action was cancelled'));
        };
        signal.addEventListener('abort', handleAbort, {once: true});
        if (signal.aborted) {
          handleAbort();
          return;
        }
        try {
          const scheduledCancel = schedule(finish, milliseconds);
          if (typeof scheduledCancel !== 'function') {
            throw hostError(
              'K4-HOST-WAIT-001',
              'wait schedule must return a cancellation function',
            );
          }
          cancel = scheduledCancel;
          if (settled) cancel();
        } catch (error) {
          settled = true;
          cleanup();
          reject(error);
        }
      });
    },
  });
}

function validateHostPort(value: unknown): Readonly<HostPort> | HostPort {
  if (value === undefined) return Object.freeze({}) as Readonly<HostPort>;
  if (!isRecord(value)) throw new TypeError('DSL 4.0 host port must be an object');
  for (const [method, operation] of Object.entries(value)) {
    if (method === 'dispose') {
      if (typeof operation !== 'function') {
        throw new TypeError('DSL 4.0 host port dispose must be a function');
      }
      continue;
    }
    if (typeof operation !== 'function') {
      throw new TypeError(`DSL 4.0 host port ${method} must be a function`);
    }
  }
  return value as HostPort;
}

/**
 * Copy the named operations of one action port onto the runtime port. The source is checked by
 * name here, so it is taken as an unknown record rather than asking each port to declare the
 * runtime operation shape for members the controller never dispatches to.
 */
function addPortMethods(
  destination: Record<string, Dsl4RuntimePortOperation | undefined>,
  source: Readonly<Record<string, unknown>>,
  methods: string[],
  owner: string,
) {
  for (const method of methods) {
    if (typeof source[method] !== 'function') {
      throw new TypeError(`${owner} must provide ${method}`);
    }
    if (Object.hasOwn(destination, method)) {
      throw hostError('K4-HOST-PORT-COLLISION', `Runtime port method is duplicated: ${method}`);
    }
    destination[method] = (source[method] as Dsl4RuntimePortOperation).bind(source);
  }
}

function validateStoryCapabilities(
  storyDocument: Readonly<Record<string, unknown>>,
  port: Readonly<Record<string, Dsl4RuntimePortOperation | undefined>>,
  evaluateCondition: unknown,
) {
  const scenes = Array.isArray(storyDocument.scenes) ? storyDocument.scenes : [];
  for (const scene of scenes) {
    if (!isRecord(scene) || !Array.isArray(scene.actions)) continue;
    for (const action of scene.actions) {
      if (!isRecord(action) || typeof action.command !== 'string') continue;
      if (action.command === 'branch' && typeof evaluateCondition !== 'function') {
        throw hostError(
          'K4-HOST-CONDITION-MISSING',
          'A condition evaluator is required by the DSL 4.0 story',
        );
      }
      if (controllerCommands.has(action.command)) continue;
      if (typeof port[action.command] !== 'function') {
        throw hostError(
          'K4-HOST-PORT-MISSING',
          `Runtime port method is required by the DSL 4.0 story: ${action.command}`,
        );
      }
    }
  }
}

function validateBroadcastMessageAndWaitFeature(
  storyDocument: Readonly<Record<string, unknown>>,
  enabled: boolean,
) {
  const scenes = Array.isArray(storyDocument.scenes) ? storyDocument.scenes : [];
  const action = scenes
    .flatMap((scene) => (isRecord(scene) && Array.isArray(scene.actions) ? scene.actions : []))
    .find((candidate) => isRecord(candidate) && candidate.command === 'broadcastMessageAndWait');
  if (action && !enabled) {
    throw hostError(
      'K4-HOST-BROADCAST-FLAG-001',
      'dsl4BroadcastMessageAndWait must be enabled for broadcastMessageAndWait actions',
    );
  }
}

/**
 * Refuse a story whose preview controls this shell cannot draw.
 *
 * The renderer is the host's, but the DOM is the shell's: it supplies the container, the preview
 * geometry and the frame scheduler. A shell that leaves them out can do nothing with
 * `preview.controls`, and the asset lifecycle used to discover that halfway through materializing
 * the control icons. Say it here instead, next to the other capabilities a story can ask for and
 * not get, before anything has been prepared.
 */
function validateCameraPreviewControlsSurface(appShellOptions: unknown) {
  if (isRecord(appShellOptions)) return;
  throw hostError(
    'K4-HOST-PREVIEW-CONTROLS-001',
    'The app shell must supply cameraPreviewControls options for a story that declares preview.controls',
  );
}

function resolvePoseFeedbackMode(storyDocument: Readonly<Record<string, unknown>>) {
  const recognition = isRecord(storyDocument.recognition) ? storyDocument.recognition : null;
  const feedback = isRecord(recognition?.feedback) ? recognition.feedback : null;
  const mode = feedback?.mode ?? 'scratchMirror';
  if (!['scratchMirror', 'scratchBinding', 'presenter'].includes(String(mode))) {
    throw hostError('K4-HOST-POSE-FEEDBACK-001', 'Pose feedback mode is unsupported');
  }
  return mode as 'scratchMirror' | 'scratchBinding' | 'presenter';
}

export async function createDsl4TurboWarpRuntimeEnvironment(
  options: TurboWarpRuntimeHostOptions,
  runtimeComponent: Readonly<Record<string, unknown>>,
  publishVerifiedRemoteCache: (cache: VerifiedRemoteCachePort | null) => void,
  publishBinarySessionBacking: (backing: BinarySessionBackingPort | null) => void,
  publishRuntimeLifecycleObserver: (
    observer: ((event: Readonly<Record<string, unknown>>) => void) | null,
  ) => void,
  poseFeedbackEnabled: boolean,
  posePreviewMirroringEnabled: boolean,
  cameraPreviewControlsEnabled: boolean,
  speechAdvanceTypewriterEnabled: boolean,
  publishApplicationPort: (
    port: Readonly<{
      prepareMenu: () => Promise<boolean>;
      showCover: () => Promise<boolean>;
      stopStoryCamera?: () => Promise<boolean>;
    }>,
  ) => void = () => {},
  publishRuntimeDiagnostics: (
    port: Readonly<{getState: () => Readonly<Record<string, number>>}>,
  ) => void = () => {},
  publishRuntimeVariableState: (
    port: Readonly<{getPoseState: () => Readonly<Record<string, unknown>> | null}>,
  ) => void = () => {},
) {
  const component = runtimeComponent as unknown as Readonly<{
    storyDocument: Readonly<Record<string, unknown>>;
    sourceDescriptor?: Readonly<Record<string, unknown>>;
  }>;
  let assetSession: ReturnType<typeof createDsl4PlatformAssetSession> | null = null;
  let actorPlatform: ReturnType<typeof createDsl4TurboWarpActorPlatform> | null = null;
  let mediaPort: ReturnType<typeof createDsl4MediaActionPort> | null = null;
  let audioPort: ReturnType<typeof createDsl4AudioActionPort> | null = null;
  let videoPort: ReturnType<typeof createDsl4VideoActionPort> | null = null;
  let crossfadePlatform: ReturnType<typeof createDsl4TurboWarpCrossfadePlatform> | null = null;
  let svgTextPlatform: ReturnType<typeof createDsl4SvgTextPlatform> | null = null;
  let bubblePlatform: ReturnType<typeof createDsl4BubblePlatform> | null = null;
  let scratchPoseFeedbackAdapter: ReturnType<typeof createDsl4ScratchPoseFeedbackAdapter> | null =
    null;
  let poseFeedbackPresenter: ReturnType<typeof createDsl4PoseFeedbackPresenter> | null = null;
  let runtimeExpressionComposition: {releaseAll(): unknown} | null = null;
  let cameraPreviewControls: ReturnType<typeof createDsl4CameraPreviewControls> | null = null;
  let broadcastActionPort: ReturnType<typeof createTurboWarpBroadcastPort> | null = null;
  let latestPoseState: Readonly<Record<string, unknown>> | null = null;
  const inputArbitration = createDsl4InputArbitration();
  const featureFlags = resolveDsl4FeatureFlags(options.featureFlags);
  const videoScenes = component.storyDocument.scenes as readonly {
    actions: readonly {command: string}[];
  }[];
  const videoAssets = component.storyDocument.assets as Record<string, {kind?: string}>;
  if (
    !featureFlags.dsl4Video &&
    (videoScenes.some((scene) =>
      scene.actions.some(
        (action) => action.command === 'video' || action.command === 'videoControl',
      ),
    ) ||
      Object.values(videoAssets).some((asset) => asset.kind === 'video'))
  ) {
    throw hostError('K4-VIDEO-DISABLED', 'Video playback requires dsl4Video');
  }
  const broadcastMessageAndWaitEnabled = featureFlags.dsl4BroadcastMessageAndWait;
  validateBroadcastMessageAndWaitFeature(component.storyDocument, broadcastMessageAndWaitEnabled);
  let hostPort: Readonly<HostPort> | HostPort = Object.freeze({});
  // The actor platform is built before the Bubble platform, which needs the asset session and the
  // SVG Text composition, so speech reaches the composition through this deferring proxy.
  const bubbleCompositionProxy = Object.freeze({
    show(input: unknown) {
      if (!bubblePlatform) throw new TypeError('Bubble platform is not ready');
      return bubblePlatform.composition.show(input);
    },
    releaseAll() {
      return bubblePlatform?.releaseAll();
    },
  });
  const recognition = isRecord(component.storyDocument.recognition)
    ? component.storyDocument.recognition
    : null;
  const preview = isRecord(recognition?.preview) ? recognition.preview : null;
  const hasConfiguredPreviewControls =
    cameraPreviewControlsEnabled && isRecord(preview) && isRecord(preview.controls);
  // Read behind the flag: a host whose controls are off must not touch the option at all.
  if (hasConfiguredPreviewControls) {
    validateCameraPreviewControlsSurface(options.cameraPreviewControls);
  }
  const configuredPreviewControls: ConfiguredPreviewControls =
    hasConfiguredPreviewControls && isRecord(preview?.controls) ? preview.controls : {};
  const effectivePosePreviewMirroringEnabled =
    posePreviewMirroringEnabled || isRecord(configuredPreviewControls.mirroring);
  const embeddedCacheIdentity =
    component.sourceDescriptor?.cacheIdentity === undefined
      ? undefined
      : validateDsl4CacheIdentity(component.sourceDescriptor.cacheIdentity);
  const injectedCacheIdentity =
    options.cacheIdentity === undefined
      ? undefined
      : validateDsl4CacheIdentity(options.cacheIdentity);
  if (
    injectedCacheIdentity !== undefined &&
    embeddedCacheIdentity !== undefined &&
    (injectedCacheIdentity.id !== embeddedCacheIdentity.id ||
      injectedCacheIdentity.label !== embeddedCacheIdentity.label ||
      injectedCacheIdentity.databaseName !== embeddedCacheIdentity.databaseName)
  ) {
    throw hostError(
      'K4-HOST-CACHE-IDENTITY-001',
      'Injected cache identity does not match the packaged story identity',
    );
  }
  const cacheIdentity = injectedCacheIdentity ?? embeddedCacheIdentity;

  try {
    const turboWarpHost = createTurboWarpRuntimeHost({runtime: options.runtime});
    if (broadcastMessageAndWaitEnabled) {
      broadcastActionPort = createTurboWarpBroadcastPort({
        runtime: turboWarpHost.runtime,
        errorCodePrefix: 'K4',
      });
    }
    actorPlatform = createDsl4TurboWarpActorPlatform({
      runtimeHost: turboWarpHost,
      bubbleComposition: bubbleCompositionProxy,
      ...(speechAdvanceTypewriterEnabled
        ? {
            speechAdvanceTypewriterEnabled: true,
            playSpeechSound(sound) {
              if (!assetSession) throw new Error('Asset session is unavailable');
              return assetSession.assetManagerComposition.playSound(sound);
            },
            stopSpeechSound(sound) {
              return assetSession?.assetManagerComposition.stopSound(sound);
            },
          }
        : {}),
      ...(options.actorScheduler === undefined ? {} : {scheduler: options.actorScheduler}),
      ...(options.actorFrameMilliseconds === undefined
        ? {}
        : {frameMilliseconds: options.actorFrameMilliseconds}),
    });
    const feedbackMode = poseFeedbackEnabled
      ? resolvePoseFeedbackMode(component.storyDocument)
      : null;
    if (feedbackMode === 'scratchMirror' || feedbackMode === 'scratchBinding') {
      scratchPoseFeedbackAdapter = createDsl4ScratchPoseFeedbackAdapter({
        runtimeHost: turboWarpHost,
        mode: feedbackMode,
      });
    }
    const poseStateObservers: Array<(event: Readonly<Record<string, unknown>>) => unknown> = [];
    if (featureFlags.dsl4TurboWarpStateSurface) {
      poseStateObservers.push((event) => {
        latestPoseState = deepFreeze({...event});
      });
    }
    if (scratchPoseFeedbackAdapter) {
      poseStateObservers.push(scratchPoseFeedbackAdapter.onPoseState);
    }
    if (feedbackMode === 'presenter') {
      if (options.poseFeedbackPresenter !== undefined) {
        poseFeedbackPresenter = createDsl4PoseFeedbackPresenter(
          options.poseFeedbackPresenter as PoseFeedbackPresenterOptions,
        );
      }
      const externalObserver = options.onPoseState;
      if (externalObserver !== undefined && typeof externalObserver !== 'function') {
        throw new TypeError('onPoseState must be a function');
      }
      if (poseFeedbackPresenter !== null) {
        poseStateObservers.push(poseFeedbackPresenter.onPoseState);
      }
      if (typeof externalObserver === 'function') poseStateObservers.push(externalObserver);
    }
    const poseStateObserver =
      poseStateObservers.length === 0
        ? undefined
        : (event: Readonly<Record<string, unknown>>) => {
            for (const observer of poseStateObservers) {
              try {
                Promise.resolve(observer(event)).catch(() => {});
              } catch {
                // Pose observers are non-authoritative and isolated from pose execution.
              }
            }
          };
    publishRuntimeVariableState(
      Object.freeze({
        getPoseState() {
          return latestPoseState;
        },
      }),
    );
    const poseStateBinding =
      feedbackMode === 'scratchBinding'
        ? scratchPoseFeedbackAdapter?.readPoseStateBinding
        : undefined;
    if (typeof options.setLoading !== 'function') {
      throw new TypeError('setLoading must be a function');
    }
    const setLoading = options.setLoading;
    assetSession = createDsl4PlatformAssetSession({
      ...(options.videoAssetAdapter === undefined
        ? {}
        : {videoAssetAdapter: options.videoAssetAdapter}),
      ...(options.objectUrlOwner === undefined ? {} : {objectUrlOwner: options.objectUrlOwner}),
      ...(options.materializationRetention === undefined
        ? {}
        : {materializationRetention: options.materializationRetention}),
      runtimeComponent,
      runtimeHost: turboWarpHost,
      tmPoseRuntime: options.tmPoseRuntime,
      onCameraCleanupError: (error) => reportStoryCameraFailure(error, 'CLEANUP'),
      setLoading,
      ...(options.setBusy === undefined ? {} : {setBusy: options.setBusy}),
      ...(options.setCursor === undefined ? {} : {setCursor: options.setCursor}),
      ...(options.loadRemoteAsset === undefined ? {} : {loadRemoteAsset: options.loadRemoteAsset}),
      ...(cacheIdentity === undefined ? {} : {cacheIdentity}),
      ...(options.verifiedRemoteCacheOptions === undefined
        ? {}
        : {verifiedRemoteCacheOptions: options.verifiedRemoteCacheOptions}),
      ...(options.poseArchiveLimits === undefined
        ? {}
        : {poseArchiveLimits: options.poseArchiveLimits}),
      ...(options.subtleCrypto === undefined ? {} : {subtleCrypto: options.subtleCrypto}),
      ...(options.createFile === undefined ? {} : {createFile: options.createFile}),
      ...(options.createAssetManagerComposition === undefined
        ? {}
        : {createAssetManagerComposition: options.createAssetManagerComposition}),
      ...(options.binaryEntryProvider === undefined
        ? {}
        : {binaryEntryProvider: options.binaryEntryProvider}),
      ...(options.binarySessionBackingPolicy === undefined
        ? {}
        : {binarySessionBackingPolicy: options.binarySessionBackingPolicy}),
      ...(options.binarySessionId === undefined ? {} : {binarySessionId: options.binarySessionId}),
      ...(options.sessionBinaryBackingOptions === undefined
        ? {}
        : {sessionBinaryBackingOptions: options.sessionBinaryBackingOptions}),
      ...(options.onBinarySessionBackingWarning === undefined
        ? {}
        : {onBinarySessionBackingWarning: options.onBinarySessionBackingWarning}),
      ...(options.onBinarySessionBackingFatalError === undefined
        ? {}
        : {onBinarySessionBackingFatalError: options.onBinarySessionBackingFatalError}),
      ...(options.createTMComposition === undefined
        ? {}
        : {createTMComposition: options.createTMComposition}),
      ...(options.createAsyncInputComposition === undefined
        ? {}
        : {createAsyncInputComposition: options.createAsyncInputComposition}),
      ...(options.keySource === undefined ? {} : {keySource: options.keySource}),
      ...(options.actorTouchSource === undefined
        ? {}
        : {actorTouchSource: options.actorTouchSource}),
      ...(options.poseSchedule === undefined ? {} : {poseSchedule: options.poseSchedule}),
      ...(options.poseNow === undefined ? {} : {poseNow: options.poseNow}),
      ...(poseFeedbackEnabled
        ? {
            poseFeedbackEnabled: true,
            ...(poseStateObserver === undefined ? {} : {onPoseState: poseStateObserver}),
            ...(poseStateBinding === undefined ? {} : {readPoseStateBinding: poseStateBinding}),
          }
        : {}),
      ...(effectivePosePreviewMirroringEnabled ? {posePreviewMirroringEnabled: true} : {}),
      ...(hasConfiguredPreviewControls ? {cameraPreviewControlsEnabled: true} : {}),
      ...(hasConfiguredPreviewControls
        ? {
            cameraPreviewMirroringControlEnabled: isRecord(configuredPreviewControls.mirroring),
            cameraMenuControlEnabled: isRecord(configuredPreviewControls.cameraMenu),
          }
        : {}),
      ...((hasConfiguredPreviewControls || featureFlags.dsl4Video) &&
      options.createObjectURL !== undefined
        ? {createObjectURL: options.createObjectURL}
        : {}),
      ...((hasConfiguredPreviewControls || featureFlags.dsl4Video) &&
      options.revokeObjectURL !== undefined
        ? {revokeObjectURL: options.revokeObjectURL}
        : {}),
      ...(isRecord(configuredPreviewControls.mirroring)
        ? {
            onPreviewMirroringChange(mode: 'mirrored' | 'unmirrored') {
              cameraPreviewControls?.setMirroring(mode);
            },
          }
        : {}),
    });
    await assetSession.binaryAssetBacking?.ready;
    publishBinarySessionBacking(assetSession.binaryAssetBacking);
    if (featureFlags.dsl4CrossfadeTransitions) {
      const composition = assetSession.assetManagerComposition;
      const createAudioVoice =
        options.createAudioVoice ??
        (typeof composition.createAudioVoice === 'function'
          ? composition.createAudioVoice.bind(composition)
          : undefined);
      crossfadePlatform = createDsl4TurboWarpCrossfadePlatform({
        runtimeHost: turboWarpHost,
        ...(options.actorScheduler === undefined ? {} : {scheduler: options.actorScheduler}),
        ...(options.actorFrameMilliseconds === undefined
          ? {}
          : {frameMilliseconds: options.actorFrameMilliseconds}),
        ...(createAudioVoice === undefined ? {} : {createAudioVoice}),
        ...(options.createImageBitmap === undefined
          ? {}
          : {createImageBitmap: options.createImageBitmap}),
        ...(options.onBackgroundActionError === undefined
          ? {}
          : {onBackgroundError: options.onBackgroundActionError}),
      });
    }
    mediaPort = createDsl4MediaActionPort({
      composition: assetSession.assetManagerComposition,
      resolveActor: actorPlatform.resolveActor,
      setActorScale: actorPlatform.host.setActorScale,
      ...(options.actorScheduler === undefined ? {} : {scheduler: options.actorScheduler}),
      ...(options.onBackgroundActionError === undefined
        ? {}
        : {onBackgroundError: options.onBackgroundActionError}),
      ...(crossfadePlatform === null ? {} : {transitionHost: crossfadePlatform}),
    });
    audioPort = createDsl4AudioActionPort({
      getAssetResource: assetSession.getAssetResource,
      createAudioPlayback(source, settings) {
        const create = assetSession?.assetManagerComposition.createAudioPlayback;
        if (typeof create !== 'function')
          throw hostError(
            'K4-AUDIO-UNAVAILABLE',
            'Asset Manager composition requires createAudioPlayback',
          );
        return Promise.resolve(create(source, settings)) as ReturnType<
          Parameters<typeof createDsl4AudioActionPort>[0]['createAudioPlayback']
        >;
      },
      ...(options.onBackgroundActionError === undefined
        ? {}
        : {onBackgroundError: options.onBackgroundActionError}),
    });
    if (featureFlags.dsl4Video) {
      const runtime = options.runtime as {renderer?: unknown};
      videoPort = createDsl4VideoActionPort({
        renderer: runtime.renderer,
        getAssetResource: assetSession.getAssetResource,
        ...(options.createVideo === undefined ? {} : {createVideo: options.createVideo}),
        ...(options.onBackgroundActionError === undefined
          ? {}
          : {onBackgroundError: options.onBackgroundActionError}),
      });
    }
    const actorPort = createDsl4ActorActionPort({
      composition: assetSession.assetManagerComposition,
      resolveActor: actorPlatform.resolveActor,
      host: actorPlatform.host,
      stopActorLoop: mediaPort.stopActorLoop,
      ...(options.setCursor === undefined ? {} : {setCursor: options.setCursor}),
      ...(speechAdvanceTypewriterEnabled ? {speechAdvanceTypewriterEnabled: true} : {}),
    });
    const asyncInputPort = createDsl4AsyncInputActionPort({
      composition: assetSession.asyncInputComposition,
      inputArbitration,
      ...(options.setCursor === undefined ? {} : {setCursor: options.setCursor}),
    });
    svgTextPlatform = createDsl4SvgTextPlatform({
      enabled: true,
      runtime: options.runtime,
      storyDocument: component.storyDocument,
      resolveActor: actorPlatform.resolveActor,
      ...(options.createSvgTextComposition === undefined
        ? {}
        : {createComposition: options.createSvgTextComposition}),
    });
    bubblePlatform = createDsl4BubblePlatform({
      runtime: options.runtime,
      storyDocument: component.storyDocument,
      assetManager: assetSession.assetManagerComposition,
      textCapability: createSvgTextCompositionCapability(svgTextPlatform.composition),
      ...(options.actorScheduler === undefined ? {} : {scheduler: options.actorScheduler}),
      ...(options.createBubbleComposition === undefined
        ? {}
        : {createComposition: options.createBubbleComposition}),
    });
    hostPort = validateHostPort(
      typeof options.createHostPort === 'function'
        ? await options.createHostPort(
            Object.freeze({
              runtime: turboWarpHost.runtime,
              runtimeHost: turboWarpHost,
              storyDocument: component.storyDocument,
            }),
          )
        : undefined,
    );

    let evaluateCondition: RuntimeConditionEvaluator | undefined = options.evaluateCondition;
    if (evaluateCondition === undefined) {
      const createRuntimeExpression =
        options.createRuntimeExpressionComposition ?? createDefaultRuntimeExpressionComposition;
      const candidate = createRuntimeExpression();
      // Recorded before validation so an incomplete composition is still released on cleanup.
      if (isRecord(candidate)) {
        runtimeExpressionComposition = candidate as unknown as {releaseAll(): unknown};
      }
      const baseComposition = validateCompositionMethods(
        candidate,
        'Runtime Expression composition',
        featureFlags.dsl4ExpressionRuntimeState
          ? ['evaluateCondition', 'validateConditionSyntax', 'releaseAll']
          : ['evaluateCondition', 'releaseAll'],
      );
      const composition = featureFlags.dsl4ExpressionRuntimeState
        ? createDsl4RuntimeStateExpressionComposition({
            composition: baseComposition,
            enabled: true,
          })
        : baseComposition;
      runtimeExpressionComposition = composition;
      const expressionSnapshots = new WeakMap();
      evaluateCondition = (expression, variables, context) => {
        let runtimeSnapshot = isRecord(context) ? expressionSnapshots.get(context) : undefined;
        if (runtimeSnapshot === undefined) {
          runtimeSnapshot = createDsl4RuntimeVariableSnapshot(
            {
              status: 'running',
              sceneId: isRecord(context) ? context.sceneId : null,
              actionIndex: isRecord(context) ? context.actionIndex : -1,
              actionPath: isRecord(context) ? context.actionPath : null,
              variables,
              diagnostic: null,
            },
            {poseState: latestPoseState, version: options.runtimeVersion},
          );
          if (isRecord(context)) expressionSnapshots.set(context, runtimeSnapshot);
        }
        return composition.evaluateCondition(expression, variables, runtimeSnapshot) as
          boolean | Promise<boolean>;
      };
    }

    const port: Record<string, Dsl4RuntimePortOperation | undefined> = {};
    addPortMethods(
      port,
      mediaPort,
      ['stage', 'bgm', 'stopBgm', 'setBgmVolume', 'sound', 'setSkin', 'loop'],
      'media action port',
    );
    if (broadcastActionPort) {
      addPortMethods(
        port,
        broadcastActionPort as unknown as Record<string, Dsl4RuntimePortOperation>,
        ['broadcastMessageAndWait'],
        'TurboWarp broadcast action port',
      );
    }
    addPortMethods(
      port,
      actorPort,
      [
        'show',
        'hide',
        'setLayer',
        'setTransparency',
        'moveTo',
        'say',
        ...(speechAdvanceTypewriterEnabled ? ['think'] : []),
      ],
      'actor action port',
    );
    const activeActorPlatform = actorPlatform;
    const storyActors = isRecord(component.storyDocument.actors)
      ? component.storyDocument.actors
      : {};
    const hideStoryActors = () => {
      const actors = Object.keys(storyActors).map((actorId) => {
        const actor = activeActorPlatform.resolveActor(actorId);
        if (actor === null) {
          throw hostError(
            'K4-HOST-ACTOR-RESET-001',
            `TurboWarp actor is unavailable at the scene boundary: ${actorId}`,
          );
        }
        return {actorId, actor};
      });
      for (const {actorId, actor} of actors) {
        try {
          activeActorPlatform.host.hideActor(actor);
        } catch (cause) {
          const error = hostError(
            'K4-HOST-ACTOR-RESET-002',
            `TurboWarp actor could not be hidden at the scene boundary: ${actorId}`,
          );
          Object.defineProperty(error, 'cause', {value: cause});
          throw error;
        }
      }
    };
    port.hideSceneActors = () => {
      videoPort?.clear();
      audioPort?.clear();
      hideStoryActors();
    };
    addPortMethods(port, audioPort, ['audio', 'audioControl'], 'audio action port');
    if (videoPort) addPortMethods(port, videoPort, ['video', 'videoControl'], 'video action port');
    const activeActorPlatformForTransitions = actorPlatform;
    port.finishPresentationTransitions = () => {
      const errors = [];
      for (const finish of [
        activeActorPlatformForTransitions.finishTransparencyTransitions,
        crossfadePlatform?.finishAll,
      ]) {
        try {
          finish?.();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) {
        throw new AggregateError(errors, 'Presentation transition cleanup failed');
      }
    };
    if (crossfadePlatform) {
      port.createSceneCrossfade = crossfadePlatform.createSceneCrossfade;
    }
    addPortMethods(port, svgTextPlatform.port, ['setText'], 'SVG text action port');
    addPortMethods(
      port,
      assetSession.poseActionPort,
      ['waitForPose', 'poseInputToChangeScene', 'imageInputToChangeScene'],
      'pose action port',
    );
    if (assetSession.posePreviewPort) {
      addPortMethods(
        port,
        assetSession.posePreviewPort,
        ['setPosePreviewMirroring'],
        'pose preview port',
      );
    }
    if (options.keySource !== undefined) {
      addPortMethods(port, asyncInputPort, ['keyInputToChangeScene'], 'async input action port');
    }
    if (options.actorTouchSource !== undefined) {
      addPortMethods(port, asyncInputPort, ['touchInputToChangeScene'], 'async input action port');
    }

    const injectedPort = hostPort as Record<string, Dsl4RuntimePortOperation | undefined>;
    for (const method of Object.keys(injectedPort)) {
      if (method === 'dispose') continue;
      if (Object.hasOwn(port, method)) {
        throw hostError('K4-HOST-PORT-COLLISION', `Runtime port method is duplicated: ${method}`);
      }
      if (!hostPortMethods.has(method)) {
        throw hostError(
          'K4-HOST-PORT-UNSUPPORTED',
          `Injected runtime port is unsupported: ${method}`,
        );
      }
      port[method] = (injectedPort[method] as Dsl4RuntimePortOperation).bind(hostPort);
    }
    if (!Object.hasOwn(port, 'wait')) {
      const schedule = options.waitSchedule ?? defaultWaitSchedule;
      if (typeof schedule !== 'function') throw new TypeError('waitSchedule must be a function');
      addPortMethods(port, createWaitPort(schedule), ['wait'], 'wait action port');
    }
    validateStoryCapabilities(component.storyDocument, port, evaluateCondition);
    Object.freeze(port);

    const activeAssetSession = assetSession;
    const poseModelAssetIds = Object.values(component.storyDocument.assets ?? {})
      .filter((asset) => isRecord(asset) && asset.kind === 'recognitionModel')
      .map((asset) => String(asset.id));
    publishRuntimeDiagnostics(
      Object.freeze({
        getState() {
          const registeredPoseModelCount = poseModelAssetIds.filter((assetId) =>
            activeAssetSession.tmComposition.isPoseModelRegistered(assetId),
          ).length;
          return Object.freeze({
            registeredPoseModelCount,
            activePoseModelCount:
              activeAssetSession.tmComposition.getActivePoseModelName() === null ? 0 : 1,
          });
        },
      }),
    );
    const baseAssetLifecycle = activeAssetSession.lifecycle;
    const previewControls = configuredPreviewControls;
    const controlAssetIds = hasConfiguredPreviewControls
      ? [
          previewControls.mirroring?.assets?.showMirrored,
          previewControls.mirroring?.assets?.showUnmirrored,
          previewControls.cameraMenu?.buttonAsset,
        ].filter((value) => typeof value === 'string')
      : [];
    async function releaseCameraPreviewControls(releaseBase: () => unknown, message: string) {
      const renderer = cameraPreviewControls;
      cameraPreviewControls = null;
      const errors = [];
      try {
        renderer?.dispose();
      } catch (error) {
        errors.push(error);
      }
      try {
        await releaseBase();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, message);
    }

    function setLoadingWithResources(payload: LoadingPayload, context: LoadingContext) {
      const loading = isRecord(payload.loading) ? payload.loading : null;
      if (!payload.visible || !loading) return baseAssetLifecycle.setLoading(payload, context);
      const resourceUrl = (assetId: unknown) => {
        if (typeof assetId !== 'string') return null;
        const resource = activeAssetSession.getAssetResource(assetId);
        return isRecord(resource) && typeof resource.objectUrl === 'string'
          ? resource.objectUrl
          : null;
      };
      const backdrop = resourceUrl(loading.backdrop);
      const costumes = Array.isArray(loading.costumes)
        ? loading.costumes.map(resourceUrl).filter((value) => value !== null)
        : [];
      return baseAssetLifecycle.setLoading(
        Object.freeze({...payload, resources: Object.freeze({backdrop, costumes})}),
        context,
      );
    }

    const unmanagedAssetLifecycle = hasConfiguredPreviewControls
      ? Object.freeze({
          async prepare(payload: Readonly<Record<string, unknown>>, context: LoadingContext) {
            await baseAssetLifecycle.prepare(payload, context);
            const preparedPayload = validateAssetPreparePayload(payload);
            if (
              cameraPreviewControls ||
              !controlAssetIds.every((assetId) => preparedPayload.assetIds.includes(assetId))
            ) {
              return;
            }
            if (!isRecord(options.cameraPreviewControls)) {
              // Unreachable: validateCameraPreviewControlsSurface refused this story at startup.
              throw hostError(
                'K4-HOST-PREVIEW-CONTROLS-002',
                'cameraPreviewControls app-shell options disappeared after startup',
              );
            }
            const assetUrls = Object.fromEntries(
              controlAssetIds.map((assetId) => {
                const resource = activeAssetSession.getAssetResource(assetId);
                if (!isRecord(resource) || typeof resource.objectUrl !== 'string') {
                  throw new TypeError(
                    `Camera preview control asset is not materialized: ${assetId}`,
                  );
                }
                return [assetId, resource.objectUrl];
              }),
            );
            const cameraPreviewOptions =
              options.cameraPreviewControls as CameraPreviewControlsOptions;
            cameraPreviewControls = createDsl4CameraPreviewControls({
              ...cameraPreviewOptions,
              preview,
              assetUrls: Object.freeze(assetUrls),
              port: activeAssetSession.cameraPreviewControlsPort,
            });
            cameraPreviewControls.start();
          },
          setLoading(payload: LoadingPayload, context: LoadingContext) {
            return setLoadingWithResources(payload, context);
          },
          async releaseAssets(payload: Readonly<Record<string, unknown>>) {
            const releasePayload = validateAssetPreparePayload(payload);
            return releaseDsl4PlaybackAssets({
              videoPort,
              audioPort,
              assetIds: releasePayload.assetIds,
              releaseBase() {
                if (controlAssetIds.some((assetId) => releasePayload.assetIds.includes(assetId))) {
                  return releaseCameraPreviewControls(
                    () => baseAssetLifecycle.releaseAssets(payload),
                    'Camera preview controls and selected assets could not be released',
                  );
                }
                return baseAssetLifecycle.releaseAssets(payload);
              },
            });
          },
          async release(payload: Readonly<Record<string, unknown>>) {
            return releaseDsl4PlaybackAssets({
              videoPort,
              audioPort,
              assetIds: undefined,
              releaseBase: () =>
                releaseCameraPreviewControls(
                  () => baseAssetLifecycle.release(payload),
                  'Camera preview controls and assets could not be released',
                ),
            });
          },
        })
      : Object.freeze({
          prepare(payload: Readonly<Record<string, unknown>>, context: LoadingContext) {
            return baseAssetLifecycle.prepare(payload, context);
          },
          setLoading(payload: LoadingPayload, context: LoadingContext) {
            return setLoadingWithResources(payload, context);
          },
          releaseAssets(payload: Readonly<Record<string, unknown>>) {
            return releaseDsl4PlaybackAssets({
              videoPort,
              audioPort,
              assetIds: validateAssetPreparePayload(payload).assetIds,
              releaseBase: () => baseAssetLifecycle.releaseAssets(payload),
            });
          },
          release(payload: Readonly<Record<string, unknown>>) {
            return releaseDsl4PlaybackAssets({
              videoPort,
              audioPort,
              assetIds: undefined,
              releaseBase: () => baseAssetLifecycle.release(payload),
            });
          },
        });

    const sceneCoordinator =
      options.publicationSegmentId === undefined
        ? undefined
        : createDsl4GroupPreloadCoordinator({
            storyDocument: component.storyDocument,
            segmentId: options.publicationSegmentId,
            lifecycle: unmanagedAssetLifecycle,
            excludedStartupAssetIds: cameraPreviewControlsEnabled
              ? []
              : createDsl4AssetDependencyIndex(component.storyDocument).posePreviewControls,
            persistentAssetIds: featureFlags.dsl4CrossfadeTransitions
              ? createDsl4AssetDependencyIndex(component.storyDocument).bgm
              : [],
          });
    const assetLifecycle = Object.freeze({
      ...unmanagedAssetLifecycle,
      ...(sceneCoordinator ? {sceneCoordinator} : {}),
    });

    const cover = isRecord(component.storyDocument.cover) ? component.storyDocument.cover : null;
    const storyCameraLifecycle = activeAssetSession.storyCameraLifecycle;
    async function resetStoryPresentation() {
      videoPort?.clear();
      audioPort?.clear();
      actorPlatform?.finishTransparencyTransitions();
      hideStoryActors();
      await assetSession?.assetManagerComposition.stopAllSounds();
    }
    publishApplicationPort(
      Object.freeze({
        async prepareMenu() {
          await resetStoryPresentation();
          if (typeof cover?.bgm === 'string') {
            await mediaPort?.bgm(
              {sound: cover.bgm},
              Object.freeze({signal: new AbortController().signal}),
            );
          }
          return true;
        },
        async showCover() {
          if (!cover) return false;
          const abortController = new AbortController();
          const coverContext = Object.freeze({signal: abortController.signal});
          await resetStoryPresentation();
          if (typeof cover.backdrop === 'string') {
            await mediaPort?.stage({backdrop: cover.backdrop}, coverContext);
          }
          if (typeof cover.bgm === 'string') {
            await mediaPort?.bgm({sound: cover.bgm}, coverContext);
          }
          return true;
        },
        ...(storyCameraLifecycle
          ? {
              stopStoryCamera() {
                return storyCameraLifecycle.stop();
              },
            }
          : {}),
      }),
    );

    function reportStoryCameraFailure(error: unknown, phase: string) {
      try {
        void Promise.resolve(
          options.onBackgroundActionError?.(error, {
            command: 'camera',
            code: `K4-STORY-CAMERA-${phase}`,
          }),
        ).catch(() => {});
      } catch {
        // A background error observer cannot change camera cleanup ownership.
      }
    }

    publishRuntimeLifecycleObserver((event) => {
      if (event.type === 'runtime.start') {
        latestPoseState = null;
        void storyCameraLifecycle
          ?.start()
          .catch((error) => reportStoryCameraFailure(error, 'START'));
        return;
      }
      if (
        event.type === 'runtime.finish' ||
        event.type === 'runtime.fail' ||
        event.type === 'runtime.stop'
      ) {
        mediaPort?.stopAllLoops();
        videoPort?.clear();
        audioPort?.clear();
        cameraPreviewControls?.stop();
        void storyCameraLifecycle?.stop().catch((error) => reportStoryCameraFailure(error, 'STOP'));
        return;
      }
      if (event.type === 'navigation.reposition' || event.type === 'runtime.resume') {
        if (hasConfiguredPreviewControls) cameraPreviewControls?.start();
        void storyCameraLifecycle
          ?.start()
          .catch((error) => reportStoryCameraFailure(error, 'RESUME'));
      }
    });

    const cleanup = createDsl4RetryableCleanup({
      message: 'DSL 4.0 TurboWarp environment disposal failed',
      steps: [
        () => {
          publishRuntimeLifecycleObserver(null);
          latestPoseState = null;
        },
        ...(sceneCoordinator ? [(reason: string) => sceneCoordinator.release(reason)] : []),
        () => broadcastActionPort?.dispose(),
        () => mediaPort?.dispose(),
        () => videoPort?.dispose(),
        () => audioPort?.dispose(),
        () => crossfadePlatform?.dispose(),
        () => actorPlatform?.dispose(),
        () => scratchPoseFeedbackAdapter?.dispose(),
        () => poseFeedbackPresenter?.dispose(),
        () => cameraPreviewControls?.dispose(),
        () => hostPort.dispose?.(),
        () => runtimeExpressionComposition?.releaseAll(),
        () => bubblePlatform?.releaseAll(),
        () => svgTextPlatform?.releaseAll(),
        () => inputArbitration.dispose(),
        {
          run: (reason) => assetSession?.dispose(reason),
          isPending: () => assetSession?.hasPendingCleanup() ?? false,
        },
      ],
    });
    const environment = {
      port,
      assetLifecycle,
      evaluateCondition,
      inputArbitration,
      getPoseState() {
        return latestPoseState;
      },
      hasPendingCleanup: cleanup.hasPendingCleanup,
      dispose(reason: string = 'dispose') {
        return cleanup.run(reason);
      },
    };
    publishVerifiedRemoteCache(assetSession.verifiedRemoteCache);
    return Object.freeze(environment);
  } catch (error) {
    const cleanupErrors = [];
    for (const release of [
      () => broadcastActionPort?.dispose(),
      () => mediaPort?.dispose(),
      () => videoPort?.dispose(),
      () => audioPort?.dispose(),
      () => crossfadePlatform?.dispose(),
      () => actorPlatform?.dispose(),
      () => scratchPoseFeedbackAdapter?.dispose(),
      () => poseFeedbackPresenter?.dispose(),
      () => cameraPreviewControls?.dispose(),
      () => hostPort.dispose?.(),
      () => runtimeExpressionComposition?.releaseAll(),
      () => bubblePlatform?.releaseAll(),
      () => svgTextPlatform?.releaseAll(),
      () => inputArbitration.dispose(),
      () => assetSession?.dispose('partial-creation-failed'),
    ]) {
      try {
        await release();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        'DSL 4.0 TurboWarp environment creation and cleanup failed',
      );
    }
    throw error;
  }
}

/**
 * Create one host-owned, default-off TurboWarp session for a packaged DSL 4.0 component.
 * The returned host never starts the story or attaches a key listener automatically.
 */
export async function createDsl4TurboWarpRuntimeHost(options: TurboWarpRuntimeHostOptions = {}) {
  if (!isRecord(options)) throw new TypeError('DSL 4.0 TurboWarp host options must be an object');
  const featureFlags = resolveDsl4FeatureFlags(options.featureFlags);
  if (!featureFlags.dsl4Runtime) {
    const disabled = await createDsl4RuntimeStartup({featureFlags});
    return deepFreeze({...disabled, host: null});
  }
  const assetBundleFormat = options.assetBundleFormat ?? 'embedded-base64';
  if (assetBundleFormat !== 'embedded-base64' && assetBundleFormat !== 'binary-entry') {
    throw new TypeError('assetBundleFormat must be embedded-base64 or binary-entry');
  }
  if (assetBundleFormat === 'binary-entry' && options.binaryEntryProvider === undefined) {
    throw new TypeError('binaryEntryProvider is required for binary-entry runtime startup');
  }
  if (assetBundleFormat === 'embedded-base64' && options.binaryEntryProvider !== undefined) {
    throw new TypeError('binaryEntryProvider requires assetBundleFormat binary-entry');
  }
  const sessionBackingConfig = resolveDsl4SessionBackingConfig(
    options,
    featureFlags,
    assetBundleFormat,
  );
  if (options.createHostPort !== undefined && typeof options.createHostPort !== 'function') {
    throw new TypeError('createHostPort must be a function');
  }
  if (options.evaluateCondition !== undefined && typeof options.evaluateCondition !== 'function') {
    throw new TypeError('evaluateCondition must be a function');
  }
  if (options.setBusy !== undefined && typeof options.setBusy !== 'function') {
    throw new TypeError('setBusy must be a function');
  }
  if (options.setCursor !== undefined && typeof options.setCursor !== 'function') {
    throw new TypeError('setCursor must be a function');
  }
  if (
    options.runtimeVersion !== undefined &&
    (typeof options.runtimeVersion !== 'string' || options.runtimeVersion.length === 0)
  ) {
    throw new TypeError('runtimeVersion must be a non-empty string');
  }
  const cacheLeaseHeartbeatMs = options.cacheLeaseHeartbeatMs ?? defaultCacheLeaseHeartbeatMs;
  if (!Number.isSafeInteger(cacheLeaseHeartbeatMs) || cacheLeaseHeartbeatMs < 1) {
    throw new TypeError('cacheLeaseHeartbeatMs must be a positive safe integer');
  }
  const scheduleCacheLeaseHeartbeat =
    options.scheduleCacheLeaseHeartbeat ?? defaultCacheLeaseHeartbeatSchedule;
  if (typeof scheduleCacheLeaseHeartbeat !== 'function') {
    throw new TypeError('scheduleCacheLeaseHeartbeat must be a function');
  }

  let publicationCoordinator: ReturnType<typeof createDsl4GroupPreloadCoordinator> | undefined;
  let verifiedRemoteCache: VerifiedRemoteCachePort | null = null;
  let binarySessionBacking: BinarySessionBackingPort | null = null;
  let sessionBackingFatalError: unknown = null;
  let stopForSessionBackingFatal: null | (() => void) = null;
  let runtimeLifecycleObserver: ((event: Readonly<Record<string, unknown>>) => void) | null = null;
  const runtimeEventListeners: Set<(event: Readonly<Record<string, unknown>>) => void> = new Set();
  // The application port is a different contract from the runtime port: its members take no action
  // payload, and the host only ever asks it for the cover and the menu.
  let applicationPort: Readonly<{showCover?(): unknown; prepareMenu?(): unknown}> | null = null;
  let runtimeDiagnosticsPort: Readonly<{getState: () => Readonly<Record<string, number>>}> | null =
    null;
  let runtimeVariableStatePort: Readonly<{
    getPoseState: () => Readonly<Record<string, unknown>> | null;
  }> | null = null;
  if (
    options.createRuntimeExpressionComposition !== undefined &&
    typeof options.createRuntimeExpressionComposition !== 'function'
  ) {
    throw new TypeError('createRuntimeExpressionComposition must be a function');
  }
  if (
    options.evaluateCondition !== undefined &&
    options.createRuntimeExpressionComposition !== undefined
  ) {
    throw new TypeError(
      'Provide either evaluateCondition or createRuntimeExpressionComposition, not both',
    );
  }

  function handleSessionBackingFatalError(error: unknown) {
    sessionBackingFatalError = error;
    try {
      stopForSessionBackingFatal?.();
    } catch {
      // The backing error remains authoritative if the runtime is already stopped or disposed.
    }
    try {
      options.onSessionBackingFatalError?.(error);
    } catch {
      // Diagnostic presentation cannot suppress safe runtime stop.
    }
  }

  const runtimeEnvironmentOptions =
    sessionBackingConfig === null
      ? options
      : {
          ...options,
          binarySessionBackingPolicy: sessionBackingConfig.policy,
          binarySessionId: sessionBackingConfig.sessionId,
          sessionBinaryBackingOptions: sessionBackingConfig.storeOptions,
          onBinarySessionBackingWarning(warning: Readonly<Record<string, unknown>>) {
            try {
              options.onSessionBackingWarning?.(warning);
            } catch {
              // Warning presentation cannot change the fixed backing mode.
            }
          },
          onBinarySessionBackingFatalError: handleSessionBackingFatalError,
        };

  const startup = await createDsl4RuntimeStartup({
    featureFlags,
    project: options.project,
    ...(options.sourceFrontend === undefined ? {} : {sourceFrontend: options.sourceFrontend}),
    ...(options.maxSourceBytes === undefined ? {} : {maxSourceBytes: options.maxSourceBytes}),
    ...(options.maxAssetFiles === undefined ? {} : {maxAssetFiles: options.maxAssetFiles}),
    ...(options.maxAssetFileBytes === undefined
      ? {}
      : {maxAssetFileBytes: options.maxAssetFileBytes}),
    ...(options.maxTotalAssetBytes === undefined
      ? {}
      : {maxTotalAssetBytes: options.maxTotalAssetBytes}),
    assetBundleFormat,
    ...(options.historyNavigationAvailable === undefined
      ? {}
      : {historyNavigationAvailable: options.historyNavigationAvailable}),
    ...(options.historyLimits === undefined ? {} : {historyLimits: options.historyLimits}),
    ...(options.evaluateCondition === undefined
      ? {}
      : {evaluateCondition: options.evaluateCondition}),
    onEvent(event) {
      try {
        runtimeLifecycleObserver?.(event);
      } catch {
        // Internal UI observers cannot change runtime execution or suppress consumer events.
      }
      for (const listener of runtimeEventListeners) {
        try {
          listener(event);
        } catch {
          // Terminal result listeners cannot change runtime execution or consumer events.
        }
      }
      options.onEvent?.(event);
    },
    ...(options.onInputError === undefined ? {} : {onInputError: options.onInputError}),
    subtleCrypto: options.subtleCrypto,
    ...(options.unlockSealedStory === undefined
      ? {}
      : {unlockSealedStory: options.unlockSealedStory}),
    ...(options.sealedKeyCache === undefined ? {} : {sealedKeyCache: options.sealedKeyCache}),
    async createRuntimeEnvironment(
      runtimeComponent: Readonly<Record<string, unknown>>,
      startupContext: RuntimeStartupContext,
    ) {
      const environment = await createDsl4TurboWarpRuntimeEnvironment(
        runtimeEnvironmentOptions,
        runtimeComponent,
        (cache) => {
          verifiedRemoteCache = cache;
        },
        (backing) => {
          binarySessionBacking = backing;
        },
        (observer) => {
          runtimeLifecycleObserver = observer;
        },
        startupContext.featureFlags.dsl4PoseFeedbackModes,
        startupContext.featureFlags.dsl4PosePreviewMirroring,
        startupContext.featureFlags.dsl4CameraPreviewControls,
        startupContext.featureFlags.dsl4SpeechAdvanceTypewriter,
        (port) => {
          applicationPort = port;
        },
        (port) => {
          runtimeDiagnosticsPort = port;
        },
        (port) => {
          runtimeVariableStatePort = port;
        },
      );
      publicationCoordinator = environment.assetLifecycle.sceneCoordinator;
      return environment;
    },
  });
  if (!startup.ok) return deepFreeze({...startup, host: null});

  const successfulStartup = startup as unknown as Readonly<{
    featureFlags: Readonly<{
      dsl4Runtime: boolean;
      dsl4BroadcastMessageAndWait: boolean;
      dsl4IndexedDBAssetSessionStore: boolean;
      dsl4AppShell: boolean;
      dsl4WebPreviewAdapter: boolean;
      dsl4WebPreviewAssetLiveReload: boolean;
      dsl4PreviewReloadOverlay: boolean;
      dsl4PoseFeedbackModes: boolean;
      dsl4PosePreviewMirroring: boolean;
      dsl4CameraPreviewControls: boolean;
      dsl4SpeechAdvanceTypewriter: boolean;
      dsl4TurboWarpBubbleAdvancedPresentation: boolean;
      dsl4TurboWarpActionSurface: boolean;
      structuredDataIntegrationEnabled: boolean;
    }>;
    channel: 'bundled' | 'unbundled';
    runtimeComponent: Readonly<Record<string, unknown>>;
    session: Dsl4NavigationSessionSurface;
  }>;
  const session = successfulStartup.session;

  function startSessionUntilTerminal(startOptions?: {sceneId?: string}) {
    let observedStart = false;
    let listener: (event: Readonly<Record<string, unknown>>) => void = () => {};
    const terminalEvent = new Promise((resolve) => {
      listener = (event) => {
        if (event.type === 'runtime.start') {
          observedStart = true;
          return;
        }
        if (!observedStart || !terminalRuntimeEvents.has(String(event.type))) return;
        resolve(session.getState().runtime);
      };
      runtimeEventListeners.add(listener);
    });
    let initialRun;
    try {
      initialRun = Promise.resolve(session.start(startOptions));
    } catch (error) {
      runtimeEventListeners.delete(listener);
      throw error;
    }
    return Promise.race([
      terminalEvent,
      initialRun.then((result) =>
        terminalRuntimeStatuses.has(String(result.status)) ? result : terminalEvent,
      ),
    ]).finally(() => runtimeEventListeners.delete(listener));
  }

  stopForSessionBackingFatal = () => {
    session.stop('session-binary-backing-fatal');
  };
  if (sessionBackingFatalError !== null) {
    try {
      stopForSessionBackingFatal();
    } catch {
      // Startup already owns and reports the authoritative backing failure.
    }
  }
  const cachePort = verifiedRemoteCache as VerifiedRemoteCachePort | null;
  const binaryBackingPort = binarySessionBacking as BinarySessionBackingPort | null;
  let cacheExecutionId = 0;
  const cacheLeaseLifecycle = createDsl4RuntimeCacheLeaseLifecycle({
    cachePort,
    heartbeatMs: cacheLeaseHeartbeatMs,
    scheduleHeartbeat: scheduleCacheLeaseHeartbeat,
  });
  const cleanup = createDsl4RetryableCleanup({
    message: 'DSL 4.0 TurboWarp host disposal failed',
    parallel: true,
    steps: [
      () => {
        cacheExecutionId += 1;
      },
      () => session.getRunPromise(),
      {
        run: (reason) => session.dispose(reason),
        isPending: () => session.hasPendingCleanup?.() ?? false,
      },
      () => session.whenInputIdle(),
      () => cacheLeaseLifecycle.deactivate(),
    ],
  });
  function ensureActive() {
    if (cleanup.requested)
      throw hostError('K4-HOST-DISPOSED', 'DSL 4.0 TurboWarp host is disposed');
  }
  const host = Object.freeze({
    async preparePublicationScene(sceneId: string, signal?: AbortSignal) {
      ensureActive();
      if (!publicationCoordinator) throw new Error('Publication group ownership is required');
      const coordinator = publicationCoordinator;
      const abort = () => coordinator.cancel('publication-cancelled');
      const check = () => {
        if (signal?.aborted) throw new DOMException('Publication cancelled', 'AbortError');
      };
      signal?.addEventListener('abort', abort, {once: true});
      try {
        check();
        const startup = await coordinator.prepareStartup(0);
        if (!startup.ok)
          throw startup.cancelled ? new DOMException('Cancelled', 'AbortError') : startup.error;
        check();
        coordinator.beginScene(sceneId, 0);
        const ready = await coordinator.waitForScene(sceneId);
        if (!ready.ok)
          throw ready.cancelled ? new DOMException('Cancelled', 'AbortError') : ready.error;
        check();
        await coordinator.commitScene(sceneId, 'publication-prepare');
      } finally {
        signal?.removeEventListener('abort', abort);
      }
    },
    getAssetGroupSnapshot() {
      return publicationCoordinator?.snapshot() ?? null;
    },
    start(startOptions?: {sceneId?: string}) {
      ensureActive();
      cacheExecutionId += 1;
      const activeCacheExecutionId = cacheExecutionId;
      return (async () => {
        try {
          await cacheLeaseLifecycle.activate();
          if (cacheExecutionId !== activeCacheExecutionId) return session.getState().runtime;
          ensureActive();
          const result = await startSessionUntilTerminal(startOptions);
          // The runtime lifecycle observer already starts terminal camera cleanup. Camera
          // startup may still be pending (for example, while browser permission settles), so
          // awaiting that cleanup here would prevent the terminal result and menu from publishing.
          return result;
        } finally {
          if (cacheExecutionId === activeCacheExecutionId) {
            // Releasing an IndexedDB cache lease is maintenance work. A stalled browser
            // transaction must not keep the terminal story result — and therefore the
            // application menu — from being published.
            void cacheLeaseLifecycle.deactivate();
          }
        }
      })();
    },
    stop(reason?: string) {
      ensureActive();
      cacheExecutionId += 1;
      const state = session.stop(reason);
      void cacheLeaseLifecycle.deactivate();
      return state;
    },
    invokeAction(action: Readonly<Record<string, unknown>>) {
      ensureActive();
      return session.invokeAction(action);
    },
    queueVariableWrite(request: unknown) {
      ensureActive();
      return session.queueVariableWrite(request);
    },
    rejectActionInvocation(error: unknown) {
      ensureActive();
      return session.rejectActionInvocation(error);
    },
    attach(target: unknown) {
      ensureActive();
      return session.attach(target);
    },
    attachStagePointer(target: unknown) {
      ensureActive();
      return session.attachStagePointer(target);
    },
    detach() {
      ensureActive();
      return session.detach();
    },
    detachStagePointer() {
      ensureActive();
      return session.detachStagePointer();
    },
    dispatchCommand(command: string) {
      ensureActive();
      return session.dispatchCommand(command);
    },
    handleKeyDown(event: Record<string, unknown>) {
      ensureActive();
      return session.handleKeyDown(event);
    },
    handlePointerUp(event: Record<string, unknown>) {
      ensureActive();
      return session.handlePointerUp(event);
    },
    whenInputIdle() {
      return session.whenInputIdle();
    },
    getState() {
      return session.getState();
    },
    getRuntimeVariableSnapshot() {
      if (!featureFlags.dsl4TurboWarpStateSurface) return null;
      return createDsl4RuntimeVariableSnapshot(session.getState().runtime, {
        poseState: runtimeVariableStatePort?.getPoseState() ?? null,
        version: options.runtimeVersion,
        disposed: cleanup.requested,
      });
    },
    getRunPromise() {
      return session.getRunPromise();
    },
    async showCover() {
      ensureActive();
      return applicationPort?.showCover?.() ?? false;
    },
    async prepareMenu() {
      ensureActive();
      return applicationPort?.prepareMenu?.() ?? false;
    },
    verifiedRemoteCache:
      cachePort === null
        ? null
        : Object.freeze({
            identity: cachePort.identity,
            getWarnings: cachePort.getWarnings,
            takeWarnings: cachePort.takeWarnings,
            getStats: cachePort.getStats,
            prune: cachePort.prune,
            clear: cachePort.clear,
            listStoryCaches: cachePort.listStoryCaches,
            pruneStoryCaches: cachePort.pruneStoryCaches,
            deleteStoryCache: cachePort.deleteStoryCache,
            getHeartbeatError() {
              return cacheLeaseLifecycle.getError();
            },
          }),
    diagnostics: Object.freeze({
      getState() {
        const port = runtimeDiagnosticsPort as Readonly<{
          getState: () => Readonly<Record<string, number>>;
        }> | null;
        return (
          port?.getState() ?? Object.freeze({registeredPoseModelCount: 0, activePoseModelCount: 0})
        );
      },
    }),
    sessionBinaryBacking:
      binaryBackingPort === null
        ? null
        : Object.freeze({
            getState: binaryBackingPort.getState,
            getFatalError() {
              return sessionBackingFatalError;
            },
          }),
    hasPendingCleanup: cleanup.hasPendingCleanup,
    dispose(reason: string = 'dispose') {
      return cleanup.run(reason);
    },
  });

  return deepFreeze({
    ok: true,
    enabled: true,
    featureFlags: successfulStartup.featureFlags,
    channel: successfulStartup.channel,
    runtimeComponent: successfulStartup.runtimeComponent,
    host,
    diagnostics: [],
  });
}
