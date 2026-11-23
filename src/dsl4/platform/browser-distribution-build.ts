import {strFromU8, strToU8, zipSync} from 'fflate';

import {
  convertDsl4ProjectToCompiledProfile,
  type Dsl4DistributionProfile,
  dsl4DistributionProfiles,
} from '../compiled-project.js';
import {Dsl4CompiledStoryError} from '../compiled-story-artifact.js';
import {createDsl4RuntimeArtifactDescriptor} from '../runtime-artifact-descriptor.js';
import {loadDsl4RuntimeComponent} from '../runtime-artifact-loader.js';
import type {Dsl4SourceFrontend} from '../source-frontend.js';
import type {Dsl4SubtleCrypto} from '../subtle-crypto.js';
import {dsl4ScratchPoseFeedbackVariableNames} from './scratch-pose-feedback-adapter.js';

export const dsl4BrowserDistributionBuildDefaults = Object.freeze({
  maxArchiveEntries: 4096,
  maxArchiveBytes: 256 * 1024 * 1024,
  maxProjectBytes: 16 * 1024 * 1024,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class Dsl4BrowserDistributionBuildError extends Error {
  code: string;

  constructor(code: string, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : {cause});
    this.name = 'Dsl4BrowserDistributionBuildError';
    this.code = code;
  }
}

function fail(code: string, message: string, cause?: unknown): never {
  throw new Dsl4BrowserDistributionBuildError(code, message, cause);
}

function positiveInteger(value: unknown, name: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return Number(value);
}

function safeArchiveEntryName(name: string) {
  const segments = name.replace(/\/$/u, '').split('/');
  if (
    name.length === 0 ||
    name.includes('\0') ||
    name.includes('\\') ||
    name.startsWith('/') ||
    /^[A-Za-z]:/u.test(name) ||
    segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    fail('K4-BROWSER-BUILD-ARCHIVE-PATH', `The open project contains an unsafe entry: ${name}`);
  }
  return name;
}

function archiveBytes(value: unknown, name: string) {
  if (!(value instanceof Uint8Array)) {
    fail('K4-BROWSER-BUILD-ARCHIVE-ENTRY', `The open project entry is not binary data: ${name}`);
  }
  return new Uint8Array(value);
}

type Dsl4BrowserScratchVariable = [name: string, value: unknown, isCloud?: boolean];

interface Dsl4BrowserDistributionMonitor {
  id: string;
  mode: string;
  opcode: string;
  params: Readonly<{VARIABLE: string}>;
  spriteName: null;
  value: number;
  width: number;
  height: number;
  x: number;
  y: number;
  visible: boolean;
  sliderMin: number;
  sliderMax: number;
  isDiscrete: boolean;
}

interface Dsl4BrowserDistributionStageTarget extends Record<string, unknown> {
  isStage?: unknown;
  variables?: Record<string, Dsl4BrowserScratchVariable>;
}

interface Dsl4BrowserDistributionProject extends Record<string, unknown> {
  targets: Dsl4BrowserDistributionStageTarget[];
  monitors?: Dsl4BrowserDistributionMonitor[];
  extensionStorage?: {
    kubohiroyakamishibai4?: {
      components?: Record<string, unknown>;
    };
    kubohiroyakamishibairuntime4?: unknown;
  };
}

interface Dsl4BrowserDistributionAsset {
  source?: {type?: unknown};
}

interface Dsl4BrowserDistributionRuntimeComponent {
  storyDocument: Readonly<Record<string, unknown>>;
  sourceDescriptor: Readonly<Record<string, unknown>> & {displayName: string};
  assetBundle: Readonly<{
    manifest: Readonly<{assets: ReadonlyArray<Dsl4BrowserDistributionAsset>}>;
  }>;
}

interface Dsl4BrowserDistributionArtifactResult {
  artifact: unknown;
}

interface Dsl4BrowserDistributionDocument {
  createElement(tag: string): unknown;
  body?: {appendChild?(element: unknown): unknown};
}

interface Dsl4BrowserDistributionUrl {
  createObjectURL(value: unknown): string;
  revokeObjectURL(value: string): unknown;
}

interface Dsl4BrowserDistributionAnchor {
  href: string;
  download: string;
  style: {display: string};
  click(): unknown;
  remove?(): unknown;
}

interface Dsl4BrowserDistributionWritable {
  write(bytes: Uint8Array): unknown | Promise<unknown>;
  close(): unknown | Promise<unknown>;
  abort?(): unknown | Promise<unknown>;
}

interface Dsl4BrowserDistributionSaveHandle {
  createWritable(options: {keepExistingData: boolean}): unknown | Promise<unknown>;
}

interface Dsl4BrowserDistributionGlobal {
  document?: unknown;
  URL?: unknown;
  Blob?: new (parts: BlobPart[], options?: {type: string}) => unknown;
  isSecureContext?: boolean;
  self?: unknown;
  top?: unknown;
  showSaveFilePicker?(options: unknown): unknown;
}

function inspectProjectFiles(
  projectFiles: unknown,
  maxArchiveEntries: number,
  maxArchiveBytes: number,
) {
  if (!isRecord(projectFiles)) {
    fail('K4-BROWSER-BUILD-ARCHIVE', 'TurboWarp did not provide the open project files');
  }
  const entries = Object.entries(projectFiles);
  if (entries.length === 0 || entries.length > maxArchiveEntries) {
    fail(
      'K4-BROWSER-BUILD-ARCHIVE-LIMIT',
      `The open project must contain between 1 and ${maxArchiveEntries} files`,
    );
  }
  let totalBytes = 0;
  const archive: Record<string, Uint8Array> = {};
  for (const [entryName, value] of entries) {
    safeArchiveEntryName(entryName);
    if (entryName.endsWith('/')) continue;
    const bytes = archiveBytes(value, entryName);
    totalBytes += bytes.byteLength;
    if (totalBytes > maxArchiveBytes) {
      fail(
        'K4-BROWSER-BUILD-ARCHIVE-LIMIT',
        `The open project exceeds the ${maxArchiveBytes}-byte build limit`,
      );
    }
    archive[entryName] = bytes;
  }
  if (!archive['project.json']) {
    fail('K4-BROWSER-BUILD-PROJECT', 'The open project does not contain project.json');
  }
  return archive as Record<string, Uint8Array>;
}

function parseProject(bytes: Uint8Array, maxProjectBytes: number) {
  if (bytes.byteLength > maxProjectBytes) {
    fail(
      'K4-BROWSER-BUILD-PROJECT-LIMIT',
      `project.json exceeds the ${maxProjectBytes}-byte build limit`,
    );
  }
  let project;
  try {
    project = JSON.parse(strFromU8(bytes));
  } catch (error) {
    fail('K4-BROWSER-BUILD-PROJECT', 'The open project contains invalid project.json', error);
  }
  if (!isRecord(project) || !Array.isArray(project.targets)) {
    fail('K4-BROWSER-BUILD-PROJECT', 'The open project.json must contain a target list');
  }
  return project as Dsl4BrowserDistributionProject;
}

function requireRuntimeComponent(runtimeComponent: unknown) {
  if (
    !isRecord(runtimeComponent) ||
    !isRecord(runtimeComponent.storyDocument) ||
    !isRecord(runtimeComponent.sourceDescriptor) ||
    !isRecord(runtimeComponent.assetBundle)
  ) {
    fail(
      'K4-BROWSER-BUILD-SOURCE',
      'The latest validated browser preview generation is unavailable',
    );
  }
  return runtimeComponent as unknown as Dsl4BrowserDistributionRuntimeComponent;
}

const poseFeedbackVariables = Object.freeze([
  Object.freeze({
    preferredId: 'dsl4-pose-confidence',
    name: dsl4ScratchPoseFeedbackVariableNames.confidence,
    x: 0,
  }),
  Object.freeze({
    preferredId: 'dsl4-pose-progress',
    name: dsl4ScratchPoseFeedbackVariableNames.progress,
    x: 343,
  }),
]);

function ensureStageVariable(
  variables: Record<string, Dsl4BrowserScratchVariable>,
  preferredId: string,
  name: string,
) {
  const existing = Object.entries(variables).find(
    ([, value]) => Array.isArray(value) && value[0] === name,
  );
  if (existing) {
    if (existing[1][2] === true) {
      fail(
        'K4-BROWSER-BUILD-PROJECT',
        `The required Stage variable cannot be a cloud variable: ${name}`,
      );
    }
    variables[existing[0]] = [name, 0];
    return existing[0];
  }
  let id = preferredId;
  let suffix = 2;
  while (Object.hasOwn(variables, id)) {
    id = `${preferredId}-${suffix}`;
    suffix += 1;
  }
  variables[id] = [name, 0];
  return id;
}

function ensureProductionStageContract(project: Dsl4BrowserDistributionProject) {
  const stage = project.targets.find(
    (target: unknown) => isRecord(target) && target.isStage === true,
  );
  if (!isRecord(stage)) {
    fail('K4-BROWSER-BUILD-PROJECT', 'The open project.json does not contain a Stage target');
  }
  if (!isRecord(stage.variables)) stage.variables = {};
  if (!Array.isArray(project.monitors)) project.monitors = [];
  for (const definition of poseFeedbackVariables) {
    const id = ensureStageVariable(stage.variables, definition.preferredId, definition.name);
    const monitor = {
      id,
      mode: 'slider',
      opcode: 'data_variable',
      params: {VARIABLE: definition.name},
      spriteName: null,
      value: 0,
      width: 0,
      height: 0,
      x: definition.x,
      y: 0,
      visible: false,
      sliderMin: 0,
      sliderMax: 100,
      isDiscrete: true,
    };
    const monitorIndex = project.monitors.findIndex(
      (candidate: unknown) => isRecord(candidate) && candidate.id === id,
    );
    if (monitorIndex === -1) project.monitors.push(monitor);
    else project.monitors[monitorIndex] = monitor;
  }
}

const standardRuntimeExtensionId = 'kubohiroyakamishibai4';
const runtimeExtensionDataUrlPrefix = 'data:text/javascript;base64,';

function base64(bytes: Uint8Array) {
  let binary = '';
  // Chunks keep String.fromCharCode's argument list below engine limits.
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

/** Replace the Standard runtime extension the project carries with `source`. */
function installRuntimeExtensionSource(project: Record<string, unknown>, source: unknown) {
  if (source === undefined) return;
  if (
    typeof source !== 'string' ||
    source.length > 16 * 1024 * 1024 ||
    !source.startsWith('// Name: Kamishibai DSL 4.0 Runtime') ||
    !source.includes(`\n// ID: ${standardRuntimeExtensionId}\n`)
  ) {
    throw new TypeError(
      'runtimeExtensionSource must be a bounded DSL 4.0 composite runtime source string',
    );
  }
  const urls = project.extensionURLs;
  if (
    !Array.isArray(project.extensions) ||
    !project.extensions.includes(standardRuntimeExtensionId) ||
    !isRecord(urls) ||
    typeof urls[standardRuntimeExtensionId] !== 'string'
  ) {
    fail(
      'K4-RUNTIME-EXTENSION-PROFILE-001',
      'The project does not contain the Standard DSL 4.0 runtime extension',
    );
  }
  urls[standardRuntimeExtensionId] =
    runtimeExtensionDataUrlPrefix + base64(new TextEncoder().encode(source));
}

function installDistributionComponent(
  project: Dsl4BrowserDistributionProject,
  component: Dsl4BrowserDistributionRuntimeComponent,
  artifact: unknown,
) {
  const output = structuredClone(project);
  ensureProductionStageContract(output);
  if (!isRecord(output.extensionStorage)) output.extensionStorage = {};
  delete output.extensionStorage.kubohiroyakamishibairuntime4;
  if (!isRecord(output.extensionStorage.kubohiroyakamishibai4)) {
    output.extensionStorage.kubohiroyakamishibai4 = {};
  }
  const bundle = output.extensionStorage.kubohiroyakamishibai4;
  if (!isRecord(bundle.components)) bundle.components = {};
  bundle.components.kubohiroyakamishibairuntime4 = {
    source: structuredClone(component.sourceDescriptor),
    artifact: structuredClone(artifact),
    assets: structuredClone(component.assetBundle),
    application: {mode: 'story'},
  };
  return output;
}

export function createDsl4BrowserDistributionFilename(displayName: string) {
  const leaf = String(displayName || 'story.kamishibai.yaml')
    .split(/[\\/]/u)
    .at(-1);
  const stem = String(leaf)
    .replace(/\.(?:k4|kamishibai)\.ya?ml$/iu, '')
    .replace(/\.ya?ml$/iu, '')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-');
  return `${stem || 'story'}.sb3`;
}

/**
 * Build a standalone SB3 from the currently open TurboWarp project and one stable browser preview
 * generation. The input project and runtime component are never mutated.
 */
export async function createDsl4BrowserDistributionSb3(options: {
  projectFiles: unknown;
  runtimeComponent: unknown;
  sourceFrontend: Dsl4SourceFrontend;
  maxSourceBytes: number;
  maxAssetFiles: number;
  maxTotalAssetBytes: number;
  maxArchiveEntries?: number;
  maxArchiveBytes?: number;
  maxProjectBytes?: number;
  network?: 'allowed' | 'forbidden';
  /** `source` (default) keeps the YAML; `compiled` stores only the validated Story IR. */
  distributionProfile?: Dsl4DistributionProfile;
  subtleCrypto?: Dsl4SubtleCrypto | undefined;
  /**
   * The playback runtime to install in place of the editor's authoring runtime. Without it the
   * work keeps the runtime the open project carries.
   */
  runtimeExtensionSource?: string | undefined;
}) {
  if (!isRecord(options)) throw new TypeError('browser distribution build options are required');
  if (!isRecord(options.sourceFrontend) || typeof options.sourceFrontend.parse !== 'function') {
    throw new TypeError('sourceFrontend must provide parse');
  }
  const maxSourceBytes = positiveInteger(options.maxSourceBytes, 'maxSourceBytes');
  const maxAssetFiles = positiveInteger(options.maxAssetFiles, 'maxAssetFiles');
  const maxTotalAssetBytes = positiveInteger(options.maxTotalAssetBytes, 'maxTotalAssetBytes');
  const maxArchiveEntries = positiveInteger(
    options.maxArchiveEntries ?? dsl4BrowserDistributionBuildDefaults.maxArchiveEntries,
    'maxArchiveEntries',
  );
  const maxArchiveBytes = positiveInteger(
    options.maxArchiveBytes ?? dsl4BrowserDistributionBuildDefaults.maxArchiveBytes,
    'maxArchiveBytes',
  );
  const maxProjectBytes = positiveInteger(
    options.maxProjectBytes ?? dsl4BrowserDistributionBuildDefaults.maxProjectBytes,
    'maxProjectBytes',
  );
  const network = options.network ?? 'allowed';
  if (!['allowed', 'forbidden'].includes(network)) {
    throw new TypeError('network must be allowed or forbidden');
  }
  const distributionProfile = options.distributionProfile ?? 'source';
  if (!dsl4DistributionProfiles.includes(distributionProfile)) {
    throw new TypeError(`distributionProfile must be ${dsl4DistributionProfiles.join(' or ')}`);
  }
  const component = requireRuntimeComponent(options.runtimeComponent);
  const manifestAssets = component.assetBundle.manifest.assets;
  const remoteAssetCount = manifestAssets.filter(
    (asset) => asset?.source?.type === 'remote',
  ).length;
  if (network === 'forbidden' && remoteAssetCount > 0) {
    fail(
      'K4-BROWSER-BUILD-OFFLINE-REMOTE',
      'Offline distribution cannot contain remote asset providers',
    );
  }
  const archive = inspectProjectFiles(options.projectFiles, maxArchiveEntries, maxArchiveBytes);
  const project = parseProject(archive['project.json'] ?? new Uint8Array(), maxProjectBytes);
  const artifactResult = await createDsl4RuntimeArtifactDescriptor(
    component.storyDocument,
    component.sourceDescriptor,
    'production',
    {maxSourceBytes, subtleCrypto: options.subtleCrypto},
  );
  if (artifactResult.ok !== true) {
    const diagnostic = artifactResult.diagnostics?.[0];
    fail(
      typeof diagnostic?.code === 'string' ? diagnostic.code : 'K4-BROWSER-BUILD-CONTROLS',
      diagnostic?.message ?? 'The latest validated source cannot use production controls',
    );
  }
  const outputProject = installDistributionComponent(
    project,
    component,
    (artifactResult as unknown as Dsl4BrowserDistributionArtifactResult).artifact,
  );
  installRuntimeExtensionSource(outputProject, options.runtimeExtensionSource);
  const loadOptions = {
    maxSourceBytes,
    maxAssetFiles,
    maxTotalAssetBytes,
    subtleCrypto: options.subtleCrypto,
  };
  let verified = await loadDsl4RuntimeComponent(outputProject, options.sourceFrontend, loadOptions);
  if (verified.ok !== true) {
    const diagnostic = verified.diagnostics?.[0];
    fail(
      typeof diagnostic?.code === 'string' ? diagnostic.code : 'K4-BROWSER-BUILD-VERIFY',
      diagnostic?.message ?? 'The generated distribution component could not be verified',
    );
  }
  if (distributionProfile === 'compiled') {
    // Compile only what the source build already verified, then verify the compiled form again.
    try {
      await convertDsl4ProjectToCompiledProfile(outputProject as Record<string, unknown>, {
        sourceFrontend: options.sourceFrontend,
        maxSourceBytes,
        subtleCrypto: options.subtleCrypto,
      });
    } catch (error) {
      if (error instanceof Dsl4CompiledStoryError) fail(error.code, error.message, error);
      throw error;
    }
    verified = await loadDsl4RuntimeComponent(outputProject, options.sourceFrontend, loadOptions);
    if (verified.ok !== true) {
      const diagnostic = verified.diagnostics?.[0];
      fail(
        typeof diagnostic?.code === 'string' ? diagnostic.code : 'K4-BROWSER-BUILD-VERIFY',
        diagnostic?.message ?? 'The compiled distribution component could not be verified',
      );
    }
  }
  const projectBytes = strToU8(`${JSON.stringify(outputProject)}\n`);
  if (projectBytes.byteLength > maxProjectBytes) {
    fail(
      'K4-BROWSER-BUILD-PROJECT-LIMIT',
      `Generated project.json exceeds the ${maxProjectBytes}-byte build limit`,
    );
  }
  const orderedArchive = Object.fromEntries(
    Object.entries({...archive, 'project.json': projectBytes}).sort(([left], [right]) => {
      if (left === 'project.json') return -1;
      if (right === 'project.json') return 1;
      return left.localeCompare(right, 'en');
    }),
  );
  const outputUncompressedBytes = Object.values(orderedArchive).reduce(
    (total, entry) => total + entry.byteLength,
    0,
  );
  if (outputUncompressedBytes > maxArchiveBytes) {
    fail(
      'K4-BROWSER-BUILD-ARCHIVE-LIMIT',
      `Generated SB3 entries exceed the ${maxArchiveBytes}-byte build limit`,
    );
  }
  const bytes = new Uint8Array(zipSync(orderedArchive, {level: 6}));
  if (bytes.byteLength > maxArchiveBytes) {
    fail(
      'K4-BROWSER-BUILD-ARCHIVE-LIMIT',
      `Generated SB3 exceeds the ${maxArchiveBytes}-byte build limit`,
    );
  }
  return Object.freeze({
    bytes,
    filename: createDsl4BrowserDistributionFilename(component.sourceDescriptor.displayName),
    project: outputProject,
    runtimeComponent: verified,
    delivery: Object.freeze({networkRequired: remoteAssetCount > 0, remoteAssetCount}),
  });
}

/** Download generated bytes without asking for persistent filesystem permission. */
export function downloadDsl4BrowserDistributionSb3({
  bytes: bytesInput,
  filename,
  globalObject = globalThis,
}: {
  bytes: unknown;
  filename: string;
  globalObject?: Dsl4BrowserDistributionGlobal;
}) {
  const bytes = archiveBytes(bytesInput, 'distribution.sb3');
  if (typeof filename !== 'string' || !filename.endsWith('.sb3')) {
    throw new TypeError('distribution filename must end with .sb3');
  }
  const document = globalObject.document as Dsl4BrowserDistributionDocument;
  const URL = globalObject.URL as Dsl4BrowserDistributionUrl;
  const Blob = globalObject.Blob;
  if (
    !isRecord(document) ||
    typeof document.createElement !== 'function' ||
    typeof URL.createObjectURL !== 'function' ||
    typeof URL.revokeObjectURL !== 'function' ||
    typeof Blob !== 'function'
  ) {
    fail('K4-BROWSER-BUILD-DOWNLOAD', 'This browser cannot download the generated SB3');
  }
  const browserDocument = document;
  const browserURL = URL;
  const anchorCandidate = browserDocument.createElement('a');
  if (!isRecord(anchorCandidate) || typeof anchorCandidate.click !== 'function') {
    fail('K4-BROWSER-BUILD-DOWNLOAD', 'This browser cannot create an SB3 download');
  }
  const anchor = anchorCandidate as unknown as Dsl4BrowserDistributionAnchor;
  const objectUrl = browserURL.createObjectURL(
    new Blob([bytes], {type: 'application/x.scratch.sb3'}),
  );
  try {
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = 'none';
    browserDocument.body?.appendChild?.(anchor);
    anchor.click();
  } finally {
    anchor.remove?.();
    browserURL.revokeObjectURL(objectUrl);
  }
  return Object.freeze({method: 'download', filename, size: bytes.byteLength});
}

/**
 * Invoke the native save picker while the build-button activation is still current. Unsupported
 * browsers return null and use the download adapter after verification.
 */
export function requestDsl4BrowserDistributionSaveTarget({
  filename,
  globalObject = globalThis,
}: {
  filename: string;
  globalObject?: Dsl4BrowserDistributionGlobal;
}) {
  if (typeof filename !== 'string' || !filename.endsWith('.sb3')) {
    throw new TypeError('distribution filename must end with .sb3');
  }
  let topLevel = false;
  try {
    topLevel = globalObject.self === globalObject.top;
  } catch {
    topLevel = false;
  }
  if (
    globalObject.isSecureContext !== true ||
    !topLevel ||
    typeof globalObject.showSaveFilePicker !== 'function'
  ) {
    return Promise.resolve(null);
  }
  let selection;
  try {
    selection = globalObject.showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: 'Scratch 3 project',
          accept: {'application/x.scratch.sb3': ['.sb3']},
        },
      ],
    });
  } catch (error) {
    selection = Promise.reject(error);
  }
  return Promise.resolve(selection).then(
    (handle) => {
      if (!isRecord(handle) || typeof handle.createWritable !== 'function') {
        fail('K4-BROWSER-BUILD-SAVE', 'The browser returned an invalid save destination');
      }
      return Object.freeze({method: 'file-system', filename, handle});
    },
    (error) => {
      if (isRecord(error) && error.name === 'AbortError') {
        return Object.freeze({method: 'cancelled', filename});
      }
      fail('K4-BROWSER-BUILD-SAVE', 'The browser could not select an SB3 destination', error);
    },
  );
}

/** Save to a user-selected file transactionally, or fall back to a browser download. */
export async function saveDsl4BrowserDistributionSb3({
  bytes: bytesInput,
  filename,
  target = null,
  globalObject = globalThis,
}: {
  bytes: unknown;
  filename: string;
  target?: unknown;
  globalObject?: Dsl4BrowserDistributionGlobal;
}) {
  const bytes = archiveBytes(bytesInput, 'distribution.sb3');
  if (isRecord(target) && target.method === 'cancelled') {
    return Object.freeze({method: 'cancelled', filename, size: 0});
  }
  if (!isRecord(target) || target.method !== 'file-system') {
    return downloadDsl4BrowserDistributionSb3({bytes, filename, globalObject});
  }
  const handle = target.handle as Dsl4BrowserDistributionSaveHandle;
  let writable: Dsl4BrowserDistributionWritable | undefined;
  try {
    const writableCandidate = await handle.createWritable({keepExistingData: false});
    if (
      !isRecord(writableCandidate) ||
      typeof writableCandidate.write !== 'function' ||
      typeof writableCandidate.close !== 'function'
    ) {
      fail('K4-BROWSER-BUILD-SAVE', 'The selected destination is not writable');
    }
    writable = writableCandidate as unknown as Dsl4BrowserDistributionWritable;
    await writable.write(bytes);
    await writable.close();
  } catch (error) {
    try {
      await writable?.abort?.();
    } catch {
      // The original write failure remains the actionable diagnostic.
    }
    if (error instanceof Dsl4BrowserDistributionBuildError) throw error;
    fail('K4-BROWSER-BUILD-SAVE', 'The generated SB3 could not be saved', error);
  }
  return Object.freeze({method: 'file-system', filename, size: bytes.byteLength});
}
