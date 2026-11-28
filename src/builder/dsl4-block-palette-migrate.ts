import {createHash} from 'node:crypto';
import {lstat, readFile, realpath} from 'node:fs/promises';
import path from 'node:path';
import {
  dsl4ProjectOpcodeForm,
  restoreDsl4BlockPaletteProject,
  unifyDsl4BlockPaletteProject,
  type Dsl4BlockPaletteMigrationReport,
} from '../dsl4/block-palette-migration.js';
import {
  dsl4AuthoringBlockName,
  dsl4BlockSourceBundleExtensionId,
  dsl4BlockSourceRuntimeExtensionId,
  dsl4UnifiedDeclarationsRuntimeCapability,
} from '../dsl4/block-source-shared.js';
import {dsl4HasRuntimeCapability} from '../dsl4/presentation-effects-gate.js';
import {createDsl4BlockAuthoringProjectExtensionSource} from './dsl4-catalog-extensions.js';
import {assertDsl4MigrationPathFree, writeDsl4MigrationOutputs} from './dsl4-migration-output.js';
import {
  readDsl4NarrativeRuntimeExtensionSource,
  readDsl4PlaybackRuntimeExtensionSource,
} from './dsl4-playback-runtime-source.js';
import {packageVersion} from './constants.js';
import {readSb3, serializeSb3} from './sb3.js';

type ObjectRecord = Record<string, unknown>;

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const dataUrlPrefix = 'data:text/javascript;base64,';
const narrativeMarker = '// Kamishibai capabilities: narrative-control-v1';

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), {code});
}

function isRecord(value: unknown): value is ObjectRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface MigrateBlockPaletteFileOptions {
  input: string;
  output: string;
  report?: string;
  /** `unify` moves declarations onto the runtime; `restore` puts them back in the retired extension. */
  direction?: 'unify' | 'restore';
  /** Replaces the runtime an unify needs when the project's own predates the merge. */
  runtimeExtensionSource?: string;
  maxInputBytes?: number;
}

function runtimeSourceOf(project: ObjectRecord, runtimeId: string): string | null {
  const url = isRecord(project.extensionURLs) ? project.extensionURLs[runtimeId] : undefined;
  if (typeof url !== 'string' || !url.startsWith(dataUrlPrefix)) return null;
  return Buffer.from(url.slice(dataUrlPrefix.length), 'base64').toString('utf8');
}

/** The current runtime that replaces one predating the merge: narrative works keep narrative. */
async function replacementRuntime(previous: string | null, supplied: string | undefined) {
  if (supplied !== undefined) return supplied;
  return previous?.includes(narrativeMarker)
    ? readDsl4NarrativeRuntimeExtensionSource('authoring')
    : readDsl4PlaybackRuntimeExtensionSource();
}

function usesBlock(project: ObjectRecord, predicate: (name: string) => boolean): boolean {
  return (Array.isArray(project.targets) ? project.targets : []).some(
    (target) =>
      isRecord(target) &&
      isRecord(target.blocks) &&
      Object.values(target.blocks).some((block) => {
        const name = isRecord(block) ? dsl4AuthoringBlockName(block.opcode) : null;
        return name !== null && predicate(name);
      }),
  );
}

/** Everything a target holds besides its blocks must come out of a migration unchanged. */
function targetMetadata(project: ObjectRecord) {
  return JSON.stringify(
    (project.targets as ObjectRecord[]).map((target) =>
      Object.fromEntries(Object.entries(target).filter(([key]) => key !== 'blocks')),
    ),
  );
}

/**
 * Rewrite an SB3's Block Script declarations into one palette, or back, as a new file.
 *
 * The input is never changed. The output and the optional report are refused if either already
 * exists, and are installed together or not at all. The story the blocks hold, every archived asset
 * and every target's non-block data must be the same afterwards.
 */
export async function migrateDsl4BlockPaletteFile(options: MigrateBlockPaletteFileOptions) {
  const direction = options.direction ?? 'unify';
  if (direction !== 'unify' && direction !== 'restore')
    fail('K4-MIGRATION-PALETTE-DIRECTION', 'The direction must be unify or restore.');
  const input = path.resolve(options.input),
    output = path.resolve(options.output),
    reportPath = options.report === undefined ? undefined : path.resolve(options.report);
  if (output === input || reportPath === input || reportPath === output)
    fail(
      'K4-MIGRATION-IN-PLACE',
      'Input, output and report must name different paths. In-place migration is forbidden.',
    );
  const inputPath = await realpath(input),
    stats = await lstat(inputPath),
    maximum = options.maxInputBytes ?? 512 * 1024 * 1024;
  if (!stats.isFile() || !Number.isSafeInteger(maximum) || maximum < 1 || stats.size > maximum)
    fail('K4-MIGRATION-INPUT', 'Input must be a bounded regular SB3 file.');
  await assertDsl4MigrationPathFree(output);
  if (reportPath) await assertDsl4MigrationPathFree(reportPath);
  const inputBytes = await readFile(inputPath);
  if (inputBytes.length > maximum) fail('K4-MIGRATION-INPUT', 'Input grew beyond its size limit.');
  const {archive, project: original} = readSb3(inputBytes);
  const form = dsl4ProjectOpcodeForm(original);
  const runtimeId =
    form === 'bundle' ? dsl4BlockSourceBundleExtensionId : dsl4BlockSourceRuntimeExtensionId;

  let migrated: {project: ObjectRecord; report: Dsl4BlockPaletteMigrationReport};
  let runtimeRefreshed = false;
  if (direction === 'unify') {
    const project = structuredClone(original);
    const previous = runtimeSourceOf(project, runtimeId);
    if (
      !dsl4HasRuntimeCapability(
        previous ?? undefined,
        undefined,
        dsl4UnifiedDeclarationsRuntimeCapability,
      )
    ) {
      // The blocks are only drawn by a runtime that defines them, so an older one is replaced.
      if (isRecord(project.turboWarpPlus))
        fail(
          'K4-MIGRATION-PALETTE-RUNTIME',
          'The runtime predates the unified palette and a Plus manifest pins it. Save the project in the standard format first.',
        );
      const runtime = await replacementRuntime(previous, options.runtimeExtensionSource);
      if (
        !runtime.includes(`// ID: ${runtimeId}\n`) ||
        !runtime.includes(dsl4UnifiedDeclarationsRuntimeCapability)
      )
        fail(
          'K4-MIGRATION-PALETTE-RUNTIME',
          `A current ${runtimeId} runtime that defines the Block Script declarations is required.`,
        );
      if (!isRecord(project.extensionURLs))
        fail('K4-MIGRATION-PALETTE-RUNTIME', 'The project does not embed its runtime.');
      project.extensionURLs[runtimeId] =
        dataUrlPrefix + Buffer.from(runtime, 'utf8').toString('base64');
      runtimeRefreshed = true;
    }
    migrated = unifyDsl4BlockPaletteProject(project);
  } else {
    const source = createDsl4BlockAuthoringProjectExtensionSource(form, {
      sourceSections: usesBlock(original, (name) => name === 'useSection'),
      narrativeControlEnabled: usesBlock(original, (name) => name.startsWith('narrative')),
    });
    migrated = restoreDsl4BlockPaletteProject(original, source);
  }

  const bytes = serializeSb3(archive, migrated.project),
    verified = readSb3(bytes),
    assetEntries = Object.keys(archive).filter((name) => name !== 'project.json');
  if (
    Object.keys(verified.archive).length !== Object.keys(archive).length ||
    assetEntries.some(
      (name) =>
        !verified.archive[name] ||
        !Buffer.from(verified.archive[name]!).equals(Buffer.from(archive[name]!)),
    )
  )
    fail('K4-MIGRATION-ASSETS', 'An archive payload changed during migration.');
  if (targetMetadata(original) !== targetMetadata(migrated.project))
    fail('K4-MIGRATION-METADATA', 'Unrelated target data changed.');
  const report = {
    ...migrated.report,
    toolVersion: packageVersion,
    inputSha256: hash(inputBytes),
    outputSha256: hash(bytes),
    archiveAssetsPreserved: assetEntries.length,
    runtimeRefreshed,
  };
  const outputs: {path: string; bytes: Uint8Array}[] = [{path: output, bytes}];
  if (reportPath)
    outputs.push({path: reportPath, bytes: Buffer.from(JSON.stringify(report, null, 2) + '\n')});
  await writeDsl4MigrationOutputs(outputs, inputPath);
  return {outputPath: output, ...(reportPath ? {reportPath} : {}), report};
}
