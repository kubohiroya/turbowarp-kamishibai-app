import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test} from 'vitest';

import {createDsl4AssetDependencyIndex} from '../src/dsl4/asset-dependency-index.js';
import {dsl4TestProjectRoot, dsl4TestSourceFrontend} from './helpers/dsl4-test-frontend.ts';
import {requireDefined} from './helpers/require-value.ts';

const projectRoot = dsl4TestProjectRoot;
const frontend = dsl4TestSourceFrontend;

function parse(source: string) {
  const result = frontend.parse(source, {sourceId: 'asset-index-test'});
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.storyDocument;
}

test('indexes every direct dependency in the comprehensive DSL 4.0 fixture', async () => {
  const source = await readFile(
    path.join(projectRoot, 'test', 'fixtures', 'dsl4', 'valid', 'comprehensive.kamishibai.yaml'),
    'utf8',
  );
  const index = createDsl4AssetDependencyIndex(parse(source));

  assert.deepEqual(index.startup, [
    'Beach',
    'CaptionIdle',
    'ClockTicking',
    'HeroHappy',
    'HeroHelp',
    'HeroIdle',
    'Loading1',
    'Loading2',
    'LoadingBackground',
    'Success',
  ]);
  assert.deepEqual(index.cover, ['Beach', 'OpeningSound']);
  assert.deepEqual(index.actors, ['CaptionIdle', 'HeroIdle']);
  assert.deepEqual(index.loading, ['Loading1', 'Loading2', 'LoadingBackground']);
  assert.deepEqual(index.recognition, ['ClockTicking', 'Success']);
  assert.deepEqual(index.posePreviewControls, []);
  assert.deepEqual(index.bgm, ['OpeningSound']);
  assert.deepEqual(index.sceneRetained, ['救助Pose']);
  assert.deepEqual(index.scenes, {
    opening: {
      all: ['Beach', 'HeroHappy', 'OpeningSound'],
      eager: ['Beach', 'HeroHappy'],
      lazy: ['OpeningSound'],
      sceneRetained: [],
    },
    rescue: {
      all: ['ClockTicking', 'HeroHappy', 'HeroHelp', 'Ocean', 'Success', '救助Pose'],
      eager: ['ClockTicking', 'HeroHappy', 'HeroHelp', 'Success'],
      lazy: ['Ocean', '救助Pose'],
      sceneRetained: ['救助Pose'],
    },
    seaRoute: {
      all: ['救助Pose'],
      eager: [],
      lazy: ['救助Pose'],
      sceneRetained: ['救助Pose'],
    },
    ending: {all: ['Beach'], eager: ['Beach'], lazy: [], sceneRetained: []},
  });
});

test('indexes eager camera preview control images as startup-only app-shell dependencies', () => {
  const storyDocument = parse(`
kamishibai: '4.0'
assets:
  Tick: sound
  Charge: sound
  ShowMirrored:
    kind: image
    file: ui/show-mirrored.svg
  ShowUnmirrored:
    kind: image
    file: ui/show-unmirrored.svg
  CameraMenu:
    kind: image
    file: ui/camera.svg
recognition:
  idleSound: Tick
  chargeSound: Charge
  preview:
    mirroring: mirrored
    controls:
      mirroring:
        position: top-center
        assets:
          showMirrored: ShowMirrored
          showUnmirrored: ShowUnmirrored
      cameraMenu:
        position: bottom-center
        buttonAsset: CameraMenu
scenes:
  first: []
`);
  const index = createDsl4AssetDependencyIndex(storyDocument);
  assert.deepEqual(index.posePreviewControls, ['CameraMenu', 'ShowMirrored', 'ShowUnmirrored']);
  assert.ok(index.startup.includes('CameraMenu'));
  assert.ok(index.startup.includes('ShowMirrored'));
  assert.ok(index.startup.includes('ShowUnmirrored'));
  assert.deepEqual(requireDefined(index.scenes.first, 'the first scene').all, []);
});

test('forces lazy loading UI assets into startup without preloading unrelated lazy assets', () => {
  const storyDocument = parse(`
kamishibai: '4.0'
assets:
  LoadingBackdrop:
    kind: backdrop
    name: LoadingBackdrop
    loading: lazy
  LoadingCostume:
    kind: costume
    target: Loading
    name: LoadingCostume
    loading: lazy
  CoverBackdrop:
    kind: backdrop
    name: CoverBackdrop
    loading: lazy
  HeroInitial:
    kind: costume
    target: Hero
    name: HeroInitial
    loading: lazy
  SceneBackdrop:
    kind: backdrop
    name: SceneBackdrop
    loading: lazy
  Unused:
    kind: sound
    name: Unused
    loading: lazy
actors:
  Hero: HeroInitial
cover:
  backdrop: CoverBackdrop
loading:
  backdrop: LoadingBackdrop
  costumes: [LoadingCostume]
scenes:
  first:
    - stage: SceneBackdrop
`);
  const index = createDsl4AssetDependencyIndex(storyDocument);

  assert.deepEqual(index.startup, ['LoadingBackdrop', 'LoadingCostume']);
  assert.deepEqual(index.cover, ['CoverBackdrop']);
  assert.deepEqual(index.actors, ['HeroInitial']);
  assert.deepEqual(index.loading, ['LoadingBackdrop', 'LoadingCostume']);
  assert.deepEqual(index.sceneRetained, []);
  assert.deepEqual(index.scenes.first, {
    all: ['SceneBackdrop'],
    eager: [],
    lazy: ['SceneBackdrop'],
    sceneRetained: [],
  });
  assert.equal(index.startup.includes('Unused'), false);
});

test('deduplicates and stably sorts scene dependencies', () => {
  const storyDocument = parse(`
kamishibai: '4.0'
assets:
  Zed: sound
  Alpha: sound
scenes:
  first:
    - sound: Zed
    - bgm: Alpha
    - sound: Zed
`);
  const index = createDsl4AssetDependencyIndex(storyDocument);

  assert.deepEqual(index.scenes.first, {
    all: ['Alpha', 'Zed'],
    eager: ['Alpha', 'Zed'],
    lazy: [],
    sceneRetained: [],
  });
});

test('indexes lazy start and character sounds for say and think in their owning scene', () => {
  const storyDocument = parse(`
kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
  TalkTick:
    kind: sound
    name: TalkTick
    loading: lazy
  HeroVoice:
    kind: sound
    name: HeroVoice
    loading: lazy
actors:
  Hero: HeroIdle
scenes:
  first:
    - Hero.say:
        text: hello
        waitFor: advance
        characterIntervalSeconds: 0.1
        startSound: HeroVoice
        characterSound: TalkTick
    - Hero.think:
        text: hmm
        seconds: 1
        startSound: HeroVoice
        characterIntervalSeconds: 0.2
        characterSound: TalkTick
`);
  const index = createDsl4AssetDependencyIndex(storyDocument);

  assert.deepEqual(index.scenes.first, {
    all: ['HeroVoice', 'TalkTick'],
    eager: [],
    lazy: ['HeroVoice', 'TalkTick'],
    sceneRetained: [],
  });
});

test('indexes the effective lazy character sound after composing bubble styles', () => {
  const storyDocument = parse(`
kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
  TalkTick:
    kind: sound
    name: TalkTick
    loading: lazy
  OldTick:
    kind: sound
    name: OldTick
    loading: lazy
  ActionTick:
    kind: sound
    name: ActionTick
    loading: lazy
actors:
  Hero: HeroIdle
bubbleStyles:
  old:
    characterSound: OldTick
  novel:
    characterIntervalSeconds: 0.1
    characterSound: TalkTick
    noSoundCharacters: "「」"
  hero:
    styles:
      - old
      - novel
scenes:
  first:
    - Hero.say:
        text: hello
        waitFor: advance
        styles:
          - hero
  second:
    - Hero.say:
        text: override
        waitFor: advance
        styles:
          - hero
        characterSound: ActionTick
`);
  const index = createDsl4AssetDependencyIndex(storyDocument);

  assert.deepEqual(index.scenes.first, {
    all: ['TalkTick'],
    eager: [],
    lazy: ['TalkTick'],
    sceneRetained: [],
  });
  assert.deepEqual(index.scenes.second, {
    all: ['ActionTick'],
    eager: [],
    lazy: ['ActionTick'],
    sceneRetained: [],
  });
});

test('indexes every lazy frame of a referenced bubble advance indicator', () => {
  const storyDocument = parse(`
kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
  Next1:
    kind: image
    file: ui/next-1.png
    loading: lazy
  Next2:
    kind: image
    file: ui/next-2.png
    loading: lazy
actors:
  Hero: HeroIdle
bubbleStyles:
  novel:
    characterIntervalSeconds: 0.1
    continueIndicator:
      frames: [Next1, Next2]
      frameIntervalSeconds: 0.12
scenes:
  first:
    - Hero.say:
        text: hello
        waitFor: advance
        styles:
          - novel
  second:
    - wait: 0
`);
  const index = createDsl4AssetDependencyIndex(storyDocument);

  assert.deepEqual(index.scenes.first, {
    all: ['Next1', 'Next2'],
    eager: [],
    lazy: ['Next1', 'Next2'],
    sceneRetained: [],
  });
  assert.deepEqual(requireDefined(index.scenes.second, 'the second scene').all, []);
});

test('indexes Bubble portrait lip-sync plus native reveal and audio assets', () => {
  const storyDocument = parse(`
kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
  Face: {kind: image, file: face.png, loading: lazy}
  Lip: {kind: image, file: lip.png, loading: lazy}
  Voice: {kind: sound, name: Voice, loading: lazy}
  Tick: {kind: sound, name: Tick, loading: lazy}
  Finish: {kind: sound, name: Finish, loading: lazy}
actors: {Hero: HeroIdle}
bubbleStyles:
  novel:
    portrait:
      base: Face
      lipSync: {frames: [Lip], frameIntervalSeconds: 0.1}
    reveal: {unit: CHARACTER, intervalSeconds: 0.05, sound: Tick}
    audio: {voice: Voice, reveal: Tick, finish: Finish}
scenes:
  first:
    - Hero.say: {text: hello, seconds: 1, styles: [novel]}
`);
  const index = createDsl4AssetDependencyIndex(storyDocument);

  assert.deepEqual(index.scenes.first, {
    all: ['Face', 'Finish', 'Lip', 'Tick', 'Voice'],
    eager: [],
    lazy: ['Face', 'Finish', 'Lip', 'Tick', 'Voice'],
    sceneRetained: [],
  });
});

test('returns a deeply immutable index and rejects non-StoryDocument input', () => {
  const index = createDsl4AssetDependencyIndex(
    parse(`
kamishibai: '4.0'
scenes:
  first: []
`),
  );
  assert.equal(Object.isFrozen(index), true);
  assert.equal(Object.isFrozen(index.startup), true);
  assert.equal(Object.isFrozen(index.scenes), true);
  assert.equal(Object.isFrozen(index.scenes.first), true);
  assert.equal(Object.isFrozen(requireDefined(index.scenes.first, 'the first scene').lazy), true);
  assert.equal(Object.isFrozen(index.loading), true);
  assert.equal(Object.isFrozen(index.sceneRetained), true);
  assert.equal(Object.isFrozen(index.bgm), true);
  assert.throws(
    () => createDsl4AssetDependencyIndex({kind: 'StoryDocument', version: '3.2'}),
    /StoryDocument version 4\.0/u,
  );
});
