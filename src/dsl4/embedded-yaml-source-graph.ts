import {rebindDsl4AssetBundleReferences} from './asset-bundle-references.js';
import {createDsl4SourceGraph, dsl4SourceGraphDefaultLimits} from './source-graph.js';
import {createDsl4SourceGraphFrontend} from './source-graph-frontend.js';
import {dsl4StandardProductionFeatureFlags} from './feature-flags.js';
import {
  createDsl4EmbeddedSourceDescriptor,
  computeDsl4Sha256Integrity,
} from './source-descriptor.js';
import {
  createDsl4RuntimeArtifactDescriptor,
  type RuntimeArtifactSuccess,
} from './runtime-artifact-descriptor.js';
import {validateDsl4AssetDistributionResolution} from './asset-distribution-profile.js';
import {hasDsl4SourceFilenameSuffix} from './source-filename.js';
import {validateEmbeddedYamlRelativePath} from '@kubohiroya/turbowarp-document-source';
import type {Dsl4SourceFrontend} from './source-frontend.js';
import type {Dsl4SubtleCrypto} from './subtle-crypto.js';
export interface EmbeddedYamlSourceGraphFile {
  readonly source: string;
  readonly byteLength: number;
  readonly integrity: string;
}
export interface EmbeddedYamlSourceGraphRecord {
  readonly formatVersion: 1;
  readonly entryPath: string;
  readonly files: Readonly<Record<string, EmbeddedYamlSourceGraphFile>>;
  readonly integrity: string;
}
export interface GraphComponentOptions {
  readonly project?: unknown;
  readonly historyNavigationAvailable?: boolean;
  readonly subtleCrypto?: Dsl4SubtleCrypto;
}
export const embeddedYamlSourceGraphLimits = Object.freeze({
  ...dsl4SourceGraphDefaultLimits,
  maxPathCodeUnits: 1000,
});
type ObjectRecord = Record<string, unknown>;
const encoder = new TextEncoder(),
  shapeRecords = new WeakSet<object>(),
  validatedRecords = new WeakSet<object>();
const plain = (value: unknown): value is ObjectRecord =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), {code});
}
function exact(
  value: unknown,
  keys: readonly string[],
  name: string,
): asserts value is ObjectRecord {
  if (
    !plain(value) ||
    Object.getOwnPropertySymbols(value).length ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key)) ||
    Object.values(Object.getOwnPropertyDescriptors(value)).some(
      (d) => !Object.hasOwn(d, 'value') || !d.enumerable,
    )
  )
    fail('K4-SOURCE-DOCUMENTS-SHAPE', `${name} must be a plain record with the required fields.`);
}
function pathName(input: unknown): string {
  if (
    typeof input !== 'string' ||
    !input ||
    input.length > 1000 ||
    /[\\\u0000-\u001f\u007f]/u.test(input) ||
    input.startsWith('/') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(input)
  )
    fail('K4-SOURCE-DOCUMENTS-PATH', 'Source paths must be bounded relative POSIX paths.');
  const segments: string[] = [];
  for (const segment of input.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (!segments.length)
        fail('K4-SOURCE-DOCUMENTS-PATH', 'Source paths cannot escape the project root.');
      segments.pop();
    } else segments.push(segment);
  }
  const result = segments.join('/');
  try {
    validateEmbeddedYamlRelativePath(result);
  } catch {
    fail('K4-SOURCE-DOCUMENTS-PATH', 'Source filenames must be nonempty portable names.');
  }
  if (!result || result.length > 1000 || !hasDsl4SourceFilenameSuffix(result))
    fail('K4-SOURCE-DOCUMENTS-PATH', 'Source paths must use a DSL 4.0 source filename suffix.');
  return result;
}
function rawText(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    Array.from(value).some((char) => {
      const code = char.codePointAt(0)!;
      return code >= 0xd800 && code <= 0xdfff;
    })
  )
    fail('K4-SOURCE-DOCUMENTS-TEXT', 'Source files must contain valid UTF-8 text.');
}
const sri = (value: unknown): value is string =>
  typeof value === 'string' && /^sha256-[A-Za-z0-9+/]{43}=$/u.test(value);
/** Cheap synchronous shape/size reader; cryptographic and graph checks are asynchronous. */
export function readEmbeddedYamlSourceGraphRecord(input: unknown): EmbeddedYamlSourceGraphRecord {
  if (plain(input) && shapeRecords.has(input))
    return input as unknown as EmbeddedYamlSourceGraphRecord;
  exact(input, ['formatVersion', 'entryPath', 'files', 'integrity'], 'sourceDocuments');
  if (
    input.formatVersion !== 1 ||
    !sri(input.integrity) ||
    !plain(input.files) ||
    Object.getOwnPropertySymbols(input.files).length ||
    Object.getOwnPropertyNames(input.files).length !== Object.keys(input.files).length
  )
    fail('K4-SOURCE-DOCUMENTS-SHAPE', 'Unsupported source document graph record.');
  const entryPath = pathName(input.entryPath);
  if (entryPath !== input.entryPath)
    fail('K4-SOURCE-DOCUMENTS-PATH', 'Stored paths must already be normalized.');
  const names = Object.keys(input.files).sort(),
    files: Record<string, EmbeddedYamlSourceGraphFile> = {},
    portable = new Set<string>();
  let total = 0;
  if (!names.length || names.length > embeddedYamlSourceGraphLimits.maxSourceFiles)
    fail('K4-SOURCE-DOCUMENTS-LIMIT', 'The source file count exceeds its limit.');
  for (const name of names) {
    if (pathName(name) !== name)
      fail('K4-SOURCE-DOCUMENTS-PATH', 'Stored paths must already be normalized.');
    const identity = name.normalize('NFC').toLowerCase();
    if (portable.has(identity))
      fail(
        'K4-SOURCE-DOCUMENTS-CONFLICT',
        'Source file paths conflict after portable normalization.',
      );
    portable.add(identity);
    const descriptor = Object.getOwnPropertyDescriptor(input.files, name);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable)
      fail('K4-SOURCE-DOCUMENTS-SHAPE', 'File records cannot use accessors.');
    const file = descriptor.value;
    exact(file, ['source', 'byteLength', 'integrity'], 'source file');
    rawText(file.source);
    const byteLength = encoder.encode(file.source).byteLength;
    if (file.byteLength !== byteLength || !sri(file.integrity))
      fail('K4-SOURCE-DOCUMENTS-SHAPE', 'A file byte length or integrity field is invalid.');
    if (
      byteLength > embeddedYamlSourceGraphLimits.maxSourceBytes ||
      (total += byteLength) > embeddedYamlSourceGraphLimits.maxTotalSourceBytes
    )
      fail('K4-SOURCE-DOCUMENTS-LIMIT', 'Raw source bytes exceed their file or project limit.');
    Object.defineProperty(files, name, {
      value: Object.freeze({
        source: file.source,
        byteLength,
        integrity: file.integrity,
      }),
      enumerable: true,
    });
  }
  if (!Object.hasOwn(files, entryPath))
    fail('K4-SOURCE-DOCUMENTS-ENTRY', 'The entry source file is missing.');
  const result = Object.freeze({
    formatVersion: 1 as const,
    entryPath,
    files: Object.freeze(files),
    integrity: input.integrity,
  });
  shapeRecords.add(result);
  return result;
}
async function topology(record: EmbeddedYamlSourceGraphRecord) {
  const covered = new Set<string>();
  let entryGraph: Awaited<ReturnType<typeof createDsl4SourceGraph>> | undefined;
  for (const name of [
    record.entryPath,
    ...Object.keys(record.files).filter((path) => path !== record.entryPath),
  ]) {
    if (covered.has(name)) continue;
    const graph = await createDsl4SourceGraph(name, {
      limits: dsl4SourceGraphDefaultLimits,
      readSource(path) {
        if (!Object.hasOwn(record.files, path))
          fail('K4-SOURCE-DOCUMENTS-MISSING', `Included raw source is missing: ${path}`);
        return record.files[path]!.source;
      },
    }).catch((error: unknown) => {
      if (
        error instanceof Error &&
        'sourcePath' in error &&
        typeof error.sourcePath === 'string' &&
        !error.message.startsWith(`${error.sourcePath}:`)
      )
        error.message = `${error.sourcePath}: ${error.message}`;
      throw error;
    });
    for (const node of graph.nodes) if (node) covered.add(node.sourcePath);
    if (name === record.entryPath) entryGraph = graph;
  }
  return entryGraph!;
}
function content(record: Omit<EmbeddedYamlSourceGraphRecord, 'integrity'>) {
  return JSON.stringify({
    formatVersion: 1,
    entryPath: record.entryPath,
    files: Object.fromEntries(
      Object.keys(record.files)
        .sort()
        .map((path) => [path, record.files[path]]),
    ),
  });
}
/** Preserve exact strings, including BOM and CRLF, before the graph frontend normalizes them. */
export async function createEmbeddedYamlSourceGraphRecord(
  {
    entryPath: inputEntry,
    files: inputFiles,
    sources,
  }: {
    entryPath: string;
    files?: Readonly<Record<string, string>>;
    sources?: Readonly<Record<string, string>>;
  },
  {subtleCrypto}: {subtleCrypto?: Dsl4SubtleCrypto} = {},
) {
  if (inputFiles !== undefined && sources !== undefined)
    fail('K4-SOURCE-DOCUMENTS-SHAPE', 'Supply one raw source dictionary.');
  inputFiles = inputFiles ?? sources;
  if (
    !plain(inputFiles) ||
    Object.getOwnPropertySymbols(inputFiles).length ||
    Object.values(Object.getOwnPropertyDescriptors(inputFiles)).some(
      (d) => !Object.hasOwn(d, 'value') || !d.enumerable,
    )
  )
    fail('K4-SOURCE-DOCUMENTS-SHAPE', 'Raw source files must be a path-to-text dictionary.');
  const entryPath = pathName(inputEntry),
    files: Record<string, EmbeddedYamlSourceGraphFile> = {};
  if (Object.keys(inputFiles).length > 64)
    fail('K4-SOURCE-DOCUMENTS-LIMIT', 'Too many raw source files.');
  for (const [inputPath, source] of Object.entries(inputFiles)) {
    const path = pathName(inputPath);
    rawText(source);
    if (Object.hasOwn(files, path))
      fail('K4-SOURCE-DOCUMENTS-CONFLICT', 'Normalized source paths must be unique.');
    const bytes = encoder.encode(source);
    if (bytes.length > embeddedYamlSourceGraphLimits.maxSourceBytes)
      fail('K4-SOURCE-DOCUMENTS-LIMIT', 'A raw source file exceeds its limit.');
    Object.defineProperty(files, path, {
      value: {
        source,
        byteLength: bytes.length,
        integrity: await computeDsl4Sha256Integrity(bytes, subtleCrypto),
      },
      enumerable: true,
    });
  }
  const record = readEmbeddedYamlSourceGraphRecord({
    formatVersion: 1,
    entryPath,
    files,
    integrity: await computeDsl4Sha256Integrity(
      encoder.encode(content({formatVersion: 1, entryPath, files})),
      subtleCrypto,
    ),
  });
  await topology(record);
  validatedRecords.add(record);
  return record;
}
export async function validateEmbeddedYamlSourceGraphRecord(
  input: unknown,
  {subtleCrypto}: {subtleCrypto?: Dsl4SubtleCrypto} = {},
) {
  if (plain(input) && validatedRecords.has(input))
    return input as unknown as EmbeddedYamlSourceGraphRecord;
  const record = readEmbeddedYamlSourceGraphRecord(input);
  for (const file of Object.values(record.files))
    if (
      (await computeDsl4Sha256Integrity(encoder.encode(file.source), subtleCrypto)) !==
      file.integrity
    )
      fail('K4-SOURCE-DOCUMENTS-INTEGRITY', 'A raw source file no longer matches its integrity.');
  if (
    (await computeDsl4Sha256Integrity(encoder.encode(content(record)), subtleCrypto)) !==
    record.integrity
  )
    fail('K4-SOURCE-DOCUMENTS-INTEGRITY', 'The raw source graph no longer matches its integrity.');
  await topology(record);
  validatedRecords.add(record);
  return record;
}
export function graphDocumentId(input: unknown, path: string): string {
  const record = readEmbeddedYamlSourceGraphRecord(input),
    normalized = pathName(path);
  if (!Object.hasOwn(record.files, normalized))
    fail('K4-SOURCE-DOCUMENTS-UNKNOWN', 'No such raw source document.');
  return `file:${normalized}`;
}
export function graphDocumentPath(input: unknown, id: string): string {
  const record = readEmbeddedYamlSourceGraphRecord(input);
  if (typeof id !== 'string' || !id.startsWith('file:'))
    fail('K4-SOURCE-DOCUMENTS-UNKNOWN', 'Unknown source document ID.');
  const path = id.slice(5);
  if (pathName(path) !== path || !Object.hasOwn(record.files, path))
    fail('K4-SOURCE-DOCUMENTS-UNKNOWN', 'Unknown or noncanonical source document ID.');
  return path;
}
export const sourceGraphDocumentId = graphDocumentId,
  sourceGraphDocumentPath = graphDocumentPath;
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : plain(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
async function derive(
  component: ObjectRecord,
  input: unknown,
  frontend: Dsl4SourceFrontend,
  options: GraphComponentOptions,
) {
  const record = await validateEmbeddedYamlSourceGraphRecord(input, options),
    graph = await topology(record);
  if (
    !plain(component.source) ||
    typeof component.source.sourceId !== 'string' ||
    typeof component.source.displayName !== 'string' ||
    !plain(component.artifact) ||
    typeof component.artifact.controlProfile !== 'string'
  )
    fail('K4-SOURCE-DOCUMENTS-COMPONENT', 'A source runtime component is required.');
  const parsed = createDsl4SourceGraphFrontend(frontend).parse(graph, {
    featureFlags: dsl4StandardProductionFeatureFlags,
    sourceId: component.source.sourceId,
    maxComposedSourceBytes: embeddedYamlSourceGraphLimits.maxTotalSourceBytes,
    project: options.project,
  });
  if (!parsed.ok) {
    const first = parsed.diagnostics[0];
    const position = first?.range?.start;
    const location = first?.sourceId
      ? `${first.sourceId}${position ? `:${position.line}:${position.column}` : ''}: `
      : '';
    throw Object.assign(
      new Error(location + (first?.message || 'The raw source graph cannot be composed.')),
      {code: 'K4-SOURCE-DOCUMENTS-COMPOSE', diagnostics: parsed.diagnostics},
    );
  }
  const parsedStory = (parsed as unknown as {storyDocument: Readonly<Record<string, unknown>>})
    .storyDocument;
  if (!plain(parsedStory))
    fail('K4-SOURCE-DOCUMENTS-COMPOSE', 'A composed story document is required.');
  const story =
    component.assetDistribution === undefined
      ? parsedStory
      : validateDsl4AssetDistributionResolution(parsedStory, component.assetDistribution)
          .storyDocument;
  const source = await createDsl4EmbeddedSourceDescriptor(parsed.canonicalSource, {
    sourceId: component.source.sourceId,
    displayName: component.source.displayName,
    maxSourceBytes: embeddedYamlSourceGraphLimits.maxTotalSourceBytes,
    ...(component.source.cacheIdentity ? {cacheIdentity: component.source.cacheIdentity} : {}),
    sourceOrigins: parsedStory.sourceOrigins,
    subtleCrypto: options.subtleCrypto,
  });
  const artifact = await createDsl4RuntimeArtifactDescriptor(
    story,
    source,
    component.artifact.controlProfile,
    {
      maxSourceBytes: embeddedYamlSourceGraphLimits.maxTotalSourceBytes,
      historyNavigationAvailable:
        options.historyNavigationAvailable ?? component.artifact.historyNavigationEnabled === true,
      subtleCrypto: options.subtleCrypto,
    },
  );
  if (!artifact.ok)
    fail(
      'K4-SOURCE-DOCUMENTS-ARTIFACT',
      artifact.diagnostics[0]?.message || 'The runtime artifact cannot be rebuilt.',
    );
  return {
    record,
    story,
    source,
    artifact: (artifact as unknown as RuntimeArtifactSuccess).artifact,
  };
}
/** Build a new component; the raw files are authoritative and source is only a derived projection. */
export async function composeGraphComponent<T extends ObjectRecord>(
  component: T,
  input: unknown,
  frontend: Dsl4SourceFrontend,
  options: GraphComponentOptions = {},
) {
  const built = await derive(component, input, frontend, options),
    assets = component.assets;
  if (!plain(assets))
    fail('K4-SOURCE-DOCUMENTS-ASSETS', 'An existing strict asset bundle is required.');
  const metadata = plain(built.story.metadata) ? built.story.metadata : {};
  const implicit = Array.isArray(metadata.implicitProjectAssets)
    ? metadata.implicitProjectAssets.filter((id): id is string => typeof id === 'string')
    : [];
  await rebindDsl4AssetBundleReferences(built.story, assets, {
    maxFiles: 4096,
    maxFileBytes: 128 * 1024 * 1024,
    maxTotalBytes: 128 * 1024 * 1024,
    subtleCrypto: options.subtleCrypto,
    implicitProjectAssets: implicit,
  });
  return Object.freeze({
    ...component,
    sourceDocuments: built.record,
    source: built.source,
    artifact: built.artifact,
  });
}
/** Check fresh projection bindings without importing or recursing into the component loader. */
export async function verifyProjection(
  component: ObjectRecord,
  input: unknown,
  frontend: Dsl4SourceFrontend,
  options: GraphComponentOptions = {},
) {
  const built = await derive(component, input, frontend, options);
  if (
    JSON.stringify(canonical(component.source)) !== JSON.stringify(canonical(built.source)) ||
    JSON.stringify(canonical(component.artifact)) !== JSON.stringify(canonical(built.artifact))
  )
    fail(
      'K4-SOURCE-DOCUMENTS-PROJECTION',
      'The derived source or runtime artifact no longer matches the raw source files.',
    );
  return built.record;
}
export async function validateGraphComponentProjection(
  component: ObjectRecord,
  frontend: Dsl4SourceFrontend,
  options: GraphComponentOptions = {},
) {
  return verifyProjection(component, component.sourceDocuments, frontend, options);
}
