import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'vitest';

import {
  assertDsl4ReleaseMetadata,
  dsl4ReleaseAssetUrl,
  dsl4ReleaseBuildDate,
  dsl4ReleaseCandidateArtifactPath,
  dsl4ReleaseFilename,
  dsl4ReleasePublicationPolicy,
  dsl4ReleasePublicationUrls,
  dsl4ReleaseSb3Options,
  dsl4ReleaseTag,
  dsl4ReleaseVersion,
} from '../scripts/sb3/dsl4-release-policy.ts';
import releasePins from './fixtures/dsl4/release-pins.json' with {type: 'json'};

const validMetadata = () => ({
  formatVersion: 1,
  series: releasePins.release.series,
  version: dsl4ReleaseVersion,
  channel: releasePins.release.channel,
  buildDate: dsl4ReleaseBuildDate,
  state: 'candidate' as const,
  sourceIdentity: `sha256:${'0'.repeat(64)}`,
  artifact: {
    filename: dsl4ReleaseFilename,
    sha256: 'a'.repeat(64),
    size: 12,
    url: dsl4ReleaseAssetUrl,
  },
  publication: {...dsl4ReleasePublicationPolicy},
});

test('names the release artifact and its publication surfaces from the pinned version', () => {
  assert.equal(dsl4ReleaseFilename, `kamishibai-${dsl4ReleaseVersion}.sb3`);
  assert.equal(dsl4ReleaseCandidateArtifactPath, `tmp/release-candidates/${dsl4ReleaseFilename}`);
  assert.equal(
    dsl4ReleaseAssetUrl,
    `https://github.com${releasePins.release.repositoryPath}/releases/download/${dsl4ReleaseTag}/${dsl4ReleaseFilename}`,
  );
  assert.deepEqual(dsl4ReleasePublicationPolicy, {
    npm: {distTag: releasePins.release.channel},
    github: {prerelease: true, tag: dsl4ReleaseTag},
    pages: {recommended: false},
  });
});

test('stamps the pinned version and build date into every release SB3 build', () => {
  const options = dsl4ReleaseSb3Options({root: '/repo', sourceDirectory: '/tmp/app'});
  assert.deepEqual(options, {
    buildDate: dsl4ReleaseBuildDate,
    faviconPath: path.join('/repo', 'site/favicon.png'),
    sourceDirectory: '/tmp/app',
    version: dsl4ReleaseVersion,
  });
});

test('rejects snapshot metadata that drifts from the pinned release identity', () => {
  assert.equal(assertDsl4ReleaseMetadata(validMetadata()).version, dsl4ReleaseVersion);
  assert.throws(
    () => assertDsl4ReleaseMetadata({...validMetadata(), buildDate: '2000-01-01'}),
    /build date is invalid/u,
  );
  assert.throws(
    () => assertDsl4ReleaseMetadata({...validMetadata(), channel: 'latest'}),
    /channel is invalid/u,
  );
  assert.throws(
    // The member is not in `Dsl4ReleaseMetadata`; supplying one is the point of the case.
    () =>
      assertDsl4ReleaseMetadata({
        ...validMetadata(),
        sourceDirectory: 'release-sources',
      } as Parameters<typeof assertDsl4ReleaseMetadata>[0]),
    /must not retain a source snapshot directory/u,
  );
  assert.throws(
    () => assertDsl4ReleaseMetadata({...validMetadata(), state: 'published'}),
    /githubRelease/u,
  );
});

test('requires GitHub and Pages URLs and validates an optional npm publication URL', () => {
  const urls = {
    npmUrl: 'https://www.npmjs.com/package/example/v/1.0.0',
    githubReleaseUrl: 'https://github.com/example/project/releases/tag/v1.0.0',
    pagesUrl: 'https://example.github.io/project/downloads/',
  };
  assert.deepEqual(dsl4ReleasePublicationUrls(urls), {
    npm: urls.npmUrl,
    githubRelease: urls.githubReleaseUrl,
    pages: `${urls.pagesUrl}`,
  });
  const sb3Urls = dsl4ReleasePublicationUrls({...urls, npmUrl: undefined});
  assert.deepEqual(sb3Urls, {
    githubRelease: urls.githubReleaseUrl,
    pages: urls.pagesUrl,
  });
  assert.equal(
    assertDsl4ReleaseMetadata({
      ...validMetadata(),
      state: 'published',
      publication: {...dsl4ReleasePublicationPolicy, urls: sb3Urls},
    }).state,
    'published',
  );
  assert.throws(
    () =>
      assertDsl4ReleaseMetadata({
        ...validMetadata(),
        state: 'published',
        publication: {
          ...dsl4ReleasePublicationPolicy,
          urls: {githubRelease: urls.githubReleaseUrl},
        },
      }),
    /pages/u,
  );
  assert.throws(() => dsl4ReleasePublicationUrls({...urls, pagesUrl: undefined}), /--pages-url/u);
  assert.throws(
    () => dsl4ReleasePublicationUrls({...urls, npmUrl: 'http://www.npmjs.com/package/example'}),
    /--npm-url must use HTTPS/u,
  );
});
