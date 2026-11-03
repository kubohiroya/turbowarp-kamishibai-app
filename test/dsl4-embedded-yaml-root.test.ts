import assert from 'node:assert/strict';
import {test} from 'vitest';
import {encodeReference} from '@kubohiroya/turbowarp-document-source';
import {createEmbeddedYamlMarker} from '@kubohiroya/turbowarp-document-data/document-source';
import {createEmbeddedYamlSourceGraphRecord} from '../src/dsl4/embedded-yaml-source-graph.js';
import {
  installDsl4EmbeddedYamlRoot,
  createDsl4EmbeddedYamlRootDefinition,
  installDsl4EmbeddedYamlHat,
} from '../src/dsl4/embedded-yaml-hat.js';
import {
  validateKamishibaiEmbeddedYamlRoot,
  readKamishibaiEmbeddedYamlRootSelection,
} from '../src/dsl4/embedded-yaml-root-validation.js';
import {
  dsl4BundledEmbeddedYamlHatOpcode,
  dsl4BundledEmbeddedYamlRootOpcode,
  dsl4EmbeddedYamlRootOpcode,
} from '../src/dsl4/embedded-yaml-identity.js';
const entry = 'main.k4.yml',
  modulePath = 'chapters/part.k4.yml';
const ref = (path: string) => ({providerId: 'kamishibai-dsl4', documentId: `file:${path}`});
async function fixture() {
  const graph = await createEmbeddedYamlSourceGraphRecord({
    entryPath: entry,
    files: {
      [entry]: "kamishibai: '4.0'\ninclude: chapters/part.k4.yml\n",
      [modulePath]: 'scenes:\n  opening: []\n',
    },
  });
  const project = {
    targets: [
      {
        isStage: true,
        blocks: {
          entry: createEmbeddedYamlMarker({
            opcode: dsl4BundledEmbeddedYamlHatOpcode,
            reference: ref(entry),
            x: 32,
            y: 32,
          }),
          module: createEmbeddedYamlMarker({
            opcode: dsl4BundledEmbeddedYamlHatOpcode,
            reference: ref(modulePath),
            x: 32,
            y: 300,
          }),
        } as Record<string, Record<string, unknown>>,
      },
    ],
    extensionStorage: {
      kubohiroyakamishibai4: {
        components: {
          kubohiroyakamishibairuntime4: {
            sourceDocuments: graph,
            source: {mode: 'embedded', text: 'derived', displayName: 'main.k4.yml'},
            application: {mode: 'story'},
          },
        },
      },
    },
  };
  const id = installDsl4EmbeddedYamlRoot(project, {channel: 'bundled'})!;
  return {project, id, root: project.targets[0]!.blocks[id]!};
}
test('the explicit root is versioned, independent and names the entry ordinary document, without choosing an unnamed or zero-indegree fallback', async () => {
  const f = await fixture(),
    before = JSON.stringify(f.project);
  assert.deepEqual(validateKamishibaiEmbeddedYamlRoot(f.project), {
    reference: ref(entry),
    rootId: f.id,
    form: 'bundled',
    version: '4.0',
    path: entry,
    entryPath: entry,
  });
  assert.equal(f.root.next, null);
  assert.equal(f.root.parent, null);
  assert.equal(f.root.topLevel, true);
  assert.deepEqual(f.root.inputs, {});
  assert.ok(Number(f.root.y) < 32 - 100);
  assert.equal(installDsl4EmbeddedYamlRoot(f.project, {channel: 'bundled'}), f.id);
  assert.equal(JSON.stringify(f.project), before);
  const definition = createDsl4EmbeddedYamlRootDefinition({HAT: 'hat'});
  assert.equal(definition.isTerminal, true);
  assert.ok(definition.extensions.length);
  assert.equal(definition.arguments.VERSION.defaultValue, '4.0');
  assert.equal(definition.arguments.VERSION.menu, 'embeddedYamlVersions');
});
test('missing, duplicate, foreign, broken, connected and wrong-version roots fail without mutating the project', async () => {
  const f = await fixture();
  const mutations: ((p: typeof f.project) => void)[] = [
    (p) => {
      delete p.targets[0]!.blocks[f.id];
    },
    (p) => {
      p.targets[0]!.blocks.secondRoot = structuredClone(p.targets[0]!.blocks[f.id]!);
    },
    (p) => {
      p.targets[0]!.blocks[f.id]!.fields = {
        VERSION: ['4.0', null],
        DOCUMENT: [encodeReference({providerId: 'other-owner', documentId: 'entry'}), null],
      };
    },
    (p) => {
      p.targets[0]!.blocks[f.id]!.fields = {VERSION: ['4.0', null], DOCUMENT: ['', null]};
    },
    (p) => {
      p.targets[0]!.blocks[f.id]!.next = 'entry';
    },
    (p) => {
      p.targets[0]!.blocks[f.id]!.parent = 'entry';
    },
    (p) => {
      p.targets[0]!.blocks.entry!.next = f.id;
    },
    (p) => {
      p.targets[0]!.blocks[f.id]!.fields = {
        VERSION: ['4.1', null],
        DOCUMENT: [encodeReference(ref(entry)), null],
      };
    },
    (p) => {
      p.targets[0]!.blocks[f.id]!.fields = {DOCUMENT: [encodeReference(ref(entry)), null]};
    },
    (p) => {
      p.targets[0]!.blocks[f.id]!.inputs = {VERSION: [1, [10, '4.0']]};
    },
    (p) => {
      p.targets[0]!.blocks[f.id]!.opcode = dsl4EmbeddedYamlRootOpcode;
    },
    (p) => {
      delete p.targets[0]!.blocks.entry;
    },
    (p) => {
      p.targets[0]!.blocks.duplicateDocument = structuredClone(p.targets[0]!.blocks.entry!);
    },
    (p) => {
      p.targets[0]!.blocks.entry!.fields = {DOCUMENT: ['', null]};
    },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(f.project);
    mutate(copy);
    const before = JSON.stringify(copy);
    assert.throws(() => validateKamishibaiEmbeddedYamlRoot(copy));
    assert.equal(JSON.stringify(copy), before);
  }
});
test('root selection can be read for explicit owner synchronization, while strict validation rejects an entry mismatch', async () => {
  const f = await fixture();
  f.root.fields = {VERSION: ['4.0', null], DOCUMENT: [encodeReference(ref(modulePath)), null]};
  const before = JSON.stringify(f.project);
  assert.equal(readKamishibaiEmbeddedYamlRootSelection(f.project)!.path, modulePath);
  assert.throws(() => validateKamishibaiEmbeddedYamlRoot(f.project), /entry/i);
  assert.equal(JSON.stringify(f.project), before);
});
test('old single-file SB3s can omit a root; ordinary marker installation stays unchanged and a new root remains opt-in', () => {
  const project = {
    targets: [{isStage: true, blocks: {} as Record<string, Record<string, unknown>>}],
    extensionStorage: {
      kubohiroyakamishibai4: {
        components: {
          kubohiroyakamishibairuntime4: {
            source: {
              mode: 'embedded',
              text: "kamishibai: '4.0'\nscenes:\n  opening: []\n",
              displayName: 'story.k4.yml',
            },
            application: {mode: 'story'},
          },
        },
      },
    },
  };
  installDsl4EmbeddedYamlHat(project, {channel: 'bundled'});
  assert.equal(validateKamishibaiEmbeddedYamlRoot(project), null);
  assert.ok(
    !Object.values(project.targets[0]!.blocks).some(
      (block) => block.opcode === dsl4BundledEmbeddedYamlRootOpcode,
    ),
  );
  assert.throws(() => validateKamishibaiEmbeddedYamlRoot(project, {allowLegacySingle: false}));
  installDsl4EmbeddedYamlRoot(project, {channel: 'bundled'});
  assert.equal(validateKamishibaiEmbeddedYamlRoot(project)!.reference.documentId, 'story');
});
