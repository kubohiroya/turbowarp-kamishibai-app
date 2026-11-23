import type {Dsl4SubtleCrypto} from '../subtle-crypto.js';

/**
 * Where the playback runtime of this release is published on the Kamishibai site.
 *
 * The editor runs the authoring runtime, which carries the editing tools. A work built in the editor
 * is for its audience, so the build replaces that runtime with the playback runtime of the same
 * release. The authoring runtime records the playback runtime's digest when it is built, so the
 * fetched bytes are exactly the ones the release produced.
 */
export type Dsl4PlaybackRuntimeSite = Readonly<{
  version: string;
  url: string;
  sha256: string;
  size: number;
}>;

export class Dsl4PlaybackRuntimeError extends Error {
  code = 'K4-PLAYBACK-RUNTIME-001';

  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : {cause});
    this.name = 'Dsl4PlaybackRuntimeError';
  }
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function requireSite(site: unknown): Dsl4PlaybackRuntimeSite {
  const value = site as Partial<Dsl4PlaybackRuntimeSite> | null;
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof value.version !== 'string' ||
    typeof value.url !== 'string' ||
    !/^https:\/\//u.test(value.url) ||
    typeof value.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value.sha256) ||
    !Number.isSafeInteger(value.size) ||
    (value.size as number) < 1
  ) {
    throw new TypeError('playback runtime site must name an https URL, a SHA-256 and a size');
  }
  return value as Dsl4PlaybackRuntimeSite;
}

/**
 * Fetch the playback runtime from the site and return its source once its size and SHA-256 match
 * the recorded ones. Any other outcome throws `K4-PLAYBACK-RUNTIME-001`.
 */
export async function fetchDsl4PlaybackRuntime(
  site: Dsl4PlaybackRuntimeSite,
  {
    fetch: fetchImpl,
    subtleCrypto,
  }: {fetch: typeof globalThis.fetch | undefined; subtleCrypto: Dsl4SubtleCrypto | undefined},
): Promise<string> {
  const {url, sha256, size, version} = requireSite(site);
  if (typeof fetchImpl !== 'function' || typeof subtleCrypto?.digest !== 'function') {
    throw new Dsl4PlaybackRuntimeError('This browser cannot fetch and verify the playback runtime');
  }
  let bytes: ArrayBuffer;
  try {
    const response = await fetchImpl(url, {credentials: 'omit'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bytes = await response.arrayBuffer();
  } catch (error) {
    throw new Dsl4PlaybackRuntimeError(
      `The playback runtime ${version} could not be loaded`,
      error,
    );
  }
  if (bytes.byteLength !== size) {
    throw new Dsl4PlaybackRuntimeError(`The playback runtime ${version} has an unexpected size`);
  }
  if (hex(await subtleCrypto.digest('SHA-256', bytes)) !== sha256) {
    throw new Dsl4PlaybackRuntimeError(`The playback runtime ${version} has an unexpected digest`);
  }
  return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
}
