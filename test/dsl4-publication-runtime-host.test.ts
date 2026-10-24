import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test, vi} from 'vitest';
import {createFakeDocument} from './helpers/fake-dom.ts';
import {deferred, waitUntil, withDeadline} from './helpers/async-test-helpers.ts';
import {dsl4TestSourceFrontend as frontend} from './helpers/dsl4-test-frontend.ts';
import {canonicalizeDsl4Source} from '../src/dsl4/source-canonicalizer.js';
import {createVerifiedRemoteBinaryCache} from '@kubohiroya/turbowarp-asset-cache/composition';
import {IDBFactory} from 'fake-indexeddb';
import {createDsl4StoryCameraLifecycle} from '../src/dsl4/platform/story-camera-lifecycle.js';

type Result = Readonly<Record<string, unknown>>;
type MockOptions = {
  publicationSegmentId: string;
  createHostPort(
    context: unknown,
  ): Promise<{gotoSegment(payload: Result, context: unknown): Promise<Result>}>;
  setLoading(payload: Result, context: Result): unknown;
};
type HostRecord = {
  id: string;
  attached: boolean;
  pointer: boolean;
  disposed: boolean;
  disposeCalls: number;
  runs: ReturnType<typeof deferred<Result>>[];
  port: Awaited<ReturnType<MockOptions['createHostPort']>>;
  options: MockOptions;
};
const records = vi.hoisted(() => ({
  hosts: [] as HostRecord[],
  fail: false,
  attachFailure: false,
  dispose: null as null | ((state: HostRecord) => unknown),
  pendingCleanup: null as null | ((state: HostRecord) => boolean),
  prepare: null as null | ((signal?: AbortSignal) => Promise<void>),
}));
vi.mock('../src/dsl4/platform/turbowarp-runtime-host.js', () => ({
  async createDsl4TurboWarpRuntimeHost(options: MockOptions) {
    const state: HostRecord = {
      id: options.publicationSegmentId,
      attached: false,
      pointer: false,
      disposed: false,
      disposeCalls: 0,
      runs: [],
      port: await options.createHostPort({}),
      options,
    };
    records.hosts.push(state);
    return {
      ok: true,
      enabled: true,
      diagnostics: [],
      host: {
        async preparePublicationScene(_scene: string, signal?: AbortSignal) {
          options.setLoading({visible: true}, {});
          options.setLoading({visible: false}, {});
          if (records.fail) throw new Error('prepare failed');
          await records.prepare?.(signal);
        },
        async prepareMenu() {
          return true;
        },
        start() {
          const run = deferred<Result>();
          state.runs.push(run);
          return run.promise;
        },
        stop() {
          for (const run of state.runs) run.resolve({status: 'stopped'});
        },
        attach() {
          if (records.attachFailure && state.id === 'b') throw new Error('attach failed');
          state.attached = true;
        },
        detach() {
          state.attached = false;
        },
        attachStagePointer() {
          state.pointer = true;
        },
        detachStagePointer() {
          state.pointer = false;
        },
        hasPendingCleanup: () => records.pendingCleanup?.(state) ?? false,
        async dispose() {
          state.disposeCalls++;
          await records.dispose?.(state);
          state.disposed = true;
          state.attached = false;
          state.pointer = false;
          for (const run of state.runs) run.resolve({status: 'stopped'});
          await Promise.all(state.runs.map((run) => run.promise));
        },
        getState: () => ({runtime: {variables: {marker: state.id}}}),
        getAssetGroupSnapshot: () => ({id: state.id}),
      },
    };
  },
}));
import {createDsl4PublicationRuntimeHost} from '../src/dsl4/platform/publication-runtime-host.js';

async function fixture(
  backward = false,
  document = createFakeDocument(),
  failEntry = false,
  overrides: {sourceB?: string; options?: Record<string, unknown>} = {},
) {
  records.hosts = [];
  records.fail = failEntry;
  records.attachFailure = false;
  records.prepare = null;
  records.dispose = null;
  records.pendingCleanup = null;
  const source = "kamishibai: '4.0'\nscenes:\n  first:\n    - wait: 60\n";
  const sourceB = overrides.sourceB ?? source;
  const sourceOf = (id: string) => (id === 'b' ? sourceB : source);
  const manifest = {
    formatVersion: 1,
    id: 'book',
    title: 'Book',
    entrySegment: 'a',
    entryPoints: ['a', 'b'],
    segments: ['a', 'b'].map((id, i) => ({
      id,
      title: id,
      next: i ? (backward ? ['a'] : []) : ['b'],
      source: {
        entry: id + '.k4.yml',
        size: new TextEncoder().encode(sourceOf(id)).length,
        integrity: 'sha256-' + createHash('sha256').update(sourceOf(id)).digest('hex'),
      },
    })),
  };
  const project = {
    baseMarker: 'initial',
    extensionStorage: {
      kubohiroyakamishibai4: {
        components: {},
        publication: {
          formatVersion: 1,
          manifest,
          sources: {'a.k4.yml': source, 'b.k4.yml': sourceB},
          components: {
            a: {source: {text: canonicalizeDsl4Source(source)}},
            b: {source: {text: canonicalizeDsl4Source(sourceB)}},
          },
        },
      },
    },
  };
  const state = {
    abort: null as AbortController | null,
    stageDispose: null as null | (() => unknown),
  };
  const stages: {disposed: boolean; element: ReturnType<typeof document.createElement>}[] = [];
  const markers: unknown[] = [];
  const loading: unknown[] = [];
  const result = await createDsl4PublicationRuntimeHost({
    ...overrides.options,
    project,
    sourceFrontend: frontend,
    document: document as unknown as Document,
    publicationMount: document.body as unknown as HTMLElement,
    setLoading(payload) {
      loading.push(payload);
    },
    async createPublicationStage(candidate, _signal, stageMount) {
      markers.push(candidate.baseMarker);
      const element = document.createElement('section');
      stageMount!.appendChild(element as unknown as HTMLElement);
      const stage = {disposed: false, element};
      stages.push(stage);
      state.abort?.abort();
      return {
        runtime: {},
        element: element as unknown as HTMLElement,
        dispose() {
          state.stageDispose?.();
          stage.disposed = true;
          element.remove();
        },
      };
    },
  });
  const owner = result.host!;
  const go = (id: string, signal?: AbortSignal) =>
    records.hosts.find((host) => !host.disposed)!.port.gotoSegment({segment: id}, {signal});
  return {owner, go, document, stages, markers, project, state, loading};
}

test('only scenario actions switch chapters; failed/cancelled candidates keep ownership and a transfer does not deadlock disposal', async () => {
  const f = await fixture();
  const extra = f.owner as unknown as {
    transitionPublication?: unknown;
    getPublicationState(): {segmentId: string};
  };
  assert.equal(extra.transitionPublication, undefined);
  const controls = f.document.body.children
    .flatMap((child) => child.children)
    .find((child) => child.dataset.dsl4Publication === 'true');
  assert(controls);
  assert.equal(
    controls.children.some((child) => child.tagName === 'SELECT'),
    false,
  );
  assert.deepEqual(
    controls.children
      .filter((child) => child.tagName === 'BUTTON')
      .map((child) => child.textContent),
    [
      'Save SB3 / SB3を保存',
      'Save SB3 without YAML / YAMLなしでSB3を保存',
      'Save SB3 with password / パスワード付きでSB3を保存',
    ],
  );
  f.project.baseMarker = 'edited';
  f.owner.attach(f.document);
  const run = f.owner.start();
  const original = f.owner.getState();
  records.fail = true;
  assert.deepEqual(await f.go('b'), {outcome: 'retained'});
  assert.deepEqual(f.owner.getState(), original);
  assert(records.hosts[0]!.attached);
  assert(f.stages[1]!.disposed);
  records.fail = false;
  f.state.abort = new AbortController();
  assert.deepEqual(await f.go('b', f.state.abort.signal), {outcome: 'retained'});
  assert(f.stages[2]!.disposed);
  f.state.abort = null;
  records.attachFailure = true;
  assert.deepEqual(await f.go('b'), {outcome: 'retained'});
  assert(records.hosts[0]!.attached && records.hosts[0]!.pointer);
  records.attachFailure = false;
  assert.deepEqual(await f.go('b'), {outcome: 'committed'});
  await waitUntil(() => records.hosts.at(-1)!.runs.length === 1);
  assert.equal(f.owner.getRunPromise(), run);
  assert(records.hosts[0]!.disposed);
  assert.equal(extra.getPublicationState().segmentId, 'b');
  assert.equal(records.hosts.filter((host) => host.attached).length, 1);
  await assert.rejects(f.go('a'), /not declared/);
  records.hosts.at(-1)!.runs[0]!.resolve({status: 'finished'});
  assert.equal(((await run) as Result).status, 'finished');
  const disposed = f.owner.dispose();
  assert.equal(f.owner.dispose(), disposed);
  await disposed;
  assert(f.markers.every((marker) => marker === 'initial'));
  assert(f.stages.every((stage) => stage.disposed));
});

test('superseded start cannot complete the new run on the same chapter host', async () => {
  const f = await fixture();
  const first = f.owner.start();
  const second = f.owner.start();
  assert.equal(((await first) as Result).status, 'stopped');
  records.hosts[0]!.runs[0]!.resolve({status: 'stopped'});
  await Promise.resolve();
  assert.equal(f.owner.getRunPromise(), second);
  let completed = false;
  void second.then(() => {
    completed = true;
  });
  await Promise.resolve();
  assert.equal(completed, false);
  records.hosts[0]!.runs[1]!.resolve({status: 'finished'});
  assert.equal(((await second) as Result).status, 'finished');
  await f.owner.prepareMenu();
  const stage = f.stages.at(-1)!.element;
  assert.equal(stage.style.display, 'none');
  const layout = f.document.body.children.find((child) => child.dataset.dsl4PublicationLayout)!;
  assert.equal(layout.style.display, 'none');
  const third = f.owner.start();
  assert.equal(stage.style.display, '');
  assert.equal(layout.style.display, 'grid');
  f.owner.stop('done');
  await third;
  await f.owner.dispose();
});

test('stop aborts chapter preparation and cannot start the cancelled candidate afterward', async () => {
  const digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  const digestMock = vi
    .spyOn(globalThis.crypto.subtle, 'digest')
    .mockImplementation(async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      return digest(...args);
    });
  try {
    const f = await fixture();
    const preparationStarted = deferred();
    try {
      const run = f.owner.start();
      let signal: AbortSignal | undefined;
      records.prepare = async (candidateSignal) => {
        signal = candidateSignal;
        preparationStarted.resolve();
        await new Promise<void>((_resolve, reject) => {
          signal!.addEventListener(
            'abort',
            () => reject(new DOMException('Stopped', 'AbortError')),
            {
              once: true,
            },
          );
        });
      };
      const transfer = f.go('b');
      await withDeadline(preparationStarted.promise, 'candidate chapter preparation', 5000);
      f.owner.stop('user-stop');
      assert.equal(signal!.aborted, true);
      assert.equal(((await run) as Result).status, 'stopped');
      assert.deepEqual(await transfer, {outcome: 'retained'});
      await f.owner.dispose();
      assert(f.stages.every((stage) => stage.disposed));
      assert.equal(records.hosts.at(-1)!.runs.length, 0);
    } finally {
      await f.owner.dispose();
    }
  } finally {
    digestMock.mockRestore();
  }
});

test('loading from committed chapters is forwarded and hidden candidates cannot change global loading', async () => {
  const f = await fixture();
  assert.equal(f.loading.length, 0);
  records.hosts[0]!.options.setLoading({visible: true}, {});
  assert.deepEqual(f.loading, [{visible: true}]);
  const run = f.owner.start();
  records.fail = true;
  await f.go('b');
  assert.equal(f.loading.length, 1);
  f.owner.stop('done');
  await run;
  await f.owner.dispose();
});

test('restart waits for aborted chapter preparation cleanup before starting a new run', async () => {
  const f = await fixture();
  const preparationStarted = deferred();
  try {
    const first = f.owner.start();
    let signal: AbortSignal | undefined;
    records.prepare = async (candidateSignal) => {
      signal = candidateSignal;
      preparationStarted.resolve();
      await new Promise<void>((_resolve, reject) =>
        signal!.addEventListener(
          'abort',
          () => reject(new DOMException('Restarted', 'AbortError')),
          {
            once: true,
          },
        ),
      );
    };
    const transfer = f.go('b');
    await withDeadline(preparationStarted.promise, 'candidate chapter preparation', 5000);
    const restarted = f.owner.start();
    assert.equal(signal!.aborted, true);
    assert.equal(((await first) as Result).status, 'stopped');
    assert.deepEqual(await transfer, {outcome: 'retained'});
    await waitUntil(() => records.hosts[0]!.runs.length === 2);
    assert.equal(f.owner.getRunPromise(), restarted);
    f.owner.stop('done');
    await restarted;
    await f.owner.dispose();
    assert(f.stages.every((stage) => stage.disposed));
  } finally {
    await f.owner.dispose();
  }
});

test('an explicitly authored backward link can start an earlier chapter without restoring historical state', async () => {
  const f = await fixture(true);
  const run = f.owner.start();
  await f.go('b');
  await waitUntil(() => records.hosts.at(-1)!.runs.length === 1);
  await f.go('a');
  await waitUntil(
    () => records.hosts.at(-1)!.id === 'a' && records.hosts.at(-1)!.runs.length === 1,
  );
  assert.equal(records.hosts.length, 3);
  assert(records.hosts[0]!.disposed);
  assert.notEqual(records.hosts[0], records.hosts[2]);
  f.owner.stop('done');
  await run;
  await f.owner.dispose();
});

test('initial chapter preparation failure removes both the stage and publication layout', async () => {
  const document = createFakeDocument();
  await assert.rejects(fixture(false, document, true), /prepare failed/);
  assert.equal(document.body.children.length, 0);
});

const prefetchMovie = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 7]);
const prefetchUrl = 'https://cdn.example.com/next.webm';
const prefetchIntegrity = 'sha256-' + createHash('sha256').update(prefetchMovie).digest('hex');
const remoteChapter = `kamishibai: '4.0'
assets:
  Movie:
    kind: video
    delivery: remote
    loading: lazy
    retention: scene
    source: {url: '${prefetchUrl}', integrity: ${prefetchIntegrity}, contentType: video/webm, size: ${prefetchMovie.length}}
scenes:
  first:
    - video: {id: m, asset: Movie, x: 0, y: 0, width: 160, height: 120}
`;
const prefetchIdentity = {
  id: 'publication-book',
  label: 'book.yaml',
  databaseName: 'tw-kamishibai-assets-v1--book--publication-book',
};

async function prefetchFixture(hold: Promise<void> | null) {
  const verifiedRemoteCacheOptions = {
    indexedDB: new IDBFactory(),
    subtleCrypto: globalThis.crypto.subtle,
    estimateStorage: async () => ({quota: 64 * 1024 * 1024, usage: 0}),
  };
  const events: Result[] = [];
  const signals: AbortSignal[] = [];
  const f = await fixture(false, createFakeDocument(), false, {
    sourceB: remoteChapter,
    options: {
      cacheIdentity: prefetchIdentity,
      verifiedRemoteCacheOptions,
      async loadRemoteAsset(payload: Result, context: Result) {
        const signal = context.signal as AbortSignal;
        signals.push(signal);
        await hold;
        if (signal.aborted) throw new DOMException('aborted', 'AbortError');
        assert.equal(payload.url, prefetchUrl);
        return {bytes: new Uint8Array(prefetchMovie), contentType: 'video/webm'};
      },
      onEvent(event: Result) {
        if (event.type === 'publication.prefetch') events.push(event);
      },
    },
  });
  return {...f, events, signals, verifiedRemoteCacheOptions};
}

test('the committed entry chapter warms the next chapter remote video into its verified cache', async () => {
  const f = await prefetchFixture(null);
  try {
    await waitUntil(() => f.events.length === 1, {attempts: 5000, message: 'prefetch result'});
    assert.deepEqual(f.events[0], {
      type: 'publication.prefetch',
      segmentId: 'b',
      assetId: 'Movie',
      status: 'ready',
    });
    assert.equal(f.signals.length, 1);
    const cache = createVerifiedRemoteBinaryCache({
      ...f.verifiedRemoteCacheOptions,
      cacheIdentity: prefetchIdentity,
    });
    const hit = await cache.resolve(
      {url: prefetchUrl, integrity: prefetchIntegrity, size: 5, contentType: 'video/webm'},
      {load: () => Promise.reject(new Error('must be a cache hit'))},
    );
    assert.equal(hit.source, 'indexeddb');
    await cache.releaseStoryCacheLease();
  } finally {
    await f.owner.dispose();
  }
});

test('stopping the publication cancels an in-flight warm-up and reports it without throwing', async () => {
  const hold = deferred<void>();
  const f = await prefetchFixture(hold.promise);
  try {
    await waitUntil(() => f.signals.length === 1, {attempts: 5000, message: 'prefetch read'});
    const run = f.owner.start();
    f.owner.stop('user-stop');
    await run;
    assert.equal(f.signals[0]!.aborted, true);
    hold.resolve();
    await waitUntil(() => f.events.length === 1, {attempts: 5000, message: 'prefetch result'});
    assert.equal(f.events[0]!.status, 'cancelled');
    // Starting again resumes the cancelled warm-up.
    const resumed = f.owner.start();
    await waitUntil(() => f.events.length === 2, {attempts: 5000, message: 'resumed prefetch'});
    assert.equal(f.signals.length, 2);
    assert.equal(f.events[1]!.status, 'ready');
    f.owner.stop('done');
    await resumed;
  } finally {
    hold.resolve();
    await f.owner.dispose();
  }
});

test('a transfer aborted by stop does not start a new warm-up for the retained chapter', async () => {
  const f = await prefetchFixture(null);
  try {
    await waitUntil(() => f.events.length === 1, {attempts: 5000, message: 'entry prefetch'});
    const preparing = deferred<void>();
    const release = deferred<void>();
    records.prepare = async (signal) => {
      preparing.resolve();
      await release.promise;
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    };
    const run = f.owner.start();
    const transfer = f.go('b');
    await withDeadline(preparing.promise, 'candidate preparation', 5000);
    f.owner.stop('user-stop');
    release.resolve();
    assert.deepEqual(await transfer, {outcome: 'retained'});
    await run;
    for (let turn = 0; turn < 200; turn++) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.signals.length, 1, 'no remote read after the aborted transfer');
    assert.equal(f.events.length, 1);
  } finally {
    records.prepare = null;
    await f.owner.dispose();
  }
});

for (const failure of ['host', 'stage'] as const)
  test(`publication disposal retains failed ${failure} ownership and retries only unsuccessful steps`, async () => {
    const f = await fixture();
    const gate = deferred<void>();
    let hostCalls = 0,
      stageCalls = 0;
    records.dispose = async () => {
      hostCalls++;
      if (failure === 'host' && hostCalls === 1) {
        await gate.promise;
        throw new Error('host cleanup failed');
      }
    };
    f.state.stageDispose = () => {
      stageCalls++;
      if (failure === 'stage' && stageCalls === 1) throw new Error('stage cleanup failed');
    };
    const first = f.owner.dispose();
    assert.equal(f.owner.dispose(), first);
    const rejected = assert.rejects(first, AggregateError);
    gate.resolve();
    await rejected;
    assert.throws(() => f.owner.start(), /disposed/);
    await f.owner.dispose();
    assert.equal(hostCalls, failure === 'host' ? 2 : 1);
    assert.equal(stageCalls, failure === 'stage' ? 2 : 1);
    assert(f.stages.every((stage) => stage.disposed));
    await f.owner.dispose();
    assert.equal(hostCalls + stageCalls, 3);
  });

test('retired chapter cleanup failure is retried without replacing the committed chapter', async () => {
  const f = await fixture();
  records.dispose = (state) => {
    if (state.id === 'a' && state.disposeCalls === 1)
      throw new Error('retired host cleanup failed');
  };
  const run = f.owner.start();
  assert.deepEqual(await f.go('b'), {outcome: 'committed'});
  await waitUntil(() => records.hosts.at(-1)!.runs.length === 1);
  assert.deepEqual(f.owner.getState(), {runtime: {variables: {marker: 'b'}}});
  f.owner.stop('done');
  await run;
  await f.owner.dispose();
  assert.equal(records.hosts[0]!.disposeCalls, 2);
  assert.equal(records.hosts[1]!.disposeCalls, 1);
  assert(records.hosts.every((host) => host.disposed));
});

test('abort notification reenters the same disposal and cannot reopen the publication', async () => {
  const f = await fixture();
  const started = deferred<void>();
  const gate = deferred<void>();
  let reentered: Promise<void> | undefined;
  records.prepare = async (signal) => {
    signal!.addEventListener(
      'abort',
      () => {
        reentered = f.owner.dispose();
      },
      {once: true},
    );
    started.resolve();
    await gate.promise;
  };
  const cachedAttach = f.owner.attach;
  const cachedGetState = f.owner.getState;
  const run = f.owner.start();
  const transfer = f.go('b');
  await started.promise;
  const disposal = f.owner.dispose();
  await waitUntil(() => reentered !== undefined);
  assert.equal(reentered, disposal);
  assert.throws(() => cachedAttach(f.document), /disposed/);
  assert.throws(() => cachedGetState(), /disposed/);
  assert.throws(() => f.owner.stop('closed'), /disposed/);
  await assert.rejects(f.owner.prepareMenu(), /disposed/);
  assert.equal(f.owner.hasPendingCleanup(), true);
  gate.resolve();
  await Promise.all([disposal, transfer, run]);
  assert.equal(f.owner.hasPendingCleanup(), false);
  assert(records.hosts.every((host) => host.disposed));
  assert(f.stages.every((stage) => stage.disposed));
});

for (const retired of [false, true])
  test(`publication retries late failed camera cleanup in the ${retired ? 'retired' : 'final'} chapter`, async () => {
    const f = await fixture();
    const permission = deferred<void>(),
      requested = deferred<void>(),
      failed = deferred<unknown>();
    let running = false,
      stops = 0,
      stageReleases = 0;
    const failure = new Error('late camera stop failed');
    const camera = createDsl4StoryCameraLifecycle({
      composition: {
        async startCamera() {
          requested.resolve();
          await permission.promise;
          running = true;
        },
        stopCamera() {
          if (++stops === 1) throw failure;
          running = false;
        },
        isCameraRunning: () => running,
        hidePreview() {},
        isPreviewVisible: () => false,
        setPreviewOpacity() {},
        setPreviewPosition() {},
        stopRecognition() {},
        isRecognizing: () => false,
      },
      onCleanupError(error: unknown) {
        failed.resolve(error);
      },
    });
    records.dispose = (state) => (state.id === 'a' ? camera.dispose() : undefined);
    records.pendingCleanup = (state) => state.id === 'a' && camera.hasPendingCleanup();
    f.state.stageDispose = () => {
      stageReleases++;
    };
    try {
      const starting = camera.start();
      await requested.promise;
      if (retired) {
        const run = f.owner.start();
        assert.deepEqual(await f.go('b'), {outcome: 'committed'});
        await waitUntil(() => records.hosts.at(-1)!.runs.length === 1);
        f.owner.stop('done');
        await run;
      } else await f.owner.dispose();
      await starting;
      assert.equal(stops, 0);
      assert.equal(
        f.owner.hasPendingCleanup(),
        true,
        'unanswered permission still owns a possible late camera',
      );
      permission.resolve();
      assert.equal(await failed.promise, failure);
      assert.equal(running, true);
      assert.equal(f.owner.hasPendingCleanup(), true);
      assert.equal(records.hosts[0]!.disposeCalls, 1, 'inspection must not retry cleanup');
      await f.owner.dispose();
      assert.equal(records.hosts[0]!.disposeCalls, 2);
      assert.equal(stops, 2);
      assert.equal(running, false);
      assert.equal(f.owner.hasPendingCleanup(), false);
      assert.equal(stageReleases, retired ? 2 : 1);
      await f.owner.dispose();
      assert.equal(stops, 2);
      assert.equal(stageReleases, retired ? 2 : 1);
    } finally {
      permission.resolve();
      await camera.dispose();
      await f.owner.dispose();
    }
  });

test('a late camera that closes successfully stops keeping the publication cleanup pending', async () => {
  const f = await fixture();
  const permission = deferred<void>(),
    requested = deferred<void>();
  let running = false,
    stops = 0,
    stageReleases = 0;
  const camera = createDsl4StoryCameraLifecycle({
    composition: {
      async startCamera() {
        requested.resolve();
        await permission.promise;
        running = true;
      },
      stopCamera() {
        stops++;
        running = false;
      },
      isCameraRunning: () => running,
      hidePreview() {},
      isPreviewVisible: () => false,
      setPreviewOpacity() {},
      setPreviewPosition() {},
      stopRecognition() {},
      isRecognizing: () => false,
    },
  });
  records.dispose = () => camera.dispose();
  records.pendingCleanup = () => camera.hasPendingCleanup();
  f.state.stageDispose = () => {
    stageReleases++;
  };
  try {
    const starting = camera.start();
    await requested.promise;
    await f.owner.dispose();
    await starting;
    assert.equal(f.owner.hasPendingCleanup(), true);
    permission.resolve();
    await waitUntil(() => !camera.hasPendingCleanup());
    assert.equal(f.owner.hasPendingCleanup(), false);
    await f.owner.dispose();
    assert.equal(stops, 1);
    assert.equal(records.hosts[0]!.disposeCalls, 1);
    assert.equal(stageReleases, 1);
  } finally {
    permission.resolve();
    await camera.dispose();
    await f.owner.dispose();
  }
});

test('disposing after chapter commit settles the publication run as stopped during old VM cleanup', async () => {
  const f = await fixture();
  const started = deferred<void>(),
    gate = deferred<void>();
  records.dispose = async (state) => {
    if (state.id === 'a') {
      started.resolve();
      await gate.promise;
    }
  };
  const run = f.owner.start();
  const observed = run.then(
    (value) => ({value}),
    (error) => ({error}),
  );
  assert.deepEqual(await f.go('b'), {outcome: 'committed'});
  await started.promise;
  const disposal = f.owner.dispose();
  const state = f.owner as unknown as {getPublicationState(): {segmentId: string | null}};
  await waitUntil(() => state.getPublicationState().segmentId === null);
  gate.resolve();
  await disposal;
  assert.deepEqual(await observed, {value: {status: 'stopped'}});
  assert.equal(
    records.hosts[1]!.runs.length,
    0,
    'the committed chapter must not start after disposal',
  );
  assert(records.hosts.every((host) => host.disposed));
});
