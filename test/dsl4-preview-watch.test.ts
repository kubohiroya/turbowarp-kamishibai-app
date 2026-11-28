import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {createDsl4PreviewSourceWatcher, dsl4PreviewWatchDefaults} from '../src/builder/index.js';
import {
  createDsl4LiveReloadSession,
  createDsl4SourceFrontend,
  createDsl4SourceGraph,
} from '../src/dsl4/index.js';
import type {LiveReloadRuntimeSession} from '../src/dsl4/live-reload-session.js';
import type {Dsl4FileWatcher} from '../src/builder/file-system.js';
import {
  requireArray,
  requireDefined,
  requireNumber,
  requireRecord,
  requireString,
} from './helpers/require-value.ts';
import {deferred} from './helpers/async-test-helpers.ts';

type WatcherOptions = Parameters<typeof createDsl4PreviewSourceWatcher>[0];
type WatchListener = (eventType: string, filename: string | Buffer | null) => void;
type LiveReloadState = ReturnType<ReturnType<typeof createDsl4LiveReloadSession>['getState']>;

/** One published generation result, as the cases read it. */
function publicationAt(
  results: readonly Readonly<Record<string, unknown>>[],
  index: number,
): Readonly<Record<string, unknown>> {
  return requireDefined(results[index], `published generation ${index}`);
}

function memberOf(
  value: Readonly<Record<string, unknown>>,
  member: string,
): Record<string, unknown> {
  return requireRecord(value[member], `its ${member}`);
}

function diagnosticAt(
  result: Readonly<Record<string, unknown>>,
  index: number,
): Record<string, unknown> {
  return requireRecord(
    requireArray(result.diagnostics, 'the published diagnostics')[index],
    `diagnostic ${index}`,
  );
}

/** The scene ids one published story document carries, in order. */
function sceneIds(result: Readonly<Record<string, unknown>>): unknown[] {
  return requireArray(memberOf(result, 'storyDocument').scenes, 'its scenes').map(
    (scene) => requireRecord(scene, 'a scene').id,
  );
}

function reloadStateAt(states: readonly LiveReloadState[], index: number): LiveReloadState {
  return requireDefined(states[index], `live reload state ${index}`);
}

/** The story-start restart choice one staged candidate offers. */
function storyStartOption(state: LiveReloadState) {
  const candidate = requireDefined(state.candidate, 'the staged candidate');
  return requireDefined(candidate.plan, 'its plan').options.storyStart;
}

/**
 * Pass watcher options the declaration refuses on purpose.
 *
 * One case asserts that the factory rejects an empty project root, a zero limit, a frontend without
 * `parse`, and a clock without timers -- all of which its own types already forbid.
 */
function invalidWatcherOptions(options: Record<string, unknown>): WatcherOptions {
  return options as unknown as WatcherOptions;
}

/**
 * Merge one case's overrides into the base watcher options.
 *
 * Under `exactOptionalPropertyTypes` a spread of `Partial<WatcherOptions>` carries `undefined` into
 * every optional member, which the factory's own type refuses. The cases never pass `undefined`.
 */
function withOverrides(base: WatcherOptions, overrides: Partial<WatcherOptions>): WatcherOptions {
  return {...base, ...overrides} as WatcherOptions;
}

type AssetSnapshotLoader = NonNullable<WatcherOptions['loadAssets']>;

/** The watcher reads only the manifest of an asset snapshot, so the double returns just that. */
function assetSnapshotLoader(
  load: () => Promise<{manifest: Record<string, unknown>}>,
): AssetSnapshotLoader {
  return load as unknown as AssetSnapshotLoader;
}

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const schema = JSON.parse(
  await readFile(path.join(projectRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
);
const frontend = createDsl4SourceFrontend(schema);
const manifest = Object.freeze({
  formatVersion: 1,
  mode: 'external',
  sourceId: 'main',
  path: 'story.kamishibai.yaml',
});
const validSource = "kamishibai: '4.0'\nscenes:\n  opening: []\n";

function createFakeClock() {
  let time = 0;
  let nextTimerId = 1;
  const timers = new Map<number, {at: number; callback: () => void}>();
  return {
    now: () => time,
    setTimeout(callback: () => void, milliseconds: number) {
      const id = nextTimerId++;
      timers.set(id, {at: time + milliseconds, callback});
      return id;
    },
    clearTimeout(id: unknown) {
      if (typeof id === 'number') timers.delete(id);
    },
    async sleep(milliseconds: number) {
      time += milliseconds;
    },
    advance(milliseconds: number) {
      time += milliseconds;
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= time)
        .sort(([, left], [, right]) => left.at - right.at);
      for (const [id, timer] of due) {
        timers.delete(id);
        timer.callback();
      }
    },
    pendingTimers: () => timers.size,
  };
}

function createFakeWatchFactory() {
  let listener: WatchListener | null = null;
  let errorListener: ((error: unknown) => void) | null = null;
  let directory: string | null = null;
  let options: {recursive?: boolean} | null = null;
  let closed = 0;
  return {
    factory(
      watchedDirectory: string,
      watchedListener: WatchListener,
      watchedOptions?: {recursive?: boolean},
    ): Dsl4FileWatcher {
      directory = watchedDirectory;
      listener = watchedListener;
      options = watchedOptions ?? null;
      return {
        close() {
          closed += 1;
        },
        on(type: 'error', callback: (error: unknown) => void) {
          if (type === 'error') errorListener = callback;
          return this;
        },
      };
    },
    emit(filename = 'story.kamishibai.yaml') {
      listener?.('change', filename);
    },
    emitError(error: unknown) {
      errorListener?.(error);
    },
    get directory() {
      return directory;
    },
    get options() {
      return options;
    },
    get closed() {
      return closed;
    },
  };
}

async function includedGraph(sceneId: string) {
  const sources = new Map([
    ['story.k4.yml', "include: chapters/scene.k4.yml\nkamishibai: '4.0'\nscenes:\n  opening: []\n"],
    ['chapters/scene.k4.yml', `scenes:\n  ${sceneId}: []\n`],
  ]);
  return createDsl4SourceGraph('story.k4.yml', {
    readSource(sourcePath: string) {
      const source = sources.get(sourcePath);
      if (source === undefined) throw sourceError('K4-SOURCE-MISSING');
      return source;
    },
  });
}

function descriptor(text: string, integrity: string) {
  return Object.freeze({sourceId: 'main', text, integrity});
}

function sourceError(code: string) {
  return Object.assign(new Error(code), {code});
}

function watcherOptions(overrides: Partial<WatcherOptions> = {}) {
  const clock = createFakeClock();
  const watched = createFakeWatchFactory();
  const results: Readonly<Record<string, unknown>>[] = [];
  return {
    clock,
    watched,
    results,
    options: withOverrides(
      {
        projectRoot: '/project',
        manifest,
        sourceFrontend: frontend,
        maxSourceBytes: 4096,
        onResult(result: Readonly<Record<string, unknown>>) {
          results.push(result);
        },
        quietWindowMs: 100,
        retryIntervalMs: 10,
        stabilityTimeoutMs: 30,
        clock,
        watchFactory: watched.factory,
      },
      overrides,
    ),
  };
}

test('defines finite development defaults and has no side effects before start', async () => {
  assert.deepEqual(dsl4PreviewWatchDefaults, {
    quietWindowMs: 100,
    retryIntervalMs: 50,
    stabilityTimeoutMs: 2_000,
  });
  const setup = watcherOptions({
    loadSource: async (): Promise<Record<string, unknown>> => ({
      descriptor: descriptor(validSource, 'sha256-initial'),
    }),
  });
  const watcher = createDsl4PreviewSourceWatcher(setup.options);
  assert.deepEqual(watcher.getState(), {
    version: 1,
    status: 'idle',
    revision: 0,
    published: 0,
    lastPublication: null,
    started: false,
    disposed: false,
  });
  assert.equal(setup.watched.directory, null);

  const state = await watcher.start();
  assert.equal(requireRecord(state, 'the watcher state').status, 'watching');
  assert.equal(requireRecord(state, 'the watcher state').published, 1);
  assert.equal(setup.watched.directory, '/project');
  assert.equal(publicationAt(setup.results, 0).ok, true);
  assert.equal(
    memberOf(publicationAt(setup.results, 0), 'sourceSnapshot').integrity,
    'sha256-initial',
  );
  assert.equal(Object.isFrozen(publicationAt(setup.results, 0)), true);
  await watcher.dispose();
  assert.equal(setup.watched.closed, 1);
});

test('watches an explicit root-level source basename without accepting other files', async () => {
  let loads = 0;
  const setup = watcherOptions({
    manifest: {...manifest, path: 'alternate.kamishibai.yaml'},
    loadSource: async (): Promise<Record<string, unknown>> => {
      loads += 1;
      return {descriptor: descriptor(validSource, 'sha256-explicit')};
    },
  });
  const watcher = createDsl4PreviewSourceWatcher(setup.options);
  await watcher.start();
  assert.equal(setup.watched.directory, '/project');
  assert.equal(loads, 1);

  setup.watched.emit('story.kamishibai.yaml');
  assert.equal(setup.clock.pendingTimers(), 0);
  setup.watched.emit('alternate.kamishibai.yaml');
  assert.equal(setup.clock.pendingTimers(), 1);
  setup.clock.advance(100);
  await watcher.whenIdle();
  assert.equal(loads, 2);
  await watcher.dispose();
});

test('coalesces source events and publishes only changed stable integrity', async () => {
  let current = descriptor(validSource, 'sha256-initial');
  let loads = 0;
  const setup = watcherOptions({
    loadSource: async (): Promise<Record<string, unknown>> => {
      loads += 1;
      return {descriptor: current};
    },
  });
  const watcher = createDsl4PreviewSourceWatcher(setup.options);
  await watcher.start();
  assert.equal(loads, 1);

  setup.watched.emit('unrelated.txt');
  assert.equal(setup.clock.pendingTimers(), 0);
  setup.watched.emit();
  setup.watched.emit();
  assert.equal(setup.clock.pendingTimers(), 1);
  setup.clock.advance(99);
  await watcher.whenIdle();
  assert.equal(loads, 1);
  setup.clock.advance(1);
  await watcher.whenIdle();
  assert.equal(loads, 2);
  assert.equal(setup.results.length, 1);

  current = descriptor(validSource.replace('opening', 'ending'), 'sha256-next');
  setup.watched.emit();
  setup.clock.advance(100);
  await watcher.whenIdle();
  assert.equal(loads, 3);
  assert.equal(setup.results.length, 2);
  assert.equal(
    requireRecord(
      requireArray(
        memberOf(publicationAt(setup.results, 1), 'storyDocument').scenes,
        'its scenes',
      )[0],
      'the scene',
    ).id,
    'ending',
  );
  assert.equal(
    requireRecord(watcher.getState().lastPublication, 'the last publication').integrity,
    'sha256-next',
  );
  await watcher.dispose();
});

test('retries transient missing and unstable reads before publishing one valid snapshot', async () => {
  const attempts = [
    sourceError('K4-SOURCE-MISSING'),
    sourceError('K4-PREVIEW-SOURCE-UNSTABLE'),
    {descriptor: descriptor(validSource, 'sha256-recovered')},
  ];
  const setup = watcherOptions({
    loadSource: async (): Promise<Record<string, unknown>> => {
      const next = requireDefined(attempts.shift(), 'the next load attempt');
      if (next instanceof Error) throw next;
      return next;
    },
  });
  const watcher = createDsl4PreviewSourceWatcher(setup.options);
  const state = await watcher.start();
  assert.equal(requireRecord(state, 'the watcher state').status, 'watching');
  assert.equal(setup.clock.now(), 20);
  assert.equal(setup.results.length, 1);
  assert.equal(publicationAt(setup.results, 0).ok, true);
  assert.equal(
    memberOf(publicationAt(setup.results, 0), 'sourceSnapshot').integrity,
    'sha256-recovered',
  );
  await watcher.dispose();
});

const boundedFailures: [string, string][] = [
  ['K4-SOURCE-MISSING', 'error'],
  ['K4-PREVIEW-SOURCE-UNSTABLE', 'warning'],
];
for (const [code, severity] of boundedFailures) {
  test(`publishes bounded ${code} without source text or a machine path`, async () => {
    let attempts = 0;
    const setup = watcherOptions({
      loadSource: async (): Promise<Record<string, unknown>> => {
        attempts += 1;
        throw sourceError(code);
      },
    });
    const watcher = createDsl4PreviewSourceWatcher(setup.options);
    const state = await watcher.start();
    assert.equal(attempts, 4);
    assert.equal(requireRecord(state, 'the watcher state').status, 'watching');
    assert.equal(requireRecord(state, 'the watcher state').published, 1);
    assert.equal(publicationAt(setup.results, 0).ok, false);
    assert.equal(diagnosticAt(publicationAt(setup.results, 0), 0).code, code);
    assert.equal(diagnosticAt(publicationAt(setup.results, 0), 0).severity, severity);
    assert.doesNotMatch(
      JSON.stringify(publicationAt(setup.results, 0)),
      /\/project|kamishibai:|'4\.0'/u,
    );
    assert.doesNotMatch(
      JSON.stringify(requireRecord(state, 'the watcher state')),
      /\/project|kamishibai:|'4\.0'/u,
    );
    await watcher.dispose();
  });
}

test('keeps retry finite even when an injected clock does not advance', async () => {
  const stuckClock = createFakeClock();
  stuckClock.sleep = async () => {};
  let attempts = 0;
  const setup = watcherOptions({
    clock: stuckClock,
    loadSource: async (): Promise<Record<string, unknown>> => {
      attempts += 1;
      throw sourceError('K4-SOURCE-MISSING');
    },
  });
  const watcher = createDsl4PreviewSourceWatcher(setup.options);
  await watcher.start();
  assert.equal(attempts, 4);
  assert.equal(diagnosticAt(publicationAt(setup.results, 0), 0).code, 'K4-SOURCE-MISSING');
  await watcher.dispose();
});

test('publishes stable source and frontend errors without retrying or replacing semantics', async () => {
  let loads = 0;
  const invalidSource = "kamishibai: '4.0'\nscenes: {}\n";
  const setup = watcherOptions({
    loadSource: async (): Promise<Record<string, unknown>> => {
      loads += 1;
      return {descriptor: descriptor(invalidSource, 'sha256-invalid')};
    },
  });
  const watcher = createDsl4PreviewSourceWatcher(setup.options);
  await watcher.start();
  assert.equal(loads, 1);
  assert.equal(publicationAt(setup.results, 0).ok, false);
  assert.equal(
    memberOf(publicationAt(setup.results, 0), 'sourceSnapshot').integrity,
    'sha256-invalid',
  );
  assert.deepEqual(
    publicationAt(setup.results, 0).diagnostics,
    frontend.parse(invalidSource, {sourceId: 'main'}).diagnostics,
  );
  await watcher.dispose();

  const sourceFailureSetup = watcherOptions({
    loadSource: async (): Promise<Record<string, unknown>> => {
      throw sourceError('K4-SOURCE-UTF8-001');
    },
  });
  const sourceFailureWatcher = createDsl4PreviewSourceWatcher(sourceFailureSetup.options);
  await sourceFailureWatcher.start();
  assert.equal(
    diagnosticAt(publicationAt(sourceFailureSetup.results, 0), 0).code,
    'K4-SOURCE-UTF8-001',
  );
  assert.equal(sourceFailureSetup.clock.now(), 0);
  await sourceFailureWatcher.dispose();
});

test('invalidates an in-flight read and closes exactly once on dispose', async () => {
  const load = deferred<Record<string, unknown>>();
  const setup = watcherOptions({loadSource: () => load.promise});
  const watcher = createDsl4PreviewSourceWatcher(setup.options);
  const starting = watcher.start();
  await Promise.resolve();
  const disposing = watcher.dispose();
  load.resolve({descriptor: descriptor(validSource, 'sha256-stale')});
  await Promise.all([starting, disposing]);
  assert.equal(setup.results.length, 0);
  assert.equal(watcher.getState().status, 'disposed');
  assert.equal(setup.watched.closed, 1);
  assert.equal(setup.clock.pendingTimers(), 0);
  assert.deepEqual(await watcher.dispose(), watcher.getState());
});

test('contains watcher observer failures and validates the lifecycle boundary', async () => {
  const errors: unknown[] = [];
  const setup = watcherOptions({
    loadSource: async (): Promise<Record<string, unknown>> => ({
      descriptor: descriptor(validSource, 'sha256-initial'),
    }),
    onError(error: unknown) {
      errors.push(error);
    },
  });
  const watcher = createDsl4PreviewSourceWatcher(setup.options);
  await watcher.start();
  const observerError = new Error('watch failed');
  setup.watched.emitError(observerError);
  assert.deepEqual(errors, [observerError]);
  assert.equal(watcher.getState().status, 'failed');
  await watcher.dispose();

  const malformed: Record<string, unknown>[] = [
    {projectRoot: ''},
    {maxSourceBytes: 0},
    {sourceFrontend: {}},
    {onResult: null},
    {quietWindowMs: -1},
    {retryIntervalMs: 0},
    {stabilityTimeoutMs: 9},
    {clock: {}},
  ];
  for (const overrides of malformed) {
    assert.throws(() =>
      createDsl4PreviewSourceWatcher(invalidWatcherOptions({...setup.options, ...overrides})),
    );
  }
});

test('uses the authorized stable loader and shared frontend for real disk updates', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsl4-preview-watch-'));
  try {
    const sourcePath = path.join(directory, 'story.kamishibai.yaml');
    await writeFile(sourcePath, validSource);
    const clock = createFakeClock();
    const watched = createFakeWatchFactory();
    const results: Readonly<Record<string, unknown>>[] = [];
    const watcher = createDsl4PreviewSourceWatcher({
      projectRoot: directory,
      manifest,
      sourceFrontend: frontend,
      maxSourceBytes: 4096,
      onResult: (result: Readonly<Record<string, unknown>>) => results.push(result),
      subtleCrypto: webcrypto.subtle,
      quietWindowMs: 1,
      retryIntervalMs: 1,
      stabilityTimeoutMs: 3,
      clock,
      watchFactory: watched.factory,
    });
    await watcher.start();
    assert.equal(publicationAt(results, 0).ok, true);

    await writeFile(sourcePath, "kamishibai: '4.0'\nscenes: {}\n");
    watcher.notifyChange();
    clock.advance(1);
    await watcher.whenIdle();
    assert.equal(publicationAt(results, 1).ok, false);
    assert.ok(requireArray(publicationAt(results, 1).diagnostics, 'its diagnostics').length > 0);

    await writeFile(sourcePath, validSource.replace('opening', 'recovered'));
    watcher.notifyChange();
    clock.advance(1);
    await watcher.whenIdle();
    assert.equal(publicationAt(results, 2).ok, true);
    assert.equal(
      requireRecord(
        requireArray(memberOf(publicationAt(results, 2), 'storyDocument').scenes, 'its scenes')[0],
        'the scene',
      ).id,
      'recovered',
    );
    await watcher.dispose();
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('publishes one recursive Source Graph and asset generation only after two matching captures', async () => {
  const graphSequence = ['draft', 'saved', 'saved', 'saved'];
  let assetLoads = 0;
  const setup = watcherOptions({
    manifest: {...manifest, path: 'story.k4.yml'},
    maxSourceFiles: 8,
    maxTotalSourceBytes: 16 * 1024,
    maxIncludeDepth: 4,
    maxAssetFileBytes: 4096,
    maxAssetFiles: 8,
    maxTotalAssetBytes: 16 * 1024,
    quietWindowMs: 1,
    retryIntervalMs: 10,
    stabilityTimeoutMs: 100,
    // The entry declares `include`, which is what makes the watcher read a Source Graph.
    loadSource: async (): Promise<Record<string, unknown>> => ({
      descriptor: descriptor(`include: chapter.k4.yml\n${validSource}`, 'sha256-entry'),
    }),
    loadSourceGraph: async () => includedGraph(graphSequence.shift() ?? 'saved'),
    loadAssets: assetSnapshotLoader(async () => {
      assetLoads += 1;
      return {manifest: {formatVersion: 1, assets: []}};
    }),
  });
  const watcher = createDsl4PreviewSourceWatcher(setup.options);
  await watcher.start();

  assert.equal(setup.watched.directory, '/project');
  assert.deepEqual(setup.watched.options, {recursive: true});
  assert.equal(assetLoads, 4);
  assert.equal(setup.results.length, 1);
  assert.equal(publicationAt(setup.results, 0).ok, true);
  assert.deepEqual(sceneIds(publicationAt(setup.results, 0)), ['opening', 'saved']);
  assert.doesNotMatch(
    requireString(publicationAt(setup.results, 0).canonicalSource, 'the canonical source'),
    /draft/u,
  );
  assert.equal(
    requireNumber(
      memberOf(publicationAt(setup.results, 0), 'sourceSnapshot').byteLength,
      'the snapshot byte length',
    ) > validSource.length,
    true,
  );

  graphSequence.push('next', 'next');
  setup.watched.emit('chapters/scene.k4.yml');
  setup.clock.advance(1);
  await watcher.whenIdle();
  assert.equal(setup.results.length, 2);
  assert.deepEqual(sceneIds(publicationAt(setup.results, 1)), ['opening', 'next']);
  await watcher.dispose();
});

test('feeds initial, invalid, and recovered snapshots directly into live reload', async () => {
  const events: [string, unknown][] = [];
  const reloadStates: LiveReloadState[] = [];
  const liveReload = createDsl4LiveReloadSession({
    createSession({storyDocument}): LiveReloadRuntimeSession {
      let state: Record<string, unknown> = {
        status: 'idle',
        sceneId: 'opening',
        actionIndex: 0,
        actionPath: null,
        variables: requireRecord(storyDocument.variables ?? {}, 'the story variables'),
      };
      let quiesceToken: Readonly<Record<string, unknown>> | null = null;
      return {
        start(options = {}) {
          events.push(['start', options]);
          state = {...state, status: 'running'};
          return Promise.resolve(state);
        },
        stop(reason?: string) {
          events.push(['stop', reason]);
          state = {...state, status: 'stopped'};
          quiesceToken = null;
        },
        dispose(reason?: string) {
          events.push(['dispose', reason]);
        },
        getState() {
          return {runtime: state};
        },
        quiesce({candidateId}) {
          quiesceToken = Object.freeze({
            kind: 'Dsl4QuiesceToken',
            version: 1,
            candidateId,
            runtimeGeneration: 1,
            storyPath: '/scenes/opening',
            actionSignature: null,
            sceneId: 'opening',
            actionIndex: 0,
            variables: {...requireRecord(state.variables, 'the runtime variables')},
            resumeMode: 'finished',
          });
          state = {...state, status: 'paused'};
          return quiesceToken;
        },
        resumeQuiesce(candidateId: number) {
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
  let current = descriptor(validSource, 'sha256-initial');
  const setup = watcherOptions({
    loadSource: async (): Promise<Record<string, unknown>> => ({descriptor: current}),
    async onResult(result: Readonly<Record<string, unknown>>) {
      reloadStates.push(await liveReload.stage(result));
    },
  });
  const watcher = createDsl4PreviewSourceWatcher(setup.options);
  await watcher.start();
  assert.equal(reloadStateAt(reloadStates, 0).status, 'active');
  assert.deepEqual(events, [['start', {}]]);

  current = descriptor("kamishibai: '4.0'\nscenes: {}\n", 'sha256-invalid');
  watcher.notifyChange();
  setup.clock.advance(100);
  await watcher.whenIdle();
  assert.equal(reloadStateAt(reloadStates, 1).status, 'invalid');
  assert.equal(reloadStateAt(reloadStates, 1).hasCurrent, true);
  assert.deepEqual(events, [['start', {}]]);

  current = descriptor(
    validSource.replace('opening: []', 'opening:\n    - wait: 1'),
    'sha256-recovered',
  );
  watcher.notifyChange();
  setup.clock.advance(100);
  await watcher.whenIdle();
  assert.equal(reloadStateAt(reloadStates, 2).status, 'pending');
  assert.equal(storyStartOption(reloadStateAt(reloadStates, 2)).enabled, true);
  assert.deepEqual(events, [['start', {}]]);

  await watcher.dispose();
  await liveReload.dispose();
});
