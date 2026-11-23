import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {test} from 'vitest';
import {dsl4TestSourceFrontend} from './helpers/dsl4-test-frontend.ts';
import {normalizeDsl4DiagnosticSequence} from '../src/dsl4/diagnostic-sequence-policy.js';
import {
  createDsl4DiagnosticUiProjection,
  redactDsl4DiagnosticTelemetry,
} from '../src/dsl4/diagnostic-projection.js';
import {
  createRuntimeErrorPresentation,
  formatRuntimeErrorReport,
} from '../src/dsl4/platform/runtime-error-presentation.js';
import {dsl4RuntimeErrorRemedy} from '../src/dsl4/platform/runtime-error-remedies.js';
import {
  runtimeErrorCauses,
  createRuntimeFailureContext,
} from '../src/dsl4/runtime-error-context.js';
import {createDsl4StructuredBlockSourceDeclaration} from '../src/dsl4/structured-block-source.js';
import {extractDsl4BlockSourcesFromProject} from '../src/dsl4/turbowarp-yaml-json-block-source.js';
import {createDsl4RuntimeBlockDiagnosticLocator} from '../src/dsl4/platform/runtime-block-diagnostic.js';
import type {Dsl4BlockErrorHost} from '../src/dsl4/platform/block-error-location.js';

test('Schema violations retain correction details through canonical normalization and UI projection', () => {
  const result = dsl4TestSourceFrontend.parse(
    "kamishibai: '4.0'\nscenes: {}\nunknownField: true\n",
    {sourceId: 'story.kamishibai.yaml'},
  );
  assert.equal(result.ok, false);
  const diagnostic = result.diagnostics.find(
    (item) => item.validation?.keyword === 'additionalProperties',
  );
  assert.ok(diagnostic);
  assert.equal(diagnostic.validation?.field, 'unknownField');
  const normalized = normalizeDsl4DiagnosticSequence([diagnostic], {
    maxDiagnostics: 10,
    maxRelatedLocations: 8,
  });
  const projected = createDsl4DiagnosticUiProjection(normalized.diagnostics, {
    canonicalSource: result.canonicalSource,
    displayName: 'story.kamishibai.yaml',
  }).diagnostics[0]!;
  assert.equal(projected.validation?.field, 'unknownField');
  assert.match(
    createRuntimeErrorPresentation(projected, 'ja').explanation,
    /unknownField.*使えません/u,
  );
  assert.equal(
    Object.hasOwn(
      redactDsl4DiagnosticTelemetry(diagnostic as unknown as Record<string, unknown>),
      'validation',
    ),
    false,
  );
  assert.throws(
    () =>
      normalizeDsl4DiagnosticSequence(
        [{...diagnostic, validation: {keyword: 'type', actualValue: 'secret'}}],
        {maxDiagnostics: 10, maxRelatedLocations: 8},
      ),
    /unknown/u,
  );
});

test('required and type violations explain the correction without translating English messages', () => {
  for (const locale of ['ja', 'en'] as const) {
    const missing = createRuntimeErrorPresentation(
      {
        code: 'K4-SCHEMA-001',
        message: 'unrelated',
        validation: {keyword: 'required', field: 'seconds'},
      },
      locale,
    );
    assert.match(missing.explanation, /seconds/u);
    assert.match(missing.recovery, /seconds/u);
    const typed = createRuntimeErrorPresentation(
      {code: 'K4-SCHEMA-001', validation: {keyword: 'type', expected: 'number'}},
      locale,
    );
    assert.match(typed.explanation, locale === 'ja' ? /数値/u : /number/u);
  }
});

test('unknown failures stay uncertain and non-camera permission errors are not labelled camera failures', () => {
  const unknown = createRuntimeErrorPresentation({message: 'Failed to fetch'}, 'ja');
  assert.match(unknown.explanation, /特定できません/u);
  assert.doesNotMatch(unknown.explanation, /通信|台本.*不正/u);
  assert.doesNotMatch(
    createRuntimeErrorPresentation({name: 'NotAllowedError'}, 'ja').title,
    /カメラ/u,
  );
  const camera = createRuntimeErrorPresentation(
    {failureContext: {command: 'pose', causes: [{name: 'NotAllowedError'}]}},
    'ja',
  );
  assert.match(camera.title, /カメラ.*許可/u);
});

test('reports human-readable locations and preserves generated source identity', () => {
  const view = createRuntimeErrorPresentation(
    {
      storyPath: '/scenes/道~1帰り/actions/2',
      sourceId: 'Stage.kamishibai.yaml',
      range: {start: {line: 10, column: 3}},
      generatedSource: true,
      blockName: '背景を変える',
      targetName: '案内役',
      failureContext: {command: 'backdrop', assetId: '夕焼け'},
    },
    'ja',
  );
  for (const part of ['道/帰り', '3番目', '背景を変える', '夕焼け', '案内役', '生成台本', '10行'])
    assert(view.place.includes(part));
});

test('cause chains are bounded, redact credentials and paths, and never serialize unrelated values', () => {
  const inner = new Error(
    'load https://user:pass@example.com/assets/a.svg?token=private#fragment from /Users/alice/private.sb3 apiKey=secret',
  );
  const outer = Object.assign(new Error('operation failed', {cause: inner}), {
    code: 'K4-ASSET-PREPARE-001',
    project: 'whole-project-secret',
  });
  Object.defineProperty(inner, 'cause', {value: outer});
  const causes = runtimeErrorCauses(outer);
  assert.equal(causes.length, 2);
  const failureContext = createRuntimeFailureContext(
    outer,
    {id: 'opening'},
    {command: 'backdrop', args: {asset: '夕焼け', text: 'private-script'}},
    0,
  );
  const report = formatRuntimeErrorReport(
    {
      message: outer.message,
      code: outer.code,
      failureContext,
      absolutePath: '/Users/alice/private',
      sessionToken: 'secret-token',
    },
    'ja',
    'test-version',
  );
  for (const secret of [
    'user:pass',
    'token=private',
    'fragment',
    '/Users/alice',
    'apiKey=secret',
    'whole-project-secret',
    'private-script',
    'secret-token',
  ])
    assert(!report.includes(secret), secret);
  assert.match(report, /test-version/u);
  assert.match(report, /夕焼け/u);
  assert.match(report, /example.com\/assets\/a.svg/u);
});

test('runtime source ranges resolve to original blocks and reject replaced or switched projects', () => {
  const blocks = createDsl4StructuredBlockSourceDeclaration({
    source: {kamishibai: '4.0', scenes: {opening: [{wait: 0}]}},
    form: 'bundle',
    hatId: 'root',
  });
  const target = {
    id: 'stage',
    isStage: true,
    getName: () => 'Stage',
    blocks: {getBlock: (id: string) => blocks[id]},
  };
  const host: Dsl4BlockErrorHost = {vm: {runtime: {targets: [target]}}};
  const sources = extractDsl4BlockSourcesFromProject({
    targets: [{name: 'Stage', isStage: true, blocks}],
  });
  const parsed = dsl4TestSourceFrontend.parse(sources.sources[sources.entryPath]!, {
    sourceId: sources.entryPath,
  });
  assert(parsed.ok);
  const diagnostic = {
    code: 'K4-RUNTIME-ACTION-001',
    sourceId: sources.entryPath,
    range: (parsed.storyDocument.sourceMap as Record<string, unknown>)['/scenes/opening/actions/0'],
  };
  const locate = createDsl4RuntimeBlockDiagnosticLocator(sources, host);
  const result = locate(diagnostic);
  assert.equal(result.targetName, 'Stage');
  const blockId = String(result.blockId);
  assert(blocks[blockId] && blockId !== 'root');
  assert.equal(result.generatedSource, true);
  blocks[blockId] = {...blocks[blockId]!};
  assert.equal(locate(diagnostic).blockId, undefined);
  host.vm.runtime = {targets: []};
  assert.equal(locate(diagnostic).blockId, undefined);
});

test('union validation does not prescribe the type of a rejected alternative', () => {
  const parsed = dsl4TestSourceFrontend.parse(
    "kamishibai: '4.0'\nassets:\n  Broken: {kind: invalid-kind, name: Menu}\nscenes: {opening: [{wait: 0}]}\n",
  );
  const first = parsed.diagnostics[0]!;
  assert.equal(first.validation?.alternative, true);
  const view = createRuntimeErrorPresentation(first as unknown as Record<string, unknown>, 'ja');
  assert.doesNotMatch(view.explanation, /文字列を指定/u);
  assert.match(view.recovery, /候補形式/u);
});

test('script mistakes name the correction instead of reporting an undetermined cause', () => {
  const expected: [string, RegExp][] = [
    ['K4-INCLUDE-CYCLE', /include/u],
    ['K4-INCLUDE-LIMIT-001', /include/u],
    ['K4-INCLUDE-ROOT-ONLY', /include/u],
    ['K4-DEFINITION-UNDEFINED', /定義/u],
    ['K4-DEFINITION-DUPLICATE', /名前を変え/u],
    ['K4-REF-003', /コスチューム/u],
    ['K4-REF-002', /種類/u],
    ['K4-BRANCH-001', /else/u],
    ['K4-STABLE-ID-001', /stableId/u],
    ['K4-ID-INVALID', /NFC/u],
    ['K4-KEY-UNSUPPORTED', /KeyA/u],
    ['K4-KEY-001', /別のキー/u],
    ['K4-SCENE-LIMIT-001', /include/u],
    ['K4-YAML-LIMIT-DEPTH-001', /include/u],
    ['K4-VERSION-001', /4\.0/u],
    ['K4-NARRATIVE-VERSION-001', /4\.0/u],
    ['K4-ASSET-001', /相対パス/u],
    ['K4-ASSET-REMOTE-URL-001', /https/u],
    ['K4-ASSET-IMAGE-MIME-001', /image\//u],
    ['K4-ASSET-REMOTE-CORS-001', /CORS/u],
    ['K4-SOURCE-UTF8-001', /UTF-8/u],
    ['K4-SOURCE-SIZE-001', /include/u],
    ['K4-SOURCE-AMBIGUOUS', /1つ/u],
    ['K4-SOURCE-URL-DISABLED', /取り込/u],
    ['K4-ROOT-MISSING', /ステージ/u],
    ['K4-ROOT-DUPLICATE', /削除/u],
    ['K4-EXPRESSION-SYNTAX-001', /括弧/u],
    ['K4-EXPRESSION-VARIABLE-UNKNOWN', /変数名/u],
    ['K4-VARIABLE-WRITE-UNKNOWN', /変数/u],
    ['K4-VARIABLE-WRITE-TYPE', /型/u],
    ['K4-VARIABLE-WRITE-INACTIVE', /再生/u],
    ['K4-COMMAND-UNSUPPORTED', /拡張/u],
    ['K4-CUSTOM-ARGUMENT-UNKNOWN', /引数/u],
    ['K4-VIDEO-AUTOPLAY', /タップ/u],
    ['K4-VIDEO-LIMIT', /止める/u],
    ['K4-SPEECH-STYLE-002', /一方/u],
    ['K4-BUBBLE-STYLE-CYCLE-001', /styles/u],
    ['K4-POSE-MODEL-001', /recognitionModel/u],
    ['K4-SAVE-SLOT-LIMIT', /消して/u],
    ['K4-WEB-PREVIEW-INSECURE-CONTEXT', /localhost/u],
    ['K4-WEB-PREVIEW-PERMISSION-DENIED', /許可/u],
    ['K4-PREVIEW-CONTROL-ASSET-001', /eager/u],
    ['K4-DIAGNOSTICS-TRUNCATED', /先頭/u],
    ['K4-VIEWPORT-001', /0より大き/u],
  ];
  for (const [code, correction] of expected) {
    const view = createRuntimeErrorPresentation({code}, 'ja');
    assert.doesNotMatch(view.explanation, /特定できません/u, code);
    assert.match(view.recovery, correction, code);
    const english = createRuntimeErrorPresentation({code}, 'en');
    assert.doesNotMatch(english.explanation, /could not be determined/u, code);
    for (const part of [english.title, english.explanation, english.recovery])
      assert.doesNotMatch(part, /[ぁ-んァ-ン一-龥]/u, `${code}: ${part}`);
  }
});

test('a specific code is explained before the family it belongs to', () => {
  const family = createRuntimeErrorPresentation({code: 'K4-ASSET-DECODE-001'}, 'ja');
  for (const code of ['K4-ASSET-001', 'K4-ASSET-REMOTE-URL-001', 'K4-ASSET-PATH-001'])
    assert.notEqual(createRuntimeErrorPresentation({code}, 'ja').recovery, family.recovery, code);
  const schema = createRuntimeErrorPresentation(
    {code: 'K4-SCHEMA-001', validation: {keyword: 'propertyNames'}},
    'ja',
  );
  assert.notEqual(
    createRuntimeErrorPresentation(
      {code: 'K4-ID-INVALID', validation: {keyword: 'propertyNames'}},
      'ja',
    ).recovery,
    schema.recovery,
  );
});

test('an unexplained failure keeps the cause open and still lists what to try', () => {
  for (const locale of ['ja', 'en'] as const) {
    const view = createRuntimeErrorPresentation({code: 'K4-NOT-IN-THE-CATALOG'}, locale);
    assert.match(
      view.explanation,
      locale === 'ja' ? /特定できません/u : /could not be determined/u,
    );
    assert.match(view.recovery, /1\..*\n2\..*\n3\./su);
    assert.match(view.recovery, locale === 'ja' ? /診断情報をコピー/u : /diagnostic information/u);
  }
  // A reported field still explains the correction when its code is not in the catalog.
  const field = createRuntimeErrorPresentation(
    {code: 'K4-NOT-IN-THE-CATALOG', validation: {keyword: 'required', field: 'seconds'}},
    'ja',
  );
  assert.match(field.explanation, /seconds/u);
  assert.match(field.recovery, /seconds/u);
});

test('every diagnostic code the runtime raises resolves to a correction', () => {
  const codes = new Set<string>();
  const walk = (directory: URL) => {
    for (const entry of readdirSync(directory, {withFileTypes: true})) {
      if (entry.name === 'generated') continue;
      const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith('.ts'))
        for (const match of readFileSync(child, 'utf8').matchAll(/'(K4-[A-Z0-9-]{3,})'/gu))
          codes.add(match[1]!);
    }
  };
  walk(new URL('../src/dsl4/', import.meta.url));
  assert(codes.size > 400, `found ${codes.size} codes`);
  const missing = [...codes].filter(
    (code) =>
      dsl4RuntimeErrorRemedy({
        code,
        outerCode: code,
        codes: [code],
        names: [],
        command: '',
        cameraOperation: false,
      }) === null,
  );
  assert.deepEqual(missing, [], `codes without a correction: ${missing.join(', ')}`);
});
