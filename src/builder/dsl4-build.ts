import {
  createDsl4EmbeddedAssetBundle,
  Dsl4AssetBundleError,
} from '../dsl4/asset-bundle-descriptor.js';
import {
  createDsl4BinaryEntryAssetBundle,
  Dsl4BinaryEntryError,
} from '../dsl4/binary-entry-provider.js';
import {createDsl4BlockSourceGraph} from '../dsl4/block-source-export.js';
import {createDsl4RuntimeArtifactDescriptor} from '../dsl4/runtime-artifact-descriptor.js';
import {
  loadDsl4BinaryEntryRuntimeComponent,
  loadDsl4RuntimeComponent,
} from '../dsl4/runtime-artifact-loader.js';
import {
  createDsl4EmbeddedSourceDescriptor,
  Dsl4SourceDescriptorError,
} from '../dsl4/source-descriptor.js';
import type {Dsl4SourceFrontend} from '../dsl4/source-frontend.js';
import {Dsl4SourceGraphError} from '../dsl4/source-graph.js';
import {createDsl4SourceGraphFrontend} from '../dsl4/source-graph-frontend.js';
import {deepFreeze} from '../dsl4/story-document.js';
import type {Dsl4SubtleCrypto} from '../dsl4/subtle-crypto.js';
import {
  Dsl4BlockSourceError,
  extractDsl4BlockSourcesFromProject,
} from '../dsl4/turbowarp-yaml-json-block-source.js';
import {
  Dsl4AssetDistributionError,
  resolveDsl4AssetDistributionProfile,
  validateDsl4AssetDistributionConfig,
  validateDsl4AssetDistributionLock,
} from '../dsl4/asset-distribution-profile.js';
import {loadDsl4ProjectJson} from './dsl4-asset-audit.js';
import {loadDsl4ExternalSource} from './dsl4-external-source.js';
import {loadDsl4LocalAssetSnapshot} from './dsl4-local-assets.js';
import {loadDsl4BuildSourceGraph} from './dsl4-source-graph.js';
import {resolveDsl4BuildSourceLimits} from './dsl4-source-limits.js';
import {embedDsl4BinaryEntryRuntimeComponentInSb3} from './dsl4-binary-entry-sb3.js';
import {resolveDsl4BuildFeatureFlags} from './dsl4-build-feature-flags.js';
import {embedDsl4PackagedRuntimeComponentInSb3} from './dsl4-source.js';
import {Sb3BuilderError} from './errors.js';
import type {Dsl4FileSystem} from './file-system.js';
import {
  convertDsl4ProjectToCompiledProfile,
  type Dsl4DistributionProfile,
  dsl4DistributionProfiles,
} from './dsl4-compiled-profile.js';
import {readSb3, serializeSb3} from './sb3.js';
import {Dsl4CompiledStoryError} from '../dsl4/compiled-story-artifact.js';
import {
  createEmbeddedYamlSourceGraphRecord,
  graphDocumentId,
} from '../dsl4/embedded-yaml-source-graph.js';
import {readReference, encodeReference} from '@kubohiroya/turbowarp-document-source';
import {
  installEmbeddedYamlMarker,
  installEmbeddedYamlRootMarker,
} from '@kubohiroya/turbowarp-document-data/document-source';
import {
  dsl4EmbeddedYamlHatOpcode,
  dsl4BundledEmbeddedYamlHatOpcode,
  dsl4EmbeddedYamlRootOpcode,
  dsl4BundledEmbeddedYamlRootOpcode,
  kamishibaiEmbeddedYamlProviderId,
} from '../dsl4/embedded-yaml-identity.js';

export class Dsl4BuildError extends Sb3BuilderError {
  readonly diagnostics: Readonly<readonly unknown[]>;

  constructor(
    message: string,
    details: {
      stage: string;
      code: string;
      diagnostics?: readonly unknown[];
      cause?: unknown;
    },
  ) {
    super(message, details);
    this.name = 'Dsl4BuildError';
    this.diagnostics = deepFreeze(structuredClone(details.diagnostics ?? []));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, name: string) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

/**
 * The three producers that reach here do not share one diagnostic type yet: the source frontend
 * emits `Dsl4Diagnostic`, while the artifact descriptor and verifier emit a shape whose `range` may
 * be null. Only the code and the message are read, so this accepts the common surface until the two
 * shapes are unified.
 */
function failDiagnostics(
  diagnostics: readonly Readonly<{code?: string; message?: string}>[],
  stage: string,
): never {
  const first = diagnostics[0];
  throw new Dsl4BuildError(first?.message ?? 'DSL 4.0 build validation failed', {
    stage,
    code: first?.code ?? 'K4-BUILD-VALIDATION-001',
    diagnostics,
  });
}

async function loadDsl4BlockSourceFromSb3(
  baseSb3Bytes: Buffer | Uint8Array,
  {
    maxSourceBytes,
    subtleCrypto,
  }: {maxSourceBytes: number; subtleCrypto?: Dsl4SubtleCrypto | undefined},
) {
  let blockSourceSet;
  try {
    const {project} = readSb3(baseSb3Bytes);
    blockSourceSet = extractDsl4BlockSourcesFromProject(project);
  } catch (error) {
    if (error instanceof Dsl4BlockSourceError) {
      throw new Dsl4BuildError(error.message, {
        stage: 'dsl4-block-source',
        code: error.code,
        cause: error,
      });
    }
    throw error;
  }
  const text = blockSourceSet.sources[blockSourceSet.entryPath];
  if (typeof text !== 'string') {
    throw new Dsl4BuildError('Root block DSL source is missing', {
      stage: 'dsl4-block-source',
      code: 'K4-BLOCK-SOURCE-MISSING-001',
    });
  }
  try {
    const descriptor = await createDsl4EmbeddedSourceDescriptor(text, {
      sourceId: blockSourceSet.entryPath,
      displayName: blockSourceSet.entryPath,
      maxSourceBytes,
      subtleCrypto,
    });
    return {
      manifest: {path: blockSourceSet.entryPath},
      descriptor,
      blockSourceSet,
    };
  } catch (error) {
    if (error instanceof Dsl4SourceDescriptorError) {
      throw new Dsl4BuildError(error.message, {
        stage: 'dsl4-block-source',
        code: error.code,
        cause: error,
      });
    }
    throw error;
  }
}

async function createDsl4VirtualBlockSourceGraph(
  blockSourceSet: Readonly<{
    entryPath: string;
    sources: Readonly<Record<string, string>>;
  }>,
  limits: Partial<{
    maxSourceFiles: number;
    maxSourceBytes: number;
    maxTotalSourceBytes: number;
    maxIncludeDepth: number;
  }>,
) {
  try {
    return await createDsl4BlockSourceGraph(blockSourceSet, limits);
  } catch (error) {
    if (error instanceof Dsl4SourceGraphError) {
      throw new Dsl4BuildError(error.message, {
        stage: 'dsl4-block-source-graph',
        code: error.code,
        cause: error,
      });
    }
    throw error;
  }
}

/** The frontend parse result this build reads, whether it came through the graph or a single source. */
interface Dsl4BuildParseResult {
  readonly ok: boolean;
  readonly canonicalSource: string;
  readonly storyDocument: Readonly<Record<string, unknown>> & {
    readonly sourceOrigins?: unknown;
  };
  readonly diagnostics: readonly Readonly<{
    code?: string;
    message?: string;
  }>[];
}

/** Build one complete, self-contained DSL 4.0 runtime component in memory. */
export async function buildDsl4RuntimeComponent(options: {
  baseSb3Bytes: Buffer | Uint8Array;
  projectRoot: string;
  sourceManifest?: unknown;
  sourceFrontend: Dsl4SourceFrontend;
  controlProfile: string;
  channel: 'bundled' | 'unbundled';
  maxSourceBytes: number;
  maxAssetFileBytes: number;
  maxAssetFiles: number;
  maxTotalAssetBytes: number;
  featureFlags?: unknown;
  maxSourceFiles?: number;
  maxTotalSourceBytes?: number;
  maxIncludeDepth?: number;
  historyNavigationAvailable?: boolean;
  replaceExisting?: boolean;
  subtleCrypto?: Dsl4SubtleCrypto | undefined;
  fileSystem?: Dsl4FileSystem | undefined;
  readSource?: (filePath: string, limit: number) => Promise<Buffer | Uint8Array>;
  readAssetFile?: (filePath: string, limit: number) => Promise<Buffer | Uint8Array>;
  assetConfig?: string;
  assetLock?: string;
  assetProfile?: string;
  maxAssetConfigBytes?: number;
  maxAssetLockBytes?: number;
  runtimeExtensionSource?: string;
  poseNetBundle?: unknown;
  /** `source` (default) keeps the YAML; `compiled` stores only the validated Story IR. */
  distributionProfile?: Dsl4DistributionProfile;
  /** Opt-in raw file storage for local embedded-document editing; never synthesizes legacy originals. */
  embeddedSourceDocuments?: boolean;
}) {
  if (!isRecord(options)) throw new TypeError('DSL 4.0 build options are required');
  const {
    baseSb3Bytes,
    projectRoot,
    sourceManifest,
    sourceFrontend,
    controlProfile,
    channel,
    maxSourceBytes,
    maxAssetFileBytes,
    maxAssetFiles,
    maxTotalAssetBytes,
    featureFlags: inputFeatureFlags = {},
    maxSourceFiles,
    maxTotalSourceBytes,
    maxIncludeDepth,
    historyNavigationAvailable = false,
    replaceExisting = false,
    subtleCrypto = globalThis.crypto?.subtle,
    fileSystem,
    readSource,
    readAssetFile,
    assetConfig,
    assetLock,
    assetProfile,
    maxAssetConfigBytes,
    maxAssetLockBytes,
    runtimeExtensionSource,
    poseNetBundle,
    distributionProfile = 'source',
    embeddedSourceDocuments = false,
  } = options;
  if (typeof embeddedSourceDocuments !== 'boolean')
    throw new TypeError('embeddedSourceDocuments must be boolean');
  if (embeddedSourceDocuments && distributionProfile !== 'source')
    throw new TypeError('Embedded source documents require the source distribution profile.');
  if (!dsl4DistributionProfiles.includes(distributionProfile)) {
    throw new TypeError(`distributionProfile must be ${dsl4DistributionProfiles.join(' or ')}`);
  }
  if (!(baseSb3Bytes instanceof Uint8Array)) {
    throw new TypeError('baseSb3Bytes must be a Buffer or Uint8Array');
  }
  if (!sourceFrontend || typeof sourceFrontend.parse !== 'function') {
    throw new TypeError('sourceFrontend must provide parse');
  }
  nonEmptyString(controlProfile, 'controlProfile');
  nonEmptyString(channel, 'channel');
  const buildFeatureFlags = resolveDsl4BuildFeatureFlags(inputFeatureFlags);
  const featureFlags = embeddedSourceDocuments
    ? Object.freeze({
        ...buildFeatureFlags.runtimeFeatureFlags,
        dsl4Runtime: true,
        dsl4SourceIncludes: true,
      })
    : buildFeatureFlags.runtimeFeatureFlags;
  const usesBlockSource = sourceManifest === undefined || sourceManifest === null;
  if (embeddedSourceDocuments && usesBlockSource)
    throw new TypeError(
      'Original source files are required; legacy block sources do not retain them.',
    );
  const sourceGraphEnabled =
    featureFlags.dsl4SourceIncludes || usesBlockSource || embeddedSourceDocuments;
  const sourceLimits = resolveDsl4BuildSourceLimits({
    sourceIncludesEnabled: sourceGraphEnabled,
    maxSourceBytes,
    maxTotalSourceBytes:
      maxTotalSourceBytes ?? (embeddedSourceDocuments ? 4 * 1024 * 1024 : undefined),
  });

  let blockSourceSet = null;
  const source = usesBlockSource
    ? await loadDsl4BlockSourceFromSb3(baseSb3Bytes, {
        maxSourceBytes: sourceLimits.maxSourceFileBytes,
        subtleCrypto,
      })
    : await loadDsl4ExternalSource(projectRoot, sourceManifest, {
        maxSourceBytes: sourceLimits.maxSourceFileBytes,
        subtleCrypto,
        fileSystem,
        preserveOriginalSource: embeddedSourceDocuments,
        ...(readSource === undefined ? {} : {readSource}),
      });
  if (usesBlockSource) {
    blockSourceSet = (
      source as {
        blockSourceSet: Readonly<{
          entryPath: string;
          sources: Readonly<Record<string, string>>;
        }>;
      }
    ).blockSourceSet;
  }
  let parsed: Dsl4BuildParseResult;
  let sourceDescriptor = source.descriptor;
  let sourceDocuments: Awaited<ReturnType<typeof createEmbeddedYamlSourceGraphRecord>> | undefined;
  if (sourceGraphEnabled) {
    const graphLimits = {
      maxSourceBytes: sourceLimits.maxSourceFileBytes,
      maxTotalSourceBytes: sourceLimits.maxSourceGraphBytes,
      ...(maxSourceFiles === undefined ? {} : {maxSourceFiles}),
      ...(maxIncludeDepth === undefined ? {} : {maxIncludeDepth}),
    };
    const sourceGraph = blockSourceSet
      ? await createDsl4VirtualBlockSourceGraph(blockSourceSet, graphLimits)
      : await loadDsl4BuildSourceGraph(projectRoot, source, {
          limits: graphLimits,
          preserveOriginalSources: embeddedSourceDocuments,
          ...(fileSystem === undefined ? {} : {fileSystem}),
          ...(readSource === undefined ? {} : {readSource}),
        });
    if (embeddedSourceDocuments) {
      const originals = 'originalSources' in sourceGraph ? sourceGraph.originalSources : undefined;
      if (!originals) throw new TypeError('The build did not capture the original source files.');
      sourceDocuments = await createEmbeddedYamlSourceGraphRecord(
        {
          entryPath: sourceGraph.entryPath,
          sources: originals as Readonly<Record<string, string>>,
        },
        {subtleCrypto},
      );
    }
    const graphFrontend = createDsl4SourceGraphFrontend(sourceFrontend);
    parsed = graphFrontend.parse(sourceGraph, {
      project: readSb3(baseSb3Bytes).project,
      featureFlags: {...featureFlags, dsl4SourceIncludes: true},
      sourceId: source.descriptor.sourceId,
      maxComposedSourceBytes: sourceLimits.maxComposedSourceBytes,
    }) as unknown as Dsl4BuildParseResult;
    if (parsed.ok) {
      try {
        sourceDescriptor = await createDsl4EmbeddedSourceDescriptor(parsed.canonicalSource, {
          sourceId: source.descriptor.sourceId,
          displayName: source.descriptor.displayName,
          maxSourceBytes: sourceLimits.maxPackagedSourceBytes,
          ...(source.descriptor.cacheIdentity
            ? {cacheIdentity: source.descriptor.cacheIdentity}
            : {}),
          ...(parsed.storyDocument.sourceOrigins
            ? {sourceOrigins: parsed.storyDocument.sourceOrigins}
            : {}),
          subtleCrypto,
        });
      } catch (error) {
        if (error instanceof Dsl4SourceDescriptorError) {
          throw new Dsl4BuildError(error.message, {
            stage: 'dsl4-source-compose',
            code: error.code,
            cause: error,
          });
        }
        throw error;
      }
    }
  } else {
    parsed = sourceFrontend.parse(source.descriptor.text, {
      project: readSb3(baseSb3Bytes).project,
      sourceId: source.descriptor.sourceId,
    }) as unknown as Dsl4BuildParseResult;
  }
  if (!parsed.ok) failDiagnostics(parsed.diagnostics, 'dsl4-parse');
  let storyDocument = parsed.storyDocument;
  if (isRecord(storyDocument.metadata) && storyDocument.metadata.narrativeControl === true) {
    const base = readSb3(baseSb3Bytes).project;
    const urls = isRecord(base.extensionURLs) ? Object.values(base.extensionURLs) : [];
    const marker = '// Kamishibai capabilities: narrative-control-v1';
    const capable =
      runtimeExtensionSource?.includes(marker) ||
      urls.some(
        (url) =>
          typeof url === 'string' &&
          url.startsWith('data:text/javascript;base64,') &&
          Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')
            .toString('utf8')
            .includes(marker),
      );
    if (!featureFlags.dsl4NarrativeControl || !capable)
      throw new Dsl4BuildError(
        'Narrative controls require the explicit feature flag and a matching development runtime bundle.',
        {stage: 'dsl4-runtime-capability', code: 'K4-NARRATIVE-RUNTIME-001'},
      );
  }
  let assetDistribution;
  if (assetConfig !== undefined || assetLock !== undefined || assetProfile !== undefined) {
    if (
      typeof assetConfig !== 'string' ||
      typeof assetLock !== 'string' ||
      typeof assetProfile !== 'string'
    ) {
      throw new TypeError('assetConfig, assetLock, and assetProfile must be provided together');
    }
    if (maxAssetConfigBytes === undefined || maxAssetLockBytes === undefined) {
      throw new TypeError(
        'maxAssetConfigBytes and maxAssetLockBytes are required with asset distribution',
      );
    }
    try {
      const [configInput, lockInput] = await Promise.all([
        loadDsl4ProjectJson({
          projectRoot,
          inputPath: assetConfig,
          maxBytes: maxAssetConfigBytes,
          label: 'asset distribution config',
          code: 'K4-ASSET-PROFILE-001',
        }),
        loadDsl4ProjectJson({
          projectRoot,
          inputPath: assetLock,
          maxBytes: maxAssetLockBytes,
          label: 'asset distribution lock',
          code: 'K4-ASSET-LOCK-001',
        }),
      ]);
      assetDistribution = resolveDsl4AssetDistributionProfile(
        storyDocument,
        validateDsl4AssetDistributionConfig(configInput),
        validateDsl4AssetDistributionLock(lockInput),
        assetProfile,
      );
      storyDocument = assetDistribution.storyDocument;
    } catch (error) {
      if (error instanceof Dsl4AssetDistributionError) {
        throw new Dsl4BuildError(error.message, {
          stage: 'dsl4-asset-distribution',
          code: error.code,
          cause: error,
        });
      }
      throw error;
    }
  }

  const snapshot = await loadDsl4LocalAssetSnapshot(projectRoot, storyDocument, {
    maxFileBytes: maxAssetFileBytes,
    maxFiles: maxAssetFiles,
    maxTotalBytes: maxTotalAssetBytes,
    subtleCrypto,
    fileSystem,
    ...(readAssetFile === undefined ? {} : {readFile: readAssetFile}),
  });
  let assetBundle;
  try {
    assetBundle = buildFeatureFlags.dsl4RootBinaryEntryPackaging
      ? await createDsl4BinaryEntryAssetBundle(storyDocument, snapshot, {
          maxFiles: maxAssetFiles,
          maxFileBytes: maxAssetFileBytes,
          maxTotalBytes: maxTotalAssetBytes,
          subtleCrypto,
        })
      : await createDsl4EmbeddedAssetBundle(storyDocument, snapshot, {
          maxFiles: maxAssetFiles,
          maxTotalBytes: maxTotalAssetBytes,
          subtleCrypto,
        });
  } catch (error) {
    if (
      error instanceof Dsl4AssetBundleError ||
      error instanceof Dsl4BinaryEntryError ||
      error instanceof Dsl4SourceDescriptorError
    ) {
      throw new Dsl4BuildError(error.message, {
        stage: 'dsl4-asset-bundle',
        code: error.code,
        cause: error,
      });
    }
    throw error;
  }

  const artifactResult = await createDsl4RuntimeArtifactDescriptor(
    storyDocument,
    sourceDescriptor,
    controlProfile,
    {
      maxSourceBytes: sourceLimits.maxPackagedSourceBytes,
      historyNavigationAvailable,
      subtleCrypto,
    },
  );
  if (!artifactResult.ok) failDiagnostics(artifactResult.diagnostics, 'dsl4-artifact');
  const artifactSuccess = artifactResult as unknown as {
    artifact: Readonly<Record<string, unknown>>;
  };
  const runtimeArtifact = artifactSuccess.artifact;
  const componentOptions = {
    channel,
    maxSourceBytes: sourceLimits.maxPackagedSourceBytes,
    maxAssetFiles,
    maxTotalAssetBytes,
    historyNavigationAvailable,
    replaceExisting,
    subtleCrypto,
    ...(assetDistribution === undefined ? {} : {assetDistribution}),
    ...(runtimeExtensionSource === undefined ? {} : {runtimeExtensionSource}),
    ...(poseNetBundle === undefined ? {} : {poseNetBundle}),
  };
  let embedded = buildFeatureFlags.dsl4RootBinaryEntryPackaging
    ? await embedDsl4BinaryEntryRuntimeComponentInSb3(
        baseSb3Bytes,
        storyDocument,
        sourceDescriptor,
        runtimeArtifact,
        assetBundle as Awaited<ReturnType<typeof createDsl4BinaryEntryAssetBundle>>,
        {...componentOptions, maxAssetFileBytes},
      )
    : await embedDsl4PackagedRuntimeComponentInSb3(
        baseSb3Bytes,
        storyDocument,
        sourceDescriptor,
        runtimeArtifact,
        assetBundle,
        componentOptions,
      );

  if (sourceDocuments) {
    const project = structuredClone(embedded.project) as Record<string, unknown>;
    const storage = project.extensionStorage as Record<string, unknown>;
    const component =
      channel === 'unbundled'
        ? (storage.kubohiroyakamishibairuntime4 as Record<string, unknown>)
        : ((
            (storage.kubohiroyakamishibai4 as Record<string, unknown>).components as Record<
              string,
              unknown
            >
          ).kubohiroyakamishibairuntime4 as Record<string, unknown>);
    component.sourceDocuments = sourceDocuments;
    const entryReference = {
      providerId: kamishibaiEmbeddedYamlProviderId,
      documentId: graphDocumentId(sourceDocuments, sourceDocuments.entryPath),
    };
    // The base embedder creates a single-file marker; retain its identity when adopting a graph.
    for (const target of Array.isArray(project.targets) ? project.targets : []) {
      if (!isRecord(target) || !isRecord(target.blocks)) continue;
      for (const block of Object.values(target.blocks)) {
        if (
          !isRecord(block) ||
          ![dsl4EmbeddedYamlHatOpcode, dsl4BundledEmbeddedYamlHatOpcode].includes(
            String(block.opcode),
          )
        )
          continue;
        const reference = readReference(block, {blocks: target.blocks});
        if (
          reference.providerId !== kamishibaiEmbeddedYamlProviderId ||
          reference.documentId !== 'story'
        )
          continue;
        if (block.next !== null)
          throw new TypeError(
            'An existing document body must be reflected before adopting raw source files',
          );
        block.fields = {DOCUMENT: [encodeReference(entryReference), null]};
        block.inputs = {};
      }
    }
    installEmbeddedYamlRootMarker(project, {
      opcode:
        channel === 'unbundled' ? dsl4EmbeddedYamlRootOpcode : dsl4BundledEmbeddedYamlRootOpcode,
      version: '4.0',
      reference: entryReference,
      x: 40,
      y: -120,
    });
    for (const [index, sourcePath] of Object.keys(sourceDocuments.files).entries()) {
      installEmbeddedYamlMarker(project, {
        opcode:
          channel === 'unbundled' ? dsl4EmbeddedYamlHatOpcode : dsl4BundledEmbeddedYamlHatOpcode,
        reference: {
          providerId: kamishibaiEmbeddedYamlProviderId,
          documentId: graphDocumentId(sourceDocuments, sourcePath),
        },
        x: 40 + index * 360,
        y: 40,
      });
    }
    const {archive} = readSb3(embedded.bytes);
    embedded = {...embedded, project, bytes: serializeSb3(archive, project)};
  }

  const loadComponent = buildFeatureFlags.dsl4RootBinaryEntryPackaging
    ? loadDsl4BinaryEntryRuntimeComponent
    : loadDsl4RuntimeComponent;
  const loadOptions = {
    maxSourceBytes: sourceLimits.maxPackagedSourceBytes,
    maxAssetFiles,
    maxAssetFileBytes,
    maxTotalAssetBytes,
    historyNavigationAvailable,
    subtleCrypto,
  };
  const verified = await loadComponent(embedded.project, sourceFrontend, loadOptions);
  if (!verified.ok) failDiagnostics(verified.diagnostics, 'dsl4-verify');
  if (distributionProfile === 'source') {
    return Object.freeze({
      bytes: Buffer.from(embedded.bytes),
      project: deepFreeze(embedded.project),
      runtimeComponent: verified,
    });
  }
  // Compile only what the source build already verified, then verify the compiled form again.
  const {archive} = readSb3(embedded.bytes);
  const compiledProject = structuredClone(embedded.project) as Record<string, unknown>;
  try {
    await convertDsl4ProjectToCompiledProfile(compiledProject, {
      sourceFrontend,
      maxSourceBytes: sourceLimits.maxPackagedSourceBytes,
      subtleCrypto,
    });
  } catch (error) {
    if (error instanceof Dsl4CompiledStoryError || error instanceof Dsl4SourceDescriptorError) {
      throw new Dsl4BuildError(error.message, {
        stage: 'dsl4-compile',
        code: error.code,
        cause: error,
      });
    }
    throw error;
  }
  const compiledComponent = await loadComponent(compiledProject, sourceFrontend, loadOptions);
  if (!compiledComponent.ok) failDiagnostics(compiledComponent.diagnostics, 'dsl4-compile');
  return Object.freeze({
    bytes: serializeSb3(archive, compiledProject),
    project: deepFreeze(compiledProject),
    runtimeComponent: compiledComponent,
  });
}
