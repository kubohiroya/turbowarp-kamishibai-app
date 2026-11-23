import type {TurboWarpDebuggerLog} from '@kubohiroya/turbowarp-runtime-adapter';
import {bindDsl4ProjectSourceFrontend} from '../../dist/dsl4/source-frontend.js';
import {getRuntimeControlsDock} from '@kubohiroya/turbowarp-app-shell';
import type {KamishibaiDsl4RuntimeExtension} from './dsl4-runtime-extension-entry.js';
import {createDsl4WebPreviewShell} from '../../dist/builder/dsl4-web-preview-shell.js';
import {
  createDsl4BrowserPreviewStoryFileProject,
  inspectDsl4BrowserPreviewSupport,
} from '../../dist/dsl4/browser-preview-source-adapter.js';
import {createDsl4DebugExecutionCoordinator} from '../../dist/dsl4/debug-execution.js';
import {dsl4NonEmbeddedDevelopmentFeatureFlags} from '../../dist/dsl4/feature-flags.js';
import {createDsl4LiveReloadSession} from '../../dist/dsl4/live-reload-session.js';
import {
  createDsl4BrowserDistributionFilename,
  createDsl4BrowserDistributionSb3,
  requestDsl4BrowserDistributionSaveTarget,
  saveDsl4BrowserDistributionSb3,
} from '../../dist/dsl4/platform/browser-distribution-build.js';
import {createDsl4BrowserPreviewRuntimeComponent} from '../../dist/dsl4/platform/browser-preview-runtime-component.js';
import {
  buildDsl4BrowserSelectedStoryProject,
  collectDsl4BrowserDroppedFiles,
  collectDsl4BrowserDirectoryFiles,
} from '../../dist/dsl4/platform/browser-story-file-loader.js';
import {
  type Dsl4PlaybackRuntimeSite,
  fetchDsl4PlaybackRuntime,
} from '../../dist/dsl4/platform/playback-runtime-remote.js';
import {createDsl4RuntimeSourceChooser} from '../../dist/dsl4/platform/runtime-source-chooser.js';
import {createDsl4TurboWarpPreviewSessionFactory} from '../../dist/dsl4/platform/turbowarp-preview-session.js';
import {
  createDsl4TurboWarpDebuggerBridge,
  type Dsl4TurboWarpDebuggerRuntime,
} from '../../dist/dsl4/platform/turbowarp-debugger-bridge.js';
import {createDsl4PreviewProtocolSession} from '../../dist/dsl4/preview-protocol.js';
import {loadDsl4RuntimeComponent} from '../../dist/dsl4/runtime-artifact-loader.js';
import {appShellLocales} from './app-shell-locales.ts';

type AuthoringRuntimeMount = Readonly<{
  addEventListener?: unknown;
  removeEventListener?: unknown;
  style?: unknown;
}>;

type AuthoringBrowserPickerHost = typeof globalThis & {
  isSecureContext?: boolean;
  showOpenFilePicker?: (...parameters: unknown[]) => unknown;
  showDirectoryPicker?: (...parameters: unknown[]) => unknown;
};

type AuthoringDragEvent = Readonly<{
  dataTransfer?: {dropEffect?: string} | null;
  preventDefault?(): unknown;
}>;

type AuthoringDropEvent = Readonly<{
  dataTransfer?: unknown;
  preventDefault?(): unknown;
}>;

type AuthoringRuntimeEvent = Readonly<{
  type?: unknown;
  diagnostic?: unknown;
}>;

type AuthoringSourceResult = Parameters<
  typeof createDsl4BrowserPreviewRuntimeComponent
>[0]['sourceResult'] &
  Readonly<{ok?: unknown; storyDocument: object}>;

type AuthoringRuntimeComponent = Parameters<
  typeof createDsl4BrowserPreviewRuntimeComponent
>[0]['baseComponent'];

type AuthoringDistributionBuildState = Readonly<{enabled?: boolean}>;

type AuthoringLocale = 'en' | 'ja';

function pickerWasCancelled(error: unknown) {
  return (
    typeof error === 'object' && error !== null && (error as {name?: unknown}).name === 'AbortError'
  );
}

function filePickerSupported() {
  const host = globalThis as AuthoringBrowserPickerHost;
  if (host.isSecureContext !== true || typeof host.showOpenFilePicker !== 'function') {
    return false;
  }
  try {
    return globalThis.self === globalThis.top;
  } catch {
    return false;
  }
}

/**
 * Install the non-embedded authoring surface onto the runtime class.
 * The playback build removes this call at compile time, allowing the bundler to
 * tree-shake this module and its complete dependency graph.
 */
export function installDsl4RuntimeAuthoringProfile(
  RuntimeExtension: abstract new (...parameters: never[]) => KamishibaiDsl4RuntimeExtension,
  {
    runtimeVersion,
    limits,
    resolveRuntimeMount,
    resolveBundledTMRuntime,
    loggedError,
    log,
    createRemoteAssetLoader,
    createProjectTMRuntime,
    createTransitionPort,
    playbackRuntime = null,
    narrativeControlEnabled = dsl4NonEmbeddedDevelopmentFeatureFlags.dsl4NarrativeControl,
  }: {
    runtimeVersion: string;
    /**
     * The playback runtime a built work carries instead of this authoring runtime. Without it, or
     * when it cannot be fetched and verified, the work keeps the authoring runtime.
     */
    playbackRuntime?: Dsl4PlaybackRuntimeSite | null;
    narrativeControlEnabled?: boolean;
    // The runtime entry owns the limits; naming its record keeps every field here.
    limits: Readonly<{
      maxSourceBytes: number;
      maxAssetFiles: number;
      maxTotalAssetBytes: number;
      maxSelectedEntries: number;
      maxSelectedDirectoryDepth: number;
    }>;
    resolveRuntimeMount: (
      Scratch: KamishibaiDsl4RuntimeExtension['Scratch'],
    ) => AuthoringRuntimeMount | null | undefined;
    resolveBundledTMRuntime: () => unknown;
    loggedError: (failure: unknown) => Error;
    /** The entry's log: the console, and the editor debugger's Logs tab when it is on. */
    log: Pick<TurboWarpDebuggerLog, 'warn' | 'error'>;
    createRemoteAssetLoader: (options: object) => unknown;
    createProjectTMRuntime: (options: object) => unknown;
    createTransitionPort: (options: object) => Promise<unknown>;
  },
) {
  const developmentFeatureFlags = {
    ...dsl4NonEmbeddedDevelopmentFeatureFlags,
    dsl4NarrativeControl: narrativeControlEnabled,
  };
  // The profile's methods run as the runtime extension, because they are assigned onto its
  // prototype below. `ThisType` is what tells the checker that, so `this.shell`, `this.enqueue`
  // and the rest resolve against the class rather than having to be listed here a second time.
  const authoringProfile: ThisType<KamishibaiDsl4RuntimeExtension> & Record<string, unknown> = {
    isDistributionBuildEnabled() {
      return developmentFeatureFlags.dsl4BrowserDistributionBuild;
    },

    ensureSourceChooser() {
      if (this.sourceChooser) return this.sourceChooser;
      const document = globalThis.document;
      if (!document || Array.isArray(document.scripts)) return null;
      try {
        this.sourceChooser = createDsl4RuntimeSourceChooser({
          document,
          mount: resolveRuntimeMount(this.Scratch),
          locales: {
            en: appShellLocales.en.ui,
            ja: appShellLocales.ja.ui,
          },
          onFile: () => this.openWatchedStoryFile(),
          onProject: () => this.openWatchedProjectDirectory(),
          onCancel: () => this.cancelSourceChoice(),
          onError: (error) => this.reportFailure(error, 'source-chooser'),
        });
      } catch (error) {
        log.error('source chooser failed.', loggedError(error));
        return null;
      }
      return this.sourceChooser;
    },

    installDropTarget() {
      const mount = resolveRuntimeMount(this.Scratch);
      if (
        !mount ||
        typeof mount.addEventListener !== 'function' ||
        typeof mount.removeEventListener !== 'function'
      ) {
        return;
      }
      const onDragOver = (event: AuthoringDragEvent) => {
        if (this.status !== 'menu') return;
        event.preventDefault?.();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      };
      const onDrop = (event: AuthoringDropEvent) => {
        if (this.status !== 'menu') return;
        event.preventDefault?.();
        const collecting = collectDsl4BrowserDroppedFiles(event.dataTransfer, {
          maxEntries: limits.maxSelectedEntries,
          maxDepth: limits.maxSelectedDirectoryDepth,
        });
        this.enqueue(async () => this.loadSelectedEntries(await collecting), 'file-drop');
      };
      mount.addEventListener('dragover', onDragOver);
      mount.addEventListener('drop', onDrop);
    },

    async initializeNonEmbeddedPreview(project: unknown) {
      if (this.previewShell) return this.previewShell;
      const document = globalThis.document;
      if (!document || Array.isArray(document.scripts)) return null;
      const component = await loadDsl4RuntimeComponent(project, this.frontend, {
        ...limits,
        subtleCrypto: globalThis.crypto?.subtle,
      } as unknown as Parameters<typeof loadDsl4RuntimeComponent>[2]);
      if (!component.ok) {
        const diagnostic = component.diagnostics?.[0];
        const error = new Error(
          diagnostic?.message ?? 'The non-embedded DSL 4.0 preview component is invalid.',
        );
        if (typeof diagnostic?.code === 'string') {
          Object.defineProperty(error, 'code', {value: diagnostic.code});
        }
        throw error;
      }

      const Scratch = this.Scratch;
      const turboWarpHost = this.turboWarpHost;
      const mount = resolveRuntimeMount(Scratch);
      const loadRemoteAsset = createRemoteAssetLoader({maxBytes: limits.maxTotalAssetBytes});
      let previewProjectRoot: object | null = null;
      const generationComponents = new WeakMap<object, AuthoringRuntimeComponent>();
      const debugExecution = createDsl4DebugExecutionCoordinator({
        enabled: developmentFeatureFlags.dsl4Debugger,
      });
      // eslint-disable-next-line prefer-const -- assigned after the observer closes over it
      let liveReload: ReturnType<typeof createDsl4LiveReloadSession>;
      const createSession = createDsl4TurboWarpPreviewSessionFactory({
        featureFlags: developmentFeatureFlags,
        runtimeVersion,
        runtimeComponent: component,
        debugExecution,
        resolveRuntimeComponent({storyDocument}: {storyDocument: object}) {
          const generation = generationComponents.get(storyDocument);
          if (!generation) {
            throw new TypeError('The preview source generation has no prepared runtime component');
          }
          return generation;
        },
        runtime: turboWarpHost.runtime,
        resetManagedPresentation: () => {
          this.hideScratchTitle();
          this.hideScratchMenu();
          this.hideAllDisplayTargets();
        },
        cameraPreviewControls: this.cameraPreviewControlOptions(),
        inputTarget: Scratch.vm.renderer?.canvas,
        stagePointerTarget: Scratch.vm.renderer?.canvas,
        createHostPort: async ({runtimeHost}: {runtimeHost: unknown}) =>
          createTransitionPort({runtimeHost}),
        ...this.tmComputeOptions(),
        tmPoseRuntime: createProjectTMRuntime({
          runtime: resolveBundledTMRuntime(),
          globalObject: globalThis,
          project,
        }),
        setLoading() {},
        loadRemoteAsset,
        subtleCrypto: globalThis.crypto?.subtle,
        onEvent: (event: AuthoringRuntimeEvent) => {
          if (this.previewLiveReload !== liveReload) return;
          if (event.type === 'runtime.start' || event.type === 'runtime.resume') {
            this.previewHasCurrent = true;
            this.hideScratchTitle();
            this.hideScratchMenu();
            this.status = 'running';
            this.previewShell?.setReloadVisible(true);
            return;
          }
          if (event.type === 'runtime.finish') {
            this.status = 'menu';
            this.showScratchMenu(this.titleLocale);
            turboWarpHost.startHats('event_whenbroadcastreceived', {
              BROADCAST_OPTION: 'showMenu',
            });
            return;
          }
          if (event.type === 'runtime.fail') {
            this.reportFailure(event.diagnostic ?? 'DSL 4.0 preview execution failed.', 'preview');
          }
        },
      });
      liveReload = createDsl4LiveReloadSession({
        createSession,
        onRunError: (error) => this.reportFailure(error, 'preview-runtime'),
      });
      const protocolSession = createDsl4PreviewProtocolSession({liveReloadSession: liveReload});
      let previewStorage;
      try {
        previewStorage = globalThis.localStorage;
      } catch {
        previewStorage = undefined;
      }
      let previewShell;
      try {
        previewShell = createDsl4WebPreviewShell({
          environment: 'development',
          presentation: 'runtime',
          previewStageControls:
            Scratch.gui?.stageControls ||
            getRuntimeControlsDock({
              document,
              locale: Scratch.translate?.language || globalThis.navigator?.language || 'en',
            }).stageControls,
          previewLocale: /^ja(?:-|$)/iu.test(
            Scratch.translate?.language || globalThis.navigator?.language || '',
          )
            ? 'ja'
            : 'en',
          document,
          mount,
          featureFlags: developmentFeatureFlags,
          protocolSession,
          sessionId: 'nonembedded-sb3',
          sourceFrontend: bindDsl4ProjectSourceFrontend(this.frontend, project),
          debugExecution,
          maxSourceBytes: limits.maxSourceBytes,
          onProjectRoot: (projectRoot: object) => {
            previewProjectRoot = projectRoot;
          },
          prepareSourceResult: async (result: AuthoringSourceResult) => {
            if (result.ok !== true) return;
            const generation = await createDsl4BrowserPreviewRuntimeComponent({
              baseComponent: component,
              sourceResult: result,
              projectRoot: previewProjectRoot,
              maxAssetFileBytes: limits.maxTotalAssetBytes,
              maxAssetFiles: limits.maxAssetFiles,
              maxTotalAssetBytes: limits.maxTotalAssetBytes,
              subtleCrypto: globalThis.crypto?.subtle,
            });
            generationComponents.set(result.storyDocument, generation);
          },
          onDistributionBuildState: (state: AuthoringDistributionBuildState) => {
            if (this.status !== 'menu' || !this.applicationMenu) return;
            this.distributionBuildStatus =
              state.enabled === true
                ? ''
                : (
                    appShellLocales as Readonly<
                      Record<AuthoringLocale, {ui: {buildUnavailable: string}}>
                    >
                  )[this.titleLocale].ui.buildUnavailable;
            this.applicationMenu.setBuildState({
              visible: true,
              enabled: state.enabled === true,
              status: this.distributionBuildStatus,
            });
          },
          onDiagnostic: (diagnostic: Readonly<{severity?: unknown}>) => {
            if (diagnostic?.severity === 'error' && this.status === 'starting') {
              this.showFailure(diagnostic, {returnToMenu: true});
            }
          },
          ...(previewStorage === undefined ? {} : {previewStorage}),
          onError: (error: unknown) => this.reportFailure(error, 'preview-shell'),
        });
      } catch (error) {
        await liveReload.dispose();
        debugExecution.dispose();
        throw error;
      }
      this.previewLiveReload = liveReload;
      this.previewDebugExecution = debugExecution;
      this.previewGenerationComponents = generationComponents;
      this.previewShell = previewShell as unknown as KamishibaiDsl4RuntimeExtension['previewShell'];
      this.previewHasCurrent = false;
      return previewShell;
    },

    openStoryFile() {
      if (this.status !== 'menu') return undefined;
      const projectSupported = inspectDsl4BrowserPreviewSupport({
        globalObject: globalThis,
      }).supported;
      const storyFileSupported = filePickerSupported();
      if (this.previewShell && (storyFileSupported || projectSupported)) {
        this.hideScratchMenu();
        const chooser = this.ensureSourceChooser();
        if (chooser) {
          chooser.show(this.titleLocale, {
            fileEnabled: storyFileSupported,
            projectEnabled: projectSupported,
          });
          return undefined;
        }
        this.showScratchMenu(this.titleLocale);
      }
      return this.openOneShotStoryFile();
    },

    async completeWatchedSourceOpen(opening: unknown) {
      try {
        const state = (await opening) as Readonly<{source?: {started?: unknown}}> | undefined;
        if (state?.source?.started !== true && this.status !== 'error') {
          this.cancelSourceChoice();
        }
        return state;
      } catch (error) {
        if (pickerWasCancelled(error)) {
          this.cancelSourceChoice();
          return undefined;
        }
        if (this.status !== 'error') this.cancelSourceChoice();
        throw error;
      }
    },

    openWatchedProjectDirectory() {
      if (this.status !== 'menu' || !this.previewShell) return undefined;
      const picker = (globalThis as AuthoringBrowserPickerHost).showDirectoryPicker;
      if (typeof picker !== 'function')
        throw new Error('This browser cannot open a project folder.');
      this.sourceChooser?.hide();
      this.status = 'starting';
      let selection;
      try {
        selection = Promise.resolve(picker.call(globalThis, {mode: 'read'}));
      } catch (error) {
        selection = Promise.reject(error);
      }
      return selection.then(
        async (projectRoot) => {
          const directory = projectRoot as {getFileHandle?: (name: string) => Promise<unknown>};
          let publication = false;
          try {
            await directory.getFileHandle?.('publication.json');
            publication = typeof directory.getFileHandle === 'function';
          } catch (error) {
            if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error;
          }
          if (publication) {
            const entries = await collectDsl4BrowserDirectoryFiles(projectRoot, {
              maxEntries: limits.maxSelectedEntries,
              maxDepth: limits.maxSelectedDirectoryDepth,
            });
            return this.loadSelectedEntries(entries);
          }
          return this.startNewWatchedSource(projectRoot);
        },
        (error) => {
          if (pickerWasCancelled(error)) {
            this.cancelSourceChoice();
            return undefined;
          }
          this.cancelSourceChoice();
          throw error;
        },
      );
    },

    async startNewWatchedSource(projectRoot: unknown) {
      if (this.previewShell?.getSnapshot()?.coordinator?.source?.started === true) {
        await this.restart({showTitle: false});
      }
      if (!this.previewShell) throw new Error('The watched story preview is unavailable.');
      this.hideScratchMenu();
      this.status = 'starting';
      return this.completeWatchedSourceOpen(this.previewShell.start(projectRoot));
    },

    async openWatchedStoryFile() {
      if (this.status !== 'menu' || !this.previewShell) return undefined;
      const picker = (globalThis as AuthoringBrowserPickerHost).showOpenFilePicker;
      if (typeof picker !== 'function') throw new Error('This browser cannot watch a story file.');
      this.sourceChooser?.hide();
      this.status = 'starting';
      let handles;
      try {
        handles = await picker({
          multiple: false,
          types: [
            {
              description: 'Kamishibai DSL 4.0 YAML',
              accept: {'application/yaml': ['.yml', '.yaml']},
            },
          ],
        });
      } catch (error) {
        if (pickerWasCancelled(error)) {
          this.cancelSourceChoice();
          return undefined;
        }
        throw error;
      }
      if (!Array.isArray(handles) || handles.length !== 1) {
        throw new TypeError('Select exactly one DSL 4.0 story file');
      }
      const projectRoot = createDsl4BrowserPreviewStoryFileProject(handles[0]);
      return this.startNewWatchedSource(projectRoot);
    },

    cancelSourceChoice() {
      this.sourceChooser?.hide();
      if (this.status !== 'error') {
        this.status = 'menu';
        this.showScratchMenu(this.titleLocale);
      }
    },

    openOneShotStoryFile() {
      const document = globalThis.document;
      if (!document || typeof document.createElement !== 'function') {
        throw new Error('This browser cannot open a DSL 4.0 story file.');
      }
      const input = document.createElement('input');
      if (
        !input ||
        typeof input.addEventListener !== 'function' ||
        typeof input.click !== 'function'
      ) {
        throw new Error('This browser cannot open a DSL 4.0 story file.');
      }
      input.type = 'file';
      input.accept = '.yml,.yaml';
      input.multiple = false;
      if (input.style) input.style.display = 'none';
      input.addEventListener(
        'change',
        () => {
          const selectedFiles = input.files ?? [];
          input.remove?.();
          this.fileInput = null;
          if (selectedFiles.length === 0) return;
          this.enqueue(() => {
            if (selectedFiles.length > limits.maxSelectedEntries) {
              throw new TypeError(
                `Selected project exceeds the ${limits.maxSelectedEntries} entry limit`,
              );
            }
            const entries = Array.from(selectedFiles).map((file) => ({
              path: file.webkitRelativePath || file.name,
              file,
            }));
            if (
              entries.some(
                ({path}) => path.split('/').length - 1 > limits.maxSelectedDirectoryDepth,
              )
            ) {
              throw new TypeError(
                `Selected project exceeds the ${limits.maxSelectedDirectoryDepth} directory depth limit`,
              );
            }
            return this.loadSelectedEntries(entries);
          }, 'file-open');
        },
        {once: true},
      );
      this.fileInput?.remove?.();
      this.fileInput = input;
      document.body?.appendChild?.(input);
      input.click();
      return undefined;
    },

    async loadSelectedEntries(entries: unknown) {
      this.status = 'starting';
      this.hideScratchMenu();
      this.setStageCursor('wait');
      const baseProject = JSON.parse(this.Scratch.vm.toJSON());
      const selected = await buildDsl4BrowserSelectedStoryProject({
        project: baseProject,
        entries: entries as Parameters<typeof buildDsl4BrowserSelectedStoryProject>[0]['entries'],
        sourceFrontend: this.frontend,
        maxSourceBytes: limits.maxSourceBytes,
        maxAssetFileBytes: limits.maxTotalAssetBytes,
        maxAssetFiles: limits.maxAssetFiles,
        maxTotalAssetBytes: limits.maxTotalAssetBytes,
        subtleCrypto: globalThis.crypto?.subtle,
      });
      this.selectedProject = selected.project;
      await this.restart({projectOverride: selected.project, showTitle: false, forceStory: true});
    },

    async buildDistributionSb3(distributionProfile: 'source' | 'compiled' = 'source') {
      if (this.status !== 'menu' || !this.previewShell || !this.previewGenerationComponents) {
        return undefined;
      }
      const menu = this.ensureApplicationMenu();
      const ui = (
        appShellLocales as Readonly<
          Record<
            AuthoringLocale,
            {
              ui: {
                buildCancelled: string;
                buildDone: string;
                buildDoneRemote: string;
                buildPreparing: string;
                buildSaved: string;
                buildSavedRemote: string;
                buildSaving: string;
                buildSavingRemote: string;
                buildVerifying: string;
              };
            }
          >
        >
      )[this.titleLocale].ui;
      this.status = 'building';
      this.distributionBuildStatus = ui.buildPreparing;
      menu?.setBuildState({visible: true, enabled: false, status: this.distributionBuildStatus});
      this.setStageCursor('wait');
      try {
        const suggestedFilename = createDsl4BrowserDistributionFilename(
          this.previewShell.getSnapshot().sourceDisplayName,
        );
        const saveTarget = await requestDsl4BrowserDistributionSaveTarget({
          filename: suggestedFilename,
          globalObject: globalThis,
        });
        if (saveTarget?.method === 'cancelled') {
          this.status = 'menu';
          this.distributionBuildStatus = ui.buildCancelled;
          this.showScratchMenu(this.titleLocale);
          return saveTarget;
        }
        const prepared = await this.previewShell.prepareDistributionBuild();
        this.distributionBuildStatus = ui.buildVerifying;
        menu?.setBuildState({visible: true, enabled: false, status: this.distributionBuildStatus});
        const initialRuntimeComponent = await createDsl4BrowserPreviewRuntimeComponent({
          baseComponent: this.previewGenerationComponents.get(
            prepared.sourceResult.storyDocument,
          ) as Parameters<typeof createDsl4BrowserPreviewRuntimeComponent>[0]['baseComponent'],
          sourceResult: prepared.sourceResult,
          projectRoot: prepared.projectRoot,
          maxAssetFileBytes: limits.maxTotalAssetBytes,
          maxAssetFiles: limits.maxAssetFiles,
          maxTotalAssetBytes: limits.maxTotalAssetBytes,
          subtleCrypto: globalThis.crypto?.subtle,
        });
        const projectFiles = await this.Scratch.vm.saveProjectSb3DontZip();
        const confirmedBeforeBuild = await this.previewShell.prepareDistributionBuild();
        if (confirmedBeforeBuild.integrity !== prepared.integrity) {
          const error = new Error(
            'Project files changed during the distribution build. Try again.',
          );
          Object.defineProperty(error, 'code', {value: 'K4-BROWSER-BUILD-GENERATION-CHANGED'});
          throw error;
        }
        const runtimeComponent = await createDsl4BrowserPreviewRuntimeComponent({
          baseComponent: this.previewGenerationComponents.get(
            confirmedBeforeBuild.sourceResult.storyDocument,
          ) as Parameters<typeof createDsl4BrowserPreviewRuntimeComponent>[0]['baseComponent'],
          sourceResult: confirmedBeforeBuild.sourceResult,
          projectRoot: confirmedBeforeBuild.projectRoot,
          maxAssetFileBytes: limits.maxTotalAssetBytes,
          maxAssetFiles: limits.maxAssetFiles,
          maxTotalAssetBytes: limits.maxTotalAssetBytes,
          subtleCrypto: globalThis.crypto?.subtle,
        });
        if (
          runtimeComponent.assetBundle.integrity !== initialRuntimeComponent.assetBundle.integrity
        ) {
          const error = new Error(
            'Project assets changed during the distribution build. Try again.',
          );
          Object.defineProperty(error, 'code', {value: 'K4-BROWSER-BUILD-GENERATION-CHANGED'});
          throw error;
        }
        // The audience needs no editing tools, so the work carries the smaller playback runtime.
        // Without it the work is still complete, only larger, so a failed fetch is not fatal.
        let runtimeExtensionSource: string | undefined;
        if (playbackRuntime) {
          try {
            runtimeExtensionSource = await fetchDsl4PlaybackRuntime(playbackRuntime, {
              fetch: globalThis.fetch?.bind(globalThis),
              subtleCrypto: globalThis.crypto?.subtle,
            });
          } catch (error) {
            log.warn(
              'distribution-build keeps the authoring runtime: the playback runtime is unavailable.',
              loggedError(error),
            );
          }
        }
        const built = await createDsl4BrowserDistributionSb3({
          projectFiles,
          runtimeComponent,
          sourceFrontend: this.frontend,
          maxSourceBytes: limits.maxSourceBytes,
          maxAssetFiles: limits.maxAssetFiles,
          maxTotalAssetBytes: limits.maxTotalAssetBytes,
          distributionProfile,
          subtleCrypto: globalThis.crypto?.subtle,
          runtimeExtensionSource,
        });
        const confirmed = await this.previewShell.prepareDistributionBuild();
        if (confirmed.integrity !== prepared.integrity) {
          const error = new Error(
            'Project files changed during the distribution build. Try again.',
          );
          Object.defineProperty(error, 'code', {value: 'K4-BROWSER-BUILD-GENERATION-CHANGED'});
          throw error;
        }
        this.distributionBuildStatus = built.delivery.networkRequired
          ? ui.buildSavingRemote
          : ui.buildSaving;
        menu?.setBuildState({visible: true, enabled: false, status: this.distributionBuildStatus});
        const saved = await saveDsl4BrowserDistributionSb3({
          bytes: built.bytes,
          filename: built.filename,
          target: saveTarget,
          globalObject: globalThis,
        });
        this.status = 'menu';
        this.distributionBuildStatus = built.delivery.networkRequired
          ? saved.method === 'file-system'
            ? ui.buildSavedRemote
            : ui.buildDoneRemote
          : saved.method === 'file-system'
            ? ui.buildSaved
            : ui.buildDone;
        this.showScratchMenu(this.titleLocale);
        return built;
      } catch (error) {
        if (this.status !== 'error') this.status = 'menu';
        throw error;
      } finally {
        if (this.status === 'menu') this.setStageCursor('pointer');
      }
    },

    async startAuthoringMenu(project: unknown, {showTitle}: {showTitle: unknown}) {
      try {
        await this.initializeNonEmbeddedPreview(project);
      } catch (error) {
        log.warn(
          'development preview is unavailable; using one-shot file loading.',
          loggedError(error),
        );
      }
      const turboWarpHost = this.turboWarpHost;
      const showMenu = async () => {
        if (this.shell !== null) return;
        this.pendingStart = null;
        this.hideScratchTitle();
        this.showScratchMenu(this.titleLocale);
        turboWarpHost.startHats('event_whenbroadcastreceived', {
          BROADCAST_OPTION: 'showMenu',
        });
        this.status = 'menu';
      };
      if (showTitle) {
        this.pendingStart = {shell: null, start: showMenu};
        this.status = 'title';
        this.showScratchTitle(this.titleLocale);
      } else {
        await showMenu();
      }
    },

    /**
     * Pause the embedded story at its `debugger` actions while it runs in the editor. The TurboWarp
     * debugger holds the pause, so its window shows where the story stopped, and the variable pane
     * shows the story variables through `getInspectorVariables`. Packaged runs get no coordinator.
     */
    createEditorDebugExecution() {
      const runtime = this.turboWarpHost.runtime as unknown as Dsl4TurboWarpDebuggerRuntime;
      if (typeof runtime?.on !== 'function' || typeof runtime.removeListener !== 'function') {
        return null;
      }
      const coordinator = createDsl4DebugExecutionCoordinator({enabled: true});
      const bridge = createDsl4TurboWarpDebuggerBridge({
        runtime,
        coordinator,
        locale: this.titleLocale,
        getStoryVariables: () => this.runtimeVariableSnapshot()?.storyVariables ?? null,
      });
      this.editorDebugExecution = coordinator;
      return {
        coordinator,
        dispose() {
          bridge.dispose();
          coordinator.dispose();
        },
      };
    },

    /** The story variables for the editor's variable pane, which reads them while paused. */
    getInspectorVariables() {
      const ja = this.titleLocale === 'ja';
      const snapshot = this.runtimeVariableSnapshot();
      const debug = this.editorDebugExecution?.getState();
      const where =
        debug?.paused === true && typeof debug.sceneId === 'string'
          ? ja
            ? `場面「${debug.sceneId}」の ${Number(debug.actionIndex) + 1} 番目のアクションの直前で一時停止中です。`
            : `Paused before action ${Number(debug.actionIndex) + 1} of scene "${debug.sceneId}".`
          : '';
      return {
        title: ja ? '台本の変数' : 'Story Variables',
        description: [
          ja
            ? 'TurboWarp紙芝居の台本の変数（setVariable などで変わる物語変数）です。'
            : 'Story variables of TurboWarp Kamishibai, which actions such as setVariable change.',
          where,
        ]
          .filter(Boolean)
          .join(' '),
        variables: snapshot?.storyVariables ?? null,
      };
    },
  };
  Object.assign(RuntimeExtension.prototype, authoringProfile);
}
