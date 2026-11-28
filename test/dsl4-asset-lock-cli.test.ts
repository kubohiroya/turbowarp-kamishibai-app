import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'vitest';

import {dsl4CliDefaultLimits, parseCliArguments, runCli, usage} from '../src/builder/cli.js';
import {captureWrites, cliDoubles, cliResult, parsedOptions} from './helpers/cli-command.ts';
import {requireArray, requireRecord} from './helpers/require-value.ts';

function lockArguments(extra: readonly string[] = []) {
  return [
    'lock-dsl4-assets',
    '--project-root',
    'project',
    '--source-manifest',
    'project/project.source.yaml',
    '--asset-config',
    'project/project.assets.json',
    '--output',
    'project/project.assets.lock.json',
    '--allow-host',
    'cdn.example.com',
    '--max-source-bytes',
    '16384',
    '--max-source-manifest-bytes',
    '4096',
    '--max-asset-file-bytes',
    '16384',
    '--max-asset-files',
    '16',
    '--max-total-asset-bytes',
    '131072',
    '--timeout-ms',
    '1000',
    '--max-redirects',
    '2',
    ...extra,
  ];
}

function vendorArguments(extra: readonly string[] = []) {
  return [
    'vendor-dsl4-assets',
    '--project-root',
    'project',
    '--asset-config',
    'project/project.assets.json',
    '--asset-lock',
    'project/project.assets.lock.json',
    '--output-config',
    'project/project.assets.offline.json',
    '--output-lock',
    'project/project.assets.offline.lock.json',
    '--allow-host',
    'cdn.example.com',
    '--max-asset-config-bytes',
    '16384',
    '--max-asset-lock-bytes',
    '65536',
    '--max-asset-file-bytes',
    '16384',
    '--max-asset-files',
    '16',
    '--max-total-asset-bytes',
    '131072',
    '--timeout-ms',
    '1000',
    '--max-redirects',
    '2',
    ...extra,
  ];
}

test('parses bounded lock-dsl4-assets options and rejects unbounded input', () => {
  const options = parsedOptions(
    parseCliArguments(lockArguments(['--allow-host', 'mirror.example.com'])),
    'lock-dsl4-assets',
  );
  assert.equal(options.projectRoot, path.resolve('project'));
  assert.deepEqual(options.allowedHosts, ['cdn.example.com', 'mirror.example.com']);
  assert.equal(options.maxRedirects, 2);
  assert.match(usage(), /lock-dsl4-assets/u);
  assert.match(usage(), /allowlisted HTTPS/u);
  const defaultedLock = lockArguments();
  for (const option of [
    '--max-source-bytes',
    '--max-asset-file-bytes',
    '--max-asset-files',
    '--max-total-asset-bytes',
  ]) {
    defaultedLock.splice(defaultedLock.indexOf(option), 2);
  }
  const defaultedLockOptions = parsedOptions(parseCliArguments(defaultedLock), 'lock-dsl4-assets');
  assert.deepEqual(
    {
      maxSourceBytes: defaultedLockOptions.maxSourceBytes,
      maxAssetFileBytes: defaultedLockOptions.maxAssetFileBytes,
      maxAssetFiles: defaultedLockOptions.maxAssetFiles,
      maxTotalAssetBytes: defaultedLockOptions.maxTotalAssetBytes,
    },
    dsl4CliDefaultLimits,
  );

  assert.throws(
    () =>
      parseCliArguments(
        lockArguments().filter((value) => value !== '--allow-host' && value !== 'cdn.example.com'),
      ),
    /Missing required option: --allow-host/u,
  );
  const badRedirects = lockArguments();
  badRedirects[badRedirects.indexOf('--max-redirects') + 1] = '-1';
  assert.throws(() => parseCliArguments(badRedirects), /integer >= 0/u);
  assert.equal(
    parsedOptions(parseCliArguments(lockArguments(['--max-source-files', '8'])), 'lock-dsl4-assets')
      .maxSourceFiles,
    8,
  );
});

test('dispatches lock generation through the production source frontend and reports output', async () => {
  const stdout = captureWrites();
  let received: unknown;
  const result = await runCli(
    lockArguments(),
    {stdout},
    cliDoubles({
      runAssetLock: async (options) => {
        received = options;
        return {outputPath: path.resolve('project/project.assets.lock.json'), lock: {}};
      },
    }),
  );
  const lockOptions = requireRecord(received, 'the options handed to the lock runner');
  assert.equal(
    typeof requireRecord(lockOptions.sourceFrontend, 'the injected source frontend').parse,
    'function',
  );
  assert.equal(requireArray(lockOptions.allowedHosts, 'allowedHosts')[0], 'cdn.example.com');
  assert.equal(
    cliResult(result, 'the lock result').outputPath,
    path.resolve('project/project.assets.lock.json'),
  );
  assert.equal(stdout.text, 'Locked project.assets.lock.json\n');
});

test('parses and dispatches vendor-dsl4-assets with explicit finite limits', async () => {
  const vendorOptions = parsedOptions(
    parseCliArguments(vendorArguments(['--vendor-dir', '.cache/assets'])),
    'vendor-dsl4-assets',
  );
  assert.equal(vendorOptions.vendorDirectory, '.cache/assets');
  assert.equal(vendorOptions.maxAssetLockBytes, 65536);
  const defaultedVendor = vendorArguments();
  for (const option of ['--max-asset-file-bytes', '--max-asset-files', '--max-total-asset-bytes']) {
    defaultedVendor.splice(defaultedVendor.indexOf(option), 2);
  }
  const defaultedVendorOptions = parsedOptions(
    parseCliArguments(defaultedVendor),
    'vendor-dsl4-assets',
  );
  assert.deepEqual(
    {
      maxAssetFileBytes: defaultedVendorOptions.maxAssetFileBytes,
      maxAssetFiles: defaultedVendorOptions.maxAssetFiles,
      maxTotalAssetBytes: defaultedVendorOptions.maxTotalAssetBytes,
    },
    {
      maxAssetFileBytes: dsl4CliDefaultLimits.maxAssetFileBytes,
      maxAssetFiles: dsl4CliDefaultLimits.maxAssetFiles,
      maxTotalAssetBytes: dsl4CliDefaultLimits.maxTotalAssetBytes,
    },
  );
  assert.match(usage(), /vendor-dsl4-assets/u);
  const stdout = captureWrites();
  let received: unknown;
  const result = await runCli(
    vendorArguments(),
    {stdout},
    cliDoubles({
      runAssetVendor: async (options) => {
        received = options;
        return {vendoredAssets: ['Logo']};
      },
    }),
  );
  const vendorRunnerOptions = requireRecord(received, 'the options handed to the vendor runner');
  assert.equal(
    requireArray(vendorRunnerOptions.allowedHosts, 'allowedHosts')[0],
    'cdn.example.com',
  );
  assert.equal(
    requireArray(cliResult(result, 'the vendor result').vendoredAssets, 'vendoredAssets').length,
    1,
  );
  assert.equal(stdout.text, 'Vendored 1 asset(s)\n');
});
