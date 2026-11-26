import {computeDsl4Sha256Integrity} from '../source-descriptor.js';
import {createDsl4RetryableCleanup} from '../retryable-cleanup.js';
import {
  createDsl4CreationCleanup,
  cleanupDsl4FailedCreation,
  dsl4FailedCreationCleanupSteps,
  getDsl4CreationCleanup,
} from '../creation-cleanup.js';
import type {Dsl4NavigationSessionSurface} from '../navigation-session-surface.js';
import {createDsl4NavigationSession} from '../navigation-session.js';
import {resolveDsl4FeatureFlags} from '../runtime-startup.js';
import {deepFreeze} from '../story-document.js';
import {createDsl4RuntimeVariableSnapshot} from '../runtime-variable-surface.js';
import {createDsl4TurboWarpRuntimeEnvironment} from './turbowarp-runtime-host.js';
import {createDsl4TurboWarpTransitionPort} from './turbowarp-transition-port.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The navigation session this factory creates, as far as it inspects the result. */
type Dsl4PreviewNavigationSession = ReturnType<typeof createDsl4NavigationSession>;

/** The debug execution surface the navigation session accepts, named where this factory forwards it. */
type Dsl4NavigationDebugExecution = NonNullable<
  Parameters<typeof createDsl4NavigationSession>[0]['debugExecution']
>;

/**
 * What the `runtime.fail` observer reaches for on the navigation session it is still creating.
 *
 * `onEvent` can fire during `createDsl4NavigationSession`, before `created` is assigned, so the
 * lookup stays optional. Once the call returns, a successful result carries `session`, which is the
 * same member the `ok` check below reads.
 */
interface Dsl4PreviewCreatedSession {
  session?: Pick<Dsl4NavigationSessionSurface, 'getState'>;
}

/** The failure detail the observer lifts out of the session state onto a `runtime.fail` event. */
interface Dsl4PreviewSessionState {
  runtime?: {diagnostic?: unknown};
  diagnostic?: unknown;
}

/** The runtime environment options this factory forwards wholesale, so the two never drift apart. */
type Dsl4TurboWarpRuntimeEnvironmentOptions = Parameters<
  typeof createDsl4TurboWarpRuntimeEnvironment
>[0];

/** The runtime component a preview session drives, as far as this factory reads it. */
interface Dsl4PreviewRuntimeComponent extends Readonly<Record<string, unknown>> {
  readonly storyDocument: Readonly<Record<string, unknown>>;
  readonly runtimeArtifact: Readonly<{controlProfile: string}> & Readonly<Record<string, unknown>>;
  readonly assetBundle: Readonly<Record<string, unknown>>;
}

/**
 * The options this factory reads. It forwards the whole object to the runtime environment, so it
 * carries that contract and adds only the members it reads itself. Every injected surface is
 * validated before it is used.
 */
type Dsl4PreviewSessionOptions = Dsl4TurboWarpRuntimeEnvironmentOptions & {
  featureFlags?: unknown;
  runtimeComponent?: unknown;
  resetManagedPresentation: () => unknown | Promise<unknown>;
  resolveRuntimeComponent?: (request: Readonly<Record<string, unknown>>) => unknown;
  onEvent?: (event: Readonly<Record<string, unknown>>) => unknown;
  inputTarget?: unknown;
  stagePointerTarget?: unknown;
  runtimeVersion?: unknown;
};

function validateRuntimeComponent(value: unknown) {
  if (!isRecord(value)) throw new TypeError('preview runtimeComponent must be an object');
  const component = value as unknown as Dsl4PreviewRuntimeComponent;
  if (
    !isRecord(component.storyDocument) ||
    component.storyDocument.kind !== 'StoryDocument' ||
    component.storyDocument.version !== '4.0' ||
    !isRecord(component.runtimeArtifact) ||
    typeof component.runtimeArtifact.controlProfile !== 'string' ||
    component.runtimeArtifact.controlProfile.length === 0 ||
    !isRecord(component.assetBundle)
  ) {
    throw new TypeError(
      'preview runtimeComponent must provide a validated StoryDocument, runtime artifact, and asset bundle',
    );
  }
  return component;
}

function validateSessionContext(value: unknown) {
  if (!isRecord(value)) throw new TypeError('preview runtime session context must be an object');
  const storyDocument = isRecord(value.storyDocument) ? value.storyDocument : null;
  if (storyDocument?.kind !== 'StoryDocument' || storyDocument.version !== '4.0') {
    throw new TypeError('preview runtime session requires a DSL 4.0 StoryDocument');
  }
  if (value.previousSession !== null && !isRecord(value.previousSession)) {
    throw new TypeError('preview runtime previousSession must be an object or null');
  }
  if (typeof value.preserveManagedPresentation !== 'boolean') {
    throw new TypeError('preview runtime preserveManagedPresentation must be boolean');
  }
  if (value.preserveManagedPresentation && value.previousSession === null) {
    throw new TypeError('preview runtime cannot preserve presentation without a previous session');
  }
  return {
    storyDocument,
    preserveManagedPresentation: value.preserveManagedPresentation,
  };
}

/** Make one navigation session the sole owner of its TurboWarp runtime environment. */
function ownRuntimeEnvironment(
  session: Dsl4NavigationSessionSurface,
  environment: Readonly<{
    dispose: (reason?: string) => unknown;
    getPoseState?: () => unknown;
    hasPendingCleanup?: () => boolean;
  }>,
  runtimeVersion: unknown,
  stateSurfaceEnabled: boolean,
): Dsl4NavigationSessionSurface {
  const cleanup = createDsl4RetryableCleanup({
    message: 'DSL 4.0 preview runtime session disposal failed',
    parallel: true,
    steps: [
      {run: () => session.dispose(), isPending: () => session.hasPendingCleanup?.() ?? false},
      {
        run: (reason) => environment.dispose(reason),
        isPending: () => environment.hasPendingCleanup?.() ?? false,
      },
    ],
  });
  return Object.freeze({
    ...session,
    getRuntimeVariableSnapshot() {
      if (!stateSurfaceEnabled) return null;
      return createDsl4RuntimeVariableSnapshot(session.getState().runtime, {
        poseState: environment.getPoseState?.() ?? null,
        version: runtimeVersion,
      });
    },
    dispose: cleanup.run,
    hasPendingCleanup: cleanup.hasPendingCleanup,
  });
}

function createDefaultHostPort(context: Readonly<{runtimeHost: unknown}>) {
  return createDsl4TurboWarpTransitionPort({runtimeHost: context.runtimeHost});
}

/**
 * Create the concrete session factory consumed by the browser preview runtime bridge.
 *
 * The base component contributes only immutable runtime/asset artifacts. Each source generation
 * supplies its already-validated StoryDocument and is never parsed again in the browser.
 *
 * @param {object} optionsInput
 * @param {(context: Readonly<{storyDocument: Readonly<Record<string, unknown>>, baseComponent: Readonly<Record<string, unknown>>}>) => Readonly<Record<string, unknown>> | Promise<Readonly<Record<string, unknown>>>} [optionsInput.resolveRuntimeComponent]
 * The factory answers a session builder: given a StoryDocument, the previous session to replace,
 * and whether the managed presentation survives, it resolves the next preview session.
 */
export function createDsl4TurboWarpPreviewSessionFactory(optionsInput: unknown) {
  if (!isRecord(optionsInput)) {
    throw new TypeError('TurboWarp preview session options are required');
  }
  const options = optionsInput as unknown as Dsl4PreviewSessionOptions;
  const featureFlags = resolveDsl4FeatureFlags(options.featureFlags);
  if (!featureFlags.dsl4Runtime) {
    throw new TypeError('TurboWarp preview sessions require the dsl4Runtime feature flag');
  }
  const runtimeComponent = validateRuntimeComponent(options.runtimeComponent);
  if (typeof options.resetManagedPresentation !== 'function') {
    throw new TypeError('resetManagedPresentation must be a function');
  }
  if (
    options.resolveRuntimeComponent !== undefined &&
    typeof options.resolveRuntimeComponent !== 'function'
  ) {
    throw new TypeError('resolveRuntimeComponent must be a function');
  }
  if (options.onEvent !== undefined && typeof options.onEvent !== 'function') {
    throw new TypeError('onEvent must be a function');
  }
  if (
    featureFlags.dsl4Debugger &&
    (!isRecord(options.debugExecution) ||
      typeof options.debugExecution.beforeAction !== 'function' ||
      typeof options.debugExecution.getState !== 'function')
  ) {
    throw new TypeError('debugExecution is required when dsl4Debugger is enabled');
  }

  async function createConcreteSession(storyDocument: Readonly<Record<string, unknown>>) {
    const generationComponent = validateRuntimeComponent(
      options.resolveRuntimeComponent
        ? await options.resolveRuntimeComponent(
            Object.freeze({storyDocument, baseComponent: runtimeComponent}),
          )
        : Object.freeze({...runtimeComponent, storyDocument}),
    );
    if (generationComponent.storyDocument !== storyDocument) {
      throw new TypeError(
        'resolved preview runtime component must use the requested StoryDocument',
      );
    }
    let runtimeLifecycleObserver: ((event: Readonly<Record<string, unknown>>) => void) | null =
      null;
    const environment = await createDsl4TurboWarpRuntimeEnvironment(
      {
        ...options,
        createHostPort: options.createHostPort ?? createDefaultHostPort,
      },
      generationComponent,
      () => {},
      () => {},
      (observer) => {
        runtimeLifecycleObserver = observer;
      },
      featureFlags.dsl4PoseFeedbackModes,
      featureFlags.dsl4PosePreviewMirroring,
      featureFlags.dsl4CameraPreviewControls,
      featureFlags.dsl4SpeechAdvanceTypewriter,
    );

    let created: Dsl4PreviewNavigationSession;
    let navigationOwner: Dsl4NavigationSessionSurface | null = null;
    try {
      const recognition = isRecord(storyDocument.recognition) ? storyDocument.recognition : {};
      const posePreview = isRecord(recognition.preview) ? recognition.preview : {};
      const posePreviewControls = isRecord(posePreview.controls) ? posePreview.controls : {};
      const cameraMirroringControlEnabled =
        featureFlags.dsl4CameraPreviewControls && isRecord(posePreviewControls.mirroring);
      created = createDsl4NavigationSession({
        storyDocument,
        saveIdentity: {
          storyId: String(
            (storyDocument.metadata as Record<string, unknown> | undefined)?.sourceId ?? 'preview',
          ),
          sourceIntegrity: await computeDsl4Sha256Integrity(
            new TextEncoder().encode(JSON.stringify(storyDocument)),
          ),
        },
        controlProfile: String(runtimeComponent.runtimeArtifact.controlProfile),
        historyNavigationAvailable: options.historyNavigationAvailable ?? false,
        historyLimits: options.historyLimits,
        port: environment.port,
        debugExecution: featureFlags.dsl4Debugger
          ? (options.debugExecution as Dsl4NavigationDebugExecution)
          : undefined,
        assetLifecycle: environment.assetLifecycle,
        evaluateCondition: environment.evaluateCondition,
        onEvent(event) {
          try {
            runtimeLifecycleObserver?.(event);
          } catch {
            // Internal UI observers cannot change runtime execution or suppress consumer events.
          }
          if (event.type === 'runtime.fail') {
            const state = (
              created as Dsl4PreviewCreatedSession | undefined
            )?.session?.getState?.() as Dsl4PreviewSessionState | undefined;
            const diagnostic = state?.runtime?.diagnostic ?? state?.diagnostic;
            const details = isRecord(event.details) ? event.details : {};
            options.onEvent?.(
              diagnostic && isRecord(diagnostic)
                ? {...event, diagnostic: {...diagnostic, failureContext: details.failureContext}}
                : event,
            );
            return;
          }
          options.onEvent?.(event);
        },
        onInputError: options.onInputError,
        poseNavigationPolicyEnabled: featureFlags.dsl4PoseFeedbackModes,
        structuredDataIntegrationEnabled: featureFlags.structuredDataIntegrationEnabled,
        posePreviewMirroringEnabled:
          featureFlags.dsl4PosePreviewMirroring || cameraMirroringControlEnabled,
        cameraPreviewControlsEnabled: featureFlags.dsl4CameraPreviewControls,
        speechAdvanceTypewriterEnabled: featureFlags.dsl4SpeechAdvanceTypewriter,
        turboWarpBubbleAdvancedPresentationEnabled:
          featureFlags.dsl4TurboWarpBubbleAdvancedPresentation,
        broadcastMessageAndWaitEnabled: featureFlags.dsl4BroadcastMessageAndWait,
        crossfadeTransitionsEnabled: featureFlags.dsl4CrossfadeTransitions,
        presentationEffectsEnabled: featureFlags.dsl4PresentationEffects,
        narrativeControlEnabled: featureFlags.dsl4NarrativeControl,
      });
      if (!created.ok) {
        const failure = new TypeError(
          'preview StoryDocument is incompatible with the base runtime',
        );
        Object.defineProperty(failure, 'diagnostics', {value: created.diagnostics});
        throw failure;
      }

      const navigationSession = (created as unknown as {session: Dsl4NavigationSessionSurface})
        .session;
      navigationOwner = navigationSession;
      if (options.inputTarget !== undefined) {
        navigationSession.attach(options.inputTarget);
      }
      if (featureFlags.dsl4SpeechAdvanceTypewriter && options.stagePointerTarget !== undefined) {
        navigationSession.attachStagePointer(options.stagePointerTarget);
      }
      const owned = ownRuntimeEnvironment(
        navigationSession,
        environment,
        options.runtimeVersion,
        featureFlags.dsl4TurboWarpStateSurface,
      );
      return owned;
    } catch (error) {
      const cleanup = createDsl4CreationCleanup(
        [
          ...dsl4FailedCreationCleanupSteps(error),
          {
            run: () => navigationOwner?.dispose(),
            isPending: () => navigationOwner?.hasPendingCleanup?.() ?? false,
          },
          {
            run: (reason) => environment.dispose(reason),
            isPending: () => environment.hasPendingCleanup?.() ?? false,
          },
        ],
        'DSL 4.0 preview creation cleanup failed',
        true,
      );
      await cleanupDsl4FailedCreation(
        error,
        cleanup,
        'preview-session-creation-failed',
        'DSL 4.0 preview session creation failed',
      );
      throw error;
    }
  }

  return async function createPreviewSession(contextInput: unknown) {
    const context = validateSessionContext(contextInput);
    let concreteSession: Dsl4NavigationSessionSurface | null = null;
    let initializationPromise: Promise<Dsl4NavigationSessionSurface> | null = null;
    let runPromise: Promise<unknown> | null = null;
    let failedCleanup: ReturnType<typeof getDsl4CreationCleanup> = null;
    let initializationSettled = false;
    let joinInitializationCleanup = false;
    let stopReason: string | null = null;
    let status = 'idle';
    let disposed = false;

    function snapshot() {
      if (concreteSession) return concreteSession.getState();
      return deepFreeze({
        runtime: {
          status,
          sceneId: null,
          actionIndex: 0,
          actionPath: null,
          variables: isRecord(context.storyDocument.variables)
            ? {...context.storyDocument.variables}
            : {},
          generation: 0,
        },
        disposed,
      });
    }

    function disposedError() {
      return new TypeError('TurboWarp preview runtime session is disposed');
    }

    function initialize() {
      if (initializationPromise) return initializationPromise;
      status = 'starting';
      initializationPromise = Promise.resolve()
        .then(async () => {
          if (disposed) throw disposedError();
          if (!context.preserveManagedPresentation) {
            await options.resetManagedPresentation();
          }
          if (disposed) throw disposedError();
          const created = await createConcreteSession(context.storyDocument);
          concreteSession = created;
          if (disposed) {
            const failure = disposedError();
            // The already-published dispose attempt owns the late session.
            throw failure;
          }
          status = stopReason === null ? 'ready' : 'stopped';
          return created;
        })
        .catch((error) => {
          failedCleanup = getDsl4CreationCleanup(error);
          if (!disposed) status = 'failed';
          throw error;
        })
        .finally(() => {
          initializationSettled = true;
        });
      return initializationPromise;
    }

    const cleanup = createDsl4RetryableCleanup({
      message: 'DSL 4.0 lazy preview disposal failed',
      parallel: true,
      steps: [
        {
          async run(reason) {
            const joinInitial = joinInitializationCleanup;
            joinInitializationCleanup = false;
            try {
              await initializationPromise;
            } catch {
              /* Keep the initialization error with start(). */
            }
            if (joinInitial) await (failedCleanup?.completion ?? failedCleanup?.dispose(reason));
            else await failedCleanup?.dispose(reason);
          },
          isPending: () => failedCleanup?.hasPendingCleanup() ?? false,
        },
        {
          async run(reason) {
            try {
              await initializationPromise;
            } catch {
              /* Partial creation has its own owner above. */
            }
            await concreteSession?.dispose(reason);
          },
          isPending: () => concreteSession?.hasPendingCleanup?.() ?? false,
        },
      ],
    });

    return Object.freeze({
      async captureSave() {
        if (disposed) throw disposedError();
        const session = await initialize();
        if (disposed) throw disposedError();
        if (!session.captureSave) throw new TypeError('Save is unavailable');
        return session.captureSave();
      },
      async exportSave() {
        if (disposed) throw disposedError();
        const session = await initialize();
        if (disposed) throw disposedError();
        if (!session.exportSave) throw new TypeError('Save is unavailable');
        return session.exportSave();
      },
      async restore(save: unknown) {
        if (disposed) throw disposedError();
        const session = await initialize();
        if (disposed) throw disposedError();
        if (!session.restore) throw new TypeError('Restore is unavailable');
        return session.restore(save);
      },
      async retrySaveCleanup() {
        if (disposed) throw disposedError();
        const session = await initialize();
        if (disposed) throw disposedError();
        if (!session.retrySaveCleanup) throw new TypeError('Save cleanup is unavailable');
        return session.retrySaveCleanup();
      },
      start(startOptions?: Readonly<Record<string, unknown>>) {
        if (disposed) return Promise.reject(disposedError());
        if (runPromise) return runPromise;
        runPromise = initialize().then((session) => {
          if (disposed || stopReason !== null) return snapshot();
          status = 'running';
          return session.start(startOptions);
        });
        return runPromise;
      },
      stop(reason: string = 'stop') {
        if (disposed) return snapshot();
        if (stopReason === null) stopReason = reason;
        status = 'stopped';
        return concreteSession ? concreteSession.stop(reason) : snapshot();
      },
      dispose(reason: string = 'dispose') {
        if (typeof reason !== 'string' || reason.length === 0) {
          return cleanup.run(reason);
        }
        if (!disposed)
          joinInitializationCleanup = initializationPromise !== null && !initializationSettled;
        disposed = true;
        status = 'disposing';
        const operation = cleanup.run(reason);
        void operation.then(
          () => {
            status = 'disposed';
          },
          () => {
            status = 'cleanup-failed';
          },
        );
        return operation;
      },
      hasPendingCleanup: cleanup.hasPendingCleanup,
      getState: snapshot,
      getRuntimeVariableSnapshot() {
        if (!featureFlags.dsl4TurboWarpStateSurface) return null;
        if (!concreteSession?.getRuntimeVariableSnapshot) {
          return createDsl4RuntimeVariableSnapshot(snapshot().runtime);
        }
        return concreteSession.getRuntimeVariableSnapshot();
      },
      invokeAction(action: Readonly<Record<string, unknown>>) {
        if (disposed) return Promise.reject(disposedError());
        return initialize().then((session) => {
          if (disposed) throw disposedError();
          return session.invokeAction(action);
        });
      },
      queueVariableWrite(request: unknown) {
        if (disposed || !concreteSession) {
          return deepFreeze({accepted: false, code: 'K4-VARIABLE-WRITE-INACTIVE'});
        }
        return concreteSession.queueVariableWrite(request);
      },
      rejectActionInvocation(error: unknown) {
        if (disposed) return Promise.reject(disposedError());
        return initialize().then((session) => {
          if (disposed) throw disposedError();
          return session.rejectActionInvocation(error);
        });
      },
      quiesce(quiesceOptions: {candidateId: number}) {
        if (disposed) return Promise.reject(disposedError());
        return initialize().then((session) => {
          if (disposed) throw disposedError();
          return session.quiesce(quiesceOptions);
        });
      },
      resumeQuiesce(candidateId: number) {
        if (disposed) return Promise.reject(disposedError());
        return initialize().then((session) => {
          if (disposed) throw disposedError();
          return session.resumeQuiesce(candidateId);
        });
      },
    });
  };
}
