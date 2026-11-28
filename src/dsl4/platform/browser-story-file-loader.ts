import {createDsl4EmbeddedAssetBundle} from '../asset-bundle-descriptor.js';
import {createDsl4RuntimeArtifactDescriptor} from '../runtime-artifact-descriptor.js';
import {loadDsl4RuntimeComponent} from '../runtime-artifact-loader.js';
import {
  computeDsl4Sha256Integrity,
  createDsl4EmbeddedSourceDescriptor,
} from '../source-descriptor.js';
import type {Dsl4SourceFrontend} from '../source-frontend.js';
import type {Dsl4StoryDocumentAsset} from '../story-asset.js';
import {encodeDsl4StoryPathSegment} from '../story-path.js';
import type {Dsl4SubtleCrypto} from '../subtle-crypto.js';
import {extractDsl4PoseArchive, isDsl4PoseArchivePath} from './pose-archive-extractor.js';

const storyFilenamePattern = /\.(?:k4|kamishibai)\.ya?ml$/iu;

export const dsl4BrowserStorySelectionDefaults = Object.freeze({
  maxEntries: 1024,
  maxDepth: 32,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safePath(value: string, name: string) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('\0') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)
  ) {
    throw new TypeError(`${name} must be a safe relative path`);
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new TypeError(`${name} must stay inside the selected project directory`);
  }
  return segments.join('/');
}

function positiveLimit(value: unknown, name: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return Number(value);
}

interface Dsl4BrowserSelectedFile {
  name: string;
  size: number;
  webkitRelativePath?: string;
  arrayBuffer(): ArrayBuffer | Promise<ArrayBuffer>;
}

interface Dsl4BrowserSelectedEntry {
  path?: string;
  file: unknown;
}

interface Dsl4BrowserFileSystemHandle {
  name: string;
  kind: 'file' | 'directory' | string;
  getFile?(): unknown | Promise<unknown>;
  entries?(): AsyncIterable<[string, Dsl4BrowserFileSystemHandle]>;
}

interface Dsl4BrowserTransferItem {
  getAsFileSystemHandle?():
    Dsl4BrowserFileSystemHandle | null | Promise<Dsl4BrowserFileSystemHandle | null>;
}

interface Dsl4BrowserDataTransfer {
  items?: ArrayLike<Dsl4BrowserTransferItem>;
  files?: ArrayLike<unknown> | Iterable<unknown>;
}

interface Dsl4BrowserSourceRange {
  start?: {line?: unknown};
}

export interface Dsl4BrowserSelectedStoryDocument extends Readonly<Record<string, unknown>> {
  assets?: Readonly<Record<string, Dsl4StoryDocumentAsset>>;
  sourceMap?: Readonly<Record<string, Dsl4BrowserSourceRange>>;
}

interface Dsl4BrowserArtifactResult {
  artifact: unknown;
}

export interface Dsl4BrowserMutableProject extends Record<string, unknown> {
  extensionStorage?: {
    kubohiroyakamishibai4?: {
      components?: Record<string, unknown>;
    };
    kubohiroyakamishibairuntime4?: unknown;
  };
}

function requireFile(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.name !== 'string' ||
    !Number.isSafeInteger(value.size) ||
    Number(value.size) < 0 ||
    typeof value.arrayBuffer !== 'function'
  ) {
    throw new TypeError('selected browser entry must provide the File contract');
  }
  return value as unknown as Dsl4BrowserSelectedFile;
}

function entryPath(entry: Readonly<Dsl4BrowserSelectedEntry>) {
  const file = entry.file as Partial<Dsl4BrowserSelectedFile> | null | undefined;
  return safePath(String(entry.path ?? file?.webkitRelativePath ?? file?.name ?? ''), 'file path');
}

/** Find exactly one DSL 4.0 YAML source among files selected or dropped by the user. */
export function selectDsl4BrowserStorySource(
  entries: ReadonlyArray<Readonly<{path?: string; file: unknown}>>,
) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new TypeError('Select or drop a .k4.yml file');
  }
  const candidates = entries.filter((entry) => storyFilenamePattern.test(entryPath(entry)));
  if (candidates.length === 0) throw new TypeError('No .k4.yml file was selected');
  if (candidates.length > 1)
    throw new TypeError('Select a directory containing exactly one .k4.yml file');
  return candidates[0];
}

function selectionLimits(optionsInput: unknown) {
  const options = optionsInput === undefined ? {} : optionsInput;
  if (!isRecord(options)) throw new TypeError('browser story selection options must be an object');
  return {
    maxEntries: positiveLimit(
      options.maxEntries ?? dsl4BrowserStorySelectionDefaults.maxEntries,
      'maxEntries',
    ),
    maxDepth: positiveLimit(
      options.maxDepth ?? dsl4BrowserStorySelectionDefaults.maxDepth,
      'maxDepth',
    ),
  };
}

function claimSelectedEntry(
  state: {count: number; maxEntries: number; maxDepth: number},
  depth: number,
) {
  if (depth > state.maxDepth) {
    throw new TypeError(`Selected project exceeds the ${state.maxDepth} directory depth limit`);
  }
  state.count += 1;
  if (state.count > state.maxEntries) {
    throw new TypeError(`Selected project exceeds the ${state.maxEntries} entry limit`);
  }
}

function boundedSelectedPath(path: string, state: {maxDepth: number}) {
  const selectedPath = safePath(path, 'dropped file path');
  if (selectedPath.split('/').length - 1 > state.maxDepth) {
    throw new TypeError(`Selected project exceeds the ${state.maxDepth} directory depth limit`);
  }
  return selectedPath;
}

async function collectChildren(
  handle: Readonly<Dsl4BrowserFileSystemHandle> & {
    entries(): AsyncIterable<[string, Dsl4BrowserFileSystemHandle]>;
  },
  state: {count: number; maxEntries: number},
) {
  const children: Array<[string, Dsl4BrowserFileSystemHandle]> = [];
  for await (const entry of handle.entries()) {
    if (state.count + children.length >= state.maxEntries) {
      throw new TypeError(`Selected project exceeds the ${state.maxEntries} entry limit`);
    }
    children.push(entry);
  }
  children.sort(([left], [right]) => left.localeCompare(right, 'en'));
  return children;
}

async function collectHandle(
  handle: Readonly<Dsl4BrowserFileSystemHandle>,
  prefix: string,
  output: Array<{path: string; file: unknown}>,
  state: {count: number; maxEntries: number; maxDepth: number},
  depth: number,
) {
  claimSelectedEntry(state, depth);
  const path = prefix ? `${prefix}/${handle.name}` : handle.name;
  if (handle.kind === 'file' && typeof handle.getFile === 'function') {
    output.push({path: safePath(path, 'dropped file path'), file: await handle.getFile()});
    return;
  }
  if (handle.kind !== 'directory' || typeof handle.entries !== 'function') {
    throw new TypeError('Dropped entry must be a file or enumerable directory');
  }
  const children = await collectChildren(
    handle as Readonly<Dsl4BrowserFileSystemHandle> & {
      entries(): AsyncIterable<[string, Dsl4BrowserFileSystemHandle]>;
    },
    state,
  );
  for (const [, child] of children) await collectHandle(child, path, output, state, depth + 1);
}

/** Collect files from a modern drag-and-drop payload without reading unrelated paths. */
export async function collectDsl4BrowserDroppedFiles(
  dataTransferInput: unknown,
  optionsInput?: {maxEntries?: number; maxDepth?: number},
) {
  if (!isRecord(dataTransferInput)) throw new TypeError('drop payload is required');
  const limits = selectionLimits(optionsInput);
  const state = {count: 0, ...limits};
  const dataTransfer = dataTransferInput as unknown as Dsl4BrowserDataTransfer;
  const transferredItems = dataTransfer.items ?? [];
  if (Number(transferredItems.length ?? 0) > limits.maxEntries) {
    throw new TypeError(`Selected project exceeds the ${limits.maxEntries} entry limit`);
  }
  const items = Array.from(transferredItems);
  const entries: Array<{path: string; file: unknown}> = [];
  if (items.some((item) => typeof item?.getAsFileSystemHandle === 'function')) {
    for (const item of items) {
      const handle = await item.getAsFileSystemHandle?.();
      if (handle) await collectHandle(handle, '', entries, state, 0);
    }
  } else {
    const droppedFiles = dataTransfer.files ?? [];
    if (Number((droppedFiles as ArrayLike<unknown>).length ?? 0) > limits.maxEntries) {
      throw new TypeError(`Selected project exceeds the ${limits.maxEntries} entry limit`);
    }
    for (const file of Array.from(droppedFiles)) {
      claimSelectedEntry(state, 0);
      const browserFile = requireFile(file);
      entries.push({
        path: boundedSelectedPath(browserFile.webkitRelativePath || browserFile.name, state),
        file: browserFile,
      });
    }
  }
  entries.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  return entries;
}

export async function collectDsl4BrowserDirectoryFiles(
  rootInput: unknown,
  optionsInput?: {maxEntries?: number; maxDepth?: number},
) {
  if (!isRecord(rootInput) || rootInput.kind !== 'directory') {
    throw new TypeError('selected project root must be a directory handle');
  }
  const limits = selectionLimits(optionsInput);
  const state = {count: 0, ...limits};
  const entries: Array<{path: string; file: unknown}> = [];
  const root = rootInput as unknown as Dsl4BrowserFileSystemHandle & {
    entries(): AsyncIterable<[string, Dsl4BrowserFileSystemHandle]>;
  };
  const children = await collectChildren(root, state);
  for (const [, child] of children) await collectHandle(child, '', entries, state, 0);
  entries.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  return entries;
}

async function readFile(file: Dsl4BrowserSelectedFile, limit: number, label: string) {
  if (file.size > limit) throw new TypeError(`${label} exceeds the configured byte limit`);
  const buffer = await file.arrayBuffer();
  if (!(buffer instanceof ArrayBuffer))
    throw new TypeError(`${label} did not return an ArrayBuffer`);
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength !== file.size || bytes.byteLength > limit) {
    throw new TypeError(`${label} changed while it was being read`);
  }
  return bytes;
}

function decodeSource(bytes: Uint8Array) {
  try {
    return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  } catch (error) {
    throw new TypeError('The selected .k4.yml file is not valid UTF-8', {cause: error});
  }
}

function missingEmbeddedAssetError({
  assetId,
  inputPath,
  sourcePath,
  storyDocument,
}: {
  assetId: string;
  inputPath: string;
  sourcePath: string;
  storyDocument: Dsl4BrowserSelectedStoryDocument;
}) {
  const assetPath = `/assets/${encodeDsl4StoryPathSegment(assetId)}`;
  const sourceRange =
    storyDocument.sourceMap?.[`${assetPath}/file`] ?? storyDocument.sourceMap?.[assetPath];
  const line = Number(sourceRange?.start?.line ?? 1);
  const error = new TypeError(
    [
      'The asset file referenced in the story could not be found.',
      `file: ${sourcePath}`,
      `[${line}] ${assetId},${inputPath}`,
    ].join('\n'),
  );
  Object.defineProperty(error, 'code', {value: 'K4-ASSET-MISSING'});
  return error;
}

function commonManifestAsset(asset: Dsl4StoryDocumentAsset, id: string) {
  return {
    id,
    kind: asset.kind,
    loading: asset.loading,
    ...(asset.target === undefined ? {} : {target: asset.target}),
    ...(asset.kind === 'backdrop' || asset.kind === 'costume'
      ? {bitmapResolution: asset.bitmapResolution ?? 1}
      : {}),
  };
}

/**
 * Build one validated in-memory runtime project from a user-selected source and its allowlisted
 * local files. Only paths declared by the parsed StoryDocument are read into the asset bundle.
 */
export async function buildDsl4BrowserSelectedStoryProject(options: {
  project: unknown;
  entries: ReadonlyArray<Readonly<{path?: string; file: unknown}>>;
  sourceFrontend: Dsl4SourceFrontend;
  maxSourceBytes: number;
  maxAssetFileBytes: number;
  maxAssetFiles: number;
  maxTotalAssetBytes: number;
  controlProfile?: string;
  subtleCrypto?: Dsl4SubtleCrypto | undefined;
}): Promise<
  Readonly<{
    project: Dsl4BrowserMutableProject;
    sourcePath: string;
    storyDocument: Dsl4BrowserSelectedStoryDocument;
  }>
> {
  if (!isRecord(options)) throw new TypeError('browser story build options are required');
  if (!isRecord(options.project)) throw new TypeError('project must be an object');
  if (!isRecord(options.sourceFrontend) || typeof options.sourceFrontend.parse !== 'function') {
    throw new TypeError('sourceFrontend must provide parse');
  }
  const maxSourceBytes = positiveLimit(options.maxSourceBytes, 'maxSourceBytes');
  const maxAssetFileBytes = positiveLimit(options.maxAssetFileBytes, 'maxAssetFileBytes');
  const maxAssetFiles = positiveLimit(options.maxAssetFiles, 'maxAssetFiles');
  const maxTotalAssetBytes = positiveLimit(options.maxTotalAssetBytes, 'maxTotalAssetBytes');
  const subtleCrypto = options.subtleCrypto ?? globalThis.crypto?.subtle;
  const inputEntries = options.entries as unknown as ReadonlyArray<
    Readonly<{path?: string; file: unknown}>
  >;
  const sourceEntry = selectDsl4BrowserStorySource(inputEntries);
  const sourcePath = entryPath(sourceEntry);
  const sourceFile = requireFile(sourceEntry.file);
  const sourceDirectory = sourcePath.includes('/')
    ? sourcePath.slice(0, sourcePath.lastIndexOf('/') + 1)
    : '';
  const normalizedEntries = new Map();
  for (const entry of inputEntries) {
    const path = entryPath(entry);
    if (sourceDirectory && !path.startsWith(sourceDirectory)) continue;
    const relative = sourceDirectory ? path.slice(sourceDirectory.length) : path;
    normalizedEntries.set(safePath(relative, 'project file path'), requireFile(entry.file));
  }
  const sourceText = decodeSource(await readFile(sourceFile, maxSourceBytes, sourcePath));
  const parsed = options.sourceFrontend.parse(sourceText, {
    sourceId: 'main',
    project: options.project,
  });
  if (!parsed.ok) {
    const first = parsed.diagnostics?.[0];
    const error = new TypeError(first?.message ?? 'The selected DSL 4.0 source is invalid');
    if (typeof first?.code === 'string') Object.defineProperty(error, 'code', {value: first.code});
    Object.defineProperty(error, 'diagnostics', {value: parsed.diagnostics ?? []});
    throw error;
  }
  const storyDocument = parsed.storyDocument as Dsl4BrowserSelectedStoryDocument;
  const sourceDescriptor = await createDsl4EmbeddedSourceDescriptor(sourceText, {
    sourceId: 'main',
    displayName: sourcePath.split('/').at(-1) ?? sourcePath,
    maxSourceBytes,
    subtleCrypto,
  });
  const manifestAssets = [];
  const blobs = new Map();
  let fileCount = 0;
  let totalBytes = 0;
  // Narrowed in place rather than through a local, so this stays a type-only edit and the
  // generated playback runtime keeps its current bytes.
  for (const [id, asset] of Object.entries(
    (storyDocument.assets ?? {}) as Readonly<Record<string, Dsl4StoryDocumentAsset>>,
  ).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))) {
    const common = commonManifestAsset(asset, id);
    if (asset.delivery === 'remote') {
      manifestAssets.push({...common, source: {type: 'remote', ...asset.source}});
      continue;
    }
    if (typeof asset.file !== 'string') {
      manifestAssets.push({...common, source: {type: 'project', name: asset.name}});
      continue;
    }
    const inputPath = safePath(asset.file, `asset ${id} file`);
    const recognitionModel = asset.kind === 'recognitionModel';
    const archiveMode = recognitionModel && isDsl4PoseArchivePath(inputPath);
    const selected =
      recognitionModel && !archiveMode
        ? [...normalizedEntries]
            .filter(
              ([path]) =>
                path.startsWith(`${inputPath}/`) && !path.slice(inputPath.length + 1).includes('/'),
            )
            .map(([path, file]) => ({path: path.slice(inputPath.length + 1), file}))
        : normalizedEntries.has(inputPath)
          ? [{path: inputPath.split('/').at(-1), file: normalizedEntries.get(inputPath)}]
          : [];
    selected.sort((left, right) => left.path.localeCompare(right.path, 'en'));
    if (selected.length === 0) {
      throw missingEmbeddedAssetError({
        assetId: id,
        inputPath,
        sourcePath,
        storyDocument,
      });
    }
    if (recognitionModel && !archiveMode && selected.length !== 3) {
      throw new TypeError(`Recognition model ${id} must contain exactly three files`);
    }
    const materialized = [];
    if (archiveMode) {
      const archiveFile = requireFile(selected[0]?.file);
      const archiveBytes = await readFile(archiveFile, maxAssetFileBytes, `${id}/${inputPath}`);
      const extracted = await extractDsl4PoseArchive({
        assetId: id,
        bytes: archiveBytes,
        maxArchiveBytes: maxAssetFileBytes,
        maxFileBytes: maxAssetFileBytes,
        maxTotalBytes: maxTotalAssetBytes,
        subtleCrypto,
      });
      materialized.push(...extracted.files);
    } else {
      for (const selectedFile of selected) {
        const file = requireFile(selectedFile.file);
        materialized.push({
          path: selectedFile.path,
          bytes: await readFile(file, maxAssetFileBytes, `${id}/${selectedFile.path}`),
        });
      }
    }
    fileCount += materialized.length;
    if (fileCount > maxAssetFiles) throw new TypeError('Selected project exceeds maxAssetFiles');
    const files = [];
    for (const materializedFile of materialized) {
      const bytes = new Uint8Array(materializedFile.bytes);
      totalBytes += bytes.byteLength;
      if (totalBytes > maxTotalAssetBytes)
        throw new TypeError('Selected project exceeds maxTotalAssetBytes');
      const integrity = await computeDsl4Sha256Integrity(bytes, subtleCrypto);
      files.push({path: materializedFile.path, size: bytes.byteLength, integrity});
      blobs.set(`${id}\0${materializedFile.path}`, bytes);
    }
    manifestAssets.push({
      ...common,
      source: {
        type: 'file',
        inputPath,
        mode: archiveMode ? 'archive' : recognitionModel ? 'directory' : 'file',
        files,
      },
    });
  }
  const assetBundle = await createDsl4EmbeddedAssetBundle(
    storyDocument,
    {
      manifest: {formatVersion: 1, assets: manifestAssets},
      getFile(assetId, filePath) {
        const bytes = blobs.get(`${assetId}\0${filePath}`);
        if (!bytes)
          throw new TypeError(`Selected asset payload is missing: ${assetId}/${filePath}`);
        return new Uint8Array(bytes);
      },
    },
    {maxFiles: maxAssetFiles, maxTotalBytes: maxTotalAssetBytes, subtleCrypto},
  );
  blobs.clear();
  const artifactResult = await createDsl4RuntimeArtifactDescriptor(
    storyDocument,
    sourceDescriptor,
    options.controlProfile ?? 'production',
    {maxSourceBytes, subtleCrypto},
  );
  if (!artifactResult.ok) {
    const first = artifactResult.diagnostics[0];
    const error = new TypeError(first?.message ?? 'The selected DSL 4.0 controls are invalid');
    if (typeof first?.code === 'string') Object.defineProperty(error, 'code', {value: first.code});
    throw error;
  }
  const project = structuredClone(options.project) as Dsl4BrowserMutableProject;
  if (!isRecord(project.extensionStorage)) project.extensionStorage = {};
  delete project.extensionStorage.kubohiroyakamishibairuntime4;
  if (!isRecord(project.extensionStorage.kubohiroyakamishibai4)) {
    project.extensionStorage.kubohiroyakamishibai4 = {};
  }
  const bundleStorage = project.extensionStorage.kubohiroyakamishibai4;
  if (!isRecord(bundleStorage.components)) bundleStorage.components = {};
  bundleStorage.components.kubohiroyakamishibairuntime4 = {
    source: structuredClone(sourceDescriptor),
    artifact: structuredClone((artifactResult as unknown as Dsl4BrowserArtifactResult).artifact),
    assets: structuredClone(assetBundle),
    application: {mode: 'story'},
  };
  const verified = await loadDsl4RuntimeComponent(project, options.sourceFrontend, {
    maxSourceBytes,
    maxAssetFiles,
    maxTotalAssetBytes,
    subtleCrypto,
  });
  if (!verified.ok) {
    const first = verified.diagnostics[0];
    const error = new TypeError(first?.message ?? 'The selected story component is invalid');
    if (typeof first?.code === 'string') Object.defineProperty(error, 'code', {value: first.code});
    throw error;
  }
  return Object.freeze({project, sourcePath, storyDocument});
}
