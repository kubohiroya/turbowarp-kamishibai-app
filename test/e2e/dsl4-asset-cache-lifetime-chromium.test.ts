import assert from 'node:assert/strict';
import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'vitest';
import {chromium, type Browser} from 'playwright-core';
import {build} from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
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
  throw new Error('Set CHROME_BIN to run asset-cache lifetime regression');
}

test('separates scene materialization from native IndexedDB lifetime and enforces byte LRU/prune', async () => {
  const lifecyclePath = '/dist/dsl4/embedded-asset-lifecycle.js';
  // Resolve the compiled module's npm imports before serving it to Chromium.
  const bundled = await build({
    configFile: false,
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      lib: {entry: path.join(root, lifecyclePath), formats: ['es']},
    },
  });
  const bundle = Array.isArray(bundled) ? bundled[0] : bundled;
  const lifecycle = bundle && 'output' in bundle ? bundle.output[0] : undefined;
  assert(lifecycle?.type === 'chunk', 'The browser lifecycle fixture must be bundled.');
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname === lifecyclePath) {
      response.writeHead(200, {'content-type': 'text/javascript'}).end(lifecycle.code);
      return;
    }
    const file = path.resolve(root, '.' + pathname);
    if (
      !file.startsWith(root) ||
      !['/dist/', '/node_modules/', '/test/fixtures/'].some((prefix) => pathname.startsWith(prefix))
    ) {
      response.writeHead(404).end();
      return;
    }
    try {
      const bytes = await readFile(file);
      response
        .writeHead(200, {
          'content-type': pathname.endsWith('.html') ? 'text/html' : 'text/javascript',
        })
        .end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({executablePath: await chromeExecutable(), headless: true});
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
      `http://127.0.0.1:${address.port}/test/fixtures/dsl4/browser/remote-cache-retention.html`,
    );
    await page.waitForFunction(
      () => document.querySelector('#status')?.getAttribute('data-status') !== 'running',
    );
    assert.equal(
      await page.locator('#status').getAttribute('data-status'),
      'passed',
      await page.locator('#result').innerText(),
    );
    const lifetime = JSON.parse(await page.locator('#result').innerText());
    assert.equal(lifetime.visits, 12);
    assert.equal(lifetime.maximumActiveModels, 1);
    assert.equal(lifetime.activeModels, 0);
    assert.equal(lifetime.indexedDbEntries, 1);
    assert.equal(lifetime.clearedStats.entries, 0);
    await page.addScriptTag({
      type: 'module',
      content:
        "globalThis.__assetCacheModule = await import('/node_modules/@kubohiroya/turbowarp-asset-cache/dist/composition.js');",
    });
    await page.waitForFunction(() => Reflect.has(globalThis, '__assetCacheModule'));
    const budget = await page.evaluate(async () => {
      const {createVerifiedRemoteBinaryCache} = Reflect.get(globalThis, '__assetCacheModule');
      let now = 1000;
      const cache = createVerifiedRemoteBinaryCache({
        indexedDB,
        subtleCrypto: crypto.subtle,
        cacheIdentity: {
          id: 'browserbudget001',
          label: 'budget',
          databaseName: 'tw-kamishibai-assets-v1--story--browserbudget001',
        },
        now: () => now,
        maxCacheBytes: 24,
        lowWaterRatio: 2 / 3,
        touchIntervalMs: 1,
        ttlMs: 1000,
        estimateStorage: async () => ({quota: 1000000, usage: 0}),
      });
      const checks: string[] = [];
      const check = (condition: unknown, message: string) => {
        if (!condition) throw new Error(message);
        checks.push(message);
      };
      const inputs = new Map();
      for (const [name, size] of [
        ['a', 8],
        ['b', 8],
        ['c', 8],
        ['d', 8],
        ['huge', 25],
      ] as const) {
        const bytes = new Uint8Array(size).fill(name.charCodeAt(0));
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('');
        inputs.set(name, {
          bytes,
          input: {
            url: `https://cdn.example.com/${name}.bin`,
            size,
            integrity: 'sha256-' + hash,
            contentType: 'application/octet-stream',
          },
        });
      }
      const resolve = (name: string) => {
        const {bytes, input} = inputs.get(name);
        return cache.resolve(input, {load: async () => ({bytes, contentType: input.contentType})});
      };
      try {
        await cache.clear();
        for (const name of ['a', 'b', 'c']) {
          await resolve(name);
          now += 10;
        }
        const held = await resolve('a');
        now += 10;
        await resolve('d');
        const bounded = await cache.getStats();
        check(bounded.bytes === 24 && bounded.entries === 3, 'byte-budget-bounded');
        for (const name of ['a', 'c', 'd'])
          check((await resolve(name)).cacheRead === 'hit', 'LRU-keeps-' + name);
        check((await resolve('b')).cacheRead === 'miss', 'LRU-evicts-oldest');
        check((await resolve('huge')).cacheWrite === 'skipped', 'oversized-bytes-not-persisted');
        check((await cache.getStats()).bytes === 24, 'oversized-bytes-do-not-flush-cache');
        now += 1001;
        const pruned = await cache.prune();
        check(
          pruned.remainingBytes === 0 &&
            pruned.remainingEntries === 0 &&
            pruned.removedEntries === 3,
          'TTL-prune-removes-native-IDB-records',
        );
        const opened = indexedDB.open('tw-kamishibai-assets-v1--story--browserbudget001');
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          opened.onsuccess = () => resolve(opened.result);
          opened.onerror = () => reject(opened.error);
        });
        let physicalCounts: number[];
        try {
          physicalCounts = await Promise.all(
            ['entries', 'metadata'].map(
              (name) =>
                new Promise<number>((resolve, reject) => {
                  const transaction = database.transaction(name, 'readonly');
                  const count = transaction.objectStore(name).count();
                  transaction.oncomplete = () => resolve(count.result);
                  transaction.onabort = () => reject(transaction.error);
                }),
            ),
          );
        } finally {
          database.close();
        }
        check(
          physicalCounts.every((count) => count === 0),
          'native-IDB-stores-physically-empty',
        );
        check(
          held.bytes.length === 8 && held.bytes.every((value: number) => value === 97),
          'caller-bytes-survive-cache-prune',
        );
        return {checks, boundedBytes: bounded.bytes, afterPruneBytes: pruned.remainingBytes};
      } finally {
        await cache.clear();
        await cache.releaseStoryCacheLease();
      }
    });
    assert.deepEqual(errors, []);
    const report = {browser: await browser.version(), lifetime, budget, pageErrors: errors};
    const output = path.join(root, 'tmp/asset-cache-lifetime-browser');
    await mkdir(output, {recursive: true});
    await writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally {
    try {
      await browser?.close();
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }
});
