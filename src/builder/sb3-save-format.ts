/**
 * What this builder can write for "save in a chosen format".
 *
 * The vocabulary itself — the three payloads, the four forms, and the shape of a selection — now
 * lives in `@kubohiroya/turbowarp-sb3-save-format`, so the save dialog in the GUI and the
 * per-payload converters name the same forms as this CLI.
 *
 * What stays here is what only this converter knows: which pairs it can actually write, and what
 * is missing when it cannot. Those reasons point at this CLI's own flags and commands, so sharing
 * them would make a save dialog refuse a form with a command-line flag as the reason. The shared
 * package takes them as capabilities instead.
 */

import {
  normalizeSb3SaveSelection as normalizeSelection,
  sb3SaveCapabilities,
  sb3SaveFormatSupport as formatSupport,
  sb3SupportedSaveFormats as supportedFormats,
  describeSb3SaveFormats as describeFormats,
  type Sb3SaveCapabilities,
  type Sb3SaveFormatKey,
} from '@kubohiroya/turbowarp-sb3-save-format';

export {
  sb3SaveFormats,
  sb3SavePayloads,
  type Sb3SaveFormat,
  type Sb3SaveFormatSupport,
  type Sb3SavePayload,
  type Sb3SaveSelection,
} from '@kubohiroya/turbowarp-sb3-save-format';

import type {
  Sb3SaveFormat,
  Sb3SaveFormatSupport,
  Sb3SavePayload,
  Sb3SaveSelection,
} from '@kubohiroya/turbowarp-sb3-save-format';

// This converter rewrites extensions only. Naming any form for source data or assets would be
// accepted and then ignored, so every such choice is refused and leaving it unset keeps it.
const keepSource = 'Omit --source to keep the source data exactly as built.';
const keepAssets = 'Omit --assets to keep the assets exactly as built.';

const unsupported: Readonly<Partial<Record<Sb3SaveFormatKey, string>>> = Object.freeze({
  'source:remote': `A remote source document is owned by turbowarp-document-source, which this package does not depend on yet. ${keepSource}`,
  'source:cached': `A cached source document is owned by turbowarp-document-source, which this package does not depend on yet. ${keepSource}`,
  'source:embedded-file': `The owner component stores its document as text, so a ZIP file form needs the document-source contract. ${keepSource}`,
  'source:embedded-data': `This command does not rewrite source data. ${keepSource}`,
  // Asset delivery is resolved at build time from the asset config, lock and profile, and
  // resolveDsl4AssetDistributionProfile binds exactly one provider per asset. Rewriting a built
  // SB3 would have to rewrite that resolved distribution and its integrity.
  'assets:remote': `Asset delivery is resolved at build time; use build-dsl4 with --asset-config, --asset-lock and --asset-profile remote instead of converting a built SB3. ${keepAssets}`,
  // The bundle and the runtime can carry and use a retained copy of a remote asset, but no build
  // command produces one yet, so naming the build here would send people to something missing.
  'assets:cached': `The asset bundle and the runtime can carry and use a retained copy of a remote asset, but no command produces one yet. ${keepAssets}`,
  'assets:embedded-file': `The runtime reads its assets from the bundle in extensionStorage. It reaches project files only through saveProjectSb3DontZip, which the VM rebuilds from its own asset table, so an arbitrary ZIP entry does not survive to be read. ${keepAssets}`,
  'assets:embedded-data': `This command does not rewrite assets. ${keepAssets}`,
});

/**
 * Project-asset storage is how arbitrary bytes survive the VM at all: the VM rebuilds the project
 * files from its own asset table, so bytes it does not know as an asset are dropped. That makes it
 * the mechanism an `embedded-file` asset would need, rather than a cosmetic extra.
 *
 * The App already writes costumes, backdrops and sounds this way, so this converter points at that
 * command instead of growing a second writer for the same thing.
 */
const projectAssetReason =
  'Costumes, backdrops and sounds are already written by convert-dsl4-assets --to project, which derives the md5ext entry, the bitmap resolution and rotation centre of an image and the rate and sample count of a sound; use it instead of this command.';

/** What this converter can write. The shared package holds no table of its own. */
export const sb3SaveFormatCapabilities: Sb3SaveCapabilities = sb3SaveCapabilities({
  formats: unsupported,
  projectAssets: projectAssetReason,
});

/** Whether this payload can be written in this format, and what is missing when it cannot. */
export function sb3SaveFormatSupport(
  payload: Sb3SavePayload,
  format: Sb3SaveFormat,
): Sb3SaveFormatSupport {
  return formatSupport(payload, format, sb3SaveFormatCapabilities);
}

/** The formats this converter can write for one payload, in declaration order. */
export function sb3SupportedSaveFormats(payload: Sb3SavePayload): readonly Sb3SaveFormat[] {
  return supportedFormats(payload, sb3SaveFormatCapabilities);
}

/**
 * Validate a selection and refuse one this converter cannot honour, naming the payload, the
 * format and what is missing. A payload left unset is kept as it is; a named one is never
 * silently downgraded or ignored.
 */
export function normalizeSb3SaveSelection(input: unknown): Sb3SaveSelection {
  return normalizeSelection(input, sb3SaveFormatCapabilities);
}

/** A one-line report of what this build can write, for `--help` and for diagnostics. */
export function describeSb3SaveFormats(): string {
  return describeFormats(sb3SaveFormatCapabilities);
}
