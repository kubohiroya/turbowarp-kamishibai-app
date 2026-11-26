import type {
  Dsl4PresentationEffectSurface,
  Dsl4PresentationScope,
} from './presentation-effect-port.js';

/** A stage owner can host masks in a dedicated slot instead of supplying a whole presentation. */
export function createDsl4DomPresentationEffectSurface(options: {
  target: HTMLElement;
  /** Attach into the owner's positioned, clipped layer at the scope's documented stack order. */
  attachMask: (element: HTMLDivElement) => void;
}): Dsl4PresentationEffectSurface {
  return Object.freeze({
    target: options.target,
    createOverlay(color: string) {
      const layer = options.target.ownerDocument.createElement('div');
      layer.setAttribute('aria-hidden', 'true');
      layer.setAttribute('inert', '');
      Object.assign(layer.style, {
        position: 'absolute',
        inset: '0',
        pointerEvents: 'none',
        backgroundColor: color,
      });
      try {
        options.attachMask(layer);
      } catch (error) {
        layer.remove();
        throw error;
      }
      return {target: layer, dispose: () => layer.remove()};
    },
  });
}

/**
 * Use only the shell's existing root whose direct children are the renderer canvas followed by
 * its story overlays (e.g. Bubble), in DOM stacking order. The shell owns relative positioning,
 * clipping and isolation; external camera/UI layers must be siblings outside this root. A stage
 * mask sits immediately above the canvas but below story overlays; a presentation mask sits above
 * the overlays. Do not use this helper for hosts with a different stacking order: explicitly
 * inject the surface(s) with the owner-provided mask slot in that case.
 */
export function createDsl4BrowserStagePresentationEffectSurfaces(options: {
  canvas: HTMLCanvasElement;
  stageLayers: HTMLElement;
}): Readonly<Record<Dsl4PresentationScope, Dsl4PresentationEffectSurface>> {
  const {canvas, stageLayers} = options;
  if (canvas.parentElement !== stageLayers) {
    throw new TypeError('Presentation effects require the canvas in its explicit stage layer');
  }
  return Object.freeze({
    stage: createDsl4DomPresentationEffectSurface({
      target: canvas,
      attachMask: (layer) => stageLayers.insertBefore(layer, canvas.nextSibling),
    }),
    presentation: createDsl4DomPresentationEffectSurface({
      target: stageLayers,
      attachMask: (layer) => stageLayers.appendChild(layer),
    }),
  });
}

type EffectAnimation = Pick<Animation, 'cancel' | 'finished'>;

function animateTogether(
  targets: readonly HTMLElement[],
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): EffectAnimation {
  const animations: Animation[] = [];
  try {
    for (const target of targets) {
      const width = target.clientWidth;
      const scale = width > 0 ? target.getBoundingClientRect().width / width || 1 : 1;
      const frames =
        scale === 1
          ? keyframes
          : keyframes.map((frame) => ({
              ...frame,
              ...(typeof frame.translate === 'string'
                ? {
                    translate: frame.translate.replace(
                      /-?\d+(?:\.\d+)?px/gu,
                      (length) => `${Number.parseFloat(length) / scale}px`,
                    ),
                  }
                : {}),
            }));
      animations.push(target.animate(frames, options));
    }
  } catch (error) {
    for (const animation of animations) {
      void animation.finished.catch(() => {});
      animation.cancel();
    }
    throw error;
  }
  return {
    finished: Promise.all(animations.map(({finished}) => finished)).then(() => animations[0]!),
    cancel() {
      for (const animation of animations) animation.cancel();
    },
  };
}

/**
 * Use only the VM canvas and its renderer-owned overlays. In the stock Editor/Player the stage
 * parent also contains controls and sometimes the camera; neither may be transformed or masked.
 */
export function createDsl4TurboWarpPresentationEffectSurfaces(
  runtime: unknown,
): Readonly<Partial<Record<Dsl4PresentationScope, Dsl4PresentationEffectSurface>>> {
  const {renderer} = (runtime ?? {}) as {
    renderer?: {canvas?: HTMLCanvasElement; overlayContainer?: HTMLElement};
  };
  const canvas = renderer?.canvas;
  const overlays = renderer?.overlayContainer;
  if (!canvas || typeof canvas.animate !== 'function') return {};
  if (!overlays || typeof overlays.querySelectorAll !== 'function') return {};

  function createScope(scope: Dsl4PresentationScope): Dsl4PresentationEffectSurface {
    const mask = createDsl4DomPresentationEffectSurface({
      target: canvas!,
      attachMask(layer) {
        layer.dataset.dsl4PresentationEffectMask = scope;
        if (!overlays!.isConnected) {
          throw new TypeError('The renderer overlay surface is not mounted');
        }
        if (scope === 'stage') overlays!.prepend(layer);
        else overlays!.appendChild(layer);
      },
    });
    return {
      createOverlay: mask.createOverlay!,
      target: {
        animate(keyframes, options) {
          // Bubble uses a renderer overlay. The wrapper is already positioned by scratch-render;
          // animate its SVG, not the shared overlay root (which can hold other extensions' UI).
          const speech =
            scope === 'presentation'
              ? [
                  ...overlays!.querySelectorAll<HTMLElement>(
                    '[data-bubble-render-backend="svg-overlay"]',
                  ),
                ]
              : [];
          return animateTogether([canvas!, ...speech], keyframes, options);
        },
      },
    };
  }
  return {stage: createScope('stage'), presentation: createScope('presentation')};
}
