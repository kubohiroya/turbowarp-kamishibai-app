import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import type {ChildProcess, ChildProcessByStdio} from 'node:child_process';
import type {Readable} from 'node:stream';
import {createHash, webcrypto} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {access, mkdir, mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'vitest';

import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate';

import {buildReleasePlayer} from '../../scripts/build-release-player.ts';
import {
  assertEmbeddedExtensionLoadedOnceWithProject,
  packagerExtensionLoadProbeEvents,
  packagerExtensionLoadProbeScript,
} from '../../scripts/packager-extension-load-probe.ts';
import {createKamishibaiSb3} from '../../scripts/sb3/build.ts';
import {
  createDsl4ReleaseSourceFiles,
  createDsl4RuntimeBundleSource,
} from '../../scripts/sb3/dsl4-downloadable-release.ts';
import {
  buildDsl4TurboWarpBrowserBundle,
  createDsl4LocalPreviewHost,
  createDsl4ProductionSourceFrontend,
  excludeEmbeddedProjectExtensionsFromPackagerPreload,
  installDsl4PackagedRuntimeComponent,
  runDsl4LocalPreviewCommand,
} from '../../dist/builder/index.js';
import {
  createDsl4EmbeddedAssetBundle,
  createDsl4EmbeddedSourceDescriptor,
  createDsl4LiveReloadSession,
  createDsl4PreviewProtocolSession,
  createDsl4RuntimeArtifactDescriptor,
} from '../../dist/dsl4/index.js';
import {withDeadline} from '../helpers/async-test-helpers.ts';
import {
  requireArray,
  requireDefined,
  requireNumber,
  requireRecord,
  requireString,
} from '../helpers/require-value.ts';
import {thrown} from '../helpers/thrown-error.ts';
import {okResult} from '../helpers/result-outcome.ts';

/** Read one number a page evaluation measured. */
function measurement(record: Record<string, unknown>, member: string): number {
  return requireNumber(record[member], `the measured ${member}`);
}

/** Read one page evaluation the case expects to hand back an object. */
async function evaluateRecord(
  client: CdpClient,
  expression: string,
): Promise<Record<string, unknown>> {
  return requireRecord(await client.evaluate(expression), 'the evaluated page result');
}

/** Narrow one opaque value to a record without failing, for the optional members of a payload. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const TurboWarpPackager = require('@turbowarp/packager');

let pendingCurrentDsl4ReleaseSb3;

/**
 * Build the current release once per process. The release is deterministic and its runtime
 * extension is minified with terser, so rebuilding it for every test spends the per-test budget on
 * work that cannot differ. Each caller gets its own archive bytes.
 *
 * Whichever caller runs first still pays that build inside its own timeout — measured at about 14
 * seconds locally, most of it in `createDsl4ReleaseSourceFiles`. Every test calling this therefore
 * budgets 60 seconds, so the suite does not depend on which of them the runner reaches first.
 */
async function createCurrentDsl4ReleaseSb3() {
  pendingCurrentDsl4ReleaseSb3 ??= buildCurrentDsl4ReleaseSb3();
  const release = await pendingCurrentDsl4ReleaseSb3;
  return {...release, archive: Uint8Array.from(release.archive)};
}

async function buildCurrentDsl4ReleaseSb3() {
  const sourceDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-current-release-source-'));
  try {
    const sourceFiles = await createDsl4ReleaseSourceFiles();
    await Promise.all(
      [...sourceFiles].map(async ([relativePath, bytes]) => {
        const filename = path.join(sourceDirectory, relativePath);
        await mkdir(path.dirname(filename), {recursive: true});
        await writeFile(filename, bytes);
      }),
    );
    return await createKamishibaiSb3({sourceDirectory});
  } finally {
    await rm(sourceDirectory, {recursive: true, force: true});
  }
}

function createPoseFeedbackVariables() {
  return {
    'pose-confidence': ['ポーズ認識', 0],
    'pose-progress': ['チャージ', 0],
  };
}

function createPoseFeedbackMonitors() {
  return [
    {
      id: 'pose-confidence',
      mode: 'slider',
      opcode: 'data_variable',
      params: {VARIABLE: 'ポーズ認識'},
      spriteName: null,
      value: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      visible: false,
      sliderMin: 0,
      sliderMax: 100,
      isDiscrete: true,
    },
    {
      id: 'pose-progress',
      mode: 'slider',
      opcode: 'data_variable',
      params: {VARIABLE: 'チャージ'},
      spriteName: null,
      value: 0,
      width: 0,
      height: 0,
      x: 343,
      y: 0,
      visible: false,
      sliderMin: 0,
      sliderMax: 100,
      isDiscrete: true,
    },
  ];
}

async function resolveChromeExecutable() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.GOOGLE_CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      try {
        await access(candidate);
        return candidate;
      } catch {
        continue;
      }
    }
    const found = spawnSync('which', [candidate], {encoding: 'utf8'});
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  }
  throw new Error(
    'Chromium E2E requires Chrome or Chromium; set CHROME_BIN when it is not on PATH',
  );
}

function contentType(file: string): string {
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.mjs': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
    }[path.extname(file)] ?? 'application/octet-stream'
  );
}

async function startFixtureServer(
  fixturePath = '/test/fixtures/dsl4/web-preview-browser.html',
  root = repositoryRoot,
) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      const file = path.resolve(root, `.${pathname}`);
      if (!file.startsWith(`${root}${path.sep}`) || !(await stat(file)).isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.writeHead(200, {
        'content-type': contentType(file),
        'cache-control': 'no-store',
      });
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
  return {
    server,
    url: `http://127.0.0.1:${address.port}${fixturePath}`,
  };
}

test(
  'keeps title actions below the Player green flag and usable after startup in Chromium',
  {timeout: 30_000},
  async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'dsl4-title-stacking-'));
    const entryPoint = path.join(directory, 'entry.mjs');
    await writeFile(
      entryPoint,
      `export {createDsl4RuntimeTitleControls} from ${JSON.stringify(path.join(repositoryRoot, 'dist/dsl4/platform/runtime-title-controls.js'))};`,
    );
    await writeFile(
      path.join(directory, 'bundle.js'),
      await buildDsl4TurboWarpBrowserBundle({entryPoint}),
    );
    await writeFile(
      path.join(directory, 'index.html'),
      `<!doctype html><meta charset="utf-8">
      <style>
        /* Match the GUI canvas mount and its later, unindexed startup overlay. */
        #stage-wrapper {position:relative;width:480px;height:360px}
        #stage {position:relative;width:480px;height:360px;overflow:hidden}
        #canvas-mount {position:relative;width:480px;height:360px}
        canvas {width:480px;height:360px}
        #green-flag {position:absolute;inset:0;background:#0004;cursor:pointer}
        #modal {position:absolute;inset:0;z-index:510;background:white;display:none}
      </style>
      <div id="stage-wrapper"><div id="stage"><div id="canvas-mount"><canvas></canvas></div></div><div id="green-flag"></div><div id="modal"></div></div>
      <script type="module">
        import {createDsl4RuntimeTitleControls} from './bundle.js';
        const mount = document.querySelector('#canvas-mount');
        const state = {starts:0,websites:0,canvasClicks:0};
        const controls = createDsl4RuntimeTitleControls({document,mount,
          locales:{en:{website:'Official Website',close:'Close'},ja:{website:'公式Webサイト',close:'閉じる'}},
          onWebsite(){state.websites++},onClose(){}});
        controls.show();
        document.querySelector('#green-flag').onclick = event => {state.starts++;event.currentTarget.remove()};
        document.querySelector('canvas').onclick = () => state.canvasClicks++;
        globalThis.titleStacking = {state,controls,ready:true};
      </script>`,
    );
    const {server, url} = await startFixtureServer('/index.html', directory);
    const chrome = spawn(
      await resolveChromeExecutable(),
      [
        '--headless=new',
        '--no-first-run',
        '--no-sandbox',
        '--remote-debugging-port=0',
        `--user-data-dir=${path.join(directory, 'profile')}`,
        url,
      ],
      {stdio: ['ignore', 'pipe', 'pipe']},
    );
    let client: CdpClient | null = null;
    try {
      client = await CdpClient.connect(await waitForPageTarget(await waitForDevTools(chrome), url));
      await client.send('Runtime.enable');
      await waitForEvaluation(client, 'globalThis.titleStacking?.ready', 'title stacking fixture');
      const website = '[data-dsl4-title-action="website"]';
      const hit = `(() => {const r=document.querySelector('${website}').getBoundingClientRect();const e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {id:e.id,website:!!e.closest('${website}')}})()`;
      assert.equal((await evaluateRecord(client, hit)).id, 'green-flag');
      await click(client, website);
      assert.equal((await evaluateRecord(client, 'globalThis.titleStacking.state')).starts, 1);
      assert.equal((await evaluateRecord(client, hit)).website, true);
      await click(client, website);
      assert.equal((await evaluateRecord(client, 'globalThis.titleStacking.state')).websites, 1);
      await click(client, 'canvas');
      assert.equal(
        (await evaluateRecord(client, 'globalThis.titleStacking.state')).canvasClicks,
        1,
      );
      await client.evaluate('document.querySelector("#modal").style.display="block"');
      assert.equal((await evaluateRecord(client, hit)).id, 'modal');
      assert.deepEqual(client.exceptions, []);
    } finally {
      client?.close();
      await stopChrome(chrome);
      await new Promise((resolve) => server.close(resolve));
      await rm(directory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
    }
  },
);

test(
  'plays DSL video until ended, loops, stops and unloads native media in Chromium',
  {timeout: 30_000},
  async () => {
    const profileDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-video-chromium-'));
    const {server, url} = await startFixtureServer('/test/fixtures/dsl4/video-browser.html');
    const chrome = spawn(
      await resolveChromeExecutable(),
      [
        '--headless=new',
        '--disable-background-networking',
        '--disable-dev-shm-usage',
        '--use-angle=swiftshader',
        '--no-first-run',
        '--no-sandbox',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        url,
      ],
      {stdio: ['ignore', 'pipe', 'pipe']},
    );
    let client: CdpClient | null = null;
    try {
      const browserUrl = await waitForDevTools(chrome);
      client = await CdpClient.connect(await waitForPageTarget(browserUrl, url));
      await client.send('Runtime.enable');
      await waitForEvaluation(
        client,
        'globalThis.dsl4VideoFixture?.ready === true',
        'video fixture',
      );
      const result = await evaluateRecord(
        client,
        `globalThis.dsl4VideoFixture.run({
        async probe({port,context,videos}) {
          const {releaseDsl4PlaybackAssets}=await import('/dist/dsl4/platform/playback-asset-release.js');
          const {createDsl4AssetGroupLifecycle}=await import('/dist/dsl4/asset-group-lifecycle.js');
          port.video({id:'same-asset',asset:'Movie',x:0,y:0,width:160,height:120,muted:true},context);
          port.video({id:'direct',url:new URL('video-sample.webm',location.href).href,x:0,y:0,width:160,height:120,muted:true},context);
          await port.videoControl({id:'same-asset',operation:'loop'},context);
          await port.videoControl({id:'direct',operation:'loop'},context);
          const width=videos[1].videoWidth;
          const objectUrl=videos[0].src;
          let cancelled=false,revokeAfterUnload=false;
          const waiting=Promise.resolve(port.videoControl({id:'movie',operation:'playUntilDone'},context)).catch(error=>{if(error.name!=='AbortError')throw error;cancelled=true;});
          const groups=createDsl4AssetGroupLifecycle({groups:[
            {id:'first',scope:'scene',assetIds:['Movie'],dependencies:[]},
            {id:'second',scope:'scene',assetIds:['Movie'],dependencies:[]},
          ],lifecycle:{prepare(){},releaseAssets({assetIds}){
            return releaseDsl4PlaybackAssets({videoPort:port,audioPort:null,assetIds,releaseBase(){
              revokeAfterUnload=videos.slice(0,2).every(video=>video.paused&&!video.getAttribute('src'));
              URL.revokeObjectURL(objectUrl);
            }});
          }}});
          await groups.prepareGroup('first',context);
          await groups.prepareGroup('second',context);
          await groups.releaseGroup('first',context);
          const sharedLeaseRetained=videos.slice(0,2).every(video=>!video.paused&&video.getAttribute('src'));
          const released=await groups.releaseGroup('second',context);
          if(released.cleanupError)throw released.cleanupError;
          await groups.dispose();
          await waiting;
          const {createDsl4VideoAssetAdapter}=await import('/dist/dsl4/platform/video-asset-adapter.js');
          const {createDsl4VideoActionPort}=await import('/dist/dsl4/platform/video-action-port.js');
          const nativeBytes=new Uint8Array(await (await fetch('video-sample.webm')).arrayBuffer());
          const aliasVideos=[]; let aliasRevokes=0,aliasRevokeAfterUnload=false;
          const adapter=createDsl4VideoAssetAdapter({createObjectURL:blob=>URL.createObjectURL(blob),revokeObjectURL(url){
            aliasRevokeAfterUnload=aliasVideos.every(video=>!video.getAttribute('src'));
            URL.revokeObjectURL(url);aliasRevokes++;
          }});
          const payload=id=>({asset:{id,kind:'video'},files:[{bytes:nativeBytes}]});
          const [a,b]=await Promise.all([adapter.prepare(payload('A'),context),adapter.prepare(payload('B'),context)]);
          const aliasPort=createDsl4VideoActionPort({renderer:{addOverlay(element){document.body.append(element);return {container:element};},removeOverlay(element){element.remove();}},getAssetResource:id=>id==='A'?a:b,createVideo(){const element=document.createElement('video');aliasVideos.push(element);return element;}});
          const aliasGroups=createDsl4AssetGroupLifecycle({groups:[{id:'A',scope:'scene',assetIds:['A'],dependencies:[]},{id:'B',scope:'scene',assetIds:['B'],dependencies:[]}],lifecycle:{prepare(){},releaseAssets({assetIds}){return releaseDsl4PlaybackAssets({videoPort:aliasPort,audioPort:null,assetIds,releaseBase(){for(const id of assetIds)adapter.release(id==='A'?a:b);}});}}});
          let aliasNativeShared=false,aliasNativeRetained=false;
          try {
            await aliasGroups.prepareGroup('A',context);await aliasGroups.prepareGroup('B',context);
            for(const id of ['A','B']){aliasPort.video({id,asset:id,x:0,y:0,width:64,height:48,muted:true},context);await aliasPort.videoControl({id,operation:'loop'},context);}
            aliasNativeShared=a.objectUrl===b.objectUrl&&aliasVideos.every(video=>video.videoWidth===64);
            const firstRelease=await aliasGroups.releaseGroup('A',context);if(firstRelease.cleanupError)throw firstRelease.cleanupError;
            const before=aliasVideos[1].currentTime;await new Promise(resolve=>setTimeout(resolve,100));
            aliasNativeRetained=aliasRevokes===0&&!aliasVideos[0].getAttribute('src')&&!aliasVideos[1].paused&&aliasVideos[1].currentTime!==before;
            const lastRelease=await aliasGroups.releaseGroup('B',context);if(lastRelease.cleanupError)throw lastRelease.cleanupError;
          } finally {await aliasGroups.dispose();aliasPort.dispose();adapter.release(a);adapter.release(b);}
          const retainedTime=videos[2].currentTime;
          await new Promise(resolve=>setTimeout(resolve,100));
          return {
            aliasNativeShared,aliasNativeRetained,aliasRevokes,aliasRevokeAfterUnload,
            sharedLeaseRetained,
            selectedAssetWidth:width,
            selectedCancelled:cancelled,
            revokeAfterUnload,
            selectedSourcesReleased:videos.slice(0,2).every(video=>video.paused&&!video.getAttribute('src')),
            directStillPlaying:!videos[2].paused&&videos[2].videoWidth===64,
            directProgressed:videos[2].currentTime!==retainedTime,
          };
        }
      })`,
      );
      assert.equal(result.aliasNativeShared, true);
      assert.equal(result.aliasNativeRetained, true);
      assert.equal(result.aliasRevokes, 1);
      assert.equal(result.aliasRevokeAfterUnload, true);
      assert.equal(result.sharedLeaseRetained, true);
      assert.equal(result.selectedAssetWidth, 64);
      assert.equal(result.selectedCancelled, true);
      assert.equal(result.revokeAfterUnload, true);
      assert.equal(result.selectedSourcesReleased, true);
      assert.equal(result.directStillPlaying, true);
      assert.equal(result.directProgressed, true);
      assert.equal(result.videoWidth, 64);
      assert.equal(result.videoHeight, 48);
      assert.equal(result.ended, true);
      assert.ok(Number(result.elapsedMs) > 100);
      assert.equal(result.backgroundPlaying, true);
      assert.equal(result.backgroundEnded, true);
      assert.equal(result.looping, true);
      assert.equal(result.stopped, true);
      assert.equal(result.paused, true);
      assert.equal(result.resumed, true);
      assert.equal(result.volume, 0.35);
      assert.equal(result.rate, 1.5);
      assert.equal(result.overlays, 0);
      assert.equal(result.sourceReleased, true);
      assert.deepEqual(client.exceptions, []);
    } finally {
      client?.close();
      await stopChrome(chrome);
      await new Promise((resolve) => server.close(resolve));
      await rm(profileDirectory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
    }
  },
);

test(
  'renders video below sprites with the pinned WebGL renderer and releases its GPU resources',
  {timeout: 60_000},
  async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'dsl4-video-webgl-'));
    const profileDirectory = path.join(directory, 'profile');
    const entryPoint = path.join(directory, 'entry.mjs');
    await writeFile(
      entryPoint,
      `export {default as Renderer} from ${JSON.stringify(path.join(repositoryRoot, 'node_modules/scratch-render/src/RenderWebGL.js'))};\nexport {createDsl4VideoActionPort} from ${JSON.stringify(path.join(repositoryRoot, 'dist/dsl4/platform/video-action-port.js'))};\nexport {createDsl4AssetGroupLifecycle} from ${JSON.stringify(path.join(repositoryRoot, 'dist/dsl4/asset-group-lifecycle.js'))};\nexport {releaseDsl4PlaybackAssets} from ${JSON.stringify(path.join(repositoryRoot, 'dist/dsl4/platform/playback-asset-release.js'))};\n`,
    );
    const bundle = await buildDsl4TurboWarpBrowserBundle({entryPoint});
    const fixture = (
      await readFile(path.join(repositoryRoot, 'test/fixtures/dsl4/video-browser.html'), 'utf8')
    ).replace(
      "import {createDsl4VideoActionPort} from '/dist/dsl4/platform/video-action-port.js';",
      "import {createDsl4VideoActionPort, Renderer} from './bundle.js'; globalThis.dsl4VideoRenderer = Renderer;",
    );
    await writeFile(path.join(directory, 'bundle.js'), bundle);
    await writeFile(path.join(directory, 'index.html'), fixture);
    await writeFile(
      path.join(directory, 'video-sample.webm'),
      await readFile(path.join(repositoryRoot, 'test/fixtures/dsl4/video-sample.webm')),
    );
    const {server, url} = await startFixtureServer('/index.html', directory);
    const chrome = spawn(
      await resolveChromeExecutable(),
      [
        '--headless=new',
        '--disable-background-networking',
        '--use-angle=swiftshader',
        '--no-first-run',
        '--no-sandbox',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        url,
      ],
      {stdio: ['ignore', 'pipe', 'pipe']},
    );
    let client: CdpClient | null = null;
    try {
      client = await CdpClient.connect(await waitForPageTarget(await waitForDevTools(chrome), url));
      await client.send('Runtime.enable');
      await waitForEvaluation(
        client,
        'globalThis.dsl4VideoFixture?.ready === true',
        'WebGL video fixture',
      );
      const result = await evaluateRecord(
        client,
        `(async () => {
      const stage = document.createElement('div');
      Object.assign(stage.style, {position: 'relative', width: '480px', height: '360px'}); document.body.append(stage);
      const canvas = document.createElement('canvas'); stage.append(canvas);
      const renderer = new globalThis.dsl4VideoRenderer(canvas);
      stage.append(renderer.overlayContainer);
      renderer.setLayerGroupOrdering(['background', 'video', 'pen', 'sprite']);
      renderer.resize(480, 360);
      const green = document.createElement('canvas'); green.width = 32; green.height = 32;
      const ctx = green.getContext('2d'); ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, 32, 32);
      const skin = renderer.createBitmapSkin(green, 1);
      const sprite = renderer.createDrawable('sprite'); renderer.updateDrawableSkinId(sprite, skin);
      let uploads = 0; let uploadMs = 0;
      const update = renderer.updateBitmapSkin.bind(renderer);
      renderer.updateBitmapSkin = (...args) => { const begin = performance.now(); update(...args); uploadMs += performance.now() - begin; uploads++; };
      const before = Object.keys(renderer._allSkins).length;
      const videoDrawables = [];
      const createDrawable = renderer.createDrawable.bind(renderer);
      renderer.createDrawable = (group) => { const id = createDrawable(group); if (group === 'video') videoDrawables.push(id); return id; };
      const sample = (x, y) => { const p = new Uint8Array(4); renderer.gl.readPixels(x, y, 1, 1, renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, p); return Array.from(p); };
      const outcome = await globalThis.dsl4VideoFixture.run({renderer, plane: 'background', async probe({port, context, videos}) {
        renderer.draw();
        const center = sample(canvas.width / 2, canvas.height / 2);
        const show = (id, plane, zIndex) => port.video({id, asset: 'Movie', x: 0, y: 0, width: 320, height: 180, plane, zIndex, muted: true}, context);
        show('low', 'background', -10);
        show('equal', 'background', 0);
        show('high', 'background', Number.MAX_SAFE_INTEGER);
        const ids = () => renderer._drawList.filter(id => videoDrawables.includes(id));
        const backgroundOrder = ids().map(id => ['movie', 'low', 'equal', 'high'][videoDrawables.indexOf(id)]);
        show('movie', 'background', 0);
        const replacedOrder = ids().map(id => ['removed', 'low', 'equal', 'high', 'movie'][videoDrawables.indexOf(id)]);
        const belowSprite = ids().every(id => renderer.getDrawableOrder(id) < renderer.getDrawableOrder(sprite));
        renderer.draw();
        const centerAfterOrdering = sample(canvas.width / 2, canvas.height / 2);
        show('frontHigh', 'front', 10);
        show('frontLow', 'front', -Number.MAX_SAFE_INTEGER);
        show('frontEqual', 'front', 10);
        const frontOrder = renderer._overlays.map(overlay => Number(getComputedStyle(overlay.container).zIndex));
        const bounds = canvas.getBoundingClientRect();
        const frontElements = renderer._overlays.map(overlay => overlay.userElement);
        frontElements.forEach(video => { video.style.pointerEvents = 'auto'; });
        const frontHitOrder = document.elementsFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2).filter(element => frontElements.includes(element)).map(element => frontElements.indexOf(element));
        const {createDsl4AssetGroupLifecycle,releaseDsl4PlaybackAssets}=await import('./bundle.js');
        const objectUrl=videos.find(video=>video.getAttribute('src')).src;
        let revokeAfterUnload=false;
        const groups=createDsl4AssetGroupLifecycle({groups:[{id:'video',scope:'scene',assetIds:['Movie'],dependencies:[]}],lifecycle:{prepare(){},releaseAssets({assetIds}){
          return releaseDsl4PlaybackAssets({videoPort:port,audioPort:null,assetIds,releaseBase(){
            revokeAfterUnload=videos.every(video=>video.paused&&!video.getAttribute('src'));
            URL.revokeObjectURL(objectUrl);
          }});
        }}});
        await groups.prepareGroup('video',context);
        const releaseResult=await groups.releaseGroup('video',context);
        if(releaseResult.cleanupError)throw releaseResult.cleanupError;
        const skinLeakAfterGroupRelease=Object.keys(renderer._allSkins).length-before;
        const drawableLeakAfterGroupRelease=renderer._drawList.length-1;
        await groups.dispose();
        return {center, centerAfterOrdering, backgroundOrder, replacedOrder, belowSprite, frontOrder, frontHitOrder, uploads, uploadMs, nativeSize: renderer.getNativeSize(),revokeAfterUnload,skinLeakAfterGroupRelease,drawableLeakAfterGroupRelease};
      }});
      outcome.skinLeak = Object.keys(renderer._allSkins).length - before;
      outcome.drawableLeak = renderer._drawList.length - 1;
      renderer.destroyDrawable(sprite, 'sprite'); renderer.destroySkin(skin);
      renderer.gl.getExtension('WEBGL_lose_context')?.loseContext();
      return outcome;
    })()`,
      );
      assert.equal(result.ended, true);
      assert.equal(result.backgroundPlaying, true);
      assert.equal(result.backgroundEnded, true);
      assert.equal(result.looping, true);
      assert.equal(result.stopped, true);
      assert.deepEqual(result.center, [0, 255, 0, 255]);
      assert.deepEqual(result.centerAfterOrdering, [0, 255, 0, 255]);
      assert.deepEqual(result.backgroundOrder, ['low', 'movie', 'equal', 'high']);
      assert.deepEqual(result.replacedOrder, ['low', 'equal', 'movie', 'high']);
      assert.equal(result.belowSprite, true);
      assert.deepEqual(result.frontOrder, [1, 0, 2]);
      assert.deepEqual(result.frontHitOrder, [2, 0, 1]);
      assert.ok(Number(result.uploads) > 1);
      assert.ok(Number(result.uploadMs) >= 0);
      assert.equal(result.revokeAfterUnload, true);
      assert.equal(result.skinLeakAfterGroupRelease, 0);
      assert.equal(result.drawableLeakAfterGroupRelease, 0);
      assert.equal(result.skinLeak, 0);
      assert.equal(result.drawableLeak, 0);
      assert.deepEqual(result.nativeSize, [480, 360]);
      console.log(
        'Video WebGL measurement',
        JSON.stringify({uploads: result.uploads, uploadMs: result.uploadMs}),
      );
      assert.deepEqual(client.exceptions, []);
    } finally {
      client?.close();
      await stopChrome(chrome);
      await new Promise((resolve) => server.close(resolve));
      await rm(directory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
    }
  },
);

test(
  'preserves explicit canvas pointers when the runtime cursor returns to auto in Chromium',
  {timeout: 30_000},
  async () => {
    const chromeExecutable = await resolveChromeExecutable();
    const profileDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-cursor-style-chromium-'));
    const {server, url} = await startFixtureServer(
      '/test/fixtures/dsl4/cursor-computed-style.html',
    );
    const chrome = spawn(
      chromeExecutable,
      [
        '--headless=new',
        '--disable-background-networking',
        '--disable-dev-shm-usage',
        '--use-angle=swiftshader',
        '--no-first-run',
        '--no-sandbox',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        url,
      ],
      {stdio: ['ignore', 'pipe', 'pipe']},
    );
    let client: CdpClient | null = null;
    try {
      const browserWebSocketUrl = await waitForDevTools(chrome);
      const pageWebSocketUrl = await waitForPageTarget(browserWebSocketUrl, url);
      client = await CdpClient.connect(pageWebSocketUrl);
      await client.send('Runtime.enable');
      await waitForEvaluation(
        client,
        'globalThis.dsl4CursorComputedStyleFixture?.ready === true',
        'cursor computed style fixture',
      );
      const activeClient = client;
      const snapshot = () =>
        evaluateRecord(activeClient, 'globalThis.dsl4CursorComputedStyleFixture.snapshot()');

      assert.deepEqual(await snapshot(), {
        surface: 'auto',
        canvas: 'pointer',
        enabled: 'pointer',
        disabled: 'not-allowed',
      });
      await client.evaluate(
        'globalThis.dsl4CursorComputedStyleFixture.setCursor({visible: true, cursor: "wait"})',
      );
      assert.equal((await snapshot()).canvas, 'wait');
      await client.evaluate(
        'globalThis.dsl4CursorComputedStyleFixture.setCursor({visible: true, cursor: "progress"})',
      );
      assert.equal((await snapshot()).canvas, 'progress');
      await client.evaluate(
        'globalThis.dsl4CursorComputedStyleFixture.setCursor({visible: false, cursor: "progress"})',
      );
      assert.equal((await snapshot()).canvas, 'pointer');
      assert.deepEqual(client.exceptions, []);
    } finally {
      client?.close();
      await stopChrome(chrome);
      await new Promise((resolve) => server.close(resolve));
      await rm(profileDirectory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
    }
  },
);

test(
  'runs Standard-profile scene, actor, and BGM crossfades through Chromium platform boundaries',
  {timeout: 30_000},
  async () => {
    const chromeExecutable = await resolveChromeExecutable();
    const profileDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-crossfade-chromium-'));
    const {server, url} = await startFixtureServer('/test/fixtures/dsl4/crossfade-browser.html');
    const chrome = spawn(
      chromeExecutable,
      [
        '--headless=new',
        '--disable-background-networking',
        '--disable-dev-shm-usage',
        '--use-angle=swiftshader',
        '--no-first-run',
        '--no-sandbox',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        url,
      ],
      {stdio: ['ignore', 'pipe', 'pipe']},
    );
    let client: CdpClient | null = null;
    try {
      const browserWebSocketUrl = await waitForDevTools(chrome);
      const pageWebSocketUrl = await waitForPageTarget(browserWebSocketUrl, url);
      client = await CdpClient.connect(pageWebSocketUrl);
      await client.send('Runtime.enable');
      await waitForEvaluation(
        client,
        'globalThis.dsl4CrossfadeBrowserFixture?.ready === true',
        'DSL4 crossfade browser fixture',
      );
      const fixture = await evaluateRecord(client, 'globalThis.dsl4CrossfadeBrowserFixture');
      assert.equal(fixture.ok, true, String(fixture.error));
      assert.deepEqual(fixture.flags, {runtime: true, crossfade: true});
      assert.equal(fixture.backdropApplied, 1);
      assert.equal(fixture.stageGhost, 0);
      assert.equal(fixture.actorApplied, 1);
      assert.equal(fixture.actorGhost, 10);
      assert.deepEqual(fixture.bitmap, [true, 480, 360, 1]);
      assert.deepEqual(fixture.destroyedSkins, [91]);
      assert.equal(fixture.createdDrawables, 3);
      assert.equal(fixture.destroyedDrawables, 3);
      assert.equal(fixture.noninteractiveDrawables, 3);
      assert.equal(requireArray(fixture.voices, 'its voices').length, 2);
      assert.deepEqual(
        requireRecord(requireArray(fixture.voices, 'its voices')[0], 'a voice').options,
        {gain: 1},
      );
      assert.deepEqual(
        requireRecord(requireArray(fixture.voices, 'its voices')[1], 'a voice').options,
        {gain: 0},
      );
      assert.deepEqual(
        requireArray(
          requireRecord(requireArray(fixture.voices, 'its voices')[0], 'a voice').calls,
          'its calls',
        ).at(-1),
        ['stop'],
      );
      assert.deepEqual(
        requireArray(
          requireRecord(requireArray(fixture.voices, 'its voices')[1], 'a voice').calls,
          'its calls',
        ).at(-2),
        ['setGain', 1],
      );
      assert.deepEqual(
        requireArray(
          requireRecord(requireArray(fixture.voices, 'its voices')[1], 'a voice').calls,
          'its calls',
        ).at(-1),
        ['stop'],
      );
      assert.deepEqual(client.exceptions, []);
    } finally {
      client?.close();
      await stopChrome(chrome);
      await new Promise((resolve) => server.close(resolve));
      await rm(profileDirectory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
    }
  },
);

test(
  'loads the pinned TurboWarp browser platform bundle in real Chromium',
  {timeout: 30_000},
  async () => {
    const chromeExecutable = await resolveChromeExecutable();
    const profileDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-turbowarp-chromium-'));
    const fixtureDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-turbowarp-bundle-'));
    const entryPoint = path.join(fixtureDirectory, 'entry.mjs');
    const bundlePath = path.join(fixtureDirectory, 'bundle.js');
    await writeFile(
      entryPoint,
      `import {loadDsl4BrowserTurboWarpPlatform} from ${JSON.stringify(path.join(repositoryRoot, 'dist/dsl4/browser-turbowarp-platform.js'))};
try {
  const platform = await loadDsl4BrowserTurboWarpPlatform();
  globalThis.turbowarpPlatformFixture = {ready: true, ok: true, methods: Object.keys(platform).sort()};
} catch (error) {
  globalThis.turbowarpPlatformFixture = {ready: true, ok: false, error: String(error?.stack ?? error)};
}
`,
    );
    const bundle = await buildDsl4TurboWarpBrowserBundle({entryPoint});
    await Promise.all([
      writeFile(bundlePath, bundle),
      writeFile(
        path.join(fixtureDirectory, 'index.html'),
        '<!doctype html><meta charset="utf-8"><script type="module" src="/bundle.js"></script>',
      ),
    ]);
    const {server, url} = await startFixtureServer('/index.html', fixtureDirectory);
    const chrome = spawn(
      chromeExecutable,
      [
        '--headless=new',
        '--disable-background-networking',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-sandbox',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        url,
      ],
      {stdio: ['ignore', 'pipe', 'pipe']},
    );
    let client: CdpClient | null = null;
    try {
      const browserWebSocketUrl = await waitForDevTools(chrome);
      const pageWebSocketUrl = await waitForPageTarget(browserWebSocketUrl, url);
      client = await CdpClient.connect(pageWebSocketUrl);
      await client.send('Runtime.enable');
      await waitForEvaluation(
        client,
        'globalThis.turbowarpPlatformFixture?.ready === true',
        'TurboWarp platform package load',
      );
      const fixture = await evaluateRecord(client, 'globalThis.turbowarpPlatformFixture');
      assert.equal(fixture.ok, true, String(fixture.error));
      assert.deepEqual(fixture.methods, [
        'createAudioEngine',
        'createBitmapAdapter',
        'createRenderer',
        'createStorage',
        'createVm',
        'disposeAudioEngine',
        'disposeBitmapAdapter',
        'disposeRenderer',
        'disposeStorage',
      ]);
      assert.deepEqual(client.exceptions, []);
    } finally {
      client?.close();
      await stopChrome(chrome);
      await new Promise((resolve) => server.close(resolve));
      await Promise.all([
        rm(profileDirectory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100}),
        rm(fixtureDirectory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100}),
      ]);
    }
  },
);

function waitForDevTools(child: ChildProcessByStdio<null, Readable, Readable>) {
  return new Promise<string>((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(
      () => reject(new Error(`Chrome DevTools timeout\n${output}`)),
      15_000,
    );
    const inspect = (chunk: Buffer | string) => {
      output += chunk.toString();
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/u);
      if (!match) return;
      clearTimeout(timeout);
      resolve(requireDefined(match[1], 'the DevTools URL'));
    };
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chrome exited before DevTools was ready (${code})\n${output}`));
    });
  });
}

async function waitForPageTarget(browserWebSocketUrl: string, fixtureUrl: string) {
  const endpoint = new URL(browserWebSocketUrl);
  const listUrl = `http://${endpoint.host}/json/list`;
  const expected = new URL(fixtureUrl);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const targets = requireArray(
        await fetch(listUrl).then((response) => response.json()),
        'the DevTools target list',
      ).map((entry) => requireRecord(entry, 'a DevTools target'));
      const page = targets.find((target) => {
        if (target.type !== 'page') return false;
        const actual = new URL(requireString(target.url, 'its URL'));
        return (
          actual.origin === expected.origin &&
          actual.pathname === expected.pathname &&
          actual.search === expected.search
        );
      });
      if (page?.webSocketDebuggerUrl) {
        return requireString(page.webSocketDebuggerUrl, 'the page WebSocket URL');
      }
    } catch {
      // Chrome may publish the browser endpoint before the initial page target.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Chrome did not expose the Web Preview page target');
}

/** One pending DevTools request, settled when its reply arrives. */
interface PendingCdpRequest {
  resolve(result: Record<string, unknown>): void;
  reject(error: Error): void;
}

class CdpClient {
  readonly socket: WebSocket;
  nextId = 1;
  readonly pending = new Map<number, PendingCdpRequest>();
  readonly exceptions: unknown[] = [];

  constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener('message', (event) => {
      const message = requireRecord(JSON.parse(String(event.data)), 'a DevTools message');
      if (message.method === 'Runtime.exceptionThrown') {
        const details = requireRecord(
          requireRecord(message.params, 'its parameters').exceptionDetails,
          'its exception details',
        );
        const exception = details.exception;
        this.exceptions.push(
          (isRecord(exception) ? exception.description : undefined) ?? details.text,
        );
      }
      if (typeof message.id !== 'number') return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) {
        request.reject(new Error(String(requireRecord(message.error, 'its error').message)));
      } else {
        request.resolve(requireRecord(message.result, 'its result'));
      }
    });
  }

  static async connect(url: string) {
    const socket = new WebSocket(url);
    await withDeadline(
      new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, {once: true});
        socket.addEventListener('error', reject, {once: true});
      }),
      'the Chromium DevTools WebSocket to open',
      15_000,
    );
    return new CdpClient(socket);
  }

  send(method: string, params: Record<string, unknown> = {}) {
    const id = this.nextId++;
    return withDeadline(
      new Promise<Record<string, unknown>>((resolve, reject) => {
        this.pending.set(id, {resolve, reject});
        this.socket.send(JSON.stringify({id, method, params}));
      }),
      // Every expression this suite evaluates is a cheap predicate against a page that is already
      // loaded, so a response that takes this long is a browser that has stopped answering.
      `the Chromium response to ${method}`,
      15_000,
    ).finally(() => this.pending.delete(id));
  }

  async evaluate(expression: string): Promise<unknown> {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      const details = requireRecord(response.exceptionDetails, 'the exception details');
      const exception = details.exception;
      throw new Error(
        String((isRecord(exception) ? exception.description : undefined) ?? details.text),
      );
    }
    return requireRecord(response.result, 'the evaluation result').value;
  }

  close() {
    this.socket.close();
  }
}

/**
 * The default deadline suits waits that only need the page to settle. Callers that wait on
 * TensorFlow.js pose predictions pass a longer one: SwiftShader runs the first inference an order
 * of magnitude slower than the hardware backend CI uses.
 */
async function waitForEvaluation(
  client: CdpClient,
  expression: string,
  message: string,
  {timeoutMs = 10_000}: {timeoutMs?: number} = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Timed out waiting for ${message}`);
}

async function centerOf(client: CdpClient, selector: string) {
  return client.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    element.scrollIntoView({block: 'center', inline: 'center'});
    const rect = element.getBoundingClientRect();
    return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
  })()`);
}

async function click(client: CdpClient, selector: string) {
  const point = requireRecord(await centerOf(client, selector), `the center of ${selector}`);
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
}

async function pressKey(
  client: CdpClient,
  {key, code, windowsVirtualKeyCode}: {key: string; code: string; windowsVirtualKeyCode: number},
) {
  const params = {key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode};
  await client.send('Input.dispatchKeyEvent', {type: 'keyDown', ...params});
  await client.send('Input.dispatchKeyEvent', {type: 'keyUp', ...params});
}

function waitForExit(child: ChildProcess, timeoutMs: number) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const onExit = () => finish(true);
    const finish = (exited: boolean) => {
      clearTimeout(timeout);
      child.off('exit', onExit);
      resolve(exited);
    };
    const timeout = setTimeout(() => finish(false), timeoutMs);
    child.once('exit', onExit);
  });
}

async function stopChrome(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  if (await waitForExit(child, 2_000)) return;
  child.kill('SIGKILL');
  await waitForExit(child, 5_000);
}

test(
  'loads the Release Player runtime once, with its project, without duplicate TensorFlow.js warnings',
  {timeout: 60_000},
  async () => {
    const chromeExecutable = await resolveChromeExecutable();
    const profileDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-tensorflow-chromium-'));
    const fixtureDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-tensorflow-package-'));
    const release = await createCurrentDsl4ReleaseSb3();
    const archive = unzipSync(release.archive);
    const project = JSON.parse(
      strFromU8(requireDefined(archive['project.json'], 'the packaged project.json')),
    );
    const extensionSource = await createDsl4RuntimeBundleSource();
    project.extensionURLs.kubohiroyakamishibai4 = `data:text/javascript;base64,${extensionSource.toString('base64')}`;
    archive['project.json'] = strToU8(JSON.stringify(project));
    const sb3Path = path.join(fixtureDirectory, 'release.sb3');
    const playerPath = path.join(fixtureDirectory, 'player.html');
    await writeFile(sb3Path, zipSync(archive));
    await buildReleasePlayer(sb3Path, playerPath);
    const warningProbe = `<script>
Object.defineProperty(navigator, 'language', {
  configurable: true,
  value: new URL(location.href).searchParams.get('locale') || 'ja-JP',
});
</script><script>${packagerExtensionLoadProbeScript}</script><script>
globalThis.__dsl4Warnings = [];
const __dsl4OriginalWarn = console.warn.bind(console);
console.warn = (...values) => {
  globalThis.__dsl4Warnings.push(values.map(String).join(' '));
  __dsl4OriginalWarn(...values);
};
</script>`;
    const html = (await readFile(playerPath, 'utf8')).replace('<head>', `<head>${warningProbe}`);
    await writeFile(path.join(fixtureDirectory, 'index.html'), html);
    const {server, url} = await startFixtureServer('/index.html', fixtureDirectory);
    const chrome = spawn(
      chromeExecutable,
      [
        '--headless=new',
        '--disable-background-networking',
        '--disable-dev-shm-usage',
        '--use-angle=swiftshader',
        '--no-first-run',
        '--no-sandbox',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        url,
      ],
      {stdio: ['ignore', 'pipe', 'pipe']},
    );
    let client: CdpClient | null = null;
    try {
      const browserWebSocketUrl = await waitForDevTools(chrome);
      const pageWebSocketUrl = await waitForPageTarget(browserWebSocketUrl, url);
      client = await CdpClient.connect(pageWebSocketUrl);
      await client.send('Runtime.enable');
      await waitForEvaluation(client, 'Boolean(globalThis.Scratch?.vm)', 'packaged TurboWarp VM');
      await waitForEvaluation(
        client,
        'Boolean(globalThis[Symbol.for("@kubohiroya/turbowarp-teachable-machine/runtime")]?.version === "4.2.0" && document.querySelector("[data-runtime-dock-control=kamishibai-recognition-compute]"))',
        'Teachable Machine settings entry in shared controls Dock',
      );
      await waitForEvaluation(
        client,
        `(() => {
        const report = globalThis.Scratch?.vm?.runtime?._primitives?.['kubohiroyakamishibai4_kubohiroyakamishibairuntime4__runtimeDiagnosticsReporter'];
        return typeof report === 'function' && JSON.parse(report({}, {})).status === 'ready';
      })()`,
        'packaged application ready before playback',
      );
      await waitForEvaluation(
        client,
        `${packagerExtensionLoadProbeEvents}.includes('register:kubohiroyakamishibai4')`,
        'registered Kamishibai runtime bundle',
      );
      assertEmbeddedExtensionLoadedOnceWithProject(
        await client.evaluate(packagerExtensionLoadProbeEvents),
        'kubohiroyakamishibai4',
      );
      const warnings = requireArray(
        await client.evaluate('globalThis.__dsl4Warnings'),
        'the collected warnings',
      ).map((warning) => requireString(warning, 'a warning'));
      for (const unexpected of [
        'webgl backend was already registered',
        'cpu backend was already registered',
        'Platform browser has already been set',
      ]) {
        assert.equal(
          warnings.some((warning) => warning.includes(unexpected)),
          false,
          `Unexpected TensorFlow.js warning: ${unexpected}\n${warnings.join('\n')}`,
        );
      }
      await client.evaluate(`(() => {
        const camera = globalThis.Scratch.vm.runtime.ext_kubohiroyacamerasource;
        globalThis.__dsl4DockCamera = camera.registerCameraControls({owner:'dock-test', cameraId:'pose', locale:'ja'});
        globalThis.__dsl4DockCamera.start();
      })()`);
      await waitForEvaluation(
        client,
        'Boolean(document.querySelector("[data-runtime-dock-control=camera]"))',
        'Camera Source entry in the shared Dock',
      );
      const dockClient = client;
      const dock = '[data-runtime-controls-dock]';
      const handle = '[data-runtime-dock-handle]';
      const compute = '[data-runtime-dock-control=kamishibai-recognition-compute]';
      const revealDock = async () => {
        const point = requireRecord(await centerOf(dockClient, handle), 'the Dock handle');
        await dockClient.send('Input.dispatchMouseEvent', {type: 'mouseMoved', ...point});
        await waitForEvaluation(
          dockClient,
          `document.querySelector('${dock}').dataset.expanded === 'true'`,
          'Dock revealed by hovering',
        );
      };
      const hideDock = async () => {
        await revealDock();
        const point = await evaluateRecord(dockClient, '({x:innerWidth/2,y:innerHeight/2})');
        await dockClient.send('Input.dispatchMouseEvent', {type: 'mouseMoved', ...point});
        await waitForEvaluation(
          dockClient,
          `document.querySelector('${dock}').dataset.expanded === 'false'`,
          'Dock automatically hidden after leaving its edge',
        );
      };
      await hideDock();
      await client.send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 1});
      const touch = requireRecord(await centerOf(client, handle), 'the Dock touch target');
      await client.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [touch]});
      await client.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      await waitForEvaluation(
        client,
        `document.querySelector('${dock}').dataset.expanded === 'true'`,
        'Dock revealed by tapping',
      );
      for (const edge of ['bottom', 'top', 'left', 'right']) {
        await revealDock();
        await click(client, '[data-runtime-dock-bar] > button:last-child');
        await client.evaluate(`(() => {
          const select = document.querySelector('[data-runtime-dock-settings] select');
          select.value = ${JSON.stringify(edge)};
          select.dispatchEvent(new Event('change', {bubbles:true}));
        })()`);
        await click(client, '[data-runtime-dock-settings] button');
        await hideDock();
        await revealDock();
        await click(client, compute);
        const placement = await evaluateRecord(
          client,
          `(() => {
        const entry = document.querySelector('[data-runtime-dock-control=kamishibai-recognition-compute]');
        const camera = document.querySelector('[data-runtime-dock-control=camera]');
        const dock = entry.closest('[data-runtime-controls-dock]');
        const canvas = document.querySelector('canvas');
        const panel = document.querySelector('[data-dsl4-compute-settings]');
        const select = panel.querySelector('select');
        const rect = panel.getBoundingClientRect();
        return {
          inStage: !!canvas?.parentElement?.contains(entry),
          panelInStage: !!canvas?.parentElement?.contains(panel),
          sharedWithCamera: camera.closest('[data-runtime-controls-dock]') === dock,
          dockCount: document.querySelectorAll('[data-runtime-controls-dock]').length,
          buttonText: entry.textContent,
          edge: dock.dataset.edge,
          keptOpen: dock.dataset.expanded,
          options: [...select.options].map(option => option.value),
          initial: select.value,
          locale: panel.getAttribute('lang'),
          title: panel.querySelector('h2').textContent,
          visible: getComputedStyle(panel).display !== 'none' && rect.height > 0,
          withinViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
        };
        })()`,
        );
        assert.equal(placement.inStage, false);
        assert.equal(placement.panelInStage, false);
        assert.equal(placement.sharedWithCamera, true);
        assert.equal(placement.dockCount, 1);
        assert.match(String(placement.buttonText), /Teachable Machine/u);
        assert.equal(placement.edge, edge);
        assert.equal(placement.keptOpen, 'true');
        assert.deepEqual(placement.options, ['auto', 'webgpu', 'wasm', 'cpu']);
        assert.equal(placement.initial, 'auto');
        assert.equal(placement.locale, 'ja');
        assert.equal(placement.title, '認識の計算方式');
        assert.equal(placement.visible, true);
        assert.equal(placement.withinViewport, true);
        await client.evaluate(
          'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
        );
        const screenshot = requireRecord(
          await client.send('Page.captureScreenshot', {format: 'png'}),
          'the settings screenshot',
        );
        await writeFile(
          path.join(tmpdir(), `kamishibai-teachable-machine-dock-${edge}.png`),
          Buffer.from(requireString(screenshot.data, 'the screenshot bytes'), 'base64'),
        );
        if (edge === 'bottom') {
          await click(client, '[data-runtime-dock-control=camera]');
          assert.equal(
            await client.evaluate(
              'getComputedStyle(document.querySelector("[data-dsl4-compute-settings]")).display',
            ),
            'none',
          );
          await click(client, '[data-runtime-dock-control=camera]');
        } else await click(client, '[data-dsl4-compute-close]');
      }
      await client.evaluate('globalThis.__dsl4DockCamera.dispose()');
      const assertSettingsLocale = async (locale: 'ja' | 'en') => {
        await revealDock();
        await click(dockClient, compute);
        const labels = await evaluateRecord(
          dockClient,
          `(() => {
          const panel = document.querySelector('[data-dsl4-compute-settings]');
          return {
            locale: panel.getAttribute('lang'),
            title: panel.querySelector('h2').textContent,
            accessibleName: panel.getAttribute('aria-label'),
            options: [...panel.querySelectorAll('option')].map(option => option.textContent),
            apply: panel.querySelector('[data-dsl4-compute-apply]').textContent,
            close: (() => {
              const button = panel.querySelector('[data-dsl4-compute-close]');
              return {
                text: button.textContent,
                ariaLabel: button.getAttribute('aria-label'),
                title: button.getAttribute('title'),
                icon: Boolean(button.querySelector('svg')),
              };
            })(),
          };
        })()`,
        );
        const title = locale === 'ja' ? '認識の計算方式' : 'Recognition compute backend';
        assert.deepEqual(labels, {
          locale,
          title,
          accessibleName: title,
          options:
            locale === 'ja'
              ? ['Auto（自動・推奨）', 'WebGPU', 'WASM', 'JavaScript（CPU）']
              : ['Auto (recommended)', 'WebGPU', 'WASM', 'JavaScript (CPU)'],
          apply: locale === 'ja' ? '保存して最初から再生' : 'Save and restart story',
          close: {
            text: '',
            ariaLabel: locale === 'ja' ? '閉じる' : 'Close',
            title: locale === 'ja' ? '閉じる' : 'Close',
            icon: true,
          },
        });
        const screenshot = requireRecord(
          await dockClient.send('Page.captureScreenshot', {format: 'png'}),
          'the localized settings screenshot',
        );
        await writeFile(
          path.join(tmpdir(), `kamishibai-compute-locale-${locale}.png`),
          Buffer.from(requireString(screenshot.data, 'the screenshot bytes'), 'base64'),
        );
        await click(dockClient, '[data-dsl4-compute-close]');
      };
      await assertSettingsLocale('ja');
      await client.evaluate(`globalThis.Scratch.vm.runtime._primitives[
        'kubohiroyakamishibai4_kubohiroyakamishibairuntime4__toggleTitleLanguage'
      ]({}, {})`);
      await assertSettingsLocale('en');
      await client.evaluate(`(async () => {
        await globalThis.Scratch.vm.setLocale('en-US', {});
        await globalThis.Scratch.vm.runtime._primitives[
          'kubohiroyakamishibai4_kubohiroyakamishibairuntime4__showTitle'
        ]({}, {});
      })()`);
      await waitForEvaluation(
        client,
        `(() => {
        const report = globalThis.Scratch.vm.runtime._primitives[
          'kubohiroyakamishibai4_kubohiroyakamishibairuntime4__runtimeDiagnosticsReporter'
        ];
        return JSON.parse(report({}, {})).status === 'title';
      })()`,
        'English host locale taking priority over the Japanese browser on restart',
      );
      await assertSettingsLocale('en');
      for (const language of ['en-US', 'fr-FR']) {
        await client.send('Page.navigate', {url: `${url}?locale=${language}`});
        await waitForEvaluation(
          client,
          `location.search === '?locale=${language}' && Boolean(document.querySelector("[data-runtime-dock-control=kamishibai-recognition-compute]"))`,
          `initial settings for ${language}`,
        );
        await assertSettingsLocale('en');
      }
      assert.deepEqual(client.exceptions, []);
    } finally {
      client?.close();
      await stopChrome(chrome);
      await new Promise((resolve) => server.close(resolve));
      await Promise.all([
        rm(profileDirectory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100}),
        rm(fixtureDirectory, {recursive: true, force: true}),
      ]);
    }
  },
);

test(
  'opens the non-embedded release title and disabled Reload menu without loading its story bundle',
  {timeout: 60_000},
  async () => {
    const chromeExecutable = await resolveChromeExecutable();
    const profileDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-release-menu-chromium-'));
    const fixtureDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-release-menu-package-'));
    const release = await createCurrentDsl4ReleaseSb3();
    const loadedProject = await TurboWarpPackager.loadProject(release.archive);
    const packager = new TurboWarpPackager.Packager();
    packager.project = loadedProject;
    excludeEmbeddedProjectExtensionsFromPackagerPreload(packager);
    packager.options.autoplay = true;
    packager.options.app.title = 'DSL 4.0 non-embedded release E2E';
    const packaged = await packager.package();
    assert.equal(packaged.type, 'text/html');
    await writeFile(path.join(fixtureDirectory, 'index.html'), packaged.data);
    const {server, url} = await startFixtureServer('/index.html', fixtureDirectory);
    const chrome = spawn(
      chromeExecutable,
      [
        '--headless=new',
        '--disable-background-networking',
        '--disable-dev-shm-usage',
        '--use-angle=swiftshader',
        '--no-first-run',
        '--no-sandbox',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        url,
      ],
      {stdio: ['ignore', 'pipe', 'pipe']},
    );
    let client: CdpClient | null = null;
    try {
      const browserWebSocketUrl = await waitForDevTools(chrome);
      const pageWebSocketUrl = await waitForPageTarget(browserWebSocketUrl, url);
      client = await CdpClient.connect(pageWebSocketUrl);
      await client.send('Runtime.enable');
      await waitForEvaluation(client, 'Boolean(globalThis.Scratch?.vm)', 'packaged TurboWarp VM');
      assert.equal(
        await client.evaluate(`(() => {
          const vm = globalThis.Scratch.vm;
          const originalToJSON = vm.toJSON.bind(vm);
          vm.toJSON = () => {
            const project = JSON.parse(originalToJSON());
            project.extensionStorage.kubohiroyakamishibai4.components
              .kubohiroyakamishibairuntime4.assets = {formatVersion: 0};
            return JSON.stringify(project);
          };
          vm.greenFlag();
          return true;
        })()`),
        true,
      );
      await waitForEvaluation(
        client,
        `document.querySelector('[data-dsl4-title-controls=true]')?.style.display === 'block'`,
        'localized release title',
      );
      assert.equal(
        await client.evaluate(
          `document.querySelector('[data-dsl4-runtime-error=true]')?.style.display === 'flex'`,
        ),
        false,
      );
      const initialTitleScale = await evaluateRecord(
        client,
        `(() => {
        const title = document.querySelector('[data-dsl4-title-controls=true]');
        const website = document.querySelector('[data-dsl4-title-action=website]');
        const icon = website?.querySelector('span[aria-hidden=true]');
        const label = website?.querySelector('span:not([aria-hidden])');
        const close = document.querySelector('[data-dsl4-title-action=close]');
        const closeRect = close?.getBoundingClientRect();
        const closeLineCenterOffsets = closeRect
          ? [...close.querySelectorAll('[data-dsl4-close-icon-line=true]')].map((line) => {
              const lineRect = line.getBoundingClientRect();
              return {
                x: lineRect.left + lineRect.width / 2 - (closeRect.left + closeRect.width / 2),
                y: lineRect.top + lineRect.height / 2 - (closeRect.top + closeRect.height / 2)
              };
            })
          : [];
        return {
          titleWidth: title?.getBoundingClientRect().width ?? 0,
          iconWidth: icon?.getBoundingClientRect().width ?? 0,
          fontSize: label ? Number.parseFloat(getComputedStyle(label).fontSize) : 0,
          closeLineCenterOffsets
        };
      })()`,
      );
      const closeLineCenterOffsets = requireArray(
        initialTitleScale.closeLineCenterOffsets,
        'the close icon line offsets',
      ).map((offset) => requireRecord(offset, 'a line offset'));
      assert.equal(closeLineCenterOffsets.length, 2);
      for (const offset of closeLineCenterOffsets) {
        assert.ok(
          Math.hypot(measurement(offset, 'x'), measurement(offset, 'y')) < 0.5,
          `close icon line must stay at the button center: ${JSON.stringify(offset)}`,
        );
      }
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 1080,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await waitForEvaluation(
        client,
        `document.querySelector('[data-dsl4-title-controls=true]').getBoundingClientRect().width > ${measurement(initialTitleScale, 'titleWidth') * 1.25}`,
        'scaled release title stage',
      );
      const expandedTitleScale = await evaluateRecord(
        client,
        `(() => {
        const title = document.querySelector('[data-dsl4-title-controls=true]');
        const website = document.querySelector('[data-dsl4-title-action=website]');
        const icon = website?.querySelector('span[aria-hidden=true]');
        const label = website?.querySelector('span:not([aria-hidden])');
        return {
          titleWidth: title?.getBoundingClientRect().width ?? 0,
          iconWidth: icon?.getBoundingClientRect().width ?? 0,
          fontSize: label ? Number.parseFloat(getComputedStyle(label).fontSize) : 0
        };
      })()`,
      );
      assert.ok(
        measurement(expandedTitleScale, 'iconWidth') >
          measurement(initialTitleScale, 'iconWidth') * 1.25,
        `title website icon must scale with the Stage: ${JSON.stringify({initialTitleScale, expandedTitleScale})}`,
      );
      assert.ok(
        measurement(expandedTitleScale, 'fontSize') >
          measurement(initialTitleScale, 'fontSize') * 1.25,
        `title website label must scale with the Stage: ${JSON.stringify({initialTitleScale, expandedTitleScale})}`,
      );
      assert.ok(
        Math.abs(
          measurement(expandedTitleScale, 'iconWidth') /
            measurement(expandedTitleScale, 'titleWidth') -
            measurement(initialTitleScale, 'iconWidth') /
              measurement(initialTitleScale, 'titleWidth'),
        ) < 0.002,
      );
      assert.ok(
        Math.abs(
          measurement(expandedTitleScale, 'fontSize') /
            measurement(expandedTitleScale, 'titleWidth') -
            measurement(initialTitleScale, 'fontSize') /
              measurement(initialTitleScale, 'titleWidth'),
        ) < 0.002,
      );
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: 800,
        height: 600,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await waitForEvaluation(
        client,
        `document.querySelector('[data-dsl4-title-controls=true]').getBoundingClientRect().width < ${measurement(expandedTitleScale, 'titleWidth') / 1.25}`,
        'restored release title stage',
      );
      await client.evaluate(
        `document.querySelector('[data-dsl4-title-action=close]').click(); true`,
      );
      await waitForEvaluation(
        client,
        `document.querySelector('[data-dsl4-application-menu=true]')?.style.display === 'block'`,
        'non-embedded application menu',
      );
      const initialMenuScale = await evaluateRecord(
        client,
        `(() => {
        const menu = document.querySelector('[data-dsl4-application-menu=true]');
        const open = document.querySelector('[data-dsl4-menu-action=open]');
        const icon = open?.querySelector('span[aria-hidden=true]');
        const label = open?.querySelector('span:not([aria-hidden])');
        return {
          menuWidth: menu?.getBoundingClientRect().width ?? 0,
          iconWidth: icon?.getBoundingClientRect().width ?? 0,
          fontSize: label ? Number.parseFloat(getComputedStyle(label).fontSize) : 0
        };
      })()`,
      );
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 1080,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await waitForEvaluation(
        client,
        `document.querySelector('[data-dsl4-application-menu=true]').getBoundingClientRect().width > ${measurement(initialMenuScale, 'menuWidth') * 1.25}`,
        'scaled application menu stage',
      );
      const expandedMenuScale = await evaluateRecord(
        client,
        `(() => {
        const menu = document.querySelector('[data-dsl4-application-menu=true]');
        const open = document.querySelector('[data-dsl4-menu-action=open]');
        const icon = open?.querySelector('span[aria-hidden=true]');
        const label = open?.querySelector('span:not([aria-hidden])');
        return {
          menuWidth: menu?.getBoundingClientRect().width ?? 0,
          iconWidth: icon?.getBoundingClientRect().width ?? 0,
          fontSize: label ? Number.parseFloat(getComputedStyle(label).fontSize) : 0
        };
      })()`,
      );
      assert.ok(
        measurement(expandedMenuScale, 'iconWidth') >
          measurement(initialMenuScale, 'iconWidth') * 1.25,
        `menu icon must scale with the Stage: ${JSON.stringify({initialMenuScale, expandedMenuScale})}`,
      );
      assert.ok(
        measurement(expandedMenuScale, 'fontSize') >
          measurement(initialMenuScale, 'fontSize') * 1.25,
        `menu label must scale with the Stage: ${JSON.stringify({initialMenuScale, expandedMenuScale})}`,
      );
      assert.ok(
        Math.abs(
          measurement(expandedMenuScale, 'iconWidth') /
            measurement(expandedMenuScale, 'menuWidth') -
            measurement(initialMenuScale, 'iconWidth') / measurement(initialMenuScale, 'menuWidth'),
        ) < 0.002,
      );
      assert.ok(
        Math.abs(
          measurement(expandedMenuScale, 'fontSize') / measurement(expandedMenuScale, 'menuWidth') -
            measurement(initialMenuScale, 'fontSize') / measurement(initialMenuScale, 'menuWidth'),
        ) < 0.002,
      );
      await click(client, '[data-dsl4-menu-action=about]');
      await waitForEvaluation(
        client,
        `document.querySelector('[data-dsl4-application-menu=true]')?.style.display === 'none' && document.querySelector('[data-dsl4-title-controls=true]')?.style.display === 'block'`,
        'application information title screen',
      );
      const aboutState = await evaluateRecord(
        client,
        `(() => {
        const runtime = globalThis.Scratch.vm.runtime;
        const stage = runtime.getTargetForStage();
        return {
          stageCostume: stage.getCostumes()[stage.currentCostume].name,
          simplifiedDialogCount: document.querySelectorAll('[data-dsl4-title-shell=true]').length
        };
      })()`,
      );
      assert.match(
        requireString(aboutState.stageCostume, 'the evaluated stageCostume'),
        /^Title(?:Runtime)?$/u,
      );
      assert.equal(aboutState.simplifiedDialogCount, 0);
      await click(client, '[data-dsl4-title-action=close]');
      await waitForEvaluation(
        client,
        `document.querySelector('[data-dsl4-application-menu=true]')?.style.display === 'block'`,
        'return from application information title',
      );
      const menu = await evaluateRecord(
        client,
        `(() => {
        const reload = document.querySelector('[data-dsl4-menu-action=reload]');
        const build = document.querySelector('[data-dsl4-menu-action=build]');
        const open = document.querySelector('[data-dsl4-menu-action=open]');
        const icons = [...document.querySelectorAll('[data-dsl4-menu-action] span[aria-hidden=true]')];
        const runtime = globalThis.Scratch.vm.runtime;
        const stage = runtime.getTargetForStage();
        open.click();
        const input = document.querySelector('input[type=file]');
        return {
          reloadDisabled: reload?.disabled,
          reloadAriaDisabled: reload?.getAttribute('aria-disabled'),
          reloadCursor: reload ? getComputedStyle(reload).cursor : null,
          buildHidden: build?.hidden,
          inputAccept: input?.accept,
          inputMultiple: input?.multiple,
          inputWebkitDirectory: input?.webkitdirectory,
          iconFilters: icons.map((icon) => getComputedStyle(icon).filter),
          stageCostume: stage.getCostumes()[stage.currentCostume].name,
          errorVisible:
            document.querySelector('[data-dsl4-runtime-error=true]')?.style.display === 'flex',
        };
      })()`,
      );
      assert.equal(menu.reloadDisabled, true);
      assert.equal(menu.reloadAriaDisabled, 'true');
      assert.equal(menu.reloadCursor, 'not-allowed');
      assert.equal(menu.buildHidden, true);
      assert.equal(menu.inputAccept, '.yml,.yaml');
      assert.equal(menu.inputMultiple, false);
      assert.equal(menu.inputWebkitDirectory, false);
      const iconFilters = requireArray(menu.iconFilters, 'the menu icon filters');
      assert.equal(iconFilters.length, 6);
      assert.equal(
        iconFilters.every((filter) => filter !== 'none'),
        true,
      );
      assert.match(
        requireString(menu.stageCostume, 'the evaluated stageCostume'),
        /^Menu(?:Runtime)?$/u,
      );
      assert.equal(menu.errorVisible, false);
      assert.deepEqual(client.exceptions, []);
    } finally {
      client?.close();
      await stopChrome(chrome);
      await new Promise((resolve) => server.close(resolve));
      await Promise.all([
        rm(profileDirectory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100}),
        rm(fixtureDirectory, {recursive: true, force: true}),
      ]);
    }
  },
);

test(
  'builds the latest browser project and loads the generated SB3 in a fresh Chromium VM',
  {timeout: 60_000},
  async () => {
    const chromeExecutable = await resolveChromeExecutable();
    const profileDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-browser-build-chromium-'));
    const fixtureDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-browser-build-package-'));
    const release = await createCurrentDsl4ReleaseSb3();
    const loadedProject = await TurboWarpPackager.loadProject(release.archive);
    const packager = new TurboWarpPackager.Packager();
    packager.project = loadedProject;
    excludeEmbeddedProjectExtensionsFromPackagerPreload(packager);
    packager.options.autoplay = true;
    packager.options.app.title = 'DSL 4.0 browser distribution build E2E';
    const packaged = await packager.package();
    assert.equal(packaged.type, 'text/html');
    await writeFile(path.join(fixtureDirectory, 'index.html'), packaged.data);
    const {server, url} = await startFixtureServer('/index.html', fixtureDirectory);
    const chrome = spawn(
      chromeExecutable,
      [
        '--headless=new',
        '--disable-background-networking',
        '--disable-dev-shm-usage',
        '--use-angle=swiftshader',
        '--no-first-run',
        '--no-sandbox',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        url,
      ],
      {stdio: ['ignore', 'pipe', 'pipe']},
    );
    let client: CdpClient | null = null;
    try {
      const browserWebSocketUrl = await waitForDevTools(chrome);
      const pageWebSocketUrl = await waitForPageTarget(browserWebSocketUrl, url);
      client = await CdpClient.connect(pageWebSocketUrl);
      await client.send('Runtime.enable');
      await waitForEvaluation(client, 'Boolean(globalThis.Scratch?.vm)', 'packaged TurboWarp VM');
      await client.evaluate(`(() => {
        const encoder = new TextEncoder();
        const files = new Map([
          ['project.source.json', JSON.stringify({
            formatVersion: 1,
            mode: 'external',
            sourceId: 'main',
            path: 'story.kamishibai.yaml'
          })],
          ['story.kamishibai.yaml', "kamishibai: '4.0'\\ncontrols:\\n  keymaps:\\n    production:\\n      Space: navigation.nextAction\\nscenes:\\n  opening:\\n    - wait: 0.05\\n"]
        ]);
        const notFound = () => new DOMException('Entry not found', 'NotFoundError');
        const root = {
          kind: 'directory',
          name: 'tutorial-story',
          async queryPermission() { return 'granted'; },
          async requestPermission() { return 'granted'; },
          async getFileHandle(name) {
            if (!files.has(name)) throw notFound();
            return {
              kind: 'file',
              name,
              async getFile() {
                const bytes = encoder.encode(files.get(name));
                return {
                  name,
                  size: bytes.byteLength,
                  async arrayBuffer() { return bytes.slice().buffer; }
                };
              }
            };
          },
          async getDirectoryHandle() { throw notFound(); }
        };
        globalThis.__dsl4DirectoryPickerCalls = 0;
        globalThis.__dsl4SavePickerCalls = 0;
        globalThis.__dsl4SavedDistribution = null;
        globalThis.showDirectoryPicker = async () => {
          globalThis.__dsl4DirectoryPickerCalls += 1;
          return root;
        };
        globalThis.showSaveFilePicker = () => {
          globalThis.__dsl4SavePickerCalls += 1;
          return Promise.resolve({
            kind: 'file',
            name: 'story.sb3',
            async createWritable() {
              return {
                async write(bytes) {
                  globalThis.__dsl4SavedDistribution = new Uint8Array(bytes);
                },
                async close() {}
              };
            }
          });
        };
        return true;
      })()`);
      await waitForEvaluation(
        client,
        `document.querySelector('[data-dsl4-title-controls=true]')?.style.display === 'block'`,
        'browser build release title',
      );
      await click(client, '[data-dsl4-title-action=close]');
      await waitForEvaluation(
        client,
        `document.querySelector('[data-dsl4-application-menu=true]')?.style.display === 'block'`,
        'browser build application menu',
      );
      await click(client, '[data-dsl4-menu-action=open]');
      await waitForEvaluation(
        client,
        `Boolean(document.querySelector('[data-dsl4-source-choice=project]'))`,
        'browser project source chooser',
      );
      await click(client, '[data-dsl4-source-choice=project]');
      await waitForEvaluation(
        client,
        `(() => {
          const button = document.querySelector('[data-dsl4-menu-action=build]');
          return document.querySelector('[data-dsl4-application-menu=true]')?.style.display === 'block' &&
            button?.hidden === false && button?.disabled === false;
        })()`,
        'enabled browser distribution build action',
      );
      await click(client, '[data-dsl4-menu-action=build]');
      await waitForEvaluation(
        client,
        `globalThis.__dsl4SavedDistribution instanceof Uint8Array &&
          document.querySelector('[data-dsl4-application-menu=true]')?.style.display === 'block'`,
        'saved browser distribution SB3',
      );
      const built = await evaluateRecord(
        client,
        `(() => {
        const project = JSON.parse(globalThis.Scratch.vm.toJSON());
        return {
          directoryPickerCalls: globalThis.__dsl4DirectoryPickerCalls,
          savePickerCalls: globalThis.__dsl4SavePickerCalls,
          size: globalThis.__dsl4SavedDistribution.byteLength,
          currentMode: project.extensionStorage.kubohiroyakamishibai4.components
            .kubohiroyakamishibairuntime4.application.mode
        };
      })()`,
      );
      assert.equal(built.directoryPickerCalls, 1);
      assert.equal(built.savePickerCalls, 1);
      assert.ok(measurement(built, 'size') > 0);
      assert.equal(built.currentMode, 'menu', 'The authoring VM project must remain unchanged.');

      const loaded = await evaluateRecord(
        client,
        `(async () => {
        const directoryPickerCalls = globalThis.__dsl4DirectoryPickerCalls;
        const archive = globalThis.__dsl4SavedDistribution.slice().buffer;
        globalThis.showDirectoryPicker = async () => {
          globalThis.__dsl4DirectoryPickerCalls += 1;
          throw Object.assign(new Error('Fresh story must not open a directory'), {name: 'AbortError'});
        };
        const FreshVm = globalThis.Scratch.vm.constructor;
        const freshVm = new FreshVm();
        freshVm.setCompatibilityMode(false);
        freshVm.setTurboMode(false);
        freshVm.setCompilerOptions({enabled: false});
        freshVm.securityManager.canLoadExtensionFromProject = () => true;
        freshVm.securityManager.getSandboxMode = () => 'unsandboxed';
        await freshVm.loadProject(archive);
        const project = JSON.parse(freshVm.toJSON());
        globalThis.__dsl4FreshVm = freshVm;
        return {
          directoryPickerCalls,
          targetCount: freshVm.runtime.targets.length,
          mode: project.extensionStorage.kubohiroyakamishibai4.components
            .kubohiroyakamishibairuntime4.application.mode
        };
      })()`,
      );
      assert.equal(loaded.mode, 'story');
      assert.ok(measurement(loaded, 'targetCount') > 0);
      const fresh = await evaluateRecord(
        client,
        `(() => {
        return {
          directoryPickerCalls: globalThis.__dsl4DirectoryPickerCalls,
          extensionLoaded: Boolean(
            globalThis.__dsl4FreshVm.runtime._primitives
              .kubohiroyakamishibai4_kubohiroyakamishibairuntime4__statusReporter
          )
        };
      })()`,
      );
      assert.equal(fresh.directoryPickerCalls, loaded.directoryPickerCalls);
      assert.equal(fresh.extensionLoaded, true);
      assert.deepEqual(client.exceptions, []);
    } finally {
      client?.close();
      await stopChrome(chrome);
      await new Promise((resolve) => server.close(resolve));
      await Promise.all([
        rm(profileDirectory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100}),
        rm(fixtureDirectory, {recursive: true, force: true}),
      ]);
    }
  },
);

test(
  'shows concrete project-folder diagnostics on screen and returns to the application menu',
  {timeout: 90_000},
  async () => {
    const chromeExecutable = await resolveChromeExecutable();
    const profileDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-diagnostic-chromium-'));
    const fixtureDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-diagnostic-package-'));
    const sourceDirectory = path.join(fixtureDirectory, 'source');
    const sourceFiles = await createDsl4ReleaseSourceFiles();
    await Promise.all(
      [...sourceFiles].map(async ([relativePath, bytes]) => {
        const filename = path.join(sourceDirectory, relativePath);
        await mkdir(path.dirname(filename), {recursive: true});
        await writeFile(filename, bytes);
      }),
    );
    const release = await createKamishibaiSb3({sourceDirectory});
    const loadedProject = await TurboWarpPackager.loadProject(release.archive);
    const packager = new TurboWarpPackager.Packager();
    packager.project = loadedProject;
    excludeEmbeddedProjectExtensionsFromPackagerPreload(packager);
    packager.options.autoplay = true;
    packager.options.app.title = 'DSL 4.0 project diagnostic E2E';
    const packaged = await packager.package();
    assert.equal(packaged.type, 'text/html');
    await writeFile(path.join(fixtureDirectory, 'index.html'), packaged.data);
    const {server, url} = await startFixtureServer('/index.html', fixtureDirectory);
    const chrome = spawn(
      chromeExecutable,
      [
        '--headless=new',
        '--disable-background-networking',
        '--disable-dev-shm-usage',
        '--use-angle=swiftshader',
        '--no-first-run',
        '--no-sandbox',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        url,
      ],
      {stdio: ['ignore', 'pipe', 'pipe']},
    );
    let client: CdpClient | null = null;
    try {
      const browserWebSocketUrl = await waitForDevTools(chrome);
      const pageWebSocketUrl = await waitForPageTarget(browserWebSocketUrl, url);
      client = await CdpClient.connect(pageWebSocketUrl);
      await client.send('Runtime.enable');
      await waitForEvaluation(client, 'Boolean(globalThis.Scratch?.vm)', 'packaged TurboWarp VM');
      await client.evaluate(`(() => {
        const encoder = new TextEncoder();
        const manifest = 'formatVersion: 1\\nmode: external\\nsourceId: main\\npath: story.kamishibai.yaml\\n';
        const cases = [
          new Map([
            ['project.source.yaml', manifest],
            ['story.kamishibai.yaml', "kamishibai: '4.0'\\ncontrols:\\n  keymaps:\\n    production:\\n      Space: navigation.nextAction\\nscenes:\\n  opening:\\n    - wait: 0.05\\n"]
          ]),
          new Map(),
          new Map([
            ['project.source.yaml', manifest],
            ['story.kamishibai.yaml', "kamishibai: '4.0'\\nscenes:\\n  opening: [\\n"]
          ]),
          new Map([['project.source.yaml', manifest]]),
          new Map([
            ['project.source.yaml', manifest],
            ['story.kamishibai.yaml', "kamishibai: '4.0'\\nunknownField: true\\nscenes: {}\\n"]
          ]),
          new Map([
            ['project.source.yaml', manifest],
            ['story.kamishibai.yaml', "kamishibai: '4.0'\\nassets:\\n  Extra:\\n    kind: image\\n    file: assets/missing-extra-image-with-a-very-long-name.svg\\nscenes:\\n  opening: []\\n"]
          ])
        ];
        const notFound = () => new DOMException('Entry not found', 'NotFoundError');
        function root(files, index) {
          function fileHandle(name) {
            return {
              kind: 'file',
              name,
              async getFile() {
                const bytes = encoder.encode(files.get(name));
                return {
                  name,
                  size: bytes.byteLength,
                  async arrayBuffer() { return bytes.slice().buffer; }
                };
              }
            };
          }
          return {
            kind: 'directory',
            name: 'invalid-project-' + index,
            async queryPermission() { return 'granted'; },
            async requestPermission() { return 'granted'; },
            async getFileHandle(name) {
              if (!files.has(name)) throw notFound();
              return fileHandle(name);
            },
            async *entries() {
              for (const name of files.keys()) yield [name, fileHandle(name)];
            },
            async getDirectoryHandle() { throw notFound(); }
          };
        }
        globalThis.__dsl4DiagnosticRoots = cases.map(root);
        globalThis.__dsl4DiagnosticPickerCalls = 0;
        globalThis.showDirectoryPicker = async () => {
          const index = globalThis.__dsl4DiagnosticPickerCalls++;
          return globalThis.__dsl4DiagnosticRoots[index];
        };
        return true;
      })()`);
      await waitForEvaluation(
        client,
        `document.querySelector('[data-dsl4-title-controls=true]')?.style.display === 'block'`,
        'diagnostic release title',
      );
      await click(client, '[data-dsl4-title-action=close]');
      await waitForEvaluation(
        client,
        `document.querySelector('[data-dsl4-application-menu=true]')?.style.display === 'block'`,
        'diagnostic application menu',
      );

      await click(client, '[data-dsl4-menu-action=open]');
      await waitForEvaluation(
        client,
        `document.querySelector('[data-dsl4-source-chooser=true]')?.style.display === 'flex'`,
        'valid project source chooser',
      );
      await click(client, '[data-dsl4-source-choice=project]');
      await waitForEvaluation(
        client,
        `document.querySelector('[data-dsl4-application-menu=true]')?.style.display === 'block' &&
          document.querySelector('[data-dsl4-menu-action=reload]')?.disabled === false`,
        'menu after the valid project finished',
      );

      const cases = [
        {
          code: 'K4-SOURCE-MISSING',
          message: /no \.k4\.yml entry source/u,
          source: '*.k4.yml',
        },
        {
          code: /^K4-YAML/u,
          message: /flow sequence|YAML|end/u,
          source: 'story.kamishibai.yaml',
          position: true,
        },
        {
          code: 'K4-SOURCE-MISSING',
          message: /story\.kamishibai\.yaml/u,
          source: 'story.kamishibai.yaml',
        },
        {
          code: /^K4-SCHEMA/u,
          message: /additional propert/u,
          source: 'story.kamishibai.yaml',
          position: true,
          excerpt: true,
        },
        {
          code: 'K4-ASSET-MISSING',
          message: /assets\/missing-extra-image-with-a-very-long-name\.svg/u,
          source: 'assets/missing-extra-image-with-a-very-long-name.svg',
          path: /assets.*Extra.*file/u,
        },
      ];

      for (const [index, expectation] of cases.entries()) {
        await click(client, '[data-dsl4-menu-action=open]');
        await waitForEvaluation(
          client,
          `document.querySelector('[data-dsl4-source-chooser=true]')?.style.display === 'flex'`,
          `project source chooser ${index + 1}`,
        );
        await click(client, '[data-dsl4-source-choice=project]');
        await waitForEvaluation(
          client,
          `document.querySelector('[data-dsl4-runtime-error=true]')?.style.display === 'flex'`,
          `visible project diagnostic ${index + 1}`,
        );
        const diagnostic = await evaluateRecord(
          client,
          `(() => {
          const text = (selector) => document.querySelector(selector)?.textContent ?? '';
          const message = document.querySelector('[data-dsl4-runtime-error-message=true]');
          const content = message?.parentElement;
          return {
            code: text('[data-dsl4-runtime-error-code=true]'),
            message: text('[data-dsl4-runtime-error-originalMessage=true]'),
            explanation: text('[data-dsl4-runtime-error-message=true]'),
            recovery: text('[data-dsl4-runtime-error-recovery=true]'),
            source: text('[data-dsl4-runtime-error-source=true]'),
            location: text('[data-dsl4-runtime-error-location=true]'),
            path: text('[data-dsl4-runtime-error-path=true]'),
            excerpt: text('[data-dsl4-runtime-error-excerpt=true]'),
            action: text('[data-dsl4-runtime-error-action=menu]'),
            messageOverflowWrap: message ? getComputedStyle(message).overflowWrap : '',
            contentOverflowY: content ? getComputedStyle(content).overflowY : '',
            menuHidden:
              document.querySelector('[data-dsl4-application-menu=true]')?.style.display === 'none'
          };
        })()`,
        );
        if (typeof expectation.code === 'string') assert.equal(diagnostic.code, expectation.code);
        else assert.match(requireString(diagnostic.code, 'the diagnostic code'), expectation.code);
        assert.match(
          requireString(diagnostic.message, 'the diagnostic message'),
          expectation.message,
        );
        assert.notEqual(diagnostic.explanation, '');
        assert.notEqual(diagnostic.recovery, '');
        assert.equal(diagnostic.source, expectation.source);
        if (expectation.position)
          assert.match(requireString(diagnostic.location, 'the evaluated location'), /^\d+:\d+$/u);
        if (expectation.path) {
          assert.match(requireString(diagnostic.path, 'the diagnostic path'), expectation.path);
        }
        if (expectation.excerpt) assert.notEqual(diagnostic.excerpt, '');
        assert.match(
          requireString(diagnostic.action, 'the evaluated action'),
          /Back to menu|メニューに戻る/u,
        );
        assert.equal(diagnostic.messageOverflowWrap, 'anywhere');
        assert.equal(diagnostic.contentOverflowY, 'auto');
        assert.equal(diagnostic.menuHidden, true);

        await click(client, '[data-dsl4-runtime-error-action=menu]');
        await waitForEvaluation(
          client,
          `document.querySelector('[data-dsl4-application-menu=true]')?.style.display === 'block' &&
            !document.querySelector('[data-dsl4-runtime-error=true]')`,
          `return to application menu ${index + 1}`,
        );
      }
      assert.equal(
        await client.evaluate('globalThis.__dsl4DiagnosticPickerCalls'),
        cases.length + 1,
      );
      assert.deepEqual(client.exceptions, []);
    } finally {
      client?.close();
      await stopChrome(chrome);
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      await Promise.all([
        rm(profileDirectory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100}),
        rm(fixtureDirectory, {recursive: true, force: true}),
      ]);
    }
  },
);

function createLocalPreviewRuntimeProtocol() {
  const liveReload = createDsl4LiveReloadSession({
    createSession({storyDocument}) {
      const scenes = requireArray(storyDocument.scenes, 'the story scenes');
      const openingScene = requireRecord(scenes[0], 'its first scene');
      const actions = requireArray(openingScene.actions, 'its actions');
      const firstAction = actions[0] === undefined ? null : requireRecord(actions[0], 'its action');
      let state: Record<string, unknown> = {
        status: 'idle',
        sceneId: openingScene.id,
        actionIndex: 0,
        actionPath: firstAction?.id ?? null,
        variables: requireRecord(storyDocument.variables ?? {}, 'the story variables'),
      };
      let quiesceToken: Readonly<Record<string, unknown>> | null = null;
      return {
        start() {
          state = {...state, status: 'running'};
          return Promise.resolve(state);
        },
        stop() {
          state = {...state, status: 'stopped'};
          quiesceToken = null;
        },
        dispose() {},
        getState() {
          return {runtime: state};
        },
        quiesce({candidateId}) {
          quiesceToken = Object.freeze({
            kind: 'Dsl4QuiesceToken',
            version: 1,
            candidateId,
            runtimeGeneration: 1,
            storyPath: firstAction?.id ?? `/scenes/${state.sceneId}`,
            actionSignature: firstAction
              ? {
                  command: firstAction.command,
                  target: firstAction.target,
                  handler: firstAction.handler ?? 'core',
                }
              : null,
            sceneId: state.sceneId,
            actionIndex: 0,
            variables: {...requireRecord(state.variables, 'the runtime variables')},
            resumeMode: firstAction ? 'replay-action' : 'finished',
          });
          state = {...state, status: 'paused'};
          return quiesceToken;
        },
        resumeQuiesce(candidateId) {
          if (!quiesceToken || quiesceToken.candidateId !== candidateId) {
            throw new TypeError('stale quiesce candidate');
          }
          quiesceToken = null;
          state = {...state, status: 'running'};
          return state;
        },
      };
    },
  });
  return {
    liveReload,
    protocol: createDsl4PreviewProtocolSession({liveReloadSession: liveReload}),
  };
}

test(
  'runs Web Preview reload UX through real Chromium DOM, pointer, keyboard, and viewport events',
  {timeout: 30_000},
  async () => {
    const chromeExecutable = await resolveChromeExecutable();
    const profileDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-preview-chromium-'));
    const fixtureDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-preview-bundle-'));
    const fixtureHtml = await readFile(
      path.join(repositoryRoot, 'test/fixtures/dsl4/web-preview-browser.html'),
      'utf8',
    );
    const bundle = await buildDsl4TurboWarpBrowserBundle({
      entryPoint: path.join(repositoryRoot, 'test/fixtures/dsl4/web-preview-browser.mjs'),
    });
    await Promise.all([
      writeFile(
        path.join(fixtureDirectory, 'index.html'),
        fixtureHtml.replace('./web-preview-browser.mjs', './bundle.js'),
      ),
      writeFile(path.join(fixtureDirectory, 'bundle.js'), bundle),
    ]);
    const {server, url} = await startFixtureServer('/index.html', fixtureDirectory);
    const chrome = spawn(
      chromeExecutable,
      [
        '--headless=new',
        '--disable-background-networking',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-sandbox',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        url,
      ],
      {stdio: ['ignore', 'pipe', 'pipe']},
    );
    let client: CdpClient | null = null;
    try {
      const browserWebSocketUrl = await waitForDevTools(chrome);
      const pageWebSocketUrl = await waitForPageTarget(browserWebSocketUrl, url);
      client = await CdpClient.connect(pageWebSocketUrl);
      await client.send('Runtime.enable');
      await client.send('Page.enable');
      try {
        await waitForEvaluation(
          client,
          "document.querySelector('#fixture-ready')?.textContent === 'Browser fixture ready.'",
          'browser fixture startup',
        );
      } catch (error) {
        throw new Error(
          `${String(thrown(error).message)}\n${JSON.stringify({exceptions: client.exceptions})}`,
        );
      }

      await click(client, '#dsl4-web-preview-open-project');
      await waitForEvaluation(
        client,
        "globalThis.webPreviewFixture?.shell.getSnapshot().preview?.phase === 'running'",
        'initial source activation',
      );
      assert.equal(
        await client.evaluate(
          "document.querySelector('#dsl4-preview-reload-overlay')?.dataset.previewSurface",
        ),
        'web',
      );

      const initialIntegrity = await client.evaluate(
        'globalThis.webPreviewFixture.shell.getSnapshot().preview.currentIntegrity',
      );
      await click(client, '#fixture-save-valid');
      try {
        await waitForEvaluation(
          client,
          "globalThis.webPreviewFixture.shell.getSnapshot().reloadOverlay?.overlay.policy.status === 'reloaded'",
          'automatic reload acknowledgement',
        );
      } catch (error) {
        const state = await evaluateRecord(
          client,
          'globalThis.webPreviewFixture.shell.getSnapshot()',
        );
        throw new Error(
          `${String(thrown(error).message)}\n${JSON.stringify({state, exceptions: client.exceptions})}`,
        );
      }
      const reloaded = await evaluateRecord(
        client,
        'globalThis.webPreviewFixture.shell.getSnapshot()',
      );
      assert.notEqual(
        requireRecord(reloaded.preview, 'its preview state').currentIntegrity,
        initialIntegrity,
      );
      assert.equal(requireRecord(reloaded.reloadOverlay, 'its overlay state').globalRevision, 1);
      assert.equal(
        requireRecord(
          requireRecord(
            requireRecord(
              requireRecord(reloaded.reloadOverlay, 'its overlay state').overlay,
              'the overlay',
            ).policy,
            'its policy',
          ).lastSuccess,
          'its last success',
        ).actualAnchor,
        'action',
      );

      const statusPoint = requireRecord(
        await centerOf(client, '#dsl4-preview-reload-status-button'),
        'the status button center',
      );
      await client.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: measurement(statusPoint, 'x'),
        y: measurement(statusPoint, 'y'),
        button: 'left',
        buttons: 1,
        clickCount: 1,
      });
      const pointerState = await evaluateRecord(
        client,
        `({
      interaction: globalThis.webPreviewFixture.shell.getSnapshot().reloadOverlay.overlay.layout.interaction,
      activeElement: document.activeElement?.id,
      hit: document.elementFromPoint(${measurement(statusPoint, 'x')}, ${measurement(statusPoint, 'y')})?.id,
      point: ${JSON.stringify(statusPoint)},
      viewport: {width: innerWidth, height: innerHeight},
      rect: (() => { const rect = document.querySelector('#dsl4-preview-reload-status-button').getBoundingClientRect(); return {x: rect.x, y: rect.y, width: rect.width, height: rect.height}; })()
    })`,
      );
      assert.equal(
        requireRecord(pointerState.interaction, 'the overlay interaction').pointerCaptured,
        true,
        JSON.stringify(pointerState),
      );
      await client.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: measurement(statusPoint, 'x'),
        y: measurement(statusPoint, 'y'),
        button: 'left',
        buttons: 0,
        clickCount: 1,
      });
      await waitForEvaluation(
        client,
        'globalThis.webPreviewFixture.shell.getSnapshot().reloadOverlay.overlay.policy.dialog.open',
        'reload dialog opening',
      );
      await pressKey(client, {key: '2', code: 'Digit2', windowsVirtualKeyCode: 50});
      await waitForEvaluation(
        client,
        "globalThis.webPreviewFixture.shell.getSnapshot().reloadOverlay.overlay.policy.dialog.step === 'scope'",
        'keyboard position selection',
      );
      await pressKey(client, {key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
      await waitForEvaluation(
        client,
        '!globalThis.webPreviewFixture.shell.getSnapshot().reloadOverlay.overlay.policy.dialog.open',
        'dialog cancellation',
      );

      const initialViewport = await evaluateRecord(
        client,
        'globalThis.webPreviewFixture.shell.getSnapshot().reloadOverlay.overlay.layout.viewport',
      );
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: 520,
        height: 360,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await waitForEvaluation(client, 'innerWidth === 520', 'Chromium viewport override');
      const resizedViewport = await evaluateRecord(
        client,
        `({
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight
      })`,
      );
      assert.ok(measurement(resizedViewport, 'width') < measurement(initialViewport, 'width'));
      assert.ok(measurement(resizedViewport, 'height') < measurement(initialViewport, 'height'));
      await client.evaluate("window.dispatchEvent(new Event('resize'))");
      await waitForEvaluation(
        client,
        `(() => {
          const viewport = globalThis.webPreviewFixture.shell.getSnapshot().reloadOverlay.overlay.layout.viewport;
          return viewport.width === ${measurement(resizedViewport, 'width')} && viewport.height === ${measurement(resizedViewport, 'height')};
        })()`,
        'viewport resize layout',
      );

      const knownGoodIntegrity = requireRecord(
        reloaded.preview,
        'its preview state',
      ).currentIntegrity;
      await click(client, '#fixture-save-invalid');
      await waitForEvaluation(
        client,
        "globalThis.webPreviewFixture.shell.getSnapshot().reloadOverlay?.overlay.policy.status === 'diagnostic'",
        'invalid source diagnostic',
      );
      const invalid = await evaluateRecord(
        client,
        'globalThis.webPreviewFixture.shell.getSnapshot()',
      );
      assert.equal(
        requireRecord(invalid.preview, 'its preview state').currentIntegrity,
        knownGoodIntegrity,
      );
      assert.equal(requireRecord(invalid.preview, 'its preview state').validationStatus, 'invalid');

      await click(client, '#fixture-restore-source');
      await waitForEvaluation(
        client,
        "globalThis.webPreviewFixture.shell.getSnapshot().reloadOverlay?.globalRevision === 2 && globalThis.webPreviewFixture.shell.getSnapshot().reloadOverlay.overlay.policy.status === 'reloaded'",
        'valid source recovery reload',
      );
      const touchPoint = requireRecord(
        await centerOf(client, '#fixture-ready'),
        'the fixture center',
      );
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          {
            x: measurement(touchPoint, 'x'),
            y: measurement(touchPoint, 'y'),
            radiusX: 1,
            radiusY: 1,
            force: 1,
          },
        ],
      });
      await client.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      await waitForEvaluation(
        client,
        'globalThis.webPreviewFixture.shell.getSnapshot().reloadOverlay.overlay.policy.lastSuccess.acknowledged',
        'touch acknowledgement',
      );
      assert.deepEqual(client.exceptions, []);
    } finally {
      client?.close();
      await stopChrome(chrome);
      await new Promise((resolve) => server.close(resolve));
      await Promise.all([
        rm(profileDirectory, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 100,
        }),
        rm(fixtureDirectory, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 100,
        }),
      ]);
    }
  },
);

test(
  'bounds TM classifier, PoseNet, and JavaScript heap across repeated scene retention',
  {timeout: 30_000},
  async () => {
    const chromeExecutable = await resolveChromeExecutable();
    const profileDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-pose-memory-chromium-'));
    const {server, url} = await startFixtureServer(
      '/test/fixtures/dsl4/browser/pose-memory-retention.html',
    );
    const chrome = spawn(
      chromeExecutable,
      [
        '--headless=new',
        '--disable-background-networking',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--enable-precise-memory-info',
        '--no-first-run',
        '--no-sandbox',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        url,
      ],
      {stdio: ['ignore', 'pipe', 'pipe']},
    );
    let client: CdpClient | null = null;
    try {
      const browserWebSocketUrl = await waitForDevTools(chrome);
      const pageWebSocketUrl = await waitForPageTarget(browserWebSocketUrl, url);
      client = await CdpClient.connect(pageWebSocketUrl);
      await client.send('Runtime.enable');
      try {
        await waitForEvaluation(
          client,
          'globalThis.poseMemoryFixture !== undefined',
          'pose memory fixture completion',
        );
      } catch (error) {
        const page = await evaluateRecord(
          client,
          `({
          status: document.querySelector('#status')?.textContent,
          result: document.querySelector('#result')?.textContent
        })`,
        );
        throw new Error(
          `${String(thrown(error).message)}\n${JSON.stringify({page, exceptions: client.exceptions})}`,
        );
      }
      const fixture = await evaluateRecord(client, 'globalThis.poseMemoryFixture');
      assert.equal(fixture.passed, true, String(fixture.error));
      const observed = await evaluateRecord(client, 'globalThis.poseMemoryFixture.observed');
      assert.equal(observed.backend, 'instrumented-disposable-browser-backend');
      assert.equal(observed.visits, 24);
      assert.deepEqual(observed.logicalMemory, {
        numTensors: 0,
        numBytes: 0,
        unreliable: false,
      });
      assert.equal(observed.maximumTensors, 20);
      assert.equal(observed.classifierDisposals, 24);
      assert.equal(observed.poseNetDisposals, 24);

      await client.send('HeapProfiler.enable');
      await client.send('HeapProfiler.collectGarbage');
      const afterGcHeapBytes = requireNumber(
        await client.evaluate('performance.memory.usedJSHeapSize'),
        'the post-GC heap size',
      );
      assert.ok(
        afterGcHeapBytes <= measurement(observed, 'baselineHeapBytes') + 8 * 1024 * 1024,
        JSON.stringify({...observed, afterGcHeapBytes}),
      );
      assert.deepEqual(client.exceptions, []);
    } finally {
      client?.close();
      await stopChrome(chrome);
      await new Promise((resolve) => server.close(resolve));
      await rm(profileDirectory, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  },
);

test(
  'runs the loopback CLI preview page through the shared overlay in real Chromium',
  {timeout: 30_000},
  async () => {
    const chromeExecutable = await resolveChromeExecutable();
    const profileDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-local-preview-chromium-'));
    const projectDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-local-preview-project-'));
    const sourceManifestPath = path.join(projectDirectory, 'project.source.json');
    const sourceFilename = 'preview.k4.yml';
    const sourcePath = path.join(projectDirectory, sourceFilename);
    const manifest = {formatVersion: 1, mode: 'external', sourceId: 'main', path: sourceFilename};
    await Promise.all([
      writeFile(sourceManifestPath, `${JSON.stringify(manifest)}\n`),
      writeFile(sourcePath, "kamishibai: '4.0'\nscenes:\n  opening: []\n"),
    ]);
    const schema = JSON.parse(
      await readFile(path.join(repositoryRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
    );
    const runtime = createLocalPreviewRuntimeProtocol();
    const hostEvents: Readonly<Record<string, unknown>>[] = [];
    const host = createDsl4LocalPreviewHost({
      projectRoot: projectDirectory,
      sourceManifestPath,
      sourceManifest: manifest,
      sourceFrontend: createDsl4ProductionSourceFrontend(schema),
      maxSourceBytes: 4096,
      protocolSession: runtime.protocol,
      onEvent: (event) => hostEvents.push(event),
    });
    await host.start();
    const url = host.getLaunchUrl();
    const chrome = spawn(
      chromeExecutable,
      [
        '--headless=new',
        '--disable-background-networking',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-sandbox',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        url,
      ],
      {stdio: ['ignore', 'pipe', 'pipe']},
    );
    let client: CdpClient | null = null;
    try {
      const browserWebSocketUrl = await waitForDevTools(chrome);
      const pageWebSocketUrl = await waitForPageTarget(browserWebSocketUrl, url);
      client = await CdpClient.connect(pageWebSocketUrl);
      await client.send('Runtime.enable');
      try {
        await waitForEvaluation(
          client,
          "document.querySelector('#dsl4-preview-status')?.dataset.validationStatus === 'valid'",
          'local preview initial source activation',
        );
      } catch (error) {
        const page = await evaluateRecord(
          client,
          `({
          status: document.querySelector('#dsl4-preview-status')?.textContent,
          validationStatus: document.querySelector('#dsl4-preview-status')?.dataset.validationStatus,
          current: document.querySelector('[data-summary-value=currentIntegrity]')?.textContent,
          candidate: document.querySelector('[data-summary-value=candidateIntegrity]')?.textContent,
          reload: document.querySelector('#dsl4-preview-reload-status-button')?.dataset.reloadState,
          body: document.body.textContent
        })`,
        );
        throw new Error(
          `${String(thrown(error).message)}\n${JSON.stringify({page, host: host.getSnapshot(), hostEvents, exceptions: client.exceptions})}`,
        );
      }
      assert.equal(
        await client.evaluate(
          "document.querySelector('#dsl4-preview-reload-overlay')?.dataset.previewSurface",
        ),
        'cli',
      );
      assert.equal(host.getSnapshot().status, 'connected');
      assert.equal(
        await client.evaluate("document.querySelector('[data-summary-value=source]')?.textContent"),
        sourceFilename,
      );
      const initialIntegrity = await client.evaluate(
        "document.querySelector('[data-summary-value=currentIntegrity]')?.textContent",
      );

      await writeFile(sourcePath, "kamishibai: '4.0'\nscenes:\n  opening:\n    - wait: 60\n");
      try {
        await waitForEvaluation(
          client,
          "document.querySelector('#dsl4-preview-reload-status-button')?.dataset.reloadState === 'reloaded'",
          'local preview automatic reload',
        );
      } catch (error) {
        const page = await evaluateRecord(
          client,
          `({
          status: document.querySelector('#dsl4-preview-status')?.textContent,
          current: document.querySelector('[data-summary-value=currentIntegrity]')?.textContent,
          candidate: document.querySelector('[data-summary-value=candidateIntegrity]')?.textContent,
          reload: document.querySelector('#dsl4-preview-reload-status-button')?.dataset.reloadState,
          body: document.body.textContent
        })`,
        );
        throw new Error(
          `${String(thrown(error).message)}\n${JSON.stringify({page, host: host.getSnapshot(), hostEvents, exceptions: client.exceptions})}`,
        );
      }
      const reloadedIntegrity = await client.evaluate(
        "document.querySelector('[data-summary-value=currentIntegrity]')?.textContent",
      );
      assert.notEqual(reloadedIntegrity, initialIntegrity);

      await writeFile(sourcePath, "kamishibai: '4.0'\nscenes: {}\n");
      await waitForEvaluation(
        client,
        "document.querySelector('#dsl4-preview-status')?.dataset.validationStatus === 'invalid'",
        'local preview invalid diagnostic',
      );
      assert.equal(
        await client.evaluate(
          "document.querySelector('[data-summary-value=currentIntegrity]')?.textContent",
        ),
        reloadedIntegrity,
      );
      assert.equal(
        await client.evaluate(
          "document.querySelector('#dsl4-preview-reload-status-button')?.dataset.reloadState",
        ),
        'diagnostic',
      );

      await writeFile(sourcePath, "kamishibai: '4.0'\nscenes:\n  opening:\n    - wait: 30\n");
      try {
        await waitForEvaluation(
          client,
          `document.querySelector('[data-summary-value=currentIntegrity]')?.textContent !== ${JSON.stringify(reloadedIntegrity)}`,
          'local preview recovery reload',
        );
      } catch (error) {
        const page = await evaluateRecord(
          client,
          `({
          status: document.querySelector('#dsl4-preview-status')?.textContent,
          current: document.querySelector('[data-summary-value=currentIntegrity]')?.textContent,
          candidate: document.querySelector('[data-summary-value=candidateIntegrity]')?.textContent,
          reload: document.querySelector('#dsl4-preview-reload-status-button')?.dataset.reloadState,
          body: document.body.textContent
        })`,
        );
        throw new Error(
          `${String(thrown(error).message)}\n${JSON.stringify({page, host: host.getSnapshot(), hostEvents, exceptions: client.exceptions})}`,
        );
      }

      await writeFile(
        sourceManifestPath,
        `${JSON.stringify({...manifest, path: 'alternate.k4.yaml'})}\n`,
      );
      await waitForEvaluation(
        client,
        "document.querySelector('#dsl4-preview-reload-status-button')?.dataset.reloadState === 'diagnostic'",
        'local preview structural rebuild diagnostic',
      );
      await waitForEvaluation(
        client,
        'document.body.textContent.includes("full rebuild")',
        'local preview full rebuild message',
      );
      assert.equal(host.getSnapshot().rebuildRequired, true);
      assert.equal(await client.evaluate('location.hash'), '');
      assert.deepEqual(client.exceptions, []);
    } finally {
      client?.close();
      await stopChrome(chrome);
      await host.dispose();
      await runtime.liveReload.dispose();
      await Promise.all([
        rm(profileDirectory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100}),
        rm(projectDirectory, {recursive: true, force: true}),
      ]);
    }
  },
);

test(
  'runs the browser-owned TurboWarp stage and source reload lifecycle in real Chromium',
  {timeout: 60_000},
  async () => {
    const chromeExecutable = await resolveChromeExecutable();
    const profileDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-browser-runtime-chromium-'));
    const projectDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-browser-runtime-project-'));
    const sourceManifestPath = path.join(projectDirectory, 'project.source.json');
    const sourceFilename = 'story.k4.yml';
    const sourcePath = path.join(projectDirectory, sourceFilename);
    const manifest = {formatVersion: 1, mode: 'external', sourceId: 'main', path: sourceFilename};
    const initialSource =
      "kamishibai: '4.0'\ncontrols:\n  keymaps:\n    production:\n      Space: navigation.nextAction\nscenes:\n  opening: []\n";
    await Promise.all([
      writeFile(sourceManifestPath, `${JSON.stringify(manifest)}\n`),
      writeFile(sourcePath, initialSource),
    ]);
    const schema = JSON.parse(
      await readFile(path.join(repositoryRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
    );
    const sourceFrontend = createDsl4ProductionSourceFrontend(schema);
    const limits = {
      maxSourceBytes: 64 * 1024,
      maxAssetFiles: 64,
      maxTotalAssetBytes: 64 * 1024 * 1024,
    };
    const parsed = sourceFrontend.parse(initialSource, {sourceId: 'main'});
    assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
    const sourceDescriptor = await createDsl4EmbeddedSourceDescriptor(initialSource, {
      sourceId: 'main',
      displayName: sourceFilename,
      maxSourceBytes: limits.maxSourceBytes,
      subtleCrypto: webcrypto.subtle,
    });
    const artifact = await createDsl4RuntimeArtifactDescriptor(
      parsed.storyDocument,
      sourceDescriptor,
      'production',
      {maxSourceBytes: limits.maxSourceBytes, subtleCrypto: webcrypto.subtle},
    );
    assert.equal(artifact.ok, true, JSON.stringify(artifact.diagnostics));
    const assets = await createDsl4EmbeddedAssetBundle(
      parsed.storyDocument,
      {
        manifest: {formatVersion: 1, assets: []},
        getFile: () => new Uint8Array(),
      },
      {
        maxFiles: limits.maxAssetFiles,
        maxTotalBytes: limits.maxTotalAssetBytes,
        subtleCrypto: webcrypto.subtle,
      },
    );
    const backdropAssetId = '00000000000000000000000000000000';
    const backdropFilename = `${backdropAssetId}.svg`;
    const project = await installDsl4PackagedRuntimeComponent(
      {
        extensionStorage: {},
        targets: [
          {
            isStage: true,
            name: 'Stage',
            variables: createPoseFeedbackVariables(),
            lists: {},
            broadcasts: {},
            blocks: {},
            comments: {},
            currentCostume: 0,
            costumes: [
              {
                name: 'backdrop1',
                assetId: backdropAssetId,
                dataFormat: 'svg',
                md5ext: backdropFilename,
                rotationCenterX: 240,
                rotationCenterY: 180,
              },
            ],
            sounds: [],
            volume: 100,
            layerOrder: 0,
            tempo: 60,
            videoTransparency: 50,
            videoState: 'on',
            textToSpeechLanguage: null,
          },
        ],
        monitors: createPoseFeedbackMonitors(),
        extensions: [],
        meta: {semver: '3.0.0'},
      },
      parsed.storyDocument,
      sourceDescriptor,
      okResult(artifact, 'the runtime artifact').artifact,
      assets,
      {channel: 'unbundled', ...limits, subtleCrypto: webcrypto.subtle},
    );
    const projectBytes = new Uint8Array(
      zipSync({
        'project.json': strToU8(`${JSON.stringify(project)}\n`),
        [backdropFilename]: strToU8(
          '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>',
        ),
      }),
    );
    const browserBundleBytes = await buildDsl4TurboWarpBrowserBundle({
      entryPoint: path.join(repositoryRoot, 'dist/builder/dsl4-local-preview-browser-entry.js'),
    });
    const hostErrors: string[] = [];
    const host = createDsl4LocalPreviewHost({
      projectRoot: projectDirectory,
      sourceManifestPath,
      sourceManifest: manifest,
      sourceFrontend,
      maxSourceBytes: limits.maxSourceBytes,
      runtimeOwner: 'browser',
      projectBytes,
      browserBundleBytes,
      onError: (error: unknown) => hostErrors.push(String(thrown(error).stack ?? error)),
    });
    await host.start();
    const url = host.getLaunchUrl();
    const chrome = spawn(
      chromeExecutable,
      [
        '--headless=new',
        '--disable-background-networking',
        '--disable-dev-shm-usage',
        '--use-angle=swiftshader',
        '--no-first-run',
        '--no-sandbox',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        url,
      ],
      {stdio: ['ignore', 'pipe', 'pipe']},
    );
    let client: CdpClient | null = null;
    try {
      const browserWebSocketUrl = await waitForDevTools(chrome);
      const pageWebSocketUrl = await waitForPageTarget(browserWebSocketUrl, url);
      client = await CdpClient.connect(pageWebSocketUrl);
      await client.send('Runtime.enable');
      try {
        await waitForEvaluation(
          client,
          "document.querySelector('#dsl4-preview-status')?.dataset.validationStatus === 'valid' && document.querySelector('canvas[data-dsl4-turbo-warp-stage=true]')",
          'browser-owned initial stage activation',
        );
      } catch (error) {
        const page = await evaluateRecord(
          client,
          `({body: document.body.textContent, html: document.body.innerHTML})`,
        );
        throw new Error(
          `${String(thrown(error).message)}\n${JSON.stringify({page, host: host.getSnapshot(), hostErrors, exceptions: client.exceptions})}`,
        );
      }
      assert.equal(host.getSnapshot().status, 'connected');
      assert.equal(host.getSnapshot().browserRuntimeReady, true);
      assert.equal(await client.evaluate('location.hash'), '');
      assert.equal(
        await client.evaluate(
          "document.querySelector('#dsl4-local-preview-runtime > p[role=alert]')?.textContent ?? ''",
        ),
        '',
      );
      assert.equal(
        await client.evaluate(
          "document.querySelectorAll('canvas[data-dsl4-turbo-warp-stage=true]').length",
        ),
        1,
      );
      const initialIntegrity = await client.evaluate(
        "document.querySelector('[data-summary-value=currentIntegrity]')?.textContent",
      );

      await writeFile(
        sourcePath,
        "kamishibai: '4.0'\ncontrols:\n  keymaps:\n    production:\n      Space: navigation.nextAction\nscenes:\n  opening:\n    - wait: 60\n",
      );
      try {
        await waitForEvaluation(
          client,
          `document.querySelector('[data-summary-value=currentIntegrity]')?.textContent !== ${JSON.stringify(initialIntegrity)}`,
          'browser-owned committed reload',
        );
      } catch (error) {
        const page = await evaluateRecord(
          client,
          `({
          status: document.querySelector('#dsl4-preview-status')?.textContent,
          current: document.querySelector('[data-summary-value=currentIntegrity]')?.textContent,
          candidate: document.querySelector('[data-summary-value=candidateIntegrity]')?.textContent,
          reload: document.querySelector('#dsl4-preview-reload-status-button')?.dataset.reloadState,
          body: document.body.textContent
        })`,
        );
        throw new Error(
          `${String(thrown(error).message)}\n${JSON.stringify({page, host: host.getSnapshot(), hostErrors, exceptions: client.exceptions})}`,
        );
      }
      const reloadedIntegrity = await client.evaluate(
        "document.querySelector('[data-summary-value=currentIntegrity]')?.textContent",
      );
      assert.notEqual(reloadedIntegrity, initialIntegrity);

      await writeFile(
        sourcePath,
        "kamishibai: '4.0'\ncontrols:\n  keymaps:\n    production:\n      Space: navigation.nextAction\nscenes: {}\n",
      );
      await waitForEvaluation(
        client,
        "document.querySelector('#dsl4-preview-status')?.dataset.validationStatus === 'invalid'",
        'browser-owned invalid source diagnostic',
      );
      assert.equal(
        await client.evaluate(
          "document.querySelector('[data-summary-value=currentIntegrity]')?.textContent",
        ),
        reloadedIntegrity,
      );

      await writeFile(
        sourcePath,
        "kamishibai: '4.0'\ncontrols:\n  keymaps:\n    production:\n      Space: navigation.nextAction\nscenes:\n  opening:\n    - wait: 30\n",
      );
      await waitForEvaluation(
        client,
        `document.querySelector('[data-summary-value=currentIntegrity]')?.textContent !== ${JSON.stringify(reloadedIntegrity)}`,
        'browser-owned recovery reload',
      );
      assert.deepEqual(client.exceptions, []);

      await client.send('Page.navigate', {url: 'about:blank'});
      const disconnectDeadline = Date.now() + 10_000;
      while (Date.now() < disconnectDeadline && host.getSnapshot().status !== 'listening') {
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      assert.equal(host.getSnapshot().status, 'listening');
      assert.equal(host.getSnapshot().browserRuntimeReady, false);
      assert.deepEqual(hostErrors, []);
    } finally {
      client?.close();
      await stopChrome(chrome);
      await host.dispose();
      await Promise.all([
        rm(profileDirectory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100}),
        rm(projectDirectory, {recursive: true, force: true}),
      ]);
    }
  },
);

test(
  'runs the bundled public preview command through runtime-ready and browser disconnect in real Chromium',
  {timeout: 60_000},
  async () => {
    const chromeExecutable = await resolveChromeExecutable();
    const profileDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-preview-command-chromium-'));
    const projectDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-preview-command-project-'));
    const sourceManifestPath = path.join(projectDirectory, 'project.source.json');
    const sourceFilename = 'command.k4.yml';
    const sourcePath = path.join(projectDirectory, sourceFilename);
    const baseSb3Path = path.join(projectDirectory, 'base.sb3');
    const manifest = {formatVersion: 1, mode: 'external', sourceId: 'main', path: sourceFilename};
    const source =
      "kamishibai: '4.0'\ncontrols:\n  keymaps:\n    production:\n      Space: navigation.nextAction\nscenes:\n  opening: []\n";
    const baseRelease = await createCurrentDsl4ReleaseSb3();
    await Promise.all([
      writeFile(sourceManifestPath, `${JSON.stringify(manifest)}\n`),
      writeFile(sourcePath, source),
      writeFile(baseSb3Path, baseRelease.archive),
    ]);
    const schema = JSON.parse(
      await readFile(path.join(repositoryRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
    );
    const signalTarget = new EventEmitter();
    let stdout = '';
    let stderr = '';
    let chrome = null;
    const connected: {client?: CdpClient} = {};
    let launchUrl: string | null = null;
    const commandPromise = runDsl4LocalPreviewCommand(
      {
        watch: true,
        baseSb3: baseSb3Path,
        projectRoot: projectDirectory,
        sourceManifest: sourceManifestPath,
        sourceFrontend: createDsl4ProductionSourceFrontend(schema),
        controlProfile: 'production',
        channel: 'bundled',
        maxSourceBytes: 64 * 1024,
        maxAssetFileBytes: 1024 * 1024,
        maxAssetFiles: 64,
        maxTotalAssetBytes: 64 * 1024 * 1024,
        replaceExisting: true,
        port: 0,
      },
      {
        signalTarget,
        stdout: {
          write: (chunk: string) => {
            stdout += chunk;
            return true;
          },
        },
        stderr: {
          write: (chunk: string) => {
            stderr += chunk;
            return true;
          },
        },
        async openBrowser(url: string) {
          launchUrl = url;
          chrome = spawn(
            chromeExecutable,
            [
              '--headless=new',
              '--disable-background-networking',
              '--disable-dev-shm-usage',
              '--use-angle=swiftshader',
              '--no-first-run',
              '--no-sandbox',
              '--remote-debugging-port=0',
              `--user-data-dir=${profileDirectory}`,
              url,
            ],
            {stdio: ['ignore', 'pipe', 'pipe']},
          );
          const browserWebSocketUrl = await waitForDevTools(chrome);
          const pageWebSocketUrl = await waitForPageTarget(browserWebSocketUrl, url);
          connected.client = await CdpClient.connect(pageWebSocketUrl);
          await connected.client.send('Runtime.enable');
        },
      },
    );
    try {
      const readyDeadline = Date.now() + 30_000;
      while (Date.now() < readyDeadline && !stdout.includes('Preview ready at ')) {
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      assert.match(stdout, /Preview ready at .*watching command\.k4\.yml/u, stderr);
      const pageClient = requireDefined(
        connected.client,
        'the Chromium page the preview command created',
      );
      await waitForEvaluation(
        pageClient,
        "document.querySelector('#dsl4-preview-status')?.dataset.validationStatus === 'valid' && document.querySelector('canvas[data-dsl4-turbo-warp-stage=true]')",
        'public preview command stage activation',
      );
      assert.equal(new URL(requireString(launchUrl, 'the launch URL')).hostname, '127.0.0.1');
      assert.equal(
        stdout.includes(new URL(requireString(launchUrl, 'the launch URL')).hash.slice(1)),
        false,
      );
      try {
        await waitForEvaluation(
          pageClient,
          `(() => {
            const runtime = globalThis.Scratch?.vm?.runtime;
            const stage = runtime?.getTargetForStage?.();
            return /^Menu(?:Runtime)?$/.test(
              stage?.getCostumes?.()[stage.currentCostume]?.name ?? '',
            );
          })()`,
          'external-source story completion menu',
        );
      } catch (error) {
        const page = await evaluateRecord(
          pageClient,
          `(() => {
          const runtime = globalThis.Scratch?.vm?.runtime;
          const stage = runtime?.getTargetForStage?.();
          return {
            costume: stage?.getCostumes?.()[stage.currentCostume]?.name,
            status: document.querySelector('#dsl4-preview-status')?.textContent,
            targets: runtime?.targets?.map((target) => ({name: target.getName?.(), visible: target.visible})),
          };
        })()`,
        );
        throw new Error(
          `${String(thrown(error).message)}\n${JSON.stringify({page, stderr, exceptions: pageClient.exceptions})}`,
        );
      }
      assert.deepEqual(
        await pageClient.evaluate(
          'globalThis.Scratch.vm.runtime.targets.map((target) => target.getName?.())',
        ),
        ['Stage'],
      );
      assert.deepEqual(pageClient.exceptions, []);

      await pageClient.send('Page.navigate', {url: 'about:blank'});
      // 計測では、ブラウザが切れてからコマンドが戻るまでは0〜1ミリ秒です（16並列の負荷下でも
      // 同じ）。20秒はそのための余裕ではなく、止まったことを名乗るための期限です。伸ばしても
      // 止まったときに待つ時間が増えるだけなので、ここは20秒のままにしています。
      const result = await withDeadline(
        commandPromise,
        'the preview command to exit after the browser disconnected',
        20_000,
      );
      assert.deepEqual(result, {exitCode: 0, reason: 'browser-disconnected'});
      assert.match(stdout, /browser disconnected/u);
      assert.equal(stderr, '');
      assert.equal(signalTarget.listenerCount('SIGINT'), 0);
      assert.equal(signalTarget.listenerCount('SIGTERM'), 0);
    } finally {
      signalTarget.emit('SIGTERM');
      // Cleanup waits too: a command that never exits would otherwise hold the suite until
      // its own timeout, hiding the failure the test was about to report.
      await withDeadline(commandPromise, 'the preview command to exit on SIGTERM', 20_000).catch(
        () => {},
      );
      connected.client?.close();
      if (chrome) await stopChrome(chrome);
      await Promise.all([
        rm(profileDirectory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100}),
        rm(projectDirectory, {recursive: true, force: true}),
      ]);
    }
  },
);

test(
  'runs actor, sound, pose, and camera capabilities within bounded browser-preview resources',
  {timeout: 60_000},
  async (testContext) => {
    const chromeExecutable = await resolveChromeExecutable();
    const profileDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-capability-chromium-'));
    const projectDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-capability-project-'));
    const sourceManifestPath = path.join(projectDirectory, 'project.source.json');
    const sourceFilename = 'capabilities.k4.yml';
    const sourcePath = path.join(projectDirectory, sourceFilename);
    const manifest = {formatVersion: 1, mode: 'external', sourceId: 'main', path: sourceFilename};
    const source = `kamishibai: '4.0'
assets:
  HeroSkin: costume:Hero
  Cue: sound
  Idle: sound
  Charge: sound
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
actors:
  Hero: HeroSkin
recognition:
  idleSound: Idle
  chargeSound: Charge
  sequence:
    confidenceThreshold: 0.5
    fullConfidenceHoldSeconds: 0.01
    idleChargePerSecond: 0
  navigation:
    allowSkip: true
controls:
  keymaps:
    production:
      Space: rehearsal.skipPose
      ArrowRight: rehearsal.skipAction
      ArrowDown: rehearsal.skipScene
scenes:
  opening:
    recognitionModel: RescuePose
    actions:
      - Hero.show:
          skin: HeroSkin
          x: 15
          y: -20
          scale: 45
      - sound: Cue
      - Hero.pose:
          steps:
            - pose: help
            - pose: help
      - wait: 60
      - bgm: Cue
      - transition: {effect: fadeOut, seconds: 30}
      - Hero.hide: {}
  ending:
    - wait: 60
`;
    await Promise.all([
      writeFile(sourceManifestPath, `${JSON.stringify(manifest)}\n`),
      writeFile(sourcePath, source),
    ]);
    const schema = JSON.parse(
      await readFile(path.join(repositoryRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
    );
    const sourceFrontend = createDsl4ProductionSourceFrontend(schema);
    const limits = {
      maxSourceBytes: 64 * 1024,
      maxAssetFiles: 64,
      maxTotalAssetBytes: 64 * 1024 * 1024,
    };
    const parsed = sourceFrontend.parse(source, {sourceId: 'main'});
    assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
    const sourceDescriptor = await createDsl4EmbeddedSourceDescriptor(source, {
      sourceId: 'main',
      displayName: sourceFilename,
      maxSourceBytes: limits.maxSourceBytes,
      subtleCrypto: webcrypto.subtle,
    });
    const artifact = await createDsl4RuntimeArtifactDescriptor(
      parsed.storyDocument,
      sourceDescriptor,
      'production',
      {maxSourceBytes: limits.maxSourceBytes, subtleCrypto: webcrypto.subtle},
    );
    assert.equal(artifact.ok, true, JSON.stringify(artifact.diagnostics));
    const poseFiles = new Map([
      [
        'model.json',
        strToU8(
          JSON.stringify({
            modelTopology: {},
            weightsManifest: [{paths: ['weights.bin'], weights: []}],
          }),
        ),
      ],
      ['metadata.json', strToU8(JSON.stringify({labels: ['help']}))],
      ['weights.bin', new Uint8Array([1])],
    ]);
    const poseSourceFiles = [...poseFiles]
      .map(([filePath, bytes]) => ({
        path: filePath,
        size: bytes.byteLength,
        integrity: `sha256-${createHash('sha256').update(bytes).digest('base64')}`,
      }))
      .sort((left, right) => left.path.localeCompare(right.path));
    const snapshotAssets = Object.values(
      requireRecord(parsed.storyDocument.assets, 'the story assets'),
    )
      .map((value) => {
        const asset = requireRecord(value, 'a story asset');
        return {
          id: requireString(asset.id, 'its id'),
          kind: asset.kind,
          loading: asset.loading,
          ...(typeof asset.target === 'string' ? {target: asset.target} : {}),
          source:
            asset.kind === 'recognitionModel'
              ? {
                  type: 'file',
                  inputPath: asset.file,
                  mode: 'directory',
                  files: poseSourceFiles,
                }
              : {type: 'project', name: asset.name},
        };
      })
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    const assets = await createDsl4EmbeddedAssetBundle(
      parsed.storyDocument,
      {
        manifest: {formatVersion: 1, assets: snapshotAssets},
        getFile(assetId: string, filePath: string) {
          assert.equal(assetId, 'RescuePose');
          return new Uint8Array(requireDefined(poseFiles.get(filePath), `pose file ${filePath}`));
        },
      },
      {
        maxFiles: limits.maxAssetFiles,
        maxTotalBytes: limits.maxTotalAssetBytes,
        subtleCrypto: webcrypto.subtle,
      },
    );
    const backdropAssetId = '00000000000000000000000000000000';
    const heroAssetId = '11111111111111111111111111111111';
    const soundAssetId = '22222222222222222222222222222222';
    const backdropFilename = `${backdropAssetId}.svg`;
    const heroFilename = `${heroAssetId}.svg`;
    const soundFilename = `${soundAssetId}.wav`;
    const soundBytes = await readFile(
      path.join(repositoryRoot, 'test', 'fixtures', 'assets', 'actor-pop.wav'),
    );
    const sounds = ['Cue', 'Idle', 'Charge'].map((name) => ({
      name,
      assetId: soundAssetId,
      dataFormat: 'wav',
      format: '',
      rate: 44_100,
      sampleCount: 1,
      md5ext: soundFilename,
    }));
    const project = await installDsl4PackagedRuntimeComponent(
      {
        extensionStorage: {},
        targets: [
          {
            isStage: true,
            name: 'Stage',
            variables: createPoseFeedbackVariables(),
            lists: {},
            broadcasts: {},
            blocks: {},
            comments: {},
            currentCostume: 0,
            costumes: [
              {
                name: 'backdrop1',
                assetId: backdropAssetId,
                dataFormat: 'svg',
                md5ext: backdropFilename,
                rotationCenterX: 240,
                rotationCenterY: 180,
              },
            ],
            sounds,
            volume: 100,
            layerOrder: 0,
            tempo: 60,
            videoTransparency: 50,
            videoState: 'on',
            textToSpeechLanguage: null,
          },
          {
            isStage: false,
            name: 'Hero',
            variables: {'actor-name': ['actorName', 'Hero']},
            lists: {},
            broadcasts: {},
            blocks: {},
            comments: {},
            currentCostume: 0,
            costumes: [
              {
                name: 'HeroSkin',
                assetId: heroAssetId,
                dataFormat: 'svg',
                md5ext: heroFilename,
                rotationCenterX: 40,
                rotationCenterY: 40,
              },
            ],
            sounds: [],
            volume: 100,
            layerOrder: 1,
            visible: false,
            x: 0,
            y: 0,
            size: 100,
            direction: 90,
            draggable: false,
            rotationStyle: 'all around',
          },
        ],
        monitors: createPoseFeedbackMonitors(),
        extensions: [],
        meta: {semver: '3.0.0'},
      },
      parsed.storyDocument,
      sourceDescriptor,
      okResult(artifact, 'the runtime artifact').artifact,
      assets,
      {channel: 'unbundled', ...limits, subtleCrypto: webcrypto.subtle},
    );
    const projectBytes = new Uint8Array(
      zipSync({
        'project.json': strToU8(`${JSON.stringify(project)}\n`),
        [backdropFilename]: strToU8(
          '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>',
        ),
        [heroFilename]: strToU8(
          '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#7c3aed"/></svg>',
        ),
        [soundFilename]: soundBytes,
      }),
    );
    const browserBundleBytes = await buildDsl4TurboWarpBrowserBundle({
      entryPoint: path.join(
        repositoryRoot,
        'test',
        'fixtures',
        'dsl4',
        'local-preview-capability-entry.mjs',
      ),
    });
    const hostErrors: string[] = [];
    const host = createDsl4LocalPreviewHost({
      projectRoot: projectDirectory,
      sourceManifestPath,
      sourceManifest: manifest,
      sourceFrontend,
      maxSourceBytes: limits.maxSourceBytes,
      runtimeOwner: 'browser',
      projectBytes,
      browserBundleBytes,
      onError: (error: unknown) => hostErrors.push(String(thrown(error).stack ?? error)),
    });
    await host.start();
    const url = host.getLaunchUrl();
    const startedAt = Date.now();
    const chrome = spawn(
      chromeExecutable,
      [
        '--headless=new',
        '--autoplay-policy=no-user-gesture-required',
        '--disable-background-networking',
        '--disable-dev-shm-usage',
        '--enable-precise-memory-info',
        '--use-angle=swiftshader',
        '--no-first-run',
        '--no-sandbox',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        url,
      ],
      {stdio: ['ignore', 'pipe', 'pipe']},
    );
    let client: CdpClient | null = null;
    try {
      const browserWebSocketUrl = await waitForDevTools(chrome);
      const pageWebSocketUrl = await waitForPageTarget(browserWebSocketUrl, url);
      client = await CdpClient.connect(pageWebSocketUrl);
      await client.send('Runtime.enable');
      try {
        await waitForEvaluation(
          client,
          "globalThis.dsl4LocalPreviewCapabilityFixture?.events.some(({type, actionPath}) => type === 'action.start' && actionPath === '/scenes/opening/actions/2') && globalThis.dsl4LocalPreviewCapabilityFixture?.metrics.predictions > 0",
          'browser-owned first pose step',
          {timeoutMs: 30_000},
        );
        assert.equal(
          await client.evaluate(
            "document.querySelector('canvas')?.focus(); document.activeElement?.tagName",
          ),
          'CANVAS',
        );
        assert.deepEqual(
          await client.evaluate(`(() => {
            const preview = [...document.querySelectorAll('canvas')]
              .find((canvas) => canvas.width === 320 && canvas.height === 240);
            return preview ? {
              display: preview.style.display,
              left: preview.style.left,
              right: preview.style.right,
              top: preview.style.top,
              bottom: preview.style.bottom,
              width: preview.style.width,
              height: preview.style.height,
              objectFit: preview.style.objectFit,
              borderRadius: preview.style.borderRadius,
              opacity: preview.style.opacity
            } : null;
          })()`),
          {
            display: 'block',
            left: '0px',
            right: '',
            top: '0px',
            bottom: '',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '0px',
            opacity: '0.2',
          },
          'The active pose preview must cover the complete stage.',
        );
        const hiddenBeforeFirstSkip = await client.evaluate(
          "globalThis.dsl4LocalPreviewCapabilityFixture.metrics.previewVisibilityChanges.filter((display) => display === 'none').length",
        );
        assert.equal(hiddenBeforeFirstSkip, 1, 'Story camera startup must keep preview hidden.');
        await pressKey(client, {key: ' ', code: 'Space', windowsVirtualKeyCode: 32});
        await waitForEvaluation(
          client,
          "globalThis.dsl4LocalPreviewCapabilityFixture?.events.filter(({type}) => type === 'pose.step.skip').length === 1",
          'browser-owned pose-step rehearsal skip',
        );
        assert.equal(
          await client.evaluate(
            "globalThis.dsl4LocalPreviewCapabilityFixture.metrics.previewVisibilityChanges.filter((display) => display === 'none').length",
          ),
          hiddenBeforeFirstSkip,
          'The camera preview must remain visible between pose steps.',
        );
        await pressKey(client, {
          key: 'ArrowRight',
          code: 'ArrowRight',
          windowsVirtualKeyCode: 39,
        });
        await waitForEvaluation(
          client,
          "globalThis.dsl4LocalPreviewCapabilityFixture?.events.some(({type, actionPath}) => type === 'action.start' && actionPath === '/scenes/opening/actions/3')",
          'browser-owned action rehearsal skip',
        );
        await pressKey(client, {
          key: 'ArrowDown',
          code: 'ArrowDown',
          windowsVirtualKeyCode: 40,
        });
        await waitForEvaluation(
          client,
          "globalThis.dsl4LocalPreviewCapabilityFixture?.events.some(({type, actionPath}) => type === 'action.start' && actionPath === '/scenes/ending/actions/0')",
          'browser-owned scene rehearsal skip',
        );
        await pressKey(client, {
          key: 'ArrowRight',
          code: 'ArrowRight',
          windowsVirtualKeyCode: 39,
        });
        await waitForEvaluation(
          client,
          "globalThis.dsl4LocalPreviewCapabilityFixture?.events.some(({type}) => type === 'runtime.finish')",
          'browser-owned representative capability fixture completion',
        );
        await waitForEvaluation(
          client,
          `(() => {
            const menu = document.querySelector('[data-dsl4-application-menu="true"]');
            const buttons = [...(menu?.querySelectorAll('[data-dsl4-menu-action]') ?? [])];
            return document.querySelectorAll('[data-dsl4-application-menu="true"]').length === 1 &&
              menu?.style.display === 'block' &&
              buttons.length === 4 &&
              buttons.every((button) => getComputedStyle(button).cursor === 'pointer') &&
              buttons.every((button) => getComputedStyle(button.querySelector('span[aria-hidden=true]'))
                .backgroundImage.includes('data:image/svg+xml;base64,'));
          })()`,
          'interactive browser-owned application menu',
        );
        const initialMenuLocale = await client.evaluate(`(() => {
          const open = document.querySelector('[data-dsl4-menu-action="open"]')?.textContent;
          return open === '台本を開く' ? 'ja' : 'en';
        })()`);
        const openClick = await client.evaluate(`(() => {
          document.querySelector('[data-dsl4-menu-action="open"]').click();
          return globalThis.dsl4LocalPreviewCapabilityFixture.applicationOpenRequests;
        })()`);
        assert.equal(openClick, 1);
        const languageClick = await client.evaluate(`(() => {
          const button = document.querySelector('[data-dsl4-menu-action="language"]');
          let observed = false;
          button.addEventListener('click', () => { observed = true; }, {once: true});
          button.click();
          return {
            disabled: button.disabled,
            observed,
            text: button.textContent
          };
        })()`);
        const toggledLocale = initialMenuLocale === 'ja' ? 'en' : 'ja';
        assert.deepEqual(languageClick, {
          disabled: false,
          observed: true,
          text: toggledLocale === 'ja' ? '言語' : 'Language',
        });
        await waitForEvaluation(
          client,
          `(() => {
            return document.querySelector('[data-dsl4-menu-action="open"]')?.textContent === ${JSON.stringify(
              initialMenuLocale === 'ja' ? 'Open' : '台本を開く',
            )};
          })()`,
          'browser-owned toggled application-menu locale',
        );
        await client.evaluate(`document.querySelector('[data-dsl4-menu-action="about"]').click()`);
        await waitForEvaluation(
          client,
          `(() => {
            return document.querySelector('[data-dsl4-application-menu="true"]')?.style.display === 'none' &&
              document.querySelector('[data-dsl4-title-controls="true"]')?.style.display === 'block';
          })()`,
          'browser-owned application information title',
        );
        await client.evaluate(`document.querySelector('[data-dsl4-title-action="close"]').click()`);
        await waitForEvaluation(
          client,
          `document.querySelector('[data-dsl4-application-menu="true"]')?.style.display === 'block' &&
            document.querySelector('[data-dsl4-title-controls="true"]')?.style.display === 'none'`,
          'browser-owned return from application information',
        );
        await client.evaluate(
          `document.querySelector('[data-dsl4-menu-action="language"]').click()`,
        );
        await waitForEvaluation(
          client,
          `(() => {
            return document.querySelector('[data-dsl4-menu-action="open"]')?.textContent === ${JSON.stringify(
              initialMenuLocale === 'ja' ? '台本を開く' : 'Open',
            )};
          })()`,
          'browser-owned restored application-menu locale',
        );
      } catch (error) {
        const page = await evaluateRecord(
          client,
          `({
          body: document.body.textContent,
          fixture: globalThis.dsl4LocalPreviewCapabilityFixture,
          applicationMenu: (() => {
            const button = document.querySelector('[data-dsl4-menu-action="language"]');
            const rect = button?.getBoundingClientRect();
            const hit = rect && document.elementFromPoint(
              rect.left + rect.width / 2,
              rect.top + rect.height / 2
            );
            return {
              button: rect ? {left: rect.left, top: rect.top, width: rect.width, height: rect.height} : null,
              display: document.querySelector('[data-dsl4-application-menu="true"]')?.style.display,
              hitAction: hit?.closest?.('[data-dsl4-menu-action]')?.dataset.dsl4MenuAction ?? null,
              hitTag: hit?.tagName ?? null
            };
          })(),
          scratch: globalThis.Scratch?.vm?.runtime?.targets?.map((target) => ({name: target.getName?.(), visible: target.visible}))
        })`,
        );
        throw new Error(
          `${String(thrown(error).message)}\n${JSON.stringify({page, host: host.getSnapshot(), hostErrors, exceptions: client.exceptions})}`,
        );
      }
      const startupMilliseconds = Date.now() - startedAt;
      await testContext.annotate(`representative capability startup: ${startupMilliseconds}ms`);
      assert.ok(startupMilliseconds <= 20_000, `startup took ${startupMilliseconds}ms`);
      const observed = await evaluateRecord(
        client,
        `(() => {
        const fixture = globalThis.dsl4LocalPreviewCapabilityFixture;
        const actor = globalThis.Scratch.vm.runtime.targets.find((target) =>
          target.lookupVariableByNameAndType?.('actorName', '')?.value === 'Hero'
        );
        return {
          actor: {
            costume: actor.getCostumes()[actor.currentCostume].name,
            size: actor.size,
            visible: actor.visible,
            x: actor.x,
            y: actor.y
          },
          actionCommits: fixture.events
            .filter(({type}) => type === 'action.commit')
            .map(({actionPath}) => actionPath),
          canvasCount: document.querySelectorAll('canvas').length,
          errors: fixture.errors,
          metrics: fixture.metrics,
          started: fixture.started
        };
      })()`,
      );
      assert.deepEqual(observed.actor, {
        costume: 'HeroSkin',
        size: 45,
        visible: false,
        x: 15,
        y: -20,
      });
      assert.deepEqual(observed.actionCommits, [
        '/scenes/opening/actions/0',
        '/scenes/opening/actions/1',
        '/scenes/opening/actions/4',
        '/scenes/opening/actions/5',
      ]);
      const rehearsalEvents = await client.evaluate(`
        globalThis.dsl4LocalPreviewCapabilityFixture.events
          .filter(({type}) => type === 'pose.step.skip' || type === 'action.cancel' || type === 'action.skip')
          .map(({type, actionPath, details}) => ({type, actionPath, reason: details.reason}))
      `);
      assert.deepEqual(rehearsalEvents, [
        {
          type: 'pose.step.skip',
          actionPath: '/scenes/opening/actions/2',
          reason: 'rehearsal.skipPose',
        },
        {
          type: 'action.cancel',
          actionPath: '/scenes/opening/actions/2',
          reason: 'rehearsal.skipAction',
        },
        {
          type: 'action.cancel',
          actionPath: '/scenes/opening/actions/3',
          reason: 'rehearsal.skipScene',
        },
        {
          type: 'action.skip',
          actionPath: '/scenes/opening/actions/6',
          reason: 'rehearsal.skipScene',
        },
        {
          type: 'action.cancel',
          actionPath: '/scenes/ending/actions/0',
          reason: 'rehearsal.skipAction',
        },
      ]);
      assert.equal(observed.started, true);
      assert.equal(host.getSnapshot().browserRuntimeReady, true);
      assert.equal(requireRecord(observed.metrics, 'its metrics').cameraStarts, 1);
      assert.equal(requireRecord(observed.metrics, 'its metrics').modelLoads, 1);
      assert.ok(measurement(requireRecord(observed.metrics, 'its metrics'), 'predictions') >= 1);
      assert.ok(measurement(requireRecord(observed.metrics, 'its metrics'), 'webcamUpdates') >= 1);
      assert.deepEqual(requireRecord(observed.metrics, 'its metrics').previewVisibilityChanges, [
        'none',
        'block',
        'none',
      ]);
      assert.equal(observed.canvasCount, 1);
      assert.deepEqual(observed.errors, []);

      await client.send('HeapProfiler.enable');
      await client.send('HeapProfiler.collectGarbage');
      const usedHeapBytes = requireNumber(
        await client.evaluate('performance.memory.usedJSHeapSize'),
        'the used heap size',
      );
      await testContext.annotate(`representative capability heap after GC: ${usedHeapBytes} bytes`);
      assert.ok(usedHeapBytes <= 192 * 1024 * 1024, `heap used ${usedHeapBytes} bytes`);

      await client.evaluate(`document.querySelector('[data-dsl4-menu-action="reload"]').click()`);
      await waitForEvaluation(
        client,
        `globalThis.dsl4LocalPreviewCapabilityFixture.events
          .filter(({type}) => type === 'runtime.start').length === 2 &&
          document.querySelector('[data-dsl4-application-menu="true"]')?.style.display === 'none'`,
        'browser-owned menu replay',
      );

      const disposed = await evaluateRecord(
        client,
        `(async () => {
        const fixture = globalThis.dsl4LocalPreviewCapabilityFixture;
        await fixture.client.dispose();
        return {
          canvasCount: document.querySelectorAll('canvas').length,
          hasScratch: Object.hasOwn(globalThis, 'Scratch'),
          metrics: fixture.metrics,
          status: fixture.client.getState().status
        };
      })()`,
      );
      assert.equal(disposed.status, 'disposed');
      assert.equal(disposed.canvasCount, 0);
      assert.equal(disposed.hasScratch, false);
      assert.equal(
        requireRecord(disposed.metrics, 'its metrics').cameraTrackStops,
        requireRecord(disposed.metrics, 'its metrics').cameraStarts,
      );
      assert.equal(
        requireRecord(disposed.metrics, 'its metrics').classifierDisposals,
        requireRecord(disposed.metrics, 'its metrics').modelLoads,
      );
      assert.equal(
        requireRecord(disposed.metrics, 'its metrics').poseNetDisposals,
        requireRecord(disposed.metrics, 'its metrics').modelLoads,
      );
      await waitForEvaluation(
        client,
        'document.querySelectorAll("canvas").length === 0',
        'capability fixture canvas cleanup',
      );
      const disconnectDeadline = Date.now() + 10_000;
      while (Date.now() < disconnectDeadline && host.getSnapshot().status !== 'listening') {
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      assert.equal(host.getSnapshot().status, 'listening');
      assert.equal(host.getSnapshot().browserRuntimeReady, false);
      assert.deepEqual(hostErrors, []);
      assert.deepEqual(client.exceptions, []);
    } finally {
      client?.close();
      await stopChrome(chrome);
      await host.dispose();
      await Promise.all([
        rm(profileDirectory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100}),
        rm(projectDirectory, {recursive: true, force: true}),
      ]);
    }
  },
);

/**
 * Read the Hero actor's speech bubble out of the running page.
 *
 * `@kubohiroya/turbowarp-bubble` owns say and think, and in a browser it draws into an SVG overlay
 * the renderer mounts next to the stage canvas. The snapshot therefore covers what the composition
 * actually produced — the overlay element, its rendered text, and its on-screen box — plus the
 * Scratch Looks bubble state, which must stay untouched now that `ext_scratch3_looks._say` and
 * `._think` are no longer part of the runtime path.
 */
const speechBubbleSnapshotExpression = `(() => {
  const runtime = globalThis.Scratch?.vm?.runtime;
  const actor = runtime?.targets.find(
    (target) => target.lookupVariableByNameAndType?.('actorName', '')?.value === 'Hero',
  );
  if (!runtime || !actor) return null;
  const looks = actor.getCustomState?.('Scratch.looks') ?? null;
  const overlays = [...document.querySelectorAll('svg')];
  return {
    looksBubbleText: looks?.text ?? null,
    looksBubbleDrawableId: looks?.drawableId ?? null,
    overlayBoxes: overlays.map((element) => {
      const box = element.getBoundingClientRect();
      return {width: box.width, height: box.height};
    }),
    bubbleTexts: [...document.querySelectorAll('svg text')]
      .map((element) => element.textContent.trim())
      .filter((text) => text.length > 0),
    canvasCount: document.querySelectorAll('canvas').length,
  };
})()`;

function assertRenderedSpeechBubble(
  snapshot: Record<string, unknown>,
  {text, label}: {text: string; label: string},
) {
  assert.deepEqual(
    snapshot.bubbleTexts,
    [text],
    `${label} must be the one rendered bubble, got ${JSON.stringify(snapshot.bubbleTexts)}`,
  );
  const overlayBoxes = requireArray(snapshot.overlayBoxes, 'the stage overlay boxes').map((box) =>
    requireRecord(box, 'an overlay box'),
  );
  assert.equal(overlayBoxes.length, 1, `${label} must mount one stage overlay`);
  assert.ok(
    overlayBoxes.every((box) => measurement(box, 'width') > 0 && measurement(box, 'height') > 0),
    `${label} must occupy the stage, got ${JSON.stringify(snapshot.overlayBoxes)}`,
  );
  // Bubble is the only speech renderer: the Scratch Looks bubble must never be created.
  assert.equal(snapshot.looksBubbleText, null, `${label} must not use the Looks renderer`);
  assert.equal(snapshot.looksBubbleDrawableId, null, `${label} must not own a Looks drawable`);
}

test(
  'renders and clears say and think speech bubbles through the Bubble composition in real Chromium',
  {timeout: 60_000},
  async () => {
    const chromeExecutable = await resolveChromeExecutable();
    const profileDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-speech-chromium-'));
    const projectDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-speech-project-'));
    const sourceManifestPath = path.join(projectDirectory, 'project.source.json');
    const sourceFilename = 'speech.k4.yml';
    const sourcePath = path.join(projectDirectory, sourceFilename);
    const manifest = {formatVersion: 1, mode: 'external', sourceId: 'main', path: sourceFilename};
    const sayText = 'こんにちは';
    const thinkText = 'ひみつです';
    // Both speeches wait for input, so the bubble each one renders is observable without racing a
    // deadline, and the advance that ends them exercises the renderer's terminal cleanup.
    const source = `kamishibai: '4.0'
assets:
  HeroSkin: costume:Hero
actors:
  Hero: HeroSkin
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - Hero.show:
        skin: HeroSkin
        x: -40
        y: -60
        scale: 100
    - Hero.say:
        text: ${sayText}
        waitFor: advance
    - Hero.think:
        text: ${thinkText}
        waitFor: advance
`;
    await Promise.all([
      writeFile(sourceManifestPath, `${JSON.stringify(manifest)}\n`),
      writeFile(sourcePath, source),
    ]);
    const schema = JSON.parse(
      await readFile(path.join(repositoryRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
    );
    const sourceFrontend = createDsl4ProductionSourceFrontend(schema);
    const limits = {
      maxSourceBytes: 64 * 1024,
      maxAssetFiles: 64,
      maxTotalAssetBytes: 64 * 1024 * 1024,
    };
    const parsed = sourceFrontend.parse(source, {sourceId: 'main'});
    assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
    const sourceDescriptor = await createDsl4EmbeddedSourceDescriptor(source, {
      sourceId: 'main',
      displayName: sourceFilename,
      maxSourceBytes: limits.maxSourceBytes,
      subtleCrypto: webcrypto.subtle,
    });
    const artifact = await createDsl4RuntimeArtifactDescriptor(
      parsed.storyDocument,
      sourceDescriptor,
      'production',
      {maxSourceBytes: limits.maxSourceBytes, subtleCrypto: webcrypto.subtle},
    );
    assert.equal(artifact.ok, true, JSON.stringify(artifact.diagnostics));
    const snapshotAssets = Object.values(
      requireRecord(parsed.storyDocument.assets, 'the story assets'),
    ).map((value) => {
      const asset = requireRecord(value, 'a story asset');
      return {
        id: asset.id,
        kind: asset.kind,
        loading: asset.loading,
        ...(typeof asset.target === 'string' ? {target: asset.target} : {}),
        source: {type: 'project', name: asset.name},
      };
    });
    const assets = await createDsl4EmbeddedAssetBundle(
      parsed.storyDocument,
      {
        manifest: {formatVersion: 1, assets: snapshotAssets},
        getFile: () => new Uint8Array(),
      },
      {
        maxFiles: limits.maxAssetFiles,
        maxTotalBytes: limits.maxTotalAssetBytes,
        subtleCrypto: webcrypto.subtle,
      },
    );
    const backdropAssetId = '00000000000000000000000000000000';
    const heroAssetId = '11111111111111111111111111111111';
    const backdropFilename = `${backdropAssetId}.svg`;
    const heroFilename = `${heroAssetId}.svg`;
    const project = await installDsl4PackagedRuntimeComponent(
      {
        extensionStorage: {},
        targets: [
          {
            isStage: true,
            name: 'Stage',
            variables: createPoseFeedbackVariables(),
            lists: {},
            broadcasts: {},
            blocks: {},
            comments: {},
            currentCostume: 0,
            costumes: [
              {
                name: 'backdrop1',
                assetId: backdropAssetId,
                dataFormat: 'svg',
                md5ext: backdropFilename,
                rotationCenterX: 240,
                rotationCenterY: 180,
              },
            ],
            sounds: [],
            volume: 100,
            layerOrder: 0,
            tempo: 60,
            videoTransparency: 50,
            videoState: 'on',
            textToSpeechLanguage: null,
          },
          {
            isStage: false,
            name: 'Hero',
            variables: {'actor-name': ['actorName', 'Hero']},
            lists: {},
            broadcasts: {},
            blocks: {},
            comments: {},
            currentCostume: 0,
            costumes: [
              {
                name: 'HeroSkin',
                assetId: heroAssetId,
                dataFormat: 'svg',
                md5ext: heroFilename,
                rotationCenterX: 40,
                rotationCenterY: 40,
              },
            ],
            sounds: [],
            volume: 100,
            layerOrder: 1,
            visible: false,
            x: 0,
            y: 0,
            size: 100,
            direction: 90,
            draggable: false,
            rotationStyle: 'all around',
          },
        ],
        monitors: createPoseFeedbackMonitors(),
        extensions: [],
        meta: {semver: '3.0.0'},
      },
      parsed.storyDocument,
      sourceDescriptor,
      okResult(artifact, 'the runtime artifact').artifact,
      assets,
      {channel: 'unbundled', ...limits, subtleCrypto: webcrypto.subtle},
    );
    const projectBytes = new Uint8Array(
      zipSync({
        'project.json': strToU8(`${JSON.stringify(project)}\n`),
        [backdropFilename]: strToU8(
          '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>',
        ),
        [heroFilename]: strToU8(
          '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#7c3aed"/></svg>',
        ),
      }),
    );
    const browserBundleBytes = await buildDsl4TurboWarpBrowserBundle({
      entryPoint: path.join(
        repositoryRoot,
        'test',
        'fixtures',
        'dsl4',
        'local-preview-capability-entry.mjs',
      ),
    });
    const hostErrors: string[] = [];
    const host = createDsl4LocalPreviewHost({
      projectRoot: projectDirectory,
      sourceManifestPath,
      sourceManifest: manifest,
      sourceFrontend,
      maxSourceBytes: limits.maxSourceBytes,
      runtimeOwner: 'browser',
      projectBytes,
      browserBundleBytes,
      onError: (error: unknown) => hostErrors.push(String(thrown(error).stack ?? error)),
    });
    await host.start();
    const url = host.getLaunchUrl();
    const chrome = spawn(
      chromeExecutable,
      [
        '--headless=new',
        '--disable-background-networking',
        '--disable-dev-shm-usage',
        '--use-angle=swiftshader',
        '--no-first-run',
        '--no-sandbox',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        url,
      ],
      {stdio: ['ignore', 'pipe', 'pipe']},
    );
    let client: CdpClient | null = null;
    try {
      const browserWebSocketUrl = await waitForDevTools(chrome);
      const pageWebSocketUrl = await waitForPageTarget(browserWebSocketUrl, url);
      client = await CdpClient.connect(pageWebSocketUrl);
      await client.send('Runtime.enable');
      try {
        await waitForEvaluation(
          client,
          `(${speechBubbleSnapshotExpression})?.bubbleTexts.includes(${JSON.stringify(sayText)})`,
          'browser-owned say bubble',
          {timeoutMs: 30_000},
        );
        const say = await evaluateRecord(client, speechBubbleSnapshotExpression);
        assertRenderedSpeechBubble(say, {text: sayText, label: 'The say bubble'});

        assert.equal(
          await client.evaluate(
            "document.querySelector('canvas')?.focus(); document.activeElement?.tagName",
          ),
          'CANVAS',
        );
        await pressKey(client, {key: ' ', code: 'Space', windowsVirtualKeyCode: 32});
        await waitForEvaluation(
          client,
          `(${speechBubbleSnapshotExpression})?.bubbleTexts.includes(${JSON.stringify(thinkText)})`,
          'browser-owned think bubble',
        );
        const think = await evaluateRecord(client, speechBubbleSnapshotExpression);
        assertRenderedSpeechBubble(think, {text: thinkText, label: 'The think bubble'});

        await pressKey(client, {key: ' ', code: 'Space', windowsVirtualKeyCode: 32});
        await waitForEvaluation(
          client,
          `(() => {
            const snapshot = ${speechBubbleSnapshotExpression};
            return snapshot !== null && snapshot.bubbleTexts.length === 0;
          })()`,
          'browser-owned speech bubble cleanup',
        );
        const cleared = await evaluateRecord(client, speechBubbleSnapshotExpression);
        assert.deepEqual(cleared.bubbleTexts, [], 'The finished speech must release its bubble');
        assert.equal(cleared.looksBubbleDrawableId, null);
        await waitForEvaluation(
          client,
          "globalThis.dsl4LocalPreviewCapabilityFixture?.events.some(({type}) => type === 'runtime.finish')",
          'browser-owned speech story completion',
        );
        const observed = await evaluateRecord(
          client,
          `(() => {
          const fixture = globalThis.dsl4LocalPreviewCapabilityFixture;
          return {
            actionCommits: fixture.events
              .filter(({type}) => type === 'action.commit')
              .map(({actionPath}) => actionPath),
            errors: fixture.errors,
          };
        })()`,
        );
        assert.deepEqual(observed.actionCommits, [
          '/scenes/opening/actions/0',
          '/scenes/opening/actions/1',
          '/scenes/opening/actions/2',
        ]);
        assert.deepEqual(observed.errors, []);
      } catch (error) {
        const page = await evaluateRecord(
          client,
          `({
          body: document.body.textContent,
          fixture: globalThis.dsl4LocalPreviewCapabilityFixture,
          bubble: ${speechBubbleSnapshotExpression}
        })`,
        );
        throw new Error(
          `${String(thrown(error).message)}\n${JSON.stringify({page, host: host.getSnapshot(), hostErrors, exceptions: client.exceptions})}`,
        );
      }
      assert.deepEqual(hostErrors, []);
      assert.deepEqual(client.exceptions, []);
    } finally {
      client?.close();
      await stopChrome(chrome);
      await host.dispose();
      await Promise.all([
        rm(profileDirectory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100}),
        rm(projectDirectory, {recursive: true, force: true}),
      ]);
    }
  },
);
