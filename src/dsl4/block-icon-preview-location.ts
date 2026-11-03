import {isSeq, parse, parseDocument} from 'yaml';
import {extractDsl4BlockSourcesFromProject} from './turbowarp-yaml-json-block-source.js';
import {readReference} from '@kubohiroya/turbowarp-document-source';
import {readDocumentViewMetadata} from '@kubohiroya/turbowarp-document-data/view-metadata';
import {createYamlBlockOpcodes} from '@kubohiroya/turbowarp-yaml-json/yaml-blocks';
import {kamishibaiDocumentOwner} from './embedded-yaml-document-owner.js';
import {extractEmbeddedYamlDocumentSources} from './embedded-yaml-migration.js';
import {readKamishibaiDocumentViewSource} from './embedded-yaml-project-views.js';
import {stripSchemaLineCommentBlocks} from './embedded-yaml-schema-comments.js';
import {
  createEmbeddedYamlSourceGraphRecord,
  readEmbeddedYamlSourceGraphRecord,
  sourceGraphDocumentId,
  composeGraphComponent,
} from './embedded-yaml-source-graph.js';
import {createDsl4StructuredBlockSourceDeclaration} from './structured-block-source-codec.js';
import {
  dsl4LabeledBlockSourceHatOpcode,
  dsl4ConfigBlockSourceHatOpcode,
} from './block-source-shared.js';
import {resolveDsl4IncludePath} from './source-graph.js';
import {createDsl4EmbeddedSourceDescriptor} from './source-descriptor.js';
import {createDsl4RuntimeArtifactDescriptor} from './runtime-artifact-descriptor.js';
import type {Dsl4SourceFrontend} from './source-frontend.js';

type RecordValue = Record<string, unknown>;
export interface Dsl4BlockPreviewReference {
  readonly targetId: string;
  readonly blockId: string;
  readonly opcode: string;
}

function record(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure(message: string): never {
  throw Object.assign(new Error(message), {code: 'K4-BLOCK-PREVIEW-LOCATION'});
}

function targetOf(project: RecordValue, reference: Dsl4BlockPreviewReference, targetName?: string) {
  const targets = Array.isArray(project.targets) ? project.targets.filter(record) : [];
  const target =
    targets.find((target) => target.id === reference.targetId) ??
    targets.find((target) => target.name === targetName);
  if (!target || !record(target.blocks)) failure('プレビュー対象のスプライトが見つかりません。');
  return {target, blocks: target.blocks as Record<string, RecordValue>};
}

function literalField(block: RecordValue, blocks: Record<string, RecordValue>, argument: string) {
  const fields = record(block.fields) ? block.fields : {};
  const direct = fields[argument];
  if (Array.isArray(direct))
    return {
      value: direct[0],
      write: (value: unknown) => {
        direct[0] = value;
      },
    };
  const inputs = record(block.inputs) ? block.inputs : {};
  const input = inputs[argument];
  if (!Array.isArray(input) || ![1, 3].includes(Number(input[0])))
    failure('式やレポーターブロックを含む引数はプレビューで書き換えられません。');
  const child = input[1];
  if (Array.isArray(child) && [4, 5, 6, 7, 8, 9, 10, 11].includes(Number(child[0])))
    return {
      value: child[1],
      write: (value: unknown) => {
        child[1] = value;
      },
    };
  if (typeof child !== 'string') failure('プレビュー対象の引数が不正です。');
  const shadow = blocks[child];
  if (!shadow || shadow.shadow !== true || !record(shadow.fields))
    failure('式やレポーターブロックを含む引数はプレビューで書き換えられません。');
  const entries = Object.values(shadow.fields);
  if (entries.length !== 1 || !Array.isArray(entries[0]))
    failure('プレビュー対象の入力形式に対応していません。');
  const field = entries[0];
  return {
    value: field[0],
    write: (value: unknown) => {
      field[0] = value;
    },
  };
}

/** Apply a draft only to a clone, retaining the original project's input and extension identity. */
export function createDsl4BlockIconPreviewProject(
  project: RecordValue,
  reference: Dsl4BlockPreviewReference,
  changes: Readonly<Record<string, string | number | boolean>> = {},
  targetName?: string,
) {
  const copy = structuredClone(project);
  // Monitor opcodes can load extensions even when every script has been removed.
  copy.monitors = [];
  const {blocks} = targetOf(copy, reference, targetName);
  const block = blocks[reference.blockId];
  if (!block || block.opcode !== reference.opcode) failure('編集対象のブロックが変更されました。');
  for (const [argument, value] of Object.entries(changes)) {
    if (
      !['string', 'number', 'boolean'].includes(typeof value) ||
      (typeof value === 'number' && !Number.isFinite(value))
    )
      failure('プレビューの入力値が不正です。');
    literalField(block, blocks, argument).write(value);
  }
  return copy;
}

/** Reflect named document views only into an owned preview copy, retaining live block IDs for navigation. */
export async function projectDsl4NamedBlockIconPreview(
  project: RecordValue,
  frontend: Dsl4SourceFrontend,
  limits: {maxSourceBytes: number; maxAssetFiles: number; maxTotalAssetBytes: number},
) {
  const candidate = structuredClone(project);
  const selected = kamishibaiDocumentOwner(candidate);
  if (!selected || !record(selected.owner.source) || typeof selected.owner.source.text !== 'string')
    return null;
  const targets = Array.isArray(candidate.targets) ? candidate.targets.filter(record) : [];
  if (
    targets.some(
      (target) =>
        record(target.blocks) &&
        Object.values(target.blocks).some(
          (b) => record(b) && b.opcode === dsl4LabeledBlockSourceHatOpcode,
        ),
    )
  )
    return null;
  const graph =
    selected.owner.sourceDocuments === undefined
      ? null
      : readEmbeddedYamlSourceGraphRecord(selected.owner.sourceDocuments);
  const entryPath = graph?.entryPath ?? 'story.k4.yml';
  const paths = graph ? Object.keys(graph.files).sort() : [entryPath];
  const references = new Map(
    paths.map((path) => [
      path,
      {
        providerId: 'kamishibai-dsl4',
        documentId: graph ? sourceGraphDocumentId(graph, path) : 'story',
      },
    ]),
  );
  const active = paths.filter(
    (path) =>
      readDocumentViewMetadata(selected.owner, references.get(path)!)?.activeKind ===
      'schema-blocks',
  );
  if (!active.length) return null;
  try {
    const sources = graph
      ? (await extractEmbeddedYamlDocumentSources(candidate, frontend)).sources
      : {
          [entryPath]: readKamishibaiDocumentViewSource(
            candidate,
            references.get(entryPath)!,
            frontend,
          ),
        };
    const prepared = structuredClone(candidate);
    const owner = kamishibaiDocumentOwner(prepared)!.owner;
    if (graph) {
      const next = await createEmbeddedYamlSourceGraphRecord({entryPath, sources});
      Object.assign(owner, await composeGraphComponent(owner, next, frontend, {project: prepared}));
    } else {
      const previous = owner.source as RecordValue;
      const source = await createDsl4EmbeddedSourceDescriptor(sources[entryPath]!, {
        sourceId: String(previous.sourceId),
        displayName: String(previous.displayName ?? previous.sourceId),
        maxSourceBytes: limits.maxSourceBytes,
      });
      const parsed = frontend.parse(source.text, {sourceId: source.sourceId, project: prepared});
      if (!parsed.ok) throw new Error(parsed.diagnostics[0]?.message ?? 'Invalid preview source');
      const artifact = await createDsl4RuntimeArtifactDescriptor(
        parsed.storyDocument,
        source,
        String((owner.artifact as RecordValue).controlProfile),
        limits,
      );
      if (!artifact.ok)
        throw new Error(artifact.diagnostics[0]?.message ?? 'Invalid preview artifact');
      Object.assign(owner, {
        source,
        artifact: (artifact as unknown as {artifact: unknown}).artifact,
      });
    }
    const stage = targets.find((target) => target.isStage === true && record(target.blocks));
    if (!stage || !record(stage.blocks)) failure('SchemaプレビューにはStageが必要です。');
    const rootPaths = new Map<string, string>();
    const prefix =
      selected.form === 'bundled'
        ? 'kubohiroyakamishibai4_kubohiroyakamishibairuntime4__'
        : 'kubohiroyakamishibairuntime4_';
    const label = (path: string) => (path === entryPath ? '' : path);
    for (const path of paths) {
      const reference = references.get(path)!;
      if (active.includes(path)) {
        for (const target of targets) {
          if (!record(target.blocks)) continue;
          const blocks = target.blocks;
          const roots: string[] = [];
          for (const [id, value] of Object.entries(blocks)) {
            if (
              !record(value) ||
              ![prefix + 'embeddedYaml', prefix + 'embeddedYamlConfig'].includes(
                String(value.opcode),
              )
            )
              continue;
            const current = readReference(value, {blocks});
            if (
              current.providerId !== reference.providerId ||
              current.documentId !== reference.documentId
            )
              continue;
            const story = value.opcode === prefix + 'embeddedYaml';
            roots.push(id);
            if (story) rootPaths.set(id, path);
          }
          if (roots.length)
            stripSchemaLineCommentBlocks(
              blocks,
              roots,
              createYamlBlockOpcodes(prefix).lineComment!,
            );
          for (const id of roots) {
            const root = blocks[id] as RecordValue;
            const story = root.opcode === prefix + 'embeddedYaml';
            root.opcode = story ? dsl4LabeledBlockSourceHatOpcode : dsl4ConfigBlockSourceHatOpcode;
            root.fields = {};
            root.inputs = {
              ...(story ? {VERSION: [1, [10, '4.0']]} : {}),
              LABEL: [1, [10, label(path)]],
            };
          }
        }
      } else {
        const raw = parse(sources[path]!) as RecordValue;
        const includes =
          raw.include === undefined ? [] : Array.isArray(raw.include) ? raw.include : [raw.include];
        const includeLabels = includes.map((value) =>
          label(resolveDsl4IncludePath(path, String(value))),
        );
        delete raw.include;
        let index = 0;
        while (Object.keys(stage.blocks).some((id) => id.startsWith(`blockPreview${index}_`)))
          index++;
        const hatId = `blockPreview${index}_root`;
        Object.assign(
          stage.blocks,
          createDsl4StructuredBlockSourceDeclaration({
            source: raw,
            form: selected.form === 'bundled' ? 'bundle' : 'runtime',
            hatId,
            idPrefix: `blockPreview${index}_`,
            label: label(path),
            includeLabels,
            simpleSpeech: false,
            textSafeLiterals: true,
          }),
        );
        rootPaths.set(hatId, path);
      }
    }
    for (const target of targets)
      if (record(target.blocks))
        for (const b of Object.values(target.blocks)) {
          if (!record(b) || b.opcode !== prefix + 'embeddedYamlInclude') continue;
          const current = readReference(b, {blocks: target.blocks});
          const path = paths.find(
            (path) =>
              references.get(path)!.documentId === current.documentId &&
              current.providerId === 'kamishibai-dsl4',
          );
          if (!path || path === entryPath)
            failure('台本に含まれない文書参照はプレビューできません。');
          b.opcode = 'kubohiroyakamishibaiauthoring4_includeBlocks';
          b.fields = {};
          b.inputs = {LABEL: [1, [10, label(path)]]};
        }
    const extracted = extractDsl4BlockSourcesFromProject(candidate);
    const originalPath = (path: string) => rootPaths.get(extracted.sourceLocations[path]!.blockId)!;
    return {
      project: prepared,
      blockSources: {
        ...extracted,
        entryPath,
        sources,
        blockLocations: extracted.blockLocations.map((location) => ({
          ...location,
          sourcePath: originalPath(location.sourcePath),
        })),
      },
    };
  } catch (cause) {
    throw Object.assign(
      new Error(
        `文書ブロックの下書きをプレビューへ変換できません: ${cause instanceof Error ? cause.message : String(cause)}`,
        {cause},
      ),
      {code: 'K4-BLOCK-PREVIEW-SOURCE'},
    );
  }
}

/** Match authored blocks to normalized actions through their original source ranges. */
export function resolveDsl4BlockIconPreviewLocation(
  project: RecordValue,
  reference: Dsl4BlockPreviewReference,
  storyDocument: Readonly<RecordValue>,
  targetName?: string,
  blockSources?: ReturnType<typeof extractDsl4BlockSourcesFromProject>,
): Readonly<{sceneId: string; actionPath: string | null}> {
  const {target, blocks} = targetOf(project, reference, targetName);
  const block = blocks[reference.blockId];
  if (!block || block.opcode !== reference.opcode)
    failure('プレビュー対象のブロックが見つかりません。');
  const scenes = Array.isArray(storyDocument.scenes) ? storyDocument.scenes.filter(record) : [];
  if (reference.opcode === 'kubohiroyakamishibaiauthoring4_scene') {
    const sceneId = String(literalField(block, blocks, 'SCENE').value);
    if (!scenes.some((scene) => scene.id === sceneId))
      failure('プレビュー対象の場面が見つかりません。');
    return Object.freeze({sceneId, actionPath: null});
  }
  const extracted = blockSources ?? extractDsl4BlockSourcesFromProject(project);
  const locations = extracted.blockLocations as readonly {
    blockId: string;
    targetName: string;
    sourcePath: string;
    path: readonly (string | number)[];
  }[];
  const location = locations.find(
    (entry) => entry.blockId === reference.blockId && entry.targetName === target.name,
  );
  if (!location || location.path[0] !== 'scenes')
    failure('このブロックは有効なscene内の命令ではありません。');
  const source = (extracted.sources as Record<string, string>)[location.sourcePath];
  if (!source) failure('プレビュー対象の台本が見つかりません。');
  const document = parseDocument(source);
  const path = [...location.path];
  const sceneValue = document.getIn(['scenes', path[1]!], true);
  if (isSeq(sceneValue)) {
    if (path[2] === 'actions') path.splice(2, 1);
  } else if (path[2] !== 'actions') path.splice(2, 0, 'actions');
  const node = document.getIn(path, true) as {range?: number[]} | undefined;
  const offset = node?.range?.[0];
  const origins = record(storyDocument.sourceOrigins) ? storyDocument.sourceOrigins : {};
  for (const scene of scenes) {
    if (scene.id !== location.path[1]) continue;
    for (const action of Array.isArray(scene.actions) ? scene.actions.filter(record) : []) {
      const value = origins[String(action.id)];
      const origin = record(value) ? value : {};
      const range = record(origin.range) ? origin.range : action.sourceRange;
      const start = record(range) && record(range.start) ? range.start.offset : undefined;
      if (
        start === offset &&
        (origin.sourceId === undefined || origin.sourceId === location.sourcePath)
      )
        return Object.freeze({sceneId: String(scene.id), actionPath: String(action.id)});
    }
  }
  failure('このブロックの実行位置を特定できません。');
}
