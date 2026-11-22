/**
 * The one owner of the Teachable Machine browser runtime (TensorFlow.js) in a page.
 *
 * The Standard bundle no longer carries TensorFlow.js. Its Teachable Machine member is the upstream
 * lightweight extension, and the reviewed `runtime.js` with its backends lives on the Kamishibai
 * site under the Teachable Machine version it was built from. This owner loads that runtime the
 * first time recognition needs it: from the site, checked with Subresource Integrity, or — for a
 * work built for a network-free venue — from the copy the work carries in its extension storage.
 *
 * The Kamishibai runtime hands Teachable Machine a compute controller and a pose runtime that wait
 * for this owner, and the member asks the same owner before it would load the site copy itself, so a
 * page loads the runtime once, and a story without recognition never loads it.
 */

export const dsl4TMRuntimeOwnerKey = '@kubohiroya/turbowarp-kamishibai-app/tm-runtime';
const runtimeVersionKey = '@kubohiroya/turbowarp-teachable-machine/runtime';

export const dsl4TMOfflineRuntimeStoragePaths = Object.freeze({
  bundled:
    'extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4.tmRuntime',
  unbundled: 'extensionStorage.kubohiroyakamishibairuntime4.tmRuntime',
});

export type Dsl4TMRuntimeSite = Readonly<{
  version: string;
  runtimeUrl: string;
  integrity: string;
}>;

/** The whole runtime as one script, carried by a work built for a network-free venue. */
export type Dsl4TMOfflineRuntime = Readonly<{
  formatVersion: 1;
  encoding: 'text';
  version: string;
  sha256: string;
  source: string;
}>;

type ComputeSelection = Readonly<Record<string, unknown>>;

export type Dsl4TMComputeController = Readonly<{
  select(mode?: unknown): Promise<ComputeSelection>;
  getSelection(): ComputeSelection | null;
  getBackend(): string;
}>;

export type Dsl4TMPoseRuntime = Readonly<{
  Webcam: new (width: number, height: number, flipHorizontal: boolean) => unknown;
  loadFromFiles(...args: unknown[]): Promise<unknown>;
}>;

type RuntimeGlobals = {
  tf?: unknown;
  tmPose?: {Webcam?: unknown; loadFromFiles?: unknown};
  tmImage?: unknown;
  tmAudio?: unknown;
  tmCompute?: {select?: unknown; getSelection?: unknown; getBackend?: unknown};
} & Record<PropertyKey, unknown>;

type ScriptElement = {
  src: string;
  integrity?: string;
  crossOrigin?: string | null;
  async?: boolean;
  addEventListener(type: 'load' | 'error', listener: () => void, options?: {once?: boolean}): void;
  remove?(): void;
};

type DocumentLike = {
  createElement(tag: 'script'): ScriptElement;
  head?: {appendChild(node: ScriptElement): unknown} | null;
  documentElement?: {appendChild(node: ScriptElement): unknown} | null;
};

type Digest = Pick<SubtleCrypto, 'digest'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function runtimeError(code: string, message: string, cause?: unknown) {
  const error = new Error(message, cause === undefined ? undefined : {cause});
  Object.defineProperty(error, 'code', {value: code});
  return error;
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

/** Find the offline runtime a work carries, in either storage channel. */
export function readDsl4TMOfflineRuntime(extensionStorage: unknown): unknown {
  if (!isRecord(extensionStorage)) return undefined;
  const unbundled = isRecord(extensionStorage.kubohiroyakamishibairuntime4)
    ? extensionStorage.kubohiroyakamishibairuntime4
    : {};
  const bundled = isRecord(extensionStorage.kubohiroyakamishibai4)
    ? extensionStorage.kubohiroyakamishibai4
    : {};
  const components = isRecord(bundled.components) ? bundled.components : {};
  const bundledRuntime = isRecord(components.kubohiroyakamishibairuntime4)
    ? components.kubohiroyakamishibairuntime4
    : {};
  const found = [unbundled.tmRuntime, bundledRuntime.tmRuntime].filter(
    (value) => value !== undefined,
  );
  if (found.length > 1) {
    throw runtimeError(
      'K4-TM-RUNTIME-003',
      'The Teachable Machine runtime is stored in both storage channels',
    );
  }
  return found[0];
}

/** Check the shape of an offline runtime; the bytes are verified when it is loaded. */
export function validateDsl4TMOfflineRuntime(value: unknown): Dsl4TMOfflineRuntime {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(',') !== 'encoding,formatVersion,sha256,source,version' ||
    value.formatVersion !== 1 ||
    value.encoding !== 'text' ||
    typeof value.version !== 'string' ||
    typeof value.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(value.sha256) ||
    typeof value.source !== 'string' ||
    value.source.length === 0
  ) {
    throw runtimeError('K4-TM-RUNTIME-003', 'The stored Teachable Machine runtime is malformed');
  }
  return value as Dsl4TMOfflineRuntime;
}

/** Build the offline runtime record a network-free build stores in the work. */
export async function createDsl4TMOfflineRuntime(
  source: string,
  version: string,
  subtleCrypto: Digest | undefined = globalThis.crypto?.subtle,
): Promise<Dsl4TMOfflineRuntime> {
  if (!subtleCrypto) throw new TypeError('SubtleCrypto digest is required');
  const sha256 = hex(await subtleCrypto.digest('SHA-256', new TextEncoder().encode(source)));
  return Object.freeze({formatVersion: 1, encoding: 'text', version, sha256, source});
}

export type Dsl4TMRuntimeOwner = Readonly<{
  /** Whether the reviewed runtime this build pins is already in the page. */
  isLoaded(): boolean;
  /** Load the runtime once; a failed load can be tried again. */
  ensure(): Promise<void>;
  compute: Dsl4TMComputeController;
  poseRuntime: Dsl4TMPoseRuntime;
}>;

export function createDsl4TMRuntimeOwner(options: {
  site: Dsl4TMRuntimeSite;
  globalObject?: Record<PropertyKey, unknown>;
  document?: DocumentLike | null;
  /** The offline runtime the current work carries, if any. */
  readOfflineRuntime?: () => unknown;
  subtleCrypto?: Digest;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
}): Dsl4TMRuntimeOwner {
  const site = options.site;
  if (
    !isRecord(site) ||
    typeof site.version !== 'string' ||
    typeof site.runtimeUrl !== 'string' ||
    typeof site.integrity !== 'string' ||
    !site.integrity.startsWith('sha384-')
  ) {
    throw new TypeError(
      'The Teachable Machine runtime site must name a version, URL and integrity',
    );
  }
  const globalObject = (options.globalObject ?? globalThis) as RuntimeGlobals;
  let pending: Promise<void> | null = null;

  function runtimeVersion() {
    const record = globalObject[Symbol.for(runtimeVersionKey)];
    return isRecord(record) && typeof record.version === 'string' ? record.version : null;
  }

  function isLoaded() {
    const present =
      globalObject.tf !== undefined &&
      isRecord(globalObject.tmPose) &&
      globalObject.tmImage !== undefined &&
      globalObject.tmAudio !== undefined &&
      isRecord(globalObject.tmCompute);
    if (!present) return false;
    const version = runtimeVersion();
    if (version !== site.version) {
      throw runtimeError(
        'K4-TM-RUNTIME-002',
        `The page already runs Teachable Machine runtime ${version ?? '(unknown)'}, ` +
          `but this work needs ${site.version}`,
      );
    }
    return true;
  }

  function documentOrFail(): DocumentLike {
    const document = options.document === undefined ? globalThis.document : options.document;
    if (!document || typeof document.createElement !== 'function') {
      throw runtimeError('K4-TM-RUNTIME-001', 'Loading the Teachable Machine runtime needs a page');
    }
    return document as unknown as DocumentLike;
  }

  function appendScript(configure: (script: ScriptElement) => void, description: string) {
    const document = documentOrFail();
    return new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.async = true;
      script.addEventListener('load', () => resolve(), {once: true});
      script.addEventListener(
        'error',
        () => {
          script.remove?.();
          reject(
            runtimeError(
              'K4-TM-RUNTIME-001',
              `The Teachable Machine runtime could not be loaded from ${description}`,
            ),
          );
        },
        {once: true},
      );
      configure(script);
      const parent = document.head ?? document.documentElement;
      if (!parent) {
        reject(runtimeError('K4-TM-RUNTIME-001', 'The page has nowhere to load a script'));
        return;
      }
      parent.appendChild(script);
    });
  }

  async function loadOffline(stored: unknown) {
    const runtime = validateDsl4TMOfflineRuntime(stored);
    if (runtime.version !== site.version) {
      throw runtimeError(
        'K4-TM-RUNTIME-002',
        `The work carries Teachable Machine runtime ${runtime.version}, but this build needs ${site.version}`,
      );
    }
    const subtleCrypto = options.subtleCrypto ?? globalThis.crypto?.subtle;
    if (!subtleCrypto) {
      throw runtimeError('K4-TM-RUNTIME-003', 'Verifying the stored runtime needs SubtleCrypto');
    }
    const sha256 = hex(
      await subtleCrypto.digest('SHA-256', new TextEncoder().encode(runtime.source)),
    );
    if (sha256 !== runtime.sha256) {
      throw runtimeError('K4-TM-RUNTIME-003', 'The stored Teachable Machine runtime was altered');
    }
    const createObjectURL = options.createObjectURL ?? globalThis.URL?.createObjectURL;
    const revokeObjectURL = options.revokeObjectURL ?? globalThis.URL?.revokeObjectURL;
    if (typeof createObjectURL === 'function' && typeof Blob === 'function') {
      const url = createObjectURL(new Blob([runtime.source], {type: 'text/javascript'}));
      try {
        await appendScript((script) => {
          script.src = url;
        }, 'the work');
      } finally {
        revokeObjectURL?.(url);
      }
      return;
    }
    await appendScript((script) => {
      script.src = `data:text/javascript;charset=utf-8,${encodeURIComponent(runtime.source)}`;
    }, 'the work');
  }

  async function load() {
    const stored = options.readOfflineRuntime?.();
    if (stored !== undefined) {
      await loadOffline(stored);
    } else {
      await appendScript((script) => {
        script.src = site.runtimeUrl;
        script.integrity = site.integrity;
        script.crossOrigin = 'anonymous';
      }, site.runtimeUrl);
    }
    if (!isLoaded()) {
      throw runtimeError(
        'K4-TM-RUNTIME-001',
        'The Teachable Machine runtime loaded but did not publish its globals',
      );
    }
  }

  function ensure() {
    if (isLoaded()) return Promise.resolve();
    if (!pending) {
      const attempt = load();
      pending = attempt;
      attempt.catch(() => {
        if (pending === attempt) pending = null;
      });
    }
    return pending;
  }

  function loaded() {
    if (!isLoaded()) {
      throw runtimeError('K4-TM-RUNTIME-004', 'The Teachable Machine runtime is not loaded yet');
    }
    return globalObject as Required<RuntimeGlobals>;
  }

  const compute: Dsl4TMComputeController = Object.freeze({
    async select(mode?: unknown) {
      await ensure();
      const controller = loaded().tmCompute as unknown as Dsl4TMComputeController;
      return controller.select(mode);
    },
    getSelection() {
      if (!isLoaded()) return null;
      return (loaded().tmCompute as unknown as Dsl4TMComputeController).getSelection();
    },
    getBackend() {
      if (!isLoaded()) return '';
      return (loaded().tmCompute as unknown as Dsl4TMComputeController).getBackend();
    },
  });

  // Teachable Machine settles the compute backend (and so loads the runtime) before it creates a
  // webcam or a model, so the pose runtime only forwards once the runtime is there.
  const Webcam = function LazyWebcam(
    this: unknown,
    width: number,
    height: number,
    flipHorizontal: boolean,
  ) {
    if (new.target === undefined) throw new TypeError('Webcam must be constructed with new');
    const RealWebcam = loaded().tmPose.Webcam as Dsl4TMPoseRuntime['Webcam'];
    return new RealWebcam(width, height, flipHorizontal);
  } as unknown as Dsl4TMPoseRuntime['Webcam'];

  const poseRuntime: Dsl4TMPoseRuntime = Object.freeze({
    Webcam,
    async loadFromFiles(...args: unknown[]) {
      await ensure();
      const runtime = loaded().tmPose as unknown as Dsl4TMPoseRuntime;
      return runtime.loadFromFiles(...args);
    },
  });

  return Object.freeze({isLoaded, ensure, compute, poseRuntime});
}

/** Publish the owner where the Teachable Machine member looks for it. The latest owner wins. */
export function installDsl4TMRuntimeOwner(
  owner: Dsl4TMRuntimeOwner,
  globalObject: Record<PropertyKey, unknown> = globalThis as unknown as Record<
    PropertyKey,
    unknown
  >,
) {
  Object.defineProperty(globalObject, Symbol.for(dsl4TMRuntimeOwnerKey), {
    value: Object.freeze({ensure: () => owner.ensure()}),
    configurable: true,
    enumerable: false,
    writable: false,
  });
}
