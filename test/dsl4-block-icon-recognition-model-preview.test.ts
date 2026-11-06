import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {test, vi} from 'vitest';
import {strToU8, zipSync} from 'fflate';
import {dsl4BlockSourceRuntimeExtensionId} from '../src/dsl4/block-source-shared.js';
import {computeDsl4Sha256Integrity} from '../src/dsl4/source-descriptor.js';
import {mountDsl4BlockIconAssetPreview} from '../src/dsl4/platform/block-icon-asset-preview.js';
import {createDsl4PoseNetProjectBundleFromLoader} from '../src/dsl4/platform/posenet-bundle.js';
import {createFakeDocument} from './helpers/fake-dom.ts';
import {deferred} from './helpers/async-test-helpers.ts';

const first = '背景';
const second = '反応';
const predictions = (score: number) => [
  {className: first, probability: 1 - score},
  {className: second, probability: score},
];

function fixture(runtime = {}) {
  const document = createFakeDocument();
  const createElement = document.createElement;
  const paint = vi.fn();
  document.createElement = (tag) => {
    const element = createElement(tag);
    if (tag === 'canvas') {
      Object.assign(element, {
        getContext: () => ({
          canvas: element,
          drawImage: vi.fn(),
          clearRect: vi.fn(),
          setTransform: vi.fn(),
          fillRect: paint,
        }),
      });
    } else if (tag === 'video') {
      Object.assign(element, {videoWidth: 640, videoHeight: 480, play: vi.fn(), pause: vi.fn()});
    }
    return element;
  };
  const track = Object.assign(new EventTarget(), {stop: vi.fn()});
  const stream = {getTracks: () => [track]};
  const getUserMedia = vi.fn(async () => stream);
  document.defaultView = {
    navigator: {mediaDevices: {getUserMedia}},
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 16),
    cancelAnimationFrame: clearTimeout,
  };
  const container = document.createElement('div');
  const listeners = new Set<() => void>();
  let model: 'image' | 'audio' | 'pose' = 'image';
  let asset: unknown;
  const fetchAsset = vi.fn(async (url: string) => {
    const urlPath = new URL(url).pathname;
    const metadata = urlPath.startsWith('/audio/')
      ? {wordLabels: [first, second]}
      : {packageName: `@teachablemachine/${urlPath.split('/')[1]}`, labels: [first, second]};
    if (urlPath.endsWith('/metadata.json')) return Response.json(metadata);
    if (urlPath.endsWith('/model.json'))
      return Response.json({weightsManifest: [{paths: ['./weights.bin']}]});
    assert.ok(urlPath.endsWith('/weights.bin'));
    return new Response(new Uint8Array([1, 2]));
  });
  vi.stubGlobal('fetch', fetchAsset);
  function select(kind: typeof model) {
    model = kind;
    asset = {
      kind: 'recognitionModel',
      delivery: 'remote',
      source: {url: `https://models.test/${model}/`},
    };
    for (const listener of listeners) listener();
  }
  select(model);
  const close = mountDsl4BlockIconAssetPreview(
    container as unknown as HTMLElement,
    {
      getDraft: () => ({data: asset}),
      getState: () => ({status: 'editing'}),
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    {
      opcode: 'kubohiroyakamishibaiauthoring4_asset',
      targetId: 'stage',
      blockId: 'asset',
      arguments: {NAME: {kind: 'literal', value: 'Model'}},
    },
    {runtime},
  );
  return {
    select,
    close,
    stream,
    track,
    paint,
    getUserMedia,
    panel() {
      const panel = container.children[0]?.children.find((child) => child.dataset.dsl4ModelPreview);
      assert.ok(panel);
      return panel;
    },
  };
}

test('the asset dialog starts each device explicitly, updates both scores and releases replaced models', async () => {
  const poseNet = await createDsl4PoseNetProjectBundleFromLoader(({packageSpecifier}) =>
    readFile(fileURLToPath(import.meta.resolve(packageSpecifier))),
  );
  const component = {poseNet};
  const extensionStorage = {
    kubohiroyakamishibai4: {components: {kubohiroyakamishibairuntime4: component}},
  };
  Object.defineProperty(extensionStorage, 'kubohiroyakamishibairuntime4', {get: () => component});
  vi.useFakeTimers();
  const f = fixture({extensionStorage});
  const imageDispose = vi.fn();
  const poseDispose = vi.fn();
  const audioDispose = vi.fn();
  const audioClose = vi.fn(async () => {});
  const drawSkeleton = vi.fn();
  const drawKeypoints = vi.fn();
  const outputDispose = vi.fn();
  let score = 0.75;
  const backendReady = deferred<void>();
  const ready = vi.fn(() => backendReady.promise);
  vi.stubGlobal('tmImage', {
    async loadFromFiles(model: File, weights: File) {
      assert.equal(ready.mock.calls.length, 1);
      assert.equal(model.name, 'model.json');
      assert.equal(weights.name, 'weights.bin');
      return {predict: async () => predictions(score), dispose: imageDispose};
    },
  });
  vi.stubGlobal('tmPose', {
    Webcam: class {},
    loadFromFiles: async () => ({
      estimatePose: async () => ({pose: {keypoints: []}, posenetOutput: []}),
      predict: async () => predictions(score),
      dispose: poseDispose,
    }),
    drawSkeleton,
    drawKeypoints,
  });
  vi.stubGlobal(
    'AudioContext',
    class {
      async resume() {}
      close = audioClose;
      createMediaStreamSource() {
        return {connect: vi.fn(), disconnect: vi.fn()};
      }
      createAnalyser() {
        return {getFloatFrequencyData: (data: Float32Array) => data.fill(-60), disconnect: vi.fn()};
      }
    },
  );
  const tensor = {sub: () => tensor, div: () => tensor, sqrt: () => tensor, add: () => tensor};
  vi.stubGlobal('tf', {
    ready,
    io: {browserFiles: (files: File[]) => files},
    loadLayersModel: async () => ({
      inputs: [{shape: [null, 3, 4, 1]}],
      outputs: [{shape: [null, 2]}],
      predict: () => ({
        data: async () => new Float32Array([1 - score, score]),
        dispose: outputDispose,
      }),
      dispose: audioDispose,
    }),
    tidy: (callback: () => unknown) => callback(),
    tensor4d: () => tensor,
    moments: () => ({mean: tensor, variance: tensor}),
    backend: () => ({epsilon: () => 1e-7}),
  });
  function bars() {
    return f.panel().children[4]!.children.map((row) => ({
      label: row.children[0]!.textContent,
      value: row.children[2]!.textContent,
      winner: row.dataset.recognized,
    }));
  }
  try {
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(f.panel().dataset.dsl4ModelPreview, 'image');
    assert.equal(f.getUserMedia.mock.calls.length, 0);
    assert.equal(bars()[1]!.value, '—');
    f.panel().children[1]!.click();
    assert.deepEqual(f.getUserMedia.mock.calls[0], [{video: {facingMode: 'user'}}]);
    await vi.advanceTimersByTimeAsync(16);
    assert.equal(bars()[1]!.value, '—');
    backendReady.resolve();
    await vi.advanceTimersByTimeAsync(16);
    assert.deepEqual(bars(), [
      {label: first, value: '25%', winner: 'false'},
      {label: second, value: '75%', winner: 'true'},
    ]);
    score = 0.25;
    await vi.advanceTimersByTimeAsync(16);
    assert.equal(bars()[0]!.winner, 'true');

    f.select('pose');
    assert.equal(f.track.stop.mock.calls.length, 1);
    await vi.advanceTimersByTimeAsync(250);
    assert.equal(imageDispose.mock.calls.length, 1);
    assert.equal(f.panel().dataset.dsl4ModelPreview, 'pose');
    f.panel().children[1]!.click();
    await vi.waitFor(
      () => {
        assert.ok(drawSkeleton.mock.calls.length > 0, f.panel().children[2]!.textContent);
        assert.ok(drawKeypoints.mock.calls.length > 0);
        assert.equal(bars()[0]!.value, '75%');
      },
      {timeout: 2000},
    );

    f.select('audio');
    assert.equal(f.track.stop.mock.calls.length, 2);
    await vi.advanceTimersByTimeAsync(250);
    assert.equal(poseDispose.mock.calls.length, 1);
    assert.equal(f.panel().dataset.dsl4ModelPreview, 'audio');
    assert.equal(f.getUserMedia.mock.calls.length, 2);
    f.panel().children[1]!.click();
    assert.deepEqual(f.getUserMedia.mock.calls[2], [
      {
        audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false},
      },
    ]);
    score = 0.875;
    await vi.advanceTimersByTimeAsync(75);
    assert.equal(bars()[1]!.value, '88%');
    assert.equal(bars()[1]!.winner, 'true');
    assert.ok(f.paint.mock.calls.length > 0);
    assert.equal(ready.mock.calls.length, 3);
    assert.ok(outputDispose.mock.calls.length > 0);
    f.close();
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(f.track.stop.mock.calls.length, 3);
    assert.equal(audioClose.mock.calls.length, 1);
    assert.equal(audioDispose.mock.calls.length, 1);
  } finally {
    f.close();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

test('the asset dialog handles denied permission and stops a device granted after closing', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const permission = deferred<typeof f.stream>();
  f.getUserMedia
    .mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
    .mockReturnValueOnce(permission.promise);
  try {
    await vi.advanceTimersByTimeAsync(0);
    f.panel().children[1]!.click();
    await vi.advanceTimersByTimeAsync(0);
    assert.match(f.panel().children[2]!.textContent, /アクセスを許可/u);
    f.panel().children[1]!.click();
    f.close();
    permission.resolve(f.stream);
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(f.track.stop.mock.calls.length, 1);
  } finally {
    f.close();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

test.each(['directory', 'archive'] as const)(
  'previews an embedded model in %s storage',
  async (mode) => {
    const document = createFakeDocument();
    const createElement = document.createElement;
    document.createElement = (tag) => Object.assign(createElement(tag), {getContext: () => null});
    const container = document.createElement('div');
    const path = mode === 'archive' ? 'models/local.zip' : 'models/local';
    const model = {
      'metadata.json': strToU8(
        JSON.stringify({labels: [first, second], packageName: '@teachablemachine/image'}),
      ),
      'model.json': strToU8(JSON.stringify({weightsManifest: [{paths: ['./weights.bin']}]})),
      'weights.bin': new Uint8Array([1, 2]),
    };
    const entries = mode === 'archive' ? {'local.zip': zipSync(model)} : model;
    const files = await Promise.all(
      Object.entries(entries).map(async ([name, bytes]) => ({
        assetId: 'Model',
        path: name,
        entry: name,
        size: bytes.byteLength,
        integrity: await computeDsl4Sha256Integrity(bytes),
      })),
    );
    const saveProjectSb3DontZip = vi.fn(async () => entries);
    const close = mountDsl4BlockIconAssetPreview(
      container as unknown as HTMLElement,
      {
        getDraft: () => ({data: {kind: 'recognitionModel', file: path}}),
        getState: () => ({status: 'editing'}),
        subscribe: () => () => {},
      },
      {
        opcode: 'kubohiroyakamishibaiauthoring4_asset',
        targetId: 'stage',
        blockId: 'asset',
        arguments: {NAME: {kind: 'literal', value: 'Model'}},
      },
      {
        saveProjectSb3DontZip,
        runtime: {
          extensionStorage: {
            [dsl4BlockSourceRuntimeExtensionId]: {
              assets: {
                formatVersion: 3,
                files,
                manifest: {
                  assets: [
                    {
                      id: 'Model',
                      kind: 'recognitionModel',
                      source: {type: 'file', mode, inputPath: path, files},
                    },
                  ],
                },
              },
            },
          },
        },
      },
    );
    try {
      await vi.waitFor(() => {
        assert.ok(
          container.children[0]?.children.some(
            (child) => child.dataset.dsl4ModelPreview === 'image',
          ),
        );
      });
      assert.equal(saveProjectSb3DontZip.mock.calls.length, 1);
    } finally {
      close();
    }
  },
);
