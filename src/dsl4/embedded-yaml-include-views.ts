import {parse} from 'yaml';
import {yamlBlockIconURI} from '@kubohiroya/turbowarp-yaml-json/yaml-blocks';
import {
  decodeSourceDocumentReference,
  encodeSourceDocumentReference,
  type SourceDocumentReference,
} from '@kubohiroya/turbowarp-document-data/composition';
import {
  dsl4LabeledBlockSourceHatOpcode,
  dsl4ConfigBlockSourceHatOpcode,
} from './block-source-shared.js';
import {
  dsl4IncludeBlocksOpcode,
  readDsl4StructuredBlockSource,
} from './structured-block-source-codec.js';
import {extractDsl4BlockSourcesFromProject} from './turbowarp-yaml-json-block-source.js';
import {
  dsl4EmbeddedYamlHatOpcode,
  dsl4BundledEmbeddedYamlHatOpcode,
  dsl4EmbeddedYamlConfigHatOpcode,
  dsl4BundledEmbeddedYamlConfigHatOpcode,
} from './embedded-yaml-identity.js';
type ObjectRecord = Record<string, unknown>;
const record = (value: unknown): value is ObjectRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), {code});
}
export const dsl4EmbeddedYamlIncludeOperation = 'embeddedYamlInclude';
export const dsl4EmbeddedYamlIncludeOpcode = 'kubohiroyakamishibairuntime4_embeddedYamlInclude';
export const dsl4BundledEmbeddedYamlIncludeOpcode =
  'kubohiroyakamishibai4_kubohiroyakamishibairuntime4__embeddedYamlInclude';
export interface KamishibaiIncludeDocumentBinding {
  readonly reference: SourceDocumentReference;
  readonly label: string;
}
export interface KamishibaiIncludeReferenceDescriptor {
  readonly version: 1;
  readonly kind: 'schema-include-references';
  readonly form: 'bundled' | 'unbundled';
  readonly entryReference: SourceDocumentReference;
  readonly documents: readonly KamishibaiIncludeDocumentBinding[];
  readonly maxIncludeDepth: number;
}
/** Inert declaration only; callers explicitly register it in a matching owner runtime. */
export function createDsl4EmbeddedYamlIncludeDefinition({
  BlockType,
  menuName = 'embeddedYamlIncludeDocuments',
}: {
  BlockType: {COMMAND: string};
  menuName?: string;
}) {
  return {
    opcode: dsl4EmbeddedYamlIncludeOperation,
    blockIconURI: yamlBlockIconURI,
    blockType: BlockType.COMMAND,
    text: 'embedded YAML include [DOCUMENT]',
    arguments: {DOCUMENT: {type: 'string', menu: menuName}},
  };
}
const roles = (form: 'bundled' | 'unbundled') =>
  form === 'bundled'
    ? {
        story: dsl4BundledEmbeddedYamlHatOpcode,
        config: dsl4BundledEmbeddedYamlConfigHatOpcode,
        include: dsl4BundledEmbeddedYamlIncludeOpcode,
      }
    : {
        story: dsl4EmbeddedYamlHatOpcode,
        config: dsl4EmbeddedYamlConfigHatOpcode,
        include: dsl4EmbeddedYamlIncludeOpcode,
      };
/** New document views have one body hat. Configuration hats are decoded only in this temporary clone. */
export function mergeKamishibaiConfigurationDeclarations<T extends ObjectRecord>(project: T): T {
  const candidate = clone(project);
  const stories = new Map<string, {target: ObjectRecord; id: string; block: ObjectRecord}>();
  const configs: {
    target: ObjectRecord;
    id: string;
    block: ObjectRecord;
    label: string;
  }[] = [];
  for (const target of targets(candidate)) {
    const blocks = target.blocks as ObjectRecord;
    for (const [id, block] of Object.entries(blocks))
      if (record(block)) {
        if (block.opcode === dsl4LabeledBlockSourceHatOpcode) {
          const label = text(blocks, block, 'LABEL');
          if (stories.has(label)) fail('VIEW_CONFIG_DOCUMENT', 'A document label is duplicated.');
          stories.set(label, {target, id, block});
        }
        if (block.opcode === dsl4ConfigBlockSourceHatOpcode)
          configs.push({
            target,
            id,
            block,
            label: text(blocks, block, 'LABEL'),
          });
      }
  }
  const seen = new Set<string>();
  for (const config of configs) {
    const story = stories.get(config.label);
    if (!story || story.target !== config.target || seen.has(config.label))
      fail(
        'VIEW_CONFIG_DOCUMENT',
        'A configuration must belong to one matching document in the same target.',
      );
    seen.add(config.label);
    const blocks = story.target.blocks as ObjectRecord;
    const read = (input: unknown): unknown => {
      if (!Array.isArray(input) || ![1, 2, 3].includes(input[0] as number))
        fail('VIEW_INCLUDE_LITERAL', 'Document fields require static scalar values.');
      const value = input[1];
      if (
        Array.isArray(value) &&
        [4, 5, 6, 7, 8, 10, 11].includes(value[0] as number) &&
        ['string', 'number', 'boolean'].includes(typeof value[1])
      )
        return value[1];
      if (typeof value === 'string') {
        const shadow = blocks[value];
        if (
          record(shadow) &&
          shadow.shadow === true &&
          shadow.topLevel === false &&
          shadow.next === null &&
          record(shadow.inputs) &&
          !Object.keys(shadow.inputs).length &&
          record(shadow.fields)
        ) {
          const field =
            shadow.opcode === 'text'
              ? shadow.fields.TEXT
              : /^math_(?:number|integer|whole_number|positive_number|angle)$/u.test(
                    String(shadow.opcode),
                  )
                ? shadow.fields.NUM
                : null;
          if (Array.isArray(field)) return field[0];
        }
      }
      fail('VIEW_INCLUDE_LITERAL', 'Dynamic reporters cannot supply document source.');
    };
    readDsl4StructuredBlockSource(blocks, story.id, read, {
      entry: config.label === '',
      configHatIds: [config.id],
      resolveInclude: (id) => text(blocks, blocks[id] as ObjectRecord, 'LABEL'),
    });
    const first = config.block.next;
    if (typeof first === 'string') {
      const visited = new Set<string>();
      let tail = first;
      while (true) {
        if (visited.has(tail) || !record(blocks[tail]))
          fail('VIEW_CONFIG_DOCUMENT', 'The configuration body is cyclic or incomplete.');
        visited.add(tail);
        const next = (blocks[tail] as ObjectRecord).next;
        if (next === null) break;
        if (typeof next !== 'string')
          fail('VIEW_CONFIG_DOCUMENT', 'The configuration body is incomplete.');
        tail = next;
      }
      (blocks[tail] as ObjectRecord).next = story.block.next;
      if (typeof story.block.next === 'string')
        (blocks[story.block.next] as ObjectRecord).parent = tail;
      story.block.next = first;
      (blocks[first] as ObjectRecord).parent = story.id;
    }
    if (config.block.comment !== undefined) {
      if (story.block.comment !== undefined)
        fail('VIEW_CONFIG_DOCUMENT', 'Two document-root comments cannot be merged implicitly.');
      story.block.comment = config.block.comment;
    }
    if (record(story.target.comments))
      for (const comment of Object.values(story.target.comments))
        if (record(comment) && comment.blockId === config.id) comment.blockId = story.id;
    delete blocks[config.id];
  }
  return candidate;
}
function bindings(descriptor: KamishibaiIncludeReferenceDescriptor) {
  if (
    descriptor.version !== 1 ||
    descriptor.kind !== 'schema-include-references' ||
    !['bundled', 'unbundled'].includes(descriptor.form) ||
    !Array.isArray(descriptor.documents) ||
    descriptor.documents.length < 1 ||
    descriptor.documents.length > 256 ||
    !Number.isSafeInteger(descriptor.maxIncludeDepth) ||
    descriptor.maxIncludeDepth < 1 ||
    descriptor.maxIncludeDepth > 256
  )
    fail('VIEW_INCLUDE_DESCRIPTOR', 'Invalid source graph reference descriptor.');
  const byLabel = new Map<string, KamishibaiIncludeDocumentBinding>(),
    byReference = new Map<string, KamishibaiIncludeDocumentBinding>();
  for (const item of descriptor.documents) {
    if (
      !item ||
      typeof item.label !== 'string' ||
      item.label.length > 4096 ||
      /[\u0000-\u001f\u007f]/u.test(item.label)
    )
      fail('VIEW_INCLUDE_DESCRIPTOR', 'Document labels must be bounded text.');
    const encoded = encodeSourceDocumentReference(item.reference);
    if (byLabel.has(item.label) || byReference.has(encoded))
      fail('VIEW_INCLUDE_CONFLICT', 'Labels and document references must have a unique mapping.');
    byLabel.set(item.label, item);
    byReference.set(encoded, item);
  }
  const entry = byReference.get(encodeSourceDocumentReference(descriptor.entryReference));
  if (!entry || entry.label !== '')
    fail('VIEW_INCLUDE_ENTRY', 'The entry document must have the empty root label.');
  return {byLabel, byReference};
}
function targets(project: ObjectRecord): ObjectRecord[] {
  if (
    !Array.isArray(project.targets) ||
    project.targets.some((t) => !record(t) || !record(t.blocks))
  )
    fail('VIEW_INCLUDE_PROJECT', 'A source block project is required.');
  return project.targets as ObjectRecord[];
}
function text(blocks: ObjectRecord, block: ObjectRecord, name: string): string {
  const inputs = record(block.inputs) ? block.inputs : {};
  const input = inputs[name];
  let value: unknown;
  if (Array.isArray(input) && [1, 2, 3].includes(input[0] as number)) {
    const item = input[1];
    if (Array.isArray(item) && item[0] === 10) value = item[1];
    else if (typeof item === 'string') {
      const shadow = blocks[item];
      if (
        record(shadow) &&
        shadow.opcode === 'text' &&
        shadow.shadow === true &&
        shadow.next === null &&
        record(shadow.inputs) &&
        Object.keys(shadow.inputs).length === 0 &&
        record(shadow.fields)
      ) {
        const field = shadow.fields.TEXT;
        if (Array.isArray(field)) value = field[0];
      }
    }
  }
  if (value === undefined && name === 'LABEL' && input === undefined) return '';
  if (typeof value !== 'string')
    fail('VIEW_INCLUDE_LITERAL', 'Include labels and declaration metadata must use static text.');
  return value;
}
function encodedReference(block: ObjectRecord): string {
  const fields = record(block.fields) ? block.fields : {};
  const field = fields.DOCUMENT;
  if (
    !record(block.inputs) ||
    Object.keys(block.inputs).length !== 0 ||
    Object.keys(fields).length !== 1 ||
    !Array.isArray(field) ||
    typeof field[0] !== 'string'
  )
    fail('VIEW_INCLUDE_REFERENCE', 'The reference must be a direct document dropdown.');
  return encodeSourceDocumentReference(decodeSourceDocumentReference(field[0]));
}
function checkDepth(
  extracted: ReturnType<typeof extractDsl4BlockSourcesFromProject>,
  maximum: number,
) {
  const graph = new Map<string, string[]>();
  for (const [path, source] of Object.entries(extracted.sources)) {
    const value = parse(source) as unknown;
    const include = record(value) ? value.include : undefined;
    const paths = typeof include === 'string' ? [include] : Array.isArray(include) ? include : [];
    if (paths.some((p) => typeof p !== 'string'))
      fail('VIEW_INCLUDE_UNKNOWN', 'The extracted include graph is invalid.');
    graph.set(path, paths as string[]);
  }
  const visiting = new Set<string>(),
    heights = new Map<string, number>();
  const height = (path: string): number => {
    if (visiting.has(path)) fail('VIEW_INCLUDE_CYCLE', 'The source graph contains a cycle.');
    const known = heights.get(path);
    if (known !== undefined) return known;
    const edges = graph.get(path);
    if (!edges) fail('VIEW_INCLUDE_UNKNOWN', 'An include document is missing.');
    visiting.add(path);
    let longest = 0;
    for (const edge of edges) longest = Math.max(longest, 1 + height(edge));
    visiting.delete(path);
    if (longest > maximum)
      fail('VIEW_INCLUDE_DEPTH', 'The source graph exceeds its include depth limit.');
    heights.set(path, longest);
    return longest;
  };
  // Check detached modules and shared DAG paths without exponential traversal.
  for (const path of graph.keys()) height(path);
}
/** Pure compatibility projection. It does not invent missing module raw files or register providers. */
export function createKamishibaiIncludeReferenceView<T extends ObjectRecord>(
  project: T,
  {
    entryReference,
    documents,
    form,
    maxIncludeDepth = 32,
  }: Omit<KamishibaiIncludeReferenceDescriptor, 'version' | 'kind' | 'maxIncludeDepth'> & {
    maxIncludeDepth?: number;
  },
) {
  const descriptor: KamishibaiIncludeReferenceDescriptor = clone({
    version: 1,
    kind: 'schema-include-references',
    entryReference,
    documents,
    form,
    maxIncludeDepth,
  });
  const {byLabel} = bindings(descriptor),
    documentProject = mergeKamishibaiConfigurationDeclarations(project),
    original = extractDsl4BlockSourcesFromProject(documentProject);
  checkDepth(original, maxIncludeDepth);
  const candidate = clone(documentProject),
    known = roles(form);
  const seenRoles = new Set<string>(),
    usedLabels = new Set<string>();
  for (const target of targets(candidate)) {
    const blocks = target.blocks as ObjectRecord;
    for (const block of Object.values(blocks)) {
      if (!record(block)) continue;
      const role =
        block.opcode === dsl4LabeledBlockSourceHatOpcode
          ? 'story'
          : block.opcode === dsl4ConfigBlockSourceHatOpcode
            ? 'config'
            : block.opcode === dsl4IncludeBlocksOpcode
              ? 'include'
              : null;
      if (!role) continue;
      const label = text(blocks, block, 'LABEL'),
        binding = byLabel.get(label);
      if (!binding)
        fail(
          'VIEW_INCLUDE_DOCUMENT_MISSING',
          `No canonical document reference was supplied for label ${JSON.stringify(label)}.`,
        );
      if (role === 'include' && !label)
        fail('VIEW_INCLUDE_ENTRY', 'Includes cannot target the root entry document.');
      if (role !== 'include') {
        const key = `${role}:${label}`;
        if (seenRoles.has(key))
          fail(
            'VIEW_INCLUDE_CONFLICT',
            'A document has multiple declaration roots with the same role.',
          );
        seenRoles.add(key);
        usedLabels.add(label);
      }
      block.opcode = known[role];
      block.inputs = {};
      block.fields = {
        DOCUMENT: [encodeSourceDocumentReference(binding.reference), null],
      };
    }
  }
  if ([...byLabel.keys()].some((label) => !usedLabels.has(label)))
    fail('VIEW_INCLUDE_DOCUMENT_MISSING', 'A mapped document has no declaration root.');
  const read = readKamishibaiIncludeReferenceView(candidate, descriptor);
  if (
    JSON.stringify(read.sources) !== JSON.stringify(original.sources) ||
    read.entryPath !== original.entryPath
  )
    fail('VIEW_INCLUDE_NOT_EQUIVALENT', 'The reference view changed the extracted source graph.');
  return {
    project: candidate,
    descriptor,
    summary:
      'Replace source declarations and includes with stable document references; retain module boundaries.',
  };
}
/** Only this read clone uses legacy declarations; stored/view blocks retain document references. */
export function readKamishibaiIncludeReferenceView(
  project: ObjectRecord,
  descriptor: KamishibaiIncludeReferenceDescriptor,
) {
  const {byReference} = bindings(descriptor),
    candidate = clone(project),
    known = roles(descriptor.form);
  const seen = new Set<string>();
  const allReferenceOpcodes = new Set([
    ...Object.values(roles('bundled')),
    ...Object.values(roles('unbundled')),
  ]);
  for (const target of targets(candidate))
    for (const block of Object.values(target.blocks as ObjectRecord)) {
      if (!record(block)) continue;
      if (
        [
          dsl4LabeledBlockSourceHatOpcode,
          dsl4ConfigBlockSourceHatOpcode,
          dsl4IncludeBlocksOpcode,
        ].includes(String(block.opcode))
      )
        fail(
          'VIEW_INCLUDE_MIXED',
          'Legacy and document-reference source declarations cannot be mixed in one view.',
        );
      const role =
        block.opcode === known.story
          ? 'story'
          : block.opcode === known.config
            ? 'config'
            : block.opcode === known.include
              ? 'include'
              : null;
      if (!role) {
        if (allReferenceOpcodes.has(String(block.opcode)))
          fail('VIEW_INCLUDE_FORM', 'The source graph contains mismatched reference declarations.');
        continue;
      }
      const encoded = encodedReference(block),
        binding = byReference.get(encoded);
      if (!binding)
        fail('VIEW_INCLUDE_DOCUMENT_UNKNOWN', 'A reference points outside this source graph.');
      if (role === 'include' && !binding.label)
        fail('VIEW_INCLUDE_ENTRY', 'Includes cannot target the root entry document.');
      if (role !== 'include') {
        const key = `${role}:${encoded}`;
        if (seen.has(key))
          fail('VIEW_INCLUDE_CONFLICT', 'A document reference has duplicate declaration roles.');
        seen.add(key);
      }
      block.opcode =
        role === 'story'
          ? dsl4LabeledBlockSourceHatOpcode
          : role === 'config'
            ? dsl4ConfigBlockSourceHatOpcode
            : dsl4IncludeBlocksOpcode;
      block.inputs = {
        ...(role === 'story' ? {VERSION: [1, [10, '4.0']]} : {}),
        LABEL: [1, [10, binding.label]],
      };
      block.fields = {};
    }
  for (const encoded of byReference.keys())
    if (!seen.has(`story:${encoded}`) && !seen.has(`config:${encoded}`))
      fail('VIEW_INCLUDE_DOCUMENT_MISSING', 'A mapped document declaration is missing.');
  const extracted = extractDsl4BlockSourcesFromProject(candidate);
  checkDepth(extracted, descriptor.maxIncludeDepth);
  return extracted;
}
