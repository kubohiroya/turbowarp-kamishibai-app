import type {Sb3SaveFormat} from '@kubohiroya/turbowarp-sb3-save-format';
import {fromByteArray, toByteArray} from 'base64-js';
import {dsl4RetainedRemotePayloadPath} from '../asset-bundle-descriptor.js';
import {dsl4BinaryEntryContentType} from '../binary-entry-provider.js';
import {
  dsl4BlockSourceBundleExtensionId,
  dsl4BlockSourceRuntimeExtensionId,
} from '../block-source-shared.js';
import {definitionRecord as record} from '../definition-references.js';
import {extractDsl4PoseArchive} from '../pose-archive-extractor.js';
import {isDsl4PoseArchivePath, isDsl4RemotePoseArchiveUrl} from '../pose-archive-locator.js';
import {
  dsl4RemotePoseFileUrl,
  parseDsl4RemotePoseJson,
  resolveDsl4RemotePoseWeightsPath,
} from '../remote-pose-directory.js';
import {computeDsl4Sha256Integrity} from '../source-descriptor.js';
import {dsl4VideoContentType} from '../video-source.js';
import {resolveProjectTargetName} from './asset-manager-adapter.js';
import {mountDsl4RecognitionModelPreview} from './block-icon-recognition-model-preview.js';
import type {Dsl4BlockPreviewSnapshot} from './block-icon-preview-editor.js';
import {createDsl4BrowserRemoteAssetLoader} from './browser-remote-asset-loader.js';

const previewTags = new Map<string, 'img' | 'audio' | 'video'>([
  ['backdrop', 'img'],
  ['costume', 'img'],
  ['image', 'img'],
  ['sound', 'audio'],
  ['video', 'video'],
]);

interface AssetPreviewMedia {
  bytes: Uint8Array;
  contentType: string;
  storage: Sb3SaveFormat;
  retainedFallback?: boolean;
}

function readAssetId(vm: Record<string, unknown>, snapshot: Dsl4BlockPreviewSnapshot) {
  const captured = snapshot.arguments.NAME;
  if (captured) return captured.kind === 'literal' ? captured.value : undefined;
  // Schema editor snapshots may contain only the form's editable VALUE argument.
  const targets = record(vm.runtime).targets;
  const target = Array.isArray(targets)
    ? targets.map(record).find(({id}) => id === snapshot.targetId)
    : undefined;
  const blocks = record(target?.blocks);
  if (typeof blocks.getBlock !== 'function') return undefined;
  const block = record(blocks.getBlock(snapshot.blockId));
  if (block.opcode !== snapshot.opcode) return undefined;
  const input = record(record(block.inputs).NAME);
  if (typeof input.shadow !== 'string' || input.block !== input.shadow) return undefined;
  const literal = record(blocks.getBlock(input.shadow));
  if (literal.shadow !== true || literal.opcode !== 'text') return undefined;
  return record(record(literal.fields).TEXT).value;
}

function projectMedia(
  runtime: Record<string, unknown>,
  kind: string,
  asset: Record<string, unknown>,
) {
  if (
    !['backdrop', 'costume', 'sound'].includes(kind) ||
    typeof asset.name !== 'string' ||
    !asset.name ||
    (kind === 'costume' && (typeof asset.target !== 'string' || !asset.target))
  ) {
    throw new Error('SB3 内の素材名と、コスチュームの場合は対象アクターを指定してください。');
  }
  const targets = Array.isArray(runtime.targets) ? runtime.targets.map(record) : [];
  const sprites = targets.filter(
    (target) => target.isStage === false && target.isOriginal !== false,
  );
  const targetName =
    kind !== 'backdrop' && typeof asset.target === 'string'
      ? resolveProjectTargetName({spriteTargets: () => sprites}, asset.target, kind === 'costume')
      : undefined;
  const target =
    targetName === undefined
      ? targets.find((target) => target.isStage === true)
      : sprites.find((sprite) => record(sprite.sprite).name === targetName);
  const entries = record(target?.sprite)[kind === 'sound' ? 'sounds' : 'costumes'];
  const entry = Array.isArray(entries)
    ? entries.map(record).find(({name}) => name === asset.name)
    : undefined;
  const stored = record(entry?.asset);
  if (!(stored.data instanceof Uint8Array) || typeof stored.dataFormat !== 'string') {
    throw new Error('指定された素材が SB3 内に見つかりません。');
  }
  return {
    bytes: stored.data,
    contentType: dsl4BinaryEntryContentType(`asset.${stored.dataFormat}`),
  };
}

function storedBundle(runtime: Record<string, unknown>) {
  const storage = record(runtime.extensionStorage);
  const components = record(record(storage[dsl4BlockSourceBundleExtensionId]).components);
  return record(
    record(
      storage[dsl4BlockSourceRuntimeExtensionId] ?? components[dsl4BlockSourceRuntimeExtensionId],
    ).assets,
  );
}

async function readBundleFile(
  vm: Record<string, unknown>,
  bundle: Record<string, unknown>,
  assetId: string,
  path: unknown,
  maxBytes: number,
  signal: AbortSignal,
  expectedIntegrity?: string,
  readEntries = async () =>
    record(
      typeof vm.saveProjectSb3DontZip === 'function' ? await vm.saveProjectSb3DontZip() : undefined,
    ),
) {
  const files = Array.isArray(bundle.files) ? bundle.files.map(record) : [];
  const file = files.find((candidate) => candidate.assetId === assetId && candidate.path === path);
  if (!file || (expectedIntegrity !== undefined && file.integrity !== expectedIntegrity))
    return undefined;
  if (!Number.isSafeInteger(file.size) || Number(file.size) <= 0 || Number(file.size) > maxBytes)
    throw new Error('プレビュー用素材のサイズが上限を超えているか、不正です。');
  let bytes: unknown;
  if (bundle.formatVersion === 1 && file.encoding === 'base64' && typeof file.data === 'string') {
    if (file.data.length !== Math.ceil(Number(file.size) / 3) * 4)
      throw new Error('埋め込み素材のデータが不正です。');
    bytes = toByteArray(file.data);
  } else if (
    (bundle.formatVersion === 2 || bundle.formatVersion === 3) &&
    typeof file.entry === 'string'
  ) {
    const entries = await readEntries();
    bytes = Object.hasOwn(entries, file.entry) ? entries[file.entry] : undefined;
  }
  signal.throwIfAborted();
  if (!(bytes instanceof Uint8Array)) return undefined;
  if (
    bytes.byteLength !== file.size ||
    (await computeDsl4Sha256Integrity(bytes)) !== file.integrity
  )
    throw new Error('埋め込み素材のデータが記録された内容と一致しません。');
  return bytes;
}

async function loadRemoteAsset(
  vm: Record<string, unknown>,
  bundle: Record<string, unknown>,
  id: string,
  source: Record<string, unknown>,
  maxBytes: number,
  signal: AbortSignal,
): Promise<AssetPreviewMedia> {
  const hasIntegrity = ['size', 'contentType', 'integrity'].some((key) =>
    Object.hasOwn(source, key),
  );
  const {integrity, size, contentType} = source;
  if (
    hasIntegrity &&
    (typeof integrity !== 'string' ||
      !/^sha256-[a-f0-9]{64}$/u.test(integrity) ||
      !Number.isSafeInteger(size) ||
      Number(size) <= 0 ||
      Number(size) > maxBytes ||
      typeof contentType !== 'string')
  )
    throw new Error('Web 素材のサイズ・形式・ハッシュを確認してください。');

  const expected =
    typeof integrity === 'string' && hasIntegrity
      ? `sha256-${fromByteArray(Uint8Array.from(integrity.slice(7).match(/../gu)!, (hex) => Number.parseInt(hex, 16)))}`
      : undefined;
  const retained = expected
    ? await readBundleFile(
        vm,
        bundle,
        id,
        dsl4RetainedRemotePayloadPath,
        maxBytes,
        signal,
        expected,
      ).catch(() => {
        signal.throwIfAborted();
        return undefined;
      })
    : undefined;
  const usableCopy = retained?.byteLength === size ? retained : undefined;

  signal.throwIfAborted();
  let loaded;
  try {
    loaded = await createDsl4BrowserRemoteAssetLoader({maxBytes})({url: source.url}, {signal});
  } catch (error) {
    signal.throwIfAborted();
    if (!usableCopy) throw error;
    return {
      bytes: usableCopy,
      contentType: String(contentType),
      storage: 'remote-cacheable',
      retainedFallback: true,
    };
  }
  const loadedType = loaded.contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (
    expected &&
    (loaded.bytes.byteLength !== size ||
      loadedType !== contentType ||
      (await computeDsl4Sha256Integrity(loaded.bytes)) !== expected)
  )
    throw new Error('Web 素材が指定されたサイズ・形式・ハッシュと一致しません。');
  return {
    bytes: loaded.bytes,
    contentType: loadedType,
    storage: usableCopy ? 'remote-cacheable' : 'remote-non-cacheable',
  };
}

function findBundleAsset(
  bundle: Record<string, unknown>,
  id: string,
  kind: string,
  inputPath: string,
) {
  const rows = record(bundle.manifest).assets;
  const matches = (Array.isArray(rows) ? rows.map(record) : []).filter(
    (row) =>
      row.kind === kind &&
      record(row.source).type === 'file' &&
      record(row.source).inputPath === inputPath,
  );
  return (
    matches.find((candidate) => candidate.id === id) ??
    (matches.length === 1 ? matches[0] : undefined)
  );
}

async function loadAssetMedia(
  vm: Record<string, unknown>,
  id: string,
  kind: string,
  asset: Record<string, unknown>,
  maxBytes: number,
  signal: AbortSignal,
): Promise<AssetPreviewMedia> {
  const runtime = record(vm.runtime);
  if (asset.delivery !== 'remote' && typeof asset.file !== 'string')
    return {...projectMedia(runtime, kind, asset), storage: 'embedded-file'};

  const bundle = storedBundle(runtime);
  if (asset.delivery === 'remote')
    return loadRemoteAsset(vm, bundle, id, record(asset.source), maxBytes, signal);

  const row = findBundleAsset(bundle, id, kind, asset.file as string);
  const files = record(row?.source).files;
  const path = Array.isArray(files) && files.length === 1 ? record(files[0]).path : undefined;
  const missing = '指定されたファイルの実体が作品に埋め込まれていません。';
  if (typeof row?.id !== 'string' || typeof path !== 'string') throw new Error(missing);
  const bytes = await readBundleFile(vm, bundle, row.id, path, maxBytes, signal);
  if (!bytes) throw new Error(missing);
  const contentType =
    kind === 'video'
      ? dsl4VideoContentType(bytes)
      : dsl4BinaryEntryContentType(path.replace(/\.wave$/iu, '.wav'));
  return {
    bytes,
    contentType: contentType ?? '',
    storage: bundle.formatVersion === 1 ? 'embedded-data' : 'embedded-file',
  };
}

async function loadRecognitionModel(
  vm: Record<string, unknown>,
  id: string,
  asset: Record<string, unknown>,
  maxBytes: number,
  signal: AbortSignal,
) {
  const bundle = storedBundle(record(vm.runtime));
  const source = record(asset.source);
  let remaining = maxBytes;
  let read: (path: string) => Promise<Uint8Array | undefined>;

  async function archiveReader(bytes: Uint8Array) {
    const {files} = await extractDsl4PoseArchive(
      {
        assetId: id,
        bytes,
        maxArchiveBytes: maxBytes,
        maxFileBytes: maxBytes,
        maxTotalBytes: maxBytes,
      },
      {signal},
    );
    return async (path: string) => files.find((file) => file.path === path)?.bytes;
  }

  if (asset.delivery === 'remote') {
    if (isDsl4RemotePoseArchiveUrl(source.url)) {
      const {bytes} = await loadRemoteAsset(vm, bundle, id, source, maxBytes, signal);
      read = await archiveReader(bytes);
    } else {
      if (
        typeof source.url !== 'string' ||
        ['size', 'contentType', 'integrity'].some((key) => Object.hasOwn(source, key))
      )
        throw new Error('公開済みモデルのフォルダー URL、またはモデル ZIP を指定してください。');
      const url = new URL(source.url);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash)
        throw new Error('公開済みモデルの HTTPS フォルダー URL を指定してください。');
      read = async (path) => {
        const load = createDsl4BrowserRemoteAssetLoader({maxBytes: remaining});
        const file = await load({url: dsl4RemotePoseFileUrl(url.href, path)}, {signal});
        return file.bytes;
      };
    }
  } else {
    const row =
      typeof asset.file === 'string'
        ? findBundleAsset(bundle, id, 'recognitionModel', asset.file)
        : undefined;
    const files = record(row?.source).files;
    const rowId = row?.id;
    if (typeof rowId !== 'string' || !Array.isArray(files))
      throw new Error('指定されたモデルの実体が作品に埋め込まれていません。');
    let entries: Promise<Record<string, unknown>> | undefined;
    const readEntries = () =>
      (entries ??= Promise.resolve(
        typeof vm.saveProjectSb3DontZip === 'function' ? vm.saveProjectSb3DontZip() : undefined,
      ).then(record));
    read = (path) =>
      files.some((file) => record(file).path === path)
        ? readBundleFile(vm, bundle, rowId, path, remaining, signal, undefined, readEntries)
        : Promise.resolve(undefined);
    const archive = files.length === 1 ? record(files[0]).path : undefined;
    if (typeof archive === 'string' && isDsl4PoseArchivePath(archive)) {
      const bytes = await read(archive);
      if (!bytes) throw new Error('指定されたモデルの ZIP が作品に埋め込まれていません。');
      read = await archiveReader(bytes);
    }
  }

  async function requireFile(path: string) {
    signal.throwIfAborted();
    if (remaining <= 0) throw new Error('プレビュー用モデルのサイズが上限を超えています。');
    const bytes = await read(path);
    signal.throwIfAborted();
    if (!bytes?.byteLength) throw new Error(`モデルのファイルが見つかりません (${path})。`);
    remaining -= bytes.byteLength;
    return bytes;
  }

  const metadata = await requireFile('metadata.json');
  const model = await requireFile('model.json');
  const weightsPath = resolveDsl4RemotePoseWeightsPath(
    parseDsl4RemotePoseJson(model, 'model.json'),
  );
  return {metadata, model, weightsPath, weights: await requireFile(weightsPath)};
}

export function mountDsl4BlockIconAssetPreview(
  container: HTMLElement,
  context: {
    getDraft(): {data?: unknown};
    getState(): {status: string};
    subscribe(listener: () => void): () => void;
  },
  snapshot: Dsl4BlockPreviewSnapshot,
  vm: unknown,
  maxBytes = 64 * 1024 * 1024,
) {
  const document = container.ownerDocument;
  const root = document.createElement('section');
  root.dataset.dsl4AssetPreview = '';
  const heading = document.createElement('h3');
  heading.textContent = '素材プレビュー';
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  const style = document.createElement('style');
  style.textContent = `
    [data-dsl4-asset-preview] img[data-dsl4-asset-transparency] {
      background: conic-gradient(#d0d0d0 25%, white 0 50%, #d0d0d0 0 75%, white 0) 0 0 / 16px 16px;
    }
    [data-dsl4-asset-preview] img[data-dsl4-asset-transparency]:hover {
      outline: 1px solid #008000;
      outline-offset: -1px;
    }
  `;
  root.append(heading, status, style);
  container.appendChild(root);

  let selection: string | undefined;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let clearMedia: (() => void) | undefined;
  const clear = () => {
    controller?.abort();
    clearTimeout(timer);
    clearMedia?.();
    clearMedia = undefined;
  };

  async function render(data: unknown, signal: AbortSignal) {
    const id = readAssetId(record(vm), snapshot);
    if (typeof id !== 'string' || id.length === 0)
      throw new Error('素材 ID をブロックの文字入力欄で指定してください。');
    const [compactKind, target] = typeof data === 'string' ? data.split(':') : [];
    const asset = typeof data === 'string' ? {kind: compactKind, target, name: id} : record(data);
    const kind = typeof asset.kind === 'string' ? asset.kind : '';
    if (kind === 'recognitionModel') {
      status.textContent = '認識モデルを読み込んでいます…';
      const files = await loadRecognitionModel(record(vm), id, asset, maxBytes, signal);
      signal.throwIfAborted();
      clearMedia = mountDsl4RecognitionModelPreview(root, files, record(vm).runtime);
      status.textContent = '';
      return;
    }
    const tag = previewTags.get(kind);
    if (!tag) throw new Error('プレビューする素材の種類を選んでください。');
    if (asset.delivery === 'remote') status.textContent = 'Web 素材を取得しています…';
    const {bytes, contentType, storage, retainedFallback} = await loadAssetMedia(
      record(vm),
      id,
      kind,
      asset,
      maxBytes,
      signal,
    );
    if (signal.aborted) return;
    const prefix = tag === 'img' ? 'image/' : `${tag}/`;
    const byteLength = bytes.byteLength;
    if (!contentType.startsWith(prefix) || byteLength === 0 || byteLength > maxBytes)
      throw new Error('この素材の形式またはサイズではプレビューできません。');

    const media = document.createElement(tag);
    media.style.cssText = 'display:block;max-width:100%;max-height:50vh;object-fit:contain;';
    if (tag === 'img') {
      (media as HTMLImageElement).alt = id;
      if (kind === 'costume' || kind === 'image') media.dataset.dsl4AssetTransparency = '';
    } else {
      const player = media as HTMLMediaElement;
      player.controls = true;
      player.preload = 'metadata';
      player.setAttribute('aria-label', id);
      if (tag === 'video') (player as HTMLVideoElement).playsInline = true;
    }
    const details = tag === 'audio' ? null : document.createElement('div');
    const format = document.createElement('div');
    format.dataset.dsl4AssetPreviewStorage = '';
    format.style.cssText = 'margin-top:0.5em;font-size:0.875em;';
    format.textContent = `保持形態 ${storage}`;
    const detailsEvent = tag === 'img' ? 'load' : 'loadedmetadata';
    const showDetails = () => {
      if (!details) return;
      const width =
        tag === 'img'
          ? (media as HTMLImageElement).naturalWidth
          : (media as HTMLVideoElement).videoWidth;
      const height =
        tag === 'img'
          ? (media as HTMLImageElement).naturalHeight
          : (media as HTMLVideoElement).videoHeight;
      if (width > 0 && height > 0) {
        details.textContent = `${width} × ${height} px · ${byteLength.toLocaleString('ja-JP')} バイト`;
        details.hidden = false;
      }
    };
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], {type: contentType}));
    const onError = () => {
      clearMedia?.();
      clearMedia = undefined;
      status.textContent = 'このブラウザーでは素材を表示・再生できません。';
    };
    clearMedia = () => {
      media.removeEventListener('error', onError);
      if (details) media.removeEventListener(detailsEvent, showDetails);
      media.removeAttribute('src');
      if (tag !== 'img') (media as HTMLMediaElement).load();
      media.remove();
      details?.remove();
      format.remove();
      URL.revokeObjectURL(url);
    };
    root.appendChild(media);
    if (details) {
      details.dataset.dsl4AssetPreviewDetails = '';
      details.style.cssText = 'margin-top:0.5em;font-size:0.875em;';
      details.hidden = true;
      root.appendChild(details);
      media.addEventListener(detailsEvent, showDetails);
    }
    root.appendChild(format);
    media.addEventListener('error', onError);
    media.src = url;
    status.textContent = retainedFallback
      ? 'Web 素材を取得できなかったため、SB3 内の保持コピーを表示しています。'
      : '';
  }

  function refresh(initial = false) {
    if (context.getState().status !== 'editing') return;
    const draft = context.getDraft();
    const slot = snapshot.arguments.VALUE;
    const key = Object.hasOwn(draft, 'data')
      ? JSON.stringify(draft.data)
      : String(slot?.value ?? '');
    if (selection === key) return;
    selection = key;
    clear();
    const {signal} = (controller = new AbortController());
    status.textContent = '素材を読み込んでいます…';
    const start = () => {
      void Promise.resolve()
        .then(() => {
          signal.throwIfAborted();
          const data = Object.hasOwn(draft, 'data')
            ? draft.data
            : slot?.kind === 'literal' && typeof slot.value === 'string'
              ? JSON.parse(slot.value)
              : null;
          return render(data, signal);
        })
        .catch((error: unknown) => {
          if (!signal.aborted)
            status.textContent =
              error instanceof Error ? error.message : '素材をプレビューできません。';
        });
    };
    if (initial) start();
    else timer = setTimeout(start, 250);
  }

  const unsubscribe = context.subscribe(() => refresh());
  refresh(true);
  return () => {
    unsubscribe();
    clear();
    root.remove();
  };
}
