import assert from 'node:assert/strict';
import {test} from 'vitest';
import {
  canonicalDsl4AuthoringOpcode,
  canonicalizeDsl4AuthoringBlocks,
  dsl4AuthoringBlockName,
  dsl4AuthoringBlockNames,
  dsl4AuthoringOpcode,
  formDsl4AuthoringBlocks,
  isDsl4BlockSourceHat,
  isDsl4IncludeBlocks,
} from '../src/dsl4/block-source-shared.js';
import {createDsl4BlockAuthoringInfo} from '../src/dsl4/structured-block-source-codec.js';
import {dsl4CoreActionManifest} from '../src/dsl4/core-action-manifest.js';
import {dsl4RuntimePaletteGroups, dsl4RuntimeTranslations} from '../src/dsl4/block-palette-i18n.js';
import {
  createDsl4RuntimeDeclarationEditorDefinitions,
  installDsl4RuntimeDeclarationEditors,
} from '../src/builder/dsl4-runtime-declaration-editors.js';
import {
  readDsl4NarrativeRuntimeExtensionSource,
  readDsl4PlaybackRuntimeExtensionSource,
} from '../src/builder/dsl4-playback-runtime-source.js';

const spellings = {
  legacy: 'kubohiroyakamishibaiauthoring4_',
  runtime: 'kubohiroyakamishibairuntime4_',
  bundle: 'kubohiroyakamishibai4_kubohiroyakamishibairuntime4__',
};

test('the declaration list is exactly what the Block Script defines', () => {
  const defined = createDsl4BlockAuthoringInfo({narrativeControlEnabled: true}).blocks.map(
    (block) => (block as {opcode: string}).opcode,
  );
  assert.deepEqual([...defined].sort(), [...dsl4AuthoringBlockNames].sort());
});

test('declaration names never collide with a runtime action', () => {
  for (const action of dsl4CoreActionManifest)
    assert.equal(dsl4AuthoringBlockNames.has(action.command), false, action.command);
});

test('every spelling of a declaration reads as the same declaration', () => {
  for (const name of dsl4AuthoringBlockNames)
    for (const prefix of Object.values(spellings)) {
      assert.equal(dsl4AuthoringBlockName(prefix + name), name);
      assert.equal(canonicalDsl4AuthoringOpcode(prefix + name), spellings.legacy + name);
    }
  assert.equal(isDsl4BlockSourceHat(`${spellings.bundle}kamishibai`), true);
  assert.equal(isDsl4BlockSourceHat(`${spellings.runtime}kamishibaiConfig`), true);
  assert.equal(isDsl4IncludeBlocks(`${spellings.runtime}includeBlocks`), true);
});

test('runtime blocks and unknown names are not declarations', () => {
  for (const opcode of [
    `${spellings.runtime}goto`,
    `${spellings.bundle}say`,
    `${spellings.runtime}embeddedYaml`,
    `${spellings.legacy}goto`,
    'kubohiroyakamishibairuntime4__scene',
    'scene',
    'control_if',
  ]) {
    assert.equal(dsl4AuthoringBlockName(opcode), null, opcode);
    assert.equal(canonicalDsl4AuthoringOpcode(opcode), opcode, opcode);
  }
  assert.throws(() => dsl4AuthoringOpcode('goto', 'runtime'), /Unknown Block Script declaration/u);
});

test('writing a form and reading it back round-trips every block and menu shadow', () => {
  for (const form of ['runtime', 'bundle'] as const) {
    const canonical = {
      scene: {opcode: `${spellings.legacy}scene`, inputs: {}, fields: {}},
      section: {opcode: `${spellings.legacy}useSection`, inputs: {}, fields: {}},
      menu: {
        opcode: `${spellings.legacy}menu_sectionEnabled`,
        inputs: {},
        fields: {sectionEnabled: ['off', null]},
        shadow: true,
      },
      action: {opcode: `${spellings[form]}goto`, inputs: {}, fields: {}},
    };
    const written = structuredClone(canonical);
    formDsl4AuthoringBlocks(written, form);
    assert.equal(written.scene.opcode, `${spellings[form]}scene`);
    assert.equal(written.action.opcode, canonical.action.opcode);
    assert.equal(
      written.menu.opcode,
      form === 'bundle'
        ? 'kubohiroyakamishibai4_menu_kubohiroyakamishibairuntime4__sectionEnabled'
        : 'kubohiroyakamishibairuntime4_menu_sectionEnabled',
    );
    const read = canonicalizeDsl4AuthoringBlocks(written);
    assert.deepEqual(read, canonical);
    // Reading never changes the caller's project.
    assert.equal(written.scene.opcode, `${spellings[form]}scene`);
  }
  const untouched = {action: {opcode: `${spellings.runtime}goto`}};
  assert.equal(canonicalizeDsl4AuthoringBlocks(untouched), untouched);
});

test('the runtime palette puts every declaration and action in exactly one group', () => {
  const grouped = dsl4RuntimePaletteGroups.flatMap((group) => group.opcodes);
  assert.equal(new Set(grouped).size, grouped.length, 'An opcode belongs to two groups.');
  for (const name of dsl4AuthoringBlockNames) assert.ok(grouped.includes(name), name);
  for (const action of dsl4CoreActionManifest)
    if (action.command !== 'debugger' || grouped.includes('debugger'))
      assert.ok(grouped.includes(action.command), action.command);
  const groupOf = (opcode: string) =>
    dsl4RuntimePaletteGroups.find((group) => group.opcodes.includes(opcode))!.id;
  // An action's other spelling sits beside it: pose steps with pose, loops with goto.
  assert.equal(groupOf('poseSteps'), groupOf('pose'));
  assert.equal(groupOf('narrativeIf'), groupOf('goto'));
  assert.equal(groupOf('embeddedYaml'), groupOf('scene'));
});

test('the runtime palette is named for what it holds and translates the declarations', () => {
  const ja = dsl4RuntimeTranslations.ja!;
  assert.equal(ja.name, '紙芝居');
  assert.equal(ja.blocks!.scene, 'シーン [SCENE] 属性 JSON [PROPERTIES]');
  assert.equal(ja.blocks!.goto, 'シーン [SCENE] へ移る');
  assert.deepEqual(ja.menus!.sectionEnabled, {on: '✅ オン', off: '🚫 オフ'});
});

test('the runtime registers its schema forms under its own ID only', () => {
  const definitions = createDsl4RuntimeDeclarationEditorDefinitions({
    narrativeControlEnabled: true,
  });
  assert.ok(definitions.length > 0);
  for (const definition of definitions) {
    // The Standard bundle accepts only its member's own ID and opcodes and rewrites them.
    assert.equal(
      definition.extensionId,
      'kubohiroyakamishibairuntime4',
      String(definition.editorId),
    );
    for (const opcode of definition.opcodes)
      assert.ok(opcode.startsWith(spellings.runtime), opcode);
  }
  assert.deepEqual(
    definitions
      .filter((definition) => definition.editorId === 'scene-properties')
      .map((definition) => definition.opcodes),
    [[`${spellings.runtime}scene`]],
  );
  assert.ok(
    definitions.some((definition) => definition.opcodes.includes(`${spellings.runtime}pose`)),
  );
});

/** The checks `@kubohiroya/sb3-toolchain` puts in front of a bundle member's block editor API. */
function bundleMemberEditors(accepted: unknown[], rejected: unknown[]) {
  const member = 'kubohiroyakamishibairuntime4';
  const memberOnly = (definition: unknown) => {
    const {extensionId, opcodes} = definition as {extensionId: string; opcodes: string[]};
    if (extensionId !== member || !opcodes.every((opcode) => opcode.startsWith(`${member}_`))) {
      rejected.push(definition);
      throw new TypeError(`Invalid block editor registration for bundle member ${member}.`);
    }
    accepted.push(definition);
    return () => {};
  };
  // Custom editors pass through the bundle unchanged.
  const passThrough = (definition: unknown) => {
    accepted.push(definition);
    return () => {};
  };
  return {apiVersion: 1, registerSchema: memberOnly, register: passThrough};
}

test('inside the Standard bundle every declaration form is accepted', () => {
  const accepted: unknown[] = [];
  const rejected: unknown[] = [];
  const warnings: unknown[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => void warnings.push(args);
  try {
    installDsl4RuntimeDeclarationEditors(
      {gui: {blockEditors: bundleMemberEditors(accepted, rejected)}},
      {narrativeControlEnabled: true},
    );
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(rejected, []);
  assert.deepEqual(warnings, []);
  const editorIds = accepted.map((definition) => (definition as {editorId: string}).editorId);
  for (const id of ['scene-properties', 'definition-asset', 'action-pose-steps'])
    assert.ok(editorIds.includes(id), id);
});

test('one refused registration does not withdraw the others', () => {
  const accepted: string[] = [];
  const warn = console.warn;
  console.warn = () => {};
  try {
    installDsl4RuntimeDeclarationEditors(
      {
        gui: {
          blockEditors: {
            apiVersion: 1,
            registerSchema(definition: unknown) {
              const {editorId} = definition as {editorId: string};
              if (editorId === 'scene-properties') throw new TypeError('refused');
              accepted.push(editorId);
              return () => {};
            },
          },
        },
      },
      {narrativeControlEnabled: false},
    );
  } finally {
    console.warn = warn;
  }
  assert.equal(accepted.includes('scene-properties'), false);
  assert.ok(accepted.includes('definition-asset'));
});

test('installing the declaration forms registers them and removes them again', () => {
  const registered: {extensionId: string; editorId?: string}[] = [];
  let removed = 0;
  const register = (definition: unknown) => {
    registered.push(definition as {extensionId: string; editorId?: string});
    return () => {
      removed += 1;
    };
  };
  const dispose = installDsl4RuntimeDeclarationEditors(
    {gui: {blockEditors: {apiVersion: 1, registerSchema: register, register}}},
    {narrativeControlEnabled: true},
  );
  assert.ok(registered.length > 0);
  // The rows table replaces the schema form where the editor hosts custom editors, and names
  // both spellings because custom editors are not rewritten by the bundle.
  assert.deepEqual(
    registered
      .filter((definition) => definition.editorId === 'narrative-rows-table')
      .map((definition) => definition.extensionId),
    ['kubohiroyakamishibairuntime4', 'kubohiroyakamishibai4'],
  );
  assert.equal(
    registered.some((definition) => definition.editorId === 'narrative-rows'),
    false,
  );
  dispose();
  assert.equal(removed, registered.length);
  // Without the editor API, as in the Packager, nothing is registered.
  assert.doesNotThrow(() =>
    installDsl4RuntimeDeclarationEditors({}, {narrativeControlEnabled: true})(),
  );
});

test('the playback runtime carries the declaration forms, so an editor shows them', async () => {
  for (const source of [
    await readDsl4PlaybackRuntimeExtensionSource(),
    await readDsl4NarrativeRuntimeExtensionSource('playback'),
  ]) {
    assert.ok(source.includes('scene-properties'));
    assert.ok(source.includes('narrative-rows-table'));
  }
});
