import {createHash} from 'node:crypto';

const kamishibaiSiteUrl = 'https://kubohiroya.github.io/turbowarp-kamishibai-app/';

/**
 * The runtime bundles a release serves, by the profile that builds them.
 *
 * Both are project-independent: one release always builds the same bytes, so each one can live at a
 * versioned URL that a distributed SB3 points at instead of carrying the bytes itself. The
 * block-authoring extension (`kubohiroyakamishibaiauthoring4`) carries the block definitions of one
 * project, so its bytes belong to that work and are not published here.
 */
export const dsl4RuntimeSiteFilenames = Object.freeze({
  playback: 'kamishibai-playback.js',
  authoring: 'kamishibai-authoring.js',
});

export type Dsl4RuntimeSiteProfile = keyof typeof dsl4RuntimeSiteFilenames;

/** The profiles a release publishes, in the order the manifest lists them. */
export const dsl4RuntimeSiteProfiles: readonly Dsl4RuntimeSiteProfile[] = Object.freeze([
  'playback',
  'authoring',
]);

function releaseVersion(version: string) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
    throw new TypeError(`Invalid release version: ${version}`);
  }
  return version;
}

/** The site path of one runtime bundle of a release. */
export function dsl4RuntimeSitePath(version: string, profile: Dsl4RuntimeSiteProfile = 'playback') {
  const filename = dsl4RuntimeSiteFilenames[profile];
  if (filename === undefined) {
    throw new TypeError(`Unknown DSL 4.0 runtime profile: ${String(profile)}`);
  }
  return `runtime/${releaseVersion(version)}/${filename}`;
}

/** The site path of the manifest that names every runtime bundle of a release. */
export function dsl4RuntimeSiteManifestPath(version: string) {
  return `runtime/${releaseVersion(version)}/manifest.json`;
}

/** The site path of a release's playback runtime. */
export function dsl4PlaybackRuntimeSitePath(version: string) {
  return dsl4RuntimeSitePath(version, 'playback');
}

/** The URL, digest and size a caller needs to point an SB3 at one published runtime bundle. */
export function dsl4RuntimeSiteEntry(
  version: string,
  profile: Dsl4RuntimeSiteProfile,
  source: Uint8Array,
) {
  return {
    profile,
    url: new URL(dsl4RuntimeSitePath(version, profile), kamishibaiSiteUrl).href,
    sha256: createHash('sha256').update(source).digest('hex'),
    size: source.byteLength,
  };
}

/**
 * What the authoring runtime records about the playback runtime of the same release: a work built
 * in the editor fetches these bytes from the site and carries them instead of the authoring runtime.
 */
export function dsl4PlaybackRuntimeSite(version: string, source: Uint8Array) {
  const {url, sha256, size} = dsl4RuntimeSiteEntry(version, 'playback', source);
  return {version, url, sha256, size};
}
