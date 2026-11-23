import assert from 'node:assert/strict';
import {test} from 'vitest';

import {
  dsl4DefaultPosePreviewOpacity,
  dsl4DefaultPosePreviewPosition,
  readDsl4PosePreviewPlacement,
  validateDsl4PosePreviewOpacity,
  validateDsl4PosePreviewPosition,
} from '../src/dsl4/platform/pose-preview-placement.js';

test('keeps the DSL 3.2 picture when the story says nothing about the preview', () => {
  const placement = readDsl4PosePreviewPlacement(undefined);
  assert.deepEqual(placement, {position: 'full-stage', opacity: 0.2});
  assert.equal(placement.position, dsl4DefaultPosePreviewPosition);
  assert.equal(placement.opacity, dsl4DefaultPosePreviewOpacity);
  assert.deepEqual(readDsl4PosePreviewPlacement({mirroring: 'mirrored'}), placement);
});

test('reads the placement a story asked for, one key at a time', () => {
  assert.deepEqual(readDsl4PosePreviewPlacement({position: 'bottom-right'}), {
    position: 'bottom-right',
    opacity: 0.2,
  });
  assert.deepEqual(readDsl4PosePreviewPlacement({opacity: 0.8}), {
    position: 'full-stage',
    opacity: 0.8,
  });
  assert.deepEqual(
    readDsl4PosePreviewPlacement({mirroring: 'unmirrored', position: 'center', opacity: 0}),
    {position: 'center', opacity: 0},
  );
});

test('refuses a placement the schema would never have produced', () => {
  for (const position of ['everywhere', 'top-center', '', null, 1]) {
    assert.throws(
      () => readDsl4PosePreviewPlacement({position}),
      /recognition\.preview\.position must be one of/u,
    );
  }
  for (const opacity of [-0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '0.5', null]) {
    assert.throws(
      () => readDsl4PosePreviewPlacement({opacity}),
      /recognition\.preview\.opacity must be a finite number from 0 to 1/u,
    );
  }
});

test('names the caller in a direct validation failure', () => {
  assert.equal(validateDsl4PosePreviewPosition('top-left'), 'top-left');
  assert.equal(validateDsl4PosePreviewOpacity(1), 1);
  assert.throws(
    () => validateDsl4PosePreviewPosition('nowhere', 'story camera preview position'),
    /story camera preview position must be one of/u,
  );
  assert.throws(
    () => validateDsl4PosePreviewOpacity(2, 'story camera preview opacity'),
    /story camera preview opacity must be a finite number from 0 to 1/u,
  );
});
