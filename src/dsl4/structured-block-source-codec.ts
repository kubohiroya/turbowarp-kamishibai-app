import {stringify} from 'yaml';
import {
  appendDsl4SectionAuthoringState,
  restoreDsl4SectionBlocks,
} from './block-source-section-state.js';
import type {Dsl4SectionAuthoringState} from './block-source-section-state.js';
import {createDsl4NarrativeBlockDefinitions, dsl4NarrativeBlockInputs} from './narrative-blocks.js';

import {
  dsl4BlockAuthoringExtensionId,
  dsl4BlockSourceBundleExtensionId,
  dsl4BlockSourceRuntimeExtensionId,
  Dsl4BlockSourceError,
  dsl4ConfigBlockSourceHatOpcode,
  dsl4LabeledBlockSourceHatOpcode,
} from './block-source-shared.js';
import {dsl4CoreActionManifest} from './core-action-manifest.js';
import {dsl4VideoControlValueFields} from './video-source.js';
import {
  dsl4TurboWarpActionBlockSpecs,
  coreActionCommandForBlock,
  sourceValueForDsl4CoreActionBlock,
} from './core-action-block-codec.js';

export {
  dsl4BlockAuthoringExtensionId,
  dsl4ConfigBlockSourceHatOpcode,
  dsl4LabeledBlockSourceHatOpcode,
};

const dsl4BlockAuthoringEditorIcon =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect x="6" y="4" width="28" height="32" rx="4" fill="white"/><path d="M12 13h16M12 20h16M12 27h10" stroke="#683f8f" stroke-width="3"/></svg>',
  );
export const dsl4ConfigDefinitionKeys = new Set([
  'controls',
  'viewport',
  'assets',
  'cover',
  'textStyles',
  'variables',
  'loading',
  'recognition',
]);
export const dsl4IncludeBlocksOpcode = `${dsl4BlockAuthoringExtensionId}_includeBlocks`;
export const dsl4BlockAuthoringDefaultFeatureFlags = Object.freeze({sourceSections: false});
const prefix = `${dsl4BlockAuthoringExtensionId}_`;
const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);
type DefinitionSpec = {
  opcode: string;
  path: readonly string[];
  defaultName?: string;
  defaultValue: string;
};
const definitionSpecs: readonly DefinitionSpec[] = [
  {opcode: 'asset', path: ['assets'], defaultName: 'Backdrop', defaultValue: '"backdrop"'},
  {
    opcode: 'control',
    path: ['controls', 'keymaps'],
    defaultName: 'production',
    defaultValue: '{"Space":"navigation.nextAction"}',
  },
  {opcode: 'actor', path: ['actors'], defaultName: 'Actor', defaultValue: '"ActorIdle"'},
  {opcode: 'textStyle', path: ['textStyles'], defaultName: 'title', defaultValue: '{"size":24}'},
  {opcode: 'variable', path: ['variables'], defaultName: 'score', defaultValue: '0'},
  {opcode: 'cover', path: ['cover'], defaultValue: '{"backdrop":"Backdrop"}'},
  {
    opcode: 'loading',
    path: ['loading'],
    defaultValue: '{"backdrop":"Backdrop","costumes":["Loading"]}',
  },
  {opcode: 'recognition', path: ['recognition'], defaultValue: '{}'},
  {
    opcode: 'viewport',
    path: ['viewport'],
    defaultValue: '{"width":480,"height":360,"fit":"contain"}',
  },
];
const definitionByOpcode = new Map(
  definitionSpecs.map((spec) => [`${prefix}${spec.opcode}`, spec]),
);
const specs = new Map(dsl4TurboWarpActionBlockSpecs.map((spec) => [spec.command, spec]));
const scalarFields: Readonly<Record<string, string>> = {
  stage: 'backdrop',
  bgm: 'sound',
  sound: 'sound',
  wait: 'seconds',
  stopBgm: 'seconds',
  setBgmVolume: 'volume',
  broadcastMessageAndWait: 'message',
  goto: 'scene',
  gotoSegment: 'segment',
  branch: 'branch',
  toggleVariable: 'name',
  setSkin: 'skin',
  setLayer: 'layer',
  setTransparency: 'transparency',
};
const argumentFields: Readonly<Record<string, string>> = {
  ID: 'id',
  FADEIN: 'fadeIn',
  FADEOUT: 'fadeOut',
  WIDTH: 'width',
  HEIGHT: 'height',
  PLANE: 'plane',
  ZINDEX: 'zIndex',
  OPERATION: 'operation',
  BACKDROP: 'backdrop',
  SOUND: 'sound',
  SECONDS: 'seconds',
  VOLUME: 'volume',
  MESSAGE: 'message',
  EFFECT: 'effect',
  SCENE: 'scene',
  SEGMENT: 'segment',
  BRANCH: 'branch',
  NAME: 'name',
  VALUE: 'value',
  BY: 'by',
  ROUTES: 'routes',
  SKIN: 'skin',
  X: 'x',
  Y: 'y',
  SCALE: 'scale',
  EASING: 'easing',
  LAYER: 'layer',
  STEPS: 'steps',
  TEXT: 'text',
  STYLE: 'style',
};
const optionalInputs: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  stopBgm: {SECONDS: 'seconds'},
  setBgmVolume: {SECONDS: 'seconds'},
  moveTo: {EASING: 'easing'},
  setText: {STYLE: 'style'},
};
const jsonInputs = new Set(['ROUTES', 'STEPS']);

type Block = {
  opcode: string;
  next: string | null;
  parent: string | null;
  inputs: Record<string, unknown>;
  fields: Record<string, unknown>;
  shadow: boolean;
  topLevel: boolean;
  x?: number;
  y?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(message: string, blockId?: string): never {
  throw new Dsl4BlockSourceError(
    'K4-BLOCK-SOURCE-GRAPH-001',
    message,
    blockId === undefined ? {} : {blockId},
  );
}

function json(value: unknown): string {
  const result = JSON.stringify(value);
  if (result === undefined) fail('Source value cannot be represented as JSON');
  return result;
}

function menuIdentity(form: 'runtime' | 'bundle', name: string) {
  const field = form === 'bundle' ? `${dsl4BlockSourceRuntimeExtensionId}__${name}` : name;
  const extension =
    form === 'bundle' ? dsl4BlockSourceBundleExtensionId : dsl4BlockSourceRuntimeExtensionId;
  return {opcode: `${extension}_menu_${field}`, field};
}

function parseJson(value: unknown, blockId?: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value), (key, child: unknown) => {
      if (forbiddenKeys.has(key)) fail('Source JSON contains a forbidden mapping key', blockId);
      return child;
    });
  } catch (cause) {
    throw new Dsl4BlockSourceError(
      'K4-BLOCK-SOURCE-FRAGMENT-001',
      'Structured source JSON is invalid',
      {cause, ...(blockId === undefined ? {} : {blockId})},
    );
  }
  const pending = [{value: parsed, depth: 0}];
  let count = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (++count > 4096 || item.depth > 64)
      fail('Structured source JSON exceeds its limit', blockId);
    if (typeof item.value === 'object' && item.value !== null) {
      for (const child of Object.values(item.value))
        pending.push({value: child, depth: item.depth + 1});
    }
  }
  return parsed;
}

type PoseStep = {pose: string; skin?: string; sound?: string};

/** Only plain `{steps}` pose actions fit the C-block; anything else keeps the JSON STEPS block. */
function isPoseStepList(value: unknown): value is {steps: PoseStep[]} {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'steps')) return false;
  const {steps} = value;
  return (
    Array.isArray(steps) &&
    steps.length > 0 &&
    steps.every(
      (step) =>
        isRecord(step) &&
        typeof step.pose === 'string' &&
        Object.entries(step).every(
          ([key, field]) =>
            ['pose', 'skin', 'sound'].includes(key) &&
            typeof field === 'string' &&
            (key === 'pose' || field.trim() !== ''),
        ),
    )
  );
}

export function isDsl4StructuredSourceOpcode(opcode: unknown): boolean {
  return typeof opcode === 'string' && opcode.startsWith(prefix);
}

/** Pure declarations shared by authored extensions and isolated read-only previews. */
export function createDsl4BlockAuthoringInfo({
  sourceSections = dsl4BlockAuthoringDefaultFeatureFlags.sourceSections,
  narrativeControlEnabled = false,
  referenceViews = true,
}: {sourceSections?: boolean; narrativeControlEnabled?: boolean; referenceViews?: boolean} = {}) {
  if (typeof sourceSections !== 'boolean') throw new TypeError('sourceSections must be boolean');
  if (typeof narrativeControlEnabled !== 'boolean')
    throw new TypeError('narrativeControlEnabled must be boolean');
  if (typeof referenceViews !== 'boolean') throw new TypeError('referenceViews must be boolean');
  const stringArgument = (defaultValue: string) => ({type: 'string', defaultValue});
  const definitions = [
    {
      opcode: 'kamishibai',
      ...(referenceViews ? {hideFromPalette: true} : {}),
      blockType: 'hat',
      text: 'kamishibai [VERSION] [LABEL]',
      isEdgeActivated: false,
      arguments: {VERSION: stringArgument('4.0'), LABEL: stringArgument('')},
    },
    {
      opcode: 'kamishibaiConfig',
      ...(referenceViews ? {hideFromPalette: true} : {}),
      blockType: 'hat',
      text: 'kamishibaiConfig [LABEL]',
      isEdgeActivated: false,
      arguments: {LABEL: stringArgument('')},
    },
    {
      opcode: 'includeBlocks',
      ...(referenceViews ? {hideFromPalette: true} : {}),
      blockType: 'command',
      text: 'includeBlocks [LABEL]',
      arguments: {LABEL: stringArgument('')},
    },
    {
      opcode: 'property',
      blockType: 'command',
      hideFromPalette: true,
      text: 'story property [PATH] = JSON [VALUE]',
      arguments: {PATH: stringArgument('["kamishibai"]'), VALUE: stringArgument('"4.0"')},
    },
    ...definitionSpecs.map((spec) => ({
      opcode: spec.opcode,
      blockType: 'command',
      blockIconURI: dsl4BlockAuthoringEditorIcon,
      text: `${spec.opcode}${spec.defaultName === undefined ? '' : ' [NAME]'} = JSON [VALUE]`,
      arguments: {
        ...(spec.defaultName === undefined ? {} : {NAME: stringArgument(spec.defaultName)}),
        VALUE: stringArgument(spec.defaultValue),
      },
    })),
    {
      opcode: 'scene',
      blockType: 'command',
      branchCount: 1,
      blockIconURI: dsl4BlockAuthoringEditorIcon,
      text: 'scene [SCENE] properties JSON [PROPERTIES]',
      arguments: {SCENE: stringArgument('opening'), PROPERTIES: stringArgument('{}')},
    },
    {
      opcode: 'useSection',
      blockType: 'command',
      branchCount: 1,
      hideFromPalette: !sourceSections,
      color1: '#6b7280',
      color2: '#59616d',
      color3: '#454d59',
      text: 'この部分を使う [ENABLED]',
      arguments: {ENABLED: {type: 'string', menu: 'sectionEnabled', defaultValue: 'on'}},
    },
    {
      opcode: 'actionOptions',
      blockType: 'command',
      branchCount: 1,
      text: 'action options JSON [PROPERTIES]',
      arguments: {PROPERTIES: stringArgument('{"arguments":{}}')},
    },
    {
      opcode: 'poseSteps',
      blockType: 'command',
      branchCount: 1,
      text: 'recognize actor [TARGET] pose steps',
      arguments: {TARGET: stringArgument('Actor')},
    },
    {
      opcode: 'poseStep',
      blockType: 'command',
      text: 'pose [POSE] skin [SKIN] sound [SOUND]',
      arguments: {
        POSE: stringArgument('pose'),
        SKIN: stringArgument(''),
        SOUND: stringArgument(''),
      },
    },
    ...createDsl4NarrativeBlockDefinitions(narrativeControlEnabled).map((block) =>
      ['narrativeForEach', 'narrativeLogicList'].includes(block.opcode)
        ? {...block, blockIconURI: dsl4BlockAuthoringEditorIcon}
        : block,
    ),
    {
      opcode: 'customAction',
      blockType: 'command',
      text: 'actor [TARGET] custom action [COMMAND] arguments JSON [ARGUMENTS] stable id [STABLEID]',
      arguments: {
        TARGET: stringArgument('Actor'),
        COMMAND: stringArgument('action'),
        ARGUMENTS: stringArgument('{}'),
        STABLEID: stringArgument(''),
      },
    },
  ];
  return {
    id: dsl4BlockAuthoringExtensionId,
    name: 'Kamishibai Block Script',
    blockIconURI: dsl4BlockAuthoringEditorIcon,
    menus: {
      sectionEnabled: {
        acceptReporters: false,
        items: [
          {text: '✅ オン', value: 'on'},
          {text: '🚫 オフ', value: 'off'},
        ],
      },
    },
    color1: '#7b4ba8',
    color2: '#683f8f',
    color3: '#563375',
    blocks: definitions,
  };
}

/** Convert validated source into scene substacks containing the existing runtime action blocks. */
export function createDsl4StructuredBlockSourceDeclaration({
  source,
  form,
  hatId,
  label = '',
  includeLabels = [],
  idPrefix = 'dsl4SourceBlock',
  sectionState,
  version = source.kamishibai ?? '4.0',
  simpleSpeech = true,
  textSafeLiterals = false,
}: {
  source: Record<string, unknown>;
  form: 'runtime' | 'bundle';
  hatId: string;
  label?: string;
  includeLabels?: readonly string[];
  idPrefix?: string;
  sectionState?: Dsl4SectionAuthoringState | undefined;
  version?: unknown;
  simpleSpeech?: boolean;
  textSafeLiterals?: boolean;
}): Record<string, Block> {
  if (sectionState)
    return restoreDsl4SectionBlocks(
      sectionState,
      hatId,
      idPrefix,
      label,
      source,
      includeLabels,
    ) as Record<string, Block>;
  const runtimePrefix =
    form === 'bundle'
      ? `${dsl4BlockSourceBundleExtensionId}_${dsl4BlockSourceRuntimeExtensionId}__`
      : `${dsl4BlockSourceRuntimeExtensionId}_`;
  const blocks: Record<string, Block> = {};
  let serial = 0;
  function add(opcode: string, values: Record<string, unknown> = {}): string {
    let id = `${idPrefix}${++serial}`;
    if (id === hatId) id = `${idPrefix}${++serial}`;
    blocks[id] = {
      opcode,
      next: null,
      parent: null,
      inputs: Object.fromEntries(
        Object.entries(values).map(([name, value]) => [
          name,
          [
            1,
            [typeof value === 'number' ? 4 : 10, typeof value === 'number' ? value : String(value)],
          ],
        ]),
      ),
      fields: {},
      shadow: false,
      topLevel: false,
    };
    return id;
  }
  function connect(parent: string, child: string, branch = false) {
    blocks[child]!.parent = parent;
    if (branch) blocks[parent]!.inputs.SUBSTACK = [2, child];
    else blocks[parent]!.next = child;
  }
  function action(sourceAction: Record<string, unknown>): string {
    const [sourceCommand = ''] = Object.keys(sourceAction);
    const separator = sourceCommand.lastIndexOf('.');
    const command = sourceCommand.slice(separator + 1);
    const target = separator < 0 ? null : sourceCommand.slice(0, separator);
    const value = sourceAction[sourceCommand];
    if (['if', 'repeat', 'forEach'].includes(command)) {
      if (version !== '4.0' || !isRecord(value))
        fail(
          'Narrative controls require a 4.0 declaration; replace the experimental 4.1 version and validate with --narrative-control',
        );
      const opcode = {if: 'narrativeIf', repeat: 'narrativeRepeat', forEach: 'narrativeForEach'}[
        command
      ]!;
      const values =
        command === 'if'
          ? {CONDITION: json(value.condition)}
          : command === 'repeat'
            ? {TIMES: value.times, AS: value.as ?? ''}
            : {ITEMS: json(value.items), AS: value.as};
      const id = add(`${prefix}${opcode}`, values);
      if (command === 'if') attachNode(id, 'CONDITION', value.condition);
      for (const [name, branch] of command === 'if'
        ? [
            ['then', 'SUBSTACK'],
            ['else', 'SUBSTACK2'],
          ]
        : [['do', 'SUBSTACK']]) {
        const list = value[name!] ?? [];
        if (!Array.isArray(list)) fail('Narrative body must be an action sequence');
        let previous = id;
        for (const child of list) {
          if (!isRecord(child)) fail('Narrative body action must be a mapping');
          const next = action(child);
          blocks[next]!.parent = previous;
          if (previous === id) blocks[id]!.inputs[branch!] = [2, next];
          else blocks[previous]!.next = next;
          previous = next;
        }
      }
      return id;
    }
    const blockCommand =
      simpleSpeech &&
      (command === 'say' || command === 'think') &&
      isRecord(value) &&
      typeof value.text === 'string' &&
      typeof value.seconds === 'number' &&
      Object.keys(value).every((key) => key === 'text' || key === 'seconds')
        ? `${command}Text`
        : command;
    if (command === 'pose' && target !== null && isPoseStepList(value)) {
      const id = add(`${prefix}poseSteps`, {TARGET: target});
      let previous = id;
      for (const step of value.steps) {
        const next = add(`${prefix}poseStep`, {
          POSE: step.pose,
          SKIN: step.skin ?? '',
          SOUND: step.sound ?? '',
        });
        connect(previous, next, previous === id);
        previous = next;
      }
      return id;
    }
    const spec = specs.get(blockCommand);
    if (!spec) {
      if (!isRecord(value)) fail(`Invalid custom action ${sourceCommand}`);
      return add(`${prefix}customAction`, {
        TARGET: target,
        COMMAND: command,
        ARGUMENTS: json(value.arguments ?? {}),
        STABLEID: value.stableId ?? '',
      });
    }
    const primary = scalarFields[command];
    let args =
      isRecord(value) &&
      !(primary && Object.keys(value).length === 1 && Object.hasOwn(value, 'ref'))
        ? {...value}
        : primary
          ? {[primary]: value}
          : {};
    if (spec.arguments.some(({name}) => name === 'ROUTES') && !Object.hasOwn(args, 'routes')) {
      args = {routes: args};
    }
    const extras = {...args};
    const inputs: Record<string, unknown> = {};
    let textFormat = 'plain';
    for (const argument of spec.arguments) {
      const name = argument.name;
      const field = argumentFields[name] ?? '';
      if (name === 'TARGET') inputs[name] = target;
      else if ((command === 'video' || command === 'audio') && name === 'SOURCE_TYPE') {
        inputs[name] = Object.hasOwn(args, 'url') ? 'url' : 'asset';
      } else if ((command === 'video' || command === 'audio') && name === 'SOURCE') {
        inputs[name] = args.url ?? args.asset ?? '';
        delete extras.asset;
        delete extras.url;
      } else if ((command === 'videoControl' || command === 'audioControl') && name === 'VALUE') {
        const valueField = dsl4VideoControlValueFields[String(args.operation)];
        inputs[name] = valueField ? (args[valueField] ?? '') : '';
        if (valueField) delete extras[valueField];
      } else if (
        command === 'audioControl' &&
        name === 'VOLUME' &&
        !['playUntilDone', 'play', 'loop', 'resume'].includes(String(args.operation))
      ) {
        inputs[name] = '';
      } else if (name === 'TYPE') inputs[name] = typeof args.value;
      else if (name === 'SPEC') {
        inputs[name] = json(value);
        for (const key of Object.keys(extras)) delete extras[key];
      } else if (jsonInputs.has(name)) inputs[name] = json(args[field]);
      else if (
        command === 'setText' &&
        name === 'TEXT' &&
        (typeof args.text !== 'string' || (textSafeLiterals && /[\r\n]/u.test(args.text)))
      ) {
        inputs[name] = json(args.text);
        textFormat = 'json';
      } else inputs[name] = args[field] ?? '';
      delete extras[field];
    }
    const references = Object.entries(inputs).filter(
      ([, value]) => isRecord(value) && Object.hasOwn(value, 'ref'),
    );
    for (const [name] of references)
      inputs[name] = spec.arguments.find((argument) => argument.name === name)?.defaultValue ?? '';
    const id = add(`${runtimePrefix}${blockCommand}`, inputs);
    for (const [name, reference] of references) attachNode(id, name, reference);
    for (const argument of spec.arguments) {
      if (!argument.menu || inputs[argument.name] === '') continue;
      const {opcode, field} = menuIdentity(form, argument.menu);
      const menuId = add(opcode);
      blocks[menuId]!.shadow = true;
      blocks[menuId]!.parent = id;
      blocks[menuId]!.fields = {[field]: [String(inputs[argument.name]), null]};
      blocks[id]!.inputs[argument.name] = [1, menuId];
    }
    if (!Object.keys(extras).length && textFormat === 'plain') return id;
    const wrapper = add(`${prefix}actionOptions`, {
      PROPERTIES: json({arguments: extras, textFormat}),
    });
    connect(wrapper, id, true);
    return wrapper;
  }
  function attachNode(parent: string, name: string, value: unknown) {
    if (!isRecord(value)) return;
    let child: string;
    if (Object.keys(value).length === 1 && typeof value.ref === 'string') {
      const [scope, column] = value.ref.split('.');
      child = add(`${prefix}narrativeReference`, {SCOPE: scope, COLUMN: column});
    } else if (typeof value.variable === 'string')
      child = add(`${prefix}narrativeVariable`, {NAME: value.variable});
    else if (isRecord(value.compare)) {
      child = add(`${prefix}narrativeCompare`, {
        LEFT: json(value.compare.left),
        OP: value.compare.operator,
        RIGHT: json(value.compare.right),
      });
      attachNode(child, 'LEFT', value.compare.left);
      attachNode(child, 'RIGHT', value.compare.right);
    } else if (Object.hasOwn(value, 'not')) {
      child = add(`${prefix}narrativeNot`, {VALUE: json(value.not)});
      attachNode(child, 'VALUE', value.not);
    } else {
      const kind = Object.hasOwn(value, 'all') ? 'all' : 'any';
      const nodes = value[kind];
      if (!Array.isArray(nodes) || nodes.length < 2) return;
      if (nodes.length > 2) {
        child = add(`${prefix}narrativeLogicList`, {
          OP: kind === 'all' ? 'and' : 'or',
          VALUES: json(nodes),
        });
        blocks[child]!.parent = parent;
        blocks[parent]!.inputs[name] = [2, child];
        return;
      }
      const left = nodes.length === 2 ? nodes[0] : {[kind]: nodes.slice(0, -1)};
      const right = nodes.at(-1);
      child = add(`${prefix}narrativeLogic`, {
        LEFT: json(left),
        OP: kind === 'all' ? 'and' : 'or',
        RIGHT: json(right),
      });
      attachNode(child, 'LEFT', left);
      attachNode(child, 'RIGHT', right);
    }
    blocks[child]!.parent = parent;
    blocks[parent]!.inputs[name] = [2, child];
  }
  blocks[hatId] = {
    opcode: dsl4LabeledBlockSourceHatOpcode,
    next: null,
    parent: null,
    inputs: {VERSION: [1, [10, String(version)]], LABEL: [1, [10, label]]},
    fields: {},
    shadow: false,
    topLevel: true,
    x: 40,
    y: 40,
  };
  let previous = hatId;
  let configPrevious: string | undefined;
  if (Object.keys(source).some((key) => dsl4ConfigDefinitionKeys.has(key))) {
    configPrevious = add(dsl4ConfigBlockSourceHatOpcode, {LABEL: label});
    Object.assign(blocks[configPrevious]!, {topLevel: true, x: 940, y: 40});
  }
  function appendDeclaration(id: string, key: string) {
    if (configPrevious && dsl4ConfigDefinitionKeys.has(key)) {
      connect(configPrevious, id);
      configPrevious = id;
    } else {
      connect(previous, id);
      previous = id;
    }
  }
  for (const includeLabel of includeLabels) {
    const id = add(dsl4IncludeBlocksOpcode, {LABEL: includeLabel});
    connect(previous, id);
    previous = id;
  }
  for (const [key, value] of Object.entries(source)) {
    if (key === 'scenes' || key === 'kamishibai') continue;
    if (key === 'include') fail('Includes must be represented by includeBlocks');
    const definition = definitionSpecs.find((spec) => spec.path[0] === key);
    if (definition) {
      if (definition.defaultName === undefined) {
        const id = add(`${prefix}${definition.opcode}`, {VALUE: json(value)});
        appendDeclaration(id, key);
        continue;
      }
      const collection = definition.path.length === 2 && isRecord(value) ? value.keymaps : value;
      if (!isRecord(collection)) fail(`Invalid ${key} definition mapping`);
      if (Object.keys(collection).length) {
        for (const [name, child] of Object.entries(collection)) {
          const id = add(`${prefix}${definition.opcode}`, {NAME: name, VALUE: json(child)});
          appendDeclaration(id, key);
        }
        continue;
      }
      // Empty mappings have no named definitions; preserve their explicit presence below.
    }
    const entries: [string[], unknown][] =
      isRecord(value) && Object.keys(value).length
        ? Object.entries(value).map(([name, child]) => [[key, name], child])
        : [[[key], value]];
    for (const [path, child] of entries) {
      const id = add(`${prefix}property`, {PATH: json(path), VALUE: json(child)});
      appendDeclaration(id, key);
    }
  }
  if (source.scenes !== undefined && !isRecord(source.scenes))
    fail('Source scenes must be a mapping');
  for (const [name, sourceScene] of Object.entries(source.scenes ?? {})) {
    const properties = isRecord(sourceScene) ? {...sourceScene} : {};
    delete properties.actions;
    const sceneId = add(`${prefix}scene`, {SCENE: name, PROPERTIES: json(properties)});
    connect(previous, sceneId);
    previous = sceneId;
    const actions = Array.isArray(sourceScene)
      ? sourceScene
      : (sourceScene as Record<string, unknown>).actions;
    if (!Array.isArray(actions)) fail(`Scene ${name} must contain actions`);
    let previousAction = sceneId;
    for (const sourceAction of actions) {
      if (!isRecord(sourceAction)) fail('Source action must be a mapping');
      const actionId = action(sourceAction);
      connect(previousAction, actionId, previousAction === sceneId);
      previousAction = actionId;
    }
  }
  return blocks;
}

/** Read connected blocks only; there is no original YAML or original action cache to fall back to. */
export function readDsl4StructuredBlockSource(
  blocks: Record<string, unknown>,
  hatId: string,
  readInput: (input: unknown) => unknown,
  {
    entry = true,
    resolveInclude,
    onSourceLocation,
    configHatIds = entry
      ? Object.keys(blocks)
          .filter(
            (id) => isRecord(blocks[id]) && blocks[id].opcode === dsl4ConfigBlockSourceHatOpcode,
          )
          .sort((left, right) => {
            const label = (id: string) =>
              String(readInput((blocks[id] as Block).inputs.LABEL ?? [1, [10, '']]));
            return label(left) < label(right) ? -1 : label(left) > label(right) ? 1 : 0;
          })
      : [],
  }: {
    entry?: boolean;
    resolveInclude?: (blockId: string) => string;
    onSourceLocation?: (path: readonly (string | number)[], blockId: string) => void;
    configHatIds?: readonly string[];
  } = {},
): string {
  const visited = new Set<string>([hatId]);
  const locations = new WeakMap<object, string>();
  function located<T extends object>(value: T, blockId: string): T {
    locations.set(value, blockId);
    return value;
  }
  const source: Record<string, unknown> = {};
  const scenes: Record<string, unknown> = {};
  const paths: string[][] = [];
  let hasIncludeBlocks = false;
  let hasSections = false;
  const activeBlockIds = new Set<string>([hatId]);
  if ((blocks[hatId] as Block).opcode === dsl4LabeledBlockSourceHatOpcode && entry) {
    source.kamishibai = String(readInput((blocks[hatId] as Block).inputs.VERSION));
    paths.push(['kamishibai']);
    onSourceLocation?.(['kamishibai'], hatId);
  }
  const ids = new Map(Object.entries(blocks).map(([id, block]) => [block, id]));
  function assignProperty(path: readonly string[], value: unknown, blockId: string) {
    if (
      paths.some((previous) =>
        previous
          .slice(0, Math.min(path.length, previous.length))
          .every((key, index) => key === path[index]),
      )
    )
      fail('Duplicate or overlapping story property', blockId);
    paths.push([...path]);
    let container = source;
    for (const key of path.slice(0, -1)) {
      const child = (container[key] ??= {});
      if (!isRecord(child)) fail('Conflicting story property', blockId);
      container = child;
    }
    container[path[path.length - 1]!] = value;
    // Record definitions by path, including scalar values that cannot be WeakMap keys.
    onSourceLocation?.(path, blockId);
  }
  function input(block: Block, name: string): unknown {
    if (!Object.hasOwn(block.inputs, name))
      fail(`Missing source block input ${name}`, ids.get(block));
    const connection = block.inputs[name];
    const candidateId = Array.isArray(connection) ? connection[1] : undefined;
    const candidate = typeof candidateId === 'string' ? blocks[candidateId] : undefined;
    if (isRecord(candidate)) {
      if (
        typeof candidate.opcode === 'string' &&
        candidate.opcode.startsWith(`${prefix}narrative`)
      ) {
        const reporter = readBlock(String(candidateId), ids.get(block)!);
        if (reporter.next !== null)
          fail('Narrative reporters cannot contain a next block', String(candidateId));
        const opcode = reporter.opcode.slice(prefix.length);
        if (opcode === 'narrativeReference')
          return located(
            {ref: `${String(input(reporter, 'SCOPE'))}.${String(input(reporter, 'COLUMN'))}`},
            String(candidateId),
          );
        if (opcode === 'narrativeVariable') return {variable: String(input(reporter, 'NAME'))};
        if (opcode === 'narrativeCompare')
          return {
            compare: {
              left: nodeInput(reporter, 'LEFT'),
              operator: String(input(reporter, 'OP')),
              right: nodeInput(reporter, 'RIGHT'),
            },
          };
        if (opcode === 'narrativeLogic') {
          const operator = input(reporter, 'OP');
          if (operator !== 'and' && operator !== 'or')
            fail('Unknown narrative logic operator', String(candidateId));
          return {
            [operator === 'and' ? 'all' : 'any']: [
              nodeInput(reporter, 'LEFT'),
              nodeInput(reporter, 'RIGHT'),
            ],
          };
        }
        if (opcode === 'narrativeNot') return {not: nodeInput(reporter, 'VALUE')};
        if (opcode === 'narrativeLogicList') {
          const operator = input(reporter, 'OP');
          if (operator !== 'and' && operator !== 'or')
            fail('Unknown narrative logic operator', String(candidateId));
          return {[operator === 'and' ? 'all' : 'any']: nodeInput(reporter, 'VALUES')};
        }
        fail('Only narrative value reporters may connect to an input', String(candidateId));
      }
      const menu =
        dsl4TurboWarpActionBlockSpecs
          .flatMap((spec) => spec.arguments)
          .filter((arg) => arg.name === name && arg.menu)
          .flatMap((arg) =>
            (['runtime', 'bundle'] as const).map((form) => menuIdentity(form, arg.menu!)),
          )
          .find(({opcode}) => opcode === candidate.opcode) ??
        (name === 'ENABLED' && candidate.opcode === `${prefix}menu_sectionEnabled`
          ? {opcode: candidate.opcode, field: 'sectionEnabled'}
          : undefined);
      if (menu) {
        const fields = isRecord(candidate.fields) ? candidate.fields : {};
        const field = fields[menu.field];
        if (
          visited.has(candidateId) ||
          candidate.shadow !== true ||
          candidate.next !== null ||
          candidate.parent !== ids.get(block) ||
          !isRecord(candidate.inputs) ||
          Object.keys(candidate.inputs).length ||
          !Array.isArray(field)
        ) {
          fail('Invalid source menu shadow', candidateId);
        }
        visited.add(candidateId);
        return literalInput([1, [10, field[0]]], block);
      }
      if (
        visited.has(candidateId) ||
        candidate.shadow !== true ||
        candidate.parent !== ids.get(block)
      ) {
        fail('Invalid or shared source input shadow', candidateId);
      }
      visited.add(candidateId);
    }
    return literalInput(connection, block);
  }
  function literalInput(connection: unknown, block: Block): unknown {
    try {
      return readInput(connection);
    } catch (error) {
      if (error instanceof Dsl4BlockSourceError && error.blockId === null) {
        throw new Dsl4BlockSourceError(error.code, error.message, {
          blockId: ids.get(block)!,
          cause: error,
        });
      }
      throw error;
    }
  }
  function recordJson(block: Block, name: string): Record<string, unknown> {
    const value = parseJson(input(block, name));
    if (!isRecord(value)) fail(`${name} must contain a JSON object`);
    return value;
  }
  function nodeInput(block: Block, name: string): unknown {
    const value = input(block, name);
    return isRecord(value) ? value : parseJson(value, ids.get(block));
  }
  function substack(block: Block, name = 'SUBSTACK'): string | null {
    const value = block.inputs[name];
    if (value === undefined) return null;
    if (!Array.isArray(value) || value[0] !== 2 || typeof value[1] !== 'string')
      fail('Invalid scene/action substack');
    return value[1];
  }
  function readBlock(id: string, parent: string): Block {
    if (visited.has(id)) fail('Source block graph contains a cycle or shared block', id);
    visited.add(id);
    const block = blocks[id];
    if (
      !isRecord(block) ||
      typeof block.opcode !== 'string' ||
      !isRecord(block.inputs) ||
      block.parent !== parent ||
      block.topLevel !== false ||
      block.shadow !== false ||
      (block.next !== null && typeof block.next !== 'string')
    ) {
      fail('Source block is missing or has invalid connections', id);
    }
    const helperInputs: Record<string, string[]> = {
      [`${prefix}property`]: ['PATH', 'VALUE'],
      [`${prefix}scene`]: ['SCENE', 'PROPERTIES', 'SUBSTACK'],
      [`${prefix}actionOptions`]: ['PROPERTIES', 'SUBSTACK'],
      [`${prefix}useSection`]: ['SUBSTACK'],
      [`${prefix}poseSteps`]: ['TARGET', 'SUBSTACK'],
      [`${prefix}poseStep`]: ['POSE', 'SKIN', 'SOUND'],
      [`${prefix}customAction`]: ['TARGET', 'COMMAND', 'ARGUMENTS', 'STABLEID'],
      [dsl4IncludeBlocksOpcode]: ['LABEL'],
      ...Object.fromEntries(
        Object.entries(dsl4NarrativeBlockInputs).map(([name, inputs]) => [
          `${prefix}${name}`,
          [...inputs],
        ]),
      ),
    };
    const definition = definitionByOpcode.get(block.opcode);
    const expected = definition
      ? definition.defaultName === undefined
        ? ['VALUE']
        : ['NAME', 'VALUE']
      : helperInputs[block.opcode];
    if (expected && Object.keys(block.inputs).some((name) => !expected.includes(name))) {
      fail('Unexpected input in source declaration', id);
    }
    return block as Block;
  }
  function action(block: Block, blockId: string): Record<string, unknown> {
    if (block.opcode === `${prefix}actionOptions`) {
      const options = recordJson(block, 'PROPERTIES');
      if (
        Object.keys(options).some((key) => !['arguments', 'textFormat'].includes(key)) ||
        !isRecord(options.arguments) ||
        !['plain', 'json'].includes(String(options.textFormat ?? 'plain'))
      ) {
        fail('Invalid action options');
      }
      const childId = substack(block);
      if (!childId) fail('Action options must contain exactly one action');
      const child = readBlock(childId, blockId);
      if (child.next !== null || isDsl4StructuredSourceOpcode(child.opcode))
        fail('Action options must contain exactly one core action');
      return coreAction(child, options.arguments, options.textFormat === 'json');
    }
    if (block.opcode === `${prefix}poseSteps`) {
      const steps: PoseStep[] = [];
      let parent = blockId;
      let stepId = substack(block);
      while (stepId !== null) {
        const step = readBlock(stepId, parent);
        if (step.opcode !== `${prefix}poseStep`)
          fail('Pose steps may contain only pose step blocks', stepId);
        const skin = String(input(step, 'SKIN'));
        const sound = String(input(step, 'SOUND'));
        steps.push({
          pose: String(input(step, 'POSE')),
          ...(skin.trim() === '' ? {} : {skin}),
          ...(sound.trim() === '' ? {} : {sound}),
        });
        parent = stepId;
        stepId = step.next;
      }
      if (!steps.length) fail('Pose steps must contain at least one pose step', blockId);
      return {[`${String(input(block, 'TARGET'))}.pose`]: {steps}};
    }
    if (block.opcode === `${prefix}poseStep`)
      fail('Pose step blocks must be placed inside recognize actor pose steps', blockId);
    if (block.opcode === `${prefix}customAction`) {
      const command = String(input(block, 'COMMAND'));
      if (specs.has(command)) fail('Core actions must use their own runtime blocks');
      const args = recordJson(block, 'ARGUMENTS');
      const stableId = String(input(block, 'STABLEID'));
      return {
        [`${String(input(block, 'TARGET'))}.${command}`]: {
          arguments: args,
          ...(stableId ? {stableId} : {}),
        },
      };
    }
    return coreAction(block, {}, false);
  }
  function coreAction(
    block: Block,
    extras: Record<string, unknown>,
    jsonText: boolean,
  ): Record<string, unknown> {
    const blockCommand = [...specs.keys()].find(
      (name) =>
        block.opcode === name ||
        block.opcode === `${dsl4BlockSourceRuntimeExtensionId}_${name}` ||
        block.opcode ===
          `${dsl4BlockSourceBundleExtensionId}_${dsl4BlockSourceRuntimeExtensionId}__${name}`,
    );
    const spec = blockCommand ? specs.get(blockCommand) : undefined;
    if (!blockCommand || !spec)
      fail(`Unsupported source action opcode: ${block.opcode}`, ids.get(block));
    const command = coreActionCommandForBlock(blockCommand);
    if (
      Object.keys(block.inputs).some(
        (name) => !spec.arguments.some((argument) => argument.name === name),
      )
    ) {
      fail('Unexpected input in source action');
    }
    const args = Object.fromEntries(
      spec.arguments.map(({name}) => [
        name,
        (command === 'audio' || command === 'audioControl') &&
        ['FADEIN', 'VOLUME', 'FADEOUT'].includes(name) &&
        !Object.hasOwn(block.inputs, name)
          ? ''
          : input(block, name),
      ]),
    );
    let value: unknown;
    const references = Object.fromEntries(
      Object.entries(args).filter(
        ([, value]) =>
          isRecord(value) && Object.keys(value).length === 1 && Object.hasOwn(value, 'ref'),
      ),
    );
    for (const name of Object.keys(references))
      args[name] = spec.arguments.find((argument) => argument.name === name)?.defaultValue ?? '';
    try {
      value = sourceValueForDsl4CoreActionBlock(blockCommand, args);
    } catch (cause) {
      throw new Dsl4BlockSourceError(
        'K4-BLOCK-SOURCE-FRAGMENT-001',
        `Invalid ${command} block arguments`,
        {cause},
      );
    }
    for (const [name, reference] of Object.entries(references)) {
      const field = argumentFields[name];
      if (!field) fail('Reference is not supported in this core input', ids.get(block));
      if (isRecord(value)) value[field] = reference;
      else if (scalarFields[command] === field) value = reference;
      else fail('Reference is not supported in this core input', ids.get(block));
    }
    const optional = optionalInputs[command] ?? {};
    if (jsonText && command !== 'setText') fail('JSON text encoding applies only to setText');
    if (isRecord(value)) {
      for (const [name, field] of Object.entries(optional)) {
        if (String(args[name]).trim() === '' && !Object.hasOwn(references, name))
          delete value[field];
      }
      if (command === 'setText' && jsonText) value.text = parseJson(args.TEXT);
    } else if (jsonText) fail('JSON text encoding applies only to setText');
    const reserved = new Set(
      spec.arguments.map(({name}) => argumentFields[name]).filter((field) => field !== undefined),
    );
    if (command === 'video' || command === 'audio') {
      reserved.add('asset');
      reserved.add('url');
    }
    if (command === 'videoControl' || command === 'audioControl') {
      for (const field of Object.values(dsl4VideoControlValueFields)) reserved.add(field);
    }
    // Older audio blocks kept optional playback settings in actionOptions.
    if (command === 'audio' || command === 'audioControl') {
      for (const name of ['FADEIN', 'VOLUME', 'FADEOUT']) {
        if (String(args[name]).trim() === '') reserved.delete(argumentFields[name]!);
      }
    }
    if (spec.arguments.some(({name}) => name === 'SPEC') && Object.keys(extras).length)
      fail('SPEC already contains all action properties');
    if (Object.keys(extras).some((key) => reserved.has(key)))
      fail('Action options cannot override block inputs');
    if (Object.keys(extras).length) {
      const primary = scalarFields[command];
      value = {...extras, ...(isRecord(value) ? value : primary ? {[primary]: value} : {})};
    }
    const target =
      dsl4CoreActionManifest.find((entry) => entry.command === command)?.target === 'actor'
        ? `${String(args.TARGET)}.`
        : '';
    return {[`${target}${command}`]: value};
  }
  function sectionEnabled(block: Block): boolean {
    hasSections = true;
    const field = block.fields?.ENABLED;
    const enabled = Array.isArray(field) && field.length === 2 ? field[0] : undefined;
    if (enabled !== 'on' && enabled !== 'off')
      fail('Section mode must be a static on/off choice', ids.get(block));
    return enabled === 'on';
  }
  function actionChain(
    start: string | null,
    parent: string,
    enabled: boolean,
    depth = 0,
  ): Record<string, unknown>[] {
    if (depth > 32) fail('Section nesting exceeds its limit');
    const actions: Record<string, unknown>[] = [];
    let id = start;
    while (id !== null) {
      const block = readBlock(id, parent);
      if (enabled) activeBlockIds.add(id);
      if (block.opcode === `${prefix}useSection`) {
        const selected = sectionEnabled(block);
        actions.push(...actionChain(substack(block), id, enabled && selected, depth + 1));
      } else if (
        ['narrativeIf', 'narrativeRepeat', 'narrativeForEach'].some(
          (name) => block.opcode === `${prefix}${name}`,
        )
      ) {
        if (String(readInput((blocks[hatId] as Block).inputs.VERSION)) !== '4.0')
          fail(
            'Narrative controls require a 4.0 declaration; replace the experimental 4.1 version and validate with --narrative-control',
            id,
          );
        let value: Record<string, unknown>;
        if (block.opcode === `${prefix}narrativeIf`)
          value = {
            if: {
              condition: nodeInput(block, 'CONDITION'),
              then: actionChain(substack(block), id, enabled, depth + 1),
              else: actionChain(substack(block, 'SUBSTACK2'), id, enabled, depth + 1),
            },
          };
        else {
          const body = actionChain(substack(block), id, enabled, depth + 1);
          const scope = String(input(block, 'AS'));
          if (
            block.opcode === `${prefix}narrativeRepeat` &&
            String(input(block, 'TIMES')).trim() === ''
          )
            fail('Repeat count must be a fixed integer', id);
          value =
            block.opcode === `${prefix}narrativeRepeat`
              ? {
                  repeat: {
                    times: Number(input(block, 'TIMES')),
                    ...(scope ? {as: scope} : {}),
                    do: body,
                  },
                }
              : {forEach: {as: scope, items: nodeInput(block, 'ITEMS'), do: body}};
        }
        if (enabled) actions.push(located(value, id));
      } else {
        const value = action(block, id);
        if (enabled) actions.push(located(value, id));
      }
      parent = id;
      id = block.next;
    }
    return actions;
  }
  function declarations(
    start: string | null,
    initialParent: string,
    enabled: boolean,
    depth = 0,
    config = false,
  ) {
    if (depth > 32) fail('Section nesting exceeds its limit');
    let parent = initialParent;
    let id = start;
    while (id !== null) {
      if (typeof id !== 'string') fail('Invalid source chain');
      const block = readBlock(id, parent);
      if (enabled) activeBlockIds.add(id);
      if (config && block.opcode !== `${prefix}useSection`) {
        const definition = definitionByOpcode.get(block.opcode);
        const path =
          block.opcode === `${prefix}property` ? parseJson(input(block, 'PATH'), id) : undefined;
        if (!(
          (definition && dsl4ConfigDefinitionKeys.has(definition.path[0]!)) ||
          (Array.isArray(path) && dsl4ConfigDefinitionKeys.has(String(path[0])))
        ))
          fail('kamishibaiConfig accepts configuration definitions only', id);
      }
      if (block.opcode === `${prefix}useSection`) {
        const selected = sectionEnabled(block);
        declarations(substack(block), id, enabled && selected, depth + 1, config);
      } else if (block.opcode === dsl4IncludeBlocksOpcode) {
        if (depth) fail('includeBlocks must stay outside definition sections', id);
        if (!resolveInclude) fail('includeBlocks requires a project label resolver', id);
        if (!hasIncludeBlocks) {
          if (Object.hasOwn(source, 'include')) fail('Conflicting include declarations', id);
          source.include = [];
          paths.push(['include']);
          hasIncludeBlocks = true;
        }
        (source.include as string[]).push(resolveInclude(id));
        onSourceLocation?.(['include', (source.include as string[]).length - 1], id);
      } else if (block.opcode === `${prefix}property`) {
        const path = parseJson(input(block, 'PATH'), id);
        if (
          !Array.isArray(path) ||
          path.length < 1 ||
          path.length > 2 ||
          path.some((key) => typeof key !== 'string' || forbiddenKeys.has(key)) ||
          path[0] === 'scenes'
        ) {
          fail('Invalid story property path', id);
        }
        const value = parseJson(input(block, 'VALUE'), id);
        if (enabled) assignProperty(path as string[], value, id);
      } else if (definitionByOpcode.has(block.opcode)) {
        const definition = definitionByOpcode.get(block.opcode)!;
        const path = [...definition.path];
        if (definition.defaultName !== undefined) {
          const name = String(input(block, 'NAME'));
          if (
            !name.length ||
            forbiddenKeys.has(name) ||
            (definition.opcode !== 'asset' && !/^[\p{L}_][\p{L}\p{N}_-]*$/u.test(name))
          )
            fail(`Invalid ${definition.opcode} name`, id);
          path.push(name);
        }
        const value = parseJson(input(block, 'VALUE'), id);
        if (definition.opcode === 'variable') {
          if (
            !['string', 'number', 'boolean'].includes(typeof value) ||
            (typeof value === 'number' && !Number.isFinite(value))
          )
            fail('Variable definition must contain a finite number, boolean or string', id);
        } else if (definition.opcode === 'actor') {
          if (typeof value !== 'string' || !value.length)
            fail('Actor definition must contain an asset ID string', id);
        } else if (definition.opcode === 'asset') {
          if (!isRecord(value) && (typeof value !== 'string' || !value.length))
            fail('Asset definition must contain a JSON object or shorthand string', id);
        } else if (!isRecord(value)) {
          fail(`${definition.opcode} definition must contain a JSON object`, id);
        }
        if (enabled) assignProperty(path, value, id);
      } else if (block.opcode === `${prefix}scene`) {
        if (depth) fail('Scenes must stay outside definition sections', id);
        const name = String(input(block, 'SCENE'));
        if (forbiddenKeys.has(name) || Object.hasOwn(scenes, name))
          fail('Duplicate or invalid scene name', id);
        const properties = recordJson(block, 'PROPERTIES');
        if (Object.hasOwn(properties, 'actions'))
          fail('Scene actions must come from connected blocks', id);
        const actions = actionChain(substack(block), id, enabled);
        scenes[name] = Object.keys(properties).length ? {...properties, actions} : actions;
        if (enabled) onSourceLocation?.(['scenes', name], id);
      } else fail(`Unsupported story declaration opcode: ${block.opcode}`, id);
      parent = id;
      id = block.next;
    }
  }
  // Read implicit configuration includes through the same graph and duplicate-property checks.
  for (const configHatId of configHatIds) {
    if (visited.has(configHatId)) fail('Configuration hat is repeated', configHatId);
    const configHat = blocks[configHatId];
    if (
      !isRecord(configHat) ||
      configHat.opcode !== dsl4ConfigBlockSourceHatOpcode ||
      configHat.topLevel !== true ||
      configHat.parent !== null ||
      configHat.shadow !== false ||
      !isRecord(configHat.inputs) ||
      Object.keys(configHat.inputs).some((key) => key !== 'LABEL') ||
      (typeof configHat.next !== 'string' && configHat.next !== null)
    ) {
      fail('Configuration hat has invalid connections or inputs', configHatId);
    }
    visited.add(configHatId);
    activeBlockIds.add(configHatId);
    declarations(configHat.next as string | null, configHatId, true, 0, true);
  }
  declarations((blocks[hatId] as Block).next, hatId, true);
  if (Object.keys(scenes).length) source.scenes = scenes;
  function visitLocation(value: unknown, path: (string | number)[]) {
    if (value === null || typeof value !== 'object') return;
    const id = locations.get(value);
    if (id) onSourceLocation?.(path, id);
    if (Array.isArray(value))
      value.forEach((child, index) => visitLocation(child, [...path, index]));
    else Object.entries(value).forEach(([key, child]) => visitLocation(child, [...path, key]));
  }
  if (onSourceLocation) visitLocation(source, []);
  const yaml = stringify(source, {lineWidth: 0});
  return hasSections
    ? appendDsl4SectionAuthoringState(yaml, {
        version: 1,
        activeBlockIds: [...activeBlockIds],
        source,
        hatId,
        blocks: Object.fromEntries([...visited].map((id) => [id, blocks[id]])),
      })
    : yaml;
}
