import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {strToU8, zipSync} from 'fflate';

import {
  defaultKamishibaiSb3Path,
  loadKamishibaiProject,
  resolveKamishibaiSb3Path,
} from './helpers/sb3-project.mjs';
import {prepareTestSb3} from '../scripts/sb3/prepare-test.mjs';

async function withTemporaryDirectory(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tmpose-sb3-project-test-'));
  try {
    return await callback(directory);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
}

test('uses the generated SB3 by default and preserves the environment override', () => {
  assert.equal(resolveKamishibaiSb3Path({}), defaultKamishibaiSb3Path);
  assert.equal(
    resolveKamishibaiSb3Path({KAMISHIBAI_SB3_PATH: '/custom/project.sb3'}),
    '/custom/project.sb3',
  );
});

test('loads project.json from an SB3 archive', async () => {
  await withTemporaryDirectory(async (directory) => {
    const sb3Path = path.join(directory, 'project.sb3');
    const expectedProject = {targets: [], extensionURLs: {}};
    await writeFile(
      sb3Path,
      zipSync({
        'project.json': strToU8(JSON.stringify(expectedProject)),
      }),
    );

    assert.deepEqual(loadKamishibaiProject(sb3Path), expectedProject);
  });
});

test('loads the successors of the former TMPose Bundle as separate extensions', () => {
  const project = loadKamishibaiProject();
  const memberIds = [
    'kubohiroyaassetcache',
    'text',
    'kubohiroyakamishibairuntime',
    'kubohiroyasvgtext',
    'kubohiroyabubble',
  ];
  assert.equal(project.extensions.includes('tmposebundle'), false);
  assert.equal(Object.hasOwn(project.extensionURLs, 'tmposebundle'), false);
  for (const memberId of memberIds) assert(project.extensions.includes(memberId), memberId);
  assert.equal(project.extensions.includes('kubohiroyaassetmanager'), false);
  // Animated Text is TurboWarp's own gallery extension, referenced rather than carried.
  assert.equal(project.extensionURLs.text, 'https://extensions.turbowarp.org/lab/text.js');
  for (const memberId of memberIds.filter((memberId) => memberId !== 'text')) {
    const url = project.extensionURLs[memberId];
    assert.match(url, /^data:text\/javascript;base64,/u, memberId);
    const source = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64').toString('utf8');
    assert(source.includes(`// ID: ${memberId}`), memberId);
  }

  const opcodes = project.targets.flatMap((target) =>
    Object.values(target.blocks ?? {}).map((block) => block.opcode),
  );
  for (const opcode of [
    'kubohiroyaassetcache_setThisSpriteSkin',
    'text_animateText',
    'kubohiroyasvgtext_defineStyle',
    'kubohiroyasvgtext_setText',
    'kubohiroyabubble_defineBubbleStyle',
    'kubohiroyabubble_setBubblePlacement',
    'kubohiroyabubble_sayWithBubbleStyle',
    'kubohiroyabubble_thinkWithBubbleStyle',
    'kubohiroyabubble_closeBubble',
  ]) {
    assert(opcodes.includes(opcode), opcode);
  }
  assert.equal(
    opcodes.some((opcode) => /^(?:tmposebundle|kubohiroyaassetmanager)_/u.test(opcode)),
    false,
  );
  assert.equal(
    opcodes.some((opcode) => /^kubohiroyasvgtext_(?:say|think)WithStyle$/u.test(opcode)),
    false,
  );
});

test('skips generated output preparation when an SB3 path is configured', async () => {
  let buildCalled = false;
  const result = await prepareTestSb3({
    build: async () => {
      buildCalled = true;
    },
    environment: {KAMISHIBAI_SB3_PATH: '/custom/project.sb3'},
  });

  assert.equal(buildCalled, false);
  assert.deepEqual(result, {
    configured: true,
    outputPath: '/custom/project.sb3',
  });
});

test('prepares the generated default SB3 with explicit replacement authorization', async () => {
  let buildOptions;
  const result = await prepareTestSb3({
    build: async (options) => {
      buildOptions = options;
      return {changed: true, outputPath: '/generated/project.sb3'};
    },
    environment: {},
  });

  assert.deepEqual(buildOptions, {
    environment: {},
    outputPath: defaultKamishibaiSb3Path,
    sourceDirectory: path.resolve('app'),
    yes: true,
  });
  assert.deepEqual(result, {
    changed: true,
    configured: false,
    outputPath: '/generated/project.sb3',
  });
});
