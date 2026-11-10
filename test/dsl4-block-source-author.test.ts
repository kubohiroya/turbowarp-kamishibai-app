import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
import {test} from 'vitest';

import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate';
import {parse} from 'yaml';

import {authorDsl4BlockSourceSb3} from '../src/builder/dsl4-block-source-author.js';
import {
  dsl4BlockAuthoringExtensionId,
  dsl4LabeledBlockSourceHatOpcode,
} from '../src/dsl4/structured-block-source.js';
import {parseCliArguments, runCli} from '../src/builder/cli.js';
import {
  extractDsl4BlockSourcesFromProject,
  targetNameForSourcePath,
} from '../src/dsl4/turbowarp-yaml-json-block-source.js';
import {dsl4TestSourceFrontend} from './helpers/dsl4-test-frontend.ts';
import {captureWrites, cliResult, parsedOptions} from './helpers/cli-command.ts';
import {requireRecord} from './helpers/require-value.ts';

const frontend = dsl4TestSourceFrontend;
const validSource = "kamishibai: '4.0'\nscenes:\n  opening:\n    - wait: 0\n";

/** A base project shaped like a release base: one Stage, loading the bundled runtime. */
function baseBytes({
  extensions = ['kubohiroyakamishibai4'],
  blocks = {},
  extensionURLs,
}: {
  extensions?: string[];
  blocks?: Record<string, unknown>;
  extensionURLs?: Record<string, string>;
} = {}) {
  const project = {
    targets: [{isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks}],
    monitors: [],
    extensions,
    ...(extensionURLs === undefined ? {} : {extensionURLs}),
  };
  return new Uint8Array(
    zipSync(
      {'project.json': strToU8(`${JSON.stringify(project)}\n`), 'assets/keep.txt': strToU8('keep')},
      {level: 6},
    ),
  );
}

function projectOf(bytes: Uint8Array) {
  const archive = unzipSync(bytes);
  return JSON.parse(strFromU8(archive['project.json'] as Uint8Array)) as Record<string, unknown>;
}

test('writes a declaration the reader takes back as the same source, deterministically', () => {
  const first = authorDsl4BlockSourceSb3({
    baseBytes: baseBytes(),
    sourceText: validSource,
    sourceFrontend: frontend,
  });
  const second = authorDsl4BlockSourceSb3({
    baseBytes: baseBytes(),
    sourceText: validSource,
    sourceFrontend: frontend,
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;

  // 同じ入力から同じバイト列。samples は hash を固定して配布するため、ここが要件。
  assert.equal(Buffer.compare(first.bytes, second.bytes), 0);
  assert.equal(first.sourcePath, 'Stage.k4.yml');
  assert.equal(targetNameForSourcePath(first.sourcePath), 'Stage');

  const readBack = extractDsl4BlockSourcesFromProject(projectOf(new Uint8Array(first.bytes)));
  assert.equal(readBack.entryPath, 'Stage.k4.yml');
  assert.deepEqual(parse(readBack.sources['Stage.k4.yml']!), parse(validSource));

  // 既存のエントリは残る。オーサリング用途でもアセットを失わない。
  assert.equal(strFromU8(unzipSync(new Uint8Array(first.bytes))['assets/keep.txt']!), 'keep');
});

test('names the blocks for the extension the base loads', () => {
  const bundled = authorDsl4BlockSourceSb3({
    baseBytes: baseBytes(),
    sourceText: validSource,
    sourceFrontend: frontend,
  });
  const standalone = authorDsl4BlockSourceSb3({
    baseBytes: baseBytes({extensions: ['kubohiroyakamishibairuntime4']}),
    sourceText: validSource,
    sourceFrontend: frontend,
  });
  assert.equal(bundled.ok, true);
  assert.equal(standalone.ok, true);
  if (!bundled.ok || !standalone.ok) return;
  assert.equal(bundled.opcodeForm, 'bundle');
  assert.equal(standalone.opcodeForm, 'runtime');

  const opcodes = Object.values(
    requireRecord(
      requireRecord(
        (projectOf(new Uint8Array(bundled.bytes)).targets as Record<string, unknown>[])[0],
        'the Stage',
      ).blocks,
      'the Stage blocks',
    ),
  ).map((block) => requireRecord(block, 'a block').opcode);
  assert.ok(opcodes.includes(dsl4LabeledBlockSourceHatOpcode));
  assert.ok(opcodes.includes('kubohiroyakamishibai4_kubohiroyakamishibairuntime4__wait'));
  assert.ok(
    !opcodes.includes('kubohiroyakamishibai4_kubohiroyakamishibairuntime4__dsl4SourceFromYamlJson'),
  );
});

for (const form of ['runtime', 'bundle'] as const) {
  test(`keeps ${form} security metadata first while filtering retired source blocks`, () => {
    const owner = form === 'runtime' ? 'kubohiroyakamishibairuntime4' : 'kubohiroyakamishibai4';
    const opcodePrefix = form === 'runtime' ? '' : 'kubohiroyakamishibairuntime4__';
    const header = [
      '// Name: Kamishibai DSL 4.0 Runtime',
      `// ID: ${owner}`,
      '// Description: Run a Kamishibai story.',
      '// By: Hiroya Kubo',
      '// License: MPL-2.0',
      '// Unsandboxed: required',
      '//',
      '// Bundled extensions:',
      '// - Name: Runtime',
      '//   License: MPL-2.0',
      '',
    ].join('\n');
    const blocks = [
      {opcode: `${opcodePrefix}whenDsl4Source`},
      {opcode: `${opcodePrefix}dsl4SourceFromYamlJson`},
      {opcode: `${opcodePrefix}wait`},
      {opcode: `${opcodePrefix}whenDsl4SourceExtra`},
      {blockType: 'label', text: 'Runtime'},
      '---',
    ];
    const body = `Scratch.extensions.register({getInfo(){return ${JSON.stringify({id: owner, blocks})};}});`;
    for (const metadata of [header, header.replaceAll('\n', '\r\n'), '']) {
      const result = authorDsl4BlockSourceSb3({
        baseBytes: baseBytes({
          extensions: [owner],
          extensionURLs: {
            [owner]: `data:text/javascript;base64,${Buffer.from(metadata + body).toString('base64')}`,
          },
        }),
        sourceText: validSource,
        sourceFrontend: frontend,
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      const project = projectOf(new Uint8Array(result.bytes));
      const url = requireRecord(project.extensionURLs, 'extension URLs')[owner] as string;
      const source = Buffer.from(url.split(',')[1]!, 'base64').toString('utf8');
      assert.equal(source.startsWith(metadata), true, 'security metadata must precede the wrapper');
      if (metadata) assert.equal(source.indexOf(metadata, metadata.length), -1);
      const registered: unknown[] = [];
      runInNewContext(source, {
        Scratch: {
          extensions: {
            register(extension: {getInfo(): unknown}) {
              registered.push(JSON.parse(JSON.stringify(extension.getInfo())));
            },
          },
        },
      });
      assert.deepEqual(registered, [{id: owner, blocks: blocks.slice(2)}]);
    }
  });

  test(`ships forms for actual ${form} action opcodes and releases them with authoring forms`, () => {
    const owner = form === 'runtime' ? 'kubohiroyakamishibairuntime4' : 'kubohiroyakamishibai4';
    const poseOpcode =
      form === 'runtime' ? `${owner}_pose` : `${owner}_kubohiroyakamishibairuntime4__pose`;
    const result = authorDsl4BlockSourceSb3({
      baseBytes: baseBytes({extensions: [owner]}),
      sourceText: `kamishibai: '4.0'
assets:
  HeroIdle: costume:Hero
  SuccessSound: sound
  PoseModel: {kind: recognitionModel, file: pose-model}
actors:
  Hero: HeroIdle
scenes:
  opening:
    recognitionModel: PoseModel
    actions:
      - Hero.say: {text: Hello, seconds: 1}
      - Hero.think: {text: Hmm, seconds: 2}
      - Hero.pose:
          stableId: poseId
          steps:
            - {pose: Ready, skin: HeroIdle, sound: SuccessSound}
`,
      sourceFrontend: frontend,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const project = projectOf(new Uint8Array(result.bytes));
    const stage = requireRecord((project.targets as unknown[])[0], 'the Stage');
    const pose = Object.values(requireRecord(stage.blocks, 'the Stage blocks')).find(
      (block) => requireRecord(block, 'a block').opcode === poseOpcode,
    );
    assert.ok(pose, `generated blocks must contain ${poseOpcode}`);
    assert.ok(
      Object.hasOwn(requireRecord(requireRecord(pose, 'the pose block').inputs, 'inputs'), 'STEPS'),
    );
    const urls = requireRecord(project.extensionURLs, 'extension URLs');
    const url = urls[dsl4BlockAuthoringExtensionId];
    assert.equal(typeof url, 'string');
    const source = Buffer.from((url as string).split(',')[1]!, 'base64').toString('utf8');
    const recorded: Record<string, unknown>[] = [];
    let extension: {getInfo(): {id: string}; dispose(): void} | undefined;
    let removed = 0;
    runInNewContext(source, {
      Scratch: {
        extensions: {
          register(value: typeof extension) {
            extension = value;
          },
        },
        gui: {
          blockEditors: {
            apiVersion: 1,
            registerSchema(value: Record<string, unknown>) {
              recorded.push(JSON.parse(JSON.stringify(value)));
              return () => {
                removed++;
              };
            },
          },
        },
      },
    });
    assert.equal(extension!.getInfo().id, dsl4BlockAuthoringExtensionId);
    assert.equal(recorded.length, 12);
    assert.equal(recorded.filter(({argument}) => argument === 'VALUE').length, 8);
    const sceneEditor = recorded.find(({argument}) => argument === 'PROPERTIES')!;
    assert.deepEqual(sceneEditor.opcodes, [`${dsl4BlockAuthoringExtensionId}_scene`]);
    const scene = Object.values(requireRecord(stage.blocks, 'the Stage blocks')).find(
      (block) =>
        requireRecord(block, 'a block').opcode === `${dsl4BlockAuthoringExtensionId}_scene`,
    );
    assert.ok(scene);
    const properties = {
      recognitionModel: 'PoseModel',
      recognitionMode: 'pose',
      posePreview: {mirroring: 'unmirrored'},
      entryTransition: {effect: 'crossfade', seconds: 0.5},
    };
    requireRecord(requireRecord(scene, 'the scene block').inputs, 'inputs').PROPERTIES = [
      1,
      [10, JSON.stringify(properties)],
    ];
    const steps = recorded.filter(({argument}) => argument === 'STEPS');
    assert.equal(steps.length, 1);
    assert.equal(steps[0]!.extensionId, owner);
    assert.deepEqual(steps[0]!.opcodes, [requireRecord(pose, 'the pose block').opcode]);
    const speech = recorded.filter(({argument}) => argument === 'SPEC');
    assert.equal(speech.length, 2);
    for (const command of ['say', 'think']) {
      const opcode =
        form === 'runtime'
          ? `${owner}_${command}`
          : `${owner}_kubohiroyakamishibairuntime4__${command}`;
      assert.ok(
        Object.values(requireRecord(stage.blocks, 'the Stage blocks')).some(
          (block) => requireRecord(block, 'an action block').opcode === opcode,
        ),
      );
      assert.ok(speech.some((editor) => (editor.opcodes as string[]).includes(opcode)));
    }
    extension!.dispose();
    extension!.dispose();
    assert.equal(removed, 12);

    for (const blockEditors of [
      undefined,
      {
        apiVersion: 2,
        registerSchema() {
          throw new Error('incompatible API must not be used');
        },
      },
    ]) {
      let ordinaryBlocksAvailable = false;
      runInNewContext(source, {
        Scratch: {
          extensions: {
            register(value: {getInfo(): {id: string}}) {
              ordinaryBlocksAvailable = value.getInfo().id === dsl4BlockAuthoringExtensionId;
            },
          },
          gui: {blockEditors},
        },
      });
      assert.ok(ordinaryBlocksAvailable);
    }
    const readBack = extractDsl4BlockSourcesFromProject(project);
    const document = parse(readBack.sources[readBack.entryPath!]!);
    const {actions, ...readProperties} = document.scenes.opening;
    assert.deepEqual(readProperties, properties);
    assert.deepEqual(Object.keys(document.scenes), ['opening']);
    assert.deepEqual(actions, [
      {'Hero.say': {text: 'Hello', seconds: 1}},
      {'Hero.think': {text: 'Hmm', seconds: 2}},
      {
        'Hero.pose': {
          stableId: 'poseId',
          steps: [{pose: 'Ready', skin: 'HeroIdle', sound: 'SuccessSound'}],
        },
      },
    ]);
  });
}

test('refuses an invalid story, a base without the runtime, an existing declaration, and includes', () => {
  const invalid = authorDsl4BlockSourceSb3({
    baseBytes: baseBytes(),
    sourceText: 'kamishibai: 4.0\nscenes:\n  opening: []\n',
    sourceFrontend: frontend,
  });
  assert.equal(invalid.ok, false);

  assert.throws(
    () =>
      authorDsl4BlockSourceSb3({
        baseBytes: baseBytes({extensions: []}),
        sourceText: validSource,
        sourceFrontend: frontend,
      }),
    /must load/u,
  );
  assert.throws(
    () =>
      authorDsl4BlockSourceSb3({
        baseBytes: baseBytes({
          blocks: {
            existing: {
              opcode: dsl4LabeledBlockSourceHatOpcode,
              next: null,
              parent: null,
              inputs: {},
              fields: {},
              shadow: false,
              topLevel: true,
            },
          },
        }),
        sourceText: validSource,
        sourceFrontend: frontend,
      }),
    /already declares a DSL source/u,
  );
  assert.throws(
    () =>
      authorDsl4BlockSourceSb3({
        baseBytes: baseBytes(),
        sourceText: `include: other.k4.yml\n${validSource}`,
        sourceFrontend: frontend,
      }),
    /requires authorDsl4BlockSourceGraphSb3/u,
  );
});

test('authors through the CLI and leaves no file behind for an invalid story', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsl4-author-'));
  try {
    const basePath = path.join(directory, 'base.sb3');
    const sourcePath = path.join(directory, 'story.kamishibai.yaml');
    const outputPath = path.join(directory, 'blocks.sb3');
    await writeFile(basePath, baseBytes());
    await writeFile(sourcePath, validSource);

    const stdout = captureWrites();
    const stderr = captureWrites();
    const result = cliResult(
      await runCli(
        ['author-block-dsl', '--input', sourcePath, '--base', basePath, '--output', outputPath],
        {stdout, stderr},
      ),
      'the author result',
    );
    assert.equal(result.exitCode, 0);
    assert.match(stdout.text, /Stage\.k4\.yml/u);
    assert.equal(stderr.text, '');
    const written = await readFile(outputPath);
    assert.deepEqual(
      parse(
        extractDsl4BlockSourcesFromProject(projectOf(new Uint8Array(written))).sources[
          'Stage.k4.yml'
        ]!,
      ),
      parse(validSource),
    );

    const invalidSourcePath = path.join(directory, 'invalid.kamishibai.yaml');
    const invalidOutputPath = path.join(directory, 'invalid.sb3');
    await writeFile(invalidSourcePath, 'kamishibai: 4.0\nscenes:\n  opening: []\n');
    const invalidStdout = captureWrites();
    const invalidStderr = captureWrites();
    const invalidResult = cliResult(
      await runCli(
        [
          'author-block-dsl',
          '--input',
          invalidSourcePath,
          '--base',
          basePath,
          '--output',
          invalidOutputPath,
        ],
        {stdout: invalidStdout, stderr: invalidStderr},
      ),
      'the author result',
    );
    assert.equal(invalidResult.exitCode, 1);
    assert.equal(invalidStdout.text, '');
    assert.match(invalidStderr.text, /K4-VERSION-001/u);
    await assert.rejects(readFile(invalidOutputPath));

    assert.equal(
      parsedOptions(
        parseCliArguments([
          'author-block-dsl',
          '--input',
          sourcePath,
          '--base',
          basePath,
          '--output',
          outputPath,
        ]),
        'author-block-dsl',
      ).output,
      outputPath,
    );
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
