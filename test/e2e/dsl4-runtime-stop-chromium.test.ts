import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {webcrypto} from 'node:crypto';
import {access, mkdir, mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'vitest';
import {chromium} from 'playwright-core';

import {buildDsl4RuntimeComponent} from '../../dist/builder/dsl4-build.js';
import {excludeEmbeddedProjectExtensionsFromPackagerPreload} from '../../dist/builder/index.js';
import {createKamishibaiSb3} from '../../scripts/sb3/build.ts';
import {createDsl4ReleaseSourceFiles} from '../../scripts/sb3/dsl4-downloadable-release.ts';
import {dsl4TestProductionSourceFrontend as sourceFrontend} from '../helpers/dsl4-test-frontend.ts';

const require = createRequire(import.meta.url);
const TurboWarpPackager = require('@turbowarp/packager');

async function chromeExecutable() {
  for (const candidate of [
    process.env.CHROME_BIN,
    process.env.GOOGLE_CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'google-chrome',
    'chromium',
  ]) {
    if (!candidate) continue;
    const resolved = candidate.includes('/')
      ? candidate
      : spawnSync('which', [candidate], {encoding: 'utf8'}).stdout.trim();
    if (resolved)
      try {
        await access(resolved);
        return resolved;
      } catch {
        /* Try the next installed browser. */
      }
  }
  throw new Error('Set CHROME_BIN to run the runtime stop regression');
}

/** Build the release SB3 the author would use as the base of a published work. */
async function buildReleaseBase() {
  const sourceDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-stop-release-source-'));
  try {
    const sourceFiles = await createDsl4ReleaseSourceFiles();
    await Promise.all(
      [...sourceFiles].map(async ([relativePath, bytes]) => {
        const filename = path.join(sourceDirectory, relativePath);
        await mkdir(path.dirname(filename), {recursive: true});
        await writeFile(filename, bytes);
      }),
    );
    return (await createKamishibaiSb3({sourceDirectory})).archive;
  } finally {
    await rm(sourceDirectory, {recursive: true, force: true});
  }
}

async function startFixtureServer(root: string) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      const file = path.resolve(root, `.${pathname}`);
      if (!file.startsWith(`${root}${path.sep}`) || !(await stat(file)).isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.writeHead(200, {'content-type': 'text/html', 'cache-control': 'no-store'});
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server did not bind TCP');
  return {server, origin: `http://127.0.0.1:${address.port}`};
}

/**
 * The stop button and the green flag are the only controls a viewer has over a published work, and
 * they belong to the VM, not to the story: pressing stop must end the story that is running, and
 * pressing the green flag afterwards must drop everything the run left behind and show the title
 * again.
 *
 * The second half is the regression. A replay started from the end-of-story menu used to be awaited
 * inside the extension's serialized operation queue, where it starved the queued operations behind
 * it — the stop button's teardown and the green flag's restart — so a replayed story ran to its own
 * end with both controls dead. The eight-second wait is what makes that visible: both presses are
 * given two seconds, far less than the story needs to end by itself.
 */
test(
  'stops a running story and returns to the title, on the first run and on a replay',
  {timeout: 180_000},
  async () => {
    const executablePath = await chromeExecutable();
    const projectDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-stop-story-'));
    const fixtureDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-stop-package-'));
    await writeFile(
      path.join(projectDirectory, 'story.k4.yml'),
      "kamishibai: '4.0'\ncontrols:\n  keymaps:\n    production:\n      Space: navigation.nextAction\nscenes:\n  opening:\n    - wait: 0.05\n    - wait: 8\n",
    );
    const built = await buildDsl4RuntimeComponent({
      baseSb3Bytes: await buildReleaseBase(),
      projectRoot: projectDirectory,
      sourceManifest: {formatVersion: 1, mode: 'external', sourceId: 'main', path: 'story.k4.yml'},
      sourceFrontend,
      controlProfile: 'production',
      channel: 'bundled',
      maxSourceBytes: 64 * 1024,
      maxAssetFileBytes: 4096,
      maxAssetFiles: 8,
      maxTotalAssetBytes: 16 * 1024,
      subtleCrypto: webcrypto.subtle,
      replaceExisting: true,
    });
    const packager = new TurboWarpPackager.Packager();
    packager.project = await TurboWarpPackager.loadProject(Uint8Array.from(built.bytes));
    excludeEmbeddedProjectExtensionsFromPackagerPreload(packager);
    packager.options.autoplay = true;
    packager.options.app.title = 'DSL 4.0 stop regression';
    await writeFile(path.join(fixtureDirectory, 'index.html'), (await packager.package()).data);
    const {server, origin} = await startFixtureServer(fixtureDirectory);
    const browser = await chromium.launch({executablePath, headless: true, args: ['--no-sandbox']});
    try {
      const page = await browser.newPage({viewport: {width: 900, height: 700}});
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      await page.goto(`${origin}/index.html`);
      // The story's own reporter blocks are the public window on its state.
      const reporter = (name: string) =>
        `globalThis.Scratch.vm.runtime._primitives['kubohiroyakamishibai4_kubohiroyakamishibairuntime4__${name}']({}, {})`;
      const hostStatus = `JSON.parse(${reporter('runtimeDiagnosticsReporter')}).status`;
      const storyRunning = `${reporter('storyStatusReporter')} === 'running'`;
      const titleShown = `document.querySelector('[data-dsl4-title-controls=true]')?.style.display === 'block'`;
      const menuShown = `document.querySelector('[data-dsl4-application-menu=true]')?.style.display === 'block'`;
      const settled = (expression: string) =>
        page
          .waitForFunction(expression, null, {timeout: 2_000})
          .then(() => true)
          .catch(() => false);
      await page.waitForFunction('Boolean(globalThis.Scratch?.vm)', null, {timeout: 30_000});
      await page.waitForFunction(titleShown, null, {timeout: 30_000});

      // The first run, started from the title.
      await page.click('[data-dsl4-title-action=start]');
      await page.waitForFunction(storyRunning, null, {timeout: 30_000});
      await page.evaluate('globalThis.Scratch.vm.stopAll()');
      const stopped = await settled(`${hostStatus} === 'stopped'`);
      await page.evaluate('globalThis.Scratch.vm.greenFlag()');
      const reset = await settled(titleShown);

      // The same two presses on a replay started from the end-of-story menu.
      await page.click('[data-dsl4-title-action=start]');
      await page.waitForFunction(menuShown, null, {timeout: 30_000});
      await page.click('[data-dsl4-menu-action=reload]');
      await page.waitForFunction(storyRunning, null, {timeout: 30_000});
      await page.evaluate('globalThis.Scratch.vm.stopAll()');
      const replayStopped = await settled(`${hostStatus} === 'stopped'`);
      await page.evaluate('globalThis.Scratch.vm.greenFlag()');
      const replayReset = await settled(titleShown);

      assert.deepEqual(
        {stopped, reset, replayStopped, replayReset, errors},
        {stopped: true, reset: true, replayStopped: true, replayReset: true, errors: []},
      );
    } finally {
      await browser.close();
      await new Promise((resolve) => server.close(resolve));
      await Promise.all([
        rm(projectDirectory, {recursive: true, force: true}),
        rm(fixtureDirectory, {recursive: true, force: true}),
      ]);
    }
  },
);
