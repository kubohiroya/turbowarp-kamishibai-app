import {describe, expect, test} from 'vitest';
import {
  dsl4AuthoringPaletteGroups,
  dsl4AuthoringTranslations,
  dsl4RuntimePaletteGroups,
  dsl4RuntimeTranslations,
  localizeDsl4ExtensionInfo,
  withDsl4PaletteGroups,
} from '../src/dsl4/block-palette-i18n.js';
import {createDsl4BlockAuthoringInfo} from '../src/dsl4/structured-block-source-codec.js';
import {createDsl4BlockAuthoringExtensionSource} from '../src/dsl4/structured-block-source.js';
import {createDsl4TurboWarpCoreActionBlockSurface} from '../src/dsl4/platform/turbowarp-core-action-block.js';
import {createDsl4TurboWarpRuntimeVariableBlockSurface} from '../src/dsl4/platform/turbowarp-runtime-variable-block.js';

const BlockType = {
  BOOLEAN: 'Boolean',
  BUTTON: 'button',
  COMMAND: 'command',
  CONDITIONAL: 'conditional',
  EVENT: 'event',
  HAT: 'hat',
  LABEL: 'label',
  LOOP: 'loop',
  REPORTER: 'reporter',
};
const ArgumentType = {BOOLEAN: 'Boolean', NUMBER: 'number', STRING: 'string'};

type Block = {opcode: string; text: string | string[]; arguments?: Record<string, unknown>};
const placeholders = (text: string | readonly string[]) =>
  [
    ...[text]
      .flat()
      .join(' ')
      .matchAll(/\[([A-Z_]+)\]/g),
  ]
    .map((match) => match[1])
    .sort();

function runtimeBlocks(): Block[] {
  const core = createDsl4TurboWarpCoreActionBlockSurface({ArgumentType, BlockType} as never, {
    visible: true,
  });
  const state = createDsl4TurboWarpRuntimeVariableBlockSurface({ArgumentType, BlockType} as never, {
    stateVisible: true,
  });
  return [...core.blocks, ...state.blocks] as Block[];
}

describe('palette groups', () => {
  test('every authoring block belongs to a group, and every group opcode names a block', () => {
    const info = createDsl4BlockAuthoringInfo({
      sourceSections: true,
      narrativeControlEnabled: true,
    });
    const opcodes = info.blocks.map((block) => block.opcode);
    const grouped = dsl4AuthoringPaletteGroups.flatMap((group) => group.opcodes);
    expect(new Set(grouped)).toEqual(new Set(opcodes));
    expect(info.groups.map((group) => group.id)).toEqual(
      dsl4AuthoringPaletteGroups.map((group) => group.id),
    );
    expect(
      info.blocks.every(
        (block) => typeof (block as {paletteGroup?: unknown}).paletteGroup === 'string',
      ),
    ).toBe(true);
  });

  test('every visible runtime block belongs to a group, in exactly one', () => {
    const grouped = dsl4RuntimePaletteGroups.flatMap((group) => group.opcodes);
    expect(new Set(grouped).size).toBe(grouped.length);
    for (const block of runtimeBlocks()) expect(grouped, block.opcode).toContain(block.opcode);
  });

  test('group IDs are fixed and names come in English and Japanese', () => {
    for (const group of [...dsl4AuthoringPaletteGroups, ...dsl4RuntimePaletteGroups]) {
      expect(group.id).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(Object.keys(group.name).sort()).toEqual(['en', 'ja']);
    }
  });

  test('blocks outside the groups stay unmarked', () => {
    const info = withDsl4PaletteGroups({blocks: [{opcode: 'a'}, '---', {opcode: 'b'}]}, [
      {id: 'g', name: {en: 'G', ja: 'G'}, opcodes: ['a']},
    ]);
    expect(info.blocks).toEqual([{opcode: 'a', paletteGroup: 'g'}, '---', {opcode: 'b'}]);
    expect(info.groups).toEqual([{id: 'g', name: {en: 'G', ja: 'G'}}]);
  });
});

describe('Japanese texts', () => {
  test('every translated text keeps the arguments of the English one', () => {
    const authoring = createDsl4BlockAuthoringInfo({
      sourceSections: true,
      narrativeControlEnabled: true,
    }).blocks as Block[];
    for (const [blocks, translations] of [
      [authoring, dsl4AuthoringTranslations],
      [runtimeBlocks(), dsl4RuntimeTranslations],
    ] as const) {
      const texts = translations.ja!.blocks!;
      for (const block of blocks) {
        // A text of arguments only, such as `[LEFT] [OP] [RIGHT]`, reads the same in every language.
        if (
          !/[A-Za-z]/.test(
            [block.text]
              .flat()
              .join(' ')
              .replace(/\[[A-Z_]+\]/g, ''),
          )
        )
          continue;
        expect(Object.hasOwn(texts, block.opcode), `${block.opcode} has a Japanese text`).toBe(
          true,
        );
        expect(placeholders(texts[block.opcode]!), block.opcode).toEqual(placeholders(block.text));
      }
    }
  });

  test('the texts follow the language, and other languages keep English', () => {
    const info = {
      name: 'Runtime',
      blocks: [
        {opcode: 'wait', text: 'wait [SECONDS] seconds'},
        '---',
        {opcode: 'unknown', text: 'x'},
      ],
      menus: {
        dsl4MoveEasing: {acceptReporters: true, items: ['linear', 'other']},
        plain: ['linear'],
        dynamic: {items: 'menuFunction'},
      },
    };
    const ja = localizeDsl4ExtensionInfo(info, dsl4RuntimeTranslations, 'ja-JP');
    expect(ja.name).toBe('紙芝居 DSL 4.0 ランタイム');
    expect(ja.blocks).toEqual([
      {opcode: 'wait', text: '[SECONDS] 秒待つ'},
      '---',
      {opcode: 'unknown', text: 'x'},
    ]);
    expect(ja.menus.dsl4MoveEasing.items).toEqual([{text: '一定の速さ', value: 'linear'}, 'other']);
    expect(ja.menus.plain).toEqual(['linear']);
    expect(ja.menus.dynamic).toEqual({items: 'menuFunction'});
    expect(localizeDsl4ExtensionInfo(info, dsl4RuntimeTranslations, 'en')).toBe(info);
    expect(localizeDsl4ExtensionInfo(info, dsl4RuntimeTranslations, undefined)).toBe(info);
  });

  test('the inert authoring extension shows the editor language', () => {
    const source = createDsl4BlockAuthoringExtensionSource([], {narrativeControlEnabled: true});
    const infoIn = (language: string) => {
      let registered: {getInfo(): {name: string; blocks: Block[]; groups: unknown[]}} | undefined;
      const Scratch = {
        extensions: {register: (extension: typeof registered) => (registered = extension)},
        translate: {language},
      };
      new Function('Scratch', source)(Scratch);
      return registered!.getInfo();
    };
    const ja = infoIn('ja');
    expect(ja.name).toBe('紙芝居の台本ブロック');
    expect(ja.blocks.find((block) => block.opcode === 'narrativeIf')!.text).toEqual([
      'もし [CONDITION] ならば',
      'でなければ',
    ]);
    expect(ja.groups).toHaveLength(dsl4AuthoringPaletteGroups.length);
    const en = infoIn('en');
    expect(en.name).toBe('Kamishibai Block Script');
    expect(en.blocks.find((block) => block.opcode === 'narrativeIf')!.text).toEqual([
      'if [CONDITION] then',
      'else',
    ]);
  });
});
