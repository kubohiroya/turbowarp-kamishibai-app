/**
 * The vocabulary for "save in a chosen format".
 *
 * Extensions, source data and assets each already had their own words for where their bytes
 * live, in three different packages. This module gives the three one set of names so a save or a
 * conversion can state a choice per payload, and records which choices can actually be written
 * today instead of accepting one and quietly ignoring it.
 *
 * It is deliberately dependency-free so the same vocabulary can move to a shared package once
 * more than this builder needs it.
 */

/** What a saved SB3 carries, each of which can be stored in its own form. */
export type Sb3SavePayload = 'extensions' | 'source' | 'assets';

/**
 * Where the bytes of one payload live in a saved SB3, as the author of the work decided.
 *
 * - `remote-non-cacheable`: only an HTTPS reference is stored, and the bytes are fetched every
 *   time. Nothing is kept in the browser either: the author forbids a copy, because a copy hides
 *   a URL that stopped serving the pinned bytes until the copy runs out, and a work handed to a
 *   shared machine should leave no code behind.
 * - `remote-cacheable`: only an HTTPS reference is stored, and a verified copy may be kept in the
 *   browser. Whether one actually is kept is the opener's to decline, not this file's business.
 * - `embedded-file`: the bytes are a file inside the SB3 ZIP, named by a relative path.
 * - `embedded-data`: the bytes are inside `project.json`, as a `data:` URL. This is also the one
 *   form a standard TurboWarp host opens on its own, because it reads `extensionURLs` and knows
 *   nothing of the Plus Manifest.
 *
 * The last two are siblings: both make a work that runs offline, anywhere, on its own. They
 * differ in the carrier, and the carrier decides who else can read it.
 *
 * These are the Loader's four Manifest source types, spelled identically. One vocabulary, so a
 * choice made in the save screen reaches the Manifest without being translated — every
 * cross-layer defect this family has had came from a translation.
 */
export type Sb3SaveFormat =
  'remote-non-cacheable' | 'remote-cacheable' | 'embedded-file' | 'embedded-data';

export const sb3SavePayloads: readonly Sb3SavePayload[] = Object.freeze([
  'extensions',
  'source',
  'assets',
]);

export const sb3SaveFormats: readonly Sb3SaveFormat[] = Object.freeze([
  'remote-non-cacheable',
  'remote-cacheable',
  'embedded-file',
  'embedded-data',
]);

/** A payload left unset is kept exactly as the project already stores it. */
export interface Sb3SaveSelection {
  readonly extensions?: Sb3SaveFormat | undefined;
  readonly source?: Sb3SaveFormat | undefined;
  readonly assets?: Sb3SaveFormat | undefined;
  /** Also store each asset as an SB3 project asset: a costume, a backdrop or a sound. */
  readonly assetsAsProjectAssets: boolean;
}

export interface Sb3SaveFormatSupport {
  readonly supported: boolean;
  /** Present when the pair cannot be written, saying what is missing. */
  readonly reason?: string;
}

// This converter rewrites extensions only. Naming any form for source data or assets would be
// accepted and then ignored, so every such choice is refused and leaving it unset keeps it.
const keepSource = 'Omit --source to keep the source data exactly as built.';
const keepAssets = 'Omit --assets to keep the assets exactly as built.';

const unsupported: Readonly<Record<string, string>> = Object.freeze({
  'source:remote-non-cacheable': `A remote source document is owned by turbowarp-document-source, which this package does not depend on yet. ${keepSource}`,
  'source:remote-cacheable': `A remote source document is owned by turbowarp-document-source, which this package does not depend on yet. ${keepSource}`,
  'source:embedded-file': `The owner component stores its document as text, so a ZIP file form needs the document-source contract. ${keepSource}`,
  'source:embedded-data': `This command does not rewrite source data. ${keepSource}`,
  // Asset delivery is resolved at build time from the asset config, lock and profile, and
  // resolveDsl4AssetDistributionProfile binds exactly one provider per asset. Rewriting a built
  // SB3 would have to rewrite that resolved distribution and its integrity.
  'assets:remote-non-cacheable': `Asset delivery is resolved at build time; use build-dsl4 with --asset-config, --asset-lock and --asset-profile remote instead of converting a built SB3. ${keepAssets}`,
  // The bundle and the runtime can carry and use a retained copy of a remote asset, but no build
  // command produces one yet, so naming the build here would send people to something missing.
  'assets:remote-cacheable': `The asset bundle and the runtime can carry and use a retained copy of a remote asset, but no command produces one yet. ${keepAssets}`,
  'assets:embedded-file': `The runtime reads its assets from the bundle in extensionStorage. It reaches project files only through saveProjectSb3DontZip, which the VM rebuilds from its own asset table, so an arbitrary ZIP entry does not survive to be read. ${keepAssets}`,
  'assets:embedded-data': `This command does not rewrite assets. ${keepAssets}`,
});

const key = (payload: Sb3SavePayload, format: Sb3SaveFormat) => `${payload}:${format}`;

/** Whether this payload can be written in this format, and what is missing when it cannot. */
export function sb3SaveFormatSupport(
  payload: Sb3SavePayload,
  format: Sb3SaveFormat,
): Sb3SaveFormatSupport {
  if (!sb3SavePayloads.includes(payload)) throw new TypeError(`Unknown save payload ${payload}`);
  if (!sb3SaveFormats.includes(format)) throw new TypeError(`Unknown save format ${format}`);
  const reason = unsupported[key(payload, format)];
  return reason === undefined
    ? Object.freeze({supported: true})
    : Object.freeze({supported: false, reason});
}

/** The formats this converter can write for one payload, in declaration order. */
export function sb3SupportedSaveFormats(payload: Sb3SavePayload): readonly Sb3SaveFormat[] {
  return Object.freeze(
    sb3SaveFormats.filter((format) => sb3SaveFormatSupport(payload, format).supported),
  );
}

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

function optionalFormat(value: unknown, payload: Sb3SavePayload): Sb3SaveFormat | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !sb3SaveFormats.includes(value as Sb3SaveFormat))
    throw new TypeError(
      `The ${payload} format must be one of ${sb3SaveFormats.join(', ')}, received ${String(value)}`,
    );
  return value as Sb3SaveFormat;
}

/**
 * Validate a selection and refuse one this converter cannot honour, naming the payload, the
 * format and what is missing. A payload left unset is kept as it is; a named one is never
 * silently downgraded or ignored.
 */
export function normalizeSb3SaveSelection(input: unknown): Sb3SaveSelection {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('A save selection object is required');
  const record = input as Record<string, unknown>;
  const allowed = new Set([...sb3SavePayloads, 'assetsAsProjectAssets']);
  for (const name of Object.keys(record))
    if (!allowed.has(name as Sb3SavePayload)) throw new TypeError(`Unknown save option ${name}`);
  if (
    record.assetsAsProjectAssets !== undefined &&
    typeof record.assetsAsProjectAssets !== 'boolean'
  )
    throw new TypeError('assetsAsProjectAssets must be a boolean');
  const selection: Sb3SaveSelection = Object.freeze({
    extensions: optionalFormat(record.extensions, 'extensions'),
    source: optionalFormat(record.source, 'source'),
    assets: optionalFormat(record.assets, 'assets'),
    assetsAsProjectAssets: record.assetsAsProjectAssets === true,
  });
  for (const payload of sb3SavePayloads) {
    const format = selection[payload];
    if (format === undefined) continue;
    const support = sb3SaveFormatSupport(payload, format);
    if (!support.supported)
      throw new TypeError(`Cannot save ${payload} as ${format}: ${support.reason}`);
  }
  if (selection.assetsAsProjectAssets)
    throw new TypeError(`Cannot store assets as project assets: ${projectAssetReason}`);
  return selection;
}

/** A one-line report of what this build can write, for `--help` and for diagnostics. */
export function describeSb3SaveFormats(): string {
  return sb3SavePayloads
    .map((payload) => {
      const formats = sb3SupportedSaveFormats(payload);
      return `${payload}: ${formats.length ? formats.join('|') : 'kept as built'}`;
    })
    .join('; ');
}
