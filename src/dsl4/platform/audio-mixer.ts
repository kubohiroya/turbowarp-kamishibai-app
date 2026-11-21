import type {
  AssetManagerAudioPlayback,
  AssetManagerAudioPlaybackOptions,
  AssetManagerAudioPlayOptions,
  AssetManagerAudioSource,
} from '@kubohiroya/turbowarp-asset-cache/composition';
import type {Dsl4AudioChannel, Dsl4PlaybackPreferences} from './playback-preferences.js';

/** The BGM voice the crossfade platform drives: a gain it sets and a stop it calls. */
export interface Dsl4MixerAudioVoice {
  readonly ended: PromiseLike<unknown>;
  setGain(gain: number): unknown;
  stop(): unknown;
}

type CreateAudioPlayback = (
  source: AssetManagerAudioSource,
  options?: AssetManagerAudioPlaybackOptions,
) => Promise<AssetManagerAudioPlayback>;

/** The composition types its method loosely; the mixer awaits whatever it returns. */
type BaseCreateAudioPlayback = (
  source: AssetManagerAudioSource,
  options?: AssetManagerAudioPlaybackOptions,
) => unknown;

type CreateAudioVoice = (assetId: string, options: Readonly<{gain: number}>) => unknown;

interface LiveEntry {
  apply(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Scale every gain the story sets by the person's channel preference.
 *
 * The story keeps authoring the gain it wants (`volume: 60`, a fade, a crossfade), and the mixer
 * multiplies that by the channel's factor on the way to the playback. When the person moves a
 * slider, every playback still alive on that channel is set again, so the change is heard at once.
 */
export function createDsl4AudioMixer(preferences: Dsl4PlaybackPreferences) {
  if (
    !isRecord(preferences) ||
    typeof preferences.getChannelFactor !== 'function' ||
    typeof preferences.subscribe !== 'function'
  ) {
    throw new TypeError('audio mixer requires playback preferences');
  }
  const live = new Map<Dsl4AudioChannel, Set<LiveEntry>>([
    ['bgm', new Set()],
    ['effects', new Set()],
  ]);
  const factor = (channel: Dsl4AudioChannel) => preferences.getChannelFactor(channel);
  const unsubscribe = preferences.subscribe(() => {
    for (const entries of live.values()) {
      for (const entry of [...entries]) {
        try {
          entry.apply();
        } catch {
          // A playback that already ended or failed keeps its own error path.
        }
      }
    }
  });

  function track(channel: Dsl4AudioChannel, entry: LiveEntry, ended: PromiseLike<unknown>) {
    const entries = live.get(channel)!;
    entries.add(entry);
    const release = () => entries.delete(entry);
    Promise.resolve(ended).then(release, release);
    return release;
  }

  function wrapPlayback(
    channel: Dsl4AudioChannel,
    playback: AssetManagerAudioPlayback,
    authoredGain: number,
  ): AssetManagerAudioPlayback {
    let authored = authoredGain;
    const entry: LiveEntry = {apply: () => void playback.setGain(authored * factor(channel))};
    const release = track(channel, entry, playback.ended);
    return Object.freeze({
      get ended() {
        return playback.ended;
      },
      get currentTime() {
        return playback.currentTime;
      },
      get paused() {
        return playback.paused;
      },
      get loop() {
        return playback.loop;
      },
      get gain() {
        return authored;
      },
      get muted() {
        return playback.muted;
      },
      get playbackRate() {
        return playback.playbackRate;
      },
      play(options?: AssetManagerAudioPlayOptions) {
        if (options?.gain === undefined) return playback.play(options);
        authored = options.gain;
        return playback.play({...options, gain: authored * factor(channel)});
      },
      pause: () => playback.pause(),
      stop: (options?: Parameters<AssetManagerAudioPlayback['stop']>[0]) => playback.stop(options),
      seek: (seconds: number, signal?: AbortSignal) => playback.seek(seconds, signal),
      setGain(value: number) {
        authored = value;
        return playback.setGain(value * factor(channel));
      },
      setMuted: (value: boolean) => playback.setMuted(value),
      setPlaybackRate: (value: number) => playback.setPlaybackRate(value),
      dispose() {
        release();
        playback.dispose();
      },
    });
  }

  return Object.freeze({
    /** Wrap an Asset Manager playback factory so its playbacks follow one channel. */
    playbackFactory(
      channel: Dsl4AudioChannel,
      create: BaseCreateAudioPlayback,
    ): CreateAudioPlayback {
      if (typeof create !== 'function') throw new TypeError('createAudioPlayback is required');
      return async (source, options) => {
        const authored = options?.gain ?? 1;
        const playback = (await create(source, {
          ...options,
          gain: authored * factor(channel),
        })) as AssetManagerAudioPlayback;
        return wrapPlayback(channel, playback, authored);
      };
    },
    /** Wrap the managed BGM voice factory the crossfade platform uses. */
    voiceFactory(channel: Dsl4AudioChannel, create: CreateAudioVoice): CreateAudioVoice {
      if (typeof create !== 'function') throw new TypeError('createAudioVoice is required');
      return (assetId, options) => {
        let authored = options.gain;
        const wrap = (voice: unknown) => {
          if (
            !isRecord(voice) ||
            typeof voice.setGain !== 'function' ||
            typeof voice.stop !== 'function'
          ) {
            // Leave a malformed voice to the crossfade platform, which reports it.
            return voice;
          }
          const source = voice as unknown as Dsl4MixerAudioVoice;
          const entry: LiveEntry = {apply: () => void source.setGain(authored * factor(channel))};
          const release = track(channel, entry, source.ended);
          return Object.freeze({
            get ended() {
              return source.ended;
            },
            setGain(gain: number) {
              authored = gain;
              return source.setGain(gain * factor(channel));
            },
            stop() {
              release();
              return source.stop();
            },
          });
        };
        const created = create(assetId, {...options, gain: authored * factor(channel)});
        return isRecord(created) &&
          typeof (created as unknown as PromiseLike<unknown>).then === 'function'
          ? Promise.resolve(created).then(wrap)
          : wrap(created);
      };
    },
    /** How many playbacks are alive on a channel; for diagnostics and tests. */
    liveCount: (channel: Dsl4AudioChannel) => live.get(channel)?.size ?? 0,
    dispose() {
      unsubscribe();
      for (const entries of live.values()) entries.clear();
    },
  });
}

export type Dsl4AudioMixer = ReturnType<typeof createDsl4AudioMixer>;
