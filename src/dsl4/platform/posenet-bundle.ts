import {
  createBundledTMRuntime,
  createPoseNetProjectBundle,
  createPoseNetProjectBundleFromLoader,
  loadPoseNetProjectBundle,
  poseNetBundleManifest,
  poseNetModelDefaults,
  validatePoseNetProjectBundle,
  verifyPoseNetBundle,
} from '@kubohiroya/turbowarp-teachable-machine/posenet';

import {createDsl4PoseNetRemoteLoader, isDsl4PoseNetRemoteDescriptor} from './posenet-remote.js';

export const dsl4PoseNetBundleStoragePaths = Object.freeze({
  bundled: 'extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4.poseNet',
  unbundled: 'extensionStorage.kubohiroyakamishibairuntime4.poseNet',
});

export const createDsl4BundledTMRuntime = createBundledTMRuntime;
export const createDsl4PoseNetProjectBundle = createPoseNetProjectBundle;
export const createDsl4PoseNetProjectBundleFromLoader = createPoseNetProjectBundleFromLoader;
export const dsl4PoseNetBundleManifest = poseNetBundleManifest;
export const dsl4PoseNetModelDefaults = poseNetModelDefaults;
export const loadDsl4PoseNetProjectBundleData = loadPoseNetProjectBundle;
export const validateDsl4PoseNetProjectBundle = validatePoseNetProjectBundle;
export const verifyDsl4PoseNetBundle = verifyPoseNetBundle;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function storageError(code: string, message: string) {
  const error = new Error(message);
  Object.defineProperty(error, 'code', {value: code});
  return error;
}

function storedProjectBundles(project: unknown) {
  if (!isRecord(project)) return [];
  const extensionStorage = isRecord(project.extensionStorage) ? project.extensionStorage : {};
  const unbundled = isRecord(extensionStorage.kubohiroyakamishibairuntime4)
    ? extensionStorage.kubohiroyakamishibairuntime4
    : {};
  const bundled = isRecord(extensionStorage.kubohiroyakamishibai4)
    ? extensionStorage.kubohiroyakamishibai4
    : {};
  const components = isRecord(bundled.components) ? bundled.components : {};
  const bundledRuntime = isRecord(components.kubohiroyakamishibairuntime4)
    ? components.kubohiroyakamishibairuntime4
    : {};
  return [unbundled.poseNet, bundledRuntime.poseNet].filter((value) => value !== undefined);
}

/**
 * Locate the one explicit PoseNet model-data descriptor stored in an SB3 project.
 * Teachable Machine owns descriptor decoding, integrity verification, and runtime fetch interception.
 */
export function loadDsl4PoseNetProjectBundle(project: unknown) {
  const bundles = storedProjectBundles(project);
  if (bundles.length === 0) {
    throw storageError('K4-POSENET-ASSET-002', 'PoseNet project bundle is missing');
  }
  if (bundles.length !== 1) {
    throw storageError(
      'K4-POSENET-ASSET-001',
      'PoseNet project bundle exists in both storage channels',
    );
  }
  return bundles[0];
}

/**
 * Delay both SB3 storage lookup and PoseNet model-data decoding until pose recognition starts.
 *
 * Embedded (base64) model data is decoded by Teachable Machine. Remote model data is downloaded from
 * the Kamishibai site, shared through Cache Storage, and verified against the same pinned manifest.
 */
export function createDsl4ProjectTMRuntime(options: {
  runtime: unknown;
  project: unknown;
  globalObject?: Record<PropertyKey, unknown>;
  subtleCrypto?: Pick<SubtleCrypto, 'digest'> | undefined;
}) {
  if (!isRecord(options) || !isRecord(options.runtime)) {
    throw new TypeError('DSL 4.0 project Teachable Machine runtime options are required');
  }
  const runtime = options.runtime;
  if (typeof runtime.Webcam !== 'function' || typeof runtime.loadFromFiles !== 'function') {
    throw new TypeError(
      'DSL 4.0 project Teachable Machine runtime must provide Webcam and loadFromFiles',
    );
  }
  const host = (options.globalObject ?? globalThis) as Record<PropertyKey, unknown>;
  // Teachable Machine swaps the host's fetch for a PoseNet-only interceptor while it loads, and the
  // remote supply first runs inside that window, so keep the real fetch from before any load.
  const hostFetch =
    typeof host.fetch === 'function'
      ? (host.fetch as (...arguments_: unknown[]) => Promise<Response>).bind(host)
      : undefined;
  const subtleCrypto =
    options.subtleCrypto ??
    (host.crypto as {subtle?: Pick<SubtleCrypto, 'digest'>} | undefined)?.subtle;
  type Runtime = ReturnType<typeof createBundledTMRuntime>;
  type RuntimeOptions = Parameters<typeof createBundledTMRuntime>[0];
  let bundledRuntime: Runtime | undefined;
  let remote = false;
  const loadRuntime = () => {
    if (bundledRuntime) return bundledRuntime;
    const descriptor = loadDsl4PoseNetProjectBundle(options.project);
    remote = isDsl4PoseNetRemoteDescriptor(descriptor);
    // The pinned `@kubohiroya/turbowarp-teachable-machine` package names these inputs with its own runtime,
    // global, and bundle types; this module validated the runtime above and holds the rest as
    // opaque values it only forwards.
    const supply: Partial<RuntimeOptions> = remote
      ? {
          loadFiles: createDsl4PoseNetRemoteLoader({
            descriptor,
            fetch: hostFetch,
            caches: host.caches as CacheStorage | undefined,
            subtleCrypto,
          }) as unknown as NonNullable<RuntimeOptions['loadFiles']>,
        }
      : {projectBundle: descriptor as unknown as NonNullable<RuntimeOptions['projectBundle']>};
    bundledRuntime = createBundledTMRuntime({
      runtime: runtime as unknown as RuntimeOptions['runtime'],
      globalObject: options.globalObject as unknown as NonNullable<RuntimeOptions['globalObject']>,
      ...supply,
      // The pinned runtime declares `subtleCrypto` optional but not nullable, so an absent digest
      // implementation is expressed by leaving the property out.
      ...(options.subtleCrypto === undefined ? {} : {subtleCrypto: options.subtleCrypto}),
    } as RuntimeOptions);
    return bundledRuntime;
  };
  return Object.freeze({
    Webcam: runtime.Webcam,
    async loadFromFiles(model: unknown, weights: unknown, metadata: unknown) {
      const loaded = loadRuntime();
      try {
        return await loaded.loadFromFiles(model, weights, metadata);
      } catch (error) {
        // Teachable Machine keeps a failed supply for the life of its runtime. A download can fail
        // for a moment (offline, captive portal), so a remote runtime starts over on the next load.
        if (remote && bundledRuntime === loaded) bundledRuntime = undefined;
        throw error;
      }
    },
    poseNetManifest: poseNetBundleManifest,
  });
}
