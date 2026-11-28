import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'vitest';
import {Ajv2020} from 'ajv/dist/2020.js';
import {parse, stringify} from 'yaml';
import base from '../schema/dsl-4.schema.json' with {type: 'json'};
import narrative from '../schema/dsl-4-narrative-control.schema.json' with {type: 'json'};
import editor from '../schema/dsl-4-editor.schema.json' with {type: 'json'};
import contract from './fixtures/dsl4/narrative-control-contract.json' with {type: 'json'};
import {createDsl4TestProductionSourceFrontend} from './helpers/dsl4-test-frontend.ts';
import {dsl4CoreActionManifest} from '../src/dsl4/core-action-manifest.js';
import {
  composeDsl4EditorSchema,
  generateDsl4EditorSchema,
} from '../scripts/schema/generate-dsl4-editor-schema.mjs';

const compile = (schema: unknown) =>
  new Ajv2020({allErrors: true, strict: true}).compile(schema as object);
const baseValidation = compile(base);
const narrativeValidation = compile(narrative);
const editorValidation = compile(editor);
const owner = createDsl4TestProductionSourceFrontend({narrativeControlEnabled: true});

test('the editing schema is generated reproducibly without changing either runtime schema', async () => {
  assert.deepEqual(editor, composeDsl4EditorSchema(base, narrative));
  await generateDsl4EditorSchema({check: true});
  const refs: string[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref') refs.push(String(value));
      else visit(value);
    }
  };
  visit(editor);
  assert.ok(refs.length > 0);
  assert.ok(refs.every((ref) => ref.startsWith('#/')));
  assert.ok(
    new TextEncoder().encode(JSON.stringify({id: editor.$id, schema: editor})).length < 1024 * 1024,
  );
});

test('representative ordinary source forms validate with both the authoring schema and the owner', async () => {
  for (const name of [
    'comprehensive',
    'compact-normalization',
    'named-normalization',
    'remote-assets',
    'unicode-identifiers',
  ]) {
    const source = await readFile(
      new URL(`./fixtures/dsl4/valid/${name}.kamishibai.yaml`, import.meta.url),
      'utf8',
    );
    const raw = parse(source);
    assert.equal(
      editorValidation(raw),
      true,
      `${name}: ${JSON.stringify(editorValidation.errors?.slice(0, 2))}`,
    );
    const accepted = owner.parse(source);
    assert.equal(accepted.ok, true, `${name}: ${JSON.stringify(accepted.diagnostics)}`);
  }
});

test('forEach row references and nested if actions are valid source, not base-schema failures', () => {
  const source = contract.threeVisits.source;
  assert.equal(owner.parse(source).ok, true);
  assert.equal(
    baseValidation(parse(source)),
    false,
    'the runtime ordinary-action schema is not the complete source editing schema',
  );
  assert.equal(
    editorValidation(parse(source)),
    true,
    JSON.stringify(editorValidation.errors?.slice(0, 3)),
  );
});

test('repeat and if structures retain their literal counts and nested ordinary argument constraints', () => {
  const source =
    "kamishibai: '4.0'\nscenes:\n  start:\n    - repeat:\n        times: 2\n        do:\n          - if:\n              condition: true\n              then:\n                - wait: 0\n";
  assert.equal(owner.parse(source).ok, true);
  assert.equal(
    editorValidation(parse(source)),
    true,
    JSON.stringify(editorValidation.errors?.slice(0, 3)),
  );
  const bad = parse(source.replace('times: 2', 'times: wrong'));
  assert.equal(editorValidation(bad), false);
});

test('strict ordinary action names and arguments remain enforced inside narrative structures', () => {
  const ordinaryTypo = parse(
    "kamishibai: '4.0'\nscenes:\n  start:\n    - definitelyUnknownAction: {}\n",
  );
  assert.equal(
    narrativeValidation(ordinaryTypo),
    true,
    'the structural narrative prepass intentionally leaves ordinary validation to the owner',
  );
  assert.equal(
    editorValidation(ordinaryTypo),
    false,
    'a simple union with the permissive narrative prepass would wrongly accept this',
  );
  const argumentTypo = contract.threeVisits.source.replace('seconds: 0', 'secondz: 0');
  assert.equal(owner.parse(argumentTypo).ok, false);
  assert.equal(editorValidation(parse(argumentTypo)), false);
});

test('a reference outside a row scope is not a substitute for a literal action argument', () => {
  const source =
    "kamishibai: '4.0'\nassets:\n  Idle: costume:Narrator\nactors:\n  Narrator: Idle\nscenes:\n  start:\n    - Narrator.say: {text: {ref: visit.name}, seconds: 0}\n";
  assert.equal(editorValidation(parse(source)), false);
  assert.equal(owner.parse(source).ok, false);
});

test('expanded scalar types and unknown row references still require owner validation', () => {
  const wrongType = contract.threeVisits.source.replace(
    'text: {ref: visit.name}',
    'text: {ref: visit.kind}',
  );
  assert.equal(
    editorValidation(parse(wrongType)),
    true,
    'JSON Schema describes reference syntax, not its row expansion result',
  );
  assert.equal(owner.parse(wrongType).ok, false);
  const missing = contract.threeVisits.source.replace('visit.name', 'visit.missing');
  assert.equal(editorValidation(parse(missing)), true);
  assert.equal(owner.parse(missing).ok, false);
});

test('invalid ordinary scalar types, narrative bounds and top-level typos remain rejected', () => {
  for (const source of [
    "kamishibai: '4.0'\nscenes:\n  start: [{wait: bad}]\n",
    "kamishibai: '4.0'\nscenes:\n  start: [{repeat: {times: 1025, do: []}}]\n",
    "kamishibai: '4.0'\nunknownRoot: true\nscenes:\n  start: []\n",
  ])
    assert.equal(editorValidation(parse(source)), false);
});

test('every current core action retains its exact base schema vocabulary in the editing view', () => {
  assert.equal(dsl4CoreActionManifest.length, 35);
  for (const action of dsl4CoreActionManifest) {
    const definitions = editor.$defs as Record<string, unknown>;
    const baseDefinitions = base.$defs as Record<string, unknown>;
    assert.deepEqual(
      definitions[action.schemaDefinition],
      baseDefinitions[action.schemaDefinition],
      action.command,
    );
    assert.ok(Object.hasOwn(definitions, `editorAction_${action.schemaDefinition}`));
  }
});

test('repeat.as exposes typed index/number references while unscoped repeat does not', () => {
  const source =
    "kamishibai: '4.0'\nscenes:\n  start:\n    - repeat:\n        as: round\n        times: 2\n        do:\n          - wait: {ref: round.number}\n";
  assert.equal(owner.parse(source).ok, true);
  assert.equal(
    editorValidation(parse(source)),
    true,
    JSON.stringify(editorValidation.errors?.slice(0, 3)),
  );
  const unscoped = source.replace('        as: round\n', '');
  assert.equal(owner.parse(unscoped).ok, false);
  assert.equal(editorValidation(parse(unscoped)), false);
});

test('dedicated invalidation is synchronized in runtime and editing schemas', () => {
  for (const condition of [false, true]) {
    const input = {
      kamishibai: '4.0',
      scenes: {start: [{invalidate: {condition, then: [{wait: 1}]}}]},
    };
    assert.equal(narrativeValidation(input), true);
    assert.equal(editorValidation(input), true, JSON.stringify(editorValidation.errors));
    assert.equal(owner.parse(stringify(input)).ok, true);
  }
  const invalid = {
    kamishibai: '4.0',
    scenes: {start: [{invalidate: {condition: 'false', then: [{wait: 1}]}}]},
  };
  assert.equal(editorValidation(invalid), false);
  const scoped = {
    kamishibai: '4.0',
    scenes: {
      start: [
        {
          forEach: {
            as: 'row',
            items: [{n: 1}],
            do: [{invalidate: {condition: true, then: [{wait: {ref: 'row.n'}}]}}],
          },
        },
      ],
    },
  };
  assert.equal(editorValidation(scoped), true, JSON.stringify(editorValidation.errors));
  assert.equal(owner.parse(stringify(scoped)).ok, true);
});
