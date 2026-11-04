import {createAssetManagerComposition} from '@kubohiroya/turbowarp-asset-cache/composition';
import type {TurboWarpRuntimeHost} from '@kubohiroya/turbowarp-runtime-adapter';

import type {Dsl4CompositionMethod} from './composition-contract.js';
import {createDsl4ObjectUrlOwner, type Dsl4ObjectUrlOwner} from './object-url-owner.js';

const supportedKinds = new Set(['backdrop', 'costume', 'image', 'sound']);
const bitmapFilePattern = /\.(?:png|jpe?g|webp)(?:[?#].*)?$/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function adapterError(code: string, message: string) {
  const error = new Error(message);
  Object.defineProperty(error, 'code', {value: code});
  return error;
}

function abortError() {
  const error = new Error('Asset Manager preparation was cancelled');
  error.name = 'AbortError';
  return error;
}

function requireNonEmptyString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.length === 0) {
    throw adapterError('K4-ASSET-ADAPTER-001', `${label} must be a non-empty string`);
  }
  return value;
}

function declaredBitmapResolution(asset: Record<string, unknown>, label: string) {
  if (asset.kind !== 'backdrop' && asset.kind !== 'costume') {
    if (Object.hasOwn(asset, 'bitmapResolution')) {
      throw adapterError(
        'K4-ASSET-ADAPTER-001',
        `${label} bitmapResolution is only valid for backdrop and costume assets`,
      );
    }
    return undefined;
  }
  const value = asset.bitmapResolution ?? 1;
  if (value !== 1 && value !== 2) {
    throw adapterError('K4-ASSET-ADAPTER-001', `${label} bitmapResolution must be 1 or 2`);
  }
  return value as 1 | 2;
}

/**
 * Keep SVG and project assets on their existing registration path. The upstream composition
 * accepts bitmapResolution only for raster MIME types; file-backed assets expose their MIME
 * through the source filename, while verified remote assets provide Content-Type directly.
 */
function embeddedBitmapResolution(
  asset: Record<string, unknown>,
  sourceName: string,
  mimeType: string,
) {
  const resolution = declaredBitmapResolution(asset, `Asset ${String(asset.id)}`);
  if (resolution === undefined) return undefined;
  const mediaType = (mimeType.split(';', 1)[0] ?? '').trim().toLowerCase();
  const isRasterMime = mediaType.startsWith('image/') && mediaType !== 'image/svg+xml';
  const isRasterPath = mediaType.length === 0 && bitmapFilePattern.test(sourceName);
  return isRasterMime || isRasterPath ? resolution : undefined;
}

/**
 * The slice of `@kubohiroya/turbowarp-runtime-adapter` this adapter reads.
 *
 * The host is optional: an adapter built without one simply does not resolve project targets, the
 * mode most callers use. When one is supplied its accessors are strict, so a malformed runtime is
 * reported instead of silently degrading to the logical target name.
 */
type RuntimeHostPort = Pick<TurboWarpRuntimeHost, 'spriteTargets' | 'getStageTarget'>;

function validateRuntimeHost(value: unknown): RuntimeHostPort | null {
  if (value === undefined) return null;
  if (
    !isRecord(value) ||
    typeof value.spriteTargets !== 'function' ||
    typeof value.getStageTarget !== 'function'
  ) {
    throw adapterError(
      'K4-ASSET-ADAPTER-001',
      'asset manager runtimeHost must be a TurboWarp runtime host',
    );
  }
  return value as unknown as RuntimeHostPort;
}

function projectAssetLocator(
  asset: Record<string, unknown>,
  source: Record<string, unknown>,
  runtimeHost: RuntimeHostPort | null,
  implicitProjectActors: ReadonlySet<string>,
) {
  const name = requireNonEmptyString(source.name, 'project asset name');
  if (asset.kind === 'backdrop') return Object.freeze({kind: 'backdrop', name});
  if (asset.kind === 'sound')
    return Object.freeze({
      kind: 'sound',
      name,
      ...(typeof asset.target === 'string'
        ? {target: resolveProjectTargetName(runtimeHost, asset.target)}
        : {}),
    });
  if (asset.kind === 'image') {
    throw adapterError(
      'K4-ASSET-ADAPTER-002',
      'Target-independent image assets must use embedded or remote delivery',
    );
  }
  const logicalTarget = requireNonEmptyString(asset.target, 'costume target');
  const target = resolveProjectTargetName(
    runtimeHost,
    logicalTarget,
    !implicitProjectActors.has(logicalTarget),
  );
  return Object.freeze({kind: 'costume', target, name});
}

function projectSpriteName(target: unknown) {
  if (!isRecord(target) || !isRecord(target.sprite)) return null;
  return typeof target.sprite.name === 'string' && target.sprite.name.length > 0
    ? target.sprite.name
    : null;
}

function actorVariableMatches(target: unknown, actorId: string) {
  if (!isRecord(target) || typeof target.lookupVariableByNameAndType !== 'function') return false;
  const variable = target.lookupVariableByNameAndType('actorName', '');
  return isRecord(variable) && variable.value === actorId;
}

/**
 * Resolve a DSL actor ID to the physical project sprite name used by project assets.
 *
 * The 3.2 base project keeps all story actors on a physical `Actor` sprite and stores the
 * logical actor ID in its `actorName` variable. Asset Manager resolves project costumes by
 * physical sprite name, so passing the logical ID directly produces a missing-source error.
 */
export function resolveProjectTargetName(
  runtimeHost: Pick<RuntimeHostPort, 'spriteTargets'> | null,
  logicalTarget: string,
  preferActor = false,
) {
  if (runtimeHost === null) return logicalTarget;
  const targets = runtimeHost.spriteTargets().filter((target) => isRecord(target));
  const named = targets.some((target) => projectSpriteName(target) === logicalTarget);
  if (named && !preferActor) return logicalTarget;
  const actorMatches = targets.filter((target) => actorVariableMatches(target, logicalTarget));
  const actorTarget =
    actorMatches.find((target) => target.isOriginal === true) ?? actorMatches[0] ?? null;
  const resolvedName = projectSpriteName(actorTarget);
  if (resolvedName !== null) return resolvedName;
  if (named) return logicalTarget;
  const templateNames = new Set(
    targets
      .filter((target) => actorVariableMatches(target, '_template_'))
      .map(projectSpriteName)
      .filter((name) => name !== null),
  );
  return templateNames.size === 1 ? [...templateNames][0] : logicalTarget;
}

function projectAssetReadiness(
  locator: Record<string, unknown>,
  runtimeHost: RuntimeHostPort | null,
) {
  if (runtimeHost === null) return 'unknown';
  let target: unknown = null;
  if (locator.kind === 'backdrop' || !Object.hasOwn(locator, 'target')) {
    target = runtimeHost.getStageTarget();
  } else {
    target = runtimeHost
      .spriteTargets()
      .find((candidate) => isRecord(candidate) && projectSpriteName(candidate) === locator.target);
  }
  if (!isRecord(target) || !isRecord(target.sprite)) return 'unknown';
  const collection = locator.kind === 'sound' ? target.sprite.sounds : target.sprite.costumes;
  if (!Array.isArray(collection)) return 'unknown';
  const source = collection.find(
    (candidate) => isRecord(candidate) && candidate.name === locator.name,
  );
  if (!source) return 'missing';
  if (locator.kind === 'sound') return source.soundId ? 'ready' : 'pending';
  return typeof source.skinId === 'number' ? 'ready' : 'pending';
}

async function waitForProjectAsset(
  locator: Record<string, unknown>,
  runtimeHost: RuntimeHostPort | null,
  signal: AbortSignal | null,
) {
  const timeoutMilliseconds = 15_000;
  const pollMilliseconds = 50;
  const deadline = Date.now() + timeoutMilliseconds;
  while (true) {
    if (signal?.aborted) throw abortError();
    const readiness = projectAssetReadiness(locator, runtimeHost);
    if (readiness !== 'pending' || Date.now() >= deadline) return;
    await new Promise((resolve) => setTimeout(resolve, pollMilliseconds));
  }
}

function validateComposition(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.registerProjectAsset !== 'function' ||
    typeof value.registerEmbeddedAsset !== 'function' ||
    typeof value.releaseAsset !== 'function'
  ) {
    throw new TypeError(
      'Asset Manager composition must provide registerProjectAsset, registerEmbeddedAsset, and releaseAsset',
    );
  }
  return value as Record<
    'registerProjectAsset' | 'registerEmbeddedAsset' | 'releaseAsset',
    Dsl4CompositionMethod
  >;
}

function validateSignal(value: unknown) {
  if (value === undefined) return null;
  if (
    !isRecord(value) ||
    typeof value.aborted !== 'boolean' ||
    typeof value.addEventListener !== 'function' ||
    typeof value.removeEventListener !== 'function'
  ) {
    throw adapterError('K4-ASSET-ADAPTER-001', 'asset preparation signal is invalid');
  }
  return value as unknown as AbortSignal;
}

/**
 * Adapt validated DSL 4.0 image/audio materialization to one private Asset Manager composition.
 * This module is intentionally outside the core DSL 4.0 index. The app shell imports it only
 * after the startup-fixed DSL 4.0 flag has been enabled.
 */
export function createDsl4AssetManagerAdapter(
  options: {
    composition?: unknown;
    createComposition?: () => unknown;
    runtimeHost?: unknown;
    implicitProjectActors?: readonly string[];
    createObjectURL?: (blob: Blob) => string;
    revokeObjectURL?: (url: string) => void;
    /** Shared Object URL owner; images with equal verified integrity keep one URL. */
    objectUrlOwner?: Dsl4ObjectUrlOwner;
  } = {},
) {
  if (!isRecord(options)) throw new TypeError('asset manager adapter options must be an object');
  if (
    options.objectUrlOwner !== undefined &&
    (options.createObjectURL !== undefined || options.revokeObjectURL !== undefined)
  ) {
    throw new TypeError('Provide either objectUrlOwner or Object URL functions, not both');
  }
  const runtimeHost = validateRuntimeHost(options.runtimeHost);
  const implicitProjectActors = new Set(options.implicitProjectActors ?? []);
  if (options.composition !== undefined && options.createComposition !== undefined) {
    throw new TypeError('Provide either composition or createComposition, not both');
  }
  if (options.createComposition !== undefined && typeof options.createComposition !== 'function') {
    throw new TypeError('createComposition must be a function');
  }
  if (options.createObjectURL !== undefined && typeof options.createObjectURL !== 'function') {
    throw new TypeError('createObjectURL must be a function');
  }
  if (options.revokeObjectURL !== undefined && typeof options.revokeObjectURL !== 'function') {
    throw new TypeError('revokeObjectURL must be a function');
  }
  const hasInjectedObjectUrlOwner = options.createObjectURL !== undefined;
  if (hasInjectedObjectUrlOwner !== (options.revokeObjectURL !== undefined)) {
    throw new TypeError('createObjectURL and revokeObjectURL must be provided together');
  }
  const composition = validateComposition(
    options.composition ??
      ((options.createComposition ?? createAssetManagerComposition) as () => unknown)(),
  );
  const ownedResources = new WeakSet();
  const releasedResources = new WeakSet();
  const releasedRegistrations = new WeakSet();
  const revokedResources = new WeakSet();
  const imageLeases = new WeakMap<object, unknown>();
  let objectUrls: Dsl4ObjectUrlOwner | null = options.objectUrlOwner ?? null;
  if (!objectUrls && hasInjectedObjectUrlOwner) {
    objectUrls = createDsl4ObjectUrlOwner({
      createObjectURL: options.createObjectURL as (blob: Blob) => string,
      revokeObjectURL: options.revokeObjectURL as (url: string) => void,
    });
  } else if (!objectUrls) {
    const urlOwner = globalThis.URL;
    if (
      typeof urlOwner?.createObjectURL === 'function' &&
      typeof urlOwner?.revokeObjectURL === 'function'
    ) {
      objectUrls = createDsl4ObjectUrlOwner({
        createObjectURL: urlOwner.createObjectURL.bind(urlOwner),
        revokeObjectURL: urlOwner.revokeObjectURL.bind(urlOwner),
      });
    }
  }

  return Object.freeze({
    /**
     */
    async prepare(payload: unknown, context: unknown = {}) {
      if (!isRecord(payload) || !isRecord(payload.asset) || !Array.isArray(payload.files)) {
        throw adapterError(
          'K4-ASSET-ADAPTER-001',
          'asset manager payload must provide an asset record and files array',
        );
      }
      if (!isRecord(context)) {
        throw adapterError('K4-ASSET-ADAPTER-001', 'asset preparation context must be an object');
      }
      const asset = payload.asset;
      const assetId = requireNonEmptyString(asset.id, 'asset id');
      const assetKind = requireNonEmptyString(asset.kind, 'asset kind');
      declaredBitmapResolution(asset, `Asset ${assetId}`);
      if (!supportedKinds.has(assetKind)) {
        throw adapterError(
          'K4-ASSET-ADAPTER-002',
          `Asset Manager does not support DSL 4.0 asset kind: ${assetKind}`,
        );
      }
      if (!isRecord(asset.source)) {
        throw adapterError('K4-ASSET-ADAPTER-001', `Asset ${assetId} source is invalid`);
      }
      const source = asset.source;
      const signal = validateSignal(context.signal);
      if (signal?.aborted) throw abortError();

      let projectRegistration: Readonly<Record<string, unknown>> | null = null;
      let embeddedRegistration: Readonly<Record<string, unknown>> | null = null;
      let imageBytes: Uint8Array | null = null;
      let imageIntegrity: unknown = null;
      if (source.type === 'project') {
        if (payload.files.length !== 0) {
          throw adapterError(
            'K4-ASSET-ADAPTER-001',
            `Project asset ${assetId} must not provide embedded files`,
          );
        }
        projectRegistration = Object.freeze({
          name: assetId,
          nameMode: 'literal',
          locator: projectAssetLocator(asset, source, runtimeHost, implicitProjectActors),
        });
      } else if (source.type === 'file' || source.type === 'remote') {
        if (payload.files.length !== 1 || !isRecord(payload.files[0])) {
          throw adapterError(
            'K4-ASSET-ADAPTER-003',
            `Materialized ${assetKind} asset ${assetId} must contain exactly one file`,
          );
        }
        const file = payload.files[0];
        const sourceName = requireNonEmptyString(file.path, 'materialized asset source');
        if (!(file.bytes instanceof Uint8Array) || file.bytes.byteLength === 0) {
          throw adapterError(
            'K4-ASSET-ADAPTER-001',
            `Embedded asset ${assetId} bytes must be a non-empty Uint8Array`,
          );
        }
        const bitmapResolution = embeddedBitmapResolution(
          asset,
          sourceName,
          source.type === 'remote' ? String(file.contentType ?? '') : '',
        );
        embeddedRegistration = Object.freeze({
          name: assetId,
          nameMode: 'literal',
          sourceName,
          mimeType:
            source.type === 'remote'
              ? requireNonEmptyString(file.contentType, 'remote asset Content-Type')
              : '',
          bytes: file.bytes,
          ...(bitmapResolution === undefined ? {} : {bitmapResolution}),
        });
        if (assetKind === 'image') {
          imageBytes = new Uint8Array(file.bytes);
          imageIntegrity = file.integrity;
        }
      } else {
        throw adapterError('K4-ASSET-ADAPTER-001', `Asset ${assetId} source type is unsupported`);
      }
      if (assetKind === 'image' && (!imageBytes || !objectUrls)) {
        throw adapterError(
          'K4-ASSET-ADAPTER-006',
          'Target-independent image assets require Object URL support',
        );
      }

      let cancelled = false;
      const cancelRegistration = () => {
        if (cancelled) return;
        cancelled = true;
        composition.releaseAsset(assetId);
      };
      signal?.addEventListener('abort', cancelRegistration, {once: true});
      try {
        if (signal?.aborted) {
          cancelRegistration();
          throw abortError();
        }
        if (projectRegistration) {
          const locator = projectRegistration.locator as Record<string, unknown>;
          if (projectAssetReadiness(locator, runtimeHost) === 'pending') {
            await waitForProjectAsset(locator, runtimeHost, signal);
          }
        }
        const registration = await (projectRegistration
          ? composition.registerProjectAsset(projectRegistration)
          : composition.registerEmbeddedAsset(embeddedRegistration));
        if (signal?.aborted) {
          cancelRegistration();
          throw abortError();
        }
        if (
          !isRecord(registration) ||
          registration.name !== assetId ||
          typeof registration.mimeType !== 'string' ||
          registration.mimeType.length === 0
        ) {
          cancelRegistration();
          throw adapterError(
            'K4-ASSET-ADAPTER-004',
            `Asset Manager returned an invalid registration for ${assetId}`,
          );
        }
        if (assetKind === 'image' && !registration.mimeType.startsWith('image/')) {
          cancelRegistration();
          throw adapterError(
            'K4-ASSET-ADAPTER-004',
            `Target-independent image asset has a non-image MIME type: ${assetId}`,
          );
        }
        let objectUrl;
        let imageLease: unknown = null;
        if (assetKind === 'image') {
          const imageObjectUrls = objectUrls as Dsl4ObjectUrlOwner;
          try {
            // The lifecycle verified this integrity against the bytes; equal images share a URL.
            const lease = imageObjectUrls.acquireVerified(
              imageIntegrity,
              imageBytes as Uint8Array,
              registration.mimeType,
            );
            imageLease = lease;
            objectUrl = lease.objectUrl;
          } catch (error) {
            cancelRegistration();
            throw adapterError(
              'K4-ASSET-ADAPTER-006',
              error instanceof TypeError && /no URL/u.test(error.message)
                ? 'Object URL creation returned no URL'
                : 'Object URL creation failed',
            );
          }
          if (signal?.aborted) {
            cancelRegistration();
            imageObjectUrls.release(imageLease);
            throw abortError();
          }
        }
        const resource = Object.freeze({
          adapter: 'asset-manager',
          assetId,
          kind: assetKind,
          name: registration.name,
          mimeType: registration.mimeType,
          ...(objectUrl ? {objectUrl} : {}),
        });
        ownedResources.add(resource);
        if (imageLease) imageLeases.set(resource, imageLease);
        return resource;
      } finally {
        signal?.removeEventListener('abort', cancelRegistration);
      }
    },

    release(resource: unknown) {
      if (!isRecord(resource) || !ownedResources.has(resource)) {
        throw adapterError(
          'K4-ASSET-ADAPTER-005',
          'Asset Manager resource is not owned by this adapter',
        );
      }
      if (releasedResources.has(resource)) return;
      const errors: unknown[] = [];
      if (!releasedRegistrations.has(resource)) {
        try {
          composition.releaseAsset(resource.name);
          releasedRegistrations.add(resource);
        } catch (error) {
          errors.push(error);
        }
      }
      if (imageLeases.has(resource) && !revokedResources.has(resource)) {
        try {
          (objectUrls as Dsl4ObjectUrlOwner).release(imageLeases.get(resource));
          revokedResources.add(resource);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1)
        throw new AggregateError(errors, 'Asset Manager resource cleanup failed');
      releasedResources.add(resource);
    },
  });
}
