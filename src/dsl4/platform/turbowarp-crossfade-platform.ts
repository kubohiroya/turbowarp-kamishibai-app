import {applyDsl4MoveEasing, isDsl4MoveEasing} from '../move-easing.js';
import type {Dsl4CompositionMethod} from './composition-contract.js';

const defaultFrameMilliseconds = 1000 / 60;

/** Transition easings arrive from parsed story sources, so they are validated before use. */
function transitionEasing(value: unknown): import('../move-easing.js').Dsl4MoveEasing {
  const easing = String(value ?? 'easeInOut');
  if (!isDsl4MoveEasing(easing)) throw new TypeError(`Unknown move easing: ${easing}`);
  return easing;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface Dsl4TurboWarpDrawable {
  readonly skin?: {readonly id: number};
  readonly _position: readonly [number, number];
  readonly _direction: number;
  readonly _scale: readonly [number, number];
  readonly _visible: boolean;
}

interface Dsl4TurboWarpLayerGroup {
  readonly groupIndex: number;
  readonly drawListOffset: number;
}

interface Dsl4TurboWarpRenderer {
  readonly _groupOrdering?: readonly string[];
  readonly _layerGroups?: Readonly<Record<string, Dsl4TurboWarpLayerGroup>>;
  readonly _drawList: readonly unknown[];
  readonly _allDrawables?: Readonly<Record<number, Dsl4TurboWarpDrawable | undefined>>;
  readonly canvas?: HTMLCanvasElement;
  readonly _gl?: {readonly canvas?: HTMLCanvasElement};
  getDrawableOrder(drawableId: number): number;
  createDrawable(group: string): unknown;
  updateDrawableSkinId(drawableId: number, skinId: number): void;
  updateDrawableProperties(drawableId: number, properties: Record<string, unknown>): void;
  updateDrawableEffect(drawableId: number, effect: string, value: number): void;
  markDrawableAsNoninteractive?(drawableId: number): void;
  setDrawableOrder(drawableId: number, order: number, group: string): void;
  destroyDrawable(drawableId: number, group: string): void;
  createBitmapSkin(bitmap: ImageBitmap, bitmapResolution: number): number;
  destroySkin(skinId: number): void;
  getNativeSize(): readonly [number, number];
}

interface Dsl4TurboWarpTarget {
  readonly drawableID: number;
  readonly visible?: unknown;
  readonly effects?: unknown;
  setEffect?(effect: string, value: number): void;
}

interface Dsl4CrossfadeTransition {
  readonly seconds?: unknown;
  readonly easing?: unknown;
  readonly effect?: unknown;
  readonly curve?: unknown;
}

interface Dsl4CrossfadeAudioVoice {
  readonly ended: PromiseLike<unknown>;
  setGain(gain: number): unknown;
  stop(): unknown;
}

interface Dsl4CrossfadeOperation {
  start?(): Promise<unknown>;
  finish(reason?: unknown): unknown;
}

function platformError(message: string) {
  const error = new Error(message);
  Object.defineProperty(error, 'code', {value: 'K4-CROSSFADE-PLATFORM-001'});
  return error;
}

function abortError() {
  const error = new Error('DSL 4.0 crossfade was cancelled');
  error.name = 'AbortError';
  return error;
}

function rendererDrawableId(value: unknown) {
  if (!Number.isInteger(value)) {
    throw platformError('A transition drawable could not be created');
  }
  return value as number;
}

const completedOperation = Object.freeze({
  start: () => Promise.resolve(),
  finish() {},
});

function defaultScheduler() {
  return Object.freeze({
    now: () => performance.now(),
    setTimeout: (callback: () => void, milliseconds: number) => setTimeout(callback, milliseconds),
    clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
}

function drawableGroup(renderer: Dsl4TurboWarpRenderer, drawableId: number) {
  const order = renderer.getDrawableOrder(drawableId);
  const groupOrdering = renderer._groupOrdering ?? [];
  const layerGroups = renderer._layerGroups ?? {};
  for (const name of groupOrdering) {
    const group = layerGroups[name];
    if (!group) continue;
    const nextName = groupOrdering[group.groupIndex + 1];
    const nextGroup = nextName ? layerGroups[nextName] : undefined;
    const end = nextGroup ? nextGroup.drawListOffset : renderer._drawList.length;
    if (order >= group.drawListOffset && order < end) return name;
  }
  throw platformError('The target drawable layer group is unavailable');
}

function createDrawableCopy(renderer: Dsl4TurboWarpRenderer, target: Dsl4TurboWarpTarget) {
  const sourceId = target.drawableID;
  const source = renderer._allDrawables?.[sourceId];
  if (!source?.skin) throw platformError('The target drawable skin is unavailable');
  const group = drawableGroup(renderer, sourceId);
  const drawableId = rendererDrawableId(renderer.createDrawable(group));
  try {
    renderer.updateDrawableSkinId(drawableId, source.skin.id);
    renderer.updateDrawableProperties(drawableId, {
      position: [source._position[0], source._position[1]],
      direction: source._direction,
      scale: [source._scale[0], source._scale[1]],
      visible: source._visible,
      ...(isRecord(target.effects) ? target.effects : {}),
    });
    renderer.markDrawableAsNoninteractive?.(drawableId);
    const sourceOrder = renderer.getDrawableOrder(sourceId);
    renderer.setDrawableOrder(drawableId, sourceOrder + 1, group);
    return Object.freeze({drawableId, group});
  } catch (error) {
    renderer.destroyDrawable(drawableId, group);
    throw error;
  }
}

/** TurboWarp renderer and Asset Manager implementation for visual and BGM crossfades. */
export function createDsl4TurboWarpCrossfadePlatform(options: {
  /** Injected `@kubohiroya/turbowarp-runtime-adapter` adapter. */
  runtimeHost: unknown;
  scheduler?: unknown;
  frameMilliseconds?: number;
  createAudioVoice?: (
    assetId: string,
    options: Readonly<{gain: number}>,
  ) => unknown | Promise<unknown>;
  createImageBitmap?: (canvas: HTMLCanvasElement) => Promise<ImageBitmap>;
  onBackgroundError?: (error: unknown) => unknown;
}) {
  if (
    !isRecord(options) ||
    !isRecord(options.runtimeHost) ||
    typeof options.runtimeHost.getRenderer !== 'function' ||
    typeof options.runtimeHost.requestRedraw !== 'function' ||
    typeof options.runtimeHost.getStageTarget !== 'function'
  ) {
    throw new TypeError('Crossfade platform requires an injected TurboWarp runtime host');
  }
  const runtimeHost = options.runtimeHost as {
    getRenderer: () => unknown;
    requestRedraw: () => void;
    getStageTarget: () => unknown;
  };
  let renderer: Dsl4TurboWarpRenderer;
  try {
    renderer = runtimeHost.getRenderer() as Dsl4TurboWarpRenderer;
  } catch (error) {
    throw new TypeError('Crossfade platform requires a TurboWarp runtime renderer', {cause: error});
  }
  const scheduler = (options.scheduler ?? defaultScheduler()) as Record<
    'now' | 'setTimeout' | 'clearTimeout',
    Dsl4CompositionMethod
  >;
  if (
    (['now', 'setTimeout', 'clearTimeout'] as const).some(
      (name) => typeof scheduler[name] !== 'function',
    )
  ) {
    throw new TypeError('Crossfade scheduler must provide now, setTimeout, and clearTimeout');
  }
  const frameMilliseconds = Number(options.frameMilliseconds ?? defaultFrameMilliseconds);
  if (!Number.isFinite(frameMilliseconds) || frameMilliseconds <= 0) {
    throw new TypeError('Crossfade frameMilliseconds must be positive');
  }
  const onBackgroundError = options.onBackgroundError ?? (() => {});
  if (typeof onBackgroundError !== 'function') {
    throw new TypeError('onBackgroundError must be a function');
  }
  const bitmapFactory = options.createImageBitmap ?? globalThis.createImageBitmap;
  const createAudioVoice = options.createAudioVoice;
  const active = new Set<{finish: () => void}>();
  let disposed = false;
  let currentVoice: {
    assetId: string;
    voice: Dsl4CrossfadeAudioVoice;
    gain: number;
    /** The gain a running fade is heading for; a save keeps this, not the momentary level. */
    targetGain: number;
  } | null = null;
  let currentBgmTransition: Dsl4CrossfadeOperation | null = null;

  function timeline(duration: number, update: (progress: number) => void, complete: () => void) {
    let state = 'idle';
    let timer: unknown;
    let resolveOperation: (() => void) | undefined;
    let rejectOperation: ((error: unknown) => void) | undefined;
    const operation = Object.freeze({
      start() {
        if (state !== 'idle') throw platformError('A crossfade operation can only start once');
        state = 'running';
        active.add(operation);
        const startTime = Number(scheduler.now());
        return new Promise((resolve, reject) => {
          resolveOperation = () => resolve(undefined);
          rejectOperation = reject;
          const tick = () => {
            timer = undefined;
            if (state !== 'running') return;
            try {
              const elapsed = Math.max(0, Number(scheduler.now()) - startTime);
              const progress = Math.min(elapsed / duration, 1);
              update(progress);
              if (progress >= 1) {
                operation.finish();
                return;
              }
              timer = scheduler.setTimeout(tick, Math.min(frameMilliseconds, duration - elapsed));
            } catch (error) {
              state = 'failed';
              active.delete(operation);
              try {
                complete();
              } catch (cleanupError) {
                reject(new AggregateError([error, cleanupError], 'Crossfade cleanup failed'));
                return;
              }
              reject(error);
            }
          };
          if (duration === 0) operation.finish();
          else timer = scheduler.setTimeout(tick, Math.min(frameMilliseconds, duration));
        });
      },
      finish() {
        if (state === 'completed') return;
        if (timer !== undefined) scheduler.clearTimeout(timer);
        timer = undefined;
        try {
          complete();
          state = 'completed';
          active.delete(operation);
          resolveOperation?.();
        } catch (error) {
          state = 'failed';
          active.delete(operation);
          rejectOperation?.(error);
          throw error;
        }
      },
    });
    return operation;
  }

  async function crossfadeDrawable(
    target: Dsl4TurboWarpTarget,
    apply: () => unknown | Promise<unknown>,
    transition: Dsl4CrossfadeTransition,
    signal?: AbortSignal,
  ) {
    if (disposed) throw platformError('Crossfade platform is disposed');
    if (signal?.aborted) throw abortError();
    if (target.visible === false) return apply();
    const effects = isRecord(target.effects) ? target.effects : {};
    const baseline = Math.max(0, Math.min(100, Number(effects.ghost ?? 0)));
    const copy = createDrawableCopy(renderer, target);
    let cleaned = false;
    let cancelled = false;
    let aborted = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      target.setEffect?.('ghost', baseline);
      renderer.destroyDrawable(copy.drawableId, copy.group);
      runtimeHost.requestRedraw();
    };
    let finishCurrent = cleanup;
    const preparation = Object.freeze({
      finish() {
        cancelled = true;
        active.delete(preparation);
        cleanup();
      },
    });
    const onAbort = () => {
      aborted = true;
      cancelled = true;
      finishCurrent();
    };
    active.add(preparation);
    signal?.addEventListener('abort', onAbort, {once: true});
    try {
      await apply();
      active.delete(preparation);
      if (cancelled || disposed) {
        if (aborted) throw abortError();
        return;
      }
      target.setEffect?.('ghost', 100);
      const duration = Number(transition.seconds) * 1000;
      const operation = timeline(
        duration,
        (progress) => {
          const eased = applyDsl4MoveEasing(transitionEasing(transition.easing), progress);
          target.setEffect?.('ghost', 100 + (baseline - 100) * eased);
          renderer.updateDrawableEffect(
            copy.drawableId,
            'ghost',
            baseline + (100 - baseline) * eased,
          );
          runtimeHost.requestRedraw();
        },
        cleanup,
      );
      finishCurrent = () => operation.finish();
      await operation.start();
      if (aborted) throw abortError();
    } catch (error) {
      cleanup();
      throw error;
    } finally {
      active.delete(preparation);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  async function createSceneCrossfade(transition: Dsl4CrossfadeTransition) {
    if (disposed) throw platformError('Crossfade platform is disposed');
    if (typeof bitmapFactory !== 'function') {
      throw platformError('createImageBitmap is required for scene crossfade');
    }
    const canvas = renderer.canvas ?? renderer._gl?.canvas;
    if (!canvas) throw platformError('The renderer canvas is unavailable');
    let cancelled = false;
    const preparation = Object.freeze({
      finish() {
        cancelled = true;
        active.delete(preparation);
      },
    });
    active.add(preparation);
    let bitmap: ImageBitmap;
    try {
      bitmap = await bitmapFactory(canvas);
    } finally {
      active.delete(preparation);
    }
    if (disposed || cancelled) {
      bitmap.close?.();
      if (disposed) throw platformError('Crossfade platform is disposed');
      return completedOperation;
    }
    let skinId;
    try {
      skinId = renderer.createBitmapSkin(bitmap, 1);
    } finally {
      bitmap.close?.();
    }
    const group = renderer._groupOrdering?.at(-1);
    if (!group) {
      renderer.destroySkin(skinId);
      throw platformError('The renderer layer ordering is unavailable');
    }
    let drawableId: number | undefined;
    try {
      drawableId = rendererDrawableId(renderer.createDrawable(group));
      renderer.updateDrawableSkinId(drawableId, skinId);
      const nativeSize = renderer.getNativeSize();
      renderer.updateDrawableProperties(drawableId, {
        position: [0, 0],
        direction: 90,
        scale: [
          (Number(nativeSize[0]) / Number(canvas.width)) * 100,
          (Number(nativeSize[1]) / Number(canvas.height)) * 100,
        ],
        visible: true,
        ghost: 0,
      });
      renderer.markDrawableAsNoninteractive?.(drawableId);
      renderer.setDrawableOrder(drawableId, Infinity, group);
    } catch (error) {
      if (drawableId !== undefined) renderer.destroyDrawable(drawableId, group);
      renderer.destroySkin(skinId);
      throw error;
    }
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (drawableId === undefined) throw platformError('A scene transition drawable is missing');
      renderer.destroyDrawable(drawableId, group);
      renderer.destroySkin(skinId);
      runtimeHost.requestRedraw();
    };
    const operation = timeline(
      Number(transition.seconds) * 1000,
      (progress) => {
        const eased = applyDsl4MoveEasing(transitionEasing(transition.easing), progress);
        if (drawableId === undefined) throw platformError('A scene transition drawable is missing');
        renderer.updateDrawableEffect(drawableId, 'ghost', eased * 100);
        runtimeHost.requestRedraw();
      },
      cleanup,
    );
    active.add(operation);
    return operation;
  }

  /** Validate an optional BGM fade duration in seconds. */
  function fadeSeconds(seconds: unknown) {
    if (seconds === undefined) return 0;
    const numeric = Number(seconds);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 60) {
      throw platformError('BGM fade seconds must be between 0 and 60');
    }
    return numeric;
  }

  /** Convert the author-facing 0-100 BGM volume to the 0-1 gain the voice handle takes. */
  function bgmGain(volume: unknown) {
    if (volume === undefined) return 1;
    const numeric = Number(volume);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
      throw platformError('BGM volume must be between 0 and 100');
    }
    return numeric / 100;
  }

  async function replaceBgm(
    assetId: string,
    transition: Dsl4CrossfadeTransition,
    {
      restart = false,
      signal,
      volume,
    }: {restart?: boolean; signal?: AbortSignal; volume?: unknown} = {},
  ) {
    if (disposed) throw platformError('Crossfade platform is disposed');
    if (typeof createAudioVoice !== 'function') {
      throw platformError('Asset Manager audio voice handles are required for BGM crossfade');
    }
    if (!restart && currentVoice?.assetId === assetId) return;
    currentBgmTransition?.finish('replaced');
    currentBgmTransition = null;
    const outgoing = currentVoice;
    const crossfade = transition.effect === 'crossfade';
    const targetGain = bgmGain(volume);
    const candidateVoice = await createAudioVoice(assetId, {gain: crossfade ? 0 : targetGain});
    if (
      !isRecord(candidateVoice) ||
      !isRecord(candidateVoice.ended) ||
      typeof candidateVoice.ended.then !== 'function' ||
      typeof candidateVoice.setGain !== 'function' ||
      typeof candidateVoice.stop !== 'function'
    ) {
      if (isRecord(candidateVoice) && typeof candidateVoice.stop === 'function') {
        candidateVoice.stop();
      }
      throw platformError('Audio voice factory returned an invalid voice handle');
    }
    const voice = candidateVoice as unknown as Dsl4CrossfadeAudioVoice;
    if (signal?.aborted) {
      voice.stop();
      const error = new Error('DSL 4.0 BGM replacement was cancelled');
      error.name = 'AbortError';
      throw error;
    }
    const next = {assetId, voice, gain: crossfade ? 0 : targetGain, targetGain};
    currentVoice = next;
    void voice.ended.then(
      () => {
        if (currentVoice === next) currentVoice = null;
      },
      (error) => {
        if (currentVoice === next) currentVoice = null;
        onBackgroundError(error);
      },
    );
    if (!crossfade) {
      outgoing?.voice.stop();
      return;
    }
    const curve = String(transition.curve ?? 'equalPower');
    const operation = timeline(
      Number(transition.seconds) * 1000,
      (progress) => {
        const oldGain = curve === 'equalPower' ? Math.cos((Math.PI * progress) / 2) : 1 - progress;
        const newGain = curve === 'equalPower' ? Math.sin((Math.PI * progress) / 2) : progress;
        outgoing?.voice.setGain(oldGain * (outgoing.gain ?? 1));
        voice.setGain(newGain * targetGain);
        next.gain = newGain * targetGain;
      },
      () => {
        outgoing?.voice.stop();
        voice.setGain(targetGain);
        next.gain = targetGain;
        if (currentBgmTransition === operation) currentBgmTransition = null;
      },
    );
    currentBgmTransition = operation;
    void operation.start().catch(onBackgroundError);
  }

  /**
   * Stop the current BGM, optionally fading it out first. Stopping with no BGM playing is a no-op
   * so a script can end a scene the same way whether or not it started music.
   */
  function stopBgm({seconds, signal}: {seconds?: unknown; signal?: AbortSignal} = {}) {
    if (disposed) throw platformError('Crossfade platform is disposed');
    currentBgmTransition?.finish('replaced');
    currentBgmTransition = null;
    const playing = currentVoice;
    if (!playing) return Promise.resolve();
    const duration = fadeSeconds(seconds);
    currentVoice = null;
    if (duration <= 0) {
      playing.voice.stop();
      return Promise.resolve();
    }
    const from = playing.gain;
    const operation = timeline(
      duration * 1000,
      (progress) => {
        playing.voice.setGain(from * (1 - progress));
      },
      () => {
        playing.voice.stop();
        if (currentBgmTransition === operation) currentBgmTransition = null;
      },
    );
    currentBgmTransition = operation;
    if (signal?.aborted) {
      operation.finish();
      const error = new Error('DSL 4.0 BGM stop was cancelled');
      error.name = 'AbortError';
      return Promise.reject(error);
    }
    return operation.start();
  }

  /**
   * Change the volume of the BGM that is playing now. With no BGM playing this is a no-op: the
   * runtime owns no persistent BGM channel in 4.0, so there is nothing to remember the level on.
   */
  function setBgmVolume({
    volume,
    seconds,
    signal,
  }: {
    volume: unknown;
    seconds?: unknown;
    signal?: AbortSignal;
  }) {
    if (disposed) throw platformError('Crossfade platform is disposed');
    const target = bgmGain(volume);
    const duration = fadeSeconds(seconds);
    const playing = currentVoice;
    if (!playing) return Promise.resolve();
    playing.targetGain = target;
    if (duration <= 0) {
      currentBgmTransition?.finish('replaced');
      currentBgmTransition = null;
      playing.voice.setGain(target);
      playing.gain = target;
      return Promise.resolve();
    }
    currentBgmTransition?.finish('replaced');
    currentBgmTransition = null;
    const from = playing.gain;
    const operation = timeline(
      duration * 1000,
      (progress) => {
        const next = from + (target - from) * progress;
        playing.voice.setGain(next);
        playing.gain = next;
      },
      () => {
        playing.voice.setGain(target);
        playing.gain = target;
        if (currentBgmTransition === operation) currentBgmTransition = null;
      },
    );
    currentBgmTransition = operation;
    if (signal?.aborted) {
      operation.finish();
      const error = new Error('DSL 4.0 BGM volume change was cancelled');
      error.name = 'AbortError';
      return Promise.reject(error);
    }
    return operation.start();
  }

  return Object.freeze({
    crossfadeStage(
      apply: () => unknown | Promise<unknown>,
      transition: Dsl4CrossfadeTransition,
      signal?: AbortSignal,
    ) {
      const stage = runtimeHost.getStageTarget() as Dsl4TurboWarpTarget | null | undefined;
      if (!stage) throw platformError('The Stage target is unavailable');
      return crossfadeDrawable(stage, apply, transition, signal);
    },
    crossfadeActorSkin(
      target: Dsl4TurboWarpTarget,
      apply: () => unknown | Promise<unknown>,
      transition: Dsl4CrossfadeTransition,
      signal?: AbortSignal,
    ) {
      return crossfadeDrawable(target, apply, transition, signal);
    },
    createSceneCrossfade,
    replaceBgm,
    stopBgm,
    setBgmVolume,
    /** The BGM a save restarts: its asset and author-facing volume, or null when none plays. */
    captureBgm() {
      return currentVoice === null
        ? null
        : {asset: currentVoice.assetId, volume: Math.round(currentVoice.targetGain * 10_000) / 100};
    },
    /** Stop whatever BGM plays now, including a fade in progress, and start the saved one over. */
    async restoreBgm(state: Readonly<{asset: string; volume: number}> | null) {
      if (disposed) throw platformError('Crossfade platform is disposed');
      currentBgmTransition?.finish('replaced');
      currentBgmTransition = null;
      const playing = currentVoice;
      currentVoice = null;
      playing?.voice.stop();
      if (state !== null)
        await replaceBgm(state.asset, {effect: 'cut'} as Dsl4CrossfadeTransition, {
          restart: true,
          volume: state.volume,
        });
    },
    finishAll() {
      const errors = [];
      for (const operation of [...active]) {
        try {
          operation.finish();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, 'Crossfade cleanup failed');
    },
    dispose() {
      if (disposed) return;
      this.finishAll();
      currentVoice?.voice.stop();
      currentVoice = null;
      disposed = true;
    },
  });
}
