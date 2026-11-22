import {lstat, open, readdir, realpath} from 'node:fs/promises';
import path from 'node:path';

import {
  Dsl4AssetDistributionError,
  resolveDsl4AssetDistributionProfile,
  validateDsl4AssetDistributionConfig,
  validateDsl4AssetDistributionLock,
} from '../dsl4/asset-distribution-profile.js';
import {createDsl4AssetDependencyIndex} from '../dsl4/asset-dependency-index.js';
import type {Dsl4SourceFrontend} from '../dsl4/source-frontend.js';
import {createDsl4SourceGraphFrontend} from '../dsl4/source-graph-frontend.js';
import {deepFreeze} from '../dsl4/story-document.js';
import {
  loadDsl4ExternalSource,
  parseDsl4ExternalSourceManifest,
  validateDsl4ExternalSourceManifest,
} from './dsl4-external-source.js';
import {loadDsl4BuildSourceGraph} from './dsl4-source-graph.js';
import {resolveDsl4ProjectSource} from './dsl4-project-source.js';
import {resolveDsl4BuildSourceLimits} from './dsl4-source-limits.js';
import {Sb3BuilderError} from './errors.js';
import type {Dsl4FileSystem} from './file-system.js';

const defaultFileSystem = Object.freeze({lstat, open, readdir, realpath});
const textDecoder = new TextDecoder('utf-8', {fatal: true});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(message: string, code: string, cause?: unknown): never {
  throw new Sb3BuilderError(message, {stage: 'dsl4-asset-audit', code, cause});
}

interface StableFileState {
  readonly dev: number;
  readonly ino: number;
  readonly size: number;
  readonly mtimeMs: number;
  readonly ctimeMs: number;
}

interface AuditStoryAsset {
  readonly loading?: unknown;
  readonly retention?: unknown;
}

export interface AuditAsset {
  readonly id: string;
  readonly kind: string;
  readonly delivery: 'embedded' | 'remote';
  readonly loading?: unknown;
  readonly retention?: unknown;
  readonly contentIntegrity: string;
  readonly contentType: string;
  readonly logicalBytes: number;
  readonly transportBytes: number;
}

export interface AuditDeliverySummary {
  readonly assets: number;
  readonly logicalBytes: number;
  readonly embedded: Readonly<{assets: number; logicalBytes: number}>;
  readonly remote: Readonly<{assets: number; logicalBytes: number; transportBytes: number}>;
}

export interface AuditPhaseSummary extends AuditDeliverySummary {
  readonly ids: readonly string[];
}

export interface AssetDistributionAudit {
  readonly formatVersion: 1;
  readonly profile: string;
  readonly network: 'allowed' | 'forbidden';
  readonly offlineReady: boolean;
  readonly totals: AuditDeliverySummary &
    Readonly<{
      eager: AuditDeliverySummary;
      lazy: AuditDeliverySummary;
    }>;
  readonly byKind: Readonly<Record<string, AuditDeliverySummary>>;
  readonly preparation: Readonly<{
    startup: AuditPhaseSummary;
    cover: AuditPhaseSummary;
    actors: AuditPhaseSummary;
    loading: AuditPhaseSummary;
    recognition: AuditPhaseSummary;
    posePreviewControls: AuditPhaseSummary;
  }>;
  readonly scenes: Readonly<
    Record<
      string,
      Readonly<{
        all: AuditPhaseSummary;
        eager: AuditPhaseSummary;
        lazy: AuditPhaseSummary;
        /** Recognition models the scene loads in the background, waited for only by recognition. */
        background: AuditPhaseSummary;
        sceneRetained: AuditPhaseSummary;
      }>
    >
  >;
  readonly duplicates: Readonly<{
    groups: readonly Readonly<{
      contentIntegrity: string;
      assetIds: readonly string[];
      logicalBytes: number;
      savingsBytes: number;
    }>[];
    savingsBytes: number;
  }>;
  readonly assets: readonly AuditAsset[];
}

interface ParseDiagnosticView {
  readonly message?: string;
  readonly code?: string;
}

type AuditParseResult =
  | Readonly<{
      ok: true;
      storyDocument: Readonly<Record<string, unknown>>;
      diagnostics: readonly ParseDiagnosticView[];
    }>
  | Readonly<{ok: false; diagnostics: readonly ParseDiagnosticView[]}>;

function normalizeAuditParseResult(value: unknown): AuditParseResult {
  if (!isRecord(value) || typeof value.ok !== 'boolean' || !Array.isArray(value.diagnostics)) {
    throw new TypeError('sourceFrontend parse result is invalid');
  }
  const diagnostics = value.diagnostics as readonly ParseDiagnosticView[];
  if (!value.ok) return {ok: false, diagnostics};
  if (!isRecord(value.storyDocument)) {
    throw new TypeError('sourceFrontend successful parse result must include storyDocument');
  }
  return {ok: true, diagnostics, storyDocument: value.storyDocument};
}

function positiveLimit(value: unknown, name: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return Number(value);
}

function validateFileSystem(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.realpath !== 'function' ||
    typeof value.lstat !== 'function' ||
    typeof value.open !== 'function'
  ) {
    throw new TypeError('fileSystem must provide realpath, lstat, and open');
  }
  return value as Pick<Dsl4FileSystem, 'realpath' | 'lstat' | 'open'>;
}

function isWithin(ancestor: string, candidate: string) {
  const relative = path.relative(ancestor, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function sameFileState(left: StableFileState, right: StableFileState) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

async function readBoundedFile(
  filePath: string,
  limit: number,
  fileSystem: Pick<Dsl4FileSystem, 'open'>,
) {
  const handle = await fileSystem.open(filePath, 'r');
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (size <= limit) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, limit - size + 1));
      const result = await handle.read(chunk, 0, chunk.length, null);
      if (result.bytesRead === 0) break;
      chunks.push(chunk.subarray(0, result.bytesRead));
      size += result.bytesRead;
    }
  } finally {
    await handle.close();
  }
  if (size > limit) fail('Project JSON exceeds its finite byte limit', 'K4-ASSET-AUDIT-001');
  return Buffer.concat(chunks, size);
}

async function readStableProjectJson(
  requestedRoot: string,
  canonicalRoot: string,
  inputPath: string,
  {
    maxBytes,
    label,
    code,
    fileSystem,
    readFile,
    extensions = ['.json'],
    formatLabel = 'JSON',
    parse = (source) => JSON.parse(source),
  }: {
    maxBytes: number;
    label: string;
    code: string;
    fileSystem: Pick<Dsl4FileSystem, 'realpath' | 'lstat' | 'open'>;
    readFile: (filePath: string, limit: number) => Promise<Buffer | Uint8Array>;
    extensions?: readonly string[];
    formatLabel?: string;
    parse?: (source: string, filename: string) => unknown;
  },
) {
  if (typeof inputPath !== 'string' || inputPath.length === 0 || inputPath.includes('\0')) {
    throw new TypeError(`${label} path must be a non-empty string without NUL`);
  }
  const requestedPath = path.resolve(inputPath);
  if (
    !isWithin(requestedRoot, requestedPath) ||
    !extensions.includes(path.extname(requestedPath))
  ) {
    fail(`${label} must be a project-local ${formatLabel} file`, code);
  }
  let requestedState;
  let canonicalPath;
  try {
    requestedState = await fileSystem.lstat(requestedPath);
    if (requestedState.isSymbolicLink()) fail(`${label} must not be a symbolic link`, code);
    canonicalPath = await fileSystem.realpath(requestedPath);
  } catch (error) {
    if (error instanceof Sb3BuilderError) throw error;
    fail(`Cannot resolve ${label}`, code, error);
  }
  if (!isWithin(canonicalRoot, canonicalPath)) fail(`${label} escapes the project root`, code);
  if (!requestedState.isFile()) fail(`${label} is not a regular file`, code);
  if (requestedState.size > maxBytes) fail(`${label} exceeds its finite byte limit`, code);

  let before;
  let first;
  let middle;
  let second;
  let after;
  try {
    before = await fileSystem.lstat(canonicalPath);
    first = Buffer.from(await readFile(canonicalPath, maxBytes));
    middle = await fileSystem.lstat(canonicalPath);
    second = Buffer.from(await readFile(canonicalPath, maxBytes));
    after = await fileSystem.lstat(canonicalPath);
  } catch (error) {
    if (error instanceof Sb3BuilderError) throw error;
    fail(`Cannot read ${label}`, code, error);
  }
  if (first.length > maxBytes || second.length > maxBytes) {
    fail(`${label} exceeds its finite byte limit`, code);
  }
  if (!sameFileState(before, middle) || !sameFileState(middle, after) || !first.equals(second)) {
    fail(`${label} changed while it was being read`, code);
  }
  let decoded;
  try {
    decoded = textDecoder.decode(first);
  } catch (error) {
    fail(`${label} must be valid UTF-8`, code, error);
  }
  let parsed;
  try {
    parsed = parse(decoded, path.basename(requestedPath));
  } catch (error) {
    if (error instanceof Sb3BuilderError) throw error;
    fail(`${label} must contain valid ${formatLabel}`, code, error);
  }
  if (!isRecord(parsed)) fail(`${label} ${formatLabel} must contain one object`, code);
  return parsed;
}

/** Read one project-local JSON file with the same bounded stable-snapshot contract used by audit. */
export async function loadDsl4ProjectJson({
  projectRoot,
  inputPath,
  maxBytes,
  label,
  code,
  fileSystem = defaultFileSystem,
  readFile,
}: {
  projectRoot: string;
  inputPath: string;
  maxBytes: number;
  label: string;
  code: string;
  fileSystem?: Pick<Dsl4FileSystem, 'realpath' | 'lstat' | 'open'>;
  readFile?: (filePath: string, limit: number) => Promise<Buffer | Uint8Array>;
}) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    throw new TypeError('projectRoot must be a non-empty string');
  }
  const limit = positiveLimit(maxBytes, 'maxBytes');
  const fs = validateFileSystem(fileSystem);
  if (readFile !== undefined && typeof readFile !== 'function') {
    throw new TypeError('readFile must be a function');
  }
  const readSnapshot = readFile ?? ((filePath, maximum) => readBoundedFile(filePath, maximum, fs));
  const requestedRoot = path.resolve(projectRoot);
  let canonicalRoot;
  try {
    canonicalRoot = await fs.realpath(requestedRoot);
    const rootState = await fs.lstat(canonicalRoot);
    if (!rootState.isDirectory()) fail('Project root is not a directory', code);
  } catch (error) {
    if (error instanceof Sb3BuilderError) throw error;
    fail('Cannot resolve project root', code, error);
  }
  return readStableProjectJson(requestedRoot, canonicalRoot, inputPath, {
    maxBytes: limit,
    label,
    code,
    fileSystem: fs,
    readFile: readSnapshot,
  });
}

/** Read one project-local YAML or JSON source manifest with the bounded stable-snapshot contract. */
export async function loadDsl4ProjectSourceManifest({
  projectRoot,
  inputPath,
  maxBytes,
  label,
  code,
  fileSystem = defaultFileSystem,
  readFile,
}: {
  projectRoot: string;
  inputPath: string;
  maxBytes: number;
  label: string;
  code: string;
  fileSystem?: Pick<Dsl4FileSystem, 'realpath' | 'lstat' | 'open'>;
  readFile?: (filePath: string, limit: number) => Promise<Buffer | Uint8Array>;
}) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    throw new TypeError('projectRoot must be a non-empty string');
  }
  const limit = positiveLimit(maxBytes, 'maxBytes');
  const fs = validateFileSystem(fileSystem);
  if (readFile !== undefined && typeof readFile !== 'function') {
    throw new TypeError('readFile must be a function');
  }
  const readSnapshot = readFile ?? ((filePath, maximum) => readBoundedFile(filePath, maximum, fs));
  const requestedRoot = path.resolve(projectRoot);
  let canonicalRoot;
  try {
    canonicalRoot = await fs.realpath(requestedRoot);
    const rootState = await fs.lstat(canonicalRoot);
    if (!rootState.isDirectory()) fail('Project root is not a directory', code);
  } catch (error) {
    if (error instanceof Sb3BuilderError) throw error;
    fail('Cannot resolve project root', code, error);
  }
  return readStableProjectJson(requestedRoot, canonicalRoot, inputPath, {
    maxBytes: limit,
    label,
    code,
    fileSystem: fs,
    readFile: readSnapshot,
    extensions: ['.yml', '.yaml', '.json'],
    formatLabel: 'YAML or JSON',
    parse: (source, filename) => parseDsl4ExternalSourceManifest(source, {filename}),
  });
}

/** Load one stable, bounded source manifest plus asset config and lock snapshot. */
export async function loadDsl4AssetAuditInputs({
  projectRoot,
  sourceManifest,
  assetConfig,
  assetLock,
  maxSourceManifestBytes,
  maxAssetConfigBytes,
  maxAssetLockBytes,
  fileSystem = defaultFileSystem,
  readFile,
}: {
  projectRoot: string;
  sourceManifest: string;
  assetConfig: string;
  assetLock: string;
  maxSourceManifestBytes: number;
  maxAssetConfigBytes: number;
  maxAssetLockBytes: number;
  fileSystem?: Pick<Dsl4FileSystem, 'realpath' | 'lstat' | 'open'>;
  readFile?: (filePath: string, limit: number) => Promise<Buffer | Uint8Array>;
}) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    throw new TypeError('projectRoot must be a non-empty string');
  }
  const manifestLimit = positiveLimit(maxSourceManifestBytes, 'maxSourceManifestBytes');
  const configLimit = positiveLimit(maxAssetConfigBytes, 'maxAssetConfigBytes');
  const lockLimit = positiveLimit(maxAssetLockBytes, 'maxAssetLockBytes');
  const fs = validateFileSystem(fileSystem);
  if (readFile !== undefined && typeof readFile !== 'function') {
    throw new TypeError('readFile must be a function');
  }
  const readSnapshot = readFile ?? ((filePath, maximum) => readBoundedFile(filePath, maximum, fs));
  const requestedRoot = path.resolve(projectRoot);
  let canonicalRoot;
  try {
    canonicalRoot = await fs.realpath(requestedRoot);
    const rootState = await fs.lstat(canonicalRoot);
    if (!rootState.isDirectory()) fail('Project root is not a directory', 'K4-ASSET-AUDIT-001');
  } catch (error) {
    if (error instanceof Sb3BuilderError) throw error;
    fail('Cannot resolve project root', 'K4-ASSET-AUDIT-001', error);
  }
  const [manifestInput, configInput, lockInput] = await Promise.all([
    readStableProjectJson(requestedRoot, canonicalRoot, sourceManifest, {
      maxBytes: manifestLimit,
      label: 'source manifest',
      code: 'K4-SOURCE-MANIFEST-001',
      fileSystem: fs,
      readFile: readSnapshot,
      extensions: ['.yml', '.yaml', '.json'],
      formatLabel: 'YAML or JSON',
      parse: (source, filename) => parseDsl4ExternalSourceManifest(source, {filename}),
    }),
    readStableProjectJson(requestedRoot, canonicalRoot, assetConfig, {
      maxBytes: configLimit,
      label: 'asset distribution config',
      code: 'K4-ASSET-PROFILE-001',
      fileSystem: fs,
      readFile: readSnapshot,
    }),
    readStableProjectJson(requestedRoot, canonicalRoot, assetLock, {
      maxBytes: lockLimit,
      label: 'asset distribution lock',
      code: 'K4-ASSET-LOCK-001',
      fileSystem: fs,
      readFile: readSnapshot,
    }),
  ]);
  try {
    return deepFreeze({
      sourceManifest: validateDsl4ExternalSourceManifest(manifestInput),
      config: validateDsl4AssetDistributionConfig(configInput),
      lock: validateDsl4AssetDistributionLock(lockInput),
    });
  } catch (error) {
    if (error instanceof Dsl4AssetDistributionError) fail(error.message, error.code, error);
    throw error;
  }
}

function safeByteSum(assets: ReadonlyArray<Pick<AuditAsset, 'logicalBytes'>>) {
  let total = 0;
  for (const asset of assets) {
    total += Number(asset.logicalBytes);
    if (!Number.isSafeInteger(total))
      fail('Audit byte total is not a safe integer', 'K4-ASSET-AUDIT-001');
  }
  return total;
}

function deliverySummary(assets: readonly AuditAsset[]): AuditDeliverySummary {
  const embedded = assets.filter(({delivery}) => delivery === 'embedded');
  const remote = assets.filter(({delivery}) => delivery === 'remote');
  let remoteTransportBytes = 0;
  for (const asset of remote) {
    remoteTransportBytes += Number(asset.transportBytes);
    if (!Number.isSafeInteger(remoteTransportBytes)) {
      fail('Audit remote byte total is not a safe integer', 'K4-ASSET-AUDIT-001');
    }
  }
  return {
    assets: assets.length,
    logicalBytes: safeByteSum(assets),
    embedded: {assets: embedded.length, logicalBytes: safeByteSum(embedded)},
    remote: {
      assets: remote.length,
      logicalBytes: safeByteSum(remote),
      transportBytes: remoteTransportBytes,
    },
  };
}

/** Create one deterministic, redacted distribution audit without file or network access. */
export function createDsl4AssetDistributionAudit({
  storyDocument,
  config,
  lock,
  profile,
}: {
  storyDocument: Readonly<Record<string, unknown>>;
  config: unknown;
  lock: unknown;
  profile: string;
}): AssetDistributionAudit {
  const resolved = resolveDsl4AssetDistributionProfile(storyDocument, config, lock, profile);
  const dependencies = createDsl4AssetDependencyIndex(resolved.storyDocument);
  const resolvedStoryAssets = (resolved.storyDocument.assets ?? {}) as Readonly<
    Record<string, AuditStoryAsset>
  >;
  const assets: AuditAsset[] = resolved.assets.map((asset) => {
    // The resolved assets come from the same story document as the index.
    const storyAsset = resolvedStoryAssets[asset.id] ?? {};
    return {
      id: asset.id,
      kind: asset.kind,
      delivery: asset.delivery,
      loading: storyAsset.loading,
      retention: storyAsset.retention,
      contentIntegrity: asset.contentIntegrity,
      contentType: asset.contentType,
      logicalBytes: asset.size,
      transportBytes: asset.provider.type === 'remote' ? asset.provider.size : asset.size,
    };
  });
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

  const phase = (ids: ReadonlyArray<string>) => {
    const uniqueIds = [...new Set(ids)].sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    const phaseAssets = uniqueIds.map((assetId) => {
      const asset = assetsById.get(assetId);
      if (!asset) fail(`Dependency references unknown asset ${assetId}`, 'K4-ASSET-AUDIT-001');
      return asset;
    });
    return {...deliverySummary(phaseAssets), ids: uniqueIds};
  };

  const byKind = Object.fromEntries(
    [...new Set(assets.map(({kind}) => kind))]
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
      .map((kind) => [kind, deliverySummary(assets.filter((asset) => asset.kind === kind))]),
  );
  const eagerAssets = assets.filter(({loading}) => loading !== 'lazy');
  const lazyAssets = assets.filter(({loading}) => loading === 'lazy');
  const scenes = Object.fromEntries(
    Object.entries(dependencies.scenes).map(([sceneId, scene]) => [
      sceneId,
      {
        all: phase(scene.all ?? []),
        eager: phase(scene.eager ?? []),
        lazy: phase(scene.lazy ?? []),
        background: phase(scene.background ?? []),
        sceneRetained: phase(scene.sceneRetained ?? []),
      },
    ]),
  );

  const duplicateGroups: Map<string, AuditAsset[]> = new Map();
  for (const asset of assets) {
    const group = duplicateGroups.get(asset.contentIntegrity) ?? [];
    group.push(asset);
    duplicateGroups.set(asset.contentIntegrity, group);
  }
  const duplicates = [...duplicateGroups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([contentIntegrity, group]) => ({
      contentIntegrity,
      assetIds: group.map(({id}) => id).sort(),
      // Only groups with more than one member reach here, so the first is present.
      logicalBytes: group[0]?.logicalBytes ?? 0,
      savingsBytes: (group[0]?.logicalBytes ?? 0) * (group.length - 1),
    }))
    .sort(({contentIntegrity: left}, {contentIntegrity: right}) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
  const duplicateSavingsBytes = duplicates.reduce((total, group) => {
    const next = total + group.savingsBytes;
    if (!Number.isSafeInteger(next)) fail('Duplicate byte total is not safe', 'K4-ASSET-AUDIT-001');
    return next;
  }, 0);
  const totals = deliverySummary(assets);
  return deepFreeze({
    formatVersion: 1,
    profile: resolved.profile,
    network: resolved.network,
    offlineReady: totals.remote.assets === 0,
    totals: {
      ...totals,
      eager: deliverySummary(eagerAssets),
      lazy: deliverySummary(lazyAssets),
    },
    byKind,
    preparation: {
      startup: phase(dependencies.startup),
      cover: phase(dependencies.cover),
      actors: phase(dependencies.actors),
      loading: phase(dependencies.loading),
      recognition: phase(dependencies.recognition),
      posePreviewControls: phase(dependencies.posePreviewControls),
    },
    scenes,
    duplicates: {groups: duplicates, savingsBytes: duplicateSavingsBytes},
    assets,
  });
}

/** Load project inputs and create one audit using the production source frontend. */
export async function auditDsl4AssetDistribution(options: {
  projectRoot: string;
  sourceManifest?: string;
  source?: string;
  sourceId?: string;
  assetConfig: string;
  assetLock: string;
  assetProfile: string;
  sourceFrontend: Dsl4SourceFrontend;
  maxSourceBytes: number;
  maxSourceManifestBytes: number;
  maxAssetConfigBytes: number;
  maxAssetLockBytes: number;
  sourceIncludesEnabled?: boolean;
  maxSourceFiles?: number;
  maxTotalSourceBytes?: number;
  maxIncludeDepth?: number;
  fileSystem?: Pick<Dsl4FileSystem, 'realpath' | 'lstat' | 'open'>;
  readFile?: (filePath: string, limit: number) => Promise<Buffer | Uint8Array>;
}) {
  if (!isRecord(options)) throw new TypeError('asset distribution audit options are required');
  if (!options.sourceFrontend || typeof options.sourceFrontend.parse !== 'function') {
    throw new TypeError('sourceFrontend must provide parse');
  }
  const sourceIncludesEnabled = options.sourceIncludesEnabled ?? false;
  if (typeof sourceIncludesEnabled !== 'boolean') {
    throw new TypeError('sourceIncludesEnabled must be a boolean');
  }
  let sourceGraphLimits;
  if (sourceIncludesEnabled) {
    sourceGraphLimits = {
      maxSourceFiles: positiveLimit(options.maxSourceFiles, 'maxSourceFiles'),
      maxIncludeDepth: positiveLimit(options.maxIncludeDepth, 'maxIncludeDepth'),
    };
  } else {
    if (options.maxSourceFiles !== undefined) {
      throw new TypeError('maxSourceFiles requires sourceIncludesEnabled');
    }
    if (options.maxTotalSourceBytes !== undefined) {
      throw new TypeError('maxTotalSourceBytes requires sourceIncludesEnabled');
    }
    if (options.maxIncludeDepth !== undefined) {
      throw new TypeError('maxIncludeDepth requires sourceIncludesEnabled');
    }
  }
  const sourceLimits = resolveDsl4BuildSourceLimits({
    sourceIncludesEnabled,
    maxSourceBytes: options.maxSourceBytes,
    maxTotalSourceBytes: options.maxTotalSourceBytes,
  });
  const [resolvedSource, configInput, lockInput] = await Promise.all([
    resolveDsl4ProjectSource({
      projectRoot: options.projectRoot,
      ...(options.sourceManifest === undefined ? {} : {sourceManifest: options.sourceManifest}),
      ...(options.source === undefined ? {} : {source: options.source}),
      ...(options.sourceId === undefined ? {} : {sourceId: options.sourceId}),
      maxSourceManifestBytes: options.maxSourceManifestBytes,
      ...(options.fileSystem === undefined ? {} : {fileSystem: options.fileSystem}),
      ...(options.readFile === undefined ? {} : {readFile: options.readFile}),
    }),
    loadDsl4ProjectJson({
      projectRoot: options.projectRoot,
      inputPath: options.assetConfig,
      maxBytes: options.maxAssetConfigBytes,
      label: 'asset distribution config',
      code: 'K4-ASSET-PROFILE-001',
      ...(options.fileSystem === undefined ? {} : {fileSystem: options.fileSystem}),
      ...(options.readFile === undefined ? {} : {readFile: options.readFile}),
    }),
    loadDsl4ProjectJson({
      projectRoot: options.projectRoot,
      inputPath: options.assetLock,
      maxBytes: options.maxAssetLockBytes,
      label: 'asset distribution lock',
      code: 'K4-ASSET-LOCK-001',
      ...(options.fileSystem === undefined ? {} : {fileSystem: options.fileSystem}),
      ...(options.readFile === undefined ? {} : {readFile: options.readFile}),
    }),
  ]);
  let inputs;
  try {
    inputs = deepFreeze({
      sourceManifest: resolvedSource.manifest,
      config: validateDsl4AssetDistributionConfig(configInput),
      lock: validateDsl4AssetDistributionLock(lockInput),
    });
  } catch (error) {
    if (error instanceof Dsl4AssetDistributionError) fail(error.message, error.code, error);
    throw error;
  }
  const source = await loadDsl4ExternalSource(options.projectRoot, inputs.sourceManifest, {
    maxSourceBytes: sourceLimits.maxSourceFileBytes,
    ...(options.fileSystem === undefined ? {} : {fileSystem: options.fileSystem}),
    ...(options.readFile === undefined ? {} : {readSource: options.readFile}),
  });
  let parsedInput: unknown;
  if (sourceIncludesEnabled) {
    const sourceGraph = await loadDsl4BuildSourceGraph(options.projectRoot, source, {
      limits: {
        maxSourceBytes: sourceLimits.maxSourceFileBytes,
        maxTotalSourceBytes: sourceLimits.maxSourceGraphBytes,
        ...sourceGraphLimits,
      },
      ...(options.fileSystem === undefined ? {} : {fileSystem: options.fileSystem}),
      ...(options.readFile === undefined ? {} : {readSource: options.readFile}),
    });
    parsedInput = createDsl4SourceGraphFrontend(options.sourceFrontend).parse(sourceGraph, {
      featureFlags: {dsl4Runtime: true, dsl4SourceIncludes: true},
      sourceId: source.descriptor.sourceId,
      maxComposedSourceBytes: sourceLimits.maxComposedSourceBytes,
    });
  } else {
    parsedInput = options.sourceFrontend.parse(source.descriptor.text, {
      sourceId: source.descriptor.sourceId,
    });
  }
  const parseResult = normalizeAuditParseResult(parsedInput);
  if (!parseResult.ok) {
    const first = parseResult.diagnostics?.[0];
    fail(first?.message ?? 'DSL 4.0 source validation failed', first?.code ?? 'K4-ASSET-AUDIT-001');
  }
  try {
    return createDsl4AssetDistributionAudit({
      storyDocument: parseResult.storyDocument,
      config: inputs.config,
      lock: inputs.lock,
      profile: options.assetProfile,
    });
  } catch (error) {
    if (error instanceof Dsl4AssetDistributionError) fail(error.message, error.code, error);
    throw error;
  }
}

export function serializeDsl4AssetDistributionAudit(audit: AssetDistributionAudit) {
  return `${JSON.stringify(audit)}\n`;
}

export function formatDsl4AssetDistributionAudit(audit: AssetDistributionAudit) {
  const lines = [
    `Asset profile: ${audit.profile}`,
    `Network: ${audit.network}`,
    `Offline ready: ${audit.offlineReady ? 'yes' : 'no'}`,
    `Assets: ${audit.totals.assets} (${audit.totals.logicalBytes} logical bytes)`,
    `Embedded: ${audit.totals.embedded.assets} (${audit.totals.embedded.logicalBytes} logical bytes)`,
    `Remote: ${audit.totals.remote.assets} (${audit.totals.remote.logicalBytes} logical bytes; ${audit.totals.remote.transportBytes} transport bytes)`,
    `Startup preparation: ${audit.preparation.startup.assets} (${audit.preparation.startup.logicalBytes} logical bytes)`,
    `Duplicate savings: ${audit.duplicates.savingsBytes} logical bytes`,
  ];
  for (const [kind, summary] of Object.entries(audit.byKind)) {
    lines.push(
      `Kind ${kind}: ${summary.assets} (${summary.logicalBytes} logical bytes; embedded ${summary.embedded.assets}; remote ${summary.remote.assets})`,
    );
  }
  for (const [sceneId, scene] of Object.entries(audit.scenes)) {
    lines.push(
      `Scene ${sceneId}: ${scene.all.assets} assets (${scene.all.logicalBytes} logical bytes; lazy ${scene.lazy.logicalBytes}; background ${scene.background.logicalBytes})`,
    );
  }
  return `${lines.join('\n')}\n`;
}
