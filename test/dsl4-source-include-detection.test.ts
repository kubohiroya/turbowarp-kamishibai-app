import assert from 'node:assert/strict';
import {test} from 'vitest';
import {dsl4SourceDeclaresIncludes} from '../src/dsl4/source-include-detection.js';

test('treats only a top-level include key as a Source Graph entry', () => {
  assert.equal(dsl4SourceDeclaresIncludes("include: chapter.k4.yml\nkamishibai: '4.0'\n"), true);
  assert.equal(
    dsl4SourceDeclaresIncludes("include: [a.k4.yml, b.k4.yml]\nkamishibai: '4.0'\n"),
    true,
  );
  assert.equal(dsl4SourceDeclaresIncludes('{"include": "a.k4.yml", "kamishibai": "4.0"}'), true);
  assert.equal(dsl4SourceDeclaresIncludes("kamishibai: '4.0'\nscenes: {opening: []}\n"), false);
  assert.equal(
    dsl4SourceDeclaresIncludes("kamishibai: '4.0'\nscenes:\n  opening:\n    - include: x\n"),
    false,
  );
});

test('leaves sources it cannot read as one mapping to the single-source frontend', () => {
  assert.equal(dsl4SourceDeclaresIncludes('include: [unclosed'), false);
  assert.equal(dsl4SourceDeclaresIncludes('- include\n'), false);
  assert.equal(dsl4SourceDeclaresIncludes('include: a\n---\ninclude: b\n'), false);
  assert.equal(dsl4SourceDeclaresIncludes(''), false);
});
