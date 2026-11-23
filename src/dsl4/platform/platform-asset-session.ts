import type {TMCompositionOptions} from '@kubohiroya/turbowarp-teachable-machine/composition';
import {
  Dsl4CreationFailure,
  createDsl4CreationCleanup,
  dsl4FailedCreationCleanupSteps,
} from '../creation-cleanup.js';
import {createDsl4RetryableCleanup} from '../retryable-cleanup.js';
import {createAssetManagerComposition as createDefaultAssetManagerComposition} from '@kubohiroya/turbowarp-asset-cache/composition';
import {createAsyncInputComposition as createDefaultAsyncInputComposition} from '@kubohiroya/turbowarp-async-input/composition';
import {createSessionBinaryBacking as createDefaultSessionBinaryBacking} from '@kubohiroya/turbowarp-kvs/session-binary-backing';

import {
  type Dsl4CompositionMethod,
  type Dsl4ForwardedFactory,
  validateCompositionMethods,
} from './composition-contract.js';
import {
  createDsl4EmbeddedAssetLifecycle,
  createDsl4RemoteAssetLifecycle,
  type Dsl4MaterializationRetention,
} from '../embedded-asset-lifecycle.js';
import {validateDsl4CacheIdentity} from '../cache-identity.js';
import type {Dsl4SubtleCrypto} from '../subtle-crypto.js';
import {createDsl4AssetManagerAdapter} from './asset-manager-adapter.js';
import {createDsl4VideoAssetAdapter} from './video-asset-adapter.js';
import {createDsl4ObjectUrlOwner, type Dsl4ObjectUrlOwner} from './object-url-owner.js';
import {createDsl4PlatformAssetAdapter} from './asset-adapter-router.js';
import {createDsl4BinaryEntryBacking} from './binary-entry-backing.js';
import {createDsl4PoseActionPort} from './pose-action-port.js';
import {
  createDsl4PoseArchiveExtractor,
  dsl4PoseArchiveDefaultLimits,
  isDsl4RemotePoseArchiveUrl,
} from './pose-archive-extractor.js';
import {createDsl4TMPlatform} from './tm-model-adapter.js';
import {
  createDsl4StoryCameraLifecycle,
  storyUsesPoseRecognition,
} from './story-camera-lifecycle.js';
import {readDsl4PosePreviewPlacement} from './pose-preview-placement.js';
import {encodeDsl4StoryPathSegment} from '../story-path.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const posePreviewMirroringModes = new Set(['mirrored', 'unmirrored']);

interface PlatformAssetSource {
  readonly type?: unknown;
  readonly url?: unknown;
  readonly integrity?: unknown;
  readonly size?: unknown;
  readonly contentType?: unknown;
}

interface PlatformManifestAsset {
  readonly id: string;
  readonly kind?: unknown;
  readonly source?: unknown;
}

interface PlatformAssetBundle {
  readonly manifest: {readonly assets: readonly PlatformManifestAsset[]};
  readonly integrity?: string;
  readonly files?: readonly unknown[];
}

interface PlatformRuntimeComponent {
  readonly storyDocument: Readonly<Record<string, unknown>>;
  readonly assetBundle: PlatformAssetBundle;
  getAssetFile?(assetId: string, context?: Readonly<Record<string, unknown>>): unknown;
}

interface VerifiedRemoteAssetPayload {
  readonly [key: string]: unknown;
  readonly assetId?: unknown;
  readonly url?: unknown;
  readonly integrity?: unknown;
  readonly size?: unknown;
  readonly contentType?: unknown;
}

interface AssetLoadContext {
  readonly [key: string]: unknown;
  readonly signal?: unknown;
}

function platformAssetSource(value: unknown): PlatformAssetSource | null {
  return isRecord(value) ? value : null;
}

function optionalAbortSignal(value: unknown): AbortSignal | undefined {
  if (value === undefined) return undefined;
  if (
    isRecord(value) &&
    typeof value.aborted === 'boolean' &&
    typeof value.addEventListener === 'function' &&
    typeof value.removeEventListener === 'function'
  ) {
    return value as unknown as AbortSignal;
  }
  throw new TypeError('asset operation signal must be an AbortSignal');
}

function validateRuntimeComponent(
  value: unknown,
  binaryEntryEnabled: boolean,
): PlatformRuntimeComponent {
  const component = isRecord(value) ? value : {};
  const storyDocument = isRecord(component.storyDocument) ? component.storyDocument : null;
  const assetBundle = isRecord(component.assetBundle) ? component.assetBundle : null;
  const manifest = isRecord(assetBundle?.manifest) ? assetBundle.manifest : null;
  if (
    storyDocument?.kind !== 'StoryDocument' ||
    storyDocument.version !== '4.0' ||
    !Array.isArray(manifest?.assets) ||
    (binaryEntryEnabled
      ? typeof assetBundle?.integrity !== 'string' || !Array.isArray(assetBundle?.files)
      : typeof component.getAssetFile !== 'function')
  ) {
    throw new TypeError('runtimeComponent must provide a validated StoryDocument and asset bundle');
  }
  const ids = new Set();
  for (const asset of manifest.assets) {
    if (!isRecord(asset) || typeof asset.id !== 'string' || ids.has(asset.id)) {
      throw new TypeError('asset bundle manifest must contain unique asset records');
    }
    ids.add(asset.id);
  }
  return component as unknown as PlatformRuntimeComponent;
}

function validateTMRuntime(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.Webcam !== 'function' ||
    typeof value.loadFromFiles !== 'function'
  ) {
    throw new TypeError('tmPoseRuntime must provide Webcam and loadFromFiles');
  }
  return value;
}

/** Keep the synchronous factory while exposing its asynchronous cleanup completion. */
function failCreation(compositions: unknown[], failure: unknown): never {
  const cleanup = createDsl4CreationCleanup(
    [
      ...dsl4FailedCreationCleanupSteps(failure),
      ...[...compositions].reverse().map((composition) => ({
        run() {
          if (isRecord(composition) && typeof composition.releaseAll === 'function')
            return composition.releaseAll();
        },
        isPending() {
          return isRecord(composition) && typeof composition.hasPendingCleanup === 'function'
            ? composition.hasPendingCleanup() === true
            : false;
        },
      })),
    ],
    'DSL 4.0 partial platform asset cleanup failed',
    true,
  );
  const error = new Dsl4CreationFailure(
    failure,
    cleanup,
    'DSL 4.0 platform asset session creation failed',
  );
  void cleanup.dispose('partial-creation-failed').catch(() => {});
  throw error;
}

function disposedError() {
  const error = new Error('DSL 4.0 platform asset session is disposing or disposed');
  Object.defineProperty(error, 'code', {value: 'K4-PLATFORM-ASSET-SESSION-001'});
  return error;
}

/** Keep the pose overlay source opt-in at the DSL boundary. */
function configurePoseOverlay(
  composition: Record<
    | 'hidePoseOverlay'
    | 'showPoseOverlay'
    | 'setPoseJointStyle'
    | 'setPoseBoneStyle'
    | 'setPoseOverlayMinimumConfidence'
    | 'setPoseOverlayConfidenceScaling',
    Dsl4CompositionMethod
  >,
  overlay: Record<string, unknown> | null,
) {
  if (!overlay) {
    composition.hidePoseOverlay?.();
    return;
  }
  const jointStyles = isRecord(overlay.jointStyles) ? overlay.jointStyles : {};
  for (const [part, style] of Object.entries(jointStyles)) {
    composition.setPoseJointStyle(part, style);
  }
  if (isRecord(overlay.boneStyle)) composition.setPoseBoneStyle(overlay.boneStyle);
  if (typeof overlay.minimumConfidence === 'number') {
    composition.setPoseOverlayMinimumConfidence(overlay.minimumConfidence);
  }
  if (isRecord(overlay.confidenceScaling)) {
    composition.setPoseOverlayConfidenceScaling(overlay.confidenceScaling);
  }
  if (overlay.visible === false) composition.hidePoseOverlay();
  else composition.showPoseOverlay();
}

/**
 * Create one app-shell-scoped asset session after the DSL 4.0 runtime component is validated.
 * This module intentionally remains outside the default-off core index. The app shell creates a
 * session only from the enabled startup path and captures both compositions for later action-port
 * construction.
 */
export function createDsl4PlatformAssetSession(options: {
  runtimeComponent: unknown;
  /** Injected `@kubohiroya/turbowarp-runtime-adapter` adapter. */
  runtimeHost?: unknown;
  binaryEntryProvider?: unknown;
  binarySessionBackingPolicy?: 'prefer' | 'required' | 'disabled';
  binarySessionId?: string;
  sessionBinaryBackingOptions?: Readonly<Record<string, unknown>>;
  onBinarySessionBackingWarning?: (warning: Readonly<Record<string, unknown>>) => unknown;
  onBinarySessionBackingFatalError?: (error: unknown) => unknown;
  tmPoseRuntime: unknown;
  compute?: TMCompositionOptions['compute'];
  computeMode?: TMCompositionOptions['computeMode'];
  setLoading: (
    payload: Readonly<Record<string, unknown>>,
    context: Readonly<Record<string, unknown>>,
  ) => unknown | Promise<unknown>;
  setBusy?: (
    payload: Readonly<{visible: boolean; source: string; label: string; cursor?: string}>,
  ) => unknown | Promise<unknown>;
  setCursor?: (
    payload: Readonly<{visible: boolean; source: string; cursor: string}>,
  ) => unknown | Promise<unknown>;
  loadRemoteAsset?: (
    payload: Readonly<Record<string, unknown>>,
    context: Readonly<Record<string, unknown>>,
  ) => unknown | Promise<unknown>;
  cacheIdentity?: unknown;
  verifiedRemoteCacheOptions?: Readonly<Record<string, unknown>>;
  poseArchiveLimits?: Readonly<Record<string, unknown>>;
  subtleCrypto?: Dsl4SubtleCrypto | undefined;
  createFile?: Dsl4ForwardedFactory;
  /** Called here, not forwarded: the session builds the asset manager itself. */
  createAssetManagerComposition?: (
    ...parameters: Parameters<typeof createDefaultAssetManagerComposition>
  ) => ReturnType<typeof createDefaultAssetManagerComposition>;
  /** KVS owns binary persistence independently from the browser asset composition. */
  createSessionBinaryBacking?: typeof createDefaultSessionBinaryBacking;
  createTMComposition?: Dsl4ForwardedFactory;
  /** Called here, not forwarded: the session builds the async input composition itself. */
  createAsyncInputComposition?: typeof createDefaultAsyncInputComposition;
  keySource?: unknown;
  actorTouchSource?: unknown;
  poseSchedule?: Dsl4ForwardedFactory;
  poseNow?: Dsl4ForwardedFactory;
  poseFeedbackEnabled?: boolean;
  onPoseState?: (event: Readonly<Record<string, unknown>>) => unknown | undefined;
  posePreviewMirroringEnabled?: boolean;
  readPoseStateBinding?: () => Readonly<{confidence?: number; progress?: number}> | null;
  cameraPreviewControlsEnabled?: boolean;
  cameraPreviewMirroringControlEnabled?: boolean;
  cameraMenuControlEnabled?: boolean;
  /** Shared video leases across segments of the same publication. */
  videoAssetAdapter?: ReturnType<typeof createDsl4VideoAssetAdapter>;
  /** Shared Object URL leases: equal images, and equal videos, each keep one URL. */
  objectUrlOwner?: Dsl4ObjectUrlOwner;
  /** Byte/entry budget for released handles kept for reuse. Default 0 releases immediately. */
  materializationRetention?: Dsl4MaterializationRetention;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  onCameraCleanupError?: (error: unknown) => unknown;
  onPreviewMirroringChange?: (mode: 'mirrored' | 'unmirrored') => void;
}) {
  if (!isRecord(options)) throw new TypeError('platform asset session options must be an object');
  const binaryEntryEnabled = options.binaryEntryProvider !== undefined;
  const runtimeComponent = validateRuntimeComponent(options.runtimeComponent, binaryEntryEnabled);
  const tmPoseRuntime = validateTMRuntime(options.tmPoseRuntime);
  if (
    options.onCameraCleanupError !== undefined &&
    typeof options.onCameraCleanupError !== 'function'
  ) {
    throw new TypeError('onCameraCleanupError must be a function');
  }
  if (typeof options.setLoading !== 'function') {
    throw new TypeError('setLoading must be a function');
  }
  if (options.setBusy !== undefined && typeof options.setBusy !== 'function') {
    throw new TypeError('setBusy must be a function');
  }
  if (options.setCursor !== undefined && typeof options.setCursor !== 'function') {
    throw new TypeError('setCursor must be a function');
  }
  if (options.loadRemoteAsset !== undefined && typeof options.loadRemoteAsset !== 'function') {
    throw new TypeError('loadRemoteAsset must be a function');
  }
  const componentAssetBundle = runtimeComponent.assetBundle;
  const remoteRequired = componentAssetBundle.manifest.assets.some((asset) => {
    const source = platformAssetSource(asset.source);
    return source?.type === 'remote';
  });
  const verifiedRemoteRequired = componentAssetBundle.manifest.assets.some((asset) => {
    const source = platformAssetSource(asset.source);
    return source?.type === 'remote' && typeof source.integrity === 'string';
  });
  const remoteEnabled = remoteRequired && typeof options.loadRemoteAsset === 'function';
  const verifiedRemoteEnabled = remoteEnabled && verifiedRemoteRequired;
  const remoteLoader = remoteEnabled
    ? (options.loadRemoteAsset as (
        payload: Readonly<Record<string, unknown>>,
        context: Readonly<Record<string, unknown>>,
      ) => unknown | Promise<unknown>)
    : null;
  let cacheIdentity: ReturnType<typeof validateDsl4CacheIdentity> | null = null;
  if (verifiedRemoteEnabled || binaryEntryEnabled) {
    if (options.cacheIdentity === undefined) {
      throw new TypeError(
        'cacheIdentity must be an object when verified remote or binary-entry loading is enabled',
      );
    }
    cacheIdentity = validateDsl4CacheIdentity(options.cacheIdentity);
  }
  const remotePoseArchiveRequired = componentAssetBundle.manifest.assets.some((asset) => {
    const source = platformAssetSource(asset.source);
    return (
      asset.kind === 'recognitionModel' &&
      source?.type === 'remote' &&
      (typeof source.integrity === 'string' || isDsl4RemotePoseArchiveUrl(source.url))
    );
  });
  if (
    options.verifiedRemoteCacheOptions !== undefined &&
    !isRecord(options.verifiedRemoteCacheOptions)
  ) {
    throw new TypeError('verifiedRemoteCacheOptions must be an object');
  }
  if (
    options.sessionBinaryBackingOptions !== undefined &&
    !isRecord(options.sessionBinaryBackingOptions)
  ) {
    throw new TypeError('sessionBinaryBackingOptions must be an object');
  }
  if (binaryEntryEnabled) {
    if (
      typeof options.binarySessionBackingPolicy !== 'string' ||
      !['prefer', 'required', 'disabled'].includes(options.binarySessionBackingPolicy)
    ) {
      throw new TypeError(
        'binarySessionBackingPolicy must be prefer, required, or disabled for binary-entry loading',
      );
    }
    if (typeof options.binarySessionId !== 'string' || options.binarySessionId.length === 0) {
      throw new TypeError('binarySessionId must be a non-empty string for binary-entry loading');
    }
  }
  if (
    options.onBinarySessionBackingWarning !== undefined &&
    typeof options.onBinarySessionBackingWarning !== 'function'
  ) {
    throw new TypeError('onBinarySessionBackingWarning must be a function');
  }
  if (
    options.onBinarySessionBackingFatalError !== undefined &&
    typeof options.onBinarySessionBackingFatalError !== 'function'
  ) {
    throw new TypeError('onBinarySessionBackingFatalError must be a function');
  }
  if (options.createFile !== undefined && typeof options.createFile !== 'function') {
    throw new TypeError('createFile must be a function');
  }
  const poseArchiveExtractor =
    remoteEnabled && remotePoseArchiveRequired
      ? createDsl4PoseArchiveExtractor({
          limits: options.poseArchiveLimits ?? dsl4PoseArchiveDefaultLimits,
          subtleCrypto: options.subtleCrypto,
        })
      : null;
  const createAssetManager =
    options.createAssetManagerComposition ?? createDefaultAssetManagerComposition;
  if (typeof createAssetManager !== 'function') {
    throw new TypeError('createAssetManagerComposition must be a function');
  }
  const createSessionBinaryBacking =
    options.createSessionBinaryBacking ?? createDefaultSessionBinaryBacking;
  if (typeof createSessionBinaryBacking !== 'function') {
    throw new TypeError('createSessionBinaryBacking must be a function');
  }
  if (
    options.createTMComposition !== undefined &&
    typeof options.createTMComposition !== 'function'
  ) {
    throw new TypeError('createTMComposition must be a function');
  }
  const createAsyncInput =
    options.createAsyncInputComposition ?? createDefaultAsyncInputComposition;
  if (typeof createAsyncInput !== 'function') {
    throw new TypeError('createAsyncInputComposition must be a function');
  }
  if (options.poseSchedule !== undefined && typeof options.poseSchedule !== 'function') {
    throw new TypeError('poseSchedule must be a function');
  }
  if (options.poseNow !== undefined && typeof options.poseNow !== 'function') {
    throw new TypeError('poseNow must be a function');
  }
  const poseFeedbackEnabled = options.poseFeedbackEnabled ?? false;
  if (typeof poseFeedbackEnabled !== 'boolean') {
    throw new TypeError('poseFeedbackEnabled must be boolean');
  }
  if (poseFeedbackEnabled && typeof options.onPoseState !== 'function') {
    throw new TypeError('onPoseState must be a function when pose feedback is enabled');
  }
  const posePreviewMirroringEnabled = options.posePreviewMirroringEnabled ?? false;
  if (typeof posePreviewMirroringEnabled !== 'boolean') {
    throw new TypeError('posePreviewMirroringEnabled must be boolean');
  }
  if (
    poseFeedbackEnabled &&
    options.readPoseStateBinding !== undefined &&
    typeof options.readPoseStateBinding !== 'function'
  ) {
    throw new TypeError('readPoseStateBinding must be a function');
  }
  const cameraPreviewControlsEnabled = options.cameraPreviewControlsEnabled ?? false;
  if (typeof cameraPreviewControlsEnabled !== 'boolean') {
    throw new TypeError('cameraPreviewControlsEnabled must be boolean');
  }
  const cameraPreviewMirroringControlEnabled =
    options.cameraPreviewMirroringControlEnabled ?? cameraPreviewControlsEnabled;
  const cameraMenuControlEnabled = options.cameraMenuControlEnabled ?? cameraPreviewControlsEnabled;
  if (typeof cameraPreviewMirroringControlEnabled !== 'boolean') {
    throw new TypeError('cameraPreviewMirroringControlEnabled must be boolean');
  }
  if (typeof cameraMenuControlEnabled !== 'boolean') {
    throw new TypeError('cameraMenuControlEnabled must be boolean');
  }
  if (posePreviewMirroringEnabled || cameraPreviewMirroringControlEnabled) {
    if (
      options.onPreviewMirroringChange !== undefined &&
      typeof options.onPreviewMirroringChange !== 'function'
    ) {
      throw new TypeError('onPreviewMirroringChange must be a function');
    }
  }

  function notifyCameraBusy(visible: boolean) {
    if (typeof options.setBusy !== 'function') return;
    try {
      void Promise.resolve(
        options.setBusy(
          Object.freeze({
            visible,
            source: 'camera',
            label: 'Starting camera',
            cursor: 'wait',
          }),
        ),
      ).catch(() => {});
    } catch {
      // Busy indicators are non-authoritative and cannot change camera selection semantics.
    }
  }

  async function withCameraBusy<T>(operation: () => Promise<T> | T) {
    notifyCameraBusy(true);
    try {
      return await operation();
    } finally {
      notifyCameraBusy(false);
    }
  }

  const created = [];
  try {
    const compositionOptions = {
      ...(verifiedRemoteEnabled
        ? {
            verifiedRemoteCache: {
              ...options.verifiedRemoteCacheOptions,
              cacheIdentity,
            },
          }
        : {}),
    };
    const assetManagerCandidate = verifiedRemoteEnabled
      ? // The package declares its nested option bags without `| undefined`, and this builds
        // them by spreading the session's own optional records, so the shapes agree on every
        // key but not on `exactOptionalPropertyTypes`.
        createAssetManager(
          undefined,
          compositionOptions as Parameters<typeof createAssetManager>[1],
        )
      : createAssetManager();
    created.push(assetManagerCandidate);
    const assetManagerBaseMethods = [
      'registerProjectAsset',
      'registerEmbeddedAsset',
      'releaseAsset',
      'releaseAll',
      'isRegistered',
      'getMimeType',
      'applyToStage',
      'applyToTarget',
      'playSound',
      'stopSound',
      'stopAllSounds',
    ] as const;
    const verifiedRemoteMethods = [
      'resolveVerifiedRemoteBinary',
      'getVerifiedRemoteCacheStats',
      'pruneVerifiedRemoteCache',
      'clearVerifiedRemoteCache',
      'listVerifiedRemoteStoryCaches',
      'pruneVerifiedRemoteStoryCaches',
      'deleteVerifiedRemoteStoryCache',
      'renewVerifiedRemoteStoryCacheLease',
      'releaseVerifiedRemoteStoryCacheLease',
    ] as const;
    // The feature flags decide what has to be present, while the type names every method the
    // session can reach; each optional group is behind the same flag at its call sites.
    const assetManagerComposition = validateCompositionMethods<
      (typeof assetManagerBaseMethods)[number] | (typeof verifiedRemoteMethods)[number],
      // Crossfade audio is used when the composition offers it and falls back when it does not.
      'createAudioVoice' | 'createAudioPlayback'
    >(assetManagerCandidate, 'Asset Manager composition', [
      ...assetManagerBaseMethods,
      ...(verifiedRemoteEnabled ? verifiedRemoteMethods : []),
    ]);
    const binaryAssetBacking = binaryEntryEnabled
      ? (() => {
          if (cacheIdentity === null) {
            throw new TypeError('cacheIdentity is required for binary-entry loading');
          }
          return createDsl4BinaryEntryBacking({
            runtimeComponent,
            provider: options.binaryEntryProvider,
            composition: Object.freeze({
              createSessionBinaryBacking: (
                input: Parameters<typeof createSessionBinaryBacking>[0],
                context: Parameters<typeof createSessionBinaryBacking>[2],
              ) =>
                createSessionBinaryBacking(
                  input,
                  {
                    ...options.sessionBinaryBackingOptions,
                    ...(options.subtleCrypto === undefined
                      ? {}
                      : {
                          // KVS only uses digest here; the DSL port intentionally exposes that
                          // smaller contract instead of the browser's full SubtleCrypto surface.
                          subtleCrypto: options.subtleCrypto as unknown as SubtleCrypto,
                        }),
                  },
                  context,
                ),
            }),
            namespace: cacheIdentity.id,
            policy: options.binarySessionBackingPolicy as 'prefer' | 'required' | 'disabled',
            sessionId: options.binarySessionId as string,
            ...(options.onBinarySessionBackingWarning === undefined
              ? {}
              : {onWarning: options.onBinarySessionBackingWarning}),
            ...(options.onBinarySessionBackingFatalError === undefined
              ? {}
              : {onFatalError: options.onBinarySessionBackingFatalError}),
          });
        })()
      : null;
    if (binaryAssetBacking) {
      created.push(Object.freeze({releaseAll: () => binaryAssetBacking.dispose()}));
    }
    const objectUrlOwner =
      options.objectUrlOwner ??
      (options.createObjectURL === undefined &&
      typeof globalThis.URL?.createObjectURL !== 'function'
        ? null
        : createDsl4ObjectUrlOwner({
            ...(options.createObjectURL === undefined
              ? {}
              : {createObjectURL: options.createObjectURL}),
            ...(options.revokeObjectURL === undefined
              ? {}
              : {revokeObjectURL: options.revokeObjectURL}),
          }));
    const storyDocument = runtimeComponent.storyDocument as Record<string, unknown>;
    const metadata = isRecord(storyDocument.metadata) ? storyDocument.metadata : {};
    const mediaAdapter = createDsl4AssetManagerAdapter({
      composition: assetManagerComposition,
      implicitProjectActors: Array.isArray(metadata.implicitProjectActors)
        ? (metadata.implicitProjectActors as string[])
        : [],
      ...(options.runtimeHost === undefined ? {} : {runtimeHost: options.runtimeHost}),
      ...(objectUrlOwner === null ? {} : {objectUrlOwner}),
    });

    const recognition = isRecord(storyDocument.recognition) ? storyDocument.recognition : {};
    const posePreview = isRecord(recognition.preview) ? recognition.preview : {};
    const poseOverlay = isRecord(posePreview.overlay) ? posePreview.overlay : null;
    const posePreviewPlacement = readDsl4PosePreviewPlacement(posePreview);
    const modelInitialization = isRecord(recognition.modelInitialization)
      ? recognition.modelInitialization
      : {};
    const modelInitializationPolicy =
      modelInitialization.policy === 'latest-needed' ? 'latest-needed' : 'legacy';
    const parallelModelInitialization =
      typeof modelInitialization.parallel === 'boolean' ? modelInitialization.parallel : false;

    const tmPlatform = createDsl4TMPlatform({
      runtime: tmPoseRuntime,
      ...(options.compute === undefined ? {} : {compute: options.compute}),
      ...(options.computeMode === undefined ? {} : {computeMode: options.computeMode}),
      modelInitializationPolicy,
      parallelModelInitialization,
      ...(options.createFile === undefined ? {} : {createFile: options.createFile}),
      ...(options.createTMComposition === undefined
        ? {}
        : {createComposition: options.createTMComposition}),
    });
    created.push(tmPlatform.composition);
    const tmBaseMethods = [
      'registerPoseModel',
      'activatePoseModel',
      'releasePoseModel',
      'releaseAll',
      'isPoseModelRegistered',
      'getActivePoseModelName',
      'showPreview',
      'hidePreview',
      'isPreviewVisible',
      'setPreviewPosition',
      'startCamera',
      'stopCamera',
      'isCameraRunning',
      'startRecognition',
      'stopRecognition',
      'isRecognizing',
      'currentPose',
      'confidence',
      'confidenceOf',
      'configureAccumulatedPose',
      'resetAccumulatedPose',
      'subscribeAccumulatedPose',
    ] as const;
    const tmMirroringMethods = ['setPreviewMirroring'] as const;
    const tmPoseOverlayMethods = [
      'showPoseOverlay',
      'hidePoseOverlay',
      'setPoseJointStyle',
      'setPoseBoneStyle',
      'setPoseOverlayMinimumConfidence',
      'setPoseOverlayConfidenceScaling',
    ] as const;
    const tmCameraMenuMethods = [
      'listCameraDevices',
      'selectCamera',
      'getCameraSelection',
      'getActiveCamera',
    ] as const;
    // As above: the flags decide what must exist, the type names everything the session can reach.
    const tmComposition = validateCompositionMethods<
      | (typeof tmBaseMethods)[number]
      | (typeof tmMirroringMethods)[number]
      | (typeof tmPoseOverlayMethods)[number]
      | (typeof tmCameraMenuMethods)[number]
    >(tmPlatform.composition, 'Teachable Machine composition', [
      ...tmBaseMethods,
      ...(posePreviewMirroringEnabled || cameraPreviewMirroringControlEnabled
        ? tmMirroringMethods
        : []),
      ...(poseOverlay ? tmPoseOverlayMethods : []),
      ...(cameraMenuControlEnabled ? tmCameraMenuMethods : []),
    ]);
    configurePoseOverlay(tmComposition, poseOverlay);
    const storyCameraLifecycle = storyUsesPoseRecognition(runtimeComponent.storyDocument)
      ? createDsl4StoryCameraLifecycle({
          composition: tmComposition,
          previewPosition: posePreviewPlacement.position,
          previewOpacity: posePreviewPlacement.opacity,
          ...(options.onCameraCleanupError === undefined
            ? {}
            : {onCleanupError: options.onCameraCleanupError}),
          ...(options.setBusy === undefined ? {} : {setBusy: options.setBusy}),
        })
      : null;
    // Two declarations disagree without disagreeing on any key: `validateCompositionMethods` keys
    // the composition by the names it checked, and the package declares its optional sources
    // without `| undefined`, which `exactOptionalPropertyTypes` reads as a mismatch.
    const asyncInputCandidate = createAsyncInput({
      poseSource: tmComposition,
      ...(options.keySource === undefined ? {} : {keySource: options.keySource}),
      ...(options.actorTouchSource === undefined
        ? {}
        : {actorTouchSource: options.actorTouchSource}),
    } as unknown as Parameters<typeof createAsyncInput>[0]);
    created.push(asyncInputCandidate);
    const asyncInputComposition = validateCompositionMethods(
      asyncInputCandidate,
      'Async Input composition',
      ['waitForPoseCandidate', 'waitForKeyCandidate', 'waitForActorTouchCandidate', 'releaseAll'],
    );
    const poseActionPort = createDsl4PoseActionPort({
      tmComposition,
      asyncInputComposition,
      getPoseModelLabels: (poseModel) => tmPlatform.adapter.getPoseModelLabels(poseModel),
      previewPosition: posePreviewPlacement.position,
      playSound: (sound, playOptions) => assetManagerComposition.playSound(sound, playOptions),
      stopSound: (sound) => assetManagerComposition.stopSound(sound),
      ...(options.poseSchedule === undefined
        ? {}
        : {
            schedule: options.poseSchedule as (
              callback: () => void,
              delayMilliseconds: number,
            ) => () => void,
          }),
      ...(options.poseNow === undefined ? {} : {now: options.poseNow as () => number}),
      ...(options.setBusy === undefined ? {} : {setBusy: options.setBusy}),
      ...(options.setCursor === undefined ? {} : {setCursor: options.setCursor}),
      ...(storyCameraLifecycle === null
        ? {}
        : {ensureCameraStarted: () => storyCameraLifecycle.start()}),
      ...(poseFeedbackEnabled ? {onPoseState: options.onPoseState} : {}),
      ...(poseFeedbackEnabled && options.readPoseStateBinding !== undefined
        ? {readPoseStateBinding: options.readPoseStateBinding}
        : {}),
    });
    const adapter = createDsl4PlatformAssetAdapter({
      mediaAdapter,
      poseAdapter: tmPlatform.adapter,
      videoAdapter:
        options.videoAssetAdapter ??
        createDsl4VideoAssetAdapter(objectUrlOwner === null ? {} : {objectUrlOwner}),
    });
    const cacheWarnings: Readonly<Record<string, unknown>>[] = [];

    async function resolveVerifiedRemoteAsset(
      payload: Readonly<VerifiedRemoteAssetPayload>,
      context: Readonly<AssetLoadContext>,
    ) {
      async function loadVerifiedRemote(
        input: Readonly<VerifiedRemoteAssetPayload>,
        loadContext: Readonly<AssetLoadContext>,
      ) {
        if (!remoteLoader) throw new TypeError('Remote loader is unavailable');
        const loaded = await remoteLoader(
          Object.freeze({assetId: payload.assetId, ...input}),
          Object.freeze({...context, signal: loadContext.signal}),
        );
        if (!isRecord(loaded)) return loaded;
        return {
          bytes: loaded.bytes,
          contentType: loaded.contentType,
          ...(loaded.transferOwnership === true ? {transferOwnership: true} : {}),
        };
      }
      // The composition is validated by name, so its result is narrowed here rather than trusted.
      const result = (await assetManagerComposition.resolveVerifiedRemoteBinary(
        {
          url: payload.url,
          integrity: payload.integrity,
          size: payload.size,
          contentType: payload.contentType,
        },
        {
          signal: context.signal,
          load: loadVerifiedRemote,
        },
      )) as Readonly<Record<string, unknown>>;
      if (Array.isArray(result.cacheWarnings)) {
        for (const warning of result.cacheWarnings) {
          if (!isRecord(warning)) continue;
          cacheWarnings.push(
            Object.freeze({
              assetId: payload.assetId,
              storyPath: `/assets/${encodeDsl4StoryPathSegment(String(payload.assetId))}`,
              operation: warning.operation,
              code: warning.code,
            }),
          );
        }
        if (cacheWarnings.length > 128) cacheWarnings.splice(0, cacheWarnings.length - 128);
      }
      return result;
    }
    const lifecycleOptions = {
      runtimeComponent,
      adapter,
      setLoading: options.setLoading,
      ...(binaryAssetBacking
        ? {
            resolveEmbeddedAssetFiles(assetId: string, context: Readonly<AssetLoadContext>) {
              const signal = optionalAbortSignal(context.signal);
              return binaryAssetBacking.getAssetFiles(
                assetId,
                signal === undefined ? {} : {signal},
              );
            },
          }
        : {}),
      ...(verifiedRemoteEnabled ? {resolveVerifiedRemoteAsset} : {}),
      ...(remoteEnabled
        ? {
            loadRemoteAsset: remoteLoader as (
              payload: Readonly<Record<string, unknown>>,
              context: Readonly<Record<string, unknown>>,
            ) => unknown | Promise<unknown>,
          }
        : {}),
      ...(poseArchiveExtractor ? {extractRemotePoseArchive: poseArchiveExtractor} : {}),
      ...(options.materializationRetention === undefined
        ? {}
        : {retention: options.materializationRetention}),
    };
    const assetLifecycle = remoteEnabled
      ? createDsl4RemoteAssetLifecycle(lifecycleOptions)
      : createDsl4EmbeddedAssetLifecycle(lifecycleOptions);

    const cleanup = createDsl4RetryableCleanup({
      message: 'DSL 4.0 platform asset session disposal failed',
      steps: [
        () => poseActionPort.dispose(),
        ...(storyCameraLifecycle
          ? [
              {
                run: () => storyCameraLifecycle.dispose(),
                isPending: () => storyCameraLifecycle.hasPendingCleanup(),
              },
            ]
          : []),
        ...(binaryAssetBacking ? [() => binaryAssetBacking.dispose()] : []),
        (reason) => assetLifecycle.release({reason}),
        () => asyncInputComposition.releaseAll(),
        () => tmComposition.releaseAll(),
        ...(verifiedRemoteEnabled
          ? [() => assetManagerComposition.releaseVerifiedRemoteStoryCacheLease()]
          : []),
        () => assetManagerComposition.releaseAll(),
      ],
    });
    const posePreviewPort = posePreviewMirroringEnabled
      ? Object.freeze({
          setPosePreviewMirroring(mode: unknown) {
            if (cleanup.requested) throw disposedError();
            if (typeof mode !== 'string' || !posePreviewMirroringModes.has(mode)) {
              throw new TypeError('pose preview mirroring mode is invalid');
            }
            tmComposition.setPreviewMirroring(mode);
            options.onPreviewMirroringChange?.(mode as 'mirrored' | 'unmirrored');
          },
        })
      : null;
    const cameraPreviewControlsPort = cameraPreviewControlsEnabled
      ? Object.freeze({
          ...(cameraPreviewMirroringControlEnabled
            ? {
                setPreviewMirroring(mode: unknown) {
                  if (cleanup.requested) throw disposedError();
                  if (typeof mode !== 'string' || !posePreviewMirroringModes.has(mode)) {
                    throw new TypeError('pose preview mirroring mode is invalid');
                  }
                  const result = tmComposition.setPreviewMirroring(mode);
                  options.onPreviewMirroringChange?.(mode as 'mirrored' | 'unmirrored');
                  return result;
                },
              }
            : {}),
          ...(cameraMenuControlEnabled
            ? {
                listCameraDevices() {
                  if (cleanup.requested) throw disposedError();
                  return withCameraBusy(() => tmComposition.listCameraDevices());
                },
                selectCamera(selection: unknown) {
                  if (cleanup.requested) throw disposedError();
                  return withCameraBusy(() => tmComposition.selectCamera(selection));
                },
                getCameraSelection() {
                  if (cleanup.requested) throw disposedError();
                  return tmComposition.getCameraSelection();
                },
                getActiveCamera() {
                  if (cleanup.requested) throw disposedError();
                  return tmComposition.getActiveCamera();
                },
              }
            : {}),
          isCameraRunning() {
            if (cleanup.requested) return false;
            return tmComposition.isCameraRunning();
          },
        })
      : null;
    const verifiedRemoteCache = verifiedRemoteEnabled
      ? Object.freeze({
          identity: cacheIdentity,
          getWarnings() {
            return Object.freeze([...cacheWarnings]);
          },
          takeWarnings() {
            const warnings = Object.freeze([...cacheWarnings]);
            cacheWarnings.length = 0;
            return warnings;
          },
          renewLease() {
            if (cleanup.requested) throw disposedError();
            return assetManagerComposition.renewVerifiedRemoteStoryCacheLease();
          },
          releaseLease() {
            if (cleanup.requested) throw disposedError();
            return assetManagerComposition.releaseVerifiedRemoteStoryCacheLease();
          },
          getStats() {
            if (cleanup.requested) throw disposedError();
            return assetManagerComposition.getVerifiedRemoteCacheStats();
          },
          prune() {
            if (cleanup.requested) throw disposedError();
            return assetManagerComposition.pruneVerifiedRemoteCache();
          },
          clear() {
            if (cleanup.requested) throw disposedError();
            return assetManagerComposition.clearVerifiedRemoteCache();
          },
          listStoryCaches() {
            if (cleanup.requested) throw disposedError();
            return assetManagerComposition.listVerifiedRemoteStoryCaches();
          },
          pruneStoryCaches() {
            if (cleanup.requested) throw disposedError();
            return assetManagerComposition.pruneVerifiedRemoteStoryCaches();
          },
          deleteStoryCache(databaseName: string) {
            if (cleanup.requested) throw disposedError();
            return assetManagerComposition.deleteVerifiedRemoteStoryCache(databaseName);
          },
        })
      : null;
    const lifecycle = Object.freeze({
      prepare(
        payload: Readonly<Record<string, unknown>>,
        context: Readonly<Record<string, unknown>>,
      ) {
        if (cleanup.requested) throw disposedError();
        return assetLifecycle.prepare(payload, context);
      },
      setLoading(
        payload: Readonly<Record<string, unknown>>,
        context: Readonly<Record<string, unknown>>,
      ) {
        if (cleanup.requested) throw disposedError();
        return assetLifecycle.setLoading(payload, context);
      },
      releaseAssets(payload: Readonly<Record<string, unknown>>) {
        if (cleanup.requested) return cleanup.completion!;
        return assetLifecycle.releaseAssets(payload);
      },
      release(payload: Readonly<Record<string, unknown>>) {
        if (cleanup.requested) return cleanup.completion!;
        return assetLifecycle.release(payload);
      },
    });

    function dispose(reason: string = 'dispose') {
      return cleanup.run(reason);
    }

    return Object.freeze({
      lifecycle,
      assetManagerComposition,
      tmComposition,
      asyncInputComposition,
      poseActionPort,
      storyCameraLifecycle,
      posePreviewPort,
      cameraPreviewControlsPort,
      getAssetResource(assetId: unknown) {
        if (cleanup.requested) throw disposedError();
        return assetLifecycle.getResource(assetId);
      },
      /** Release retained idle handles and retry failed releases of unowned handles. */
      pruneMaterializations() {
        if (cleanup.requested) return cleanup.completion!;
        return assetLifecycle.prune();
      },
      getMaterializationStats() {
        return assetLifecycle.stats();
      },
      binaryAssetBacking,
      verifiedRemoteCache,
      hasPendingCleanup: cleanup.hasPendingCleanup,
      dispose,
    });
  } catch (error) {
    failCreation(created, error);
  }
}
