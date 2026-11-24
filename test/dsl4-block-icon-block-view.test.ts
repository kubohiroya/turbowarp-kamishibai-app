import assert from 'node:assert/strict';
import {test} from 'vitest';
import {
  dsl4BlockViewArgumentFields,
  dsl4BlockViewTrimStructure,
  dsl4BlockViewWriteArgument,
  mountDsl4BlockArgumentView,
  type Dsl4BlockViewBlock,
  type Dsl4BlockViewBlockly,
  type Dsl4BlockViewChange,
  type Dsl4BlockViewWorkspace,
} from '../src/dsl4/platform/block-icon-block-view.js';
import type {Dsl4BlockPreviewSnapshot} from '../src/dsl4/platform/block-icon-preview-editor.js';
import {createFakeDocument, type FakeElement} from './helpers/fake-dom.ts';

/** The fake DOM keeps `dataset` apart from attributes, so look the pane up by its dataset key. */
function requireView(container: FakeElement, blockId: string) {
  const root = container.children.find((child) => child.dataset.dsl4BlockArgumentView === blockId);
  if (!root) throw new Error(`No block argument view for ${blockId}`);
  return root;
}

function statusText(root: FakeElement) {
  return root.children.find((child) => child.attributes.get('role') === 'status')?.textContent;
}

class FakeField {
  constructor(private current: unknown) {}
  getValue() {
    return this.current;
  }
  setValue(value: unknown) {
    this.current = value;
  }
}

interface FakeInput {
  name?: string | null;
  fieldRow?: {name?: string | null}[];
  shadow?: FakeBlock;
}

class FakeBlock implements Dsl4BlockViewBlock {
  readonly inputList: {
    name?: string | null;
    fieldRow?: {name?: string | null}[];
    connection?: {targetBlock(): Dsl4BlockViewBlock | null} | null;
  }[];
  readonly fields = new Map<string, FakeField>();
  movable = true;
  deletable = true;
  constructor(
    readonly id: string,
    inputs: readonly FakeInput[],
    values: Readonly<Record<string, unknown>> = {},
  ) {
    for (const [name, value] of Object.entries(values)) this.fields.set(name, new FakeField(value));
    this.inputList = inputs.map((input) => ({
      ...(input.name === undefined ? {} : {name: input.name}),
      ...(input.fieldRow === undefined ? {} : {fieldRow: input.fieldRow}),
      ...(input.shadow === undefined
        ? {}
        : {connection: {targetBlock: () => input.shadow as Dsl4BlockViewBlock}}),
    }));
  }
  getField(name: string) {
    return this.fields.get(name) ?? null;
  }
  setMovable(movable: boolean) {
    this.movable = movable;
  }
  setDeletable(deletable: boolean) {
    this.deletable = deletable;
  }
}

function literalShadow(id: string, field: string, value: unknown) {
  return new FakeBlock(id, [{fieldRow: [{name: field}]}], {[field]: value});
}

/** `show actor`: a menu field on the block, and one literal shadow per numeric argument. */
function showActorBlock() {
  return new FakeBlock(
    'show-1',
    [
      {name: 'TARGET', shadow: literalShadow('shadow-target', 'TEXT', 'Hero')},
      {fieldRow: [{name: 'SKIN'}]},
      {name: 'X', shadow: literalShadow('shadow-x', 'NUM', '10')},
      {name: 'Y', shadow: literalShadow('shadow-y', 'NUM', '20')},
      {name: 'SCALE', shadow: literalShadow('shadow-scale', 'NUM', '100')},
    ],
    {SKIN: 'Smile'},
  );
}

test('arguments map to the field that holds their literal', () => {
  const fields = dsl4BlockViewArgumentFields(showActorBlock());
  assert.deepEqual(
    [...fields].sort(([a], [b]) => a.localeCompare(b)),
    [
      ['SCALE', {blockId: 'shadow-scale', field: 'NUM'}],
      ['SKIN', {blockId: 'show-1', field: 'SKIN'}],
      ['TARGET', {blockId: 'shadow-target', field: 'TEXT'}],
      ['X', {blockId: 'shadow-x', field: 'NUM'}],
      ['Y', {blockId: 'shadow-y', field: 'NUM'}],
    ],
  );
});

test('an input holding a reporter rather than one literal field is left alone', () => {
  const reporter = new FakeBlock('reporter', [
    {fieldRow: [{name: 'FIRST'}]},
    {fieldRow: [{name: 'SECOND'}]},
  ]);
  const fields = dsl4BlockViewArgumentFields(
    new FakeBlock('block', [{name: 'X', shadow: reporter}]),
  );
  assert.equal(fields.has('X'), false);
});

test('the copied block keeps its argument shadows and drops structure', () => {
  const document = createFakeDocument();
  const dom = document.createElement('block');
  const value = document.createElement('value');
  const statement = document.createElement('statement');
  const next = document.createElement('next');
  dom.append(value, statement, next);
  dsl4BlockViewTrimStructure(dom as unknown as Element);
  assert.deepEqual(
    dom.children.map((child) => child.tagName),
    ['VALUE'],
  );
});

function createContext(
  inputs: Record<string, Record<string, unknown>>,
  states: Record<string, string>,
  status = 'editing',
) {
  const listeners = new Set<() => void>();
  let draft: Record<string, unknown> = {inputs};
  let current = status;
  return {
    context: {
      getDraft: () => JSON.parse(JSON.stringify(draft)) as Record<string, never>,
      setDraft: (next: Record<string, unknown>) => {
        draft = next;
      },
      getState: () => ({status: current}),
      getFixedInputView: () => ({
        inputs: Object.fromEntries(Object.entries(states).map(([name, state]) => [name, {state}])),
      }),
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    draft: () => draft,
    setStatus(next: string) {
      current = next;
    },
    notify() {
      for (const listener of [...listeners]) listener();
    },
  };
}

test('a numeric argument takes the typed number and keeps a pending repair', () => {
  const session = createContext(
    {X: {value: 10, repair: true}, TARGET: {value: 'Hero'}},
    {X: 'editable', TARGET: 'editable'},
  );
  assert.equal(dsl4BlockViewWriteArgument(session.context, 'X', '42.5'), true);
  assert.deepEqual((session.draft().inputs as Record<string, unknown>).X, {
    value: 42.5,
    changed: true,
    repair: true,
  });
  assert.equal(dsl4BlockViewWriteArgument(session.context, 'TARGET', 'Villain'), true);
  assert.deepEqual((session.draft().inputs as Record<string, unknown>).TARGET, {
    value: 'Villain',
    changed: true,
  });
});

test('a value that is not a finite number, a locked input or a saving session is refused', () => {
  const session = createContext(
    {X: {value: 10}, SPEC: {value: '{"text":"Hi"}'}},
    {X: 'editable', SPEC: 'readOnly'},
  );
  for (const text of ['', ' ', 'abc', Infinity, null])
    assert.equal(dsl4BlockViewWriteArgument(session.context, 'X', text), false, String(text));
  assert.equal(dsl4BlockViewWriteArgument(session.context, 'SPEC', 'x'), false);
  assert.equal(dsl4BlockViewWriteArgument(session.context, 'MISSING', '1'), false);
  assert.deepEqual((session.draft().inputs as Record<string, unknown>).X, {value: 10});
  session.setStatus('saving');
  assert.equal(dsl4BlockViewWriteArgument(session.context, 'X', '5'), false);
});

function createBlockly(view: FakeBlock, source: FakeBlock = view) {
  const listeners = new Set<(event: Dsl4BlockViewChange) => void>();
  const blocks = new Map<string, Dsl4BlockViewBlock>();
  const register = (block: FakeBlock) => {
    blocks.set(block.id, block);
    for (const input of block.inputList) {
      const child = input.connection?.targetBlock();
      if (child) blocks.set(child.id, child);
    }
  };
  register(view);
  let disposed = false;
  let injected: FakeElement | undefined;
  const workspace: Dsl4BlockViewWorkspace = {
    getBlockById: (id) => blocks.get(id) ?? null,
    addChangeListener: (listener) => listeners.add(listener),
    removeChangeListener: (listener) => listeners.delete(listener),
    dispose: () => {
      disposed = true;
    },
  };
  const main: Dsl4BlockViewWorkspace = {
    getBlockById: (id) => (id === source.id ? source : null),
    addChangeListener: () => {},
    removeChangeListener: () => {},
  };
  const blockly: Dsl4BlockViewBlockly = {
    inject: (container, options) => {
      injected = container as unknown as FakeElement;
      Object.assign(blockly, {options});
      return workspace;
    },
    getMainWorkspace: () => main,
    Xml: {
      blockToDom: (block) => {
        const document = injected?.ownerDocument ?? createFakeDocument();
        const dom = document.createElement('block');
        dom.attributes.set('type', block.id);
        return dom as unknown as Element;
      },
      domToBlock: () => view,
    },
  };
  return {
    blockly,
    emit(event: Dsl4BlockViewChange) {
      for (const listener of [...listeners]) listener(event);
    },
    listenerCount: () => listeners.size,
    isDisposed: () => disposed,
  };
}

const snapshot: Dsl4BlockPreviewSnapshot = {
  targetId: 'target',
  blockId: 'show-1',
  opcode: 'kubohiroyakamishibairuntime4_show',
  arguments: {
    TARGET: {kind: 'literal', value: 'Hero'},
    X: {kind: 'literal', value: 10},
    Y: {kind: 'literal', value: 20},
    SCALE: {kind: 'literal', value: 100},
    SKIN: {kind: 'literal', value: 'Smile'},
  },
};

test('editing a field writes the draft, and the draft writes back into the fields', () => {
  const document = createFakeDocument();
  const container = document.createElement('div');
  const view = showActorBlock();
  const host = createBlockly(view);
  const session = createContext(
    {X: {value: 10}, Y: {value: 20}, SCALE: {value: 100}, TARGET: {value: 'Hero'}},
    {X: 'editable', Y: 'editable', SCALE: 'editable', TARGET: 'editable'},
  );
  const dispose = mountDsl4BlockArgumentView({
    container: container as unknown as HTMLElement,
    context: session.context,
    snapshot,
    blockly: host.blockly,
  });
  const root = requireView(container, 'show-1');
  assert.equal(root.attributes.get('aria-label'), 'ブロックの引数');
  // The copy never moves or disappears; structure stays with the tree on the left.
  assert.equal(view.movable, false);
  assert.equal(view.deletable, false);

  host.emit({type: 'change', element: 'field', blockId: 'shadow-x', name: 'NUM', newValue: '35'});
  assert.deepEqual((session.draft().inputs as Record<string, unknown>).X, {
    value: 35,
    changed: true,
  });

  // A change the form or a stage drag made reaches the rendered field.
  session.notify();
  assert.equal(view.inputList[2]!.connection!.targetBlock()!.getField('NUM')!.getValue(), '35');

  dispose();
  assert.equal(host.listenerCount(), 0);
  assert.equal(host.isDisposed(), true);
  assert.equal(container.children.length, 0);
});

test('an argument the form owns is put back and explained instead of written', () => {
  const document = createFakeDocument();
  const container = document.createElement('div');
  const view = showActorBlock();
  const host = createBlockly(view);
  const session = createContext({X: {value: 10}}, {X: 'locked'});
  const dispose = mountDsl4BlockArgumentView({
    container: container as unknown as HTMLElement,
    context: session.context,
    snapshot,
    blockly: host.blockly,
  });
  host.emit({type: 'change', element: 'field', blockId: 'shadow-x', name: 'NUM', newValue: '77'});
  assert.deepEqual((session.draft().inputs as Record<string, unknown>).X, {value: 10});
  assert.equal(statusText(requireView(container, 'show-1')), 'この引数はフォームで編集します。');
  assert.equal(view.inputList[2]!.connection!.targetBlock()!.getField('NUM')!.getValue(), '10');
  dispose();
});

test('a block the Editor no longer holds reports why nothing is shown', () => {
  const document = createFakeDocument();
  const container = document.createElement('div');
  const view = showActorBlock();
  const host = createBlockly(view, new FakeBlock('other', []));
  const session = createContext({X: {value: 10}}, {X: 'editable'});
  const dispose = mountDsl4BlockArgumentView({
    container: container as unknown as HTMLElement,
    context: session.context,
    snapshot,
    blockly: host.blockly,
  });
  assert.equal(statusText(requireView(container, 'show-1')), '編集するブロックが見つかりません。');
  dispose();
});
