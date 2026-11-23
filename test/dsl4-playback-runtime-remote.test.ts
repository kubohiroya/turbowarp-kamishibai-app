import assert from 'node:assert/strict';
import {createHash, webcrypto} from 'node:crypto';
import {test} from 'vitest';

import {fetchDsl4PlaybackRuntime} from '../src/dsl4/platform/playback-runtime-remote.js';

const source = '// Name: Kamishibai DSL 4.0 Runtime\n// 再生\n';
const bytes = new TextEncoder().encode(source);
const site = Object.freeze({
  version: '4.0.6',
  url: 'https://example.test/runtime/4.0.6/kamishibai-playback.js',
  sha256: createHash('sha256').update(bytes).digest('hex'),
  size: bytes.byteLength,
});

function serving(body: Uint8Array, status = 200) {
  const requests: {url: string; init: RequestInit | undefined}[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    requests.push({url, init});
    return new Response(new Uint8Array(body), {status});
  }) as unknown as typeof globalThis.fetch;
  return {fetch, requests};
}

test('returns the playback runtime once its size and SHA-256 match the record', async () => {
  const {fetch, requests} = serving(bytes);
  assert.equal(
    await fetchDsl4PlaybackRuntime(site, {fetch, subtleCrypto: webcrypto.subtle}),
    source,
  );
  assert.deepEqual(requests, [{url: site.url, init: {credentials: 'omit'}}]);
});

test('refuses a playback runtime that is missing, resized or altered', async () => {
  const altered = Uint8Array.from(bytes);
  altered[0] = 0x20;
  for (const [{fetch}, message] of [
    [serving(bytes, 404), /could not be loaded/u],
    [serving(bytes.subarray(1)), /unexpected size/u],
    [serving(altered), /unexpected digest/u],
  ] as const) {
    await assert.rejects(
      fetchDsl4PlaybackRuntime(site, {fetch, subtleCrypto: webcrypto.subtle}),
      (error: Error & {code?: string}) =>
        error.code === 'K4-PLAYBACK-RUNTIME-001' && message.test(error.message),
    );
  }
  await assert.rejects(
    fetchDsl4PlaybackRuntime(site, {fetch: undefined, subtleCrypto: webcrypto.subtle}),
    {code: 'K4-PLAYBACK-RUNTIME-001'},
  );
  await assert.rejects(
    fetchDsl4PlaybackRuntime(
      {...site, url: 'http://example.test/x.js'},
      {
        fetch: serving(bytes).fetch,
        subtleCrypto: webcrypto.subtle,
      },
    ),
    TypeError,
  );
});
