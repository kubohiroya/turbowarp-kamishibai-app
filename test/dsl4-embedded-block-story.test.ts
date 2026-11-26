import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {test} from 'vitest';

import {
  hasDsl4EmbeddedBlockStory,
  prepareDsl4EmbeddedBlockStoryProject,
} from '../src/dsl4/platform/embedded-block-story.js';
import {loadDsl4RuntimeComponent} from '../src/dsl4/runtime-artifact-loader.js';
import {createDsl4StructuredBlockSourceDeclaration} from '../src/dsl4/structured-block-source.js';
import {
  dsl4TestSourceFrontend as frontend,
  dsl4TestProductionSourceFrontend as sectionFrontend,
} from './helpers/dsl4-test-frontend.ts';
import {okResult} from './helpers/result-outcome.ts';
import {requireArray, requireRecord} from './helpers/require-value.ts';

const options = {
  maxSourceBytes: 16384,
  maxAssetFiles: 10,
  maxTotalAssetBytes: 16384,
  subtleCrypto: webcrypto.subtle,
};

function blocks(label = '', value = 1) {
  return createDsl4StructuredBlockSourceDeclaration({
    source: {
      controls: {keymaps: {production: {Space: 'navigation.nextAction'}}},
      assets: {Cover: {kind: 'backdrop', name: 'Menu'}},
      cover: {backdrop: 'Cover'},
      scenes: {opening: [{wait: value}]},
    },
    label,
    form: 'bundle',
    hatId: 'root',
    idPrefix: 'root-',
  });
}

function project(declarations = blocks()) {
  return {
    targets: [{isStage: true, name: 'Stage', blocks: declarations}],
    extensionStorage: {
      otherExtension: {value: 'preserved'},
      kubohiroyakamishibai4: {
        components: {
          kubohiroyakamishibairuntime4: {application: {mode: 'menu'}, assets: {invalid: true}},
          otherComponent: {value: 'also preserved'},
        },
      },
    },
  };
}

async function loaded(input: Record<string, unknown>, sourceFrontend = frontend) {
  const prepared = await prepareDsl4EmbeddedBlockStoryProject(input, sourceFrontend, options);
  const result = okResult(
    await loadDsl4RuntimeComponent(prepared, sourceFrontend, options),
    'the compiled block component',
  );
  return {prepared, story: requireRecord(result.storyDocument, 'the current block story')};
}

test('compiles an empty-name root into the normal runtime component without changing the SB3', async () => {
  const input = project();
  const before = structuredClone(input);
  assert.equal(hasDsl4EmbeddedBlockStory(input), true);
  const {prepared, story} = await loaded(input);
  assert.deepEqual(input, before);
  const storage = requireRecord(prepared.extensionStorage, 'storage');
  const bundle = requireRecord(storage.kubohiroyakamishibai4, 'bundle');
  const components = requireRecord(bundle.components, 'components');
  assert.deepEqual(storage.otherExtension, {value: 'preserved'});
  assert.deepEqual(components.otherComponent, {value: 'also preserved'});
  assert.deepEqual(requireRecord(components.kubohiroyakamishibairuntime4, 'runtime').application, {
    mode: 'story',
  });
  assert.deepEqual(requireRecord(story.cover, 'cover').backdrop, 'Cover');
  const originalScene = JSON.stringify(story.scenes);
  const wait = Object.values(input.targets[0]!.blocks).find((block) =>
    block.opcode.endsWith('__wait'),
  );
  assert.ok(wait);
  wait.inputs.SECONDS = [1, [4, 7]];
  const edited = await loaded(input);
  assert.notEqual(JSON.stringify(edited.story.scenes), originalScene);
  assert.match(JSON.stringify(edited.story.scenes), /7/u);
});

test('resolves named includeBlocks from the empty-name root', async () => {
  const root = createDsl4StructuredBlockSourceDeclaration({
    source: {
      controls: {keymaps: {production: {Space: 'navigation.nextAction'}}},
      scenes: {opening: [{goto: 'ending'}]},
    },
    label: '',
    includeLabels: ['ending'],
    form: 'bundle',
    hatId: 'root',
    idPrefix: 'root-',
  });
  const module = createDsl4StructuredBlockSourceDeclaration({
    source: {scenes: {ending: [{wait: 0}]}},
    label: 'ending',
    form: 'bundle',
    hatId: 'module',
    idPrefix: 'module-',
  });
  const {story} = await loaded(project({...module, ...root}));
  assert.match(JSON.stringify(story.scenes), /ending/u);
  assert.equal(requireArray(story.scenes, 'scenes').length, 2);
});

test('does not reinterpret a named-only script as the root', async () => {
  const input = project(blocks('named'));
  assert.equal(hasDsl4EmbeddedBlockStory(input), true);
  await assert.rejects(prepareDsl4EmbeddedBlockStoryProject(input, frontend, options), {
    code: 'K4-BLOCK-SOURCE-MISSING-001',
  });
});

test('diagnoses broken blocks instead of using stale source or opening a file', async () => {
  const input = project();
  input.targets[0]!.blocks.root!.next = 'missing-block';
  await assert.rejects(prepareDsl4EmbeddedBlockStoryProject(input, frontend, options), {
    code: 'K4-BLOCK-SOURCE-GRAPH-001',
  });
});

test('leaves projects without block declarations on their existing startup path', async () => {
  const input = project({});
  assert.equal(hasDsl4EmbeddedBlockStory(input), false);
  assert.strictEqual(await prepareDsl4EmbeddedBlockStoryProject(input, frontend, options), input);
});

test('compiles only enabled section actions from the current project on each story start', async () => {
  const declarations = blocks();
  const scene = Object.entries(declarations).find(([, block]) => block.opcode.endsWith('_scene'))!;
  const [waitId, wait] = Object.entries(declarations).find(([, block]) =>
    block.opcode.endsWith('__wait'),
  )!;
  declarations.outsideWait = {
    ...structuredClone(wait),
    parent: 'section',
    inputs: {SECONDS: [1, [4, 43]]},
  };
  declarations.section = {
    opcode: 'kubohiroyakamishibaiauthoring4_useSection',
    next: 'outsideWait',
    parent: scene[0],
    inputs: {SUBSTACK: [2, waitId]},
    fields: {ENABLED: ['off', null]},
    shadow: false,
    topLevel: false,
  };
  wait.parent = 'section';
  scene[1].inputs.SUBSTACK = [2, 'section'];
  const input = project(declarations);
  const before = structuredClone(input);
  // Sections now retain dedicated invalidate source and require its matching frontend.
  const off = await loaded(input, sectionFrontend);
  const sceneActions = (story: Record<string, unknown>) =>
    requireArray(
      requireRecord(requireArray(story.scenes, 'scenes')[0], 'opening').actions,
      'actions',
    ).map((action) => requireRecord(requireRecord(action, 'action').args, 'arguments').seconds);
  // The compiler retains a zero-duration boundary for source navigation.
  assert.deepEqual(sceneActions(off.story), [0, 43]);
  assert.deepEqual(input, before);
  declarations.section.fields.ENABLED = ['on', null];
  assert.deepEqual(sceneActions((await loaded(input, sectionFrontend)).story), [0, 1, 43]);
});

test('fails at runtime startup for duplicate configuration names, including an empty name', async () => {
  for (const label of ['', 'shared']) {
    const declarations = blocks();
    const config = Object.values(declarations).find((block) =>
      block.opcode.endsWith('_kamishibaiConfig'),
    )!;
    config.inputs.LABEL = [1, [10, label]];
    declarations.duplicateConfig = {...structuredClone(config), next: null};
    await assert.rejects(
      prepareDsl4EmbeddedBlockStoryProject(project(declarations), frontend, options),
      {
        code: 'K4-BLOCK-SOURCE-DUPLICATE-001',
      },
    );
  }
});

test('detects config-only projects as invalid scripts instead of opening the file menu', async () => {
  const input = project();
  delete input.targets[0]!.blocks.root;
  assert.equal(hasDsl4EmbeddedBlockStory(input), true);
  await assert.rejects(prepareDsl4EmbeddedBlockStoryProject(input, frontend, options), {
    code: 'K4-BLOCK-SOURCE-MISSING-001',
  });
});

function includedConfigFixture(invalidConfig: boolean, invalidScene: boolean) {
  const root = createDsl4StructuredBlockSourceDeclaration({
    source: {scenes: {opening: [{goto: 'ending'}]}},
    includeLabels: ['ending'],
    form: 'bundle',
    hatId: 'root',
    idPrefix: 'same-',
  });
  const module = createDsl4StructuredBlockSourceDeclaration({
    source: {scenes: {ending: [invalidScene ? {goto: 'missing'} : {wait: 0}]}},
    label: 'ending',
    form: 'bundle',
    hatId: 'module',
    idPrefix: 'same-',
  });
  const config = createDsl4StructuredBlockSourceDeclaration({
    source: {
      controls: {keymaps: {production: {Space: 'navigation.nextAction'}}},
      assets: {Broken: {kind: invalidConfig ? 'invalid-kind' : 'backdrop', name: 'Menu'}},
      variables: {score: 1},
    },
    label: 'shared',
    form: 'bundle',
    hatId: 'config-module',
    idPrefix: 'same-',
  });
  delete config['config-module'];
  const assetId = Object.entries(config).find(([, block]) => block.opcode.endsWith('_asset'))![0];
  const moduleActionId = Object.entries(module).find(([, block]) =>
    block.opcode.endsWith(invalidScene ? '__goto' : '__wait'),
  )![0];
  return {
    root,
    module,
    config,
    assetId,
    moduleActionId,
    input: {
      targets: [
        {isStage: true, name: 'Stage', blocks: root},
        {isStage: false, name: 'Ending', blocks: module},
        {
          isStage: false,
          name: 'Settings',
          blocks: config,
          costumes: [{name: 'Menu', assetId: 'menu', dataFormat: 'svg'}],
        },
      ],
    },
  };
}

test('Schema errors in a cross-target kamishibaiConfig retain the actual definition block with includeBlocks', async () => {
  for (const scalar of [false, true]) {
    const f = includedConfigFixture(true, false);
    if (scalar) f.config[f.assetId]!.inputs.VALUE = [1, [10, JSON.stringify('invalid-shorthand')]];
    await assert.rejects(
      prepareDsl4EmbeddedBlockStoryProject(f.input, frontend, options),
      (error: unknown) => {
        const diagnostic = error as Error & {targetName?: string; blockId?: string};
        assert.equal(diagnostic.targetName, 'Settings');
        assert.equal(diagnostic.blockId, f.assetId);
        assert.notEqual(diagnostic.blockId, 'root');
        return true;
      },
    );
  }
});

test('included scene errors retain their module block despite unrelated implicit configuration', async () => {
  const f = includedConfigFixture(false, true);
  await assert.rejects(
    prepareDsl4EmbeddedBlockStoryProject(f.input, frontend, options),
    (error: unknown) => {
      const diagnostic = error as Error & {targetName?: string; blockId?: string};
      assert.equal(diagnostic.targetName, 'Ending');
      assert.equal(diagnostic.blockId, f.moduleActionId);
      return true;
    },
  );
});

test('runtime failures in included scenes use original module ranges with implicit configuration and colliding IDs', async () => {
  const {createDsl4RuntimeController} = await import('../src/dsl4/runtime-controller.js');
  const {createDsl4RuntimeBlockDiagnosticLocator} =
    await import('../src/dsl4/platform/runtime-block-diagnostic.js');
  const f = includedConfigFixture(false, false);
  const targets = f.input.targets.map((target, index) => ({
    id: String(index),
    isStage: target.isStage,
    getName: () => target.name,
    blocks: {getBlock: (id: string) => target.blocks[id]},
  }));
  const host = {vm: {runtime: {targets}}};
  let locate: ReturnType<typeof createDsl4RuntimeBlockDiagnosticLocator> | undefined;
  const prepared = await prepareDsl4EmbeddedBlockStoryProject(f.input, frontend, {
    ...options,
    onBlockSources(sources) {
      locate = createDsl4RuntimeBlockDiagnosticLocator(sources, host);
    },
  });
  const loaded = okResult(
    await loadDsl4RuntimeComponent(prepared, frontend, options),
    'the current component',
  );
  const controller = createDsl4RuntimeController({
    storyDocument: requireRecord(loaded.storyDocument, 'story document'),
    port: {
      wait: async () => {
        throw new Error('wait failed');
      },
    },
  });
  const state = await controller.start();
  assert.equal(state.status, 'failed');
  const diagnostic = requireRecord(state.diagnostic, 'runtime diagnostic');
  assert.notEqual(diagnostic.sourceId, 'Stage.k4.yml');
  assert.equal(locate!(diagnostic).targetName, 'Ending');
  assert.equal(locate!(diagnostic).blockId, f.moduleActionId);
  assert.equal(locate!({...diagnostic, sourceId: 'unrelated.k4.yml'}).blockId, undefined);
});
