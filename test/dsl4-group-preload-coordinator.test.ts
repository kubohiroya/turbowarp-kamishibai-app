import assert from 'node:assert/strict';
import {test} from 'vitest';
import {createDsl4GroupPreloadCoordinator} from '../src/dsl4/group-preload-coordinator.js';
import {createVideoAssetFixture} from './helpers/dsl4-video-asset-fixture.ts';
import {dsl4TestSourceFrontend as frontend} from './helpers/dsl4-test-frontend.ts';
import {deferred, waitUntil, withDeadline} from './helpers/async-test-helpers.ts';

test('back-to-back startup requests cancel older requests without waiting on themselves', async () => {
  const fixture = await createVideoAssetFixture();
  const owner = createDsl4GroupPreloadCoordinator({
    storyDocument: fixture.storyDocument,
    segmentId: 'startup-burst',
    lifecycle: fixture.lifecycle,
  });
  const first = owner.prepareStartup(1);
  const second = owner.prepareStartup(2);
  const latest = owner.prepareStartup(3);
  const results = await withDeadline(Promise.all([first, second, latest]), 'startup burst', 1000);
  assert.deepEqual(results[0], {ok: false, cancelled: true});
  assert.deepEqual(results[1], {ok: false, cancelled: true});
  assert(results[2].ok);
  owner.beginScene('first', 3);
  assert((await owner.waitForScene('first')).ok);
  await owner.commitScene('first', 'entry');
  await fixture.show('movie', 'Movie');
  assert(fixture.liveUrls.size > 0);
  await owner.release('dispose');
  assert.equal(fixture.liveUrls.size, 0);
});

test('eager scene assets are prepared at startup, released on first commit, and prepared again when used', async () => {
  const parsed = frontend.parse(`kamishibai: '4.0'
assets:
  First: {kind: backdrop, name: First, loading: eager, retention: scene}
  Later: {kind: backdrop, name: Later, loading: eager, retention: scene}
scenes:
  first:
    - stage: First
  next:
    - stage: Later
`);
  assert(parsed.ok, JSON.stringify(parsed.diagnostics));
  const live = new Set<string>();
  const prepared: string[][] = [];
  const owner = createDsl4GroupPreloadCoordinator({
    storyDocument: parsed.storyDocument,
    segmentId: 'eager',
    lifecycle: {
      prepare(payload) {
        const ids = payload.assetIds as string[];
        prepared.push([...ids]);
        for (const id of ids) live.add(id);
      },
      releaseAssets({assetIds}) {
        for (const id of assetIds) live.delete(id);
      },
      setLoading() {},
      release() {
        live.clear();
      },
    },
  });
  assert((await owner.prepareStartup(0)).ok);
  assert.deepEqual([...live].sort(), ['First', 'Later']);
  owner.beginScene('first', 1);
  assert((await owner.waitForScene('first')).ok);
  assert.deepEqual([...live].sort(), ['First', 'Later']);
  await owner.commitScene('first', 'entry');
  assert.deepEqual([...live], ['First']);
  owner.beginScene('next', 2);
  assert((await owner.waitForScene('next')).ok);
  assert.deepEqual([...live].sort(), ['First', 'Later']);
  await owner.commitScene('next', 'transition');
  assert.deepEqual([...live], ['Later']);
  assert.deepEqual(prepared, [['First', 'Later'], ['Later']]);
  await owner.release('dispose');
  assert.equal(live.size, 0);
});

test('committed scene cleanup failure is returned separately and later operations retry it', async () => {
  const fixture = await createVideoAssetFixture();
  let fail = true;
  const owner = createDsl4GroupPreloadCoordinator({
    storyDocument: fixture.storyDocument,
    segmentId: 'cleanup-retry',
    lifecycle: {
      ...fixture.lifecycle,
      releaseAssets(payload) {
        if (fail) throw new Error('decoder cleanup failed');
        return fixture.lifecycle.releaseAssets(payload);
      },
    },
  });
  assert((await owner.prepareStartup(0)).ok);
  owner.beginScene('first', 1);
  assert((await owner.waitForScene('first')).ok);
  await owner.commitScene('first', 'entry');
  await fixture.show('movie', 'Movie');
  const movie = fixture.videos[0]!;
  owner.beginScene('next', 2);
  assert((await owner.waitForScene('next')).ok);
  const result = await owner.commitScene('next', 'transition');
  assert(result.cleanupError instanceof Error);
  assert(movie.src);
  assert(owner.snapshot().groupIds.includes('segment:cleanup-retry:scene:next'));
  assert.deepEqual(owner.snapshot().pendingReleaseAssetIds, ['Movie']);
  fail = false;
  owner.beginScene('next', 3);
  assert((await owner.waitForScene('next')).ok);
  await owner.commitScene('next', 'retry');
  assert.equal(movie.src, '');
  assert.deepEqual(owner.snapshot().pendingReleaseAssetIds, []);
  await owner.release('dispose');
  assert.equal(fixture.liveUrls.size, 0);
});

test('coordinator retains failed disposal tracking until explicit cleanup retry succeeds', async () => {
  const fixture = await createVideoAssetFixture();
  let fail = true;
  const owner = createDsl4GroupPreloadCoordinator({
    storyDocument: fixture.storyDocument,
    segmentId: 'dispose-retry',
    lifecycle: {
      ...fixture.lifecycle,
      releaseAssets(payload) {
        if (fail) throw new Error('decoder cleanup failed');
        return fixture.lifecycle.releaseAssets(payload);
      },
      release(payload) {
        if (fail) throw new Error('session cleanup failed');
        return fixture.lifecycle.release(payload);
      },
    },
  });
  assert((await owner.prepareStartup(0)).ok);
  owner.beginScene('first', 1);
  assert((await owner.waitForScene('first')).ok);
  await owner.commitScene('first', 'entry');
  await fixture.show('movie', 'Movie');
  await assert.rejects(owner.release('stop'), /coordinator cleanup failed/);
  assert.deepEqual(owner.snapshot().pendingReleaseAssetIds, ['Movie', 'Shared']);
  assert.equal(fixture.liveUrls.size, 2);
  fail = false;
  await owner.release('retry-stop');
  assert.deepEqual(owner.snapshot().pendingReleaseAssetIds, []);
  assert.equal(fixture.liveUrls.size, 0);
  assert((await owner.prepareStartup(2)).ok);
  await owner.release('dispose');
});

for (const failedRestart of [false, true])
  test(`restart after cleanup failure ${failedRestart ? 'can fail again without poisoning later cleanup' : 'retries cleanup before preparing assets'}`, async () => {
    const fixture = await createVideoAssetFixture();
    let fail = true;
    const owner = createDsl4GroupPreloadCoordinator({
      storyDocument: fixture.storyDocument,
      segmentId: 'restart-retry',
      lifecycle: {
        ...fixture.lifecycle,
        release(payload) {
          if (fail) throw new Error('base cleanup failed');
          return fixture.lifecycle.release(payload);
        },
      },
    });
    assert((await owner.prepareStartup(0)).ok);
    owner.beginScene('first', 1);
    assert((await owner.waitForScene('first')).ok);
    await owner.commitScene('first', 'entry');
    await assert.rejects(owner.release('stop'), /coordinator cleanup failed/);
    if (failedRestart) {
      assert.equal((await owner.prepareStartup(2)).ok, false);
      fail = false;
      await owner.release('retry-stop');
    } else fail = false;
    assert((await owner.prepareStartup(3)).ok);
    owner.beginScene('first', 3);
    assert((await owner.waitForScene('first')).ok);
    await owner.commitScene('first', 'restart');
    await fixture.show('movie', 'Movie');
    await owner.release('dispose');
    assert.equal(fixture.liveUrls.size, 0);
  });

test('the latest restart wins while failed cleanup is being retried', async () => {
  const fixture = await createVideoAssetFixture();
  let fail = true,
    retrying = false;
  const gate = deferred();
  const owner = createDsl4GroupPreloadCoordinator({
    storyDocument: fixture.storyDocument,
    segmentId: 'concurrent-restart',
    lifecycle: {
      ...fixture.lifecycle,
      async release(payload) {
        if (fail) throw new Error('cleanup failed');
        if (payload.reason === 'startup-cleanup-retry') {
          retrying = true;
          await gate.promise;
        }
        return fixture.lifecycle.release(payload);
      },
    },
  });
  assert((await owner.prepareStartup(0)).ok);
  await assert.rejects(owner.release('stop'));
  fail = false;
  const first = owner.prepareStartup(1);
  await waitUntil(() => retrying);
  const second = owner.prepareStartup(2);
  gate.resolve();
  const results = await withDeadline(
    Promise.all([first, second]),
    'concurrent restart cleanup',
    1000,
  );
  assert.deepEqual(results[0], {ok: false, cancelled: true});
  assert(results[1].ok);
  owner.beginScene('first', 2);
  assert((await owner.waitForScene('first')).ok);
  await owner.commitScene('first', 'restart');
  await owner.release('dispose');
});

test('group coordinator purges scene video only after commit and keeps shared video owned', async () => {
  const fixture = await createVideoAssetFixture();
  const owner = createDsl4GroupPreloadCoordinator({
    storyDocument: fixture.storyDocument,
    segmentId: 'a',
    lifecycle: fixture.lifecycle,
  });
  assert((await owner.prepareStartup(0)).ok);
  owner.beginScene('first', 1);
  assert((await owner.waitForScene('first')).ok);
  await owner.commitScene('first', 'start');
  await fixture.show('movie', 'Movie');
  await fixture.show('shared', 'Shared');
  const movie = fixture.videos[0]!;
  const shared = fixture.videos[1]!;
  owner.beginScene('next', 2);
  assert((await owner.waitForScene('next')).ok);
  assert(movie.src);
  assert(shared.src);
  assert.equal(fixture.revoked.length, 0);
  await owner.commitScene('next', 'next');
  assert.equal(movie.src, '');
  assert(shared.src);
  assert.equal(fixture.revoked.length, 1);
  assert.deepEqual(Object.keys(owner.snapshot().assetReferences), ['Shared']);
  await owner.release('stop');
  assert.equal(shared.src, '');
  assert.equal(fixture.liveUrls.size, 0);
  assert((await owner.prepareStartup(3)).ok);
  owner.beginScene('first', 3);
  assert((await owner.waitForScene('first')).ok);
  await owner.commitScene('first', 'restart');
  await owner.release('dispose');
  assert.equal(fixture.liveUrls.size, 0);
});

test('group coordinator holds committed resources on candidate failure and cancellation', async () => {
  const fixture = await createVideoAssetFixture();
  let fail = false;
  let gate: (() => void) | null = null;
  const owner = createDsl4GroupPreloadCoordinator({
    storyDocument: fixture.storyDocument,
    segmentId: 'b',
    lifecycle: {
      ...fixture.lifecycle,
      async prepare(payload, context) {
        if (fail) throw new Error('network unavailable');
        if (context.generation === 3)
          await new Promise<void>((resolve) => {
            gate = resolve;
          });
        await fixture.lifecycle.prepare(payload, context);
      },
    },
  });
  assert((await owner.prepareStartup(0)).ok);
  owner.beginScene('next', 1);
  assert((await owner.waitForScene('next')).ok);
  await owner.commitScene('next', 'start');
  await fixture.show('shared', 'Shared');
  const shared = fixture.videos[0]!;
  const before = owner.snapshot();
  const url = shared.src;
  fail = true;
  owner.beginScene('first', 2);
  const failed = await owner.waitForScene('first');
  assert(!failed.ok && !failed.cancelled);
  assert.deepEqual(owner.snapshot(), before);
  assert.equal(shared.src, url);
  fail = false;
  owner.beginScene('first', 3);
  while (!gate) await new Promise((resolve) => setTimeout(resolve, 1));
  owner.cancel('user');
  (gate as () => void)();
  owner.beginScene('next', 4);
  assert((await owner.waitForScene('next')).ok);
  await owner.commitScene('next', 'retry');
  assert.equal(shared.src, url);
  assert.deepEqual(owner.snapshot(), before);
  await owner.release('dispose');
  assert.equal(shared.src, '');
  assert.equal(fixture.liveUrls.size, 0);
});

test('controller-style unawaited cleanup is contained while explicit owners receive its failure', async () => {
  const fixture = await createVideoAssetFixture();
  const owner = createDsl4GroupPreloadCoordinator({
    storyDocument: fixture.storyDocument,
    segmentId: 'cleanup',
    lifecycle: {
      ...fixture.lifecycle,
      async release(payload) {
        await fixture.lifecycle.release(payload);
        throw new Error('base cleanup failed');
      },
    },
  });
  assert((await owner.prepareStartup(0)).ok);
  owner.beginScene('first', 1);
  assert((await owner.waitForScene('first')).ok);
  await owner.commitScene('first', 'start');
  await fixture.show('movie', 'Movie');
  const cleanup = owner.release('stop');
  await new Promise((resolve) => setTimeout(resolve, 10));
  await assert.rejects(cleanup, /Asset group coordinator cleanup failed/);
  assert.equal(fixture.liveUrls.size, 0);
  assert(fixture.videos.every((video) => video.src === ''));
});

test('startup cancellation aborts the actual preparation signal and releases partially acquired boot assets', async () => {
  const {dsl4TestSourceFrontend: frontend} = await import('./helpers/dsl4-test-frontend.ts');
  const parsed = frontend.parse(
    "kamishibai: '4.0'\nassets:\n  Cover: {kind: backdrop, name: Cover}\ncover: {backdrop: Cover}\nscenes:\n  first:\n    - wait: 1\n",
    {sourceId: 'startup-cancel'},
  );
  assert(parsed.ok, JSON.stringify(parsed.diagnostics));
  let signal: AbortSignal | undefined;
  const released: string[] = [];
  const loading: boolean[] = [];
  const owner = createDsl4GroupPreloadCoordinator({
    storyDocument: parsed.storyDocument,
    segmentId: 'a',
    lifecycle: {
      async prepare(_payload, context) {
        signal = context.signal;
        await new Promise<void>((_resolve, reject) =>
          signal!.addEventListener(
            'abort',
            () => reject(new DOMException('Cancelled', 'AbortError')),
            {once: true},
          ),
        );
      },
      setLoading(payload) {
        loading.push(payload.visible === true);
      },
      releaseAssets(payload) {
        released.push(...payload.assetIds);
      },
      release() {},
    },
  });
  const startup = owner.prepareStartup(0);
  while (!signal) await new Promise((resolve) => setTimeout(resolve, 0));
  owner.cancel('stop');
  assert.equal(signal.aborted, true);
  assert.deepEqual(await startup, {ok: false, cancelled: true});
  await owner.release('dispose');
  assert.deepEqual(released, ['Cover']);
  assert.deepEqual(loading, [true, false]);
  assert.deepEqual(owner.snapshot().assetReferences, {});
});

test('group loading presentation brackets startup and scene waits, including failure and cancellation', async () => {
  const fixture = await createVideoAssetFixture();
  const loading: {visible: unknown; sceneId: unknown}[] = [];
  let fail = false;
  const owner = createDsl4GroupPreloadCoordinator({
    storyDocument: fixture.storyDocument,
    segmentId: 'a',
    lifecycle: {
      ...fixture.lifecycle,
      async prepare(payload, context) {
        if (fail) throw new Error('load failed');
        await fixture.lifecycle.prepare(payload, context);
      },
      setLoading(payload) {
        loading.push({visible: payload.visible, sceneId: payload.sceneId});
      },
    },
  });
  assert((await owner.prepareStartup(0)).ok);
  owner.beginScene('next', 1);
  assert((await owner.waitForScene('next')).ok);
  await owner.commitScene('next', 'start');
  fail = true;
  owner.beginScene('first', 2);
  assert.equal((await owner.waitForScene('first')).ok, false);
  assert.deepEqual(loading, [
    {visible: true, sceneId: null},
    {visible: false, sceneId: null},
    {visible: true, sceneId: 'next'},
    {visible: false, sceneId: 'next'},
    {visible: true, sceneId: 'first'},
    {visible: false, sceneId: 'first'},
  ]);
  await owner.release('dispose');
});

test('startup materializes loading artwork before presenting it while boot content is prepared', async () => {
  const {dsl4TestSourceFrontend: frontend} = await import('./helpers/dsl4-test-frontend.ts');
  const parsed = frontend.parse(
    "kamishibai: '4.0'\nassets:\n  Loading: {kind: backdrop, name: Loading}\n  Spinner: {kind: costume, target: Loader, name: Spinner}\n  Cover: {kind: backdrop, name: Cover}\ncover: {backdrop: Cover}\nloading: {backdrop: Loading, costumes: [Spinner]}\nscenes:\n  first:\n    - wait: 1\n",
    {sourceId: 'loading-bootstrap'},
  );
  assert(parsed.ok, JSON.stringify(parsed.diagnostics));
  const materialized = new Set<string>();
  const prepared: unknown[] = [];
  const owner = createDsl4GroupPreloadCoordinator({
    storyDocument: parsed.storyDocument,
    segmentId: 'a',
    lifecycle: {
      prepare(payload) {
        const ids = payload.assetIds as string[];
        prepared.push([...ids]);
        for (const id of ids) materialized.add(id);
      },
      setLoading(payload) {
        if (payload.visible && payload.loading) {
          assert(materialized.has('Loading'));
          assert(!materialized.has('Cover'));
        }
      },
      releaseAssets(payload) {
        for (const id of payload.assetIds) materialized.delete(id);
      },
      release() {},
    },
  });
  assert((await owner.prepareStartup(0)).ok);
  assert.deepEqual(prepared, [['Loading', 'Spinner'], ['Cover']]);
  await owner.release('dispose');
  assert.equal(materialized.size, 0);
});

test('recognition models load in the background beside the scene groups and are waited for only on request', async () => {
  const parsed = frontend.parse(`kamishibai: '4.0'
assets:
  Tick: sound
  Charge: sound
  HeroIdle: costume:Hero
  Beach: backdrop
  Ocean: backdrop
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
  SeaPose:
    kind: recognitionModel
    file: pose-models/sea
actors:
  Hero: HeroIdle
recognition:
  idleSound: Tick
  chargeSound: Charge
scenes:
  rescue:
    recognitionModel: RescuePose
    actions:
      - stage: Beach
      - Hero.pose:
          steps:
            - pose: help
      - goto: sea
  sea:
    recognitionModel: SeaPose
    actions:
      - stage: Ocean
      - Hero.pose:
          steps:
            - pose: swim
`);
  assert(parsed.ok, JSON.stringify(parsed.diagnostics));
  const models = new Map([
    ['RescuePose', deferred<void>()],
    ['SeaPose', deferred<void>()],
  ]);
  const live = new Set<string>();
  const prepared: string[][] = [];
  const released: string[][] = [];
  const events: string[] = [];
  const owner = createDsl4GroupPreloadCoordinator({
    storyDocument: parsed.storyDocument,
    segmentId: 'models',
    onEvent: (type, details) =>
      events.push(`${type}:${(details.assetIds as string[] | undefined)?.join() ?? ''}`),
    lifecycle: {
      async prepare(payload, {signal}) {
        const ids = payload.assetIds as string[];
        prepared.push([...ids]);
        // A model resolves when the test says so; an aborted load gives up.
        await Promise.all(
          ids.map((id) => {
            const model = models.get(id);
            if (!model) return undefined;
            return Promise.race([
              model.promise,
              new Promise((_, reject) =>
                signal.addEventListener('abort', () => reject(new Error('aborted')), {once: true}),
              ),
            ]);
          }),
        );
        for (const id of ids) live.add(id);
      },
      releaseAssets({assetIds}) {
        released.push([...assetIds]);
        for (const id of assetIds) live.delete(id);
      },
      setLoading() {},
      release() {
        live.clear();
      },
    },
  });
  assert((await owner.prepareStartup(0)).ok);
  assert.equal(prepared.flat().includes('RescuePose'), false, 'startup must not load a model');

  owner.beginScene('rescue', 1);
  // The scene is ready while its model is still loading.
  assert((await withDeadline(owner.waitForScene('rescue'), 'scene entry', 1000)).ok);
  await owner.commitScene('rescue', 'entry');
  assert.equal(live.has('RescuePose'), false);
  assert(events.includes('assets.background.start:RescuePose'));
  assert.equal(prepared.flat().includes('SeaPose'), false, 'a later scene model must wait');

  // The recognition action waits only for the model that is still loading.
  const signal = new AbortController().signal;
  const waited = owner.waitForSceneAsset('rescue', 'RescuePose', 1, signal);
  await waitUntil(() => events.includes('assets.background.wait.start:RescuePose'));
  models.get('RescuePose')!.resolve();
  assert((await withDeadline(waited, 'model wait', 1000)).ok);
  assert(live.has('RescuePose'));
  assert(events.includes('assets.background.wait.end:RescuePose'));
  // Once loaded, the wait returns without preparing again.
  const before = prepared.length;
  assert((await owner.waitForSceneAsset('rescue', 'RescuePose', 1, signal)).ok);
  assert.equal(prepared.length, before);

  // Moving on releases the previous model only when the next scene commits.
  owner.beginScene('sea', 2);
  assert((await withDeadline(owner.waitForScene('sea'), 'next scene entry', 1000)).ok);
  assert(live.has('RescuePose'));
  await owner.commitScene('sea', 'transition');
  await waitUntil(() => !live.has('RescuePose'));
  assert(events.includes('assets.background.start:SeaPose'));

  // Release stops the load still running.
  await owner.release('dispose');
  assert.equal(live.size, 0);
});
