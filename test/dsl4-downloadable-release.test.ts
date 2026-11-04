import assert from 'node:assert/strict';
import {createHash, webcrypto} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext, runInThisContext} from 'node:vm';
import {test, vi} from 'vitest';

import {inflateSync, strFromU8, strToU8, unzipSync, zipSync} from 'fflate';
import {buildSb3, importSb3} from '@kubohiroya/sb3-toolchain';
import {readCameraSourceRuntime} from '@kubohiroya/turbowarp-camera-source/runtime';

import {createKamishibaiSb3} from '../scripts/sb3/build.ts';
import {dsl4ReleaseCompactWasm} from '../scripts/sb3/dsl4-release-policy.ts';
import {authorDsl4BlockSourceSb3} from '../src/builder/dsl4-block-source-author.js';
import {
  createDsl4ReleaseSourceFiles,
  createDsl4RuntimeBundleSource,
  createDsl4RuntimeExtensionSource,
} from '../scripts/sb3/dsl4-downloadable-release.ts';
import {
  buildDsl4RuntimeComponent,
  createDsl4ProductionSourceFrontend,
  embedDsl4PackagedRuntimeComponentInSb3,
} from '../src/builder/index.js';
import {
  createDsl4EmbeddedAssetBundle,
  createDsl4EmbeddedSourceDescriptor,
  createDsl4RuntimeArtifactDescriptor,
  dsl4CoreActionManifest,
  loadDsl4RuntimeComponent,
} from '../src/dsl4/index.js';
import {dsl4StandardProductionFeatureFlags} from '../src/dsl4/feature-flags.js';
import {dsl4RuntimeProvenance} from '../src/dsl4/runtime-provenance.js';
import {dsl4RuntimeBlockIconURI} from '../src/dsl4/runtime-icon.js';
import {
  buildDsl4BrowserSelectedStoryProject,
  collectDsl4BrowserDroppedFiles,
  selectDsl4BrowserStorySource,
} from '../src/dsl4/platform/browser-story-file-loader.js';
import {
  loadDsl4PoseNetProjectBundle,
  loadDsl4PoseNetProjectBundleData,
} from '../src/dsl4/platform/posenet-bundle.js';
import {dsl4RuntimeApplicationMenuDefaultIcons} from '../src/dsl4/platform/runtime-application-menu.js';
import {
  type BrowserFileHandle,
  createBrowserDirectoryHandle,
  createBrowserFile,
  createBrowserFileHandle,
  createMutablePreviewProject,
  installPreviewBrowserGlobals,
} from './helpers/browser-file-system.ts';
import {
  createFakeDocument,
  type FakeDocument,
  type FakeElement,
  findByAttribute,
  findById,
  requireById,
  requireFirst,
} from './helpers/fake-dom.ts';
import {thrown} from './helpers/thrown-error.ts';
import {
  requireArray,
  requireDefined,
  requireRecord,
  requireString,
} from './helpers/require-value.ts';
import {okResult} from './helpers/result-outcome.ts';

/**
 * The Scratch project members these cases read out of a built SB3.
 *
 * `project.json` is parsed JSON on both sides of every build, so the shapes the assertions walk
 * into are named here once instead of at each read.
 */
interface Sb3Costume extends Record<string, unknown> {
  name: string;
  md5ext: string;
  skinId?: number;
}

interface Sb3Sound extends Record<string, unknown> {
  name: string;
}

interface Sb3Target extends Record<string, unknown> {
  isStage: boolean;
  name: string;
  costumes: Sb3Costume[];
  sounds: Sb3Sound[];
  blocks: Record<string, unknown>;
}

interface Sb3Monitor extends Record<string, unknown> {
  opcode: string;
  params: Record<string, unknown>;
  mode: string;
  sliderMin: unknown;
  sliderMax: unknown;
  visible: boolean;
}

interface Sb3Project extends Record<string, unknown> {
  targets: Sb3Target[];
  monitors: Sb3Monitor[];
  extensions: string[];
  extensionURLs: Record<string, string>;
  extensionStorage: Record<string, Record<string, unknown>>;
}

/** Read one parsed `project.json` as the shape these cases walk into. */
function projectOf(value: unknown): Sb3Project {
  return requireRecord(value, 'the parsed project') as unknown as Sb3Project;
}

/** Read one archive entry a case expects the build to have produced. */
function entryOf(archive: Record<string, Uint8Array>, name: string): Uint8Array {
  return requireDefined(archive[name], `the ${name} archive entry`);
}

/** The stage target of a built project, which every fixture declares. */
function stageOf(project: Sb3Project): Sb3Target {
  return requireDefined(
    project.targets.find(({isStage}) => isStage),
    'the stage target',
  );
}

/** The script element a packaged release appends to run its embedded extension. */
interface ScriptElement {
  tagName?: string;
  src: string;
  onerror?: ((error: unknown) => unknown) | null;
}

/**
 * The VM surface these helpers drive.
 *
 * `scratch-vm` ships without declarations, so the members a helper reaches for are named here
 * rather than left implicitly `any`.
 */
interface ScratchVm {
  extensionManager: {_loadedExtensions: Map<string, unknown>};
  loadProject(archive: unknown): Promise<unknown>;
}

/**
 * The block metadata a bundled extension publishes through `getInfo`.
 *
 * The palette is built by the toolchain from each bundle member, so the members these cases read
 * -- the heading and documentation markers, the opcodes, the icons -- are named here.
 */
interface ExtensionBlock extends Record<string, unknown> {
  opcode?: unknown;
  blockType?: unknown;
  blockIconURI?: unknown;
  xml?: unknown;
  sb3Toolchain?: {kind?: string; memberId: string; docsURI?: string};
}

interface ExtensionInfo {
  blocks: ExtensionBlock[];
}

/** One registered palette block of a VM category. */
interface VmCategoryBlock {
  info: {opcode?: string; hideFromPalette?: boolean; blockType?: string};
}

/** The body of the fake title-shell document a case installed. */
function shellBody(restoreGlobals: {document: FakeDocument | null}): FakeElement {
  return requireDefined(restoreGlobals.document, 'the title shell document').body;
}

/** The toolchain marker a palette block carries, which the case has just filtered on. */
function toolchainOf(block: ExtensionBlock | undefined, description: string) {
  return requireDefined(
    requireDefined(block, description).sb3Toolchain,
    `the ${description} marker`,
  );
}

/** One member of the runtime component storage, which the project declares opaquely. */
function storedMember(storage: Record<string, unknown>, name: string): Record<string, unknown> {
  return requireRecord(storage[name], `the stored ${name}`);
}

/** The embedded extension URL a built release carries. */
function extensionUrlOf(project: Sb3Project): string {
  return requireDefined(project.extensionURLs[bundleExtensionId], 'the embedded extension URL');
}

/** The runtime component storage a build wrote into a project. */
function componentStorageOf(project: Sb3Project): Record<string, unknown> {
  const extension = requireRecord(
    project.extensionStorage[bundleExtensionId],
    'the bundle extension storage',
  );
  const components = requireRecord(extension.components, 'its components');
  return requireRecord(components[runtimeExtensionId], 'the runtime component storage');
}

/** One block of a target, which `project.json` declares opaquely. */
function blockOf(target: Sb3Target, id: string): Record<string, unknown> {
  return requireRecord(target.blocks[id], `the ${id} block`);
}

/** The costume a case names on a target. */
function costumeOf(target: {costumes: Sb3Costume[]}, name: string): Sb3Costume {
  return requireDefined(
    target.costumes.find((costume) => costume.name === name),
    `the ${name} costume`,
  );
}

const releasePins = JSON.parse(
  await readFile(new URL('fixtures/dsl4/release-pins.json', import.meta.url), 'utf8'),
);
const require = createRequire(import.meta.url);
const VirtualMachine = require('scratch-vm');
const dispatch = require('scratch-vm/src/dispatch/central-dispatch');
const vmLog = require('scratch-vm/src/util/log');
const bundleExtensionId = 'kubohiroyakamishibai4';
const runtimeExtensionId = 'kubohiroyakamishibairuntime4';
// project.json carries the whole bundle as one data: URL. Camera Source 0.17.1 adds about 442 KB
// after base64 encoding; the frozen rc.33 project is 13,076,255 bytes.
const currentRuntimeProjectJsonMaximumBytes = 18_000_000;
const turbowarpVmCommit = 'c4823421cb7c17d8d8a89878851ce1668c26a21f';
const schema = JSON.parse(
  await readFile(new URL('../schema/dsl-4.schema.json', import.meta.url), 'utf8'),
);
const frontend = createDsl4ProductionSourceFrontend(schema);
const storyComponentLimits = Object.freeze({
  maxSourceBytes: 1024 * 1024,
  maxAssetFiles: 64,
  maxTotalAssetBytes: 64 * 1024 * 1024,
});
const applicationMenuIconFilenames = Object.freeze({
  open: 'application-menu-open.svg',
  reload: 'application-menu-reload.svg',
  about: 'application-menu-about.svg',
  language: 'application-menu-language.svg',
});
const applicationMenuIconDataUrls = Object.freeze(
  Object.fromEntries(
    await Promise.all(
      Object.entries(applicationMenuIconFilenames).map(async ([action, filename]) => {
        const bytes = await readFile(new URL(`../scripts/sb3/assets/${filename}`, import.meta.url));
        return [action, `data:image/svg+xml;base64,${bytes.toString('base64')}`];
      }),
    ),
  ),
);

async function buildRelease() {
  // Current generator output is independent from immutable published release metadata.
  return buildCurrentRuntimeRelease();
}

const pendingCurrentRuntimeReleases = new Map<boolean, Promise<{archive: Buffer}>>();

function buildCurrentRuntimeRelease(compactWasm = dsl4ReleaseCompactWasm) {
  const pending = pendingCurrentRuntimeReleases.get(compactWasm);
  if (pending) return pending;
  const built = (async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'dsl4-current-release-'));
    const sourceDirectory = path.join(temporaryRoot, 'app');
    try {
      for (const [relativePath, contents] of await createDsl4ReleaseSourceFiles({compactWasm})) {
        const outputPath = path.join(sourceDirectory, relativePath);
        await mkdir(path.dirname(outputPath), {recursive: true});
        await writeFile(outputPath, contents);
      }
      const result = await createKamishibaiSb3({
        buildDate: '2026-08-16',
        faviconPath: fileURLToPath(new URL('../site/favicon.png', import.meta.url)),
        packageJsonPath: fileURLToPath(new URL('../package.json', import.meta.url)),
        sourceDirectory,
        version: releasePins.release.version,
      });
      return {archive: Buffer.from(result.archive)};
    } finally {
      await rm(temporaryRoot, {recursive: true, force: true});
    }
  })();
  pendingCurrentRuntimeReleases.set(compactWasm, built);
  return built;
}

async function buildEmbeddedStoryRelease({navigationFixture = false} = {}) {
  const result = await buildRelease();
  const projectDirectory = await mkdtemp(path.join(tmpdir(), 'dsl4-restart-project-'));
  const baseSb3Path = path.join(projectDirectory, 'base.sb3');
  const sourceDirectory = path.join(projectDirectory, 'source');
  const projectAssetsPath = path.join(projectDirectory, 'project-assets.yml');
  const displayAssetPath = path.join(projectDirectory, 'display.svg');
  const projectSb3Path = path.join(projectDirectory, 'project.sb3');
  const sceneSource = navigationFixture
    ? `  opening:
    actions:
      - Actor.show:
          skin: ActorSkin
          x: 0
          y: 0
          scale: 100
      - wait: 60
  ending:
    actions:
      - Actor.show:
          skin: ActorSkin
          x: 123
          y: 0
          scale: 100
      - wait: 60`
    : `  opening:
    - wait: 0.05`;
  const sourceText = `kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
      ArrowRight: rehearsal.skipAction
      ArrowDown: rehearsal.skipScene
assets:
  EndCover:
    kind: backdrop
    name: Menu
  ActorSkin: costume:Actor
actors:
  Actor: ActorSkin
cover:
  backdrop: EndCover
scenes:
${sceneSource}
`;
  const parsed = frontend.parse(sourceText, {sourceId: 'main'});
  assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
  const source = await createDsl4EmbeddedSourceDescriptor(sourceText, {
    sourceId: 'main',
    displayName: 'story.kamishibai.yaml',
    maxSourceBytes: storyComponentLimits.maxSourceBytes,
    subtleCrypto: webcrypto.subtle,
  });
  const artifact = await createDsl4RuntimeArtifactDescriptor(
    parsed.storyDocument,
    source,
    'production',
    {maxSourceBytes: storyComponentLimits.maxSourceBytes, subtleCrypto: webcrypto.subtle},
  );
  assert.equal(artifact.ok, true, JSON.stringify(artifact.diagnostics));
  const assets = await createDsl4EmbeddedAssetBundle(
    parsed.storyDocument,
    {
      manifest: {
        formatVersion: 1,
        assets: [
          {
            id: 'ActorSkin',
            kind: 'costume',
            loading: 'eager',
            target: 'Actor',
            source: {type: 'project', name: 'ActorSkin'},
          },
          {
            id: 'EndCover',
            kind: 'backdrop',
            loading: 'eager',
            source: {type: 'project', name: 'Menu'},
          },
        ],
      },
      getFile() {
        assert.fail('The embedded story fixture has no binary file asset.');
      },
    },
    {
      maxFiles: storyComponentLimits.maxAssetFiles,
      maxTotalBytes: storyComponentLimits.maxTotalAssetBytes,
      subtleCrypto: webcrypto.subtle,
    },
  );
  try {
    await Promise.all([
      writeFile(baseSb3Path, result.archive),
      writeFile(
        displayAssetPath,
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#fff"/></svg>\n',
      ),
      writeFile(
        projectAssetsPath,
        `formatVersion: 1
sprites:
  Actor:
    layerOrder: 1
    visible: false
    x: 0
    y: 0
    size: 100
    direction: 90
    draggable: false
    rotationStyle: all around
    volume: 100
  Narration:
    layerOrder: 2
    visible: false
    x: 0
    y: 0
    size: 100
    direction: 90
    draggable: false
    rotationStyle: all around
    volume: 100
assets:
  ActorSkin:
    kind: costume
    target: Actor
    file: display.svg
    rotationCenterX: 5
    rotationCenterY: 5
  NarrationText:
    kind: costume
    target: Narration
    file: display.svg
    rotationCenterX: 5
    rotationCenterY: 5
`,
      ),
    ]);
    await importSb3({inputPath: baseSb3Path, outputDirectory: sourceDirectory});
    await buildSb3({
      sourceDirectory,
      projectAssetsPath,
      outputPath: projectSb3Path,
    });
    const embedded = await embedDsl4PackagedRuntimeComponentInSb3(
      await readFile(projectSb3Path),
      parsed.storyDocument,
      source,
      okResult(artifact, 'the runtime artifact descriptor').artifact,
      assets,
      {
        channel: 'bundled',
        ...storyComponentLimits,
        replaceExisting: true,
        subtleCrypto: webcrypto.subtle,
      },
    );
    return embedded.bytes;
  } finally {
    await rm(projectDirectory, {recursive: true, force: true});
  }
}

async function buildExternalSourceStoryRelease() {
  const result = await buildRelease();
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'dsl4-external-finish-'));
  const sourceFilename = 'story.k4.yml';
  const sourceText = `kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
assets:
  EndCover:
    kind: backdrop
    name: Menu
cover:
  backdrop: EndCover
scenes:
  opening:
    - wait: 0.05
`;
  const sourceManifest = {
    formatVersion: 1,
    mode: 'external',
    sourceId: 'main',
    path: sourceFilename,
  };
  try {
    await writeFile(path.join(projectRoot, sourceFilename), sourceText);
    const built = await buildDsl4RuntimeComponent({
      baseSb3Bytes: result.archive,
      projectRoot,
      sourceManifest,
      sourceFrontend: frontend,
      controlProfile: 'production',
      channel: 'bundled',
      maxSourceBytes: storyComponentLimits.maxSourceBytes,
      maxAssetFileBytes: storyComponentLimits.maxTotalAssetBytes,
      maxAssetFiles: storyComponentLimits.maxAssetFiles,
      maxTotalAssetBytes: storyComponentLimits.maxTotalAssetBytes,
      replaceExisting: true,
      subtleCrypto: webcrypto.subtle,
    });
    assert.deepEqual(componentStorageOf(projectOf(built.project)).application, {mode: 'story'});
    return built.bytes;
  } finally {
    await rm(projectRoot, {recursive: true, force: true});
  }
}

function installUnsandboxedScriptDom({withTitleUi = false} = {}) {
  const names = [
    'document',
    'location',
    'Scratch',
    'ScratchExtensions',
    'window',
    'tf',
    'tmPose',
    'tmImage',
    'tmAudio',
    'tmCompute',
    'speechCommands',
  ] as const;
  const previous = names.map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  const executeScript = (script: ScriptElement) => {
    try {
      const prefix = 'data:text/javascript;base64,';
      assert(script.src.startsWith(prefix), 'The release extension must be embedded.');
      const source = Buffer.from(script.src.slice(prefix.length), 'base64').toString('utf8');
      runInThisContext(source, {filename: `${bundleExtensionId}.js`});
    } catch (error) {
      console.error(
        'BUNDLE_EVALUATION_FAILURE',
        error instanceof Error ? error.message : String(error),
      );
      script.onerror?.(error);
    }
  };
  const titleDocument = withTitleUi ? createFakeDocument() : null;
  const document: unknown = titleDocument ?? {
    visibilityState: 'visible',
    scripts: [],
    addEventListener() {},
    removeEventListener() {},
    createElement(tagName: string) {
      assert.equal(tagName, 'script');
      return {onerror: null, src: ''};
    },
    body: {appendChild: executeScript},
  };
  if (titleDocument) {
    const appendChild = titleDocument.body.appendChild.bind(titleDocument.body);
    titleDocument.body.appendChild = (element: FakeElement) => {
      if (element.tagName === 'SCRIPT') {
        executeScript(element as unknown as ScriptElement);
        return element;
      }
      return appendChild(element);
    };
  }
  Object.defineProperties(globalThis, {
    document: {configurable: true, value: document},
    window: {configurable: true, value: globalThis},
  });
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: {href: 'https://release.test/'},
  });
  const restore = () => {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  };
  return Object.assign(restore, {document: titleDocument});
}

/**
 * The renderer surface a packaged story needs: Scratch costumes plus every method Bubble uses to
 * draw speech, which it validates when the runtime host builds its composition.
 */
function fakeRenderer() {
  let nextId = 1;
  return {
    addOverlay() {},
    removeOverlay() {},
    draw() {},
    createSVGSkin() {
      return nextId++;
    },
    createDrawable() {
      return nextId++;
    },
    destroyDrawable() {},
    destroySkin() {},
    getCurrentSkinSize() {
      return [0, 0];
    },
    getNativeSize() {
      return [480, 360];
    },
    updateDrawablePosition() {},
    updateDrawableScale() {},
    updateDrawableSkinId() {},
    updateDrawableVisible() {},
  };
}

async function extensionReporter(vm: ScratchVm, opcode: string) {
  const service = vm.extensionManager._loadedExtensions.get(bundleExtensionId);
  assert(service, 'The embedded DSL 4.0 runtime extension was not loaded.');
  return dispatch.call(service, `${runtimeExtensionId}__${opcode}`);
}

async function extensionInfo(vm: ScratchVm): Promise<ExtensionInfo> {
  const service = vm.extensionManager._loadedExtensions.get(bundleExtensionId);
  assert(service, 'The embedded DSL 4.0 runtime extension was not loaded.');
  return dispatch.call(service, 'getInfo');
}

async function loadProjectQuietly(vm: ScratchVm, archive: unknown) {
  const originalWarn = vmLog.warn;
  const originalWarning = vmLog.warning;
  vmLog.warn = () => {};
  vmLog.warning = () => {};
  try {
    await vm.loadProject(archive);
  } finally {
    vmLog.warn = originalWarn;
    vmLog.warning = originalWarning;
  }
}

async function assertFreshBrowserBuiltStoryRuns(archive: unknown) {
  const freshVm = new VirtualMachine();
  try {
    freshVm.setCompatibilityMode(false);
    freshVm.setTurboMode(false);
    freshVm.setCompilerOptions({enabled: false});
    freshVm.securityManager.canLoadExtensionFromProject = () => true;
    freshVm.securityManager.getSandboxMode = () => 'unsandboxed';
    await loadProjectQuietly(freshVm, archive);
    let nextFreshId = 1;
    for (const target of freshVm.runtime.targets) {
      target.drawableID = nextFreshId;
      for (const costume of target.sprite?.costumes ?? []) {
        costume.skinId = nextFreshId;
        nextFreshId += 1;
      }
    }
    freshVm.runtime.renderer = fakeRenderer();
    freshVm.greenFlag();
    const titleDeadline = Date.now() + 5_000;
    while (Date.now() < titleDeadline) {
      freshVm.runtime._step();
      if ((await extensionReporter(freshVm, 'statusReporter')) === 'title') break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(await extensionReporter(freshVm, 'statusReporter'), 'title');
    await extensionReporter(freshVm, 'closeTitle');
    const completionDeadline = Date.now() + 5_000;
    while (Date.now() < completionDeadline) {
      freshVm.runtime._step();
      const status = await extensionReporter(freshVm, 'statusReporter');
      if (status === 'menu') break;
      if (status === 'error') {
        assert.fail(
          `Fresh browser-built story failed: ${await extensionReporter(freshVm, 'lastErrorReporter')}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(await extensionReporter(freshVm, 'statusReporter'), 'menu');
  } finally {
    freshVm.quit();
  }
}

test('builds the current DSL 4.0 runtime with one shared TensorFlow.js registry', async () => {
  const extensionSource = (await createDsl4RuntimeExtensionSource()).toString('utf8');
  const bundleSource = (await createDsl4RuntimeBundleSource()).toString('utf8');
  for (const [flag, enabled] of Object.entries(dsl4StandardProductionFeatureFlags)) {
    assert.equal(enabled, true);
    assert.equal(extensionSource.includes(`${flag}:!0`), true, flag);
  }
  assert.equal(extensionSource.includes('@tensorflow/tfjs@4.22.0'), true);
  assert.equal(extensionSource.includes('if(0===r)return globalThis.tf;if(e[r])'), false);
  assert.equal(
    bundleSource.includes('TM browser runtime found a different global TensorFlow.js instance.'),
    true,
  );
  assert.equal(bundleSource.includes('data:application/octet-stream;base64,'), true);
  assert.equal(
    (
      bundleSource.match(
        /TM browser runtime found a different global TensorFlow.js instance\./gu,
      ) ?? []
    ).length,
    1,
  );
});

test('keeps the Bubble reveal entry and provenance aligned through sb3-toolchain', async () => {
  const [bubblePackageSource, toolchainPackageSource, reveal, sourceFiles, built] =
    await Promise.all([
      readFile(
        new URL('../node_modules/@kubohiroya/turbowarp-bubble/package.json', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../node_modules/@kubohiroya/sb3-toolchain/package.json', import.meta.url),
        'utf8',
      ),
      import('@kubohiroya/turbowarp-bubble/reveal'),
      createDsl4ReleaseSourceFiles(),
      buildCurrentRuntimeRelease(),
    ]);
  const bubblePackage = JSON.parse(bubblePackageSource);
  const toolchainPackage = JSON.parse(toolchainPackageSource);
  const manifest = JSON.parse(
    requireDefined(sourceFiles.get('embedded-extensions.json'), 'the extension manifest').toString(
      'utf8',
    ),
  );
  const archive = unzipSync(built.archive);
  const project = projectOf(JSON.parse(strFromU8(entryOf(archive, 'project.json'))));
  const extensionUrl = extensionUrlOf(project);
  const extensionSource = Buffer.from(
    extensionUrl.slice('data:text/javascript;base64,'.length),
    'base64',
  ).toString('utf8');

  assert.equal(toolchainPackage.version, releasePins.devDependencies['@kubohiroya/sb3-toolchain']);
  assert.equal(bubblePackage.version, releasePins.extensions['@kubohiroya/turbowarp-bubble']);
  assert.equal(bubblePackage.exports['./reveal'].import, './dist/reveal.js');
  assert.deepEqual(Object.keys(reveal).sort(), [
    'bubbleRevealUnits',
    'normalizeBubbleReveal',
    'revealedBubbleContent',
    'revealedBubbleText',
    'splitBubbleContent',
    'splitBubbleText',
  ]);
  const appPackage = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const expectedMetadata = {
    description: 'Run a self-contained TurboWarp Kamishibai DSL 4.0 story.',
    descriptions: {ja: 'TurboWarp紙芝居 DSL 4.0の作品を実行する、自己完結した機能拡張です。'},
    author: appPackage.author.name,
    authorURL: appPackage.author.url,
    version: appPackage.version,
    package: appPackage.name,
    repository: 'https://github.com/kubohiroya/turbowarp-kamishibai-app',
    docsURL: appPackage.homepage,
    banner: dsl4RuntimeBlockIconURI,
  };
  assert.deepEqual(manifest.extensionBundles, [
    {
      id: bundleExtensionId,
      name: 'Kamishibai DSL 4.0 Runtime',
      members: [
        runtimeExtensionId,
        'kubohiroyaassetcache',
        'kubohiroyaasyncinput',
        'kubohiroyabubble',
        'kubohiroyacamerasource',
        'kubohiroyaruntimeexpression',
        'kubohiroyasvgtext',
        'kubohiroyatm',
      ],
      recoveryCapsule: false,
      blockEditorRegistrations: true,
      metadata: expectedMetadata,
    },
  ]);
  const header = extensionSource.split('// Bundled extensions:')[0];
  assert.ok(header, 'The embedded security header must precede component notices.');
  for (const [label, value] of Object.entries({
    Version: appPackage.version,
    By: appPackage.author.name,
    'Author URL': appPackage.author.url,
    Package: appPackage.name,
    Repository: expectedMetadata.repository,
    'Docs URL': appPackage.homepage,
    Banner: dsl4RuntimeBlockIconURI,
    'Description[ja]': expectedMetadata.descriptions.ja,
    Unsandboxed: 'required',
    License: 'See the bundled extension notices below.',
  })) {
    assert.ok(header.split('\n').includes(`// ${label}: ${value}`), label);
  }
  assert.deepEqual(manifest.sourceNotices, dsl4RuntimeProvenance);
  assert.deepEqual(Object.keys(project.extensionURLs), [bundleExtensionId]);
  assert.match(
    extensionSource,
    new RegExp(
      `Bubble — Hiroya Kubo — MPL-2\\.0 — @kubohiroya\\/turbowarp-bubble@${releasePins.extensions[
        '@kubohiroya/turbowarp-bubble'
      ].replaceAll('.', '\\.')}`,
      'u',
    ),
  );
  assert.doesNotMatch(extensionSource, /@kubohiroya\/turbowarp-bubble@0\.4\.0/u);
});

test('builds separate authoring and playback runtime profiles', async () => {
  // Build sequentially to keep the peak module-graph memory bounded.
  const authoring = await createDsl4RuntimeExtensionSource({profile: 'authoring'});
  const playback = await createDsl4RuntimeExtensionSource({profile: 'playback'});
  const playbackBundle = await createDsl4RuntimeBundleSource({profile: 'playback'});
  const poseShardPrefix = (
    await readFile(
      require.resolve('@kubohiroya/turbowarp-teachable-machine/posenet-assets/group1-shard1of2.bin'),
    )
  )
    .toString('base64')
    .slice(0, 256);
  assert.equal(playback.byteLength < authoring.byteLength, true);
  assert.equal(authoring.byteLength - playback.byteLength > 200_000, true);
  assert.equal(authoring.includes(poseShardPrefix), false);
  assert.equal(playback.includes(poseShardPrefix), false);
  assert.match(authoring.toString(), /allowOptimization:!1/u);
  // Both profiles take full-ID source snapshots; playback must still omit whole-project saves.
  assert.equal(playback.includes('allowOptimization'), true);
  assert.doesNotMatch(playback.toString(), /\.saveProjectSb3\s*\(/u);
  assert.equal(authoring.includes('browser preview'), true);
  assert.equal(playback.includes('browser preview'), false);
  assert.equal(authoring.includes('showOpenFilePicker'), true);
  assert.equal(playback.includes('showOpenFilePicker'), false);
  assert.equal(authoring.includes('showDirectoryPicker'), true);
  assert.equal(playback.includes('showDirectoryPicker'), false);
  assert.equal(authoring.includes('buildDistributionSb3'), true);
  assert.equal(playback.includes('buildDistributionSb3'), false);
  assert.equal(authoring.includes('initializeNonEmbeddedPreview'), true);
  assert.equal(playback.includes('initializeNonEmbeddedPreview'), false);
  assert.equal(playback.includes('createDsl4WebPreviewShell'), false);
  assert.equal(playback.includes('Authoring module'), false);
  assert.equal(playback.includes('live reload session is disposed'), false);
  assert.equal(playback.includes('live reload requires a DSL 4.0 StoryDocument'), false);
  assert.equal(playback.includes('Unknown live reload restart choice'), false);
  assert.equal(playback.includes('source-live-reload'), false);
  assert.equal(
    playback.includes('playback runtime cannot open a non-embedded authoring project'),
    true,
  );
  const checkedInPlayback = await readFile(
    new URL('../src/builder/generated/dsl4-playback-runtime-extension.js', import.meta.url),
  );
  // deepEqual tries to format the entire binary diff when this artifact is stale.
  assert.equal(
    playbackBundle.equals(checkedInPlayback),
    true,
    `The checked-in playback runtime must be regenerated with pnpm dsl4:playback-runtime:generate. ` +
      `generated=${createHash('sha256').update(playbackBundle).digest('hex')} ` +
      `checked-in=${createHash('sha256').update(checkedInPlayback).digest('hex')}`,
  );
  assert.match(playbackBundle.toString('utf8'), /^\/\/ ID: kubohiroyakamishibai4$/mu);
  assert.match(playbackBundle.toString('utf8'), /blockIconURI/u);
});

test('explains how to reload unsandboxed when the release runtime is allowed sandboxed', async () => {
  const result = await buildCurrentRuntimeRelease();
  const project = projectOf(
    JSON.parse(strFromU8(entryOf(unzipSync(result.archive), 'project.json'))),
  );
  const extensionUrl = extensionUrlOf(project);
  const extensionSource = Buffer.from(
    extensionUrl.slice('data:text/javascript;base64,'.length),
    'base64',
  ).toString('utf8');
  assert.match(extensionSource, /^\/\/ Unsandboxed: required$/mu);

  // TurboWarp's sandboxed iframe and worker hand the extension a Scratch without `vm` or
  // `extensions.unsandboxed`. The bundle must still register exactly once, or the project load
  // waits forever, and it must not run the Runtime member, which throws without `Scratch.vm`.
  const sandboxedLoad = (language: string) => {
    const registrations: {
      getInfo(): {
        id: string;
        color1: string;
        color2: string;
        color3: string;
        blocks: {blockType: string; text: string}[];
      };
    }[] = [];
    const errors: string[] = [];
    const Scratch = {
      ArgumentType: {},
      BlockType: {LABEL: 'label'},
      extensions: {
        register: (extension: (typeof registrations)[number]) => registrations.push(extension),
      },
      translate: {language},
    };
    runInNewContext(extensionSource, {
      Scratch,
      console: {error: (message: unknown) => errors.push(String(message)), log() {}, warn() {}},
    });
    const [registration, ...extraRegistrations] = registrations;
    assert.ok(registration);
    assert.equal(extraRegistrations.length, 0);
    const info = registration.getInfo();
    assert.equal(info.id, 'kubohiroyakamishibai4');
    for (const color of [info.color1, info.color2, info.color3]) {
      assert.match(color, /^#[0-9a-f]{6}$/iu);
    }
    assert.equal(
      info.blocks.every((block) => block.blockType === 'label'),
      true,
    );
    assert.equal(errors.length, 1);
    return info.blocks.map((block) => block.text).join('\n');
  };
  assert.match(sandboxedLoad('ja-JP'), /「サンドボックスなしで実行する」にチェックを付けて/u);
  assert.match(sandboxedLoad('en'), /check "Run without sandbox"/u);
});

test('keeps PoseNet model data out of the current generated runtime extension', async () => {
  const result = await buildCurrentRuntimeRelease();
  const archive = unzipSync(result.archive);
  const projectBytes = entryOf(archive, 'project.json');
  const project = projectOf(JSON.parse(strFromU8(projectBytes)));
  const runtimeStorage = componentStorageOf(project);
  const extensionUrl = extensionUrlOf(project);
  const extensionSource = Buffer.from(
    extensionUrl.slice('data:text/javascript;base64,'.length),
    'base64',
  );
  const shardPrefix = (
    await readFile(
      require.resolve('@kubohiroya/turbowarp-teachable-machine/posenet-assets/group1-shard1of2.bin'),
    )
  )
    .toString('base64')
    .slice(0, 256);
  const poseNetBundle = await loadDsl4PoseNetProjectBundleData(
    loadDsl4PoseNetProjectBundle(project),
    {
      subtleCrypto: webcrypto.subtle,
    },
  );
  // The embedded WebGPU/WASM backends increase the runtime size; a leaked PoseNet shard
  // still exceeds this ceiling by megabytes. Model bytes belong only in their explicit descriptor.
  assert.equal(
    extensionSource.byteLength < 8_000_000,
    true,
    `runtime extension must stay below 8,000,000 bytes; received ${extensionSource.byteLength}`,
  );
  assert.equal(extensionSource.includes(shardPrefix), false);
  assert.equal(storedMember(runtimeStorage, 'poseNet').encoding, 'base64');
  assert.equal(
    poseNetBundle.files.reduce((total, file) => total + file.bytes.byteLength, 0),
    5_082_500,
  );
  assert.equal(
    projectBytes.byteLength < currentRuntimeProjectJsonMaximumBytes,
    true,
    `runtime project.json must stay below ${currentRuntimeProjectJsonMaximumBytes} bytes; received ${projectBytes.byteLength}`,
  );
});

test('compacts the Standard SB3 with two byte-identical offline SIMD WASM variants', async () => {
  const baseline = unzipSync((await buildCurrentRuntimeRelease(false)).archive);
  const {archive} = await buildCurrentRuntimeRelease(true);
  const compact = unzipSync(archive);
  const projectBytes = entryOf(compact, 'project.json');
  assert(entryOf(baseline, 'project.json').length - projectBytes.length > 1024 * 1024);
  assert(projectBytes.length < 15 * 1024 * 1024);
  const project = projectOf(JSON.parse(strFromU8(projectBytes)));
  const source = Buffer.from(
    extensionUrlOf(project).slice('data:text/javascript;base64,'.length),
    'base64',
  ).toString();
  const assets = [
    ...source.matchAll(
      /get "(tfjs-backend-wasm(?:-threaded-simd|-simd)\.wasm)"\(\)\{const url=kamishibaiPackedWasm\.expand\("([A-Za-z0-9+/=]+)",(\d+)\)/gu,
    ),
  ];
  assert.deepEqual(assets.map(([, name]) => name).sort(), [
    'tfjs-backend-wasm-simd.wasm',
    'tfjs-backend-wasm-threaded-simd.wasm',
  ]);
  for (const [, name, packed, size] of assets) {
    const expected = await readFile(
      require.resolve(`@kubohiroya/turbowarp-teachable-machine/wasm-assets/${name}`),
    );
    assert.equal(expected.byteLength, Number(size));
    assert.deepEqual(Buffer.from(inflateSync(Buffer.from(packed!, 'base64'))), expected);
    assert(!source.includes(expected.toString('base64')));
  }
  const scalar = await readFile(
    require.resolve('@kubohiroya/turbowarp-teachable-machine/wasm-assets/tfjs-backend-wasm.wasm'),
  );
  assert(!source.includes(scalar.toString('base64')));
  assert.doesNotMatch(source, /get "tfjs-backend-wasm\.wasm"/u);
  const restoreGlobals = installUnsandboxedScriptDom();
  const vm = new VirtualMachine();
  try {
    vm.securityManager.canLoadExtensionFromProject = () => true;
    vm.securityManager.getSandboxMode = () => 'unsandboxed';
    await loadProjectQuietly(vm, archive);
    assert.equal(await extensionReporter(vm, 'versionReporter'), releasePins.release.version);
    assert.equal(vm.runtime.getTargetForStage()?.getName(), 'Stage');
  } finally {
    vm.quit();
    restoreGlobals();
  }
});

test('builds one self-contained DSL 4.0 release with a pinned runtime extension', async () => {
  const result = await buildRelease();
  const archive = unzipSync(result.archive);
  const project = projectOf(JSON.parse(strFromU8(entryOf(archive, 'project.json'))));
  const extensionUrl = extensionUrlOf(project);
  const extensionSource = Buffer.from(
    extensionUrl.slice('data:text/javascript;base64,'.length),
    'base64',
  ).toString('utf8');
  const stage = stageOf(project);
  const title = costumeOf(stage, 'Title');
  assert(title, 'The release Stage must contain a Title backdrop.');
  const titleSvg = strFromU8(entryOf(archive, title.md5ext));
  assert.match(titleSvg, />TurboWarp Kamishibai</u);
  assert.doesNotMatch(titleSvg, /Kamishibai DSL 4\.0/u);
  const localizedTitle = costumeOf(stage, 'TitleRuntime');
  const localizedTitleSvg = strFromU8(entryOf(archive, localizedTitle.md5ext));
  assert.match(localizedTitleSvg, />TurboWarp紙芝居</u);
  assert.match(localizedTitleSvg, /Mozilla Public License 2\.0/u);
  assert.match(localizedTitleSvg, />千葉商科大学　総合政策学部</u);
  assert.match(localizedTitleSvg, />久保 裕也 &lt;hiroya@cuc\.ac\.jp&gt;</u);
  assert.doesNotMatch(localizedTitleSvg, />千葉商科大学<\/text>\s*<text[^>]*>総合政策学部</u);
  assert.doesNotMatch(localizedTitleSvg, /\{\{/u);
  const menuSvg = strFromU8(entryOf(archive, costumeOf(stage, 'Menu').md5ext));
  const localizedMenuSvg = strFromU8(entryOf(archive, costumeOf(stage, 'MenuRuntime').md5ext));
  assert.match(menuSvg, />TurboWarp Kamishibai</u);
  assert.match(localizedMenuSvg, />TurboWarp紙芝居</u);
  assert.doesNotMatch(menuSvg, />Open|>Reload|>About|>Language/u);
  assert.doesNotMatch(localizedMenuSvg, />台本を開く|>もう一度|>アプリ情報|>言語/u);
  assert.deepEqual(
    stage.costumes.map(({name}) => name),
    ['Title', 'TitleRuntime', 'Menu', 'MenuRuntime'],
  );
  assert.deepEqual(
    project.targets.map(({name}) => name),
    ['Stage'],
    'Title and menu actions must not add button sprites to the Scratch project.',
  );
  assert.equal(blockOf(stage, 'titleFlag').opcode, 'event_whenflagclicked');
  assert.equal(blockOf(stage, 'titleFlag').next, 'titleFlagShow');
  assert.equal(
    blockOf(stage, 'titleFlagShow').opcode,
    `${bundleExtensionId}_${runtimeExtensionId}__showTitle`,
  );
  assert.equal(blockOf(stage, 'titleStageClick').opcode, 'event_whenstageclicked');
  assert.deepEqual(
    requireRecord(blockOf(stage, 'titleStageClickClose').inputs, 'its inputs').BROADCAST_INPUT,
    [1, [11, 'closeTitle', 'closeTitleMessage']],
  );
  assert.equal(blockOf(stage, 'titleCloseHat').opcode, 'event_whenbroadcastreceived');
  assert.deepEqual(
    requireRecord(blockOf(stage, 'titleCloseHat').fields, 'its fields').BROADCAST_OPTION,
    ['closeTitle', 'closeTitleMessage'],
  );
  assert.equal(
    blockOf(stage, 'titleCloseStart').opcode,
    `${bundleExtensionId}_${runtimeExtensionId}__closeTitle`,
  );

  assert.equal(turbowarpVmCommit, 'c4823421cb7c17d8d8a89878851ce1668c26a21f');
  assert.deepEqual(project.extensions, [bundleExtensionId]);
  assert.deepEqual(Object.keys(project.extensionURLs), [bundleExtensionId]);
  assert.match(extensionUrl, /^data:text\/javascript;base64,/u);
  assert.match(extensionSource, /^\/\/ Name: Kamishibai DSL 4\.0 Runtime/mu);
  assert.match(extensionSource, /^\/\/ ID: kubohiroyakamishibai4/mu);
  assert.match(extensionSource, /blockIconURI/u);
  assert.match(extensionSource, /data:image\/svg\+xml/u);
  assert.match(extensionSource, /data-dsl4-title-controls/u);
  assert.match(extensionSource, /data-dsl4-title-action/u);
  assert.match(extensionSource, /data-dsl4-close-icon/u);
  assert.doesNotMatch(extensionSource, /kubohiroyaweblink/u);
  assert.doesNotMatch(extensionSource, /SB3-Toolchain-Reversible-Bundle-v1/u);
  assert.ok(
    entryOf(archive, 'project.json').byteLength < 16 * 1024 * 1024,
    'The compact bundle must stay within the default browser distribution build limit.',
  );
  for (const [flag, enabled] of Object.entries(dsl4StandardProductionFeatureFlags)) {
    assert.equal(enabled, true);
    if (flag === 'dsl4TurboWarpActionSurface') continue;
    assert.equal(
      extensionSource.includes(`${flag}:!0`),
      true,
      `The Standard release bundle must enable ${flag}.`,
    );
  }
  assert.match(extensionSource, /display:none/u);
  for (const title of [
    'Asset Manager',
    'Async Input',
    'Bubble',
    'Runtime Expression',
    'SVG Text',
    'Teachable Machine',
    'Teachable Machine Pose',
    'TensorFlow.js',
    'PoseNet MobileNetV1 model',
  ]) {
    assert.match(extensionSource, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
  assert.equal(
    extensionSource.includes('TM browser runtime found a different global TensorFlow.js instance.'),
    true,
  );
  const runtimeStorage = componentStorageOf(project);
  assert.equal(
    requireString(storedMember(runtimeStorage, 'source').text, 'the stored source text').includes(
      "kamishibai: '4.0'",
    ),
    true,
  );
  assert.deepEqual(runtimeStorage.application, {mode: 'menu'});
  assert.equal(storedMember(runtimeStorage, 'artifact').controlProfile, 'production');
  assert.deepEqual(storedMember(storedMember(runtimeStorage, 'assets'), 'manifest').assets, []);
  assert.deepEqual(Object.values(requireRecord(stage.variables, 'the stage variables')), [
    ['ポーズ認識', 0],
    ['チャージ', 0],
  ]);
  assert.deepEqual(
    project.monitors.map(({opcode, params, mode, sliderMin, sliderMax, visible}) => ({
      opcode,
      params,
      mode,
      sliderMin,
      sliderMax,
      visible,
    })),
    [
      {
        opcode: 'data_variable',
        params: {VARIABLE: 'ポーズ認識'},
        mode: 'slider',
        sliderMin: 0,
        sliderMax: 100,
        visible: false,
      },
      {
        opcode: 'data_variable',
        params: {VARIABLE: 'チャージ'},
        mode: 'slider',
        sliderMin: 0,
        sliderMax: 100,
        visible: false,
      },
    ],
  );
});

test('generates toolbox XML without missing bundle colors or XML escaping errors', async () => {
  const result = await buildRelease();
  const restoreGlobals = installUnsandboxedScriptDom();
  const vm = new VirtualMachine();
  const originalError = vmLog.error;
  const errors: unknown[][] = [];
  vmLog.error = (...args: unknown[]) => errors.push(args);
  try {
    vm.securityManager.canLoadExtensionFromProject = () => true;
    vm.securityManager.getSandboxMode = () => 'unsandboxed';
    await loadProjectQuietly(vm, result.archive);

    for (let pass = 0; pass < 2; pass++) {
      const categories = vm.runtime.getBlocksXML(vm.runtime.getTargetForStage());
      const category = categories.find(({id}: {id: string}) => id === bundleExtensionId);
      assert.ok(category, 'The runtime bundle must have a toolbox category.');
      assert.equal(
        /(?:colour|secondaryColour)="undefined"/u.test(category.xml),
        false,
        'Toolbox category colors must be defined.',
      );
    }
    const info = requireRecord(await extensionInfo(vm), 'the bundle metadata');
    for (const key of ['color1', 'color2', 'color3']) {
      assert.match(requireString(info[key], key), /^#[0-9a-f]{6}$/iu);
    }
    assert.deepEqual(errors, [], 'Toolbox generation must not report XML escaping errors.');
  } finally {
    vmLog.error = originalError;
    vm.quit();
    restoreGlobals();
  }
});

test('keeps every bundled extension icon and documentation button on its own palette group', async () => {
  const result = await buildRelease();
  const restoreGlobals = installUnsandboxedScriptDom();
  const vm = new VirtualMachine();
  try {
    vm.setCompatibilityMode(false);
    vm.setTurboMode(false);
    vm.setCompilerOptions({enabled: false});
    vm.securityManager.canLoadExtensionFromProject = () => true;
    vm.securityManager.getSandboxMode = () => 'unsandboxed';
    await loadProjectQuietly(vm, result.archive);

    const info = await extensionInfo(vm);
    const headings = info.blocks
      .map((block, index) => ({block, index}))
      .filter(({block}) => block?.sb3Toolchain?.kind === 'bundle-member-heading');
    assert.deepEqual(
      headings.map(({block}) => toolchainOf(block, 'heading block').memberId),
      [
        runtimeExtensionId,
        'kubohiroyaassetcache',
        'kubohiroyaasyncinput',
        'kubohiroyabubble',
        'kubohiroyacamerasource',
        'kubohiroyaruntimeexpression',
        'kubohiroyasvgtext',
        'kubohiroyatm',
      ],
    );
    const expectedDocumentation: Record<string, string> = {
      [runtimeExtensionId]:
        'https://kubohiroya.github.io/turbowarp-kamishibai-docs/4.0/turbowarp-programmer-guides/dsl-4.0-runtime-block-reference/',
      kubohiroyaassetcache: 'https://kubohiroya.github.io/turbowarp-asset-cache/',
      kubohiroyaasyncinput: 'https://kubohiroya.github.io/turbowarp-async-input/',
      kubohiroyabubble: 'https://kubohiroya.github.io/turbowarp-bubble/',
      kubohiroyacamerasource: 'https://kubohiroya.github.io/turbowarp-camera-source/',
      kubohiroyaruntimeexpression: 'https://kubohiroya.github.io/turbowarp-runtime-expression/',
      kubohiroyasvgtext: 'https://kubohiroya.github.io/turbowarp-svg-text/',
      kubohiroyatm: 'https://kubohiroya.github.io/turbowarp-teachable-machine/',
    };

    const memberIcons: unknown[] = [];
    for (const [headingIndex, heading] of headings.entries()) {
      const end = headings[headingIndex + 1]?.index ?? info.blocks.length;
      const paletteGroup = info.blocks.slice(heading.index + 1, end);
      const memberId = toolchainOf(heading.block, 'heading block').memberId;
      const documentationBlocks = paletteGroup.filter(
        (block) => block?.sb3Toolchain?.kind === 'bundle-member-docs',
      );
      assert.equal(documentationBlocks.length, 1, `${memberId} documentation button`);
      const [documentationBlock] = documentationBlocks;
      const documentationMarker = toolchainOf(documentationBlock, 'documentation block');
      assert.equal(documentationMarker.memberId, memberId);
      assert.equal(documentationMarker.docsURI, expectedDocumentation[memberId]);
      assert.equal(requireDefined(documentationBlock, 'the documentation block').blockType, 'xml');
      const documentationXml = requireString(
        requireDefined(documentationBlock, 'the documentation block').xml,
        'its palette XML',
      );
      assert.match(documentationXml, /callbackKey="OPEN_EXTENSION_DOCS"/u);
      assert.match(
        documentationXml,
        new RegExp(`callbackData="${expectedDocumentation[memberId]}"`, 'u'),
      );

      const memberBlocks = paletteGroup.filter(
        (block) => block && typeof block === 'object' && typeof block.opcode === 'string',
      );
      assert(memberBlocks.length > 0, memberId);
      if (memberId === 'kubohiroyacamerasource') {
        const opcodes = memberBlocks.map(({opcode}) => opcode);
        for (const opcode of [
          'startSharedCameraFromCameraButton',
          'hideCameraButton',
          'cameraButtonAvailable',
        ]) {
          assert(opcodes.includes(`${memberId}__${opcode}`), `missing Camera Source ${opcode}`);
        }
      }
      if (memberId === 'kubohiroyatm') {
        const opcodes = memberBlocks.map(({opcode}) => opcode);
        for (const opcode of [
          'startRecognition',
          'stopRecognition',
          'isRecognizing',
          'firstRecognitionMsReporter',
        ]) {
          assert(
            opcodes.includes(`${memberId}__${opcode}`),
            `missing Teachable Machine ${releasePins.extensions['@kubohiroya/turbowarp-teachable-machine']} opcode ${opcode}`,
          );
        }
        for (const opcode of [
          'startPredict',
          'stopPredict',
          'isPredicting',
          'firstPredictMsReporter',
        ]) {
          assert.equal(
            opcodes.includes(`${memberId}__${opcode}`),
            false,
            `removed Teachable Machine opcode ${opcode}`,
          );
        }
      }
      for (const block of memberBlocks) {
        assert.equal(typeof block.blockIconURI, 'string', memberId);
        const uri = String(block.blockIconURI);
        const match = /^data:image\/svg\+xml(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/u.exec(uri);
        assert(match, `${memberId}: each block must carry a bundled SVG icon`);
        const svg = match[1]
          ? Buffer.from(requireDefined(match[2], 'base64 SVG bytes'), 'base64').toString('utf8')
          : decodeURIComponent(requireDefined(match[2], 'encoded SVG bytes'));
        assert.match(svg, /<svg\b/u, memberId);
      }
      memberIcons.push(requireDefined(memberBlocks[0], 'the first member block').blockIconURI);
    }
    assert.equal(new Set(memberIcons).size, headings.length);
  } finally {
    vm.quit();
    restoreGlobals();
  }
});

test('shares the bundled camera with the permission block without acquiring or stopping host tracks', async () => {
  const result = await buildRelease();
  const restoreGlobals = installUnsandboxedScriptDom();
  const vm = new VirtualMachine();
  const getUserMedia = vi.fn(() => assert.fail('An adopted camera must not be acquired again.'));
  const stop = vi.fn();
  const track = {
    readyState: 'live',
    getSettings: () => ({deviceId: 'host-camera', width: 640, height: 480}),
    addEventListener() {},
    stop,
  };
  const stream = {
    active: true,
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };
  const video = {
    videoWidth: 640,
    videoHeight: 480,
    srcObject: null as unknown,
    async play() {},
  };
  try {
    vm.securityManager.canLoadExtensionFromProject = () => true;
    vm.securityManager.getSandboxMode = () => 'unsandboxed';
    await loadProjectQuietly(vm, result.archive);
    vi.stubGlobal('navigator', {mediaDevices: {getUserMedia}});
    vi.stubGlobal('document', {
      ...globalThis.document,
      createElement(tagName: string) {
        assert.equal(tagName, 'video', 'A prepared camera must not display another permission UI.');
        return video;
      },
    });
    const camera = requireDefined(readCameraSourceRuntime(vm.runtime), 'the bundled camera');
    assert.equal(typeof camera.adoptCamera, 'function');
    const owner = await camera.adoptCamera!({
      owner: 'app-shell',
      cameraId: 'pose',
      stream: stream as unknown as MediaStream,
    });
    const consumer = await camera.acquireCamera({owner: 'teachable-machine', cameraId: 'pose'});
    assert.equal(consumer.getFrameSource().element, video);
    assert.equal(consumer.getFrameSource().previewFlip, 'none');
    const service = requireDefined(
      vm.extensionManager._loadedExtensions.get(bundleExtensionId),
      'the bundle service',
    );
    await dispatch.call(service, 'kubohiroyacamerasource__startSharedCameraFromCameraButton', {
      CAMERA_ID: 'pose',
    });
    await owner.release();
    await consumer.release();
    assert.equal(video.srcObject, stream, 'The permission block still holds the shared stream.');
    vm.stopAll();
    assert.equal(video.srcObject, null, 'Stopping the project detaches the final camera lease.');
    assert.equal(stop.mock.calls.length, 0, 'The app remains responsible for its own tracks.');
    assert.equal(getUserMedia.mock.calls.length, 0);
    await assert.rejects(async () => consumer.getFrameSource(), /not running/u);
  } finally {
    vm.quit();
    vi.unstubAllGlobals();
    restoreGlobals();
  }
});

test('builds a browser-selected YAML story and only its declared local assets in memory', async () => {
  const result = await buildRelease();
  const archive = unzipSync(result.archive);
  const project = projectOf(JSON.parse(strFromU8(entryOf(archive, 'project.json'))));
  const sourceText = `kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
assets:
  Card:
    kind: backdrop
    file: assets/card.svg
  Rescue:
    kind: recognitionModel
    file: models/rescue.zip
cover:
  backdrop: Card
scenes:
  opening:
    recognitionModel: Rescue
    actions:
      - wait: 0
`;
  const card = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>',
  );
  const poseArchive = zipSync({
    'metadata.json': strToU8('{"labels":["rescue"]}'),
    'model.json': strToU8('{"weightsManifest":[{"paths":["weights.bin"]}]}'),
    'weights.bin': new Uint8Array([1, 2, 3]),
  });
  const built = await buildDsl4BrowserSelectedStoryProject({
    project,
    entries: [
      {
        path: 'story-project/story.k4.yml',
        file: createBrowserFile('story.k4.yml', new TextEncoder().encode(sourceText)),
      },
      {path: 'story-project/assets/card.svg', file: createBrowserFile('card.svg', card)},
      {
        path: 'story-project/models/rescue.zip',
        file: createBrowserFile('rescue.zip', poseArchive),
      },
      {
        path: 'story-project/private.txt',
        file: createBrowserFile('private.txt', new Uint8Array([1, 2, 3])),
      },
    ],
    sourceFrontend: frontend,
    maxSourceBytes: storyComponentLimits.maxSourceBytes,
    maxAssetFileBytes: storyComponentLimits.maxTotalAssetBytes,
    maxAssetFiles: storyComponentLimits.maxAssetFiles,
    maxTotalAssetBytes: storyComponentLimits.maxTotalAssetBytes,
    subtleCrypto: webcrypto.subtle,
  });
  const component = componentStorageOf(projectOf(built.project));
  const storedAssets = storedMember(component, 'assets');
  assert.deepEqual(component.application, {mode: 'story'});
  assert.equal(storedMember(component, 'source').text, sourceText);
  assert.deepEqual(
    requireArray(storedAssets.files, 'the stored asset files').map((file) => {
      const {assetId, path: filePath, size} = requireRecord(file, 'a stored asset file');
      return {assetId, path: filePath, size};
    }),
    [
      {assetId: 'Card', path: 'card.svg', size: card.byteLength},
      {
        assetId: 'Rescue',
        path: 'metadata.json',
        size: strToU8('{"labels":["rescue"]}').byteLength,
      },
      {
        assetId: 'Rescue',
        path: 'model.json',
        size: strToU8('{"weightsManifest":[{"paths":["weights.bin"]}]}').byteLength,
      },
      {assetId: 'Rescue', path: 'weights.bin', size: 3},
    ],
  );
  assert.equal(
    requireRecord(
      requireDefined(
        requireArray(storedMember(storedAssets, 'manifest').assets, 'the stored manifest assets')
          .map((asset) => requireRecord(asset, 'a manifest asset'))
          .find((asset) => asset.id === 'Rescue'),
        'the Rescue asset',
      ).source,
      'its source',
    ).mode,
    'archive',
  );
});

test('reports a missing embedded asset with its story file and source reference line', async () => {
  const sourceText = `kamishibai: '4.0'
assets:
  MissingCard:
    kind: backdrop
    file: assets/missing-card.svg
scenes:
  opening:
    - wait: 0
`;

  await assert.rejects(
    buildDsl4BrowserSelectedStoryProject({
      project: {},
      entries: [
        {
          path: 'story-project/story.k4.yml',
          file: createBrowserFile('story.k4.yml', new TextEncoder().encode(sourceText)),
        },
      ],
      sourceFrontend: frontend,
      maxSourceBytes: storyComponentLimits.maxSourceBytes,
      maxAssetFileBytes: storyComponentLimits.maxTotalAssetBytes,
      maxAssetFiles: storyComponentLimits.maxAssetFiles,
      maxTotalAssetBytes: storyComponentLimits.maxTotalAssetBytes,
      subtleCrypto: webcrypto.subtle,
    }),
    (error) => {
      assert.equal(thrown(error).code, 'K4-ASSET-MISSING');
      assert.equal(
        requireString(thrown(error).message, 'the build failure message'),
        [
          'The asset file referenced in the story could not be found.',
          'file: story-project/story.k4.yml',
          '[5] MissingCard,assets/missing-card.svg',
        ].join('\n'),
      );
      return true;
    },
  );
});

test('keeps the selected source suffix strict after the native chooser accepts YAML files', () => {
  assert.throws(
    () =>
      selectDsl4BrowserStorySource([
        {path: 'story.yml', file: createBrowserFile('story.yml', new Uint8Array())},
      ]),
    /No \.k4\.yml file was selected/u,
  );
  assert.equal(
    selectDsl4BrowserStorySource([
      {path: 'story.k4.yml', file: createBrowserFile('story.k4.yml', new Uint8Array())},
    ]).path,
    'story.k4.yml',
  );
  assert.equal(
    selectDsl4BrowserStorySource([
      {
        path: 'story.kamishibai.yaml',
        file: createBrowserFile('story.kamishibai.yaml', new Uint8Array()),
      },
    ]).path,
    'story.kamishibai.yaml',
  );
});

test('collects a dropped DSL 4.0 project directory without flattening asset paths', async () => {
  const source = createBrowserFile('story.k4.yml', new TextEncoder().encode("kamishibai: '4.0'\n"));
  const card = createBrowserFile('card.svg', new TextEncoder().encode('<svg/>'));
  const root = createBrowserDirectoryHandle('story-project', [
    ['story.k4.yml', createBrowserFileHandle('story.k4.yml', source)],
    [
      'assets',
      createBrowserDirectoryHandle('assets', [
        ['card.svg', createBrowserFileHandle('card.svg', card)],
      ]),
    ],
  ]);
  const entries = await collectDsl4BrowserDroppedFiles({
    items: [
      {
        async getAsFileSystemHandle() {
          return root;
        },
      },
    ],
  });
  assert.deepEqual(
    entries.map(({path: filePath}) => filePath),
    ['story-project/assets/card.svg', 'story-project/story.k4.yml'],
  );
});

test('stops dropped-directory enumeration at the configured entry and depth boundaries', async () => {
  let fileReads = 0;
  const fileHandle = (name: string): BrowserFileHandle => ({
    kind: 'file',
    name,
    async getFile() {
      fileReads += 1;
      return createBrowserFile(name, new Uint8Array([1]));
    },
  });
  const wideRoot = {
    kind: 'directory',
    name: 'wide',
    async *entries() {
      yield ['first.k4.yml', fileHandle('first.k4.yml')];
      yield ['second.svg', fileHandle('second.svg')];
      assert.fail('Directory enumeration must stop at maxEntries.');
    },
  };
  await assert.rejects(
    collectDsl4BrowserDroppedFiles(
      {
        items: [
          {
            async getAsFileSystemHandle() {
              return wideRoot;
            },
          },
        ],
      },
      {maxEntries: 2, maxDepth: 4},
    ),
    /2 entry limit/u,
  );
  assert.equal(fileReads, 0, 'The collector must reject before reading a bounded-out file.');

  const nestedRoot = createBrowserDirectoryHandle('root', [
    [
      'first',
      createBrowserDirectoryHandle('first', [
        [
          'second',
          createBrowserDirectoryHandle('second', [['story.k4.yml', fileHandle('story.k4.yml')]]),
        ],
      ]),
    ],
  ]);
  await assert.rejects(
    collectDsl4BrowserDroppedFiles(
      {
        items: [
          {
            async getAsFileSystemHandle() {
              return nestedRoot;
            },
          },
        ],
      },
      {maxEntries: 16, maxDepth: 1},
    ),
    /directory depth limit/u,
  );
  assert.equal(fileReads, 0);

  await assert.rejects(
    collectDsl4BrowserDroppedFiles(
      {
        items: [{}, {}, {}],
      },
      {maxEntries: 2, maxDepth: 4},
    ),
    /2 entry limit/u,
  );

  await assert.rejects(
    collectDsl4BrowserDroppedFiles(
      {
        files: [
          {
            ...createBrowserFile('story.k4.yml', new Uint8Array([1])),
            webkitRelativePath: 'root/one/two/story.k4.yml',
          },
        ],
      },
      {maxEntries: 2, maxDepth: 2},
    ),
    /directory depth limit/u,
  );
});

test('uses the application menu SVG bytes as the reusable DOM menu defaults', () => {
  const {build, ...legacyIcons} = dsl4RuntimeApplicationMenuDefaultIcons;
  assert.deepEqual(legacyIcons, applicationMenuIconDataUrls);
  assert.match(build, /^data:image\/svg\+xml;base64,/u);
});

test('draws a balanced reload arrowhead as part of one outlined shape', () => {
  const svg = Buffer.from(applicationMenuIconDataUrls.reload.split(',')[1], 'base64').toString(
    'utf8',
  );
  assert.equal((svg.match(/<path\b/gu) ?? []).length, 1);
  assert.match(svg, /d="M43\.5 19\.4 38\.2 7\.1 36\.2 9\.4A19 19/u);
  assert.match(svg, /A13 13 0 1 1 32\.4 14L30\.4 16\.3Z"/u);
  assert.match(svg, /fill="#d85656" stroke="#000" stroke-width="2\.5"/u);
});

test('preserves source and explicit PoseNet model data through a pinned TurboWarp resave', async () => {
  const result = await buildCurrentRuntimeRelease();
  const archive = unzipSync(result.archive);
  const originalProject = projectOf(JSON.parse(strFromU8(entryOf(archive, 'project.json'))));
  const originalComponent = componentStorageOf(originalProject);
  const originalSource = storedMember(originalComponent, 'source');
  const originalPoseNet = storedMember(originalComponent, 'poseNet');
  const restoreGlobals = installUnsandboxedScriptDom();
  const vm = new VirtualMachine();
  try {
    vm.setCompatibilityMode(false);
    vm.setTurboMode(false);
    vm.setCompilerOptions({enabled: false});
    vm.securityManager.canLoadExtensionFromProject = () => true;
    vm.securityManager.getSandboxMode = () => 'unsandboxed';
    await loadProjectQuietly(vm, result.archive);

    const resavedProject = JSON.parse(vm.toJSON());
    assert.deepEqual(
      resavedProject.extensionStorage[bundleExtensionId].components[runtimeExtensionId].source,
      originalSource,
    );
    assert.deepEqual(
      resavedProject.extensionStorage[bundleExtensionId].components[runtimeExtensionId].poseNet,
      originalPoseNet,
    );
  } finally {
    vm.quit();
    restoreGlobals();
  }
});

test('opens the fixed official website through the Runtime 4 opcode', async () => {
  const result = await buildRelease();
  const restoreGlobals = installUnsandboxedScriptDom();
  const opened: unknown[][] = [];
  const previousOpenDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'open');
  Object.defineProperty(globalThis, 'open', {
    configurable: true,
    value: (...args: unknown[]) => opened.push(args),
  });
  const vm = new VirtualMachine();
  try {
    vm.setCompatibilityMode(false);
    vm.setTurboMode(false);
    vm.setCompilerOptions({enabled: false});
    vm.securityManager.canLoadExtensionFromProject = () => true;
    vm.securityManager.getSandboxMode = () => 'unsandboxed';
    await loadProjectQuietly(vm, result.archive);

    await extensionReporter(vm, 'openOfficialWebsite');
    assert.deepEqual(opened, [
      ['https://kubohiroya.github.io/turbowarp-kamishibai-app/', '_blank', 'noopener,noreferrer'],
    ]);
  } finally {
    vm.quit();
    restoreGlobals();
    if (previousOpenDescriptor) Object.defineProperty(globalThis, 'open', previousOpenDescriptor);
    else Reflect.deleteProperty(globalThis, 'open');
  }
});

test('registers all DSL 4.0 runtime blocks as visible VM primitives', async () => {
  const result = await buildRelease();
  const restoreGlobals = installUnsandboxedScriptDom();
  const vm = new VirtualMachine();
  try {
    vm.setCompatibilityMode(false);
    vm.setTurboMode(false);
    vm.setCompilerOptions({enabled: false});
    vm.securityManager.canLoadExtensionFromProject = () => true;
    vm.securityManager.getSandboxMode = () => 'unsandboxed';
    await loadProjectQuietly(vm, result.archive);

    const commands = [
      ...dsl4CoreActionManifest.map(({command}) => command),
      'sayText',
      'thinkText',
    ];
    // `dsl4TurboWarpStateSurface` is on in the Standard profile, so the read-only reporters are
    // palette-visible. Writing a story variable is a core action, so it has no block here.
    const stateSurfaceReporters = [
      'storyVariableReporter',
      'storyVariableExists',
      'storyVariableType',
      'storyStatusReporter',
      'currentSceneIdReporter',
      'currentActionNumberReporter',
      'currentActionPathReporter',
      'lastRuntimeErrorCodeReporter',
      'lastRuntimeErrorStoryPathReporter',
      'posePhaseReporter',
      'poseTargetReporter',
      'poseNameReporter',
      'poseStepNumberReporter',
      'runtimeVersionReporter',
      'applicationStatusReporter',
      'canNavigateToPreviousAction',
      'canNavigateToNextAction',
    ];
    const bundledCommands = ['embeddedYaml', ...commands, ...stateSurfaceReporters].map(
      (command) => `${runtimeExtensionId}__${command}`,
    );
    const category = vm.runtime._blockInfo.find(({id}: {id: string}) => id === bundleExtensionId);
    assert(category, 'The embedded DSL 4.0 runtime category was not registered.');
    assert.deepEqual(
      category.blocks
        .filter(
          ({info}: VmCategoryBlock) =>
            info.opcode?.startsWith(`${runtimeExtensionId}__`) && info.hideFromPalette !== true,
        )
        .map(({info}: VmCategoryBlock) => info.opcode),
      bundledCommands,
    );
    const sourceMarker = category.blocks.find(
      ({info}: VmCategoryBlock) => info.opcode === `${runtimeExtensionId}__embeddedYaml`,
    );
    assert.equal(sourceMarker?.info.blockType, 'hat');
    const navigateSource = vm.runtime.getOpcodeFunction(
      `${bundleExtensionId}_${runtimeExtensionId}__embeddedYaml`,
    );
    assert.equal(typeof navigateSource, 'function');
    assert.equal(
      navigateSource({}, {}),
      false,
      'The source navigation declaration must remain inert.',
    );
    for (const command of commands) {
      assert.equal(
        typeof vm.runtime.getOpcodeFunction(
          `${bundleExtensionId}_${runtimeExtensionId}__${command}`,
        ),
        'function',
        command,
      );
    }
  } finally {
    vm.quit();
    restoreGlobals();
  }
});

test('opens the non-embedded title and menu without validating a packaged story bundle', async () => {
  const result = await buildRelease();
  const restoreGlobals = installUnsandboxedScriptDom({withTitleUi: true});
  const opened: unknown[][] = [];
  const previousOpenDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'open');
  Object.defineProperty(globalThis, 'open', {
    configurable: true,
    value: (...args: unknown[]) => opened.push(args),
  });
  const vm = new VirtualMachine();
  try {
    vm.setCompatibilityMode(false);
    vm.setTurboMode(false);
    vm.setCompilerOptions({enabled: false});
    vm.securityManager.canLoadExtensionFromProject = () => true;
    vm.securityManager.getSandboxMode = () => 'unsandboxed';
    await loadProjectQuietly(vm, result.archive);
    vm.runtime.renderer = fakeRenderer();
    const originalToJSON = vm.toJSON.bind(vm);
    vm.toJSON = () => {
      const project = projectOf(JSON.parse(originalToJSON()));
      const component = componentStorageOf(project);
      component.assets = {formatVersion: 0};
      return JSON.stringify(project);
    };

    assert.equal(await extensionReporter(vm, 'versionReporter'), releasePins.release.version);
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'ready');
    assert.deepEqual(JSON.parse(await extensionReporter(vm, 'binaryBackingStatusReporter')), {
      surface: null,
      backing: null,
    });
    assert.deepEqual(JSON.parse(await extensionReporter(vm, 'runtimeDiagnosticsReporter')), {
      status: 'ready',
      surface: null,
      runtime: null,
      resources: null,
      backing: null,
    });
    const titleControls = requireFirst(
      findByAttribute(shellBody(restoreGlobals), 'data-dsl4-title-controls', 'true'),
      'the queried element',
    );
    assert(titleControls, 'English DOM title controls must exist before the green flag.');
    assert.equal(titleControls.style.display, 'block');
    assert.equal(
      requireFirst(
        findByAttribute(titleControls, 'data-dsl4-title-action', 'website'),
        'the queried element',
      ).getAttribute('aria-label'),
      'Official Website',
    );
    const initialCloseButton = requireFirst(
      findByAttribute(titleControls, 'data-dsl4-title-action', 'close'),
      'the queried element',
    );
    assert.equal(initialCloseButton.getAttribute('aria-label'), 'Close');
    assert.equal(shellBody(restoreGlobals).style.cursor, 'pointer');
    initialCloseButton.click();
    const initialCloseDeadline = Date.now() + 5_000;
    while (Date.now() < initialCloseDeadline) {
      vm.runtime._step();
      if ((await extensionReporter(vm, 'statusReporter')) === 'menu') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'menu');
    const initialApplicationMenu = requireFirst(
      findByAttribute(shellBody(restoreGlobals), 'data-dsl4-application-menu', 'true'),
      'the queried element',
    );
    assert(initialApplicationMenu, 'The menu must not depend on a packaged story runtime.');
    const initialReloadButton = requireFirst(
      findByAttribute(initialApplicationMenu, 'data-dsl4-menu-action', 'reload'),
      'the queried element',
    );
    assert.equal(initialReloadButton.disabled, true);
    assert.equal(initialReloadButton.getAttribute('aria-disabled'), 'true');
    assert.equal(initialReloadButton.style.cursor, 'not-allowed');
    requireFirst(
      findByAttribute(initialApplicationMenu, 'data-dsl4-menu-action', 'about'),
      'the queried element',
    ).click();
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'title');
    assert.equal(
      vm.runtime.getTargetForStage().sprite.costumes[vm.runtime.getTargetForStage().currentCostume]
        .name,
      'Title',
    );
    assert.equal(titleControls.style.display, 'block');
    assert.equal(
      findByAttribute(shellBody(restoreGlobals), 'data-dsl4-title-shell', 'true').length,
      0,
      'About must reuse the Stage title instead of opening a separate simplified dialog.',
    );
    await extensionReporter(vm, 'closeTitle');
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'menu');
    vm.greenFlag();
    const titleDeadline = Date.now() + 5_000;
    while (Date.now() < titleDeadline) {
      vm.runtime._step();
      if ((await extensionReporter(vm, 'statusReporter')) === 'title') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'title');
    assert.equal(titleControls.style.display, 'block');
    const websiteButton = requireFirst(
      findByAttribute(titleControls, 'data-dsl4-title-action', 'website'),
      'the queried element',
    );
    websiteButton.click();
    assert.deepEqual(opened, [
      ['https://kubohiroya.github.io/turbowarp-kamishibai-app/', '_blank', 'noopener,noreferrer'],
    ]);
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'title');
    assert.equal(
      vm.runtime.getTargetForStage().lookupBroadcastMsg('closeTitleMessage', 'closeTitle')?.name,
      'closeTitle',
    );
    const stageClickThreads = vm.runtime.startHats('event_whenstageclicked');
    assert.equal(stageClickThreads.length, 1, 'The Stage click must start the closeTitle stack.');
    const startupDeadline = Date.now() + 5_000;
    while (Date.now() < startupDeadline) {
      vm.runtime._step();
      const status = await extensionReporter(vm, 'statusReporter');
      if (status === 'menu') break;
      if (status === 'error') {
        assert.fail(`DSL 4.0 runtime failed: ${await extensionReporter(vm, 'lastErrorReporter')}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const finalStatus = await extensionReporter(vm, 'statusReporter');
    assert.equal(
      finalStatus,
      'menu',
      `DSL 4.0 runtime remained ${finalStatus} at startup timeout; threads=${JSON.stringify(
        vm.runtime.threads.map(({topBlock, status, stack}: Record<string, unknown>) => ({
          topBlock,
          status,
          stack,
        })),
      )}`,
    );
    assert.equal(
      vm.runtime.getTargetForStage().sprite.costumes[vm.runtime.getTargetForStage().currentCostume]
        .name,
      'Menu',
    );

    vm.greenFlag();
    const secondTitleDeadline = Date.now() + 5_000;
    while (Date.now() < secondTitleDeadline) {
      vm.runtime._step();
      if ((await extensionReporter(vm, 'statusReporter')) === 'title') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'title');
    assert.equal(titleControls.style.display, 'block');
    const closeButton = requireFirst(
      findByAttribute(titleControls, 'data-dsl4-title-action', 'close'),
      'the queried element',
    );
    const originalStartHats = vm.runtime.startHats.bind(vm.runtime);
    let closeBroadcastStarts = 0;
    vm.runtime.startHats = (opcode: string, fields: Record<string, unknown>, target: unknown) => {
      if (opcode === 'event_whenbroadcastreceived' && fields?.BROADCAST_OPTION === 'closeTitle') {
        closeBroadcastStarts += 1;
      }
      return originalStartHats(opcode, fields, target);
    };
    closeButton.click();
    const closeDeadline = Date.now() + 5_000;
    while (Date.now() < closeDeadline) {
      vm.runtime._step();
      const status = await extensionReporter(vm, 'statusReporter');
      if (status === 'menu') break;
      if (status === 'error') {
        assert.fail(`DSL 4.0 runtime failed: ${await extensionReporter(vm, 'lastErrorReporter')}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(closeBroadcastStarts, 1, 'The DOM close action must broadcast closeTitle once.');
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'menu');
    assert.equal(
      vm.runtime.getTargetForStage().sprite.costumes[vm.runtime.getTargetForStage().currentCostume]
        .name,
      'Menu',
    );
    assert.equal(titleControls.style.display, 'none');
  } finally {
    vm.quit();
    restoreGlobals();
    if (previousOpenDescriptor) Object.defineProperty(globalThis, 'open', previousOpenDescriptor);
    else Reflect.deleteProperty(globalThis, 'open');
  }
});

async function assertNaturallyFinishedStoryReturnsToMenu(
  archive: unknown,
  expectedDisplayNames: string[] = [],
) {
  const restoreGlobals = installUnsandboxedScriptDom({withTitleUi: true});
  const vm = new VirtualMachine();
  try {
    vm.setCompatibilityMode(false);
    vm.setTurboMode(false);
    vm.setCompilerOptions({enabled: false});
    vm.securityManager.canLoadExtensionFromProject = () => true;
    vm.securityManager.getSandboxMode = () => 'unsandboxed';
    await loadProjectQuietly(vm, archive);
    let nextSkinId = 1;
    let nextDrawableId = 1;
    for (const target of vm.runtime.targets) {
      target.drawableID = nextDrawableId;
      nextDrawableId += 1;
      for (const costume of target.sprite?.costumes ?? []) {
        costume.skinId = nextSkinId;
        nextSkinId += 1;
      }
    }
    vm.runtime.renderer = fakeRenderer();

    vm.greenFlag();
    const titleDeadline = Date.now() + 5_000;
    while (Date.now() < titleDeadline) {
      vm.runtime._step();
      if ((await extensionReporter(vm, 'statusReporter')) === 'title') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'title');
    assert.equal(
      requireDefined(restoreGlobals.document, 'the title shell document').listenerCount('keydown'),
      1,
      'A packaged story must attach its resolved production keymap to the document.',
    );
    const titleControls = requireFirst(
      findByAttribute(shellBody(restoreGlobals), 'data-dsl4-title-controls', 'true'),
      'the queried element',
    );
    assert(titleControls, 'Title controls must be mounted above the Stage.');
    assert.equal(titleControls.style.display, 'block');
    assert.deepEqual(
      vm.runtime.targets.map((target: {getName(): string}) => target.getName()),
      ['Stage', ...expectedDisplayNames],
    );
    assert.equal(
      vm.runtime.targets
        .filter((target: {isStage: boolean}) => !target.isStage)
        .every((target: {visible: boolean}) => !target.visible),
      true,
    );

    await extensionReporter(vm, 'closeTitle');
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'menu');
    const stage = vm.runtime.getTargetForStage();
    assert.equal(stage.sprite.costumes[stage.currentCostume].name, 'Menu');
    assert.equal(titleControls.style.display, 'none');
    const applicationMenus = findByAttribute(
      shellBody(restoreGlobals),
      'data-dsl4-application-menu',
      'true',
    );
    assert.equal(applicationMenus.length, 1);
    const applicationMenu = requireFirst(applicationMenus, 'the application menu');
    assert.equal(applicationMenu.style.display, 'block');
    for (const action of ['open', 'reload', 'about', 'language']) {
      const buttons = findByAttribute(applicationMenu, 'data-dsl4-menu-action', action);
      assert.equal(buttons.length, 1);
      const button = requireFirst(buttons, `the ${action} button`);
      const icon = requireDefined(button.children[0], 'its icon');
      const label = requireDefined(button.children[1], 'its label');
      assert.equal(icon.tagName, 'SPAN');
      assert.equal(icon.style.backgroundImage, `url("${applicationMenuIconDataUrls[action]}")`);
      assert.equal(icon.getAttribute('aria-hidden'), 'true');
      assert.match(
        requireString(icon.style.filter, 'its filter'),
        /invert\(1\).*saturate\(\.35\)/u,
      );
      assert.match(
        requireString(icon.style.cssText, 'its inline style'),
        /width:6\.6667cqw;height:6\.6667cqw/u,
      );
      assert.match(requireString(label.style.cssText, 'its inline style'), /font-size:2\.5333cqw/u);
      assert.doesNotMatch(requireString(icon.style.cssText, 'its inline style'), /clamp|px/u);
      assert.doesNotMatch(requireString(label.style.cssText, 'its inline style'), /clamp|px/u);
    }

    const languageButton = requireFirst(
      findByAttribute(applicationMenu, 'data-dsl4-menu-action', 'language'),
      'the queried element',
    );
    languageButton.click();
    assert.equal(stage.sprite.costumes[stage.currentCostume].name, 'MenuRuntime');
    assert.equal(requireDefined(languageButton.children[1], 'its label').textContent, '言語');

    const aboutButton = requireFirst(
      findByAttribute(applicationMenu, 'data-dsl4-menu-action', 'about'),
      'the queried element',
    );
    aboutButton.click();
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'title');
    assert.equal(stage.sprite.costumes[stage.currentCostume].name, 'TitleRuntime');
    assert.equal(applicationMenu.style.display, 'none');
    assert.equal(titleControls.style.display, 'block');
    assert.equal(
      findByAttribute(shellBody(restoreGlobals), 'data-dsl4-title-shell', 'true').length,
      0,
    );
    await extensionReporter(vm, 'closeTitle');
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'menu');
    assert.equal(stage.sprite.costumes[stage.currentCostume].name, 'MenuRuntime');
    assert.equal(applicationMenu.style.display, 'block');

    const reloadButton = requireFirst(
      findByAttribute(applicationMenu, 'data-dsl4-menu-action', 'reload'),
      'the queried element',
    );
    assert.equal(reloadButton.disabled, false);
    assert.equal(reloadButton.getAttribute('aria-disabled'), 'false');
    reloadButton.click();
    let sawReloadStart = false;
    const reloadDeadline = Date.now() + 5_000;
    while (Date.now() < reloadDeadline) {
      vm.runtime._step();
      const status = await extensionReporter(vm, 'statusReporter');
      if (status === 'starting' || status === 'running') sawReloadStart = true;
      if (sawReloadStart && status === 'menu') break;
      if (status === 'error') {
        assert.fail(`DSL 4.0 reload failed: ${await extensionReporter(vm, 'lastErrorReporter')}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(sawReloadStart, true, 'Reload must start the packaged story again.');
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'menu');

    for (const target of vm.runtime.targets) {
      if (!target.isStage) target.setVisible(true);
    }
    vm.stopAll();
    vm.greenFlag();
    const restartDeadline = Date.now() + 5_000;
    while (Date.now() < restartDeadline) {
      vm.runtime._step();
      if ((await extensionReporter(vm, 'statusReporter')) === 'title') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'title');
    assert.equal(stage.sprite.costumes[stage.currentCostume].name, 'Title');
    assert.equal(titleControls.style.display, 'block');
    assert.equal(applicationMenu.style.display, 'none');
    assert.deepEqual(
      vm.runtime.targets
        .filter((target: {isStage: boolean}) => !target.isStage)
        .map((target: {getName(): string; visible: boolean}) => ({
          name: target.getName(),
          visible: target.visible,
        })),
      expectedDisplayNames.map((name) => ({name, visible: false})),
      'Red stop followed by the green flag must hide every actor and text target before title.',
    );
  } finally {
    vm.quit();
    restoreGlobals();
  }
}

test('returns a naturally finished embedded story to the menu and allows a restart', async () => {
  await assertNaturallyFinishedStoryReturnsToMenu(await buildEmbeddedStoryRelease(), [
    'Actor',
    'Narration',
  ]);
});

async function buildBlockStoryRelease() {
  const result = await buildRelease();
  const authored = authorDsl4BlockSourceSb3({
    baseBytes: result.archive,
    sourceFrontend: frontend,
    sourceText: `kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
assets:
  EndCover:
    kind: backdrop
    name: Menu
cover:
  backdrop: EndCover
scenes:
  opening:
    - wait: 0.05
`,
  });
  assert.ok(authored.ok);
  return authored.bytes;
}

test('runs packaged video actions by default without a URL switch', async () => {
  const base = await buildRelease();
  const authored = authorDsl4BlockSourceSb3({
    baseBytes: base.archive,
    sourceFrontend: frontend,
    sourceText: `kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - videoControl: {id: absent, operation: stop}
`,
  });
  assert.ok(authored.ok);
  const restoreGlobals = installUnsandboxedScriptDom({withTitleUi: true});
  const vm = new VirtualMachine();
  try {
    vm.setCompilerOptions({enabled: false});
    vm.securityManager.canLoadExtensionFromProject = () => true;
    vm.securityManager.getSandboxMode = () => 'unsandboxed';
    await loadProjectQuietly(vm, authored.bytes);
    // Headless VM loading leaves native backdrop skins unallocated.
    let nextSkinId = 1;
    for (const target of vm.runtime.targets) {
      target.drawableID = nextSkinId++;
      for (const costume of target.sprite?.costumes ?? []) costume.skinId = nextSkinId++;
    }
    vm.runtime.renderer = fakeRenderer();
    await extensionReporter(vm, 'closeTitle');
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'error');
    assert.match(
      String(await extensionReporter(vm, 'lastErrorReporter')),
      /Unknown video id: absent/u,
    );
  } finally {
    vm.quit();
    restoreGlobals();
  }
});

test('starts an empty-name embedded block story instead of opening a story file', async () => {
  await assertNaturallyFinishedStoryReturnsToMenu(await buildBlockStoryRelease());
});

test('starts the embedded block story from the initial title without pressing the green flag', async () => {
  const archive = await buildBlockStoryRelease();
  const restoreGlobals = installUnsandboxedScriptDom({withTitleUi: true});
  const vm = new VirtualMachine();
  try {
    vm.setCompatibilityMode(false);
    vm.setTurboMode(false);
    vm.setCompilerOptions({enabled: false});
    vm.securityManager.canLoadExtensionFromProject = () => true;
    vm.securityManager.getSandboxMode = () => 'unsandboxed';
    await loadProjectQuietly(vm, archive);
    let nextSkinId = 1;
    let nextDrawableId = 1;
    for (const target of vm.runtime.targets) {
      target.drawableID = nextDrawableId++;
      for (const costume of target.sprite?.costumes ?? []) costume.skinId = nextSkinId++;
    }
    vm.runtime.renderer = fakeRenderer();
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'ready');
    await extensionReporter(vm, 'closeTitle');
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'menu');
    const menu = requireFirst(
      findByAttribute(shellBody(restoreGlobals), 'data-dsl4-application-menu', 'true'),
      'the application menu after the story',
    );
    const reload = requireFirst(
      findByAttribute(menu, 'data-dsl4-menu-action', 'reload'),
      'the story restart button',
    );
    assert.equal(reload.disabled, false, 'The embedded story must have run and enabled restart.');
    assert.equal(
      findByAttribute(shellBody(restoreGlobals), 'data-dsl4-source-chooser', 'true').length,
      0,
    );
  } finally {
    vm.quit();
    restoreGlobals();
  }
});

test('dispatches the packaged production scene-skip key into the next scene', async () => {
  const archive = await buildEmbeddedStoryRelease({navigationFixture: true});
  const restoreGlobals = installUnsandboxedScriptDom({withTitleUi: true});
  let editorKeydownCalls = 0;
  requireDefined(restoreGlobals.document, 'the title shell document').addEventListener(
    'keydown',
    (event) => {
      editorKeydownCalls += 1;
      event.preventDefault();
    },
  );
  const vm = new VirtualMachine();
  try {
    vm.setCompatibilityMode(false);
    vm.setTurboMode(false);
    vm.setCompilerOptions({enabled: false});
    vm.securityManager.canLoadExtensionFromProject = () => true;
    vm.securityManager.getSandboxMode = () => 'unsandboxed';
    await loadProjectQuietly(vm, archive);
    let nextSkinId = 1;
    let nextDrawableId = 1;
    for (const target of vm.runtime.targets) {
      target.drawableID = nextDrawableId;
      nextDrawableId += 1;
      for (const costume of target.sprite?.costumes ?? []) {
        costume.skinId = nextSkinId;
        nextSkinId += 1;
      }
    }
    vm.runtime.renderer = fakeRenderer();

    vm.greenFlag();
    const titleDeadline = Date.now() + 5_000;
    while (Date.now() < titleDeadline) {
      vm.runtime._step();
      if ((await extensionReporter(vm, 'statusReporter')) === 'title') break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'title');
    const storyStart = extensionReporter(vm, 'closeTitle');
    void storyStart.catch(() => {});
    const actor = vm.runtime.targets.find(
      (target: {getName(): string}) => target.getName() === 'Actor',
    );
    assert(actor, 'The packaged navigation fixture must contain Actor.');
    const actorDeadline = Date.now() + 5_000;
    while (Date.now() < actorDeadline && !actor.visible) {
      vm.runtime._step();
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(actor.visible, true, 'The opening scene must display Actor before navigation.');

    const sceneSkipEvent = requireDefined(
      restoreGlobals.document,
      'the title shell document',
    ).dispatchKey('ArrowDown');
    assert.equal(sceneSkipEvent.defaultPrevented, true);
    assert.equal(
      editorKeydownCalls,
      0,
      'The runtime must capture a bound key before the TurboWarp Editor bubble handler.',
    );
    const endingDeadline = Date.now() + 5_000;
    while (Date.now() < endingDeadline && (!actor.visible || actor.x !== 123)) {
      vm.runtime._step();
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.deepEqual(
      {visible: actor.visible, x: actor.x},
      {visible: true, x: 123},
      'ArrowDown must enter the ending scene and apply its first actor action.',
    );
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'running');
    vm.stopAll();
  } finally {
    vm.quit();
    restoreGlobals();
  }
});

test('returns an external-source story built from the minimal SB3 to the menu', async () => {
  await assertNaturallyFinishedStoryReturnsToMenu(await buildExternalSourceStoryRelease());
});

test('opens a selected .k4.yml project from the menu without adding Scratch targets', async () => {
  const result = await buildRelease();
  const restoreGlobals = installUnsandboxedScriptDom({withTitleUi: true});
  const source = createBrowserFile(
    'selected.k4.yml',
    new TextEncoder().encode(`kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  selected:
    - wait: 0.1
`),
  );
  const vm = new VirtualMachine();
  try {
    vm.setCompatibilityMode(false);
    vm.setTurboMode(false);
    vm.setCompilerOptions({enabled: false});
    vm.securityManager.canLoadExtensionFromProject = () => true;
    vm.securityManager.getSandboxMode = () => 'unsandboxed';
    await loadProjectQuietly(vm, result.archive);
    let nextSkinId = 1;
    for (const target of vm.runtime.targets) {
      target.drawableID = nextSkinId;
      for (const costume of target.sprite?.costumes ?? []) {
        costume.skinId = nextSkinId;
        nextSkinId += 1;
      }
    }
    vm.runtime.renderer = fakeRenderer();

    vm.greenFlag();
    const titleDeadline = Date.now() + 5_000;
    while (Date.now() < titleDeadline) {
      vm.runtime._step();
      if ((await extensionReporter(vm, 'statusReporter')) === 'title') break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await extensionReporter(vm, 'closeTitle');
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'menu');
    const applicationMenu = requireFirst(
      findByAttribute(shellBody(restoreGlobals), 'data-dsl4-application-menu', 'true'),
      'the queried element',
    );
    assert(applicationMenu, 'The application menu must be mounted above the Stage.');
    requireFirst(
      findByAttribute(applicationMenu, 'data-dsl4-menu-action', 'open'),
      'the queried element',
    ).click();
    const input = shellBody(restoreGlobals).children.find(
      (element: FakeElement) => element.tagName === 'INPUT' && element.type === 'file',
    );
    assert(input, 'Open must create a DSL 4.0 YAML file input.');
    assert.equal(input.multiple, false);
    assert.equal(input.webkitdirectory, undefined);
    assert.equal(input.getAttribute('webkitdirectory'), null);
    assert.equal(input.accept, '.yml,.yaml');
    input.files = [
      {
        ...source,
        webkitRelativePath: '',
      },
    ];
    input.dispatch('change');

    let sawSelectedStory = false;
    const storyDeadline = Date.now() + 5_000;
    while (Date.now() < storyDeadline) {
      vm.runtime._step();
      const status = await extensionReporter(vm, 'statusReporter');
      if (status === 'starting' || status === 'running') sawSelectedStory = true;
      if (sawSelectedStory && status === 'menu') break;
      if (status === 'error') {
        assert.fail(
          `Selected DSL 4.0 story failed: ${await extensionReporter(vm, 'lastErrorReporter')}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(sawSelectedStory, true);
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'menu');
    const reloadButton = requireFirst(
      findByAttribute(applicationMenu, 'data-dsl4-menu-action', 'reload'),
      'the queried element',
    );
    assert.equal(reloadButton.disabled, false);
    assert.equal(reloadButton.getAttribute('aria-disabled'), 'false');
    assert.deepEqual(
      vm.runtime.targets.map((target: {getName(): string}) => target.getName()),
      ['Stage'],
    );
  } finally {
    vm.quit();
    restoreGlobals();
  }
});

test(
  'watches and auto-reloads a project directory in the non-embedded release by default',
  {timeout: 20_000},
  async () => {
    const result = await buildCurrentRuntimeRelease();
    const restoreGlobals = installUnsandboxedScriptDom({withTitleUi: true});
    const previewDocument = requireDefined(restoreGlobals.document, 'the preview shell document');
    previewDocument.visibilityState = 'visible';
    const project = createMutablePreviewProject(`kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - wait: 60
`);
    let savedDistribution: Uint8Array | null = null;
    const saveFileHandle = {
      async createWritable(options: unknown) {
        assert.deepEqual(options, {keepExistingData: false});
        return {
          async write(bytes: ArrayLike<number>) {
            savedDistribution = new Uint8Array(bytes);
          },
          async close() {},
        };
      },
    };
    const restorePreviewGlobals = installPreviewBrowserGlobals(project.root, {saveFileHandle});
    const vm = new VirtualMachine();
    try {
      vm.setCompatibilityMode(false);
      vm.setTurboMode(false);
      vm.setCompilerOptions({enabled: false});
      vm.securityManager.canLoadExtensionFromProject = () => true;
      vm.securityManager.getSandboxMode = () => 'unsandboxed';
      await loadProjectQuietly(vm, result.archive);
      // Headless VM loading leaves native backdrop skins unallocated.
      let nextSkinId = 1;
      for (const target of vm.runtime.targets) {
        target.drawableID = nextSkinId++;
        for (const costume of target.sprite?.costumes ?? []) costume.skinId = nextSkinId++;
      }
      vm.runtime.renderer = fakeRenderer();
      vm.greenFlag();
      const titleDeadline = Date.now() + 5_000;
      while (Date.now() < titleDeadline) {
        vm.runtime._step();
        if ((await extensionReporter(vm, 'statusReporter')) === 'title') break;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      await extensionReporter(vm, 'closeTitle');
      assert.equal(await extensionReporter(vm, 'statusReporter'), 'menu');
      const applicationMenu = requireFirst(
        findByAttribute(shellBody(restoreGlobals), 'data-dsl4-application-menu', 'true'),
        'the queried element',
      );
      const previewHost = requireById(shellBody(restoreGlobals), 'dsl4-web-preview-shell');
      assert(
        previewHost,
        `The non-embedded release must mount the development preview host: ${shellBody(
          restoreGlobals,
        )
          .children.map(({id, tagName}) => `${tagName}#${id}`)
          .join(', ')}`,
      );
      assert.equal(previewHost.getAttribute('data-preview-presentation'), 'runtime');
      assert(findById(previewHost, 'dsl4-preview-reload-status-button'));
      requireFirst(
        findByAttribute(applicationMenu, 'data-dsl4-menu-action', 'open'),
        'the queried element',
      ).click();
      const chooser = requireFirst(
        findByAttribute(shellBody(restoreGlobals), 'data-dsl4-source-chooser', 'true'),
        'the queried element',
      );
      assert(chooser, 'Open must offer a story file or project directory.');
      requireFirst(
        findByAttribute(chooser, 'data-dsl4-source-choice', 'project'),
        'the queried element',
      ).click();
      assert.equal(
        shellBody(restoreGlobals).children.some(
          (element: FakeElement) => element.tagName === 'INPUT' && element.type === 'file',
        ),
        false,
        'A supported browser must use the watched directory picker instead of one-shot input.',
      );

      const runningDeadline = Date.now() + 5_000;
      while (Date.now() < runningDeadline) {
        vm.runtime._step();
        if ((await extensionReporter(vm, 'statusReporter')) === 'running') break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(
        await extensionReporter(vm, 'statusReporter'),
        'running',
        await extensionReporter(vm, 'runtimeDiagnosticsReporter'),
      );
      project.setSource(`kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - wait: 0.05
`);
      const buildMenuDeadline = Date.now() + 5_000;
      while (Date.now() < buildMenuDeadline) {
        vm.runtime._step();
        if ((await extensionReporter(vm, 'statusReporter')) === 'menu') break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(await extensionReporter(vm, 'statusReporter'), 'menu');
      const buildButton = requireFirst(
        findByAttribute(applicationMenu, 'data-dsl4-menu-action', 'build'),
        'the queried element',
      );
      assert.equal(buildButton.hidden, false);
      assert.equal(buildButton.disabled, false);
      buildButton.click();
      const buildDeadline = Date.now() + 7_000;
      while (Date.now() < buildDeadline) {
        vm.runtime._step();
        if (savedDistribution && (await extensionReporter(vm, 'statusReporter')) === 'menu') {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert(savedDistribution, await extensionReporter(vm, 'lastErrorReporter'));
      const distributionArchive = unzipSync(savedDistribution);
      const distributionProject = projectOf(
        JSON.parse(strFromU8(entryOf(distributionArchive, 'project.json'))),
      );
      const distributionStage = stageOf(distributionProject);
      assert.deepEqual(
        Object.values(requireRecord(distributionStage.variables, 'the stage variables'))
          .map((variable) => requireArray(variable, 'a stage variable')[0])
          .map((name) => requireString(name, 'a variable name'))
          .filter((name) => ['ポーズ認識', 'チャージ'].includes(name))
          .sort(),
        ['チャージ', 'ポーズ認識'],
      );
      assert.equal(
        requireRecord(componentStorageOf(distributionProject).application, 'the application entry')
          .mode,
        'story',
      );
      const verifiedDistribution = await loadDsl4RuntimeComponent(distributionProject, frontend, {
        ...storyComponentLimits,
        subtleCrypto: webcrypto.subtle,
      });
      assert.equal(verifiedDistribution.ok, true, JSON.stringify(verifiedDistribution.diagnostics));
      project.setSource(`kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - wait: 60
`);
      const sourceRefreshDeadline = Date.now() + 2_000;
      while (Date.now() < sourceRefreshDeadline) {
        vm.runtime._step();
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      requireFirst(
        findByAttribute(applicationMenu, 'data-dsl4-menu-action', 'reload'),
        'the queried element',
      ).click();
      const restartedDeadline = Date.now() + 5_000;
      while (Date.now() < restartedDeadline) {
        vm.runtime._step();
        if ((await extensionReporter(vm, 'statusReporter')) === 'running') break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(await extensionReporter(vm, 'statusReporter'), 'running');
      const stage = vm.runtime.getTargetForStage();
      const droppedBackdrop = {
        ...stage.sprite.costumes.find(({name}: {name: string}) => name === 'Menu'),
        name: 'DroppedBackdrop',
        assetId: 'dropped-backdrop',
        skinId: 1001,
      };
      stage.sprite.costumes.push(droppedBackdrop);
      stage.sprite.sounds.push({
        name: 'DroppedSound',
        soundId: 1002,
        assetId: 'dropped-sound',
        dataFormat: 'wav',
        rate: 48_000,
        sampleCount: 1,
      });
      stage.sprite.soundBank = {
        playSound: async () => {},
        stop() {},
        stopAllSounds() {},
      };
      project.setSource(`kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
assets:
  DroppedBackdrop:
    kind: backdrop
    name: DroppedBackdrop
  DroppedSound:
    kind: sound
    name: DroppedSound
scenes:
  opening:
    - wait: 30
`);

      const reloadButton = requireById(previewHost, 'dsl4-preview-reload-status-button');
      const reloadDeadline = Date.now() + 7_000;
      while (Date.now() < reloadDeadline) {
        vm.runtime._step();
        if (reloadButton.getAttribute('data-reload-state') === 'reloaded') break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(
        reloadButton.getAttribute('data-reload-state'),
        'reloaded',
        findById(previewHost, 'dsl4-web-preview-diagnostic')?.textContent ?? 'no diagnostic',
      );
      assert.equal(requireById(previewHost, 'dsl4-preview-reload-dialog').hidden, true);
      assert.equal(
        await extensionReporter(vm, 'statusReporter'),
        'running',
        `${await extensionReporter(vm, 'runtimeDiagnosticsReporter')} ${JSON.stringify(
          stage.sprite.costumes.map(({name, skinId}: {name: string; skinId: number}) => ({
            name,
            skinId,
          })),
        )}`,
      );
      assert.equal(stage.sprite.costumes.includes(droppedBackdrop), true);
      assert.equal(
        stage.sprite.sounds.some(({name}: {name: string}) => name === 'DroppedSound'),
        true,
        'TurboWarp-owned sounds must remain in the project after a source reload.',
      );
      vm.quit();
      await assertFreshBrowserBuiltStoryRuns(savedDistribution);
    } finally {
      vm.quit();
      restorePreviewGlobals();
      restoreGlobals();
    }
  },
);

test(
  'watches a story file selected from the non-embedded Open chooser',
  {timeout: 20_000},
  async () => {
    const result = await buildCurrentRuntimeRelease();
    const restoreGlobals = installUnsandboxedScriptDom({withTitleUi: true});
    const previewDocument = requireDefined(restoreGlobals.document, 'the preview shell document');
    previewDocument.visibilityState = 'visible';
    let source = `kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - wait: 60
`;
    const sourceHandle: BrowserFileHandle & {queryPermission(): Promise<string>} = {
      kind: 'file',
      name: 'story.kamishibai.yaml',
      async queryPermission() {
        return 'granted';
      },
      async getFile() {
        const bytes = new TextEncoder().encode(source);
        return {
          name: this.name,
          size: bytes.byteLength,
          async arrayBuffer() {
            return bytes.slice().buffer;
          },
        };
      },
    };
    const restorePreviewGlobals = installPreviewBrowserGlobals(
      {kind: 'directory'},
      {storyFileHandle: sourceHandle},
    );
    const vm = new VirtualMachine();
    try {
      vm.setCompatibilityMode(false);
      vm.setTurboMode(false);
      vm.setCompilerOptions({enabled: false});
      vm.securityManager.canLoadExtensionFromProject = () => true;
      vm.securityManager.getSandboxMode = () => 'unsandboxed';
      await loadProjectQuietly(vm, result.archive);
      // Headless VM loading leaves native backdrop skins unallocated.
      let nextSkinId = 1;
      for (const target of vm.runtime.targets) {
        target.drawableID = nextSkinId++;
        for (const costume of target.sprite?.costumes ?? []) costume.skinId = nextSkinId++;
      }
      vm.runtime.renderer = fakeRenderer();

      vm.greenFlag();
      const titleDeadline = Date.now() + 5_000;
      while (Date.now() < titleDeadline) {
        vm.runtime._step();
        if ((await extensionReporter(vm, 'statusReporter')) === 'title') break;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      await extensionReporter(vm, 'closeTitle');
      const applicationMenu = requireFirst(
        findByAttribute(shellBody(restoreGlobals), 'data-dsl4-application-menu', 'true'),
        'the queried element',
      );
      requireFirst(
        findByAttribute(applicationMenu, 'data-dsl4-menu-action', 'open'),
        'the queried element',
      ).click();
      const chooser = requireFirst(
        findByAttribute(shellBody(restoreGlobals), 'data-dsl4-source-chooser', 'true'),
        'the queried element',
      );
      requireFirst(
        findByAttribute(chooser, 'data-dsl4-source-choice', 'file'),
        'the queried element',
      ).click();

      const runningDeadline = Date.now() + 5_000;
      while (Date.now() < runningDeadline) {
        vm.runtime._step();
        if ((await extensionReporter(vm, 'statusReporter')) === 'running') break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(await extensionReporter(vm, 'statusReporter'), 'running');
      source = source.replace('wait: 60', 'wait: 30');
      const previewHost = requireById(shellBody(restoreGlobals), 'dsl4-web-preview-shell');
      const reloadButton = requireById(previewHost, 'dsl4-preview-reload-status-button');
      const reloadDeadline = Date.now() + 7_000;
      while (Date.now() < reloadDeadline) {
        vm.runtime._step();
        if (reloadButton.getAttribute('data-reload-state') === 'reloaded') break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(reloadButton.getAttribute('data-reload-state'), 'reloaded');
      assert.equal(await extensionReporter(vm, 'statusReporter'), 'running');
    } finally {
      vm.quit();
      restorePreviewGlobals();
      restoreGlobals();
    }
  },
);

test('localizes the Stage title using the host language ahead of the browser language', async () => {
  const result = await buildRelease();
  const restoreGlobals = installUnsandboxedScriptDom({withTitleUi: true});
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {language: 'en-US', languages: ['en-US']},
  });
  const vm = new VirtualMachine();
  const previousLocale = vm.getLocale();
  try {
    vm.setLocale('ja-JP', {});
    vm.setCompatibilityMode(false);
    vm.setTurboMode(false);
    vm.setCompilerOptions({enabled: false});
    vm.securityManager.canLoadExtensionFromProject = () => true;
    vm.securityManager.getSandboxMode = () => 'unsandboxed';
    await loadProjectQuietly(vm, result.archive);
    const stage = vm.runtime.getTargetForStage();
    assert.equal(stage.sprite.costumes[stage.currentCostume].name, 'Title');
    vm.runtime.renderer = fakeRenderer();

    vm.greenFlag();
    const titleDeadline = Date.now() + 5_000;
    while (Date.now() < titleDeadline) {
      vm.runtime._step();
      if ((await extensionReporter(vm, 'statusReporter')) === 'title') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'title');
    assert.equal(stage.sprite.costumes[stage.currentCostume].name, 'TitleRuntime');
    const titleControls = requireFirst(
      findByAttribute(shellBody(restoreGlobals), 'data-dsl4-title-controls', 'true'),
      'the queried element',
    );
    assert(titleControls, 'Localized title controls must be mounted above the Stage.');
    assert.equal(titleControls.style.display, 'block');
    const website = requireFirst(
      findByAttribute(titleControls, 'data-dsl4-title-action', 'website'),
      'the queried element',
    );
    const close = requireFirst(
      findByAttribute(titleControls, 'data-dsl4-title-action', 'close'),
      'the queried element',
    );
    assert.equal(website.getAttribute('aria-label'), '公式Webサイト');
    assert.equal(
      requireString(website.style.cssText, 'its inline style').includes('top:25.5556%'),
      true,
    );
    const websiteIcon = requireDefined(website.children[0], 'its icon');
    const websiteLabel = requireDefined(website.children[1], 'its label');
    assert.equal(websiteIcon.tagName, 'SPAN');
    assert.match(
      requireString(websiteIcon.style.backgroundImage, 'its icon image'),
      /^url\("data:image\/png;base64,/u,
    );
    assert.match(
      requireString(websiteIcon.style.cssText, 'its inline style'),
      /width:10cqw;height:10cqw/u,
    );
    assert.match(
      requireString(websiteLabel.style.cssText, 'its inline style'),
      /font-size:2\.5cqw/u,
    );
    assert.doesNotMatch(requireString(websiteIcon.style.cssText, 'its inline style'), /clamp|px/u);
    assert.doesNotMatch(requireString(websiteLabel.style.cssText, 'its inline style'), /clamp|px/u);
    assert.equal(close.getAttribute('aria-label'), '閉じる');
    assert.equal(
      findByAttribute(shellBody(restoreGlobals), 'data-dsl4-title-shell', 'true').length,
      0,
    );
    assert.equal(shellBody(restoreGlobals).style.cursor, 'pointer');

    await extensionReporter(vm, 'closeTitle');
    const startupDeadline = Date.now() + 5_000;
    while (Date.now() < startupDeadline) {
      vm.runtime._step();
      const status = await extensionReporter(vm, 'statusReporter');
      if (status === 'menu') break;
      if (status === 'error') {
        assert.fail(`DSL 4.0 runtime failed: ${await extensionReporter(vm, 'lastErrorReporter')}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'menu');
    assert.equal(stage.sprite.costumes[stage.currentCostume].name, 'MenuRuntime');
    assert.equal(titleControls.style.display, 'none');
    assert.equal(shellBody(restoreGlobals).style.cursor, 'pointer');
  } finally {
    await vm.setLocale(previousLocale, {});
    vm.quit();
    restoreGlobals();
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});

test('logs and renders a pre-title Standard initialization failure', async () => {
  const result = await buildRelease();
  const restoreGlobals = installUnsandboxedScriptDom({withTitleUi: true});
  const originalConsoleError = console.error;
  const consoleErrors: unknown[][] = [];
  const vm = new VirtualMachine();
  let originalToJSON;
  try {
    vm.setCompatibilityMode(false);
    vm.setTurboMode(false);
    vm.setCompilerOptions({enabled: false});
    vm.securityManager.canLoadExtensionFromProject = () => true;
    vm.securityManager.getSandboxMode = () => 'unsandboxed';
    await loadProjectQuietly(vm, result.archive);
    originalToJSON = vm.toJSON.bind(vm);
    let serializationCalls = 0;
    vm.toJSON = () => {
      serializationCalls += 1;
      return '{';
    };
    console.error = (...args) => consoleErrors.push(args);
    vm.runtime.renderer = fakeRenderer();

    await extensionReporter(vm, 'showTitle');
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'error');
    const lastError = await extensionReporter(vm, 'lastErrorReporter');
    assert.equal(typeof lastError, 'string');
    assert.notEqual(lastError, '');
    const errorRoot = requireFirst(
      findByAttribute(shellBody(restoreGlobals), 'data-dsl4-runtime-error', 'true'),
      'the queried element',
    );
    assert(errorRoot, 'The pre-title failure must be rendered inside the Scratch stage.');
    assert.equal(errorRoot.style.display, 'flex');
    const callsBeforeReturn = serializationCalls;
    requireFirst(
      findByAttribute(errorRoot, 'data-dsl4-runtime-error-action', 'menu'),
      'the return action',
    ).click();
    await Promise.resolve();
    assert.equal(await extensionReporter(vm, 'statusReporter'), 'menu');
    assert.equal(
      serializationCalls,
      callsBeforeReturn,
      'returning must not parse the broken project again',
    );
    assert.equal(errorRoot.parentNode, null);
    const initializationLog = consoleErrors.find(
      ([message]) => message === '[Kamishibai DSL 4.0] initialization failed.',
    );
    assert(initializationLog, 'The pre-title failure must be written to console.error.');
    const initializationCause = initializationLog[1];
    assert(initializationCause instanceof Error);
    assert.equal(typeof initializationCause.stack, 'string');
    assert.match(
      requireString(initializationCause.stack, 'the failure stack'),
      /JSON|Expected property|Unexpected/iu,
    );
  } finally {
    if (originalToJSON) vm.toJSON = originalToJSON;
    vm.quit();
    console.error = originalConsoleError;
    restoreGlobals();
  }
});

test('keeps both explicit narrative runtime bundles deterministic and capability marked', async () => {
  for (const profile of ['authoring', 'playback'] as const) {
    const generated = await createDsl4RuntimeBundleSource({profile, narrativeControlEnabled: true});
    const checkedIn = await readFile(
      new URL(
        `../src/builder/generated/dsl4-narrative-${profile}-runtime-extension.js`,
        import.meta.url,
      ),
    );
    assert.equal(generated.equals(checkedIn), true, `Regenerate the ${profile} narrative bundle`);
    assert(generated.includes('// Kamishibai capabilities: narrative-control-v1'));
    assert(generated.toString().startsWith('// Name: Kamishibai DSL 4.0 Runtime'));
  }
});

test('Standard runtime enables narrative controls while an explicit disabled build omits its capability', async () => {
  const enabled = await createDsl4RuntimeExtensionSource({profile: 'playback'});
  const disabled = await createDsl4RuntimeExtensionSource({
    profile: 'playback',
    narrativeControlEnabled: false,
  });
  const marker = '// Kamishibai capabilities: narrative-control-v1';
  assert(enabled.includes(marker));
  assert(!disabled.includes(marker));
  const standard = await createDsl4RuntimeBundleSource({profile: 'playback'});
  const checkedIn = await readFile(
    new URL('../src/builder/generated/dsl4-playback-runtime-extension.js', import.meta.url),
  );
  assert(standard.equals(checkedIn));
});
