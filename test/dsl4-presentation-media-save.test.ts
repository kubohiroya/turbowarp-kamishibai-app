import assert from 'node:assert/strict';
import {test, vi} from 'vitest';
import type {
  AssetManagerAudioPlayback,
  AssetManagerAudioPlayOptions,
} from '@kubohiroya/turbowarp-asset-cache/composition';
import {createDsl4AudioActionPort} from '../src/dsl4/platform/audio-action-port.js';
import {createDsl4MediaActionPort} from '../src/dsl4/platform/media-action-port.js';
import {
  createDsl4PresentationMediaSave,
  validateDsl4MediaRestoreSupport,
} from '../src/dsl4/platform/presentation-media-save.js';
import {createDsl4PresentationSavePort} from '../src/dsl4/platform/presentation-save-port.js';
import {createDsl4SvgTextPlatform} from '../src/dsl4/platform/svg-text-action-port.js';
import {createDsl4TurboWarpCrossfadePlatform} from '../src/dsl4/platform/turbowarp-crossfade-platform.js';
import {createTestTurboWarpRuntimeHost} from './helpers/turbowarp-runtime-host.ts';

function context() {
  return {signal: new AbortController().signal, sceneId: 'opening'};
}

function voices() {
  const created: {assetId: unknown; options: unknown; stopped: boolean}[] = [];
  return {
    created,
    async createAudioVoice(assetId: unknown, options: unknown) {
      const record = {assetId, options, stopped: false};
      created.push(record);
      return {
        ended: new Promise<void>(() => {}),
        setGain() {},
        stop() {
          record.stopped = true;
        },
      };
    },
  };
}

function bgmPlatform(factory = voices()) {
  return createDsl4TurboWarpCrossfadePlatform({
    runtimeHost: createTestTurboWarpRuntimeHost({renderer: {}}),
    createAudioVoice: factory.createAudioVoice,
  });
}

test('BGM is saved as its asset and the volume it is heading for', async () => {
  const platform = bgmPlatform();
  assert.equal(platform.captureBgm(), null);
  await platform.replaceBgm('Opening', {effect: 'cut'}, {volume: 40});
  assert.deepEqual(platform.captureBgm(), {asset: 'Opening', volume: 40});
  const fading = platform.setBgmVolume({volume: 70, seconds: 1});
  assert.deepEqual(platform.captureBgm(), {asset: 'Opening', volume: 70});
  platform.finishAll();
  await fading.catch(() => {});
  platform.dispose();
});

test('restoring BGM stops the voice that plays now and starts the saved one over', async () => {
  const factory = voices();
  const platform = bgmPlatform(factory);
  await platform.replaceBgm('Opening', {effect: 'cut'});
  await platform.restoreBgm({asset: 'Theme', volume: 50});
  assert.equal(factory.created[0]!.stopped, true);
  assert.deepEqual(factory.created[1]!.options, {gain: 0.5});
  assert.deepEqual(platform.captureBgm(), {asset: 'Theme', volume: 50});
  // A save without BGM silences the crossfade voice instead of leaving it playing.
  await platform.restoreBgm(null);
  assert.equal(factory.created[1]!.stopped, true);
  assert.equal(platform.captureBgm(), null);
  platform.dispose();
});

function playback() {
  const instance = {
    currentTime: 0,
    paused: true as boolean,
    loop: false as boolean,
    gain: 1,
    muted: false as boolean,
    playbackRate: 1,
    ended: new Promise<void>(() => {}),
    play: vi.fn(async (options: AssetManagerAudioPlayOptions = {}) => {
      if (options.restart) instance.currentTime = 0;
      instance.loop = options.loop ?? false;
      instance.paused = false;
    }),
    pause: vi.fn(() => {
      instance.paused = true;
    }),
    stop: vi.fn(() => {
      instance.paused = true;
    }),
    seek: vi.fn(async (time: number) => {
      instance.currentTime = time;
    }),
    setGain: vi.fn((gain: number) => {
      instance.gain = gain;
    }),
    setMuted: vi.fn((muted: boolean) => {
      instance.muted = muted;
    }),
    setPlaybackRate: vi.fn((rate: number) => {
      instance.playbackRate = rate;
    }),
    dispose: vi.fn(),
  } satisfies AssetManagerAudioPlayback;
  return instance;
}

function audioPort() {
  const made: ReturnType<typeof playback>[] = [];
  const port = createDsl4AudioActionPort({
    async createAudioPlayback(_source, settings) {
      const instance = playback();
      instance.gain = settings.gain ?? 1;
      instance.muted = settings.muted ?? false;
      instance.playbackRate = settings.playbackRate ?? 1;
      made.push(instance);
      return instance;
    },
    getAssetResource: (id) => (id === 'Rain' || id === 'Bell' ? {kind: 'sound'} : null),
  });
  return {port, made};
}

test('scene audio is saved with its position and resumes only what was playing', async () => {
  const first = audioPort();
  await first.port.audio({id: 'rain', asset: 'Rain', volume: 30}, context());
  await first.port.audioControl({id: 'rain', operation: 'loop'}, context());
  first.made[0]!.currentTime = 12;
  await first.port.audio({id: 'bell', asset: 'Bell'}, context());
  const saved = first.port.captureState();
  assert.deepEqual(saved, [
    {
      id: 'rain',
      asset: 'Rain',
      time: 12,
      paused: false,
      loop: true,
      volume: 30,
      muted: false,
      rate: 1,
    },
    {
      id: 'bell',
      asset: 'Bell',
      time: 0,
      paused: true,
      loop: false,
      volume: 100,
      muted: false,
      rate: 1,
    },
  ]);

  const second = audioPort();
  const prepared = await second.port.prepareRestoreState(saved);
  assert.equal(second.made[0]!.seek.mock.calls[0]![0], 12);
  assert.deepEqual(second.port.captureState(), [], 'nothing changes before start');
  prepared.start();
  await Promise.resolve();
  assert.deepEqual(second.made[0]!.play.mock.calls[0]![0], {
    restart: false,
    loop: true,
    signal: expectSignal(second.made[0]!.play.mock.calls[0]![0]),
  });
  assert.equal(second.made[1]!.play.mock.calls.length, 0);
  assert.deepEqual(second.port.captureState(), saved);
  first.port.dispose();
  second.port.dispose();
});

function expectSignal(options: AssetManagerAudioPlayOptions | undefined) {
  assert.ok(options?.signal instanceof AbortSignal);
  return options.signal;
}

test('an audio save whose asset is not prepared is refused before any playback is made', async () => {
  const {port, made} = audioPort();
  await assert.rejects(
    port.prepareRestoreState([
      {
        id: 'x',
        asset: 'Missing',
        time: 0,
        paused: true,
        loop: false,
        volume: 100,
        muted: false,
        rate: 1,
      },
    ]),
    /not prepared/,
  );
  assert.equal(made.length, 0);
  port.dispose();
});

function mediaPort(applied: string[]) {
  const timers = new Set<unknown>();
  const assets = new Map([
    ['HeroIdle', 'image/png'],
    ['HeroRun', 'image/png'],
  ]);
  const port = createDsl4MediaActionPort({
    composition: {
      isRegistered: (name: string) => assets.has(name),
      getMimeType: (name: string) => assets.get(name) ?? '',
      async applyToStage() {},
      async applyToTarget(name: string) {
        applied.push(name);
      },
      async playSound() {},
      async stopSound() {},
    },
    resolveActor: () => ({id: 'hero', isStage: false}),
    scheduler: {
      setTimeout() {
        const handle = {};
        timers.add(handle);
        return handle;
      },
      clearTimeout(handle: unknown) {
        timers.delete(handle);
      },
    },
  });
  return {port, timers};
}

test('a costume loop is saved as its steps and restarts from its first step', async () => {
  const steps = [
    {skin: 'HeroRun', seconds: 1},
    {skin: 'HeroIdle', seconds: 1},
  ];
  const first = mediaPort([]);
  await first.port.loop({target: 'Hero', steps}, context());
  const saved = first.port.captureLoops();
  assert.deepEqual(saved, {Hero: steps});

  const applied: string[] = [];
  const second = mediaPort(applied);
  await second.port.restoreLoops(saved);
  assert.deepEqual(applied, ['HeroRun']);
  assert.equal(second.timers.size, 1);
  assert.deepEqual(second.port.captureLoops(), saved);
  await second.port.stopAllLoops();
  assert.deepEqual(second.port.captureLoops(), {});
  await first.port.dispose();
  await second.port.dispose();
});

function textPlatform() {
  const skins: string[] = [];
  const platform = createDsl4SvgTextPlatform({
    enabled: true,
    storyDocument: {kind: 'StoryDocument', version: '4.0', textStyles: {title: {size: 24}}},
    resolveActor: () => ({id: 'caption', isStage: false, drawableID: 3}),
    runtime: {
      renderer: {
        createSVGSkin(svg: string) {
          skins.push(svg);
          return skins.length;
        },
        destroySkin() {},
        getNativeSize: () => [480, 360],
        updateDrawableSkinId() {},
      },
      requestRedraw() {},
    },
  });
  return {platform, skins};
}

test('text on an actor is saved with its style, forgotten when a skin covers it, and drawn again', async () => {
  const first = textPlatform();
  const setText = (first.platform.port as {setText(p: unknown, c: unknown): Promise<void>}).setText;
  await setText({target: 'Caption', text: 'hello', style: 'title'}, context());
  const saved = first.platform.captureTexts() as Record<string, {style: string}>;
  assert.deepEqual(Object.keys(saved), ['Caption']);
  assert.equal(saved.Caption!.style, 'title');

  const second = textPlatform();
  second.platform.validateTexts(saved);
  await second.platform.restoreTexts(saved);
  assert.equal(second.skins.length, 1);
  assert.match(second.skins[0]!, /hello/);
  assert.deepEqual(second.platform.captureTexts(), saved);

  first.platform.forgetText('Caption');
  assert.deepEqual(first.platform.captureTexts(), {});
  // The forgotten actor shows a skin now, so restoring a save without it releases the text.
  first.platform.releaseTextsExcept({});
  assert.throws(() => first.platform.releaseTarget('Caption'), /not owned/);
  await first.platform.releaseAll();
  await second.platform.releaseAll();
});

test('restore draws text inside the commit and starts media only after the old media stopped', async () => {
  const calls: string[] = [];
  const port = createDsl4PresentationSavePort({
    targets: () => [],
    video: () => null,
    finalizePrevious: () => void calls.push('finalizePrevious'),
    media: {
      capture: () => ({}),
      async prepare() {
        calls.push('prepare');
        return {
          beforeTargets: () => void calls.push('beforeTargets'),
          afterTargets: async () => void calls.push('afterTargets'),
          revert: async () => void calls.push('revert'),
          start: async () => void calls.push('start'),
          dispose: () => void calls.push('dispose'),
        };
      },
    },
  });
  const restored = await port.prepareRestorePresentation({targets: [], videos: [], media: {}}, {});
  await restored.commit();
  await restored.finalize();
  assert.deepEqual(calls, [
    'prepare',
    'beforeTargets',
    'afterTargets',
    'finalizePrevious',
    'start',
  ]);

  calls.length = 0;
  const failed = await port.prepareRestorePresentation({targets: [], videos: [], media: {}}, {});
  await failed.commit();
  await failed.rollback();
  assert.deepEqual(calls, ['prepare', 'beforeTargets', 'afterTargets', 'revert', 'dispose']);
});

test('the combined media save captures every part and refuses unknown or unavailable state', async () => {
  const media = createDsl4PresentationMediaSave({});
  assert.deepEqual(media.capture(), {bgm: null, audio: [], texts: {}, loops: {}});
  await media.prepare({bgm: null, audio: [], texts: {}, loops: {}});
  await assert.rejects(media.prepare({extra: 1}), /Unknown saved media fields/);
  await assert.rejects(
    media.prepare({bgm: {asset: 'Theme', volume: 50}}),
    /BGM restore is unavailable/,
  );
  await assert.rejects(
    createDsl4PresentationMediaSave({bgm: bgmPlatform()}).prepare({
      bgm: {asset: 'Theme', volume: 150},
    }),
    /volume from 0 to 100/,
  );
});

test('a host restores BGM, audio, text, loops and pose sounds but still refuses messages and custom actions', () => {
  const actions = ['bgm', 'audio', 'audioControl', 'setText', 'loop', 'pose'].map((command) => ({
    command,
  }));
  validateDsl4MediaRestoreSupport(actions, {bgm: true});
  assert.throws(
    () => validateDsl4MediaRestoreSupport([{command: 'bgm'}], {bgm: false}),
    /restore handler: bgm/,
  );
  assert.throws(
    () => validateDsl4MediaRestoreSupport([{command: 'broadcastMessageAndWait'}], {bgm: true}),
    /restore handler: broadcastMessageAndWait/,
  );
  assert.throws(
    () => validateDsl4MediaRestoreSupport([{command: 'say', handler: 'custom'}], {bgm: true}),
    /restore handler/,
  );
});
