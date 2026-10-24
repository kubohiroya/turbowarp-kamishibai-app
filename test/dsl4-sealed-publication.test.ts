import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {strFromU8, unzipSync} from 'fflate';
import {test, vi} from 'vitest';

import {createFakeDocument} from './helpers/fake-dom.ts';
import {dsl4TestProductionSourceFrontend as sourceFrontend} from './helpers/dsl4-test-frontend.ts';
import {requireRecord} from './helpers/require-value.ts';

type Result = Readonly<Record<string, unknown>>;
const hosts = vi.hoisted(
  () =>
    [] as {
      id: string;
      disposed: boolean;
      sealedKeyCache: unknown;
      port: {gotoSegment(payload: Result, context: unknown): Promise<Result>};
    }[],
);
// The chapter runtime is covered by the component loader tests; this file is about how a sealed
// publication reads, decrypts, and saves its chapters.
vi.mock('../src/dsl4/platform/turbowarp-runtime-host.js', () => ({
  async createDsl4TurboWarpRuntimeHost(options: {
    publicationSegmentId: string;
    sealedKeyCache?: unknown;
    createHostPort(context: unknown): Promise<(typeof hosts)[number]['port']>;
  }) {
    const state = {
      id: options.publicationSegmentId,
      disposed: false,
      sealedKeyCache: options.sealedKeyCache,
      port: await options.createHostPort({}),
    };
    hosts.push(state);
    return {
      ok: true,
      enabled: true,
      diagnostics: [],
      host: {
        async preparePublicationScene() {},
        start: () => new Promise(() => {}),
        stop() {},
        attach() {},
        detach() {},
        attachStagePointer() {},
        detachStagePointer() {},
        async dispose() {
          state.disposed = true;
        },
        getState: () => ({runtime: {variables: {}}}),
        getAssetGroupSnapshot: () => ({id: state.id}),
      },
    };
  },
}));

import {buildDsl4BrowserSelectedStoryProject} from '../src/dsl4/platform/browser-story-file-loader.js';
import {createDsl4PublicationDistributionSb3} from '../src/dsl4/platform/publication-distribution.js';
import {
  publicationSegmentProject,
  readDsl4ProjectPublication,
  validateDsl4PublicationProject,
  validateDsl4ProjectPublication,
} from '../src/dsl4/platform/publication-project.js';
import {createDsl4PublicationRuntimeHost} from '../src/dsl4/platform/publication-runtime-host.js';
import {loadDsl4RuntimeComponent} from '../src/dsl4/runtime-artifact-loader.js';

const limits = {
  maxSourceBytes: 16384,
  maxAssetFiles: 8,
  maxAssetFileBytes: 16384,
  maxTotalAssetBytes: 32768,
};
const password = 'chapter password';
const iterations = 100_000;
const lineMarker = 'sealed-chapter-3d8a';
const assetMarker = 'sealed-chapter-asset-71f0';
const chapter = (id: string, next: string) => `kamishibai: '4.0'
assets:
  Picture:
    kind: backdrop
    file: art/picture.svg
variables:
  ${lineMarker}_${id}: 0
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  scene_${id}:
    - stage: Picture
    - wait: 30
${next ? `    - gotoSegment: ${next}\n` : ''}`;
const sources: Record<string, string> = {a: chapter('a', 'b'), b: chapter('b', '')};
const svg = `<svg xmlns="http://www.w3.org/2000/svg"><title>${assetMarker}</title></svg>`;
const file = (path: string, text: string) => {
  const bytes = new TextEncoder().encode(text);
  return {
    path,
    file: {
      name: path.split('/').at(-1)!,
      size: bytes.length,
      arrayBuffer: async () => bytes.buffer,
    },
  };
};

async function sourcePublication() {
  const manifest = {
    formatVersion: 1,
    id: 'book',
    title: 'Book',
    entrySegment: 'a',
    entryPoints: ['a'],
    segments: ['a', 'b'].map((id, index) => ({
      id,
      title: id,
      next: index === 0 ? ['b'] : [],
      source: {
        entry: `chapters/${id}.k4.yml`,
        size: new TextEncoder().encode(sources[id]!).length,
        integrity: 'sha256-' + createHash('sha256').update(sources[id]!).digest('hex'),
      },
    })),
  };
  const built = await buildDsl4BrowserSelectedStoryProject({
    project: {targets: [], extensionStorage: {}},
    entries: [
      file('book/publication.json', JSON.stringify(manifest)),
      ...['a', 'b'].map((id) => file(`book/chapters/${id}.k4.yml`, sources[id]!)),
      file('book/chapters/art/picture.svg', svg),
    ],
    sourceFrontend,
    ...limits,
  });
  return built.project as Record<string, unknown>;
}

async function sealedSb3() {
  const project = await sourcePublication();
  const before = JSON.stringify(project);
  const artifact = await createDsl4PublicationDistributionSb3({
    project,
    projectFiles: {'project.json': '{}'},
    sourceFrontend,
    distributionProfile: 'sealed',
    sealedPassword: password,
    sealedIterations: iterations,
    ...limits,
  });
  // The open project keeps its YAML; only the saved copy is sealed.
  assert.equal(JSON.stringify(project), before);
  const entries = unzipSync(artifact.bytes);
  return {
    entries,
    project: JSON.parse(strFromU8(entries['project.json']!)) as Record<string, unknown>,
  };
}

test('saves a sealed publication with no chapter text, assets, or paths in the clear', async () => {
  const {entries, project} = await sealedSb3();
  const text = Object.values(entries)
    .map((entry) => strFromU8(entry, true))
    .join('\n');
  for (const leak of [lineMarker, assetMarker, 'picture.svg', 'chapters/', 'kamishibai: ']) {
    assert.equal(text.includes(leak), false, `sealed publication leaks ${leak}`);
  }
  const publication = requireRecord(readDsl4ProjectPublication(project), 'publication');
  assert.equal(publication.profile, 'sealed');
  assert.deepEqual(publication.assetFiles, {});
  const validated = validateDsl4PublicationProject(project, sourceFrontend);
  assert.equal(validated.profile, 'sealed');
  for (const id of ['a', 'b']) {
    const loaded = requireRecord(
      await loadDsl4RuntimeComponent(
        publicationSegmentProject(project, validated.components[id], validated.assetFiles),
        sourceFrontend,
        {...limits, unlockSealedStory: () => password},
      ),
      'chapter',
    );
    assert.equal(loaded.ok, true);
    assert.equal(loaded.distributionProfile, 'sealed');
    const getAssetFile = loaded.getAssetFile as (asset: string, path: string) => Uint8Array;
    assert.equal(new TextDecoder().decode(getAssetFile('Picture', 'picture.svg')), svg);
  }
});

test('re-saves a sealed publication only with its password, and never as compiled', async () => {
  const {project} = await sealedSb3();
  const save = (extra: Record<string, unknown>) =>
    createDsl4PublicationDistributionSb3({
      project,
      projectFiles: {'project.json': '{}'},
      sourceFrontend,
      ...limits,
      ...extra,
    });
  await assert.rejects(save({}), /needs its password/);
  await assert.rejects(save({unlockSealedStory: () => 'wrong'}), /did not open|changed/);
  const again = await save({unlockSealedStory: () => password});
  const restored = JSON.parse(strFromU8(unzipSync(again.bytes)['project.json']!));
  assert.equal(requireRecord(readDsl4ProjectPublication(restored), 'p').profile, 'sealed');
  await assert.rejects(
    save({distributionProfile: 'compiled', unlockSealedStory: () => password}),
    /sealed publication cannot be saved as compiled/,
  );
});

test('a sealed publication fails closed on readable leftovers and mixed passwords', async () => {
  const {project} = await sealedSb3();
  const publication = () =>
    structuredClone(requireRecord(readDsl4ProjectPublication(project), 'publication'));
  const withSources = publication();
  withSources.sources = {};
  assert.throws(() => validateDsl4ProjectPublication(withSources, sourceFrontend), /sources/);

  const withAssets = publication();
  withAssets.assetFiles = {[`sha256-${'A'.repeat(43)}=`]: 'AAAA'};
  assert.throws(
    () => validateDsl4ProjectPublication(withAssets, sourceFrontend),
    // Refused either way: an asset no sealed chapter references, or any readable asset at all.
    /unreferenced file|share readable asset files/,
  );

  const mixed = publication();
  const components = requireRecord(mixed.components, 'components');
  const sealedB = requireRecord(requireRecord(components.b, 'b').sealed, 'sealed');
  requireRecord(sealedB.keyDerivation, 'kdf').salt = 'A'.repeat(22) + '==';
  assert.throws(() => validateDsl4ProjectPublication(mixed, sourceFrontend), /one password/);

  const leftover = publication();
  requireRecord(requireRecord(leftover.components, 'c').a, 'a').compiled = {};
  assert.throws(() => validateDsl4ProjectPublication(leftover, sourceFrontend), /compiled/);
});

test('the publication host decrypts each chapter with one key cache and follows its links', async () => {
  hosts.length = 0;
  const {project} = await sealedSb3();
  const document = createFakeDocument();
  const asked: unknown[] = [];
  const open = (unlock?: (request: unknown) => string | null) =>
    createDsl4PublicationRuntimeHost({
      project,
      sourceFrontend,
      document: document as unknown as Document,
      publicationMount: document.body as unknown as HTMLElement,
      ...(unlock ? {unlockSealedStory: unlock} : {}),
      async createPublicationStage(
        _candidate: unknown,
        _signal: unknown,
        stageMount?: HTMLElement,
      ) {
        const element = document.createElement('section');
        stageMount!.appendChild(element as unknown as HTMLElement);
        return {runtime: {}, element: element as unknown as HTMLElement, dispose() {}};
      },
    } as unknown as Parameters<typeof createDsl4PublicationRuntimeHost>[0]);

  const result = await open((request) => {
    asked.push(request);
    return password;
  });
  const owner = requireRecord(result.host, 'publication host') as unknown as {
    attach(target: unknown): void;
    start(): Promise<unknown>;
    getPublicationState(): {segmentId: string};
    dispose(): Promise<void>;
  };
  owner.attach(document);
  void owner.start();
  assert.equal(owner.getPublicationState().segmentId, 'a');
  const active = hosts.find((host) => !host.disposed)!;
  assert.notEqual(
    active.sealedKeyCache,
    undefined,
    'chapter hosts share the publication key cache',
  );
  assert.deepEqual(await active.port.gotoSegment({segment: 'b'}, {}), {outcome: 'committed'});
  assert.equal(owner.getPublicationState().segmentId, 'b');
  assert.equal(hosts[0]!.sealedKeyCache, hosts.at(-1)!.sealedKeyCache);
  assert.ok(asked.length >= 1);
  await owner.dispose();

  await assert.rejects(open(), /needs a password/);
  await assert.rejects(
    open(() => null),
    /no password was given/,
  );
});

test('offers sealing only for a publication that is not sealed yet', async () => {
  async function buttonsOf(project: Record<string, unknown>) {
    const document = createFakeDocument();
    const saved: unknown[] = [];
    const result = await createDsl4PublicationRuntimeHost({
      project,
      sourceFrontend,
      document: document as unknown as Document,
      publicationMount: document.body as unknown as HTMLElement,
      unlockSealedStory: () => password,
      downloadPublication(options?: unknown) {
        saved.push(options ?? null);
      },
      async createPublicationStage(
        _candidate: unknown,
        _signal: unknown,
        stageMount?: HTMLElement,
      ) {
        const element = document.createElement('section');
        stageMount!.appendChild(element as unknown as HTMLElement);
        return {runtime: {}, element: element as unknown as HTMLElement, dispose() {}};
      },
    } as unknown as Parameters<typeof createDsl4PublicationRuntimeHost>[0]);
    const buttons = document.body.children
      .flatMap((child) => child.children)
      .flatMap((child) => child.children)
      .filter((child) => child.tagName === 'BUTTON');
    await (result.host as unknown as {dispose(): Promise<void>}).dispose();
    return {buttons, saved};
  }
  const source = await buttonsOf(await sourcePublication());
  assert.deepEqual(
    source.buttons.map((button) => button.hidden),
    [false, false, false],
  );
  source.buttons[2]!.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(source.saved, [{distributionProfile: 'sealed'}]);

  const sealed = await buttonsOf((await sealedSb3()).project);
  assert.deepEqual(
    sealed.buttons.map((button) => button.hidden),
    [false, true, true],
  );
});
