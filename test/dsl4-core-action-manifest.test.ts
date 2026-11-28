import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {
  dsl4ActorCoreActionNames,
  dsl4CoreActionManifest,
  dsl4CoreActionNames,
  dsl4CustomActionSchemaDefinition,
  dsl4GlobalCoreActionNames,
} from '../src/dsl4/index.js';
import {dsl4CoreActionQuiesceModes} from '../src/dsl4/action-quiesce.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const schema = JSON.parse(
  await readFile(path.join(projectRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
);

function definitionFromRef(reference: string) {
  const prefix = '#/$defs/';
  assert.equal(reference.startsWith(prefix), true, reference);
  return reference.slice(prefix.length);
}

test('defines one immutable TurboWarp block requirement for every core action', () => {
  assert.equal(Object.isFrozen(dsl4CoreActionManifest), true);
  assert.equal(dsl4CoreActionManifest.length, 35);

  const commands = dsl4CoreActionManifest.map(({command}) => command);
  const schemaDefinitions = dsl4CoreActionManifest.map(({schemaDefinition}) => schemaDefinition);
  const opcodes = dsl4CoreActionManifest.map(
    ({requiredTurboWarpBlock}) => requiredTurboWarpBlock.opcode,
  );
  assert.equal(new Set(commands).size, commands.length);
  assert.equal(new Set(schemaDefinitions).size, schemaDefinitions.length);
  assert.equal(new Set(opcodes).size, opcodes.length);
  assert.deepEqual(opcodes, commands);

  const dispatchKinds = new Set([
    'port',
    'debug',
    'navigation',
    'branch',
    'selection',
    'pose-sequence',
    'variable',
  ]);
  for (const entry of dsl4CoreActionManifest) {
    assert.equal(Object.isFrozen(entry), true);
    assert.equal(Object.isFrozen(entry.requiredTurboWarpBlock), true);
    assert.equal(entry.requiredTurboWarpBlock.visibility, 'visible');
    assert.equal(entry.schemaRef, `#/$defs/${entry.schemaDefinition}`);
    assert.equal(['global', 'actor'].includes(entry.target), true);
    assert.equal(dispatchKinds.has(entry.runtimeDispatch), true);
  }
});

test('keeps registry, quiesce, and schema action variants in manifest parity', () => {
  const globalCommands = dsl4CoreActionManifest
    .filter(({target}) => target === 'global')
    .map(({command}) => command);
  const actorCommands = dsl4CoreActionManifest
    .filter(({target}) => target === 'actor')
    .map(({command}) => command);
  assert.deepEqual(dsl4GlobalCoreActionNames, globalCommands);
  assert.deepEqual(dsl4ActorCoreActionNames, actorCommands);
  assert.deepEqual(dsl4CoreActionNames, [...globalCommands, ...actorCommands]);
  assert.deepEqual(
    dsl4CoreActionQuiesceModes,
    Object.fromEntries(dsl4CoreActionManifest.map(({command, quiesce}) => [command, quiesce])),
  );

  const schemaActionDefinitions = schema.$defs.action.oneOf.map(
    ({['$ref']: reference}: {$ref: string}) => definitionFromRef(reference),
  );
  assert.equal(schemaActionDefinitions.length, dsl4CoreActionManifest.length + 1);
  assert.deepEqual(
    new Set(schemaActionDefinitions),
    new Set([
      ...dsl4CoreActionManifest.map(({schemaDefinition}) => schemaDefinition),
      dsl4CustomActionSchemaDefinition,
    ]),
  );
});
