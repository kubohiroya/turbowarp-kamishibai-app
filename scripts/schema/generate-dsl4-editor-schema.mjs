import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

/** @typedef {import('ajv').SchemaObject} SchemaObject */
/** @typedef {boolean | SchemaObject} Schema */

/** @template T @param {T} value @returns {T} */
const copy = (value) => JSON.parse(JSON.stringify(value));
const scalarTypes = new Set(['string', 'number', 'integer', 'boolean']);
const singleSchemas = new Set([
  'additionalProperties',
  'propertyNames',
  'items',
  'contains',
  'not',
  'if',
  'then',
  'else',
  'unevaluatedProperties',
  'unevaluatedItems',
  'contentSchema',
]);
const schemaMaps = new Set(['$defs', 'properties', 'patternProperties', 'dependentSchemas']);
const schemaArrays = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
const actionPrefix = 'editorAction_';
const rootPrefix = 'editorNarrative_';
const scopedPrefix = 'editorScopedNarrative_';

/**
 * Preserve runtime schemas; compose an authoring view from their existing structural vocabulary.
 * @param {SchemaObject} base
 * @param {SchemaObject} narrative
 * @returns {SchemaObject}
 */
export function composeDsl4EditorSchema(base, narrative) {
  if (
    base.$schema !== 'https://json-schema.org/draft/2020-12/schema' ||
    narrative.$schema !== base.$schema ||
    !base.$defs?.action?.oneOf ||
    !narrative.$defs?.action?.oneOf
  )
    throw new TypeError('Expected the pinned DSL 4.0 schema contracts.');
  /** @param {Schema | undefined} schema @param {Set<string>} [seen] @returns {boolean} */
  const scalarPossible = (schema, seen = new Set()) => {
    if (!schema || typeof schema !== 'object') return false;
    if (
      (Array.isArray(schema.type) ? schema.type : [schema.type]).some(
        /** @param {string} type */ (type) => scalarTypes.has(type),
      )
    )
      return true;
    if (
      Object.hasOwn(schema, 'const') &&
      ['string', 'number', 'boolean'].includes(typeof schema.const)
    )
      return true;
    if (
      schema.enum?.some(
        /** @param {unknown} value */ (value) =>
          ['string', 'number', 'boolean'].includes(typeof value),
      )
    )
      return true;
    if (typeof schema.$ref === 'string' && schema.$ref.startsWith('#/$defs/')) {
      const key = schema.$ref.slice('#/$defs/'.length);
      if (seen.has(key)) return false;
      return scalarPossible(base.$defs[key], new Set([...seen, key]));
    }
    return ['oneOf', 'anyOf', 'allOf'].some((key) =>
      schema[key]?.some(/** @param {Schema} item */ (item) => scalarPossible(item, seen)),
    );
  };
  /** @param {Schema} schema @param {string} prefix @param {boolean} [allowReferences] @returns {Schema} */
  const transform = (schema, prefix, allowReferences = false) => {
    if (typeof schema === 'boolean') return schema;
    /** @type {SchemaObject} */
    const result = {};
    for (const [key, value] of Object.entries(schema)) {
      if (key === '$ref' && typeof value === 'string' && value.startsWith('#/$defs/'))
        result[key] = `#/$defs/${prefix}${value.slice('#/$defs/'.length)}`;
      else if (singleSchemas.has(key) && value && typeof value === 'object')
        result[key] = transform(value, prefix, allowReferences);
      else if (schemaMaps.has(key))
        result[key] = Object.fromEntries(
          Object.entries(/** @type {Record<string, Schema>} */ (value)).map(([name, child]) => [
            name,
            transform(child, prefix, allowReferences),
          ]),
        );
      else if (schemaArrays.has(key))
        result[key] = value.map(
          /** @param {Schema} child */ (child) => transform(child, prefix, allowReferences),
        );
      else result[key] = copy(value);
    }
    return allowReferences && scalarPossible(schema)
      ? {anyOf: [result, {$ref: `#/$defs/${scopedPrefix}reference`}]}
      : result;
  };
  const output = copy(base);
  output.$id =
    'https://kubohiroya.github.io/turbowarp-kamishibai-app/schema/dsl-4-editor.schema.json';
  output.title = 'TurboWarp-Kamishibai DSL 4.0 source editing';
  output.description =
    'Authoring structure for ordinary and narrative DSL 4.0 source. Owner validation additionally resolves typed references, validates expanded actions and checks runtime/project semantics.';
  for (const [name, definition] of Object.entries(base.$defs))
    output.$defs[actionPrefix + name] = name.startsWith('textInterpolation')
      ? copy(definition)
      : transform(definition, actionPrefix, true);
  for (const prefix of [rootPrefix, scopedPrefix]) {
    for (const [name, definition] of Object.entries(narrative.$defs))
      output.$defs[prefix + name] = transform(definition, prefix);
    const actions = output.$defs[prefix + 'action'].oneOf;
    const fallback = actions.at(-1);
    if (
      fallback?.additionalProperties === undefined ||
      Object.keys(fallback.additionalProperties).length !== 0
    )
      throw new TypeError(
        'Narrative ordinary-action fallback changed; review the editing schema composer.',
      );
    actions[actions.length - 1] = {
      $ref: `#/$defs/${prefix === scopedPrefix ? actionPrefix : ''}action`,
    };
  }
  // forEach introduces row fields; repeat with an explicit as introduces index/number fields.
  output.$defs[rootPrefix + 'forEach'].properties.do = {$ref: `#/$defs/${scopedPrefix}actions`};
  output.$defs[rootPrefix + 'repeat'].properties.do = {$ref: `#/$defs/${scopedPrefix}actions`};
  output.$defs[rootPrefix + 'repeat'].allOf = [
    {
      if: {properties: {as: true}, required: ['as']},
      then: {},
      else: {properties: {do: {$ref: `#/$defs/${rootPrefix}actions`}}},
    },
  ];
  output.$defs.actions.items = {$ref: `#/$defs/${rootPrefix}action`};
  return output;
}

/** @param {{check?: boolean}} [options] @returns {Promise<string>} */
export async function generateDsl4EditorSchema({check = false} = {}) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  /** @param {string} name @returns {Promise<SchemaObject>} */
  const read = (name) => readFile(path.join(root, 'schema', name), 'utf8').then(JSON.parse);
  const [base, narrative] = await Promise.all([
    read('dsl-4.schema.json'),
    read('dsl-4-narrative-control.schema.json'),
  ]);
  const serialized = JSON.stringify(composeDsl4EditorSchema(base, narrative), null, 2) + '\n';
  const output = path.join(root, 'schema/dsl-4-editor.schema.json');
  if (check) {
    if ((await readFile(output, 'utf8')) !== serialized)
      throw new Error(
        'The DSL 4.0 editing schema is stale. Run scripts/schema/generate-dsl4-editor-schema.mjs.',
      );
  } else await writeFile(output, serialized);
  return output;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await generateDsl4EditorSchema({check: process.argv.includes('--check')}));
}
