import assert from 'node:assert/strict';
import {test, vi} from 'vitest';
import {createDsl4PreviewSourceWatcher} from '../src/builder/dsl4-preview-watch.js';
import {createDsl4PreviewTransportPolicy} from '../src/builder/dsl4-preview-transport-policy.js';
import {createDsl4LocalPreviewBrowserClient} from '../src/builder/dsl4-local-preview-browser-client.js';
import {dsl4TestSourceFrontend} from './helpers/dsl4-test-frontend.ts';
import {deferred, flushMicrotasks, withDeadline} from './helpers/async-test-helpers.ts';
import {failedFactory} from './helpers/failed-factory.ts';
import {getDsl4CreationCleanup} from '../src/dsl4/creation-cleanup.js';
import {createDsl4SourceGraph} from '../src/dsl4/source-graph.js';

const manifest = {formatVersion: 1, mode: 'external', sourceId: 'main', path: 'story.k4.yml'};
const source = "kamishibai: '4.0'\nscenes:\n  opening: []\n";
function watcherOptions() {
  return {
    projectRoot: '/project',
    manifest,
    sourceFrontend: dsl4TestSourceFrontend,
    maxSourceBytes: 4096,
    loadSource: async () => ({descriptor: {sourceId: 'main', text: source, integrity: 'same'}}),
    onResult() {},
  };
}
for (const boundary of ['factory', 'registration', 'source', 'graph', 'assets'] as const) {
  test(`watcher retains unpublished ${boundary} cleanup until explicit retry`, async () => {
    const child = failedFactory();
    const close = vi.fn();
    const watcher = createDsl4PreviewSourceWatcher({
      ...watcherOptions(),
      featureFlags: {dsl4Runtime: true},
      // Only an entry that declares `include` reaches the graph and asset boundaries.
      ...(['graph', 'assets'].includes(boundary)
        ? {
            loadSource: async () => ({
              descriptor: {
                sourceId: 'main',
                text: `include: chapter.k4.yml\n${source}`,
                integrity: 'same',
              },
            }),
          }
        : {}),
      maxSourceFiles: 4,
      maxTotalSourceBytes: 16384,
      maxIncludeDepth: 2,
      maxAssetFiles: 4,
      maxAssetFileBytes: 4096,
      maxTotalAssetBytes: 16384,
      watchFactory: () => {
        if (boundary === 'factory') throw child.failure;
        return {
          close,
          on() {
            if (boundary === 'registration') throw child.failure;
          },
        };
      },
      ...(boundary === 'source'
        ? {
            loadSource: async () => {
              throw child.failure;
            },
          }
        : {}),
      loadSourceGraph: async () => {
        if (boundary === 'graph') throw child.failure;
        return createDsl4SourceGraph('story.k4.yml', {readSource: () => source});
      },
      ...(boundary === 'assets'
        ? {
            loadAssets: async () => {
              throw child.failure;
            },
          }
        : {}),
    });
    await assert.rejects(async () => watcher.start());
    assert.throws(() => watcher.start());
    await assert.rejects(watcher.dispose(), AggregateError);
    assert.equal(child.release.mock.calls.length, 1);
    assert.equal(watcher.hasPendingCleanup(), true);
    child.repair();
    await watcher.dispose();
    assert.equal(child.release.mock.calls.length, 2);
    assert.equal(close.mock.calls.length, boundary === 'factory' ? 0 : 1);
    assert.equal(watcher.hasPendingCleanup(), false);
  });
}

test('watch factory may enter disposal synchronously before handing off its failure', async () => {
  const child = failedFactory();
  let disposal: Promise<unknown> | null = null;
  const watcher = createDsl4PreviewSourceWatcher({
    ...watcherOptions(),
    watchFactory() {
      disposal = watcher.dispose();
      void disposal.catch(() => {});
      throw child.failure;
    },
  });
  assert.throws(() => watcher.start(), AggregateError);
  assert.ok(disposal);
  await assert.rejects(withDeadline(disposal, 'watch factory reentrant close', 2000));
  assert.equal(child.release.mock.calls.length, 1);
  child.repair();
  await watcher.dispose();
  assert.equal(child.release.mock.calls.length, 2);
  assert.equal(watcher.hasPendingCleanup(), false);
});

test('watcher collects a late loader failure after disposal starts', async () => {
  const child = failedFactory(),
    entered = deferred(),
    gate = deferred();
  const close = vi.fn();
  const watcher = createDsl4PreviewSourceWatcher({
    ...watcherOptions(),
    watchFactory: () => ({close, on() {}}),
    async loadSource() {
      entered.resolve();
      await gate.promise;
      throw child.failure;
    },
  });
  const starting = assert.rejects(watcher.start());
  await entered.promise;
  const disposing = assert.rejects(watcher.dispose(), AggregateError);
  gate.resolve();
  await Promise.all([starting, disposing]);
  assert.equal(child.release.mock.calls.length, 1);
  assert.equal(close.mock.calls.length, 1);
  child.repair();
  await watcher.dispose();
  assert.equal(child.release.mock.calls.length, 2);
  assert.equal(watcher.hasPendingCleanup(), false);
});

for (const duringCleanup of [false, true]) {
  test(`watcher retains a detached publication failure ${duringCleanup ? 'during cleanup' : 'after disposal completes'}`, async () => {
    const child = failedFactory(),
      entered = deferred(),
      gate = deferred();
    const closing = deferred(),
      releaseClose = deferred();
    const observed: unknown[] = [];
    const close = vi.fn(async () => {
      closing.resolve();
      await releaseClose.promise;
    });
    const watcher = createDsl4PreviewSourceWatcher({
      ...watcherOptions(),
      watchFactory: () => ({close, on() {}}),
      async onResult() {
        entered.resolve();
        await gate.promise;
        throw child.failure;
      },
      onError(error) {
        observed.push(error);
      },
    });
    const starting = watcher.start();
    await entered.promise;
    const disposing = watcher.dispose();
    const outcome = disposing.then(
      () => null,
      (error: unknown) => error,
    );
    await closing.promise;
    if (!duringCleanup) {
      releaseClose.resolve();
      assert.equal(await withDeadline(outcome, 'watch close before late notification', 2000), null);
    }
    gate.resolve();
    await flushMicrotasks();
    releaseClose.resolve();
    if (duringCleanup)
      assert.ok(
        (await withDeadline(outcome, 'watch close with late notification', 2000)) instanceof
          AggregateError,
      );
    await starting;
    assert.ok(observed.includes(child.failure));
    assert.equal(watcher.hasPendingCleanup(), true);
    assert.equal(child.release.mock.calls.length, 1);
    child.repair();
    await watcher.dispose();
    assert.equal(child.release.mock.calls.length, 2);
    assert.equal(close.mock.calls.length, 1);
    assert.equal(watcher.hasPendingCleanup(), false);
  });
}
for (const asynchronous of [false, true]) {
  test(`node watcher retains ${asynchronous ? 'async' : 'sync'} close failure independently from its timer`, async () => {
    let broken = true,
      tick = () => {},
      nested: unknown;
    const close = vi.fn(() => {
      nested = watcher.dispose();
      if (broken) {
        if (asynchronous) return Promise.reject(new Error('watch close failed'));
        throw new Error('watch close failed');
      }
    });
    const clear = vi.fn();
    const watcher = createDsl4PreviewSourceWatcher({
      ...watcherOptions(),
      quietWindowMs: 0,
      clock: {
        now: () => 0,
        sleep: async () => {},
        setTimeout(callback) {
          tick = callback;
          return 1;
        },
        clearTimeout: clear,
      },
      watchFactory: () => ({close, on() {}}),
    });
    await watcher.start();
    watcher.notifyChange();
    const attempt = watcher.dispose();
    assert.strictEqual(watcher.dispose(), attempt);
    await assert.rejects(attempt, AggregateError);
    assert.strictEqual(nested, attempt);
    assert.equal(close.mock.calls.length, 1);
    assert.equal(clear.mock.calls.length, 1);
    tick();
    assert.throws(() => watcher.notifyChange(), /not active/);
    broken = false;
    await watcher.dispose();
    assert.equal(close.mock.calls.length, 2);
    assert.equal(clear.mock.calls.length, 1);
    assert.equal(watcher.hasPendingCleanup(), false);
  });
}
test('node watcher closes result notification waits without accepting a late publication', async () => {
  const finished = deferred();
  const watcher = createDsl4PreviewSourceWatcher({
    ...watcherOptions(),
    quietWindowMs: 0,
    watchFactory: () => ({close() {}, on() {}}),
    async onResult() {
      await watcher.dispose();
      finished.resolve();
    },
  });
  await withDeadline(watcher.start(), 'watch observer start', 2000);
  await withDeadline(finished.promise, 'watch observer close', 2000);
  assert.equal(watcher.getState().published, 0);
  assert.equal(watcher.hasPendingCleanup(), false);
});
test('node watcher retries a failed timer without repeating a successful watch close', async () => {
  let broken = true,
    tick = () => {};
  const clear = vi.fn(() => {
    if (broken) throw new Error('timer stop failed');
  });
  const close = vi.fn();
  const watcher = createDsl4PreviewSourceWatcher({
    ...watcherOptions(),
    quietWindowMs: 0,
    clock: {
      now: () => 0,
      sleep: async () => {},
      setTimeout(callback) {
        tick = callback;
        return 1;
      },
      clearTimeout: clear,
    },
    watchFactory: () => ({close, on() {}}),
  });
  await watcher.start();
  watcher.notifyChange();
  await assert.rejects(watcher.dispose(), AggregateError);
  tick();
  assert.equal(close.mock.calls.length, 1);
  assert.equal(clear.mock.calls.length, 1);
  broken = false;
  await watcher.dispose();
  assert.equal(close.mock.calls.length, 1);
  assert.equal(clear.mock.calls.length, 2);
  assert.equal(watcher.hasPendingCleanup(), false);
});
test('transport retains an in-flight failed disconnect and joins parent disposal until explicit retry', async () => {
  let broken = true,
    nested: unknown;
  const entered = deferred(),
    gate = deferred();
  const disconnect = vi.fn(async () => {
    nested = policy.dispose();
    entered.resolve();
    await gate.promise;
    if (broken) throw new Error('disconnect failed');
  });
  const policy = createDsl4PreviewTransportPolicy({
    bindHost: '127.0.0.1',
    port: 4173,
    origin: 'http://127.0.0.1:4173',
    projectRoot: '/project',
    sourceManifest: manifest,
    tokenTtlMs: 1000,
    maxTokenRecords: 4,
    onDisconnect: disconnect,
  });
  const token = policy.issueToken().token;
  const connection = policy.connect({
    origin: 'http://127.0.0.1:4173',
    remoteAddress: '127.0.0.1',
    token,
  });
  const closing = connection.disconnect('host-crash');
  const rejected = assert.rejects(closing);
  await entered.promise;
  const attempt = policy.dispose();
  assert.strictEqual(nested, attempt);
  const rejectedDispose = assert.rejects(attempt);
  gate.resolve();
  await Promise.all([rejected, rejectedDispose]);
  assert.equal(disconnect.mock.calls.length, 1);
  assert.equal(policy.hasPendingCleanup(), true);
  assert.throws(() => policy.issueToken(), /disposed/);
  assert.throws(() => connection.authorizeSourceRead(manifest.path), /disconnected/);
  broken = false;
  await policy.dispose();
  assert.equal(disconnect.mock.calls.length, 2);
  assert.equal(policy.hasPendingCleanup(), false);
});

function clientFixture(overrides: Record<string, unknown> = {}) {
  let broken = true;
  const read = deferred<{done: boolean; value?: string}>();
  const reader = {
    read: () => read.promise,
    cancel: vi.fn(async () => {
      if (broken) throw new Error('reader cancellation failed');
      read.resolve({done: true});
    }),
    releaseLock: vi.fn(),
  };
  const listeners = new Map<string, () => unknown>();
  const remove = vi.fn((type: string) => {
    if (broken) throw new Error('listener removal failed');
    listeners.delete(type);
  });
  const runtime = {
    start: async () => {},
    dispose: vi.fn(async () => {
      if (broken) throw new Error('runtime cleanup failed');
    }),
    getState: () => ({}),
  };
  const shell = {
    setReloadWatchState: async () => {},
    getSnapshot: () => ({}),
    dispose: vi.fn(async () => {}),
  };
  const client = createDsl4LocalPreviewBrowserClient({
    document: {querySelector: () => ({appendChild() {}})},
    location: {hash: `#${'a'.repeat(43)}`},
    history: {replaceState() {}},
    eventTarget: {
      addEventListener(type: string, handler: () => unknown) {
        listeners.set(type, handler);
      },
      removeEventListener: remove,
    },
    sourceFrontend: {parse() {}},
    platform: {},
    runtimeOptions: {},
    createRuntime: () => runtime,
    createShell: () => shell,
    fetch: async (url: string) => {
      if (url === '/api/events')
        return {
          ok: true,
          headers: new Headers({'content-type': 'application/x-ndjson'}),
          body: {pipeThrough: () => ({getReader: () => reader})},
        };
      if (url === '/api/runtime-project')
        return new Response(new Uint8Array([1, 2]), {headers: {'content-length': '2'}});
      return Response.json({events: []});
    },
    ...overrides,
  });
  return {
    client,
    reader,
    runtime,
    shell,
    remove,
    listeners,
    repair: () => {
      broken = false;
    },
  };
}

for (const duringCleanup of [false, true]) {
  test(`client retains a detached startup notification failure ${duringCleanup ? 'during cleanup' : 'after disposal completes'}`, async () => {
    const child = failedFactory(),
      entered = deferred(),
      gate = deferred();
    const closing = deferred(),
      releaseClose = deferred();
    const observed: unknown[] = [];
    const shell = {
      async setReloadWatchState() {
        entered.resolve();
        await gate.promise;
        throw child.failure;
      },
      getSnapshot: () => ({}),
      dispose: vi.fn(async () => {
        closing.resolve();
        await releaseClose.promise;
      }),
    };
    const {client, repair} = clientFixture({
      createShell: () => shell,
      fetch: async () => assert.fail('closed startup must not fetch'),
      onError(error: unknown) {
        observed.push(error);
      },
    });
    repair();
    const starting = assert.rejects(client.start(), {name: 'AbortError'});
    await entered.promise;
    const disposing = client.dispose();
    const outcome = disposing.then(
      () => null,
      (error: unknown) => error,
    );
    await closing.promise;
    if (!duringCleanup) {
      releaseClose.resolve();
      assert.equal(
        await withDeadline(outcome, 'client close before late notification', 2000),
        null,
      );
    }
    gate.resolve();
    await flushMicrotasks();
    releaseClose.resolve();
    if (duringCleanup)
      assert.ok(
        (await withDeadline(outcome, 'client close with late notification', 2000)) instanceof
          AggregateError,
      );
    await starting;
    assert.ok(observed.includes(child.failure));
    assert.equal(client.hasPendingCleanup(), true);
    assert.equal(child.release.mock.calls.length, 1);
    child.repair();
    await client.dispose();
    assert.equal(child.release.mock.calls.length, 2);
    assert.equal(shell.dispose.mock.calls.length, 1);
    assert.equal(client.hasPendingCleanup(), false);
  });
}

test('client retains a failed runtime factory and releases its returned shell independently', async () => {
  const child = failedFactory();
  const {client, shell, repair} = clientFixture({
    createRuntime() {
      throw child.failure;
    },
  });
  repair();
  await assert.rejects(client.start(), AggregateError);
  assert.equal(child.release.mock.calls.length, 1);
  await assert.rejects(client.dispose(), AggregateError);
  assert.equal(shell.dispose.mock.calls.length, 1);
  // A later explicit disposal is a retry, but the unpublished factory is still broken.
  assert.equal(child.release.mock.calls.length, 2);
  child.repair();
  await client.dispose();
  assert.equal(child.release.mock.calls.length, 3);
  assert.equal(shell.dispose.mock.calls.length, 1);
  assert.equal(client.hasPendingCleanup(), false);
});

test('client joins disposal entered synchronously by a failing runtime factory', async () => {
  const child = failedFactory();
  let disposal: Promise<unknown> | null = null;
  const fixture = clientFixture({
    createRuntime() {
      disposal = fixture.client.dispose();
      void disposal.catch(() => {});
      throw child.failure;
    },
  });
  fixture.repair();
  await assert.rejects(fixture.client.start());
  assert.ok(disposal);
  await assert.rejects(withDeadline(disposal, 'factory reentrant disposal', 2000));
  assert.equal(child.release.mock.calls.length, 1);
  assert.equal(fixture.shell.dispose.mock.calls.length, 1);
  child.repair();
  await fixture.client.dispose();
  assert.equal(child.release.mock.calls.length, 2);
  assert.equal(fixture.client.hasPendingCleanup(), false);
});

test('client retains a response loader failure instead of replacing it with a JSON fallback', async () => {
  const child = failedFactory();
  const {client, repair} = clientFixture({
    fetch: async () => ({
      ok: true,
      async json() {
        throw child.failure;
      },
    }),
  });
  repair();
  await assert.rejects(client.start(), AggregateError);
  assert.equal(child.release.mock.calls.length, 1);
  child.repair();
  await client.dispose();
  assert.equal(child.release.mock.calls.length, 2);
  assert.equal(client.hasPendingCleanup(), false);
});

test('client drains a read failure handed off while its reader is being cancelled', async () => {
  const child = failedFactory(),
    read = deferred<{done: boolean; value?: string}>();
  const {client, reader, repair} = clientFixture();
  repair();
  reader.read = () => read.promise;
  reader.cancel.mockImplementation(async () => {
    read.reject(child.failure);
  });
  await client.start();
  await assert.rejects(withDeadline(client.dispose(), 'late stream factory handoff', 2000));
  assert.equal(child.release.mock.calls.length, 1);
  assert.equal(client.hasPendingCleanup(), true);
  child.repair();
  await client.dispose();
  assert.equal(child.release.mock.calls.length, 2);
  assert.equal(reader.cancel.mock.calls.length, 1);
  assert.equal(client.hasPendingCleanup(), false);
});

test('client reclaims a disposed runtime when its error notification reports newly pending cleanup', async () => {
  const child = failedFactory();
  let pending = false;
  let reportRuntimeError: ((error: unknown) => void) | null = null;
  const fixture = clientFixture({
    createRuntime(options: {onError: (error: unknown) => void}) {
      reportRuntimeError = options.onError;
      return {...fixture.runtime, hasPendingCleanup: () => pending};
    },
  });
  fixture.repair();
  await fixture.client.start();
  await fixture.client.dispose();
  assert.equal(fixture.runtime.dispose.mock.calls.length, 1);
  pending = true;
  assert.ok(reportRuntimeError);
  (reportRuntimeError as (error: unknown) => void)(child.failure);
  assert.equal(fixture.client.hasPendingCleanup(), true);
  fixture.runtime.dispose.mockImplementation(async () => {
    await child.cleanup.dispose();
    pending = false;
  });
  child.repair();
  await fixture.client.dispose();
  assert.equal(child.release.mock.calls.length, 2);
  assert.equal(fixture.runtime.dispose.mock.calls.length, 2);
  assert.equal(fixture.client.hasPendingCleanup(), false);
});

test('client rejects a late runtime owner while another parent cleanup is pending and retries it explicitly', async () => {
  const child = failedFactory();
  const shellClosing = deferred(),
    shellGate = deferred();
  let pending = false;
  let reportRuntimeError: ((error: unknown) => void) | null = null;
  const fixture = clientFixture({
    createRuntime(options: {onError: (error: unknown) => void}) {
      reportRuntimeError = options.onError;
      return {...fixture.runtime, hasPendingCleanup: () => pending};
    },
  });
  fixture.repair();
  fixture.shell.dispose.mockImplementation(async () => {
    shellClosing.resolve();
    await shellGate.promise;
  });
  try {
    await fixture.client.start();
    const attempt = fixture.client.dispose();
    assert.strictEqual(fixture.client.dispose(), attempt);
    const rejected = assert.rejects(
      withDeadline(attempt, 'runtime owner during shell cleanup', 2000),
      AggregateError,
    );
    await shellClosing.promise;
    await flushMicrotasks();
    assert.equal(fixture.runtime.dispose.mock.calls.length, 1);
    pending = true;
    assert.ok(reportRuntimeError);
    (reportRuntimeError as (error: unknown) => void)(child.failure);
    assert.equal(fixture.client.hasPendingCleanup(), true);
    shellGate.resolve();
    await rejected;
    assert.equal(fixture.client.hasPendingCleanup(), true);
    assert.equal(fixture.runtime.dispose.mock.calls.length, 1);
    assert.equal(child.release.mock.calls.length, 1);

    fixture.runtime.dispose.mockImplementation(async () => {
      await child.cleanup.dispose();
      pending = false;
    });
    await assert.rejects(fixture.client.dispose(), AggregateError);
    assert.equal(fixture.client.hasPendingCleanup(), true);
    assert.equal(child.release.mock.calls.length, 2);
    child.repair();
    await fixture.client.dispose();
    assert.equal(child.release.mock.calls.length, 3);
    assert.equal(fixture.runtime.dispose.mock.calls.length, 3);
    assert.equal(fixture.shell.dispose.mock.calls.length, 1);
    assert.equal(fixture.reader.cancel.mock.calls.length, 1);
    assert.equal(fixture.reader.releaseLock.mock.calls.length, 1);
    assert.equal(fixture.remove.mock.calls.length, 1);
    assert.equal(fixture.client.hasPendingCleanup(), false);
  } finally {
    shellGate.resolve();
    child.repair();
    await fixture.client.dispose().catch(() => {});
  }
});

for (const boundary of ['shell', 'listener'] as const) {
  test(`client hands off construction failure in ${boundary} before returning a client`, async () => {
    const child = failedFactory();
    const shellRelease = vi.fn();
    const remove = vi.fn();
    let failure: unknown;
    try {
      clientFixture({
        createShell() {
          if (boundary === 'shell') throw child.failure;
          return {dispose: shellRelease};
        },
        eventTarget: {
          addEventListener() {
            throw child.failure;
          },
          removeEventListener: remove,
        },
      });
    } catch (error) {
      failure = error;
    }
    const cleanup = getDsl4CreationCleanup(failure);
    assert.ok(cleanup);
    await assert.rejects(cleanup.completion!);
    assert.equal(child.release.mock.calls.length, 1);
    assert.equal(shellRelease.mock.calls.length, boundary === 'shell' ? 0 : 1);
    assert.equal(remove.mock.calls.length, boundary === 'shell' ? 0 : 1);
    child.repair();
    await cleanup.dispose();
    assert.equal(child.release.mock.calls.length, 2);
    assert.equal(cleanup.hasPendingCleanup(), false);
    assert.equal(shellRelease.mock.calls.length, boundary === 'shell' ? 0 : 1);
  });
}
test('browser client retains failed reader, listener and runtime owners while releasing the shell', async () => {
  const {client, reader, runtime, shell, remove, listeners, repair} = clientFixture();
  await client.start();
  const latePageHide = listeners.get('pagehide')!;
  const attempt = client.dispose();
  assert.strictEqual(client.dispose(), attempt);
  await assert.rejects(withDeadline(attempt, 'client failed close', 2000), AggregateError);
  assert.equal(reader.cancel.mock.calls.length, 1);
  assert.equal(runtime.dispose.mock.calls.length, 1);
  assert.equal(shell.dispose.mock.calls.length, 1);
  assert.equal(client.hasPendingCleanup(), true);
  repair();
  await client.dispose();
  latePageHide();
  assert.equal(reader.cancel.mock.calls.length, 2);
  assert.equal(reader.releaseLock.mock.calls.length, 1);
  assert.equal(remove.mock.calls.length, 2);
  assert.equal(runtime.dispose.mock.calls.length, 2);
  assert.equal(shell.dispose.mock.calls.length, 1);
  assert.equal(client.hasPendingCleanup(), false);
});

test('browser client joins runtime cleanup that fails while startup is completing', async () => {
  const {client, runtime, shell, repair} = clientFixture();
  repair();
  const entered = deferred(),
    gate = deferred();
  runtime.start = async () => {
    entered.resolve();
    await gate.promise;
  };
  runtime.dispose.mockImplementation(async () => {
    gate.resolve();
    if (runtime.dispose.mock.calls.length === 1) throw new Error('startup runtime cleanup failed');
  });
  const starting = client.start();
  const rejectedStart = assert.rejects(starting, {name: 'AbortError'});
  await entered.promise;
  await assert.rejects(
    withDeadline(client.dispose(), 'startup client cleanup', 2000),
    AggregateError,
  );
  await rejectedStart;
  assert.equal(runtime.dispose.mock.calls.length, 1);
  assert.equal(shell.dispose.mock.calls.length, 1);
  await client.dispose();
  assert.equal(runtime.dispose.mock.calls.length, 2);
  assert.equal(shell.dispose.mock.calls.length, 1);
  assert.equal(client.hasPendingCleanup(), false);
});

test('browser client startup watch observer can await its own disposal', async () => {
  const {client, shell, repair} = clientFixture();
  repair();
  const finished = deferred();
  shell.setReloadWatchState = async () => {
    await client.dispose();
    finished.resolve();
  };
  await assert.rejects(withDeadline(client.start(), 'client observer startup', 2000), {
    name: 'AbortError',
  });
  await withDeadline(finished.promise, 'client observer disposal', 2000);
  assert.equal(client.hasPendingCleanup(), false);
});
