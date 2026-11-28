import {assertSourceNavigationTargets} from './helpers/source-navigation-targets.js';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {strToU8, unzipSync, zipSync} from 'fflate';

import {
  buildDsl4RuntimeComponent,
  createDsl4BinaryEntryProviderFromSb3,
  dsl4DefaultBuildFeatureFlags,
  Dsl4BuildError,
  resolveDsl4BuildFeatureFlags,
  Sb3BuilderError,
} from '../src/builder/index.js';
import {
  createDsl4SourceFrontend,
  dsl4BinaryEntryPrefix,
  dsl4LegacyBinaryEntryPrefix,
} from '../src/dsl4/index.js';
import {thrown} from './helpers/thrown-error.ts';
import {requireArray, requireDefined, requireRecord} from './helpers/require-value.ts';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const schema = JSON.parse(
  await readFile(path.join(repositoryRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
);
const frontend = createDsl4SourceFrontend(schema);
const subtleCrypto = webcrypto.subtle;
const sourceManifest = Object.freeze({
  formatVersion: 1,
  mode: 'external',
  sourceId: 'main',
  path: 'story.kamishibai.yaml',
  cacheId: 'story000000000001',
  cacheDatabaseName: 'tw-kamishibai-assets-v1--story--story000000000001',
});
const validSource = `
kamishibai: '4.0'
assets:
  OpeningImage:
    kind: backdrop
    file: assets/opening.svg
    loading: lazy
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    recognitionModel: RescuePose
    actions:
      - stage: OpeningImage
`;
const remoteSource = `
kamishibai: '4.0'
assets:
  RemoteOpening:
    kind: backdrop
    delivery: remote
    loading: lazy
    source:
      url: https://cdn.example.com/remote-opening.svg
      integrity: sha256-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
      contentType: image/svg+xml
      size: 123456
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - stage: RemoteOpening
`;
const localPoseArchiveSource = validSource.replace(
  'file: pose-models/rescue',
  'file: pose-models/rescue.ZIP',
);

function baseProject() {
  return {
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
}

function structuredDataSurface(project: unknown) {
  const prefix = 'kubohiroyastructdata1';
  const built = requireRecord(project, 'the built project');
  const targets = requireArray(built.targets, 'its targets');
  return {
    extensionIds: Object.keys(requireRecord(built.extensionStorage ?? {}, 'its storage')).filter(
      (id) => id.startsWith(prefix),
    ),
    opcodes: targets.flatMap((target) =>
      Object.values(requireRecord(requireRecord(target, 'a target').blocks ?? {}, 'its blocks'))
        .map((block) => requireRecord(block, 'a block').opcode)
        .filter((opcode) => typeof opcode === 'string' && opcode.startsWith(prefix)),
    ),
  };
}

/**
 * The runtime component a build publishes.
 *
 * The builder declares it opaquely, so the members these cases read -- the bundle, the descriptor,
 * and the copy-on-read asset bytes -- are named here once.
 */
interface BuiltComponent extends Record<string, unknown> {
  ok: boolean;
  channel: string;
  storyDocument: Readonly<Record<string, unknown>>;
  sourceDescriptor: Record<string, unknown>;
  assetBundle: {
    files: unknown[];
    manifest: {assets: {id: string; source: {mode?: string; files?: {path: string}[]}}[]};
  };
  getAssetFile(assetId: string, filePath: string): Uint8Array;
}

/** Read the runtime component one successful build produced. */
function componentOf(built: {runtimeComponent: unknown}): BuiltComponent {
  return requireRecord(
    built.runtimeComponent,
    'the runtime component',
  ) as unknown as BuiltComponent;
}

function baseSb3(project: unknown = baseProject()) {
  return Buffer.from(
    zipSync({
      'project.json': strToU8(`${JSON.stringify(project)}\n`),
      'existing.svg': strToU8('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    }),
  );
}

async function withProject<T>(
  source: string,
  callback: (directory: string) => Promise<T> | T,
): Promise<T> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsl4-one-shot-build-'));
  try {
    await mkdir(path.join(directory, 'assets'));
    await mkdir(path.join(directory, 'pose-models', 'rescue'), {recursive: true});
    await writeFile(path.join(directory, 'story.kamishibai.yaml'), source);
    await writeFile(path.join(directory, 'assets', 'opening.svg'), '<svg/>');
    await writeFile(
      path.join(directory, 'pose-models', 'rescue', 'metadata.json'),
      '{"labels":["rescue"]}',
    );
    await writeFile(path.join(directory, 'pose-models', 'rescue', 'model.json'), '{"model":true}');
    await writeFile(
      path.join(directory, 'pose-models', 'rescue.ZIP'),
      zipSync({
        'metadata.json': strToU8('{"labels":["rescue"]}'),
        'model.json': strToU8('{"weightsManifest":[{"paths":["weights.bin"]}]}'),
        'weights.bin': new Uint8Array([1, 2, 3]),
      }),
    );
    return await callback(directory);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
}

const buildOptions = (
  directory: string,
  channel: 'bundled' | 'unbundled',
  extra: Record<string, unknown> = {},
) => ({
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
  ...extra,
});

test('resolves the root packaging flag once without adding it to runtime flags', () => {
  assert.deepEqual(dsl4DefaultBuildFeatureFlags, {dsl4RootBinaryEntryPackaging: false});
  assert.equal(Object.isFrozen(dsl4DefaultBuildFeatureFlags), true);
  const enabled = resolveDsl4BuildFeatureFlags({
    dsl4Runtime: true,
    dsl4SourceIncludes: true,
    dsl4RootBinaryEntryPackaging: true,
  });
  assert.equal(enabled.dsl4RootBinaryEntryPackaging, true);
  assert.equal(Object.hasOwn(enabled.runtimeFeatureFlags, 'dsl4SourceIncludes'), false);
  assert.equal(Object.hasOwn(enabled.runtimeFeatureFlags, 'dsl4RootBinaryEntryPackaging'), false);
  assert.throws(() => resolveDsl4BuildFeatureFlags({dsl4RootBinaryEntryPackaging: 1}), TypeError);
  assert.throws(() => resolveDsl4BuildFeatureFlags({unknownBuildFlag: true}), TypeError);
});

test('builds and startup-validates one deterministic self-contained component per channel', async () => {
  await withProject(validSource, async (directory: string) => {
    const sourcePath = path.join(directory, 'story.kamishibai.yaml');
    const assetPath = path.join(directory, 'assets', 'opening.svg');
    const sourceBefore = await readFile(sourcePath);
    const assetBefore = await readFile(assetPath);
    for (const channel of ['unbundled', 'bundled'] as const) {
      const input = baseSb3();
      const inputCopy = Buffer.from(input);
      const options = buildOptions(directory, channel, {baseSb3Bytes: input});
      const first = await buildDsl4RuntimeComponent(options);
      const second = await buildDsl4RuntimeComponent(options);

      assert.deepEqual(input, inputCopy);
      assert.deepEqual(first.bytes, second.bytes);
      assertSourceNavigationTargets(first.project.targets, baseProject().targets, channel);
      assert.deepEqual(structuredDataSurface(first.project), {extensionIds: [], opcodes: []});
      assert.equal(componentOf(first).ok, true);
      assert.equal(componentOf(first).channel, channel);
      assert.equal(Object.isFrozen(first), true);
      assert.equal(Object.isFrozen(first.project), true);
      assert.equal(Object.isFrozen(componentOf(first)), true);
      assert.equal(
        JSON.stringify({project: first.project, component: componentOf(first)}).includes(directory),
        false,
      );

      const firstAsset = componentOf(first).getAssetFile('OpeningImage', 'opening.svg');
      firstAsset[0] = requireDefined(firstAsset[0], 'its first byte') ^ 0xff;
      assert.deepEqual(
        componentOf(first).getAssetFile('OpeningImage', 'opening.svg'),
        new Uint8Array(assetBefore),
      );
      assert.deepEqual(unzipSync(first.bytes)['existing.svg'], unzipSync(input)['existing.svg']);
    }
    assert.deepEqual(await readFile(sourcePath), sourceBefore);
    assert.deepEqual(await readFile(assetPath), assetBefore);
  });
});

test('builds a local recognitionModel zip into the same three-file runtime bundle', async () => {
  await withProject(localPoseArchiveSource, async (directory: string) => {
    const built = await buildDsl4RuntimeComponent(buildOptions(directory, 'unbundled'));
    const pose = requireDefined(
      componentOf(built).assetBundle.manifest.assets.find((asset) => asset.id === 'RescuePose'),
      'the RescuePose asset',
    );
    assert.equal(pose.source.mode, 'archive');
    assert.deepEqual(
      requireDefined(pose.source.files, 'its files').map((file) => file.path),
      ['metadata.json', 'model.json', 'weights.bin'],
    );
    assert.deepEqual(
      componentOf(built).getAssetFile('RescuePose', 'weights.bin'),
      new Uint8Array([1, 2, 3]),
    );
  });
});

test('builds deterministic root binary entries only when the packaging flag is enabled', async () => {
  await withProject(validSource, async (directory: string) => {
    const options = buildOptions(directory, 'bundled', {
      featureFlags: {dsl4Runtime: true, dsl4RootBinaryEntryPackaging: true},
    });
    const first = await buildDsl4RuntimeComponent(options);
    const second = await buildDsl4RuntimeComponent(options);
    assert.deepEqual(first.bytes, second.bytes);
    assert.equal(componentOf(first).ok, true);
    assert.equal(Object.hasOwn(componentOf(first), 'getAssetFile'), false);
    const archive = unzipSync(first.bytes);
    const entryNames = Object.keys(archive).filter((name) =>
      name.startsWith(dsl4BinaryEntryPrefix),
    );
    assert.equal(entryNames.length, 3);
    assert.equal(
      Object.keys(archive).some((name) => name.startsWith(dsl4LegacyBinaryEntryPrefix)),
      false,
    );
    for (const entryName of entryNames) {
      assert.match(entryName, /^k4asset-v1-[0-9a-f]{64}$/u);
      assert.equal(entryName.includes('/'), false);
    }
    const provider = await createDsl4BinaryEntryProviderFromSb3(
      first.bytes,
      componentOf(first).storyDocument,
      componentOf(first).assetBundle,
      {
        maxArchiveBytes: 1024 * 1024,
        maxArchiveEntries: 32,
        maxArchiveEntryBytes: 128 * 1024,
        maxArchiveExpandedBytes: 512 * 1024,
        maxAssetFiles: 10,
        maxAssetFileBytes: 4096,
        maxTotalAssetBytes: 16 * 1024,
        maxCompressionRatio: 100,
        subtleCrypto,
      },
    );
    const pose = await provider.consumeAsset('RescuePose');
    assert.deepEqual(
      pose.files.map(({path, contentType}) => ({path, contentType})),
      [
        {path: 'metadata.json', contentType: 'application/json'},
        {path: 'model.json', contentType: 'application/json'},
      ],
    );
    await provider.release();

    const rollback = await buildDsl4RuntimeComponent(
      buildOptions(directory, 'bundled', {featureFlags: {dsl4Runtime: true}}),
    );
    const explicitRollback = await buildDsl4RuntimeComponent(
      buildOptions(directory, 'bundled', {
        featureFlags: {dsl4Runtime: true, dsl4RootBinaryEntryPackaging: false},
      }),
    );
    assert.deepEqual(explicitRollback.bytes, rollback.bytes);
    assert.equal(
      Object.keys(unzipSync(rollback.bytes)).some((name) => name.startsWith(dsl4BinaryEntryPrefix)),
      false,
    );
    assert.equal(typeof componentOf(rollback).getAssetFile, 'function');
  });
});

test('builds a remote manifest without embedding the remote payload', async () => {
  await withProject(remoteSource, async (directory: string) => {
    const built = await buildDsl4RuntimeComponent(buildOptions(directory, 'unbundled'));
    assert.deepEqual(componentOf(built).assetBundle.files, []);
    assert.deepEqual(componentOf(built).sourceDescriptor.cacheIdentity, {
      id: 'story000000000001',
      label: 'story.kamishibai.yaml',
      databaseName: 'tw-kamishibai-assets-v1--story--story000000000001',
    });
    assert.deepEqual(componentOf(built).assetBundle.manifest.assets, [
      {
        id: 'RemoteOpening',
        kind: 'backdrop',
        loading: 'lazy',
        bitmapResolution: 1,
        source: {
          type: 'remote',
          url: 'https://cdn.example.com/remote-opening.svg',
          integrity: 'sha256-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          contentType: 'image/svg+xml',
          size: 123456,
        },
      },
    ]);
    assert.throws(
      () => componentOf(built).getAssetFile('RemoteOpening', 'remote-opening.svg'),
      (error) => thrown(error).code === 'K4-ASSET-BUNDLE-LOOKUP-001',
    );
  });
});

test('requires explicit replacement and preserves the same-channel component deterministically', async () => {
  await withProject(validSource, async (directory: string) => {
    const first = await buildDsl4RuntimeComponent(buildOptions(directory, 'unbundled'));
    await assert.rejects(
      buildDsl4RuntimeComponent(buildOptions(directory, 'unbundled', {baseSb3Bytes: first.bytes})),
      (error) =>
        error instanceof Sb3BuilderError && error.code === 'K4-RUNTIME-COMPONENT-STORAGE-EXISTS',
    );
    const replaced = await buildDsl4RuntimeComponent(
      buildOptions(directory, 'unbundled', {
        baseSb3Bytes: first.bytes,
        replaceExisting: true,
      }),
    );
    assert.deepEqual(replaced.bytes, first.bytes);
    await assert.rejects(
      buildDsl4RuntimeComponent(
        buildOptions(directory, 'bundled', {
          baseSb3Bytes: first.bytes,
          replaceExisting: true,
        }),
      ),
      (error) =>
        error instanceof Sb3BuilderError && error.code === 'K4-RUNTIME-COMPONENT-CHANNEL-AMBIGUOUS',
    );
  });
});

test('preserves parser and artifact diagnostics without returning a partial result', async () => {
  await withProject('kamishibai: 4.0\nscenes:\n  opening: []\n', async (directory: string) => {
    await assert.rejects(
      buildDsl4RuntimeComponent(buildOptions(directory, 'unbundled')),
      (error) => {
        assert.equal(error instanceof Dsl4BuildError, true);
        assert.equal(thrown(error).code, 'K4-VERSION-001');
        assert.equal(thrown(error).stage, 'dsl4-parse');
        assert.equal(
          requireRecord(
            requireArray(thrown(error).diagnostics, 'its diagnostics')[0],
            'the first diagnostic',
          ).path,
          '/kamishibai',
        );
        assert.equal(
          requireRecord(
            requireRecord(
              requireRecord(
                requireArray(thrown(error).diagnostics, 'its diagnostics')[0],
                'the first diagnostic',
              ).range,
              'its range',
            ).start,
            'its start',
          ).line,
          1,
        );
        assert.equal(Object.hasOwn(requireRecord(error, 'the build error'), 'bytes'), false);
        return true;
      },
    );
  });

  await withProject(validSource, async (directory: string) => {
    await assert.rejects(
      buildDsl4RuntimeComponent(
        buildOptions(directory, 'unbundled', {controlProfile: 'development'}),
      ),
      (error) => {
        assert.equal(error instanceof Dsl4BuildError, true);
        assert.equal(thrown(error).code, 'K4-KEYMAP-PROFILE-UNKNOWN');
        assert.equal(thrown(error).stage, 'dsl4-artifact');
        assert.equal(
          requireRecord(
            requireArray(thrown(error).diagnostics, 'its diagnostics')[0],
            'the first diagnostic',
          ).path,
          '$.controls.keymaps',
        );
        assert.equal(Object.hasOwn(requireRecord(error, 'the build error'), 'bytes'), false);
        return true;
      },
    );
  });
});

test('fails closed when source or asset bytes change during the one-shot build', async () => {
  await withProject(validSource, async (directory: string) => {
    let sourceRead = 0;
    await assert.rejects(
      buildDsl4RuntimeComponent(
        buildOptions(directory, 'unbundled', {
          async readSource() {
            sourceRead += 1;
            return Buffer.from(sourceRead === 1 ? validSource : `${validSource}\n# changed\n`);
          },
        }),
      ),
      (error) => error instanceof Sb3BuilderError && error.code === 'K4-PREVIEW-SOURCE-UNSTABLE',
    );

    let assetRead = 0;
    await assert.rejects(
      buildDsl4RuntimeComponent(
        buildOptions(directory, 'unbundled', {
          async readAssetFile(filePath: string) {
            if (path.basename(filePath) === 'opening.svg') {
              assetRead += 1;
              return Buffer.from(assetRead === 1 ? '<svg/>' : '<svf/>');
            }
            return readFile(filePath);
          },
        }),
      ),
      (error) => error instanceof Sb3BuilderError && error.code === 'K4-ASSET-UNSTABLE-001',
    );
  });
});

test('requires an explicit profile, channel, and every finite source and asset limit', async () => {
  await withProject(validSource, async (directory: string) => {
    for (const field of [
      'controlProfile',
      'channel',
      'maxSourceBytes',
      'maxAssetFileBytes',
      'maxAssetFiles',
      'maxTotalAssetBytes',
    ]) {
      // Deliberately out of contract: each case removes an option the builder requires, to prove
      // it refuses the build rather than trusting the declaration.
      const options: Record<string, unknown> = {...buildOptions(directory, 'unbundled')};
      delete options[field];
      await assert.rejects(
        buildDsl4RuntimeComponent(options as Parameters<typeof buildDsl4RuntimeComponent>[0]),
        TypeError,
        field,
      );
    }
  });
});
