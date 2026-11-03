import assert from 'node:assert/strict';
import {test} from 'vitest';
import schema from '../schema/dsl-4.schema.json' with {type: 'json'};
import {createDsl4ProductionSourceFrontend} from '../src/builder/dsl4-source-frontend.js';
import {createDsl4EmbeddedSourceDescriptor} from '../src/dsl4/source-descriptor.js';
import {
  createDsl4RuntimeArtifactDescriptor,
  type RuntimeArtifactSuccess,
} from '../src/dsl4/runtime-artifact-descriptor.js';
import {createDsl4EmbeddedAssetBundle} from '../src/dsl4/asset-bundle-descriptor.js';
import {
  createDsl4StructuredBlockSourceDeclaration,
  dsl4ConfigBlockSourceHatOpcode,
  dsl4LabeledBlockSourceHatOpcode,
  dsl4IncludeBlocksOpcode,
} from '../src/dsl4/structured-block-source.js';
import {migrateDsl4LegacyBlockProject} from '../src/dsl4/embedded-yaml-migration.js';
import {
  dsl4BundledEmbeddedYamlHatOpcode,
  dsl4BundledEmbeddedYamlRootOpcode,
} from '../src/dsl4/embedded-yaml-identity.js';
import {readDocumentViewMetadata} from '@kubohiroya/turbowarp-document-data/view-metadata';
type Block = {
  opcode: string;
  next: string | null;
  parent: string | null;
  inputs: Record<string, [number, [number, string | number | boolean]]>;
  fields: Record<string, [string]>;
  comment?: string;
};
type BlockMap = Record<string, Block> & {
  main: Block;
  chapter: Block;
  shared: Block;
  unrelated: Block;
};
type Comment = {
  blockId: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
};
type Component = Record<string, unknown> & {
  source: Awaited<ReturnType<typeof createDsl4EmbeddedSourceDescriptor>>;
  sourceDocuments: import('../src/dsl4/embedded-yaml-source-graph.js').EmbeddedYamlSourceGraphRecord;
  application: {mode: string};
};
type Obj = Record<string, unknown> & {
  targets: [
    {blocks: BlockMap; comments: Record<string, Comment>; variables: Record<string, unknown>},
  ];
  extensionStorage: Record<string, unknown> & {
    kubohiroyakamishibai4: {components: {kubohiroyakamishibairuntime4: Component; other: unknown}};
  };
  extensionURLs: Record<string, string>;
};
const frontend = createDsl4ProductionSourceFrontend(schema);
const controls = {keymaps: {production: {Space: 'navigation.nextAction'}}};
async function fixture() {
  const sourceText =
    "kamishibai: '4.0'\ncontrols:\n  keymaps:\n    production:\n      Space: navigation.nextAction\nscenes:\n  stub: []\n";
  const parsed = frontend.parse(sourceText);
  assert(parsed.ok);
  const source = await createDsl4EmbeddedSourceDescriptor(sourceText, {
    sourceId: 'main',
    displayName: 'old.k4.yml',
    maxSourceBytes: 4 * 1024 * 1024,
  });
  const artifact = await createDsl4RuntimeArtifactDescriptor(
    parsed.storyDocument,
    source,
    'production',
    {maxSourceBytes: 4 * 1024 * 1024},
  );
  assert(artifact.ok);
  const assets = await createDsl4EmbeddedAssetBundle(
    parsed.storyDocument,
    {
      manifest: {formatVersion: 1, assets: []},
      getFile() {
        throw Error('No file');
      },
    },
    {maxFiles: 4096, maxTotalBytes: 128 * 1024 * 1024},
  );
  const decl = (
    label: string,
    id: string,
    source: Record<string, unknown>,
    includes: string[] = [],
  ) =>
    createDsl4StructuredBlockSourceDeclaration({
      source,
      label,
      hatId: id,
      idPrefix: id + '-',
      version: '4.0',
      form: 'bundle',
      includeLabels: includes,
      simpleSpeech: false,
      textSafeLiterals: true,
    });
  const project = {
    targets: [
      {
        isStage: true,
        name: 'Stage',
        variables: {retained: ['counter', 8]},
        costumes: [],
        sounds: [],
        blocks: {
          unrelated: {
            opcode: 'event_whenflagclicked',
            next: null,
            parent: null,
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: true,
          },
          ...decl(
            '',
            'main',
            {
              kamishibai: '4.0',
              controls,
              variables: {message: 'こんにちは'},
              scenes: {opening: [{wait: 1}]},
            },
            ['章', 'shared'],
          ),
          ...decl('章', 'chapter', {scenes: {chapter: [{wait: 2}]}}, ['shared']),
          ...decl('shared', 'shared', {scenes: {shared: [{wait: 3}]}}),
        },
        comments: {},
      },
    ],
    extensionStorage: {
      kubohiroyakamishibai4: {
        components: {
          kubohiroyakamishibairuntime4: {
            source,
            artifact: (artifact as unknown as RuntimeArtifactSuccess).artifact,
            assets,
            application: {mode: 'menu'},
            retained: {same: true},
          },
          other: {data: 'keep component'},
        },
      },
    },
    extensions: ['kubohiroyakamishibai4', 'kubohiroyakamishibaiauthoring4'],
    extensionURLs: {
      kubohiroyakamishibai4: 'https://example.invalid/runtime.js',
      kubohiroyakamishibaiauthoring4: 'https://example.invalid/author.js',
    },
    retained: {same: true},
  };
  return project as unknown as Obj;
}
const component = (input: Record<string, unknown>) =>
  (input as Obj).extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4;
test('migrates a multi-module schema graph with merged configuration, independent versioned root and canonical named files', async () => {
  const original = await fixture(),
    before = structuredClone(original),
    result = await migrateDsl4LegacyBlockProject(original, {
      sourceFrontend: frontend,
      entryFile: '物語.k4.yml',
    }),
    p = result.project as Obj,
    c = component(p);
  assert.deepEqual(original, before);
  assert.equal(result.report.status, 'migrated');
  assert.equal(result.report.generatedYaml, true);
  assert.deepEqual(Object.keys(c.sourceDocuments.files).sort(), [
    'shared.k4.yml',
    '物語.k4.yml',
    '章.k4.yml',
  ]);
  assert.equal(c.sourceDocuments.entryPath, '物語.k4.yml');
  assert.equal(c.source.displayName, '物語.k4.yml');
  assert.equal(c.application.mode, 'story');
  const blocks = Object.values(p.targets[0].blocks) as Block[];
  const roots = blocks.filter((b) => b.opcode === dsl4BundledEmbeddedYamlRootOpcode);
  assert.equal(roots.length, 1);
  assert.equal(roots[0]!.next, null);
  assert.equal(roots[0]!.parent, null);
  assert.equal(roots[0]!.fields.VERSION![0], '4.0');
  assert.equal(blocks.filter((b) => b.opcode === dsl4BundledEmbeddedYamlHatOpcode).length, 3);
  assert(
    !blocks.some((b) =>
      [
        dsl4LabeledBlockSourceHatOpcode,
        dsl4ConfigBlockSourceHatOpcode,
        dsl4IncludeBlocksOpcode,
      ].includes(b.opcode),
    ),
  );
  assert(p.targets[0].blocks.main.next);
  assert(p.targets[0].blocks.chapter.next);
  assert(p.targets[0].blocks.shared.next);
  for (const doc of result.report.documents) {
    const view = readDocumentViewMetadata(c, doc.reference);
    assert.equal(view?.activeKind, 'schema-blocks');
    assert.equal(
      (view?.descriptors['schema-blocks'] as Record<string, unknown>).baseSourceRevision,
      c.sourceDocuments.files[doc.filename]!.integrity,
    );
  }
  assert.deepEqual(p.targets[0].blocks.unrelated, before.targets[0].blocks.unrelated);
  assert.deepEqual(p.targets[0].variables, before.targets[0].variables);
  assert.deepEqual(c.assets, component(before).assets);
  assert.deepEqual(
    p.extensionStorage.kubohiroyakamishibai4.components.other,
    before.extensionStorage.kubohiroyakamishibai4.components.other,
  );
  const repeated = await migrateDsl4LegacyBlockProject(p, {sourceFrontend: frontend});
  assert.equal(repeated.report.status, 'already-migrated');
  assert.equal(repeated.project, p);
});
test('retains standard comments on body blocks and moves one configuration-root note to its matching document', async () => {
  const project = await fixture(),
    stage = project.targets[0],
    blocks = stage.blocks;
  const configId = Object.keys(blocks).find(
    (id) => blocks[id]!.opcode === dsl4ConfigBlockSourceHatOpcode,
  )!;
  const bodyId = Object.keys(blocks).find((id) => String(blocks[id]!.opcode).endsWith('_wait'))!;
  const note = (blockId: string, text: string) => ({
    blockId,
    text,
    x: 20,
    y: 20,
    width: 140,
    height: 80,
    minimized: false,
  });
  stage.comments = {configuration: note(configId, '設定の注記'), body: note(bodyId, '本文の注記')};
  blocks[configId]!.comment = 'configuration';
  blocks[bodyId]!.comment = 'body';
  const result = await migrateDsl4LegacyBlockProject(project, {sourceFrontend: frontend}),
    after = (result.project as Obj).targets[0];
  assert.equal(result.report.standardCommentsPreserved, 2);
  assert.equal(after.comments.body!.blockId, bodyId);
  assert.equal(after.comments.body!.text, '本文の注記');
  assert.equal(after.comments.configuration!.blockId, 'main');
  assert.equal(after.comments.configuration!.text, '設定の注記');
  assert.equal(after.blocks.main.comment, 'configuration');
  const ambiguous = await fixture(),
    s = ambiguous.targets[0],
    config = Object.keys(s.blocks).find(
      (id) => s.blocks[id]!.opcode === dsl4ConfigBlockSourceHatOpcode,
    )!;
  s.blocks.main.comment = 'main-note';
  s.blocks[config]!.comment = 'config-note';
  s.comments = {'main-note': note('main', 'main'), 'config-note': note(config, 'config')};
  await assert.rejects(
    migrateDsl4LegacyBlockProject(ambiguous, {sourceFrontend: frontend}),
    /comments cannot be merged/,
  );
});
test('rejects missing includes, unsafe/empty filenames, ambiguous mappings and inconsistent owners without mutation', async () => {
  for (const change of [
    (p: Obj) => {
      p.targets[0].blocks.main.inputs.VERSION = [1, [10, '4.1']];
    },
    (p: Obj) => {
      p.extensionStorage.kubohiroyakamishibairuntime4 = component(p);
    },
    (p: Obj) => {
      const include = Object.values(p.targets[0].blocks).find(
        (b) => b.opcode === dsl4IncludeBlocksOpcode,
      ) as Block;
      include.inputs.LABEL = [1, [10, 'missing']];
    },
  ]) {
    const p = await fixture();
    change(p);
    const before = structuredClone(p);
    await assert.rejects(migrateDsl4LegacyBlockProject(p, {sourceFrontend: frontend}));
    assert.deepEqual(p, before);
  }
  for (const entryFile of ['', 'CON.k4.yml', '../escape.k4.yml'])
    await assert.rejects(
      migrateDsl4LegacyBlockProject(await fixture(), {sourceFrontend: frontend, entryFile}),
    );
  await assert.rejects(
    migrateDsl4LegacyBlockProject(await fixture(), {
      sourceFrontend: frontend,
      documentPaths: {章: 'shared.k4.yml'},
    }),
  );
});

test('pristine raw authoring bases reuse roots, retain existing YAML comments and never discard an active placeholder', async () => {
  const legacyProject = await fixture(),
    first = await migrateDsl4LegacyBlockProject(legacyProject, {sourceFrontend: frontend});
  const mixed = structuredClone(legacyProject),
    stage = mixed.targets[0],
    migrated = first.project as Obj,
    entry = component(migrated).sourceDocuments.entryPath;
  mixed.extensionStorage = structuredClone(migrated.extensionStorage);
  delete component(mixed).editorViews;
  const {createEmbeddedYamlSourceGraphRecord, composeGraphComponent} =
    await import('../src/dsl4/embedded-yaml-source-graph.js');
  const texts = Object.fromEntries(
    Object.entries(component(mixed).sourceDocuments.files).map(([name, file]) => [
      name,
      (name === entry ? '# 既存の原文コメント\n' : '') + file.source,
    ]),
  );
  const graph = await createEmbeddedYamlSourceGraphRecord({entryPath: entry, files: texts});
  mixed.extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4 =
    structuredClone(
      (await composeGraphComponent(component(mixed), graph, frontend, {
        project: mixed,
      })) as Component,
    );
  const oldBlocks = migrated.targets[0].blocks as BlockMap;
  const root = Object.values(oldBlocks).find(
    (b) => b.opcode === dsl4BundledEmbeddedYamlRootOpcode,
  ) as Block;
  stage.blocks['kept-root-id']! = {...structuredClone(root), comment: 'root-note'};
  stage.comments = {
    'root-note': {
      blockId: 'kept-root-id',
      text: '開始文書の注記',
      x: 10,
      y: 10,
      width: 120,
      height: 80,
      minimized: false,
    },
  };
  for (const [id, b] of Object.entries(oldBlocks))
    if (b.opcode === dsl4BundledEmbeddedYamlHatOpcode)
      stage.blocks['raw-' + id] = {...structuredClone(b), next: null, parent: null};
  const before = structuredClone(mixed),
    result = await migrateDsl4LegacyBlockProject(mixed, {sourceFrontend: frontend});
  assert.deepEqual(mixed, before);
  assert.equal(
    (result.project as Obj).targets[0].blocks['kept-root-id']!.opcode,
    dsl4BundledEmbeddedYamlRootOpcode,
  );
  assert.equal((result.project as Obj).targets[0].comments['root-note']!.blockId, 'kept-root-id');
  assert(
    component(result.project).sourceDocuments.files[entry]!.source.startsWith(
      '# 既存の原文コメント\n',
    ),
  );
  const commentBlock = Object.values((result.project as Obj).targets[0].blocks).find((b) =>
    String(b.opcode).endsWith('__yamlLineComment'),
  ) as Block;
  assert(commentBlock);
  assert.equal(commentBlock.inputs.TEXT![1][1], ' 既存の原文コメント');
  const {extractEmbeddedYamlDocumentSources} =
    await import('../src/dsl4/embedded-yaml-migration.js');
  const edited = result.project as Obj,
    wait = Object.values(edited.targets[0].blocks).find((b) =>
      String(b.opcode).endsWith('_wait'),
    ) as Block;
  wait.inputs.SECONDS = [1, [4, 7]];
  const reflected = await extractEmbeddedYamlDocumentSources(edited, frontend);
  assert(reflected.sources[entry]!.startsWith('# 既存の原文コメント\n'));
  const annotated = structuredClone(mixed);
  annotated.targets[0].blocks['raw-main']!.comment = 'do-not-discard';
  await assert.rejects(migrateDsl4LegacyBlockProject(annotated, {sourceFrontend: frontend}), {
    code: 'K4-MIGRATION-MIXED',
  });
  const inline = structuredClone(mixed),
    inlineFiles = Object.fromEntries(
      Object.entries(component(inline).sourceDocuments.files).map(([name, file]) => [
        name,
        name === entry ? file.source.replace('wait: 1', 'wait: 1 # 未対応の行末') : file.source,
      ]),
    );
  const inlineRecord = await createEmbeddedYamlSourceGraphRecord({
    entryPath: entry,
    files: inlineFiles,
  });
  inline.extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4 =
    structuredClone(
      (await composeGraphComponent(component(inline), inlineRecord, frontend, {
        project: inline,
      })) as Component,
    );
  await assert.rejects(migrateDsl4LegacyBlockProject(inline, {sourceFrontend: frontend}), {
    code: 'VIEW_SCHEMA_COMMENT_UNSUPPORTED',
  });
});

test('migrated multi-document schema bodies export their latest edits through owner validation without touching the project', async () => {
  const {extractEmbeddedYamlDocumentSources} =
    await import('../src/dsl4/embedded-yaml-migration.js');
  const migrated = await migrateDsl4LegacyBlockProject(await fixture(), {sourceFrontend: frontend}),
    project = migrated.project as Obj;
  const id = Object.keys(project.targets[0].blocks).find(
    (key) =>
      key.startsWith('chapter-') &&
      String(project.targets[0].blocks[key]!.opcode).endsWith('_wait'),
  )!;
  project.targets[0].blocks[id]!.inputs.SECONDS = [1, [4, 9]];
  const before = structuredClone(project),
    exported = await extractEmbeddedYamlDocumentSources(project, frontend);
  const {parse} = await import('yaml');
  assert.equal(parse(exported.sources['章.k4.yml']!).scenes.chapter[0].wait, 9);
  assert.deepEqual(project, before);
});

test('official CLI accepts migration options and the explicit bare embedded-source build flag', async () => {
  const {parseCliArguments} = await import('../src/builder/cli.js');
  const parsed = parseCliArguments([
    'migrate-embedded-yaml',
    '--input',
    'old.sb3',
    '--output',
    'new.sb3',
    '--entry-file',
    '物語.k4.yml',
    '--report',
    'report.json',
    '--narrative-control',
  ]);
  assert.equal(parsed.action, 'migrate-embedded-yaml');
  if (parsed.action !== 'migrate-embedded-yaml') throw Error();
  assert.equal(parsed.options.entryFile, '物語.k4.yml');
  assert.equal(parsed.narrativeControlEnabled, true);
  assert.throws(() => parseCliArguments(['migrate-embedded-yaml', '--input', 'old.sb3']));
  const args = [
    'build-dsl4',
    '--base',
    'base.sb3',
    '--project-root',
    'stories',
    '--output',
    'out.sb3',
    '--control-profile',
    'production',
    '--channel',
    'bundled',
  ];
  const build = parseCliArguments([...args, '--embedded-source-documents']);
  assert.equal(build.action, 'build-dsl4');
  if (build.action !== 'build-dsl4') throw Error();
  assert.equal(build.options.embeddedSourceDocuments, true);
  const baseline = parseCliArguments(args);
  if (baseline.action !== 'build-dsl4') throw Error();
  assert.equal(baseline.options.embeddedSourceDocuments, undefined);
  assert.throws(() => parseCliArguments([...args, '--embedded-source-documents', 'true']));
});

test('file migration writes a verified new SB3 and report, preserves archive bytes and authored forms, and never overwrites', async () => {
  const {mkdtemp, writeFile, readFile, rm, access} = await import('node:fs/promises'),
    {tmpdir} = await import('node:os'),
    path = await import('node:path');
  const {serializeSb3, readSb3} = await import('../src/builder/sb3.js'),
    {migrateDsl4EmbeddedYamlFile} = await import('../src/builder/dsl4-embedded-yaml-migrate.js');
  const {createDsl4BlockAuthoringExtensionSource} =
    await import('../src/dsl4/structured-block-source.js');
  const directory = await mkdtemp(path.join(tmpdir(), 'app-yaml-migration-test-'));
  try {
    const project = await fixture();
    project.extensionURLs.kubohiroyakamishibaiauthoring4 =
      'data:text/javascript;base64,' +
      Buffer.from(createDsl4BlockAuthoringExtensionSource([], {sourceSections: true})).toString(
        'base64',
      );
    const asset = new Uint8Array([0, 255, 7, 13, 10]),
      input = path.join(directory, 'old.sb3'),
      output = path.join(directory, 'new.sb3'),
      report = path.join(directory, 'report.json');
    const original = serializeSb3(
      {'project.json': new Uint8Array(), 'unchanged.svg': asset},
      project,
    );
    await writeFile(input, original);
    const runtimeExtensionSource =
      '// ID: kubohiroyakamishibai4\n// current embeddedYamlRoot sourceDocuments\n';
    const {runCli} = await import('../src/builder/cli.js');
    const result = (await runCli(
      ['migrate-embedded-yaml', '--input', input, '--output', output, '--report', report],
      {
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
      },
      {
        runEmbeddedYamlMigration: (options) =>
          migrateDsl4EmbeddedYamlFile({...options, runtimeExtensionSource}),
      },
    )) as Awaited<ReturnType<typeof migrateDsl4EmbeddedYamlFile>>;
    assert.equal(result.report.archiveAssetsPreserved, 1);
    const parsed = readSb3(await readFile(output));
    assert.deepEqual(parsed.archive['unchanged.svg'], asset);
    assert.deepEqual(await readFile(input), original);
    assert.equal(
      JSON.parse(await readFile(report, 'utf8')).outputSha256,
      result.report.outputSha256,
    );
    const authored = Buffer.from(
      parsed.project.extensionURLs.kubohiroyakamishibaiauthoring4.split(',')[1],
      'base64',
    ).toString('utf8');
    assert.match(authored, /"opcode":"useSection"[^}]*"hideFromPalette":false/u);
    assert.match(authored, /"opcode":"kamishibaiConfig","hideFromPalette":true/u);
    assert(authored.includes('definition-asset'));
    await assert.rejects(
      migrateDsl4EmbeddedYamlFile({
        input,
        output,
        sourceFrontend: frontend,
        runtimeExtensionSource,
      }),
      {code: 'K4-MIGRATION-OUTPUT-EXISTS'},
    );
    await assert.rejects(
      migrateDsl4EmbeddedYamlFile({
        input,
        output: input,
        sourceFrontend: frontend,
        runtimeExtensionSource,
      }),
      {code: 'K4-MIGRATION-IN-PLACE'},
    );
    const bad = path.join(directory, 'bad.sb3'),
      noOutput = path.join(directory, 'must-not-exist.sb3'),
      noReport = path.join(directory, 'must-not-exist.json');
    const broken = await fixture();
    broken.targets[0].blocks.main.inputs.VERSION = [1, [10, '4.1']];
    await writeFile(
      bad,
      serializeSb3({'project.json': new Uint8Array(), 'unchanged.svg': asset}, broken),
    );
    await assert.rejects(
      migrateDsl4EmbeddedYamlFile({
        input: bad,
        output: noOutput,
        report: noReport,
        sourceFrontend: frontend,
        runtimeExtensionSource,
      }),
    );
    await assert.rejects(access(noOutput));
    await assert.rejects(access(noReport));
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('new authoring palettes hide retired kamishibai/config/include declarations while retaining their compatibility definitions', async () => {
  const {createDsl4BlockAuthoringInfo} = await import('../src/dsl4/structured-block-source.js');
  const blocks = createDsl4BlockAuthoringInfo().blocks;
  for (const opcode of ['kamishibai', 'kamishibaiConfig', 'includeBlocks'])
    assert.equal(
      (blocks.find((b) => b.opcode === opcode) as {hideFromPalette?: boolean}).hideFromPalette,
      true,
    );
  assert.equal(
    (
      createDsl4BlockAuthoringInfo({referenceViews: false}).blocks.find(
        (b) => b.opcode === 'kamishibai',
      ) as {hideFromPalette?: boolean}
    ).hideFromPalette,
    undefined,
  );
});
