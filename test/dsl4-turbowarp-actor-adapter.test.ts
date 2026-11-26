import assert from 'node:assert/strict';
import {test} from 'vitest';

import {
  createDsl4ActorActionPort,
  createDsl4TurboWarpActorPlatform,
} from '../src/dsl4/platform/index.js';
import {createTestTurboWarpRuntimeHost} from './helpers/turbowarp-runtime-host.ts';
import {requireArray, requireRecord, requireString} from './helpers/require-value.ts';
import {thrown} from './helpers/thrown-error.ts';

type ActorPlatformOptions = Parameters<typeof createDsl4TurboWarpActorPlatform>[0];

/** The `[member, ...arguments]` rows the fakes record. */
type RecordedCall = [string, ...unknown[]];

/**
 * The TurboWarp target a case drives.
 *
 * The platform reads targets from the injected host as opaque values, so this names the members the
 * fake writes back -- the ones a case then asserts on.
 */
interface FakeTarget {
  id: string;
  name?: string;
  isStage: boolean;
  x: number;
  y: number;
  size?: number;
  visible?: boolean;
  effects?: Record<string, number>;
  lookupVariableByNameAndType(name: string, type: string): {value: string} | undefined;
  setXY(nextX: number, nextY: number): void;
  setSize(size: number): void;
  setVisible(visible: boolean): void;
  setEffect(effect: string, value: number): void;
  direction?: number;
  rotationStyle?: string;
  setDirection?(direction: number): void;
  setRotationStyle?(style: string): void;
  goToFront(): void;
  goToBack(): void;
  goForwardLayers(count: number): void;
  goBackwardLayers(count: number): void;
}

/**
 * Pass platform options the declaration refuses on purpose.
 *
 * One case asserts that the platform rejects a host without a runtime, a malformed target list, and
 * a missing or partial Bubble composition -- all of which its own types already forbid.
 */
function invalidPlatformOptions(options: Record<string, unknown>): ActorPlatformOptions {
  return options as unknown as ActorPlatformOptions;
}

function fakeActor({
  id = 'hero-target',
  actorName = 'Hero',
  name,
  x = 0,
  y = 0,
  rotation = true,
}: {
  id?: string;
  actorName?: string | null;
  name?: string;
  x?: number;
  y?: number;
  /** A host too old to turn its actors leaves these methods out. */
  rotation?: boolean;
} = {}) {
  const calls: RecordedCall[] = [];
  const target: FakeTarget = {
    id,
    ...(name === undefined ? {} : {name}),
    isStage: false,
    x,
    y,
    lookupVariableByNameAndType(variableName: string, type: string) {
      calls.push(['lookupVariableByNameAndType', variableName, type]);
      return variableName === 'actorName' && type === '' && actorName !== null
        ? {value: actorName}
        : undefined;
    },
    setXY(nextX: number, nextY: number) {
      calls.push(['setXY', nextX, nextY]);
      target.x = nextX;
      target.y = nextY;
    },
    setSize(size: number) {
      calls.push(['setSize', size]);
      target.size = size;
    },
    setVisible(visible: boolean) {
      calls.push(['setVisible', visible]);
      target.visible = visible;
    },
    setEffect(effect: string, value: number) {
      calls.push(['setEffect', effect, value]);
    },
    ...(rotation
      ? {
          setDirection(direction: number) {
            calls.push(['setDirection', direction]);
            target.direction = direction;
          },
          setRotationStyle(style: string) {
            calls.push(['setRotationStyle', style]);
            target.rotationStyle = style;
          },
        }
      : {}),
    goToFront() {
      calls.push(['goToFront']);
    },
    goToBack() {
      calls.push(['goToBack']);
    },
    goForwardLayers(count: number) {
      calls.push(['goForwardLayers', count]);
    },
    goBackwardLayers(count: number) {
      calls.push(['goBackwardLayers', count]);
    },
  };
  return {calls, target};
}

function manualScheduler() {
  let currentTime = 0;
  let nextId = 1;
  const timers = new Map<number, {callback: () => void; due: number}>();
  const calls: RecordedCall[] = [];
  const scheduler = {
    now() {
      return currentTime;
    },
    setTimeout(callback: () => void, milliseconds: number) {
      const id = nextId;
      nextId += 1;
      calls.push(['setTimeout', id, milliseconds]);
      timers.set(id, {callback, due: currentTime + milliseconds});
      return id;
    },
    clearTimeout(id: number) {
      calls.push(['clearTimeout', id]);
      timers.delete(id);
    },
  };
  return {
    calls,
    scheduler,
    pendingCount: () => timers.size,
    advance(milliseconds: number) {
      const targetTime = currentTime + milliseconds;
      while (true) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.due <= targetTime)
          .sort((left, right) => left[1].due - right[1].due || left[0] - right[0])[0];
        if (!next) break;
        const [id, timer] = next;
        timers.delete(id);
        currentTime = timer.due;
        timer.callback();
      }
      currentTime = targetTime;
    },
  };
}

/**
 * Record what Bubble was asked to display. Bubble owns every say and think, so one entry is the
 * visible text of one update and an empty entry is the bubble closing.
 */
function fakeBubbleComposition(bubbleCalls: [unknown, unknown][]) {
  return {
    async show({actor, text}: {actor: FakeTarget; text: unknown}) {
      bubbleCalls.push([text, actor.id]);
      return {
        async setText(next: unknown) {
          bubbleCalls.push([next, actor.id]);
        },
        async setAnimationMode() {},
        async revealNext() {
          return false;
        },
        async revealAll() {},
        async animate() {},
        async finish() {},
        async close() {
          bubbleCalls.push(['', actor.id]);
        },
      };
    },
    async releaseAll() {},
  };
}

function fakeRuntime(targets: readonly unknown[]) {
  const bubbleCalls: [unknown, unknown][] = [];
  const runtime = {targets};
  return {
    bubbleCalls,
    runtime,
    runtimeHost: createTestTurboWarpRuntimeHost(runtime),
    bubbleComposition: fakeBubbleComposition(bubbleCalls),
  };
}

/** Await the Bubble presentation chain, which queues every update on its own promise tail. */
async function settleBubble() {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
}

test('resolves one actorName target and applies show transform and visibility', () => {
  const hero = fakeActor();
  const other = fakeActor({id: 'other-target', actorName: 'Other'});
  const stage = {id: 'stage', isStage: true};
  const fake = fakeRuntime([stage, other.target, hero.target]);
  const clock = manualScheduler();
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
    scheduler: clock.scheduler,
  });

  const resolved = platform.resolveActor('Hero');
  platform.host.showActor(resolved, {x: 10, y: -20, scale: 30});

  assert.equal(Object.isFrozen(platform), true);
  assert.equal(Object.isFrozen(platform.host), true);
  assert.equal(resolved, hero.target);
  assert.deepEqual(hero.calls.slice(-3), [
    ['setXY', 10, -20],
    ['setSize', 30],
    ['setVisible', true],
  ]);
});

test('resolves a standalone DSL 4.0 actor by its project target name', () => {
  const hero = fakeActor({actorName: null, name: 'Hero'});
  const fake = fakeRuntime([hero.target]);
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
  });

  assert.equal(platform.resolveActor('Hero'), hero.target);
});

test('binds an implicit actor to the exact sprite name even when another sprite has a matching actorName', () => {
  const physical = fakeActor({actorName: null, name: 'Hero'});
  const alias = fakeActor({id: 'alias', actorName: 'Hero', name: 'Other'});
  const fake = fakeRuntime([physical.target, alias.target]);
  const explicit = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
  });
  assert.equal(explicit.resolveActor('Hero'), alias.target);
  const implicit = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
    implicitProjectActors: ['Hero'],
  });
  assert.equal(implicit.resolveActor('Hero'), physical.target);
  fake.runtime.targets = [
    ...fake.runtime.targets,
    {...physical.target, id: 'clone', isOriginal: false},
  ];
  assert.equal(implicit.resolveActor('Hero'), physical.target);
});

test('resets implicit actors to native costume zero at each story start without resetting explicit actors', () => {
  const calls: number[] = [];
  const hero = fakeActor({actorName: null, name: 'Hero'});
  const target = {
    ...hero.target,
    setCostume(index: number) {
      calls.push(index);
    },
  };
  const fake = fakeRuntime([target]);
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
    implicitProjectActors: ['Hero'],
  });
  platform.resetImplicitActorCostumes();
  platform.resolveActor('Hero');
  assert.deepEqual(calls, [0]);
  platform.resetImplicitActorCostumes();
  assert.deepEqual(calls, [0, 0]);
});

test('applies hide, scale, and absolute or relative layer changes to one actor', () => {
  const hero = fakeActor();
  const fake = fakeRuntime([hero.target]);
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
  });

  platform.host.hideActor(platform.resolveActor('Hero'));
  platform.host.setActorScale(hero.target, 45);
  for (const layer of ['front', 'back', 2, -3]) {
    platform.host.setActorLayer(hero.target, layer);
  }

  assert.deepEqual(hero.calls.slice(-6), [
    ['setVisible', false],
    ['setSize', 45],
    ['goToFront'],
    ['goToBack'],
    ['goForwardLayers', 2],
    ['goBackwardLayers', 3],
  ]);
});

test('maps transparency 0, 50, and 100 directly to the Scratch ghost effect', () => {
  const hero = fakeActor();
  const fake = fakeRuntime([hero.target]);
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
  });

  for (const transparency of [0, 50, 100]) {
    platform.host.setTransparency(hero.target, {transparency});
  }

  assert.deepEqual(
    hero.calls.filter(([method]) => method === 'setEffect'),
    [
      ['setEffect', 'ghost', 0],
      ['setEffect', 'ghost', 50],
      ['setEffect', 'ghost', 100],
    ],
  );
});

test('linearly interpolates transparency from 0 to 50', async () => {
  const hero = fakeActor();
  const fake = fakeRuntime([hero.target]);
  const clock = manualScheduler();
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
    scheduler: clock.scheduler,
    frameMilliseconds: 500,
  });
  const operation = platform.host.createTransparencyTransition(hero.target, {
    from: 0,
    to: 50,
    seconds: 1,
  });
  const pending = operation.start();

  assert.deepEqual(hero.calls.at(-1), ['setEffect', 'ghost', 0]);
  clock.advance(500);
  assert.deepEqual(hero.calls.at(-1), ['setEffect', 'ghost', 25]);
  assert.equal(clock.pendingCount(), 1);
  clock.advance(500);
  await pending;

  assert.deepEqual(
    hero.calls.filter(([method]) => method === 'setEffect'),
    [
      ['setEffect', 'ghost', 0],
      ['setEffect', 'ghost', 25],
      ['setEffect', 'ghost', 50],
    ],
  );
  assert.equal(clock.pendingCount(), 0);
});

test('crossfades actor visibility and restores the authored ghost baseline', async () => {
  const hero = fakeActor();
  hero.target.effects = {ghost: 20};
  const fake = fakeRuntime([hero.target]);
  const clock = manualScheduler();
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
    scheduler: clock.scheduler,
    frameMilliseconds: 500,
  });

  const show = platform.host.createVisibilityTransition(hero.target, {
    visible: true,
    seconds: 1,
    easing: 'linear',
  });
  const showing = show.start();
  clock.advance(500);
  assert.deepEqual(hero.calls.at(-1), ['setEffect', 'ghost', 60]);
  clock.advance(500);
  await showing;
  assert.deepEqual(hero.calls.slice(-2), [
    ['setVisible', true],
    ['setEffect', 'ghost', 20],
  ]);

  const hide = platform.host.createVisibilityTransition(hero.target, {
    visible: false,
    seconds: 1,
    easing: 'linear',
  });
  const hiding = hide.start();
  clock.advance(500);
  assert.deepEqual(hero.calls.at(-1), ['setEffect', 'ghost', 60]);
  clock.advance(500);
  await hiding;
  assert.deepEqual(hero.calls.slice(-3), [
    ['setEffect', 'ghost', 100],
    ['setVisible', false],
    ['setEffect', 'ghost', 20],
  ]);
});

test('transparency finish synchronously commits the final state and cancels its timer', async () => {
  const hero = fakeActor();
  const fake = fakeRuntime([hero.target]);
  const clock = manualScheduler();
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
    scheduler: clock.scheduler,
    frameMilliseconds: 250,
  });
  const operation = platform.host.createTransparencyTransition(hero.target, {
    from: 0,
    to: 50,
    seconds: 1,
  });
  const pending = operation.start();
  clock.advance(250);
  operation.finish();

  assert.deepEqual(hero.calls.at(-1), ['setEffect', 'ghost', 50]);
  assert.equal(clock.pendingCount(), 0);
  await pending;
  const effectCallCount = hero.calls.filter(([method]) => method === 'setEffect').length;
  clock.advance(2000);
  operation.finish();
  assert.equal(hero.calls.filter(([method]) => method === 'setEffect').length, effectCallCount);
});

test('keeps foreground transparency pending until finalization retry succeeds', async () => {
  const hero = fakeActor();
  const originalSetEffect = hero.target.setEffect.bind(hero.target);
  let finalizationFailures = 1;
  hero.target.setEffect = (effect, value) => {
    originalSetEffect(effect, value);
    if (value === 50 && finalizationFailures > 0) {
      finalizationFailures -= 1;
      throw new Error('finalization failed');
    }
  };
  const fake = fakeRuntime([hero.target]);
  const clock = manualScheduler();
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
    scheduler: clock.scheduler,
  });
  const operation = platform.host.createTransparencyTransition(hero.target, {
    from: 0,
    to: 50,
    seconds: 1,
  });
  const pending = operation.start();
  let settlement = 'pending';
  void pending.then(
    () => {
      settlement = 'resolved';
    },
    () => {
      settlement = 'rejected';
    },
  );

  assert.throws(() => operation.finish(), /finalization failed/u);
  await Promise.resolve();
  assert.equal(settlement, 'pending');
  assert.equal(clock.pendingCount(), 0);

  operation.finish();
  await pending;
  assert.equal(settlement, 'resolved');
  assert.deepEqual(
    hero.calls.filter(([method]) => method === 'setEffect'),
    [
      ['setEffect', 'ghost', 0],
      ['setEffect', 'ghost', 50],
      ['setEffect', 'ghost', 50],
    ],
  );
});

test('retains failed background finalization and retries it at each lifecycle boundary', async () => {
  const hero = fakeActor();
  const originalSetEffect = hero.target.setEffect.bind(hero.target);
  let interpolationFailures = 1;
  let finalizationFailures = 2;
  hero.target.setEffect = (effect, value) => {
    originalSetEffect(effect, value);
    if (value === 25 && interpolationFailures > 0) {
      interpolationFailures -= 1;
      throw new Error('interpolation failed');
    }
    if (value === 50 && finalizationFailures > 0) {
      finalizationFailures -= 1;
      throw new Error('finalization failed');
    }
  };
  const fake = fakeRuntime([hero.target]);
  const clock = manualScheduler();
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
    scheduler: clock.scheduler,
    frameMilliseconds: 500,
  });
  const operation = platform.host.createTransparencyTransition(hero.target, {
    from: 0,
    to: 50,
    seconds: 1,
  });
  operation.startBackground();

  clock.advance(500);
  await Promise.resolve();
  assert.equal(clock.pendingCount(), 0);
  assert.throws(
    () => platform.finishTransparencyTransitions(),
    /transparency transition cleanup failed/u,
  );

  platform.finishTransparencyTransitions();
  assert.deepEqual(hero.calls.at(-1), ['setEffect', 'ghost', 50]);
  const effectCallCount = hero.calls.filter(([method]) => method === 'setEffect').length;
  platform.finishTransparencyTransitions();
  assert.equal(hero.calls.filter(([method]) => method === 'setEffect').length, effectCallCount);
});

test('new transitions and platform cleanup finish the previous actor transition first', async () => {
  const hero = fakeActor();
  const fake = fakeRuntime([hero.target]);
  const clock = manualScheduler();
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
    scheduler: clock.scheduler,
    frameMilliseconds: 250,
  });
  const first = platform.host.createTransparencyTransition(hero.target, {
    from: 0,
    to: 50,
    seconds: 1,
  });
  const second = platform.host.createTransparencyTransition(hero.target, {
    from: 60,
    to: 80,
    seconds: 1,
  });
  const firstPending = first.start();
  clock.advance(250);
  const secondPending = second.start();
  await firstPending;

  assert.deepEqual(hero.calls.filter(([method]) => method === 'setEffect').slice(-2), [
    ['setEffect', 'ghost', 50],
    ['setEffect', 'ghost', 60],
  ]);
  assert.equal(clock.pendingCount(), 1);

  platform.finishTransparencyTransitions();
  assert.deepEqual(hero.calls.at(-1), ['setEffect', 'ghost', 80]);
  assert.equal(clock.pendingCount(), 0);
  await secondPending;

  const third = platform.host.createTransparencyTransition(hero.target, {
    from: 80,
    to: 90,
    seconds: 1,
  });
  const thirdPending = third.start();
  platform.dispose();
  assert.deepEqual(hero.calls.at(-1), ['setEffect', 'ghost', 90]);
  assert.equal(clock.pendingCount(), 0);
  await thirdPending;
  assert.throws(() => platform.resolveActor('Hero'), /disposed/u);
});

test('interpolates moveTo and completes exactly at the destination', async () => {
  const hero = fakeActor({x: 0, y: 10});
  const fake = fakeRuntime([hero.target]);
  const clock = manualScheduler();
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
    scheduler: clock.scheduler,
    frameMilliseconds: 500,
  });
  const operation = platform.host.createMove(hero.target, {x: 100, y: 50, seconds: 1});
  const pending = operation.start();

  clock.advance(500);
  assert.equal(hero.target.x, 50);
  assert.equal(hero.target.y, 30);
  assert.equal(clock.pendingCount(), 1);
  clock.advance(500);
  await pending;

  assert.equal(hero.target.x, 100);
  assert.equal(hero.target.y, 50);
  assert.equal(clock.pendingCount(), 0);
  assert.equal(hero.calls.filter(([method]) => method === 'setXY').length, 2);
});

test('applies named moveTo easing curves to normalized elapsed time', async () => {
  const expectedQuarterProgress = {
    linear: 0.25,
    easeIn: 0.0625,
    easeOut: 0.4375,
    easeInOut: 0.125,
  };

  for (const [easing, expectedProgress] of Object.entries(expectedQuarterProgress)) {
    const hero = fakeActor({x: 0, y: 100});
    const fake = fakeRuntime([hero.target]);
    const clock = manualScheduler();
    const platform = createDsl4TurboWarpActorPlatform({
      runtimeHost: fake.runtimeHost,
      bubbleComposition: fake.bubbleComposition,
      scheduler: clock.scheduler,
      frameMilliseconds: 250,
    });
    const pending = platform.host
      .createMove(hero.target, {x: 100, y: -100, seconds: 1, easing})
      .start();

    clock.advance(250);
    assert.equal(hero.target.x, 100 * expectedProgress, easing);
    assert.equal(hero.target.y, 100 - 200 * expectedProgress, easing);
    clock.advance(750);
    await pending;
    assert.equal(hero.target.x, 100, easing);
    assert.equal(hero.target.y, -100, easing);
    assert.equal(clock.pendingCount(), 0, easing);
  }
});

test('moveTo finish synchronously cancels its timer and commits the destination once', async () => {
  const hero = fakeActor({x: -10, y: -20});
  const fake = fakeRuntime([hero.target]);
  const clock = manualScheduler();
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
    scheduler: clock.scheduler,
    frameMilliseconds: 100,
  });
  const operation = platform.host.createMove(hero.target, {x: 20, y: 40, seconds: 1});
  const pending = operation.start();
  operation.finish();

  assert.equal(hero.target.x, 20);
  assert.equal(hero.target.y, 40);
  assert.equal(clock.pendingCount(), 0);
  await pending;
  const setXYCount = hero.calls.filter(([method]) => method === 'setXY').length;
  clock.advance(2000);
  operation.finish();
  assert.equal(hero.calls.filter(([method]) => method === 'setXY').length, setXYCount);
});

test('shows and clears say on timeout or synchronous finish', async () => {
  const hero = fakeActor();
  const fake = fakeRuntime([hero.target]);
  const clock = manualScheduler();
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
    scheduler: clock.scheduler,
  });
  const timed = platform.host.createSay(hero.target, {text: '助けに行こう', seconds: 2});
  const timedPending = timed.start();
  await settleBubble();
  assert.deepEqual(fake.bubbleCalls, [['助けに行こう', 'hero-target']]);
  clock.advance(2000);
  await timedPending;
  assert.deepEqual(fake.bubbleCalls, [
    ['助けに行こう', 'hero-target'],
    ['', 'hero-target'],
  ]);

  const skipped = platform.host.createSay(hero.target, {text: '待って', seconds: 5});
  const skippedPending = skipped.start();
  skipped.finish();
  assert.equal(clock.pendingCount(), 0);
  await skippedPending;
  assert.deepEqual(fake.bubbleCalls.slice(-2), [
    ['待って', 'hero-target'],
    ['', 'hero-target'],
  ]);
  clock.advance(5000);
  assert.deepEqual(fake.bubbleCalls.at(-1), ['', 'hero-target']);
});

test('renders typewriter speech through one Bubble handle and closes it on advance', async () => {
  const hero = fakeActor();
  const clock = manualScheduler();
  const calls: RecordedCall[] = [];
  const handle = {
    async setText(text: unknown) {
      calls.push(['setText', text]);
    },
    async setAnimationMode(mode: unknown) {
      calls.push(['setAnimationMode', mode]);
    },
    async close() {
      calls.push(['close']);
    },
  };
  const bubbleComposition = {
    async show(input: unknown) {
      calls.push(['show', input]);
      return handle;
    },
    async releaseAll() {},
  };
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: createTestTurboWarpRuntimeHost({targets: [hero.target]}),
    scheduler: clock.scheduler,
    speechAdvanceTypewriterEnabled: true,
    bubbleComposition,
  });
  const operation = platform.host.createThink(hero.target, {
    text: '浦島',
    waitFor: 'advance',
    bubbleStyle: 'dialogue',
    characterIntervalSeconds: 0.1,
  });
  const pending = operation.start();
  for (let flush = 0; flush < 8; flush += 1) await Promise.resolve();

  assert.deepEqual(calls[0], [
    'show',
    {
      actor: hero.target,
      actorKey: 'hero-target',
      kind: 'think',
      text: '浦',
      styleName: 'dialogue',
      animationMode: 'talking',
    },
  ]);
  clock.advance(100);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls.slice(1), [
    ['setText', '浦島'],
    ['setAnimationMode', 'awaiting-continue'],
  ]);

  operation.finish('advance');
  await pending;
  assert.deepEqual(calls.at(-1), ['close']);
  assert.equal(clock.pendingCount(), 0);
});

test('reveals a ruby run as one typewriter unit and hands the Bubble content runs', async () => {
  const hero = fakeActor();
  const clock = manualScheduler();
  const calls: RecordedCall[] = [];
  const handle = {
    async setText(text: unknown) {
      calls.push(['setText', text]);
    },
    async setAnimationMode(mode: unknown) {
      calls.push(['setAnimationMode', mode]);
    },
    async close() {
      calls.push(['close']);
    },
  };
  const bubbleComposition = {
    async show(input: unknown) {
      calls.push(['show', input]);
      return handle;
    },
    async releaseAll() {},
  };
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: createTestTurboWarpRuntimeHost({targets: [hero.target]}),
    scheduler: clock.scheduler,
    speechAdvanceTypewriterEnabled: true,
    bubbleComposition,
  });
  const operation = platform.host.createSay(hero.target, {
    text: ['昔', {ruby: {base: '浦島', reading: 'うらしま'}}, 'が'],
    waitFor: 'advance',
    bubbleStyle: 'dialogue',
    characterIntervalSeconds: 0.1,
  });
  const pending = operation.start();
  const flush = async () => {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  };
  await flush();
  const shown = requireRecord(calls[0]?.[1], 'show input');
  assert.deepEqual(shown.text, [{type: 'text', text: '昔'}]);
  clock.advance(100);
  await flush();
  clock.advance(100);
  await flush();
  assert.deepEqual(
    calls.filter(([name]) => name === 'setText').map(([, text]) => text),
    [
      [
        {type: 'text', text: '昔'},
        {type: 'ruby', base: '浦島', reading: 'うらしま'},
      ],
      [
        {type: 'text', text: '昔'},
        {type: 'ruby', base: '浦島', reading: 'うらしま'},
        {type: 'text', text: 'が'},
      ],
    ],
    'the base and its reading appear together, never one character of the base at a time',
  );
  assert.deepEqual(calls.at(-1), ['setAnimationMode', 'awaiting-continue']);
  operation.finish('advance');
  await pending;
  assert.equal(clock.pendingCount(), 0);
});

test('keeps plain text on the string path when content runs carry no ruby', async () => {
  const hero = fakeActor();
  const calls: RecordedCall[] = [];
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: createTestTurboWarpRuntimeHost({targets: [hero.target]}),
    speechAdvanceTypewriterEnabled: true,
    bubbleComposition: {
      async show(input: unknown) {
        calls.push(['show', input]);
        return {async close() {}, async setAnimationMode() {}};
      },
      async releaseAll() {},
    },
  });
  const operation = platform.host.createSay(hero.target, {
    text: ['浦島', '太郎'],
    waitFor: 'advance',
    bubbleStyle: 'dialogue',
  });
  const pending = operation.start();
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
  assert.equal(requireRecord(calls[0]?.[1], 'show input').text, '浦島太郎');
  operation.finish('advance');
  await pending;
});

test('splits Bubble native reveal chunks by content runs when the text has ruby', async () => {
  const hero = fakeActor();
  const calls: RecordedCall[] = [];
  let reveals = 0;
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: createTestTurboWarpRuntimeHost({targets: [hero.target]}),
    speechAdvanceTypewriterEnabled: true,
    bubbleComposition: {
      async show(input: unknown) {
        calls.push(['show', input]);
        return {
          async revealNext() {
            reveals += 1;
            return true;
          },
          async revealAll() {},
          async finish() {},
          async setAnimationMode() {},
          async close() {},
        };
      },
      async releaseAll() {},
    },
  });
  const text = [{ruby: {base: '浦島', reading: 'うらしま'}}, '太郎'];
  const operation = platform.host.createSay(hero.target, {
    text,
    waitFor: 'advance',
    bubbleStyle: 'native',
    bubbleReveal: {unit: 'CHARACTER', layout: 'RESERVED', intervalSeconds: 0},
  });
  const pending = operation.start();
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
  assert.deepEqual(requireRecord(calls[0]?.[1], 'show input').text, [
    {type: 'ruby', base: '浦島', reading: 'うらしま'},
    {type: 'text', text: '太郎'},
  ]);
  // The ruby run, 太, and 郎 are three reveal units: the first shows on start, so two advances
  // reveal the rest and a third completes the speech.
  assert.deepEqual(operation.finish('advance'), {consumed: true});
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
  assert.deepEqual(operation.finish('advance'), {consumed: true});
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
  assert.deepEqual(operation.finish('advance'), {consumed: false});
  await pending;
  assert.equal(reveals, 2);
});

test('rejects speech text that is neither a string nor content runs', () => {
  const hero = fakeActor();
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: createTestTurboWarpRuntimeHost({targets: [hero.target]}),
    speechAdvanceTypewriterEnabled: true,
    bubbleComposition: {async show() {}, async releaseAll() {}},
  });
  for (const text of [[], [{ruby: {base: '浦島'}}], 3]) {
    assert.throws(
      () => platform.host.createSay(hero.target, {text, seconds: 1}),
      /say\.text must be a string or content runs/u,
    );
  }
});

test('drives Bubble native reveal units and preserves finish audio lifecycle', async () => {
  const hero = fakeActor();
  const clock = manualScheduler();
  const calls: RecordedCall[] = [];
  const handle = {
    async animate(motion: unknown) {
      calls.push(['animate', motion]);
    },
    async revealNext() {
      calls.push(['revealNext']);
      return true;
    },
    async revealAll() {
      calls.push(['revealAll']);
    },
    async finish() {
      calls.push(['finish']);
    },
    async setAnimationMode(mode: unknown) {
      calls.push(['setAnimationMode', mode]);
    },
    async close() {
      calls.push(['close']);
    },
  };
  const bubbleComposition = {
    async show(input: unknown) {
      calls.push(['show', input]);
      return handle;
    },
    async releaseAll() {},
  };
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: createTestTurboWarpRuntimeHost({targets: [hero.target]}),
    scheduler: clock.scheduler,
    speechAdvanceTypewriterEnabled: true,
    bubbleComposition,
  });
  const operation = platform.host.createSay(hero.target, {
    text: '浦島太郎',
    waitFor: 'advance',
    bubbleStyle: 'native',
    bubbleReveal: {unit: 'CHARACTER', layout: 'RESERVED', intervalSeconds: 0.1},
    bubbleMotions: [
      {name: 'shake', direction: 'right', count: 2},
      {name: 'animateBubbleShape', visualStyle: 'YELLING', durationSeconds: 0.2},
    ],
  });
  const pending = operation.start();
  for (let flush = 0; flush < 8; flush += 1) await Promise.resolve();

  assert.deepEqual(calls[0], [
    'show',
    {
      actor: hero.target,
      actorKey: 'hero-target',
      kind: 'say',
      text: '浦島太郎',
      styleName: 'native',
      animationMode: 'talking',
      reveal: {
        unit: 'CHARACTER',
        delimiters: ' \t\r\n',
        showDelimiters: false,
        layout: 'RESERVED',
        intervalSeconds: 0,
      },
    },
  ]);
  assert.deepEqual(calls.slice(1, 3), [
    ['animate', {name: 'shake', direction: 'right', count: 2}],
    ['animate', {name: 'animateBubbleShape', visualStyle: 'YELLING', durationSeconds: 0.2}],
  ]);
  for (let index = 0; index < 3; index += 1) {
    clock.advance(100);
    for (let flush = 0; flush < 8; flush += 1) await Promise.resolve();
  }
  assert.equal(calls.filter(([name]) => name === 'revealNext').length, 3);
  assert.deepEqual(calls.at(-1), ['setAnimationMode', 'awaiting-continue']);

  assert.deepEqual(operation.finish('advance'), {consumed: false});
  await pending;
  assert.deepEqual(calls.slice(-2), [['finish'], ['close']]);
  assert.equal(clock.pendingCount(), 0);
});

test('uses advance as revealNext when native reveal disables automatic progress', async () => {
  const hero = fakeActor();
  const calls: string[] = [];
  const handle = {
    async revealNext() {
      calls.push('revealNext');
      return true;
    },
    async revealAll() {},
    async finish() {
      calls.push('finish');
    },
    async setAnimationMode(mode: unknown) {
      calls.push(requireString(mode, 'the animation mode'));
    },
    async close() {
      calls.push('close');
    },
  };
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: createTestTurboWarpRuntimeHost({targets: [hero.target]}),
    speechAdvanceTypewriterEnabled: true,
    bubbleComposition: {
      async show() {
        return handle;
      },
      async releaseAll() {},
    },
  });
  const operation = platform.host.createSay(hero.target, {
    text: 'AB',
    waitFor: 'advance',
    bubbleStyle: 'manual',
    bubbleReveal: {unit: 'CHARACTER', intervalSeconds: 0},
  });
  const pending = operation.start();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(operation.finish('advance'), {consumed: true});
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
  assert.deepEqual(calls.slice(-2), ['revealNext', 'awaiting-continue']);
  assert.deepEqual(operation.finish('advance'), {consumed: false});
  await pending;
  assert.deepEqual(calls.slice(-2), ['finish', 'close']);
});

test('handles zero-second operations without retaining a timer', async () => {
  const hero = fakeActor({x: 1, y: 2});
  const fake = fakeRuntime([hero.target]);
  const clock = manualScheduler();
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
    scheduler: clock.scheduler,
  });

  await platform.host.createMove(hero.target, {x: 3, y: 4, seconds: 0}).start();
  await platform.host
    .createTransparencyTransition(hero.target, {from: 10, to: 20, seconds: 0})
    .start();
  await platform.host.createSay(hero.target, {text: '', seconds: 0}).start();

  assert.equal(hero.target.x, 3);
  assert.equal(hero.target.y, 4);
  assert.equal(clock.pendingCount(), 0);
  assert.deepEqual(
    hero.calls.filter(([method]) => method === 'setEffect'),
    [
      ['setEffect', 'ghost', 10],
      ['setEffect', 'ghost', 20],
    ],
  );
  assert.deepEqual(fake.bubbleCalls, [
    ['', 'hero-target'],
    ['', 'hero-target'],
  ]);
});

test('contains a scheduled bubble failure in the say operation promise', async () => {
  const hero = fakeActor();
  const clock = manualScheduler();
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: createTestTurboWarpRuntimeHost({targets: [hero.target]}),
    scheduler: clock.scheduler,
    bubbleComposition: {
      async show() {
        return {
          async setText() {},
          async close() {
            throw new Error('bubble clear failed');
          },
        };
      },
      async releaseAll() {},
    },
  });
  const pending = platform.host.createSay(hero.target, {text: 'hello', seconds: 1}).start();

  clock.advance(1000);
  // The failed close is retried once during failure handling, so both attempts are reported.
  await assert.rejects(pending, (error) => {
    assert.equal(error instanceof AggregateError, true);
    assert.deepEqual(
      requireArray(thrown(error).errors, 'the aggregated failures').map((failure) =>
        requireString(requireRecord(failure, 'a failure').message, 'its message'),
      ),
      ['bubble clear failed', 'bubble clear failed'],
    );
    return true;
  });
  assert.equal(clock.pendingCount(), 0);
});

test('fails closed for missing, duplicate, malformed, and imprecise actors', () => {
  const hero = fakeActor();
  const duplicate = fakeActor({id: 'duplicate-target'});
  const fake = fakeRuntime([hero.target, duplicate.target]);
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
  });

  assert.equal(platform.resolveActor('hero'), null);
  assert.equal(platform.resolveActor('Missing'), null);
  assert.throws(() => platform.resolveActor('Hero'), /ambiguous/u);
  assert.throws(() => platform.resolveActor(''), /non-empty/u);

  fake.runtime.targets = [
    {
      id: 'malformed',
      isStage: false,
      lookupVariableByNameAndType() {
        return {value: 'Hero'};
      },
    },
  ];
  assert.throws(() => platform.resolveActor('Hero'), /target is invalid/u);
});

test('rejects invalid runtime, scheduler, target, specs, duration, and repeated start', async () => {
  const hero = fakeActor();
  const fake = fakeRuntime([hero.target]);
  assert.throws(
    () => createDsl4TurboWarpActorPlatform(invalidPlatformOptions({runtimeHost: {}})),
    /injected TurboWarp runtime host/u,
  );
  // Actor resolution runs on every action, so a malformed target list is rejected once at
  // construction rather than surfacing mid-story from the shared host's per-call validation.
  assert.throws(
    () =>
      createDsl4TurboWarpActorPlatform(
        invalidPlatformOptions({
          runtimeHost: createTestTurboWarpRuntimeHost({targets: 'not-an-array'}),
        }),
      ),
    /targets must be an array/u,
  );
  // Bubble is the only speech renderer, so a platform without its composition never starts.
  assert.throws(
    () => createDsl4TurboWarpActorPlatform(invalidPlatformOptions({runtimeHost: fake.runtimeHost})),
    /Bubble composition must provide show and releaseAll/u,
  );
  assert.throws(
    () =>
      createDsl4TurboWarpActorPlatform(
        invalidPlatformOptions({
          runtimeHost: fake.runtimeHost,
          bubbleComposition: {show() {}},
        }),
      ),
    /Bubble composition must provide show and releaseAll/u,
  );
  assert.throws(
    () =>
      createDsl4TurboWarpActorPlatform({
        runtimeHost: fake.runtimeHost,
        bubbleComposition: fake.bubbleComposition,
        scheduler: {},
      }),
    /scheduler/u,
  );
  assert.throws(
    () =>
      createDsl4TurboWarpActorPlatform({
        runtimeHost: fake.runtimeHost,
        bubbleComposition: fake.bubbleComposition,
        frameMilliseconds: 0,
      }),
    /greater than zero/u,
  );
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
  });
  assert.throws(() => platform.host.showActor({}, {x: 0, y: 0, scale: 1}), /target/u);
  assert.throws(() => platform.host.showActor(hero.target, {x: 0, y: 0, scale: 0}), /positive/u);
  const bubblePlatform = createDsl4TurboWarpActorPlatform({
    runtimeHost: createTestTurboWarpRuntimeHost({targets: [hero.target]}),
    speechAdvanceTypewriterEnabled: true,
    bubbleComposition: {
      async show() {
        assert.fail('invalid motion must be rejected before Bubble show');
      },
      async releaseAll() {},
    },
  });
  assert.throws(
    () =>
      bubblePlatform.host.createSay(hero.target, {
        text: 'hello',
        seconds: 1,
        bubbleStyle: 'native',
        bubbleMotions: [{name: 'unknown'}],
      }),
    /bubbleMotions is invalid/u,
  );
  for (const transparency of [-1, 101, Number.NaN]) {
    assert.throws(
      () => platform.host.setTransparency(hero.target, {transparency}),
      /finite number|between 0 and 100/u,
    );
  }
  assert.throws(
    () => platform.host.setTransparency(hero.target, {transparency: 50, extra: true}),
    /provide exactly/u,
  );
  const missingEffect = Object.fromEntries(
    Object.entries(hero.target).filter(([member]) => member !== 'setEffect'),
  );
  assert.throws(
    () => platform.host.setTransparency(missingEffect, {transparency: 50}),
    /provide setEffect/u,
  );
  for (const transition of [
    {from: -1, to: 50, seconds: 1},
    {from: 0, to: 101, seconds: 1},
    {from: 0, to: 50, seconds: Number.MAX_VALUE},
    {from: 0, to: 50, seconds: 1, extra: true},
  ]) {
    assert.throws(
      () => platform.host.createTransparencyTransition(hero.target, transition),
      /provide exactly|finite non-negative duration|between 0 and 100/u,
    );
  }
  assert.equal(
    hero.calls.some(([method]) => method === 'setEffect'),
    false,
  );
  assert.throws(
    () => platform.host.createMove(hero.target, {x: 0, y: 0, seconds: Number.MAX_VALUE}),
    /finite non-negative duration/u,
  );
  assert.throws(
    () => platform.host.createMove(hero.target, {x: 0, y: 0, seconds: 1, easing: 'spring'}),
    /easing must be one of/u,
  );
  assert.throws(
    () =>
      platform.host.createMove(hero.target, {
        x: 0,
        y: 0,
        seconds: 1,
        easing: 'linear',
        extra: true,
      }),
    /specification/u,
  );
  assert.throws(
    () => platform.host.createSay(hero.target, {text: 1, seconds: 0}),
    /text must be a string/u,
  );
  const movement = platform.host.createMove(hero.target, {x: 0, y: 0, seconds: 0});
  await movement.start();
  assert.throws(() => movement.start(), /only start once/u);
  const transparency = platform.host.createTransparencyTransition(hero.target, {
    from: 0,
    to: 50,
    seconds: 0,
  });
  await transparency.start();
  assert.throws(() => transparency.start(), /only start once/u);
});

test('keeps platform instances and their schedulers isolated', async () => {
  const firstActor = fakeActor({id: 'first'});
  const secondActor = fakeActor({id: 'second'});
  const firstRuntime = fakeRuntime([firstActor.target]);
  const secondRuntime = fakeRuntime([secondActor.target]);
  const firstClock = manualScheduler();
  const secondClock = manualScheduler();
  const first = createDsl4TurboWarpActorPlatform({
    runtimeHost: firstRuntime.runtimeHost,
    bubbleComposition: firstRuntime.bubbleComposition,
    scheduler: firstClock.scheduler,
  });
  const second = createDsl4TurboWarpActorPlatform({
    runtimeHost: secondRuntime.runtimeHost,
    bubbleComposition: secondRuntime.bubbleComposition,
    scheduler: secondClock.scheduler,
  });

  const firstPending = first.host.createSay(firstActor.target, {text: 'first', seconds: 1}).start();
  const secondPending = second.host
    .createSay(secondActor.target, {text: 'second', seconds: 1})
    .start();
  firstClock.advance(1000);
  await firstPending;

  assert.deepEqual(firstRuntime.bubbleCalls.at(-1), ['', 'first']);
  assert.deepEqual(secondRuntime.bubbleCalls, [['second', 'second']]);
  secondClock.advance(1000);
  await secondPending;
});

test('showing an actor applies the rotation style and angle, and only when the action asks', () => {
  const hero = fakeActor();
  const fake = fakeRuntime([{id: 'stage', isStage: true}, hero.target]);
  const clock = manualScheduler();
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
    scheduler: clock.scheduler,
  });
  const resolved = platform.resolveActor('Hero');

  platform.host.showActor(resolved, {x: 0, y: 0, scale: 100});
  assert.equal(
    hero.calls.some(([name]) => name === 'setRotationStyle' || name === 'setDirection'),
    false,
  );

  platform.host.showActor(resolved, {
    x: 0,
    y: 0,
    scale: 100,
    rotation: 'leftRight',
    direction: 450,
  });
  assert.deepEqual(hero.calls.slice(-5), [
    ['setXY', 0, 0],
    ['setSize', 100],
    ['setRotationStyle', 'left-right'],
    ['setDirection', 90],
    ['setVisible', true],
  ]);

  platform.host.showActor(resolved, {x: 0, y: 0, scale: 100, rotation: 'none'});
  assert.deepEqual(hero.calls.slice(-2), [
    ['setRotationStyle', "don't rotate"],
    ['setVisible', true],
  ]);

  assert.throws(
    () => platform.host.showActor(resolved, {x: 0, y: 0, scale: 100, rotation: 'mirror'}),
    /rotation must be one of allAround, leftRight, none/u,
  );
  assert.throws(
    () => platform.host.showActor(resolved, {x: 0, y: 0, scale: 100, direction: Number.NaN}),
    /direction/u,
  );
});

test('an actor whose host cannot turn it reports the missing capability', () => {
  const hero = fakeActor({rotation: false});
  const fake = fakeRuntime([{id: 'stage', isStage: true}, hero.target]);
  const clock = manualScheduler();
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
    scheduler: clock.scheduler,
  });
  const resolved = platform.resolveActor('Hero');
  assert.throws(
    () => platform.host.showActor(resolved, {x: 0, y: 0, scale: 100, rotation: 'allAround'}),
    /setRotationStyle/u,
  );
  assert.throws(
    () => platform.host.showActor(resolved, {x: 0, y: 0, scale: 100, direction: 0}),
    /setDirection/u,
  );
  // Without rotation in the action, an older host keeps working untouched.
  platform.host.showActor(resolved, {x: 1, y: 2, scale: 50});
  assert.deepEqual(hero.calls.slice(-3), [
    ['setXY', 1, 2],
    ['setSize', 50],
    ['setVisible', true],
  ]);
});

function animationFixture() {
  const {target} = fakeActor();
  target.size = 100;
  target.direction = 170;
  target.effects = {ghost: 20};
  target.setEffect = (name, value) => {
    target.effects![name] = value;
  };
  const clock = manualScheduler();
  const fake = fakeRuntime([target]);
  const platform = createDsl4TurboWarpActorPlatform({
    runtimeHost: fake.runtimeHost,
    bubbleComposition: fake.bubbleComposition,
    scheduler: clock.scheduler,
    frameMilliseconds: 250,
  });
  const port = createDsl4ActorActionPort({
    host: platform.host,
    resolveActor: platform.resolveActor,
    composition: {
      isRegistered() {
        return false;
      },
      getMimeType() {},
      applyToTarget() {},
    },
  });
  const values = () => [target.x, target.y, target.size, target.direction, target.effects?.ghost];
  const animate = (settings: Record<string, unknown>, signal = new AbortController().signal) =>
    port.animate({target: 'Hero', ...settings}, {signal});
  return {target, clock, platform, values, animate};
}

test('actor port uses one clock for all tracks, delay, Scratch direction, and alternating repeats', async () => {
  const {clock, values, animate} = animationFixture();
  await animate({
    to: {x: 100, y: 80, scale: 200, direction: -170, transparency: 80},
    seconds: 1,
    delaySeconds: 0.25,
    repeat: 1,
    alternate: true,
    background: true,
  });
  assert.equal(clock.pendingCount(), 1);
  clock.advance(249);
  assert.deepEqual(values(), [0, 0, 100, 170, 20]);
  clock.advance(501);
  assert.deepEqual(values(), [50, 40, 150, 180, 50]);
  assert.equal(clock.pendingCount(), 1);
  clock.advance(500);
  assert.deepEqual(values(), [100, 80, 200, -170, 80]);
  clock.advance(1000);
  assert.deepEqual(values(), [0, 0, 100, 170, 20]);
  assert.equal(clock.pendingCount(), 0);
});

test('replacement leaves disjoint tracks running and a legacy setter keeps the new value', async () => {
  const {clock, platform, target, values, animate} = animationFixture();
  await animate({to: {x: 100, y: 100, transparency: 100}, seconds: 1, background: true});
  clock.advance(250);
  assert.deepEqual(values(), [25, 25, 100, 170, 40]);
  await animate({to: {x: 225, scale: 200}, seconds: 2, background: true});
  clock.advance(250);
  assert.deepEqual(values().slice(0, 2), [50, 50]);
  platform.host.setTransparency(target, {transparency: 7});
  platform.finishActorAnimations();
  assert.deepEqual(values(), [225, 100, 200, 170, 7]);
  clock.advance(5000);
  assert.deepEqual(values(), [225, 100, 200, 170, 7]);
  assert.equal(clock.pendingCount(), 0);
});

test('foreground abort finishes only owned tracks; restore cleanup and dispose leave no stale writes', async () => {
  const {clock, platform, target, values, animate} = animationFixture();
  const controller = new AbortController();
  const foreground = animate({to: {x: 100, y: 100}, seconds: 1}, controller.signal);
  const abort = assert.rejects(foreground, {name: 'AbortError'});
  for (let count = 0; count < 20 && clock.pendingCount() === 0; count++) await Promise.resolve();
  assert.equal(clock.pendingCount(), 1);
  clock.advance(250);
  await animate({to: {x: 225}, seconds: 1, background: true});
  controller.abort();
  await abort;
  assert.deepEqual(values().slice(0, 2), [25, 100]);
  platform.cancelActorAnimations();
  assert.deepEqual(values().slice(0, 2), [25, 100], 'cancel itself does not write terminal values');
  target.setXY(-10, -20);
  await animate({to: {y: 55, direction: 450}, seconds: 1, delaySeconds: 1, background: true});
  platform.dispose();
  clock.advance(5000);
  assert.deepEqual(values().slice(0, 4), [-10, -20, 100, 170]);
  assert.equal(clock.pendingCount(), 0);
});

test('actor port rejects out-of-range timing before scheduling and supports zero-duration actions', async () => {
  const {clock, values, animate} = animationFixture();
  for (const options of [
    {to: {}, seconds: 1},
    {to: {transparency: 101}, seconds: 1},
    {to: {scale: 0}, seconds: 1},
    {to: {x: Infinity}, seconds: 1},
    {to: {x: 1}, seconds: 61},
    {to: {x: 1}, seconds: 60, repeat: 5},
    {to: {x: 1}, seconds: 1, repeat: 1.5},
    {to: {x: 1}, seconds: 1, background: 'true'},
  ]) {
    await assert.rejects(animate(options), {code: 'K4-ACTOR-PORT-001'});
  }
  assert.equal(clock.pendingCount(), 0);
  await animate({to: {x: 10, direction: 450}, seconds: 0});
  assert.deepEqual(values().slice(0, 4), [10, 0, 100, 90]);
  assert.equal(clock.pendingCount(), 0);
});
