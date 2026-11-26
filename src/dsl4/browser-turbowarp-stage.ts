import {fitDsl4PublicationStage} from './browser-stage-layout.js';
import {createTurboWarpRuntimeHost} from '@kubohiroya/turbowarp-runtime-adapter';

import type {Dsl4PreviewDocument, Dsl4PreviewElement} from './preview-dom.js';
import {deepFreeze} from './story-document.js';
import {createDsl4RetryableCleanup} from './retryable-cleanup.js';
import {createDsl4FailedCreationOwners} from './failed-creation-owners.js';
import {dsl4BrowserPreviewArtifactLimits} from './browser-preview-artifact-limits.js';
import {resolveDsl4Viewport, applyDsl4Viewport} from './viewport.js';

export const dsl4BrowserTurboWarpStageDefaults = deepFreeze({
  maxProjectBytes: dsl4BrowserPreviewArtifactLimits.defaults.maxProjectBytes,
  stageWidth: 480,
  stageHeight: 360,
});

export const dsl4BrowserTurboWarpStageMaximumProjectBytes =
  dsl4BrowserPreviewArtifactLimits.absoluteMaximums.maxProjectBytes;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeInteger(value: unknown, name: string, minimum: number) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new TypeError(`${name} must be a safe integer >= ${minimum}`);
  }
  return Number(value);
}

type Dsl4BrowserTurboWarpFunction = (...parameters: unknown[]) => unknown;

interface Dsl4BrowserTurboWarpPlatform {
  createVm(): unknown;
  createRenderer(canvas: Dsl4BrowserTurboWarpCanvas): unknown;
  createAudioEngine(): unknown;
  createStorage(): unknown;
  createBitmapAdapter(): unknown;
  disposeRenderer(renderer: unknown, reason: string): unknown;
  disposeAudioEngine(audioEngine: unknown, reason: string): unknown;
  disposeStorage(storage: unknown, reason: string): unknown;
  disposeBitmapAdapter(bitmapAdapter: unknown, reason: string): unknown;
}

interface Dsl4BrowserTurboWarpVm {
  runtime: Record<string, unknown>;
  securityManager: {canLoadExtensionFromProject?: () => boolean};
  attachStorage(storage: unknown): unknown;
  attachRenderer(renderer: unknown): unknown;
  attachAudioEngine(audioEngine: unknown): unknown;
  attachV2BitmapAdapter(bitmapAdapter: unknown): unknown;
  setCompatibilityMode(enabled: boolean): unknown;
  setTurboMode(enabled: boolean): unknown;
  setCompilerOptions(options: Readonly<{enabled: boolean}>): unknown;
  loadProject(projectBytes: Uint8Array): unknown;
  postIOData(device: string, data: Readonly<Record<string, unknown>>): unknown;
  start(): unknown;
  clear(): unknown;
  quit(): unknown;
}

interface Dsl4BrowserTurboWarpCanvas extends Dsl4PreviewElement {
  width: number;
  height: number;
  dataset: Record<string, string>;
  getBoundingClientRect(): Readonly<{left: number; top: number; width: number; height: number}>;
  focus(options?: Readonly<{preventScroll?: boolean}>): void;
}

interface Dsl4BrowserTurboWarpMount extends Dsl4PreviewElement {
  removeChild(child: Dsl4PreviewElement): unknown;
}

interface Dsl4BrowserPointerEvent {
  button?: number;
  clientX?: number;
  clientY?: number;
  preventDefault?(): unknown;
}

interface Dsl4BrowserKeyboardEvent {
  key?: string;
}

interface Dsl4BrowserTurboWarpCostume {
  name?: string;
}

interface Dsl4BrowserTurboWarpStageTarget {
  sprite?: {costumes?: Dsl4BrowserTurboWarpCostume[]};
  getCostumes?(): Dsl4BrowserTurboWarpCostume[];
  setCostume?(index: number): unknown;
}

function requiredFunction<T extends Dsl4BrowserTurboWarpFunction>(value: unknown, name: string): T {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
  return value as T;
}

function validatePlatform(value: unknown) {
  if (!isRecord(value)) throw new TypeError('TurboWarp browser platform must be an object');
  const methods = [
    'createVm',
    'createRenderer',
    'createAudioEngine',
    'createStorage',
    'createBitmapAdapter',
    'disposeRenderer',
    'disposeAudioEngine',
    'disposeStorage',
    'disposeBitmapAdapter',
  ] as const;
  // Keyed by the method names that were checked, so an unvalidated member is a compile error.
  return Object.freeze(
    Object.fromEntries(methods.map((name) => [name, requiredFunction(value[name], name)])),
  ) as unknown as Dsl4BrowserTurboWarpPlatform;
}

function validateVm(value: unknown) {
  if (!isRecord(value)) throw new TypeError('createVm must return a TurboWarp VM object');
  const methods = [
    'attachStorage',
    'attachRenderer',
    'attachAudioEngine',
    'attachV2BitmapAdapter',
    'setCompatibilityMode',
    'setTurboMode',
    'setCompilerOptions',
    'loadProject',
    'postIOData',
    'start',
    'clear',
    'quit',
  ];
  for (const name of methods) requiredFunction(value[name], `TurboWarp VM ${name}`);
  if (!isRecord(value.runtime) || !isRecord(value.securityManager)) {
    throw new TypeError('TurboWarp VM must expose runtime and securityManager');
  }
  return value as unknown as Dsl4BrowserTurboWarpVm;
}

function validateMount(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.appendChild !== 'function' ||
    typeof value.removeChild !== 'function'
  ) {
    throw new TypeError('mount must be a DOM element');
  }
  return value as unknown as Dsl4BrowserTurboWarpMount;
}

function validateDocument(value: unknown) {
  if (!isRecord(value) || typeof value.createElement !== 'function') {
    throw new TypeError('document must provide createElement');
  }
  return value as unknown as Dsl4PreviewDocument;
}

function projectBytes(input: unknown, maximum: number) {
  if (!(input instanceof Uint8Array)) {
    throw new TypeError('projectBytes must be a Uint8Array');
  }
  if (input.byteLength < 1 || input.byteLength > maximum) {
    throw new TypeError(`projectBytes must contain 1-${maximum} bytes`);
  }
  return new Uint8Array(input);
}

function pointerData(canvas: Dsl4BrowserTurboWarpCanvas, event: Dsl4BrowserPointerEvent) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: Number(event.clientX) - Number(bounds.left),
    y: Number(event.clientY) - Number(bounds.top),
    canvasWidth: Number(bounds.width),
    canvasHeight: Number(bounds.height),
  };
}

/**
 * Own one browser TurboWarp VM and visible stage for the lifetime of a local preview page.
 * Runtime sessions may use getRuntime after start; this owner never starts the green flag.
 */
export function createDsl4BrowserTurboWarpStage(options: {
  document: unknown;
  mount: unknown;
  projectBytes: Uint8Array;
  platform: unknown;
  maxProjectBytes?: number;
  stageWidth?: number;
  stageHeight?: number;
  viewport?: unknown;
  hostLayout?: boolean;
  prepareVm?: (vm: Dsl4BrowserTurboWarpVm) => unknown | Promise<unknown>;
}) {
  if (!isRecord(options)) throw new TypeError('TurboWarp browser stage options are required');
  const document = validateDocument(options.document);
  const mount = validateMount(options.mount);
  const platform = validatePlatform(options.platform);
  const maximum = safeInteger(
    options.maxProjectBytes ?? dsl4BrowserTurboWarpStageDefaults.maxProjectBytes,
    'maxProjectBytes',
    1,
  );
  if (maximum > dsl4BrowserTurboWarpStageMaximumProjectBytes) {
    throw new TypeError(
      `maxProjectBytes must be <= ${dsl4BrowserTurboWarpStageMaximumProjectBytes}`,
    );
  }
  const viewport =
    options.viewport === undefined ? undefined : resolveDsl4Viewport(options.viewport);
  const width = safeInteger(
    viewport?.width ?? options.stageWidth ?? dsl4BrowserTurboWarpStageDefaults.stageWidth,
    'stageWidth',
    1,
  );
  const height = safeInteger(
    viewport?.height ?? options.stageHeight ?? dsl4BrowserTurboWarpStageDefaults.stageHeight,
    'stageHeight',
    1,
  );
  if (width * height > 4_194_304) {
    throw new TypeError('stage dimensions must not exceed 4194304 pixels');
  }
  if (options.prepareVm !== undefined && typeof options.prepareVm !== 'function') {
    throw new TypeError('prepareVm must be a function');
  }
  let baseProjectBytes = projectBytes(options.projectBytes, maximum);

  const canvasCandidate = document.createElement('canvas');
  if (
    !isRecord(canvasCandidate) ||
    typeof canvasCandidate.addEventListener !== 'function' ||
    typeof canvasCandidate.removeEventListener !== 'function' ||
    typeof canvasCandidate.getBoundingClientRect !== 'function' ||
    typeof canvasCandidate.setAttribute !== 'function' ||
    !isRecord(canvasCandidate.dataset) ||
    !isRecord(canvasCandidate.style)
  ) {
    throw new TypeError('document.createElement must create a canvas-like element');
  }
  const canvas = canvasCandidate as unknown as Dsl4BrowserTurboWarpCanvas;
  canvas.width = width;
  canvas.height = height;
  canvas.tabIndex = 0;
  canvas.dataset.dsl4TurboWarpStage = 'true';
  canvas.setAttribute('aria-label', 'TurboWarp project stage');
  canvas.style.aspectRatio = `${width} / ${height}`;
  canvas.style.display = 'block';
  canvas.style.height = 'auto';
  canvas.style.maxWidth = '100%';
  canvas.style.width = `${width}px`;

  // Speech bubbles are DOM overlays the renderer owns but never mounts, so the stage stacks them
  // over its own canvas the way the TurboWarp player does.
  const stageLayers = document.createElement('div') as Dsl4PreviewElement & {
    dataset: Record<string, string>;
  };
  const stageLayersDataset = stageLayers.dataset;
  stageLayersDataset.dsl4TurboWarpStageLayers = 'true';
  const stageLayersStyle = stageLayers.style as Record<string, string>;
  stageLayersStyle.display = 'block';
  stageLayersStyle.position = 'relative';
  stageLayersStyle.width = 'fit-content';
  stageLayersStyle.maxWidth = '100%';
  if (viewport) stageLayersStyle.containerType = 'inline-size';
  const appendStageLayer = (child: unknown) =>
    (stageLayers.appendChild as (value: unknown) => unknown).call(stageLayers, child);
  appendStageLayer(canvas);

  const stageRoot =
    viewport && !options.hostLayout
      ? (document.createElement('div') as typeof stageLayers)
      : stageLayers;
  if (stageRoot !== stageLayers) {
    Object.assign(stageRoot.style as object, {position: 'absolute'});
    stageRoot.appendChild(stageLayers);
  }
  let releaseViewportLayout: (() => void) | null = null;
  let restoreMountLayout: (() => void) | null = null;
  function activateViewportLayout() {
    if (!viewport || options.hostLayout) return;
    const nativeMount = mount as unknown as HTMLElement;
    const oldPosition = nativeMount.style.position,
      oldOverflow = nativeMount.style.overflow;
    const position = nativeMount.ownerDocument.defaultView?.getComputedStyle(nativeMount).position;
    if (!position || position === 'static') nativeMount.style.position = 'relative';
    nativeMount.style.overflow = 'hidden';
    restoreMountLayout = () => {
      nativeMount.style.position = oldPosition;
      nativeMount.style.overflow = oldOverflow;
    };
    releaseViewportLayout = fitDsl4PublicationStage({
      mount: nativeMount,
      element: stageRoot as unknown as HTMLElement,
      canvas: canvas as unknown as HTMLCanvasElement,
      width,
      height,
      fit: viewport.fit,
    });
  }

  let status = 'idle';
  let disposed = false;
  let disposeRequested = false;
  let vm: Dsl4BrowserTurboWarpVm | null = null;
  let vmCandidate: unknown = null;
  let runtimeHost: ReturnType<typeof createTurboWarpRuntimeHost> | null = null;
  let renderer: unknown = null;
  let audioEngine: unknown = null;
  let storage: unknown = null;
  let bitmapAdapter: unknown = null;
  let mounted = false;
  let inputAttached = false;
  let startPromise: Promise<Readonly<Record<string, unknown>>> | null = null;
  let resetPromise: Promise<Readonly<Record<string, unknown>>> | null = null;
  let cleanupPromise: Promise<void> | null = null;
  let disposePromise: Promise<Readonly<Record<string, unknown>>> | null = null;

  function snapshot() {
    const targets = runtimeHost ? runtimeHost.targets() : [];
    return deepFreeze({
      version: 1,
      status,
      ready: status === 'ready',
      disposed,
      targetCount: targets.length,
      hasStage: targets.some((target: unknown) => isRecord(target) && target.isStage === true),
      dimensions: {width, height},
    });
  }

  function handlePointerMove(event: Dsl4BrowserPointerEvent) {
    if (disposeRequested || disposed || !vm) return;
    vm.postIOData('mouse', pointerData(canvas, event));
  }

  function handlePointerDown(event: Dsl4BrowserPointerEvent) {
    if (disposeRequested || disposed || !vm || Number(event.button ?? 0) !== 0) return;
    canvas.focus?.({preventScroll: true});
    vm.postIOData('mouse', {...pointerData(canvas, event), isDown: true});
    event.preventDefault?.();
  }

  function handlePointerUp(event: Dsl4BrowserPointerEvent) {
    if (disposeRequested || disposed || !vm || Number(event.button ?? 0) !== 0) return;
    vm.postIOData('mouse', {...pointerData(canvas, event), isDown: false});
  }

  function handleKeyDown(event: Dsl4BrowserKeyboardEvent) {
    if (disposeRequested || disposed) return;
    vm?.postIOData('keyboard', {key: String(event.key ?? ''), isDown: true});
  }

  function handleKeyUp(event: Dsl4BrowserKeyboardEvent) {
    if (disposeRequested || disposed) return;
    vm?.postIOData('keyboard', {key: String(event.key ?? ''), isDown: false});
  }

  const inputListeners = [
    ['pointermove', handlePointerMove],
    ['pointerdown', handlePointerDown],
    ['pointerup', handlePointerUp],
    ['pointercancel', handlePointerUp],
    ['keydown', handleKeyDown],
    ['keyup', handleKeyUp],
  ] as const;
  const attached = new Set<number>();
  function attachInput() {
    if (inputAttached) return;
    inputListeners.forEach(([type, handler], index) => {
      attached.add(index);
      canvas.addEventListener(type, handler);
    });
    inputAttached = true;
  }
  function detachInput() {
    const errors: unknown[] = [];
    for (const index of attached) {
      const [type, handler] = inputListeners[index]!;
      try {
        canvas.removeEventListener(type, handler);
        attached.delete(index);
      } catch (error) {
        errors.push(error);
      }
    }
    inputAttached = attached.size > 0;
    if (errors.length) throw new AggregateError(errors, 'Stage input cleanup failed');
  }

  /**
   * scratch-render keeps its overlay container detached until a host mounts it, so anything drawn
   * there — Bubble speech, for one — stays invisible. Position it over the canvas and keep it
   * transparent to input, so stage pointer advance still reaches the canvas underneath.
   */
  function mountRendererOverlays(created: unknown) {
    if (!isRecord(created)) return;
    const overlays = created.overlayContainer;
    if (!isRecord(overlays) || !isRecord(overlays.style)) return;
    const style = overlays.style as Record<string, string>;
    style.position = 'absolute';
    style.left = '0';
    style.top = '0';
    style.pointerEvents = 'none';
    appendStageLayer(overlays);
  }

  let vmCleared = false,
    vmQuit = false;
  const failedCreations = createDsl4FailedCreationOwners('Stage factory cleanup failed');
  const resources = createDsl4RetryableCleanup({
    message: 'TurboWarp browser stage cleanup failed',
    steps: [
      {run: failedCreations.drain, isPending: failedCreations.hasPendingCleanup},
      detachInput,
      () => {
        releaseViewportLayout?.();
        releaseViewportLayout = null;
        restoreMountLayout?.();
        restoreMountLayout = null;
      },
      async () => {
        if (isRecord(vmCandidate) && typeof vmCandidate.clear === 'function')
          await vmCandidate.clear();
        vmCleared = true;
        if (vmQuit) vm = vmCandidate = null;
        runtimeHost = null;
      },
      async () => {
        if (isRecord(vmCandidate) && typeof vmCandidate.quit === 'function')
          await vmCandidate.quit();
        vmQuit = true;
        if (vmCleared) vm = vmCandidate = null;
      },
      async (reason) => {
        if (bitmapAdapter !== null) await platform.disposeBitmapAdapter(bitmapAdapter, reason);
        bitmapAdapter = null;
      },
      async (reason) => {
        if (audioEngine !== null) await platform.disposeAudioEngine(audioEngine, reason);
        audioEngine = null;
      },
      async (reason) => {
        if (renderer !== null) await platform.disposeRenderer(renderer, reason);
        renderer = null;
      },
      async (reason) => {
        if (storage !== null) await platform.disposeStorage(storage, reason);
        storage = null;
      },
      () => {
        if (mounted) mount.removeChild(stageRoot);
        mounted = false;
      },
      () => {
        baseProjectBytes.fill(0);
        baseProjectBytes = new Uint8Array(0);
      },
    ],
  });
  let cleanupRunning: Promise<void> | null = null;
  function cleanup(reason: string) {
    const operation = resources.run(reason);
    cleanupPromise = cleanupRunning = operation;
    const settled = () => {
      if (cleanupRunning === operation) cleanupRunning = null;
    };
    void operation.then(settled, settled);
    return operation;
  }

  function start() {
    if (disposed || disposeRequested) throw new TypeError('TurboWarp browser stage is disposed');
    if (status === 'ready') return Promise.resolve(snapshot());
    if (resetPromise) return resetPromise;
    if (startPromise) return startPromise;
    if (status !== 'idle') {
      throw new TypeError(`TurboWarp browser stage cannot start from status ${status}`);
    }
    status = 'starting';
    const priorCleanup = cleanupPromise;
    // Publish startup before DOM/platform callbacks can synchronously request disposal.
    startPromise = Promise.resolve().then(async () => {
      try {
        mount.appendChild(stageRoot);
        mounted = true;
        storage = await platform.createStorage();
        renderer = await platform.createRenderer(canvas);
        mountRendererOverlays(renderer);
        audioEngine = await platform.createAudioEngine();
        bitmapAdapter = await platform.createBitmapAdapter();
        vmCandidate = await platform.createVm();
        vm = validateVm(vmCandidate);
        runtimeHost = createTurboWarpRuntimeHost({runtime: vm.runtime});
        vm.attachStorage(storage);
        vm.attachRenderer(renderer);
        vm.attachAudioEngine(audioEngine);
        vm.attachV2BitmapAdapter(bitmapAdapter);
        vm.setCompatibilityMode(false);
        vm.setTurboMode(false);
        vm.setCompilerOptions({enabled: false});
        vm.securityManager.canLoadExtensionFromProject = () => false;
        await options.prepareVm?.(vm);
        await vm.loadProject(baseProjectBytes);
        if (viewport) {
          applyDsl4Viewport(runtimeHost.runtime, viewport);
          const nativeRenderer = renderer as {resize?: (width: number, height: number) => void};
          nativeRenderer.resize?.(width, height);
          activateViewportLayout();
        }
        if (disposeRequested) {
          await cleanup('dispose-during-start');
          status = 'disposed';
          disposed = true;
          return snapshot();
        }
        vm.start();
        attachInput();
        status = 'ready';
        return snapshot();
      } catch (error) {
        failedCreations.retain(error);
        status = 'failed';
        try {
          if (cleanupPromise && cleanupPromise !== priorCleanup) await cleanupPromise;
          else await cleanup('start-failed');
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            'TurboWarp browser stage startup and cleanup failed',
          );
        }
        throw error;
      } finally {
        startPromise = null;
      }
    });
    return startPromise;
  }

  function resetManagedPresentation() {
    if (disposed || disposeRequested) {
      throw new TypeError('TurboWarp browser stage is disposed');
    }
    if (resetPromise) return resetPromise;
    if (status !== 'ready' || !vm) {
      throw new TypeError('TurboWarp browser stage is not ready');
    }
    const activeVm = vm;
    status = 'resetting';
    let resolve!: (state: ReturnType<typeof snapshot>) => void;
    let reject!: (error: unknown) => void;
    const operation = new Promise<ReturnType<typeof snapshot>>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    // Keep synchronous input detachment, but publish reset before input/VM callbacks run.
    resetPromise = operation;
    void (async () => {
      try {
        detachInput();
        if (disposeRequested) return snapshot();
        await activeVm.loadProject(baseProjectBytes);
        if (viewport) applyDsl4Viewport(runtimeHost!.runtime, viewport);
        if (!disposeRequested) {
          attachInput();
          status = 'ready';
        }
        return snapshot();
      } catch (error) {
        failedCreations.retain(error);
        status = 'failed';
        try {
          await cleanup('reset-failed');
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            'TurboWarp browser stage reset and cleanup failed',
          );
        }
        throw error;
      } finally {
        resetPromise = null;
      }
    })().then(resolve, reject);
    return operation;
  }

  function getRuntime() {
    if (status !== 'ready' || !runtimeHost) {
      throw new TypeError('TurboWarp browser stage is not ready');
    }
    return runtimeHost.runtime;
  }

  function getCanvas() {
    if (status !== 'ready') throw new TypeError('TurboWarp browser stage is not ready');
    return canvas;
  }

  function getPresentationElements() {
    return Object.freeze({canvas: getCanvas(), stageLayers});
  }

  function showApplicationMenu(locale: 'en' | 'ja') {
    if (status !== 'ready' || !runtimeHost) {
      throw new TypeError('TurboWarp browser stage is not ready');
    }
    const stage = runtimeHost.getStageTarget() as Dsl4BrowserTurboWarpStageTarget;
    const costumeName = locale === 'ja' ? 'MenuRuntime' : 'Menu';
    const stageCostumes = stage?.sprite?.costumes ?? stage?.getCostumes?.() ?? [];
    const stageIndex = stageCostumes.findIndex(
      (costume: Dsl4BrowserTurboWarpCostume) => costume?.name === costumeName,
    );
    if (stageIndex >= 0) stage.setCostume?.(stageIndex);
    canvas.style.cursor = 'pointer';
  }

  function showApplicationTitle(locale: 'en' | 'ja') {
    if (status !== 'ready' || !runtimeHost) {
      throw new TypeError('TurboWarp browser stage is not ready');
    }
    const stage = runtimeHost.getStageTarget() as Dsl4BrowserTurboWarpStageTarget;
    const costumeName = locale === 'ja' ? 'TitleRuntime' : 'Title';
    const stageCostumes = stage?.sprite?.costumes ?? stage?.getCostumes?.() ?? [];
    const stageIndex = stageCostumes.findIndex(
      (costume: Dsl4BrowserTurboWarpCostume) => costume?.name === costumeName,
    );
    if (stageIndex >= 0) stage.setCostume?.(stageIndex);
    canvas.style.cursor = 'pointer';
  }

  function hideApplicationOverlay() {
    if (status !== 'ready') throw new TypeError('TurboWarp browser stage is not ready');
    canvas.style.cursor = 'auto';
  }

  function dispose() {
    if (disposePromise) return disposePromise;
    disposeRequested = true;
    disposed = true;
    status = 'disposing';
    const pendingCleanup = cleanupRunning;
    const priorCleanup = cleanupPromise;
    const waitingForOperation = startPromise !== null || resetPromise !== null;
    const operation = Promise.resolve().then(async () => {
      if (startPromise) await startPromise.catch(() => {});
      if (resetPromise) await resetPromise.catch(() => {});
      if (pendingCleanup) await pendingCleanup;
      else if (waitingForOperation && cleanupPromise && cleanupPromise !== priorCleanup)
        await cleanupPromise;
      else await cleanup('dispose');
      status = 'disposed';
      return snapshot();
    });
    disposePromise = operation;
    const settled = () => {
      status = 'disposed';
      disposePromise = null;
    };
    void operation.then(settled, settled);
    return operation;
  }

  return Object.freeze({
    start,
    resetManagedPresentation,
    dispose,
    getRuntime,
    getCanvas,
    getPresentationElements,
    showApplicationMenu,
    showApplicationTitle,
    hideApplicationOverlay,
    getState: snapshot,
    hasPendingCleanup: resources.hasPendingCleanup,
    get cleanupCompletion() {
      return cleanupPromise;
    },
  });
}
