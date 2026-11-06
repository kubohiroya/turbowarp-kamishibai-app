import assert from 'node:assert/strict';
import {createHash, webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {turboWarpExtension} from '@kubohiroya/vite-plugin-turbowarp-extension';
import {buildExtensionBundles} from '@kubohiroya/sb3-toolchain';
import type {ExtensionBundleMetadata} from '@kubohiroya/sb3-toolchain';
import {build} from 'vite';

import {dsl4ReleaseCompactWasm} from './dsl4-release-policy.ts';
import {createDsl4TeachableMachineExtensionSource} from './teachable-machine-runtime.ts';
import {installDsl4PackagedRuntimeComponent} from '../../dist/builder/dsl4-source.js';
import {createDsl4ProductionSourceFrontend} from '../../dist/builder/dsl4-source-frontend.js';
import {dsl4StandardProductionFeatureFlags} from '../../dist/dsl4/feature-flags.js';
import {createDsl4EmbeddedAssetBundle} from '../../dist/dsl4/asset-bundle-descriptor.js';
import {createDsl4RuntimeArtifactDescriptor} from '../../dist/dsl4/runtime-artifact-descriptor.js';
import type {RuntimeArtifactSuccess} from '../../dist/dsl4/runtime-artifact-descriptor.js';
import {createDsl4EmbeddedSourceDescriptor} from '../../dist/dsl4/source-descriptor.js';
import {createDsl4PoseNetProjectBundleFromLoader} from '../../dist/dsl4/platform/posenet-bundle.js';
import {
  dsl4RuntimeExtensionMetadata,
  dsl4RuntimeProvenance,
  formatDsl4RuntimeExtensionHeader,
} from '../../dist/dsl4/runtime-provenance.js';
import {dsl4RuntimeBlockIconURI} from '../../dist/dsl4/runtime-icon.js';
import {removeDsl4EmbeddedYamlHats} from '../../dist/dsl4/embedded-yaml-hat.js';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
interface BundlePackageMetadata {
  name: string;
  version: string;
  author: {name: string; url: string};
  homepage: string;
  repository: {url: string};
}
const packageMetadata = JSON.parse(
  await readFile(path.join(projectRoot, 'package.json'), 'utf8'),
) as BundlePackageMetadata;
const bundleMetadata: ExtensionBundleMetadata = {
  description: dsl4RuntimeExtensionMetadata.description,
  descriptions: {ja: 'TurboWarp紙芝居 DSL 4.0の作品を実行する、自己完結した機能拡張です。'},
  author: packageMetadata.author.name,
  authorURL: packageMetadata.author.url,
  version: packageMetadata.version,
  package: packageMetadata.name,
  repository: packageMetadata.repository.url.replace(/^git\+/u, '').replace(/\.git$/u, ''),
  docsURL: packageMetadata.homepage,
  banner: dsl4RuntimeBlockIconURI,
};
const officialWebsiteFaviconPath = path.join(
  projectRoot,
  'scripts/sb3/assets/title-website-icon.png',
);
const applicationMenuIconPaths = Object.freeze({
  open: path.join(projectRoot, 'scripts/sb3/assets/application-menu-open.svg'),
  reload: path.join(projectRoot, 'scripts/sb3/assets/application-menu-reload.svg'),
  about: path.join(projectRoot, 'scripts/sb3/assets/application-menu-about.svg'),
  language: path.join(projectRoot, 'scripts/sb3/assets/application-menu-language.svg'),
});
const extensionId = 'kubohiroyakamishibai4';
const runtimeExtensionId = dsl4RuntimeExtensionMetadata.id;
const runtimeExtensionPath = `extensions/${runtimeExtensionId}.js`;
const externalExtensionMembers = Object.freeze(
  [
    {
      id: 'kubohiroyaassetcache',
      name: 'Asset Cache',
      package: '@kubohiroya/turbowarp-asset-cache',
      version: '0.7.0',
      artifact: 'dist/asset-cache.js',
      sourcePath: path.join(
        path.dirname(
          fileURLToPath(import.meta.resolve('@kubohiroya/turbowarp-asset-cache/composition')),
        ),
        'asset-cache.js',
      ),
    },
    {
      id: 'kubohiroyaasyncinput',
      name: 'Async Input',
      package: '@kubohiroya/turbowarp-async-input',
      version: '0.12.0',
      artifact: 'dist/async-input.js',
      sourcePath: path.join(
        path.dirname(
          fileURLToPath(import.meta.resolve('@kubohiroya/turbowarp-async-input/composition')),
        ),
        'async-input.js',
      ),
    },
    {
      id: 'kubohiroyabubble',
      name: 'Bubble',
      package: '@kubohiroya/turbowarp-bubble',
      version: '0.17.0',
      artifact: 'dist/turbowarp-bubble.js',
      sourcePath: path.join(
        path.dirname(
          fileURLToPath(import.meta.resolve('@kubohiroya/turbowarp-bubble/composition')),
        ),
        'turbowarp-bubble.js',
      ),
    },
    {
      id: 'kubohiroyacamerasource',
      name: 'Camera Source',
      package: '@kubohiroya/turbowarp-camera-source',
      version: '0.23.0',
      artifact: 'dist/camera-source.js',
      // The only member without a `./composition` export: nothing here imports its code. It is
      // bundled so that the Teachable Machine extension finds a camera owner to lease from, which
      // is a runtime meeting through `Scratch.vm.runtime`, not a build-time one.
      sourcePath: fileURLToPath(
        import.meta.resolve('@kubohiroya/turbowarp-camera-source/camera-source.js'),
      ),
    },
    {
      id: 'kubohiroyaruntimeexpression',
      name: 'Runtime Expression',
      package: '@kubohiroya/turbowarp-runtime-expression',
      version: '0.10.0',
      artifact: 'dist/runtime-expression.js',
      sourcePath: path.join(
        path.dirname(
          fileURLToPath(
            import.meta.resolve('@kubohiroya/turbowarp-runtime-expression/composition'),
          ),
        ),
        'runtime-expression.js',
      ),
    },
    {
      id: 'kubohiroyasvgtext',
      name: 'SVG Text',
      package: '@kubohiroya/turbowarp-svg-text',
      version: '0.14.0',
      artifact: 'dist/svg-text.js',
      sourcePath: path.join(
        path.dirname(
          fileURLToPath(import.meta.resolve('@kubohiroya/turbowarp-svg-text/composition')),
        ),
        'svg-text.js',
      ),
    },
    {
      id: 'kubohiroyatm',
      name: 'Teachable Machine',
      package: '@kubohiroya/turbowarp-teachable-machine',
      version: '4.2.0',
      artifact: 'dist/teachable-machine-webgpu.js',
      sourcePath: fileURLToPath(
        import.meta
          .resolve('@kubohiroya/turbowarp-teachable-machine/dist/teachable-machine-webgpu.js'),
      ),
    },
  ].map((member) => Object.freeze({...member, path: `extensions/${member.id}.js`})),
);
const bundleMemberIds = Object.freeze([
  runtimeExtensionId,
  ...externalExtensionMembers.map(({id}) => id),
]);
const extensionBundle = Object.freeze({
  id: extensionId,
  name: 'Kamishibai DSL 4.0 Runtime',
  members: [...bundleMemberIds],
  recoveryCapsule: false,
  blockEditorRegistrations: true,
  metadata: bundleMetadata,
});
const closeTitleBroadcastId = 'closeTitleMessage';
const closeTitleBroadcastName = 'closeTitle';
const poseConfidenceVariableId = 'dsl4-pose-confidence';
const poseProgressVariableId = 'dsl4-pose-progress';
const sourceText = `kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - wait: 0
`;
const limits = Object.freeze({
  maxSourceBytes: 1024 * 1024,
  maxAssetFiles: 64,
  maxTotalAssetBytes: 64 * 1024 * 1024,
});
const runtimeProfiles = new Set(['authoring', 'playback']);
const runtimeExtensionEntryPath = path.join(
  projectRoot,
  'scripts/sb3/dsl4-runtime-extension-entry.ts',
);
const runtimeExtensionTarget = 'es2022';
let pendingPoseNetProjectBundle;

function createPoseNetProjectBundle() {
  pendingPoseNetProjectBundle ??= createDsl4PoseNetProjectBundleFromLoader(
    async ({packageSpecifier}) =>
      new Uint8Array(await readFile(fileURLToPath(import.meta.resolve(packageSpecifier)))),
    {subtleCrypto: webcrypto.subtle},
  );
  return pendingPoseNetProjectBundle;
}

/** One title costume: its bytes, the SB3 filename they take, and the costume record. */
type Dsl4ReleaseSvgAsset = ReturnType<typeof svgAsset>;

/** One bundled external extension, paired with the bytes read off its published artifact. */
type ExtensionMemberSource = Awaited<ReturnType<typeof loadExternalExtensionSources>>[number];

/** The chunks one rolldown build hands back; this build always emits exactly one. */
interface Dsl4RuntimeExtensionBuildOutput {
  readonly output: readonly {readonly code: string}[];
}

/** The packaged project the runtime component installer returns, as far as this module rewrites it. */
interface Dsl4PackagedRuntimeProject {
  readonly extensionStorage: Record<string, {application?: {mode: string}}>;
}

function md5(contents: Buffer | string) {
  return createHash('md5').update(contents).digest('hex');
}

function sha256Sri(contents: Buffer | string) {
  return `sha256-${createHash('sha256').update(contents).digest('base64')}`;
}

function svgAsset(name: string, source: string, rotationCenterX: number, rotationCenterY: number) {
  const bytes = Buffer.from(`${source.trim()}\n`);
  const assetId = md5(bytes);
  return Object.freeze({
    bytes,
    filename: `${assetId}.svg`,
    costume: {
      assetId,
      name,
      bitmapResolution: 1,
      dataFormat: 'svg',
      md5ext: `${assetId}.svg`,
      rotationCenterX,
      rotationCenterY,
    },
  });
}

function titleAssets(): readonly [
  Dsl4ReleaseSvgAsset,
  Dsl4ReleaseSvgAsset,
  Dsl4ReleaseSvgAsset,
  Dsl4ReleaseSvgAsset,
] {
  const title = svgAsset(
    'Title',
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
  <rect width="480" height="360" fill="#f4fffb"/>
  <text x="240" y="40" text-anchor="middle" font-family="sans-serif" font-size="30" fill="#007d66">{{ABOUT_TITLE}}</text>
  <text x="240" y="68" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#006b58">Version {{VERSION}} ({{BUILD_DATE}})</text>
  <text x="240" y="194" text-anchor="middle" font-family="sans-serif" font-size="12">{{ABOUT_LICENSE_APP_LINE_1}}</text>
  <text x="240" y="210" text-anchor="middle" font-family="sans-serif" font-size="12">{{ABOUT_LICENSE_APP_LINE_2}}</text>
  <text x="240" y="234" text-anchor="middle" font-family="sans-serif" font-size="12">{{ABOUT_LICENSE_STORY_LINE_1}}</text>
  <text x="240" y="250" text-anchor="middle" font-family="sans-serif" font-size="12">{{ABOUT_LICENSE_STORY_LINE_2}}</text>
  <text x="240" y="282" text-anchor="middle" font-family="sans-serif" font-size="12">{{ABOUT_AUTHOR_ORGANIZATION_LINE_1}}</text>
  <text x="240" y="298" text-anchor="middle" font-family="sans-serif" font-size="12">{{ABOUT_AUTHOR_ORGANIZATION_LINE_2}}</text>
  <text x="240" y="326" text-anchor="middle" font-family="sans-serif" font-size="12">{{ABOUT_AUTHOR_NAME}} &lt;{{ABOUT_AUTHOR_EMAIL}}&gt;</text>
</svg>`,
    240,
    180,
  );
  const titleRuntime = svgAsset(
    'TitleRuntime',
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
  <metadata>locale:ja</metadata>
  <rect width="480" height="360" fill="#f4fffb"/>
  <text x="240" y="40" text-anchor="middle" font-family="sans-serif" font-size="30" fill="#007d66">{{ABOUT_TITLE}}</text>
  <text x="240" y="68" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#006b58">Version {{VERSION}} ({{BUILD_DATE}})</text>
  <text x="240" y="194" text-anchor="middle" font-family="sans-serif" font-size="12">{{ABOUT_LICENSE_APP_LINE_1}}</text>
  <text x="240" y="210" text-anchor="middle" font-family="sans-serif" font-size="12">{{ABOUT_LICENSE_APP_LINE_2}}</text>
  <text x="240" y="234" text-anchor="middle" font-family="sans-serif" font-size="12">{{ABOUT_LICENSE_STORY_LINE_1}}</text>
  <text x="240" y="250" text-anchor="middle" font-family="sans-serif" font-size="12">{{ABOUT_LICENSE_STORY_LINE_2}}</text>
  <text x="240" y="282" text-anchor="middle" font-family="sans-serif" font-size="12">{{ABOUT_AUTHOR_ORGANIZATION_LINE_1}}</text>
  <text x="240" y="298" text-anchor="middle" font-family="sans-serif" font-size="12">{{ABOUT_AUTHOR_ORGANIZATION_LINE_2}}</text>
  <text x="240" y="326" text-anchor="middle" font-family="sans-serif" font-size="12">{{ABOUT_AUTHOR_NAME}} &lt;{{ABOUT_AUTHOR_EMAIL}}&gt;</text>
</svg>`,
    240,
    180,
  );
  const menu = svgAsset(
    'Menu',
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
  <rect width="480" height="360" fill="#f4fffb"/>
  <text x="240" y="52" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#007d66">TurboWarp Kamishibai</text>
</svg>`,
    240,
    180,
  );
  const menuRuntime = svgAsset(
    'MenuRuntime',
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
  <metadata>locale:ja</metadata>
  <rect width="480" height="360" fill="#f4fffb"/>
  <text x="240" y="52" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#007d66">TurboWarp紙芝居</text>
</svg>`,
    240,
    180,
  );
  return Object.freeze([title, titleRuntime, menu, menuRuntime]);
}

function stageTarget(
  title: Dsl4ReleaseSvgAsset,
  titleRuntime: Dsl4ReleaseSvgAsset,
  menu: Dsl4ReleaseSvgAsset,
  menuRuntime: Dsl4ReleaseSvgAsset,
) {
  return {
    isStage: true,
    name: 'Stage',
    variables: {
      [poseConfidenceVariableId]: ['ポーズ認識', 0],
      [poseProgressVariableId]: ['チャージ', 0],
    },
    lists: {},
    broadcasts: {
      [closeTitleBroadcastId]: closeTitleBroadcastName,
    },
    blocks: {
      titleFlag: {
        opcode: 'event_whenflagclicked',
        next: 'titleFlagShow',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0,
      },
      titleFlagShow: {
        opcode: `${runtimeExtensionId}_showTitle`,
        next: null,
        parent: 'titleFlag',
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: false,
      },
      titleSetVersion: {
        opcode: `${runtimeExtensionId}_setTextValue`,
        next: null,
        parent: null,
        inputs: {
          NAME: [1, [10, 'about.version']],
          VALUE: [1, [10, 'Version {{VERSION}} ({{BUILD_DATE}})']],
        },
        fields: {},
        shadow: false,
        topLevel: true,
        x: 240,
        y: 0,
      },
      titleStageClick: {
        opcode: 'event_whenstageclicked',
        next: 'titleStageClickClose',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 120,
      },
      titleStageClickClose: {
        opcode: 'event_broadcast',
        next: null,
        parent: 'titleStageClick',
        inputs: {
          BROADCAST_INPUT: [1, [11, closeTitleBroadcastName, closeTitleBroadcastId]],
        },
        fields: {},
        shadow: false,
        topLevel: false,
      },
      titleCloseHat: {
        opcode: 'event_whenbroadcastreceived',
        next: 'titleCloseStart',
        parent: null,
        inputs: {},
        fields: {
          BROADCAST_OPTION: [closeTitleBroadcastName, closeTitleBroadcastId],
        },
        shadow: false,
        topLevel: true,
        x: 0,
        y: 240,
      },
      titleCloseStart: {
        opcode: `${runtimeExtensionId}_closeTitle`,
        next: null,
        parent: 'titleCloseHat',
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: false,
      },
    },
    comments: {},
    currentCostume: 0,
    costumes: [title.costume, titleRuntime.costume, menu.costume, menuRuntime.costume],
    sounds: [],
    volume: 100,
    layerOrder: 0,
    tempo: 60,
    videoTransparency: 50,
    videoState: 'on',
    textToSpeechLanguage: null,
  };
}

function poseFeedbackMonitors() {
  return [
    {
      id: poseConfidenceVariableId,
      mode: 'slider',
      opcode: 'data_variable',
      params: {VARIABLE: 'ポーズ認識'},
      spriteName: null,
      value: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      visible: false,
      sliderMin: 0,
      sliderMax: 100,
      isDiscrete: true,
    },
    {
      id: poseProgressVariableId,
      mode: 'slider',
      opcode: 'data_variable',
      params: {VARIABLE: 'チャージ'},
      spriteName: null,
      value: 0,
      width: 0,
      height: 0,
      x: 343,
      y: 0,
      visible: false,
      sliderMin: 0,
      sliderMax: 100,
      isDiscrete: true,
    },
  ];
}

async function createProject(assets: ReturnType<typeof titleAssets>) {
  const [title, titleRuntime, menu, menuRuntime] = assets;
  const project = {
    targets: [stageTarget(title, titleRuntime, menu, menuRuntime)],
    monitors: poseFeedbackMonitors(),
    extensions: [...bundleMemberIds],
    extensionURLs: Object.fromEntries([
      [runtimeExtensionId, `embedded-extension:${runtimeExtensionPath}`],
      ...externalExtensionMembers.map((member) => [member.id, `embedded-extension:${member.path}`]),
    ]),
    extensionStorage: {},
    meta: {
      semver: '3.0.0',
      vm: '0.2.0-turbowarp-c4823421cb7c17d8d8a89878851ce1668c26a21f',
      agent: 'turbowarp-kamishibai-app DSL 4.0 release generator',
    },
  };
  const schema = JSON.parse(
    await readFile(path.join(projectRoot, 'schema/dsl-4.schema.json'), 'utf8'),
  );
  const frontend = createDsl4ProductionSourceFrontend(schema);
  const parsed = frontend.parse(sourceText, {sourceId: 'main'});
  assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
  const sourceDescriptor = await createDsl4EmbeddedSourceDescriptor(sourceText, {
    sourceId: 'main',
    displayName: 'story.kamishibai.yaml',
    maxSourceBytes: limits.maxSourceBytes,
    subtleCrypto: webcrypto.subtle,
  });
  const artifactResult = await createDsl4RuntimeArtifactDescriptor(
    parsed.storyDocument,
    sourceDescriptor,
    'production',
    {maxSourceBytes: limits.maxSourceBytes, subtleCrypto: webcrypto.subtle},
  );
  assert.equal(artifactResult.ok, true, JSON.stringify(artifactResult.diagnostics));
  // The assertion above already rejected a failed descriptor, which `assert.equal` cannot narrow.
  const runtimeArtifact = (artifactResult as unknown as RuntimeArtifactSuccess).artifact;
  const assetBundle = await createDsl4EmbeddedAssetBundle(
    parsed.storyDocument,
    {
      manifest: {formatVersion: 1, assets: []},
      // The manifest declares no assets, so the bundle never reaches for a file.
      getFile: (() => {}) as unknown as (assetId: string, filePath: string) => Uint8Array,
    },
    {
      maxFiles: limits.maxAssetFiles,
      maxTotalBytes: limits.maxTotalAssetBytes,
      subtleCrypto: webcrypto.subtle,
    },
  );
  const poseNetBundle = await createPoseNetProjectBundle();
  const installed = await installDsl4PackagedRuntimeComponent(
    project,
    parsed.storyDocument,
    sourceDescriptor,
    runtimeArtifact,
    assetBundle,
    // `poseNetBundle` is a packaged-runtime input the installer's declared options do not name yet.
    {
      channel: 'unbundled',
      ...limits,
      poseNetBundle,
      subtleCrypto: webcrypto.subtle,
    } as unknown as Parameters<typeof installDsl4PackagedRuntimeComponent>[5],
  );
  (
    (installed as unknown as Dsl4PackagedRuntimeProject).extensionStorage[runtimeExtensionId] as {
      application?: {mode: string};
    }
  ).application = {mode: 'menu'};
  // Menu bootstraps carry no complete story YAML, so they must not expose its navigation marker.
  removeDsl4EmbeddedYamlHats(installed as unknown as Record<string, unknown>);
  return installed;
}

/** @type {Map<string, Promise<Buffer>>} */
const pendingRuntimeExtensionSources = new Map();

/**
 * Build one runtime extension, or hand back the build this process already ran.
 *
 * The bundle is deterministic for a profile and minification dominates its cost, so repeated
 * callers — the release workflow and the browser end-to-end suite alike — share one build. Each
 * caller still gets its own Buffer.
 */
export async function createDsl4RuntimeExtensionSource({
  profile = 'authoring',
  narrativeControlEnabled = dsl4StandardProductionFeatureFlags.dsl4NarrativeControl,
} = {}) {
  if (!runtimeProfiles.has(profile)) {
    throw new TypeError('DSL 4.0 runtime profile must be authoring or playback');
  }
  if (typeof narrativeControlEnabled !== 'boolean')
    throw new TypeError('narrativeControlEnabled must be boolean');
  const key = `${profile}:${narrativeControlEnabled}`;
  const pending =
    pendingRuntimeExtensionSources.get(key) ??
    buildDsl4RuntimeExtensionSource(profile, narrativeControlEnabled);
  pendingRuntimeExtensionSources.set(key, pending);
  return Buffer.from(await pending);
}

async function buildDsl4RuntimeExtensionSource(profile: string, narrativeControlEnabled: boolean) {
  const [officialWebsiteFavicon, ...applicationMenuIconFiles] = await Promise.all([
    readFile(officialWebsiteFaviconPath),
    ...Object.values(applicationMenuIconPaths).map((filename) => readFile(filename)),
  ]);
  const applicationMenuIcons = Object.fromEntries(
    Object.keys(applicationMenuIconPaths).map((action, index) => [
      action,
      // The icon files are read in the same order as their names.
      `data:image/svg+xml;base64,${applicationMenuIconFiles[index]?.toString('base64')}`,
    ]),
  );
  // The Teachable Machine member owns the only TensorFlow graph; model creation starts after bundle registration.
  const result = await build({
    root: projectRoot,
    configFile: false,
    logLevel: 'silent',
    define: {
      DSL4_APPLICATION_MENU_ICONS: JSON.stringify(applicationMenuIcons),
      DSL4_OFFICIAL_WEBSITE_ICON: JSON.stringify(
        `data:image/png;base64,${officialWebsiteFavicon.toString('base64')}`,
      ),
      DSL4_AUTHORING_PROFILE: JSON.stringify(profile === 'authoring'),
      DSL4_NARRATIVE_CONTROL: JSON.stringify(narrativeControlEnabled),
    },
    build: {
      write: false,
      target: runtimeExtensionTarget,
      minify: 'terser',
      terserOptions: {
        format: {comments: 'some'},
      },
    },
    plugins: [
      turboWarpExtension({
        ...dsl4RuntimeExtensionMetadata,
        fileName: `${runtimeExtensionId}.js`,
        entry: runtimeExtensionEntryPath,
        target: runtimeExtensionTarget,
        // The header carries the bundled component notices, so it replaces the
        // five metadata lines the plugin would emit on its own.
        header: formatDsl4RuntimeExtensionHeader().trimEnd(),
      }),
    ],
  });
  // `build` returns a watcher only when `build.watch` is set, which this build never does.
  const built = result as Dsl4RuntimeExtensionBuildOutput | Dsl4RuntimeExtensionBuildOutput[];
  const [output, ...extraOutputs] = Array.isArray(built)
    ? built.flatMap((item) => item.output)
    : built.output;
  assert(
    output && extraOutputs.length === 0,
    'The DSL 4.0 runtime extension build must emit exactly one chunk.',
  );
  return Buffer.from(output.code, 'utf8');
}

async function loadExternalExtensionSources(compactWasm: boolean) {
  return Promise.all(
    externalExtensionMembers.map(async (member) => ({
      ...member,
      contents:
        member.id === 'kubohiroyatm'
          ? await createDsl4TeachableMachineExtensionSource({compactWasm})
          : await readFile(member.sourcePath),
    })),
  );
}

function extensionSourceDescriptors(externalExtensionSources: readonly ExtensionMemberSource[]) {
  return [
    {
      id: runtimeExtensionId,
      path: runtimeExtensionPath,
      mediaType: 'text/javascript',
      parameters: [],
      encoding: 'base64',
    },
    ...externalExtensionSources.map((member) => ({
      id: member.id,
      path: member.path,
      mediaType: 'text/javascript',
      parameters: [],
      encoding: 'base64',
      source: {
        provider: 'npm',
        package: member.package,
        version: member.version,
        artifact: member.artifact,
        integrity: sha256Sri(member.contents),
      },
    })),
  ];
}

export async function createDsl4RuntimeBundleSource({
  profile = 'authoring',
  narrativeControlEnabled = dsl4StandardProductionFeatureFlags.dsl4NarrativeControl,
  compactWasm = dsl4ReleaseCompactWasm,
} = {}) {
  const [runtimeExtensionSource, externalExtensionSources] = await Promise.all([
    createDsl4RuntimeExtensionSource({profile, narrativeControlEnabled}),
    loadExternalExtensionSources(compactWasm),
  ]);
  const extensions = extensionSourceDescriptors(externalExtensionSources);
  const extensionContents = new Map<string, Buffer>([
    [runtimeExtensionId, runtimeExtensionSource],
    ...externalExtensionSources.map((member): [string, Buffer] => [member.id, member.contents]),
  ]);
  const project = {
    extensions: [...bundleMemberIds],
    extensionURLs: Object.fromEntries(
      bundleMemberIds.map((memberId) => [memberId, `embedded-extension:extensions/${memberId}.js`]),
    ),
  };
  const bundled = buildExtensionBundles({
    extensionBundles: [extensionBundle],
    extensionContents,
    extensions,
    project,
  });
  const source = bundled.extensionContents.get(extensionId);
  assert(source, 'The DSL 4.0 runtime bundle source was not generated.');
  const text = String(source)
    .replace(/^ +(?=\t)/gmu, '')
    .replace('\n// ID:', '\n// Kamishibai capabilities: simple-speech-v1\n// ID:');
  return Buffer.from(
    narrativeControlEnabled
      ? text.replace('\n// ID:', '\n// Kamishibai capabilities: narrative-control-v1\n// ID:')
      : text,
  );
}

export async function createDsl4ReleaseSourceFiles({compactWasm = dsl4ReleaseCompactWasm} = {}) {
  const assets = titleAssets();
  const project = await createProject(assets);
  const [runtimeExtensionSource, externalExtensionSources] = await Promise.all([
    createDsl4RuntimeExtensionSource(),
    loadExternalExtensionSources(compactWasm),
  ]);
  const archiveEntries = ['project.json', ...assets.map(({filename}) => filename)];
  const files = new Map([
    ['project.source.json', Buffer.from(`${JSON.stringify(project, null, 2)}\n`)],
    [
      'embedded-extensions.json',
      Buffer.from(
        `${JSON.stringify(
          {
            formatVersion: 1,
            extensions: extensionSourceDescriptors(externalExtensionSources),
            extensionBundles: [extensionBundle],
            sourceNotices: dsl4RuntimeProvenance,
          },
          null,
          2,
        )}\n`,
      ),
    ],
    [
      'sb3-source.json',
      Buffer.from(
        `${JSON.stringify(
          {
            formatVersion: 1,
            project: 'project.source.json',
            embeddedExtensions: 'embedded-extensions.json',
            assetsDirectory: 'assets',
            archiveEntries,
          },
          null,
          2,
        )}\n`,
      ),
    ],
    [runtimeExtensionPath, runtimeExtensionSource],
  ]);
  for (const member of externalExtensionSources) files.set(member.path, member.contents);
  for (const asset of assets) files.set(`assets/${asset.filename}`, asset.bytes);
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(
    !process.argv.includes('--write'),
    'Direct release source writes are disabled. Run pnpm release:dsl4:update.',
  );
  const files = await createDsl4ReleaseSourceFiles();
  process.stdout.write(`Generated ${files.size} transient DSL 4 release source file(s).\n`);
}
