import assert from 'node:assert/strict';
import {test} from 'vitest';

import {dsl4FirstPresentationEffectStoryPath} from '../src/dsl4/presentation-effects-gate.js';

test('finds an opt-in action at its escaped story path, ignoring similar custom payloads', () => {
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
