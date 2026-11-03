// SPDX-License-Identifier: MPL-2.0

import {encodeReference} from '@kubohiroya/turbowarp-document-source';
import {
  fetchDocumentSource,
  readDocumentSourceURLs,
} from '@kubohiroya/turbowarp-document-data/document-source';
import {kamishibaiEmbeddedYamlReference} from './embedded-yaml-identity.js';

const error = (code: string, message: string, cause?: unknown) =>
  Object.assign(new Error(message), {code, ...(cause === undefined ? {} : {cause})});

type SourceReplacement = (
  project: Record<string, unknown>,
  source: string,
) => Promise<{project: Record<string, unknown>}>;

export interface KamishibaiDocumentSourceRuntimeOptions {
  /** The runtime's own network capability; this module never reaches for an ambient one. */
  readonly fetch?: typeof globalThis.fetch | undefined;
  /** Validates the fetched source and rewrites the owner component in the given project. */
  readonly replaceSource: SourceReplacement;
  readonly documentSourceEnabled: boolean;
  readonly signal?: AbortSignal | undefined;
}

/** True when this project stores its document outside the SB3, at an HTTPS location. */
export function hasKamishibaiDocumentSourceURL(project: Record<string, unknown>): boolean {
  return readDocumentSourceURLs(project).length > 0;
}

/**
 * Re-fetch and revalidate URL documents when playback starts, so a remote script is never
 * replayed from a cached copy. A disabled capability, a missing network capability, a failed
 * request and an invalid document all refuse to run rather than falling back to that copy.
 */
export async function resolveKamishibaiDocumentSourceProject(
  project: Record<string, unknown>,
  options: KamishibaiDocumentSourceRuntimeOptions,
): Promise<Record<string, unknown>> {
  const entries = readDocumentSourceURLs(project);
  if (!entries.length) return project;
  if (!options.documentSourceEnabled)
    throw error(
      'K4-SOURCE-URL-DISABLED',
      'This story reads its script from a URL, which this runtime was started without.',
    );
  if (typeof options.fetch !== 'function')
    throw error(
      'K4-SOURCE-URL-UNAVAILABLE',
      'This runtime has no network capability for a URL script.',
    );
  const owned = encodeReference(kamishibaiEmbeddedYamlReference);
  let resolved = project;
  for (const entry of entries) {
    if (encodeReference(entry.reference) !== owned)
      throw error(
        'K4-SOURCE-URL-UNKNOWN',
        'This story has a URL script for a document this runtime does not own.',
      );
    let fetched: {readonly source: string};
    try {
      fetched = await fetchDocumentSource(entry.url, {
        fetch: options.fetch,
        ...(options.signal ? {signal: options.signal} : {}),
      });
    } catch (cause) {
      throw error('K4-SOURCE-URL-FETCH-FAILED', 'The URL script could not be read.', cause);
    }
    // Replacement rewrites the owner component in place, so never hand it a caller's project.
    resolved = (await options.replaceSource(structuredClone(resolved), fetched.source)).project;
  }
  return resolved;
}
