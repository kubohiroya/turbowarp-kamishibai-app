import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {strToU8, zipSync} from 'fflate';

import {
  type DownloadCatalogEntry,
  downloadCardsPlaceholder,
  downloadCatalog,
  recommendedDownload,
  renderDownloadCards,
} from '../scripts/download-catalog.ts';
import {
  createDownloadableReleaseSb3,
  downloadableReleases,
} from '../scripts/sb3/downloadable-releases.ts';
import {assertDsl4ReleaseMetadata} from '../scripts/sb3/dsl4-release-policy.ts';
import {renderSiteVersion, siteVersionPlaceholder} from '../scripts/site-version.ts';
import {thrown} from './helpers/thrown-error.ts';
import {requireDefined, requireNumber} from './helpers/require-value.ts';

/** A catalog entry that advertises labels in place of artifact bytes. */
type UnavailableDownload = Extract<DownloadCatalogEntry, {unavailableLabel: string}>;

type ReleaseFetch = NonNullable<
  NonNullable<Parameters<typeof createDownloadableReleaseSb3>[1]>['fetchImpl']
>;

/**
 * Hand the loader a real `Response` through the narrower response shape it declares.
 *
 * The loader names only the members it reads, and the platform's BYOB-capable `getReader`
 * overloads are not assignable to that declaration even though a real response satisfies it at
 * runtime -- which is the point of downloading through one here. The gap is named once, rather
 * than at each call site.
 */
function releaseFetch(
  implementation: (
    url: string,
    options: {headers: Record<string, string>; redirect: 'follow'},
  ) => Promise<Response>,
): ReleaseFetch {
  return implementation as unknown as ReleaseFetch;
}

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const urashimaWebUrl =
  'https://kubohiroya.github.io/turbowarp-kamishibai-samples/stories/urashima/web/';
const releasePins = JSON.parse(
  await readFile(new URL('fixtures/dsl4/release-pins.json', import.meta.url), 'utf8'),
);

test('keeps static distribution sources free of SB3 binaries', async () => {
  const downloadEntries = await readdir(path.join(projectRoot, 'site/downloads'));
  assert.deepEqual(
    downloadEntries.filter((entryName) => entryName.endsWith('.sb3')),
    [],
  );

  const ignoreRules = new Set(
    (await readFile(path.join(projectRoot, '.gitignore'), 'utf8')).split(/\r?\n/u),
  );
  assert(ignoreRules.has('/kamishibai.sb3'));
  assert(ignoreRules.has('/urashima.sb3'));
  assert(ignoreRules.has('/site/downloads/*.sb3'));
  await assert.rejects(
    readFile(path.join(projectRoot, 'urashima.sb3')),
    (error) => thrown(error).code === 'ENOENT',
  );
});

test('renders ordered versioned download cards from one release catalog', async () => {
  const [downloadTemplate, readme, readmeJapanese, packageJsonSource] = await Promise.all([
    readFile(path.join(projectRoot, 'site/downloads/index.html'), 'utf8'),
    readFile(path.join(projectRoot, 'README.md'), 'utf8'),
    readFile(path.join(projectRoot, 'README.ja.md'), 'utf8'),
    readFile(path.join(projectRoot, 'package.json'), 'utf8'),
  ]);
  const packageJson = JSON.parse(packageJsonSource);
  const releaseMetadata = JSON.parse(
    await readFile(path.join(projectRoot, `release-metadata/${packageJson.version}.json`), 'utf8'),
  );
  const currentCandidate = downloadCatalog.find(({series}) => series === '4.0');
  const recommendedStable = downloadCatalog.find(({recommended}) => recommended);
  const readmeSources = [readme, readmeJapanese];
  const npmVersion = requireDefined(
    readme.match(
      /pnpm add --save-exact @kubohiroya\/turbowarp-kamishibai-app@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/u,
    )?.[1],
    'the exact npm version documented in README',
  );
  const npmMetadata = JSON.parse(
    await readFile(path.join(projectRoot, `release-metadata/${npmVersion}.json`), 'utf8'),
  );
  assert.equal(npmMetadata.version, npmVersion);
  if (npmMetadata.state === 'published') {
    assert.equal(
      npmMetadata.publication?.urls?.npm,
      `https://www.npmjs.com/package/${releasePins.release.package}/v/${npmVersion}`,
      'A historical README npm version must retain its recorded registry publication.',
    );
  } else {
    // Current release sources remain frozen; verified public records live in Release assets.
    assert.equal(npmMetadata.state, 'frozen', 'README must not install a mutable candidate.');
    assert.equal(npmVersion, packageJson.version);
    assert.equal(npmVersion, releasePins.release.version);
    assertDsl4ReleaseMetadata(npmMetadata);
    assert.match(npmMetadata.sourceIdentity, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(npmMetadata.publication.npm.distTag, 'latest');
    assert.equal(npmMetadata.publication.github.tag, `v${npmVersion}`);
    assert.equal(npmMetadata.publication.urls, undefined);
  }
  if (releaseMetadata.publication?.urls?.npm) {
    assert.equal(
      npmVersion,
      releasePins.release.version,
      'Use the current version once npm is published.',
    );
  }
  const releaseInstallSpecifier = `${releasePins.release.package}@${npmVersion}`;
  const downloadPage = renderDownloadCards(downloadTemplate);

  assert.deepEqual(
    downloadCatalog.map(({series}) => series),
    ['4.0', '3.2', '3.1'],
  );
  assert.equal(downloadTemplate.split(downloadCardsPlaceholder).length - 1, 1);
  assert(!downloadPage.includes(downloadCardsPlaceholder));
  const cardPositions = downloadCatalog.map(({series}) =>
    downloadPage.indexOf(`data-version="${series}"`),
  );
  assert(cardPositions.every((position) => position >= 0));
  assert(
    cardPositions.every(
      (position, index) =>
        index === 0 ||
        requireNumber(cardPositions[index - 1], 'the preceding card position') < position,
    ),
  );
  for (const entry of downloadCatalog) {
    assert(downloadPage.includes(`status--${entry.statusKind}">${entry.status}</span>`));
    assert(downloadPage.includes(entry.description));
  }
  for (const release of downloadableReleases) {
    assert.match(downloadPage, new RegExp(`href="${release.filename}" download`, 'u'));
    assert(downloadPage.includes(`<code>${release.filename}</code>（${release.version}）`));
    assert(
      downloadPage.includes(
        `<time datetime="${release.buildDate}">${release.buildDate
          .split('-')
          .map(Number)
          .map((part, index) => `${part}${['年', '月', '日'][index]}`)
          .join('')}</time>`,
      ),
    );
    assert(downloadPage.includes(`${release.size.toLocaleString('ja-JP')} bytes`));
  }
  assert.doesNotMatch(downloadPage, /4\.0ドキュメントを参照できます。/u);
  assert.doesNotMatch(downloadPage, /4\.0ドキュメントを開く/u);
  assert.doesNotMatch(downloadPage, /\/dsl-author-guides\/dsl-4\.0-author-guide\//u);
  const unavailableEntries = downloadCatalog.filter(
    (entry): entry is UnavailableDownload => entry.artifact === undefined,
  );
  for (const entry of unavailableEntries) {
    assert(downloadPage.includes(`aria-disabled="true">${entry.unavailableLabel}</span>`));
    assert(downloadPage.includes(entry.unavailableNote));
  }
  assert.doesNotMatch(downloadPage, /href="kamishibai\.sb3"/u);
  assert.doesNotMatch(downloadPage, /kamishibai-3_1a1\.sb3/u);
  assert.match(readme, /github\.com\/kubohiroya\/sb3-toolchain/u);
  assert.equal(
    packageJson.name,
    releasePins.release.package,
    'Package name must match the reviewed release contract.',
  );
  assert.equal(
    packageJson.version,
    releasePins.release.version,
    'Package version must match the reviewed release contract.',
  );
  assert.equal(
    packageJson.devDependencies['@kubohiroya/sb3-toolchain'],
    `^${releasePins.devDependencies['@kubohiroya/sb3-toolchain']}`,
    'SB3 toolchain range must start from the reviewed npm version.',
  );
  assert.equal(packageJson.devDependencies['@kubohiroya/sb3-toolchain-legacy'], undefined);
  assert.doesNotMatch(readme, /github:kubohiroya\/sb3-toolchain#[0-9a-f]{40}/u);
  assert.match(
    readme,
    new RegExp(`pnpm add --save-exact ${releaseInstallSpecifier.replaceAll('.', '\\.')}`, 'u'),
    'README installation must use the recorded fixed npm version.',
  );
  assert.doesNotMatch(readme, /github:kubohiroya\/tmpose-kamishibai#v3\.1\.0/u);
  // 引退した名前を人向けの文面から締め出す。素の略称 `TM` は含めない。`TM extension`、
  // `TMCompositionRuntime`、`TM-POSENET-*` は現在も正しく、`kubohiroyatm` は配布物の契約。
  for (const [label, source] of [
    ['README.md', readme],
    ['README.ja.md', readmeJapanese],
  ] as const) {
    for (const retired of [
      /TMPose/u,
      /turbowarp-tm(?![a-z])/u,
      /TM紙芝居|TM[ -]Kamishibai/u,
      /TurboWarp TM(?![A-Za-z])/u,
    ]) {
      assert.doesNotMatch(
        source,
        retired,
        `${label} must not use the retired name ${retired.source}.`,
      );
    }
  }
  assert.doesNotMatch(readme, /allowBuilds/u);
  assert.match(readme, /github\.com\/kubohiroya\/turbowarp-kamishibai-samples/u);
  assert.match(readme, /kubohiroya\.github\.io\/turbowarp-kamishibai-samples\//u);
  assert.match(readme, /github\.com\/kubohiroya\/turbowarp-kamishibai-docs/u);
  assert.match(readme, /kubohiroya\.github\.io\/turbowarp-kamishibai-docs\//u);
  assert.doesNotMatch(readme, /\]\(docs\//u);
  assert.doesNotMatch(readme, /setLoadingCostume=/u);
  assert.match(readme, /English \| \[日本語\]\(README\.ja\.md\)/u);
  assert.match(readmeJapanese, /\[English\]\(README\.md\) \| 日本語/u);
  assert(packageJson.files.includes('README.md'));
  assert(packageJson.files.includes('README.ja.md'));
  assert.equal(currentCandidate?.version, packageJson.version);
  assert.equal(currentCandidate?.status, '安定版');
  assert.equal(currentCandidate?.updatedAt, releaseMetadata.buildDate);
  assert.equal(
    recommendedStable?.version,
    releaseMetadata.state === 'published' ? packageJson.version : '3.2.3',
  );
  assert.equal(recommendedStable?.status, '安定版');
  assert.equal(releaseMetadata.publication.npm.distTag, packageJson.publishConfig.tag);
  assert.equal(packageJson.bin['turbowarp-kamishibai'], 'bin/turbowarp-kamishibai.mjs');
  assert.equal(packageJson.engines.node, '>=24.0.0');
  assert.match(packageJson.packageManager, /^pnpm@11\./u);
  for (const source of readmeSources) {
    assert.match(source, new RegExp(`\\| 3\\.2\\.3 [^\\n]*\\| ${packageJson.version}`, 'u'));
    assert.match(
      source,
      new RegExp(
        `npmjs\\.com/package/${packageJson.name}/v/${npmVersion.replaceAll('.', '\\.')}`,
        'u',
      ),
    );
    assert.match(source, /pnpm exec turbowarp-kamishibai --help/u);
    // The README must name the same minimum Node.js version that `engines.node` requires.
    const minimumNode = packageJson.engines.node.replace(/^>=/u, '');
    assert.match(source, new RegExp(`Node\\.js ${minimumNode.replaceAll('.', '\\.')}`, 'u'));
    assert.match(source, /pnpm 11/u);
    assert.match(source, /https:\/\/kubohiroya\.github\.io\/turbowarp-kamishibai-app\//u);
    assert.match(
      source,
      /https:\/\/kubohiroya\.github\.io\/turbowarp-kamishibai-app\/downloads\//u,
    );
    assert.match(source, /https:\/\/kubohiroya\.github\.io\/turbowarp-kamishibai-docs\//u);
    assert.match(source, /https:\/\/kubohiroya\.github\.io\/turbowarp-kamishibai-samples\//u);
    assert.match(source, /https:\/\/github\.com\/kubohiroya\/turbowarp-kamishibai-app\/issues/u);
    // The embedded extension's pin is the fixture's, so this does not need editing at each bump.
    const teachableMachinePin = requireDefined(
      releasePins.extensions['@kubohiroya/turbowarp-teachable-machine'],
      'release pins must name the embedded Teachable Machine extension.',
    );
    assert.match(
      source,
      new RegExp(
        `@kubohiroya/turbowarp-teachable-machine@${teachableMachinePin.replaceAll('.', '\\.')}`,
        'u',
      ),
    );
    assert.match(source, /kubohiroyatm/u);
    assert.doesNotMatch(
      source,
      /--max-source-bytes|modelInitialization|willReadFrequently|startRecognition/u,
    );
    assert(source.split('\n').length <= 190, 'README must remain a visitor entry point.');
  }
  const releaseNoteLabel = 'stable4';
  for (const source of readmeSources) {
    assert(
      source.includes(
        `[current-release]: https://github.com/kubohiroya/turbowarp-kamishibai-app/releases/tag/v${packageJson.version}`,
      ),
    );
    const releaseNotePath = source.match(
      new RegExp(
        `\\[${releaseNoteLabel}\\]: https://github\\.com/kubohiroya/turbowarp-kamishibai-app/blob/main/(\\S+)`,
        'u',
      ),
    )?.[1];
    assert.equal(releaseNotePath, `docs/releases/v${packageJson.version}.md`);
    await readFile(path.join(projectRoot, releaseNotePath), 'utf8');
  }

  const examples = (source: string) =>
    [...source.matchAll(/```(?:bash|json|yaml)\n([\s\S]*?)```/gu)].map((match) => match[1]);
  assert.deepEqual(examples(readmeJapanese), examples(readme));

  const remoteLinks = (source: string) =>
    [...new Set([...source.matchAll(/https:\/\/[^\s)]+/gu)].map((match) => match[0]))].sort();
  assert.deepEqual(remoteLinks(readmeJapanese), remoteLinks(readme));

  const headingLevels = (source: string) =>
    source
      .split('\n')
      .filter((line: string) => /^#{1,6} /u.test(line))
      .map((line: string) => line.indexOf(' '));
  assert.deepEqual(headingLevels(readmeJapanese), headingLevels(readme));
  assert.match(
    readmeJapanese,
    new RegExp(`pnpm add --save-exact ${releaseInstallSpecifier.replaceAll('.', '\\.')}`, 'u'),
    'Japanese README installation must use the recorded fixed npm version.',
  );
});

test('downloads a bounded GitHub Release asset and verifies its catalog identity', async () => {
  const implementation = await readFile(
    path.join(projectRoot, 'scripts/sb3/downloadable-releases.ts'),
    'utf8',
  );
  assert.doesNotMatch(implementation, /node:child_process|\bgit\b/u);
  for (const release of downloadableReleases) {
    assert.match(
      release.url,
      new RegExp(`/releases/download/v${release.version.replaceAll('.', '\\.')}/`, 'u'),
    );
    assert.equal(Object.hasOwn(release, 'sourceDirectory'), false);
  }

  const title = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
  const archive = Buffer.from(
    zipSync({
      'project.json': strToU8(
        JSON.stringify({
          targets: [
            {
              isStage: true,
              costumes: [{name: 'Title', dataFormat: 'svg', md5ext: 'title.svg'}],
              blocks: {
                version: {
                  opcode: 'kubohiroyaassetcache_setTextValue',
                  inputs: {
                    NAME: [1, [10, 'about.version']],
                    VALUE: [1, [10, 'Version 9.8.7 (2026/08/15)']],
                  },
                },
              },
            },
          ],
        }),
      ),
      'title.svg': title,
    }),
  );
  const release = {
    buildDate: '2026-08-15',
    filename: 'kamishibai-9.8.7.sb3',
    series: '9.8',
    version: '9.8.7',
    url: `https://github.com${releasePins.release.repositoryPath}/releases/download/v9.8.7/kamishibai-9.8.7.sb3`,
    size: archive.byteLength,
    sha256: createHash('sha256').update(archive).digest('hex'),
  };
  const requests: unknown[][] = [];
  const fetchImpl = releaseFetch(async (url, options) => {
    requests.push([url, options]);
    return new Response(archive, {
      status: 200,
      headers: {'content-length': String(archive.byteLength)},
    });
  });
  const result = await createDownloadableReleaseSb3(release, {fetchImpl});
  assert.deepEqual(result.archive, archive);
  assert.deepEqual(result.titleBuildMetadata, {
    buildDate: '2026-08-15',
    label: 'Version 9.8.7 (2026/08/15)',
    version: '9.8.7',
  });
  assert.deepEqual(requests, [
    [release.url, {headers: {accept: 'application/octet-stream'}, redirect: 'follow'}],
  ]);
  await assert.rejects(
    createDownloadableReleaseSb3({...release, sha256: '0'.repeat(64)}, {fetchImpl}),
    /SHA-256 is invalid/u,
  );
});

test('renders the top-page version from the recommended download catalog entry', async () => {
  const siteIndex = await readFile(path.join(projectRoot, 'site/index.html'), 'utf8');

  assert.equal(siteIndex.split(siteVersionPlaceholder).length - 1, 1);
  assert.doesNotMatch(siteIndex, /kamishibai \d/u);

  const recommended = requireDefined(recommendedDownload, 'the recommended catalog entry');
  const rendered = renderSiteVersion(siteIndex, recommended.version);
  assert.match(
    rendered,
    new RegExp(`kamishibai\\s+${recommended.version.replaceAll('.', '\\.')}のSB3ファイル`, 'u'),
  );
  assert(!rendered.includes(siteVersionPlaceholder));
  assert.throws(
    () => renderSiteVersion(siteIndex.replace(siteVersionPlaceholder, ''), recommended.version),
    /Expected exactly one/u,
  );
  assert.throws(
    () => renderSiteVersion(`${siteIndex}\n${siteVersionPlaceholder}`, recommended.version),
    /found 2/u,
  );
});

test('opens the Urashima web sample from the top-page Web card', async () => {
  const siteIndex = await readFile(path.join(projectRoot, 'site/index.html'), 'utf8');
  const webCardHrefPosition = siteIndex.indexOf(`href="${urashimaWebUrl}"`);
  const webCardStart = siteIndex.lastIndexOf('<a', webCardHrefPosition);
  const webCardEnd = siteIndex.indexOf('</a>', webCardHrefPosition);
  const webCard = siteIndex.slice(webCardStart, webCardEnd + '</a>'.length);
  const heroImagePosition = siteIndex.indexOf('class="hero-image"');
  const siteContentsPosition = siteIndex.indexOf('id="site-contents"');
  const siteContentsCardsStart = siteIndex.indexOf('<div class="cards">', siteContentsPosition);
  const siteContentsCardsEnd = siteIndex.indexOf('</div>', siteContentsCardsStart);
  const siteContentsCards = siteIndex.slice(siteContentsCardsStart, siteContentsCardsEnd);

  assert.ok(webCardHrefPosition >= 0);
  assert.ok(heroImagePosition < webCardHrefPosition);
  assert.ok(webCardHrefPosition < siteContentsPosition);
  assert.doesNotMatch(siteContentsCards, /Web版を開く|stories\/urashima\/web/u);
  assert.match(
    siteContentsCards,
    /href="https:\/\/kubohiroya\.github\.io\/turbowarp-kamishibai-docs\/workshops\/"/u,
  );
  assert.match(siteContentsCards, /ワークショップ一覧へ/u);
  assert.match(webCard, /class="content-card featured-web-card"/u);
  assert.match(webCard, /Web版を開く/u);
  assert.match(webCard, /DSL\s+3\.2系/u);
  assert.match(webCard, /組み込み台本「浦島太郎」/u);
  assert.match(webCard, /DSL 3\.2版「浦島太郎」へ/u);
  assert.doesNotMatch(siteIndex, /https:\/\/sqs\.prof\.cuc\.ac\.jp\/kamishibai\//u);
});

test('links the public sample site without restoring the retired local page', async () => {
  const pages = await Promise.all(
    ['site/index.html', 'site/docs/index.html', 'site/downloads/index.html'].map((relativePath) =>
      readFile(path.join(projectRoot, relativePath), 'utf8'),
    ),
  );

  for (const page of pages) {
    assert.match(page, /href="https:\/\/kubohiroya\.github\.io\/turbowarp-kamishibai-samples\/"/u);
    assert.doesNotMatch(page, /href="(?:\.\.\/)*samples\/"/u);
  }
});

test('keeps only minimal validation scripts in the application repository', async () => {
  const sampleEntries = await readdir(path.join(projectRoot, 'samples')).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  assert.deepEqual(sampleEntries, []);

  const fixtureDirectories = ['manual', 'runtime'];
  const fixtureFiles = [];
  for (const directory of fixtureDirectories) {
    const directoryPath = path.join(projectRoot, 'test/fixtures', directory);
    for (const filename of await readdir(directoryPath)) {
      if (filename.endsWith('.txt')) fixtureFiles.push(path.join(directoryPath, filename));
    }
  }

  assert(fixtureFiles.length > 0, 'No validation scripts were found.');
  for (const fixtureFile of fixtureFiles) {
    const fixture = await readFile(fixtureFile, 'utf8');
    assert(fixture.length < 1_000, `Validation script is not minimal: ${fixtureFile}`);
  }
});
