import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'vitest';
import {createDsl4EmbeddedAssetBundle} from '../src/dsl4/asset-bundle-descriptor.js';
import {rebindDsl4AssetBundleReferences} from '../src/dsl4/asset-bundle-references.js';
import {definitionRecord} from '../src/dsl4/definition-references.js';
const id = '@project/costume/Fish/Fish1';
const bytes = new TextEncoder().encode('<svg>retained</svg>');
const options = {maxFiles: 8, maxTotalBytes: 4096};
const fish = (resolution: number, name = 'Fish1') => ({
  kind: 'costume',
  name,
  target: 'Fish',
  loading: 'eager',
  bitmapResolution: resolution,
});
const story = (resolution: number, name = 'Fish1') => ({
  kind: 'StoryDocument',
  version: '4.0',
  assets: {
    [id]: fish(resolution, name),
    File: {kind: 'image', file: 'file.svg', loading: 'eager'},
    Remote: {
      kind: 'image',
      delivery: 'remote',
      source: {url: 'https://example.test/image.png'},
      loading: 'eager',
    },
  },
});
async function fixture(name = 'Fish1') {
  return createDsl4EmbeddedAssetBundle(
    story(1, name),
    {
      manifest: {
        formatVersion: 1,
        assets: [
          {id, ...fish(1, name), name: undefined, source: {type: 'project', name}},
          {
            id: 'File',
            kind: 'image',
            loading: 'eager',
            source: {
              type: 'file',
              inputPath: 'file.svg',
              mode: 'file',
              files: [
                {
                  path: 'file.svg',
                  size: bytes.length,
                  integrity: 'sha256-' + createHash('sha256').update(bytes).digest('base64'),
                },
              ],
            },
          },
          {
            id: 'Remote',
            kind: 'image',
            loading: 'eager',
            source: {type: 'remote', url: 'https://example.test/image.png'},
          },
        ].map((row) => {
          const result: Record<string, unknown> = {...row};
          delete result.name;
          return result;
        }),
      },
      getFile: () => bytes,
    },
    options,
  );
}
function rows(value: unknown) {
  const manifest = definitionRecord(definitionRecord(value).manifest);
  return manifest.assets as Record<string, unknown>[];
}
test('authenticates immutable payloads and rebinds only inferred project bitmap metadata', async () => {
  const previous = await fixture(),
    before = JSON.stringify(previous),
    next = story(2);
  const bound = await rebindDsl4AssetBundleReferences(next, previous, {
    ...options,
    implicitProjectAssets: [id],
  });
  assert.equal(rows(previous).find((row) => row.id === id)!.bitmapResolution, 1);
  assert.equal(rows(bound.descriptor).find((row) => row.id === id)!.bitmapResolution, 2);
  for (const name of ['File', 'Remote'])
    assert.deepEqual(
      rows(bound.descriptor).find((row) => row.id === name),
      rows(previous).find((row) => row.id === name),
    );
  assert.deepEqual(bound.descriptor.files, previous.files);
  assert.deepEqual(bound.getFile!('File', 'file.svg'), bytes);
  assert.notEqual(bound.descriptor.integrity, previous.integrity);
  assert.equal(JSON.stringify(previous), before);
  const unchanged = await rebindDsl4AssetBundleReferences(next, bound.descriptor, {
    ...options,
    implicitProjectAssets: [id],
  });
  assert.equal(unchanged.descriptor, bound.descriptor);
});
test('keeps explicit project metadata, file paths and remote URLs strict instead of overriding them', async () => {
  const previous = await fixture();
  await assert.rejects(
    rebindDsl4AssetBundleReferences(story(2), previous, {...options, implicitProjectAssets: []}),
    /metadata does not match/,
  );
  await assert.rejects(
    rebindDsl4AssetBundleReferences(story(2), await fixture('OtherFish'), {
      ...options,
      implicitProjectAssets: [id],
    }),
  );
  for (const kind of ['target', 'loading', 'file', 'remote']) {
    const next = story(2);
    if (kind === 'target') next.assets[id]!.target = 'Other';
    if (kind === 'loading') next.assets[id]!.loading = 'lazy';
    if (kind === 'file') next.assets.File.file = 'other.svg';
    if (kind === 'remote') next.assets.Remote.source.url = 'https://example.test/other.png';
    await assert.rejects(
      rebindDsl4AssetBundleReferences(next, previous, {...options, implicitProjectAssets: [id]}),
    );
  }
});
test('never re-signs a corrupt retained descriptor or file payload', async () => {
  const previous = await fixture();
  for (const kind of ['integrity', 'payload']) {
    const bad = JSON.parse(JSON.stringify(previous)) as {
      integrity: string;
      files: {data: string}[];
    };
    if (kind === 'integrity') bad.integrity = 'sha256-' + Buffer.alloc(32).toString('base64');
    else bad.files[0]!.data = Buffer.from('changed').toString('base64');
    const before = JSON.stringify(bad);
    await assert.rejects(
      rebindDsl4AssetBundleReferences(story(2), bad, {...options, implicitProjectAssets: [id]}),
    );
    assert.equal(JSON.stringify(bad), before);
  }
});

test('native bitmap upgrade is not a dirty document and same-format Save retains the live costume', async () => {
  const {createDsl4ProductionSourceFrontend} =
    await import('../src/builder/dsl4-source-frontend.js');
  const schema = (await import('../schema/dsl-4.schema.json', {with: {type: 'json'}})).default;
  const {createEmbeddedYamlSourceGraphRecord, composeGraphComponent} =
    await import('../src/dsl4/embedded-yaml-source-graph.js');
  const {buildKamishibaiGraphDocumentViewCandidate, buildKamishibaiGraphDocumentPreviewArtifact} =
    await import('../src/dsl4/embedded-yaml-graph-views.js');
  const {replaceGraphDocumentSource} = await import('../src/dsl4/embedded-yaml-graph-provider.js');
  const {loadDsl4RuntimeComponent} = await import('../src/dsl4/runtime-artifact-loader.js');
  const {convertDsl4ProjectToCompiledProfile} = await import('../src/dsl4/compiled-project.js');
  const {createDsl4CompiledStoryArtifact} = await import('../src/dsl4/compiled-story-artifact.js');
  const {cloneKamishibaiDocumentProject} =
    await import('../src/dsl4/embedded-yaml-project-clone.js');
  const {assertKamishibaiDocumentSourceReady} =
    await import('../src/dsl4/embedded-yaml-view-state.js');
  const {installEmbeddedYamlMarker} =
    await import('@kubohiroya/turbowarp-document-data/document-source');
  const {installDsl4EmbeddedYamlRoot} = await import('../src/dsl4/embedded-yaml-hat.js');
  const {dsl4BundledEmbeddedYamlHatOpcode} = await import('../src/dsl4/embedded-yaml-identity.js');
  const frontend = createDsl4ProductionSourceFrontend(schema);
  const source =
    "kamishibai: '4.0'\ncontrols:\n  keymaps:\n    production:\n      Space: navigation.nextAction\ncover:\n  backdrop: Title\nscenes:\n  main:\n    - Fish.show:\n        skin: Fish1\n        x: 0\n        y: 0\n        scale: 100\n    - wait: 2\n";
  const reference = {providerId: 'kamishibai-dsl4', documentId: 'file:story.k4.yml'};
  const project = {
    targets: [
      {
        name: 'Stage',
        isStage: true,
        blocks: {} as Record<string, Record<string, unknown>>,
        costumes: [{name: 'Title', bitmapResolution: 1, assetId: 'vector'}],
      },
      {
        name: 'Fish',
        isStage: false,
        blocks: {} as Record<string, Record<string, unknown>>,
        costumes: [{name: 'Fish1', bitmapResolution: 1, assetId: 'original-image'}],
      },
    ],
    extensionStorage: {} as Record<string, unknown>,
  };
  const parsed = frontend.parse(source, {project});
  assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
  if (!parsed.ok) throw Error('Invalid fixture');
  const bundle = await createDsl4EmbeddedAssetBundle(
    parsed.storyDocument,
    {
      manifest: {
        formatVersion: 1,
        assets: Object.entries(definitionRecord(parsed.storyDocument.assets))
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([id, entry]) => {
            const asset = definitionRecord(entry);
            return {
              id,
              kind: asset.kind,
              loading: asset.loading,
              ...(asset.target === undefined ? {} : {target: asset.target}),
              ...(asset.bitmapResolution === undefined
                ? {}
                : {bitmapResolution: asset.bitmapResolution}),
              source: {type: 'project', name: asset.name},
            };
          }),
      },
      getFile: () => {
        throw Error('Project assets do not carry a second payload.');
      },
    },
    options,
  );
  const graph = await createEmbeddedYamlSourceGraphRecord({
    entryPath: 'story.k4.yml',
    files: {'story.k4.yml': source},
  });
  const component = await composeGraphComponent(
    {
      source: {sourceId: 'story', displayName: 'story.k4.yml'},
      artifact: {controlProfile: 'production'},
      application: {mode: 'story'},
      assets: bundle,
    },
    graph,
    frontend,
    {project},
  );
  project.extensionStorage = {
    kubohiroyakamishibai4: {components: {kubohiroyakamishibairuntime4: component}},
  };
  installEmbeddedYamlMarker(project, {opcode: dsl4BundledEmbeddedYamlHatOpcode, reference});
  installDsl4EmbeddedYamlRoot(project, {channel: 'bundled'});
  const owner = (p: Record<string, unknown>) =>
    definitionRecord(
      definitionRecord(
        definitionRecord(definitionRecord(p.extensionStorage).kubohiroyakamishibai4).components,
      ).kubohiroyakamishibairuntime4,
    );
  const buildOptions = {
    frontend,
    replaceSource: (p: Record<string, unknown>, id: string, s: string) =>
      replaceGraphDocumentSource(p, id, s, frontend),
  };
  const view = await buildKamishibaiGraphDocumentViewCandidate(
    {project, source, reference, request: {kind: 'schema-blocks', direction: 'from-source'}},
    buildOptions,
  );
  const native = view.project;
  const target = (native.targets as typeof project.targets)[1]!;
  target.costumes = [
    {
      ...target.costumes[0]!,
      bitmapResolution: 2,
      assetId: 'replacement-or-native-normalized-image',
    },
  ];
  const costumes = target.costumes,
    before = JSON.stringify(native);
  const loadOptions = {maxSourceBytes: 1024 * 1024, maxAssetFiles: 8, maxTotalAssetBytes: 4096};
  const loaded = await loadDsl4RuntimeComponent(native, frontend, loadOptions);
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  assert.doesNotThrow(() =>
    assertKamishibaiDocumentSourceReady(native, {sourceFrontend: frontend}),
  );
  assert.equal(JSON.stringify(native), before);
  const {createDsl4BinaryEntryAssetBundle} = await import('../src/dsl4/binary-entry-provider.js');
  const {createDsl4PackagedBinaryRuntimeBridge} =
    await import('../src/dsl4/platform/packaged-binary-runtime.js');
  const {dsl4PackagerEntrySourceRegistryName} =
    await import('../src/dsl4/packager-entry-source.js');
  const binary = await createDsl4BinaryEntryAssetBundle(
    parsed.storyDocument,
    {
      manifest: bundle.manifest,
      getFile: () => {
        throw Error('This fixture has project assets only.');
      },
    },
    {...options, maxFileBytes: 4096},
  );
  const binaryProject = cloneKamishibaiDocumentProject(native);
  owner(binaryProject).assets = binary.descriptor;
  const binaryBefore = JSON.stringify(binaryProject);
  let releases = 0;
  const bridge = await createDsl4PackagedBinaryRuntimeBridge({
    project: binaryProject,
    sourceFrontend: frontend,
    ...loadOptions,
    globalObject: {
      [Symbol.for(dsl4PackagerEntrySourceRegistryName)]: {
        contractVersion: 1,
        claim: () => ({
          contractVersion: 1,
          surface: 'zip',
          archive: {bytes: 0, entryCount: 0, expandedBytes: 0, maxEntryBytes: 0},
          entries: [],
          readEntry: () => {
            throw Error('No file entries expected.');
          },
          release: async () => {
            releases++;
          },
        }),
      },
    },
  });
  assert.ok(bridge);
  assert.equal(
    rows(bridge.binaryEntryProvider.descriptor).find((row) => row.id === id)!.bitmapResolution,
    2,
  );
  assert.equal(rows(owner(binaryProject).assets).find((row) => row.id === id)!.bitmapResolution, 1);
  assert.equal(JSON.stringify(binaryProject), binaryBefore);
  await bridge.binaryEntryProvider.release();
  assert.equal(releases, 1);
  const compiled = cloneKamishibaiDocumentProject(native);
  await convertDsl4ProjectToCompiledProfile(compiled, {
    sourceFrontend: frontend,
    maxSourceBytes: 1024 * 1024,
  });
  const compiledBefore = JSON.stringify(compiled);
  const compiledResult = await loadDsl4RuntimeComponent(compiled, frontend, loadOptions);
  assert.equal(compiledResult.ok, true, JSON.stringify(compiledResult.diagnostics));
  assert.equal(
    rows(definitionRecord(compiledResult).assetBundle).find((row) => row.id === id)!
      .bitmapResolution,
    2,
  );
  const compiledReload = await loadDsl4RuntimeComponent(
    JSON.parse(JSON.stringify(compiled)),
    frontend,
    loadOptions,
  );
  assert.equal(compiledReload.ok, true, JSON.stringify(compiledReload.diagnostics));
  assert.equal(JSON.stringify(compiled), compiledBefore);
  const stored = definitionRecord(owner(compiled).compiled);
  const storedIr = definitionRecord(stored.story);
  const retained = definitionRecord(storedIr.metadata).implicitProjectAssets as string[];
  assert.ok(retained.includes(id));
  for (const mode of ['supplement-cover', 'explicit-without-marker']) {
    const copy = cloneKamishibaiDocumentProject(compiled);
    const ir = structuredClone(storedIr);
    if (mode === 'supplement-cover') {
      delete ir.cover;
      const assets = definitionRecord(ir.assets);
      const coverId = Object.keys(assets).find(
        (key) => definitionRecord(assets[key]).kind === 'backdrop',
      )!;
      delete assets[coverId];
      definitionRecord(ir.metadata).implicitProjectAssets = retained.filter(
        (key) => key !== coverId,
      );
    } else
      definitionRecord(ir.metadata).implicitProjectAssets = retained.filter((key) => key !== id);
    owner(copy).compiled = await createDsl4CompiledStoryArtifact(ir, {
      sourceIntegrity: String(stored.sourceIntegrity),
    });
    const copyBefore = JSON.stringify(copy);
    const result = await loadDsl4RuntimeComponent(copy, frontend, loadOptions);
    assert.equal(result.ok, mode === 'supplement-cover', JSON.stringify(result.diagnostics));
    if (!result.ok) assert.equal(result.diagnostics[0]!.code, 'K4-ASSET-BUNDLE-MANIFEST-001');
    assert.equal(JSON.stringify(copy), copyBefore);
  }
  const blocks = (native.targets as typeof project.targets)[0]!.blocks;
  const wait = Object.values(blocks).find((block) => String(block.opcode).endsWith('_wait'))!;
  wait.inputs = {SECONDS: [1, [4, 2.75]]};
  const dirtyBefore = JSON.stringify(native);
  const saved = await buildKamishibaiGraphDocumentPreviewArtifact(
    {project: native, source, reference, kind: 'schema-blocks'},
    buildOptions,
  );
  assert.ok(saved.candidate);
  assert.match(saved.preview.source, /wait: 2.75/);
  assert.equal(rows(owner(native).assets).find((row) => row.id === id)!.bitmapResolution, 1);
  assert.equal(
    rows(owner(saved.candidate.project).assets).find((row) => row.id === id)!.bitmapResolution,
    1,
  );
  assert.equal(owner(saved.candidate.project).assets, owner(native).assets);
  assert.equal((saved.candidate.project.targets as typeof project.targets)[1]!.costumes, costumes);
  assert.equal(costumes[0]!.assetId, 'replacement-or-native-normalized-image');
  assert.equal(JSON.stringify(native), dirtyBefore);
  assert.doesNotThrow(() =>
    assertKamishibaiDocumentSourceReady(saved.candidate!.project, {sourceFrontend: frontend}),
  );
  const checked = await loadDsl4RuntimeComponent(saved.candidate.project, frontend, loadOptions);
  assert.equal(checked.ok, true, JSON.stringify(checked.diagnostics));
  assert.equal(
    rows(definitionRecord(checked).assetBundle).find((row) => row.id === id)!.bitmapResolution,
    2,
  );
  const reload = await loadDsl4RuntimeComponent(
    JSON.parse(JSON.stringify(saved.candidate.project)),
    frontend,
    loadOptions,
  );
  assert.equal(reload.ok, true, JSON.stringify(reload.diagnostics));
  assert.equal(
    rows(definitionRecord(reload).assetBundle).find((row) => row.id === id)!.bitmapResolution,
    2,
  );
});
