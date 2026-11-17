import assert from 'node:assert/strict';
import {mkdir, mkdtemp, rename, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  computeReleaseSourceIdentity,
  createSb3ReleaseSnapshot,
  freezeSb3ReleaseSnapshot,
  readSb3ReleaseSnapshotMetadata,
  recordPublishedSb3ReleaseSnapshot,
  verifySb3ReleaseSnapshot,
  writeSb3ReleaseCandidate,
} from '@kubohiroya/sb3-toolchain';

import {createKamishibaiSb3} from './build.ts';
import {createDsl4ReleaseSourceFiles} from './dsl4-downloadable-release.ts';
import {
  assertDsl4ReleaseCanUpdate,
  assertDsl4ReleaseDownloadCatalog,
  assertDsl4ReleaseMetadata,
  assertDsl4ReleasePackageVersion,
  dsl4ReleaseArtifactIdentity,
  dsl4ReleaseCandidateArtifactPath,
  dsl4ReleaseIdentity,
  dsl4ReleaseMetadataPath,
  dsl4ReleasePublicationPolicy,
  dsl4ReleasePublicationUrls,
  dsl4ReleaseSb3Options,
  dsl4ReleaseVersion,
} from './dsl4-release-policy.ts';
import type {Dsl4ReleaseMetadata} from './dsl4-release-policy.ts';

/**
 * Drives the generic SB3 release snapshot lifecycle from `@kubohiroya/sb3-toolchain` — source
 * identity, deterministic build verification, artifact hash and size metadata, candidate write,
 * freeze, and published artifact verification — under the DSL 4 policy in
 * `./dsl4-release-policy.ts`.
 */

export * from './dsl4-release-policy.ts';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/** The release source the SB3 builder materializes: one relative path per file, in insertion order. */
type Dsl4ReleaseSourceFiles = Map<string, string | Uint8Array>;

/** The SB3 builder the workflow drives, named as the narrow call so callers can substitute it. */
type Dsl4ReleaseSb3Builder = (
  options: ReturnType<typeof dsl4ReleaseSb3Options>,
) => Promise<{archive: Uint8Array}>;

/** Options every read-only workflow entry point accepts. */
interface Dsl4ReleaseWorkflowOptions {
  root?: string;
  createSourceFiles?: () => Promise<Dsl4ReleaseSourceFiles>;
  createSb3?: Dsl4ReleaseSb3Builder;
  fetchReleaseArtifact?: (metadata: Dsl4ReleaseMetadata) => Promise<Uint8Array>;
  verifyCatalog?: boolean;
  verifyPackageVersion?: boolean;
}

export const createDsl4ReleaseSourceIdentity = computeReleaseSourceIdentity;

async function readMetadata(root: string): Promise<Dsl4ReleaseMetadata | null> {
  try {
    const metadata = await readSb3ReleaseSnapshotMetadata(path.join(root, dsl4ReleaseMetadataPath));
    return assertDsl4ReleaseMetadata(metadata);
  } catch (error) {
    if ((error as {code?: unknown} | null)?.code === 'ENOENT') return null;
    throw error;
  }
}

/** Materialize the in-memory release source into a throwaway directory the SB3 builder can read. */
async function withReleaseSourceDirectory<T>(
  files: Dsl4ReleaseSourceFiles,
  build: (sourceDirectory: string) => Promise<T>,
) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'tmpose-kamishibai-release-'));
  const sourceDirectory = path.join(temporaryRoot, 'app');
  try {
    for (const [relativePath, contents] of [...files.entries()].sort(([left], [right]) =>
      left.localeCompare(right, 'en'),
    )) {
      const outputPath = path.join(sourceDirectory, relativePath);
      await mkdir(path.dirname(outputPath), {recursive: true});
      await writeFile(outputPath, contents);
    }
    return await build(sourceDirectory);
  } finally {
    await rm(temporaryRoot, {force: true, recursive: true});
  }
}

function createReleaseSb3(
  root: string,
  files: Dsl4ReleaseSourceFiles,
  createSb3: Dsl4ReleaseSb3Builder,
) {
  return () =>
    withReleaseSourceDirectory(files, (sourceDirectory) =>
      createSb3(dsl4ReleaseSb3Options({root, sourceDirectory})),
    );
}

async function writeMetadataAtomically(root: string, metadata: Dsl4ReleaseMetadata) {
  const filename = path.join(root, dsl4ReleaseMetadataPath);
  await mkdir(path.dirname(filename), {recursive: true});
  const temporaryPath = `${filename}.tmp-${process.pid}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(metadata, null, 2)}\n`);
    await rename(temporaryPath, filename);
  } catch (error) {
    await rm(temporaryPath, {force: true});
    throw error;
  }
}

async function defaultFetchReleaseArtifact(metadata: Dsl4ReleaseMetadata) {
  const {createDownloadableReleaseSb3} = await import('./downloadable-releases.ts');
  const result = await createDownloadableReleaseSb3({
    ...metadata.artifact,
    buildDate: metadata.buildDate,
    series: metadata.series,
    version: metadata.version,
  });
  return result.archive;
}

/** Rebuild frozen bytes without changing tracked release metadata. */
export async function rebuildFrozenDsl4Release({
  root = repositoryRoot,
  createSourceFiles = createDsl4ReleaseSourceFiles,
  createSb3 = createKamishibaiSb3,
}: Dsl4ReleaseWorkflowOptions = {}) {
  const metadata = await readMetadata(root);
  assert(metadata, `Missing ${dsl4ReleaseMetadataPath}.`);
  assert.equal(metadata.state, 'frozen', 'Only a frozen snapshot can be attached.');
  const files = await createSourceFiles();
  const build = createReleaseSb3(root, files, createSb3);
  let archive: Uint8Array | undefined;
  await verifySb3ReleaseSnapshot({
    metadata,
    sourceFiles: files,
    createSb3: async () => {
      const result = await build();
      archive = result.archive;
      return result;
    },
  });
  assert(archive, 'Frozen verification did not rebuild the archive.');
  return {archive, metadata};
}

export async function updateDsl4Release({
  root = repositoryRoot,
  createSourceFiles = createDsl4ReleaseSourceFiles,
  createSb3 = createKamishibaiSb3,
}: Dsl4ReleaseWorkflowOptions = {}) {
  const previousMetadata = await readMetadata(root);
  assertDsl4ReleaseCanUpdate(previousMetadata);
  const files = await createSourceFiles();
  const built = await createSb3ReleaseSnapshot({
    artifact: {...dsl4ReleaseArtifactIdentity},
    createSb3: createReleaseSb3(root, files, createSb3),
    metadata: {...dsl4ReleaseIdentity},
    publication: {...dsl4ReleasePublicationPolicy},
    sourceFiles: files,
  });
  const metadata = assertDsl4ReleaseMetadata(built.metadata);
  await writeSb3ReleaseCandidate({
    archive: built.archive,
    artifactPath: path.join(root, dsl4ReleaseCandidateArtifactPath),
    metadata,
    metadataPath: path.join(root, dsl4ReleaseMetadataPath),
  });
  return {
    artifactPath: path.join(root, dsl4ReleaseCandidateArtifactPath),
    metadata,
    previousMetadata,
  };
}

export async function verifyDsl4ReleaseSnapshot({
  root = repositoryRoot,
  createSourceFiles = createDsl4ReleaseSourceFiles,
  createSb3 = createKamishibaiSb3,
  fetchReleaseArtifact = defaultFetchReleaseArtifact,
  verifyCatalog = true,
  verifyPackageVersion = true,
}: Dsl4ReleaseWorkflowOptions = {}) {
  const metadata = await readMetadata(root);
  assert(metadata, `Missing ${dsl4ReleaseMetadataPath}. Run pnpm release:dsl4:update.`);
  if (metadata.state === 'published') {
    await verifySb3ReleaseSnapshot({
      metadata,
      fetchPublishedArtifact: () => fetchReleaseArtifact(metadata),
    });
  } else {
    const files = await createSourceFiles();
    await verifySb3ReleaseSnapshot({
      createSb3: createReleaseSb3(root, files, createSb3),
      metadata,
      sourceFiles: files,
    });
  }
  if (verifyPackageVersion) await assertDsl4ReleasePackageVersion(root);
  if (verifyCatalog) await assertDsl4ReleaseDownloadCatalog(metadata);
  return metadata;
}

export const checkDsl4Release = verifyDsl4ReleaseSnapshot;

export async function verifyDsl4PublishedReleaseSnapshot(options: Dsl4ReleaseWorkflowOptions = {}) {
  const metadata = await readMetadata(options.root ?? repositoryRoot);
  assert(metadata, `Missing ${dsl4ReleaseMetadataPath}.`);
  assert.equal(metadata.state, 'published', `${dsl4ReleaseVersion} must be published.`);
  return verifyDsl4ReleaseSnapshot(options);
}

export async function freezeDsl4Release(options: Dsl4ReleaseWorkflowOptions = {}) {
  const metadata = await checkDsl4Release(options);
  if (metadata.state === 'frozen') return metadata;
  assert.equal(metadata.state, 'candidate', `${dsl4ReleaseVersion} is already published.`);
  const frozen = assertDsl4ReleaseMetadata(freezeSb3ReleaseSnapshot(metadata));
  await writeMetadataAtomically(options.root ?? repositoryRoot, frozen);
  return frozen;
}

/**
 * Produce a release and freeze it in one step.
 *
 * `update` and `freeze` exist separately so a candidate can be regenerated, but a candidate that
 * reaches `main` is a version whose artifact can still change underneath anyone who pins it —
 * which is how turbowarp-kamishibai-samples once pinned bytes that differed from the published
 * release. Cutting straight to `frozen` removes that window: the pull request's own CI runs
 * `check`, which rebuilds the SB3 from source and compares it, so the artifact is verified before
 * the merge rather than after it.
 *
 * Freezing is one-way. A frozen release cannot be regenerated, so a problem found later is fixed
 * by cutting the next candidate.
 */
export async function cutDsl4Release(options: Dsl4ReleaseWorkflowOptions = {}) {
  const {artifactPath, previousMetadata} = await updateDsl4Release(options);
  const metadata = await freezeDsl4Release(options);
  return {artifactPath, metadata, previousMetadata};
}

export async function recordDsl4Publication(
  urls: Parameters<typeof dsl4ReleasePublicationUrls>[0],
  {root = repositoryRoot, fetchReleaseArtifact = defaultFetchReleaseArtifact} = {},
) {
  const metadata = await readMetadata(root);
  assert(metadata, `Missing ${dsl4ReleaseMetadataPath}.`);
  assert.equal(
    metadata.state,
    'frozen',
    `${dsl4ReleaseVersion} must be frozen before publication.`,
  );
  const published = assertDsl4ReleaseMetadata(
    await recordPublishedSb3ReleaseSnapshot(metadata, dsl4ReleasePublicationUrls(urls), {
      fetchPublishedArtifact: () => fetchReleaseArtifact(metadata),
    }),
  );
  await writeMetadataAtomically(root, published);
  return published;
}

function argumentValue(name: string) {
  const position = process.argv.indexOf(name);
  return position === -1 ? undefined : process.argv[position + 1];
}

async function main() {
  const command = process.argv[2];
  if (command === 'update') {
    const {artifactPath, metadata, previousMetadata} = await updateDsl4Release();
    process.stdout.write(
      `Updated ${metadata.version} candidate: ${previousMetadata?.artifact.sha256 ?? 'new'} -> ${metadata.artifact.sha256}\n` +
        `Transient artifact: ${artifactPath}\nRun pnpm release:dsl4:check next.\n`,
    );
    return;
  }
  if (command === 'check') {
    const metadata = await checkDsl4Release();
    process.stdout.write(
      `Verified ${metadata.version} ${metadata.state}: ${metadata.artifact.sha256}\n`,
    );
    return;
  }
  if (command === 'verify-published-snapshot') {
    const metadata = await verifyDsl4PublishedReleaseSnapshot();
    process.stdout.write(
      `Verified ${metadata.version} published release asset: ${metadata.artifact.sha256}\n`,
    );
    return;
  }
  if (command === 'cut') {
    const {artifactPath, metadata, previousMetadata} = await cutDsl4Release();
    process.stdout.write(
      `Cut ${metadata.version} ${metadata.state}: ${previousMetadata?.artifact.sha256 ?? 'new'} -> ${metadata.artifact.sha256}\n` +
        `Transient artifact: ${artifactPath}\n` +
        `Attach it to the GitHub Release, then run pnpm release:dsl4:record-publication. npm publication is optional and requires separate authorization.\n`,
    );
    return;
  }
  if (command === 'freeze') {
    const metadata = await freezeDsl4Release();
    process.stdout.write(`Frozen ${metadata.version}: ${metadata.artifact.sha256}.\n`);
    return;
  }
  if (command === 'record-publication') {
    const metadata = await recordDsl4Publication({
      npmUrl: argumentValue('--npm-url'),
      githubReleaseUrl: argumentValue('--github-release-url'),
      pagesUrl: argumentValue('--pages-url'),
    });
    process.stdout.write(`Recorded ${metadata.version} as published.\n`);
    return;
  }
  throw new Error(
    'Usage: dsl4-release-workflow.ts <cut|update|check|verify-published-snapshot|freeze|record-publication>',
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
