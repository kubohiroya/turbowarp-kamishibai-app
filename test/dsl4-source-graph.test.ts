import assert from 'node:assert/strict';
import {test} from 'vitest';

import {
  createDsl4SourceGraph,
  Dsl4SourceGraphError,
  resolveDsl4IncludePath,
  resolveDsl4SourceRelativeAssetPath,
} from '../src/dsl4/source-graph.js';
import {dsl4DefaultFeatureFlags, resolveDsl4FeatureFlags} from '../src/dsl4/feature-flags.js';
import {thrown} from './helpers/thrown-error.ts';
import {requireArray, requireRecord, requireString} from './helpers/require-value.ts';

function sourceLoader(sources: Record<string, string>, calls: string[] = []) {
  const records = new Map(Object.entries(sources));
  return async (sourcePath: string) => {
    calls.push(sourcePath);
    const record = records.get(sourcePath);
    if (record === undefined) throw new Error(`missing fixture: ${sourcePath}`);
    return record;
  };
}

async function rejectsCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error) => {
    assert.equal(error instanceof Dsl4SourceGraphError, true);
    assert.equal(thrown(error).code, code);
    return true;
  });
}

test('resolves include and asset paths from the declaring source directory', () => {
  assert.equal(
    resolveDsl4IncludePath('story.k4.yml', 'chapters/chapter1.k4.yaml'),
    'chapters/chapter1.k4.yaml',
  );
  assert.equal(
    resolveDsl4IncludePath(
      'chapters/chapter1/scenario.kamishibai.yml',
      '../../shared/assets.kamishibai.yaml',
    ),
    'shared/assets.kamishibai.yaml',
  );
  assert.equal(
    resolveDsl4SourceRelativeAssetPath(
      'chapters/chapter1/scenario.kamishibai.yml',
      'image/hero.png',
    ),
    'chapters/chapter1/image/hero.png',
  );
  assert.throws(
    () =>
      resolveDsl4SourceRelativeAssetPath(
        'chapters/chapter1/scenario.kamishibai.yml',
        '../../../outside.png',
      ),
    (error) => thrown(error).code === 'K4-SOURCE-PATH-001',
  );
  assert.throws(
    () => resolveDsl4IncludePath('story.kamishibai.yaml', 'https://example.com/story.yaml'),
    (error) => thrown(error).code === 'K4-SOURCE-PATH-001',
  );
});

test('builds a deterministic DAG, deduplicates source nodes, and indexes declarations', async () => {
  const calls: string[] = [];
  const graph = await createDsl4SourceGraph('story.kamishibai.yaml', {
    readSource: sourceLoader(
      {
        'story.kamishibai.yaml': `
include:
  - chapters/chapter1/scenario.kamishibai.yml
  - shared/assets.kamishibai.yaml
kamishibai: '4.0'
actors:
  Hero: Hero
bubbleStyles:
  novel:
    characterIntervalSeconds: 0.1
scenes:
  opening: []
`,
        'chapters/chapter1/scenario.kamishibai.yml': `
include: ../../shared/assets.kamishibai.yaml
assets:
  Hero:
    kind: costume
    target: Hero
    file: image/hero.png
scenes:
  chapter1: []
`,
        'shared/assets.kamishibai.yaml': `
assets:
  Theme:
    kind: sound
    file: audio/theme.ogg
`,
      },
      calls,
    ),
  });

  assert.deepEqual(calls, [
    'story.kamishibai.yaml',
    'chapters/chapter1/scenario.kamishibai.yml',
    'shared/assets.kamishibai.yaml',
  ]);
  assert.deepEqual(graph.order, [
    'shared/assets.kamishibai.yaml',
    'chapters/chapter1/scenario.kamishibai.yml',
    'story.kamishibai.yaml',
  ]);
  assert.deepEqual(graph.discoveryOrder, [
    'story.kamishibai.yaml',
    'chapters/chapter1/scenario.kamishibai.yml',
    'shared/assets.kamishibai.yaml',
  ]);
  assert.equal(graph.sourceCount, 3);
  assert.equal(graph.includeDepth, 2);
  assert.deepEqual(
    graph.assetFiles.map((file) => {
      const record = requireRecord(file, 'an asset file');
      return [record.assetId, record.path];
    }),
    [
      ['Theme', 'shared/audio/theme.ogg'],
      ['Hero', 'chapters/chapter1/image/hero.png'],
    ],
  );
  assert.deepEqual(
    graph.declarations.map(({namespace, name}) => [namespace, name]),
    [
      ['actors', 'Hero'],
      ['bubbleStyles', 'novel'],
      ['scenes', 'opening'],
      ['assets', 'Hero'],
      ['scenes', 'chapter1'],
      ['assets', 'Theme'],
    ],
  );
  assert.equal(Object.isFrozen(graph), true);
  assert.equal(Object.isFrozen(graph.nodes), true);
  assert.equal(Object.isFrozen(graph.assetFiles[0]), true);
});

test('rejects direct and indirect include cycles with the complete cycle path', async () => {
  await assert.rejects(
    createDsl4SourceGraph('story.kamishibai.yaml', {
      readSource: sourceLoader({
        'story.kamishibai.yaml': `
include: story.kamishibai.yaml
assets:
  MustNotResolveBeforeCycle:
    kind: backdrop
    file: ../outside.png
`,
      }),
    }),
    (error) => {
      assert.equal(thrown(error).code, 'K4-INCLUDE-CYCLE');
      assert.deepEqual(thrown(error).cycle, ['story.kamishibai.yaml', 'story.kamishibai.yaml']);
      return true;
    },
  );

  await assert.rejects(
    createDsl4SourceGraph('story.kamishibai.yaml', {
      readSource: sourceLoader({
        'story.kamishibai.yaml': 'include: chapters/one.kamishibai.yaml\n',
        'chapters/one.kamishibai.yaml': 'include: two.kamishibai.yaml\n',
        'chapters/two.kamishibai.yaml': 'include: one.kamishibai.yaml\n',
      }),
    }),
    (error) => {
      assert.equal(thrown(error).code, 'K4-INCLUDE-CYCLE');
      assert.deepEqual(thrown(error).cycle, [
        'chapters/one.kamishibai.yaml',
        'chapters/two.kamishibai.yaml',
        'chapters/one.kamishibai.yaml',
      ]);
      return true;
    },
  );
});

test('rejects duplicate declarations without root or include precedence', async () => {
  await assert.rejects(
    createDsl4SourceGraph('story.kamishibai.yaml', {
      readSource: sourceLoader({
        'story.kamishibai.yaml': `
include: chapter.kamishibai.yaml
assets:
  Hero: costume:Hero
`,
        'chapter.kamishibai.yaml': `
assets:
  Hero: costume:Hero
`,
      }),
    }),
    (error) => {
      assert.equal(thrown(error).code, 'K4-DECLARATION-DUPLICATE');
      assert.equal(thrown(error).sourceId, 'chapter.kamishibai.yaml');
      assert.equal(
        requireRecord(
          requireArray(thrown(error).related, 'the related diagnostics')[0],
          'the first related diagnostic',
        ).sourceId,
        'story.kamishibai.yaml',
      );
      assert.match(requireString(thrown(error).message, 'the message'), /assets\.Hero/u);
      return true;
    },
  );

  await rejectsCode(
    createDsl4SourceGraph('story.kamishibai.yaml', {
      readSource: sourceLoader({
        'story.kamishibai.yaml': 'include: chapter.kamishibai.yaml\ncontrols: {}\n',
        'chapter.kamishibai.yaml': 'controls: {}\n',
      }),
    }),
    'K4-DECLARATION-DUPLICATE',
  );
});

test('keeps declaration namespaces independent', async () => {
  const graph = await createDsl4SourceGraph('story.kamishibai.yaml', {
    readSource: sourceLoader({
      'story.kamishibai.yaml': `
include: chapter.kamishibai.yaml
actors:
  Hero: HeroSkin
`,
      'chapter.kamishibai.yaml': `
assets:
  Hero: costume:Hero
`,
    }),
  });
  assert.deepEqual(
    graph.declarations.map(({namespace, name}) => [namespace, name]),
    [
      ['actors', 'Hero'],
      ['assets', 'Hero'],
    ],
  );
});

test('enforces finite file, byte, and include-depth limits', async () => {
  const sources = {
    'story.kamishibai.yaml': 'include: one.kamishibai.yaml\n',
    'one.kamishibai.yaml': 'include: two.kamishibai.yaml\n',
    'two.kamishibai.yaml': 'scenes: {}\n',
  };
  await rejectsCode(
    createDsl4SourceGraph('story.kamishibai.yaml', {
      readSource: sourceLoader(sources),
      limits: {maxSourceFiles: 2},
    }),
    'K4-INCLUDE-LIMIT-001',
  );
  await rejectsCode(
    createDsl4SourceGraph('story.kamishibai.yaml', {
      readSource: sourceLoader(sources),
      limits: {maxIncludeDepth: 1},
    }),
    'K4-INCLUDE-LIMIT-001',
  );
  await rejectsCode(
    createDsl4SourceGraph('story.kamishibai.yaml', {
      readSource: sourceLoader({'story.kamishibai.yaml': 'scenes: {}\n'}),
      limits: {maxSourceBytes: 4},
    }),
    'K4-SOURCE-SIZE-001',
  );
  await rejectsCode(
    createDsl4SourceGraph('story.k4.yml', {
      readSource: sourceLoader({'story.k4.yml': 'scenes: {}\r\n'}),
      limits: {maxSourceBytes: 11},
    }),
    'K4-SOURCE-SIZE-001',
  );
  await rejectsCode(
    createDsl4SourceGraph('story.kamishibai.yaml', {
      readSource: sourceLoader(sources),
      limits: {maxTotalSourceBytes: 40},
    }),
    'K4-INCLUDE-LIMIT-001',
  );
});

test('accepts exact individual and graph-total byte limits and rejects one byte less', async () => {
  const sources = {
    'story.k4.yml': 'include: chapter.k4.yml\nscenes: {}\n',
    'chapter.k4.yml': 'assets: {}\n',
  };
  const encoder = new TextEncoder();
  const individualLimit = Math.max(
    ...Object.values(sources).map((source) => encoder.encode(source).byteLength),
  );
  const totalLimit = Object.values(sources).reduce(
    (total, source) => total + encoder.encode(source).byteLength,
    0,
  );
  const boundary = await createDsl4SourceGraph('story.k4.yml', {
    readSource: sourceLoader(sources),
    limits: {maxSourceBytes: individualLimit, maxTotalSourceBytes: totalLimit},
  });
  assert.equal(boundary.totalSourceBytes, totalLimit);

  await rejectsCode(
    createDsl4SourceGraph('story.k4.yml', {
      readSource: sourceLoader(sources),
      limits: {maxSourceBytes: individualLimit - 1, maxTotalSourceBytes: totalLimit},
    }),
    'K4-SOURCE-SIZE-001',
  );
  await rejectsCode(
    createDsl4SourceGraph('story.k4.yml', {
      readSource: sourceLoader(sources),
      limits: {maxSourceBytes: individualLimit, maxTotalSourceBytes: totalLimit - 1},
    }),
    'K4-INCLUDE-LIMIT-001',
  );
});

test('accepts the retired include flag without letting it change the resolved flags', () => {
  assert.equal(Object.hasOwn(dsl4DefaultFeatureFlags, 'dsl4SourceIncludes'), false);
  for (const value of [true, false]) {
    const resolved = resolveDsl4FeatureFlags({dsl4SourceIncludes: value});
    assert.deepEqual(resolved, dsl4DefaultFeatureFlags);
    assert.equal(Object.isFrozen(resolved), true);
  }
  assert.throws(() => resolveDsl4FeatureFlags({dsl4SourceIncludes: 1}), /must be boolean/u);
});
