import {decodeDsl4Envelope, Dsl4FormatError, dsl4FormatVersions} from './format-versions.js';
import {validateDsl4CacheIdentity} from './cache-identity.js';
import {computeDsl4Sha256Integrity} from './source-descriptor.js';
import {deepFreeze} from './story-document.js';
import type {Dsl4SubtleCrypto} from './subtle-crypto.js';
import {resolveDsl4Viewport} from './viewport.js';

/**
 * The `compiled` distribution profile: a validated StoryDocument stored instead of its YAML.
 *
 * Compiling is source omission, not secrecy. The Story IR is plain JSON a player has to read, so
 * anything the story does stays visible; what goes away is the authoring text -- comments, layout,
 * file paths and the line/column map back into the YAML. Nothing here encrypts or hides content.
 */
export const dsl4CompiledStoryArtifactFormatVersion = 1;

/** The sourceId every compiled story carries, so no authoring path survives in diagnostics. */
export const dsl4CompiledStorySourceId = 'compiled';

export const dsl4CompiledStoryStoragePaths = deepFreeze({
  bundled:
    'extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4.compiled',
  unbundled: 'extensionStorage.kubohiroyakamishibairuntime4.compiled',
});

/** Authoring-only members. Each one points back into the YAML and none is read to play a story. */
const authoringKeys = new Set(['sourceMap', 'sourceOrigins', 'sourceRange']);
/** Metadata the runtime reads. `narrativeControl` gates the narrative runtime; it is not a path. */
const compiledMetadataKeys = new Set([
  'sourceId',
  'sourceVersion',
  'narrativeControl',
  'invalidatedRecognitionScenes',
  'implicitProjectActors',
  'implicitProjectAssets',
  'sealedAssetSources',
]);
const maxStoryDepth = 64;
const maxStoryBytes = 16 * 1024 * 1024;

export class Dsl4CompiledStoryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'Dsl4CompiledStoryError';
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new Dsl4CompiledStoryError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Copy JSON data, dropping authoring-only members at every depth. */
function stripAuthoring(value: unknown, depth = 0): unknown {
  if (depth > maxStoryDepth) fail('K4-COMPILED-STORY-001', 'Story IR is nested too deeply');
  if (Array.isArray(value)) return value.map((item) => stripAuthoring(item, depth + 1));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !authoringKeys.has(key))
      .map(([key, item]) => [key, stripAuthoring(item, depth + 1)]),
  );
}

/** Refuse anything a JSON round trip would not reproduce, and any authoring member left behind. */
function assertStoryIr(value: unknown, path: string, depth = 0): void {
  if (depth > maxStoryDepth) fail('K4-COMPILED-STORY-001', 'Story IR is nested too deeply');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('K4-COMPILED-STORY-001', `${path} is not a finite number`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertStoryIr(item, `${path}[${index}]`, depth + 1));
    return;
  }
  const prototype = isRecord(value) ? Object.getPrototypeOf(value) : undefined;
  if (!isRecord(value) || (prototype !== Object.prototype && prototype !== null))
    fail('K4-COMPILED-STORY-001', `${path} is not JSON data`);
  for (const [key, item] of Object.entries(value)) {
    if (authoringKeys.has(key))
      fail('K4-COMPILED-STORY-SOURCE-001', `${path}.${key} is authoring data`);
    assertStoryIr(item, `${path}.${key}`, depth + 1);
  }
}

/** The structure the runtime reads before it plays anything. */
function assertStoryShape(story: Record<string, unknown>) {
  if (story.viewport !== undefined) resolveDsl4Viewport(story.viewport);
  if (story.kind !== 'StoryDocument' || story.version !== '4.0')
    fail('K4-COMPILED-STORY-001', 'Story IR must be a StoryDocument version 4.0');
  const metadata = story.metadata;
  if (
    !isRecord(metadata) ||
    metadata.sourceId !== dsl4CompiledStorySourceId ||
    Object.keys(metadata).some((key) => !compiledMetadataKeys.has(key)) ||
    (Object.hasOwn(metadata, 'sourceVersion') && metadata.sourceVersion !== '4.0') ||
    (Object.hasOwn(metadata, 'narrativeControl') && metadata.narrativeControl !== true) ||
    (Object.hasOwn(metadata, 'implicitProjectActors') &&
      (!Array.isArray(metadata.implicitProjectActors) ||
        !isRecord(story.actors) ||
        metadata.implicitProjectActors.some(
          (name) =>
            typeof name !== 'string' ||
            !Object.hasOwn(story.actors as Record<string, unknown>, name),
        )))
  )
    fail('K4-COMPILED-STORY-SOURCE-001', 'Story IR metadata must only name the compiled source');
  if (
    metadata.implicitProjectAssets !== undefined &&
    (!Array.isArray(metadata.implicitProjectAssets) ||
      !isRecord(story.assets) ||
      metadata.implicitProjectAssets.some(
        (id) =>
          typeof id !== 'string' || !Object.hasOwn(story.assets as Record<string, unknown>, id),
      ))
  )
    fail('K4-COMPILED-STORY-001', 'Implicit project asset metadata must name existing assets');
  if (!Array.isArray(story.scenes) || story.scenes.length === 0)
    fail('K4-COMPILED-STORY-001', 'Story IR must contain scenes');
  const sceneIds = new Set<string>();
  for (const scene of story.scenes) {
    if (
      !isRecord(scene) ||
      scene.kind !== 'Scene' ||
      typeof scene.id !== 'string' ||
      !Array.isArray(scene.actions)
    )
      fail('K4-COMPILED-STORY-001', 'Story IR scene is malformed');
    if (sceneIds.has(scene.id))
      fail('K4-COMPILED-STORY-001', `Story IR scene is duplicated: ${scene.id}`);
    sceneIds.add(scene.id);
    for (const action of scene.actions) {
      if (
        !isRecord(action) ||
        action.kind !== 'Action' ||
        typeof action.id !== 'string' ||
        typeof action.command !== 'string' ||
        !isRecord(action.args)
      )
        fail('K4-COMPILED-STORY-001', `Story IR action is malformed in scene ${scene.id}`);
    }
  }
  const invalidated = metadata.invalidatedRecognitionScenes;
  if (
    invalidated !== undefined &&
    (metadata.narrativeControl !== true ||
      !Array.isArray(invalidated) ||
      invalidated.some((id) => typeof id !== 'string' || !sceneIds.has(id)) ||
      new Set(invalidated).size !== invalidated.length)
  )
    fail(
      'K4-COMPILED-STORY-001',
      'Invalidated recognition metadata must name unique existing narrative scenes',
    );
  for (const field of [
    'assets',
    'actors',
    'textStyles',
    'bubbleStyles',
    'bubbleClosePolicies',
    'variables',
    'branches',
  ]) {
    if (!isRecord(story[field])) fail('K4-COMPILED-STORY-001', `Story IR ${field} must be a map`);
  }
}

function serializeStory(story: unknown) {
  const text = JSON.stringify(story);
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength > maxStoryBytes)
    fail('K4-COMPILED-STORY-SIZE-001', `Story IR exceeds the ${maxStoryBytes} byte limit`);
  return bytes;
}

/**
 * Keep the story's cache id and database name, but not its label.
 *
 * The label is the source file's basename. The id and database name are the persisted identity the
 * author chose once, so keeping them lets verified remote caches carry over between profiles.
 */
function compiledCacheIdentity(input: unknown) {
  const identity = validateDsl4CacheIdentity(input);
  return validateDsl4CacheIdentity({...identity, label: dsl4CompiledStorySourceId});
}

/**
 * Compile a StoryDocument the frontend already accepted into its Story IR.
 *
 * The input must be the frontend's own successful result: compiling does not validate a story, it
 * only removes what the runtime never reads. Narrative origins stay: the runtime emits them as
 * story positions, and they name scenes and indexes rather than files or lines.
 */
export async function createDsl4CompiledStoryArtifact(
  storyDocument: Readonly<Record<string, unknown>>,
  {
    sourceIntegrity,
    cacheIdentity,
    subtleCrypto = globalThis.crypto?.subtle,
  }: {
    sourceIntegrity: string;
    cacheIdentity?: unknown;
    subtleCrypto?: Dsl4SubtleCrypto | undefined;
  },
) {
  if (storyDocument.kind !== 'StoryDocument' || storyDocument.version !== '4.0')
    fail('K4-COMPILED-STORY-001', 'Only a DSL 4.0 StoryDocument can be compiled');
  if (typeof sourceIntegrity !== 'string' || !sourceIntegrity.startsWith('sha256-'))
    fail('K4-COMPILED-STORY-001', 'sourceIntegrity must be a SHA-256 integrity');
  // The JSON round trip is the stored form: what is hashed here is exactly what a player reads.
  const story = JSON.parse(JSON.stringify(stripAuthoring(storyDocument))) as Record<
    string,
    unknown
  >;
  const metadata = isRecord(storyDocument.metadata) ? storyDocument.metadata : {};
  story.metadata = {
    sourceId: dsl4CompiledStorySourceId,
    ...(metadata.sourceVersion === undefined ? {} : {sourceVersion: metadata.sourceVersion}),
    ...(metadata.narrativeControl === undefined
      ? {}
      : {narrativeControl: metadata.narrativeControl}),
    ...(metadata.invalidatedRecognitionScenes === undefined
      ? {}
      : {invalidatedRecognitionScenes: metadata.invalidatedRecognitionScenes}),
    ...(metadata.implicitProjectActors === undefined
      ? {}
      : {implicitProjectActors: metadata.implicitProjectActors}),
    ...(metadata.implicitProjectAssets === undefined
      ? {}
      : {implicitProjectAssets: metadata.implicitProjectAssets}),
  };
  assertStoryIr(story, '$.story');
  assertStoryShape(story);
  const storyIntegrity = await computeDsl4Sha256Integrity(serializeStory(story), subtleCrypto);
  return deepFreeze({
    formatVersion: dsl4CompiledStoryArtifactFormatVersion,
    profile: 'compiled' as const,
    sourceIntegrity,
    storyIntegrity,
    story,
    ...(cacheIdentity === undefined ? {} : {cacheIdentity: compiledCacheIdentity(cacheIdentity)}),
  });
}

export type Dsl4CompiledStoryArtifact = Awaited<ReturnType<typeof createDsl4CompiledStoryArtifact>>;

/**
 * Check a Story IR on its own: plain JSON, no authoring members, and the StoryDocument structure.
 *
 * Synchronous, so a caller that has already verified the bytes or that cannot await can still refuse
 * a malformed story.
 */
export function validateDsl4StoryIr(story: unknown) {
  if (!isRecord(story)) fail('K4-COMPILED-STORY-001', 'Story IR must be an object');
  assertStoryIr(story, '$.story');
  assertStoryShape(story);
  return story as Readonly<Record<string, unknown>>;
}

/**
 * Read a compiled story artifact's envelope and Story IR without checking its digest.
 *
 * Everything `validateDsl4CompiledStoryArtifact` checks except `storyIntegrity`; use that one
 * wherever the bytes have not been verified some other way.
 */
export function readDsl4CompiledStoryArtifact(input: unknown) {
  let value;
  try {
    value = decodeDsl4Envelope(input, {
      kind: 'compiledArtifact',
      requiredKeys: ['profile', 'sourceIntegrity', 'storyIntegrity', 'story'],
      optionalKeys: ['cacheIdentity'],
    });
  } catch (error) {
    if (error instanceof Dsl4FormatError) fail(error.code, error.message);
    throw error;
  }
  if (dsl4FormatVersions.compiledArtifact !== dsl4CompiledStoryArtifactFormatVersion)
    throw new TypeError('Compiled artifact format index is inconsistent');
  if (value.profile !== 'compiled')
    fail('K4-COMPILED-STORY-001', 'Compiled artifact profile must be compiled');
  for (const key of ['sourceIntegrity', 'storyIntegrity'] as const) {
    if (typeof value[key] !== 'string' || !/^sha256-[A-Za-z0-9+/]{43}=$/u.test(value[key]))
      fail('K4-COMPILED-STORY-001', `${key} must be a SHA-256 integrity`);
  }
  const story = validateDsl4StoryIr(value.story);
  const cacheIdentity =
    value.cacheIdentity === undefined ? undefined : validateDsl4CacheIdentity(value.cacheIdentity);
  return deepFreeze({
    formatVersion: dsl4CompiledStoryArtifactFormatVersion,
    profile: 'compiled' as const,
    sourceIntegrity: value.sourceIntegrity as string,
    storyIntegrity: value.storyIntegrity as string,
    story: structuredClone(story),
    ...(cacheIdentity === undefined ? {} : {cacheIdentity}),
  });
}

/**
 * Read a compiled story artifact without the YAML frontend.
 *
 * Fails closed on the envelope, on anything that is not plain JSON or still carries authoring
 * data, on the StoryDocument structure the runtime reads, and on the digest. Story semantics were
 * checked by the frontend at build time and are bound by the digest; the runtime descriptor checks
 * (control profile, keymap) run again in the loader as they do for source.
 */
export async function validateDsl4CompiledStoryArtifact(
  input: unknown,
  {subtleCrypto = globalThis.crypto?.subtle}: {subtleCrypto?: Dsl4SubtleCrypto | undefined} = {},
) {
  const artifact = readDsl4CompiledStoryArtifact(input);
  const integrity = await computeDsl4Sha256Integrity(serializeStory(artifact.story), subtleCrypto);
  if (integrity !== artifact.storyIntegrity)
    fail('K4-COMPILED-STORY-INTEGRITY-001', 'Story IR does not match its integrity');
  return artifact;
}

/** Find the one compiled story a project stores, by the same bundled/unbundled channels as source. */
export function findDsl4CompiledStory(project: unknown) {
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
    {
      channel: 'unbundled' as const,
      artifact: runtime.compiled,
      path: dsl4CompiledStoryStoragePaths.unbundled,
    },
    {
      channel: 'bundled' as const,
      artifact: bundled.compiled,
      path: dsl4CompiledStoryStoragePaths.bundled,
    },
  ].filter(({artifact}) => artifact !== undefined);
  if (found.length > 1)
    fail(
      'K4-COMPILED-STORY-CHANNEL-AMBIGUOUS',
      'DSL 4.0 compiled story exists in both bundled and unbundled storage',
    );
  return found[0] ?? null;
}
