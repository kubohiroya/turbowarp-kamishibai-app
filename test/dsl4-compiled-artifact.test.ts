import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'vitest';

import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate';

import {
  buildDsl4RuntimeComponent,
  removeDsl4BlockSourceDeclarations,
} from '../src/builder/index.js';
import {parseCliArguments} from '../src/builder/cli.js';
import {authorDsl4BlockSourceGraphSb3} from '../src/builder/dsl4-block-source-author.js';
import {createDsl4SourceGraph} from '../src/dsl4/source-graph.js';
import {
  computeDsl4Sha256Integrity,
  createDsl4CompiledStoryArtifact,
  createDsl4SourceFrontend,
  Dsl4CompiledStoryError,
  loadDsl4RuntimeComponent,
  validateDsl4CompiledStoryArtifact,
} from '../src/dsl4/index.js';
import {
  dsl4ConfigBlockSourceHatOpcode,
  dsl4LabeledBlockSourceHatOpcode,
} from '../src/dsl4/structured-block-source.js';
import {createDsl4RuntimeController} from '../src/dsl4/runtime-controller.js';
import contract from './fixtures/dsl4/narrative-control-contract.json' with {type: 'json'};
import {createDsl4TestProductionSourceFrontend} from './helpers/dsl4-test-frontend.ts';
import {requireRecord} from './helpers/require-value.ts';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const schema = JSON.parse(
  await readFile(path.join(repositoryRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
);
const frontend = createDsl4SourceFrontend(schema);
const subtleCrypto = webcrypto.subtle;
const sourceFilename = 'story.kamishibai.yaml';
const sourceManifest = Object.freeze({
  formatVersion: 1,
  mode: 'external',
  sourceId: 'main',
  path: sourceFilename,
  cacheId: 'story000000000001',
  cacheDatabaseName: 'tw-kamishibai-assets-v1--story--story000000000001',
});
// The comment is authoring text: it must not survive into a compiled artifact.
const commentMarker = 'authoring-note-7f3a';
const source = `
kamishibai: '4.0'
# ${commentMarker}: keep the opening short
assets:
  OpeningImage:
    kind: backdrop
    file: assets/opening.svg
    loading: lazy
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    actions:
      - stage: OpeningImage
      - wait: 1
`;

function baseSb3() {
  const project = {
    extensionStorage: {localstorage: {namespace: 'kamishibai'}},
    targets: [
      {
        isStage: true,
        name: 'Stage',
        variables: {},
        lists: {},
        broadcasts: {},
        blocks: {start: {opcode: 'event_whenflagclicked', next: null, parent: null}},
      },
    ],
    monitors: [],
  };
  return Buffer.from(zipSync({'project.json': strToU8(`${JSON.stringify(project)}\n`)}));
}

async function withProject<T>(callback: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsl4-compiled-artifact-'));
  try {
    await mkdir(path.join(directory, 'assets'));
    await writeFile(path.join(directory, sourceFilename), source);
    await writeFile(path.join(directory, 'assets', 'opening.svg'), '<svg/>');
    return await callback(directory);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
}

function build(directory: string, channel: 'bundled' | 'unbundled', profile?: 'compiled') {
  return buildDsl4RuntimeComponent({
    baseSb3Bytes: baseSb3(),
    projectRoot: directory,
    sourceManifest,
    sourceFrontend: frontend,
    controlProfile: 'production',
    channel,
    maxSourceBytes: 16 * 1024,
    maxAssetFileBytes: 4096,
    maxAssetFiles: 10,
    maxTotalAssetBytes: 16 * 1024,
    subtleCrypto,
    ...(profile === undefined ? {} : {distributionProfile: profile}),
  });
}

function runtimeStorage(project: unknown, channel: 'bundled' | 'unbundled') {
  const storage = requireRecord(requireRecord(project, 'project').extensionStorage, 'storage');
  if (channel === 'unbundled')
    return requireRecord(storage.kubohiroyakamishibairuntime4, 'runtime');
  const bundle = requireRecord(storage.kubohiroyakamishibai4, 'bundle');
  return requireRecord(
    requireRecord(bundle.components, 'components').kubohiroyakamishibairuntime4,
    'runtime',
  );
}

/** Every text-decodable entry of an SB3, joined, so a leak anywhere in the archive is visible. */
function archiveText(bytes: Uint8Array) {
  return Object.values(unzipSync(bytes))
    .map((entry) => strFromU8(entry, true))
    .join('\n');
}

function withoutSourceRanges(scenes: unknown) {
  return JSON.parse(JSON.stringify(scenes), (key, value) =>
    key === 'sourceRange' ? undefined : value,
  );
}

const loadOptions = {
  maxSourceBytes: 16 * 1024,
  maxAssetFiles: 10,
  maxTotalAssetBytes: 16 * 1024,
  subtleCrypto,
};

test('compiles a deterministic SB3 without YAML, comments, paths, or source maps', async () => {
  await withProject(async (directory) => {
    for (const channel of ['unbundled', 'bundled'] as const) {
      const sourceBuild = await build(directory, channel);
      const first = await build(directory, channel, 'compiled');
      const second = await build(directory, channel, 'compiled');
      assert.equal(
        JSON.stringify(requireRecord(sourceBuild.project, 'source project').targets).includes(
          'embeddedYaml',
        ),
        true,
      );
      assert.equal(
        JSON.stringify(requireRecord(first.project, 'compiled project').targets).includes(
          'embeddedYaml',
        ),
        false,
      );
      assert.deepEqual(first.bytes, second.bytes, 'compiled builds are deterministic');

      const sourceText = archiveText(sourceBuild.bytes);
      assert.ok(sourceText.includes(commentMarker), 'the source profile keeps the YAML');
      const compiledText = archiveText(first.bytes);
      for (const leak of [commentMarker, sourceFilename, 'kamishibai: ', directory]) {
        assert.equal(compiledText.includes(leak), false, `compiled SB3 leaks ${leak}`);
      }
      for (const key of ['"sourceMap"', '"sourceRange"', '"sourceOrigins"']) {
        assert.equal(compiledText.includes(key), false, `compiled SB3 keeps ${key}`);
      }

      const storage = runtimeStorage(first.project, channel);
      assert.equal(storage.source, undefined);
      assert.equal(requireRecord(storage.compiled, 'compiled').profile, 'compiled');
      // The runtime artifact still names the omitted source, so both profiles carry the same one.
      assert.deepEqual(storage.artifact, runtimeStorage(sourceBuild.project, channel).artifact);

      const component = requireRecord(first.runtimeComponent, 'component');
      assert.equal(component.ok, true);
      assert.equal(component.distributionProfile, 'compiled');
      const story = requireRecord(component.storyDocument, 'story');
      const sourceStory = requireRecord(
        requireRecord(sourceBuild.runtimeComponent, 'component').storyDocument,
        'story',
      );
      assert.deepEqual(story.metadata, {sourceId: 'compiled'});
      assert.deepEqual(story.scenes, withoutSourceRanges(sourceStory.scenes));
      assert.deepEqual(story.controls, sourceStory.controls);
      // The cache id and database survive so verified caches carry over; the basename does not.
      const sourceIdentity = requireRecord(
        requireRecord(
          requireRecord(sourceBuild.runtimeComponent, 'component').sourceDescriptor,
          'source',
        ).cacheIdentity,
        'source identity',
      );
      assert.deepEqual(requireRecord(component.sourceDescriptor, 'binding').cacheIdentity, {
        ...sourceIdentity,
        label: 'compiled',
      });
    }
  });
});

test('loads the compiled story without calling the YAML frontend', async () => {
  await withProject(async (directory) => {
    const built = await build(directory, 'bundled', 'compiled');
    const refusingFrontend = {
      parse() {
        throw new Error('the compiled profile must not parse YAML');
      },
    };
    const loaded = requireRecord(
      await loadDsl4RuntimeComponent(structuredClone(built.project), refusingFrontend, loadOptions),
      'component',
    );
    assert.equal(loaded.ok, true);
    assert.equal(loaded.distributionProfile, 'compiled');
  });
});

async function compiledArtifactOf(directory: string) {
  const built = await build(directory, 'unbundled', 'compiled');
  return {
    project: structuredClone(built.project) as Record<string, unknown>,
    compiled: structuredClone(runtimeStorage(built.project, 'unbundled').compiled) as Record<
      string,
      unknown
    >,
  };
}

async function rehash(compiled: Record<string, unknown>) {
  compiled.storyIntegrity = await computeDsl4Sha256Integrity(
    new TextEncoder().encode(JSON.stringify(compiled.story)),
    subtleCrypto,
  );
}

async function refusalCode(input: unknown) {
  try {
    await validateDsl4CompiledStoryArtifact(input, {subtleCrypto});
  } catch (error) {
    assert.ok(error instanceof Dsl4CompiledStoryError);
    return error.code;
  }
  assert.fail('compiled artifact was accepted');
}

test('fails closed on a tampered, extended, or source-bearing compiled artifact', async () => {
  await withProject(async (directory) => {
    const {compiled} = await compiledArtifactOf(directory);
    assert.equal(
      (await validateDsl4CompiledStoryArtifact(compiled, {subtleCrypto})).profile,
      'compiled',
    );

    const tampered = structuredClone(compiled);
    requireRecord(tampered.story, 'story').variables = {injected: {initial: 1}};
    assert.equal(await refusalCode(tampered), 'K4-COMPILED-STORY-INTEGRITY-001');

    const withSourceMap = structuredClone(compiled);
    requireRecord(withSourceMap.story, 'story').sourceMap = {'/': {}};
    await rehash(withSourceMap);
    assert.equal(await refusalCode(withSourceMap), 'K4-COMPILED-STORY-SOURCE-001');

    const withPath = structuredClone(compiled);
    requireRecord(withPath.story, 'story').metadata = {sourceId: sourceFilename};
    await rehash(withPath);
    assert.equal(await refusalCode(withPath), 'K4-COMPILED-STORY-SOURCE-001');

    assert.equal(await refusalCode({...compiled, yaml: source}), 'K4-FORMAT-UNKNOWN-KEY-001');
    assert.equal(await refusalCode({...compiled, formatVersion: 2}), 'K4-FORMAT-VERSION-001');
    assert.equal(await refusalCode({...compiled, profile: 'sealed'}), 'K4-COMPILED-STORY-001');
  });
});

test('refuses a project that stores the compiled story next to its YAML', async () => {
  await withProject(async (directory) => {
    const sourceBuild = await build(directory, 'unbundled');
    const {project, compiled} = await compiledArtifactOf(directory);
    const storage = runtimeStorage(project, 'unbundled');
    storage.source = structuredClone(runtimeStorage(sourceBuild.project, 'unbundled').source);
    storage.compiled = compiled;
    const loaded = requireRecord(
      await loadDsl4RuntimeComponent(project, frontend, loadOptions),
      'result',
    );
    assert.equal(loaded.ok, false);
    const [diagnostic] = loaded.diagnostics as {code: string}[];
    assert.equal(diagnostic?.code, 'K4-COMPILED-STORY-SOURCE-001');
  });
});

test('compiles a narrative story that plays the same lines without its source', async () => {
  const narrativeFrontend = createDsl4TestProductionSourceFrontend({narrativeControlEnabled: true});
  const parsed = narrativeFrontend.parse(contract.threeVisits.source, {sourceId: sourceFilename});
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const compiled = await validateDsl4CompiledStoryArtifact(
    await createDsl4CompiledStoryArtifact(parsed.storyDocument, {
      sourceIntegrity: `sha256-${'A'.repeat(43)}=`,
      subtleCrypto,
    }),
    {subtleCrypto},
  );
  assert.deepEqual(compiled.story.metadata, {
    sourceId: 'compiled',
    sourceVersion: '4.0',
    narrativeControl: true,
  });
  assert.equal(JSON.stringify(compiled).includes(sourceFilename), false);
  const speech: unknown[] = [];
  const controller = createDsl4RuntimeController({
    storyDocument: compiled.story,
    narrativeControlEnabled: true,
    port: {
      say: (payload: Record<string, unknown>) => {
        speech.push(payload.text);
      },
    },
  });
  const result = await controller.start();
  assert.equal(result.status, 'finished', JSON.stringify(result.diagnostic));
  assert.deepEqual(speech, contract.threeVisits.expectedSpeech);
});

test('removes only kamishibai source declaration stacks and their comments', () => {
  const project = {
    targets: [
      {
        name: 'Stage',
        blocks: {
          hat: {opcode: dsl4LabeledBlockSourceHatOpcode, parent: null, next: 'body', inputs: {}},
          body: {opcode: 'text', parent: 'hat', next: null, inputs: {}},
          label: {opcode: 'text', parent: 'body', next: null, inputs: {}},
          config: {opcode: dsl4ConfigBlockSourceHatOpcode, parent: null, next: null, inputs: {}},
          start: {opcode: 'event_whenflagclicked', parent: null, next: 'say'},
          say: {opcode: 'looks_say', parent: 'start', next: null},
        },
        comments: {
          onSource: {blockId: 'body', text: commentMarker},
          onScript: {blockId: 'say', text: 'kept'},
          floating: {blockId: null, text: 'kept'},
        },
      },
    ],
  };
  assert.equal(removeDsl4BlockSourceDeclarations(project), 4);
  const [target] = project.targets;
  assert.deepEqual(Object.keys(target?.blocks ?? {}).sort(), ['say', 'start']);
  assert.deepEqual(Object.keys(target?.comments ?? {}).sort(), ['floating', 'onScript']);
});

test('compiles a block-source project and drops its YAML hats and include paths', async () => {
  const sources: Record<string, string> = {
    'story.k4.yml': `kamishibai: '4.0'
include: [chapters/intro.k4.yml]
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - goto: intro
`,
    'chapters/intro.k4.yml': `scenes:
  intro:
    - wait: 1
`,
  };
  const graph = await createDsl4SourceGraph('story.k4.yml', {
    readSource: (name) => sources[name]!,
  });
  const authored = await authorDsl4BlockSourceGraphSb3({
    baseBytes: zipSync({
      'project.json': strToU8(
        JSON.stringify({
          targets: [{name: 'Stage', isStage: true, blocks: {}}],
          extensions: ['kubohiroyakamishibai4'],
        }),
      ),
    }),
    sourceGraph: graph,
    sourceFrontend: frontend,
  });
  assert.equal(authored.ok, true);
  if (!authored.ok) return;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsl4-compiled-blocks-'));
  try {
    const built = await buildDsl4RuntimeComponent({
      baseSb3Bytes: authored.bytes,
      projectRoot: directory,
      sourceFrontend: frontend,
      controlProfile: 'production',
      channel: 'bundled',
      featureFlags: {dsl4Runtime: true},
      maxSourceBytes: 1024 * 1024,
      maxTotalSourceBytes: 4 * 1024 * 1024,
      maxAssetFileBytes: 1024 * 1024,
      maxAssetFiles: 64,
      maxTotalAssetBytes: 4 * 1024 * 1024,
      distributionProfile: 'compiled',
    });
    const text = archiveText(built.bytes);
    for (const leak of [
      'chapters/intro.k4.yml',
      'story.k4.yml',
      'kamishibai: ',
      dsl4LabeledBlockSourceHatOpcode,
    ]) {
      assert.equal(text.includes(leak), false, `compiled block project leaks ${leak}`);
    }
    const component = requireRecord(built.runtimeComponent, 'component');
    assert.equal(component.ok, true);
    const scenes = requireRecord(component.storyDocument, 'story').scenes as {id: string}[];
    assert.deepEqual(
      scenes.map((scene) => scene.id),
      ['opening', 'intro'],
    );
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('compiles a root binary entry build through the same loader', async () => {
  await withProject(async (directory) => {
    const built = await buildDsl4RuntimeComponent({
      baseSb3Bytes: baseSb3(),
      projectRoot: directory,
      sourceManifest,
      sourceFrontend: frontend,
      controlProfile: 'production',
      channel: 'bundled',
      featureFlags: {dsl4Runtime: true, dsl4RootBinaryEntryPackaging: true},
      maxSourceBytes: 16 * 1024,
      maxAssetFileBytes: 4096,
      maxAssetFiles: 10,
      maxTotalAssetBytes: 16 * 1024,
      subtleCrypto,
      distributionProfile: 'compiled',
    });
    const component = requireRecord(built.runtimeComponent, 'component');
    assert.equal(component.ok, true);
    assert.equal(component.distributionProfile, 'compiled');
    assert.equal(archiveText(built.bytes).includes(commentMarker), false);
  });
});

test('build-dsl4 takes an explicit source or compiled distribution profile', () => {
  const required = [
    'build-dsl4',
    '--base',
    'base.sb3',
    '--project-root',
    '.',
    '--output',
    'out.sb3',
    '--control-profile',
    'production',
    '--channel',
    'bundled',
  ];
  const optionsOf = (parsed: unknown) =>
    requireRecord(requireRecord(parsed, 'parsed').options, 'options');
  assert.equal(optionsOf(parseCliArguments(required)).distributionProfile, undefined);
  assert.equal(
    optionsOf(parseCliArguments([...required, '--distribution-profile', 'compiled']))
      .distributionProfile,
    'compiled',
  );
  assert.throws(
    () => parseCliArguments([...required, '--distribution-profile', 'secret']),
    /--distribution-profile must be either source or compiled/u,
  );
});

test('names a password-sealed story from rc.51 to rc.55 instead of failing on a missing source', async () => {
  await withProject(async (directory) => {
    const built = await build(directory, 'bundled', 'compiled');
    const project = structuredClone(built.project) as Record<string, unknown>;
    const storage = runtimeStorage(project, 'bundled');
    storage.sealed = {formatVersion: 1, profile: 'sealed'};
    delete storage.compiled;
    const loaded = requireRecord(
      await loadDsl4RuntimeComponent(project, frontend, loadOptions),
      'result',
    );
    assert.equal(loaded.ok, false);
    assert.equal((loaded.diagnostics as {code: string}[])[0]!.code, 'K4-SEALED-UNSUPPORTED-001');
  });
});

test('preserves fixed viewport through compiled Story IR round trip', async () => {
  const parsed = frontend.parse(
    "kamishibai: '4.0'\nviewport: {width: 360, height: 640, fit: cover}\nscenes: {opening: []}",
  );
  assert(parsed.ok);
  const compiled = await validateDsl4CompiledStoryArtifact(
    await createDsl4CompiledStoryArtifact(parsed.storyDocument, {
      sourceIntegrity: `sha256-${'A'.repeat(43)}=`,
      subtleCrypto,
    }),
    {subtleCrypto},
  );
  assert.deepEqual(compiled.story.viewport, {
    width: 360,
    height: 640,
    orientation: 'portrait',
    fit: 'cover',
  });
});
