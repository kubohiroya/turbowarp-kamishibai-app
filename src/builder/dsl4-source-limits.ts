import {dsl4SourceGraphDefaultLimits} from '../dsl4/source-graph.js';
import {dsl4SourceDeclaresIncludes} from '../dsl4/source-include-detection.js';

function positiveSafeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return Number(value);
}

/**
 * Resolve the authoring and packaged-source limits used by every build boundary.
 *
 * A single-source build uses maxSourceBytes throughout. An include build uses maxSourceBytes for
 * each graph node and maxTotalSourceBytes for both the graph-node byte total and composed canonical
 * source persisted in the package.
 */
export function resolveDsl4BuildSourceLimits({
  sourceIncludesEnabled,
  maxSourceBytes,
  maxTotalSourceBytes,
}: {
  sourceIncludesEnabled: boolean;
  maxSourceBytes: unknown;
  maxTotalSourceBytes?: unknown;
}): Readonly<{
  maxSourceFileBytes: number;
  maxSourceGraphBytes: number;
  maxComposedSourceBytes: number;
  maxPackagedSourceBytes: number;
}> {
  if (typeof sourceIncludesEnabled !== 'boolean') {
    throw new TypeError('sourceIncludesEnabled must be a boolean');
  }
  const maxSourceFileBytes = positiveSafeInteger(maxSourceBytes, 'maxSourceBytes');
  if (!sourceIncludesEnabled) {
    return Object.freeze({
      maxSourceFileBytes,
      maxSourceGraphBytes: maxSourceFileBytes,
      maxComposedSourceBytes: maxSourceFileBytes,
      maxPackagedSourceBytes: maxSourceFileBytes,
    });
  }
  const maxSourceGraphBytes = positiveSafeInteger(maxTotalSourceBytes, 'maxTotalSourceBytes');
  if (maxSourceGraphBytes < maxSourceFileBytes) {
    throw new TypeError('maxTotalSourceBytes must be greater than or equal to maxSourceBytes');
  }
  return Object.freeze({
    maxSourceFileBytes,
    maxSourceGraphBytes,
    maxComposedSourceBytes: maxSourceGraphBytes,
    maxPackagedSourceBytes: maxSourceGraphBytes,
  });
}

/**
 * Decide, from the entry source a build already read, whether it is composed as a Source Graph, and
 * resolve that read's limits. A source that declares `include` uses the graph limits, with defaults
 * for the ones the caller leaves out; any other source keeps the single-source limits.
 */
export function resolveDsl4EntrySourceGraph({
  sourceText,
  maxSourceBytes,
  maxTotalSourceBytes,
  maxSourceFiles,
  maxIncludeDepth,
}: {
  sourceText: string;
  maxSourceBytes: unknown;
  maxTotalSourceBytes?: unknown;
  maxSourceFiles?: unknown;
  maxIncludeDepth?: unknown;
}) {
  const graph = dsl4SourceDeclaresIncludes(sourceText);
  const maxSourceFileBytes = positiveSafeInteger(maxSourceBytes, 'maxSourceBytes');
  const limits = resolveDsl4BuildSourceLimits({
    sourceIncludesEnabled: graph,
    maxSourceBytes: maxSourceFileBytes,
    maxTotalSourceBytes:
      maxTotalSourceBytes ??
      (graph
        ? Math.max(maxSourceFileBytes, dsl4SourceGraphDefaultLimits.maxTotalSourceBytes)
        : undefined),
  });
  return Object.freeze({
    graph,
    limits,
    graphLimits: Object.freeze({
      maxSourceBytes: limits.maxSourceFileBytes,
      maxTotalSourceBytes: limits.maxSourceGraphBytes,
      maxSourceFiles: positiveSafeInteger(
        maxSourceFiles ?? dsl4SourceGraphDefaultLimits.maxSourceFiles,
        'maxSourceFiles',
      ),
      maxIncludeDepth: positiveSafeInteger(
        maxIncludeDepth ?? dsl4SourceGraphDefaultLimits.maxIncludeDepth,
        'maxIncludeDepth',
      ),
    }),
  });
}
