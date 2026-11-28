import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {strToU8, zipSync} from 'fflate';

import {buildDsl4RuntimeComponent, Dsl4BuildError} from '../src/builder/dsl4-build.js';
import {Sb3BuilderError} from '../src/builder/errors.js';
import {readSb3} from '../src/builder/sb3.js';
import {loadDsl4RuntimeComponent} from '../src/dsl4/runtime-artifact-loader.js';
import {createDsl4RuntimeStartup} from '../src/dsl4/runtime-startup.js';
import {createDsl4SourceFrontend} from '../src/dsl4/source-frontend.js';
import {requireArray, requireDefined, requireRecord} from './helpers/require-value.ts';
import {firstDiagnostic, okResult, requireSession} from './helpers/result-outcome.ts';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const schema = JSON.parse(
  await readFile(path.join(repositoryRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
);
const frontend = createDsl4SourceFrontend(schema);
const subtleCrypto = webcrypto.subtle;
const sourceManifest = Object.freeze({
  formatVersion: 1,
  mode: 'external',
  sourceId: 'main',
  path: 'story.k4.yml',
});
const rootSource = `
include: chapters/chapter1/scenario.k4.yml
kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - goto: chapter1
`;
const chapterSource = `
assets:
  ChapterBackground:
    kind: backdrop
    file: image/background.svg
scenes:
  chapter1:
    - stage: ChapterBackground
`;

function baseSb3() {
  const project = {
    targets: [
      {
        isStage: true,
        name: 'Stage',
        variables: {},
        lists: {},
        broadcasts: {},
        blocks: {},
      },
    ],
    monitors: [],
  };
  return Buffer.from(zipSync({'project.json': strToU8(`${JSON.stringify(project)}\n`)}));
}

type BuildOptions = Parameters<typeof buildDsl4RuntimeComponent>[0];

function buildOptions(projectRoot: string, extra: Record<string, unknown> = {}) {
  return {
    baseSb3Bytes: baseSb3(),
    projectRoot,
    sourceManifest,
    sourceFrontend: frontend,
    controlProfile: 'production',
    channel: 'unbundled',
    maxSourceBytes: 16 * 1024,
    maxSourceFiles: 8,
    maxTotalSourceBytes: 16 * 1024,
    maxIncludeDepth: 4,
    maxAssetFileBytes: 4096,
    maxAssetFiles: 10,
    maxTotalAssetBytes: 16 * 1024,
    subtleCrypto,
    ...extra,
    // The Node crypto and Buffer values the builder accepts at run time are declared through
    // narrower DOM types, so the options are named as what the builder takes.
  } as unknown as BuildOptions;
}

async function createIncludedProject() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsl4-source-include-build-'));
  const chapterDirectory = path.join(directory, 'chapters', 'chapter1');
  await mkdir(path.join(chapterDirectory, 'image'), {recursive: true});
  await writeFile(path.join(directory, 'story.k4.yml'), rootSource);
  await writeFile(path.join(chapterDirectory, 'scenario.k4.yml'), chapterSource);
  await writeFile(path.join(chapterDirectory, 'image', 'background.svg'), '<svg/>');
  return directory;
}

async function createCompactIncludedProject() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsl4-composed-source-limit-'));
  const entry =
    "include: chapter.k4.yml\nkamishibai: '4.0'\ncontrols: {keymaps: {production: {Space: navigation.nextAction}}}\nscenes: {opening: []}\n";
  const chapter = `scenes: {chapter: [${Array(10).fill('{wait: 0}').join(',')}]}\n`;
  await writeFile(path.join(directory, 'story.k4.yml'), entry);
  await writeFile(path.join(directory, 'chapter.k4.yml'), chapter);
  return {directory, entry, chapter};
}

/**
 * The built component members this suite asserts on.
 *
 * The builder declares its result as the union of a refusal and a component; these cases build a
 * valid project, so this reads the component half and names what it carries.
 */
interface BuiltComponent {
  sourceDescriptor: {sourceId: string; text: string; byteLength: number};
  storyDocument: {
    scenes: {id: string; actions: {sourceRange: unknown}[]}[];
    sourceOrigins: Record<string, {sourceId: string; range: unknown}>;
  };
  getAssetFile(assetId: string, file: string): Uint8Array;
}

function runtimeComponent(built: {runtimeComponent: unknown}): BuiltComponent {
  return okResult(
    built.runtimeComponent,
    'the built runtime component',
  ) as unknown as BuiltComponent;
}

/** Read one loaded component the case expects to carry a story document. */
function loadedComponent(result: unknown): BuiltComponent {
  return okResult(result, 'the loaded runtime component') as unknown as BuiltComponent;
}

test('builds a self-contained component with declaring-source-relative assets', async () => {
  const directory = await createIncludedProject();
  try {
    const built = await buildDsl4RuntimeComponent(
      buildOptions(directory, {
        featureFlags: {dsl4Runtime: true},
      }),
    );

    assert.equal(runtimeComponent(built).sourceDescriptor.sourceId, 'main');
    assert.doesNotMatch(runtimeComponent(built).sourceDescriptor.text, /^include:/mu);
    assert.match(
      runtimeComponent(built).sourceDescriptor.text,
      /chapters\/chapter1\/image\/background\.svg/u,
    );
    assert.deepEqual(
      runtimeComponent(built).storyDocument.scenes.map(({id}) => id),
      ['opening', 'chapter1'],
    );
    assert.deepEqual(
      runtimeComponent(built).getAssetFile('ChapterBackground', 'background.svg'),
      new TextEncoder().encode('<svg/>'),
    );
    const actionPath = '/scenes/chapter1/actions/0';
    const memoryOrigin = requireDefined(
      runtimeComponent(built).storyDocument.sourceOrigins[actionPath],
      'the action origin',
    );
    assert.equal(memoryOrigin.sourceId, 'chapters/chapter1/scenario.k4.yml');
    assert.deepEqual(
      requireDefined(
        requireDefined(runtimeComponent(built).storyDocument.scenes[1], 'the second scene')
          .actions[0],
        'its first action',
      ).sourceRange,
      memoryOrigin.range,
    );

    const persisted = readSb3(built.bytes).project;
    const reloaded = await loadDsl4RuntimeComponent(persisted, frontend, {
      maxSourceBytes: 16 * 1024,
      maxAssetFiles: 10,
      maxTotalAssetBytes: 16 * 1024,
      subtleCrypto,
    });
    const reloadedComponent = loadedComponent(reloaded);
    assert.deepEqual(reloadedComponent.storyDocument.sourceOrigins[actionPath], memoryOrigin);
    assert.deepEqual(
      requireDefined(
        requireDefined(reloadedComponent.storyDocument.scenes[1], 'the second scene').actions[0],
        'its first action',
      ).sourceRange,
      memoryOrigin.range,
    );

    // Recorded through a holder: a `let` assigned inside the callback keeps its initial narrowing.
    const startupCapture: {origin?: unknown} = {};
    const startup = await createDsl4RuntimeStartup({
      featureFlags: {dsl4Runtime: true},
      project: persisted,
      sourceFrontend: frontend,
      maxSourceBytes: 16 * 1024,
      maxAssetFiles: 10,
      maxTotalAssetBytes: 16 * 1024,
      subtleCrypto,
      createRuntimeEnvironment(component: unknown) {
        startupCapture.origin = (component as BuiltComponent).storyDocument.sourceOrigins[
          actionPath
        ];
        return {port: {}, dispose() {}};
      },
    });
    assert.equal(startup.ok, true);
    assert.deepEqual(startupCapture.origin, memoryOrigin);
    await requireSession(startup).dispose();

    const missingOrigin = structuredClone(persisted);
    const storedSource = requireRecord(
      requireRecord(
        requireRecord(missingOrigin.extensionStorage, 'the extension storage')
          .kubohiroyakamishibairuntime4,
        'the runtime storage',
      ).source,
      'the stored source descriptor',
    );
    const storedOrigins = requireRecord(storedSource.sourceOrigins, 'its source origins');
    storedOrigins.entries = requireArray(storedOrigins.entries, 'its origin entries').filter(
      (entry) => requireRecord(entry, 'an origin entry').storyPath !== actionPath,
    );
    const rejected = await loadDsl4RuntimeComponent(missingOrigin, frontend, {
      maxSourceBytes: 16 * 1024,
      maxAssetFiles: 10,
      maxTotalAssetBytes: 16 * 1024,
      subtleCrypto,
    });
    assert.equal(
      firstDiagnostic(rejected, 'the load result').code,
      'K4-SOURCE-ORIGIN-COVERAGE-001',
    );
    assert.equal(firstDiagnostic(rejected, 'the load result').path, '$.source.sourceOrigins');
    assert.equal(JSON.stringify(built).includes(directory), false);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('composes includes without a feature flag', async () => {
  const directory = await createIncludedProject();
  try {
    const built = await buildDsl4RuntimeComponent(buildOptions(directory));
    assert.ok(built.bytes.byteLength > 0);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('uses the graph-total budget for composed packaging and rejects one byte over', async () => {
  const {directory, entry, chapter} = await createCompactIncludedProject();
  try {
    const encoder = new TextEncoder();
    const maxSourceBytes = Math.max(
      encoder.encode(entry).byteLength,
      encoder.encode(chapter).byteLength,
    );
    const featureFlags = {dsl4Runtime: true};
    const prepared = await buildDsl4RuntimeComponent(
      buildOptions(directory, {
        featureFlags,
        maxSourceBytes,
        maxTotalSourceBytes: 16 * 1024,
      }),
    );
    const composedBytes = runtimeComponent(prepared).sourceDescriptor.byteLength;
    assert.equal(composedBytes > maxSourceBytes, true);

    const boundary = await buildDsl4RuntimeComponent(
      buildOptions(directory, {
        featureFlags,
        maxSourceBytes,
        maxTotalSourceBytes: composedBytes,
      }),
    );
    assert.equal(runtimeComponent(boundary).sourceDescriptor.byteLength, composedBytes);

    const runtimeOverflow = await loadDsl4RuntimeComponent(prepared.project, frontend, {
      maxSourceBytes: composedBytes - 1,
      maxAssetFiles: 10,
      maxTotalAssetBytes: 16 * 1024,
      subtleCrypto,
    });
    assert.equal(
      firstDiagnostic(runtimeOverflow, 'the overflowing load').code,
      'K4-SOURCE-SIZE-001',
    );

    await assert.rejects(
      buildDsl4RuntimeComponent(
        buildOptions(directory, {
          featureFlags,
          maxSourceBytes,
          maxTotalSourceBytes: composedBytes - 1,
        }),
      ),
      (error) =>
        error instanceof Dsl4BuildError &&
        error.stage === 'dsl4-parse' &&
        error.code === 'K4-SOURCE-LIMIT-BYTES-001',
    );
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('rejects an included source symlink which escapes the project root', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsl4-source-include-root-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'dsl4-source-include-outside-'));
  try {
    await mkdir(path.join(directory, 'chapters'));
    await writeFile(
      path.join(directory, 'story.k4.yml'),
      rootSource.replace('chapters/chapter1/scenario.k4.yml', 'chapters/escape.k4.yml'),
    );
    const outsideSource = path.join(outside, 'escape.k4.yml');
    await writeFile(outsideSource, chapterSource);
    await symlink(outsideSource, path.join(directory, 'chapters', 'escape.k4.yml'));

    await assert.rejects(
      buildDsl4RuntimeComponent(
        buildOptions(directory, {
          featureFlags: {dsl4Runtime: true},
        }),
      ),
      (error) =>
        error instanceof Sb3BuilderError &&
        error.stage === 'dsl4-source-graph' &&
        error.code === 'K4-SOURCE-PATH-001' &&
        !error.message.includes(outside),
    );
  } finally {
    await rm(directory, {recursive: true, force: true});
    await rm(outside, {recursive: true, force: true});
  }
});

test('opt-in embedded documents retain the exact original entry and module, while the runtime uses their verified composition', async () => {
  const record = (value: unknown) => requireRecord(value, 'source graph field');
  const root = await createIncludedProject();
  try {
    const entry = '\uFEFF# Original entry\r\n' + rootSource.replaceAll('\n', '\r\n');
    const module = '# Original module\r\n' + chapterSource.replaceAll('\n', '\r\n');
    await writeFile(path.join(root, 'story.k4.yml'), entry);
    await writeFile(path.join(root, 'chapters/chapter1/scenario.k4.yml'), module);
    const result = await buildDsl4RuntimeComponent(
      buildOptions(root, {
        featureFlags: {},
        embeddedSourceDocuments: true,
      }),
    );
    const project = readSb3(result.bytes).project;
    const owner = (value: unknown) =>
      record(record(record(value).extensionStorage).kubohiroyakamishibairuntime4);
    const component = owner(project),
      files = record(record(component.sourceDocuments).files);
    assert.equal(record(files['story.k4.yml']).source, entry);
    assert.equal(record(files['chapters/chapter1/scenario.k4.yml']).source, module);
    assert(!String(record(component.source).text).includes('include:'));
    assert(!String(record(component.source).text).includes('\r'));
    const stage = requireDefined(
      requireArray(record(project).targets, 'targets')
        .map((t) => record(t))
        .find((t) => t.isStage === true),
      'Stage',
    );
    const references = Object.values(record(stage.blocks)).filter(
      (b) => record(b).opcode === 'kubohiroyakamishibairuntime4_embeddedYaml',
    );
    assert.equal(references.length, 2);
    const roots = Object.entries(record(stage.blocks)).filter(
      ([, block]) => record(block).opcode === 'kubohiroyakamishibairuntime4_embeddedYamlRoot',
    );
    assert.equal(roots.length, 1);
    const [rootId, rootBlock] = requireDefined(roots[0], 'entry root');
    assert.equal(record(rootBlock).next, null);
    assert.equal(record(rootBlock).parent, null);
    assert.deepEqual(record(rootBlock).inputs, {});
    assert.deepEqual(record(record(rootBlock).fields).VERSION, ['4.0', null]);
    const limits = {
      maxSourceBytes: 16 * 1024,
      maxAssetFiles: 10,
      maxTotalAssetBytes: 16 * 1024,
      subtleCrypto,
    };
    assert.equal((await loadDsl4RuntimeComponent(project, frontend, limits)).ok, true);
    const connectedRoot = structuredClone(project);
    const connectedStage = requireDefined(
      requireArray(record(connectedRoot).targets, 'targets')
        .map(record)
        .find((t) => t.isStage === true),
      'Stage',
    );
    record(record(connectedStage.blocks)[rootId]).next = 'unexpected-body';
    assert.equal((await loadDsl4RuntimeComponent(connectedRoot, frontend, limits)).ok, false);
    const missingRoot = structuredClone(project);
    const missingStage = requireDefined(
      requireArray(record(missingRoot).targets, 'targets')
        .map(record)
        .find((t) => t.isStage === true),
      'Stage',
    );
    delete record(missingStage.blocks)[rootId];
    assert.equal((await loadDsl4RuntimeComponent(missingRoot, frontend, limits)).ok, false);
    const tampered = structuredClone(project);
    record(
      record(record(owner(tampered).sourceDocuments).files)['chapters/chapter1/scenario.k4.yml'],
    ).source = module + '# unverified\r\n';
    assert.equal((await loadDsl4RuntimeComponent(tampered, frontend, limits)).ok, false);
    const {createEmbeddedYamlSourceGraphRecord} =
      await import('../src/dsl4/embedded-yaml-source-graph.js');
    const changed = structuredClone(project);
    owner(changed).sourceDocuments = await createEmbeddedYamlSourceGraphRecord(
      {
        entryPath: 'story.k4.yml',
        sources: {
          'story.k4.yml': entry,
          'chapters/chapter1/scenario.k4.yml': module.replace(
            'stage: ChapterBackground',
            'wait: 2',
          ),
        },
      },
      {subtleCrypto},
    );
    assert.equal((await loadDsl4RuntimeComponent(changed, frontend, limits)).ok, false);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('embedded raw documents are off by default and cannot be invented from legacy block-only input or emitted in compiled output', async () => {
  const record = (value: unknown) => requireRecord(value, 'source graph field');
  const root = await createIncludedProject();
  try {
    const ordinary = await buildDsl4RuntimeComponent(
      buildOptions(root, {
        featureFlags: {dsl4Runtime: true},
      }),
    );
    const p = record(readSb3(ordinary.bytes).project);
    assert.equal(
      record(record(p.extensionStorage).kubohiroyakamishibairuntime4).sourceDocuments,
      undefined,
    );
    await assert.rejects(
      buildDsl4RuntimeComponent(
        buildOptions(root, {
          embeddedSourceDocuments: true,
          distributionProfile: 'compiled',
        }),
      ),
      /source distribution/,
    );
    await assert.rejects(
      buildDsl4RuntimeComponent(
        buildOptions(root, {
          embeddedSourceDocuments: true,
          sourceManifest: undefined,
        }),
      ),
      /Original source files/,
    );
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
