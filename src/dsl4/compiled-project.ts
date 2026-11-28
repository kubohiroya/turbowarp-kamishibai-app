import {assertKamishibaiDocumentSourceReady} from './embedded-yaml-view-state.js';
import {removeDsl4EmbeddedYamlHats} from './embedded-yaml-hat.js';
import {
  createDsl4CompiledStoryArtifact,
  Dsl4CompiledStoryError,
} from './compiled-story-artifact.js';
import {validateDsl4AssetDistributionResolution} from './asset-distribution-profile.js';
import {
  dsl4SourceStoragePaths,
  resolveDsl4EmbeddedSource,
  validateDsl4EmbeddedSourceDescriptor,
} from './source-descriptor.js';
import type {Dsl4SourceFrontend} from './source-frontend.js';
import {
  dsl4ConfigBlockSourceHatOpcode,
  dsl4LabeledBlockSourceHatOpcode,
} from './block-source-shared.js';
import type {Dsl4SubtleCrypto} from './subtle-crypto.js';

/** The distribution profiles a build can write. */
export const dsl4DistributionProfiles = Object.freeze(['source', 'compiled'] as const);
export type Dsl4DistributionProfile = (typeof dsl4DistributionProfiles)[number];

const sourceHatOpcodes = new Set([dsl4LabeledBlockSourceHatOpcode, dsl4ConfigBlockSourceHatOpcode]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(code: string, message: string): never {
  throw new Dsl4CompiledStoryError(code, message);
}

interface CompileOptions {
  sourceFrontend: Dsl4SourceFrontend;
  maxSourceBytes: number;
  subtleCrypto?: Dsl4SubtleCrypto | undefined;
  project?: unknown;
}

/**
 * Drop every kamishibai source declaration stack, with its shadows and the comments on it.
 *
 * A block-source project keeps its YAML as text inputs under these hats, so the compiled profile
 * cannot leave them behind. Other scripts are untouched.
 */
export function removeDsl4BlockSourceDeclarations(project: Record<string, unknown>) {
  if (!Array.isArray(project.targets)) fail('K4-COMPILED-BUILD-001', 'Project has no targets');
  let removed = 0;
  for (const target of project.targets) {
    if (!isRecord(target) || !isRecord(target.blocks)) continue;
    const blocks = target.blocks;
    const root = (id: string) => {
      const seen = new Set<string>();
      let current = id;
      for (;;) {
        const block = blocks[current];
        if (!isRecord(block) || typeof block.parent !== 'string' || seen.has(current))
          return current;
        seen.add(current);
        current = block.parent;
      }
    };
    const doomed = new Set(
      Object.keys(blocks).filter((id) => {
        const top = blocks[root(id)];
        return isRecord(top) && typeof top.opcode === 'string' && sourceHatOpcodes.has(top.opcode);
      }),
    );
    for (const id of doomed) delete blocks[id];
    removed += doomed.size;
    if (isRecord(target.comments)) {
      for (const [id, comment] of Object.entries(target.comments)) {
        if (isRecord(comment) && typeof comment.blockId === 'string' && doomed.has(comment.blockId))
          delete target.comments[id];
      }
    }
  }
  return removed;
}

/**
 * Replace one runtime component's YAML descriptor by its compiled story, in place.
 *
 * The story is re-parsed from the embedded canonical source, exactly as the runtime loader would,
 * and that StoryDocument is compiled. The runtime artifact descriptor is left as it is, because it
 * already names the source integrity the compiled story carries.
 */
export async function compileDsl4RuntimeComponentStorage(
  component: Record<string, unknown>,
  {
    sourceFrontend,
    maxSourceBytes,
    subtleCrypto = globalThis.crypto?.subtle,
    project,
  }: CompileOptions,
) {
  if (component.compiled !== undefined)
    fail('K4-COMPILED-BUILD-001', 'Runtime component is already compiled');
  const descriptor = await validateDsl4EmbeddedSourceDescriptor(component.source, {
    maxSourceBytes,
    subtleCrypto,
  });
  const parsed = sourceFrontend.parse(descriptor.text, {
    sourceId: descriptor.sourceId,
    project,
  });
  if (!parsed.ok) fail('K4-COMPILED-BUILD-001', 'Embedded source no longer parses');
  const storyDocument =
    component.assetDistribution === undefined
      ? parsed.storyDocument
      : validateDsl4AssetDistributionResolution(parsed.storyDocument, component.assetDistribution)
          .storyDocument;
  const compiled = await createDsl4CompiledStoryArtifact(storyDocument, {
    sourceIntegrity: descriptor.integrity,
    ...(descriptor.cacheIdentity === undefined ? {} : {cacheIdentity: descriptor.cacheIdentity}),
    subtleCrypto,
  });
  delete component.source;
  delete component.sourceDocuments;
  delete component.editorViews;
  delete component.assetDistribution;
  component.compiled = structuredClone(compiled);
  return compiled;
}

/** Turn a verified `source` project.json into the `compiled` profile, in place. */
export async function convertDsl4ProjectToCompiledProfile(
  project: Record<string, unknown>,
  options: CompileOptions,
) {
  const source = await resolveDsl4EmbeddedSource(project, {
    maxSourceBytes: options.maxSourceBytes,
    ...(options.subtleCrypto === undefined ? {} : {subtleCrypto: options.subtleCrypto}),
  });
  const segments = dsl4SourceStoragePaths[source.channel as keyof typeof dsl4SourceStoragePaths]
    .split('.')
    .slice(0, -1);
  let owner: unknown = project;
  for (const segment of segments) owner = isRecord(owner) ? owner[segment] : undefined;
  if (!isRecord(owner) || owner.source === undefined)
    fail('K4-COMPILED-BUILD-001', 'Embedded source storage could not be located');
  assertKamishibaiDocumentSourceReady(project, {sourceFrontend: options.sourceFrontend});
  const compiled = await compileDsl4RuntimeComponentStorage(owner, {
    ...options,
    project,
  });
  removeDsl4BlockSourceDeclarations(project);
  removeDsl4EmbeddedYamlHats(project);
  return compiled;
}
