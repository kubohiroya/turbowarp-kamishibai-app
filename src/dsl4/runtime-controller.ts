import {normalizeDsl4ContentRuns} from './content-run.js';
import {evaluateDsl4TextInterpolation, isDsl4TextInterpolation} from './text-interpolation.js';
import {
  dsl4FirstPresentationEffectStoryPath,
  dsl4PresentationEffectsFlagError,
  dsl4PresentationEffectsFlagMessage,
} from './presentation-effects-gate.js';
import type {Dsl4RuntimePort} from './runtime-port.js';
import {createRuntimeFailureContext} from './runtime-error-context.js';
import {
  createDsl4AssetPreloadCoordinator,
  type Dsl4AssetPreloadLifecycle,
} from './asset-preload-coordinator.js';
import {createDsl4AssetDependencyIndex} from './asset-dependency-index.js';
import {bubbleStyleNameForStyleIds, composeBubbleStyles} from './bubble-style.js';
import {deepFreeze, sourceOriginForStoryPath} from './story-document.js';
import {mapDsl4RuntimeExpressionError} from './expression-diagnostics.js';
import {encodeDsl4StoryPathSegment} from './story-path.js';
import {
  createDsl4RuntimeActionDispatcher,
  type Dsl4ActionDispatchResult,
} from './runtime-action-dispatcher.js';
import {
  createDsl4QuiesceToken,
  createDsl4RuntimeQuiesceError,
  defaultScheduleQuiesceTimeout,
  dsl4RuntimeQuiesceDefaults,
  retagDsl4QuiesceToken,
} from './runtime-quiesce.js';
import {
  dsl4CutTransition,
  dsl4StoryUsesCrossfade,
  resolveDsl4TransitionDefaults,
} from './transition-spec.js';

export {dsl4RuntimeQuiesceDefaults} from './runtime-quiesce.js';

const defaultPoseSequenceRecognition = Object.freeze({
  confidenceThreshold: 0.5,
  fullConfidenceHoldSeconds: 1,
  idleChargePerSecond: 0,
});
const defaultPoseSelectionRecognition = Object.freeze({
  accumulationPerSecond: 1,
  decayPerSecond: 0.9,
  scoreThreshold: 0,
});
const posePreviewMirroringModes = new Set(['mirrored', 'unmirrored']);
const speechPresentationArgumentNames = Object.freeze([
  'characterIntervalSeconds',
  'characterSound',
  'noSoundCharacters',
  'restCharacters',
  'restCharacterIntervalSeconds',
]);
const advancedBubbleStyleNames = Object.freeze([
  'reveal',
  'audio',
  'showAnimation',
  'hideAnimation',
  'visibleAnimations',
]);
function deferred() {
  let resolve: (value: unknown) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, resolve, reject};
}

export type RuntimeStatus = 'idle' | 'running' | 'paused' | 'failed' | 'finished' | 'stopped';

export interface RuntimeEvent {
  sequence: number;
  type: string;
  sceneId: string | null;
  storyPath: string;
  actionPath: string | null;
  generation: number;
  details: Readonly<Record<string, unknown>>;
}

export interface ActionContext {
  signal: AbortSignal;
  actionSignal?: AbortSignal;
  generation: number;
  sceneId: string;
  actionIndex: number;
  actionPath: string;
  variables: Readonly<Record<string, string | number | boolean>>;
  structuredData?: Readonly<{actionScopeRef: string; actionViewRef: string}>;
  getVariable: (name: string) => string | number | boolean | undefined;
  setVariable: (name: string, value: string | number | boolean) => boolean;
  createAdvanceWait: () => Readonly<{
    promise: Promise<Readonly<Record<string, unknown>>>;
    cancel: () => void;
  }>;
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      cloneValue(child),
    ]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'DSL 4.0 runtime operation failed';
}

/**
 * @param {string} value
 * @returns {string}
 */
function runtimeDiagnostic(
  storyDocument: Readonly<Record<string, unknown>>,
  storyPath: string | null,
  sourcePath: string,
  code: string,
  message: string,
): Readonly<Record<string, unknown>> {
  const origin = sourceOriginForStoryPath(storyDocument, storyPath ?? '/');
  return deepFreeze({
    version: 1,
    code,
    severity: 'error',
    message,
    sourceId: origin.sourceId,
    range: origin.range,
    ...(storyPath ? {storyPath} : {}),
    path: sourcePath,
    related: [],
  });
}

/** The structured-data lifecycle the controller drives around each story, scene, and action. */
interface StructuredDataIntegration {
  beginStory(): unknown;
  dispose?(): unknown;
  endStory(reason: string): unknown;
  enterScene(sceneId: string, options: {actionIndex: number}): unknown;
  beginNextAction(): unknown;
  releaseAction(reason: string): unknown;
  currentActionResources(): unknown;
}

interface DebugExecution {
  beforeAction(
    action: Readonly<{
      command: string;
      sceneId: string;
      actionIndex: number;
      actionPath: string;
      signal: AbortSignal;
    }>,
  ): unknown;
  getState(): Readonly<{paused?: boolean}>;
}

interface SceneCrossfadeOperation {
  start(): unknown;
  finish(reason: string): unknown;
}

interface QuiesceRequest {
  candidateId: number;
  mode: 'finish-only' | 'cancel-replay-safe';
  phase: 'quiescing' | 'token' | 'failed';
  token: Readonly<Record<string, unknown>> | null;
  completion: ReturnType<typeof deferred>;
  resumeRequested: boolean;
  cancelTimeout: () => void;
}

export function createDsl4RuntimeController({
  storyDocument,
  port,
  assetLifecycle,
  evaluateCondition,
  onEvent,
  structuredDataIntegration,
  createRestoreStructuredDataIntegration,
  debugExecution,
  skipOverride,
  posePreviewMirroringEnabled = false,
  cameraPreviewControlsEnabled = false,
  poseNavigationPolicyEnabled = false,
  speechAdvanceTypewriterEnabled = false,
  turboWarpBubbleAdvancedPresentationEnabled = false,
  broadcastMessageAndWaitEnabled = false,
  crossfadeTransitionsEnabled = false,
  presentationEffectsEnabled = false,
  narrativeControlEnabled = false,
  quiesceTimeoutMs = dsl4RuntimeQuiesceDefaults.quiesceTimeoutMs,
  scheduleQuiesceTimeout = defaultScheduleQuiesceTimeout,
}: {
  storyDocument: Readonly<Record<string, unknown>>;
  port: Dsl4RuntimePort;
  assetLifecycle?: Dsl4AssetPreloadLifecycle;
  evaluateCondition?: (
    expression: string,
    variables: Readonly<Record<string, string | number | boolean>>,
    context: ActionContext,
  ) => boolean | Promise<boolean>;
  onEvent?: (event: RuntimeEvent) => void;
  structuredDataIntegration?: StructuredDataIntegration;
  createRestoreStructuredDataIntegration?: () => StructuredDataIntegration;
  debugExecution?: DebugExecution;
  /**
   * The person's skip choice from the playback settings, read at each decision. `null` follows
   * the story's `recognition.navigation.allowSkip`.
   */
  skipOverride?: () => boolean | null;
  posePreviewMirroringEnabled?: boolean;
  cameraPreviewControlsEnabled?: boolean;
  poseNavigationPolicyEnabled?: boolean;
  speechAdvanceTypewriterEnabled?: boolean;
  turboWarpBubbleAdvancedPresentationEnabled?: boolean;
  broadcastMessageAndWaitEnabled?: boolean;
  crossfadeTransitionsEnabled?: boolean;
  presentationEffectsEnabled?: boolean;
  narrativeControlEnabled?: boolean;
  quiesceTimeoutMs?: number;
  scheduleQuiesceTimeout?: (callback: () => void, milliseconds: number) => () => void;
}) {
  if (storyDocument.kind !== 'StoryDocument' || storyDocument.version !== '4.0') {
    throw new TypeError('DSL 4.0 runtime requires a StoryDocument version 4.0');
  }
  if (typeof narrativeControlEnabled !== 'boolean')
    throw new TypeError('narrativeControlEnabled must be boolean');
  if (
    !narrativeControlEnabled &&
    (storyDocument.metadata as Record<string, unknown>)?.narrativeControl === true
  ) {
    const error = new TypeError('DSL 4.0 narrative control requires dsl4NarrativeControl');
    Object.defineProperty(error, 'code', {value: 'K4-NARRATIVE-FLAG-001'});
    throw error;
  }
  const narrativeDecisions = new Map<string, boolean>();
  if (
    debugExecution !== undefined &&
    (!isRecord(debugExecution) ||
      typeof debugExecution.beforeAction !== 'function' ||
      typeof debugExecution.getState !== 'function')
  ) {
    throw new TypeError('debugExecution must provide beforeAction and getState');
  }
  if (skipOverride !== undefined && typeof skipOverride !== 'function') {
    throw new TypeError('skipOverride must be a function');
  }
  if (typeof posePreviewMirroringEnabled !== 'boolean') {
    throw new TypeError('posePreviewMirroringEnabled must be boolean');
  }
  if (typeof cameraPreviewControlsEnabled !== 'boolean') {
    throw new TypeError('cameraPreviewControlsEnabled must be boolean');
  }
  if (
    posePreviewMirroringEnabled &&
    typeof (port as Record<string, unknown>).setPosePreviewMirroring !== 'function'
  ) {
    throw new TypeError(
      'setPosePreviewMirroring runtime port method is required when pose preview mirroring is enabled',
    );
  }
  if (structuredDataIntegration !== undefined) {
    if (!isRecord(structuredDataIntegration)) {
      throw new TypeError('structuredDataIntegration must be an object');
    }
    for (const method of [
      'beginStory',
      'enterScene',
      'beginNextAction',
      'currentActionResources',
      'releaseAction',
      'endStory',
      'dispose',
    ]) {
      if (typeof structuredDataIntegration[method] !== 'function') {
        throw new TypeError(`structuredDataIntegration.${method} is required`);
      }
    }
  }
  if (typeof poseNavigationPolicyEnabled !== 'boolean') {
    throw new TypeError('poseNavigationPolicyEnabled must be boolean');
  }
  if (typeof speechAdvanceTypewriterEnabled !== 'boolean') {
    throw new TypeError('speechAdvanceTypewriterEnabled must be boolean');
  }
  if (typeof turboWarpBubbleAdvancedPresentationEnabled !== 'boolean') {
    throw new TypeError('turboWarpBubbleAdvancedPresentationEnabled must be boolean');
  }
  if (turboWarpBubbleAdvancedPresentationEnabled && !speechAdvanceTypewriterEnabled) {
    throw new TypeError(
      'turboWarpBubbleAdvancedPresentationEnabled requires speechAdvanceTypewriterEnabled',
    );
  }
  if (typeof broadcastMessageAndWaitEnabled !== 'boolean') {
    throw new TypeError('broadcastMessageAndWaitEnabled must be boolean');
  }
  if (typeof presentationEffectsEnabled !== 'boolean') {
    throw new TypeError('presentationEffectsEnabled must be boolean');
  }
  if (!presentationEffectsEnabled && dsl4FirstPresentationEffectStoryPath(storyDocument) !== null) {
    const error = new TypeError(dsl4PresentationEffectsFlagMessage);
    Object.defineProperty(error, 'code', {value: dsl4PresentationEffectsFlagError});
    throw error;
  }
  if (typeof crossfadeTransitionsEnabled !== 'boolean') {
    throw new TypeError('crossfadeTransitionsEnabled must be boolean');
  }
  if (!crossfadeTransitionsEnabled && dsl4StoryUsesCrossfade(storyDocument)) {
    const error = new TypeError(
      'dsl4CrossfadeTransitions must be enabled for crossfade transitions',
    );
    Object.defineProperty(error, 'code', {value: 'K4-TRANSITION-FLAG-001'});
    throw error;
  }
  if (
    !Number.isSafeInteger(quiesceTimeoutMs) ||
    quiesceTimeoutMs < dsl4RuntimeQuiesceDefaults.minimumQuiesceTimeoutMs ||
    quiesceTimeoutMs > dsl4RuntimeQuiesceDefaults.maximumQuiesceTimeoutMs
  ) {
    throw new TypeError('quiesceTimeoutMs is outside the supported range');
  }
  if (typeof scheduleQuiesceTimeout !== 'function') {
    throw new TypeError('scheduleQuiesceTimeout must be a function');
  }
  if (
    port.finishPresentationTransitions !== undefined &&
    typeof port.finishPresentationTransitions !== 'function'
  ) {
    throw new TypeError('finishPresentationTransitions runtime port method must be a function');
  }
  if (port.hideSceneActors !== undefined && typeof port.hideSceneActors !== 'function') {
    throw new TypeError('hideSceneActors runtime port method must be a function');
  }
  if (port.createSceneCrossfade !== undefined && typeof port.createSceneCrossfade !== 'function') {
    throw new TypeError('createSceneCrossfade runtime port method must be a function');
  }

  const scenes = storyDocument.scenes as ReadonlyArray<Readonly<Record<string, unknown>>>;
  const transitionDefaults = resolveDsl4TransitionDefaults(storyDocument);
  let pendingSceneCrossfade: {
    sceneId: string;
    prefixEnd: number;
    operation: Readonly<SceneCrossfadeOperation>;
  } | null = null;
  if (
    !broadcastMessageAndWaitEnabled &&
    scenes.some((scene) =>
      ((scene.actions ?? []) as ReadonlyArray<Readonly<Record<string, unknown>>>).some(
        (action) => action.command === 'broadcastMessageAndWait',
      ),
    )
  ) {
    const error = new TypeError(
      'dsl4BroadcastMessageAndWait must be enabled for broadcastMessageAndWait actions',
    );
    Object.defineProperty(error, 'code', {value: 'K4-RUNTIME-BROADCAST-FLAG-001'});
    throw error;
  }
  const storyActorsValue = storyDocument.actors ?? {};
  if (!isRecord(storyActorsValue)) {
    throw new TypeError('DSL 4.0 StoryDocument actors must be an object');
  }
  const storyActorIds = Object.freeze(Object.keys(storyActorsValue));
  const bubbleStylesValue = storyDocument.bubbleStyles ?? {};
  if (!isRecord(bubbleStylesValue)) {
    throw new TypeError('DSL 4.0 StoryDocument bubbleStyles must be an object');
  }
  const bubbleStyles = bubbleStylesValue as Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >;
  const bubbleClosePoliciesValue = storyDocument.bubbleClosePolicies ?? {};
  if (!isRecord(bubbleClosePoliciesValue)) {
    throw new TypeError('DSL 4.0 StoryDocument bubbleClosePolicies must be an object');
  }
  const bubbleClosePolicies = bubbleClosePoliciesValue as Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >;
  if (
    !turboWarpBubbleAdvancedPresentationEnabled &&
    Object.values(bubbleStyles).some((style) =>
      advancedBubbleStyleNames.some((field) => Object.hasOwn(style, field)),
    )
  ) {
    throw new TypeError(
      'dsl4TurboWarpBubbleAdvancedPresentation must be enabled for reveal, audio, or Bubble motion',
    );
  }
  if (!speechAdvanceTypewriterEnabled) {
    const extendedSpeechAction = scenes
      .flatMap((scene) => (scene.actions ?? []) as ReadonlyArray<Readonly<Record<string, unknown>>>)
      .find((action) => {
        if (action.command === 'think') return true;
        if (action.command !== 'say') return false;
        const args = (action.args ?? {}) as Readonly<Record<string, unknown>>;
        return [
          'closePolicy',
          'waitFor',
          'startSound',
          'styles',
          ...speechPresentationArgumentNames,
        ].some((key) => Object.hasOwn(args, key));
      });
    if (extendedSpeechAction) {
      throw new TypeError(
        'dsl4SpeechAdvanceTypewriter must be enabled for think, waitFor, or extended speech',
      );
    }
  }
  const sceneIndex = new Map(scenes.map((scene, index) => [scene.id, index]));
  const branches = (storyDocument.branches ?? {}) as Record<
    string,
    ReadonlyArray<Readonly<Record<string, string>>>
  >;
  const initialVariables = {startSceneIndex: 1, ...(storyDocument.variables ?? {})} as Record<
    string,
    string | number | boolean
  >;
  const recognition = (storyDocument.recognition ?? {}) as Readonly<Record<string, unknown>>;
  const poseSequenceRecognition = deepFreeze({
    ...defaultPoseSequenceRecognition,
    ...((recognition.sequence ?? {}) as Readonly<Record<string, number>>),
    idleSound: typeof recognition.idleSound === 'string' ? recognition.idleSound : null,
    chargeSound: typeof recognition.chargeSound === 'string' ? recognition.chargeSound : null,
    feedback: {
      mode:
        typeof (recognition.feedback as Readonly<Record<string, unknown>>)?.mode === 'string'
          ? (recognition.feedback as Readonly<Record<string, string>>).mode
          : 'scratchMirror',
    },
    navigation: {
      allowSkip:
        typeof (recognition.navigation as Readonly<Record<string, unknown>>)?.allowSkip ===
        'boolean'
          ? (recognition.navigation as Readonly<Record<string, boolean>>).allowSkip
          : false,
    },
  });
  /** The story's skip policy, unless the person overrode it in the playback settings. */
  function allowSkip() {
    if (skipOverride === undefined) return poseSequenceRecognition.navigation.allowSkip;
    let override: unknown = null;
    try {
      override = skipOverride();
    } catch {
      // A failing settings reader cannot change what the story itself allows.
    }
    return typeof override === 'boolean' ? override : poseSequenceRecognition.navigation.allowSkip;
  }
  const poseSelectionRecognition = deepFreeze({
    ...defaultPoseSelectionRecognition,
    ...((recognition.selection ?? {}) as Readonly<Record<string, number>>),
  });
  let variables: Record<string, string | number | boolean> = cloneValue(initialVariables) as Record<
    string,
    string | number | boolean
  >;
  let status: RuntimeStatus = 'idle';
  let currentSceneIndex = -1;
  let currentActionIndex = -1;
  let generation = 0;
  let sequence = 0;
  let runId = 0;
  let actionAbortController: AbortController | null = null;
  let activeActionContext: ActionContext | null = null;
  let nestedActionTransition: Dsl4ActionDispatchResult = null;
  let nestedNavigationCommand: string | null = null;
  const activeNestedInvocations: Set<Promise<Readonly<Record<string, unknown>>>> = new Set();
  let pendingVariableWrites: Array<
    Readonly<{
      generation: number;
      operation: 'set' | 'change' | 'toggle';
      name: string;
      value?: string | number | boolean;
    }>
  > = [];
  let runPromise: Promise<Readonly<Record<string, unknown>>> | null = null;
  let poseAdvanceLock: {
    generation: number;
    stepIndex: number;
    operation: Promise<Readonly<Record<string, unknown>>>;
  } | null = null;
  let activePoseWait: {
    generation: number;
    stepIndex: number;
    controller: AbortController;
    completion: ReturnType<typeof deferred>;
    cleanup: () => void;
    waitingForRecognition: boolean;
    skipRequested: boolean;
    skipReason: string | null;
  } | null = null;
  type RehearsalSkipLock = {
    command: 'rehearsal.skipAction' | 'rehearsal.skipScene';
    sceneIndex: number;
    actionIndex: number;
    completion: ReturnType<typeof deferred>;
    operation: Promise<Readonly<Record<string, unknown>>>;
  };
  let rehearsalSkipLock: RehearsalSkipLock | null = null;
  let rehearsalSceneSkip: {sceneIndex: number; reason: 'rehearsal.skipScene'} | null = null;
  let activeAdvanceWait: {
    generation: number;
    armed: boolean;
    completion: ReturnType<typeof deferred>;
    cleanup: () => void;
  } | null = null;
  let quiesceRequest: QuiesceRequest | null = null;
  let failureDiagnostic: Readonly<Record<string, unknown>> | null = null;
  let failureContext: Readonly<Record<string, unknown>> | null = null;
  const trace: RuntimeEvent[] = [];
  const assetCoordinator = assetLifecycle
    ? createDsl4AssetPreloadCoordinator({
        storyDocument,
        lifecycle: assetLifecycle,
        onEvent: (type, details) => emit(type, details),
        ...(crossfadeTransitionsEnabled
          ? {persistentAssetIds: createDsl4AssetDependencyIndex(storyDocument).bgm}
          : {}),
        ...(cameraPreviewControlsEnabled
          ? {}
          : {
              excludedStartupAssetIds:
                createDsl4AssetDependencyIndex(storyDocument).posePreviewControls,
            }),
      })
    : null;
  let assetsReleased = true;
  let controllerDisposed = false;
  const retainedRestoreIntegrations = new Set<StructuredDataIntegration>();
  function releaseRestoreIntegration(owner: StructuredDataIntegration) {
    owner.dispose?.();
    retainedRestoreIntegrations.delete(owner);
  }
  function retryRestoreCleanup() {
    const errors: unknown[] = [];
    for (const owner of [...retainedRestoreIntegrations])
      try {
        releaseRestoreIntegration(owner);
      } catch (error) {
        errors.push(error);
      }
    if (errors.length) throw new AggregateError(errors, 'Structured restore cleanup failed');
  }
  let structuredScene: Readonly<Record<string, unknown>> | null = null;
  let structuredAction: Readonly<Record<string, unknown>> | null = null;
  let structuredActionResources: Readonly<{actionScopeRef: string; actionViewRef: string}> | null =
    null;
  let structuredStoryActive = false;
  let structuredActionActive = false;

  function releaseAssets(reason: string) {
    if (!assetCoordinator || assetsReleased) return;
    assetsReleased = true;
    void assetCoordinator.release(reason);
  }

  function currentScene() {
    return structuredScene ?? scenes[currentSceneIndex];
  }

  /** The action the runtime is on, or null once the scene has run past its last action. */
  function currentAction(): Readonly<Record<string, unknown>> | null {
    if (structuredAction) return structuredAction;
    const actions = (currentScene()?.actions ?? []) as ReadonlyArray<
      Readonly<Record<string, unknown>>
    >;
    return actions[currentActionIndex] ?? null;
  }

  function isRehearsalSceneStatefulAction(action: Readonly<Record<string, unknown>> | null) {
    return action?.command === 'bgm' || action?.command === 'transition';
  }

  function settleRehearsalSkip(lock: RehearsalSkipLock | null) {
    if (!lock || rehearsalSkipLock !== lock) return;
    rehearsalSkipLock = null;
    lock.completion.resolve(undefined);
  }

  function actionAt(scenePosition: number, actionPosition: number) {
    const scene = scenes[scenePosition];
    const actions = (scene?.actions ?? []) as ReadonlyArray<Readonly<Record<string, unknown>>>;
    return actions[actionPosition] ?? null;
  }

  function quiesceError(code: string, message: string) {
    return createDsl4RuntimeQuiesceError(code, message, currentAction());
  }

  function completeQuiesce(
    scenePosition: number,
    actionPosition: number,
    resumeMode: 'next-action' | 'replay-action' | 'finished',
    pause: boolean,
  ) {
    const request = quiesceRequest;
    if (!request || request.phase !== 'quiescing') return null;
    if (pause) {
      status = 'paused';
      currentSceneIndex = scenePosition;
      currentActionIndex = actionPosition;
      actionAbortController = null;
    }
    const scene = scenes[scenePosition] ?? null;
    const action = actionAt(scenePosition, actionPosition);
    const sceneId = typeof scene?.id === 'string' ? scene.id : null;
    const storyPath =
      typeof action?.id === 'string'
        ? action.id
        : sceneId
          ? `/scenes/${encodeDsl4StoryPathSegment(sceneId)}`
          : '/';
    const token = createDsl4QuiesceToken({
      candidateId: request.candidateId,
      runtimeGeneration: generation,
      storyPath,
      sceneId,
      actionIndex: actionPosition,
      action,
      variables: cloneValue(variables) as Readonly<Record<string, unknown>>,
      resumeMode,
    });
    request.phase = 'token';
    request.token = token;
    try {
      request.cancelTimeout();
    } catch {
      // A timeout observer cannot change an already safe boundary.
    }
    request.cancelTimeout = () => {};
    if (pause) emit('runtime.quiesce', {candidateId: request.candidateId, resumeMode});
    request.completion.resolve(token);
    return token;
  }

  function rejectQuiesce(error: unknown) {
    const request = quiesceRequest;
    if (!request || request.phase !== 'quiescing') return;
    request.phase = 'failed';
    try {
      request.cancelTimeout();
    } catch {
      // A timeout observer cannot replace the quiesce failure.
    }
    request.cancelTimeout = () => {};
    quiesceRequest = null;
    request.completion.reject(error);
  }

  function abandonQuiesce(_reason: string) {
    const request = quiesceRequest;
    if (!request) return;
    if (request.phase === 'quiescing') {
      rejectQuiesce(
        quiesceError(
          'K4-RELOAD-QUIESCE-FAILED',
          'Runtime termination interrupted live reload quiesce',
        ),
      );
      return;
    }
    try {
      request.cancelTimeout();
    } catch {
      // Runtime termination remains authoritative.
    }
    quiesceRequest = null;
  }

  function pauseAtDispatchBoundary() {
    const request = quiesceRequest;
    if (!request || request.phase !== 'quiescing' || request.mode !== 'finish-only') {
      return false;
    }
    const scene = currentScene();
    const actions = (scene?.actions ?? []) as ReadonlyArray<Readonly<Record<string, unknown>>>;
    const nextActionIndex = currentActionIndex + 1;
    if (nextActionIndex >= actions.length) return false;
    completeQuiesce(currentSceneIndex, nextActionIndex, 'next-action', true);
    return true;
  }

  function normalizeStructuredCleanupError(
    error: unknown,
    action: Readonly<Record<string, unknown>> | null,
  ) {
    if (action?.handler !== 'custom') return error;
    const cleanupError = new Error('Custom action scope cleanup failed', {cause: error});
    Object.defineProperty(cleanupError, 'code', {value: 'K4-CUSTOM-CLEANUP-FAILED'});
    if (typeof action.id === 'string') {
      Object.defineProperty(cleanupError, 'storyPath', {value: action.id});
    }
    return cleanupError;
  }

  function releaseStructuredAction(reason: string) {
    if (!structuredDataIntegration || !structuredActionActive) return;
    const action = currentAction();
    try {
      structuredDataIntegration.releaseAction(reason);
    } catch (error) {
      throw normalizeStructuredCleanupError(error, action);
    } finally {
      structuredActionActive = false;
      structuredAction = null;
      structuredActionResources = null;
    }
  }

  function endStructuredStory(reason: string) {
    if (!structuredDataIntegration || !structuredStoryActive) return;
    const action = structuredActionActive ? currentAction() : null;
    try {
      structuredDataIntegration.endStory(reason);
    } catch (error) {
      throw normalizeStructuredCleanupError(error, action);
    } finally {
      structuredStoryActive = false;
      structuredActionActive = false;
      structuredScene = null;
      structuredAction = null;
      structuredActionResources = null;
    }
  }

  function beginStructuredStory() {
    if (!structuredDataIntegration || structuredStoryActive) return;
    structuredDataIntegration.beginStory();
    structuredStoryActive = true;
  }

  function bindStructuredScene(sceneId: string, actionIndex: number) {
    if (!structuredDataIntegration) return null;
    const entered = structuredDataIntegration.enterScene(sceneId, {actionIndex});
    if (!isRecord(entered) || !isRecord(entered.scene) || entered.scene.id !== sceneId) {
      const error = new Error('Structured Data integration returned an invalid scene');
      Object.defineProperty(error, 'code', {value: 'K4-STRUCTURED-DATA-001'});
      throw error;
    }
    structuredScene = entered.scene;
    structuredActionActive = false;
    structuredAction = null;
    structuredActionResources = null;
    return structuredScene;
  }

  function storyPathAt(scenePosition: number, actionPosition: number): string {
    const scene = scenes[scenePosition];
    if (!scene) return '/';
    const actions = (scene.actions ?? []) as ReadonlyArray<Readonly<Record<string, unknown>>>;
    const action = actions[actionPosition];
    return typeof action?.id === 'string'
      ? action.id
      : `/scenes/${encodeDsl4StoryPathSegment(String(scene.id))}`;
  }

  function resolvePosition(sceneId: string, actionIndex: number): {sceneIndex: number} | null {
    const nextSceneIndex = sceneIndex.get(sceneId);
    const nextScene = nextSceneIndex === undefined ? undefined : scenes[nextSceneIndex];
    const nextActions = (nextScene?.actions ?? []) as ReadonlyArray<unknown>;
    if (
      nextSceneIndex === undefined ||
      !Number.isInteger(actionIndex) ||
      actionIndex < 0 ||
      (nextActions.length > 0 && actionIndex >= nextActions.length) ||
      (nextActions.length === 0 && actionIndex !== 0)
    ) {
      return null;
    }
    return {sceneIndex: nextSceneIndex};
  }

  /** Validate a planner-produced variable snapshot before interrupting the current run. */
  function resolveStartVariables(input: unknown): Record<string, string | number | boolean> {
    if (input === undefined) {
      return cloneValue(initialVariables) as Record<string, string | number | boolean>;
    }
    if (!isRecord(input)) throw new TypeError('runtime start variables must be an object');
    // Snapshots saved before the built-in variable was introduced keep their other values.
    input = {startSceneIndex: initialVariables.startSceneIndex, ...input};
    const snapshot = input as Record<string, unknown>;
    const expectedNames = Object.keys(initialVariables).sort();
    const actualNames = Object.keys(snapshot).sort();
    if (
      expectedNames.length !== actualNames.length ||
      expectedNames.some((name, index) => name !== actualNames[index])
    ) {
      throw new TypeError('runtime start variables must match every declared story variable');
    }
    for (const name of expectedNames) {
      const value = snapshot[name];
      if (
        (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') ||
        typeof value !== typeof initialVariables[name]
      ) {
        throw new TypeError(`runtime start variable ${JSON.stringify(name)} has the wrong type`);
      }
    }
    return cloneValue(input) as Record<string, string | number | boolean>;
  }

  function emit(type: string, details: Record<string, unknown> = {}) {
    const scene = currentScene();
    const action = currentAction();
    const scenePath =
      typeof scene?.id === 'string' ? `/scenes/${encodeDsl4StoryPathSegment(scene.id)}` : '/';
    const event = deepFreeze({
      sequence: sequence++,
      type,
      sceneId: typeof scene?.id === 'string' ? scene.id : null,
      storyPath: typeof action?.id === 'string' ? action.id : scenePath,
      actionPath: typeof action?.id === 'string' ? action.id : null,
      generation,
      details: cloneValue(details),
    }) as RuntimeEvent;
    trace.push(event);
    const lock = rehearsalSkipLock;
    if (lock) {
      const enteredAnotherScene = type === 'scene.enter' && currentSceneIndex !== lock.sceneIndex;
      const startedAnotherAction =
        type === 'action.start' &&
        (currentSceneIndex !== lock.sceneIndex || currentActionIndex !== lock.actionIndex);
      const terminal =
        type === 'runtime.finish' || type === 'runtime.fail' || type === 'runtime.stop';
      if (
        terminal ||
        enteredAnotherScene ||
        (lock.command === 'rehearsal.skipAction' && startedAnotherAction)
      ) {
        settleRehearsalSkip(lock);
      }
    }
    if (
      rehearsalSceneSkip &&
      ((type === 'scene.enter' && currentSceneIndex !== rehearsalSceneSkip.sceneIndex) ||
        type === 'runtime.finish' ||
        type === 'runtime.fail' ||
        type === 'runtime.stop')
    ) {
      rehearsalSceneSkip = null;
    }
    try {
      onEvent?.(event);
    } catch {
      // Observers cannot change execution semantics.
    }
  }

  function snapshot() {
    const scene = currentScene();
    const action = currentAction();
    return deepFreeze({
      status,
      sceneId: typeof scene?.id === 'string' ? scene.id : null,
      actionIndex: currentActionIndex,
      actionPath: typeof action?.id === 'string' ? action.id : null,
      generation,
      variables: cloneValue(variables),
      diagnostic: failureDiagnostic,
      ...(failureContext ? {failureContext} : {}),
      ...(narrativeControlEnabled && action?.narrative
        ? {narrative: cloneValue(action.narrative)}
        : {}),
    });
  }

  function isCurrent(actionGeneration: number): boolean {
    return status === 'running' && generation === actionGeneration;
  }

  function actionContext(actionGeneration: number, signal: AbortSignal): ActionContext {
    const scene = currentScene();
    const action = currentAction();
    // The context is built while an action runs, so both are present.
    if (!scene || !action) {
      throw new TypeError('DSL 4.0 action context requires an active scene and action');
    }
    const sceneId = String(scene.id);
    const actionPath = String(action.id);
    return {
      signal,
      generation: actionGeneration,
      sceneId,
      actionIndex: currentActionIndex,
      actionPath,
      variables: deepFreeze({...variables}),
      ...(structuredDataIntegration && structuredActionResources
        ? {structuredData: structuredActionResources}
        : {}),
      getVariable(name) {
        return variables[name];
      },
      setVariable(name, value) {
        if (!isCurrent(actionGeneration) || signal.aborted || !Object.hasOwn(variables, name)) {
          return false;
        }
        if (typeof variables[name] !== typeof value) return false;
        variables[name] = value;
        return true;
      },
      createAdvanceWait(): Readonly<{
        promise: Promise<Readonly<Record<string, unknown>>>;
        cancel: () => void;
      }> {
        if (!speechAdvanceTypewriterEnabled) {
          throw new TypeError('Speech advance input is disabled');
        }
        if (!isCurrent(actionGeneration) || signal.aborted) {
          throw Object.assign(new Error('DSL 4.0 runtime action was cancelled'), {
            name: 'AbortError',
          });
        }
        if (activeAdvanceWait) {
          throw new Error('Only one speech advance wait may be active');
        }
        const completion = deferred();
        const wait: {
          generation: number;
          armed: boolean;
          completion: ReturnType<typeof deferred>;
          cleanup: () => void;
        } = {
          generation: actionGeneration,
          armed: false,
          completion,
          cleanup: () => {},
        };
        const close = (outcome = 'cancelled', input = null) => {
          if (activeAdvanceWait !== wait) return;
          activeAdvanceWait = null;
          wait.cleanup();
          completion.resolve(deepFreeze({outcome, ...(input ? {input: cloneValue(input)} : {})}));
        };
        const handleAbort = () => close();
        wait.cleanup = () => signal.removeEventListener('abort', handleAbort);
        signal.addEventListener('abort', handleAbort, {once: true});
        activeAdvanceWait = wait;
        queueMicrotask(() => {
          if (activeAdvanceWait === wait && isCurrent(actionGeneration) && !signal.aborted) {
            wait.armed = true;
          }
        });
        return Object.freeze({
          promise: completion.promise as Promise<Readonly<Record<string, unknown>>>,
          cancel: () => close(),
        });
      },
    };
  }

  function acceptAdvanceInput(input: Readonly<Record<string, unknown>>) {
    if (!speechAdvanceTypewriterEnabled || !isRecord(input)) return false;
    const wait = activeAdvanceWait;
    if (!wait || !wait.armed || !isCurrent(wait.generation)) return false;
    activeAdvanceWait = null;
    wait.cleanup();
    wait.completion.resolve(deepFreeze({outcome: 'advance', input: cloneValue(input)}));
    emit('speech.advance', {input: cloneValue(input)});
    return true;
  }

  /**
   * Consume an eligible input while an advance wait is active, including the
   * unarmed interval that protects the speech-starting event from reuse.
   */
  function consumeAdvanceInput(input: Readonly<Record<string, unknown>>) {
    if (!speechAdvanceTypewriterEnabled || !isRecord(input)) return false;
    const wait = activeAdvanceWait;
    if (!wait || !isCurrent(wait.generation)) return false;
    if (!wait.armed) return true;
    return acceptAdvanceInput(input);
  }

  function ensureActive(context: ActionContext) {
    if (isCurrent(context.generation) && !context.signal.aborted) return;
    const error = new Error('DSL 4.0 runtime action was cancelled');
    error.name = 'AbortError';
    throw error;
  }

  async function invokePort(
    method: string,
    payload: Record<string, unknown>,
    context: ActionContext,
  ): Promise<unknown> {
    const operation = port[method];
    if (typeof operation !== 'function') {
      const error = new Error(`Runtime port method ${method} is not available`);
      Object.defineProperty(error, 'code', {value: 'K4-RUNTIME-PORT-001'});
      throw error;
    }
    return operation(payload, context);
  }

  function finishPresentationTransitions(reason: string) {
    const errors = [];
    try {
      pendingSceneCrossfade?.operation.finish(reason);
    } catch (error) {
      errors.push(error);
    }
    pendingSceneCrossfade = null;
    try {
      port.finishPresentationTransitions?.(reason);
    } catch (error) {
      errors.push(error);
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, 'Presentation transition finalization failed');
    }
  }

  function sceneEntryPrefixEnd(scene: Readonly<Record<string, unknown>>) {
    const eligible = new Set([
      'stage',
      'bgm',
      'show',
      'hide',
      'setSkin',
      'setLayer',
      'setTransparency',
      'setText',
    ]);
    const actions = (scene.actions ?? []) as ReadonlyArray<Readonly<Record<string, unknown>>>;
    let end = 0;
    for (const action of actions) {
      if (!eligible.has(String(action.command))) break;
      if (
        action.command === 'setTransparency' &&
        isRecord(action.args) &&
        Number(action.args.seconds ?? 0) > 0
      ) {
        break;
      }
      end += 1;
    }
    return end;
  }

  function sceneCrossfadeAllowed(reason: string, actionIndex: number) {
    if (actionIndex !== 0) return false;
    return ![
      'start',
      'restart',
      'rehearsal',
      'history',
      'live-reload',
      'resume',
      'reposition',
    ].some((token) => reason.includes(token));
  }

  async function prepareSceneCrossfade(
    scene: Readonly<Record<string, unknown>>,
    reason: string,
    actionIndex: number,
  ) {
    if (!crossfadeTransitionsEnabled || !sceneCrossfadeAllowed(reason, actionIndex)) return null;
    const transition = scene.entryTransition ?? transitionDefaults.scene;
    if (!isRecord(transition) || transition.effect !== 'crossfade') return null;
    const prefixEnd = sceneEntryPrefixEnd(scene);
    if (typeof port.createSceneCrossfade !== 'function') {
      const error = new Error('Scene crossfade platform capability is unavailable');
      Object.defineProperty(error, 'code', {value: 'K4-RUNTIME-PORT-001'});
      throw error;
    }
    const operation = await port.createSceneCrossfade(transition, {
      from: currentScene()?.id ?? null,
      to: scene.id,
      reason,
    });
    if (
      !isRecord(operation) ||
      typeof operation.start !== 'function' ||
      typeof operation.finish !== 'function'
    ) {
      const error = new Error('Scene crossfade operation is invalid');
      Object.defineProperty(error, 'code', {value: 'K4-RUNTIME-PORT-001'});
      throw error;
    }
    return {
      sceneId: String(scene.id),
      prefixEnd,
      operation: operation as unknown as Readonly<SceneCrossfadeOperation>,
    };
  }

  async function startPendingSceneCrossfade() {
    const pending = pendingSceneCrossfade;
    if (!pending) return;
    pendingSceneCrossfade = null;
    await pending.operation.start();
  }

  function applyPosePreviewMirroring(scene: Readonly<Record<string, unknown>>) {
    if (!posePreviewMirroringEnabled) return;
    const operation = port.setPosePreviewMirroring;
    if (typeof operation !== 'function') return;
    const storyPreview = isRecord(recognition.preview) ? recognition.preview : {};
    const scenePreview = isRecord(scene.posePreview) ? scene.posePreview : {};
    const mode = scenePreview.mirroring ?? storyPreview.mirroring ?? 'mirrored';
    if (typeof mode !== 'string' || !posePreviewMirroringModes.has(mode)) {
      const error = new Error('Pose preview mirroring mode is invalid');
      Object.defineProperty(error, 'code', {value: 'K4-RUNTIME-POSE-PREVIEW-001'});
      throw error;
    }
    operation(mode);
  }

  function transitionTo(sceneId: string, reason: string, actionIndex: number = 0) {
    const nextIndex = sceneIndex.get(sceneId);
    if (nextIndex === undefined) {
      const error = new Error(`Unknown scene: ${sceneId}`);
      Object.defineProperty(error, 'code', {value: 'K4-RUNTIME-SCENE-001'});
      throw error;
    }
    const nextScene = scenes[nextIndex];
    // enterScene resolves the index against the scene list before reaching here.
    if (!nextScene) throw new TypeError(`DSL 4.0 scene index ${nextIndex} does not exist`);
    const fromId = currentScene()?.id;
    const from = fromId === undefined || fromId === null ? null : String(fromId);
    port.hideSceneActors?.(
      deepFreeze({
        actors: storyActorIds,
        from,
        to: sceneId,
        reason,
      }),
    );
    applyPosePreviewMirroring(nextScene);
    bindStructuredScene(sceneId, actionIndex);
    currentSceneIndex = nextIndex;
    currentActionIndex = actionIndex - 1;
    narrativeDecisions.clear();
    const restored = (nextScene.actions as Record<string, unknown>[])[actionIndex]?.narrative as
      import('./narrative-control.js').NarrativeOrigin | undefined;
    for (const guard of restored?.guards ?? []) narrativeDecisions.set(guard.id, guard.expected);
    emit('scene.transition', {from, to: sceneId, reason});
    emit('scene.enter', {reason});
  }

  /** Prepare the target while the current scene remains committed, then publish the transition. */
  async function enterScene(
    sceneId: string,
    reason: string,
    activeRunId: number,
    actionIndex: number = 0,
  ): Promise<boolean> {
    if (assetCoordinator) {
      assetCoordinator.beginScene(sceneId, generation);
      const readiness = await assetCoordinator.waitForScene(sceneId);
      if (runId !== activeRunId || status !== 'running') return false;
      if (!readiness.ok) {
        if (!readiness.cancelled) fail(readiness.error);
        return false;
      }
    }
    const nextIndex = sceneIndex.get(sceneId);
    const nextScene = nextIndex === undefined ? null : scenes[nextIndex];
    let preparedSceneCrossfade = null;
    try {
      if (presentationEffectsEnabled) finishPresentationTransitions(reason);
      preparedSceneCrossfade = nextScene
        ? await prepareSceneCrossfade(nextScene, reason, actionIndex)
        : null;
    } catch (error) {
      if (runId === activeRunId && status === 'running') fail(error);
      return false;
    }
    if (runId !== activeRunId || status !== 'running') {
      try {
        preparedSceneCrossfade?.operation.finish(reason);
      } catch {
        // A superseded run cannot publish a cleanup failure into the active run.
      }
      return false;
    }
    pendingSceneCrossfade = preparedSceneCrossfade;
    try {
      transitionTo(sceneId, reason, actionIndex);
    } catch (error) {
      if (runId === activeRunId && status === 'running') fail(error);
      return false;
    }
    if (assetCoordinator) {
      try {
        await assetCoordinator.commitScene(sceneId, 'scene-transition');
      } catch (error) {
        if (runId === activeRunId && status === 'running') fail(error);
        return false;
      }
      if (runId !== activeRunId || status !== 'running') return false;
    }
    if (pendingSceneCrossfade?.prefixEnd === 0) {
      try {
        await startPendingSceneCrossfade();
      } catch (error) {
        if (runId === activeRunId && status === 'running') fail(error);
        return false;
      }
    }
    return true;
  }

  async function resolveBranch(branchId: string, context: ActionContext): Promise<string> {
    const rules = branches[branchId];
    if (!rules) {
      const error = new Error(`Unknown branch: ${branchId}`);
      Object.defineProperty(error, 'code', {value: 'K4-RUNTIME-BRANCH-001'});
      throw error;
    }
    for (const [ruleIndex, rule] of rules.entries()) {
      if (typeof rule.else === 'string') return rule.else;
      if (typeof evaluateCondition !== 'function') {
        const error = new Error('Runtime condition evaluator is not available');
        Object.defineProperty(error, 'code', {value: 'K4-RUNTIME-PORT-001'});
        throw error;
      }
      let matches;
      try {
        matches = await evaluateCondition(String(rule.if), context.variables, context);
      } catch (error) {
        throw mapDsl4RuntimeExpressionError(error, {
          storyPath: `/branches/${encodeDsl4StoryPathSegment(branchId)}/${ruleIndex}/if`,
          sourcePath: `$.branches[${JSON.stringify(branchId)}][${ruleIndex}].if`,
        });
      }
      ensureActive(context);
      if (matches) return String(rule.goto);
    }
    const error = new Error(`Branch ${branchId} has no matching destination`);
    Object.defineProperty(error, 'code', {value: 'K4-RUNTIME-BRANCH-002'});
    throw error;
  }

  function resolveSpeechStyle(command: 'say' | 'think', args: Record<string, unknown>) {
    let resolvedArgs = args;
    if (Object.hasOwn(args, 'closePolicy')) {
      const policyId = args.closePolicy;
      const policy = typeof policyId === 'string' ? bubbleClosePolicies[policyId] : undefined;
      if (!isRecord(policy)) {
        const error = new Error(`${command}.closePolicy is unavailable: ${String(policyId)}`);
        Object.defineProperty(error, 'code', {
          value: 'K4-RUNTIME-SPEECH-CLOSE-POLICY-001',
        });
        throw error;
      }
      const actionArgs = Object.fromEntries(
        Object.entries(args).filter(([key]) => key !== 'closePolicy'),
      );
      const resolvedPolicy = cloneValue(policy) as Record<string, unknown>;
      resolvedArgs = {...resolvedPolicy, ...actionArgs};
    }
    if (!Object.hasOwn(resolvedArgs, 'styles')) return resolvedArgs;
    const styleIds = resolvedArgs.styles;
    if (
      !Array.isArray(styleIds) ||
      styleIds.length === 0 ||
      styleIds.some((styleId) => typeof styleId !== 'string') ||
      new Set(styleIds).size !== styleIds.length
    ) {
      const error = new Error(`${command}.styles must be an array of bubble style names`);
      Object.defineProperty(error, 'code', {value: 'K4-RUNTIME-SPEECH-STYLE-001'});
      throw error;
    }
    const actionArgs = Object.fromEntries(
      Object.entries(resolvedArgs).filter(([key]) => key !== 'styles'),
    );
    const resolvedStyle = composeBubbleStyles(styleIds, bubbleStyles);
    const presentation = Object.fromEntries(
      speechPresentationArgumentNames
        .filter((field) => Object.hasOwn(resolvedStyle, field))
        .map((field) => [field, resolvedStyle[field]]),
    );
    return {
      ...presentation,
      ...(turboWarpBubbleAdvancedPresentationEnabled && Object.hasOwn(resolvedStyle, 'reveal')
        ? {bubbleReveal: resolvedStyle.reveal}
        : {}),
      ...(turboWarpBubbleAdvancedPresentationEnabled &&
      Object.hasOwn(resolvedStyle, 'visibleAnimations')
        ? {bubbleMotions: resolvedStyle.visibleAnimations}
        : {}),
      ...actionArgs,
      bubbleStyle: bubbleStyleNameForStyleIds(styleIds),
    };
  }

  /**
   * Wait for the current scene's recognition model, which loads in the background from scene
   * entry. Returns at once when it is ready; rejects with an AbortError when the wait is cancelled.
   */
  /**
   * Wait for the current scene's recognition model, which loads in the background from scene
   * entry. Without an asset lifecycle, or for a scene without a model, there is nothing to wait for
   * and this returns `null` without yielding, so the recognition action starts in the same turn.
   */
  function waitForRecognitionModel(context: ActionContext): Promise<void> | null {
    const recognitionModel = String(currentScene()?.recognitionModel ?? '');
    const coordinator = assetCoordinator as
      | (typeof assetCoordinator & {
          waitForSceneAsset?: (
            sceneId: string,
            assetId: string,
            generation: number,
            signal: AbortSignal,
          ) => Promise<Readonly<{ok: boolean; cancelled?: boolean; error?: unknown}>>;
        })
      | null;
    if (!recognitionModel || typeof coordinator?.waitForSceneAsset !== 'function') return null;
    return coordinator
      .waitForSceneAsset(context.sceneId, recognitionModel, context.generation, context.signal)
      .then((readiness) => {
        if (readiness.ok) return;
        if (readiness.cancelled) {
          const error = new Error('Recognition model wait was cancelled');
          error.name = 'AbortError';
          throw error;
        }
        throw readiness.error;
      });
  }

  async function dispatchPose(
    {target, args}: Readonly<{target: string | null; args: Record<string, unknown>}>,
    context: ActionContext,
  ) {
    const steps = args.steps as ReadonlyArray<Readonly<Record<string, string>>>;
    const recognitionModel = String(currentScene()?.recognitionModel ?? '');
    for (const [stepIndex, step] of steps.entries()) {
      const stepController = new AbortController();
      const handleActionAbort = () => stepController.abort(context.signal.reason);
      if (context.signal.aborted) handleActionAbort();
      else context.signal.addEventListener('abort', handleActionAbort, {once: true});
      const poseWait = {
        generation: context.generation,
        stepIndex,
        controller: stepController,
        completion: deferred(),
        cleanup: () => context.signal.removeEventListener('abort', handleActionAbort),
        waitingForRecognition: false,
        skipRequested: false,
        skipReason: null,
      };
      if (
        poseAdvanceLock !== null &&
        poseAdvanceLock.generation === context.generation &&
        poseAdvanceLock.stepIndex !== stepIndex
      ) {
        poseAdvanceLock = null;
      }
      activePoseWait = poseWait;
      const stepContext = {
        ...context,
        signal: stepController.signal,
        actionSignal: context.signal,
      };
      let skipped = false;
      try {
        if (typeof step.skin === 'string') {
          await invokePort('setSkin', {target, skin: step.skin}, stepContext);
          ensureActive(context);
        }
        poseWait.waitingForRecognition = true;
        // The model loads in the background from scene entry; wait only while it still loads.
        const modelReady = waitForRecognitionModel(stepContext);
        if (modelReady) {
          await modelReady;
          ensureActive(context);
        }
        await invokePort(
          'waitForPose',
          {
            target,
            pose: step.pose,
            stepIndex,
            stepCount: steps.length,
            recognitionModel,
            recognitionMode: 'pose',
            recognition: cloneValue(poseSequenceRecognition),
          },
          stepContext,
        );
        if (poseWait.skipRequested && !context.signal.aborted && isCurrent(context.generation)) {
          skipped = true;
        }
      } catch (error) {
        const errorRecord = isRecord(error) ? error : {};
        if (
          !poseWait.skipRequested ||
          context.signal.aborted ||
          !isCurrent(context.generation) ||
          errorRecord.name !== 'AbortError'
        ) {
          throw error;
        }
        skipped = true;
      } finally {
        poseWait.cleanup();
        if (activePoseWait === poseWait) activePoseWait = null;
        poseWait.completion.resolve(undefined);
      }
      if (skipped) {
        emit('pose.step.skip', {
          stepIndex,
          reason: poseWait.skipReason ?? 'navigation.nextAction',
        });
        continue;
      }
      ensureActive(context);
      if (typeof step.sound === 'string') {
        await invokePort('bgm', {sound: step.sound}, context);
        ensureActive(context);
      }
    }
  }

  const runtimeActionDispatcher = createDsl4RuntimeActionDispatcher({
    invokePort,
    resolveBranch,
    resolveSpeechStyle,
    getRecognitionModel: () => String(currentScene()?.recognitionModel ?? ''),
    poseSelectionRecognition,
    dispatchPose,
    writeVariable: queueVariableWrite,
    prepareRecognitionModel: (context: ActionContext) =>
      waitForRecognitionModel(context) ?? undefined,
  });

  function dispatch(
    action: Readonly<Record<string, unknown>>,
    context: ActionContext,
    options?: {rehearsalSceneSkip?: boolean; sceneEntryStaging?: boolean},
  ) {
    if (
      action.handler !== 'custom' &&
      ['say', 'think', 'setText'].includes(String(action.command)) &&
      isRecord(action.args) &&
      isDsl4TextInterpolation(action.args.text)
    ) {
      const text = evaluateDsl4TextInterpolation(action.args.text, (name) =>
        context.getVariable(name),
      );
      action = deepFreeze({
        ...action,
        args: {
          ...action.args,
          text: action.command === 'setText' ? normalizeDsl4ContentRuns(text) : text,
        },
      });
    }
    const transitionKey = {
      stage: 'backdrop',
      bgm: 'bgm',
      show: 'actorVisibility',
      hide: 'actorVisibility',
      setSkin: 'actorSkin',
    }[String(action.command)] as 'backdrop' | 'bgm' | 'actorVisibility' | 'actorSkin' | undefined;
    if (!crossfadeTransitionsEnabled || !transitionKey || !isRecord(action.args)) {
      return runtimeActionDispatcher.dispatch(action, context, options);
    }
    const args = action.args;
    const transition =
      options?.sceneEntryStaging && transitionKey !== 'bgm'
        ? dsl4CutTransition
        : (args.transition ?? transitionDefaults[transitionKey]);
    return runtimeActionDispatcher.dispatch(
      deepFreeze({
        ...action,
        args: {...args, transition, ...(transitionKey === 'bgm' ? {managed: true} : {})},
      }),
      context,
      options,
    );
  }

  function invocationError(code: string, message: string) {
    const error = new Error(message);
    Object.defineProperty(error, 'code', {value: code});
    return error;
  }

  /**
   * Invoke one already-normalized action from a TurboWarp receiver while the
   * current DSL action remains active. The parent action owns cancellation,
   * variable access, diagnostics, and the eventual scene transition commit.
   */
  function invokeAction(
    action: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>> {
    const context = activeActionContext;
    if (
      status !== 'running' ||
      !context ||
      context.signal.aborted ||
      !isCurrent(context.generation)
    ) {
      return Promise.reject(
        invocationError(
          'K4-RUNTIME-INVOKE-INACTIVE',
          'TurboWarp actions require an active DSL 4.0 action',
        ),
      );
    }

    const command = isRecord(action) ? String(action.command ?? '') : '';
    const navigationCommand = [
      'goto',
      'branch',
      'keyInputToChangeScene',
      'touchInputToChangeScene',
      'poseInputToChangeScene',
    ].includes(command);
    if (navigationCommand) {
      if (nestedNavigationCommand !== null) {
        const error = invocationError(
          'K4-RUNTIME-INVOKE-TRANSITION-CONFLICT',
          `TurboWarp action ${command} conflicts with active navigation action ${nestedNavigationCommand}`,
        );
        fail(error);
        return Promise.reject(error);
      }
      nestedNavigationCommand = command;
    }

    const operation = (async () => {
      try {
        const transition = await dispatch(action, context);
        if (!isCurrent(context.generation) || context.signal.aborted) {
          throw invocationError(
            'K4-RUNTIME-INVOKE-CANCELLED',
            'TurboWarp action was cancelled with its parent DSL 4.0 action',
          );
        }
        if (transition) nestedActionTransition = transition;
        return deepFreeze(
          transition
            ? {outcome: 'transitioned', sceneId: transition.sceneId, reason: transition.reason}
            : {outcome: 'completed'},
        );
      } catch (error) {
        if (isCurrent(context.generation) && !context.signal.aborted) fail(error);
        throw error;
      }
    })();
    activeNestedInvocations.add(operation);
    void operation.then(
      () => activeNestedInvocations.delete(operation),
      () => activeNestedInvocations.delete(operation),
    );
    return operation;
  }

  /** Queue a typed story-variable mutation for the active action boundary. */
  function queueVariableWrite(request: unknown) {
    const reject = (code: string) => deepFreeze({accepted: false, code});
    const context = activeActionContext;
    if (
      status !== 'running' ||
      !context ||
      context.signal.aborted ||
      !isCurrent(context.generation)
    ) {
      return reject('K4-VARIABLE-WRITE-INACTIVE');
    }
    if (!isRecord(request)) return reject('K4-VARIABLE-WRITE-INPUT');
    const operation = request.operation;
    const name = request.name;
    const value = request.value;
    if (operation !== 'set' && operation !== 'change' && operation !== 'toggle') {
      return reject('K4-VARIABLE-WRITE-INPUT');
    }
    if (typeof name !== 'string' || !Object.hasOwn(variables, name)) {
      return reject('K4-VARIABLE-WRITE-UNKNOWN');
    }
    if (operation === 'toggle') {
      if (typeof variables[name] !== 'boolean') return reject('K4-VARIABLE-WRITE-TYPE');
      if (value !== undefined) return reject('K4-VARIABLE-WRITE-INPUT');
    } else if (operation === 'change') {
      if (typeof variables[name] !== 'number') return reject('K4-VARIABLE-WRITE-TYPE');
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return reject('K4-VARIABLE-WRITE-VALUE');
      }
    } else {
      if (typeof variables[name] !== typeof value) return reject('K4-VARIABLE-WRITE-TYPE');
      if (typeof value === 'number' && !Number.isFinite(value)) {
        return reject('K4-VARIABLE-WRITE-VALUE');
      }
      if (!['string', 'number', 'boolean'].includes(typeof value)) {
        return reject('K4-VARIABLE-WRITE-VALUE');
      }
    }
    pendingVariableWrites.push(
      Object.freeze({
        generation: context.generation,
        operation,
        name,
        ...(operation === 'toggle' ? {} : {value: value as string | number | boolean}),
      }),
    );
    return deepFreeze({accepted: true, code: ''});
  }

  function commitVariableWrites(actionGeneration: number) {
    const writes = pendingVariableWrites;
    pendingVariableWrites = [];
    for (const write of writes) {
      if (write.generation !== actionGeneration) continue;
      if (write.operation === 'toggle') {
        if (typeof variables[write.name] === 'boolean') {
          variables[write.name] = !variables[write.name];
        }
        continue;
      }
      if (write.operation === 'change') {
        const next = Number(variables[write.name]) + Number(write.value);
        if (Number.isFinite(next)) variables[write.name] = next;
        continue;
      }
      variables[write.name] = write.value as string | number | boolean;
    }
  }

  function rejectActionInvocation(error: unknown) {
    const context = activeActionContext;
    if (
      status !== 'running' ||
      !context ||
      context.signal.aborted ||
      !isCurrent(context.generation)
    ) {
      return Promise.reject(
        invocationError(
          'K4-RUNTIME-INVOKE-INACTIVE',
          'TurboWarp actions require an active DSL 4.0 action',
        ),
      );
    }
    const failure =
      error instanceof Error
        ? error
        : invocationError('K4-BLOCK-ACTION-001', 'TurboWarp action input is invalid');
    fail(failure);
    return Promise.reject(failure);
  }

  async function waitForNestedInvocations() {
    while (activeNestedInvocations.size > 0) {
      await Promise.all([...activeNestedInvocations]);
    }
  }

  function fail(error: unknown, cleanupStructuredData: boolean = true) {
    if (
      status === 'failed' ||
      status === 'stopped' ||
      (status === 'finished' && !structuredStoryActive)
    ) {
      return;
    }
    let terminalError = error;
    try {
      finishPresentationTransitions('runtime-failed');
    } catch {
      // The triggering runtime error remains authoritative after best-effort cleanup.
    }
    if (cleanupStructuredData && structuredDataIntegration) {
      try {
        endStructuredStory('runtime-failed');
      } catch (cleanupError) {
        terminalError = cleanupError;
      }
    }
    status = 'failed';
    pendingVariableWrites = [];
    actionAbortController?.abort('runtime-failed');
    const failedAction = currentAction();
    const actionPath = typeof failedAction?.id === 'string' ? String(failedAction.id) : null;
    const errorRecord =
      typeof terminalError === 'object' && terminalError !== null
        ? (terminalError as Record<string, unknown>)
        : {};
    const code = typeof errorRecord.code === 'string' ? errorRecord.code : 'K4-RUNTIME-ACTION-001';
    const errorStoryPath =
      typeof errorRecord.storyPath === 'string' ? errorRecord.storyPath : actionPath;
    const errorSourcePath =
      typeof errorRecord.sourcePath === 'string' ? errorRecord.sourcePath : (errorStoryPath ?? '$');
    failureDiagnostic = runtimeDiagnostic(
      storyDocument,
      errorStoryPath,
      errorSourcePath,
      code,
      safeErrorMessage(terminalError),
    );
    failureContext = deepFreeze(
      createRuntimeFailureContext(
        error,
        currentScene() ?? null,
        failedAction,
        currentActionIndex,
        terminalError === error ? undefined : terminalError,
      ),
    );
    releaseAssets('runtime-failed');
    emit('runtime.fail', {code, failureContext});
    rejectQuiesce(
      terminalError instanceof Error
        ? terminalError
        : quiesceError('K4-RELOAD-QUIESCE-FAILED', 'Runtime failed while quiescing'),
    );
  }

  async function run(activeRunId: number) {
    try {
      while (status === 'running') {
        const scene = currentScene();
        if (!scene) {
          status = 'finished';
          emit('runtime.finish');
          break;
        }
        if (assetCoordinator) {
          const readiness = await assetCoordinator.waitForScene(String(scene.id));
          if (runId !== activeRunId || status !== 'running') break;
          if (!readiness.ok) {
            if (!readiness.cancelled) fail(readiness.error);
            break;
          }
          if (readiness.prepared) {
            try {
              await assetCoordinator.commitScene(String(scene.id), 'scene-resume');
            } catch (error) {
              if (runId === activeRunId && status === 'running') fail(error);
              break;
            }
            if (runId !== activeRunId || status !== 'running') break;
          }
        }
        const actions = scene.actions as ReadonlyArray<Readonly<Record<string, unknown>>>;
        if (pauseAtDispatchBoundary()) break;
        if (currentActionIndex + 1 >= actions.length) {
          if (currentSceneIndex + 1 >= scenes.length) {
            try {
              if (presentationEffectsEnabled) finishPresentationTransitions('runtime-finished');
              endStructuredStory('runtime-finished');
            } catch (error) {
              fail(error, false);
              break;
            }
            status = 'finished';
            currentActionIndex = actions.length;
            emit('runtime.finish');
            completeQuiesce(currentSceneIndex, currentActionIndex, 'finished', false);
            break;
          }
          const sceneSkip =
            rehearsalSceneSkip?.sceneIndex === currentSceneIndex ? rehearsalSceneSkip : null;
          if (sceneSkip) {
            emit('navigation.advanceScene', {
              fromStoryPath: storyPathAt(currentSceneIndex, currentActionIndex),
              toStoryPath: storyPathAt(currentSceneIndex + 1, 0),
              reason: sceneSkip.reason,
            });
          }
          if (
            !(await enterScene(
              String(scenes[currentSceneIndex + 1]?.id),
              sceneSkip?.reason ?? 'sequential',
              activeRunId,
            ))
          ) {
            break;
          }
          continue;
        }

        currentActionIndex += 1;
        if (structuredDataIntegration) {
          try {
            const next = structuredDataIntegration.beginNextAction();
            if (
              !isRecord(next) ||
              next.status !== 'item' ||
              next.index !== currentActionIndex ||
              !isRecord(next.action) ||
              !isRecord(next.resources) ||
              typeof next.resources.actionScopeRef !== 'string' ||
              typeof next.resources.actionViewRef !== 'string'
            ) {
              const error = new Error('Structured Data action Iterator is inconsistent');
              Object.defineProperty(error, 'code', {value: 'K4-STRUCTURED-DATA-001'});
              throw error;
            }
            const currentResources = structuredDataIntegration.currentActionResources();
            if (
              !isRecord(currentResources) ||
              currentResources.actionScopeRef !== next.resources.actionScopeRef ||
              currentResources.actionViewRef !== next.resources.actionViewRef
            ) {
              const error = new Error('Structured Data action resources are inconsistent');
              Object.defineProperty(error, 'code', {value: 'K4-STRUCTURED-DATA-001'});
              throw error;
            }
            structuredActionActive = true;
            structuredAction = next.action;
            structuredActionResources = deepFreeze({
              actionScopeRef: currentResources.actionScopeRef,
              actionViewRef: currentResources.actionViewRef,
            });
          } catch (error) {
            fail(error);
            break;
          }
        }
        const applyingRehearsalSceneState = rehearsalSceneSkip?.sceneIndex === currentSceneIndex;
        const narrative = narrativeControlEnabled
          ? (currentAction()?.narrative as
              import('./narrative-control.js').NarrativeOrigin | undefined)
          : undefined;
        if (narrative) {
          let narrativeGeneration = generation;
          try {
            const selected = narrative.guards.every((guard) => {
              if (!narrativeDecisions.has(guard.id))
                throw new Error('Narrative decision is missing at this position');
              return narrativeDecisions.get(guard.id) === guard.expected;
            });
            if (!selected || narrative.boundary) {
              if (selected && narrative.decision) {
                generation += 1;
                narrativeGeneration = generation;
                const decisionGeneration = generation;
                actionAbortController = new AbortController();
                const context = actionContext(decisionGeneration, actionAbortController.signal);
                const condition = narrative.decision.condition;
                if (typeof condition === 'string' && typeof evaluateCondition !== 'function')
                  throw new Error('Runtime condition evaluator is not available');
                const result =
                  typeof condition === 'boolean'
                    ? condition
                    : await evaluateCondition!(condition, context.variables, context);
                ensureActive(context);
                narrativeDecisions.set(narrative.decision.id, Boolean(result));
                actionAbortController = null;
              }
              releaseStructuredAction(selected ? 'narrative.boundary' : 'narrative.unselected');
              emit('narrative.position', {selected, ...narrative});
              continue;
            }
          } catch (error) {
            if (!isCurrent(narrativeGeneration) || actionAbortController?.signal.aborted) break;
            fail(error);
            break;
          }
        }
        if (applyingRehearsalSceneState && !isRehearsalSceneStatefulAction(currentAction())) {
          try {
            releaseStructuredAction('rehearsal.skipScene');
          } catch (error) {
            fail(error);
            break;
          }
          emit('action.skip', {reason: 'rehearsal.skipScene'});
          continue;
        }
        generation += 1;
        const actionGeneration = generation;
        actionAbortController = new AbortController();
        const context = actionContext(actionGeneration, actionAbortController.signal);
        if (debugExecution) {
          try {
            await debugExecution.beforeAction({
              command: String(currentAction()?.command ?? ''),
              sceneId: context.sceneId,
              actionIndex: currentActionIndex,
              actionPath: context.actionPath,
              signal: context.signal,
            });
          } catch (error) {
            if (!isCurrent(actionGeneration) || actionAbortController.signal.aborted) break;
            fail(error);
            break;
          }
          if (!isCurrent(actionGeneration) || actionAbortController.signal.aborted) break;
        }
        emit('action.start');
        let transition = null;
        activeActionContext = context;
        pendingVariableWrites = [];
        nestedActionTransition = null;
        nestedNavigationCommand = null;
        activeNestedInvocations.clear();
        try {
          const stagingTransition = pendingSceneCrossfade;
          const dispatchedAction = currentAction();
          if (!dispatchedAction) break;
          transition = await dispatch(dispatchedAction, context, {
            rehearsalSceneSkip: applyingRehearsalSceneState,
            sceneEntryStaging:
              stagingTransition?.sceneId === scene.id &&
              currentActionIndex < (stagingTransition?.prefixEnd ?? 0),
          });
          await waitForNestedInvocations();
        } catch (error) {
          if (!isCurrent(actionGeneration) || actionAbortController.signal.aborted) break;
          fail(error);
          break;
        } finally {
          if (activeActionContext === context) activeActionContext = null;
          if (!isCurrent(actionGeneration) || actionAbortController.signal.aborted) {
            pendingVariableWrites = [];
          }
        }
        if (!isCurrent(actionGeneration) || actionAbortController.signal.aborted) break;
        transition = nestedActionTransition ?? transition;
        nestedActionTransition = null;
        nestedNavigationCommand = null;
        try {
          releaseStructuredAction('action-complete');
        } catch (error) {
          fail(error);
          break;
        }
        commitVariableWrites(actionGeneration);
        emit('action.commit');
        actionAbortController = null;
        const completingSceneTransition = pendingSceneCrossfade;
        if (
          completingSceneTransition?.sceneId === scene.id &&
          currentActionIndex + 1 >= (completingSceneTransition?.prefixEnd ?? Infinity)
        ) {
          try {
            await startPendingSceneCrossfade();
          } catch (error) {
            if (runId === activeRunId && status === 'running') fail(error);
            break;
          }
          if (runId !== activeRunId || status !== 'running') break;
        }
        if (transition && !(await enterScene(transition.sceneId, transition.reason, activeRunId))) {
          break;
        }
      }
    } finally {
      if (runId === activeRunId) {
        actionAbortController = null;
        runPromise = null;
      }
    }
    return snapshot();
  }

  async function runWithAssetStartup(
    entrySceneId: string,
    entryActionIndex: number,
    activeRunId: number,
  ) {
    if (!assetCoordinator) throw new Error('Asset startup requires an asset coordinator');
    let delegatedToRun = false;
    try {
      const readiness = await assetCoordinator.prepareStartup(generation);
      if (runId !== activeRunId || status !== 'running') return snapshot();
      if (!readiness.ok) {
        if (!readiness.cancelled) fail(readiness.error);
        return snapshot();
      }
      if (!(await enterScene(entrySceneId, 'start', activeRunId, entryActionIndex))) {
        return snapshot();
      }
      delegatedToRun = true;
      return await run(activeRunId);
    } finally {
      if (!delegatedToRun && runId === activeRunId) runPromise = null;
    }
  }

  function start({
    sceneId,
    actionIndex = 0,
    variables: startVariables,
  }: {
    sceneId?: string;
    actionIndex?: number;
    variables?: Readonly<Record<string, string | number | boolean>>;
  } = {}): Promise<Readonly<Record<string, unknown>>> {
    if (controllerDisposed) return Promise.resolve(snapshot());
    const entrySceneId = sceneId ?? String(scenes[0]?.id ?? '');
    if (!entrySceneId || !resolvePosition(entrySceneId, actionIndex)) {
      throw new TypeError(`Invalid runtime start position: ${entrySceneId} action ${actionIndex}`);
    }
    const nextVariables = resolveStartVariables(startVariables);
    const previousStatus = status;
    finishPresentationTransitions('restart');
    abandonQuiesce('restart');
    if (status === 'running' || status === 'paused') stop('restart');
    else if (previousStatus === 'failed' || previousStatus === 'finished') releaseAssets('restart');
    variables = nextVariables;
    pendingVariableWrites = [];
    failureDiagnostic = null;
    failureContext = null;
    currentSceneIndex = -1;
    currentActionIndex = -1;
    status = 'running';
    generation += 1;
    sequence = 0;
    trace.length = 0;
    emit('runtime.start');
    if (structuredDataIntegration) {
      try {
        beginStructuredStory();
      } catch (error) {
        fail(error);
        return Promise.resolve(snapshot());
      }
    }
    if (assetCoordinator) assetsReleased = false;
    runId += 1;
    if (assetCoordinator) {
      runPromise = runWithAssetStartup(entrySceneId, actionIndex, runId);
    } else {
      try {
        transitionTo(entrySceneId, 'start', actionIndex);
      } catch (error) {
        fail(error);
        return Promise.resolve(snapshot());
      }
      runPromise = run(runId);
    }
    return runPromise;
  }

  function stop(reason: string = 'stop'): Readonly<Record<string, unknown>> {
    abandonQuiesce(reason);
    finishPresentationTransitions(reason);
    if (status !== 'running' && status !== 'paused') {
      try {
        endStructuredStory(reason);
      } catch (error) {
        fail(error, false);
      }
      releaseAssets(reason);
      return snapshot();
    }
    const action = currentAction();
    const wasRunning = status === 'running';
    if (wasRunning) actionAbortController?.abort(reason);
    pendingVariableWrites = [];
    generation += 1;
    if (wasRunning && action) emit('action.cancel', {reason});
    try {
      endStructuredStory(reason);
    } catch (error) {
      fail(error, false);
      releaseAssets(reason);
      return snapshot();
    }
    status = 'stopped';
    emit('runtime.stop', {reason});
    releaseAssets(reason);
    return snapshot();
  }

  function hasActivePoseWait() {
    return (
      status === 'running' &&
      actionAbortController !== null &&
      activePoseWait?.generation === generation &&
      currentAction()?.command === 'pose'
    );
  }

  function isPoseNavigationAdvance(reason: string) {
    const poseWait = activePoseWait;
    return (
      hasActivePoseWait() &&
      (poseWait?.waitingForRecognition || allowSkip()) &&
      (reason === 'rehearsal.skipPose' ||
        (poseNavigationPolicyEnabled && reason === 'navigation.nextAction'))
    );
  }

  function canRehearsalSkip(command: string) {
    if (status !== 'running') return false;
    if (poseAdvanceLock && poseAdvanceLock.generation !== generation) poseAdvanceLock = null;
    if (poseAdvanceLock || rehearsalSkipLock || rehearsalSceneSkip) return false;
    if (command === 'rehearsal.skipPose') {
      return hasActivePoseWait() && allowSkip();
    }
    if (command === 'rehearsal.skipAction') {
      return actionAbortController !== null && currentAction() !== null;
    }
    if (command === 'rehearsal.skipScene') {
      return currentSceneIndex >= 0 && currentScene() !== null;
    }
    return false;
  }

  function canAdvance(reason: string = 'navigation.nextAction') {
    if (status !== 'running') return false;
    if (poseAdvanceLock && poseAdvanceLock.generation !== generation) poseAdvanceLock = null;
    if (poseAdvanceLock) return false;
    if (!isPoseNavigationAdvance(reason)) return true;
    return allowSkip();
  }

  /** Continue at the next normal execution boundary after the active action is cancelled. */
  function continueAfterAdvanceCancellation(
    reason: string,
    fromStoryPath: string,
    activeRunId: number,
  ) {
    const scene = currentScene();
    const actions = (scene?.actions ?? []) as ReadonlyArray<Readonly<Record<string, unknown>>>;
    try {
      releaseStructuredAction(reason);
    } catch (error) {
      fail(error);
      return Promise.resolve(snapshot());
    }
    actionAbortController = null;

    const nextActionIndex = currentActionIndex + 1;
    if (nextActionIndex < actions.length) {
      emit('navigation.advance', {
        fromStoryPath,
        toStoryPath: storyPathAt(currentSceneIndex, nextActionIndex),
        reason,
      });
      runPromise = run(activeRunId);
      return runPromise;
    }
    if (currentSceneIndex + 1 < scenes.length) {
      const nextSceneId = String(scenes[currentSceneIndex + 1]?.id);
      emit('navigation.advance', {
        fromStoryPath,
        toStoryPath: storyPathAt(currentSceneIndex + 1, 0),
        reason,
      });
      if (!assetCoordinator) {
        try {
          transitionTo(nextSceneId, reason);
        } catch (error) {
          fail(error);
          return Promise.resolve(snapshot());
        }
        runPromise = run(activeRunId);
        return runPromise;
      }
      runPromise = (async () => {
        if (!(await enterScene(nextSceneId, reason, activeRunId))) return snapshot();
        return run(activeRunId);
      })();
      return runPromise;
    }

    currentActionIndex = actions.length;
    try {
      endStructuredStory('runtime-finished');
    } catch (error) {
      fail(error, false);
      return Promise.resolve(snapshot());
    }
    status = 'finished';
    emit('navigation.advance', {fromStoryPath, toStoryPath: null, reason});
    emit('runtime.finish');
    return Promise.resolve(snapshot());
  }

  /** Skip the active pose step or cancel the current action at the next execution boundary. */
  function advance(
    reason: string = 'navigation.nextAction',
  ): Promise<Readonly<Record<string, unknown>>> {
    if (status !== 'running') return Promise.resolve(snapshot());
    if (poseAdvanceLock && poseAdvanceLock.generation !== generation) poseAdvanceLock = null;
    if (poseAdvanceLock) return poseAdvanceLock.operation;
    if (!canAdvance(reason)) return Promise.resolve(snapshot());
    if (isPoseNavigationAdvance(reason)) {
      const poseWait = activePoseWait;
      if (!poseWait) return Promise.resolve(snapshot());
      const lock: {
        generation: number;
        stepIndex: number;
        operation: Promise<Readonly<Record<string, unknown>>>;
      } = {
        generation,
        stepIndex: poseWait.stepIndex,
        operation: Promise.resolve(snapshot()),
      };
      poseWait.skipRequested = true;
      poseWait.skipReason = reason;
      poseWait.controller.abort(reason);
      const operation = poseWait.completion.promise.then(() => snapshot());
      lock.operation = operation;
      poseAdvanceLock = lock;
      void operation
        .finally(() => {
          if (poseAdvanceLock === lock) poseAdvanceLock = null;
        })
        .catch(() => {});
      return operation;
    }
    const fromStoryPath = storyPathAt(currentSceneIndex, currentActionIndex);
    finishPresentationTransitions(reason);
    const action = currentAction();
    actionAbortController?.abort(reason);
    pendingVariableWrites = [];
    generation += 1;
    if (action) emit('action.cancel', {reason});
    runId += 1;
    runPromise = null;
    return continueAfterAdvanceCancellation(reason, fromStoryPath, runId);
  }

  function skipPose() {
    if (!canRehearsalSkip('rehearsal.skipPose')) return Promise.resolve(snapshot());
    return advance('rehearsal.skipPose');
  }

  /**
   * Complete the active action at its cancellation endpoint and resume at the next action boundary.
   *
   * @returns {Promise<Readonly<Record<string, unknown>>>}
   */
  function skipAction() {
    if (!canRehearsalSkip('rehearsal.skipAction')) return Promise.resolve(snapshot());
    const fromStoryPath = storyPathAt(currentSceneIndex, currentActionIndex);
    const staleRun = runPromise;
    const completion = deferred();
    const lock = {
      command: 'rehearsal.skipAction' as const,
      sceneIndex: currentSceneIndex,
      actionIndex: currentActionIndex,
      completion,
      operation: Promise.resolve(snapshot()),
    };
    finishPresentationTransitions(lock.command);
    rehearsalSkipLock = lock;
    const action = currentAction();
    actionAbortController?.abort(lock.command);
    pendingVariableWrites = [];
    generation += 1;
    if (action) emit('action.cancel', {reason: lock.command});
    runId += 1;
    const activeRunId = runId;
    runPromise = null;
    const operation = (async () => {
      if (staleRun) await staleRun;
      if (status === 'running' && runId === activeRunId) {
        void continueAfterAdvanceCancellation(lock.command, fromStoryPath, activeRunId);
      } else {
        settleRehearsalSkip(lock);
      }
      await completion.promise;
      return snapshot();
    })();
    lock.operation = operation;
    void operation.catch(() => {});
    return operation;
  }

  /**
   * Fast-forward the current scene with the exact stateful tail allowed by the 3.2 runtime.
   *
   * @returns {Promise<Readonly<Record<string, unknown>>>}
   */
  function skipScene() {
    if (!canRehearsalSkip('rehearsal.skipScene')) return Promise.resolve(snapshot());
    const staleRun = runPromise;
    const completion = deferred();
    const lock = {
      command: 'rehearsal.skipScene' as const,
      sceneIndex: currentSceneIndex,
      actionIndex: currentActionIndex,
      completion,
      operation: Promise.resolve(snapshot()),
    };
    finishPresentationTransitions(lock.command);
    rehearsalSkipLock = lock;
    rehearsalSceneSkip = {sceneIndex: currentSceneIndex, reason: lock.command};
    const action = currentAction();
    actionAbortController?.abort(lock.command);
    pendingVariableWrites = [];
    generation += 1;
    if (action) emit('action.cancel', {reason: lock.command});
    runId += 1;
    const activeRunId = runId;
    runPromise = null;
    const operation = (async () => {
      if (staleRun) await staleRun;
      if (status === 'running' && runId === activeRunId) {
        try {
          releaseStructuredAction(lock.command);
        } catch (error) {
          fail(error);
        }
        actionAbortController = null;
        if (status === 'running') runPromise = run(activeRunId);
      } else {
        rehearsalSceneSkip = null;
        settleRehearsalSkip(lock);
      }
      await completion.promise;
      return snapshot();
    })();
    lock.operation = operation;
    void operation.catch(() => {});
    return operation;
  }

  /** Skip the remainder of the active scene and continue at the next scene boundary. */
  function advanceScene(
    reason: string = 'navigation.nextScene',
  ): Promise<Readonly<Record<string, unknown>>> {
    if (status !== 'running') return Promise.resolve(snapshot());
    const nextScene = scenes[currentSceneIndex + 1];
    if (nextScene) return navigate(String(nextScene.id), {reason});

    const fromStoryPath = storyPathAt(currentSceneIndex, currentActionIndex);
    const action = currentAction();
    finishPresentationTransitions(reason);
    actionAbortController?.abort(reason);
    pendingVariableWrites = [];
    generation += 1;
    if (action) emit('action.cancel', {reason});
    runId += 1;
    runPromise = null;
    try {
      releaseStructuredAction(reason);
      endStructuredStory('runtime-finished');
    } catch (error) {
      fail(error);
      return Promise.resolve(snapshot());
    }
    currentActionIndex = ((currentScene()?.actions ?? []) as ReadonlyArray<unknown>).length;
    actionAbortController = null;
    status = 'finished';
    emit('navigation.advanceScene', {fromStoryPath, toStoryPath: null, reason});
    emit('runtime.finish');
    return Promise.resolve(snapshot());
  }

  /** Move to an action start without executing it or restoring non-position state. */
  function reposition(
    sceneId: string,
    {
      actionIndex = 0,
      reason = 'navigation.reposition',
    }: {actionIndex?: number; reason?: string} = {},
  ): Readonly<Record<string, unknown>> {
    if (status !== 'running' && status !== 'paused' && status !== 'finished') return snapshot();
    const target = resolvePosition(sceneId, actionIndex);
    if (!target) {
      fail(
        Object.assign(new Error(`Invalid navigation target: ${sceneId} action ${actionIndex}`), {
          code: 'K4-RUNTIME-NAVIGATION-001',
        }),
      );
      return snapshot();
    }

    const fromStoryPath = storyPathAt(currentSceneIndex, currentActionIndex);
    const wasRunning = status === 'running';
    const action = currentAction();
    finishPresentationTransitions(reason);
    if (wasRunning) actionAbortController?.abort(reason);
    pendingVariableWrites = [];
    generation += 1;
    if (wasRunning && action) emit('action.cancel', {reason});
    try {
      beginStructuredStory();
      releaseStructuredAction(reason);
      const targetScene = scenes[target.sceneIndex];
      if (targetScene) applyPosePreviewMirroring(targetScene);
      bindStructuredScene(sceneId, actionIndex);
    } catch (error) {
      fail(error);
      return snapshot();
    }
    actionAbortController = null;
    runId += 1;
    runPromise = null;
    assetCoordinator?.beginScene(sceneId, generation);
    currentSceneIndex = target.sceneIndex;
    currentActionIndex = actionIndex;
    status = 'paused';
    emit('navigation.reposition', {
      fromStoryPath,
      toStoryPath: storyPathAt(currentSceneIndex, currentActionIndex),
      reason,
    });
    return snapshot();
  }

  /** Resume normal execution from the action selected by reposition. */
  function resume(
    reason: string = 'navigation.resume',
  ): Promise<Readonly<Record<string, unknown>>> {
    if (status !== 'paused') return Promise.resolve(snapshot());
    const targetActionIndex = currentActionIndex;
    generation += 1;
    emit('runtime.resume', {
      storyPath: storyPathAt(currentSceneIndex, targetActionIndex),
      reason,
    });
    status = 'running';
    currentActionIndex = targetActionIndex - 1;
    runId += 1;
    runPromise = run(runId);
    return runPromise;
  }

  /** Move execution to a scene/action boundary without restoring non-position variables. */
  function navigate(
    sceneId: string,
    {actionIndex = 0, reason = 'navigation'}: {actionIndex?: number; reason?: string} = {},
  ): Promise<Readonly<Record<string, unknown>>> {
    if (status !== 'running') return Promise.resolve(snapshot());
    const target = resolvePosition(sceneId, actionIndex);
    if (!target) {
      fail(
        Object.assign(new Error(`Invalid navigation target: ${sceneId} action ${actionIndex}`), {
          code: 'K4-RUNTIME-NAVIGATION-001',
        }),
      );
      return Promise.resolve(snapshot());
    }

    const action = currentAction();
    finishPresentationTransitions(reason);
    actionAbortController?.abort(reason);
    pendingVariableWrites = [];
    generation += 1;
    if (action) emit('action.cancel', {reason});
    try {
      releaseStructuredAction(reason);
    } catch (error) {
      fail(error);
      return Promise.resolve(snapshot());
    }
    runId += 1;
    const activeRunId = runId;
    runPromise = (async () => {
      if (!(await enterScene(sceneId, reason, activeRunId, actionIndex))) return snapshot();
      return run(activeRunId);
    })();
    return runPromise;
  }

  function awaitCancelledActionCleanup(
    request: QuiesceRequest,
    activeRun: Promise<Readonly<Record<string, unknown>>>,
  ) {
    const timeout = deferred();
    try {
      const cancelTimeout = scheduleQuiesceTimeout(
        () => timeout.resolve('timeout'),
        quiesceTimeoutMs,
      );
      if (typeof cancelTimeout !== 'function') {
        throw new TypeError('scheduleQuiesceTimeout must return a cancel function');
      }
      request.cancelTimeout = cancelTimeout;
    } catch {
      fail(
        quiesceError(
          'K4-RELOAD-QUIESCE-FAILED',
          'Live reload quiesce timeout could not be scheduled',
        ),
      );
      return;
    }

    void Promise.race([Promise.resolve(activeRun).then(() => 'settled'), timeout.promise]).then(
      (outcome) => {
        if (quiesceRequest !== request || request.phase !== 'quiescing') return;
        if (outcome === 'timeout') {
          fail(
            quiesceError(
              'K4-RELOAD-QUIESCE-TIMEOUT',
              'Live reload action cleanup exceeded the quiesce timeout',
            ),
          );
          return;
        }
        if (request.resumeRequested) {
          const error = new Error('Live reload quiesce was cancelled');
          error.name = 'AbortError';
          rejectQuiesce(error);
          if (status === 'paused') void resume('live-reload-esc');
          return;
        }
        if (status !== 'paused') {
          rejectQuiesce(
            quiesceError(
              'K4-RELOAD-QUIESCE-FAILED',
              'Runtime did not reach a safe replay boundary',
            ),
          );
          return;
        }
        completeQuiesce(currentSceneIndex, currentActionIndex, 'replay-action', false);
      },
    );
  }

  /** Close the next-action dispatch gate and publish one immutable cleanup-complete boundary. */
  function quiesce({
    candidateId,
    mode,
    bounded = false,
  }: {
    candidateId: number;
    mode: 'finish-only' | 'cancel-replay-safe';
    bounded?: boolean;
  }) {
    if (!Number.isSafeInteger(candidateId) || candidateId < 1) {
      return Promise.reject(new TypeError('quiesce candidateId must be a positive safe integer'));
    }
    if (mode !== 'finish-only' && mode !== 'cancel-replay-safe') {
      return Promise.reject(new TypeError('quiesce mode is invalid'));
    }
    if (controllerDisposed) {
      return Promise.reject(new TypeError('DSL 4.0 runtime controller is disposed'));
    }
    if (quiesceRequest) {
      quiesceRequest.candidateId = candidateId;
      if (quiesceRequest.phase === 'token') {
        if (!quiesceRequest.token) {
          return Promise.reject(new TypeError('live reload quiesce token is missing'));
        }
        quiesceRequest.token = retagDsl4QuiesceToken(quiesceRequest.token, candidateId);
        return Promise.resolve(quiesceRequest.token);
      }
      return quiesceRequest.completion.promise;
    }
    if (status === 'failed' || status === 'stopped' || status === 'idle') {
      return Promise.reject(
        quiesceError('K4-RELOAD-QUIESCE-FAILED', 'Runtime is not resumable for live reload'),
      );
    }

    const completion = deferred();
    const request: QuiesceRequest = {
      candidateId,
      mode,
      phase: 'quiescing',
      token: null,
      completion,
      resumeRequested: false,
      cancelTimeout: () => {},
    };
    quiesceRequest = request;

    if (status === 'finished') {
      completeQuiesce(currentSceneIndex, currentActionIndex, 'finished', false);
      return completion.promise;
    }
    if (status === 'paused') {
      completeQuiesce(currentSceneIndex, currentActionIndex, 'next-action', false);
      return completion.promise;
    }

    const activeRun = runPromise;
    if (!activeRun) {
      rejectQuiesce(
        quiesceError('K4-RELOAD-QUIESCE-FAILED', 'Runtime has no active execution to quiesce'),
      );
      return completion.promise;
    }
    const hasActiveAction = actionAbortController !== null && currentAction() !== null;
    const debugPaused = debugExecution?.getState().paused === true;
    if (hasActiveAction && (mode === 'cancel-replay-safe' || debugPaused)) {
      const sceneId = String(currentScene()?.id ?? '');
      const actionIndex = currentActionIndex;
      reposition(sceneId, {actionIndex, reason: 'live-reload-quiesce'});
      if (quiesceRequest === request && request.phase === 'quiescing') {
        awaitCancelledActionCleanup(request, activeRun);
      }
      return completion.promise;
    }

    if (bounded && mode === 'finish-only') {
      try {
        const cancelTimeout = scheduleQuiesceTimeout(() => {
          if (quiesceRequest === request && request.phase === 'quiescing')
            rejectQuiesce(
              quiesceError('K4-SAVE-QUIESCE-TIMEOUT', 'Save point wait exceeded its timeout'),
            );
        }, quiesceTimeoutMs);
        if (typeof cancelTimeout !== 'function')
          throw new TypeError('Invalid timeout cancellation');
        request.cancelTimeout = cancelTimeout;
      } catch (error) {
        rejectQuiesce(error);
        return completion.promise;
      }
    }
    void Promise.resolve(activeRun).then(() => {
      if (quiesceRequest !== request || request.phase !== 'quiescing') return;
      if (status === 'finished') {
        completeQuiesce(currentSceneIndex, currentActionIndex, 'finished', false);
        return;
      }
      if (status !== 'paused') {
        rejectQuiesce(
          quiesceError(
            'K4-RELOAD-QUIESCE-FAILED',
            'Runtime did not reach a safe dispatch boundary',
          ),
        );
      }
    });
    return completion.promise;
  }

  async function resumeQuiesce(candidateId: number) {
    const request = quiesceRequest;
    if (!request || request.candidateId !== candidateId) {
      throw new TypeError('live reload quiesce candidate is stale or missing');
    }
    if (request.phase === 'quiescing') {
      request.resumeRequested = true;
      if (request.mode === 'finish-only') {
        const error = new Error('Live reload quiesce was cancelled');
        error.name = 'AbortError';
        rejectQuiesce(error);
        return snapshot();
      }
      try {
        await request.completion.promise;
      } catch {
        return snapshot();
      }
      return snapshot();
    }
    if (request.phase !== 'token') {
      throw new TypeError('live reload quiesce candidate is not resumable');
    }
    quiesceRequest = null;
    if (status === 'paused') void resume('live-reload-esc');
    return snapshot();
  }

  function validateCheckpoint(
    checkpoint: Readonly<{
      sceneId: string;
      actionIndex: number;
      variables: Readonly<Record<string, string | number | boolean>>;
      status: 'paused' | 'finished';
    }>,
  ) {
    const index = sceneIndex.get(checkpoint.sceneId);
    const scene = index === undefined ? undefined : scenes[index];
    const actions = (scene?.actions ?? []) as readonly unknown[];
    if (
      controllerDisposed ||
      index === undefined ||
      !Number.isSafeInteger(checkpoint.actionIndex) ||
      checkpoint.actionIndex < 0 ||
      (checkpoint.status === 'finished'
        ? index !== scenes.length - 1 || checkpoint.actionIndex !== actions.length
        : checkpoint.actionIndex >= actions.length)
    )
      throw new TypeError('Saved runtime position is not valid for this story');
    resolveStartVariables(checkpoint.variables);
    return {sceneIndex: index};
  }

  return Object.freeze({
    validateRestoreCheckpoint(
      checkpoint: Readonly<{
        sceneId: string;
        actionIndex: number;
        variables: Readonly<Record<string, string | number | boolean>>;
        status: 'paused' | 'finished';
      }>,
    ) {
      validateCheckpoint(checkpoint);
    },
    async prepareRestoreCheckpoint(
      checkpoint: Readonly<{
        sceneId: string;
        actionIndex: number;
        variables: Readonly<Record<string, string | number | boolean>>;
        status: 'paused' | 'finished';
      }>,
      signal: AbortSignal,
      sequenceStart = 0,
    ) {
      const target = validateCheckpoint(checkpoint);
      const restoredVariables = resolveStartVariables(checkpoint.variables);
      const preparedGeneration = generation;
      const nextGeneration = generation + 1;
      let stagedIntegration: StructuredDataIntegration | undefined;
      let stagedScene: Readonly<Record<string, unknown>> | null = null;
      let previousIntegration: StructuredDataIntegration | undefined;
      let committed = false,
        cancelled = false;
      function active() {
        if (controllerDisposed || signal.aborted || cancelled || generation !== preparedGeneration)
          throw new DOMException('Runtime restore was superseded', 'AbortError');
      }
      const cancel = () => {
        if (!committed) {
          cancelled = true;
          assetCoordinator?.cancel('save-restore-cancelled');
        }
      };
      signal.addEventListener('abort', cancel, {once: true});
      try {
        active();
        if (structuredDataIntegration) {
          if (!createRestoreStructuredDataIntegration)
            throw new TypeError('Restore requires an isolated Structured Data factory');
          const createdIntegration = createRestoreStructuredDataIntegration();
          if (createdIntegration === structuredDataIntegration)
            throw new TypeError('Restore factory must return an independent Structured Data owner');
          stagedIntegration = createdIntegration;
          retainedRestoreIntegrations.add(stagedIntegration);
          active();
          if (checkpoint.status !== 'finished') {
            stagedIntegration.beginStory();
            const entered = stagedIntegration.enterScene(checkpoint.sceneId, {
              actionIndex: checkpoint.actionIndex,
            });
            if (
              !isRecord(entered) ||
              !isRecord(entered.scene) ||
              entered.scene.id !== checkpoint.sceneId
            )
              throw new TypeError('Invalid restored Structured Data scene');
            stagedScene = entered.scene;
          }
        }
        if (assetCoordinator) {
          const startup = await assetCoordinator.prepareStartup(nextGeneration);
          active();
          if (!startup.ok)
            throw 'error' in startup
              ? startup.error
              : new DOMException('Restore cancelled', 'AbortError');
          assetCoordinator.beginScene(checkpoint.sceneId, nextGeneration);
          const ready = await assetCoordinator.waitForScene(checkpoint.sceneId);
          active();
          if (!ready.ok)
            throw 'error' in ready
              ? ready.error
              : new DOMException('Restore cancelled', 'AbortError');
        }
      } catch (error) {
        cancel();
        signal.removeEventListener('abort', cancel);
        if (stagedIntegration)
          try {
            releaseRestoreIntegration(stagedIntegration);
          } catch (cleanupError) {
            throw new AggregateError(
              [error, cleanupError],
              'Structured restore preparation and cleanup failed',
            );
          }
        throw error;
      }
      return Object.freeze({
        async commit(adopt: () => void = () => {}) {
          active();
          if (assetCoordinator)
            await assetCoordinator.commitScene(checkpoint.sceneId, 'save-restore');
          active();
          if (stagedIntegration) {
            previousIntegration = structuredDataIntegration;
            if (previousIntegration) retainedRestoreIntegrations.add(previousIntegration);
            structuredDataIntegration = stagedIntegration;
            retainedRestoreIntegrations.delete(stagedIntegration);
            structuredScene = stagedScene;
            structuredStoryActive = checkpoint.status !== 'finished';
            structuredActionActive = false;
            structuredAction = null;
            structuredActionResources = null;
          }
          if (presentationEffectsEnabled) finishPresentationTransitions('save-restore');
          abandonQuiesce('save-restore');
          actionAbortController?.abort('save-restore');
          actionAbortController = null;
          pendingVariableWrites = [];
          variables = restoredVariables;
          failureDiagnostic = null;
          failureContext = null;
          currentSceneIndex = target.sceneIndex;
          currentActionIndex = checkpoint.actionIndex;
          generation = nextGeneration;
          runId += 1;
          runPromise = null;
          sequence = sequenceStart;
          status = checkpoint.status;
          assetsReleased = false;
          committed = true;
          signal.removeEventListener('abort', cancel);
          adopt();
          emit('runtime.restore');
          return snapshot();
        },
        cancel() {
          cancel();
          signal.removeEventListener('abort', cancel);
          if (stagedIntegration && !committed) releaseRestoreIntegration(stagedIntegration);
        },
        finalize() {
          if (previousIntegration) releaseRestoreIntegration(previousIntegration);
        },
      });
    },
    start,
    stop,
    invokeAction,
    queueVariableWrite,
    rejectActionInvocation,
    canAdvance,
    canRehearsalSkip,
    acceptAdvanceInput,
    consumeAdvanceInput,
    advance,
    skipPose,
    skipAction,
    skipScene,
    advanceScene,
    navigate,
    reposition,
    resume,
    quiesce,
    resumeQuiesce,
    getState: snapshot,
    getTrace() {
      return deepFreeze(trace.map((event) => cloneValue(event)));
    },
    getRunPromise() {
      return runPromise;
    },
    hasPendingRestoreCleanup: () => retainedRestoreIntegrations.size > 0,
    retryRestoreCleanup,
    dispose() {
      const errors: unknown[] = [];
      if (!controllerDisposed) {
        try {
          stop('dispose');
        } catch (error) {
          errors.push(error);
        }
        controllerDisposed = true;
        if (structuredDataIntegration) retainedRestoreIntegrations.add(structuredDataIntegration);
        structuredDataIntegration = undefined;
        structuredScene = null;
        structuredAction = null;
        structuredActionResources = null;
        structuredStoryActive = false;
        structuredActionActive = false;
      }
      try {
        retryRestoreCleanup();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length)
        throw new AggregateError(errors, 'Runtime Structured Data disposal failed');
    },
  });
}
