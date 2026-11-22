import {readFile} from 'node:fs/promises';

import {createDsl4PoseNetProjectBundleFromLoader} from '../dsl4/platform/posenet-bundle.js';
import type {Dsl4SubtleCrypto} from '../dsl4/subtle-crypto.js';
import {
  createDsl4TMOfflineRuntime,
  type Dsl4TMOfflineRuntime,
} from '../dsl4/platform/tm-runtime-owner.js';

const playbackRuntimeUrl = new URL(
  './generated/dsl4-playback-runtime-extension.js',
  import.meta.url,
);
let pendingSource;
let pendingPoseNetProjectBundle;

/** Read the generated playback-only extension shipped with the builder package. */
export function readDsl4PlaybackRuntimeExtensionSource() {
  pendingSource ??= readFile(playbackRuntimeUrl, 'utf8');
  return pendingSource;
}

/**
 * Read and verify the fixed PoseNet model data installed beside the playback runtime.
 *
 */
export function readDsl4PlaybackPoseNetBundle({
  subtleCrypto = globalThis.crypto?.subtle,
}: {subtleCrypto?: Dsl4SubtleCrypto | undefined} = {}) {
  pendingPoseNetProjectBundle ??= createDsl4PoseNetProjectBundleFromLoader(
    async ({packageSpecifier}) =>
      new Uint8Array(await readFile(new URL(import.meta.resolve(packageSpecifier)))),
    subtleCrypto === undefined ? {} : {subtleCrypto: subtleCrypto as Pick<SubtleCrypto, 'digest'>},
  );
  return pendingPoseNetProjectBundle;
}

const tmOfflineRuntimeUrl = new URL(
  './generated/dsl4-teachable-machine-offline-runtime.json',
  import.meta.url,
);
let pendingTMOfflineRuntime: Promise<Dsl4TMOfflineRuntime> | undefined;

/**
 * Read the whole Teachable Machine runtime shipped beside the playback runtime, for a work built
 * for a network-free venue. Other works load the same runtime from the Kamishibai site.
 */
export function readDsl4PlaybackTMOfflineRuntime({
  subtleCrypto = globalThis.crypto?.subtle,
}: {subtleCrypto?: Dsl4SubtleCrypto | undefined} = {}) {
  pendingTMOfflineRuntime ??= readFile(tmOfflineRuntimeUrl, 'utf8').then((text) => {
    const generated = JSON.parse(text) as {
      formatVersion?: unknown;
      version?: unknown;
      source?: unknown;
    };
    if (
      generated.formatVersion !== 1 ||
      typeof generated.version !== 'string' ||
      typeof generated.source !== 'string'
    ) {
      throw new TypeError('The generated Teachable Machine offline runtime is malformed');
    }
    return createDsl4TMOfflineRuntime(
      generated.source,
      generated.version,
      subtleCrypto as Pick<SubtleCrypto, 'digest'> | undefined,
    );
  });
  return pendingTMOfflineRuntime;
}

const narrativeSources = new Map<string, Promise<string>>();
/** Read a Standard narrative-capable runtime for the requested profile. */
export function readDsl4NarrativeRuntimeExtensionSource(
  profile: 'authoring' | 'playback' = 'playback',
) {
  if (profile !== 'authoring' && profile !== 'playback')
    throw new TypeError('Unknown narrative runtime profile');
  if (!narrativeSources.has(profile))
    narrativeSources.set(
      profile,
      readFile(
        new URL(`./generated/dsl4-narrative-${profile}-runtime-extension.js`, import.meta.url),
        'utf8',
      ),
    );
  return narrativeSources.get(profile)!;
}
