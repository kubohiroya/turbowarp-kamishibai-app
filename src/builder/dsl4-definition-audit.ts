import {lstat, mkdir, mkdtemp, open, realpath, rename, rm} from 'node:fs/promises';
import path from 'node:path';
import {LineCounter, parseDocument} from 'yaml';
import {unzipSync} from 'fflate';

import {auditDsl4Definitions, dsl4DefinitionJsonPath} from '../dsl4/definition-audit.js';
import {definitionRecord} from '../dsl4/definition-references.js';
import {
  resolveDsl4ImplicitProjectAssets,
  Dsl4ImplicitProjectAssetError,
} from '../dsl4/implicit-project-assets.js';
import type {Dsl4DefinitionPath} from '../dsl4/definition-references.js';
import {
  createDsl4SourceGraph,
  Dsl4SourceGraphError,
  dsl4SourceGraphDefaultLimits,
} from '../dsl4/source-graph.js';
import {createDsl4SourceGraphFrontend} from '../dsl4/source-graph-frontend.js';
import {createDsl4BlockSourceGraph} from '../dsl4/block-source-export.js';
import {locateDsl4BlockDiagnostic} from '../dsl4/block-source-diagnostic-location.js';
import {extractDsl4BlockSourcesFromProject} from '../dsl4/turbowarp-yaml-json-block-source.js';
import {deepFreeze, sourceRangeForNode} from '../dsl4/story-document.js';
import type {Dsl4SourceFrontend} from '../dsl4/source-frontend.js';
import {Sb3BuilderError} from './errors.js';

export interface Dsl4DefinitionAuditOptions {
  input: string;
  projectRoot?: string;
  base?: string;
  controlProfile?: string;
  removeUnused?: boolean;
  outputDir?: string;
  maxSourceBytes?: number;
  maxSourceFiles?: number;
  maxTotalSourceBytes?: number;
  maxIncludeDepth?: number;
  maxProjectBytes?: number;
  sourceFrontend: Dsl4SourceFrontend;
  schema: unknown;
}

function fail(message: string): never {
  throw new Sb3BuilderError(message, {
    stage: 'dsl4-definition-audit',
    code: 'K4-DEFINITION-AUDIT-001',
  });
}

async function boundedRead(filePath: string, maximum: number) {
  const handle = await open(filePath, 'r');
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > maximum)
      fail('Input must be a regular file within its byte limit');
    const bytes = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, null);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    const after = await handle.stat();
    if (
      length !== before.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    )
      fail('Input changed during the audit');
    return bytes.subarray(0, length);
  } finally {
    await handle.close();
  }
}

function positive(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError(`${name} must be a positive safe integer`);
  return value;
}

function projectMetadata(bytes: Uint8Array) {
  let found = false;
  const archive = unzipSync(bytes, {
    filter(entry) {
      if (entry.name !== 'project.json') return false;
      if (found || entry.originalSize > 16 * 1024 * 1024)
        fail('SB3 project.json must be unique and at most 16 MiB');
      found = true;
      return true;
    },
  });
  const data = archive['project.json'];
  if (!data) fail('SB3 project.json is missing');
  const project: unknown = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(data));
  if (!Array.isArray(definitionRecord(project).targets))
    fail('SB3 project.json must contain targets');
  return project;
}

/** Audit a bounded source graph or block SB3; a fresh output directory is the only write target. */
export async function auditDsl4ProjectDefinitions(options: Dsl4DefinitionAuditOptions) {
  if (Boolean(options.removeUnused) !== (options.outputDir !== undefined))
    fail('--remove-unused and --output-dir must be supplied together');
  const limits = {
    maxSourceBytes: positive(
      options.maxSourceBytes ?? dsl4SourceGraphDefaultLimits.maxSourceBytes,
      'maxSourceBytes',
    ),
    maxSourceFiles: positive(
      options.maxSourceFiles ?? dsl4SourceGraphDefaultLimits.maxSourceFiles,
      'maxSourceFiles',
    ),
    maxTotalSourceBytes: positive(
      options.maxTotalSourceBytes ?? dsl4SourceGraphDefaultLimits.maxTotalSourceBytes,
      'maxTotalSourceBytes',
    ),
    maxIncludeDepth: positive(
      options.maxIncludeDepth ?? dsl4SourceGraphDefaultLimits.maxIncludeDepth,
      'maxIncludeDepth',
    ),
  };
  const maxProjectBytes = positive(options.maxProjectBytes ?? 512 * 1024 * 1024, 'maxProjectBytes');
  const input = path.resolve(options.input);
  let project: unknown;
  let blockSources: ReturnType<typeof extractDsl4BlockSourcesFromProject> | undefined;
  let graph: Awaited<ReturnType<typeof createDsl4SourceGraph>>;
  if (path.extname(input).toLowerCase() === '.sb3') {
    if (options.base !== undefined) fail('--base cannot be combined with an SB3 input');
    project = projectMetadata(await boundedRead(input, maxProjectBytes));
    blockSources = extractDsl4BlockSourcesFromProject(project);
    graph = await createDsl4BlockSourceGraph(blockSources, limits);
  } else {
    if (options.base !== undefined)
      project = projectMetadata(await boundedRead(path.resolve(options.base), maxProjectBytes));
    const requestedRoot = path.resolve(options.projectRoot ?? path.dirname(input));
    const root = await realpath(requestedRoot);
    const entry = path.relative(requestedRoot, input).split(path.sep).join('/');
    graph = await createDsl4SourceGraph(entry, {
      limits,
      async readSource(sourcePath, maximum) {
        const candidate = await realpath(path.resolve(root, sourcePath));
        const relative = path.relative(root, candidate);
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
          throw new Dsl4SourceGraphError('K4-SOURCE-PATH-001', 'Source escapes the project root', {
            sourcePath,
          });
        return boundedRead(candidate, maximum * 2 + 3);
      },
    });
  }
  const documents = new Map(
    graph.nodes.map((node) => {
      if (!node) fail('Source graph node is missing');
      const lineCounter = new LineCounter();
      const document = parseDocument(node.canonicalSource, {lineCounter, keepSourceTokens: true});
      return [node.sourcePath, {document, lineCounter, source: node.canonicalSource}] as const;
    }),
  );
  const sources = graph.discoveryOrder.map((sourceId) => ({
    sourceId,
    story: documents.get(sourceId)!.document.toJS({maxAliasCount: 0}) as Record<string, unknown>,
  }));
  const locate = (sourceId: string, at: Dsl4DefinitionPath) => {
    const parsed = documents.get(sourceId)!;
    return sourceRangeForNode(
      parsed.document.getIn(at, true) ?? parsed.document.contents,
      parsed.lineCounter,
    );
  };
  const protectedSources = graph.nodes
    .filter((node) => node?.canonicalSource.includes('# kamishibai-block-sections-v1:'))
    .map((node) => node!.sourcePath);
  const audit = auditDsl4Definitions(sources, options.schema, {
    locate,
    protectedSources,
    ...(options.controlProfile === undefined ? {} : {controlProfile: options.controlProfile}),
  });
  const validate = (candidateGraph: typeof graph) =>
    candidateGraph.sourceCount === 1 && !sources[0]!.story.include
      ? options.sourceFrontend.parse(candidateGraph.nodes[0]!.canonicalSource, {
          sourceId: graph.entryPath,
          project,
        })
      : createDsl4SourceGraphFrontend(options.sourceFrontend).parse(candidateGraph, {
          featureFlags: {dsl4Runtime: true},
          project,
          maxComposedSourceBytes: limits.maxTotalSourceBytes,
        });
  const parsed = validate(graph);
  const declared = new Set(
    audit.definitions.map((definition) => JSON.stringify([definition.namespace, definition.name])),
  );
  const actorDefinitions = Object.assign(
    {},
    ...sources.map((source) => definitionRecord(source.story.actors)),
  ) as Record<string, unknown>;
  const assetDefinitions = Object.assign(
    {},
    ...sources.map((source) => definitionRecord(source.story.assets)),
  ) as Record<string, unknown>;
  const implicitReferences =
    project === undefined
      ? []
      : audit.references.filter((reference) => {
          if (
            !['assets', 'actors'].includes(reference.namespace) ||
            declared.has(JSON.stringify([reference.namespace, reference.name]))
          )
            return false;
          let action: Record<string, unknown>;
          if (reference.namespace === 'actors') action = {[`${reference.name}.hide`]: null};
          else if (reference.assetKind === 'backdrop') action = {stage: reference.name};
          else if (reference.assetKind === 'sound') action = {sound: reference.name};
          else if (reference.assetKind === 'costume' && reference.actor)
            action = {[`${reference.actor}.setSkin`]: reference.name};
          else if (reference.assetKind === 'costume') action = {wait: 0};
          else return false;
          const actor =
            reference.actor && Object.hasOwn(actorDefinitions, reference.actor)
              ? {[reference.actor]: actorDefinitions[reference.actor]}
              : {};
          try {
            resolveDsl4ImplicitProjectAssets(
              {
                cover: {},
                actors: actor,
                assets: assetDefinitions,
                scenes: {opening: [action]},
                ...(reference.assetKind === 'costume' && !reference.actor
                  ? {loading: {costumes: [reference.name]}}
                  : {}),
              },
              project,
              options.schema,
            );
            return true;
          } catch (error) {
            if (error instanceof Dsl4ImplicitProjectAssetError) return false;
            throw error;
          }
        });
  const implicitLocations = new Set(
    implicitReferences.map((reference) =>
      JSON.stringify([reference.sourceId, dsl4DefinitionJsonPath(reference.path)]),
    ),
  );
  const diagnostics = [
    ...audit.diagnostics.filter(
      (diagnostic) =>
        !(
          diagnostic.code === 'K4-DEFINITION-UNDEFINED' &&
          implicitLocations.has(JSON.stringify([diagnostic.sourceId, diagnostic.path]))
        ),
    ),
    ...parsed.diagnostics,
  ].map((diagnostic) =>
    blockSources ? locateDsl4BlockDiagnostic(diagnostic, blockSources) : diagnostic,
  );
  const ok = !diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  const report = {
    ...audit,
    ok,
    diagnostics,
    implicitReferences,
    defaults: parsed.ok
      ? {
          ...(!sources.some((source) =>
            Object.hasOwn(definitionRecord(source.story.variables), 'startSceneIndex'),
          )
            ? {startSceneIndex: 1}
            : {}),
          ...(!sources.some((source) => Object.hasOwn(source.story, 'cover'))
            ? {cover: definitionRecord(definitionRecord(parsed).storyDocument).cover}
            : {}),
        }
      : {},
    sourceFiles: [...graph.discoveryOrder],
    removed: [] as {kind: string; name: string; sourceId: string}[],
    outputDirectory: null as string | null,
  };
  if (!options.removeUnused || !ok) return deepFreeze(report);
  for (const definition of audit.removable) {
    documents.get(definition.sourceId)!.document.deleteIn(definition.path);
    report.removed.push({
      kind: definition.kind,
      name: definition.name,
      sourceId: definition.sourceId,
    });
  }
  const changed = new Set(audit.removable.map((definition) => definition.sourceId));
  const outputSources = new Map(
    [...documents].map(([sourceId, {document, source}]) => [
      sourceId,
      changed.has(sourceId) ? document.toString({lineWidth: 0}) : source,
    ]),
  );
  const candidate = await createDsl4SourceGraph(graph.entryPath, {
    limits,
    readSource: (sourceId) => outputSources.get(sourceId)!,
  });
  const verified = validate(candidate);
  if (!verified.ok)
    fail('Cleaned sources failed production frontend validation; no output was written');
  const output = path.resolve(options.outputDir!);
  async function assertNewOutput() {
    try {
      await lstat(output);
    } catch (error) {
      if (definitionRecord(error).code === 'ENOENT') return;
      throw error;
    }
    fail('Output directory already exists; choose a fresh directory');
  }
  await assertNewOutput();
  await mkdir(path.dirname(output), {recursive: true});
  const parent = await realpath(path.dirname(output));
  const staging = await mkdtemp(path.join(parent, '.dsl4-definition-cleanup-'));
  try {
    for (const [sourceId, source] of outputSources) {
      const filename = path.join(staging, sourceId);
      await mkdir(path.dirname(filename), {recursive: true});
      const handle = await open(filename, 'wx');
      try {
        await handle.writeFile(source, 'utf8');
      } finally {
        await handle.close();
      }
    }
    await assertNewOutput();
    await rename(staging, output);
  } finally {
    await rm(staging, {recursive: true, force: true});
  }
  report.outputDirectory = output;
  return deepFreeze(report);
}

export function formatDsl4DefinitionAudit(
  report: Awaited<ReturnType<typeof auditDsl4ProjectDefinitions>>,
) {
  const lines = report.diagnostics.map(
    (diagnostic) =>
      `${diagnostic.sourceId}:${diagnostic.range.start.line}:${diagnostic.range.start.column}: ${diagnostic.severity} [${diagnostic.code}] ${diagnostic.message}`,
  );
  lines.push(
    `定義 ${report.definitions.length}件 / 未使用 ${report.removable.length}件 / SB3内の暗黙参照 ${report.implicitReferences.length}件`,
  );
  if (report.outputDirectory)
    lines.push(`削除 ${report.removed.length}件 / 出力 ${report.outputDirectory}`);
  return lines.join('\n') + '\n';
}
