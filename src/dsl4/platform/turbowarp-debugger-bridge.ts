/**
 * Connects the story's `debugger` action to the TurboWarp debugger of the editor.
 *
 * Story actions run as promises in the runtime controller, not as Scratch threads, so pausing the
 * Scratch VM alone would not stop the story. The debug execution coordinator holds the story
 * before the `debugger` action, and this bridge pauses the project with the debugger add-on at the
 * same moment: the debugger window opens, the clock stops, and the editor's variable pane shows the
 * values of that moment. Resuming in the debugger resumes the story.
 *
 * Only the editor's authoring runtime creates a bridge. Without the debugger add-on (a packaged
 * player, or the add-on turned off) nothing can resume a pause, so the bridge lets the story go on
 * at once, as the distribution runtime does.
 */

/** The add-on blocks the TurboWarp debugger registers; `sa-pause` is the one meant for extensions. */
export const turboWarpDebuggerPauseBlock = 'sa-pause';
export const turboWarpDebuggerLogBlock = '​​log​​ %s';

type AddonBlock = Readonly<{callback?: (args: object, util: object) => unknown}>;

export type Dsl4TurboWarpDebuggerRuntime = {
  getAddonBlock?(procedureCode: string): AddonBlock | null | undefined;
  ioDevices?: {clock?: {_paused?: boolean}};
  on(event: string, listener: () => void): unknown;
  removeListener(event: string, listener: () => void): unknown;
};

type DebugState = Readonly<Record<string, unknown>>;

export type Dsl4TurboWarpDebuggerCoordinator = {
  getState(): DebugState;
  subscribe(subscriber: (state: DebugState) => unknown): () => unknown;
  resume(): unknown;
};

const messages = {
  en: {
    paused: (scene: string, action: number) =>
      `Kamishibai: paused before action ${action} of scene "${scene}". Resume with the debugger.`,
    variables: 'Story variables',
    none: '(none)',
  },
  ja: {
    paused: (scene: string, action: number) =>
      `紙芝居：場面「${scene}」の ${action} 番目のアクションの直前で一時停止しました。デバッガーで再開します。`,
    variables: '台本の変数',
    none: '（なし）',
  },
};

function addonBlock(runtime: Dsl4TurboWarpDebuggerRuntime, procedureCode: string) {
  try {
    const block = runtime.getAddonBlock?.(procedureCode);
    return typeof block?.callback === 'function' ? block : null;
  } catch {
    return null;
  }
}

const isPaused = (runtime: Dsl4TurboWarpDebuggerRuntime) =>
  runtime.ioDevices?.clock?._paused === true;

/** The story variables as one line for the debugger's Logs tab. */
export function describeDsl4StoryVariables(
  variables: Readonly<Record<string, unknown>> | null | undefined,
  locale: 'en' | 'ja' = 'en',
) {
  const text = messages[locale];
  const entries = Object.entries(variables ?? {});
  const body = entries.length
    ? entries.map(([name, value]) => `${name} = ${JSON.stringify(value)}`).join(', ')
    : text.none;
  return `${text.variables}: ${body}`;
}

export function createDsl4TurboWarpDebuggerBridge({
  runtime,
  coordinator,
  getStoryVariables,
  locale = 'en',
}: {
  runtime: Dsl4TurboWarpDebuggerRuntime;
  coordinator: Dsl4TurboWarpDebuggerCoordinator;
  getStoryVariables: () => Readonly<Record<string, unknown>> | null | undefined;
  locale?: 'en' | 'ja';
}) {
  let disposed = false;
  // The pause this bridge handed to the debugger, by the coordinator revision that started it.
  let bridgedRevision: unknown = null;

  const log = (content: string) => {
    try {
      addonBlock(runtime, turboWarpDebuggerLogBlock)?.callback?.({content}, {thread: null});
    } catch {
      // The log is a convenience; a failing add-on must not keep the story paused.
    }
  };

  const release = () => {
    bridgedRevision = null;
    if (coordinator.getState().paused === true) coordinator.resume();
  };

  const onPaused = (state: DebugState) => {
    if (disposed || state.paused !== true || bridgedRevision === state.revision) return;
    const pause = addonBlock(runtime, turboWarpDebuggerPauseBlock);
    if (!pause) {
      // Nothing could resume this pause: behave as the distribution runtime does.
      release();
      return;
    }
    bridgedRevision = state.revision;
    const scene = typeof state.sceneId === 'string' ? state.sceneId : '';
    const action = typeof state.actionIndex === 'number' ? state.actionIndex + 1 : 0;
    log(messages[locale].paused(scene, action));
    let variables: Readonly<Record<string, unknown>> | null | undefined = null;
    try {
      variables = getStoryVariables();
    } catch {
      variables = null;
    }
    log(describeDsl4StoryVariables(variables, locale));
    try {
      pause.callback?.({}, {thread: null});
    } catch {
      release();
      return;
    }
    // The debugger refuses to pause a player-only view; then the story must not wait for it.
    if (!isPaused(runtime)) release();
  };

  const onUnpaused = () => {
    if (disposed || bridgedRevision === null) return;
    release();
  };

  const unsubscribe = coordinator.subscribe(onPaused);
  runtime.on('RUNTIME_UNPAUSED', onUnpaused);

  return Object.freeze({
    dispose() {
      if (disposed) return;
      disposed = true;
      bridgedRevision = null;
      unsubscribe();
      runtime.removeListener('RUNTIME_UNPAUSED', onUnpaused);
    },
  });
}
