// SPDX-License-Identifier: MPL-2.0

/**
 * The navigation session as its hosts drive it.
 *
 * `createDsl4NavigationSession` returns more than this; the type lists what the TurboWarp runtime
 * host, the preview session, and the startup helper actually call, so those call sites stop going
 * through an index signature that makes every member possibly undefined.
 *
 * The signatures restate the session's own rather than deriving them, because the hosts must be
 * able to build a session-shaped double without importing `navigation-session.js` -- the preview
 * session does exactly that. Results stay `unknown` where the caller only forwards or awaits them;
 * widening those to the concrete record types would tie every host to the controller's snapshot
 * shape for no gain.
 */
import type {Dsl4PlaybackFeatures} from './playback-features.js';

export interface Dsl4NavigationSessionSurface {
  captureSave?(): Promise<unknown>;
  exportSave?(): Promise<Blob>;
  restore?(save: unknown): Promise<unknown>;
  retrySaveCleanup?(): Promise<void>;
  start(options?: {
    sceneId?: string;
    actionIndex?: number;
    variables?: Readonly<Record<string, string | number | boolean>>;
  }): Promise<Readonly<Record<string, unknown>>>;
  stop(reason?: string): unknown;
  /**
   * The navigation session ignores the argument; the preview session's own implementation records
   * it, and every host passes one.
   */
  dispose(reason?: string): unknown;
  /** A child may need cleanup after an earlier disposal succeeded. */
  hasPendingCleanup?(): boolean;
  getState(): Readonly<Record<string, unknown>>;
  getRunPromise(): Promise<unknown> | null;
  attach(target: unknown): unknown;
  detach(): unknown;
  attachStagePointer(target: unknown): unknown;
  detachStagePointer(): unknown;
  dispatchCommand(command: string): unknown;
  handleKeyDown(event: Readonly<Record<string, unknown>>): boolean;
  handlePointerUp(event: Readonly<Record<string, unknown>>): unknown;
  whenInputIdle(): Promise<unknown>;
  quiesce(request: {candidateId: number}): Promise<unknown>;
  resumeQuiesce(candidateId: number): unknown;
  invokeAction(action: Readonly<Record<string, unknown>>): Promise<unknown>;
  queueVariableWrite(request: unknown): unknown;
  rejectActionInvocation(error: unknown): Promise<unknown>;
  /** What the playback settings can offer for this story; preview doubles may omit it. */
  getPlaybackFeatures?(): Dsl4PlaybackFeatures;
  /** Probed before use: only sessions with the debugger surface expose it. */
  getRuntimeVariableSnapshot?(): unknown;
}
