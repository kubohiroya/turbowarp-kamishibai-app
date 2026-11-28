import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {
  createDsl4ActionContextTurboWarpSurface,
  createDsl4ActionInvocationAdapter,
  createDsl4ActionRegistrySnapshot,
  dsl4ActionContextBlockIconURI,
  dsl4ActionContextBlockBudget,
  dsl4ActionContextDefaultFeatureFlags,
  dsl4ActionContextManifest,
  resolveDsl4ActionContextFeatureFlags,
} from '../src/dsl4/index.js';

import {requireArray, requireDefined, requireRecord} from './helpers/require-value.ts';
import {deferred} from './helpers/async-test-helpers.ts';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

type ActionContextSurface = ReturnType<typeof createDsl4ActionContextTurboWarpSurface>;

/** The registered extension a surface publishes once the custom-action flag is on. */
function extensionOf(surface: ActionContextSurface) {
  return requireDefined(surface.extension, 'the registered extension');
}

/** The palette blocks one `getInfo` call published. */
function blocksOf(info: unknown): Record<string, unknown>[] {
  return requireArray(requireRecord(info, 'the extension info').blocks, 'its blocks').map((block) =>
    requireRecord(block, 'a published block'),
  );
}

/**
 * The block-budget fixture: one handler per Kamishibai custom action, with the blocks the
 * TurboWarp editor recorded for it.
 */
interface BudgetHandler {
  name: string;
  expectedOverhead: number;
  blocks: {opcode: string; role: string}[];
}

interface BudgetFixture {
  version: number;
  handlers: BudgetHandler[];
}

function fakeScratch() {
  const registered: unknown[] = [];
  const castInputs: unknown[] = [];
  return {
    Scratch: {
      extensions: {
        unsandboxed: true,
        register(extension: unknown) {
          registered.push(extension);
        },
      },
      BlockType: {
        HAT: 'hat',
        REPORTER: 'reporter',
        BOOLEAN: 'Boolean',
        COMMAND: 'command',
      },
      ArgumentType: {STRING: 'string'},
      Cast: {
        toString(value: unknown) {
          castInputs.push(value);
          return String(value ?? '');
        },
      },
    },
    registered,
    castInputs,
  };
}

function fakeAdapter(overrides: Record<string, unknown> = {}) {
  const calls: unknown[][] = [];
  const adapter = {
    currentActionName(util: unknown) {
      calls.push(['currentActionName', util]);
      return 'wave';
    },
    currentActionTarget(util: unknown) {
      calls.push(['currentActionTarget', util]);
      return 'Hero';
    },
    currentActionHasArgument(name: string, util: unknown) {
      calls.push(['currentActionHasArgument', name, util]);
      return name === 'enabled';
    },
    currentActionArgument(name: string, util: unknown) {
      calls.push(['currentActionArgument', name, util]);
      return name === 'count' ? 0 : '';
    },
    completeCurrentAction(util: unknown) {
      calls.push(['completeCurrentAction', util]);
    },
    failCurrentAction(message: unknown, util: unknown) {
      calls.push(['failCurrentAction', message, util]);
    },
    gotoFromCurrentAction(scene: unknown, util: unknown) {
      calls.push(['gotoFromCurrentAction', scene, util]);
    },
    ...overrides,
  };
  return {adapter, calls};
}

test('freezes the exact Action Context developer palette and default-off flag', () => {
  assert.deepEqual(dsl4ActionContextDefaultFeatureFlags, {dsl4CustomActionsEnabled: false});
  assert.deepEqual(resolveDsl4ActionContextFeatureFlags(), dsl4ActionContextDefaultFeatureFlags);
  assert.deepEqual(resolveDsl4ActionContextFeatureFlags({dsl4CustomActionsEnabled: true}), {
    dsl4CustomActionsEnabled: true,
  });
  assert.throws(() => resolveDsl4ActionContextFeatureFlags({unknown: true}), /Unknown/u);
  assert.throws(
    () => resolveDsl4ActionContextFeatureFlags({dsl4CustomActionsEnabled: 1}),
    /must be boolean/u,
  );
  assert.deepEqual(dsl4ActionContextManifest, {
    version: 1,
    id: 'kubohiroyakamishibai4actioncontext',
    name: 'Kamishibai Action Context',
    blocks: [
      {
        opcode: 'whenCustomAction',
        blockType: 'HAT',
        text: 'when kamishibai custom action',
        arguments: {},
      },
      {
        opcode: 'currentActionName',
        blockType: 'REPORTER',
        text: 'current action name',
        arguments: {},
      },
      {
        opcode: 'currentActionTarget',
        blockType: 'REPORTER',
        text: 'current action target',
        arguments: {},
      },
      {
        opcode: 'currentActionHasArgument',
        blockType: 'BOOLEAN',
        text: 'current action has argument [NAME]?',
        arguments: {NAME: {type: 'STRING', defaultValue: 'name'}},
      },
      {
        opcode: 'currentActionArgument',
        blockType: 'REPORTER',
        text: 'current action argument [NAME]',
        arguments: {NAME: {type: 'STRING', defaultValue: 'name'}},
      },
      {
        opcode: 'completeCurrentAction',
        blockType: 'COMMAND',
        text: 'complete current action',
        arguments: {},
      },
      {
        opcode: 'failCurrentAction',
        blockType: 'COMMAND',
        text: 'fail current action [MESSAGE]',
        arguments: {MESSAGE: {type: 'STRING', defaultValue: 'failed'}},
      },
      {
        opcode: 'gotoFromCurrentAction',
        blockType: 'COMMAND',
        text: 'go to scene [SCENE] from current action',
        arguments: {SCENE: {type: 'STRING', defaultValue: 'scene'}},
      },
    ],
  });
  assert.equal(Object.isFrozen(dsl4ActionContextManifest), true);
  assert.equal(Object.isFrozen(dsl4ActionContextManifest.blocks), true);
  assert.equal(
    Object.isFrozen(
      requireRecord(
        requireDefined(dsl4ActionContextManifest.blocks[3], 'the fourth block').arguments,
        'its arguments',
      ).NAME,
    ),
    true,
  );
  assert.deepEqual(dsl4ActionContextBlockBudget, {maximumOverheadBlocksPerHandler: 8});
});

test('keeps the surface inert while disabled without inspecting Scratch or the adapter', () => {
  const options = {featureFlags: {}};
  for (const name of ['Scratch', 'adapter', 'onError']) {
    Object.defineProperty(options, name, {
      get: () => assert.fail(`disabled surface inspected ${name}`),
    });
  }
  const surface = createDsl4ActionContextTurboWarpSurface(options);
  assert.equal(surface.extension, null);
  assert.equal(surface.manifest, dsl4ActionContextManifest);
  assert.deepEqual(surface.register(), {registered: false});
  assert.equal(Object.isFrozen(surface), true);
});

test('rejects sandboxed, incomplete, and malformed enabled boundaries before registration', () => {
  const {Scratch} = fakeScratch();
  const {adapter} = fakeAdapter();
  const enabled = {dsl4CustomActionsEnabled: true};
  const sandboxed = {...Scratch, extensions: {...Scratch.extensions, unsandboxed: false}};
  assert.throws(
    () =>
      createDsl4ActionContextTurboWarpSurface({
        Scratch: sandboxed,
        adapter,
        featureFlags: enabled,
      }),
    /unsandboxed/u,
  );
  assert.throws(
    () =>
      createDsl4ActionContextTurboWarpSurface({
        Scratch,
        adapter: {...adapter, currentActionArgument: null},
        featureFlags: enabled,
      }),
    /currentActionArgument/u,
  );
  assert.throws(
    () =>
      createDsl4ActionContextTurboWarpSurface({
        Scratch,
        adapter,
        featureFlags: enabled,
        onError: true,
      }),
    /onError/u,
  );
});

test('maps Scratch inputs and thread util to the adapter without casting typed outputs', () => {
  const {Scratch, registered, castInputs} = fakeScratch();
  const {adapter, calls} = fakeAdapter();
  const surface = createDsl4ActionContextTurboWarpSurface({
    Scratch,
    adapter,
    featureFlags: {dsl4CustomActionsEnabled: true},
  });
  const info = extensionOf(surface).getInfo();
  const util = {thread: {id: 'thread'}};

  assert.equal(info.id, dsl4ActionContextManifest.id);
  assert.equal(info.blockIconURI, dsl4ActionContextBlockIconURI);
  const iconSvg = decodeURIComponent(
    dsl4ActionContextBlockIconURI.slice('data:image/svg+xml,'.length),
  );
  assert.match(iconSvg, /viewBox="0 0 64 64"/u);
  assert.match(iconSvg, /m29 37 14 7-14 7Z/u);
  assert.doesNotMatch(iconSvg, /<rect/u);
  assert.deepEqual(
    blocksOf(info).map(({opcode, blockType}) => [opcode, blockType]),
    dsl4ActionContextManifest.blocks.map(({opcode, blockType}) => [
      opcode,
      Scratch.BlockType[blockType],
    ]),
  );
  assert.equal(requireDefined(blocksOf(info)[0], 'block 0').isEdgeActivated, false);
  assert.equal(requireDefined(blocksOf(info)[1], 'block 1').disableMonitor, true);
  assert.equal(requireDefined(blocksOf(info)[3], 'block 3').disableMonitor, undefined);
  // The Plus Editor draws a reference arrow from this block to the scene block it names.
  assert.deepEqual(
    blocksOf(info)
      .filter((block) => block.scriptRelations !== undefined)
      .map(({opcode, scriptRelations}) => [opcode, scriptRelations]),
    [
      [
        'gotoFromCurrentAction',
        {references: [{channel: 'kubohiroya.kamishibai4.scene', argument: 'SCENE'}]},
      ],
    ],
  );
  assert.equal(extensionOf(surface).whenCustomAction(), true);
  assert.equal(extensionOf(surface).currentActionName({}, util), 'wave');
  assert.equal(extensionOf(surface).currentActionTarget({}, util), 'Hero');
  assert.equal(extensionOf(surface).currentActionHasArgument({NAME: 'enabled'}, util), true);
  assert.equal(extensionOf(surface).currentActionArgument({NAME: 'count'}, util), 0);
  extensionOf(surface).completeCurrentAction({}, util);
  extensionOf(surface).failCurrentAction({MESSAGE: 404}, util);
  extensionOf(surface).gotoFromCurrentAction({SCENE: 2}, util);

  assert.deepEqual(castInputs, ['enabled', 'count', 404, 2]);
  assert.deepEqual(calls, [
    ['currentActionName', util],
    ['currentActionTarget', util],
    ['currentActionHasArgument', 'enabled', util],
    ['currentActionArgument', 'count', util],
    ['completeCurrentAction', util],
    ['failCurrentAction', '404', util],
    ['gotoFromCurrentAction', '2', util],
  ]);
  assert.deepEqual(surface.register(), {registered: true});
  assert.deepEqual(surface.register(), {registered: false});
  assert.deepEqual(registered, [surface.extension]);
});

test('contains reporter context errors and retries registration after a host failure', () => {
  const observed: unknown[] = [];
  const {Scratch, registered} = fakeScratch();
  let attempts = 0;
  Scratch.extensions.register = (extension) => {
    attempts += 1;
    if (attempts === 1) throw new Error('injected registration failure');
    registered.push(extension);
  };
  const {adapter} = fakeAdapter({
    currentActionName() {
      throw new Error('private context details');
    },
  });
  const surface = createDsl4ActionContextTurboWarpSurface({
    Scratch,
    adapter,
    featureFlags: {dsl4CustomActionsEnabled: true},
    onError(error: unknown, context: unknown) {
      observed.push([error, context]);
      throw new Error('observer failure');
    },
  });

  assert.equal(extensionOf(surface).currentActionName({}, {thread: {}}), '');
  assert.equal(observed.length, 1);
  const observedContext = requireRecord(
    requireArray(requireDefined(observed[0], 'the first observation'), 'its entries')[1],
    'its context',
  );
  assert.equal(observedContext.opcode, 'currentActionName');
  assert.equal(Object.isFrozen(observedContext), true);
  assert.throws(() => surface.register(), /injected registration failure/u);
  assert.deepEqual(surface.register(), {registered: true});
  assert.deepEqual(surface.register(), {registered: false});
  assert.equal(attempts, 2);
});

test('distinguishes omitted optional arguments from false, zero, and an empty string end to end', async () => {
  const registration = createDsl4ActionRegistrySnapshot([
    {
      name: 'wave',
      target: 'actor',
      parameters: [
        {name: 'label', type: 'string'},
        {name: 'count', type: 'number', required: false},
        {name: 'enabled', type: 'boolean', required: false},
        {name: 'caption', type: 'string', required: false},
      ],
      source: {targetId: 'target', hatBlockId: 'hat'},
    },
  ]);
  const completion = deferred<void>();
  const thread = {id: 'primary'};
  const adapter = createDsl4ActionInvocationAdapter({
    registrySnapshot: registration,
    storyDocument: {
      kind: 'StoryDocument',
      version: '4.0',
      scenes: [{id: 'opening', actions: []}],
    },
    runtimeGeneration: 1,
    customActionTimeoutMs: 1_000,
    threadHost: {
      start() {
        return [thread];
      },
      waitForCompletion() {
        return completion.promise;
      },
      stop() {
        completion.resolve();
      },
    },
  });
  const {Scratch} = fakeScratch();
  const surface = createDsl4ActionContextTurboWarpSurface({
    Scratch,
    adapter,
    featureFlags: {dsl4CustomActionsEnabled: true},
  });
  const result = adapter.customAction(
    {
      name: 'wave',
      target: 'Hero',
      arguments: {label: '', count: 0, enabled: false},
    },
    {
      actionPath: '/scenes/opening/actions/0',
      signal: new AbortController().signal,
      structuredData: {actionScopeRef: '@scope', actionViewRef: '@action'},
    },
  );
  const util = {thread};

  assert.equal(extensionOf(surface).currentActionHasArgument({NAME: 'label'}, util), true);
  assert.equal(extensionOf(surface).currentActionArgument({NAME: 'label'}, util), '');
  assert.equal(extensionOf(surface).currentActionHasArgument({NAME: 'count'}, util), true);
  assert.equal(extensionOf(surface).currentActionArgument({NAME: 'count'}, util), 0);
  assert.equal(extensionOf(surface).currentActionHasArgument({NAME: 'enabled'}, util), true);
  assert.equal(extensionOf(surface).currentActionArgument({NAME: 'enabled'}, util), false);
  assert.equal(extensionOf(surface).currentActionHasArgument({NAME: 'caption'}, util), false);
  assert.equal(extensionOf(surface).currentActionArgument({NAME: 'caption'}, util), '');

  extensionOf(surface).completeCurrentAction({}, util);
  assert.deepEqual(await result, {outcome: 'completed'});
  await adapter.dispose();
});

test('keeps every fixture handler within the eight-block Kamishibai overhead budget', async () => {
  const fixture: BudgetFixture = JSON.parse(
    await readFile(
      path.join(projectRoot, 'test', 'fixtures', 'dsl4', 'custom-action-block-budget.json'),
      'utf8',
    ),
  );
  const contextOpcodes = new Set<string>(
    dsl4ActionContextManifest.blocks.map((definition) => definition.opcode),
  );
  assert.equal(fixture.version, 1);
  assert.deepEqual(
    fixture.handlers.map(({name}) => name),
    [
      'implicit-no-argument',
      'target-reporter',
      'required-argument',
      'optional-argument',
      'explicit-complete',
      'explicit-fail',
      'explicit-goto',
    ],
  );

  for (const handler of fixture.handlers) {
    const contextBlocks = handler.blocks.filter(({opcode}) => contextOpcodes.has(opcode));
    const overhead = handler.blocks.filter(({role}) => role !== 'performance');
    assert.equal(contextBlocks[0]?.opcode, 'whenCustomAction', handler.name);
    assert.equal(
      contextBlocks.every(({role}) => role !== 'performance'),
      true,
      handler.name,
    );
    assert.equal(overhead.length, handler.expectedOverhead, handler.name);
    assert.ok(
      overhead.length <= dsl4ActionContextBlockBudget.maximumOverheadBlocksPerHandler,
      handler.name,
    );
    assert.equal(
      handler.blocks.some(({opcode}) =>
        /(?:register|temporary|waitUntilComplete|releaseScope|jsonPath|iterator)/iu.test(opcode),
      ),
      false,
      handler.name,
    );
  }
});
