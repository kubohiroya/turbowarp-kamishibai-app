import {dsl4SaveDataFormatVersion} from '../src/dsl4/save-data.js';
import assert from 'node:assert/strict';
import {dsl4CompiledStoryArtifactFormatVersion} from '../src/dsl4/compiled-story-artifact.js';
import {test} from 'vitest';

import {dsl4AssetDistributionFormatVersion} from '../src/dsl4/asset-distribution-profile.js';
import {
  dsl4BinaryEntryFormatVersion,
  dsl4LegacyBinaryEntryFormatVersion,
} from '../src/dsl4/binary-entry-provider.js';
import {dsl4BlockSourceExportFormatVersion} from '../src/dsl4/block-source-export.js';
import {
  decodeDsl4Envelope,
  Dsl4FormatError,
  dsl4FormatVersions,
  dsl4LegacyFormatVersions,
} from '../src/dsl4/format-versions.js';

test('indexes every serialized format the build publishes', () => {
  assert.deepEqual(Object.keys(dsl4FormatVersions).sort(), [
    'assetBundle',
    'assetBundleManifest',
    'assetDistributionConfig',
    'assetDistributionLock',
    'assetReloadPolicySnapshot',
    'binaryEntry',
    'blockSourceExport',
    'blockSourceProject',
    'compiledArtifact',
    'externalSourceManifest',
    'previewSourceGenerationWire',
    'runtimeArtifactDescriptor',
    'saveData',
    'sourceGraphSnapshot',
  ]);
  assert.equal(Object.isFrozen(dsl4FormatVersions), true);
  for (const [name, version] of Object.entries(dsl4FormatVersions)) {
    assert.ok(Number.isSafeInteger(version) && version > 0, `${name} is not a positive version`);
  }
});

test('pins each entry to the constant its owning module exports', () => {
  // The index is a list of what exists, not a second definition. Where the owner already exports a
  // constant, the two are asserted equal here so the list cannot drift away from the writers.
  assert.equal(dsl4FormatVersions.saveData, dsl4SaveDataFormatVersion);
  assert.equal(dsl4FormatVersions.compiledArtifact, dsl4CompiledStoryArtifactFormatVersion);
  assert.equal(dsl4FormatVersions.assetDistributionConfig, dsl4AssetDistributionFormatVersion);
  assert.equal(dsl4FormatVersions.assetDistributionLock, dsl4AssetDistributionFormatVersion);
  assert.equal(dsl4FormatVersions.blockSourceExport, dsl4BlockSourceExportFormatVersion);
  assert.equal(dsl4FormatVersions.binaryEntry, dsl4BinaryEntryFormatVersion);
  assert.deepEqual(dsl4LegacyFormatVersions.binaryEntry, [dsl4LegacyBinaryEntryFormatVersion]);
});

const manifestSpec = {
  kind: 'assetBundleManifest',
  requiredKeys: ['assets'],
} as const;

test('reads a well-formed envelope and hands back the record itself', () => {
  const envelope = {formatVersion: 1, assets: []};
  assert.strictEqual(decodeDsl4Envelope(envelope, manifestSpec), envelope);
  assert.doesNotThrow(() =>
    decodeDsl4Envelope(
      {...envelope, integrity: 'sha256:0'},
      {...manifestSpec, optionalKeys: ['integrity']},
    ),
  );
});

test('fails closed on shape, version, unknown keys, and missing keys alike', () => {
  const valid = {formatVersion: 1, assets: []};
  const cases: readonly [unknown, RegExp][] = [
    [null, /must be an object/u],
    ['{}', /must be an object/u],
    [[valid], /must be an object/u],
    [{...valid, formatVersion: 2}, /formatVersion must be 1/u],
    [{...valid, formatVersion: '1'}, /formatVersion must be 1/u],
    [{assets: []}, /formatVersion must be 1/u],
    // An unknown key is what a newer writer's extra member looks like. Dropping it silently is the
    // failure this decoder exists to prevent, so it is refused rather than ignored.
    [{...valid, checkpoint: 3}, /does not declare: checkpoint/u],
    [{formatVersion: 1}, /missing required keys: assets/u],
  ];
  for (const [value, message] of cases) {
    assert.throws(() => decodeDsl4Envelope(value, manifestSpec), message);
  }
});

test('accepts a legacy version only where one is declared and the caller asks for it', () => {
  const spec = {kind: 'binaryEntry', requiredKeys: ['entries']} as const;
  const legacy = {formatVersion: dsl4LegacyBinaryEntryFormatVersion, entries: []};
  assert.throws(() => decodeDsl4Envelope(legacy, spec), Dsl4FormatError);
  assert.doesNotThrow(() => decodeDsl4Envelope(legacy, {...spec, acceptLegacy: true}));
  // A format with no legacy list gains nothing from the opt-in.
  assert.throws(
    () => decodeDsl4Envelope({formatVersion: 0, assets: []}, {...manifestSpec, acceptLegacy: true}),
    /formatVersion must be 1/u,
  );
});

test('reports the format that was refused so callers can map it to their own diagnostics', () => {
  try {
    decodeDsl4Envelope({formatVersion: 9}, manifestSpec);
    assert.fail('expected the decoder to refuse the envelope');
  } catch (error) {
    assert.ok(error instanceof Dsl4FormatError);
    assert.equal(error.kind, 'assetBundleManifest');
    assert.equal(error.code, 'K4-FORMAT-VERSION-001');
  }
});
