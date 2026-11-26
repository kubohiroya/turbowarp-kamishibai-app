import assert from 'node:assert/strict';
import {test} from 'vitest';

import {
  dsl4FirstPresentationEffectStoryPath,
  dsl4HasPresentationEffectsRuntime,
  dsl4PresentationEffectsRuntimeCapability,
} from '../src/dsl4/presentation-effects-gate.js';

test('finds a presentation action at its escaped story path, ignoring similar custom payloads', () => {
  const action = {command: 'presentationEffect'};
  const first = {
    id: 'intro',
    actions: [
      {command: 'say', args: {text: 'animate', presentationEffect: action}},
      {command: 'presentationEffect', handler: 'custom'},
    ],
  };
  assert.equal(dsl4FirstPresentationEffectStoryPath({scenes: [first]}), null);
  assert.equal(
    dsl4FirstPresentationEffectStoryPath({
      scenes: [first, {id: 'next/~step', actions: [{command: 'moveTo'}, {command: 'animate'}]}],
    }),
    '/scenes/next~1~0step/actions/1',
  );
  assert.equal(
    dsl4FirstPresentationEffectStoryPath({scenes: [{id: 'next', actions: [action]}]}),
    '/scenes/next/actions/0',
  );
});

test('an explicit playback replacement takes precedence over an embedded runner', () => {
  const current = `data:text/javascript;base64,${btoa(dsl4PresentationEffectsRuntimeCapability)}`;
  assert.equal(dsl4HasPresentationEffectsRuntime(undefined, current), true);
  assert.equal(dsl4HasPresentationEffectsRuntime('old runner', current), false);
  assert.equal(
    dsl4HasPresentationEffectsRuntime(dsl4PresentationEffectsRuntimeCapability, null),
    true,
  );
  assert.equal(
    dsl4HasPresentationEffectsRuntime(undefined, 'data:text/javascript;base64,!'),
    false,
  );
  assert.equal(
    dsl4HasPresentationEffectsRuntime(undefined, 'https://example.test/player.js'),
    false,
  );
});
