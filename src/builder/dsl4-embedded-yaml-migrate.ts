import {createHash} from 'node:crypto';
import {readFile, lstat, realpath} from 'node:fs/promises';
import path from 'node:path';
import {migrateDsl4LegacyBlockProject} from '../dsl4/embedded-yaml-migration.js';
import {unifyDsl4BlockPaletteProject} from '../dsl4/block-palette-migration.js';
import {
  dsl4AuthoringBlockName,
  dsl4BlockAuthoringExtensionId,
  dsl4UnifiedDeclarationsRuntimeCapability,
} from '../dsl4/block-source-shared.js';
import {createDsl4BlockAuthoringProjectExtensionSource} from './dsl4-catalog-extensions.js';
import {assertDsl4MigrationPathFree, writeDsl4MigrationOutputs} from './dsl4-migration-output.js';
import {
  readDsl4PlaybackRuntimeExtensionSource,
  readDsl4NarrativeRuntimeExtensionSource,
} from './dsl4-playback-runtime-source.js';
import {readSb3, serializeSb3} from './sb3.js';
import {packageVersion} from './constants.js';
import type {Dsl4SourceFrontend} from '../dsl4/source-frontend.js';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), {code});
}
export interface MigrateEmbeddedYamlFileOptions {
  input: string;
  output: string;
  entryFile?: string;
  report?: string;
  documentPaths?: Readonly<Record<string, string>>;
  sourceFrontend: Dsl4SourceFrontend;
  runtimeExtensionSource?: string;
  narrativeControlEnabled?: boolean;
  maxInputBytes?: number;
}
/** Build and validate every artifact before creating an exclusive new output file. */
export async function migrateDsl4EmbeddedYamlFile(options: MigrateEmbeddedYamlFileOptions) {
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
  const migrated = await migrateDsl4LegacyBlockProject(original, {
    sourceFrontend: options.sourceFrontend,
    ...(options.entryFile === undefined ? {} : {entryFile: options.entryFile}),
    ...(options.documentPaths === undefined ? {} : {documentPaths: options.documentPaths}),
  });
  let project = structuredClone(migrated.project);
  const runtimeId =
    migrated.report.channel === 'bundled'
      ? 'kubohiroyakamishibai4'
      : 'kubohiroyakamishibairuntime4';
  const runtime =
    options.runtimeExtensionSource ??
    (options.narrativeControlEnabled
      ? await readDsl4NarrativeRuntimeExtensionSource('playback')
      : await readDsl4PlaybackRuntimeExtensionSource());
  if (
    typeof runtime !== 'string' ||
    !runtime.includes(`// ID: ${runtimeId}\n`) ||
    !runtime.includes('embeddedYamlRoot') ||
    !runtime.includes('sourceDocuments')
  )
    fail(
      'K4-MIGRATION-RUNTIME',
      `A current official ${runtimeId} runtime with named-document support is required. Supply runtimeExtensionSource for an unbundled development runtime.`,
    );
  const urls = project.extensionURLs as Record<string, unknown>;
  if (
    !urls ||
    typeof urls !== 'object' ||
    Array.isArray(urls) ||
    !Array.isArray(project.extensions) ||
    !project.extensions.includes(runtimeId)
  )
    fail('K4-MIGRATION-RUNTIME', 'The original project does not declare its owning runtime.');
  urls[runtimeId] =
    'data:text/javascript;base64,' + Buffer.from(runtime, 'utf8').toString('base64');
  // The refreshed runtime defines the Block Script declarations itself, so blocks the project
  // kept in the retired extension move onto its opcodes and that extension is dropped.
  // A runtime from before the merge still draws the declarations with the retired extension, so
  // that extension is refreshed to the current variant for the project's form instead.
  const unified = runtime.includes(dsl4UnifiedDeclarationsRuntimeCapability)
    ? unifyDsl4BlockPaletteProject(project)
    : null;
  if (unified) project = unified.project;
  else if (
    Array.isArray(project.extensions) &&
    project.extensions.includes(dsl4BlockAuthoringExtensionId)
  ) {
    const oldURL = urls[dsl4BlockAuthoringExtensionId];
    const oldSource =
      typeof oldURL === 'string' && oldURL.startsWith('data:text/javascript;base64,')
        ? Buffer.from(oldURL.slice(oldURL.indexOf(',') + 1), 'base64').toString('utf8')
        : '';
    const hasSectionBlocks = (project.targets as Record<string, unknown>[]).some((target) =>
      Object.values(target.blocks as Record<string, unknown>).some(
        (block) =>
          block &&
          typeof block === 'object' &&
          dsl4AuthoringBlockName((block as {opcode?: unknown}).opcode) === 'useSection',
      ),
    );
    const sourceSections =
      hasSectionBlocks || /"opcode":"useSection"[^}]*"hideFromPalette":false/u.test(oldSource);
    const form = migrated.report.channel === 'bundled' ? 'bundle' : 'runtime';
    urls[dsl4BlockAuthoringExtensionId] =
      'data:text/javascript;base64,' +
      Buffer.from(
        createDsl4BlockAuthoringProjectExtensionSource(form, {
          sourceSections,
          narrativeControlEnabled: options.narrativeControlEnabled ?? false,
        }),
        'utf8',
      ).toString('base64');
  }
  const bytes = serializeSb3(archive, project),
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
  const beforeMetadata = original.targets.map((target: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(target).filter(([key]) => !['blocks', 'comments'].includes(key)),
      ),
    ),
    afterMetadata = (project.targets as Record<string, unknown>[]).map(
      (target: Record<string, unknown>) =>
        Object.fromEntries(
          Object.entries(target).filter(([key]) => !['blocks', 'comments'].includes(key)),
        ),
    );
  if (JSON.stringify(beforeMetadata) !== JSON.stringify(afterMetadata))
    fail('K4-MIGRATION-METADATA', 'Unrelated target data changed.');
  const report = {
    ...migrated.report,
    toolVersion: packageVersion,
    inputSha256: hash(inputBytes),
    outputSha256: hash(bytes),
    archiveAssetsPreserved: assetEntries.length,
    runtimeRefreshed: true,
    paletteUnified:
      unified !== null &&
      (unified.report.rewrittenBlocks > 0 || unified.report.authoringExtensionChanged),
  };
  const outputs: {path: string; bytes: Uint8Array}[] = [{path: output, bytes}];
  if (reportPath)
    outputs.push({path: reportPath, bytes: Buffer.from(JSON.stringify(report, null, 2) + '\n')});
  await writeDsl4MigrationOutputs(outputs, inputPath);
  return {outputPath: output, ...(reportPath ? {reportPath} : {}), report};
}
