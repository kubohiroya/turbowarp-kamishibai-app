import {createTurboWarpBlockDefinitions} from '@kubohiroya/turbowarp-extension-manifest';
import {
  dsl4SceneReferenceOperations,
  dsl4SceneRelationReference,
} from '../scene-relation-declarations.js';

type TurboWarpScratchBlockBoundary = Parameters<typeof createTurboWarpBlockDefinitions>[0];
import Ajv2020 from 'ajv/dist/2020.js';

import {dsl4CoreActionManifest} from '../core-action-manifest.js';
import {deepFreeze} from '../story-document.js';
import {dsl4RotationStyleNames} from '../rotation-style.js';
import {dsl4VideoOperations} from '../video-source.js';

import {
  defaultJsonLimits,
  dsl4TurboWarpActionBlockSpecs,
  coreActionCommandForBlock,
  blockError,
  validateBlockArguments,
  sourceValueForBlock,
} from '../core-action-block-codec.js';
export {
  dsl4TurboWarpCoreActionBlockSpecs,
  dsl4TurboWarpActionBlockSpecs,
} from '../core-action-block-codec.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
}

const blockSpecByCommand = new Map(
  dsl4TurboWarpActionBlockSpecs.map((spec) => [spec.command, spec]),
);

const scalarArgumentNames = Object.freeze({
  stage: 'backdrop',
  bgm: 'sound',
  sound: 'sound',
  wait: 'seconds',
  broadcastMessageAndWait: 'message',
  goto: 'scene',
  gotoSegment: 'segment',
  branch: 'branch',
  toggleVariable: 'name',
  setLayer: 'layer',
});

function normalizeBlockArguments(command: string, sourceValue: unknown) {
  if (command === 'debugger') return {};
  if (command === 'setTransparency' && typeof sourceValue === 'number') {
    return {transparency: sourceValue};
  }
  if (Object.hasOwn(scalarArgumentNames, command)) {
    const argumentNames = scalarArgumentNames as Readonly<Record<string, string>>;
    // Guarded by the hasOwn check above.
    return {[argumentNames[command] ?? command]: cloneValue(sourceValue)};
  }
  const normalized = cloneValue(sourceValue) as Record<string, unknown>;
  delete normalized.stableId;
  return normalized;
}

/**
 * Create the public block definitions from the core action manifest.
 *
 */
export function createDsl4TurboWarpCoreActionBlockSurface(
  Scratch: TurboWarpScratchBlockBoundary,
  {visible = false, includeOptIn = true}: {visible?: boolean; includeOptIn?: boolean} = {},
) {
  if (!isRecord(Scratch) || !isRecord(Scratch.ArgumentType) || !isRecord(Scratch.BlockType)) {
    throw new TypeError('TurboWarp action block surface requires ArgumentType and BlockType');
  }
  if (typeof visible !== 'boolean') throw new TypeError('visible must be boolean');
  if (typeof includeOptIn !== 'boolean') throw new TypeError('includeOptIn must be boolean');
  const optIn = new Set(
    dsl4CoreActionManifest
      .filter(({featureFlag}) => featureFlag !== undefined)
      .map(({command}) => command),
  );

  const blocks = createTurboWarpBlockDefinitions(
    Scratch,
    dsl4TurboWarpActionBlockSpecs
      .filter(({command}) => includeOptIn || !optIn.has(command))
      .map((spec) => ({
        opcode: spec.command,
        blockType: 'COMMAND',
        text: spec.text,
        arguments: Object.fromEntries(
          spec.arguments.map((input) => [
            input.name,
            {
              type: input.type === 'number' ? 'NUMBER' : 'STRING',
              defaultValue: input.defaultValue,
              ...(input.menu ? {menu: input.menu} : {}),
            },
          ]),
        ),
      })),
    {
      hideFromPalette: !visible,
      decorateBlock: (definition) =>
        dsl4SceneReferenceOperations.includes(definition.opcode)
          ? {scriptRelations: dsl4SceneRelationReference}
          : {},
    },
  );
  return deepFreeze({
    blocks,
    menus: {
      dsl4VideoSourceType: {acceptReporters: true, items: ['asset', 'url']},
      dsl4VideoPlane: {acceptReporters: true, items: ['front', 'background']},
      dsl4VideoOperation: {acceptReporters: true, items: [...dsl4VideoOperations]},
      dsl4TransitionEffect: {
        acceptReporters: true,
        items: ['fadeOut', 'fadeUp', 'fadeToWhite', 'fadeFromWhite', 'reset'],
      },
      dsl4PresentationEffectScope: {acceptReporters: true, items: ['stage', 'presentation']},
      dsl4MoveEasing: {
        acceptReporters: true,
        items: ['linear', 'easeIn', 'easeOut', 'easeInOut'],
      },
      dsl4RotationStyle: {
        acceptReporters: true,
        items: [...dsl4RotationStyleNames],
      },
      dsl4VariableValueType: {
        acceptReporters: true,
        items: ['string', 'number', 'boolean'],
      },
    },
  });
}

/** The Ajv instance this adapter builds: it registers the DSL 4.0 schema and compiles subschemas. */
interface Dsl4ActionBlockValidator {
  (data: unknown): boolean;
  /** Ajv hangs the failures off the compiled validator itself. */
  errors?: readonly {instancePath?: string; keyword?: string}[] | null;
}

interface Dsl4ActionBlockValidatorFactory {
  addSchema(schema: Readonly<Record<string, unknown>>): unknown;
  getSchema(reference: string): Dsl4ActionBlockValidator | undefined;
}

/** Create a Schema-backed adapter for the public TurboWarp action blocks. */
export function createDsl4TurboWarpCoreActionBlockAdapter(
  schema: Readonly<Record<string, unknown>>,
  options: {maxJsonCharacters?: number; maxJsonDepth?: number; maxJsonNodes?: number} = {},
) {
  if (!isRecord(schema) || !isRecord(schema.$defs)) {
    throw new TypeError('TurboWarp action block adapter requires the DSL 4.0 schema');
  }
  if (!isRecord(options)) throw new TypeError('TurboWarp action block adapter options are invalid');
  const unknownOptions = Object.keys(options).filter(
    (name) => !['maxJsonCharacters', 'maxJsonDepth', 'maxJsonNodes'].includes(name),
  );
  if (unknownOptions.length > 0) {
    throw new TypeError(`Unknown TurboWarp action block adapter option: ${unknownOptions.sort()}`);
  }
  const limits = Object.freeze({
    maxCharacters: options.maxJsonCharacters ?? defaultJsonLimits.maxCharacters,
    maxDepth: options.maxJsonDepth ?? defaultJsonLimits.maxDepth,
    maxNodes: options.maxJsonNodes ?? defaultJsonLimits.maxNodes,
  });
  const maximumLimits = defaultJsonLimits as Readonly<Record<string, number>>;
  for (const [name, value] of Object.entries(limits)) {
    // `limits` starts from the defaults, so every name has a maximum.
    if (!Number.isSafeInteger(value) || value < 1 || value > (maximumLimits[name] ?? 0)) {
      throw new TypeError(`${name} is outside the TurboWarp action JSON limit`);
    }
  }
  // Ajv publishes its constructor through an ESM/CJS interop default that TypeScript resolves as
  // a namespace here, so name the construct signature this module uses.
  const AjvConstructor = Ajv2020 as unknown as new (options: {
    allErrors: boolean;
    strict: boolean;
  }) => Dsl4ActionBlockValidatorFactory;
  const ajv = new AjvConstructor({allErrors: true, strict: true});
  if (typeof schema.$id !== 'string' || schema.$id.length === 0) {
    throw new TypeError('TurboWarp action block adapter schema requires an $id');
  }
  ajv.addSchema(schema);
  const validators = new Map(
    dsl4CoreActionManifest.map((entry) => [
      entry.command,
      ajv.getSchema(`${schema.$id}#/$defs/${entry.schemaDefinition}`),
    ]),
  );
  if ([...validators.values()].some((validate) => typeof validate !== 'function')) {
    throw new TypeError('TurboWarp action block adapter Schema definitions are incomplete');
  }

  function createAction(blockCommand: string, blockArgs: unknown) {
    const command = coreActionCommandForBlock(blockCommand);
    const entry = dsl4CoreActionManifest.find((candidate) => candidate.command === command);
    const spec = blockSpecByCommand.get(blockCommand);
    if (!entry || !spec) {
      throw blockError('K4-BLOCK-ACTION-001', `Unknown TurboWarp action block: ${command}`);
    }
    if (!isRecord(blockArgs)) {
      throw blockError('K4-BLOCK-ACTION-001', `TurboWarp action ${command} arguments are invalid`);
    }
    validateBlockArguments(blockArgs, spec);
    const sourceValue = sourceValueForBlock(blockCommand, blockArgs, limits);
    const target = entry.target === 'actor' ? String(blockArgs.TARGET) : null;
    const sourceAction =
      entry.target === 'actor' ? {[`${target}.${command}`]: sourceValue} : {[command]: sourceValue};
    const validate = validators.get(command);
    if (!validate || !validate(sourceAction)) {
      const first = validate?.errors?.[0];
      const location = first?.instancePath || '$';
      const keyword = first?.keyword || 'schema';
      throw blockError(
        'K4-BLOCK-ACTION-SCHEMA-001',
        `TurboWarp action ${command} failed ${keyword} validation at ${location}`,
      );
    }
    return deepFreeze({
      target,
      command,
      args: normalizeBlockArguments(command, sourceValue),
      handler: 'core',
    });
  }

  return Object.freeze({createAction, limits});
}
