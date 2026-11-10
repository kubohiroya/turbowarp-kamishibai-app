import type {Dsl4PreviewStageControls} from '../../builder/dsl4-preview-reload-overlay.js';
import type {TMCompositionOptions} from '@kubohiroya/turbowarp-teachable-machine/composition';

export type Dsl4ComputeMode = NonNullable<TMCompositionOptions['computeMode']>;
export const dsl4ComputeModes = Object.freeze(['auto', 'webgpu', 'wasm', 'cpu', 'webgl'] as const);
const storageKey = 'kamishibai.recognition.computeMode';

export function requireDsl4ComputeMode(value: unknown): Dsl4ComputeMode {
  if (!dsl4ComputeModes.includes(value as Dsl4ComputeMode)) {
    throw new TypeError('computeMode must be auto, webgpu, wasm, cpu, or webgl');
  }
  return value as Dsl4ComputeMode;
}

/** Store a device preference without switching a backend while models still own tensors. */
export function createDsl4ComputePreferences(
  options: {
    initialMode?: Dsl4ComputeMode;
    globalObject?: {localStorage?: Pick<Storage, 'getItem' | 'setItem'>};
  } = {},
) {
  let mode = requireDsl4ComputeMode(options.initialMode ?? 'auto');
  let storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;
  try {
    storage = options.globalObject?.localStorage;
    const saved = storage?.getItem(storageKey);
    if (saved && dsl4ComputeModes.includes(saved as Dsl4ComputeMode))
      mode = saved as Dsl4ComputeMode;
  } catch {
    // Private browsing and embedded hosts can refuse device storage.
  }
  return Object.freeze({
    getMode: () => mode,
    setMode(value: unknown) {
      mode = requireDsl4ComputeMode(value);
      try {
        storage?.setItem(storageKey, mode);
      } catch {
        // A session preference still works when persistence is unavailable.
      }
      return mode;
    },
  });
}

const labels = {
  ja: {
    title: '認識の計算方式',
    modes: ['Auto（自動・推奨）', 'WebGPU', 'WASM', 'JavaScript（CPU）'],
    apply: '保存して最初から再生',
    close: '閉じる',
    note: '方式の変更は、現在のモデルを解放して再生し直す際に適用します。',
    actual: '実際の方式',
    pending: '未選択',
    fallback: '指定方式が使えないため代替方式を使用中',
  },
  en: {
    title: 'Recognition compute backend',
    modes: ['Auto (recommended)', 'WebGPU', 'WASM', 'JavaScript (CPU)'],
    apply: 'Save and restart story',
    close: 'Close',
    note: 'Changes apply when the story restarts, after the current models have been released.',
    actual: 'Actual backend',
    pending: 'Not selected',
    fallback: 'Requested backend unavailable; using fallback',
  },
} as const;

/** Register an entry with the same host API as the editor stage controls. */
export function createDsl4ComputeSettings(options: {
  document: Document;
  stageControls: Dsl4PreviewStageControls;
  getLocale?: () => 'en' | 'ja';
  preferences: ReturnType<typeof createDsl4ComputePreferences>;
  getSelection: () => {backend: string; fallback: boolean} | null;
  onApply: (mode: Dsl4ComputeMode) => unknown | Promise<unknown>;
  onClose: () => unknown;
}) {
  const {document} = options;
  const element = document.createElement('div');
  element.dataset.dsl4ComputeSettings = 'true';
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'false');
  element.style.cssText =
    'position:fixed;right:16px;top:64px;width:360px;max-width:calc(100vw - 32px);max-height:calc(100vh - 96px);z-index:2147483001;background:#fff;color:#004d40;padding:16px;border:1px solid #617184;border-radius:8px;box-sizing:border-box;display:none;font:16px sans-serif;overflow:auto;box-shadow:0 4px 16px #0004;';
  const title = document.createElement('h2');
  title.style.cssText = 'min-width:0;overflow-wrap:anywhere;';
  const selectLabel = document.createElement('label');
  const select = document.createElement('select');
  select.dataset.dsl4ComputeMode = 'true';
  select.style.cssText = 'display:block;width:100%;font:inherit;padding:.5em;margin:.5em 0;';
  const visibleModes = ['auto', 'webgpu', 'wasm', 'cpu'] as const;
  const choices = visibleModes.map((mode) => {
    const choice = document.createElement('option');
    choice.value = mode;
    select.appendChild(choice);
    return choice;
  });
  selectLabel.appendChild(select);
  const status = document.createElement('p');
  status.dataset.dsl4ComputeStatus = 'true';
  status.setAttribute('role', 'status');
  const note = document.createElement('p');
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.dataset.dsl4ComputeApply = 'true';
  const close = document.createElement('button');
  close.type = 'button';
  close.dataset.dsl4ComputeClose = 'true';
  apply.style.cssText = 'font:inherit;padding:.6em;margin:.5em;';
  // Close is an X icon; its localized name lives in aria-label and title, never as visible text.
  close.style.cssText =
    'display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;margin:.5em;flex-shrink:0;border:0;border-radius:4px;background:transparent;color:inherit;cursor:pointer;';
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const closeIcon = document.createElementNS(svgNamespace, 'svg');
  closeIcon.setAttribute('viewBox', '0 0 16 16');
  closeIcon.setAttribute('width', '18');
  closeIcon.setAttribute('height', '18');
  closeIcon.setAttribute('aria-hidden', 'true');
  closeIcon.setAttribute('focusable', 'false');
  const closePath = document.createElementNS(svgNamespace, 'path');
  closePath.setAttribute('d', 'M4 4l8 8M12 4l-8 8');
  closePath.setAttribute('stroke', 'currentColor');
  closePath.setAttribute('stroke-width', '1.6');
  closePath.setAttribute('stroke-linecap', 'round');
  closePath.setAttribute('fill', 'none');
  closeIcon.appendChild(closePath);
  close.appendChild(closeIcon);
  const closeStyle = document.createElement('style');
  closeStyle.textContent =
    '[data-dsl4-compute-close]:hover:not(:disabled){background:color-mix(in srgb,currentColor 12%,transparent)}' +
    '[data-dsl4-compute-close]:focus-visible{outline:2px solid currentColor;outline-offset:2px}';
  const header = document.createElement('header');
  header.style.cssText =
    'display:flex;align-items:flex-start;justify-content:space-between;gap:8px;';
  header.append(title, close, closeStyle);
  const body = document.createElement('div');
  body.append(selectLabel, status, note);
  const footer = document.createElement('footer');
  footer.appendChild(apply);
  element.append(header, body, footer);
  (document.fullscreenElement || document.body).appendChild(element);
  let previousFocus: Element | null = null;
  let applying = false;
  let open = false;
  const modeText = () => {
    const mode = options.preferences.getMode();
    return mode === 'auto' ? 'Auto' : mode === 'cpu' ? 'JavaScript' : mode.toUpperCase();
  };
  const controlLabel = (locale = options.getLocale?.() ?? 'en') =>
    `Teachable Machine: ${labels[locale].title} (${modeText()})`;
  const toolbar = options.stageControls.addButton({
    id: 'kamishibai-recognition-compute',
    label: controlLabel(),
    text: 'Teachable Machine',
    icon: '🧠',
    onClick: () => {
      if (applying) return;
      if (open) hide(true);
      else show(options.getLocale?.() ?? 'en');
    },
  });
  toolbar.update({visible: true});
  const placePanel = () => {
    toolbar.placePanel?.(element);
    const dock = document
      .querySelector?.('[data-runtime-dock-control="kamishibai-recognition-compute"]')
      ?.closest('[data-runtime-controls-dock]');
    const view = document.defaultView;
    if (!dock || !view) return;
    const rect = dock.getBoundingClientRect();
    const edge = dock.getAttribute('data-edge');
    const height =
      edge === 'bottom'
        ? rect.top - 16
        : edge === 'top'
          ? view.innerHeight - rect.bottom - 16
          : view.innerHeight - 16;
    const width =
      edge === 'right'
        ? rect.left - 16
        : edge === 'left'
          ? view.innerWidth - rect.right - 16
          : view.innerWidth - 16;
    // Keep the Dock clickable while scrolling the panel body on smaller viewports.
    Object.assign(element.style, {
      display: 'flex',
      padding: '0',
      maxHeight: `${Math.max(80, height)}px`,
      maxWidth: `${Math.max(80, width)}px`,
    });
    header.style.flexShrink = footer.style.flexShrink = '0';
    body.style.flex = '1 1 auto';
    body.style.maxHeight = `${Math.max(0, height - header.offsetHeight - footer.offsetHeight - 2)}px`;
    toolbar.placePanel?.(element);
  };
  const hide = (restoreFocus = false) => {
    open = false;
    toolbar.update({
      expanded: false,
      label: controlLabel(),
    });
    element.style.display = 'none';
    if (restoreFocus) {
      (previousFocus as HTMLElement | null)?.focus?.();
      toolbar.focus();
    }
  };
  close.addEventListener('click', () => {
    hide(true);
    options.onClose();
  });
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !applying) {
      hide(true);
      options.onClose();
    }
  });
  apply.addEventListener('click', () => {
    if (applying) return;
    const mode = requireDsl4ComputeMode(select.value);
    applying = true;
    apply.disabled = close.disabled = select.disabled = true;
    void Promise.resolve()
      .then(() => options.onApply(mode))
      .then(
        () => hide(true),
        (error: unknown) => {
          status.textContent = error instanceof Error ? error.message : String(error);
        },
      )
      .finally(() => {
        applying = false;
        apply.disabled = close.disabled = select.disabled = false;
      });
  });
  function show(locale: 'en' | 'ja') {
    open = true;
    toolbar.update({expanded: true});
    const text = labels[locale];
    previousFocus = document.activeElement;
    title.textContent = text.title;
    element.setAttribute('lang', locale);
    element.setAttribute('aria-label', text.title);
    select.setAttribute('aria-label', text.title);
    choices.forEach((choice, index) => {
      choice.textContent = text.modes[index] ?? '';
    });
    select.value =
      options.preferences.getMode() === 'webgl' ? 'auto' : options.preferences.getMode();
    const selection = options.getSelection();
    status.textContent = `${text.actual}: ${selection?.backend ?? text.pending}${selection?.fallback ? ` (${text.fallback})` : ''}`;
    note.textContent = text.note;
    apply.textContent = text.apply;
    close.setAttribute('aria-label', text.close);
    close.setAttribute('title', text.close);
    element.style.display = 'block';
    toolbar.update({label: controlLabel(locale)});
    placePanel();
    select.focus();
  }
  const fullscreen = () => {
    (document.fullscreenElement || document.body).appendChild(element);
    if (open) placePanel();
  };
  document.addEventListener('fullscreenchange', fullscreen);
  const onDockPointer = (event: PointerEvent) => {
    const control = (event.target as Element | null)?.closest?.('[data-runtime-dock-bar] button');
    if (
      open &&
      control &&
      control.getAttribute('data-runtime-dock-control') !== 'kamishibai-recognition-compute'
    )
      hide();
  };
  document.addEventListener('pointerdown', onDockPointer, true);
  const resize = () => {
    if (open) placePanel();
  };
  document.defaultView?.addEventListener('resize', resize);
  return Object.freeze({
    element,
    show,
    hide,
    dispose() {
      toolbar.dispose();
      document.removeEventListener('fullscreenchange', fullscreen);
      document.removeEventListener('pointerdown', onDockPointer, true);
      document.defaultView?.removeEventListener('resize', resize);
      element.remove();
    },
  });
}
