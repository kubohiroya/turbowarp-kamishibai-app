/**
 * Inert authoring declarations; their values are read from the block graph, never executed. Texts are English;
 * `getInfo()` swaps in the editor's language (see block-palette-i18n.ts).
 */
export function createDsl4NarrativeBlockDefinitions(enabled: boolean) {
  const argument = (defaultValue: string) => ({type: 'string', defaultValue});
  const common = {
    hideFromPalette: !enabled,
    color1: '#98683d',
    color2: '#805731',
    color3: '#684629',
  };
  return [
    {
      ...common,
      opcode: 'narrativeIf',
      blockType: 'command',
      branchCount: 2,
      text: ['if [CONDITION] then', 'else'],
      arguments: {CONDITION: argument('true')},
    },
    {
      ...common,
      opcode: 'narrativeRepeat',
      blockType: 'command',
      branchCount: 1,
      text: 'repeat [TIMES] times, naming each round [AS]',
      arguments: {TIMES: {type: 'number', defaultValue: 3}, AS: argument('回次')},
    },
    {
      ...common,
      opcode: 'narrativeForEach',
      blockType: 'command',
      branchCount: 1,
      text: 'for each [AS] in list [ITEMS]',
      arguments: {
        ITEMS: argument('[{"名前":"長兄"},{"名前":"次兄"},{"名前":"末弟"}]'),
        AS: argument('訪問'),
      },
    },
    {
      ...common,
      opcode: 'narrativeReference',
      blockType: 'reporter',
      text: '[COLUMN] of [SCOPE]',
      arguments: {SCOPE: argument('訪問'), COLUMN: argument('名前')},
    },
    {
      ...common,
      opcode: 'narrativeVariable',
      blockType: 'reporter',
      text: 'story variable [NAME]',
      arguments: {NAME: argument('score')},
    },
    {
      ...common,
      opcode: 'narrativeCompare',
      blockType: 'reporter',
      text: '[LEFT] [OP] [RIGHT]',
      arguments: {LEFT: argument('0'), OP: argument('=='), RIGHT: argument('0')},
    },
    {
      ...common,
      opcode: 'narrativeLogic',
      blockType: 'reporter',
      text: '[LEFT] [OP] [RIGHT]',
      arguments: {LEFT: argument('true'), OP: argument('and'), RIGHT: argument('true')},
    },
    {
      ...common,
      opcode: 'narrativeLogicList',
      blockType: 'reporter',
      text: '[OP] of conditions [VALUES]',
      arguments: {OP: argument('and'), VALUES: argument('[true,true]')},
    },
    {
      ...common,
      opcode: 'narrativeNot',
      blockType: 'reporter',
      text: 'not [VALUE]',
      arguments: {VALUE: argument('true')},
    },
  ];
}

export const dsl4NarrativeBlockInputs: Readonly<Record<string, readonly string[]>> = {
  narrativeIf: ['CONDITION', 'SUBSTACK', 'SUBSTACK2'],
  narrativeRepeat: ['TIMES', 'AS', 'SUBSTACK'],
  narrativeForEach: ['ITEMS', 'AS', 'SUBSTACK'],
  narrativeReference: ['SCOPE', 'COLUMN'],
  narrativeVariable: ['NAME'],
  narrativeCompare: ['LEFT', 'OP', 'RIGHT'],
  narrativeLogic: ['LEFT', 'OP', 'RIGHT'],
  narrativeNot: ['VALUE'],
  narrativeLogicList: ['OP', 'VALUES'],
};

/** Existing schema dialogs share the source structure definitions. */
export function createDsl4NarrativeEditorDefinitions(
  extensionId: string,
  schemaDefinitions: Record<string, unknown>,
): {
  apiVersion: number;
  extensionId: string;
  editorId: string;
  opcodes: string[];
  argument: string;
  format: string;
  schema: Record<string, unknown>;
}[] {
  const schema = (name: string, title: string) =>
    JSON.parse(
      JSON.stringify({
        $schema: 'http://json-schema.org/draft-07/schema#',
        title,
        $ref: '#/definitions/' + name,
        definitions: schemaDefinitions,
      }).replaceAll('#/$defs/', '#/definitions/'),
    ) as Record<string, unknown>;
  return [
    {
      apiVersion: 1,
      extensionId,
      editorId: 'narrative-condition',
      opcodes: [`${extensionId}_narrativeIf`],
      argument: 'CONDITION',
      format: 'json',
      schema: schema('condition', '台本の条件'),
    },
    {
      apiVersion: 1,
      extensionId,
      editorId: 'narrative-rows',
      opcodes: [`${extensionId}_narrativeForEach`],
      argument: 'ITEMS',
      format: 'json',
      schema: schema('rows', '各回の展開（行順に再生）'),
    },
    {
      apiVersion: 1,
      extensionId,
      editorId: 'narrative-conditions',
      opcodes: [`${extensionId}_narrativeLogicList`],
      argument: 'VALUES',
      format: 'json',
      schema: schema('conditions', '条件の一覧'),
    },
  ];
}
