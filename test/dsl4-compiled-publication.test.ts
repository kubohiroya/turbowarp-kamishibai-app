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
      port: {gotoSegment(payload: Result, context: unknown): Promise<Result>};
    }[],
);
// The chapter runtime itself is covered by the component loader tests; this file is about which
// chapter bytes a compiled publication reads and how it decodes them.
vi.mock('../src/dsl4/platform/turbowarp-runtime-host.js', () => ({
  async createDsl4TurboWarpRuntimeHost(options: {
    publicationSegmentId: string;
    createHostPort(context: unknown): Promise<(typeof hosts)[number]['port']>;
  }) {
    const state = {
      id: options.publicationSegmentId,
      disposed: false,
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
const commentMarker = 'chapter-note-5c1e';
const sources: Record<string, string> = {
  a: `kamishibai: '4.0'\n# ${commentMarker}\ncontrols:\n  keymaps:\n    production:\n      Space: navigation.nextAction\nscenes:\n  first:\n    - wait: 60\n    - gotoSegment: b\n`,
  b: `kamishibai: '4.0'\n# ${commentMarker}\ncontrols:\n  keymaps:\n    production:\n      Space: navigation.nextAction\nscenes:\n  second:\n    - wait: 30\n`,
};
const entryOf = (id: string) => `chapters/${id}-draft.k4.yml`;
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
        entry: entryOf(id),
        size: new TextEncoder().encode(sources[id]!).length,
        integrity: 'sha256-' + createHash('sha256').update(sources[id]!).digest('hex'),
      },
    })),
  };
  const built = await buildDsl4BrowserSelectedStoryProject({
    project: {targets: [], extensionStorage: {}},
    entries: [
      file('book/publication.json', JSON.stringify(manifest)),
      ...['a', 'b'].map((id) => file(`book/${entryOf(id)}`, sources[id]!)),
    ],
    sourceFrontend,
    ...limits,
  });
  return built.project as Record<string, unknown>;
}

async function compiledSb3() {
  const project = await sourcePublication();
  const before = JSON.stringify(project);
  const artifact = await createDsl4PublicationDistributionSb3({
    project,
    projectFiles: {'project.json': '{}'},
    sourceFrontend,
    distributionProfile: 'compiled',
    ...limits,
  });
  // The open project keeps its YAML; only the saved copy is compiled.
  assert.equal(JSON.stringify(project), before);
  const entries = unzipSync(artifact.bytes);
  return {
    entries,
    project: JSON.parse(strFromU8(entries['project.json']!)) as Record<string, unknown>,
  };
}

test('saves a compiled publication with no chapter YAML, comments, or source paths', async () => {
  const {entries, project} = await compiledSb3();
  const text = Object.values(entries)
    .map((entry) => strFromU8(entry, true))
    .join('\n');
  for (const leak of [commentMarker, 'draft.k4.yml', 'chapters/', 'kamishibai: ', '"sourceMap"']) {
    assert.equal(text.includes(leak), false, `compiled publication leaks ${leak}`);
  }
  const publication = requireRecord(readDsl4ProjectPublication(project), 'publication');
  assert.equal(publication.profile, 'compiled');
  assert.equal(publication.sources, undefined);
  const validated = validateDsl4ProjectPublication(publication, sourceFrontend);
  assert.deepEqual(
    validated.manifest.segments.map((segment) => [segment.id, segment.source.entry, segment.next]),
    [
      ['a', 'story/a.json', ['b']],
      ['b', 'story/b.json', []],
    ],
  );
  for (const id of ['a', 'b']) {
    const component = requireRecord(validated.components[id], 'component');
    assert.equal(component.source, undefined);
    const loaded = requireRecord(
      await loadDsl4RuntimeComponent(
        publicationSegmentProject(project, component, validated.assetFiles),
        sourceFrontend,
        limits,
      ),
      'loaded chapter',
    );
    assert.equal(loaded.ok, true);
    assert.equal(loaded.distributionProfile, 'compiled');
  }
});

test('re-saves a compiled publication as compiled and refuses to restore its sources', async () => {
  const {project} = await compiledSb3();
  const again = await createDsl4PublicationDistributionSb3({
    project,
    projectFiles: {'project.json': '{}'},
    sourceFrontend,
    ...limits,
  });
  const restored = JSON.parse(strFromU8(unzipSync(again.bytes)['project.json']!));
  assert.equal(
    requireRecord(readDsl4ProjectPublication(restored), 'publication').profile,
    'compiled',
  );
  await assert.rejects(
    createDsl4PublicationDistributionSb3({
      project,
      projectFiles: {'project.json': '{}'},
      sourceFrontend,
      distributionProfile: 'source',
      ...limits,
    }),
    /compiled publication cannot be saved as source/,
  );
});

test('a compiled publication fails closed on kept YAML, foreign entries, and tampered chapters', async () => {
  const {project} = await compiledSb3();
  const publication = () =>
    structuredClone(requireRecord(readDsl4ProjectPublication(project), 'publication'));

  const withSources = publication();
  withSources.sources = {'story/a.json': sources.a};
  assert.throws(
    () => validateDsl4ProjectPublication(withSources, sourceFrontend),
    /chapter sources/,
  );

  const renamed = publication();
  const manifest = requireRecord(renamed.manifest, 'manifest');
  const [first] = manifest.segments as {source: {entry: string}}[];
  first!.source.entry = entryOf('a');
  assert.throws(() => validateDsl4ProjectPublication(renamed, sourceFrontend), /own Story IR/);

  // A chapter whose IR changed no longer matches the digest the manifest names for it.
  const tampered = structuredClone(project);
  const tamperedPublication = requireRecord(readDsl4ProjectPublication(tampered), 'publication');
  const component = requireRecord(
    requireRecord(tamperedPublication.components, 'components').b,
    'component',
  );
  const story = requireRecord(requireRecord(component.compiled, 'compiled').story, 'story');
  story.variables = {injected: {initial: 1}};
  await assert.rejects(
    createDsl4PublicationDistributionSb3({
      project: tampered,
      projectFiles: {'project.json': '{}'},
      sourceFrontend,
      ...limits,
    }),
    /Segment (size|integrity) mismatch/,
  );
});

test('the publication host reads compiled chapters without YAML and follows their links', async () => {
  hosts.length = 0;
  const {project} = await compiledSb3();
  const document = createFakeDocument();
  const refusingFrontend = {
    parse() {
      throw new Error('a compiled publication must not parse YAML');
    },
  };
  const result = await createDsl4PublicationRuntimeHost({
    project,
    sourceFrontend: refusingFrontend,
    document: document as unknown as Document,
    publicationMount: document.body as unknown as HTMLElement,
    async createPublicationStage(_candidate: unknown, _signal: unknown, stageMount?: HTMLElement) {
      const element = document.createElement('section');
      stageMount!.appendChild(element as unknown as HTMLElement);
      return {runtime: {}, element: element as unknown as HTMLElement, dispose() {}};
    },
  } as unknown as Parameters<typeof createDsl4PublicationRuntimeHost>[0]);
  const owner = requireRecord(result.host, 'publication host') as unknown as {
    attach(target: unknown): void;
    start(): Promise<unknown>;
    getPublicationState(): {segmentId: string};
    dispose(): Promise<void>;
  };
  owner.attach(document);
  const run = owner.start();
  assert.equal(owner.getPublicationState().segmentId, 'a');
  const active = hosts.find((host) => !host.disposed)!;
  assert.deepEqual(await active.port.gotoSegment({segment: 'b'}, {}), {outcome: 'committed'});
  assert.equal(owner.getPublicationState().segmentId, 'b');
  await owner.dispose();
  assert.deepEqual(await run, {status: 'stopped'});
});

test('the publication host offers the compiled save only while the chapters still have YAML', async () => {
  const saved: unknown[] = [];
  async function open(project: Record<string, unknown>) {
    const document = createFakeDocument();
    const result = await createDsl4PublicationRuntimeHost({
      project,
      sourceFrontend,
      document: document as unknown as Document,
      publicationMount: document.body as unknown as HTMLElement,
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
    return {host: result.host as unknown as {dispose(): Promise<void>}, buttons};
  }

  const source = await open(await sourcePublication());
  const [plain, compiled] = source.buttons;
  assert.equal(compiled!.hidden, false);
  compiled!.click();
  plain!.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(saved, [{distributionProfile: 'compiled'}, null]);
  await source.host.dispose();

  const reopened = await open((await compiledSb3()).project);
  assert.equal(reopened.buttons[1]!.hidden, true);
  await reopened.host.dispose();
});
