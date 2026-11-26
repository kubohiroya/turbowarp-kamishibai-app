import {bindDsl4ProjectSourceFrontend} from '../dsl4/source-frontend.js';
import {spawn} from 'node:child_process';
import {open} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

import {resolveDsl4FeatureFlags} from '../dsl4/feature-flags.js';
import {dsl4BrowserPreviewArtifactLimits} from '../dsl4/browser-preview-artifact-limits.js';
import {buildDsl4RuntimeComponent} from './dsl4-build.js';
import {dsl4LocalPreviewBrowserBootstrapMaximums} from './dsl4-local-preview-browser-bootstrap.js';
import {
  createDsl4LocalPreviewHost,
  dsl4LocalPreviewHostDefaults,
} from './dsl4-local-preview-host.js';
import {resolveDsl4ProjectSource} from './dsl4-project-source.js';
import {resolveDsl4BuildSourceLimits} from './dsl4-source-limits.js';
import {buildDsl4TurboWarpBrowserBundle} from './dsl4-turbowarp-browser-bundle.js';
import {Sb3BuilderError} from './errors.js';
import {createDsl4CreationCleanup, Dsl4CreationFailure} from '../dsl4/creation-cleanup.js';
import {createDsl4FailedCreationOwners} from '../dsl4/failed-creation-owners.js';
import type {Dsl4SourceFrontend} from '../dsl4/source-frontend.js';

const browserEntryPoint = fileURLToPath(
  new URL('./dsl4-local-preview-browser-entry.js', import.meta.url),
);
const maximumManifestBytes = 64 * 1024;

export type PreviewHost = {
  start: () => Promise<unknown>;
  getLaunchUrl: () => string;
  getSnapshot: () => Readonly<{origin?: unknown; browserRuntimeReady?: unknown}>;
  dispose: () => unknown;
  hasPendingCleanup?: () => boolean;
};

type PreviewCommandResult =
  | Readonly<{exitCode: 0; reason: 'signal'; signal: unknown}>
  | Readonly<{exitCode: 0; reason: 'browser-disconnected'}>
  | Readonly<{exitCode: 1; reason: 'full-rebuild'}>;

type PreviewCompletionOutcome =
  | Readonly<{reason: 'signal'; signal: unknown}>
  | Readonly<{reason: 'browser-disconnected'; event?: unknown}>
  | Readonly<{reason: 'full-rebuild'; event?: unknown}>;

type PreviewHostStartup =
  | Readonly<{kind: 'listening'; listening: {origin: string}}>
  | Readonly<{kind: 'signal'; signal: unknown}>;

interface PreviewCommandIo {
  write(chunk: string): unknown;
}

interface PreviewSignalTarget {
  once(type: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  off(type: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
}

type PreviewHostFactory = (options: Record<string, unknown>) => PreviewHost;

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string when present`);
  }
  return value;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function sourceFrontend(value: unknown): Dsl4SourceFrontend {
  if (!isRecord(value) || typeof value.parse !== 'function') {
    throw new TypeError('sourceFrontend must provide parse');
  }
  return value as unknown as Dsl4SourceFrontend;
}

function previewChannel(value: unknown): 'bundled' | 'unbundled' {
  if (value !== 'bundled' && value !== 'unbundled') {
    throw new TypeError('channel must be bundled or unbundled');
  }
  return value;
}

function previewHostListening(value: unknown): {origin: string} {
  if (!isRecord(value) || typeof value.origin !== 'string') {
    throw commandError('Preview host did not report a listening origin', 'K4-PREVIEW-CLI-HOST');
  }
  return {origin: value.origin};
}

function completionOutcome(value: unknown): PreviewCompletionOutcome {
  if (!isRecord(value) || typeof value.reason !== 'string') {
    throw commandError(
      'Local preview command completed with an invalid outcome',
      'K4-PREVIEW-CLI-INTERNAL',
    );
  }
  if (value.reason === 'signal') return {reason: 'signal', signal: value.signal};
  if (value.reason === 'browser-disconnected') {
    return {reason: 'browser-disconnected', event: value.event};
  }
  if (value.reason === 'full-rebuild') return {reason: 'full-rebuild', event: value.event};
  throw commandError(
    'Local preview command completed with an unknown outcome',
    'K4-PREVIEW-CLI-INTERNAL',
  );
}

export const dsl4LocalPreviewCommandDefaults = Object.freeze({
  readyTimeoutMs: 20_000,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function commandError(message: string, code: string, cause?: unknown) {
  return new Sb3BuilderError(message, {stage: 'dsl4-local-preview-command', code, cause});
}

function boundedInteger(value: unknown, name: string, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new TypeError(`${name} must be a safe integer between ${minimum} and ${maximum}`);
  }
  return Number(value);
}

async function readBoundedFile(filePath: string, maximumBytes: number, description: string) {
  let handle;
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    handle = await open(filePath, 'r');
    const state = await handle.stat();
    if (!state.isFile()) {
      throw commandError(`${description} must be a regular file`, 'K4-PREVIEW-CLI-INPUT');
    }
    if (state.size < 1 || state.size > maximumBytes) {
      throw commandError(
        `${description} must contain 1-${maximumBytes} bytes`,
        'K4-PREVIEW-CLI-INPUT-LIMIT',
      );
    }
    while (size <= maximumBytes) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maximumBytes - size + 1));
      const result = await handle.read(chunk, 0, chunk.length, null);
      if (result.bytesRead === 0) break;
      chunks.push(chunk.subarray(0, result.bytesRead));
      size += result.bytesRead;
    }
  } catch (error) {
    if (error instanceof Sb3BuilderError) throw error;
    throw commandError(`Cannot read ${description}`, 'K4-PREVIEW-CLI-INPUT', error);
  } finally {
    try {
      await handle?.close();
    } catch (error) {
      for (const chunk of chunks) chunk.fill(0);
      throw commandError(`Cannot close ${description}`, 'K4-PREVIEW-CLI-INPUT', error);
    }
  }
  if (size < 1 || size > maximumBytes) {
    for (const chunk of chunks) chunk.fill(0);
    throw commandError(
      `${description} must contain 1-${maximumBytes} bytes`,
      'K4-PREVIEW-CLI-INPUT-LIMIT',
    );
  }
  const bytes = Buffer.concat(chunks, size);
  for (const chunk of chunks) chunk.fill(0);
  return bytes;
}

/** Open one validated loopback launch URL with the platform browser launcher. */
export async function openDsl4LocalPreviewBrowser(
  launchUrl: string,
  dependencies: {platform?: NodeJS.Platform; spawnProcess?: typeof spawn} = {},
) {
  let parsed;
  try {
    parsed = new URL(launchUrl);
  } catch (error) {
    throw commandError('Preview launch URL is invalid', 'K4-PREVIEW-CLI-BROWSER', error);
  }
  if (
    parsed.protocol !== 'http:' ||
    (parsed.hostname !== '127.0.0.1' && parsed.hostname !== '[::1]' && parsed.hostname !== '::1') ||
    parsed.port.length === 0 ||
    parsed.pathname !== '/' ||
    parsed.search.length > 0 ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    !/^#[A-Za-z0-9_-]{43}$/u.test(parsed.hash)
  ) {
    throw commandError(
      'Preview browser launcher accepts only an authenticated loopback URL',
      'K4-PREVIEW-CLI-BROWSER',
    );
  }
  const platform = dependencies.platform ?? process.platform;
  const spawnProcess = dependencies.spawnProcess ?? spawn;
  if (typeof spawnProcess !== 'function') {
    throw new TypeError('spawnProcess must be a function');
  }
  let command;
  let arguments_;
  if (platform === 'darwin') {
    command = 'open';
    arguments_ = [launchUrl];
  } else if (platform === 'win32') {
    command = 'rundll32.exe';
    arguments_ = ['url.dll,FileProtocolHandler', launchUrl];
  } else {
    command = 'xdg-open';
    arguments_ = [launchUrl];
  }
  await new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnProcess(command, arguments_, {detached: true, stdio: 'ignore'});
    } catch (error) {
      reject(commandError('Cannot start the system browser', 'K4-PREVIEW-CLI-BROWSER', error));
      return;
    }
    child.once('error', (error) => {
      reject(commandError('Cannot start the system browser', 'K4-PREVIEW-CLI-BROWSER', error));
    });
    child.once('spawn', () => {
      try {
        child.unref();
        resolve(undefined);
      } catch (error) {
        reject(commandError('Cannot detach the system browser', 'K4-PREVIEW-CLI-BROWSER', error));
      }
    });
  });
}

/** Build and own one browser-backed DSL 4.0 local preview until signal or browser close. */
export async function runDsl4LocalPreviewCommand(
  optionsInput: object,
  dependenciesInput: Record<string, unknown> = {},
) {
  if (!isRecord(optionsInput)) throw new TypeError('local preview command options are required');
  if (!isRecord(dependenciesInput))
    throw new TypeError('local preview dependencies must be an object');
  const options = optionsInput as Record<string, unknown>;
  const dependencies = dependenciesInput;
  if (options.watch !== true) {
    throw commandError('watch must be explicitly enabled', 'K4-PREVIEW-CLI-WATCH');
  }
  if (typeof options.projectRoot !== 'string' || options.projectRoot.length === 0) {
    throw new TypeError('projectRoot must be a non-empty string');
  }
  if (typeof options.baseSb3 !== 'string' || options.baseSb3.length === 0) {
    throw new TypeError('baseSb3 must be a non-empty string');
  }
  const baseSb3 = options.baseSb3;
  const sourceManifestPathOption = optionalString(options.sourceManifest, 'sourceManifest');
  const source = optionalString(options.source, 'source');
  const sourceId = optionalString(options.sourceId, 'sourceId');
  const dsl4SourceFrontend = sourceFrontend(options.sourceFrontend);
  const controlProfile = requiredString(options.controlProfile, 'controlProfile');
  const channel = previewChannel(options.channel);
  const replaceExisting =
    options.replaceExisting === undefined ? undefined : options.replaceExisting === true;
  const maxSourceBytes = boundedInteger(
    options.maxSourceBytes,
    'maxSourceBytes',
    1,
    dsl4LocalPreviewBrowserBootstrapMaximums.maxSourceBytes,
  );
  const featureFlags = resolveDsl4FeatureFlags(options.featureFlags ?? {});
  const sourceLimits = resolveDsl4BuildSourceLimits({
    sourceIncludesEnabled: featureFlags.dsl4SourceIncludes,
    maxSourceBytes,
    maxTotalSourceBytes: options.maxTotalSourceBytes,
  });
  const graphOptions = featureFlags.dsl4SourceIncludes
    ? {
        maxSourceFiles: boundedInteger(
          options.maxSourceFiles,
          'maxSourceFiles',
          1,
          Number.MAX_SAFE_INTEGER,
        ),
        maxTotalSourceBytes: sourceLimits.maxSourceGraphBytes,
        maxIncludeDepth: boundedInteger(
          options.maxIncludeDepth,
          'maxIncludeDepth',
          1,
          Number.MAX_SAFE_INTEGER,
        ),
      }
    : {};
  const maxAssetFileBytes = boundedInteger(
    options.maxAssetFileBytes,
    'maxAssetFileBytes',
    1,
    dsl4LocalPreviewBrowserBootstrapMaximums.maxTotalAssetBytes,
  );
  const maxAssetFiles = boundedInteger(
    options.maxAssetFiles,
    'maxAssetFiles',
    1,
    dsl4LocalPreviewBrowserBootstrapMaximums.maxAssetFiles,
  );
  const maxTotalAssetBytes = boundedInteger(
    options.maxTotalAssetBytes,
    'maxTotalAssetBytes',
    1,
    dsl4LocalPreviewBrowserBootstrapMaximums.maxTotalAssetBytes,
  );
  if (maxAssetFileBytes > maxTotalAssetBytes) {
    throw commandError(
      'maxAssetFileBytes must not exceed maxTotalAssetBytes',
      'K4-PREVIEW-CLI-LIMIT',
    );
  }
  const port = boundedInteger(options.port ?? 0, 'port', 0, 65_535);
  const projectRoot = path.resolve(options.projectRoot);
  const maxProjectBytes = boundedInteger(
    options.maxProjectBytes ?? dsl4LocalPreviewHostDefaults.maxProjectBytes,
    'maxProjectBytes',
    1,
    dsl4BrowserPreviewArtifactLimits.absoluteMaximums.maxProjectBytes,
  );
  const maxProjectJsonBytes = boundedInteger(
    options.maxProjectJsonBytes ?? dsl4BrowserPreviewArtifactLimits.defaults.maxProjectJsonBytes,
    'maxProjectJsonBytes',
    1,
    dsl4BrowserPreviewArtifactLimits.absoluteMaximums.maxProjectJsonBytes,
  );
  const exceedsRecommendedArtifactLimit =
    maxAssetFileBytes > dsl4BrowserPreviewArtifactLimits.recommendedMaximums.maxTotalAssetBytes ||
    maxTotalAssetBytes > dsl4BrowserPreviewArtifactLimits.recommendedMaximums.maxTotalAssetBytes ||
    maxProjectBytes > dsl4BrowserPreviewArtifactLimits.recommendedMaximums.maxProjectBytes ||
    maxProjectJsonBytes > dsl4BrowserPreviewArtifactLimits.recommendedMaximums.maxProjectJsonBytes;
  if (exceedsRecommendedArtifactLimit && options.allowLargePreviewArtifacts !== true) {
    throw commandError(
      'Artifact limits above the recommended maximum require allowLargePreviewArtifacts',
      'K4-PREVIEW-CLI-LIMIT-ACK',
    );
  }
  const readyTimeoutMs = boundedInteger(
    dependencies.readyTimeoutMs ?? dsl4LocalPreviewCommandDefaults.readyTimeoutMs,
    'readyTimeoutMs',
    1,
    60_000,
  );
  const readInput = dependencies.readFile ?? readBoundedFile;
  const buildRuntime = dependencies.buildRuntime ?? buildDsl4RuntimeComponent;
  const buildBrowserBundle = dependencies.buildBrowserBundle ?? buildDsl4TurboWarpBrowserBundle;
  const createHost = dependencies.createHost ?? createDsl4LocalPreviewHost;
  const openBrowser = dependencies.openBrowser ?? openDsl4LocalPreviewBrowser;
  const resolveProjectSource = dependencies.resolveProjectSource ?? resolveDsl4ProjectSource;
  const signalTarget = dependencies.signalTarget ?? process;
  const stdout = dependencies.stdout ?? process.stdout;
  const stderr = dependencies.stderr ?? process.stderr;
  for (const [name, value] of [
    ['readFile', readInput],
    ['buildRuntime', buildRuntime],
    ['buildBrowserBundle', buildBrowserBundle],
    ['createHost', createHost],
    ['openBrowser', openBrowser],
    ['resolveProjectSource', resolveProjectSource],
  ]) {
    if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
  }
  if (
    !isRecord(signalTarget) ||
    typeof signalTarget.once !== 'function' ||
    typeof signalTarget.off !== 'function'
  ) {
    throw new TypeError('signalTarget must provide once and off');
  }
  if (
    !isRecord(stdout) ||
    !isRecord(stderr) ||
    typeof stdout.write !== 'function' ||
    typeof stderr.write !== 'function'
  ) {
    throw new TypeError('stdout and stderr must provide write');
  }
  const readPreviewInput = readInput as typeof readBoundedFile;
  const buildPreviewRuntime = buildRuntime as typeof buildDsl4RuntimeComponent;
  const buildPreviewBrowserBundle = buildBrowserBundle as typeof buildDsl4TurboWarpBrowserBundle;
  const createPreviewHost = createHost as unknown as PreviewHostFactory;
  const openPreviewBrowser = openBrowser as typeof openDsl4LocalPreviewBrowser;
  const resolvePreviewProjectSource = resolveProjectSource as typeof resolveDsl4ProjectSource;
  const previewSignalTarget = signalTarget as unknown as PreviewSignalTarget;
  const previewStdout = stdout as unknown as PreviewCommandIo;
  const previewStderr = stderr as unknown as PreviewCommandIo;
  if (exceedsRecommendedArtifactLimit) {
    previewStderr.write(
      'Warning: large preview artifact limits were explicitly enabled; browser memory use may be substantial.\n',
    );
  }

  let host: PreviewHost | null = null;
  let stopping = false;
  let receivedSignal: string | null = null;
  let readyObserved = false;
  let settleReadyResolve: (value?: unknown) => void = () => {};
  let settleReadyReject: (reason?: unknown) => void = () => {};
  const ready = new Promise((resolve, reject) => {
    settleReadyResolve = resolve;
    settleReadyReject = reject;
  });
  let settleCompletionResolve: (value?: unknown) => void = () => {};
  let settleCompletionReject: (reason?: unknown) => void = () => {};
  const completion = new Promise((resolve, reject) => {
    settleCompletionResolve = resolve;
    settleCompletionReject = reject;
  });
  let settleSignal: (value?: unknown) => void = () => {};
  const signalled = new Promise((resolve) => {
    settleSignal = resolve;
  });
  void ready.catch(() => {});
  void completion.catch(() => {});
  const onSignal = (signal: string) => {
    if (receivedSignal) return;
    receivedSignal = signal;
    stopping = true;
    settleSignal(signal);
  };
  const handleSigint = () => onSignal('SIGINT');
  const handleSigterm = () => onSignal('SIGTERM');
  previewSignalTarget.once('SIGINT', handleSigint);
  previewSignalTarget.once('SIGTERM', handleSigterm);

  let readyTimer: ReturnType<typeof setTimeout> | null = null;
  let result: PreviewCommandResult | null = null;
  let primaryError = null;
  const failedCreations = createDsl4FailedCreationOwners('Preview command factory cleanup failed');
  async function prepareTogether<A, B>(
    left: () => A | Promise<A>,
    right: () => B | Promise<B>,
    discardLeft: (value: A) => void,
    discardRight: (value: B) => void,
  ): Promise<[A, B]> {
    // Wait for both factories, including synchronous throws, before handing cleanup upward.
    const [first, second] = await Promise.allSettled([
      Promise.resolve().then(left),
      Promise.resolve().then(right),
    ]);
    if (first.status === 'fulfilled' && second.status === 'fulfilled')
      return [first.value, second.value];
    const failures: unknown[] = [];
    for (const result of [first, second]) {
      if (result.status === 'rejected') {
        failedCreations.retain(result.reason);
        failures.push(result.reason);
      }
    }
    if (first.status === 'fulfilled') discardLeft(first.value);
    if (second.status === 'fulfilled') discardRight(second.value);
    if (failures.length === 1) throw failures[0];
    throw new AggregateError(failures, 'Preview preparation factories failed');
  }
  try {
    const [baseSb3Bytes, resolvedSource] = await prepareTogether(
      () => readPreviewInput(path.resolve(baseSb3), maxProjectBytes, 'base SB3'),
      () =>
        resolvePreviewProjectSource({
          projectRoot,
          ...(sourceManifestPathOption === undefined
            ? {}
            : {sourceManifest: sourceManifestPathOption}),
          ...(source === undefined ? {} : {source}),
          ...(sourceId === undefined ? {} : {sourceId}),
          maxSourceManifestBytes: maximumManifestBytes,
        }),
      (bytes) => bytes.fill(0),
      () => {},
    );
    const sourceManifest = resolvedSource.manifest;
    let built;
    let browserBundleBytes;
    try {
      [built, browserBundleBytes] = await prepareTogether(
        () =>
          buildPreviewRuntime({
            baseSb3Bytes,
            projectRoot,
            sourceManifest,
            sourceFrontend: dsl4SourceFrontend,
            controlProfile,
            channel,
            maxSourceBytes,
            maxAssetFileBytes,
            maxAssetFiles,
            maxTotalAssetBytes,
            featureFlags,
            ...(featureFlags.dsl4PresentationEffects ? {localPreviewRuntime: true} : {}),
            ...graphOptions,
            ...(replaceExisting === undefined ? {} : {replaceExisting}),
          }),
        () => buildPreviewBrowserBundle({entryPoint: browserEntryPoint}),
        (value) => {
          if (value?.bytes instanceof Uint8Array) value.bytes.fill(0);
        },
        (bytes) => {
          if (bytes instanceof Uint8Array) bytes.fill(0);
        },
      );
    } finally {
      baseSb3Bytes.fill(0);
    }
    if (!isRecord(built) || !(built.bytes instanceof Uint8Array)) {
      throw commandError('Preview runtime build returned invalid bytes', 'K4-PREVIEW-CLI-BUILD');
    }
    if (!(browserBundleBytes instanceof Uint8Array)) {
      built.bytes.fill(0);
      throw commandError('Preview browser build returned invalid bytes', 'K4-PREVIEW-CLI-BUILD');
    }
    const projectBytes = Uint8Array.from(built.bytes);
    built.bytes.fill(0);
    const bundleBytes = Uint8Array.from(browserBundleBytes);
    browserBundleBytes.fill(0);
    try {
      const hostProjectRoot =
        resolvedSource.manifestPath === null
          ? projectRoot
          : path.dirname(resolvedSource.manifestPath);
      const createdHost = createPreviewHost({
        projectRoot: hostProjectRoot,
        sourceManifestPath: resolvedSource.manifestPath,
        sourceManifest,
        sourceFrontend: bindDsl4ProjectSourceFrontend(dsl4SourceFrontend, built.project),
        maxSourceBytes,
        featureFlags,
        ...graphOptions,
        maxAssetFileBytes,
        maxAssetFiles,
        maxTotalAssetBytes,
        maxProjectBytes,
        maxProjectJsonBytes,
        runtimeOwner: 'browser',
        port,
        projectBytes,
        browserBundleBytes: bundleBytes,
        onEvent(event: unknown) {
          if (!isRecord(event) || typeof event.type !== 'string') return;
          if (event.type === 'local-preview.runtime-ready') {
            readyObserved = true;
            settleReadyResolve(event);
            return;
          }
          if (event.type === 'local-preview.full-rebuild-required') {
            const outcome = {reason: 'full-rebuild', event};
            if (readyObserved) settleCompletionResolve(outcome);
            else {
              settleReadyReject(
                commandError(
                  'Preview requires a full rebuild before runtime startup',
                  'K4-PREVIEW-CLI-FULL-REBUILD',
                ),
              );
            }
            return;
          }
          if (event.type === 'local-preview.transport-disconnected' && !stopping) {
            const outcome = {reason: 'browser-disconnected', event};
            if (readyObserved) settleCompletionResolve(outcome);
            else {
              settleReadyReject(
                commandError(
                  'Browser disconnected before the preview runtime became ready',
                  'K4-PREVIEW-CLI-RUNTIME-DISCONNECTED',
                ),
              );
            }
          }
        },
        onError(error: unknown) {
          if (stopping) return;
          const wrapped = commandError('Local preview host failed', 'K4-PREVIEW-CLI-HOST', error);
          if (readyObserved) settleCompletionReject(wrapped);
          else settleReadyReject(wrapped);
        },
      });
      if (isRecord(createdHost) && typeof createdHost.dispose === 'function')
        host = createdHost as PreviewHost;
      if (
        !isRecord(createdHost) ||
        typeof createdHost.start !== 'function' ||
        typeof createdHost.getLaunchUrl !== 'function' ||
        typeof createdHost.getSnapshot !== 'function' ||
        typeof createdHost.dispose !== 'function'
      ) {
        throw commandError('Preview host factory returned an invalid owner', 'K4-PREVIEW-CLI-HOST');
      }
      host = createdHost as PreviewHost;
    } finally {
      projectBytes.fill(0);
      bundleBytes.fill(0);
    }
    if (!host) throw commandError('Preview host is unavailable', 'K4-PREVIEW-CLI-HOST');
    if (receivedSignal) {
      result = {exitCode: 0, reason: 'signal', signal: receivedSignal};
    } else {
      const hostStartup: PreviewHostStartup = await Promise.race([
        host.start().then((listening) => ({
          kind: 'listening' as const,
          listening: previewHostListening(listening),
        })),
        signalled.then((signal) => ({kind: 'signal' as const, signal})),
      ]);
      if (hostStartup.kind === 'signal' && 'signal' in hostStartup) {
        result = {exitCode: 0, reason: 'signal', signal: hostStartup.signal};
      } else {
        const launchUrl = host.getLaunchUrl();
        previewStdout.write(`Opening DSL 4.0 preview at ${hostStartup.listening.origin}\n`);
        await openPreviewBrowser(launchUrl);
      }
      if (!result) {
        readyTimer = setTimeout(() => {
          settleReadyReject(
            commandError(
              `Browser runtime did not acknowledge readiness within ${readyTimeoutMs}ms`,
              'K4-PREVIEW-CLI-RUNTIME-TIMEOUT',
            ),
          );
        }, readyTimeoutMs);
        const startup = await Promise.race([
          ready.then(() => ({kind: 'ready'})),
          signalled.then((signal) => ({kind: 'signal', signal})),
        ]);
        clearTimeout(readyTimer);
        readyTimer = null;
        if (startup.kind === 'signal' && 'signal' in startup) {
          result = {exitCode: 0, reason: 'signal', signal: startup.signal};
        } else {
          const snapshot = host.getSnapshot();
          if (snapshot.browserRuntimeReady !== true) {
            throw commandError(
              'Browser runtime readiness acknowledgement was not retained',
              'K4-PREVIEW-CLI-RUNTIME-DISCONNECTED',
            );
          }
          previewStdout.write(
            `Preview ready at ${snapshot.origin}; watching ${sourceManifest.path}\n`,
          );
          const outcome = completionOutcome(
            await Promise.race([
              completion,
              signalled.then((signal) => ({reason: 'signal', signal})),
            ]),
          );
          if (outcome.reason === 'full-rebuild') {
            previewStderr.write(
              'Preview stopped because a full rebuild is required. Restart the command.\n',
            );
            result = {exitCode: 1, reason: outcome.reason};
          } else if (outcome.reason === 'browser-disconnected') {
            previewStdout.write('Preview stopped because the browser disconnected.\n');
            result = {exitCode: 0, reason: outcome.reason};
          } else {
            previewStdout.write(`Preview stopped by ${outcome.signal}.\n`);
            result = {exitCode: 0, reason: 'signal', signal: outcome.signal};
          }
        }
      }
    }
  } catch (error) {
    failedCreations.retain(error);
    primaryError = error;
  } finally {
    stopping = true;
    const cleanup = createDsl4CreationCleanup(
      [
        {run: failedCreations.drain, isPending: failedCreations.hasPendingCleanup},
        () => {
          if (readyTimer) clearTimeout(readyTimer);
          readyTimer = null;
        },
        () => previewSignalTarget.off('SIGINT', handleSigint),
        () => previewSignalTarget.off('SIGTERM', handleSigterm),
        {run: () => host?.dispose(), isPending: () => host?.hasPendingCleanup?.() ?? false},
      ],
      'Local preview command cleanup failed',
      true,
    );
    try {
      await cleanup.dispose();
      if (cleanup.hasPendingCleanup()) throw new Error('Local preview command cleanup is pending');
    } catch (cleanupError) {
      primaryError = new Dsl4CreationFailure(
        primaryError ?? cleanupError,
        cleanup,
        'Local preview command and cleanup failed',
        cleanupError,
      );
    }
  }
  if (primaryError) throw primaryError;
  if (!result) {
    throw commandError('Local preview command did not settle', 'K4-PREVIEW-CLI-INTERNAL');
  }
  return Object.freeze(result);
}
