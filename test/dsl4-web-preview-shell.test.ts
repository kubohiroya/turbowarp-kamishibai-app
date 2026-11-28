import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'vitest';

import {createDsl4WebPreviewShell, dsl4WebPreviewShellManifest} from '../src/builder/index.js';
import {
  createFakeDocument,
  requireById,
  requireFakeElement,
  type FakeElement,
} from './helpers/fake-dom.ts';
import {requireDefined, requireRecord} from './helpers/require-value.ts';

type WebPreviewShell = ReturnType<typeof createDsl4WebPreviewShell>;
type EnabledWebPreviewShell = Extract<WebPreviewShell, {whenIdle: unknown}>;

/** The `[member, ...arguments]` rows the fixtures record. */
type FixtureCall = [string, ...unknown[]];

/** The observers the shell installs on the coordinator it creates. */
interface CoordinatorOptions {
  onProjectRoot?: (root: unknown) => unknown;
  beforeSourceStage?: (result: unknown) => unknown;
  onSourceResult(result: unknown): unknown;
  onSourceStatus(status: unknown): unknown;
  onSourceDiagnostic(diagnostic: unknown): unknown;
  onProtocolEvent(event: unknown): unknown;
  [option: string]: unknown;
}

/** The options the shell hands the asset pipeline it owns. */
interface AssetPipelineOptions {
  sessionId: string;
  onDiagnostic(diagnostic: unknown): Promise<unknown>;
  reloadSurface: Record<string, unknown>;
  [option: string]: unknown;
}

/** Read the enabled shell; the factory's return also covers the flag-off shell. */
function enabledShell(shell: WebPreviewShell): EnabledWebPreviewShell {
  assert('whenIdle' in shell, 'expected the Web Preview shell to be enabled');
  return shell;
}

function rootOf(shell: EnabledWebPreviewShell): FakeElement {
  return requireFakeElement(shell.element, 'the Web Preview shell element');
}

function callAt(calls: readonly FixtureCall[], index: number): FixtureCall {
  return requireDefined(calls.at(index), `fixture call ${index}`);
}

function argumentAt(calls: readonly FixtureCall[], index: number, position: number): unknown {
  return callAt(calls, index)[position];
}

function snapshotOf(shell: EnabledWebPreviewShell): Record<string, unknown> {
  return requireRecord(shell.getSnapshot(), 'the shell snapshot');
}

/** One member of the snapshot the shell publishes. */
function snapshotMember(shell: EnabledWebPreviewShell, member: string): Record<string, unknown> {
  return requireRecord(snapshotOf(shell)[member], `its ${member}`);
}

function overlayOf(shell: EnabledWebPreviewShell): Record<string, unknown> {
  return requireRecord(snapshotMember(shell, 'reloadOverlay').overlay, 'the reload overlay');
}

function overlayPolicy(shell: EnabledWebPreviewShell): Record<string, unknown> {
  return requireRecord(overlayOf(shell).policy, 'the overlay policy');
}

/** The layout state the overlay resolved, one level below its layout member. */
function overlayLayout(shell: EnabledWebPreviewShell): Record<string, unknown> {
  return requireRecord(
    requireRecord(overlayOf(shell).layout, 'the overlay layout').layout,
    'its layout state',
  );
}

const enabledFlags = Object.freeze({
  dsl4Runtime: true,
  dsl4AppShell: true,
  dsl4WebPreviewAdapter: true,
});
const assetEnabledFlags = Object.freeze({
  ...enabledFlags,
  dsl4WebPreviewAssetLiveReload: true,
});
// Include needs no flag; the included-source tests use the asset live reload flags as they are.
const includedAssetEnabledFlags = assetEnabledFlags;

function sri(value: string) {
  return `sha256-${createHash('sha256').update(value).digest('base64')}`;
}

function sourceResult(integrity: string, {warnings = 0}: {warnings?: number} = {}) {
  return Object.freeze({
    ok: true,
    canonicalSource: 'canonical source',
    diagnostics: Array.from({length: warnings}, (_, index) => ({
      version: 1,
      code: `K4-TEST-WARNING-${index}`,
      severity: 'warning',
      message: 'Fixture warning',
      sourceId: 'main',
      range: {
        start: {line: 1, column: 1, offset: 0},
        end: {line: 1, column: 1, offset: 0},
      },
      path: '$',
      related: [],
    })),
    storyDocument: {
      kind: 'StoryDocument',
      version: '4.0',
      scenes: [
        {id: 'opening', actions: [{id: 'one'}, {id: 'two'}]},
        {id: 'ending', actions: []},
      ],
      assetReferences: [{id: 'backdrop'}],
    },
    sourceSnapshot: {
      integrity,
      displayName: 'story.kamishibai.yaml',
      text: 'must not escape the source callback',
    },
  });
}

function createCoordinatorFixture() {
  let options: CoordinatorOptions | undefined;
  const calls: FixtureCall[] = [];
  let disposed = false;
  let sourceStarted = false;
  let current: unknown = null;
  let candidate: unknown = null;
  let lastPublication: unknown = null;
  const state = () => ({
    version: 1,
    disposed,
    source: {started: sourceStarted, status: 'idle', lastPublication},
    protocol: {current, candidate, status: candidate ? 'candidate' : 'connected', pendingStages: 0},
  });
  const coordinator = {
    openProject() {
      calls.push(['openProject']);
      return Promise.resolve(state());
    },
    async start(root: unknown) {
      calls.push(['start', root]);
      sourceStarted = true;
      await options?.onProjectRoot?.(root);
      return state();
    },
    pollNow() {
      calls.push(['pollNow']);
      return Promise.resolve(state());
    },
    commit(choice: unknown) {
      calls.push(['commit', choice]);
      return Promise.resolve(state());
    },
    restart(choice: unknown) {
      calls.push(['restart', choice]);
      return Promise.resolve(state());
    },
    defer() {
      calls.push(['defer']);
      return Promise.resolve(state());
    },
    dispose() {
      calls.push(['dispose']);
      disposed = true;
      return Promise.resolve(state());
    },
    getState() {
      return state();
    },
    whenIdle() {
      return Promise.resolve(state());
    },
  };
  return {
    calls,
    coordinator,
    get options(): CoordinatorOptions {
      return requireDefined(options, 'the coordinator options');
    },
    get disposed() {
      return disposed;
    },
    setCurrent(value: unknown) {
      current = value;
    },
    setPublication(value: unknown) {
      lastPublication = value;
    },
    setCandidate(value: unknown) {
      candidate = value;
    },
    createCoordinator(input: CoordinatorOptions) {
      options = input;
      return coordinator;
    },
  };
}

function createAssetPipelineFixture({transactionStatus}: {transactionStatus?: string} = {}) {
  let options: AssetPipelineOptions | undefined;
  let started = false;
  let disposed = false;
  const calls: FixtureCall[] = [];
  const state = () => ({
    version: 1,
    started,
    disposed,
    ...(transactionStatus === undefined ? {} : {transaction: {status: transactionStatus}}),
  });
  const pipeline = {
    start(root: unknown, context: unknown) {
      started = true;
      calls.push(['start', root, context]);
      return Promise.resolve(state());
    },
    updateSource(context: unknown) {
      calls.push(['updateSource', context]);
      return Promise.resolve(state());
    },
    pollNow() {
      calls.push(['pollNow']);
      return Promise.resolve(state());
    },
    dispose() {
      disposed = true;
      calls.push(['dispose']);
      return Promise.resolve(state());
    },
    getState: state,
    whenIdle() {
      calls.push(['whenIdle']);
      return Promise.resolve(state());
    },
  };
  return {
    calls,
    pipeline,
    get options(): AssetPipelineOptions {
      return requireDefined(options, 'the asset pipeline options');
    },
    createAssetPipeline(input: AssetPipelineOptions) {
      options = input;
      return pipeline;
    },
  };
}

function createShell({
  featureFlags = enabledFlags,
  presentation,
  previewLocale,
  onDiagnostic,
}: {
  featureFlags?: Readonly<Record<string, boolean>>;
  presentation?: string;
  previewLocale?: 'en' | 'ja';
  onDiagnostic?: (diagnostic: unknown, channel: unknown) => unknown;
} = {}) {
  const document = createFakeDocument();
  const fixture = createCoordinatorFixture();
  const errors: unknown[] = [];
  const shell = createDsl4WebPreviewShell({
    featureFlags,
    environment: 'development',
    document,
    mount: document.body,
    protocolSession: {},
    sessionId: 'web-preview-test',
    sourceFrontend: {parse() {}},
    maxSourceBytes: 8192,
    ...(presentation === undefined ? {} : {presentation}),
    ...(previewLocale === undefined ? {} : {previewLocale}),
    createCoordinator: fixture.createCoordinator,
    ...(onDiagnostic === undefined ? {} : {onDiagnostic}),
    onError: (error: unknown) => errors.push(error),
  });
  return {document, errors, fixture, shell: enabledShell(shell)};
}

test('keeps Web Preview unregistered and unread when its startup flag is OFF', () => {
  let factoryCalls = 0;
  const shell = createDsl4WebPreviewShell({
    featureFlags: {dsl4Runtime: true, dsl4AppShell: true},
    document: new Proxy({}, {get: () => assert.fail('document must not be read')}),
    mount: new Proxy({}, {get: () => assert.fail('mount must not be read')}),
    createCoordinator() {
      factoryCalls += 1;
      assert.fail('coordinator must not be created');
    },
    createAssetPipeline() {
      assert.fail('asset pipeline must not be created');
    },
  });
  assert.equal(shell.enabled, false);
  assert.equal(shell.element, null);
  assert.equal(factoryCalls, 0);
  assert.equal(shell.getSnapshot().enabled, false);
  assert.equal(Object.isFrozen(shell.featureFlags), true);
  assert.deepEqual(shell.dispose(), shell.getSnapshot());
});

test('requires the runtime and App Shell flags and remains development-only', () => {
  assert.throws(
    () => createDsl4WebPreviewShell({featureFlags: {dsl4WebPreviewAdapter: true}}),
    /requires dsl4Runtime and dsl4AppShell/u,
  );
  assert.throws(
    () =>
      createDsl4WebPreviewShell({
        featureFlags: enabledFlags,
        environment: 'production',
        document: {},
        mount: {},
        protocolSession: {},
        sessionId: 'test',
        sourceFrontend: {},
        maxSourceBytes: 1,
      }),
    /development/u,
  );
  assert.deepEqual(dsl4WebPreviewShellManifest, {
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
});

test('stabilizes included assets before allowing a Source Graph candidate to stage', async () => {
  const document = createFakeDocument();
  const source = createCoordinatorFixture();
  const assets = createAssetPipelineFixture({transactionStatus: 'ready'});
  const shell = enabledShell(
    createDsl4WebPreviewShell({
      featureFlags: includedAssetEnabledFlags,
      environment: 'development',
      document,
      mount: document.body,
      protocolSession: {},
      sessionId: 'included-asset-shell-test',
      sourceFrontend: {parse() {}},
      maxSourceBytes: 8192,
      maxSourceFiles: 8,
      maxTotalSourceBytes: 32 * 1024,
      maxIncludeDepth: 4,
      createCoordinator: source.createCoordinator,
      createAssetPipeline: assets.createAssetPipeline,
      assetPipelineOptions: {
        structuralFingerprint: sri('included-structure'),
        adapterOptions: {},
        prepareGeneration() {},
      },
    }),
  );
  const root = {kind: 'directory'};
  await requireDefined(source.options.onProjectRoot, 'the project root observer')(root);
  const plain = sourceResult(sri('included-source'));
  // A source that declared `include` comes back composed, carrying the origin of each StoryPath.
  const result = Object.freeze({
    ...plain,
    storyDocument: {...plain.storyDocument, sourceOrigins: {}},
  });
  await requireDefined(source.options.beforeSourceStage, 'the stage gate')(result);

  assert.deepEqual(
    assets.calls.map(([name]) => name),
    ['start'],
  );
  assert.equal(argumentAt(assets.calls, 0, 1), root);
  assert.equal(
    requireRecord(argumentAt(assets.calls, 0, 2), 'the pipeline context').sourceResult,
    result,
  );
  assert.equal(
    assets.calls.some(([name]) => name === 'updateSource'),
    false,
  );
  await shell.dispose();
});

test('requires and owns the browser asset pipeline only behind its startup flag', async () => {
  assert.throws(
    () =>
      createDsl4WebPreviewShell({
        featureFlags: assetEnabledFlags,
        environment: 'development',
        document: createFakeDocument(),
        mount: createFakeDocument().body,
        protocolSession: {},
        sessionId: 'missing-asset-options',
        sourceFrontend: {parse() {}},
        maxSourceBytes: 8192,
      }),
    /assetPipelineOptions/u,
  );

  const document = createFakeDocument();
  const source = createCoordinatorFixture();
  const assets = createAssetPipelineFixture();
  const structuralFingerprint = sri('structure');
  const shell = enabledShell(
    createDsl4WebPreviewShell({
      featureFlags: assetEnabledFlags,
      environment: 'development',
      document,
      mount: document.body,
      protocolSession: {},
      sessionId: 'asset-shell-test',
      sourceFrontend: {parse() {}},
      maxSourceBytes: 8192,
      createCoordinator: source.createCoordinator,
      createAssetPipeline: assets.createAssetPipeline,
      assetPipelineOptions: {
        structuralFingerprint,
        adapterOptions: {},
        prepareGeneration() {},
      },
    }),
  );
  const root = {kind: 'directory'};
  await shell.start(root);
  const result = sourceResult(sri('asset-source'));
  source.options.onSourceResult(result);
  await shell.whenIdle();
  assert.equal(assets.options.sessionId, 'asset-shell-test');
  assert.equal(callAt(assets.calls, 0)[0], 'start');
  assert.equal(argumentAt(assets.calls, 0, 1), root);
  assert.equal(
    requireRecord(argumentAt(assets.calls, 0, 2), 'the pipeline context').sourceResult,
    result,
  );
  assert.equal(
    requireRecord(argumentAt(assets.calls, 0, 2), 'the pipeline context').structuralFingerprint,
    structuralFingerprint,
  );
  assert.deepEqual(snapshotMember(shell, 'assetPipeline'), {
    version: 1,
    started: true,
    disposed: false,
  });
  await shell.pollNow();
  assert.equal(
    assets.calls.some(([name]) => name === 'pollNow'),
    true,
  );
  await shell.dispose();
  assert.equal(
    assets.calls.some(([name]) => name === 'dispose'),
    true,
  );
});

test('connects the owned asset pipeline and camera layout bridge to the shared Web surface', async () => {
  const document = createFakeDocument();
  const source = createCoordinatorFixture();
  const assets = createAssetPipelineFixture();
  const shell = enabledShell(
    createDsl4WebPreviewShell({
      featureFlags: {
        ...assetEnabledFlags,
        dsl4PreviewReloadOverlay: true,
      },
      environment: 'development',
      document,
      mount: document.body,
      protocolSession: {},
      sessionId: 'composite-shell-test',
      sourceFrontend: {parse() {}},
      maxSourceBytes: 8192,
      createCoordinator: source.createCoordinator,
      createAssetPipeline: assets.createAssetPipeline,
      assetPipelineOptions: {
        structuralFingerprint: sri('composite-structure'),
        adapterOptions: {},
        prepareGeneration() {},
        restartGeneration() {},
      },
      previewViewport: {width: 800, height: 600},
    }),
  );

  assert.equal(typeof assets.options.reloadSurface.submitCandidate, 'function');
  await assets.options.onDiagnostic({
    code: 'K4-ASSET-MISSING',
    severity: 'error',
    message: 'Asset missing.',
  });
  await shell.whenIdle();
  assert.deepEqual(snapshotMember(shell, 'reloadOverlay').diagnosticChannels, ['asset']);

  const occupied = overlayLayout(shell).rect;
  shell.registerReservedRect('camera-controls', occupied);
  assert.equal(overlayLayout(shell).resolvedAnchor, 'top-center');
  shell.unregisterReservedRect('camera-controls');
  assert.equal(overlayLayout(shell).resolvedAnchor, 'top-right');
  await shell.dispose();
});

test('opens the picker directly from a button activation and renders watch status', async () => {
  const {document, fixture, shell} = createShell();
  const button = requireById(rootOf(shell), 'dsl4-web-preview-open-project');
  const status = requireById(rootOf(shell), 'dsl4-web-preview-watch-status');
  assert.equal(rootOf(shell).parentNode, document.body);
  button.click();
  assert.deepEqual(fixture.calls, [['openProject']]);
  fixture.options.onSourceStatus({
    status: 'watching-visible',
    started: true,
    sourceDisplayName: 'story.kamishibai.yaml',
  });
  assert.equal(button.disabled, true);
  assert.match(status.textContent, /Watching/u);
  await shell.whenIdle();
});

test('keeps runtime reload controls hidden until the story lifecycle enables them', async () => {
  const {fixture, shell} = createShell({
    featureFlags: {...enabledFlags, dsl4PreviewReloadOverlay: true},
    presentation: 'runtime',
    previewLocale: 'ja',
  });
  assert.equal(rootOf(shell).getAttribute('data-preview-presentation'), 'runtime');
  for (const id of [
    'dsl4-web-preview-title',
    'dsl4-web-preview-open-project',
    'dsl4-web-preview-watch-status',
    'dsl4-web-preview-diagnostic',
    'dsl4-web-preview-fallback',
    'dsl4-web-preview-reload-mount',
  ]) {
    assert.equal(requireById(rootOf(shell), id).hidden, true, `${id} must remain hidden`);
  }
  assert(requireById(rootOf(shell), 'dsl4-preview-reload-status-button'));
  const overlay = requireById(rootOf(shell), 'dsl4-preview-reload-overlay');
  assert.equal(overlay.hidden, true);
  assert.equal(overlay.getAttribute('lang'), 'ja');
  shell.setReloadVisible(true);
  assert.equal(overlay.hidden, false);
  shell.setReloadVisible(false);
  assert.equal(overlay.hidden, true);
  await shell.restart('storyStart');
  assert.deepEqual(fixture.calls.at(-1), ['restart', 'storyStart']);
  await shell.dispose();
});

test('prepares only the latest valid project generation for a browser distribution build', async () => {
  const {fixture, shell} = createShell({
    featureFlags: {...enabledFlags, dsl4BrowserDistributionBuild: true},
  });
  assert.deepEqual(shell.getDistributionBuildState(), {
    enabled: false,
    reason: 'Open a project directory first.',
  });
  const root = {kind: 'directory'};
  await shell.start(root);
  const integrity = sri('browser-distribution');
  const result = sourceResult(integrity);
  fixture.options.onSourceResult(result);
  fixture.setPublication({kind: 'source', integrity, ok: true, diagnosticCount: 0});

  assert.deepEqual(shell.getDistributionBuildState(), {enabled: true, reason: null, integrity});
  const prepared = await shell.prepareDistributionBuild();
  assert.strictEqual(prepared.projectRoot, root);
  assert.strictEqual(prepared.sourceResult, result);
  assert.equal(prepared.integrity, integrity);
  assert.equal(
    fixture.calls.some(([name]) => name === 'pollNow'),
    true,
  );

  fixture.setCandidate({id: 1});
  assert.equal(shell.getDistributionBuildState().enabled, false);
  fixture.setCandidate(null);

  fixture.options.onSourceDiagnostic({
    code: 'K4-YAML-001',
    severity: 'error',
    message: 'The latest source is invalid.',
  });
  assert.equal(shell.getDistributionBuildState().enabled, false);
  await assert.rejects(shell.prepareDistributionBuild(), {code: 'K4-BROWSER-BUILD-NOT-READY'});
  await shell.dispose();
});

test('maps staged sources and reload choices onto the existing accessible shell', async () => {
  const {fixture, shell} = createShell();
  const initialIntegrity = sri('initial');
  fixture.options.onSourceResult(sourceResult(initialIntegrity));
  fixture.setCurrent({integrity: initialIntegrity});
  fixture.options.onProtocolEvent({
    type: 'preview.source.staged',
    sourceIntegrity: initialIntegrity,
    status: 'active',
    candidate: null,
    current: {integrity: initialIntegrity},
    diagnostics: [],
  });
  assert.equal(snapshotMember(shell, 'preview').phase, 'running');
  assert.deepEqual(snapshotMember(shell, 'preview').counts, {scenes: 2, actions: 2, assets: 1});

  const candidateIntegrity = sri('candidate');
  fixture.options.onSourceResult(sourceResult(candidateIntegrity, {warnings: 1}));
  fixture.options.onProtocolEvent({
    type: 'preview.source.staged',
    sourceIntegrity: candidateIntegrity,
    status: 'pending',
    candidate: {
      id: 2,
      options: {
        storyStart: {enabled: true, reason: null},
        currentScene: {enabled: true, reason: null},
        currentAction: {enabled: false, reason: 'The current action changed.'},
      },
    },
    current: {integrity: initialIntegrity},
    diagnostics: [],
  });
  assert.equal(snapshotMember(shell, 'preview').phase, 'candidate');
  assert.equal(snapshotMember(shell, 'preview').warningCount, 1);
  requireById(rootOf(shell), 'dsl4-preview-reload-2').click();
  assert.deepEqual(fixture.calls.at(-1), ['commit', 'currentScene']);

  fixture.setCurrent({integrity: candidateIntegrity});
  fixture.options.onProtocolEvent({
    type: 'preview.source.committed',
    current: {integrity: candidateIntegrity},
  });
  assert.equal(snapshotMember(shell, 'preview').phase, 'running');
  assert.equal(snapshotMember(shell, 'preview').currentIntegrity, candidateIntegrity);
  await new Promise((resolve) => setImmediate(resolve));
});

test('auto-applies source updates through the shared non-blocking Web/CLI reload surface', async () => {
  const {document, fixture, shell} = createShell({
    featureFlags: {...enabledFlags, dsl4PreviewReloadOverlay: true},
  });
  const initialIntegrity = sri('overlay-initial');
  fixture.options.onSourceResult(sourceResult(initialIntegrity));
  fixture.setCurrent({integrity: initialIntegrity});
  fixture.options.onProtocolEvent({
    type: 'preview.source.staged',
    revision: 1,
    sourceIntegrity: initialIntegrity,
    status: 'active',
    candidate: null,
    current: {integrity: initialIntegrity},
    diagnostics: [],
  });

  const candidateIntegrity = sri('overlay-candidate');
  fixture.options.onSourceResult(sourceResult(candidateIntegrity));
  fixture.options.onProtocolEvent({
    type: 'preview.source.staged',
    revision: 2,
    sourceIntegrity: candidateIntegrity,
    status: 'pending',
    candidate: {
      id: 2,
      options: {
        storyStart: {enabled: true, reason: null},
        currentScene: {enabled: true, reason: null},
        currentAction: {enabled: false, reason: 'The current action is not replay-safe.'},
      },
    },
    current: {integrity: initialIntegrity},
    diagnostics: [],
  });
  await shell.whenIdle();

  assert.deepEqual(fixture.calls.at(-1), ['commit', 'currentScene']);
  assert.equal(snapshotMember(shell, 'preview').phase, 'running');
  assert.equal(overlayPolicy(shell).status, 'reloaded');
  assert.equal(overlayPolicy(shell).preference, 'action');
  assert.equal(
    requireRecord(overlayPolicy(shell).lastSuccess, 'its last success').actualAnchor,
    'scene',
  );
  const statusButton = requireById(rootOf(shell), 'dsl4-preview-reload-status-button');
  assert.equal(statusButton.getAttribute('data-reload-state'), 'reloaded');
  assert.equal(document.activeElement, null);

  statusButton.click();
  await shell.whenIdle();
  requireById(rootOf(shell), 'dsl4-preview-reload-position-story').click();
  await shell.whenIdle();
  requireById(rootOf(shell), 'dsl4-preview-reload-scope-reload-once').click();
  await shell.whenIdle();
  assert.deepEqual(fixture.calls.at(-1), ['restart', 'storyStart']);

  const assetOperations: [string, unknown][] = [];
  await shell.submitReloadCandidate({
    channel: 'asset',
    channelRevision: 1,
    availability: {
      story: {available: true, reason: null},
      scene: {available: true, reason: null},
      action: {available: true, replaySafe: true, reason: null},
    },
    changedIds: ['Backdrop'],
    initiatingInputId: null,
    apply: (request: unknown) =>
      assetOperations.push(['apply', requireRecord(request, 'the apply request').actualAnchor]),
    restart: (request: unknown) =>
      assetOperations.push(['restart', requireRecord(request, 'the restart request').actualAnchor]),
  });
  assert.deepEqual(assetOperations, [['apply', 'action']]);
  assert.equal(snapshotMember(shell, 'reloadOverlay').globalRevision, 2);
  await shell.dispose();
});

test('shows recoverable diagnostics and explicit CLI fallback without retaining source text', async () => {
  const diagnostics: {diagnostic: unknown; channel: unknown}[] = [];
  const {fixture, shell} = createShell({
    onDiagnostic: (diagnostic, channel) => diagnostics.push({diagnostic, channel}),
  });
  fixture.options.onSourceDiagnostic({
    code: 'K4-WEB-PREVIEW-UNSUPPORTED',
    severity: 'error',
    message: 'Folder access is unsupported.',
  });
  const fallback = requireById(rootOf(shell), 'dsl4-web-preview-fallback');
  assert.equal(fallback.hidden, false);
  assert.match(fallback.textContent, /preview-dsl4 --watch/u);
  assert.match(fallback.textContent, /validate-dsl4/u);
  assert.equal(snapshotOf(shell).diagnosticCode, 'K4-WEB-PREVIEW-UNSUPPORTED');

  fixture.options.onSourceDiagnostic(null);
  assert.equal(fallback.hidden, true);
  fixture.options.onSourceDiagnostic({
    code: 'K4-SOURCE-MISSING',
    severity: 'error',
    message: 'Source is temporarily missing.',
  });
  assert.equal(snapshotMember(shell, 'preview').validationStatus, 'missing');
  fixture.options.onSourceResult({
    ok: false,
    canonicalSource: "kamishibai: '4.0'\nunknownField: true\n",
    sourceSnapshot: {
      integrity: sri('invalid-source'),
      displayName: 'story.kamishibai.yaml',
    },
    diagnostics: [
      {
        version: 1,
        code: 'K4-SCHEMA-001',
        severity: 'error',
        message: 'must NOT have additional properties',
        sourceId: 'main',
        range: {
          start: {line: 2, column: 1, offset: 19},
          end: {line: 2, column: 13, offset: 31},
        },
        path: '$.unknownField',
        related: [],
      },
    ],
  });
  const projected = requireDefined(diagnostics.at(-1), 'the projected diagnostic');
  assert.equal(projected.channel, 'source');
  const diagnostic = requireRecord(projected.diagnostic, 'its diagnostic');
  assert.equal(diagnostic.displayName, 'story.kamishibai.yaml');
  assert.deepEqual(requireRecord(diagnostic.range, 'its range').start, {
    line: 2,
    column: 1,
    offset: 19,
  });
  assert.equal(diagnostic.path, '$.unknownField');
  assert.equal(diagnostic.excerpt, "kamishibai: '4.0'\nunknownField: true\n");
  assert.equal(diagnostic.excerptStartLine, 1);
  assert.equal(JSON.stringify(shell.getSnapshot()).includes('must not escape'), false);
  await shell.dispose();
  assert.equal(fixture.disposed, true);
  assert.equal(rootOf(shell).parentNode, null);
});
