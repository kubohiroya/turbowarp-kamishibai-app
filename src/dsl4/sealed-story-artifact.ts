import {fromByteArray, toByteArray} from 'base64-js';

import {validateDsl4CacheIdentity} from './cache-identity.js';
import {validateDsl4CompiledStoryArtifact} from './compiled-story-artifact.js';
import {decodeDsl4Envelope, Dsl4FormatError, dsl4FormatVersions} from './format-versions.js';
import {deepFreeze} from './story-document.js';

/**
 * The `sealed` distribution profile: a compiled story and its embedded assets, encrypted.
 *
 * The payload is the compiled story artifact and the embedded asset bundle, as JSON, encrypted
 * with AES-256-GCM under a key derived from a password with PBKDF2-SHA256. The readable header
 * (format, key derivation, cipher, the source the runtime artifact names, the cache identity) is
 * the GCM additional data, so changing any of it fails authentication like a wrong password.
 *
 * Sealing keeps the story and assets out of the SB3 at rest. It does not keep them from a viewer
 * who has the password: a story that plays on the client is decrypted while it plays.
 */
export const dsl4SealedStoryArtifactFormatVersion = 1;

export const dsl4SealedStoryStoragePaths = deepFreeze({
  bundled: 'extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4.sealed',
  unbundled: 'extensionStorage.kubohiroyakamishibairuntime4.sealed',
});

/** OWASP's 2023 PBKDF2-HMAC-SHA256 recommendation; the reader accepts no fewer. */
export const dsl4SealedDefaultIterations = 600_000;
const minIterations = 100_000;
const maxIterations = 10_000_000;
const maxPayloadBytes = 256 * 1024 * 1024;

/** The Web Crypto surface sealing needs, taken by injection like `Dsl4SubtleCrypto`. */
export interface Dsl4SealCrypto {
  readonly subtle: Pick<SubtleCrypto, 'importKey' | 'deriveKey' | 'encrypt' | 'decrypt'>;
  getRandomValues<T extends ArrayBufferView>(array: T): T;
}

/** What a host is asked when a sealed story needs its password. */
export type Dsl4SealedUnlockRequest = Readonly<{
  sourceIntegrity: string;
  /**
   * Names the key derivation (iterations and salt). Stories sealed under one password share it,
   * like the chapters of a publication, so a host can remember the password by it.
   */
  keyId: string;
  /** 1 for the first ask; each wrong password asks again with the next number. */
  attempt: number;
  /** Set when the previous password failed to open the story. */
  previousAttemptFailed: boolean;
}>;

/** Returns the password, or `null` when the viewer declines to give one. */
export type Dsl4SealedUnlock = (
  request: Dsl4SealedUnlockRequest,
) => string | null | Promise<string | null>;

/** How many passwords one load asks for before it gives up. */
export const dsl4SealedMaxUnlockAttempts = 5;

export class Dsl4SealedStoryError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: {cause?: unknown}) {
    super(message, options);
    this.name = 'Dsl4SealedStoryError';
    this.code = code;
  }
}

function fail(code: string, message: string, cause?: unknown): never {
  throw new Dsl4SealedStoryError(code, message, cause === undefined ? undefined : {cause});
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function defaultCrypto(): Dsl4SealCrypto {
  const crypto = globalThis.crypto;
  if (!crypto?.subtle || typeof crypto.getRandomValues !== 'function')
    fail('K4-SEALED-CRYPTO-001', 'Web Crypto is unavailable');
  return crypto as unknown as Dsl4SealCrypto;
}

function base64(value: unknown, bytes: number | null, name: string) {
  if (typeof value !== 'string') fail('K4-SEALED-STORY-001', `${name} must be base64`);
  let decoded: Uint8Array;
  try {
    decoded = toByteArray(value);
  } catch {
    fail('K4-SEALED-STORY-001', `${name} must be canonical base64`);
  }
  if (fromByteArray(decoded) !== value || (bytes !== null && decoded.byteLength !== bytes))
    fail('K4-SEALED-STORY-001', `${name} must be ${bytes ?? 'canonical'} base64 bytes`);
  return decoded;
}

interface SealedHeader {
  formatVersion: 1;
  profile: 'sealed';
  sourceIntegrity: string;
  keyDerivation: {kind: 'pbkdf2-sha256'; iterations: number; salt: string};
  cipher: {kind: 'aes-256-gcm'; iv: string};
  cacheIdentity?: unknown;
}

/** The authenticated header, in one fixed key order so writer and reader hash the same bytes. */
function additionalData(header: SealedHeader) {
  return new TextEncoder().encode(
    JSON.stringify({
      formatVersion: header.formatVersion,
      profile: header.profile,
      sourceIntegrity: header.sourceIntegrity,
      keyDerivation: {
        kind: header.keyDerivation.kind,
        iterations: header.keyDerivation.iterations,
        salt: header.keyDerivation.salt,
      },
      cipher: {kind: header.cipher.kind, iv: header.cipher.iv},
      cacheIdentity: header.cacheIdentity ?? null,
    }),
  );
}

/**
 * Remembers derived keys for one password context, so stories sealed under the same salt (the
 * chapters of a publication) derive their key once. It holds keys and the password they came
 * from in memory only; drop the cache to forget them.
 */
export interface Dsl4SealedKeyCache {
  readonly entries: Map<string, {password: string; key: Promise<CryptoKey>}>;
}

export function createDsl4SealedKeyCache(): Dsl4SealedKeyCache {
  return {entries: new Map()};
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
  usage: 'encrypt' | 'decrypt',
  crypto: Dsl4SealCrypto,
  cache?: Dsl4SealedKeyCache,
): Promise<CryptoKey> {
  if (typeof password !== 'string' || password.length === 0)
    fail('K4-SEALED-KEY-001', 'A sealed story needs a non-empty password');
  if (cache) {
    const id = `${usage}|${iterations}|${fromByteArray(salt)}`;
    const cached = cache.entries.get(id);
    if (cached && cached.password === password) return cached.key;
    const key: Promise<CryptoKey> = deriveKey(password, salt, iterations, usage, crypto);
    // A failed derivation must not stay cached for the next attempt.
    key.catch(() => {
      if (cache.entries.get(id)?.key === key) cache.entries.delete(id);
    });
    cache.entries.set(id, {password, key});
    return key;
  }
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt), iterations},
    material,
    {name: 'AES-GCM', length: 256},
    false,
    [usage],
  );
}

/**
 * Seal a compiled story artifact together with its embedded asset bundle.
 *
 * The salt and IV are fresh random values on every call, so sealing the same story twice gives two
 * different artifacts; a fixed IV under one password would break AES-GCM.
 */
export async function createDsl4SealedStoryArtifact(
  {compiled, assets}: {compiled: Readonly<Record<string, unknown>>; assets: unknown},
  password: string,
  {
    iterations = dsl4SealedDefaultIterations,
    crypto = defaultCrypto(),
    salt: sharedSalt,
    keyCache,
  }: {
    iterations?: number;
    crypto?: Dsl4SealCrypto;
    /** Seal under a salt shared with other stories (a publication's chapters); 16 bytes. */
    salt?: Uint8Array;
    keyCache?: Dsl4SealedKeyCache;
  } = {},
) {
  if (!Number.isSafeInteger(iterations) || iterations < minIterations || iterations > maxIterations)
    fail('K4-SEALED-STORY-001', `iterations must be between ${minIterations} and ${maxIterations}`);
  if (compiled.profile !== 'compiled' || typeof compiled.sourceIntegrity !== 'string')
    fail('K4-SEALED-STORY-001', 'Only a compiled story artifact can be sealed');
  if (sharedSalt !== undefined && sharedSalt.byteLength !== 16)
    fail('K4-SEALED-STORY-001', 'A shared salt must be 16 bytes');
  // The IV is always fresh; only the salt may be shared, which keeps one key per publication.
  const salt = sharedSalt ? new Uint8Array(sharedSalt) : crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header: SealedHeader = {
    formatVersion: 1,
    profile: 'sealed',
    sourceIntegrity: compiled.sourceIntegrity,
    keyDerivation: {kind: 'pbkdf2-sha256', iterations, salt: fromByteArray(salt)},
    cipher: {kind: 'aes-256-gcm', iv: fromByteArray(iv)},
    ...(compiled.cacheIdentity === undefined
      ? {}
      : {cacheIdentity: validateDsl4CacheIdentity(compiled.cacheIdentity)}),
  };
  const plaintext = new TextEncoder().encode(JSON.stringify({compiled, assets}));
  if (plaintext.byteLength > maxPayloadBytes)
    fail('K4-SEALED-STORY-SIZE-001', `Sealed payload exceeds ${maxPayloadBytes} bytes`);
  const key = await deriveKey(password, salt, iterations, 'encrypt', crypto, keyCache);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {name: 'AES-GCM', iv, additionalData: additionalData(header), tagLength: 128},
      key,
      plaintext,
    ),
  );
  return deepFreeze({...header, ciphertext: fromByteArray(ciphertext)});
}

/** Read the sealed envelope without decrypting it. */
export function readDsl4SealedStoryHeader(input: unknown) {
  let value;
  try {
    value = decodeDsl4Envelope(input, {
      kind: 'sealedArtifact',
      requiredKeys: ['profile', 'sourceIntegrity', 'keyDerivation', 'cipher', 'ciphertext'],
      optionalKeys: ['cacheIdentity'],
    });
  } catch (error) {
    if (error instanceof Dsl4FormatError) fail(error.code, error.message, error);
    throw error;
  }
  if (dsl4FormatVersions.sealedArtifact !== dsl4SealedStoryArtifactFormatVersion)
    throw new TypeError('Sealed artifact format index is inconsistent');
  if (value.profile !== 'sealed')
    fail('K4-SEALED-STORY-001', 'Sealed artifact profile must be sealed');
  if (
    typeof value.sourceIntegrity !== 'string' ||
    !/^sha256-[A-Za-z0-9+/]{43}=$/u.test(value.sourceIntegrity)
  )
    fail('K4-SEALED-STORY-001', 'sourceIntegrity must be a SHA-256 integrity');
  const derivation = value.keyDerivation;
  if (
    !isRecord(derivation) ||
    Object.keys(derivation).sort().join() !== 'iterations,kind,salt' ||
    derivation.kind !== 'pbkdf2-sha256' ||
    !Number.isSafeInteger(derivation.iterations) ||
    Number(derivation.iterations) < minIterations ||
    Number(derivation.iterations) > maxIterations
  )
    fail('K4-SEALED-STORY-001', 'Sealed key derivation is not supported');
  const cipher = value.cipher;
  if (
    !isRecord(cipher) ||
    Object.keys(cipher).sort().join() !== 'iv,kind' ||
    cipher.kind !== 'aes-256-gcm'
  )
    fail('K4-SEALED-STORY-001', 'Sealed cipher is not supported');
  const header: SealedHeader = {
    formatVersion: 1,
    profile: 'sealed',
    sourceIntegrity: value.sourceIntegrity,
    keyDerivation: {
      kind: 'pbkdf2-sha256',
      iterations: Number(derivation.iterations),
      salt: String(derivation.salt),
    },
    cipher: {kind: 'aes-256-gcm', iv: String(cipher.iv)},
    ...(value.cacheIdentity === undefined
      ? {}
      : {cacheIdentity: validateDsl4CacheIdentity(value.cacheIdentity)}),
  };
  return {
    header,
    salt: base64(derivation.salt, 16, 'keyDerivation.salt'),
    iv: base64(cipher.iv, 12, 'cipher.iv'),
    ciphertext: base64(value.ciphertext, null, 'ciphertext'),
  };
}

/**
 * Decrypt a sealed story and check what comes out.
 *
 * A wrong password and a changed header or ciphertext are indistinguishable by design: both fail
 * GCM authentication with `K4-SEALED-AUTH-001`. The decrypted compiled story is then checked like
 * any compiled story (envelope, digest, Story IR) and must name the same source as the header.
 * Nothing decrypted is written anywhere; the caller holds it in memory for the component's life.
 */
export async function openDsl4SealedStoryArtifact(
  input: unknown,
  password: string,
  {
    crypto = defaultCrypto(),
    keyCache,
  }: {crypto?: Dsl4SealCrypto; keyCache?: Dsl4SealedKeyCache} = {},
) {
  const {header, salt, iv, ciphertext} = readDsl4SealedStoryHeader(input);
  if (ciphertext.byteLength > maxPayloadBytes + 16)
    fail('K4-SEALED-STORY-SIZE-001', `Sealed payload exceeds ${maxPayloadBytes} bytes`);
  const key = await deriveKey(
    password,
    salt,
    header.keyDerivation.iterations,
    'decrypt',
    crypto,
    keyCache,
  );
  let plaintext: Uint8Array;
  try {
    plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: new Uint8Array(iv),
          additionalData: additionalData(header),
          tagLength: 128,
        },
        key,
        new Uint8Array(ciphertext),
      ),
    );
  } catch (error) {
    fail('K4-SEALED-AUTH-001', 'The password is wrong or the sealed story was changed', error);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(plaintext));
  } catch (error) {
    fail('K4-SEALED-STORY-001', 'Sealed payload is not JSON', error);
  }
  if (!isRecord(payload) || Object.keys(payload).sort().join() !== 'assets,compiled')
    fail('K4-SEALED-STORY-001', 'Sealed payload must hold exactly a compiled story and its assets');
  const compiled = await validateDsl4CompiledStoryArtifact(payload.compiled);
  if (compiled.sourceIntegrity !== header.sourceIntegrity)
    fail('K4-SEALED-STORY-001', 'Sealed story does not match the source its header names');
  return {compiled, assets: payload.assets, cacheIdentity: header.cacheIdentity};
}

/**
 * Open a sealed story with passwords from `unlock`, asking again after a wrong one.
 *
 * Returns `null` when the viewer declines (an empty or `null` answer). A wrong password asks again
 * up to `dsl4SealedMaxUnlockAttempts` times, then throws `K4-SEALED-AUTH-001`; any other failure
 * throws at once.
 */
export async function openDsl4SealedStoryWithUnlock(
  input: unknown,
  unlock: Dsl4SealedUnlock,
  options: {crypto?: Dsl4SealCrypto; keyCache?: Dsl4SealedKeyCache} = {},
) {
  const {header} = readDsl4SealedStoryHeader(input);
  for (let attempt = 1; ; attempt += 1) {
    const password = await unlock(
      Object.freeze({
        sourceIntegrity: header.sourceIntegrity,
        keyId: `pbkdf2-sha256:${header.keyDerivation.iterations}:${header.keyDerivation.salt}`,
        attempt,
        previousAttemptFailed: attempt > 1,
      }),
    );
    if (password === null || password === '') return null;
    try {
      return await openDsl4SealedStoryArtifact(input, password, options);
    } catch (error) {
      const wrong = error instanceof Dsl4SealedStoryError && error.code === 'K4-SEALED-AUTH-001';
      if (!wrong || attempt >= dsl4SealedMaxUnlockAttempts) throw error;
    }
  }
}

/** Find the one sealed story a project stores, by the same bundled/unbundled channels as source. */
export function findDsl4SealedStory(project: unknown) {
  const storage =
    isRecord(project) && isRecord(project.extensionStorage) ? project.extensionStorage : {};
  const runtime = isRecord(storage.kubohiroyakamishibairuntime4)
    ? storage.kubohiroyakamishibairuntime4
    : {};
  const bundle = isRecord(storage.kubohiroyakamishibai4) ? storage.kubohiroyakamishibai4 : {};
  const components = isRecord(bundle.components) ? bundle.components : {};
  const bundled = isRecord(components.kubohiroyakamishibairuntime4)
    ? components.kubohiroyakamishibairuntime4
    : {};
  const found = [
    {channel: 'unbundled' as const, artifact: runtime.sealed, owner: runtime},
    {channel: 'bundled' as const, artifact: bundled.sealed, owner: bundled},
  ].filter(({artifact}) => artifact !== undefined);
  if (found.length > 1)
    fail(
      'K4-SEALED-STORY-CHANNEL-AMBIGUOUS',
      'DSL 4.0 sealed story exists in both bundled and unbundled storage',
    );
  return found[0] ?? null;
}

/**
 * Seal a compiled project in place: its compiled story and embedded assets move into the
 * ciphertext, and nothing of either stays readable in project.json.
 *
 * Only embedded (base64) assets can be sealed. Root binary entries keep their bytes outside
 * project.json, and remote assets would be cached in the clear, so both are refused.
 */
export async function sealDsl4CompiledProject(
  project: Record<string, unknown>,
  password: string,
  options: {iterations?: number; crypto?: Dsl4SealCrypto} = {},
) {
  const storage = isRecord(project.extensionStorage) ? project.extensionStorage : {};
  const runtime = isRecord(storage.kubohiroyakamishibairuntime4)
    ? storage.kubohiroyakamishibairuntime4
    : null;
  const bundle = isRecord(storage.kubohiroyakamishibai4) ? storage.kubohiroyakamishibai4 : {};
  const components = isRecord(bundle.components) ? bundle.components : {};
  const bundled = isRecord(components.kubohiroyakamishibairuntime4)
    ? components.kubohiroyakamishibairuntime4
    : null;
  const owners = [runtime, bundled].filter(
    (owner): owner is Record<string, unknown> => owner !== null && owner.compiled !== undefined,
  );
  if (owners.length !== 1)
    fail('K4-SEALED-BUILD-001', 'Exactly one compiled runtime component is needed to seal');
  const owner = owners[0]!;
  if (owner.source !== undefined || owner.assetDistribution !== undefined)
    fail('K4-SEALED-ASSETS-001', 'A sealed story cannot keep its source or remote asset providers');
  const assets = owner.assets;
  const files = isRecord(assets) && Array.isArray(assets.files) ? assets.files : null;
  if (!files || files.some((file) => !isRecord(file) || typeof file.data !== 'string'))
    fail('K4-SEALED-ASSETS-001', 'A sealed story carries embedded (base64) assets only');
  const sealed = await createDsl4SealedStoryArtifact(
    {compiled: owner.compiled as Record<string, unknown>, assets},
    password,
    options,
  );
  delete owner.compiled;
  delete owner.assets;
  owner.sealed = structuredClone(sealed);
  return sealed;
}
