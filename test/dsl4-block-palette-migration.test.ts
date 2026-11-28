import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'vitest';
import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate';
import {authorDsl4BlockSourceSb3} from '../src/builder/dsl4-block-source-author.js';
import {migrateDsl4BlockPaletteFile} from '../src/builder/dsl4-block-palette-migrate.js';
import {parseCliArguments} from '../src/builder/cli.js';
import {
  restoreDsl4BlockPaletteProject,
  unifyDsl4BlockPaletteProject,
} from '../src/dsl4/block-palette-migration.js';
import {
  dsl4AuthoringBlockName,
  dsl4BlockAuthoringExtensionId,
  dsl4UnifiedDeclarationsRuntimeCapability,
} from '../src/dsl4/block-source-shared.js';
import {extractDsl4BlockSourcesFromProject} from '../src/dsl4/turbowarp-yaml-json-block-source.js';
import {dsl4TestSourceFrontend as frontend} from './helpers/dsl4-test-frontend.ts';

type Project = {
  extensions: string[];
  extensionURLs: Record<string, string>;
  targets: {blocks: Record<string, {opcode: string}>; [key: string]: unknown}[];
  turboWarpPlus?: unknown;
};

const costumeSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>';
const costumeId = createHash('md5').update(costumeSvg).digest('hex');
const bundlePrefix = 'kubohiroyakamishibai4_kubohiroyakamishibairuntime4__';
const retiredPrefix = `${dsl4BlockAuthoringExtensionId}_`;
const oldRuntime = '// ID: kubohiroyakamishibai4\n// Kamishibai capabilities: simple-speech-v1\n';
const currentRuntime = `// ID: kubohiroyakamishibai4\n${dsl4UnifiedDeclarationsRuntimeCapability}\n`;
const source = `kamishibai: '4.0'
assets:
  Beach: backdrop
  HeroIdle: costume:Hero
actors:
  Hero: HeroIdle
variables:
  score: 0
scenes:
  opening:
    entryTransition: {effect: cut}
    actions:
      - stage: {backdrop: Beach}
      - Hero.show: {skin: HeroIdle, x: 0, y: -20, scale: 100}
      - Hero.say: {text: こんにちは, seconds: 1}
      - goto: ending
  ending:
    - wait: 0
`;

/** An SB3 authored on a runtime from before the merge: declarations in the retired extension. */
function legacySb3(runtimeSource = oldRuntime): Uint8Array {
  const base = zipSync({
    'project.json': strToU8(
      JSON.stringify({
        targets: [
          {
            name: 'Stage',
            isStage: true,
            blocks: {},
            variables: {},
            lists: {},
            broadcasts: {},
            costumes: [
              {
                name: 'blank',
                assetId: costumeId,
                md5ext: `${costumeId}.svg`,
                dataFormat: 'svg',
                bitmapResolution: 1,
                rotationCenterX: 240,
                rotationCenterY: 180,
              },
            ],
            sounds: [],
            comments: {},
            currentCostume: 0,
            volume: 100,
            layerOrder: 0,
            tempo: 60,
            videoTransparency: 50,
            videoState: 'on',
            textToSpeechLanguage: null,
          },
        ],
        extensions: ['kubohiroyakamishibai4'],
        extensionURLs: {
          kubohiroyakamishibai4:
            'data:text/javascript;base64,' + Buffer.from(runtimeSource).toString('base64'),
        },
        monitors: [],
        meta: {semver: '3.0.0', vm: '0.2.0', agent: 'palette migration test'},
      }),
    ),
    [`${costumeId}.svg`]: strToU8(costumeSvg),
  });
  const result = authorDsl4BlockSourceSb3({
    baseBytes: base,
    sourceText: source,
    sourceFrontend: frontend,
  });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics?.slice(0, 4)));
  if (!result.ok) throw new Error('Authoring failed');
  return result.bytes;
}

const projectOf = (bytes: Uint8Array) =>
  JSON.parse(strFromU8(unzipSync(bytes)['project.json']!)) as Project;
const declarationOpcodes = (project: Project) =>
  project.targets
    .flatMap((target) => Object.values(target.blocks))
    .map((block) => block.opcode)
    .filter((opcode) => dsl4AuthoringBlockName(opcode) !== null);
const story = (project: Project) => extractDsl4BlockSourcesFromProject(project as never).sources;

async function withDirectory(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'kamishibai-palette-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
}

test('an SB3 authored on an older runtime keeps the retired extension and its spelling', () => {
  const project = projectOf(legacySb3());
  assert.ok(project.extensions.includes(dsl4BlockAuthoringExtensionId));
  const opcodes = declarationOpcodes(project);
  assert.ok(opcodes.length > 0);
  assert.ok(opcodes.every((opcode) => opcode.startsWith(retiredPrefix)));
  assert.ok(opcodes.includes(`${retiredPrefix}scene`));
});

test('unify moves every declaration onto the runtime and keeps the story', () => {
  const legacy = projectOf(legacySb3());
  const before = structuredClone(legacy);
  const {project, report} = unifyDsl4BlockPaletteProject(legacy as never);
  assert.deepEqual(legacy, before, 'The input project is not changed.');
  const unified = project as unknown as Project;
  assert.equal(unified.extensions.includes(dsl4BlockAuthoringExtensionId), false);
  assert.equal(Object.hasOwn(unified.extensionURLs, dsl4BlockAuthoringExtensionId), false);
  const opcodes = declarationOpcodes(unified);
  assert.ok(
    opcodes.every((opcode) => opcode.startsWith(bundlePrefix)),
    opcodes.join(),
  );
  assert.equal(report.form, 'bundle');
  assert.equal(report.rewrittenBlocks, opcodes.length);
  assert.equal(report.authoringExtensionChanged, true);
  assert.deepEqual(story(unified), story(legacy));
  assert.deepEqual(report.verifiedSources, ['Stage.k4.yml']);

  const again = unifyDsl4BlockPaletteProject(project);
  assert.equal(again.report.rewrittenBlocks, 0);
  assert.equal(again.report.authoringExtensionChanged, false);
  assert.deepEqual(again.project, project);
});

test('restore puts the declarations back in the retired extension', () => {
  const legacy = projectOf(legacySb3());
  const unified = unifyDsl4BlockPaletteProject(legacy as never).project;
  const extensionSource = `// ID: ${dsl4BlockAuthoringExtensionId}\n(function(){})();\n`;
  const {project, report} = restoreDsl4BlockPaletteProject(unified, extensionSource);
  const restored = project as unknown as Project;
  assert.ok(restored.extensions.includes(dsl4BlockAuthoringExtensionId));
  assert.ok(declarationOpcodes(restored).every((opcode) => opcode.startsWith(retiredPrefix)));
  assert.equal(report.direction, 'restore');
  assert.deepEqual(story(restored), story(legacy));
  assert.throws(
    () => restoreDsl4BlockPaletteProject(unified, 'not an extension'),
    /Block Script extension source is required/u,
  );
});

test('the file command replaces an older runtime, writes a report and never overwrites', async () => {
  await withDirectory(async (directory) => {
    const input = path.join(directory, 'old.sb3');
    const output = path.join(directory, 'new.sb3');
    const reportPath = path.join(directory, 'report.json');
    const original = new Uint8Array(legacySb3());
    await writeFile(input, original);
    const result = await migrateDsl4BlockPaletteFile({
      input,
      output,
      report: reportPath,
      runtimeExtensionSource: currentRuntime,
    });
    assert.deepEqual(new Uint8Array(await readFile(input)), original);
    const written = await readFile(output);
    const unified = projectOf(written);
    assert.ok(declarationOpcodes(unified).every((opcode) => opcode.startsWith(bundlePrefix)));
    assert.equal(
      Buffer.from(unified.extensionURLs.kubohiroyakamishibai4!.split(',')[1]!, 'base64').toString(),
      currentRuntime,
    );
    assert.deepEqual(unzipSync(written)[`${costumeId}.svg`], strToU8(costumeSvg));
    assert.deepEqual(story(unified), story(projectOf(original)));
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    assert.equal(report.runtimeRefreshed, true);
    assert.equal(report.direction, 'unify');
    assert.equal(report.archiveAssetsPreserved, 1);
    assert.equal(result.report.outputSha256, report.outputSha256);

    await assert.rejects(
      migrateDsl4BlockPaletteFile({input, output, runtimeExtensionSource: currentRuntime}),
      {code: 'K4-MIGRATION-OUTPUT-EXISTS'},
    );
    await assert.rejects(migrateDsl4BlockPaletteFile({input, output: input}), {
      code: 'K4-MIGRATION-IN-PLACE',
    });

    const restoredPath = path.join(directory, 'restored.sb3');
    const restored = await migrateDsl4BlockPaletteFile({
      input: output,
      output: restoredPath,
      direction: 'restore',
    });
    assert.equal(restored.report.runtimeRefreshed, false);
    const back = projectOf(await readFile(restoredPath));
    assert.ok(back.extensions.includes(dsl4BlockAuthoringExtensionId));
    assert.match(
      Buffer.from(
        back.extensionURLs[dsl4BlockAuthoringExtensionId]!.split(',')[1]!,
        'base64',
      ).toString(),
      new RegExp(`// ID: ${dsl4BlockAuthoringExtensionId}\\n`, 'u'),
    );
    assert.deepEqual(story(back), story(projectOf(original)));
  });
});

test('a runtime that already defines the declarations is kept', async () => {
  await withDirectory(async (directory) => {
    const input = path.join(directory, 'old.sb3');
    const output = path.join(directory, 'new.sb3');
    // An older work whose runtime was later updated in place still carries the retired blocks.
    const project = projectOf(legacySb3());
    project.extensionURLs.kubohiroyakamishibai4 =
      'data:text/javascript;base64,' + Buffer.from(currentRuntime).toString('base64');
    const files = unzipSync(legacySb3());
    files['project.json'] = strToU8(JSON.stringify(project));
    await writeFile(input, zipSync(files));
    const result = await migrateDsl4BlockPaletteFile({input, output});
    assert.equal(result.report.runtimeRefreshed, false);
    assert.ok(result.report.rewrittenBlocks > 0);
  });
});

test('a Plus manifest that pins an older runtime is refused instead of invalidated', async () => {
  await withDirectory(async (directory) => {
    const input = path.join(directory, 'old.sb3');
    const project = projectOf(legacySb3());
    project.turboWarpPlus = {schemaVersion: 1, extensions: []};
    const files = unzipSync(legacySb3());
    files['project.json'] = strToU8(JSON.stringify(project));
    await writeFile(input, zipSync(files));
    await assert.rejects(
      migrateDsl4BlockPaletteFile({
        input,
        output: path.join(directory, 'new.sb3'),
        runtimeExtensionSource: currentRuntime,
      }),
      {code: 'K4-MIGRATION-PALETTE-RUNTIME'},
    );
  });
});

test('the CLI parses the command and its restore switch', () => {
  const unify = parseCliArguments([
    'migrate-block-palette',
    '--input',
    'old.sb3',
    '--output',
    'new.sb3',
    '--report',
    'report.json',
  ]);
  assert.equal(unify.action, 'migrate-block-palette');
  if (unify.action !== 'migrate-block-palette') return;
  assert.equal(unify.options.direction, 'unify');
  assert.equal(unify.options.report, path.resolve('report.json'));
  const restore = parseCliArguments([
    'migrate-block-palette',
    '--input',
    'new.sb3',
    '--output',
    'old.sb3',
    '--restore',
  ]);
  assert.equal(restore.action === 'migrate-block-palette' && restore.options.direction, 'restore');
  assert.throws(() => parseCliArguments(['migrate-block-palette', '--input', 'a.sb3']));
});
