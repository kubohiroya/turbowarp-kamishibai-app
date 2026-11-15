import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'vitest';

import {createDsl4DebugExecutionCoordinator} from '../src/dsl4/debug-execution.js';
import {
  createDsl4TurboWarpDebuggerBridge,
  describeDsl4StoryVariables,
  turboWarpDebuggerLogBlock,
  turboWarpDebuggerPauseBlock,
} from '../src/dsl4/platform/turbowarp-debugger-bridge.js';

/** A TurboWarp runtime whose debugger add-on pauses the clock and emits the pause events. */
function turboWarpRuntime({debuggerAddon = true, playerOnly = false} = {}) {
  const events = new EventEmitter();
  const clock = {_paused: false};
  const logs: string[] = [];
  const blocks: Record<string, {callback: (args: {content?: string}, util: object) => void}> = {
    [turboWarpDebuggerLogBlock]: {callback: ({content}) => logs.push(String(content))},
  };
  if (debuggerAddon) {
    blocks[turboWarpDebuggerPauseBlock] = {
      callback() {
        if (playerOnly) return;
        clock._paused = true;
        events.emit('RUNTIME_PAUSED');
      },
    };
  }
  const runtime = {
    ioDevices: {clock},
    getAddonBlock: (code: string) => blocks[code] ?? null,
    on: (event: string, listener: () => void) => events.on(event, listener),
    removeListener: (event: string, listener: () => void) => events.removeListener(event, listener),
  };
  const resumeInDebugger = () => {
    clock._paused = false;
    events.emit('RUNTIME_UNPAUSED');
  };
  return {runtime, logs, clock, resumeInDebugger};
}

function reachDebugger(
  coordinator: ReturnType<typeof createDsl4DebugExecutionCoordinator>,
  command = 'debugger',
) {
  return coordinator.beforeAction({
    command,
    sceneId: 'opening',
    actionIndex: 2,
    actionPath: 'scenes.opening[2]',
    signal: new AbortController().signal,
  });
}

test('a debugger action pauses the TurboWarp debugger and resumes with it', async () => {
  const {runtime, logs, clock, resumeInDebugger} = turboWarpRuntime();
  const coordinator = createDsl4DebugExecutionCoordinator({enabled: true});
  const bridge = createDsl4TurboWarpDebuggerBridge({
    runtime,
    coordinator,
    locale: 'ja',
    getStoryVariables: () => ({score: 3, name: '浦島'}),
  });
  let resumed = false;
  const pending = reachDebugger(coordinator).then(() => (resumed = true));
  await Promise.resolve();
  assert.equal(clock._paused, true, 'the debugger paused the project');
  assert.equal(coordinator.getState().paused, true, 'the story waits before the action');
  assert.deepEqual(logs, [
    '紙芝居：場面「opening」の 3 番目のアクションの直前で一時停止しました。デバッガーで再開します。',
    '台本の変数: score = 3, name = "浦島"',
  ]);
  assert.equal(resumed, false);

  resumeInDebugger();
  await pending;
  assert.equal(resumed, true);
  assert.equal(coordinator.getState().paused, false);

  // Other actions pass in breakpoints mode, and a later pause is bridged again.
  await reachDebugger(coordinator, 'wait');
  const again = reachDebugger(coordinator);
  await Promise.resolve();
  assert.equal(coordinator.getState().paused, true);
  resumeInDebugger();
  await again;
  bridge.dispose();
  coordinator.dispose();
});

test('without a debugger that can pause, the story passes over the debugger action', async () => {
  for (const options of [{debuggerAddon: false}, {playerOnly: true}]) {
    const {runtime, logs} = turboWarpRuntime(options);
    const coordinator = createDsl4DebugExecutionCoordinator({enabled: true});
    const bridge = createDsl4TurboWarpDebuggerBridge({
      runtime,
      coordinator,
      getStoryVariables: () => ({}),
    });
    await reachDebugger(coordinator);
    assert.equal(coordinator.getState().paused, false, JSON.stringify(options));
    if (options.debuggerAddon === false) {
      assert.deepEqual(logs, [], 'nothing is logged without the add-on');
    }
    bridge.dispose();
    coordinator.dispose();
  }
});

test('a pause the debugger did not start is not resumed by the bridge', async () => {
  const {runtime, resumeInDebugger} = turboWarpRuntime();
  const coordinator = createDsl4DebugExecutionCoordinator({enabled: true});
  const bridge = createDsl4TurboWarpDebuggerBridge({
    runtime,
    coordinator,
    getStoryVariables: () => null,
  });
  bridge.dispose();
  const pending = reachDebugger(coordinator);
  await Promise.resolve();
  resumeInDebugger();
  assert.equal(coordinator.getState().paused, true, 'a disposed bridge leaves the pause alone');
  coordinator.resume();
  await pending;
  coordinator.dispose();
});

test('story variables read as one line in English or Japanese', () => {
  assert.equal(describeDsl4StoryVariables({a: true, b: 'x'}), 'Story variables: a = true, b = "x"');
  assert.equal(describeDsl4StoryVariables(null, 'ja'), '台本の変数: （なし）');
});
