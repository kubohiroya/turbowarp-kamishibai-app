/** Keep the stage canvas, overlays and pointer target in one fitted stage rectangle. */
export function fitDsl4Stage({
  mount,
  element,
  canvas,
  width,
  height,
  fit = 'contain',
  safeArea,
}: {
  mount: HTMLElement;
  element: HTMLElement;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  fit?: 'contain' | 'cover';
  safeArea?: Readonly<{top: number; right: number; bottom: number; left: number}>;
}) {
  const layers = canvas.parentElement!;
  const window = mount.ownerDocument.defaultView;
  let disposed = false;
  // Scale the whole layer stack so native overlays and canvas pixels use the same transform.
  Object.assign(layers.style, {
    width: `${width}px`,
    height: `${height}px`,
    maxWidth: 'none',
    transformOrigin: '0 0',
  });
  Object.assign(canvas.style, {width: `${width}px`, height: `${height}px`, maxWidth: 'none'});
  element.style.inset = 'auto';
  function update() {
    if (disposed) return;
    const bounds = mount.getBoundingClientRect();
    // Computed sizes preserve fractional local pixels; client sizes can round upward and clip.
    const style = window?.getComputedStyle?.(mount);
    const availableWidth =
      Number.parseFloat(style?.width ?? '') || mount.clientWidth || bounds.width;
    const availableHeight =
      Number.parseFloat(style?.height ?? '') || mount.clientHeight || bounds.height;
    if (availableWidth <= 0 || availableHeight <= 0) return;
    const insets = safeArea ?? {
      top: Number.parseFloat(style?.paddingTop ?? '') || 0,
      right: Number.parseFloat(style?.paddingRight ?? '') || 0,
      bottom: Number.parseFloat(style?.paddingBottom ?? '') || 0,
      left: Number.parseFloat(style?.paddingLeft ?? '') || 0,
    };
    const usableWidth = availableWidth - insets.left - insets.right;
    const usableHeight = availableHeight - insets.top - insets.bottom;
    if (usableWidth <= 0 || usableHeight <= 0) return;
    const scale = (fit === 'cover' ? Math.max : Math.min)(
      usableWidth / width,
      usableHeight / height,
    );
    Object.assign(element.style, {
      left: `${insets.left + (usableWidth - width * scale) / 2}px`,
      top: `${insets.top + (usableHeight - height * scale) / 2}px`,
      width: `${width * scale}px`,
      height: `${height * scale}px`,
    });
    layers.style.transform = `scale(${scale})`;
  }
  const ResizeObserver = (window as (Window & typeof globalThis) | null)?.ResizeObserver;
  const observer = ResizeObserver ? new ResizeObserver(update) : null;
  observer?.observe(mount);
  window?.addEventListener('resize', update);
  window?.addEventListener('orientationchange', update);
  mount.ownerDocument.addEventListener?.('fullscreenchange', update);
  update();
  return () => {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    window?.removeEventListener('resize', update);
    window?.removeEventListener('orientationchange', update);
    mount.ownerDocument.removeEventListener?.('fullscreenchange', update);
  };
}
