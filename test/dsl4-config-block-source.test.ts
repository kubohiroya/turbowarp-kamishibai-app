import {dsl4AuthoringBlockName} from '../src/dsl4/block-source-shared.js';
import {canonicalDsl4AuthoringOpcode} from '../src/dsl4/block-source-shared.js';
import assert from 'node:assert/strict';
import {test} from 'vitest';
import {parse} from 'yaml';
import {
  createDsl4StructuredBlockSourceDeclaration,
  dsl4ConfigBlockSourceHatOpcode,
} from '../src/dsl4/structured-block-source.js';
import {extractDsl4BlockSourcesFromProject} from '../src/dsl4/turbowarp-yaml-json-block-source.js';

const prefix = 'kubohiroyakamishibaiauthoring4_';
const source = {
  kamishibai: '4.0',
  controls: {keymaps: {production: {Space: 'navigation.nextAction'}}},
  assets: {Backdrop: 'backdrop', HeroIdle: 'costume:Hero'},
  cover: {backdrop: 'Backdrop'},
  textStyles: {title: {size: 24}},
  variables: {score: 0},
  loading: {backdrop: 'Backdrop', costumes: ['Loading']},
  recognition: {},
  actors: {Hero: 'HeroIdle'},
  scenes: {opening: [{wait: 1}]},
};
const fixture = () =>
  createDsl4StructuredBlockSourceDeclaration({source, form: 'bundle', hatId: 'root'});
type Blocks = ReturnType<typeof fixture>;
const project = (blocks: Blocks) => ({targets: [{isStage: true, name: 'Stage', blocks}]});
const read = (blocks: Blocks) =>
  parse(extractDsl4BlockSourcesFromProject(project(blocks)).sources['Stage.k4.yml']!);
function find(blocks: Blocks, opcode: string) {
  const pair = Object.entries(blocks).find(
    ([, block]) => canonicalDsl4AuthoringOpcode(String(block.opcode)) === prefix + opcode,
  );
  assert(pair);
  return pair;
}
function chain(blocks: Blocks, hat: string) {
  const opcodes: string[] = [];
  let parent = hat;
  let id = blocks[hat]!.next;
  while (id) {
    const block = blocks[id]!;
    assert.equal(block.parent, parent);
    opcodes.push(dsl4AuthoringBlockName(block.opcode) ?? block.opcode);
    parent = id;
    id = block.next;
  }
  return opcodes;
}

test('splits all seven configuration definitions from actors and scenes and reads them implicitly', () => {
  const blocks = fixture();
  const [configId, config] = find(blocks, 'kamishibaiConfig');
  assert.equal(config.topLevel, true);
  assert.equal(config.parent, null);
  assert.deepEqual(config.inputs, {LABEL: [1, [10, '']]});
  assert.deepEqual(chain(blocks, configId), [
    'control',
    'asset',
    'asset',
    'cover',
    'textStyle',
    'variable',
    'loading',
    'recognition',
  ]);
  assert.deepEqual(chain(blocks, 'root'), ['actor', 'scene']);
  assert(
    !Object.values(blocks).some(
      (block) => canonicalDsl4AuthoringOpcode(String(block.opcode)) === prefix + 'includeBlocks',
    ),
  );
  assert.deepEqual(read(blocks), source);
  const [, variable] = find(blocks, 'variable');
  variable.inputs.VALUE = [1, [10, '42']];
  assert.equal(read(blocks).variables.score, 42);
});

test('retains the legacy inline definition chain without a configuration hat', () => {
  const blocks = fixture();
  const [configId, config] = find(blocks, 'kamishibaiConfig');
  const tail = Object.keys(blocks).find(
    (id) =>
      id !== 'root' &&
      id !== configId &&
      blocks[id]!.next === null &&
      canonicalDsl4AuthoringOpcode(String(blocks[id]!.opcode)) === prefix + 'recognition',
  )!;
  blocks[tail]!.next = blocks.root!.next;
  blocks[blocks.root!.next!]!.parent = tail;
  blocks.root!.next = config.next;
  blocks[config.next!]!.parent = 'root';
  delete blocks[configId];
  assert.deepEqual(read(blocks), source);
});

test('diagnoses overlaps between implicit configuration and root declarations', () => {
  const blocks = fixture();
  const [variableId, variable] = find(blocks, 'variable');
  blocks.duplicate = {...structuredClone(variable), parent: 'root', next: blocks.root!.next};
  blocks[blocks.root!.next!]!.parent = 'duplicate';
  blocks.root!.next = 'duplicate';
  assert.throws(
    () => read(blocks),
    (error: unknown) => {
      assert(error instanceof Error && /Duplicate or overlapping/.test(error.message));
      assert.equal((error as Error & {blockId: string}).blockId, 'duplicate');
      return true;
    },
  );
  assert(blocks[variableId]);
});

test('rejects actors, scenes and explicit includes attached to a configuration hat', () => {
  for (const opcode of ['actor', 'scene', 'includeBlocks']) {
    const blocks = fixture();
    const [configId, config] = find(blocks, 'kamishibaiConfig');
    blocks.bad = {
      opcode: prefix + opcode,
      parent: configId,
      next: config.next,
      inputs: {},
      fields: {},
      shadow: false,
      topLevel: false,
    };
    blocks[config.next!]!.parent = 'bad';
    config.next = 'bad';
    assert.throws(() => read(blocks), /configuration definitions only/);
  }
});

test('rejects malformed, orphaned and excessive configuration declarations', () => {
  const malformed = fixture();
  find(malformed, 'kamishibaiConfig')[1].inputs.EXTRA = [1, [10, 'unexpected']];
  assert.throws(() => read(malformed), /Configuration hat has invalid/);
  const orphaned = fixture();
  orphaned.root!.inputs.LABEL = [1, [10, 'named']];
  assert.throws(() => read(orphaned), /Stage must contain/);
  assert.throws(
    () => extractDsl4BlockSourcesFromProject(project(fixture()), {limits: {maxDeclarations: 1}}),
    /declaration limit/,
  );
});

test('omits empty configuration hats and gives module configuration its source label', () => {
  for (const [value, label] of [
    [{scenes: source.scenes}, ''],
    [source, 'module'],
  ] as const) {
    const blocks = createDsl4StructuredBlockSourceDeclaration({
      source: value,
      label,
      form: 'runtime',
      hatId: 'root',
    });
    const config = Object.values(blocks).find(
      (block) =>
        canonicalDsl4AuthoringOpcode(String(block.opcode)) === dsl4ConfigBlockSourceHatOpcode,
    );
    if (label) assert.deepEqual(config?.inputs.LABEL, [1, [10, label]]);
    else assert.equal(config, undefined);
  }
});

function configOnly(label: string, name: string) {
  const blocks = createDsl4StructuredBlockSourceDeclaration({
    source: {variables: {[name]: 1}},
    label,
    form: 'runtime',
    hatId: 'module',
  });
  delete blocks.module;
  return blocks;
}

test('reads the empty label first and then names in order across Stage and Sprite targets', () => {
  const root = createDsl4StructuredBlockSourceDeclaration({
    source: {scenes: source.scenes},
    form: 'runtime',
    hatId: 'root',
  });
  const input = {
    targets: [
      {isStage: true, name: 'Stage', blocks: root},
      {isStage: false, name: 'Z', blocks: configOnly('z', 'last')},
      {isStage: false, name: 'A', blocks: configOnly('a', 'alpha')},
      {isStage: false, name: 'Empty', blocks: configOnly('', 'first')},
    ],
  };
  const before = structuredClone(input);
  const extracted = extractDsl4BlockSourcesFromProject(input);
  assert.deepEqual(Object.keys(parse(extracted.sources['Stage.k4.yml']!).variables), [
    'first',
    'alpha',
    'last',
  ]);
  assert.deepEqual(input, before);
  input.targets.reverse();
  assert.deepEqual(extractDsl4BlockSourcesFromProject(input), extracted);
});

test('rejects duplicate configuration names, including two empty names across targets', () => {
  for (const label of ['', 'same']) {
    const root = createDsl4StructuredBlockSourceDeclaration({
      source: {scenes: source.scenes},
      form: 'runtime',
      hatId: 'root',
    });
    assert.throws(
      () =>
        extractDsl4BlockSourcesFromProject({
          targets: [
            {isStage: true, name: 'Stage', blocks: root},
            {isStage: false, name: 'First', blocks: configOnly(label, 'one')},
            {isStage: false, name: 'Second', blocks: configOnly(label, 'two')},
          ],
        }),
      (error: unknown) => {
        assert(error instanceof Error && /Configuration label is duplicated/.test(error.message));
        assert.equal((error as Error & {code: string}).code, 'K4-BLOCK-SOURCE-DUPLICATE-001');
        assert.equal((error as Error & {targetName: string}).targetName, 'Second');
        return true;
      },
    );
  }
});

test('retains the original target and block diagnostic for a remote configuration', () => {
  const root = createDsl4StructuredBlockSourceDeclaration({
    source: {scenes: source.scenes},
    form: 'runtime',
    hatId: 'root',
  });
  const config = configOnly('shared', 'score');
  const [id, variable] = find(config, 'variable');
  variable.inputs.VALUE = [1, [10, '{}']];
  assert.throws(
    () =>
      extractDsl4BlockSourcesFromProject({
        targets: [
          {isStage: true, name: 'Stage', blocks: root},
          {isStage: false, name: 'Settings', blocks: config},
        ],
      }),
    (error: unknown) => {
      assert(error instanceof Error);
      assert.equal((error as Error & {targetName: string}).targetName, 'Settings');
      assert.equal((error as Error & {blockId: string}).blockId, id);
      return true;
    },
  );
});
