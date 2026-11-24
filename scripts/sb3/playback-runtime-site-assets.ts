import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';

import {dsl4BlockSourceBundleExtensionId} from '../../src/dsl4/block-source-shared.ts';
import {
  dsl4RuntimeSiteEntry,
  dsl4RuntimeSiteFilenames,
  dsl4RuntimeSiteManifestPath,
  dsl4RuntimeSitePath,
  dsl4RuntimeSiteProfiles,
  type Dsl4RuntimeSiteProfile,
} from './playback-runtime-site.ts';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const packageName = '@kubohiroya/turbowarp-kamishibai-app';
/** The generated bundle each published profile serves, inside `src/` and inside `package/dist/`. */
const generatedPaths: Readonly<Record<Dsl4RuntimeSiteProfile, string>> = Object.freeze({
  playback: 'builder/generated/dsl4-narrative-playback-runtime-extension.js',
  authoring: 'builder/generated/dsl4-narrative-authoring-runtime-extension.js',
});
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
export async function readSiteRuntimeVersions(root = projectRoot) {
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

/** Every published profile of one release, taken from its npm package in a single fetch. */
async function fetchPublishedRuntimeBundles(version: string, fetchImpl: typeof fetch) {
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
  return Object.fromEntries(
    dsl4RuntimeSiteProfiles.map((profile) => [
      profile,
      readTarballFile(bytes, `package/dist/${generatedPaths[profile]}`),
    ]),
  ) as Record<Dsl4RuntimeSiteProfile, Buffer>;
}

/**
 * Write every runtime bundle of each release to `<site>/runtime/<version>/`, with a manifest.
 *
 * The editor of a release fetches its playback runtime when it builds a work, and an editor keeps
 * being used long after newer releases, while every Pages deployment replaces the whole site. So the
 * site keeps the runtimes of every release since it began: the current release's from this
 * checkout, each earlier published one from its npm package.
 *
 * `manifest.json` beside them names each bundle's URL, SHA-256 and size, so a work built outside
 * the editor can point its extension at published bytes instead of carrying a copy of them. It is
 * written for the same versions and from the same bytes, so a reader never has to guess a path.
 */
export async function writeRuntimeSiteAssets(
  siteRoot: string,
  {fetchImpl = fetch, root = projectRoot}: {fetchImpl?: typeof fetch; root?: string} = {},
) {
  const {version: currentVersion} = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  ) as {version: string};
  const versions = await readSiteRuntimeVersions(root);
  if (atLeast(currentVersion, dsl4FirstSitePlaybackRuntimeVersion)) {
    assert(versions.includes(currentVersion), `release-metadata/${currentVersion}.json is missing`);
  }
  const written = [];
  for (const version of versions) {
    const bundles =
      version === currentVersion
        ? (Object.fromEntries(
            await Promise.all(
              dsl4RuntimeSiteProfiles.map(async (profile) => [
                profile,
                await readFile(path.join(root, 'src', generatedPaths[profile])),
              ]),
            ),
          ) as Record<Dsl4RuntimeSiteProfile, Buffer>)
        : await fetchPublishedRuntimeBundles(version, fetchImpl);
    if (bundles === null) continue;
    const runtimes = [];
    for (const profile of dsl4RuntimeSiteProfiles) {
      const bytes = bundles[profile];
      const file = dsl4RuntimeSitePath(version, profile);
      await mkdir(path.dirname(path.join(siteRoot, file)), {recursive: true});
      await writeFile(path.join(siteRoot, file), bytes);
      written.push({file, size: bytes.byteLength});
      runtimes.push({
        file: dsl4RuntimeSiteFilenames[profile],
        ...dsl4RuntimeSiteEntry(version, profile, bytes),
      });
    }
    const manifestFile = dsl4RuntimeSiteManifestPath(version);
    const manifest = `${JSON.stringify(
      {version, extension: dsl4BlockSourceBundleExtensionId, runtimes},
      null,
      2,
    )}\n`;
    await writeFile(path.join(siteRoot, manifestFile), manifest);
    written.push({file: manifestFile, size: Buffer.byteLength(manifest)});
  }
  return written;
}
