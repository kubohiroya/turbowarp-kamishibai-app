import assert from 'node:assert/strict';
import {test} from 'vitest';
import {createDsl4VideoAssetAdapter} from '../src/dsl4/platform/video-asset-adapter.js';

const bytes = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]);
const payload = (id: string, input = bytes) => ({
  asset: {kind: 'video', id},
  files: [{bytes: input, integrity: 'untrusted'}],
});

test('identical video bytes share an Object URL across distinct asset leases until the last release', async () => {
  let created = 0;
  const revoked: string[] = [];
  const adapter = createDsl4VideoAssetAdapter({
    createObjectURL: () => `blob:${++created}`,
    revokeObjectURL: (url) => {
      revoked.push(url);
    },
  });
  const [a, b] = await Promise.all([
    adapter.prepare(payload('a'), {}),
    adapter.prepare(payload('b'), {}),
  ]);
  assert.notEqual(a, b);
  assert.notEqual(a.assetId, b.assetId);
  assert.equal(a.objectUrl, b.objectUrl);
  assert.equal(created, 1);
  adapter.release(a);
  adapter.release(a);
  assert.deepEqual(revoked, []);
  adapter.release(b);
  assert.deepEqual(revoked, ['blob:1']);
  const next = await adapter.prepare(payload('a'), {});
  assert.equal(created, 2);
  adapter.release(next);
});

test('deduplication uses actual bytes, not supplied integrity, and ownership is adapter-specific', async () => {
  let created = 0;
  const adapter = createDsl4VideoAssetAdapter({
    createObjectURL: () => `blob:${++created}`,
    revokeObjectURL() {},
  });
  const a = await adapter.prepare(payload('a'), {}),
    b = await adapter.prepare(payload('b', Uint8Array.from([...bytes, 1])), {});
  assert.notEqual(a.objectUrl, b.objectUrl);
  assert.throws(() => createDsl4VideoAssetAdapter().release(a), /owned/u);
  adapter.release(a);
  adapter.release(b);
});

test('aborted preparation cannot acquire or revoke another lease', async () => {
  let created = 0;
  const revoked: string[] = [];
  const adapter = createDsl4VideoAssetAdapter({
    createObjectURL: () => `blob:${++created}`,
    revokeObjectURL: (url) => {
      revoked.push(url);
    },
  });
  const a = await adapter.prepare(payload('a'), {}),
    controller = new AbortController();
  const pending = adapter.prepare(payload('b'), {signal: controller.signal});
  controller.abort();
  await assert.rejects(pending, {name: 'AbortError'});
  assert.equal(created, 1);
  assert.deepEqual(revoked, []);
  adapter.release(a);
  assert.deepEqual(revoked, ['blob:1']);
});

test('URL creation failure does not poison the shared cache or block retry', async () => {
  let first = true;
  const adapter = createDsl4VideoAssetAdapter({
    createObjectURL() {
      if (first) {
        first = false;
        throw new Error('create');
      }
      return 'blob:retry';
    },
    revokeObjectURL() {},
  });
  await assert.rejects(adapter.prepare(payload('a'), {}), /create/u);
  const resource = await adapter.prepare(payload('a'), {});
  assert.equal(resource.objectUrl, 'blob:retry');
  adapter.release(resource);
});

test('failed URL revocation remains retryable without sharing or revoking a replacement URL', async () => {
  let ordinal = 0,
    fail = true;
  const live = new Set<string>();
  const adapter = createDsl4VideoAssetAdapter({
    createObjectURL() {
      const url = `blob:${++ordinal}`;
      live.add(url);
      return url;
    },
    revokeObjectURL(url) {
      if (fail) throw new Error('revoke failed');
      live.delete(url);
    },
  });
  const a = await adapter.prepare(payload('a'), {});
  const b = await adapter.prepare(payload('b'), {});
  adapter.release(a);
  assert.throws(() => adapter.release(b), /revoke failed/);
  const replacement = await adapter.prepare(payload('b'), {});
  assert.notEqual(replacement.objectUrl, b.objectUrl);
  fail = false;
  adapter.release(b);
  adapter.release(b);
  assert.deepEqual([...live], [replacement.objectUrl]);
  adapter.release(replacement);
  assert.equal(live.size, 0);
});
