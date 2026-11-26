import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'vitest';

import {dsl4CoreActionManifest} from '../src/dsl4/core-action-manifest.js';
import {requireString} from './helpers/require-value.ts';
import {thrown} from './helpers/thrown-error.ts';
import {
  createDsl4TurboWarpCoreActionBlockAdapter,
  createDsl4TurboWarpCoreActionBlockSurface,
  dsl4TurboWarpCoreActionBlockSpecs,
} from '../src/dsl4/platform/turbowarp-core-action-block.js';

const schema = JSON.parse(
  await readFile(new URL('../schema/dsl-4.schema.json', import.meta.url), 'utf8'),
);
const Scratch = Object.freeze({
  ArgumentType: Object.freeze({NUMBER: 'number', STRING: 'string'}),
  BlockType: Object.freeze({COMMAND: 'command', HAT: 'hat'}),
});

test('defines one distinct public block for every manifest core action', () => {
  const commands = dsl4CoreActionManifest.map(({command}) => command);
  assert.deepEqual(
    dsl4TurboWarpCoreActionBlockSpecs.map(({command}) => command),
    commands,
  );
  assert.equal(new Set(commands).size, 36);

  const enabled = createDsl4TurboWarpCoreActionBlockSurface(Scratch, {visible: true});
  const standard = createDsl4TurboWarpCoreActionBlockSurface(Scratch, {
    visible: true,
    includeOptIn: false,
  });
  assert.equal(
    standard.blocks.filter(({opcode}) => opcode === 'animate' || opcode === 'presentationEffect')
      .length,
    0,
  );
  assert.equal(
    enabled.blocks.filter(({opcode}) => opcode === 'animate' || opcode === 'presentationEffect')
      .length,
    2,
  );

  assert.deepEqual(
    enabled.blocks.map(({opcode}) => opcode),
    [...commands, 'sayText', 'thinkText'],
  );
  assert.ok(enabled.blocks.every(({blockType}) => blockType === Scratch.BlockType.COMMAND));
  assert.ok(enabled.blocks.every((definition) => !Object.hasOwn(definition, 'hideFromPalette')));
  assert.ok(enabled.blocks.every(({opcode}) => opcode !== 'runActionJson'));
  assert.equal(Object.isFrozen(enabled), true);
  assert.equal(Object.isFrozen(enabled.blocks), true);

  const disabled = createDsl4TurboWarpCoreActionBlockSurface(Scratch);
  assert.ok(disabled.blocks.every(({hideFromPalette}) => hideFromPalette === true));
  assert.deepEqual(enabled.menus.dsl4TransitionEffect.items, [
    'fadeOut',
    'fadeUp',
    'fadeToWhite',
    'fadeFromWhite',
    'reset',
  ]);
  assert.deepEqual(enabled.menus.dsl4MoveEasing.items, [
    'linear',
    'easeIn',
    'easeOut',
    'easeInOut',
  ]);
  assert.deepEqual(enabled.menus.dsl4VideoOperation.items, [
    'playUntilDone',
    'play',
    'resume',
    'pause',
    'stop',
    'loop',
    'seek',
    'setVolume',
    'setMuted',
    'setPlaybackRate',
  ]);
  assert.deepEqual(enabled.menus.dsl4VideoPlane.items, ['front', 'background']);
});

test('new motion and effect blocks keep the declared values and bound JSON input', () => {
  const adapter = createDsl4TurboWarpCoreActionBlockAdapter(schema);
  const animation = {
    to: {x: 0, y: -8, scale: 125, direction: 0, transparency: 50},
    seconds: 0,
    easing: 'easeInOut',
    delaySeconds: 0,
    repeat: 0,
    alternate: false,
    background: false,
  };
  assert.deepEqual(
    adapter.createAction('animate', {TARGET: 'Hero', SPEC: JSON.stringify(animation)}),
    {target: 'Hero', command: 'animate', args: animation, handler: 'core'},
  );
  const effect = {scope: 'presentation', effect: 'shake', seconds: 1, params: {amplitude: 0}};
  assert.deepEqual(
    adapter.createAction('presentationEffect', {
      SCOPE: effect.scope,
      EFFECT: effect.effect,
      SECONDS: effect.seconds,
      PARAMS: JSON.stringify(effect.params),
    }),
    {target: null, command: 'presentationEffect', args: effect, handler: 'core'},
  );
  assert.throws(
    () => adapter.createAction('animate', {TARGET: 'Hero', SPEC: '{"to":{},"seconds":1}'}),
    {code: 'K4-BLOCK-ACTION-SCHEMA-001'},
  );
  assert.throws(
    () =>
      adapter.createAction('presentationEffect', {
        SCOPE: 'stage',
        EFFECT: 'shake',
        SECONDS: 1,
        PARAMS: '{"__proto__":{"amplitude":8}}',
      }),
    {code: 'K4-BLOCK-ACTION-JSON-001'},
  );
  assert.throws(
    () =>
      adapter.createAction('presentationEffect', {
        SCOPE: 'stage',
        EFFECT: 'shake',
        SECONDS: 1,
        PARAMS: '{}',
      }),
    {code: 'K4-BLOCK-ACTION-SCHEMA-001'},
  );
  const palette = createDsl4TurboWarpCoreActionBlockSurface(Scratch, {visible: true});
  for (const command of ['animate', 'presentationEffect']) {
    const spec = dsl4TurboWarpCoreActionBlockSpecs.find(
      (candidate) => candidate.command === command,
    )!;
    const args = Object.fromEntries(
      spec.arguments.map((input) => [input.name, input.defaultValue]),
    );
    assert.equal(adapter.createAction(command, args).command, command);
  }
  assert.deepEqual(palette.menus.dsl4PresentationEffectScope.items, ['stage', 'presentation']);
});

test('normalizes block inputs through their manifest Schema definitions', () => {
  const adapter = createDsl4TurboWarpCoreActionBlockAdapter(schema);
  // TurboWarp hands a block input through as either the typed field value or its string form, and
  // the cases below cover both on purpose, so the input record carries the same union.
  const cases: readonly [
    string,
    Record<string, string | number>,
    string | null,
    Record<string, unknown>,
  ][] = [
    ['stage', {BACKDROP: 'Beach'}, null, {backdrop: 'Beach'}],
    ['bgm', {SOUND: 'Music'}, null, {sound: 'Music'}],
    ['sound', {SOUND: 'Effect'}, null, {sound: 'Effect'}],
    [
      'audio',
      {ID: 'music', SOURCE_TYPE: 'asset', SOURCE: 'Music'},
      null,
      {id: 'music', asset: 'Music'},
    ],
    [
      'audio',
      {
        ID: 'music',
        SOURCE_TYPE: 'asset',
        SOURCE: 'Music',
        FADEIN: '0.5',
        VOLUME: '250',
        FADEOUT: '2',
      },
      null,
      {id: 'music', asset: 'Music', fadeIn: 0.5, volume: 250, fadeOut: 2},
    ],
    [
      'audioControl',
      {ID: 'music', OPERATION: 'play', VALUE: '', FADEIN: '0', VOLUME: '200', FADEOUT: ''},
      null,
      {id: 'music', operation: 'play', fadeIn: 0, volume: 200},
    ],
    [
      'audioControl',
      {ID: 'music', OPERATION: 'stop', VALUE: '', FADEOUT: '0.25'},
      null,
      {id: 'music', operation: 'stop', fadeOut: 0.25},
    ],
    [
      'video',
      {
        ID: 'movie',
        SOURCE_TYPE: 'asset',
        SOURCE: 'Movie',
        X: 0,
        Y: 10,
        WIDTH: 320,
        HEIGHT: 180,
        PLANE: 'background',
        ZINDEX: '-3',
      },
      null,
      {
        id: 'movie',
        asset: 'Movie',
        x: 0,
        y: 10,
        width: 320,
        height: 180,
        plane: 'background',
        zIndex: -3,
      },
    ],
    [
      'videoControl',
      {ID: 'movie', OPERATION: 'playUntilDone', VALUE: ''},
      null,
      {id: 'movie', operation: 'playUntilDone'},
    ],
    [
      'videoControl',
      {ID: 'movie', OPERATION: 'play', VALUE: ''},
      null,
      {id: 'movie', operation: 'play'},
    ],
    [
      'videoControl',
      {ID: 'movie', OPERATION: 'pause', VALUE: ''},
      null,
      {id: 'movie', operation: 'pause'},
    ],
    [
      'videoControl',
      {ID: 'movie', OPERATION: 'resume', VALUE: ''},
      null,
      {id: 'movie', operation: 'resume'},
    ],
    [
      'videoControl',
      {ID: 'movie', OPERATION: 'seek', VALUE: '3.5'},
      null,
      {id: 'movie', operation: 'seek', seconds: 3.5},
    ],
    [
      'videoControl',
      {ID: 'movie', OPERATION: 'setVolume', VALUE: '40'},
      null,
      {id: 'movie', operation: 'setVolume', volume: 40},
    ],
    [
      'videoControl',
      {ID: 'movie', OPERATION: 'setMuted', VALUE: 'true'},
      null,
      {id: 'movie', operation: 'setMuted', muted: true},
    ],
    [
      'videoControl',
      {ID: 'movie', OPERATION: 'setPlaybackRate', VALUE: '1.5'},
      null,
      {id: 'movie', operation: 'setPlaybackRate', rate: 1.5},
    ],
    ['wait', {SECONDS: '1.5'}, null, {seconds: 1.5}],
    ['debugger', {}, null, {}],
    ['broadcastMessageAndWait', {MESSAGE: 'receiver'}, null, {message: 'receiver'}],
    ['transition', {EFFECT: 'fadeOut', SECONDS: 0.5}, null, {effect: 'fadeOut', seconds: 0.5}],
    ['goto', {SCENE: 'ending'}, null, {scene: 'ending'}],
    ['gotoSegment', {SEGMENT: 'chapter2'}, null, {segment: 'chapter2'}],
    ['branch', {BRANCH: 'choice'}, null, {branch: 'choice'}],
    ['keyInputToChangeScene', {ROUTES: '{"Space":"ending"}'}, null, {routes: {Space: 'ending'}}],
    ['touchInputToChangeScene', {ROUTES: '{"Hero":"ending"}'}, null, {routes: {Hero: 'ending'}}],
    ['poseInputToChangeScene', {ROUTES: '{"help":"ending"}'}, null, {routes: {help: 'ending'}}],
    [
      'show',
      {TARGET: 'Hero', SKIN: 'HeroIdle', X: '10', Y: -20, SCALE: 80},
      'Hero',
      {skin: 'HeroIdle', x: 10, y: -20, scale: 80},
    ],
    [
      'show',
      {
        TARGET: 'Hero',
        SKIN: 'HeroIdle',
        X: '10',
        Y: -20,
        SCALE: 80,
        ROTATION: 'leftRight',
        DIRECTION: '-90',
      },
      'Hero',
      {skin: 'HeroIdle', x: 10, y: -20, scale: 80, rotation: 'leftRight', direction: -90},
    ],
    [
      // Blank rotation inputs leave the actor as it is, exactly as an older block does.
      'show',
      {TARGET: 'Hero', SKIN: 'HeroIdle', X: 0, Y: 0, SCALE: 100, ROTATION: '', DIRECTION: ''},
      'Hero',
      {skin: 'HeroIdle', x: 0, y: 0, scale: 100},
    ],
    ['hide', {TARGET: 'Hero'}, 'Hero', {}],
    ['setTransparency', {TARGET: 'Hero', SPEC: '50'}, 'Hero', {transparency: 50}],
    [
      'moveTo',
      {TARGET: 'Hero', X: 1, Y: 2, SECONDS: 3, EASING: 'easeInOut'},
      'Hero',
      {x: 1, y: 2, seconds: 3, easing: 'easeInOut'},
    ],
    [
      'say',
      {
        TARGET: 'Hero',
        SPEC: '{"text":"hello","seconds":1,"styles":["novel"],"stableId":"speech-1"}',
      },
      'Hero',
      {text: 'hello', seconds: 1, styles: ['novel']},
    ],
    [
      'think',
      {TARGET: 'Hero', SPEC: '{"text":"hmm","waitFor":"advance"}'},
      'Hero',
      {text: 'hmm', waitFor: 'advance'},
    ],
    ['setSkin', {TARGET: 'Hero', SKIN: 'HeroHappy', SCALE: ''}, 'Hero', {skin: 'HeroHappy'}],
    ['setLayer', {TARGET: 'Hero', LAYER: '-2'}, 'Hero', {layer: -2}],
    [
      'loop',
      {TARGET: 'Hero', STEPS: '[{"skin":"HeroIdle","seconds":1}]'},
      'Hero',
      {steps: [{skin: 'HeroIdle', seconds: 1}]},
    ],
    [
      'setText',
      {TARGET: 'Caption', TEXT: 'title', STYLE: 'heading'},
      'Caption',
      {text: 'title', style: 'heading'},
    ],
    [
      'pose',
      {
        TARGET: 'Hero',
        STEPS: '[{"pose":"help","skin":"HeroHappy","sound":"Effect"}]',
      },
      'Hero',
      {steps: [{pose: 'help', skin: 'HeroHappy', sound: 'Effect'}]},
    ],
  ];

  assert.equal(cases.length, 39);
  for (const [command, input, target, args] of cases) {
    assert.deepEqual(adapter.createAction(command, input), {
      target,
      command,
      args,
      handler: 'core',
    });
  }

  assert.deepEqual(
    adapter.createAction('setTransparency', {
      TARGET: 'Hero',
      SPEC: '{"from":0,"to":100,"seconds":1,"background":true}',
    }).args,
    {from: 0, to: 100, seconds: 1, background: true},
  );
  assert.deepEqual(
    adapter.createAction('setSkin', {TARGET: 'Hero', SKIN: 'HeroHappy', SCALE: '75'}).args,
    {skin: 'HeroHappy', scale: 75},
  );
  assert.deepEqual(adapter.createAction('setLayer', {TARGET: 'Hero', LAYER: 'front'}).args, {
    layer: 'front',
  });
});

test('normalizes simple speech blocks to the same validated say/think commands as SPEC blocks', () => {
  const adapter = createDsl4TurboWarpCoreActionBlockAdapter(schema);
  const text = 'こんにちは\n{"text":"JSONではない入力"}';
  const surface = createDsl4TurboWarpCoreActionBlockSurface(Scratch, {visible: true});
  for (const command of ['say', 'think']) {
    const simple = `${command}Text`;
    const definition = surface.blocks.find(({opcode}) => opcode === simple)!;
    assert.equal(definition.text, `actor [TARGET] ${command} text [TEXT] seconds [SECONDS]`);
    assert.equal(
      (definition.arguments as Record<string, {type: unknown}>).SECONDS!.type,
      Scratch.ArgumentType.NUMBER,
    );
    for (const seconds of [0, 0.5, 10, '10']) {
      assert.deepEqual(
        adapter.createAction(simple, {TARGET: 'Hero', TEXT: text, SECONDS: seconds}),
        adapter.createAction(command, {
          TARGET: 'Hero',
          SPEC: JSON.stringify({text, seconds: Number(seconds)}),
        }),
      );
    }
    for (const seconds of [-1, 'bad', Infinity, NaN]) {
      assert.throws(() =>
        adapter.createAction(simple, {TARGET: 'Hero', TEXT: text, SECONDS: seconds}),
      );
    }
    assert.throws(() => adapter.createAction(simple, {TARGET: 'Hero', TEXT: text}));
    assert.throws(() =>
      adapter.createAction(simple, {TARGET: 'Hero', TEXT: text, SECONDS: 1, SPEC: '{}'}),
    );
  }
});

test('fails closed for malformed, unsafe, excessive, or Schema-invalid block inputs', () => {
  const adapter = createDsl4TurboWarpCoreActionBlockAdapter(schema, {
    maxJsonCharacters: 128,
    maxJsonDepth: 4,
    maxJsonNodes: 16,
  });
  const rejects = [
    () => adapter.createAction('unknown', {}),
    () => adapter.createAction('wait', {SECONDS: Number.NaN}),
    () => adapter.createAction('wait', {SECONDS: 1, EXTRA: true}),
    () => adapter.createAction('show', {TARGET: 'Hero', SKIN: 'Skin', X: 0, Y: 0, SCALE: 0}),
    () =>
      adapter.createAction('show', {
        TARGET: 'Hero',
        SKIN: 'Skin',
        X: 0,
        Y: 0,
        SCALE: 100,
        ROTATION: 'mirror',
        DIRECTION: '',
      }),
    () =>
      adapter.createAction('show', {
        TARGET: 'Hero',
        SKIN: 'Skin',
        X: 0,
        Y: 0,
        SCALE: 100,
        ROTATION: '',
        DIRECTION: 'sideways',
      }),
    () => adapter.createAction('say', {TARGET: 'Hero', SPEC: '{"text":"missing wait"}'}),
    () => adapter.createAction('keyInputToChangeScene', {ROUTES: '[]'}),
    () => adapter.createAction('keyInputToChangeScene', {ROUTES: '{'}),
    () =>
      adapter.createAction('keyInputToChangeScene', {
        ROUTES: '{"__proto__":{"scene":"ending"}}',
      }),
    () =>
      adapter.createAction('keyInputToChangeScene', {
        ROUTES: '{"Space":"' + 'x'.repeat(128) + '"}',
      }),
    () =>
      adapter.createAction('keyInputToChangeScene', {
        ROUTES: '{"a":{"b":{"c":{"d":{"e":"ending"}}}}}',
      }),
  ];

  for (const reject of rejects) {
    assert.throws(reject, (error) =>
      /^K4-BLOCK-ACTION/u.test(requireString(thrown(error).code, 'the diagnostic code')),
    );
  }
  assert.throws(
    () => createDsl4TurboWarpCoreActionBlockAdapter(schema, {maxJsonNodes: 1_025}),
    TypeError,
  );
  // The adapter must refuse a limit it does not declare, so this one is passed as the record the
  // adapter validates rather than as the limits type, which by definition cannot describe it.
  const unknownLimit: Record<string, unknown> = {unknown: true};
  assert.throws(() => createDsl4TurboWarpCoreActionBlockAdapter(schema, unknownLimit), TypeError);
});
