import assert from 'node:assert/strict';
import {creationCleanup} from './helpers/creation-cleanup.ts';
import {createHash, webcrypto} from 'node:crypto';
import {test} from 'vitest';
import {deferred, withDeadline} from './helpers/async-test-helpers.ts';

import {createVerifiedRemoteBinaryCache} from '@kubohiroya/turbowarp-asset-cache/composition';
import {IDBFactory} from 'fake-indexeddb';
import {strToU8, zipSync} from 'fflate';

import {createDsl4PlatformAssetSession} from '../src/dsl4/platform/index.js';
import {thrown} from './helpers/thrown-error.ts';
import {requireArray, requireDefined, requireRecord} from './helpers/require-value.ts';

type SessionOptions = Parameters<typeof createDsl4PlatformAssetSession>[0];

type AsyncInputCompositionFactory = NonNullable<SessionOptions['createAsyncInputComposition']>;
type AssetManagerCompositionFactory = NonNullable<SessionOptions['createAssetManagerComposition']>;
type TMCompositionFactory = NonNullable<SessionOptions['createTMComposition']>;

/**
 * Read one media composition double as the factory the session declares.
 *
 * `AssetManagerComposition` publishes a DOM image surface and a verified-remote cache surface on
 * top of what a story lifecycle calls; these doubles carry the members the session reaches for, and
 * a case asserts on the calls it logged rather than on the rest of the interface.
 */
function assetManagerCompositionFactory(
  factory: (...args: unknown[]) => Record<string, unknown>,
): AssetManagerCompositionFactory {
  return factory as unknown as AssetManagerCompositionFactory;
}

type VerifiedRemoteCacheOptions = Parameters<typeof createVerifiedRemoteBinaryCache>[0];

/** The verified-remote cache options the session composed for its media composition. */
function verifiedRemoteCacheOptions(
  compositionOptions: Record<string, unknown>,
): VerifiedRemoteCacheOptions {
  return compositionOptions.verifiedRemoteCache as VerifiedRemoteCacheOptions;
}

/** Read one Teachable Machine composition double as the factory the session declares. */
function tmCompositionFactory(
  factory: (options: {runtime: unknown}) => Record<string, unknown>,
): TMCompositionFactory {
  return factory as unknown as TMCompositionFactory;
}

/**
 * Read one Async Input composition double as the factory the session declares.
 *
 * The published composition carries more than the four members this case drives, and the case
 * asserts on the options the session passed rather than on what the composition returns.
 */
function asyncInputCompositionFactory(
  factory: (options: Readonly<Record<string, unknown>>) => Record<string, unknown>,
): AsyncInputCompositionFactory {
  return factory as unknown as AsyncInputCompositionFactory;
}

/** The `[event, ...details]` rows the composition doubles record. */
type LogEntry = [string, ...unknown[]];

/** One asset of the bundle manifest a case hands the session. */
interface ManifestAsset {
  id: string;
  kind: string;
  loading: string;
  source: Record<string, unknown>;
}

/**
 * The runtime component a case hands the session.
 *
 * The session reads its component opaquely, so this names what the doubles publish -- and keeps the
 * story document open, since several cases plant a `recognition` block in it.
 */
interface ComponentDouble {
  storyDocument: Record<string, unknown>;
  assetBundle: {manifest: {assets: ManifestAsset[]}};
  getAssetFile(assetId: string, filePath: string): Uint8Array;
}

/**
 * Pass session options the declaration refuses on purpose.
 *
 * Several cases assert that the session rejects a missing observer, a non-function binding reader,
 * and compositions without the members a feature needs -- all of which its own types already forbid.
 */
function invalidSessionOptions(options: Record<string, unknown>): SessionOptions {
  return options as unknown as SessionOptions;
}

function fileBytes(files: ReadonlyMap<string, Uint8Array>, key: string): Uint8Array {
  return requireDefined(files.get(key), `the embedded bytes of ${key}`);
}

const cacheIdentity = Object.freeze({
  id: 'story001',
  label: 'story.kamishibai.yaml',
  databaseName: 'tw-kamishibai-assets-v1--story--story001',
});

function runtimeComponent(): ComponentDouble {
  const files = new Map([
    ['RescuePose\0metadata.json', new TextEncoder().encode('{"labels":["rescue"]}')],
    ['RescuePose\0model.json', new TextEncoder().encode('{"model":true}')],
    ['RescuePose\0weights.bin', new Uint8Array([1, 2, 3])],
    ['ControlIcon\0ui/control.svg', new TextEncoder().encode('<svg/>')],
  ]);
  return {
    storyDocument: {kind: 'StoryDocument', version: '4.0'},
    assetBundle: {
      manifest: {
        assets: [
          {
            id: 'Beach',
            kind: 'backdrop',
            loading: 'eager',
            source: {type: 'project', name: 'Beach'},
          },
          {
            id: 'ControlIcon',
            kind: 'image',
            loading: 'eager',
            source: {
              type: 'file',
              files: [
                {
                  path: 'ui/control.svg',
                  size: fileBytes(files, 'ControlIcon\0ui/control.svg').length,
                },
              ],
            },
          },
          {
            id: 'RescuePose',
            kind: 'recognitionModel',
            loading: 'eager',
            source: {
              type: 'file',
              files: [
                {path: 'metadata.json', size: fileBytes(files, 'RescuePose\0metadata.json').length},
                {path: 'model.json', size: fileBytes(files, 'RescuePose\0model.json').length},
                {path: 'weights.bin', size: fileBytes(files, 'RescuePose\0weights.bin').length},
              ],
            },
          },
        ],
      },
    },
    getAssetFile(assetId: string, filePath: string) {
      return new Uint8Array(fileBytes(files, `${assetId}\0${filePath}`));
    },
  };
}

function remoteRuntimeComponent(remoteBytes: Uint8Array): ComponentDouble {
  return {
    storyDocument: {kind: 'StoryDocument', version: '4.0'},
    assetBundle: {
      manifest: {
        assets: [
          {
            id: 'RemoteBeach',
            kind: 'backdrop',
            loading: 'lazy',
            source: {
              type: 'remote',
              url: 'https://cdn.example.com/beach.svg',
              integrity: `sha256-${createHash('sha256').update(remoteBytes).digest('hex')}`,
              contentType: 'image/svg+xml',
              size: remoteBytes.byteLength,
            },
          },
        ],
      },
    },
    getAssetFile() {
      assert.fail('remote platform session must not read embedded bytes');
    },
  };
}

function remotePoseRuntimeComponent(remoteBytes: Uint8Array): ComponentDouble {
  return {
    storyDocument: {kind: 'StoryDocument', version: '4.0'},
    assetBundle: {
      manifest: {
        assets: [
          {
            id: 'RemotePose',
            kind: 'recognitionModel',
            loading: 'lazy',
            source: {
              type: 'remote',
              url: 'https://cdn.example.com/pose.zip',
              integrity: `sha256-${createHash('sha256').update(remoteBytes).digest('hex')}`,
              contentType: 'application/zip',
              size: remoteBytes.byteLength,
            },
          },
        ],
      },
    },
    getAssetFile() {
      assert.fail('remote pose model must not read embedded bytes');
    },
  };
}

function unverifiedRemotePoseRuntimeComponent(url: string): ComponentDouble {
  const component = remotePoseRuntimeComponent(new Uint8Array([1]));
  requireDefined(component.assetBundle.manifest.assets[0], 'the pose asset').source = {
    type: 'remote',
    url,
  };
  return component;
}

function poseArchiveLimits() {
  return {
    maxArchiveBytes: 64 * 1024,
    maxEntries: 3,
    maxCompressedEntryBytes: 32 * 1024,
    maxExpandedEntryBytes: 32 * 1024,
    maxTotalExpandedBytes: 64 * 1024,
    maxCompressionRatio: 100,
  };
}

function factories(
  log: LogEntry[],
  overrides: {assetManager?: Record<string, unknown>; tm?: Record<string, unknown>} = {},
) {
  const assetManagerCreateArguments: unknown[][] = [];
  const tmCreateArguments: unknown[] = [];
  const assetManagerComposition = {
    async registerProjectAsset(input: {name: string}) {
      log.push(['media.register-project', input.name]);
      return {name: input.name, mimeType: 'image/svg+xml'};
    },
    async registerEmbeddedAsset(input: {name: string}) {
      log.push(['media.register-embedded', input.name]);
      return {name: input.name, mimeType: 'image/svg+xml'};
    },
    releaseAsset(name: string) {
      log.push(['media.release', name]);
    },
    releaseAll() {
      log.push(['media.release-all']);
    },
    isRegistered() {
      return true;
    },
    getMimeType() {
      return 'image/svg+xml';
    },
    async applyToStage() {},
    async applyToTarget() {},
    async playSound() {},
    stopSound() {},
    stopAllSounds() {},
    async resolveVerifiedRemoteBinary(
      input: {integrity: unknown},
      resolveOptions: {
        load(
          input: unknown,
          options: {signal: AbortSignal},
        ): Promise<{
          bytes: Uint8Array | ArrayBuffer;
          contentType: unknown;
        }>;
        signal: AbortSignal;
      },
    ) {
      const loaded = await resolveOptions.load(input, {signal: resolveOptions.signal});
      return {
        bytes: loaded.bytes instanceof Uint8Array ? loaded.bytes : new Uint8Array(loaded.bytes),
        contentType: String(loaded.contentType).split(';', 1)[0],
        integrity: input.integrity,
        source: 'network',
        cacheRead: 'miss',
        cacheWrite: 'stored',
        cacheWarnings: [],
      };
    },
    async getVerifiedRemoteCacheStats() {},
    async pruneVerifiedRemoteCache() {},
    async clearVerifiedRemoteCache() {},
    async listVerifiedRemoteStoryCaches() {
      return [];
    },
    async pruneVerifiedRemoteStoryCaches() {},
    async deleteVerifiedRemoteStoryCache() {},
    async renewVerifiedRemoteStoryCacheLease() {},
    async releaseVerifiedRemoteStoryCacheLease() {
      log.push(['cache.release-lease']);
    },
    ...overrides.assetManager,
  };
  const tmComposition = {
    async registerPoseModel(input: {name: string}) {
      log.push(['pose.register', input.name]);
      return {name: input.name, labels: ['idle', 'rescue']};
    },
    async releasePoseModel(name: string) {
      log.push(['pose.release', name]);
    },
    async releaseAll() {
      log.push(['pose.release-all']);
    },
    activatePoseModel() {},
    isPoseModelRegistered() {
      return true;
    },
    getActivePoseModelName() {
      return null;
    },
    showPreview() {},
    hidePreview() {},
    isPreviewVisible() {
      return false;
    },
    setPreviewPosition() {},
    async startCamera() {},
    stopCamera() {},
    isCameraRunning() {
      return false;
    },
    async startRecognition() {},
    stopRecognition() {},
    isRecognizing() {
      return false;
    },
    currentPose() {
      return '';
    },
    confidence() {
      return 0;
    },
    confidenceOf() {
      return 0;
    },
    configureAccumulatedPose() {},
    resetAccumulatedPose() {},
    subscribeAccumulatedPose() {
      return () => {};
    },
    ...overrides.tm,
  };
  return {
    assetManagerComposition,
    assetManagerCreateArguments,
    tmCreateArguments,
    tmComposition,
    createAssetManagerComposition: assetManagerCompositionFactory((...args) => {
      assetManagerCreateArguments.push(args);
      log.push(['media.create']);
      return assetManagerComposition;
    }),
    createTMComposition: tmCompositionFactory((options) => {
      tmCreateArguments.push(options);
      log.push(['pose.create', options.runtime]);
      return tmComposition;
    }),
  };
}

function options(
  component: ComponentDouble,
  log: LogEntry[],
  overrides: {assetManager?: Record<string, unknown>; tm?: Record<string, unknown>} = {},
) {
  const created = factories(log, overrides);
  const tmPoseRuntime = {Webcam: class {}, async loadFromFiles() {}};
  return {
    created,
    tmPoseRuntime,
    value: {
      runtimeComponent: component,
      tmPoseRuntime,
      setLoading(payload: Readonly<Record<string, unknown>>) {
        log.push(['loading', payload.visible]);
      },
      createAssetManagerComposition: created.createAssetManagerComposition,
      createTMComposition: created.createTMComposition,
    },
  };
}

function context() {
  return {signal: new AbortController().signal, generation: 1, sceneId: 'opening'};
}

test('creates one shared composition pair and routes a complete lifecycle through it', async () => {
  const log: LogEntry[] = [];
  const setup = options(runtimeComponent(), log);
  const session = createDsl4PlatformAssetSession(setup.value);

  assert.strictEqual(session.assetManagerComposition, setup.created.assetManagerComposition);
  assert.strictEqual(session.tmComposition, setup.created.tmComposition);
  assert.equal(typeof session.asyncInputComposition.waitForPoseCandidate, 'function');
  assert.equal(typeof session.asyncInputComposition.waitForKeyCandidate, 'function');
  assert.equal(typeof session.asyncInputComposition.waitForActorTouchCandidate, 'function');
  assert.equal(typeof session.poseActionPort.waitForPose, 'function');
  assert.equal(typeof session.poseActionPort.poseInputToChangeScene, 'function');
  assert.equal(session.posePreviewPort, null);
  assert.equal(Object.isFrozen(session), true);
  assert.equal(Object.isFrozen(session.lifecycle), true);
  await session.lifecycle.prepare({assetIds: ['RescuePose', 'Beach']}, context());
  await session.lifecycle.setLoading({visible: true}, context());

  assert.deepEqual(log.slice(0, 5), [
    ['media.create'],
    ['pose.create', setup.tmPoseRuntime],
    ['media.register-project', 'Beach'],
    ['pose.register', 'RescuePose'],
    ['loading', true],
  ]);
  const firstDispose = session.dispose('app-shell-dispose');
  const secondDispose = session.dispose('ignored-second-reason');
  assert.strictEqual(secondDispose, firstDispose);
  await firstDispose;
  assert.deepEqual(log.slice(5), [
    ['pose.release', 'RescuePose'],
    ['media.release', 'Beach'],
    ['pose.release-all'],
    ['media.release-all'],
  ]);
  await assert.rejects(
    async () => session.lifecycle.prepare({assetIds: ['Beach']}, context()),
    (error) => thrown(error).code === 'K4-PLATFORM-ASSET-SESSION-001',
  );
});

test('maps the DSL pose model initialization policy into TM composition options', async () => {
  const component = runtimeComponent();
  component.storyDocument.recognition = {
    modelInitialization: {policy: 'latest-needed', parallel: true},
  };
  const log: LogEntry[] = [];
  const setup = options(component, log);
  const session = createDsl4PlatformAssetSession(setup.value);

  assert.deepEqual(setup.created.tmCreateArguments, [
    {
      runtime: setup.tmPoseRuntime,
      modelInitializationPolicy: 'latest-needed',
      parallelModelInitialization: true,
    },
  ]);

  await session.dispose('model-initialization-options-checked');
});

test('passes pose, key, and actor touch sources into one Async Input composition', async () => {
  const log: LogEntry[] = [];
  const setup = options(runtimeComponent(), log);
  const keySource = Object.freeze({kind: 'key-source'});
  const actorTouchSource = Object.freeze({kind: 'actor-touch-source'});
  let receivedOptions: Readonly<Record<string, unknown>> | undefined;
  let releaseCalls = 0;
  const session = createDsl4PlatformAssetSession({
    ...setup.value,
    keySource,
    actorTouchSource,
    createAsyncInputComposition: asyncInputCompositionFactory((input) => {
      receivedOptions = input;
      return {
        waitForPoseCandidate() {},
        waitForKeyCandidate() {},
        waitForActorTouchCandidate() {},
        releaseAll() {
          releaseCalls += 1;
        },
      };
    }),
  });

  assert.strictEqual(
    requireDefined(receivedOptions, 'the async input options').poseSource,
    setup.created.tmComposition,
  );
  assert.strictEqual(
    requireDefined(receivedOptions, 'the async input options').keySource,
    keySource,
  );
  assert.strictEqual(
    requireDefined(receivedOptions, 'the async input options').actorTouchSource,
    actorTouchSource,
  );
  await session.dispose('source-forwarding-complete');
  assert.equal(releaseCalls, 1);
});

test('keeps pose feedback observer behind an explicit default-off session gate', async () => {
  const disabledLog: LogEntry[] = [];
  const disabledSetup = options(runtimeComponent(), disabledLog);
  Object.defineProperty(disabledSetup.value, 'onPoseState', {
    get() {
      assert.fail('disabled pose feedback must not inspect its observer');
    },
  });
  Object.defineProperty(disabledSetup.value, 'readPoseStateBinding', {
    get() {
      assert.fail('disabled pose feedback must not inspect its binding reader');
    },
  });
  const disabled = createDsl4PlatformAssetSession(disabledSetup.value);
  await disabled.dispose('feedback-disabled');

  const invalidLog: LogEntry[] = [];
  const invalidSetup = options(runtimeComponent(), invalidLog);
  assert.throws(
    () =>
      createDsl4PlatformAssetSession(
        invalidSessionOptions({...invalidSetup.value, poseFeedbackEnabled: true}),
      ),
    /onPoseState/u,
  );
  assert.deepEqual(invalidLog, []);
  assert.throws(
    () =>
      createDsl4PlatformAssetSession(
        invalidSessionOptions({
          ...invalidSetup.value,
          poseFeedbackEnabled: true,
          onPoseState() {},
          readPoseStateBinding: true,
        }),
      ),
    /readPoseStateBinding/u,
  );
  assert.deepEqual(invalidLog, []);

  const enabledLog: LogEntry[] = [];
  const enabledSetup = options(runtimeComponent(), enabledLog);
  const enabled = createDsl4PlatformAssetSession({
    ...enabledSetup.value,
    poseFeedbackEnabled: true,
    onPoseState() {},
    readPoseStateBinding() {
      return null;
    },
  });
  await enabled.dispose('feedback-enabled');
});

test('gates pose preview mirroring and uses one composition method before or during camera use', async () => {
  const disabledLog: LogEntry[] = [];
  const disabledSetup = options(runtimeComponent(), disabledLog);
  Object.defineProperty(disabledSetup.created.tmComposition, 'setPreviewMirroring', {
    get() {
      assert.fail('disabled pose preview mirroring must not inspect the TM method');
    },
  });
  const disabled = createDsl4PlatformAssetSession(disabledSetup.value);
  assert.equal(disabled.posePreviewPort, null);
  await disabled.dispose('pose-preview-disabled');

  const missingSetup = options(runtimeComponent(), []);
  assert.throws(
    () =>
      createDsl4PlatformAssetSession({
        ...missingSetup.value,
        posePreviewMirroringEnabled: true,
      }),
    /setPreviewMirroring/u,
  );

  let cameraRunning = false;
  const enabledLog: LogEntry[] = [];
  const enabledSetup = options(runtimeComponent(), enabledLog, {
    tm: {
      startCamera() {
        cameraRunning = true;
      },
      isCameraRunning() {
        return cameraRunning;
      },
      setPreviewMirroring(mode: unknown) {
        enabledLog.push(['pose.preview-mirroring', mode, cameraRunning]);
      },
    },
  });
  const enabled = createDsl4PlatformAssetSession({
    ...enabledSetup.value,
    posePreviewMirroringEnabled: true,
  });
  requireDefined(enabled.posePreviewPort, 'the pose preview port').setPosePreviewMirroring(
    'mirrored',
  );
  await enabled.tmComposition.startCamera();
  requireDefined(enabled.posePreviewPort, 'the pose preview port').setPosePreviewMirroring(
    'unmirrored',
  );
  assert.deepEqual(
    enabledLog.filter(([event]) => event === 'pose.preview-mirroring'),
    [
      ['pose.preview-mirroring', 'mirrored', false],
      ['pose.preview-mirroring', 'unmirrored', true],
    ],
  );
  assert.throws(
    () =>
      requireDefined(enabled.posePreviewPort, 'the pose preview port').setPosePreviewMirroring(
        'reversed',
      ),
    /invalid/u,
  );
  await enabled.dispose('pose-preview-enabled');
  assert.throws(
    () =>
      requireDefined(enabled.posePreviewPort, 'the pose preview port').setPosePreviewMirroring(
        'mirrored',
      ),
    (error) => thrown(error).code === 'K4-PLATFORM-ASSET-SESSION-001',
  );
});

test('keeps the pose overlay source opt-in and maps normalized DSL settings to TM 2.0 APIs', async () => {
  const component = runtimeComponent();
  component.storyDocument.recognition = {
    preview: {
      mirroring: 'mirrored',
      overlay: {
        visible: true,
        minimumConfidence: 0.25,
        jointStyles: {
          leftWrist: {color: '#ff00aa', opacity: 0.8, radius: 6},
          rightWrist: {color: '#00e5ff', opacity: 1, radius: 7},
        },
        boneStyle: {color: '#00e5ff', opacity: 0.9, width: 4},
        confidenceScaling: {
          jointOpacity: true,
          jointRadius: false,
          boneOpacity: false,
          boneWidth: true,
        },
      },
    },
  };

  const missingSetup = options(component, []);
  assert.throws(
    () => createDsl4PlatformAssetSession(missingSetup.value),
    /showPoseOverlay|setPoseJointStyle/u,
  );

  const enabledLog: LogEntry[] = [];
  const enabledSetup = options(component, enabledLog, {
    tm: {
      showPoseOverlay() {
        enabledLog.push(['overlay.show']);
      },
      hidePoseOverlay() {
        enabledLog.push(['overlay.hide']);
      },
      setPoseJointStyle(part: unknown, style: unknown) {
        enabledLog.push(['overlay.joint', part, style]);
      },
      setPoseBoneStyle(style: unknown) {
        enabledLog.push(['overlay.bone', style]);
      },
      setPoseOverlayMinimumConfidence(confidence: unknown) {
        enabledLog.push(['overlay.minimum-confidence', confidence]);
      },
      setPoseOverlayConfidenceScaling(scaling: unknown) {
        enabledLog.push(['overlay.confidence-scaling', scaling]);
      },
    },
  });
  const enabled = createDsl4PlatformAssetSession(enabledSetup.value);
  assert.deepEqual(
    enabledLog.filter(([event]) => event.startsWith('overlay.')),
    [
      ['overlay.joint', 'leftWrist', {color: '#ff00aa', opacity: 0.8, radius: 6}],
      ['overlay.joint', 'rightWrist', {color: '#00e5ff', opacity: 1, radius: 7}],
      ['overlay.bone', {color: '#00e5ff', opacity: 0.9, width: 4}],
      ['overlay.minimum-confidence', 0.25],
      [
        'overlay.confidence-scaling',
        {jointOpacity: true, jointRadius: false, boneOpacity: false, boneWidth: true},
      ],
      ['overlay.show'],
    ],
  );
  await enabled.dispose('pose-overlay-enabled');

  const noConfigLog: LogEntry[] = [];
  const noConfigSetup = options(runtimeComponent(), noConfigLog, {
    tm: {
      hidePoseOverlay() {
        noConfigLog.push(['overlay.hide']);
      },
    },
  });
  const noConfig = createDsl4PlatformAssetSession(noConfigSetup.value);
  assert.deepEqual(
    noConfigLog.filter(([event]) => event.startsWith('overlay.')),
    [['overlay.hide']],
  );
  await noConfig.dispose('pose-overlay-not-configured');
});

test('gates camera preview control methods and exposes leased image URLs only while enabled', async () => {
  const disabledSetup = options(runtimeComponent(), []);
  for (const method of [
    'setPreviewMirroring',
    'listCameraDevices',
    'selectCamera',
    'getCameraSelection',
    'getActiveCamera',
  ]) {
    Object.defineProperty(disabledSetup.created.tmComposition, method, {
      get() {
        assert.fail(`disabled camera preview controls must not inspect ${method}`);
      },
    });
  }
  const disabled = createDsl4PlatformAssetSession(disabledSetup.value);
  assert.equal(disabled.cameraPreviewControlsPort, null);
  await disabled.dispose('camera-preview-controls-disabled');

  const missingSetup = options(runtimeComponent(), []);
  assert.throws(
    () =>
      createDsl4PlatformAssetSession({
        ...missingSetup.value,
        cameraPreviewControlsEnabled: true,
      }),
    /setPreviewMirroring|listCameraDevices/u,
  );

  const mirroringOnlySetup = options(runtimeComponent(), [], {
    tm: {setPreviewMirroring() {}},
  });
  const mirroringOnly = createDsl4PlatformAssetSession({
    ...mirroringOnlySetup.value,
    cameraPreviewControlsEnabled: true,
    cameraPreviewMirroringControlEnabled: true,
    cameraMenuControlEnabled: false,
  });
  const mirroringPort = requireDefined(
    mirroringOnly.cameraPreviewControlsPort,
    'the camera preview controls port',
  );
  assert.equal(typeof mirroringPort.setPreviewMirroring, 'function');
  assert.equal('listCameraDevices' in mirroringPort, false);
  await mirroringOnly.dispose('mirroring-only');

  const log: LogEntry[] = [];
  const busy: Readonly<{visible: boolean; source: string; label: string}>[] = [];
  let selection: unknown = 'default';
  const revoked: string[] = [];
  const enabledSetup = options(runtimeComponent(), log, {
    tm: {
      setPreviewMirroring(mode: unknown) {
        log.push(['control.mirroring', mode]);
      },
      async listCameraDevices() {
        return [{deviceId: 'opaque', label: 'External'}];
      },
      async selectCamera(next: unknown) {
        selection = next;
      },
      getCameraSelection() {
        return selection;
      },
      getActiveCamera() {
        return null;
      },
    },
  });
  const enabled = createDsl4PlatformAssetSession({
    ...enabledSetup.value,
    setBusy(event: Readonly<{visible: boolean; source: string; label: string}>) {
      busy.push(event);
    },
    cameraPreviewControlsEnabled: true,
    createObjectURL: () => 'blob:control-icon',
    revokeObjectURL: (url: string) => revoked.push(url),
  });
  await enabled.lifecycle.prepare({assetIds: ['ControlIcon']}, context());
  assert.deepEqual(enabled.getAssetResource('ControlIcon'), {
    adapter: 'asset-manager',
    assetId: 'ControlIcon',
    kind: 'image',
    name: 'ControlIcon',
    mimeType: 'image/svg+xml',
    objectUrl: 'blob:control-icon',
  });
  const controlsPort = requireDefined(
    enabled.cameraPreviewControlsPort,
    'the camera preview controls port',
  );
  await requireDefined(controlsPort.setPreviewMirroring, 'its mirroring control')('unmirrored');
  assert.deepEqual(await requireDefined(controlsPort.listCameraDevices, 'its device listing')(), [
    {deviceId: 'opaque', label: 'External'},
  ]);
  await requireDefined(controlsPort.selectCamera, 'its camera selection')({deviceId: 'opaque'});
  assert.deepEqual(requireDefined(controlsPort.getCameraSelection, 'its selection reader')(), {
    deviceId: 'opaque',
  });
  assert.deepEqual(
    busy.map(({visible, source}) => ({visible, source})),
    [
      {visible: true, source: 'camera'},
      {visible: false, source: 'camera'},
      {visible: true, source: 'camera'},
      {visible: false, source: 'camera'},
    ],
  );
  await enabled.dispose('camera-preview-controls-enabled');
  assert.deepEqual(revoked, ['blob:control-icon']);
});

test('keeps compositions, resources, and final disposal isolated between sessions', async () => {
  const firstLog: LogEntry[] = [];
  const secondLog: LogEntry[] = [];
  const first = createDsl4PlatformAssetSession(options(runtimeComponent(), firstLog).value);
  const second = createDsl4PlatformAssetSession(options(runtimeComponent(), secondLog).value);
  await first.lifecycle.prepare({assetIds: ['Beach']}, context());
  await second.lifecycle.prepare({assetIds: ['Beach']}, context());

  await first.dispose();
  assert.deepEqual(firstLog.slice(-2), [['pose.release-all'], ['media.release-all']]);
  assert.deepEqual(secondLog.slice(-1), [['media.register-project', 'Beach']]);
  await second.lifecycle.prepare({assetIds: ['Beach']}, context());
  await second.dispose();
  assert.deepEqual(secondLog.slice(-3), [
    ['media.release', 'Beach'],
    ['pose.release-all'],
    ['media.release-all'],
  ]);
});

test('enables verified remote loading only when the app shell injects a loader', async () => {
  const remoteBytes = new TextEncoder().encode('<svg id="remote-beach"/>');
  const component = remoteRuntimeComponent(remoteBytes);
  const disabledLog: LogEntry[] = [];
  const disabled = createDsl4PlatformAssetSession(options(component, disabledLog).value);
  await assert.rejects(
    disabled.lifecycle.prepare({assetIds: ['RemoteBeach']}, context()),
    (error) => thrown(error).code === 'K4-ASSET-REMOTE-DISABLED',
  );
  await disabled.dispose('disabled-cleanup');

  const enabledLog: LogEntry[] = [];
  const setup = options(component, enabledLog);
  const loads: {payload: Readonly<Record<string, unknown>>; signal: unknown}[] = [];
  const enabled = createDsl4PlatformAssetSession({
    ...setup.value,
    cacheIdentity,
    async loadRemoteAsset(payload, loadContext) {
      loads.push({payload, signal: loadContext.signal});
      return {bytes: remoteBytes, contentType: 'image/svg+xml'};
    },
  });
  await enabled.lifecycle.prepare({assetIds: ['RemoteBeach']}, context());
  assert.equal(loads.length, 1);
  assert.equal(
    requireDefined(loads[0], 'the first remote load').payload.url,
    'https://cdn.example.com/beach.svg',
  );
  assert.deepEqual(setup.created.assetManagerCreateArguments, [
    [undefined, {verifiedRemoteCache: {cacheIdentity}}],
  ]);
  assert.deepEqual(
    requireDefined(enabled.verifiedRemoteCache, 'the verified remote cache').identity,
    cacheIdentity,
  );
  assert.deepEqual(
    requireDefined(enabled.verifiedRemoteCache, 'the verified remote cache').getWarnings(),
    [],
  );
  assert.ok(
    enabledLog.some(([event, id]) => event === 'media.register-embedded' && id === 'RemoteBeach'),
  );
  await enabled.dispose('remote-cleanup');
  assert.ok(enabledLog.some(([event, id]) => event === 'media.release' && id === 'RemoteBeach'));
  assert.ok(enabledLog.some(([event]) => event === 'cache.release-lease'));
});

test('uses the story-scoped IndexedDB cache before calling the host loader', async () => {
  const remoteBytes = new TextEncoder().encode('<svg id="cached-beach"/>');
  const component = remoteRuntimeComponent(remoteBytes);
  const indexedDB = new IDBFactory();
  const log: LogEntry[] = [];
  let networkLoads = 0;

  function createSession(loader: SessionOptions['loadRemoteAsset']) {
    const setup = options(component, log);
    return createDsl4PlatformAssetSession({
      ...setup.value,
      cacheIdentity,
      ...(loader === undefined ? {} : {loadRemoteAsset: loader}),
      verifiedRemoteCacheOptions: {
        indexedDB,
        subtleCrypto: webcrypto.subtle,
        estimateStorage: async () => ({quota: 64 * 1024 * 1024, usage: 0}),
      },
      createAssetManagerComposition: assetManagerCompositionFactory((_featureFlags, options) => {
        log.push(['media.create']);
        const cache = createVerifiedRemoteBinaryCache(
          verifiedRemoteCacheOptions(requireRecord(options, 'the composition options')),
        );
        return Object.freeze({
          ...setup.created.assetManagerComposition,
          resolveVerifiedRemoteBinary: (
            input: Parameters<typeof cache.resolve>[0],
            resolveOptions: Parameters<typeof cache.resolve>[1],
          ) => cache.resolve(input, resolveOptions),
          getVerifiedRemoteCacheStats: () => cache.getStats(),
          pruneVerifiedRemoteCache: () => cache.prune(),
          clearVerifiedRemoteCache: () => cache.clear(),
          listVerifiedRemoteStoryCaches: () => cache.listStoryCaches(),
          pruneVerifiedRemoteStoryCaches: () => cache.pruneStoryCaches(),
          deleteVerifiedRemoteStoryCache: (
            databaseName: Parameters<typeof cache.deleteStoryCache>[0],
          ) => cache.deleteStoryCache(databaseName),
          renewVerifiedRemoteStoryCacheLease: () => cache.renewStoryCacheLease(),
          releaseVerifiedRemoteStoryCacheLease: () => cache.releaseStoryCacheLease(),
        });
      }),
    });
  }

  const first = createSession(async () => {
    networkLoads += 1;
    return {bytes: Uint8Array.from(remoteBytes), contentType: 'image/svg+xml'};
  });
  await first.lifecycle.prepare({assetIds: ['RemoteBeach']}, context());
  assert.equal(networkLoads, 1);
  const firstStats = requireRecord(
    await requireDefined(first.verifiedRemoteCache, 'the verified remote cache').getStats(),
    'the cache statistics',
  );
  assert.equal(firstStats.entries, 1);
  await first.dispose('first-session-complete');

  const second = createSession(async () => {
    networkLoads += 1;
    throw new Error('offline loader must not run for a valid cache hit');
  });
  await second.lifecycle.prepare({assetIds: ['RemoteBeach']}, context());
  assert.equal(networkLoads, 1);
  assert.deepEqual(
    requireDefined(second.verifiedRemoteCache, 'the verified remote cache').getWarnings(),
    [],
  );
  await second.dispose('second-session-complete');
});

test('extracts a verified remote pose archive inside the platform boundary', async () => {
  const remoteBytes = zipSync({
    'metadata.json': strToU8('{"labels":["rescue"]}'),
    'model.json': strToU8('{"model":true}'),
    'weights.bin': Uint8Array.from([1, 2, 3]),
  });
  const component = remotePoseRuntimeComponent(remoteBytes);
  const log: LogEntry[] = [];
  let registration: {name: string; files: {path: string}[]} | undefined;
  const setup = options(component, log, {
    tm: {
      async registerPoseModel(input: {name: string; files: {path: string}[]}) {
        registration = input;
        log.push(['pose.register', input.name]);
        return {name: input.name, labels: ['rescue']};
      },
    },
  });
  const session = createDsl4PlatformAssetSession({
    ...setup.value,
    cacheIdentity,
    poseArchiveLimits: poseArchiveLimits(),
    subtleCrypto: webcrypto.subtle,
    async loadRemoteAsset() {
      return {bytes: remoteBytes, contentType: 'application/zip'};
    },
  });

  await session.lifecycle.prepare({assetIds: ['RemotePose']}, context());
  const registered = requireDefined(registration, 'the registered pose model');
  assert.equal(registered.name, 'RemotePose');
  assert.deepEqual(
    registered.files.map((file) => file.path),
    ['metadata.json', 'model.json', 'weights.bin'],
  );
  await session.dispose('remote-pose-complete');
  assert.ok(log.some(([event, name]) => event === 'pose.release' && name === 'RemotePose'));
});

test('extracts an unpinned zip URL with the platform finite defaults', async () => {
  const remoteBytes = zipSync({
    'metadata.json': strToU8('{"labels":["rescue"]}'),
    'model.json': strToU8('{"weightsManifest":[{"paths":["weights.bin"]}]}'),
    'weights.bin': Uint8Array.from([1, 2, 3]),
  });
  const url = 'https://cdn.example.com/pose.ZIP?download=1';
  const component = unverifiedRemotePoseRuntimeComponent(url);
  const log: LogEntry[] = [];
  let registration: {name: string; files: {path: string}[]} | undefined;
  const setup = options(component, log, {
    tm: {
      async registerPoseModel(input: {name: string; files: {path: string}[]}) {
        registration = input;
        return {name: input.name, labels: ['rescue']};
      },
    },
  });
  const loads: unknown[] = [];
  const session = createDsl4PlatformAssetSession({
    ...setup.value,
    subtleCrypto: webcrypto.subtle,
    async loadRemoteAsset(payload) {
      loads.push(payload);
      return {bytes: remoteBytes, contentType: 'application/zip'};
    },
  });

  await session.lifecycle.prepare({assetIds: ['RemotePose']}, context());
  assert.deepEqual(loads, [{assetId: 'RemotePose', url}]);
  assert.deepEqual(
    requireDefined(registration, 'the registered pose model').files.map((file) => file.path),
    ['metadata.json', 'model.json', 'weights.bin'],
  );
  await session.dispose('unverified-remote-pose-complete');
});

test('bounds repeated remote pose materialization and persistent cache bytes', async () => {
  const remoteBytes = zipSync({
    'metadata.json': strToU8('{"labels":["rescue"]}'),
    'model.json': strToU8('{"model":true}'),
    'weights.bin': Uint8Array.from([1, 2, 3]),
  });
  const indexedDB = new IDBFactory();
  const component = remotePoseRuntimeComponent(remoteBytes);
  const log: LogEntry[] = [];
  let networkLoads = 0;
  let activeModels = 0;
  let maximumActiveModels = 0;
  let registrations = 0;
  let modelReleases = 0;
  const setup = options(component, log, {
    tm: {
      async registerPoseModel(input: {name: string}) {
        registrations += 1;
        activeModels += 1;
        maximumActiveModels = Math.max(maximumActiveModels, activeModels);
        return {name: input.name, labels: ['rescue']};
      },
      async releasePoseModel() {
        modelReleases += 1;
        activeModels -= 1;
      },
    },
  });
  const session = createDsl4PlatformAssetSession({
    ...setup.value,
    cacheIdentity,
    poseArchiveLimits: poseArchiveLimits(),
    subtleCrypto: webcrypto.subtle,
    verifiedRemoteCacheOptions: {
      indexedDB,
      subtleCrypto: webcrypto.subtle,
      estimateStorage: async () => ({quota: 64 * 1024 * 1024, usage: 0}),
    },
    async loadRemoteAsset() {
      networkLoads += 1;
      return {bytes: Uint8Array.from(remoteBytes), contentType: 'application/zip'};
    },
    createAssetManagerComposition: assetManagerCompositionFactory((_featureFlags, options) => {
      const cache = createVerifiedRemoteBinaryCache(
        verifiedRemoteCacheOptions(requireRecord(options, 'the composition options')),
      );
      return Object.freeze({
        ...setup.created.assetManagerComposition,
        resolveVerifiedRemoteBinary: (
          input: Parameters<typeof cache.resolve>[0],
          resolveOptions: Parameters<typeof cache.resolve>[1],
        ) => cache.resolve(input, resolveOptions),
        getVerifiedRemoteCacheStats: () => cache.getStats(),
        pruneVerifiedRemoteCache: () => cache.prune(),
        clearVerifiedRemoteCache: () => cache.clear(),
        listVerifiedRemoteStoryCaches: () => cache.listStoryCaches(),
        pruneVerifiedRemoteStoryCaches: () => cache.pruneStoryCaches(),
        deleteVerifiedRemoteStoryCache: (
          databaseName: Parameters<typeof cache.deleteStoryCache>[0],
        ) => cache.deleteStoryCache(databaseName),
        renewVerifiedRemoteStoryCacheLease: () => cache.renewStoryCacheLease(),
        releaseVerifiedRemoteStoryCacheLease: () => cache.releaseStoryCacheLease(),
      });
    }),
  });

  for (let visit = 0; visit < 12; visit += 1) {
    await session.lifecycle.prepare({assetIds: ['RemotePose']}, context());
    assert.equal(activeModels, 1);
    const stats = requireRecord(
      await requireDefined(session.verifiedRemoteCache, 'the verified remote cache').getStats(),
      'the cache statistics',
    );
    assert.equal(stats.entries, 1);
    assert.equal(stats.bytes, remoteBytes.byteLength);
    await session.lifecycle.releaseAssets({
      assetIds: ['RemotePose'],
      reason: 'scene-transition',
    });
    assert.equal(activeModels, 0);
  }

  assert.equal(networkLoads, 1);
  assert.equal(maximumActiveModels, 1);
  assert.equal(registrations, 12);
  assert.equal(modelReleases, 12);
  const finalStats = requireRecord(
    await requireDefined(session.verifiedRemoteCache, 'the verified remote cache').getStats(),
    'the final cache statistics',
  );
  assert.deepEqual(
    {entries: finalStats.entries, bytes: finalStats.bytes},
    {
      entries: 1,
      bytes: remoteBytes.byteLength,
    },
  );
  await session.dispose('bounded-repetition-complete');
  assert.equal(activeModels, 0);
});

test('attempts every final cleanup and aggregates lifecycle and composition failures', async () => {
  const log: LogEntry[] = [];
  const failure = new Error('release failed');
  const setup = options(runtimeComponent(), log, {
    assetManager: {
      releaseAsset(name: string) {
        log.push(['media.release', name]);
        throw failure;
      },
      releaseAll() {
        log.push(['media.release-all']);
        throw new Error('media releaseAll failed');
      },
    },
    tm: {
      async releasePoseModel(name: string) {
        log.push(['pose.release', name]);
        throw failure;
      },
      async releaseAll() {
        log.push(['pose.release-all']);
        throw new Error('pose releaseAll failed');
      },
    },
  });
  const session = createDsl4PlatformAssetSession(setup.value);
  await session.lifecycle.prepare({assetIds: ['Beach', 'RescuePose']}, context());

  await assert.rejects(session.dispose(), (error) => {
    assert.equal(error instanceof AggregateError, true);
    const failures = requireArray(thrown(error).errors, 'the aggregated failures');
    assert.equal(failures.length, 3);
    const nested = requireDefined(failures[0], 'the first aggregated failure');
    assert.equal(nested instanceof AggregateError, true);
    assert.equal(requireArray(thrown(nested).errors, 'its own failures').length, 2);
    return true;
  });
  assert.deepEqual(log.slice(-4), [
    ['pose.release', 'RescuePose'],
    ['media.release', 'Beach'],
    ['pose.release-all'],
    ['media.release-all'],
  ]);
});

test('rejects invalid input before factories and cleans an incomplete factory chain', () => {
  let factoryCalls = 0;
  const base = {
    runtimeComponent: runtimeComponent(),
    tmPoseRuntime: {Webcam: class {}, async loadFromFiles() {}},
    setLoading() {},
    createAssetManagerComposition: assetManagerCompositionFactory(() => {
      factoryCalls += 1;
      return factories([]).assetManagerComposition;
    }),
  };
  assert.throws(
    () => createDsl4PlatformAssetSession(invalidSessionOptions({...base, runtimeComponent: {}})),
    /validated StoryDocument/u,
  );
  assert.throws(
    () => createDsl4PlatformAssetSession(invalidSessionOptions({...base, tmPoseRuntime: {}})),
    /Webcam and loadFromFiles/u,
  );
  assert.throws(
    () =>
      createDsl4PlatformAssetSession(
        invalidSessionOptions({
          ...base,
          runtimeComponent: remoteRuntimeComponent(new Uint8Array([1])),
          loadRemoteAsset() {},
        }),
      ),
    /cacheIdentity must be an object/u,
  );
  assert.throws(
    () =>
      createDsl4PlatformAssetSession(
        invalidSessionOptions({
          ...base,
          runtimeComponent: remotePoseRuntimeComponent(new Uint8Array([1])),
          cacheIdentity,
          loadRemoteAsset() {},
          poseArchiveLimits: {},
        }),
      ),
    /maxCompressionRatio/u,
  );
  assert.equal(factoryCalls, 0);

  const log: LogEntry[] = [];
  const setup = options(runtimeComponent(), log);
  assert.throws(
    () =>
      createDsl4PlatformAssetSession({
        ...setup.value,
        createTMComposition: tmCompositionFactory(() => {
          throw new Error('TM creation failed');
        }),
      }),
    /TM creation failed/u,
  );
  assert.deepEqual(log, [['media.create'], ['media.release-all']]);

  const invalidLog: LogEntry[] = [];
  const invalid = factories(invalidLog, {
    assetManager: {applyToStage: undefined},
  });
  assert.throws(
    () =>
      createDsl4PlatformAssetSession(
        invalidSessionOptions({
          ...base,
          createAssetManagerComposition: invalid.createAssetManagerComposition,
        }),
      ),
    /applyToStage/u,
  );
  assert.deepEqual(invalidLog, [['media.create'], ['media.release-all']]);
});

test('publication video ownership can span platform sessions without revoking a live shared URL', async () => {
  const {createDsl4VideoAssetAdapter} = await import('../src/dsl4/platform/video-asset-adapter.js');
  const bytes = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]);
  let created = 0;
  const revoked: string[] = [];
  const videoAssetAdapter = createDsl4VideoAssetAdapter({
    createObjectURL: () => `blob:shared-${++created}`,
    revokeObjectURL: (url) => {
      revoked.push(url);
    },
  });
  const component = runtimeComponent();
  component.assetBundle.manifest.assets = [
    {
      id: 'Movie',
      kind: 'video',
      loading: 'lazy',
      source: {
        type: 'file',
        files: [
          {
            path: 'movie.webm',
            size: bytes.length,
            integrity: 'sha256-' + createHash('sha256').update(bytes).digest('base64'),
          },
        ],
      },
    },
  ];
  component.getAssetFile = () => bytes;
  const a = createDsl4PlatformAssetSession({...options(component, []).value, videoAssetAdapter});
  const b = createDsl4PlatformAssetSession({...options(component, []).value, videoAssetAdapter});
  try {
    await Promise.all([
      a.lifecycle.prepare({assetIds: ['Movie']}, context()),
      b.lifecycle.prepare({assetIds: ['Movie']}, context()),
    ]);
    assert.equal(created, 1);
    assert.equal(
      requireRecord(a.getAssetResource('Movie'), 'a video').objectUrl,
      requireRecord(b.getAssetResource('Movie'), 'b video').objectUrl,
    );
    await a.dispose();
    assert.deepEqual(revoked, []);
    assert.equal(requireRecord(b.getAssetResource('Movie'), 'b video').objectUrl, 'blob:shared-1');
  } finally {
    await a.dispose();
    await b.dispose();
  }
  assert.deepEqual(revoked, ['blob:shared-1']);
});

test('retries only failed platform cleanup owners without reopening lifecycle operations', async () => {
  const log: LogEntry[] = [];
  let calls = 0;
  const setup = options(runtimeComponent(), log, {
    tm: {
      releaseAll() {
        if (++calls === 1) throw new Error('TM cleanup still owned');
      },
    },
  });
  const session = createDsl4PlatformAssetSession(setup.value);
  const first = session.dispose();
  assert.equal(session.dispose(), first);
  await assert.rejects(first, AggregateError);
  await assert.rejects(
    async () => session.lifecycle.prepare({assetIds: ['Beach']}, context()),
    (error) => thrown(error).code === 'K4-PLATFORM-ASSET-SESSION-001',
  );
  await session.dispose();
  assert.equal(calls, 2);
  assert.equal(log.filter(([name]) => name === 'media.release-all').length, 1);
  await session.dispose();
  assert.equal(calls, 2);
});

test('retries a failed camera stop through the real story lifecycle and platform owner', async () => {
  const component = runtimeComponent();
  component.storyDocument = {
    ...component.storyDocument,
    scenes: [{id: 'opening', actions: [{command: 'pose', args: {}}]}],
  };
  const log: LogEntry[] = [];
  let running = false;
  let recognizing = false;
  let visible = false;
  let startCalls = 0;
  let stopCalls = 0;
  let recognitionStops = 0;
  let previewHides = 0;
  let nested: Promise<boolean> | undefined;
  const setup = options(component, log, {
    tm: {
      setPreviewOpacity() {},
      async startCamera() {
        startCalls++;
        running = true;
      },
      isCameraRunning: () => running,
      isRecognizing: () => recognizing,
      isPreviewVisible: () => visible,
      hidePreview() {
        previewHides++;
        visible = false;
      },
      stopRecognition() {
        recognitionStops++;
        recognizing = false;
      },
      stopCamera() {
        stopCalls++;
        if (stopCalls === 1) {
          nested = session.storyCameraLifecycle!.dispose();
          void nested.catch(() => {});
          throw new Error('camera stop failed once');
        }
        running = false;
      },
    },
  });
  const session = createDsl4PlatformAssetSession(setup.value);
  assert.equal(await session.storyCameraLifecycle!.start(), true);
  assert.equal(startCalls, 1);
  visible = recognizing = true;
  const first = session.dispose();
  assert.strictEqual(session.dispose(), first);
  await assert.rejects(first, AggregateError);
  assert(nested, 'camera stop must synchronously reenter disposal');
  await assert.rejects(nested, /camera stop failed once/u);
  assert.equal(stopCalls, 1);
  assert.equal(running, true);
  await assert.rejects(session.storyCameraLifecycle!.start(), /disposed/u);
  // Ordinary stop observes the last failure; only explicit dispose starts a new attempt.
  await assert.rejects(session.storyCameraLifecycle!.stop(), /camera stop failed once/u);
  assert.equal(stopCalls, 1);
  await assert.rejects(
    async () => session.lifecycle.prepare({assetIds: ['Beach']}, context()),
    (error) => thrown(error).code === 'K4-PLATFORM-ASSET-SESSION-001',
  );
  const retry = session.dispose();
  assert.strictEqual(session.dispose(), retry);
  await retry;
  assert.equal(stopCalls, 2);
  assert.equal(running, false);
  assert.equal(previewHides, 2);
  assert.equal(recognitionStops, 1);
  for (const event of ['media.release-all', 'pose.release-all']) {
    assert.equal(log.filter(([name]) => name === event).length, 1);
  }
  await session.dispose();
  assert.equal(stopCalls, 2);
});

test('platform retries a late camera owner after its first disposal already succeeded', async () => {
  const component = runtimeComponent();
  component.storyDocument = {
    ...component.storyDocument,
    scenes: [{id: 'opening', actions: [{command: 'pose', args: {}}]}],
  };
  const log: LogEntry[] = [];
  const permission = deferred();
  const requested = deferred();
  const failed = deferred<unknown>();
  let running = false;
  let stops = 0;
  const failure = new Error('late platform camera stop failed');
  const setup = options(component, log, {
    tm: {
      setPreviewOpacity() {},
      async startCamera() {
        requested.resolve();
        await permission.promise;
        running = true;
      },
      isCameraRunning: () => running,
      stopCamera() {
        if (++stops === 1) throw failure;
        running = false;
      },
    },
  });
  const session = createDsl4PlatformAssetSession({
    ...setup.value,
    onCameraCleanupError: (error) => failed.resolve(error),
  });
  const starting = session.storyCameraLifecycle!.start();
  await withDeadline(requested.promise, 'platform camera permission request', 3000);
  await session.dispose();
  assert.equal(await starting, false);
  permission.resolve();
  assert.equal(
    await withDeadline(failed.promise, 'late platform camera cleanup error', 3000),
    failure,
  );
  assert.equal(session.hasPendingCleanup(), true);
  await assert.rejects(session.storyCameraLifecycle!.stop(), (error) => error === failure);
  const retry = session.dispose();
  assert.strictEqual(session.dispose(), retry);
  await retry;
  assert.equal(running, false);
  assert.equal(stops, 2);
  assert.equal(session.hasPendingCleanup(), false);
  assert.equal(log.filter(([name]) => name === 'media.release-all').length, 1);
  assert.equal(log.filter(([name]) => name === 'pose.release-all').length, 1);
  await session.dispose();
  assert.equal(stops, 2);
});

for (const asynchronous of [false, true])
  test(`partial platform factory retains ${asynchronous ? 'async' : 'sync'} cleanup failure for explicit retry`, async () => {
    const failure = new Error('TM creation failed');
    let calls = 0;
    const setup = options(runtimeComponent(), [], {
      assetManager: {
        releaseAll() {
          calls++;
          if (calls === 1) {
            if (asynchronous) return Promise.reject(new Error('media cleanup failed'));
            throw new Error('media cleanup failed');
          }
        },
      },
    });
    let rejected: unknown;
    try {
      createDsl4PlatformAssetSession({
        ...setup.value,
        createTMComposition: tmCompositionFactory(() => {
          throw failure;
        }),
      });
      assert.fail('factory must fail');
    } catch (error) {
      rejected = error;
    }
    const cleanup = creationCleanup(rejected);
    await assert.rejects(cleanup.completion!, AggregateError);
    assert.equal((rejected as Error).cause, failure);
    assert.equal(cleanup.hasPendingCleanup(), true);
    assert.equal(calls, 1);
    const retry = cleanup.dispose();
    assert.equal(cleanup.dispose(), retry);
    await retry;
    assert.equal(calls, 2);
    assert.equal(cleanup.hasPendingCleanup(), false);
    await cleanup.dispose();
    assert.equal(calls, 2);
  });

test('prepares the camera preview the way the story asked for it', async () => {
  const component = runtimeComponent();
  component.storyDocument = {
    ...component.storyDocument,
    recognition: {preview: {mirroring: 'mirrored', position: 'bottom-right', opacity: 0.75}},
    scenes: [{id: 'opening', actions: [{command: 'pose', args: {}}]}],
  };
  const log: LogEntry[] = [];
  const placement: unknown[][] = [];
  let running = false;
  const setup = options(component, log, {
    tm: {
      setPreviewOpacity(opacity: unknown) {
        placement.push(['opacity', opacity]);
      },
      setPreviewPosition(position: unknown) {
        placement.push(['position', position]);
      },
      async startCamera() {
        running = true;
      },
      isCameraRunning: () => running,
      stopCamera() {
        running = false;
      },
    },
  });
  const session = createDsl4PlatformAssetSession(setup.value);
  assert.equal(await session.storyCameraLifecycle!.start(), true);
  assert.deepEqual(placement, [
    ['opacity', 0.75],
    ['position', 'bottom-right'],
  ]);
  await session.dispose();
});

test('refuses a story preview placement outside the schema range', () => {
  const component = runtimeComponent();
  component.storyDocument = {
    ...component.storyDocument,
    recognition: {preview: {mirroring: 'mirrored', opacity: 2}},
    scenes: [{id: 'opening', actions: [{command: 'pose', args: {}}]}],
  };
  const log: LogEntry[] = [];
  const setup = options(component, log, {tm: {setPreviewOpacity() {}}});
  assert.throws(
    () => createDsl4PlatformAssetSession(setup.value),
    /recognition\.preview\.opacity must be a finite number from 0 to 1/u,
  );
});
