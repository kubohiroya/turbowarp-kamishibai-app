import {canonicalDsl4AuthoringOpcode} from '../src/dsl4/block-source-shared.js';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate';
import {parse} from 'yaml';
import {test} from 'vitest';
import {authorDsl4BlockSourceSb3} from '../src/builder/dsl4-block-source-author.js';
import {
  createDsl4BlockAuthoringExtensionSource,
  createDsl4StructuredBlockSourceDeclaration,
  readDsl4StructuredBlockSource,
} from '../src/dsl4/structured-block-source.js';
import {readDsl4SectionAuthoringState} from '../src/dsl4/block-source-section-state.js';
import {extractDsl4BlockSourcesFromProject} from '../src/dsl4/turbowarp-yaml-json-block-source.js';
import {dsl4TestProductionSourceFrontend as frontend} from './helpers/dsl4-test-frontend.ts';

const prefix = 'kubohiroyakamishibaiauthoring4_';
type Blocks = ReturnType<typeof createDsl4StructuredBlockSourceDeclaration>;
const source = {
  kamishibai: '4.0',
  variables: {score: 1},
  scenes: {opening: [{wait: 1}, {wait: 2}, {wait: 3}]},
};
const fixture = () =>
  createDsl4StructuredBlockSourceDeclaration({source, form: 'runtime', hatId: 'hat'});
function read(blocks: Blocks) {
  return readDsl4StructuredBlockSource(blocks, 'hat', (input) => {
    assert(Array.isArray(input) && Array.isArray(input[1]));
    return input[1][1];
  });
}
function wrap(blocks: Blocks, first: string, last = first, mode = 'off') {
  const id = 'section' + Object.keys(blocks).length;
  const parent = blocks[first]!.parent!;
  const after = blocks[last]!.next;
  const enclosing = blocks[parent]!;
  if (enclosing.next === first) enclosing.next = id;
  else {
    assert.deepEqual(enclosing.inputs.SUBSTACK, [2, first]);
    enclosing.inputs.SUBSTACK = [2, id];
  }
  blocks[id] = {
    opcode: prefix + 'useSection',
    next: after,
    parent,
    inputs: {SUBSTACK: [2, first]},
    fields: {ENABLED: [mode, null]},
    shadow: false,
    topLevel: false,
  };
  blocks[first]!.parent = id;
  blocks[last]!.next = null;
  if (after) blocks[after]!.parent = id;
  return id;
}
const actionIds = (blocks: Blocks) =>
  Object.keys(blocks).filter((id) => blocks[id]!.opcode.endsWith('_wait'));
const mode = (blocks: Blocks, id: string, value: string) => {
  blocks[id]!.fields.ENABLED = [value, null];
};
function extensionInfo(sourceSections?: boolean) {
  let info:
    | {
        blocks: {
          opcode: string;
          hideFromPalette?: boolean;
          branchCount?: number;
          color1?: string;
        }[];
        menus: {sectionEnabled: {items: {text: string; value: string}[]}};
      }
    | undefined;
  runInNewContext(
    createDsl4BlockAuthoringExtensionSource(
      [],
      sourceSections === undefined ? {} : {sourceSections},
    ),
    {
      Scratch: {
        extensions: {
          register(extension: {getInfo(): typeof info}) {
            info = extension.getInfo();
          },
        },
      },
    },
  );
  return info!;
}

test('keeps the on/off section palette opt-in and exposes one C-shaped branch', () => {
  assert.equal(
    extensionInfo().blocks.find((b) => b.opcode === 'useSection')!.hideFromPalette,
    true,
  );
  const block = extensionInfo(true).blocks.find((b) => b.opcode === 'useSection')!;
  assert.equal(block.hideFromPalette, false);
  assert.equal(block.branchCount, 1);
  assert.equal(block.color1, '#6b7280');
  assert.deepEqual(
    Array.from(extensionInfo(true).menus.sectionEnabled.items, ({text, value}) => [text, value]),
    [
      ['✅ on', 'on'],
      ['🚫 off', 'off'],
    ],
  );
});
test('omits an off action group and restores its original order when enabled', () => {
  const blocks = fixture();
  const ids = actionIds(blocks);
  const section = wrap(blocks, ids[1]!);
  assert.deepEqual(parse(read(blocks)).scenes.opening, [
    {wait: 1},
    {invalidate: {condition: false, then: [{wait: 2}]}},
    {wait: 3},
  ]);
  assert.equal(readDsl4SectionAuthoringState(read(blocks)), undefined);
  mode(blocks, section, 'on');
  assert.deepEqual(parse(read(blocks)).scenes.opening, [
    {wait: 1},
    {invalidate: {condition: true, then: [{wait: 2}]}},
    {wait: 3},
  ]);
});
test('omits disabled definitions without losing their editable values', () => {
  const blocks = fixture();
  const variable = Object.keys(blocks).find(
    (id) => canonicalDsl4AuthoringOpcode(String(blocks[id]!.opcode)) === prefix + 'variable',
  )!;
  const section = wrap(blocks, variable);
  assert.equal(parse(read(blocks)).variables, undefined);
  mode(blocks, section, 'on');
  assert.deepEqual(parse(read(blocks)).variables, {score: 1});
});
test('disabled references do not reach semantic validation', () => {
  const blocks = createDsl4StructuredBlockSourceDeclaration({
    source: {
      kamishibai: '4.0',
      scenes: {opening: [{sound: 'not-defined'}, {wait: 1}]},
    },
    form: 'runtime',
    hatId: 'hat',
  });
  const sound = Object.keys(blocks).find((id) => blocks[id]!.opcode.endsWith('_sound'))!;
  const section = wrap(blocks, sound);
  assert.equal(frontend.parse(read(blocks)).ok, true);
  mode(blocks, section, 'on');
  assert.equal(frontend.parse(read(blocks)).ok, false);
});
test('an outer off choice suppresses nested on groups', () => {
  const blocks = fixture();
  const ids = actionIds(blocks);
  const inner = wrap(blocks, ids[1]!, ids[1]!, 'on');
  const outer = wrap(blocks, inner);
  assert.deepEqual(parse(read(blocks)).scenes.opening[1], {
    invalidate: {condition: false, then: [{invalidate: {condition: true, then: [{wait: 2}]}}]},
  });
  mode(blocks, outer, 'on');
  assert.equal(parse(read(blocks)).scenes.opening[1].invalidate.condition, true);
});
test('YAML to SB3 reauthoring retains disabled sections and lets them be enabled again', () => {
  const blocks = fixture();
  wrap(blocks, actionIds(blocks)[1]!);
  const yaml = read(blocks);
  const baseBytes = zipSync({
    'project.json': strToU8(
      JSON.stringify({
        targets: [{isStage: true, name: 'Stage', blocks: {}}],
        extensions: ['kubohiroyakamishibai4'],
      }),
    ),
  });
  const result = authorDsl4BlockSourceSb3({
    baseBytes,
    sourceText: yaml,
    sourceFrontend: frontend,
    sourceSections: true,
    narrativeRuntimeSource:
      '// Kamishibai capabilities: narrative-control-v1\n// Kamishibai capabilities: invalidate-source-v1\n',
  });
  assert(result.ok, JSON.stringify(result.diagnostics));
  const project = JSON.parse(strFromU8(unzipSync(result.bytes)['project.json']!));
  const restored = project.targets[0].blocks as Blocks;
  const [id, section] = Object.entries(restored).find(
    ([, b]) => canonicalDsl4AuthoringOpcode(String(b.opcode)) === prefix + 'useSection',
  )!;
  assert(section);
  mode(restored, id, 'on');
  const exported = extractDsl4BlockSourcesFromProject(project);
  assert.deepEqual(parse(Object.values(exported.sources)[0]!).scenes.opening, [
    {wait: 1},
    {invalidate: {condition: true, then: [{wait: 2}]}},
    {wait: 3},
  ]);
});
test('rejects stale or malformed legacy definition comments rather than overwriting YAML edits', () => {
  const blocks = fixture();
  wrap(
    blocks,
    Object.keys(blocks).find(
      (id) => canonicalDsl4AuthoringOpcode(String(blocks[id]!.opcode)) === prefix + 'variable',
    )!,
  );
  const yaml = read(blocks);
  assert.throws(
    () => readDsl4SectionAuthoringState(yaml.replace('wait: 1', 'wait: 9')),
    /YAML changed independently/,
  );
  assert.throws(
    () =>
      readDsl4SectionAuthoringState(
        yaml + yaml.slice(yaml.indexOf('# kamishibai-block-sections-v1:')),
      ),
    /occur once/,
  );
  assert.throws(
    () =>
      readDsl4SectionAuthoringState(
        'kamishibai: "4.0"\n# kamishibai-block-sections-v1: 999999999:AAAA\n',
      ),
    /byte limit/,
  );
});
test('rejects nonliteral choices and cycles even in disabled groups', () => {
  const blocks = fixture();
  const id = wrap(blocks, actionIds(blocks)[1]!);
  mode(blocks, id, 'false');
  assert.throws(() => read(blocks), /static on\/off/);
  mode(blocks, id, 'off');
  blocks[id]!.inputs.SUBSTACK = [2, id];
  assert.throws(() => read(blocks), /cycle|invalid connections/);
});

test('accepts explicit CLI opt-in and rejects ambiguous section flag values', async () => {
  const {parseCliArguments} = await import('../src/builder/cli.js');
  const base = [
    'author-block-dsl',
    '--input',
    'story.k4.yml',
    '--base',
    'base.sb3',
    '--output',
    'out.sb3',
  ];
  const defaults = parseCliArguments(base);
  assert.equal(defaults.action, 'author-block-dsl');
  if (defaults.action === 'author-block-dsl') assert.equal(defaults.options.sourceSections, false);
  const enabled = parseCliArguments([...base, '--block-sections', 'true']);
  if (enabled.action === 'author-block-dsl') assert.equal(enabled.options.sourceSections, true);
  else assert.fail('Expected author-block-dsl');
  assert.throws(() => parseCliArguments([...base, '--block-sections', 'yes']), /true or false/);
});

test('retains section choices when included modules are relabeled during graph reauthoring', async () => {
  const {authorDsl4BlockSourceGraphSb3} =
    await import('../src/builder/dsl4-block-source-author.js');
  const {createDsl4BlockSourceGraph} = await import('../src/dsl4/block-source-export.js');
  const root = createDsl4StructuredBlockSourceDeclaration({
    source,
    form: 'bundle',
    hatId: 'hat',
    includeLabels: ['part'],
  });
  wrap(root, actionIds(root)[1]!);
  const module = createDsl4StructuredBlockSourceDeclaration({
    source: {variables: {extra: 2}},
    label: 'part',
    form: 'bundle',
    hatId: 'module',
    idPrefix: 'module-block-',
  });
  const project = {targets: [{isStage: true, name: 'Stage', blocks: {...root, ...module}}]};
  const extracted = extractDsl4BlockSourcesFromProject(project);
  const graph = await createDsl4BlockSourceGraph(extracted);
  const baseBytes = zipSync({
    'project.json': strToU8(
      JSON.stringify({
        targets: [{isStage: true, name: 'Stage', blocks: {}}],
        extensions: ['kubohiroyakamishibai4'],
      }),
    ),
  });
  const result = await authorDsl4BlockSourceGraphSb3({
    baseBytes,
    sourceGraph: graph,
    sourceFrontend: frontend,
    sourceSections: true,
    narrativeRuntimeSource:
      '// Kamishibai capabilities: narrative-control-v1\n// Kamishibai capabilities: invalidate-source-v1\n',
  });
  assert(result.ok, JSON.stringify(result.diagnostics));
  const restored = JSON.parse(strFromU8(unzipSync(result.bytes)['project.json']!));
  const back = extractDsl4BlockSourcesFromProject(restored);
  const regenerated = await createDsl4BlockSourceGraph(back);
  assert.equal(regenerated.nodes.length, 2);
  assert.equal(
    Object.values(restored.targets[0].blocks as Blocks).filter(
      (b) => canonicalDsl4AuthoringOpcode(String(b.opcode)) === prefix + 'useSection',
    ).length,
    1,
  );
});

test('the file export API preserves disabled sections through canonical YAML serialization', async () => {
  const {mkdtemp, readFile, writeFile, rm} = await import('node:fs/promises');
  const {tmpdir} = await import('node:os');
  const path = await import('node:path');
  const {exportDsl4BlockSourcesToYaml} = await import('../src/builder/dsl4-block-source-export.js');
  const blocks = fixture();
  wrap(blocks, actionIds(blocks)[1]!);
  const baseBytes = zipSync({
    'project.json': strToU8(
      JSON.stringify({
        targets: [{isStage: true, name: 'Stage', blocks: {}}],
        extensions: ['kubohiroyakamishibai4'],
      }),
    ),
  });
  const authored = authorDsl4BlockSourceSb3({
    baseBytes,
    sourceText: read(blocks),
    sourceFrontend: frontend,
    sourceSections: true,
    narrativeRuntimeSource:
      '// Kamishibai capabilities: narrative-control-v1\n// Kamishibai capabilities: invalidate-source-v1\n',
  });
  assert(authored.ok);
  const folder = await mkdtemp(path.join(tmpdir(), 'dsl4-section-export-'));
  try {
    const input = path.join(folder, 'blocks.sb3');
    await writeFile(input, authored.bytes);
    await exportDsl4BlockSourcesToYaml({
      input,
      outputDir: folder,
      name: 'sections',
      sourceFrontend: frontend,
      maxSourceBytes: 262144,
    });
    const yaml = await readFile(path.join(folder, 'sections.k4.yml'), 'utf8');
    assert.equal(readDsl4SectionAuthoringState(yaml), undefined);
    assert.deepEqual(parse(yaml).scenes.opening[1], {
      invalidate: {condition: false, then: [{wait: 2}]},
    });
    const restored = authorDsl4BlockSourceSb3({
      baseBytes,
      sourceText: yaml,
      sourceFrontend: frontend,
      narrativeRuntimeSource:
        '// Kamishibai capabilities: narrative-control-v1\n// Kamishibai capabilities: invalidate-source-v1\n',
    });
    assert(restored.ok);
  } finally {
    await rm(folder, {recursive: true, force: true});
  }
});
