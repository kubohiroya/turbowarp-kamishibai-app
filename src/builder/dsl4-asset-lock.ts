import {lstat, open, readFile, readdir, realpath} from 'node:fs/promises';
import path from 'node:path';

import {
  createDsl4PoseArchiveExtractor,
  isDsl4PoseArchivePath,
} from '../dsl4/platform/pose-archive-extractor.js';
import {deepFreeze} from '../dsl4/story-document.js';
import {
  serializeDsl4AssetDistributionLock,
  validateDsl4AssetDistributionConfig,
  validateDsl4AssetDistributionLock,
} from '../dsl4/asset-distribution-profile.js';
import {createDsl4SourceGraphFrontend} from '../dsl4/source-graph-frontend.js';
import {loadDsl4ExternalSource} from './dsl4-external-source.js';
import {resolveDsl4ProjectSource} from './dsl4-project-source.js';
import {loadDsl4BuildSourceGraph} from './dsl4-source-graph.js';
import {resolveDsl4BuildSourceLimits, resolveDsl4EntrySourceGraph} from './dsl4-source-limits.js';
import {loadDsl4ProjectJson} from './dsl4-asset-audit.js';
import {installBundleTransactionally} from './atomic-output.js';
import {Sb3BuilderError} from './errors.js';
import type {Dsl4FileSystem} from './file-system.js';
import type {Dsl4SourceFrontend} from '../dsl4/source-frontend.js';
import type {Dsl4SubtleCrypto} from '../dsl4/subtle-crypto.js';
import {sha256} from './hash.js';
import {contentTypeFor} from './dsl4-asset-media.js';

const defaultFileSystem = Object.freeze({lstat, open, readdir, realpath});
const poseModelContentType = 'application/vnd.tm.pose-model';
const defaultMaxCompressionRatio = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface Dsl4AssetLockFetchOptions {
  readonly allowedHosts: readonly string[];
  readonly fetchImplementation: (
    url: URL,
    init: {redirect: 'manual'; signal: AbortSignal},
  ) => Promise<Response>;
  readonly timeoutMs: number;
  readonly maxRedirects: number;
  readonly maxBytes: number;
}

interface Dsl4AssetLockStoryAsset {
  readonly id: string;
  readonly kind: string;
  readonly delivery?: unknown;
  readonly file?: unknown;
  readonly name?: string;
  readonly source?: {readonly url?: string};
}

type Dsl4AssetLockEmbeddedProvider =
  {readonly file: string; readonly name?: never} | {readonly name: string; readonly file?: never};

interface Dsl4AssetLockRemoteProvider {
  readonly url: string;
}

interface Dsl4AssetLockProviderSet {
  readonly embedded?: Dsl4AssetLockEmbeddedProvider;
  readonly remote?: Dsl4AssetLockRemoteProvider;
}

interface Dsl4AssetLockConfig {
  readonly providers: Readonly<Record<string, Dsl4AssetLockProviderSet>>;
  readonly profiles: Readonly<
    Record<string, {readonly assets?: Readonly<Record<string, unknown>>}>
  >;
}

interface Dsl4AssetLockParseResult {
  readonly ok?: unknown;
  readonly diagnostics?: readonly {readonly message?: unknown; readonly code?: unknown}[];
  readonly storyDocument?: {
    readonly assets?: Readonly<Record<string, Dsl4AssetLockStoryAsset>>;
  };
}

interface Dsl4PoseArchiveFile {
  readonly path: string;
  readonly size: number;
  readonly bytes: Uint8Array;
}

interface Dsl4PoseArchiveExtraction {
  readonly files: readonly Dsl4PoseArchiveFile[];
}

interface Dsl4AssetLockProviderOptions extends Dsl4AssetLockFetchOptions {
  readonly projectRoot: string;
  readonly canonicalRoot: string;
  readonly fileSystem: Dsl4FileSystem;
  readonly maxFileBytes: number;
  readonly maxFiles: number;
  readonly maxTotalBytes: number;
  fileCount: number;
  totalBytes: number;
  readonly poseArchiveExtractor: (
    payload: unknown,
    context?: Readonly<Record<string, unknown>>,
  ) => Promise<Dsl4PoseArchiveExtraction>;
}

interface Dsl4AssetDistributionLockOptions {
  readonly projectRoot?: string;
  readonly sourceFrontend?: Dsl4SourceFrontend;
  readonly sourceIncludesEnabled?: unknown;
  readonly maxSourceBytes?: unknown;
  readonly maxTotalSourceBytes?: unknown;
  readonly maxSourceManifestBytes?: unknown;
  readonly maxAssetConfigBytes?: unknown;
  readonly maxAssetFileBytes?: unknown;
  readonly maxAssetFiles?: unknown;
  readonly maxTotalAssetBytes?: unknown;
  readonly timeoutMs?: unknown;
  readonly maxRedirects?: unknown;
  readonly allowedHosts?: unknown;
  readonly fetchImplementation?: unknown;
  readonly fileSystem?: unknown;
  readonly sourceManifest?: string;
  readonly source?: string;
  readonly sourceId?: string;
  readonly assetConfig?: string;
  readonly readFile?: (filePath: string, limit: number) => Promise<Uint8Array | Buffer>;
  readonly maxSourceFiles?: unknown;
  readonly maxIncludeDepth?: unknown;
  readonly subtleCrypto?: Dsl4SubtleCrypto;
  readonly output?: string;
}

interface Dsl4FileState {
  readonly dev: unknown;
  readonly ino: unknown;
  readonly size: unknown;
  readonly mtimeMs: unknown;
  readonly ctimeMs: unknown;
}

function fail(message: string, code: string, cause?: unknown): never {
  throw new Sb3BuilderError(message, {stage: 'dsl4-asset-lock', code, cause});
}

function positiveLimit(value: unknown, name: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return Number(value);
}

function nonNegativeLimit(value: unknown, name: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  return Number(value);
}

function validateFileSystem(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.realpath !== 'function' ||
    typeof value.lstat !== 'function' ||
    typeof value.open !== 'function' ||
    typeof value.readdir !== 'function'
  ) {
    throw new TypeError('fileSystem must provide realpath, lstat, open, and readdir');
  }
  return value as unknown as Dsl4FileSystem;
}

function isWithin(ancestor: string, candidate: string) {
  const relative = path.relative(ancestor, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function canonicalHost(value: string, name: string) {
  if (typeof value !== 'string' || value.length === 0 || /[\u0000-\u0020/\\#?@]/u.test(value)) {
    throw new TypeError(`${name} must be a hostname without path or credentials`);
  }
  let parsed;
  try {
    parsed = new URL(`https://${value}`);
  } catch {
    throw new TypeError(`${name} must be a valid hostname`);
  }
  if (
    parsed.hostname !== value.toLowerCase() ||
    parsed.port ||
    parsed.username ||
    parsed.password
  ) {
    throw new TypeError(`${name} must be a canonical hostname without a port`);
  }
  return parsed.hostname;
}

function normalizeAllowedHosts(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('allowedHosts must contain at least one hostname');
  }
  return [...new Set(value.map((host) => canonicalHost(host, 'allowedHosts entry')))].sort();
}

function httpsUrl(value: string, name: string) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${name} must be an absolute HTTPS URL`, 'K4-ASSET-REMOTE-001');
  }
  if (
    parsed.protocol !== 'https:' ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    fail(
      `${name} must be an absolute HTTPS URL without credentials or fragment`,
      'K4-ASSET-REMOTE-001',
    );
  }
  return parsed;
}

function normalizeContentType(contentType: string) {
  return (contentType.split(';', 1)[0] ?? '').trim().toLowerCase();
}

function assertAllowedHost(host: string, allowedHosts: ReadonlyArray<string>) {
  if (!allowedHosts.includes(host.toLowerCase())) {
    fail(`Remote host is not allowlisted: ${host.toLowerCase()}`, 'K4-ASSET-REMOTE-HOST-001');
  }
}

async function readResponseBody(response: Response, maximumBytes: number) {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      fail('Remote response Content-Length is invalid', 'K4-ASSET-REMOTE-RESPONSE-001');
    }
    if (parsedLength > maximumBytes) {
      fail('Remote response exceeds the finite byte limit', 'K4-ASSET-REMOTE-SIZE-001');
    }
  }
  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maximumBytes) {
      fail('Remote response exceeds the finite byte limit', 'K4-ASSET-REMOTE-SIZE-001');
    }
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (!Number.isSafeInteger(size) || size > maximumBytes) {
        await reader.cancel('remote asset size limit exceeded');
        fail('Remote response exceeds the finite byte limit', 'K4-ASSET-REMOTE-SIZE-001');
      }
      chunks.push(Buffer.from(result.value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

/** Fetch one remote provider with host, redirect, timeout, and streaming limits. */
// Node's fetch reports a failed TLS handshake as `TypeError: fetch failed` with the OpenSSL or
// Node TLS code on a `cause`, so the certificate is named only by walking that chain.
const tlsCertificateErrorCodes = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'CERT_REVOKED',
  'CERT_UNTRUSTED',
  'CERT_REJECTED',
  'CERT_SIGNATURE_FAILURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'HOSTNAME_MISMATCH',
]);

function tlsCertificateErrorCode(error: unknown) {
  const seen = new Set<unknown>();
  for (let current = error; typeof current === 'object' && current !== null;) {
    if (seen.has(current) || seen.size >= 8) break;
    seen.add(current);
    const {code, cause} = current as {code?: unknown; cause?: unknown};
    if (typeof code === 'string' && tlsCertificateErrorCodes.has(code)) return code;
    current = cause;
  }
  return null;
}

export async function fetchDsl4AssetRemote(inputUrl: string, options: Dsl4AssetLockFetchOptions) {
  let currentUrl = httpsUrl(inputUrl, 'remote provider URL');
  for (let redirects = 0; ; redirects += 1) {
    assertAllowedHost(currentUrl.hostname, options.allowedHosts);
    let response;
    try {
      response = await options.fetchImplementation(currentUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      const certificateCode = tlsCertificateErrorCode(error);
      if (certificateCode) {
        fail(
          `Remote provider TLS certificate is not valid (${certificateCode}): ${currentUrl.href}. ` +
            'The server certificate is expired, self-signed, issued for another host, or not trusted; ' +
            'renew or fix the certificate on the server, or move the asset to a host with a valid one.',
          'K4-ASSET-REMOTE-TLS-001',
          error,
        );
      }
      fail(
        `Remote provider request failed: ${currentUrl.href}`,
        'K4-ASSET-REMOTE-REQUEST-001',
        error,
      );
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      if (redirects >= options.maxRedirects) {
        fail('Remote provider redirect limit exceeded', 'K4-ASSET-REMOTE-REDIRECT-001');
      }
      const location = response.headers.get('location');
      if (!location)
        fail('Remote provider redirect has no Location', 'K4-ASSET-REMOTE-REDIRECT-001');
      const redirected = new URL(location, currentUrl);
      if (redirected.protocol !== 'https:') {
        fail('Remote provider redirect must remain HTTPS', 'K4-ASSET-REMOTE-REDIRECT-001');
      }
      currentUrl = redirected;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      fail('Remote provider returned an unsuccessful response', 'K4-ASSET-REMOTE-REQUEST-001');
    }
    const bytes = await readResponseBody(response, options.maxBytes);
    const contentType = normalizeContentType(response.headers.get('content-type') ?? '');
    if (!contentType)
      fail('Remote provider response has no Content-Type', 'K4-ASSET-REMOTE-TYPE-001');
    return {bytes, contentType, finalUrl: currentUrl.href};
  }
}

function safeRelativePath(filePath: string, name: string) {
  if (
    typeof filePath !== 'string' ||
    filePath.length === 0 ||
    filePath.includes('\\') ||
    filePath.startsWith('/') ||
    /^[A-Za-z]:/u.test(filePath) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(filePath) ||
    filePath
      .split('/')
      .some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw new TypeError(`${name} must be a canonical project-relative POSIX path`);
  }
  return filePath;
}

function localContentType(bytes: Buffer, filePath: string, kind: string) {
  if (kind === 'recognitionModel') return poseModelContentType;
  if (kind === 'backdrop' || kind === 'costume' || kind === 'image') {
    if (
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return 'image/png';
    }
    if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
    if (
      bytes.subarray(0, 6).toString() === 'GIF89a' ||
      bytes.subarray(0, 6).toString() === 'GIF87a'
    ) {
      return 'image/gif';
    }
    if (
      bytes.subarray(0, 12).toString('ascii', 0, 4) === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp';
    }
    try {
      if (
        /^(?:\uFEFF)?\s*(?:<\?xml[^>]*>\s*)?<svg(?:\s|\/?>)/iu.test(
          new TextDecoder().decode(bytes.subarray(0, 4096)),
        )
      ) {
        return 'image/svg+xml';
      }
    } catch {
      // The unsupported type diagnostic below is authoritative.
    }
  }
  if (kind === 'video') return contentTypeFor(bytes, filePath, kind);
  if (kind === 'sound') {
    if (
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WAVE'
    )
      return 'audio/wav';
    if (bytes.subarray(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
    if (
      bytes.subarray(0, 3).toString('ascii') === 'ID3' ||
      (bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)
    )
      return 'audio/mpeg';
  }
  const extension = filePath.split('.').at(-1)?.toLowerCase() ?? '';
  const extensionTypes = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    wave: 'audio/wav',
  } as Record<string, string>;
  const inferred = extensionTypes[extension];
  if (inferred) return inferred;
  fail(`Cannot determine Content-Type for local ${kind} asset`, 'K4-ASSET-TYPE-001');
}

function logicalBundle(files: {path: string; size: number; integrity: string}[]) {
  const ordered = [...files].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  const canonical = JSON.stringify({formatVersion: 1, files: ordered});
  return {
    contentIntegrity: `sha256-${sha256(canonical)}`,
    contentType: poseModelContentType,
    size: ordered.reduce((total, file) => total + file.size, 0),
  };
}

function declaredProviders(
  assetId: string,
  asset: Dsl4AssetLockStoryAsset,
  configured: Dsl4AssetLockProviderSet | undefined,
) {
  const result: {
    embedded?: Dsl4AssetLockEmbeddedProvider;
    remote?: Dsl4AssetLockRemoteProvider;
  } = {};
  if (asset.delivery === 'embedded') {
    result.embedded =
      typeof asset.file === 'string' ? {file: asset.file} : {name: asset.name ?? assetId};
  } else if (isRecord(asset.source)) {
    if (typeof asset.source.url !== 'string') {
      fail(`Asset ${assetId} remote source is missing`, 'K4-ASSET-PROVIDER-001');
    }
    result.remote = {url: asset.source.url};
  }
  if (configured?.embedded) {
    if (
      result.embedded &&
      JSON.stringify(result.embedded) !== JSON.stringify(configured.embedded)
    ) {
      fail(`Asset ${assetId} has conflicting embedded providers`, 'K4-ASSET-PROVIDER-001');
    }
    result.embedded = configured.embedded;
  }
  if (configured?.remote) {
    if (result.remote && JSON.stringify(result.remote) !== JSON.stringify(configured.remote)) {
      fail(`Asset ${assetId} has conflicting remote providers`, 'K4-ASSET-PROVIDER-001');
    }
    result.remote = configured.remote;
  }
  return result;
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
      size += result.bytesRead;
      chunks.push(chunk.subarray(0, result.bytesRead));
    }
  } finally {
    await handle.close();
  }
  if (size > limit) fail('Local asset exceeds the finite byte limit', 'K4-ASSET-SIZE-001');
  return Buffer.concat(chunks, size);
}

function sameFileState(left: Dsl4FileState, right: Dsl4FileState) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

async function readStableFile(
  filePath: string,
  limit: number,
  fileSystem: Pick<Dsl4FileSystem, 'lstat' | 'open'>,
) {
  const before = await fileSystem.lstat(filePath);
  if (!before.isFile() || before.isSymbolicLink())
    fail('Local asset is not a regular file', 'K4-ASSET-FILE-001');
  if (before.size > limit) fail('Local asset exceeds the finite byte limit', 'K4-ASSET-SIZE-001');
  const first = await readBoundedFile(filePath, limit, fileSystem);
  const middle = await fileSystem.lstat(filePath);
  const second = await readBoundedFile(filePath, limit, fileSystem);
  const after = await fileSystem.lstat(filePath);
  if (!sameFileState(before, middle) || !sameFileState(middle, after) || !first.equals(second)) {
    fail('Local asset changed while it was being read', 'K4-ASSET-UNSTABLE-001');
  }
  return first;
}

async function enumerateLocalFiles(
  rootPath: string,
  assetId: string,
  fileSystem: Pick<Dsl4FileSystem, 'lstat' | 'readdir'>,
) {
  const result: {path: string; absolutePath: string}[] = [];
  async function visit(directory: string, relativeDirectory: string) {
    const entries = await fileSystem.readdir(directory, {withFileTypes: true});
    const typedEntries: import('node:fs').Dirent[] = entries;
    typedEntries.sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    for (const entry of typedEntries) {
      if (
        !entry.name ||
        entry.name === '.' ||
        entry.name === '..' ||
        entry.name.includes('/') ||
        entry.name.includes('\\') ||
        entry.name.includes('\0')
      ) {
        fail(`PoseModel ${assetId} contains an unsafe entry name`, 'K4-ASSET-PATH-001');
      }
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const absolutePath = path.join(directory, entry.name);
      const state = await fileSystem.lstat(absolutePath);
      if (state.isSymbolicLink())
        fail(`PoseModel ${assetId} contains a symbolic link`, 'K4-ASSET-SYMLINK-001');
      if (state.isDirectory()) await visit(absolutePath, relativePath);
      else if (state.isFile()) result.push({path: relativePath, absolutePath});
      else fail(`PoseModel ${assetId} contains a special file`, 'K4-ASSET-FILE-001');
    }
  }
  await visit(rootPath, '');
  return result;
}

async function inspectLocalProvider(
  asset: Dsl4AssetLockStoryAsset,
  provider: {file: string},
  options: Dsl4AssetLockProviderOptions,
) {
  const inputPath = safeRelativePath(provider.file, `Asset ${asset.id} embedded.file`);
  const requestedPath = path.resolve(options.canonicalRoot, ...inputPath.split('/'));
  let state;
  let canonicalPath;
  try {
    state = await options.fileSystem.lstat(requestedPath);
    if (state.isSymbolicLink())
      fail(`Asset ${asset.id} root is a symbolic link`, 'K4-ASSET-SYMLINK-001');
    canonicalPath = await options.fileSystem.realpath(requestedPath);
  } catch (error) {
    if (error instanceof Sb3BuilderError) throw error;
    fail(`Asset ${asset.id} local provider is missing`, 'K4-ASSET-MISSING', error);
  }
  if (!isWithin(options.canonicalRoot, canonicalPath))
    fail(`Asset ${asset.id} escapes the project root`, 'K4-ASSET-PATH-001');
  const recognitionModel = asset.kind === 'recognitionModel';
  if (!recognitionModel && !state.isFile())
    fail(`Asset ${asset.id} must be a regular file`, 'K4-ASSET-FILE-001');
  if (recognitionModel && !state.isFile() && !state.isDirectory())
    fail(`RecognitionModel ${asset.id} must be a file or directory`, 'K4-ASSET-FILE-001');
  if (recognitionModel && state.isFile() && isDsl4PoseArchivePath(inputPath)) {
    const archiveBytes = await readStableFile(
      canonicalPath,
      options.maxFileBytes,
      options.fileSystem,
    );
    options.totalBytes += archiveBytes.length;
    if (options.totalBytes > options.maxTotalBytes)
      fail('Asset lock exceeds maxTotalAssetBytes', 'K4-ASSET-TOTAL-SIZE-001');
    const archiveIntegrity = `sha256-${sha256(archiveBytes)}`;
    let extracted;
    try {
      extracted = await options.poseArchiveExtractor(
        {assetId: asset.id, archiveIntegrity, bytes: new Uint8Array(archiveBytes)},
        {},
      );
    } catch (error) {
      fail(`Local pose archive failed validation for ${asset.id}`, 'K4-ASSET-ARCHIVE-001', error);
    }
    options.fileCount += extracted.files.length;
    if (options.fileCount > options.maxFiles)
      fail('Asset lock exceeds maxAssetFiles', 'K4-ASSET-COUNT-001');
    const files = extracted.files.map((file) => ({
      path: file.path,
      size: file.size,
      integrity: `sha256-${sha256(file.bytes)}`,
    }));
    return {provider: {file: inputPath}, logical: logicalBundle(files)};
  }
  const entries = state.isDirectory()
    ? await enumerateLocalFiles(canonicalPath, asset.id, options.fileSystem)
    : [{path: path.posix.basename(inputPath), absolutePath: canonicalPath}];
  if (entries.length === 0)
    fail(`RecognitionModel ${asset.id} directory is empty`, 'K4-ASSET-FILE-001');
  const files = [];
  const contentsByPath = new Map();
  for (const entry of entries) {
    if (++options.fileCount > options.maxFiles)
      fail('Asset lock exceeds maxAssetFiles', 'K4-ASSET-COUNT-001');
    const bytes = await readStableFile(
      entry.absolutePath,
      options.maxFileBytes,
      options.fileSystem,
    );
    options.totalBytes += bytes.length;
    if (options.totalBytes > options.maxTotalBytes)
      fail('Asset lock exceeds maxTotalAssetBytes', 'K4-ASSET-TOTAL-SIZE-001');
    files.push({path: entry.path, size: bytes.length, integrity: `sha256-${sha256(bytes)}`});
    contentsByPath.set(entry.path, bytes);
  }
  files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  const [onlyFile] = files;
  if (!onlyFile) fail('Asset materialized no files', 'K4-ASSET-LOCK-001');
  const logical = recognitionModel
    ? logicalBundle(files)
    : {
        contentIntegrity: onlyFile.integrity,
        contentType: localContentType(contentsByPath.get(onlyFile.path), onlyFile.path, asset.kind),
        size: onlyFile.size,
      };
  return {provider: {file: inputPath}, logical};
}

async function inspectRemoteProvider(
  asset: Dsl4AssetLockStoryAsset,
  provider: {url: string},
  options: Dsl4AssetLockProviderOptions,
) {
  const remote = await fetchDsl4AssetRemote(provider.url, options);
  options.totalBytes += remote.bytes.length;
  if (options.totalBytes > options.maxTotalBytes)
    fail('Asset lock exceeds maxTotalAssetBytes', 'K4-ASSET-TOTAL-SIZE-001');
  if (asset.kind === 'recognitionModel') {
    const archiveIntegrity = `sha256-${sha256(remote.bytes)}`;
    let extracted;
    try {
      extracted = await options.poseArchiveExtractor(
        {assetId: asset.id, archiveIntegrity, bytes: new Uint8Array(remote.bytes)},
        {},
      );
    } catch (error) {
      fail(`Remote pose archive failed validation for ${asset.id}`, 'K4-ASSET-ARCHIVE-001', error);
    }
    options.fileCount += extracted.files.length;
    if (options.fileCount > options.maxFiles)
      fail('Asset lock exceeds maxAssetFiles', 'K4-ASSET-COUNT-001');
    const files = extracted.files.map((file) => ({
      path: file.path,
      size: file.size,
      integrity: `sha256-${sha256(file.bytes)}`,
    }));
    return {
      provider: {
        url: provider.url,
        transportIntegrity: archiveIntegrity,
        contentType: remote.contentType,
        size: remote.bytes.length,
      },
      logical: logicalBundle(files),
    };
  }
  return {
    provider: {
      url: provider.url,
      transportIntegrity: `sha256-${sha256(remote.bytes)}`,
      contentType: remote.contentType,
      size: remote.bytes.length,
    },
    logical: {
      contentIntegrity: `sha256-${sha256(remote.bytes)}`,
      contentType: remote.contentType,
      size: remote.bytes.length,
    },
  };
}

async function inspectAssetProviders(
  asset: Dsl4AssetLockStoryAsset,
  providers: Dsl4AssetLockProviderSet,
  options: Dsl4AssetLockProviderOptions,
) {
  if (providers.embedded?.name && !providers.remote) {
    fail(
      `Asset ${asset.id} project provider has no bytes for lock generation`,
      'K4-ASSET-PROJECT-001',
    );
  }
  const embedded =
    providers.embedded?.file !== undefined
      ? await inspectLocalProvider(asset, providers.embedded, options)
      : null;
  const remote = providers.remote
    ? await inspectRemoteProvider(asset, providers.remote, options)
    : null;
  const logical = embedded?.logical ?? remote?.logical;
  if (!logical) fail(`Asset ${asset.id} has no lockable provider`, 'K4-ASSET-PROVIDER-001');
  if (embedded && remote && JSON.stringify(embedded.logical) !== JSON.stringify(remote.logical)) {
    fail(
      `Asset ${asset.id} local and remote logical content differ`,
      'K4-ASSET-CONTENT-MISMATCH-001',
    );
  }
  return {
    kind: asset.kind,
    contentIntegrity: logical.contentIntegrity,
    contentType: logical.contentType,
    size: logical.size,
    providers: {
      ...(embedded
        ? {embedded: embedded.provider}
        : providers.embedded?.name
          ? {embedded: {name: providers.embedded.name}}
          : {}),
      ...(remote ? {remote: remote.provider} : {}),
    },
  };
}

export async function generateDsl4AssetDistributionLock(options: unknown) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('lock generation options are required');
  }
  const input = options as Dsl4AssetDistributionLockOptions;
  if (typeof input.projectRoot !== 'string' || input.projectRoot.length === 0)
    throw new TypeError('projectRoot must be a non-empty string');
  if (typeof input.assetConfig !== 'string' || input.assetConfig.length === 0)
    throw new TypeError('assetConfig must be a non-empty string');
  if (!input.sourceFrontend || typeof input.sourceFrontend.parse !== 'function')
    throw new TypeError('sourceFrontend must provide parse');
  const projectRoot = input.projectRoot;
  const assetConfig = input.assetConfig;
  const sourceFrontend = input.sourceFrontend;
  // `sourceIncludesEnabled` was the include opt-in. Include is decided by the entry source now, so
  // the option is still accepted but has no effect.
  if (input.sourceIncludesEnabled !== undefined && typeof input.sourceIncludesEnabled !== 'boolean')
    throw new TypeError('sourceIncludesEnabled must be a boolean');
  const maxSourceFileBytes = resolveDsl4BuildSourceLimits({
    sourceIncludesEnabled: false,
    maxSourceBytes: input.maxSourceBytes,
  }).maxSourceFileBytes;
  const maxSourceManifestBytes = positiveLimit(
    input.maxSourceManifestBytes,
    'maxSourceManifestBytes',
  );
  const maxAssetConfigBytes = positiveLimit(input.maxAssetConfigBytes, 'maxAssetConfigBytes');
  const maxFileBytes = positiveLimit(input.maxAssetFileBytes, 'maxAssetFileBytes');
  const maxFiles = positiveLimit(input.maxAssetFiles, 'maxAssetFiles');
  const maxTotalBytes = positiveLimit(input.maxTotalAssetBytes, 'maxTotalAssetBytes');
  const timeoutMs = positiveLimit(input.timeoutMs, 'timeoutMs');
  const maxRedirects = nonNegativeLimit(input.maxRedirects, 'maxRedirects');
  const allowedHosts = normalizeAllowedHosts(input.allowedHosts);
  const fetchImplementation = input.fetchImplementation ?? globalThis.fetch;
  if (typeof fetchImplementation !== 'function')
    throw new TypeError('fetchImplementation must be a function');
  const boundedFetch = fetchImplementation as Dsl4AssetLockFetchOptions['fetchImplementation'];
  const fileSystem = validateFileSystem(input.fileSystem ?? defaultFileSystem);
  let canonicalRoot;
  try {
    canonicalRoot = await fileSystem.realpath(path.resolve(projectRoot));
    const rootState = await fileSystem.lstat(canonicalRoot);
    if (!rootState.isDirectory()) fail('Project root is not a directory', 'K4-ASSET-ROOT-001');
  } catch (error) {
    if (error instanceof Sb3BuilderError) throw error;
    fail('Cannot resolve project root', 'K4-ASSET-ROOT-001', error);
  }
  const resolvedSource = await resolveDsl4ProjectSource({
    projectRoot,
    ...(input.sourceManifest === undefined ? {} : {sourceManifest: input.sourceManifest}),
    ...(input.source === undefined ? {} : {source: input.source}),
    ...(input.sourceId === undefined ? {} : {sourceId: input.sourceId}),
    maxSourceManifestBytes,
    fileSystem,
    ...(input.readFile === undefined ? {} : {readFile: input.readFile}),
  });
  const configInput = await loadDsl4ProjectJson({
    projectRoot,
    inputPath: assetConfig,
    maxBytes: maxAssetConfigBytes,
    label: 'asset distribution config',
    code: 'K4-ASSET-PROFILE-001',
    fileSystem,
    ...(input.readFile === undefined ? {} : {readFile: input.readFile}),
  });
  const manifest = resolvedSource.manifest;
  const config = validateDsl4AssetDistributionConfig(configInput) as Dsl4AssetLockConfig;
  const source = await loadDsl4ExternalSource(projectRoot, manifest, {
    maxSourceBytes: maxSourceFileBytes,
    fileSystem,
    ...(input.readFile === undefined ? {} : {readSource: input.readFile}),
  });
  const entry = resolveDsl4EntrySourceGraph({
    sourceText: source.descriptor.text,
    maxSourceBytes: input.maxSourceBytes,
    maxTotalSourceBytes: input.maxTotalSourceBytes,
    maxSourceFiles: input.maxSourceFiles,
    maxIncludeDepth: input.maxIncludeDepth,
  });
  let parsed;
  if (entry.graph) {
    const sourceGraph = await loadDsl4BuildSourceGraph(projectRoot, source, {
      limits: entry.graphLimits,
      fileSystem,
      ...(input.readFile === undefined ? {} : {readSource: input.readFile}),
    });
    parsed = createDsl4SourceGraphFrontend(sourceFrontend).parse(sourceGraph, {
      featureFlags: {dsl4Runtime: true},
      sourceId: source.descriptor.sourceId,
      maxComposedSourceBytes: entry.limits.maxComposedSourceBytes,
    });
  } else {
    parsed = sourceFrontend.parse(source.descriptor.text, {
      sourceId: source.descriptor.sourceId,
    });
  }
  const parseResult = parsed as Dsl4AssetLockParseResult;
  if (!parseResult.ok)
    fail(
      typeof parseResult.diagnostics?.[0]?.message === 'string'
        ? parseResult.diagnostics[0].message
        : 'DSL 4.0 source validation failed',
      typeof parseResult.diagnostics?.[0]?.code === 'string'
        ? parseResult.diagnostics[0].code
        : 'K4-ASSET-LOCK-001',
    );
  const storyAssets = parseResult.storyDocument?.assets ?? {};
  for (const assetId of Object.keys(config.providers))
    if (!Object.hasOwn(storyAssets, assetId))
      fail(`Provider configuration references unknown asset ${assetId}`, 'K4-ASSET-PROVIDER-001');
  for (const profile of Object.values(config.profiles))
    for (const assetId of Object.keys(profile.assets ?? {}))
      if (!Object.hasOwn(storyAssets, assetId))
        fail(`Profile references unknown asset ${assetId}`, 'K4-ASSET-PROFILE-001');
  const optionsForProviders = {
    projectRoot,
    canonicalRoot,
    fileSystem,
    maxFileBytes,
    maxFiles,
    maxTotalBytes,
    fileCount: 0,
    totalBytes: 0,
    allowedHosts,
    timeoutMs,
    maxRedirects,
    maxBytes: maxFileBytes,
    fetchImplementation: boundedFetch,
    poseArchiveExtractor: createDsl4PoseArchiveExtractor({
      limits: {
        maxArchiveBytes: maxFileBytes,
        maxEntries: 16,
        maxCompressedEntryBytes: maxFileBytes,
        maxExpandedEntryBytes: maxFileBytes,
        maxTotalExpandedBytes: maxTotalBytes,
        maxCompressionRatio: defaultMaxCompressionRatio,
      },
      subtleCrypto: input.subtleCrypto,
    }),
  };
  const assets: Record<string, unknown> = {};
  for (const assetId of Object.keys(storyAssets).sort()) {
    const storyAsset = storyAssets[assetId];
    if (!storyAsset) fail(`Story asset ${assetId} is missing`, 'K4-ASSET-LOCK-001');
    assets[assetId] = await inspectAssetProviders(
      storyAsset,
      declaredProviders(assetId, storyAsset, config.providers[assetId]),
      optionsForProviders,
    );
  }
  const lock = validateDsl4AssetDistributionLock({formatVersion: 1, assets});
  return deepFreeze({
    lock,
    serialized: serializeDsl4AssetDistributionLock(lock),
    sourceId: source.descriptor.sourceId,
  });
}

export async function generateDsl4AssetDistributionLockFile(options: unknown) {
  if (!isRecord(options) || typeof options.output !== 'string') {
    throw new TypeError('output must name a file');
  }
  const result = await generateDsl4AssetDistributionLock(options);
  const outputPath = path.resolve(options.output);
  const outputDirectory = path.dirname(outputPath);
  const outputName = path.basename(outputPath);
  if (!outputName || outputName === '.' || outputName === '..')
    throw new TypeError('output must name a file');
  const installed = await installBundleTransactionally({
    outputDirectory,
    outputName,
    files: new Map([[outputName, Buffer.from(result.serialized, 'utf8')]]),
    validateCandidate: async (candidateDirectory) => {
      const candidate = JSON.parse(
        await readFile(path.join(candidateDirectory, outputName), 'utf8'),
      );
      validateDsl4AssetDistributionLock(candidate);
    },
  });
  // The transaction installs the output it was given.
  return {...result, outputPath: installed[outputName] ?? outputName};
}
