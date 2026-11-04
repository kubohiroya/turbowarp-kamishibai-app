import {fromByteArray, toByteArray} from 'base64-js';
import {dsl4RetainedRemotePayloadPath} from '../asset-bundle-descriptor.js';
import {dsl4BinaryEntryContentType} from '../binary-entry-provider.js';
import {
  dsl4BlockSourceBundleExtensionId,
  dsl4BlockSourceRuntimeExtensionId,
} from '../block-source-shared.js';
import {definitionRecord as record} from '../definition-references.js';
import {computeDsl4Sha256Integrity} from '../source-descriptor.js';
import {dsl4VideoContentType} from '../video-source.js';
import {resolveProjectTargetName} from './asset-manager-adapter.js';
import type {Dsl4BlockPreviewSnapshot} from './block-icon-preview-editor.js';
import {createDsl4BrowserRemoteAssetLoader} from './browser-remote-asset-loader.js';

const previewTags = new Map<string, 'img' | 'audio' | 'video'>([
  ['backdrop', 'img'],
  ['costume', 'img'],
  ['image', 'img'],
  ['sound', 'audio'],
  ['video', 'video'],
]);

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
) {
  const files = Array.isArray(bundle.files) ? bundle.files.map(record) : [];
  const file = files.find((candidate) => candidate.assetId === assetId && candidate.path === path);
  if (!file) return undefined;
  if (!Number.isSafeInteger(file.size) || Number(file.size) <= 0 || Number(file.size) > maxBytes)
    throw new Error('プレビュー用素材のサイズが上限を超えているか、不正です。');
  let bytes: unknown;
  if (bundle.formatVersion === 1 && file.encoding === 'base64' && typeof file.data === 'string') {
    if (file.data.length !== Math.ceil(Number(file.size) / 3) * 4)
      throw new Error('埋め込み素材のデータが不正です。');
    bytes = toByteArray(file.data);
  } else if (
    (bundle.formatVersion === 2 || bundle.formatVersion === 3) &&
    typeof file.entry === 'string' &&
    typeof vm.saveProjectSb3DontZip === 'function'
  ) {
    const entries = record(await vm.saveProjectSb3DontZip());
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

async function loadAssetMedia(
  vm: Record<string, unknown>,
  id: string,
  kind: string,
  asset: Record<string, unknown>,
  maxBytes: number,
  signal: AbortSignal,
) {
  const runtime = record(vm.runtime);
  if (asset.delivery !== 'remote' && typeof asset.file !== 'string')
    return projectMedia(runtime, kind, asset);

  const bundle = storedBundle(runtime);
  if (asset.delivery === 'remote') {
    const source = record(asset.source);
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

    const retained = hasIntegrity
      ? await readBundleFile(vm, bundle, id, dsl4RetainedRemotePayloadPath, maxBytes, signal)
      : undefined;
    // Only a copy matching the current draft's integrity can stand in for the URL.
    const expected =
      typeof integrity === 'string' && hasIntegrity
        ? `sha256-${fromByteArray(Uint8Array.from(integrity.slice(7).match(/../gu)!, (hex) => Number.parseInt(hex, 16)))}`
        : undefined;
    if (
      retained &&
      retained.byteLength === size &&
      (await computeDsl4Sha256Integrity(retained)) === expected
    )
      return {bytes: retained, contentType: String(contentType)};

    signal.throwIfAborted();
    const loaded = await createDsl4BrowserRemoteAssetLoader({maxBytes})(
      {url: source.url},
      {signal},
    );
    const loadedType = loaded.contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
    if (
      expected &&
      (loaded.bytes.byteLength !== size ||
        loadedType !== contentType ||
        (await computeDsl4Sha256Integrity(loaded.bytes)) !== expected)
    )
      throw new Error('Web 素材が指定されたサイズ・形式・ハッシュと一致しません。');
    return {bytes: loaded.bytes, contentType: loadedType};
  }

  const rows = record(bundle.manifest).assets;
  const matches = (Array.isArray(rows) ? rows.map(record) : []).filter(
    (row) =>
      row.kind === kind &&
      record(row.source).type === 'file' &&
      record(row.source).inputPath === asset.file,
  );
  const row =
    matches.find((candidate) => candidate.id === id) ??
    (matches.length === 1 ? matches[0] : undefined);
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
  return {bytes, contentType: contentType ?? ''};
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
  root.append(heading, status);
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
    if (kind === 'recognitionModel') throw new Error('認識モデルはプレビューに対応していません。');
    const tag = previewTags.get(kind);
    if (!tag) throw new Error('プレビューする素材の種類を選んでください。');
    const {bytes, contentType} = await loadAssetMedia(
      record(vm),
      id,
      kind,
      asset,
      maxBytes,
      signal,
    );
    if (signal.aborted) return;
    const prefix = tag === 'img' ? 'image/' : `${tag}/`;
    if (!contentType.startsWith(prefix) || bytes.byteLength === 0 || bytes.byteLength > maxBytes)
      throw new Error('この素材の形式またはサイズではプレビューできません。');

    const media = document.createElement(tag);
    media.style.cssText = 'display:block;max-width:100%;max-height:50vh;object-fit:contain;';
    if (tag === 'img') (media as HTMLImageElement).alt = id;
    else {
      const player = media as HTMLMediaElement;
      player.controls = true;
      player.preload = 'metadata';
      player.setAttribute('aria-label', id);
      if (tag === 'video') (player as HTMLVideoElement).playsInline = true;
    }
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], {type: contentType}));
    const onError = () => {
      clearMedia?.();
      clearMedia = undefined;
      status.textContent = 'このブラウザーでは素材を表示・再生できません。';
    };
    clearMedia = () => {
      media.removeEventListener('error', onError);
      media.removeAttribute('src');
      if (tag !== 'img') (media as HTMLMediaElement).load();
      media.remove();
      URL.revokeObjectURL(url);
    };
    media.addEventListener('error', onError);
    media.src = url;
    root.appendChild(media);
    status.textContent = '';
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
