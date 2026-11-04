import {assertKamishibaiDocumentSourceReady} from '../../dist/dsl4/embedded-yaml-view-state.js';
import {
  createEmbeddedYamlDocumentMenu,
  createEmbeddedYamlRootVersionMenu,
  registerEmbeddedYamlRootHatShape,
  getProviderRegistry,
  type EmbeddedYamlRootShapeHost,
} from '@kubohiroya/turbowarp-document-data/document-source';
import {
  registerKamishibaiEmbeddedYamlProvider,
  buildKamishibaiDocumentSourceProject,
} from '../../dist/dsl4/embedded-yaml-provider.js';
import {resolveKamishibaiDocumentSourceProject} from '../../dist/dsl4/document-source-runtime.js';
import {documentSourceEnabledAtStartup} from '../../dist/dsl4/document-source.js';
import {getRuntimeControlsDock} from '@kubohiroya/turbowarp-app-shell';
import {
  createTMComposition,
  type TMCompositionOptions,
} from '@kubohiroya/turbowarp-teachable-machine/composition';
import {
  createDsl4ComputePreferences,
  createDsl4ComputeSettings,
} from '../../dist/dsl4/platform/compute-settings.js';
import {createDsl4PublicationDistributionSb3} from '../../dist/dsl4/platform/publication-distribution.js';
import {downloadDsl4BrowserDistributionSb3} from '../../dist/dsl4/platform/browser-distribution-build.js';
import {readDsl4ProjectPublication} from '../../dist/dsl4/platform/publication-project.js';
import {createDsl4PublicationVmStageFactory} from '../../dist/dsl4/platform/publication-vm-stage.js';
import type {Dsl4CameraControlsController} from '../../dist/dsl4/platform/camera-preview-controls.js';
import {
  connectDsl4TitleCameraControls,
  readDsl4CameraControlsSource,
} from '../../dist/dsl4/platform/camera-controls-connection.js';
import type {Dsl4PreviewStageControls} from '../../dist/builder/dsl4-preview-reload-overlay.js';
import {createTurboWarpRuntimeHost} from '@kubohiroya/turbowarp-runtime-adapter';

import schema from '../../schema/dsl-4.schema.json' with {type: 'json'};

import {createDsl4ProductionSourceFrontend} from '../../dist/builder/dsl4-source-frontend.js';
import {
  dsl4StandardProductionFeatureFlags,
  resolveDsl4FeatureFlags,
} from '../../dist/dsl4/feature-flags.js';
import {createDsl4BrowserRemoteAssetLoader} from '../../dist/dsl4/platform/browser-remote-asset-loader.js';
import {createDsl4ProjectTMRuntime} from '../../dist/dsl4/platform/posenet-bundle.js';
import {createDsl4PackagedBinaryRuntimeBridge} from '../../dist/dsl4/platform/packaged-binary-runtime.js';
import {createDsl4RuntimeErrorIndicator} from '../../dist/dsl4/platform/runtime-error-indicator.js';
import {createDsl4BlockErrorLocation} from '../../dist/dsl4/platform/block-error-location.js';
import {createDsl4RuntimeBlockDiagnosticLocator} from '../../dist/dsl4/platform/runtime-block-diagnostic.js';
import {runtimeErrorCauses} from '../../dist/dsl4/runtime-error-context.js';
import {normalizeDsl4VmProjectSnapshot} from '../../dist/dsl4/platform/vm-project-snapshot.js';
import type {Dsl4BlockErrorHost} from '../../dist/dsl4/platform/block-error-location.js';
import {createDsl4RuntimeApplicationMenu} from '../../dist/dsl4/platform/runtime-application-menu.js';
import {createDsl4RuntimeTitleControls} from '../../dist/dsl4/platform/runtime-title-controls.js';
import {createDsl4RuntimeWarningIndicator} from '../../dist/dsl4/platform/runtime-warning-indicator.js';
import {
  createDsl4SessionBackingFatalDiagnostic,
  createDsl4SessionBackingWarningDiagnostic,
} from '../../dist/dsl4/platform/session-backing-diagnostic.js';
import {createDsl4StandardAppShell} from '../../dist/dsl4/platform/standard-app-shell.js';
import {
  hasDsl4EmbeddedBlockStory,
  prepareDsl4EmbeddedBlockStoryProject,
} from '../../dist/dsl4/platform/embedded-block-story.js';
import {
  createDsl4CameraProjectContext,
  packagedStoryUsesPoseRecognition,
} from '../../dist/dsl4/platform/packaged-story-camera.js';
import {
  createDsl4UserMediaGate,
  supportsDsl4UserMediaGate,
} from '../../dist/dsl4/platform/user-media-gate.js';
import {
  createDsl4TurboWarpCoreActionBlockAdapter,
  createDsl4TurboWarpCoreActionBlockSurface,
} from '../../dist/dsl4/platform/turbowarp-core-action-block.js';
import {createDsl4TurboWarpRuntimeVariableBlockSurface} from '../../dist/dsl4/platform/turbowarp-runtime-variable-block.js';
import {createDsl4TurboWarpTransitionPort} from '../../dist/dsl4/platform/turbowarp-transition-port.js';
import {dsl4RuntimeProvenance} from '../../dist/dsl4/runtime-provenance.js';
import {dsl4RuntimeBlockIconURI} from '../../dist/dsl4/runtime-icon.js';
import {
  createYamlBlockDefinitions,
  createYamlBlockMenus,
  yamlBlockOperations,
} from '@kubohiroya/turbowarp-yaml-json/yaml-blocks';
import {documentViewsEnabledAtStartup} from '../../dist/dsl4/embedded-yaml-feature-flags.js';
import {
  createDsl4EmbeddedYamlHatDefinition,
  createDsl4EmbeddedYamlConfigHatDefinition,
  createDsl4EmbeddedYamlRootDefinition,
} from '../../dist/dsl4/embedded-yaml-hat.js';
import {createDsl4EmbeddedYamlIncludeDefinition} from '../../dist/dsl4/embedded-yaml-include-views.js';
import {kamishibaiEmbeddedYamlProviderId} from '../../dist/dsl4/embedded-yaml-identity.js';
import {
  appShellCameraPermissionLabels,
  appShellCameraPreviewControlLabels,
  appShellCommon,
  appShellLocales,
} from './app-shell-locales.ts';
import {installDsl4RuntimeAuthoringProfile} from './dsl4-runtime-authoring-profile.js';
import {
  installDsl4BlockIconPreviews,
  type Dsl4BlockPreviewScratch,
} from '../../dist/dsl4/platform/block-icon-preview-editor.js';
import {
  assetIconPreviewsEnabledAtStartup,
  blockIconPreviewsEnabledAtStartup,
} from '../../dist/dsl4/block-icon-preview-feature-flags.js';

const extensionId = 'kubohiroyakamishibairuntime4';
const extensionVersion = '4.0.0-rc.82';
const blockIconURI = dsl4RuntimeBlockIconURI;
const applicationMenuIcons = DSL4_APPLICATION_MENU_ICONS;
const officialWebsiteIcon = DSL4_OFFICIAL_WEBSITE_ICON;
const limits = Object.freeze({
  maxSourceBytes: 1024 * 1024,
  maxAssetFiles: 64,
  maxTotalAssetBytes: 64 * 1024 * 1024,
  maxSelectedEntries: 1024,
  maxSelectedDirectoryDepth: 32,
});
const runtimeErrorTitles = Object.freeze({
  en: 'Kamishibai runtime error',
  ja: '紙芝居の実行エラー',
});
const sourceDiagnosticPrefixes = Object.freeze([
  'K4-ACTION-LIMIT',
  'K4-ASSET-001',
  'K4-ASSET-IMAGE-MIME',
  'K4-ASSET-LIMIT',
  'K4-ASSET-MISSING',
  'K4-ASSET-PATH',
  'K4-ASSET-PERMISSION',
  'K4-ASSET-POSE',
  'K4-ASSET-PREPARE',
  'K4-ASSET-PROJECT',
  'K4-ASSET-REMOTE-URL',
  'K4-ASSET-UNSTABLE',
  'K4-BRANCH',
  'K4-BLOCK-SOURCE',
  'K4-COMMAND',
  'K4-EXPRESSION',
  'K4-ID',
  'K4-INCLUDE',
  'K4-KEY',
  'K4-POSE-MODEL',
  'K4-REF',
  'K4-SCENE-LIMIT',
  'K4-SCHEMA',
  'K4-SOURCE',
  'K4-SPEECH-STYLE',
  'K4-STABLE-ID',
  'K4-VERSION',
  'K4-YAML',
]);

type RuntimeEntryFunction = (...parameters: unknown[]) => unknown;
type RuntimeEntryLocale = 'en' | 'ja';

interface RuntimeEntryMount {
  style?: Record<string, string>;
  appendChild?(child: unknown): unknown;
}

interface RuntimeEntryCanvas extends RuntimeEntryMount {
  parentElement?: RuntimeEntryMount | null;
  parentNode?: RuntimeEntryMount | null;
}

interface RuntimeEntryScratchVm {
  renderer?: {canvas?: RuntimeEntryCanvas | null};
  runtime?: unknown;
  toJSON(targetId?: string, options?: {allowOptimization?: boolean}): string;
  saveProjectSb3DontZip(): unknown | Promise<unknown>;
}

interface RuntimeEntryScratch {
  translate?: {readonly language?: string};
  /** The extension's own network capability; absent hosts refuse URL scripts. */
  fetch?: typeof globalThis.fetch;
  gui?: Dsl4BlockErrorHost['gui'] &
    NonNullable<Dsl4BlockPreviewScratch['gui']> & {
      stageControls?: Dsl4PreviewStageControls;
      cameraControls?: unknown;
    };
  ArgumentType: Readonly<Record<string, string>>;
  BlockType: Readonly<Record<string, string>>;
  vm: RuntimeEntryScratchVm;
  extensions?: {
    unsandboxed?: boolean;
    register(extension: unknown): unknown;
  };
}

interface RuntimeEntryBundledTMRuntime extends Readonly<Record<string, unknown>> {
  Webcam: RuntimeEntryFunction;
  loadFromFiles: RuntimeEntryFunction;
}

interface RuntimeEntryFailureRecord {
  message?: unknown;
  code?: unknown;
  storyPath?: unknown;
  targetName?: unknown;
  blockId?: unknown;
}

interface RuntimeEntryPackagedComponent {
  application?: {mode?: unknown};
  /** The story the artifact carries, which the title reads before the runtime parses it. */
  source?: {text?: unknown};
}

interface RuntimeEntryPackagedProject extends Readonly<Record<string, unknown>> {
  extensionStorage?: {
    kubohiroyakamishibai4?: {
      components?: {
        kubohiroyakamishibairuntime4?: RuntimeEntryPackagedComponent;
      };
    };
    kubohiroyakamishibairuntime4?: RuntimeEntryPackagedComponent;
  };
}

interface RuntimeEntryStateSnapshot {
  storyVariables?: Readonly<Record<string, unknown>>;
  runtime?: Readonly<Record<string, unknown>>;
  diagnostic?: RuntimeEntryFailureRecord | null;
}

/**
 * The members the entry reads off whichever runtime is active. Both the packaged runtime host and
 * the preview live-reload session answer this surface, and each one implements its own subset, so
 * every member stays optional here.
 */
interface RuntimeEntryRuntimeInvoker {
  getRuntimeVariableSnapshot?(): unknown;
  getState?(): unknown;
  invokeAction?(action: unknown): unknown;
  rejectActionInvocation?(error: unknown): unknown;
  sessionBinaryBacking?: {getState?(): unknown};
  diagnostics?: {getState?(): unknown};
}

/**
 * The runtime host the packaged entry creates through the Standard app-shell. The entry owns that
 * construction, so the startup members it drives are present rather than optional.
 */
interface RuntimeEntryRuntimeHost extends RuntimeEntryRuntimeInvoker {
  getState?(): RuntimeEntryStateSnapshot;
  start(): Promise<{status: string; diagnostic?: unknown; failureContext?: unknown}>;
  prepareMenu(): unknown | Promise<unknown>;
  attach(target: unknown): unknown;
}

/** The action surface `actionInvoker` guarantees to its callers after validating the runtime. */
interface RuntimeEntryActionInvoker {
  invokeAction(action: unknown): unknown;
  rejectActionInvocation(error: unknown): unknown;
}

interface RuntimeEntryDisposable {
  dispose(reason?: unknown): unknown;
}

interface RuntimeEntryPreviewShell extends RuntimeEntryDisposable {
  setReloadVisible(visible: boolean): void;
  getSnapshot(): Readonly<{
    coordinator?: {source?: {started?: unknown}};
    sourceDisplayName: string;
  }>;
  start(projectRoot: unknown): unknown | Promise<unknown>;
  restart(reason: string): unknown | Promise<unknown>;
  prepareDistributionBuild(): Promise<
    Readonly<{
      integrity: unknown;
      sourceResult: Readonly<{storyDocument: unknown}>;
      projectRoot: unknown;
    }>
  >;
  getDistributionBuildState(): Readonly<{enabled?: boolean; reason?: unknown}>;
}

interface RuntimeEntrySourceChooser {
  show(
    locale: RuntimeEntryLocale,
    options: {fileEnabled: boolean; projectEnabled: boolean},
  ): unknown;
  hide(): unknown;
}

interface RuntimeEntryFileInput {
  remove?(): unknown;
}

interface RuntimeEntryPendingStart {
  shell: RuntimeEntryAppShell | null;
  start(): unknown | Promise<unknown>;
}

interface RuntimeEntryStageCostume {
  name?: unknown;
}

interface RuntimeEntryStageTarget {
  sprite?: {costumes?: RuntimeEntryStageCostume[]};
  setCostume?(index: number): unknown;
  setVisible?(visible: boolean): unknown;
}

interface RuntimeEntryGenerationComponents {
  get(key: unknown): unknown;
}

type RuntimeEntryAppShell = Extract<
  Awaited<ReturnType<typeof createDsl4StandardAppShell>>,
  {hideTitle: unknown}
> & {
  runtimeHost: RuntimeEntryRuntimeHost;
  dispose(reason?: unknown): unknown;
};

function resolveRuntimeMount(Scratch: RuntimeEntryScratch) {
  const canvas = Scratch?.vm?.renderer?.canvas;
  const parent = canvas?.parentElement ?? canvas?.parentNode;
  if (parent && typeof parent.appendChild === 'function') return parent;
  return globalThis.document?.body;
}

/**
 * The camera preview box the preview controls anchor against, in client pixels.
 *
 * DSL 4.0 shows the camera full-stage -- the schema has no preview position and the story camera
 * lifecycle sets `full-stage` before every start -- so the preview box is the stage canvas, and its
 * client rect is what the controls need. Reading the canvas rect each frame also keeps the controls
 * on the preview while the stage is resized or scaled, which the packager does.
 */
function resolveCameraPreviewRect(Scratch: RuntimeEntryScratch) {
  const canvas = Scratch?.vm?.renderer?.canvas as
    {getBoundingClientRect?: () => DOMRect} | undefined;
  if (typeof canvas?.getBoundingClientRect !== 'function') return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect) return null;
  return {left: rect.left, top: rect.top, width: rect.width, height: rect.height};
}

/**
 * Drive the control placement from the frame loop, and stop driving it in a hidden tab.
 *
 * The renderer's own fallback is a 16 ms timer, which keeps measuring a stage nobody is looking at.
 */
function scheduleCameraPreviewControlFrame(callback: () => void) {
  const request = globalThis.requestAnimationFrame;
  if (typeof request !== 'function') {
    const timer = setTimeout(callback, 16);
    return () => clearTimeout(timer);
  }
  const frame = request.call(globalThis, () => callback());
  return () => globalThis.cancelAnimationFrame?.(frame);
}

const cameraSourceRuntimeKey = 'ext_kubohiroyacamerasource';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * What the story asks the browser for when it offers the camera on its title.
 *
 * Only the facing matters here. Resolution is left to the browser, because the consumer of these
 * frames decides what it needs from them and a number chosen here would quietly cap it.
 */
const cameraPermissionConstraints = Object.freeze({video: Object.freeze({facingMode: 'user'})});

/**
 * A place for the camera permission step, over the Stage, while the title is up.
 *
 * The packaged story has no app-shell title panel: its title is a Stage backdrop with an overlay
 * of actions. So the step gets its own box, anchored to the bottom of the Stage where it does not
 * cover the title art, and removed with the step itself.
 */
function createCameraPermissionMount(document: Document, mount: Element) {
  const box = document.createElement('div');
  box.dataset.dsl4CameraPermission = 'true';
  Object.assign(box.style, {
    position: 'absolute',
    left: '50%',
    bottom: '16px',
    transform: 'translateX(-50%)',
    zIndex: '30',
    display: 'flex',
    justifyContent: 'center',
  });
  mount.appendChild(box);
  return box;
}

/**
 * Hold the camera the person granted on the title, for as long as the story runs.
 *
 * The stream is handed to Camera Source, which is what every frame reader in the bundle leases
 * from; the Teachable Machine extension then finds a camera already open and never calls
 * `getUserMedia`. Camera Source does not stop the tracks of a stream it was given -- it only stops
 * the ones it opened -- so stopping them when the story ends is this owner's job. Nobody else can:
 * the page asked for the camera, so the page turns it off.
 */
function createCameraPermissionOwner(readRuntime: () => unknown) {
  let lease: {release(): unknown} | null = null;
  let stream: {getTracks?: () => Array<{stop?: () => void}>} | null = null;
  return {
    async adopt(granted: unknown) {
      const runtime = readRuntime();
      const cameraSource = isRecord(runtime) ? runtime[cameraSourceRuntimeKey] : undefined;
      const adoptCamera = isRecord(cameraSource) ? cameraSource.adoptCamera : undefined;
      if (typeof adoptCamera !== 'function') {
        // Camera Source is not in this bundle, so there is nobody to hand the stream to. The
        // person granted a camera that recognition will open for itself; say so rather than
        // pretending the handover worked.
        throw new Error('Camera Source is unavailable, so the granted camera cannot be shared.');
      }
      const acquired = await (
        adoptCamera as (options: unknown) => Promise<{release(): unknown}>
      ).call(cameraSource, {
        stream: granted,
        owner: extensionId,
        cameraId: 'pose',
      });
      lease = acquired;
      stream = granted as typeof stream;
    },
    release() {
      const held = lease;
      const granted = stream;
      lease = null;
      stream = null;
      try {
        held?.release();
      } finally {
        for (const track of granted?.getTracks?.() ?? []) track.stop?.();
      }
    },
  };
}

function resolveBundledTMRuntime() {
  const runtime =
    typeof tmPose === 'object' && tmPose !== null
      ? tmPose
      : (globalThis as unknown as {tmPose?: unknown}).tmPose;
  if (
    typeof runtime !== 'object' ||
    runtime === null ||
    typeof (runtime as RuntimeEntryBundledTMRuntime).Webcam !== 'function' ||
    typeof (runtime as RuntimeEntryBundledTMRuntime).loadFromFiles !== 'function'
  ) {
    throw new Error('The bundled Teachable Machine Pose runtime is unavailable.');
  }
  return runtime as RuntimeEntryBundledTMRuntime;
}

function browserLocale(language = globalThis.navigator?.language): RuntimeEntryLocale {
  return /^ja(?:-|$)/iu.test(language || globalThis.navigator?.language || '') ? 'ja' : 'en';
}

function packagedRuntimeComponent(project: RuntimeEntryPackagedProject) {
  return (
    project?.extensionStorage?.kubohiroyakamishibai4?.components?.kubohiroyakamishibairuntime4 ??
    project?.extensionStorage?.kubohiroyakamishibairuntime4
  );
}

function packagedApplicationMode(project: RuntimeEntryPackagedProject) {
  if (hasDsl4EmbeddedBlockStory(project)) return 'story';
  const mode = packagedRuntimeComponent(project)?.application?.mode;
  return mode === 'menu' ? 'menu' : 'story';
}

function isSourceDiagnostic(code: string) {
  return sourceDiagnosticPrefixes.some((prefix) => code.startsWith(prefix));
}

function loggedError(failure: unknown) {
  if (failure instanceof Error) return failure;
  const failureRecord = failure as RuntimeEntryFailureRecord | null | undefined;
  const error = new Error(
    String(failureRecord?.message ?? failure ?? 'DSL 4.0 story execution failed.'),
    {cause: failure},
  );
  if (typeof failureRecord?.code === 'string') {
    Object.defineProperty(error, 'code', {value: failureRecord.code});
  }
  return error;
}

const productionFeatureFlags = resolveDsl4FeatureFlags({
  ...dsl4StandardProductionFeatureFlags,
  dsl4NarrativeControl: DSL4_NARRATIVE_CONTROL,
});

declare const DSL4_APPLICATION_MENU_ICONS: Readonly<Record<string, string>>;
declare const DSL4_OFFICIAL_WEBSITE_ICON: string;
declare const DSL4_AUTHORING_PROFILE: boolean;
declare const DSL4_NARRATIVE_CONTROL: boolean;
declare const tmPose: unknown;
declare const Scratch: RuntimeEntryScratch;

/**
 * What Scratch hands a block implementation.
 *
 * `args` is keyed by the argument names the block declared, with values the VM has already coerced,
 * so each implementation reads its own keys with the conversion that block wants. `util` is the
 * block utility; this extension reads only the calling thread off it, to key one story variable
 * write result per thread.
 */
type ScratchBlockArguments = Readonly<Record<string, unknown>>;

/**
 * The runtime extension instance, as the authoring profile drives it.
 *
 * `installDsl4RuntimeAuthoringProfile` assigns its methods onto this class's prototype, so they run
 * as an instance of it. The `export type` below is what lets the profile say so. It has to be a
 * type-only export: the TurboWarp extension contract forbids module syntax in the bundle, and an
 * `export class` here fails the build with "must not contain import or export statements".
 */
class KamishibaiDsl4RuntimeExtension {
  Scratch: RuntimeEntryScratch;
  turboWarpHost: ReturnType<typeof createTurboWarpRuntimeHost>;
  /**
   * Installed on the prototype by `installDsl4RuntimeAuthoringProfile`, not defined here.
   *
   * The non-embedded authoring build assigns these at startup; the packaged build never does, so
   * every call site probes for the member first. Declaring the whole set — not only the five this
   * file calls — is what lets the profile's own methods reach for each other and be checked.
   */
  declare buildDistributionSb3: (distributionProfile?: 'source' | 'compiled') => Promise<unknown>;
  declare cancelSourceChoice: () => unknown;
  declare completeWatchedSourceOpen: (opening: unknown) => Promise<unknown>;
  declare ensureSourceChooser: () => Readonly<{
    show(locale: string, options: {fileEnabled: boolean; projectEnabled: boolean}): unknown;
  }> | null;
  declare initializeNonEmbeddedPreview: (project: unknown) => Promise<unknown>;
  declare loadSelectedEntries: (entries: unknown) => Promise<unknown>;
  declare openOneShotStoryFile: () => unknown;
  declare openWatchedProjectDirectory: () => unknown;
  declare openWatchedStoryFile: () => Promise<unknown>;
  declare startNewWatchedSource: (projectRoot: unknown) => Promise<unknown>;
  coreActionBlockAdapter: ReturnType<typeof createDsl4TurboWarpCoreActionBlockAdapter>;
  frontend: ReturnType<typeof createDsl4ProductionSourceFrontend>;
  declare installDropTarget: () => unknown;
  declare isDistributionBuildEnabled: () => boolean;
  declare openStoryFile: () => unknown;
  operation: Promise<unknown>;
  declare startAuthoringMenu: (project: unknown, options: {showTitle: unknown}) => Promise<unknown>;
  /**
   * The mounted app shell. `createDsl4StandardAppShell` can answer with a disabled shell, but this
   * entry only stores one it has already read `runtimeHost` and `diagnostics` off, so the field is
   * the enabled branch.
   */
  shell: RuntimeEntryAppShell | null;
  errorIndicator: ReturnType<typeof createDsl4RuntimeErrorIndicator> | null;
  blockErrorLocation: ReturnType<typeof createDsl4BlockErrorLocation> = null;
  runtimeBlockDiagnosticLocator: ReturnType<typeof createDsl4RuntimeBlockDiagnosticLocator> | null =
    null;
  errorPresentation = 0;
  warningIndicator: ReturnType<typeof createDsl4RuntimeWarningIndicator> | null;
  binaryRuntimeSurface: unknown;
  pendingStart: RuntimeEntryPendingStart | null;
  status: string;
  // Keep the capability marker when a static bundle strips its member Gallery headers.
  readonly narrativeControlCapability = DSL4_NARRATIVE_CONTROL
    ? '// Kamishibai capabilities: narrative-control-v1'
    : undefined;
  lastError: string;
  titleLocale: RuntimeEntryLocale;
  selectedProject: Readonly<Record<string, unknown>> | null;
  previewShell: RuntimeEntryPreviewShell | null;
  previewLiveReload: (RuntimeEntryRuntimeInvoker & RuntimeEntryDisposable) | null;
  previewDebugExecution: RuntimeEntryDisposable | null;
  previewGenerationComponents: RuntimeEntryGenerationComponents | null;
  previewHasCurrent: boolean;
  distributionBuildStatus: string;
  fileInput: RuntimeEntryFileInput | null;
  applicationMenu: ReturnType<typeof createDsl4RuntimeApplicationMenu> | null;
  computePreferences = createDsl4ComputePreferences({globalObject: globalThis});
  computeSettings: ReturnType<typeof createDsl4ComputeSettings> | null = null;

  titleControls: ReturnType<typeof createDsl4RuntimeTitleControls> | null;
  sourceChooser: RuntimeEntrySourceChooser | null;
  /** The camera the person granted on the title, held for as long as the story runs. */
  cameraPermission: ReturnType<typeof createCameraPermissionOwner>;
  cameraPermissionGate: ReturnType<typeof createDsl4UserMediaGate> | null;
  cameraPermissionContainer: {remove(): void} | null;
  cameraControls: Dsl4CameraControlsController | null;
  cameraTitleGeneration = 0;

  constructor(Scratch: RuntimeEntryScratch) {
    this.Scratch = Scratch;
    if (Scratch.gui?.getBlockly) {
      void Scratch.gui
        .getBlockly()
        .then((Blockly) => {
          const host = Blockly as Partial<EmbeddedYamlRootShapeHost>;
          // Only the shared editor adapter exposes the supported extension registry.
          if (host.Extensions) registerEmbeddedYamlRootHatShape(host as EmbeddedYamlRootShapeHost);
        })
        .catch(() => {
          // Hosts without the shared editor adapter retain loading diagnostics instead of mutating registration.
        });
    }
    for (const operation of Object.values(yamlBlockOperations))
      Object.defineProperty(this, operation, {value: () => false});
    this.frontend = createDsl4ProductionSourceFrontend(schema, {
      runtimeStateExpressionsEnabled: productionFeatureFlags.dsl4ExpressionRuntimeState,
      narrativeControlEnabled: productionFeatureFlags.dsl4NarrativeControl,
    });
    this.coreActionBlockAdapter = createDsl4TurboWarpCoreActionBlockAdapter(schema);
    this.shell = null;
    this.errorIndicator = null;
    this.warningIndicator = null;
    this.binaryRuntimeSurface = null;
    this.pendingStart = null;
    this.operation = Promise.resolve();
    this.status = 'ready';
    this.lastError = '';
    this.titleLocale = browserLocale(Scratch.translate?.language);
    this.selectedProject = null;
    this.previewShell = null;
    this.previewLiveReload = null;
    this.previewDebugExecution = null;
    this.previewGenerationComponents = null;
    this.previewHasCurrent = false;
    this.distributionBuildStatus = '';
    this.fileInput = null;
    this.applicationMenu = null;
    this.titleControls = null;
    this.sourceChooser = null;

    this.turboWarpHost = createTurboWarpRuntimeHost({Scratch, requireUnsandboxed: true});
    this.cameraPermission = createCameraPermissionOwner(() => this.turboWarpHost.runtime);
    this.cameraPermissionGate = null;
    this.cameraPermissionContainer = null;
    this.cameraControls = null;
    this.turboWarpHost.onRuntimeEvent('PROJECT_STOP_ALL', () =>
      this.enqueue(() => this.stop('project-stop-all'), 'shutdown'),
    );
    // The first title is drawn from here, before the project exists, so the camera step cannot
    // read the story yet. The project arriving is the moment it can.
    this.turboWarpHost.onRuntimeEvent('PROJECT_LOADED', () => {
      // The GUI clears camera providers at the project boundary. Its old registration handle
      // cannot be revived with update(), so release it and register after all boundary handlers.
      this.cameraTitleGeneration += 1;
      const previousCameraControls = this.cameraControls;
      this.cameraControls = null;
      for (const dispose of [
        () => previousCameraControls?.dispose(),
        () => this.disposeCameraPermissionGate(),
      ]) {
        try {
          dispose();
        } catch (error) {
          console.warn('[Kamishibai DSL 4.0] camera controls cleanup failed.', loggedError(error));
        }
      }
      queueMicrotask(() => {
        this.computeSettings?.dispose();
        this.computeSettings = null;
        this.ensureComputeSettings();
      });
      this.retryCameraPermissionGateAfterStack();
    });
    if (
      DSL4_AUTHORING_PROFILE &&
      (assetIconPreviewsEnabledAtStartup || blockIconPreviewsEnabledAtStartup) &&
      typeof Scratch.gui?.blockEditors?.registerPreview === 'function'
    ) {
      installDsl4BlockIconPreviews({
        Scratch,
        assetEnabled: assetIconPreviewsEnabledAtStartup,
        sceneActionEnabled: blockIconPreviewsEnabledAtStartup,
        sourceFrontend: this.frontend,
        schema,
        runtimeVersion: extensionVersion,
        resolveTMPoseRuntime: resolveBundledTMRuntime,
        limits,
      });
    }
    if (DSL4_AUTHORING_PROFILE) this.installDropTarget();
    this.ensureComputeSettings();
    this.ensureTitleControls()?.show(this.titleLocale);
    this.ensureCameraPermissionGate(this.titleLocale);
    // Static bundle members register synchronously after this member. Retry after that stack,
    // before the first paint, so a temporary permission fallback does not mask Camera Source.
    this.retryCameraPermissionGateAfterStack();
    this.setStageCursor('pointer');
    registerKamishibaiEmbeddedYamlProvider(Scratch.vm, {
      sourceFrontend: this.frontend,
      // Explicit Editor requests use the host's fetch; playback keeps the extension's own.
      ...(typeof globalThis.fetch === 'function' ? {fetch: globalThis.fetch.bind(globalThis)} : {}),
    });
  }

  getInfo() {
    const {ArgumentType, BlockType} = this.Scratch;
    const coreActionSurface = createDsl4TurboWarpCoreActionBlockSurface(
      {ArgumentType, BlockType},
      {visible: productionFeatureFlags.dsl4TurboWarpActionSurface},
    );
    const runtimeVariableSurface = createDsl4TurboWarpRuntimeVariableBlockSurface(
      {ArgumentType, BlockType},
      {stateVisible: productionFeatureFlags.dsl4TurboWarpStateSurface === true},
    );
    return {
      id: extensionId,
      name: 'Kamishibai DSL 4.0 Runtime',
      description:
        'TurboWarp Kamishibai runtime. This source-composed extension preserves the original component notices in its source header.',
      docsURI:
        'https://kubohiroya.github.io/turbowarp-kamishibai-docs/4.0/turbowarp-programmer-guides/dsl-4.0-runtime-block-reference/',
      blockIconURI,
      creator: 'Hiroya Kubo',
      license: 'MPL-2.0',
      credits: dsl4RuntimeProvenance
        .map(
          (component) =>
            `${component.title} — ${component.copyright} — ${component.license} (${component.source}@${component.version})`,
        )
        .join('\n'),
      blocks: [
        {
          ...createDsl4EmbeddedYamlRootDefinition(BlockType),
          hideFromPalette: !documentViewsEnabledAtStartup,
        },
        createDsl4EmbeddedYamlHatDefinition(BlockType),
        createDsl4EmbeddedYamlConfigHatDefinition(BlockType),
        {
          ...createDsl4EmbeddedYamlIncludeDefinition({
            BlockType: {COMMAND: BlockType.COMMAND ?? 'command'},
          }),
          hideFromPalette: !documentViewsEnabledAtStartup,
        },
        ...createYamlBlockDefinitions().map((definition) => ({
          ...definition,
          hideFromPalette: definition.hideFromPalette || !documentViewsEnabledAtStartup,
        })),
        ...coreActionSurface.blocks,
        ...runtimeVariableSurface.blocks,
        {
          opcode: 'versionReporter',
          blockType: BlockType.REPORTER,
          text: 'Kamishibai DSL 4.0 runtime version',
          hideFromPalette: true,
          disableMonitor: true,
        },
        {
          opcode: 'statusReporter',
          blockType: BlockType.REPORTER,
          text: 'Kamishibai DSL 4.0 runtime status',
          hideFromPalette: true,
          disableMonitor: true,
        },
        {
          opcode: 'lastErrorReporter',
          blockType: BlockType.REPORTER,
          text: 'Kamishibai DSL 4.0 runtime error',
          hideFromPalette: true,
          disableMonitor: true,
        },
        {
          opcode: 'binaryBackingStatusReporter',
          blockType: BlockType.REPORTER,
          text: 'Kamishibai DSL 4.0 binary backing status',
          hideFromPalette: true,
          disableMonitor: true,
        },
        {
          opcode: 'runtimeDiagnosticsReporter',
          blockType: BlockType.REPORTER,
          text: 'Kamishibai DSL 4.0 runtime diagnostics',
          hideFromPalette: true,
          disableMonitor: true,
        },
        {
          opcode: 'setTextValue',
          blockType: BlockType.COMMAND,
          text: 'set internal text [NAME] to [VALUE]',
          arguments: {
            NAME: {type: ArgumentType.STRING, defaultValue: ''},
            VALUE: {type: ArgumentType.STRING, defaultValue: ''},
          },
          hideFromPalette: true,
        },
        {
          opcode: 'showTitle',
          blockType: BlockType.COMMAND,
          text: 'show title screen',
          hideFromPalette: true,
        },
        {
          opcode: 'closeTitle',
          blockType: BlockType.COMMAND,
          text: 'close title screen',
          hideFromPalette: true,
        },
        {
          opcode: 'openOfficialWebsite',
          blockType: BlockType.COMMAND,
          text: 'open official website',
          hideFromPalette: true,
        },
        {
          opcode: 'toggleTitleLanguage',
          blockType: BlockType.COMMAND,
          text: 'toggle title language',
          hideFromPalette: true,
        },
      ],
      menus: {
        ...coreActionSurface.menus,
        ...runtimeVariableSurface.menus,
        ...createYamlBlockMenus(),
        embeddedYamlVersions: createEmbeddedYamlRootVersionMenu(['4.0']),
        embeddedYamlDocuments: {acceptReporters: false, items: 'embeddedYamlDocumentsMenu'},
        embeddedYamlIncludeDocuments: {
          acceptReporters: false,
          items: 'embeddedYamlIncludeDocumentsMenu',
        },
      },
    };
  }

  embeddedYamlDocumentsMenu() {
    return createEmbeddedYamlDocumentMenu(
      getProviderRegistry(this.Scratch.vm)
        .list()
        .filter((item) => item.reference.providerId === kamishibaiEmbeddedYamlProviderId),
    ).items;
  }

  embeddedYamlIncludeDocumentsMenu() {
    return createEmbeddedYamlDocumentMenu(
      getProviderRegistry(this.Scratch.vm)
        .list()
        .filter(
          (item) =>
            item.reference.providerId === kamishibaiEmbeddedYamlProviderId &&
            item.reference.documentId.startsWith('file:'),
        ),
    ).items;
  }

  embeddedYamlRoot() {
    return false;
  }

  embeddedYamlConfig() {
    return false;
  }

  embeddedYamlInclude() {
    return false;
  }

  embeddedYaml() {
    return false;
  }

  versionReporter() {
    return extensionVersion;
  }

  runtimeVersionReporter() {
    return extensionVersion;
  }

  runtimeVariableInvoker() {
    return this.shell?.runtimeHost ?? this.previewLiveReload;
  }

  runtimeVariableSnapshot() {
    if (!productionFeatureFlags.dsl4TurboWarpStateSurface) return null;
    return (
      (this.runtimeVariableInvoker()?.getRuntimeVariableSnapshot?.() as
        RuntimeEntryStateSnapshot | null | undefined) ?? null
    );
  }

  storyVariableReporter(args: ScratchBlockArguments) {
    const variables = this.runtimeVariableSnapshot()?.storyVariables;
    const name = String(args?.NAME ?? '');
    return variables && Object.hasOwn(variables, name) ? variables[name] : '';
  }

  storyVariableExists(args: ScratchBlockArguments) {
    const variables = this.runtimeVariableSnapshot()?.storyVariables;
    return Boolean(variables && Object.hasOwn(variables, String(args?.NAME ?? '')));
  }

  storyVariableType(args: ScratchBlockArguments) {
    const variables = this.runtimeVariableSnapshot()?.storyVariables;
    const name = String(args?.NAME ?? '');
    return variables && Object.hasOwn(variables, name) ? typeof variables[name] : 'unknown';
  }

  storyStatusReporter() {
    return this.runtimeVariableSnapshot()?.runtime?.status ?? 'idle';
  }

  currentSceneIdReporter() {
    return this.runtimeVariableSnapshot()?.runtime?.['scene.id'] ?? '';
  }

  currentActionNumberReporter() {
    return this.runtimeVariableSnapshot()?.runtime?.['action.number'] ?? 0;
  }

  currentActionPathReporter() {
    return this.runtimeVariableSnapshot()?.runtime?.['action.path'] ?? '';
  }

  lastRuntimeErrorCodeReporter() {
    return this.runtimeVariableSnapshot()?.diagnostic?.code ?? '';
  }

  lastRuntimeErrorStoryPathReporter() {
    return this.runtimeVariableSnapshot()?.diagnostic?.storyPath ?? '';
  }

  posePhaseReporter() {
    return this.runtimeVariableSnapshot()?.runtime?.['pose.phase'] ?? 'inactive';
  }

  poseTargetReporter() {
    return this.runtimeVariableSnapshot()?.runtime?.['pose.target'] ?? '';
  }

  poseNameReporter() {
    return this.runtimeVariableSnapshot()?.runtime?.['pose.name'] ?? '';
  }

  poseStepNumberReporter() {
    return this.runtimeVariableSnapshot()?.runtime?.['pose.stepNumber'] ?? 0;
  }

  applicationStatusReporter() {
    return productionFeatureFlags.dsl4TurboWarpStateSurface ? this.status : 'ready';
  }

  canNavigateToPreviousAction() {
    if (!productionFeatureFlags.dsl4TurboWarpStateSurface) return false;
    const state = this.runtimeVariableInvoker()?.getState?.() as
      | Readonly<{
          historyEnabled?: boolean;
          history?: Readonly<{
            mode?: string;
            actionCursor?: number;
            actionEntries?: readonly unknown[];
          }>;
          runtime?: Readonly<{status?: string}>;
        }>
      | undefined;
    return Boolean(
      state?.historyEnabled &&
      typeof state.history?.actionCursor === 'number' &&
      state.history.actionCursor > 0,
    );
  }

  canNavigateToNextAction() {
    if (!productionFeatureFlags.dsl4TurboWarpStateSurface) return false;
    const state = this.runtimeVariableInvoker()?.getState?.() as
      | Readonly<{
          historyEnabled?: boolean;
          history?: Readonly<{
            mode?: string;
            actionCursor?: number;
            actionEntries?: readonly unknown[];
          }>;
          runtime?: Readonly<{status?: string}>;
        }>
      | undefined;
    if (state?.historyEnabled && state?.history?.mode === 'history') {
      return (
        typeof state.history.actionCursor === 'number' &&
        Array.isArray(state.history.actionEntries) &&
        state.history.actionCursor < state.history.actionEntries.length
      );
    }
    return state?.runtime?.status === 'running';
  }

  statusReporter() {
    return this.status;
  }

  lastErrorReporter() {
    return this.lastError;
  }

  binaryBackingStatusReporter() {
    const backing = this.shell?.runtimeHost?.sessionBinaryBacking;
    return JSON.stringify({
      surface: this.binaryRuntimeSurface,
      backing: backing?.getState?.() ?? null,
    });
  }

  runtimeDiagnosticsReporter() {
    const runtimeHost = this.shell?.runtimeHost;
    return JSON.stringify({
      status: this.status,
      surface: this.binaryRuntimeSurface,
      runtime: runtimeHost?.getState?.().runtime ?? null,
      resources: runtimeHost?.diagnostics?.getState?.() ?? null,
      backing: runtimeHost?.sessionBinaryBacking?.getState?.() ?? null,
    });
  }

  setTextValue() {}

  showTitle() {
    return this.enqueue(() => this.restart(), 'initialization');
  }

  closeTitle() {
    const pendingStart = this.pendingStart;
    if (!pendingStart || pendingStart.shell !== this.shell) {
      if (this.status === 'title') this.hideScratchTitle();
      if (this.status === 'ready') {
        return this.enqueue(async () => {
          await this.restart();
          return this.pendingStart?.start();
        }, 'initial-title-close');
      }
      return undefined;
    }
    return pendingStart.start();
  }

  requestCloseTitle() {
    const threads = this.turboWarpHost.startHats('event_whenbroadcastreceived', {
      BROADCAST_OPTION: 'closeTitle',
    });
    if (threads.length === 0) return this.closeTitle();
    return undefined;
  }

  openOfficialWebsite() {
    if (this.shell?.titleElement) {
      this.shell.openOfficialWebsite();
      return;
    }
    const opener = globalThis.open;
    if (typeof opener === 'function') {
      opener(appShellCommon.about.officialWebsite.url, '_blank', 'noopener,noreferrer');
    }
  }

  toggleTitleLanguage() {
    this.titleLocale = this.titleLocale === 'ja' ? 'en' : 'ja';
    this.showScratchTitle(this.titleLocale);
  }

  actionInvoker(): RuntimeEntryActionInvoker {
    const invoker = this.shell?.runtimeHost ?? this.previewLiveReload;
    if (
      !invoker ||
      typeof invoker.invokeAction !== 'function' ||
      typeof invoker.rejectActionInvocation !== 'function'
    ) {
      const error = new Error('A running DSL 4.0 story is required for action blocks');
      Object.defineProperty(error, 'code', {value: 'K4-BLOCK-RUNTIME-INACTIVE'});
      throw error;
    }
    return invoker as RuntimeEntryActionInvoker;
  }

  async invokeCoreActionBlock(command: string, args: ScratchBlockArguments) {
    let invoker;
    try {
      invoker = this.actionInvoker();
      const action = this.coreActionBlockAdapter.createAction(command, args);
      return await invoker.invokeAction(action);
    } catch (error) {
      if (invoker) {
        try {
          await invoker.rejectActionInvocation(error);
        } catch {
          // The original normalized block failure remains authoritative.
        }
      }
      this.reportFailure(error, `action-${command}`);
      return undefined;
    }
  }

  stage(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('stage', args);
  }

  bgm(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('bgm', args);
  }

  stopBgm(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('stopBgm', args);
  }

  audio(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('audio', args);
  }

  audioControl(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('audioControl', args);
  }

  video(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('video', args);
  }

  videoControl(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('videoControl', args);
  }

  setBgmVolume(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('setBgmVolume', args);
  }

  sound(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('sound', args);
  }

  wait(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('wait', args);
  }

  debugger(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('debugger', args);
  }

  broadcastMessageAndWait(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('broadcastMessageAndWait', args);
  }

  transition(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('transition', args);
  }

  goto(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('goto', args);
  }

  gotoSegment(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('gotoSegment', args);
  }

  branch(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('branch', args);
  }

  setVariable(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('setVariable', args);
  }

  changeVariable(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('changeVariable', args);
  }

  toggleVariable(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('toggleVariable', args);
  }

  keyInputToChangeScene(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('keyInputToChangeScene', args);
  }

  touchInputToChangeScene(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('touchInputToChangeScene', args);
  }

  poseInputToChangeScene(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('poseInputToChangeScene', args);
  }

  imageInputToChangeScene(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('imageInputToChangeScene', args);
  }

  show(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('show', args);
  }

  hide(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('hide', args);
  }

  setTransparency(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('setTransparency', args);
  }

  moveTo(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('moveTo', args);
  }

  say(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('say', args);
  }

  think(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('think', args);
  }

  sayText(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('sayText', args);
  }

  thinkText(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('thinkText', args);
  }

  setSkin(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('setSkin', args);
  }

  setLayer(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('setLayer', args);
  }

  loop(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('loop', args);
  }

  setText(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('setText', args);
  }

  pose(args: ScratchBlockArguments) {
    return this.invokeCoreActionBlock('pose', args);
  }

  ensureApplicationMenu() {
    if (this.applicationMenu) return this.applicationMenu;
    const document = globalThis.document;
    if (!document || Array.isArray(document.scripts)) return null;
    try {
      this.applicationMenu = createDsl4RuntimeApplicationMenu({
        document,
        mount: resolveRuntimeMount(this.Scratch),
        locales: {
          en: appShellLocales.en.ui,
          ja: appShellLocales.ja.ui,
        },
        icons: applicationMenuIcons,
        openVisible: DSL4_AUTHORING_PROFILE,
        ...(DSL4_AUTHORING_PROFILE ? {onOpen: () => this.openStoryFile()} : {}),
        onReload: () => this.reloadStory(),
        ...(DSL4_AUTHORING_PROFILE
          ? {
              onBuild: () => this.buildDistributionSb3(),
              onBuildCompiled: () => this.buildDistributionSb3('compiled'),
            }
          : {}),
        onAbout: () => this.showAbout(),
        onLocaleChange: (locale) => {
          this.titleLocale = locale;
          this.showScratchMenu(locale);
        },
        onError: (error) => this.reportFailure(error, 'application-menu'),
        reloadEnabled: this.selectedProject !== null || this.shell !== null,
        buildVisible: false,
        buildEnabled: false,
      });
    } catch (error) {
      console.error('[Kamishibai DSL 4.0] application-menu failed.', loggedError(error));
      return null;
    }
    return this.applicationMenu;
  }

  tmComputeOptions() {
    const compute = (
      globalThis as typeof globalThis & {tmCompute?: TMCompositionOptions['compute']}
    ).tmCompute;
    if (!compute) throw new Error('Teachable Machine 4.0.2 compute runtime is not initialized');
    return {
      compute,
      computeMode: this.computePreferences.getMode(),
      // Preview factories outlive a story generation; read the current preference at creation.
      createTMComposition: (options: TMCompositionOptions) =>
        createTMComposition({
          ...options,
          compute,
          computeMode: this.computePreferences.getMode(),
        }),
    };
  }

  ensureComputeSettings() {
    if (this.computeSettings) return this.computeSettings;
    const document = globalThis.document;
    if (!document || Array.isArray(document.scripts) || !document.defaultView) return null;
    const stageControls =
      this.Scratch.gui?.stageControls ??
      getRuntimeControlsDock({
        document,
        locale: this.Scratch.translate?.language || globalThis.navigator?.language || 'en',
      }).stageControls;
    this.computeSettings = createDsl4ComputeSettings({
      document,
      stageControls,
      getLocale: () => this.titleLocale,
      preferences: this.computePreferences,
      getSelection: () => this.tmComputeOptions().compute.getSelection(),
      onClose() {},
      onApply: async (mode) => {
        // Restart owns disposal. Never switch the shared backend while old models still exist.
        this.computePreferences.setMode(mode);
        if (this.previewShell && this.previewHasCurrent) {
          await this.previewShell.restart('storyStart');
          return;
        }
        if (this.shell || this.selectedProject) {
          const project =
            this.selectedProject ??
            normalizeDsl4VmProjectSnapshot(
              JSON.parse(
                DSL4_AUTHORING_PROFILE
                  ? this.Scratch.vm.toJSON(undefined, {allowOptimization: false})
                  : this.Scratch.vm.toJSON(),
              ),
            );
          await this.stop('compute-mode-change');
          await this.enqueue(
            () =>
              this.restart({
                projectOverride: project,
                showTitle: false,
                forceStory: true,
              }),
            'compute-mode-change',
          );
        }
      },
    });
    return this.computeSettings;
  }

  ensureTitleControls() {
    if (this.titleControls) return this.titleControls;
    const document = globalThis.document;
    if (!document || Array.isArray(document.scripts)) return null;
    try {
      this.titleControls = createDsl4RuntimeTitleControls({
        document,
        mount: resolveRuntimeMount(this.Scratch),
        locales: {
          en: {
            website: appShellLocales.en.about.officialWebsite.name,
            close: appShellLocales.en.ui.close,
          },
          ja: {
            website: appShellLocales.ja.about.officialWebsite.name,
            close: appShellLocales.ja.ui.close,
          },
        },
        websiteIconUrl: officialWebsiteIcon,
        onWebsite: () => this.openOfficialWebsite(),
        onClose: () => this.requestCloseTitle(),
        onError: (error) => this.reportFailure(error, 'title-controls'),
      });
    } catch (error) {
      console.error('[Kamishibai DSL 4.0] title-controls failed.', loggedError(error));
      return null;
    }
    return this.titleControls;
  }

  reloadStory() {
    if (this.status !== 'menu') return undefined;
    if (this.previewShell && this.previewHasCurrent) {
      const previewShell = this.previewShell;
      this.hideScratchMenu();
      this.status = 'starting';
      return this.enqueue(async () => {
        try {
          await previewShell.restart('storyStart');
        } catch (error) {
          if (this.status !== 'error') {
            this.status = 'menu';
            this.showScratchMenu(this.titleLocale);
          }
          throw error;
        }
      }, 'story-reload');
    }
    const packagedProject = normalizeDsl4VmProjectSnapshot(
      JSON.parse(
        DSL4_AUTHORING_PROFILE
          ? this.Scratch.vm.toJSON(undefined, {allowOptimization: false})
          : this.Scratch.vm.toJSON(),
      ),
    );
    const project =
      this.selectedProject ??
      (packagedApplicationMode(packagedProject) === 'story' ? packagedProject : null);
    if (!project) return undefined;
    return this.enqueue(
      () => this.restart({projectOverride: project, showTitle: false, forceStory: true}),
      'story-reload',
    );
  }

  showAbout() {
    if (this.status !== 'menu') return undefined;
    const shell = this.shell;
    this.hideScratchMenu();
    this.pendingStart = {
      shell,
      start: async () => {
        if (this.shell !== shell) return;
        this.pendingStart = null;
        this.hideScratchTitle();
        this.showScratchMenu(this.titleLocale);
        this.status = 'menu';
      },
    };
    this.status = 'title';
    this.showScratchTitle(this.titleLocale);
    return undefined;
  }

  setTargetCostume(target: RuntimeEntryStageTarget | null | undefined, costumeName: string) {
    const costumes = target?.sprite?.costumes;
    const index = Array.isArray(costumes)
      ? costumes.findIndex((costume) => costume?.name === costumeName)
      : -1;
    if (index < 0 || typeof target?.setCostume !== 'function') {
      throw new Error(`The packaged title costume is unavailable: ${costumeName}`);
    }
    target.setCostume(index);
  }

  setStageCursor(cursor: string) {
    const canvas = this.Scratch?.vm?.renderer?.canvas;
    if (canvas?.style) canvas.style.cursor = cursor;
    const mount = resolveRuntimeMount(this.Scratch);
    if (mount?.style) mount.style.cursor = cursor;
  }

  hideAllDisplayTargets() {
    for (const target of this.turboWarpHost.spriteTargets() as RuntimeEntryStageTarget[]) {
      if (typeof target?.setVisible === 'function') target.setVisible(false);
    }
  }

  showScratchTitle(locale: RuntimeEntryLocale) {
    this.previewShell?.setReloadVisible(false);
    const stage = this.turboWarpHost.getStageTarget() as RuntimeEntryStageTarget | null;
    this.shell?.hideTitle();
    this.hideScratchMenu();
    this.setTargetCostume(stage, locale === 'ja' ? 'TitleRuntime' : 'Title');
    this.ensureTitleControls()?.show(locale);
    this.ensureCameraPermissionGate(locale);
    this.setStageCursor('pointer');
  }

  /**
   * Offer the camera while the title is up, for a story that recognises poses.
   *
   * This is the only moment with both halves in hand: the person is looking at a title they have
   * to tap anyway, and `<usermedia>` needs a tap of its own to open the browser's prompt. By the
   * time the runtime host exists the title is gone, which is why the question is answered from
   * the packaged source here rather than from the parsed document later.
   *
   * It is attempted on every title and gives up quietly: the project may not be loaded yet on the
   * first one, and the next title tries again.
   */
  cameraControlsSource() {
    return readDsl4CameraControlsSource(this.turboWarpHost.runtime);
  }

  retryCameraPermissionGateAfterStack() {
    const generation = this.cameraTitleGeneration;
    queueMicrotask(() => {
      if (
        this.cameraTitleGeneration !== generation ||
        (this.status !== 'ready' && this.status !== 'title')
      )
        return;
      try {
        this.ensureCameraPermissionGate(this.titleLocale);
      } catch (error) {
        console.warn('[Kamishibai DSL 4.0] camera controls unavailable.', loggedError(error));
      }
    });
  }

  cameraPreviewControlOptions() {
    const source = this.cameraControlsSource();
    return {
      container: resolveRuntimeMount(this.Scratch),
      getPreviewRect: () => resolveCameraPreviewRect(this.Scratch),
      schedule: scheduleCameraPreviewControlFrame,
      labels: appShellCameraPreviewControlLabels[browserLocale()],
      ...(source
        ? {
            createControls: (options: {
              port: unknown;
              labels: Readonly<Record<string, string>>;
              mirroring: string;
            }) => {
              const control = source.registerCameraControls!({
                port: options.port,
                mirroring: options.mirroring,
                owner: 'kamishibai-preview',
                cameraId: 'pose',
                locale: this.Scratch.translate?.language || browserLocale(),
              });
              if (!control) throw new Error('Camera Source could not register preview controls');
              return control;
            },
          }
        : {}),
      onError: (error: unknown, context: Readonly<Record<string, string>>) => {
        console.warn(
          `[Kamishibai DSL 4.0] camera preview control ${context.operation} failed.`,
          loggedError(error),
        );
      },
    };
  }

  ensureCameraPermissionGate(locale: RuntimeEntryLocale) {
    if (!dsl4StandardProductionFeatureFlags.dsl4UserMediaPermissionGate) return;
    if (this.cameraControls) return;
    const document = globalThis.document;
    const mount = resolveRuntimeMount(this.Scratch);
    if (!document || !mount) return;
    // `vm.toJSON()` carries the same story, but it serializes the whole project to get there --
    // 28ms to write and 16ms to parse for a 20MB tutorial, on the frame the title should be
    // appearing. The runtime keeps extension storage as an object, and the story is a few KB of
    // it, so read that instead.
    const extensionStorage = (this.turboWarpHost.runtime as {extensionStorage?: unknown})
      .extensionStorage;
    const projectContext = createDsl4CameraProjectContext(this.turboWarpHost.targets());
    if (!packagedStoryUsesPoseRecognition(this.frontend, {...projectContext, extensionStorage}))
      return;
    const source = this.cameraControlsSource();
    if (source) {
      this.cameraControls = connectDsl4TitleCameraControls({
        source,
        locale: this.Scratch.translate?.language || locale,
        disposeFallback: () => this.disposeCameraPermissionGate(),
        onError: (error) => {
          console.warn('[Kamishibai DSL 4.0] camera controls unavailable.', loggedError(error));
        },
      });
      if (this.cameraControls) return;
    }
    if (this.cameraPermissionGate || !supportsDsl4UserMediaGate(globalThis)) return;
    const container = createCameraPermissionMount(document, mount as Element);
    this.cameraPermissionGate = createDsl4UserMediaGate({
      document,
      container,
      labels: appShellCameraPermissionLabels[locale],
      constraints: cameraPermissionConstraints,
      adopt: (stream: unknown) => this.cameraPermission.adopt(stream),
      onOutcome: (outcome: string, detail?: unknown) => {
        if (outcome === 'granted') return;
        // Declining is a choice, not a fault: the story runs, and recognition opens a camera for
        // itself when it needs one.
        console.warn(
          `[Kamishibai DSL 4.0] camera permission ${outcome}.`,
          detail === undefined ? '' : loggedError(detail),
        );
      },
    });
    this.cameraPermissionContainer = container;
  }

  disposeCameraPermissionGate() {
    const gate = this.cameraPermissionGate;
    const container = this.cameraPermissionContainer;
    this.cameraPermissionGate = null;
    this.cameraPermissionContainer = null;
    gate?.dispose();
    container?.remove();
  }

  hideScratchTitle() {
    this.cameraTitleGeneration += 1;
    this.titleControls?.hide();
    // The title is over, so the offer is too: asking from here on would ask over the story.
    this.disposeCameraPermissionGate();
    this.setStageCursor('auto');
  }

  showScratchMenu(locale: RuntimeEntryLocale) {
    this.previewShell?.setReloadVisible(false);
    const stage = this.turboWarpHost.getStageTarget() as RuntimeEntryStageTarget | null;
    this.hideScratchTitle();
    this.sourceChooser?.hide();
    this.setTargetCostume(stage, locale === 'ja' ? 'MenuRuntime' : 'Menu');
    const menu = this.ensureApplicationMenu();
    menu?.setReloadEnabled(
      this.selectedProject !== null || this.shell !== null || this.previewHasCurrent,
    );
    const previewShell = this.previewShell;
    const buildVisible =
      DSL4_AUTHORING_PROFILE && previewShell !== null && this.isDistributionBuildEnabled();
    const buildState = buildVisible
      ? previewShell.getDistributionBuildState()
      : {enabled: false, reason: null};
    menu?.setBuildState({
      visible: buildVisible,
      enabled: buildState.enabled === true,
      status:
        this.distributionBuildStatus ||
        (buildVisible && buildState.enabled !== true
          ? (
              appShellLocales as Readonly<
                Record<RuntimeEntryLocale, {ui: {buildUnavailable: string}}>
              >
            )[locale].ui.buildUnavailable
          : ''),
    });
    menu?.show(locale);
    this.setStageCursor('pointer');
  }

  hideScratchMenu() {
    this.applicationMenu?.hide();
    this.setStageCursor('auto');
  }

  enqueue(operation: () => unknown | Promise<unknown>, phase = 'operation') {
    this.operation = this.operation.then(operation, operation).catch((error: unknown) => {
      this.reportFailure(error, phase);
    });
    return this.operation;
  }

  reportFailure(failure: unknown, phase: string) {
    this.showFailure(failure, {phase});
    console.error(`[Kamishibai DSL 4.0] ${phase} failed.`, loggedError(failure));
  }

  showSessionBackingWarning(warning: unknown) {
    const diagnostic = createDsl4SessionBackingWarningDiagnostic(warning, browserLocale());
    try {
      this.warningIndicator ??= createDsl4RuntimeWarningIndicator({
        document: globalThis.document,
        mount: resolveRuntimeMount(this.Scratch),
      });
      this.warningIndicator.show(diagnostic);
    } catch (indicatorError) {
      console.error('Kamishibai DSL 4.0 warning indicator failed.', indicatorError);
    }
    console.warn('[Kamishibai DSL 4.0] session-binary-backing warning.', warning);
  }

  showSessionBackingFatal(failure: unknown) {
    const diagnostic = createDsl4SessionBackingFatalDiagnostic(failure, browserLocale());
    this.warningIndicator?.hide();
    this.reportFailure(diagnostic, 'session-binary-backing');
  }

  showFailure(failure: unknown, {returnToMenu = true, phase = ''} = {}) {
    this.previewShell?.setReloadVisible(false);
    const failureRecord = failure as RuntimeEntryFailureRecord | null | undefined;
    const message = String(failureRecord?.message ?? failure ?? 'DSL 4.0 story execution failed.');
    const code = typeof failureRecord?.code === 'string' ? failureRecord.code : '';
    const locale = browserLocale(this.Scratch.translate?.language);
    const presentation = ++this.errorPresentation;
    const host = this.Scratch as unknown as Dsl4BlockErrorHost;
    this.blockErrorLocation?.clearHighlight();
    const details =
      typeof failure === 'object' && failure !== null ? (failure as Record<string, unknown>) : {};
    const failureContext =
      details.failureContext && typeof details.failureContext === 'object'
        ? (details.failureContext as Record<string, unknown>)
        : {causes: runtimeErrorCauses(failure)};
    const diagnostic = {...details, message, code, phase, failureContext};
    const located = this.runtimeBlockDiagnosticLocator?.(diagnostic) ?? diagnostic;
    this.blockErrorLocation = createDsl4BlockErrorLocation(host, located, locale);
    const title = isSourceDiagnostic(code)
      ? appShellLocales[locale].ui.invalidScript
      : runtimeErrorTitles[locale];
    this.status = 'error';
    this.lastError = message;
    this.hideScratchTitle();
    this.hideScratchMenu();
    this.sourceChooser?.hide();
    try {
      this.errorIndicator ??= createDsl4RuntimeErrorIndicator({
        document: globalThis.document,
        mount: resolveRuntimeMount(this.Scratch),
        initialLocale: locale,
        runtimeVersion: extensionVersion,
        locales: {
          en: {title: appShellLocales.en.ui.invalidScript},
          ja: {title: appShellLocales.ja.ui.invalidScript},
        },
        onReturnToMenu: () => {
          this.showScratchMenu(this.titleLocale);
          this.status = 'menu';
          this.errorPresentation += 1;
          this.blockErrorLocation?.clearHighlight();
          this.blockErrorLocation = null;
          const indicator = this.errorIndicator;
          this.errorIndicator = null;
          indicator?.dispose();
        },
        onLocateBlock: () => {
          const expected = this.errorPresentation;
          return (
            this.blockErrorLocation?.locate(() => expected === this.errorPresentation) ?? false
          );
        },
      });
      const render = () => {
        const location = this.blockErrorLocation;
        this.errorIndicator?.show(
          {...located, ...location, title},
          {returnToMenu, locateBlock: location?.canLocate === true},
        );
      };
      render();
      if (this.blockErrorLocation && host.gui?.getBlockly) {
        void host.gui
          .getBlockly()
          .then((blocks) => {
            if (presentation !== this.errorPresentation || this.status !== 'error') return;
            this.blockErrorLocation = createDsl4BlockErrorLocation(host, located, locale, blocks);
            render();
          })
          .catch(() => {
            // Keep the initial diagnostic if the editor's Blockly API is unavailable.
          });
      }
    } catch (indicatorError) {
      console.error('Kamishibai DSL 4.0 error indicator failed.', indicatorError);
    }
  }

  async stop(reason: string) {
    this.computeSettings?.hide();
    this.previewShell?.setReloadVisible(false);
    this.errorPresentation += 1;
    this.blockErrorLocation?.clearHighlight();
    this.blockErrorLocation = null;
    this.runtimeBlockDiagnosticLocator = null;
    this.pendingStart = null;
    this.hideScratchTitle();
    this.hideScratchMenu();
    this.sourceChooser?.hide();
    const errorIndicator = this.errorIndicator;
    this.errorIndicator = null;
    errorIndicator?.dispose();
    const warningIndicator = this.warningIndicator;
    this.warningIndicator = null;
    warningIndicator?.dispose();
    const shell = this.shell;
    this.shell = null;
    this.binaryRuntimeSurface = null;
    // The page asked for this camera, so the page turns it off. Camera Source leaves the tracks of
    // an adopted stream alone, which is what keeps other readers alive while the story runs.
    this.cameraControls?.dispose();
    this.cameraControls = null;
    this.cameraPermission.release();
    const previewShell = this.previewShell;
    const previewLiveReload = this.previewLiveReload;
    const previewDebugExecution = this.previewDebugExecution;
    this.previewShell = null;
    this.previewLiveReload = null;
    this.previewDebugExecution = null;
    this.previewGenerationComponents = null;
    this.previewHasCurrent = false;
    this.distributionBuildStatus = '';
    const failures = [];
    for (const dispose of [
      shell ? () => shell.dispose(reason) : null,
      previewShell ? () => previewShell.dispose() : null,
      previewLiveReload ? () => previewLiveReload.dispose() : null,
      previewDebugExecution ? () => previewDebugExecution.dispose() : null,
    ]) {
      if (!dispose) continue;
      try {
        await dispose();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(failures, 'DSL 4.0 runtime cleanup failed');
    }
    if (['running', 'starting', 'title'].includes(this.status)) this.status = 'stopped';
  }

  async restart({
    projectOverride = null,
    showTitle = true,
    forceStory = false,
  }: {
    projectOverride?: Readonly<Record<string, unknown>> | null;
    showTitle?: boolean;
    forceStory?: boolean;
  } = {}) {
    await this.stop('project-restart');
    this.hideAllDisplayTargets();
    this.status = 'starting';
    this.lastError = '';

    const Scratch = this.Scratch;
    const turboWarpHost = this.turboWarpHost;
    const packagedProject = normalizeDsl4VmProjectSnapshot(
      JSON.parse(
        // Editor diagnostics must refer to live block IDs, before TurboWarp's save optimization.
        DSL4_AUTHORING_PROFILE
          ? Scratch.vm.toJSON(undefined, {allowOptimization: false})
          : Scratch.vm.toJSON(),
      ),
    );
    // A URL script is read again here, so playback never replays a cached remote copy.
    const sourceProject = await resolveKamishibaiDocumentSourceProject(
      (projectOverride ?? this.selectedProject ?? packagedProject) as Record<string, unknown>,
      {
        // Playback uses the extension's own capability, which may expect its Scratch receiver.
        ...(typeof Scratch.fetch === 'function' ? {fetch: Scratch.fetch.bind(Scratch)} : {}),
        documentSourceEnabled: documentSourceEnabledAtStartup,
        replaceSource: (project, source) =>
          buildKamishibaiDocumentSourceProject(project, source, this.frontend),
      },
    );
    assertKamishibaiDocumentSourceReady(sourceProject, {sourceFrontend: this.frontend});
    const project = this.selectedProject
      ? sourceProject
      : await prepareDsl4EmbeddedBlockStoryProject(sourceProject, this.frontend, {
          ...limits,
          subtleCrypto: globalThis.crypto?.subtle,
          onBlockSources: (sources) => {
            this.runtimeBlockDiagnosticLocator = createDsl4RuntimeBlockDiagnosticLocator(
              sources,
              this.Scratch as unknown as Dsl4BlockErrorHost,
            );
          },
        });
    const applicationMode =
      forceStory || this.selectedProject ? 'story' : packagedApplicationMode(project);
    this.titleLocale = browserLocale(Scratch.translate?.language);
    if (applicationMode === 'menu') {
      if (!DSL4_AUTHORING_PROFILE) {
        throw new Error('The playback runtime cannot open a non-embedded authoring project.');
      }
      await this.startAuthoringMenu(project, {showTitle});
      return;
    }
    const thisFrontend = this.frontend;
    const publicationFiles =
      readDsl4ProjectPublication(project) === null
        ? null
        : await Scratch.vm.saveProjectSb3DontZip();
    const publicationStageFactory =
      publicationFiles === null
        ? undefined
        : await createDsl4PublicationVmStageFactory({
            project,
            vm: Scratch.vm,
            document: globalThis.document,
            mount: resolveRuntimeMount(Scratch) as HTMLElement,
            projectFiles: publicationFiles,
          });
    const loadRemoteAsset = createDsl4BrowserRemoteAssetLoader({
      maxBytes: limits.maxTotalAssetBytes,
    });
    let binaryRuntime = await createDsl4PackagedBinaryRuntimeBridge({
      project,
      sourceFrontend: this.frontend,
      ...limits,
      globalObject: globalThis,
      subtleCrypto: globalThis.crypto?.subtle,
    });
    let shell: RuntimeEntryAppShell;
    let started = false;
    const startRuntime = async () => {
      if (started || this.shell !== shell) return;
      started = true;
      this.pendingStart = null;
      shell.hideTitle();
      this.hideScratchTitle();
      this.status = 'running';
      try {
        const result = await shell.runtimeHost.start();
        if (this.shell !== shell) return;
        if (result.status === 'failed') {
          if (this.status !== 'error') {
            this.reportFailure(
              result.diagnostic && typeof result.diagnostic === 'object'
                ? {...result.diagnostic, failureContext: result.failureContext}
                : (result.diagnostic ?? 'DSL 4.0 story execution failed.'),
              'story-runtime',
            );
          }
          return;
        }
        if (result.status === 'finished') {
          await shell.runtimeHost.prepareMenu();
          turboWarpHost.startHats('event_whenbroadcastreceived', {
            BROADCAST_OPTION: 'showCover',
          });
          this.showScratchMenu(this.titleLocale);
          turboWarpHost.startHats('event_whenbroadcastreceived', {
            BROADCAST_OPTION: 'showMenu',
          });
          this.status = 'menu';
          return;
        }
        this.status = result.status;
      } catch (error) {
        if (this.shell !== shell) return;
        if (this.status !== 'error') this.reportFailure(error, 'story-runtime');
      }
    };
    try {
      const shellCandidate = await createDsl4StandardAppShell({
        featureFlags: binaryRuntime
          ? {
              ...productionFeatureFlags,
              dsl4IndexedDBAssetSessionStore: binaryRuntime.sessionBackingEnabled,
            }
          : productionFeatureFlags,
        surface: binaryRuntime ? 'packager' : 'regularEditor',
        document: globalThis.document,
        mount: resolveRuntimeMount(Scratch),
        runtimeHostOptions: {
          runtimeVersion: extensionVersion,
          ...(publicationStageFactory
            ? {
                createPublicationStage: publicationStageFactory,
                async downloadPublication(saveOptions?: {distributionProfile?: 'compiled'}) {
                  const built = await createDsl4PublicationDistributionSb3({
                    project,
                    projectFiles: publicationFiles,
                    sourceFrontend: thisFrontend,
                    ...limits,
                    ...(saveOptions?.distributionProfile
                      ? {distributionProfile: saveOptions.distributionProfile}
                      : {}),
                  });
                  return downloadDsl4BrowserDistributionSb3({...built, globalObject: globalThis});
                },
              }
            : {}),
          project,
          sourceFrontend: this.frontend,
          ...limits,
          ...(binaryRuntime
            ? {
                ...binaryRuntime.runtimeLimits,
                assetBundleFormat: binaryRuntime.assetBundleFormat,
                binaryEntryProvider: binaryRuntime.binaryEntryProvider,
                sessionBacking: binaryRuntime.sessionBacking,
                onSessionBackingWarning: (warning: unknown) =>
                  this.showSessionBackingWarning(warning),
                onSessionBackingFatalError: (failure: unknown) =>
                  this.showSessionBackingFatal(failure),
              }
            : {}),
          runtime: turboWarpHost.runtime,
          onTitleStart() {
            turboWarpHost.startHats('event_whenbroadcastreceived', {
              BROADCAST_OPTION: 'closeTitle',
            });
          },
          createHostPort: async ({runtimeHost}: {runtimeHost: unknown}) =>
            createDsl4TurboWarpTransitionPort({runtimeHost}),
          ...this.tmComputeOptions(),
          tmPoseRuntime: createDsl4ProjectTMRuntime({
            runtime: resolveBundledTMRuntime(),
            globalObject: globalThis,
            project,
          }),
          setLoading() {},
          loadRemoteAsset,
          subtleCrypto: globalThis.crypto?.subtle,
          // The renderer is the host's; the DOM around it is the shell's. Without these a story
          // that declares `preview.controls` is refused at startup, which is what happened to
          // every such story before 4.0.0-rc.18: the options existed only in tests.
          cameraPreviewControls: this.cameraPreviewControlOptions(),
          createObjectURL: (blob: Blob) => URL.createObjectURL(blob),
          revokeObjectURL: (url: string) => URL.revokeObjectURL(url),
        },
      });
      if (!shellCandidate.ok || !shellCandidate.runtimeHost) {
        const message = shellCandidate.diagnostics[0]?.message;
        throw Object.assign(
          new Error(
            message === undefined || message === null
              ? 'The packaged DSL 4.0 story is invalid.'
              : String(message),
          ),
          shellCandidate.diagnostics[0],
        );
      }
      shell = shellCandidate as RuntimeEntryAppShell;
    } catch (error) {
      if (binaryRuntime) {
        try {
          await binaryRuntime.binaryEntryProvider.release();
        } catch (releaseError) {
          throw new AggregateError(
            [error, releaseError],
            'Packaged DSL 4.0 startup and entry source release failed',
          );
        } finally {
          binaryRuntime = null;
        }
      }
      throw error;
    }
    shell.runtimeHost.attach(globalThis.document);

    this.shell = shell;
    this.binaryRuntimeSurface = binaryRuntime?.surface ?? null;
    const startAfterTitle =
      applicationMode === 'story'
        ? startRuntime
        : async () => {
            if (this.shell !== shell) return;
            this.pendingStart = null;
            this.hideScratchTitle();
            this.showScratchMenu(this.titleLocale);
            turboWarpHost.startHats('event_whenbroadcastreceived', {
              BROADCAST_OPTION: 'showMenu',
            });
            this.status = 'menu';
          };
    if (showTitle) {
      this.pendingStart = {shell, start: startAfterTitle};
      this.status = 'title';
      this.showScratchTitle(this.titleLocale);
    } else {
      await startAfterTitle();
    }
  }
}

export type {KamishibaiDsl4RuntimeExtension};

if (DSL4_AUTHORING_PROFILE) {
  installDsl4RuntimeAuthoringProfile(KamishibaiDsl4RuntimeExtension, {
    narrativeControlEnabled: productionFeatureFlags.dsl4NarrativeControl,
    runtimeVersion: extensionVersion,
    limits,
    resolveRuntimeMount,
    resolveBundledTMRuntime,
    loggedError,
    createRemoteAssetLoader: createDsl4BrowserRemoteAssetLoader as (options: object) => unknown,
    createProjectTMRuntime: createDsl4ProjectTMRuntime as unknown as (options: object) => unknown,
    createTransitionPort: createDsl4TurboWarpTransitionPort as unknown as (
      options: object,
    ) => Promise<unknown>,
  });
}

try {
  if (!Scratch?.extensions?.unsandboxed) {
    throw new Error('Kamishibai DSL 4.0 Runtime must run unsandboxed.');
  }
  Scratch.extensions.register(new KamishibaiDsl4RuntimeExtension(Scratch));
} catch (error) {
  console.error('[Kamishibai DSL 4.0] extension-bootstrap failed.', loggedError(error));
  throw error;
}
