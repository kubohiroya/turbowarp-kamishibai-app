import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'vitest';

import {dsl4CliDefaultLimits, parseCliArguments, runCli, usage} from '../src/builder/cli.js';
import {captureWrites, cliDoubles, cliResult, parsedOptions} from './helpers/cli-command.ts';
import {requireRecord} from './helpers/require-value.ts';

function auditArguments(extra: readonly string[] = []) {
  return [
    'audit-dsl4-assets',
    '--project-root',
    'project',
    '--source-manifest',
    'project/project.source.yaml',
    '--asset-config',
    'project/project.assets.json',
    '--asset-lock',
    'project/project.assets.lock.json',
    '--asset-profile',
    'online',
    '--max-source-bytes',
    '16384',
    '--max-source-manifest-bytes',
    '4096',
    '--max-asset-config-bytes',
    '16384',
    '--max-asset-lock-bytes',
    '32768',
    ...extra,
  ];
}

const emptySummary = {
  assets: 0,
  logicalBytes: 0,
  embedded: {assets: 0, logicalBytes: 0},
  remote: {assets: 0, logicalBytes: 0, transportBytes: 0},
};
const auditResult = {
  formatVersion: 1,
  profile: 'online',
  network: 'allowed',
  offlineReady: true,
  totals: {...emptySummary, eager: emptySummary, lazy: emptySummary},
  byKind: {},
  preparation: {startup: {...emptySummary, ids: []}},
  scenes: {},
  duplicates: {groups: [], savingsBytes: 0},
  assets: [],
};

test('parses the finite audit-dsl4-assets CLI contract', () => {
  const options = parsedOptions(parseCliArguments(auditArguments()), 'audit-dsl4-assets');
  assert.equal(options.projectRoot, path.resolve('project'));
  assert.equal(options.assetProfile, 'online');
  assert.equal(options.format, 'pretty');
  assert.equal(options.maxAssetLockBytes, 32768);
  assert.equal(Object.hasOwn(options, 'sourceIncludesEnabled'), false);
  assert.equal(Object.hasOwn(options, 'maxSourceFiles'), false);
  const defaultSource = auditArguments();
  defaultSource.splice(defaultSource.indexOf('--max-source-bytes'), 2);
  assert.equal(
    parsedOptions(parseCliArguments(defaultSource), 'audit-dsl4-assets').maxSourceBytes,
    dsl4CliDefaultLimits.maxSourceBytes,
  );
  assert.match(usage(), /audit-dsl4-assets/u);
  assert.match(usage(), /without network access or file writes/u);

  const included = parsedOptions(
    parseCliArguments(
      auditArguments([
        '--enable-source-includes',
        '--max-source-files',
        '8',
        '--max-total-source-bytes',
        '32768',
        '--max-include-depth',
        '4',
        '--format',
        'json',
      ]),
    ),
    'audit-dsl4-assets',
  );
  assert.equal(included.maxSourceFiles, 8);
  assert.equal(included.maxTotalSourceBytes, 32768);
  assert.equal(included.maxIncludeDepth, 4);
  assert.equal(included.format, 'json');

  // Include needs no opt-in: graph limits stand alone, and the retired flag is accepted unchanged.
  assert.equal(
    parsedOptions(
      parseCliArguments(auditArguments(['--max-source-files', '8'])),
      'audit-dsl4-assets',
    ).maxSourceFiles,
    8,
  );
  assert.equal(
    Object.hasOwn(
      parsedOptions(
        parseCliArguments(auditArguments(['--enable-source-includes'])),
        'audit-dsl4-assets',
      ),
      'maxSourceFiles',
    ),
    false,
  );
  assert.throws(
    () => parseCliArguments(auditArguments(['--max-total-source-bytes', '1'])),
    /greater than or equal to --max-source-bytes/u,
  );
  assert.throws(() => parseCliArguments(auditArguments(['--format', 'yaml'])), /pretty or json/u);
  const invalidLimit = auditArguments();
  invalidLimit[invalidLimit.indexOf('--max-asset-lock-bytes') + 1] = '0';
  assert.throws(() => parseCliArguments(invalidLimit), /integer >= 1/u);
});

test('runs the audit command through an injected network-free implementation', async () => {
  let received: unknown;
  const jsonStdout = captureWrites();
  const result = await runCli(
    auditArguments(['--format', 'json']),
    {stdout: jsonStdout},
    cliDoubles({
      runAssetAudit: async (options) => {
        received = options;
        return auditResult;
      },
    }),
  );
  const auditOptions = requireRecord(received, 'the options handed to the audit runner');
  assert.equal(
    typeof requireRecord(auditOptions.sourceFrontend, 'the injected source frontend').parse,
    'function',
  );
  assert.equal(auditOptions.assetProfile, 'online');
  assert.deepEqual(JSON.parse(jsonStdout.text), auditResult);
  assert.equal(cliResult(result, 'the audit result').exitCode, 0);

  const prettyStdout = captureWrites();
  await runCli(
    auditArguments(),
    {stdout: prettyStdout},
    cliDoubles({runAssetAudit: async () => auditResult}),
  );
  assert.match(prettyStdout.text, /Asset profile: online/u);
  assert.match(prettyStdout.text, /Remote: 0/u);
});
