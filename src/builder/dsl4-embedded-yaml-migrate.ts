import {createHash, randomUUID} from 'node:crypto';
import {readFile, lstat, realpath, mkdir, writeFile, link, unlink} from 'node:fs/promises';
import path from 'node:path';
import {migrateDsl4LegacyBlockProject} from '../dsl4/embedded-yaml-migration.js';
import {dsl4BlockAuthoringExtensionId} from '../dsl4/structured-block-source.js';
import {createDsl4BlockAuthoringProjectExtensionSource} from './dsl4-catalog-extensions.js';
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
async function nonexistent(filename: string) {
  try {
    await lstat(filename);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw e;
  }
  fail('K4-MIGRATION-OUTPUT-EXISTS', `Refusing to overwrite an existing path: ${filename}`);
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
  await nonexistent(output);
  if (reportPath) await nonexistent(reportPath);
  const inputBytes = await readFile(inputPath);
  if (inputBytes.length > maximum) fail('K4-MIGRATION-INPUT', 'Input grew beyond its size limit.');
  const {archive, project: original} = readSb3(inputBytes);
  const migrated = await migrateDsl4LegacyBlockProject(original, {
    sourceFrontend: options.sourceFrontend,
    ...(options.entryFile === undefined ? {} : {entryFile: options.entryFile}),
    ...(options.documentPaths === undefined ? {} : {documentPaths: options.documentPaths}),
  });
  const project = structuredClone(migrated.project),
    runtimeId =
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
  if (project.extensions.includes(dsl4BlockAuthoringExtensionId)) {
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
          (block as {opcode?: string}).opcode === dsl4BlockAuthoringExtensionId + '_useSection',
      ),
    );
    const sourceSections =
      hasSectionBlocks || /"opcode":"useSection"[^}]*"hideFromPalette":false/u.test(oldSource);
    const form = migrated.report.channel === 'bundled' ? 'bundle' : 'runtime';
    const source = createDsl4BlockAuthoringProjectExtensionSource(form, {
      sourceSections,
      narrativeControlEnabled: options.narrativeControlEnabled ?? false,
    });
    urls[dsl4BlockAuthoringExtensionId] =
      'data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64');
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
  };
  const outputs: {path: string; bytes: Buffer}[] = [{path: output, bytes}];
  if (reportPath)
    outputs.push({path: reportPath, bytes: Buffer.from(JSON.stringify(report, null, 2) + '\n')});
  const staged: {path: string; temporary: string; installed: boolean; dev: number; ino: number}[] =
    [];
  try {
    for (const item of outputs) {
      await mkdir(path.dirname(item.path), {recursive: true});
      const parent = await realpath(path.dirname(item.path));
      if (path.join(parent, path.basename(item.path)) === inputPath)
        fail('K4-MIGRATION-IN-PLACE', 'Output resolves to the original input file.');
      await nonexistent(item.path);
      const temporary = path.join(parent, `.${path.basename(item.path)}.migration-${randomUUID()}`);
      await writeFile(temporary, item.bytes, {flag: 'wx'});
      const stat = await lstat(temporary);
      staged.push({path: item.path, temporary, installed: false, dev: stat.dev, ino: stat.ino});
    }
    for (const item of staged) {
      await link(item.temporary, item.path);
      item.installed = true;
    }
  } catch (error) {
    for (const item of staged.filter((s) => s.installed).reverse()) {
      const current = await lstat(item.path).catch(() => null);
      if (current?.ino === item.ino && current.dev === item.dev) await unlink(item.path);
    }
    throw error;
  } finally {
    for (const item of staged) await unlink(item.temporary).catch(() => {});
  }
  return {outputPath: output, ...(reportPath ? {reportPath} : {}), report};
}
