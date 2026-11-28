import type {AssetManagerAudioPlayback} from '@kubohiroya/turbowarp-asset-cache/composition';
import {validateCompositionMethods} from './composition-contract.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function portError(code: string, message: string) {
  const error = new Error(message);
  Object.defineProperty(error, 'code', {value: code});
  return error;
}

function abortError(cause?: unknown) {
  const error = new Error('DSL 4.0 media action was cancelled');
  error.name = 'AbortError';
  if (cause !== undefined) Object.defineProperty(error, 'cause', {value: cause});
  return error;
}

function createDefaultScheduler() {
  const schedule = (callback: () => void, milliseconds: number) =>
    setTimeout(callback, milliseconds);
  const cancel = (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>);
  return Object.freeze({
    setTimeout: schedule,
    clearTimeout: cancel,
  });
}

function validateScheduler(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.setTimeout !== 'function' ||
    typeof value.clearTimeout !== 'function'
  ) {
    throw new TypeError('Media action scheduler must provide setTimeout and clearTimeout');
  }
  return value as unknown as {
    setTimeout: (callback: () => void, milliseconds: number) => unknown;
    clearTimeout: (handle: unknown) => void;
  };
}

function validateComposition(value: unknown) {
  const methods = [
    'isRegistered',
    'getMimeType',
    'applyToStage',
    'applyToTarget',
    'playSound',
    'stopSound',
  ] as const;
  return validateCompositionMethods<(typeof methods)[number], 'createAudioPlayback'>(
    value,
    'Asset Manager composition',
    methods,
  );
}

function validateTransitionHost(value: unknown) {
  if (value === undefined) return null;
  const methods = [
    'crossfadeStage',
    'crossfadeActorSkin',
    'replaceBgm',
    'stopBgm',
    'setBgmVolume',
    'finishAll',
  ] as const;
  return validateCompositionMethods(value, 'Media transition host', methods);
}

function validatePayload<Key extends string>(
  value: unknown,
  keys: readonly Key[],
  command: string,
): Record<Key, string> {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  ) {
    throw portError(
      'K4-MEDIA-PORT-001',
      `${command} payload must provide exactly ${keys.join(', ')}`,
    );
  }
  const candidate = value as Record<string, unknown>;
  for (const key of keys) {
    const entry = candidate[key];
    if (typeof entry !== 'string' || entry.length === 0) {
      throw portError('K4-MEDIA-PORT-001', `${command}.${key} must be a non-empty string`);
    }
  }
  return value as unknown as Record<Key, string>;
}

function validateContext(value: unknown) {
  if (!isRecord(value) || !isRecord(value.signal)) {
    throw portError('K4-MEDIA-PORT-001', 'media action context must provide an AbortSignal');
  }
  const signal = value.signal;
  if (
    typeof signal.aborted !== 'boolean' ||
    typeof signal.addEventListener !== 'function' ||
    typeof signal.removeEventListener !== 'function'
  ) {
    throw portError('K4-MEDIA-PORT-001', 'media action signal is invalid');
  }
  return signal as unknown as AbortSignal;
}

/**
 * Race one platform operation with action cancellation and contain stale settlement.
 */
async function runCancellable<T>(
  start: () => T | Promise<T>,
  signal: AbortSignal,
  cancel?: (() => unknown) | undefined,
) {
  if (signal.aborted) throw abortError();
  let rejectAbort: (error: Error) => void = () => {};
  let cancelled = false;
  const aborted = new Promise((_resolve, reject) => {
    rejectAbort = reject;
  });
  const handleAbort = () => {
    if (cancelled) return;
    cancelled = true;
    let cleanupError;
    try {
      cancel?.();
    } catch (error) {
      cleanupError = error;
    }
    rejectAbort(abortError(cleanupError));
  };
  signal.addEventListener('abort', handleAbort, {once: true});
  if (signal.aborted) {
    signal.removeEventListener('abort', handleAbort);
    throw abortError();
  }

  let operation;
  try {
    operation = Promise.resolve(start());
  } catch (error) {
    signal.removeEventListener('abort', handleAbort);
    throw error;
  }
  void operation.catch(() => {});
  try {
    return await (Promise.race([operation, aborted]) as Promise<T>);
  } finally {
    signal.removeEventListener('abort', handleAbort);
  }
}

/** Adapt DSL 4.0 media actions to one app-shell-scoped Asset Manager composition. */
export function createDsl4MediaActionPort(options: {
  composition: unknown;
  resolveActor: (
    actorId: string,
    context: Readonly<Record<string, unknown>>,
  ) => unknown | Promise<unknown>;
  setActorScale?: (
    actor: unknown,
    scale: number,
    context: Readonly<Record<string, unknown>>,
  ) => unknown | Promise<unknown>;
  scheduler?: unknown;
  onBackgroundError?: (error: unknown) => unknown;
  transitionHost?: unknown;
}) {
  if (!isRecord(options)) throw new TypeError('media action port options must be an object');
  const composition = validateComposition(options.composition);
  if (typeof options.resolveActor !== 'function') {
    throw new TypeError('resolveActor must be a function');
  }
  const resolveActor = options.resolveActor;
  if (options.setActorScale !== undefined && typeof options.setActorScale !== 'function') {
    throw new TypeError('setActorScale must be a function');
  }
  const setActorScale = options.setActorScale;
  if (options.onBackgroundError !== undefined && typeof options.onBackgroundError !== 'function') {
    throw new TypeError('onBackgroundError must be a function');
  }
  const onBackgroundError = options.onBackgroundError ?? (() => {});
  const scheduler = validateScheduler(options.scheduler ?? createDefaultScheduler());
  const transitionHost = validateTransitionHost(options.transitionHost);
  type LoopStep = Readonly<{skin: string; seconds: number}>;
  const actorLoops: Map<string, {timer?: unknown; active: boolean; steps?: readonly LoopStep[]}> =
    new Map();
  const actorSkinQueues: Map<string, Promise<unknown>> = new Map();

  function enqueueActorSkin(target: string, apply: () => unknown | Promise<unknown>) {
    const previous = actorSkinQueues.get(target) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(apply);
    actorSkinQueues.set(target, operation);
    void operation.then(
      () => {
        if (actorSkinQueues.get(target) === operation) actorSkinQueues.delete(target);
      },
      () => {
        if (actorSkinQueues.get(target) === operation) actorSkinQueues.delete(target);
      },
    );
    return operation;
  }

  function waitForActorSkin(target: string) {
    const operation = actorSkinQueues.get(target);
    return operation === undefined
      ? Promise.resolve()
      : operation.then(
          () => {},
          () => {},
        );
  }

  function stopLoop(target: string, expectedLoop?: {timer?: unknown; active: boolean}) {
    const loop = actorLoops.get(target);
    if (expectedLoop !== undefined && loop !== expectedLoop) return waitForActorSkin(target);
    if (!loop) return waitForActorSkin(target);
    loop.active = false;
    if (loop.timer !== undefined) scheduler.clearTimeout(loop.timer);
    if (actorLoops.get(target) === loop) actorLoops.delete(target);
    return waitForActorSkin(target);
  }

  function stopAllLoops() {
    return Promise.all([...actorLoops.keys()].map((target) => stopLoop(target))).then(() => {});
  }

  function requireAsset(assetId: string, kind: 'image' | 'audio') {
    if (!composition.isRegistered(assetId)) {
      throw portError('K4-MEDIA-PORT-002', `Media asset is not registered: ${assetId}`);
    }
    const mimeType = composition.getMimeType(assetId);
    if (typeof mimeType !== 'string' || !mimeType.startsWith(`${kind}/`)) {
      throw portError('K4-MEDIA-PORT-002', `Media asset ${assetId} must have ${kind} MIME type`);
    }
  }

  function validateActor(value: unknown, actorId: string) {
    if (
      !isRecord(value) ||
      typeof value.id !== 'string' ||
      value.id.length === 0 ||
      value.isStage !== false
    ) {
      throw portError('K4-MEDIA-PORT-003', `Actor target is unavailable: ${actorId}`);
    }
    return value as unknown as Readonly<{id: string; isStage: false}>;
  }

  function validateLoopSteps(value: unknown) {
    if (!Array.isArray(value) || value.length === 0) {
      throw portError('K4-MEDIA-PORT-001', 'loop payload must provide target and non-empty steps');
    }
    const steps = value.map((step) => {
      if (
        !isRecord(step) ||
        Object.keys(step).length !== 2 ||
        typeof step.skin !== 'string' ||
        step.skin.length === 0 ||
        typeof step.seconds !== 'number' ||
        !Number.isFinite(step.seconds) ||
        step.seconds < 0
      ) {
        throw portError(
          'K4-MEDIA-PORT-001',
          'loop steps must provide a non-empty skin and non-negative finite seconds',
        );
      }
      requireAsset(step.skin, 'image');
      return Object.freeze({skin: step.skin, seconds: step.seconds});
    });
    if (!steps.some(({seconds}) => seconds > 0)) {
      throw portError('K4-MEDIA-PORT-001', 'loop requires at least one positive duration');
    }
    return Object.freeze(steps);
  }

  function validateLoops(input: unknown): Readonly<Record<string, readonly LoopStep[]>> {
    if (!isRecord(input) || Object.keys(input).length > 512) {
      throw portError('K4-MEDIA-PORT-001', 'Saved loops must be an object keyed by actor');
    }
    return Object.fromEntries(
      Object.entries(input).map(([target, steps]) => {
        if (!target) throw portError('K4-MEDIA-PORT-001', 'Saved loop target is empty');
        return [target, validateLoopSteps(steps)];
      }),
    );
  }

  async function startLoop(target: string, steps: readonly LoopStep[], context: unknown) {
    const signal = validateContext(context);
    if (signal.aborted) throw abortError();
    const actionContext = context as unknown as Readonly<Record<string, unknown>>;
    const actor = validateActor(
      await runCancellable(() => resolveActor(target, actionContext), signal),
      target,
    );
    await runCancellable(() => stopLoop(target), signal);
    const state: {timer?: unknown; active: boolean; steps?: readonly LoopStep[]} = {
      active: true,
      steps,
    };
    actorLoops.set(target, state);

    async function applyStep(index: number) {
      if (!state.active) return;
      // The index is taken modulo the step count, so it always resolves.
      const step = steps[index];
      if (!step) return;
      await enqueueActorSkin(target, () => composition.applyToTarget(step.skin, actor));
      if (!state.active) return;
      state.timer = scheduler.setTimeout(() => {
        state.timer = undefined;
        void applyStep((index + 1) % steps.length).catch((error) => {
          void stopLoop(target, state);
          onBackgroundError(error);
        });
      }, step.seconds * 1000);
    }

    try {
      await runCancellable(
        () => applyStep(0),
        signal,
        () => void stopLoop(target, state),
      );
    } catch (error) {
      await stopLoop(target, state);
      throw error;
    }
  }

  return Object.freeze({
    stage(payload: unknown, context: unknown) {
      if (!isRecord(payload) || !Object.hasOwn(payload, 'backdrop')) {
        throw portError('K4-MEDIA-PORT-001', 'stage payload must provide backdrop');
      }
      const {backdrop} = validatePayload({backdrop: payload.backdrop}, ['backdrop'], 'stage');
      const signal = validateContext(context);
      if (signal.aborted) throw abortError();
      requireAsset(backdrop, 'image');
      if (isRecord(payload.transition) && payload.transition.effect === 'crossfade') {
        if (!transitionHost) {
          throw portError('K4-MEDIA-PORT-004', 'Backdrop crossfade is unavailable');
        }
        return transitionHost.crossfadeStage(
          () => composition.applyToStage(backdrop),
          payload.transition,
          signal,
        );
      }
      return runCancellable(() => composition.applyToStage(backdrop), signal);
    },

    bgm(payload: unknown, context: unknown) {
      if (!isRecord(payload) || !Object.hasOwn(payload, 'sound')) {
        throw portError('K4-MEDIA-PORT-001', 'bgm payload must provide sound');
      }
      const {sound} = validatePayload({sound: payload.sound}, ['sound'], 'bgm');
      const signal = validateContext(context);
      if (signal.aborted) throw abortError();
      requireAsset(sound, 'audio');
      if (payload.managed === true) {
        if (!transitionHost) {
          throw portError('K4-MEDIA-PORT-004', 'Managed BGM playback is unavailable');
        }
        return runCancellable(
          () =>
            transitionHost.replaceBgm(sound, payload.transition, {
              restart: payload.restart === true,
              ...(payload.volume === undefined ? {} : {volume: payload.volume}),
              signal,
            }),
          signal,
        );
      }
      if (payload.volume !== undefined) {
        throw portError('K4-MEDIA-PORT-004', 'bgm volume requires managed BGM playback');
      }
      return runCancellable(
        () => composition.playSound(sound),
        signal,
        () => composition.stopSound(sound),
      );
    },

    stopBgm(payload: unknown, context: unknown) {
      if (payload !== undefined && payload !== null && !isRecord(payload)) {
        throw portError('K4-MEDIA-PORT-001', 'stopBgm payload must be an object');
      }
      const signal = validateContext(context);
      if (signal.aborted) throw abortError();
      if (!transitionHost) {
        throw portError('K4-MEDIA-PORT-004', 'Managed BGM playback is unavailable');
      }
      const seconds = isRecord(payload) ? payload.seconds : undefined;
      return runCancellable(
        () => transitionHost.stopBgm({...(seconds === undefined ? {} : {seconds}), signal}),
        signal,
      );
    },

    setBgmVolume(payload: unknown, context: unknown) {
      if (!isRecord(payload) || !Object.hasOwn(payload, 'volume')) {
        throw portError('K4-MEDIA-PORT-001', 'setBgmVolume payload must provide volume');
      }
      const signal = validateContext(context);
      if (signal.aborted) throw abortError();
      if (!transitionHost) {
        throw portError('K4-MEDIA-PORT-004', 'Managed BGM playback is unavailable');
      }
      return runCancellable(
        () =>
          transitionHost.setBgmVolume({
            volume: payload.volume,
            ...(payload.seconds === undefined ? {} : {seconds: payload.seconds}),
            signal,
          }),
        signal,
      );
    },

    sound(payload: unknown, context: unknown) {
      const {sound} = validatePayload(payload, ['sound'], 'sound');
      const signal = validateContext(context);
      if (signal.aborted) throw abortError();
      requireAsset(sound, 'audio');
      if (typeof composition.createAudioPlayback === 'function') {
        let playback: AssetManagerAudioPlayback | null = null;
        return runCancellable(
          async () => {
            const prepared = (await composition.createAudioPlayback?.({
              asset: sound,
            })) as AssetManagerAudioPlayback;
            playback = prepared;
            if (signal.aborted) {
              prepared.dispose();
              throw abortError();
            }
            try {
              await prepared.play({signal});
              await prepared.ended;
            } finally {
              prepared.dispose();
            }
          },
          signal,
          () => playback?.dispose(),
        );
      }
      return runCancellable(
        () => composition.playSound(sound, {untilDone: true}),
        signal,
        () => composition.stopSound(sound),
      );
    },

    async setSkin(payload: unknown, context: unknown) {
      if (
        !isRecord(payload) ||
        Object.keys(payload).some(
          (key) => !['target', 'skin', 'scale', 'transition'].includes(key),
        ) ||
        !Object.hasOwn(payload, 'target') ||
        !Object.hasOwn(payload, 'skin')
      ) {
        throw portError(
          'K4-MEDIA-PORT-001',
          'setSkin payload must provide target, skin, and only optional scale or transition',
        );
      }
      const target = payload.target;
      const skin = payload.skin;
      if (typeof target !== 'string' || !target || typeof skin !== 'string' || !skin) {
        throw portError('K4-MEDIA-PORT-001', 'setSkin target and skin must be non-empty strings');
      }
      const scale = payload.scale;
      if (
        scale !== undefined &&
        (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0)
      ) {
        throw portError('K4-MEDIA-PORT-001', 'setSkin.scale must be a positive finite number');
      }
      if (scale !== undefined && !setActorScale) {
        throw portError('K4-MEDIA-PORT-001', 'setSkin.scale requires an actor scale adapter');
      }
      const signal = validateContext(context);
      if (signal.aborted) throw abortError();
      requireAsset(skin, 'image');
      const actionContext = context as unknown as Readonly<Record<string, unknown>>;
      const actor = validateActor(
        await runCancellable(() => resolveActor(target, actionContext), signal),
        target,
      );
      await runCancellable(() => stopLoop(target), signal);
      const applySkin = () =>
        enqueueActorSkin(target, () => composition.applyToTarget(skin, actor));
      if (isRecord(payload.transition) && payload.transition.effect === 'crossfade') {
        if (!transitionHost) {
          throw portError('K4-MEDIA-PORT-004', 'Actor skin crossfade is unavailable');
        }
        await transitionHost.crossfadeActorSkin(actor, applySkin, payload.transition, signal);
      } else {
        await runCancellable(applySkin, signal);
      }
      if (scale !== undefined) {
        await runCancellable(
          () =>
            (
              setActorScale as (
                actor: unknown,
                scale: number,
                context: Readonly<Record<string, unknown>>,
              ) => unknown | Promise<unknown>
            )(actor, scale, actionContext),
          signal,
        );
      }
    },

    async loop(payload: unknown, context: unknown) {
      if (
        !isRecord(payload) ||
        Object.keys(payload).length !== 2 ||
        !Object.hasOwn(payload, 'target') ||
        !Object.hasOwn(payload, 'steps') ||
        typeof payload.target !== 'string' ||
        payload.target.length === 0 ||
        !Array.isArray(payload.steps) ||
        payload.steps.length === 0
      ) {
        throw portError(
          'K4-MEDIA-PORT-001',
          'loop payload must provide target and non-empty steps',
        );
      }
      const target = payload.target;
      const steps = validateLoopSteps(payload.steps);
      return startLoop(target, steps, context);
    },

    stopActorLoop: stopLoop,
    /** The running loops as data; a save restarts each from its first step. */
    captureLoops() {
      return Object.fromEntries(
        [...actorLoops]
          .filter(([, loop]) => loop.active && loop.steps)
          .map(([target, loop]) => [target, loop.steps!.map((step) => ({...step}))]),
      );
    },
    validateLoops,
    /** Restart saved loops in the background, after the previous loops were stopped. */
    async restoreLoops(input: unknown) {
      const loops = validateLoops(input);
      await stopAllLoops();
      const signal = new AbortController().signal;
      for (const [target, steps] of Object.entries(loops)) await startLoop(target, steps, {signal});
    },
    stopAllLoops,
    finishTransitions(reason = 'finish') {
      return transitionHost?.finishAll(reason);
    },
    async dispose() {
      await stopAllLoops();
      await transitionHost?.finishAll('dispose');
    },
  });
}
