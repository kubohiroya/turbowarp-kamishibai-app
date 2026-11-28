import assert from 'node:assert/strict';
import {createHash, webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {
  createDsl4EmbeddedAssetBundle,
  createDsl4EmbeddedAssetLifecycle,
  createDsl4SourceFrontend,
  validateDsl4EmbeddedAssetBundle,
} from '../src/dsl4/index.js';
import {thrown} from './helpers/thrown-error.ts';
import {requireArray, requireDefined, requireRecord} from './helpers/require-value.ts';
import {deferred, withDeadline} from './helpers/async-test-helpers.ts';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const schema = JSON.parse(
  await readFile(path.join(repositoryRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
);
const frontend = createDsl4SourceFrontend(schema);
const subtleCrypto = webcrypto.subtle;
const bundleOptions = {maxFiles: 20, maxTotalBytes: 8192, subtleCrypto};

/**
 * The payload the lifecycle hands its adapter for one asset.
 *
 * The lifecycle declares it opaquely, so the members the cases read -- the asset it prepared and
 * the file bytes it copied -- are named here once.
 */
interface PreparedFile {
  path: string;
  size: number;
  integrity: string;
  bytes: Uint8Array;
}

interface PreparedAsset {
  id: string;
  kind: string;
  loading: string;
  target?: string;
}

interface PreparePayload {
  asset: PreparedAsset;
  files: PreparedFile[];
}

/** One prepared resource the adapter answered with. */
interface PreparedResource {
  id: string;
}

/** Hand the constructor a wiring its own types forbid, to prove it refuses one. */
function outOfContract<T>(value: unknown): T {
  return value as T;
}

/** Read one prepare payload as the shape the lifecycle hands the adapter. */
function preparePayload(payload: Readonly<Record<string, unknown>>): PreparePayload {
  return payload as unknown as PreparePayload;
}

/** Read one resource the adapter itself produced, handed back opaquely on release. */
function preparedResource(resource: unknown): PreparedResource {
  return requireRecord(resource, 'a prepared resource') as unknown as PreparedResource;
}

/** The prepare payload a case names by position; every fixture prepares them in order. */
function preparedAt(prepared: readonly PreparePayload[], index: number): PreparePayload {
  return requireDefined(prepared[index], `prepared asset ${index}`);
}

function sri(bytes: Uint8Array) {
  return `sha256-${createHash('sha256').update(bytes).digest('base64')}`;
}

async function runtimeComponent() {
  const parsed = frontend.parse(
    `
kamishibai: '4.0'
assets:
  ProjectBackdrop: backdrop
  OpeningImage:
    kind: backdrop
    file: assets/opening.svg
    loading: lazy
  HeroCostume:
    kind: costume
    target: Hero
    file: assets/hero.svg
  OpeningSound:
    kind: sound
    file: assets/opening.wav
    loading: lazy
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
actors:
  Hero: HeroCostume
scenes:
  opening: []
`,
    {sourceId: 'asset-lifecycle-test'},
  );
  assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
  const blobs = new Map([
    ['HeroCostume\0hero.svg', new TextEncoder().encode('<svg id="hero"/>')],
    ['OpeningImage\0opening.svg', new TextEncoder().encode('<svg id="opening"/>')],
    ['OpeningSound\0opening.wav', new TextEncoder().encode('RIFF-wave')],
    ['RescuePose\0metadata.json', new TextEncoder().encode('{"labels":["rescue"]}')],
    ['RescuePose\0model.json', new TextEncoder().encode('{"model":true}')],
  ]);
  const blob = (key: string) => requireDefined(blobs.get(key), `the ${key} fixture blob`);
  const file = (assetId: string, filePath: string) => ({
    path: filePath,
    size: blob(`${assetId}\0${filePath}`).length,
    integrity: sri(blob(`${assetId}\0${filePath}`)),
  });
  const snapshot = {
    manifest: {
      formatVersion: 1,
      assets: [
        {
          id: 'HeroCostume',
          kind: 'costume',
          target: 'Hero',
          loading: 'eager',
          source: {
            type: 'file',
            inputPath: 'assets/hero.svg',
            mode: 'file',
            files: [file('HeroCostume', 'hero.svg')],
          },
        },
        {
          id: 'OpeningImage',
          kind: 'backdrop',
          loading: 'lazy',
          source: {
            type: 'file',
            inputPath: 'assets/opening.svg',
            mode: 'file',
            files: [file('OpeningImage', 'opening.svg')],
          },
        },
        {
          id: 'OpeningSound',
          kind: 'sound',
          loading: 'lazy',
          source: {
            type: 'file',
            inputPath: 'assets/opening.wav',
            mode: 'file',
            files: [file('OpeningSound', 'opening.wav')],
          },
        },
        {
          id: 'ProjectBackdrop',
          kind: 'backdrop',
          loading: 'eager',
          source: {type: 'project', name: 'ProjectBackdrop'},
        },
        {
          id: 'RescuePose',
          kind: 'recognitionModel',
          loading: 'eager',
          source: {
            type: 'file',
            inputPath: 'pose-models/rescue',
            mode: 'directory',
            files: [file('RescuePose', 'metadata.json'), file('RescuePose', 'model.json')],
          },
        },
      ],
    },
    getFile(assetId: string, filePath: string) {
      return new Uint8Array(blob(`${assetId}\0${filePath}`));
    },
  };
  const descriptor = await createDsl4EmbeddedAssetBundle(
    parsed.storyDocument,
    snapshot,
    bundleOptions,
  );
  const validated = await validateDsl4EmbeddedAssetBundle(
    parsed.storyDocument,
    descriptor,
    bundleOptions,
  );
  return {
    storyDocument: parsed.storyDocument,
    assetBundle: validated.descriptor,
    getAssetFile: validated.getFile,
    blobs,
  };
}

function context(controller = new AbortController(), generation = 1) {
  return Object.freeze({signal: controller.signal, generation, sceneId: 'opening'});
}

test('reacquisition retries the retired embedded resource before creating its replacement', async () => {
  const live = new Set<unknown>();
  let created = 0,
    fail = true;
  const lifecycle = createDsl4EmbeddedAssetLifecycle({
    runtimeComponent: await runtimeComponent(),
    adapter: {
      prepare() {
        const resource = {ordinal: ++created};
        live.add(resource);
        assert.equal(live.size, 1);
        return resource;
      },
      release(resource) {
        if (fail) throw new Error('native cleanup failed');
        live.delete(resource);
      },
    },
    setLoading() {},
  });
  await lifecycle.prepare({assetIds: ['OpeningImage']}, context());
  const old = lifecycle.getResource('OpeningImage');
  await assert.rejects(lifecycle.releaseAssets({assetIds: ['OpeningImage']}), AggregateError);
  fail = false;
  await lifecycle.prepare({assetIds: ['OpeningImage']}, context(undefined, 2));
  assert.notEqual(lifecycle.getResource('OpeningImage'), old);
  assert.equal(created, 2);
  await lifecycle.release({reason: 'dispose'});
  assert.equal(live.size, 0);
});

test('a late aborted resource remains retryable when its stale cleanup fails', async () => {
  const live = new Set<unknown>();
  let finish: (() => void) | undefined;
  let fail = true,
    attempts = 0;
  const lifecycle = createDsl4EmbeddedAssetLifecycle({
    runtimeComponent: await runtimeComponent(),
    adapter: {
      prepare() {
        return new Promise<object>((resolve) => {
          finish = () => {
            const resource = {};
            live.add(resource);
            resolve(resource);
          };
        });
      },
      release(resource) {
        attempts++;
        if (fail) throw new Error('stale cleanup failed');
        live.delete(resource);
      },
    },
    setLoading() {},
  });
  const abort = new AbortController();
  const preparation = lifecycle.prepare({assetIds: ['OpeningImage']}, context(abort));
  abort.abort();
  requireDefined(finish, 'late preparation')();
  await assert.rejects(preparation, /stale cleanup failed/);
  assert.equal(live.size, 1);
  assert.equal(lifecycle.getResource('OpeningImage'), null);
  fail = false;
  await lifecycle.releaseAssets({assetIds: ['OpeningImage']});
  assert.equal(attempts, 2);
  assert.equal(live.size, 0);
});

for (const failCleanup of [false, true])
  test(`reacquisition before aborted prepare completes ${failCleanup ? 'rejects while old cleanup fails' : 'waits for successful old cleanup'}`, async () => {
    const live = new Set<unknown>();
    const late = deferred<object>();
    let fail = failCleanup,
      created = 0,
      attempts = 0;
    const lifecycle = createDsl4EmbeddedAssetLifecycle({
      runtimeComponent: await runtimeComponent(),
      adapter: {
        prepare() {
          created++;
          if (created === 1) return late.promise;
          assert.equal(live.size, 0, 'The retired handle must be released before replacement');
          const resource = {ordinal: created};
          live.add(resource);
          return resource;
        },
        release(resource) {
          attempts++;
          if (fail) throw new Error('stale cleanup failed');
          live.delete(resource);
        },
      },
      setLoading() {},
    });
    const abort = new AbortController();
    const first = lifecycle.prepare({assetIds: ['OpeningImage']}, context(abort));
    abort.abort();
    const next = lifecycle.prepare({assetIds: ['OpeningImage']}, context(undefined, 2));
    const joined = lifecycle.prepare({assetIds: ['OpeningImage']}, context(undefined, 3));
    const completion = Promise.allSettled([first, next, joined]);
    const old = {ordinal: 1};
    live.add(old);
    late.resolve(old);
    const results = await withDeadline(completion, 'reacquire while old prepare settles', 1000);
    assert.equal(results[0]!.status, 'rejected');
    if (failCleanup) {
      assert.equal(results[1]!.status, 'rejected');
      assert.equal(results[2]!.status, 'rejected');
      assert.equal(created, 1);
      assert.deepEqual([...live], [old]);
      assert.equal(lifecycle.getResource('OpeningImage'), null);
      assert(attempts >= 2);
      fail = false;
      await lifecycle.prepare({assetIds: ['OpeningImage']}, context(undefined, 4));
    } else {
      assert.equal(results[1]!.status, 'fulfilled');
      assert.equal(results[2]!.status, 'fulfilled');
    }
    assert.equal(created, 2);
    assert.equal(live.size, 1);
    assert.notEqual(lifecycle.getResource('OpeningImage'), old);
    await lifecycle.release({reason: 'dispose'});
    assert.equal(live.size, 0);
  });

test('materializes every kind in stable order with project refs and file byte copies', async () => {
  const component = await runtimeComponent();
  const prepared: PreparePayload[] = [];
  const released: unknown[] = [];
  const lifecycle = createDsl4EmbeddedAssetLifecycle({
    runtimeComponent: component,
    adapter: {
      prepare(payload: Readonly<Record<string, unknown>>) {
        prepared.push(preparePayload(payload));
        return {id: preparePayload(payload).asset.id};
      },
      release(resource: unknown, details: Readonly<Record<string, unknown>>) {
        released.push([preparedResource(resource).id, details.reason]);
      },
    },
    setLoading() {},
  });
  await lifecycle.prepare(
    {
      assetIds: [
        'RescuePose',
        'OpeningSound',
        'OpeningImage',
        'HeroCostume',
        'ProjectBackdrop',
        'OpeningImage',
      ],
    },
    context(),
  );
  assert.deepEqual(
    prepared.map(({asset}) => asset.id),
    ['HeroCostume', 'OpeningImage', 'OpeningSound', 'ProjectBackdrop', 'RescuePose'],
  );
  assert.deepEqual(
    prepared.map(({asset}) => [asset.kind, asset.loading, asset.target]),
    [
      ['costume', 'eager', 'Hero'],
      ['backdrop', 'lazy', undefined],
      ['sound', 'lazy', undefined],
      ['backdrop', 'eager', undefined],
      ['recognitionModel', 'eager', undefined],
    ],
  );
  assert.deepEqual(preparedAt(prepared, 3).files, []);
  assert.deepEqual(
    preparedAt(prepared, 4).files.map(({path: filePath}) => filePath),
    ['metadata.json', 'model.json'],
  );
  const openingFile = requireDefined(preparedAt(prepared, 1).files[0], 'its first file');
  const openingBlob = requireDefined(
    component.blobs.get('OpeningImage\0opening.svg'),
    'the opening image blob',
  );
  assert.match(openingFile.integrity, /^sha256-/u);
  assert.equal(openingFile.size, openingBlob.length);
  openingFile.bytes[0] = requireDefined(openingFile.bytes[0], 'its first byte') ^ 0xff;

  await lifecycle.release({reason: 'stop'});
  assert.deepEqual(
    released.map((entry) => requireArray(entry, 'a release record')[0]),
    ['RescuePose', 'ProjectBackdrop', 'OpeningSound', 'OpeningImage', 'HeroCostume'],
  );
  await lifecycle.prepare({assetIds: ['OpeningImage']}, context(undefined, 2));
  assert.deepEqual(
    requireDefined(requireDefined(prepared.at(-1), 'the last prepared asset').files[0], 'its file')
      .bytes,
    openingBlob,
  );
  await lifecycle.release({reason: 'dispose'});
});

test('deduplicates pending and ready preparation and caches failures until release', async () => {
  const component = await runtimeComponent();
  let resolvePending: ((resource: PreparedResource) => void) | undefined;
  let attempts = 0;
  let fail = false;
  const lifecycle = createDsl4EmbeddedAssetLifecycle({
    runtimeComponent: component,
    adapter: {
      prepare(payload: Readonly<Record<string, unknown>>) {
        const {asset} = preparePayload(payload);
        attempts += 1;
        if (fail) throw new Error(`failed ${asset.id}`);
        if (asset.id === 'OpeningImage' && resolvePending === undefined) {
          return new Promise((resolve) => {
            resolvePending = resolve;
          });
        }
        return {id: asset.id};
      },
      release() {},
    },
    setLoading() {},
  });
  const first = lifecycle.prepare({assetIds: ['OpeningImage']}, context());
  const second = lifecycle.prepare({assetIds: ['OpeningImage', 'OpeningImage']}, context());
  assert.equal(attempts, 1);
  requireDefined(resolvePending, 'the pending preparation')({id: 'OpeningImage'});
  await Promise.all([first, second]);
  await lifecycle.prepare({assetIds: ['OpeningImage']}, context());
  assert.equal(attempts, 1);

  fail = true;
  await assert.rejects(lifecycle.prepare({assetIds: ['OpeningSound']}, context()), /failed/u);
  await assert.rejects(lifecycle.prepare({assetIds: ['OpeningSound']}, context()), /failed/u);
  assert.equal(attempts, 2);
  await lifecycle.release({reason: 'reset'});
  fail = false;
  await lifecycle.prepare({assetIds: ['OpeningSound']}, context(undefined, 2));
  assert.equal(attempts, 3);
  await lifecycle.release({reason: 'dispose'});
});

test('selectively releases one resource and serializes its next preparation', async () => {
  const component = await runtimeComponent();
  const attempts = new Map();
  const releases: unknown[][] = [];
  let finishSelectiveRelease: (() => void) | undefined;
  const lifecycle = createDsl4EmbeddedAssetLifecycle({
    runtimeComponent: component,
    adapter: {
      prepare(payload: Readonly<Record<string, unknown>>) {
        const {asset} = preparePayload(payload);
        attempts.set(asset.id, (attempts.get(asset.id) ?? 0) + 1);
        return {id: asset.id};
      },
      release(resource: unknown, details: Readonly<Record<string, unknown>>) {
        const released = preparedResource(resource);
        releases.push([released.id, details.reason]);
        if (released.id === 'OpeningImage' && details.reason === 'scene-transition') {
          return new Promise<void>((resolve) => {
            finishSelectiveRelease = resolve;
          });
        }
      },
    },
    setLoading() {},
  });
  await lifecycle.prepare({assetIds: ['OpeningImage', 'OpeningSound']}, context());

  const selectiveRelease = lifecycle.releaseAssets({
    assetIds: ['OpeningImage'],
    reason: 'scene-transition',
  });
  while (finishSelectiveRelease === undefined)
    await new Promise((resolve) => setImmediate(resolve));
  const retry = lifecycle.prepare({assetIds: ['OpeningImage']}, context(undefined, 2));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attempts.get('OpeningImage'), 1);
  assert.equal(attempts.get('OpeningSound'), 1);

  requireDefined(finishSelectiveRelease, 'the pending selective release')();
  await Promise.all([selectiveRelease, retry]);
  assert.equal(attempts.get('OpeningImage'), 2);
  await lifecycle.prepare({assetIds: ['OpeningSound']}, context(undefined, 2));
  assert.equal(attempts.get('OpeningSound'), 1);

  await lifecycle.release({reason: 'dispose'});
  assert.deepEqual(releases, [
    ['OpeningImage', 'scene-transition'],
    ['OpeningImage', 'dispose'],
    ['OpeningSound', 'dispose'],
  ]);
});

test('joins concurrent full releases so every adapter resource finishes releasing once', async () => {
  const component = await runtimeComponent();
  const released: unknown[] = [];
  let finishFirstRelease: (() => void) | undefined;
  const lifecycle = createDsl4EmbeddedAssetLifecycle({
    runtimeComponent: component,
    adapter: {
      prepare(payload: Readonly<Record<string, unknown>>) {
        return {id: preparePayload(payload).asset.id};
      },
      release(resource: unknown) {
        released.push(preparedResource(resource).id);
        if (released.length === 1) {
          return new Promise<void>((resolve) => {
            finishFirstRelease = resolve;
          });
        }
      },
    },
    setLoading() {},
  });
  await lifecycle.prepare({assetIds: ['OpeningImage', 'OpeningSound']}, context());
  const first = lifecycle.release({reason: 'stop'});
  while (finishFirstRelease === undefined) await new Promise((resolve) => setImmediate(resolve));
  const second = lifecycle.release({reason: 'dispose'});
  assert.strictEqual(second, first);
  const selected = lifecycle.releaseAssets({assetIds: ['OpeningSound']});
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(released, ['OpeningSound']);
  requireDefined(finishFirstRelease, 'the pending release')();
  await Promise.all([first, second, selected]);
  assert.deepEqual(released, ['OpeningSound', 'OpeningImage']);
});

test('releases a late stale resource after Abort and permits a clean retry', async () => {
  const component = await runtimeComponent();
  const pending: (() => void)[] = [];
  const released: unknown[] = [];
  const lifecycle = createDsl4EmbeddedAssetLifecycle({
    runtimeComponent: component,
    adapter: {
      prepare(payload: Readonly<Record<string, unknown>>) {
        const {asset} = preparePayload(payload);
        return new Promise((resolve) => pending.push(() => resolve({id: asset.id})));
      },
      release(resource: unknown, details: Readonly<Record<string, unknown>>) {
        released.push([preparedResource(resource).id, details.reason]);
      },
    },
    setLoading() {},
  });
  const controller = new AbortController();
  const first = lifecycle.prepare({assetIds: ['OpeningImage']}, context(controller));
  controller.abort('scene-superseded');
  requireDefined(pending.shift(), 'a pending preparation')();
  await assert.rejects(first, (error) => thrown(error).name === 'AbortError');
  assert.deepEqual(released, [['OpeningImage', 'stale']]);

  const retry = lifecycle.prepare({assetIds: ['OpeningImage']}, context(undefined, 2));
  requireDefined(pending.shift(), 'a pending preparation')();
  await retry;
  await lifecycle.release({reason: 'stop'});
  assert.deepEqual(released, [
    ['OpeningImage', 'stale'],
    ['OpeningImage', 'stop'],
  ]);
});

test('waits for pending resources on release and aggregates every release failure', async () => {
  const component = await runtimeComponent();
  let resolvePending: (() => void) | undefined;
  const released: unknown[] = [];
  const pendingLifecycle = createDsl4EmbeddedAssetLifecycle({
    runtimeComponent: component,
    adapter: {
      prepare(payload: Readonly<Record<string, unknown>>) {
        const {asset} = preparePayload(payload);
        return new Promise((resolve) => {
          resolvePending = () => resolve({id: asset.id});
        });
      },
      release(resource: unknown, details: Readonly<Record<string, unknown>>) {
        released.push([preparedResource(resource).id, details.reason]);
      },
    },
    setLoading() {},
  });
  const preparation = pendingLifecycle.prepare({assetIds: ['OpeningImage']}, context());
  const release = pendingLifecycle.release({reason: 'dispose'});
  requireDefined(resolvePending, 'the pending preparation')();
  await assert.rejects(preparation, (error) => thrown(error).name === 'AbortError');
  await release;
  assert.deepEqual(released, [['OpeningImage', 'stale']]);

  const attempted: unknown[] = [];
  let failRelease = true;
  const failingLifecycle = createDsl4EmbeddedAssetLifecycle({
    runtimeComponent: component,
    adapter: {
      prepare(payload: Readonly<Record<string, unknown>>) {
        return {id: preparePayload(payload).asset.id};
      },
      release(resource: unknown) {
        const released = preparedResource(resource);
        attempted.push(released.id);
        if (failRelease) throw new Error(`release ${released.id}`);
      },
    },
    setLoading() {},
  });
  await failingLifecycle.prepare({assetIds: ['OpeningImage', 'OpeningSound']}, context());
  await assert.rejects(failingLifecycle.release({reason: 'stop'}), (error) => {
    assert.equal(error instanceof AggregateError, true);
    assert.equal(requireArray(thrown(error).errors, 'the aggregated errors').length, 2);
    return true;
  });
  assert.deepEqual(attempted, ['OpeningSound', 'OpeningImage']);
  failRelease = false;
  await failingLifecycle.release({reason: 'again'});
  assert.deepEqual(attempted, ['OpeningSound', 'OpeningImage', 'OpeningSound', 'OpeningImage']);
});

test('forwards Loading calls and rejects invalid contracts before adapter side effects', async () => {
  const component = await runtimeComponent();
  const loadingCalls: unknown[][] = [];
  let preparations = 0;
  const lifecycle = createDsl4EmbeddedAssetLifecycle({
    runtimeComponent: component,
    adapter: {
      prepare() {
        preparations += 1;
      },
      release() {},
    },
    setLoading(payload: unknown, callContext: unknown) {
      loadingCalls.push([payload, callContext]);
      return 'shown';
    },
  });
  const payload = Object.freeze({visible: true, sceneId: 'opening'});
  const callContext = context();
  assert.equal(await lifecycle.setLoading(payload, callContext), 'shown');
  const firstLoadingCall = requireDefined(loadingCalls[0], 'the first Loading call');
  assert.strictEqual(firstLoadingCall[0], payload);
  assert.strictEqual(firstLoadingCall[1], callContext);
  await assert.rejects(
    lifecycle.prepare({assetIds: ['Missing', 'OpeningImage']}, callContext),
    /Unknown embedded asset/u,
  );
  assert.equal(preparations, 0);

  // Deliberately out of contract: each case omits members the constructor requires, to prove it
  // refuses the wiring rather than trusting the declaration.
  assert.throws(
    () =>
      createDsl4EmbeddedAssetLifecycle(
        outOfContract({runtimeComponent: {}, adapter: {}, setLoading() {}}),
      ),
    TypeError,
  );
  assert.throws(
    () =>
      createDsl4EmbeddedAssetLifecycle(
        outOfContract({runtimeComponent: component, adapter: {}, setLoading() {}}),
      ),
    TypeError,
  );
});
