import {cp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  NAVIGATION_CONTRACT_JSON_URL,
  SITE_SHELL_CSS_URL,
  replaceSiteNavigation,
} from '@kubohiroya/turbowarp-kamishibai-site-navigation';

import {renderSiteVersion} from './site-version.ts';
import {buildReleasePlayer} from './build-release-player.ts';
import {preparePublishedSite} from './sb3/dsl4-published-assets.ts';
import {writePoseNetSiteAssets} from './sb3/posenet-site-assets.ts';
import {writePlaybackRuntimeSiteAssets} from './sb3/playback-runtime-site-assets.ts';
import {writeTMRuntimeSiteAssets} from './sb3/tm-runtime-site-assets.ts';

await preparePublishedSite();
const {recommendedDownload, renderDownloadCards} = await import('./download-catalog.ts');
const {buildDownloadableReleaseSb3, downloadableReleases} =
  await import('./sb3/downloadable-releases.ts');
const {verifyBuild} = await import('./verify-build.ts');

const source = new URL('../site/', import.meta.url);
const output = new URL('../site-dist/', import.meta.url);
const outputPath = fileURLToPath(output);
const siteIndexPath = path.join(outputPath, 'index.html');
const downloadIndexPath = path.join(outputPath, 'downloads', 'index.html');
const faviconPath = path.join(outputPath, 'favicon.png');
const siteShellCssPath = path.join(outputPath, 'site-shell.css');
const navigationContractPath = path.join(outputPath, 'contracts', 'navigation-contract.json');

async function prepareOutputDirectory() {
  await rm(output, {recursive: true, force: true});
  await mkdir(output, {recursive: true});
  await cp(source, output, {recursive: true});
}

async function copySharedSiteNavigationAssets() {
  await mkdir(path.dirname(navigationContractPath), {recursive: true});
  await Promise.all([
    cp(SITE_SHELL_CSS_URL, siteShellCssPath),
    cp(NAVIGATION_CONTRACT_JSON_URL, navigationContractPath),
  ]);
}

async function renderSiteMetadata() {
  const [sourceHtml, downloadHtml] = await Promise.all([
    readFile(siteIndexPath, 'utf8'),
    readFile(downloadIndexPath, 'utf8'),
  ]);
  await Promise.all([
    writeFile(siteIndexPath, renderSiteVersion(sourceHtml, recommendedDownload?.version)),
    writeFile(downloadIndexPath, renderDownloadCards(downloadHtml)),
  ]);
}

async function renderSiteNavigation() {
  const htmlFiles = await findHtmlFiles(outputPath);
  let updatedCount = 0;
  for (const htmlFile of htmlFiles) {
    const sourceHtml = await readFile(htmlFile, 'utf8');
    const relativePath = path.relative(outputPath, htmlFile).split(path.sep).join('/');
    const pathname =
      relativePath === 'index.html'
        ? '/turbowarp-kamishibai-app/'
        : `/turbowarp-kamishibai-app/${relativePath.replace(/(?:index\.html)?$/u, '')}`;
    const updatedHtml = replaceSiteNavigation(sourceHtml, {
      site: 'turbowarp-kamishibai-app',
      pathname,
    });
    if (updatedHtml !== sourceHtml) {
      await writeFile(htmlFile, updatedHtml);
      updatedCount += 1;
    }
  }
  console.log(
    `Rendered the site navigation in ${updatedCount} of ${htmlFiles.length} HTML file(s).`,
  );
}

/** @returns {Promise<string[]>} */
async function findHtmlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {withFileTypes: true});
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return findHtmlFiles(entryPath);
      }
      return entry.isFile() && entry.name.endsWith('.html') ? [entryPath] : [];
    }),
  );
  return nestedFiles.flat();
}

async function addFaviconLinks() {
  const htmlFiles = await findHtmlFiles(outputPath);
  let addedCount = 0;

  for (const htmlFile of htmlFiles) {
    const sourceHtml = await readFile(htmlFile, 'utf8');
    const relativePath = path
      .relative(path.dirname(htmlFile), faviconPath)
      .split(path.sep)
      .join('/');
    const faviconLink = `<link rel="icon" type="image/png" sizes="256x256" href="${relativePath}">`;
    if (sourceHtml.includes(faviconLink)) {
      continue;
    }
    const updatedHtml = sourceHtml.replace(/<head(?:\s[^>]*)?>/iu, `$&\n  ${faviconLink}`);

    if (updatedHtml === sourceHtml) {
      throw new Error(`Cannot add a favicon link because ${htmlFile} does not contain <head>.`);
    }
    await writeFile(htmlFile, updatedHtml);
    addedCount += 1;
  }

  console.log(`Added favicon links to ${addedCount} of ${htmlFiles.length} HTML file(s).`);
}

await prepareOutputDirectory();
await copySharedSiteNavigationAssets();
await renderSiteNavigation();
await renderSiteMetadata();
console.log(
  `Published PoseNet model files: ${JSON.stringify(await writePoseNetSiteAssets(outputPath))}`,
);
console.log(
  `Published Teachable Machine runtimes: ${JSON.stringify(await writeTMRuntimeSiteAssets(outputPath))}`,
);
console.log(
  `Published playback runtimes: ${JSON.stringify(await writePlaybackRuntimeSiteAssets(outputPath))}`,
);
const releaseBuilds = await Promise.all(
  downloadableReleases.map(async (release) => {
    const build = await buildDownloadableReleaseSb3(release, {
      outputPath: path.join(outputPath, 'downloads', release.filename),
    });
    console.log(`Downloaded verified ${release.series} SB3: ${build.outputPath}`);
    return {release, titleBuildMetadata: build.titleBuildMetadata};
  }),
);
await addFaviconLinks();
await verifyBuild({releaseBuilds});
// Standalone players own their document and must not receive the site's header or styles.
for (const release of downloadableReleases.filter(({series}) => series === '4.0')) {
  const player = await buildReleasePlayer(
    path.join(outputPath, 'downloads', release.filename),
    path.join(outputPath, 'players', release.version, 'index.html'),
  );
  console.log(`Packaged release HTML: ${JSON.stringify(player)}`);
}
console.log('Built GitHub Pages content in site-dist/');
