import {applyDsl4MoveEasing, isDsl4MoveEasing, type Dsl4MoveEasing} from '../move-easing.js';
import {normalizeDsl4Direction} from '../rotation-style.js';

export const dsl4ActorAnimationProperties = [
  'x',
  'y',
  'scale',
  'direction',
  'transparency',
] as const;
export type Dsl4ActorAnimationProperty = (typeof dsl4ActorAnimationProperties)[number];
type Values = Partial<Record<Dsl4ActorAnimationProperty, number>>;
type Animation = Readonly<{
  to: Readonly<Values>;
  seconds: number;
  easing: Dsl4MoveEasing;
  delaySeconds: number;
  repeat: number;
  alternate: boolean;
  background: boolean;
}>;

export const dsl4ActorAnimationLimits = Object.freeze({
  seconds: 60,
  delaySeconds: 60,
  repeat: 20,
  totalSeconds: 300,
});

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeDsl4ActorAnimation(value: unknown): Animation {
  const fields = ['to', 'seconds', 'easing', 'delaySeconds', 'repeat', 'alternate', 'background'];
  if (
    !record(value) ||
    Object.keys(value).some((key) => !fields.includes(key)) ||
    !record(value.to)
  ) {
    throw new TypeError('animate must provide to and seconds, and only known animation options');
  }
  const to: Values = {};
  for (const [key, raw] of Object.entries(value.to)) {
    if (
      !dsl4ActorAnimationProperties.some((property) => property === key) ||
      typeof raw !== 'number' ||
      !Number.isFinite(raw) ||
      (key === 'scale' && raw <= 0) ||
      (key === 'transparency' && (raw < 0 || raw > 100))
    ) {
      throw new TypeError(`animate.to.${key} is not a valid animation property value`);
    }
    to[key as Dsl4ActorAnimationProperty] = key === 'direction' ? normalizeDsl4Direction(raw) : raw;
  }
  if (Object.keys(to).length === 0) throw new TypeError('animate.to must provide a property');
  const number = (key: 'seconds' | 'delaySeconds' | 'repeat', fallback?: number) => {
    const raw = Object.hasOwn(value, key) ? value[key] : fallback;
    if (
      typeof raw !== 'number' ||
      !Number.isFinite(raw) ||
      raw < 0 ||
      raw > dsl4ActorAnimationLimits[key] ||
      (key === 'repeat' && !Number.isInteger(raw))
    ) {
      throw new TypeError(`animate.${key} is out of range`);
    }
    return raw;
  };
  const boolean = (key: 'alternate' | 'background') => {
    const raw = Object.hasOwn(value, key) ? value[key] : false;
    if (typeof raw !== 'boolean') throw new TypeError(`animate.${key} must be a boolean`);
    return raw;
  };
  const seconds = number('seconds');
  const delaySeconds = number('delaySeconds', 0);
  const repeat = number('repeat', 0);
  if (seconds * (repeat + 1) + delaySeconds > dsl4ActorAnimationLimits.totalSeconds) {
    throw new TypeError('animate total time is out of range');
  }
  const easing = Object.hasOwn(value, 'easing') ? value.easing : 'linear';
  if (!isDsl4MoveEasing(easing)) throw new TypeError('animate.easing is not supported');
  return Object.freeze({
    to: Object.freeze(to),
    seconds,
    easing,
    delaySeconds,
    repeat,
    alternate: boolean('alternate'),
    background: boolean('background'),
  });
}

type Scheduler = {
  now(): number;
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
};
type Owner = {lose(property: Dsl4ActorAnimationProperty): void; finish(): void; cancel(): void};
type ActorProperties = {
  read(property: Dsl4ActorAnimationProperty): number;
  write(values: Values): void;
};

/** Last-started wins per property. Replaced tracks never write a terminal value. */
export function createDsl4ActorAnimationTimeline(scheduler: Scheduler, frameMilliseconds: number) {
  const claims = new Map<object, Map<Dsl4ActorAnimationProperty, Owner>>();
  const active = new Set<Owner>();
  function release(target: object, properties: readonly Dsl4ActorAnimationProperty[]) {
    for (const property of properties) claims.get(target)?.get(property)?.lose(property);
  }

  function create(target: object, actor: ActorProperties, spec: Animation) {
    const properties = dsl4ActorAnimationProperties.filter(
      (property) => spec.to[property] !== undefined,
    );
    const duration = spec.seconds * 1000;
    const delay = spec.delaySeconds * 1000;
    const total = duration * (spec.repeat + 1);
    const startValues: Values = {};
    const owned = new Set<Dsl4ActorAnimationProperty>();
    let started = false;
    let settled = false;
    let timer: {handle: unknown} | undefined;
    let resolve: () => void;
    let reject: (error: unknown) => void;
    const promise = new Promise<void>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    // A background action can fail after the caller has already resumed.
    void promise.catch(() => {});
    const clock = () => {
      const now = scheduler.now();
      if (!Number.isFinite(now)) throw new TypeError('Actor animation clock must be finite');
      return now;
    };
    const onSettle = () => {
      settled = true;
      active.delete(owner);
      if (timer) {
        scheduler.clearTimeout(timer.handle);
        timer = undefined;
      }
      const owners = claims.get(target);
      for (const property of owned) {
        if (owners?.get(property) === owner) owners.delete(property);
      }
      if (owners?.size === 0) claims.delete(target);
      owned.clear();
    };
    const fail = (error: unknown) => {
      if (settled) return;
      onSettle();
      reject(error);
    };
    const apply = (progress: number) => {
      const values: Values = {};
      for (const property of owned) {
        const from = startValues[property]!;
        const to = spec.to[property]!;
        if (progress === 0 || progress === 1) values[property] = progress === 0 ? from : to;
        else if (property === 'direction') {
          const delta = ((((to - from + 180) % 360) + 360) % 360) - 180;
          values[property] = normalizeDsl4Direction(from + delta * progress);
        } else values[property] = from * (1 - progress) + to * progress;
      }
      if (owned.size) actor.write(values);
    };
    const owner: Owner = {
      cancel() {
        if (!started || settled) return;
        onSettle();
        resolve();
      },
      lose(property) {
        owned.delete(property);
        const owners = claims.get(target);
        if (owners?.get(property) === owner) owners.delete(property);
        if (owned.size !== 0) return;
        onSettle();
        resolve();
      },
      finish() {
        if (!started || settled) return;
        try {
          apply(spec.alternate && spec.repeat % 2 === 1 ? 0 : 1);
        } catch (error) {
          fail(error);
          throw error;
        }
        onSettle();
        resolve();
      },
    };
    const start = () => {
      if (started) throw new TypeError('animate operation can only start once');
      started = true;
      try {
        const origin = clock();
        for (const property of properties) startValues[property] = actor.read(property);
        release(target, properties);
        const owners = claims.get(target) ?? new Map();
        claims.set(target, owners);
        for (const property of properties) {
          owned.add(property);
          owners.set(property, owner);
        }
        active.add(owner);
        const schedule = (next: number) => {
          timer = {handle: scheduler.setTimeout(tick, next)};
        };
        const tick = () => {
          timer = undefined;
          if (settled) return;
          try {
            const elapsed = Math.max(0, clock() - origin);
            if (elapsed < delay) return schedule(delay - elapsed);
            const played = elapsed - delay;
            if (played >= total) return owner.finish();
            const traversal = Math.floor(played / duration);
            const fraction = (played - traversal * duration) / duration;
            const backwards = spec.alternate && traversal % 2 === 1;
            apply(applyDsl4MoveEasing(spec.easing, backwards ? 1 - fraction : fraction));
            if (!settled) schedule(Math.min(frameMilliseconds, total - played));
          } catch (error) {
            fail(error);
          }
        };
        tick();
      } catch (error) {
        fail(error);
      }
      return promise;
    };
    return Object.freeze({
      start,
      startBackground() {
        void start();
      },
      finish: owner.finish,
    });
  }

  return {
    create,
    release,
    cancelAll() {
      for (const owner of [...active]) owner.cancel();
    },
    finishAll() {
      const errors: unknown[] = [];
      for (const owner of [...active]) {
        try {
          owner.finish();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, 'Actor animation cleanup failed');
    },
  };
}
