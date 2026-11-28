import {deepFreeze} from './story-document.js';
import {encodeDsl4StoryPathSegment} from './story-path.js';

const historyCommands = new Set([
  'history.previousAction',
  'history.previousScene',
  'history.nextScene',
]);

export interface HistoryDestination {
  visitId: number;
  sceneId: string;
  actionPath: string | null;
  actionIndex: number;
  reason: string;
}

export interface HistoryState {
  mode: 'live' | 'history';
  actionEntries: ReadonlyArray<Readonly<Record<string, unknown>>>;
  sceneVisits: ReadonlyArray<Readonly<Record<string, unknown>>>;
  actionCursor: number;
  sceneVisitCursor: number;
  currentVisitId: number | null;
  nextVisitId: number;
  lastSequence: number;
}

function initialHistoryState(): Readonly<HistoryState> {
  return deepFreeze({
    mode: 'live',
    actionEntries: [],
    sceneVisits: [],
    actionCursor: 0,
    sceneVisitCursor: -1,
    currentVisitId: null,
    nextVisitId: 1,
    lastSequence: -1,
  });
}

function success(
  state: Readonly<HistoryState>,
  changed: boolean,
  destination: HistoryDestination | null = null,
) {
  return deepFreeze({ok: true, state, changed, destination});
}

function failure(
  state: Readonly<HistoryState>,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
) {
  return deepFreeze({
    ok: false,
    state,
    changed: false,
    destination: null,
    diagnostic: {code, message, details},
  });
}

function isHistoryState(value: unknown): value is Readonly<HistoryState> {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Record<string, unknown>;
  return (
    (state.mode === 'live' || state.mode === 'history') &&
    Array.isArray(state.actionEntries) &&
    Array.isArray(state.sceneVisits) &&
    Number.isInteger(state.actionCursor) &&
    Number.isInteger(state.sceneVisitCursor) &&
    Number.isInteger(state.nextVisitId) &&
    Number.isInteger(state.lastSequence)
  );
}

function actionIndexFromPath(actionPath: string): number | null {
  const match = /\/actions\/(0|[1-9][0-9]*)$/.exec(actionPath);
  return match ? Number(match[1]) : null;
}

/**
 * @param {string} value
 * @returns {string}
 */
function visitIndexById(state: Readonly<HistoryState>, visitId: number): number {
  return state.sceneVisits.findIndex((visit) => visit.visitId === visitId);
}

function sceneDestination(
  state: Readonly<HistoryState>,
  visitIndex: number,
  reason: string,
): HistoryDestination {
  const visit = state.sceneVisits[visitIndex];
  // Callers resolve the index against the visit list first, so a miss is a defect in this reducer.
  if (!visit) throw new TypeError(`History scene visit ${visitIndex} does not exist`);
  const firstAction = state.actionEntries[Number(visit.firstActionHistoryIndex)];
  const actionPath =
    firstAction?.visitId === visit.visitId && typeof firstAction?.actionPath === 'string'
      ? firstAction.actionPath
      : null;
  return {
    visitId: Number(visit.visitId),
    sceneId: String(visit.sceneId),
    actionPath,
    actionIndex: 0,
    reason,
  };
}

/**
 * The runtime position a history command starts from. `inProgress` marks a live action that has
 * started but not committed, so it is not yet an action history entry.
 */
export interface HistoryCurrentPosition {
  sceneId: string;
  actionIndex: number;
  actionPath: string | null;
  inProgress: boolean;
}

function readCurrentPosition(value: unknown): HistoryCurrentPosition | null {
  if (typeof value !== 'object' || value === null) return null;
  const current = value as Record<string, unknown>;
  if (
    typeof current.sceneId !== 'string' ||
    !Number.isInteger(current.actionIndex) ||
    Number(current.actionIndex) < 0 ||
    (current.actionPath !== null && typeof current.actionPath !== 'string') ||
    typeof current.inProgress !== 'boolean'
  )
    return null;
  return {
    sceneId: current.sceneId,
    actionIndex: Number(current.actionIndex),
    actionPath: current.actionPath,
    inProgress: current.inProgress,
  };
}

function restartCurrentAction(
  state: Readonly<HistoryState>,
  command: string,
  current: HistoryCurrentPosition,
) {
  const visit = state.sceneVisits[state.sceneVisitCursor];
  if (!visit || visit.sceneId !== current.sceneId) return null;
  // The in-progress action has no entry yet, so the cursor stays after every committed entry and
  // a further previousAction steps to the last committed action.
  const nextState = deepFreeze({
    ...state,
    mode: 'history',
    actionCursor: state.actionEntries.length,
    currentVisitId: Number(visit.visitId),
  }) as Readonly<HistoryState>;
  return success(nextState, true, {
    visitId: Number(visit.visitId),
    sceneId: current.sceneId,
    actionPath: current.actionPath,
    actionIndex: current.actionIndex,
    reason: command,
  });
}

function isAtSceneStart(
  state: Readonly<HistoryState>,
  current: HistoryCurrentPosition | null,
): boolean {
  // Live execution has always started the current scene, so only a history position can be at it.
  if (state.mode !== 'history') return false;
  if (current) return current.actionIndex === 0;
  const visit = state.sceneVisits[state.sceneVisitCursor];
  return !!visit && state.actionCursor === Number(visit.firstActionHistoryIndex);
}

function move(
  state: Readonly<HistoryState>,
  command: string,
  current: HistoryCurrentPosition | null,
) {
  if (command === 'history.previousAction') {
    if (state.mode === 'live' && current?.inProgress) {
      const restarted = restartCurrentAction(state, command, current);
      if (restarted) return restarted;
    }
    if (state.actionCursor <= 0) return success(state, false);
    const nextActionCursor = state.actionCursor - 1;
    const entry = state.actionEntries[nextActionCursor];
    const actionIndex = entry ? actionIndexFromPath(String(entry.actionPath)) : null;
    const nextSceneVisitCursor = entry ? visitIndexById(state, Number(entry.visitId)) : -1;
    if (!entry || actionIndex === null || nextSceneVisitCursor < 0) {
      return failure(
        state,
        'K4-HISTORY-STATE-001',
        'Action history entry does not identify a valid scene visit and action',
      );
    }
    const nextState = deepFreeze({
      ...state,
      mode: 'history',
      actionCursor: nextActionCursor,
      sceneVisitCursor: nextSceneVisitCursor,
      currentVisitId: Number(entry.visitId),
    }) as Readonly<HistoryState>;
    return success(nextState, true, {
      visitId: Number(entry.visitId),
      sceneId: String(entry.sceneId),
      actionPath: String(entry.actionPath),
      actionIndex,
      reason: command,
    });
  }

  const offset =
    command === 'history.previousScene' ? (isAtSceneStart(state, current) ? -1 : 0) : 1;
  const nextSceneVisitCursor = state.sceneVisitCursor + offset;
  if (nextSceneVisitCursor < 0 || nextSceneVisitCursor >= state.sceneVisits.length) {
    return success(state, false);
  }
  const visit = state.sceneVisits[nextSceneVisitCursor];
  // The bounds check above has already rejected a cursor outside the visit list.
  if (!visit) return success(state, false);
  const nextState = deepFreeze({
    ...state,
    mode: 'history',
    actionCursor: Number(visit.firstActionHistoryIndex),
    sceneVisitCursor: nextSceneVisitCursor,
    currentVisitId: Number(visit.visitId),
  }) as Readonly<HistoryState>;
  return success(nextState, true, sceneDestination(nextState, nextSceneVisitCursor, command));
}

/**
 * Create a pure chronological navigation-history reducer.
 * Product defaults for the mandatory finite limits belong to the runtime integration layer.
 */
export function createDsl4HistoryReducer({
  maxActionEntries,
  maxSceneVisits,
}: {
  maxActionEntries: number;
  maxSceneVisits: number;
}) {
  if (!Number.isInteger(maxActionEntries) || maxActionEntries < 1) {
    throw new TypeError('maxActionEntries must be a positive integer');
  }
  if (!Number.isInteger(maxSceneVisits) || maxSceneVisits < 1) {
    throw new TypeError('maxSceneVisits must be a positive integer');
  }

  function reduce(state: Readonly<HistoryState>, event: Readonly<Record<string, unknown>>) {
    if (!isHistoryState(state) || !Object.isFrozen(state)) {
      throw new TypeError('History reducer requires a frozen HistoryState');
    }
    if (typeof event !== 'object' || event === null || typeof event.type !== 'string') {
      return failure(state, 'K4-HISTORY-EVENT-001', 'History event must have a type');
    }
    if (event.type === 'reset') return success(initialHistoryState(), true);
    if (event.type === 'resume') {
      if (state.mode === 'live') return success(state, false);
      const sceneVisits = state.sceneVisits.slice(0, state.sceneVisitCursor + 1);
      const actionEntries = state.actionEntries.slice(0, state.actionCursor);
      const currentVisit = sceneVisits.at(-1);
      return success(
        deepFreeze({
          ...state,
          mode: 'live',
          actionEntries,
          sceneVisits,
          actionCursor: actionEntries.length,
          sceneVisitCursor: sceneVisits.length - 1,
          currentVisitId: currentVisit ? Number(currentVisit.visitId) : null,
        }),
        true,
      );
    }
    if (historyCommands.has(event.type))
      return move(state, event.type, readCurrentPosition(event.current));
    if (event.type !== 'scene.enter' && event.type !== 'action.commit') {
      return failure(state, 'K4-HISTORY-EVENT-001', `Unsupported history event: ${event.type}`);
    }
    if (state.mode !== 'live') {
      return failure(
        state,
        'K4-HISTORY-MODE-001',
        'History must resume before recording new execution events',
      );
    }
    if (!Number.isInteger(event.sequence) || Number(event.sequence) <= state.lastSequence) {
      return failure(
        state,
        'K4-HISTORY-SEQUENCE-001',
        'History event sequence must be a monotonically increasing integer',
      );
    }

    if (event.type === 'scene.enter') {
      if (
        typeof event.sceneId !== 'string' ||
        !event.sceneId ||
        typeof event.storyPath !== 'string' ||
        event.storyPath !== `/scenes/${encodeDsl4StoryPathSegment(event.sceneId)}`
      ) {
        return failure(state, 'K4-HISTORY-EVENT-001', 'Scene entry requires sceneId and storyPath');
      }
      if (state.sceneVisits.length >= maxSceneVisits) {
        return failure(state, 'K4-HISTORY-LIMIT-001', 'Scene visit history limit reached', {
          kind: 'sceneVisits',
          limit: maxSceneVisits,
        });
      }
      const visit = deepFreeze({
        visitId: state.nextVisitId,
        sceneId: event.sceneId,
        storyPath: event.storyPath,
        firstActionHistoryIndex: state.actionEntries.length,
        enteredSequence: event.sequence,
      });
      const sceneVisits = [...state.sceneVisits, visit];
      return success(
        deepFreeze({
          ...state,
          sceneVisits,
          actionCursor: state.actionEntries.length,
          sceneVisitCursor: sceneVisits.length - 1,
          currentVisitId: state.nextVisitId,
          nextVisitId: state.nextVisitId + 1,
          lastSequence: Number(event.sequence),
        }),
        true,
      );
    }

    if (
      state.currentVisitId === null ||
      typeof event.sceneId !== 'string' ||
      typeof event.actionPath !== 'string' ||
      !event.actionPath.startsWith(
        `/scenes/${encodeDsl4StoryPathSegment(String(event.sceneId))}/actions/`,
      ) ||
      actionIndexFromPath(event.actionPath) === null
    ) {
      return failure(
        state,
        'K4-HISTORY-EVENT-001',
        'Action commit requires an active visit, sceneId, and action StoryPath',
      );
    }
    const currentVisit = state.sceneVisits[state.sceneVisitCursor];
    if (!currentVisit || currentVisit.sceneId !== event.sceneId) {
      return failure(
        state,
        'K4-HISTORY-STATE-001',
        'Action commit scene does not match the active scene visit',
      );
    }
    if (state.actionEntries.length >= maxActionEntries) {
      return failure(state, 'K4-HISTORY-LIMIT-001', 'Action history limit reached', {
        kind: 'actionEntries',
        limit: maxActionEntries,
      });
    }
    const entry = deepFreeze({
      visitId: state.currentVisitId,
      sceneId: event.sceneId,
      actionPath: event.actionPath,
      committedSequence: event.sequence,
    });
    const actionEntries = [...state.actionEntries, entry];
    return success(
      deepFreeze({
        ...state,
        actionEntries,
        actionCursor: actionEntries.length,
        lastSequence: Number(event.sequence),
      }),
      true,
    );
  }

  return Object.freeze({
    restore(input: unknown) {
      if (!isHistoryState(input)) throw new TypeError('Invalid saved HistoryState');
      const value = input;
      function canonical(item: unknown): string {
        if (Array.isArray(item)) return '[' + item.map(canonical).join(',') + ']';
        if (item && typeof item === 'object')
          return (
            '{' +
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, value]) => JSON.stringify(key) + ':' + canonical(value))
              .join(',') +
            '}'
          );
        return JSON.stringify(item);
      }
      const expected = Object.keys(initialHistoryState()).sort();
      if (canonical(Object.keys(value).sort()) !== canonical(expected))
        throw new TypeError('Unknown history state keys');
      if (
        value.actionEntries.length > maxActionEntries ||
        value.sceneVisits.length > maxSceneVisits
      )
        throw new TypeError('Saved history exceeds limits');
      let rebuilt = initialHistoryState();
      const events = [
        ...value.sceneVisits.map((visit) => ({
          sequence: visit.enteredSequence,
          type: 'scene.enter',
          sceneId: visit.sceneId,
          storyPath: visit.storyPath,
          visitId: visit.visitId,
        })),
        ...value.actionEntries.map((entry) => ({
          sequence: entry.committedSequence,
          type: 'action.commit',
          sceneId: entry.sceneId,
          actionPath: entry.actionPath,
          visitId: entry.visitId,
        })),
      ].sort((a, b) => Number(a.sequence) - Number(b.sequence));
      for (const event of events) {
        if (!Number.isSafeInteger(event.sequence) || !Number.isSafeInteger(event.visitId))
          throw new TypeError('Invalid saved history sequence or visit');
        if (event.type === 'scene.enter') {
          if (Number(event.visitId) < rebuilt.nextVisitId)
            throw new TypeError('Saved visit IDs are not increasing');
          rebuilt = deepFreeze({...rebuilt, nextVisitId: Number(event.visitId)});
        } else if (event.visitId !== rebuilt.currentVisitId)
          throw new TypeError('Saved action visit is inconsistent');
        const result = reduce(rebuilt, event);
        if (!result.ok) throw new TypeError('Saved history violates reducer invariants');
        rebuilt = result.state;
      }
      for (const key of ['actionEntries', 'sceneVisits'] as const)
        if (canonical(value[key]) !== canonical(rebuilt[key]))
          throw new TypeError(`Saved history ${key} is inconsistent`);
      if (
        !Number.isSafeInteger(value.nextVisitId) ||
        value.nextVisitId < rebuilt.nextVisitId ||
        !Number.isSafeInteger(value.lastSequence) ||
        value.lastSequence < rebuilt.lastSequence
      )
        throw new TypeError('Saved history counters are inconsistent');
      if (value.mode === 'live') {
        for (const key of ['actionCursor', 'sceneVisitCursor', 'currentVisitId'] as const)
          if (value[key] !== rebuilt[key])
            throw new TypeError('Saved live history cursor is inconsistent');
      } else {
        const visit = value.sceneVisits[value.sceneVisitCursor];
        const nextVisit = value.sceneVisits[value.sceneVisitCursor + 1];
        if (
          !visit ||
          value.currentVisitId !== visit.visitId ||
          value.actionCursor < Number(visit.firstActionHistoryIndex) ||
          value.actionCursor >
            Number(nextVisit?.firstActionHistoryIndex ?? value.actionEntries.length)
        )
          throw new TypeError('Saved history cursor is inconsistent');
      }
      return deepFreeze(structuredClone(value));
    },
    initialState: initialHistoryState,
    reduce,
  });
}
