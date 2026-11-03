import {cloneKamishibaiDocumentProject} from './embedded-yaml-project-clone.js';
import {createYamlBlockOpcodes} from '@kubohiroya/turbowarp-yaml-json/yaml-blocks';
import {
  addSchemaLineCommentBlocks,
  stripSchemaLineCommentBlocks,
  reconcileSchemaLineComments,
  type SchemaLineCommentDescriptor,
} from './embedded-yaml-schema-comments.js';
import {mergeKamishibaiConfigurationDeclarations} from './embedded-yaml-include-views.js';
import {patchKamishibaiSourceValue} from './embedded-yaml-syntax-patch.js';
import {parse} from 'yaml';
import {
  decodeSourceDocumentReference,
  encodeSourceDocumentReference,
  type SourceDocumentReference,
} from '@kubohiroya/turbowarp-document-data/composition';
import {createDsl4StructuredBlockSourceDeclaration} from './structured-block-source-codec.js';
import {extractDsl4BlockSourcesFromProject} from './turbowarp-yaml-json-block-source.js';
import {serializeDsl4CanonicalDocument} from './canonical-document.js';
import {
  dsl4LabeledBlockSourceHatOpcode,
  dsl4ConfigBlockSourceHatOpcode,
} from './block-source-shared.js';
import type {Dsl4SourceFrontend} from './source-frontend.js';
import {
  dsl4EmbeddedYamlHatOpcode,
  dsl4BundledEmbeddedYamlHatOpcode,
  dsl4EmbeddedYamlConfigHatOpcode,
  dsl4BundledEmbeddedYamlConfigHatOpcode,
} from './embedded-yaml-identity.js';
type JsonObject = Record<string, unknown>;
const record = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const failure = (code: string, message: string) => Object.assign(new Error(message), {code});
export interface KamishibaiSchemaViewDescriptor {
  readonly version: 2;
  readonly kind: 'schema-blocks';
  readonly reference: Readonly<SourceDocumentReference>;
  readonly form: 'bundled' | 'unbundled';
  readonly sourceId: string;
  readonly lineComments?: SchemaLineCommentDescriptor;
}
function roles(descriptor: KamishibaiSchemaViewDescriptor) {
  return descriptor.form === 'bundled'
    ? {
        story: dsl4BundledEmbeddedYamlHatOpcode,
        config: dsl4BundledEmbeddedYamlConfigHatOpcode,
      }
    : {
        story: dsl4EmbeddedYamlHatOpcode,
        config: dsl4EmbeddedYamlConfigHatOpcode,
      };
}
function stage(project: JsonObject): JsonObject {
  const stages = Array.isArray(project.targets)
    ? project.targets.filter((target) => record(target) && target.isStage === true)
    : [];
  if (stages.length !== 1 || !record((stages[0] as JsonObject).blocks))
    throw failure('VIEW_PROJECT', 'Exactly one Stage with a block graph is required.');
  return stages[0] as JsonObject;
}
function roots(blocks: JsonObject, descriptor: KamishibaiSchemaViewDescriptor) {
  const known = roles(descriptor);
  const found: {story?: string; config?: string} = {};
  for (const [id, block] of Object.entries(blocks)) {
    if (!record(block)) continue;
    const role =
      block.opcode === known.story ? 'story' : block.opcode === known.config ? 'config' : null;
    if (!role) continue;
    const fields = record(block.fields) ? block.fields : {};
    const field = fields.DOCUMENT;
    if (!Array.isArray(field) || typeof field[0] !== 'string') continue;
    let reference: SourceDocumentReference;
    try {
      reference = decodeSourceDocumentReference(field[0]);
    } catch {
      continue;
    }
    if (
      reference.providerId !== descriptor.reference.providerId ||
      reference.documentId !== descriptor.reference.documentId
    )
      continue;
    if (found[role])
      throw failure('VIEW_AMBIGUOUS', `The document has more than one ${role} root.`);
    found[role] = id;
  }
  return found;
}
function parsed(
  frontend: Dsl4SourceFrontend,
  source: string,
  sourceId: string,
  project: JsonObject,
) {
  const result = frontend.parse(source, {sourceId, project});
  if (!result.ok)
    throw failure('VIEW_SOURCE_INVALID', result.diagnostics[0]?.message ?? 'The story is invalid.');
  return result;
}
/** Prepare an inert owner-specific view without changing its canonical source or archive assets. */
export function buildKamishibaiSchemaBlockView(
  project: JsonObject,
  {
    reference,
    source,
    sourceId,
    form,
    sourceFrontend,
    includeLineComments = true,
  }: {
    reference: SourceDocumentReference;
    source: string;
    sourceId: string;
    form: 'bundled' | 'unbundled';
    sourceFrontend: Dsl4SourceFrontend;
    includeLineComments?: boolean;
  },
) {
  const original = parsed(sourceFrontend, source, sourceId, project);
  const value = parse(source) as unknown;
  if (!record(value)) throw failure('VIEW_SOURCE_INVALID', 'A story mapping is required.');
  if (value.include !== undefined)
    throw failure(
      'VIEW_INCLUDE_UNSUPPORTED',
      'Include graphs require separate source documents; this single-document view does not flatten them.',
    );
  const candidate = cloneKamishibaiDocumentProject(project);
  const target = stage(candidate);
  const blocks = target.blocks as JsonObject;
  const descriptor: KamishibaiSchemaViewDescriptor = Object.freeze({
    version: 2,
    kind: 'schema-blocks',
    reference: Object.freeze({...reference}),
    sourceId,
    form,
  });
  const existing = roots(blocks, descriptor);
  if (existing.config)
    throw failure(
      'VIEW_EXISTS',
      'Return the existing configuration view to source before rebuilding it.',
    );
  const oldRoot = existing.story ? blocks[existing.story] : null;
  if (record(oldRoot) && oldRoot.next !== null && oldRoot.next !== undefined)
    throw failure(
      'VIEW_EXISTS',
      'The document root already has connected blocks; apply its source conversion before rebuilding.',
    );
  let serial = 1;
  while (Object.keys(blocks).some((id) => id.startsWith(`twpeSchema${serial}_`))) serial++;
  const prefix = `twpeSchema${serial}_`;
  const rootId = existing.story ?? `${prefix}root`;
  let declarations = createDsl4StructuredBlockSourceDeclaration({
    source: value,
    form: form === 'bundled' ? 'bundle' : 'runtime',
    hatId: rootId,
    idPrefix: prefix,
    version: '4.0',
    simpleSpeech: false,
    textSafeLiterals: true,
  });
  declarations = mergeKamishibaiConfigurationDeclarations({
    targets: [{name: 'Stage', isStage: true, blocks: declarations}],
  }).targets[0]!.blocks;
  for (const block of Object.values(declarations))
    for (const connection of Object.values(block.inputs)) {
      if (
        Array.isArray(connection) &&
        Array.isArray(connection[1]) &&
        connection[1][0] === 10 &&
        typeof connection[1][1] === 'string' &&
        /[\r\n]/u.test(connection[1][1])
      )
        throw failure(
          'VIEW_LITERAL_UNSUPPORTED',
          'This schema field needs a multiline editor. Use raw source or YAML blocks instead of discarding its line breaks.',
        );
    }
  const known = roles(descriptor);
  const encoded = encodeSourceDocumentReference(reference);
  for (const block of Object.values(declarations))
    if (
      block.opcode === dsl4LabeledBlockSourceHatOpcode ||
      block.opcode === dsl4ConfigBlockSourceHatOpcode
    ) {
      block.opcode = block.opcode === dsl4LabeledBlockSourceHatOpcode ? known.story : known.config;
      block.inputs = {};
      block.fields = {DOCUMENT: [encoded, null]};
    }
  if (record(oldRoot)) Object.assign(declarations[rootId]!, {x: oldRoot.x, y: oldRoot.y});
  Object.assign(blocks, declarations);
  const read = readKamishibaiSchemaBlockView(candidate, descriptor, sourceFrontend);
  if (serializeDsl4CanonicalDocument(read.parsed) !== serializeDsl4CanonicalDocument(original))
    throw failure(
      'VIEW_NOT_EQUIVALENT',
      'The schema block view does not preserve the story meaning.',
    );
  const lineOpcode = createYamlBlockOpcodes(
    known.story.slice(0, -'embeddedYaml'.length),
  ).lineComment;
  if (typeof lineOpcode !== 'string')
    throw failure(
      'VIEW_SCHEMA_COMMENT_UNSUPPORTED',
      'The explicit line comment declaration is unavailable.',
    );
  const lineComments = includeLineComments
    ? addSchemaLineCommentBlocks({
        source,
        blocks,
        rootIds: [rootId],
        locations: read.locations,
        semanticValue: read.value,
        opcode: lineOpcode,
        idPrefix: prefix + 'comment-',
      })
    : undefined;
  return {
    project: candidate,
    descriptor: lineComments ? Object.freeze({...descriptor, lineComments}) : descriptor,
    summary:
      'Create an equivalent schema block view; preserve the original YAML, comments, document reference and assets.',
  };
}
/** Discover roots by stable references and role opcodes; saved/optimized block IDs are irrelevant. */
export function readKamishibaiSchemaBlockView(
  project: JsonObject,
  descriptor: KamishibaiSchemaViewDescriptor,
  frontend: Dsl4SourceFrontend,
) {
  if (descriptor.version !== 2 || descriptor.kind !== 'schema-blocks')
    throw failure('VIEW_DESCRIPTOR', 'Unsupported schema block view.');
  const candidate = cloneKamishibaiDocumentProject(project);
  const target = stage(candidate);
  const blocks = target.blocks as JsonObject;
  const found = roots(blocks, descriptor);
  if (!found.story) throw failure('VIEW_ROOT_MISSING', 'The document story root is missing.');
  const lineOpcode = createYamlBlockOpcodes(
    roles(descriptor).story.slice(0, -'embeddedYaml'.length),
  ).lineComment;
  if (typeof lineOpcode !== 'string')
    throw failure(
      'VIEW_SCHEMA_COMMENT_UNSUPPORTED',
      'The explicit line comment declaration is unavailable.',
    );
  const commentRoots = [found.story, ...(found.config ? [found.config] : [])];
  const lineComments = stripSchemaLineCommentBlocks(blocks, commentRoots, lineOpcode);

  for (const role of ['story', 'config'] as const) {
    const id = found[role];
    if (!id) continue;
    const block = blocks[id] as JsonObject;
    block.opcode =
      role === 'story' ? dsl4LabeledBlockSourceHatOpcode : dsl4ConfigBlockSourceHatOpcode;
    block.inputs =
      role === 'story' ? {VERSION: [1, [10, '4.0']], LABEL: [1, [10, '']]} : {LABEL: [1, [10, '']]};
    block.fields = {};
  }
  const extracted = extractDsl4BlockSourcesFromProject(candidate);
  const source = extracted.sources[extracted.entryPath];
  if (typeof source !== 'string')
    throw failure('VIEW_SOURCE_MISSING', 'The view has no readable source.');
  return {
    source,
    value: parse(source) as JsonObject,
    parsed: parsed(frontend, source, descriptor.sourceId, candidate),
    lineComments,
    commentRoots,
    commentBlocks: blocks,
    locations: extracted.blockLocations
      .filter((location) => location.sourcePath === extracted.entryPath)
      .map((location) => ({path: location.path, blockId: location.blockId})),
  };
}
/** A no-edit round trip returns exact original bytes; edited trees need the shared CST patcher. */
export function sourceFromKamishibaiSchemaBlockView(
  project: JsonObject,
  descriptor: KamishibaiSchemaViewDescriptor,
  originalSource: string,
  frontend: Dsl4SourceFrontend,
) {
  const read = readKamishibaiSchemaBlockView(project, descriptor, frontend);
  const original = parsed(frontend, originalSource, descriptor.sourceId, project);
  const equal =
    serializeDsl4CanonicalDocument(read.parsed) === serializeDsl4CanonicalDocument(original);
  let patch: (source: string) => string = (source) => source;
  if (!equal) {
    const freshProject = cloneKamishibaiDocumentProject(project);
    stage(freshProject).blocks = {};
    const baseline = buildKamishibaiSchemaBlockView(freshProject, {
      reference: descriptor.reference,
      source: originalSource,
      sourceId: descriptor.sourceId,
      form: descriptor.form,
      sourceFrontend: frontend,
      includeLineComments: false,
    });
    const baselineValue = readKamishibaiSchemaBlockView(
      baseline.project,
      baseline.descriptor,
      frontend,
    ).value;
    patch = (source) => patchKamishibaiSourceValue(source, baselineValue, read.value);
  }
  const source =
    descriptor.lineComments || read.lineComments.length
      ? reconcileSchemaLineComments({
          source: originalSource,
          descriptor: descriptor.lineComments,
          observed: read.lineComments,
          blocks: read.commentBlocks,
          rootIds: read.commentRoots,
          locations: read.locations,
          semanticValue: read.value,
          patch,
        })
      : patch(originalSource);
  const checked = parsed(frontend, source, descriptor.sourceId, project);
  if (serializeDsl4CanonicalDocument(checked) !== serializeDsl4CanonicalDocument(read.parsed))
    throw failure(
      'VIEW_NOT_EQUIVALENT',
      'The source patch does not preserve the edited schema block meaning.',
    );
  return source;
}
