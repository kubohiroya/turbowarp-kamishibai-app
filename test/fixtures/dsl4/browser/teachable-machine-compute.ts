import {createDsl4TMPlatform} from '../../../../src/dsl4/platform/tm-model-adapter.js';
import {createDsl4ProjectTMRuntime} from '../../../../src/dsl4/platform/posenet-bundle.js';
import {
  createDsl4TMRuntimeOwner,
  installDsl4TMRuntimeOwner,
} from '../../../../src/dsl4/platform/tm-runtime-owner.js';
import {
  createDsl4ComputePreferences,
  createDsl4ComputeSettings,
  type Dsl4ComputeMode,
} from '../../../../src/dsl4/platform/compute-settings.js';
import type {
  TMCompositionOptions,
  createTMComposition,
} from '@kubohiroya/turbowarp-teachable-machine/composition';

// The page starts without TensorFlow.js: the owner loads the reviewed runtime from the Kamishibai
// site the first time recognition settles a compute backend, as the Standard bundle does.
const site = await fetch('/tm-runtime-site.json').then((response) => response.json());
const owner = createDsl4TMRuntimeOwner({site});
installDsl4TMRuntimeOwner(owner);
const host = {
  tmPose: owner.poseRuntime as unknown as Parameters<
    typeof createDsl4ProjectTMRuntime
  >[0]['runtime'],
  tmCompute: owner.compute as unknown as NonNullable<TMCompositionOptions['compute']>,
};
const project = await fetch('/project.json').then((response) => response.json());
const names = (await fetch('/model/files.json').then((response) => response.json())) as string[];
const files = await Promise.all(
  names.map(async (name) => {
    const response = await fetch(`/model/${name}`);
    const buffer = await response.arrayBuffer();
    return {path: name, bytes: new Uint8Array(buffer)};
  }),
);
const preferences = createDsl4ComputePreferences({globalObject: globalThis});
const mount = document.querySelector<HTMLElement>('#stage');
if (!mount) throw new Error('Stage mount is missing');
let pendingMode: Dsl4ComputeMode = 'auto';
const settings = createDsl4ComputeSettings({
  document,
  stageControls: {
    addButton(options) {
      const button = document.createElement('button');
      button.dataset.stageControl = options.id;
      button.textContent = options.label;
      button.addEventListener('click', options.onClick);
      document.querySelector('#controls')?.appendChild(button);
      return {
        update(state) {
          if (state.visible !== undefined) button.hidden = !state.visible;
        },
        focus() {
          button.focus();
        },
        dispose() {
          button.remove();
        },
      };
    },
  },
  getLocale: () => 'ja',
  preferences,
  getSelection: () => host.tmCompute.getSelection(),
  onApply: (mode) => {
    preferences.setMode(mode);
    pendingMode = mode;
  },
  onClose() {},
});
const probe = {
  isRuntimeLoaded: () => owner.isLoaded(),
  ensureRuntime: () => owner.ensure(),
  showSettings: () => settings.show('ja'),
  getPendingMode: () => pendingMode,
  getPreference: () => preferences.getMode(),
  async run(mode: Dsl4ComputeMode) {
    const runtime = createDsl4ProjectTMRuntime({
      runtime: host.tmPose,
      project,
      globalObject: globalThis,
    });
    const platform = createDsl4TMPlatform({runtime, compute: host.tmCompute, computeMode: mode});
    const composition = platform.composition as ReturnType<typeof createTMComposition>;
    try {
      const selected = await composition.selectComputeBackend(mode);
      const prepared = await platform.adapter.prepare({
        asset: {
          id: 'BrowserPose',
          kind: 'recognitionModel',
          loading: 'lazy',
          source: {type: 'file'},
        },
        files,
      });
      composition.activatePoseModel('BrowserPose');
      await composition.startCamera();
      await composition.startRecognition();
      const deadline = performance.now() + 60_000;
      let samples = 0;
      while (samples < 5) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (composition.currentPose() && composition.confidence() > 0) samples++;
        if (performance.now() > deadline) throw new Error(`No finite ${mode} recognition result`);
      }
      const result = {
        ...selected,
        pose: composition.currentPose(),
        confidence: composition.confidence(),
        samples,
      };
      composition.stopRecognition();
      composition.stopCamera();
      await platform.adapter.release(prepared);
      return result;
    } finally {
      await composition.releaseAll();
    }
  },
};
Object.assign(globalThis, {kamishibaiComputeProbe: probe});
