import assert from 'node:assert/strict';
import {test} from 'vitest';
import {
  dsl4RotationStyleNames,
  isDsl4RotationStyle,
  normalizeDsl4Direction,
  scratchDsl4RotationStyle,
} from '../src/dsl4/rotation-style.js';

test('the three rotation styles map to the names Scratch uses', () => {
  assert.deepEqual([...dsl4RotationStyleNames], ['allAround', 'leftRight', 'none']);
  assert.equal(scratchDsl4RotationStyle('allAround'), 'all around');
  assert.equal(scratchDsl4RotationStyle('leftRight'), 'left-right');
  assert.equal(scratchDsl4RotationStyle('none'), "don't rotate");
  for (const style of dsl4RotationStyleNames) assert.equal(isDsl4RotationStyle(style), true);
  for (const value of ['all around', 'allaround', '', 90, null, undefined])
    assert.equal(isDsl4RotationStyle(value), false, String(value));
  assert.throws(
    () => scratchDsl4RotationStyle('mirror' as 'none'),
    /Unknown rotation style: mirror/u,
  );
});

test('an authored angle wraps into Scratch’s own range', () => {
  for (const [input, expected] of [
    [90, 90],
    [0, 0],
    [180, 180],
    [-179, -179],
    [360, 0],
    [181, -179],
    [-180, 180],
    [450, 90],
    [-270, 90],
    [90.005, 90.01],
  ] as const)
    assert.equal(normalizeDsl4Direction(input), expected, String(input));
  for (const value of [Number.NaN, Infinity, -Infinity])
    assert.throws(() => normalizeDsl4Direction(value), /finite/u);
});
