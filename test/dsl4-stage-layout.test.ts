import assert from 'node:assert/strict';
import {test} from 'vitest';
import {fitDsl4Stage} from '../src/dsl4/browser-stage-layout.js';
import {createFakeDocument} from './helpers/fake-dom.ts';

function fixture() {
  const document = createFakeDocument();
  const mount = document.createElement('div');
  const element = document.createElement('div');
  const layers = document.createElement('div');
  const canvas = document.createElement('canvas');
  mount.appendChild(element);
  element.appendChild(layers);
  layers.appendChild(canvas);
  // The fake implements parentNode; the browser supplies the equivalent parentElement getter.
  Object.defineProperty(canvas, 'parentElement', {value: layers});
  let notify = () => {};
  let disconnected = 0;
  const resizeListeners = new Set<() => void>();
  document.defaultView = {
    ResizeObserver: class {
      constructor(callback: () => void) {
        notify = callback;
      }
      observe(target: unknown) {
        assert.equal(target, mount);
      }
      disconnect() {
        disconnected += 1;
      }
    },
    addEventListener(_type: string, callback: () => void) {
      resizeListeners.add(callback);
    },
    removeEventListener(_type: string, callback: () => void) {
      resizeListeners.delete(callback);
    },
  };
  mount.setBoundingClientRect({width: 1280, height: 922.5});
  const release = fitDsl4Stage({
    mount: mount as unknown as HTMLElement,
    element: element as unknown as HTMLElement,
    canvas: canvas as unknown as HTMLCanvasElement,
    width: 480,
    height: 360,
  });
  return {
    mount,
    element,
    layers,
    canvas,
    release,
    notify: () => notify(),
    disconnected: () => disconnected,
    resizeListeners,
  };
}

test('fits the stage below reserved controls and centers a four-to-three pointer rectangle', () => {
  const f = fixture();
  assert.equal(f.element.style.width, '1230px');
  assert.equal(f.element.style.height, '922.5px');
  assert.equal(f.element.style.left, '25px');
  assert.equal(f.element.style.top, '0px');
  assert.equal(f.layers.style.transform, 'scale(2.5625)');
  assert.equal(f.canvas.style.width, '480px');
  assert.equal(f.canvas.style.height, '360px');
  f.release();
});

test('follows viewport shrink and growth without stretching either video plane', () => {
  const f = fixture();
  f.mount.setBoundingClientRect({width: 300, height: 400});
  f.notify();
  assert.equal(f.element.style.width, '300px');
  assert.equal(f.element.style.height, '225px');
  assert.equal(f.element.style.left, '0px');
  assert.equal(f.element.style.top, '87.5px');
  assert.equal(f.layers.style.transform, 'scale(0.625)');
  f.mount.setBoundingClientRect({width: 960, height: 720});
  f.notify();
  assert.equal(f.element.style.width, '960px');
  assert.equal(f.layers.style.transform, 'scale(2)');
  f.release();
});

test('uses local CSS sizes when the surrounding host is already transformed', () => {
  const f = fixture();
  f.mount.setBoundingClientRect({width: 800, height: 600});
  Object.defineProperties(f.mount, {clientWidth: {value: 400}, clientHeight: {value: 300}});
  f.notify();
  assert.equal(f.element.style.width, '400px');
  assert.equal(f.element.style.height, '300px');
  assert.equal(f.layers.style.transform, `scale(${400 / 480})`);
  f.release();
});

test('ignores zero-size hidden mounts and queued resize callbacks after disposal', () => {
  const f = fixture();
  f.mount.setBoundingClientRect({width: 0, height: 0});
  f.notify();
  assert.equal(f.element.style.width, '1230px');
  f.release();
  f.release();
  assert.equal(f.disconnected(), 1);
  assert.equal(f.resizeListeners.size, 0);
  f.mount.setBoundingClientRect({width: 960, height: 720});
  f.notify();
  assert.equal(f.element.style.width, '1230px');
});

test('keeps fractional computed height instead of rounding the canvas into the control row', () => {
  const f = fixture();
  Object.defineProperties(f.mount, {clientWidth: {value: 1280}, clientHeight: {value: 923}});
  Object.assign(f.mount.ownerDocument.defaultView as object, {
    getComputedStyle: () => ({width: '1280px', height: '922.5px'}),
  });
  f.notify();
  assert.equal(f.element.style.height, '922.5px');
  assert.equal(f.element.style.width, '1230px');
  f.release();
});
