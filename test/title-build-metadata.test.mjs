import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {access, readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {strFromU8, unzipSync} from 'fflate';

import {createKamishibaiSb3} from '../scripts/sb3/build.mjs';
import {
  appShellCommon,
  appShellLocales,
  appShellProjectPlaceholders,
  appShellTitleLines,
} from '../scripts/sb3/app-shell-locales.mjs';
import {
  officialWebsiteFaviconPlaceholder,
  readTitleBuildMetadataFromSb3,
  resolveTitleBuildMetadata,
  titleBuildDateEnvironmentVariable,
  titleVersionPlaceholder,
} from '../scripts/sb3/title-build-metadata.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const appDirectory = path.join(projectRoot, 'app');
const packageJsonPath = path.join(projectRoot, 'package.json');
const faviconPath = path.join(projectRoot, 'site', 'favicon.png');
const projectSourcePath = path.join(appDirectory, 'project.source.json');
const sourceManifestPath = path.join(appDirectory, 'sb3-source.json');
const assetsDirectory = path.join(appDirectory, 'assets');

function escapeXmlText(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

test('resolves the Title build date in Asia/Tokyo and accepts a reproducible override', () => {
  assert.deepEqual(
    resolveTitleBuildMetadata({
      environment: {},
      now: new Date('2026-07-30T15:01:00.000Z'),
      version: '7.8.9',
    }),
    {
      buildDate: '2026-07-31',
      label: 'Version 7.8.9 (2026/07/31)',
      version: '7.8.9',
    },
  );
  assert.equal(
    resolveTitleBuildMetadata({
      environment: {[titleBuildDateEnvironmentVariable]: '2026-07-19'},
      now: new Date('2026-07-31T00:00:00.000Z'),
      version: '7.8.9',
    }).label,
    'Version 7.8.9 (2026/07/19)',
  );
  assert.throws(
    () =>
      resolveTitleBuildMetadata({
        environment: {[titleBuildDateEnvironmentVariable]: '2026-02-29'},
        version: '7.8.9',
      }),
    /not a valid calendar date/u,
  );
});

test('embeds an initial Title fallback and runtime-localized app-shell text', async () => {
  const [packageJson, favicon, projectSourceBefore, sourceManifestBefore, assetFilenamesBefore] =
    await Promise.all([
      readFile(packageJsonPath, 'utf8').then(JSON.parse),
      readFile(faviconPath),
      readFile(projectSourcePath),
      readFile(sourceManifestPath),
      readdir(assetsDirectory),
    ]);
  const built = await createKamishibaiSb3({
    environment: {[titleBuildDateEnvironmentVariable]: '2026-07-31'},
  });
  const archive = unzipSync(built.archive);
  const project = JSON.parse(strFromU8(archive['project.json']));
  const stage = project.targets.find((target) => target.isStage);
  const officialWebsiteButton = project.targets.find(
    (target) => target.name === 'officialWebsiteButton',
  );
  const expectedLabel = `Version ${packageJson.version} (2026/07/31)`;

  assert.equal(built.titleBuildMetadata.label, expectedLabel);
  assert.deepEqual(readTitleBuildMetadataFromSb3(built.archive), {
    buildDate: '2026-07-31',
    label: expectedLabel,
    version: packageJson.version,
  });
  assert.deepEqual(
    stage.costumes.map((costume) => costume.name),
    ['Title', 'TitleRuntime', 'Stars', 'LoadingBackdrop'],
  );
  const titleCostume = stage.costumes.find((costume) => costume.name === 'Title');
  const titleSvg = strFromU8(archive[titleCostume.md5ext]);
  const fallbackLocale = appShellLocales.en;
  assert(titleSvg.includes(expectedLabel));
  assert(titleSvg.includes(escapeXmlText(fallbackLocale.about.title)));
  for (const line of [...appShellTitleLines.en.licenseApp, ...appShellTitleLines.en.licenseStory]) {
    assert(titleSvg.includes(escapeXmlText(line)));
  }
  for (const line of appShellTitleLines.en.authorOrganization) {
    assert(titleSvg.includes(escapeXmlText(line)));
  }
  assert(titleSvg.includes(escapeXmlText(fallbackLocale.about.author.name)));
  assert(titleSvg.includes(appShellCommon.about.author.email));
  assert(!titleSvg.includes(titleVersionPlaceholder));
  assert(!titleSvg.includes('{{'));
  assert.match(titleSvg, /text-anchor="middle"/u);
  assert.equal(createHash('md5').update(titleSvg).digest('hex'), titleCostume.assetId);
  assert.equal(titleCostume.md5ext, `${titleCostume.assetId}.svg`);
  assert.equal(built.titleBuildMetadata.titleAsset.filename, titleCostume.md5ext);

  const runtimeTitleCostume = stage.costumes.find((costume) => costume.name === 'TitleRuntime');
  const runtimeTitleSvg = strFromU8(archive[runtimeTitleCostume.md5ext]);
  assert(!runtimeTitleSvg.includes('<text'));
  assert(!runtimeTitleSvg.includes('{{'));

  const runtimeValues = new Map();
  for (const block of Object.values(stage.blocks)) {
    if (block.opcode !== 'kubohiroyaassetcache_setTextValue') continue;
    const name = block.inputs.NAME?.[1]?.[1];
    const value = block.inputs.VALUE?.[1]?.[1];
    if (typeof name !== 'string' || typeof value !== 'string') continue;
    const values = runtimeValues.get(name) ?? new Set();
    values.add(value);
    runtimeValues.set(name, values);
  }
  assert.deepEqual([...runtimeValues.get('about.version')], [expectedLabel]);
  const titleWidthStyle = Object.values(stage.blocks).find(
    (block) =>
      block.opcode === 'kubohiroyaassetcache_setTextStyle' &&
      block.inputs?.NAME?.[1]?.[1] === 'about.title' &&
      block.inputs?.PROPERTY?.[1]?.[1] === 'width',
  );
  assert.equal(titleWidthStyle?.inputs?.VALUE?.[1]?.[1], '700');
  for (const localized of Object.values(appShellLocales)) {
    assert(runtimeValues.get('about.title').has(localized.about.title));
    assert(runtimeValues.get('about.license.app').has(localized.about.license.app));
    assert(runtimeValues.get('about.license.story').has(localized.about.license.story));
    assert(
      [...runtimeValues.get('about.author.organization')].some((value) =>
        value.includes(localized.about.author.organization),
      ),
    );
    assert(
      [...runtimeValues.get('about.author.name')].some(
        (value) =>
          value.includes(localized.about.author.name) &&
          value.includes(appShellCommon.about.author.email),
      ),
    );
    assert(
      runtimeValues.get('about.officialWebsite.name').has(localized.about.officialWebsite.name),
    );
  }

  assert.deepEqual(
    officialWebsiteButton.costumes.map((costume) => costume.name),
    ['official-website-button', 'official-website-button-runtime'],
  );
  const fallbackWebsiteCostume = officialWebsiteButton.costumes[0];
  const runtimeWebsiteCostume = officialWebsiteButton.costumes[1];
  for (const [costume, expectedName] of [
    [fallbackWebsiteCostume, fallbackLocale.about.officialWebsite.name],
    [runtimeWebsiteCostume, null],
  ]) {
    const svg = strFromU8(archive[costume.md5ext]);
    assert(!svg.includes(officialWebsiteFaviconPlaceholder));
    assert(!svg.includes('{{'));
    assert(svg.includes('width="150" height="32" viewBox="0 0 150 32"'));
    assert(svg.includes('x="18" y="7" width="18" height="18"'));
    assert(svg.includes('fill="#fff" stroke="#007f71"'));
    if (expectedName) assert(svg.includes(escapeXmlText(expectedName)));
    else assert(!svg.includes('<text'));
    const embeddedFavicon = svg.match(/data:image\/png;base64,([^"]+)/u)?.[1];
    assert(embeddedFavicon);
    assert(Buffer.from(embeddedFavicon, 'base64').equals(favicon));
    assert.equal(createHash('md5').update(svg).digest('hex'), costume.assetId);
    assert.equal(costume.md5ext, `${costume.assetId}.svg`);
  }
  assert.equal(
    built.titleBuildMetadata.officialWebsiteFallbackAsset.filename,
    fallbackWebsiteCostume.md5ext,
  );
  assert.equal(
    built.titleBuildMetadata.officialWebsiteAsset.filename,
    runtimeWebsiteCostume.md5ext,
  );
  const builtProjectSource = JSON.stringify(project);
  for (const placeholder of Object.keys(appShellProjectPlaceholders)) {
    assert(!builtProjectSource.includes(placeholder));
  }
  assert(builtProjectSource.includes(appShellCommon.about.officialWebsite.url));
  for (const sourceFilename of [
    'd09cdbee37f6639281dc5cfb263cd417.svg',
    '03f3c75c202a3c60e4ffae10cc32872a.svg',
    'd6fd4b1b39db3992a003779ed13c404f.svg',
  ]) {
    assert.equal(archive[sourceFilename], undefined);
  }
  assert(archive['c307dbe27e1733c95382d11de19ae476.svg']);
  assert.equal(archive['c7334c6a74860d5808c4962f250b52f2.svg'], undefined);
  assert.equal(archive['219229644e41b20c4811dce46b3dfdd1.svg'], undefined);
  await assert.rejects(access(built.source.resolvedSourceDirectory));

  const [projectSourceAfter, sourceManifestAfter, assetFilenamesAfter] = await Promise.all([
    readFile(projectSourcePath),
    readFile(sourceManifestPath),
    readdir(assetsDirectory),
  ]);
  assert(projectSourceAfter.equals(projectSourceBefore));
  assert(sourceManifestAfter.equals(sourceManifestBefore));
  assert.deepEqual(assetFilenamesAfter.sort(), assetFilenamesBefore.sort());
});
