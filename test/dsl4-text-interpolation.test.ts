import assert from 'node:assert/strict';
import {test} from 'vitest';
import {evaluateDsl4TextInterpolation} from '../src/dsl4/text-interpolation.js';

test('bounds interpolation composition depth, node count and result size', () => {
  let deep: unknown = {variable: 'score'};
  for (let level = 0; level < 17; level++) deep = {join: [deep, '']};
  assert.throws(() => evaluateDsl4TextInterpolation({interpolate: deep}, () => 1), /deeply nested/);
  function tree(depth: number): unknown {
    return depth === 0 ? '' : {join: [tree(depth - 1), tree(depth - 1)]};
  }
  assert.throws(() => evaluateDsl4TextInterpolation({interpolate: tree(7)}, () => 1), /too large/);
  const read = (name: string) =>
    name === 'long' ? 'x'.repeat(8192) : name === 'ok' ? false : undefined;
  assert.throws(
    () => evaluateDsl4TextInterpolation({interpolate: {join: ['x', {variable: 'long'}]}}, read),
    /text limit/,
  );
  assert.throws(
    () => evaluateDsl4TextInterpolation({interpolate: {join: [false, '']}}, read),
    /strings or finite numbers/,
  );
  assert.throws(
    () => evaluateDsl4TextInterpolation({interpolate: {variable: 'absent'}}, read),
    /Unknown story variable/,
  );
  assert.equal(
    evaluateDsl4TextInterpolation({interpolate: {join: [{variable: 'ok'}, -12.5]}}, read),
    'false-12.5',
  );
});
