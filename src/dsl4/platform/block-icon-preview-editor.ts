import {dsl4BlockAuthoringExtensionId} from '../block-source-shared.js';
import {dsl4TurboWarpActionBlockSpecs} from '../core-action-block-codec.js';
import type {Dsl4SourceFrontend} from '../source-frontend.js';
import {mountDsl4BlockIconAssetPreview} from './block-icon-asset-preview.js';
import {createDsl4BlockIconPreviewRuntime} from './block-icon-preview-runtime.js';

type Literal = string | number | boolean;
type Json = null | Literal | Json[] | {[key: string]: Json};
type Draft = {[key: string]: Json};
export interface Dsl4BlockPreviewSnapshot {
  targetId: string;
  blockId: string;
  opcode: string;
  arguments: Readonly<Record<string, {kind: string; value?: unknown}>>;
}
type Snapshot = Dsl4BlockPreviewSnapshot;
interface Context {
  getDraft(): Draft;
  setDraft(draft: Draft): void;
  getState(): {status: string; issues?: readonly {message: string}[]};
  getFixedInputView?(): {inputs: Record<string, {state: string}>} | undefined;
  subscribe(listener: () => void): () => void;
}
interface PreviewActor {
  x: number;
  y: number;
  size: number;
  visible?: boolean;
  drawableID: number;
  setXY(x: number, y: number): void;
  setSize(size: number): void;
}
interface PreviewHandle {
  runtime: unknown;
  canvas: HTMLCanvasElement;
  getActor?(name: string): unknown;
  stop?(): void;
  finished?: Promise<void>;
  dispose(): unknown | Promise<unknown>;
}
interface PreviewRuntime {
  open(options: {
    mount: HTMLElement;
    snapshot: Snapshot;
    changes?: Record<string, Literal>;
    mode: 'still' | 'action' | 'scene';
    signal: AbortSignal;
  }): Promise<PreviewHandle>;
}
interface PreviewDefinition {
  extensionId: string;
  opcodes: string[];
  mount(container: HTMLElement, context: Context, snapshot: Snapshot): () => void;
  hover?(anchor: HTMLElement | SVGElement, snapshot: Snapshot): () => void;
}
interface RegistrationAPI {
  apiVersion: number;
  registerPreview?(definition: PreviewDefinition): () => void;
  registerFixedInputEditor?(definition: unknown): () => void;
}
export interface Dsl4BlockPreviewScratch {
  vm: unknown;
  gui?: {blockEditors?: RegistrationAPI; createPreviewVm?: () => unknown};
}
type PreviewScratch = Dsl4BlockPreviewScratch;

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const editableCommands = new Set(['show', 'moveTo', 'setSkin', 'sayText', 'thinkText']);
const animatedCommands = new Set(['moveTo', 'say', 'think', 'sayText', 'thinkText']);
const numberToken = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu;
const labels: Record<string, string> = {
  TARGET: 'アクター',
  SKIN: 'コスチューム',
  X: '横の位置',
  Y: '縦の位置',
  SCALE: '大きさ（%）',
  SECONDS: '秒数',
  EASING: '動きの変化',
  TEXT: '文章',
};

/** Extract only changed literals; unrelated draft metadata and unchanged source tokens stay intact. */
export function dsl4BlockPreviewDraftChanges(
  command: string,
  draft: Draft,
): Record<string, Literal> {
  if (command === 'scene' || command === 'say' || command === 'think') {
    if (Object.hasOwn(draft, 'data'))
      return {[command === 'scene' ? 'PROPERTIES' : 'SPEC']: JSON.stringify(draft.data)};
    return {};
  }
  const inputs = record(draft.inputs) ? draft.inputs : {};
  const result: Record<string, Literal> = {};
  for (const [name, entry] of Object.entries(inputs)) {
    if (!record(entry) || entry.changed !== true || entry.readOnly === true) continue;
    if (typeof entry.buffer === 'string') {
      if (!numberToken.test(entry.buffer.trim()) || !Number.isFinite(Number(entry.buffer)))
        throw new TypeError(`${labels[name] ?? name}に数値を入力してください。`);
      result[name] = entry.buffer;
    } else if (
      typeof entry.value === 'string' ||
      typeof entry.value === 'boolean' ||
      (typeof entry.value === 'number' && Number.isFinite(entry.value))
    )
      result[name] = entry.value;
    else throw new TypeError(`${labels[name] ?? name}の設定を確認してください。`);
  }
  return result;
}

/** Convert CSS-pixel movement into Scratch's centre-origin, upwards-positive coordinates. */
export function dsl4PreviewDragPosition(
  origin: {x: number; y: number},
  movement: {x: number; y: number},
  viewport: {width: number; height: number},
  stage: {width: number; height: number} = {width: 480, height: 360},
) {
  if (viewport.width <= 0 || viewport.height <= 0)
    throw new TypeError('プレビュー画面の大きさを取得できません。');
  return {
    x: origin.x + (movement.x * stage.width) / viewport.width,
    y: origin.y - (movement.y * stage.height) / viewport.height,
  };
}

/** Uniform scaling uses the actor pivot rather than the potentially asymmetric costume box. */
export function dsl4PreviewDragScale(
  scale: number,
  pivot: {x: number; y: number},
  start: {x: number; y: number},
  current: {x: number; y: number},
) {
  const distance = Math.hypot(start.x - pivot.x, start.y - pivot.y);
  if (!(distance > 0) || !(scale > 0)) return scale;
  return Math.max(
    0.01,
    Math.min(100_000, (scale * Math.hypot(current.x - pivot.x, current.y - pivot.y)) / distance),
  );
}

function commandFor(opcode: string) {
  return opcode.slice(opcode.lastIndexOf('_') + 1);
}

function stageSize(handle: PreviewHandle) {
  const runtime = handle.runtime;
  const renderer = record(runtime) && record(runtime.renderer) ? runtime.renderer : null;
  const size = typeof renderer?.getNativeSize === 'function' ? renderer.getNativeSize() : null;
  if (
    Array.isArray(size) &&
    size.length === 2 &&
    size.every((value) => Number.isFinite(value) && value > 0)
  )
    return {width: Number(size[0]), height: Number(size[1])};
  return {width: 480, height: 360};
}

function argumentValue(context: Context, snapshot: Snapshot, name: string): unknown {
  const inputs = context.getDraft().inputs;
  if (record(inputs) && record(inputs[name]) && Object.hasOwn(inputs[name], 'value'))
    return inputs[name].value;
  return snapshot.arguments[name]?.value;
}

function setTransformDraft(context: Context, values: Record<string, number>) {
  const draft = context.getDraft();
  if (!record(draft.inputs) || context.getState().status !== 'editing') return;
  const description = context.getFixedInputView?.();
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isFinite(value) || description?.inputs[name]?.state !== 'editable') continue;
    const previous = draft.inputs[name];
    if (!record(previous)) continue;
    draft.inputs[name] = {
      value: Math.round(value * 100) / 100,
      changed: true,
      ...(previous.repair === true ? {repair: true} : {}),
    };
  }
  context.setDraft(draft);
}

function createFixedEditorOptions(extensionId: string, opcode: string, command: string) {
  const spec = dsl4TurboWarpActionBlockSpecs.find((item) => item.command === command)!;
  return {
    apiVersion: 1,
    extensionId,
    editorId: `visual-${command}`,
    opcodes: [opcode],
    contractId: `kamishibai.visual.${command}`,
    contractRevision: '1',
    bindings: spec.arguments.map((argument) => {
      const numeric = argument.type === 'number' || argument.name === 'SCALE';
      const optional = command === 'setSkin' && argument.name === 'SCALE';
      const choices =
        argument.name === 'EASING' ? ['linear', 'easeIn', 'easeOut', 'easeInOut'] : null;
      const document = choices
        ? {type: 'string', enum: choices}
        : numeric
          ? optional
            ? {anyOf: [{type: 'number', exclusiveMinimum: 0}, {const: ''}]}
            : {
                type: 'number',
                ...(argument.name === 'SCALE' ? {exclusiveMinimum: 0} : {}),
                ...(argument.name === 'SECONDS' ? {minimum: 0} : {}),
              }
          : {type: 'string', ...(argument.name === 'TEXT' ? {} : {minLength: 1})};
      const source = {
        repository: 'kubohiroya/turbowarp-kamishibai-app',
        path: 'src/dsl4/core-action-block-codec.ts',
        symbol: 'dsl4TurboWarpCoreActionBlockSpecs',
      };
      return {
        argument: argument.name,
        control: {
          kind: choices ? 'enum' : numeric ? 'number' : 'text',
          label: labels[argument.name] ?? argument.name,
          ...(optional ? {reset: ''} : {}),
          ...(choices ? {choices: choices.map((value) => ({value, label: value}))} : {}),
        },
        schemaBundle: {
          identity: {
            ownerId: 'kamishibai',
            contractId: `visual.${command}.${argument.name}`,
            revision: '1',
            variantId: 'literal',
          },
          dialect: 'draft-07',
          root: {
            retrievalUri: `https://kamishibai.invalid/visual/${command}/${argument.name}`,
            document,
            artifact: {role: 'canonical-schema', source},
          },
          resources: [],
          provenance: {
            canonicalSources: [source],
            generatedFiles: [],
            referenceSchemas: [],
            generationSources: [],
          },
        },
        read(value: Literal): Json {
          if (!numeric) return String(value);
          if (optional && String(value).trim() === '') return '';
          const result = Number(value);
          if (!Number.isFinite(result)) throw new TypeError('Expected a finite number.');
          return result;
        },
        encode(value: Json): Literal {
          if (typeof value !== 'string' && typeof value !== 'number')
            throw new TypeError('Expected a literal field value.');
          if (typeof value === 'number' && !Number.isFinite(value))
            throw new TypeError('Expected a finite field value.');
          return typeof value === 'number' ? (Object.is(value, -0) ? '-0' : String(value)) : value;
        },
        validateCandidate: () => [],
      };
    }),
    validationContext: () => ({
      consumerId: 'kamishibai-block-preview',
      nowMs: Date.now(),
      settings: null,
    }),
  };
}

/** Mount a companion body. The shared editor still owns Save, Cancel, validation and undo history. */
export function mountDsl4BlockIconPreview({
  container,
  context,
  snapshot,
  runtime,
  debounceMs = 100,
}: {
  container: HTMLElement;
  context: Context;
  snapshot: Snapshot;
  runtime: PreviewRuntime;
  debounceMs?: number;
}): () => void {
  const document = container.ownerDocument;
  const command = commandFor(snapshot.opcode);
  const root = document.createElement('section');
  root.dataset.dsl4BlockPreview = command;
  root.setAttribute('aria-label', '場面・動作プレビュー');
  root.style.cssText =
    'display:grid;grid-template-columns:minmax(0,1fr);min-width:0;width:100%;gap:8px;margin-bottom:16px;';
  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
  const replay = document.createElement('button');
  replay.type = 'button';
  replay.textContent = command === 'scene' ? 'この場面を再生' : 'もう一度再生';
  const stop = document.createElement('button');
  stop.type = 'button';
  stop.textContent = '停止';
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  toolbar.append(replay, stop, status);
  const viewport = document.createElement('div');
  viewport.style.cssText =
    'position:relative;width:100%;max-width:480px;min-width:0;min-height:180px;aspect-ratio:4/3;overflow:hidden;background:#202329;border-radius:6px;touch-action:none;';
  const stageMount = document.createElement('div');
  stageMount.style.cssText = 'position:relative;width:100%;height:100%;';
  const box = document.createElement('div');
  box.dataset.dsl4ActorBounds = 'true';
  box.style.cssText =
    'display:none;position:absolute;border:2px solid #30a9ff;box-sizing:border-box;touch-action:none;cursor:move;';
  box.setAttribute('aria-hidden', 'true');
  viewport.append(stageMount, box);
  const help = document.createElement('p');
  help.style.cssText = 'margin:0;font-size:12px;line-height:1.5;';
  help.textContent =
    command === 'moveTo'
      ? '設定を変えると動きを再生し直します。アクターをドラッグして移動先を指定できます。大きさは直前のshow actorで設定します。'
      : command === 'show'
        ? 'アクターをドラッグして位置、青い枠のふちをドラッグして大きさを設定します。'
        : command === 'setSkin'
          ? '青い枠のふちをドラッグして大きさを設定します。'
          : command === 'say' ||
              command === 'think' ||
              command === 'sayText' ||
              command === 'thinkText'
            ? '設定を変えると、最新の内容で吹き出しを再生し直します。'
            : '設定は保存するまで台本に反映されません。';
  root.append(toolbar, viewport, help);
  container.appendChild(root);

  let disposed = false;
  let handle: PreviewHandle | undefined;
  let controller: AbortController | undefined;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let sequence = 0;
  let lastDraft = '';
  let lastValid = true;
  let lastStatus = 'editing';
  let dragging = false;
  let frame: number | undefined;
  let releaseGesture: (() => void) | undefined;
  const window = document.defaultView;
  const mode = command === 'scene' ? 'scene' : animatedCommands.has(command) ? 'action' : 'still';
  const report = (error: unknown) => {
    if (disposed) return;
    status.textContent = error instanceof Error ? error.message : 'プレビューを表示できません。';
  };
  function releaseHandle() {
    const previous = handle;
    handle = undefined;
    box.style.display = 'none';
    if (previous) void Promise.resolve(previous.dispose()).catch(report);
  }
  function cancelPending() {
    ++sequence;
    controller?.abort('preview-replaced');
    controller = undefined;
    if (pending !== undefined) clearTimeout(pending);
    pending = undefined;
  }
  function canEdit(name: string) {
    return (
      context.getState().status === 'editing' &&
      context.getFixedInputView?.()?.inputs[name]?.state === 'editable'
    );
  }
  function actor(): PreviewActor | undefined {
    const target = argumentValue(context, snapshot, 'TARGET');
    if (typeof target !== 'string') return;
    const candidate = handle?.getActor?.(target);
    if (
      record(candidate) &&
      typeof candidate.setXY === 'function' &&
      typeof candidate.setSize === 'function'
    )
      return candidate as unknown as PreviewActor;
  }
  function updateBounds() {
    if (disposed) return;
    const selected = actor();
    const candidate = handle?.runtime;
    const renderer = record(candidate) && record(candidate.renderer) ? candidate.renderer : null;
    const getBounds = renderer?.getBounds;
    if (
      !selected ||
      selected.visible === false ||
      !handle ||
      typeof getBounds !== 'function' ||
      !((canEdit('X') && canEdit('Y')) || canEdit('SCALE'))
    ) {
      box.style.display = 'none';
      return;
    }
    try {
      const bounds = getBounds.call(renderer, selected.drawableID) as {
        left: number;
        right: number;
        top: number;
        bottom: number;
      };
      const rect = handle.canvas.getBoundingClientRect();
      const parent = viewport.getBoundingClientRect();
      const {width, height} = stageSize(handle);
      const values = [
        bounds.left,
        bounds.right,
        bounds.top,
        bounds.bottom,
        rect.width,
        rect.height,
      ];
      if (!values.every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return;
      Object.assign(box.style, {
        display: 'block',
        left: `${rect.left - parent.left + ((bounds.left + width / 2) / width) * rect.width}px`,
        top: `${rect.top - parent.top + ((height / 2 - bounds.top) / height) * rect.height}px`,
        width: `${Math.max(8, ((bounds.right - bounds.left) / width) * rect.width)}px`,
        height: `${Math.max(8, ((bounds.top - bounds.bottom) / height) * rect.height)}px`,
      });
    } catch {
      box.style.display = 'none';
    }
  }
  function animateBounds() {
    updateBounds();
    if (!disposed && window?.requestAnimationFrame)
      frame = window.requestAnimationFrame(animateBounds);
  }
  async function open(changes: Record<string, Literal>, id: number) {
    const request = new AbortController();
    controller = request;
    status.textContent = 'プレビューを準備しています…';
    releaseHandle();
    const mount = document.createElement('div');
    mount.style.cssText = 'position:relative;width:100%;height:100%;';
    stageMount.appendChild(mount);
    try {
      const created = await runtime.open({mount, snapshot, changes, mode, signal: request.signal});
      if (disposed || id !== sequence || request.signal.aborted) {
        await created.dispose();
        mount.remove();
        return;
      }
      handle = {
        ...created,
        async dispose() {
          try {
            await created.dispose();
          } finally {
            mount.remove();
          }
        },
      };
      void created.finished?.catch((error: unknown) => {
        if (!disposed && id === sequence && !request.signal.aborted) report(error);
      });
      status.textContent = mode === 'still' ? '配置を編集できます' : '設定変更をすぐに反映します';
      updateBounds();
    } catch (error) {
      mount.remove();
      if (!disposed && id === sequence && !request.signal.aborted) report(error);
    }
  }
  function schedule(immediate = false) {
    if (disposed || context.getState().status !== 'editing') return;
    cancelPending();
    const id = sequence;
    try {
      const changes = dsl4BlockPreviewDraftChanges(command, context.getDraft());
      lastDraft = JSON.stringify(changes);
      if (context.getState().issues?.length) {
        lastValid = false;
        status.textContent = '設定内容を確認してください。';
        releaseHandle();
        return;
      }
      lastValid = true;
      if (immediate) void open(changes, id);
      else
        pending = setTimeout(() => {
          pending = undefined;
          void open(changes, id);
        }, debounceMs);
    } catch (error) {
      releaseHandle();
      report(error);
    }
  }
  const unsubscribe = context.subscribe(() => {
    if (disposed) return;
    const state = context.getState();
    const resumed = lastStatus !== 'editing' && state.status === 'editing';
    lastStatus = state.status;
    replay.disabled = state.status !== 'editing';
    stop.disabled = state.status !== 'editing';
    if (state.status !== 'editing') {
      cancelPending();
      handle?.stop?.();
      return;
    }
    if (dragging) return;
    if (state.issues?.length) {
      lastValid = false;
      cancelPending();
      handle?.stop?.();
      releaseHandle();
      status.textContent = '設定内容を確認してください。';
      return;
    }
    try {
      const changed = JSON.stringify(dsl4BlockPreviewDraftChanges(command, context.getDraft()));
      if (changed !== lastDraft || !lastValid || resumed) schedule();
    } catch (error) {
      cancelPending();
      report(error);
    }
  });
  replay.addEventListener('click', () => schedule(true));
  stop.addEventListener('click', () => {
    if (handle) {
      ++sequence;
      if (pending !== undefined) clearTimeout(pending);
      pending = undefined;
      handle.stop?.();
    } else cancelPending();
    status.textContent = '停止しました。再生ボタンで再開できます。';
  });
  const beginGesture = (event: PointerEvent) => {
    if (event.button !== 0 || event.isPrimary === false || !handle) return;
    const selected = actor();
    if (!selected) return;
    const border = box.getBoundingClientRect();
    const onBorder =
      Math.min(
        Math.abs(event.clientX - border.left),
        Math.abs(event.clientX - border.right),
        Math.abs(event.clientY - border.top),
        Math.abs(event.clientY - border.bottom),
      ) <= 7;
    const resize = onBorder && canEdit('SCALE');
    if (!resize && !(canEdit('X') && canEdit('Y'))) return;
    event.preventDefault();
    event.stopPropagation();
    handle.stop?.();
    dragging = true;
    const canvas = handle.canvas;
    const dimensions = stageSize(handle);
    const rect = canvas.getBoundingClientRect();
    const start = {x: event.clientX, y: event.clientY};
    const origin = {x: selected.x, y: selected.y};
    const previousDraft = context.getDraft();
    const scale = selected.size;
    let moved = false;
    const pivot = {
      x: rect.left + ((origin.x + dimensions.width / 2) / dimensions.width) * rect.width,
      y: rect.top + ((dimensions.height / 2 - origin.y) / dimensions.height) * rect.height,
    };
    box.setPointerCapture?.(event.pointerId);
    const move = (input: PointerEvent) => {
      if (input.pointerId !== event.pointerId) return;
      if (!moved && Math.hypot(input.clientX - start.x, input.clientY - start.y) < 2) return;
      moved = true;
      input.preventDefault();
      if (resize) {
        selected.setSize(
          dsl4PreviewDragScale(scale, pivot, start, {x: input.clientX, y: input.clientY}),
        );
        setTransformDraft(context, {SCALE: selected.size});
      } else {
        const position = dsl4PreviewDragPosition(
          origin,
          {x: input.clientX - start.x, y: input.clientY - start.y},
          rect,
          dimensions,
        );
        selected.setXY(position.x, position.y);
        setTransformDraft(context, {X: selected.x, Y: selected.y});
      }
      updateBounds();
    };
    const finish = (input: PointerEvent) => {
      if (input.pointerId !== event.pointerId) return;
      if (input.type !== 'pointercancel') move(input);
      else if (moved) {
        selected.setXY(origin.x, origin.y);
        selected.setSize(scale);
        context.setDraft(previousDraft);
      }
      releaseGesture?.();
      if (!disposed) schedule();
    };
    releaseGesture = () => {
      dragging = false;
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', finish);
      box.removeEventListener('pointercancel', finish);
      if (box.hasPointerCapture?.(event.pointerId)) box.releasePointerCapture?.(event.pointerId);
      releaseGesture = undefined;
    };
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', finish);
    box.addEventListener('pointercancel', finish);
  };
  box.addEventListener('pointerdown', beginGesture);
  animateBounds();
  schedule(true);
  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    cancelPending();
    releaseGesture?.();
    if (frame !== undefined) window?.cancelAnimationFrame(frame);
    box.removeEventListener('pointerdown', beginGesture);
    releaseHandle();
    root.remove();
  };
}

/** Register through the shared editor capability, keeping unsupported Editor hosts unchanged. */
export function installDsl4BlockIconPreviews({
  Scratch,
  assetEnabled = true,
  sceneActionEnabled = true,
  sourceFrontend,
  runtimeVersion,
  tmPoseRuntime,
  resolveTMPoseRuntime,
  limits,
  createRuntime = createDsl4BlockIconPreviewRuntime,
}: {
  Scratch: PreviewScratch;
  assetEnabled?: boolean;
  sceneActionEnabled?: boolean;
  sourceFrontend: Dsl4SourceFrontend;
  schema?: Readonly<Record<string, unknown>>;
  runtimeVersion?: string;
  tmPoseRuntime?: unknown;
  resolveTMPoseRuntime?: () => unknown;
  limits?: {maxSourceBytes?: number; maxAssetFiles?: number; maxTotalAssetBytes?: number};
  createRuntime?: (options: {
    vm: unknown;
    sourceFrontend: Dsl4SourceFrontend;
    runtimeVersion?: string;
    tmPoseRuntime?: unknown;
    resolveTMPoseRuntime?: () => unknown;
    createVm?: () => unknown;
    limits?: {maxSourceBytes?: number; maxAssetFiles?: number; maxTotalAssetBytes?: number};
  }) => PreviewRuntime;
}): () => void {
  const owner = record(Scratch.vm) ? Scratch.vm : null;
  const ownerKey = '__kamishibaiBlockIconPreviewDispose';
  const previous = owner?.[ownerKey];
  if (typeof previous === 'function') previous();
  const api = Scratch.gui?.blockEditors;
  if (api?.apiVersion !== 1 || typeof api.registerPreview !== 'function') return () => {};
  const runtime = createRuntime({
    vm: Scratch.vm,
    sourceFrontend,
    ...(runtimeVersion === undefined ? {} : {runtimeVersion}),
    ...(tmPoseRuntime === undefined ? {} : {tmPoseRuntime}),
    ...(resolveTMPoseRuntime === undefined ? {} : {resolveTMPoseRuntime}),
    ...(typeof Scratch.gui?.createPreviewVm === 'function'
      ? {createVm: Scratch.gui.createPreviewVm}
      : {}),
    ...(limits === undefined ? {} : {limits}),
  });
  const removers: (() => void)[] = [];
  const views = new Set<() => void>();
  let disposed = false;
  function ownView(cleanup: () => void) {
    let active = true;
    const release = () => {
      if (!active) return;
      active = false;
      views.delete(release);
      cleanup();
    };
    views.add(release);
    return release;
  }
  function mount(container: HTMLElement, context: Context, snapshot: Snapshot) {
    return ownView(mountDsl4BlockIconPreview({container, context, snapshot, runtime}));
  }
  function hover(anchor: HTMLElement | SVGElement, snapshot: Snapshot) {
    const document = anchor.ownerDocument;
    const controller = new AbortController();
    let handle: PreviewHandle | undefined;
    let tooltip: HTMLElement | undefined;
    const timer = setTimeout(() => {
      if (disposed || controller.signal.aborted || !anchor.isConnected) return;
      tooltip = document.createElement('aside');
      tooltip.dataset.dsl4BlockPreviewHover = 'true';
      tooltip.setAttribute('role', 'tooltip');
      tooltip.style.cssText =
        'position:fixed;z-index:2147483640;pointer-events:none;width:240px;aspect-ratio:4/3;background:#202329;border:2px solid #7b4ba8;border-radius:6px;box-shadow:0 8px 28px #0006;overflow:hidden;';
      const rect = anchor.getBoundingClientRect();
      const window = document.defaultView;
      tooltip.style.left = `${Math.max(8, Math.min(rect.right + 10, (window?.innerWidth ?? 1024) - 256))}px`;
      tooltip.style.top = `${Math.max(8, Math.min(rect.top, (window?.innerHeight ?? 768) - 196))}px`;
      document.body.appendChild(tooltip);
      const mount = document.createElement('div');
      mount.style.cssText = 'position:relative;width:100%;height:100%;';
      tooltip.appendChild(mount);
      void runtime
        .open({mount, snapshot, mode: 'still', signal: controller.signal})
        .then(async (created) => {
          if (controller.signal.aborted || disposed) await created.dispose();
          else handle = created;
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || !tooltip) return;
          tooltip.textContent =
            error instanceof Error ? error.message : 'プレビューを表示できません。';
          tooltip.style.color = 'white';
        });
    }, 220);
    let active = true;
    return ownView(() => {
      if (!active) return;
      active = false;
      controller.abort('hover-ended');
      clearTimeout(timer);
      if (handle) void Promise.resolve(handle.dispose()).catch(() => {});
      tooltip?.remove();
    });
  }
  try {
    if (sceneActionEnabled) {
      const namespaces = [
        {extensionId: 'kubohiroyakamishibairuntime4', prefix: 'kubohiroyakamishibairuntime4_'},
        {
          extensionId: 'kubohiroyakamishibai4',
          prefix: 'kubohiroyakamishibai4_kubohiroyakamishibairuntime4__',
        },
      ];
      for (const {extensionId, prefix} of namespaces) {
        // The SB3 component GUI rewrites runtime registrations into its bundle namespace.
        if (api.registerFixedInputEditor && extensionId === 'kubohiroyakamishibairuntime4') {
          for (const command of editableCommands)
            removers.push(
              api.registerFixedInputEditor(
                createFixedEditorOptions(extensionId, prefix + command, command),
              ),
            );
        }
        removers.push(
          api.registerPreview({
            extensionId,
            opcodes: dsl4TurboWarpActionBlockSpecs.map((spec) => prefix + spec.command),
            mount,
            hover,
          }),
        );
      }
      removers.push(
        api.registerPreview({
          extensionId: dsl4BlockAuthoringExtensionId,
          opcodes: [`${dsl4BlockAuthoringExtensionId}_scene`],
          mount,
          hover,
        }),
      );
    }
    if (assetEnabled) {
      removers.push(
        api.registerPreview({
          extensionId: dsl4BlockAuthoringExtensionId,
          opcodes: [`${dsl4BlockAuthoringExtensionId}_asset`],
          mount: (container, context, snapshot) =>
            ownView(
              mountDsl4BlockIconAssetPreview(
                container,
                context,
                snapshot,
                Scratch.vm,
                limits?.maxTotalAssetBytes,
              ),
            ),
        }),
      );
    }
  } catch (error) {
    for (const remove of removers.reverse()) remove();
    throw error;
  }
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const release of [...views]) release();
    for (const remove of removers.reverse()) remove();
    if (owner?.[ownerKey] === dispose) delete owner[ownerKey];
  };
  if (owner) owner[ownerKey] = dispose;
  return dispose;
}
