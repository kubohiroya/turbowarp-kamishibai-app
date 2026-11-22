import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {renderSiteVersion, siteVersionPlaceholder} from '../scripts/site-version.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const urashimaWebUrl =
  'https://kubohiroya.github.io/tmpose-kamishibai-samples/stories/urashima/web/';

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
    (error) => error.code === 'ENOENT',
  );
});

test('links and documents the generated downloadable SB3', async () => {
  const [downloadPage, readme, packageJsonSource, ciWorkflow] = await Promise.all([
    readFile(path.join(projectRoot, 'site/downloads/index.html'), 'utf8'),
    readFile(path.join(projectRoot, 'README.md'), 'utf8'),
    readFile(path.join(projectRoot, 'package.json'), 'utf8'),
    readFile(path.join(projectRoot, '.github/workflows/ci.yml'), 'utf8'),
  ]);
  const packageJson = JSON.parse(packageJsonSource);

  assert.match(downloadPage, /href="kamishibai\.sb3" download/u);
  assert.doesNotMatch(downloadPage, /kamishibai-3_1a1\.sb3/u);
  assert.match(readme, /github\.com\/kubohiroya\/sb3-toolchain/u);
  assert.match(
    packageJson.devDependencies['@kubohiroya/sb3-toolchain'],
    /^github:kubohiroya\/sb3-toolchain#[0-9a-f]{40}$/u,
    'SB3 toolchain dependency must use a fixed commit.',
  );
  assert.match(ciWorkflow, /run: pnpm sb3:check/u);
  assert.doesNotMatch(readme, /github:kubohiroya\/sb3-toolchain#[0-9a-f]{40}/u);
  assert.match(
    readme,
    new RegExp(
      `pnpm add --save-exact @kubohiroya/turbowarp-kamishibai-app@${packageJson.version.replaceAll('.', '\\.')}`,
      'u',
    ),
    'README installation must use the current fixed npm version.',
  );
  assert.doesNotMatch(readme, /github:kubohiroya\/tmpose-kamishibai#v3\.1\.0/u);
  assert.doesNotMatch(readme, /allowBuilds/u);
  assert.match(readme, /github\.com\/kubohiroya\/tmpose-kamishibai-samples/u);
  assert.match(readme, /kubohiroya\.github\.io\/tmpose-kamishibai-samples\//u);
  assert.match(readme, /github\.com\/kubohiroya\/tmpose-kamishibai-docs/u);
  assert.match(readme, /kubohiroya\.github\.io\/tmpose-kamishibai-docs\//u);
  assert.doesNotMatch(readme, /\]\(docs\//u);
  assert.doesNotMatch(readme, /setLoadingCostume=/u);
});

test('renders the top-page download version from package metadata', async () => {
  const [siteIndex, packageJson] = await Promise.all([
    readFile(path.join(projectRoot, 'site/index.html'), 'utf8'),
    readFile(path.join(projectRoot, 'package.json'), 'utf8').then(JSON.parse),
  ]);

  assert.equal(siteIndex.split(siteVersionPlaceholder).length - 1, 1);
  assert.doesNotMatch(siteIndex, /kamishibai \d/u);

  const rendered = renderSiteVersion(siteIndex, packageJson.version);
  assert.match(
    rendered,
    new RegExp(`kamishibai\\s+${packageJson.version.replaceAll('.', '\\.')}のSB3ファイル`, 'u'),
  );
  assert(!rendered.includes(siteVersionPlaceholder));
  assert.throws(
    () => renderSiteVersion(siteIndex.replace(siteVersionPlaceholder, ''), packageJson.version),
    /Expected exactly one/u,
  );
  assert.throws(
    () => renderSiteVersion(`${siteIndex}\n${siteVersionPlaceholder}`, packageJson.version),
    /found 2/u,
  );
});

test('opens the Urashima web sample from the top-page Web card', async () => {
  const siteIndex = await readFile(path.join(projectRoot, 'site/index.html'), 'utf8');

  assert(siteIndex.includes(`href="${urashimaWebUrl}"`));
  assert.match(siteIndex, /Web版を開く/u);
  assert.doesNotMatch(siteIndex, /https:\/\/sqs\.prof\.cuc\.ac\.jp\/kamishibai\//u);
});

test('links the public sample site without restoring the retired local page', async () => {
  const pages = await Promise.all(
    ['site/index.html', 'site/docs/index.html', 'site/downloads/index.html'].map((relativePath) =>
      readFile(path.join(projectRoot, relativePath), 'utf8'),
    ),
  );

  for (const page of pages) {
    assert.match(page, /href="https:\/\/kubohiroya\.github\.io\/tmpose-kamishibai-samples\/"/u);
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

test('keeps the generic app source free of Urashima sample content', async () => {
  const genericProjectSource = await readFile(
    path.join(projectRoot, 'app/project.source.json'),
    'utf8',
  );
  const genericProject = JSON.parse(genericProjectSource);
  const genericStage = genericProject.targets.find((target) => target.isStage);
  const prompt = genericProject.targets.find((target) => target.name === 'prompt');
  const loading = genericProject.targets.find((target) => target.name === 'Loading');
  const sampleTargetNames = ['Fish', 'Princess', 'Turtle', 'Urashima'];
  const sampleAssetNames = ['Beach1', 'Dragon Castle', 'Ocean Wave', 'Urashima-old-2'];

  assert(genericStage, 'The generic app source has no Stage target.');
  assert.deepEqual(
    {x: prompt?.x, y: prompt?.y, size: prompt?.size},
    {x: -8, y: 150, size: 100},
    'The generic prompt layout differs.',
  );
  assert.deepEqual(
    {x: loading?.x, y: loading?.y, size: loading?.size},
    {x: 1, y: -62, size: 100},
    'The generic loading layout differs.',
  );
  assert.deepEqual(genericStage.variables?.tmposeEmbeddedScript, ['__tmpose_embedded_script', '']);
  assert.equal(
    genericProject.monitors.some((monitor) => monitor.id === 'tmposeEmbeddedScript'),
    false,
    'The reserved embedded script variable must not have a monitor.',
  );
  assert.equal(genericStage.blocks.embeddedScriptChoice?.opcode, 'control_if_else');
  assert.equal(genericStage.blocks.embeddedSetScript?.opcode, 'lmsTempVars2_setRuntimeVariable');
  assert.deepEqual(genericStage.blocks.embeddedSetScript?.inputs?.VAR, [1, [10, 'script']]);
  assert.equal(
    genericStage.blocks.embeddedStartStory?.inputs?.BROADCAST_INPUT?.[1]?.[1],
    'startStory',
  );
  assert.equal(genericStage.blocks['l@']?.inputs?.BROADCAST_INPUT?.[1]?.[1], 'showCover');
  for (const list of Object.values(genericStage.lists ?? {})) {
    assert.deepEqual(list[1], [], `Generic runtime list is not empty: ${list[0]}`);
  }
  for (const targetName of sampleTargetNames) {
    assert(
      !genericProject.targets.some((target) => target.name === targetName),
      `Generic app source contains the sample target: ${targetName}`,
    );
  }

  const genericAssetNames = genericProject.targets.flatMap((target) => [
    ...(target.costumes ?? []).map((costume) => costume.name),
    ...(target.sounds ?? []).map((sound) => sound.name),
  ]);
  for (const assetName of sampleAssetNames) {
    assert(
      !genericAssetNames.includes(assetName),
      `Generic app source contains the sample asset: ${assetName}`,
    );
  }
});
