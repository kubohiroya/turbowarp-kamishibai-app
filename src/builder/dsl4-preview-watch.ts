import {watch} from 'node:fs';
import path from 'node:path';

import {resolveDsl4FeatureFlags} from '../dsl4/feature-flags.js';
import {createDsl4PreviewSourceGraphGeneration} from '../dsl4/preview-source-graph-generation.js';
import {computeDsl4Sha256Integrity} from '../dsl4/source-descriptor.js';
import {deepFreeze} from '../dsl4/story-document.js';
import {createDsl4RetryableCleanup} from '../dsl4/retryable-cleanup.js';
import {createDsl4FailedCreationOwners} from '../dsl4/failed-creation-owners.js';
import {createDsl4AssetObserverWaits} from '../dsl4/asset-cleanup-owners.js';
import type {Dsl4Clock, Dsl4TimerHandle} from '../dsl4/clock.js';
import type {Dsl4SubtleCrypto} from '../dsl4/subtle-crypto.js';
import {
  loadDsl4ExternalSource,
  validateDsl4ExternalSourceManifest,
} from './dsl4-external-source.js';
import {loadDsl4LocalAssetSnapshot} from './dsl4-local-assets.js';
import {loadDsl4BuildSourceGraph} from './dsl4-source-graph.js';
import {dsl4CliDefaultLimits} from './dsl4-cli-default-limits.js';
import {dsl4SourceGraphDefaultLimits} from '../dsl4/source-graph.js';
import {dsl4SourceDeclaresIncludes} from '../dsl4/source-include-detection.js';
import {resolveDsl4BuildSourceLimits} from './dsl4-source-limits.js';
import type {Dsl4FileWatcher} from './file-system.js';
import type {Dsl4SourceFrontend} from '../dsl4/source-frontend.js';

export const dsl4PreviewWatchDefaults = Object.freeze({
  quietWindowMs: 100,
  retryIntervalMs: 50,
  stabilityTimeoutMs: 2_000,
});

function schedule(callback: () => void, milliseconds: number) {
  return globalThis.setTimeout(callback, milliseconds);
}

function cancelSchedule(timer: ReturnType<typeof globalThis.setTimeout>) {
  globalThis.clearTimeout(timer);
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

const defaultClock = Object.freeze({
  now: () => globalThis.performance.now(),
  setTimeout: schedule,
  clearTimeout: cancelSchedule,
  sleep,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteMilliseconds(value: unknown, name: string, minimum: number) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new TypeError(`${name} must be a safe integer >= ${minimum}`);
  }
  return Number(value);
}

function positiveSafeInteger(value: unknown, name: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return Number(value);
}

function validateClock(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.now !== 'function' ||
    typeof value.setTimeout !== 'function' ||
    typeof value.clearTimeout !== 'function' ||
    typeof value.sleep !== 'function'
  ) {
    throw new TypeError('clock must provide now, setTimeout, clearTimeout, and sleep');
  }
  return value as unknown as Dsl4Clock;
}

function errorCode(error: unknown) {
  return isRecord(error) && typeof error.code === 'string' ? error.code : '';
}

function diagnosticMessage(code: string) {
  return (
    {
      'K4-PREVIEW-SOURCE-UNSTABLE':
        'DSL 4.0 source did not become stable before the preview retry limit',
      'K4-SOURCE-MISSING': 'DSL 4.0 source is missing',
      'K4-SOURCE-PATH-001': 'DSL 4.0 source path is not allowed',
      'K4-SOURCE-READ-001': 'DSL 4.0 source could not be read',
      'K4-SOURCE-FILE-001': 'DSL 4.0 source is not a regular file',
      'K4-SOURCE-SIZE-001': 'DSL 4.0 source exceeds the configured byte limit',
      'K4-SOURCE-UTF8-001': 'DSL 4.0 source is not valid UTF-8',
      'K4-INCLUDE-CYCLE': 'DSL 4.0 source includes contain a cycle',
      'K4-INCLUDE-LIMIT-001': 'DSL 4.0 source includes exceed a configured limit',
      'K4-INCLUDE-READ-001': 'An included DSL 4.0 source could not be read',
      'K4-DECLARATION-DUPLICATE': 'A DSL 4.0 declaration is duplicated across sources',
      'K4-ASSET-MISSING': 'A project-local asset is missing',
      'K4-ASSET-UNSTABLE-001': 'Project-local assets did not form a stable generation',
    }[code] ?? 'DSL 4.0 source could not be prepared for preview'
  );
}

function sourceDiagnostic(code: string, severity: 'error' | 'warning', sourceId: string) {
  return deepFreeze({
    version: 1,
    code,
    severity,
    message: diagnosticMessage(code),
    sourceId,
    range: {
      start: {line: 1, column: 1, offset: 0},
      end: {line: 1, column: 1, offset: 0},
    },
    path: '$',
    related: [],
  });
}

function sourceFailure(code: string, severity: 'error' | 'warning', sourceId: string) {
  return deepFreeze({
    ok: false,
    canonicalSource: '',
    diagnostics: [sourceDiagnostic(code, severity, sourceId)],
    sourceSnapshot: null,
  });
}

/** The generation result the watcher publishes, as far as it inspects it. */
interface Dsl4PreviewGenerationResult extends Readonly<Record<string, unknown>> {
  readonly ok: boolean;
  readonly storyDocument: Readonly<Record<string, unknown>>;
}

/** Watch one manifest-authorized source and publish only immutable, stable frontend results. */
export function createDsl4PreviewSourceWatcher({
  projectRoot,
  manifest: inputManifest,
  sourceFrontend,
  maxSourceBytes,
  featureFlags: inputFeatureFlags = {},
  maxSourceFiles,
  maxTotalSourceBytes,
  maxIncludeDepth,
  maxAssetFileBytes,
  maxAssetFiles,
  maxTotalAssetBytes,
  onResult,
  onError,
  quietWindowMs = dsl4PreviewWatchDefaults.quietWindowMs,
  retryIntervalMs = dsl4PreviewWatchDefaults.retryIntervalMs,
  stabilityTimeoutMs = dsl4PreviewWatchDefaults.stabilityTimeoutMs,
  subtleCrypto = globalThis.crypto?.subtle,
  loadSource = loadDsl4ExternalSource,
  watchFactory = (directory, listener, options = {}) =>
    watch(directory, {persistent: true, recursive: options.recursive === true}, listener),
  loadSourceGraph = loadDsl4BuildSourceGraph,
  loadAssets = loadDsl4LocalAssetSnapshot,
  clock: inputClock = defaultClock,
}: {
  projectRoot: string;
  manifest: unknown;
  sourceFrontend: Dsl4SourceFrontend;
  maxSourceBytes: number;
  featureFlags?: unknown;
  maxSourceFiles?: number;
  maxTotalSourceBytes?: number;
  maxIncludeDepth?: number;
  maxAssetFileBytes?: number;
  maxAssetFiles?: number;
  maxTotalAssetBytes?: number;
  onResult: (result: Readonly<Record<string, unknown>>) => unknown | Promise<unknown>;
  onError?: (error: unknown) => void;
  quietWindowMs?: number;
  retryIntervalMs?: number;
  stabilityTimeoutMs?: number;
  subtleCrypto?: Dsl4SubtleCrypto | undefined;
  loadSource?: (
    projectRoot: string,
    manifest: unknown,
    options: {maxSourceBytes: number; subtleCrypto?: Dsl4SubtleCrypto | undefined},
  ) => Promise<Record<string, unknown>>;
  watchFactory?: (
    directory: string,
    listener: (eventType: string, filename: string | Buffer | null) => void,
    options?: {recursive?: boolean},
  ) => Dsl4FileWatcher;
  loadSourceGraph?: typeof loadDsl4BuildSourceGraph;
  loadAssets?: typeof loadDsl4LocalAssetSnapshot;
  clock?: Dsl4Clock;
}) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    throw new TypeError('projectRoot must be a non-empty string');
  }
  const manifest = validateDsl4ExternalSourceManifest(inputManifest);
  if (!isRecord(sourceFrontend) || typeof sourceFrontend.parse !== 'function') {
    throw new TypeError('sourceFrontend must provide parse');
  }
  // Validated for the caller's sake; include processing no longer depends on a flag.
  resolveDsl4FeatureFlags(inputFeatureFlags);
  const sourceLimits = resolveDsl4BuildSourceLimits({
    sourceIncludesEnabled: true,
    maxSourceBytes,
    maxTotalSourceBytes:
      maxTotalSourceBytes ??
      Math.max(maxSourceBytes, dsl4SourceGraphDefaultLimits.maxTotalSourceBytes),
  });
  if (typeof onResult !== 'function') throw new TypeError('onResult must be a function');
  if (onError !== undefined && typeof onError !== 'function') {
    throw new TypeError('onError must be a function');
  }
  if (typeof loadSource !== 'function') throw new TypeError('loadSource must be a function');
  if (typeof watchFactory !== 'function') throw new TypeError('watchFactory must be a function');
  if (typeof loadSourceGraph !== 'function') {
    throw new TypeError('loadSourceGraph must be a function');
  }
  if (typeof loadAssets !== 'function') {
    throw new TypeError('loadAssets must be a function');
  }
  const graphLimits = {
    maxSourceFiles: positiveSafeInteger(
      maxSourceFiles ?? dsl4SourceGraphDefaultLimits.maxSourceFiles,
      'maxSourceFiles',
    ),
    maxSourceBytes: sourceLimits.maxSourceFileBytes,
    maxTotalSourceBytes: sourceLimits.maxSourceGraphBytes,
    maxIncludeDepth: positiveSafeInteger(
      maxIncludeDepth ?? dsl4SourceGraphDefaultLimits.maxIncludeDepth,
      'maxIncludeDepth',
    ),
  };
  const assetLimits = {
    maxFileBytes: positiveSafeInteger(
      maxAssetFileBytes ?? dsl4CliDefaultLimits.maxAssetFileBytes,
      'maxAssetFileBytes',
    ),
    maxFiles: positiveSafeInteger(
      maxAssetFiles ?? dsl4CliDefaultLimits.maxAssetFiles,
      'maxAssetFiles',
    ),
    maxTotalBytes: positiveSafeInteger(
      maxTotalAssetBytes ?? dsl4CliDefaultLimits.maxTotalAssetBytes,
      'maxTotalAssetBytes',
    ),
  };
  if (assetLimits.maxFileBytes > assetLimits.maxTotalBytes) {
    throw new TypeError('maxAssetFileBytes must be less than or equal to maxTotalAssetBytes');
  }
  const quiet = finiteMilliseconds(quietWindowMs, 'quietWindowMs', 0);
  const retry = finiteMilliseconds(retryIntervalMs, 'retryIntervalMs', 1);
  const timeout = finiteMilliseconds(stabilityTimeoutMs, 'stabilityTimeoutMs', retry);
  const maximumAttempts = Math.ceil(timeout / retry) + 1;
  const clock = validateClock(inputClock);
  if (typeof manifest.path !== 'string') {
    throw new TypeError('manifest.path must be resolved');
  }
  const sourcePath = path.resolve(projectRoot, ...manifest.path.split('/'));
  const sourceBasename = path.basename(sourcePath);
  const textEncoder = new TextEncoder();

  let started = false;
  let disposed = false;
  /** Whether the entry last read declared `include`, so every project file can change it. */
  let composed = false;
  let status: 'idle' | 'watching' | 'waiting' | 'stabilizing' | 'failed' | 'disposed' = 'idle';
  let revision = 0;
  let published = 0;
  let lastPublication: Readonly<Record<string, unknown>> | null = null;
  let publicationKey = '';
  let quietTimer: Dsl4TimerHandle = null;
  let fileWatcher: Dsl4FileWatcher | null = null;
  let operationQueue = Promise.resolve();

  function snapshot() {
    return deepFreeze({
      version: 1,
      status,
      revision,
      published,
      lastPublication,
      started,
      disposed,
    });
  }

  function reportInternalError(error: unknown) {
    status = disposed ? 'disposed' : 'failed';
    try {
      onError?.(error);
    } catch {
      // Error observers cannot change preview watch state.
    }
  }
  const failedCreations = createDsl4FailedCreationOwners('Preview watcher factory cleanup failed');
  const observers = createDsl4AssetObserverWaits((error) => {
    void failedCreations.joinLateFailure(error)?.catch(reportInternalError);
    reportInternalError(error);
  });

  function enqueue(operation: () => unknown | Promise<unknown>) {
    const result = operationQueue.then(operation);
    operationQueue = result.then(
      () => undefined,
      (error) => reportInternalError(error),
    );
    return result;
  }

  async function publish(result: Readonly<Record<string, unknown>>, key: string) {
    if (disposed || key === publicationKey) return;
    await observers.wait(() => onResult(result));
    if (disposed) return;
    publicationKey = key;
    published += 1;
    const diagnostics = (result.diagnostics ?? []) as ReadonlyArray<Record<string, unknown>>;
    const diagnostic = diagnostics[0];
    const sourceSnapshot = (result.sourceSnapshot ?? null) as Record<string, unknown> | null;
    lastPublication = deepFreeze(
      sourceSnapshot
        ? {
            kind: 'source',
            integrity: sourceSnapshot.integrity,
            ok: result.ok,
            diagnosticCount: diagnostics.length,
          }
        : {
            kind: 'diagnostic',
            code: diagnostic?.code ?? 'K4-PREVIEW-INTERNAL',
            severity: diagnostic?.severity ?? 'error',
          },
    );
  }

  async function loadIncludedGeneration() {
    const entrySource = await loadSource(projectRoot, manifest, {
      maxSourceBytes: sourceLimits.maxSourceFileBytes,
      subtleCrypto,
    });
    const sourceGraph = await loadSourceGraph(projectRoot, entrySource, {
      limits: graphLimits,
    });
    const generation = (await createDsl4PreviewSourceGraphGeneration(sourceGraph, {
      sourceFrontend,
      sourceId: manifest.sourceId,
      displayName: sourceBasename,
      maxComposedSourceBytes: sourceLimits.maxComposedSourceBytes,
      ...(isRecord(entrySource.descriptor) && entrySource.descriptor.cacheIdentity !== undefined
        ? {cacheIdentity: entrySource.descriptor.cacheIdentity}
        : {}),
      subtleCrypto,
    })) as unknown as {result: Dsl4PreviewGenerationResult; key: string} & Readonly<
      Record<string, unknown>
    >;
    let assetIntegrity = 'invalid-source';
    if (generation.result.ok) {
      const assets = await loadAssets(projectRoot, generation.result.storyDocument, {
        ...assetLimits,
        subtleCrypto,
      });
      assetIntegrity = await computeDsl4Sha256Integrity(
        textEncoder.encode(JSON.stringify(assets.manifest)),
        subtleCrypto,
      );
    }
    const key = await computeDsl4Sha256Integrity(
      textEncoder.encode(
        JSON.stringify({
          formatVersion: 1,
          sourceIntegrity: generation.key,
          assetIntegrity,
        }),
      ),
      subtleCrypto,
    );
    return {key, result: generation.result};
  }

  async function loadStableIncludedGeneration(requestedRevision: number) {
    const first = await loadIncludedGeneration();
    await clock.sleep(quiet);
    if (disposed || requestedRevision !== revision) return null;
    const second = await loadIncludedGeneration();
    if (first.key !== second.key) {
      const error = new Error('Source Graph or local assets changed during generation capture');
      Object.defineProperty(error, 'code', {value: 'K4-PREVIEW-SOURCE-UNSTABLE'});
      throw error;
    }
    return second;
  }

  async function stabilize(requestedRevision: number) {
    if (disposed || requestedRevision !== revision) return snapshot();
    status = 'stabilizing';
    const startedAt = Number(clock.now());
    let lastTransientCode = 'K4-PREVIEW-SOURCE-UNSTABLE';
    let attempts = 0;

    while (!disposed && requestedRevision === revision) {
      attempts += 1;
      try {
        const loaded = await loadSource(projectRoot, manifest, {
          maxSourceBytes: sourceLimits.maxSourceFileBytes,
          subtleCrypto,
        });
        if (disposed || requestedRevision !== revision) return snapshot();
        if (!isRecord(loaded) || !isRecord(loaded.descriptor)) {
          throw new TypeError('loadSource returned an invalid external source snapshot');
        }
        const descriptor = loaded.descriptor;
        if (
          typeof descriptor.text !== 'string' ||
          typeof descriptor.integrity !== 'string' ||
          descriptor.sourceId !== manifest.sourceId
        ) {
          throw new TypeError('loadSource returned an invalid source descriptor');
        }
        // A source that declares `include` is composed with what it names; any other source is
        // read on its own, so its preview text stays the authored text.
        composed = dsl4SourceDeclaresIncludes(descriptor.text);
        if (composed) {
          const generation = await loadStableIncludedGeneration(requestedRevision);
          if (!generation || disposed || requestedRevision !== revision) return snapshot();
          await publish(generation.result, `generation:${generation.key}`);
          if (!disposed && requestedRevision === revision) status = 'watching';
          return snapshot();
        }
        const parsed = sourceFrontend.parse(descriptor.text, {sourceId: manifest.sourceId});
        if (
          !isRecord(parsed) ||
          typeof parsed.ok !== 'boolean' ||
          !Array.isArray(parsed.diagnostics)
        ) {
          throw new TypeError('sourceFrontend returned an invalid result');
        }
        const result = deepFreeze({...parsed, sourceSnapshot: descriptor});
        await publish(result, `source:${descriptor.integrity}`);
        if (!disposed && requestedRevision === revision) status = 'watching';
        return snapshot();
      } catch (error) {
        if (failedCreations.retain(error))
          throw new AggregateError(
            [error],
            'Preview source loader failed before returning its owner',
            {cause: error},
          );
        const code = errorCode(error);
        const transient = new Set([
          'K4-SOURCE-MISSING',
          'K4-PREVIEW-SOURCE-UNSTABLE',
          'K4-ASSET-MISSING',
          'K4-ASSET-UNSTABLE-001',
        ]);
        if (!transient.has(code)) {
          if (
            !code.startsWith('K4-SOURCE-') &&
            !code.startsWith('K4-INCLUDE-') &&
            !code.startsWith('K4-DECLARATION-') &&
            !code.startsWith('K4-ASSET-')
          ) {
            throw error;
          }
          const result = sourceFailure(code, 'error', manifest.sourceId);
          await publish(result, `diagnostic:${code}`);
          if (!disposed && requestedRevision === revision) status = 'watching';
          return snapshot();
        }
        lastTransientCode = code;
      }

      const elapsed = Number(clock.now()) - startedAt;
      if (elapsed >= timeout || attempts >= maximumAttempts) {
        const code = lastTransientCode.endsWith('-MISSING')
          ? lastTransientCode
          : 'K4-PREVIEW-SOURCE-UNSTABLE';
        const severity = code.endsWith('-MISSING') ? 'error' : 'warning';
        await publish(sourceFailure(code, severity, manifest.sourceId), `diagnostic:${code}`);
        if (!disposed && requestedRevision === revision) status = 'watching';
        return snapshot();
      }
      await clock.sleep(Math.min(retry, timeout - elapsed));
    }
    return snapshot();
  }

  function enqueueStabilize(requestedRevision: number) {
    return enqueue(() => stabilize(requestedRevision));
  }

  function notifyChange() {
    if (!started || disposed) throw new TypeError('preview source watcher is not active');
    revision += 1;
    status = 'waiting';
    if (quietTimer !== null) clock.clearTimeout(quietTimer);
    const requestedRevision = revision;
    quietTimer = clock.setTimeout(() => {
      if (disposed) return;
      quietTimer = null;
      void enqueueStabilize(requestedRevision);
    }, quiet);
    return snapshot();
  }

  function start() {
    if (started || disposed) throw new TypeError('preview source watcher can only start once');
    try {
      const watcher = watchFactory(
        // The whole project is watched because an entry may start naming other sources at any time.
        // While it names none, only the entry itself is a reason to read it again.
        path.resolve(projectRoot),
        (eventType, filename) => {
          if (disposed) return;
          const changedName = filename === null ? null : String(filename);
          if (composed || changedName === null || changedName === sourceBasename) notifyChange();
        },
        {recursive: true},
      );
      if (isRecord(watcher) && typeof watcher.close === 'function')
        fileWatcher = watcher as Dsl4FileWatcher;
      if (
        !isRecord(watcher) ||
        typeof watcher.close !== 'function' ||
        typeof watcher.on !== 'function'
      ) {
        void dispose().catch(reportInternalError);
        throw new TypeError('watchFactory must return close and on methods');
      }
      fileWatcher = watcher;
      fileWatcher.on('error', (error: unknown) => reportInternalError(error));
      started = true;
      status = 'watching';
      revision += 1;
      return enqueueStabilize(revision);
    } catch (error) {
      if (failedCreations.retain(error)) {
        // No new watcher may overwrite a returned partial watcher while cleanup is pending.
        disposed = true;
        status = 'disposed';
        revision++;
        observers.close();
        throw new AggregateError(
          [error],
          'Preview watch factory failed before returning its owner',
          {cause: error},
        );
      }
      void dispose().catch(reportInternalError);
      throw error;
    }
  }

  const cleanup = createDsl4RetryableCleanup({
    message: 'Preview source watcher cleanup failed',
    parallel: true,
    steps: [
      () => {
        if (quietTimer === null) return;
        clock.clearTimeout(quietTimer);
        quietTimer = null;
      },
      async () => {
        await fileWatcher?.close();
        fileWatcher = null;
      },
      async () => {
        await operationQueue;
      },
    ],
  });
  let disposal: Promise<ReturnType<typeof snapshot>> | null = null;
  function dispose() {
    if (disposal) return disposal;
    if (!disposed) revision += 1;
    disposed = true;
    status = 'disposed';
    failedCreations.beginDispose();
    const operation = Promise.resolve()
      .then(async () => {
        const results = await Promise.allSettled([cleanup.run()]);
        results.push(...(await Promise.allSettled([failedCreations.drain()])));
        const errors = results.flatMap((result) =>
          result.status === 'rejected' ? [result.reason] : [],
        );
        if (errors.length) throw new AggregateError(errors, 'Preview watcher cleanup failed');
      })
      .then(snapshot);
    disposal = operation;
    observers.close();
    const settled = () => {
      failedCreations.endDispose();
      disposal = null;
    };
    void operation.then(settled, settled);
    return operation;
  }

  return Object.freeze({
    start,
    notifyChange,
    dispose,
    getState: snapshot,
    hasPendingCleanup: () => cleanup.hasPendingCleanup() || failedCreations.hasPendingCleanup(),
    whenIdle() {
      return operationQueue.then(snapshot);
    },
  });
}
