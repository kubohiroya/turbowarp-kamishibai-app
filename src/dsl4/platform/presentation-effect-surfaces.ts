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
