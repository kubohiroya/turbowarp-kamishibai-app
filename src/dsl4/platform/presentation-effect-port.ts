export type Dsl4PresentationScope = 'stage' | 'presentation';
export type Dsl4PresentationEffect =
  | {effect: 'shake'; params: {amplitude: number; axis?: 'x' | 'y' | 'both'; cycles?: number}}
  | {effect: 'zoom'; params: {scale: number}}
  | {effect: 'wipe'; params: {direction?: 'left' | 'right' | 'up' | 'down'; color?: string}}
  | {effect: 'fade'; params: {color?: string; opacity?: number}};
export type Dsl4PresentationEffectRequest = Readonly<
  {scope: Dsl4PresentationScope; seconds: number} & Dsl4PresentationEffect
>;

interface AnimationTarget {
  animate(
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ): Pick<Animation, 'cancel' | 'finished'>;
}

export interface Dsl4PresentationEffectSurface {
  /** The host deliberately selects this target; never look for a DOM ancestor implicitly. */
  readonly target: AnimationTarget;
  /** An inert, clipped layer owned by the host for exactly the returned lifetime. */
  createOverlay?(color: string): {readonly target: AnimationTarget; dispose(): void};
}

type Channel = 'translate' | 'scale' | 'mask';
type PaintedEffect = {channel: Channel; frames: Keyframe[]; color?: string};

function fail(code: string, message: string) {
  return Object.assign(new Error(message), {code});
}

function abortError() {
  return new DOMException('Presentation effect cancelled', 'AbortError');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function only(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function invalid(field: string): never {
  throw fail('K4-PRESENTATION-EFFECT-001', `Invalid presentation effect ${field}`);
}

function finite(value: unknown, lower: number, upper: number, field: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < lower || value > upper) {
    return invalid(field);
  }
  return value;
}

function color(value: unknown) {
  if (value === undefined) return '#000000';
  if (typeof value !== 'string' || value.length !== 7 || !/^#[0-9a-f]{6}$/iu.test(value))
    return invalid('color');
  return value;
}

// The covered rectangle moves in the named direction, then leaves on the opposite edge.
const wipeEdges = {
  left: ['inset(0 0 0 100%)', 'inset(0 100% 0 0)'],
  right: ['inset(0 100% 0 0)', 'inset(0 0 0 100%)'],
  up: ['inset(100% 0 0 0)', 'inset(0 0 100% 0)'],
  down: ['inset(0 0 100% 0)', 'inset(100% 0 0 0)'],
} as const;

function paint(effect: unknown, params: Record<string, unknown>): PaintedEffect {
  switch (effect) {
    case 'shake': {
      if (!only(params, ['amplitude', 'axis', 'cycles'])) return invalid('shake parameters');
      const amplitude = finite(params.amplitude, 0, 64, 'amplitude');
      const cycles = params.cycles === undefined ? 4 : finite(params.cycles, 1, 12, 'cycles');
      if (!Number.isInteger(cycles)) return invalid('cycles');
      const axis = params.axis === undefined ? 'x' : params.axis;
      if (axis !== 'x' && axis !== 'y' && axis !== 'both') return invalid('axis');
      const positions = [0, 1, 0, -1];
      return {
        channel: 'translate',
        frames: Array.from({length: cycles * 4 + 1}, (_, index) => {
          const offset = index / (cycles * 4);
          const movement = (amplitude * (1 - offset) * (positions[index % 4] ?? 0)).toFixed(3);
          return {
            offset,
            translate: `${axis === 'y' ? 0 : movement}px ${axis === 'x' ? 0 : movement}px`,
          };
        }),
      };
    }
    case 'zoom':
      if (!only(params, ['scale'])) return invalid('zoom parameters');
      return {
        channel: 'scale',
        frames: [{scale: '1'}, {scale: String(finite(params.scale, 1, 3, 'scale'))}, {scale: '1'}],
      };
    case 'wipe': {
      if (!only(params, ['direction', 'color'])) return invalid('wipe parameters');
      const direction = params.direction === undefined ? 'left' : params.direction;
      if (typeof direction !== 'string' || !Object.hasOwn(wipeEdges, direction)) {
        return invalid('direction');
      }
      const [start, end] = wipeEdges[direction as keyof typeof wipeEdges];
      return {
        channel: 'mask',
        color: color(params.color),
        frames: [{clipPath: start}, {clipPath: 'inset(0)'}, {clipPath: end}],
      };
    }
    case 'fade':
      if (!only(params, ['color', 'opacity'])) return invalid('fade parameters');
      return {
        channel: 'mask',
        color: color(params.color),
        frames: [
          {opacity: 0},
          {opacity: params.opacity === undefined ? 1 : finite(params.opacity, 0, 1, 'opacity')},
          {opacity: 0},
        ],
      };
    default:
      return invalid('name');
  }
}

type Finish = (error?: unknown) => void;

/**
 * A neutral-to-neutral presentation port. It does not capture frames, mutate inline styles, move
 * app UI, or own a camera. The host owns the exact scope surfaces and their clipping, backdrop,
 * stacking order and input geometry. Shake and zoom may run together on independent WAAPI
 * properties; a new effect on an occupied scope/channel removes the preceding effect.
 */
export function createDsl4PresentationEffectPort(
  surfaces: Readonly<Partial<Record<Dsl4PresentationScope, Dsl4PresentationEffectSurface>>>,
) {
  const active: Record<Dsl4PresentationScope, Map<Channel, Finish>> = {
    stage: new Map(),
    presentation: new Map(),
  };
  let disposed = false;
  function finishAll() {
    for (const scope of Object.values(active)) for (const finish of [...scope.values()]) finish();
  }

  return Object.freeze({
    async presentationEffect(input: unknown, context: Readonly<{signal: AbortSignal}>) {
      if (disposed)
        throw fail('K4-PRESENTATION-EFFECT-003', 'Presentation effect port is disposed');
      if (
        !isRecord(input) ||
        !only(input, ['scope', 'effect', 'seconds', 'params']) ||
        (input.scope !== 'stage' && input.scope !== 'presentation') ||
        !isRecord(input.params)
      ) {
        return invalid('request');
      }
      const {signal} = context;
      if (signal.aborted) throw abortError();
      const seconds = finite(input.seconds, 0, 30, 'seconds');
      const effect = paint(input.effect, input.params);
      const channel = active[input.scope];
      const surface = surfaces[input.scope];
      if (
        !surface ||
        (effect.channel === 'mask'
          ? typeof surface.createOverlay !== 'function'
          : typeof surface.target.animate !== 'function')
      ) {
        throw fail(
          'K4-PRESENTATION-EFFECT-002',
          `Presentation scope "${input.scope}" is unavailable`,
        );
      }
      channel.get(effect.channel)?.();
      if (seconds === 0) return;

      return new Promise<void>((resolve, reject) => {
        let settled = false;
        let layer:
          ReturnType<NonNullable<Dsl4PresentationEffectSurface['createOverlay']>> | undefined;
        let animation: ReturnType<AnimationTarget['animate']> | undefined;
        const onAbort = () => finish(abortError());
        const finish: Finish = (error) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', onAbort);
          if (channel.get(effect.channel) === finish) channel.delete(effect.channel);
          const errors: unknown[] = error === undefined ? [] : [error];
          for (const cleanup of [() => animation?.cancel(), () => layer?.dispose()]) {
            try {
              cleanup();
            } catch (failure) {
              errors.push(failure);
            }
          }
          if (errors.length === 0) resolve();
          else reject(errors.length === 1 ? errors[0] : new AggregateError(errors));
        };
        channel.set(effect.channel, finish);
        try {
          if (effect.color !== undefined) {
            const ownedLayer = surface.createOverlay!(effect.color);
            if (settled) {
              ownedLayer.dispose();
              return;
            }
            layer = ownedLayer;
          }
          // Keep neutral endpoints around the active interval until cleanup cancels the animation.
          const started = (layer?.target ?? surface.target).animate(effect.frames, {
            duration: seconds * 1000,
            fill: 'both',
            composite: effect.channel === 'mask' ? 'replace' : 'add',
          });
          animation = started;
          void started.finished.then(
            () => finish(),
            (error: unknown) => finish(error),
          );
          if (settled) {
            started.cancel();
            return;
          }
          signal.addEventListener('abort', onAbort, {once: true});
          if (signal.aborted) onAbort();
        } catch (error) {
          finish(error);
        }
      });
    },
    finishAll,
    dispose() {
      if (disposed) return;
      disposed = true;
      finishAll();
    },
  });
}
