import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile, symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'vitest';
import {stringify} from 'yaml';
import {strToU8, zipSync} from 'fflate';
import {auditDsl4Definitions} from '../src/dsl4/definition-audit.js';
import {auditDsl4ProjectDefinitions} from '../src/builder/dsl4-definition-audit.js';
import {parseCliArguments, runCli} from '../src/builder/cli.js';
import {
  dsl4TestSchema as schema,
  dsl4TestProductionSourceFrontend as sourceFrontend,
} from './helpers/dsl4-test-frontend.ts';
import {captureWrites, cliResult} from './helpers/cli-command.ts';

const options = {schema, sourceFrontend};
const show = (skin: string) => ({skin, x: 0, y: 0, scale: 100});
function audit(story: Record<string, unknown>) {
  return auditDsl4Definitions([{sourceId: 'main', story: {kamishibai: '4.0', ...story}}], schema);
}
async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsl4-definition-audit-test-'));
  try {
    await run(root);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
}

test('finds unused asset/actor cycles, text styles and variables while preserving every scene', () => {
  const result = audit({
    assets: {Used: 'backdrop', Idle: 'costume:UnusedActor', Spare: 'sound'},
    actors: {UnusedActor: 'Idle'},
    textStyles: {spare: {size: 20}},
    variables: {spare: 1},
    scenes: {opening: [{stage: 'Used'}], unreachable: [{wait: 0}]},
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.removable.map((item) => item.name),
    ['Idle', 'Spare', 'UnusedActor', 'spare', 'spare'],
  );
  assert.equal(result.definitions.find((item) => item.name === 'unreachable')?.status, 'used');
});

test('retains assets/styles through actors, bubble styles, cover, loading and recognition', () => {
  const result = audit({
    assets: {
      Backdrop: 'backdrop',
      Loading: 'costume:Hero',
      Idle: 'costume:Hero',
      Sound: 'sound',
      Image: {kind: 'image', file: 'image.svg'},
    },
    actors: {Hero: 'Idle'},
    textStyles: {title: {size: 20}},
    bubbleStyles: {
      dialog: {textStyle: 'title', characterSound: 'Sound', portrait: {base: 'Image'}},
    },
    cover: {backdrop: 'Backdrop', bgm: 'Sound'},
    loading: {backdrop: 'Backdrop', costumes: ['Loading']},
    recognition: {idleSound: 'Sound'},
    scenes: {opening: [{'Hero.show': show('Idle')}]},
  });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.removable, []);
  for (const kind of ['cover', 'loading', 'recognition'])
    assert.equal(result.definitions.find((item) => item.kind === kind)?.status, 'used');
});

test('reports undefined actors, assets, variables, styles, control profiles and navigation', () => {
  const story = {
    scenes: {
      opening: [
        {'Ghost.show': show('Missing')},
        {'Ghost.setText': {style: 'absent', text: 'x'}},
        {toggleVariable: 'flag'},
        {goto: 'lost'},
      ],
    },
    controls: {keymaps: {production: {Space: 'navigation.absent'}}},
  };
  const result = auditDsl4Definitions([{sourceId: 'main', story}], schema, {
    controlProfile: 'absent',
  });
  assert.equal(result.ok, false);
  for (const name of ['Ghost', 'Missing', 'flag', 'absent', 'lost', 'navigation.absent'])
    assert.ok(
      result.diagnostics.some((item) => item.message.includes(name)),
      name,
    );
});

test('scans both if arms, zero-count loops and expression reads without confusing literals or row scopes', () => {
  const result = audit({
    variables: {score: 0, 得点: 0, written: 0, spare: 0},
    assets: {A: 'backdrop', B: 'backdrop'},
    branches: {
      route: [
        {
          if: 'score > 0 || vars["\\u5f97\\u70b9"] === 1e3 || "unused" === "vars[spare]"',
          goto: 'opening',
        },
        {else: 'opening'},
      ],
    },
    scenes: {
      opening: [
        {if: {condition: {variable: 'score'}, then: [{stage: 'A'}], else: [{stage: 'B'}]}},
        {repeat: {times: 0, as: 'row', do: [{setVariable: {name: 'written', value: 1}}]}},
      ],
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(
    result.removable.map((item) => item.name),
    ['spare'],
  );
  assert.equal(result.references.find((item) => item.name === 'written')?.access, 'write');
});

test('preserves declarations for dynamic refs, custom actions, external broadcasts and disabled sections', () => {
  for (const actions of [
    [{'Hero.custom': {arguments: {name: 'Spare'}}}],
    [{broadcastMessageAndWait: 'outside'}],
    [{forEach: {as: 'row', items: [{asset: 'Spare'}], do: [{stage: {ref: 'row.asset'}}]}}],
  ]) {
    const result = audit({
      assets: {Spare: 'backdrop'},
      actors: {Hero: 'Spare'},
      scenes: {opening: actions},
    });
    assert.equal(
      result.removable.some((item) => item.namespace === 'assets'),
      false,
    );
    assert.ok(result.diagnostics.some((item) => item.code === 'K4-DEFINITION-UNCERTAIN'));
  }
  const result = auditDsl4Definitions(
    [{sourceId: 'main', story: {assets: {Spare: 'backdrop'}, scenes: {opening: []}}}],
    schema,
    {protectedSources: ['main']},
  );
  assert.deepEqual(result.removable, []);
});

test('preserves externally selected controls and checks the requested profile', () => {
  const result = auditDsl4Definitions(
    [
      {
        sourceId: 'main',
        story: {
          controls: {
            keymaps: {
              production: {Space: 'navigation.nextAction'},
              rehearsal: {Enter: 'navigation.nextScene'},
            },
          },
          scenes: {opening: []},
        },
      },
    ],
    schema,
    {controlProfile: 'production'},
  );
  assert.equal(result.ok, true);
  assert.equal(result.definitions.find((item) => item.name === 'production')?.status, 'used');
  assert.equal(result.definitions.find((item) => item.name === 'rehearsal')?.status, 'protected');
});

test('retains variable reads in nested not conditions and the built-in startSceneIndex override', () => {
  const result = audit({
    variables: {score: 1, startSceneIndex: 3, spare: 0},
    scenes: {opening: [{if: {condition: {not: 'score > 0'}, then: [{wait: 0}]}}]},
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.removable.map((entry) => entry.name),
    ['spare'],
  );
});

test('does not mistake audio/video instance identifiers for asset references', () => {
  const result = audit({
    scenes: {
      opening: [
        {audio: {id: 'voice', url: 'https://example.com/voice.mp3'}},
        {audioControl: {id: 'voice', operation: 'play'}},
        {
          video: {
            id: 'movie',
            url: 'https://example.com/movie.webm',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        },
        {videoControl: {id: 'movie', operation: 'stop'}},
      ],
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(
    result.references.some((reference) => reference.name === 'voice' || reference.name === 'movie'),
    false,
  );
});

test('audits included sources with original locations and writes idempotent cleanup into a fresh directory', async () =>
  fixture(async (root) => {
    const input = path.join(root, 'main.k4.yml');
    await mkdir(path.join(root, 'parts'));
    const main =
      "# root comment\nkamishibai: '4.0'\ninclude: parts/defs.k4.yml\nscenes:\n  opening:\n    - stage: Used\n";
    const fragment =
      '# fragment comment\nassets:\n  # keep this\n  Used: backdrop\n  Spare: sound\nactors:\n  Unused: Idle\nassetsExtra: null\n';
    await writeFile(input, main);
    await writeFile(
      path.join(root, 'parts/defs.k4.yml'),
      fragment
        .replace('  Spare: sound\n', '  Spare: sound\n  Idle: costume:Unused\n')
        .replace('assetsExtra: null\n', ''),
    );
    const readonly = await auditDsl4ProjectDefinitions({...options, input});
    assert.equal(readonly.ok, true, JSON.stringify(readonly.diagnostics));
    const unused = readonly.definitions.find((item) => item.name === 'Spare');
    assert.equal(unused?.sourceId, 'parts/defs.k4.yml');
    assert.equal(unused?.range.start.line, 5);
    const outputDir = path.join(root, 'review', 'clean');
    const cleaned = await auditDsl4ProjectDefinitions({
      ...options,
      input,
      removeUnused: true,
      outputDir,
    });
    assert.equal(cleaned.removed.length, 3);
    const rewritten = await readFile(path.join(outputDir, 'parts/defs.k4.yml'), 'utf8');
    assert.match(rewritten, /fragment comment/u);
    assert.match(rewritten, /keep this/u);
    assert.equal(await readFile(input, 'utf8'), main);
    const again = await auditDsl4ProjectDefinitions({
      ...options,
      input: path.join(outputDir, 'main.k4.yml'),
    });
    assert.deepEqual(again.removable, []);
    await assert.rejects(
      auditDsl4ProjectDefinitions({...options, input, removeUnused: true, outputDir}),
      /already exists/u,
    );
  }));

test('rejects invalid source and escaped include paths without producing cleanup output', async () =>
  fixture(async (root) => {
    const input = path.join(root, 'main.k4.yml');
    const outputDir = path.join(root, 'clean');
    await writeFile(
      input,
      "kamishibai: '4.0'\nassets:\n  Spare: sound\nscenes:\n  opening:\n    - stage: Missing\n",
    );
    const result = await auditDsl4ProjectDefinitions({
      ...options,
      input,
      removeUnused: true,
      outputDir,
    });
    assert.equal(result.ok, false);
    await assert.rejects(readFile(path.join(outputDir, 'main.k4.yml')), {code: 'ENOENT'});
    await writeFile(input, "kamishibai: '4.0'\ninclude: ../outside.k4.yml\nscenes: {}\n");
    await assert.rejects(auditDsl4ProjectDefinitions({...options, input}), /escape/u);
    const outside = path.join(root, 'outside');
    await mkdir(outside);
    await writeFile(path.join(outside, 'defs.k4.yml'), 'assets: {}\n');
    await mkdir(path.join(root, 'inside'));
    await symlink(outside, path.join(root, 'inside', 'link'));
    await writeFile(
      path.join(root, 'inside', 'main.k4.yml'),
      "kamishibai: '4.0'\ninclude: link/defs.k4.yml\nscenes: {}\n",
    );
    await assert.rejects(
      auditDsl4ProjectDefinitions({...options, input: path.join(root, 'inside', 'main.k4.yml')}),
      /escapes/u,
    );
  }));

test('CLI distinguishes implicit SB3 names from undefined names and exposes machine-readable results', async () =>
  fixture(async (root) => {
    const input = path.join(root, 'main.k4.yml');
    const base = path.join(root, 'base.sb3');
    await writeFile(
      input,
      stringify({kamishibai: '4.0', scenes: {opening: [{stage: 'Backdrop'}]}}),
    );
    await writeFile(
      base,
      zipSync({
        'project.json': strToU8(
          JSON.stringify({
            targets: [{isStage: true, name: 'Stage', costumes: [{name: 'Backdrop'}]}],
          }),
        ),
      }),
    );
    const stdout = captureWrites();
    const stderr = captureWrites();
    const result = cliResult(
      await runCli(
        ['audit-dsl4-definitions', '--input', input, '--base', base, '--format', 'json'],
        {stdout, stderr},
      ),
      'audit result',
    );
    assert.equal(result.exitCode, 0);
    const report = JSON.parse(stdout.text);
    assert.equal(report.implicitReferences.length, 1);
    assert.deepEqual(report.diagnostics, []);
    assert.equal(stderr.text, '');
    const missing = await auditDsl4ProjectDefinitions({...options, input});
    assert.equal(missing.ok, false);
    assert.throws(
      () => parseCliArguments(['audit-dsl4-definitions', '--input', input, '--remove-unused']),
      /together/u,
    );
    assert.throws(
      () => parseCliArguments(['audit-dsl4-definitions', '--input', input, '--format', 'xml']),
      /pretty or json/u,
    );
  }));

test('retains a story variable used only by a text interpolation', () => {
  const result = audit({
    assets: {Idle: 'costume:Hero'},
    actors: {Hero: 'Idle'},
    variables: {shown: 1, spare: 2},
    scenes: {
      opening: [
        {'Hero.say': {text: {interpolate: {join: ['Score ', {variable: 'shown'}]}}, seconds: 1}},
      ],
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.definitions.find((item) => item.name === 'shown')?.status, 'used');
  assert.ok(result.removable.some((item) => item.name === 'spare'));
});
