import assert from 'node:assert/strict';
import {test, vi} from 'vitest';
import {
  dsl4BlockPreviewDraftChanges,
  dsl4PreviewDragPosition,
  dsl4PreviewDragScale,
  installDsl4BlockIconPreviews,
  mountDsl4BlockIconPreview,
  type Dsl4BlockPreviewSnapshot,
} from '../src/dsl4/platform/block-icon-preview-editor.js';
import {createFakeDocument, type FakeElement} from './helpers/fake-dom.ts';
import {deferred} from './helpers/async-test-helpers.ts';
import {dsl4TestSourceFrontend} from './helpers/dsl4-test-frontend.ts';

type MountOptions = Parameters<typeof mountDsl4BlockIconPreview>[0];
type Draft = ReturnType<MountOptions['context']['getDraft']>;
type Preview = Awaited<ReturnType<MountOptions['runtime']['open']>>;
const snapshot = {
  targetId: 'stage',
  blockId: 'move',
  opcode: 'kubohiroyakamishibairuntime4_moveTo',
  arguments: {TARGET: {kind: 'literal', value: 'Actor'}},
};
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

test('preview draft projection preserves unrelated data and exact unchanged literals', () => {
  const draft: Draft = {
    inputs: {
      X: {value: 12.5, changed: true},
      Y: {value: 40, changed: false},
      SECONDS: {value: 2, changed: true, buffer: '2e0'},
      TARGET: {readOnly: true},
    },
    metadata: 'keep',
  };
  assert.deepEqual(dsl4BlockPreviewDraftChanges('moveTo', draft), {X: 12.5, SECONDS: '2e0'});
  assert.equal(draft.metadata, 'keep');
  assert.deepEqual(dsl4BlockPreviewDraftChanges('say', {data: {text: '変更', bubbleMotions: []}}), {
    SPEC: '{"text":"変更","bubbleMotions":[]}',
  });
  assert.deepEqual(dsl4BlockPreviewDraftChanges('scene', {data: {recognitionMode: 'pose'}}), {
    PROPERTIES: '{"recognitionMode":"pose"}',
  });
  assert.throws(
    () =>
      dsl4BlockPreviewDraftChanges('moveTo', {
        inputs: {SECONDS: {changed: true, value: 2, buffer: '2e'}},
      }),
    /秒数/u,
  );
});

test('drag geometry maps responsive canvas pixels and scales around an asymmetric actor pivot', () => {
  assert.deepEqual(
    dsl4PreviewDragPosition({x: 10, y: 20}, {x: 30, y: 15}, {width: 240, height: 180}),
    {
      x: 70,
      y: -10,
    },
  );
  assert.equal(dsl4PreviewDragScale(100, {x: 50, y: 40}, {x: 80, y: 40}, {x: 110, y: 40}), 200);
  assert.equal(dsl4PreviewDragScale(100, {x: 50, y: 40}, {x: 50, y: 40}, {x: 80, y: 40}), 100);
  assert.throws(() => dsl4PreviewDragPosition({x: 0, y: 0}, {x: 1, y: 1}, {width: 0, height: 10}));
});

function fixture(command = 'moveTo', draft: Draft = {inputs: {X: {value: 30, changed: false}}}) {
  const document = createFakeDocument();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const listeners = new Set<() => void>();
  const state = {status: 'editing', issues: [] as {message: string}[]};
  let currentDraft = structuredClone(draft);
  const requests: {
    options: Parameters<MountOptions['runtime']['open']>[0];
    result: ReturnType<typeof deferred<Preview>>;
  }[] = [];
  const context: MountOptions['context'] = {
    getDraft: () => structuredClone(currentDraft),
    setDraft(value) {
      currentDraft = structuredClone(value);
      for (const listener of listeners) listener();
    },
    getState: () => state,
    getFixedInputView: () => ({
      inputs: {
        X: {state: 'editable'},
        Y: {state: 'editable'},
        SCALE: {state: 'editable'},
      },
    }),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const dispose = mountDsl4BlockIconPreview({
    container: container as unknown as HTMLElement,
    snapshot: {...snapshot, opcode: `kubohiroyakamishibairuntime4_${command}`},
    context,
    runtime: {
      open(options) {
        const result = deferred<Preview>();
        requests.push({options, result});
        return result.promise;
      },
    },
  });
  function preview() {
    const stop = vi.fn();
    const release = vi.fn();
    const canvas = document.createElement('canvas');
    return {runtime: {}, canvas: canvas as unknown as HTMLCanvasElement, stop, dispose: release};
  }
  return {
    document,
    container,
    context,
    state,
    requests,
    dispose,
    preview,
    notify: () => {
      for (const listener of listeners) listener();
    },
    listeners,
  };
}

test('live settings immediately cancel the old animation, debounce only the newest draft, and release late results', async () => {
  vi.useFakeTimers();
  try {
    const f = fixture();
    assert.equal(f.requests.length, 1);
    const first = f.requests[0]!;
    f.context.setDraft({
      inputs: {X: {value: 60, changed: true}, SECONDS: {value: 0.4, changed: true}},
    });
    assert.equal(first.options.signal.aborted, true);
    f.context.setDraft({
      inputs: {X: {value: 90, changed: true}, EASING: {value: 'easeOut', changed: true}},
    });
    await vi.advanceTimersByTimeAsync(99);
    assert.equal(f.requests.length, 1);
    await vi.advanceTimersByTimeAsync(1);
    assert.equal(f.requests.length, 2);
    assert.deepEqual(f.requests[1]!.options.changes, {X: 90, EASING: 'easeOut'});
    const stale = f.preview();
    first.result.resolve(stale);
    await settle();
    assert.equal(stale.dispose.mock.calls.length, 1);
    const current = f.preview();
    f.requests[1]!.result.resolve(current);
    await settle();
    assert.equal(current.dispose.mock.calls.length, 0);
    f.dispose();
    f.dispose();
    await settle();
    assert.equal(f.requests[1]!.options.signal.aborted, true);
    assert.equal(current.dispose.mock.calls.length, 1);
    assert.equal(f.listeners.size, 0);
    assert.equal(f.container.children.length, 0);
  } finally {
    vi.useRealTimers();
  }
});

test('Bubble changes use the latest schema form draft and invalid fields stop playback until corrected', async () => {
  vi.useFakeTimers();
  try {
    const f = fixture('say', {data: {text: '先', seconds: 1}});
    const initial = f.preview();
    f.requests[0]!.result.resolve(initial);
    await settle();
    f.state.issues = [{message: 'invalid'}];
    f.context.setDraft({data: {text: '後', seconds: -1}});
    assert.equal(f.requests[0]!.options.signal.aborted, true);
    assert.equal(initial.stop.mock.calls.length, 1);
    await vi.advanceTimersByTimeAsync(200);
    assert.equal(f.requests.length, 1);
    f.context.setDraft({data: {text: '後', seconds: 0.5, bubbleReveal: {mode: 'characters'}}});
    f.state.issues = [];
    f.notify();
    await vi.advanceTimersByTimeAsync(100);
    assert.equal(f.requests.length, 2);
    assert.equal(f.requests[1]!.options.mode, 'action');
    assert.deepEqual(JSON.parse(String(f.requests[1]!.options.changes?.SPEC)), {
      text: '後',
      seconds: 0.5,
      bubbleReveal: {mode: 'characters'},
    });
    f.dispose();
  } finally {
    vi.useRealTimers();
  }
});

test('native speech text and duration drafts replay both Bubble variants without a SPEC field', async () => {
  vi.useFakeTimers();
  try {
    for (const command of ['sayText', 'thinkText']) {
      const f = fixture(command, {
        inputs: {TEXT: {value: '先', changed: false}, SECONDS: {value: 1, changed: false}},
      });
      const initial = f.preview();
      f.requests[0]!.result.resolve(initial);
      await settle();
      assert.equal(f.requests[0]!.options.mode, 'action');
      f.context.setDraft({
        inputs: {
          TEXT: {value: '後', changed: true},
          SECONDS: {value: 0.5, changed: true, buffer: '0.5'},
        },
      });
      assert.equal(f.requests[0]!.options.signal.aborted, true);
      await vi.advanceTimersByTimeAsync(100);
      assert.equal(f.requests.length, 2);
      assert.equal(f.requests[1]!.options.mode, 'action');
      assert.deepEqual(f.requests[1]!.options.changes, {TEXT: '後', SECONDS: '0.5'});
      f.dispose();
    }
  } finally {
    vi.useRealTimers();
  }
});

test('Stop preserves the stage and Replay creates a new run without changing the draft', async () => {
  const f = fixture();
  const current = f.preview();
  f.requests[0]!.result.resolve(current);
  await settle();
  const toolbar = f.container.children[0]!.children[0]!;
  toolbar.children[1]!.click();
  assert.equal(current.stop.mock.calls.length, 1);
  assert.equal(current.dispose.mock.calls.length, 0);
  assert.equal(f.requests[0]!.options.signal.aborted, false);
  toolbar.children[0]!.click();
  assert.equal(f.requests.length, 2);
  assert.equal(current.dispose.mock.calls.length, 1);
  assert.deepEqual(f.context.getDraft(), {inputs: {X: {value: 30, changed: false}}});
  f.dispose();
});

function pointer(element: FakeElement, type: string, x: number, y: number) {
  const event = {
    type,
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: 1,
    isPrimary: true,
    preventDefault() {},
    stopPropagation() {},
  } as PointerEvent;
  for (const listener of element.listeners.get(type) ?? [])
    (listener as unknown as (event: PointerEvent) => void)(event);
}

test('actor dragging uses logical size at high DPI and pointer cancellation restores the draft', async () => {
  vi.useFakeTimers();
  try {
    const initial: Draft = {
      inputs: {
        X: {value: 0, changed: false},
        Y: {value: 0, changed: false},
        SCALE: {value: 100, changed: false},
      },
      metadata: 'retained',
    };
    const f = fixture('show', initial);
    const actor = {
      x: 0,
      y: 0,
      size: 100,
      drawableID: 1,
      setXY(x: number, y: number) {
        this.x = x;
        this.y = y;
      },
      setSize(size: number) {
        this.size = size;
      },
    };
    const canvas = f.document.createElement('canvas');
    Object.assign(canvas, {width: 960, height: 720});
    canvas.setBoundingClientRect({left: 100, top: 200, width: 240, height: 180});
    f.requests[0]!.result.resolve({
      canvas: canvas as unknown as HTMLCanvasElement,
      runtime: {
        renderer: {
          getNativeSize: () => [480, 360],
          getBounds: () => ({left: -30, right: 50, top: 80, bottom: -20}),
        },
      },
      getActor: () => actor,
      stop() {},
      dispose() {},
    });
    await settle();
    const box = f.container.children[0]!.children[1]!.children[1]!;
    assert.equal(box.style.left, '205px');
    assert.equal(box.style.top, '250px');
    assert.equal(box.style.width, '40px');
    box.setBoundingClientRect({left: 205, top: 250, width: 40, height: 50});
    pointer(box, 'pointerdown', 225, 275);
    pointer(box, 'pointermove', 255, 290);
    assert.equal(actor.x, 60);
    assert.equal(actor.y, -30);
    assert.deepEqual(dsl4BlockPreviewDraftChanges('show', f.context.getDraft()), {X: 60, Y: -30});
    pointer(box, 'pointercancel', 255, 290);
    assert.equal(actor.x, 0);
    assert.equal(actor.y, 0);
    assert.deepEqual(f.context.getDraft(), initial);
    assert.equal(box.pointerCaptures.size, 0);
    f.dispose();
  } finally {
    vi.useRealTimers();
  }
});

test('installation is inert without the preview capability and registers fixed editors only on supporting hosts', () => {
  let created = 0;
  const noCapability = installDsl4BlockIconPreviews({
    Scratch: {vm: {}, gui: {blockEditors: {apiVersion: 1}}},
    sourceFrontend: dsl4TestSourceFrontend,
    createRuntime: () => {
      created++;
      return {
        open: async () => {
          throw new Error('unused');
        },
      };
    },
  });
  noCapability();
  assert.equal(created, 0);
  const previews: {extensionId: string; opcodes: string[]}[] = [];
  const fixed: unknown[] = [];
  const removed = new Set<unknown>();
  const tmPoseRuntime = {loadFromFiles: () => {}, Webcam: class {}};
  const resolveTMPoseRuntime = () => {
    throw new Error('Do not resolve the later bundle member while registering previews');
  };
  const createPreviewVm = () => ({runtime: {}});
  const dispose = installDsl4BlockIconPreviews({
    Scratch: {
      vm: {},
      gui: {
        createPreviewVm,
        blockEditors: {
          apiVersion: 1,
          registerPreview(definition) {
            previews.push(definition);
            return () => {
              removed.add(definition);
            };
          },
          registerFixedInputEditor(definition) {
            fixed.push(definition);
            return () => {
              removed.add(definition);
            };
          },
        },
      },
    },
    sourceFrontend: dsl4TestSourceFrontend,
    tmPoseRuntime,
    resolveTMPoseRuntime,
    createRuntime: (options) => {
      assert.equal(options.tmPoseRuntime, tmPoseRuntime);
      assert.equal(options.resolveTMPoseRuntime, resolveTMPoseRuntime);
      assert.equal(options.createVm, createPreviewVm);
      return {
        open: async () => {
          throw new Error('unused');
        },
      };
    },
  });
  assert.equal(previews.length, 4);
  assert.equal(fixed.length, 5);
  const show = fixed[0] as {bindings: {argument: string; encode(value: unknown): unknown}[]};
  const x = show.bindings.find((binding) => binding.argument === 'X')!;
  assert.equal(x.encode(125.5), '125.5');
  assert.equal(x.encode(-0), '-0');
  assert.equal(x.encode('1.255e2'), '1.255e2');
  assert.throws(() => x.encode(Number.POSITIVE_INFINITY), /finite/u);
  const skin = fixed[2] as {bindings: {argument: string; encode(value: unknown): unknown}[]};
  assert.equal(skin.bindings.find((binding) => binding.argument === 'SCALE')!.encode(''), '');
  assert.ok(previews[0]!.opcodes.includes('kubohiroyakamishibairuntime4_moveTo'));
  assert.ok(previews[0]!.opcodes.includes('kubohiroyakamishibairuntime4_sayText'));
  assert.ok(
    previews[1]!.opcodes.includes('kubohiroyakamishibai4_kubohiroyakamishibairuntime4__thinkText'),
  );
  assert.ok(
    previews[1]!.opcodes.includes('kubohiroyakamishibai4_kubohiroyakamishibairuntime4__say'),
  );
  assert.deepEqual(previews[2]!.opcodes, ['kubohiroyakamishibaiauthoring4_scene']);
  assert.deepEqual(previews[3]!.opcodes, ['kubohiroyakamishibaiauthoring4_asset']);
  dispose();
  dispose();
  assert.equal(removed.size, 9);
});

test('the asset icon preview renders the current form draft and releases replaced or closed media', async () => {
  vi.useFakeTimers();
  const createUrl = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValueOnce('blob:first')
    .mockReturnValueOnce('blob:second');
  const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  try {
    const document = createFakeDocument();
    const container = document.createElement('div');
    const opcode = 'kubohiroyakamishibaiauthoring4_asset';
    let mount:
      | ((
          container: HTMLElement,
          context: MountOptions['context'],
          snapshot: Dsl4BlockPreviewSnapshot,
        ) => () => void)
      | undefined;
    const costume = (name: string) => ({
      name,
      asset: {data: new Uint8Array([1, 2, 3]), dataFormat: 'png'},
    });
    const blocks = new Map([
      ['asset', {opcode, inputs: {NAME: {block: 'name', shadow: 'name'}}}],
      ['name', {opcode: 'text', shadow: true, fields: {TEXT: {value: 'First'}}}],
    ]);
    const dispose = installDsl4BlockIconPreviews({
      Scratch: {
        vm: {
          runtime: {
            targets: [
              {
                id: 'stage',
                isStage: true,
                sprite: {costumes: [costume('First')]},
                blocks: {getBlock: (id: string) => blocks.get(id)},
              },
              {isStage: false, sprite: {name: 'Hero', costumes: [costume('Second')]}},
            ],
          },
        },
        gui: {
          blockEditors: {
            apiVersion: 1,
            registerPreview(definition) {
              assert.deepEqual(definition.opcodes, [opcode]);
              assert.equal(definition.hover, undefined);
              mount = definition.mount;
              return () => {};
            },
          },
        },
      },
      sourceFrontend: dsl4TestSourceFrontend,
      sceneActionEnabled: false,
    });
    assert.ok(mount);
    let draft: Draft = {data: 'backdrop'};
    let status = 'editing';
    const listeners = new Set<() => void>();
    const close = mount(
      container as unknown as HTMLElement,
      {
        getDraft() {
          assert.equal(status, 'editing');
          return draft;
        },
        setDraft: () => assert.fail('a preview must not write the form draft'),
        getState: () => ({status}),
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      },
      {
        targetId: 'stage',
        blockId: 'asset',
        opcode,
        arguments: {
          VALUE: {kind: 'literal', value: '"backdrop"'},
        },
      },
    );
    const section = container.children[0]!;
    await vi.advanceTimersByTimeAsync(0);
    const image = () => section.children.find((child) => child.tagName === 'IMG');
    const details = () =>
      section.children.find((child) => Object.hasOwn(child.dataset, 'dsl4AssetPreviewDetails'));
    const storage = () =>
      section.children.find((child) => Object.hasOwn(child.dataset, 'dsl4AssetPreviewStorage'));
    assert.equal(image()?.src, 'blob:first');
    assert.equal(image()?.dataset.dsl4AssetTransparency, undefined);
    assert.equal(details()?.hidden, true);
    const firstImage = image()!;
    Object.assign(firstImage, {naturalWidth: 640, naturalHeight: 480});
    firstImage.dispatch('load');
    assert.equal(details()?.textContent, '640 × 480 px · 3 バイト');
    assert.equal(details()?.hidden, false);
    assert.equal(storage()?.textContent, '保持形態 embedded-file');

    const edit = (data: Draft['data']) => {
      draft = {data};
      for (const notify of listeners) notify();
    };
    edit({kind: 'backdrop', name: 'Missing'});
    await vi.advanceTimersByTimeAsync(250);
    assert.match(section.children[1]!.textContent, /見つかりません/u);
    assert.deepEqual(revokeUrl.mock.calls, [['blob:first']]);
    assert.equal(details(), undefined);
    assert.equal(storage(), undefined);
    assert.equal(firstImage.listeners.get('load')?.length, 0);

    edit({kind: 'costume', target: 'Hero', name: 'Second'});
    await vi.advanceTimersByTimeAsync(250);
    assert.equal(image()?.src, 'blob:second');
    assert.equal(image()?.dataset.dsl4AssetTransparency, '');
    const blob = createUrl.mock.calls[1]![0];
    assert.ok(blob instanceof Blob);
    assert.equal(blob.type, 'image/png');
    status = 'cancelled';
    for (const notify of listeners) notify();
    close();
    assert.equal(listeners.size, 0);
    assert.equal(container.children.length, 0);
    assert.deepEqual(revokeUrl.mock.calls, [['blob:first'], ['blob:second']]);
    dispose();
  } finally {
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});

test('reloading the extension on the same VM releases its old registrations and pending hover before replacing them', async () => {
  vi.useFakeTimers();
  try {
    const vm: Record<string, unknown> = {};
    const document = createFakeDocument();
    const anchor = document.createElement('span');
    Object.defineProperty(anchor, 'isConnected', {value: true});
    document.body.appendChild(anchor);
    const registered = new Set<string>();
    let previewCalls = 0;
    let firstHover:
      | ((anchor: HTMLElement | SVGElement, snapshot: Dsl4BlockPreviewSnapshot) => () => void)
      | undefined;
    const options: Parameters<typeof installDsl4BlockIconPreviews>[0] = {
      Scratch: {
        vm,
        gui: {
          blockEditors: {
            apiVersion: 1,
            registerPreview(definition) {
              for (const opcode of definition.opcodes) {
                assert.equal(
                  registered.has(opcode),
                  false,
                  'replacement must remove the previous owner first',
                );
                registered.add(opcode);
              }
              firstHover ??= definition.hover;
              return () => {
                for (const opcode of definition.opcodes) registered.delete(opcode);
              };
            },
          },
        },
      },
      sourceFrontend: dsl4TestSourceFrontend,
      createRuntime: () => ({
        open: async () => {
          previewCalls++;
          throw new Error('unused');
        },
      }),
    };
    const removeFirst = installDsl4BlockIconPreviews(options);
    const count = registered.size;
    firstHover!(anchor as unknown as HTMLElement, snapshot);
    const removeSecond = installDsl4BlockIconPreviews(options);
    assert.equal(registered.size, count);
    removeFirst();
    assert.equal(registered.size, count);
    await vi.advanceTimersByTimeAsync(300);
    assert.equal(previewCalls, 0, 'the old owner must cancel its pending hover');
    removeSecond();
    assert.equal(registered.size, 0);
    assert.equal(Object.hasOwn(vm, '__kamishibaiBlockIconPreviewDispose'), false);
  } finally {
    vi.useRealTimers();
  }
});

test('hover waits for intent, owns an isolated still request and aborts it when the pointer leaves', async () => {
  vi.useFakeTimers();
  try {
    const document = createFakeDocument();
    const anchor = document.createElement('span');
    document.body.appendChild(anchor);
    Object.defineProperty(anchor, 'isConnected', {value: true});
    const definitions: {
      hover?(anchor: HTMLElement | SVGElement, snapshot: Dsl4BlockPreviewSnapshot): () => void;
    }[] = [];
    const opened: Parameters<MountOptions['runtime']['open']>[0][] = [];
    const result = deferred<Preview>();
    const dispose = installDsl4BlockIconPreviews({
      Scratch: {
        vm: {},
        gui: {
          blockEditors: {
            apiVersion: 1,
            registerPreview(definition) {
              definitions.push(definition);
              return () => {};
            },
          },
        },
      },
      sourceFrontend: dsl4TestSourceFrontend,
      createRuntime: () => ({
        open(options) {
          opened.push(options);
          return result.promise;
        },
      }),
    });
    const leave = definitions[0]!.hover!(anchor as unknown as HTMLElement, snapshot);
    await vi.advanceTimersByTimeAsync(219);
    assert.equal(opened.length, 0);
    await vi.advanceTimersByTimeAsync(1);
    assert.equal(opened.length, 1);
    assert.equal(opened[0]!.mode, 'still');
    leave();
    leave();
    assert.equal(opened[0]!.signal.aborted, true);
    const release = vi.fn();
    result.resolve({
      runtime: {},
      canvas: document.createElement('canvas') as unknown as HTMLCanvasElement,
      dispose: release,
    });
    await settle();
    assert.equal(release.mock.calls.length, 1);
    assert.equal(document.body.children.length, 1);
    dispose();
  } finally {
    vi.useRealTimers();
  }
});
