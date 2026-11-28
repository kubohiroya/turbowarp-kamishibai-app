import {canonicalDsl4AuthoringOpcode} from '../src/dsl4/block-source-shared.js';
import narrativeSchema from '../schema/dsl-4-narrative-control.schema.json' with {type: 'json'};
import assert from 'node:assert/strict';
import {test} from 'vitest';
import {parse, stringify} from 'yaml';
import {runInNewContext} from 'node:vm';
import contract from './fixtures/dsl4/narrative-control-contract.json' with {type: 'json'};
import {
  createDsl4StructuredBlockSourceDeclaration,
  createDsl4BlockAuthoringExtensionSource,
} from '../src/dsl4/structured-block-source.js';
import {
  extractDsl4BlockSourcesFromProject,
  Dsl4BlockSourceError,
} from '../src/dsl4/turbowarp-yaml-json-block-source.js';
import {createDsl4TestProductionSourceFrontend} from './helpers/dsl4-test-frontend.ts';
import {serializeDsl4CanonicalDocument} from '../src/builder/dsl4-validate.js';
import {createDsl4NarrativeEditorDefinitions} from '../src/dsl4/narrative-blocks.js';
import {parseCliArguments, runCli} from '../src/builder/cli.js';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import Ajv from 'ajv';

const frontend = createDsl4TestProductionSourceFrontend({narrativeControlEnabled: true});
const prefix = 'kubohiroyakamishibaiauthoring4_';
function authored(source: string) {
  return createDsl4StructuredBlockSourceDeclaration({
    source: parse(source),
    form: 'runtime',
    hatId: 'source',
  });
}
function read(blocks: ReturnType<typeof authored>) {
  const set = extractDsl4BlockSourcesFromProject({
    targets: [{name: 'Stage', isStage: true, blocks}],
    extensions: ['kubohiroyakamishibaiauthoring4', 'kubohiroyakamishibairuntime4'],
  });
  return set.sources[set.entryPath]!;
}

test('three visits use real nested substacks and typed reference reporters, not a cached YAML payload', () => {
  const blocks = authored(contract.threeVisits.source);
  assert(
    Object.values(blocks).some(
      (block) => canonicalDsl4AuthoringOpcode(String(block.opcode)) === prefix + 'narrativeForEach',
    ),
  );
  const condition = Object.values(blocks).find(
    (block) => canonicalDsl4AuthoringOpcode(String(block.opcode)) === prefix + 'narrativeIf',
  )!;
  assert(condition.inputs.SUBSTACK);
  assert(condition.inputs.SUBSTACK2);
  assert(
    Object.values(blocks).some(
      (block) =>
        canonicalDsl4AuthoringOpcode(String(block.opcode)) === prefix + 'narrativeReference',
    ),
  );
  const output = read(blocks);
  assert.equal(parse(output).kamishibai, '4.0');
  assert.equal(
    serializeDsl4CanonicalDocument(frontend.parse(output)),
    serializeDsl4CanonicalDocument(frontend.parse(contract.threeVisits.source)),
  );
  const list = Object.values(blocks).find(
    (block) => canonicalDsl4AuthoringOpcode(String(block.opcode)) === prefix + 'narrativeForEach',
  )!;
  list.inputs.ITEMS = [1, [10, '[{"name":"三人目だけ","kind":true}]']];
  assert(read(blocks).includes('三人目だけ'));
  assert(!read(blocks).includes('長兄'));
});

test('repeat values round-trip as references in numeric core inputs and condition trees', () => {
  const source = stringify({
    kamishibai: '4.0',
    variables: {score: 0},
    scenes: {
      opening: [
        {
          repeat: {
            times: 2,
            as: 'round',
            do: [
              {wait: {ref: 'round.number'}},
              {
                if: {
                  condition: {
                    compare: {
                      left: {variable: 'score'},
                      operator: '>=',
                      right: {ref: 'round.index'},
                    },
                  },
                  then: [{wait: 1}],
                  else: [],
                },
              },
            ],
          },
        },
      ],
    },
  });
  const blocks = authored(source);
  assert(
    Object.values(blocks).some(
      (block) =>
        canonicalDsl4AuthoringOpcode(String(block.opcode)) === prefix + 'narrativeVariable',
    ),
  );
  assert(
    Object.values(blocks).some(
      (block) => canonicalDsl4AuthoringOpcode(String(block.opcode)) === prefix + 'narrativeCompare',
    ),
  );
  const before = frontend.parse(source);
  const after = frontend.parse(read(blocks));
  assert(before.ok, JSON.stringify(before.diagnostics));
  assert(after.ok, JSON.stringify(after.diagnostics));
  assert.equal(serializeDsl4CanonicalDocument(after), serializeDsl4CanonicalDocument(before));
});

test('rejects a shared reporter, corrupted second arm, standard control and wrong version at their blocks', () => {
  for (const change of [
    (blocks: ReturnType<typeof authored>) => {
      const block = Object.values(blocks).find(
        (block) => canonicalDsl4AuthoringOpcode(String(block.opcode)) === prefix + 'narrativeIf',
      )!;
      block.inputs.SUBSTACK2 = [2, 'missing'];
    },
    (blocks: ReturnType<typeof authored>) => {
      const block = Object.values(blocks).find(
        (block) =>
          canonicalDsl4AuthoringOpcode(String(block.opcode)) === prefix + 'narrativeForEach',
      )!;
      block.opcode = 'control_repeat';
    },
    (blocks: ReturnType<typeof authored>) => {
      blocks.source!.inputs.VERSION = [1, [10, '4.1']];
    },
  ]) {
    const blocks = authored(contract.threeVisits.source);
    change(blocks);
    assert.throws(
      () => read(blocks),
      (error: unknown) =>
        error instanceof Dsl4BlockSourceError &&
        error.blockId !== null &&
        error.targetName === 'Stage',
    );
  }
});

test('narrative palette is startup-fixed and declarations remain inert', () => {
  for (const enabled of [false, true]) {
    let info: {blocks: {opcode: string; hideFromPalette?: boolean}[]} | undefined;
    const source = createDsl4BlockAuthoringExtensionSource([], {narrativeControlEnabled: enabled});
    runInNewContext(source, {
      Scratch: {
        extensions: {
          register(extension: {getInfo(): typeof info}) {
            info = extension.getInfo();
          },
        },
      },
      console,
    });
    assert.equal(
      info!.blocks.find((block) => block.opcode === 'narrativeForEach')!.hideFromPalette,
      !enabled,
    );
  }
});

test('condition and row forms use the shared schema in the existing draft-07 editor', () => {
  const AjvConstructor = Ajv as unknown as typeof import('ajv').default;
  const ajv = new AjvConstructor({strict: false, allErrors: true});
  const definitions = createDsl4NarrativeEditorDefinitions('authoring', narrativeSchema.$defs);
  const condition = ajv.compile(definitions[0]!.schema);
  assert(condition({compare: {left: {variable: 'score'}, operator: '>=', right: 1}}));
  assert(!condition({compare: {left: 1, operator: 'execute', right: 2}}));
  const rows = ajv.compile(definitions[1]!.schema);
  assert(
    rows([
      {名前: '長兄', 親切: false},
      {名前: '末弟', 親切: true},
    ]),
  );
  assert(!rows([{nested: {not: 'a scalar'}}]));
});

test('Standard CLI validates narrative 4.0 by default and supports explicit opt-out', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'narrative-cli-'));
  const input = path.join(directory, 'visits.k4.yml');
  await writeFile(input, contract.threeVisits.source);
  const io = {
    stdout: {
      write() {
        return true;
      },
    },
    stderr: {
      write() {
        return true;
      },
    },
  };
  try {
    const standard = await runCli(['validate-dsl4', '--input', input], io);
    assert(standard && 'ok' in standard && standard.ok === true);
    const disabled = await runCli(
      ['validate-dsl4', '--input', input, '--no-narrative-control'],
      io,
    );
    assert(disabled && 'ok' in disabled && disabled.ok === false);
    const enabled = await runCli(['validate-dsl4', '--input', input, '--narrative-control'], io);
    assert(enabled && 'ok' in enabled && enabled.ok === true);
    assert.equal(
      parseCliArguments(['validate-dsl4', '--input', input, '--narrative-control'])
        .narrativeControlEnabled,
      true,
    );
    assert.throws(
      () =>
        parseCliArguments([
          'validate-dsl4',
          '--input',
          input,
          '--narrative-control',
          '--narrative-control',
        ]),
      /Duplicate/,
    );
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('ordered condition lists round-trip without introducing deep synthetic nesting', () => {
  const source = stringify({
    kamishibai: '4.0',
    variables: {score: 0},
    scenes: {
      opening: [
        {
          if: {
            condition: {all: ['score > 0', {not: false}, ...Array.from({length: 30}, () => true)]},
            then: [{wait: 1}],
            else: [{wait: 2}],
          },
        },
      ],
    },
  });
  const blocks = authored(source);
  assert(
    Object.values(blocks).some(
      (block) =>
        canonicalDsl4AuthoringOpcode(String(block.opcode)) === prefix + 'narrativeLogicList',
    ),
  );
  assert.equal(
    serializeDsl4CanonicalDocument(frontend.parse(read(blocks))),
    serializeDsl4CanonicalDocument(frontend.parse(source)),
  );
});

test('shared value reporters and blank repeat counts are diagnosed at the actual block', () => {
  const blocks = authored(contract.threeVisits.source);
  const condition = Object.values(blocks).find(
    (block) => canonicalDsl4AuthoringOpcode(String(block.opcode)) === prefix + 'narrativeIf',
  )!;
  const loop = Object.values(blocks).find(
    (block) => canonicalDsl4AuthoringOpcode(String(block.opcode)) === prefix + 'narrativeForEach',
  )!;
  loop.inputs.AS = condition.inputs.CONDITION;
  assert.throws(() => read(blocks), /cycle or shared/);
  const repeat = authored(
    stringify({kamishibai: '4.0', scenes: {opening: [{repeat: {times: 1, do: []}}]}}),
  );
  Object.values(repeat).find(
    (block) => canonicalDsl4AuthoringOpcode(String(block.opcode)) === prefix + 'narrativeRepeat',
  )!.inputs.TIMES = [1, [4, '']];
  assert.throws(() => read(repeat), /fixed integer/);
});
