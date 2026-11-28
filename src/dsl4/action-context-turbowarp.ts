import {createTurboWarpExtensionInfo} from '@kubohiroya/turbowarp-extension-manifest';
import {
  dsl4SceneReferenceOperations,
  dsl4SceneRelationReference,
} from './scene-relation-declarations.js';

import type {Dsl4ScratchHost} from './turbowarp-scratch-host.js';

const notRegisteredResult = Object.freeze({registered: false});
const registeredResult = Object.freeze({registered: true});
const featureFlagKeys = new Set(['dsl4CustomActionsEnabled']);
export const dsl4ActionContextBlockIconURI = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 23 53 12l3 11-44 11Z"/><path d="M13 31h42v24H13Z"/></g><path fill="#fff" d="m29 37 14 7-14 7Z"/><path fill="none" stroke="#fff" stroke-width="4" d="m20 20 7 8M34 17l7 8M48 14l6 7"/></svg>',
)}`;

export const dsl4ActionContextDefaultFeatureFlags = Object.freeze({
  dsl4CustomActionsEnabled: false,
});

export const dsl4ActionContextBlockBudget = Object.freeze({
  maximumOverheadBlocksPerHandler: 8,
});

const stringArgument = (defaultValue: string) => Object.freeze({type: 'STRING', defaultValue});

export const dsl4ActionContextManifest = Object.freeze({
  version: 1,
  id: 'kubohiroyakamishibai4actioncontext',
  name: 'Kamishibai Action Context',
  blocks: Object.freeze([
    Object.freeze({
      opcode: 'whenCustomAction',
      blockType: 'HAT',
      text: 'when kamishibai custom action',
      arguments: Object.freeze({}),
    }),
    Object.freeze({
      opcode: 'currentActionName',
      blockType: 'REPORTER',
      text: 'current action name',
      arguments: Object.freeze({}),
    }),
    Object.freeze({
      opcode: 'currentActionTarget',
      blockType: 'REPORTER',
      text: 'current action target',
      arguments: Object.freeze({}),
    }),
    Object.freeze({
      opcode: 'currentActionHasArgument',
      blockType: 'BOOLEAN',
      text: 'current action has argument [NAME]?',
      arguments: Object.freeze({NAME: stringArgument('name')}),
    }),
    Object.freeze({
      opcode: 'currentActionArgument',
      blockType: 'REPORTER',
      text: 'current action argument [NAME]',
      arguments: Object.freeze({NAME: stringArgument('name')}),
    }),
    Object.freeze({
      opcode: 'completeCurrentAction',
      blockType: 'COMMAND',
      text: 'complete current action',
      arguments: Object.freeze({}),
    }),
    Object.freeze({
      opcode: 'failCurrentAction',
      blockType: 'COMMAND',
      text: 'fail current action [MESSAGE]',
      arguments: Object.freeze({MESSAGE: stringArgument('failed')}),
    }),
    Object.freeze({
      opcode: 'gotoFromCurrentAction',
      blockType: 'COMMAND',
      text: 'go to scene [SCENE] from current action',
      arguments: Object.freeze({SCENE: stringArgument('scene')}),
    }),
  ]),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function resolveDsl4ActionContextFeatureFlags(input: unknown = {}) {
  if (!isRecord(input)) throw new TypeError('Action Context feature flags must be an object');
  const unknown = Object.keys(input).filter((key) => !featureFlagKeys.has(key));
  if (unknown.length > 0) {
    throw new TypeError(`Unknown Action Context feature flag: ${unknown.sort().join(', ')}`);
  }
  const resolved = {...dsl4ActionContextDefaultFeatureFlags, ...input};
  if (typeof resolved.dsl4CustomActionsEnabled !== 'boolean') {
    throw new TypeError('dsl4CustomActionsEnabled feature flag must be boolean');
  }
  return Object.freeze(resolved);
}

function castString(Scratch: Dsl4ScratchHost, value: unknown) {
  return Scratch.Cast?.toString ? Scratch.Cast.toString(value) : String(value ?? '');
}

/**
 * Create the startup-fixed Action Context developer surface without registering it eagerly.
 *
 * @param {object} [options]
 * @param {unknown} [options.featureFlags]
 * @param {unknown} [options.Scratch]
 * @param {unknown} [options.adapter]
 * @param {(error: unknown, context: Readonly<{opcode: string}>) => unknown} [options.onError]
 */
export function createDsl4ActionContextTurboWarpSurface(options: unknown = {}) {
  if (!isRecord(options)) throw new TypeError('Action Context options must be an object');
  const featureFlags = resolveDsl4ActionContextFeatureFlags(options.featureFlags);
  if (!featureFlags.dsl4CustomActionsEnabled) {
    return Object.freeze({
      featureFlags,
      manifest: dsl4ActionContextManifest,
      extension: null,
      register: () => notRegisteredResult,
    });
  }

  const Scratch = options.Scratch as Dsl4ScratchHost;
  /** The core action block adapter this context reads the running action through. */
  const adapter = options.adapter as Record<
    | 'currentActionName'
    | 'currentActionTarget'
    | 'currentActionHasArgument'
    | 'currentActionArgument'
    | 'completeCurrentAction'
    | 'failCurrentAction'
    | 'gotoFromCurrentAction',
    (...parameters: unknown[]) => unknown
  >;
  if (
    Scratch?.extensions?.unsandboxed !== true ||
    typeof Scratch.extensions.register !== 'function' ||
    !Scratch.BlockType ||
    !Scratch.ArgumentType
  ) {
    throw new TypeError('Action Context requires an unsandboxed TurboWarp Scratch host');
  }
  for (const name of ['HAT', 'REPORTER', 'BOOLEAN', 'COMMAND']) {
    if (Scratch.BlockType[name] === undefined) {
      throw new TypeError(`Action Context Scratch.BlockType.${name} is required`);
    }
  }
  if (Scratch.ArgumentType.STRING === undefined) {
    throw new TypeError('Action Context Scratch.ArgumentType.STRING is required');
  }
  if (!isRecord(adapter)) throw new TypeError('Action Context adapter must be an object');
  const adapterMethods = [
    'currentActionName',
    'currentActionTarget',
    'currentActionHasArgument',
    'currentActionArgument',
    'completeCurrentAction',
    'failCurrentAction',
    'gotoFromCurrentAction',
  ];
  for (const method of adapterMethods) {
    if (typeof (adapter as Record<string, unknown>)[method] !== 'function') {
      throw new TypeError(`Action Context adapter.${method} is required`);
    }
  }
  const onError = options.onError as
    ((error: unknown, context: Readonly<{opcode: string}>) => unknown) | undefined;
  if (onError !== undefined && typeof onError !== 'function') {
    throw new TypeError('Action Context onError must be a function');
  }

  function contain(opcode: string, fallback: unknown, operation: () => unknown) {
    try {
      return operation();
    } catch (error) {
      try {
        onError?.(error, Object.freeze({opcode}));
      } catch {
        // Error observers cannot change block behavior.
      }
      return fallback;
    }
  }

  const extension = Object.freeze({
    getInfo() {
      return createTurboWarpExtensionInfo(Scratch, dsl4ActionContextManifest, {
        blockIconURI: dsl4ActionContextBlockIconURI,
        color1: '#6c4eb6',
        color2: '#593f99',
        color3: '#47327a',
        disableReporterMonitors: true,
        decorateBlock(definition) {
          if (definition.blockType === 'HAT') return {isEdgeActivated: false};
          return dsl4SceneReferenceOperations.includes(definition.opcode)
            ? {scriptRelations: dsl4SceneRelationReference}
            : {};
        },
      });
    },
    whenCustomAction() {
      return true;
    },
    currentActionName(_args: unknown, util: unknown) {
      return contain('currentActionName', '', () => adapter.currentActionName(util));
    },
    currentActionTarget(_args: unknown, util: unknown) {
      return contain('currentActionTarget', '', () => adapter.currentActionTarget(util));
    },
    currentActionHasArgument(args: unknown, util: unknown) {
      return contain('currentActionHasArgument', false, () =>
        adapter.currentActionHasArgument(
          castString(Scratch, isRecord(args) ? args.NAME : ''),
          util,
        ),
      );
    },
    currentActionArgument(args: unknown, util: unknown) {
      return contain('currentActionArgument', '', () =>
        adapter.currentActionArgument(castString(Scratch, isRecord(args) ? args.NAME : ''), util),
      );
    },
    completeCurrentAction(_args: unknown, util: unknown) {
      contain('completeCurrentAction', undefined, () => adapter.completeCurrentAction(util));
    },
    failCurrentAction(args: unknown, util: unknown) {
      contain('failCurrentAction', undefined, () =>
        adapter.failCurrentAction(castString(Scratch, isRecord(args) ? args.MESSAGE : ''), util),
      );
    },
    gotoFromCurrentAction(args: unknown, util: unknown) {
      contain('gotoFromCurrentAction', undefined, () =>
        adapter.gotoFromCurrentAction(castString(Scratch, isRecord(args) ? args.SCENE : ''), util),
      );
    },
  });

  let registered = false;
  return Object.freeze({
    featureFlags,
    manifest: dsl4ActionContextManifest,
    extension,
    register() {
      if (registered) return notRegisteredResult;
      Scratch.extensions.register(extension);
      registered = true;
      return registeredResult;
    },
  });
}
