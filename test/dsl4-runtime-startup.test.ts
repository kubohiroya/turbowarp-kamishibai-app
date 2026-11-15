import assert from 'node:assert/strict';
import {creationCleanup} from './helpers/creation-cleanup.ts';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {
  createDsl4RuntimeStartup,
  createDsl4SourceFrontend,
  dsl4DefaultFeatureFlags,
  dsl4NonEmbeddedDevelopmentFeatureFlags,
  dsl4StandardProductionFeatureFlags,
  resolveDsl4FeatureFlags,
} from '../src/dsl4/index.js';
import {
  createDsl4EmptyProject,
  createDsl4InstalledRuntimeFixture,
  dsl4TestSubtleCrypto,
} from './helpers/dsl4-runtime-fixtures.ts';
import type {Dsl4NavigationSessionSurface} from '../src/dsl4/navigation-session-surface.js';
import type {Dsl4SourceFrontend} from '../src/dsl4/source-frontend.js';
import {requireRecord, requireString} from './helpers/require-value.ts';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const schema = JSON.parse(
  await readFile(path.join(repositoryRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
);
const frontend = createDsl4SourceFrontend(schema);
const subtleCrypto = dsl4TestSubtleCrypto;
const maxSourceBytes = 8192;
const maxAssetFiles = 10;
const maxTotalAssetBytes = 8192;
const sourceText = `
kamishibai: '4.0'
controls:
  keymaps:
    development:
      ArrowLeft: history.previousAction
      Space: navigation.nextAction
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - wait: 0
`;

/** The startup options this suite assembles. */
type StartupOptions = NonNullable<Parameters<typeof createDsl4RuntimeStartup>[0]>;

/** The startup result this suite drives: a successful startup carries the navigation session. */
type StartupResult = Awaited<ReturnType<typeof createDsl4RuntimeStartup>>;

/**
 * The members a successful startup publishes on top of the ones every result carries.
 *
 * The result is a union whose failure half omits them, and `assert.equal(result.ok, true)` cannot
 * narrow it, so this names what a startup the suite has already asserted succeeded hands back.
 */
interface StartedStartup {
  readonly channel: 'bundled' | 'unbundled';
  readonly runtimeComponent: Readonly<Record<string, unknown>>;
  readonly session: Dsl4NavigationSessionSurface;
}

/** Take a startup this suite has asserted succeeded, naming the one that came back without a session. */
function requireStarted(startup: StartupResult): StartedStartup {
  const started = startup as unknown as Partial<StartedStartup>;
  if (!started.session) {
    throw new Error('Expected the runtime startup to carry a navigation session');
  }
  return started as StartedStartup;
}

/** Take the session off a startup this suite has asserted succeeded. */
function requireSession(startup: StartupResult) {
  return requireStarted(startup).session;
}

/** The session state members this suite asserts on; the surface publishes the snapshot untyped. */
interface SessionState {
  readonly runtime?: {status?: unknown};
  readonly keymap?: unknown;
  readonly historyEnabled?: unknown;
  readonly history?: unknown;
}

/** Read the state of a session this suite has asserted succeeded. */
function sessionState(startup: StartupResult): SessionState {
  return requireSession(startup).getState();
}

/** One recorded adapter call: the member's name followed by the arguments it received. */
type RecordedCall = [string, ...unknown[]];

/**
 * One runtime environment a double in this suite answers with.
 *
 * A double carries only the port operations its own case dispatches, and several carry a
 * deliberately malformed member to prove the startup rejects it, so none of them is the production
 * `RuntimeEnvironment`. This names what the doubles actually build.
 */
interface EnvironmentDouble {
  port: unknown;
  assetLifecycle?: unknown;
  evaluateCondition?:
    | boolean
    | ((
        expression: string,
        variables: Readonly<Record<string, string | number | boolean>>,
      ) => boolean | Promise<boolean>);
  dispose?: (reason?: string) => unknown;
}

/** Hand the startup one of this suite's environment factories, which build an {@link EnvironmentDouble}. */
const environmentFactory = (
  factory: (runtimeComponent: unknown, context: unknown) => EnvironmentDouble | void,
) => factory as unknown as NonNullable<StartupOptions['createRuntimeEnvironment']>;

/** The diagnostic members this suite asserts on. */
interface StartupDiagnostic {
  readonly code?: unknown;
  readonly message?: unknown;
  readonly storyPath?: unknown;
  readonly sourceId?: unknown;
  readonly range?: {start?: {line?: unknown; column?: unknown}};
}

/** Take the first diagnostic a startup reported, naming the startup when it reported none. */
function firstDiagnostic(startup: StartupResult): StartupDiagnostic {
  const [diagnostic] = startup.diagnostics as readonly StartupDiagnostic[];
  if (!diagnostic) throw new Error('Expected the runtime startup to report a diagnostic');
  return diagnostic;
}

async function waitUntil(predicate: () => unknown) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('condition was not reached');
}

function keyEvent(code: string) {
  const counters = {preventDefault: 0, stopPropagation: 0};
  return {
    code,
    defaultPrevented: false,
    repeat: false,
    preventDefault() {
      counters.preventDefault += 1;
      this.defaultPrevented = true;
    },
    stopPropagation() {
      counters.stopPropagation += 1;
    },
    counters,
  };
}

async function packagedProject(
  profile: string,
  historyNavigationAvailable = false,
  source = sourceText,
) {
  const {project, runtimeArtifact} = await createDsl4InstalledRuntimeFixture(source, {
    sourceFrontend: frontend,
    profile,
    historyNavigationAvailable,
    limits: {maxSourceBytes, maxAssetFiles, maxTotalAssetBytes},
    subtleCrypto,
  });
  return {project, runtimeArtifact};
}

/**
 * Hand the startup an options record this suite assembled.
 *
 * Several cases deliberately pass a partial or malformed adapter to prove the startup rejects it,
 * so the suite declares the record it built instead of borrowing the shape it is testing against.
 */
const startupOptions = (options: Record<string, unknown>) => options as unknown as StartupOptions;

const enabledOptions = (project: unknown, extra: Record<string, unknown> = {}) =>
  startupOptions({
    featureFlags: {dsl4Runtime: true},
    project,
    sourceFrontend: frontend,
    maxSourceBytes,
    maxAssetFiles,
    maxTotalAssetBytes,
    port: {},
    subtleCrypto,
    ...extra,
  });

test('defaults OFF and does not inspect runtime inputs or adapters', async () => {
  assert.deepEqual(dsl4DefaultFeatureFlags, {
    dsl4NarrativeControl: false,
    dsl4Runtime: false,
    dsl4Video: false,
    dsl4CrossfadeTransitions: false,
    dsl4BroadcastMessageAndWait: false,
    dsl4IndexedDBAssetSessionStore: false,
    dsl4SourceIncludes: false,
    dsl4AppShell: false,
    dsl4WebPreviewAdapter: false,
    dsl4BrowserDistributionBuild: false,
    dsl4WebPreviewAssetLiveReload: false,
    dsl4PreviewReloadOverlay: false,
    dsl4Debugger: false,
    dsl4EditorDebugger: false,
    dsl4PoseFeedbackModes: false,
    dsl4PosePreviewMirroring: false,
    dsl4CameraPreviewControls: false,
    dsl4UserMediaPermissionGate: false,
    dsl4SpeechAdvanceTypewriter: false,
    dsl4TurboWarpBubbleAdvancedPresentation: false,
    dsl4TurboWarpActionSurface: false,
    dsl4TurboWarpStateSurface: false,
    dsl4ExpressionRuntimeState: false,
    structuredDataIntegrationEnabled: false,
  });
  assert.equal(Object.isFrozen(dsl4DefaultFeatureFlags), true);
  const implicit = await createDsl4RuntimeStartup();
  let factoryCalls = 0;
  // The proxies are the point of this case: reading any of them fails the test.
  const explicit = await createDsl4RuntimeStartup({
    featureFlags: {dsl4Runtime: false},
    project: new Proxy({}, {get: () => assert.fail('project must not be read')}),
    sourceFrontend: new Proxy(
      {},
      {get: () => assert.fail('frontend must not be read')},
    ) as unknown as Dsl4SourceFrontend,
    port: new Proxy({}, {get: () => assert.fail('port must not be read')}),
    createAssetLifecycle() {
      factoryCalls += 1;
      assert.fail('asset lifecycle factory must not be called');
    },
    createRuntimeEnvironment() {
      factoryCalls += 1;
      assert.fail('runtime environment factory must not be called');
    },
  });
  const integrationWithoutRuntime = await createDsl4RuntimeStartup({
    featureFlags: {dsl4Runtime: false, structuredDataIntegrationEnabled: true},
    project: new Proxy({}, {get: () => assert.fail('project must not be read')}),
  });
  assert.equal(factoryCalls, 0);
  for (const result of [implicit, explicit, integrationWithoutRuntime]) {
    assert.equal(result.ok, true);
    assert.equal(result.enabled, false);
    assert.equal((result as {session?: unknown}).session, null);
    assert.equal(result.featureFlags.dsl4Runtime, false);
    assert.equal(Object.isFrozen(result), true);
  }
  assert.equal(integrationWithoutRuntime.featureFlags.structuredDataIntegrationEnabled, true);
});

test('enables crossfade syntax in the Standard profile and preserves explicit rollback', async () => {
  const source = sourceText.replace(
    'scenes:\n',
    'presentation:\n  transitions: {scene: 0.5}\nscenes:\n',
  );
  const component = await packagedProject('production', false, source);
  let environmentCalls = 0;
  const disabled = await createDsl4RuntimeStartup(
    enabledOptions(component.project, {
      featureFlags: {
        ...dsl4StandardProductionFeatureFlags,
        dsl4CrossfadeTransitions: false,
      },
      port: undefined,
      createRuntimeEnvironment() {
        environmentCalls += 1;
        // The Standard profile enables pose preview mirroring, so the port must carry its method.
        return {port: {wait() {}, setPosePreviewMirroring() {}}, dispose() {}};
      },
    }),
  );
  assert.equal(disabled.ok, false);
  assert.equal(firstDiagnostic(disabled).code, 'K4-TRANSITION-FLAG-001');
  assert.equal(firstDiagnostic(disabled).storyPath, '/presentation/transitions/scene');
  assert.equal(firstDiagnostic(disabled).range?.start?.line, 11);
  assert.equal(environmentCalls, 0);

  const enabled = await createDsl4RuntimeStartup(
    enabledOptions(component.project, {
      featureFlags: dsl4StandardProductionFeatureFlags,
      port: undefined,
      createRuntimeEnvironment() {
        environmentCalls += 1;
        // The Standard profile enables pose preview mirroring, so the port must carry its method.
        return {port: {wait() {}, setPosePreviewMirroring() {}}, dispose() {}};
      },
    }),
  );
  assert.equal(enabled.ok, true, JSON.stringify(enabled.diagnostics));
  assert.equal(environmentCalls, 1);
  requireSession(enabled).dispose();
});

test('strictly resolves one immutable startup flag snapshot', async () => {
  assert.deepEqual(dsl4StandardProductionFeatureFlags, {
    dsl4NarrativeControl: true,
    dsl4Runtime: true,
    dsl4Video: true,
    dsl4CrossfadeTransitions: true,
    dsl4AppShell: true,
    dsl4PoseFeedbackModes: true,
    dsl4SpeechAdvanceTypewriter: true,
    dsl4TurboWarpActionSurface: true,
    dsl4TurboWarpStateSurface: true,
    dsl4ExpressionRuntimeState: true,
    dsl4PosePreviewMirroring: true,
    dsl4CameraPreviewControls: true,
    dsl4UserMediaPermissionGate: true,
    dsl4BroadcastMessageAndWait: true,
    dsl4TurboWarpBubbleAdvancedPresentation: true,
    dsl4IndexedDBAssetSessionStore: true,
  });
  assert.equal(Object.isFrozen(dsl4StandardProductionFeatureFlags), true);
  assert.equal(
    resolveDsl4FeatureFlags(dsl4StandardProductionFeatureFlags).dsl4SpeechAdvanceTypewriter,
    true,
  );
  assert.deepEqual(dsl4NonEmbeddedDevelopmentFeatureFlags, {
    dsl4NarrativeControl: true,
    dsl4Runtime: true,
    dsl4Video: true,
    dsl4CrossfadeTransitions: true,
    dsl4AppShell: true,
    dsl4PoseFeedbackModes: true,
    dsl4SpeechAdvanceTypewriter: true,
    dsl4TurboWarpActionSurface: true,
    dsl4TurboWarpStateSurface: true,
    dsl4ExpressionRuntimeState: true,
    dsl4PosePreviewMirroring: true,
    dsl4CameraPreviewControls: true,
    dsl4UserMediaPermissionGate: true,
    dsl4BroadcastMessageAndWait: true,
    dsl4TurboWarpBubbleAdvancedPresentation: true,
    dsl4IndexedDBAssetSessionStore: true,
    dsl4WebPreviewAdapter: true,
    dsl4BrowserDistributionBuild: true,
    dsl4PreviewReloadOverlay: true,
    dsl4Debugger: true,
  });
  assert.equal(Object.isFrozen(dsl4NonEmbeddedDevelopmentFeatureFlags), true);
  assert.equal(
    resolveDsl4FeatureFlags(dsl4NonEmbeddedDevelopmentFeatureFlags).dsl4WebPreviewAdapter,
    true,
  );
  assert.equal(
    resolveDsl4FeatureFlags({
      ...dsl4StandardProductionFeatureFlags,
      dsl4CrossfadeTransitions: false,
    }).dsl4CrossfadeTransitions,
    false,
  );
  assert.throws(
    () => resolveDsl4FeatureFlags({dsl4IndexedDBAssetSessionStore: true}),
    /requires dsl4Runtime/u,
  );
  const disabledFlags = {
    dsl4NarrativeControl: false,
    dsl4Runtime: false,
    dsl4Video: false,
    dsl4CrossfadeTransitions: false,
    dsl4BroadcastMessageAndWait: false,
    dsl4IndexedDBAssetSessionStore: false,
    dsl4SourceIncludes: false,
    dsl4AppShell: false,
    dsl4WebPreviewAdapter: false,
    dsl4BrowserDistributionBuild: false,
    dsl4WebPreviewAssetLiveReload: false,
    dsl4PreviewReloadOverlay: false,
    dsl4Debugger: false,
    dsl4PoseFeedbackModes: false,
    dsl4PosePreviewMirroring: false,
    dsl4CameraPreviewControls: false,
    dsl4UserMediaPermissionGate: false,
    dsl4SpeechAdvanceTypewriter: false,
    dsl4TurboWarpBubbleAdvancedPresentation: false,
    dsl4TurboWarpActionSurface: false,
    dsl4TurboWarpStateSurface: false,
    dsl4ExpressionRuntimeState: false,
    structuredDataIntegrationEnabled: false,
  };
  assert.deepEqual(resolveDsl4FeatureFlags(), disabledFlags);
  assert.deepEqual(resolveDsl4FeatureFlags({}), disabledFlags);
  assert.deepEqual(resolveDsl4FeatureFlags({dsl4Runtime: true}), {
    dsl4Runtime: true,
    dsl4Video: false,
    dsl4CrossfadeTransitions: false,
    dsl4BroadcastMessageAndWait: false,
    dsl4IndexedDBAssetSessionStore: false,
    dsl4SourceIncludes: false,
    dsl4AppShell: false,
    dsl4WebPreviewAdapter: false,
    dsl4BrowserDistributionBuild: false,
    dsl4WebPreviewAssetLiveReload: false,
    dsl4PreviewReloadOverlay: false,
    dsl4Debugger: false,
    dsl4PoseFeedbackModes: false,
    dsl4PosePreviewMirroring: false,
    dsl4CameraPreviewControls: false,
    dsl4UserMediaPermissionGate: false,
    dsl4SpeechAdvanceTypewriter: false,
    dsl4TurboWarpBubbleAdvancedPresentation: false,
    dsl4TurboWarpActionSurface: false,
    dsl4TurboWarpStateSurface: false,
    dsl4NarrativeControl: false,
    dsl4ExpressionRuntimeState: false,
    structuredDataIntegrationEnabled: false,
  });
  assert.deepEqual(resolveDsl4FeatureFlags({dsl4PoseFeedbackModes: true}), {
    dsl4Runtime: false,
    dsl4Video: false,
    dsl4CrossfadeTransitions: false,
    dsl4BroadcastMessageAndWait: false,
    dsl4IndexedDBAssetSessionStore: false,
    dsl4SourceIncludes: false,
    dsl4AppShell: false,
    dsl4WebPreviewAdapter: false,
    dsl4BrowserDistributionBuild: false,
    dsl4WebPreviewAssetLiveReload: false,
    dsl4PreviewReloadOverlay: false,
    dsl4Debugger: false,
    dsl4PoseFeedbackModes: true,
    dsl4PosePreviewMirroring: false,
    dsl4CameraPreviewControls: false,
    dsl4UserMediaPermissionGate: false,
    dsl4SpeechAdvanceTypewriter: false,
    dsl4TurboWarpBubbleAdvancedPresentation: false,
    dsl4TurboWarpActionSurface: false,
    dsl4TurboWarpStateSurface: false,
    dsl4NarrativeControl: false,
    dsl4ExpressionRuntimeState: false,
    structuredDataIntegrationEnabled: false,
  });
  assert.deepEqual(resolveDsl4FeatureFlags({dsl4PosePreviewMirroring: true}), {
    dsl4Runtime: false,
    dsl4Video: false,
    dsl4CrossfadeTransitions: false,
    dsl4BroadcastMessageAndWait: false,
    dsl4IndexedDBAssetSessionStore: false,
    dsl4SourceIncludes: false,
    dsl4AppShell: false,
    dsl4WebPreviewAdapter: false,
    dsl4BrowserDistributionBuild: false,
    dsl4WebPreviewAssetLiveReload: false,
    dsl4PreviewReloadOverlay: false,
    dsl4Debugger: false,
    dsl4PoseFeedbackModes: false,
    dsl4PosePreviewMirroring: true,
    dsl4CameraPreviewControls: false,
    dsl4UserMediaPermissionGate: false,
    dsl4SpeechAdvanceTypewriter: false,
    dsl4TurboWarpBubbleAdvancedPresentation: false,
    dsl4TurboWarpActionSurface: false,
    dsl4TurboWarpStateSurface: false,
    dsl4NarrativeControl: false,
    dsl4ExpressionRuntimeState: false,
    structuredDataIntegrationEnabled: false,
  });
  assert.deepEqual(resolveDsl4FeatureFlags({structuredDataIntegrationEnabled: true}), {
    dsl4Runtime: false,
    dsl4Video: false,
    dsl4CrossfadeTransitions: false,
    dsl4BroadcastMessageAndWait: false,
    dsl4IndexedDBAssetSessionStore: false,
    dsl4SourceIncludes: false,
    dsl4AppShell: false,
    dsl4WebPreviewAdapter: false,
    dsl4BrowserDistributionBuild: false,
    dsl4WebPreviewAssetLiveReload: false,
    dsl4PreviewReloadOverlay: false,
    dsl4Debugger: false,
    dsl4PoseFeedbackModes: false,
    dsl4PosePreviewMirroring: false,
    dsl4CameraPreviewControls: false,
    dsl4UserMediaPermissionGate: false,
    dsl4SpeechAdvanceTypewriter: false,
    dsl4TurboWarpBubbleAdvancedPresentation: false,
    dsl4TurboWarpActionSurface: false,
    dsl4TurboWarpStateSurface: false,
    dsl4NarrativeControl: false,
    dsl4ExpressionRuntimeState: false,
    structuredDataIntegrationEnabled: true,
  });
  assert.throws(
    () => resolveDsl4FeatureFlags({dsl4SpeechAdvanceTypewriter: true}),
    /requires dsl4Runtime/u,
  );
  assert.deepEqual(
    resolveDsl4FeatureFlags({dsl4Runtime: true, dsl4SpeechAdvanceTypewriter: true}),
    {
      dsl4Runtime: true,
      dsl4Video: false,
      dsl4CrossfadeTransitions: false,
      dsl4BroadcastMessageAndWait: false,
      dsl4IndexedDBAssetSessionStore: false,
      dsl4SourceIncludes: false,
      dsl4AppShell: false,
      dsl4WebPreviewAdapter: false,
      dsl4BrowserDistributionBuild: false,
      dsl4WebPreviewAssetLiveReload: false,
      dsl4PreviewReloadOverlay: false,
      dsl4Debugger: false,
      dsl4PoseFeedbackModes: false,
      dsl4PosePreviewMirroring: false,
      dsl4CameraPreviewControls: false,
      dsl4UserMediaPermissionGate: false,
      dsl4SpeechAdvanceTypewriter: true,
      dsl4TurboWarpBubbleAdvancedPresentation: false,
      dsl4TurboWarpActionSurface: false,
      dsl4TurboWarpStateSurface: false,
      dsl4NarrativeControl: false,
      dsl4ExpressionRuntimeState: false,
      structuredDataIntegrationEnabled: false,
    },
  );
  assert.throws(() => resolveDsl4FeatureFlags({dsl4Runtime: 1}), TypeError);
  assert.throws(
    () => resolveDsl4FeatureFlags({dsl4CrossfadeTransitions: true}),
    /requires dsl4Runtime/u,
  );
  assert.equal(
    resolveDsl4FeatureFlags({dsl4Runtime: true, dsl4CrossfadeTransitions: true})
      .dsl4CrossfadeTransitions,
    true,
  );
  assert.throws(
    () => resolveDsl4FeatureFlags({dsl4BroadcastMessageAndWait: true}),
    /requires dsl4Runtime/u,
  );
  assert.equal(
    resolveDsl4FeatureFlags({
      dsl4Runtime: true,
      dsl4BroadcastMessageAndWait: true,
    }).dsl4BroadcastMessageAndWait,
    true,
  );
  assert.throws(() => resolveDsl4FeatureFlags({dsl4PoseFeedbackModes: 1}), TypeError);
  assert.throws(() => resolveDsl4FeatureFlags({dsl4PosePreviewMirroring: 1}), TypeError);
  assert.throws(() => resolveDsl4FeatureFlags({dsl4PoseOverlay: true}), /Unknown/u);
  assert.throws(() => resolveDsl4FeatureFlags({dsl4CameraPreviewControls: 1}), TypeError);
  assert.throws(() => resolveDsl4FeatureFlags({dsl4SpeechAdvanceTypewriter: 1}), TypeError);
  assert.throws(() => resolveDsl4FeatureFlags({dsl4BubbleAdvanceIndicator: false}), /Unknown/u);
  assert.throws(() => resolveDsl4FeatureFlags({dsl4TurboWarpBubble: false}), /Unknown/u);
  assert.throws(() => resolveDsl4FeatureFlags({dsl4TurboWarpActionSurface: 1}), TypeError);
  assert.throws(
    () => resolveDsl4FeatureFlags({dsl4TurboWarpBubbleAdvancedPresentation: 1}),
    TypeError,
  );
  assert.throws(
    () => resolveDsl4FeatureFlags({dsl4TurboWarpBubbleAdvancedPresentation: true}),
    /requires dsl4Runtime, dsl4AppShell, and dsl4SpeechAdvanceTypewriter/u,
  );
  assert.throws(
    () => resolveDsl4FeatureFlags({dsl4TurboWarpActionSurface: true}),
    /requires dsl4Runtime/u,
  );
  assert.equal(
    resolveDsl4FeatureFlags({
      dsl4Runtime: true,
      dsl4TurboWarpActionSurface: true,
    }).dsl4TurboWarpActionSurface,
    true,
  );
  assert.throws(
    () => resolveDsl4FeatureFlags({dsl4TurboWarpStateSurface: true}),
    /requires dsl4Runtime/u,
  );
  assert.throws(
    () => resolveDsl4FeatureFlags({dsl4Runtime: true, dsl4ExpressionRuntimeState: true}),
    /requires dsl4Runtime and dsl4TurboWarpStateSurface/u,
  );
  const runtimeVariableFlags = resolveDsl4FeatureFlags({
    dsl4Runtime: true,
    dsl4TurboWarpStateSurface: true,
    dsl4ExpressionRuntimeState: true,
  });
  assert.equal(runtimeVariableFlags.dsl4TurboWarpStateSurface, true);
  assert.equal(runtimeVariableFlags.dsl4ExpressionRuntimeState, true);
  assert.equal(
    resolveDsl4FeatureFlags({
      dsl4Runtime: true,
      dsl4AppShell: true,
      dsl4SpeechAdvanceTypewriter: true,
      dsl4TurboWarpBubbleAdvancedPresentation: true,
    }).dsl4TurboWarpBubbleAdvancedPresentation,
    true,
  );
  assert.throws(() => resolveDsl4FeatureFlags({structuredDataIntegrationEnabled: 1}), TypeError);
  assert.throws(() => resolveDsl4FeatureFlags({dsl4AppShell: true}), /requires dsl4Runtime/u);
  assert.throws(
    () => resolveDsl4FeatureFlags({dsl4Runtime: true, dsl4WebPreviewAdapter: true}),
    /requires dsl4Runtime and dsl4AppShell/u,
  );
  assert.throws(
    () => resolveDsl4FeatureFlags({dsl4BrowserDistributionBuild: true}),
    /requires dsl4Runtime, dsl4AppShell, and dsl4WebPreviewAdapter/u,
  );
  assert.deepEqual(
    resolveDsl4FeatureFlags({
      dsl4Runtime: true,
      dsl4SourceIncludes: false,
      dsl4AppShell: true,
      dsl4WebPreviewAdapter: true,
      dsl4BrowserDistributionBuild: false,
      dsl4WebPreviewAssetLiveReload: false,
      dsl4PreviewReloadOverlay: false,
    }),
    {
      dsl4Runtime: true,
      dsl4Video: false,
      dsl4CrossfadeTransitions: false,
      dsl4BroadcastMessageAndWait: false,
      dsl4IndexedDBAssetSessionStore: false,
      dsl4SourceIncludes: false,
      dsl4AppShell: true,
      dsl4WebPreviewAdapter: true,
      dsl4BrowserDistributionBuild: false,
      dsl4WebPreviewAssetLiveReload: false,
      dsl4PreviewReloadOverlay: false,
      dsl4Debugger: false,
      dsl4PoseFeedbackModes: false,
      dsl4PosePreviewMirroring: false,
      dsl4CameraPreviewControls: false,
      dsl4UserMediaPermissionGate: false,
      dsl4SpeechAdvanceTypewriter: false,
      dsl4TurboWarpBubbleAdvancedPresentation: false,
      dsl4TurboWarpActionSurface: false,
      dsl4TurboWarpStateSurface: false,
      dsl4NarrativeControl: false,
      dsl4ExpressionRuntimeState: false,
      structuredDataIntegrationEnabled: false,
    },
  );
  assert.throws(
    () => resolveDsl4FeatureFlags({dsl4WebPreviewAssetLiveReload: true}),
    /requires dsl4Runtime, dsl4AppShell, and dsl4WebPreviewAdapter/u,
  );
  assert.deepEqual(
    resolveDsl4FeatureFlags({
      dsl4Runtime: true,
      dsl4SourceIncludes: false,
      dsl4AppShell: true,
      dsl4WebPreviewAdapter: true,
      dsl4WebPreviewAssetLiveReload: true,
    }).dsl4WebPreviewAssetLiveReload,
    true,
  );
  assert.throws(
    () => resolveDsl4FeatureFlags({dsl4PreviewReloadOverlay: true}),
    /requires dsl4Runtime and dsl4AppShell/u,
  );
  assert.equal(
    resolveDsl4FeatureFlags({
      dsl4Runtime: true,
      dsl4SourceIncludes: false,
      dsl4AppShell: true,
      dsl4PreviewReloadOverlay: true,
    }).dsl4PreviewReloadOverlay,
    true,
  );
  assert.throws(
    () => resolveDsl4FeatureFlags({dsl4Debugger: true}),
    /requires dsl4Runtime, dsl4AppShell, dsl4WebPreviewAdapter, and dsl4PreviewReloadOverlay/u,
  );
  assert.equal(
    resolveDsl4FeatureFlags({
      dsl4Runtime: true,
      dsl4AppShell: true,
      dsl4WebPreviewAdapter: true,
      dsl4PreviewReloadOverlay: true,
      dsl4Debugger: true,
    }).dsl4Debugger,
    true,
  );
  assert.throws(
    () => resolveDsl4FeatureFlags({dsl4EditorDebugger: true}),
    /dsl4EditorDebugger requires dsl4Runtime and dsl4AppShell/u,
  );
  assert.equal(
    resolveDsl4FeatureFlags({dsl4Runtime: true, dsl4AppShell: true, dsl4EditorDebugger: true})
      .dsl4EditorDebugger,
    true,
    'the editor debugger needs no preview overlay',
  );
  // Only the editor's authoring runtime turns it on, at the call site; no preset carries it.
  assert.equal(Object.hasOwn(dsl4StandardProductionFeatureFlags, 'dsl4EditorDebugger'), false);
  assert.equal(Object.hasOwn(dsl4NonEmbeddedDevelopmentFeatureFlags, 'dsl4EditorDebugger'), false);
  assert.throws(() => resolveDsl4FeatureFlags({dsl4Runtime: false, extra: true}), TypeError);

  const component = await packagedProject('production');
  const mutableFlags = {dsl4Runtime: true};
  const pending = createDsl4RuntimeStartup(
    enabledOptions(component.project, {featureFlags: mutableFlags}),
  );
  mutableFlags.dsl4Runtime = false;
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.enabled, true);
  assert.deepEqual(result.featureFlags, {
    dsl4NarrativeControl: false,
    dsl4Runtime: true,
    dsl4Video: false,
    dsl4CrossfadeTransitions: false,
    dsl4BroadcastMessageAndWait: false,
    dsl4IndexedDBAssetSessionStore: false,
    dsl4SourceIncludes: false,
    dsl4AppShell: false,
    dsl4WebPreviewAdapter: false,
    dsl4BrowserDistributionBuild: false,
    dsl4WebPreviewAssetLiveReload: false,
    dsl4PreviewReloadOverlay: false,
    dsl4Debugger: false,
    dsl4PoseFeedbackModes: false,
    dsl4PosePreviewMirroring: false,
    dsl4CameraPreviewControls: false,
    dsl4UserMediaPermissionGate: false,
    dsl4SpeechAdvanceTypewriter: false,
    dsl4TurboWarpBubbleAdvancedPresentation: false,
    dsl4TurboWarpActionSurface: false,
    dsl4TurboWarpStateSurface: false,
    dsl4ExpressionRuntimeState: false,
    structuredDataIntegrationEnabled: false,
  });
  assert.equal(Object.isFrozen(result.featureFlags), true);
  requireSession(result).dispose();
});

test('connects pose preview mirroring to a direct runtime port only when enabled', async () => {
  const component = await packagedProject(
    'production',
    false,
    `
kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    posePreview:
      mirroring: unmirrored
    actions: []
`,
  );
  const disabledPort = {};
  Object.defineProperty(disabledPort, 'setPosePreviewMirroring', {
    get() {
      assert.fail('disabled startup must not inspect the pose preview port');
    },
  });
  const disabled = await createDsl4RuntimeStartup(
    enabledOptions(component.project, {port: disabledPort}),
  );
  assert.equal((await requireSession(disabled).start()).status, 'finished');
  requireSession(disabled).dispose();

  await assert.rejects(
    createDsl4RuntimeStartup(
      enabledOptions(component.project, {
        featureFlags: {dsl4Runtime: true, dsl4PosePreviewMirroring: true},
        port: {},
      }),
    ),
    /setPosePreviewMirroring/u,
  );

  const modes: unknown[] = [];
  const enabled = await createDsl4RuntimeStartup(
    enabledOptions(component.project, {
      featureFlags: {dsl4Runtime: true, dsl4PosePreviewMirroring: true},
      port: {
        setPosePreviewMirroring(mode: unknown) {
          modes.push(mode);
        },
      },
    }),
  );
  assert.equal((await requireSession(enabled).start()).status, 'finished');
  assert.deepEqual(modes, ['unmirrored']);
  requireSession(enabled).dispose();
});

test('connects the startup pose flag to refusal without consuming the mapped key', async () => {
  const component = await packagedProject(
    'production',
    false,
    `
kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
assets:
  Tick: sound
  Charge: sound
  HeroIdle: costume:Hero
  RescuePose:
    kind: recognitionModel
    delivery: remote
    loading: lazy
    source:
      url: https://cdn.example.com/rescue-pose.zip
      integrity: sha256-fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210
      contentType: application/zip
      size: 1024
actors:
  Hero: HeroIdle
recognition:
  idleSound: Tick
  chargeSound: Charge
  navigation:
    allowSkip: false
scenes:
  rescue:
    recognitionModel: RescuePose
    actions:
      - Hero.pose:
          steps:
            - pose: help
`,
  );
  let aborted = false;
  const result = await createDsl4RuntimeStartup(
    enabledOptions(component.project, {
      featureFlags: {dsl4Runtime: true, dsl4PoseFeedbackModes: true},
      port: {
        waitForPose: (_payload: Record<string, unknown>, context: Record<string, unknown>) =>
          new Promise((resolve) => {
            (context.signal as AbortSignal).addEventListener(
              'abort',
              () => {
                aborted = true;
                resolve(undefined);
              },
              {once: true},
            );
          }),
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const run = requireSession(result).start();

  const space = keyEvent('Space');
  assert.equal(requireSession(result).handleKeyDown(space), false);
  assert.deepEqual(space.counters, {preventDefault: 0, stopPropagation: 0});
  assert.equal(aborted, false);

  requireSession(result).stop('test-cleanup');
  await run;
  assert.equal(aborted, true);
  requireSession(result).dispose();
});

test('enables internal Structured Data independently without exposing a generic palette', async () => {
  const component = await packagedProject('production');
  let actionResources: Record<string, unknown> | undefined;
  const result = await createDsl4RuntimeStartup(
    enabledOptions(component.project, {
      featureFlags: {
        dsl4Runtime: true,
        dsl4SourceIncludes: false,
        structuredDataIntegrationEnabled: true,
      },
      port: {
        wait(_payload: Record<string, unknown>, context: Record<string, unknown>) {
          actionResources = context.structuredData as Record<string, unknown>;
          assert.match(requireString(actionResources.actionScopeRef, 'actionScopeRef'), /^@os1\./u);
          assert.match(requireString(actionResources.actionViewRef, 'actionViewRef'), /^@os1\./u);
          assert.equal(Object.isFrozen(actionResources), true);
        },
      },
    }),
  );

  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.featureFlags, {
    dsl4NarrativeControl: false,
    dsl4Runtime: true,
    dsl4Video: false,
    dsl4CrossfadeTransitions: false,
    dsl4BroadcastMessageAndWait: false,
    dsl4IndexedDBAssetSessionStore: false,
    dsl4SourceIncludes: false,
    dsl4AppShell: false,
    dsl4WebPreviewAdapter: false,
    dsl4BrowserDistributionBuild: false,
    dsl4WebPreviewAssetLiveReload: false,
    dsl4PreviewReloadOverlay: false,
    dsl4Debugger: false,
    dsl4PoseFeedbackModes: false,
    dsl4PosePreviewMirroring: false,
    dsl4CameraPreviewControls: false,
    dsl4UserMediaPermissionGate: false,
    dsl4SpeechAdvanceTypewriter: false,
    dsl4TurboWarpBubbleAdvancedPresentation: false,
    dsl4TurboWarpActionSurface: false,
    dsl4TurboWarpStateSurface: false,
    dsl4ExpressionRuntimeState: false,
    structuredDataIntegrationEnabled: true,
  });
  assert.equal((await requireSession(result).start()).status, 'finished');
  assert.ok(actionResources);
  assert.equal(JSON.stringify(component.project).includes('kubohiroyastructdata1'), false);
  requireSession(result).dispose();
});

test('withholds component and session when enabled startup validation fails', async () => {
  let factoryCalls = 0;
  const result = await createDsl4RuntimeStartup(
    enabledOptions(createDsl4EmptyProject(), {
      createAssetLifecycle() {
        factoryCalls += 1;
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.enabled, true);
  assert.equal(firstDiagnostic(result).code, 'K4-SOURCE-CHANNEL-MISSING');
  assert.equal(Object.hasOwn(result, 'runtimeComponent'), false);
  assert.equal(Object.hasOwn(result, 'session'), false);
  assert.equal(factoryCalls, 0);
});

test('creates a component-aware asset lifecycle after validation and releases it', async () => {
  const component = await packagedProject('production');
  const calls: RecordedCall[] = [];
  let receivedComponent;
  let receivedContext;
  const result = await createDsl4RuntimeStartup(
    enabledOptions(component.project, {
      createAssetLifecycle(runtimeComponent: unknown, startupContext: unknown) {
        receivedComponent = runtimeComponent;
        receivedContext = startupContext;
        calls.push(['create']);
        return {
          prepare(payload: Record<string, unknown>, context: Record<string, unknown>) {
            calls.push(['prepare', payload, context]);
          },
          setLoading(payload: Record<string, unknown>, context: Record<string, unknown>) {
            calls.push(['setLoading', payload, context]);
          },
          releaseAssets(payload: Record<string, unknown>) {
            calls.push(['releaseAssets', payload]);
          },
          release(payload: Record<string, unknown>) {
            calls.push(['release', payload]);
          },
        };
      },
      port: {wait() {}},
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.strictEqual(receivedComponent, (result as {runtimeComponent?: unknown}).runtimeComponent);
  assert.equal(Object.isFrozen(receivedComponent), true);
  assert.equal(
    typeof (receivedComponent as {getAssetFile?: unknown} | undefined)?.getAssetFile,
    'function',
  );
  assert.deepEqual(receivedContext, {
    channel: 'unbundled',
    featureFlags: {
      dsl4NarrativeControl: false,
      dsl4Runtime: true,
      dsl4Video: false,
      dsl4CrossfadeTransitions: false,
      dsl4BroadcastMessageAndWait: false,
      dsl4IndexedDBAssetSessionStore: false,
      dsl4SourceIncludes: false,
      dsl4AppShell: false,
      dsl4WebPreviewAdapter: false,
      dsl4BrowserDistributionBuild: false,
      dsl4WebPreviewAssetLiveReload: false,
      dsl4PreviewReloadOverlay: false,
      dsl4Debugger: false,
      dsl4PoseFeedbackModes: false,
      dsl4PosePreviewMirroring: false,
      dsl4CameraPreviewControls: false,
      dsl4UserMediaPermissionGate: false,
      dsl4SpeechAdvanceTypewriter: false,
      dsl4TurboWarpBubbleAdvancedPresentation: false,
      dsl4TurboWarpActionSurface: false,
      dsl4TurboWarpStateSurface: false,
      dsl4ExpressionRuntimeState: false,
      structuredDataIntegrationEnabled: false,
    },
  });
  assert.equal(Object.isFrozen(receivedContext), true);
  assert.equal(
    Object.isFrozen((receivedContext as {featureFlags?: unknown} | undefined)?.featureFlags),
    true,
  );
  assert.deepEqual(
    calls.map(([name]) => name),
    ['create'],
  );

  const finished = await requireSession(result).start();
  assert.equal(finished.status, 'finished');
  assert.deepEqual(
    calls.map(([name]) => name),
    ['create', 'prepare'],
  );
  requireSession(result).dispose();
  await waitUntil(() => calls.some(([name]) => name === 'release'));
  assert.deepEqual(
    calls.map(([name]) => name),
    ['create', 'prepare', 'release'],
  );
});

test('rejects conflicting or invalid asset lifecycle factories before publishing a session', async () => {
  const component = await packagedProject('production');
  await assert.rejects(
    createDsl4RuntimeStartup(
      enabledOptions(component.project, {
        assetLifecycle: {prepare() {}, setLoading() {}, releaseAssets() {}, release() {}},
        createAssetLifecycle() {},
      }),
    ),
    /either assetLifecycle or createAssetLifecycle/u,
  );
  await assert.rejects(
    createDsl4RuntimeStartup(
      // Deliberately not a function: the startup rejects it before any factory contract applies.
      enabledOptions(component.project, {createAssetLifecycle: {}}),
    ),
    /must be a function/u,
  );
  await assert.rejects(
    createDsl4RuntimeStartup(
      enabledOptions(component.project, {createAssetLifecycle: () => ({prepare() {}})}),
    ),
    /must provide prepare, setLoading, releaseAssets, and release/u,
  );
  await assert.rejects(
    createDsl4RuntimeStartup(
      enabledOptions(component.project, {createAssetLifecycle: () => undefined}),
    ),
    /must provide prepare, setLoading, releaseAssets, and release/u,
  );
});

test('creates isolated lifecycle instances for separate startups', async () => {
  const component = await packagedProject('production');
  const receivedComponents: unknown[] = [];
  const releases: unknown[] = [];
  let instance = 0;
  const createAssetLifecycle = (runtimeComponent: unknown) => {
    receivedComponents.push(runtimeComponent);
    const current = ++instance;
    return {
      prepare() {},
      setLoading() {},
      releaseAssets() {},
      release() {
        releases.push(current);
      },
    };
  };
  const first = await createDsl4RuntimeStartup(
    enabledOptions(component.project, {createAssetLifecycle}),
  );
  const second = await createDsl4RuntimeStartup(
    enabledOptions(component.project, {createAssetLifecycle}),
  );
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(instance, 2);
  assert.notStrictEqual(receivedComponents[0], receivedComponents[1]);
  await requireSession(first).start();
  await requireSession(second).start();
  requireSession(first).dispose();
  requireSession(second).dispose();
  await waitUntil(() => releases.length === 2);
  assert.deepEqual(releases.sort(), [1, 2]);
});

test('creates an atomic runtime environment only after component validation', async () => {
  const component = await packagedProject('production');
  const calls: string[] = [];
  let receivedComponent;
  let receivedContext;
  const result = await createDsl4RuntimeStartup({
    featureFlags: {dsl4Runtime: true},
    project: component.project,
    sourceFrontend: frontend,
    maxSourceBytes,
    maxAssetFiles,
    maxTotalAssetBytes,
    subtleCrypto,
    createRuntimeEnvironment: environmentFactory((runtimeComponent, startupContext) => {
      receivedComponent = runtimeComponent;
      receivedContext = startupContext;
      calls.push('create');
      return {
        port: {wait() {}},
        assetLifecycle: {prepare() {}, setLoading() {}, releaseAssets() {}, release() {}},
        dispose(reason) {
          calls.push(`dispose:${reason}`);
        },
      };
    }),
  });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.strictEqual(receivedComponent, (result as {runtimeComponent?: unknown}).runtimeComponent);
  assert.deepEqual(receivedContext, {
    channel: 'unbundled',
    featureFlags: {
      dsl4NarrativeControl: false,
      dsl4Runtime: true,
      dsl4Video: false,
      dsl4CrossfadeTransitions: false,
      dsl4BroadcastMessageAndWait: false,
      dsl4IndexedDBAssetSessionStore: false,
      dsl4SourceIncludes: false,
      dsl4AppShell: false,
      dsl4WebPreviewAdapter: false,
      dsl4BrowserDistributionBuild: false,
      dsl4WebPreviewAssetLiveReload: false,
      dsl4PreviewReloadOverlay: false,
      dsl4Debugger: false,
      dsl4PoseFeedbackModes: false,
      dsl4PosePreviewMirroring: false,
      dsl4CameraPreviewControls: false,
      dsl4UserMediaPermissionGate: false,
      dsl4SpeechAdvanceTypewriter: false,
      dsl4TurboWarpBubbleAdvancedPresentation: false,
      dsl4TurboWarpActionSurface: false,
      dsl4TurboWarpStateSurface: false,
      dsl4ExpressionRuntimeState: false,
      structuredDataIntegrationEnabled: false,
    },
  });
  assert.deepEqual(calls, ['create']);
  assert.equal(sessionState(result).runtime?.status, 'idle');
  const firstDispose = requireSession(result).dispose('startup-test-dispose');
  const secondDispose = requireSession(result).dispose('ignored');
  assert.strictEqual(secondDispose, firstDispose);
  await firstDispose;
  assert.deepEqual(calls, ['create', 'dispose:startup-test-dispose']);
});

test('uses the condition evaluator owned by the atomic runtime environment', async () => {
  const component = await packagedProject(
    'production',
    false,
    `
kamishibai: '4.0'
variables:
  score: 2
controls:
  keymaps:
    production:
      Space: navigation.nextAction
branches:
  route:
    - if: 'score === 2'
      goto: accepted
    - else: rejected
scenes:
  opening:
    - branch: route
  rejected:
    - wait: 0
  accepted:
    - wait: 0
`,
  );
  const evaluations: unknown[] = [];
  const result = await createDsl4RuntimeStartup({
    featureFlags: {dsl4Runtime: true},
    project: component.project,
    sourceFrontend: frontend,
    maxSourceBytes,
    maxAssetFiles,
    maxTotalAssetBytes,
    subtleCrypto,
    evaluateCondition() {
      assert.fail('the top-level evaluator must not replace environment ownership');
    },
    createRuntimeEnvironment: environmentFactory(() => ({
      port: {wait() {}},
      evaluateCondition(expression, variables) {
        evaluations.push({expression, variables});
        return expression === 'score === 2' && variables.score === 2;
      },
      dispose() {},
    })),
  });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const finished = await requireSession(result).start();
  assert.equal(finished.status, 'finished');
  assert.equal(finished.sceneId, 'accepted');
  assert.deepEqual(evaluations, [
    {expression: 'score === 2', variables: {score: 2, startSceneIndex: 1}},
  ]);
  await requireSession(result).dispose('environment-evaluator-complete');
});

test('cleans an atomic runtime environment when navigation session creation is rejected', async () => {
  const component = await packagedProject('development', true);
  const calls: string[] = [];
  const result = await createDsl4RuntimeStartup({
    featureFlags: {dsl4Runtime: true},
    project: component.project,
    sourceFrontend: frontend,
    maxSourceBytes,
    maxAssetFiles,
    maxTotalAssetBytes,
    historyNavigationAvailable: true,
    subtleCrypto,
    createRuntimeEnvironment: environmentFactory(() => {
      calls.push('create');
      return {
        port: {wait() {}},
        dispose(reason) {
          calls.push(`dispose:${reason}`);
        },
      };
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(firstDiagnostic(result).code, 'K4-HISTORY-LIMIT-CONFIG-001');
  assert.deepEqual(calls, ['create', 'dispose:navigation-session-rejected']);
});

test('rejects conflicting or malformed atomic runtime environment options', async () => {
  const component = await packagedProject('production');
  await assert.rejects(
    createDsl4RuntimeStartup(
      enabledOptions(component.project, {
        createRuntimeEnvironment: environmentFactory(() => {}),
      }),
    ),
    /cannot be combined/u,
  );
  await assert.rejects(
    createDsl4RuntimeStartup(
      enabledOptions(component.project, {
        port: undefined,
        // Deliberately not a function: the startup rejects it before any factory contract applies.
        createRuntimeEnvironment: {},
      }),
    ),
    /must be a function/u,
  );
  const calls: (string | undefined)[] = [];
  await assert.rejects(
    createDsl4RuntimeStartup(
      enabledOptions(component.project, {
        port: undefined,
        createRuntimeEnvironment: environmentFactory(() => ({
          port: {wait: 1},
          dispose(reason) {
            calls.push(reason);
          },
        })),
      }),
    ),
    /port values must be functions/u,
  );
  await assert.rejects(
    createDsl4RuntimeStartup(
      enabledOptions(component.project, {
        port: undefined,
        createRuntimeEnvironment: environmentFactory(() => ({
          port: {wait() {}},
          evaluateCondition: true,
          dispose(reason) {
            calls.push(reason);
          },
        })),
      }),
    ),
    /evaluateCondition must be a function/u,
  );
  assert.deepEqual(calls, ['invalid-runtime-environment', 'invalid-runtime-environment']);
});

test('creates but does not auto-start or attach a production navigation session', async () => {
  const component = await packagedProject('production');
  const calls: RecordedCall[] = [];
  const events: {type?: unknown}[] = [];
  const lifecycle = {
    prepare(payload: Record<string, unknown>, context: Record<string, unknown>) {
      calls.push(['prepare', payload, context]);
    },
    setLoading(payload: Record<string, unknown>, context: Record<string, unknown>) {
      calls.push(['setLoading', payload, context]);
    },
    releaseAssets(payload: Record<string, unknown>) {
      calls.push(['releaseAssets', payload]);
    },
    release(payload: Record<string, unknown>) {
      calls.push(['release', payload]);
    },
  };
  const result = await createDsl4RuntimeStartup(
    enabledOptions(component.project, {
      port: {
        wait(payload: Record<string, unknown>, context: Record<string, unknown>) {
          calls.push(['wait', payload, context]);
        },
      },
      assetLifecycle: lifecycle,
      onEvent(event: {type?: unknown}) {
        events.push(event);
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.enabled, true);
  assert.equal(requireStarted(result).channel, 'unbundled');
  assert.deepEqual(sessionState(result).keymap, component.runtimeArtifact.resolvedKeymap);
  assert.equal(sessionState(result).historyEnabled, false);
  assert.equal(sessionState(result).history, null);
  assert.deepEqual(calls, [] as RecordedCall[]);
  assert.deepEqual(events, [] as {type?: unknown}[]);

  const finished = await requireSession(result).start();
  assert.equal(finished.status, 'finished');
  assert.deepEqual(
    calls.map(([name]) => name),
    ['prepare', 'wait'],
  );
  assert.equal(
    events.some(({type}) => type === 'action.commit'),
    true,
  );
  requireSession(result).dispose();
  await waitUntil(() => calls.some(([name]) => name === 'release'));
  assert.equal(
    calls.some(([name]) => name === 'release'),
    true,
  );
});

test('uses artifact history activation and requires availability plus finite limits', async () => {
  const component = await packagedProject('development', true);
  let factoryCalls = 0;
  const createAssetLifecycle = () => {
    factoryCalls += 1;
    return {prepare() {}, setLoading() {}, releaseAssets() {}, release() {}};
  };
  const unavailable = await createDsl4RuntimeStartup(
    enabledOptions(component.project, {createAssetLifecycle}),
  );
  assert.equal(unavailable.ok, false);
  assert.equal(firstDiagnostic(unavailable).code, 'K4-KEYMAP-HISTORY-UNAVAILABLE');
  assert.equal(Object.hasOwn(unavailable, 'session'), false);

  const unlimited = await createDsl4RuntimeStartup(
    enabledOptions(component.project, {
      historyNavigationAvailable: true,
      createAssetLifecycle,
    }),
  );
  assert.equal(unlimited.ok, false);
  assert.equal(firstDiagnostic(unlimited).code, 'K4-HISTORY-LIMIT-CONFIG-001');
  assert.equal(Object.hasOwn(unlimited, 'runtimeComponent'), false);
  assert.equal(Object.hasOwn(unlimited, 'session'), false);
  assert.equal(factoryCalls, 0);

  const enabled = await createDsl4RuntimeStartup(
    enabledOptions(component.project, {
      historyNavigationAvailable: true,
      historyLimits: {maxActionEntries: 20, maxSceneVisits: 10},
    }),
  );
  assert.equal(enabled.ok, true, JSON.stringify(enabled.diagnostics));
  assert.equal(sessionState(enabled).historyEnabled, true);
  assert.notEqual(sessionState(enabled).history, null);
  assert.deepEqual(sessionState(enabled).keymap, component.runtimeArtifact.resolvedKeymap);
  requireSession(enabled).dispose();
});

test('runtime startup retains failed environment cleanup for explicit retry', async () => {
  const component = await packagedProject('production');
  let calls = 0;
  const result = await createDsl4RuntimeStartup({
    featureFlags: {dsl4Runtime: true},
    project: component.project,
    sourceFrontend: frontend,
    maxSourceBytes,
    maxAssetFiles,
    maxTotalAssetBytes,
    subtleCrypto,
    createRuntimeEnvironment: environmentFactory(() => ({
      port: {wait() {}},
      dispose() {
        if (++calls === 1) throw new Error('environment cleanup failed');
      },
    })),
  });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const session = requireSession(result);
  const first = session.dispose();
  assert.equal(session.dispose(), first);
  await assert.rejects(Promise.resolve(first), AggregateError);
  await session.dispose();
  assert.equal(calls, 2);
  await session.dispose();
  assert.equal(calls, 2);
});

test('runtime startup closes navigation and retains a failed cleanup inspection for explicit retry', async () => {
  const component = await packagedProject('production');
  const failure = new Error('environment cleanup inspection failed');
  let inspectFails = true;
  let disposals = 0;
  let actions = 0;
  let nested: unknown;
  const result = await createDsl4RuntimeStartup({
    featureFlags: {dsl4Runtime: true},
    project: component.project,
    sourceFrontend: frontend,
    maxSourceBytes,
    maxAssetFiles,
    maxTotalAssetBytes,
    subtleCrypto,
    createRuntimeEnvironment: () => ({
      port: {
        wait() {
          actions++;
        },
      },
      hasPendingCleanup() {
        assert.equal(
          session.getState().disposed,
          true,
          'navigation must close before inspecting the environment',
        );
        if (inspectFails) {
          nested = session.dispose();
          throw failure;
        }
        return false;
      },
      dispose() {
        disposals++;
      },
    }),
  });
  assert(result.ok, JSON.stringify(result.diagnostics));
  const session = requireSession(result);
  let first: unknown;
  assert.doesNotThrow(() => {
    first = session.dispose();
  });
  await assert.rejects(
    Promise.resolve(first),
    (error) => error instanceof AggregateError && error.errors.includes(failure),
  );
  assert.strictEqual(nested, first);
  assert.equal(disposals, 1);
  assert.equal(session.getState().disposed, true);
  const stopped = await session.start();
  assert.equal(stopped.disposed, true);
  assert.equal(actions, 0, 'start after disposal must not execute the story');
  assert.equal(
    requireRecord(session.dispatchCommand('navigation.nextAction'), 'refused navigation').ok,
    false,
  );
  assert.equal(requireRecord(session.queueVariableWrite({}), 'refused write').accepted, false);
  await assert.rejects(
    session.invokeAction({command: 'wait', target: null, args: {seconds: 0}}),
    /disposed/u,
  );
  assert.equal(session.hasPendingCleanup?.(), true);
  inspectFails = false;
  await session.dispose();
  assert.equal(
    disposals,
    1,
    'successful environment cleanup must not repeat just to retry inspection',
  );
  assert.equal(session.hasPendingCleanup?.(), false);
  await session.dispose();
  assert.equal(disposals, 1);
});

for (const invalid of [false, true])
  test(`runtime startup retains failed cleanup when ${invalid ? 'environment validation' : 'navigation creation'} rejects before ownership`, async () => {
    const component = await packagedProject(invalid ? 'production' : 'development', !invalid);
    let releases = 0;
    let caught: unknown;
    try {
      await createDsl4RuntimeStartup({
        featureFlags: {dsl4Runtime: true},
        project: component.project,
        sourceFrontend: frontend,
        maxSourceBytes,
        maxAssetFiles,
        maxTotalAssetBytes,
        historyNavigationAvailable: true,
        subtleCrypto,
        createRuntimeEnvironment: environmentFactory(
          () =>
            ({
              port: invalid ? {wait: 1} : {wait() {}},
              dispose() {
                if (++releases < 3) throw new Error('environment release failed');
              },
            }) as unknown as EnvironmentDouble,
        ),
      });
      assert.fail('startup must reject');
    } catch (error) {
      caught = error;
    }
    const cleanup = creationCleanup(caught);
    assert.equal(releases, 1);
    assert(cleanup.hasPendingCleanup());
    const cause = (caught as Error).cause as Error;
    if (invalid) assert.match(cause.message, /port values/u);
    else
      assert.equal(
        (cause.cause as readonly StartupDiagnostic[])[0]!.code,
        'K4-HISTORY-LIMIT-CONFIG-001',
      );
    await assert.rejects(cleanup.dispose(), AggregateError);
    assert.equal(releases, 2);
    assert(cleanup.hasPendingCleanup());
    await cleanup.dispose();
    assert.equal(releases, 3);
    assert.equal(cleanup.hasPendingCleanup(), false);
    await cleanup.dispose();
    assert.equal(releases, 3);
  });
