import assert from 'node:assert/strict';
import {test} from 'vitest';

import schema from '../schema/dsl-4.schema.json' with {type: 'json'};
import {createDsl4ProductionSourceFrontend} from '../src/builder/dsl4-source-frontend.js';
import {createLazyDsl4SourceFrontend} from '../src/dsl4/lazy-source-frontend.js';
import type {Dsl4SourceFrontend} from '../src/dsl4/source-frontend.js';

const story = `kamishibai: '4.0'
scenes:
  opening:
    - wait: 0.1
`;

test('builds the frontend on the first parse, once, and parses as the eager frontend does', () => {
  let builds = 0;
  const lazy = createLazyDsl4SourceFrontend(() => {
    builds += 1;
    return createDsl4ProductionSourceFrontend(schema);
  });
  assert.equal(builds, 0, 'creating the runtime must not compile the schema');
  assert.equal(Object.isFrozen(lazy), true);

  const eager = createDsl4ProductionSourceFrontend(schema).parse(story, {sourceId: 'main'});
  const first = lazy.parse(story, {sourceId: 'main'});
  assert.equal(builds, 1);
  assert.deepEqual(first, eager);
  assert.equal(first.ok, true);

  const broken = lazy.parse("kamishibai: '4.0'\nscenes: 3\n");
  assert.equal(builds, 1, 'later parses reuse the built frontend');
  assert.equal(broken.ok, false);
  assert.ok(broken.diagnostics.length > 0);
});

test('passes options through unchanged and omits them when the caller did', () => {
  const calls: unknown[][] = [];
  const inner: Dsl4SourceFrontend = {
    parse: (...args: unknown[]) => {
      calls.push(args);
      return {ok: false, canonicalSource: '', diagnostics: []} as never;
    },
  } as Dsl4SourceFrontend;
  const lazy = createLazyDsl4SourceFrontend(() => inner);
  const project = {targets: []};
  lazy.parse('a');
  lazy.parse('b', {sourceId: 's', project});
  assert.deepEqual(calls, [['a'], ['b', {sourceId: 's', project}]]);
  assert.equal((calls[1]![1] as {project: unknown}).project, project);
});

test('retries a failed build on the next parse and rejects a non-frontend', () => {
  let attempts = 0;
  const lazy = createLazyDsl4SourceFrontend(() => {
    attempts += 1;
    if (attempts === 1) throw new Error('schema unavailable');
    return createDsl4ProductionSourceFrontend(schema);
  });
  assert.throws(() => lazy.parse(story), /schema unavailable/u);
  assert.equal(lazy.parse(story).ok, true);
  assert.equal(attempts, 2);

  assert.throws(
    () => createLazyDsl4SourceFrontend(() => ({}) as Dsl4SourceFrontend).parse(story),
    /must return a source frontend/u,
  );
  assert.throws(() => createLazyDsl4SourceFrontend(null as never), /must be a function/u);
});
