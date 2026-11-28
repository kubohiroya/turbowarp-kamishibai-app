import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {
  createDsl4HistoryReducer,
  createDsl4RuntimeController,
  createDsl4SourceFrontend,
} from '../src/dsl4/index.js';
import {requireDefined, requireRecord} from './helpers/require-value.ts';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const schema = JSON.parse(
  await readFile(path.join(projectRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
);
const frontend = createDsl4SourceFrontend(schema);

function scene(sceneId: string, sequence: number) {
  return {type: 'scene.enter', sceneId, storyPath: `/scenes/${sceneId}`, sequence};
}

function action(sceneId: string, actionIndex: number, sequence: number) {
  return {
    type: 'action.commit',
    sceneId,
    actionPath: `/scenes/${sceneId}/actions/${actionIndex}`,
    sequence,
  };
}

type HistoryReducer = ReturnType<typeof createDsl4HistoryReducer>;
type HistoryState = ReturnType<HistoryReducer['initialState']>;
type HistoryEvent = Readonly<Record<string, unknown>>;

/** Reduce one event the case expects to be accepted, reporting the diagnostic when it is not. */
function apply(reducer: HistoryReducer, state: HistoryState, event: HistoryEvent) {
  const result = reducer.reduce(state, event);
  assert.equal(
    result.ok,
    true,
    JSON.stringify(requireRecord(result, 'the reduce result').diagnostic),
  );
  return result;
}

test('requires finite positive limits', () => {
  assert.throws(
    () => createDsl4HistoryReducer({maxActionEntries: Infinity, maxSceneVisits: 1}),
    /maxActionEntries/,
  );
  assert.throws(
    () => createDsl4HistoryReducer({maxActionEntries: 1, maxSceneVisits: 0}),
    /maxSceneVisits/,
  );
});

test('records immutable chronological visits and commits without changing input state', () => {
  const reducer = createDsl4HistoryReducer({maxActionEntries: 10, maxSceneVisits: 10});
  const initial = reducer.initialState();
  const entered = apply(reducer, initial, scene('opening', 1));
  const committed = apply(reducer, entered.state, action('opening', 0, 2));

  assert.equal(Object.isFrozen(initial), true);
  assert.equal(Object.isFrozen(committed.state), true);
  assert.equal(Object.isFrozen(committed.state.sceneVisits), true);
  assert.equal(Object.isFrozen(committed.state.actionEntries), true);
  assert.equal(initial.sceneVisits.length, 0);
  assert.deepEqual(committed.state.sceneVisits, [
    {
      visitId: 1,
      sceneId: 'opening',
      storyPath: '/scenes/opening',
      firstActionHistoryIndex: 0,
      enteredSequence: 1,
    },
  ]);
  assert.equal(committed.state.actionCursor, 1);
  assert.equal(committed.state.lastSequence, 2);
});

test('keeps branch, goto, loop, and repeated scene visits in actual execution order', () => {
  const reducer = createDsl4HistoryReducer({maxActionEntries: 10, maxSceneVisits: 10});
  let state = reducer.initialState();
  for (const event of [
    scene('opening', 1),
    action('opening', 0, 2),
    scene('ending', 3),
    action('ending', 0, 4),
    scene('opening', 5),
    action('opening', 0, 6),
  ]) {
    state = apply(reducer, state, event).state;
  }

  assert.deepEqual(
    state.sceneVisits.map(({sceneId}) => sceneId),
    ['opening', 'ending', 'opening'],
  );
  assert.deepEqual(
    state.sceneVisits.map(({visitId}) => visitId),
    [1, 2, 3],
  );
  assert.deepEqual(
    state.actionEntries.map(({visitId}) => visitId),
    [1, 2, 3],
  );
});

test('consumes runtime controller scene and action events without translation', async () => {
  const parsed = frontend.parse(`
kamishibai: '4.0'
scenes:
  opening:
    - wait: 0
  ending: []
`);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
  const reducer = createDsl4HistoryReducer({maxActionEntries: 10, maxSceneVisits: 10});
  let historyState = reducer.initialState();
  const controller = createDsl4RuntimeController({
    storyDocument: parsed.storyDocument,
    port: {wait: async () => {}},
    onEvent(event) {
      if (event.type !== 'scene.enter' && event.type !== 'action.commit') return;
      const result = reducer.reduce(historyState, requireRecord(event, 'the runtime event'));
      assert.equal(
        result.ok,
        true,
        JSON.stringify(requireRecord(result, 'the reduce result').diagnostic),
      );
      historyState = result.state;
    },
  });

  await controller.start();
  assert.deepEqual(
    historyState.sceneVisits.map(({sceneId}) => sceneId),
    ['opening', 'ending'],
  );
  assert.deepEqual(
    historyState.actionEntries.map(({actionPath}) => actionPath),
    ['/scenes/opening/actions/0'],
  );
});

test('moves to previous committed actions without changing history entries', () => {
  const reducer = createDsl4HistoryReducer({maxActionEntries: 10, maxSceneVisits: 10});
  let state = reducer.initialState();
  for (const event of [scene('opening', 1), action('opening', 0, 2), action('opening', 1, 3)]) {
    state = apply(reducer, state, event).state;
  }
  const originalEntries = state.actionEntries;

  const previous = apply(reducer, state, {type: 'history.previousAction'});
  assert.equal(requireDefined(previous.destination, 'the reduce destination').actionIndex, 1);
  assert.equal(previous.state.actionCursor, 1);
  assert.strictEqual(previous.state.actionEntries, originalEntries);

  const first = apply(reducer, previous.state, {type: 'history.previousAction'});
  assert.equal(requireDefined(first.destination, 'the reduce destination').actionIndex, 0);
  assert.equal(first.state.actionCursor, 0);

  const boundary = apply(reducer, first.state, {type: 'history.previousAction'});
  assert.equal(boundary.changed, false);
  assert.strictEqual(boundary.state, first.state);
});

test('moves between scene visits chronologically, including repeated scene IDs', () => {
  const reducer = createDsl4HistoryReducer({maxActionEntries: 10, maxSceneVisits: 10});
  let state = reducer.initialState();
  for (const event of [scene('zeta', 1), scene('alpha', 2), scene('zeta', 3)]) {
    state = apply(reducer, state, event).state;
  }

  const restarted = apply(reducer, state, {type: 'history.previousScene'});
  assert.deepEqual(
    [
      requireDefined(restarted.destination, 'the reduce destination').sceneId,
      requireDefined(restarted.destination, 'the reduce destination').visitId,
    ],
    ['zeta', 3],
  );
  const previous = apply(reducer, restarted.state, {type: 'history.previousScene'});
  assert.deepEqual(
    [
      requireDefined(previous.destination, 'the reduce destination').sceneId,
      requireDefined(previous.destination, 'the reduce destination').visitId,
    ],
    ['alpha', 2],
  );
  const first = apply(reducer, previous.state, {type: 'history.previousScene'});
  assert.deepEqual(
    [
      requireDefined(first.destination, 'the reduce destination').sceneId,
      requireDefined(first.destination, 'the reduce destination').visitId,
    ],
    ['zeta', 1],
  );
  const beforeFirst = apply(reducer, first.state, {type: 'history.previousScene'});
  assert.equal(beforeFirst.changed, false);
  const next = apply(reducer, beforeFirst.state, {type: 'history.nextScene'});
  assert.deepEqual(
    [
      requireDefined(next.destination, 'the reduce destination').sceneId,
      requireDefined(next.destination, 'the reduce destination').visitId,
    ],
    ['alpha', 2],
  );
});

test('resume truncates the selected destination and future before appending a new timeline', () => {
  const reducer = createDsl4HistoryReducer({maxActionEntries: 10, maxSceneVisits: 10});
  let state = reducer.initialState();
  for (const event of [
    scene('opening', 1),
    action('opening', 0, 2),
    scene('middle', 3),
    action('middle', 0, 4),
    scene('oldEnding', 5),
    action('oldEnding', 0, 6),
  ]) {
    state = apply(reducer, state, event).state;
  }

  const sceneStart = apply(reducer, state, {type: 'history.previousScene'});
  assert.equal(
    requireDefined(sceneStart.destination, 'the reduce destination').sceneId,
    'oldEnding',
  );
  const moved = apply(reducer, sceneStart.state, {type: 'history.previousScene'});
  assert.equal(requireDefined(moved.destination, 'the reduce destination').sceneId, 'middle');
  assert.equal(moved.state.sceneVisits.length, 3);
  assert.equal(moved.state.actionEntries.length, 3);

  const resumed = apply(reducer, moved.state, {type: 'resume'});
  assert.equal(resumed.state.mode, 'live');
  assert.deepEqual(
    resumed.state.sceneVisits.map(({sceneId}) => sceneId),
    ['opening', 'middle'],
  );
  assert.deepEqual(
    resumed.state.actionEntries.map(({sceneId}) => sceneId),
    ['opening'],
  );

  state = apply(reducer, resumed.state, action('middle', 0, 7)).state;
  state = apply(reducer, state, scene('newEnding', 8)).state;
  assert.deepEqual(
    state.sceneVisits.map(({sceneId}) => sceneId),
    ['opening', 'middle', 'newEnding'],
  );
  assert.deepEqual(
    state.actionEntries.map(({sceneId}) => sceneId),
    ['opening', 'middle'],
  );
});

test('handles empty and single-action scene boundaries as deterministic no-ops', () => {
  const reducer = createDsl4HistoryReducer({maxActionEntries: 10, maxSceneVisits: 10});
  let state = reducer.initialState();
  for (const event of [scene('empty', 1), scene('single', 2), action('single', 0, 3)]) {
    state = apply(reducer, state, event).state;
  }

  const singleStart = apply(reducer, state, {type: 'history.previousScene'});
  assert.equal(requireDefined(singleStart.destination, 'the reduce destination').sceneId, 'single');
  const empty = apply(reducer, singleStart.state, {type: 'history.previousScene'});
  assert.equal(requireDefined(empty.destination, 'the reduce destination').sceneId, 'empty');
  assert.equal(requireDefined(empty.destination, 'the reduce destination').actionPath, null);
  assert.equal(requireDefined(empty.destination, 'the reduce destination').actionIndex, 0);
  const noPreviousAction = apply(reducer, empty.state, {type: 'history.previousAction'});
  assert.equal(noPreviousAction.changed, false);

  const single = apply(reducer, empty.state, {type: 'history.nextScene'});
  assert.equal(requireDefined(single.destination, 'the reduce destination').sceneId, 'single');
  const noNextScene = apply(reducer, single.state, {type: 'history.nextScene'});
  assert.equal(noNextScene.changed, false);
});

test('rejects capacity and sequence violations without partially changing state', () => {
  const reducer = createDsl4HistoryReducer({maxActionEntries: 1, maxSceneVisits: 1});
  let state = apply(reducer, reducer.initialState(), scene('opening', 1)).state;
  state = apply(reducer, state, action('opening', 0, 2)).state;

  const refusals: readonly [HistoryEvent, string, string | undefined][] = [
    [action('opening', 1, 3), 'K4-HISTORY-LIMIT-001', 'actionEntries'],
    [scene('ending', 3), 'K4-HISTORY-LIMIT-001', 'sceneVisits'],
    [action('opening', 1, 2), 'K4-HISTORY-SEQUENCE-001', undefined],
  ];
  for (const [event, code, kind] of refusals) {
    const result = reducer.reduce(state, event);
    assert.equal(result.ok, false);
    const diagnostic = requireRecord(
      requireRecord(result, 'the reduce result').diagnostic,
      'its diagnostic',
    );
    assert.equal(diagnostic.code, code);
    assert.equal(requireRecord(diagnostic.details, 'the diagnostic details').kind, kind);
    assert.strictEqual(result.state, state);
  }
});

test('reset releases all history without carrying runtime or presentation state', () => {
  const reducer = createDsl4HistoryReducer({maxActionEntries: 10, maxSceneVisits: 10});
  let state = apply(reducer, reducer.initialState(), scene('opening', 1)).state;
  state = apply(reducer, state, action('opening', 0, 2)).state;
  assert.deepEqual(Object.keys(state).sort(), [
    'actionCursor',
    'actionEntries',
    'currentVisitId',
    'lastSequence',
    'mode',
    'nextVisitId',
    'sceneVisitCursor',
    'sceneVisits',
  ]);

  const reset = apply(reducer, state, {type: 'reset'});
  assert.deepEqual(reset.state, reducer.initialState());
});

test('rejects inconsistent restored history and accepts reordered JSON keys', () => {
  const reducer = createDsl4HistoryReducer({maxActionEntries: 10, maxSceneVisits: 10});
  let state = reducer.initialState();
  for (const event of [
    {type: 'scene.enter', sequence: 2, sceneId: 'opening', storyPath: '/scenes/opening'},
    {
      type: 'action.commit',
      sequence: 3,
      sceneId: 'opening',
      actionPath: '/scenes/opening/actions/0',
    },
  ]) {
    const result = reducer.reduce(state, event);
    assert(result.ok);
    state = result.state;
  }
  const reordered = JSON.parse(JSON.stringify(state), (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).reverse())
      : value,
  );
  assert.deepEqual(reducer.restore(reordered), state);
  for (const bad of [
    {...state, actionCursor: 9},
    {...state, actionEntries: state.actionEntries.map((entry) => ({...entry, visitId: 4}))},
    {
      ...state,
      sceneVisits: state.sceneVisits.map((visit) => ({...visit, firstActionHistoryIndex: 2})),
    },
    {...state, nextVisitId: 1},
    {...state, lastSequence: 1},
  ])
    assert.throws(() => reducer.restore(bad));
});

test('previousAction restarts the in-progress live action before stepping to committed actions', () => {
  const reducer = createDsl4HistoryReducer({maxActionEntries: 10, maxSceneVisits: 10});
  let state = reducer.initialState();
  for (const event of [scene('opening', 1), action('opening', 0, 2), action('opening', 1, 3)]) {
    state = apply(reducer, state, event).state;
  }
  const current = {
    sceneId: 'opening',
    actionIndex: 2,
    actionPath: '/scenes/opening/actions/2',
    inProgress: true,
  };

  const restarted = apply(reducer, state, {type: 'history.previousAction', current});
  const restartedDestination = requireDefined(restarted.destination, 'the reduce destination');
  assert.equal(restartedDestination.actionIndex, 2);
  assert.equal(restartedDestination.actionPath, '/scenes/opening/actions/2');
  assert.equal(restarted.state.mode, 'history');
  assert.equal(restarted.state.actionCursor, 2);
  assert.strictEqual(restarted.state.actionEntries, state.actionEntries);

  const previous = apply(reducer, restarted.state, {
    type: 'history.previousAction',
    current: {...current, inProgress: false},
  });
  assert.equal(requireDefined(previous.destination, 'the reduce destination').actionIndex, 1);

  // Resuming from the restarted action keeps every committed action before it.
  const resumed = apply(reducer, restarted.state, {type: 'resume'});
  assert.equal(resumed.state.actionEntries.length, 2);
  assert.equal(resumed.state.sceneVisits.length, 1);
});

test('previousAction without an in-progress action steps to the last committed action', () => {
  const reducer = createDsl4HistoryReducer({maxActionEntries: 10, maxSceneVisits: 10});
  let state = reducer.initialState();
  for (const event of [scene('opening', 1), action('opening', 0, 2)]) {
    state = apply(reducer, state, event).state;
  }
  const moved = apply(reducer, state, {
    type: 'history.previousAction',
    current: {
      sceneId: 'opening',
      actionIndex: 0,
      actionPath: '/scenes/opening/actions/0',
      inProgress: false,
    },
  });
  assert.equal(requireDefined(moved.destination, 'the reduce destination').actionIndex, 0);
  assert.equal(moved.state.actionCursor, 0);
});

test('previousScene returns to the current scene start before the previous scene', () => {
  const reducer = createDsl4HistoryReducer({maxActionEntries: 10, maxSceneVisits: 10});
  let state = reducer.initialState();
  for (const event of [
    scene('opening', 1),
    action('opening', 0, 2),
    scene('middle', 3),
    action('middle', 0, 4),
    action('middle', 1, 5),
  ]) {
    state = apply(reducer, state, event).state;
  }

  const sceneStart = apply(reducer, state, {
    type: 'history.previousScene',
    current: {sceneId: 'middle', actionIndex: 2, actionPath: null, inProgress: true},
  });
  const sceneStartDestination = requireDefined(sceneStart.destination, 'the reduce destination');
  assert.deepEqual(
    [sceneStartDestination.sceneId, sceneStartDestination.actionIndex],
    ['middle', 0],
  );
  assert.equal(sceneStart.state.actionCursor, 1);

  // A history position partway into a scene also returns to that scene start first.
  const midScene = apply(reducer, state, {type: 'history.previousAction'});
  const midSceneStart = apply(reducer, midScene.state, {
    type: 'history.previousScene',
    current: {
      sceneId: 'middle',
      actionIndex: 1,
      actionPath: '/scenes/middle/actions/1',
      inProgress: false,
    },
  });
  assert.equal(
    requireDefined(midSceneStart.destination, 'the reduce destination').sceneId,
    'middle',
  );

  const previous = apply(reducer, sceneStart.state, {
    type: 'history.previousScene',
    current: {
      sceneId: 'middle',
      actionIndex: 0,
      actionPath: '/scenes/middle/actions/0',
      inProgress: false,
    },
  });
  assert.equal(requireDefined(previous.destination, 'the reduce destination').sceneId, 'opening');

  const boundary = apply(reducer, previous.state, {
    type: 'history.previousScene',
    current: {
      sceneId: 'opening',
      actionIndex: 0,
      actionPath: '/scenes/opening/actions/0',
      inProgress: false,
    },
  });
  assert.equal(boundary.changed, false);
});
