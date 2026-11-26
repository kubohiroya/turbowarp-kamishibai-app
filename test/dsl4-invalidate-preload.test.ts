import assert from 'node:assert/strict';
import {test} from 'vitest';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parse, stringify} from 'yaml';

import {createDsl4AssetDependencyIndex} from '../src/dsl4/asset-dependency-index.js';
import {createDsl4RemoteAssetLifecycle} from '../src/dsl4/embedded-asset-lifecycle.js';
import {createDsl4GroupPreloadCoordinator} from '../src/dsl4/group-preload-coordinator.js';
import {
  createDsl4CompiledStoryArtifact,
  validateDsl4CompiledStoryArtifact,
} from '../src/dsl4/compiled-story-artifact.js';
import {dsl4InvalidatedRecognitionPreloadCapability} from '../src/dsl4/recognition-actions.js';
import {
  authorDsl4BlockSourceSb3,
  authorDsl4BlockSourceGraphSb3,
} from '../src/builder/dsl4-block-source-author.js';
import {createDsl4SourceGraph} from '../src/dsl4/source-graph.js';
import {buildDsl4RuntimeComponent} from '../src/builder/dsl4-build.js';
import {readDsl4NarrativeRuntimeExtensionSource} from '../src/builder/dsl4-playback-runtime-source.js';
import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate';
import {
  createDsl4StructuredBlockSourceDeclaration,
  readDsl4StructuredBlockSource,
} from '../src/dsl4/structured-block-source.js';
import {createDsl4TestProductionSourceFrontend} from './helpers/dsl4-test-frontend.ts';
import {requireRecord} from './helpers/require-value.ts';

const frontend = createDsl4TestProductionSourceFrontend({narrativeControlEnabled: true});
const pose = {'Hero.pose': {steps: [{pose: 'ready'}]}};
const off = {invalidate: {condition: false, then: [pose]}};
const source = (actions: unknown[], extra: Record<string, unknown> = {}) => ({
  kamishibai: '4.0',
  assets: {
    Idle: 'costume:Hero',
    Model: {
      kind: 'recognitionModel',
      delivery: 'remote',
      source: {url: 'https://example.test/pose/'},
    },
  },
  actors: {Hero: 'Idle'},
  scenes: {
    opening: [{wait: 0}],
    disabled: {recognitionModel: 'Model', actions},
    ...extra,
  },
});
function compile(input: unknown) {
  const result = frontend.parse(stringify(input, {aliasDuplicateObjects: false}));
  assert(result.ok, JSON.stringify(result.diagnostics));
  return result.storyDocument;
}
function index(input: unknown) {
  return createDsl4AssetDependencyIndex(compile(input));
}

for (const [name, actions] of [
  ['off', [off]],
  [
    'on inside off',
    [{invalidate: {condition: false, then: [{invalidate: {condition: true, then: [pose]}}]}}],
  ],
  ['off inside on', [{invalidate: {condition: true, then: [off]}}]],
  [
    'off inside conditional repetition',
    [{if: {condition: true, then: [{repeat: {times: 2, do: [off]}}]}}],
  ],
] as const) {
  test(`${name}: retains the model declaration but excludes it from every preparation phase`, () => {
    const story = compile(source([...actions]));
    const dependencies = createDsl4AssetDependencyIndex(story);
    assert(story.assets && Object.hasOwn(story.assets, 'Model'));
    assert.equal(
      (story.scenes as {id: string; recognitionModel: string}[]).find((s) => s.id === 'disabled')!
        .recognitionModel,
      'Model',
    );
    assert(!dependencies.startup.includes('Model'));
    assert.deepEqual(dependencies.scenes.disabled!.background, []);
    assert.deepEqual(dependencies.scenes.disabled!.all, []);
    assert.deepEqual(dependencies.scenes.opening!.prefetch, []);
  });
}

for (const action of [
  {invalidate: {condition: true, then: [pose]}},
  pose,
  {poseInputToChangeScene: {ready: 'ending'}},
  {imageInputToChangeScene: {ready: 'ending'}},
]) {
  test(`active ${Object.keys(action)[0]} still prepares a model also mentioned in an off body`, () => {
    const dependencies = index(source([off, action], {ending: []}));
    assert.deepEqual(dependencies.scenes.disabled!.background, ['Model']);
    assert.deepEqual(dependencies.scenes.opening!.prefetch, ['Model']);
  });
}

test('a shared model remains eligible in another active scene without loading for the off scene', () => {
  const dependencies = index(source([off], {active: {recognitionModel: 'Model', actions: [pose]}}));
  assert.deepEqual(dependencies.scenes.opening!.prefetch, []);
  assert.deepEqual(dependencies.scenes.disabled!.background, []);
  assert.deepEqual(dependencies.scenes.disabled!.prefetch, ['Model']);
  assert.deepEqual(dependencies.scenes.active!.background, ['Model']);
});

test('legacy declaration-only preloads and unrelated off actions retain their existing behavior', () => {
  for (const actions of [
    [],
    [{invalidate: {condition: false, then: [{wait: 1}]}}],
    [{invalidate: {condition: false, then: [{'Hero.custom': {arguments: {'Hero.pose': {}}}}]}}],
  ]) {
    const dependencies = index(source(actions));
    assert.deepEqual(dependencies.scenes.disabled!.background, ['Model']);
    assert.deepEqual(dependencies.scenes.opening!.prefetch, ['Model']);
  }
});

test('a model used only by OFF actions is not prefetched through another declaration-only scene', () => {
  const dependencies = index(
    source([off], {declaration: {recognitionModel: 'Model', actions: []}}),
  );
  for (const scene of Object.values(dependencies.scenes)) {
    assert.deepEqual(scene.background, []);
    assert.deepEqual(scene.prefetch, []);
  }
});

test('execution metadata survives serialization without removing editable definitions', () => {
  const story = JSON.parse(JSON.stringify(compile(source([off]))));
  assert.deepEqual(story.metadata.invalidatedRecognitionScenes, ['disabled']);
  assert.equal(
    story.scenes.find((scene: {id: string}) => scene.id === 'disabled').recognitionModel,
    'Model',
  );
  assert(story.assets.Model);
  assert.deepEqual(createDsl4AssetDependencyIndex(story).scenes.opening!.prefetch, []);
});

test('compiled distribution retains and validates the execution dependency metadata', async () => {
  const story = compile(source([off]));
  const artifact = await createDsl4CompiledStoryArtifact(story, {
    sourceIntegrity: `sha256-${'A'.repeat(43)}=`,
  });
  const restored = await validateDsl4CompiledStoryArtifact(JSON.parse(JSON.stringify(artifact)));
  assert.deepEqual(createDsl4AssetDependencyIndex(restored.story).scenes.opening!.prefetch, []);
  assert.deepEqual(
    (restored.story.metadata as Record<string, unknown>).invalidatedRecognitionScenes,
    ['disabled'],
  );
  assert(Object.hasOwn(restored.story.assets as object, 'Model'));
  for (const invalid of ['disabled', ['missing'], ['disabled', 'disabled'], [42]]) {
    await assert.rejects(
      createDsl4CompiledStoryArtifact(
        {
          ...story,
          metadata: {
            ...(story.metadata as object),
            invalidatedRecognitionScenes: invalid,
          },
        },
        {sourceIntegrity: `sha256-${'A'.repeat(43)}=`},
      ),
      {code: 'K4-COMPILED-STORY-001'},
    );
  }
});

const oldRunner =
  '// Kamishibai capabilities: narrative-control-v1\n// Kamishibai capabilities: invalidate-source-v1\n';
const capableRunner = oldRunner + dsl4InvalidatedRecognitionPreloadCapability + '\n';
const draft = {
  kamishibai: '4.0',
  assets: {
    Model: {
      kind: 'recognitionModel',
      delivery: 'remote',
      source: {url: 'https://example.test/pose/'},
    },
  },
  scenes: {
    opening: {recognitionModel: 'Model', actions: [{invalidate: {condition: false, then: [pose]}}]},
  },
};
const authoringBase = zipSync({
  'project.json': strToU8(
    JSON.stringify({
      targets: [{name: 'Stage', isStage: true, blocks: {}}],
      extensions: ['kubohiroyakamishibai4'],
    }),
  ),
});

test('block authoring rejects a source-only invalidation runner and accepts the preload-capable runner', () => {
  const options = {
    baseBytes: authoringBase,
    sourceText: stringify(draft),
    sourceFrontend: frontend,
  };
  assert.throws(() => authorDsl4BlockSourceSb3({...options, narrativeRuntimeSource: oldRunner}), {
    code: 'K4-INVALIDATE-PRELOAD-RUNTIME-001',
  });
  assert(authorDsl4BlockSourceSb3({...options, narrativeRuntimeSource: capableRunner}).ok);
});

test('include graph authoring enforces the same runtime capability as a standalone document', async () => {
  const files: Record<string, string> = {
    'main.k4.yml': stringify({...draft, scenes: undefined, include: ['scene.k4.yml']}),
    'scene.k4.yml': stringify({scenes: draft.scenes}),
  };
  const graph = await createDsl4SourceGraph('main.k4.yml', {
    readSource: async (name) => files[name]!,
  });
  const options = {baseBytes: authoringBase, sourceGraph: graph, sourceFrontend: frontend};
  await assert.rejects(
    authorDsl4BlockSourceGraphSb3({...options, narrativeRuntimeSource: oldRunner}),
    {code: 'K4-INVALIDATE-PRELOAD-RUNTIME-001'},
  );
  assert(
    (await authorDsl4BlockSourceGraphSb3({...options, narrativeRuntimeSource: capableRunner})).ok,
  );
});

test('disabled input actions suppress preparation without resolving draft routes', () => {
  for (const command of ['poseInputToChangeScene', 'imageInputToChangeScene']) {
    const dependencies = index(
      source([{invalidate: {condition: false, then: [{[command]: {ready: 'not-created'}}]}}]),
    );
    assert.deepEqual(dependencies.scenes.disabled!.background, []);
    assert.deepEqual(dependencies.scenes.opening!.prefetch, []);
  }
});

test('dedicated C block round-trip retains both the off body and its model declaration', () => {
  const input = source([off]);
  const blocks = createDsl4StructuredBlockSourceDeclaration({
    source: input,
    form: 'runtime',
    hatId: 'hat',
  });
  const output = readDsl4StructuredBlockSource(blocks, 'hat', (value) => {
    assert(Array.isArray(value) && Array.isArray(value[1]));
    return value[1][1];
  });
  assert.deepEqual(parse(output), input);
  assert.deepEqual(index(parse(output)).scenes.disabled!.background, []);
});

test('source and compiled builds require a preload-capable playback, including explicit overrides', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'invalidate-preload-build-'));
  try {
    const currentRunner = await readDsl4NarrativeRuntimeExtensionSource();
    assert(currentRunner.includes(dsl4InvalidatedRecognitionPreloadCapability));
    const project = JSON.parse(strFromU8(unzipSync(authoringBase)['project.json']!));
    project.extensionURLs = {
      kubohiroyakamishibai4:
        'data:text/javascript;base64,' + Buffer.from(currentRunner).toString('base64'),
    };
    await writeFile(
      path.join(directory, 'story.k4.yml'),
      stringify({...draft, controls: {keymaps: {production: {Space: 'navigation.nextAction'}}}}),
    );
    const options = {
      baseSb3Bytes: zipSync({'project.json': strToU8(JSON.stringify(project))}),
      projectRoot: directory,
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
    for (const distributionProfile of ['source', 'compiled'] as const) {
      await assert.rejects(
        buildDsl4RuntimeComponent({
          ...options,
          distributionProfile,
          runtimeExtensionSource: oldRunner,
        }),
        {code: 'K4-INVALIDATE-PRELOAD-RUNTIME-001'},
      );
      const built = await buildDsl4RuntimeComponent({
        ...options,
        distributionProfile,
        runtimeExtensionSource: currentRunner,
      });
      assert(built.runtimeComponent.ok);
      if (built.runtimeComponent.ok)
        assert.deepEqual(
          createDsl4AssetDependencyIndex(
            requireRecord(
              requireRecord(built.runtimeComponent, 'the runtime component').storyDocument,
              'the runtime story',
            ),
          ).scenes.opening!.background,
          [],
        );
    }
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

for (const enabled of [false, true]) {
  test(`remote lifecycle ${enabled ? 'fetches an active model' : 'never fetches an off-only model'} during startup and scene transitions`, async () => {
    const story = compile(source([{invalidate: {condition: enabled, then: [pose]}}]));
    const requests: string[] = [];
    const lifecycle = createDsl4RemoteAssetLifecycle({
      runtimeComponent: {
        storyDocument: story,
        assetBundle: {
          manifest: {
            assets: [
              {
                id: 'Idle',
                kind: 'costume',
                source: {type: 'project', target: 'Hero', name: 'Idle'},
              },
              {
                id: 'Model',
                kind: 'recognitionModel',
                source: {type: 'remote', url: 'https://example.test/pose/'},
              },
            ],
          },
        },
        getAssetFile() {
          throw new Error('No embedded file should be requested.');
        },
      },
      adapter: {prepare: (payload) => payload, release() {}},
      setLoading() {},
      loadRemoteAsset(payload) {
        const url = String(payload.url);
        requests.push(url);
        const text = url.endsWith('model.json')
          ? JSON.stringify({weightsManifest: [{paths: ['weights.bin'], weights: []}]})
          : '{}';
        return {
          bytes: new TextEncoder().encode(text),
          contentType: url.endsWith('.json') ? 'application/json' : 'application/octet-stream',
        };
      },
    });
    const owner = createDsl4GroupPreloadCoordinator({
      storyDocument: story,
      segmentId: 'invalidation',
      lifecycle,
    });
    try {
      const startup = await owner.prepareStartup(0);
      assert(startup.ok, 'error' in startup ? String(startup.error) : 'Startup cancelled');
      for (const [generation, scene] of ['opening', 'disabled'].entries()) {
        owner.beginScene(scene, generation + 1);
        assert((await owner.waitForScene(scene)).ok);
        await owner.commitScene(scene, 'test');
      }
      if (enabled) {
        assert(
          (await owner.waitForSceneAsset('disabled', 'Model', 3, new AbortController().signal)).ok,
        );
        assert.deepEqual(
          [...new Set(requests)].sort(),
          ['metadata.json', 'model.json', 'weights.bin'].map(
            (file) => 'https://example.test/pose/' + file,
          ),
        );
      } else {
        assert.deepEqual(requests, []);
        // A later real invocation can still load the retained declaration on demand.
        assert(
          (await owner.waitForSceneAsset('disabled', 'Model', 3, new AbortController().signal)).ok,
        );
        assert.equal(requests.length, 3);
      }
    } finally {
      await owner.release('test');
    }
  });
}
