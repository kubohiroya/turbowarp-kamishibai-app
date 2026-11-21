/**
 * The person's playback preferences: BGM and sound effects, each with its own switch and volume,
 * and a skip override for pose waits.
 *
 * Audio preferences belong to the device, so they are stored and survive a reload. The skip
 * override belongs to one story: it starts from what the story says and is never stored.
 */
export type Dsl4AudioChannel = 'bgm' | 'effects';

export interface Dsl4AudioChannelPreference {
  readonly enabled: boolean;
  /** 0 to 100, the same scale the DSL uses for volume. */
  readonly volume: number;
}

export interface Dsl4PlaybackPreferencesSnapshot {
  readonly bgm: Dsl4AudioChannelPreference;
  readonly effects: Dsl4AudioChannelPreference;
  /** `null` follows the story; `true` or `false` overrides it for this session. */
  readonly skipOverride: boolean | null;
}

export interface Dsl4PlaybackPreferences {
  getSnapshot(): Dsl4PlaybackPreferencesSnapshot;
  /** The 0-1 factor every gain on this channel is multiplied by. */
  getChannelFactor(channel: Dsl4AudioChannel): number;
  setChannel(channel: Dsl4AudioChannel, preference: Partial<Dsl4AudioChannelPreference>): void;
  getSkipOverride(): boolean | null;
  setSkipOverride(value: boolean | null): void;
  subscribe(listener: () => void): () => void;
}

export const dsl4PlaybackPreferencesStorageKey = 'kamishibai.playback.audio.v1';
const channels: readonly Dsl4AudioChannel[] = Object.freeze(['bgm', 'effects']);
const defaultChannel: Dsl4AudioChannelPreference = Object.freeze({enabled: true, volume: 100});

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireChannel(value: unknown): Dsl4AudioChannel {
  if (value !== 'bgm' && value !== 'effects') {
    throw new TypeError('audio channel must be bgm or effects');
  }
  return value;
}

function requireVolume(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new TypeError('volume must be a number from 0 to 100');
  }
  return value;
}

function readStoredChannel(value: unknown): Dsl4AudioChannelPreference {
  if (!isRecord(value)) return defaultChannel;
  const enabled = typeof value.enabled === 'boolean' ? value.enabled : defaultChannel.enabled;
  let volume = defaultChannel.volume;
  try {
    volume = requireVolume(value.volume);
  } catch {
    // A damaged stored value falls back to the default rather than muting the story.
  }
  return Object.freeze({enabled, volume});
}

export function createDsl4PlaybackPreferences(
  options: {
    globalObject?: {localStorage?: Pick<Storage, 'getItem' | 'setItem'>};
  } = {},
): Dsl4PlaybackPreferences {
  let storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;
  const state: Record<Dsl4AudioChannel, Dsl4AudioChannelPreference> = {
    bgm: defaultChannel,
    effects: defaultChannel,
  };
  try {
    storage = options.globalObject?.localStorage;
    const stored: unknown = JSON.parse(
      storage?.getItem(dsl4PlaybackPreferencesStorageKey) ?? 'null',
    );
    if (isRecord(stored)) {
      for (const channel of channels) state[channel] = readStoredChannel(stored[channel]);
    }
  } catch {
    // Private browsing, file: URLs and embedded hosts can refuse or corrupt device storage.
  }
  let skipOverride: boolean | null = null;
  const listeners = new Set<() => void>();

  function persist() {
    try {
      storage?.setItem(dsl4PlaybackPreferencesStorageKey, JSON.stringify(state));
    } catch {
      // The preference still applies for this session when it cannot be stored.
    }
  }

  function notify() {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // A failing observer cannot undo the person's choice or stop the other observers.
      }
    }
  }

  return Object.freeze({
    getSnapshot: () => Object.freeze({bgm: state.bgm, effects: state.effects, skipOverride}),
    getChannelFactor(channel: Dsl4AudioChannel) {
      const preference = state[requireChannel(channel)];
      return preference.enabled ? preference.volume / 100 : 0;
    },
    setChannel(channel: Dsl4AudioChannel, preference: Partial<Dsl4AudioChannelPreference>) {
      const key = requireChannel(channel);
      if (!isRecord(preference)) throw new TypeError('audio preference must be an object');
      const current = state[key];
      if (preference.enabled !== undefined && typeof preference.enabled !== 'boolean') {
        throw new TypeError('enabled must be a boolean');
      }
      const next = Object.freeze({
        enabled: preference.enabled ?? current.enabled,
        volume: preference.volume === undefined ? current.volume : requireVolume(preference.volume),
      });
      if (next.enabled === current.enabled && next.volume === current.volume) return;
      state[key] = next;
      persist();
      notify();
    },
    getSkipOverride: () => skipOverride,
    setSkipOverride(value: boolean | null) {
      if (value !== null && typeof value !== 'boolean') {
        throw new TypeError('skip override must be a boolean or null');
      }
      if (value === skipOverride) return;
      skipOverride = value;
      notify();
    },
    subscribe(listener: () => void) {
      if (typeof listener !== 'function') throw new TypeError('listener must be a function');
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
}
