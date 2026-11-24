import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {test} from 'vitest';

import {deploySite} from '../scripts/deploy-site.ts';
import {restorePagesHistory} from '../scripts/pages-history.ts';

const user = {name: 'Pages regression test', email: 'pages-test@example.invalid'};
const oldSb3 = 'downloads/kamishibai-4.0.0-rc.38.sb3';
const oldPlayer = 'players/4.0.0-rc.38/index.html';
const oldAsset = 'players/4.0.0-rc.38/assets/player data.bin';
// A distributed work points its extension at these, so they are immutable like the players.
const oldRuntime = 'runtime/4.0.0-rc.38/kamishibai-playback.js';
const oldRuntimeManifest = 'runtime/4.0.0-rc.38/manifest.json';
const newSb3 = 'downloads/kamishibai-4.0.0-rc.39.sb3';
const newPlayer = 'players/4.0.0-rc.39/index.html';
const oldFiles = {
  'downloads/kamishibai-3.2.3.sb3': Buffer.from([0x50, 0x4b, 42]),
  [oldSb3]: Buffer.from([0x50, 0x4b, 0, 255, 17]),
  [oldPlayer]: Buffer.from('<html>Original rc.38</html>'),
  [oldAsset]: Buffer.from([254, 0, 1]),
  [oldRuntime]: Buffer.from('// Original rc.38 playback runtime'),
  [oldRuntimeManifest]: Buffer.from('{"version":"4.0.0-rc.38"}'),
};

async function writeFiles(directory: string, files: Record<string, string | Buffer>) {
  for (const [filename, bytes] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(directory, filename)), {recursive: true});
    await writeFile(path.join(directory, filename), bytes);
  }
}

test('publishes twice from clean outputs while preserving remote releases and deleting stale pages', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'pages-history-'));
  const remote = path.join(temporary, 'remote.git');
  const directory = path.join(temporary, 'output');
  const git = (...args: string[]) => execFileSync('git', ['--git-dir', remote, ...args]);
  const publisher = createRequire(import.meta.url)('gh-pages') as {
    getCacheDir(repo: string): string;
  };
  try {
    execFileSync('git', ['init', '--bare', '--initial-branch=gh-pages', remote]);
    await writeFiles(directory, {
      ...oldFiles,
      'index.html': 'old index',
      'obsolete.html': 'old page',
      'downloads/kamishibai-3.2.sb3': 'Old series alias',
    });
    await deploySite(directory, {repo: remote, user});

    await rm(directory, {recursive: true});
    await writeFiles(directory, {
      'index.html': 'new index',
      [newSb3]: 'New SB3',
      [newPlayer]: 'New Player',
      'downloads/kamishibai-3.2.sb3': 'Updated series alias',
    });
    await deploySite(directory, {repo: remote, user});
    for (const [filename, bytes] of Object.entries(oldFiles)) {
      assert.deepEqual(git('show', `gh-pages:${filename}`), bytes);
    }
    assert.equal(git('show', 'gh-pages:index.html').toString(), 'new index');
    assert.equal(git('show', `gh-pages:${newPlayer}`).toString(), 'New Player');
    const filenames = git('ls-tree', '-r', '--name-only', 'gh-pages').toString().split('\n');
    assert(!filenames.includes('obsolete.html'));
    assert(filenames.includes(newSb3));
    assert(filenames.includes('downloads/kamishibai-3.2.sb3'));
    assert.equal(
      git('show', 'gh-pages:downloads/kamishibai-3.2.sb3').toString(),
      'Updated series alias',
    );

    const published = git('rev-parse', 'gh-pages').toString();
    await deploySite(directory, {repo: remote, user});
    assert.equal(git('rev-parse', 'gh-pages').toString(), published);

    for (const filename of [oldSb3, oldPlayer, oldAsset, oldRuntime, oldRuntimeManifest]) {
      await writeFiles(directory, {[filename]: 'Changed old artifact'});
      await assert.rejects(deploySite(directory, {repo: remote, user}), /Refusing to replace/u);
      assert.equal(git('rev-parse', 'gh-pages').toString(), published);
      await rm(path.join(directory, filename));
    }
  } finally {
    await rm(publisher.getCacheDir(remote), {recursive: true, force: true});
    await rm(temporary, {recursive: true, force: true});
  }
});

test('stops before publishing when Git history is unreadable or a release path is a symlink', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'pages-history-invalid-'));
  try {
    const source = path.join(temporary, 'source');
    await mkdir(source);
    await assert.rejects(
      restorePagesHistory(temporary, source),
      /Cannot read published Pages HEAD/u,
    );
    execFileSync('git', ['init', '--initial-branch=gh-pages', temporary]);
    assert.deepEqual(await restorePagesHistory(temporary, source), []);
    await writeFiles(temporary, oldFiles);
    execFileSync('git', ['add', '.'], {cwd: temporary});
    execFileSync(
      'git',
      [
        '-c',
        `user.name=${user.name}`,
        '-c',
        `user.email=${user.email}`,
        'commit',
        '-m',
        'old release',
      ],
      {cwd: temporary},
    );
    await mkdir(path.dirname(path.join(source, oldSb3)), {recursive: true});
    await symlink(path.join(temporary, oldSb3), path.join(source, oldSb3));
    await assert.rejects(restorePagesHistory(temporary, source), /must be a regular file/u);
  } finally {
    await rm(temporary, {recursive: true, force: true});
  }
});

test('routes the normal deploy command through the release history guard', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  assert.equal(packageJson.scripts.predeploy, undefined);
  assert.equal(packageJson.scripts.deploy, 'pnpm run build:site && node scripts/deploy-site.ts');
});
