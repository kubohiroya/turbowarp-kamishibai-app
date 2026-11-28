import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {
  createDsl4NavigationSession,
  createDsl4RuntimeController,
  createDsl4SourceFrontend,
} from '../src/dsl4/index.js';
import type {Dsl4AssetPreloadLifecycle} from '../src/dsl4/asset-preload-coordinator.js';
import {deferred, waitUntil} from './helpers/async-test-helpers.ts';
import {requireSession} from './helpers/result-outcome.ts';
import {
  requireArray,
  requireDefined,
  requireRecord,
  requireString,
} from './helpers/require-value.ts';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const schema = JSON.parse(
  await readFile(path.join(projectRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
);
const frontend = createDsl4SourceFrontend(schema);

/** One lifecycle call a case records, with the abort signal the coordinator handed the fake. */
interface LifecycleCall {
  method: string;
  payload: Readonly<Record<string, unknown>>;
  signal?: AbortSignal;
}

type LifecyclePayload = Readonly<Record<string, unknown>>;
type PreparationContext = Readonly<{
  signal: AbortSignal;
  generation: number;
  sceneId: string | null;
}>;

function parseStory(source: string): Readonly<Record<string, unknown>> {
  const result = frontend.parse(source, {sourceId: 'asset-lifecycle-test'});
  assert(result.ok, `expected the story to parse: ${JSON.stringify(result.diagnostics)}`);
  return result.storyDocument;
}

/** The asset ids one lifecycle payload names. */
function assetIdsOf(payload: LifecyclePayload): unknown[] {
  return [...requireArray(payload.assetIds, 'the payload asset ids')];
}

/**
 * One event the controller's trace carries.
 *
 * `getTrace` clones every event, so its declared element type is `unknown`. The members these cases
 * read are named here once, with `details` defaulted so a predicate can reach into it.
 */
interface TraceEvent {
  readonly type: unknown;
  readonly sceneId: unknown;
  readonly actionPath: unknown;
  readonly generation: unknown;
  readonly details: Record<string, unknown>;
}

function traceOf(controller: {getTrace(): readonly unknown[]}): TraceEvent[] {
  return controller.getTrace().map((event) => {
    const record = requireRecord(event, 'a trace event');
    return {
      type: record.type,
      sceneId: record.sceneId,
      actionPath: record.actionPath,
      generation: record.generation,
      details: requireRecord(record.details ?? {}, 'its trace details'),
    };
  });
}

/** One case passes a lifecycle missing every member, to assert that the controller refuses it. */
function incompleteLifecycle(lifecycle: Record<string, unknown>): Dsl4AssetPreloadLifecycle {
  return lifecycle as unknown as Dsl4AssetPreloadLifecycle;
}

interface PreparationRecord {
  payload: LifecyclePayload;
  signal?: AbortSignal;
  pending?: ReturnType<typeof deferred<void>>;
}

function preparationAt(
  preparations: readonly PreparationRecord[],
  index: number,
): PreparationRecord {
  return requireDefined(preparations[index], `preparation ${index}`);
}

function diagnosticOf(state: {diagnostic?: unknown}): Record<string, unknown> {
  return requireRecord(state.diagnostic, 'the failure diagnostic');
}

const lifecycleStory = `
kamishibai: '4.0'
assets:
  AlwaysReady: backdrop
  LoadingBackdrop: backdrop
  LoadingCostume: costume:Loading
  CoverLazy:
    kind: backdrop
    name: CoverLazy
    loading: lazy
  HeroInitial:
    kind: costume
    target: Hero
    name: HeroInitial
    loading: lazy
  NextBackdrop:
    kind: backdrop
    name: NextBackdrop
    loading: lazy
  NextSound:
    kind: sound
    name: NextSound
    loading: lazy
actors:
  Hero: HeroInitial
cover:
  backdrop: CoverLazy
loading:
  backdrop: LoadingBackdrop
  costumes: [LoadingCostume]
scenes:
  opening:
    - goto: next
  next:
    - stage: NextBackdrop
    - sound: NextSound
`;

test('starts at a planned action after asset startup without replaying earlier actions', async () => {
  const effects: unknown[] = [];
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(lifecycleStory),
    port: {
      stage: async () => effects.push('stage'),
      sound: async () => effects.push('sound'),
    },
    assetLifecycle: {
      prepare: async () => {},
      setLoading: async () => {},
      releaseAssets: async () => {},
      release: async () => {},
    },
  });

  const state = await controller.start({sceneId: 'next', actionIndex: 1});
  assert.equal(state.status, 'finished');
  assert.deepEqual(effects, ['sound']);
  assert.equal(
    traceOf(controller).some(
      ({type, actionPath}) => type === 'action.start' && actionPath === '/scenes/next/actions/0',
    ),
    false,
  );
});

test('preloads the resolved target before transition and waits behind Loading', async () => {
  const pendingScene = deferred();
  const calls: LifecycleCall[] = [];
  const effects: unknown[] = [];
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(lifecycleStory),
    port: {
      stage: async () => effects.push('stage'),
      sound: async () => effects.push('sound'),
    },
    assetLifecycle: {
      prepare(payload: LifecyclePayload, context: PreparationContext) {
        calls.push({method: 'prepare', payload, signal: context.signal});
        return payload.phase === 'scene' && payload.sceneId === 'next'
          ? pendingScene.promise
          : Promise.resolve();
      },
      async setLoading(payload: LifecyclePayload) {
        calls.push({method: 'setLoading', payload});
      },
      async releaseAssets(payload: LifecyclePayload) {
        calls.push({method: 'releaseAssets', payload});
      },
      async release(payload: LifecyclePayload) {
        calls.push({method: 'release', payload});
      },
    },
  });

  const run = controller.start();
  await waitUntil(() =>
    calls.some(({method, payload}) => method === 'setLoading' && payload.visible),
  );
  assert.deepEqual(
    calls
      .filter(({method, payload}) => method === 'prepare' && payload.phase === 'startup')
      .map(({payload}) => assetIdsOf(payload)),
    [
      ['LoadingBackdrop', 'LoadingCostume'],
      ['AlwaysReady', 'CoverLazy', 'HeroInitial'],
    ],
  );
  const nextPrepare = calls.find(
    ({method, payload}) => method === 'prepare' && payload.sceneId === 'next',
  );
  assert.deepEqual(assetIdsOf(requireDefined(nextPrepare, 'the scene preparation').payload), [
    'NextBackdrop',
    'NextSound',
  ]);
  assert.deepEqual(effects, []);

  const traceBeforeReady = traceOf(controller);
  const preloadIndex = traceBeforeReady.findIndex(
    ({type, details}) => type === 'assets.preload.start' && details.sceneId === 'next',
  );
  const transitionIndex = traceBeforeReady.findIndex(
    ({type, details}) => type === 'scene.transition' && details.to === 'next',
  );
  const enterIndex = traceBeforeReady.findIndex(
    ({type, sceneId}) => type === 'scene.enter' && sceneId === 'next',
  );
  const loadingIndex = traceBeforeReady.findIndex(
    ({type, details}) => type === 'assets.loading.show' && details.sceneId === 'next',
  );
  assert.ok(preloadIndex >= 0);
  assert.ok(loadingIndex > preloadIndex);
  assert.equal(transitionIndex, -1);
  assert.equal(enterIndex, -1);

  pendingScene.resolve();
  const state = await run;
  assert.equal(state.status, 'finished');
  assert.deepEqual(effects, ['stage', 'sound']);
  assert.deepEqual(
    calls
      .filter(({method, payload}) => method === 'setLoading' && payload.sceneId === 'next')
      .map(({payload}) => payload.visible),
    [true, false],
  );
  const trace = traceOf(controller);
  const readyIndex = trace.findIndex(
    ({type, details}) => type === 'assets.scene.ready' && details.sceneId === 'next',
  );
  const committedTransitionIndex = trace.findIndex(
    ({type, details}) => type === 'scene.transition' && details.to === 'next',
  );
  assert.ok(readyIndex < committedTransitionIndex);
  assert.ok(
    trace.findIndex(({type}) => type === 'assets.loading.hide') <
      trace.findIndex(({type, sceneId}) => type === 'action.start' && sceneId === 'next'),
  );
  assert.ok(trace.every(({generation}) => Number.isInteger(generation)));
  controller.stop('finished-cleanup');
  await waitUntil(() =>
    calls.some(
      ({method, payload}) => method === 'release' && payload.reason === 'finished-cleanup',
    ),
  );
});

test('does not show Loading when scene preparation is already fulfilled', async () => {
  const loadingCalls: LifecyclePayload[] = [];
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(lifecycleStory),
    port: {stage: async () => {}, sound: async () => {}},
    assetLifecycle: {
      async prepare() {},
      async setLoading(payload: LifecyclePayload) {
        loadingCalls.push(payload);
      },
      async releaseAssets() {},
      async release() {},
    },
  });

  const state = await controller.start({sceneId: 'next'});
  assert.equal(state.status, 'finished');
  assert.deepEqual(
    loadingCalls.filter(({sceneId}) => sceneId !== null),
    [],
  );
  assert.equal(
    traceOf(controller).some(
      ({type, details}) => type === 'assets.loading.show' && details.sceneId !== null,
    ),
    false,
  );
});

test('keeps the current scene resources until the next scene is ready and bounds pose models', async () => {
  const nextPreparation = deferred();
  const calls: LifecycleCall[] = [];
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  FirstPose:
    kind: recognitionModel
    file: pose/first
    loading: lazy
  NextPose:
    kind: recognitionModel
    file: pose/next
    loading: lazy
  PersistentSound:
    kind: sound
    name: PersistentSound
    loading: lazy
scenes:
  first:
    recognitionModel: FirstPose
    actions:
      - goto: next
  next:
    recognitionModel: NextPose
    actions:
      - sound: PersistentSound
`),
    port: {sound: async () => {}},
    assetLifecycle: {
      prepare(payload: LifecyclePayload) {
        calls.push({method: 'prepare', payload});
        return payload.sceneId === 'next' ? nextPreparation.promise : Promise.resolve();
      },
      async setLoading(payload: LifecyclePayload) {
        calls.push({method: 'setLoading', payload});
      },
      async releaseAssets(payload: LifecyclePayload) {
        calls.push({method: 'releaseAssets', payload});
      },
      async release() {},
    },
  });

  const run = controller.start();
  await waitUntil(() =>
    calls.some(({method, payload}) => method === 'setLoading' && payload.sceneId === 'next'),
  );
  assert.equal(controller.getState().sceneId, 'first');
  assert.equal(
    traceOf(controller).some(
      ({type, details}) => type === 'scene.transition' && details.to === 'next',
    ),
    false,
  );
  assert.equal(
    calls.some(
      ({method, payload}) =>
        method === 'releaseAssets' && assetIdsOf(payload).includes('FirstPose'),
    ),
    false,
  );

  nextPreparation.resolve();
  const state = await run;
  assert.equal(state.status, 'finished');
  assert.equal(state.sceneId, 'next');
  const transitionIndex = traceOf(controller).findIndex(
    ({type, details}) => type === 'scene.transition' && details.to === 'next',
  );
  const releaseIndex = traceOf(controller).findIndex(
    ({type, details}) =>
      type === 'assets.release' &&
      requireArray(details.assetIds, 'the released asset ids').includes('FirstPose'),
  );
  assert.ok(transitionIndex >= 0 && transitionIndex < releaseIndex);
  assert.ok(
    calls.some(
      ({method, payload}) =>
        method === 'releaseAssets' &&
        assetIdsOf(payload).includes('FirstPose') &&
        !assetIdsOf(payload).includes('PersistentSound'),
    ),
  );
});

test('reports scene-retained release failures with a stable asset diagnostic', async () => {
  let secondActionCalls = 0;
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  FirstPose:
    kind: recognitionModel
    file: pose/first
    loading: lazy
  NextPose:
    kind: recognitionModel
    file: pose/next
    loading: lazy
scenes:
  first:
    recognitionModel: FirstPose
    actions:
      - goto: next
  next:
    recognitionModel: NextPose
    actions:
      - wait: 0
`),
    port: {wait: async () => secondActionCalls++},
    assetLifecycle: {
      async prepare() {},
      async setLoading() {},
      async releaseAssets({assetIds}: {assetIds: readonly string[]}) {
        if (assetIds.includes('FirstPose')) throw new Error('model dispose failed');
      },
      async release() {},
    },
  });
  const state = await controller.start();
  assert.equal(state.status, 'failed');
  assert.equal(state.sceneId, 'next');
  assert.equal(diagnosticOf(state).code, 'K4-ASSET-RELEASE-001');
  assert.match(
    requireString(diagnosticOf(state).message, 'the failure message'),
    /could not release/u,
  );
  assert.equal(secondActionCalls, 0);
});

test('hides Loading and fails before the first action when preparation rejects', async () => {
  const pendingScene = deferred();
  const loadingCalls: LifecyclePayload[] = [];
  let stageCalls = 0;
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(lifecycleStory),
    port: {stage: async () => stageCalls++, sound: async () => {}},
    assetLifecycle: {
      prepare(payload: LifecyclePayload) {
        return payload.phase === 'scene' ? pendingScene.promise : Promise.resolve();
      },
      async setLoading(payload: LifecyclePayload) {
        loadingCalls.push(payload);
      },
      async releaseAssets() {},
      async release() {},
    },
  });

  const run = controller.start({sceneId: 'next'});
  await waitUntil(() => loadingCalls.some(({sceneId, visible}) => sceneId === 'next' && visible));
  pendingScene.reject(new Error('decode failed'));
  const state = await run;
  assert.equal(state.status, 'failed');
  assert.equal(diagnosticOf(state).code, 'K4-ASSET-PREPARE-001');
  assert.match(requireString(diagnosticOf(state).message, 'the failure message'), /decode failed/u);
  assert.deepEqual(
    loadingCalls.filter(({phase}) => phase === undefined).map(({visible}) => visible),
    [true, false],
  );
  assert.equal(stageCalls, 0);
  assert.equal(
    requireDefined(traceOf(controller).at(-1), 'the last trace event').type,
    'runtime.fail',
  );
});

test('reports lifecycle failures at the asset StoryPath', async () => {
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  Broken:
    kind: backdrop
    name: Broken
    loading: lazy
scenes:
  opening:
    - stage: Broken
`),
    port: {stage: async () => assert.fail('scene action must not run')},
    assetLifecycle: {
      async prepare(payload: LifecyclePayload) {
        if (payload.phase === 'startup') return;
        const error = new Error('integrity mismatch');
        Object.defineProperties(error, {
          code: {value: 'K4-ASSET-REMOTE-INTEGRITY-001'},
          storyPath: {value: '/assets/Broken'},
        });
        throw error;
      },
      async setLoading() {},
      async releaseAssets() {},
      async release() {},
    },
  });
  const state = await controller.start();
  assert.equal(state.status, 'failed');
  assert.equal(diagnosticOf(state).code, 'K4-ASSET-REMOTE-INTEGRITY-001');
  assert.equal(diagnosticOf(state).storyPath, '/assets/Broken');
  assert.equal(diagnosticOf(state).message, 'integrity mismatch');
});

test('aborts stale preparation on reposition and releases lifecycle state on stop', async () => {
  const openingPreparation = deferred();
  const preparations: PreparationRecord[] = [];
  const releases: unknown[] = [];
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  OpeningBackdrop:
    kind: backdrop
    name: OpeningBackdrop
    loading: lazy
  DestinationBackdrop:
    kind: backdrop
    name: DestinationBackdrop
    loading: lazy
scenes:
  opening:
    - stage: OpeningBackdrop
  destination:
    - stage: DestinationBackdrop
`),
    port: {stage: async () => {}},
    assetLifecycle: {
      prepare(payload: LifecyclePayload, context: PreparationContext) {
        preparations.push({payload, signal: context.signal});
        return payload.sceneId === 'opening' ? openingPreparation.promise : Promise.resolve();
      },
      async setLoading() {},
      async releaseAssets() {},
      async release(payload: LifecyclePayload) {
        releases.push(payload.reason);
      },
    },
  });

  const staleRun = controller.start();
  await waitUntil(() => preparations.some(({payload}) => payload.sceneId === 'opening'));
  const opening = requireDefined(
    preparations.find(({payload}) => payload.sceneId === 'opening'),
    'the opening preparation',
  );
  const paused = controller.reposition('destination', {reason: 'history.previousScene'});
  assert.equal(paused.status, 'paused');
  assert.equal(requireDefined(opening.signal, 'its abort signal').aborted, true);
  const resumed = await controller.resume();
  assert.equal(resumed.status, 'finished');
  assert.deepEqual(
    preparations
      .filter(({payload}) => payload.phase === 'scene')
      .map(({payload}) => payload.sceneId),
    ['opening', 'destination'],
  );
  openingPreparation.resolve();
  await staleRun;

  const stoppedController = createDsl4RuntimeController({
    storyDocument: parseStory(lifecycleStory),
    port: {stage: async () => {}, sound: async () => {}},
    assetLifecycle: {
      prepare(_payload: LifecyclePayload, context: PreparationContext) {
        preparations.push({payload: {phase: 'stop-test'}, signal: context.signal});
        return new Promise(() => {});
      },
      async setLoading() {},
      async releaseAssets() {},
      async release(payload: LifecyclePayload) {
        releases.push(payload.reason);
      },
    },
  });
  const stoppedRun = stoppedController.start();
  await waitUntil(() => preparations.some(({payload}) => payload.phase === 'stop-test'));
  const stopPreparation = requireDefined(
    preparations.find(({payload}) => payload.phase === 'stop-test'),
    'the stopped preparation',
  );
  const stopped = stoppedController.stop('test-stop');
  assert.equal(stopped.status, 'stopped');
  assert.equal(requireDefined(stopPreparation.signal, 'its abort signal').aborted, true);
  assert.equal((await stoppedRun).status, 'stopped');
  await waitUntil(() => releases.includes('test-stop'));
});

test('advance during resumed preparation preserves the repositioned action boundary', async () => {
  const preparations: PreparationRecord[] = [];
  const effects: unknown[] = [];
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  First:
    kind: backdrop
    name: First
    loading: lazy
  Selected:
    kind: backdrop
    name: Selected
    loading: lazy
  Last:
    kind: backdrop
    name: Last
    loading: lazy
scenes:
  opening:
    - stage: First
    - stage: Selected
    - stage: Last
`),
    port: {stage: async ({backdrop}: {backdrop: unknown}) => effects.push(backdrop)},
    assetLifecycle: {
      prepare(payload: LifecyclePayload, preparationContext: PreparationContext) {
        if (payload.phase === 'startup') return Promise.resolve();
        const pending = deferred();
        preparations.push({payload, pending, signal: preparationContext.signal});
        return pending.promise;
      },
      async setLoading() {},
      async releaseAssets() {},
      async release() {},
    },
  });

  const staleRun = controller.start();
  await waitUntil(() => preparations.length === 1);
  const paused = controller.reposition('opening', {
    actionIndex: 1,
    reason: 'history.nextAction',
  });
  assert.equal(paused.status, 'paused');
  assert.equal(preparationAt(preparations, 0).signal?.aborted, true);
  await waitUntil(() => preparations.length === 2);

  const resumedRun = controller.resume();
  const advancedRun = controller.advance('during-loading');
  requireDefined(preparationAt(preparations, 1).pending, 'its gate').resolve();
  const advanced = await advancedRun;
  assert.equal(advanced.status, 'finished');
  assert.deepEqual(effects, ['Selected', 'Last']);
  requireDefined(preparationAt(preparations, 0).pending, 'its gate').resolve();
  await Promise.all([staleRun, resumedRun]);
});

test('validates the optional lifecycle contract', () => {
  const storyDocument = parseStory(`
kamishibai: '4.0'
scenes:
  opening: []
`);
  assert.throws(
    () =>
      createDsl4RuntimeController({
        storyDocument,
        port: {},
        assetLifecycle: incompleteLifecycle({}),
      }),
    /prepare, setLoading, releaseAssets, and release/u,
  );
});

test('passes the same lifecycle through the keymap and history navigation session', async () => {
  const preparations: PreparationRecord[] = [];
  const releases: unknown[] = [];
  const result = createDsl4NavigationSession({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  Scene:
    kind: backdrop
    name: Scene
    loading: lazy
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - stage: Scene
`),
    controlProfile: 'production',
    port: {stage: async () => {}},
    assetLifecycle: {
      async prepare(payload: LifecyclePayload) {
        preparations.push({payload});
      },
      async setLoading() {},
      async releaseAssets() {},
      async release(payload: LifecyclePayload) {
        releases.push(payload.reason);
      },
    },
  });
  const session = requireSession(result, 'the navigation session');
  const state = await session.start();
  assert.equal(state.status, 'finished');
  assert.deepEqual(
    preparations.map(({payload}) => [payload.phase, payload.sceneId, payload.assetIds]),
    [
      ['startup', null, []],
      ['scene', 'opening', ['Scene']],
    ],
  );
  await session.dispose();
  await waitUntil(() => releases.includes('dispose'));
});
