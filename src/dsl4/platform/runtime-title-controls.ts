/**
 * The DOM surface this runtime UI builds and mounts. Narrower than the platform's `HTMLElement` on
 * purpose: a suite fake only has to provide what is listed here.
 */
interface Dsl4RuntimeUiElement {
  [member: string]: unknown;
  id?: string;
  textContent?: string | null;
  hidden?: boolean;
  /** Set on the button nodes these surfaces create, absent on the rest. */
  type?: string;
  disabled?: boolean;
  dataset?: Record<string, string | undefined>;
  style: Record<string, string> & {cssText?: string};
  setAttribute(name: string, value: string): void;
  appendChild(child: Dsl4RuntimeUiElement): unknown;
  append?(...children: Dsl4RuntimeUiElement[]): unknown;
  replaceChildren?(...children: Dsl4RuntimeUiElement[]): unknown;
  remove(): void;
  focus?(): void;
  click?(): void;
  getAttribute?(name: string): string | null;
  children?: ArrayLike<Dsl4RuntimeUiElement>;
  addEventListener(type: string, listener: (event: never) => unknown, options?: unknown): unknown;
  removeEventListener(
    type: string,
    listener: (event: never) => unknown,
    options?: unknown,
  ): unknown;
}

import {createAppShellTitleControls} from '@kubohiroya/turbowarp-app-shell';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireElement(value: unknown, name: string) {
  if (!isRecord(value) || typeof value.appendChild !== 'function') {
    throw new TypeError(`${name} must be a DOM element`);
  }
  return value as Dsl4RuntimeUiElement;
}

function requireDocument(value: unknown) {
  if (!isRecord(value) || typeof value.createElement !== 'function') {
    throw new TypeError('document must provide createElement');
  }
  return value as Dsl4RuntimeUiElement;
}

const titleStartLabels = Object.freeze({en: 'Start Kamishibai', ja: '紙芝居を始める'});
const titleConfigLabels = Object.freeze({en: 'Config', ja: '設定'});

/**
 * The start action is the title's primary call to action: large, saturated and centred in the band
 * between the version line and the licence text. The website action sits beside it, smaller and
 * on a paler green, so the two never compete for attention.
 */
const titleStartButtonCss =
  'position:absolute;left:12.5%;top:27.2222%;width:40%;height:20%;display:flex;align-items:center;justify-content:center;box-sizing:border-box;border:.4167cqw solid #005f50;border-radius:2.5cqw;background:#007d66;color:#fff;box-shadow:0 .625cqw 1.6667cqw rgba(0,0,0,.25);cursor:pointer;pointer-events:auto;padding:0 2cqw;font:inherit;font-size:3.5417cqw;font-weight:bold;letter-spacing:.05em;line-height:1.15;text-align:center;white-space:nowrap;';
const titleWebsiteButtonCss =
  'position:absolute;left:55.5%;top:30.5556%;width:32%;height:13.3333%;display:flex;align-items:center;justify-content:center;gap:1.25cqw;box-sizing:border-box;border:.2083cqw solid #8ccfbb;border-radius:1.6667cqw;background:#c6eadf;color:#005f50;box-shadow:none;cursor:pointer;pointer-events:auto;padding:0 1.25cqw;font:inherit;';
const titleWebsiteIconCss =
  'display:inline-flex;flex:none;width:5.8333cqw;height:5.8333cqw;align-items:center;justify-content:center;line-height:1;font-size:3.75cqw;opacity:.8;';
const titleWebsiteLabelCss = 'font-size:2.0833cqw;line-height:1.15;text-align:center;';
/** The settings action sits under the website action, as quiet as it is. */
const titleConfigButtonCss =
  'position:absolute;left:55.5%;top:46.6667%;width:32%;height:9.4444%;display:flex;align-items:center;justify-content:center;gap:1.25cqw;box-sizing:border-box;border:.2083cqw solid #8ccfbb;border-radius:1.6667cqw;background:#c6eadf;color:#005f50;box-shadow:none;cursor:pointer;pointer-events:auto;padding:0 1.25cqw;font:inherit;font-size:2.0833cqw;line-height:1.15;text-align:center;white-space:nowrap;';
const titleConfigIconCss = 'flex:none;font-size:2.9167cqw;line-height:1;opacity:.8;';

function childElements(element: Dsl4RuntimeUiElement) {
  return Array.from(element.children ?? []);
}

/**
 * Render title actions above the Stage without adding Scratch sprites or clones.
 * Pointer events pass through the empty overlay so the Stage itself remains clickable.
 *
 * The overlay mechanics live in `@kubohiroya/turbowarp-app-shell`. This module injects the
 * Kamishibai copy, website icon, stage-relative close glyph metrics, and `data-dsl4-*` hooks.
 */
export function createDsl4RuntimeTitleControls(options: {
  document: unknown;
  mount: unknown;
  locales: Readonly<
    Record<'en' | 'ja', Readonly<{website: string; close: string; start?: string; config?: string}>>
  >;
  websiteIconUrl?: string;
  onWebsite: () => unknown | Promise<unknown>;
  /** Defaults to `onClose`: leaving the title is what starts the Kamishibai. */
  onStart?: () => unknown | Promise<unknown>;
  onClose: () => unknown | Promise<unknown>;
  /** Opens the playback settings. Without it the title has no settings action. */
  onConfig?: () => unknown | Promise<unknown>;
  onError?: (error: unknown) => unknown;
}) {
  if (!isRecord(options)) throw new TypeError('title control options are required');
  const document = requireDocument(options.document);
  const mount = requireElement(options.mount, 'mount');
  if (typeof options.onWebsite !== 'function') throw new TypeError('onWebsite must be a function');
  if (typeof options.onClose !== 'function') throw new TypeError('onClose must be a function');
  if (options.onStart !== undefined && typeof options.onStart !== 'function')
    throw new TypeError('onStart must be a function');
  if (options.onConfig !== undefined && typeof options.onConfig !== 'function')
    throw new TypeError('onConfig must be a function');
  for (const locale of ['en', 'ja'] as const) {
    if (
      !isRecord(options.locales?.[locale]) ||
      typeof options.locales[locale].website !== 'string' ||
      typeof options.locales[locale].close !== 'string'
    ) {
      throw new TypeError(`locales.${locale} must provide website and close`);
    }
  }

  const controls = createAppShellTitleControls({
    document: document as unknown as Document,
    mount: mount as unknown as HTMLElement,
    locales: options.locales,
    // Kamishibai starts every surface in English and switches from the application menu.
    initialLocale: 'en',
    fallbackLocale: 'en',
    ariaLabel: 'Kamishibai title controls',
    websiteIcon: options.websiteIconUrl
      ? {url: options.websiteIconUrl}
      : {text: '🌐', fontSize: '3.75cqw'},
    // The stage scales with its container, so the close glyph is sized in container units.
    closeIconMetrics: {size: '4.1667cqw', thickness: '.625cqw', radius: '.3125cqw'},
    attributes: {
      root: {'data-dsl4-title-controls': 'true'},
      website: {'data-dsl4-title-action': 'website'},
      close: {'data-dsl4-title-action': 'close'},
      closeIcon: {'data-dsl4-close-icon': 'true'},
      closeIconLine: {'data-dsl4-close-icon-line': 'true'},
    },
    onWebsite: options.onWebsite,
    onClose: options.onClose,
    ...(options.onError === undefined ? {} : {onError: options.onError}),
  });

  // Keep title actions above the canvas, below the host's later startup overlay.
  controls.element.style.zIndex = '0';

  const root = controls.element as unknown as Dsl4RuntimeUiElement;
  const website = childElements(root).find(
    (child) => child.getAttribute?.('data-dsl4-title-action') === 'website',
  );
  if (website) {
    website.style.cssText = titleWebsiteButtonCss;
    const [websiteIcon, websiteLabel] = childElements(website);
    if (websiteIcon) websiteIcon.style.cssText = titleWebsiteIconCss;
    if (websiteLabel) websiteLabel.style.cssText = titleWebsiteLabelCss;
  }

  const createElement = document.createElement as (tag: string) => Dsl4RuntimeUiElement;
  const start = createElement.call(document, 'button');
  start.type = 'button';
  start.setAttribute('data-dsl4-title-action', 'start');
  start.style.cssText = titleStartButtonCss;
  const onStart = options.onStart ?? options.onClose;
  const onStartClick = () => {
    try {
      void Promise.resolve(onStart()).catch((error: unknown) => options.onError?.(error));
    } catch (error) {
      options.onError?.(error);
    }
  };
  start.addEventListener('click', onStartClick);
  root.appendChild(start);

  const onConfig = options.onConfig;
  let config: Dsl4RuntimeUiElement | null = null;
  let configLabel: Dsl4RuntimeUiElement | null = null;
  const onConfigClick = (event: {stopPropagation?: () => void}) => {
    // The title overlay sits on the Stage; the click must not also start the story.
    event?.stopPropagation?.();
    try {
      void Promise.resolve(onConfig?.()).catch((error: unknown) => options.onError?.(error));
    } catch (error) {
      options.onError?.(error);
    }
  };
  if (onConfig) {
    config = createElement.call(document, 'button');
    config.type = 'button';
    config.setAttribute('data-dsl4-title-action', 'config');
    config.style.cssText = titleConfigButtonCss;
    const icon = createElement.call(document, 'span');
    icon.setAttribute('aria-hidden', 'true');
    icon.style.cssText = titleConfigIconCss;
    icon.textContent = '⚙';
    configLabel = createElement.call(document, 'span');
    config.appendChild(icon);
    config.appendChild(configLabel);
    config.addEventListener('click', onConfigClick);
    root.appendChild(config);
  }

  let locale: 'en' | 'ja' = 'en';
  const renderStart = () => {
    const label = options.locales[locale].start ?? titleStartLabels[locale];
    start.textContent = label;
    start.setAttribute('aria-label', label);
    if (config && configLabel) {
      const text = options.locales[locale].config ?? titleConfigLabels[locale];
      configLabel.textContent = text;
      config.setAttribute('aria-label', text);
    }
  };
  renderStart();

  return Object.freeze({
    element: controls.element,
    show(nextLocale?: 'en' | 'ja') {
      if (nextLocale !== undefined) locale = nextLocale === 'ja' ? 'ja' : 'en';
      renderStart();
      return controls.show(nextLocale === undefined ? undefined : locale);
    },
    hide: () => controls.hide(),
    dispose: () => {
      start.removeEventListener('click', onStartClick);
      start.remove();
      config?.removeEventListener('click', onConfigClick);
      config?.remove();
      controls.dispose();
    },
  });
}
