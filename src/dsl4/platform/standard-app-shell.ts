import {createDsl4RetryableCleanup} from '../retryable-cleanup.js';
import {
  createDsl4CreationCleanup,
  cleanupDsl4FailedCreation,
  dsl4FailedCreationCleanupSteps,
} from '../creation-cleanup.js';
import type {Dsl4PreviewDocument, Dsl4PreviewElement} from '../preview-dom.js';
import {resolveDsl4FeatureFlags} from '../feature-flags.js';
import {deepFreeze} from '../story-document.js';
import {createDsl4IndeterminateProgressIndicator} from './indeterminate-progress-indicator.js';
import {createDsl4LoadingScreenPresenter} from './loading-screen-presenter.js';
import {createDsl4TurboWarpRuntimeHost} from './turbowarp-runtime-host.js';

const optionKeys = new Set([
  'createRuntimeHost',
  'document',
  'featureFlags',
  'mount',
  'progressIndicator',
  'poseFeedbackLabels',
  'runtimeHostOptions',
  'surface',
  'title',
]);
const runtimeHostReservedKeys = new Set(['featureFlags', 'poseFeedbackPresenter']);
const supportedSurfaces = new Set(['webPlayer', 'regularEditor', 'packager', 'developmentPreview']);

type StandardAppShellLocale = 'en' | 'ja';

interface StandardAppShellLocalizedTitle {
  title: string;
  officialWebsite: string;
  close: string;
  language: string;
}

interface StandardAppShellTitleOptions {
  locales: Record<StandardAppShellLocale, StandardAppShellLocalizedTitle>;
  version: string;
  officialWebsiteUrl: string;
  initialLocale?: StandardAppShellLocale;
}

interface StandardRuntimeHost {
  dispose(reason: string): unknown;
  hasPendingCleanup?(): boolean;
}

/**
 * A runtime host startup diagnostic. The host reports these as plain records, so the shell only
 * declares the members its callers read and leaves each value unvalidated.
 */
export interface StandardRuntimeHostDiagnostic {
  readonly message?: unknown;
  readonly code?: unknown;
}

interface StandardRuntimeHostResult {
  ok: boolean;
  enabled: true;
  diagnostics: readonly StandardRuntimeHostDiagnostic[];
  host?: StandardRuntimeHost | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireElement(value: unknown, name: string) {
  if (!isRecord(value) || typeof value.appendChild !== 'function') {
    throw new TypeError(`${name} must be a DOM element`);
  }
  return value as unknown as Dsl4PreviewElement;
}

function requireDocument(value: unknown) {
  if (!isRecord(value) || typeof value.createElement !== 'function') {
    throw new TypeError('document must provide the DOM document contract');
  }
  return value as unknown as Dsl4PreviewDocument;
}

function requireSurface(value: unknown) {
  if (typeof value !== 'string' || !supportedSurfaces.has(value)) {
    throw new TypeError(`surface must be one of ${[...supportedSurfaces].sort().join(', ')}`);
  }
  return value;
}

function requireRuntimeHostOptions(value: unknown) {
  if (!isRecord(value)) throw new TypeError('runtimeHostOptions must be an object');
  const reserved = Object.keys(value).filter((key) => runtimeHostReservedKeys.has(key));
  if (reserved.length > 0) {
    throw new TypeError(
      `runtimeHostOptions cannot override Standard app-shell option: ${reserved.sort().join(', ')}`,
    );
  }
  return value;
}

function requireProgressIndicatorOptions(value: unknown) {
  if (!isRecord(value)) throw new TypeError('progressIndicator must be an object');
  return value;
}

function requireTitleOptions(value: unknown) {
  if (!isRecord(value)) throw new TypeError('title must be an object');
  const locales = value.locales;
  if (!isRecord(locales)) throw new TypeError('title.locales must be an object');
  for (const locale of ['en', 'ja']) {
    const localized = locales[locale];
    if (!isRecord(localized)) throw new TypeError(`title.locales.${locale} must be an object`);
    for (const key of ['title', 'officialWebsite', 'close', 'language']) {
      if (typeof localized[key] !== 'string' || localized[key].length === 0) {
        throw new TypeError(`title.locales.${locale}.${key} must be a non-empty string`);
      }
    }
  }
  if (typeof value.version !== 'string' || value.version.length === 0) {
    throw new TypeError('title.version must be a non-empty string');
  }
  if (typeof value.officialWebsiteUrl !== 'string' || value.officialWebsiteUrl.length === 0) {
    throw new TypeError('title.officialWebsiteUrl must be a non-empty string');
  }
  if (
    value.initialLocale !== undefined &&
    (typeof value.initialLocale !== 'string' || !['en', 'ja'].includes(value.initialLocale))
  ) {
    throw new TypeError('title.initialLocale must be en or ja');
  }
  return value as unknown as Readonly<StandardAppShellTitleOptions>;
}

/** @returns {'en' | 'ja'} */
function resolveBrowserTitleLocale() {
  const browserNavigator = globalThis.navigator;
  const preferred =
    typeof browserNavigator?.language === 'string'
      ? browserNavigator.language
      : Array.isArray(browserNavigator?.languages) &&
          typeof browserNavigator.languages[0] === 'string'
        ? browserNavigator.languages[0]
        : '';
  return /^ja(?:-|$)/iu.test(preferred) ? 'ja' : 'en';
}

function isRuntimeHostResult(value: unknown): value is StandardRuntimeHostResult {
  if (
    !isRecord(value) ||
    typeof value.ok !== 'boolean' ||
    value.enabled !== true ||
    !Array.isArray(value.diagnostics)
  ) {
    return false;
  }
  if (!value.ok) return value.host === null || value.host === undefined;
  return isRecord(value.host) && typeof value.host.dispose === 'function';
}

/**
 * Create the shared Standard app-shell composition for production and development surfaces.
 * The pose feedback mount is created lazily. The TurboWarp host only reads the presenter
 * configuration for `feedback.mode: presenter`, so flag-off and Scratch modes do not inspect DOM.
 */
export async function createDsl4StandardAppShell(
  options: {
    featureFlags?: unknown;
    surface?: 'webPlayer' | 'regularEditor' | 'packager' | 'developmentPreview';
    document?: unknown;
    mount?: unknown;
    progressIndicator?: Readonly<Record<string, unknown>>;
    poseFeedbackLabels?: Readonly<Record<string, unknown>>;
    runtimeHostOptions?: Readonly<Record<string, unknown>>;
    title?: Readonly<Record<string, unknown>>;
    createRuntimeHost?: (options: Record<string, unknown>) => Promise<unknown>;
  } = {},
) {
  if (!isRecord(options)) throw new TypeError('Standard app-shell options must be an object');
  const unknown = Object.keys(options).filter((key) => !optionKeys.has(key));
  if (unknown.length > 0) {
    throw new TypeError(`Unknown Standard app-shell option: ${unknown.sort().join(', ')}`);
  }
  const featureFlags = resolveDsl4FeatureFlags(options.featureFlags);
  if (!featureFlags.dsl4AppShell) {
    const snapshot = deepFreeze({
      version: 1,
      enabled: false,
      disposed: false,
      surface: null,
      featureFlags,
    });
    return Object.freeze({
      ok: true,
      enabled: false,
      featureFlags,
      surface: null,
      element: null,
      titleElement: null,
      runtimeHost: null,
      diagnostics: [],
      hasPendingCleanup: () => false,
      getSnapshot: () => snapshot,
      dispose: async () => snapshot,
    });
  }

  const surface = requireSurface(options.surface);
  const progressIndicatorOptions =
    options.progressIndicator === undefined
      ? {}
      : requireProgressIndicatorOptions(options.progressIndicator);
  const runtimeHostOptions = requireRuntimeHostOptions(options.runtimeHostOptions);
  const titleOptions = options.title === undefined ? null : requireTitleOptions(options.title);
  const createRuntimeHost = options.createRuntimeHost ?? createDsl4TurboWarpRuntimeHost;
  if (typeof createRuntimeHost !== 'function') {
    throw new TypeError('createRuntimeHost must be a function');
  }

  let disposed = false;
  let root: Dsl4PreviewElement | null = null;
  let poseFeedbackMount: Dsl4PreviewElement | null = null;
  let titleMount: Dsl4PreviewElement | null = null;
  let disposeTitle: (() => unknown) | null = null;
  let runtimeOwner: StandardRuntimeHost | null = null;
  let runtimeResult: StandardRuntimeHostResult | null = null;
  let disposePromise: Promise<Readonly<Record<string, unknown>>> | null = null;
  let progressIndicator: ReturnType<typeof createDsl4IndeterminateProgressIndicator> | null = null;
  let loadingPresenter: ReturnType<typeof createDsl4LoadingScreenPresenter> | null = null;

  function ensureTitleMount() {
    if (disposed || titleOptions === null || titleMount) return titleMount;
    if (options.document === undefined) return null;
    let document;
    let mount;
    try {
      document = requireDocument(options.document);
      mount = requireElement(options.mount ?? document.body, 'mount');
    } catch {
      return null;
    }
    // The embedded extension loader supplies a minimal script-only document while it bootstraps.
    // Do not treat that loader shim as a browser UI surface.
    if (Array.isArray(document.scripts)) return null;
    const create = (tagName: string): Dsl4PreviewElement | null => {
      const element = document.createElement(tagName);
      return isRecord(element) && typeof element.appendChild === 'function' ? element : null;
    };
    const rootElement = create('section');
    if (!rootElement) return null;
    const panel = document.createElement('div');
    const heading = document.createElement('h1');
    const version = document.createElement('p');
    const official = document.createElement('button');
    const close = document.createElement('button');
    const language = document.createElement('button');
    const elements = [panel, heading, version, official, close, language];
    if (
      elements.some(
        (element) =>
          !isRecord(element) ||
          typeof element.appendChild !== 'function' ||
          typeof element.addEventListener !== 'function',
      )
    ) {
      return null;
    }
    titleMount = rootElement;
    let restoreMountPosition: (() => void) | null = null;
    let removeOfficial: (() => unknown) | null = null;
    let removeLanguage: (() => unknown) | null = null;
    let removeClose: (() => unknown) | null = null;
    let removeBackground: (() => unknown) | null = null;
    const titleSteps: (() => unknown)[] = [
      () => removeOfficial?.(),
      () => removeLanguage?.(),
      () => removeClose?.(),
      () => removeBackground?.(),
      () => rootElement.remove(),
      () => restoreMountPosition?.(),
    ];
    // Register ownership before styling, mounting, or listener setup can throw.
    const titleCleanup = createDsl4RetryableCleanup({
      steps: titleSteps,
      message: 'Standard title disposal failed',
    });
    disposeTitle = () => titleCleanup.run();
    if (mount !== document.body && isRecord(mount.style)) {
      const previousPosition = mount.style.position;
      if (previousPosition === undefined || previousPosition === '') {
        mount.style.position = 'relative';
        restoreMountPosition = () => {
          mount.style.position = previousPosition ?? '';
        };
      }
    }
    const style = (element: Dsl4PreviewElement, value: string) => {
      if (isRecord(element) && isRecord(element.style)) element.style.cssText = value;
    };
    style(
      rootElement,
      'position:absolute;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.35);font-family:sans-serif;',
    );
    rootElement.style.display = 'none';
    rootElement.style.position = 'absolute';
    rootElement.style.cursor = 'pointer';
    style(
      panel,
      'position:static;min-width:280px;max-width:90%;padding:36px 28px 28px;text-align:center;background:#f4fffb;border:1px solid #007d66;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.3);color:#006b58;',
    );
    panel.style.position = 'static';
    panel.style.cursor = 'pointer';
    style(
      close,
      'position:absolute;top:16px;right:16px;width:32px;height:32px;border:0;border-radius:50%;background:#007d66;color:#fff;font-size:22px;line-height:28px;cursor:pointer;',
    );
    close.style.position = 'absolute';
    close.style.cursor = 'pointer';
    style(
      language,
      'position:absolute;top:18px;left:16px;border:0;background:transparent;color:#007d66;font-size:14px;cursor:pointer;',
    );
    language.style.position = 'absolute';
    language.style.cursor = 'pointer';
    style(
      official,
      'display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:8px 18px;border:0;border-radius:10px;background:#007d66;color:#fff;font-size:16px;cursor:pointer;',
    );
    official.style.cursor = 'pointer';
    style(heading, 'margin:0 24px 8px;font-size:30px;font-weight:600;');
    style(version, 'margin:0 0 22px;font-size:14px;');
    close.type = 'button';
    language.type = 'button';
    official.type = 'button';
    close.textContent = '×';
    rootElement.setAttribute('data-dsl4-title-shell', 'true');
    rootElement.setAttribute('role', 'dialog');
    rootElement.setAttribute('aria-modal', 'true');
    panel.appendChild(language);
    panel.appendChild(close);
    panel.appendChild(heading);
    panel.appendChild(version);
    panel.appendChild(official);
    rootElement.appendChild(panel);
    mount.appendChild(rootElement);

    let locale = titleOptions.initialLocale ?? resolveBrowserTitleLocale();
    let titleStarted = false;
    const render = () => {
      const localized = titleOptions.locales[locale];
      heading.textContent = localized.title;
      version.textContent = titleOptions.version;
      official.textContent = localized.officialWebsite;
      official.setAttribute('aria-label', localized.officialWebsite);
      close.setAttribute('aria-label', localized.close);
      language.textContent = localized.language;
      language.setAttribute('aria-label', localized.language);
    };
    const openOfficialWebsite = () => {
      if (disposed) return;
      const opener = globalThis.open;
      if (typeof opener === 'function') {
        opener(titleOptions.officialWebsiteUrl, '_blank', 'noopener,noreferrer');
      } else if (isRecord(globalThis.location)) {
        globalThis.location.href = titleOptions.officialWebsiteUrl;
      }
    };
    const hideTitle = () => {
      if (isRecord(rootElement.style)) rootElement.style.display = 'none';
    };
    const closeTitle = () => {
      if (disposed) return;
      if (typeof runtimeHostOptions.onCloseTitle === 'function') {
        runtimeHostOptions.onCloseTitle();
      }
      startTitle();
    };
    const startTitle = () => {
      if (disposed) return;
      if (titleStarted) {
        hideTitle();
        return;
      }
      titleStarted = true;
      hideTitle();
      if (typeof runtimeHostOptions.onTitleStart === 'function') {
        runtimeHostOptions.onTitleStart();
      }
    };
    const toggleTitleLanguage = () => {
      if (disposed) return;
      locale = locale === 'ja' ? 'en' : 'ja';
      render();
      if (typeof runtimeHostOptions.onLanguageChange === 'function') {
        runtimeHostOptions.onLanguageChange(locale);
      }
    };
    const startFromBackground = (event: {target?: unknown} | null | undefined) => {
      const target = event?.target;
      if (target === official || target === close || target === language) return;
      startTitle();
    };
    removeOfficial = () => official.removeEventListener('click', openOfficialWebsite);
    removeLanguage = () => language.removeEventListener('click', toggleTitleLanguage);
    removeClose = () => close.removeEventListener('click', closeTitle);
    removeBackground = () => rootElement.removeEventListener('click', startFromBackground);
    official.addEventListener('click', openOfficialWebsite);
    language.addEventListener('click', toggleTitleLanguage);
    close.addEventListener('click', closeTitle);
    rootElement.addEventListener('click', startFromBackground);
    render();
    return titleMount;
  }

  function ensurePoseFeedbackMount() {
    if (disposed) throw new TypeError('Standard app shell is disposed');
    if (poseFeedbackMount) return poseFeedbackMount;
    const document = requireDocument(options.document);
    const mount = requireElement(options.mount, 'mount');
    root = document.createElement('section');
    root.setAttribute('data-dsl4-app-shell', 'standard');
    root.setAttribute('data-dsl4-surface', surface);
    poseFeedbackMount = document.createElement('div');
    poseFeedbackMount.setAttribute('data-dsl4-pose-feedback-mount', 'true');
    root.appendChild(poseFeedbackMount);
    mount.appendChild(root);
    return poseFeedbackMount;
  }

  function ensureProgressIndicator() {
    if (progressIndicator) return progressIndicator;
    if (options.document === undefined) return null;
    const document = requireDocument(options.document);
    const mount = options.mount ?? document.body;
    if (mount === undefined || mount === null) return null;
    progressIndicator = createDsl4IndeterminateProgressIndicator({
      document,
      mount,
      ...progressIndicatorOptions,
    });
    return progressIndicator;
  }

  function ensureLoadingPresenter() {
    if (loadingPresenter) return loadingPresenter;
    if (options.document === undefined) return null;
    const document = requireDocument(options.document);
    const mount = options.mount ?? document.body;
    if (mount === undefined || mount === null) return null;
    loadingPresenter = createDsl4LoadingScreenPresenter({document, mount});
    return loadingPresenter;
  }

  function setLoading(
    payload: Readonly<Record<string, unknown>>,
    context: Readonly<Record<string, unknown>>,
  ) {
    const visible = isRecord(payload) && payload.visible === true;
    if (!disposed && (visible || loadingPresenter)) {
      ensureLoadingPresenter()?.setLoading(payload);
    }
    if (!disposed && (visible || progressIndicator)) {
      ensureProgressIndicator()?.setBusy({
        visible,
        source: 'assets',
        label: 'Loading assets',
        cursor: 'wait',
      });
    }
    const delegate = runtimeHostOptions.setLoading;
    if (typeof delegate !== 'function') throw new TypeError('setLoading must be a function');
    return delegate(payload, context);
  }

  function setBusy(
    payload: Readonly<{visible: boolean; source: string; label: string; cursor?: string}>,
  ) {
    try {
      if (!disposed) ensureProgressIndicator()?.setBusy(payload);
    } catch {
      // Busy indicators are non-authoritative and cannot change runtime execution.
    }
    const delegate = runtimeHostOptions.setBusy;
    if (typeof delegate !== 'function') return undefined;
    try {
      return delegate(payload);
    } catch {
      return undefined;
    }
  }

  function setCursor(payload: Readonly<{visible: boolean; source?: string; cursor: string}>) {
    try {
      if (!disposed && payload?.visible) ensureProgressIndicator()?.setCursor(payload);
      else if (!disposed && progressIndicator) progressIndicator.setCursor(payload);
    } catch {
      // Cursor styling is non-authoritative and cannot change runtime execution semantics.
    }
    const delegate = runtimeHostOptions.setCursor;
    if (typeof delegate !== 'function') return undefined;
    try {
      return delegate(payload);
    } catch {
      return undefined;
    }
  }

  const cleanupSteps = [
    {
      run: (reason: string) => runtimeOwner?.dispose(reason),
      isPending: () => runtimeOwner?.hasPendingCleanup?.() ?? false,
    },
    async () => {
      await progressIndicator?.dispose();
      progressIndicator = null;
    },
    async () => {
      await loadingPresenter?.dispose();
      loadingPresenter = null;
    },
    async () => {
      await disposeTitle?.();
      disposeTitle = null;
      titleMount = null;
    },
    () => {
      root?.remove();
      root = null;
      poseFeedbackMount = null;
    },
  ];
  const cleanup = createDsl4RetryableCleanup({
    steps: cleanupSteps,
    message: 'Standard app-shell disposal failed',
    parallel: true,
  });

  const poseFeedbackPresenter: Record<string, unknown> = {};
  Object.defineProperty(poseFeedbackPresenter, 'container', {
    enumerable: true,
    get: ensurePoseFeedbackMount,
  });
  if (Object.hasOwn(options, 'poseFeedbackLabels')) {
    Object.defineProperty(poseFeedbackPresenter, 'labels', {
      enumerable: true,
      get() {
        return options.poseFeedbackLabels;
      },
    });
  }

  try {
    ensureTitleMount();
    const hostOptions = {
      ...runtimeHostOptions,
      setBusy,
      setCursor,
      onEvent(event: Readonly<Record<string, unknown>>) {
        if (event?.type === 'runtime.start' && isRecord(titleMount?.style)) {
          titleMount.style.display = 'none';
        }
        return typeof runtimeHostOptions.onEvent === 'function'
          ? runtimeHostOptions.onEvent(event)
          : undefined;
      },
      ...(typeof runtimeHostOptions.setLoading === 'function' ? {setLoading} : {}),
    };
    const runtimeCandidate = await createRuntimeHost({
      ...hostOptions,
      featureFlags,
      poseFeedbackPresenter,
    });
    if (
      isRecord(runtimeCandidate) &&
      isRecord(runtimeCandidate.host) &&
      typeof runtimeCandidate.host.dispose === 'function'
    ) {
      runtimeOwner = runtimeCandidate.host as unknown as StandardRuntimeHost;
    }
    if (!isRuntimeHostResult(runtimeCandidate)) {
      throw new TypeError('createRuntimeHost must return a valid enabled runtime host result');
    }
    runtimeResult = runtimeCandidate;
  } catch (error) {
    disposed = true;
    const failedCleanup = createDsl4CreationCleanup(
      [...dsl4FailedCreationCleanupSteps(error), ...cleanupSteps],
      'Standard app-shell creation cleanup failed',
      true,
    );
    await cleanupDsl4FailedCreation(
      error,
      failedCleanup,
      runtimeOwner ? 'invalid-standard-app-shell-result' : 'standard-app-shell-creation-failed',
      'Standard app-shell creation failed',
    );
    throw error;
  }
  function snapshot() {
    return deepFreeze({
      version: 1,
      enabled: true,
      disposed,
      surface,
      featureFlags,
      runtimeEnabled: runtimeResult?.enabled === true,
      runtimeOk: runtimeResult?.ok === true,
      poseFeedbackMounted: root !== null,
    });
  }

  function dispose(reason = 'app-shell-dispose') {
    if (disposePromise) return disposePromise;
    if (typeof reason !== 'string' || reason.length === 0) {
      return Promise.reject(new TypeError('dispose reason must be a non-empty string'));
    }
    disposed = true;
    let resolve!: (value: Readonly<Record<string, unknown>>) => void;
    let reject!: (error: unknown) => void;
    const operation = new Promise<Readonly<Record<string, unknown>>>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    // Publish the public snapshot promise before child cleanup can reenter the shell.
    disposePromise = operation;
    void cleanup.run(reason).then(
      () => {
        disposePromise = null;
        resolve(snapshot());
      },
      (error) => {
        disposePromise = null;
        reject(error);
      },
    );
    return operation;
  }

  return Object.freeze({
    ok: runtimeResult.ok,
    enabled: true,
    featureFlags,
    surface,
    get element() {
      return root ?? titleMount;
    },
    get titleElement() {
      return titleMount;
    },
    runtimeHost: runtimeResult.host ?? null,
    diagnostics: runtimeResult.diagnostics ?? [],
    showTitle() {
      if (!disposed && titleMount) titleMount.style.display = 'flex';
    },
    hideTitle() {
      if (!disposed && titleMount) titleMount.style.display = 'none';
    },
    openOfficialWebsite() {
      if (!disposed && titleMount) {
        const button = titleMount.children?.[0]?.children?.[4];
        if (isRecord(button) && typeof button.click === 'function') button.click();
      }
    },
    toggleTitleLanguage() {
      if (!disposed && titleMount) {
        const button = titleMount.children?.[0]?.children?.[0];
        if (isRecord(button) && typeof button.click === 'function') button.click();
      }
    },
    hasPendingCleanup: cleanup.hasPendingCleanup,
    getSnapshot: snapshot,
    dispose,
  });
}
