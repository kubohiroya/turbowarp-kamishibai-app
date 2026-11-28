import {validateDsl4CacheIdentity} from './cache-identity.js';
import {computeDsl4Sha256Integrity} from './source-descriptor.js';
import type {Dsl4SourceFrontend} from './source-frontend.js';
import {createDsl4SourceGraphFrontend} from './source-graph-frontend.js';
import {deepFreeze} from './story-document.js';
import type {Dsl4SubtleCrypto} from './subtle-crypto.js';

const textEncoder = new TextEncoder();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, name: string) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new TypeError(`${name} must be a non-empty string without NUL`);
  }
  return value;
}

/**
 * Turn one already validated Source Graph into the only immutable source generation exposed to
 * preview. The integrity covers every graph node and its logical path, not only the composed text,
 * so moving a declaration between included files cannot reuse a stale generation identity.
 */
export async function createDsl4PreviewSourceGraphGeneration(
  sourceGraph: unknown,
  {
    sourceFrontend,
    sourceId: inputSourceId,
    displayName: inputDisplayName,
    maxComposedSourceBytes,
    cacheIdentity: inputCacheIdentity,
    subtleCrypto = globalThis.crypto?.subtle,
  }: {
    sourceFrontend: Dsl4SourceFrontend;
    sourceId: string;
    displayName: string;
    maxComposedSourceBytes: number;
    /** The entry source's persisted story cache, when its manifest names one. */
    cacheIdentity?: unknown;
    subtleCrypto?: Dsl4SubtleCrypto | undefined;
  },
) {
  if (!isRecord(sourceGraph) || sourceGraph.formatVersion !== 1) {
    throw new TypeError('preview Source Graph generation requires a validated graph');
  }
  if (!isRecord(sourceFrontend) || typeof sourceFrontend.parse !== 'function') {
    throw new TypeError('sourceFrontend must provide parse');
  }
  if (!Number.isSafeInteger(maxComposedSourceBytes) || Number(maxComposedSourceBytes) < 1) {
    throw new TypeError('maxComposedSourceBytes must be a positive safe integer');
  }
  const sourceId = nonEmptyString(inputSourceId, 'sourceId');
  const displayName = nonEmptyString(inputDisplayName, 'displayName');
  const cacheIdentity =
    inputCacheIdentity === undefined ? undefined : validateDsl4CacheIdentity(inputCacheIdentity);
  const discoveryOrder = sourceGraph.discoveryOrder;
  const nodes = sourceGraph.nodes;
  if (!Array.isArray(discoveryOrder) || !Array.isArray(nodes)) {
    throw new TypeError('preview Source Graph generation requires nodes and discoveryOrder');
  }
  const nodesByPath = new Map(
    nodes.map((node) => {
      if (
        !isRecord(node) ||
        typeof node.sourcePath !== 'string' ||
        typeof node.canonicalSource !== 'string'
      ) {
        throw new TypeError('preview Source Graph node is invalid');
      }
      return [node.sourcePath, node];
    }),
  );
  const fingerprint = discoveryOrder.map((sourcePath) => {
    if (typeof sourcePath !== 'string' || !nodesByPath.has(sourcePath)) {
      throw new TypeError('preview Source Graph discovery order is invalid');
    }
    const node = nodesByPath.get(sourcePath) as {canonicalSource: unknown};
    return [sourcePath, node.canonicalSource];
  });
  const integrity = await computeDsl4Sha256Integrity(
    textEncoder.encode(
      JSON.stringify({formatVersion: 1, entryPath: sourceGraph.entryPath, fingerprint}),
    ),
    subtleCrypto,
  );
  const graphFrontend = createDsl4SourceGraphFrontend(sourceFrontend as Dsl4SourceFrontend);
  const parsed = graphFrontend.parse(sourceGraph, {
    featureFlags: {dsl4Runtime: true},
    sourceId,
    maxComposedSourceBytes: Number(maxComposedSourceBytes),
    // `canonicalSource` is named because the snapshot below reads it and the result republishes
    // it; a spread of an index signature does not carry the signature into the result type.
  }) as Readonly<{ok: unknown; diagnostics: unknown; canonicalSource?: unknown}> &
    Readonly<Record<string, unknown>>;
  if (!isRecord(parsed) || typeof parsed.ok !== 'boolean' || !Array.isArray(parsed.diagnostics)) {
    throw new TypeError('Source Graph frontend returned an invalid result');
  }
  const result = deepFreeze({
    ...parsed,
    sourceSnapshot: {
      sourceId,
      displayName,
      byteLength: Number(sourceGraph.totalSourceBytes),
      integrity,
      text: typeof parsed.canonicalSource === 'string' ? parsed.canonicalSource : '',
      ...(cacheIdentity === undefined ? {} : {cacheIdentity}),
    },
  });
  return deepFreeze({
    formatVersion: 1,
    key: integrity,
    sourcePaths: [...discoveryOrder],
    assetPaths: Array.isArray(sourceGraph.assetFiles)
      ? [...new Set(sourceGraph.assetFiles.map((asset) => asset.path))].sort()
      : [],
    result,
  });
}
