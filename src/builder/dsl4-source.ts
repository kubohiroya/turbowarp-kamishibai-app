import {installDsl4EmbeddedYamlHat} from '../dsl4/embedded-yaml-hat.js';
import {
  Dsl4AssetBundleError,
  validateDsl4EmbeddedAssetBundle,
} from '../dsl4/asset-bundle-descriptor.js';
import {
  Dsl4BinaryEntryError,
  validateDsl4BinaryEntryAssetBundle,
} from '../dsl4/binary-entry-provider.js';
import {validateDsl4RuntimeArtifactDescriptor} from '../dsl4/runtime-artifact-descriptor.js';
import {
  Dsl4SourceDescriptorError,
  validateDsl4EmbeddedSourceDescriptor,
} from '../dsl4/source-descriptor.js';
import {applyDsl4SourceOrigins, Dsl4SourceOriginError} from '../dsl4/source-origin-descriptor.js';
import {validateDsl4PoseNetProjectBundle} from '../dsl4/platform/posenet-bundle.js';
import {
  isDsl4PoseNetRemoteDescriptor,
  validateDsl4PoseNetRemoteDescriptor,
} from '../dsl4/platform/posenet-remote.js';
import {fromByteArray} from 'base64-js';
import type {Dsl4SubtleCrypto} from '../dsl4/subtle-crypto.js';
import {Sb3BuilderError} from './errors.js';
import {readSb3, serializeSb3} from './sb3.js';

const channels = new Set(['bundled', 'unbundled']);
const standardRuntimeExtensionId = 'kubohiroyakamishibai4';
const runtimeExtensionDataUrlPrefix = 'data:text/javascript;base64,';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(message: string, code: string, cause?: unknown): never {
  throw new Sb3BuilderError(message, {stage: 'dsl4-source', code, cause});
}

function objectProperty(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const existing = parent[key];
  if (existing === undefined) {
    const created: Record<string, unknown> = {};
    parent[key] = created;
    return created;
  }
  if (!isRecord(existing)) {
    fail(`Cannot install DSL 4.0 source because ${key} is not an object`, 'K4-SOURCE-STORAGE-001');
  }
  return existing;
}

function optionalObjectProperty(
  parent: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  if (!parent || parent[key] === undefined) return null;
  if (!isRecord(parent[key])) {
    fail(`Cannot inspect DSL 4.0 source because ${key} is not an object`, 'K4-SOURCE-STORAGE-001');
  }
  return parent[key];
}

function installPlaybackRuntimeExtension(project: Record<string, unknown>, source: unknown) {
  if (source === undefined) return;
  if (
    typeof source !== 'string' ||
    source.length < 1 ||
    source.length > 16 * 1024 * 1024 ||
    !source.startsWith('// Name: Kamishibai DSL 4.0 Runtime') ||
    !source.includes(`\n// ID: ${standardRuntimeExtensionId}\n`)
  ) {
    throw new TypeError(
      'runtimeExtensionSource must be a bounded DSL 4.0 composite runtime source string',
    );
  }
  if (
    !Array.isArray(project.extensions) ||
    !project.extensions.includes(standardRuntimeExtensionId) ||
    !isRecord(project.extensionURLs) ||
    typeof project.extensionURLs[standardRuntimeExtensionId] !== 'string'
  ) {
    fail(
      'The base SB3 does not contain the Standard DSL 4.0 runtime extension',
      'K4-RUNTIME-EXTENSION-PROFILE-001',
    );
  }
  project.extensionURLs[standardRuntimeExtensionId] =
    runtimeExtensionDataUrlPrefix + fromByteArray(new TextEncoder().encode(source));
}

function sourceContainers(
  extensionStorage: Record<string, unknown>,
  channel: 'bundled' | 'unbundled',
) {
  const existingUnbundled = optionalObjectProperty(
    extensionStorage,
    'kubohiroyakamishibairuntime4',
  );
  const existingBundle = optionalObjectProperty(extensionStorage, 'kubohiroyakamishibai4');
  const existingComponents = optionalObjectProperty(existingBundle, 'components');
  const existingBundled = optionalObjectProperty(
    existingComponents,
    'kubohiroyakamishibairuntime4',
  );

  if (channel === 'unbundled') {
    return {
      selected:
        existingUnbundled ?? objectProperty(extensionStorage, 'kubohiroyakamishibairuntime4'),
      opposite: existingBundled,
    };
  }
  const bundle = existingBundle ?? objectProperty(extensionStorage, 'kubohiroyakamishibai4');
  const components = existingComponents ?? objectProperty(bundle, 'components');
  return {
    selected: existingBundled ?? objectProperty(components, 'kubohiroyakamishibairuntime4'),
    opposite: existingUnbundled,
  };
}

/** Install a validated source descriptor into a cloned project. */
export async function installDsl4EmbeddedSource(
  project: unknown,
  descriptor: unknown,
  {
    channel,
    maxSourceBytes,
    replaceExisting = false,
    subtleCrypto = globalThis.crypto?.subtle,
  }: {
    channel: 'bundled' | 'unbundled';
    maxSourceBytes: number;
    replaceExisting?: boolean;
    subtleCrypto?: Dsl4SubtleCrypto | undefined;
  },
) {
  if (!isRecord(project)) {
    fail('SB3 project must be an object', 'K4-SOURCE-STORAGE-001');
  }
  if (!channels.has(channel)) {
    fail('DSL 4.0 source channel must be bundled or unbundled', 'K4-SOURCE-CHANNEL-001');
  }
  if (typeof replaceExisting !== 'boolean') {
    throw new TypeError('replaceExisting must be a boolean');
  }
  let validated;
  try {
    validated = await validateDsl4EmbeddedSourceDescriptor(descriptor, {
      maxSourceBytes,
      subtleCrypto,
    });
  } catch (error) {
    if (error instanceof Dsl4SourceDescriptorError) {
      fail(error.message, error.code, error);
    }
    throw error;
  }

  const output = structuredClone(project) as Record<string, unknown>;
  const extensionStorage = objectProperty(output, 'extensionStorage');
  const {selected, opposite} = sourceContainers(
    extensionStorage,
    channel as 'bundled' | 'unbundled',
  );
  if (opposite?.source !== undefined) {
    fail(
      'DSL 4.0 source already exists in the opposite storage channel',
      'K4-SOURCE-CHANNEL-AMBIGUOUS',
    );
  }
  if (selected.source !== undefined && !replaceExisting) {
    fail(
      'DSL 4.0 source already exists; replacement requires explicit authorization',
      'K4-SOURCE-STORAGE-EXISTS',
    );
  }
  selected.source = structuredClone(validated);
  return output;
}

/** Embed a DSL 4.0 source descriptor into an SB3 without changing its target graph or assets. */
export async function embedDsl4SourceInSb3(
  baseSb3Bytes: Buffer | Uint8Array,
  descriptor: unknown,
  options: Parameters<typeof installDsl4EmbeddedSource>[2],
) {
  const {archive, project} = readSb3(baseSb3Bytes);
  const outputProject = await installDsl4EmbeddedSource(project, descriptor, options);
  return {bytes: serializeSb3(archive, outputProject), project: outputProject};
}

/** Atomically install a validated source and its runtime artifact into one component channel. */
export async function installDsl4RuntimeComponent(
  project: unknown,
  storyDocument: Readonly<Record<string, unknown>>,
  sourceDescriptor: unknown,
  runtimeArtifact: unknown,
  {
    channel,
    maxSourceBytes,
    historyNavigationAvailable = false,
    replaceExisting = false,
    assetBundle,
    assetBundleFormat = 'embedded-base64',
    assetDistribution,
    poseNetBundle,
    runtimeExtensionSource,
    maxAssetFiles,
    maxAssetFileBytes,
    maxTotalAssetBytes,
    subtleCrypto = globalThis.crypto?.subtle,
  }: {
    channel: 'bundled' | 'unbundled';
    maxSourceBytes: number;
    historyNavigationAvailable?: boolean;
    replaceExisting?: boolean;
    assetBundle?: unknown;
    assetBundleFormat?: 'embedded-base64' | 'binary-entry';
    maxAssetFiles?: number;
    maxAssetFileBytes?: number;
    maxTotalAssetBytes?: number;
    assetDistribution?: unknown;
    poseNetBundle?: unknown;
    runtimeExtensionSource?: string;
    subtleCrypto?: Dsl4SubtleCrypto | undefined;
  },
) {
  if (!isRecord(project)) {
    fail('SB3 project must be an object', 'K4-RUNTIME-COMPONENT-STORAGE-001');
  }
  if (!channels.has(channel)) {
    fail('DSL 4.0 runtime component channel must be bundled or unbundled', 'K4-SOURCE-CHANNEL-001');
  }
  if (typeof replaceExisting !== 'boolean') {
    throw new TypeError('replaceExisting must be a boolean');
  }
  let source;
  try {
    source = await validateDsl4EmbeddedSourceDescriptor(sourceDescriptor, {
      maxSourceBytes,
      subtleCrypto,
    });
  } catch (error) {
    if (error instanceof Dsl4SourceDescriptorError) fail(error.message, error.code, error);
    throw error;
  }
  let validatedStoryDocument = storyDocument;
  if (source.sourceOrigins !== undefined) {
    try {
      validatedStoryDocument = applyDsl4SourceOrigins(storyDocument, source.sourceOrigins);
    } catch (error) {
      if (error instanceof Dsl4SourceOriginError) fail(error.message, error.code, error);
      throw error;
    }
  }
  const validatedArtifact = await validateDsl4RuntimeArtifactDescriptor(
    validatedStoryDocument,
    source,
    runtimeArtifact,
    {maxSourceBytes, historyNavigationAvailable, subtleCrypto},
  );
  if (!validatedArtifact.ok) {
    const [firstDiagnostic] = validatedArtifact.diagnostics;
    // A failed validation always carries at least one diagnostic.
    fail(
      firstDiagnostic?.message ?? 'DSL 4.0 runtime artifact is invalid',
      firstDiagnostic?.code ?? 'K4-ARTIFACT-001',
    );
  }
  const validatedArtifactSuccess = validatedArtifact as unknown as {
    artifact: Readonly<Record<string, unknown>>;
  };
  let validatedAssets = null;
  if (assetBundle !== undefined) {
    if (maxAssetFiles === undefined || maxTotalAssetBytes === undefined) {
      throw new TypeError('maxAssetFiles and maxTotalAssetBytes are required with assetBundle');
    }
    try {
      if (assetBundleFormat === 'embedded-base64') {
        validatedAssets = await validateDsl4EmbeddedAssetBundle(
          validatedStoryDocument,
          assetBundle,
          {
            maxFiles: maxAssetFiles,
            maxTotalBytes: maxTotalAssetBytes,
            subtleCrypto,
          },
        );
      } else if (assetBundleFormat === 'binary-entry') {
        if (maxAssetFileBytes === undefined) {
          throw new TypeError('maxAssetFileBytes is required with a binary-entry asset bundle');
        }
        validatedAssets = {
          descriptor: await validateDsl4BinaryEntryAssetBundle(
            validatedStoryDocument,
            assetBundle,
            {
              maxFiles: maxAssetFiles,
              maxFileBytes: maxAssetFileBytes,
              maxTotalBytes: maxTotalAssetBytes,
              subtleCrypto,
            },
          ),
        };
      } else {
        throw new TypeError('assetBundleFormat must be embedded-base64 or binary-entry');
      }
    } catch (error) {
      if (error instanceof Dsl4AssetBundleError || error instanceof Dsl4BinaryEntryError) {
        fail(error.message, error.code, error);
      }
      throw error;
    }
  }
  const validatedPoseNetBundle =
    poseNetBundle === undefined
      ? undefined
      : isDsl4PoseNetRemoteDescriptor(poseNetBundle)
        ? validateDsl4PoseNetRemoteDescriptor(poseNetBundle)
        : await validateDsl4PoseNetProjectBundle(poseNetBundle, {
            ...(subtleCrypto === undefined
              ? {}
              : {subtleCrypto: subtleCrypto as unknown as Pick<SubtleCrypto, 'digest'>}),
          });

  const output = structuredClone(project) as Record<string, unknown>;
  installPlaybackRuntimeExtension(output, runtimeExtensionSource);
  const extensionStorage = objectProperty(output, 'extensionStorage');
  const {selected, opposite} = sourceContainers(
    extensionStorage,
    channel as 'bundled' | 'unbundled',
  );
  if (
    opposite &&
    (opposite.source !== undefined ||
      opposite.artifact !== undefined ||
      opposite.assets !== undefined ||
      opposite.assetDistribution !== undefined ||
      opposite.poseNet !== undefined)
  ) {
    fail(
      'DSL 4.0 runtime component already exists in the opposite storage channel',
      'K4-RUNTIME-COMPONENT-CHANNEL-AMBIGUOUS',
    );
  }
  const hasSource = selected.source !== undefined;
  const hasArtifact = selected.artifact !== undefined;
  const hasAssets = selected.assets !== undefined;
  const hasDistribution = selected.assetDistribution !== undefined;
  const packaged = validatedAssets !== null;
  if (
    hasSource !== hasArtifact ||
    (packaged && hasSource !== hasAssets) ||
    (hasDistribution && (!hasSource || !hasArtifact || (packaged && !hasAssets)))
  ) {
    fail(
      'Existing DSL 4.0 runtime component has only some of source, artifact, and assets',
      'K4-RUNTIME-COMPONENT-PARTIAL',
    );
  }
  if (!packaged && hasAssets) {
    fail(
      'Existing packaged DSL 4.0 component cannot be replaced without an asset bundle',
      'K4-RUNTIME-COMPONENT-ASSET-MODE-001',
    );
  }
  if (!packaged && hasDistribution) {
    fail(
      'Existing packaged DSL 4.0 component cannot be replaced without an asset distribution',
      'K4-RUNTIME-COMPONENT-ASSET-MODE-001',
    );
  }
  if (hasSource && !replaceExisting) {
    fail(
      'DSL 4.0 runtime component already exists; replacement requires explicit authorization',
      'K4-RUNTIME-COMPONENT-STORAGE-EXISTS',
    );
  }
  selected.source = structuredClone(source);
  selected.artifact = structuredClone(validatedArtifactSuccess.artifact);
  selected.application = {mode: 'story'};
  if (validatedAssets) selected.assets = structuredClone(validatedAssets.descriptor);
  if (validatedPoseNetBundle !== undefined) {
    selected.poseNet = structuredClone(validatedPoseNetBundle);
  }
  if (assetDistribution !== undefined)
    selected.assetDistribution = structuredClone(assetDistribution);
  else delete selected.assetDistribution;
  installDsl4EmbeddedYamlHat(output, {channel: channel as 'bundled' | 'unbundled'});
  return output;
}

/** Atomically install source, control artifact, and embedded assets into one component channel. */
export function installDsl4PackagedRuntimeComponent(
  project: unknown,
  storyDocument: Readonly<Record<string, unknown>>,
  sourceDescriptor: unknown,
  runtimeArtifact: unknown,
  assetBundle: unknown,
  options: {
    channel: 'bundled' | 'unbundled';
    maxSourceBytes: number;
    maxAssetFiles: number;
    maxTotalAssetBytes: number;
    historyNavigationAvailable?: boolean;
    replaceExisting?: boolean;
    subtleCrypto?: Dsl4SubtleCrypto | undefined;
  },
) {
  return installDsl4RuntimeComponent(project, storyDocument, sourceDescriptor, runtimeArtifact, {
    ...options,
    assetBundle,
    assetBundleFormat: 'embedded-base64',
  });
}

/**
 * Atomically install source, control artifact, and a ZIP-entry asset descriptor.
 *
 * This explicit API keeps the binary-entry path opt-in while the Base64 package format remains
 * the default compatibility path.
 */
export function installDsl4BinaryEntryRuntimeComponent(
  project: unknown,
  storyDocument: Readonly<Record<string, unknown>>,
  sourceDescriptor: unknown,
  runtimeArtifact: unknown,
  assetBundle: unknown,
  options: Parameters<typeof installDsl4RuntimeComponent>[4],
) {
  return installDsl4RuntimeComponent(project, storyDocument, sourceDescriptor, runtimeArtifact, {
    ...options,
    assetBundle,
    assetBundleFormat: 'binary-entry',
  });
}

/** Embed a complete DSL 4.0 runtime component without changing target graph or assets. */
export async function embedDsl4RuntimeComponentInSb3(
  baseSb3Bytes: Buffer | Uint8Array,
  storyDocument: Readonly<Record<string, unknown>>,
  sourceDescriptor: unknown,
  runtimeArtifact: unknown,
  options: Parameters<typeof installDsl4RuntimeComponent>[4],
) {
  const {archive, project} = readSb3(baseSb3Bytes);
  const outputProject = await installDsl4RuntimeComponent(
    project,
    storyDocument,
    sourceDescriptor,
    runtimeArtifact,
    options,
  );
  return {bytes: serializeSb3(archive, outputProject), project: outputProject};
}

/** Embed a complete source component and its marker, preserving existing scripts and entries. */
export async function embedDsl4PackagedRuntimeComponentInSb3(
  baseSb3Bytes: Buffer | Uint8Array,
  storyDocument: Readonly<Record<string, unknown>>,
  sourceDescriptor: unknown,
  runtimeArtifact: unknown,
  assetBundle: unknown,
  options: Parameters<typeof installDsl4PackagedRuntimeComponent>[5],
) {
  const {archive, project} = readSb3(baseSb3Bytes);
  const outputProject = await installDsl4PackagedRuntimeComponent(
    project,
    storyDocument,
    sourceDescriptor,
    runtimeArtifact,
    assetBundle,
    options,
  );
  return {bytes: serializeSb3(archive, outputProject), project: outputProject};
}
