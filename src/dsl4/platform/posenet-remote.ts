/**
 * PoseNet model data fetched from the Kamishibai site instead of embedded in project.json.
 *
 * The three PoseNet files are the same for every work and are pinned, with their SHA-256 digests,
 * by the Teachable Machine package's `poseNetBundleManifest`. The site publishes each file at a
 * content-addressed path (`posenet/sha256-<hex>`), so one URL always names the same bytes. Every
 * work that uses the same model therefore shares one Cache Storage entry, and a work never has to
 * carry the 6.8 MB base64 copy that an offline build still embeds.
 *
 * The descriptor only says where to fetch from. The files it may name are fixed by the manifest the
 * runtime was built with, and every byte is verified against that manifest before it is used.
 */
import {poseNetBundleManifest} from '@kubohiroya/turbowarp-teachable-machine/posenet';

export const dsl4PoseNetRemoteBaseUrl =
  'https://kubohiroya.github.io/turbowarp-kamishibai-app/posenet/';
export const dsl4PoseNetRemoteCacheName = 'kamishibai-posenet-v1';

export type Dsl4PoseNetRemoteFile = Readonly<{
  path: string;
  mediaType: string;
  size: number;
  sha256: string;
}>;

export type Dsl4PoseNetRemoteDescriptor = Readonly<{
  formatVersion: 1;
  encoding: 'remote';
  baseUrl: string;
  files: ReadonlyArray<Dsl4PoseNetRemoteFile>;
}>;

type Digest = Pick<SubtleCrypto, 'digest'>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type CacheLike = Pick<Cache, 'match' | 'put' | 'delete'>;
type CacheStorageLike = Pick<CacheStorage, 'open'>;

const descriptorKeys = new Set(['formatVersion', 'encoding', 'baseUrl', 'files']);
const fileKeys = new Set(['path', 'mediaType', 'size', 'sha256']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function remoteError(code: string, message: string, cause?: unknown) {
  const error = new Error(message, cause === undefined ? undefined : {cause});
  Object.defineProperty(error, 'code', {value: code});
  return error;
}

/** The site path of one PoseNet file: its SHA-256 digest, so equal bytes share one URL. */
export function dsl4PoseNetRemoteFilename(sha256: string) {
  if (!/^[0-9a-f]{64}$/u.test(sha256)) throw new TypeError('PoseNet sha256 must be 64 hex digits');
  return `sha256-${sha256}`;
}

function manifestFiles(): Dsl4PoseNetRemoteFile[] {
  return poseNetBundleManifest.files.map(({path, mediaType, size, sha256}) =>
    Object.freeze({path, mediaType, size, sha256}),
  );
}

function validateBaseUrl(value: unknown) {
  if (typeof value !== 'string' || !value.endsWith('/')) {
    throw remoteError('K4-POSENET-REMOTE-001', 'PoseNet baseUrl must be a URL ending in /');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw remoteError('K4-POSENET-REMOTE-001', 'PoseNet baseUrl must be an absolute URL', error);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw remoteError(
      'K4-POSENET-REMOTE-001',
      'PoseNet baseUrl must be a plain https URL without credentials, query, or fragment',
    );
  }
  return url.href;
}

/** Describe the PoseNet files the runtime fetches from `baseUrl`, as pinned by the TM manifest. */
export function createDsl4PoseNetRemoteDescriptor({
  baseUrl = dsl4PoseNetRemoteBaseUrl,
}: {baseUrl?: string} = {}): Dsl4PoseNetRemoteDescriptor {
  return Object.freeze({
    formatVersion: 1,
    encoding: 'remote',
    baseUrl: validateBaseUrl(baseUrl),
    files: Object.freeze(manifestFiles()),
  });
}

/** Whether a stored PoseNet descriptor asks for remote model data (as opposed to embedded base64). */
export function isDsl4PoseNetRemoteDescriptor(value: unknown) {
  return isRecord(value) && value.encoding === 'remote';
}

/**
 * Accept a remote descriptor only when it names exactly the files the pinned manifest names. A
 * project built against another PoseNet model is rejected rather than fetched and then failing the
 * digest check file by file.
 */
export function validateDsl4PoseNetRemoteDescriptor(value: unknown): Dsl4PoseNetRemoteDescriptor {
  if (!isRecord(value) || Object.keys(value).some((key) => !descriptorKeys.has(key))) {
    throw remoteError('K4-POSENET-REMOTE-001', 'PoseNet remote descriptor has unexpected fields');
  }
  if (value.formatVersion !== 1 || value.encoding !== 'remote') {
    throw remoteError('K4-POSENET-REMOTE-001', 'PoseNet remote descriptor format is unsupported');
  }
  const baseUrl = validateBaseUrl(value.baseUrl);
  const expected = manifestFiles();
  const files = value.files;
  if (!Array.isArray(files) || files.length !== expected.length) {
    throw remoteError(
      'K4-POSENET-REMOTE-001',
      'PoseNet remote descriptor must name the pinned PoseNet files',
    );
  }
  files.forEach((file: unknown, index) => {
    const pinned = expected[index]!;
    if (
      !isRecord(file) ||
      Object.keys(file).some((key) => !fileKeys.has(key)) ||
      file.path !== pinned.path ||
      file.mediaType !== pinned.mediaType ||
      file.size !== pinned.size ||
      file.sha256 !== pinned.sha256
    ) {
      throw remoteError(
        'K4-POSENET-REMOTE-001',
        `PoseNet remote file ${index} does not match the pinned PoseNet model`,
      );
    }
  });
  return Object.freeze({
    formatVersion: 1,
    encoding: 'remote',
    baseUrl,
    files: Object.freeze(expected),
  });
}

async function sha256Hex(subtleCrypto: Digest, bytes: Uint8Array<ArrayBuffer>) {
  const digest = new Uint8Array(await subtleCrypto.digest('SHA-256', bytes));
  return [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function matches(
  subtleCrypto: Digest,
  file: Dsl4PoseNetRemoteFile,
  bytes: Uint8Array<ArrayBuffer>,
) {
  return bytes.byteLength === file.size && (await sha256Hex(subtleCrypto, bytes)) === file.sha256;
}

async function openCache(caches: CacheStorageLike | undefined) {
  if (!caches || typeof caches.open !== 'function') return null;
  try {
    return (await caches.open(dsl4PoseNetRemoteCacheName)) as CacheLike;
  } catch {
    // Cache Storage refuses opaque origins and some embedded contexts; fetching still works.
    return null;
  }
}

async function readCached(cache: CacheLike | null, url: string) {
  if (!cache) return null;
  try {
    const response = await cache.match(url);
    return response ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/**
 * Build a `loadFiles` supply for Teachable Machine's `createBundledTMRuntime`.
 *
 * `fetch` must be the browser's own fetch captured before Teachable Machine starts a load: while a
 * load runs, Teachable Machine replaces `globalThis.fetch` with an interceptor that only answers
 * PoseNet's own URLs, and this supply is first called inside that window.
 */
export function createDsl4PoseNetRemoteLoader({
  descriptor,
  fetch,
  caches,
  subtleCrypto,
}: {
  descriptor: unknown;
  fetch: FetchLike | undefined;
  caches?: CacheStorageLike | undefined;
  subtleCrypto: Digest | undefined;
}) {
  const remote = validateDsl4PoseNetRemoteDescriptor(descriptor);
  if (typeof fetch !== 'function') {
    throw remoteError('K4-POSENET-REMOTE-002', 'PoseNet model data needs fetch to download');
  }
  if (!subtleCrypto || typeof subtleCrypto.digest !== 'function') {
    throw remoteError('K4-POSENET-REMOTE-003', 'PoseNet model data needs SHA-256 to verify');
  }
  const download = fetch;
  const digest = subtleCrypto;
  return async function loadDsl4RemotePoseNetFiles() {
    const cache = await openCache(caches);
    return Promise.all(
      remote.files.map(async (file) => {
        const url = new URL(dsl4PoseNetRemoteFilename(file.sha256), remote.baseUrl).href;
        const cached = await readCached(cache, url);
        if (cached && (await matches(digest, file, cached))) {
          return Object.freeze({path: file.path, mediaType: file.mediaType, bytes: cached});
        }
        if (cached && cache) await cache.delete(url).catch(() => false);
        let response: Response;
        try {
          response = await download(url, {credentials: 'omit', mode: 'cors'});
        } catch (error) {
          throw remoteError(
            'K4-POSENET-REMOTE-002',
            `PoseNet model data could not be downloaded from ${url}`,
            error,
          );
        }
        if (!response.ok) {
          throw remoteError(
            'K4-POSENET-REMOTE-002',
            `PoseNet model data download failed with HTTP ${response.status}: ${url}`,
          );
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!(await matches(digest, file, bytes))) {
          throw remoteError(
            'K4-POSENET-REMOTE-003',
            `PoseNet model data from ${url} does not match its pinned digest`,
          );
        }
        if (cache) {
          await cache
            .put(url, new Response(bytes, {headers: {'content-type': file.mediaType}}))
            .catch(() => undefined);
        }
        return Object.freeze({path: file.path, mediaType: file.mediaType, bytes});
      }),
    );
  };
}
