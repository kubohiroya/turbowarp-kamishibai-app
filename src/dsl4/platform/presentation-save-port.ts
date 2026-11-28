import type {Dsl4RestorePresentation} from '../save-presentation.js';
export type {Dsl4RestorePresentation} from '../save-presentation.js';
import type {Dsl4VideoActionPort} from './video-action-port.js';

interface Target {
  isStage?: boolean;
  x?: number;
  y?: number;
  size?: number;
  direction?: number;
  visible?: boolean;
  currentCostume?: number;
  sprite?: {costumes?: readonly {name?: string}[]};
  effects?: Record<string, number>;
  getLayerOrder?(): number | null;
  setCostume?(index: number): unknown;
  setXY?(x: number, y: number): unknown;
  setSize?(size: number): unknown;
  setDirection?(direction: number): unknown;
  setVisible?(visible: boolean): unknown;
  setEffect?(name: string, value: number): unknown;
  goToFront?(): unknown;
}
type State = Readonly<{
  target: string;
  x: number;
  y: number;
  size: number;
  direction: number;
  visible: boolean;
  costume: string | null;
  effects: Record<string, number>;
  layer: number;
}>;

/** Static actor/backdrop state is data; native media and render handles never enter the save. */
export function createDsl4PresentationSavePort({
  targets,
  video,
  bindings,
  media,
  finalizePrevious,
}: {
  targets: () => readonly {key: string; target: unknown}[];
  video: () => Dsl4VideoActionPort | null;
  finalizePrevious?: () => unknown | Promise<unknown>;
  bindings?: {
    capture(): unknown;
    validate(input: unknown): void;
    apply(input: unknown): Promise<void>;
  };
  /**
   * State that outlives its action (BGM, scene audio, text, costume loops). `prepare` refuses a
   * save it cannot restore before anything changes. `beforeTargets` and `afterTargets` run inside
   * the reversible commit around the target and binding restore; `start` runs after the previous
   * story's media was stopped, because starting sound is not something a rollback can take back.
   */
  media?: {
    capture(): unknown;
    prepare(input: unknown): Promise<{
      beforeTargets(): void;
      afterTargets(): Promise<void>;
      revert(): Promise<void>;
      start(): Promise<void>;
      dispose(): void;
    }>;
  };
}) {
  function captureTargets(): State[] {
    return targets().map(({key, target: input}, index) => {
      const target = input as Target;
      const costume = target.sprite?.costumes?.[target.currentCostume ?? 0]?.name ?? null;
      return {
        target: key,
        x: target.x ?? 0,
        y: target.y ?? 0,
        size: target.size ?? 100,
        direction: target.direction ?? 90,
        visible: target.visible ?? true,
        costume,
        effects: {...target.effects},
        layer: target.getLayerOrder?.() ?? index,
      };
    });
  }
  function validate(input: unknown): readonly State[] {
    if (!Array.isArray(input) || input.length > 512)
      throw new TypeError('Invalid saved presentation targets');
    const current = new Map(targets().map((entry) => [entry.key, entry.target as Target]));
    if (current.size !== input.length) throw new TypeError('Saved presentation target set differs');
    const seen = new Set<string>();
    return input.map((raw: unknown) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new TypeError('Invalid saved target');
      const value = raw as Record<string, unknown>;
      const expected = [
        'target',
        'x',
        'y',
        'size',
        'direction',
        'visible',
        'costume',
        'effects',
        'layer',
      ];
      if (
        Object.keys(value).length !== expected.length ||
        expected.some((key) => !Object.hasOwn(value, key))
      )
        throw new TypeError('Unknown saved target fields');
      const target = typeof value.target === 'string' ? current.get(value.target) : undefined;
      if (!target || seen.has(String(value.target)))
        throw new TypeError('Missing or duplicate saved target');
      seen.add(String(value.target));
      for (const key of ['x', 'y', 'size', 'direction', 'layer'])
        if (typeof value[key] !== 'number' || !Number.isFinite(value[key]))
          throw new TypeError('Invalid saved target number');
      if (Number(value.size) <= 0 || typeof value.visible !== 'boolean')
        throw new TypeError('Invalid saved target appearance');
      if (
        value.costume !== null &&
        (typeof value.costume !== 'string' ||
          !target.sprite?.costumes?.some((costume) => costume.name === value.costume))
      )
        throw new TypeError('Saved costume is not prepared for this target');
      if (
        !value.effects ||
        typeof value.effects !== 'object' ||
        Array.isArray(value.effects) ||
        Object.values(value.effects).some(
          (effect) => typeof effect !== 'number' || !Number.isFinite(effect),
        )
      )
        throw new TypeError('Invalid saved effects');
      if (value.costume !== null && typeof target.setCostume !== 'function')
        throw new TypeError('Target cannot restore its costume');
      if (
        !target.isStage &&
        ['setXY', 'setSize', 'setDirection', 'setVisible', 'goToFront'].some(
          (key) => typeof target[key as keyof Target] !== 'function',
        )
      )
        throw new TypeError('Target cannot restore its presentation');
      if (Object.keys(value.effects).some((name) => !Object.hasOwn(target.effects ?? {}, name)))
        throw new TypeError('Unknown saved target effect');
      if (Object.keys(value.effects).length && typeof target.setEffect !== 'function')
        throw new TypeError('Target cannot restore effects');
      return value as unknown as State;
    });
  }
  function apply(states: readonly State[], restoreCostume = true) {
    const current = new Map(targets().map((entry) => [entry.key, entry.target as Target]));
    for (const state of states) {
      const target = current.get(state.target)!;
      if (restoreCostume && state.costume !== null)
        target.setCostume!(
          target.sprite!.costumes!.findIndex((costume) => costume.name === state.costume),
        );
      if (!target.isStage) {
        target.setXY!(state.x, state.y);
        target.setSize!(state.size);
        target.setDirection!(state.direction);
        target.setVisible!(state.visible);
      }
      for (const name of new Set([
        ...Object.keys(target.effects ?? {}),
        ...Object.keys(state.effects),
      ]))
        target.setEffect?.(name, state.effects[name] ?? 0);
    }
    for (const state of [...states].sort((a, b) => a.layer - b.layer)) {
      const target = current.get(state.target)!;
      if (!target.isStage) target.goToFront!();
    }
  }
  return Object.freeze({
    capturePresentationState() {
      return {
        targets: captureTargets(),
        videos: video()?.captureState() ?? [],
        ...(bindings ? {bindings: bindings.capture()} : {}),
        ...(media ? {media: media.capture()} : {}),
      };
    },
    async prepareRestorePresentation(
      input: Readonly<Record<string, unknown>>,
      context: unknown,
    ): Promise<Dsl4RestorePresentation> {
      if (
        Object.keys(input).some(
          (key) =>
            ![
              'targets',
              'videos',
              ...(bindings ? ['bindings'] : []),
              ...(media ? ['media'] : []),
            ].includes(key),
        ) ||
        !Array.isArray(input.videos)
      )
        throw new TypeError('Unknown saved presentation fields');
      const saved = validate(input.targets),
        previous = captureTargets();
      bindings?.validate(input.bindings);
      const previousBindings = bindings?.capture();
      const port = video();
      if (!port && input.videos.length) throw new TypeError('Video restore is unavailable');
      const videos = await port?.prepareRestoreState(input.videos, context);
      let restoredMedia: Awaited<ReturnType<NonNullable<typeof media>['prepare']>> | undefined;
      try {
        // A save from before media capture holds none, which restores as silence and no text.
        restoredMedia = await media?.prepare(input.media ?? {});
      } catch (error) {
        await videos?.rollback();
        throw error;
      }
      let changed = false,
        committed = false,
        finished = false;
      return Object.freeze({
        async commit() {
          if (finished) throw new TypeError('Presentation restore already settled');
          changed = true;
          restoredMedia?.beforeTargets();
          apply(saved);
          if (bindings) {
            await bindings.apply(input.bindings);
            apply(saved, false);
          }
          await restoredMedia?.afterTargets();
          videos?.commit();
          committed = true;
        },
        async rollback() {
          if (finished) return;
          const errors: unknown[] = [];
          if (changed) {
            try {
              apply(previous);
            } catch (error) {
              errors.push(error);
            }
            if (bindings)
              try {
                await bindings.apply(previousBindings);
                apply(previous, false);
              } catch (error) {
                errors.push(error);
              }
          }
          if (changed)
            try {
              await restoredMedia?.revert();
            } catch (error) {
              errors.push(error);
            }
          try {
            restoredMedia?.dispose();
          } catch (error) {
            errors.push(error);
          }
          try {
            await videos?.rollback();
          } catch (error) {
            errors.push(error);
          }
          if (errors.length) throw new AggregateError(errors, 'Presentation rollback failed');
          finished = true;
        },
        async finalize() {
          if (finished) return;
          if (!committed) throw new TypeError('Presentation restore has not committed');
          const errors: unknown[] = [];
          try {
            videos?.finalize();
          } catch (error) {
            errors.push(error);
          }
          try {
            await finalizePrevious?.();
          } catch (error) {
            errors.push(error);
          }
          try {
            await restoredMedia?.start();
          } catch (error) {
            errors.push(error);
          }
          if (errors.length)
            throw new AggregateError(errors, 'Previous presentation cleanup failed');
          finished = true;
        },
      });
    },
  });
}
