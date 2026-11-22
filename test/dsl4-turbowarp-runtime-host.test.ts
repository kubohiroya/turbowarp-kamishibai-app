import assert from 'node:assert/strict';
import {createDsl4AudioMixer} from '../src/dsl4/platform/audio-mixer.js';
import {createDsl4PlaybackPreferences} from '../src/dsl4/platform/playback-preferences.js';
import {creationCleanup} from './helpers/creation-cleanup.ts';
import {createHash, webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {installDsl4PackagedRuntimeComponent} from '../src/builder/index.js';
import {createDsl4ProductionSourceFrontend} from '../src/builder/dsl4-source-frontend.js';
import {
  createDsl4DebugExecutionCoordinator,
  createDsl4EmbeddedAssetBundle,
  createDsl4EmbeddedSourceDescriptor,
  createDsl4RuntimeArtifactDescriptor,
  createDsl4SourceFrontend,
  dsl4StandardProductionFeatureFlags,
  loadDsl4RuntimeComponent,
  resolveDsl4FeatureFlags,
} from '../src/dsl4/index.js';
import {
  createDsl4StandardAppShell,
  createDsl4TurboWarpPreviewSessionFactory,
  createDsl4TurboWarpRuntimeHost,
  resolveDsl4SessionBackingConfig,
} from '../src/dsl4/platform/index.js';
import {
  createDsl4EmptyProject,
  createDsl4PackagedRuntimeProject,
} from './helpers/dsl4-runtime-fixtures.ts';
import {createDsl4ObjectUrlOwner} from '../src/dsl4/platform/object-url-owner.js';
import {createFakeDocument, requireFakeElement, type FakeElement} from './helpers/fake-dom.ts';
import {thrown} from './helpers/thrown-error.ts';
import {okResult} from './helpers/result-outcome.ts';
import {deferred, waitUntil, withDeadline} from './helpers/async-test-helpers.ts';
import {
  requireArray,
  requireDefined,
  requireRecord,
  requireString,
} from './helpers/require-value.ts';

type HostResult = Awaited<ReturnType<typeof createDsl4TurboWarpRuntimeHost>>;
type RuntimeHost = NonNullable<HostResult['host']>;

/** The `[event, ...details]` rows the platform fixture records. */
type LogEntry = [string, ...unknown[]];

/** One payload a composition double receives. */
type CompositionPayload = Readonly<Record<string, unknown>>;

/**
 * The TurboWarp doubles one case replaces members of.
 *
 * The host reads its runtime and its compositions as opaque platform values, and each case swaps in
 * the members it drives, so these stay open records with the members the fixture itself publishes.
 */
interface FixtureRuntime extends Record<string, unknown> {
  targets: unknown[];
  threads: unknown[];
}

type FixtureComposition = Record<string, unknown>;

/**
 * Read a dependency a case proves is never touched.
 *
 * The disabled-startup cases hand the host proxies that fail on any read, which is exactly what
 * they assert; the host's own option types name real platform values.
 */
function unreadDependency<T>(label: string): T {
  return new Proxy({}, {get: () => assert.fail(`${label} must not be read`)}) as T;
}

type SessionBackingConfig = NonNullable<ReturnType<typeof resolveDsl4SessionBackingConfig>>;

/** Read the session backing configuration one case resolved; it is null only when disabled. */
function backingOf(config: SessionBackingConfig | null, description: string): SessionBackingConfig {
  return requireDefined(config, description);
}

type AppShellOptions = NonNullable<Parameters<typeof createDsl4StandardAppShell>[0]>;
type AppShellSurface = NonNullable<AppShellOptions['surface']>;
type AppShellResult = Awaited<ReturnType<typeof createDsl4StandardAppShell>>;

/** Read the snapshot one app shell published. */
function shellSnapshot(shell: AppShellResult): Record<string, unknown> {
  return requireRecord(shell.getSnapshot(), 'the app shell snapshot');
}

/**
 * Pass app shell options the declaration refuses on purpose.
 *
 * The cleanup cases hand it a runtime host factory that returns a malformed result, which is the
 * behaviour they assert the shell rejects.
 */
function invalidAppShellOptions(options: Record<string, unknown>): AppShellOptions {
  return options as unknown as AppShellOptions;
}

/** The element one enabled app shell mounted. */
function appShellRoot(shell: {element: unknown}): FakeElement {
  return requireFakeElement(shell.element, 'the app shell element');
}

/** Walk a chain of child indexes the case expects the mounted controls to have. */
function nestedChild(root: FakeElement, indexes: readonly number[]): FakeElement {
  return indexes.reduce<FakeElement>(
    (element, index) =>
      requireDefined(element.children[index], `child ${index} of ${element.tagName}`),
    root,
  );
}

/** One TurboWarp target the fixture published, by index. */
function fixtureTarget(runtime: FixtureRuntime, index: number): Record<string, unknown> {
  return requireRecord(runtime.targets[index], `fixture target ${index}`);
}

/** Read a member the case calls as a function. */
function requireFunction(value: unknown, description: string): (...args: unknown[]) => unknown {
  assert(typeof value === 'function', `Expected ${description} to be a function`);
  return value as (...args: unknown[]) => unknown;
}

/** Read one element the pose feedback presenter rendered. */
function presented(element: FakeElement | null, description: string): FakeElement {
  return requireDefined(element, description);
}

/** Read one diagnostic a refusal reported. */
function diagnosticAt(result: {diagnostics: readonly unknown[]}, index: number) {
  return requireRecord(result.diagnostics[index], `diagnostic ${index}`);
}

/** The story document one loaded runtime component carries. */
function componentStory(component: unknown): Readonly<Record<string, unknown>> {
  return requireRecord(
    requireRecord(component, 'the runtime component').storyDocument,
    'its story document',
  );
}

/** Read a runtime state, session state, or other opaque record a host member published. */
function reported(value: unknown, description: string): Record<string, unknown> {
  return requireRecord(value, description);
}

/** Read the host one successful startup published. */
function hostOf(result: HostResult, description = 'the runtime host'): RuntimeHost {
  return requireDefined(result.host, description);
}

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const schema = JSON.parse(
  await readFile(path.join(repositoryRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
);
const frontend = createDsl4SourceFrontend(schema);
const runtimeStateFrontend = createDsl4ProductionSourceFrontend(schema, {
  runtimeStateExpressionsEnabled: true,
});
const subtleCrypto = webcrypto.subtle;
const limits = {maxSourceBytes: 16_384, maxAssetFiles: 20, maxTotalAssetBytes: 16_384};
const waitStory = `
kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - wait: 0
`;
const broadcastStory = `
kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - broadcastMessageAndWait: message
`;
const speechStory = `
kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
  Voice: sound
actors:
  Hero: HeroIdle
bubbleStyles:
  novel:
    characterIntervalSeconds: 60
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - Hero.think:
        text: どうしよう
        waitFor: advance
        styles:
          - novel
        startSound: Voice
    - wait: 0
`;
const posePreviewStory = `
kamishibai: '4.0'
assets:
  Tick: sound
  Charge: sound
recognition:
  idleSound: Tick
  chargeSound: Charge
  preview:
    mirroring: unmirrored
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    posePreview:
      mirroring: mirrored
    actions: []
  reset: []
`;
const cameraPreviewControlsStory = `
kamishibai: '4.0'
assets:
  Tick: sound
  Charge: sound
  ShowMirrored:
    kind: image
    delivery: remote
    source:
      url: https://cdn.example.com/show-mirrored.svg
      integrity: sha256-0000000000000000000000000000000000000000000000000000000000000000
      contentType: image/svg+xml
      size: 6
  ShowUnmirrored:
    kind: image
    delivery: remote
    source:
      url: https://cdn.example.com/show-unmirrored.svg
      integrity: sha256-1111111111111111111111111111111111111111111111111111111111111111
      contentType: image/svg+xml
      size: 6
  CameraMenu:
    kind: image
    delivery: remote
    source:
      url: https://cdn.example.com/camera-menu.svg
      integrity: sha256-2222222222222222222222222222222222222222222222222222222222222222
      contentType: image/svg+xml
      size: 6
recognition:
  idleSound: Tick
  chargeSound: Charge
  preview:
    mirroring: mirrored
    controls:
      mirroring:
        position: top-center
        assets:
          showMirrored: ShowMirrored
          showUnmirrored: ShowUnmirrored
      cameraMenu:
        position: bottom-center
        buttonAsset: CameraMenu
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    posePreview:
      mirroring: unmirrored
    actions:
      - wait: 3600
`;
const cameraPreviewControlsHistoryStory = cameraPreviewControlsStory.replace(
  '      Space: navigation.nextAction',
  '      Space: navigation.nextAction\n      ArrowLeft: history.previousAction',
);

function findByDataset(root: FakeElement, key: string, value: string): FakeElement | null {
  if (root.dataset?.[key] === value) return root;
  for (const child of root.children ?? []) {
    const found = findByDataset(child, key, value);
    if (found) return found;
  }
  return null;
}

function manualScheduler() {
  let currentTime = 0;
  let nextId = 1;
  const timers = new Map<number, {callback: () => void; due: number}>();
  return {
    scheduler: {
      now: () => currentTime,
      setTimeout(callback: () => void, milliseconds: number) {
        const id = nextId;
        nextId += 1;
        timers.set(id, {callback, due: currentTime + milliseconds});
        return id;
      },
      clearTimeout(id: unknown) {
        if (typeof id === 'number') timers.delete(id);
      },
    },
    pendingCount: () => timers.size,
    advance(milliseconds: number) {
      const targetTime = currentTime + milliseconds;
      while (true) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.due <= targetTime)
          .sort((left, right) => left[1].due - right[1].due || left[0] - right[0])[0];
        if (!next) break;
        const [id, timer] = next;
        timers.delete(id);
        currentTime = timer.due;
        timer.callback();
      }
      currentTime = targetTime;
    },
  };
}

async function packagedProject(
  sourceText = waitStory,
  {
    cacheIdentity,
    historyNavigationAvailable = false,
    sourceFrontend = frontend,
  }: {
    cacheIdentity?: Readonly<Record<string, unknown>>;
    historyNavigationAvailable?: boolean;
    sourceFrontend?: typeof frontend;
  } = {},
) {
  return createDsl4PackagedRuntimeProject(sourceText, {
    sourceFrontend,
    historyNavigationAvailable,
    limits,
    cacheIdentity,
    subtleCrypto,
  });
}

async function packagedPoseProject(sourceText: string) {
  const parsed = frontend.parse(sourceText, {sourceId: 'main'});
  assert(parsed.ok, `expected the pose story to parse: ${JSON.stringify(parsed.diagnostics)}`);
  const sourceDescriptor = await createDsl4EmbeddedSourceDescriptor(sourceText, {
    sourceId: 'main',
    displayName: 'story.kamishibai.yaml',
    maxSourceBytes: limits.maxSourceBytes,
    subtleCrypto,
  });
  const artifactResult = await createDsl4RuntimeArtifactDescriptor(
    parsed.storyDocument,
    sourceDescriptor,
    'production',
    {maxSourceBytes: limits.maxSourceBytes, subtleCrypto},
  );
  assert(artifactResult.ok, `expected the artifact: ${JSON.stringify(artifactResult.diagnostics)}`);
  const poseFiles = new Map([
    ['metadata.json', new TextEncoder().encode('{"labels":["help"]}')],
    ['model.json', new TextEncoder().encode('{"modelTopology":{}}')],
    ['weights.bin', new Uint8Array([1])],
  ]);
  const poseSourceFiles = [...poseFiles].map(([filePath, bytes]) => ({
    path: filePath,
    size: bytes.byteLength,
    integrity: `sha256-${createHash('sha256').update(bytes).digest('base64')}`,
  }));
  const snapshotAssets = Object.values(
    requireRecord(parsed.storyDocument.assets, 'the story assets'),
  )
    .map((value) => {
      const asset = requireRecord(value, 'a story asset');
      return {
        id: requireString(asset.id, 'its id'),
        kind: asset.kind,
        loading: asset.loading,
        ...(typeof asset.target === 'string' ? {target: asset.target} : {}),
        source:
          asset.kind === 'recognitionModel'
            ? {
                type: 'file',
                inputPath: asset.file,
                mode: 'directory',
                files: poseSourceFiles,
              }
            : {type: 'project', name: asset.name},
      };
    })
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const assetBundle = await createDsl4EmbeddedAssetBundle(
    parsed.storyDocument,
    {
      manifest: {formatVersion: 1, assets: snapshotAssets},
      getFile(assetId: string, filePath: string) {
        assert.equal(assetId, 'RescuePose');
        return new Uint8Array(requireDefined(poseFiles.get(filePath), `pose file ${filePath}`));
      },
    },
    {maxFiles: limits.maxAssetFiles, maxTotalBytes: limits.maxTotalAssetBytes, subtleCrypto},
  );
  return installDsl4PackagedRuntimeComponent(
    createDsl4EmptyProject(),
    parsed.storyDocument,
    sourceDescriptor,
    okResult(artifactResult, 'the runtime artifact').artifact,
    assetBundle,
    {channel: 'unbundled', ...limits, subtleCrypto},
  );
}

function platformFixture(log: LogEntry[]) {
  const poseConfidence = {
    id: 'pose-confidence',
    name: 'ポーズ認識',
    type: '',
    isCloud: false,
    value: 0,
  };
  const poseProgress = {
    id: 'pose-progress',
    name: 'チャージ',
    type: '',
    isCloud: false,
    value: 0,
  };
  const broadcastMessage = {
    id: 'broadcast-message',
    name: 'message',
    type: 'broadcast_msg',
    value: 'message',
  };
  const monitorRecords = new Map();
  const monitorBlocksById = new Map();
  for (const variable of [poseConfidence, poseProgress]) {
    monitorRecords.set(variable.id, {
      id: variable.id,
      opcode: 'data_variable',
      params: {VARIABLE: variable.name},
      targetId: null,
      spriteName: null,
      mode: 'slider',
      sliderMin: 0,
      sliderMax: 100,
      isDiscrete: true,
      visible: false,
      get(property: string) {
        return this[property as keyof typeof this];
      },
    });
    monitorBlocksById.set(variable.id, {
      id: variable.id,
      opcode: 'data_variable',
      fields: {VARIABLE: {id: variable.id, value: variable.name}},
      isMonitored: false,
    });
  }
  const monitorBlocks = {
    getBlock: (id: string) => monitorBlocksById.get(id),
    getScripts: () => [...monitorBlocksById.keys()],
    changeBlock({id, element, value}: {id: string; element: string; value: boolean}) {
      assert.equal(element, 'checkbox');
      const block = monitorBlocksById.get(id);
      const record = monitorRecords.get(id);
      if (!block || !record) return;
      block.isMonitored = value;
      record.visible = value;
    },
  };
  const monitorState = {
    has: (id: string) => monitorRecords.has(id),
    get: (id: string) => monitorRecords.get(id),
    valueSeq: () => monitorRecords.values(),
  };
  const stage = {
    id: 'stage-target',
    isStage: true,
    variables: {
      [poseConfidence.id]: poseConfidence,
      [poseProgress.id]: poseProgress,
      [broadcastMessage.id]: broadcastMessage,
    },
    lookupVariableByNameAndType(name: string, type: string) {
      assert.equal(type, '');
      if (name === 'ポーズ認識') return poseConfidence;
      if (name === 'チャージ') return poseProgress;
      return null;
    },
    setEffect(effect: string, value: number) {
      log.push(['stage.effect', effect, value]);
    },
  };
  const actor = {
    id: 'actor-target',
    isStage: false,
    drawableID: 7,
    x: 0,
    y: 0,
    lookupVariableByNameAndType(name: string) {
      return name === 'actorName' ? {value: 'Hero'} : null;
    },
    setXY(x: number, y: number) {
      this.x = x;
      this.y = y;
      log.push(['actor.xy', x, y]);
    },
    setSize(size: number) {
      log.push(['actor.size', size]);
    },
    setVisible(visible: boolean) {
      log.push(['actor.visible', visible]);
    },
    setEffect(effect: string, value: number) {
      log.push(['actor.effect', effect, value]);
    },
    goToFront() {
      log.push(['actor.layer', 'front']);
    },
    goToBack() {
      log.push(['actor.layer', 'back']);
    },
    goForwardLayers(count: number) {
      log.push(['actor.layer', count]);
    },
    goBackwardLayers(count: number) {
      log.push(['actor.layer', -count]);
    },
  };
  const assetManagerComposition: FixtureComposition = {
    async registerProjectAsset(input: {name: string; locator: {kind: string}}) {
      log.push(['media.register', input.name]);
      return {
        name: input.name,
        mimeType: input.locator.kind === 'sound' ? 'audio/wav' : 'image/svg+xml',
      };
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
    getMimeType(name: string) {
      return name === 'Bell' || name === 'Tick' || name === 'Voice' ? 'audio/wav' : 'image/svg+xml';
    },
    applyToStage(name: string) {
      log.push(['media.stage', name]);
    },
    applyToTarget(name: string) {
      log.push(['media.target', name]);
    },
    playSound(name: string) {
      log.push(['media.play', name]);
    },
    stopSound(name: string) {
      log.push(['media.stop', name]);
    },
    stopAllSounds() {
      log.push(['media.stop-all']);
    },
    async resolveVerifiedRemoteBinary(
      input: {integrity: unknown},
      options: {
        load(
          input: unknown,
          request: {signal: AbortSignal},
        ): Promise<{
          bytes: unknown;
          contentType: unknown;
        }>;
        signal: AbortSignal;
      },
    ) {
      const loaded = await options.load(input, {signal: options.signal});
      return {
        bytes: loaded.bytes,
        contentType: loaded.contentType,
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
    async renewVerifiedRemoteStoryCacheLease() {
      log.push(['cache.renew-lease']);
    },
    async releaseVerifiedRemoteStoryCacheLease() {
      log.push(['cache.release-lease']);
    },
  };
  const tmComposition: FixtureComposition = {
    registerPoseModel() {
      return {name: 'Pose', labels: ['pose']};
    },
    activatePoseModel() {},
    releasePoseModel() {},
    releaseAll() {
      log.push(['pose.release-all']);
    },
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
    setPreviewOpacity() {},
    setPreviewPosition() {},
    startCamera() {},
    stopCamera() {},
    isCameraRunning() {
      return false;
    },
    startRecognition() {},
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
    setPreviewMirroring(mode: unknown) {
      log.push(['pose.preview-mirroring', mode]);
    },
  };
  const runtimeListeners = new Map<string, Set<(event: unknown) => void>>();
  const runtime: FixtureRuntime = {
    targets: [stage, actor],
    threads: [],
    monitorBlocks,
    getMonitorState: () => monitorState,
    getTargetForStage() {
      return stage;
    },
    on(type: string, listener: (event: unknown) => void) {
      const listeners = runtimeListeners.get(type) ?? new Set();
      listeners.add(listener);
      runtimeListeners.set(type, listeners);
    },
    off(type: string, listener: (event: unknown) => void) {
      runtimeListeners.get(type)?.delete(listener);
    },
    startHats(opcode: string, fields: Record<string, unknown>) {
      log.push(['runtime.start-hats', opcode, {...fields}]);
      return [];
    },
    _stopThread(thread: unknown) {
      log.push(['runtime.stop-thread', thread]);
    },
  };
  return {
    runtime,
    assetManagerComposition,
    tmComposition,
    poseConfidence,
    poseProgress,
    monitorRecords,
    tmPoseRuntime: {Webcam: class {}, loadFromFiles() {}},
    setLoading(payload: CompositionPayload) {
      log.push(['loading', payload.visible]);
    },
    createAssetManagerComposition(...args: unknown[]) {
      log.push(['media.create', args[1]]);
      return assetManagerComposition;
    },
    createTMComposition() {
      log.push(['pose.create']);
      return tmComposition;
    },
    createAsyncInputComposition() {
      log.push(['input.create']);
      return {
        waitForPoseCandidate() {
          return Promise.resolve('pose');
        },
        waitForKeyCandidate({candidates}: {candidates: readonly unknown[]}) {
          return Promise.resolve(candidates[0]);
        },
        waitForActorTouchCandidate({candidates}: {candidates: readonly unknown[]}) {
          return Promise.resolve(candidates[0]);
        },
        releaseAll() {
          log.push(['input.release-all']);
        },
      };
    },
    createSvgTextComposition() {
      log.push(['svg.create']);
      return {
        defineStyle() {},
        setText(input: {text: unknown; styleName: unknown}) {
          log.push(['svg.text', input.text, input.styleName]);
        },
        setRichText(input: {runs: unknown; styleName: unknown}) {
          log.push(['svg.rich-text', input.runs, input.styleName]);
        },
        releaseTarget() {},
        releaseAll() {
          log.push(['svg.release-all']);
        },
      };
    },
    // Bubble owns every say and think, so the fixture logs the displayed text the way the runtime
    // sees it: one entry per update, and an empty one when the bubble closes.
    createBubbleComposition() {
      log.push(['bubble.create']);
      return {
        defineStyle(style: {name: unknown}) {
          log.push(['bubble.define', style.name]);
        },
        async show(input: {kind: string; text: unknown}) {
          log.push([`actor.${input.kind}`, input.text]);
          return {
            async setText(text: unknown) {
              log.push([`actor.${input.kind}`, text]);
            },
            async setAnimationMode(mode: unknown) {
              log.push(['bubble.animation-mode', mode]);
            },
            async revealNext() {
              return false;
            },
            async revealAll() {},
            async animate(motion: {name: unknown}) {
              log.push(['bubble.animate', motion.name]);
            },
            async finish() {},
            async close() {
              log.push([`actor.${input.kind}`, '']);
            },
          };
        },
        releaseAll() {
          log.push(['bubble.release-all']);
        },
      };
    },
  };
}

function enabledOptions(
  project: unknown,
  fixture: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  return {
    featureFlags: {dsl4Runtime: true},
    project,
    sourceFrontend: frontend,
    ...limits,
    subtleCrypto,
    ...fixture,
    ...extra,
  };
}

test('defaults OFF without inspecting project or any TurboWarp dependency', async () => {
  let factoryCalls = 0;
  const failFactory = () => {
    factoryCalls += 1;
    assert.fail('platform factory must not be called');
  };
  const result = await createDsl4TurboWarpRuntimeHost({
    featureFlags: {dsl4Runtime: false},
    project: unreadDependency('project'),
    sourceFrontend: unreadDependency('frontend'),
    runtime: unreadDependency('runtime'),
    tmPoseRuntime: unreadDependency('TM'),
    createAssetManagerComposition: failFactory,
    createTMComposition: failFactory,
    createSvgTextComposition: failFactory,
    createRuntimeExpressionComposition: failFactory,
    createHostPort: failFactory,
  });
  assert.equal(result.ok, true);
  assert.equal(result.enabled, false);
  assert.equal(result.host, null);
  assert.equal(factoryCalls, 0);
});

test('gates broadcastMessageAndWait and dispatches it through the built-in TurboWarp port', async () => {
  const project = await packagedProject(broadcastStory);
  const disabledFixture = platformFixture([]);
  await assert.rejects(
    createDsl4TurboWarpRuntimeHost(enabledOptions(project, disabledFixture)),
    (error) => thrown(error).code === 'K4-HOST-BROADCAST-FLAG-001',
  );

  const log: LogEntry[] = [];
  const enabled = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, platformFixture(log), {
      featureFlags: {dsl4Runtime: true, dsl4BroadcastMessageAndWait: true},
    }),
  );
  assert.equal(enabled.ok, true, JSON.stringify(enabled.diagnostics));
  assert.equal(reported(await hostOf(enabled).start(), 'the runtime state').status, 'finished');
  assert.deepEqual(
    log.filter(([type]) => type === 'runtime.start-hats'),
    [['runtime.start-hats', 'event_whenbroadcastreceived', {BROADCAST_OPTION: 'message'}]],
  );
  await hostOf(enabled).dispose('broadcast-test');
});

test('gates video and removes loop overlays at scene boundaries and runtime finish', async () => {
  const project = await packagedProject(`kamishibai: '4.0'
controls:
  keymaps:
    production: {Space: navigation.nextAction}
scenes:
  main:
    - video: {id: movie, url: 'https://example.com/movie.webm', x: 0, y: 0, width: 320, height: 180}
    - videoControl: {id: movie, operation: loop}
    - goto: ending
  ending:
    - wait: 0
`);
  await assert.rejects(
    createDsl4TurboWarpRuntimeHost(enabledOptions(project, platformFixture([]))),
    (error) => thrown(error).code === 'K4-VIDEO-DISABLED',
  );
  const fixture = platformFixture([]);
  const overlays = new Set<unknown>();
  fixture.runtime.renderer = {
    addOverlay(element: unknown) {
      overlays.add(element);
    },
    removeOverlay(element: unknown) {
      overlays.delete(element);
    },
  };
  const video = Object.assign(new EventTarget(), {
    style: {},
    src: '',
    loop: false,
    currentTime: 0,
    paused: true,
    play() {
      this.paused = false;
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
    },
    load() {},
    removeAttribute() {
      this.src = '';
    },
  });
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      featureFlags: {dsl4Runtime: true, dsl4Video: true},
      createVideo: () => video as unknown as HTMLVideoElement,
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(reported(await hostOf(result).start(), 'runtime state').status, 'finished');
  assert.equal(video.paused, true);
  assert.equal(video.src, '');
  assert.equal(overlays.size, 0);
  await hostOf(result).dispose('video-test');
});

test('connects flagged DSL 4 BGM replacement to Asset Manager createAudioVoice', async () => {
  const project = await packagedProject(`
kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
assets:
  OpeningSound: sound
  EndingSound: sound
scenes:
  opening:
    - bgm: OpeningSound
    - bgm: {sound: EndingSound, transition: 0.5}
`);
  const log: LogEntry[] = [];
  const fixture = platformFixture(log);
  fixture.runtime.renderer = {};
  const voices: {name: unknown; options: unknown; calls: unknown[][]}[] = [];
  fixture.assetManagerComposition.getMimeType = (name: unknown) =>
    name === 'OpeningSound' || name === 'EndingSound' ? 'audio/wav' : 'image/svg+xml';
  fixture.assetManagerComposition.createAudioVoice = async (name: unknown, options: unknown) => {
    const calls: unknown[][] = [];
    const voice = {
      ended: new Promise(() => {}),
      setGain(value: unknown) {
        calls.push(['gain', value]);
      },
      stop() {
        calls.push(['stop']);
      },
    };
    voices.push({name, options, calls});
    return voice;
  };

  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      featureFlags: {dsl4Runtime: true, dsl4CrossfadeTransitions: true},
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(reported(await hostOf(result).start(), 'the runtime state').status, 'finished');
  assert.deepEqual(
    voices.map(({name, options}) => ({name, options})),
    [
      {name: 'OpeningSound', options: {gain: 1}},
      {name: 'EndingSound', options: {gain: 0}},
    ],
  );
  assert.equal(
    log.some(([type]) => type === 'media.play'),
    false,
  );

  await hostOf(result).dispose('crossfade-test');
  assert.deepEqual(requireDefined(voices[0], 'the first voice').calls.at(-1), ['stop']);
  assert.deepEqual(requireDefined(voices[1], 'the second voice').calls.at(-1), ['stop']);
});

test('routes BGM voices through the playback settings mixer and reports the story features', async () => {
  const project = await packagedProject(`
kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
assets:
  OpeningSound: sound
scenes:
  opening:
    - bgm: OpeningSound
`);
  const fixture = platformFixture([]);
  fixture.runtime.renderer = {};
  const gains: unknown[] = [];
  fixture.assetManagerComposition.getMimeType = (name: unknown) =>
    name === 'OpeningSound' ? 'audio/wav' : 'image/svg+xml';
  fixture.assetManagerComposition.createAudioVoice = async (_name: unknown, options: unknown) => {
    gains.push((options as {gain: number}).gain);
    return {
      ended: new Promise(() => {}),
      setGain(value: unknown) {
        gains.push(value);
      },
      stop() {},
    };
  };
  const preferences = createDsl4PlaybackPreferences();
  preferences.setChannel('bgm', {volume: 50});
  const audioMixer = createDsl4AudioMixer(preferences);
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      featureFlags: {dsl4Runtime: true, dsl4CrossfadeTransitions: true},
      audioMixer,
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const host = hostOf(result) as ReturnType<typeof hostOf> & {
    getPlaybackFeatures(): unknown;
    quiesce: unknown;
    resumeQuiesce: unknown;
  };
  assert.deepEqual(host.getPlaybackFeatures(), {
    bgm: true,
    effects: false,
    skip: false,
    skipDefault: false,
    recognition: false,
  });
  assert.equal(typeof host.quiesce, 'function');
  assert.equal(typeof host.resumeQuiesce, 'function');
  assert.equal(reported(await host.start(), 'the runtime state').status, 'finished');
  assert.deepEqual(gains, [0.5], 'the authored full volume is halved by the BGM slider');
  preferences.setChannel('bgm', {enabled: false});
  assert.deepEqual(gains, [0.5, 0], 'the playing BGM follows the switch');
  await host.dispose('mixer-test');
  await assert.rejects(
    createDsl4TurboWarpRuntimeHost(
      enabledOptions(project, platformFixture([]), {audioMixer: {} as typeof audioMixer}),
    ),
    /audioMixer must provide/u,
  );
});

test('resolves one startup-fixed session backing policy behind its default-off flag', () => {
  const direct = resolveDsl4SessionBackingConfig(
    {},
    resolveDsl4FeatureFlags({dsl4IndexedDBAssetSessionStore: false}),
    'binary-entry',
  );
  assert.equal(backingOf(direct, 'the session backing config').policy, 'disabled');
  assert.equal(typeof backingOf(direct, 'the session backing config').sessionId, 'string');
  assert.equal(backingOf(direct, 'the session backing config').sessionId.length > 0, true);
  assert.deepEqual(backingOf(direct, 'the session backing config').storeOptions, {});
  assert.equal(Object.isFrozen(backingOf(direct, 'the session backing config')), true);
  assert.equal(Object.isFrozen(backingOf(direct, 'the session backing config').storeOptions), true);

  const preferred = resolveDsl4SessionBackingConfig(
    {sessionBacking: {sessionId: 'fixed-session', storeOptions: {maxSessionBytes: 1}}},
    resolveDsl4FeatureFlags({dsl4Runtime: true, dsl4IndexedDBAssetSessionStore: true}),
    'binary-entry',
  );
  assert.deepEqual(preferred, {
    policy: 'prefer',
    sessionId: 'fixed-session',
    storeOptions: {maxSessionBytes: 1},
  });
  assert.equal(
    backingOf(
      resolveDsl4SessionBackingConfig(
        {sessionBacking: {policy: 'required'}},
        resolveDsl4FeatureFlags({dsl4Runtime: true, dsl4IndexedDBAssetSessionStore: true}),
        'binary-entry',
      ),
      'the session backing config',
    ).policy,
    'required',
  );
  assert.equal(
    backingOf(
      resolveDsl4SessionBackingConfig(
        {sessionBacking: {policy: 'disabled'}},
        resolveDsl4FeatureFlags({dsl4Runtime: true, dsl4IndexedDBAssetSessionStore: true}),
        'binary-entry',
      ),
      'the session backing config',
    ).policy,
    'disabled',
  );

  assert.throws(
    () =>
      resolveDsl4SessionBackingConfig(
        {sessionBacking: {policy: 'prefer'}},
        resolveDsl4FeatureFlags({dsl4IndexedDBAssetSessionStore: false}),
        'binary-entry',
      ),
    /requires dsl4IndexedDBAssetSessionStore/u,
  );
  assert.throws(
    () =>
      resolveDsl4SessionBackingConfig(
        {sessionBacking: {policy: 'disabled'}},
        resolveDsl4FeatureFlags({dsl4IndexedDBAssetSessionStore: false}),
        'embedded-base64',
      ),
    /require assetBundleFormat binary-entry/u,
  );
  assert.throws(
    () =>
      resolveDsl4SessionBackingConfig(
        {binaryBundleStoreOptions: {}},
        resolveDsl4FeatureFlags({dsl4IndexedDBAssetSessionStore: false}),
        'binary-entry',
      ),
    /replaced by sessionBacking\.storeOptions/u,
  );
});

test('creates browser preview sessions from wire StoryDocuments without parsing source again', async () => {
  const project = await packagedProject();
  const runtimeComponent = await loadDsl4RuntimeComponent(project, frontend, {
    ...limits,
    subtleCrypto,
  });
  assert.equal(runtimeComponent.ok, true, JSON.stringify(runtimeComponent.diagnostics));
  const changed = frontend.parse(waitStory.replace('wait: 0', 'wait: 0.001'), {
    sourceId: 'main',
  });
  assert(changed.ok, `expected the changed story to parse: ${JSON.stringify(changed.diagnostics)}`);

  const log: LogEntry[] = [];
  const resets: string[] = [];
  const createSession = createDsl4TurboWarpPreviewSessionFactory({
    featureFlags: {dsl4Runtime: true},
    runtimeComponent,
    ...platformFixture(log),
    resetManagedPresentation() {
      resets.push('reset');
    },
  });
  const first = await createSession({
    storyDocument: changed.storyDocument,
    previousSession: null,
    preserveManagedPresentation: false,
  });
  assert.equal(log.length, 0);
  await first.start();
  assert.deepEqual(resets, ['reset']);
  assert.equal(
    reported(reported(first.getState(), 'the session state').runtime, 'its runtime state').status,
    'finished',
  );
  await assert.rejects(
    first.invokeAction({command: 'wait', target: null, args: {seconds: 0}}),
    (error) => thrown(error).code === 'K4-RUNTIME-INVOKE-INACTIVE',
  );

  const second = await createSession({
    storyDocument: changed.storyDocument,
    previousSession: first,
    preserveManagedPresentation: true,
  });
  assert.equal(log.filter((entry) => entry[0] === 'media.create').length, 1);
  first.stop('preview-reload');
  await first.dispose('preview-replaced');
  await second.start();
  assert.deepEqual(resets, ['reset']);

  const third = await createSession({
    storyDocument: changed.storyDocument,
    previousSession: second,
    preserveManagedPresentation: false,
  });
  second.stop('preview-reload');
  await second.dispose('preview-replaced');
  await third.start();
  assert.deepEqual(resets, ['reset', 'reset']);
  await third.dispose('preview-test');
  await assert.rejects(
    third.invokeAction({command: 'wait', target: null, args: {seconds: 0}}),
    /disposed/u,
  );
  assert.equal(log.filter((entry) => entry[0] === 'media.create').length, 3);
  assert.equal(log.filter((entry) => entry[0] === 'media.release-all').length, 3);
});

test('requires and wires one shared debug coordinator for flagged preview sessions', async () => {
  const project = await packagedProject();
  const runtimeComponent = await loadDsl4RuntimeComponent(project, frontend, {
    ...limits,
    subtleCrypto,
  });
  assert.equal(runtimeComponent.ok, true, JSON.stringify(runtimeComponent.diagnostics));
  const featureFlags = {
    dsl4Runtime: true,
    dsl4AppShell: true,
    dsl4WebPreviewAdapter: true,
    dsl4PreviewReloadOverlay: true,
    dsl4Debugger: true,
  };
  assert.throws(
    () =>
      createDsl4TurboWarpPreviewSessionFactory({
        featureFlags,
        runtimeComponent,
        ...platformFixture([]),
        resetManagedPresentation() {},
      }),
    /debugExecution is required/u,
  );

  const debugExecution = createDsl4DebugExecutionCoordinator({enabled: true});
  const createSession = createDsl4TurboWarpPreviewSessionFactory({
    featureFlags,
    debugExecution,
    runtimeComponent,
    ...platformFixture([]),
    resetManagedPresentation() {},
  });
  const session = await createSession({
    storyDocument: componentStory(runtimeComponent),
    previousSession: null,
    preserveManagedPresentation: false,
  });
  assert.equal(reported(await session.start(), 'the session state').status, 'finished');
  await session.dispose('debug-preview-test');
  debugExecution.dispose();
});

test('resolves a generation-specific runtime component before creating a preview session', async () => {
  const project = await packagedProject();
  const runtimeComponent = await loadDsl4RuntimeComponent(project, frontend, {
    ...limits,
    subtleCrypto,
  });
  assert.equal(runtimeComponent.ok, true, JSON.stringify(runtimeComponent.diagnostics));
  const changed = frontend.parse(waitStory.replace('wait: 0', 'wait: 0.001'), {
    sourceId: 'main',
  });
  assert(changed.ok, `expected the changed story to parse: ${JSON.stringify(changed.diagnostics)}`);
  const resolved: Readonly<Record<string, unknown>>[] = [];
  const createSession = createDsl4TurboWarpPreviewSessionFactory({
    featureFlags: {dsl4Runtime: true},
    runtimeComponent,
    ...platformFixture([]),
    resetManagedPresentation() {},
    resolveRuntimeComponent(context: Readonly<Record<string, unknown>>) {
      resolved.push(context);
      return {
        ...requireRecord(context.baseComponent, 'the base component'),
        storyDocument: context.storyDocument,
      };
    },
  });

  const session = await createSession({
    storyDocument: changed.storyDocument,
    previousSession: null,
    preserveManagedPresentation: false,
  });
  await session.start();
  assert.equal(resolved.length, 1);
  const firstResolution = requireDefined(resolved[0], 'the resolved component context');
  assert.equal(firstResolution.storyDocument, changed.storyDocument);
  assert.equal(firstResolution.baseComponent, runtimeComponent);
  await session.dispose('generation-component-test');
});

test('provides the DSL 3.2 transition port to browser preview sessions by default', async () => {
  const project = await packagedProject();
  const runtimeComponent = await loadDsl4RuntimeComponent(project, frontend, {
    ...limits,
    subtleCrypto,
  });
  assert.equal(runtimeComponent.ok, true, JSON.stringify(runtimeComponent.diagnostics));
  const transitionSource = frontend.parse(
    `
kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - transition:
        effect: fadeOut
        seconds: 0
`,
    {sourceId: 'main'},
  );
  assert.equal(transitionSource.ok, true, JSON.stringify(transitionSource.diagnostics));
  const log: LogEntry[] = [];
  const createSession = createDsl4TurboWarpPreviewSessionFactory({
    featureFlags: {dsl4Runtime: true},
    runtimeComponent,
    ...platformFixture(log),
    resetManagedPresentation() {},
  });
  const session = await createSession({
    storyDocument: transitionSource.storyDocument,
    previousSession: null,
    preserveManagedPresentation: false,
  });
  await session.start();
  assert.deepEqual(
    log.filter(([event]) => event === 'stage.effect'),
    [['stage.effect', 'brightness', -100]],
  );
  await session.dispose('preview-transition-test');
});

test('attaches browser preview key and stage pointer input for the owned session lifetime', async () => {
  const project = await packagedProject();
  const runtimeComponent = await loadDsl4RuntimeComponent(project, frontend, {
    ...limits,
    subtleCrypto,
  });
  assert.equal(runtimeComponent.ok, true, JSON.stringify(runtimeComponent.diagnostics));
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const target = {
    addEventListener(type: string, listener: (event: unknown) => void) {
      const values = listeners.get(type) ?? new Set();
      values.add(listener);
      listeners.set(type, values);
    },
    removeEventListener(type: string, listener: (event: unknown) => void) {
      listeners.get(type)?.delete(listener);
    },
  };
  const createSession = createDsl4TurboWarpPreviewSessionFactory({
    featureFlags: {dsl4Runtime: true, dsl4SpeechAdvanceTypewriter: true},
    runtimeComponent,
    ...platformFixture([]),
    inputTarget: target,
    stagePointerTarget: target,
    resetManagedPresentation() {},
  });
  const session = await createSession({
    storyDocument: componentStory(runtimeComponent),
    previousSession: null,
    preserveManagedPresentation: false,
  });

  await session.start();
  assert.equal(listeners.get('keydown')?.size, 1);
  assert.equal(listeners.get('pointerup')?.size, 1);
  await session.dispose('input-owner-test');
  assert.equal(listeners.get('keydown')?.size, 0);
  assert.equal(listeners.get('pointerup')?.size, 0);
});

test('releases a preview environment when browser input attachment fails', async () => {
  const project = await packagedProject();
  const runtimeComponent = await loadDsl4RuntimeComponent(project, frontend, {
    ...limits,
    subtleCrypto,
  });
  assert.equal(runtimeComponent.ok, true, JSON.stringify(runtimeComponent.diagnostics));
  const log: LogEntry[] = [];
  const createSession = createDsl4TurboWarpPreviewSessionFactory({
    featureFlags: {dsl4Runtime: true},
    runtimeComponent,
    ...platformFixture(log),
    inputTarget: {},
    resetManagedPresentation() {},
  });
  const session = await createSession({
    storyDocument: componentStory(runtimeComponent),
    previousSession: null,
    preserveManagedPresentation: false,
  });

  await assert.rejects(() => session.start(), /input target/u);
  assert.equal(log.filter((entry) => entry[0] === 'media.release-all').length, 1);
  assert.equal(log.filter((entry) => entry[0] === 'pose.release-all').length, 1);
});

test('fails closed before inspecting preview artifacts while the runtime flag is disabled', () => {
  assert.throws(
    () =>
      createDsl4TurboWarpPreviewSessionFactory({
        featureFlags: {dsl4Runtime: false},
        runtimeComponent: unreadDependency('component'),
        resetManagedPresentation: new Proxy(() => {}, {
          get: () => assert.fail('reset callback must not be read'),
        }),
      }),
    /dsl4Runtime feature flag/u,
  );
});

test('releases a preview environment when the wire StoryDocument rejects navigation creation', async () => {
  const project = await packagedProject();
  const runtimeComponent = await loadDsl4RuntimeComponent(project, frontend, {
    ...limits,
    subtleCrypto,
  });
  assert.equal(runtimeComponent.ok, true, JSON.stringify(runtimeComponent.diagnostics));
  const incompatible = frontend.parse(waitStory.replace('production:', 'author-preview:'), {
    sourceId: 'main',
  });
  assert.equal(incompatible.ok, true, JSON.stringify(incompatible.diagnostics));
  const log: LogEntry[] = [];
  const createSession = createDsl4TurboWarpPreviewSessionFactory({
    featureFlags: {dsl4Runtime: true},
    runtimeComponent,
    ...platformFixture(log),
    resetManagedPresentation() {},
  });

  const rejected = await createSession({
    storyDocument: incompatible.storyDocument,
    previousSession: null,
    preserveManagedPresentation: false,
  });
  assert.equal(log.length, 0);
  await assert.rejects(() => rejected.start(), /incompatible with the base runtime/u);
  assert.equal(log.filter((entry) => entry[0] === 'media.create').length, 1);
  assert.equal(log.filter((entry) => entry[0] === 'media.release-all').length, 1);
  assert.equal(log.filter((entry) => entry[0] === 'pose.release-all').length, 1);
});

test('disposes an unstarted preview candidate without allocating platform resources', async () => {
  const project = await packagedProject();
  const runtimeComponent = await loadDsl4RuntimeComponent(project, frontend, {
    ...limits,
    subtleCrypto,
  });
  assert.equal(runtimeComponent.ok, true, JSON.stringify(runtimeComponent.diagnostics));
  const log: LogEntry[] = [];
  let resetCount = 0;
  const createSession = createDsl4TurboWarpPreviewSessionFactory({
    featureFlags: {dsl4Runtime: true},
    runtimeComponent,
    ...platformFixture(log),
    resetManagedPresentation() {
      resetCount += 1;
    },
  });
  const candidate = await createSession({
    storyDocument: componentStory(runtimeComponent),
    previousSession: {},
    preserveManagedPresentation: false,
  });

  await candidate.dispose('deferred-candidate');
  assert.equal(resetCount, 0);
  assert.deepEqual(log, []);
  assert.equal(candidate.getState().disposed, true);
});

test('cancels preview initialization after reset without creating a late environment', async () => {
  const project = await packagedProject();
  const runtimeComponent = await loadDsl4RuntimeComponent(project, frontend, {
    ...limits,
    subtleCrypto,
  });
  assert.equal(runtimeComponent.ok, true, JSON.stringify(runtimeComponent.diagnostics));
  const log: LogEntry[] = [];
  const resetStarted = deferred<void>();
  let resetCalls = 0;
  let finishReset: (() => void) | undefined;
  const reset = new Promise<void>((resolve) => {
    finishReset = resolve;
  });
  const createSession = createDsl4TurboWarpPreviewSessionFactory({
    featureFlags: {dsl4Runtime: true},
    runtimeComponent,
    ...platformFixture(log),
    resetManagedPresentation() {
      resetCalls++;
      resetStarted.resolve();
      return reset;
    },
  });
  const candidate = await createSession({
    storyDocument: componentStory(runtimeComponent),
    previousSession: null,
    preserveManagedPresentation: false,
  });
  const run = candidate.start();
  await resetStarted.promise;
  let disposed = false;
  const disposal = candidate.dispose('page-close').then(() => {
    disposed = true;
  });
  await Promise.resolve();
  assert.equal(disposed, false);
  assert.equal(resetCalls, 1);
  requireDefined<() => void>(finishReset, 'the reset gate')();

  await assert.rejects(() => run, /disposed/u);
  await disposal;
  assert.deepEqual(log, []);
  assert.equal(candidate.getState().disposed, true);
});

test('withholds every platform dependency until the packaged component validates', async () => {
  const log: LogEntry[] = [];
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(createDsl4EmptyProject(), platformFixture(log), {
      createRuntimeExpressionComposition() {
        log.push(['expression.create']);
        return {evaluateCondition() {}, releaseAll() {}};
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(diagnosticAt(result, 0).code, 'K4-SOURCE-CHANNEL-MISSING');
  assert.equal(result.host, null);
  assert.deepEqual(log, []);
});

test('selects the startup-fixed Scratch consumer and reserves host observers for presenter mode', async () => {
  const project = await packagedProject();
  const disabledLog: LogEntry[] = [];
  const disabledOptions = enabledOptions(project, platformFixture(disabledLog));
  Object.defineProperty(disabledOptions, 'onPoseState', {
    get() {
      assert.fail('disabled pose feedback must not inspect its observer');
    },
  });
  Object.defineProperty(disabledOptions, 'poseFeedbackPresenter', {
    get() {
      assert.fail('disabled pose feedback must not inspect its presenter');
    },
  });
  const disabled = await createDsl4TurboWarpRuntimeHost(disabledOptions);
  assert.equal(disabled.ok, true, JSON.stringify(disabled.diagnostics));
  await hostOf(disabled).dispose('feedback-disabled');

  const scratchBindingSource = `
kamishibai: '4.0'
assets:
  Tick: sound
  Charge: sound
recognition:
  idleSound: Tick
  chargeSound: Charge
  feedback:
    mode: scratchBinding
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - wait: 0
`;
  const scratchProject = await packagedProject(scratchBindingSource);
  const scratchFixture = platformFixture([]);
  scratchFixture.poseConfidence.value = 75;
  scratchFixture.poseProgress.value = 50;
  const scratchOptions = enabledOptions(scratchProject, scratchFixture, {
    featureFlags: {dsl4Runtime: true, dsl4PoseFeedbackModes: true},
  });
  Object.defineProperty(scratchOptions, 'onPoseState', {
    get() {
      assert.fail('Scratch feedback must not inspect a presenter observer');
    },
  });
  Object.defineProperty(scratchOptions, 'poseFeedbackPresenter', {
    get() {
      assert.fail('Scratch feedback must not inspect DOM presenter options');
    },
  });
  const scratch = await createDsl4TurboWarpRuntimeHost(scratchOptions);
  assert.equal(scratch.ok, true, JSON.stringify(scratch.diagnostics));
  await hostOf(scratch).dispose('scratch-feedback-enabled');
  assert.equal(scratchFixture.poseConfidence.value, 0);
  assert.equal(scratchFixture.poseProgress.value, 0);

  const presenterSource = `
kamishibai: '4.0'
assets:
  Tick: sound
  Charge: sound
recognition:
  idleSound: Tick
  chargeSound: Charge
  feedback:
    mode: presenter
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - wait: 0
`;
  const presenterProject = await packagedProject(presenterSource);
  await assert.rejects(
    createDsl4TurboWarpRuntimeHost(
      enabledOptions(presenterProject, platformFixture([]), {
        featureFlags: {dsl4Runtime: true, dsl4PoseFeedbackModes: true},
      }),
    ),
    /onPoseState/u,
  );
  const presenterDocument = createFakeDocument();
  const presenter = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(presenterProject, platformFixture([]), {
      featureFlags: {dsl4Runtime: true, dsl4PoseFeedbackModes: true},
      poseFeedbackPresenter: {container: presenterDocument.body},
    }),
  );
  assert.equal(presenter.ok, true, JSON.stringify(presenter.diagnostics));
  assert.equal(
    presented(
      findByDataset(presenterDocument.body, 'dsl4PoseFeedback', 'true'),
      'the dsl4PoseFeedback element',
    ).hidden,
    true,
  );
  assert.ok(findByDataset(presenterDocument.body, 'dsl4PoseFeedbackStatus', 'true'));
  await hostOf(presenter).dispose('presenter-feedback-enabled');
  assert.equal(presenterDocument.body.children.length, 0);
});

test('renders presenter pose lifecycle and isolates its additional developer observer', async () => {
  const project = await packagedPoseProject(`
kamishibai: '4.0'
assets:
  Tick: sound
  Charge: sound
  HeroIdle: costume:Hero
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
actors:
  Hero: HeroIdle
recognition:
  idleSound: Tick
  chargeSound: Charge
  sequence:
    confidenceThreshold: 0.5
    fullConfidenceHoldSeconds: 1
    idleChargePerSecond: 0
  feedback:
    mode: presenter
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  rescue:
    recognitionModel: RescuePose
    actions:
      - Hero.pose:
          steps:
            - pose: help
`);
  const fixture = platformFixture([]);
  const document = createFakeDocument();
  const phases: unknown[] = [];
  let confidence = 0;
  let now = 0;
  let scheduled: (() => void) | null = null;
  fixture.tmComposition.registerPoseModel = ({name}: {name: unknown}) => ({
    name,
    labels: ['help'],
  });
  fixture.tmComposition.confidenceOf = () => confidence;
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      featureFlags: {dsl4Runtime: true, dsl4PoseFeedbackModes: true},
      poseFeedbackPresenter: {container: document.body},
      onPoseState(event: Readonly<Record<string, unknown>>) {
        phases.push(event.phase);
        if (event.phase === 'charging') throw new Error('developer observer failed');
      },
      poseNow: () => now,
      poseSchedule(callback: () => void) {
        scheduled = callback;
        return () => {
          if (scheduled === callback) scheduled = null;
        };
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const root = presented(
    findByDataset(document.body, 'dsl4PoseFeedback', 'true'),
    'the pose feedback root',
  );
  const status = presented(
    findByDataset(document.body, 'dsl4PoseFeedbackStatus', 'true'),
    'the pose feedback status',
  );

  const run = hostOf(result).start();
  for (let attempts = 0; attempts < 50 && scheduled === null; attempts += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(typeof scheduled, 'function');
  assert.equal(root.hidden, false);
  assert.equal(root.dataset.phase, 'waiting');
  assert.match(status.textContent, /Waiting for pose: Hero \/ help \/ Step 1/u);

  confidence = 1;
  now = 1000;
  requireDefined<() => void>(scheduled, 'the scheduled pose tick')();
  assert.equal(reported(await run, 'the runtime state').status, 'finished');
  assert.deepEqual(phases, ['waiting', 'charging', 'completed']);
  assert.equal(root.hidden, true);
  assert.match(status.textContent, /Pose completed/u);

  confidence = 0;
  now = 2000;
  scheduled = null;
  const stoppedRun = hostOf(result).start();
  for (let attempts = 0; attempts < 50 && scheduled === null; attempts += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(typeof scheduled, 'function');
  assert.equal(root.hidden, false);
  assert.equal(root.dataset.phase, 'waiting');
  assert.equal(
    reported(hostOf(result).stop('presenter-stop'), 'the stopped state').status,
    'stopped',
  );
  await stoppedRun;
  assert.deepEqual(phases.slice(-2), ['waiting', 'cancelled']);
  assert.equal(root.hidden, true);
  assert.match(status.textContent, /Pose cancelled/u);
  for (const row of root.children.filter((child) => child.tagName === 'DIV')) {
    assert.equal(requireDefined(row.children[1], 'the row value cell').value, 0);
  }

  await hostOf(result).dispose('presenter-lifecycle');
  assert.equal(document.body.children.length, 0);
});

test('owns one background camera from story start through the final pose action', async () => {
  const project = await packagedPoseProject(`
kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
actors:
  Hero: HeroIdle
recognition:
  sequence:
    confidenceThreshold: 0.5
    fullConfidenceHoldSeconds: 0.1
    idleChargePerSecond: 0
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  first:
    recognitionModel: RescuePose
    actions:
      - Hero.pose:
          steps:
            - pose: help
  second:
    recognitionModel: RescuePose
    actions:
      - Hero.pose:
          steps:
            - pose: help
`);
  const log: LogEntry[] = [];
  const fixture = platformFixture(log);
  let cameraRunning = false;
  let previewVisible = true;
  let previewOpacity: number = 0.6;
  let previewPosition: string = 'bottom-right';
  let recognizing = false;
  let activeModel: unknown = null;
  let now = 0;
  const scheduled: (() => void)[] = [];
  fixture.tmComposition.registerPoseModel = ({name}: {name: unknown}) => ({
    name,
    labels: ['help'],
  });
  fixture.tmComposition.activatePoseModel = (name: unknown) => {
    activeModel = name;
  };
  fixture.tmComposition.getActivePoseModelName = () => activeModel;
  fixture.tmComposition.startCamera = async () => {
    assert.equal(previewVisible, false, 'story camera startup must keep preview hidden');
    assert.equal(previewOpacity, 0.2, 'story camera must preserve the DSL 3.2 preview opacity');
    assert.equal(previewPosition, 'full-stage', 'story camera must prepare full-stage preview');
    log.push(['camera.start']);
    cameraRunning = true;
  };
  fixture.tmComposition.stopCamera = () => {
    log.push(['camera.stop']);
    cameraRunning = false;
  };
  fixture.tmComposition.isCameraRunning = () => cameraRunning;
  fixture.tmComposition.showPreview = () => {
    assert.equal(cameraRunning, true, 'preview must not appear before the story camera is ready');
    log.push(['preview.show']);
    previewVisible = true;
  };
  fixture.tmComposition.hidePreview = () => {
    log.push(['preview.hide']);
    previewVisible = false;
  };
  fixture.tmComposition.isPreviewVisible = () => previewVisible;
  fixture.tmComposition.setPreviewOpacity = (opacity: number) => {
    log.push(['preview.opacity', opacity]);
    previewOpacity = opacity;
  };
  fixture.tmComposition.setPreviewPosition = (position: string) => {
    log.push(['preview.position', position]);
    previewPosition = position;
  };
  fixture.tmComposition.startRecognition = async () => {
    assert.equal(cameraRunning, true, 'recognition must reuse the story-owned camera');
    log.push(['recognition.start']);
    recognizing = true;
  };
  fixture.tmComposition.stopRecognition = () => {
    log.push(['recognition.stop']);
    recognizing = false;
  };
  fixture.tmComposition.isRecognizing = () => recognizing;
  fixture.tmComposition.confidenceOf = () => 1;

  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      poseNow: () => now,
      poseSchedule(callback: () => void) {
        scheduled.push(callback);
        return () => {
          const index = scheduled.indexOf(callback);
          if (index >= 0) scheduled.splice(index, 1);
        };
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));

  const run = hostOf(result).start();
  for (let attempt = 0; attempt < 50 && scheduled.length === 0; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(log.filter(([event]) => event === 'camera.start').length, 1);
  assert.equal(
    log.some(([event]) => event === 'camera.stop'),
    false,
  );
  now += 1000;
  requireDefined(scheduled.shift(), 'the scheduled pose tick')();
  for (let attempt = 0; attempt < 50 && scheduled.length === 0; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(log.filter(([event]) => event === 'preview.hide').length, 2);
  assert.equal(
    log.some(([event]) => event === 'camera.stop'),
    false,
  );
  now += 1000;
  requireDefined(scheduled.shift(), 'the scheduled pose tick')();

  assert.equal(reported(await run, 'the runtime state').status, 'finished');
  assert.deepEqual(
    log.filter(([event]) => ['camera.start', 'camera.stop'].includes(event)),
    [['camera.start'], ['camera.stop']],
  );
  assert.equal(log.filter(([event]) => event === 'preview.show').length, 2);
  assert.equal(log.filter(([event]) => event === 'preview.hide').length, 3);
  assert.deepEqual(
    log.filter(([event]) => event === 'preview.opacity'),
    [['preview.opacity', 0.2]],
  );
  assert.equal(
    log
      .filter(([event]) => event === 'preview.position')
      .every(([, position]) => position === 'full-stage'),
    true,
  );
  assert.equal(cameraRunning, false);
  assert.equal(previewVisible, false);
  assert.equal(previewOpacity, 0.2);
  assert.equal(recognizing, false);
  await hostOf(result).dispose('story-camera-finished');
});

test('does not request a camera for a story without a pose recognition action', async () => {
  const project = await packagedProject(waitStory);
  const log: LogEntry[] = [];
  const fixture = platformFixture(log);
  fixture.tmComposition.startCamera = async () => log.push(['camera.start']);
  fixture.tmComposition.stopCamera = () => log.push(['camera.stop']);
  const result = await createDsl4TurboWarpRuntimeHost(enabledOptions(project, fixture));
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));

  assert.equal(reported(await hostOf(result).start(), 'the runtime state').status, 'finished');
  await hostOf(result).dispose('story-without-pose');
  assert.deepEqual(
    log.filter(([event]) => event.startsWith('camera.')),
    [],
  );
});

test('shows Scratch pose monitors and skips one pose step per navigation command', async () => {
  const project = await packagedPoseProject(`
kamishibai: '4.0'
assets:
  Tick: sound
  Charge: sound
  HeroIdle: costume:Hero
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
actors:
  Hero: HeroIdle
recognition:
  idleSound: Tick
  chargeSound: Charge
  feedback:
    mode: scratchMirror
  navigation:
    allowSkip: true
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  rescue:
    recognitionModel: RescuePose
    actions:
      - Hero.pose:
          steps:
            - pose: help
            - pose: help
`);
  const log: LogEntry[] = [];
  const events: Readonly<Record<string, unknown>>[] = [];
  const fixture = platformFixture(log);
  let now = 0;
  const scheduled: (() => void)[] = [];
  const pendingChargeSound = new Promise(() => {});
  fixture.tmComposition.registerPoseModel = ({name}: {name: unknown}) => ({
    name,
    labels: ['help'],
  });
  fixture.tmComposition.confidenceOf = () => 1;
  fixture.assetManagerComposition.playSound = (name: unknown, playOptions: unknown) => {
    log.push(['media.play', name, playOptions]);
    if (name === 'Charge') return pendingChargeSound;
    return undefined;
  };
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      featureFlags: {dsl4Runtime: true, dsl4PoseFeedbackModes: true},
      onEvent: (event: Readonly<Record<string, unknown>>) => events.push(event),
      poseNow: () => now,
      poseSchedule(callback: () => void) {
        scheduled.push(callback);
        return () => {
          const index = scheduled.indexOf(callback);
          if (index >= 0) scheduled.splice(index, 1);
        };
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));

  const run = hostOf(result).start();
  for (
    let attempts = 0;
    attempts < 50 &&
    !requireDefined(fixture.monitorRecords.get(fixture.poseConfidence.id), 'the confidence monitor')
      .visible;
    attempts += 1
  ) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(
    requireDefined(fixture.monitorRecords.get(fixture.poseConfidence.id), 'the confidence monitor')
      .visible,
    true,
  );
  assert.equal(
    requireDefined(fixture.monitorRecords.get(fixture.poseProgress.id), 'the progress monitor')
      .visible,
    true,
  );
  for (let attempts = 0; attempts < 50 && scheduled.length === 0; attempts += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  now += 100;
  requireDefined(scheduled.shift(), 'the scheduled pose tick')();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    log.some(([method, name]) => method === 'media.play' && name === 'Charge'),
    true,
  );

  const firstSpace = {
    code: 'Space',
    repeat: false,
    preventDefault() {},
    stopPropagation() {},
  };
  assert.equal(hostOf(result).handleKeyDown(firstSpace), true);
  for (
    let attempts = 0;
    attempts < 50 && events.filter(({type}) => type === 'pose.step.skip').length < 1;
    attempts += 1
  ) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(
    reported(reported(hostOf(result).getState(), 'the host state').runtime, 'its runtime state')
      .actionIndex,
    0,
  );
  assert.equal(
    requireDefined(fixture.monitorRecords.get(fixture.poseConfidence.id), 'the confidence monitor')
      .visible,
    true,
  );
  assert.equal(
    requireDefined(fixture.monitorRecords.get(fixture.poseProgress.id), 'the progress monitor')
      .visible,
    true,
  );

  const secondSpace = {
    code: 'Space',
    repeat: false,
    preventDefault() {},
    stopPropagation() {},
  };
  assert.equal(hostOf(result).handleKeyDown(secondSpace), true);
  assert.equal(reported(await run, 'the runtime state').status, 'finished');
  assert.deepEqual(
    events
      .filter(({type}) => type === 'pose.step.skip')
      .map(({details}) => requireRecord(details, 'the event details').stepIndex),
    [0, 1],
  );
  assert.equal(events.filter(({type}) => type === 'action.cancel').length, 0);
  assert.equal(fixture.poseConfidence.value, 0);
  assert.equal(fixture.poseProgress.value, 0);
  assert.equal(
    requireDefined(fixture.monitorRecords.get(fixture.poseConfidence.id), 'the confidence monitor')
      .visible,
    false,
  );
  assert.equal(
    requireDefined(fixture.monitorRecords.get(fixture.poseProgress.id), 'the progress monitor')
      .visible,
    false,
  );

  await hostOf(result).dispose('pose-step-skip');
});

test('keeps the Standard app shell inert when its startup flag is disabled', async () => {
  let runtimeHostCalls = 0;
  const options = {
    featureFlags: {dsl4Runtime: true, dsl4AppShell: false},
    createRuntimeHost() {
      runtimeHostCalls += 1;
      assert.fail('the disabled Standard app shell must not create a runtime host');
    },
  };
  for (const key of ['surface', 'document', 'mount', 'runtimeHostOptions']) {
    Object.defineProperty(options, key, {
      get() {
        assert.fail(`the disabled Standard app shell must not inspect ${key}`);
      },
    });
  }

  const shell = await createDsl4StandardAppShell(options);
  assert.equal(shell.ok, true);
  assert.equal(shell.enabled, false);
  assert.equal(shell.element, null);
  assert.equal(shell.runtimeHost, null);
  assert.equal(runtimeHostCalls, 0);
  assert.equal(reported(await shell.dispose(), 'the session state').enabled, false);
});

test('shares one lazy pose feedback shell across every Standard delivery surface', async () => {
  const presenterProject = await packagedProject(`
kamishibai: '4.0'
assets:
  Tick: sound
  Charge: sound
recognition:
  idleSound: Tick
  chargeSound: Charge
  feedback:
    mode: presenter
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - wait: 0
`);
  const surfaces: AppShellSurface[] = [
    'webPlayer',
    'regularEditor',
    'packager',
    'developmentPreview',
  ];
  for (const surface of surfaces) {
    const document = createFakeDocument();
    const shell = await createDsl4StandardAppShell({
      featureFlags: {
        dsl4Runtime: true,
        dsl4AppShell: true,
        dsl4PoseFeedbackModes: true,
      },
      surface,
      document,
      mount: document.body,
      runtimeHostOptions: {
        project: presenterProject,
        sourceFrontend: frontend,
        ...limits,
        subtleCrypto,
        ...platformFixture([]),
      },
    });
    assert.equal(shell.ok, true, JSON.stringify(shell.diagnostics));
    assert.equal(shell.enabled, true);
    assert.equal(shell.surface, surface);
    assert.equal(appShellRoot(shell).getAttribute('data-dsl4-app-shell'), 'standard');
    assert.equal(appShellRoot(shell).getAttribute('data-dsl4-surface'), surface);
    assert.ok(findByDataset(appShellRoot(shell), 'dsl4PoseFeedback', 'true'));
    assert.equal(shellSnapshot(shell).poseFeedbackMounted, true);

    await shell.dispose(`surface-${surface}`);
    assert.equal(document.body.children.length, 0);
    assert.equal(shell.element, null);
    assert.equal(shell.getSnapshot().disposed, true);
  }
});

test('does not inspect or create Standard shell DOM for Scratch feedback mode', async () => {
  const project = await packagedProject();
  const options: AppShellOptions = {
    featureFlags: {
      dsl4Runtime: true,
      dsl4AppShell: true,
      dsl4PoseFeedbackModes: true,
    },
    surface: 'webPlayer',
    runtimeHostOptions: {
      project,
      sourceFrontend: frontend,
      ...limits,
      subtleCrypto,
      ...platformFixture([]),
    },
  };
  for (const key of ['document', 'mount', 'poseFeedbackLabels']) {
    Object.defineProperty(options, key, {
      get() {
        assert.fail(`Scratch feedback must not inspect Standard shell ${key}`);
      },
    });
  }

  const shell = await createDsl4StandardAppShell(options);
  assert.equal(shell.ok, true, JSON.stringify(shell.diagnostics));
  assert.equal(shell.element, null);
  assert.equal(shellSnapshot(shell).poseFeedbackMounted, false);
  await shell.dispose('scratch-mode');
});

test('rejects malformed Standard runtime results and cleans partial host and DOM ownership', async () => {
  const document = createFakeDocument();
  const cleanupReasons: unknown[] = [];
  await assert.rejects(
    createDsl4StandardAppShell(
      invalidAppShellOptions({
        featureFlags: {dsl4Runtime: true, dsl4AppShell: true},
        surface: 'webPlayer',
        document,
        mount: document.body,
        runtimeHostOptions: {},
        createRuntimeHost(options: Record<string, unknown>) {
          void requireRecord(options.poseFeedbackPresenter, 'the presenter').container;
          return {
            ok: 'yes',
            enabled: true,
            host: {
              dispose(reason: unknown) {
                cleanupReasons.push(reason);
              },
            },
            diagnostics: [],
          };
        },
      }),
    ),
    /valid enabled runtime host result/u,
  );
  assert.deepEqual(cleanupReasons, ['invalid-standard-app-shell-result']);
  assert.equal(document.body.children.length, 0);

  await assert.rejects(
    createDsl4StandardAppShell({
      featureFlags: {dsl4Runtime: true, dsl4AppShell: true},
      surface: 'webPlayer',
      runtimeHostOptions: {featureFlags: {}},
    }),
    /cannot override Standard app-shell option: featureFlags/u,
  );
});

test('resets Scratch pose feedback before awaiting normal environment cleanup', async () => {
  const project = await packagedProject();
  const fixture = platformFixture([]);
  let finishHostPortCleanup: (() => void) | null = null;
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      featureFlags: {dsl4Runtime: true, dsl4PoseFeedbackModes: true},
      createHostPort() {
        return {
          dispose() {
            return new Promise<void>((resolve) => {
              finishHostPortCleanup = resolve;
            });
          },
        };
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  fixture.poseConfidence.value = 75;
  fixture.poseProgress.value = 50;

  const disposal = hostOf(result).dispose('pending-environment-cleanup');
  while (!finishHostPortCleanup) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.poseConfidence.value, 0);
  assert.equal(fixture.poseProgress.value, 0);

  requireDefined<() => void>(finishHostPortCleanup, 'the cleanup gate')();
  await disposal;
});

test('resets Scratch pose feedback before awaiting partial-creation cleanup', async () => {
  const project = await packagedProject();
  const fixture = platformFixture([]);
  fixture.poseConfidence.value = 75;
  fixture.poseProgress.value = 50;
  let finishHostPortCleanup: (() => void) | null = null;
  const rejection = assert.rejects(
    createDsl4TurboWarpRuntimeHost(
      enabledOptions(project, fixture, {
        featureFlags: {dsl4Runtime: true, dsl4PoseFeedbackModes: true},
        createHostPort() {
          return {
            stage() {},
            dispose() {
              return new Promise<void>((resolve) => {
                finishHostPortCleanup = resolve;
              });
            },
          };
        },
      }),
    ),
    (error) => thrown(error).code === 'K4-HOST-PORT-COLLISION',
  );

  while (!finishHostPortCleanup) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.poseConfidence.value, 0);
  assert.equal(fixture.poseProgress.value, 0);

  requireDefined<() => void>(finishHostPortCleanup, 'the cleanup gate')();
  await rejection;
});

test('continues environment cleanup and aggregates a Scratch reset failure', async () => {
  const project = await packagedProject();
  const log: LogEntry[] = [];
  const fixture = platformFixture(log);
  let progress = 0;
  let rejectReset = false;
  Object.defineProperty(fixture.poseProgress, 'value', {
    configurable: true,
    get() {
      return progress;
    },
    set(value) {
      if (rejectReset && value === 0) throw new Error('Scratch reset failed');
      progress = value;
    },
  });
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      featureFlags: {dsl4Runtime: true, dsl4PoseFeedbackModes: true},
      createHostPort() {
        return {
          dispose() {
            log.push(['host-port.dispose']);
          },
        };
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  fixture.poseConfidence.value = 75;
  fixture.poseProgress.value = 50;
  rejectReset = true;

  await assert.rejects(hostOf(result).dispose('reset-failure'), (error) => {
    assert.equal(error instanceof AggregateError, true);
    return true;
  });
  assert.equal(log.filter(([event]) => event === 'host-port.dispose').length, 1);
  assert.equal(log.filter(([event]) => event === 'svg.release-all').length, 1);
  assert.equal(log.filter(([event]) => event === 'pose.release-all').length, 1);
  assert.equal(log.filter(([event]) => event === 'media.release-all').length, 1);
});

test('resets Scratch pose feedback before awaiting a pending remote cache lease release', async () => {
  const cacheIdentity = {
    id: 'resetlease000001',
    label: 'story.kamishibai.yaml',
    databaseName: 'tw-kamishibai-assets-v1--story--resetlease000001',
  };
  const verifiedRemoteWaitStory = waitStory.replace(
    'controls:',
    `assets:
  CacheLeaseProbe:
    kind: sound
    delivery: remote
    source:
      url: https://cdn.example.com/cache-lease-probe.ogg
      integrity: sha256-0000000000000000000000000000000000000000000000000000000000000000
      contentType: audio/ogg
      size: 1
controls:`,
  );
  const project = await packagedProject(verifiedRemoteWaitStory, {cacheIdentity});
  const fixture = platformFixture([]);
  fixture.poseConfidence.value = 75;
  fixture.poseProgress.value = 50;
  const createAssetManagerComposition = fixture.createAssetManagerComposition;
  let releaseCalls = 0;
  let finishFirstRelease: (() => void) | null = null;
  fixture.createAssetManagerComposition = (...args) => {
    const composition = createAssetManagerComposition(...args);
    return {
      ...composition,
      releaseVerifiedRemoteStoryCacheLease() {
        releaseCalls += 1;
        if (releaseCalls > 1) return Promise.resolve();
        return new Promise<void>((resolve) => {
          finishFirstRelease = resolve;
        });
      },
    };
  };
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      featureFlags: {dsl4Runtime: true, dsl4PoseFeedbackModes: true},
      loadRemoteAsset: async () => assert.fail('unused remote asset must not load'),
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));

  const disposal = hostOf(result).dispose('pending-cache-release');
  while (!finishFirstRelease) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.poseConfidence.value, 0);
  assert.equal(fixture.poseProgress.value, 0);
  assert.equal(
    requireDefined(fixture.monitorRecords.get(fixture.poseConfidence.id), 'the confidence monitor')
      .visible,
    false,
  );
  assert.equal(
    requireDefined(fixture.monitorRecords.get(fixture.poseProgress.id), 'the progress monitor')
      .visible,
    false,
  );

  requireDefined<() => void>(finishFirstRelease, 'the pending gate')();
  await disposal;
  assert.equal(releaseCalls, 2);
});

test('applies scene pose preview mirroring only through its startup-fixed feature gate', async () => {
  const project = await packagedProject(posePreviewStory);

  const disabledLog: LogEntry[] = [];
  const disabledFixture = platformFixture(disabledLog);
  const disabledCreateTM = disabledFixture.createTMComposition;
  disabledFixture.createTMComposition = (...args) => {
    const composition = disabledCreateTM(...args);
    delete composition.setPreviewMirroring;
    Object.defineProperty(composition, 'setPreviewMirroring', {
      get() {
        assert.fail('disabled host must not inspect the TM mirroring method');
      },
    });
    return composition;
  };
  const disabled = await createDsl4TurboWarpRuntimeHost(enabledOptions(project, disabledFixture));
  assert.equal(disabled.ok, true, JSON.stringify(disabled.diagnostics));
  assert.equal(reported(await hostOf(disabled).start(), 'the runtime state').status, 'finished');
  assert.equal(
    disabledLog.some(([event]) => event === 'pose.preview-mirroring'),
    false,
  );
  await hostOf(disabled).dispose('pose-preview-disabled');

  const missingFixture = platformFixture([]);
  const missingCreateTM = missingFixture.createTMComposition;
  missingFixture.createTMComposition = (...args) => {
    const composition = missingCreateTM(...args);
    delete composition.setPreviewMirroring;
    return composition;
  };
  await assert.rejects(
    createDsl4TurboWarpRuntimeHost(
      enabledOptions(project, missingFixture, {
        featureFlags: {dsl4Runtime: true, dsl4PosePreviewMirroring: true},
      }),
    ),
    /setPreviewMirroring/u,
  );

  const enabledLog: LogEntry[] = [];
  const enabled = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, platformFixture(enabledLog), {
      featureFlags: {dsl4Runtime: true, dsl4PosePreviewMirroring: true},
    }),
  );
  assert.equal(enabled.ok, true, JSON.stringify(enabled.diagnostics));
  assert.equal(reported(await hostOf(enabled).start(), 'the runtime state').status, 'finished');
  assert.deepEqual(
    enabledLog.filter(([event]) => event === 'pose.preview-mirroring'),
    [
      ['pose.preview-mirroring', 'mirrored'],
      ['pose.preview-mirroring', 'unmirrored'],
    ],
  );
  await hostOf(enabled).dispose('pose-preview-enabled');
});

test('refuses a story whose preview controls this shell cannot draw, before materializing them', async () => {
  // The renderer belongs to the host, the DOM around it to the shell. A shell that declares the
  // flag but supplies no container, geometry or scheduler can do nothing with `preview.controls`.
  // That used to surface as a TypeError in the middle of materializing the control icons, with the
  // story already starting; the refusal now happens while nothing has been prepared.
  const project = await packagedProject(cameraPreviewControlsStory, {
    cacheIdentity: {
      id: 'camera-controls-no-shell',
      label: 'story.kamishibai.yaml',
      databaseName: 'tw-kamishibai-assets-v1--story--camera-controls-no-shell',
    },
  });
  const log: LogEntry[] = [];
  const fixture = platformFixture(log);
  const options = enabledOptions(project, fixture, {
    featureFlags: {dsl4Runtime: true, dsl4CameraPreviewControls: true},
  });
  for (const option of ['cameraPreviewControls', 'createObjectURL', 'revokeObjectURL']) {
    delete (options as Record<string, unknown>)[option];
  }

  const failure = await createDsl4TurboWarpRuntimeHost(options).then(
    (value) => value,
    (error: unknown) => error,
  );

  assert.equal(failure instanceof Error, true, JSON.stringify(failure));
  assert.equal((failure as {code?: string}).code, 'K4-HOST-PREVIEW-CONTROLS-001');
  assert.match(String((failure as Error).message), /preview\.controls/u);
  assert.equal(
    log.some(([event]) => typeof event === 'string' && event.startsWith('media.register')),
    false,
    'nothing may be materialized for a story the shell cannot run',
  );
});

test('connects camera preview controls, assets, and upstream methods only behind their flag', async () => {
  const cacheIdentity = {
    id: 'camera-controls',
    label: 'story.kamishibai.yaml',
    databaseName: 'tw-kamishibai-assets-v1--story--camera-controls',
  };
  const project = await packagedProject(cameraPreviewControlsStory, {cacheIdentity});

  const disabledLog: LogEntry[] = [];
  const disabledFixture = platformFixture(disabledLog);
  const disabledCreateTM = disabledFixture.createTMComposition;
  disabledFixture.createTMComposition = (...args) => {
    const composition = disabledCreateTM(...args);
    for (const method of [
      'setPreviewMirroring',
      'listCameraDevices',
      'selectCamera',
      'getCameraSelection',
      'getActiveCamera',
    ]) {
      delete composition[method];
      Object.defineProperty(composition, method, {
        get() {
          assert.fail(`disabled host must not inspect ${method}`);
        },
      });
    }
    return composition;
  };
  const disabledOptions = enabledOptions(project, disabledFixture);
  for (const option of ['cameraPreviewControls', 'createObjectURL', 'revokeObjectURL']) {
    Object.defineProperty(disabledOptions, option, {
      get() {
        assert.fail(`disabled host must not inspect ${option}`);
      },
    });
  }
  const disabled = await createDsl4TurboWarpRuntimeHost(disabledOptions);
  assert.equal(disabled.ok, true, JSON.stringify(disabled.diagnostics));
  const disabledRun = hostOf(disabled).start();
  await Promise.resolve();
  hostOf(disabled).stop('test-complete');
  await disabledRun;
  assert.equal(
    disabledLog.some(([event, id]) => event === 'media.register-embedded' && id !== undefined),
    false,
  );
  await hostOf(disabled).dispose('camera-controls-disabled');

  const enabledLog: LogEntry[] = [];
  const enabledFixture = platformFixture(enabledLog);
  let selection: unknown = 'default';
  const enabledCreateTM = enabledFixture.createTMComposition;
  enabledFixture.createTMComposition = (...args) => {
    const composition = enabledCreateTM(...args);
    return {
      ...composition,
      isCameraRunning: () => true,
      async listCameraDevices() {
        enabledLog.push(['camera.list']);
        return [{deviceId: 'opaque-camera', label: 'External camera'}];
      },
      async selectCamera(next: unknown) {
        selection = next;
        enabledLog.push(['camera.select', next]);
      },
      getCameraSelection: () => selection,
      getActiveCamera: () => null,
    };
  };
  const document = createFakeDocument();
  const objectUrls: string[] = [];
  const revoked: unknown[] = [];
  const pendingSchedules: (() => void)[] = [];
  const enabled = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, enabledFixture, {
      featureFlags: {dsl4Runtime: true, dsl4CameraPreviewControls: true},
      async loadRemoteAsset() {
        return {bytes: new TextEncoder().encode('<svg/>'), contentType: 'image/svg+xml'};
      },
      cameraPreviewControls: {
        container: document.body,
        getPreviewRect: () => ({left: 0, top: 0, width: 320, height: 180}),
        schedule(callback: () => void) {
          pendingSchedules.push(callback);
          return () => {
            const index = pendingSchedules.indexOf(callback);
            if (index >= 0) pendingSchedules.splice(index, 1);
          };
        },
      },
      createObjectURL() {
        const value = `blob:control-${objectUrls.length + 1}`;
        objectUrls.push(value);
        return value;
      },
      revokeObjectURL(url: string) {
        revoked.push(url);
      },
    }),
  );
  assert.equal(enabled.ok, true, JSON.stringify(enabled.diagnostics));
  const enabledRun = hostOf(enabled).start();
  for (let attempt = 0; attempt < 20 && document.body.children.length === 0; attempt += 1) {
    await Promise.resolve();
  }
  assert.equal(document.body.children.length, 1);
  assert.equal(objectUrls.length, 3);
  const mirror = presented(
    findByDataset(document.body, 'dsl4PreviewControl', 'mirroring'),
    'the menu mirror control',
  );
  for (
    let attempt = 0;
    attempt < 20 && nestedChild(mirror, [0]).src !== 'blob:control-2';
    attempt += 1
  ) {
    await Promise.resolve();
  }
  assert.equal(nestedChild(mirror, [0]).src, 'blob:control-2');
  assert.equal(enabledLog.filter(([event]) => event === 'media.register-embedded').length, 3);
  hostOf(enabled).stop('test-complete');
  await enabledRun;
  assert.equal(document.body.children.length, 0);
  await hostOf(enabled).dispose('camera-controls-enabled');
  assert.deepEqual([...revoked].sort(), [...objectUrls].sort());
});

test('releases every control Object URL when renderer DOM disposal fails', async () => {
  const project = await packagedProject(cameraPreviewControlsStory, {
    cacheIdentity: {
      id: 'camera-controls-disposal-failure',
      label: 'story.kamishibai.yaml',
      databaseName: 'tw-kamishibai-assets-v1--story--camera-controls-disposal-failure',
    },
  });
  const log: LogEntry[] = [];
  const fixture = platformFixture(log);
  const createTMComposition = fixture.createTMComposition;
  fixture.createTMComposition = (...args) => ({
    ...createTMComposition(...args),
    isCameraRunning: () => true,
    async listCameraDevices() {
      return [];
    },
    async selectCamera() {},
    getCameraSelection: () => 'default',
    getActiveCamera: () => null,
  });
  const document = createFakeDocument();
  const objectUrls: string[] = [];
  const revoked: unknown[] = [];
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      featureFlags: {dsl4Runtime: true, dsl4CameraPreviewControls: true},
      async loadRemoteAsset() {
        return {bytes: new TextEncoder().encode('<svg/>'), contentType: 'image/svg+xml'};
      },
      cameraPreviewControls: {
        container: document.body,
        getPreviewRect: () => ({left: 0, top: 0, width: 320, height: 180}),
        schedule: () => () => {},
      },
      createObjectURL() {
        const value = `blob:failing-control-${objectUrls.length + 1}`;
        objectUrls.push(value);
        return value;
      },
      revokeObjectURL(url: string) {
        revoked.push(url);
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));

  const run = hostOf(result).start();
  for (let attempt = 0; attempt < 20 && document.body.children.length < 1; attempt += 1) {
    await Promise.resolve();
  }
  assert.equal(document.body.children.length, 1);
  assert.equal(objectUrls.length, 3);
  const failingGroup = nestedChild(document.body, [0]);
  const removeFailingGroup = failingGroup.remove.bind(failingGroup);
  failingGroup.remove = () => {
    throw new Error('control DOM removal failed');
  };

  hostOf(result).stop('renderer-disposal-failure');
  await run;
  await waitUntil(() => revoked.length === objectUrls.length, {
    message: 'Every control Object URL must be revoked despite renderer disposal failure',
  });
  assert.deepEqual([...revoked].sort(), [...objectUrls].sort());
  assert.equal(document.body.children.length, 1);

  removeFailingGroup();
  await hostOf(result).dispose('renderer-disposal-failure');
  assert.equal(document.body.children.length, 0);
});

test('chapters sharing an Object URL owner keep shared control images until the last chapter releases', async () => {
  const project = await packagedProject(cameraPreviewControlsStory, {
    cacheIdentity: {
      id: 'camera-controls-shared-owner',
      label: 'story.kamishibai.yaml',
      databaseName: 'tw-kamishibai-assets-v1--story--camera-controls-shared-owner',
    },
  });
  const created: string[] = [];
  const revoked: string[] = [];
  const urlFunctions = {
    createObjectURL() {
      const value = `blob:shared-control-${created.length + 1}`;
      created.push(value);
      return value;
    },
    revokeObjectURL(url: string) {
      revoked.push(url);
    },
  };
  // One owner per publication, as the publication host creates it for every chapter host.
  const objectUrlOwner = createDsl4ObjectUrlOwner(urlFunctions);
  async function chapter() {
    const fixture = platformFixture([]);
    const createTMComposition = fixture.createTMComposition;
    fixture.createTMComposition = (...args) => ({
      ...createTMComposition(...args),
      isCameraRunning: () => true,
      async listCameraDevices() {
        return [];
      },
      async selectCamera() {},
      getCameraSelection: () => 'default',
      getActiveCamera: () => null,
    });
    const document = createFakeDocument();
    const result = await createDsl4TurboWarpRuntimeHost(
      enabledOptions(project, fixture, {
        featureFlags: {dsl4Runtime: true, dsl4CameraPreviewControls: true},
        async loadRemoteAsset() {
          return {bytes: new TextEncoder().encode('<svg/>'), contentType: 'image/svg+xml'};
        },
        cameraPreviewControls: {
          container: document.body,
          getPreviewRect: () => ({left: 0, top: 0, width: 320, height: 180}),
          schedule: () => () => {},
        },
        ...urlFunctions,
        objectUrlOwner,
      }),
    );
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    const run = hostOf(result).start();
    await waitUntil(() => document.body.children.length === 1, {
      message: 'chapter camera controls rendered',
    });
    return {host: hostOf(result), run, document};
  }
  const first = await chapter();
  assert.equal(created.length, 3);
  const second = await chapter();
  assert.equal(created.length, 3, 'the next chapter reuses the verified control images');
  first.host.stop('chapter-transfer');
  await first.run;
  await first.host.dispose('chapter-transfer');
  assert.equal(first.document.body.children.length, 0, 'the old chapter controls are removed');
  assert.deepEqual(revoked, [], 'the current chapter still holds every shared control image');
  assert.equal(second.document.body.children.length, 1);
  assert.deepEqual(objectUrlOwner.snapshot(), {urls: 3, leases: 3});
  second.host.stop('publication-end');
  await second.run;
  await second.host.dispose('publication-end');
  assert.deepEqual([...revoked].sort(), [...created].sort());
  assert.deepEqual(objectUrlOwner.snapshot(), {urls: 0, leases: 0});
});

test('suspends camera controls at natural finish and resumes the same leases for history', async () => {
  const project = await packagedProject(cameraPreviewControlsHistoryStory, {
    historyNavigationAvailable: true,
    cacheIdentity: {
      id: 'camera-controls-history',
      label: 'story.kamishibai.yaml',
      databaseName: 'tw-kamishibai-assets-v1--story--camera-controls-history',
    },
  });
  const log: LogEntry[] = [];
  const fixture = platformFixture(log);
  const createTMComposition = fixture.createTMComposition;
  fixture.createTMComposition = (...args) => ({
    ...createTMComposition(...args),
    isCameraRunning: () => true,
    async listCameraDevices() {
      return [];
    },
    async selectCamera() {},
    getCameraSelection: () => 'default',
    getActiveCamera: () => null,
  });
  const document = createFakeDocument();
  const objectUrls: string[] = [];
  const revoked: unknown[] = [];
  const pendingSchedules: (() => void)[] = [];
  const eventTypes: unknown[] = [];
  const pendingWaits: (() => void)[] = [];
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      featureFlags: {dsl4Runtime: true, dsl4CameraPreviewControls: true},
      historyNavigationAvailable: true,
      historyLimits: {maxActionEntries: 8, maxSceneVisits: 8},
      async loadRemoteAsset() {
        return {bytes: new TextEncoder().encode('<svg/>'), contentType: 'image/svg+xml'};
      },
      cameraPreviewControls: {
        container: document.body,
        getPreviewRect: () => ({left: 0, top: 0, width: 320, height: 180}),
        schedule(callback: () => void) {
          pendingSchedules.push(callback);
          return () => {
            const index = pendingSchedules.indexOf(callback);
            if (index >= 0) pendingSchedules.splice(index, 1);
          };
        },
      },
      waitSchedule(callback: () => void) {
        pendingWaits.push(callback);
        return () => {
          const index = pendingWaits.indexOf(callback);
          if (index >= 0) pendingWaits.splice(index, 1);
        };
      },
      createObjectURL() {
        const value = `blob:history-control-${objectUrls.length + 1}`;
        objectUrls.push(value);
        return value;
      },
      revokeObjectURL(url: string) {
        revoked.push(url);
      },
      onEvent(event: Readonly<Record<string, unknown>>) {
        eventTypes.push(event.type);
        if (event.type === 'runtime.finish') throw new Error('consumer observer failed');
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));

  const run = hostOf(result).start();
  while (pendingWaits.length === 0) await Promise.resolve();
  const mirror = presented(
    findByDataset(document.body, 'dsl4PreviewControl', 'mirroring'),
    'the mirror control',
  );
  const camera = presented(
    findByDataset(document.body, 'dsl4PreviewControl', 'cameraMenu'),
    'the camera control',
  );
  const menu = presented(
    findByDataset(document.body, 'dsl4PreviewCameraMenu', 'true'),
    'the menu control',
  );
  assert.equal(requireDefined(mirror.listeners.get('click'), 'its click listeners').length, 1);
  assert.equal(requireDefined(camera.listeners.get('click'), 'its click listeners').length, 1);
  assert.equal(requireDefined(menu.listeners.get('change'), 'its change listeners').length, 1);

  requireDefined(pendingWaits.shift(), 'the pending wait')();
  const finished = reported(await run, 'the finished state');
  assert.equal(finished.status, 'finished');
  assert.equal(document.body.children.length, 1);
  assert.ok(document.body.children.every((group) => group.style.display === 'none'));
  assert.equal(pendingSchedules.length, 0);
  assert.equal(revoked.length, 0);
  assert.equal(mirror.listeners.get('click')?.length ?? 0, 0);
  assert.equal(camera.listeners.get('click')?.length ?? 0, 0);
  assert.equal(menu.listeners.get('change')?.length ?? 0, 0);

  const rewound = reported(
    hostOf(result).dispatchCommand('history.previousAction'),
    'the rewound state',
  );
  assert.equal(rewound.ok, true, JSON.stringify(rewound.diagnostics));
  assert.equal(rewound.changed, true);
  assert.equal(
    reported(reported(hostOf(result).getState(), 'the host state').runtime, 'its runtime state')
      .status,
    'paused',
  );
  assert.ok(document.body.children.every((group) => group.style.display === 'flex'));
  assert.equal(pendingSchedules.length, 1);
  assert.equal(requireDefined(mirror.listeners.get('click'), 'its click listeners').length, 1);
  assert.equal(requireDefined(camera.listeners.get('click'), 'its click listeners').length, 1);
  assert.equal(requireDefined(menu.listeners.get('change'), 'its change listeners').length, 1);

  const resumed = reported(
    hostOf(result).dispatchCommand('navigation.nextAction'),
    'the resumed state',
  );
  assert.equal(resumed.ok, true, JSON.stringify(resumed.diagnostics));
  while (pendingWaits.length === 0) await Promise.resolve();
  requireDefined(pendingWaits.shift(), 'the pending wait')();
  await hostOf(result).getRunPromise();
  assert.equal(
    reported(reported(hostOf(result).getState(), 'the host state').runtime, 'its runtime state')
      .status,
    'finished',
  );
  assert.ok(document.body.children.every((group) => group.style.display === 'none'));
  assert.equal(pendingSchedules.length, 0);
  assert.equal(revoked.length, 0);
  assert.equal(mirror.listeners.get('click')?.length ?? 0, 0);
  assert.equal(camera.listeners.get('click')?.length ?? 0, 0);
  assert.equal(menu.listeners.get('change')?.length ?? 0, 0);
  assert.deepEqual(
    eventTypes.filter(
      (type) =>
        typeof type === 'string' &&
        ['runtime.finish', 'navigation.reposition', 'runtime.resume'].includes(type),
    ),
    ['runtime.finish', 'navigation.reposition', 'runtime.resume', 'runtime.finish'],
  );

  await hostOf(result).dispose('history-camera-controls');
  assert.equal(document.body.children.length, 0);
  assert.deepEqual([...revoked].sort(), [...objectUrls].sort());
});

test('wires Standard production think advance through the TurboWarp runtime host', async () => {
  const project = await packagedProject(speechStory);
  const log: LogEntry[] = [];
  const fixture = platformFixture(log);
  fixture.runtime.renderer = {addOverlay() {}, removeOverlay() {}};
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      featureFlags: dsl4StandardProductionFeatureFlags,
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const stageListeners = new Map();
  const stageTarget = {
    addEventListener(type: string, listener: (event: unknown) => void) {
      stageListeners.set(type, listener);
    },
    removeEventListener(type: string, listener: (event: unknown) => void) {
      if (stageListeners.get(type) === listener) stageListeners.delete(type);
    },
  };
  hostOf(result).attachStagePointer(stageTarget);
  assert.equal(stageListeners.has('pointerup'), true);
  const run = hostOf(result).start();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (log.some(([name, message]) => name === 'actor.think' && message === 'ど')) break;
    await Promise.resolve();
  }
  assert.equal(
    log.some(([name, message]) => name === 'actor.think' && message === 'ど'),
    true,
    JSON.stringify(log),
  );
  // Bubble presents on its own promise chain, so the start sound and the first revealed chunk are
  // ordered by the composition rather than by the reveal call, and only their presence is fixed.
  assert.equal(log.filter(([name, sound]) => name === 'media.play' && sound === 'Voice').length, 1);
  await Promise.resolve();
  const counters = {preventDefault: 0, stopPropagation: 0};
  const event = {
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    preventDefault() {
      counters.preventDefault += 1;
    },
    stopPropagation() {
      counters.stopPropagation += 1;
    },
  };
  assert.equal(stageListeners.get('pointerup')(event), true);
  assert.deepEqual(counters, {preventDefault: 1, stopPropagation: 1});
  assert.equal(reported(await run, 'the runtime state').status, 'finished');
  assert.equal(
    log.filter(([name, message]) => name === 'actor.think' && message === 'どうしよう').length,
    1,
    JSON.stringify(log),
  );
  assert.equal(
    log.filter(([name, message]) => name === 'actor.think' && message === '').length,
    1,
    JSON.stringify(log),
  );
  assert.equal(log.filter(([name, sound]) => name === 'media.stop' && sound === 'Voice').length, 1);
  await hostOf(result).dispose('test-complete');
  assert.equal(stageListeners.has('pointerup'), false);
});

test('routes speech through Bubble and releases the owned composition', async () => {
  const project = await packagedProject(speechStory);
  const log: LogEntry[] = [];
  const fixture = platformFixture(log);
  const bubbleLog: LogEntry[] = [];
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      featureFlags: {
        dsl4Runtime: true,
        dsl4AppShell: true,
        dsl4SpeechAdvanceTypewriter: true,
      },
      createBubbleComposition(runtime: unknown, options: Readonly<Record<string, unknown>>) {
        assert.strictEqual(runtime, fixture.runtime);
        assert.ok(options.imageResolver);
        assert.strictEqual(options.audio, options.imageResolver);
        const textCapability = requireRecord(options.textCapability, 'the text capability');
        assert.equal(typeof textCapability.setText, 'function');
        assert.equal(typeof textCapability.releaseTarget, 'function');
        return {
          defineStyle(style: Readonly<Record<string, unknown>>) {
            bubbleLog.push(['define', style.name, style.visualStyle]);
          },
          async show(input: Readonly<Record<string, unknown>>) {
            bubbleLog.push(['show', input.kind, input.text, input.styleName, input.animationMode]);
            return {
              async setText(text: unknown) {
                bubbleLog.push(['text', text]);
              },
              async setAnimationMode(mode: unknown) {
                bubbleLog.push(['animation-mode', mode]);
              },
              async close() {
                bubbleLog.push(['close']);
              },
            };
          },
          releaseAll() {
            bubbleLog.push(['release-all']);
          },
        };
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(bubbleLog.slice(0, 3), [
    ['define', '__dsl4_default__', 'NORMAL'],
    ['define', '__dsl4_default_think__', 'THINKING'],
    ['define', 'novel', undefined],
  ]);

  const stageListeners = new Map();
  hostOf(result).attachStagePointer({
    addEventListener(type: string, listener: (event: unknown) => void) {
      stageListeners.set(type, listener);
    },
    removeEventListener(type: string, listener: (event: unknown) => void) {
      if (stageListeners.get(type) === listener) stageListeners.delete(type);
    },
  });
  const run = hostOf(result).start();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (bubbleLog.some(([name]) => name === 'show')) break;
    await Promise.resolve();
  }
  assert.deepEqual(
    bubbleLog.find(([name]) => name === 'show'),
    ['show', 'think', 'ど', '@dsl4:["novel"]', 'talking'],
  );
  assert.equal(
    log.some(([name]) => name === 'actor.think'),
    false,
    JSON.stringify(log),
  );
  assert.equal(
    stageListeners.get('pointerup')({
      pointerType: 'mouse',
      button: 0,
      preventDefault() {},
      stopPropagation() {},
    }),
    true,
  );
  assert.equal(reported(await run, 'the runtime state').status, 'finished');
  assert.equal(
    bubbleLog.some(([name, text]) => name === 'text' && text === 'どうしよう'),
    true,
    JSON.stringify(bubbleLog),
  );
  assert.equal(
    bubbleLog.some(([name, mode]) => name === 'animation-mode' && mode === 'awaiting-continue'),
    true,
    JSON.stringify(bubbleLog),
  );
  assert.equal(bubbleLog.filter(([name]) => name === 'close').length, 1);

  await hostOf(result).dispose('test-complete');
  assert.equal(bubbleLog.filter(([name]) => name === 'release-all').length, 1);
});

test('creates an idle host, attaches explicitly, runs, and disposes every owned resource once', async () => {
  const project = await packagedProject();
  const log: LogEntry[] = [];
  const fixture = platformFixture(log);
  const target = {
    addEventListener(type: string) {
      log.push(['listener.add', type]);
    },
    removeEventListener(type: string) {
      log.push(['listener.remove', type]);
    },
  };
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      featureFlags: {dsl4Runtime: true, structuredDataIntegrationEnabled: true},
      createRuntimeExpressionComposition() {
        log.push(['expression.create']);
        return {
          evaluateCondition() {
            return true;
          },
          releaseAll() {
            log.push(['expression.release-all']);
          },
        };
      },
      createHostPort(context: Readonly<Record<string, unknown>>) {
        log.push(['story-input.create']);
        assert.strictEqual(context.runtime, fixture.runtime);
        assert.equal(Object.isFrozen(context), true);
        return {
          wait(_payload: unknown, actionContext: Readonly<Record<string, unknown>>) {
            const structuredData = requireRecord(
              actionContext.structuredData,
              'the structured data context',
            );
            assert.match(requireString(structuredData.actionScopeRef, 'its scope ref'), /^@os1\./u);
            assert.match(requireString(structuredData.actionViewRef, 'its view ref'), /^@os1\./u);
            assert.equal(Object.isFrozen(structuredData), true);
          },
          dispose() {
            log.push(['story-input.dispose']);
          },
        };
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.host), true);
  assert.equal(Object.isFrozen(fixture.runtime), false);
  assert.equal(Object.isFrozen(fixture.runtime.targets[0]), false);
  assert.equal(
    reported(reported(hostOf(result).getState(), 'the host state').runtime, 'its runtime state')
      .status,
    'idle',
  );
  await assert.rejects(
    hostOf(result).invokeAction({command: 'wait', target: null, args: {seconds: 0}}),
    (error) => thrown(error).code === 'K4-RUNTIME-INVOKE-INACTIVE',
  );
  assert.equal(
    log.some(([name]) => name === 'listener.add'),
    false,
  );

  hostOf(result).attach(target);
  const finished = reported(await hostOf(result).start(), 'the finished state');
  assert.equal(finished.status, 'finished');
  const firstDispose = hostOf(result).dispose('test-complete');
  const secondDispose = hostOf(result).dispose('ignored');
  assert.strictEqual(secondDispose, firstDispose);
  await firstDispose;

  for (const event of [
    ['listener.add', 'keydown'],
    ['listener.remove', 'keydown'],
    ['story-input.dispose'],
    ['expression.release-all'],
    ['svg.release-all'],
    ['input.release-all'],
    ['pose.release-all'],
    ['media.release-all'],
  ]) {
    assert.equal(
      log.filter((entry) => JSON.stringify(entry) === JSON.stringify(event)).length,
      1,
      JSON.stringify(log),
    );
  }
  assert.throws(
    () => hostOf(result).start(),
    (error) => thrown(error).code === 'K4-HOST-DISPOSED',
  );
});

test('renews the active story cache lease and cancels its heartbeat after execution', async () => {
  const cacheIdentity = {
    id: 'heartbeat0000001',
    label: 'story.kamishibai.yaml',
    databaseName: 'tw-kamishibai-assets-v1--story--heartbeat0000001',
  };
  const project = await packagedProject(
    `
kamishibai: '4.0'
assets:
  RemoteUnused:
    kind: backdrop
    delivery: remote
    loading: lazy
    source:
      url: https://cdn.example.com/unused.svg
      integrity: sha256-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
      contentType: image/svg+xml
      size: 12
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - wait: 0
`,
    {cacheIdentity},
  );
  const log: LogEntry[] = [];
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, platformFixture(log), {
      loadRemoteAsset: async () => assert.fail('unused remote asset must not load'),
      cacheLeaseHeartbeatMs: 1234,
      scheduleCacheLeaseHeartbeat(callback: () => void, milliseconds: number) {
        log.push(['cache.heartbeat-start', milliseconds]);
        callback();
        return () => log.push(['cache.heartbeat-stop']);
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(reported(await hostOf(result).start(), 'the runtime state').status, 'finished');
  assert.equal(log.filter(([event]) => event === 'cache.renew-lease').length, 2);
  assert.deepEqual(
    log.filter(([event]) => event.startsWith('cache.heartbeat')),
    [['cache.heartbeat-start', 1234], ['cache.heartbeat-stop']],
  );
  assert.equal(
    requireDefined(
      hostOf(result).verifiedRemoteCache,
      'the verified remote cache',
    ).getHeartbeatError(),
    null,
  );
  await hostOf(result).dispose();
});

test('publishes a finished story before a pending cache lease release completes', async () => {
  const cacheIdentity = {
    id: 'finishlease00001',
    label: 'story.kamishibai.yaml',
    databaseName: 'tw-kamishibai-assets-v1--story--finishlease00001',
  };
  const project = await packagedProject(
    waitStory.replace(
      'controls:',
      `assets:
  RemoteUnused:
    kind: backdrop
    delivery: remote
    loading: lazy
    source:
      url: https://cdn.example.com/unused.svg
      integrity: sha256-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
      contentType: image/svg+xml
      size: 12
controls:`,
    ),
    {cacheIdentity},
  );
  const fixture = platformFixture([]);
  const createAssetManagerComposition = fixture.createAssetManagerComposition;
  let finishRelease: (() => void) | null = null;
  let releaseCalls = 0;
  fixture.createAssetManagerComposition = (...args) => {
    const composition = createAssetManagerComposition(...args);
    return {
      ...composition,
      releaseVerifiedRemoteStoryCacheLease() {
        releaseCalls += 1;
        if (releaseCalls > 1) return Promise.resolve();
        return new Promise<void>((resolve) => {
          finishRelease = resolve;
        });
      },
    };
  };
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      loadRemoteAsset: async () => assert.fail('unused remote asset must not load'),
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));

  let runSettled = false;
  const run = hostOf(result)
    .start()
    .then((state) => {
      runSettled = true;
      return state;
    });
  for (let attempt = 0; attempt < 200 && !finishRelease; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(
    typeof finishRelease,
    'function',
    `cache lease release did not start: ${JSON.stringify(reported(hostOf(result).getState(), 'the host state').runtime)}`,
  );
  await new Promise((resolve) => setImmediate(resolve));
  const settledBeforeRelease = runSettled;
  requireDefined<() => void>(finishRelease, 'the pending gate')();
  assert.equal(reported(await run, 'the runtime state').status, 'finished');
  await hostOf(result).dispose();

  assert.equal(
    settledBeforeRelease,
    true,
    'terminal UI must not wait for a cache lease maintenance operation',
  );
});

test('publishes a finished story before pending background camera startup settles', async () => {
  const project = await packagedPoseProject(`
kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
actors:
  Hero: HeroIdle
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - goto: ending
  unreachablePose:
    recognitionModel: RescuePose
    actions:
      - Hero.pose:
          steps:
            - pose: help
  ending: []
`);
  const fixture = platformFixture([]);
  fixture.tmComposition.registerPoseModel = ({name}: {name: unknown}) => ({
    name,
    labels: ['help'],
  });
  let finishCameraStart: (() => void) | null = null;
  let cameraRunning = false;
  fixture.tmComposition.startCamera = () =>
    new Promise<void>((resolve) => {
      finishCameraStart = () => {
        cameraRunning = true;
        resolve();
      };
    });
  fixture.tmComposition.stopCamera = () => {
    cameraRunning = false;
  };
  fixture.tmComposition.isCameraRunning = () => cameraRunning;
  const result = await createDsl4TurboWarpRuntimeHost(enabledOptions(project, fixture));
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));

  let runSettled = false;
  const run = hostOf(result)
    .start()
    .then((state) => {
      runSettled = true;
      return state;
    });
  for (let attempt = 0; attempt < 200 && !finishCameraStart; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(typeof finishCameraStart, 'function', 'background camera startup did not begin');
  await new Promise((resolve) => setImmediate(resolve));
  const settledBeforeCamera = runSettled;
  requireDefined<() => void>(finishCameraStart, 'the pending gate')();
  const terminal = reported(await run, 'the terminal state');
  assert.equal(terminal.status, 'finished', JSON.stringify(terminal));
  await hostOf(result).dispose();

  assert.equal(
    settledBeforeCamera,
    true,
    'terminal UI must not wait for background camera startup or shutdown',
  );
});

test('keeps the run promise pending across rehearsal scene skips until terminal state', async () => {
  const project = await packagedProject(`
kamishibai: '4.0'
controls:
  keymaps:
    production:
      ArrowDown: rehearsal.skipScene
scenes:
  first:
    - wait: 3600
  second:
    - wait: 3600
`);
  const waits = [];
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, platformFixture([]), {
      waitSchedule(callback: () => void) {
        const wait = {callback, cancelled: false};
        waits.push(wait);
        return () => {
          wait.cancelled = true;
        };
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));

  let runSettled = false;
  const run = hostOf(result)
    .start()
    .then((state) => {
      runSettled = true;
      return state;
    });
  for (let attempt = 0; attempt < 200 && waits.length < 1; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(waits.length, 1, 'the first scene did not start waiting');
  assert.equal(
    reported(hostOf(result).dispatchCommand('rehearsal.skipScene'), 'the dispatch result').ok,
    true,
  );
  for (let attempt = 0; attempt < 200 && waits.length < 2; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(waits.length, 2, 'the second scene did not start waiting');
  assert.equal(runSettled, false, 'the run promise settled at a non-terminal scene boundary');

  assert.equal(
    reported(hostOf(result).dispatchCommand('rehearsal.skipScene'), 'the dispatch result').ok,
    true,
  );
  const terminal = reported(await run, 'the terminal state');
  assert.equal(terminal.status, 'finished', JSON.stringify(terminal));
  assert.equal(runSettled, true);
  await hostOf(result).dispose();
});

test('contains a cache heartbeat cancellation failure and still releases the lease', async () => {
  const cacheIdentity = {
    id: 'cancelerror00001',
    label: 'story.kamishibai.yaml',
    databaseName: 'tw-kamishibai-assets-v1--story--cancelerror00001',
  };
  const project = await packagedProject(
    `
kamishibai: '4.0'
assets:
  RemoteUnused:
    kind: backdrop
    delivery: remote
    loading: lazy
    source:
      url: https://cdn.example.com/unused.svg
      integrity: sha256-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
      contentType: image/svg+xml
      size: 12
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - wait: 0
`,
    {cacheIdentity},
  );
  const log: LogEntry[] = [];
  const cancellationFailure = new Error('heartbeat cancellation failed');
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, platformFixture(log), {
      loadRemoteAsset: async () => assert.fail('unused remote asset must not load'),
      scheduleCacheLeaseHeartbeat() {
        return () => {
          throw cancellationFailure;
        };
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(reported(await hostOf(result).start(), 'the runtime state').status, 'finished');
  assert.strictEqual(
    requireDefined(
      hostOf(result).verifiedRemoteCache,
      'the verified remote cache',
    ).getHeartbeatError(),
    cancellationFailure,
  );
  assert.equal(log.filter(([event]) => event === 'cache.release-lease').length, 1);
  await hostOf(result).dispose();
});

test('a restarted run keeps the latest cache lease heartbeat active', async () => {
  const cacheIdentity = {
    id: 'restartheartbeat1',
    label: 'story.kamishibai.yaml',
    databaseName: 'tw-kamishibai-assets-v1--story--restartheartbeat1',
  };
  const project = await packagedProject(
    `
kamishibai: '4.0'
assets:
  RemoteUnused:
    kind: backdrop
    delivery: remote
    loading: lazy
    source:
      url: https://cdn.example.com/unused.svg
      integrity: sha256-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
      contentType: image/svg+xml
      size: 12
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - wait: 30
`,
    {cacheIdentity},
  );
  const log: LogEntry[] = [];
  const scheduledWaits: {cancelled: boolean; callback: () => void}[] = [];
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, platformFixture(log), {
      loadRemoteAsset: async () => assert.fail('unused remote asset must not load'),
      waitSchedule(callback: () => void) {
        const scheduled = {callback, cancelled: false};
        scheduledWaits.push(scheduled);
        return () => {
          scheduled.cancelled = true;
        };
      },
      scheduleCacheLeaseHeartbeat() {
        log.push(['cache.heartbeat-start']);
        return () => log.push(['cache.heartbeat-stop']);
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));

  const firstRun = hostOf(result).start();
  while (scheduledWaits.length < 1) await Promise.resolve();
  const restartedRun = hostOf(result).start();
  while (scheduledWaits.length < 2) await Promise.resolve();
  await firstRun;
  assert.equal(requireDefined(scheduledWaits[0], 'the first scheduled wait').cancelled, true);
  assert.equal(log.filter(([event]) => event === 'cache.heartbeat-stop').length, 0);
  assert.equal(log.filter(([event]) => event === 'cache.release-lease').length, 0);

  requireDefined(scheduledWaits[1], 'the second scheduled wait').callback();
  assert.equal(reported(await restartedRun, 'the runtime state').status, 'finished');
  assert.equal(log.filter(([event]) => event === 'cache.heartbeat-start').length, 1);
  assert.equal(log.filter(([event]) => event === 'cache.heartbeat-stop').length, 1);
  assert.equal(log.filter(([event]) => event === 'cache.release-lease').length, 1);
  await hostOf(result).dispose();
});

test('uses the cache identity persisted in the packaged source for remote delivery', async () => {
  const cacheIdentity = {
    id: 'story000000000001',
    label: 'story.kamishibai.yaml',
    databaseName: 'tw-kamishibai-assets-v1--story--story000000000001',
  };
  const project = await packagedProject(
    `
kamishibai: '4.0'
assets:
  RemoteImage:
    kind: backdrop
    delivery: remote
    loading: lazy
    source:
      url: https://cdn.example.com/image.svg
      integrity: sha256-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
      contentType: image/svg+xml
      size: 12
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - stage: RemoteImage
`,
    {cacheIdentity},
  );
  const log: LogEntry[] = [];
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, platformFixture(log), {
      async loadRemoteAsset() {
        return {bytes: new Uint8Array(12), contentType: 'image/svg+xml'};
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(
    requireDefined(hostOf(result).verifiedRemoteCache, 'the verified remote cache').identity,
    cacheIdentity,
  );
  assert.deepEqual(
    requireDefined(
      log.find(([event]) => event === 'media.create'),
      'the media.create row',
    )[1],
    {
      verifiedRemoteCache: {cacheIdentity},
    },
  );
  await hostOf(result).dispose();

  await assert.rejects(
    createDsl4TurboWarpRuntimeHost(
      enabledOptions(project, platformFixture([]), {
        loadRemoteAsset() {},
        cacheIdentity: {
          ...cacheIdentity,
          id: 'different0000001',
          databaseName: 'tw-kamishibai-assets-v1--story--different0000001',
        },
      }),
    ),
    (error) => thrown(error).code === 'K4-HOST-CACHE-IDENTITY-001',
  );
});

test('executes media, actor, SVG text, and wait actions through one composed runtime port', async () => {
  const project = await packagedProject(`
kamishibai: '4.0'
assets:
  Beach: backdrop
  Cover: backdrop
  HeroSkin: costume:Hero
  HeroSkin2: costume:Hero
  Bell: sound
actors:
  Hero: HeroSkin
cover:
  backdrop: Cover
  bgm: Bell
textStyles:
  title:
    color: '#ffffff'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - stage: Beach
    - bgm: Bell
    - Hero.show:
        skin: HeroSkin
        x: 10
        y: 20
        scale: 30
    - Hero.hide: {}
    - Hero.show:
        skin: HeroSkin
        x: 10
        y: 20
        scale: 30
    - Hero.setLayer: back
    - Hero.loop:
        steps:
          - skin: HeroSkin
            seconds: 0.3
          - skin: HeroSkin2
            seconds: 0.3
    - Hero.setTransparency: 50
    - Hero.moveTo:
        x: 40
        y: 50
        seconds: 0
    - Hero.say:
        text: hello
        seconds: 0
    - Hero.setSkin:
        skin: HeroSkin
        scale: 45
    - Hero.setText:
        text: title
        style: title
    - sound: Bell
    - wait: 0
`);
  const log: LogEntry[] = [];
  const clock = manualScheduler();
  const uiVisibility: unknown[] = [];
  const fixture = platformFixture(log);
  fixture.runtime.targets.push({
    id: 'app-shell-target',
    isStage: false,
    lookupVariableByNameAndType() {
      return null;
    },
    setVisible(visible: boolean) {
      uiVisibility.push(visible);
    },
  });
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {actorScheduler: clock.scheduler}),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const finished = reported(await hostOf(result).start(), 'the finished state');
  assert.equal(finished.status, 'finished');
  assert.equal(await hostOf(result).prepareMenu(), true);
  assert.equal(
    log.some((entry) => JSON.stringify(entry) === JSON.stringify(['media.stage', 'Cover'])),
    false,
    'Menu preparation must not wait for a cover backdrop that is immediately replaced by Menu.',
  );
  assert.equal(await hostOf(result).showCover(), true);
  assert.equal(clock.pendingCount(), 0);
  for (const event of [
    ['media.stage', 'Beach'],
    ['media.stage', 'Cover'],
    ['media.stop-all'],
    ['media.play', 'Bell'],
    ['actor.size', 30],
    ['actor.visible', true],
    ['actor.visible', false],
    ['actor.layer', 'back'],
    ['actor.size', 45],
    ['actor.effect', 'ghost', 50],
    ['actor.xy', 40, 50],
    ['actor.say', 'hello'],
    ['svg.text', 'title', 'title'],
  ]) {
    assert.equal(
      log.some((entry) => JSON.stringify(entry) === JSON.stringify(event)),
      true,
      `${JSON.stringify(event)} not found in ${JSON.stringify(log)}`,
    );
  }
  assert.deepEqual(uiVisibility, []);
  await hostOf(result).dispose();
});

test('hides every story actor on initial and sequential scene entry', async () => {
  const project = await packagedProject(`
kamishibai: '4.0'
assets:
  HeroSkin: costume:Hero
actors:
  Hero: HeroSkin
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - Hero.show:
        skin: HeroSkin
        x: 10
        y: 20
        scale: 30
  closing: []
`);
  const log: LogEntry[] = [];
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, platformFixture(log)),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));

  const state = reported(await hostOf(result).start(), 'the state state');

  assert.equal(state.status, 'finished');
  assert.deepEqual(
    log.filter(([event]) => event === 'actor.visible'),
    [
      ['actor.visible', false],
      ['actor.visible', true],
      ['actor.visible', false],
    ],
  );
  await hostOf(result).dispose();
});

test('resolves every story actor before hiding any actor at a scene boundary', async () => {
  const project = await packagedProject(`
kamishibai: '4.0'
assets:
  HeroSkin: costume:Hero
  MissingSkin: costume:Missing
actors:
  Hero: HeroSkin
  Missing: MissingSkin
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening: []
`);
  const log: LogEntry[] = [];
  const events: Readonly<Record<string, unknown>>[] = [];
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, platformFixture(log), {
      onEvent: (event: Readonly<Record<string, unknown>>) => events.push(event),
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));

  const state = reported(await hostOf(result).start(), 'the state state');

  assert.equal(state.status, 'failed');
  assert.equal(
    requireRecord(state.diagnostic, 'the failure diagnostic').code,
    'K4-HOST-ACTOR-RESET-001',
  );
  assert.equal(
    log.some(([event]) => event === 'actor.visible'),
    false,
  );
  assert.equal(
    events.some(({type}) => type === 'scene.enter' || type === 'scene.transition'),
    false,
  );
  await hostOf(result).dispose();
});

test('fails before hiding any actor when a story actor target is ambiguous', async () => {
  const project = await packagedProject(`
kamishibai: '4.0'
assets:
  HeroSkin: costume:Hero
actors:
  Hero: HeroSkin
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening: []
`);
  const log: LogEntry[] = [];
  const events: Readonly<Record<string, unknown>>[] = [];
  const fixture = platformFixture(log);
  fixture.runtime.targets.push(fixture.runtime.targets[1]);
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      onEvent: (event: Readonly<Record<string, unknown>>) => events.push(event),
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));

  const state = reported(await hostOf(result).start(), 'the state state');

  assert.equal(state.status, 'failed');
  assert.equal(requireRecord(state.diagnostic, 'the failure diagnostic').code, 'K4-TW-ACTOR-001');
  assert.equal(
    log.some(([event]) => event === 'actor.visible'),
    false,
  );
  assert.equal(
    events.some(({type}) => type === 'scene.enter' || type === 'scene.transition'),
    false,
  );
  await hostOf(result).dispose();
});

test('fails before scene publication when a resolved actor cannot be hidden', async () => {
  const project = await packagedProject(`
kamishibai: '4.0'
assets:
  HeroSkin: costume:Hero
actors:
  Hero: HeroSkin
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening: []
`);
  const log: LogEntry[] = [];
  const events: Readonly<Record<string, unknown>>[] = [];
  const fixture = platformFixture(log);
  fixtureTarget(fixture.runtime, 1).setVisible = () => {
    throw new Error('visibility unavailable');
  };
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      onEvent: (event: Readonly<Record<string, unknown>>) => events.push(event),
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));

  const state = reported(await hostOf(result).start(), 'the state state');

  assert.equal(state.status, 'failed');
  assert.equal(
    requireRecord(state.diagnostic, 'the failure diagnostic').code,
    'K4-HOST-ACTOR-RESET-002',
  );
  assert.equal(
    events.some(({type}) => type === 'scene.enter' || type === 'scene.transition'),
    false,
  );
  await hostOf(result).dispose();
});

test('foreground transparency waits and skip commits its final state before navigation', async () => {
  const project = await packagedProject(`
kamishibai: '4.0'
assets:
  HeroSkin: costume:Hero
actors:
  Hero: HeroSkin
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - Hero.setTransparency:
        from: 0
        to: 50
        seconds: 1
`);
  const log: LogEntry[] = [];
  const clock = manualScheduler();
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, platformFixture(log), {
      actorScheduler: clock.scheduler,
      actorFrameMilliseconds: 500,
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const run = hostOf(result).start();
  while (clock.pendingCount() === 0) await Promise.resolve();
  clock.advance(500);
  assert.deepEqual(log.at(-1), ['actor.effect', 'ghost', 25]);

  const skipped = reported(
    hostOf(result).dispatchCommand('navigation.nextAction'),
    'the skipped state',
  );
  assert.equal(skipped.ok, true);
  assert.equal(
    reported(reported(hostOf(result).getState(), 'the host state').runtime, 'its runtime state')
      .status,
    'finished',
  );
  assert.deepEqual(log.at(-1), ['actor.effect', 'ghost', 50]);
  assert.equal(clock.pendingCount(), 0);
  await run;
  await hostOf(result).dispose();
});

test('foreground transparency remains running after failed skip finalization and retries', async () => {
  const project = await packagedProject(`
kamishibai: '4.0'
assets:
  HeroSkin: costume:Hero
actors:
  Hero: HeroSkin
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - Hero.setTransparency:
        from: 0
        to: 50
        seconds: 1
`);
  const log: LogEntry[] = [];
  const fixture = platformFixture(log);
  const actor = requireDefined(
    fixture.runtime.targets
      .map((target) => requireRecord(target, 'a fixture target'))
      .find((target) => target.isStage === false),
    'the actor target',
  );
  const originalSetEffect = requireFunction(actor.setEffect, 'the actor setEffect').bind(actor);
  let finalizationFailures = 1;
  actor.setEffect = (effect: string, value: number) => {
    originalSetEffect(effect, value);
    if (value === 50 && finalizationFailures > 0) {
      finalizationFailures -= 1;
      throw new Error('finalization failed');
    }
  };
  const clock = manualScheduler();
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      actorScheduler: clock.scheduler,
      actorFrameMilliseconds: 500,
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const run = hostOf(result).start();
  while (clock.pendingCount() === 0) await Promise.resolve();

  assert.throws(
    () => hostOf(result).dispatchCommand('navigation.nextAction'),
    /transparency transition cleanup failed/u,
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    reported(reported(hostOf(result).getState(), 'the host state').runtime, 'its runtime state')
      .status,
    'running',
  );
  assert.equal(clock.pendingCount(), 0);

  const skipped = reported(
    hostOf(result).dispatchCommand('navigation.nextAction'),
    'the skipped state',
  );
  assert.equal(skipped.ok, true);
  assert.equal(
    reported(reported(hostOf(result).getState(), 'the host state').runtime, 'its runtime state')
      .status,
    'finished',
  );
  assert.equal(
    log.filter(
      ([event, effect, value]) => event === 'actor.effect' && effect === 'ghost' && value === 50,
    ).length,
    2,
  );
  await run;
  await hostOf(result).dispose();
});

test('background transparency runs with the next action and stop finalizes it before cancellation', async () => {
  const project = await packagedProject(`
kamishibai: '4.0'
assets:
  HeroSkin: costume:Hero
actors:
  Hero: HeroSkin
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - Hero.setTransparency:
        from: 0
        to: 50
        seconds: 1
        background: true
    - wait: 30
`);
  const log: LogEntry[] = [];
  const clock = manualScheduler();
  let waitScheduled = false;
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, platformFixture(log), {
      actorScheduler: clock.scheduler,
      actorFrameMilliseconds: 500,
      waitSchedule() {
        waitScheduled = true;
        return () => log.push(['wait.cancel']);
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const run = hostOf(result).start();
  while (!waitScheduled) await Promise.resolve();
  clock.advance(500);
  assert.deepEqual(log.at(-1), ['actor.effect', 'ghost', 25]);

  const stopped = reported(hostOf(result).stop('test-stop'), 'the stopped state');
  assert.equal(stopped.status, 'stopped');
  assert.deepEqual(log.slice(-2), [['actor.effect', 'ghost', 50], ['wait.cancel']]);
  assert.equal(clock.pendingCount(), 0);
  await run;
  await hostOf(result).dispose();
});

test('background transparency blocks skip until a failed final state can be retried', async () => {
  const project = await packagedProject(`
kamishibai: '4.0'
assets:
  HeroSkin: costume:Hero
actors:
  Hero: HeroSkin
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - Hero.setTransparency:
        from: 0
        to: 50
        seconds: 1
        background: true
    - wait: 30
`);
  const log: LogEntry[] = [];
  const fixture = platformFixture(log);
  const actor = requireDefined(
    fixture.runtime.targets
      .map((target) => requireRecord(target, 'a fixture target'))
      .find((target) => target.isStage === false),
    'the actor target',
  );
  const originalSetEffect = requireFunction(actor.setEffect, 'the actor setEffect').bind(actor);
  let interpolationFailures = 1;
  let finalizationFailures = 2;
  actor.setEffect = (effect: string, value: number) => {
    originalSetEffect(effect, value);
    if (value === 25 && interpolationFailures > 0) {
      interpolationFailures -= 1;
      throw new Error('interpolation failed');
    }
    if (value === 50 && finalizationFailures > 0) {
      finalizationFailures -= 1;
      throw new Error('finalization failed');
    }
  };
  const clock = manualScheduler();
  let waitScheduled = false;
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      actorScheduler: clock.scheduler,
      actorFrameMilliseconds: 500,
      waitSchedule() {
        waitScheduled = true;
        return () => log.push(['wait.cancel']);
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const run = hostOf(result).start();
  while (!waitScheduled) await Promise.resolve();
  clock.advance(500);
  await Promise.resolve();

  assert.throws(
    () => hostOf(result).dispatchCommand('navigation.nextAction'),
    /transparency transition cleanup failed/u,
  );
  assert.equal(
    reported(reported(hostOf(result).getState(), 'the host state').runtime, 'its runtime state')
      .status,
    'running',
  );
  assert.equal(
    log.some(([event]) => event === 'wait.cancel'),
    false,
  );

  const skipped = reported(
    hostOf(result).dispatchCommand('navigation.nextAction'),
    'the skipped state',
  );
  assert.equal(skipped.ok, true);
  assert.equal(
    reported(reported(hostOf(result).getState(), 'the host state').runtime, 'its runtime state')
      .status,
    'finished',
  );
  assert.deepEqual(log.slice(-2), [['actor.effect', 'ghost', 50], ['wait.cancel']]);
  await run;
  await hostOf(result).dispose();
});

test('injects story input and transition capabilities without colliding with platform ports', async () => {
  const project = await packagedProject(`
kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - keyInputToChangeScene:
        Digit1: ending
  ending:
    - transition:
        effect: fadeOut
        seconds: 0
    - wait: 0
`);
  const log: LogEntry[] = [];
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, platformFixture(log), {
      createHostPort() {
        return {
          keyInputToChangeScene(payload: CompositionPayload) {
            log.push(['story.key', payload.codes]);
            return 'Digit1';
          },
          transition(payload: CompositionPayload) {
            log.push(['story.transition', payload.effect, payload.seconds]);
          },
        };
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const finished = reported(await hostOf(result).start(), 'the finished state');
  assert.equal(finished.status, 'finished');
  assert.deepEqual(
    log.filter(([name]) => name.startsWith('story.')),
    [
      ['story.key', ['Digit1']],
      ['story.transition', 'fadeOut', 0],
    ],
  );
  await hostOf(result).dispose();
});

test('uses default Runtime Expression and one Async Input composition for key and touch routing', async () => {
  const project = await packagedProject(`
kamishibai: '4.0'
variables:
  score: 1
controls:
  keymaps:
    production:
      Space: navigation.nextAction
branches:
  chooseInput:
    - if: 'score === 1'
      goto: keyChoice
    - else: failed
scenes:
  opening:
    - branch: chooseInput
  keyChoice:
    - keyInputToChangeScene:
        ArrowRight: touchChoice
  touchChoice:
    - touchInputToChangeScene:
        Hero: ending
  failed:
    - wait: 0
  ending:
    - wait: 0
`);
  const log: LogEntry[] = [];
  let keyListener: ((candidate: unknown) => void) | null = null;
  let touchListener: ((candidate: unknown) => void) | null = null;
  const events: Readonly<Record<string, unknown>>[] = [];
  const cursors: unknown[] = [];
  const keySource = {
    subscribeKeyCandidate(listener: (candidate: unknown) => void) {
      assert.equal(keyListener, null);
      keyListener = listener;
      return () => {
        if (keyListener === listener) keyListener = null;
      };
    },
  };
  const actorTouchSource = {
    subscribeActorTouchCandidate(listener: (candidate: unknown) => void) {
      assert.equal(touchListener, null);
      touchListener = listener;
      return () => {
        if (touchListener === listener) touchListener = null;
      };
    },
  };
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, platformFixture(log), {
      createAsyncInputComposition: undefined,
      keySource,
      actorTouchSource,
      setCursor(event: Readonly<Record<string, unknown>>) {
        cursors.push(event);
      },
      onEvent(event: Readonly<Record<string, unknown>>) {
        events.push(event);
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));

  const run = hostOf(result).start();
  while (!keyListener) await new Promise((resolve) => setImmediate(resolve));
  requireDefined<(candidate: unknown) => void>(
    keyListener,
    'the key listener',
  )({
    version: 1,
    code: 'ArrowRight',
    repeat: false,
    isComposing: false,
    hasModifier: false,
    interactiveTarget: false,
    timestamp: 1,
  });
  while (!touchListener) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(keyListener, null);
  assert.deepEqual(cursors, [{visible: true, source: 'touch-input-1', cursor: 'pointer'}]);
  requireDefined<(candidate: unknown) => void>(
    touchListener,
    'the touch listener',
  )({
    version: 1,
    actorId: 'Hero',
    primaryButton: true,
    topmost: true,
    actorNameUnique: true,
    timestamp: 2,
  });

  const finished = reported(await run, 'the finished state');
  assert.deepEqual(
    events
      .filter((event: Readonly<Record<string, unknown>>) => event.type === 'scene.transition')
      .map((event: Readonly<Record<string, unknown>>) => event.details),
    [
      {from: null, to: 'opening', reason: 'start'},
      {from: 'opening', to: 'keyChoice', reason: 'branch'},
      {from: 'keyChoice', to: 'touchChoice', reason: 'keyInput'},
      {from: 'touchChoice', to: 'ending', reason: 'touchInput'},
    ],
  );
  assert.equal(finished.status, 'finished');
  assert.equal(finished.sceneId, 'ending');
  assert.equal(touchListener, null);
  assert.deepEqual(cursors, [
    {visible: true, source: 'touch-input-1', cursor: 'pointer'},
    {visible: false, source: 'touch-input-1', cursor: 'pointer'},
  ]);
  await hostOf(result).dispose();
});

test('shares the public runtime snapshot with runtime expressions behind independent flags', async () => {
  const project = await packagedProject(
    `
kamishibai: '4.0'
variables:
  score: 1
controls:
  keymaps:
    production:
      Space: navigation.nextAction
branches:
  runtimeChoice:
    - if: 'score == 1 && runtime["status"] == "running" && runtime["scene.id"] == "opening" && runtime["action.number"] == 1'
      goto: matched
    - else: failed
scenes:
  opening:
    - branch: runtimeChoice
  failed: []
  matched: []
`,
    {sourceFrontend: runtimeStateFrontend},
  );
  const events: Readonly<Record<string, unknown>>[] = [];
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, platformFixture([]), {
      featureFlags: {
        dsl4Runtime: true,
        dsl4TurboWarpStateSurface: true,
        dsl4ExpressionRuntimeState: true,
      },
      sourceFrontend: runtimeStateFrontend,
      runtimeVersion: '4.0.0-test.1',
      onEvent(event: Readonly<Record<string, unknown>>) {
        events.push(event);
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(
    reported(hostOf(result).getRuntimeVariableSnapshot(), 'the variable snapshot').runtime,
    {
      status: 'idle',
      'scene.id': '',
      'action.number': 0,
      'action.path': '',
      'pose.phase': 'inactive',
      'pose.target': '',
      'pose.name': '',
      'pose.stepNumber': 0,
      version: '4.0.0-test.1',
    },
  );

  const finished = reported(await hostOf(result).start(), 'the finished state');
  assert.equal(finished.status, 'finished');
  assert.equal(
    events.some(
      (event: Readonly<Record<string, unknown>>) =>
        event.type === 'scene.enter' && event.sceneId === 'matched',
    ),
    true,
  );
  assert.deepEqual(
    reported(hostOf(result).getRuntimeVariableSnapshot(), 'the variable snapshot').storyVariables,
    {score: 1, startSceneIndex: 1},
  );
  await hostOf(result).dispose();
  assert.equal(
    reported(
      reported(hostOf(result).getRuntimeVariableSnapshot(), 'the variable snapshot').runtime,
      'its runtime variables',
    ).status,
    'stopped',
  );
});

test('fails closed for missing story input and injected built-in collisions, then cleans up', async () => {
  const inputStory = `
kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - keyInputToChangeScene:
        Digit1: ending
  ending:
    - wait: 0
`;
  const inputProject = await packagedProject(inputStory);
  const missingLog: LogEntry[] = [];
  await assert.rejects(
    createDsl4TurboWarpRuntimeHost(enabledOptions(inputProject, platformFixture(missingLog))),
    (error) => thrown(error).code === 'K4-HOST-PORT-MISSING',
  );
  assert.equal(missingLog.filter(([name]) => name === 'svg.release-all').length, 1);
  assert.equal(missingLog.filter(([name]) => name === 'media.release-all').length, 1);

  const waitProject = await packagedProject();
  const collisionLog: LogEntry[] = [];
  await assert.rejects(
    createDsl4TurboWarpRuntimeHost(
      enabledOptions(waitProject, platformFixture(collisionLog), {
        createHostPort() {
          return {
            stage() {},
            dispose() {
              collisionLog.push(['story-input.dispose']);
            },
          };
        },
      }),
    ),
    (error) => thrown(error).code === 'K4-HOST-PORT-COLLISION',
  );
  assert.equal(collisionLog.filter(([name]) => name === 'story-input.dispose').length, 1);
  assert.equal(collisionLog.filter(([name]) => name === 'media.release-all').length, 1);
});

test('releases an invalid Runtime Expression composition during partial creation', async () => {
  const project = await packagedProject();
  const log: LogEntry[] = [];
  await assert.rejects(
    createDsl4TurboWarpRuntimeHost(
      enabledOptions(project, platformFixture(log), {
        createRuntimeExpressionComposition() {
          log.push(['expression.create-invalid']);
          return {
            releaseAll() {
              log.push(['expression.release-all-invalid']);
            },
          };
        },
      }),
    ),
    /must provide evaluateCondition/u,
  );
  assert.equal(log.filter(([name]) => name === 'expression.release-all-invalid').length, 1);
  assert.equal(log.filter(([name]) => name === 'svg.release-all').length, 1);
  assert.equal(log.filter(([name]) => name === 'input.release-all').length, 1);
  assert.equal(log.filter(([name]) => name === 'media.release-all').length, 1);
});

test('stop cancels the default wait boundary and stale timer completion cannot resume execution', async () => {
  const project = await packagedProject(`
kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - wait: 30
    - wait: 0
`);
  const log: LogEntry[] = [];
  let scheduled: (() => void) | null = null;
  let cancellations = 0;
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, platformFixture(log), {
      waitSchedule(callback: () => void) {
        scheduled = callback;
        return () => {
          cancellations += 1;
        };
      },
    }),
  );
  assert.equal(result.ok, true);
  const run = hostOf(result).start();
  while (!scheduled) await Promise.resolve();
  const stopped = reported(hostOf(result).stop('test-stop'), 'the stopped state');
  assert.equal(stopped.status, 'stopped');
  await run;
  assert.equal(cancellations, 1);
  requireDefined<() => void>(scheduled, 'the scheduled pose tick')();
  await Promise.resolve();
  assert.equal(
    reported(reported(hostOf(result).getState(), 'the host state').runtime, 'its runtime state')
      .status,
    'stopped',
  );
  await hostOf(result).dispose();
});

test('dispose releases a host-owned pending input before awaiting runtime settlement', async () => {
  const project = await packagedProject(`
kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - keyInputToChangeScene:
        Digit1: ending
  ending:
    - wait: 0
`);
  const log: LogEntry[] = [];
  let settleInput: ((value: unknown) => void) | undefined;
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, platformFixture(log), {
      createHostPort() {
        return {
          keyInputToChangeScene() {
            log.push(['story-input.wait']);
            return new Promise<unknown>((resolve) => {
              settleInput = resolve;
            });
          },
          dispose() {
            log.push(['story-input.dispose']);
            settleInput?.('Digit1');
          },
        };
      },
    }),
  );
  const run = hostOf(result).start();
  while (!settleInput) await Promise.resolve();
  await hostOf(result).dispose('pending-input-dispose');
  await run;
  assert.equal(log.filter(([name]) => name === 'story-input.dispose').length, 1);
  assert.equal(
    reported(reported(hostOf(result).getState(), 'the host state').runtime, 'its runtime state')
      .status,
    'stopped',
  );
});

test('keeps resource ownership isolated across two host sessions', async () => {
  const project = await packagedProject();
  const firstLog: LogEntry[] = [];
  const secondLog: LogEntry[] = [];
  const first = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, platformFixture(firstLog)),
  );
  const second = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, platformFixture(secondLog)),
  );
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  await hostOf(first).dispose('first');
  assert.equal(firstLog.filter(([name]) => name === 'media.release-all').length, 1);
  assert.equal(secondLog.filter(([name]) => name === 'media.release-all').length, 0);
  assert.equal(
    reported(reported(hostOf(second).getState(), 'the host state').runtime, 'its runtime state')
      .status,
    'idle',
  );
  await hostOf(second).dispose('second');
  assert.equal(secondLog.filter(([name]) => name === 'media.release-all').length, 1);
});

test('attempts every partial cleanup and aggregates creation plus cleanup failures', async () => {
  const project = await packagedProject();
  const log: LogEntry[] = [];
  const fixture = platformFixture(log);
  const createAssetManagerComposition = fixture.createAssetManagerComposition;
  const createSvgTextComposition = fixture.createSvgTextComposition;
  fixture.createAssetManagerComposition = () => {
    const composition = createAssetManagerComposition();
    return {
      ...composition,
      releaseAll() {
        log.push(['media.release-all-failed']);
        throw new Error('media cleanup failed');
      },
    };
  };
  fixture.createSvgTextComposition = () => {
    const composition = createSvgTextComposition();
    return {
      ...composition,
      releaseAll() {
        log.push(['svg.release-all-failed']);
        throw new Error('SVG cleanup failed');
      },
    };
  };

  await assert.rejects(
    createDsl4TurboWarpRuntimeHost(
      enabledOptions(project, fixture, {
        createRuntimeExpressionComposition() {
          return {
            evaluateCondition() {
              return true;
            },
            releaseAll() {
              log.push(['expression.release-all']);
            },
          };
        },
        createHostPort() {
          return {stage() {}};
        },
      }),
    ),
    (error) => {
      assert.equal(error instanceof AggregateError, true);
      const failures = requireArray(thrown(error).errors, 'the aggregated failures');
      assert.equal(requireRecord(failures[0], 'the first failure').code, 'K4-HOST-PORT-COLLISION');
      assert.equal(failures.length, 3);
      return true;
    },
  );
  assert.equal(log.filter(([name]) => name === 'svg.release-all-failed').length, 1);
  assert.equal(log.filter(([name]) => name === 'expression.release-all').length, 1);
  assert.equal(log.filter(([name]) => name === 'media.release-all-failed').length, 1);
  assert.equal(log.filter(([name]) => name === 'pose.release-all').length, 1);
});

test('reports a remote pose model as runtime.fail when the preview has no remote loader', async () => {
  // The local preview bootstrap passes no loadRemoteAsset, so a remote pose directory cannot load.
  // The scene starts loading it in the background; the recognition action that waits for it
  // reports the failure, which must reach onEvent so the preview can display it.
  const project = await packagedProject(`
kamishibai: '4.0'
assets:
  RemotePose:
    kind: recognitionModel
    delivery: remote
    loading: lazy
    source:
      url: https://cdn.example.com/pose/
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    recognitionModel: RemotePose
    actions:
      - poseInputToChangeScene:
          Ready: ending
  ending:
    - wait: 0
`);
  const runtimeComponent = await loadDsl4RuntimeComponent(project, frontend, {
    ...limits,
    subtleCrypto,
  });
  assert.equal(runtimeComponent.ok, true, JSON.stringify(runtimeComponent.diagnostics));
  const events: Readonly<Record<string, unknown>>[] = [];
  const createSession = createDsl4TurboWarpPreviewSessionFactory({
    featureFlags: {dsl4Runtime: true},
    runtimeComponent,
    ...platformFixture([]),
    resetManagedPresentation() {},
    onEvent(event: Readonly<Record<string, unknown>>) {
      events.push(event);
    },
  });
  const session = await createSession({
    storyDocument: componentStory(runtimeComponent),
    previousSession: null,
    preserveManagedPresentation: false,
  });
  const finalState = reported(await session.start(), 'the final session state');
  const failure = events.find((event) => event.type === 'runtime.fail');
  assert.equal(
    reported(failure?.diagnostic, 'the runtime.fail diagnostic').code,
    'K4-ASSET-REMOTE-DISABLED',
    JSON.stringify({events, finalState}),
  );
  await session.dispose('preview-test');
});

test('audio is available without a new flag and releases instances at scene boundaries and finish', async () => {
  const project = await packagedProject(`kamishibai: '4.0'
controls:
  keymaps:
    production: {Space: navigation.nextAction}
scenes:
  opening:
    - audio: {id: music, url: 'https://example.com/music.mp3'}
    - audioControl: {id: music, operation: loop}
    - goto: ending
  ending:
    - audio: {id: music, url: 'https://example.com/ending.mp3'}
    - audioControl: {id: music, operation: play}
`);
  const fixture = platformFixture([]);
  const instances: {disposed: number; paused: boolean}[] = [];
  fixture.assetManagerComposition.createAudioPlayback = async () => {
    const state = {disposed: 0, paused: true};
    instances.push(state);
    return {
      ended: Promise.resolve(),
      loop: false,
      async play() {
        state.paused = false;
      },
      dispose() {
        state.paused = true;
        state.disposed++;
      },
    };
  };
  const result = await createDsl4TurboWarpRuntimeHost(enabledOptions(project, fixture));
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(reported(await hostOf(result).start(), 'runtime state').status, 'finished');
  assert.deepEqual(instances, [
    {disposed: 1, paused: true},
    {disposed: 1, paused: true},
  ]);
  await hostOf(result).dispose('audio-test');
  assert.equal(
    instances.every((instance) => instance.disposed === 1),
    true,
  );
});

test('publication host validates controller-owned variable actions without requiring platform ports', async () => {
  const project = await packagedProject(`kamishibai: '4.0'
variables: {score: 0, ready: false}
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  first:
    - setVariable: {name: score, value: 7}
    - changeVariable: {name: score, by: 1}
    - toggleVariable: ready
`);
  const result = await createDsl4TurboWarpRuntimeHost({
    ...enabledOptions(project, platformFixture([])),
    publicationSegmentId: 'chapter',
  });
  assert(result.ok);
  const host = hostOf(result);
  await host.preparePublicationScene('first');
  await host.start();
  const state = reported(host.getState().runtime, 'runtime');
  assert.deepEqual(state.variables, {score: 8, ready: true, startSceneIndex: 1});
  await host.dispose();
});

test('standalone host refuses chapter transfer without a publication owner', async () => {
  const project = await packagedProject(
    "kamishibai: '4.0'\ncontrols:\n  keymaps:\n    production:\n      Space: navigation.nextAction\nscenes:\n  first:\n    - gotoSegment: chapter2\n",
  );
  await assert.rejects(
    createDsl4TurboWarpRuntimeHost(enabledOptions(project, platformFixture([]))),
    /gotoSegment/,
  );
});

test('host and environment retry failed cleanup and join disposal reentry without repeating successful owners', async () => {
  const project = await packagedProject();
  const log: LogEntry[] = [];
  const fixture = platformFixture(log);
  let calls = 0;
  let nested: Promise<void> | null = null;
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      createHostPort() {
        return {
          dispose() {
            if (++calls === 1) {
              nested = host.dispose();
              void nested.catch(() => {});
              throw new Error('host port cleanup failed');
            }
          },
        };
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const host = hostOf(result);
  await assert.rejects(host.dispose(''), TypeError);
  assert.equal(calls, 0);
  const first = host.dispose();
  assert.equal(host.dispose(''), first);
  assert.equal(host.dispose(), first);
  await assert.rejects(first, AggregateError);
  await assert.rejects(requireDefined<Promise<void>>(nested, 'reentrant disposal'), AggregateError);
  await assert.rejects(
    async () => host.start(),
    (error) => thrown(error).code === 'K4-HOST-DISPOSED',
  );
  await host.dispose();
  assert.equal(calls, 2);
  assert.equal(log.filter(([name]) => name === 'media.release-all').length, 1);
  assert.equal(log.filter(([name]) => name === 'pose.release-all').length, 1);
  assert.equal(log.filter(([name]) => name === 'svg.release-all').length, 1);
  await host.dispose();
  assert.equal(calls, 2);
});

for (const whileDisposing of [false, true]) {
  test(`host retains a late failed camera across successful cleanup steps (while disposing: ${whileDisposing})`, async () => {
    const project = await packagedPoseProject(`
kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
actors:
  Hero: HeroIdle
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - goto: ending
  unreachablePose:
    recognitionModel: RescuePose
    actions:
      - Hero.pose:
          steps:
            - pose: help
  ending: []
`);
    const log: LogEntry[] = [];
    const fixture = platformFixture(log);
    const permission = deferred();
    const requested = deferred();
    const tmDisposing = deferred();
    const tmReleased = deferred();
    const failed = deferred<unknown>();
    let running = false;
    let stops = 0;
    let reports = 0;
    const failure = new Error('late host camera stop failed');
    fixture.tmComposition.registerPoseModel = ({name}: {name: unknown}) => ({
      name,
      labels: ['help'],
    });
    fixture.tmComposition.startCamera = async () => {
      requested.resolve();
      await permission.promise;
      running = true;
    };
    fixture.tmComposition.isCameraRunning = () => running;
    fixture.tmComposition.stopCamera = () => {
      if (++stops === 1) throw failure;
      running = false;
    };
    fixture.tmComposition.releaseAll = async () => {
      log.push(['pose.release-all']);
      tmDisposing.resolve();
      if (whileDisposing) await tmReleased.promise;
    };
    const result = await createDsl4TurboWarpRuntimeHost(
      enabledOptions(project, fixture, {
        onBackgroundActionError(error: unknown, context: Record<string, unknown>) {
          if (context.code === 'K4-STORY-CAMERA-CLEANUP') {
            reports++;
            failed.resolve(error);
          }
        },
      }),
    );
    assert(result.ok, JSON.stringify(result.diagnostics));
    const host = hostOf(result);
    const run = host.start();
    await withDeadline(requested.promise, 'host camera permission request', 3000);
    await run;
    const first = host.dispose();
    await withDeadline(tmDisposing.promise, 'host TM cleanup', 3000);
    if (!whileDisposing) await first;
    assert.equal(host.hasPendingCleanup(), true, 'the unanswered permission still has an owner');
    permission.resolve();
    assert.equal(
      await withDeadline(failed.promise, 'late host camera cleanup error', 3000),
      failure,
    );
    tmReleased.resolve();
    await first;
    assert.equal(host.hasPendingCleanup(), true);
    const retry = host.dispose();
    assert.strictEqual(host.dispose(), retry);
    await retry;
    assert.equal(host.hasPendingCleanup(), false);
    assert.equal(stops, 2);
    assert.equal(running, false);
    assert.equal(reports, 1);
    for (const event of ['media.release-all', 'pose.release-all', 'svg.release-all']) {
      assert.equal(log.filter(([name]) => name === event).length, 1);
    }
    await host.dispose();
    assert.equal(stops, 2);
    assert.throws(
      () => host.start(),
      (error) => thrown(error).code === 'K4-HOST-DISPOSED',
    );
  });
}

test('partial environment failure retains failed cleanup without repeating successful compositions', async () => {
  const project = await packagedProject();
  const log: LogEntry[] = [];
  const fixture = platformFixture(log);
  const create = fixture.createAssetManagerComposition;
  let releases = 0;
  fixture.createAssetManagerComposition = () => ({
    ...create(),
    releaseAll() {
      if (++releases === 1) throw new Error('media cleanup failed');
    },
  });
  let rejected: unknown;
  try {
    await createDsl4TurboWarpRuntimeHost(
      enabledOptions(project, fixture, {
        createHostPort() {
          return {stage() {}};
        },
      }),
    );
    assert.fail('factory must reject');
  } catch (error) {
    rejected = error;
  }
  const cleanup = creationCleanup(rejected);
  assert.equal(cleanup.hasPendingCleanup(), true);
  assert.equal(releases, 1);
  const poseReleases = log.filter(([name]) => name === 'pose.release-all').length;
  await cleanup.dispose();
  assert.equal(releases, 2);
  assert.equal(log.filter(([name]) => name === 'pose.release-all').length, poseReleases);
  assert.equal(cleanup.hasPendingCleanup(), false);
});

test('nested partial asset factory failure reaches the host caller without an implicit retry', async () => {
  const project = await packagedProject();
  const fixture = platformFixture([]);
  const create = fixture.createAssetManagerComposition;
  let calls = 0;
  fixture.createAssetManagerComposition = () => ({
    ...create(),
    releaseAll() {
      if (++calls < 3) throw new Error('media cleanup failed');
    },
  });
  fixture.createTMComposition = () => {
    throw new Error('TM factory failed');
  };
  let caught: unknown;
  try {
    await createDsl4TurboWarpRuntimeHost(enabledOptions(project, fixture));
  } catch (error) {
    caught = error;
  }
  const cleanup = creationCleanup(caught);
  assert.equal(calls, 1);
  await assert.rejects(cleanup.dispose(), AggregateError);
  assert.equal(calls, 2);
  await cleanup.dispose();
  assert.equal(calls, 3);
  assert.equal(cleanup.hasPendingCleanup(), false);
});

test('invalid returned host port retains its disposal callback before validation fails', async () => {
  const project = await packagedProject();
  const fixture = platformFixture([]);
  let calls = 0;
  let caught: unknown;
  try {
    await createDsl4TurboWarpRuntimeHost(
      enabledOptions(project, fixture, {
        createHostPort: () => ({
          invalid: true,
          dispose() {
            if (++calls === 1) throw new Error('host port cleanup failed');
          },
        }),
      }),
    );
  } catch (error) {
    caught = error;
  }
  const cleanup = creationCleanup(caught);
  assert.equal(calls, 1);
  await cleanup.dispose();
  assert.equal(calls, 2);
  assert.equal(cleanup.hasPendingCleanup(), false);
});

for (const asynchronous of [false, true])
  test(`partial environment retains SVG cleanup failure for explicit retry (async: ${asynchronous})`, async () => {
    const project = await packagedProject();
    const log: LogEntry[] = [];
    const f = platformFixture(log),
      createSvg = f.createSvgTextComposition;
    const failure = new Error('SVG cleanup failed');
    let calls = 0,
      live = true;
    f.createSvgTextComposition = () => ({
      ...createSvg(),
      releaseAll() {
        if (++calls < 3) {
          if (asynchronous) {
            const operation = Promise.reject(failure);
            void operation.catch(() => {});
            return operation;
          }
          throw failure;
        }
        live = false;
      },
    });
    let caught: unknown;
    try {
      await createDsl4TurboWarpRuntimeHost(
        enabledOptions(project, f, {createHostPort: () => ({stage() {}})}),
      );
    } catch (error) {
      caught = error;
    }
    const cleanup = creationCleanup(caught);
    assert.equal(calls, 1);
    assert(cleanup.hasPendingCleanup());
    const retry = cleanup.dispose();
    assert.equal(retry, cleanup.dispose());
    await assert.rejects(retry, AggregateError);
    assert.equal(calls, 2);
    assert.equal(live, true);
    assert(cleanup.hasPendingCleanup());
    await cleanup.dispose();
    assert.equal(calls, 3);
    assert.equal(live, false);
    assert.equal(cleanup.hasPendingCleanup(), false);
    for (const event of [
      'media.release-all',
      'pose.release-all',
      'bubble.release-all',
      'input.release-all',
    ])
      assert.equal(log.filter(([name]) => name === event).length, 1, `${event} is not repeated`);
    await cleanup.dispose();
    assert.equal(calls, 3);
  });

for (const mode of [
  'ready',
  'attachment-failed',
  'late',
  'input-release',
  'factory-failed',
  'partial-attachment',
  'late-factory-failed',
] as const) {
  test(`preview retains environment cleanup ownership after ${mode} failure`, async () => {
    const project = await packagedProject();
    const component = await loadDsl4RuntimeComponent(project, frontend, {...limits, subtleCrypto});
    const log: LogEntry[] = [];
    const fixture = platformFixture(log);
    const create = fixture.createAssetManagerComposition;
    let releases = 0;
    const failedBeforeDispose = [
      'attachment-failed',
      'factory-failed',
      'partial-attachment',
    ].includes(mode);
    const failures = failedBeforeDispose ? 2 : 1;
    fixture.createAssetManagerComposition = (...args) => {
      const composition = create(...args);
      return {
        ...composition,
        releaseAll() {
          if (++releases <= failures) throw new Error('preview media release');
          const releaseAll = composition.releaseAll;
          assert.ok(typeof releaseAll === 'function');
          Reflect.apply(releaseAll, composition, []);
        },
      };
    };
    const input = createFakeDocument();
    const removeInput = input.removeEventListener.bind(input);
    if (mode === 'partial-attachment') {
      const addInput = input.addEventListener.bind(input);
      input.addEventListener = (...args) => {
        addInput(...args);
        throw new Error('partial attachment');
      };
    }
    let removals = 0;
    input.removeEventListener = (...args) => {
      if (args[0] === 'keydown' && ++removals === 1) throw new Error('input removal');
      removeInput(...args);
    };
    const gate = deferred<void>();
    let resolving = false;
    const createSession = createDsl4TurboWarpPreviewSessionFactory({
      featureFlags: {dsl4Runtime: true},
      runtimeComponent: component,
      ...fixture,
      ...(mode === 'attachment-failed' ? {inputTarget: {}} : {}),
      ...(mode === 'factory-failed' || mode === 'late-factory-failed'
        ? {
            createHostPort() {
              throw new Error('factory failure');
            },
          }
        : {}),
      ...(mode === 'input-release' || mode === 'partial-attachment' ? {inputTarget: input} : {}),
      ...(mode === 'late' || mode === 'late-factory-failed'
        ? {
            async resolveRuntimeComponent({storyDocument}: {storyDocument: unknown}) {
              resolving = true;
              await gate.promise;
              return {...component, storyDocument};
            },
          }
        : {}),
      resetManagedPresentation() {},
    });
    const session = await createSession({
      storyDocument: componentStory(component),
      previousSession: null,
      preserveManagedPresentation: false,
    });
    const start = session.start();
    if (mode === 'ready' || mode === 'input-release') await start;
    else if (
      mode === 'attachment-failed' ||
      mode === 'factory-failed' ||
      mode === 'partial-attachment'
    ) {
      await assert.rejects(start, /(?:creation|factory) fail/);
      assert.equal(releases, 1);
    } else {
      await waitUntil(() => resolving);
    }
    const first = session.dispose('preview-close');
    assert.equal(session.dispose('same-attempt'), first);
    const failed = assert.rejects(first, AggregateError);
    if (mode === 'late' || mode === 'late-factory-failed') {
      const stopped = assert.rejects(start, mode === 'late' ? /disposed/ : /factory failure/);
      gate.resolve();
      await stopped;
    }
    await failed;
    assert.equal(
      releases,
      failures,
      'a completed initialization failure is retried only by explicit disposal',
    );
    assert.equal(log.filter(([name]) => name === 'pose.release-all').length, 1);
    await assert.rejects(session.start(), /disposed/);
    assert.equal(session.hasPendingCleanup(), true);
    if (mode === 'input-release') {
      assert.equal(input.listenerCount('keydown'), 1);
      if (mode === 'input-release') assert.equal(session.getState().disposed, true);
      const previous = log.length;
      input.dispatchKey('Space');
      await Promise.resolve();
      assert.equal(log.length, previous, 'retained listener must not execute input');
    }
    await session.dispose('explicit-retry');
    assert.equal(releases, failures + 1);
    assert.equal(session.hasPendingCleanup(), false);
    if (mode === 'input-release' || mode === 'partial-attachment') {
      assert.equal(input.listenerCount('keydown'), 0);
      assert.equal(removals, 2);
    }
    assert.equal(log.filter(([name]) => name === 'pose.release-all').length, 1);
  });
}

test('does not reset managed presentation when preview is disposed immediately after start', async () => {
  const project = await packagedProject();
  const component = await loadDsl4RuntimeComponent(project, frontend, {...limits, subtleCrypto});
  const log: LogEntry[] = [];
  let resets = 0;
  const createSession = createDsl4TurboWarpPreviewSessionFactory({
    featureFlags: {dsl4Runtime: true},
    runtimeComponent: component,
    ...platformFixture(log),
    resetManagedPresentation() {
      resets++;
    },
  });
  const session = await createSession({
    storyDocument: componentStory(component),
    previousSession: null,
    preserveManagedPresentation: false,
  });
  const start = session.start();
  const rejected = assert.rejects(start, /disposed/);
  const closing = session.dispose();
  assert.equal(session.dispose(), closing);
  await closing;
  await rejected;
  assert.equal(resets, 0);
  assert.deepEqual(log, []);
  assert.equal(session.hasPendingCleanup(), false);
});

test('forwards the selected compute mode from the runtime host to the Teachable Machine owner', async () => {
  const project = await packagedProject(waitStory);
  const fixture = platformFixture([]);
  const selection = {
    mode: 'wasm',
    backend: 'wasm',
    requested: 'wasm',
    fallback: false,
    attempts: [],
  } as const;
  const compute = {
    select: async () => selection,
    getSelection: () => selection,
    getBackend: () => 'wasm',
  };
  let received: unknown;
  const result = await createDsl4TurboWarpRuntimeHost(
    enabledOptions(project, fixture, {
      compute,
      computeMode: 'wasm',
      createTMComposition(options: unknown) {
        received = options;
        return fixture.tmComposition;
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  try {
    await hostOf(result).start();
    const options = requireRecord(received, 'the Teachable Machine composition options');
    assert.equal(options.compute, compute);
    assert.equal(options.computeMode, 'wasm');
  } finally {
    await hostOf(result).dispose('compute-mode-test');
  }
});
