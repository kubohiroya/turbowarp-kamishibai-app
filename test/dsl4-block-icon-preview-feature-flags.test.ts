import assert from 'node:assert/strict';
import {test} from 'vitest';
import {
  readDsl4AssetIconPreviewsFlag,
  readDsl4BlockIconPreviewsFlag,
} from '../src/dsl4/block-icon-preview-feature-flags.js';

for (const [name, read] of [
  ['scene and action previews', readDsl4BlockIconPreviewsFlag],
  ['asset previews', readDsl4AssetIconPreviewsFlag],
] as const)
  test(`${name} default on and can be disabled at startup`, () => {
    for (const search of [
      '',
      '?lang=ja',
      '?twPlusBlockPreview=1',
      '?twPlusBlockPreview=true',
      '?twPlusBlockPreview=01',
      '?project_url=twPlusBlockPreview%3D0',
      '?twPlusYamlEditor=1',
    ])
      assert.equal(read({location: {search}}), true, search);
    assert.equal(read({}), true);
    assert.equal(read({location: {search: '?twPlusBlockPreview=0'}}), false);
    assert.equal(read({location: {search: '?lang=ja&twPlusBlockPreview=0'}}), false);
    assert.equal(read({TW_BLOCK_ICON_PREVIEWS: false}), false);
    assert.equal(read({TW_BLOCK_ICON_PREVIEWS: true}), true);
    // A non-boolean global never decides the flag; the launch URL still does.
    assert.equal(read({TW_BLOCK_ICON_PREVIEWS: 'false'}), true);
    assert.equal(
      read({TW_BLOCK_ICON_PREVIEWS: 'true', location: {search: '?twPlusBlockPreview=0'}}),
      false,
    );
    const launch = {location: {search: '?lang=ja'}};
    const enabled = read(launch);
    launch.location.search = '?twPlusBlockPreview=0';
    assert.equal(enabled, true);
    assert.equal(read(launch), false);
  });
