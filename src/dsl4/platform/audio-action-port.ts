import type {
  AssetManagerAudioPlayback,
  AssetManagerAudioPlaybackOptions,
  AssetManagerAudioSource,
} from '@kubohiroya/turbowarp-asset-cache/composition';
import {dsl4VideoControlValueFields, dsl4VideoOperations, isDsl4VideoUrl} from '../video-source.js';

interface AudioEntry {
  readonly assetId: string | null;
  readonly url: string | null;
  readonly playback: AssetManagerAudioPlayback;
  cancel: (() => void) | null;
  run: number;
}

export interface Dsl4AudioActionPort extends Readonly<Record<string, unknown>> {
  audio(payload: unknown, context: unknown): Promise<void>;
  audioControl(payload: unknown, context: unknown): Promise<void>;
  clear(): void;
  releaseAssets(assetIds: readonly string[]): void;
  captureState(): readonly Dsl4AudioPlaybackState[];
  prepareRestoreState(state: unknown): Promise<Readonly<{start(): void; dispose(): void}>>;
  dispose(): void;
}

/** One scene audio instance as data; native playback handles never enter a save. */
export interface Dsl4AudioPlaybackState {
  readonly id: string;
  readonly asset?: string;
  readonly url?: string;
  readonly time: number;
  readonly paused: boolean;
  readonly loop: boolean;
  readonly volume: number;
  readonly muted: boolean;
  readonly rate: number;
}

function failure(code: string, message: string, cause?: unknown) {
  const error = new Error(message, cause === undefined ? undefined : {cause});
  Object.defineProperty(error, 'code', {value: `K4-AUDIO-${code}`});
  return error;
}

function cancelled() {
  const error = failure('CANCELLED', 'Audio playback was cancelled');
  error.name = 'AbortError';
  return error;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw failure('ARGUMENT', 'Audio arguments must be an object');
  }
  return value as Record<string, unknown>;
}

function contextSignal(context: unknown): AbortSignal {
  const signal = record(context).signal as AbortSignal;
  if (
    !signal ||
    typeof signal.addEventListener !== 'function' ||
    typeof signal.removeEventListener !== 'function' ||
    typeof signal.aborted !== 'boolean'
  ) {
    throw failure('ARGUMENT', 'Audio actions require an AbortSignal');
  }
  if (signal.aborted) throw cancelled();
  return signal;
}

function idFor(args: Record<string, unknown>) {
  if (typeof args.id !== 'string' || args.id.length === 0) {
    throw failure('ARGUMENT', 'Audio id must be a non-empty string');
  }
  return args.id;
}

function numeric(value: unknown, minimum: number, maximum: number, name: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw failure('ARGUMENT', `Invalid audio ${name}`);
  }
  return value;
}

/** Scene ownership belongs here; native playback and source resources belong to asset-cache. */
export function createDsl4AudioActionPort(options: {
  createAudioPlayback: (
    source: AssetManagerAudioSource,
    options: AssetManagerAudioPlaybackOptions,
  ) => Promise<AssetManagerAudioPlayback>;
  getAssetResource: (id: string) => unknown;
  onBackgroundError?: (error: unknown) => unknown;
}): Dsl4AudioActionPort {
  const entries = new Map<string, AudioEntry>();
  const pending = new Map<string, {assetId: string | null; cancel: () => void}>();
  let disposed = false;

  function requireActive() {
    if (disposed) throw failure('DISPOSED', 'Audio port is disposed');
  }

  function cancel(entry: AudioEntry) {
    entry.run++;
    entry.cancel?.();
    entry.cancel = null;
  }

  function cancelPending(id: string) {
    const preparation = pending.get(id);
    pending.delete(id);
    preparation?.cancel();
  }

  function release(id: string) {
    cancelPending(id);
    const entry = entries.get(id);
    if (!entry) return;
    entries.delete(id);
    cancel(entry);
    entry.playback.dispose();
  }

  function clear() {
    for (const id of pending.keys()) cancelPending(id);
    const errors: unknown[] = [];
    for (const id of entries.keys()) {
      try {
        release(id);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, 'Audio cleanup failed');
  }

  function validateState(input: unknown): readonly Dsl4AudioPlaybackState[] {
    if (!Array.isArray(input) || input.length > 32)
      throw failure('RESTORE', 'Saved audio must be a list of at most 32 instances');
    const ids = new Set<string>();
    return input.map((raw: unknown) => {
      const state = record(raw);
      const source = Object.hasOwn(state, 'asset') ? 'asset' : 'url';
      const expected = ['id', source, 'time', 'paused', 'loop', 'volume', 'muted', 'rate'];
      if (
        Object.keys(state).length !== expected.length ||
        expected.some((key) => !Object.hasOwn(state, key))
      )
        throw failure('RESTORE', 'Saved audio fields are invalid');
      const id = idFor(state);
      if (ids.has(id)) throw failure('RESTORE', `Saved audio id is duplicated: ${id}`);
      ids.add(id);
      if (source === 'url' ? !isDsl4VideoUrl(state.url) : typeof state.asset !== 'string')
        throw failure('RESTORE', 'Saved audio source must be an asset or HTTP(S) URL');
      if (
        source === 'asset' &&
        (options.getAssetResource(state.asset as string) as {kind?: string} | null)?.kind !==
          'sound'
      )
        throw failure('ASSET', `Audio asset is not prepared: ${String(state.asset)}`);
      numeric(state.time, 0, Number.MAX_SAFE_INTEGER, 'time');
      numeric(state.volume, 0, Number.MAX_VALUE, 'volume');
      numeric(state.rate, 0.25, 4, 'rate');
      if (['paused', 'loop', 'muted'].some((key) => typeof state[key] !== 'boolean'))
        throw failure('RESTORE', 'Saved audio playback flags must be boolean');
      return state as unknown as Dsl4AudioPlaybackState;
    });
  }

  function playInBackground(id: string, entry: AudioEntry, loop: boolean) {
    const run = entry.run;
    const controller = new AbortController();
    entry.cancel = () => controller.abort();
    const report = (cause: unknown) => {
      if (entry.run !== run || controller.signal.aborted) return;
      options.onBackgroundError?.(failure('PLAY', `Audio playback could not resume: ${id}`, cause));
    };
    void Promise.resolve()
      .then(() => entry.playback.play({restart: false, loop, signal: controller.signal}))
      .then(() => entry.playback.ended)
      .catch(report);
  }

  const port: Dsl4AudioActionPort = {
    async audio(payload, context) {
      requireActive();
      const args = record(payload);
      const id = idFor(args);
      const signal = contextSignal(context);
      const allowed = [
        'id',
        'asset',
        'url',
        'volume',
        'muted',
        'playbackRate',
        'stableId',
        'fadeIn',
        'fadeOut',
      ];
      if (
        Object.keys(args).some((key) => !allowed.includes(key)) ||
        Object.hasOwn(args, 'asset') === Object.hasOwn(args, 'url') ||
        (args.muted !== undefined && typeof args.muted !== 'boolean')
      ) {
        throw failure('ARGUMENT', 'Audio requires exactly one source and valid playback settings');
      }
      const settings = {
        gain:
          numeric(args.volume === undefined ? 100 : args.volume, 0, Number.MAX_VALUE, 'volume') /
          100,
        muted: (args.muted ?? false) as boolean,
        playbackRate: numeric(args.playbackRate ?? 1, 0.25, 4, 'playbackRate'),
        ...(args.fadeIn === undefined
          ? {}
          : {fadeIn: numeric(args.fadeIn, 0, Number.MAX_VALUE, 'fadeIn')}),
        ...(args.fadeOut === undefined
          ? {}
          : {fadeOut: numeric(args.fadeOut, 0, Number.MAX_VALUE, 'fadeOut')}),
      };
      let source: AssetManagerAudioSource;
      let assetId: string | null = null;
      if (Object.hasOwn(args, 'url')) {
        if (!isDsl4VideoUrl(args.url))
          throw failure('SOURCE', 'Audio URL must use HTTP(S) without credentials');
        source = {url: args.url};
      } else {
        if (typeof args.asset !== 'string' || !args.asset)
          throw failure('SOURCE', 'Invalid audio asset');
        const resource = options.getAssetResource(args.asset) as {kind?: string} | null;
        if (resource?.kind !== 'sound')
          throw failure('ASSET', `Audio asset is not prepared: ${args.asset}`);
        source = {asset: args.asset};
        assetId = args.asset;
      }
      if (
        !entries.has(id) &&
        !pending.has(id) &&
        new Set([...entries.keys(), ...pending.keys()]).size >= 32
      ) {
        throw failure('LIMIT', 'At most 32 audio instances may be active');
      }
      cancelPending(id);
      let rejectPreparation!: (error: unknown) => void;
      const aborted = new Promise<never>((_resolve, reject) => {
        rejectPreparation = reject;
      });
      const token = {assetId, cancel: () => rejectPreparation(cancelled())};
      pending.set(id, token);
      const onAbort = () => {
        if (pending.get(id) === token) cancelPending(id);
      };
      signal.addEventListener('abort', onAbort, {once: true});
      if (signal.aborted) onAbort();
      try {
        const prepared = Promise.resolve()
          .then(() => options.createAudioPlayback(source, settings))
          .then((playback) => {
            if (signal.aborted || disposed || pending.get(id) !== token) {
              playback.dispose();
              throw cancelled();
            }
            return playback;
          });
        const playback = await Promise.race([prepared, aborted]);
        pending.delete(id);
        release(id);
        entries.set(id, {
          assetId,
          url: assetId === null ? (source as {url: string}).url : null,
          playback,
          cancel: null,
          run: 0,
        });
      } finally {
        signal.removeEventListener('abort', onAbort);
        if (pending.get(id) === token) pending.delete(id);
      }
    },
    async audioControl(payload, context) {
      requireActive();
      const args = record(payload);
      const id = idFor(args);
      const signal = contextSignal(context);
      const operation = String(args.operation);
      const field = dsl4VideoControlValueFields[operation];
      const fades = ['playUntilDone', 'play', 'loop', 'resume'].includes(operation)
        ? ['fadeIn', 'volume', 'fadeOut']
        : operation === 'stop'
          ? ['fadeOut']
          : [];
      const fadeOptions = Object.fromEntries(
        fades
          .filter((key) => args[key] !== undefined)
          .map((key) => [
            key === 'volume' ? 'gain' : key,
            numeric(args[key], 0, Number.MAX_VALUE, key) / (key === 'volume' ? 100 : 1),
          ]),
      );
      if (
        !dsl4VideoOperations.includes(operation) ||
        Object.keys(args).some(
          (key) =>
            !['id', 'operation', 'stableId', ...fades, ...(field ? [field] : [])].includes(key),
        )
      ) {
        throw failure('ARGUMENT', 'Invalid audio operation or value');
      }
      const entry = entries.get(id);
      if (!entry) throw failure('ID', `Unknown audio id: ${id}`);
      const playback = entry.playback;
      if (operation === 'seek')
        return playback.seek(numeric(args.seconds, 0, Number.MAX_SAFE_INTEGER, 'seconds'), signal);
      if (operation === 'setVolume') {
        await playback.setGain(numeric(args.volume, 0, Number.MAX_VALUE, 'volume') / 100);
        return;
      }
      if (operation === 'setPlaybackRate') {
        playback.setPlaybackRate(numeric(args.rate, 0.25, 4, 'rate'));
        return;
      }
      if (operation === 'setMuted') {
        if (typeof args.muted !== 'boolean')
          throw failure('ARGUMENT', 'Audio muted must be boolean');
        playback.setMuted(args.muted);
        return;
      }
      if (operation === 'pause') {
        playback.pause();
        cancel(entry);
        return;
      }
      if (operation === 'stop') {
        const run = entry.run;
        await playback.stop({...fadeOptions, signal});
        if (entry.run === run) cancel(entry);
        return;
      }
      cancel(entry);
      const run = entry.run;
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      signal.addEventListener('abort', onAbort, {once: true});
      entry.cancel = () => controller.abort();
      if (signal.aborted) controller.abort();
      const report = (cause: unknown) => {
        if (entry.run !== run || controller.signal.aborted) throw cancelled();
        const original = (cause as {cause?: unknown})?.cause ?? cause;
        const error = failure(
          (original as {name?: string})?.name === 'NotAllowedError' ? 'AUTOPLAY' : 'PLAY',
          `Audio playback could not start: ${id}`,
          cause,
        );
        release(id);
        throw error;
      };
      try {
        await playback.play({
          ...fadeOptions,
          restart: operation !== 'resume',
          loop: operation === 'resume' ? playback.loop : operation === 'loop',
          signal: controller.signal,
        });
        if (entry.run !== run || controller.signal.aborted) throw cancelled();
        if (operation === 'playUntilDone') await playback.ended;
        else {
          // A background run survives the initiating action; scene cleanup owns cancellation.
          signal.removeEventListener('abort', onAbort);
          void playback.ended.catch((cause: unknown) => {
            if (entry.run !== run || controller.signal.aborted) return;
            try {
              report(cause);
            } catch (error) {
              options.onBackgroundError?.(error);
            }
          });
        }
      } catch (cause) {
        report(cause);
      } finally {
        signal.removeEventListener('abort', onAbort);
      }
    },
    clear,
    captureState() {
      return [...entries].map(([id, entry]) => ({
        id,
        ...(entry.assetId === null ? {url: entry.url!} : {asset: entry.assetId}),
        time: entry.playback.currentTime,
        paused: entry.playback.paused,
        loop: entry.playback.loop,
        volume: entry.playback.gain * 100,
        muted: entry.playback.muted,
        rate: entry.playback.playbackRate,
      }));
    },
    /**
     * Create and seek the saved playbacks before anything changes, so a missing source refuses the
     * restore. `start` replaces the current instances and resumes the ones that were playing.
     */
    async prepareRestoreState(input) {
      requireActive();
      const states = validateState(input);
      const prepared: {state: Dsl4AudioPlaybackState; playback: AssetManagerAudioPlayback}[] = [];
      let settled = false;
      const dispose = () => {
        if (settled) return;
        settled = true;
        const errors: unknown[] = [];
        for (const {playback} of prepared)
          try {
            playback.dispose();
          } catch (error) {
            errors.push(error);
          }
        if (errors.length) throw new AggregateError(errors, 'Prepared audio cleanup failed');
      };
      try {
        for (const state of states) {
          const playback = await options.createAudioPlayback(
            state.url === undefined ? {asset: state.asset!} : {url: state.url},
            {gain: state.volume / 100, muted: state.muted, playbackRate: state.rate},
          );
          prepared.push({state, playback});
          if (state.time > 0) await playback.seek(state.time);
        }
      } catch (error) {
        try {
          dispose();
        } catch {
          /* The preparation failure is the one to report. */
        }
        throw failure('RESTORE', 'Saved audio could not be prepared', error);
      }
      return Object.freeze({
        start() {
          requireActive();
          if (settled) throw failure('RESTORE', 'Prepared audio was already settled');
          settled = true;
          clear();
          for (const {state, playback} of prepared) {
            const entry: AudioEntry = {
              assetId: state.asset ?? null,
              url: state.url ?? null,
              playback,
              cancel: null,
              run: 0,
            };
            entries.set(state.id, entry);
            if (!state.paused) playInBackground(state.id, entry, state.loop);
          }
        },
        dispose,
      });
    },
    releaseAssets(assetIds) {
      for (const [id, token] of pending)
        if (token.assetId && assetIds.includes(token.assetId)) cancelPending(id);
      for (const [id, entry] of entries)
        if (entry.assetId && assetIds.includes(entry.assetId)) release(id);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
    },
  };
  return Object.freeze(port);
}
