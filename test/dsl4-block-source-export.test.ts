import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate';
import {parse} from 'yaml';
import {createDsl4StructuredBlockSourceDeclaration} from '../dist/dsl4/structured-block-source.js';

import {runCli} from '../dist/builder/cli.js';
import type {Dsl4BlockSourceExportGraph} from '../dist/dsl4/block-source-export.js';
import {
  Dsl4BlockSourceExportError,
  exportDsl4BlockSourcesToYaml,
} from '../dist/builder/dsl4-block-source-export.js';
import {
  createDsl4BlockSourceGraph,
  planDsl4BlockSourceExport,
} from '../dist/dsl4/block-source-export.js';
import {createDsl4SourceFrontend} from '../dist/dsl4/source-frontend.js';
import {createDsl4SourceGraphFrontend} from '../dist/dsl4/source-graph-frontend.js';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const schema = JSON.parse(
  await readFile(path.join(repositoryRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
);
const frontend = createDsl4SourceFrontend(schema);

const rootSource = `include: turtle.k4.yml
kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  opening:
    - goto: chapter1
`;
const turtleSource = `assets:
  ChapterBackground:
    kind: backdrop
    file: image/background.svg
scenes:
  chapter1:
    - stage: ChapterBackground
`;
const standaloneSource = `kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
assets:
  Cover:
    kind: backdrop
    file: image/cover.svg
scenes:
  opening:
    - stage: Cover
`;

/** One block in the fixture project the suite builds. */
interface Sb3Block {
  opcode: string;
  next: string | null;
  parent: string | null;
  inputs: Record<string, unknown>;
  fields: Record<string, unknown>;
  shadow: boolean;
  topLevel: boolean;
}

function declarationBlocks(sourceText: string, suffix = ''): Record<string, Sb3Block> {
  const source = parse(sourceText) as Record<string, unknown>;
  const includes = source.include;
  delete source.include;
  const blocks = createDsl4StructuredBlockSourceDeclaration({
    source,
    form: 'runtime',
    hatId: `hat${suffix}`,
    idPrefix: `source${suffix}-`,
  });
  // These fixtures exercise legacy inline definitions and target-file include references.
  const config = Object.entries(blocks).find(([, block]) =>
    block.opcode.endsWith('_kamishibaiConfig'),
  );
  if (config) {
    const [configId, configHat] = config;
    const hat = blocks[`hat${suffix}`]!;
    const next = hat.next;
    hat.next = configHat.next;
    if (configHat.next) blocks[configHat.next]!.parent = `hat${suffix}`;
    let tail = configHat.next;
    while (tail && blocks[tail]!.next) tail = blocks[tail]!.next;
    if (tail) {
      blocks[tail]!.next = next;
      if (next) blocks[next]!.parent = tail;
    }
    delete blocks[configId];
  }
  if (includes !== undefined) {
    const hat = blocks[`hat${suffix}`]!;
    const next = hat.next;
    blocks[`include${suffix}`] = {
      opcode: 'kubohiroyakamishibaiauthoring4_property',
      parent: `hat${suffix}`,
      next,
      inputs: {PATH: [1, [10, '["include"]']], VALUE: [1, [10, JSON.stringify(includes)]]},
      fields: {},
      shadow: false,
      topLevel: false,
    };
    if (next) blocks[next]!.parent = `include${suffix}`;
    hat.next = `include${suffix}`;
  }
  return blocks;
}

/**
 * @param {{stage?: Record<string, unknown> | null, sprites?: Record<string, Record<string, unknown>>}} targets
 */
function sb3Bytes({stage = declarationBlocks(standaloneSource), sprites = {}} = {}) {
  const project = {
    targets: [
      {isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: stage ?? {}},
      ...Object.entries(sprites).map(([name, blocks]) => ({
        isStage: false,
        name,
        variables: {},
        lists: {},
        broadcasts: {},
        blocks,
      })),
    ],
    monitors: [],
  };
  return Buffer.from(zipSync({'project.json': strToU8(`${JSON.stringify(project)}\n`)}));
}

function unzipText(bytes: Buffer) {
  return Object.fromEntries(
    Object.entries(unzipSync(new Uint8Array(bytes))).map(([entryName, contents]) => [
      entryName,
      strFromU8(contents),
    ]),
  );
}

async function withTemporaryDirectory(body: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'k4-block-export-'));
  try {
    await body(directory);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
}

async function writeSb3(directory: string, bytes: Buffer, name = 'urashima.sb3') {
  const inputPath = path.join(directory, name);
  await writeFile(inputPath, bytes);
  return inputPath;
}

type ExportOptions = Parameters<typeof exportDsl4BlockSourcesToYaml>[0];

function exportOptions(
  directory: string,
  overrides: Partial<ExportOptions> & {input: string},
): ExportOptions {
  return {
    outputDir: path.join(directory, 'dist'),
    sourceFrontend: frontend,
    maxSourceBytes: 64 * 1024,
    maxTotalSourceBytes: 256 * 1024,
    ...overrides,
  };
}

test('exports one YAML file when the block story has no includes', async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeSb3(directory, sb3Bytes());
    const result = await exportDsl4BlockSourcesToYaml(exportOptions(directory, {input}));

    assert.equal(result.kind, 'single');
    assert.equal(result.name, 'urashima');
    assert.equal(path.basename(result.outputPath), 'urashima.k4.yml');
    assert.deepEqual(result.moduleFilenames, []);
    const written = await readFile(result.outputPath, 'utf8');
    assert.match(written, /^kamishibai: "4\.0"$/mu);
    assert.match(written, /^ {4}- stage: Cover$/mu);
  });
});

test('exports the root and every referenced module into one deterministic ZIP package', async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeSb3(
      directory,
      sb3Bytes({
        stage: declarationBlocks(rootSource),
        sprites: {turtle: declarationBlocks(turtleSource)},
      }),
    );
    const result = await exportDsl4BlockSourcesToYaml(exportOptions(directory, {input}));

    assert.equal(result.kind, 'package');
    assert.equal(path.basename(result.outputPath), 'urashima-k4.zip');
    assert.deepEqual(
      result.files.map((file) => file.path),
      ['urashima-k4/turtle.k4.yml', 'urashima-k4/urashima.k4.yml'],
    );
    const first = Buffer.from(await readFile(result.outputPath));
    const entries = unzipText(first);
    assert.deepEqual(Object.keys(entries).sort(), [
      'urashima-k4/turtle.k4.yml',
      'urashima-k4/urashima.k4.yml',
    ]);
    // The root keeps its include reference, so the package re-resolves as a Source Graph on disk.
    assert.match(String(entries['urashima-k4/urashima.k4.yml']), /^include: turtle\.k4\.yml$/mu);

    const second = await exportDsl4BlockSourcesToYaml(exportOptions(directory, {input}));
    assert.ok(first.equals(Buffer.from(await readFile(second.outputPath))));
  });
});

test('exported YAML revalidates as a Source Graph and matches the block story semantics', async () => {
  const blockSourceSet = {
    entryPath: 'Stage.k4.yml',
    sources: {'Stage.k4.yml': rootSource, 'turtle.k4.yml': turtleSource},
  };
  const graph = await createDsl4BlockSourceGraph(blockSourceSet, {
    maxSourceBytes: 64 * 1024,
    maxTotalSourceBytes: 256 * 1024,
  });
  const graphFrontend = createDsl4SourceGraphFrontend(frontend);
  const fromBlocks = graphFrontend.parse(graph, {
    featureFlags: {dsl4Runtime: true},
    sourceId: graph.entryPath,
    maxComposedSourceBytes: 256 * 1024,
  });
  assert.equal(fromBlocks.ok, true);

  const plan = planDsl4BlockSourceExport({
    blockSourceSet,
    // `source-graph.ts` types its nodes as possibly undefined; the plan validates what it reads.
    sourceGraph: graph as unknown as Dsl4BlockSourceExportGraph,
    name: 'urashima',
  });
  const exportedSources = Object.fromEntries(plan.files.map((file) => [file.filename, file.text]));
  const exportedGraph = await createDsl4BlockSourceGraph(
    {entryPath: plan.entryFilename, sources: exportedSources},
    {maxSourceBytes: 64 * 1024, maxTotalSourceBytes: 256 * 1024},
  );
  const fromYaml = graphFrontend.parse(exportedGraph, {
    featureFlags: {dsl4Runtime: true},
    sourceId: graph.entryPath,
    maxComposedSourceBytes: 256 * 1024,
  });
  assert.equal(fromYaml.ok, true);
  assert.equal(fromYaml.canonicalSource, fromBlocks.canonicalSource);
});

test('fails when the Stage declares no root DSL source', async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeSb3(
      directory,
      sb3Bytes({stage: {}, sprites: {turtle: declarationBlocks(turtleSource)}}),
    );
    await assert.rejects(
      exportDsl4BlockSourcesToYaml(exportOptions(directory, {input})),
      (error: Dsl4BlockSourceExportError) => {
        assert.equal(error.code, 'K4-BLOCK-SOURCE-MISSING-001');
        assert.equal(error.stage, 'dsl4-block-export-frontend');
        return true;
      },
    );
  });
});

test('fails when one target declares more than one DSL source hat', async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeSb3(
      directory,
      sb3Bytes({
        stage: {
          ...declarationBlocks(standaloneSource, 'A'),
          ...declarationBlocks(standaloneSource, 'B'),
        },
      }),
    );
    await assert.rejects(
      exportDsl4BlockSourcesToYaml(exportOptions(directory, {input})),
      (error: Dsl4BlockSourceExportError) => {
        assert.equal(error.code, 'K4-BLOCK-SOURCE-DUPLICATE-001');
        return true;
      },
    );
  });
});

test('fails when two targets claim the same DSL source filename', async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeSb3(
      directory,
      sb3Bytes({
        stage: declarationBlocks(rootSource),
        sprites: {
          turtle: declarationBlocks(turtleSource),
          'turtle.k4.yml': declarationBlocks(turtleSource),
        },
      }),
    );
    await assert.rejects(
      exportDsl4BlockSourcesToYaml(exportOptions(directory, {input})),
      (error: Dsl4BlockSourceExportError) => {
        assert.equal(error.code, 'K4-BLOCK-SOURCE-DUPLICATE-001');
        return true;
      },
    );
  });
});

test('fails when an include names a Sprite that declares no DSL source', async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeSb3(directory, sb3Bytes({stage: declarationBlocks(rootSource)}));
    await assert.rejects(
      exportDsl4BlockSourcesToYaml(exportOptions(directory, {input})),
      (error: Dsl4BlockSourceExportError) => {
        assert.equal(error.code, 'K4-SOURCE-MISSING');
        assert.equal(error.stage, 'dsl4-block-export-graph');
        return true;
      },
    );
  });
});

test('fails on a cyclic include between Sprite modules', async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeSb3(
      directory,
      sb3Bytes({
        stage: declarationBlocks(rootSource),
        sprites: {
          turtle: declarationBlocks(`include: princess.k4.yml\n${turtleSource}`),
          princess: declarationBlocks('include: turtle.k4.yml\n'),
        },
      }),
    );
    await assert.rejects(
      exportDsl4BlockSourcesToYaml(exportOptions(directory, {input})),
      (error: Dsl4BlockSourceExportError) => {
        assert.equal(error.code, 'K4-INCLUDE-CYCLE');
        assert.equal(error.stage, 'dsl4-block-export-graph');
        return true;
      },
    );
  });
});

test('fails with source-located diagnostics when a module breaks the schema', async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeSb3(
      directory,
      sb3Bytes({
        stage: declarationBlocks(rootSource),
        sprites: {
          turtle: declarationBlocks(
            'textStyles: {bad: {size: -1}}\nscenes:\n  chapter1:\n    - wait: 0\n',
          ),
        },
      }),
    );
    await assert.rejects(
      exportDsl4BlockSourcesToYaml(exportOptions(directory, {input})),
      (error: Dsl4BlockSourceExportError) => {
        assert.equal(error.stage, 'dsl4-block-export-validate');
        assert.equal(
          error.diagnostics.some(
            (diagnostic) => (diagnostic as {sourceId?: unknown}).sourceId === 'turtle.k4.yml',
          ),
          true,
        );
        return true;
      },
    );
  });
});

test('fails when the requested work name collides with a module filename', async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeSb3(
      directory,
      sb3Bytes({
        stage: declarationBlocks(rootSource),
        sprites: {turtle: declarationBlocks(turtleSource)},
      }),
    );
    await assert.rejects(
      exportDsl4BlockSourcesToYaml(exportOptions(directory, {input, name: 'turtle'})),
      (error: Dsl4BlockSourceExportError) => {
        assert.equal(error.code, 'K4-BLOCK-EXPORT-COLLISION-001');
        return true;
      },
    );
  });
});

test('rejects a work name that cannot become a portable filename', async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeSb3(directory, sb3Bytes());
    for (const name of ['../escape', 'nul', '.hidden', 'has.dot', '']) {
      await assert.rejects(
        exportDsl4BlockSourcesToYaml(exportOptions(directory, {input, name})),
        (error: Error & {code?: string}) => {
          assert.equal(error.code, 'K4-BLOCK-EXPORT-NAME-001');
          return true;
        },
        name,
      );
    }
  });
});

test('fails when a Sprite declares a DSL source that no include ever reaches', async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeSb3(
      directory,
      sb3Bytes({
        stage: declarationBlocks(rootSource),
        sprites: {
          turtle: declarationBlocks(turtleSource),
          orphan: declarationBlocks('scenes:\n  unused:\n    - goto: chapter1\n'),
        },
      }),
    );
    await assert.rejects(
      exportDsl4BlockSourcesToYaml(exportOptions(directory, {input})),
      (error: Dsl4BlockSourceExportError) => {
        assert.equal(error.code, 'K4-BLOCK-EXPORT-UNREFERENCED-001');
        assert.equal(error.stage, 'dsl4-block-export-plan');
        assert.match(error.message, /"orphan\.k4\.yml"/u);
        return true;
      },
    );
    // The export is all-or-nothing: nothing is written when a declared module is unreachable.
    await assert.rejects(readFile(path.join(directory, 'dist', 'urashima-k4.zip')));
  });
});

test('names every unreachable module in one diagnostic', async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeSb3(
      directory,
      sb3Bytes({
        stage: declarationBlocks(rootSource),
        sprites: {
          turtle: declarationBlocks(turtleSource),
          zebra: declarationBlocks('scenes:\n  unusedZebra: []\n'),
          orphan: declarationBlocks('scenes:\n  unusedOrphan: []\n'),
        },
      }),
    );
    await assert.rejects(
      exportDsl4BlockSourcesToYaml(exportOptions(directory, {input})),
      (error: Dsl4BlockSourceExportError) => {
        assert.equal(error.code, 'K4-BLOCK-EXPORT-UNREFERENCED-001');
        assert.match(error.message, /"orphan\.k4\.yml", "zebra\.k4\.yml"/u);
        return true;
      },
    );
  });
});

test('exports through the CLI and reports the written package', async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeSb3(
      directory,
      sb3Bytes({
        stage: declarationBlocks(rootSource),
        sprites: {turtle: declarationBlocks(turtleSource)},
      }),
    );
    const outputDirectory = path.join(directory, 'dist');
    const out: string[] = [];
    const errorOut: string[] = [];
    const result = await runCli(
      ['export-block-dsl', '--input', input, '--output-dir', outputDirectory],
      {
        stdout: {
          write: (chunk: unknown) => {
            out.push(String(chunk));
            return true;
          },
        },
        stderr: {
          write: (chunk: unknown) => {
            errorOut.push(String(chunk));
            return true;
          },
        },
      },
    );
    assert.equal((result as {exitCode?: unknown} | null)?.exitCode, 0);
    assert.equal(out.join('').includes('Exported urashima-k4.zip'), true);
    assert.equal(errorOut.join(''), '');
    const entries = unzipText(
      Buffer.from(await readFile(path.join(outputDirectory, 'urashima-k4.zip'))),
    );
    assert.deepEqual(Object.keys(entries).sort(), [
      'urashima-k4/turtle.k4.yml',
      'urashima-k4/urashima.k4.yml',
    ]);
  });
});

test('reports CLI failures as JSON diagnostics and exits non-zero', async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeSb3(directory, sb3Bytes({stage: declarationBlocks(rootSource)}));
    const out: string[] = [];
    await assert.rejects(
      runCli(
        [
          'export-block-dsl',
          '--input',
          input,
          '--output-dir',
          path.join(directory, 'dist'),
          '--format',
          'json',
        ],
        {
          stdout: {
            write: (chunk: unknown) => {
              out.push(String(chunk));
              return true;
            },
          },
          stderr: {write: () => true},
        },
      ),
      (error: Error & {exitCode?: number; reported?: boolean}) => {
        assert.equal(error.exitCode, 1);
        assert.equal(error.reported, true);
        return true;
      },
    );
    const report = JSON.parse(out.join(''));
    assert.equal(report.ok, false);
    assert.equal(report.code, 'K4-SOURCE-MISSING');
  });
});
