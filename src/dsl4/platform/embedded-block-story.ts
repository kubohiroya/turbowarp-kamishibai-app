import {isDsl4ConfigBlockSourceHat, isDsl4LabeledBlockSourceHat} from '../block-source-shared.js';
import {rebindDsl4AssetBundleReferences} from '../asset-bundle-references.js';
import {locateDsl4BlockDiagnostic} from '../block-source-diagnostic-location.js';
import {createDsl4EmbeddedAssetBundle} from '../asset-bundle-descriptor.js';
import {createDsl4BlockSourceGraph} from '../block-source-export.js';
import {createDsl4RuntimeArtifactDescriptor} from '../runtime-artifact-descriptor.js';
import {createDsl4EmbeddedSourceDescriptor} from '../source-descriptor.js';
import type {Dsl4SourceFrontend} from '../source-frontend.js';
import {createDsl4SourceGraphFrontend} from '../source-graph-frontend.js';
import {dsl4StandardProductionFeatureFlags} from '../feature-flags.js';
import {} from '../structured-block-source.js';
import type {Dsl4SubtleCrypto} from '../subtle-crypto.js';
import {extractDsl4BlockSourcesFromProject} from '../turbowarp-yaml-json-block-source.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Detect declarations before parsing so invalid scripts cannot fall through to the file menu. */
export function hasDsl4EmbeddedBlockStory(project: unknown): boolean {
  if (!isRecord(project) || !Array.isArray(project.targets)) return false;
  return project.targets.some(
    (target) =>
      isRecord(target) &&
      isRecord(target.blocks) &&
      Object.values(target.blocks).some(
        (block) =>
          isRecord(block) &&
          typeof block.opcode === 'string' &&
          (isDsl4LabeledBlockSourceHat(block.opcode) ||
            isDsl4ConfigBlockSourceHat(block.opcode) ||
            block.opcode.endsWith('whenDsl4Source')),
      ),
  );
}

function throwDiagnostic(
  diagnostics: readonly {code?: string; message?: string; targetName?: string; blockId?: string}[],
): never {
  const first = diagnostics[0];
  throw Object.assign(new Error(first?.message ?? 'The embedded block story is invalid.'), {
    ...first,
    code:
      first?.blockId && !first.code?.startsWith('K4-BLOCK-SOURCE')
        ? 'K4-BLOCK-SOURCE-VALIDATION-001'
        : (first?.code ?? 'K4-BLOCK-SOURCE-001'),
    diagnosticCode: first?.code,
  });
}

function nonFileManifestAsset(id: string, asset: Record<string, unknown>) {
  return {
    id,
    kind: asset.kind,
    loading: asset.loading,
    ...(asset.target === undefined ? {} : {target: asset.target}),
    ...(asset.bitmapResolution === undefined ? {} : {bitmapResolution: asset.bitmapResolution}),
    source:
      asset.delivery === 'remote'
        ? {type: 'remote', ...(isRecord(asset.source) ? asset.source : {})}
        : {type: 'project', name: asset.name},
  };
}

/** Update editable references only after authenticating the retained file bundle. */
async function updateFileBundleReferences(
  storyDocument: Readonly<Record<string, unknown>>,
  previous: Record<string, unknown>,
  options: {
    maxAssetFiles: number;
    maxTotalAssetBytes: number;
    subtleCrypto?: Dsl4SubtleCrypto | undefined;
  },
) {
  return (
    await rebindDsl4AssetBundleReferences(storyDocument, previous, {
      maxFiles: options.maxAssetFiles,
      maxFileBytes: options.maxTotalAssetBytes,
      maxTotalBytes: options.maxTotalAssetBytes,
      subtleCrypto: options.subtleCrypto,
    })
  ).descriptor;
}

/** Compile the current blocks into a temporary component consumed by the existing story runtime. */
export async function prepareDsl4EmbeddedBlockStoryProject(
  project: Record<string, unknown>,
  sourceFrontend: Dsl4SourceFrontend,
  options: {
    maxSourceBytes: number;
    maxAssetFiles: number;
    maxTotalAssetBytes: number;
    subtleCrypto?: Dsl4SubtleCrypto | undefined;
    onBlockSources?: (sources: ReturnType<typeof extractDsl4BlockSourcesFromProject>) => void;
  },
): Promise<Record<string, unknown>> {
  if (!hasDsl4EmbeddedBlockStory(project)) return project;
  const blockSources = extractDsl4BlockSourcesFromProject(project);
  const graph = await createDsl4BlockSourceGraph(blockSources, {
    maxSourceBytes: options.maxSourceBytes,
    maxTotalSourceBytes: options.maxSourceBytes,
  });
  const parsed = createDsl4SourceGraphFrontend(sourceFrontend).parse(graph, {
    project,
    featureFlags: dsl4StandardProductionFeatureFlags,
    sourceId: blockSources.entryPath,
    maxComposedSourceBytes: options.maxSourceBytes,
  });
  if (!parsed.ok)
    throwDiagnostic(
      parsed.diagnostics.map((diagnostic) => locateDsl4BlockDiagnostic(diagnostic, blockSources)),
    );
  const storyDocument = (
    parsed as typeof parsed & {storyDocument: Readonly<Record<string, unknown>>}
  ).storyDocument;
  const source = await createDsl4EmbeddedSourceDescriptor(parsed.canonicalSource, {
    sourceId: blockSources.entryPath,
    displayName: blockSources.entryPath,
    sourceOrigins: storyDocument.sourceOrigins,
    maxSourceBytes: options.maxSourceBytes,
    subtleCrypto: options.subtleCrypto,
  });
  const artifactResult = await createDsl4RuntimeArtifactDescriptor(
    storyDocument,
    source,
    'production',
    options,
  );
  if (!artifactResult.ok) throwDiagnostic(artifactResult.diagnostics);
  options.onBlockSources?.(blockSources);

  // Preserve other extensions and binary entry locations; only this startup snapshot is changed.
  const snapshot = structuredClone(project);
  const storage = isRecord(snapshot.extensionStorage) ? snapshot.extensionStorage : {};
  snapshot.extensionStorage = storage;
  const bundle = isRecord(storage.kubohiroyakamishibai4) ? storage.kubohiroyakamishibai4 : {};
  const components = isRecord(bundle.components) ? bundle.components : {};
  const bundled = components.kubohiroyakamishibairuntime4;
  const direct = storage.kubohiroyakamishibairuntime4;
  if (isRecord(bundled) && isRecord(direct)) {
    throw Object.assign(new Error('DSL 4.0 runtime component exists in both storage channels'), {
      code: 'K4-ARTIFACT-CHANNEL-AMBIGUOUS',
    });
  }
  const previous = isRecord(bundled) ? bundled : isRecord(direct) ? direct : {};
  const storyAssets = storyDocument.assets as Readonly<Record<string, Record<string, unknown>>>;
  let assets = previous.assets;
  if (!Object.values(storyAssets).some((asset) => typeof asset.file === 'string')) {
    assets = await createDsl4EmbeddedAssetBundle(
      storyDocument,
      {
        manifest: {
          formatVersion: 1,
          assets: Object.entries(storyAssets)
            .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
            .map(([id, asset]) => nonFileManifestAsset(id, asset)),
        },
        getFile() {
          throw new Error('Project and remote assets have no embedded file payload.');
        },
      },
      {
        maxFiles: options.maxAssetFiles,
        maxTotalBytes: options.maxTotalAssetBytes,
        subtleCrypto: options.subtleCrypto,
      },
    );
  } else if (isRecord(assets)) {
    assets = await updateFileBundleReferences(storyDocument, assets, options);
  }
  // File payloads and archive references survive edits to project and remote asset definitions.
  const component: Record<string, unknown> = {
    ...previous,
    source,
    artifact: (artifactResult as typeof artifactResult & {artifact: unknown}).artifact,
    assets,
    application: {mode: 'story'},
  };
  // A distribution resolution is tied to its old source; the current blocks define this story.
  delete component.assetDistribution;
  if (isRecord(direct)) storage.kubohiroyakamishibairuntime4 = component;
  else {
    storage.kubohiroyakamishibai4 = {
      ...bundle,
      components: {...components, kubohiroyakamishibairuntime4: component},
    };
  }
  return snapshot;
}
