import assert from 'node:assert/strict';
import {test} from 'vitest';
import {
  readDsl4AssetIconPreviewsFlag,
  readDsl4BlockIconPreviewsFlag,
} from '../src/dsl4/block-icon-preview-feature-flags.js';

test('block previews stay disabled unless explicitly enabled by the launch environment', () => {
  for (const search of [
    '',
    '?twPlusBlockPreview=0',
    '?twPlusBlockPreview=true',
    '?twPlusBlockPreview=01',
    '?project_url=twPlusBlockPreview%3D1',
    '?twPlusYamlEditor=1',
  ])
    assert.equal(readDsl4BlockIconPreviewsFlag({location: {search}}), false, search);
  assert.equal(readDsl4BlockIconPreviewsFlag({}), false);
  assert.equal(readDsl4BlockIconPreviewsFlag({TW_BLOCK_ICON_PREVIEWS: 'true'}), false);
  assert.equal(readDsl4BlockIconPreviewsFlag({TW_BLOCK_ICON_PREVIEWS: true}), true);
  const launch = {location: {search: '?lang=ja&twPlusBlockPreview=1'}};
  const enabled = readDsl4BlockIconPreviewsFlag(launch);
  launch.location.search = '?twPlusBlockPreview=0';
  assert.equal(enabled, true);
  assert.equal(readDsl4BlockIconPreviewsFlag(launch), false);
});

test('asset previews default on and can be disabled at startup', () => {
  assert.equal(readDsl4AssetIconPreviewsFlag({}), true);
  assert.equal(readDsl4AssetIconPreviewsFlag({location: {search: '?lang=ja'}}), true);
  assert.equal(readDsl4AssetIconPreviewsFlag({location: {search: '?twPlusBlockPreview=0'}}), false);
  assert.equal(
    readDsl4AssetIconPreviewsFlag({location: {search: '?project_url=twPlusBlockPreview%3D0'}}),
    true,
  );
  assert.equal(readDsl4AssetIconPreviewsFlag({TW_BLOCK_ICON_PREVIEWS: false}), false);
  assert.equal(readDsl4AssetIconPreviewsFlag({TW_BLOCK_ICON_PREVIEWS: true}), true);
});
