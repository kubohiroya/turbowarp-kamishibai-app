import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {test} from 'vitest';

import {
  createDsl4TMOfflineRuntime,
  createDsl4TMRuntimeOwner,
  dsl4TMRuntimeOwnerKey,
  installDsl4TMRuntimeOwner,
  readDsl4TMOfflineRuntime,
  validateDsl4TMOfflineRuntime,
} from '../src/dsl4/platform/tm-runtime-owner.ts';

const site = Object.freeze({
  version: '4.3.0',
  runtimeUrl:
    'https://kubohiroya.github.io/turbowarp-kamishibai-app/teachable-machine/4.3.0/runtime.js',
  integrity: 'sha384-abc',
});

type FakeScript = {
  src: string;
  integrity?: string;
  crossOrigin?: string | null;
  async?: boolean;
  listeners: Map<string, () => void>;
  addEventListener(type: string, listener: () => void): void;
  remove(): void;
};

/** A page whose scripts "run" by calling `onLoad` with the appended script. */
function fakePage(onLoad: (script: FakeScript) => 'load' | 'error') {
  const appended: FakeScript[] = [];
  const document = {
    createElement() {
      const script: FakeScript = {
        src: '',
        listeners: new Map(),
        addEventListener(type, listener) {
          this.listeners.set(type, listener);
        },
        remove() {},
      };
      return script;
    },
    head: {
      appendChild(script: FakeScript) {
        appended.push(script);
        queueMicrotask(() => script.listeners.get(onLoad(script))?.());
      },
    },
  };
  return {document, appended};
}

/** What the reviewed runtime publishes when it runs. */
function publishRuntime(
  globalObject: Record<PropertyKey, unknown>,
  version: string = site.version,
) {
  const selection = {
    mode: 'auto',
    backend: 'webgl',
    requested: null,
    fallback: false,
    attempts: [],
  };
  class Webcam {
    constructor(
      readonly width: number,
      readonly height: number,
      readonly flip: boolean,
    ) {}
  }
  Object.assign(globalObject, {
    tf: {},
    tmImage: {},
    tmAudio: {},
    tmPose: {Webcam, loadFromFiles: async (...args: unknown[]) => ({loaded: args.length})},
    tmCompute: {
      select: async () => selection,
      getSelection: () => selection,
      getBackend: () => 'webgl',
    },
    [Symbol.for('@kubohiroya/turbowarp-teachable-machine/runtime')]: {version},
  });
}

test('loads the site runtime once, with Subresource Integrity, only when recognition needs it', async () => {
  const globalObject: Record<PropertyKey, unknown> = {};
  const page = fakePage(() => {
    publishRuntime(globalObject);
    return 'load';
  });
  const owner = createDsl4TMRuntimeOwner({site, globalObject, document: page.document});
  assert.equal(owner.isLoaded(), false);
  assert.equal(owner.compute.getSelection(), null);
  assert.equal(owner.compute.getBackend(), '');
  assert.equal(page.appended.length, 0);
  const [selection] = await Promise.all([owner.compute.select('auto'), owner.ensure()]);
  assert.equal((selection as {backend: string}).backend, 'webgl');
  assert.equal(page.appended.length, 1);
  assert.equal(page.appended[0]?.src, site.runtimeUrl);
  assert.equal(page.appended[0]?.integrity, site.integrity);
  assert.equal(page.appended[0]?.crossOrigin, 'anonymous');
  const webcam = new owner.poseRuntime.Webcam(320, 240, true) as {width: number};
  assert.equal(webcam.width, 320);
  assert.deepEqual(await owner.poseRuntime.loadFromFiles(1, 2, 3), {loaded: 3});
  await owner.ensure();
  assert.equal(page.appended.length, 1);
});

test('a failed load can be tried again', async () => {
  const globalObject: Record<PropertyKey, unknown> = {};
  let attempts = 0;
  const page = fakePage(() => {
    attempts += 1;
    if (attempts === 1) return 'error';
    publishRuntime(globalObject);
    return 'load';
  });
  const owner = createDsl4TMRuntimeOwner({site, globalObject, document: page.document});
  await assert.rejects(owner.ensure(), {code: 'K4-TM-RUNTIME-001'});
  await owner.ensure();
  assert.equal(attempts, 2);
});

test('refuses a different runtime already in the page and a runtime that publishes nothing', async () => {
  const other: Record<PropertyKey, unknown> = {};
  publishRuntime(other, '4.2.0');
  const owner = createDsl4TMRuntimeOwner({site, globalObject: other, document: null});
  assert.throws(() => owner.isLoaded(), {code: 'K4-TM-RUNTIME-002'});

  const silent = fakePage(() => 'load');
  const empty = createDsl4TMRuntimeOwner({site, globalObject: {}, document: silent.document});
  await assert.rejects(empty.ensure(), {code: 'K4-TM-RUNTIME-001'});
  assert.throws(() => new empty.poseRuntime.Webcam(1, 1, false), {code: 'K4-TM-RUNTIME-004'});
});

test('a network-free work loads the runtime it carries, after checking its digest', async () => {
  const source = 'globalThis.published = true;';
  const stored = await createDsl4TMOfflineRuntime(source, site.version, webcrypto.subtle);
  assert.deepEqual(validateDsl4TMOfflineRuntime(stored), stored);
  const globalObject: Record<PropertyKey, unknown> = {};
  const urls: string[] = [];
  const page = fakePage((script) => {
    urls.push(script.src);
    publishRuntime(globalObject);
    return 'load';
  });
  const revoked: string[] = [];
  const owner = createDsl4TMRuntimeOwner({
    site,
    globalObject,
    document: page.document,
    subtleCrypto: webcrypto.subtle,
    readOfflineRuntime: () =>
      readDsl4TMOfflineRuntime({kubohiroyakamishibairuntime4: {tmRuntime: stored}}),
    createObjectURL: () => 'blob:offline-runtime',
    revokeObjectURL: (url) => revoked.push(url),
  });
  await owner.ensure();
  assert.deepEqual(urls, ['blob:offline-runtime']);
  assert.deepEqual(revoked, ['blob:offline-runtime']);

  const altered = createDsl4TMRuntimeOwner({
    site,
    globalObject: {},
    document: page.document,
    subtleCrypto: webcrypto.subtle,
    readOfflineRuntime: () => ({...stored, source: `${source} `}),
  });
  await assert.rejects(altered.ensure(), {code: 'K4-TM-RUNTIME-003'});
  const otherVersion = createDsl4TMRuntimeOwner({
    site,
    globalObject: {},
    document: page.document,
    subtleCrypto: webcrypto.subtle,
    readOfflineRuntime: () => ({...stored, version: '4.2.0'}),
  });
  await assert.rejects(otherVersion.ensure(), {code: 'K4-TM-RUNTIME-002'});
});

test('reads the stored runtime from either storage channel, but not from both', () => {
  const runtime = {formatVersion: 1};
  assert.equal(readDsl4TMOfflineRuntime(undefined), undefined);
  assert.equal(
    readDsl4TMOfflineRuntime({
      kubohiroyakamishibai4: {components: {kubohiroyakamishibairuntime4: {tmRuntime: runtime}}},
    }),
    runtime,
  );
  assert.throws(
    () =>
      readDsl4TMOfflineRuntime({
        kubohiroyakamishibairuntime4: {tmRuntime: runtime},
        kubohiroyakamishibai4: {components: {kubohiroyakamishibairuntime4: {tmRuntime: runtime}}},
      }),
    {code: 'K4-TM-RUNTIME-003'},
  );
  assert.throws(() => validateDsl4TMOfflineRuntime({...runtime, extra: true}), {
    code: 'K4-TM-RUNTIME-003',
  });
});

test('publishes the owner where the Teachable Machine member asks for it', async () => {
  const globalObject: Record<PropertyKey, unknown> = {};
  let ensured = 0;
  installDsl4TMRuntimeOwner(
    {
      isLoaded: () => false,
      ensure: async () => {
        ensured += 1;
      },
      compute: {} as never,
      poseRuntime: {} as never,
    },
    globalObject,
  );
  const published = globalObject[Symbol.for(dsl4TMRuntimeOwnerKey)] as {ensure(): Promise<void>};
  await published.ensure();
  assert.equal(ensured, 1);
});
