import {
  createDsl4PublicationStageArchive,
  unpackDsl4PublicationStageArchive,
} from './publication-stage-archive.js';
import {strToU8, zipSync} from 'fflate';
import {loadDsl4RuntimeComponent} from '../runtime-artifact-loader.js';
import type {Dsl4SourceFrontend} from '../source-frontend.js';
import {createDsl4PublicationSourceProvider} from '../publication-loader.js';
import {
  convertDsl4PublicationToCompiledProfile,
  type Dsl4DistributionProfile,
  dsl4DistributionProfiles,
} from '../compiled-project.js';
import {createDsl4SealedKeyCache, type Dsl4SealedUnlock} from '../sealed-story-artifact.js';
import {
  convertDsl4PublicationToSealedProfile,
  publicationSegmentProject,
  readDsl4PublicationChapterText,
  readDsl4SealedPublicationChapter,
  validateDsl4PublicationProject,
} from './publication-project.js';

/** Preserve every verified chapter in one Standard-compatible SB3, including offline sources. */
export async function createDsl4PublicationDistributionSb3({
  project,
  projectFiles,
  sourceFrontend,
  maxSourceBytes,
  maxAssetFiles,
  maxTotalAssetBytes,
  distributionProfile,
  sealedPassword,
  sealedIterations,
  unlockSealedStory,
}: {
  project: unknown;
  projectFiles: unknown;
  sourceFrontend: Dsl4SourceFrontend;
  maxSourceBytes: number;
  maxAssetFiles: number;
  maxTotalAssetBytes: number;
  /**
   * Omit to keep the publication's current profile. `compiled` drops every chapter's YAML;
   * `sealed` also encrypts each chapter and its assets under `sealedPassword`.
   */
  distributionProfile?: Dsl4DistributionProfile | 'sealed';
  /** The new password when sealing a publication that is not sealed yet. */
  sealedPassword?: string;
  sealedIterations?: number;
  /** Opens an already sealed publication so its chapters can be verified before saving. */
  unlockSealedStory?: Dsl4SealedUnlock;
}) {
  if (
    distributionProfile !== undefined &&
    distributionProfile !== 'sealed' &&
    !dsl4DistributionProfiles.includes(distributionProfile)
  )
    throw new TypeError(
      `distributionProfile must be ${[...dsl4DistributionProfiles, 'sealed'].join(', ')}`,
    );
  const current = validateDsl4PublicationProject(project, sourceFrontend);
  const target = distributionProfile ?? current.profile;
  // A profile only moves forward: YAML cannot come back once dropped, nor a story once sealed.
  const order = ['source', 'compiled', 'sealed'];
  if (order.indexOf(target) < order.indexOf(current.profile))
    throw new TypeError(`A ${current.profile} publication cannot be saved as ${target}`);
  if ((target === 'sealed' && current.profile !== 'sealed') !== (sealedPassword !== undefined))
    throw new TypeError('sealedPassword is required with, and only with, sealing a publication');
  if (target !== current.profile) {
    // Convert a copy: the open project keeps its YAML (or its compiled form) for further editing.
    project = structuredClone(project);
    if (current.profile === 'source')
      await convertDsl4PublicationToCompiledProfile(project as Record<string, unknown>, {
        sourceFrontend,
        maxSourceBytes,
      });
    if (target === 'sealed')
      await convertDsl4PublicationToSealedProfile(
        project as Record<string, unknown>,
        sealedPassword!,
        sealedIterations === undefined ? {} : {iterations: sealedIterations},
      );
  }
  const publication = validateDsl4PublicationProject(project, sourceFrontend);
  // A just-sealed publication verifies with the password it was sealed under.
  const unlock: Dsl4SealedUnlock | undefined =
    sealedPassword === undefined ? unlockSealedStory : () => sealedPassword;
  if (publication.profile === 'sealed' && typeof unlock !== 'function')
    throw new TypeError('A sealed publication needs its password to be verified and saved');
  const keyCache = createDsl4SealedKeyCache();
  const provider = createDsl4PublicationSourceProvider({
    mode: 'offline',
    readEntry: async (entry) => {
      const text =
        publication.profile === 'sealed'
          ? await readDsl4SealedPublicationChapter(publication, entry, unlock!, {keyCache})
          : readDsl4PublicationChapterText(publication, entry);
      if (text === null) throw new TypeError('A sealed publication was not opened');
      return text === undefined ? null : strToU8(text);
    },
  });
  for (const segment of publication.manifest.segments) {
    await provider.read(segment);
    const result = await loadDsl4RuntimeComponent(
      publicationSegmentProject(
        project,
        publication.components[segment.id],
        publication.assetFiles,
      ),
      sourceFrontend,
      {
        maxSourceBytes,
        maxAssetFiles,
        maxTotalAssetBytes,
        ...(publication.profile === 'sealed'
          ? {unlockSealedStory: unlock!, sealedKeyCache: keyCache}
          : {}),
      },
    );
    if (!result.ok) throw new TypeError(`Publication distribution rejected: ${segment.id}`);
  }
  if (!projectFiles || typeof projectFiles !== 'object' || Array.isArray(projectFiles))
    throw new TypeError('Standard project files required');
  const archive: Record<string, Uint8Array> = Object.create(null);
  let total = 0;
  const stage = await createDsl4PublicationStageArchive(
    project as Readonly<Record<string, unknown>>,
    projectFiles,
  );
  const distribution = structuredClone(project) as {
    extensionStorage: {kubohiroyakamishibai4: {publication: Record<string, unknown>}};
  };
  distribution.extensionStorage.kubohiroyakamishibai4.publication.stageArchive = stage.descriptor;
  const files: Record<string, unknown> = {
    ...unpackDsl4PublicationStageArchive(stage.bytes),
    ...projectFiles,
    'project.json': JSON.stringify(distribution),
  };
  if (Object.keys(files).length > 4096) throw new TypeError('Publication SB3 has too many entries');
  for (const [name, value] of Object.entries(files)) {
    if (
      name.startsWith('/') ||
      name.includes('\\') ||
      name.includes('\0') ||
      name.split('/').some((part) => !part || part === '.' || part === '..')
    )
      throw new TypeError('Unsafe publication archive entry');
    const bytes =
      typeof value === 'string'
        ? strToU8(value)
        : value instanceof Uint8Array
          ? new Uint8Array(value)
          : value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : null;
    if (!bytes) throw new TypeError('Invalid publication archive bytes');
    if (name === 'project.json' && bytes.length > 16 * 1024 * 1024)
      throw new TypeError('Publication project exceeds 16 MiB');
    total += bytes.length;
    if (total > 256 * 1024 * 1024) throw new TypeError('Publication archive exceeds 256 MiB');
    archive[name] = bytes;
  }
  return Object.freeze({bytes: zipSync(archive), filename: `${publication.manifest.id}.sb3`});
}
