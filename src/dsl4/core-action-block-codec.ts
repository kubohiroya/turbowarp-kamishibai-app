import {coerceScalarBlockValue} from '@kubohiroya/turbowarp-runtime-adapter';
import {dsl4VideoControlValueFields} from './video-source.js';

export const defaultJsonLimits = Object.freeze({
  maxCharacters: 16_384,
  maxDepth: 32,
  maxNodes: 1_024,
});
const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);

function argument(name: string, type: 'string' | 'number', defaultValue: unknown, menu?: string) {
  return Object.freeze({name, type, defaultValue, ...(menu ? {menu} : {})});
}

function block(
  command: string,
  text: string,
  args: ReadonlyArray<ReturnType<typeof argument>> = [],
) {
  return Object.freeze({command, text, arguments: Object.freeze(args)});
}

export const dsl4TurboWarpCoreActionBlockSpecs = Object.freeze([
  block('stage', 'set stage backdrop [BACKDROP]', [argument('BACKDROP', 'string', 'Backdrop')]),
  block('bgm', 'play BGM [SOUND]', [argument('SOUND', 'string', 'Music')]),
  block('stopBgm', 'stop BGM over [SECONDS] seconds', [argument('SECONDS', 'number', 0)]),
  block('setBgmVolume', 'set BGM volume to [VOLUME] % over [SECONDS] seconds', [
    argument('VOLUME', 'number', 100),
    argument('SECONDS', 'number', 0),
  ]),
  block('sound', 'play sound [SOUND] until done', [argument('SOUND', 'string', 'Sound')]),
  block(
    'audio',
    'prepare audio [ID] from [SOURCE_TYPE] [SOURCE] fade in [FADEIN] seconds volume [VOLUME] % fade out [FADEOUT] seconds',
    [
      argument('ID', 'string', 'audio'),
      argument('SOURCE_TYPE', 'string', 'asset', 'dsl4VideoSourceType'),
      argument('SOURCE', 'string', 'Music'),
      argument('FADEIN', 'string', ''),
      argument('VOLUME', 'string', ''),
      argument('FADEOUT', 'string', ''),
    ],
  ),
  block(
    'audioControl',
    'audio [ID] [OPERATION] value [VALUE] fade in [FADEIN] seconds volume [VOLUME] % fade out [FADEOUT] seconds',
    [
      argument('ID', 'string', 'audio'),
      argument('OPERATION', 'string', 'playUntilDone', 'dsl4VideoOperation'),
      argument('VALUE', 'string', ''),
      argument('FADEIN', 'string', ''),
      argument('VOLUME', 'string', ''),
      argument('FADEOUT', 'string', ''),
    ],
  ),
  block(
    'video',
    'show video [ID] from [SOURCE_TYPE] [SOURCE] x [X] y [Y] width [WIDTH] height [HEIGHT] plane [PLANE] z-index [ZINDEX]',
    [
      argument('ID', 'string', 'video'),
      argument('SOURCE_TYPE', 'string', 'asset', 'dsl4VideoSourceType'),
      argument('SOURCE', 'string', 'Movie'),
      argument('X', 'number', 0),
      argument('Y', 'number', 0),
      argument('WIDTH', 'number', 320),
      argument('HEIGHT', 'number', 180),
      argument('PLANE', 'string', 'front', 'dsl4VideoPlane'),
      argument('ZINDEX', 'number', 0),
    ],
  ),
  block('videoControl', 'video [ID] [OPERATION] value [VALUE]', [
    argument('ID', 'string', 'video'),
    argument('OPERATION', 'string', 'playUntilDone', 'dsl4VideoOperation'),
    argument('VALUE', 'string', ''),
  ]),
  block('wait', 'wait [SECONDS] seconds', [argument('SECONDS', 'number', 1)]),
  block('debugger', 'debugger'),
  block('broadcastMessageAndWait', 'broadcast [MESSAGE] and wait', [
    argument('MESSAGE', 'string', 'message'),
  ]),
  block('transition', 'transition [EFFECT] for [SECONDS] seconds', [
    argument('EFFECT', 'string', 'fadeOut', 'dsl4TransitionEffect'),
    argument('SECONDS', 'number', 1),
  ]),
  block('goto', 'go to scene [SCENE]', [argument('SCENE', 'string', 'scene')]),
  block('gotoSegment', 'go to story segment [SEGMENT]', [argument('SEGMENT', 'string', 'chapter')]),
  block('branch', 'choose branch [BRANCH]', [argument('BRANCH', 'string', 'branch')]),
  block('setVariable', 'set story variable [NAME] to [VALUE] as [TYPE]', [
    argument('NAME', 'string', 'variable'),
    argument('VALUE', 'string', ''),
    argument('TYPE', 'string', 'string', 'dsl4VariableValueType'),
  ]),
  block('changeVariable', 'change story variable [NAME] by [BY]', [
    argument('NAME', 'string', 'variable'),
    argument('BY', 'number', 1),
  ]),
  block('toggleVariable', 'toggle story variable [NAME]', [argument('NAME', 'string', 'variable')]),
  block('keyInputToChangeScene', 'wait for key routes [ROUTES]', [
    argument('ROUTES', 'string', '{"Space":"next"}'),
  ]),
  block('touchInputToChangeScene', 'wait for actor touch routes [ROUTES]', [
    argument('ROUTES', 'string', '{"Actor":"next"}'),
  ]),
  block('poseInputToChangeScene', 'wait for pose routes [ROUTES]', [
    argument('ROUTES', 'string', '{"pose":"next"}'),
  ]),
  block('imageInputToChangeScene', 'wait for image label routes [ROUTES]', [
    argument('ROUTES', 'string', '{"label":"next"}'),
  ]),
  block(
    'show',
    'show actor [TARGET] skin [SKIN] x [X] y [Y] scale [SCALE] % rotation [ROTATION] direction [DIRECTION]',
    [
      argument('TARGET', 'string', 'Actor'),
      argument('SKIN', 'string', 'Skin'),
      argument('X', 'number', 0),
      argument('Y', 'number', 0),
      argument('SCALE', 'number', 100),
      // Blank rotation and direction keep the actor as it is, so older blocks stay unchanged.
      argument('ROTATION', 'string', '', 'dsl4RotationStyle'),
      argument('DIRECTION', 'string', ''),
    ],
  ),
  block('hide', 'hide actor [TARGET]', [argument('TARGET', 'string', 'Actor')]),
  block('setTransparency', 'set actor [TARGET] transparency spec [SPEC]', [
    argument('TARGET', 'string', 'Actor'),
    argument('SPEC', 'string', '50'),
  ]),
  block('moveTo', 'move actor [TARGET] to x [X] y [Y] in [SECONDS] seconds [EASING]', [
    argument('TARGET', 'string', 'Actor'),
    argument('X', 'number', 0),
    argument('Y', 'number', 0),
    argument('SECONDS', 'number', 1),
    argument('EASING', 'string', 'linear', 'dsl4MoveEasing'),
  ]),
  block('say', 'actor [TARGET] say spec [SPEC]', [
    argument('TARGET', 'string', 'Actor'),
    argument('SPEC', 'string', '{"text":"Hello","seconds":1}'),
  ]),
  block('think', 'actor [TARGET] think spec [SPEC]', [
    argument('TARGET', 'string', 'Actor'),
    argument('SPEC', 'string', '{"text":"Hmm","seconds":1}'),
  ]),
  block('setSkin', 'set actor [TARGET] skin [SKIN] optional scale [SCALE]', [
    argument('TARGET', 'string', 'Actor'),
    argument('SKIN', 'string', 'Skin'),
    argument('SCALE', 'string', ''),
  ]),
  block('setLayer', 'set actor [TARGET] layer [LAYER]', [
    argument('TARGET', 'string', 'Actor'),
    argument('LAYER', 'string', 'front'),
  ]),
  block('loop', 'loop actor [TARGET] costume steps [STEPS]', [
    argument('TARGET', 'string', 'Actor'),
    argument('STEPS', 'string', '[{"skin":"Skin","seconds":1}]'),
  ]),
  block('setText', 'set text actor [TARGET] to [TEXT] style [STYLE]', [
    argument('TARGET', 'string', 'Caption'),
    argument('TEXT', 'string', 'Text'),
    argument('STYLE', 'string', 'style'),
  ]),
  block('pose', 'recognize actor [TARGET] pose steps [STEPS]', [
    argument('TARGET', 'string', 'Actor'),
    argument('STEPS', 'string', '[{"pose":"pose"}]'),
  ]),
]);

/** Additional input surfaces normalize to the same canonical core commands. */
export const dsl4TurboWarpActionBlockSpecs = Object.freeze([
  ...dsl4TurboWarpCoreActionBlockSpecs,
  block('sayText', 'actor [TARGET] say text [TEXT] seconds [SECONDS]', [
    argument('TARGET', 'string', 'Actor'),
    argument('TEXT', 'string', 'Hello'),
    argument('SECONDS', 'number', 1),
  ]),
  block('thinkText', 'actor [TARGET] think text [TEXT] seconds [SECONDS]', [
    argument('TARGET', 'string', 'Actor'),
    argument('TEXT', 'string', 'Hmm'),
    argument('SECONDS', 'number', 1),
  ]),
]);

export function coreActionCommandForBlock(command: string) {
  return command === 'sayText' ? 'say' : command === 'thinkText' ? 'think' : command;
}

const blockSpecByCommand = new Map(
  dsl4TurboWarpActionBlockSpecs.map((spec) => [spec.command, spec]),
);

export function blockError(code: string, message: string, cause?: unknown) {
  const error = new Error(message, cause === undefined ? undefined : {cause});
  Object.defineProperty(error, 'code', {value: code});
  return error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateJsonTree(value: unknown, limits: Readonly<{maxDepth: number; maxNodes: number}>) {
  const pending = [{value, depth: 0}];
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    nodes += 1;
    if (nodes > limits.maxNodes) {
      throw blockError(
        'K4-BLOCK-ACTION-JSON-LIMIT',
        'TurboWarp action JSON exceeds the node limit',
      );
    }
    if (current.depth > limits.maxDepth) {
      throw blockError(
        'K4-BLOCK-ACTION-JSON-LIMIT',
        'TurboWarp action JSON exceeds the depth limit',
      );
    }
    if (!Array.isArray(current.value) && !isRecord(current.value)) continue;
    for (const [key, child] of Object.entries(current.value)) {
      if (forbiddenKeys.has(key)) {
        throw blockError(
          'K4-BLOCK-ACTION-JSON-001',
          'TurboWarp action JSON contains a forbidden object key',
        );
      }
      pending.push({value: child, depth: current.depth + 1});
    }
  }
  return value;
}

function parseJson(
  input: unknown,
  limits: Readonly<{maxCharacters: number; maxDepth: number; maxNodes: number}>,
) {
  const source = String(input);
  if (source.length > limits.maxCharacters) {
    throw blockError(
      'K4-BLOCK-ACTION-JSON-LIMIT',
      'TurboWarp action JSON exceeds the character limit',
    );
  }
  try {
    return validateJsonTree(JSON.parse(source), limits);
  } catch (error) {
    if (isRecord(error) && typeof error.code === 'string') throw error;
    throw blockError('K4-BLOCK-ACTION-JSON-001', 'TurboWarp action JSON is invalid', error);
  }
}

function numberValue(input: unknown, name: string) {
  const value = Number(input);
  if (!Number.isFinite(value)) {
    throw blockError('K4-BLOCK-ACTION-001', `TurboWarp action ${name} must be a finite number`);
  }
  return value;
}

export function validateBlockArguments(
  args: Readonly<Record<string, unknown>>,
  spec: Readonly<Record<string, unknown>>,
) {
  const expected = (spec.arguments as ReadonlyArray<Readonly<{name: string}>>)
    .map(({name}) => name)
    .filter(
      (name) =>
        !(
          (spec.command === 'audio' || spec.command === 'audioControl') &&
          ['FADEIN', 'VOLUME', 'FADEOUT'].includes(name) &&
          !Object.hasOwn(args, name)
        ) &&
        // Projects authored before the rotation inputs existed carry neither of them.
        !(
          spec.command === 'show' &&
          ['ROTATION', 'DIRECTION'].includes(name) &&
          !Object.hasOwn(args, name)
        ),
    );
  const actual = Object.keys(args).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((name, index) => name !== sortedExpected[index])
  ) {
    throw blockError(
      'K4-BLOCK-ACTION-001',
      `TurboWarp action ${String(spec.command)} arguments are incomplete or unknown`,
    );
  }
}

/** Blank playback settings inherit current defaults; explicit zero remains a value. */
function audioPlaybackValues(args: Readonly<Record<string, unknown>>) {
  return Object.fromEntries(
    ['FADEIN', 'VOLUME', 'FADEOUT'].flatMap((name) => {
      const value = args[name];
      if (value === undefined || String(value).trim() === '') return [];
      return [
        [
          name === 'FADEIN' ? 'fadeIn' : name === 'VOLUME' ? 'volume' : 'fadeOut',
          numberValue(value, name),
        ],
      ];
    }),
  );
}

/**
 * Convert one Scratch argument record to the source-shaped value checked by
 * the same JSON Schema definition as its YAML action.
 */
export function sourceValueForBlock(
  command: string,
  args: Readonly<Record<string, unknown>>,
  limits: Readonly<{maxCharacters: number; maxDepth: number; maxNodes: number}>,
) {
  switch (command) {
    case 'audio': {
      const sourceType = String(args.SOURCE_TYPE);
      if (sourceType !== 'asset' && sourceType !== 'url')
        throw blockError('K4-BLOCK-ACTION-001', 'Audio source type must be asset or url');
      return {id: String(args.ID), [sourceType]: String(args.SOURCE), ...audioPlaybackValues(args)};
    }
    case 'video': {
      const sourceType = String(args.SOURCE_TYPE);
      if (sourceType !== 'asset' && sourceType !== 'url') {
        throw blockError('K4-BLOCK-ACTION-001', 'Video source type must be asset or url');
      }
      return {
        id: String(args.ID),
        [sourceType]: String(args.SOURCE),
        x: numberValue(args.X, 'X'),
        y: numberValue(args.Y, 'Y'),
        width: numberValue(args.WIDTH, 'WIDTH'),
        height: numberValue(args.HEIGHT, 'HEIGHT'),
        ...(String(args.PLANE).trim() === '' ? {} : {plane: String(args.PLANE)}),
        ...(String(args.ZINDEX).trim() === '' ? {} : {zIndex: numberValue(args.ZINDEX, 'ZINDEX')}),
      };
    }
    case 'audioControl':
    case 'videoControl': {
      const operation = String(args.OPERATION);
      if (
        command === 'audioControl' &&
        args.VOLUME !== undefined &&
        String(args.VOLUME).trim() !== '' &&
        !['playUntilDone', 'play', 'loop', 'resume'].includes(operation)
      ) {
        throw blockError(
          'K4-BLOCK-ACTION-001',
          'Playback volume applies only to audio start/resume; setVolume uses VALUE',
        );
      }
      const field = dsl4VideoControlValueFields[operation];
      const value =
        operation === 'setMuted'
          ? String(args.VALUE) === 'true'
            ? true
            : String(args.VALUE) === 'false'
              ? false
              : undefined
          : field
            ? numberValue(args.VALUE, 'VALUE')
            : undefined;
      if (operation === 'setMuted' && value === undefined) {
        throw blockError('K4-BLOCK-ACTION-001', `${command} muted value must be true or false`);
      }
      return {
        id: String(args.ID),
        operation,
        ...(field ? {[field]: value} : {}),
        ...(command === 'audioControl' ? audioPlaybackValues(args) : {}),
      };
    }
    case 'stage':
      return String(args.BACKDROP);
    case 'bgm':
    case 'sound':
      return String(args.SOUND);
    case 'stopBgm':
      return {seconds: numberValue(args.SECONDS, 'SECONDS')};
    case 'setBgmVolume':
      return {
        volume: numberValue(args.VOLUME, 'VOLUME'),
        seconds: numberValue(args.SECONDS, 'SECONDS'),
      };
    case 'wait':
      return numberValue(args.SECONDS, 'SECONDS');
    case 'debugger':
      return null;
    case 'broadcastMessageAndWait':
      return String(args.MESSAGE);
    case 'transition':
      return {
        effect: String(args.EFFECT),
        seconds: numberValue(args.SECONDS, 'SECONDS'),
      };
    case 'goto':
      return String(args.SCENE);
    case 'gotoSegment':
      return String(args.SEGMENT);
    case 'branch':
      return String(args.BRANCH);
    case 'setVariable': {
      const coerced = coerceScalarBlockValue(args.VALUE, String(args.TYPE ?? ''), {
        errorCodePrefix: 'K4',
      });
      if (!coerced.ok) {
        throw blockError(
          'K4-BLOCK-ACTION-001',
          `TurboWarp action setVariable VALUE is not a valid ${String(args.TYPE)}`,
        );
      }
      return {name: String(args.NAME), value: coerced.value};
    }
    case 'changeVariable':
      return {name: String(args.NAME), by: numberValue(args.BY, 'BY')};
    case 'toggleVariable':
      return String(args.NAME);
    case 'keyInputToChangeScene':
    case 'touchInputToChangeScene':
    case 'poseInputToChangeScene':
    case 'imageInputToChangeScene':
      return {routes: parseJson(args.ROUTES, limits)};
    case 'show': {
      const rotation = String(args.ROTATION ?? '').trim();
      const direction = String(args.DIRECTION ?? '').trim();
      return {
        skin: String(args.SKIN),
        x: numberValue(args.X, 'X'),
        y: numberValue(args.Y, 'Y'),
        scale: numberValue(args.SCALE, 'SCALE'),
        ...(rotation === '' ? {} : {rotation}),
        ...(direction === '' ? {} : {direction: numberValue(direction, 'DIRECTION')}),
      };
    }
    case 'hide':
      return {};
    case 'setTransparency':
      return parseJson(args.SPEC, limits);
    case 'moveTo':
      return {
        x: numberValue(args.X, 'X'),
        y: numberValue(args.Y, 'Y'),
        seconds: numberValue(args.SECONDS, 'SECONDS'),
        easing: String(args.EASING),
      };
    case 'say':
    case 'think':
      return parseJson(args.SPEC, limits);
    case 'sayText':
    case 'thinkText':
      return {text: String(args.TEXT), seconds: numberValue(args.SECONDS, 'SECONDS')};
    case 'setSkin': {
      const scale = String(args.SCALE);
      return {
        skin: String(args.SKIN),
        ...(scale.trim().length === 0 ? {} : {scale: numberValue(scale, 'SCALE')}),
      };
    }
    case 'setLayer': {
      const layer = String(args.LAYER);
      return layer === 'front' || layer === 'back' ? layer : numberValue(layer, 'LAYER');
    }
    case 'loop':
      return {steps: parseJson(args.STEPS, limits)};
    case 'setText':
      return {text: String(args.TEXT), style: String(args.STYLE)};
    case 'pose':
      return {steps: parseJson(args.STEPS, limits)};
    default:
      throw blockError('K4-BLOCK-ACTION-001', `Unknown TurboWarp action block: ${command}`);
  }
}

/** Decode authoring inputs using the same conversion as the runtime action surface. */
export function sourceValueForDsl4CoreActionBlock(command: string, args: Record<string, unknown>) {
  const spec = blockSpecByCommand.get(command);
  if (!spec) throw blockError('K4-BLOCK-ACTION-001', `Unknown TurboWarp action block: ${command}`);
  validateBlockArguments(args, spec);
  return sourceValueForBlock(command, args, defaultJsonLimits);
}
