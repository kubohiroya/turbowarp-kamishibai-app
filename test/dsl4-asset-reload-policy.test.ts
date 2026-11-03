import assert from 'node:assert/strict';
import {createHash, webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {
  classifyDsl4AssetReload,
  createDsl4AssetReloadSnapshot,
} from '../src/dsl4/asset-reload-policy.js';
import {createDsl4SourceFrontend} from '../src/dsl4/source-frontend.js';
import {requireDefined, requireRecord} from './helpers/require-value.ts';
import {thrown} from './helpers/thrown-error.ts';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const schema = JSON.parse(
  await readFile(path.join(repositoryRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
);
const frontend = createDsl4SourceFrontend(schema);

function sri(value: string) {
  return `sha256-${createHash('sha256').update(value).digest('base64')}`;
}

function parse(source: string): Readonly<Record<string, unknown>> {
  const result = frontend.parse(source, {sourceId: 'asset-reload-policy-test'});
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return requireRecord(result.storyDocument, 'the parsed story document');
}

/** One asset as the StoryDocument declares it, in the members this manifest builder reads. */
interface StoryAsset {
  kind: string;
  loading: string;
  target?: string;
  file?: string;
  name?: string;
}

function manifest(storyDocument: unknown, integrities: Record<string, string> = {}) {
  const assets = requireRecord(
    requireRecord(storyDocument, 'the story document').assets,
    'its assets',
  ) as Record<string, StoryAsset>;
  return {
    formatVersion: 1,
    assets: Object.entries(assets)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([id, asset]) => ({
        id,
        kind: asset.kind,
        loading: asset.loading,
        ...(asset.target === undefined ? {} : {target: asset.target}),
        source:
          typeof asset.file === 'string'
            ? {
                type: 'file',
                inputPath: asset.file,
                mode: asset.kind === 'recognitionModel' ? 'directory' : 'file',
                files:
                  asset.kind === 'recognitionModel'
                    ? [
                        {path: 'metadata.json', size: 20, integrity: sri(`${id}:metadata`)},
                        {path: 'model.json', size: 20, integrity: sri(`${id}:model`)},
                        {path: 'weights.bin', size: 20, integrity: sri(`${id}:weights`)},
                      ]
                    : [
                        {
                          path: asset.file.split('/').at(-1),
                          size: 20,
                          integrity: integrities[id] ?? sri(`${id}:v1`),
                        },
                      ],
              }
            : {type: 'project', name: asset.name},
      })),
  };
}

const baseStory = parse(`
kamishibai: '4.0'
assets:
  ProjectBackdrop: backdrop
  Ocean:
    kind: backdrop
    file: ocean.svg
    loading: lazy
  Hero:
    kind: costume
    target: Hero
    file: hero.png
actors:
  Hero: Hero
scenes:
  opening:
    - stage: Ocean
    - Hero.setSkin: Hero
`);

const additiveStory = parse(`
kamishibai: '4.0'
assets:
  ProjectBackdrop: backdrop
  Ocean:
    kind: backdrop
    file: ocean.svg
    loading: lazy
  Hero:
    kind: costume
    target: Hero
    file: hero.png
  Bell:
    kind: sound
    file: bell.wav
actors:
  Hero: Hero
scenes:
  opening:
    - stage: Ocean
    - Hero.setSkin: Hero
    - sound: Bell
`);

/**
 * A cloned snapshot the full-rebuild cases corrupt on purpose.
 *
 * A snapshot is deeply frozen and declared read-only, which is what the classifier relies on, so
 * the cases that rename an asset or change a fingerprint cannot write through that type. The clone
 * is theirs to break, and this says so once.
 */
interface MutableSnapshot extends Record<string, unknown> {
  sourceIntegrity: unknown;
  structuralFingerprint: unknown;
  graph: {id: string; kind: string; source: {inputPath: string; files: string[]}}[];
}

function mutableSnapshot(snapshot: unknown): MutableSnapshot {
  return structuredClone(snapshot) as MutableSnapshot;
}

/** Read the graph entry the mutation cases rewrite. */
function secondEntry(candidate: MutableSnapshot) {
  return requireDefined(candidate.graph[1], 'the second graph entry');
}

/** What one snapshot case varies. */
interface SnapshotOptions {
  storyDocument?: Readonly<Record<string, unknown>>;
  source?: string;
  structure?: string;
  integrities?: Record<string, string>;
}

async function snapshot({
  storyDocument = baseStory,
  source = 'source-v1',
  structure = 'structure-v1',
  integrities,
}: SnapshotOptions = {}) {
  return createDsl4AssetReloadSnapshot({
    storyDocument,
    manifest: manifest(storyDocument, integrities),
    sourceIntegrity: sri(source),
    structuralFingerprint: sri(structure),
    subtleCrypto: webcrypto.subtle,
  });
}

test('creates one deterministic redacted asset graph and content snapshot', async () => {
  const first = await snapshot();
  const second = await snapshot();

  assert.deepEqual(first, second);
  assert.equal(first.kind, 'Dsl4AssetReloadSnapshot');
  const oceanGraph = requireDefined(
    first.graph.find(({id}) => id === 'Ocean'),
    'the Ocean graph entry',
  );
  assert.equal(oceanGraph.source.inputPath, 'ocean.svg');
  assert.deepEqual(oceanGraph.source.files, ['ocean.svg']);
  const oceanContent = requireDefined(
    first.content.find(({id}) => id === 'Ocean'),
    'the Ocean content entry',
  );
  const oceanFile = requireDefined(
    requireDefined(oceanContent.source.files, 'the Ocean content files')[0],
    'its first file',
  );
  assert.equal(requireRecord(oceanFile, 'the Ocean content file').integrity, sri('Ocean:v1'));
  assert.deepEqual(
    requireDefined(first.dependencies.scenes.opening, 'the opening scene dependencies').all,
    ['Hero', 'Ocean'],
  );
  assert.equal(JSON.stringify(first).includes(repositoryRoot), false);
  assert.equal(JSON.stringify(first).includes('<svg'), false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.content), true);
});

test('classifies source, content, composite, and no-change candidates', async () => {
  const active = await snapshot();
  const cases = [
    {candidate: await snapshot(), kind: 'no-change', changed: []},
    {
      candidate: await snapshot({source: 'source-v2'}),
      kind: 'source-live-reload',
      changed: [],
    },
    {
      candidate: await snapshot({integrities: {Ocean: sri('ocean-v2')}}),
      kind: 'asset-live-reload',
      changed: ['Ocean'],
    },
    {
      candidate: await snapshot({source: 'source-v2', integrities: {Hero: sri('hero-v2')}}),
      kind: 'composite-live-reload',
      changed: ['Hero'],
    },
  ];

  for (const item of cases) {
    const result = classifyDsl4AssetReload({active, candidate: item.candidate});
    assert.equal(result.kind, item.kind);
    assert.deepEqual(
      result.changedAssets.map((asset) => requireRecord(asset, 'a changed asset').id),
      item.changed,
    );
    assert.equal(result.requiresFullRebuild, false);
    assert.equal(Object.isFrozen(result), true);
  }
  const content = classifyDsl4AssetReload({
    active,
    candidate: await snapshot({integrities: {Ocean: sri('ocean-v2')}}),
  });
  assert.deepEqual(content.affectedScenes, ['opening']);
});

test('accepts only source-backed safe additions as additive composite reload', async () => {
  const active = await snapshot();
  const candidate = await snapshot({storyDocument: additiveStory, source: 'source-v2'});
  const result = classifyDsl4AssetReload({active, candidate});

  assert.equal(result.kind, 'additive-composite-live-reload');
  assert.deepEqual(
    result.changedAssets.map((asset) => {
      const changed = requireRecord(asset, 'a changed asset');
      return [changed.id, changed.change];
    }),
    [['Bell', 'added']],
  );
  assert.deepEqual(result.affectedScenes, ['opening']);

  const unchangedSource = mutableSnapshot(candidate);
  unchangedSource.sourceIntegrity = active.sourceIntegrity;
  assert.equal(classifyDsl4AssetReload({active, candidate: unchangedSource}).kind, 'full-rebuild');
});

test('forces full rebuild for structural, removal, rename, kind, path, and bundle-shape changes', async () => {
  const active = await snapshot();
  const mutations: readonly ((candidate: MutableSnapshot) => void)[] = [
    (candidate) => (candidate.structuralFingerprint = sri('structure-v2')),
    (candidate) => candidate.graph.pop(),
    (candidate) => (secondEntry(candidate).id = 'Renamed'),
    (candidate) => (secondEntry(candidate).kind = 'sound'),
    (candidate) => (secondEntry(candidate).source.inputPath = 'renamed.svg'),
    (candidate) => secondEntry(candidate).source.files.push('extra.bin'),
  ];
  for (const mutate of mutations) {
    const candidate = mutableSnapshot(active);
    mutate(candidate);
    const result = classifyDsl4AssetReload({active, candidate});
    assert.equal(result.kind, 'full-rebuild');
    assert.equal(result.requiresFullRebuild, true);
    assert.equal(result.requiresNewPreviewSession, true);
  }
});

test('does not classify mutable project asset state as a file asset reload', async () => {
  const active = await snapshot();
  const candidate = structuredClone(active);
  const projectAsset = requireDefined(
    candidate.content.find(({id}) => id === 'ProjectBackdrop'),
    'the ProjectBackdrop content entry',
  );
  assert.deepEqual(projectAsset.source, {type: 'project', name: 'ProjectBackdrop'});
  assert.equal(classifyDsl4AssetReload({active, candidate}).kind, 'no-change');
});

test('rejects malformed or noncanonical snapshot boundaries', async () => {
  const active = await snapshot();
  assert.throws(
    () => classifyDsl4AssetReload({active, candidate: {...active, sourceIntegrity: 'invalid'}}),
    TypeError,
  );
  await assert.rejects(
    createDsl4AssetReloadSnapshot({
      storyDocument: baseStory,
      manifest: {...manifest(baseStory), extra: true},
      sourceIntegrity: sri('source'),
      structuralFingerprint: sri('structure'),
      subtleCrypto: webcrypto.subtle,
    }),
    (error) => thrown(error).code === 'K4-ASSET-BUNDLE-DESCRIPTOR-001',
  );
});
