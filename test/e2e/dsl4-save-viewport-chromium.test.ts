import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {test} from 'vitest';
import {chromium} from 'playwright-core';
import {buildDsl4TurboWarpBrowserBundle} from '../../src/builder/dsl4-turbowarp-browser-bundle.js';
import {dsl4TestSourceFrontend as frontend} from '../helpers/dsl4-test-frontend.ts';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);

test('native renderer, VM input, save slots and restored videos share portrait/landscape viewports', async () => {
  const output = path.join(root, 'tmp/save-viewport-browser');
  await mkdir(output, {recursive: true});
  const entry = path.join(output, 'entry.mjs');
  await writeFile(
    entry,
    `
import Renderer from ${JSON.stringify(require.resolve('scratch-render/src/RenderWebGL.js'))};
import VirtualMachine from ${JSON.stringify(require.resolve('scratch-vm/src/virtual-machine.js'))};
import {createDsl4VideoActionPort} from '../../src/dsl4/platform/video-action-port.ts';
import {createDsl4PresentationSavePort} from '../../src/dsl4/platform/presentation-save-port.ts';
import {createDsl4NavigationSession} from '../../src/dsl4/navigation-session.ts';
import {createDsl4SaveSlotStore} from '../../src/dsl4/save-slot-store.ts';
import {fitDsl4Stage} from '../../src/dsl4/browser-stage-layout.ts';
import {applyDsl4Viewport} from '../../src/dsl4/viewport.ts';
globalThis.saveViewport={Renderer,VirtualMachine,createDsl4VideoActionPort,createDsl4PresentationSavePort,createDsl4NavigationSession,createDsl4SaveSlotStore,fitDsl4Stage,applyDsl4Viewport};
`,
  );
  await writeFile(
    path.join(output, 'bundle.js'),
    await buildDsl4TurboWarpBrowserBundle({entryPoint: entry, maxBundleBytes: 48 * 1024 * 1024}),
  );
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end(
        '<!doctype html><body style="margin:0"><script type="module" src="/tmp/save-viewport-browser/bundle.js"></script>',
      );
      return;
    }
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(path.resolve(root) + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const bytes = await readFile(file);
      response.setHeader(
        'Content-Type',
        file.endsWith('.js')
          ? 'text/javascript'
          : file.endsWith('.webm')
            ? 'video/webm'
            : 'application/octet-stream',
      );
      response.end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--autoplay-policy=document-user-activation-required'],
  });
  try {
    const page = await browser.newPage({viewport: {width: 980, height: 780}});
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.waitForLoadState('networkidle');
    const cdp = await page.context().newCDPSession(page);
    const parsed = frontend.parse(
      `kamishibai: '4.0'\ncontrols: {keymaps: {production: {Space: navigation.nextAction}}}\nvariables: {score: 1}\nscenes:\n  opening:\n    - wait: 30\n    - wait: 30\n`,
    );
    assert(parsed.ok);
    const reports = [];
    for (const viewport of [
      {width: 360, height: 640, orientation: 'portrait', fit: 'contain'},
      {width: 360, height: 640, orientation: 'portrait', fit: 'cover'},
      {width: 960, height: 540, orientation: 'landscape', fit: 'contain'},
      {width: 960, height: 540, orientation: 'landscape', fit: 'cover'},
    ]) {
      const run = async ({
        viewport,
        storyDocument,
      }: {
        viewport: {width: number; height: number; fit: string; orientation: string};
        storyDocument: unknown;
      }) => {
        const api = Reflect.get(globalThis, 'saveViewport');
        const checks: string[] = [];
        const check = (value: unknown, name: string) => {
          if (!value) throw new Error(name);
          checks.push(name);
        };
        const mount = document.createElement('main');
        mount.style.cssText =
          'position:absolute;left:10px;top:10px;width:700px;height:700px;overflow:hidden';
        document.body.append(mount);
        const stage = document.createElement('div');
        stage.style.position = 'absolute';
        mount.append(stage);
        const layers = document.createElement('div');
        layers.style.position = 'relative';
        stage.append(layers);
        const canvas = document.createElement('canvas');
        canvas.style.display = 'block';
        layers.append(canvas);
        const renderer = new api.Renderer(canvas);
        layers.append(renderer.overlayContainer);
        const vm = new api.VirtualMachine();
        vm.attachRenderer(renderer);
        api.applyDsl4Viewport(vm.runtime, viewport);
        renderer.resize(viewport.width, viewport.height);
        const releaseLayout = api.fitDsl4Stage({
          mount,
          element: stage,
          canvas,
          width: viewport.width,
          height: viewport.height,
          fit: viewport.fit,
          safeArea: {top: 12, right: 14, bottom: 16, left: 18},
        });
        const blob = await (await fetch('/test/fixtures/dsl4/video-audible.webm')).blob();
        let objectUrl = URL.createObjectURL(blob);
        const videos: HTMLVideoElement[] = [];
        const videoOptions = {
          renderer,
          getAssetResource: (id: string) => (id === 'Movie' ? {kind: 'video', objectUrl} : null),
          createVideo() {
            const element = document.createElement('video');
            videos.push(element);
            return element;
          },
        };
        let port = api.createDsl4VideoActionPort(videoOptions);
        const signal = new AbortController().signal;
        const front = {
          id: 'front',
          asset: 'Movie',
          x: 30,
          y: 20,
          width: 120,
          height: 160,
          muted: true,
          plane: 'front',
          zIndex: 7,
          fit: 'cover',
        };
        const background = {
          id: 'back',
          url: new URL('/test/fixtures/dsl4/video-audible.webm', location.href).href,
          x: -20,
          y: -30,
          width: 160,
          height: 100,
          muted: true,
          plane: 'background',
          zIndex: -2,
          fit: 'contain',
        };
        port.video(front, {signal});
        port.video(background, {signal});
        await Promise.all(
          videos.map((video) =>
            video.readyState >= 1
              ? Promise.resolve()
              : new Promise<void>((resolve, reject) => {
                  video.addEventListener('loadedmetadata', () => resolve(), {once: true});
                  video.addEventListener('error', () => reject(new Error('metadata failed')), {
                    once: true,
                  });
                }),
          ),
        );
        await port.videoControl({id: 'front', operation: 'loop'}, {signal});
        await port.videoControl({id: 'back', operation: 'loop'}, {signal});
        videos[0]!.currentTime = 0.1;
        videos[0]!.volume = 0.35;
        videos[0]!.playbackRate = 1.25;
        const identity = {storyId: 'native-save', sourceIntegrity: `sha256-${'a'.repeat(43)}=`};
        const makeSession = () => {
          const presentation = api.createDsl4PresentationSavePort({
            targets: () => [],
            video: () => port,
          });
          const result = api.createDsl4NavigationSession({
            storyDocument,
            controlProfile: 'production',
            structuredDataIntegrationEnabled: true,
            saveIdentity: identity,
            port: {
              ...presentation,
              wait(_payload: unknown, ctx: {signal: AbortSignal}) {
                return new Promise<void>((resolve) =>
                  ctx.signal.addEventListener('abort', () => resolve(), {once: true}),
                );
              },
            },
          });
          if (!result.ok) throw new Error('session rejected');
          return result.session;
        };
        let session = makeSession();
        void session.start({variables: {score: 9}});
        await new Promise((resolve) => setTimeout(resolve, 40));
        const save = await session.captureSave();
        check(!JSON.stringify(save).includes('blob:'), 'save-has-portable-references');
        const databaseName = 'save-browser-' + viewport.orientation + '-' + viewport.fit;
        let store = api.createDsl4SaveSlotStore({databaseName, maxSlots: 1});
        await store.put('one', save);
        await store.put('one', save);
        await store.put('overflow', save).then(
          () => {
            throw new Error('slot limit ignored');
          },
          () => {},
        );
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function () {
          throw new DOMException('Injected quota failure', 'QuotaExceededError');
        };
        try {
          await store.put('one', {...save, savedAt: '2026-10-26T00:00:00.000Z'}).then(
            () => {
              throw new Error('write failure ignored');
            },
            () => {},
          );
        } finally {
          IDBObjectStore.prototype.put = put;
        }
        check(
          JSON.stringify(await store.get(identity.storyId, 'one')) === JSON.stringify(save),
          'IDB-write-failure-preserves-old-slot',
        );
        const close = IDBDatabase.prototype.close;
        let failClose = true;
        IDBDatabase.prototype.close = function () {
          if (this.name === databaseName && failClose) throw new Error('Injected close failure');
          return close.call(this);
        };
        try {
          await store.dispose().then(
            () => {
              throw new Error('close failure ignored');
            },
            () => {},
          );
          check(store.hasPendingCleanup(), 'failed-IDB-close-retains-owner');
          failClose = false;
          await store.dispose();
          check(!store.hasPendingCleanup(), 'explicit-IDB-close-retry-succeeds');
        } finally {
          IDBDatabase.prototype.close = close;
        }
        store = api.createDsl4SaveSlotStore({databaseName, maxSlots: 1});
        const fromIdb = await store.get(identity.storyId, 'one');
        check(JSON.stringify(fromIdb) === JSON.stringify(save), 'fresh-IDB-connection-roundtrip');
        await session.dispose();
        port.dispose();
        URL.revokeObjectURL(objectUrl);
        check(
          videos.every((video) => video.src === '' && video.paused),
          'old-session-videos-released',
        );
        // A fresh native URL proves the persisted identity is an asset reference, never a browser handle.
        objectUrl = URL.createObjectURL(blob);
        port = api.createDsl4VideoActionPort(videoOptions);
        session = makeSession();
        await session.restore(new Blob([JSON.stringify(fromIdb)], {type: 'application/json'}));
        const restored = port.captureState();
        check(
          restored.length === 2 &&
            restored.every(
              (video: {paused: boolean; loop: boolean}) => !video.paused && video.loop,
            ),
          'native-playing-loop-restored',
        );
        check(restored[0].volume === 35 && restored[0].rate === 1.25, 'volume-and-rate-restored');
        check(
          restored[0].display.plane === 'front' &&
            restored[1].display.plane === 'background' &&
            restored[0].display.zIndex === 7,
          'planes-and-order-restored',
        );
        check(session.getState().runtime.variables.score === 9, 'fresh-session-variables-restored');
        const before = port.captureState();
        const invalid = {
          ...save,
          presentation: {
            ...save.presentation,
            videos: save.presentation.videos.map(
              (state: {display: Record<string, unknown>}, index: number) =>
                index ? state : {...state, display: {...state.display, asset: 'Missing'}},
            ),
          },
        };
        await session.restore(invalid).then(
          () => {
            throw new Error('missing asset accepted');
          },
          () => {},
        );
        check(
          port
            .captureState()
            .map((state: {display: {id: string}}) => state.display.id)
            .join() === before.map((state: {display: {id: string}}) => state.display.id).join(),
          'missing-asset-preserves-current-videos',
        );
        const denied = {
          ...save,
          presentation: {
            ...save.presentation,
            videos: save.presentation.videos.map((state: Record<string, unknown>) => ({
              ...state,
              muted: false,
            })),
          },
        };
        await session.restore(denied).then(
          () => {
            throw new Error('autoplay policy not enforced');
          },
          () => {},
        );
        check(
          port.captureState().every((state: {muted: boolean}) => state.muted),
          'autoplay-rejection-preserves-current-videos',
        );
        for (const size of [
          [700, 700],
          [420, 620],
          [900, 400],
        ]) {
          mount.style.width = size[0] + 'px';
          mount.style.height = size[1] + 'px';
          window.dispatchEvent(new Event('resize'));
          window.dispatchEvent(new Event('orientationchange'));
          renderer.draw();
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const video = videos.findLast((video) => video.src === objectUrl)!;
          const rect = video.getBoundingClientRect();
          const bounds = canvas.getBoundingClientRect();
          check(
            Math.abs((rect.width / bounds.width) * viewport.width - 120) < 1 &&
              Math.abs((rect.height / bounds.height) * viewport.height - 160) < 1,
            'front-rectangle-shares-renderer-transform',
          );
          const x = bounds.left + bounds.width * (0.5 + 30 / viewport.width),
            y = bounds.top + bounds.height * (0.5 - 20 / viewport.height);
          const hit = document.elementFromPoint(x, y);
          check(hit !== video, 'video-remains-input-transparent');
          vm.postIOData('mouse', {
            x: x - bounds.left,
            y: y - bounds.top,
            canvasWidth: bounds.width,
            canvasHeight: bounds.height,
            isDown: true,
          });
          check(
            Math.abs(vm.runtime.ioDevices.mouse.getScratchX() - 30) < 1 &&
              Math.abs(vm.runtime.ioDevices.mouse.getScratchY() - 20) < 1,
            'native-VM-pointer-uses-logical-stage',
          );
          check(
            renderer.getNativeSize()[0] === viewport.width &&
              renderer.getNativeSize()[1] === viewport.height,
            'native-renderer-size-remains-fixed',
          );
        }
        const live = videos.findLast((video) => video.getAttribute('src'))!;
        const time = live.currentTime;
        await new Promise((resolve) => setTimeout(resolve, 140));
        const frames = live.getVideoPlaybackQuality().totalVideoFrames;
        check(live.currentTime !== time, 'restored-native-playback-advances');
        renderer.draw();
        const pixel = new Uint8Array(4),
          gl = renderer._gl;
        gl.readPixels(
          Math.floor(((viewport.width / 2 - 20) / viewport.width) * canvas.width),
          Math.floor(((viewport.height / 2 - 30) / viewport.height) * canvas.height),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixel,
        );
        check(
          ![...pixel.slice(0, 3)].every((value) => value > 245),
          'background-video-renders-native-WebGL-pixels',
        );
        check(frames > 0, 'restored-native-video-produces-frames');
        await store.delete(identity.storyId, 'one');
        if (viewport.orientation === 'portrait' && viewport.fit === 'contain')
          await store.put('reload', save);
        await store.dispose();
        await session.dispose();
        port.dispose();
        check(
          videos.every((video) => !video.getAttribute('src') && video.paused),
          'all-native-videos-release',
        );
        URL.revokeObjectURL(objectUrl);
        releaseLayout();
        vm.quit();
        renderer._gl.getExtension('WEBGL_lose_context')?.loseContext();
        mount.remove();
        return {viewport, checks, frames};
      };
      const evaluated: {exceptionDetails?: unknown; result: {value?: unknown}} = await cdp.send(
        'Runtime.evaluate',
        {
          expression: `(${run.toString()})(${JSON.stringify({viewport, storyDocument: parsed.storyDocument})})`,
          awaitPromise: true,
          returnByValue: true,
          userGesture: false,
        },
      );
      assert.equal(
        evaluated.exceptionDetails,
        undefined,
        JSON.stringify(evaluated.exceptionDetails),
      );
      reports.push(evaluated.result.value);
    }
    await page.reload();
    await page.waitForLoadState('networkidle');
    const freshWindow = async (storyDocument: unknown) => {
      const api = Reflect.get(globalThis, 'saveViewport');
      const store = api.createDsl4SaveSlotStore({
        databaseName: 'save-browser-portrait-contain',
        maxSlots: 1,
      });
      const save = await store.get('native-save', 'reload');
      if (!save) throw new Error('Reload lost saved slot');
      const canvas = document.createElement('canvas');
      document.body.append(canvas);
      const renderer = new api.Renderer(canvas);
      document.body.append(renderer.overlayContainer);
      const vm = new api.VirtualMachine();
      vm.attachRenderer(renderer);
      api.applyDsl4Viewport(vm.runtime, {width: 360, height: 640});
      renderer.resize(360, 640);
      const url = URL.createObjectURL(
        await (await fetch('/test/fixtures/dsl4/video-audible.webm')).blob(),
      );
      const videos: HTMLVideoElement[] = [];
      const port = api.createDsl4VideoActionPort({
        renderer,
        getAssetResource: (id: string) => (id === 'Movie' ? {kind: 'video', objectUrl: url} : null),
        createVideo() {
          const video = document.createElement('video');
          videos.push(video);
          return video;
        },
      });
      const presentation = api.createDsl4PresentationSavePort({
        targets: () => [],
        video: () => port,
      });
      const result = api.createDsl4NavigationSession({
        storyDocument,
        controlProfile: 'production',
        structuredDataIntegrationEnabled: true,
        saveIdentity: {storyId: 'native-save', sourceIntegrity: `sha256-${'a'.repeat(43)}=`},
        port: presentation,
      });
      if (!result.ok) throw new Error('Fresh window session rejected');
      await result.session.restore(new Blob([JSON.stringify(save)]));
      await new Promise((resolve) => setTimeout(resolve, 140));
      renderer.draw();
      const state = port.captureState();
      if (
        result.session.getState().runtime.variables.score !== 9 ||
        state.length !== 2 ||
        state.some((video: {paused: boolean}) => video.paused) ||
        !videos.every((video) => video.getVideoPlaybackQuality().totalVideoFrames > 0)
      )
        throw new Error('Fresh window restore differs');
      await result.session.dispose();
      port.dispose();
      await store.delete('native-save', 'reload');
      await store.dispose();
      URL.revokeObjectURL(url);
      vm.quit();
      renderer._gl.getExtension('WEBGL_lose_context')?.loseContext();
      if (videos.some((video) => video.getAttribute('src') || !video.paused))
        throw new Error('Fresh window video cleanup failed');
      return {restored: true, videoCount: state.length, released: true};
    };
    const freshResult = await cdp.send('Runtime.evaluate', {
      expression: `(${freshWindow.toString()})(${JSON.stringify(parsed.storyDocument)})`,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    });
    assert.equal(
      freshResult.exceptionDetails,
      undefined,
      JSON.stringify(freshResult.exceptionDetails),
    );
    assert.deepEqual(freshResult.result.value, {restored: true, videoCount: 2, released: true});
    assert.deepEqual(errors, []);
    await writeFile(
      path.join(output, 'results.json'),
      JSON.stringify(
        {browser: await browser.version(), reports, freshWindow: freshResult.result.value, errors},
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 180_000);
