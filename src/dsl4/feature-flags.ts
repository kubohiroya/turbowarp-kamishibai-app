import {deepFreeze} from './story-document.js';

const featureFlagKeys = new Set([
  'dsl4NarrativeControl',
  'dsl4Runtime',
  'dsl4Video',
  'dsl4CrossfadeTransitions',
  'dsl4PresentationEffects',
  'dsl4BroadcastMessageAndWait',
  'dsl4IndexedDBAssetSessionStore',
  'dsl4SourceIncludes',
  'dsl4AppShell',
  'dsl4WebPreviewAdapter',
  'dsl4BrowserDistributionBuild',
  'dsl4WebPreviewAssetLiveReload',
  'dsl4PreviewReloadOverlay',
  'dsl4Debugger',
  'dsl4EditorDebugger',
  'dsl4PoseFeedbackModes',
  'dsl4PosePreviewMirroring',
  'dsl4CameraPreviewControls',
  'dsl4UserMediaPermissionGate',
  'dsl4SpeechAdvanceTypewriter',
  'dsl4TurboWarpBubbleAdvancedPresentation',
  'dsl4TurboWarpActionSurface',
  'dsl4TurboWarpStateSurface',
  'dsl4ExpressionRuntimeState',
  'structuredDataIntegrationEnabled',
]);

export const dsl4DefaultFeatureFlags = deepFreeze({
  dsl4NarrativeControl: false,
  dsl4Runtime: false,
  dsl4Video: false,
  dsl4CrossfadeTransitions: false,
  dsl4PresentationEffects: false,
  dsl4BroadcastMessageAndWait: false,
  dsl4IndexedDBAssetSessionStore: false,
  dsl4SourceIncludes: false,
  dsl4AppShell: false,
  dsl4WebPreviewAdapter: false,
  dsl4BrowserDistributionBuild: false,
  dsl4WebPreviewAssetLiveReload: false,
  dsl4PreviewReloadOverlay: false,
  dsl4Debugger: false,
  dsl4EditorDebugger: false,
  dsl4PoseFeedbackModes: false,
  dsl4PosePreviewMirroring: false,
  dsl4CameraPreviewControls: false,
  dsl4UserMediaPermissionGate: false,
  dsl4SpeechAdvanceTypewriter: false,
  dsl4TurboWarpBubbleAdvancedPresentation: false,
  dsl4TurboWarpActionSurface: false,
  dsl4TurboWarpStateSurface: false,
  dsl4ExpressionRuntimeState: false,
  structuredDataIntegrationEnabled: false,
});

// Standard release capabilities are explicit and independent from the globally disabled runtime.
// Speech has no flag: `@kubohiroya/turbowarp-bubble` renders every say and think.
// The state surface is read-only: it reports runtime variables, application status, and action
// history reach. Writing a story variable is a core action (`setVariable`, `changeVariable`,
// `toggleVariable`), so it needs no flag of its own and works from the script alone.
// Pose preview mirroring and the camera preview controls are on because the schema already accepts
// `poseRecognition.preview.mirroring` and `preview.controls`: with the flags off the runtime read
// those keys and did nothing, without a diagnostic.
// The broadcast action and the advanced Bubble style keys are on for the same reason: the schema
// publishes `broadcastMessageAndWait` as an action and `reveal`/`audio`/the Bubble animations as
// bubble style keys, so refusing them at startup made the schema advertise what it could not run.
// `dsl4UserMediaPermissionGate` draws the camera permission step on the title of a pose story,
// where the browser carries `<usermedia>`. It is on because the step only appears when all three
// hold -- the flag, the element, and a story that recognises poses -- and because a story that
// asks once on its title is better than one that interrupts the first pose scene with a prompt.
// Everywhere else the camera is opened the way it always has been.
// `dsl4IndexedDBAssetSessionStore` lets binary-entry assets live in an execution-session store
// instead of being re-read and re-hashed from the archive on every re-materialization. Its `prefer`
// default falls back to direct reads when IndexedDB is unavailable, so enabling it never hard-fails.
export const dsl4StandardProductionFeatureFlags = deepFreeze({
  dsl4NarrativeControl: true,
  dsl4Runtime: true,
  dsl4Video: true,
  dsl4CrossfadeTransitions: true,
  dsl4AppShell: true,
  dsl4PoseFeedbackModes: true,
  dsl4SpeechAdvanceTypewriter: true,
  dsl4TurboWarpActionSurface: true,
  dsl4TurboWarpStateSurface: true,
  dsl4ExpressionRuntimeState: true,
  dsl4PosePreviewMirroring: true,
  dsl4CameraPreviewControls: true,
  dsl4UserMediaPermissionGate: true,
  dsl4BroadcastMessageAndWait: true,
  dsl4TurboWarpBubbleAdvancedPresentation: true,
  dsl4IndexedDBAssetSessionStore: true,
});

// The non-embedded Standard SB3 is the authoring runner. Preview state remains session-only.
export const dsl4NonEmbeddedDevelopmentFeatureFlags = deepFreeze({
  ...dsl4StandardProductionFeatureFlags,
  dsl4WebPreviewAdapter: true,
  dsl4BrowserDistributionBuild: true,
  dsl4PreviewReloadOverlay: true,
  dsl4Debugger: true,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Resolve one immutable startup feature snapshot without importing runtime dependencies. */
export function resolveDsl4FeatureFlags(input: unknown = {}) {
  if (!isRecord(input)) throw new TypeError('DSL 4.0 feature flags must be an object');
  const unknown = Object.keys(input).filter((key) => !featureFlagKeys.has(key));
  if (unknown.length > 0) {
    throw new TypeError(`Unknown DSL 4.0 feature flag: ${unknown.sort().join(', ')}`);
  }
  const resolved = {...dsl4DefaultFeatureFlags, ...input};
  for (const [name, value] of Object.entries(resolved)) {
    if (typeof value !== 'boolean') throw new TypeError(`${name} feature flag must be boolean`);
  }
  if (resolved.dsl4AppShell && !resolved.dsl4Runtime) {
    throw new TypeError('dsl4AppShell requires dsl4Runtime');
  }
  if (resolved.dsl4Video && !resolved.dsl4Runtime) {
    throw new TypeError('dsl4Video requires dsl4Runtime');
  }
  if (resolved.dsl4CrossfadeTransitions && !resolved.dsl4Runtime) {
    throw new TypeError('dsl4CrossfadeTransitions requires dsl4Runtime');
  }
  if (resolved.dsl4PresentationEffects && !resolved.dsl4Runtime) {
    throw new TypeError('dsl4PresentationEffects requires dsl4Runtime');
  }
  if (resolved.dsl4BroadcastMessageAndWait && !resolved.dsl4Runtime) {
    throw new TypeError('dsl4BroadcastMessageAndWait requires dsl4Runtime');
  }
  if (resolved.dsl4TurboWarpStateSurface && !resolved.dsl4Runtime) {
    throw new TypeError('dsl4TurboWarpStateSurface requires dsl4Runtime');
  }
  if (
    resolved.dsl4ExpressionRuntimeState &&
    (!resolved.dsl4Runtime || !resolved.dsl4TurboWarpStateSurface)
  ) {
    throw new TypeError(
      'dsl4ExpressionRuntimeState requires dsl4Runtime and dsl4TurboWarpStateSurface',
    );
  }
  if (resolved.dsl4IndexedDBAssetSessionStore && !resolved.dsl4Runtime) {
    throw new TypeError('dsl4IndexedDBAssetSessionStore requires dsl4Runtime');
  }
  if (resolved.dsl4SourceIncludes && !resolved.dsl4Runtime) {
    throw new TypeError('dsl4SourceIncludes requires dsl4Runtime');
  }
  if (resolved.dsl4WebPreviewAdapter && (!resolved.dsl4Runtime || !resolved.dsl4AppShell)) {
    throw new TypeError('dsl4WebPreviewAdapter requires dsl4Runtime and dsl4AppShell');
  }
  if (
    resolved.dsl4BrowserDistributionBuild &&
    (!resolved.dsl4Runtime || !resolved.dsl4AppShell || !resolved.dsl4WebPreviewAdapter)
  ) {
    throw new TypeError(
      'dsl4BrowserDistributionBuild requires dsl4Runtime, dsl4AppShell, and dsl4WebPreviewAdapter',
    );
  }
  if (
    resolved.dsl4WebPreviewAssetLiveReload &&
    (!resolved.dsl4Runtime || !resolved.dsl4AppShell || !resolved.dsl4WebPreviewAdapter)
  ) {
    throw new TypeError(
      'dsl4WebPreviewAssetLiveReload requires dsl4Runtime, dsl4AppShell, and dsl4WebPreviewAdapter',
    );
  }
  if (resolved.dsl4PreviewReloadOverlay && (!resolved.dsl4Runtime || !resolved.dsl4AppShell)) {
    throw new TypeError('dsl4PreviewReloadOverlay requires dsl4Runtime and dsl4AppShell');
  }
  if (
    resolved.dsl4Debugger &&
    (!resolved.dsl4Runtime ||
      !resolved.dsl4AppShell ||
      !resolved.dsl4WebPreviewAdapter ||
      !resolved.dsl4PreviewReloadOverlay)
  ) {
    throw new TypeError(
      'dsl4Debugger requires dsl4Runtime, dsl4AppShell, dsl4WebPreviewAdapter, and dsl4PreviewReloadOverlay',
    );
  }
  // The editor's authoring runtime pauses at `debugger` actions through the TurboWarp debugger, so
  // it needs no preview overlay. Only that runtime turns it on; packaged and published works never do.
  if (resolved.dsl4EditorDebugger && (!resolved.dsl4Runtime || !resolved.dsl4AppShell)) {
    throw new TypeError('dsl4EditorDebugger requires dsl4Runtime and dsl4AppShell');
  }
  if (resolved.dsl4SpeechAdvanceTypewriter && !resolved.dsl4Runtime) {
    throw new TypeError('dsl4SpeechAdvanceTypewriter requires dsl4Runtime');
  }
  if (
    resolved.dsl4TurboWarpBubbleAdvancedPresentation &&
    (!resolved.dsl4Runtime || !resolved.dsl4AppShell || !resolved.dsl4SpeechAdvanceTypewriter)
  ) {
    throw new TypeError(
      'dsl4TurboWarpBubbleAdvancedPresentation requires dsl4Runtime, dsl4AppShell, and dsl4SpeechAdvanceTypewriter',
    );
  }
  if (resolved.dsl4TurboWarpActionSurface && !resolved.dsl4Runtime) {
    throw new TypeError('dsl4TurboWarpActionSurface requires dsl4Runtime');
  }
  return deepFreeze(resolved);
}
