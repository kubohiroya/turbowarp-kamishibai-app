import {
  createDsl4TeachableMachineExtensionSource,
  dsl4TeachableMachineSiteBaseUrl,
  dsl4TeachableMachineSiteFiles,
  readDsl4TeachableMachineRuntimeSite,
  readDsl4TeachableMachineSiteFile,
} from '../../scripts/sb3/teachable-machine-runtime.ts';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {build} from 'vite';
import {test} from 'vitest';
import {
  createDsl4PoseNetRemoteDescriptor,
  dsl4PoseNetRemoteBaseUrl,
} from '../../dist/dsl4/platform/posenet-remote.js';

const require = createRequire(import.meta.url);

test('recognizes a real pose model with selectable WebGPU, WASM, and JavaScript CPU', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'kamishibai-teachable-machine-browser-'));
  const built = await build({
    configFile: false,
    logLevel: 'error',
    build: {
      outDir: directory,
      emptyOutDir: false,
      target: 'es2022',
      lib: {
        entry: path.resolve('test/fixtures/dsl4/browser/teachable-machine-compute.ts'),
        formats: ['es'],
        fileName: () => 'probe.js',
      },
    },
  });
  assert(built);
  // The project names PoseNet the way the Standard SB3 does: by digest, on the Kamishibai site.
  const poseNet = createDsl4PoseNetRemoteDescriptor();
  const poseNetSite = new Map<string, Buffer>(
    await Promise.all(
      poseNet.files.map(
        async (file) =>
          [
            `${dsl4PoseNetRemoteBaseUrl}sha256-${file.sha256}`,
            await readFile(
              require.resolve(
                `@kubohiroya/turbowarp-teachable-machine/posenet-assets/${file.path}`,
              ),
            ),
          ] as const,
      ),
    ),
  );
  // The Teachable Machine runtime the way the Kamishibai site publishes it, under its version.
  const tmRuntimeSite = await readDsl4TeachableMachineRuntimeSite();
  const tmSiteBase = dsl4TeachableMachineSiteBaseUrl(tmRuntimeSite.version);
  const tmSite = new Map<string, Buffer>(
    await Promise.all(
      dsl4TeachableMachineSiteFiles.map(
        async (file) =>
          [`${tmSiteBase}${file}`, await readDsl4TeachableMachineSiteFile(file)] as const,
      ),
    ),
  );
  const resources = new Map<string, {bytes: Uint8Array | string; type: string}>([
    [
      '/probe.js',
      {bytes: await readFile(path.join(directory, 'probe.js')), type: 'text/javascript'},
    ],
    [
      '/teachable-machine.js',
      {
        bytes: await createDsl4TeachableMachineExtensionSource(),
        type: 'text/javascript',
      },
    ],
    ['/tm-runtime-site.json', {bytes: JSON.stringify(tmRuntimeSite), type: 'application/json'}],
    [
      '/project.json',
      {
        bytes: JSON.stringify({extensionStorage: {kubohiroyakamishibairuntime4: {poseNet}}}),
        type: 'application/json',
      },
    ],
    [
      '/',
      {
        bytes: `<!doctype html><html lang="ja"><meta charset="utf-8"><title>Kamishibai Teachable Machine 4.0.2</title><div id="controls"><button>⚑</button><button>■</button></div><div id="stage" style="position:relative;width:480px;height:360px"><canvas width="480" height="360"></canvas></div><script>globalThis.Scratch={extensions:{unsandboxed:true,register(){}},vm:{runtime:{}}};</script><script src="/teachable-machine.js"></script><script type="module" src="/probe.js"></script></html>`,
        type: 'text/html',
      },
    ],
  ]);
  const modelBase = 'https://teachablemachine.withgoogle.com/models/R9i0aRHth/';
  const modelResponse = await fetch(`${modelBase}model.json`);
  assert(modelResponse.ok);
  const modelText = await modelResponse.text();
  const model = JSON.parse(modelText) as {weightsManifest: {paths: string[]}[]};
  const names = [
    'model.json',
    'metadata.json',
    ...model.weightsManifest.flatMap((group) =>
      group.paths.map((name) => name.replace(/^\.\//u, '')),
    ),
  ];
  resources.set('/model/files.json', {bytes: JSON.stringify(names), type: 'application/json'});
  for (const name of names) {
    const response = await fetch(`${modelBase}${name}`);
    assert(response.ok, `Model ${name}: ${response.status}`);
    resources.set(`/model/${name}`, {
      bytes: new Uint8Array(await response.arrayBuffer()),
      type: 'application/octet-stream',
    });
  }
  const server = createServer((request, response) => {
    const resource = resources.get(new URL(request.url ?? '/', 'http://localhost').pathname);
    if (!resource) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'content-type': resource.type,
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp',
    });
    response.end(resource.bytes);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    browser = await chromium.launch({
      executablePath:
        process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: process.env.TEACHABLE_MACHINE_HEADED !== '1',
      args: [
        '--no-first-run',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    });
    const context = await browser.newContext({viewport: {width: 800, height: 600}});
    await context.grantPermissions(['camera'], {origin});
    const page = await context.newPage();
    const errors: string[] = [];
    const remote: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (/^https?:/.test(url) && !url.startsWith(`${origin}/`)) {
        remote.push(url);
        return route.abort();
      }
      return route.continue();
    });
    // Registered last, so it answers before the catch-all: the Pages site, served from the package.
    const poseNetRequests: string[] = [];
    await context.route(`${dsl4PoseNetRemoteBaseUrl}**`, (route) => {
      const url = route.request().url();
      poseNetRequests.push(url);
      const body = poseNetSite.get(url);
      return body
        ? route.fulfill({
            status: 200,
            body,
            headers: {
              'access-control-allow-origin': '*',
              'content-type': 'application/octet-stream',
              'cross-origin-resource-policy': 'cross-origin',
            },
          })
        : route.fulfill({status: 404, body: 'missing'});
    });
    const tmRequests: string[] = [];
    await context.route(`${tmSiteBase}**`, (route) => {
      const url = route.request().url();
      tmRequests.push(url);
      const body = tmSite.get(url);
      return body
        ? route.fulfill({
            status: 200,
            body,
            headers: {
              'access-control-allow-origin': '*',
              'content-type': url.endsWith('.wasm')
                ? 'application/wasm'
                : url.endsWith('.js')
                  ? 'text/javascript'
                  : 'application/octet-stream',
              'cross-origin-resource-policy': 'cross-origin',
            },
          })
        : route.fulfill({status: 404, body: 'missing'});
    });
    await page.goto(origin);
    await page.waitForFunction('globalThis.kamishibaiComputeProbe !== undefined');
    // Loading the member and the Kamishibai runtime fetches no TensorFlow.js.
    assert.equal(await page.evaluate('globalThis.kamishibaiComputeProbe.isRuntimeLoaded()'), false);
    assert.equal(await page.evaluate('globalThis.tf === undefined'), true);
    assert.equal(tmRequests.length, 0);
    assert.equal(await page.locator('#stage [data-stage-control]').count(), 0);
    assert.equal(await page.locator('#stage [data-dsl4-compute-settings]').count(), 0);
    const results: Record<string, unknown>[] = [];
    for (const mode of ['auto', 'webgpu', 'wasm', 'cpu']) {
      const result = (await page.evaluate(
        `globalThis.kamishibaiComputeProbe.run(${JSON.stringify(mode)})`,
      )) as Record<string, unknown>;
      if (mode === 'auto')
        assert(['webgpu', 'webgl', 'wasm', 'cpu'].includes(String(result.backend)));
      else if (mode === 'webgpu' && process.env.TEACHABLE_MACHINE_REQUIRE_WEBGPU !== '1') {
        assert.equal(result.fallback, result.backend !== 'webgpu');
      } else {
        assert.equal(result.backend, mode);
        assert.equal(result.fallback, false);
      }
      assert(Number.isFinite(result.confidence));
      assert(Number(result.confidence) > 0);
      assert.equal(result.samples, 5);
      results.push(result);
      await page.locator('[data-stage-control=kamishibai-recognition-compute]').click();
      assert.match(
        await page.locator('[data-dsl4-compute-status]').innerText(),
        new RegExp(String(result.backend), 'i'),
      );
      await page.screenshot({path: path.join(directory, `${mode}-settings.png`)});
      await page.locator('[data-dsl4-compute-close]').click();
    }
    await page.locator('[data-stage-control=kamishibai-recognition-compute]').click();
    await page.locator('[data-dsl4-compute-mode]').selectOption('wasm');
    await page.locator('[data-dsl4-compute-apply]').click();
    await page.waitForFunction('globalThis.kamishibaiComputeProbe.getPendingMode() === "wasm"');
    assert.equal(await page.evaluate('globalThis.kamishibaiComputeProbe.getPreference()'), 'wasm');
    // Saving cannot switch the existing controller until the host releases and recreates models.
    assert.equal(await page.evaluate('globalThis.tmCompute.getSelection().backend'), 'cpu');
    const reused = await page.evaluate(async () => {
      const runtime = globalThis as typeof globalThis & {tf?: unknown; tmCompute?: unknown};
      const before = {tf: runtime.tf, compute: runtime.tmCompute};
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/teachable-machine.js?repeat=1';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Repeated runtime load failed'));
        document.head.appendChild(script);
      });
      return before.tf === runtime.tf && before.compute === runtime.tmCompute;
    });
    assert.equal(reused, true);
    await page.reload();
    await page.waitForFunction('globalThis.kamishibaiComputeProbe !== undefined');
    assert.equal(await page.evaluate('globalThis.kamishibaiComputeProbe.getPreference()'), 'wasm');

    const withoutSimd = await context.newPage();
    withoutSimd.on('pageerror', (error) => errors.push(error.message));
    await withoutSimd.goto(origin);
    await withoutSimd.waitForFunction('globalThis.kamishibaiComputeProbe !== undefined');
    const simdFallbacks = (await withoutSimd.evaluate(`
      (async () => {
        await globalThis.kamishibaiComputeProbe.ensureRuntime();
        // The WASM backend registers its flags when its bundle loads from beside runtime.js.
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = ${JSON.stringify(`${tmSiteBase}backend-wasm.js`)};
          script.onload = resolve;
          script.onerror = () => reject(new Error('backend-wasm.js did not load'));
          document.head.appendChild(script);
        });
        globalThis.tf.env().set('WASM_HAS_SIMD_SUPPORT', false);
        const explicit = await globalThis.tmCompute.select('wasm');
        Object.defineProperty(navigator, 'gpu', {value: undefined});
        globalThis.tf.removeBackend('webgl');
        const automatic = await globalThis.tmCompute.select('auto');
        return {explicit, automatic};
      })()
    `)) as Record<'explicit' | 'automatic', Record<string, unknown>>;
    // The site serves the scalar WASM binary too, so a browser without SIMD still runs WASM.
    assert.equal(simdFallbacks.explicit.backend, 'wasm');
    assert.equal(simdFallbacks.explicit.requested, 'wasm');
    assert.equal(simdFallbacks.explicit.fallback, false);
    assert.equal(simdFallbacks.automatic.backend, 'wasm');
    await withoutSimd.close();
    assert.deepEqual(errors, []);
    assert.deepEqual(remote, []);
    // Every recognition run, the reload, and the second page share one download through Cache Storage.
    assert.deepEqual([...poseNetRequests].sort(), [...poseNetSite.keys()].sort());
    // runtime.js came from the site, and the WebGPU and WASM backends from beside it, only once
    // a mode reached for them.
    assert(tmRequests.includes(`${tmSiteBase}runtime.js`));
    assert(tmRequests.includes(`${tmSiteBase}backend-wasm.js`));
    assert(
      tmRequests.every((url) => tmSite.has(url)),
      JSON.stringify(tmRequests),
    );
    const report = {
      browser: browser.version(),
      results,
      simdFallbacks,
      errors,
      remoteRequests: remote,
      poseNetRequests,
      tmRequests,
      devicePreferencePersisted: true,
      sharedRuntimeReused: reused,
      stageControlsEntry: true,
    };
    await mkdir(path.resolve('tmp/teachable-machine-validation'), {recursive: true});
    await writeFile(
      path.resolve('tmp/teachable-machine-validation/report.json'),
      JSON.stringify({...report, directory}, null, 2),
    );
    console.log(JSON.stringify({...report, directory}));
  } finally {
    await browser?.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 240_000);
