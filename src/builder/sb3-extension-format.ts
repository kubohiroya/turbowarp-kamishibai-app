/**
 * What this App knows about writing the chosen form into an SB3.
 *
 * The writing itself now lives in `@kubohiroya/turbowarp-sb3-save-format/writer`, beside the
 * vocabulary it writes, so the GUI's save path and this CLI reach the same implementation instead
 * of the vocabulary's only writer living in one application.
 *
 * What stays here is what only this App knows: which of its own extensions may ask for an
 * unsandboxed host, what this build can write, and the error type the CLI reports. Wrapping the
 * package's error keeps every message and code exactly as it was, including the `stage=` prefix
 * the CLI prints.
 */

import {
  readSb3ExtensionPayloads,
  sb3PlusExtensionPath,
  Sb3WriterError,
  verifySb3ExtensionUrls as verifyExtensionUrls,
  writeSb3ExtensionFormat as writeExtensionFormat,
  type Sb3ExtensionFormatOptions,
  type Sb3ExtensionFormatResult,
  type Sb3ExtensionPayload,
  type Sb3ExtensionUrlCheckOptions,
} from '@kubohiroya/turbowarp-sb3-save-format/writer';

import {
  dsl4BlockAuthoringExtensionId,
  dsl4BlockSourceBundleExtensionId,
  dsl4BlockSourceRuntimeExtensionId,
} from '../dsl4/block-source-shared.js';
import {Sb3BuilderError} from './errors.js';
import {sb3SaveFormatCapabilities} from './sb3-save-format.js';
import type {Sb3SaveFormat} from './sb3-save-format.js';

export {readSb3ExtensionPayloads, sb3PlusExtensionPath};
export type {Sb3ExtensionFormatResult, Sb3ExtensionPayload, Sb3ExtensionUrlCheckOptions};

/** The options this App's callers pass; it supplies the capabilities and its own IDs itself. */
export type Sb3ExtensionFormatCallerOptions = Omit<
  Sb3ExtensionFormatOptions,
  'capabilities' | 'unsandboxed'
> & {readonly unsandboxed?: readonly string[] | undefined};

/**
 * The App's own DSL 4.0 extensions read the host `Scratch` surface and refuse a sandboxed host.
 *
 * A legacy `data:` URL records no execution mode, so only these IDs are requested unsandboxed by
 * default and every other extension is requested sandboxed: a rewrite never promotes an extension
 * on its own. An existing Manifest entry always keeps the mode it already requested, and nothing in
 * an SB3 grants it — a Plus host asks its `trustProvider`, a standard host asks the person.
 */
export const dsl4UnsandboxedExtensionIds: readonly string[] = Object.freeze([
  dsl4BlockSourceBundleExtensionId,
  dsl4BlockSourceRuntimeExtensionId,
  dsl4BlockAuthoringExtensionId,
]);

/** Report the package's refusals as this CLI's own, so the message and code do not change. */
function asBuilderError(error: unknown): never {
  if (error instanceof Sb3WriterError)
    throw new Sb3BuilderError(error.message, {
      stage: 'sb3-extension-format',
      code: error.code,
      cause: error.cause,
    });
  throw error;
}

/** Whether this payload can be written in this format by this build. */
export async function writeSb3ExtensionFormat(
  archive: Record<string, Uint8Array>,
  project: Record<string, unknown>,
  format: Sb3SaveFormat,
  {unsandboxed = [], ...options}: Sb3ExtensionFormatCallerOptions = {},
): Promise<Sb3ExtensionFormatResult> {
  try {
    return await writeExtensionFormat(archive, project, format, {
      ...options,
      capabilities: sb3SaveFormatCapabilities,
      unsandboxed: [...dsl4UnsandboxedExtensionIds, ...unsandboxed],
    });
  } catch (error) {
    asBuilderError(error);
  }
}

/** Check what a host will load before writing an SB3 that only looks finished. */
export async function verifySb3ExtensionUrls(
  project: Record<string, unknown>,
  options: Sb3ExtensionUrlCheckOptions = {},
): Promise<readonly string[]> {
  try {
    return await verifyExtensionUrls(project, options);
  } catch (error) {
    asBuilderError(error);
  }
}
