import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {runInNewContext, runInThisContext} from 'node:vm';
import {test} from 'vitest';
import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate';
import {parse} from 'yaml';

import {authorDsl4BlockSourceSb3} from '../src/builder/dsl4-block-source-author.js';
import {exportDsl4BlockSourcesToYaml} from '../src/builder/dsl4-block-source-export.js';
import {serializeDsl4CanonicalDocument} from '../src/builder/dsl4-validate.js';
import {
  dsl4TurboWarpCoreActionBlockSpecs,
  createDsl4TurboWarpCoreActionBlockSurface,
} from '../src/dsl4/platform/turbowarp-core-action-block.js';
import {
  createDsl4StructuredBlockSourceDeclaration,
  dsl4BlockAuthoringExtensionId,
} from '../src/dsl4/structured-block-source.js';
import {
  extractDsl4BlockSourcesFromProject,
  Dsl4BlockSourceError,
} from '../src/dsl4/turbowarp-yaml-json-block-source.js';
import {dsl4TestSourceFrontend as frontend} from './helpers/dsl4-test-frontend.ts';

type Blocks = ReturnType<typeof createDsl4StructuredBlockSourceDeclaration>;
interface Project {
  targets: {name: string; isStage: boolean; blocks: Blocks}[];
  extensions: string[];
  extensionURLs: Record<string, string>;
}
const helperPrefix = `${dsl4BlockAuthoringExtensionId}_`;
const runtimePrefix = 'kubohiroyakamishibai4_kubohiroyakamishibairuntime4__';
const costumeSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>';
const costumeId = createHash('md5').update(costumeSvg).digest('hex');
const source = `kamishibai: '4.0'
assets:
  Beach: backdrop
  HeroIdle: costume:Hero
actors:
  Hero: HeroIdle
variables:
  score: 0
scenes:
  opening:
    entryTransition: {effect: cut}
    actions:
      - stage:
          backdrop: Beach
          stableId: backdropAction
          transition: {effect: crossfade, seconds: 0.5}
      - Hero.show: {skin: HeroIdle, x: 0, y: -20, scale: 100}
      - Hero.moveTo: {x: 10, y: 20, seconds: 1}
      - Hero.say: {text: こんにちは, seconds: 1}
      - wait: 1
      - wait: 2
      - goto: ending
  ending:
    - wait: 0
`;

function archive(project: Project | Record<string, unknown>) {
  return zipSync({
    'project.json': strToU8(JSON.stringify(project)),
    [`${costumeId}.svg`]: strToU8(costumeSvg),
  });
}
function authored(sourceText = source, runtimeSource?: string): Project {
  const result = authorDsl4BlockSourceSb3({
    baseBytes: archive({
      targets: [
        {
          name: 'Stage',
          isStage: true,
          blocks: {},
          variables: {},
          lists: {},
          broadcasts: {},
          costumes: [
            {
              name: 'blank',
              assetId: costumeId,
              md5ext: `${costumeId}.svg`,
              dataFormat: 'svg',
              bitmapResolution: 1,
              rotationCenterX: 240,
              rotationCenterY: 180,
            },
          ],
          sounds: [],
          comments: {},
          currentCostume: 0,
          volume: 100,
          layerOrder: 0,
          tempo: 60,
          videoTransparency: 50,
          videoState: 'on',
          textToSpeechLanguage: null,
        },
      ],
      extensions: ['kubohiroyakamishibai4'],
      ...(runtimeSource
        ? {
            extensionURLs: {
              kubohiroyakamishibai4:
                'data:text/javascript;base64,' + Buffer.from(runtimeSource).toString('base64'),
            },
          }
        : {}),
      monitors: [],
      meta: {semver: '3.0.0', vm: '0.2.0', agent: 'block script roundtrip test'},
    }),
    sourceText,
    sourceFrontend: frontend,
  });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics.slice(0, 6)));
  if (!result.ok) throw new Error('Authoring failed');
  return JSON.parse(strFromU8(unzipSync(result.bytes)['project.json']!)) as Project;
}
function blocksOf(project: Project): Blocks {
  return project.targets[0]!.blocks;
}
function blockWith(blocks: Blocks, opcode: string) {
  const entry = Object.entries(blocks).find(([, block]) => block.opcode === opcode);
  assert.ok(entry, `Missing block ${opcode}`);
  return entry;
}
function setInput(block: Blocks[string], name: string, value: unknown) {
  block.inputs[name] = [1, [10, value]];
}
function extracted(project: Project): string {
  return extractDsl4BlockSourcesFromProject(project).sources['Stage.k4.yml']!;
}
function comparable(text: string) {
  const result = frontend.parse(text, {sourceId: 'main'});
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics.slice(0, 6)));
  return serializeDsl4CanonicalDocument(result);
}

test('places real action blocks in scene substacks and retains metadata and optional arguments', () => {
  const project = authored();
  const blocks = blocksOf(project);
  assert.ok(Object.values(blocks).some(({opcode}) => opcode === `${runtimePrefix}stage`));
  assert.ok(Object.values(blocks).some(({opcode}) => opcode === `${runtimePrefix}say`));
  assert.ok(!Object.values(blocks).some(({opcode}) => opcode.endsWith('dsl4SourceFromYamlJson')));
  assert.ok(!JSON.stringify(blocks).includes(source));
  const scenes = Object.values(blocks).filter(({opcode}) => opcode === `${helperPrefix}scene`);
  assert.equal(scenes.length, 2);
  assert.ok(scenes.every(({inputs}) => Array.isArray(inputs.SUBSTACK)));
  assert.equal(comparable(extracted(project)), comparable(source));
  const decoded = parse(extracted(project));
  assert.ok(!Object.hasOwn(decoded.scenes.opening.actions[2]['Hero.moveTo'], 'easing'));
});

test('retains meaning for the comprehensive production fixture', async () => {
  const fixture = await readFile(
    new URL('fixtures/dsl4/valid/comprehensive.kamishibai.yaml', import.meta.url),
    'utf8',
  );
  const project = authored(fixture);
  const blocks = blocksOf(project);
  for (const opcode of [
    'asset',
    'control',
    'actor',
    'textStyle',
    'variable',
    'cover',
    'loading',
    'recognition',
  ]) {
    const definitions = Object.values(blocks).filter(
      (block) => block.opcode === `${helperPrefix}${opcode}`,
    );
    assert.ok(definitions.length, `Missing ${opcode} definitions`);
    assert.ok(definitions.every((block) => !Object.hasOwn(block.inputs, 'PATH')));
    assert.equal(
      definitions.every((block) => Object.hasOwn(block.inputs, 'NAME')),
      !['cover', 'loading', 'recognition'].includes(opcode),
    );
  }
  // The remaining branch declarations retain their advanced property representation.
  const properties = Object.values(blocks).filter(
    (block) => block.opcode === `${helperPrefix}property`,
  );
  assert.equal(properties.length, 1);
  assert.ok(JSON.stringify(properties[0]!.inputs.PATH).includes('branches'));
  assert.deepEqual(project, authored(fixture));
  assert.equal(comparable(extracted(project)), comparable(fixture));
});

test('round-trips dedicated declarations and remaining metadata in both runtime forms', () => {
  const original = {
    kamishibai: '4.0',
    assets: {
      'Urashima-walk-1': {kind: 'costume', target: 'Urashima', name: 'walk-1'},
      Beach: 'backdrop',
      Music: 'sound',
      Loading: 'costume:Loading',
    },
    actors: {Urashima: 'Urashima-walk-1'},
    textStyles: {本文: {size: 24, font: 'sans-serif'}},
    variables: {score: 2, enabled: false, player: '浦島'},
    cover: {backdrop: 'Beach', bgm: 'Music'},
    loading: {backdrop: 'Beach', costumes: ['Loading']},
    recognition: {preview: {mirroring: 'mirrored'}},
    controls: {keymaps: {production: {Space: 'navigation.nextAction'}}},
    presentation: {transitions: {scene: 0}},
    audio: {bgm: {transition: 0}},
    bubbleStyles: {dialog: {textStyle: '本文'}},
    bubbleClosePolicies: {click: {waitFor: 'advance'}},
    branches: {ending: [{else: 'ending'}]},
    scenes: {ending: [{wait: 0}]},
  };
  for (const form of ['runtime', 'bundle'] as const) {
    const blocks = createDsl4StructuredBlockSourceDeclaration({
      source: original,
      form,
      hatId: 'hat',
    });
    const yaml = extracted({
      targets: [{name: 'Stage', isStage: true, blocks}],
      extensions: [],
      extensionURLs: {},
    });
    assert.deepEqual(parse(yaml), original);
    assert.equal(comparable(yaml), comparable(JSON.stringify(original)));
  }
});

test('preserves explicit empty definition collections and empty singleton settings', () => {
  const original = {
    kamishibai: '4.0',
    assets: {},
    actors: {},
    variables: {},
    textStyles: {},
    recognition: {},
    scenes: {opening: [{wait: 0}]},
  };
  const project = authored(JSON.stringify(original));
  assert.deepEqual(parse(extracted(project)), original);
  assert.equal(comparable(extracted(project)), comparable(JSON.stringify(original)));
});

test('exports definition renaming, value edits, insertion and deletion as validated YAML', async () => {
  const project = authored(source.replace('score: 0', 'score: 0\n  unused: 3'));
  const blocks = blocksOf(project);
  const [variableId, variable] = blockWith(blocks, `${helperPrefix}variable`);
  setInput(variable, 'NAME', 'points');
  setInput(variable, 'VALUE', '42');
  const next = variable.next!;
  const additions = createDsl4StructuredBlockSourceDeclaration({
    source: {variables: {enabled: true, player: '浦島'}},
    form: 'bundle',
    hatId: 'temporaryHat',
    idPrefix: 'added-',
    label: 'fragment',
  });
  const [temporaryConfigId, temporaryConfig] = blockWith(
    additions,
    `${helperPrefix}kamishibaiConfig`,
  );
  const first = temporaryConfig.next!;
  delete additions.temporaryHat;
  delete additions[temporaryConfigId];
  Object.assign(blocks, additions);
  variable.next = first;
  blocks[first]!.parent = variableId;
  const last = Object.entries(additions).find(([, block]) => block.next === null)![0];
  blocks[last]!.next = next;
  blocks[next]!.parent = last;
  const unusedEntry = Object.entries(blocks).find(
    ([, block]) =>
      block.opcode === `${helperPrefix}variable` &&
      JSON.stringify(block.inputs.NAME).includes('unused'),
  );
  assert.ok(unusedEntry);
  const [unusedId, unused] = unusedEntry;
  blocks[unused.parent!]!.next = unused.next;
  if (unused.next) blocks[unused.next]!.parent = unused.parent;
  delete blocks[unusedId];
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsl4-definition-edit-'));
  try {
    const input = path.join(directory, 'edited.sb3');
    await writeFile(input, archive(project));
    const result = await exportDsl4BlockSourcesToYaml({
      input,
      outputDir: directory,
      name: 'edited',
      sourceFrontend: frontend,
      maxSourceBytes: 1024 * 1024,
    });
    const yaml = parse(await readFile(result.outputPath, 'utf8'));
    assert.deepEqual(yaml.variables, {points: 42, enabled: true, player: '浦島'});
    assert.equal(yaml.variables.unused, undefined);
    assert.equal(comparable(extracted(project)), comparable(JSON.stringify(yaml)));
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('exports input edits, action reordering, insertion, deletion and scene renaming from the graph', async () => {
  const project = authored();
  const blocks = blocksOf(project);
  const [sceneId, scene] = blockWith(blocks, `${helperPrefix}scene`);
  setInput(scene, 'SCENE', 'editedOpening');
  const [, speech] = blockWith(blocks, `${runtimePrefix}say`);
  setInput(speech, 'SPEC', '{"text":"編集しました","seconds":3}');
  const [firstWaitId, firstWait] = blockWith(blocks, `${runtimePrefix}wait`);
  const secondWaitId = firstWait.next!;
  const secondWait = blocks[secondWaitId]!;
  const gotoId = secondWait.next!;
  const previousId = firstWait.parent!;
  // Swap the two waits using the same next/parent links that an editor saves.
  blocks[previousId]!.next = secondWaitId;
  secondWait.parent = previousId;
  secondWait.next = firstWaitId;
  firstWait.parent = secondWaitId;
  firstWait.next = 'insertedWait';
  setInput(firstWait, 'SECONDS', 9);
  // Insert a new wait and disconnect the goto; disconnected blocks are not part of the script.
  blocks.insertedWait = {
    ...firstWait,
    parent: firstWaitId,
    next: null,
    inputs: {SECONDS: [1, [4, 7]]},
  };
  blocks[gotoId]!.parent = null;
  blocks[gotoId]!.topLevel = true;
  assert.equal(blocks[sceneId], scene);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsl4-block-edit-'));
  try {
    const input = path.join(directory, 'edited.sb3');
    await writeFile(input, archive(project));
    const result = await exportDsl4BlockSourcesToYaml({
      input,
      outputDir: directory,
      name: 'edited',
      sourceFrontend: frontend,
      maxSourceBytes: 1024 * 1024,
    });
    const yaml = parse(await readFile(result.outputPath, 'utf8'));
    assert.deepEqual(Object.keys(yaml.scenes), ['editedOpening', 'ending']);
    const actions = yaml.scenes.editedOpening.actions;
    assert.deepEqual(actions[3], {'Hero.say': {text: '編集しました', seconds: 3}});
    assert.deepEqual(actions.slice(4), [{wait: 2}, {wait: 9}, {wait: 7}]);
    assert.deepEqual(yaml.scenes.editedOpening.entryTransition, {effect: 'cut'});
    assert.equal(actions[0].stage.stableId, 'backdropAction');
    assert.deepEqual(actions[0].stage.transition, {effect: 'crossfade', seconds: 0.5});
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('exports edits to optional properties, scene ordering and story metadata', () => {
  const project = authored();
  const blocks = blocksOf(project);
  const [, move] = blockWith(blocks, `${runtimePrefix}moveTo`);
  setInput(move, 'EASING', 'easeIn');
  const [, variable] = blockWith(blocks, `${helperPrefix}variable`);
  setInput(variable, 'VALUE', '42');
  const [sceneId, scene] = blockWith(blocks, `${helperPrefix}scene`);
  const endingId = scene.next!;
  const ending = blocks[endingId]!;
  const previous = scene.parent!;
  blocks[previous]!.next = endingId;
  ending.parent = previous;
  ending.next = sceneId;
  scene.parent = endingId;
  scene.next = null;
  const yaml = parse(extracted(project));
  assert.deepEqual(Object.keys(yaml.scenes), ['ending', 'opening']);
  assert.equal(yaml.variables.score, 42);
  assert.equal(yaml.scenes.opening.actions[2]['Hero.moveTo'].easing, 'easeIn');
});

test('round-trips all 34 core actions using their own opcodes, including scalar/long arguments', () => {
  const actions = [
    {stage: {backdrop: 'Beach', stableId: 'stageId'}},
    {bgm: {sound: 'Music', restart: false, volume: 35}},
    {stopBgm: null},
    {setBgmVolume: 30},
    {sound: 'Sound'},
    {wait: {seconds: 2, stableId: 'waitId'}},
    {debugger: null},
    {broadcastMessageAndWait: 'hello'},
    {transition: {effect: 'fadeOut', seconds: 1}},
    {goto: 'ending'},
    {branch: 'branch'},
    {setVariable: {name: 'score', value: false}},
    {changeVariable: {name: 'score', by: -2}},
    {toggleVariable: 'flag'},
    {keyInputToChangeScene: {Space: 'ending'}},
    {touchInputToChangeScene: {Hero: 'ending'}},
    {poseInputToChangeScene: {routes: {Pose: 'ending'}, stableId: 'poseRoute'}},
    {imageInputToChangeScene: {Label: 'ending'}},
    {
      'Hero.show': {
        skin: 'Skin',
        x: 0,
        y: -10,
        scale: 80,
        transition: {effect: 'fadeOut', seconds: 1},
      },
    },
    {'Hero.hide': {transition: {effect: 'fadeOut', seconds: 1}}},
    {'Hero.setTransparency': {from: 0, to: 100, seconds: 1, stableId: 'fade'}},
    {'Hero.moveTo': {x: 1, y: 2, seconds: 3}},
    {'Hero.say': {text: 'Hello', seconds: 2, stableId: 'speechId'}},
    {'Hero.think': {text: 'Hmm', waitFor: 'advance'}},
    {'Hero.setSkin': {skin: 'Skin', stableId: 'skinId'}},
    {'Hero.setLayer': {layer: 2, stableId: 'layerId'}},
    {'Hero.loop': {steps: [{skin: 'Skin', seconds: 1}], stableId: 'loopId'}},
    {'Caption.setText': {text: [{text: 'Rich text'}], stableId: 'textId'}},
    {'Hero.pose': {steps: [{pose: 'Pose'}], stableId: 'poseId'}},
    {
      video: {
        id: 'movie',
        url: 'https://example.com/movie.webm',
        x: 0,
        y: 0,
        width: 320,
        height: 180,
        muted: true,
      },
    },
    {videoControl: {id: 'movie', operation: 'play'}},
    {audio: {id: 'music', url: 'https://example.com/music.mp3'}},
    {audioControl: {id: 'music', operation: 'play'}},
    {gotoSegment: 'chapter2'},
  ];
  for (const form of ['runtime', 'bundle'] as const) {
    const blocks = createDsl4StructuredBlockSourceDeclaration({
      source: {kamishibai: '4.0', scenes: {opening: actions}},
      form,
      hatId: 'hat',
    });
    const project = {targets: [{isStage: true, name: 'Stage', blocks}]};
    const decoded = parse(extractDsl4BlockSourcesFromProject(project).sources['Stage.k4.yml']!);
    const output = decoded.scenes.opening;
    assert.equal(output.length, 34);
    for (const {command} of dsl4TurboWarpCoreActionBlockSpecs) {
      assert.ok(
        Object.values(blocks).some(({opcode}) =>
          opcode.endsWith(form === 'runtime' ? `_${command}` : `__${command}`),
        ),
        command,
      );
    }
    assert.deepEqual(output[0], actions[0]);
    assert.deepEqual(output[1], actions[1]);
    assert.deepEqual(output[2], {stopBgm: {}});
    assert.deepEqual(output[3], {setBgmVolume: {volume: 30}});
    assert.deepEqual(output[11], actions[11]);
    assert.deepEqual(output[14], {keyInputToChangeScene: {routes: {Space: 'ending'}}});
    for (const index of [5, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]) {
      assert.deepEqual(output[index], actions[index], `action ${index}`);
    }
  }
});

test('round-trips and edits simple speech alongside legacy SPEC blocks in both block forms', () => {
  for (const form of ['runtime', 'bundle'] as const) {
    const actions = [
      {'Hero.say': {text: 'abc', seconds: 10}},
      {'Hero.think': {text: '心の声\n{"text":"literal"}', seconds: 0}},
      {'Hero.say': {text: 'advance', waitFor: 'advance'}},
      {'Hero.think': {text: 'rich', seconds: 1, styles: ['thought']}},
    ];
    const source = {kamishibai: '4.0', scenes: {opening: actions}};
    const blocks = createDsl4StructuredBlockSourceDeclaration({source, form, hatId: 'hat'});
    const prefix = form === 'runtime' ? 'kubohiroyakamishibairuntime4_' : runtimePrefix;
    const [, say] = blockWith(blocks, `${prefix}sayText`);
    const [, think] = blockWith(blocks, `${prefix}thinkText`);
    assert.deepEqual(Object.keys(say.inputs), ['TARGET', 'TEXT', 'SECONDS']);
    blockWith(blocks, `${prefix}say`);
    blockWith(blocks, `${prefix}think`);
    const project = {targets: [{isStage: true, name: 'Stage', blocks}]};
    const decoded = () =>
      parse(extractDsl4BlockSourcesFromProject(project).sources['Stage.k4.yml']!);
    assert.deepEqual(decoded(), source);
    setInput(say, 'TEXT', '編集したセリフ');
    setInput(say, 'SECONDS', 2.5);
    setInput(think, 'TARGET', 'Other');
    assert.deepEqual(decoded().scenes.opening[0], {
      'Hero.say': {text: '編集したセリフ', seconds: 2.5},
    });
    assert.deepEqual(decoded().scenes.opening[1], {'Other.think': actions[1]!['Hero.think']});
    // Existing saved SPEC blocks remain readable even for a basic timed speech.
    say.opcode = `${prefix}say`;
    say.inputs = {TARGET: [1, [10, 'Hero']], SPEC: [1, [10, '{"text":"legacy","seconds":10}']]};
    assert.deepEqual(decoded().scenes.opening[0], {'Hero.say': {text: 'legacy', seconds: 10}});
  }
});

test('round-trips video planes, signed z-indices and control values in both block forms', () => {
  for (const form of ['runtime', 'bundle'] as const) {
    for (const settings of [{}, {plane: 'front', zIndex: 0}, {plane: 'background', zIndex: -10}]) {
      const actions = [
        {
          video: {
            id: 'movie',
            url: 'https://example.com/movie.webm',
            x: 0,
            y: 0,
            width: 320,
            height: 180,
            ...settings,
          },
        },
        {videoControl: {id: 'movie', operation: 'seek', seconds: 1.5}},
        {videoControl: {id: 'movie', operation: 'setMuted', muted: false}},
        {videoControl: {id: 'movie', operation: 'setVolume', volume: 35}},
        {videoControl: {id: 'movie', operation: 'setPlaybackRate', rate: 1.5}},
      ];
      const blocks = createDsl4StructuredBlockSourceDeclaration({
        source: {kamishibai: '4.0', scenes: {opening: actions}},
        form,
        hatId: 'hat',
      });
      const decoded = parse(
        extractDsl4BlockSourcesFromProject({targets: [{isStage: true, name: 'Stage', blocks}]})
          .sources['Stage.k4.yml']!,
      );
      assert.equal(decoded.kamishibai, '4.0');
      assert.deepEqual(decoded.scenes.opening, actions);
    }
  }
});

test('preserves custom action arguments as editable blocks', () => {
  const actions = [{'Hero.wave': {arguments: {count: 2}, stableId: 'wave'}}];
  const blocks = createDsl4StructuredBlockSourceDeclaration({
    source: {kamishibai: '4.0', scenes: {opening: actions}},
    form: 'bundle',
    hatId: 'hat',
  });
  const [, custom] = blockWith(blocks, `${helperPrefix}customAction`);
  setInput(custom, 'ARGUMENTS', '{"count":4}');
  const project = {targets: [{isStage: true, name: 'Stage', blocks}]};
  const yaml = parse(extractDsl4BlockSourcesFromProject(project).sources['Stage.k4.yml']!);
  assert.deepEqual(yaml.scenes.opening, [{'Hero.wave': {arguments: {count: 4}, stableId: 'wave'}}]);
});

test('authors pose steps as a C-block of pose/skin/sound step blocks and reads edits back', () => {
  const steps = [{pose: 'Wave', skin: 'HeroWave', sound: 'Chime'}, {pose: 'Bow'}];
  const blocks = createDsl4StructuredBlockSourceDeclaration({
    source: {kamishibai: '4.0', scenes: {opening: [{'Hero.pose': {steps}}]}},
    form: 'runtime',
    hatId: 'hat',
  });
  assert.ok(!Object.values(blocks).some(({opcode}) => opcode.endsWith('_pose')));
  const [outerId, outer] = blockWith(blocks, `${helperPrefix}poseSteps`);
  const stepBlocks = Object.entries(blocks).filter(
    ([, block]) => block.opcode === `${helperPrefix}poseStep`,
  );
  assert.equal(stepBlocks.length, 2);
  assert.deepEqual(outer.inputs.SUBSTACK, [2, stepBlocks[0]![0]]);
  assert.equal(stepBlocks[0]![1].parent, outerId);
  assert.equal(stepBlocks[0]![1].next, stepBlocks[1]![0]);
  const project = {targets: [{isStage: true, name: 'Stage', blocks}]};
  const read = () => parse(extractDsl4BlockSourcesFromProject(project).sources['Stage.k4.yml']!);
  assert.deepEqual(read().scenes.opening, [{'Hero.pose': {steps}}]);

  setInput(stepBlocks[1]![1], 'SKIN', 'HeroBow');
  setInput(stepBlocks[0]![1], 'SOUND', '');
  assert.deepEqual(read().scenes.opening, [
    {
      'Hero.pose': {
        steps: [
          {pose: 'Wave', skin: 'HeroWave'},
          {pose: 'Bow', skin: 'HeroBow'},
        ],
      },
    },
  ]);

  delete outer.inputs.SUBSTACK;
  for (const [id] of stepBlocks) delete blocks[id];
  assert.throws(read, /at least one pose step/u);
});

test('ships editor definitions for scenes and option substacks without relying on a newer base', () => {
  const project = authored();
  assert.ok(project.extensions.includes(dsl4BlockAuthoringExtensionId));
  const url = project.extensionURLs[dsl4BlockAuthoringExtensionId]!;
  assert.match(url, /^data:text\/javascript;base64,/u);
  const editors: {argument: string}[] = [];
  let info:
    | {
        id: string;
        blocks: {
          opcode: string;
          branchCount?: number;
          blockIconURI?: string;
          blockType?: string;
          hideFromPalette?: boolean;
          text?: string;
          arguments?: Record<string, {defaultValue: string}>;
        }[];
      }
    | undefined;
  runInNewContext(Buffer.from(url.split(',')[1]!, 'base64').toString('utf8'), {
    Scratch: {
      gui: {
        blockEditors: {
          apiVersion: 1,
          registerSchema(editor: {argument: string}) {
            editors.push(editor);
            return () => {};
          },
        },
      },
      extensions: {
        register(extension: {getInfo(): typeof info}) {
          info = extension.getInfo();
        },
      },
    },
  });
  assert.equal(info?.id, dsl4BlockAuthoringExtensionId);
  assert.equal(editors.length, 12);
  assert.equal(editors.filter(({argument}) => argument === 'VALUE').length, 8);
  assert.equal(editors.filter(({argument}) => argument === 'PROPERTIES').length, 1);
  assert.equal(editors.filter(({argument}) => argument === 'STEPS').length, 1);
  assert.equal(editors.filter(({argument}) => argument === 'SPEC').length, 2);
  const hats = info?.blocks.filter((block) => block.blockType === 'hat');
  assert.equal(hats?.length, 2);
  assert.equal(hats?.[0]?.opcode, 'kamishibai');
  assert.equal(hats?.[1]?.opcode, 'kamishibaiConfig');
  assert.equal(hats?.[1]?.arguments?.LABEL?.defaultValue, '');
  assert.equal(hats?.[0]?.arguments?.VERSION?.defaultValue, '4.0');
  assert.equal(hats?.[0]?.arguments?.LABEL?.defaultValue, '');
  for (const opcode of ['scene', 'actionOptions']) {
    assert.equal(info?.blocks.find((block) => block.opcode === opcode)?.branchCount, 1);
  }
  assert.match(
    info!.blocks.find((block) => block.opcode === 'scene')!.blockIconURI!,
    /^data:image\/svg\+xml,/u,
  );
  assert.equal(info?.blocks.find((block) => block.opcode === 'property')?.hideFromPalette, true);
  for (const opcode of [
    'asset',
    'control',
    'actor',
    'textStyle',
    'variable',
    'cover',
    'loading',
    'recognition',
  ]) {
    const definition: NonNullable<typeof info>['blocks'][number] | undefined = info?.blocks.find(
      (block) => block.opcode === opcode,
    );
    assert.ok(definition);
    assert.equal(definition.blockType, 'command');
    assert.notEqual(definition.hideFromPalette, true);
    const named = !['cover', 'loading', 'recognition'].includes(opcode);
    assert.equal(definition.text, `${opcode}${named ? ' [NAME]' : ''} = JSON [VALUE]`);
    assert.equal(Object.hasOwn(definition.arguments!, 'NAME'), named);
    assert.doesNotThrow(() => JSON.parse(definition.arguments!.VALUE!.defaultValue));
  }
});

test('reads legacy properties and detects overlaps with dedicated declarations in either order', async () => {
  const fixture = await readFile(
    new URL('fixtures/dsl4/valid/comprehensive.kamishibai.yaml', import.meta.url),
    'utf8',
  );
  const original = authored(fixture);
  const legacy = structuredClone(original);
  const paths: Record<string, string[]> = {
    asset: ['assets'],
    control: ['controls', 'keymaps'],
    actor: ['actors'],
    textStyle: ['textStyles'],
    variable: ['variables'],
    cover: ['cover'],
    loading: ['loading'],
    recognition: ['recognition'],
  };
  for (const [opcode, path] of Object.entries(paths)) {
    const [, declaration] = blockWith(blocksOf(original), `${helperPrefix}${opcode}`);
    const [legacyId, legacyBlock] = blockWith(blocksOf(legacy), `${helperPrefix}${opcode}`);
    // Old properties store keymaps as one mapping and singleton settings as field entries.
    const name = declaration.inputs.NAME;
    const literalName = Array.isArray(name) && Array.isArray(name[1]) ? name[1][1] : undefined;
    const propertyPath =
      opcode === 'control' ? path : literalName === undefined ? path : [...path, literalName];
    const rawValue = (declaration.inputs.VALUE as [number, [number, string]])[1][1];
    const value =
      opcode === 'control' ? JSON.stringify(parse(extracted(original)).controls.keymaps) : rawValue;
    legacyBlock.opcode = `${helperPrefix}property`;
    legacyBlock.inputs = {PATH: [1, [10, JSON.stringify(propertyPath)]], VALUE: [1, [10, value]]};
    if (opcode === 'control') {
      for (const [otherId, other] of Object.entries(blocksOf(legacy))) {
        if (other.opcode !== `${helperPrefix}control`) continue;
        blocksOf(legacy)[other.parent!]!.next = other.next;
        if (other.next !== null) blocksOf(legacy)[other.next]!.parent = other.parent;
        delete blocksOf(legacy)[otherId];
      }
    }
    for (const legacyFirst of [true, false]) {
      const project = structuredClone(original);
      const blocks = blocksOf(project);
      const [id, block] = blockWith(blocks, `${helperPrefix}${opcode}`);
      const next = block.next;
      blocks.conflict = {...structuredClone(legacyBlock), parent: id, next};
      block.next = 'conflict';
      if (next !== null) blocks[next]!.parent = 'conflict';
      if (legacyFirst) {
        blocks.conflict.opcode = block.opcode;
        blocks.conflict.inputs = block.inputs;
        block.opcode = legacyBlock.opcode;
        block.inputs = legacyBlock.inputs;
      }
      assert.throws(
        () => extracted(project),
        (error: unknown) => {
          assert.ok(error instanceof Dsl4BlockSourceError);
          assert.equal(error.targetName, 'Stage');
          assert.equal(error.blockId, 'conflict');
          assert.match(error.message, /overlapping/);
          return true;
        },
        `${opcode}, legacy first: ${legacyFirst}`,
      );
    }
    assert.ok(legacyId);
  }
  assert.equal(comparable(extracted(legacy)), comparable(fixture));
});

test('rejects duplicate dedicated names and singleton settings with target and block diagnostics', async () => {
  const fixture = await readFile(
    new URL('fixtures/dsl4/valid/comprehensive.kamishibai.yaml', import.meta.url),
    'utf8',
  );
  for (const opcode of [
    'asset',
    'control',
    'actor',
    'textStyle',
    'variable',
    'cover',
    'loading',
    'recognition',
  ]) {
    const project = authored(fixture);
    const blocks = blocksOf(project);
    const [id, block] = blockWith(blocks, `${helperPrefix}${opcode}`);
    const next = block.next;
    blocks.duplicate = {...structuredClone(block), parent: id};
    block.next = 'duplicate';
    if (next !== null) blocks[next]!.parent = 'duplicate';
    assert.throws(
      () => extracted(project),
      (error: unknown) => {
        assert.ok(error instanceof Dsl4BlockSourceError);
        assert.equal(error.code, 'K4-BLOCK-SOURCE-GRAPH-001');
        assert.equal(error.targetName, 'Stage');
        assert.equal(error.blockId, 'duplicate');
        return true;
      },
      opcode,
    );
  }
});

test('rejects invalid definition names, JSON, value types and input connections at the declaration', () => {
  const values: Record<string, unknown> = {
    assets: {Beach: 'backdrop'},
    actors: {Hero: 'Idle'},
    variables: {score: 0},
    textStyles: {title: {}},
    controls: {keymaps: {production: {Space: 'navigation.nextAction'}}},
    cover: {backdrop: 'Beach'},
    loading: {backdrop: 'Beach', costumes: ['Loading']},
    recognition: {},
    scenes: {opening: [{wait: 0}]},
  };
  const invalidValues: Record<string, string[]> = {
    asset: ['null', '[]', '123', '""'],
    actor: ['{}', 'false', '""'],
    variable: ['null', '{}', '[]', '1e400'],
    textStyle: ['null', '[]', '"style"'],
    control: ['null', '[]', '"map"'],
    cover: ['null', '[]'],
    loading: ['null', '[]'],
    recognition: ['null', '[]'],
  };
  for (const [opcode, invalid] of Object.entries(invalidValues)) {
    const mutations: ((block: Blocks[string]) => void)[] = [
      ...[...invalid, '{', '{"__proto__":{}}'].map(
        (value) => (block: Blocks[string]) => setInput(block, 'VALUE', value),
      ),
      (block) => {
        delete block.inputs.VALUE;
      },
      (block) => {
        block.inputs.SUBSTACK = [2, 'unexpected'];
      },
      (block) => {
        block.parent = 'wrong';
      },
      (block) => {
        block.inputs.VALUE = [3, [12, 'score', 'variable'], [10, '0']];
      },
    ];
    const named = !['cover', 'loading', 'recognition'].includes(opcode);
    if (named) {
      for (const name of [
        '',
        '__proto__',
        'constructor',
        'prototype',
        ...(opcode === 'asset' ? [] : ['bad name', '0']),
      ]) {
        mutations.push((block) => setInput(block, 'NAME', name));
      }
      mutations.push((block) => {
        delete block.inputs.NAME;
      });
    }
    for (const mutate of mutations) {
      const blocks = createDsl4StructuredBlockSourceDeclaration({
        source: values,
        form: 'bundle',
        hatId: 'hat',
      });
      const [id, block] = blockWith(blocks, `${helperPrefix}${opcode}`);
      mutate(block);
      const project: Project = {
        targets: [{isStage: true, name: 'Stage', blocks}],
        extensions: [],
        extensionURLs: {},
      };
      assert.throws(
        () => extracted(project),
        (error: unknown) => {
          assert.ok(error instanceof Dsl4BlockSourceError);
          assert.equal(error.targetName, 'Stage');
          assert.equal(error.blockId, id);
          return true;
        },
        opcode,
      );
    }
  }
});

test('retains dedicated definitions, scenes and labeled includes through a pinned TurboWarp VM load, edit and resave', async () => {
  const require = createRequire(import.meta.url);
  const VirtualMachine = require('scratch-vm');
  const Scratch = {
    BlockType: require('scratch-vm/src/extension-support/block-type'),
    ArgumentType: require('scratch-vm/src/extension-support/argument-type'),
  };
  const core = createDsl4TurboWarpCoreActionBlockSurface(Scratch, {visible: true});
  const retiredSourceBlocks = [
    {opcode: 'whenDsl4Source', blockType: 'hat', text: 'when kamishibai DSL source'},
    {opcode: 'dsl4SourceFromYamlJson', blockType: 'command', text: 'old source'},
  ];
  const definitions = [...retiredSourceBlocks, ...core.blocks].map((block) => ({
    ...block,
    opcode: `kubohiroyakamishibairuntime4__${block.opcode}`,
  }));
  const info = {
    id: 'kubohiroyakamishibai4',
    name: 'Runtime action palette fixture',
    blocks: definitions,
    menus: core.menus,
  };
  const infoJson = JSON.stringify(info)
    .replaceAll('dsl4TransitionEffect', 'kubohiroyakamishibairuntime4__dsl4TransitionEffect')
    .replaceAll('dsl4MoveEasing', 'kubohiroyakamishibairuntime4__dsl4MoveEasing')
    .replaceAll('dsl4VariableValueType', 'kubohiroyakamishibairuntime4__dsl4VariableValueType');
  const runtime =
    'Scratch.extensions.register(Object.assign({getInfo(){return ' +
    infoJson +
    ';}},Object.fromEntries(' +
    JSON.stringify(definitions.map(({opcode}) => opcode)) +
    '.map(opcode=>[opcode,()=>false]))));';
  const vmSource =
    source.replace(
      'HeroIdle: costume:Hero',
      'HeroIdle: costume:Hero\n  HeroOther: costume:Hero\n  Ocean: backdrop',
    ) +
    '    - setVariable: {name: score, value: 5}\n    - transition: {effect: fadeOut, seconds: 1}\n' +
    'textStyles:\n  title: {size: 24}\ncover: {backdrop: Beach}\n' +
    'loading: {backdrop: Beach, costumes: [HeroIdle]}\nrecognition: {}\n' +
    'controls:\n  keymaps:\n    production: {Space: navigation.nextAction}\n';
  const project = authored(vmSource, runtime);
  const names = ['document', 'location', 'Scratch', 'ScratchExtensions'] as const;
  const previous = names.map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  Object.defineProperties(globalThis, {
    document: {
      configurable: true,
      value: {
        visibilityState: 'visible',
        scripts: [],
        addEventListener() {},
        removeEventListener() {},
        createElement() {
          return {src: '', onerror: null};
        },
        body: {
          appendChild(script: {src: string; onerror?: (error: unknown) => void}) {
            try {
              runInThisContext(Buffer.from(script.src.split(',')[1]!, 'base64').toString('utf8'));
            } catch (error) {
              script.onerror?.(error);
            }
          },
        },
      },
    },
    location: {configurable: true, value: {href: 'https://blocks.test/'}},
  });
  const vm = new VirtualMachine();
  try {
    const ScratchStorage = require('@turbowarp/scratch-storage');
    vm.attachStorage(new ScratchStorage());
    vm.securityManager.canLoadExtensionFromProject = () => true;
    vm.securityManager.getSandboxMode = () => 'unsandboxed';
    await vm.loadProject(archive(project));
    assert.equal(
      vm.runtime
        .getBlocksJSON()
        .some(
          ({type}: {type: string}) =>
            type.endsWith('whenDsl4Source') || type.endsWith('dsl4SourceFromYamlJson'),
        ),
      false,
    );
    assert.equal(comparable(extracted(JSON.parse(vm.toJSON()))), comparable(vmSource));
    const definitions: {type: string; [key: string]: unknown}[] = vm.runtime.getBlocksJSON();
    for (const opcode of ['scene', 'actionOptions']) {
      const definition = definitions.find(({type}) => type === `${helperPrefix}${opcode}`);
      assert.ok(definition);
      assert.ok(
        Object.values(definition).some(
          (value) =>
            Array.isArray(value) &&
            value.some((entry) => entry?.type === 'input_statement' && entry?.name === 'SUBSTACK'),
        ),
      );
    }
    const stage = vm.runtime.getTargetForStage();
    const definitionEdits = {
      asset: '{"kind":"backdrop","name":"EditedBeach"}',
      actor: '"HeroOther"',
      textStyle: '{"size":48}',
      variable: '7',
      cover: '{"backdrop":"Ocean"}',
      loading: '{"backdrop":"Ocean","costumes":["HeroOther"]}',
      recognition: '{"preview":{"mirroring":"unmirrored"}}',
      control: '{"ArrowRight":"navigation.nextAction"}',
    };
    for (const [opcode, value] of Object.entries(definitionEdits)) {
      assert.ok(definitions.some(({type}) => type === `${helperPrefix}${opcode}`));
      const [id] = blockWith(blocksOf(project), `${helperPrefix}${opcode}`);
      const block = stage.blocks.getBlock(id);
      stage.blocks.changeBlock({
        id: block.inputs.VALUE.block,
        element: 'field',
        name: 'TEXT',
        value,
      });
      if (opcode === 'control') {
        stage.blocks.changeBlock({
          id: block.inputs.NAME.block,
          element: 'field',
          name: 'TEXT',
          value: 'development',
        });
      }
    }
    const [waitId] = blockWith(blocksOf(project), `${runtimePrefix}wait`);
    const wait = stage.blocks.getBlock(waitId);
    stage.blocks.changeBlock({
      id: wait.inputs.SECONDS.block,
      element: 'field',
      name: 'NUM',
      value: '12',
    });
    const transitionMenu = Object.keys(blocksOf(project)).find(
      (id) =>
        blocksOf(project)[id]!.opcode ===
        'kubohiroyakamishibai4_menu_kubohiroyakamishibairuntime4__dsl4TransitionEffect',
    )!;
    stage.blocks.changeBlock({
      id: transitionMenu,
      element: 'field',
      name: 'kubohiroyakamishibairuntime4__dsl4TransitionEffect',
      value: 'fadeUp',
    });
    const saved = JSON.parse(vm.toJSON()) as Project;
    const yaml = parse(extracted(saved));
    assert.equal(yaml.scenes.opening.actions[4].wait, 12);
    assert.equal(yaml.scenes.ending[2].transition.effect, 'fadeUp');
    assert.deepEqual(yaml.assets.Beach, {kind: 'backdrop', name: 'EditedBeach'});
    assert.equal(yaml.actors.Hero, 'HeroOther');
    assert.deepEqual(yaml.textStyles.title, {size: 48});
    assert.equal(yaml.variables.score, 7);
    assert.deepEqual(yaml.cover, {backdrop: 'Ocean'});
    assert.deepEqual(yaml.loading, {backdrop: 'Ocean', costumes: ['HeroOther']});
    assert.deepEqual(yaml.recognition, {preview: {mirroring: 'unmirrored'}});
    assert.deepEqual(yaml.controls, {
      keymaps: {development: {ArrowRight: 'navigation.nextAction'}},
    });
    comparable(extracted(saved));
    assert.equal(
      saved.extensionURLs[dsl4BlockAuthoringExtensionId],
      project.extensionURLs[dsl4BlockAuthoringExtensionId],
    );
    const savedBlocks = blocksOf(saved);
    const moduleBlocks = createDsl4StructuredBlockSourceDeclaration({
      source: {scenes: {shared: [{wait: 1}]}},
      form: 'bundle',
      hatId: 'sharedHat',
      idPrefix: 'shared-',
      label: '共通',
    });
    const [rootId, root] = blockWith(savedBlocks, `${helperPrefix}kamishibai`);
    const previousFirst = root.next!;
    Object.assign(savedBlocks, moduleBlocks, {
      includeShared: {
        opcode: `${helperPrefix}includeBlocks`,
        parent: rootId,
        next: previousFirst,
        inputs: {LABEL: [1, [10, '共通']]},
        fields: {},
        shadow: false,
        topLevel: false,
      },
    });
    root.next = 'includeShared';
    savedBlocks[previousFirst]!.parent = 'includeShared';
    await vm.loadProject(archive(saved));
    const reloaded = vm.runtime.getTargetForStage();
    for (const id of ['sharedHat', 'includeShared']) {
      const block = reloaded.blocks.getBlock(id);
      reloaded.blocks.changeBlock({
        id: block.inputs.LABEL.block,
        element: 'field',
        name: 'TEXT',
        value: '共通更新',
      });
    }
    const [sharedWaitId] = blockWith(moduleBlocks, `${runtimePrefix}wait`);
    reloaded.blocks.changeBlock({
      id: reloaded.blocks.getBlock(sharedWaitId).inputs.SECONDS.block,
      element: 'field',
      name: 'NUM',
      value: '9',
    });
    const savedIncludes = JSON.parse(vm.toJSON()) as Project;
    const sourceSet = extractDsl4BlockSourcesFromProject(savedIncludes);
    const modulePath = parse(sourceSet.sources[sourceSet.entryPath]!).include[0];
    assert.deepEqual(parse(sourceSet.sources[modulePath]!).scenes.shared, [{wait: 9}]);
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'dsl4-vm-includes-'));
    try {
      const input = path.join(temporary, 'edited.sb3');
      await writeFile(input, archive(savedIncludes));
      const exported = await exportDsl4BlockSourcesToYaml({
        input,
        outputDir: temporary,
        name: 'edited',
        sourceFrontend: frontend,
        maxSourceBytes: 1024 * 1024,
      });
      const yamlFiles = unzipSync(await readFile(exported.outputPath));
      assert.deepEqual(parse(strFromU8(yamlFiles[`edited-k4/${modulePath}`]!)).scenes.shared, [
        {wait: 9},
      ]);
    } finally {
      await rm(temporary, {recursive: true, force: true});
    }
  } finally {
    vm.quit();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

test('rejects cycles, broken parents, missing blocks, unknown opcodes and duplicate scenes', () => {
  const mutations: ((blocks: Blocks) => void)[] = [
    (blocks) => {
      blockWith(blocks, `${runtimePrefix}wait`)[1].inputs.SECONDS = [
        3,
        [12, 'score', 'variableId'],
        [4, '0'],
      ];
    },
    (blocks) => {
      const [id, block] = blockWith(blocks, `${runtimePrefix}wait`);
      block.next = id;
    },
    (blocks) => {
      blockWith(blocks, `${runtimePrefix}wait`)[1].parent = 'wrong';
    },
    (blocks) => {
      delete blocks[blockWith(blocks, `${runtimePrefix}wait`)[0]];
    },
    (blocks) => {
      blockWith(blocks, `${runtimePrefix}wait`)[1].opcode = 'unrecognized';
    },
    (blocks) => {
      const [, scene] = blockWith(blocks, `${helperPrefix}scene`);
      setInput(blocks[scene.next!]!, 'SCENE', 'opening');
    },
    (blocks) => {
      setInput(
        blockWith(blocks, `${helperPrefix}actionOptions`)[1],
        'PROPERTIES',
        '{"arguments":{"backdrop":"stale"}}',
      );
    },
    (blocks) => {
      setInput(blockWith(blocks, `${helperPrefix}scene`)[1], 'PROPERTIES', '{"actions":[]}');
    },
  ];
  for (const mutate of mutations) {
    const project = authored();
    mutate(blocksOf(project));
    assert.throws(() => extracted(project));
  }
});

test('unsupported control/actions and declarations retain the exact block ID and target', () => {
  for (const opcode of [
    'control_if',
    'control_if_else',
    'control_repeat',
    'looks_say',
    'unknown_extension',
  ]) {
    const project = authored();
    const [id, block] = blockWith(blocksOf(project), `${runtimePrefix}wait`);
    block.opcode = opcode;
    assert.throws(
      () => extracted(project),
      (error: unknown) => {
        assert.ok(error instanceof Dsl4BlockSourceError);
        assert.equal(error.blockId, id);
        assert.equal(error.targetName, 'Stage');
        assert.equal(error.code, 'K4-BLOCK-SOURCE-GRAPH-001');
        assert.match(error.message, new RegExp(opcode, 'u'));
        return true;
      },
    );
  }
  const project = authored();
  const [id, block] = blockWith(blocksOf(project), `${helperPrefix}scene`);
  block.opcode = 'control_repeat';
  assert.throws(
    () => extracted(project),
    (error: unknown) => {
      assert.ok(error instanceof Dsl4BlockSourceError);
      assert.equal(error.blockId, id);
      assert.equal(error.targetName, 'Stage');
      return true;
    },
  );
});

test('rejects invalid edits during YAML export and leaves no plausible output', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsl4-block-invalid-'));
  try {
    for (const [index, value] of ['-1', 'not a number'].entries()) {
      const project = authored();
      setInput(blockWith(blocksOf(project), `${runtimePrefix}wait`)[1], 'SECONDS', value);
      const input = path.join(directory, `invalid${index}.sb3`);
      await writeFile(input, archive(project));
      await assert.rejects(
        exportDsl4BlockSourcesToYaml({
          input,
          outputDir: directory,
          name: `invalid${index}`,
          sourceFrontend: frontend,
          maxSourceBytes: 1024 * 1024,
        }),
      );
      await assert.rejects(readFile(path.join(directory, `invalid${index}.k4.yml`)), {
        code: 'ENOENT',
      });
    }
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('validates definition attributes and asset references before writing exported YAML', async () => {
  const fixture = await readFile(
    new URL('fixtures/dsl4/valid/comprehensive.kamishibai.yaml', import.meta.url),
    'utf8',
  );
  const invalid = {
    asset: '{"kind":"unknown"}',
    actor: '"MissingSkin"',
    textStyle: '{"size":0}',
    variable: 'null',
    cover: '{"backdrop":"MissingBackdrop"}',
    loading: '{"backdrop":"Beach","costumes":[]}',
    recognition: '{"preview":{"mirroring":"invalid"}}',
    control: '{"UnknownKey":"navigation.nextAction"}',
  };
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsl4-definition-invalid-'));
  try {
    for (const [opcode, value] of Object.entries(invalid)) {
      const project = authored(fixture);
      const [, block] = blockWith(blocksOf(project), `${helperPrefix}${opcode}`);
      setInput(block, 'VALUE', value);
      const input = path.join(directory, `${opcode}.sb3`);
      await writeFile(input, archive(project));
      await assert.rejects(
        exportDsl4BlockSourcesToYaml({
          input,
          outputDir: directory,
          name: opcode,
          sourceFrontend: frontend,
          maxSourceBytes: 1024 * 1024,
        }),
      );
      await assert.rejects(readFile(path.join(directory, `${opcode}.k4.yml`)), {code: 'ENOENT'});
    }
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('retains viewport configuration through structured block authoring and extraction', () => {
  const viewport = {width: 360, height: 640, orientation: 'portrait', fit: 'cover'};
  for (const form of ['runtime', 'bundle'] as const) {
    const blocks = createDsl4StructuredBlockSourceDeclaration({
      source: {kamishibai: '4.0', viewport, scenes: {opening: [{wait: 1}]}},
      form,
      hatId: 'hat',
    });
    const decoded = parse(
      extractDsl4BlockSourcesFromProject({targets: [{isStage: true, name: 'Stage', blocks}]})
        .sources['Stage.k4.yml']!,
    );
    assert.deepEqual(decoded.viewport, viewport);
  }
});

test('uses simple speech only when the base runtime advertises support, otherwise keeps SPEC', () => {
  const sourceText =
    "kamishibai: '4.0'\nactors:\n  Hero: Skin\nassets:\n  Skin: costume:Hero\nscenes:\n  opening:\n    - Hero.say: {text: abc, seconds: 10}\n    - Hero.think: {text: def, seconds: 0}\n";
  for (const capable of [false, true]) {
    const runtime = `${capable ? '// Kamishibai capabilities: simple-speech-v1\n' : ''}Scratch.extensions.register({getInfo(){return {id:'kubohiroyakamishibai4',blocks:[]};}});`;
    const project = authored(sourceText, runtime);
    for (const command of ['say', 'think']) {
      const [, block] = blockWith(
        blocksOf(project),
        `${runtimePrefix}${command}${capable ? 'Text' : ''}`,
      );
      assert.equal(Object.hasOwn(block.inputs, 'SPEC'), !capable);
    }
    assert.equal(comparable(extracted(project)), comparable(sourceText));
  }
});
