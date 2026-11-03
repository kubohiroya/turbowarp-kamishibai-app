import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {encodeReference} from '@kubohiroya/turbowarp-document-source';
import {createEmbeddedYamlMarker} from '@kubohiroya/turbowarp-document-data/document-source';
import {installDsl4EmbeddedYamlRoot} from '../src/dsl4/embedded-yaml-hat.js';
import {
  dsl4BundledEmbeddedYamlHatOpcode,
  dsl4BundledEmbeddedYamlRootOpcode,
} from '../src/dsl4/embedded-yaml-identity.js';
import {test} from 'vitest';
import schema from '../schema/dsl-4.schema.json' with {type: 'json'};
import {createDsl4ProductionSourceFrontend} from '../src/builder/dsl4-source-frontend.js';
import {createDsl4EmbeddedSourceDescriptor} from '../src/dsl4/source-descriptor.js';
import {
  createDsl4RuntimeArtifactDescriptor,
  type RuntimeArtifactSuccess,
} from '../src/dsl4/runtime-artifact-descriptor.js';
import {createDsl4EmbeddedAssetBundle} from '../src/dsl4/asset-bundle-descriptor.js';
import {replaceGraphDocumentSource} from '../src/dsl4/embedded-yaml-graph-provider.js';
import {createKamishibaiEmbeddedYamlProvider} from '../src/dsl4/embedded-yaml-provider.js';
import {
  readEmbeddedYamlSourceGraphRecord,
  createEmbeddedYamlSourceGraphRecord,
  composeGraphComponent,
  validateGraphComponentProjection,
} from '../src/dsl4/embedded-yaml-source-graph.js';
import {validateValueWithJsonSchema} from '@kubohiroya/turbowarp-yaml-json/schema';
import {parseValue} from '@kubohiroya/turbowarp-yaml-json/codec';
import {getSourceDocumentRegistry} from '@kubohiroya/turbowarp-document-data/composition';
import {assertKamishibaiDocumentSourceReady} from '../src/dsl4/embedded-yaml-view-state.js';

interface SerializedBlock extends Record<string, unknown> {
  opcode: string;
  next: string | null;
  parent: string | null;
  inputs: Record<string, unknown[]>;
  fields: Record<string, unknown[]>;
  topLevel: boolean;
  shadow?: boolean;
}
interface SerializedTarget extends Record<string, unknown> {
  isStage: boolean;
  name?: string;
  blocks: Record<string, SerializedBlock>;
  comments?: Record<string, unknown>;
}
interface SerializedProject extends Record<string, unknown> {
  targets: SerializedTarget[];
  extensionStorage: Record<string, unknown>;
}
interface NativeField {
  name: string;
  value: unknown;
  id?: unknown;
}
interface NativeInput {
  name: string;
  block: string | null;
  shadow: string | null;
}
interface NativeBlock extends Record<string, unknown> {
  id: string;
  opcode: string;
  next: string | null;
  parent: string | null;
  topLevel: boolean;
  shadow?: boolean;
  fields: Record<string, NativeField>;
  inputs: Record<string, NativeInput>;
}
interface NativeBlockContainer {
  _blocks: Record<string, NativeBlock>;
  getBlock(id: string | null): NativeBlock | undefined;
  createBlock(block: NativeBlock): void;
  deleteBlock(id: string): void;
  resetCache(): void;
}
interface NativeTarget extends Record<string, unknown> {
  id: string;
  isStage: boolean;
  name?: string;
  isOriginal: boolean;
  blocks: NativeBlockContainer;
  comments: Record<string, unknown>;
  costumes: Array<{asset: Uint8Array}>;
}
interface NativeRuntime extends EventEmitter {
  targets: NativeTarget[];
  extensionStorage: Record<string, unknown>;
  emitProjectChanged(): void;
}
const require = createRequire(import.meta.url);
const NativeBlocks = require('scratch-vm/src/engine/blocks') as new (
  runtime: NativeRuntime,
) => NativeBlockContainer;
const {serializeBlocks, deserializeBlocks} = require('scratch-vm/src/serialization/sb3') as {
  serializeBlocks(
    blocks: Record<string, NativeBlock>,
  ): [Record<string, SerializedBlock>, Set<string>];
  deserializeBlocks(blocks: Record<string, SerializedBlock>): Record<string, NativeBlock>;
};
function nativeTargets(project: SerializedProject, runtime: NativeRuntime): NativeTarget[] {
  return project.targets.map((serialized, index) => {
    const target: NativeTarget = {
      ...serialized,
      id: 'target-' + index,
      isOriginal: true,
      comments: serialized.comments || {},
      blocks: new NativeBlocks(runtime),
      costumes: [],
    };
    for (const block of Object.values(deserializeBlocks(structuredClone(serialized.blocks))))
      target.blocks.createBlock(block);
    return target;
  });
}
function serializeTargets(targets: NativeTarget[]): SerializedTarget[] {
  return targets.map((target) => ({
    ...target,
    blocks: serializeBlocks(target.blocks._blocks)[0],
    comments: target.comments,
  }));
}
function editLiteral(
  blocks: NativeBlockContainer,
  block: NativeBlock,
  input: string,
  value: string | number,
) {
  const connection = block.inputs[input];
  assert.ok(connection);
  const shadow = blocks.getBlock(connection.block);
  assert.ok(shadow);
  const field = Object.values(shadow.fields)[0];
  assert.ok(field);
  field.value = value;
  blocks.resetCache();
}

const entryPath = 'stories/main.k4.yml';
const files = {
  'stories/main.k4.yml':
    '\uFEFF# Exact entry\r\nkamishibai: "4.0"\r\ninclude:\r\n  - chapters/opening.k4.yml\r\n  - other/opening.k4.yml\r\ncontrols:\r\n  keymaps:\r\n    production:\r\n      Space: navigation.nextAction\r\n',
  'stories/chapters/opening.k4.yml':
    '# Exact chapter\r\nscenes:\r\n  opening:\r\n    - wait: 1\r\n',
  'stories/other/opening.k4.yml':
    '# Same basename, distinct module\nscenes:\n  ending:\n    - wait: 4\n',
};
async function fixture(extraFiles: Record<string, string> = {}) {
  const counts = {stop: 0, save: 0, load: 0, extensionLoads: 0};
  const frontend = createDsl4ProductionSourceFrontend(schema),
    raw =
      "kamishibai: '4.0'\ncontrols:\n  keymaps:\n    production:\n      Space: navigation.nextAction\nscenes:\n  opening:\n    - wait: 1\n";
  const parsed = frontend.parse(raw);
  assert.ok(parsed.ok);
  const source = await createDsl4EmbeddedSourceDescriptor(raw, {
    sourceId: 'main',
    displayName: 'story.k4.yml',
    maxSourceBytes: 4096,
  });
  const artifact = await createDsl4RuntimeArtifactDescriptor(
    parsed.storyDocument,
    source,
    'production',
    {maxSourceBytes: 4096},
  );
  assert.ok(artifact.ok);
  const assets = await createDsl4EmbeddedAssetBundle(
    parsed.storyDocument,
    {
      manifest: {formatVersion: 1, assets: []},
      getFile: () => new Uint8Array(),
    },
    {maxFiles: 10, maxTotalBytes: 4096},
  );
  const project: SerializedProject = {
    targets: [{isStage: true, blocks: {}, isOriginal: true}],
    extensionStorage: {
      kubohiroyakamishibai4: {
        components: {
          kubohiroyakamishibairuntime4: {
            source,
            artifact: (artifact as unknown as RuntimeArtifactSuccess).artifact,
            assets,
            application: {mode: 'story'},
          },
        },
      },
    },
  };
  const storage = project.extensionStorage as {
    kubohiroyakamishibai4: {
      components: {kubohiroyakamishibairuntime4: Record<string, unknown>};
    };
  };
  const graph = await createEmbeddedYamlSourceGraphRecord({
    entryPath,
    files: {...files, ...extraFiles},
  });
  storage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4 =
    await composeGraphComponent(
      storage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4,
      graph,
      frontend,
      {project},
    );
  const stage = (project.targets as {blocks: Record<string, unknown>}[])[0]!;
  Object.keys(graph.files).forEach((path, index) => {
    stage.blocks[`file${index}`] = createEmbeddedYamlMarker({
      opcode: dsl4BundledEmbeddedYamlHatOpcode,
      reference: {providerId: 'kamishibai-dsl4', documentId: `file:${path}`},
      x: 32,
      y: 32 + index * 160,
    });
  });
  installDsl4EmbeddedYamlRoot(project, {channel: 'bundled'});
  const runtime: NativeRuntime = Object.assign(new EventEmitter(), {
    targets: [] as NativeTarget[],
    extensionStorage: project.extensionStorage as Record<string, unknown>,
    getOpcodeFunction: () => () => false,
    emitProjectChanged() {
      runtime.emit('PROJECT_CHANGED');
    },
  });
  runtime.targets = nativeTargets(project, runtime);
  const vm = {
    runtime,
    toJSON() {
      return JSON.stringify({
        ...project,
        targets: serializeTargets(runtime.targets),
        extensionStorage: runtime.extensionStorage,
      });
    },
    stopAll() {
      counts.stop++;
    },
    async saveProjectSb3() {
      counts.save++;
      throw Error('Representation Save must not zip the project');
    },
    async loadProject(_bytes: Uint8Array) {
      counts.load++;
      throw Error('Representation Save must not reload the project');
    },
    extensionManager: {
      isExtensionLoaded: () => true,
      loadExtensionURL: async () => {
        counts.extensionLoads++;
        throw Error('The fixture extensions are preloaded');
      },
    },
  };
  const component = () =>
    (runtime.extensionStorage as typeof storage).kubohiroyakamishibai4.components
      .kubohiroyakamishibairuntime4;
  return {
    vm,
    runtime,
    frontend,
    component,
    counts,
    nativeTargets: (value: SerializedProject) => nativeTargets(value, runtime),
  };
}
test('raw graph modules retain exact files and update the derived artifact atomically after validating the whole graph', async () => {
  const f = await fixture(),
    provider = createKamishibaiEmbeddedYamlProvider(f.vm, {
      documentViewsEnabled: false,
    });
  const metadata = provider.list();
  assert.deepEqual(
    metadata.map((item) => item.documentId),
    [
      'file:stories/main.k4.yml',
      'file:stories/chapters/opening.k4.yml',
      'file:stories/other/opening.k4.yml',
    ],
  );
  assert.deepEqual(
    metadata.map((item) => item.filename),
    Object.keys(files),
  );
  for (const item of metadata) {
    const captured = provider.open(item.documentId).capture();
    assert.equal(captured.source, files[item.filename as keyof typeof files]);
    assert.equal(captured.sourceName, item.filename.split('/').at(-1));
    const value = parseValue(captured.source, 'yaml');
    assert.ok(value.success);
    const validation = validateValueWithJsonSchema(item.schema!.schema, value.value, {
      dialect: '2020-12',
    });
    assert.equal(
      validation.valid,
      true,
      JSON.stringify({filename: item.filename, errors: validation.errors}),
    );
  }
  const adapter = provider.open('file:stories/chapters/opening.k4.yml'),
    snapshot = adapter.capture(),
    before = f.vm.toJSON(),
    old = structuredClone(f.component());
  const next = files['stories/chapters/opening.k4.yml'].replace('wait: 1', 'wait: 2');
  const prepared = await adapter.prepare(snapshot, next);
  assert.equal(f.vm.toJSON(), before);
  await adapter.commit(snapshot, prepared);
  const current = f.component(),
    graph = current.sourceDocuments as {
      files: Record<string, {source: string}>;
    };
  assert.equal(graph.files['stories/chapters/opening.k4.yml']!.source, next);
  assert.equal(graph.files[entryPath]!.source, files[entryPath]);
  assert.equal(
    graph.files['stories/other/opening.k4.yml']!.source,
    files['stories/other/opening.k4.yml'],
  );
  assert.deepEqual(current.assets, old.assets);
  assert.notEqual(
    (current.source as {integrity: string}).integrity,
    (old.source as {integrity: string}).integrity,
  );
  assert.equal(
    (current.source as {integrity: string}).integrity,
    (current.artifact as {sourceIntegrity: string}).sourceIntegrity,
  );
  await validateGraphComponentProjection(current, f.frontend, {
    project: JSON.parse(f.vm.toJSON()),
  });
  provider.dispose?.();
});
test('invalid modules, stale project edits, forged candidates and unknown file IDs do not mutate source storage', async () => {
  const f = await fixture(),
    provider = createKamishibaiEmbeddedYamlProvider(f.vm, {
      documentViewsEnabled: false,
    }),
    adapter = provider.open('file:stories/chapters/opening.k4.yml'),
    snapshot = adapter.capture();
  const before = f.vm.toJSON();
  await assert.rejects(
    adapter.prepare(snapshot, 'scenes:\n  opening:\n    - definitelyUnknown: true\n'),
  );
  assert.equal(f.vm.toJSON(), before);
  await assert.rejects(adapter.commit(snapshot, {source: 'forged'}));
  assert.equal(f.vm.toJSON(), before);
  assert.throws(() => provider.open('file:stories/missing.yml'));
  assert.throws(() => provider.open('file:stories/../main.k4.yml'));
  const prepared = await adapter.prepare(snapshot, snapshot.source.replace('wait: 1', 'wait: 3'));
  f.runtime.targets.push({...f.runtime.targets[0]!, id: 'additional-target'});
  const edited = f.vm.toJSON();
  await assert.rejects(adapter.commit(snapshot, prepared), /changed/i);
  assert.equal(f.vm.toJSON(), edited);
  provider.dispose?.();
});
test('cached provider survives same-VM project reset, invalidates old sessions and keeps duplicate basenames unambiguous', async () => {
  const f = await fixture(),
    provider = createKamishibaiEmbeddedYamlProvider(f.vm, {
      documentViewsEnabled: false,
    }),
    old = provider.open('file:stories/other/opening.k4.yml'),
    snapshot = old.capture();
  const storage = structuredClone(f.runtime.extensionStorage),
    targets = f.nativeTargets(JSON.parse(f.vm.toJSON()));
  f.runtime.emit('RUNTIME_DISPOSED');
  f.runtime.extensionStorage = {};
  f.runtime.extensionStorage = storage;
  f.runtime.targets = targets;
  f.runtime.emit('PROJECT_LOADED');
  assert.equal(provider.list().length, 3);
  await assert.rejects(old.prepare(snapshot, snapshot.source), /changed/i);
  const fresh = provider.open('file:stories/other/opening.k4.yml'),
    next = fresh.capture();
  assert.equal(next.sourceName, 'opening.k4.yml');
  assert.equal(next.source, files['stories/other/opening.k4.yml']);
  await fresh.commit(next, await fresh.prepare(next, next.source.replace('wait: 4', 'wait: 5')));
  assert.equal(
    provider.open('file:stories/chapters/opening.k4.yml').capture().source,
    files['stories/chapters/opening.k4.yml'],
  );
  provider.dispose?.();
  assert.equal(f.runtime.listenerCount('RUNTIME_DISPOSED'), 0);
  assert.equal(f.runtime.listenerCount('PROJECT_LOADED'), 0);
});

test('removing an include preserves the unused raw file, which remains editable and can be re-included', async () => {
  const f = await fixture(),
    provider = createKamishibaiEmbeddedYamlProvider(f.vm, {
      documentViewsEnabled: false,
    });
  const entry = provider.open('file:stories/main.k4.yml'),
    snapshot = entry.capture();
  const withoutChapter = snapshot.source.replace('  - chapters/opening.k4.yml\r\n', '');
  await entry.commit(snapshot, await entry.prepare(snapshot, withoutChapter));
  assert.equal(provider.list().length, 3);
  const module = provider.open('file:stories/chapters/opening.k4.yml'),
    raw = module.capture(),
    beforeDerived = structuredClone(f.component().source),
    beforeArtifact = structuredClone(f.component().artifact);
  assert.equal(raw.source, files['stories/chapters/opening.k4.yml']);
  const edited = raw.source.replace('wait: 1', 'wait: 7');
  await module.commit(raw, await module.prepare(raw, edited));
  assert.deepEqual(f.component().source, beforeDerived);
  assert.deepEqual(f.component().artifact, beforeArtifact);
  assert.equal(provider.open('file:stories/chapters/opening.k4.yml').capture().source, edited);
  const back = provider.open('file:stories/main.k4.yml'),
    current = back.capture();
  await back.commit(current, await back.prepare(current, snapshot.source));
  await validateGraphComponentProjection(f.component(), f.frontend, {
    project: JSON.parse(f.vm.toJSON()),
  });
  assert.equal(provider.open('file:stories/chapters/opening.k4.yml').capture().source, edited);
  provider.dispose?.();
});

test('an active view protects its own raw file while another document remains editable without losing blocks', async () => {
  const f = await fixture(),
    provider = createKamishibaiEmbeddedYamlProvider(f.vm, {
      documentViewsEnabled: true,
    });
  const originalTarget = f.runtime.targets[0]!,
    originalBlocks = originalTarget.blocks,
    originalStorage = f.runtime.extensionStorage,
    originalAssets = f.component().assets,
    entryHat = originalBlocks.getBlock('file0');
  let module = provider.open('file:stories/chapters/opening.k4.yml'),
    snapshot = module.capture();
  await module.commitRepresentation!(
    snapshot,
    await module.prepareRepresentation!(snapshot, {
      kind: 'yaml-blocks',
      direction: 'from-source',
    }),
  );
  module.dispose();
  assert.equal(
    provider.list().find((item) => item.documentId === 'file:stories/chapters/opening.k4.yml')
      ?.activeRepresentation,
    'yaml-blocks',
  );
  const before = f.vm.toJSON(),
    other = provider.open('file:stories/other/opening.k4.yml'),
    otherSnapshot = other.capture();
  const editedOther = await other.prepare(
    otherSnapshot,
    otherSnapshot.source.replace('wait: 4', 'wait: 5'),
  );
  assert.equal(f.vm.toJSON(), before);
  await other.commit(otherSnapshot, editedOther);
  const afterOther = f.vm.toJSON();
  module = provider.open('file:stories/chapters/opening.k4.yml');
  snapshot = module.capture();
  await assert.rejects(module.prepare(snapshot, snapshot.source), /this document block view/i);
  assert.equal(f.vm.toJSON(), afterOther);
  other.dispose();
  await module.commitRepresentation!(
    snapshot,
    await module.prepareRepresentation!(snapshot, {
      kind: 'yaml-blocks',
      direction: 'to-source',
    }),
  );
  module.dispose();
  assert.equal(f.runtime.targets[0]!, originalTarget);
  assert.equal(originalTarget.blocks, originalBlocks);
  assert.equal(originalBlocks.getBlock('file0'), entryHat);
  assert.equal(f.runtime.extensionStorage, originalStorage);
  assert.equal(f.component().assets, originalAssets);
  assert.deepEqual(f.counts, {stop: 0, save: 0, load: 0, extensionLoads: 0});
  const fresh = provider.open('file:stories/other/opening.k4.yml'),
    latest = fresh.capture();
  await fresh.commit(
    latest,
    await fresh.prepare(latest, latest.source.replace('wait: 4', 'wait: 5')),
  );
  fresh.dispose();
  const entryRead = provider.open('file:stories/main.k4.yml');
  assert.equal(entryRead.capture().source, files[entryPath]);
  entryRead.dispose();
  assert.equal(
    provider.open('file:stories/chapters/opening.k4.yml').capture().source,
    files['stories/chapters/opening.k4.yml'],
  );
  provider.dispose?.();
});

const alternatePath = 'stories/alternate.k4.yml';
const alternateSource =
  "# Alternate entry\nkamishibai: '4.0'\ncontrols:\n  keymaps:\n    production:\n      Space: navigation.nextAction\nscenes:\n  alternate:\n    - wait: 9\n";
function chooseRoot(f: Awaited<ReturnType<typeof fixture>>, path: string) {
  const blocks = f.runtime.targets[0]! as unknown as {
    blocks: {
      _blocks: Record<string, {opcode: string; fields: Record<string, unknown>}>;
    };
  };
  const root = Object.values(blocks.blocks._blocks).find(
    (block) => block.opcode === dsl4BundledEmbeddedYamlRootOpcode,
  )!;
  root.fields.DOCUMENT = {
    name: 'DOCUMENT',
    value: encodeReference({
      providerId: 'kamishibai-dsl4',
      documentId: `file:${path}`,
    }),
  };
}
test('saving unchanged raw source synchronizes the explicit root entry and artifact atomically while preserving every file and stable ID', async () => {
  const f = await fixture({[alternatePath]: alternateSource}),
    provider = createKamishibaiEmbeddedYamlProvider(f.vm, {
      documentViewsEnabled: false,
    });
  const beforeIds = provider
    .list()
    .map((item) => item.documentId)
    .sort();
  const previous = structuredClone(f.component());
  chooseRoot(f, alternatePath);
  const adapter = provider.open(`file:${alternatePath}`),
    snapshot = adapter.capture(),
    before = f.vm.toJSON();
  const prepared = await adapter.prepare(snapshot, snapshot.source);
  assert.equal(prepared.source, snapshot.source);
  assert.match(String((prepared as {source: string; summary?: string}).summary), /main.*alternate/);
  assert.equal(f.vm.toJSON(), before);
  await adapter.commit(snapshot, prepared);
  const current = f.component(),
    graph = current.sourceDocuments as {
      entryPath: string;
      files: Record<string, {source: string}>;
    };
  assert.equal(graph.entryPath, alternatePath);
  assert.deepEqual(
    Object.fromEntries(Object.entries(graph.files).map(([path, file]) => [path, file.source])),
    {...files, [alternatePath]: alternateSource},
  );
  assert.deepEqual(
    provider
      .list()
      .map((item) => item.documentId)
      .sort(),
    beforeIds,
  );
  assert.deepEqual(current.assets, previous.assets);
  assert.notEqual(
    (current.source as {integrity: string}).integrity,
    (previous.source as {integrity: string}).integrity,
  );
  assert.equal(
    (current.source as {integrity: string}).integrity,
    (current.artifact as {sourceIntegrity: string}).sourceIntegrity,
  );
  await validateGraphComponentProjection(current, f.frontend, {
    project: JSON.parse(f.vm.toJSON()),
  });
  provider.dispose?.();
});
test('partial or invalid root selections and stale prepared entry changes preserve raw files, projection and live edits', async () => {
  for (const [selected, extra] of [
    ['stories/chapters/opening.k4.yml', {}],
    [
      alternatePath,
      {
        [alternatePath]: alternateSource.replace('wait: 9', 'unknownAction: true'),
      },
    ],
  ] as const) {
    const f = await fixture(extra),
      provider = createKamishibaiEmbeddedYamlProvider(f.vm, {
        documentViewsEnabled: false,
      });
    chooseRoot(f, selected);
    const adapter = provider.open(`file:${selected}`),
      snapshot = adapter.capture(),
      before = f.vm.toJSON();
    await assert.rejects(adapter.prepare(snapshot, snapshot.source));
    assert.equal(f.vm.toJSON(), before);
    provider.dispose?.();
  }
  const f = await fixture({[alternatePath]: alternateSource}),
    provider = createKamishibaiEmbeddedYamlProvider(f.vm, {
      documentViewsEnabled: false,
    });
  chooseRoot(f, alternatePath);
  const adapter = provider.open(`file:${alternatePath}`),
    snapshot = adapter.capture(),
    prepared = await adapter.prepare(snapshot, snapshot.source);
  f.runtime.targets.push({...f.runtime.targets[0]!, id: 'additional-target'});
  const before = f.vm.toJSON();
  await assert.rejects(adapter.commit(snapshot, prepared), /changed/i);
  assert.equal(f.vm.toJSON(), before);
  provider.dispose?.();
});

test('changing the root while any block document is active is rejected before source graph replacement', async () => {
  const f = await fixture({[alternatePath]: alternateSource}),
    provider = createKamishibaiEmbeddedYamlProvider(f.vm, {
      documentViewsEnabled: true,
    });
  const adapter = provider.open(`file:${alternatePath}`),
    snapshot = adapter.capture();
  await adapter.commitRepresentation!(
    snapshot,
    await adapter.prepareRepresentation!(snapshot, {
      kind: 'yaml-blocks',
      direction: 'from-source',
    }),
  );
  adapter.dispose();
  chooseRoot(f, alternatePath);
  const before = f.vm.toJSON(),
    project = JSON.parse(before) as Record<string, unknown>;
  await assert.rejects(
    replaceGraphDocumentSource(project, `file:${alternatePath}`, alternateSource, f.frontend),
    /active block|Reflect/i,
  );
  assert.equal(JSON.stringify(project), before);
  assert.equal(f.vm.toJSON(), before);
  provider.dispose?.();
});

test('several module block views remain editable and save independently through the public provider', async () => {
  const f = await fixture(),
    provider = createKamishibaiEmbeddedYamlProvider(f.vm, {
      documentViewsEnabled: true,
    });
  const ids = ['file:stories/chapters/opening.k4.yml', 'file:stories/other/opening.k4.yml'];
  const target = f.runtime.targets[0]!,
    assets = f.component().assets;
  for (const id of ids) {
    const adapter = provider.open(id),
      snapshot = adapter.capture();
    await adapter.commitRepresentation!(
      snapshot,
      await adapter.prepareRepresentation!(snapshot, {
        kind: 'schema-blocks',
        direction: 'from-source',
      }),
    );
    adapter.dispose();
  }
  for (const [index, id] of ids.entries()) {
    const adapter = provider.open(id),
      snapshot = adapter.capture(),
      model = await adapter.previewRepresentation!(snapshot, {
        kind: 'schema-blocks',
      });
    const waitId = Object.entries(model.blocks!).find(([, block]) =>
      String(block.opcode).endsWith('_wait'),
    )![0];
    editLiteral(target.blocks, target.blocks.getBlock(waitId)!, 'SECONDS', index + 6);
    adapter.dispose();
  }
  const otherBefore = JSON.stringify(target.blocks._blocks),
    originalFiles = readEmbeddedYamlSourceGraphRecord(f.component().sourceDocuments).files;
  let first = provider.open(ids[0]!);
  const snapshot = first.capture();
  const staleSnapshot = snapshot;
  const candidate = await first.prepareRepresentation!(snapshot, {
    kind: 'schema-blocks',
    direction: 'to-source',
  });
  assert.equal(JSON.stringify(target.blocks._blocks), otherBefore);
  await first.commitRepresentation!(snapshot, candidate);
  first.dispose();
  assert.equal(
    provider.list().find((item) => item.documentId === ids[1])?.activeRepresentation,
    'schema-blocks',
  );
  const second = provider.open(ids[1]!),
    secondSnapshot = second.capture();
  assert.equal(
    (await second.previewRepresentation!(secondSnapshot, {kind: 'source'})).source.includes(
      'wait: 7',
    ),
    true,
  );
  await second.commitRepresentation!(
    secondSnapshot,
    await second.prepareRepresentation!(secondSnapshot, {
      kind: 'schema-blocks',
      direction: 'to-source',
    }),
  );
  second.dispose();
  assert.equal(provider.open(ids[0]!).capture().source.includes('wait: 6'), true);
  assert.equal(provider.open(ids[1]!).capture().source.includes('wait: 7'), true);
  assert.equal(
    readEmbeddedYamlSourceGraphRecord(f.component().sourceDocuments).files[entryPath]!.source,
    originalFiles[entryPath]!.source,
  );
  first = provider.open(ids[0]!);
  await assert.rejects(first.prepare(staleSnapshot, staleSnapshot.source), /session|open|changed/i);
  assert.equal(f.runtime.targets[0]!, target);
  assert.equal(f.component().assets, assets);
  assert.deepEqual(f.counts, {stop: 0, save: 0, load: 0, extensionLoads: 0});
  first.dispose();
  provider.dispose?.();
});

for (const kind of ['yaml-blocks', 'schema-blocks']) {
  test(`same-format ${kind} Save reflects module values and comments through its cached owner preview`, async () => {
    const f = await fixture();
    let parses = 0;
    const frontend = {
      ...f.frontend,
      parse: (...args: Parameters<typeof f.frontend.parse>) => {
        parses++;
        return f.frontend.parse(...args);
      },
    };
    const provider = createKamishibaiEmbeddedYamlProvider(f.vm, {
      documentViewsEnabled: true,
      sourceFrontend: frontend,
    });
    const path = 'stories/chapters/opening.k4.yml',
      documentId = 'file:' + path;
    const registry = getSourceDocumentRegistry(f.vm);
    const unregister = registry.register(provider);
    const open = () => registry.open({providerId: 'kamishibai-dsl4', documentId});
    let adapter = open(),
      snapshot = adapter.capture();
    await adapter.commitRepresentation!(
      snapshot,
      await adapter.prepareRepresentation!(snapshot, {kind, direction: 'from-source'}),
    );
    adapter.dispose();
    const target = f.runtime.targets[0]!,
      blocks = Object.values(target.blocks._blocks);
    const value = blocks.find((block) =>
      kind === 'yaml-blocks'
        ? block.opcode.endsWith('_yamlScalar') && block.fields.TYPE?.value === 'number'
        : block.opcode.endsWith('_wait'),
    );
    const comment = blocks.find((block) => block.opcode.endsWith('_yamlLineComment'));
    assert.ok(value);
    assert.ok(comment);
    editLiteral(
      target.blocks,
      value,
      kind === 'yaml-blocks' ? 'VALUE' : 'SECONDS',
      kind === 'yaml-blocks' ? '6' : 6,
    );
    editLiteral(target.blocks, comment, 'TEXT', ' Edited chapter');
    assert.throws(
      () =>
        assertKamishibaiDocumentSourceReady(JSON.parse(f.vm.toJSON()) as Record<string, unknown>),
      /Reflect/,
    );
    const assets = f.component().assets;
    adapter = open();
    snapshot = adapter.capture();
    const before = f.vm.toJSON();
    const displayed = await adapter.previewRepresentation!(snapshot, {kind});
    assert.match(displayed.source, /wait: 6/);
    assert.match(displayed.source, /# Edited chapter/);
    assert.equal(f.vm.toJSON(), before);
    const parsedForPreview = parses;
    const candidate = await adapter.prepareRepresentation!(snapshot, {
      kind,
      direction: 'from-source',
    });
    assert.equal(
      parses,
      parsedForPreview,
      'Use the displayed module candidate without rebuilding.',
    );
    await adapter.commitRepresentation!(snapshot, candidate);
    assert.equal(parses, parsedForPreview);
    assert.equal(
      provider.list().find((item) => item.documentId === documentId)!.activeRepresentation,
      kind,
    );
    const record = readEmbeddedYamlSourceGraphRecord(f.component().sourceDocuments);
    assert.equal(record.files[path]!.source, displayed.source);
    for (const [other, original] of Object.entries(files))
      if (other !== path) assert.equal(record.files[other]!.source, original);
    assert.equal(f.component().assets, assets);
    assert.doesNotThrow(() =>
      assertKamishibaiDocumentSourceReady(JSON.parse(f.vm.toJSON()) as Record<string, unknown>),
    );
    assert.deepEqual(f.counts, {stop: 0, save: 0, load: 0, extensionLoads: 0});
    adapter.dispose();
    unregister();
    provider.dispose?.();
  });
}
