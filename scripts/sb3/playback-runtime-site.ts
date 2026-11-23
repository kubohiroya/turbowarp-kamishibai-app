import {createHash} from 'node:crypto';

const kamishibaiSiteUrl = 'https://kubohiroya.github.io/turbowarp-kamishibai-app/';

/** The site path of a release's playback runtime. */
export function dsl4PlaybackRuntimeSitePath(version: string) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
    throw new TypeError(`Invalid release version: ${version}`);
  }
  return `runtime/${version}/kamishibai-playback.js`;
}

/**
 * What the authoring runtime records about the playback runtime of the same release: a work built
 * in the editor fetches these bytes from the site and carries them instead of the authoring runtime.
 */
export function dsl4PlaybackRuntimeSite(version: string, source: Uint8Array) {
  return {
    version,
    url: new URL(dsl4PlaybackRuntimeSitePath(version), kamishibaiSiteUrl).href,
    sha256: createHash('sha256').update(source).digest('hex'),
    size: source.byteLength,
  };
}
