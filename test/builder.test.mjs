import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {clearTimeout, setTimeout} from 'node:timers';
import {fileURLToPath} from 'node:url';

import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate';
import {createDeterministicSb3} from '@kubohiroya/sb3-toolchain';

import {installBundleTransactionally} from '../src/builder/atomic-output.js';
import {parseCliArguments, runCli} from '../src/builder/cli.js';
import {
  buildSb3Bundle,
  Sb3BuilderError,
  validateAssetManifest,
  validateBundle,
} from '../src/builder/index.js';
import {
  embeddedScriptVariableId,
  embeddedScriptVariableName,
  packageVersion,
} from '../src/builder/constants.js';
import {createEmbeddedReference} from '../src/builder/script.js';
import {loadKamishibaiVm} from './helpers/turbowarp-vm.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const appDirectory = path.join(projectRoot, 'app');
const fixtureAssetsDirectory = path.join(projectRoot, 'test', 'fixtures', 'assets');
const actorPopFixturePath = path.join(fixtureAssetsDirectory, 'actor-pop.wav');
const loadingChirpFixturePath = path.join(fixtureAssetsDirectory, 'loading-chirp.wav');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function withTemporaryDirectory(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tmpose-builder-test-'));
  try {
    return await callback(directory);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {(project: Record<string, any>) => void} updateProject
 */
async function rewriteSb3Project(inputPath, outputPath, updateProject) {
  const archive = unzipSync(new Uint8Array(await readFile(inputPath)));
  const project = JSON.parse(strFromU8(archive['project.json']));
  updateProject(project);
  archive['project.json'] = strToU8(`${JSON.stringify(project)}\n`);
  await writeFile(outputPath, zipSync(archive));
}

function imageEntry({name, uri, kind, target, sb3Name, contents}) {
  return {
    name,
    uri,
    kind,
    target,
    sb3Name,
    contentType: 'image/svg+xml',
    dataFormat: 'svg',
    size: contents.length,
    sha256: sha256(contents),
    license: 'CC0-1.0',
    metadata: {bitmapResolution: 1, rotationCenterX: 1, rotationCenterY: 1},
  };
}

function soundEntry({name, uri, kind, target, sb3Name, contents, metadata}) {
  return {
    name,
    uri,
    kind,
    target,
    sb3Name,
    contentType: 'audio/wav',
    dataFormat: 'wav',
    size: contents.length,
    sha256: sha256(contents),
    license: 'CC0-1.0',
    metadata,
  };
}

test('serializes embedded costume references with the shortest equivalent form', () => {
  assert.equal(
    createEmbeddedReference({
      kind: 'costume',
      name: 'Princess',
      target: 'Princess',
      sb3Name: 'Princess',
    }),
    'costume',
  );
  assert.equal(
    createEmbeddedReference({
      kind: 'costume',
      name: 'p1',
      target: 'Princess',
      sb3Name: 'p1',
    }),
    'costume:Princess',
  );
  assert.equal(
    createEmbeddedReference({
      kind: 'costume',
      name: 'hero-front',
      target: '人物',
      sb3Name: '通常',
    }),
    'costume:人物:通常',
  );
});

async function writeFileFixture(directory) {
  const inputDirectory = path.join(directory, 'input');
  const assetsDirectory = path.join(inputDirectory, 'assets');
  const outputDirectory = path.join(directory, 'output');
  await mkdir(assetsDirectory, {recursive: true});
  const backdrop = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="blue"/></svg>',
  );
  const costume = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><circle cx="1" cy="1" r="1"/></svg>',
  );
  const [stageSound, spriteSound] = await Promise.all([
    readFile(actorPopFixturePath),
    readFile(loadingChirpFixturePath),
  ]);
  await Promise.all([
    writeFile(path.join(assetsDirectory, 'backdrop.svg'), backdrop),
    writeFile(path.join(assetsDirectory, 'costume.svg'), costume),
    writeFile(path.join(assetsDirectory, 'stage.wav'), stageSound),
    writeFile(path.join(assetsDirectory, 'sprite.wav'), spriteSound),
  ]);
  const baseSb3Path = path.join(inputDirectory, 'base.sb3');
  const builtBase = await createDeterministicSb3(appDirectory);
  await writeFile(baseSb3Path, builtBase.archive);
  const sourceScriptPath = path.join(inputDirectory, 'source.txt');
  const source = [
    'kamishibai=3.2',
    '#asset=Commented,https://example.com/unchanged.svg',
    'asset=Scene,file:assets/backdrop.svg',
    'asset=Hero,file:assets/costume.svg',
    'asset=StageAudio,file:assets/stage.wav',
    'asset=ActorAudio,file:assets/sprite.wav',
    'asset=Title,backdrop',
    'text=Narration:本文は変更しない',
    'actor=Hero,Hero',
    'cover=Title,',
    '---',
    'sceneLabel=first',
    'action=stage:Scene',
    'action=wait:30',
    '',
  ].join('\r\n');
  await writeFile(sourceScriptPath, source);
  const manifest = {
    formatVersion: 1,
    assets: [
      imageEntry({
        name: 'Scene',
        uri: 'file:assets/backdrop.svg',
        kind: 'backdrop',
        target: '@stage',
        sb3Name: 'Builder Scene',
        contents: backdrop,
      }),
      imageEntry({
        name: 'Hero',
        uri: 'file:assets/costume.svg',
        kind: 'costume',
        target: 'Actor',
        sb3Name: 'Builder Hero',
        contents: costume,
      }),
      soundEntry({
        name: 'StageAudio',
        uri: 'file:assets/stage.wav',
        kind: 'stageSound',
        target: '@stage',
        sb3Name: 'Builder Stage Audio',
        contents: stageSound,
        metadata: {format: '', rate: 48000, sampleCount: 1123},
      }),
      soundEntry({
        name: 'ActorAudio',
        uri: 'file:assets/sprite.wav',
        kind: 'spriteSound',
        target: 'Actor',
        sb3Name: 'Builder Actor Audio',
        contents: spriteSound,
        metadata: {format: 'adpcm', rate: 22050, sampleCount: 6097},
      }),
    ],
  };
  const assetManifestPath = path.join(inputDirectory, 'assets.lock.json');
  await writeJson(assetManifestPath, manifest);
  return {
    assetManifestPath,
    baseSb3Path,
    inputDirectory,
    manifest,
    outputDirectory,
    source,
    sourceScriptPath,
  };
}

test('builds all asset kinds, transforms only active asset lines, and preserves the base project', async () => {
  await withTemporaryDirectory(async (directory) => {
    const fixture = await writeFileFixture(directory);
    const originalInputs = await Promise.all([
      readFile(fixture.baseSb3Path),
      readFile(fixture.sourceScriptPath),
      readFile(fixture.assetManifestPath),
    ]);
    const originalProject = JSON.parse(strFromU8(unzipSync(originalInputs[0])['project.json']));
    const first = await buildSb3Bundle({
      baseSb3: fixture.baseSb3Path,
      sourceScript: fixture.sourceScriptPath,
      assetManifest: fixture.assetManifestPath,
      outputDirectory: fixture.outputDirectory,
      outputName: 'sample',
      profile: 'editor',
    });
    const outputSb3 = await readFile(first.outputPaths['sample.sb3']);
    const outputScript = await readFile(first.outputPaths['sample.txt']);
    const outputManifest = JSON.parse(
      await readFile(first.outputPaths['sample.manifest.json'], 'utf8'),
    );
    const validated = validateBundle({
      sb3Bytes: outputSb3,
      scriptBytes: outputScript,
      manifest: outputManifest,
    });

    assert.match(validated.script, /^#asset=Commented,https:\/\/example\.com\/unchanged\.svg$/mu);
    assert.match(validated.script, /^asset=Scene,backdrop:Builder Scene$/mu);
    assert.match(validated.script, /^asset=Hero,costume:Actor:Builder Hero$/mu);
    assert.match(validated.script, /^asset=StageAudio,sound:@stage:Builder Stage Audio$/mu);
    assert.match(validated.script, /^asset=ActorAudio,sound:Actor:Builder Actor Audio$/mu);
    assert.match(validated.script, /^text=Narration:本文は変更しない\r$/mu);
    assert.equal(validated.script.includes('\r\n'), true);

    const outputProject = validated.project;
    assert.deepEqual(outputProject.extensionURLs, originalProject.extensionURLs);
    assert.deepEqual(outputProject.monitors, originalProject.monitors);
    for (const originalTarget of originalProject.targets) {
      const outputTarget = outputProject.targets.find(
        (target) => target.name === originalTarget.name,
      );
      assert.deepEqual(outputTarget.blocks, originalTarget.blocks);
      assert.deepEqual(outputTarget.variables, originalTarget.variables);
      assert.deepEqual(outputTarget.lists, originalTarget.lists);
    }
    const stage = outputProject.targets.find((target) => target.isStage);
    const actor = outputProject.targets.find((target) => target.name === 'Actor');
    assert(stage.costumes.some(({name}) => name === 'Builder Scene'));
    assert(stage.sounds.some(({name}) => name === 'Builder Stage Audio'));
    assert(actor.costumes.some(({name}) => name === 'Builder Hero'));
    assert(actor.sounds.some(({name}) => name === 'Builder Actor Audio'));
    assert.equal(outputManifest.formatVersion, 2);
    assert.equal(outputManifest.assets.length, 4);
    assert.equal(outputManifest.profile, 'editor');
    assert.deepEqual(outputManifest.script, {
      mode: 'external',
      embeddedVariableId: null,
      size: outputScript.length,
      sha256: sha256(outputScript),
    });
    assert.equal(outputManifest.outputs.sb3.sha256, sha256(outputSb3));
    assert.equal(outputManifest.outputs.script.sha256, sha256(outputScript));

    assert.deepEqual(await readFile(fixture.baseSb3Path), originalInputs[0]);
    assert.deepEqual(await readFile(fixture.sourceScriptPath), originalInputs[1]);
    assert.deepEqual(await readFile(fixture.assetManifestPath), originalInputs[2]);

    const secondDirectory = path.join(directory, 'second-output');
    const second = await buildSb3Bundle({
      baseSb3: fixture.baseSb3Path,
      sourceScript: fixture.sourceScriptPath,
      assetManifest: fixture.assetManifestPath,
      outputDirectory: secondDirectory,
      outputName: 'sample',
      profile: 'editor',
    });
    assert.deepEqual(await readFile(second.outputPaths['sample.sb3']), outputSb3);
    assert.deepEqual(await readFile(second.outputPaths['sample.txt']), outputScript);
    assert.deepEqual(
      await readFile(second.outputPaths['sample.manifest.json']),
      await readFile(first.outputPaths['sample.manifest.json']),
    );

    const vmHarness = await loadKamishibaiVm({sb3Path: first.outputPaths['sample.sb3']});
    vmHarness.quit();
  });
});

test('builds a player with the exact transformed script and starts it from the title click', async (context) => {
  await withTemporaryDirectory(async (directory) => {
    const fixture = await writeFileFixture(directory);
    const playerSourcePath = path.join(fixture.inputDirectory, 'player-source.txt');
    await writeFile(
      playerSourcePath,
      [
        'kamishibai=3.2',
        '# Unicode=日本語のコメント',
        'asset=Scene,file:assets/backdrop.svg',
        'asset=StageAudio,file:assets/stage.wav',
        'asset=Title,backdrop',
        'asset=Narration,text',
        'actor=Narration,Narration',
        'cover=Title,',
        '---',
        'sceneLabel=first',
        'action=stage:Scene',
        'action=Narration:show:Narration:0,0,100',
        'text=Narration:むかし',
        'action=wait:30',
        '',
      ].join('\n'),
    );
    const result = await buildSb3Bundle({
      baseSb3: fixture.baseSb3Path,
      sourceScript: playerSourcePath,
      assetManifest: {
        formatVersion: 1,
        assets: [fixture.manifest.assets[0], fixture.manifest.assets[2]],
      },
      manifestBaseDirectory: fixture.inputDirectory,
      outputDirectory: fixture.outputDirectory,
      outputName: 'player',
      profile: 'player',
    });
    const sb3Bytes = await readFile(result.outputPaths['player.sb3']);
    const scriptBytes = await readFile(result.outputPaths['player.txt']);
    const manifest = JSON.parse(await readFile(result.outputPaths['player.manifest.json'], 'utf8'));
    const validated = validateBundle({sb3Bytes, scriptBytes, manifest});
    const stage = validated.project.targets.find((target) => target.isStage);

    assert.equal(manifest.profile, 'player');
    assert.deepEqual(manifest.script, {
      mode: 'embedded',
      embeddedVariableId: embeddedScriptVariableId,
      size: scriptBytes.length,
      sha256: sha256(scriptBytes),
    });
    assert.equal(stage.variables[embeddedScriptVariableId][0], embeddedScriptVariableName);
    assert.equal(stage.variables[embeddedScriptVariableId][1], validated.script);

    const harness = await loadKamishibaiVm({sb3Path: result.outputPaths['player.sb3']});
    context.after(() => harness.quit());
    harness.extensionState.localStorage.set('script', 'stale localStorage script');
    harness.greenFlag();
    harness.runUntil(() => harness.getRuntimeVariable('skipMode') === 'title');
    harness.setRuntimeVariable('script', 'stale script from another session');
    harness.clickStage();
    harness.runUntil(
      () =>
        harness.getBackdropName() === 'Builder Scene' &&
        harness.getRuntimeVariable('text:Narration') === 'むかし' &&
        harness.getActor('Narration')?.visible === true,
    );

    assert.equal(harness.getRuntimeVariable('script'), validated.script);
    assert.equal(harness.getActor('Narration')?.visible, true);
    assert.equal(harness.hasRuntimeVariable('Narration'), false);
    assert.deepEqual(harness.extensionState.consoleErrors, []);
    assert.equal(
      harness.extensionState.assets.get('StageAudio'),
      'sound:@stage:Builder Stage Audio',
    );
    assert.equal(harness.extensionState.filePickerRequests, 0);
    assert.equal(harness.hasRuntimeVariable('skipMode'), false);

    const secondDirectory = path.join(directory, 'second-player-output');
    const second = await buildSb3Bundle({
      baseSb3: fixture.baseSb3Path,
      sourceScript: playerSourcePath,
      assetManifest: {
        formatVersion: 1,
        assets: [fixture.manifest.assets[0], fixture.manifest.assets[2]],
      },
      manifestBaseDirectory: fixture.inputDirectory,
      outputDirectory: secondDirectory,
      outputName: 'player',
      profile: 'player',
    });
    for (const filename of ['player.sb3', 'player.txt', 'player.manifest.json']) {
      assert.deepEqual(
        await readFile(second.outputPaths[filename]),
        await readFile(result.outputPaths[filename]),
      );
    }
  });
});

test('resolves locked HTTP and HTTPS assets through the same builder core', async () => {
  await withTemporaryDirectory(async (directory) => {
    const fixture = await writeFileFixture(directory);
    const httpAsset = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
    const httpsAsset = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle/></svg>');
    const manifest = {
      formatVersion: 1,
      assets: [
        imageEntry({
          name: 'HttpScene',
          uri: 'http://assets.example/http.svg',
          kind: 'backdrop',
          target: '@stage',
          sb3Name: 'HTTP Scene',
          contents: httpAsset,
        }),
        imageEntry({
          name: 'HttpsHero',
          uri: 'https://assets.example/https.svg',
          kind: 'costume',
          target: 'Actor',
          sb3Name: 'HTTPS Hero',
          contents: httpsAsset,
        }),
      ],
    };
    const scriptPath = path.join(fixture.inputDirectory, 'remote.txt');
    await writeFile(
      scriptPath,
      [
        'kamishibai=3.2',
        'asset=HttpScene,http://assets.example/http.svg',
        'asset=HttpsHero,https://assets.example/https.svg',
        '',
      ].join('\n'),
    );
    const requests = [];
    const fetchImplementation = async (url) => {
      requests.push(url.href);
      const contents = url.protocol === 'http:' ? httpAsset : httpsAsset;
      return new Response(contents, {
        status: 200,
        headers: {'content-type': 'image/svg+xml', 'content-length': String(contents.length)},
      });
    };
    await assert.rejects(
      buildSb3Bundle({
        baseSb3: fixture.baseSb3Path,
        sourceScript: scriptPath,
        assetManifest: manifest,
        manifestBaseDirectory: fixture.inputDirectory,
        outputDirectory: fixture.outputDirectory,
        outputName: 'remote',
        profile: 'editor',
        fetchImplementation,
      }),
      /Plain HTTP is disabled/u,
    );
    const result = await buildSb3Bundle({
      baseSb3: fixture.baseSb3Path,
      sourceScript: scriptPath,
      assetManifest: manifest,
      manifestBaseDirectory: fixture.inputDirectory,
      outputDirectory: fixture.outputDirectory,
      outputName: 'remote',
      profile: 'editor',
      fetchImplementation,
      allowHttp: true,
    });
    assert.deepEqual(requests.slice(-2).sort(), [
      'http://assets.example/http.svg',
      'https://assets.example/https.svg',
    ]);
    assert.match(
      await readFile(result.outputPaths['remote.txt'], 'utf8'),
      /asset=HttpScene,backdrop:HTTP Scene/u,
    );
  });
});

test('rejects missing, escaped, and symlink-escaped file assets with asset context', async () => {
  await withTemporaryDirectory(async (directory) => {
    const fixture = await writeFileFixture(directory);
    const outside = path.join(directory, 'outside.svg');
    const contents = Buffer.from('<svg/>');
    await writeFile(outside, contents);
    const cases = [
      ['file:assets/missing.svg', /ENOENT/u],
      ['file:../outside.svg', /escapes every allowed root/u],
    ];
    await symlink(outside, path.join(fixture.inputDirectory, 'assets', 'escaped-link.svg'));
    cases.push(['file:assets/escaped-link.svg', /escapes every allowed root/u]);
    for (const [uri, expected] of cases) {
      const manifest = {
        formatVersion: 1,
        assets: [
          imageEntry({
            name: 'Unsafe',
            uri,
            kind: 'backdrop',
            target: '@stage',
            sb3Name: 'Unsafe',
            contents,
          }),
        ],
      };
      const scriptPath = path.join(
        fixture.inputDirectory,
        `unsafe-${cases.indexOf(cases.find((item) => item[0] === uri))}.txt`,
      );
      await writeFile(scriptPath, `kamishibai=3.2\nasset=Unsafe,${uri}\n`);
      await assert.rejects(
        buildSb3Bundle({
          baseSb3: fixture.baseSb3Path,
          sourceScript: scriptPath,
          assetManifest: manifest,
          manifestBaseDirectory: fixture.inputDirectory,
          outputDirectory: fixture.outputDirectory,
          outputName: 'unsafe',
          profile: 'editor',
        }),
        (error) => {
          assert(error instanceof Sb3BuilderError);
          assert.equal(error.assetName, 'Unsafe');
          assert.match(error.message, expected);
          return true;
        },
      );
    }
  });
});

test('rejects HTTP failures, redirects, type, size, and hash mismatches', async () => {
  await withTemporaryDirectory(async (directory) => {
    const fixture = await writeFileFixture(directory);
    const contents = Buffer.from('<svg/>');
    const scriptPath = path.join(fixture.inputDirectory, 'failure.txt');
    const uri = 'https://assets.example/failure.svg';
    await writeFile(scriptPath, `kamishibai=3.2\nasset=Failure,${uri}\n`);
    const baseEntry = imageEntry({
      name: 'Failure',
      uri,
      kind: 'backdrop',
      target: '@stage',
      sb3Name: 'Failure',
      contents,
    });
    const run = (entry, fetchImplementation, extra = {}) =>
      buildSb3Bundle({
        baseSb3: fixture.baseSb3Path,
        sourceScript: scriptPath,
        assetManifest: {formatVersion: 1, assets: [entry]},
        manifestBaseDirectory: fixture.inputDirectory,
        outputDirectory: fixture.outputDirectory,
        outputName: 'failure',
        profile: 'editor',
        fetchImplementation,
        ...extra,
      });
    await assert.rejects(
      run(baseEntry, async () => new Response('missing', {status: 404})),
      /HTTP 404/u,
    );
    await assert.rejects(
      run(
        baseEntry,
        async () =>
          new Response(contents, {
            headers: {'content-type': 'image/png'},
          }),
      ),
      /Content-Type mismatch/u,
    );
    await assert.rejects(
      run(
        {...baseEntry, size: contents.length + 1},
        async () =>
          new Response(contents, {
            headers: {'content-type': 'image/svg+xml'},
          }),
      ),
      /Size mismatch/u,
    );
    await assert.rejects(
      run(
        {...baseEntry, sha256: '0'.repeat(64)},
        async () =>
          new Response(contents, {
            headers: {'content-type': 'image/svg+xml'},
          }),
      ),
      /SHA-256 mismatch/u,
    );
    await assert.rejects(
      run(
        baseEntry,
        async () =>
          new Response(null, {
            status: 302,
            headers: {location: '/again.svg'},
          }),
        {maxRedirects: 1},
      ),
      /Redirect limit exceeded/u,
    );
    await assert.rejects(
      run(
        baseEntry,
        async () =>
          new Response(contents, {
            headers: {
              'content-type': 'image/svg+xml',
              'content-length': String(contents.length),
            },
          }),
        {maxAssetBytes: contents.length - 1},
      ),
      /byte limit/u,
    );
    await assert.rejects(
      run(
        baseEntry,
        async (_url, {signal}) =>
          new Promise((_resolve, reject) => {
            const guard = setTimeout(
              () => reject(new Error('Fetch mock did not receive the timeout abort.')),
              1_000,
            );
            const rejectOnAbort = () => {
              clearTimeout(guard);
              reject(signal.reason);
            };
            if (signal.aborted) {
              rejectOnAbort();
            } else {
              signal.addEventListener('abort', rejectOnAbort, {once: true});
            }
          }),
        {requestTimeoutMs: 5},
      ),
      /Request failed/u,
    );
  });
});

test('rejects missing mappings, name conflicts, kind conflicts, and existing SB3 names', async () => {
  const contents = Buffer.from('<svg/>');
  const first = imageEntry({
    name: 'One',
    uri: 'file:one.svg',
    kind: 'backdrop',
    target: '@stage',
    sb3Name: 'Same',
    contents,
  });
  assert.throws(
    () => validateAssetManifest({formatVersion: 1, assets: [first, {...first, name: 'Two'}]}),
    /Conflicting SB3 asset destination/u,
  );
  assert.throws(
    () =>
      validateAssetManifest({
        formatVersion: 1,
        assets: [first, {...first, kind: 'costume', target: 'Actor'}],
      }),
    /Duplicate DSL asset name/u,
  );

  await withTemporaryDirectory(async (directory) => {
    const fixture = await writeFileFixture(directory);
    const sourcePath = path.join(fixture.inputDirectory, 'unmapped.txt');
    await writeFile(sourcePath, 'kamishibai=3.2\nasset=Other,file:assets/backdrop.svg\n');
    await assert.rejects(
      buildSb3Bundle({
        baseSb3: fixture.baseSb3Path,
        sourceScript: sourcePath,
        assetManifest: {formatVersion: 1, assets: [fixture.manifest.assets[0]]},
        manifestBaseDirectory: fixture.inputDirectory,
        outputDirectory: fixture.outputDirectory,
        outputName: 'unmapped',
        profile: 'editor',
      }),
      /External asset has no manifest entry/u,
    );

    const conflictManifest = structuredClone(fixture.manifest);
    conflictManifest.assets[0].sb3Name = 'Title';
    await writeFile(sourcePath, 'kamishibai=3.2\nasset=Scene,file:assets/backdrop.svg\n');
    await assert.rejects(
      buildSb3Bundle({
        baseSb3: fixture.baseSb3Path,
        sourceScript: sourcePath,
        assetManifest: {formatVersion: 1, assets: [conflictManifest.assets[0]]},
        manifestBaseDirectory: fixture.inputDirectory,
        outputDirectory: fixture.outputDirectory,
        outputName: 'conflict',
        profile: 'editor',
      }),
      /SB3 asset name already exists/u,
    );
  });
});

test('requires an explicit builder profile and validates the reserved embedded script slot', async () => {
  await assert.rejects(
    buildSb3Bundle({
      baseSb3: 'base.sb3',
      sourceScript: 'source.txt',
      assetManifest: 'assets.lock.json',
      outputDirectory: 'dist',
      outputName: 'missing-profile',
    }),
    /profile must be either editor or player/u,
  );

  await withTemporaryDirectory(async (directory) => {
    const fixture = await writeFileFixture(directory);
    const cases = [
      {
        name: 'missing',
        update(project) {
          const stage = project.targets.find((target) => target.isStage);
          delete stage.variables[embeddedScriptVariableId];
        },
        expected: /must resolve exactly once/u,
      },
      {
        name: 'duplicate',
        update(project) {
          const stage = project.targets.find((target) => target.isStage);
          stage.variables.duplicateEmbeddedScript = [embeddedScriptVariableName, ''];
        },
        expected: /must resolve exactly once/u,
      },
      {
        name: 'invalid-type',
        update(project) {
          const stage = project.targets.find((target) => target.isStage);
          stage.variables[embeddedScriptVariableId][1] = 123;
        },
        expected: /must contain a string value/u,
      },
      {
        name: 'non-empty-base',
        update(project) {
          const stage = project.targets.find((target) => target.isStage);
          stage.variables[embeddedScriptVariableId][1] = 'unexpected';
        },
        expected: /must be empty/u,
      },
    ];

    for (const testCase of cases) {
      const baseSb3 = path.join(fixture.inputDirectory, `${testCase.name}.sb3`);
      await rewriteSb3Project(fixture.baseSb3Path, baseSb3, testCase.update);
      await assert.rejects(
        buildSb3Bundle({
          baseSb3,
          sourceScript: fixture.sourceScriptPath,
          assetManifest: fixture.assetManifestPath,
          outputDirectory: fixture.outputDirectory,
          outputName: testCase.name,
          profile: 'player',
        }),
        testCase.expected,
      );
    }

    await assert.rejects(
      buildSb3Bundle({
        baseSb3: fixture.baseSb3Path,
        sourceScript: fixture.sourceScriptPath,
        assetManifest: fixture.assetManifestPath,
        outputDirectory: fixture.outputDirectory,
        outputName: 'too-large',
        profile: 'player',
        maxEmbeddedScriptBytes: 1,
      }),
      /exceeds the 1 byte limit/u,
    );
  });
});

test('keeps all existing outputs when generation or installation fails', async () => {
  await withTemporaryDirectory(async (directory) => {
    const fixture = await writeFileFixture(directory);
    const first = await buildSb3Bundle({
      baseSb3: fixture.baseSb3Path,
      sourceScript: fixture.sourceScriptPath,
      assetManifest: fixture.assetManifestPath,
      outputDirectory: fixture.outputDirectory,
      outputName: 'stable',
      profile: 'editor',
    });
    const filenames = ['stable.sb3', 'stable.txt', 'stable.manifest.json'];
    const before = await Promise.all(
      filenames.map((filename) => readFile(first.outputPaths[filename])),
    );
    const invalidManifest = structuredClone(fixture.manifest);
    invalidManifest.assets[0].sha256 = '0'.repeat(64);
    await assert.rejects(
      buildSb3Bundle({
        baseSb3: fixture.baseSb3Path,
        sourceScript: fixture.sourceScriptPath,
        assetManifest: invalidManifest,
        manifestBaseDirectory: fixture.inputDirectory,
        outputDirectory: fixture.outputDirectory,
        outputName: 'stable',
        profile: 'editor',
      }),
      /SHA-256 mismatch/u,
    );
    assert.deepEqual(
      await Promise.all(filenames.map((filename) => readFile(first.outputPaths[filename]))),
      before,
    );

    const atomicDirectory = path.join(directory, 'atomic');
    await mkdir(atomicDirectory);
    await Promise.all(
      ['a', 'b', 'c'].map((name) => writeFile(path.join(atomicDirectory, name), `old-${name}`)),
    );
    let renames = 0;
    await assert.rejects(
      installBundleTransactionally({
        outputDirectory: atomicDirectory,
        outputName: 'bundle',
        files: new Map([
          ['a', Buffer.from('new-a')],
          ['b', Buffer.from('new-b')],
          ['c', Buffer.from('new-c')],
        ]),
        validateCandidate: async () => {},
        renameFile: async (source, destination) => {
          renames += 1;
          if (renames === 5) throw new Error('simulated install failure');
          const {rename} = await import('node:fs/promises');
          await rename(source, destination);
        },
      }),
      /simulated install failure/u,
    );
    assert.deepEqual(
      await Promise.all(
        ['a', 'b', 'c'].map((name) => readFile(path.join(atomicDirectory, name), 'utf8')),
      ),
      ['old-a', 'old-b', 'old-c'],
    );
  });
});

test('exposes one CLI contract and a fixed installable package version', async () => {
  assert.deepEqual(parseCliArguments(['--version']), {action: 'version'});
  const parsed = parseCliArguments([
    'build-sb3',
    '--base',
    'base.sb3',
    '--script',
    'source.txt',
    '--assets',
    'assets.json',
    '--output',
    'dist/sample',
    '--profile',
    'editor',
    '--allow-http',
  ]);
  assert.equal(parsed.action, 'build');
  assert.equal(parsed.options.profile, 'editor');
  assert.throws(() => parseCliArguments(['build-sb3']), /Missing required option/u);
  assert.throws(
    () =>
      parseCliArguments([
        'build-sb3',
        '--base',
        'base.sb3',
        '--script',
        'source.txt',
        '--assets',
        'assets.json',
        '--output',
        'dist/sample',
        '--profile',
        'generic',
      ]),
    /--profile must be either editor or player/u,
  );

  await withTemporaryDirectory(async (directory) => {
    const fixture = await writeFileFixture(directory);
    let output = '';
    const result = await runCli(
      [
        'build-sb3',
        '--base',
        fixture.baseSb3Path,
        '--script',
        fixture.sourceScriptPath,
        '--assets',
        fixture.assetManifestPath,
        '--output',
        path.join(fixture.outputDirectory, 'cli-sample'),
        '--profile',
        'editor',
      ],
      {
        stdout: {
          write: (chunk) => {
            output += chunk;
          },
        },
      },
    );
    assert(result);
    assert.match(output, /cli-sample\.sb3/u);
    assert.equal(
      await readFile(result.outputPaths['cli-sample.txt'], 'utf8').then((value) =>
        value.includes('file:'),
      ),
      false,
    );
  });

  const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.name, '@kubohiroya/turbowarp-kamishibai-app');
  assert.equal(packageJson.publishConfig.tag, 'legacy-3.2');
  assert.equal(packageJson.version, '3.2.4');
  assert.equal(packageVersion, packageJson.version);
  assert.equal(packageJson.private, false);
  assert.equal(packageJson.exports['./builder'], './src/builder/index.js');
  assert.equal(packageJson.bin['tmpose-kamishibai'], 'bin/tmpose-kamishibai.mjs');
  assert.equal(packageJson.bin['turbowarp-kamishibai'], 'bin/tmpose-kamishibai.mjs');
});
