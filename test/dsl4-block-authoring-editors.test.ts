import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
import {test} from 'vitest';
import canonicalSchema from '../schema/dsl-4.schema.json' with {type: 'json'};
import {
  createDsl4BlockAuthoringEditorDefinitions,
  createDsl4CoreActionBlockEditorDefinitions,
} from '../src/builder/dsl4-block-authoring-editors.js';
import {
  createDsl4BlockAuthoringExtensionSource,
  dsl4BlockAuthoringExtensionId,
} from '../src/dsl4/structured-block-source.js';

const require = createRequire(import.meta.url);
const Ajv = require('ajv');
const Ajv2020 = require('ajv/dist/2020.js');
const definitions = createDsl4BlockAuthoringEditorDefinitions(dsl4BlockAuthoringExtensionId);

test('projects the canonical schema into eight self-contained draft-07 VALUE editors', () => {
  const valueEditors = definitions.filter(({argument}) => argument === 'VALUE');
  assert.equal(valueEditors.length, 8);
  const roots = [
    'asset',
    'keymap',
    'assetId',
    'textStyle',
    'variableValue',
    'cover',
    'loadingScreen',
    'poseRecognition',
  ];
  const samples: unknown[][] = [
    [
      'backdrop',
      'costume:Hero',
      {kind: 'costume', target: 'Hero', file: 'hero.svg'},
      {
        kind: 'image',
        delivery: 'remote',
        source: {url: 'https://example.com/a.png'},
      },
      {
        kind: 'image',
        delivery: 'remote',
        source: {url: 'https://example.com/a.png', size: 1},
      },
      {kind: 'costume', file: 'hero.svg'},
      {kind: 'unknown'},
      null,
    ],
    [{Space: 'navigation.nextAction'}, {Space: 'invalid'}, {NotAKey: 'navigation.nextAction'}, {}],
    ['HeroIdle', '', {}, null],
    [{size: 24, color: '#ffffff'}, {size: -1}, {unknown: 1}, null],
    [0, 1.5, false, '', 'Hero', null, [], {}, Infinity],
    [{backdrop: 'Beach'}, {backdrop: 'Beach', bgm: 'Music'}, {}, {backdrop: 1}],
    [{backdrop: 'Beach', costumes: ['Loading']}, {backdrop: 'Beach', costumes: []}, {}],
    [{}, {preview: {mirroring: 'mirrored'}}, {preview: {mirroring: 'invalid'}}, {unknown: 1}],
  ];
  const canonical = new Ajv2020({strict: false, allErrors: true});
  canonical.addSchema(canonicalSchema);
  valueEditors.forEach((definition, index) => {
    assert.equal(definition.argument, 'VALUE');
    assert.equal(definition.format, 'json');
    assert.equal(definition.opcodes.length, 1);
    const projected = new Ajv({strict: false}).compile(definition.schema);
    const original = canonical.compile({
      $ref: `${canonicalSchema.$id}#/$defs/${roots[index]}`,
    });
    for (const sample of samples[index]!) {
      assert.equal(
        projected(sample),
        original(sample),
        `${roots[index]}: ${JSON.stringify(sample)}`,
      );
    }
    assert.ok(!JSON.stringify(definition.schema).includes('"default":'));
  });
});

test('projects scene properties without actions while preserving canonical constraints', () => {
  const editor = definitions.find(({editorId}) => editorId === 'scene-properties')!;
  assert.equal(editor.apiVersion, 1);
  assert.equal(editor.extensionId, dsl4BlockAuthoringExtensionId);
  assert.deepEqual(editor.opcodes, [`${dsl4BlockAuthoringExtensionId}_scene`]);
  assert.equal(editor.argument, 'PROPERTIES');
  assert.equal(editor.format, 'json');
  const projected = new Ajv({strict: false}).compile(editor.schema);
  const canonical = new Ajv2020({strict: false});
  canonical.addSchema(canonicalSchema);
  const original = canonical.compile({$ref: `${canonicalSchema.$id}#/$defs/longScene`});
  const cases: [Record<string, unknown>, boolean][] = [
    [{}, true],
    [{recognitionModel: 'PoseModel'}, true],
    [{recognitionMode: 'pose'}, true],
    [{recognitionMode: 'image'}, true],
    [{posePreview: {mirroring: 'unmirrored'}}, true],
    [{entryTransition: {effect: 'cut'}}, true],
    [{entryTransition: 0}, true],
    [
      {
        recognitionModel: 'PoseModel',
        recognitionMode: 'pose',
        posePreview: {mirroring: 'mirrored'},
        entryTransition: {effect: 'crossfade', seconds: 0.5, easing: 'easeInOut'},
      },
      true,
    ],
    [{recognitionModel: ''}, false],
    [{recognitionMode: 'audio'}, false],
    [{posePreview: {}}, false],
    [{posePreview: {mirroring: 'invalid'}}, false],
    [{entryTransition: -1}, false],
    [{entryTransition: {effect: 'crossfade'}}, false],
    [{entryTransition: {effect: 'cut', seconds: 1}}, false],
    [{unknown: true}, false],
  ];
  for (const [sample, expected] of cases) {
    assert.equal(original({...sample, actions: []}), expected, JSON.stringify(sample));
    assert.equal(projected(sample), expected, JSON.stringify(sample));
  }
  for (const sample of [{actions: []}, {actions: [{wait: 0}]}, [], null, '{}']) {
    assert.equal(projected(sample), false, JSON.stringify(sample));
  }
  assert.equal(editor.schema.$schema, 'http://json-schema.org/draft-07/schema#');
  assert.ok(!JSON.stringify(editor.schema).includes('"default":'));
  assert.ok(!JSON.stringify(editor.schema).includes('#/$defs/'));
  assert.ok(!JSON.stringify(editor.schema).includes('"actions"'));
  const transition = (editor.schema.definitions as Record<string, {oneOf: unknown[]}>)
    .visualTransition!;
  for (const [index, effect] of [
    [1, 'cut'],
    [2, 'crossfade'],
  ] as const) {
    const branch = transition.oneOf[index] as {properties: {effect: {const: string}}};
    assert.equal(branch.properties.effect.const, effect);
  }
});

for (const form of ['runtime', 'bundle'] as const) {
  test(`projects the canonical pose steps into a ${form} STEPS editor without relaxing constraints`, () => {
    const editors = createDsl4CoreActionBlockEditorDefinitions(form);
    assert.equal(editors.length, 4);
    const [editor] = editors;
    assert.equal(editor!.apiVersion, 1);
    assert.equal(
      editor!.extensionId,
      form === 'runtime' ? 'kubohiroyakamishibairuntime4' : 'kubohiroyakamishibai4',
    );
    assert.deepEqual(editor!.opcodes, [
      form === 'runtime'
        ? 'kubohiroyakamishibairuntime4_pose'
        : 'kubohiroyakamishibai4_kubohiroyakamishibairuntime4__pose',
    ]);
    assert.equal(editor!.argument, 'STEPS');
    assert.equal(editor!.format, 'json');
    const projected = new Ajv({strict: false}).compile(editor!.schema);
    const canonical = new Ajv2020({strict: false});
    canonical.addSchema(canonicalSchema);
    const original = canonical.compile({
      $ref: `${canonicalSchema.$id}#/$defs/poseArgs/properties/steps`,
    });
    const cases: [unknown, boolean][] = [
      [[{pose: '頭を守る'}], true],
      [[{pose: '頭を守る', skin: 'ProtectHead', sound: 'SuccessSound'}], true],
      [[{pose: 'Ready'}, {pose: 'Finish', skin: 'Finished'}], true],
      [[], false],
      [[{}], false],
      [[{skin: 'ProtectHead'}], false],
      [[{pose: ''}], false],
      [[{pose: 1}], false],
      [[{pose: 'Ready', skin: 1}], false],
      [[{pose: 'Ready', sound: ''}], false],
      [[{pose: 'Ready', confidence: 0.8}], false],
      [[{pose: 'Ready', extra: true}], false],
      [{steps: [{pose: 'Ready'}]}, false],
      [null, false],
      ['[]', false],
    ];
    for (const [sample, expected] of cases) {
      const label = JSON.stringify(sample);
      assert.equal(original(sample), expected, `canonical: ${label}`);
      assert.equal(projected(sample), expected, `projected: ${label}`);
    }
    assert.equal(editor!.schema.$schema, 'http://json-schema.org/draft-07/schema#');
    assert.ok(!JSON.stringify(editor!.schema).includes('"default":'));
    assert.ok(!JSON.stringify(editor!.schema).includes('#/$defs/'));
  });
}

for (const form of ['runtime', 'bundle'] as const) {
  test(`projects canonical animation constraints into the ${form} animate SPEC editor`, () => {
    const editor = createDsl4CoreActionBlockEditorDefinitions(form).find(
      (definition) => definition.editorId === 'action-animate-spec',
    )!;
    const prefix =
      form === 'bundle'
        ? 'kubohiroyakamishibai4_kubohiroyakamishibairuntime4__'
        : 'kubohiroyakamishibairuntime4_';
    assert.deepEqual(editor.opcodes, [`${prefix}animate`]);
    assert.equal(editor.argument, 'SPEC');
    assert.equal(editor.format, 'json');
    const projected = new Ajv({strict: false}).compile(editor.schema);
    const canonical = new Ajv2020({strict: false});
    canonical.addSchema(canonicalSchema);
    const original = canonical.compile({$ref: `${canonicalSchema.$id}#/$defs/animateArgs`});
    const cases: [unknown, boolean][] = [
      [{to: {x: 0}, seconds: 1}, true],
      [{to: {x: 10, y: -5, scale: 120, direction: 90, transparency: 50}, seconds: 2}, true],
      [
        {
          to: {y: 20},
          seconds: 0.5,
          easing: 'easeInOut',
          delaySeconds: 1,
          repeat: 3,
          alternate: true,
          background: true,
        },
        true,
      ],
      [{to: {}, seconds: 1}, false],
      [{to: {x: 0}}, false],
      [{seconds: 1}, false],
      [{to: {x: 0}, seconds: 61}, false],
      [{to: {x: 0}, seconds: '1'}, false],
      [{to: {scale: 0}, seconds: 1}, false],
      [{to: {transparency: 101}, seconds: 1}, false],
      [{to: {z: 1}, seconds: 1}, false],
      [{to: {x: 0}, seconds: 1, easing: 'bounce'}, false],
      [{to: {x: 0}, seconds: 1, repeat: 1.5}, false],
      [{to: {x: 0}, seconds: 1, unexpected: true}, false],
      [null, false],
    ];
    for (const [sample, expected] of cases) {
      assert.equal(original(sample), expected, `canonical: ${JSON.stringify(sample)}`);
      assert.equal(projected(sample), expected, `projected: ${JSON.stringify(sample)}`);
    }
    type Titled = {title?: string; properties?: Record<string, Titled>};
    const properties = editor.schema.properties as Record<string, Titled>;
    assert.equal(properties.seconds!.title, '秒数');
    assert.equal(properties.to!.properties!.x!.title, 'x座標');
    assert.ok(!JSON.stringify(editor.schema).includes('"default":'));
    assert.ok(!JSON.stringify(editor.schema).includes('#/$defs/'));
  });
}

for (const form of ['runtime', 'bundle'] as const) {
  for (const command of ['say', 'think'] as const) {
    test(`projects canonical speech constraints into the ${form} ${command} SPEC editor`, () => {
      const editor = createDsl4CoreActionBlockEditorDefinitions(form).find(
        (definition) => definition.editorId === `action-${command}-spec`,
      )!;
      const prefix =
        form === 'bundle'
          ? 'kubohiroyakamishibai4_kubohiroyakamishibairuntime4__'
          : 'kubohiroyakamishibairuntime4_';
      assert.deepEqual(editor.opcodes, [`${prefix}${command}`]);
      assert.equal(editor.argument, 'SPEC');
      assert.equal(editor.format, 'json');
      const projected = new Ajv({strict: false}).compile(editor.schema);
      const canonical = new Ajv2020({strict: false});
      canonical.addSchema(canonicalSchema);
      const original = canonical.compile({
        $ref: `${canonicalSchema.$id}#/$defs/speechArgs`,
      });
      const cases: [unknown, boolean][] = [
        [{text: 'こんにちは', seconds: 2}, true],
        [{text: '', seconds: 0}, true],
        [{text: '続ける', waitFor: 'advance'}, true],
        [{text: '本文', closePolicy: 'manual'}, true],
        [{text: '本文', seconds: 1, styles: ['dialogue']}, true],
        [{text: '本文', seconds: 1, styles: []}, false],
        [{text: '本文', seconds: 1, styles: null}, false],
        [{text: '本文'}, false],
        [{text: '本文', seconds: -1}, false],
        [{text: '本文', seconds: '2'}, false],
        [{text: 1, seconds: 2}, false],
        [{text: '本文', seconds: 1, closePolicy: 'manual'}, false],
        [{text: '本文', seconds: 1, unexpected: true}, false],
        [null, false],
      ];
      for (const [sample, expected] of cases) {
        assert.equal(original(sample), expected, `canonical: ${JSON.stringify(sample)}`);
        assert.equal(projected(sample), expected, `projected: ${JSON.stringify(sample)}`);
      }
      assert.ok(!JSON.stringify(editor.schema).includes('"default":'));
      assert.ok(!JSON.stringify(editor.schema).includes('#/$defs/'));
    });
  }
}

test('registers and releases definition, scene, pose, animate, say and think forms together', () => {
  const expected = [...definitions, ...createDsl4CoreActionBlockEditorDefinitions('bundle')];
  const recorded: unknown[] = [];
  let removed = 0;
  let extension: {dispose(): void} | undefined;
  runInNewContext(createDsl4BlockAuthoringExtensionSource(expected), {
    console: {warn() {}},
    Scratch: {
      extensions: {
        register(value: typeof extension) {
          extension = value;
        },
      },
      gui: {
        blockEditors: {
          apiVersion: 1,
          registerSchema(value: unknown) {
            recorded.push(value);
            return () => {
              removed++;
            };
          },
        },
      },
    },
  });
  assert.equal(recorded.length, 13);
  assert.deepEqual(JSON.parse(JSON.stringify(recorded)), expected);
  extension!.dispose();
  assert.equal(removed, 13);
});

test('a core-action form registration failure releases the preceding definition and scene forms', () => {
  let extensionRegistered = false;
  let calls = 0;
  let removed = 0;
  let warnings = 0;
  runInNewContext(
    createDsl4BlockAuthoringExtensionSource([
      ...definitions,
      ...createDsl4CoreActionBlockEditorDefinitions('bundle'),
    ]),
    {
      console: {
        warn() {
          warnings++;
        },
      },
      Scratch: {
        extensions: {
          register() {
            extensionRegistered = true;
          },
        },
        gui: {
          blockEditors: {
            apiVersion: 1,
            registerSchema() {
              if (++calls === 10) throw new Error('core-action form unavailable');
              return () => {
                removed++;
              };
            },
          },
        },
      },
    },
  );
  assert.ok(extensionRegistered);
  assert.equal(calls, 10);
  assert.equal(removed, 9);
  assert.equal(warnings, 1);
});

test('registers forms only with a compatible GUI API and releases registrations together', () => {
  for (const api of [
    undefined,
    {
      apiVersion: 2,
      registerSchema() {
        throw new Error('wrong API');
      },
    },
  ]) {
    let registered = false;
    runInNewContext(createDsl4BlockAuthoringExtensionSource(definitions), {
      Scratch: {
        extensions: {
          register() {
            registered = true;
          },
        },
        gui: {blockEditors: api},
      },
    });
    assert.ok(registered);
  }
  const recorded: unknown[] = [];
  let removed = 0;
  let extension: {dispose(): void} | undefined;
  runInNewContext(createDsl4BlockAuthoringExtensionSource(definitions), {
    Scratch: {
      extensions: {
        register(value: typeof extension) {
          extension = value;
        },
      },
      gui: {
        blockEditors: {
          apiVersion: 1,
          registerSchema(value: unknown) {
            recorded.push(value);
            return () => {
              removed++;
            };
          },
        },
      },
    },
  });
  assert.equal(recorded.length, 9);
  extension!.dispose();
  extension!.dispose();
  assert.equal(removed, 9);
});

test('registration failure removes partial forms and preserves ordinary blocks', () => {
  let registered = false;
  let calls = 0;
  let removed = 0;
  let warnings = 0;
  runInNewContext(createDsl4BlockAuthoringExtensionSource(definitions), {
    console: {
      warn() {
        warnings++;
      },
    },
    Scratch: {
      extensions: {
        register() {
          registered = true;
        },
      },
      gui: {
        blockEditors: {
          apiVersion: 1,
          registerSchema() {
            if (++calls === 3) throw new Error('registration failed');
            return () => {
              removed++;
            };
          },
        },
      },
    },
  });
  assert.ok(registered);
  assert.equal(removed, 2);
  assert.equal(warnings, 1);
});

test('capability-enabled aggregate speech forms retain references while default forms stay strict', () => {
  for (const enabled of [false, true]) {
    const editor = createDsl4CoreActionBlockEditorDefinitions('bundle', {
      narrativeControlEnabled: enabled,
    }).find((definition) => definition.editorId === 'action-say-spec')!;
    const validate = new Ajv({strict: false}).compile(editor.schema);
    assert.equal(validate({text: {ref: 'visit.name'}, seconds: 0}), enabled);
    assert(validate({text: 'literal', seconds: 0}));
    assert(!validate({text: {ref: 'invalid reference'}, seconds: 0}));
  }
});
