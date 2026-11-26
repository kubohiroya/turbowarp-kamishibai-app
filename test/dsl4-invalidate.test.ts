import assert from 'node:assert/strict';
import {test} from 'vitest';
import {parse, stringify} from 'yaml';
import {createDsl4TestProductionSourceFrontend} from './helpers/dsl4-test-frontend.ts';
import {createDsl4RuntimeController} from '../src/dsl4/runtime-controller.js';
import {
  createDsl4StructuredBlockSourceDeclaration,
  readDsl4StructuredBlockSource,
} from '../src/dsl4/structured-block-source.js';

const frontend = createDsl4TestProductionSourceFrontend({narrativeControlEnabled: true});
const source = (condition: unknown, then: unknown[] = [{wait: 7}]) => ({
  kamishibai: '4.0',
  scenes: {opening: [{invalidate: {condition, then}}, {wait: 3}]},
});
const read = (blocks: ReturnType<typeof createDsl4StructuredBlockSourceDeclaration>) =>
  readDsl4StructuredBlockSource(blocks, 'hat', (input) => {
    assert(Array.isArray(input) && Array.isArray(input[1]));
    return input[1][1];
  });

for (const condition of [false, true]) {
  test(`invalidate ${condition} round-trips through its dedicated on/off C block`, () => {
    const input = source(condition);
    const blocks = createDsl4StructuredBlockSourceDeclaration({
      source: input,
      form: 'runtime',
      hatId: 'hat',
    });
    const group = Object.values(blocks).find((b) => b.opcode.endsWith('_useSection'))!;
    assert(group);
    assert.deepEqual(group.fields.ENABLED, [condition ? 'on' : 'off', null]);
    assert(group.inputs.SUBSTACK);
    const output = read(blocks);
    assert.deepEqual(parse(output), input);
    assert(!output.includes('kamishibai-block-sections-v1'));
    const rebuilt = createDsl4StructuredBlockSourceDeclaration({
      source: parse(output),
      form: 'runtime',
      hatId: 'hat',
    });
    assert.deepEqual(parse(read(rebuilt)), input);
  });
  test(`invalidate ${condition} dispatches only the enabled body`, async () => {
    const parsed = frontend.parse(stringify(source(condition)));
    assert(parsed.ok, JSON.stringify(parsed.diagnostics));
    const waits: number[] = [];
    const runtime = createDsl4RuntimeController({
      storyDocument: parsed.storyDocument,
      narrativeControlEnabled: true,
      port: {
        wait: (p: Record<string, unknown>) => {
          if (p.seconds) waits.push(Number(p.seconds));
        },
      },
    });
    const result = await runtime.start();
    assert.equal(result.status, 'finished');
    assert.deepEqual(waits, condition ? [7, 3] : [3]);
  });
}
test('disabled body retains unresolved draft references without semantic evaluation', () => {
  assert(frontend.parse(stringify(source(false, [{sound: 'not-defined'}]))).ok);
  assert(!frontend.parse(stringify(source(true, [{sound: 'not-defined'}]))).ok);
});
test('nested on groups cannot enable content inside an off group', async () => {
  const parsed = frontend.parse(
    stringify(source(false, [{invalidate: {condition: true, then: [{sound: 'not-defined'}]}}])),
  );
  assert(parsed.ok, JSON.stringify(parsed.diagnostics));
  let sounds = 0;
  const runtime = createDsl4RuntimeController({
    storyDocument: parsed.storyDocument,
    narrativeControlEnabled: true,
    port: {
      wait: () => {},
      sound: () => {
        sounds++;
      },
    },
  });
  assert.equal((await runtime.start()).status, 'finished');
  assert.equal(sounds, 0);
});
test('invalid conditions and body syntax are rejected, even for disabled source', () => {
  for (const condition of ['false', 0, null, {variable: 'flag'}])
    assert(!frontend.parse(stringify(source(condition))).ok);
  assert(
    !frontend.parse("kamishibai: '4.0'\nscenes: {opening: [{invalidate: {condition: false}}]}\n")
      .ok,
  );
  assert(
    !frontend.parse(
      "kamishibai: '4.0'\nscenes: {opening: [{invalidate: {condition: false, then: 3}}]}\n",
    ).ok,
  );
});

test('dependency collection retains assets and actors used only by a disabled body', async () => {
  const {collectDsl4DefinitionReferences} = await import('../src/dsl4/definition-references.js');
  const {dsl4TestSchema} = await import('./helpers/dsl4-test-frontend.ts');
  const references = collectDsl4DefinitionReferences(
    source(false, [{'A.setSkin': 'future-skin'}]),
    dsl4TestSchema,
  );
  assert(references.references.some((r) => r.namespace === 'assets' && r.name === 'future-skin'));
  assert(references.references.some((r) => r.namespace === 'actors' && r.name === 'A'));
});

test('an explicitly disabled narrative capability rejects invalidate instead of discarding it', () => {
  const off = createDsl4TestProductionSourceFrontend({narrativeControlEnabled: false});
  const parsed = off.parse(stringify(source(false)));
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.diagnostics[0]!.code, 'K4-NARRATIVE-FLAG-001');
});

test('the source capability is detected only at action positions, including nested groups', async () => {
  const {hasDsl4Invalidation} = await import('../src/dsl4/narrative-control.js');
  assert(hasDsl4Invalidation(source(false)));
  assert(
    hasDsl4Invalidation({
      scenes: {s: [{if: {condition: false, then: [{invalidate: {condition: false, then: []}}]}}]},
    }),
  );
  assert(
    !hasDsl4Invalidation({
      scenes: {s: [{'A.customAction': {arguments: {invalidate: {condition: false, then: []}}}}]},
    }),
  );
});
test('a narrative-v1 runner alone cannot author invalidate; a matching source runner can', async () => {
  const {authorDsl4BlockSourceSb3} = await import('../src/builder/dsl4-block-source-author.js');
  const {strToU8, zipSync} = await import('fflate');
  const runtime = '// Kamishibai capabilities: narrative-control-v1\n';
  const baseBytes = zipSync({
    'project.json': strToU8(
      JSON.stringify({
        targets: [{name: 'Stage', isStage: true, blocks: {}}],
        extensions: ['kubohiroyakamishibai4'],
      }),
    ),
  });
  assert.throws(
    () =>
      authorDsl4BlockSourceSb3({
        baseBytes,
        sourceText: stringify(source(false)),
        sourceFrontend: frontend,
        narrativeRuntimeSource: runtime,
      }),
    (error: unknown) => (error as {code: string}).code === 'K4-INVALIDATE-RUNTIME-001',
  );
  const result = authorDsl4BlockSourceSb3({
    baseBytes,
    sourceText: stringify(source(false)),
    sourceFrontend: frontend,
    narrativeRuntimeSource: runtime + '// Kamishibai capabilities: invalidate-source-v1\n',
  });
  assert(result.ok, JSON.stringify(result.diagnostics));
});

test('build rejects narrative-only playback and accepts an invalidate-capable playback', async () => {
  const {mkdtemp, writeFile, rm} = await import('node:fs/promises');
  const {tmpdir} = await import('node:os');
  const path = await import('node:path');
  const {strToU8, zipSync} = await import('fflate');
  const {buildDsl4RuntimeComponent} = await import('../src/builder/dsl4-build.js');
  const {readDsl4NarrativeRuntimeExtensionSource} =
    await import('../src/builder/dsl4-playback-runtime-source.js');
  const root = await mkdtemp(path.join(tmpdir(), 'invalidate-capability-'));
  try {
    await writeFile(
      path.join(root, 'story.k4.yml'),
      stringify({
        ...source(false),
        controls: {keymaps: {production: {Space: 'navigation.nextAction'}}},
      }),
    );
    const base = {
      targets: [
        {
          name: 'Stage',
          isStage: true,
          blocks: {},
          variables: {},
          lists: {},
          broadcasts: {},
          costumes: [],
          sounds: [],
        },
      ],
      monitors: [],
      extensions: ['kubohiroyakamishibai4'],
      extensionURLs: {
        kubohiroyakamishibai4:
          'data:text/javascript;base64,' +
          Buffer.from('// Kamishibai capabilities: narrative-control-v1\n').toString('base64'),
      },
    };
    const options = {
      baseSb3Bytes: zipSync({'project.json': strToU8(JSON.stringify(base))}),
      projectRoot: root,
      sourceManifest: {formatVersion: 1, mode: 'external', sourceId: 'main', path: 'story.k4.yml'},
      sourceFrontend: frontend,
      controlProfile: 'production',
      channel: 'bundled' as const,
      maxSourceBytes: 65536,
      maxAssetFiles: 10,
      maxAssetFileBytes: 65536,
      maxTotalAssetBytes: 65536,
      featureFlags: {dsl4NarrativeControl: true},
    };
    await assert.rejects(buildDsl4RuntimeComponent(options), {code: 'K4-INVALIDATE-RUNTIME-001'});
    const runtimeExtensionSource = await readDsl4NarrativeRuntimeExtensionSource();
    assert(runtimeExtensionSource.includes('// Kamishibai capabilities: invalidate-source-v1'));
    const built = await buildDsl4RuntimeComponent({...options, runtimeExtensionSource});
    assert.equal(built.runtimeComponent.ok, true);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
