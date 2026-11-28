import {dsl4AuthoringBlockName} from '../src/dsl4/block-source-shared.js';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'vitest';
import schema from '../schema/dsl-4.schema.json' with {type: 'json'};
import {createDsl4ProductionSourceFrontend} from '../src/builder/dsl4-source-frontend.js';
import {createDsl4EmbeddedSourceDescriptor} from '../src/dsl4/source-descriptor.js';
import {createDsl4RuntimeArtifactDescriptor} from '../src/dsl4/runtime-artifact-descriptor.js';
import {createDsl4EmbeddedAssetBundle} from '../src/dsl4/asset-bundle-descriptor.js';
import {createKamishibaiEmbeddedYamlProvider} from '../src/dsl4/embedded-yaml-provider.js';
import {installDsl4EmbeddedYamlHat} from '../src/dsl4/embedded-yaml-hat.js';
import {getSourceDocumentRegistry} from '@kubohiroya/turbowarp-document-data/composition';
import {buildKamishibaiDocumentPreviewArtifact} from '../src/dsl4/embedded-yaml-project-views.js';
import {serializeDsl4CanonicalDocument} from '../src/dsl4/canonical-document.js';
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

interface FixtureComponent extends Record<string, unknown> {
  source: {text: string};
  assets: unknown;
  editorViews?: {
    views: Record<
      string,
      {descriptors: Record<string, {baseSourceRevision: string; opcodes: Record<string, string>}>}
    >;
  };
}
interface FixtureStorage extends Record<string, unknown> {
  kubohiroyakamishibai4: {components: {kubohiroyakamishibairuntime4: FixtureComponent}};
}
interface FixtureProject extends SerializedProject {
  extensionStorage: FixtureStorage;
}

const source =
  "# raw comment\nkamishibai: '4.0'\ncontrols:\n  keymaps:\n    production:\n      Space: navigation.nextAction\nscenes:\n  opening:\n    - wait: 1\n";
const limits = {
  maxSourceBytes: 4096,
  maxAssetFiles: 10,
  maxTotalAssetBytes: 4096,
};
async function fixture() {
  const counts = {stop: 0, save: 0, load: 0, extensionLoads: 0};
  const frontend = createDsl4ProductionSourceFrontend(schema);
  const parsed = frontend.parse(source, {sourceId: 'story'});
  assert.ok(parsed.ok);
  const descriptor = await createDsl4EmbeddedSourceDescriptor(source, {
    sourceId: 'story',
    displayName: 'story.k4.yml',
    maxSourceBytes: 4096,
  });
  const artifact = await createDsl4RuntimeArtifactDescriptor(
    parsed.storyDocument,
    descriptor,
    'production',
    limits,
  );
  assert.ok(artifact.ok);
  assert.ok('artifact' in artifact);
  const assets = await createDsl4EmbeddedAssetBundle(
    parsed.storyDocument,
    {
      manifest: {formatVersion: 1, assets: []},
      getFile: () => new Uint8Array(),
    },
    {maxFiles: 10, maxTotalBytes: 4096},
  );
  const project: FixtureProject = {
    targets: [
      {
        isStage: true,
        name: 'Stage',
        blocks: {
          start: {
            opcode: 'event_whenflagclicked',
            next: null,
            parent: null,
            topLevel: true,
            x: 200,
            y: 200,
            inputs: {},
            fields: {},
            shadow: false,
          },
        },
      },
    ],
    extensions: ['kubohiroyakamishibai4', 'kubohiroyakamishibaiauthoring4'],
    extensionURLs: {kubohiroyakamishibai4: 'data:original'},
    extensionStorage: {
      kubohiroyakamishibai4: {
        components: {
          kubohiroyakamishibairuntime4: {
            source: descriptor,
            artifact: artifact.artifact,
            assets,
            application: {mode: 'story'},
          },
        },
      },
    },
  };
  installDsl4EmbeddedYamlHat(project, {channel: 'bundled'});
  const runtime: NativeRuntime & {extensionStorage: FixtureStorage} = Object.assign(
    new EventEmitter(),
    {
      targets: [] as NativeTarget[],
      extensionStorage: project.extensionStorage,
      getOpcodeFunction: () => () => false,
      emitProjectChanged() {
        runtime.emit('PROJECT_CHANGED');
      },
    },
  );
  runtime.targets = nativeTargets(project, runtime);
  const asset = new Uint8Array([1, 2, 3]);
  runtime.targets[0]!.costumes = [{asset}];
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
      throw Error('Representation Save must not stop the project');
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
  return {
    vm,
    counts,
    asset,
    get project() {
      return JSON.parse(vm.toJSON()) as FixtureProject;
    },
    frontend,
  };
}
test('source/common/source/schema/source transactions keep raw text, assets and cached provider usable across minimal live patches', async () => {
  const f = await fixture();
  const provider = createKamishibaiEmbeddedYamlProvider(f.vm, {
    documentViewsEnabled: true,
  });
  const targetIdentity = f.vm.runtime.targets[0]!,
    unrelatedIdentity = targetIdentity.blocks.getBlock('start'),
    costumeIdentity = targetIdentity.costumes,
    storageIdentity = f.vm.runtime.extensionStorage,
    assetsIdentity =
      storageIdentity.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4.assets;
  for (const kind of ['yaml-blocks', 'schema-blocks']) {
    let adapter = provider.open('story'),
      snapshot = adapter.capture();
    const candidate = await adapter.prepareRepresentation!(snapshot, {
      kind,
      direction: 'from-source',
    });
    assert.equal(provider.list()[0]?.activeRepresentation, 'source');
    await adapter.commitRepresentation!(snapshot, candidate);
    adapter.dispose();
    assert.equal(provider.list()[0]?.activeRepresentation, kind);
    const savedBlocks = Object.values(f.project.targets[0]!.blocks) as Record<string, unknown>[];
    const roots = savedBlocks.filter((block) =>
      String(block.opcode).endsWith('__embeddedYamlRoot'),
    );
    assert.equal(roots.length, 1);
    assert.equal(roots[0]!.next, null);
    assert.equal(roots[0]!.parent, null);
    const documents = savedBlocks.filter((block) =>
      String(block.opcode).endsWith('__embeddedYaml'),
    );
    assert.equal(documents.length, 1);
    assert.ok(typeof documents[0]!.next === 'string');
    assert.equal(
      savedBlocks.some((block) => String(block.opcode).includes('embeddedYamlConfig')),
      false,
    );

    const cleanProject = f.project;
    const cleanBefore = JSON.stringify(cleanProject);
    assert.doesNotThrow(() =>
      assertKamishibaiDocumentSourceReady(cleanProject, {sourceFrontend: f.frontend}),
    );
    assert.equal(JSON.stringify(cleanProject), cleanBefore);
    const dirtyProject = structuredClone(cleanProject);
    const lineComment = Object.values(dirtyProject.targets[0]!.blocks).find((block) =>
      block.opcode.endsWith('_yamlLineComment'),
    );
    assert.ok(lineComment);
    lineComment.inputs.TEXT = [1, [10, ' changed comment']];
    assert.throws(
      () => assertKamishibaiDocumentSourceReady(dirtyProject, {sourceFrontend: f.frontend}),
      /Reflect/,
    );
    adapter = provider.open('story');
    snapshot = adapter.capture();
    await assert.rejects(adapter.prepare(snapshot, source), /Reflect/);
    await adapter.prepareRepresentation!(snapshot, {kind, direction: 'from-source'});
    const reflected = await adapter.prepareRepresentation!(snapshot, {
      kind,
      direction: 'to-source',
    });
    await adapter.commitRepresentation!(snapshot, reflected);
    adapter.dispose();
    assert.equal(provider.list()[0]?.activeRepresentation, 'source');
    assert.equal(provider.open('story').capture().source, source);
    assert.doesNotThrow(() => assertKamishibaiDocumentSourceReady(f.project));
  }
  assert.equal(f.vm.runtime.targets[0]!, targetIdentity);
  assert.equal(targetIdentity.blocks.getBlock('start'), unrelatedIdentity);
  assert.equal(targetIdentity.costumes, costumeIdentity);
  assert.equal(f.vm.runtime.extensionStorage, storageIdentity);
  assert.equal(
    storageIdentity.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4.assets,
    assetsIdentity,
  );
  assert.deepEqual(f.counts, {stop: 0, save: 0, load: 0, extensionLoads: 0});
  provider.dispose?.();
});

test('edited common and schema blocks switch directly in one prepared transaction without losing raw comments or values', async () => {
  const f = await fixture();
  const provider = createKamishibaiEmbeddedYamlProvider(f.vm, {
    documentViewsEnabled: true,
  });
  const registry = getSourceDocumentRegistry(f.vm);
  const unregister = registry.register(provider);
  const open = () => registry.open({providerId: 'kamishibai-dsl4', documentId: 'story'});
  let adapter = open(),
    snapshot = adapter.capture();
  await adapter.commitRepresentation!(
    snapshot,
    await adapter.prepareRepresentation!(snapshot, {
      kind: 'yaml-blocks',
      direction: 'from-source',
    }),
  );
  adapter.dispose();
  type EditableBlock = NativeBlock;
  const commonBlocks = f.vm.runtime.targets[0]!.blocks._blocks as Record<string, EditableBlock>;
  const number = Object.values(commonBlocks).find(
    (block) => block.opcode.endsWith('_yamlScalar') && block.fields.TYPE?.value === 'number',
  );
  assert.ok(number);
  editLiteral(f.vm.runtime.targets[0]!.blocks, number, 'VALUE', '2');
  adapter = open();
  snapshot = adapter.capture();
  const beforeSchema = f.vm.toJSON();
  const schemaCandidate = await adapter.prepareRepresentation!(snapshot, {
    kind: 'schema-blocks',
    direction: 'from-source',
  });
  assert.equal(
    f.vm.toJSON(),
    beforeSchema,
    'Both pure conversion steps must leave the VM untouched.',
  );
  const source2 = source.replace('wait: 1', 'wait: 2');
  await adapter.commitRepresentation!(snapshot, schemaCandidate);
  adapter.dispose();
  assert.equal(provider.list()[0]?.activeRepresentation, 'schema-blocks');
  assert.equal(open().capture().source, source2);
  const schemaBlocks = f.vm.runtime.targets[0]!.blocks._blocks as Record<string, EditableBlock>;
  const wait = Object.values(schemaBlocks).find((block) => block.opcode.endsWith('__wait'));
  assert.ok(wait);
  editLiteral(f.vm.runtime.targets[0]!.blocks, wait, 'SECONDS', 3);
  adapter = open();
  snapshot = adapter.capture();
  const beforeCommon = f.vm.toJSON();
  const commonCandidate = await adapter.prepareRepresentation!(snapshot, {
    kind: 'yaml-blocks',
    direction: 'from-source',
  });
  assert.equal(f.vm.toJSON(), beforeCommon);
  const source3 = source.replace('wait: 1', 'wait: 3');
  await adapter.commitRepresentation!(snapshot, commonCandidate);
  adapter.dispose();
  assert.equal(provider.list()[0]?.activeRepresentation, 'yaml-blocks');
  const current = open().capture().source;
  assert.equal(
    current,
    source3,
    'Original comments, quote style and surrounding raw text survive both direct conversions.',
  );
  assert.equal(
    serializeDsl4CanonicalDocument(f.frontend.parse(current)),
    serializeDsl4CanonicalDocument(f.frontend.parse(source3)),
  );
  const capabilities = registry.list()[0]!.representations!;
  assert.deepEqual(capabilities.find((item) => item.kind === 'yaml-blocks')?.fromRepresentations, [
    'schema-blocks',
    'yaml-blocks',
  ]);
  assert.deepEqual(
    capabilities.find((item) => item.kind === 'schema-blocks')?.fromRepresentations,
    ['yaml-blocks', 'schema-blocks'],
  );
  unregister();
  provider.dispose?.();
});

test('same-kind preparation stays dry while unsupported targets and stale views remain rejected', async () => {
  const f = await fixture();
  const provider = createKamishibaiEmbeddedYamlProvider(f.vm, {
    documentViewsEnabled: true,
  });
  let adapter = provider.open('story'),
    snapshot = adapter.capture();
  await adapter.commitRepresentation!(
    snapshot,
    await adapter.prepareRepresentation!(snapshot, {
      kind: 'yaml-blocks',
      direction: 'from-source',
    }),
  );
  adapter.dispose();
  adapter = provider.open('story');
  snapshot = adapter.capture();
  const before = f.vm.toJSON();
  await adapter.prepareRepresentation!(snapshot, {kind: 'yaml-blocks', direction: 'from-source'});
  await assert.rejects(
    adapter.prepareRepresentation!(snapshot, {
      kind: 'unsupported',
      direction: 'from-source',
    }),
    /Choose/,
  );
  assert.equal(f.vm.toJSON(), before);
  adapter.dispose();
  const owner =
    f.vm.runtime.extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4;
  assert.ok(owner.editorViews);
  const state = Object.values(owner.editorViews.views)[0] as {
    descriptors: Record<string, {baseSourceRevision: string}>;
  };
  state.descriptors['yaml-blocks']!.baseSourceRevision = 'stale';
  adapter = provider.open('story');
  snapshot = adapter.capture();
  const stale = f.vm.toJSON();
  await assert.rejects(
    adapter.prepareRepresentation!(snapshot, {
      kind: 'schema-blocks',
      direction: 'from-source',
    }),
    /source changed/i,
  );
  assert.equal(f.vm.toJSON(), stale);
  provider.dispose?.();
});

test('all three previews reflect the same edited document without loading an extension, saving an archive or mutating the VM', async () => {
  const f = await fixture();
  const provider = createKamishibaiEmbeddedYamlProvider(f.vm, {
    documentViewsEnabled: true,
  });
  const registry = getSourceDocumentRegistry(f.vm),
    unregister = registry.register(provider);
  const open = () => registry.open({providerId: 'kamishibai-dsl4', documentId: 'story'});
  let adapter = open(),
    snapshot = adapter.capture();
  await adapter.commitRepresentation!(
    snapshot,
    await adapter.prepareRepresentation!(snapshot, {
      kind: 'yaml-blocks',
      direction: 'from-source',
    }),
  );
  adapter.dispose();
  type EditableBlock = NativeBlock;
  const blocks = f.vm.runtime.targets[0]!.blocks._blocks as Record<string, EditableBlock>;
  const value = Object.values(blocks).find(
    (block) => block.opcode.endsWith('_yamlScalar') && block.fields.TYPE?.value === 'number',
  )!;
  editLiteral(f.vm.runtime.targets[0]!.blocks, value, 'VALUE', '2');
  adapter = open();
  snapshot = adapter.capture();
  let saves = 0,
    loads = 0;
  const save = f.vm.saveProjectSb3,
    load = f.vm.loadProject;
  f.vm.saveProjectSb3 = async () => {
    saves++;
    return save();
  };
  f.vm.loadProject = async (bytes) => {
    loads++;
    return load(bytes);
  };
  const before = f.vm.toJSON(),
    source2 = source.replace('wait: 1', 'wait: 2');
  for (const kind of ['source', 'yaml-blocks', 'schema-blocks']) {
    const preview = await adapter.previewRepresentation!(snapshot, {kind});
    assert.equal(preview.source, source2);
    assert.equal(
      serializeDsl4CanonicalDocument(f.frontend.parse(preview.source)),
      serializeDsl4CanonicalDocument(f.frontend.parse(source2)),
    );
    assert.deepEqual(
      Object.keys(preview).sort(),
      kind === 'source'
        ? ['kind', 'source']
        : ['blockDefinitions', 'blocks', 'kind', 'menus', 'rootIds', 'source'],
    );
    if (kind !== 'source') {
      assert.ok(preview.rootIds?.every((id) => Object.hasOwn(preview.blocks!, id)));
      assert.equal(
        Object.hasOwn(preview.blocks!, 'start'),
        false,
        'Unrelated event scripts are not part of a document preview.',
      );
      assert.ok(Object.isFrozen(preview.blocks));
    }
    if (kind === 'schema-blocks') {
      for (const operation of ['control', 'scene'])
        assert.ok(
          preview.blockDefinitions!.some(
            // The view writes declarations with the runtime's own opcodes.
            (definition) => dsl4AuthoringBlockName(definition.opcode) === operation,
          ),
        );
      assert.ok(
        preview.blockDefinitions!.every(
          (definition) => definition.colour && definition.blockIconURI,
        ),
      );
    }
    assert.equal(f.vm.toJSON(), before);
  }
  assert.equal(saves, 0);
  assert.equal(loads, 0);
  await assert.rejects(
    adapter.previewRepresentation!(snapshot, {kind: 'unsupported'}),
    /unsupported|Choose|representation/i,
  );
  const schemaCandidate = await adapter.prepareRepresentation!(snapshot, {
    kind: 'schema-blocks',
    direction: 'from-source',
  });
  await adapter.commitRepresentation!(snapshot, schemaCandidate);
  adapter.dispose();
  const schemaBlocks = f.vm.runtime.targets[0]!.blocks._blocks as Record<string, EditableBlock>;
  const wait = Object.values(schemaBlocks).find((block) => block.opcode.endsWith('__wait'))!;
  editLiteral(f.vm.runtime.targets[0]!.blocks, wait, 'SECONDS', 3);
  adapter = open();
  snapshot = adapter.capture();
  const beforeSchemaPreviews = f.vm.toJSON(),
    source3 = source.replace('wait: 1', 'wait: 3');
  saves = 0;
  loads = 0;
  for (const kind of ['source', 'yaml-blocks', 'schema-blocks']) {
    assert.equal((await adapter.previewRepresentation!(snapshot, {kind})).source, source3);
    assert.equal(f.vm.toJSON(), beforeSchemaPreviews);
  }
  assert.equal(saves, 0);
  assert.equal(loads, 0);
  f.vm.runtime.targets[0]!.blocks.createBlock({
    id: 'newEvent',
    opcode: 'event_whenflagclicked',
    parent: null,
    next: null,
    topLevel: true,
    inputs: {},
    fields: {},
    shadow: false,
  });
  const stale = f.vm.toJSON();
  await assert.rejects(
    adapter.previewRepresentation!(snapshot, {kind: 'source'}),
    /changed|conflict/i,
  );
  assert.equal(f.vm.toJSON(), stale);
  unregister();
  provider.dispose?.();
});

test('legacy eight-opcode common views remain readable while forged new opcode or unknown keys are rejected', async () => {
  const f = await fixture(),
    provider = createKamishibaiEmbeddedYamlProvider(f.vm, {
      documentViewsEnabled: true,
    });
  let adapter = provider.open('story'),
    snapshot = adapter.capture();
  await adapter.commitRepresentation!(
    snapshot,
    await adapter.prepareRepresentation!(snapshot, {
      kind: 'yaml-blocks',
      direction: 'from-source',
    }),
  );
  adapter.dispose();
  const owner =
    f.vm.runtime.extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4;
  assert.ok(owner.editorViews);
  const state = Object.values(owner.editorViews.views)[0]!;
  const opcodes = state.descriptors['yaml-blocks']!.opcodes;
  const legacyCommentOpcode = opcodes.comment;
  assert.ok(legacyCommentOpcode);
  for (const b of Object.values(f.vm.runtime.targets[0]!.blocks._blocks)) {
    if (b.opcode === opcodes.lineComment) b.opcode = legacyCommentOpcode;
    if (b.opcode === opcodes.inlineComment) {
      b.opcode = legacyCommentOpcode;
      b.fields.PLACEMENT = {name: 'PLACEMENT', value: 'inline'};
    }
  }
  delete opcodes.lineComment;
  delete opcodes.inlineComment;
  f.vm.runtime.emitProjectChanged();
  adapter = provider.open('story');
  snapshot = adapter.capture();
  const good = await adapter.prepareRepresentation!(snapshot, {
    kind: 'yaml-blocks',
    direction: 'to-source',
  });
  assert.ok(good);
  adapter.dispose();
  for (const change of [{lineComment: 'forged_yamlLineComment'}, {unexpected: 'forged'}]) {
    Object.assign(opcodes, change);
    f.vm.runtime.emitProjectChanged();
    adapter = provider.open('story');
    snapshot = adapter.capture();
    await assert.rejects(
      adapter.prepareRepresentation!(snapshot, {
        kind: 'yaml-blocks',
        direction: 'to-source',
      }),
      /unknown declarations/i,
    );
    adapter.dispose();
    for (const key of Object.keys(change)) delete opcodes[key];
  }
  provider.dispose?.();
});

test('single-file preview retains an immutable shared-payload Save candidate and the correct raw reflection request', async () => {
  const f = await fixture();
  const project = f.project;
  const component = (p: FixtureProject) =>
    p.extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4;
  const freeze = <T>(value: T): T => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  freeze(project);
  const reference = {providerId: 'kamishibai-dsl4', documentId: 'story'};
  const options = {
    frontend: f.frontend,
    replaceSource: async (input: Record<string, unknown>, nextSource: string) => {
      const next = input as FixtureProject;
      assert.equal(nextSource, source);
      assert.equal(component(next).assets, component(project).assets);
      return {project: next, component: component(next)};
    },
  };
  const before = JSON.stringify(project);
  const current = await buildKamishibaiDocumentPreviewArtifact(
    {project, source, reference, kind: 'source'},
    options,
  );
  assert.equal(current.candidate, undefined);
  for (const kind of ['yaml-blocks', 'schema-blocks']) {
    const displayed = await buildKamishibaiDocumentPreviewArtifact(
      {project, source, reference, kind},
      options,
    );
    assert.deepEqual(displayed.candidate?.request, {
      kind,
      direction: 'from-source',
    });
    const saved = displayed.candidate!.project as FixtureProject;
    assert.equal(component(saved).assets, component(project).assets);
    assert.equal(component(saved).source, component(project).source);
    assert.equal(displayed.preview.source, displayed.candidate!.source);
    for (const [id, block] of Object.entries(displayed.preview.blocks!))
      assert.deepEqual(saved.targets[0]!.blocks[id], block);
    const raw = await buildKamishibaiDocumentPreviewArtifact(
      {project: freeze(saved), source, reference, kind: 'source'},
      options,
    );
    assert.deepEqual(raw.candidate?.request, {kind, direction: 'to-source'});
    assert.equal(raw.preview.source, source);
    assert.equal(raw.preview.source, raw.candidate!.source);
    assert.equal(JSON.stringify(project), before);
  }
});

for (const kind of ['yaml-blocks', 'schema-blocks']) {
  test(`saving the displayed dirty ${kind} commits its cached preview and keeps the same format`, async () => {
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
    const registry = getSourceDocumentRegistry(f.vm);
    const unregister = registry.register(provider);
    const open = () => registry.open({providerId: 'kamishibai-dsl4', documentId: 'story'});
    let adapter = open(),
      snapshot = adapter.capture();
    await adapter.commitRepresentation!(
      snapshot,
      await adapter.prepareRepresentation!(snapshot, {kind, direction: 'from-source'}),
    );
    adapter.dispose();
    const target = f.vm.runtime.targets[0]!,
      blocks = Object.values(target.blocks._blocks);
    const scalar = blocks.find((block) =>
      kind === 'yaml-blocks'
        ? block.opcode.endsWith('_yamlScalar') && block.fields.TYPE?.value === 'number'
        : block.opcode.endsWith('__wait'),
    );
    const comment = blocks.find((block) => block.opcode.endsWith('_yamlLineComment'));
    assert.ok(scalar);
    assert.ok(comment);
    editLiteral(
      target.blocks,
      scalar,
      kind === 'yaml-blocks' ? 'VALUE' : 'SECONDS',
      kind === 'yaml-blocks' ? '7' : 7,
    );
    editLiteral(target.blocks, comment, 'TEXT', ' edited raw comment');
    const dirty = f.project;
    assert.throws(
      () => assertKamishibaiDocumentSourceReady(dirty, {sourceFrontend: f.frontend}),
      /Reflect/,
    );
    const assets =
      f.vm.runtime.extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4
        .assets;
    adapter = open();
    snapshot = adapter.capture();
    const before = f.vm.toJSON();
    const displayed = await adapter.previewRepresentation!(snapshot, {kind});
    assert.match(displayed.source, /wait: 7/);
    assert.match(displayed.source, /# edited raw comment/);
    assert.equal(f.vm.toJSON(), before);
    const afterPreviewParses = parses;
    const prepared = await adapter.prepareRepresentation!(snapshot, {
      kind,
      direction: 'from-source',
    });
    assert.equal(parses, afterPreviewParses, 'Save must reuse the displayed validated candidate.');
    assert.equal(f.vm.toJSON(), before);
    await adapter.commitRepresentation!(snapshot, prepared);
    assert.equal(parses, afterPreviewParses, 'Commit must not rebuild a still-current preview.');
    assert.equal(provider.list()[0]!.activeRepresentation, kind);
    const saved = provider.open('story').capture().source;
    assert.equal(saved, displayed.source);
    assert.equal(
      f.vm.runtime.extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4
        .assets,
      assets,
    );
    assert.doesNotThrow(() =>
      assertKamishibaiDocumentSourceReady(f.project, {sourceFrontend: f.frontend}),
    );
    assert.deepEqual(f.counts, {stop: 0, save: 0, load: 0, extensionLoads: 0});
    adapter.dispose();
    unregister();
    provider.dispose?.();
  });
}
