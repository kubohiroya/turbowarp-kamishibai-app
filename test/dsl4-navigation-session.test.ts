import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {
  createDsl4InputArbitration,
  createDsl4NavigationSession,
  createDsl4SourceFrontend,
} from '../src/dsl4/index.js';
import {thrown} from './helpers/thrown-error.ts';
import {deferred} from './helpers/async-test-helpers.ts';
import {requireSession, type RuntimeSessionMembers} from './helpers/result-outcome.ts';
import {requireArray, requireDefined, requireRecord} from './helpers/require-value.ts';

/** The runtime and history members these cases read out of one session state. */
interface SceneVisit {
  sceneId: string;
  visitId: number;
}

interface HistoryState {
  sceneVisits: SceneVisit[];
  actionEntries: unknown[];
}

interface RuntimeState extends Record<string, unknown> {
  status: string;
  sceneId?: string;
  actionPath?: string | null;
  variables: Record<string, unknown>;
}

/** Read the runtime execution state one session publishes. */
function runtimeStateOf(state: Record<string, unknown>): RuntimeState {
  return requireRecord(state.runtime, 'the runtime state') as unknown as RuntimeState;
}

/** Read the history the session publishes for a case that drives scene navigation. */
function historyOf(state: Record<string, unknown>): HistoryState {
  return requireRecord(state.history, 'the navigation history') as unknown as HistoryState;
}

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const schema = JSON.parse(
  await readFile(path.join(projectRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
);
const frontend = createDsl4SourceFrontend(schema);

function parseStory(source: string) {
  const result = frontend.parse(source, {sourceId: 'session-test.kamishibai.yaml'});
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.storyDocument;
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

function pointerEvent(pointerType = 'touch') {
  const counters = {preventDefault: 0, stopPropagation: 0};
  return {
    pointerType,
    isPrimary: true,
    button: 0,
    defaultPrevented: false,
    target: null,
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
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail(message);
}

const controls = `
controls:
  keymaps:
    development:
      Space: navigation.nextAction
      ArrowLeft: history.previousAction
      ArrowUp: history.previousScene
      ArrowDown: history.nextScene
    production:
      Space: navigation.nextAction
`;

test('exposes active TurboWarp action invocation without creating a second controller', async () => {
  const story = parseStory(`
kamishibai: '4.0'
${controls}
scenes:
  opening:
    - broadcastMessageAndWait: receiver
`);
  const opened: {session?: RuntimeSessionMembers} = {};
  let nestedResult;
  const contexts: unknown[] = [];
  const created = createDsl4NavigationSession({
    storyDocument: story,
    controlProfile: 'production',
    broadcastMessageAndWaitEnabled: true,
    port: {
      async broadcastMessageAndWait(_payload: unknown, context: unknown) {
        contexts.push(context);
        nestedResult = await requireDefined(opened.session, 'the navigation session').invokeAction({
          command: 'wait',
          target: null,
          args: {seconds: 0},
        });
      },
      async wait(_payload: unknown, context: unknown) {
        contexts.push(context);
      },
    },
  });
  assert.equal(created.ok, true, JSON.stringify(created.diagnostics));
  opened.session = requireSession(created);

  await requireSession(created).start();

  assert.deepEqual(nestedResult, {outcome: 'completed'});
  assert.equal(contexts.length, 2);
  assert.equal(contexts[0], contexts[1]);
  requireSession(created).dispose();
  await assert.rejects(
    requireSession(created).invokeAction({command: 'wait', target: null, args: {seconds: 0}}),
    (error) => thrown(error).code === 'K4-NAVIGATION-DISPOSED',
  );
});

test('history-free profile creates no history state and dispatches only its selected keymap', async () => {
  const pending = deferred<void>();
  let stageCalls = 0;
  const story = parseStory(`
kamishibai: '4.0'
${controls}
assets:
  Beach: backdrop
scenes:
  opening:
    - wait: 1
    - stage: Beach
`);
  const created = createDsl4NavigationSession({
    storyDocument: story,
    controlProfile: 'production',
    port: {
      wait: () => pending.promise,
      stage: async () => stageCalls++,
    },
  });
  assert.equal(created.ok, true, JSON.stringify(created.diagnostics));
  const session = requireSession(created);
  const staleRun = session.start();
  assert.equal(session.getState().historyEnabled, false);
  assert.equal(session.getState().history, null);

  const arrow = keyEvent('ArrowLeft');
  assert.equal(session.handleKeyDown(arrow), false);
  assert.deepEqual(arrow.counters, {preventDefault: 0, stopPropagation: 0});
  const inactive = requireRecord(
    session.dispatchCommand('history.previousAction'),
    'the command result',
  );
  assert.equal(inactive.ok, false);
  assert.equal(
    requireRecord(requireArray(inactive.diagnostics, 'its diagnostics')[0], 'its first diagnostic')
      .code,
    'K4-KEYMAP-COMMAND-INACTIVE',
  );

  const space = keyEvent('Space');
  assert.equal(session.handleKeyDown(space), true);
  await session.whenInputIdle();
  await waitFor(() => stageCalls === 1, 'selected nextAction did not advance the runtime');
  assert.deepEqual(space.counters, {preventDefault: 1, stopPropagation: 1});
  assert.equal(session.getState().history, null);
  pending.resolve();
  await staleRun;
});

test('wires story key priority and pointer suppression through one navigation adapter', async () => {
  const pending = deferred<void>();
  const calls: unknown[][] = [];
  const story = parseStory(`
kamishibai: '4.0'
${controls}
scenes:
  opening:
    - wait: 1
`);
  const inputArbitration = {
    shouldDeferNavigationKey(context: {code: string; historyPaused: boolean}) {
      calls.push(['key', context]);
      return context.code === 'Space' && !context.historyPaused;
    },
    arbitrateNavigationPointer(context: unknown) {
      calls.push(['pointer', context]);
      return 'suppress';
    },
    cancelNavigationPointer(context: unknown) {
      calls.push(['cancel', context]);
    },
  };
  const created = createDsl4NavigationSession({
    storyDocument: story,
    controlProfile: 'production',
    port: {wait: () => pending.promise},
    speechAdvanceTypewriterEnabled: true,
    inputArbitration,
  });
  assert.equal(created.ok, true, JSON.stringify(created.diagnostics));
  const run = requireSession(created).start();

  const key = keyEvent('Space');
  assert.equal(requireSession(created).handleKeyDown(key), false);
  assert.deepEqual(key.counters, {preventDefault: 0, stopPropagation: 0});
  const pointer = pointerEvent();
  assert.equal(requireSession(created).handlePointerUp(pointer), true);
  assert.deepEqual(pointer.counters, {preventDefault: 1, stopPropagation: 1});
  assert.equal(
    requireSession(created).handlePointerCancel({pointerType: 'touch', isPrimary: true}),
    false,
  );
  assert.deepEqual(calls, [
    ['key', {code: 'Space', historyPaused: false}],
    ['pointer', {pointerType: 'touch', historyPaused: false}],
    ['cancel', {pointerType: 'touch'}],
  ]);

  requireSession(created).stop('test-cleanup');
  pending.resolve();
  await run;
  requireSession(created).dispose();
});

test('lets a different navigation key cancel an active story key action exactly once', async () => {
  const arbitration = createDsl4InputArbitration();
  let cancellations = 0;
  const story = parseStory(`
kamishibai: '4.0'
${controls}
scenes:
  opening:
    - keyInputToChangeScene:
        ArrowRight: chosen
    - wait: 0
  chosen: []
`);
  const created = createDsl4NavigationSession({
    storyDocument: story,
    controlProfile: 'production',
    inputArbitration: arbitration,
    port: {
      keyInputToChangeScene(payload: {codes: string[]}, context: {signal: AbortSignal}) {
        const token = arbitration.beginStoryInput('key', payload.codes);
        return new Promise((_resolve, reject) => {
          context.signal.addEventListener(
            'abort',
            () => {
              cancellations += 1;
              arbitration.finishStoryInput(token);
              const error = new Error('story key wait cancelled');
              error.name = 'AbortError';
              reject(error);
            },
            {once: true},
          );
        });
      },
      wait: async () => {},
    },
  });
  assert.equal(created.ok, true, JSON.stringify(created.diagnostics));
  const run = requireSession(created).start();
  await waitFor(
    () => arbitration.getState().activeStoryInputKind === 'key',
    'story key wait did not start',
  );

  const storyKey = keyEvent('ArrowRight');
  assert.equal(requireSession(created).handleKeyDown(storyKey), false);
  assert.deepEqual(storyKey.counters, {preventDefault: 0, stopPropagation: 0});
  const navigationKey = keyEvent('Space');
  assert.equal(requireSession(created).handleKeyDown(navigationKey), true);
  assert.deepEqual(navigationKey.counters, {preventDefault: 1, stopPropagation: 1});
  await requireSession(created).whenInputIdle();
  assert.equal(cancellations, 1);
  await run;
  await requireSession(created).getRunPromise();
  assert.equal(runtimeStateOf(requireSession(created).getState()).status, 'finished');
  assert.equal(cancellations, 1);
  assert.equal(arbitration.getState().activeStoryInputKind, null);
  requireSession(created).dispose();
  arbitration.dispose();
});

test('reports an unchanged command when pose policy refuses nextAction', async () => {
  const cleanup = deferred<void>();
  let aborted = false;
  const story = parseStory(`
kamishibai: '4.0'
${controls}
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
  navigation:
    allowSkip: false
scenes:
  rescue:
    recognitionModel: RescuePose
    actions:
      - Hero.pose:
          steps:
            - pose: help
`);
  const created = createDsl4NavigationSession({
    storyDocument: story,
    controlProfile: 'production',
    poseNavigationPolicyEnabled: true,
    port: {
      waitForPose: (_payload: unknown, context: {signal: AbortSignal}) =>
        new Promise((resolve) => {
          context.signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              void cleanup.promise.then(resolve);
            },
            {once: true},
          );
        }),
    },
  });
  assert.equal(created.ok, true, JSON.stringify(created.diagnostics));
  const run = requireSession(created).start();

  const initialKey = keyEvent('Space');
  assert.equal(requireSession(created).handleKeyDown(initialKey), false);
  assert.deepEqual(initialKey.counters, {preventDefault: 0, stopPropagation: 0});
  const repeatKey = keyEvent('Space');
  repeatKey.repeat = true;
  assert.equal(requireSession(created).handleKeyDown(repeatKey), false);
  assert.deepEqual(repeatKey.counters, {preventDefault: 0, stopPropagation: 0});
  await requireSession(created).whenInputIdle();

  const result = requireRecord(
    requireSession(created).dispatchCommand('navigation.nextAction'),
    'the command result',
  );
  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(aborted, false);
  assert.equal(runtimeStateOf(requireSession(created).getState()).status, 'running');

  requireSession(created).stop('test-cleanup');
  cleanup.resolve();
  await run;
});

test('reproduces the 3.2 rehearsal key contexts from a production YAML profile', async () => {
  const poseCleanups = [deferred(), deferred()];
  const finalWait = deferred<void>();
  const calls: unknown[][] = [];
  let poseIndex = 0;
  const story = parseStory(`
kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: rehearsal.skipPose
      ArrowRight: rehearsal.skipAction
      ArrowDown: rehearsal.skipScene
assets:
  HeroIdle: costume:Hero
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
actors: {Hero: HeroIdle}
recognition:
  navigation: {allowSkip: true}
scenes:
  rescue:
    recognitionModel: RescuePose
    actions:
      - Hero.pose:
          steps:
            - {pose: first}
            - {pose: second}
      - wait: 30
      - wait: 30
  ending:
    - wait: 30
`);
  const created = createDsl4NavigationSession({
    storyDocument: story,
    controlProfile: 'production',
    port: {
      waitForPose({stepIndex}: {stepIndex: number}, context: {signal: AbortSignal}) {
        poseIndex = stepIndex;
        calls.push(['pose', stepIndex]);
        return new Promise((_resolve, reject) => {
          context.signal.addEventListener(
            'abort',
            () => {
              calls.push(['pose-abort', stepIndex]);
              void requireDefined(poseCleanups[stepIndex], 'the pose cleanup gate').promise.then(
                () => {
                  calls.push(['pose-cleanup', stepIndex]);
                  const error = new Error('pose cancelled');
                  error.name = 'AbortError';
                  reject(error);
                },
              );
            },
            {once: true},
          );
        });
      },
      wait({seconds}: {seconds: number}, context: {signal: AbortSignal}) {
        calls.push(['wait', seconds]);
        return new Promise((_resolve, reject) => {
          context.signal.addEventListener(
            'abort',
            () => {
              calls.push(['wait-abort', seconds]);
              const error = new Error('wait cancelled');
              error.name = 'AbortError';
              reject(error);
            },
            {once: true},
          );
          void finalWait.promise.then(() => {});
        });
      },
    },
  });
  assert.equal(created.ok, true, JSON.stringify(created.diagnostics));
  const session = requireSession(created);
  const initialRun = session.start();
  await waitFor(() => calls.some(([type]) => type === 'pose'), 'first pose did not start');

  const space = keyEvent('Space');
  assert.equal(session.handleKeyDown(space), true);
  assert.deepEqual(space.counters, {preventDefault: 1, stopPropagation: 1});
  assert.equal(session.handleKeyDown(keyEvent('ArrowRight')), false);
  assert.equal(session.handleKeyDown(keyEvent('ArrowDown')), false);
  requireDefined(poseCleanups[0], 'the pose cleanup gate').resolve();
  await waitFor(() => poseIndex === 1, 'Space did not continue to the next pose step');

  const right = keyEvent('ArrowRight');
  assert.equal(session.handleKeyDown(right), true);
  assert.equal(session.handleKeyDown(keyEvent('ArrowDown')), false);
  requireDefined(poseCleanups[1], 'the pose cleanup gate').resolve();
  await waitFor(
    () => calls.some(([type]) => type === 'wait'),
    'ArrowRight did not finish the pose action',
  );
  assert.equal(runtimeStateOf(session.getState()).actionPath, '/scenes/rescue/actions/1');

  const down = keyEvent('ArrowDown');
  assert.equal(session.handleKeyDown(down), true);
  await waitFor(
    () => runtimeStateOf(session.getState()).sceneId === 'ending',
    'ArrowDown did not enter the next scene',
  );
  assert.equal(runtimeStateOf(session.getState()).actionPath, '/scenes/ending/actions/0');
  assert.equal(session.handleKeyDown(keyEvent('Space')), false);
  assert.equal(session.handleKeyDown(keyEvent('ArrowRight')), true);

  session.stop('test-cleanup');
  await Promise.allSettled([initialRun, session.getRunPromise()]);
});

test('preserves mixed history and nextAction arrival order while pose policy is enabled', async () => {
  async function runOrder(codes: string[]) {
    const waits: ReturnType<typeof deferred<void>>[] = [];
    const story = parseStory(`
kamishibai: '4.0'
${controls}
scenes:
  opening:
    - wait: 1
    - wait: 1
    - wait: 1
`);
    const created = createDsl4NavigationSession({
      storyDocument: story,
      controlProfile: 'development',
      historyNavigationAvailable: true,
      historyLimits: {maxActionEntries: 10, maxSceneVisits: 10},
      poseNavigationPolicyEnabled: true,
      port: {
        wait(_payload: unknown, context: {signal: AbortSignal}) {
          const pending = deferred<void>();
          context.signal.addEventListener(
            'abort',
            () => {
              const error = new Error('wait cancelled');
              error.name = 'AbortError';
              pending.reject(error);
            },
            {once: true},
          );
          waits.push(pending);
          return pending.promise;
        },
      },
    });
    assert.equal(created.ok, true, JSON.stringify(created.diagnostics));
    const session = requireSession(created);
    const initialRun = session.start();
    await waitFor(() => waits.length === 1, 'first wait did not start');
    for (const expectedWaits of [2, 3]) {
      requireDefined(waits[expectedWaits - 2], 'the pending wait').resolve();
      await waitFor(() => waits.length === expectedWaits, 'next wait did not start');
    }

    for (const code of codes) assert.equal(session.handleKeyDown(keyEvent(code)), true);
    await session.whenInputIdle();
    await Promise.resolve();
    const state = runtimeStateOf(session.getState());

    const activeRun = session.getRunPromise();
    session.stop('test-cleanup');
    await Promise.allSettled([initialRun, activeRun]);
    session.dispose();
    return state;
  }

  const historyThenNext = await runOrder(['ArrowLeft', 'Space']);
  assert.equal(historyThenNext.status, 'running', JSON.stringify(historyThenNext));
  // ArrowLeft restarts the in-progress third action, so Space resumes that same action.
  assert.equal(historyThenNext.actionPath, '/scenes/opening/actions/2');

  const nextThenHistory = await runOrder(['Space', 'ArrowLeft']);
  assert.equal(nextThenHistory.status, 'paused');
  assert.equal(nextThenHistory.actionPath, '/scenes/opening/actions/1');
});

test('passes a planned action and variable snapshot through the public session start', async () => {
  const calls: unknown[][] = [];
  const story = parseStory(`
kamishibai: '4.0'
${controls}
variables:
  score: 1
scenes:
  opening:
    - wait: 1
    - wait: 2
`);
  const created = createDsl4NavigationSession({
    storyDocument: story,
    controlProfile: 'production',
    port: {
      wait: async (payload: {seconds: number}, context: {getVariable(name: string): unknown}) =>
        calls.push([payload.seconds, context.getVariable('score')]),
    },
  });
  assert.equal(created.ok, true, JSON.stringify(created.diagnostics));

  const state = await requireSession(created).start({
    sceneId: 'opening',
    actionIndex: 1,
    variables: {score: 9},
  });
  assert.equal(state.status, 'finished');
  assert.deepEqual(calls, [[2, 9]]);
  assert.equal(requireSession(created).getState().history, null);
});

test('exposes the runtime quiesce gate with the startup-fixed core action policy', async () => {
  const cleanup = deferred<void>();
  let calls = 0;
  let aborted = false;
  const story = parseStory(`
kamishibai: '4.0'
${controls}
scenes:
  opening:
    - wait: 1
    - wait: 2
`);
  const created = createDsl4NavigationSession({
    storyDocument: story,
    controlProfile: 'production',
    port: {
      wait(_payload: unknown, context: {signal: AbortSignal}) {
        calls += 1;
        if (calls > 1) return Promise.resolve();
        return new Promise((_resolve, reject) => {
          context.signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              cleanup.promise.then(() => {
                const error = new Error('cancelled');
                error.name = 'AbortError';
                reject(error);
              });
            },
            {once: true},
          );
        });
      },
    },
  });
  assert.equal(created.ok, true, JSON.stringify(created.diagnostics));
  const initialRun = requireSession(created).start();
  await waitFor(() => calls === 1, 'first action did not start');
  const quiesced = requireSession(created).quiesce({candidateId: 9});
  assert.equal(aborted, true);
  cleanup.resolve();

  const token = requireRecord(await quiesced, 'the quiesce token');
  assert.equal(token.resumeMode, 'replay-action');
  assert.equal(token.storyPath, '/scenes/opening/actions/0');
  await initialRun;
  await requireSession(created).resumeQuiesce(9);
  await requireSession(created).getRunPromise();
  assert.equal(calls, 3);
  assert.equal(runtimeStateOf(requireSession(created).getState()).status, 'finished');
  requireSession(created).dispose();
});

test('history profile requires availability and explicit finite limits', () => {
  const story = parseStory(`
kamishibai: '4.0'
${controls}
scenes:
  opening: []
`);
  const unavailable = createDsl4NavigationSession({
    storyDocument: story,
    controlProfile: 'development',
    port: {},
  });
  assert.equal(unavailable.ok, false);
  assert.equal(
    requireDefined(unavailable.diagnostics[0], 'the first diagnostic').code,
    'K4-KEYMAP-HISTORY-UNAVAILABLE',
  );

  const noLimits = createDsl4NavigationSession({
    storyDocument: story,
    controlProfile: 'development',
    historyNavigationAvailable: true,
    port: {},
  });
  assert.equal(noLimits.ok, false);
  assert.equal(
    requireDefined(noLimits.diagnostics[0], 'the first diagnostic').code,
    'K4-HISTORY-LIMIT-CONFIG-001',
  );
});

test('integrates chronological scene navigation, future truncation, and non-retroactive variables', async () => {
  const waits: ReturnType<typeof deferred<void>>[] = [];
  let presentationState = 'initial';
  const story = parseStory(`
kamishibai: '4.0'
${controls}
variables:
  score: 1
scenes:
  opening:
    - wait: 1
    - goto: middle
  middle:
    - wait: 1
    - goto: ending
  ending:
    - wait: 1
`);
  const created = createDsl4NavigationSession({
    storyDocument: story,
    controlProfile: 'development',
    historyNavigationAvailable: true,
    historyLimits: {maxActionEntries: 20, maxSceneVisits: 20},
    port: {
      wait: (
        _payload: unknown,
        context: {
          getVariable(name: string): unknown;
          setVariable(name: string, value: unknown): unknown;
        },
      ) => {
        const nextScore = Number(context.getVariable('score')) + 1;
        context.setVariable('score', nextScore);
        presentationState = `wait-${nextScore}`;
        const pending = deferred<void>();
        waits.push(pending);
        return pending.promise;
      },
    },
  });
  assert.equal(created.ok, true, JSON.stringify(created.diagnostics));
  const session = requireSession(created);
  session.start();
  await waitFor(() => waits.length === 1, 'opening wait did not start');

  for (const expectedWaitCount of [2, 3]) {
    assert.equal(session.handleKeyDown(keyEvent('Space')), true);
    await session.whenInputIdle();
    await waitFor(() => waits.length === expectedWaitCount, 'next scene wait did not start');
  }
  assert.deepEqual(
    historyOf(session.getState()).sceneVisits.map(({sceneId}) => sceneId),
    ['opening', 'middle', 'ending'],
  );
  assert.equal(runtimeStateOf(session.getState()).variables.score, 4);
  assert.equal(presentationState, 'wait-4');

  const historyKeys: [string, string][] = [
    ['ArrowUp', 'ending'],
    ['ArrowUp', 'middle'],
    ['ArrowUp', 'opening'],
    ['ArrowDown', 'middle'],
  ];
  for (const [code, expectedScene] of historyKeys) {
    session.handleKeyDown(keyEvent(code));
    await session.whenInputIdle();
    assert.equal(runtimeStateOf(session.getState()).status, 'paused');
    assert.equal(runtimeStateOf(session.getState()).sceneId, expectedScene);
    assert.equal(runtimeStateOf(session.getState()).variables.score, 4);
    assert.equal(presentationState, 'wait-4');
  }

  session.handleKeyDown(keyEvent('Space'));
  await session.whenInputIdle();
  await waitFor(() => waits.length === 4, 'history destination action did not resume');
  assert.equal(runtimeStateOf(session.getState()).sceneId, 'middle');
  assert.equal(runtimeStateOf(session.getState()).variables.score, 5);
  assert.deepEqual(
    historyOf(session.getState()).sceneVisits.map(({sceneId}) => sceneId),
    ['opening', 'middle'],
  );

  session.handleKeyDown(keyEvent('Space'));
  await session.whenInputIdle();
  await waitFor(() => waits.length === 5, 'new future scene did not execute');
  const current = session.getState();
  assert.equal(runtimeStateOf(current).sceneId, 'ending');
  assert.equal(runtimeStateOf(current).variables.score, 6);
  assert.deepEqual(
    historyOf(current).sceneVisits.map(({sceneId}) => sceneId),
    ['opening', 'middle', 'ending'],
  );
  assert.deepEqual(
    historyOf(current).sceneVisits.map(({visitId}) => visitId),
    [1, 2, 4],
  );

  session.stop('test-complete');
  const stopped = session.getState();
  assert.equal(historyOf(stopped).actionEntries.length, 0);
  assert.equal(historyOf(stopped).sceneVisits.length, 0);
  for (const wait of waits) wait.resolve();
});

test('can reposition from a finished runtime and releases input and history on dispose', async () => {
  const story = parseStory(`
kamishibai: '4.0'
${controls}
scenes:
  opening:
    - wait: 0
`);
  const created = createDsl4NavigationSession({
    storyDocument: story,
    controlProfile: 'development',
    historyNavigationAvailable: true,
    historyLimits: {maxActionEntries: 10, maxSceneVisits: 10},
    port: {wait: async () => {}},
  });
  const session = requireSession(created);
  await session.start();
  assert.equal(runtimeStateOf(session.getState()).status, 'finished');
  const moved = requireRecord(
    session.dispatchCommand('history.previousAction'),
    'the command result',
  );
  assert.equal(moved.ok, true);
  assert.equal(runtimeStateOf(session.getState()).status, 'paused');
  assert.equal(runtimeStateOf(session.getState()).actionPath, '/scenes/opening/actions/0');

  session.dispose();
  assert.equal(session.getState().disposed, true);
  assert.equal(historyOf(session.getState()).actionEntries.length, 0);
  assert.equal(session.handleKeyDown(keyEvent('ArrowLeft')), false);
});

test('history limit failure stops the runtime without partially recording the next visit', async () => {
  const pending = deferred<void>();
  const story = parseStory(`
kamishibai: '4.0'
${controls}
scenes:
  opening:
    - wait: 1
    - goto: ending
  ending: []
`);
  const created = createDsl4NavigationSession({
    storyDocument: story,
    controlProfile: 'development',
    historyNavigationAvailable: true,
    historyLimits: {maxActionEntries: 10, maxSceneVisits: 1},
    port: {wait: () => pending.promise},
  });
  const session = requireSession(created);
  const staleRun = session.start();
  session.handleKeyDown(keyEvent('Space'));
  await session.whenInputIdle();
  await waitFor(() => session.getState().diagnostic !== null, 'history limit did not fail closed');
  const failed = session.getState();
  assert.equal(runtimeStateOf(failed).status, 'stopped');
  assert.equal(
    requireRecord(failed.diagnostic, 'the session diagnostic').code,
    'K4-HISTORY-LIMIT-001',
  );
  assert.deepEqual(
    historyOf(failed).sceneVisits.map(({sceneId}) => sceneId),
    ['opening'],
  );
  pending.resolve();
  await staleRun;
});
