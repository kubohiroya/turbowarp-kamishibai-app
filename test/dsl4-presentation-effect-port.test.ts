import {describe, expect, test} from 'vitest';
import {
  createDsl4PresentationEffectPort,
  type Dsl4PresentationEffectSurface,
} from '../src/dsl4/platform/presentation-effect-port.js';

function setup() {
  function surface() {
    const animations: {
      frames: Keyframe[];
      options: KeyframeAnimationOptions;
      complete(): void;
      cancelCount: number;
    }[] = [];
    const colors: string[] = [];
    let removed = 0;
    const target: Dsl4PresentationEffectSurface['target'] = {
      animate(frames, options) {
        let resolve!: (value: Animation) => void;
        let reject!: (reason: unknown) => void;
        const finished = new Promise<Animation>((done, failed) => {
          resolve = done;
          reject = failed;
        });
        const operation = {
          frames,
          options,
          complete() {
            resolve({} as Animation);
          },
          cancelCount: 0,
        };
        animations.push(operation);
        return {
          finished,
          cancel() {
            operation.cancelCount += 1;
            reject(new DOMException('Cancelled', 'AbortError'));
          },
        };
      },
    };
    return {
      target,
      animations,
      animation(index: number) {
        const animation = animations[index];
        if (!animation) throw new Error(`No test animation ${index}`);
        return animation;
      },
      colors,
      removed: () => removed,
      createOverlay(color: string) {
        colors.push(color);
        return {
          target,
          dispose() {
            removed += 1;
          },
        };
      },
    };
  }

  const stage = surface();
  const presentation = surface();
  const port = createDsl4PresentationEffectPort({stage, presentation});
  const abort = new AbortController();
  const play = (input: unknown) => port.presentationEffect(input, {signal: abort.signal});
  return {port, stage, presentation, abort, play};
}

const effect = (effect: string, params: object, scope = 'stage', seconds = 1) => ({
  scope,
  effect,
  seconds,
  params,
});

describe('DSL4 presentation effect port', () => {
  test('owns only the requested scope and effect channel, with neutral endpoints', async () => {
    const {port, stage, presentation, play} = setup();
    const shake = play(effect('shake', {amplitude: 16, cycles: 2, axis: 'y'}));
    const zoom = play(effect('zoom', {scale: 2}));
    const fade = play(effect('fade', {opacity: 0.5, color: '#abcdef'}, 'presentation'));
    expect(stage.animation(0).frames).toHaveLength(9);
    expect(stage.animation(0).frames.at(1)?.translate).toBe('0px 14.000px');
    expect(stage.animation(0).frames.at(-1)?.translate).toBe('0px 0.000px');
    expect(stage.animation(1).frames.map((frame) => frame.scale)).toEqual(['1', '2', '1']);
    expect(stage.animation(1).options).toEqual({
      duration: 1000,
      fill: 'both',
      composite: 'add',
    });
    expect(presentation.colors).toEqual(['#abcdef']);
    expect(presentation.animation(0).frames.map((frame) => frame.opacity)).toEqual([0, 0.5, 0]);
    expect(presentation.animation(0).options.composite).toBe('replace');
    expect(stage.animations.map((animation) => animation.cancelCount)).toEqual([0, 0]);

    stage.animation(1).complete();
    await zoom;
    port.finishAll();
    await Promise.all([shake, fade]);
    expect(stage.animations.map((animation) => animation.cancelCount)).toEqual([1, 1]);
    expect(presentation.removed()).toBe(1);
  });

  test('replaces a wipe with a fade, neutral before disposing the owned layer', async () => {
    const {stage, port, play} = setup();
    const wipe = play(effect('wipe', {direction: 'right'}));
    expect(stage.colors).toEqual(['#000000']);
    expect(stage.animation(0).frames.map((frame) => frame.clipPath)).toEqual([
      'inset(0 100% 0 0)',
      'inset(0)',
      'inset(0 0 0 100%)',
    ]);
    const fade = play(effect('fade', {}));
    await wipe;
    expect(stage.removed()).toBe(1);
    expect(stage.animation(0).cancelCount).toBe(1);
    port.dispose();
    port.dispose();
    await fade;
    expect(stage.removed()).toBe(2);
    expect(stage.animation(1).cancelCount).toBe(1);
    await expect(play(effect('fade', {}))).rejects.toMatchObject({
      code: 'K4-PRESENTATION-EFFECT-003',
    });
  });

  test('prevents stale cleanup from deleting a replacement and cleans on abort', async () => {
    const {stage, abort, play} = setup();
    const stale = play(effect('zoom', {scale: 2}));
    const current = play(effect('zoom', {scale: 3}));
    await stale;
    expect(stage.animation(1).cancelCount).toBe(0);
    const canceled = expect(current).rejects.toMatchObject({name: 'AbortError'});
    abort.abort();
    await canceled;
    expect(stage.animations.map((animation) => animation.cancelCount)).toEqual([1, 1]);
    await expect(play(effect('fade', {}))).rejects.toMatchObject({name: 'AbortError'});
    expect(stage.colors).toEqual([]);
  });

  test('refuses invalid or unavailable inputs without allocating an overlay', async () => {
    const {stage, play} = setup();
    for (const request of [
      effect('other', {}),
      effect('shake', {amplitude: 65}),
      effect('shake', {amplitude: 2, cycles: 2.5}),
      effect('shake', {amplitude: 2, axis: 'z'}),
      effect('zoom', {scale: NaN}),
      effect('fade', {opacity: -1}),
      effect('fade', {color: 'url(https://example.invalid/)'}),
      effect('fade', {opacity: 0, transform: 'none'}),
      effect('wipe', {direction: 'diagonal'}),
      effect('fade', {}, 'camera'),
      effect('fade', {}, 'stage', 31),
    ]) {
      await expect(play(request)).rejects.toMatchObject({code: 'K4-PRESENTATION-EFFECT-001'});
    }
    await play(effect('wipe', {}, 'stage', 0));
    expect(stage.colors).toHaveLength(0);
    const unavailable = createDsl4PresentationEffectPort({stage: {target: stage.target}});
    await expect(
      unavailable.presentationEffect(effect('fade', {}), {signal: new AbortController().signal}),
    ).rejects.toMatchObject({code: 'K4-PRESENTATION-EFFECT-002'});
    expect(stage.animations).toHaveLength(0);
  });

  test('removes an allocated layer when the host cannot animate it', async () => {
    let removed = 0;
    const target = {
      animate(): never {
        throw new Error('WAAPI failure');
      },
    };
    const port = createDsl4PresentationEffectPort({
      stage: {
        target,
        createOverlay: () => ({target, dispose: () => void removed++}),
      },
    });
    await expect(
      port.presentationEffect(effect('fade', {}), {signal: new AbortController().signal}),
    ).rejects.toThrow('WAAPI failure');
    port.dispose();
    expect(removed).toBe(1);
  });
});

test('cleans a layer attached while the host synchronously finishes the effect', async () => {
  let removed = 0;
  const target = {
    animate(): never {
      throw new Error('Animation must not start');
    },
  };
  const port = createDsl4PresentationEffectPort({
    stage: {
      target,
      createOverlay() {
        port.finishAll();
        return {target, dispose: () => void removed++};
      },
    },
  });
  await port.presentationEffect(effect('fade', {}), {signal: new AbortController().signal});
  expect(removed).toBe(1);
});
