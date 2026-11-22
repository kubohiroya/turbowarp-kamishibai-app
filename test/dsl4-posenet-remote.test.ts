import assert from 'node:assert/strict';
import {createHash, webcrypto} from 'node:crypto';
import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'vitest';

import {poseNetBundleManifest} from '@kubohiroya/turbowarp-teachable-machine/posenet';

import {createDsl4ProjectTMRuntime} from '../src/dsl4/platform/posenet-bundle.js';
import {
  createDsl4PoseNetRemoteDescriptor,
  createDsl4PoseNetRemoteLoader,
  dsl4PoseNetRemoteBaseUrl,
  dsl4PoseNetRemoteCacheName,
  dsl4PoseNetRemoteFilename,
  isDsl4PoseNetRemoteDescriptor,
  validateDsl4PoseNetRemoteDescriptor,
} from '../src/dsl4/platform/posenet-remote.js';
import {writePoseNetSiteAssets} from '../scripts/sb3/posenet-site-assets.ts';
import {thrown} from './helpers/thrown-error.ts';

let pendingFiles: Promise<Map<string, Uint8Array>> | undefined;
/** PoseNet bytes by content-addressed site URL, as the Pages site serves them. */
function siteFiles() {
  pendingFiles ??= Promise.all(
    poseNetBundleManifest.files.map(
      async (file) =>
        [
          `${dsl4PoseNetRemoteBaseUrl}sha256-${file.sha256}`,
          new Uint8Array(await readFile(fileURLToPath(import.meta.resolve(file.packageSpecifier)))),
        ] as const,
    ),
  ).then((entries) => new Map(entries));
  return pendingFiles;
}

function createSite({fail = false}: {fail?: boolean} = {}) {
  const requests: string[] = [];
  const site = {
    fail,
    tamper: false,
    async fetch(input: string) {
      requests.push(input);
      if (site.fail) throw new TypeError('Failed to fetch');
      const bytes = (await siteFiles()).get(input);
      if (!bytes) return new Response('missing', {status: 404});
      const body = new Uint8Array(bytes);
      if (site.tamper) body[0] = body[0]! ^ 0xff;
      return new Response(body);
    },
  };
  return {site, requests};
}

function createCaches() {
  const entries = new Map<string, Uint8Array>();
  const opened: string[] = [];
  const cache = {
    async match(url: string) {
      const bytes = entries.get(url);
      return bytes ? new Response(new Uint8Array(bytes)) : undefined;
    },
    async put(url: string, response: Response) {
      entries.set(url, new Uint8Array(await response.arrayBuffer()));
    },
    async delete(url: string) {
      return entries.delete(url);
    },
  };
  return {
    entries,
    opened,
    caches: {
      async open(name: string) {
        opened.push(name);
        return cache as unknown as Cache;
      },
    },
  };
}

test('describes the pinned PoseNet files at content-addressed site URLs', () => {
  const descriptor = createDsl4PoseNetRemoteDescriptor();
  assert.equal(isDsl4PoseNetRemoteDescriptor(descriptor), true);
  assert.equal(descriptor.baseUrl, dsl4PoseNetRemoteBaseUrl);
  assert.deepEqual(
    descriptor.files.map(({path: name, size}) => [name, size]),
    [
      ['model-stride16.json', 49_720],
      ['group1-shard1of2.bin', 4_194_304],
      ['group1-shard2of2.bin', 838_476],
    ],
  );
  assert.deepEqual(validateDsl4PoseNetRemoteDescriptor(structuredClone(descriptor)), descriptor);
  assert.equal(
    dsl4PoseNetRemoteFilename(descriptor.files[0]!.sha256),
    `sha256-${poseNetBundleManifest.files[0]!.sha256}`,
  );
  // The stored descriptor is a few hundred bytes instead of 6.8 MB of base64.
  assert.ok(JSON.stringify(descriptor).length < 1024);
});

test('rejects remote descriptors that do not name the pinned model or a plain https base', () => {
  const descriptor = createDsl4PoseNetRemoteDescriptor();
  for (const invalid of [
    {...descriptor, baseUrl: 'http://kubohiroya.github.io/turbowarp-kamishibai-app/posenet/'},
    {...descriptor, baseUrl: 'https://example.com/posenet'},
    {...descriptor, baseUrl: 'https://user:secret@example.com/posenet/'},
    {...descriptor, files: descriptor.files.slice(0, 2)},
    {
      ...descriptor,
      files: descriptor.files.map((file, index) =>
        index === 1 ? {...file, sha256: '0'.repeat(64)} : file,
      ),
    },
    {...descriptor, extra: true},
    {...descriptor, formatVersion: 2},
  ]) {
    assert.throws(
      () => validateDsl4PoseNetRemoteDescriptor(invalid),
      (error) => thrown(error).code === 'K4-POSENET-REMOTE-001',
    );
  }
  assert.equal(isDsl4PoseNetRemoteDescriptor({encoding: 'base64'}), false);
});

test('downloads once, then serves every later load from the shared cache', async () => {
  const {site, requests} = createSite();
  const {caches, entries, opened} = createCaches();
  const options = {
    descriptor: createDsl4PoseNetRemoteDescriptor(),
    fetch: site.fetch,
    caches,
    subtleCrypto: webcrypto.subtle,
  };
  const first = await createDsl4PoseNetRemoteLoader(options)();
  assert.deepEqual(
    first.map(({path: name, bytes}) => [name, bytes.byteLength]),
    poseNetBundleManifest.files.map(({path: name, size}) => [name, size]),
  );
  assert.equal(requests.length, 3);
  assert.deepEqual([...entries.keys()].sort(), [...(await siteFiles()).keys()].sort());

  // Another work built against the same model shares the cached bytes.
  const second = await createDsl4PoseNetRemoteLoader(options)();
  assert.equal(requests.length, 3);
  assert.equal(second[1]!.bytes.byteLength, 4_194_304);
  assert.deepEqual(new Set(opened), new Set([dsl4PoseNetRemoteCacheName]));
});

test('replaces a damaged cache entry and refuses tampered downloads', async () => {
  const {site, requests} = createSite();
  const {caches, entries} = createCaches();
  const options = {
    descriptor: createDsl4PoseNetRemoteDescriptor(),
    fetch: site.fetch,
    caches,
    subtleCrypto: webcrypto.subtle,
  };
  await createDsl4PoseNetRemoteLoader(options)();
  const damagedUrl = [...entries.keys()][0]!;
  const damaged = new Uint8Array(entries.get(damagedUrl)!);
  damaged[0] = damaged[0]! ^ 0xff;
  entries.set(damagedUrl, damaged);
  await createDsl4PoseNetRemoteLoader(options)();
  assert.equal(requests.length, 4);
  assert.equal(requests.at(-1), damagedUrl);
  const repaired = entries.get(damagedUrl)!;
  assert.equal(
    createHash('sha256').update(repaired).digest('hex'),
    damagedUrl.slice(-64),
    'the cache holds the verified bytes again',
  );

  site.tamper = true;
  entries.clear();
  await assert.rejects(
    createDsl4PoseNetRemoteLoader(options)(),
    (error) => thrown(error).code === 'K4-POSENET-REMOTE-003',
  );
  assert.equal(entries.size, 0, 'tampered bytes are never cached');
});

test('works without Cache Storage and reports download failures with a code', async () => {
  const {site, requests} = createSite();
  const options = {
    descriptor: createDsl4PoseNetRemoteDescriptor(),
    fetch: site.fetch,
    subtleCrypto: webcrypto.subtle,
  };
  await createDsl4PoseNetRemoteLoader(options)();
  await createDsl4PoseNetRemoteLoader({
    ...options,
    caches: {
      async open() {
        throw new DOMException('opaque origin', 'SecurityError');
      },
    },
  })();
  assert.equal(requests.length, 6);

  site.fail = true;
  await assert.rejects(
    createDsl4PoseNetRemoteLoader(options)(),
    (error) => thrown(error).code === 'K4-POSENET-REMOTE-002',
  );
  await assert.rejects(
    createDsl4PoseNetRemoteLoader({
      ...options,
      fetch: async () => new Response('gone', {status: 404}),
    })(),
    (error) => thrown(error).code === 'K4-POSENET-REMOTE-002',
  );
  assert.throws(
    () => createDsl4PoseNetRemoteLoader({...options, fetch: undefined}),
    (error) => thrown(error).code === 'K4-POSENET-REMOTE-002',
  );
});

test('the project runtime downloads with the fetch it had before Teachable Machine swapped it, and retries after a failure', async () => {
  const {site, requests} = createSite({fail: true});
  const {caches} = createCaches();
  const globalObject: Record<PropertyKey, unknown> = {
    Response,
    crypto: webcrypto,
    caches,
    location: {href: 'https://turbowarp.example/'},
    fetch: site.fetch,
  };
  const loadedSizes: number[] = [];
  const runtime = createDsl4ProjectTMRuntime({
    runtime: {
      Webcam: class {},
      async loadFromFiles() {
        // PoseNet asks for its weights through the swapped fetch, which answers from the supply.
        const fetch = globalObject.fetch as (url: string) => Promise<Response>;
        assert.notEqual(fetch, site.fetch);
        const response = await fetch(poseNetBundleManifest.files[1]!.url);
        loadedSizes.push((await response.arrayBuffer()).byteLength);
        return {labels: ['pose']};
      },
    },
    globalObject,
    project: {
      extensionStorage: {
        kubohiroyakamishibairuntime4: {poseNet: createDsl4PoseNetRemoteDescriptor()},
      },
    },
  });

  await assert.rejects(
    runtime.loadFromFiles({}, {}, {}),
    (error) => thrown(error).code === 'K4-POSENET-REMOTE-002',
  );
  assert.equal(globalObject.fetch, site.fetch, 'Teachable Machine restored the page fetch');

  site.fail = false;
  assert.deepEqual(await runtime.loadFromFiles({}, {}, {}), {labels: ['pose']});
  assert.deepEqual(loadedSizes, [4_194_304]);
  assert.ok(requests.every((url) => url.startsWith(dsl4PoseNetRemoteBaseUrl)));
});

test('the site build publishes every recorded PoseNet digest', async () => {
  const siteRoot = await mkdtemp(path.join(tmpdir(), 'kamishibai-posenet-site-'));
  try {
    const written = await writePoseNetSiteAssets(siteRoot);
    assert.deepEqual(
      written.map(({file}) => file),
      poseNetBundleManifest.files.map(({sha256}) => `posenet/sha256-${sha256}`),
    );
    const names = await readdir(path.join(siteRoot, 'posenet'));
    assert.equal(names.length, 3);
    for (const [url, bytes] of await siteFiles()) {
      const published = await readFile(path.join(siteRoot, 'posenet', url.split('/').at(-1)!));
      assert.deepEqual(new Uint8Array(published), bytes);
    }
  } finally {
    await rm(siteRoot, {recursive: true, force: true});
  }
});
