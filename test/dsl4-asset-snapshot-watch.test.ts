import assert from 'node:assert/strict';
import {test} from 'vitest';

import {
  createDsl4AssetSnapshotWatch,
  Dsl4AssetSnapshotWatchError,
} from '../src/dsl4/asset-snapshot-watch.js';
import {requireDefined, requireRecord, requireString} from './helpers/require-value.ts';
import {thrown} from './helpers/thrown-error.ts';

/** One candidate the watch publishes, in the members these cases read. */
interface WatchCandidate {
  key: string;
  revision: number;
}

/** One release the reader records: the key that was released, and why. */
type ReleaseRecord = [string, string];

function fakeClock() {
  let now = 0;
  let nextTimer = 1;
  const timers = new Map<number, {callback: () => void; delay: number}>();
  return {
    now: () => now,
    sleep(delay: number) {
      now += delay;
      return Promise.resolve();
    },
    setTimeout(callback: () => void, delay: number) {
      const id = nextTimer++;
      timers.set(id, {callback, delay});
      return id;
    },
    clearTimeout(id: number) {
      timers.delete(id);
    },
    timers,
  };
}

function reader(keys: readonly (string | Error)[], releases: ReleaseRecord[] = []) {
  let index = 0;
  return async () => {
    const key = keys[Math.min(index++, keys.length - 1)];
    if (key instanceof Error) throw key;
    return {
      key,
      value: {kind: 'asset-snapshot', key},
      release(reason: string) {
        releases.push([requireString(key, 'the snapshot key'), reason]);
      },
    };
  };
}

test('publishes only stable snapshots and swaps owned generations after acknowledgement', async () => {
  const clock = fakeClock();
  const events: WatchCandidate[] = [];
  const releases: ReleaseRecord[] = [];
  const watch = createDsl4AssetSnapshotWatch({
    read: reader(['A', 'A', 'A', 'A', 'B', 'B'], releases),
    onCandidate: (event: unknown) =>
      events.push(requireRecord(event, 'a candidate') as unknown as WatchCandidate),
    clock,
  });

  await watch.start({story: 1});
  assert.deepEqual(
    events.map(({key}) => key),
    ['A'],
  );
  assert.equal(watch.getState().status, 'candidate');
  await watch.accept(requireDefined(events[0], 'candidate 0').revision);
  assert.equal(watch.getState().activeKey, 'A');
  assert.equal(watch.getState().status, 'watching');

  await watch.pollNow();
  assert.deepEqual(
    events.map(({key}) => key),
    ['A'],
  );
  assert.equal(watch.getState().activeKey, 'A');

  await watch.update({story: 2});
  assert.deepEqual(
    events.map(({key}) => key),
    ['A', 'B'],
  );
  await watch.accept(requireDefined(events[1], 'candidate 1').revision);
  assert.equal(watch.getState().activeKey, 'B');
  assert.equal(
    releases.some(([key, reason]) => key === 'A' && reason === 'generation-replaced'),
    true,
  );
  assert.equal(clock.timers.size, 1);
});

test('retries mismatched double reads and exposes only the stable key', async () => {
  const clock = fakeClock();
  const events: WatchCandidate[] = [];
  const releases: ReleaseRecord[] = [];
  const watch = createDsl4AssetSnapshotWatch({
    read: reader(['partial-1', 'partial-2', 'stable', 'stable'], releases),
    onCandidate: (event: unknown) =>
      events.push(requireRecord(event, 'a candidate') as unknown as WatchCandidate),
    clock,
    quietWindowMs: 10,
    retryIntervalMs: 5,
    stabilityTimeoutMs: 30,
  });

  await watch.start({});
  assert.deepEqual(
    events.map(({key}) => key),
    ['stable'],
  );
  assert.equal(clock.now(), 25);
  assert.deepEqual(releases.slice(0, 3), [
    ['partial-1', 'unstable-read'],
    ['partial-2', 'unstable-read'],
    ['stable', 'stable-read-duplicate'],
  ]);
});

test('bounds an unstable source and recovers without replacing the active generation', async () => {
  const clock = fakeClock();
  const diagnostics: unknown[] = [];
  const events: WatchCandidate[] = [];
  let mode = 'unstable';
  let sequence = 0;
  const watch = createDsl4AssetSnapshotWatch({
    read() {
      if (mode === 'missing') {
        throw new Dsl4AssetSnapshotWatchError('K4-ASSET-MISSING', 'Referenced asset is missing');
      }
      const key = mode === 'unstable' ? `unstable-${sequence++}` : 'recovered';
      return {key, value: {key}, release() {}};
    },
    onCandidate: (event: unknown) =>
      events.push(requireRecord(event, 'a candidate') as unknown as WatchCandidate),
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic?.code ?? null),
    clock,
    quietWindowMs: 1,
    retryIntervalMs: 1,
    stabilityTimeoutMs: 2,
  });

  await watch.start({});
  assert.equal(watch.getState().status, 'diagnostic');
  assert.equal(
    requireRecord(watch.getState().diagnostic, 'the watch diagnostic').code,
    'K4-ASSET-UNSTABLE-001',
  );
  mode = 'missing';
  await watch.pollNow();
  assert.equal(
    requireRecord(watch.getState().diagnostic, 'the watch diagnostic').code,
    'K4-ASSET-MISSING',
  );
  mode = 'valid';
  await watch.pollNow();
  assert.deepEqual(
    events.map(({key}) => key),
    ['recovered'],
  );
  assert.equal(watch.getState().diagnostic, null);
  assert.deepEqual(diagnostics, ['K4-ASSET-UNSTABLE-001', 'K4-ASSET-MISSING', null]);
});

test('coalesces overlapping polls without overlapping reads', async () => {
  const clock = fakeClock();
  const events: WatchCandidate[] = [];
  let activeReads = 0;
  let maximumReads = 0;
  let releaseFirst: (() => void) | undefined;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let reads = 0;
  const watch = createDsl4AssetSnapshotWatch({
    async read() {
      activeReads += 1;
      maximumReads = Math.max(maximumReads, activeReads);
      reads += 1;
      if (reads === 1) await firstGate;
      activeReads -= 1;
      const key = reads <= 2 ? 'A' : 'B';
      return {key, value: {key}, release() {}};
    },
    onCandidate: (event: unknown) =>
      events.push(requireRecord(event, 'a candidate') as unknown as WatchCandidate),
    clock,
  });

  const first = watch.start({});
  const overlapping = watch.pollNow();
  requireDefined(releaseFirst, 'the first read release')();
  await Promise.all([first, overlapping]);
  assert.equal(maximumReads, 1);
  assert.deepEqual(
    events.map(({key}) => key),
    ['A', 'B'],
  );
  assert.equal(requireRecord(watch.getState().candidate, 'the watch candidate').key, 'B');
});

test('discards stale candidates and releases every candidate and active generation once', async () => {
  const clock = fakeClock();
  const releases: ReleaseRecord[] = [];
  const events: WatchCandidate[] = [];
  const watch = createDsl4AssetSnapshotWatch({
    read: reader(['A', 'A', 'B', 'B', 'C', 'C'], releases),
    onCandidate: (event: unknown) =>
      events.push(requireRecord(event, 'a candidate') as unknown as WatchCandidate),
    clock,
  });

  await watch.start({});
  await assert.rejects(watch.accept(999), (error) => thrown(error).code === 'K4-ASSET-STALE-001');
  await watch.accept(requireDefined(events[0], 'candidate 0').revision);
  await watch.pollNow();
  await watch.discard(requireDefined(events[1], 'candidate 1').revision);
  assert.equal(
    releases.some(([key, reason]) => key === 'B' && reason === 'candidate-discarded'),
    true,
  );
  await watch.pollNow();
  await watch.setHidden(true);
  assert.equal(requireDefined([...clock.timers.values()][0], 'the pending timer').delay, 5_000);
  await watch.dispose();
  await watch.dispose();
  assert.equal(
    releases.filter(([key, reason]) => key === 'A' && reason === 'watch-disposed').length,
    1,
  );
  assert.equal(
    releases.filter(([key, reason]) => key === 'C' && reason === 'watch-disposed').length,
    1,
  );
  assert.equal(watch.getState().status, 'disposed');
  assert.equal(clock.timers.size, 0);
});

test('rejects malformed limits, readers, callbacks, and inactive operations', async () => {
  // The watch must refuse a call with no options at all, which its declared parameter does not
  // allow, so the zero-argument view is declared here once.
  const createWatchWithoutOptions = createDsl4AssetSnapshotWatch as () => unknown;
  assert.throws(() => createWatchWithoutOptions(), TypeError);
  assert.throws(
    () => createDsl4AssetSnapshotWatch({read() {}, onCandidate() {}, foregroundIntervalMs: 0}),
    TypeError,
  );
  const watch = createDsl4AssetSnapshotWatch({
    read: reader(['A', 'A']),
    onCandidate() {},
    clock: fakeClock(),
  });
  assert.throws(() => watch.pollNow(), TypeError);
  await assert.rejects(watch.accept(1), (error) => thrown(error).code === 'K4-ASSET-STALE-001');
  await watch.start({});
  assert.throws(() => watch.start({}), TypeError);
  // `setHidden` takes a boolean; the string is what this case proves it refuses.
  const setHiddenLoosely = watch.setHidden as (hidden: unknown) => Promise<unknown>;
  await assert.rejects(setHiddenLoosely('yes'), TypeError);
});
