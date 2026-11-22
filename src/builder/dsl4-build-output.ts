import type {Dsl4DistributionProfile} from './dsl4-compiled-profile.js';
import {resolveDsl4BuildFeatureFlags} from './dsl4-build-feature-flags.js';
import {randomBytes} from 'node:crypto';
import {readFile, rename, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {
  loadDsl4BinaryEntryRuntimeComponent,
  loadDsl4RuntimeComponent,
} from '../dsl4/runtime-artifact-loader.js';
import {createDsl4PoseNetRemoteDescriptor} from '../dsl4/platform/posenet-remote.js';
import type {Dsl4SourceFrontend} from '../dsl4/source-frontend.js';
import type {Dsl4SubtleCrypto} from '../dsl4/subtle-crypto.js';
import {installBundleTransactionally} from './atomic-output.js';
import {buildDsl4RuntimeComponent, Dsl4BuildError} from './dsl4-build.js';
import {
  ensureDsl4ExternalSourceCacheIdentity,
  serializeDsl4ExternalSourceManifest,
} from './dsl4-external-source.js';
import {resolveDsl4ProjectSource} from './dsl4-project-source.js';
import {
  readDsl4PlaybackPoseNetBundle,
  readDsl4PlaybackTMOfflineRuntime,
  readDsl4NarrativeRuntimeExtensionSource,
  readDsl4PlaybackRuntimeExtensionSource,
} from './dsl4-playback-runtime-source.js';
import {Sb3BuilderError} from './errors.js';
import {resolveDsl4BuildSourceLimits} from './dsl4-source-limits.js';
import {readSb3} from './sb3.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredPath(value: unknown, name: string) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Sb3BuilderError(`${name} must be a non-empty filesystem path`, {
      stage: 'dsl4-build-output',
      code: 'K4-BUILD-OUTPUT-001',
    });
  }
  return path.resolve(value);
}

async function readInput(filePath: string, description: string) {
  try {
    return Buffer.from(await readFile(filePath));
  } catch (error) {
    throw new Sb3BuilderError(`Cannot read ${description}`, {
      stage: 'dsl4-build-input',
      code: 'K4-BUILD-INPUT-001',
      cause: error,
    });
  }
}

async function persistSourceManifest(
  manifestPath: string,
  manifest: Readonly<Record<string, unknown>>,
) {
  const temporaryPath = `${manifestPath}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`;
  try {
    const source = serializeDsl4ExternalSourceManifest(manifest, {
      filename: path.basename(manifestPath),
    });
    await writeFile(temporaryPath, source, {flag: 'wx'});
    await rename(temporaryPath, manifestPath);
  } catch (error) {
    await rm(temporaryPath, {force: true}).catch(() => {});
    throw new Sb3BuilderError('Cannot persist the stable story cache identity', {
      stage: 'dsl4-build-input',
      code: 'K4-SOURCE-MANIFEST-WRITE-001',
      cause: error,
    });
  }
}

/** Build and atomically install one self-contained DSL 4.0 SB3. */
export async function buildDsl4RuntimeComponentFile(options: {
  baseSb3: string;
  projectRoot: string;
  sourceManifest?: string;
  source?: string;
  sourceId?: string;
  embeddedSourceDocuments?: boolean;
  output: string;
  sourceFrontend: Dsl4SourceFrontend;
  controlProfile: string;
  channel: 'bundled' | 'unbundled';
  maxSourceBytes: number;
  maxAssetFileBytes: number;
  maxAssetFiles: number;
  maxTotalAssetBytes: number;
  assetConfig?: string;
  assetLock?: string;
  assetProfile?: string;
  maxAssetConfigBytes?: number;
  maxAssetLockBytes?: number;
  featureFlags?: unknown;
  maxSourceFiles?: number;
  maxTotalSourceBytes?: number;
  maxIncludeDepth?: number;
  historyNavigationAvailable?: boolean;
  replaceExisting?: boolean;
  distributionProfile?: Dsl4DistributionProfile;
  subtleCrypto?: Dsl4SubtleCrypto | undefined;
  createStoryId?: () => string;
}) {
  if (!isRecord(options)) {
    throw new TypeError('DSL 4.0 file build options are required');
  }
  const baseSb3 = requiredPath(options.baseSb3, 'baseSb3');
  const projectRoot = requiredPath(options.projectRoot, 'projectRoot');
  const output = requiredPath(options.output, 'output');
  const outputFilename = path.basename(output);
  const outputName = path.basename(outputFilename, '.sb3');
  if (
    path.extname(outputFilename) !== '.sb3' ||
    outputName.length === 0 ||
    outputFilename !== `${outputName}.sb3`
  ) {
    throw new Sb3BuilderError('output must name one .sb3 file', {
      stage: 'dsl4-build-output',
      code: 'K4-BUILD-OUTPUT-001',
    });
  }
  if (!options.sourceFrontend || typeof options.sourceFrontend.parse !== 'function') {
    throw new TypeError('sourceFrontend must provide parse');
  }
  const sourceIncludesEnabled =
    isRecord(options.featureFlags) && options.featureFlags.dsl4SourceIncludes === true;
  const rootBinaryEntriesEnabled =
    isRecord(options.featureFlags) && options.featureFlags.dsl4RootBinaryEntryPackaging === true;
  const sourceLimits = resolveDsl4BuildSourceLimits({
    sourceIncludesEnabled,
    maxSourceBytes: options.maxSourceBytes,
    maxTotalSourceBytes: options.maxTotalSourceBytes,
  });

  const [baseSb3Bytes, resolvedSource] = await Promise.all([
    readInput(baseSb3, 'base SB3'),
    resolveDsl4ProjectSource({
      projectRoot,
      ...(options.sourceManifest === undefined ? {} : {sourceManifest: options.sourceManifest}),
      ...(options.source === undefined ? {} : {source: options.source}),
      ...(options.sourceId === undefined ? {} : {sourceId: options.sourceId}),
    }),
  ]);
  const identity = resolvedSource.manifestExists
    ? ensureDsl4ExternalSourceCacheIdentity(resolvedSource.manifest, {
        ...(options.createStoryId === undefined ? {} : {createStableId: options.createStoryId}),
      })
    : {created: false, manifest: resolvedSource.manifest};
  const sourceManifest = identity.manifest;
  const baseProject = readSb3(baseSb3Bytes).project;
  const usesStandardRuntime =
    Array.isArray(baseProject.extensions) &&
    baseProject.extensions.includes('kubohiroyakamishibai4') &&
    typeof baseProject.extensionURLs?.kubohiroyakamishibai4 === 'string';
  const runtimeExtensionSource = usesStandardRuntime
    ? await (resolveDsl4BuildFeatureFlags(options.featureFlags).runtimeFeatureFlags
        .dsl4NarrativeControl
        ? readDsl4NarrativeRuntimeExtensionSource()
        : readDsl4PlaybackRuntimeExtensionSource())
    : undefined;
  // Works fetch PoseNet from the Kamishibai site and share it through Cache Storage; a build whose
  // asset profile forbids the network embeds the model data instead.
  const poseNetBundle = usesStandardRuntime
    ? ({network}: {network: 'allowed' | 'forbidden'}) =>
        network === 'forbidden'
          ? readDsl4PlaybackPoseNetBundle({subtleCrypto: options.subtleCrypto})
          : Promise.resolve(createDsl4PoseNetRemoteDescriptor())
    : undefined;
  // Works load the TensorFlow.js runtime from the Kamishibai site; a network-free build carries it.
  const tmRuntime = usesStandardRuntime
    ? ({network}: {network: 'allowed' | 'forbidden'}) =>
        network === 'forbidden'
          ? readDsl4PlaybackTMOfflineRuntime({subtleCrypto: options.subtleCrypto})
          : Promise.resolve(undefined)
    : undefined;
  const buildOptions = {
    baseSb3Bytes,
    projectRoot,
    sourceManifest,
    ...(options.embeddedSourceDocuments === undefined
      ? {}
      : {embeddedSourceDocuments: options.embeddedSourceDocuments}),
    sourceFrontend: options.sourceFrontend,
    controlProfile: options.controlProfile,
    channel: options.channel,
    maxSourceBytes: options.maxSourceBytes,
    maxAssetFileBytes: options.maxAssetFileBytes,
    maxAssetFiles: options.maxAssetFiles,
    maxTotalAssetBytes: options.maxTotalAssetBytes,
    ...(runtimeExtensionSource === undefined ? {} : {runtimeExtensionSource}),
    ...(poseNetBundle === undefined ? {} : {poseNetBundle}),
    ...(tmRuntime === undefined ? {} : {tmRuntime}),
    ...(options.assetConfig === undefined ? {} : {assetConfig: options.assetConfig}),
    ...(options.assetLock === undefined ? {} : {assetLock: options.assetLock}),
    ...(options.assetProfile === undefined ? {} : {assetProfile: options.assetProfile}),
    ...(options.maxAssetConfigBytes === undefined
      ? {}
      : {maxAssetConfigBytes: options.maxAssetConfigBytes}),
    ...(options.maxAssetLockBytes === undefined
      ? {}
      : {maxAssetLockBytes: options.maxAssetLockBytes}),
    ...(options.featureFlags === undefined ? {} : {featureFlags: options.featureFlags}),
    ...(options.maxSourceFiles === undefined ? {} : {maxSourceFiles: options.maxSourceFiles}),
    ...(options.maxTotalSourceBytes === undefined
      ? {}
      : {maxTotalSourceBytes: options.maxTotalSourceBytes}),
    ...(options.maxIncludeDepth === undefined ? {} : {maxIncludeDepth: options.maxIncludeDepth}),
    historyNavigationAvailable: options.historyNavigationAvailable ?? false,
    replaceExisting: options.replaceExisting ?? false,
    ...(options.distributionProfile === undefined
      ? {}
      : {distributionProfile: options.distributionProfile}),
    ...(options.subtleCrypto === undefined ? {} : {subtleCrypto: options.subtleCrypto}),
  };
  const built = await buildDsl4RuntimeComponent(buildOptions);
  if (identity.created && resolvedSource.manifestPath !== null) {
    await persistSourceManifest(resolvedSource.manifestPath, sourceManifest);
  }
  const outputPaths = await installBundleTransactionally({
    outputDirectory: path.dirname(output),
    outputName,
    files: new Map([[outputFilename, built.bytes]]),
    validateCandidate: async (candidateDirectory) => {
      const candidateBytes = await readFile(path.join(candidateDirectory, outputFilename));
      if (!candidateBytes.equals(built.bytes)) {
        throw new Sb3BuilderError('Candidate SB3 bytes changed before validation', {
          stage: 'dsl4-output-verify',
          code: 'K4-BUILD-CANDIDATE-MISMATCH',
        });
      }
      const {project} = readSb3(candidateBytes);
      const loaded = await (
        rootBinaryEntriesEnabled ? loadDsl4BinaryEntryRuntimeComponent : loadDsl4RuntimeComponent
      )(project, options.sourceFrontend, {
        maxSourceBytes: sourceLimits.maxPackagedSourceBytes,
        maxAssetFiles: options.maxAssetFiles,
        maxAssetFileBytes: options.maxAssetFileBytes,
        maxTotalAssetBytes: options.maxTotalAssetBytes,
        historyNavigationAvailable: options.historyNavigationAvailable ?? false,
        ...(options.subtleCrypto === undefined ? {} : {subtleCrypto: options.subtleCrypto}),
      });
      if (!loaded.ok) {
        const first = loaded.diagnostics[0];
        throw new Dsl4BuildError(first?.message ?? 'Candidate DSL 4.0 SB3 validation failed', {
          stage: 'dsl4-output-verify',
          code: first?.code ?? 'K4-BUILD-VALIDATION-001',
          diagnostics: loaded.diagnostics,
        });
      }
    },
  });
  return Object.freeze({
    // The transaction installs the output filename it was given.
    outputPath: outputPaths[outputFilename] ?? outputFilename,
    runtimeComponent: built.runtimeComponent,
  });
}
