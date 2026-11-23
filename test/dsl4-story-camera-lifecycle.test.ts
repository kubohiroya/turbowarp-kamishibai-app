import assert from 'node:assert/strict';
import {test} from 'vitest';

import {
  createDsl4StoryCameraLifecycle,
  storyUsesPoseRecognition,
} from '../src/dsl4/platform/story-camera-lifecycle.js';
import {deferred, withDeadline} from './helpers/async-test-helpers.ts';

/** The camera side of the composition, as much of it as this lifecycle reaches for. */
interface CameraComposition {
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  isCameraRunning: () => boolean;
  hidePreview: () => void;
  isPreviewVisible: () => boolean;
  setPreviewOpacity: (opacity: number) => void;
  setPreviewPosition: (position: string) => void;
  stopRecognition: () => void;
  isRecognizing: () => boolean;
}

interface CameraFixture {
  readonly log: string[];
  readonly composition: CameraComposition;
}

function story(...commands: string[]) {
  return {
    kind: 'StoryDocument',
    version: '4.0',
    scenes: [{id: 'opening', actions: commands.map((command) => ({command, args: {}}))}],
  };
}

function cameraFixture({
  startGate = null,
}: {startGate?: ReturnType<typeof deferred<void>> | null} = {}): CameraFixture {
  const log: string[] = [];
  let cameraRunning = false;
  let previewVisible = true;
  let recognizing = false;
  return {
    log,
    composition: {
      async startCamera() {
        assert.equal(previewVisible, false, 'camera startup must not expose the default preview');
        log.push('camera.start');
        await startGate?.promise;
        cameraRunning = true;
      },
      stopCamera() {
        log.push('camera.stop');
        cameraRunning = false;
      },
      isCameraRunning: () => cameraRunning,
      hidePreview() {
        log.push('preview.hide');
        previewVisible = false;
      },
      isPreviewVisible: () => previewVisible,
      setPreviewOpacity(opacity: number) {
        log.push(`preview.opacity:${opacity}`);
      },
      setPreviewPosition(position: string) {
        log.push(`preview.position:${position}`);
      },
      stopRecognition() {
        log.push('recognition.stop');
        recognizing = false;
      },
      isRecognizing: () => recognizing,
    },
  };
}

test('detects only story actions that consume pose recognition', () => {
  assert.equal(storyUsesPoseRecognition(story('wait', 'pose')), true);
  assert.equal(storyUsesPoseRecognition(story('poseInputToChangeScene')), true);
  assert.equal(storyUsesPoseRecognition(story('wait', 'show')), false);
  assert.equal(
    storyUsesPoseRecognition({
      ...story('wait'),
      recognition: {preview: {mirroring: 'mirrored'}},
    }),
    false,
  );
});

test('starts one camera without showing preview and keeps it across repeated claims', async () => {
  const fixture = cameraFixture();
  const busy: boolean[] = [];
  const lifecycle = createDsl4StoryCameraLifecycle({
    composition: fixture.composition,
    setBusy: (event: {visible: boolean}) => busy.push(event.visible),
  });

  assert.equal(await lifecycle.start(), true);
  assert.equal(await lifecycle.start(), true);
  assert.deepEqual(fixture.log, [
    'preview.hide',
    'preview.opacity:0.2',
    'preview.position:full-stage',
    'camera.start',
  ]);
  assert.deepEqual(busy, [true, false]);

  assert.equal(await lifecycle.stop(), false);
  assert.deepEqual(fixture.log, [
    'preview.hide',
    'preview.opacity:0.2',
    'preview.position:full-stage',
    'camera.start',
    'camera.stop',
  ]);
});

test('stops a camera that finishes starting after the story has ended', async () => {
  const startGate = deferred();
  const fixture = cameraFixture({startGate});
  const lifecycle = createDsl4StoryCameraLifecycle({composition: fixture.composition});

  const starting = lifecycle.start();
  while (!fixture.log.includes('camera.start')) await Promise.resolve();
  assert.deepEqual(fixture.log, [
    'preview.hide',
    'preview.opacity:0.2',
    'preview.position:full-stage',
    'camera.start',
  ]);
  const stopping = lifecycle.stop();
  startGate.resolve();

  assert.equal(await starting, false);
  assert.equal(await stopping, false);
  assert.deepEqual(fixture.log, [
    'preview.hide',
    'preview.opacity:0.2',
    'preview.position:full-stage',
    'camera.start',
    'camera.stop',
  ]);
});

test('disposes before an unanswered camera request settles and releases its late camera', async () => {
  const startGate = deferred();
  const fixture = cameraFixture({startGate});
  const busy: boolean[] = [];
  const lifecycle = createDsl4StoryCameraLifecycle({
    composition: fixture.composition,
    setBusy: (event: {visible: boolean}) => busy.push(event.visible),
  });
  const starting = lifecycle.start();
  while (!fixture.log.includes('camera.start')) await Promise.resolve();

  try {
    const disposing = lifecycle.dispose();
    assert.strictEqual(lifecycle.dispose(), disposing);
    const result = await Promise.race([
      disposing,
      new Promise<string>((resolve) => setImmediate(() => resolve('pending'))),
    ]);
    assert.equal(result, false, 'Disposal must not await a browser permission response.');
    assert.equal(await starting, false);
    assert.equal(
      lifecycle.hasPendingCleanup(),
      true,
      'late camera ownership survives the initial successful disposal',
    );
    assert.deepEqual(busy, [true, false]);
    await assert.rejects(lifecycle.start(), /disposed/u);
  } finally {
    startGate.resolve();
  }
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(fixture.composition.isCameraRunning(), false);
  assert.equal(fixture.log.filter((entry) => entry === 'camera.stop').length, 1);
  assert.equal(lifecycle.hasPendingCleanup(), false);
});

test('reuses an unanswered camera request after stop without cancelling the new claim', async () => {
  const startGate = deferred();
  const fixture = cameraFixture({startGate});
  const lifecycle = createDsl4StoryCameraLifecycle({composition: fixture.composition});
  const firstStart = lifecycle.start();
  while (!fixture.log.includes('camera.start')) await Promise.resolve();

  try {
    const result = await Promise.race([
      lifecycle.stop(),
      new Promise<string>((resolve) => setImmediate(() => resolve('pending'))),
    ]);
    assert.equal(result, false, 'Stopping must not await a browser permission response.');
    const nextStart = lifecycle.start();
    assert.equal(await firstStart, false);
    startGate.resolve();
    assert.equal(await nextStart, true);
    assert.equal(fixture.composition.isCameraRunning(), true);
    assert.equal(fixture.log.filter((entry) => entry === 'camera.start').length, 1);
    assert.equal(fixture.log.filter((entry) => entry === 'camera.stop').length, 0);
    await lifecycle.dispose();
    assert.equal(fixture.composition.isCameraRunning(), false);
  } finally {
    startGate.resolve();
  }
});

test('ignores a late camera rejection after disposal without reviving queued starts', async () => {
  const startGate = deferred();
  const fixture = cameraFixture({startGate});
  const lifecycle = createDsl4StoryCameraLifecycle({composition: fixture.composition});
  const firstStart = lifecycle.start();
  const queuedStart = lifecycle.start();
  while (!fixture.log.includes('camera.start')) await Promise.resolve();

  try {
    assert.equal(
      await Promise.race([
        lifecycle.dispose(),
        new Promise<string>((resolve) => setImmediate(() => resolve('pending'))),
      ]),
      false,
    );
    assert.equal(await firstStart, false);
    assert.equal(await queuedStart, false);
  } finally {
    startGate.reject(new Error('Camera permission denied after disposal'));
  }
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(fixture.composition.isCameraRunning(), false);
  assert.equal(fixture.log.filter((entry) => entry === 'camera.start').length, 1);
});

test('invalidates a queued start when disposed before the camera request begins', async () => {
  const fixture = cameraFixture();
  const lifecycle = createDsl4StoryCameraLifecycle({composition: fixture.composition});
  const starting = lifecycle.start();
  assert.equal(await lifecycle.dispose(), false);
  assert.equal(await starting, false);
  assert.equal(fixture.log.includes('camera.start'), false);
});

test('still rejects camera failures while the story owns the active request', async () => {
  const startGate = deferred();
  const fixture = cameraFixture({startGate});
  const lifecycle = createDsl4StoryCameraLifecycle({composition: fixture.composition});
  const starting = lifecycle.start();
  while (!fixture.log.includes('camera.start')) await Promise.resolve();
  startGate.reject(new Error('Camera permission denied'));
  await assert.rejects(starting, /Camera permission denied/u);
  assert.equal(await lifecycle.dispose(), false);
});

test('stops preview, recognition, and camera exactly once during disposal', async () => {
  const fixture = cameraFixture();
  let cameraRunning = true;
  let previewVisible = true;
  let recognizing = true;
  fixture.composition.isCameraRunning = () => cameraRunning;
  fixture.composition.isPreviewVisible = () => previewVisible;
  fixture.composition.isRecognizing = () => recognizing;
  fixture.composition.stopCamera = () => {
    fixture.log.push('camera.stop');
    cameraRunning = false;
  };
  fixture.composition.hidePreview = () => {
    fixture.log.push('preview.hide');
    previewVisible = false;
  };
  fixture.composition.stopRecognition = () => {
    fixture.log.push('recognition.stop');
    recognizing = false;
  };
  const lifecycle = createDsl4StoryCameraLifecycle({composition: fixture.composition});

  const first = lifecycle.dispose();
  const second = lifecycle.dispose();
  assert.strictEqual(second, first);
  assert.equal(await first, false);
  assert.deepEqual(fixture.log, ['preview.hide', 'recognition.stop', 'camera.stop']);
  await assert.rejects(lifecycle.start(), /disposed/u);
});

for (const whileSettling of [false, true]) {
  test(`retries late camera cleanup without losing failures (while settling: ${whileSettling})`, async () => {
    const startGate = deferred();
    const fixture = cameraFixture({startGate});
    const stop = fixture.composition.stopCamera;
    const lateFailure = deferred<unknown>();
    const failure = new Error('late camera cleanup failed');
    let stops = 0;
    let nested: Promise<boolean> | undefined;
    fixture.composition.stopCamera = () => {
      if (++stops <= 2) {
        nested = lifecycle.dispose();
        void nested.catch(() => {});
        throw failure;
      }
      stop();
    };
    const lifecycle = createDsl4StoryCameraLifecycle({
      composition: fixture.composition,
      onCleanupError(error: unknown) {
        lateFailure.resolve(error);
        return Promise.reject(new Error('diagnostic observer failed'));
      },
    });
    const starting = lifecycle.start();
    while (!fixture.log.includes('camera.start')) await Promise.resolve();
    const disposing = lifecycle.dispose();
    if (whileSettling) startGate.resolve();
    assert.equal(await disposing, false);
    assert.equal(await starting, false);
    if (!whileSettling) {
      assert.equal(stops, 0);
      startGate.resolve();
    }
    assert.equal(
      await withDeadline(lateFailure.promise, 'late camera cleanup error', 3000),
      failure,
    );
    assert(nested);
    await assert.rejects(nested, (error) => error === failure);
    assert.equal(lifecycle.getCleanupError(), failure);
    assert.equal(lifecycle.hasPendingCleanup(), true);
    assert.equal(fixture.composition.isCameraRunning(), true);
    await assert.rejects(lifecycle.stop(), (error) => error === failure);
    assert.equal(stops, 1);
    const retry = lifecycle.dispose();
    assert.strictEqual(lifecycle.dispose(), retry);
    await assert.rejects(retry, (error) => error === failure);
    await assert.rejects(lifecycle.start(), /disposed/u);
    await lifecycle.dispose();
    assert.equal(stops, 3);
    assert.equal(fixture.composition.isCameraRunning(), false);
    assert.equal(lifecycle.hasPendingCleanup(), false);
    assert.equal(lifecycle.getCleanupError(), null);
    await lifecycle.dispose();
    assert.equal(stops, 3);
  });
}

test('prepares the preview where the story asked for it', async () => {
  const fixture = cameraFixture();
  const lifecycle = createDsl4StoryCameraLifecycle({
    composition: fixture.composition,
    previewPosition: 'bottom-right',
    previewOpacity: 0.75,
  });

  assert.equal(await lifecycle.start(), true);
  assert.deepEqual(fixture.log, [
    'preview.hide',
    'preview.opacity:0.75',
    'preview.position:bottom-right',
    'camera.start',
  ]);
});

test('refuses a preview placement the source frontend never validated', () => {
  const fixture = cameraFixture();
  assert.throws(
    () =>
      createDsl4StoryCameraLifecycle({
        composition: fixture.composition,
        previewPosition: 'top-center',
      }),
    /story camera preview position must be one of/u,
  );
  assert.throws(
    () => createDsl4StoryCameraLifecycle({composition: fixture.composition, previewOpacity: 1.5}),
    /story camera preview opacity must be a finite number from 0 to 1/u,
  );
  assert.deepEqual(fixture.log, []);
});
