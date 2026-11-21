import type {Dsl4PlaybackFeatures} from '../playback-features.js';
import type {Dsl4AudioChannel, Dsl4PlaybackPreferences} from './playback-preferences.js';

export type Dsl4PlaybackSettingsLocale = 'en' | 'ja';
/** Where the screen was opened from: the title, or Esc while the story plays. */
export type Dsl4PlaybackSettingsContext = 'title' | 'playback';

const labels = {
  ja: {
    title: '設定',
    close: '閉じる',
    done: {title: '閉じる', playback: '再生に戻る'},
    paused: '再生を一時停止しています。閉じると、止めた場面から再開します。',
    progress: '進行',
    skip: 'ポーズ待ちのスキップを許可する',
    skipFollows: (allowed: boolean) => `台本の設定に従う（${allowed ? '許可' : '禁止'}）`,
    skipOverridden: '台本の設定を上書きしています',
    skipReset: '台本の設定に戻す',
    audio: '音',
    channel: {bgm: 'BGM', effects: '効果音'},
    enabled: 'オン',
    volume: '音量',
    recognition: 'カメラと認識',
    camera: 'カメラの設定',
    computeBackend: 'Teachable Machine の計算方式',
    empty: 'この作品で変えられる設定はありません。',
  },
  en: {
    title: 'Settings',
    close: 'Close',
    done: {title: 'Close', playback: 'Back to the story'},
    paused: 'The story is paused. Closing resumes it from where it stopped.',
    progress: 'Progress',
    skip: 'Allow skipping pose waits',
    skipFollows: (allowed: boolean) =>
      `Following the story (${allowed ? 'allowed' : 'not allowed'})`,
    skipOverridden: 'Overriding the story',
    skipReset: 'Follow the story',
    audio: 'Sound',
    channel: {bgm: 'BGM', effects: 'Sound effects'},
    enabled: 'On',
    volume: 'Volume',
    recognition: 'Camera and recognition',
    camera: 'Camera',
    computeBackend: 'Recognition backend',
    empty: 'This story has no settings to change.',
  },
} as const;

const root = '[data-dsl4-playback-settings][data-dsl4-playback-settings]';
/** Theme rules keyed to the TurboWarp Editor theme variables, like the compute settings panel. */
export const dsl4PlaybackSettingsThemeCss = [
  `${root}{--dsl4-ps-bg:#fff;--dsl4-ps-fg:#25354a;--dsl4-ps-muted:#4b5b6e;--dsl4-ps-border:#9aa8b8;--dsl4-ps-button:#f5f8fc;--dsl4-ps-accent:#007d66;--dsl4-ps-on-accent:#fff;--dsl4-ps-scheme:light}`,
  `@media (prefers-color-scheme:dark){${root}{--dsl4-ps-bg:#1f2329;--dsl4-ps-fg:#e6eaf0;--dsl4-ps-muted:#b4bdc8;--dsl4-ps-border:#4a5563;--dsl4-ps-button:#2f3540;--dsl4-ps-accent:#5cc7ad;--dsl4-ps-on-accent:#0d2a23;--dsl4-ps-scheme:dark}}`,
  `${root} [data-dsl4-settings-panel]{color-scheme:var(--color-scheme,var(--dsl4-ps-scheme));background:var(--ui-modal-background,var(--ui-primary,var(--dsl4-ps-bg)));color:var(--ui-modal-foreground,var(--text-primary,var(--dsl4-ps-fg)));border:1px solid var(--ui-black-transparent,var(--dsl4-ps-border))}`,
  `${root} h2{margin:0;font-size:18px;color:inherit}`,
  `${root} h3{margin:6px 0 2px;font-size:14px;color:inherit}`,
  `${root} p{margin:2px 0;color:var(--text-primary,var(--dsl4-ps-muted));opacity:.9;font-size:12px}`,
  `${root} label{display:flex;align-items:center;gap:8px;min-height:28px}`,
  `${root} [data-dsl4-settings-channel-row]{display:flex;align-items:center;gap:8px}`,
  `${root} [data-dsl4-settings-channel-row] > label:first-child{flex:0 0 auto;min-width:9em}`,
  `${root} [data-dsl4-settings-channel-row] > label:last-child{flex:1 1 auto;min-width:0}`,
  `${root} input[type=range]{flex:1 1 auto;min-width:0;accent-color:var(--looks-secondary,var(--dsl4-ps-accent))}`,
  `${root} input[type=checkbox]{width:20px;height:20px;accent-color:var(--looks-secondary,var(--dsl4-ps-accent))}`,
  `${root} button{font:inherit;min-height:30px;padding:3px 10px;border:1px solid var(--ui-black-transparent,var(--dsl4-ps-border));border-radius:6px;background:var(--ui-secondary,var(--dsl4-ps-button));color:inherit;cursor:pointer}`,
  `${root} button:hover:not(:disabled){border-color:var(--looks-secondary,var(--dsl4-ps-accent))}`,
  `${root} [data-dsl4-settings-close]{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;min-height:0;padding:0;border:0;background:transparent}`,
  `${root} [data-dsl4-settings-done]{background:var(--dsl4-ps-accent);border-color:transparent;color:var(--dsl4-ps-on-accent);font-weight:600}`,
  `${root} :is(button,input):focus-visible{outline:2px solid var(--looks-secondary,var(--dsl4-ps-accent));outline-offset:2px}`,
  `${root} [hidden]{display:none!important}`,
].join('\n');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requireDocument(value: unknown) {
  if (!isRecord(value) || typeof value.createElement !== 'function') {
    throw new TypeError('document must provide createElement');
  }
  return value as unknown as Document;
}

function requireMount(value: unknown) {
  if (!isRecord(value) || typeof value.appendChild !== 'function') {
    throw new TypeError('mount must be a DOM element');
  }
  return value as unknown as HTMLElement;
}

/**
 * The playback settings screen: one place for the settings a story can use.
 *
 * It shows only what applies to the story it is opened for (see `resolveDsl4PlaybackFeatures`).
 * Sound and skip changes go to the shared preferences and apply at once; camera and Teachable
 * Machine settings open the panels that already own them. Pausing and resuming the story is the
 * caller's: this screen only says which context it was opened in and reports when it closes.
 */
export function createDsl4PlaybackSettings(options: {
  document: unknown;
  mount: unknown;
  preferences: Dsl4PlaybackPreferences;
  onClose: (context: Dsl4PlaybackSettingsContext) => unknown;
  /** Opens the camera settings; offered only while `canOpenCamera` answers true. */
  onOpenCamera?: () => unknown;
  canOpenCamera?: () => boolean;
  /** Opens the Teachable Machine compute backend settings. */
  onOpenRecognition?: () => unknown;
  onError?: (error: unknown) => unknown;
}) {
  if (!isRecord(options)) throw new TypeError('playback settings options are required');
  const document = requireDocument(options.document);
  const mount = requireMount(options.mount);
  const preferences = options.preferences;
  if (
    !isRecord(preferences) ||
    typeof preferences.getSnapshot !== 'function' ||
    typeof preferences.setChannel !== 'function' ||
    typeof preferences.setSkipOverride !== 'function'
  ) {
    throw new TypeError('preferences must be playback preferences');
  }
  if (typeof options.onClose !== 'function') throw new TypeError('onClose must be a function');
  for (const key of ['onOpenCamera', 'canOpenCamera', 'onOpenRecognition', 'onError'] as const) {
    if (options[key] !== undefined && typeof options[key] !== 'function') {
      throw new TypeError(`${key} must be a function`);
    }
  }

  const create = <K extends keyof HTMLElementTagNameMap>(tag: K) => document.createElement(tag);
  const report = (error: unknown) => {
    try {
      options.onError?.(error);
    } catch {
      // Reporting cannot replace the failure it reports.
    }
  };

  const element = create('section');
  element.setAttribute('data-dsl4-playback-settings', 'true');
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  element.hidden = true;
  element.style.cssText =
    'position:absolute;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);font:14px/1.4 sans-serif;cursor:default;';
  const themeStyle = create('style');
  themeStyle.textContent = dsl4PlaybackSettingsThemeCss;
  const panel = create('div');
  panel.setAttribute('data-dsl4-settings-panel', 'true');
  panel.style.cssText =
    'box-sizing:border-box;width:min(420px,94%);max-height:94%;overflow:auto;padding:10px 14px 12px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.35);';

  const header = create('header');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;';
  const heading = create('h2');
  const close = create('button');
  close.type = 'button';
  close.setAttribute('data-dsl4-settings-close', 'true');
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
  header.append(heading, close);

  const pausedNote = create('p');
  pausedNote.setAttribute('data-dsl4-settings-paused', 'true');

  // Progress: the skip switch.
  const progressSection = create('section');
  progressSection.setAttribute('data-dsl4-settings-section', 'progress');
  const progressHeading = create('h3');
  const skipLabel = create('label');
  const skip = create('input');
  skip.type = 'checkbox';
  skip.setAttribute('role', 'switch');
  skip.setAttribute('data-dsl4-settings-skip', 'true');
  const skipText = create('span');
  skipLabel.append(skip, skipText);
  const skipStatus = create('p');
  skipStatus.setAttribute('data-dsl4-settings-skip-status', 'true');
  const skipReset = create('button');
  skipReset.type = 'button';
  skipReset.setAttribute('data-dsl4-settings-skip-reset', 'true');
  progressSection.append(progressHeading, skipLabel, skipStatus, skipReset);

  // Sound: one switch and one slider per channel.
  const audioSection = create('section');
  audioSection.setAttribute('data-dsl4-settings-section', 'audio');
  const audioHeading = create('h3');
  audioSection.appendChild(audioHeading);
  const channelControls = (['bgm', 'effects'] as const).map((channel) => {
    const row = create('div');
    row.setAttribute('data-dsl4-settings-channel-row', channel);
    const toggleLabel = create('label');
    const toggle = create('input');
    toggle.type = 'checkbox';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('data-dsl4-settings-channel', channel);
    const name = create('span');
    toggleLabel.append(toggle, name);
    const volumeLabel = create('label');
    const volume = create('input');
    volume.type = 'range';
    volume.min = '0';
    volume.max = '100';
    volume.step = '5';
    volume.setAttribute('data-dsl4-settings-volume', channel);
    const value = create('output');
    value.setAttribute('data-dsl4-settings-volume-value', channel);
    value.style.cssText = 'min-width:3em;text-align:right;';
    volumeLabel.append(volume, value);
    row.append(toggleLabel, volumeLabel);
    audioSection.appendChild(row);
    return {channel, row, toggle, name, volume, value};
  });

  // Camera and recognition: open the panels that already own these settings.
  const recognitionSection = create('section');
  recognitionSection.setAttribute('data-dsl4-settings-section', 'recognition');
  const recognitionHeading = create('h3');
  const actions = create('div');
  actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';
  const camera = create('button');
  camera.type = 'button';
  camera.setAttribute('data-dsl4-settings-open', 'camera');
  const compute = create('button');
  compute.type = 'button';
  compute.setAttribute('data-dsl4-settings-open', 'recognition');
  actions.append(camera, compute);
  recognitionSection.append(recognitionHeading, actions);

  const empty = create('p');
  empty.setAttribute('data-dsl4-settings-empty', 'true');

  const footer = create('footer');
  footer.style.cssText = 'display:flex;justify-content:flex-end;margin-top:8px;';
  const done = create('button');
  done.type = 'button';
  done.setAttribute('data-dsl4-settings-done', 'true');
  footer.appendChild(done);

  panel.append(
    header,
    pausedNote,
    progressSection,
    audioSection,
    recognitionSection,
    empty,
    footer,
  );
  element.append(themeStyle, panel);
  mount.appendChild(element);

  let open = false;
  let disposed = false;
  let locale: Dsl4PlaybackSettingsLocale = 'en';
  let context: Dsl4PlaybackSettingsContext = 'title';
  let features: Dsl4PlaybackFeatures | null = null;
  let previousFocus: Element | null = null;

  function render() {
    if (!features) return;
    const text = labels[locale];
    const snapshot = preferences.getSnapshot();
    element.setAttribute('lang', locale);
    element.setAttribute('aria-label', text.title);
    element.setAttribute('data-dsl4-settings-context', context);
    heading.textContent = text.title;
    close.setAttribute('aria-label', text.close);
    close.setAttribute('title', text.close);
    pausedNote.textContent = text.paused;
    pausedNote.hidden = context !== 'playback';

    progressSection.hidden = !features.skip;
    progressHeading.textContent = text.progress;
    skipText.textContent = text.skip;
    skip.checked = snapshot.skipOverride ?? features.skipDefault;
    skipStatus.textContent =
      snapshot.skipOverride === null ? text.skipFollows(features.skipDefault) : text.skipOverridden;
    skipReset.textContent = text.skipReset;
    skipReset.hidden = snapshot.skipOverride === null;

    const channels: Record<Dsl4AudioChannel, boolean> = {
      bgm: features.bgm,
      effects: features.effects,
    };
    audioSection.hidden = !features.bgm && !features.effects;
    audioHeading.textContent = text.audio;
    for (const control of channelControls) {
      const preference = snapshot[control.channel];
      const label = text.channel[control.channel];
      control.row.hidden = !channels[control.channel];
      control.name.textContent = label;
      control.toggle.checked = preference.enabled;
      control.toggle.setAttribute('aria-label', `${label}: ${text.enabled}`);
      control.volume.value = String(preference.volume);
      control.volume.disabled = !preference.enabled;
      control.volume.setAttribute('aria-label', `${label}: ${text.volume}`);
      control.value.textContent = `${Math.round(preference.volume)}`;
    }

    const cameraAvailable =
      features.recognition &&
      options.onOpenCamera !== undefined &&
      (options.canOpenCamera?.() ?? true);
    const computeAvailable = features.recognition && options.onOpenRecognition !== undefined;
    camera.hidden = !cameraAvailable;
    camera.textContent = text.camera;
    compute.hidden = !computeAvailable;
    compute.textContent = text.computeBackend;
    recognitionSection.hidden = !cameraAvailable && !computeAvailable;
    recognitionHeading.textContent = text.recognition;

    empty.textContent = text.empty;
    empty.hidden = !(progressSection.hidden && audioSection.hidden && recognitionSection.hidden);
    done.textContent = text.done[context];
  }

  function hide() {
    if (!open) return;
    open = false;
    element.hidden = true;
    element.style.display = 'none';
    try {
      (previousFocus as HTMLElement | null)?.focus?.();
    } catch {
      // The element that had focus may be gone; nothing else needs it.
    }
    previousFocus = null;
  }

  function requestClose() {
    if (!open || disposed) return;
    const closedContext = context;
    hide();
    try {
      void Promise.resolve(options.onClose(closedContext)).catch(report);
    } catch (error) {
      report(error);
    }
  }

  const listeners: [EventTarget, string, (event: Event) => void, boolean][] = [];
  const listen = (
    target: EventTarget,
    type: string,
    listener: (event: Event) => void,
    capture = false,
  ) => {
    target.addEventListener(type, listener, capture);
    listeners.push([target, type, listener, capture]);
  };

  listen(close, 'click', requestClose);
  listen(done, 'click', requestClose);
  listen(skip, 'change', () => {
    try {
      preferences.setSkipOverride(skip.checked);
    } catch (error) {
      report(error);
    }
    render();
  });
  listen(skipReset, 'click', () => {
    try {
      preferences.setSkipOverride(null);
    } catch (error) {
      report(error);
    }
    render();
  });
  for (const control of channelControls) {
    listen(control.toggle, 'change', () => {
      try {
        preferences.setChannel(control.channel, {enabled: control.toggle.checked});
      } catch (error) {
        report(error);
      }
      render();
    });
    // `input` fires while dragging, so the change is heard before the slider is released.
    listen(control.volume, 'input', () => {
      try {
        preferences.setChannel(control.channel, {volume: Number(control.volume.value)});
      } catch (error) {
        report(error);
      }
      render();
    });
  }
  const run = (action: (() => unknown) | undefined) => () => {
    try {
      void Promise.resolve(action?.()).catch(report);
    } catch (error) {
      report(error);
    }
  };
  listen(camera, 'click', run(options.onOpenCamera));
  listen(compute, 'click', run(options.onOpenRecognition));
  // Clicks on the backdrop must not reach the Stage, where they would advance the story.
  listen(element, 'pointerup', (event) => event.stopPropagation());
  listen(element, 'click', (event) => {
    event.stopPropagation();
    if (event.target === element) requestClose();
  });
  // Capture Esc before the story's keymap or the editor sees it, but leave it to the camera and
  // compute panels when focus is inside one of them.
  listen(
    document,
    'keydown',
    (event) => {
      if (!open) return;
      const key = event as KeyboardEvent;
      if (key.key !== 'Escape' && key.code !== 'Escape') return;
      const target = key.target as Node | null;
      if (target && target !== document.body && !element.contains(target)) return;
      key.preventDefault();
      key.stopPropagation();
      key.stopImmediatePropagation?.();
      requestClose();
    },
    true,
  );

  return Object.freeze({
    element,
    show(state: {
      features: Dsl4PlaybackFeatures;
      locale?: Dsl4PlaybackSettingsLocale;
      context: Dsl4PlaybackSettingsContext;
    }) {
      if (disposed) throw new TypeError('playback settings are disposed');
      if (!isRecord(state) || !isRecord(state.features)) {
        throw new TypeError('playback settings require story features');
      }
      if (state.context !== 'title' && state.context !== 'playback') {
        throw new TypeError('playback settings context must be title or playback');
      }
      features = state.features;
      context = state.context;
      locale = state.locale === 'ja' ? 'ja' : 'en';
      render();
      if (!open) previousFocus = document.activeElement;
      open = true;
      element.hidden = false;
      element.style.display = 'flex';
      // Focus the top of the panel so a small Stage shows the heading, not a scrolled-down footer.
      close.focus();
    },
    /** Close without reporting, for when the caller tears the story down itself. */
    hide,
    /** Close as the person would, so the caller resumes what it paused. */
    close: requestClose,
    isOpen: () => open,
    getContext: () => (open ? context : null),
    refresh: render,
    dispose() {
      if (disposed) return;
      disposed = true;
      open = false;
      for (const [target, type, listener, capture] of listeners.splice(0)) {
        target.removeEventListener(type, listener, capture);
      }
      element.remove();
    },
  });
}

export type Dsl4PlaybackSettings = ReturnType<typeof createDsl4PlaybackSettings>;
