import assert from 'node:assert/strict';
import {test} from 'vitest';

import {
  dsl4NoPlaybackFeatures,
  resolveDsl4PlaybackFeatures,
  type Dsl4PlaybackFeatures,
} from '../src/dsl4/playback-features.js';
import {createDsl4AudioMixer} from '../src/dsl4/platform/audio-mixer.js';
import {
  createDsl4PlaybackPreferences,
  dsl4PlaybackPreferencesStorageKey,
} from '../src/dsl4/platform/playback-preferences.js';
import {createDsl4PlaybackSettings} from '../src/dsl4/platform/playback-settings.js';
import {createDsl4RuntimeTitleControls} from '../src/dsl4/platform/runtime-title-controls.js';
import {
  createFakeDocument,
  findByAttribute,
  requireByAttribute,
  type FakeElement,
} from './helpers/fake-dom.ts';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    },
  };
}

const allFeatures: Dsl4PlaybackFeatures = Object.freeze({
  bgm: true,
  effects: true,
  skip: true,
  skipDefault: false,
  recognition: true,
});

test('features show only the settings a story uses, including nested actions', () => {
  assert.deepEqual(resolveDsl4PlaybackFeatures({scenes: []}), dsl4NoPlaybackFeatures);
  assert.deepEqual(resolveDsl4PlaybackFeatures(null), dsl4NoPlaybackFeatures);
  const story = {
    recognition: {navigation: {allowSkip: true}},
    scenes: [
      {
        id: 'opening',
        actions: [
          {command: 'bgm', args: {sound: 'Theme'}},
          {
            command: 'if',
            args: {then: [{command: 'sound', args: {sound: 'Ding'}}]},
          },
        ],
      },
    ],
  };
  assert.deepEqual(resolveDsl4PlaybackFeatures(story), {
    bgm: true,
    effects: true,
    skip: false,
    skipDefault: true,
    recognition: false,
  });
  assert.deepEqual(
    resolveDsl4PlaybackFeatures({
      scenes: [{actions: [{command: 'imageInputToChangeScene'}]}],
    }),
    {bgm: false, effects: false, skip: false, skipDefault: false, recognition: true},
  );
});

test('audio preferences persist per device while the skip choice stays in the session', () => {
  const storage = memoryStorage();
  const preferences = createDsl4PlaybackPreferences({globalObject: storage});
  let notified = 0;
  const unsubscribe = preferences.subscribe(() => notified++);
  assert.equal(preferences.getChannelFactor('bgm'), 1);
  preferences.setChannel('bgm', {volume: 40});
  preferences.setChannel('effects', {enabled: false});
  preferences.setSkipOverride(true);
  assert.equal(preferences.getChannelFactor('bgm'), 0.4);
  assert.equal(preferences.getChannelFactor('effects'), 0);
  assert.equal(notified, 3);
  preferences.setChannel('bgm', {volume: 40});
  assert.equal(notified, 3, 'an unchanged value does not notify');
  unsubscribe();

  const reloaded = createDsl4PlaybackPreferences({globalObject: storage});
  assert.deepEqual(reloaded.getSnapshot(), {
    bgm: {enabled: true, volume: 40},
    effects: {enabled: false, volume: 100},
    skipOverride: null,
  });
  assert.throws(() => preferences.setChannel('bgm', {volume: 101}), /0 to 100/u);
  assert.throws(() => preferences.setChannel('voice' as 'bgm', {}), /bgm or effects/u);
  assert.throws(() => preferences.setSkipOverride('yes' as unknown as boolean), /skip override/u);
});

test('damaged or refused storage falls back to full volume instead of muting', () => {
  const damaged = memoryStorage({
    [dsl4PlaybackPreferencesStorageKey]: JSON.stringify({bgm: {enabled: 'no', volume: 900}}),
  });
  assert.deepEqual(createDsl4PlaybackPreferences({globalObject: damaged}).getSnapshot().bgm, {
    enabled: true,
    volume: 100,
  });
  const refused = createDsl4PlaybackPreferences({
    globalObject: {
      get localStorage(): Storage {
        throw new Error('blocked');
      },
    },
  });
  refused.setChannel('effects', {volume: 20});
  assert.equal(refused.getChannelFactor('effects'), 0.2);
});

function fakePlayback(gain: number) {
  let resolveEnded!: () => void;
  const ended = new Promise<void>((resolve) => {
    resolveEnded = resolve;
  });
  const calls: string[] = [];
  const playback = {
    ended,
    currentTime: 0,
    paused: true,
    loop: false,
    gain,
    muted: false,
    playbackRate: 1,
    async play(options?: {gain?: number}) {
      calls.push(`play:${options?.gain ?? '-'}`);
    },
    pause() {},
    stop() {},
    async seek() {},
    setGain(value: number) {
      playback.gain = value;
      calls.push(`gain:${value}`);
    },
    setMuted() {},
    setPlaybackRate() {},
    dispose() {
      calls.push('dispose');
    },
  };
  return {playback, calls, end: resolveEnded};
}

test('the mixer scales authored gains and applies slider changes to live playbacks', async () => {
  const preferences = createDsl4PlaybackPreferences();
  const mixer = createDsl4AudioMixer(preferences);
  preferences.setChannel('effects', {volume: 50});
  const created: {gain?: number}[] = [];
  let latest = fakePlayback(0);
  const create = mixer.playbackFactory('effects', async (_source, options) => {
    created.push({...(options?.gain === undefined ? {} : {gain: options.gain})});
    latest = fakePlayback(options?.gain ?? 1);
    return latest.playback;
  });
  const playback = await create({asset: 'Ding'}, {gain: 0.8});
  assert.deepEqual(created, [{gain: 0.4}]);
  assert.equal(playback.gain, 0.8, 'the story still reads the gain it authored');
  await playback.play({gain: 0.6});
  playback.setGain(1);
  preferences.setChannel('effects', {volume: 25});
  preferences.setChannel('effects', {enabled: false});
  assert.deepEqual(latest.calls, ['play:0.3', 'gain:0.5', 'gain:0.25', 'gain:0']);
  assert.equal(mixer.liveCount('effects'), 1);
  playback.dispose();
  assert.equal(mixer.liveCount('effects'), 0);
  preferences.setChannel('effects', {enabled: true});
  assert.deepEqual(latest.calls.at(-1), 'dispose', 'a disposed playback is left alone');

  const voiceGains: number[] = [];
  let endVoice!: () => void;
  const voiceFactory = mixer.voiceFactory('bgm', (_assetId, options) => {
    voiceGains.push(options.gain);
    return {
      ended: new Promise<void>((resolve) => {
        endVoice = resolve;
      }),
      setGain: (gain: number) => voiceGains.push(gain),
      stop() {},
    };
  });
  preferences.setChannel('bgm', {volume: 50});
  const voice = voiceFactory('Theme', {gain: 1}) as {setGain(gain: number): unknown};
  voice.setGain(0.5);
  preferences.setChannel('bgm', {volume: 100});
  assert.deepEqual(voiceGains, [0.5, 0.25, 0.5]);
  endVoice();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(mixer.liveCount('bgm'), 0, 'an ended voice stops following the slider');
  mixer.dispose();
});

function mountSettings(options: {canOpenCamera?: boolean; onOpenRecognition?: boolean} = {}) {
  const document = createFakeDocument();
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const preferences = createDsl4PlaybackPreferences();
  const calls: string[] = [];
  const settings = createDsl4PlaybackSettings({
    document,
    mount,
    preferences,
    onClose: (context) => calls.push(`close:${context}`),
    onOpenCamera: () => calls.push('camera'),
    canOpenCamera: () => options.canOpenCamera ?? true,
    ...(options.onOpenRecognition === false
      ? {}
      : {onOpenRecognition: () => calls.push('recognition')}),
  });
  const root = settings.element as unknown as FakeElement;
  return {document, mount, preferences, settings, root, calls};
}

function section(root: FakeElement, name: string) {
  return requireByAttribute(root, 'data-dsl4-settings-section', name);
}

test('the settings screen shows only what the story can use', () => {
  const {settings, root} = mountSettings();
  settings.show({features: {...dsl4NoPlaybackFeatures, bgm: true}, locale: 'ja', context: 'title'});
  assert.equal(section(root, 'audio').hidden, false);
  assert.equal(requireByAttribute(root, 'data-dsl4-settings-channel-row', 'bgm').hidden, false);
  assert.equal(requireByAttribute(root, 'data-dsl4-settings-channel-row', 'effects').hidden, true);
  assert.equal(section(root, 'progress').hidden, true);
  assert.equal(section(root, 'recognition').hidden, true);
  assert.equal(requireByAttribute(root, 'data-dsl4-settings-empty', 'true').hidden, true);
  assert.equal(requireByAttribute(root, 'data-dsl4-settings-paused', 'true').hidden, true);
  assert.equal(requireByAttribute(root, 'data-dsl4-settings-done', 'true').textContent, '閉じる');

  settings.show({features: dsl4NoPlaybackFeatures, locale: 'en', context: 'title'});
  assert.equal(requireByAttribute(root, 'data-dsl4-settings-empty', 'true').hidden, false);
  assert.equal(section(root, 'audio').hidden, true);
});

test('skip follows the story until the person overrides it, and can return to the story', () => {
  const {settings, root, preferences} = mountSettings();
  settings.show({features: {...allFeatures, skipDefault: true}, locale: 'en', context: 'title'});
  const skip = requireByAttribute(root, 'data-dsl4-settings-skip', 'true') as FakeElement & {
    checked: boolean;
  };
  const reset = requireByAttribute(root, 'data-dsl4-settings-skip-reset', 'true');
  assert.equal(skip.checked, true, 'the story default is shown');
  assert.equal(reset.hidden, true);
  skip.checked = false;
  skip.dispatch('change');
  assert.equal(preferences.getSkipOverride(), false);
  assert.equal(reset.hidden, false);
  reset.click();
  assert.equal(preferences.getSkipOverride(), null);
  assert.equal(skip.checked, true);
});

test('BGM and sound effects switch and change volume independently', () => {
  const {settings, root, preferences} = mountSettings();
  settings.show({features: allFeatures, locale: 'en', context: 'playback'});
  const bgmVolume = requireByAttribute(root, 'data-dsl4-settings-volume', 'bgm');
  const effectsToggle = requireByAttribute(
    root,
    'data-dsl4-settings-channel',
    'effects',
  ) as FakeElement & {
    checked: boolean;
  };
  bgmVolume.value = '35';
  bgmVolume.dispatch('input');
  effectsToggle.checked = false;
  effectsToggle.dispatch('change');
  assert.deepEqual(preferences.getSnapshot().bgm, {enabled: true, volume: 35});
  assert.deepEqual(preferences.getSnapshot().effects, {enabled: false, volume: 100});
  assert.equal(
    requireByAttribute(root, 'data-dsl4-settings-volume', 'effects').disabled,
    true,
    'a switched-off channel disables its slider',
  );
  assert.equal(
    requireByAttribute(root, 'data-dsl4-settings-volume-value', 'bgm').textContent,
    '35',
  );
});

test('camera and Teachable Machine open their own panels when the story recognizes', () => {
  const {settings, root, calls} = mountSettings({canOpenCamera: false});
  settings.show({features: allFeatures, locale: 'en', context: 'title'});
  const camera = requireByAttribute(root, 'data-dsl4-settings-open', 'camera');
  const compute = requireByAttribute(root, 'data-dsl4-settings-open', 'recognition');
  assert.equal(camera.hidden, true, 'no camera entry to open in this host');
  assert.equal(compute.hidden, false);
  compute.click();
  assert.deepEqual(calls, ['recognition']);

  const other = mountSettings({onOpenRecognition: false});
  other.settings.show({features: allFeatures, locale: 'en', context: 'title'});
  requireByAttribute(other.root, 'data-dsl4-settings-open', 'camera').click();
  assert.equal(
    requireByAttribute(other.root, 'data-dsl4-settings-open', 'recognition').hidden,
    true,
  );
  assert.deepEqual(other.calls, ['camera']);
});

test('closing reports the context it was opened in, from the button, backdrop, or Esc', () => {
  const {document, settings, root, calls} = mountSettings();
  settings.show({features: allFeatures, locale: 'ja', context: 'playback'});
  assert.equal(requireByAttribute(root, 'data-dsl4-settings-paused', 'true').hidden, false);
  assert.equal(
    requireByAttribute(root, 'data-dsl4-settings-done', 'true').textContent,
    '再生に戻る',
  );
  const escape = document.dispatchKey('Escape');
  assert.equal(escape.propagationStopped, true, 'the story keymap never sees this Esc');
  assert.equal(settings.isOpen(), false);

  settings.show({features: allFeatures, locale: 'en', context: 'title'});
  root.dispatch('click');
  settings.show({features: allFeatures, locale: 'en', context: 'playback'});
  requireByAttribute(root, 'data-dsl4-settings-done', 'true').click();
  assert.deepEqual(calls, ['close:playback', 'close:title', 'close:playback']);

  const ignored = document.dispatchKey('Escape');
  assert.equal(ignored.propagationStopped, false, 'a closed screen leaves Esc alone');

  settings.hide();
  settings.dispose();
  assert.equal(document.listenerCount('keydown'), 0);
  assert.equal(findByAttribute(document.body, 'data-dsl4-playback-settings', 'true').length, 0);
});

test('the title offers Config without starting the story', () => {
  const document = createFakeDocument();
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const calls: string[] = [];
  const controls = createDsl4RuntimeTitleControls({
    document,
    mount,
    locales: {
      en: {website: 'Website', close: 'Close', start: 'Start', config: 'Config'},
      ja: {website: 'Webサイト', close: '閉じる', start: '始める', config: '設定'},
    },
    onWebsite: () => calls.push('website'),
    onClose: () => calls.push('close'),
    onConfig: () => calls.push('config'),
  });
  const root = controls.element as unknown as FakeElement;
  const config = requireByAttribute(root, 'data-dsl4-title-action', 'config');
  assert.equal(config.getAttribute('aria-label'), 'Config');
  controls.show('ja');
  assert.equal(config.getAttribute('aria-label'), '設定');
  const event = config.dispatch('click');
  assert.equal(event.propagationStopped, true);
  assert.deepEqual(calls, ['config']);
  controls.dispose();
  assert.equal(findByAttribute(mount, 'data-dsl4-title-action', 'config').length, 0);

  const withoutConfig = createDsl4RuntimeTitleControls({
    document,
    mount,
    locales: {en: {website: 'W', close: 'C'}, ja: {website: 'W', close: 'C'}},
    onWebsite() {},
    onClose() {},
  });
  assert.equal(
    findByAttribute(
      withoutConfig.element as unknown as FakeElement,
      'data-dsl4-title-action',
      'config',
    ).length,
    0,
  );
});
