import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';

import {dsl4PlaybackRuntimeSitePath} from './playback-runtime-site.ts';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const packageName = '@kubohiroya/turbowarp-kamishibai-app';
const generatedPath = 'builder/generated/dsl4-narrative-playback-runtime-extension.js';
/** The first release whose editor fetches its playback runtime from the site. */
export const dsl4FirstSitePlaybackRuntimeVersion = '4.0.10';

function releaseNumbers(version: string) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(version);
  return match ? match.slice(1).map(Number) : null;
}

function atLeast(version: string, minimum: string) {
  const left = releaseNumbers(version);
  const right = releaseNumbers(minimum)!;
  if (!left) return false;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index]! > right[index]!;
  }
  return true;
}

/** The releases since site playback runtimes, read from the release records, oldest first. */
export async function readSitePlaybackRuntimeVersions(root = projectRoot) {
  const versions = (await readdir(path.join(root, 'release-metadata')))
    .map((name) => /^(.+)\.json$/u.exec(name)?.[1])
    .filter((version): version is string => version !== undefined)
    .filter((version) => atLeast(version, dsl4FirstSitePlaybackRuntimeVersion));
  return versions.sort((left, right) => {
    const a = releaseNumbers(left)!;
    const b = releaseNumbers(right)!;
    return a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!;
  });
}

/** Read one file out of an npm package tarball (gzip-compressed ustar). */
export function readTarballFile(tarball: Uint8Array, wanted: string) {
  const archive = gunzipSync(tarball);
  const text = (start: number, length: number) =>
    archive
      .subarray(start, start + length)
      .toString('utf8')
      .replace(/\0.*$/su, '');
  let offset = 0;
  while (offset + 512 <= archive.length) {
    const name = text(offset, 100);
    if (name === '') break;
    const prefix = text(offset + 345, 155);
    const size = Number.parseInt(text(offset + 124, 12).trim() || '0', 8);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const start = offset + 512;
    if (fullName === wanted) return Buffer.from(archive.subarray(start, start + size));
    offset = start + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${wanted} is not in the package tarball`);
}

async function fetchPublishedPlaybackRuntime(version: string, fetchImpl: typeof fetch) {
  const registry = `https://registry.npmjs.org/${packageName.replace('/', '%2f')}/${version}`;
  const metadataResponse = await fetchImpl(registry);
  // A release cut but never published had no editor in anyone's hands, so nothing fetches it.
  if (metadataResponse.status === 404) return null;
  assert(metadataResponse.ok, `npm has no ${packageName}@${version} (${metadataResponse.status})`);
  const metadata = (await metadataResponse.json()) as {
    dist?: {tarball?: string; integrity?: string};
  };
  const {tarball, integrity} = metadata.dist ?? {};
  assert(typeof tarball === 'string' && typeof integrity === 'string');
  assert.match(integrity, /^sha512-/u);
  const tarballResponse = await fetchImpl(tarball);
  assert(tarballResponse.ok, `npm tarball ${tarball} returned ${tarballResponse.status}`);
  const bytes = new Uint8Array(await tarballResponse.arrayBuffer());
  assert.equal(
    `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    integrity,
    `${packageName}@${version} does not match its npm integrity`,
  );
  return readTarballFile(bytes, `package/dist/${generatedPath}`);
}

/**
 * Write each release's playback runtime to `<site>/runtime/<version>/kamishibai-playback.js`.
 *
 * The editor of a release fetches this file when it builds a work, and an editor keeps being used
 * long after newer releases, while every Pages deployment replaces the whole site. So the site keeps
 * the playback runtime of every release since it began: the current release's from this checkout,
 * each earlier published one from its npm package.
 */
export async function writePlaybackRuntimeSiteAssets(
  siteRoot: string,
  {fetchImpl = fetch, root = projectRoot}: {fetchImpl?: typeof fetch; root?: string} = {},
) {
  const {version: currentVersion} = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  ) as {version: string};
  const versions = await readSitePlaybackRuntimeVersions(root);
  if (atLeast(currentVersion, dsl4FirstSitePlaybackRuntimeVersion)) {
    assert(versions.includes(currentVersion), `release-metadata/${currentVersion}.json is missing`);
  }
  const written = [];
  for (const version of versions) {
    const bytes =
      version === currentVersion
        ? await readFile(path.join(root, 'src', generatedPath))
        : await fetchPublishedPlaybackRuntime(version, fetchImpl);
    if (bytes === null) continue;
    const file = dsl4PlaybackRuntimeSitePath(version);
    await mkdir(path.dirname(path.join(siteRoot, file)), {recursive: true});
    await writeFile(path.join(siteRoot, file), bytes);
    written.push({file, size: bytes.byteLength});
  }
  return written;
}
