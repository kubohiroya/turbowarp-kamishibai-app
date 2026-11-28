import assert from 'node:assert/strict';
import type {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'vitest';

import {dsl4CliDefaultLimits, parseCliArguments, runCli, usage} from '../src/builder/cli.js';
import {
  openDsl4LocalPreviewBrowser,
  runDsl4LocalPreviewCommand,
} from '../src/builder/dsl4-local-preview-command.js';
import {thrown} from './helpers/thrown-error.ts';
import {requireDefined, requireRecord} from './helpers/require-value.ts';
import {captureWrites, cliDoubles, parsedOptions} from './helpers/cli-command.ts';
import {getDsl4CreationCleanup} from '../src/dsl4/creation-cleanup.js';
import {failedFactory} from './helpers/failed-factory.ts';
import {deferred} from './helpers/async-test-helpers.ts';

const limits = Object.freeze({
  maxSourceBytes: 16 * 1024,
  maxAssetFileBytes: 4096,
  maxAssetFiles: 10,
  maxTotalAssetBytes: 16 * 1024,
});

test('command hands off failed host cleanup for explicit retry after its signal listeners close', async () => {
  const captured = captureIo();
  const fixture = createCommandFixture({
    onOpen({emit, signalTarget}) {
      queueMicrotask(() => emit({type: 'local-preview.runtime-ready'}));
      setImmediate(() => signalTarget.emit('SIGINT'));
    },
  });
  let broken = true,
    releases = 0;
  let failure: unknown;
  try {
    await runDsl4LocalPreviewCommand(defaultCommandOptions(), {
      ...fixture.dependencies,
      ...captured.io,
      createHost(options: HostOptions) {
        const host = fixture.dependencies.createHost(options);
        return {
          ...host,
          async dispose() {
            releases++;
            if (broken) throw new Error('host cleanup failed');
          },
        };
      },
    });
  } catch (error) {
    failure = error;
  }
  const cleanup = getDsl4CreationCleanup(failure);
  assert.ok(cleanup);
  assert.equal(releases, 1);
  assert.equal(fixture.dependencies.signalTarget.listenerCount('SIGINT'), 0);
  assert.equal(fixture.dependencies.signalTarget.listenerCount('SIGTERM'), 0);
  assert.equal(cleanup.hasPendingCleanup(), true);
  broken = false;
  await cleanup.dispose();
  assert.equal(releases, 2);
  assert.equal(cleanup.hasPendingCleanup(), false);
});

for (const inspectionFails of [false, true]) {
  test(`command hands off a resolved host disposal with ${inspectionFails ? 'a failing pending inspection' : 'pending cleanup'}`, async () => {
    const captured = captureIo();
    const fixture = createCommandFixture({
      onOpen({emit, signalTarget}) {
        queueMicrotask(() => emit({type: 'local-preview.runtime-ready'}));
        setImmediate(() => signalTarget.emit('SIGINT'));
      },
    });
    let broken = true,
      pending = true,
      releases = 0;
    const failure = await runDsl4LocalPreviewCommand(defaultCommandOptions(), {
      ...fixture.dependencies,
      ...captured.io,
      createHost(options: HostOptions) {
        return {
          ...fixture.dependencies.createHost(options),
          async dispose() {
            releases++;
            if (!broken) pending = false;
          },
          hasPendingCleanup() {
            if (inspectionFails && releases > 0 && broken)
              throw new Error('host inspection failed');
            return pending;
          },
        };
      },
    }).then(
      () => assert.fail('pending host must be handed back instead of returning success'),
      (error: unknown) => error,
    );
    const cleanup = getDsl4CreationCleanup(failure);
    assert.ok(cleanup);
    assert.equal(cleanup.hasPendingCleanup(), true);
    assert.equal(releases, 1);
    assert.equal(fixture.signalTarget.listenerCount('SIGINT'), 0);
    assert.equal(fixture.signalTarget.listenerCount('SIGTERM'), 0);

    broken = false;
    await cleanup.dispose();
    assert.equal(cleanup.hasPendingCleanup(), false);
    assert.equal(releases, 2);
  });
}

function previewArguments(extra: string[] = []) {
  return [
    'preview-dsl4',
    '--watch',
    '--base',
    '/project/base.sb3',
    '--project-root',
    '/project',
    '--source-manifest',
    '/project/project.source.yaml',
    '--control-profile',
    'production',
    '--channel',
    'bundled',
    '--max-source-bytes',
    String(limits.maxSourceBytes),
    '--max-asset-file-bytes',
    String(limits.maxAssetFileBytes),
    '--max-asset-files',
    String(limits.maxAssetFiles),
    '--max-total-asset-bytes',
    String(limits.maxTotalAssetBytes),
    ...extra,
  ];
}

function withoutDefaultLimitOptions(arguments_: string[]) {
  const options = new Set([
    '--max-source-bytes',
    '--max-asset-file-bytes',
    '--max-asset-files',
    '--max-total-asset-bytes',
  ]);
  const result: string[] = [];
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = requireDefined(arguments_[index], `argument ${index}`);
    if (options.has(argument)) {
      index += 1;
    } else {
      result.push(argument);
    }
  }
  return result;
}

function commandOptions(extra: string[] = []) {
  return {
    ...parsedOptions(parseCliArguments(previewArguments(extra)), 'preview-dsl4'),
    sourceFrontend: {parse() {}},
  };
}

function defaultCommandOptions() {
  return {
    ...parsedOptions(
      parseCliArguments(withoutDefaultLimitOptions(previewArguments())),
      'preview-dsl4',
    ),
    sourceFrontend: {parse() {}},
  };
}

function captureIo() {
  const stdout = captureWrites();
  const stderr = captureWrites();
  return {
    io: {stdout, stderr},
    get stdout() {
      return stdout.text;
    },
    get stderr() {
      return stderr.text;
    },
  };
}

/** One preview event the fake browser client emits back to the host. */
interface PreviewEvent {
  type: string;
}

/** The host options the CLI hands its preview host factory. */
interface HostOptions extends Record<string, unknown> {
  onEvent(event: PreviewEvent): void;
}

function createCommandFixture({
  onOpen,
  start,
}: {
  onOpen?: (client: {emit(event: PreviewEvent): void; signalTarget: EventEmitter}) => unknown;
  start?: (signalTarget: EventEmitter) => unknown;
} = {}) {
  const signalTarget = new EventEmitter();
  const origin = 'http://127.0.0.1:45123';
  const token = 'A'.repeat(43);
  let hostOptions: HostOptions | undefined;
  let runtimeOptions: Record<string, unknown> | undefined;
  let browserRuntimeReady = false;
  let disposeCount = 0;
  let openCount = 0;
  const dependencies = {
    signalTarget,
    readyTimeoutMs: 100,
    async resolveProjectSource(options: Record<string, unknown>) {
      return {
        manifest: {
          formatVersion: 1,
          mode: 'external',
          sourceId: options.sourceId ?? 'main',
          path: options.source ?? 'story.k4.yml',
        },
        manifestPath: options.sourceManifest ?? null,
        manifestFilename:
          typeof options.sourceManifest === 'string' ? path.basename(options.sourceManifest) : null,
        manifestExists: options.sourceManifest !== undefined,
      };
    },
    async readFile(filePath: string) {
      return filePath.endsWith('project.source.yaml')
        ? Buffer.from('formatVersion: 1\nmode: external\nsourceId: main\npath: story.k4.yml\n')
        : Buffer.from('base');
    },
    async buildRuntime(options: Record<string, unknown>) {
      runtimeOptions = options;
      return {bytes: Uint8Array.of(1, 2, 3)};
    },
    async buildBrowserBundle() {
      return Uint8Array.of(4, 5, 6);
    },
    createHost(options: HostOptions) {
      hostOptions = options;
      return {
        start: start
          ? () => start(signalTarget)
          : async () => ({origin, browserRuntimeReady: false}),
        getLaunchUrl: () => `${origin}/#${token}`,
        getSnapshot: () => ({origin, browserRuntimeReady}),
        async dispose() {
          disposeCount += 1;
        },
      };
    },
    async openBrowser(launchUrl: string) {
      openCount += 1;
      assert.equal(launchUrl, `${origin}/#${token}`);
      await onOpen?.({
        emit(event: PreviewEvent) {
          if (event.type === 'local-preview.runtime-ready') browserRuntimeReady = true;
          if (
            event.type === 'local-preview.full-rebuild-required' ||
            event.type === 'local-preview.transport-disconnected'
          ) {
            browserRuntimeReady = false;
          }
          requireDefined(hostOptions, 'the preview host options').onEvent(event);
        },
        signalTarget,
      });
    },
  };
  return {
    dependencies,
    signalTarget,
    get disposeCount() {
      return disposeCount;
    },
    get openCount() {
      return openCount;
    },
    get hostOptions() {
      return requireDefined(hostOptions, 'the preview host options');
    },
    get runtimeOptions() {
      return requireDefined(runtimeOptions, 'the runtime build options');
    },
  };
}

for (const boundary of ['input', 'build'] as const) {
  test(`command retains both failed ${boundary} factories including a delayed second failure`, async () => {
    const first = failedFactory(),
      second = failedFactory(),
      gate = deferred();
    const fixture = createCommandFixture();
    const captured = captureIo();
    const failFirst = () => {
      queueMicrotask(() => gate.resolve());
      throw first.failure;
    };
    const failSecond = async () => {
      await gate.promise;
      throw second.failure;
    };
    const failure = await runDsl4LocalPreviewCommand(defaultCommandOptions(), {
      ...fixture.dependencies,
      ...captured.io,
      ...(boundary === 'input'
        ? {readFile: failFirst, resolveProjectSource: failSecond}
        : {buildRuntime: failFirst, buildBrowserBundle: failSecond}),
    }).catch((error: unknown) => error);
    const cleanup = getDsl4CreationCleanup(failure);
    assert.ok(cleanup);
    assert.equal(first.release.mock.calls.length, 1);
    assert.equal(second.release.mock.calls.length, 1);
    assert.equal(fixture.signalTarget.listenerCount('SIGINT'), 0);
    assert.equal(fixture.signalTarget.listenerCount('SIGTERM'), 0);
    first.repair();
    await assert.rejects(cleanup.dispose(), AggregateError);
    assert.equal(first.release.mock.calls.length, 2);
    assert.equal(second.release.mock.calls.length, 2);
    second.repair();
    await cleanup.dispose();
    assert.equal(first.release.mock.calls.length, 2);
    assert.equal(second.release.mock.calls.length, 3);
    assert.equal(cleanup.hasPendingCleanup(), false);
  });
}

for (const failedBuild of ['runtime', 'bundle'] as const) {
  test(`command clears the successful sibling bytes when ${failedBuild} factory fails`, async () => {
    const child = failedFactory(),
      bytes = Uint8Array.of(1, 2, 3);
    const fixture = createCommandFixture();
    const failure = await runDsl4LocalPreviewCommand(defaultCommandOptions(), {
      ...fixture.dependencies,
      ...captureIo().io,
      buildRuntime: async () => {
        if (failedBuild === 'runtime') throw child.failure;
        return {bytes};
      },
      buildBrowserBundle: async () => {
        if (failedBuild === 'bundle') throw child.failure;
        return bytes;
      },
    }).catch((error: unknown) => error);
    assert.deepEqual([...bytes], [0, 0, 0]);
    assert.equal(child.release.mock.calls.length, 1);
    child.repair();
    await getDsl4CreationCleanup(failure)!.dispose();
  });
}

test('allows preview presentation effects only with the explicit opt-in', () => {
  const defaults = parsedOptions(parseCliArguments(previewArguments()), 'preview-dsl4');
  assert.equal(
    (defaults.featureFlags as Record<string, unknown> | undefined)?.dsl4PresentationEffects,
    undefined,
  );
  const optedIn = parsedOptions(
    parseCliArguments(previewArguments(['--enable-presentation-effects'])),
    'preview-dsl4',
  );
  assert.deepEqual(optedIn.featureFlags, {dsl4Runtime: true, dsl4PresentationEffects: true});
});

test('parses preview-dsl4 defaults and rejects unsafe arguments', () => {
  const parsed = parseCliArguments(previewArguments(['--port', '0', '--replace-existing']));
  assert.equal(parsed.action, 'preview-dsl4');
  assert.equal(parsed.options.watch, true);
  assert.equal(parsed.options.port, 0);
  assert.equal(parsed.options.replaceExisting, true);
  assert.match(usage(), /preview-dsl4 --watch/u);
  const defaulted = parsedOptions(
    parseCliArguments(withoutDefaultLimitOptions(previewArguments())),
    'preview-dsl4',
  );
  assert.deepEqual(
    {
      maxSourceBytes: defaulted.maxSourceBytes,
      maxAssetFileBytes: defaulted.maxAssetFileBytes,
      maxAssetFiles: defaulted.maxAssetFiles,
      maxTotalAssetBytes: defaulted.maxTotalAssetBytes,
    },
    dsl4CliDefaultLimits,
  );

  assert.throws(
    () => parseCliArguments(previewArguments().filter((value) => value !== '--watch')),
    /Missing required option: --watch/u,
  );
  assert.throws(() => parseCliArguments(previewArguments(['--port', '65536'])), /0 and 65535/u);
  assert.throws(
    () => parseCliArguments(previewArguments(['--watch'])),
    /Duplicate option: --watch/u,
  );
  const excessiveSource = previewArguments();
  excessiveSource[excessiveSource.indexOf('--max-source-bytes') + 1] = String(
    dsl4CliDefaultLimits.maxSourceBytes + 1,
  );
  assert.throws(() => parseCliArguments(excessiveSource), /must be <= 1048576/u);
  const excessiveFile = previewArguments();
  excessiveFile[excessiveFile.indexOf('--max-asset-file-bytes') + 1] = '20000';
  assert.throws(
    () => parseCliArguments(excessiveFile),
    /max-asset-file-bytes must be <= --max-total-asset-bytes/u,
  );

  const includedOptions = parsedOptions(
    parseCliArguments(
      previewArguments([
        '--enable-source-includes',
        '--max-source-files',
        '8',
        '--max-total-source-bytes',
        '32768',
        '--max-include-depth',
        '4',
      ]),
    ),
    'preview-dsl4',
  );
  // Include needs no opt-in; the retired flag is accepted and the limits are passed through.
  assert.equal(includedOptions.featureFlags, undefined);
  assert.equal(includedOptions.maxSourceFiles, 8);
  assert.equal(includedOptions.maxTotalSourceBytes, 32768);
  assert.equal(includedOptions.maxIncludeDepth, 4);
  assert.equal(
    Object.hasOwn(
      parsedOptions(
        parseCliArguments(previewArguments(['--enable-source-includes'])),
        'preview-dsl4',
      ),
      'maxSourceFiles',
    ),
    false,
  );
  assert.equal(
    parsedOptions(parseCliArguments(previewArguments(['--max-source-files', '8'])), 'preview-dsl4')
      .maxSourceFiles,
    8,
  );

  const recommendedTotalAssetBytes = 128 * 1024 * 1024;
  const maximumAssets = previewArguments();
  maximumAssets[maximumAssets.indexOf('--max-asset-file-bytes') + 1] = String(
    recommendedTotalAssetBytes,
  );
  maximumAssets[maximumAssets.indexOf('--max-total-asset-bytes') + 1] = String(
    recommendedTotalAssetBytes,
  );
  assert.equal(
    parsedOptions(parseCliArguments(maximumAssets), 'preview-dsl4').maxTotalAssetBytes,
    recommendedTotalAssetBytes,
  );
  maximumAssets[maximumAssets.indexOf('--max-total-asset-bytes') + 1] = String(
    recommendedTotalAssetBytes + 1,
  );
  assert.throws(
    () => parseCliArguments(maximumAssets),
    /requires --allow-large-preview-artifacts/u,
  );
  const acknowledged = parsedOptions(
    parseCliArguments([
      ...maximumAssets,
      '--allow-large-preview-artifacts',
      '--max-project-bytes',
      String(300 * 1024 * 1024),
      '--max-project-json-bytes',
      String(400 * 1024 * 1024),
    ]),
    'preview-dsl4',
  );
  assert.equal(acknowledged.allowLargePreviewArtifacts, true);
  assert.equal(acknowledged.maxTotalAssetBytes, recommendedTotalAssetBytes + 1);
  assert.equal(acknowledged.maxProjectBytes, 300 * 1024 * 1024);
  assert.equal(acknowledged.maxProjectJsonBytes, 400 * 1024 * 1024);
});

test('runCli delegates preview only with the production frontend and selected IO', async () => {
  const captured = captureIo();
  let delegated:
    {options: Record<string, unknown>; dependencies: Record<string, unknown>} | undefined;
  const result = await runCli(
    withoutDefaultLimitOptions(previewArguments()),
    captured.io,
    cliDoubles({
      runPreview: (async (
        options: Record<string, unknown>,
        dependencies: Record<string, unknown>,
      ) => {
        delegated = {options, dependencies};
        return {exitCode: 0, reason: 'test'};
      }) as (options: unknown) => Promise<unknown>,
    }),
  );
  assert.deepEqual(result, {exitCode: 0, reason: 'test'});
  const previewCall = requireDefined(delegated, 'the delegated preview call');
  assert.equal(
    typeof requireRecord(previewCall.options.sourceFrontend, 'its frontend').parse,
    'function',
  );
  assert.equal(previewCall.options.watch, true);
  assert.equal(previewCall.options.maxSourceBytes, dsl4CliDefaultLimits.maxSourceBytes);
  assert.equal(previewCall.options.maxAssetFiles, dsl4CliDefaultLimits.maxAssetFiles);
  assert.equal(previewCall.dependencies.stdout, captured.io.stdout);
  assert.equal(previewCall.dependencies.stderr, captured.io.stderr);
});

test('waits for runtime-ready, redacts the token, and cleans up on SIGINT', async () => {
  const captured = captureIo();
  const fixture = createCommandFixture({
    async onOpen({emit, signalTarget}) {
      queueMicrotask(() => emit({type: 'local-preview.runtime-ready'}));
      setImmediate(() => signalTarget.emit('SIGINT'));
    },
  });
  const result = await runDsl4LocalPreviewCommand(defaultCommandOptions(), {
    ...fixture.dependencies,
    ...captured.io,
  });
  assert.deepEqual(result, {exitCode: 0, reason: 'signal', signal: 'SIGINT'});
  assert.match(captured.stdout, /Opening DSL 4\.0 preview/u);
  assert.match(captured.stdout, /Preview ready/u);
  assert.match(captured.stdout, /watching story\.k4\.yml/u);
  assert.match(captured.stdout, /Preview stopped by SIGINT/u);
  assert.equal(captured.stdout.includes('A'.repeat(43)), false);
  assert.equal(fixture.disposeCount, 1);
  assert.equal(fixture.runtimeOptions.maxSourceBytes, dsl4CliDefaultLimits.maxSourceBytes);
  assert.equal(fixture.hostOptions.maxAssetFiles, dsl4CliDefaultLimits.maxAssetFiles);
  assert.equal(fixture.signalTarget.listenerCount('SIGINT'), 0);
  assert.equal(fixture.signalTarget.listenerCount('SIGTERM'), 0);
});

test('requires explicit acknowledgement and forwards selected large artifact limits', async () => {
  const largeProjectBytes = 300 * 1024 * 1024;
  const largeProjectJsonBytes = 400 * 1024 * 1024;
  await assert.rejects(
    runDsl4LocalPreviewCommand(
      {...commandOptions(), maxProjectBytes: largeProjectBytes},
      {stdout: {write() {}}, stderr: {write() {}}},
    ),
    (error) => thrown(error).code === 'K4-PREVIEW-CLI-LIMIT-ACK',
  );

  const captured = captureIo();
  const fixture = createCommandFixture({
    async onOpen({emit, signalTarget}) {
      queueMicrotask(() => emit({type: 'local-preview.runtime-ready'}));
      setImmediate(() => signalTarget.emit('SIGINT'));
    },
  });
  await runDsl4LocalPreviewCommand(
    commandOptions([
      '--max-project-bytes',
      String(largeProjectBytes),
      '--max-project-json-bytes',
      String(largeProjectJsonBytes),
      '--allow-large-preview-artifacts',
    ]),
    {...fixture.dependencies, ...captured.io},
  );
  assert.equal(fixture.hostOptions.maxProjectBytes, largeProjectBytes);
  assert.equal(fixture.hostOptions.maxProjectJsonBytes, largeProjectJsonBytes);
  assert.match(captured.stderr, /large preview artifact limits were explicitly enabled/u);
});

test('forwards explicit Source Graph limits to both the initial build and live host', async () => {
  const captured = captureIo();
  const fixture = createCommandFixture({
    async onOpen({emit, signalTarget}) {
      queueMicrotask(() => emit({type: 'local-preview.runtime-ready'}));
      setImmediate(() => signalTarget.emit('SIGINT'));
    },
  });
  const graphArguments = [
    '--enable-source-includes',
    '--max-source-files',
    '8',
    '--max-total-source-bytes',
    '32768',
    '--max-include-depth',
    '4',
  ];
  await runDsl4LocalPreviewCommand(commandOptions(graphArguments), {
    ...fixture.dependencies,
    ...captured.io,
  });

  for (const forwarded of [fixture.runtimeOptions, fixture.hostOptions]) {
    assert.equal(forwarded.maxSourceFiles, 8);
    assert.equal(forwarded.maxTotalSourceBytes, 32768);
    assert.equal(forwarded.maxIncludeDepth, 4);
    assert.equal(forwarded.maxAssetFileBytes, limits.maxAssetFileBytes);
    assert.equal(forwarded.maxAssetFiles, limits.maxAssetFiles);
    assert.equal(forwarded.maxTotalAssetBytes, limits.maxTotalAssetBytes);
  }
});

test('fails closed when the browser never acknowledges runtime readiness', async () => {
  const fixture = createCommandFixture();
  await assert.rejects(
    runDsl4LocalPreviewCommand(commandOptions(), {
      ...fixture.dependencies,
      readyTimeoutMs: 10,
      stdout: {write() {}},
      stderr: {write() {}},
    }),
    (error) => thrown(error).code === 'K4-PREVIEW-CLI-RUNTIME-TIMEOUT',
  );
  assert.equal(fixture.disposeCount, 1);
});

test('rejects an oversized source manifest before build or host side effects', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'dsl4-preview-cli-limit-'));
  const baseSb3 = path.join(projectRoot, 'base.sb3');
  const sourceManifest = path.join(projectRoot, 'project.source.json');
  await Promise.all([
    writeFile(baseSb3, 'base'),
    writeFile(sourceManifest, Buffer.alloc(64 * 1024 + 1, 0x20)),
  ]);
  let buildCount = 0;
  try {
    await assert.rejects(
      runDsl4LocalPreviewCommand(
        {...commandOptions(), projectRoot, baseSb3, sourceManifest},
        {
          signalTarget: new EventEmitter(),
          buildRuntime() {
            buildCount += 1;
          },
          buildBrowserBundle() {
            buildCount += 1;
          },
          createHost() {
            throw new Error('host must not be created');
          },
          openBrowser() {
            throw new Error('browser must not be opened');
          },
          stdout: {write() {}},
          stderr: {write() {}},
        },
      ),
      (error) => thrown(error).code === 'K4-SOURCE-MANIFEST-SIZE-001',
    );
    assert.equal(buildCount, 0);
  } finally {
    await rm(projectRoot, {recursive: true, force: true});
  }
});

test('returns a restart-required failure after a ready runtime observes a full rebuild', async () => {
  const captured = captureIo();
  const fixture = createCommandFixture({
    async onOpen({emit}) {
      queueMicrotask(() => emit({type: 'local-preview.runtime-ready'}));
      setImmediate(() => emit({type: 'local-preview.full-rebuild-required'}));
    },
  });
  const result = await runDsl4LocalPreviewCommand(commandOptions(), {
    ...fixture.dependencies,
    ...captured.io,
  });
  assert.deepEqual(result, {exitCode: 1, reason: 'full-rebuild'});
  assert.match(captured.stderr, /full rebuild is required/u);
  assert.equal(fixture.disposeCount, 1);
});

test('does not open a browser when SIGTERM wins the host startup race', async () => {
  const fixture = createCommandFixture({
    start(signalTarget) {
      queueMicrotask(() => signalTarget.emit('SIGTERM'));
      return new Promise(() => {});
    },
  });
  const result = await runDsl4LocalPreviewCommand(commandOptions(), {
    ...fixture.dependencies,
    stdout: {write() {}},
    stderr: {write() {}},
  });
  assert.deepEqual(result, {exitCode: 0, reason: 'signal', signal: 'SIGTERM'});
  assert.equal(fixture.openCount, 0);
  assert.equal(fixture.disposeCount, 1);
});

test('opens only authenticated loopback URLs with the platform browser launcher', async () => {
  const launchUrl = `http://127.0.0.1:45123/#${'B'.repeat(43)}`;
  const launchers: [NodeJS.Platform, string, string[]][] = [
    ['darwin', 'open', []],
    ['linux', 'xdg-open', []],
    ['win32', 'rundll32.exe', ['url.dll,FileProtocolHandler']],
  ];
  for (const [platform, expectedCommand, expectedPrefix] of launchers) {
    let invocation: {command: string; arguments_: unknown; options: unknown} | undefined;
    let unrefCount = 0;
    await openDsl4LocalPreviewBrowser(launchUrl, {
      platform,
      // The launcher only spawns the process and unrefs it, so the double is an emitter with the
      // one member it calls, handed over as the `spawn` the command declares.
      spawnProcess: ((command: string, arguments_: unknown, options: unknown) => {
        invocation = {command, arguments_, options};
        const child = Object.assign(new EventEmitter(), {
          unref: () => {
            unrefCount += 1;
          },
        });
        queueMicrotask(() => child.emit('spawn'));
        return child;
      }) as unknown as typeof spawn,
    });
    const spawned = requireDefined(invocation, 'the spawned launcher');
    assert.equal(spawned.command, expectedCommand);
    assert.deepEqual(spawned.arguments_, [...expectedPrefix, launchUrl]);
    assert.deepEqual(spawned.options, {detached: true, stdio: 'ignore'});
    assert.equal(unrefCount, 1);
  }
  await assert.rejects(
    openDsl4LocalPreviewBrowser(`https://example.com/#${'B'.repeat(43)}`),
    (error) => thrown(error).code === 'K4-PREVIEW-CLI-BROWSER',
  );
  await assert.rejects(
    openDsl4LocalPreviewBrowser(`http://127.0.0.1:45123/other#${'B'.repeat(43)}`),
    (error) => thrown(error).code === 'K4-PREVIEW-CLI-BROWSER',
  );
});
