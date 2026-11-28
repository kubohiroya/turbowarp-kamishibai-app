import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {strToU8, unzipSync, zipSync} from 'fflate';

import {embedDsl4PackagedRuntimeComponentInSb3} from '../src/builder/index.js';
import {deferred} from './helpers/async-test-helpers.ts';
import {createDsl4EmptyProject} from './helpers/dsl4-runtime-fixtures.ts';
import {okResult, requireSession} from './helpers/result-outcome.ts';
import {requireRecord} from './helpers/require-value.ts';
import {
  createDsl4EmbeddedAssetBundle,
  createDsl4EmbeddedSourceDescriptor,
  createDsl4RuntimeArtifactDescriptor,
  createDsl4RuntimeStartup,
  createDsl4SourceFrontend,
} from '../src/dsl4/index.js';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const schema = JSON.parse(
  await readFile(path.join(repositoryRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
);
const sourceText = await readFile(
  new URL('fixtures/dsl4/cross-surface-navigation.kamishibai.yaml', import.meta.url),
  'utf8',
);
/** The delivery-surface contract fixture: one entry per surface the runtime must behave alike on. */
interface SurfaceContract {
  formatVersion: number;
  controlProfile: string;
  resolvedKeymap: Record<string, unknown>;
  surfaces: {id: string; label: string; delivery: string; channel: 'bundled' | 'unbundled'}[];
  expected: {
    visitedScenes: string[];
    rewoundScenes: string[];
    rebuiltFutureScenes: string[];
    scoreBeforeRewind: number;
    scoreAfterFutureRebuild: number;
  };
}

const contract: SurfaceContract = JSON.parse(
  await readFile(new URL('fixtures/dsl4/cross-surface-navigation.json', import.meta.url), 'utf8'),
);
const frontend = createDsl4SourceFrontend(schema);
const subtleCrypto = webcrypto.subtle;
const limits = Object.freeze({
  maxSourceBytes: 16_384,
  maxAssetFiles: 8,
  maxTotalAssetBytes: 8_192,
});
const historyLimits = Object.freeze({maxActionEntries: 32, maxSceneVisits: 16});

function baseSb3() {
  return Buffer.from(
    zipSync({
      'project.json': strToU8(`${JSON.stringify(createDsl4EmptyProject())}\n`),
    }),
  );
}

/** The runtime and history members these cases read out of one session state. */
interface SceneVisit {
  sceneId: string;
  visitId: number;
}

interface HistoryState {
  sceneVisits: SceneVisit[];
}

interface RuntimeState extends Record<string, unknown> {
  status: string;
  sceneId: string;
  variables: Record<string, unknown>;
}

/** Read the runtime execution state one session publishes. */
function runtimeStateOf(state: Record<string, unknown>): RuntimeState {
  return requireRecord(state.runtime, 'the runtime state') as unknown as RuntimeState;
}

/** Read the navigation history one session publishes. */
function historyOf(state: Record<string, unknown>): HistoryState {
  return requireRecord(state.history, 'the navigation history') as unknown as HistoryState;
}

/** The runtime artifact a startup published, which the loader declares opaquely. */
function runtimeArtifactOf(startup: Record<string, unknown>): Record<string, unknown> {
  return requireRecord(
    requireRecord(startup.runtimeComponent, 'the runtime component').runtimeArtifact,
    'its runtime artifact',
  );
}

function projectFromSb3(bytes: Uint8Array) {
  const projectBytes = unzipSync(bytes)['project.json'];
  assert.ok(projectBytes, 'project.json must remain in the SB3');
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(projectBytes));
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

async function waitFor(predicate: () => unknown, message: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail(message);
}

async function packagedComponent() {
  const parsed = frontend.parse(sourceText, {
    sourceId: 'cross-surface-navigation.kamishibai.yaml',
  });
  assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
  const sourceDescriptor = await createDsl4EmbeddedSourceDescriptor(sourceText, {
    sourceId: 'cross-surface-navigation.kamishibai.yaml',
    displayName: 'cross-surface-navigation.kamishibai.yaml',
    maxSourceBytes: limits.maxSourceBytes,
    subtleCrypto,
  });
  const artifactResult = await createDsl4RuntimeArtifactDescriptor(
    parsed.storyDocument,
    sourceDescriptor,
    contract.controlProfile,
    {
      maxSourceBytes: limits.maxSourceBytes,
      historyNavigationAvailable: true,
      subtleCrypto,
    },
  );
  assert.equal(artifactResult.ok, true, JSON.stringify(artifactResult.diagnostics));
  const assetBundle = await createDsl4EmbeddedAssetBundle(
    parsed.storyDocument,
    {
      manifest: {formatVersion: 1, assets: []},
      getFile() {
        assert.fail('the cross-surface fixture has no binary assets');
      },
    },
    {maxFiles: limits.maxAssetFiles, maxTotalBytes: limits.maxTotalAssetBytes, subtleCrypto},
  );
  return Object.freeze({
    storyDocument: parsed.storyDocument,
    sourceDescriptor,
    runtimeArtifact: okResult(artifactResult, 'the runtime artifact descriptor').artifact,
    assetBundle,
  });
}

async function rehearsalPackagedComponent() {
  const source = `kamishibai: '4.0'
controls:
  keymaps:
    production:
      ArrowRight: rehearsal.skipAction
      ArrowDown: rehearsal.skipScene
scenes:
  opening:
    - wait: 60
    - wait: 60
    - wait: 60
  ending:
    - wait: 60
`;
  const parsed = frontend.parse(source, {sourceId: 'cross-surface-rehearsal.k4.yml'});
  assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
  const sourceDescriptor = await createDsl4EmbeddedSourceDescriptor(source, {
    sourceId: 'cross-surface-rehearsal.k4.yml',
    displayName: 'cross-surface-rehearsal.k4.yml',
    maxSourceBytes: limits.maxSourceBytes,
    subtleCrypto,
  });
  const artifactResult = await createDsl4RuntimeArtifactDescriptor(
    parsed.storyDocument,
    sourceDescriptor,
    'production',
    {maxSourceBytes: limits.maxSourceBytes, subtleCrypto},
  );
  assert.equal(artifactResult.ok, true, JSON.stringify(artifactResult.diagnostics));
  const assetBundle = await createDsl4EmbeddedAssetBundle(
    parsed.storyDocument,
    {
      manifest: {formatVersion: 1, assets: []},
      getFile() {
        assert.fail('the cross-surface rehearsal fixture has no binary assets');
      },
    },
    {maxFiles: limits.maxAssetFiles, maxTotalBytes: limits.maxTotalAssetBytes, subtleCrypto},
  );
  return Object.freeze({
    storyDocument: parsed.storyDocument,
    sourceDescriptor,
    runtimeArtifact: okResult(artifactResult, 'the runtime artifact descriptor').artifact,
    assetBundle,
  });
}

async function projectForSurface(
  component: Awaited<ReturnType<typeof packagedComponent>>,
  surface: (typeof contract.surfaces)[number],
) {
  const embedded = await embedDsl4PackagedRuntimeComponentInSb3(
    baseSb3(),
    component.storyDocument,
    component.sourceDescriptor,
    component.runtimeArtifact,
    component.assetBundle,
    {
      channel: surface.channel,
      ...limits,
      historyNavigationAvailable: true,
      subtleCrypto,
    },
  );
  return projectFromSb3(embedded.bytes);
}

async function exerciseSurface(
  component: Awaited<ReturnType<typeof packagedComponent>>,
  surface: (typeof contract.surfaces)[number],
) {
  const waits: ReturnType<typeof deferred<void>>[] = [];
  let presentationState = 'initial';
  const project = await projectForSurface(component, surface);
  const startup = await createDsl4RuntimeStartup({
    featureFlags: {dsl4Runtime: true},
    project,
    sourceFrontend: frontend,
    ...limits,
    historyNavigationAvailable: true,
    historyLimits,
    subtleCrypto,
    port: {
      wait(
        _payload: unknown,
        context: {
          getVariable(name: string): unknown;
          setVariable(name: string, value: unknown): unknown;
        },
      ) {
        const nextScore = Number(context.getVariable('score')) + 1;
        context.setVariable('score', nextScore);
        presentationState = `wait-${nextScore}`;
        const pending = deferred<void>();
        waits.push(pending);
        return pending.promise;
      },
    },
  });
  const started = okResult(startup, `the ${surface.label} startup`);
  assert.equal(started.channel, surface.channel);
  assert.equal(runtimeArtifactOf(started).controlProfile, contract.controlProfile);
  assert.deepEqual(runtimeArtifactOf(started).resolvedKeymap, contract.resolvedKeymap);
  assert.equal(runtimeArtifactOf(started).historyNavigationEnabled, true);

  const session = requireSession(startup, `the ${surface.label} startup`);
  const unbound = keyEvent('ArrowRight');
  assert.equal(session.handleKeyDown(unbound), false);
  assert.deepEqual(unbound.counters, {preventDefault: 0, stopPropagation: 0});

  session.start();
  await waitFor(() => waits.length === 1, `${surface.label}: opening did not start`);
  for (const expectedWaitCount of [2, 3]) {
    const advance = keyEvent('Space');
    assert.equal(session.handleKeyDown(advance), true);
    await session.whenInputIdle();
    assert.deepEqual(advance.counters, {preventDefault: 1, stopPropagation: 1});
    await waitFor(
      () => waits.length === expectedWaitCount,
      `${surface.label}: the next scene did not start`,
    );
  }
  assert.deepEqual(
    historyOf(session.getState()).sceneVisits.map(({sceneId}) => sceneId),
    contract.expected.visitedScenes,
  );
  assert.equal(
    runtimeStateOf(session.getState()).variables.score,
    contract.expected.scoreBeforeRewind,
  );
  assert.equal(presentationState, `wait-${contract.expected.scoreBeforeRewind}`);

  const rewoundScenes: unknown[] = [];
  for (const code of ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowDown']) {
    const navigation = keyEvent(code);
    assert.equal(session.handleKeyDown(navigation), true);
    await session.whenInputIdle();
    assert.deepEqual(navigation.counters, {preventDefault: 1, stopPropagation: 1});
    rewoundScenes.push(runtimeStateOf(session.getState()).sceneId);
    assert.equal(
      runtimeStateOf(session.getState()).variables.score,
      contract.expected.scoreBeforeRewind,
    );
    assert.equal(presentationState, `wait-${contract.expected.scoreBeforeRewind}`);
  }
  assert.deepEqual(rewoundScenes, contract.expected.rewoundScenes);

  session.handleKeyDown(keyEvent('Space'));
  await session.whenInputIdle();
  await waitFor(() => waits.length === 4, `${surface.label}: history position did not resume`);
  assert.deepEqual(
    historyOf(session.getState()).sceneVisits.map(({sceneId}) => sceneId),
    ['opening', 'middle'],
  );

  session.handleKeyDown(keyEvent('Space'));
  await session.whenInputIdle();
  await waitFor(() => waits.length === 5, `${surface.label}: rebuilt future did not start`);
  const finalState = session.getState();
  const summary = {
    surface: surface.id,
    delivery: surface.delivery,
    channel: started.channel,
    keymap: finalState.keymap,
    historyEnabled: finalState.historyEnabled,
    sceneVisits: historyOf(finalState).sceneVisits.map(({sceneId}) => sceneId),
    visitIds: historyOf(finalState).sceneVisits.map(({visitId}) => visitId),
    score: runtimeStateOf(finalState).variables.score,
    presentationState,
  };
  assert.deepEqual(summary.sceneVisits, contract.expected.rebuiltFutureScenes);
  assert.deepEqual(summary.visitIds, [1, 2, 4]);
  assert.equal(summary.score, contract.expected.scoreAfterFutureRebuild);
  assert.equal(summary.presentationState, `wait-${contract.expected.scoreAfterFutureRebuild}`);

  const previousAction = keyEvent('ArrowLeft');
  assert.equal(session.handleKeyDown(previousAction), true);
  await session.whenInputIdle();
  assert.deepEqual(previousAction.counters, {preventDefault: 1, stopPropagation: 1});
  assert.equal(runtimeStateOf(session.getState()).status, 'paused');
  assert.equal(
    runtimeStateOf(session.getState()).variables.score,
    contract.expected.scoreAfterFutureRebuild,
  );
  assert.equal(presentationState, `wait-${contract.expected.scoreAfterFutureRebuild}`);

  session.stop('cross-surface-fixture-complete');
  for (const wait of waits) wait.resolve();
  return summary;
}

test('runs one immutable keymap and chronological history contract on every delivery surface', async () => {
  assert.equal(contract.formatVersion, 1);
  assert.deepEqual(
    contract.surfaces.map(({id}) => id),
    ['web', 'turbowarpEditor', 'packager'],
  );
  const component = await packagedComponent();
  assert.deepEqual(
    requireRecord(component.runtimeArtifact, 'the runtime artifact').resolvedKeymap,
    contract.resolvedKeymap,
  );

  const results: unknown[] = [];
  for (const surface of contract.surfaces) {
    results.push(await exerciseSurface(component, surface));
  }
  const transportMembers = new Set(['surface', 'delivery', 'channel']);
  const semanticResults = results.map((result) =>
    Object.fromEntries(
      Object.entries(requireRecord(result, 'a surface result')).filter(
        ([member]) => !transportMembers.has(member),
      ),
    ),
  );
  assert.deepEqual(semanticResults[1], semanticResults[0]);
  assert.deepEqual(semanticResults[2], semanticResults[0]);
});

test('reproduces rehearsal action and scene skips on every delivery surface', async () => {
  const component = await rehearsalPackagedComponent();
  for (const surface of contract.surfaces) {
    const waits = [];
    const project = await projectForSurface(component, surface);
    const startup = await createDsl4RuntimeStartup({
      featureFlags: {dsl4Runtime: true},
      project,
      sourceFrontend: frontend,
      ...limits,
      subtleCrypto,
      port: {
        wait(_payload: unknown, context: {signal: AbortSignal}) {
          const pending = deferred<void>();
          waits.push(pending);
          context.signal.addEventListener(
            'abort',
            () => {
              const error = new Error('rehearsal wait cancelled');
              error.name = 'AbortError';
              pending.reject(error);
            },
            {once: true},
          );
          return pending.promise;
        },
      },
    });
    okResult(startup, `the ${surface.label} rehearsal startup`);
    const run = requireSession(startup).start();
    await waitFor(() => waits.length === 1, `${surface.label}: first wait did not start`);

    const right = keyEvent('ArrowRight');
    assert.equal(requireSession(startup).handleKeyDown(right), true);
    assert.deepEqual(right.counters, {preventDefault: 1, stopPropagation: 1});
    await waitFor(() => waits.length === 2, `${surface.label}: action skip did not advance`);
    assert.equal(runtimeStateOf(requireSession(startup).getState()).actionIndex, 1);

    const down = keyEvent('ArrowDown');
    assert.equal(requireSession(startup).handleKeyDown(down), true);
    assert.deepEqual(down.counters, {preventDefault: 1, stopPropagation: 1});
    await waitFor(
      () =>
        runtimeStateOf(requireSession(startup).getState()).sceneId === 'ending' &&
        waits.length === 3,
      `${surface.label}: scene skip did not enter ending`,
    );
    assert.equal(runtimeStateOf(requireSession(startup).getState()).actionIndex, 0);

    requireSession(startup).stop('cross-surface-rehearsal-complete');
    await Promise.allSettled([run, requireSession(startup).getRunPromise()]);
  }
});

test('keeps the shared runtime composition root inert on every surface while the flag is OFF', async () => {
  for (const surface of contract.surfaces) {
    const result = await createDsl4RuntimeStartup({
      featureFlags: {dsl4Runtime: false},
      project: new Proxy({}, {get: () => assert.fail(`${surface.label}: project was inspected`)}),
      sourceFrontend: new Proxy(
        {},
        {get: () => assert.fail(`${surface.label}: frontend was inspected`)},
      ) as NonNullable<
        NonNullable<Parameters<typeof createDsl4RuntimeStartup>[0]>['sourceFrontend']
      >,
    });
    const inert = okResult(result, `the inert ${surface.label} startup`);
    assert.equal(inert.enabled, false);
    assert.equal(inert.session, null);
  }
});
