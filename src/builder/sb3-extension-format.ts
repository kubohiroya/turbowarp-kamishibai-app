import {
  discoverManifest,
  isRemoteSource,
  validateManifest,
  type ExecutionMode,
  type ExtensionSpec,
} from '@kubohiroya/turbowarp-extension-loader';

import {
  dsl4BlockAuthoringExtensionId,
  dsl4BlockSourceBundleExtensionId,
  dsl4BlockSourceRuntimeExtensionId,
} from '../dsl4/block-source-shared.js';
import {Sb3BuilderError} from './errors.js';
import {sha256} from './hash.js';
import {sb3SaveFormatSupport, type Sb3SaveFormat} from './sb3-save-format.js';

/** The address an embedded source records, when it records one. */
const retainedURL = (spec: ExtensionSpec): string | undefined =>
  'url' in spec.source ? spec.source.url : undefined;

const legacyDataUrlPrefix = 'data:text/javascript;base64,';
const maxExtensionBytes = 16 * 1024 * 1024;

/** The archive entry this writer gives an extension it stores as a file. */
export const sb3PlusExtensionPath = (id: string) => `extensions/${id}.js`;

/**
 * The App's own DSL 4.0 extensions read the host `Scratch` surface and refuse a sandboxed host.
 *
 * A legacy `data:` URL records no execution mode, so only these IDs are requested unsandboxed by
 * default and every other extension is requested sandboxed: a rewrite never promotes an extension
 * on its own. An existing Manifest entry always keeps the mode it already requested, and nothing in
 * an SB3 grants it — a Plus host asks its `trustProvider`, a standard host asks the person.
 */
export const dsl4UnsandboxedExtensionIds: readonly string[] = Object.freeze([
  dsl4BlockSourceBundleExtensionId,
  dsl4BlockSourceRuntimeExtensionId,
  dsl4BlockAuthoringExtensionId,
]);

function fail(message: string, code: string, cause?: unknown): never {
  throw new Sb3BuilderError(message, {stage: 'sb3-extension-format', code, cause});
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface Sb3ExtensionPayload {
  readonly id: string;
  /** The current form this extension is stored in. */
  readonly format: Sb3SaveFormat;
  /** Absent for a remote extension, whose bytes are not in the SB3. */
  readonly bytes?: Uint8Array | undefined;
  readonly sha256?: string | undefined;
  readonly url?: string | undefined;
  /** The archive entry this extension occupies now, which a rewrite must release. */
  readonly path?: string | undefined;
  /** The Manifest entry it came from, whose execution mode and metadata a rewrite keeps. */
  readonly spec?: ExtensionSpec | undefined;
}

function decode(id: string, encoded: string): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(encoded, 'base64'));
  } catch (cause) {
    fail(`Extension ${id} has an undecodable data URL.`, 'K4-EXT-FORMAT-001', cause);
  }
  if (!bytes.byteLength || bytes.byteLength > maxExtensionBytes)
    fail(`Extension ${id} is empty or too large.`, 'K4-EXT-FORMAT-001');
  try {
    new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  } catch (cause) {
    fail(`Extension ${id} is not UTF-8 JavaScript.`, 'K4-EXT-FORMAT-001', cause);
  }
  return bytes;
}

/**
 * Read every extension this project carries, whichever form holds it.
 *
 * A Plus Manifest wins over a `data:` carrier for the same ID, because that is the order a Plus
 * host resolves them in. A `data:` URL counts only when its ID is declared in `extensions`: an
 * undeclared leftover is not loaded today, and reading it here would bring it back.
 */
export function readSb3ExtensionPayloads(
  archive: Readonly<Record<string, Uint8Array>>,
  project: Readonly<Record<string, unknown>>,
): readonly Sb3ExtensionPayload[] {
  const result: Sb3ExtensionPayload[] = [];
  const seen = new Set<string>();
  const manifest = project.turboWarpPlus === undefined ? null : discoverManifest(project);
  for (const spec of manifest?.extensions ?? []) {
    seen.add(spec.id);
    if (spec.source.type === 'remote-non-cacheable' || spec.source.type === 'remote-cacheable') {
      // A reference carries no bytes. Materialising one is a fetch, which belongs to the writer.
      result.push(
        Object.freeze({
          id: spec.id,
          format: spec.source.type,
          url: spec.source.url,
          sha256: spec.sha256,
          spec,
        }),
      );
      continue;
    }
    const url = retainedURL(spec);
    if (spec.source.type === 'embedded-file') {
      const bytes = archive[spec.source.path];
      if (!bytes) fail(`The archive is missing ${spec.source.path}.`, 'K4-EXT-FORMAT-002');
      result.push(
        Object.freeze({
          id: spec.id,
          format: 'embedded-file',
          bytes: new Uint8Array(bytes),
          sha256: spec.sha256,
          path: spec.source.path,
          ...(url === undefined ? {} : {url}),
          spec,
        }),
      );
      continue;
    }
    // The data carrier lives in the project document under the extension's own ID, which is also
    // where a standard host looks for it. The Manifest records that it is there, not the bytes.
    const carrier = isRecord(project.extensionURLs) ? project.extensionURLs[spec.id] : undefined;
    if (typeof carrier !== 'string' || !carrier.startsWith(legacyDataUrlPrefix))
      fail(
        `The project document is missing the data: carrier for ${spec.id}.`,
        'K4-EXT-FORMAT-002',
      );
    result.push(
      Object.freeze({
        id: spec.id,
        format: 'embedded-data',
        bytes: decode(spec.id, carrier.slice(legacyDataUrlPrefix.length)),
        sha256: spec.sha256,
        ...(url === undefined ? {} : {url}),
        spec,
      }),
    );
  }
  const declared = new Set(
    Array.isArray(project.extensions)
      ? project.extensions.filter((id): id is string => typeof id === 'string')
      : [],
  );
  const urls = isRecord(project.extensionURLs) ? project.extensionURLs : {};
  for (const [id, url] of Object.entries(urls)) {
    if (seen.has(id) || !declared.has(id)) continue;
    if (typeof url !== 'string' || !url.startsWith(legacyDataUrlPrefix)) continue;
    const bytes = decode(id, url.slice(legacyDataUrlPrefix.length));
    result.push(Object.freeze({id, format: 'embedded-data', bytes, sha256: sha256(bytes)}));
  }
  return Object.freeze(result);
}

export interface Sb3ExtensionFormatOptions {
  /** Required for either reference form unless the project already names the URL. */
  readonly urls?: Readonly<Record<string, string>> | undefined;
  /** Recorded in the Manifest for provenance only; it is never an execution permission. */
  readonly version?: string | undefined;
  /** Legacy `data:` extensions to request unsandboxed, beside the App's own DSL 4.0 ones. */
  readonly unsandboxed?: readonly string[] | undefined;
  /**
   * Also keep the `data:` carrier beside a form that is not already it, so one SB3 loads in both
   * kinds of host. A Plus host does not load it twice: it resolves the Manifest's own carrier.
   */
  readonly keepEmbeddedData?: boolean | undefined;
  /** Injected for tests; defaults to the global `fetch`. Used to materialise a reference. */
  readonly fetch?: typeof fetch | undefined;
  readonly timeoutMs?: number | undefined;
}

export interface Sb3ExtensionFormatResult {
  readonly converted: readonly string[];
  readonly format: Sb3SaveFormat;
}

/**
 * Fetch the bytes a reference names and refuse anything but the digest it pins.
 *
 * Embedding unverified bytes would turn a conversion into a way to replace an extension, so the
 * pin is checked here rather than left to the host that eventually loads it. Redirects are
 * refused for the same reason the Loader refuses them: the address that answered is the one the
 * project claims, or the project is wrong about it.
 */
async function fetchPinned(
  id: string,
  url: string,
  pinned: string | undefined,
  fetchBytes: typeof fetch,
  timeoutMs: number,
): Promise<Uint8Array> {
  let bytes: Uint8Array;
  try {
    const response = await fetchBytes(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (cause) {
    fail(`Extension ${id} could not be fetched from ${url}: ${String(cause)}`, 'K4-EXT-FORMAT-005');
  }
  if (bytes.byteLength < 1 || bytes.byteLength > maxExtensionBytes)
    fail(`Extension ${id} is empty or exceeds the byte limit.`, 'K4-EXT-FORMAT-005');
  if (pinned !== undefined && sha256(bytes) !== pinned)
    fail(`${url} does not serve the bytes extension ${id} pins.`, 'K4-EXT-FORMAT-008');
  return bytes;
}

const dataUrl = (bytes: Uint8Array) =>
  `${legacyDataUrlPrefix}${Buffer.from(bytes).toString('base64')}`;

/**
 * Rewrite every extension of this project into one form, in place. Running it again on its own
 * output is a no-op, so a rewritten SB3 can be rewritten or rebuilt like any other.
 *
 * All four forms keep the Manifest. `embedded-data` is the one a standard TurboWarp host loads on
 * its own, because it reads `extensionURLs` and knows nothing of the Manifest beside it — but the
 * Manifest still records that the bytes are there, so a Plus host keeps the digest to verify
 * against, the declared execution mode and the dependencies. Dropping it would have been a loss
 * that only standard hosts were ever paid for. `keepEmbeddedData` adds that carrier to a form
 * that is not already it, so a Plus host prefers the Manifest's own copy.
 *
 * Going from a reference to a carried form is a fetch: the reference names a URL and pins a
 * digest, so the bytes are obtainable and verifiable, and refusing would have made a conversion
 * impossible for no reason other than that this function could not reach the network.
 */
export async function writeSb3ExtensionFormat(
  archive: Record<string, Uint8Array>,
  project: Record<string, unknown>,
  format: Sb3SaveFormat,
  {
    urls = {},
    version,
    unsandboxed = [],
    keepEmbeddedData = false,
    fetch: fetchBytes = fetch,
    timeoutMs = 30_000,
  }: Sb3ExtensionFormatOptions = {},
): Promise<Sb3ExtensionFormatResult> {
  const support = sb3SaveFormatSupport('extensions', format);
  if (!support.supported)
    fail(`Cannot save extensions as ${format}: ${support.reason}`, 'K4-EXT-FORMAT-003');
  const payloads = readSb3ExtensionPayloads(archive, project);
  if (!payloads.length) return Object.freeze({converted: Object.freeze([]), format});

  const unsandboxedIds = new Set([...dsl4UnsandboxedExtensionIds, ...unsandboxed]);
  const declared = Array.isArray(project.extensions)
    ? project.extensions.filter((id): id is string => typeof id === 'string')
    : [];
  const nextURLs: Record<string, unknown> = isRecord(project.extensionURLs)
    ? {...project.extensionURLs}
    : {};
  // What the project carried for each of these before the release below, so a rewrite can reuse
  // a carrier instead of fetching bytes that are already here.
  const carriers = new Map<string, string>();
  // Release only what these extensions own now, then write back only the chosen form.
  for (const payload of payloads) {
    const held = nextURLs[payload.id];
    if (typeof held === 'string' && held.startsWith(legacyDataUrlPrefix))
      carriers.set(payload.id, held);
    delete nextURLs[payload.id];
    if (payload.path !== undefined) delete archive[payload.path];
  }

  const specs: Record<string, unknown>[] = [];
  const converted: string[] = [];
  for (const payload of payloads) {
    const {id, bytes, spec} = payload;
    // A rewrite keeps what the existing entry declared, rather than resetting it.
    const metadata = {
      execution: (spec?.execution ??
        (unsandboxedIds.has(id) ? 'unsandboxed' : 'sandboxed')) as ExecutionMode,
      ...((version ?? spec?.version) === undefined ? {} : {version: version ?? spec?.version}),
      ...(spec?.publisher === undefined ? {} : {publisher: spec.publisher}),
      capabilities: [...(spec?.capabilities ?? [])],
      dependencies: [...(spec?.dependencies ?? [])],
    };
    const url = urls[id] ?? payload.url;
    const carried = format === 'embedded-file' || format === 'embedded-data';
    // A reference pins a digest and names a URL, so its bytes are obtainable and verifiable.
    // Fetching here is the whole conversion; the alternative was refusing it.
    let content = bytes;
    if ((carried || keepEmbeddedData) && !content) {
      // A `data:` carrier beside a reference holds the bytes already, which is what a rewrite of
      // this writer's own `--keep-embedded-data` output finds. Reaching for the network when they
      // are sitting in the project would make the same operation need one the second time.
      const beside = carriers.get(id);
      if (beside !== undefined) {
        content = decode(id, beside.slice(legacyDataUrlPrefix.length));
        if (payload.sha256 !== undefined && sha256(content) !== payload.sha256)
          fail(
            `The data: carrier beside extension ${id} is not the bytes it pins.`,
            'K4-EXT-FORMAT-008',
          );
      } else {
        if (typeof url !== 'string' || !url)
          fail(
            `Extension ${id} carries no bytes and names no URL to fetch them from.`,
            'K4-EXT-FORMAT-005',
          );
        content = await fetchPinned(id, url, payload.sha256, fetchBytes, timeoutMs);
      }
    }
    if (!carried && (typeof url !== 'string' || !url))
      fail(`Extension ${id} needs an HTTPS URL to be saved as ${format}.`, 'K4-EXT-FORMAT-004');
    // The carrier a standard host reads, kept beside a form that is not already it.
    if (keepEmbeddedData && format !== 'embedded-data') nextURLs[id] = dataUrl(content!);
    if (!carried) {
      const digest = payload.sha256 ?? (content && sha256(content));
      if (!digest)
        fail(`Extension ${id} has no digest to pin for a reference.`, 'K4-EXT-FORMAT-004');
      // validateManifest enforces the HTTPS and digest policy for us.
      specs.push({id, source: {type: format, url}, sha256: digest, ...metadata});
      converted.push(id);
      continue;
    }
    // Either carrier records the address the bytes came from, when one is known. It is the only
    // thing that keeps a path back to a reference form open.
    const origin = typeof url === 'string' && url ? {url} : {};
    if (format === 'embedded-data') {
      nextURLs[id] = dataUrl(content!);
      specs.push({
        id,
        source: {type: 'embedded-data', ...origin},
        sha256: sha256(content!),
        ...metadata,
      });
      converted.push(id);
      continue;
    }
    const path = sb3PlusExtensionPath(id);
    if (Object.hasOwn(archive, path))
      fail(`The archive already contains unrelated content at ${path}.`, 'K4-EXT-FORMAT-007');
    archive[path] = content!;
    specs.push({
      id,
      source: {type: 'embedded-file', ...origin, path},
      sha256: sha256(content!),
      ...metadata,
    });
    converted.push(id);
  }

  // Every form keeps the Manifest, including the data carrier: a standard host ignores it, and a
  // Plus host would otherwise lose the digest, the execution mode and the dependencies.
  if (specs.length) project.turboWarpPlus = validateManifest({schemaVersion: 1, extensions: specs});
  else delete project.turboWarpPlus;
  project.extensionURLs = nextURLs;
  project.extensions = [...new Set([...declared, ...payloads.map((payload) => payload.id)])];
  return Object.freeze({converted: Object.freeze(converted), format});
}

export interface Sb3ExtensionUrlCheckOptions {
  /** Injected for tests; defaults to the global `fetch`. */
  readonly fetch?: typeof fetch | undefined;
  readonly timeoutMs?: number | undefined;
}

/**
 * Fetch every URL this project's Manifest names, and refuse the project unless each URL returns
 * exactly the bytes its digest pins.
 *
 * The writer pins the digest of the bytes it has in hand, but a host loads the URL: a URL serving
 * other bytes makes an SB3 that a Plus host rejects with `DIGEST_MISMATCH` (a cached copy only
 * hides that until the host falls back to the URL). Like the Loader, this refuses redirects.
 */
export async function verifySb3ExtensionUrls(
  project: Record<string, unknown>,
  {fetch: fetchBytes = fetch, timeoutMs = 30_000}: Sb3ExtensionUrlCheckOptions = {},
): Promise<readonly string[]> {
  const checked: string[] = [];
  for (const spec of discoverManifest(project)?.extensions ?? []) {
    // Every source that names a URL has one to verify, whichever form it is stored in.
    const url = isRemoteSource(spec.source) ? spec.source.url : retainedURL(spec);
    if (url === undefined) continue;
    let bytes: Uint8Array;
    try {
      const response = await fetchBytes(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const length = Number(response.headers.get('content-length'));
      if (length > maxExtensionBytes) throw new Error(`${length} bytes is too large`);
      bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > maxExtensionBytes)
        throw new Error(`${bytes.byteLength} bytes is too large`);
    } catch (error) {
      fail(
        `Could not fetch ${url} for extension ${spec.id}: ${(error as Error).message}. ` +
          'Pass --skip-url-check only if the URL will serve the pinned bytes later.',
        'K4-EXT-FORMAT-008',
        error,
      );
    }
    const actual = sha256(bytes);
    if (actual !== spec.sha256)
      fail(
        `${url} does not serve the bytes extension ${spec.id} pins ` +
          `(expected sha256 ${spec.sha256}, got ${actual}); a Plus host would reject it.`,
        'K4-EXT-FORMAT-009',
      );
    checked.push(spec.id);
  }
  return Object.freeze(checked);
}
