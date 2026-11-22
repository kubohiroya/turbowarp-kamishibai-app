import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {poseNetBundleManifest} from '@kubohiroya/turbowarp-teachable-machine/posenet';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const publishedDigestsPath = path.join(
  projectRoot,
  'test/fixtures/dsl4/posenet-published-digests.json',
);

type PublishedPoseNetFile = {sha256: string; size: number; path: string; since: string};

export async function readPublishedPoseNetDigests(): Promise<PublishedPoseNetFile[]> {
  const record = JSON.parse(await readFile(publishedDigestsPath, 'utf8'));
  if (record?.formatVersion !== 1 || !Array.isArray(record.files)) {
    throw new Error('posenet-published-digests.json must be formatVersion 1 with files');
  }
  return record.files;
}

/**
 * Write the PoseNet model files to `<site>/posenet/sha256-<hex>`.
 *
 * Works built since 4.0.3 fetch these content-addressed URLs instead of embedding the model data,
 * and every Pages deployment replaces the whole site. So the site build refuses to drop a digest
 * that an earlier release published: a new PoseNet model is added beside the old one, never
 * instead of it.
 */
export async function writePoseNetSiteAssets(siteRoot: string) {
  const directory = path.join(siteRoot, 'posenet');
  await mkdir(directory, {recursive: true});
  const produced = new Map<string, number>();
  for (const file of poseNetBundleManifest.files) {
    const bytes = await readFile(fileURLToPath(import.meta.resolve(file.packageSpecifier)));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== file.sha256 || bytes.byteLength !== file.size) {
      throw new Error(`PoseNet ${file.path} does not match its pinned digest`);
    }
    await writeFile(path.join(directory, `sha256-${sha256}`), bytes);
    produced.set(sha256, bytes.byteLength);
  }
  const published = await readPublishedPoseNetDigests();
  const missing = published.filter(({sha256, size}) => produced.get(sha256) !== size);
  if (missing.length > 0) {
    throw new Error(
      `PoseNet files published by earlier releases are no longer produced: ${missing
        .map(({path: name, sha256}) => `${name} (${sha256})`)
        .join(', ')}`,
    );
  }
  const unrecorded = [...produced.keys()].filter(
    (sha256) => !published.some((file) => file.sha256 === sha256),
  );
  if (unrecorded.length > 0) {
    throw new Error(
      `Record new PoseNet digests in posenet-published-digests.json: ${unrecorded.join(', ')}`,
    );
  }
  return [...produced].map(([sha256, size]) => ({file: `posenet/sha256-${sha256}`, size}));
}
