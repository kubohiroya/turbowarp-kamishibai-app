import {dsl4BlockAuthoringExtensionId} from '../block-source-shared.js';
import {dsl4TurboWarpActionBlockSpecs} from '../core-action-block-codec.js';
import {
  dsl4RotationStyleNames,
  isDsl4RotationStyle,
  normalizeDsl4Direction,
  scratchDsl4RotationStyle,
  type Dsl4RotationStyle,
} from '../rotation-style.js';
import type {Dsl4SourceFrontend} from '../source-frontend.js';
import {mountDsl4BlockIconAssetPreview} from './block-icon-asset-preview.js';
import {mountDsl4BlockArgumentView, type Dsl4BlockViewBlockly} from './block-icon-block-view.js';
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
  direction?: number;
  rotationStyle?: string;
  visible?: boolean;
  drawableID: number;
  setXY(x: number, y: number): void;
  setSize(size: number): void;
  setDirection?(direction: number): void;
  setRotationStyle?(style: string): void;
}
/** One stage gesture at a time: the size, or the rotation style with its angle. */
type StageEditor =
  | {kind: 'scale'; origin: number; value: number; min: number; max: number}
  | {
      kind: 'rotation';
      style: Dsl4RotationStyle;
      originStyle: string | undefined;
      origin: number;
      value: number;
      min: number;
      max: number;
    };
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
  gui?: {
    blockEditors?: RegistrationAPI;
    createPreviewVm?: () => unknown;
    getBlockly?: () => Promise<unknown>;
  };
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
  ROTATION: '回転',
  DIRECTION: '向き（度）',
  TEXT: '文章',
};
const rotationLabels: Record<Dsl4RotationStyle, string> = {
  allAround: '自由に回転',
  leftRight: '左右のみ',
  none: '回転しない',
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

/**
 * A pane shared with the scene dialog follows the selected block, so it shows the state at that
 * action with waits and moves at zero. A dialog opened on one action block replays that action.
 */
export function dsl4BlockPreviewMode(
  command: string,
  {shared = false}: {shared?: boolean} = {},
): 'still' | 'action' | 'scene' {
  if (command === 'scene') return 'scene';
  return !shared && animatedCommands.has(command) ? 'action' : 'still';
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

function setTransformDraft(context: Context, values: Record<string, number | string>) {
  const draft = context.getDraft();
  if (!record(draft.inputs) || context.getState().status !== 'editing') return;
  const description = context.getFixedInputView?.();
  for (const [name, value] of Object.entries(values)) {
    const usable = typeof value === 'number' ? Number.isFinite(value) : value.length > 0;
    if (!usable || description?.inputs[name]?.state !== 'editable') continue;
    const previous = draft.inputs[name];
    if (!record(previous)) continue;
    draft.inputs[name] = {
      value: typeof value === 'number' ? Math.round(value * 100) / 100 : value,
      changed: true,
      ...(previous.repair === true ? {repair: true} : {}),
    };
  }
  context.setDraft(draft);
}

/** Scratch measures direction clockwise from up, with 90 pointing right. */
export function dsl4PreviewDragDirection(
  pivot: {x: number; y: number},
  point: {x: number; y: number},
) {
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return 90;
  return normalizeDsl4Direction((Math.atan2(dx, -dy) * 180) / Math.PI);
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
      const numeric =
        argument.type === 'number' ||
        argument.name === 'SCALE' ||
        (command === 'show' && argument.name === 'DIRECTION');
      const optional =
        (command === 'setSkin' && argument.name === 'SCALE') ||
        (command === 'show' && ['ROTATION', 'DIRECTION'].includes(argument.name));
      const choices =
        argument.name === 'EASING'
          ? ['linear', 'easeIn', 'easeOut', 'easeInOut']
          : argument.name === 'ROTATION'
            ? [...dsl4RotationStyleNames]
            : null;
      const document = choices
        ? optional
          ? {anyOf: [{type: 'string', enum: choices}, {const: ''}]}
          : {type: 'string', enum: choices}
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
          ...(choices
            ? {
                choices: choices.map((value) => ({
                  value,
                  label: isDsl4RotationStyle(value) ? rotationLabels[value] : value,
                })),
              }
            : {}),
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
  shared = false,
  resolveBlockly,
  debounceMs = 100,
}: {
  container: HTMLElement;
  context: Context;
  snapshot: Snapshot;
  runtime: PreviewRuntime;
  /** The scene dialog's own pane, which follows the selected block instead of one action block. */
  shared?: boolean;
  /** Supplies the Editor's Blockly for the block view under the preview, when the host has one. */
  resolveBlockly?: () => Promise<Dsl4BlockViewBlockly | undefined>;
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
  const menu = document.createElement('div');
  menu.dataset.dsl4ActorMenu = 'true';
  menu.setAttribute('role', 'menu');
  menu.style.cssText =
    'display:none;position:absolute;z-index:2;min-width:9em;padding:4px;background:#fff;border:1px solid #0003;border-radius:6px;box-shadow:0 4px 14px #0004;';
  const scaleItem = document.createElement('button');
  scaleItem.type = 'button';
  scaleItem.setAttribute('role', 'menuitem');
  scaleItem.dataset.dsl4ActorMenuItem = 'scale';
  scaleItem.textContent = '拡大縮小';
  scaleItem.style.cssText = 'display:block;width:100%;text-align:left;';
  const rotationItem = document.createElement('button');
  rotationItem.type = 'button';
  rotationItem.setAttribute('role', 'menuitem');
  rotationItem.setAttribute('aria-haspopup', 'true');
  rotationItem.dataset.dsl4ActorMenuItem = 'rotation';
  rotationItem.textContent = '回転';
  rotationItem.style.cssText = 'display:block;width:100%;text-align:left;';
  const submenu = document.createElement('div');
  submenu.dataset.dsl4ActorSubmenu = 'rotation';
  submenu.setAttribute('role', 'menu');
  submenu.hidden = true;
  submenu.style.cssText = 'padding-left:8px;';
  const rotationItems = dsl4RotationStyleNames.map((style) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.dataset.dsl4ActorRotationStyle = style;
    item.textContent = rotationLabels[style];
    item.style.cssText = 'display:block;width:100%;text-align:left;';
    submenu.append(item);
    return {style, item};
  });
  menu.append(scaleItem, rotationItem, submenu);
  const panel = document.createElement('div');
  panel.dataset.dsl4ActorScalePanel = 'true';
  panel.hidden = true;
  panel.style.cssText =
    'display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:6px;';
  const panelLabel = document.createElement('label');
  panelLabel.style.cssText = 'font-size:12px;';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.dataset.dsl4ActorScaleSlider = 'true';
  slider.step = '1';
  const readout = document.createElement('output');
  readout.dataset.dsl4ActorScaleValue = 'true';
  readout.style.cssText = 'font-size:12px;min-width:4em;text-align:right;';
  const panelButtons = document.createElement('div');
  panelButtons.style.cssText =
    'grid-column:1 / -1;display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
  const resetScaleButton = document.createElement('button');
  resetScaleButton.type = 'button';
  resetScaleButton.dataset.dsl4ActorScaleAction = 'reset';
  resetScaleButton.textContent = 'リセット';
  const cancelScaleButton = document.createElement('button');
  cancelScaleButton.type = 'button';
  cancelScaleButton.dataset.dsl4ActorScaleAction = 'cancel';
  cancelScaleButton.textContent = 'キャンセル';
  const saveScaleButton = document.createElement('button');
  saveScaleButton.type = 'button';
  saveScaleButton.dataset.dsl4ActorScaleAction = 'save';
  saveScaleButton.textContent = '保存';
  panelButtons.append(resetScaleButton, cancelScaleButton, saveScaleButton);
  panel.append(panelLabel, slider, readout, panelButtons);
  viewport.append(stageMount, box, menu);
  const help = document.createElement('p');
  help.style.cssText = 'margin:0;font-size:12px;line-height:1.5;';
  help.textContent =
    command === 'moveTo'
      ? '設定を変えると動きを再生し直します。アクターをドラッグして移動先を指定できます。大きさと回転は直前のshow actorで設定します。'
      : command === 'show'
        ? 'アクターをドラッグして位置、青い枠のふちをドラッグして大きさを設定します。右クリックから拡大縮小と回転も設定できます。'
        : command === 'setSkin'
          ? '青い枠のふちをドラッグして大きさを設定します。'
          : command === 'say' ||
              command === 'think' ||
              command === 'sayText' ||
              command === 'thinkText'
            ? '設定を変えると、最新の内容で吹き出しを再生し直します。'
            : '設定は保存するまで台本に反映されません。';
  const blockView = document.createElement('div');
  blockView.style.cssText = 'min-width:0;width:100%;';
  root.append(toolbar, viewport, panel, help, blockView);
  container.appendChild(root);

  let disposed = false;
  let releaseBlockView: (() => void) | undefined;
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
  let editor: StageEditor | undefined;
  const specArguments =
    dsl4TurboWarpActionBlockSpecs.find((item) => item.command === command)?.arguments ?? [];
  const defaultDirection = (() => {
    const value = Number(
      specArguments.find((argument) => argument.name === 'DIRECTION')?.defaultValue,
    );
    return Number.isFinite(value) ? value : 90;
  })();
  const defaultScale = (() => {
    const value = Number(specArguments.find((argument) => argument.name === 'SCALE')?.defaultValue);
    return Number.isFinite(value) && value > 0 ? value : 100;
  })();
  const window = document.defaultView;
  const mode = dsl4BlockPreviewMode(command, {shared});
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
    // While the panel is open the whole actor scales; otherwise only its border does.
    const resize = (editor?.kind === 'scale' || onBorder) && canEdit('SCALE');
    const turn = editor?.kind === 'rotation' && editor.min !== editor.max;
    if (!turn && !resize && !(canEdit('X') && canEdit('Y'))) return;
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
      if (turn) {
        applyEditorValue(dsl4PreviewDragDirection(pivot, {x: input.clientX, y: input.clientY}));
      } else if (resize) {
        const next = dsl4PreviewDragScale(scale, pivot, start, {
          x: input.clientX,
          y: input.clientY,
        });
        if (editor?.kind === 'scale') applyEditorValue(next);
        else {
          selected.setSize(next);
          setTransformDraft(context, {SCALE: selected.size});
        }
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
        if (turn) applyEditorValue(editor!.origin);
        else {
          selected.setXY(origin.x, origin.y);
          if (editor?.kind === 'scale') applyEditorValue(scale);
          else selected.setSize(scale);
        }
        context.setDraft(previousDraft);
      }
      releaseGesture?.();
      // An open panel holds a value the draft does not have yet; replaying would discard it.
      if (!disposed && !editor) schedule();
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
  const scaleUnavailable =
    command === 'moveTo'
      ? '大きさは直前のshow actorで設定します。'
      : 'このブロックでは大きさを設定できません。';
  const rotationUnavailable = 'このブロックでは回転を設定できません。';
  function closeMenu() {
    menu.style.display = 'none';
    submenu.hidden = true;
  }
  function showValue(value: number) {
    const rounded = Math.round(value * 100) / 100;
    slider.value = String(rounded);
    readout.textContent = editor?.kind === 'rotation' ? `${rounded}度` : `${rounded}%`;
  }
  /** Keep the preview and the slider in step; the draft waits for 保存. */
  function applyEditorValue(value: number) {
    const selected = actor();
    if (!selected || !editor) return;
    const clamped = Math.max(editor.min, Math.min(editor.max, value));
    editor.value = clamped;
    if (editor.kind === 'scale') selected.setSize(clamped);
    else selected.setDirection?.(clamped);
    showValue(clamped);
    updateBounds();
  }
  function closeEditor() {
    const selected = actor();
    if (editor?.kind === 'rotation' && editor.originStyle !== undefined)
      selected?.setRotationStyle?.(editor.originStyle);
    editor = undefined;
    panel.hidden = true;
  }
  function openEditor(next: StageEditor, label: string) {
    editor = next;
    slider.min = String(next.min);
    slider.max = String(next.max);
    slider.disabled = next.min === next.max;
    panelLabel.textContent = label;
    panel.hidden = false;
    handle?.stop?.();
    showValue(next.value);
    status.textContent = slider.disabled
      ? '保存で引数に反映します。'
      : 'ドラッグかスライダーで値を変え、保存で引数に反映します。';
  }
  function openScaleEditor() {
    const selected = actor();
    if (!selected) return;
    if (!canEdit('SCALE')) {
      status.textContent = scaleUnavailable;
      return;
    }
    const origin = selected.size;
    openEditor(
      {kind: 'scale', origin, value: origin, min: Math.min(10, origin), max: Math.max(400, origin)},
      '大きさ',
    );
  }
  /** The chosen rotation style previews at once; 保存 writes it with the angle. */
  function openRotationEditor(style: Dsl4RotationStyle) {
    const selected = actor();
    if (!selected) return;
    if (!canEdit('ROTATION') || !canEdit('DIRECTION')) {
      status.textContent = rotationUnavailable;
      return;
    }
    const origin = Number.isFinite(selected.direction) ? Number(selected.direction) : 90;
    const originStyle = typeof selected.rotationStyle === 'string' ? selected.rotationStyle : '';
    selected.setRotationStyle?.(scratchDsl4RotationStyle(style));
    openEditor(
      {
        kind: 'rotation',
        style,
        originStyle,
        origin,
        value: origin,
        // Scratch keeps direction in this range, and a fixed actor needs no angle at all.
        min: style === 'none' ? origin : -179,
        max: style === 'none' ? origin : 180,
      },
      `回転：${rotationLabels[style]}`,
    );
  }
  const openMenu = (event: MouseEvent) => {
    if (!handle || !actor()) return;
    event.preventDefault();
    event.stopPropagation();
    const parent = viewport.getBoundingClientRect();
    menu.style.left = `${Math.max(0, event.clientX - parent.left)}px`;
    menu.style.top = `${Math.max(0, event.clientY - parent.top)}px`;
    menu.style.display = 'block';
    submenu.hidden = true;
    scaleItem.disabled = !canEdit('SCALE');
    rotationItem.disabled = !(canEdit('ROTATION') && canEdit('DIRECTION'));
    // A disabled item cannot explain itself on click, so say it as the menu opens.
    if (scaleItem.disabled) status.textContent = scaleUnavailable;
    else if (rotationItem.disabled) status.textContent = rotationUnavailable;
  };
  box.addEventListener('contextmenu', openMenu);
  scaleItem.addEventListener('click', () => {
    closeMenu();
    openScaleEditor();
  });
  rotationItem.addEventListener('click', () => {
    submenu.hidden = !submenu.hidden;
  });
  for (const {style, item} of rotationItems)
    item.addEventListener('click', () => {
      closeMenu();
      openRotationEditor(style);
    });
  viewport.addEventListener('pointerdown', closeMenu);
  slider.addEventListener('input', () => {
    const value = Number(slider.value);
    if (Number.isFinite(value)) applyEditorValue(value);
  });
  resetScaleButton.addEventListener('click', () => {
    if (editor) applyEditorValue(editor.kind === 'scale' ? defaultScale : defaultDirection);
  });
  cancelScaleButton.addEventListener('click', () => {
    if (!editor) return;
    applyEditorValue(editor.origin);
    closeEditor();
    status.textContent = '変更を取り消しました。';
  });
  saveScaleButton.addEventListener('click', () => {
    if (!editor) return;
    if (editor.kind === 'scale') setTransformDraft(context, {SCALE: editor.value});
    else {
      setTransformDraft(context, {ROTATION: editor.style, DIRECTION: editor.value});
      editor.originStyle = undefined;
    }
    closeEditor();
    status.textContent = '引数に反映しました。台本へはダイアログの保存で反映します。';
  });
  box.addEventListener('pointerdown', beginGesture);
  animateBounds();
  schedule(true);
  if (resolveBlockly)
    void resolveBlockly()
      .then((blockly) => {
        if (disposed || !blockly) return;
        releaseBlockView = mountDsl4BlockArgumentView({
          container: blockView,
          context,
          snapshot,
          blockly,
        });
      })
      .catch(report);
  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    cancelPending();
    releaseGesture?.();
    if (frame !== undefined) window?.cancelAnimationFrame(frame);
    box.removeEventListener('pointerdown', beginGesture);
    box.removeEventListener('contextmenu', openMenu);
    viewport.removeEventListener('pointerdown', closeMenu);
    releaseBlockView?.();
    releaseHandle();
    root.remove();
  };
}

/** Only a host that exposes a usable Blockly gets the block view; others keep the preview alone. */
function createBlockViewProvider(Scratch: PreviewScratch) {
  const getBlockly = Scratch.gui?.getBlockly;
  if (typeof getBlockly !== 'function') return undefined;
  return async () => {
    const blockly = await getBlockly();
    const xml = record(blockly) ? blockly.Xml : undefined;
    if (
      !record(blockly) ||
      typeof blockly.inject !== 'function' ||
      typeof blockly.getMainWorkspace !== 'function' ||
      !record(xml) ||
      typeof xml.blockToDom !== 'function' ||
      typeof xml.domToBlock !== 'function'
    )
      return undefined;
    return blockly as unknown as Dsl4BlockViewBlockly;
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
  const resolveBlockly = createBlockViewProvider(Scratch);
  function mount(container: HTMLElement, context: Context, snapshot: Snapshot) {
    return ownView(
      mountDsl4BlockIconPreview({
        container,
        context,
        snapshot,
        runtime,
        ...(resolveBlockly ? {resolveBlockly} : {}),
      }),
    );
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
