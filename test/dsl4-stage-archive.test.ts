import assert from 'node:assert/strict';
import {strFromU8, unzipSync, zipSync} from 'fflate';
import {test} from 'vitest';
import {
  createDsl4StageArchive,
  unpackDsl4StageArchive,
} from '../src/dsl4/platform/stage-archive.js';

test('stage archive keeps original assets, drops scripts and extensions, and rejects lost assets', () => {
  const project = {
    targets: [
      {blocks: {hat: {opcode: 'event_whenflagclicked'}}, costumes: [{md5ext: 'original.svg'}]},
    ],
    extensions: ['custom'],
    extensionURLs: {custom: 'https://example.test/code.js'},
    extensionStorage: {},
  };
  assert.throws(() => createDsl4StageArchive(project, {}), /requires original/);
  const archive = createDsl4StageArchive(project, {
    'original.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  });
  const files = unzipSync(archive.bytes);
  assert.ok(files['original.svg']);
  const scratch = JSON.parse(strFromU8(files['project.json']!));
  assert.deepEqual(scratch.targets[0].blocks, {});
  assert.equal(scratch.extensions, undefined);
  assert.equal(scratch.extensionStorage, undefined);
  assert.equal(project.targets[0]!.blocks.hat.opcode, 'event_whenflagclicked');
});

test('stage archive rejects oversized entry metadata before inflation', () => {
  const bytes = zipSync({'large.bin': new Uint8Array([1])});
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < bytes.length - 28; i++) {
    if (view.getUint32(i, true) === 0x02014b50) {
      view.setUint32(i + 24, 128 * 1024 * 1024, true);
      break;
    }
  }
  assert.throws(() => unpackDsl4StageArchive(bytes), /exceeds limit/);
});
