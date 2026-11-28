import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'vitest';
import {createDsl4SourceFrontend} from '../src/dsl4/source-frontend.js';
import {createDsl4EmbeddedSourceDescriptor} from '../src/dsl4/source-descriptor.js';
import {createDsl4RuntimeArtifactDescriptor} from '../src/dsl4/runtime-artifact-descriptor.js';
import {createDsl4EmbeddedAssetBundle} from '../src/dsl4/asset-bundle-descriptor.js';
import {
  createEmbeddedYamlSourceGraphRecord as create,
  validateEmbeddedYamlSourceGraphRecord as validate,
  readEmbeddedYamlSourceGraphRecord as read,
  graphDocumentId,
  graphDocumentPath,
  composeGraphComponent,
  verifyProjection,
} from '../src/dsl4/embedded-yaml-source-graph.js';
const schema = JSON.parse(
  await readFile(new URL('../schema/dsl-4.schema.json', import.meta.url), 'utf8'),
);
const frontend = createDsl4SourceFrontend(schema);
const controls = 'controls:\n  keymaps:\n    production:\n      Space: navigation.nextAction\n';
const main =
  "\ufeff# main exact\r\nkamishibai: '4.0'\r\ninclude: parts/next.k4.yml\r\n" +
  controls.replaceAll('\n', '\r\n') +
  'scenes:\r\n  opening:\r\n    - wait: 1\r\n    - goto: next\r\n';
const moduleSource = '# module exact\r\nscenes:\r\n  next:\r\n    - wait: 2\r\n';
const files = {'main.k4.yml': main, 'parts/next.k4.yml': moduleSource};
async function fixture() {
  const text = "kamishibai: '4.0'\n" + controls + 'scenes:\n  opening:\n    - wait: 1\n';
  const parsed = frontend.parse(text, {sourceId: 'owner-main'});
  assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
  const story = (parsed as unknown as {storyDocument: Record<string, unknown>}).storyDocument;
  const source = await createDsl4EmbeddedSourceDescriptor(text, {
    sourceId: 'owner-main',
    displayName: 'owner.k4.yml',
    cacheIdentity: {
      id: 'owner123',
      label: 'owner.k4.yml',
      databaseName: 'tw-kamishibai-assets-v1--owner123',
    },
    maxSourceBytes: 4 * 1024 * 1024,
  });
  const artifact = await createDsl4RuntimeArtifactDescriptor(story, source, 'production', {
    maxSourceBytes: 4 * 1024 * 1024,
  });
  assert.equal(artifact.ok, true, JSON.stringify(artifact.diagnostics));
  const assets = await createDsl4EmbeddedAssetBundle(
    story,
    {
      manifest: {formatVersion: 1, assets: []},
      getFile() {
        throw Error('No asset expected');
      },
    },
    {maxFiles: 4096, maxTotalBytes: 128 * 1024 * 1024},
  );
  return {
    source,
    artifact: (artifact as unknown as {artifact: unknown}).artifact,
    assets,
    application: {mode: 'story'},
    extra: {kept: true},
  };
}
const clone = <T>(value: T): T => structuredClone(value);
test('keeps raw BOM/CRLF/comments and canonical document identities independent of derived projection', async () => {
  const record = await create({entryPath: 'main.k4.yml', sources: files});
  assert.equal(record.files['main.k4.yml']!.source, main);
  assert.equal(record.files['parts/next.k4.yml']!.source, moduleSource);
  assert.equal(record.files['main.k4.yml']!.byteLength, new TextEncoder().encode(main).length);
  assert.equal(Object.isFrozen(record.files['main.k4.yml']), true);
  assert.equal(graphDocumentId(record, 'main.k4.yml'), 'file:main.k4.yml');
  assert.equal(graphDocumentPath(record, 'file:main.k4.yml'), 'main.k4.yml');
  assert.equal(graphDocumentId(record, 'parts/next.k4.yml'), 'file:parts/next.k4.yml');
  assert.equal(graphDocumentPath(record, 'file:parts/next.k4.yml'), 'parts/next.k4.yml');
  assert.throws(() => graphDocumentPath(record, 'story'));
  assert.throws(() => graphDocumentPath(record, 'file:absent.k4.yml'));
  assert.equal(
    (
      await create({
        entryPath: 'main.k4.yml',
        files: Object.fromEntries(Object.entries(files).reverse()),
      })
    ).integrity,
    record.integrity,
  );
  const component = await fixture(),
    before = clone(component),
    composed = await composeGraphComponent(component, record, frontend);
  assert.equal(composed.source.sourceId, 'owner-main');
  assert.equal(composed.source.displayName, 'owner.k4.yml');
  assert.deepEqual(composed.source.cacheIdentity, component.source.cacheIdentity);
  assert.equal(composed.assets, component.assets);
  assert.deepEqual(component, before);
  assert.equal(Object.isFrozen(component), false);
  assert.equal(composed.sourceDocuments, record);
  assert.match(composed.source.text, /next:/u);
  assert.doesNotMatch(composed.source.text, /include:/u);
  assert.equal(composed.artifact.sourceIntegrity, composed.source.integrity);
  assert.ok(composed.source.sourceOrigins);
  assert.equal(await verifyProjection(composed, record, frontend), record);
});
test('retains unreachable partial modules and checks their include structure without full-document requirements', async () => {
  const unused = '# retained module\r\nscenes:\r\n  unused: []\r\n';
  const record = await create({
    entryPath: 'main.k4.yml',
    files: {...files, 'unused.k4.yml': unused},
  });
  const component = await composeGraphComponent(await fixture(), record, frontend);
  assert.equal(component.sourceDocuments.files['unused.k4.yml']!.source, unused);
  assert.doesNotMatch(component.source.text, /unused:/u);
  await assert.rejects(
    create({
      entryPath: 'main.k4.yml',
      files: {...files, 'unused.k4.yml': 'include: missing.k4.yml\n'},
    }),
  );
  await assert.rejects(
    create({
      entryPath: 'main.k4.yml',
      files: {
        ...files,
        'a.k4.yml': 'include: b.k4.yml\n',
        'b.k4.yml': 'include: a.k4.yml\n',
      },
    }),
  );
});
test('checks raw and derived integrity, artifact binding, and byte counts without mutating inputs', async () => {
  const record = await create({entryPath: 'main.k4.yml', files}),
    composed = await composeGraphComponent(await fixture(), record, frontend);
  const badRaw = clone(record);
  (badRaw.files['main.k4.yml'] as {source: string}).source = main.replace('wait: 1', 'wait: 9');
  await assert.rejects(validate(badRaw), {
    code: 'K4-SOURCE-DOCUMENTS-INTEGRITY',
  });
  const badHash = clone(record);
  (badHash as {integrity: string}).integrity = 'sha256-' + 'A'.repeat(43) + '=';
  await assert.rejects(validate(badHash), {
    code: 'K4-SOURCE-DOCUMENTS-INTEGRITY',
  });
  const badLength = clone(record);
  (badLength.files['main.k4.yml'] as {byteLength: number}).byteLength++;
  assert.throws(() => read(badLength));
  const changed = await create({
    entryPath: 'main.k4.yml',
    files: {
      ...files,
      'parts/next.k4.yml': moduleSource.replace('wait: 2', 'wait: 3'),
    },
  });
  await assert.rejects(verifyProjection(composed, changed, frontend), {
    code: 'K4-SOURCE-DOCUMENTS-PROJECTION',
  });
  for (const tamper of [
    (value: Record<string, unknown>) => {
      (value.source as {text: string}).text += '\n# drift';
    },
    (value: Record<string, unknown>) => {
      (value.artifact as {resolvedKeymap: Record<string, string>}).resolvedKeymap.Space =
        'navigation.nextScene';
    },
    (value: Record<string, unknown>) => {
      (value.source as {sourceOrigins: unknown}).sourceOrigins = {};
    },
  ]) {
    const bad = clone(composed);
    tamper(bad);
    await assert.rejects(verifyProjection(bad, record, frontend), {
      code: 'K4-SOURCE-DOCUMENTS-PROJECTION',
    });
  }
});
test.each([
  '../escape.k4.yml',
  '/absolute.k4.yml',
  'https://host/main.k4.yml',
  'bad\\main.k4.yml',
  'main.txt',
  'CON.k4.yml',
  'a?.k4.yml',
  'bad /main.k4.yml',
  'dir/LPT1.k4.yml',
  'あ'.repeat(86) + '.k4.yml',
  'a'.repeat(1001) + '.k4.yml',
])('rejects invalid path %s', async (path) => {
  await assert.rejects(create({entryPath: path, files: {[path]: 'scenes: {}\n'}}));
});
test('rejects missing/cyclic references, portable name conflicts, and duplicate normalized paths', async () => {
  await assert.rejects(
    create({
      entryPath: 'main.k4.yml',
      files: {'main.k4.yml': 'include: missing.k4.yml\n'},
    }),
  );
  await assert.rejects(
    create({
      entryPath: 'main.k4.yml',
      files: {'main.k4.yml': 'include: main.k4.yml\n'},
    }),
  );
  for (const pair of [
    ['a.k4.yml', 'A.k4.yml'],
    ['é.k4.yml', 'e\u0301.k4.yml'],
    ['a.k4.yml', './a.k4.yml'],
  ])
    await assert.rejects(
      create({
        entryPath: pair[0]!,
        files: {[pair[0]!]: 'scenes: {}\n', [pair[1]!]: 'scenes: {}\n'},
      }),
    );
});
test('rejects per-file, file-count, and aggregate limits before composition', async () => {
  await assert.rejects(
    create({
      entryPath: 'main.k4.yml',
      files: {'main.k4.yml': '#' + 'a'.repeat(1024 * 1024)},
    }),
    {code: 'K4-SOURCE-DOCUMENTS-LIMIT'},
  );
  await assert.rejects(
    create({
      entryPath: '0.k4.yml',
      files: Object.fromEntries(
        Array.from({length: 65}, (_, i) => [`${i}.k4.yml`, 'scenes: {}\n']),
      ),
    }),
    {code: 'K4-SOURCE-DOCUMENTS-LIMIT'},
  );
  await assert.rejects(
    create({
      entryPath: '0.k4.yml',
      files: Object.fromEntries(
        Array.from({length: 5}, (_, i) => [`${i}.k4.yml`, '#' + 'a'.repeat(900000)]),
      ),
    }),
    {code: 'K4-SOURCE-DOCUMENTS-LIMIT'},
  );
});
test('does not add asset definitions absent from the existing strict asset bundle', async () => {
  const added = main.replace(
    'include: parts/next.k4.yml\r\n',
    'include: parts/next.k4.yml\r\nassets:\r\n  Added:\r\n    kind: backdrop\r\n    file: added.svg\r\n',
  );
  const record = await create({
    entryPath: 'main.k4.yml',
    files: {...files, 'main.k4.yml': added},
  });
  await assert.rejects(composeGraphComponent(await fixture(), record, frontend));
});

test('preserves an existing validated asset distribution and rejects altered profile metadata', async () => {
  const {createDsl4SourceGraph} = await import('../src/dsl4/source-graph.js');
  const {createDsl4SourceGraphFrontend} = await import('../src/dsl4/source-graph-frontend.js');
  const {resolveDsl4AssetDistributionProfile} =
    await import('../src/dsl4/asset-distribution-profile.js');
  const graph = await createDsl4SourceGraph('main.k4.yml', {
    readSource(path) {
      return files[path as keyof typeof files]!;
    },
  });
  const parsed = createDsl4SourceGraphFrontend(frontend).parse(graph, {
    featureFlags: {dsl4Runtime: true},
    maxComposedSourceBytes: 4 * 1024 * 1024,
    sourceId: 'owner-main',
  });
  assert.equal(parsed.ok, true);
  const story = (parsed as unknown as {storyDocument: Record<string, unknown>}).storyDocument;
  const distribution = resolveDsl4AssetDistributionProfile(
    story,
    {
      formatVersion: 1,
      providers: {},
      profiles: {
        native: {network: 'forbidden', defaultDelivery: 'embedded'},
      },
    },
    {formatVersion: 1, assets: {}},
    'native',
  );
  const record = await create({entryPath: 'main.k4.yml', files}),
    component = {...(await fixture()), assetDistribution: distribution};
  const composed = await composeGraphComponent(component, record, frontend);
  assert.equal(composed.assetDistribution, distribution);
  await verifyProjection(composed, record, frontend);
  const bad = clone(component);
  (bad.assetDistribution as unknown as Record<string, unknown>).network = 'unrecognized';
  await assert.rejects(composeGraphComponent(bad, record, frontend));
});
test('attributes graph and frontend failures to the original module path', async () => {
  await assert.rejects(
    create({
      entryPath: 'main.k4.yml',
      files: {...files, 'parts/next.k4.yml': 'include: absent.k4.yml\n'},
    }),
    (error) => {
      assert.match((error as Error).message, /parts\/absent.k4.yml|parts\/next.k4.yml/u);
      return true;
    },
  );
  const record = await create({
    entryPath: 'main.k4.yml',
    files: {
      ...files,
      'parts/next.k4.yml': 'scenes:\n  next:\n    - unknownAction: 1\n',
    },
  });
  await assert.rejects(composeGraphComponent(await fixture(), record, frontend), (error) => {
    const failure = error as Error & {diagnostics?: readonly unknown[]};
    assert.match(failure.message, /parts\/next.k4.yml/u);
    assert.ok(failure.diagnostics?.length);
    return true;
  });
});
test('rejects excess include depth, declaration conflicts, accessors, and invalid unicode', async () => {
  const deep = Object.fromEntries(
    Array.from({length: 35}, (_, i) => [
      `${i}.k4.yml`,
      i === 34 ? 'scenes: {}\n' : `include: ${i + 1}.k4.yml\n`,
    ]),
  );
  await assert.rejects(create({entryPath: '0.k4.yml', files: deep}));
  await assert.rejects(
    create({
      entryPath: 'main.k4.yml',
      files: {...files, 'parts/next.k4.yml': 'scenes:\n  opening: []\n'},
    }),
  );
  let readCount = 0;
  const getters = Object.defineProperty({}, 'main.k4.yml', {
    enumerable: true,
    get() {
      readCount++;
      return main;
    },
  });
  await assert.rejects(create({entryPath: 'main.k4.yml', files: getters}));
  assert.equal(readCount, 0);
  await assert.rejects(create({entryPath: 'main.k4.yml', files: {'main.k4.yml': '#\ud800'}}));
});

test('retains native Stage costumes and sounds inferred outside the existing bundle while keeping explicit assets strict', async () => {
  const project = {
    targets: [
      {
        isStage: true,
        name: 'Stage',
        costumes: [
          {
            name: 'Title',
            assetId: 'original-title',
            md5ext: 'original-title.svg',
            dataFormat: 'svg',
          },
        ],
        sounds: [
          {
            name: 'SuccessSound',
            assetId: 'original-sound',
            md5ext: 'original-sound.wav',
            dataFormat: 'wav',
          },
        ],
      },
    ],
  };
  const originalProject = clone(project);
  const component = await fixture();
  const originalComponent = clone(component);
  const record = await create({entryPath: 'main.k4.yml', files});
  const composed = await composeGraphComponent(component, record, frontend, {project});
  const parsed = frontend.parse(composed.source.text, {
    sourceId: composed.source.sourceId,
    project,
  });
  assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
  const story = (
    parsed as unknown as {
      storyDocument: {
        assets: Record<string, {name?: string}>;
        metadata: {implicitProjectAssets: string[]};
      };
    }
  ).storyDocument;
  assert.deepEqual(
    story.metadata.implicitProjectAssets.map((id) => story.assets[id]!.name).sort(),
    ['SuccessSound', 'Title'],
  );
  assert.deepEqual(composed.assets.manifest.assets, []);
  assert.equal(composed.assets, component.assets);
  assert.deepEqual(project, originalProject);
  assert.deepEqual(component, originalComponent);
  await verifyProjection(composed, record, frontend, {project});

  // An explicit reference to an existing native backdrop is not an inferred-only exemption.
  const explicitMain = main.replace(
    'include: parts/next.k4.yml\r\n',
    'include: parts/next.k4.yml\r\nassets:\r\n  Title: backdrop\r\n',
  );
  const explicitRecord = await create({
    entryPath: 'main.k4.yml',
    files: {...files, 'main.k4.yml': explicitMain},
  });
  await assert.rejects(composeGraphComponent(component, explicitRecord, frontend, {project}), {
    code: 'K4-ASSET-BUNDLE-MANIFEST-001',
  });
  assert.deepEqual(project, originalProject);
  assert.deepEqual(component, originalComponent);
});
