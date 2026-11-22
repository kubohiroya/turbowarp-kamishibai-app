import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'vitest';
import {readReference} from '@kubohiroya/turbowarp-document-source';
import {getSourceDocumentRegistry} from '@kubohiroya/turbowarp-document-data/composition';
import {
  createKamishibaiEmbeddedYamlProvider,
  registerKamishibaiEmbeddedYamlProvider,
} from '../src/dsl4/embedded-yaml-provider.js';
import {createKamishibaiEmbeddedYamlProvider as createKamishibaiEmbeddedYamlProviderCore} from '../src/dsl4/embedded-yaml-provider-core.js';
import editorSchema from '../schema/dsl-4-editor.schema.json' with {type: 'json'};
import {installDsl4EmbeddedYamlHat} from '../src/dsl4/embedded-yaml-hat.js';
import schema from '../schema/dsl-4.schema.json' with {type: 'json'};
import {createDsl4ProductionSourceFrontend} from '../src/builder/dsl4-source-frontend.js';
import {createDsl4EmbeddedSourceDescriptor} from '../src/dsl4/source-descriptor.js';
import {createDsl4RuntimeArtifactDescriptor} from '../src/dsl4/runtime-artifact-descriptor.js';
async function fixture() {
  const text =
    "kamishibai: '4.0'\ncontrols:\n  keymaps:\n    production:\n      Space: navigation.nextAction\nscenes:\n  opening: []\n";
  const source = await createDsl4EmbeddedSourceDescriptor(text, {
    sourceId: 'story',
    displayName: 'story.k4.yml',
    maxSourceBytes: 4096,
  });
  const parsed = createDsl4ProductionSourceFrontend(schema).parse(text, {sourceId: 'story'});
  assert.equal(parsed.ok, true);
  const artifact = await createDsl4RuntimeArtifactDescriptor(
    parsed.storyDocument,
    source,
    'production',
    {maxSourceBytes: 4096},
  );
  assert.equal(artifact.ok, true, JSON.stringify(artifact.diagnostics));
  const project = {
    targets: [{isStage: true, blocks: {} as Record<string, unknown>}],
    extensionStorage: {
      kubohiroyakamishibai4: {
        components: {
          kubohiroyakamishibairuntime4: {
            source,
            application: {mode: 'story'},
            assets: {formatVersion: 1, files: []},
            artifact: (artifact as unknown as {artifact: unknown}).artifact,
          },
        },
      },
    },
  };
  const emitter = new EventEmitter();
  const runtime = Object.assign(emitter, {
    targets: project.targets,
    extensionStorage: project.extensionStorage,
    emitProjectChanged() {
      emitter.emit('PROJECT_CHANGED');
    },
  });
  const vm = {
    runtime,
    toJSON() {
      return JSON.stringify({
        ...project,
        targets: runtime.targets,
        extensionStorage: runtime.extensionStorage,
      });
    },
    stopAll() {},
  };
  return {project, runtime, vm};
}
test('the owner exposes a stable story reference, filename and bundled schema without duplicating source', async () => {
  const {vm, project} = await fixture();
  const provider = createKamishibaiEmbeddedYamlProvider(vm);
  const metadata = provider.list();
  assert.equal(provider.id, 'kamishibai-dsl4');
  assert.equal(metadata.length, 1);
  assert.equal(metadata[0]?.documentId, 'story');
  assert.equal(metadata[0]?.available, true);
  assert.equal(metadata[0]?.format, 'yaml');
  assert.equal(
    metadata[0]?.docsURL,
    'https://kubohiroya.github.io/turbowarp-kamishibai-docs/4.0/dsl-author-guides/dsl-4.0-author-guide/',
  );
  assert.match(metadata[0]!.filename, /\.k4\.ya?ml$/);
  assert.equal(metadata[0]!.schema!.id, metadata[0]!.schema!.schema.$id);
  assert.equal(metadata[0]!.schema!.schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  const component =
    vm.runtime.extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4;
  component.source = {...component.source, displayName: 'renamed.k4.yml'};
  assert.equal(provider.list()[0]?.documentId, 'story');
  assert.equal(provider.list()[0]?.filename, 'renamed.k4.yml');
  assert.throws(() => provider.open('../other'), /not owned/);
  const before = JSON.stringify(project.extensionStorage);
  const id = installDsl4EmbeddedYamlHat(project, {channel: 'bundled'})!;
  const stage = project.targets.find((target: {isStage?: boolean}) => target.isStage);
  assert.deepEqual(readReference(stage!.blocks[id], stage), {
    providerId: provider.id,
    documentId: 'story',
  });
  assert.equal(JSON.stringify(project.extensionStorage), before);
  provider.dispose?.();
  assert.deepEqual(provider.list(), []);
  assert.throws(() => provider.open('story'), /ended/);
});
test('the editor schema is attached by default and left out by the playback runtime', async () => {
  const {vm} = await fixture();
  const defaultProvider = createKamishibaiEmbeddedYamlProvider(vm);
  assert.equal(defaultProvider.list()[0]?.schema?.schema, editorSchema);
  assert.equal(defaultProvider.list()[0]?.schema?.id, editorSchema.$id);
  defaultProvider.dispose?.();

  for (const provider of [
    createKamishibaiEmbeddedYamlProviderCore(vm),
    createKamishibaiEmbeddedYamlProviderCore(vm, {editorSchema: null}),
    createKamishibaiEmbeddedYamlProvider(vm, {editorSchema: null}),
  ]) {
    const [metadata] = provider.list();
    assert.equal(metadata?.documentId, 'story');
    assert.equal(metadata?.available, true);
    assert.equal('schema' in metadata!, false, 'a document without schema hints stays editable');
    provider.dispose?.();
  }
});
test('cached runtime registration survives project reset while stale snapshots are invalidated', async () => {
  const {vm, runtime} = await fixture();
  const originalListenerCount = runtime.listenerCount('PROJECT_LOADED');
  const unregister = registerKamishibaiEmbeddedYamlProvider(vm);
  const registry = getSourceDocumentRegistry(vm);
  const old = registry.open({providerId: 'kamishibai-dsl4', documentId: 'story'});
  const unregisterCurrent = registerKamishibaiEmbeddedYamlProvider(vm);
  assert.equal(registry.list().length, 1);
  assert.equal(old.inspect().available, false);
  unregister();
  const current = registry.open({providerId: 'kamishibai-dsl4', documentId: 'story'});
  const snapshot = current.capture();
  const storage = structuredClone(runtime.extensionStorage);
  runtime.emit('RUNTIME_DISPOSED');
  runtime.extensionStorage = {} as typeof runtime.extensionStorage;
  assert.equal(registry.list().length, 1);
  assert.equal(registry.list()[0]?.available, false);
  runtime.extensionStorage = storage;
  runtime.targets = structuredClone(runtime.targets);
  runtime.emit('PROJECT_LOADED');
  assert.equal(registry.list()[0]?.available, true);
  await assert.rejects(current.prepare(snapshot, snapshot.source), /project changed/i);
  assert.ok(registry.open({providerId: 'kamishibai-dsl4', documentId: 'story'}).capture().source);
  unregisterCurrent();
  assert.equal(registry.list().length, 0);
  assert.equal(runtime.listenerCount('RUNTIME_DISPOSED'), 0);
  assert.equal(runtime.listenerCount('PROJECT_LOADED'), originalListenerCount);
});

test('metadata inspection does not serialize the project, while capture records a full stale baseline', async () => {
  const {vm, runtime} = await fixture();
  const serialize = vm.toJSON;
  let serializations = 0;
  vm.toJSON = () => {
    serializations++;
    return serialize();
  };
  const provider = createKamishibaiEmbeddedYamlProvider(vm);
  const adapter = provider.open('story');
  for (let index = 0; index < 100; index++) {
    assert.equal(provider.list()[0]?.available, true);
    assert.equal(adapter.inspect().available, true);
  }
  assert.equal(serializations, 0);
  const snapshot = adapter.capture();
  assert.equal(serializations, 1);
  runtime.targets[0]!.blocks.unrelated = {opcode: 'event_whenflagclicked'};
  await assert.rejects(adapter.prepare(snapshot, snapshot.source), /project changed/i);
  provider.dispose?.();
});
