import assert from 'node:assert/strict';
import {test} from 'vitest';

import {createDsl4RuntimeController, dsl4CoreActionNames} from '../src/dsl4/index.js';
import type {RuntimeEvent} from '../src/dsl4/runtime-controller.js';
import {resolveDsl4PlaybackFeatures} from '../src/dsl4/playback-features.js';
import type {Dsl4RuntimePort} from '../src/dsl4/runtime-port.js';
import {deferred} from './helpers/async-test-helpers.ts';
import {dsl4TestSourceFrontend} from './helpers/dsl4-test-frontend.ts';
import {thrown} from './helpers/thrown-error.ts';
import {
  requireArray,
  requireDefined,
  requireRecord,
  requireString,
} from './helpers/require-value.ts';

const frontend = dsl4TestSourceFrontend;

type Controller = ReturnType<typeof createDsl4RuntimeController>;
type ControllerOptions = Parameters<typeof createDsl4RuntimeController>[0];

/** One payload the controller dispatches to a port operation. */
type PortPayload = Readonly<Record<string, unknown>>;

/** The context an action handler receives from the controller. */
type ActionContext = Readonly<Record<string, unknown>>;

/**
 * One event the controller's trace carries.
 *
 * `getTrace` clones every event, so its declared element type is `unknown`. The members these cases
 * read are named here once, with `details` defaulted so a predicate can reach into it.
 */
interface TraceEvent {
  readonly sequence: unknown;
  readonly type: unknown;
  readonly sceneId: unknown;
  readonly actionPath: unknown;
  readonly storyPath: unknown;
  readonly generation: unknown;
  readonly details: Record<string, unknown>;
}

function parseStory(source: string): Readonly<Record<string, unknown>> {
  const result = frontend.parse(source, {sourceId: 'runtime-test.kamishibai.yaml'});
  assert(result.ok, `expected the story to parse: ${JSON.stringify(result.diagnostics)}`);
  return result.storyDocument;
}

function traceOf(controller: {getTrace(): readonly unknown[]}): TraceEvent[] {
  return controller.getTrace().map((event) => {
    const record = requireRecord(event, 'a trace event');
    return {
      sequence: record.sequence,
      type: record.type,
      sceneId: record.sceneId,
      actionPath: record.actionPath,
      storyPath: record.storyPath,
      generation: record.generation,
      details: requireRecord(record.details ?? {}, 'its trace details'),
    };
  });
}

/** The abort signal one action context carries. */
function signalOf(context: ActionContext): AbortSignal {
  const signal = context.signal;
  assert(signal instanceof AbortSignal, 'expected the action context to carry an abort signal');
  return signal;
}

/** The story-variable writer one action context exposes. */
function setVariableOf(context: ActionContext): (name: string, value: unknown) => unknown {
  const setVariable = context.setVariable;
  assert(typeof setVariable === 'function', 'expected the context to expose setVariable');
  return setVariable as (name: string, value: unknown) => unknown;
}

/** One recorded argument of a logged call row. */
function callArgument(calls: readonly unknown[], index: number, position: number): unknown {
  return requireArray(requireDefined(calls[index], `recorded call ${index}`), 'its arguments')[
    position
  ];
}

function diagnosticOf(state: {diagnostic?: unknown}): Record<string, unknown> {
  return requireRecord(state.diagnostic, 'the failure diagnostic');
}

/**
 * Pass controller options the declaration refuses on purpose.
 *
 * Several cases assert that the controller rejects a malformed port, story document, or lifecycle,
 * all of which its own types already forbid.
 */
function invalidControllerOptions(options: Record<string, unknown>): ControllerOptions {
  return options as unknown as ControllerOptions;
}

test('gates Bubble native reveal and motion behind the startup-fixed advanced flag', () => {
  const storyDocument = parseStory(`
kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
actors: {Hero: HeroIdle}
bubbleStyles:
  native:
    reveal: {unit: CHARACTER, intervalSeconds: 0.1}
    showAnimation: {name: fadeIn, durationSeconds: 0.1}
scenes:
  opening:
    - Hero.say: {text: hello, seconds: 1, styles: [native]}
`);

  assert.throws(
    () =>
      createDsl4RuntimeController({
        storyDocument,
        port: {},
        speechAdvanceTypewriterEnabled: true,
      }),
    /dsl4TurboWarpBubbleAdvancedPresentation/u,
  );
  const controller = createDsl4RuntimeController({
    storyDocument,
    port: {},
    speechAdvanceTypewriterEnabled: true,
    turboWarpBubbleAdvancedPresentationEnabled: true,
  });
  assert.equal(controller.getState().status, 'idle');
});

test('passes only runtime presentation fields from a composed Bubble style', async () => {
  const storyDocument = parseStory(`
kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
actors: {Hero: HeroIdle}
bubbleStyles:
  native:
    maxWidth: 240
    placement: up-right
    reveal: {unit: WORD, delimiters: " /", intervalSeconds: 0.1}
    showAnimation: {name: fadeIn, durationSeconds: 0.1}
    visibleAnimations: [{name: shake, count: 2}]
scenes:
  opening:
    - Hero.say: {text: hello, seconds: 0, styles: [native]}
`);
  const calls: Record<string, unknown>[] = [];
  const controller = createDsl4RuntimeController({
    storyDocument,
    port: {
      async say(payload: PortPayload) {
        calls.push(payload);
      },
    },
    speechAdvanceTypewriterEnabled: true,
    turboWarpBubbleAdvancedPresentationEnabled: true,
  });

  await controller.start();
  assert.deepEqual(calls, [
    {
      target: 'Hero',
      text: 'hello',
      seconds: 0,
      bubbleReveal: {unit: 'WORD', delimiters: ' /', intervalSeconds: 0.1},
      bubbleMotions: [{name: 'shake', count: 2}],
      bubbleStyle: '@dsl4:["native"]',
    },
  ]);
});

test('resolves named Bubble close policies before dispatching speech', async () => {
  const storyDocument = parseStory(`
kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
actors: {Hero: HeroIdle}
bubbleClosePolicies:
  timed: {seconds: 3}
  advance: {waitFor: advance}
  first: {seconds: 10, waitFor: advance}
scenes:
  opening:
    - Hero.say: {text: timed, closePolicy: timed}
    - Hero.say: {text: advance, closePolicy: advance}
    - Hero.think: {text: first, closePolicy: first}
`);
  const calls: Record<string, unknown>[] = [];
  const port = {
    async say(payload: PortPayload) {
      calls.push(payload);
    },
    async think(payload: PortPayload) {
      calls.push(payload);
    },
  };

  assert.throws(
    () => createDsl4RuntimeController({storyDocument, port}),
    /dsl4SpeechAdvanceTypewriter/u,
  );
  const controller = createDsl4RuntimeController({
    storyDocument,
    port,
    speechAdvanceTypewriterEnabled: true,
  });
  await controller.start();

  assert.deepEqual(calls, [
    {target: 'Hero', text: 'timed', seconds: 3},
    {target: 'Hero', text: 'advance', waitFor: 'advance'},
    {target: 'Hero', text: 'first', seconds: 10, waitFor: 'advance'},
  ]);
});

async function waitFor(predicate: () => unknown, message: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail(message);
}

test('stages scene-entry presentation before starting the scene crossfade', async () => {
  const storyDocument = parseStory(`
kamishibai: '4.0'
presentation:
  transitions: {scene: 0.5}
audio:
  bgm: {transition: 0.75}
assets:
  Beach: backdrop
  HeroIdle: costume:Hero
  OpeningSound: sound
actors: {Hero: HeroIdle}
scenes:
  opening:
    - goto: ending
  ending:
    - bgm: OpeningSound
    - stage: Beach
    - Hero.show: {skin: HeroIdle, x: 0, y: 0, scale: 100}
    - wait: 0
`);
  const calls: unknown[][] = [];
  const controller = createDsl4RuntimeController({
    storyDocument,
    crossfadeTransitionsEnabled: true,
    port: {
      hideSceneActors(payload: PortPayload) {
        calls.push(['hideSceneActors', payload.from, payload.to]);
      },
      createSceneCrossfade(transition, context) {
        calls.push(['captureScene', transition, context.from, context.to]);
        return {
          start() {
            calls.push(['startSceneCrossfade']);
          },
          finish() {
            calls.push(['finishSceneCrossfade']);
          },
        };
      },
      bgm(payload: PortPayload) {
        calls.push(['bgm', payload]);
      },
      stage(payload: PortPayload) {
        calls.push(['stage', payload]);
      },
      show(payload: PortPayload) {
        calls.push(['show', payload]);
      },
      wait() {
        calls.push(['wait']);
      },
    },
  });

  await controller.start();

  assert.deepEqual(calls, [
    ['hideSceneActors', null, 'opening'],
    ['captureScene', {effect: 'crossfade', seconds: 0.5, easing: 'easeInOut'}, 'opening', 'ending'],
    ['hideSceneActors', 'opening', 'ending'],
    [
      'bgm',
      {
        sound: 'OpeningSound',
        transition: {effect: 'crossfade', seconds: 0.75, curve: 'equalPower'},
        managed: true,
      },
    ],
    ['stage', {backdrop: 'Beach', transition: {effect: 'cut'}}],
    [
      'show',
      {
        target: 'Hero',
        skin: 'HeroIdle',
        x: 0,
        y: 0,
        scale: 100,
        transition: {effect: 'cut'},
      },
    ],
    ['startSceneCrossfade'],
    ['wait'],
  ]);
});

test('starts a scene crossfade even when the destination has no staging prefix', async () => {
  const storyDocument = parseStory(`
kamishibai: '4.0'
scenes:
  opening:
    - goto: ending
  ending:
    entryTransition: 0.2
    actions:
      - wait: 0
`);
  const calls: unknown[][] = [];
  const controller = createDsl4RuntimeController({
    storyDocument,
    crossfadeTransitionsEnabled: true,
    port: {
      hideSceneActors(payload: PortPayload) {
        calls.push(['hideSceneActors', payload.to]);
      },
      createSceneCrossfade() {
        calls.push(['captureScene']);
        return {
          start() {
            calls.push(['startSceneCrossfade']);
          },
          finish() {},
        };
      },
      wait() {
        calls.push(['wait']);
      },
    },
  });

  await controller.start();
  assert.deepEqual(calls, [
    ['hideSceneActors', 'opening'],
    ['captureScene'],
    ['hideSceneActors', 'ending'],
    ['startSceneCrossfade'],
    ['wait'],
  ]);

  assert.throws(
    () => createDsl4RuntimeController({storyDocument, port: {}}),
    (error) => thrown(error).code === 'K4-TRANSITION-FLAG-001',
  );
});

test('discards a scene crossfade prepared after the runtime stops', async () => {
  const storyDocument = parseStory(`
kamishibai: '4.0'
scenes:
  opening:
    - goto: ending
  ending:
    entryTransition: 0.2
    actions:
      - wait: 0
`);
  const capture = deferred<{start(): void; finish(): void}>();
  const calls: string[] = [];
  const controller = createDsl4RuntimeController({
    storyDocument,
    crossfadeTransitionsEnabled: true,
    port: {
      createSceneCrossfade() {
        calls.push('capture');
        return capture.promise;
      },
      wait() {},
    },
  });

  const running = controller.start();
  await waitFor(() => calls.includes('capture'), 'scene capture did not start');
  const stopped = controller.stop();
  capture.resolve({
    start() {
      calls.push('start');
    },
    finish() {
      calls.push('finish');
    },
  });
  await running;

  assert.equal(stopped.status, 'stopped');
  assert.equal(controller.getState().status, 'stopped');
  assert.equal(controller.getState().sceneId, 'opening');
  assert.deepEqual(calls, ['capture', 'finish']);
});

test('applies scene crossfade when navigate runs without an asset lifecycle', async () => {
  const storyDocument = parseStory(`
kamishibai: '4.0'
scenes:
  opening:
    - wait: 1
  ending:
    entryTransition: 0.2
    actions:
      - wait: 0
`);
  const calls: string[] = [];
  const controller = createDsl4RuntimeController({
    storyDocument,
    crossfadeTransitionsEnabled: true,
    port: {
      wait(payload: PortPayload, context: ActionContext) {
        if (context.sceneId !== 'opening') return;
        calls.push('wait');
        return new Promise((resolve, reject) => {
          signalOf(context).addEventListener(
            'abort',
            () => {
              const error = new Error('cancelled');
              error.name = 'AbortError';
              reject(error);
            },
            {once: true},
          );
        });
      },
      createSceneCrossfade() {
        calls.push('capture');
        return {
          start() {
            calls.push('start');
          },
          finish() {
            calls.push('finish');
          },
        };
      },
    },
  });

  void controller.start();
  await waitFor(() => calls.includes('wait'), 'opening action did not start');
  const state = await controller.navigate('ending');

  assert.equal(state.status, 'finished');
  assert.equal(state.sceneId, 'ending');
  assert.deepEqual(calls, ['wait', 'capture', 'start']);
});

const allCoreActionsStory = `
kamishibai: '4.0'
assets:
  Beach: backdrop
  HeroIdle: costume:Hero
  HeroHappy: costume:Hero
  CaptionIdle: costume:Caption
  Music: sound
  Effect: sound
  RescueModel:
    kind: recognitionModel
    file: pose-models/rescue
actors:
  Hero: HeroIdle
  Caption: CaptionIdle
textStyles:
  title:
    color: '#ffffff'
variables:
  firstRoute: false
  score: 1
recognition:
  idleSound: Effect
  chargeSound: Effect
  sequence:
    confidenceThreshold: 0.6
    fullConfidenceHoldSeconds: 1.5
    idleChargePerSecond: 0.1
  selection:
    accumulationPerSecond: 2
    decayPerSecond: 0.8
    scoreThreshold: 1
branches:
  choose:
    - if: firstRoute
      goto: ending
    - if: score == 1
      goto: keyChoice
    - else: ending
scenes:
  opening:
    recognitionModel: RescueModel
    recognitionMode: pose
    actions:
      - stage: Beach
      - bgm: Music
      - setBgmVolume: 60
      - stopBgm: 0
      - sound: Effect
      - audio: {id: music, asset: Music, volume: 35}
      - audioControl: {id: music, operation: play}
      - video: {id: movie, url: 'https://example.com/movie.webm', x: 0, y: 0, width: 320, height: 180, plane: background, zIndex: -2}
      - videoControl: {id: movie, operation: play}
      - wait: 0
      - debugger:
      - broadcastMessageAndWait: opening-effect
      - setVariable:
          name: score
          value: 2
      - changeVariable:
          name: score
          by: -1
      - toggleVariable: firstRoute
      - transition:
          effect: fadeOut
          seconds: 0
      - Hero.show:
          skin: HeroHappy
          x: 0
          y: 0
          scale: 100
      - Hero.hide: {}
      - Hero.setLayer: back
      - Hero.loop:
          steps:
            - skin: HeroIdle
              seconds: 0.3
            - skin: HeroHappy
              seconds: 0.3
      - Hero.setTransparency: 50
      - Hero.moveTo:
          x: 10
          y: 20
          seconds: 0
          easing: easeOut
      - Hero.animate: {to: {x: 40, direction: 180}, seconds: 0}
      - presentationEffect: {scope: stage, effect: fade, seconds: 0, params: {}}
      - Hero.say:
          text: hello
          seconds: 0
      - Hero.think:
          text: thinking
          seconds: 0
      - Hero.setSkin:
          skin: HeroIdle
          scale: 45
      - Caption.setText:
          text: title
          style: title
      - Hero.pose:
          steps:
            - pose: happy
              skin: HeroHappy
              sound: Effect
      - goto: branching
  branching:
    - branch: choose
  keyChoice:
    - keyInputToChangeScene:
        Digit1: touchChoice
        Digit2: ending
  touchChoice:
    - touchInputToChangeScene:
        Hero: poseChoice
  poseChoice:
    recognitionModel: RescueModel
    actions:
      - poseInputToChangeScene:
          happy: imageChoice
          jump: opening
  imageChoice:
    recognitionModel: RescueModel
    recognitionMode: image
    actions:
      - imageInputToChangeScene:
          ready: ending
  ending:
    - gotoSegment: chapter2
`;

test('normalizes authored speech runs and keeps a plain speech string in the StoryDocument', () => {
  const parsed = frontend.parse(
    `kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
actors:
  Hero: HeroIdle
scenes:
  opening:
    - Hero.say:
        text:
          - むかし
          - ruby: {base: 浦島, reading: うらしま}
          - がいました
        seconds: 1
    - Hero.think:
        text: ただの文
        seconds: 1
`,
    {sourceId: 'speech-content-run.kamishibai.yaml'},
  );
  assert(parsed.ok, `expected the story to parse: ${JSON.stringify(parsed.diagnostics)}`);

  const actions = requireArray(
    requireRecord(
      requireArray(requireRecord(parsed.storyDocument, 'the story').scenes, 'its scenes')[0],
      'the opening scene',
    ).actions,
    'its actions',
  );

  assert.deepEqual(
    requireRecord(requireRecord(actions[0], 'the ruby speech').args, 'its args').text,
    [
      {type: 'text', text: 'むかし'},
      {type: 'ruby', base: '浦島', reading: 'うらしま'},
      {type: 'text', text: 'がいました'},
    ],
  );
  // A plain speech reaches the runtime as the same string as before.
  assert.equal(
    requireRecord(requireRecord(actions[1], 'the plain speech').args, 'its args').text,
    'ただの文',
  );
});

test('normalizes authored setText body text into typed runs in the StoryDocument', () => {
  const parsed = frontend.parse(
    `kamishibai: '4.0'
assets:
  CaptionIdle: costume:Caption
actors:
  Caption: CaptionIdle
textStyles:
  body:
    color: '#ffffff'
scenes:
  opening:
    - Caption.setText:
        text:
          - むかし
          - ruby: {base: 竹取, reading: たけとり}
          - の翁
        style: body
    - Caption.setText:
        text: ただの文
        style: body
`,
    {sourceId: 'content-run.kamishibai.yaml'},
  );
  assert(parsed.ok, `expected the story to parse: ${JSON.stringify(parsed.diagnostics)}`);

  const actions = requireArray(
    requireRecord(
      requireArray(requireRecord(parsed.storyDocument, 'the story').scenes, 'its scenes')[0],
      'the opening scene',
    ).actions,
    'its actions',
  );

  // The authored list and the plain string both reach the runtime as one typed run list.
  assert.deepEqual(
    requireRecord(requireRecord(actions[0], 'the ruby action').args, 'its args').text,
    [
      {type: 'text', text: 'むかし'},
      {type: 'ruby', base: '竹取', reading: 'たけとり'},
      {type: 'text', text: 'の翁'},
    ],
  );
  assert.deepEqual(
    requireRecord(requireRecord(actions[1], 'the plain action').args, 'its args').text,
    [{type: 'text', text: 'ただの文'}],
  );
});

test('dispatches every core action and keeps transition separate from scene movement', async () => {
  const calls: Record<string, unknown>[] = [];
  const port: Record<string, (payload: PortPayload) => Promise<unknown>> = Object.fromEntries(
    [
      'stage',
      'bgm',
      'setBgmVolume',
      'stopBgm',
      'sound',
      'audio',
      'audioControl',
      'video',
      'videoControl',
      'wait',
      'broadcastMessageAndWait',
      'transition',
      'show',
      'hide',
      'setLayer',
      'loop',
      'setTransparency',
      'moveTo',
      'animate',
      'presentationEffect',
      'say',
      'think',
      'setSkin',
      'setText',
    ].map((method) => [
      method,
      async (payload: PortPayload) => {
        calls.push({method, payload});
      },
    ]),
  );
  port.waitForPose = async (payload: PortPayload) => {
    calls.push({method: 'waitForPose', payload});
  };
  port.keyInputToChangeScene = async (payload: PortPayload) => {
    calls.push({method: 'keyInputToChangeScene', payload});
    return 'Digit1';
  };
  port.touchInputToChangeScene = async (payload: PortPayload) => {
    calls.push({method: 'touchInputToChangeScene', payload});
    return 'Hero';
  };
  port.poseInputToChangeScene = async (payload: PortPayload) => {
    calls.push({method: 'poseInputToChangeScene', payload});
    return 'happy';
  };
  port.imageInputToChangeScene = async (payload: PortPayload) => {
    calls.push({method: 'imageInputToChangeScene', payload});
    return 'ready';
  };
  port.gotoSegment = async (payload: PortPayload) => {
    calls.push({method: 'gotoSegment', payload});
    return {outcome: 'committed'};
  };
  const evaluated: string[] = [];
  const storyDocument = parseStory(allCoreActionsStory);
  const exercisedCoreActions = [
    ...new Set(
      requireArray(storyDocument.scenes, 'the story scenes').flatMap((scene) =>
        requireArray(requireRecord(scene, 'a scene').actions, 'its actions').map(
          (action) => requireRecord(action, 'an action').command,
        ),
      ),
    ),
  ].sort();
  assert.deepEqual(exercisedCoreActions, [...dsl4CoreActionNames].sort());
  const controller = createDsl4RuntimeController({
    storyDocument,
    port,
    speechAdvanceTypewriterEnabled: true,
    presentationEffectsEnabled: true,
    broadcastMessageAndWaitEnabled: true,
    evaluateCondition(expression, variables) {
      evaluated.push(expression);
      return expression === 'score == 1' && variables.score === 1;
    },
  });

  const state = await controller.start();
  assert.equal(state.status, 'finished');
  assert.deepEqual(evaluated, ['firstRoute', 'score == 1']);
  assert.deepEqual(
    calls.map(({method}) => method),
    [
      'stage',
      'bgm',
      'setBgmVolume',
      'stopBgm',
      'sound',
      'audio',
      'audioControl',
      'video',
      'videoControl',
      'wait',
      'broadcastMessageAndWait',
      'transition',
      'show',
      'hide',
      'setLayer',
      'loop',
      'setTransparency',
      'moveTo',
      'animate',
      'presentationEffect',
      'say',
      'think',
      'setSkin',
      'setText',
      'setSkin',
      'waitForPose',
      'bgm',
      'keyInputToChangeScene',
      'touchInputToChangeScene',
      'poseInputToChangeScene',
      'imageInputToChangeScene',
      'gotoSegment',
    ],
  );
  assert.deepEqual(calls.find(({method}) => method === 'video')?.payload, {
    id: 'movie',
    url: 'https://example.com/movie.webm',
    x: 0,
    y: 0,
    width: 320,
    height: 180,
    plane: 'background',
    zIndex: -2,
  });
  assert.deepEqual(calls.find(({method}) => method === 'videoControl')?.payload, {
    id: 'movie',
    operation: 'play',
  });
  assert.deepEqual(
    requireRecord(
      requireDefined(
        calls.find(({method}) => method === 'setTransparency'),
        'the setTransparency call',
      ).payload,
      'its payload',
    ),
    {
      target: 'Hero',
      transparency: 50,
    },
  );
  assert.deepEqual(
    requireRecord(
      requireDefined(
        calls.find(({method}) => method === 'setSkin'),
        'the setSkin call',
      ).payload,
      'its payload',
    ),
    {
      target: 'Hero',
      skin: 'HeroIdle',
      scale: 45,
    },
  );
  assert.deepEqual(
    requireRecord(
      requireDefined(
        calls.find(({method}) => method === 'waitForPose'),
        'the waitForPose call',
      ).payload,
      'its payload',
    ),
    {
      target: 'Hero',
      pose: 'happy',
      stepIndex: 0,
      stepCount: 1,
      recognitionModel: 'RescueModel',
      recognitionMode: 'pose',
      recognition: {
        confidenceThreshold: 0.6,
        fullConfidenceHoldSeconds: 1.5,
        idleChargePerSecond: 0.1,
        idleSound: 'Effect',
        chargeSound: 'Effect',
        feedback: {mode: 'scratchMirror'},
        navigation: {allowSkip: false},
      },
    },
  );
  assert.deepEqual(
    requireRecord(
      requireDefined(
        calls.find(({method}) => method === 'poseInputToChangeScene'),
        'the poseInputToChangeScene call',
      ).payload,
      'its payload',
    ),
    {
      labels: ['happy', 'jump'],
      recognitionModel: 'RescueModel',
      recognitionMode: 'pose',
      recognition: {
        accumulationPerSecond: 2,
        decayPerSecond: 0.8,
        scoreThreshold: 1,
      },
    },
  );
  assert.deepEqual(
    requireRecord(
      requireDefined(
        calls.find(({method}) => method === 'imageInputToChangeScene'),
        'the imageInputToChangeScene call',
      ).payload,
      'its payload',
    ),
    {
      labels: ['ready'],
      recognitionModel: 'RescueModel',
      recognitionMode: 'image',
      recognition: {
        accumulationPerSecond: 2,
        decayPerSecond: 0.8,
        scoreThreshold: 1,
      },
    },
  );
  assert.deepEqual(
    requireRecord(
      requireDefined(
        calls.find(({method}) => method === 'moveTo'),
        'the moveTo call',
      ).payload,
      'its payload',
    ),
    {
      target: 'Hero',
      x: 10,
      y: 20,
      seconds: 0,
      easing: 'easeOut',
    },
  );
  const trace = traceOf(controller);
  assert.deepEqual(
    trace.map(({sequence}) => sequence),
    trace.map((_event, index) => index),
  );
  assert.ok(trace.every(({storyPath}) => typeof storyPath === 'string'));
  assert.ok(
    trace
      .filter(({type}) => type === 'scene.enter')
      .every(({storyPath}) =>
        requireString(storyPath, 'a trace story path').startsWith('/scenes/'),
      ),
  );
  assert.equal(trace.filter(({type}) => type === 'action.start').length, 36);
  assert.equal(trace.filter(({type}) => type === 'action.commit').length, 36);
  assert.equal(requireDefined(trace.at(-1), 'the last trace event').type, 'runtime.finish');
  const transitions = trace
    .filter(({type}) => type === 'scene.transition')
    .map(({details}) => details);
  assert.deepEqual(
    transitions.map(({to, reason}) => [to, reason]),
    [
      ['opening', 'start'],
      ['branching', 'goto'],
      ['keyChoice', 'branch'],
      ['touchChoice', 'keyInput'],
      ['poseChoice', 'touchInput'],
      ['imageChoice', 'poseInput'],
      ['ending', 'imageInput'],
    ],
  );
  assert.equal(
    transitions.some(({reason}) => reason === 'transition'),
    false,
  );
});

test('invokes TurboWarp actions through the active dispatcher context and commits nested navigation', async () => {
  const storyDocument = parseStory(`
kamishibai: '4.0'
assets:
  Beach: backdrop
scenes:
  opening:
    - broadcastMessageAndWait: receiver
    - wait: 0
  ending:
    - wait: 0
`);
  const contexts: Record<string, unknown>[] = [];
  const active: {controller?: Controller} = {};
  const nestedResults: Record<string, unknown>[] = [];
  const controller = (active.controller = createDsl4RuntimeController({
    storyDocument,
    broadcastMessageAndWaitEnabled: true,
    port: {
      async broadcastMessageAndWait(_payload: PortPayload, context: ActionContext) {
        contexts.push(context);
        nestedResults.push(
          await requireDefined(active.controller, 'the controller').invokeAction({
            command: 'stage',
            target: null,
            args: {backdrop: 'Beach'},
          }),
        );
        nestedResults.push(
          await requireDefined(active.controller, 'the controller').invokeAction({
            command: 'goto',
            target: null,
            args: {scene: 'ending'},
          }),
        );
      },
      async stage(_payload: PortPayload, context: ActionContext) {
        contexts.push(context);
      },
      async wait() {},
    },
  }));

  await controller.start();

  assert.equal(contexts.length, 2);
  assert.equal(contexts[0], contexts[1]);
  assert.deepEqual(nestedResults, [
    {outcome: 'completed'},
    {outcome: 'transitioned', sceneId: 'ending', reason: 'goto'},
  ]);
  assert.equal(controller.getState().status, 'finished');
  assert.equal(controller.getState().sceneId, 'ending');
  assert.deepEqual(
    traceOf(controller)
      .filter(({type}) => type === 'scene.enter')
      .map(({sceneId}) => sceneId),
    ['opening', 'ending'],
  );
  await assert.rejects(
    controller.invokeAction({command: 'wait', target: null, args: {seconds: 0}}),
    (error) => thrown(error).code === 'K4-RUNTIME-INVOKE-INACTIVE',
  );
});

test('fails deterministically when TurboWarp receivers request competing scene transitions', async () => {
  const storyDocument = parseStory(`
kamishibai: '4.0'
scenes:
  opening:
    - broadcastMessageAndWait: receiver
  first: []
  second: []
`);
  const active: {controller?: Controller} = {};
  const controller = (active.controller = createDsl4RuntimeController({
    storyDocument,
    broadcastMessageAndWaitEnabled: true,
    port: {
      async broadcastMessageAndWait() {
        await Promise.allSettled([
          controller.invokeAction({command: 'goto', target: null, args: {scene: 'first'}}),
          controller.invokeAction({command: 'goto', target: null, args: {scene: 'second'}}),
        ]);
      },
    },
  }));

  await controller.start();

  assert.equal(controller.getState().status, 'failed');
  assert.equal(diagnosticOf(controller.getState()).code, 'K4-RUNTIME-INVOKE-TRANSITION-CONFLICT');
  assert.deepEqual(
    traceOf(controller)
      .filter(({type}) => type === 'scene.enter')
      .map(({sceneId}) => sceneId),
    ['opening'],
  );
});

test('cancels a nested TurboWarp action with the parent DSL action signal', async () => {
  const storyDocument = parseStory(`
kamishibai: '4.0'
scenes:
  opening:
    - broadcastMessageAndWait: receiver
`);
  const active: {controller?: Controller} = {};
  let nestedInvocation: Promise<unknown> | undefined;
  let parentContext: ActionContext | undefined;
  let nestedContext: ActionContext | undefined;
  const controller = (active.controller = createDsl4RuntimeController({
    storyDocument,
    broadcastMessageAndWaitEnabled: true,
    port: {
      broadcastMessageAndWait(_payload: PortPayload, context: ActionContext) {
        parentContext = context;
        nestedInvocation = requireDefined(active.controller, 'the controller').invokeAction({
          command: 'wait',
          target: null,
          args: {seconds: 10},
        });
        return nestedInvocation;
      },
      wait(_payload: PortPayload, context: ActionContext) {
        nestedContext = context;
        return new Promise((_resolve, reject) => {
          signalOf(context).addEventListener(
            'abort',
            () => {
              const error = new Error('nested wait cancelled');
              error.name = 'AbortError';
              reject(error);
            },
            {once: true},
          );
        });
      },
    },
  }));

  const run = controller.start();
  await waitFor(() => nestedInvocation !== undefined, 'nested action did not start');
  assert.equal(parentContext, nestedContext);
  controller.stop('test-stop');

  await assert.rejects(requireDefined(nestedInvocation, 'the nested invocation'), {
    name: 'AbortError',
  });
  await run;
  assert.equal(signalOf(requireDefined(nestedContext, 'the nested context')).aborted, true);
  assert.equal(controller.getState().status, 'stopped');
});

test('keeps the parent action open until unawaited TurboWarp invocations settle', async () => {
  const storyDocument = parseStory(`
kamishibai: '4.0'
assets:
  Beach: backdrop
scenes:
  opening:
    - stage: Beach
`);
  const nestedWait = deferred();
  const active: {controller?: Controller} = {};
  let nestedInvocation: Promise<unknown> | undefined;
  const controller = (active.controller = createDsl4RuntimeController({
    storyDocument,
    port: {
      stage() {
        nestedInvocation = requireDefined(active.controller, 'the controller').invokeAction({
          command: 'wait',
          target: null,
          args: {seconds: 1},
        });
      },
      wait() {
        return nestedWait.promise;
      },
    },
  }));

  const run = controller.start();
  await waitFor(() => nestedInvocation !== undefined, 'nested wait did not start');
  await Promise.resolve();
  assert.equal(controller.getState().status, 'running');
  nestedWait.resolve();

  assert.deepEqual(await nestedInvocation, {outcome: 'completed'});
  await run;
  assert.equal(controller.getState().status, 'finished');
});

test('writes story variables from the script alone through the core actions', async () => {
  const storyDocument = parseStory(`
kamishibai: '4.0'
variables:
  score: 0
  ready: false
  title: start
branches:
  result:
    - if: reached
      goto: success
    - else: failure
scenes:
  opening:
    - setVariable:
        name: score
        value: 5
    - changeVariable:
        name: score
        by: -2
    - toggleVariable: ready
    - setVariable:
        name: title
        value: done
    - branch: result
  failure: []
  success: []
`);
  const evaluatedVariables: Record<string, unknown>[] = [];
  const controller = createDsl4RuntimeController({
    storyDocument,
    evaluateCondition(_expression, variables) {
      evaluatedVariables.push({...variables});
      return variables.score === 3;
    },
    port: {},
  });

  await controller.start();

  assert.equal(controller.getState().status, 'finished');
  // `set` then `change` then `toggle` all committed, each at its own action boundary.
  assert.deepEqual(evaluatedVariables, [
    {score: 3, ready: true, title: 'done', startSceneIndex: 1},
  ]);
  assert.deepEqual(
    traceOf(controller)
      .filter(({type}) => type === 'scene.enter')
      .map(({sceneId}) => sceneId),
    ['opening', 'success'],
  );
});

test('fails the action when a core action writes an undeclared story variable', async () => {
  const storyDocument = parseStory(`
kamishibai: '4.0'
variables:
  score: 0
scenes:
  opening:
    - setVariable:
        name: score
        value: 1
    - changeVariable:
        name: missing
        by: 1
  ending: []
`);
  const controller = createDsl4RuntimeController({storyDocument, port: {}});

  await controller.start();

  assert.equal(controller.getState().status, 'failed');
  assert.equal(diagnosticOf(controller.getState()).code, 'K4-VARIABLE-WRITE-UNKNOWN');
});

test('fails the action when a core action writes the wrong story variable type', async () => {
  const storyDocument = parseStory(`
kamishibai: '4.0'
variables:
  score: 0
scenes:
  opening:
    - setVariable:
        name: score
        value: not-a-number
  ending: []
`);
  const controller = createDsl4RuntimeController({storyDocument, port: {}});

  await controller.start();

  assert.equal(controller.getState().status, 'failed');
  assert.equal(diagnosticOf(controller.getState()).code, 'K4-VARIABLE-WRITE-TYPE');
});

test('commits typed TurboWarp story-variable writes in acceptance order at the action boundary', async () => {
  const storyDocument = parseStory(`
kamishibai: '4.0'
variables:
  score: 0
  title: start
branches:
  result:
    - if: score == 3
      goto: success
    - else: failure
scenes:
  opening:
    - broadcastMessageAndWait: receiver
    - branch: result
  failure: []
  success: []
`);
  const active: {controller?: Controller} = {};
  let variablesDuringReceiver;
  const evaluatedVariables: Record<string, unknown>[] = [];
  const controller = (active.controller = createDsl4RuntimeController({
    storyDocument,
    broadcastMessageAndWaitEnabled: true,
    evaluateCondition(_expression, variables) {
      evaluatedVariables.push({...variables});
      return variables.score === 3;
    },
    port: {
      broadcastMessageAndWait() {
        assert.deepEqual(
          controller.queueVariableWrite({
            operation: 'set',
            name: 'score',
            value: 1,
          }),
          {accepted: true, code: ''},
        );
        assert.deepEqual(
          controller.queueVariableWrite({
            operation: 'change',
            name: 'score',
            value: 2,
          }),
          {accepted: true, code: ''},
        );
        variablesDuringReceiver = controller.getState().variables;
      },
    },
  }));

  await controller.start();

  assert.deepEqual(variablesDuringReceiver, {score: 0, title: 'start', startSceneIndex: 1});
  assert.equal(requireRecord(controller.getState().variables, 'the runtime variables').score, 3);
  assert.deepEqual(evaluatedVariables, [{score: 3, title: 'start', startSceneIndex: 1}]);
  assert.equal(controller.getState().sceneId, 'success');
  assert.deepEqual(controller.queueVariableWrite({operation: 'set', name: 'score', value: 4}), {
    accepted: false,
    code: 'K4-VARIABLE-WRITE-INACTIVE',
  });
});

test('rejects invalid typed writes and discards accepted writes when the action is cancelled', async () => {
  const storyDocument = parseStory(`
kamishibai: '4.0'
variables:
  score: 0
  ready: false
scenes:
  opening:
    - broadcastMessageAndWait: receiver
`);
  const receiver = deferred();
  const active: {controller?: Controller} = {};
  let accepted: unknown;
  const controller = (active.controller = createDsl4RuntimeController({
    storyDocument,
    broadcastMessageAndWaitEnabled: true,
    port: {
      broadcastMessageAndWait() {
        assert.equal(
          controller.queueVariableWrite({operation: 'set', name: 'missing', value: 1}).code,
          'K4-VARIABLE-WRITE-UNKNOWN',
        );
        assert.equal(
          controller.queueVariableWrite({operation: 'set', name: 'ready', value: 1}).code,
          'K4-VARIABLE-WRITE-TYPE',
        );
        assert.equal(
          controller.queueVariableWrite({operation: 'set', name: 'score', value: Number.NaN}).code,
          'K4-VARIABLE-WRITE-VALUE',
        );
        accepted = controller.queueVariableWrite({operation: 'set', name: 'score', value: 9});
        return receiver.promise;
      },
    },
  }));

  const run = controller.start();
  await waitFor(() => accepted !== undefined, 'story-variable write was not queued');
  assert.deepEqual(accepted, {accepted: true, code: ''});
  controller.stop('test-cancel');
  receiver.resolve();
  await run;

  assert.equal(controller.getState().status, 'stopped');
  assert.equal(requireRecord(controller.getState().variables, 'the runtime variables').score, 0);
});

test('uses one branch snapshot when a story-variable write arrives between rules', async () => {
  const storyDocument = parseStory(`
kamishibai: '4.0'
variables:
  score: 0
branches:
  stable:
    - if: score == 1
      goto: changed
    - if: score == 0
      goto: stable
    - else: failed
scenes:
  opening:
    - branch: stable
  changed: []
  failed: []
  stable: []
`);
  const observed: Record<string, unknown>[] = [];
  const active: {controller?: Controller} = {};
  const controller = (active.controller = createDsl4RuntimeController({
    storyDocument,
    evaluateCondition(expression, variables): boolean {
      observed.push(variables);
      if (observed.length === 1) {
        assert.deepEqual(
          requireDefined(active.controller, 'the controller').queueVariableWrite({
            operation: 'set',
            name: 'score',
            value: 1,
          }),
          {accepted: true, code: ''},
        );
      }
      return expression === 'score == 0' && variables.score === 0;
    },
    port: {},
  }));

  await controller.start();

  assert.equal(observed.length, 2);
  assert.strictEqual(observed[0], observed[1]);
  assert.equal(requireDefined(observed[1], 'the second evaluation').score, 0);
  assert.equal(requireRecord(controller.getState().variables, 'the runtime variables').score, 1);
  assert.equal(
    traceOf(controller).some((event) => event.type === 'scene.enter' && event.sceneId === 'stable'),
    true,
  );
});

test('maps a block normalization rejection to the active runtime diagnostic', async () => {
  const storyDocument = parseStory(`
kamishibai: '4.0'
scenes:
  opening:
    - broadcastMessageAndWait: receiver
`);
  const active: {controller?: Controller} = {};
  const controller = (active.controller = createDsl4RuntimeController({
    storyDocument,
    broadcastMessageAndWaitEnabled: true,
    port: {
      async broadcastMessageAndWait() {
        const error = new Error('invalid block input');
        Object.defineProperty(error, 'code', {value: 'K4-BLOCK-ACTION-SCHEMA-001'});
        await assert.rejects(
          controller.rejectActionInvocation(error),
          (failure) => failure === error,
        );
      },
    },
  }));

  await controller.start();

  assert.equal(controller.getState().status, 'failed');
  assert.equal(diagnosticOf(controller.getState()).code, 'K4-BLOCK-ACTION-SCHEMA-001');
});

test('applies effective pose preview mirroring on every scene entry without changing recognition', async () => {
  const storyDocument = parseStory(`
kamishibai: '4.0'
assets:
  Tick: sound
  Charge: sound
  HeroIdle: costume:Hero
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
actors:
  Hero: HeroIdle
recognition:
  idleSound: Tick
  chargeSound: Charge
  preview:
    mirroring: unmirrored
scenes:
  opening:
    recognitionModel: RescuePose
    posePreview:
      mirroring: mirrored
    actions:
      - Hero.pose:
          steps:
            - pose: wave
  reset:
    recognitionModel: RescuePose
    actions: []
`);
  const calls: Record<string, unknown>[] = [];
  const controller = createDsl4RuntimeController({
    storyDocument,
    posePreviewMirroringEnabled: true,
    port: {
      setPosePreviewMirroring(mode) {
        calls.push({method: 'setPosePreviewMirroring', mode});
      },
      waitForPose(payload: PortPayload) {
        calls.push({method: 'waitForPose', payload});
      },
    },
  });

  const finished = await controller.start();
  assert.equal(finished.status, 'finished');
  assert.deepEqual(
    calls.map(({method, mode}) => [method, mode]),
    [
      ['setPosePreviewMirroring', 'mirrored'],
      ['waitForPose', undefined],
      ['setPosePreviewMirroring', 'unmirrored'],
    ],
  );
  const recognition = requireRecord(
    requireDefined(
      calls.find(({method}) => method === 'waitForPose'),
      'the waitForPose call',
    ).payload,
    'its payload',
  ).recognition;
  assert.equal(
    Object.hasOwn(requireRecord(recognition, 'the recognition payload'), 'preview'),
    false,
  );
  assert.deepEqual(recognition, {
    confidenceThreshold: 0.5,
    fullConfidenceHoldSeconds: 1,
    idleChargePerSecond: 0,
    idleSound: 'Tick',
    chargeSound: 'Charge',
    feedback: {mode: 'scratchMirror'},
    navigation: {allowSkip: false},
  });

  controller.reposition('opening');
  controller.reposition('reset');
  assert.deepEqual(
    calls.slice(-2).map(({mode}) => mode),
    ['mirrored', 'unmirrored'],
  );
});

test('keeps pose preview mirroring disabled without inspecting its runtime port', async () => {
  const port = {};
  Object.defineProperty(port, 'setPosePreviewMirroring', {
    get() {
      assert.fail('disabled pose preview mirroring must not inspect its runtime port');
    },
  });
  const storyDocument = parseStory("kamishibai: '4.0'\nscenes:\n  opening: []\n");
  const controller = createDsl4RuntimeController({storyDocument, port});
  assert.equal((await controller.start()).status, 'finished');
  assert.throws(
    () =>
      createDsl4RuntimeController({
        storyDocument,
        port: {},
        posePreviewMirroringEnabled: true,
      }),
    /setPosePreviewMirroring/u,
  );
  assert.throws(
    () =>
      createDsl4RuntimeController(
        invalidControllerOptions({storyDocument, port: {}, posePreviewMirroringEnabled: 'yes'}),
      ),
    /posePreviewMirroringEnabled/u,
  );
});

test('fails closed before scene publication when pose preview mirroring cannot be applied', async () => {
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory("kamishibai: '4.0'\nscenes:\n  opening: []\n"),
    posePreviewMirroringEnabled: true,
    port: {
      setPosePreviewMirroring() {
        throw new Error('preview unavailable');
      },
    },
  });

  const result = await controller.start();
  assert.equal(result.status, 'failed');
  assert.equal(
    traceOf(controller).some(({type}) => type === 'scene.enter'),
    false,
  );
});

test('preserves non-default pose policy and increments stepIndex across ordered steps', async () => {
  const calls: Record<string, unknown>[] = [];
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  Tick: sound
  Charge: sound
  HeroIdle: costume:Hero
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
actors:
  Hero: HeroIdle
recognition:
  idleSound: Tick
  chargeSound: Charge
  feedback:
    mode: presenter
  navigation:
    allowSkip: true
scenes:
  rescue:
    recognitionModel: RescuePose
    actions:
      - Hero.pose:
          steps:
            - pose: help
            - pose: stand
`),
    port: {
      waitForPose: async (payload: PortPayload) => calls.push(payload),
    },
  });

  const state = await controller.start();
  assert.equal(state.status, 'finished');
  assert.deepEqual(
    calls.map(({pose, stepIndex, recognition}) => ({pose, stepIndex, recognition})),
    [
      {
        pose: 'help',
        stepIndex: 0,
        recognition: {
          confidenceThreshold: 0.5,
          fullConfidenceHoldSeconds: 1,
          idleChargePerSecond: 0,
          idleSound: 'Tick',
          chargeSound: 'Charge',
          feedback: {mode: 'presenter'},
          navigation: {allowSkip: true},
        },
      },
      {
        pose: 'stand',
        stepIndex: 1,
        recognition: {
          confidenceThreshold: 0.5,
          fullConfidenceHoldSeconds: 1,
          idleChargePerSecond: 0,
          idleSound: 'Tick',
          chargeSound: 'Charge',
          feedback: {mode: 'presenter'},
          navigation: {allowSkip: true},
        },
      },
    ],
  );
});

test('runs every Actor.pose step in order with optional skin and sound', async () => {
  const calls: unknown[][] = [];
  const poseCalls: Record<string, unknown>[] = [];
  const story = parseStory(`
kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
  FirstSkin: costume:Hero
  LastSkin: costume:Hero
  Effect: sound
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
actors:
  Hero: HeroIdle
scenes:
  opening:
    recognitionModel: RescuePose
    actions:
      - Hero.pose:
          steps:
            - pose: first
              skin: FirstSkin
              sound: Effect
            - pose: middle
            - pose: last
              skin: LastSkin
`);
  const controller = createDsl4RuntimeController({
    storyDocument: story,
    port: {
      setSkin: async ({skin}: PortPayload) => calls.push(['skin', skin]),
      waitForPose: async (
        {pose, recognition, stepIndex, stepCount}: PortPayload,
        context: ActionContext,
      ) => {
        calls.push(['wait', pose, recognition]);
        poseCalls.push({
          stepIndex,
          stepCount,
          signal: context.signal,
          actionSignal: context.actionSignal,
        });
      },
      bgm: async ({sound}: PortPayload) => calls.push(['bgm', sound]),
    },
  });

  const state = await controller.start();

  assert.equal(state.status, 'finished');
  assert.deepEqual(
    calls.map(([method, value]) => [method, value]),
    [
      ['skin', 'FirstSkin'],
      ['wait', 'first'],
      ['bgm', 'Effect'],
      ['wait', 'middle'],
      ['skin', 'LastSkin'],
      ['wait', 'last'],
    ],
  );
  assert.deepEqual(callArgument(calls, 1, 2), {
    confidenceThreshold: 0.5,
    fullConfidenceHoldSeconds: 1,
    idleChargePerSecond: 0,
    idleSound: null,
    chargeSound: null,
    feedback: {mode: 'scratchMirror'},
    navigation: {allowSkip: false},
  });
  assert.deepEqual(
    poseCalls.map(({stepIndex, stepCount}) => [stepIndex, stepCount]),
    [
      [0, 3],
      [1, 3],
      [2, 3],
    ],
  );
  assert.ok(
    poseCalls.every(
      ({actionSignal}) =>
        actionSignal === requireDefined(poseCalls[0], 'the first pose call').actionSignal,
    ),
  );
  assert.equal(new Set(poseCalls.map(({signal}) => signal)).size, 3);
  assert.ok(poseCalls.every(({signal, actionSignal}) => signal !== actionSignal));
});

test('advances through empty scenes and the final scene deterministically', async () => {
  const story = parseStory(`
kamishibai: '4.0'
scenes:
  first: []
  second:
    - wait: 0
  final: []
`);
  let waits = 0;
  const controller = createDsl4RuntimeController({
    storyDocument: story,
    port: {wait: async () => waits++},
  });
  const state = await controller.start();
  assert.equal(state.status, 'finished');
  assert.equal(waits, 1);
  assert.deepEqual(
    traceOf(controller)
      .filter(({type}) => type === 'scene.enter')
      .map(({sceneId}) => sceneId),
    ['first', 'second', 'final'],
  );
});

test('hides every story actor before publishing each scene entry', async () => {
  const order: unknown[][] = [];
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  HeroSkin: costume:Hero
  GuideSkin: costume:Guide
actors:
  Hero: HeroSkin
  Guide: GuideSkin
scenes:
  first: []
  final: []
`),
    port: {
      hideSceneActors(transition) {
        order.push(['hide', transition]);
      },
    },
    onEvent(event) {
      if (event.type === 'scene.enter') order.push(['enter', event.sceneId]);
    },
  });

  const state = await controller.start();

  assert.equal(state.status, 'finished');
  assert.deepEqual(order, [
    ['hide', {actors: ['Hero', 'Guide'], from: null, to: 'first', reason: 'start'}],
    ['enter', 'first'],
    ['hide', {actors: ['Hero', 'Guide'], from: 'first', to: 'final', reason: 'sequential'}],
    ['enter', 'final'],
  ]);
  assert.equal(Object.isFrozen(callArgument(order, 0, 1)), true);
  assert.equal(
    Object.isFrozen(requireRecord(callArgument(order, 0, 1), 'the hide payload').actors),
    true,
  );
});

test('fails before publishing a destination scene when actor hiding fails', async () => {
  let resetCount = 0;
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  HeroSkin: costume:Hero
actors:
  Hero: HeroSkin
scenes:
  first: []
  final: []
`),
    port: {
      hideSceneActors() {
        resetCount += 1;
        if (resetCount === 2) throw new Error('actor hide failed');
      },
    },
  });

  const state = await controller.start();

  assert.equal(state.status, 'failed');
  assert.equal(state.sceneId, 'first');
  assert.deepEqual(
    traceOf(controller)
      .filter(({type}) => type === 'scene.enter')
      .map(({sceneId}) => sceneId),
    ['first'],
  );
});

for (const [label, truthyExpression, destination, evaluated] of [
  ['first matching rule', 'first', 'firstScene', ['first']],
  ['later matching rule', 'second', 'secondScene', ['first', 'second']],
  ['final else rule', null, 'elseScene', ['first', 'second']],
]) {
  test(`branch selects the ${label}`, async () => {
    const story = parseStory(`
kamishibai: '4.0'
branches:
  route:
    - if: first
      goto: firstScene
    - if: second
      goto: secondScene
    - else: elseScene
scenes:
  opening:
    - branch: route
  firstScene: []
  secondScene: []
  elseScene: []
`);
    const expressions: string[] = [];
    const controller = createDsl4RuntimeController({
      storyDocument: story,
      port: {},
      evaluateCondition(expression) {
        expressions.push(expression);
        return expression === truthyExpression;
      },
    });
    await controller.start();
    assert.deepEqual(expressions, evaluated);
    const branchTransition = requireDefined(
      traceOf(controller).find(
        ({type, details}) => type === 'scene.transition' && details.reason === 'branch',
      ),
      'the branch transition',
    );
    assert.equal(branchTransition.details.to, destination);
  });
}

test('stop aborts the current action and ignores its stale completion', async () => {
  const pending = deferred();
  let stageCalls = 0;
  let waitSignal: AbortSignal | undefined;
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  Beach: backdrop
scenes:
  opening:
    - wait: 1
    - stage: Beach
`),
    port: {
      wait: (_payload: PortPayload, context: ActionContext) => {
        waitSignal = signalOf(context);
        return pending.promise;
      },
      stage: async () => stageCalls++,
    },
  });
  const run = controller.start();
  const stopped = controller.stop('test-stop');
  assert.equal(stopped.status, 'stopped');
  assert.equal(requireDefined(waitSignal, 'the wait signal').aborted, true);
  pending.resolve();
  const final = await run;
  assert.equal(final.status, 'stopped');
  assert.equal(stageCalls, 0);
  assert.deepEqual(
    traceOf(controller)
      .filter(({type}) => type === 'action.commit' || type === 'action.cancel')
      .map(({type}) => type),
    ['action.cancel'],
  );
});

test('cancelled pose keeps the current skin but does not sound or start a later step', async () => {
  const pendingPose = deferred();
  const poseStarted = deferred();
  const effects: string[] = [];
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
  HeroHappy: costume:Hero
  HeroLater: costume:Hero
  Effect: sound
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
actors:
  Hero: HeroIdle
scenes:
  opening:
    recognitionModel: RescuePose
    actions:
      - Hero.pose:
          steps:
            - pose: happy
              skin: HeroHappy
              sound: Effect
            - pose: later
              skin: HeroLater
              sound: Effect
`),
    port: {
      waitForPose: ({pose}: PortPayload) => {
        effects.push(`wait:${pose}`);
        poseStarted.resolve();
        return pendingPose.promise;
      },
      setSkin: async ({skin}: PortPayload) => effects.push(`skin:${skin}`),
      bgm: async ({sound}: PortPayload) => effects.push(`bgm:${sound}`),
    },
  });
  const run = controller.start();
  await poseStarted.promise;
  controller.stop('cancel-pose');
  pendingPose.resolve();
  const state = await run;
  assert.equal(state.status, 'stopped');
  assert.deepEqual(effects, ['skin:HeroHappy', 'wait:happy']);
});

test('cancelled branch does not evaluate later rules', async () => {
  const firstCondition = deferred<boolean>();
  const evaluated: string[] = [];
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
branches:
  route:
    - if: first
      goto: destination
    - if: second
      goto: destination
    - else: destination
scenes:
  opening:
    - branch: route
  destination: []
`),
    port: {},
    evaluateCondition(expression): boolean | Promise<boolean> {
      evaluated.push(expression);
      return expression === 'first' ? firstCondition.promise : false;
    },
  });
  const run = controller.start();
  controller.stop('cancel-branch');
  firstCondition.resolve(false);
  const state = await run;
  assert.equal(state.status, 'stopped');
  assert.deepEqual(evaluated, ['first']);
});

test('restart isolates the new run from completion of the cancelled run', async () => {
  const firstWait = deferred();
  let waits = 0;
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
scenes:
  opening:
    - wait: 0
`),
    port: {
      wait: () => {
        waits += 1;
        return waits === 1 ? firstWait.promise : Promise.resolve();
      },
    },
  });
  const cancelledRun = controller.start();
  const currentRun = controller.start();
  const currentState = await currentRun;
  assert.equal(currentState.status, 'finished');
  firstWait.resolve();
  await cancelledRun;
  assert.equal(controller.getState().status, 'finished');
  assert.equal(controller.getRunPromise(), null);
  assert.equal(waits, 2);
});

test('navigation cancels the old action and keeps non-position variables', async () => {
  const pending = deferred();
  let stageCalls = 0;
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  Beach: backdrop
variables:
  score: 1
scenes:
  opening:
    - wait: 1
  destination:
    - stage: Beach
`),
    port: {
      wait: (_payload: PortPayload, context: ActionContext) => {
        setVariableOf(context)('score', 2);
        return pending.promise;
      },
      stage: async () => stageCalls++,
    },
  });
  const staleRun = controller.start();
  const navigatedRun = controller.navigate('destination', {reason: 'history.previousScene'});
  const navigatedState = await navigatedRun;
  assert.equal(navigatedState.status, 'finished');
  assert.equal(requireRecord(navigatedState.variables, 'the runtime variables').score, 2);
  assert.equal(stageCalls, 1);
  pending.resolve();
  await staleRun;
  assert.equal(stageCalls, 1);
  assert.ok(
    traceOf(controller).some(
      ({type, details}) => type === 'action.cancel' && details.reason === 'history.previousScene',
    ),
  );
});

test('advance cancels the current action and executes the next action once', async () => {
  const pending = deferred();
  let stageCalls = 0;
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  Beach: backdrop
variables:
  score: 1
scenes:
  opening:
    - wait: 1
    - stage: Beach
`),
    port: {
      wait: (_payload: PortPayload, context: ActionContext) => {
        setVariableOf(context)('score', 2);
        return pending.promise;
      },
      stage: async () => stageCalls++,
    },
  });
  const staleRun = controller.start();
  const advancedState = await controller.advance();
  assert.equal(advancedState.status, 'finished');
  assert.equal(requireRecord(advancedState.variables, 'the runtime variables').score, 2);
  assert.equal(stageCalls, 1);
  pending.resolve();
  await staleRun;
  assert.equal(stageCalls, 1);
  const advanceEvent = requireDefined(
    traceOf(controller).find(({type}) => type === 'navigation.advance'),
    'the advance event',
  );
  assert.deepEqual(
    [advanceEvent.details.fromStoryPath, advanceEvent.details.toStoryPath],
    ['/scenes/opening/actions/0', '/scenes/opening/actions/1'],
  );
});

function poseNavigationStory(allowSkip: boolean, feedbackMode = 'scratchMirror') {
  return parseStory(`
kamishibai: '4.0'
assets:
  Tick: sound
  Charge: sound
  HeroIdle: costume:Hero
  Beach: backdrop
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
actors:
  Hero: HeroIdle
recognition:
  idleSound: Tick
  chargeSound: Charge
  feedback:
    mode: ${feedbackMode}
  navigation:
    allowSkip: ${allowSkip}
scenes:
  rescue:
    recognitionModel: RescuePose
    actions:
      - Hero.pose:
          steps:
            - pose: help
      - stage: Beach
`);
}

function poseWaitWithDeferredCleanup(cleanup: {promise: Promise<unknown>}, events: unknown[]) {
  return (_payload: PortPayload, context: ActionContext) =>
    new Promise((_resolve, reject) => {
      signalOf(context).addEventListener(
        'abort',
        () => {
          events.push('abort');
          void cleanup.promise.then(() => {
            events.push('cleanup');
            const error = new Error('pose wait cancelled');
            error.name = 'AbortError';
            reject(error);
          });
        },
        {once: true},
      );
    });
}

function poseSuboperationStory() {
  return parseStory(`
kamishibai: '4.0'
assets:
  Tick: sound
  Charge: sound
  StepSound: sound
  HeroIdle: costume:Hero
  HeroReady: costume:Hero
  Beach: backdrop
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
actors:
  Hero: HeroIdle
recognition:
  idleSound: Tick
  chargeSound: Charge
  navigation:
    allowSkip: false
scenes:
  rescue:
    recognitionModel: RescuePose
    actions:
      - Hero.pose:
          steps:
            - pose: help
              skin: HeroReady
              sound: StepSound
      - stage: Beach
`);
}

test('pose navigation policy refuses nextAction without cancelling an unskippable pose', async () => {
  const cleanup = deferred();
  const events: Record<string, unknown>[] = [];
  let stageCalls = 0;
  const controller = createDsl4RuntimeController({
    storyDocument: poseNavigationStory(false),
    poseNavigationPolicyEnabled: true,
    port: {
      waitForPose: poseWaitWithDeferredCleanup(cleanup, events),
      stage: async () => stageCalls++,
    },
  });

  const run = controller.start();
  assert.equal(controller.canAdvance('navigation.nextAction'), false);
  const unchanged = await controller.advance('navigation.nextAction');
  assert.equal(unchanged.status, 'running');
  assert.deepEqual(events, []);
  assert.equal(stageCalls, 0);

  controller.stop('test-cleanup');
  cleanup.resolve();
  await run;
  assert.deepEqual(events, ['abort', 'cleanup']);
});

test('pose navigation policy is independent of all feedback modes', async () => {
  for (const feedbackMode of ['scratchMirror', 'scratchBinding', 'presenter']) {
    const blockedCleanup = deferred();
    const blocked = createDsl4RuntimeController({
      storyDocument: poseNavigationStory(false, feedbackMode),
      poseNavigationPolicyEnabled: true,
      port: {
        waitForPose: poseWaitWithDeferredCleanup(blockedCleanup, []),
        stage: async () => {},
      },
    });
    const blockedRun = blocked.start();
    assert.equal(blocked.canAdvance('navigation.nextAction'), false, feedbackMode);
    blocked.stop('test-cleanup');
    blockedCleanup.resolve();
    await blockedRun;

    const allowedCleanup = deferred();
    const allowed = createDsl4RuntimeController({
      storyDocument: poseNavigationStory(true, feedbackMode),
      poseNavigationPolicyEnabled: true,
      port: {
        waitForPose: poseWaitWithDeferredCleanup(allowedCleanup, []),
        stage: async () => {},
      },
    });
    const allowedRun = allowed.start();
    assert.equal(allowed.canAdvance('navigation.nextAction'), true, feedbackMode);
    allowed.stop('test-cleanup');
    allowedCleanup.resolve();
    await allowedRun;
  }
});

test('the playback settings skip choice overrides the story allowSkip while the story runs', async () => {
  let override: boolean | null = true;
  const cleanup = deferred();
  const controller = createDsl4RuntimeController({
    storyDocument: poseNavigationStory(false),
    poseNavigationPolicyEnabled: true,
    skipOverride: () => override,
    port: {
      waitForPose: poseWaitWithDeferredCleanup(cleanup, []),
      stage: async () => {},
    },
  });
  const run = controller.start();
  assert.equal(controller.canAdvance('navigation.nextAction'), true, 'override allows');
  override = null;
  assert.equal(controller.canAdvance('navigation.nextAction'), false, 'null follows the story');
  override = false;
  assert.equal(controller.canAdvance('navigation.nextAction'), false, 'override forbids');
  controller.stop('test-cleanup');
  cleanup.resolve();
  await run;

  const allowedCleanup = deferred();
  const forbidden = createDsl4RuntimeController({
    storyDocument: poseNavigationStory(true),
    poseNavigationPolicyEnabled: true,
    skipOverride: () => {
      throw new Error('settings unavailable');
    },
    port: {
      waitForPose: poseWaitWithDeferredCleanup(allowedCleanup, []),
      stage: async () => {},
    },
  });
  const allowedRun = forbidden.start();
  assert.equal(
    forbidden.canAdvance('navigation.nextAction'),
    true,
    'a failing settings reader keeps the story policy',
  );
  forbidden.stop('test-cleanup');
  allowedCleanup.resolve();
  await allowedRun;

  assert.throws(
    () =>
      createDsl4RuntimeController({
        storyDocument: poseNavigationStory(true),
        skipOverride: true as unknown as () => boolean,
        port: {},
      }),
    /skipOverride must be a function/u,
  );
});

test('playback features read the normalized pose story', () => {
  assert.deepEqual(resolveDsl4PlaybackFeatures(poseNavigationStory(true)), {
    bgm: false,
    effects: true,
    skip: true,
    skipDefault: true,
    recognition: true,
  });
});

test('unskippable pose policy does not block navigation outside waitForPose', async () => {
  const skinPending = deferred();
  let skinWaitCalls = 0;
  let skinStageCalls = 0;
  const skinController = createDsl4RuntimeController({
    storyDocument: poseSuboperationStory(),
    poseNavigationPolicyEnabled: true,
    port: {
      setSkin: () => skinPending.promise,
      waitForPose: async () => skinWaitCalls++,
      bgm: async () => {},
      stage: async () => skinStageCalls++,
    },
  });
  const skinRun = skinController.start();
  assert.equal(skinController.canAdvance('navigation.nextAction'), true);
  const skinAdvance = skinController.advance('navigation.nextAction');
  assert.equal((await skinAdvance).status, 'finished');
  assert.equal(skinStageCalls, 1);
  assert.equal(skinWaitCalls, 0);
  skinPending.resolve();
  await skinRun;

  const soundPending = deferred();
  let soundCalls = 0;
  let soundStageCalls = 0;
  const soundController = createDsl4RuntimeController({
    storyDocument: poseSuboperationStory(),
    poseNavigationPolicyEnabled: true,
    port: {
      setSkin: async () => {},
      waitForPose: async () => {},
      bgm: () => {
        soundCalls += 1;
        return soundPending.promise;
      },
      stage: async () => soundStageCalls++,
    },
  });
  const soundRun = soundController.start();
  await waitFor(() => soundCalls === 1, 'pose step sound did not start');
  assert.equal(soundController.canAdvance('navigation.nextAction'), true);
  const soundAdvance = soundController.advance('navigation.nextAction');
  assert.equal((await soundAdvance).status, 'finished');
  assert.equal(soundStageCalls, 1);
  soundPending.resolve();
  await soundRun;
});

test('pose navigation policy waits for cleanup and skips the final pose step once', async () => {
  const cleanup = deferred();
  const events: string[] = [];
  let stageCalls = 0;
  const controller = createDsl4RuntimeController({
    storyDocument: poseNavigationStory(true),
    poseNavigationPolicyEnabled: true,
    port: {
      waitForPose: poseWaitWithDeferredCleanup(cleanup, events),
      stage: async () => {
        events.push('stage');
        stageCalls += 1;
      },
    },
  });

  const staleRun = controller.start();
  assert.equal(controller.canAdvance('navigation.nextAction'), true);
  const firstAdvance = controller.advance('navigation.nextAction');
  assert.equal(controller.canAdvance('navigation.nextAction'), false);
  const duplicateAdvance = controller.advance('navigation.nextAction');
  assert.strictEqual(duplicateAdvance, firstAdvance);
  assert.strictEqual(controller.getRunPromise(), staleRun);
  assert.deepEqual(events, ['abort']);
  assert.equal(stageCalls, 0);

  cleanup.resolve();
  await firstAdvance;
  await duplicateAdvance;
  await staleRun;
  const state = controller.getState();
  assert.equal(state.status, 'finished');
  assert.equal(stageCalls, 1);
  assert.deepEqual(events, ['abort', 'cleanup', 'stage']);
  assert.equal(traceOf(controller).filter(({type}) => type === 'navigation.advance').length, 0);
  assert.equal(traceOf(controller).filter(({type}) => type === 'pose.step.skip').length, 1);
  assert.equal(traceOf(controller).filter(({type}) => type === 'action.cancel').length, 0);
  assert.equal(controller.getRunPromise(), null);
});

test('Space skips only the current pose wait and starts each later step once', async () => {
  const cleanups = [deferred(), deferred()];
  const events: unknown[][] = [];
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  Tick: sound
  Charge: sound
  StepSound: sound
  HeroIdle: costume:Hero
  HeroReady: costume:Hero
  Beach: backdrop
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
actors:
  Hero: HeroIdle
recognition:
  idleSound: Tick
  chargeSound: Charge
  navigation:
    allowSkip: true
scenes:
  rescue:
    recognitionModel: RescuePose
    actions:
      - Hero.pose:
          steps:
            - pose: help
              skin: HeroReady
              sound: StepSound
            - pose: jump
              sound: StepSound
      - stage: Beach
`),
    poseNavigationPolicyEnabled: true,
    port: {
      setSkin: async ({skin}: PortPayload) => events.push(['skin', skin]),
      waitForPose: ({stepIndex}: PortPayload, context: ActionContext) =>
        new Promise((_resolve, reject) => {
          events.push(['pose', stepIndex]);
          signalOf(context).addEventListener(
            'abort',
            () => {
              events.push(['abort', stepIndex]);
              void requireDefined(cleanups[Number(stepIndex)], 'the cleanup gate').promise.then(
                () => {
                  events.push(['cleanup', stepIndex]);
                  const error = new Error('pose wait cancelled');
                  error.name = 'AbortError';
                  reject(error);
                },
              );
            },
            {once: true},
          );
        }),
      bgm: async ({sound}: PortPayload) => events.push(['bgm', sound]),
      stage: async ({backdrop}: PortPayload) => events.push(['stage', backdrop]),
    },
  });

  const run = controller.start();
  await waitFor(
    () => events.some(([type, index]) => type === 'pose' && index === 0),
    'first pose step did not start',
  );
  assert.deepEqual(events, [
    ['skin', 'HeroReady'],
    ['pose', 0],
  ]);

  const firstSkip = controller.advance('navigation.nextAction');
  const duplicateFirstSkip = controller.advance('navigation.nextAction');
  assert.strictEqual(duplicateFirstSkip, firstSkip);
  requireDefined(cleanups[0], 'the first cleanup gate').resolve();
  await firstSkip;
  await waitFor(
    () =>
      events.some((event) => {
        const [type, index] = requireArray(event, 'a recorded event');
        return type === 'pose' && index === 1;
      }),
    'second pose step did not start',
  );
  assert.equal(controller.getState().actionIndex, 0);

  const secondSkip = controller.advance('navigation.nextAction');
  requireDefined(cleanups[1], 'the second cleanup gate').resolve();
  await secondSkip;
  await run;

  assert.deepEqual(events, [
    ['skin', 'HeroReady'],
    ['pose', 0],
    ['abort', 0],
    ['cleanup', 0],
    ['pose', 1],
    ['abort', 1],
    ['cleanup', 1],
    ['stage', 'Beach'],
  ]);
  assert.deepEqual(
    traceOf(controller)
      .filter(({type}) => type === 'pose.step.skip')
      .map(({details}) => details.stepIndex),
    [0, 1],
  );
  assert.equal(traceOf(controller).filter(({type}) => type === 'action.cancel').length, 0);
  assert.equal(traceOf(controller).filter(({type}) => type === 'action.commit').length, 2);
  assert.equal(controller.getState().status, 'finished');
});

test('Space skips a pose step while its skin is still being applied', async () => {
  const events: unknown[] = [];
  const abortableWait = (event: unknown, context: ActionContext) =>
    new Promise((_resolve, reject) => {
      events.push(event);
      signalOf(context).addEventListener(
        'abort',
        () => {
          events.push([...requireArray(event, 'the recorded event'), 'abort']);
          const error = new Error('pose step operation cancelled');
          error.name = 'AbortError';
          reject(error);
        },
        {once: true},
      );
    });
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
  HeroReady: costume:Hero
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
actors:
  Hero: HeroIdle
recognition:
  navigation:
    allowSkip: true
scenes:
  rescue:
    recognitionModel: RescuePose
    actions:
      - Hero.pose:
          steps:
            - pose: help
              skin: HeroReady
            - pose: jump
`),
    poseNavigationPolicyEnabled: true,
    port: {
      setSkin: (_payload: PortPayload, context: ActionContext) =>
        abortableWait(['skin', 0], context),
      waitForPose: ({stepIndex}: PortPayload, context: ActionContext) =>
        abortableWait(['pose', stepIndex], context),
    },
  });

  const run = controller.start();
  await waitFor(() => events.length === 1, 'pose skin application did not start');
  assert.equal(controller.canAdvance('navigation.nextAction'), true);

  await controller.advance('navigation.nextAction');
  await waitFor(
    () =>
      events.some((event) => {
        const [type, index] = requireArray(event, 'a recorded event');
        return type === 'pose' && index === 1;
      }),
    'second pose step did not start',
  );

  assert.deepEqual(events.slice(0, 3), [
    ['skin', 0],
    ['skin', 0, 'abort'],
    ['pose', 1],
  ]);
  assert.deepEqual(
    traceOf(controller)
      .filter(({type}) => type === 'pose.step.skip')
      .map(({details}) => details.stepIndex),
    [0],
  );
  assert.equal(traceOf(controller).filter(({type}) => type === 'action.cancel').length, 0);

  controller.stop('test-complete');
  await run;
});

test('stop wins while a skippable pose is waiting for cancellation cleanup', async () => {
  const cleanup = deferred();
  const events: Record<string, unknown>[] = [];
  let stageCalls = 0;
  const controller = createDsl4RuntimeController({
    storyDocument: poseNavigationStory(true),
    poseNavigationPolicyEnabled: true,
    port: {
      waitForPose: poseWaitWithDeferredCleanup(cleanup, events),
      stage: async () => stageCalls++,
    },
  });

  const staleRun = controller.start();
  const advance = controller.advance('navigation.nextAction');
  const stopped = controller.stop('runtime-stop');
  assert.equal(stopped.status, 'stopped');
  cleanup.resolve();
  const finalState = await advance;
  await staleRun;

  assert.equal(finalState.status, 'stopped');
  assert.equal(stageCalls, 0);
  assert.deepEqual(events, ['abort', 'cleanup']);
  assert.equal(traceOf(controller).filter(({type}) => type === 'navigation.advance').length, 0);
  assert.equal(traceOf(controller).filter(({type}) => type === 'action.cancel').length, 1);
  assert.equal(controller.getRunPromise(), null);
});

test('releases the pose cleanup lock when the next pending action starts', async () => {
  const poseCleanup = deferred();
  const nextWait = deferred();
  let stageCalls = 0;
  const story = parseStory(`
kamishibai: '4.0'
assets:
  Tick: sound
  Charge: sound
  HeroIdle: costume:Hero
  Beach: backdrop
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
actors:
  Hero: HeroIdle
recognition:
  idleSound: Tick
  chargeSound: Charge
  navigation:
    allowSkip: true
scenes:
  rescue:
    recognitionModel: RescuePose
    actions:
      - Hero.pose:
          steps:
            - pose: help
      - wait: 1
      - stage: Beach
`);
  const controller = createDsl4RuntimeController({
    storyDocument: story,
    poseNavigationPolicyEnabled: true,
    port: {
      waitForPose: poseWaitWithDeferredCleanup(poseCleanup, []),
      wait: () => nextWait.promise,
      stage: async () => stageCalls++,
    },
  });

  const initialRun = controller.start();
  const poseAdvance = controller.advance('navigation.nextAction');
  poseCleanup.resolve();
  await waitFor(
    () => controller.getState().actionPath === '/scenes/rescue/actions/1',
    'next pending action did not start after pose cleanup',
  );

  const waitAdvance = controller.advance('navigation.nextAction');
  const state = await waitAdvance;
  assert.equal(state.status, 'finished');
  assert.equal(stageCalls, 1);

  nextWait.resolve();
  await Promise.all([initialRun, poseAdvance]);
});

test('pose skip at a scene end waits for cleanup before asset-coordinated next scene effects', async () => {
  const cleanup = deferred();
  const events: string[] = [];
  const lifecycleCalls: Record<string, unknown>[] = [];
  const story = parseStory(`
kamishibai: '4.0'
assets:
  Tick: sound
  Charge: sound
  HeroIdle: costume:Hero
  NextBackdrop:
    kind: backdrop
    name: NextBackdrop
    loading: lazy
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
actors:
  Hero: HeroIdle
recognition:
  idleSound: Tick
  chargeSound: Charge
  navigation:
    allowSkip: true
scenes:
  rescue:
    recognitionModel: RescuePose
    actions:
      - Hero.pose:
          steps:
            - pose: help
  ending:
    - stage: NextBackdrop
`);
  const controller = createDsl4RuntimeController({
    storyDocument: story,
    poseNavigationPolicyEnabled: true,
    port: {
      waitForPose: (_payload: PortPayload, context: ActionContext) =>
        new Promise((_resolve, reject) => {
          events.push('pose-start');
          signalOf(context).addEventListener(
            'abort',
            () => {
              events.push('abort');
              void cleanup.promise.then(() => {
                events.push('cleanup');
                const error = new Error('pose wait cancelled');
                error.name = 'AbortError';
                reject(error);
              });
            },
            {once: true},
          );
        }),
      stage: async () => events.push('stage'),
    },
    assetLifecycle: {
      async prepare(payload: PortPayload) {
        lifecycleCalls.push({method: 'prepare', payload});
      },
      async setLoading(payload: PortPayload) {
        lifecycleCalls.push({method: 'setLoading', payload});
      },
      async releaseAssets(payload: PortPayload) {
        lifecycleCalls.push({method: 'releaseAssets', payload});
      },
      async release(payload: PortPayload) {
        lifecycleCalls.push({method: 'release', payload});
      },
    },
  });

  const initialRun = controller.start();
  await waitFor(() => events.includes('pose-start'), 'pose did not start after asset startup');
  const advance = controller.advance('navigation.nextAction');
  assert.deepEqual(events, ['pose-start', 'abort']);
  cleanup.resolve();

  await advance;
  await initialRun;
  const state = controller.getState();
  assert.equal(state.status, 'finished');
  assert.equal(state.sceneId, 'ending');
  assert.ok(events.indexOf('cleanup') < events.indexOf('stage'));
  assert.equal(
    lifecycleCalls.some(
      ({method, payload}) =>
        method === 'prepare' &&
        requireRecord(payload, 'the prepare payload').phase === 'scene' &&
        requireRecord(payload, 'the prepare payload').sceneId === 'ending',
    ),
    true,
  );
  assert.equal(traceOf(controller).filter(({type}) => type === 'navigation.advance').length, 0);
  assert.equal(traceOf(controller).filter(({type}) => type === 'pose.step.skip').length, 1);
});

test('keeps scene-retained BGM assets leased while crossfade voice ownership is enabled', async () => {
  const story = parseStory(`
kamishibai: '4.0'
assets:
  TrackA:
    kind: sound
    name: TrackA
    loading: lazy
    retention: scene
  TrackB:
    kind: sound
    name: TrackB
    loading: lazy
    retention: scene
scenes:
  opening:
    - bgm: TrackA
    - goto: ending
  ending:
    - bgm: {sound: TrackB, transition: 0.5}
    - wait: 0
`);
  const lifecycleCalls: unknown[][] = [];
  const controller = createDsl4RuntimeController({
    storyDocument: story,
    crossfadeTransitionsEnabled: true,
    port: {bgm() {}, wait() {}},
    assetLifecycle: {
      prepare(payload: PortPayload) {
        lifecycleCalls.push(['prepare', payload]);
      },
      setLoading() {},
      releaseAssets(payload: PortPayload) {
        lifecycleCalls.push(['releaseAssets', payload]);
      },
      release(payload: PortPayload) {
        lifecycleCalls.push(['release', payload]);
      },
    },
  });

  await controller.start();
  assert.equal(controller.getState().status, 'finished');
  assert.deepEqual(
    lifecycleCalls
      .filter(([method]) => method === 'prepare')
      .map(([, payload]) => {
        const prepared = requireRecord(payload, 'the prepare payload');
        return [prepared.sceneId, prepared.assetIds];
      }),
    [
      [null, []],
      ['opening', ['TrackA']],
      ['ending', ['TrackB']],
    ],
  );
  assert.equal(
    lifecycleCalls.some(
      ([method, payload]) =>
        method === 'releaseAssets' &&
        requireArray(requireRecord(payload, 'the release payload').assetIds, 'its asset ids').some(
          (assetId) => assetId === 'TrackA' || assetId === 'TrackB',
        ),
    ),
    false,
  );
  controller.stop('test-cleanup');
});

test('restart invalidates an old pose cleanup lock without waiting for it', async () => {
  const oldCleanup = deferred();
  const newCleanup = deferred();
  const cancelReasons: unknown[] = [];
  let poseCalls = 0;
  let stageCalls = 0;
  const controller = createDsl4RuntimeController({
    storyDocument: poseNavigationStory(true),
    poseNavigationPolicyEnabled: true,
    onEvent(event: RuntimeEvent) {
      if (event.type === 'action.cancel') cancelReasons.push(event.details.reason);
    },
    port: {
      waitForPose(payload: PortPayload, context: ActionContext) {
        poseCalls += 1;
        const cleanup = poseCalls === 1 ? oldCleanup : newCleanup;
        return poseWaitWithDeferredCleanup(cleanup, [])(payload, context);
      },
      stage: async () => stageCalls++,
    },
  });

  const firstRun = controller.start();
  const oldAdvance = controller.advance('navigation.nextAction');
  const restartedRun = controller.start();
  assert.equal(poseCalls, 2);
  assert.equal(controller.canAdvance('navigation.nextAction'), true);

  const newAdvance = controller.advance('navigation.nextAction');
  newCleanup.resolve();
  await newAdvance;
  await restartedRun;
  const state = controller.getState();
  assert.equal(state.status, 'finished');
  assert.equal(stageCalls, 1);

  oldCleanup.resolve();
  await Promise.all([firstRun, oldAdvance]);
  assert.equal(controller.getState().status, 'finished');
  assert.equal(stageCalls, 1);
  assert.deepEqual(cancelReasons, ['restart']);
});

test('pose navigation policy remains inert while its startup gate is disabled', async () => {
  const pending = deferred();
  let stageCalls = 0;
  const controller = createDsl4RuntimeController({
    storyDocument: poseNavigationStory(false),
    port: {
      waitForPose: () => pending.promise,
      stage: async () => stageCalls++,
    },
  });

  const staleRun = controller.start();
  await controller.advance('navigation.nextAction');
  assert.equal(stageCalls, 1);
  pending.resolve();
  await staleRun;
});

test('finishes background presentation state before advance aborts the current action', async () => {
  const waitPending = deferred();
  const waitStarted = deferred();
  const order: string[] = [];
  let transitionActive = false;
  let ghost = null;
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
actors:
  Hero: HeroIdle
scenes:
  opening:
    - Hero.setTransparency:
        from: 0
        to: 50
        seconds: 1
        background: true
    - wait: 1
`),
    port: {
      setTransparency(payload: PortPayload) {
        transitionActive = true;
        ghost = payload.from;
      },
      wait(_payload: PortPayload, context: ActionContext) {
        signalOf(context).addEventListener(
          'abort',
          () => {
            order.push('abort-current-action');
          },
          {once: true},
        );
        waitStarted.resolve();
        return waitPending.promise;
      },
      finishPresentationTransitions() {
        if (!transitionActive) return;
        ghost = 50;
        transitionActive = false;
        order.push('finish-to-50');
      },
    },
  });
  const staleRun = controller.start();
  await waitStarted.promise;
  const advanced = await controller.advance('skip');

  assert.equal(advanced.status, 'finished');
  assert.equal(ghost, 50);
  assert.deepEqual(order, ['finish-to-50', 'abort-current-action']);
  waitPending.resolve();
  await staleRun;
});

test('does not skip when background presentation finalization fails and permits a retry', async () => {
  const waitPending = deferred();
  const waitStarted = deferred();
  const order: string[] = [];
  let finalizationFailures = 1;
  let transitionActive = false;
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
actors:
  Hero: HeroIdle
scenes:
  opening:
    - Hero.setTransparency:
        from: 0
        to: 50
        seconds: 1
        background: true
    - wait: 1
`),
    port: {
      setTransparency() {
        transitionActive = true;
      },
      wait(_payload: PortPayload, context: ActionContext) {
        signalOf(context).addEventListener(
          'abort',
          () => {
            order.push('abort-current-action');
          },
          {once: true},
        );
        waitStarted.resolve();
        return waitPending.promise;
      },
      finishPresentationTransitions() {
        if (!transitionActive) return;
        if (finalizationFailures > 0) {
          finalizationFailures -= 1;
          order.push('finish-failed');
          throw new Error('finalization failed');
        }
        transitionActive = false;
        order.push('finish-to-50');
      },
    },
  });
  const staleRun = controller.start();
  await waitStarted.promise;

  assert.throws(() => controller.advance('first-skip'), /finalization failed/u);
  assert.equal(controller.getState().status, 'running');
  assert.deepEqual(order, ['finish-failed']);

  const advanced = await controller.advance('retry-skip');
  assert.equal(advanced.status, 'finished');
  assert.deepEqual(order, ['finish-failed', 'finish-to-50', 'abort-current-action']);
  waitPending.resolve();
  await staleRun;
});

test('advance crosses a scene boundary and finishes at the final action boundary', async () => {
  const firstWait = deferred();
  const finalWait = deferred();
  let waits = 0;
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
scenes:
  first:
    - wait: 1
  final:
    - wait: 1
`),
    port: {
      wait: () => {
        waits += 1;
        return waits === 1 ? firstWait.promise : finalWait.promise;
      },
    },
  });
  const firstRun = controller.start();
  const finalRun = controller.advance('test-next-scene');
  assert.equal(controller.getState().sceneId, 'final');
  const finished = await controller.advance('test-finish');
  assert.equal(finished.status, 'finished');
  assert.equal(waits, 2);
  firstWait.resolve();
  finalWait.resolve();
  await Promise.all([firstRun, finalRun]);
  assert.equal(controller.getState().status, 'finished');
});

test('rehearsal nextScene cancels the current scene and enters the following scene', async () => {
  const pending = deferred();
  const effects: unknown[] = [];
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  Next: backdrop
scenes:
  opening:
    - wait: 60
    - wait: 60
  following:
    - stage: Next
`),
    port: {
      wait(_payload: PortPayload, context: ActionContext) {
        signalOf(context).addEventListener(
          'abort',
          () => {
            const error = new Error('rehearsal scene skip');
            error.name = 'AbortError';
            pending.reject(error);
          },
          {once: true},
        );
        return pending.promise;
      },
      stage: async ({backdrop}: PortPayload) => effects.push(backdrop),
    },
  });

  const run = controller.start();
  await waitFor(() => controller.getState().actionIndex === 0, 'opening wait did not start');
  const skipped = await controller.advanceScene('navigation.nextScene');
  await run;
  assert.equal(skipped.status, 'finished');
  assert.equal(skipped.sceneId, 'following');
  assert.deepEqual(effects, ['Next']);
  assert.equal(
    traceOf(controller).some(({type}) => type === 'navigation.advanceScene'),
    false,
  );
  assert.equal(
    traceOf(controller).some(
      ({type, details}) => type === 'scene.transition' && details.reason === 'navigation.nextScene',
    ),
    true,
  );
});

test('3.2 rehearsal scene skip stops the active sound and applies only stateful tail actions', async () => {
  const activeSound = deferred();
  const followingWait = deferred();
  const calls: unknown[][] = [];
  const playingBgm = new Set();
  const stoppedSounds: unknown[] = [];
  let brightness = 0;
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  Hidden: backdrop
  Music: sound
  NextMusic: sound
  Effect: sound
  HeroIdle: costume:Hero
actors: {Hero: HeroIdle}
scenes:
  opening:
    - bgm: Music
    - sound: Effect
    - stage: Hidden
    - wait: 30
    - bgm: NextMusic
    - transition: {effect: fadeOut, seconds: 30}
    - Hero.show: {skin: HeroIdle, x: 0, y: 0, scale: 100}
    - stage: Hidden
  following:
    - wait: 30
`),
    port: {
      async bgm({sound}: PortPayload) {
        calls.push(['bgm', sound]);
        playingBgm.add(sound);
      },
      sound({sound}: PortPayload, context: ActionContext) {
        calls.push(['sound', sound]);
        signalOf(context).addEventListener(
          'abort',
          () => {
            stoppedSounds.push(sound);
            const error = new Error('sound cancelled');
            error.name = 'AbortError';
            activeSound.reject(error);
          },
          {once: true},
        );
        return activeSound.promise;
      },
      async stage({backdrop}: PortPayload) {
        calls.push(['stage', backdrop]);
      },
      wait(_payload: PortPayload, context: ActionContext) {
        calls.push(['wait']);
        signalOf(context).addEventListener(
          'abort',
          () => {
            const error = new Error('wait cancelled');
            error.name = 'AbortError';
            followingWait.reject(error);
          },
          {once: true},
        );
        return followingWait.promise;
      },
      async transition({effect, seconds}: PortPayload) {
        calls.push(['transition', effect, seconds]);
        brightness = effect === 'fadeOut' ? -100 : 0;
      },
      async show(payload: PortPayload) {
        calls.push(['show', payload.target]);
      },
    },
  });

  const staleRun = controller.start();
  await waitFor(
    () => calls.some(([type]) => type === 'sound'),
    'active sound did not start before scene skip',
  );
  assert.equal(controller.canRehearsalSkip('rehearsal.skipScene'), true);
  const skipped = await controller.skipScene();

  assert.equal(skipped.sceneId, 'following');
  assert.equal(skipped.status, 'running');
  assert.deepEqual(stoppedSounds, ['Effect']);
  assert.deepEqual([...playingBgm], ['Music', 'NextMusic']);
  assert.equal(brightness, -100);
  assert.deepEqual(calls, [
    ['bgm', 'Music'],
    ['sound', 'Effect'],
    ['bgm', 'NextMusic'],
    ['transition', 'fadeOut', 0],
    ['wait'],
  ]);
  assert.equal(traceOf(controller).filter(({type}) => type === 'action.skip').length, 4);
  assert.equal(controller.canRehearsalSkip('rehearsal.skipScene'), true);

  controller.stop('test-cleanup');
  await Promise.allSettled([staleRun, controller.getRunPromise()]);
});

test('reposition pauses without presentation effects and resume starts at the selected action', async () => {
  const pending = deferred();
  const effects: string[] = [];
  let presentationState = 'initial';
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  Beach: backdrop
  Effect: sound
variables:
  score: 1
scenes:
  opening:
    - wait: 1
  destination:
    - stage: Beach
    - sound: Effect
`),
    port: {
      wait: (_payload: PortPayload, context: ActionContext) => {
        setVariableOf(context)('score', 2);
        presentationState = 'changed-by-running-action';
        return pending.promise;
      },
      stage: async () => effects.push('stage'),
      sound: async () => effects.push('sound'),
    },
  });
  const staleRun = controller.start();
  const soundPosition = controller.reposition('destination', {
    actionIndex: 1,
    reason: 'history.previousAction',
  });
  assert.equal(soundPosition.status, 'paused');
  assert.equal(soundPosition.actionIndex, 1);
  assert.equal(soundPosition.actionPath, '/scenes/destination/actions/1');
  assert.equal(requireRecord(soundPosition.variables, 'the runtime variables').score, 2);
  assert.deepEqual(effects, []);
  assert.equal(presentationState, 'changed-by-running-action');

  const stagePosition = controller.reposition('destination', {
    actionIndex: 0,
    reason: 'history.previousScene',
  });
  assert.equal(stagePosition.status, 'paused');
  assert.equal(stagePosition.actionPath, '/scenes/destination/actions/0');
  assert.deepEqual(effects, []);
  assert.equal(presentationState, 'changed-by-running-action');

  const resumed = await controller.resume('navigation.nextAction');
  assert.equal(resumed.status, 'finished');
  assert.equal(requireRecord(resumed.variables, 'the runtime variables').score, 2);
  assert.deepEqual(effects, ['stage', 'sound']);
  pending.resolve();
  await staleRun;
  assert.deepEqual(effects, ['stage', 'sound']);

  const moves = traceOf(controller).filter(({type}) => type === 'navigation.reposition');
  assert.deepEqual(
    moves.map(({details}) => [details.fromStoryPath, details.toStoryPath, details.reason]),
    [
      ['/scenes/opening/actions/0', '/scenes/destination/actions/1', 'history.previousAction'],
      ['/scenes/destination/actions/1', '/scenes/destination/actions/0', 'history.previousScene'],
    ],
  );
});

test('reposition and resume support an empty scene', async () => {
  const pending = deferred();
  let stageCalls = 0;
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  Beach: backdrop
scenes:
  opening:
    - wait: 1
  empty: []
  ending:
    - stage: Beach
`),
    port: {
      wait: () => pending.promise,
      stage: async () => stageCalls++,
    },
  });
  const staleRun = controller.start();
  const paused = controller.reposition('empty', {actionIndex: 0});
  assert.equal(paused.status, 'paused');
  assert.equal(paused.sceneId, 'empty');
  assert.equal(paused.actionIndex, 0);
  assert.equal(paused.actionPath, null);
  assert.equal(stageCalls, 0);
  const resumed = await controller.resume();
  assert.equal(resumed.status, 'finished');
  assert.equal(stageCalls, 1);
  pending.resolve();
  await staleRun;
  assert.equal(stageCalls, 1);
});

test('paused execution can stop and restart deterministically', async () => {
  const pending = deferred();
  let waits = 0;
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
variables:
  score: 1
scenes:
  opening:
    - wait: 1
  destination: []
`),
    port: {
      wait: (_payload: PortPayload, context: ActionContext) => {
        waits += 1;
        setVariableOf(context)('score', 2);
        return pending.promise;
      },
    },
  });
  const staleRun = controller.start();
  controller.reposition('destination');
  const stopped = controller.stop('paused-stop');
  assert.equal(stopped.status, 'stopped');
  const restarted = await controller.start({sceneId: 'destination'});
  assert.equal(restarted.status, 'finished');
  assert.equal(requireRecord(restarted.variables, 'the runtime variables').score, 1);
  assert.equal(waits, 1);
  pending.resolve();
  await staleRun;
  assert.equal(controller.getState().status, 'finished');
});

test('starts a replacement runtime at one planned action with migrated variables', async () => {
  const calls: Record<string, unknown>[] = [];
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
variables:
  score: 1
  hero: Alice
scenes:
  opening:
    - wait: 1
    - wait: 2
    - wait: 3
`),
    port: {
      wait: async (payload: PortPayload, context: ActionContext) => {
        calls.push({seconds: payload.seconds, variables: context.variables});
      },
    },
  });

  const state = await controller.start({
    sceneId: 'opening',
    actionIndex: 1,
    variables: {score: 42, hero: 'Bob'},
  });
  assert.equal(state.status, 'finished');
  assert.deepEqual(calls, [
    {seconds: 2, variables: {score: 42, hero: 'Bob', startSceneIndex: 1}},
    {seconds: 3, variables: {score: 42, hero: 'Bob', startSceneIndex: 1}},
  ]);
  assert.deepEqual(state.variables, {score: 42, hero: 'Bob', startSceneIndex: 1});
  assert.equal(
    traceOf(controller).some(
      ({type, actionPath}) => type === 'action.start' && actionPath === '/scenes/opening/actions/0',
    ),
    false,
  );
});

test('rejects invalid replacement state before cancelling the active action', async () => {
  const pending = deferred();
  let activeSignal: AbortSignal | undefined;
  const controller = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
variables:
  score: 1
scenes:
  opening:
    - wait: 1
    - wait: 2
`),
    port: {
      wait: (_payload: PortPayload, context: ActionContext) => {
        activeSignal = signalOf(context);
        return pending.promise;
      },
    },
  });
  const run = controller.start();
  await Promise.resolve();
  assert.equal(requireDefined(activeSignal, 'the active signal').aborted, false);

  assert.throws(
    () => controller.start({sceneId: 'opening', actionIndex: 9, variables: {score: 2}}),
    /Invalid runtime start position/u,
  );
  assert.throws(
    () => controller.start({sceneId: 'opening', actionIndex: 1, variables: {score: 'wrong'}}),
    /wrong type/u,
  );
  assert.throws(
    () => controller.start({sceneId: 'opening', actionIndex: 1, variables: {score: 2, extra: 1}}),
    /match every declared story variable/u,
  );
  assert.equal(controller.getState().status, 'running');
  assert.equal(requireDefined(activeSignal, 'the active signal').aborted, false);

  controller.stop('test-cleanup');
  pending.resolve();
  await run;
});

test('keeps variables outside StoryDocument and rejects stale or mistyped writes', async () => {
  const story = parseStory(`
kamishibai: '4.0'
variables:
  score: 1
scenes:
  opening:
    - wait: 0
`);
  const writes: unknown[] = [];
  const controller = createDsl4RuntimeController({
    storyDocument: story,
    port: {
      wait: async (_payload: PortPayload, context: ActionContext) => {
        writes.push(setVariableOf(context)('score', 'wrong'));
        writes.push(setVariableOf(context)('score', 2));
      },
    },
  });
  const state = await controller.start();
  assert.deepEqual(writes, [false, true]);
  assert.equal(requireRecord(state.variables, 'the story variables').score, 2);
  assert.equal(requireRecord(story.variables, 'the story variables').score, 1);
  const oldContextWrite = controller.getState().variables;
  assert.equal(Object.isFrozen(oldContextWrite), true);
});

test('records repeated visits to the same scene and can stop from an active port', async () => {
  const story = parseStory(`
kamishibai: '4.0'
scenes:
  loop:
    - wait: 0
    - goto: loop
`);
  let waits = 0;
  const active: {controller?: Controller} = {};
  const controller = (active.controller = createDsl4RuntimeController({
    storyDocument: story,
    port: {
      wait: async () => {
        waits += 1;
        if (waits === 3) controller.stop('loop-limit');
      },
    },
  }));
  const state = await controller.start();
  assert.equal(state.status, 'stopped');
  assert.equal(waits, 3);
  assert.equal(
    traceOf(controller).filter(({type, sceneId}) => type === 'scene.enter' && sceneId === 'loop')
      .length,
    3,
  );
});

const portDiagnosticCases: [string, Dsl4RuntimePort, string][] = [
  ['missing port', {}, 'K4-RUNTIME-PORT-001'],
  [
    'port failure',
    {
      wait: async () => {
        throw new Error('wait failed');
      },
    },
    'K4-RUNTIME-ACTION-001',
  ],
];
for (const [name, port, expectedCode] of portDiagnosticCases) {
  test(`converts ${name} into a runtime diagnostic`, async () => {
    const parsedStory = parseStory(`
kamishibai: '4.0'
scenes:
  opening:
    - wait: 0
`);
    const actionPath = '/scenes/opening/actions/0';
    const includedRange = requireRecord(parsedStory.sourceMap, 'the source map')[actionPath];
    const controller = createDsl4RuntimeController({
      storyDocument: {
        ...parsedStory,
        sourceOrigins: {
          [actionPath]: {sourceId: 'chapters/opening.k4.yml', range: includedRange},
        },
      },
      port,
    });
    const state = await controller.start();
    assert.equal(state.status, 'failed');
    assert.equal(diagnosticOf(state).code, expectedCode);
    assert.equal(diagnosticOf(state).storyPath, actionPath);
    assert.equal(diagnosticOf(state).sourceId, 'chapters/opening.k4.yml');
    assert.deepEqual(diagnosticOf(state).range, includedRange);
    const context = requireRecord(state.failureContext, 'the failure presentation context');
    assert.equal(context.sceneId, 'opening');
    assert.equal(context.actionIndex, 0);
    assert.equal(context.command, 'wait');
    assert.deepEqual(
      requireDefined(traceOf(controller).at(-1), 'the failure event').details.failureContext,
      context,
    );
    assert.equal(Object.hasOwn(diagnosticOf(state), 'failureContext'), false);
    assert.equal(
      requireDefined(traceOf(controller).at(-1), 'the last trace event').type,
      'runtime.fail',
    );
  });
}

test('rejects key and pose input results outside their declared routes', async () => {
  const keyController = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
scenes:
  opening:
    - keyInputToChangeScene:
        Digit1: ending
  ending: []
`),
    port: {keyInputToChangeScene: async () => 'Digit2'},
  });
  const poseController = createDsl4RuntimeController({
    storyDocument: parseStory(`
kamishibai: '4.0'
assets:
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
scenes:
  opening:
    recognitionModel: RescuePose
    actions:
      - poseInputToChangeScene:
          happy: ending
  ending: []
`),
    port: {poseInputToChangeScene: async () => 'jump'},
  });

  for (const controller of [keyController, poseController]) {
    const state = await controller.start();
    assert.equal(state.status, 'failed');
    assert.equal(diagnosticOf(state).code, 'K4-RUNTIME-RESULT-001');
  }
});

test('scenario chapter transfer waits for the publication owner and cannot execute later source actions', async () => {
  const storyDocument = parseStory(
    "kamishibai: '4.0'\nvariables: {marker: 0}\nscenes:\n  first:\n    - setVariable: {name: marker, value: 7}\n    - gotoSegment: chapter2\n    - setVariable: {name: marker, value: 99}\n",
  );
  const request = deferred<unknown>();
  let destination: unknown;
  const controller = createDsl4RuntimeController({
    storyDocument,
    port: {
      gotoSegment(payload: PortPayload) {
        destination = payload.segment;
        return request.promise;
      },
    },
  });
  const run = controller.start();
  while (!destination) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(destination, 'chapter2');
  assert.equal(controller.canAdvance(), false);
  await controller.advanceScene();
  assert.equal(controller.getState().status, 'running');
  assert.equal(requireRecord(controller.getState().variables, 'story variables').marker, 7);
  controller.stop('publication-segment-release');
  request.resolve({outcome: 'committed'});
  assert.equal((await run).status, 'stopped');
  assert.equal(requireRecord(controller.getState().variables, 'story variables').marker, 7);
});

test('failed scenario chapter transfer holds the current variables and action without failing or running following actions', async () => {
  const storyDocument = parseStory(
    "kamishibai: '4.0'\nvariables: {marker: 0}\nscenes:\n  first:\n    - setVariable: {name: marker, value: 7}\n    - gotoSegment: chapter2\n    - setVariable: {name: marker, value: 99}\n",
  );
  const controller = createDsl4RuntimeController({
    storyDocument,
    port: {
      gotoSegment() {
        return {outcome: 'retained'};
      },
    },
  });
  const state = await controller.start();
  assert.equal(state.status, 'paused');
  assert.equal(state.actionIndex, 1);
  assert.equal(requireRecord(controller.getState().variables, 'story variables').marker, 7);
  assert(!controller.getTrace().some((event) => (event as {type: string}).type === 'runtime.fail'));
});

function backgroundModelStory() {
  return parseStory(`
kamishibai: '4.0'
assets:
  Tick: sound
  Charge: sound
  HeroIdle: costume:Hero
  Beach: backdrop
  Ocean: backdrop
  RescuePose:
    kind: recognitionModel
    file: pose-models/rescue
  SeaPose:
    kind: recognitionModel
    file: pose-models/sea
actors:
  Hero: HeroIdle
recognition:
  idleSound: Tick
  chargeSound: Charge
scenes:
  rescue:
    recognitionModel: RescuePose
    actions:
      - stage: Beach
      - Hero.pose:
          steps:
            - pose: help
      - goto: sea
  sea:
    recognitionModel: SeaPose
    actions:
      - stage: Ocean
      - Hero.pose:
          steps:
            - pose: swim
`);
}

test('loads each scene model in the background and waits only at the recognition action', async () => {
  const events: string[] = [];
  const prepared: string[][] = [];
  const models = new Map<string, ReturnType<typeof deferred<void>>>([
    ['RescuePose', deferred<void>()],
    ['SeaPose', deferred<void>()],
  ]);
  const controller = createDsl4RuntimeController({
    storyDocument: backgroundModelStory(),
    port: {
      stage: async (payload: PortPayload) => {
        events.push(`stage:${String(payload.backdrop)}`);
      },
      waitForPose: async (payload: PortPayload) => {
        events.push(`pose:${String(payload.pose)}`);
      },
    },
    assetLifecycle: {
      async prepare(payload: PortPayload) {
        const assetIds = (payload.assetIds as string[]).slice();
        prepared.push(assetIds);
        // A model resolves when the test says so; every caller of the same model joins it.
        await Promise.all(assetIds.map((assetId) => models.get(assetId)?.promise));
      },
      async setLoading() {},
      async releaseAssets(payload: PortPayload) {
        events.push(`release:${(payload.assetIds as string[]).join(',')}`);
      },
      async release() {},
    },
  });

  const run = controller.start();
  // Startup and the scene entry never wait for a model: the scene runs up to its pose action.
  await waitFor(() => events.includes('stage:Beach'), 'the scene did not start');
  assert.equal(
    prepared.some((assetIds) => assetIds.includes('SeaPose')),
    false,
    'a later scene model must not load before its scene',
  );
  assert(prepared.some((assetIds) => assetIds.join() === 'RescuePose'));
  assert.equal(events.includes('pose:help'), false, 'the pose waits while its model loads');
  await waitFor(
    () => traceOf(controller).some(({type}) => type === 'assets.background.wait.start'),
    'the pose action did not start waiting for its model',
  );
  assert.equal(events.includes('pose:help'), false);

  models.get('RescuePose')!.resolve();
  await waitFor(() => events.includes('stage:Ocean'), 'the next scene did not start');
  // The next scene's model loads in the background; the previous scene's model is released.
  assert(prepared.some((assetIds) => assetIds.join() === 'SeaPose'));
  assert(events.includes('release:RescuePose'));
  assert.equal(events.includes('pose:swim'), false);

  models.get('SeaPose')!.resolve();
  await run;
  assert.equal(controller.getState().status, 'finished');
  assert.deepEqual(
    events.filter((event) => event.startsWith('pose:') || event.startsWith('stage:')),
    ['stage:Beach', 'pose:help', 'stage:Ocean', 'pose:swim'],
  );
});

test('a pose action reports the failure of its background model load', async () => {
  const controller = createDsl4RuntimeController({
    storyDocument: backgroundModelStory(),
    port: {
      stage: async () => {},
      waitForPose: async () => {},
    },
    assetLifecycle: {
      async prepare(payload: PortPayload) {
        if ((payload.assetIds as string[]).includes('RescuePose')) {
          throw Object.assign(new Error('model files are missing'), {code: 'K4-TEST-MODEL'});
        }
      },
      async setLoading() {},
      async releaseAssets() {},
      async release() {},
    },
  });
  await controller.start();
  const state = controller.getState();
  assert.equal(state.status, 'failed');
  assert.match(JSON.stringify(state.diagnostic), /RescuePose|model files are missing/u);
  assert(traceOf(controller).some(({type}) => type === 'assets.background.error'));
});

test('prefetches the next scene model once the current scene model is ready', async () => {
  const prepared: string[][] = [];
  const models = new Map<string, ReturnType<typeof deferred<void>>>([
    ['RescuePose', deferred<void>()],
    ['SeaPose', deferred<void>()],
  ]);
  const help = deferred<void>();
  const events: string[] = [];
  const controller = createDsl4RuntimeController({
    storyDocument: backgroundModelStory(),
    port: {
      stage: async (payload: PortPayload) => {
        events.push(`stage:${String(payload.backdrop)}`);
      },
      waitForPose: async (payload: PortPayload) => {
        events.push(`pose:${String(payload.pose)}`);
        if (payload.pose === 'help') await help.promise;
      },
    },
    assetLifecycle: {
      async prepare(payload: PortPayload) {
        const assetIds = (payload.assetIds as string[]).slice();
        prepared.push(assetIds);
        await Promise.all(assetIds.map((assetId) => models.get(assetId)?.promise));
      },
      async setLoading() {},
      async releaseAssets() {},
      async release() {},
    },
  });
  const run = controller.start();
  await waitFor(() => events.includes('stage:Beach'), 'the scene did not start');
  // The next scene's model waits for the current scene's model, so they never compete.
  assert.equal(prepared.flat().includes('SeaPose'), false);

  models.get('RescuePose')!.resolve();
  await waitFor(() => events.includes('pose:help'), 'the pose did not start');
  await waitFor(
    () => prepared.flat().includes('SeaPose'),
    'the next scene model did not start loading during the current scene',
  );
  assert.equal(events.includes('stage:Ocean'), false, 'the prefetch runs before the next scene');
  assert(
    traceOf(controller).some(
      ({type, details}) =>
        type === 'assets.background.start' &&
        (details as {prefetch?: boolean}).prefetch === true &&
        JSON.stringify((details as {assetIds?: unknown}).assetIds) === '["SeaPose"]',
    ),
  );

  models.get('SeaPose')!.resolve();
  help.resolve();
  await run;
  assert.equal(controller.getState().status, 'finished');
});
