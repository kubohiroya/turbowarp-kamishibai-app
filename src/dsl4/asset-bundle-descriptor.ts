import {fromByteArray, toByteArray} from 'base64-js';

import {computeDsl4Sha256Integrity} from './source-descriptor.js';
import {deepFreeze} from './story-document.js';
import type {Dsl4SubtleCrypto} from './subtle-crypto.js';

/** One asset in a bundle manifest, as the file expectation checks read it. */
interface Dsl4ManifestAsset extends Readonly<Record<string, unknown>> {
  readonly id: string;
  readonly source: Readonly<{
    type: string;
    files?: readonly Readonly<{path: string; size?: number} & Record<string, unknown>>[];
  }>;
}

/** The bundle manifest those checks walk. */
interface Dsl4AssetManifest extends Readonly<Record<string, unknown>> {
  readonly assets: readonly Dsl4ManifestAsset[];
}

const bundleKeys = new Set(['files', 'formatVersion', 'integrity', 'manifest']);
const manifestKeys = new Set(['assets', 'formatVersion']);
const assetKeys = new Set(['bitmapResolution', 'id', 'kind', 'loading', 'source', 'target']);
const projectSourceKeys = new Set(['name', 'type']);
const fileSourceKeys = new Set(['files', 'inputPath', 'mode', 'type']);
const remoteSourceKeys = new Set(['contentType', 'integrity', 'size', 'type', 'url']);
const bareRemoteSourceKeys = new Set(['type', 'url']);
const fileMetadataKeys = new Set(['integrity', 'path', 'size']);
const payloadKeys = new Set(['assetId', 'data', 'encoding', 'integrity', 'path', 'size']);
const assetKinds = new Set(['backdrop', 'costume', 'image', 'recognitionModel', 'sound', 'video']);

/**
 * The reserved payload path a remote asset's retained copy uses.
 *
 * A remote asset keeps its URL as the canonical location. When the bundle also carries its bytes
 * under this path, the runtime can use them instead of the network, which is what makes a remote
 * asset work offline. The copy is verified against the integrity the remote source already pins,
 * so it either is exactly those bytes or it is rejected — never a silent substitute. A file asset
 * may not declare this path, so the two never collide.
 */
export const dsl4RetainedRemotePayloadPath = 'retained-remote';

export const dsl4AssetBundleStoragePaths = deepFreeze({
  bundled: 'extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4.assets',
  unbundled: 'extensionStorage.kubohiroyakamishibairuntime4.assets',
});

export class Dsl4AssetBundleError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'Dsl4AssetBundleError';
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new Dsl4AssetBundleError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveLimit(value: unknown, name: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return Number(value);
}

function exactKeys(value: Record<string, unknown>, keys: Set<string>, name: string) {
  const actual = Object.keys(value);
  const unknown = actual.filter((key) => !keys.has(key));
  const missing = [...keys].filter((key) => !Object.hasOwn(value, key));
  if (unknown.length > 0 || missing.length > 0) {
    fail(
      'K4-ASSET-BUNDLE-DESCRIPTOR-001',
      `${name} keys are invalid (unknown: ${unknown.sort().join(', ') || 'none'}; missing: ${missing.sort().join(', ') || 'none'})`,
    );
  }
}

function exactAssetKeys(
  value: Record<string, unknown>,
  storyAsset: Readonly<Record<string, unknown>>,
  name: string,
) {
  const expected = new Set(assetKeys);
  if (!Object.hasOwn(value, 'target')) expected.delete('target');
  // Resolution 1 is the compatibility default for pre-metadata manifests. A high-density
  // declaration is always explicit so that a tampered bundle cannot silently fall back to 1.
  if (!Object.hasOwn(value, 'bitmapResolution') && storyAsset.bitmapResolution !== 2) {
    expected.delete('bitmapResolution');
  }
  exactKeys(value, expected, name);
}

function bitmapResolution(value: unknown, name: string) {
  if (value !== 1 && value !== 2) {
    fail('K4-ASSET-BUNDLE-DESCRIPTOR-001', `${name} must be 1 or 2`);
  }
  return value as 1 | 2;
}

function exactRemoteSourceKeys(value: Record<string, unknown>, name: string, allowBare: boolean) {
  const hasVerificationMetadata = ['contentType', 'integrity', 'size'].some((key) =>
    Object.hasOwn(value, key),
  );
  exactKeys(
    value,
    hasVerificationMetadata || !allowBare ? remoteSourceKeys : bareRemoteSourceKeys,
    name,
  );
}

function nonEmptyString(value: unknown, name: string) {
  if (typeof value !== 'string' || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail('K4-ASSET-BUNDLE-DESCRIPTOR-001', `${name} must be a non-empty string without NUL`);
  }
  return value as string;
}

function safeRelativePath(value: unknown, name: string) {
  const filePath = nonEmptyString(value, name);
  const segments = filePath.split('/');
  if (
    filePath.startsWith('/') ||
    filePath.includes('\\') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(filePath) ||
    segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    fail('K4-ASSET-BUNDLE-PATH-001', `${name} must be a canonical relative POSIX path`);
  }
  return filePath;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => [key, canonicalValue(child)]),
  );
}

function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value));
}

function encodeBase64(bytes: Uint8Array) {
  return fromByteArray(bytes);
}

function decodeBase64(value: string) {
  let bytes;
  try {
    bytes = toByteArray(value);
  } catch {
    fail('K4-ASSET-BUNDLE-BASE64-001', 'Asset payload is not canonical base64');
  }
  if (encodeBase64(bytes) !== value) {
    fail('K4-ASSET-BUNDLE-BASE64-001', 'Asset payload is not canonical base64');
  }
  return bytes;
}

/** The `sha256-<hex>` form a remote source pins its bytes with, unlike a payload's SRI form. */
async function remoteSourceIntegrity(bytes: Uint8Array, subtleCrypto: Dsl4SubtleCrypto) {
  const digest = new Uint8Array(await subtleCrypto.digest('SHA-256', bytes));
  return `sha256-${[...digest].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function sri(value: unknown, name: string) {
  if (typeof value !== 'string' || !/^sha256-[A-Za-z0-9+/]{43}=$/u.test(value)) {
    fail('K4-ASSET-BUNDLE-DESCRIPTOR-001', `${name} must be a SHA-256 SRI value`);
  }
  return value;
}

export function validateDsl4AssetBundleManifest(
  storyDocument: Readonly<Record<string, unknown>>,
  inputManifest: unknown,
) {
  if (!isRecord(inputManifest)) {
    fail('K4-ASSET-BUNDLE-DESCRIPTOR-001', 'Asset bundle manifest must be an object');
  }
  exactKeys(inputManifest, manifestKeys, 'manifest');
  if (inputManifest.formatVersion !== 1 || !Array.isArray(inputManifest.assets)) {
    fail('K4-ASSET-BUNDLE-DESCRIPTOR-001', 'Asset bundle manifest format is invalid');
  }
  const storyAssets = (storyDocument.assets ?? {}) as Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >;
  // A work is half-finished until its author seals it at build time: until then the definitions
  // may still change, so a recorded remote source is a derived record and not a constraint.
  // Sealing pins every remote source, and a later change to one is an error from then on.
  const sealedAssetSources =
    (isRecord(storyDocument.metadata) ? storyDocument.metadata.sealedAssetSources : undefined) ===
    true;
  const expectedIds = Object.keys(storyAssets).sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const seenIds = new Set();
  const assets = inputManifest.assets.map((candidate, index) => {
    if (!isRecord(candidate)) {
      fail('K4-ASSET-BUNDLE-DESCRIPTOR-001', `manifest.assets[${index}] must be an object`);
    }
    const id = nonEmptyString(candidate.id, `manifest.assets[${index}].id`);
    if (seenIds.has(id)) fail('K4-ASSET-BUNDLE-DUPLICATE-001', `Duplicate asset ID: ${id}`);
    seenIds.add(id);
    const storyAsset = storyAssets[id];
    if (!storyAsset) fail('K4-ASSET-BUNDLE-MANIFEST-001', `Unknown asset in bundle: ${id}`);
    exactAssetKeys(candidate, storyAsset, `manifest.assets[${index}]`);
    const storyResolution =
      storyAsset.kind === 'backdrop' || storyAsset.kind === 'costume'
        ? bitmapResolution(
            storyAsset.bitmapResolution ?? 1,
            `StoryDocument asset ${id}.bitmapResolution`,
          )
        : undefined;
    const candidateResolution = Object.hasOwn(candidate, 'bitmapResolution')
      ? bitmapResolution(candidate.bitmapResolution, `manifest.assets[${index}].bitmapResolution`)
      : undefined;
    if (
      !assetKinds.has(String(candidate.kind)) ||
      candidate.kind !== storyAsset.kind ||
      candidate.loading !== storyAsset.loading ||
      Object.hasOwn(candidate, 'target') !== (storyAsset.target !== undefined) ||
      candidate.target !== storyAsset.target ||
      (storyResolution !== undefined &&
        (candidateResolution === undefined
          ? storyResolution !== 1
          : candidateResolution !== storyResolution)) ||
      (storyResolution === undefined && candidateResolution !== undefined)
    ) {
      fail('K4-ASSET-BUNDLE-MANIFEST-001', `Asset metadata does not match StoryDocument: ${id}`);
    }
    if (!isRecord(candidate.source)) {
      fail('K4-ASSET-BUNDLE-DESCRIPTOR-001', `Asset ${id} source must be an object`);
    }
    if (candidate.source.type === 'project') {
      exactKeys(candidate.source, projectSourceKeys, `Asset ${id} project source`);
      if (typeof storyAsset.file === 'string' || candidate.source.name !== storyAsset.name) {
        fail('K4-ASSET-BUNDLE-MANIFEST-001', `Project asset source does not match: ${id}`);
      }
      return deepFreeze({...candidate, source: {...candidate.source}});
    }
    if (candidate.source.type === 'remote') {
      exactRemoteSourceKeys(candidate.source, `Asset ${id} remote source`, true);
      const storySource = isRecord(storyAsset.source) ? storyAsset.source : {};
      // A pinned source is already fixed by its author, so a divergence there is tampering.
      // An unpinned URL in an unsealed work is still open to edit until the author seals it.
      const pinnedSource = storySource.integrity !== undefined;
      if (
        storyAsset.delivery !== 'remote' ||
        ((sealedAssetSources || pinnedSource) &&
          (candidate.source.url !== storySource.url ||
            candidate.source.integrity !== storySource.integrity ||
            candidate.source.contentType !== storySource.contentType ||
            candidate.source.size !== storySource.size))
      ) {
        fail('K4-ASSET-BUNDLE-MANIFEST-001', `Remote asset source does not match: ${id}`);
      }
      return deepFreeze({...candidate, source: {...candidate.source}});
    }
    if (candidate.source.type !== 'file') {
      fail('K4-ASSET-BUNDLE-DESCRIPTOR-001', `Asset ${id} source type is invalid`);
    }
    exactKeys(candidate.source, fileSourceKeys, `Asset ${id} file source`);
    const inputPath = safeRelativePath(candidate.source.inputPath, `Asset ${id} inputPath`);
    if (
      inputPath !== storyAsset.file ||
      !['file', 'directory', 'archive'].includes(String(candidate.source.mode)) ||
      (storyAsset.kind !== 'recognitionModel' && candidate.source.mode !== 'file') ||
      (candidate.source.mode === 'archive' && !/\.zip$/iu.test(inputPath)) ||
      !Array.isArray(candidate.source.files) ||
      candidate.source.files.length === 0
    ) {
      fail('K4-ASSET-BUNDLE-MANIFEST-001', `File asset source does not match: ${id}`);
    }
    const seenPaths = new Set();
    const files = candidate.source.files.map((file, fileIndex) => {
      if (!isRecord(file)) {
        fail('K4-ASSET-BUNDLE-DESCRIPTOR-001', `Asset ${id} file[${fileIndex}] is invalid`);
      }
      exactKeys(file, fileMetadataKeys, `Asset ${id} file[${fileIndex}]`);
      const filePath = safeRelativePath(file.path, `Asset ${id} file path`);
      if (seenPaths.has(filePath)) {
        fail('K4-ASSET-BUNDLE-DUPLICATE-001', `Duplicate asset file: ${id}/${filePath}`);
      }
      seenPaths.add(filePath);
      if (!Number.isSafeInteger(file.size) || Number(file.size) < 0) {
        fail('K4-ASSET-BUNDLE-DESCRIPTOR-001', `Asset ${id} file size is invalid`);
      }
      return {
        path: filePath,
        size: Number(file.size),
        integrity: sri(file.integrity, 'integrity'),
      };
    });
    const sortedFiles = [...files].sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    );
    if (canonicalJson(files) !== canonicalJson(sortedFiles)) {
      fail('K4-ASSET-BUNDLE-ORDER-001', `Asset ${id} files are not in canonical order`);
    }
    return deepFreeze({...candidate, source: {...candidate.source, inputPath, files}});
  }) as Record<string, unknown>[];
  const actualIds = assets.map(({id}) => String(id));
  const sortedActualIds = [...actualIds].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  if (canonicalJson(sortedActualIds) !== canonicalJson(expectedIds)) {
    fail('K4-ASSET-BUNDLE-MANIFEST-001', 'Asset bundle must contain every StoryDocument asset');
  }
  const sortedAssets = [...assets].sort((left, right) =>
    String(left.id) < String(right.id) ? -1 : String(left.id) > String(right.id) ? 1 : 0,
  );
  if (canonicalJson(assets) !== canonicalJson(sortedAssets)) {
    fail('K4-ASSET-BUNDLE-ORDER-001', 'Asset bundle manifest is not in canonical order');
  }
  return deepFreeze({formatVersion: 1, assets});
}

export async function validateDsl4EmbeddedAssetBundle(
  storyDocument: Readonly<Record<string, unknown>>,
  input: unknown,
  {
    maxFiles,
    maxTotalBytes,
    subtleCrypto = globalThis.crypto?.subtle,
  }: {maxFiles: number; maxTotalBytes: number; subtleCrypto?: Dsl4SubtleCrypto | undefined},
) {
  if (storyDocument.kind !== 'StoryDocument' || storyDocument.version !== '4.0') {
    throw new TypeError('DSL 4.0 asset bundle requires a StoryDocument version 4.0');
  }
  const fileLimit = positiveLimit(maxFiles, 'maxFiles');
  const totalLimit = positiveLimit(maxTotalBytes, 'maxTotalBytes');
  if (!isRecord(input)) fail('K4-ASSET-BUNDLE-DESCRIPTOR-001', 'Asset bundle must be an object');
  exactKeys(input, bundleKeys, 'asset bundle');
  if (input.formatVersion !== 1 || !Array.isArray(input.files)) {
    fail('K4-ASSET-BUNDLE-DESCRIPTOR-001', 'Asset bundle format is invalid');
  }
  const manifest = validateDsl4AssetBundleManifest(storyDocument, input.manifest);
  if (input.files.length > fileLimit)
    fail('K4-ASSET-BUNDLE-LIMIT-001', 'Asset bundle exceeds maxFiles');
  const expectedFiles = new Map();
  // A file asset's payloads are required; a remote asset's retained copy is optional.
  const requiredFiles = new Set<string>();
  for (const asset of (manifest as unknown as Dsl4AssetManifest).assets) {
    if (asset.source.type === 'file') {
      for (const file of asset.source.files ?? []) {
        if (file.path === dsl4RetainedRemotePayloadPath) {
          fail(
            'K4-ASSET-BUNDLE-MANIFEST-001',
            `Asset ${asset.id} cannot use the reserved retained payload path`,
          );
        }
        expectedFiles.set(`${asset.id}\0${file.path}`, file);
        requiredFiles.add(`${asset.id}\0${file.path}`);
      }
      continue;
    }
    if (asset.source.type !== 'remote') continue;
    // Only a remote source that pins its bytes can have a copy checked against them.
    const {integrity, size} = asset.source as unknown as {integrity?: unknown; size?: unknown};
    if (typeof integrity !== 'string' || !Number.isSafeInteger(size)) continue;
    // Only the size is fixed by the manifest here: a payload's integrity is this bundle's SRI
    // form while a remote source pins the same bytes in hex, so the copy is checked for internal
    // consistency below and against the source's own pin by the runtime before it is used.
    expectedFiles.set(`${asset.id}\0${dsl4RetainedRemotePayloadPath}`, {
      path: dsl4RetainedRemotePayloadPath,
      size,
      retainedFor: integrity,
    });
  }
  const blobs = new Map();
  let totalBytes = 0;
  const files = [];
  for (const [index, candidate] of input.files.entries()) {
    if (!isRecord(candidate)) {
      fail('K4-ASSET-BUNDLE-DESCRIPTOR-001', `files[${index}] must be an object`);
    }
    exactKeys(candidate, payloadKeys, `files[${index}]`);
    const assetId = nonEmptyString(candidate.assetId, `files[${index}].assetId`);
    const filePath = safeRelativePath(candidate.path, `files[${index}].path`);
    const key = `${assetId}\0${filePath}`;
    if (blobs.has(key))
      fail('K4-ASSET-BUNDLE-DUPLICATE-001', `Duplicate payload: ${assetId}/${filePath}`);
    const expected = expectedFiles.get(key);
    if (!expected)
      fail('K4-ASSET-BUNDLE-MANIFEST-001', `Unexpected payload: ${assetId}/${filePath}`);
    if (
      candidate.encoding !== 'base64' ||
      !Number.isSafeInteger(candidate.size) ||
      Number(candidate.size) < 0 ||
      candidate.size !== expected.size ||
      (expected.retainedFor === undefined && candidate.integrity !== expected.integrity)
    ) {
      fail('K4-ASSET-BUNDLE-DESCRIPTOR-001', `Payload metadata is invalid: ${assetId}/${filePath}`);
    }
    if (typeof candidate.data !== 'string') {
      fail('K4-ASSET-BUNDLE-DESCRIPTOR-001', 'Asset payload data must be a string');
    }
    const bytes = decodeBase64(candidate.data);
    totalBytes += bytes.length;
    if (totalBytes > totalLimit) {
      fail('K4-ASSET-BUNDLE-LIMIT-001', 'Asset bundle exceeds maxTotalBytes');
    }
    if (bytes.length !== candidate.size) {
      fail('K4-ASSET-BUNDLE-SIZE-001', `Payload size does not match: ${assetId}/${filePath}`);
    }
    const integrity = await computeDsl4Sha256Integrity(bytes, subtleCrypto);
    if (integrity !== candidate.integrity) {
      fail(
        'K4-ASSET-BUNDLE-INTEGRITY-001',
        `Payload integrity does not match: ${assetId}/${filePath}`,
      );
    }
    // A retained copy must also be exactly the bytes its remote source pins, so a bundle never
    // carries — or is re-signed with — a copy the runtime would then refuse.
    if (
      expected.retainedFor !== undefined &&
      (await remoteSourceIntegrity(bytes, subtleCrypto)) !== expected.retainedFor
    ) {
      fail(
        'K4-ASSET-BUNDLE-INTEGRITY-001',
        `Retained payload does not match its remote source: ${assetId}/${filePath}`,
      );
    }
    blobs.set(key, bytes);
    files.push({
      assetId,
      path: filePath,
      size: bytes.length,
      integrity,
      encoding: 'base64',
      data: candidate.data,
    });
  }
  for (const key of requiredFiles) {
    if (!blobs.has(key)) {
      fail('K4-ASSET-BUNDLE-MANIFEST-001', 'Asset bundle is missing one or more file payloads');
    }
  }
  const sortedFiles = [...files].sort((left, right) =>
    left.assetId === right.assetId
      ? left.path < right.path
        ? -1
        : left.path > right.path
          ? 1
          : 0
      : left.assetId < right.assetId
        ? -1
        : 1,
  );
  if (canonicalJson(files) !== canonicalJson(sortedFiles)) {
    fail('K4-ASSET-BUNDLE-ORDER-001', 'Asset bundle files are not in canonical order');
  }
  const content = {formatVersion: 1, manifest, files};
  const integrity = sri(input.integrity, 'bundle integrity');
  const expectedIntegrity = await computeDsl4Sha256Integrity(
    new TextEncoder().encode(canonicalJson(content)),
    subtleCrypto,
  );
  if (integrity !== expectedIntegrity) {
    fail('K4-ASSET-BUNDLE-INTEGRITY-001', 'Asset bundle integrity does not match its content');
  }
  const descriptor = deepFreeze({...content, integrity: expectedIntegrity});
  return Object.freeze({
    descriptor,
    getFile(assetId: string, filePath: string) {
      const bytes = blobs.get(`${assetId}\0${filePath}`);
      if (!bytes)
        fail('K4-ASSET-BUNDLE-LOOKUP-001', `Asset bundle file not found: ${assetId}/${filePath}`);
      return new Uint8Array(bytes);
    },
  });
}

export async function createDsl4EmbeddedAssetBundle(
  storyDocument: Readonly<Record<string, unknown>>,
  snapshot: {manifest: unknown; getFile(assetId: string, filePath: string): Uint8Array},
  options: Parameters<typeof validateDsl4EmbeddedAssetBundle>[2],
) {
  if (!snapshot || typeof snapshot.getFile !== 'function') {
    throw new TypeError('asset snapshot must provide manifest and getFile');
  }
  const manifest = validateDsl4AssetBundleManifest(storyDocument, snapshot.manifest);
  const files = [];
  for (const asset of (manifest as unknown as Dsl4AssetManifest).assets) {
    if (asset.source.type === 'remote') {
      // The caller asks for a retained copy by serving the reserved path from its snapshot.
      const {integrity, size} = asset.source as unknown as {integrity?: unknown; size?: unknown};
      if (typeof integrity !== 'string' || !Number.isSafeInteger(size)) continue;
      let retained: Uint8Array | undefined;
      try {
        retained = new Uint8Array(
          snapshot.getFile(String(asset.id), dsl4RetainedRemotePayloadPath),
        );
      } catch {
        // A snapshot that does not serve the reserved path simply keeps this asset remote-only.
        continue;
      }
      if (!retained.length) continue;
      files.push({
        assetId: asset.id,
        path: dsl4RetainedRemotePayloadPath,
        size: retained.length,
        // A payload's integrity is this bundle's own SRI form; the remote source pins the same
        // bytes in its own hex form, and the runtime checks the copy against that before use.
        integrity: await computeDsl4Sha256Integrity(retained, options.subtleCrypto),
        encoding: 'base64',
        data: encodeBase64(retained),
      });
      continue;
    }
    if (asset.source.type !== 'file') continue;
    for (const file of asset.source.files ?? []) {
      const bytes = new Uint8Array(snapshot.getFile(String(asset.id), String(file.path)));
      files.push({
        assetId: asset.id,
        path: file.path,
        size: bytes.length,
        integrity: file.integrity,
        encoding: 'base64',
        data: encodeBase64(bytes),
      });
    }
  }
  const content = {formatVersion: 1, manifest, files};
  const descriptor = {
    ...content,
    integrity: await computeDsl4Sha256Integrity(
      new TextEncoder().encode(canonicalJson(content)),
      options.subtleCrypto,
    ),
  };
  return (await validateDsl4EmbeddedAssetBundle(storyDocument, descriptor, options)).descriptor;
}
