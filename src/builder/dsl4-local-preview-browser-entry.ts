import schema from '../../schema/dsl-4.schema.json' with {type: 'json'};

import {Buffer} from 'buffer';

import {createDsl4LocalPreviewBrowserBootstrap} from './dsl4-local-preview-browser-bootstrap.js';
import {createDsl4ProductionSourceFrontend} from './dsl4-source-frontend.js';
import {createDsl4BundledTMRuntime} from '../dsl4/platform/posenet-bundle.js';
import {embeddedPoseNetFiles} from '../dsl4/platform/generated/posenet-bundle-assets.js';

(globalThis as Record<string, unknown>).Buffer ??= Buffer;

function resolveTMRuntime() {
  const candidate = (globalThis as Record<string, unknown>).tmPose as
    {Webcam?: unknown; loadFromFiles?: unknown} | undefined;
  if (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof candidate.Webcam === 'function' &&
    typeof candidate.loadFromFiles === 'function'
  ) {
    return createDsl4BundledTMRuntime({
      runtime: candidate as Parameters<typeof createDsl4BundledTMRuntime>[0]['runtime'],
      globalObject: globalThis,
      files: embeddedPoseNetFiles,
    });
  }
  return Object.freeze({
    Webcam: class MissingTMWebcam {},
    async loadFromFiles() {
      throw new Error('This preview requires the Teachable Machine Pose browser runtime.');
    },
  });
}

function configuredLimit(name: string) {
  const value = Number(globalThis.document?.documentElement?.dataset?.[name]);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`The local preview ${name} configuration is invalid.`);
  }
  return value;
}

const narrativeControlEnabled =
  globalThis.document?.documentElement?.dataset?.dsl4NarrativeControl === 'true';
const presentationEffectsEnabled =
  globalThis.document?.documentElement?.dataset?.dsl4PresentationEffects === 'true';
const client = createDsl4LocalPreviewBrowserBootstrap({
  globalObject: globalThis,
  sourceFrontend: createDsl4ProductionSourceFrontend(schema, {narrativeControlEnabled}),
  featureFlags: {
    dsl4NarrativeControl: narrativeControlEnabled,
    dsl4PresentationEffects: presentationEffectsEnabled,
  },
  getTMRuntime: resolveTMRuntime,
  maxProjectBytes: configuredLimit('dsl4MaxProjectBytes'),
  maxProjectJsonBytes: configuredLimit('dsl4MaxProjectJsonBytes'),
  maxAssetFiles: configuredLimit('dsl4MaxAssetFiles'),
  maxTotalAssetBytes: configuredLimit('dsl4MaxTotalAssetBytes'),
});

void client.start().catch(() => {
  // The client renders its bounded startup diagnostic and remains available for page cleanup.
});
