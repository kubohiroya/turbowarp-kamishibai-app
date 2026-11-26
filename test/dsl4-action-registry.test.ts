import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {
  createDsl4ActionRegistrySnapshot,
  createDsl4RuntimeController,
  createDsl4SourceFrontend,
  dsl4CoreActionNames,
  Dsl4ActionRegistryError,
  validateDsl4ActionRegistrySnapshot,
} from '../src/dsl4/index.js';
import {requireArray, requireDefined, requireRecord} from './helpers/require-value.ts';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const schema = JSON.parse(
  await readFile(path.join(projectRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
);

/** Read the first action of the first scene of one parsed story. */
function firstAction(parseResult: {storyDocument: unknown}) {
  const scenes = requireArray(
    requireRecord(parseResult.storyDocument, 'the story document').scenes,
    'its scenes',
  );
  const actions = requireArray(requireRecord(scenes[0], 'the first scene').actions, 'its actions');
  return requireRecord(actions[0], 'the first action');
}

/** One declared parameter of a custom action, including the shapes the invalid cases pass. */
interface RegistryParameter {
  name: string;
  type: string;
  required?: unknown;
}

function registryEntry(name: string, parameters: readonly RegistryParameter[] = []) {
  return {
    name,
    target: 'actor',
    parameters,
    source: {targetId: `target-${name}`, hatBlockId: `hat-${name}`},
  };
}

function assertDeepFrozen(value: unknown) {
  if (typeof value !== 'object' || value === null) return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

const registry = createDsl4ActionRegistrySnapshot([
  registryEntry('jumpTwice'),
  registryEntry('wave', [
    {name: 'speed', type: 'string'},
    {name: 'count', type: 'number', required: false},
  ]),
]);

test('creates a deterministic immutable Action Registry Snapshot', () => {
  assert.deepEqual(
    registry.actions.map(({name}) => name),
    ['jumpTwice', 'wave'],
  );
  assert.deepEqual(requireDefined(registry.actions[1], 'action 1').parameters, [
    {name: 'speed', type: 'string', required: true},
    {name: 'count', type: 'number', required: false},
  ]);
  assert.equal(registry.version, 2);
  assert.equal(requireDefined(registry.actions[0], 'action 0').quiesce, 'finish-only');
  assert.equal(requireDefined(registry.actions[1], 'action 1').quiesce, 'finish-only');
  assertDeepFrozen(registry);
  assert.deepEqual(validateDsl4ActionRegistrySnapshot(registry), registry);

  const legacy = requireRecord(JSON.parse(JSON.stringify(registry)), 'the serialized registry');
  legacy.version = 1;
  for (const action of requireArray(legacy.actions, 'the serialized actions')) {
    delete requireRecord(action, 'a serialized action').quiesce;
  }
  assert.deepEqual(validateDsl4ActionRegistrySnapshot(legacy), registry);

  const replaySafe = createDsl4ActionRegistrySnapshot([
    {...registryEntry('replaySafe'), quiesce: 'cancel-replay-safe'},
  ]);
  assert.equal(
    requireDefined(replaySafe.actions[0], 'the replay-safe action').quiesce,
    'cancel-replay-safe',
  );
});

test('rejects invalid, colliding, duplicate, and non-canonical registrations', () => {
  const invalidEntries = [
    [{...registryEntry('wave'), unexpected: true}],
    [{...registryEntry('wave'), source: {...registryEntry('wave').source, unexpected: true}}],
    [registryEntry('bad name')],
    [registryEntry('e\u0301')],
    [registryEntry('wave'), registryEntry('wave')],
    [
      registryEntry('wave', [
        {name: 'speed', type: 'string'},
        {name: 'speed', type: 'number'},
      ]),
    ],
    [registryEntry('wave', [{name: 'speed', type: 'object'}])],
    [registryEntry('wave', [{name: 'speed', type: 'string', required: 'yes'}])],
    [{...registryEntry('wave'), quiesce: 'pause-anywhere'}],
  ];
  for (const entries of invalidEntries) {
    assert.throws(
      () => createDsl4ActionRegistrySnapshot(entries),
      (error) => error instanceof Dsl4ActionRegistryError && error.code.startsWith('K4-REGISTRY-'),
    );
  }
  for (const name of dsl4CoreActionNames) {
    if (name === 'animate' || name === 'presentationEffect') continue;
    assert.throws(
      () => createDsl4ActionRegistrySnapshot([registryEntry(name)]),
      (error) =>
        error instanceof Dsl4ActionRegistryError && error.code === 'K4-REGISTRY-COLLISION-001',
    );
  }

  const nonCanonical = JSON.parse(JSON.stringify(registry));
  nonCanonical.actions.reverse();
  assert.throws(
    () => validateDsl4ActionRegistrySnapshot(nonCanonical),
    (error) =>
      error instanceof Dsl4ActionRegistryError && error.code === 'K4-REGISTRY-SNAPSHOT-001',
  );

  const nonCanonicalQuiesce = JSON.parse(JSON.stringify(registry));
  delete nonCanonicalQuiesce.actions[0].quiesce;
  assert.throws(
    () => validateDsl4ActionRegistrySnapshot(nonCanonicalQuiesce),
    (error) =>
      error instanceof Dsl4ActionRegistryError && error.code === 'K4-REGISTRY-SNAPSHOT-001',
  );
});

const customStory = `
kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
actors:
  Hero: HeroIdle
scenes:
  opening:
    - Hero.wave:
        stableId: firstWave
        arguments:
          speed: fast
          count: 3
`;

test('accepts registered custom actions and normalizes named arguments and Source Map', () => {
  const frontend = createDsl4SourceFrontend(schema, {actionRegistry: registry});
  const result = frontend.parse(customStory, {sourceId: 'custom.kamishibai.yaml'});
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const action = firstAction(result);
  assert.deepEqual(action, {
    kind: 'Action',
    id: '/scenes/opening/actions/0',
    target: 'Hero',
    command: 'wave',
    args: {speed: 'fast', count: 3},
    handler: 'custom',
    stableId: 'firstWave',
    sourceRange: action.sourceRange,
  });
  assert.ok(
    requireRecord(
      requireRecord(result.storyDocument, 'the story document').sourceMap,
      'its source map',
    )['/scenes/opening/actions/0/args/speed'],
  );
  assert.ok(
    requireRecord(
      requireRecord(result.storyDocument, 'the story document').sourceMap,
      'its source map',
    )['/scenes/opening/actions/0/args/count'],
  );
  assert.ok(
    requireRecord(
      requireRecord(result.storyDocument, 'the story document').sourceMap,
      'its source map',
    )['/scenes/opening/actions/0/stableId'],
  );

  const noArguments = frontend.parse(`
kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
actors:
  Hero: HeroIdle
scenes:
  opening:
    - Hero.jumpTwice: {}
`);
  assert.equal(noArguments.ok, true, JSON.stringify(noArguments.diagnostics));
  assert.deepEqual(firstAction(noArguments).args, {});
});

test('preserves a custom action parameter named transition', () => {
  const transitionRegistry = createDsl4ActionRegistrySnapshot([
    registryEntry('animate', [{name: 'transition', type: 'number'}]),
  ]);
  const frontend = createDsl4SourceFrontend(schema, {actionRegistry: transitionRegistry});
  const result = frontend.parse(`
kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
actors: {Hero: HeroIdle}
scenes:
  opening:
    - Hero.animate:
        arguments: {transition: 1}
`);

  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(firstAction(result).args, {transition: 1});
});

test('rejects unregistered commands, unknown parameters, missing parameters, and wrong types', async () => {
  const unregistered = createDsl4SourceFrontend(schema).parse(customStory);
  assert.equal(unregistered.ok, false);
  assert.ok(
    unregistered.diagnostics.some(
      ({code, storyPath}) =>
        code === 'K4-COMMAND-UNSUPPORTED' && storyPath === '/scenes/opening/actions/0',
    ),
  );

  const frontend = createDsl4SourceFrontend(schema, {actionRegistry: registry});
  const unknownSource = await readFile(
    path.join(
      projectRoot,
      'test',
      'fixtures',
      'dsl4',
      'invalid',
      'custom-action-unknown-key.kamishibai.yaml',
    ),
    'utf8',
  );
  const unknown = frontend.parse(unknownSource);
  assert.equal(unknown.ok, false);
  assert.ok(
    unknown.diagnostics.some(
      ({code, storyPath}) =>
        code === 'K4-SCHEMA-UNKNOWN-KEY' &&
        storyPath === '/scenes/opening/actions/0/args/repetitions',
    ),
  );

  const missing = frontend.parse(customStory.replace('          speed: fast\n', ''));
  assert.equal(missing.ok, false);
  assert.ok(missing.diagnostics.some(({message}) => message.includes('requires parameter speed')));

  const wrongType = frontend.parse(customStory.replace('speed: fast', 'speed: 1'));
  assert.equal(wrongType.ok, false);
  assert.ok(wrongType.diagnostics.some(({message}) => message.includes('speed must be string')));

  const unknownOuterKey = frontend.parse(
    customStory.replace('        stableId: firstWave\n', '        unexpected: true\n'),
  );
  assert.equal(unknownOuterKey.ok, false);
  assert.ok(unknownOuterKey.diagnostics.some(({code}) => code === 'K4-SCHEMA-UNKNOWN-KEY'));
});

test('dispatches custom actions through one fixed runtime port', async () => {
  const parsed = createDsl4SourceFrontend(schema, {actionRegistry: registry}).parse(customStory);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
  const calls: {payload: unknown; actionPath: unknown}[] = [];
  const controller = createDsl4RuntimeController({
    storyDocument: parsed.storyDocument,
    port: {
      async customAction(payload: unknown, context: {actionPath: unknown}) {
        calls.push({payload, actionPath: context.actionPath});
      },
    },
  });
  const state = await controller.start();
  assert.equal(state.status, 'finished');
  assert.deepEqual(calls, [
    {
      payload: {
        name: 'wave',
        target: 'Hero',
        arguments: {speed: 'fast', count: 3},
      },
      actionPath: '/scenes/opening/actions/0',
    },
  ]);
});

test('keeps old presentation names available to registered actor custom hats', () => {
  const actionRegistry = createDsl4ActionRegistrySnapshot([
    registryEntry('animate'),
    registryEntry('presentationEffect'),
  ]);
  const frontend = createDsl4SourceFrontend(schema, {actionRegistry});
  for (const [body, command, handler] of [
    ['Hero.animate: {}', 'animate', 'custom'],
    ['Hero.animate: {stableId: oldMotion}', 'animate', 'custom'],
    ['Hero.animate: {to: {x: 1}, seconds: 0}', 'animate', undefined],
    ['Hero.presentationEffect: {}', 'presentationEffect', 'custom'],
    [
      'presentationEffect: {scope: stage, effect: fade, seconds: 0, params: {}}',
      'presentationEffect',
      undefined,
    ],
  ] as const) {
    const result = frontend.parse(`kamishibai: '4.0'
assets: {Idle: costume:Hero}
actors: {Hero: Idle}
scenes:
  opening:
    - ${body}
`);
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.equal(firstAction(result).command, command);
    assert.equal(firstAction(result).handler, handler);
  }
});
