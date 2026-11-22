import {access, readFile, readdir, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {
  NAVIGATION_CONTRACT,
  NAVIGATION_CONTRACT_JSON_URL,
  SITE_SHELL_CSS_URL,
} from '@kubohiroya/turbowarp-kamishibai-site-navigation';

import {
  downloadCardsPlaceholder,
  downloadCatalog,
  recommendedDownload,
} from './download-catalog.ts';
import type {DownloadCatalogEntry} from './download-catalog.ts';
import {siteVersionPlaceholder} from './site-version.ts';
import {downloadableReleases} from './sb3/downloadable-releases.ts';
import {readTitleBuildMetadataFromSb3} from './sb3/title-build-metadata.ts';
import {readPublishedPoseNetDigests} from './sb3/posenet-site-assets.ts';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const outputDirectory = path.join(projectRoot, 'site-dist');
const siteIndexPath = path.join(outputDirectory, 'index.html');
const faviconSourcePath = path.join(projectRoot, 'site/favicon.png');
const faviconPath = path.join(outputDirectory, 'favicon.png');
const heroImageSourcePath = path.join(projectRoot, 'site/images/image01.png');
const heroImagePath = path.join(outputDirectory, 'images/image01.png');
const downloadSourceDirectory = path.join(projectRoot, 'site/downloads');
const downloadDirectory = path.join(outputDirectory, 'downloads');
const downloadIndexPath = path.join(downloadDirectory, 'index.html');
const licensesIndexPath = path.join(outputDirectory, 'licenses', 'index.html');
const siteShellCssPath = path.join(outputDirectory, 'site-shell.css');
const siteShellScriptPath = path.join(outputDirectory, 'site-shell.js');
const navigationContractPath = path.join(outputDirectory, 'contracts', 'navigation-contract.json');
const docsSiteUrl = 'https://kubohiroya.github.io/turbowarp-kamishibai-docs/';
const workshopSiteUrl = `${docsSiteUrl}workshops/`;
const sampleSiteUrl = 'https://kubohiroya.github.io/turbowarp-kamishibai-samples/';
const urashimaWebUrl = `${sampleSiteUrl}stories/urashima/web/`;

/** One release the site build produced, paired with the metadata stamped into its SB3. */
interface SiteReleaseBuild {
  readonly release: {readonly series: string};
  readonly titleBuildMetadata: {readonly buildDate: string; readonly version: string};
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function attributeValues(html: string, tagName: string, attributeName: string): string[] {
  const tagPattern = new RegExp(`<${tagName}\\b[^>]*\\b${attributeName}="([^"]+)"`, 'gu');
  // The pattern only matches when its one capture group does, so every match carries group 1.
  return [...html.matchAll(tagPattern)].map((match) => match[1]) as string[];
}

async function findHtmlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {withFileTypes: true});
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findHtmlFiles(entryPath);
      return entry.isFile() && entry.name.endsWith('.html') ? [entryPath] : [];
    }),
  );
  return nestedFiles.flat();
}

async function verifyFavicon() {
  const [sourceFavicon, publishedFavicon, htmlFiles] = await Promise.all([
    readFile(faviconSourcePath),
    readFile(faviconPath),
    findHtmlFiles(outputDirectory),
  ]);
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  assert(
    sourceFavicon.equals(publishedFavicon),
    'The published favicon differs from site/favicon.png.',
  );
  assert(publishedFavicon.subarray(0, 8).equals(pngSignature), 'The favicon is not a PNG file.');
  assert(
    publishedFavicon.readUInt32BE(16) === 256 && publishedFavicon.readUInt32BE(20) === 256,
    'The favicon must be 256 by 256 pixels.',
  );
  assert(
    publishedFavicon[24] === 8 && publishedFavicon[25] === 6,
    'The favicon must use 8-bit RGBA pixels.',
  );
  assert(htmlFiles.length > 0, 'The generated site does not contain any HTML files.');

  for (const htmlFile of htmlFiles) {
    const html = await readFile(htmlFile, 'utf8');
    const expectedHref = path
      .relative(path.dirname(htmlFile), faviconPath)
      .split(path.sep)
      .join('/');
    const expectedLink = `<link rel="icon" type="image/png" sizes="256x256" href="${expectedHref}">`;
    assert(
      html.split(expectedLink).length - 1 === 1,
      `${path.relative(outputDirectory, htmlFile)} must contain exactly one favicon link.`,
    );
    await access(path.resolve(path.dirname(htmlFile), expectedHref));
  }

  return htmlFiles.length;
}

async function verifySharedNavigationAssets() {
  const [publishedCss, packageCss, publishedContract, packageContract] = await Promise.all([
    readFile(siteShellCssPath),
    readFile(SITE_SHELL_CSS_URL),
    readFile(navigationContractPath),
    readFile(NAVIGATION_CONTRACT_JSON_URL),
  ]);
  assert(publishedCss.equals(packageCss), 'The published site shell differs from the package.');
  assert(
    publishedContract.equals(packageContract),
    'The published navigation contract differs from the package.',
  );
}

async function verifySiteHeaders() {
  const htmlFiles = await findHtmlFiles(outputDirectory);

  for (const htmlFile of htmlFiles) {
    const html = await readFile(htmlFile, 'utf8');
    const relativeCss = path
      .relative(path.dirname(htmlFile), siteShellCssPath)
      .split(path.sep)
      .join('/');
    const relativeScript = path
      .relative(path.dirname(htmlFile), siteShellScriptPath)
      .split(path.sep)
      .join('/');
    const stylesheets = attributeValues(html, 'link', 'href');
    const scripts = attributeValues(html, 'script', 'src');

    assert(
      (html.match(/<header class="site-header">/gu) ?? []).length === 1,
      `${path.relative(outputDirectory, htmlFile)} must contain exactly one site header.`,
    );
    assert(
      html.includes(`data-navigation-contract-version="${NAVIGATION_CONTRACT.contractVersion}"`),
      `${path.relative(outputDirectory, htmlFile)} must use the active navigation contract.`,
    );
    assert(
      (html.match(/<footer class="site-footer" data-site-footer-version="1">/gu) ?? []).length ===
        1,
      `${path.relative(outputDirectory, htmlFile)} must contain exactly one site footer.`,
    );
    const footer = html.match(/<footer class="site-footer"[\s\S]*?<\/footer>/u)?.[0] ?? '';
    assert(footer.includes('© 2026 Hiroya Kubo'), 'The site footer is missing its copyright.');
    assert(
      footer.includes('各文書・作品・素材には個別の利用条件が適用されます。'),
      'The site footer is missing its individual-rights notice.',
    );
    assert(
      footer.includes('href="https://kubohiroya.github.io/turbowarp-kamishibai-app/licenses/"'),
      'The site footer is missing its rights page.',
    );
    assert(!footer.includes('github.com'), 'The site footer must not duplicate the GitHub link.');
    assert(
      stylesheets.filter((href) => href === relativeCss).length === 1,
      `${path.relative(outputDirectory, htmlFile)} must load the site stylesheet once.`,
    );
    assert(
      scripts.filter((src) => src === relativeScript).length === 1,
      `${path.relative(outputDirectory, htmlFile)} must load the site header behavior once.`,
    );
    for (const destination of NAVIGATION_CONTRACT.items.map(({href}: {href: string}) => href)) {
      assert(
        html.includes(`href="${destination}"`),
        `${path.relative(outputDirectory, htmlFile)} is missing ${destination}.`,
      );
    }
    assert(
      !html.includes('href="https://kubohiroya.github.io/turbowarp-kamishibai-app/docs/"'),
      `${path.relative(outputDirectory, htmlFile)} still uses the old documentation URL.`,
    );
    await Promise.all([
      access(path.resolve(path.dirname(htmlFile), relativeCss)),
      access(path.resolve(path.dirname(htmlFile), relativeScript)),
    ]);
  }

  return htmlFiles.length;
}

async function verifyLocalReferences(htmlPath: string, tagName: string, attributeName: string) {
  const html = await readFile(htmlPath, 'utf8');
  const references = attributeValues(html, tagName, attributeName).filter(
    (reference) => !/^(?:data:|https?:|mailto:)/u.test(reference),
  );

  for (const reference of references) {
    const [relativePath, encodedFragment] = reference.split('#');
    const targetPath = relativePath
      ? path.resolve(path.dirname(htmlPath), decodeURIComponent(relativePath))
      : htmlPath;
    await access(targetPath);

    if (encodedFragment) {
      const targetHtml = await readFile(targetPath, 'utf8');
      const targetIds = new Set(attributeValues(targetHtml, '[a-z][a-z0-9]*', 'id'));
      assert(
        targetIds.has(decodeURIComponent(encodedFragment)),
        `${reference} does not resolve from ${htmlPath}.`,
      );
    }
  }

  return references;
}

async function verifySiteIndex() {
  const html = await readFile(siteIndexPath, 'utf8');
  const images = await verifyLocalReferences(siteIndexPath, 'img', 'src');
  const localLinks = await verifyLocalReferences(siteIndexPath, 'a', 'href');
  const allLinks = attributeValues(html, 'a', 'href');
  const altTexts = attributeValues(html, 'img', 'alt');
  const cardCount = (html.match(/<a\b(?=[^>]*class="[^"]*\bcontent-card\b[^"]*")[^>]*>/gu) ?? [])
    .length;
  const [sourceImage, publishedImage] = await Promise.all([
    readFile(heroImageSourcePath),
    readFile(heroImagePath),
  ]);

  assert(images.includes('images/image01.png'), 'The top page does not reference the hero image.');
  assert(
    altTexts.includes(
      'カメラ映像の上に浦島太郎とカメを重ね、認識入力で紙芝居を進めているアプリ画面',
    ),
    'The top-page hero image does not have the expected alternative text.',
  );
  assert(
    sourceImage.equals(publishedImage),
    'The published top-page hero image differs from site/images/image01.png.',
  );
  assert(cardCount === 5, `Expected five top-page content cards, found ${cardCount}.`);
  assert(allLinks.includes(urashimaWebUrl), 'The top page does not link to the Urashima sample.');
  assert(allLinks.includes(docsSiteUrl), 'The top page does not link to the documentation site.');
  assert(allLinks.includes(workshopSiteUrl), 'The top page does not link to the workshop site.');
  assert(!localLinks.includes('docs/'), 'The top page still links to a local documentation build.');
  assert(localLinks.includes('downloads/'), 'The top-page download card is missing.');
  assert(allLinks.includes(sampleSiteUrl), 'The top page does not link to the sample site.');
  assert(
    !allLinks.includes('https://sqs.prof.cuc.ac.jp/kamishibai/'),
    'The top page still links to the retired SQS web app.',
  );
  for (const icon of ['▶️', '📕', '🧑‍🏫', '🎭', '📁']) {
    assert(
      html.includes(`<span class="card-icon" aria-hidden="true">${icon}</span>`),
      `The top-page card icon ${icon} is missing.`,
    );
  }
  assert(
    html
      .replace(/\s+/gu, ' ')
      .includes(
        `TurboWarpで編集・実行できるkamishibai ${recommendedDownload?.version}` +
          'のSB3ファイルをダウンロードできます。',
      ),
    'The top-page download card does not use the recommended catalog version.',
  );
  assert(
    !html.includes(siteVersionPlaceholder) && !html.includes('kamishibai 3.1a1'),
    'The top-page download card contains an unresolved or retired version.',
  );
}

async function verifyDownloads(releaseBuilds: readonly SiteReleaseBuild[] = []) {
  const html = await readFile(downloadIndexPath, 'utf8');
  const links = await verifyLocalReferences(downloadIndexPath, 'a', 'href');
  const [sourceEntries, publishedEntries] = await Promise.all([
    readdir(downloadSourceDirectory, {withFileTypes: true}),
    readdir(downloadDirectory, {withFileTypes: true}),
  ]);
  const sourceSb3Files = sourceEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sb3'))
    .map((entry) => entry.name);
  const publishedSb3Files = publishedEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sb3'))
    .map((entry) => entry.name)
    .sort();
  const expectedFilenames = downloadableReleases
    .map(({filename}: {filename: string}) => filename)
    .sort();
  const cardPositions: number[] = downloadCatalog.map(({series}: {series: string}) =>
    html.indexOf(`data-version="${series}"`),
  );

  assert(
    cardPositions.every((position) => position >= 0) &&
      cardPositions.every(
        (position, index) => index === 0 || Number(cardPositions[index - 1]) < position,
      ),
    'The rendered download cards differ from catalog order.',
  );
  assert(!html.includes(downloadCardsPlaceholder), 'The download page has an unresolved catalog.');
  for (const entry of downloadCatalog) {
    assert(
      html.includes(`<span class="status status--${entry.statusKind}">${entry.status}</span>`),
      `The ${entry.series} card does not identify itself as ${entry.status}.`,
    );
    assert(
      html.includes(entry.description),
      `The ${entry.series} card does not use its catalog description.`,
    );
  }
  assert(!html.includes('4.0ドキュメントを参照できます。'), 'The 4.0 card has a docs note.');
  assert(!html.includes('4.0ドキュメントを開く'), 'The 4.0 card has a docs action.');
  assert(
    !html.includes('/dsl-author-guides/dsl-4.0-author-guide/'),
    'The 4.0 card links to the author guide.',
  );
  const unavailableEntries = downloadCatalog.filter(
    (entry): entry is Extract<DownloadCatalogEntry, {artifact?: undefined}> => !entry.artifact,
  );
  for (const entry of unavailableEntries) {
    assert(
      html.includes(`aria-disabled="true">${entry.unavailableLabel}</span>`) &&
        html.includes(entry.unavailableNote),
      `The ${entry.series} card does not explain that its artifact is unavailable.`,
    );
  }
  assert(sourceSb3Files.length === 0, 'site/downloads must not contain tracked SB3 binaries.');
  assert(
    JSON.stringify(publishedSb3Files) === JSON.stringify(expectedFilenames),
    `Unexpected published SB3 files: ${publishedSb3Files.join(', ')}`,
  );

  const results = [];
  for (const release of downloadableReleases) {
    const [publishedArchive, archiveStat] = await Promise.all([
      readFile(path.join(downloadDirectory, release.filename)),
      stat(path.join(downloadDirectory, release.filename)),
    ]);
    const publishedMetadata = readTitleBuildMetadataFromSb3(publishedArchive);
    const releaseBuild = releaseBuilds.find(
      ({release: builtRelease}) => builtRelease.series === release.series,
    );

    assert(
      links.includes(release.filename) && html.includes(`href="${release.filename}" download`),
      `${release.filename} is not a browser download link.`,
    );
    assert(
      html.includes(`<code>${release.filename}</code>（${release.version}）`),
      `The ${release.series} card version differs from the release catalog.`,
    );
    assert(
      html.includes(`<time datetime="${release.buildDate}">`) &&
        html.includes(`${release.size.toLocaleString('ja-JP')} bytes`),
      `The ${release.series} card is missing its update date or file size.`,
    );
    assert(
      publishedMetadata.version === release.version,
      `The published ${release.series} SB3 must use version ${release.version}.`,
    );
    if (releaseBuild) {
      assert(
        publishedMetadata.buildDate === releaseBuild.titleBuildMetadata.buildDate &&
          publishedMetadata.version === releaseBuild.titleBuildMetadata.version,
        `The published ${release.series} SB3 metadata differs from its build metadata.`,
      );
    }
    assert(
      createHash('sha256').update(publishedArchive).digest('hex') === release.sha256,
      `The published ${release.series} SB3 differs from its GitHub Release identity.`,
    );
    assert(
      archiveStat.size === publishedArchive.length &&
        archiveStat.size === release.size &&
        archiveStat.size > 0 &&
        publishedArchive.subarray(0, 2).toString() === 'PK',
      `The published ${release.series} SB3 is not a non-empty ZIP-based Scratch project.`,
    );
    results.push({filename: release.filename, size: archiveStat.size});
  }

  return results;
}

/** Every PoseNet file an earlier release published must still be served at its digest path. */
async function verifyPoseNetAssets() {
  const published = await readPublishedPoseNetDigests();
  for (const {sha256, size, path: name} of published) {
    const bytes = await readFile(path.join(outputDirectory, 'posenet', `sha256-${sha256}`));
    assert(
      bytes.byteLength === size && createHash('sha256').update(bytes).digest('hex') === sha256,
      `The site must publish PoseNet ${name} at posenet/sha256-${sha256}`,
    );
  }
  return published.length;
}

export async function verifyBuild({
  releaseBuilds,
}: {releaseBuilds?: readonly SiteReleaseBuild[]} = {}) {
  await verifySiteIndex();
  await verifySharedNavigationAssets();
  const downloadResults = await verifyDownloads(releaseBuilds);
  const faviconHtmlCount = await verifyFavicon();
  const siteHeaderHtmlCount = await verifySiteHeaders();
  const docsEntries = await readdir(path.join(outputDirectory, 'docs'));

  assert(
    JSON.stringify(docsEntries.sort()) === JSON.stringify(['index.html']),
    `The legacy documentation path must contain only its redirect page: ${docsEntries.join(', ')}`,
  );
  await access(path.join(outputDirectory, 'docs/index.html'));
  await access(licensesIndexPath);
  await verifyLocalReferences(licensesIndexPath, 'img', 'src');
  await verifyLocalReferences(licensesIndexPath, 'a', 'href');
  await access(path.join(outputDirectory, 'images/image01.png'));
  const poseNetFileCount = await verifyPoseNetAssets();

  console.log(
    `Verified favicon links and site headers in ${faviconHtmlCount}/${siteHeaderHtmlCount} HTML file(s), ` +
      `${downloadResults.map(({filename, size}) => `${filename} (${size} bytes)`).join(', ')}, ` +
      `${poseNetFileCount} PoseNet model file(s), ` +
      'the external documentation link, and the legacy /docs/ redirect.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyBuild();
}
