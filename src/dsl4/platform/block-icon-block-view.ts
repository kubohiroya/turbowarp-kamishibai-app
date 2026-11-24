import type {Dsl4BlockPreviewSnapshot} from './block-icon-preview-editor.js';

type Literal = string | number | boolean;
type Json = null | Literal | Json[] | {[key: string]: Json};
type Draft = {[key: string]: Json};

interface Context {
  getDraft(): Draft;
  setDraft(draft: Draft): void;
  getState(): {status: string; issues?: readonly {message: string}[]};
  getFixedInputView?(): {inputs: Record<string, {state: string}>} | undefined;
  subscribe(listener: () => void): () => void;
}

export interface Dsl4BlockViewField {
  getValue(): unknown;
  setValue(value: unknown): void;
}
export interface Dsl4BlockViewInput {
  readonly name?: string | null;
  readonly fieldRow?: readonly {readonly name?: string | null}[];
  readonly connection?: {targetBlock(): Dsl4BlockViewBlock | null} | null;
}
export interface Dsl4BlockViewBlock {
  readonly id: string;
  readonly inputList: readonly Dsl4BlockViewInput[];
  getField(name: string): Dsl4BlockViewField | null;
  setMovable?(movable: boolean): void;
  setDeletable?(deletable: boolean): void;
}
export interface Dsl4BlockViewChange {
  readonly type?: string;
  readonly element?: string;
  readonly blockId?: string;
  readonly name?: string;
  readonly newValue?: unknown;
}
export interface Dsl4BlockViewWorkspace {
  getBlockById(id: string): Dsl4BlockViewBlock | null;
  addChangeListener(listener: (event: Dsl4BlockViewChange) => void): void;
  removeChangeListener(listener: (event: Dsl4BlockViewChange) => void): void;
  dispose?(): void;
}
export interface Dsl4BlockViewBlockly {
  inject(
    container: HTMLElement,
    options: Readonly<Record<string, unknown>>,
  ): Dsl4BlockViewWorkspace;
  getMainWorkspace(): Dsl4BlockViewWorkspace | null;
  readonly Xml: {
    blockToDom(block: Dsl4BlockViewBlock, noId?: boolean): Element;
    domToBlock(dom: Element, workspace: Dsl4BlockViewWorkspace): Dsl4BlockViewBlock;
  };
}
/** Where an argument's value lives in the rendered copy: a field on the block or on its shadow. */
export interface Dsl4BlockViewArgumentField {
  readonly blockId: string;
  readonly field: string;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Map each argument to the field that holds its literal. Inputs carry the argument name and hold
 * a shadow block with the value; menus and fixed fields sit on the block itself.
 */
export function dsl4BlockViewArgumentFields(
  block: Dsl4BlockViewBlock,
): Map<string, Dsl4BlockViewArgumentField> {
  const found = new Map<string, Dsl4BlockViewArgumentField>();
  for (const input of block.inputList) {
    for (const field of input.fieldRow ?? [])
      if (field.name) found.set(field.name, {blockId: block.id, field: field.name});
    const name = input.name;
    const shadow = input.connection?.targetBlock() ?? null;
    if (!name || !shadow) continue;
    const held = shadow.inputList.flatMap((entry) =>
      (entry.fieldRow ?? []).filter((field) => !!field.name),
    );
    // Only a single-field literal shadow stands for one argument; reporters stay untouched.
    if (held.length === 1) found.set(name, {blockId: shadow.id, field: held[0]!.name!});
  }
  return found;
}

/** Keep the selected block and its argument shadows; the tree on the left owns the structure. */
export function dsl4BlockViewTrimStructure(dom: Element): Element {
  for (const tag of ['next', 'statement', 'comment'])
    for (const node of [...dom.children].filter((child) => child.tagName.toLowerCase() === tag))
      node.remove();
  return dom;
}

/** Literal arguments the fixed-input contract marks editable; JSON arguments stay with the form. */
function editableArgument(context: Context, argument: string) {
  return (
    context.getState().status === 'editing' &&
    context.getFixedInputView?.()?.inputs[argument]?.state === 'editable'
  );
}

function draftValue(context: Context, snapshot: Dsl4BlockPreviewSnapshot, argument: string) {
  const inputs = context.getDraft().inputs;
  if (record(inputs) && record(inputs[argument])) {
    const entry = inputs[argument];
    if (typeof entry.buffer === 'string') return entry.buffer;
    if (Object.hasOwn(entry, 'value')) return entry.value;
  }
  return snapshot.arguments[argument]?.value;
}

/** Write one argument through the same draft shape the form and the stage gestures use. */
export function dsl4BlockViewWriteArgument(
  context: Context,
  argument: string,
  text: unknown,
): boolean {
  const draft = context.getDraft();
  if (!record(draft.inputs) || !editableArgument(context, argument)) return false;
  const previous = draft.inputs[argument];
  if (!record(previous)) return false;
  const numeric =
    typeof previous.value === 'number' ||
    (previous.value === undefined && typeof previous.buffer === 'string');
  let value: Literal;
  if (numeric) {
    if (typeof text !== 'string' && typeof text !== 'number') return false;
    const parsed = Number(text);
    if (String(text).trim() === '' || !Number.isFinite(parsed)) return false;
    value = parsed;
  } else if (typeof text === 'string' || typeof text === 'boolean') value = text;
  else if (typeof text === 'number' && Number.isFinite(text)) value = text;
  else return false;
  draft.inputs[argument] = {
    value,
    changed: true,
    ...(previous.repair === true ? {repair: true} : {}),
  };
  context.setDraft(draft);
  return true;
}

/**
 * Show the selected block itself and edit only its argument values. Blocks are never added,
 * removed or reordered here, and the Editor's own workspace, stage and VM stay unchanged.
 */
export function mountDsl4BlockArgumentView({
  container,
  context,
  snapshot,
  blockly,
  injectOptions = {},
}: {
  container: HTMLElement;
  context: Context;
  snapshot: Dsl4BlockPreviewSnapshot;
  blockly: Dsl4BlockViewBlockly;
  injectOptions?: Readonly<Record<string, unknown>>;
}): () => void {
  const document = container.ownerDocument;
  const root = document.createElement('section');
  root.dataset.dsl4BlockArgumentView = snapshot.blockId;
  root.setAttribute('aria-label', 'ブロックの引数');
  root.style.cssText =
    'display:grid;grid-template-rows:auto minmax(0,1fr) auto;min-width:0;width:100%;gap:6px;';
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.style.cssText = 'font-size:12px;line-height:1.5;';
  const surface = document.createElement('div');
  surface.style.cssText =
    'position:relative;width:100%;min-width:0;min-height:120px;overflow:hidden;border-radius:6px;background:#f9f9f9;';
  const help = document.createElement('p');
  help.style.cssText = 'margin:0;font-size:12px;line-height:1.5;';
  help.textContent =
    'ブロックの引数の値をこの表示から直接編集できます。ブロックの追加・削除・並べ替えはできません。保存するまで台本には反映しません。';
  root.append(status, surface, help);
  container.appendChild(root);

  let disposed = false;
  let workspace: Dsl4BlockViewWorkspace | undefined;
  let view: Dsl4BlockViewBlock | undefined;
  let fields = new Map<string, Dsl4BlockViewArgumentField>();
  let applying = false;
  const owners = new Map<string, string>();

  function field(location: Dsl4BlockViewArgumentField) {
    const block = workspace?.getBlockById(location.blockId);
    return block?.getField(location.field) ?? null;
  }
  function show(text: string) {
    if (!disposed) status.textContent = text;
  }
  /** Mirror the draft into the rendered fields so the form and the stage stay the source. */
  function apply() {
    if (disposed || !workspace) return;
    applying = true;
    try {
      for (const [argument, location] of fields) {
        const target = field(location);
        if (!target) continue;
        const value = draftValue(context, snapshot, argument);
        if (value === undefined || value === null) continue;
        if (String(target.getValue()) !== String(value)) target.setValue(String(value));
      }
    } finally {
      applying = false;
    }
  }
  const changed = (event: Dsl4BlockViewChange) => {
    if (disposed || applying || event.type !== 'change' || event.element !== 'field') return;
    const argument =
      event.blockId && event.name ? owners.get(`${event.blockId}/${event.name}`) : undefined;
    if (!argument) return;
    if (dsl4BlockViewWriteArgument(context, argument, event.newValue)) show('');
    else {
      // A JSON argument, a locked input or an unusable value belongs to the form; put it back.
      apply();
      show(
        context.getState().status === 'editing'
          ? 'この引数はフォームで編集します。'
          : '保存中は編集できません。',
      );
    }
  };

  try {
    const main = blockly.getMainWorkspace();
    const source = main?.getBlockById(snapshot.blockId) ?? null;
    if (!source) throw new Error('編集するブロックが見つかりません。');
    workspace = blockly.inject(surface, {
      readOnly: false,
      scrollbars: true,
      trashcan: false,
      zoom: {startScale: 0.675, controls: false, wheel: false},
      ...injectOptions,
    });
    const dom = dsl4BlockViewTrimStructure(blockly.Xml.blockToDom(source, true));
    view = blockly.Xml.domToBlock(dom, workspace);
    view.setMovable?.(false);
    view.setDeletable?.(false);
    fields = dsl4BlockViewArgumentFields(view);
    for (const [argument, location] of fields)
      owners.set(`${location.blockId}/${location.field}`, argument);
    workspace.addChangeListener(changed);
    apply();
  } catch (error) {
    show(error instanceof Error ? error.message : 'ブロックを表示できません。');
  }

  const unsubscribe = context.subscribe(() => {
    if (disposed) return;
    apply();
  });
  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    if (workspace) {
      workspace.removeChangeListener(changed);
      workspace.dispose?.();
    }
    root.remove();
  };
}
