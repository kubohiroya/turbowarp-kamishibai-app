import {deepFreeze} from '../story-document.js';
import {canonicalizeDsl4Source} from '../source-canonicalizer.js';
import {createDsl4PublicationSourceProvider} from '../publication-loader.js';
import {dsl4CompiledPublicationEntry} from '../compiled-project.js';
import {readDsl4CompiledStoryArtifact} from '../compiled-story-artifact.js';
import {
  createDsl4SealedKeyCache,
  createDsl4SealedStoryArtifact,
  type Dsl4SealCrypto,
  type Dsl4SealedKeyCache,
  type Dsl4SealedUnlock,
  openDsl4SealedStoryWithUnlock,
  readDsl4SealedStoryHeader,
} from '../sealed-story-artifact.js';
import {validateDsl4PublicationManifest} from '../publication-manifest.js';
import type {Dsl4SourceFrontend} from '../source-frontend.js';
import {buildDsl4BrowserSelectedStoryProject} from './browser-story-file-loader.js';
import {
  assertDsl4PublicationResidentBudget,
  type Dsl4PublicationResidentLimits,
} from './publication-resident-budget.js';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Invalid publication project record');
  return value as Record<string, unknown>;
}
export function readDsl4ProjectPublication(project: unknown) {
  const storage = record(project).extensionStorage as Record<string, unknown> | undefined;
  const bundle = storage?.kubohiroyakamishibai4 as Record<string, unknown> | undefined;
  return bundle?.publication ?? null;
}

/**
 * The single-story runtime components stored beside the publication, in either storage channel.
 * The builder keeps the entry chapter there so title, camera and application-mode readers work.
 */
function projectEntryComponents(project: unknown) {
  const storage = record(project).extensionStorage as Record<string, unknown> | undefined;
  const bundle = storage?.kubohiroyakamishibai4 as Record<string, unknown> | undefined;
  const components = bundle?.components as Record<string, unknown> | undefined;
  return [components?.kubohiroyakamishibairuntime4, storage?.kubohiroyakamishibairuntime4].filter(
    (component) => component !== undefined,
  );
}
const assetFileIntegrity = /^sha256-[A-Za-z0-9+/]{43}=$/u;

function componentAssetFiles(component: unknown): Record<string, unknown>[] {
  const assets = record(component).assets;
  if (!assets || typeof assets !== 'object' || Array.isArray(assets)) return [];
  const files = (assets as Record<string, unknown>).files;
  return Array.isArray(files) ? (files as Record<string, unknown>[]) : [];
}

/**
 * formatVersion 2 keeps each embedded asset file once in `assetFiles`, keyed by its integrity.
 * Components keep the per-file metadata (assetId, path, size, integrity) without `data`.
 */
function dedupePublicationComponent(component: unknown, assetFiles: Record<string, string>) {
  const result = structuredClone(record(component));
  for (const file of componentAssetFiles(result)) {
    if (file.encoding !== 'base64' || typeof file.data !== 'string') continue;
    const integrity = String(file.integrity);
    if (integrity in assetFiles && assetFiles[integrity] !== file.data)
      throw new TypeError(`Publication asset files disagree for ${integrity}`);
    assetFiles[integrity] = file.data;
    delete file.data;
  }
  return result;
}

/**
 * Restore the stored component of one chapter. The restored bundle is byte-for-byte the one the
 * chapter was built with, so the component loader still verifies bundle integrity and every
 * file's size and SHA-256 before any asset is used.
 */
function restorePublicationComponent(
  component: unknown,
  assetFiles: Readonly<Record<string, string>>,
) {
  const result = structuredClone(record(component));
  for (const file of componentAssetFiles(result)) {
    if (file.encoding !== 'base64' || 'data' in file) continue;
    const data = assetFiles[String(file.integrity)];
    if (typeof data !== 'string') throw new TypeError('Publication asset file is missing');
    file.data = data;
  }
  return result;
}

export function publicationSegmentProject(
  project: unknown,
  component: unknown,
  assetFiles: Readonly<Record<string, string>> = {},
) {
  const result = structuredClone(record(project));
  const storage = record(result.extensionStorage);
  delete storage.kubohiroyakamishibairuntime4;
  const bundle = record(storage.kubohiroyakamishibai4);
  delete bundle.publication;
  bundle.components = {
    ...record(bundle.components),
    kubohiroyakamishibairuntime4: restorePublicationComponent(component, assetFiles),
  };
  return result;
}

/** Select publication.json together with its chapter sources and assets using the normal folder route. */
export async function buildDsl4BrowserSelectedPublicationProject(
  options: Parameters<typeof buildDsl4BrowserSelectedStoryProject>[0],
) {
  const selected = options.entries.filter(
    (entry) =>
      (entry.path ?? (entry.file as {name: string}).name).split('/').at(-1) === 'publication.json',
  );
  if (selected.length !== 1) throw new TypeError('Select exactly one publication.json');
  const manifestEntry = selected[0]!;
  const manifestPath = manifestEntry.path ?? (manifestEntry.file as {name: string}).name;
  const directory = manifestPath.slice(0, manifestPath.length - 'publication.json'.length);
  const manifestFile = manifestEntry.file as {size: number; arrayBuffer(): Promise<ArrayBuffer>};
  if (manifestFile.size > options.maxSourceBytes)
    throw new TypeError('Publication manifest exceeds maxSourceBytes');
  const bytes = new Uint8Array(await manifestFile.arrayBuffer());
  if (bytes.length > options.maxSourceBytes)
    throw new TypeError('Publication manifest exceeds maxSourceBytes');
  const manifest = validateDsl4PublicationManifest(
    JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)),
  );
  const entries = new Map(
    options.entries.map((entry) => [entry.path ?? (entry.file as {name: string}).name, entry]),
  );
  const sourcePaths = new Set(manifest.segments.map((segment) => directory + segment.source.entry));
  const sources: Record<string, string> = Object.create(null);
  let publicationBytes = 0;
  const components: Record<string, unknown> = Object.create(null);
  // The manifest digest covers original source bytes, before source-descriptor canonicalization.
  for (const segment of manifest.segments) {
    const source = entries.get(directory + segment.source.entry);
    if (!source) throw new TypeError(`Missing publication source: ${segment.source.entry}`);
    const file = source.file as {size: number; arrayBuffer(): Promise<ArrayBuffer>};
    if (file.size !== segment.source.size || file.size > options.maxSourceBytes)
      throw new TypeError('Publication source size mismatch');
    publicationBytes += file.size;
    if (publicationBytes > options.maxTotalAssetBytes)
      throw new TypeError('Publication sources exceed total byte limit');
    sources[segment.source.entry] = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(
      await file.arrayBuffer(),
    );
  }
  const provider = createDsl4PublicationSourceProvider({
    mode: 'offline',
    readEntry: async (entry) => new TextEncoder().encode(sources[entry]!),
  });
  let entryProject:
    Awaited<ReturnType<typeof buildDsl4BrowserSelectedStoryProject>>['project'] | null = null;
  let entryDocument:
    Awaited<ReturnType<typeof buildDsl4BrowserSelectedStoryProject>>['storyDocument'] | null = null;
  let componentBytes = 0;
  const assetFiles: Record<string, string> = Object.create(null);
  for (const segment of manifest.segments) {
    await provider.read(segment);
    const sourcePath = directory + segment.source.entry;
    const assets = options.entries.filter((entry) => {
      const path = entry.path ?? (entry.file as {name: string}).name;
      return !path.endsWith('/publication.json') && !sourcePaths.has(path) && path !== manifestPath;
    });
    const built = await buildDsl4BrowserSelectedStoryProject({
      ...options,
      entries: [...assets, entries.get(sourcePath)!],
    });
    const storage = record(record(built.project.extensionStorage).kubohiroyakamishibai4);
    const sharedBefore = new Set(Object.keys(assetFiles));
    components[segment.id] = dedupePublicationComponent(
      record(storage.components).kubohiroyakamishibairuntime4,
      assetFiles,
    );
    componentBytes += new TextEncoder().encode(JSON.stringify(components[segment.id])).length;
    for (const [integrity, data] of Object.entries(assetFiles))
      if (!sharedBefore.has(integrity)) componentBytes += data.length;
    if (componentBytes > options.maxTotalAssetBytes * 2)
      throw new TypeError('Publication components exceed total byte limit');
    if (segment.id === manifest.entrySegment) {
      entryProject = built.project;
      entryDocument = built.storyDocument;
    }
  }
  if (!entryProject || !entryDocument) throw new TypeError('Publication entry is missing');
  const entryStorage = record(record(entryProject.extensionStorage).kubohiroyakamishibai4);
  // The entry component keeps its metadata for the single-story readers; its files live in assetFiles.
  record(entryStorage.components).kubohiroyakamishibairuntime4 = structuredClone(
    components[manifest.entrySegment],
  );
  entryStorage.publication = {
    formatVersion: 2,
    manifest,
    sources,
    assetFiles,
    components,
  };
  validateDsl4PublicationProject(entryProject, options.sourceFrontend);
  return Object.freeze({
    project: entryProject,
    sourcePath: manifestPath,
    storyDocument: entryDocument,
  });
}

/** The scenario chapter links a chapter's actions request; each must be one of its manifest `next`. */
export function assertDsl4ChapterLinks(
  segment: {id: string; next: readonly string[]},
  storyDocument: Readonly<Record<string, unknown>>,
) {
  const scenes = storyDocument.scenes as readonly {
    actions: readonly {command: string; args: Record<string, unknown>}[];
  }[];
  for (const action of scenes.flatMap((scene) => scene.actions)) {
    if (action.command === 'gotoSegment' && !segment.next.includes(String(action.args.segment)))
      throw new TypeError(`Chapter ${segment.id} gotoSegment must reference a manifest next link`);
  }
}

/**
 * Validate the publication a project carries. For formatVersion 2 this also covers the entry
 * component stored beside it: it must not hold asset data, and it counts toward the budget.
 */
export function validateDsl4PublicationProject(
  project: unknown,
  frontend: Dsl4SourceFrontend,
  limits?: Dsl4PublicationResidentLimits,
) {
  return validateDsl4ProjectPublication(
    readDsl4ProjectPublication(project),
    frontend,
    limits,
    projectEntryComponents(project),
  );
}

export function validateDsl4ProjectPublication(
  input: unknown,
  frontend: Dsl4SourceFrontend,
  limits?: Dsl4PublicationResidentLimits,
  entryComponents: readonly unknown[] = [],
) {
  const publication = record(input);
  // Version 1 (rc.49 and earlier) embeds asset data in every component; version 2 shares it.
  if (publication.formatVersion !== 1 && publication.formatVersion !== 2)
    throw new TypeError('Unsupported publication project version');
  if (
    publication.profile !== undefined &&
    publication.profile !== 'compiled' &&
    publication.profile !== 'sealed'
  )
    throw new TypeError('Unsupported publication distribution profile');
  const compiled = publication.profile === 'compiled';
  const sealed = publication.profile === 'sealed';
  // Version 1 keeps its entry component outside the budget, as rc.49 did.
  const residentEntryComponents = publication.formatVersion === 2 ? entryComponents : [];
  // Bound everything the project keeps resident before parsing any chapter.
  const resident = assertDsl4PublicationResidentBudget(
    publication,
    limits,
    residentEntryComponents,
  );
  const manifest = validateDsl4PublicationManifest(publication.manifest);
  const components = record(publication.components);
  const assetFiles: Record<string, string> = Object.create(null);
  if (publication.formatVersion === 2) {
    for (const [integrity, data] of Object.entries(record(publication.assetFiles))) {
      if (!assetFileIntegrity.test(integrity) || typeof data !== 'string')
        throw new TypeError('Invalid publication asset file');
      assetFiles[integrity] = data;
    }
    const used = new Set<string>();
    for (const segment of manifest.segments) {
      for (const file of componentAssetFiles(components[segment.id])) {
        if (file.encoding !== 'base64') continue;
        if ('data' in file || !(String(file.integrity) in assetFiles))
          throw new TypeError('Publication component asset file must reference assetFiles');
        used.add(String(file.integrity));
      }
    }
    if (used.size !== Object.keys(assetFiles).length)
      throw new TypeError('Publication assetFiles contains an unreferenced file');
    for (const component of entryComponents) {
      for (const file of componentAssetFiles(component)) {
        if (file.encoding !== 'base64') continue;
        if ('data' in file || !(String(file.integrity) in assetFiles))
          throw new TypeError('Publication entry component asset file must reference assetFiles');
      }
    }
  }
  if (sealed) {
    // Every chapter, and the entry component beside the publication, is sealed under one salt
    // and iteration count, so one password opens them all. Nothing readable is shared.
    if (publication.sources !== undefined)
      throw new TypeError('A sealed publication must not keep chapter sources');
    if (Object.keys(assetFiles).length > 0)
      throw new TypeError('A sealed publication must not share readable asset files');
    let derivation: string | null = null;
    const sealedComponent = (component: Record<string, unknown>, name: string) => {
      for (const key of ['source', 'compiled', 'assets', 'assetDistribution'])
        if (component[key] !== undefined)
          throw new TypeError(`A sealed ${name} must not keep ${key}`);
      const {keyDerivation} = readDsl4SealedStoryHeader(component.sealed).header;
      const id = `${keyDerivation.iterations}|${keyDerivation.salt}`;
      if (derivation !== null && derivation !== id)
        throw new TypeError('A sealed publication must use one password for every chapter');
      derivation = id;
    };
    for (const segment of manifest.segments) {
      if (segment.source.entry !== dsl4CompiledPublicationEntry(segment.id) || segment.source.url)
        throw new TypeError('Sealed publication chapter must name its own Story IR');
      // Chapter links are checked when the chapter is decrypted (`readDsl4SealedPublicationChapter`).
      sealedComponent(record(components[segment.id]), `chapter ${segment.id}`);
    }
    for (const component of entryComponents) sealedComponent(record(component), 'entry component');
    return deepFreeze({
      manifest,
      profile: 'sealed' as const,
      sources: {} as Record<string, string>,
      components: structuredClone(components),
      assetFiles,
      resident,
    });
  }
  if (compiled) {
    // No YAML anywhere: each chapter is its component's Story IR, named by segment id.
    if (publication.sources !== undefined)
      throw new TypeError('A compiled publication must not keep chapter sources');
    for (const segment of manifest.segments) {
      const component = record(components[segment.id]);
      if (component.source !== undefined)
        throw new TypeError('A compiled publication chapter must not keep its source');
      if (segment.source.entry !== dsl4CompiledPublicationEntry(segment.id) || segment.source.url)
        throw new TypeError('Compiled publication chapter must name its own Story IR');
      // The digest is checked against the manifest when the chapter is read.
      assertDsl4ChapterLinks(segment, readDsl4CompiledStoryArtifact(component.compiled).story);
    }
    return deepFreeze({
      manifest,
      profile: 'compiled' as const,
      sources: {} as Record<string, string>,
      components: structuredClone(components),
      assetFiles,
      resident,
    });
  }
  const sources = record(publication.sources);
  for (const segment of manifest.segments) {
    const source = sources[segment.source.entry];
    const component = record(components[segment.id]);
    if (
      typeof source !== 'string' ||
      record(component.source).text !== canonicalizeDsl4Source(source)
    )
      throw new TypeError('Publication component source does not match manifest source');
    // Reject malformed chapters before exposing a chapter selector. Runtime artifact/bundle
    // validation is repeated by the host when a candidate is prepared.
    const parsed = frontend.parse(source, {sourceId: segment.source.entry});
    if (!parsed.ok) throw new TypeError('Invalid publication chapter');
    assertDsl4ChapterLinks(segment, parsed.storyDocument);
  }
  return deepFreeze({
    manifest,
    profile: 'source' as const,
    sources: {...sources} as Record<string, string>,
    components: structuredClone(components),
    assetFiles,
    resident,
  });
}

/**
 * The text a publication chapter's manifest entry names: its YAML source, or under the compiled
 * profile the JSON of its Story IR.
 */
export function readDsl4PublicationChapterText(
  publication: ReturnType<typeof validateDsl4ProjectPublication>,
  entry: string,
) {
  if (publication.profile === 'source') return publication.sources[entry];
  const segment = publication.manifest.segments.find((item) => item.source.entry === entry);
  if (!segment) return undefined;
  const component = publication.components[segment.id] as Record<string, unknown>;
  return JSON.stringify(readDsl4CompiledStoryArtifact(component.compiled).story);
}

/**
 * Decrypt one chapter of a sealed publication and check it the way a compiled chapter is checked
 * when opened: its Story IR, and that each `gotoSegment` is one of its manifest `next` links.
 * Returns the Story IR's JSON, which the manifest digest then verifies, or `null` when the viewer
 * declined to give the password.
 */
export async function readDsl4SealedPublicationChapter(
  publication: ReturnType<typeof validateDsl4ProjectPublication>,
  entry: string,
  unlock: Dsl4SealedUnlock,
  options: {keyCache?: Dsl4SealedKeyCache; crypto?: Dsl4SealCrypto} = {},
) {
  const segment = publication.manifest.segments.find((item) => item.source.entry === entry);
  if (!segment) return undefined;
  const component = publication.components[segment.id] as Record<string, unknown>;
  const opened = await openDsl4SealedStoryWithUnlock(component.sealed, unlock, options);
  if (opened === null) return null;
  assertDsl4ChapterLinks(segment, opened.compiled.story);
  return JSON.stringify(opened.compiled.story);
}

/**
 * Turn a project carrying a `compiled` publication into the `sealed` profile, in place.
 *
 * Every chapter seals its compiled story together with its own assets (restored from the shared
 * `assetFiles`, which a sealed publication cannot keep readable), all under one fresh salt so the
 * viewer's password derives one key. The entry component beside the publication is sealed the same
 * way. The manifest is unchanged: it names each chapter's Story IR digest, checked after decryption.
 */
export async function convertDsl4PublicationToSealedProfile(
  project: Record<string, unknown>,
  password: string,
  options: {iterations?: number; crypto?: Dsl4SealCrypto} = {},
) {
  const publication = record(readDsl4ProjectPublication(project));
  if (publication.profile !== 'compiled')
    throw new TypeError('Only a compiled publication can be sealed');
  const manifest = validateDsl4PublicationManifest(publication.manifest);
  const assetFiles = (
    publication.formatVersion === 2 ? record(publication.assetFiles) : {}
  ) as Record<string, string>;
  const crypto = options.crypto ?? (globalThis.crypto as unknown as Dsl4SealCrypto);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyCache = createDsl4SealedKeyCache();
  const seal = async (input: unknown) => {
    const component = restorePublicationComponent(input, assetFiles);
    const sealedArtifact = await createDsl4SealedStoryArtifact(
      {compiled: record(component.compiled), assets: component.assets},
      password,
      {...options, crypto, salt, keyCache},
    );
    delete component.compiled;
    delete component.assets;
    component.sealed = structuredClone(sealedArtifact);
    return component;
  };
  const components = record(publication.components);
  for (const segment of manifest.segments)
    components[segment.id] = await seal(components[segment.id]);
  const storage = record(project.extensionStorage);
  const bundle = record(storage.kubohiroyakamishibai4);
  if (
    isPlainRecord(bundle.components) &&
    bundle.components.kubohiroyakamishibairuntime4 !== undefined
  )
    bundle.components.kubohiroyakamishibairuntime4 = await seal(
      bundle.components.kubohiroyakamishibairuntime4,
    );
  if (storage.kubohiroyakamishibairuntime4 !== undefined)
    storage.kubohiroyakamishibairuntime4 = await seal(storage.kubohiroyakamishibairuntime4);
  if (publication.formatVersion === 2) publication.assetFiles = {};
  publication.profile = 'sealed';
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
