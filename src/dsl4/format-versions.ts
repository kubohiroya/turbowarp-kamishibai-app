import {deepFreeze} from './story-document.js';

/**
 * The index DSL 4.0 did not have: every serialized format this build publishes, and its version.
 *
 * `formatVersion: 1` is written independently at a dozen sites -- `asset-bundle-descriptor`,
 * `asset-reload-policy`, `asset-distribution-profile`, `runtime-artifact-descriptor` and the rest.
 * The values agree, but nothing said *which formats exist*, so a new one could be added without
 * anybody noticing that it now had to be versioned too. This module is that list.
 *
 * Each entry names the module that owns the format. The owner keeps its own constant and its own
 * validator; this index does not replace them, and `test/dsl4-format-contracts.test.ts` pins the
 * entries that have an exported constant to that constant so the two cannot drift apart.
 */
export const dsl4FormatVersions = deepFreeze({
  /** `save-data.ts` -- portable save point, independent of story source syntax. */
  saveData: 1,
  /** `asset-bundle-descriptor.ts` -- the bundle envelope over `manifest`, `files`, `integrity`. */
  assetBundle: 1,
  /** `asset-bundle-descriptor.ts` -- the asset manifest carried inside a bundle and a story file. */
  assetBundleManifest: 1,
  /** `asset-distribution-profile.ts` -- the profile/provider config (`dsl4AssetDistributionFormatVersion`). */
  assetDistributionConfig: 1,
  /** `asset-distribution-profile.ts` -- the resolved lock written next to the config. */
  assetDistributionLock: 1,
  /** `asset-reload-policy.ts` -- the asset snapshot a reload decision is computed from. */
  assetReloadPolicySnapshot: 1,
  /** `binary-entry-provider.ts` -- the packaged binary entry (`dsl4BinaryEntryFormatVersion`; 2 stays readable). */
  binaryEntry: 3,
  /** `block-source-export.ts` -- the export written out of a project (`dsl4BlockSourceExportFormatVersion`). */
  blockSourceExport: 1,
  /** `turbowarp-yaml-json-block-source.ts` -- the source set read back off a project's hats. */
  blockSourceProject: 1,
  /** `external-source-manifest.ts` -- the descriptor for a story kept outside the project root. */
  externalSourceManifest: 1,
  /** `preview-source-generation-wire.ts` -- one `preview.source.generation` message. */
  previewSourceGenerationWire: 1,
  /** `runtime-artifact-descriptor.ts` -- the descriptor a built runtime artifact carries. */
  runtimeArtifactDescriptor: 1,
  /** `source-graph.ts` -- the include-graph snapshot the frontend hands on. */
  sourceGraphSnapshot: 1,
  /** `compiled-story-artifact.ts` -- the Story IR stored in place of YAML by the compiled profile. */
  compiledArtifact: 1,
});

export type Dsl4FormatKind = keyof typeof dsl4FormatVersions;

/**
 * Versions a reader still accepts after the format moved on.
 *
 * A legacy version is a deliberate, named exception -- not a range. Everything absent from here is
 * refused by `decodeDsl4Envelope`.
 */
export const dsl4LegacyFormatVersions = deepFreeze({
  /** `binary-entry-provider.ts` reads version 2 entries and writes version 3. */
  binaryEntry: [2],
} as Partial<Record<Dsl4FormatKind, readonly number[]>>);

/** A format that was refused. Carries the code so callers can map it to their own diagnostics. */
export class Dsl4FormatError extends Error {
  readonly code: string;
  readonly kind: Dsl4FormatKind;

  constructor(code: string, kind: Dsl4FormatKind, message: string) {
    super(message);
    this.name = 'Dsl4FormatError';
    this.code = code;
    this.kind = kind;
  }
}

/** What one format's envelope must carry, and what it may carry. */
export interface Dsl4EnvelopeSpec {
  readonly kind: Dsl4FormatKind;
  readonly requiredKeys: readonly string[];
  readonly optionalKeys?: readonly string[];
  /** Accept the format's legacy versions as well as the current one. Off by default. */
  readonly acceptLegacy?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read one format envelope, refusing anything this build does not already understand.
 *
 * Fail closed means all four of these, not just the version check: a non-record, a `formatVersion`
 * this build did not publish, a key the format does not declare, and a declared key that is absent.
 *
 * The unknown key is the one worth spelling out. Accepting it is how a reader silently drops the
 * member a newer writer added, which is what `validateStageAck` did when it rebuilt a record and
 * lost `sourceIntegrity` and `diagnostics`, breaking auto-reload. This decoder returns the record
 * it validated rather than a reconstruction, so there is nothing to drop.
 *
 * Migration is deliberately not here. What to do with data written by an older version is the
 * owning module's decision; this only answers whether the bytes match a format this build declares.
 */
export function decodeDsl4Envelope(
  value: unknown,
  spec: Dsl4EnvelopeSpec,
): Readonly<Record<string, unknown>> {
  const {kind, requiredKeys, optionalKeys = [], acceptLegacy = false} = spec;
  if (!isRecord(value)) {
    throw new Dsl4FormatError('K4-FORMAT-SHAPE-001', kind, `${kind} must be an object`);
  }
  const current = dsl4FormatVersions[kind];
  const accepted = acceptLegacy ? [current, ...(dsl4LegacyFormatVersions[kind] ?? [])] : [current];
  if (typeof value.formatVersion !== 'number' || !accepted.includes(value.formatVersion)) {
    throw new Dsl4FormatError(
      'K4-FORMAT-VERSION-001',
      kind,
      `${kind} formatVersion must be ${accepted.join(' or ')}, got ${JSON.stringify(value.formatVersion)}`,
    );
  }
  const declared = new Set(['formatVersion', ...requiredKeys, ...optionalKeys]);
  const unknown = Object.keys(value)
    .filter((key) => !declared.has(key))
    .sort();
  if (unknown.length > 0) {
    throw new Dsl4FormatError(
      'K4-FORMAT-UNKNOWN-KEY-001',
      kind,
      `${kind} carries keys this build does not declare: ${unknown.join(', ')}`,
    );
  }
  const missing = requiredKeys.filter((key) => !Object.hasOwn(value, key)).sort();
  if (missing.length > 0) {
    throw new Dsl4FormatError(
      'K4-FORMAT-MISSING-KEY-001',
      kind,
      `${kind} is missing required keys: ${missing.join(', ')}`,
    );
  }
  return value;
}
