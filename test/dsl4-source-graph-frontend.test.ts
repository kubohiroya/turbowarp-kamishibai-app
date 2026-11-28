import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {createDsl4SourceFrontend} from '../src/dsl4/source-frontend.js';
import {createDsl4SourceGraph} from '../src/dsl4/source-graph.js';
import {createDsl4SourceGraphFrontend} from '../src/dsl4/source-graph-frontend.js';
import {requireDefined, requireRecord} from './helpers/require-value.ts';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const schema = JSON.parse(
  await readFile(path.join(repositoryRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
);
const singleSourceFrontend = createDsl4SourceFrontend(schema);
const graphFrontend = createDsl4SourceGraphFrontend(singleSourceFrontend);
const enabledOptions = {
  featureFlags: {dsl4Runtime: true},
  maxComposedSourceBytes: 1024 * 1024,
};

function sourceLoader(sources: Record<string, string>) {
  const records = new Map(Object.entries(sources));
  return async (sourcePath: string) => {
    const record = records.get(sourcePath);
    if (record === undefined) throw new Error(`missing fixture: ${sourcePath}`);
    return record;
  };
}

async function sourceGraph(sources: Record<string, string>) {
  return createDsl4SourceGraph('story.kamishibai.yaml', {
    readSource: sourceLoader(sources),
  });
}

/**
 * The story document members this suite reads.
 *
 * The graph frontend declares its result document opaquely -- it is the composed output of many
 * sources -- so this says what the composition is expected to carry, once, instead of narrowing at
 * each assertion.
 */
interface ComposedStoryDocument {
  metadata: {sourceId: string};
  bubbleStyles: Record<string, unknown>;
  scenes: {id: string; actions: {sourceRange: unknown}[]}[];
  assets: Record<string, {file: string}>;
  sourceOrigins: Record<string, {sourceId: string}>;
  sourceMap: Record<string, {start: {line: number}}>;
}

/** Read the story document one parse produced. */
function storyDocument(parseResult: unknown): ComposedStoryDocument {
  return requireRecord(
    requireRecord(parseResult, 'the parse result').storyDocument,
    'the story document',
  ) as unknown as ComposedStoryDocument;
}

test('composes fragments in root-first discovery order and preserves per-source Story origins', async () => {
  const graph = await sourceGraph({
    'story.kamishibai.yaml': `
include: chapters/chapter1/scenario.kamishibai.yml
kamishibai: '4.0'
assets:
  HeroSkin: costume:Hero
actors:
  Hero: HeroSkin
bubbleStyles:
  novel:
    characterIntervalSeconds: 0.1
scenes:
  opening:
    - Hero.say:
        text: chapter one
        seconds: 1
        styles:
          - novel
    - goto: chapter1
`,
    'chapters/chapter1/scenario.kamishibai.yml': `
assets:
  ChapterBackground:
    kind: backdrop
    file: image/background.svg
scenes:
  chapter1:
    - stage: ChapterBackground
`,
  });

  const result = graphFrontend.parse(graph, {...enabledOptions, sourceId: 'main'});
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(storyDocument(result).metadata.sourceId, 'main');
  assert.deepEqual(storyDocument(result).bubbleStyles, {
    novel: {characterIntervalSeconds: 0.1},
  });
  assert.deepEqual(
    storyDocument(result).scenes.map(({id}) => id),
    ['opening', 'chapter1'],
  );
  assert.equal(
    requireDefined(storyDocument(result).assets.ChapterBackground, 'the chapter background').file,
    'chapters/chapter1/image/background.svg',
  );
  const actionPath = '/scenes/chapter1/actions/0';
  assert.equal(
    requireDefined(storyDocument(result).sourceOrigins[actionPath], 'the action origin').sourceId,
    'chapters/chapter1/scenario.kamishibai.yml',
  );
  assert.equal(
    requireDefined(storyDocument(result).sourceMap[actionPath], 'the action source map').start.line,
    8,
  );
  assert.deepEqual(
    requireDefined(
      requireDefined(storyDocument(result).scenes[1], 'the second scene').actions[0],
      'its first action',
    ).sourceRange,
    storyDocument(result).sourceMap[actionPath],
  );
  assert.doesNotMatch(result.canonicalSource, /^include:/mu);
  assert.match(result.canonicalSource, /chapters\/chapter1\/image\/background\.svg/u);
  assert.equal(Object.isFrozen(storyDocument(result).sourceOrigins), true);
});

test('projects semantic diagnostics to the included source and original range', async () => {
  const graph = await sourceGraph({
    'story.kamishibai.yaml': `
include: chapter.kamishibai.yaml
kamishibai: '4.0'
scenes:
  opening:
    - goto: chapter1
`,
    'chapter.kamishibai.yaml': `
scenes:
  chapter1:
    - stage: MissingBackground
`,
  });
  const result = graphFrontend.parse(graph, enabledOptions);
  assert.equal(result.ok, false);
  assert.equal(requireDefined(result.diagnostics[0], 'the first diagnostic').code, 'K4-REF-001');
  assert.equal(
    requireDefined(result.diagnostics[0], 'the first diagnostic').sourceId,
    'chapter.kamishibai.yaml',
  );
  assert.equal(requireDefined(result.diagnostics[0], 'the first diagnostic').range.start.line, 4);
});

test('rejects entry-only version declarations and unknown fragment fields at their source', async () => {
  const versionGraph = await sourceGraph({
    'story.kamishibai.yaml': `
include: chapter.kamishibai.yaml
kamishibai: '4.0'
scenes:
  opening: []
`,
    'chapter.kamishibai.yaml': `
kamishibai: '4.0'
scenes:
  chapter1: []
`,
  });
  const versionResult = graphFrontend.parse(versionGraph, enabledOptions);
  assert.equal(versionResult.ok, false);
  assert.equal(
    requireDefined(versionResult.diagnostics[0], 'the first diagnostic').code,
    'K4-INCLUDE-ROOT-ONLY',
  );
  assert.equal(
    requireDefined(versionResult.diagnostics[0], 'the first diagnostic').sourceId,
    'chapter.kamishibai.yaml',
  );
  assert.equal(
    requireDefined(versionResult.diagnostics[0], 'the first diagnostic').range.start.line,
    2,
  );

  const unknownGraph = await sourceGraph({
    'story.kamishibai.yaml': `
include: chapter.kamishibai.yaml
kamishibai: '4.0'
scenes:
  opening: []
`,
    'chapter.kamishibai.yaml': 'unknownFragmentField: true\n',
  });
  const unknownResult = graphFrontend.parse(unknownGraph, enabledOptions);
  assert.equal(unknownResult.ok, false);
  assert.equal(
    requireDefined(unknownResult.diagnostics[0], 'the first diagnostic').code,
    'K4-SCHEMA-UNKNOWN-KEY',
  );
  assert.equal(
    requireDefined(unknownResult.diagnostics[0], 'the first diagnostic').sourceId,
    'chapter.kamishibai.yaml',
  );
  assert.equal(
    requireDefined(unknownResult.diagnostics[0], 'the first diagnostic').range.start.line,
    1,
  );
});

test('applies restricted YAML rules independently to every included source', async () => {
  const graph = await sourceGraph({
    'story.kamishibai.yaml': `
include: chapter.kamishibai.yaml
kamishibai: '4.0'
scenes:
  opening: []
`,
    'chapter.kamishibai.yaml': `
scenes:
  chapter1: &actions []
  chapter2: *actions
`,
  });
  const result = graphFrontend.parse(graph, enabledOptions);
  assert.equal(result.ok, false);
  assert.equal(
    result.diagnostics.every(({code}) => code === 'K4-YAML-003'),
    true,
  );
  assert.equal(
    result.diagnostics.every(({sourceId}) => sourceId === 'chapter.kamishibai.yaml'),
    true,
  );
});

test('composes without a flag and still requires a composed-source byte limit', async () => {
  const graph = await sourceGraph({
    'story.kamishibai.yaml': `
kamishibai: '4.0'
scenes:
  opening: []
`,
  });
  assert.throws(() => graphFrontend.parse(graph), /maxComposedSourceBytes/u);
  assert.throws(
    () => graphFrontend.parse(graph, {featureFlags: {dsl4Runtime: true}}),
    /maxComposedSourceBytes/u,
  );
  const parsed = graphFrontend.parse(graph, {maxComposedSourceBytes: 1024});
  assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
});

test('accepts the exact composed-source byte limit and rejects one byte less', async () => {
  const graph = await sourceGraph({
    'story.kamishibai.yaml': "include: chapter.k4.yml\nkamishibai: '4.0'\nscenes: {opening: []}\n",
    'chapter.k4.yml': 'scenes: {chapter: []}\n',
  });
  const prepared = graphFrontend.parse(graph, enabledOptions);
  assert.equal(prepared.ok, true, JSON.stringify(prepared.diagnostics));
  const byteLength = new TextEncoder().encode(prepared.canonicalSource).byteLength;

  const boundary = graphFrontend.parse(graph, {
    ...enabledOptions,
    maxComposedSourceBytes: byteLength,
  });
  assert.equal(boundary.ok, true, JSON.stringify(boundary.diagnostics));

  const overflow = graphFrontend.parse(graph, {
    ...enabledOptions,
    maxComposedSourceBytes: byteLength - 1,
  });
  assert.equal(overflow.ok, false);
  assert.equal(
    requireDefined(overflow.diagnostics[0], 'the first diagnostic').code,
    'K4-SOURCE-LIMIT-BYTES-001',
  );
  assert.equal(
    requireDefined(overflow.diagnostics[0], 'the first diagnostic').sourceId,
    'story.kamishibai.yaml',
  );
  assert.equal(requireDefined(overflow.diagnostics[0], 'the first diagnostic').range.start.line, 1);
});

test('fails closed for malformed graph topology and non-string fragment keys', async () => {
  const graph = await sourceGraph({
    'story.kamishibai.yaml': `
include: chapter.k4.yml
kamishibai: '4.0'
scenes:
  opening: []
`,
    'chapter.k4.yml': 'scenes: {chapter: []}\n',
  });
  const malformed = structuredClone(graph);
  malformed.order.pop();
  assert.throws(
    () => graphFrontend.parse(malformed, enabledOptions),
    /topology counts must match/u,
  );

  const invalidKeyGraph = await sourceGraph({
    'story.kamishibai.yaml': `
include: chapter.k4.yml
kamishibai: '4.0'
scenes:
  opening: []
`,
    'chapter.k4.yml': '? [invalid]\n: true\n',
  });
  const result = graphFrontend.parse(invalidKeyGraph, enabledOptions);
  assert.equal(result.ok, false);
  assert.equal(requireDefined(result.diagnostics[0], 'the first diagnostic').code, 'K4-YAML-001');
  assert.equal(
    requireDefined(result.diagnostics[0], 'the first diagnostic').sourceId,
    'chapter.k4.yml',
  );
});

test('composes a fixed viewport singleton without losing its normalized declaration', async () => {
  const graph = await sourceGraph({
    'story.kamishibai.yaml': "kamishibai: '4.0'\ninclude: view.k4.yml\nscenes: {opening: []}",
    'view.k4.yml': 'viewport: {width: 360, height: 640, fit: cover}',
  });
  const result = graphFrontend.parse(graph, enabledOptions);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(
    requireRecord(requireRecord(result, 'composed result').storyDocument, 'viewport story')
      .viewport,
    {
      width: 360,
      height: 640,
      orientation: 'portrait',
      fit: 'cover',
    },
  );
});
