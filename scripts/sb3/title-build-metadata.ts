import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cp, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {strFromU8, unzipSync} from 'fflate';
import {
  appShellCommon,
  appShellLocales,
  appShellTitleLines,
  appShellVersion4TitleLines,
  resolveAppShellProjectPlaceholders,
} from './app-shell-locales.ts';

export const titleVersionPlaceholder = 'Version {{VERSION}} ({{BUILD_DATE}})';
export const officialWebsiteFaviconPlaceholder = '{{OFFICIAL_WEBSITE_FAVICON}}';
export const titleBuildDateEnvironmentVariable = 'KAMISHIBAI_BUILD_DATE';
// Published release SB3s are immutable, so the opcodes of the `about.version` block they were built
// with stay readable. Current builds no longer emit that block.
const legacyVersionSetTextValueOpcodes = new Set([
  'kubohiroyaassetcache_setTextValue',
  'kubohiroyaassetmanager_setTextValue',
  'kubohiroyakamishibai4_setTextValue',
  'kubohiroyakamishibairuntime4_setTextValue',
  'kubohiroyakamishibai4_kubohiroyakamishibairuntime4__setTextValue',
  'tmposebundle_kubohiroyaassetcache__setTextValue',
  'tmposebundle_kubohiroyaassetmanager__setTextValue',
]);

/** One costume or sound entry inside an SB3 target. */
interface Sb3Asset {
  readonly name?: string;
  readonly dataFormat?: string;
  readonly md5ext: string;
  readonly assetId?: string;
}

/** One SB3 target, as far as the title metadata step reads it. */
interface Sb3Target {
  readonly isStage?: boolean;
  readonly name?: string;
  readonly costumes?: Sb3Asset[];
  readonly sounds?: Sb3Asset[];
  readonly blocks?: Record<string, Sb3Block>;
}

/** One block, read only for the asset-manager call that stamps the version text. */
interface Sb3Block {
  readonly opcode?: string;
  readonly inputs?: Record<string, unknown>;
}

/** The project.json this step reads and rewrites. */
interface Sb3Project {
  readonly targets: Sb3Target[];
}

/** The staged SB3 source manifest, whose archive entry list is rewritten as assets are stamped. */
interface Sb3SourceManifest {
  archiveEntries: string[];
}

/** The project the stamping step rewrites, whose asset identities change as it goes. */
interface MutableSb3Project {
  readonly targets: {
    readonly isStage?: boolean;
    readonly name?: string;
    costumes?: Sb3MutableAsset[];
    sounds?: Sb3MutableAsset[];
  }[];
}

/** One SVG asset the stamping step rewrites in place, so its identity fields are mutable. */
interface Sb3MutableAsset {
  name?: string;
  dataFormat?: string;
  md5ext: string;
  assetId?: string;
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function replaceProjectPlaceholders(
  value: unknown,
  replacements: Readonly<Record<string, string>>,
): unknown {
  if (typeof value === 'string') {
    return replacements[value] ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((nestedValue) => replaceProjectPlaceholders(nestedValue, replacements));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        replaceProjectPlaceholders(nestedValue, replacements),
      ]),
    );
  }
  return value;
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function assertValidBuildDate(buildDate: unknown) {
  assert(
    typeof buildDate === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(buildDate),
    `${titleBuildDateEnvironmentVariable} must use YYYY-MM-DD: ${buildDate}`,
  );
  // The pattern above has already required three numeric parts.
  const [year = 0, month = 0, day = 0] = buildDate.split('-').map(Number);
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  assert(
    month >= 1 && month <= 12 && day >= 1 && day <= (daysInMonth[month - 1] ?? 0),
    `${titleBuildDateEnvironmentVariable} is not a valid calendar date: ${buildDate}`,
  );
  return buildDate;
}

function formatTokyoDate(now: unknown) {
  assert(now instanceof Date && !Number.isNaN(now.valueOf()), 'A valid build time is required.');
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(({type, value: partValue}) => [type, partValue]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function resolveTitleBuildMetadata({
  buildDate,
  environment = process.env,
  now = new Date(),
  version,
}: {
  // Both stay `unknown`: the assertions below are what establish their types.
  buildDate?: unknown;
  environment?: NodeJS.ProcessEnv;
  now?: Date;
  version?: unknown;
} = {}) {
  assert(
    typeof version === 'string' && /^[0-9A-Za-z.+-]+$/u.test(version),
    `Invalid package version for the Title backdrop: ${version}`,
  );
  const resolvedBuildDate = assertValidBuildDate(
    buildDate ?? environment[titleBuildDateEnvironmentVariable] ?? formatTokyoDate(now),
  );
  const displayDate = resolvedBuildDate.replaceAll('-', '/');
  return Object.freeze({
    buildDate: resolvedBuildDate,
    label: `Version ${version} (${displayDate})`,
    version,
  });
}

/**
 * The stamped `Version … (YYYY/MM/DD)` label of a built SB3.
 *
 * Current builds carry it only in the Title backdrop, which is what the title shows. Releases up to
 * 4.0.22 also stamped it into a disconnected `setTextValue about.version` block; those archives are
 * immutable, so that block stays the authority wherever it exists.
 */
function readTitleVersionLabel(project: Sb3Project, titleSvg: string) {
  const versionBlocks = project.targets
    .flatMap((target) => Object.values(target.blocks ?? {}))
    .filter((block) => {
      if (!legacyVersionSetTextValueOpcodes.has(String(block.opcode))) return false;
      return (
        (block.inputs?.NAME as [unknown, [unknown, unknown]] | undefined)?.[1]?.[1] ===
        'about.version'
      );
    });
  assert(
    versionBlocks.length <= 1,
    'A legacy SB3 must set at most one runtime about.version text asset.',
  );
  if (versionBlocks.length === 1) {
    const legacyLabel = (
      versionBlocks[0]?.inputs?.VALUE as [unknown, [unknown, unknown]] | undefined
    )?.[1]?.[1];
    assert(typeof legacyLabel === 'string', 'The legacy about.version value must be literal text.');
    return legacyLabel;
  }
  const labels = titleSvg.match(/Version [0-9A-Za-z.+-]+ \(\d{4}\/\d{2}\/\d{2}\)/gu) ?? [];
  assert.equal(
    labels.length,
    1,
    'The Title backdrop must show exactly one stamped version and build date.',
  );
  return String(labels[0]);
}

export function readTitleBuildMetadataFromSb3(archiveBytes: Uint8Array) {
  const archive = unzipSync(new Uint8Array(archiveBytes));
  assert(archive['project.json'], 'The SB3 archive must contain project.json.');
  const project: Sb3Project = JSON.parse(strFromU8(archive['project.json']));
  const stages = project.targets.filter((target) => target.isStage);
  assert.equal(stages.length, 1, 'The SB3 archive must contain exactly one Stage target.');
  const stageCostumes = stages[0]?.costumes ?? [];
  const titleCostumes = stageCostumes.filter((costume) => costume.name === 'Title');
  assert.equal(titleCostumes.length, 1, 'The Stage must contain exactly one Title backdrop.');
  assert.equal(
    stageCostumes.some((costume) => costume.name === 'Title-en'),
    false,
    'The Stage must use one locale-independent Title backdrop.',
  );
  const titleCostume = titleCostumes[0] as Sb3Asset;
  assert.equal(titleCostume.dataFormat, 'svg', 'The Title backdrop must be an SVG asset.');
  const titleAsset = archive[titleCostume.md5ext];
  assert(titleAsset, `The SB3 archive is missing the Title asset: ${titleCostume.md5ext}`);
  const versionLabel = readTitleVersionLabel(project, strFromU8(titleAsset));
  const metadataMatches = [
    ...versionLabel.matchAll(/Version ([0-9A-Za-z.+-]+) \((\d{4}\/\d{2}\/\d{2})\)/gu),
  ];
  assert.equal(
    metadataMatches.length,
    1,
    'The title version text must contain exactly one stamped version and build date.',
  );
  const [firstMatch] = metadataMatches;
  const [, version, displayDate] = firstMatch ?? [];
  const metadata = resolveTitleBuildMetadata({
    buildDate: String(displayDate).replaceAll('/', '-'),
    environment: {},
    version: String(version),
  });
  assert.equal(
    metadata.label,
    firstMatch?.[0],
    'The title version text contains invalid build metadata.',
  );
  return metadata;
}

async function readPackageVersion(packageJsonPath: string) {
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  return packageJson.version;
}

async function stampSvgAsset({
  assetsDirectory,
  costume,
  description,
  placeholder,
  project,
  replacement,
  sourceManifest,
}: {
  assetsDirectory: string;
  costume: Sb3MutableAsset;
  description: string;
  placeholder: string;
  project: Sb3Project;
  replacement: string;
  sourceManifest: Sb3SourceManifest;
}) {
  assert.equal(costume.dataFormat, 'svg', `${description} must be an SVG asset.`);
  const originalFilename = costume.md5ext;
  const references = project.targets
    .flatMap((target) => [...(target.costumes ?? []), ...(target.sounds ?? [])])
    .filter((asset) => asset.md5ext === originalFilename);
  assert.equal(
    references.length,
    1,
    `${description} must have exactly one Scratch asset reference: ${originalFilename}`,
  );

  const originalAssetPath = path.join(assetsDirectory, originalFilename);
  const originalSvg = await readFile(originalAssetPath, 'utf8');
  assert.equal(
    originalSvg.split(placeholder).length,
    2,
    `${description} must contain exactly one placeholder: ${placeholder}`,
  );
  const stampedSvg = originalSvg.replace(placeholder, replacement);
  const assetId = createHash('md5').update(stampedSvg).digest('hex');
  const filename = `${assetId}.svg`;

  costume.assetId = assetId;
  costume.md5ext = filename;
  const archiveEntryIndexes = sourceManifest.archiveEntries
    .map((entryName, index) => (entryName === originalFilename ? index : -1))
    .filter((index) => index >= 0);
  assert.equal(
    archiveEntryIndexes.length,
    1,
    `The source manifest must contain ${description} exactly once: ${originalFilename}`,
  );
  sourceManifest.archiveEntries[Number(archiveEntryIndexes[0])] = filename;

  await writeFile(path.join(assetsDirectory, filename), stampedSvg);
  if (filename !== originalFilename) {
    await rm(originalAssetPath);
  }

  return Object.freeze({assetId, filename});
}

async function svgAssetContainsPlaceholder(
  assetsDirectory: string,
  costume: Sb3MutableAsset,
  placeholder: string,
) {
  if (costume.dataFormat !== 'svg') return false;
  const svg = await readFile(path.join(assetsDirectory, costume.md5ext), 'utf8');
  return svg.includes(placeholder);
}

async function stampTitleSource(
  sourceDirectory: string,
  faviconPath: string,
  metadata: ReturnType<typeof resolveTitleBuildMetadata>,
) {
  const projectPath = path.join(sourceDirectory, 'project.source.json');
  const sourceManifestPath = path.join(sourceDirectory, 'sb3-source.json');
  const assetsDirectory = path.join(sourceDirectory, 'assets');
  const [projectSource, sourceManifestSource] = await Promise.all([
    readFile(projectPath, 'utf8'),
    readFile(sourceManifestPath, 'utf8'),
  ]);
  const projectPlaceholders = resolveAppShellProjectPlaceholders(metadata.version);
  const replacements = Object.freeze({
    ...projectPlaceholders,
    [titleVersionPlaceholder]: metadata.label,
  });
  const project = replaceProjectPlaceholders(
    JSON.parse(projectSource),
    replacements,
  ) as MutableSb3Project;
  const sourceManifest: Sb3SourceManifest = JSON.parse(sourceManifestSource);
  const stages = project.targets.filter((target) => target.isStage);
  assert.equal(stages.length, 1, 'The app source must contain exactly one Stage target.');
  const stageCostumes = stages[0]?.costumes ?? [];
  const titleCostumes = stageCostumes.filter((costume) => costume.name === 'Title');
  assert.equal(
    titleCostumes.length,
    1,
    'The Stage must contain exactly one locale-independent Title backdrop.',
  );
  assert.equal(
    stageCostumes.some((costume) => costume.name === 'Title-en'),
    false,
    'The Stage must not contain a locale-specific Title-en backdrop.',
  );
  const titleCostume = titleCostumes[0] as Sb3MutableAsset;
  assert.equal(titleCostume.dataFormat, 'svg', 'The Title backdrop must be an SVG asset.');
  assert(
    sourceManifest.archiveEntries.includes(titleCostume.md5ext),
    `The source manifest is missing the Title backdrop: ${titleCostume.md5ext}`,
  );
  const runtimeTitleCostumes = stageCostumes.filter((costume) => costume.name === 'TitleRuntime');
  assert.equal(
    runtimeTitleCostumes.length,
    1,
    'The Stage must contain exactly one locale-independent TitleRuntime backdrop.',
  );
  const officialWebsiteTargets = project.targets.filter(
    (target) => target.name === 'officialWebsiteButton',
  );
  assert(
    officialWebsiteTargets.length <= 1,
    'The app source must contain at most one officialWebsiteButton target.',
  );
  const officialWebsiteCostumes =
    officialWebsiteTargets[0]?.costumes?.filter(
      (costume) => costume.name === 'official-website-button',
    ) ?? [];
  const officialWebsiteRuntimeCostumes =
    officialWebsiteTargets[0]?.costumes?.filter(
      (costume) => costume.name === 'official-website-button-runtime',
    ) ?? [];
  if (officialWebsiteTargets.length === 1) {
    assert.equal(
      officialWebsiteCostumes.length,
      1,
      'officialWebsiteButton must contain exactly one locale-independent costume.',
    );
    assert.equal(
      officialWebsiteRuntimeCostumes.length,
      1,
      'officialWebsiteButton must contain exactly one runtime costume.',
    );
  }
  const titleLines = metadata.version.startsWith('4.')
    ? appShellVersion4TitleLines
    : appShellTitleLines;
  const localized = appShellLocales.en;
  const titleReplacements = [
    [titleVersionPlaceholder, metadata.label],
    ['{{ABOUT_TITLE}}', escapeXml(localized.about.title)],
    ['{{ABOUT_LICENSE_APP_LINE_1}}', escapeXml(String(titleLines.en.licenseApp[0]))],
    ['{{ABOUT_LICENSE_APP_LINE_2}}', escapeXml(String(titleLines.en.licenseApp[1]))],
    ['{{ABOUT_LICENSE_STORY_LINE_1}}', escapeXml(String(titleLines.en.licenseStory[0]))],
    ['{{ABOUT_LICENSE_STORY_LINE_2}}', escapeXml(String(titleLines.en.licenseStory[1]))],
    [
      '{{ABOUT_AUTHOR_ORGANIZATION_LINE_1}}',
      escapeXml(String(titleLines.en.authorOrganization[0])),
    ],
    [
      '{{ABOUT_AUTHOR_ORGANIZATION_LINE_2}}',
      escapeXml(String(titleLines.en.authorOrganization[1])),
    ],
    ['{{ABOUT_AUTHOR_NAME}}', escapeXml(localized.about.author.name)],
    ['{{ABOUT_AUTHOR_EMAIL}}', escapeXml(appShellCommon.about.author.email)],
  ];
  let titleAsset;
  for (const [placeholder, replacement] of titleReplacements) {
    titleAsset = await stampSvgAsset({
      assetsDirectory,
      costume: titleCostume,
      description: 'The initial Title fallback SVG',
      placeholder: String(placeholder),
      project,
      replacement: String(replacement),
      sourceManifest,
    });
  }
  let localizedTitleAsset = null;
  if (
    await svgAssetContainsPlaceholder(
      assetsDirectory,
      runtimeTitleCostumes[0] as Sb3MutableAsset,
      '{{ABOUT_TITLE}}',
    )
  ) {
    const localized = appShellLocales.ja;
    const localizedTitleReplacements = [
      [titleVersionPlaceholder, metadata.label],
      ['{{ABOUT_TITLE}}', escapeXml(localized.about.title)],
      ['{{ABOUT_LICENSE_APP_LINE_1}}', escapeXml(String(titleLines.ja.licenseApp[0]))],
      ['{{ABOUT_LICENSE_APP_LINE_2}}', escapeXml(String(titleLines.ja.licenseApp[1]))],
      ['{{ABOUT_LICENSE_STORY_LINE_1}}', escapeXml(String(titleLines.ja.licenseStory[0]))],
      ['{{ABOUT_LICENSE_STORY_LINE_2}}', escapeXml(String(titleLines.ja.licenseStory[1]))],
      [
        '{{ABOUT_AUTHOR_ORGANIZATION_LINE_1}}',
        escapeXml(String(titleLines.ja.authorOrganization[0])),
      ],
      [
        '{{ABOUT_AUTHOR_ORGANIZATION_LINE_2}}',
        escapeXml(String(titleLines.ja.authorOrganization[1])),
      ],
      ['{{ABOUT_AUTHOR_NAME}}', escapeXml(localized.about.author.name)],
      ['{{ABOUT_AUTHOR_EMAIL}}', escapeXml(appShellCommon.about.author.email)],
    ];
    for (const [placeholder, replacement] of localizedTitleReplacements) {
      localizedTitleAsset = await stampSvgAsset({
        assetsDirectory,
        costume: runtimeTitleCostumes[0] as Sb3MutableAsset,
        description: 'The localized TitleRuntime SVG',
        placeholder: String(placeholder),
        project,
        replacement: String(replacement),
        sourceManifest,
      });
    }
  }
  let officialWebsiteFallbackAsset = null;
  let officialWebsiteAsset = null;
  if (officialWebsiteTargets.length === 1) {
    const favicon = await readFile(faviconPath);
    officialWebsiteFallbackAsset = await stampSvgAsset({
      assetsDirectory,
      costume: officialWebsiteCostumes[0] as Sb3MutableAsset,
      description: 'The initial official-website-button fallback SVG',
      placeholder: officialWebsiteFaviconPlaceholder,
      project,
      replacement: favicon.toString('base64'),
      sourceManifest,
    });
    officialWebsiteFallbackAsset = await stampSvgAsset({
      assetsDirectory,
      costume: officialWebsiteCostumes[0] as Sb3MutableAsset,
      description: 'The initial official-website-button fallback SVG',
      placeholder: '{{ABOUT_OFFICIAL_WEBSITE_NAME}}',
      project,
      replacement: escapeXml(localized.about.officialWebsite.name),
      sourceManifest,
    });
    officialWebsiteAsset = await stampSvgAsset({
      assetsDirectory,
      costume: officialWebsiteRuntimeCostumes[0] as Sb3MutableAsset,
      description: 'The runtime official-website-button SVG',
      placeholder: officialWebsiteFaviconPlaceholder,
      project,
      replacement: favicon.toString('base64'),
      sourceManifest,
    });
    if (
      await svgAssetContainsPlaceholder(
        assetsDirectory,
        officialWebsiteRuntimeCostumes[0] as Sb3MutableAsset,
        '{{ABOUT_OFFICIAL_WEBSITE_NAME}}',
      )
    ) {
      officialWebsiteAsset = await stampSvgAsset({
        assetsDirectory,
        costume: officialWebsiteRuntimeCostumes[0] as Sb3MutableAsset,
        description: 'The localized runtime official-website-button SVG',
        placeholder: '{{ABOUT_OFFICIAL_WEBSITE_NAME}}',
        project,
        replacement: escapeXml(appShellLocales.ja.about.officialWebsite.name),
        sourceManifest,
      });
    }
  }

  const resolvedProjectSource = `${JSON.stringify(project, null, 2)}\n`;
  for (const placeholder of Object.keys(projectPlaceholders)) {
    assert(
      !resolvedProjectSource.includes(placeholder),
      `The app project contains an unresolved app-shell placeholder: ${placeholder}`,
    );
  }
  assert(
    !resolvedProjectSource.includes(titleVersionPlaceholder),
    'The app project contains unresolved Title build metadata.',
  );

  await Promise.all([
    writeFile(projectPath, resolvedProjectSource),
    writeFile(sourceManifestPath, `${JSON.stringify(sourceManifest, null, 2)}\n`),
  ]);

  return Object.freeze({
    officialWebsiteAsset,
    officialWebsiteFallbackAsset,
    localizedTitleAsset,
    titleAsset: Object.freeze({...titleAsset, label: metadata.label}),
  });
}

export async function withTitleBuildMetadataSource<T>(
  {
    buildDate,
    environment = process.env,
    faviconPath,
    now = new Date(),
    packageJsonPath,
    sourceDirectory,
    version,
  }: {
    buildDate?: unknown;
    environment?: NodeJS.ProcessEnv;
    faviconPath?: unknown;
    now?: Date;
    packageJsonPath?: unknown;
    sourceDirectory?: unknown;
    version?: unknown;
  },
  callback: (source: {
    metadata: ReturnType<typeof resolveTitleBuildMetadata>;
    sourceDirectory: string;
  }) => Promise<T>,
) {
  assert(typeof sourceDirectory === 'string', 'The app source directory is required.');
  assert(typeof packageJsonPath === 'string', 'The package.json path is required.');
  assert(typeof faviconPath === 'string', 'The site favicon path is required.');
  assert(typeof callback === 'function', 'A versioned source callback is required.');
  const resolvedVersion = version ?? (await readPackageVersion(packageJsonPath));
  const metadata = resolveTitleBuildMetadata({
    buildDate,
    environment,
    now,
    version: resolvedVersion,
  });
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'tmpose-title-build-'));
  const temporarySource = path.join(temporaryRoot, 'app');

  try {
    await cp(sourceDirectory, temporarySource, {recursive: true});
    const stampedAssets = await stampTitleSource(temporarySource, faviconPath, metadata);
    return await callback({
      metadata: Object.freeze({...metadata, ...stampedAssets}),
      sourceDirectory: temporarySource,
    });
  } finally {
    await rm(temporaryRoot, {force: true, recursive: true});
  }
}
