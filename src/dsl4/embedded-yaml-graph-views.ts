import {cloneKamishibaiDocumentProject} from './embedded-yaml-project-clone.js';
import {
  addSchemaLineCommentBlocks,
  stripSchemaLineCommentBlocks,
  reconcileSchemaLineComments,
  type SchemaSourceLocation,
  type ObservedSchemaLineComment,
  type SchemaLineCommentDescriptor,
} from './embedded-yaml-schema-comments.js';
import {parse} from 'yaml';
import {readReference} from '@kubohiroya/turbowarp-document-source';
import {
  createYamlBlockDefinitions,
  createYamlBlockMenus,
  createYamlBlockOpcodes,
} from '@kubohiroya/turbowarp-yaml-json/yaml-blocks';
import {
  createYamlSourceBlockView,
  readYamlSourceBlockView,
} from '@kubohiroya/turbowarp-yaml-json/source-view';
import {
  readDocumentViewMetadata,
  writeDocumentViewMetadata,
} from '@kubohiroya/turbowarp-document-data/view-metadata';
import {parseSourceSyntax} from '@kubohiroya/turbowarp-yaml-json/source-syntax';
import {
  encodeSourceDocumentReference,
  normalizeSourceDocumentPreview,
  type SourceDocumentReference,
} from '@kubohiroya/turbowarp-document-data/composition';
import {kamishibaiDocumentOwner} from './embedded-yaml-document-owner.js';
import {
  readEmbeddedYamlSourceGraphRecord,
  sourceGraphDocumentId,
  sourceGraphDocumentPath,
} from './embedded-yaml-source-graph.js';
import {resolveDsl4IncludePath} from './source-graph.js';
import {
  createDsl4StructuredBlockSourceDeclaration,
  createDsl4BlockAuthoringInfo,
  readDsl4StructuredBlockSource,
} from './structured-block-source-codec.js';
import {
  dsl4LabeledBlockSourceHatOpcode,
  dsl4ConfigBlockSourceHatOpcode,
  dsl4BlockAuthoringExtensionId,
} from './block-source-shared.js';
import {dsl4IncludeBlocksOpcode} from './structured-block-source-codec.js';
import {
  createKamishibaiIncludeReferenceView,
  readKamishibaiIncludeReferenceView,
  createDsl4EmbeddedYamlIncludeDefinition,
  dsl4EmbeddedYamlIncludeOpcode,
  dsl4BundledEmbeddedYamlIncludeOpcode,
  type KamishibaiIncludeReferenceDescriptor,
} from './embedded-yaml-include-views.js';
import {
  createDsl4EmbeddedYamlHatDefinition,
  createDsl4EmbeddedYamlConfigHatDefinition,
  installDsl4EmbeddedYamlRoot,
} from './embedded-yaml-hat.js';
import {
  kamishibaiEmbeddedYamlProviderId,
  dsl4EmbeddedYamlHatOpcode,
  dsl4BundledEmbeddedYamlHatOpcode,
  dsl4EmbeddedYamlConfigHatOpcode,
  dsl4BundledEmbeddedYamlConfigHatOpcode,
} from './embedded-yaml-identity.js';
import {embeddedYamlAuthoringRuntimeURL} from './generated/embedded-yaml-authoring-runtime.js';
import {patchKamishibaiSourceValue} from './embedded-yaml-syntax-patch.js';
import type {Dsl4SourceFrontend} from './source-frontend.js';
type ObjectRecord = Record<string, unknown>;
const record = (v: unknown): v is ObjectRecord =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), {code});
}
const key = (ref: SourceDocumentReference) => encodeSourceDocumentReference(ref);
const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : record(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
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
function selectedOwner(project: ObjectRecord, reference: SourceDocumentReference) {
  const selected = kamishibaiDocumentOwner(project);
  if (!selected || selected.owner.sourceDocuments === undefined)
    fail('SOURCE_GRAPH_MISSING', 'This project does not contain canonical raw module files.');
  if (reference.providerId !== kamishibaiEmbeddedYamlProviderId)
    fail('DOCUMENT_UNKNOWN', 'This document belongs to a different source owner.');
  const graph = readEmbeddedYamlSourceGraphRecord(selected.owner.sourceDocuments),
    path = sourceGraphDocumentPath(graph, reference.documentId);
  return {...selected, graph, path, file: graph.files[path]!};
}
function targets(project: ObjectRecord): ObjectRecord[] {
  if (
    !Array.isArray(project.targets) ||
    project.targets.some((t) => !record(t) || !record(t.blocks))
  )
    fail('VIEW_PROJECT_INVALID', 'A project with serialized target block graphs is required.');
  return project.targets as ObjectRecord[];
}
interface Root {
  id: string;
  block: ObjectRecord;
  target: ObjectRecord;
}
function root(
  project: ObjectRecord,
  reference: SourceDocumentReference,
  opcode: string,
): Root | null {
  const found: Root[] = [];
  for (const target of targets(project))
    for (const [id, b] of Object.entries(target.blocks as ObjectRecord))
      if (record(b) && b.opcode === opcode) {
        let ref: SourceDocumentReference;
        try {
          ref = readReference(b, {blocks: target.blocks});
        } catch {
          fail('VIEW_ROOT_INVALID', 'A source document reference is malformed.');
        }
        if (key(ref) !== key(reference)) continue;
        if (
          b.parent !== null ||
          b.topLevel !== true ||
          b.shadow === true ||
          !record(b.inputs) ||
          Object.keys(b.inputs).length
        )
          fail('VIEW_ROOT_INVALID', 'A document root has unsupported connections.');
        found.push({id, block: b, target});
      }
  if (found.length > 1)
    fail('VIEW_ROOT_INVALID', 'The document has duplicate roots with the same role.');
  return found[0] ?? null;
}
function edges(b: ObjectRecord): string[] {
  const result = typeof b.next === 'string' ? [b.next] : [];
  for (const input of Object.values(record(b.inputs) ? b.inputs : {}))
    if (Array.isArray(input))
      for (const v of input.slice(1)) if (typeof v === 'string') result.push(v);
  return result;
}
function subtree(r: Root): ObjectRecord {
  const result: ObjectRecord = {};
  const visit = (id: string) => {
    if (Object.hasOwn(result, id)) fail('VIEW_GRAPH_INVALID', 'A view graph is cyclic or shared.');
    const b = (r.target.blocks as ObjectRecord)[id];
    if (!record(b)) fail('VIEW_GRAPH_INVALID', 'A view block is missing.');
    result[id] = clone(b);
    for (const child of new Set(edges(b))) visit(child);
    if (Object.keys(result).length > 100000)
      fail('VIEW_GRAPH_LIMIT', 'The view graph exceeds its block limit.');
  };
  visit(r.id);
  return result;
}
function removeBody(
  project: ObjectRecord,
  reference: SourceDocumentReference,
  form: 'bundled' | 'unbundled',
  schema: boolean,
) {
  const known = roles(form),
    story = root(project, reference, known.story);
  if (!story) fail('VIEW_ROOT_MISSING', 'The document root is missing.');
  const config = schema ? root(project, reference, known.config) : null;
  for (const r of [story, ...(config ? [config] : [])]) {
    const blocks = r.target.blocks as ObjectRecord,
      owned = new Set(Object.keys(subtree(r)).filter((id) => id !== r.id));
    for (const [id, b] of Object.entries(blocks))
      if (id !== r.id && !owned.has(id) && record(b) && edges(b).some((next) => owned.has(next)))
        fail('VIEW_GRAPH_INVALID', 'Another script shares document view blocks.');
    for (const id of owned) delete blocks[id];
    r.block.next = null;
    if (r === config) delete blocks[r.id];
    if (record(r.target.comments))
      for (const [id, c] of Object.entries(r.target.comments))
        if (record(c) && typeof c.blockId === 'string' && owned.has(c.blockId))
          delete r.target.comments[id];
  }
}
function addAuthoring(project: ObjectRecord) {
  const extensions = (project.extensions ??= []) as unknown;
  if (!Array.isArray(extensions))
    fail('VIEW_PROJECT_INVALID', 'Project extensions must be an array.');
  if (!extensions.includes(dsl4BlockAuthoringExtensionId))
    extensions.push(dsl4BlockAuthoringExtensionId);
  const urls = (project.extensionURLs ??= {});
  if (!record(urls)) fail('VIEW_PROJECT_INVALID', 'Extension URLs must be an object.');
  urls[dsl4BlockAuthoringExtensionId] ??= embeddedYamlAuthoringRuntimeURL;
}
function uniquePrefix(project: ObjectRecord) {
  let prefix = 'graphYaml1_',
    serial = 1;
  const ids = targets(project).flatMap((t) => Object.keys(t.blocks as ObjectRecord));
  while (ids.some((id) => id.startsWith(prefix))) prefix = `graphYaml${++serial}_`;
  return prefix;
}
function parsed(source: string): ObjectRecord {
  const value = parse(source) as unknown;
  if (!record(value)) fail('VIEW_SOURCE_INVALID', 'A source module must be a YAML mapping.');
  return value;
}
function includeValues(value: ObjectRecord): string[] {
  if (value.include === undefined) return [];
  const values = typeof value.include === 'string' ? [value.include] : value.include;
  if (!Array.isArray(values) || values.some((v) => typeof v !== 'string'))
    fail('VIEW_INCLUDE_LITERAL', 'Includes must use static relative source paths.');
  return values as string[];
}
function relativePath(from: string, to: string) {
  const base = from.split('/').slice(0, -1),
    dest = to.split('/');
  while (base.length && dest.length && base[0] === dest[0]) {
    base.shift();
    dest.shift();
  }
  return [...base.map(() => '..'), ...dest].join('/');
}
function descriptorFor(
  project: ObjectRecord,
  reference: SourceDocumentReference,
): KamishibaiIncludeReferenceDescriptor {
  const selected = selectedOwner(project, reference);
  return {
    version: 1,
    kind: 'schema-include-references',
    form: selected.form,
    entryReference: {
      providerId: reference.providerId,
      documentId: sourceGraphDocumentId(selected.graph, selected.graph.entryPath),
    },
    documents: Object.keys(selected.graph.files)
      .sort()
      .map((path) => ({
        reference: {
          providerId: reference.providerId,
          documentId: sourceGraphDocumentId(selected.graph, path),
        },
        label: path === selected.graph.entryPath ? '' : path,
      })),
    maxIncludeDepth: 32,
  };
}
function rawDeclarations(project: ObjectRecord, reference: SourceDocumentReference) {
  const selected = selectedOwner(project, reference),
    descriptor = descriptorFor(project, reference),
    prefix = uniquePrefix(project);
  let serial = 0;
  const all: ObjectRecord = {};
  for (const path of Object.keys(selected.graph.files).sort()) {
    const source = parsed(selected.graph.files[path]!.source),
      includes = includeValues(source).map((v) => {
        const target = resolveDsl4IncludePath(path, v);
        if (!selected.graph.files[target] || target === selected.graph.entryPath)
          fail('VIEW_INCLUDE_UNKNOWN', 'An include must refer to a known module file.');
        return target;
      });
    delete source.include;
    const declaration = createDsl4StructuredBlockSourceDeclaration({
      source,
      form: selected.form === 'bundled' ? 'bundle' : 'runtime',
      hatId: `${prefix}${serial}_root`,
      idPrefix: `${prefix}${serial++}_`,
      label: path === selected.graph.entryPath ? '' : path,
      includeLabels: includes,
      version: '4.0',
      simpleSpeech: false,
      textSafeLiterals: true,
    });
    for (const b of Object.values(declaration))
      for (const v of Object.values(b.inputs))
        if (
          Array.isArray(v) &&
          Array.isArray(v[1]) &&
          v[1][0] === 10 &&
          typeof v[1][1] === 'string' &&
          /[\r\n]/u.test(v[1][1])
        )
          fail(
            'VIEW_LITERAL_UNSUPPORTED',
            'Use YAML blocks or raw source for multiline schema fields.',
          );
    Object.assign(all, declaration);
  }
  const temporary = {
    targets: [{isStage: true, name: 'Stage', blocks: all}],
  };
  return createKamishibaiIncludeReferenceView(temporary, {...descriptor}).project as ObjectRecord;
}
function staticValue(blocks: ObjectRecord, input: unknown): unknown {
  if (!Array.isArray(input) || ![1, 2, 3].includes(input[0] as number))
    fail('VIEW_LITERAL_INVALID', 'A source input must be a static scalar.');
  const v = input[1];
  if (
    Array.isArray(v) &&
    [4, 5, 6, 7, 8, 10, 11].includes(v[0] as number) &&
    ['string', 'number', 'boolean'].includes(typeof v[1])
  )
    return v[1];
  if (typeof v === 'string') {
    const b = blocks[v];
    if (
      record(b) &&
      b.shadow === true &&
      b.next === null &&
      b.topLevel === false &&
      record(b.fields) &&
      record(b.inputs) &&
      !Object.keys(b.inputs).length
    ) {
      const field =
        b.opcode === 'text'
          ? b.fields.TEXT
          : /^math_(?:number|integer|whole_number|positive_number|angle)$/u.test(String(b.opcode))
            ? b.fields.NUM
            : null;
      if (Array.isArray(field) && ['string', 'number', 'boolean'].includes(typeof field[0]))
        return field[0];
    }
  }
  fail('VIEW_LITERAL_INVALID', 'Dynamic reporters cannot supply source literals.');
}
/** Validate configuration ownership, then flatten only this read clone into its own document. */
function flattenConfigurations(
  project: ObjectRecord,
  descriptor: KamishibaiIncludeReferenceDescriptor,
) {
  const known = roles(descriptor.form),
    byRef = new Map(descriptor.documents.map((d) => [key(d.reference), d.label]));
  for (const binding of descriptor.documents) {
    const story = root(project, binding.reference, known.story);
    if (!story) fail('VIEW_ROOT_MISSING', 'A graph document is missing its story root.');
    const config = root(project, binding.reference, known.config);
    if (!config) continue;
    if (config.target !== story.target)
      fail('VIEW_GRAPH_INVALID', 'A document configuration must share its target.');
    const blocks = story.target.blocks as ObjectRecord,
      read = clone(blocks),
      storyBlock = read[story.id] as ObjectRecord,
      configBlock = read[config.id] as ObjectRecord;
    storyBlock.opcode = dsl4LabeledBlockSourceHatOpcode;
    storyBlock.inputs = {
      VERSION: [1, [10, '4.0']],
      LABEL: [1, [10, binding.label]],
    };
    storyBlock.fields = {};
    configBlock.opcode = dsl4ConfigBlockSourceHatOpcode;
    configBlock.inputs = {LABEL: [1, [10, binding.label]]};
    configBlock.fields = {};
    for (const b of Object.values(read))
      if (record(b) && b.opcode === known.include) {
        const ref = readReference(b, {blocks: read}),
          label = byRef.get(key(ref));
        if (label === undefined || !label)
          fail('VIEW_INCLUDE_UNKNOWN', 'An include reference is outside this graph.');
        b.opcode = dsl4IncludeBlocksOpcode;
        b.inputs = {LABEL: [1, [10, label]]};
        b.fields = {};
      }
    readDsl4StructuredBlockSource(read, story.id, (input) => staticValue(read, input), {
      entry: binding.label === '',
      configHatIds: [config.id],
      resolveInclude: (id) =>
        String(staticValue(read, (read[id] as {inputs: ObjectRecord}).inputs.LABEL)),
    });
    const first = config.block.next;
    if (typeof first === 'string') {
      let tail = first;
      const seen = new Set<string>();
      while (true) {
        if (seen.has(tail) || !record(blocks[tail]))
          fail('VIEW_GRAPH_INVALID', 'The configuration chain is invalid.');
        seen.add(tail);
        const next = (blocks[tail] as ObjectRecord).next;
        if (next === null) break;
        if (typeof next !== 'string')
          fail('VIEW_GRAPH_INVALID', 'The configuration chain is invalid.');
        tail = next;
      }
      (blocks[tail] as ObjectRecord).next = story.block.next;
      if (typeof story.block.next === 'string')
        (blocks[story.block.next] as ObjectRecord).parent = tail;
      story.block.next = first;
      (blocks[first] as ObjectRecord).parent = story.id;
    }
    delete blocks[config.id];
  }
}
interface CommentReadDetails {
  locations?: SchemaSourceLocation[];
  blocks?: ObjectRecord;
  rootIds?: string[];
  comments?: ObservedSchemaLineComment[];
}
function readGraphValues(
  project: ObjectRecord,
  reference: SourceDocumentReference,
  edited?: ObjectRecord,
  details?: CommentReadDetails,
) {
  const selected = selectedOwner(project, reference),
    descriptor = descriptorFor(project, reference),
    temporary = rawDeclarations(project, reference),
    known = roles(selected.form);
  if (edited) {
    edited = cloneKamishibaiDocumentProject(edited);
    const editedStory = root(edited, reference, known.story);
    if (!editedStory) fail('VIEW_ROOT_MISSING', 'The module root is missing.');
    const editedConfig = root(edited, reference, known.config);
    const rootIds = [editedStory.id, ...(editedConfig ? [editedConfig.id] : [])];
    const lineOpcode = createYamlBlockOpcodes(
      known.story.slice(0, -'embeddedYaml'.length),
    ).lineComment;
    if (typeof lineOpcode !== 'string')
      fail(
        'VIEW_SCHEMA_COMMENT_UNSUPPORTED',
        'The explicit line comment declaration is unavailable.',
      );
    const comments = stripSchemaLineCommentBlocks(
      editedStory.target.blocks as ObjectRecord,
      rootIds,
      lineOpcode,
    );
    if (details) {
      details.blocks = editedStory.target.blocks as ObjectRecord;
      details.rootIds = rootIds;
      details.comments = comments;
    }
    const oldStory = root(temporary, reference, known.story)!;
    removeBody(temporary, reference, selected.form, true);
    delete (oldStory.target.blocks as ObjectRecord)[oldStory.id];
    for (const opcode of [known.story, known.config]) {
      const r = root(edited, reference, opcode);
      if (r) Object.assign(oldStory.target.blocks as ObjectRecord, subtree(r));
    }
  }
  flattenConfigurations(temporary, descriptor);
  const extracted = readKamishibaiIncludeReferenceView(temporary, descriptor),
    modulePaths = Object.keys(selected.graph.files)
      .filter((p) => p !== selected.graph.entryPath)
      .sort(),
    paths = new Map<string, string>([
      [extracted.entryPath, selected.graph.entryPath],
      ...modulePaths.map(
        (path, index) =>
          [`blocks-${String(index + 1).padStart(4, '0')}.k4.yml`, path] as [string, string],
      ),
    ]);
  const values: Record<string, ObjectRecord> = {};
  for (const [synthetic, source] of Object.entries(extracted.sources)) {
    const path = paths.get(synthetic);
    if (!path) fail('VIEW_INCLUDE_UNKNOWN', 'An extracted module is not part of the source graph.');
    const value = parsed(source),
      original = parsed(selected.graph.files[path]!.source),
      originalIncludes = includeValues(original),
      targets = includeValues(value).map((p) => {
        const result = paths.get(p);
        if (!result) fail('VIEW_INCLUDE_UNKNOWN', 'An include points outside the source graph.');
        return result;
      });
    const originalTargets = originalIncludes.map((p) => resolveDsl4IncludePath(path, p));
    if (same(targets, originalTargets)) {
      if (Object.hasOwn(original, 'include')) value.include = clone(original.include);
      else delete value.include;
    } else {
      const rewritten = targets.map(
        (target) =>
          originalIncludes.find((p) => resolveDsl4IncludePath(path, p) === target) ??
          relativePath(path, target),
      );
      if (!rewritten.length) delete value.include;
      else
        value.include =
          typeof original.include === 'string' && rewritten.length === 1 ? rewritten[0] : rewritten;
    }
    if (Object.hasOwn(original, 'kamishibai')) value.kamishibai = original.kamishibai;
    else delete value.kamishibai;
    values[path] = value;
  }
  if (details)
    details.locations = extracted.blockLocations
      .filter((location) => paths.get(location.sourcePath) === selected.path)
      .map((location) => ({path: location.path, blockId: location.blockId}));
  return values;
}
export interface KamishibaiGraphDocumentViewInput {
  project: ObjectRecord;
  source: string;
  reference: SourceDocumentReference;
  request: {kind: string; direction: 'from-source' | 'to-source'};
}
interface Options {
  frontend: Dsl4SourceFrontend;
  replaceSource: (
    project: ObjectRecord,
    documentId: string,
    source: string,
  ) => Promise<{project: ObjectRecord; component: ObjectRecord}>;
}
function readGraphDocumentView(project: ObjectRecord, reference: SourceDocumentReference) {
  const selected = selectedOwner(project, reference),
    state = readDocumentViewMetadata(selected.owner, reference),
    kind = state?.activeKind,
    known = roles(selected.form);
  if (!state || (kind !== 'yaml-blocks' && kind !== 'schema-blocks'))
    fail('VIEW_INACTIVE', 'This module does not have a known active block representation.');
  let source = selected.file.source;
  const descriptor = state.descriptors[kind];
  if (
    !record(descriptor) ||
    descriptor.baseSourceRevision !== selected.file.integrity ||
    !record(descriptor.reference) ||
    key(descriptor.reference as unknown as SourceDocumentReference) !== key(reference)
  )
    fail('PROJECT_CONFLICT', 'This document source changed after its module view was created.');
  if (kind === 'yaml-blocks') {
    if (descriptor.rootOpcode !== known.story)
      fail('VIEW_DESCRIPTOR_INVALID', 'The YAML view uses a different root declaration.');
    const r = root(project, reference, known.story);
    if (!r) fail('VIEW_ROOT_MISSING', 'The module root is missing.');
    source = readYamlSourceBlockView({
      baseline: parseSourceSyntax(source, {format: 'yaml'}).baseline,
      blocks: r.target.blocks as ObjectRecord,
      descriptor:
        descriptor as unknown as import('@kubohiroya/turbowarp-yaml-json/yaml-blocks').YamlViewDescriptor,
      sourceRevision: selected.file.integrity,
    }).source;
  } else {
    if (descriptor.kind !== 'graph-schema-blocks' || descriptor.form !== selected.form)
      fail('VIEW_DESCRIPTOR_INVALID', 'The script view descriptor does not match this graph.');
    const before = readGraphValues(project, reference),
      details: CommentReadDetails = {};
    const after = readGraphValues(project, reference, project, details);
    const patch = (text: string) =>
      patchKamishibaiSourceValue(text, before[selected.path], after[selected.path]);
    source =
      descriptor.lineComments || details.comments?.length
        ? reconcileSchemaLineComments({
            source,
            descriptor: descriptor.lineComments as SchemaLineCommentDescriptor | undefined,
            observed: details.comments!,
            blocks: details.blocks!,
            rootIds: details.rootIds!,
            locations: details.locations!,
            semanticValue: after[selected.path],
            patch,
          })
        : patch(source);
    return {source, values: after};
  }
  return {source};
}
/** Read the visible module without updating its source, representation or project. */
export function readKamishibaiGraphDocumentViewSource(
  project: ObjectRecord,
  reference: SourceDocumentReference,
): string {
  return readGraphDocumentView(project, reference).source;
}
/** Module raw files stay canonical; every candidate owns a caller-created project copy. */
export async function buildKamishibaiGraphDocumentViewCandidate(
  input: KamishibaiGraphDocumentViewInput,
  options: Options,
): Promise<{project: ObjectRecord; source: string; summary: string}> {
  let {project, source} = input;
  project = cloneKamishibaiDocumentProject(project);
  const {reference, request} = input;
  let selected = selectedOwner(project, reference);
  if (selected.file.source !== source) fail('PROJECT_CONFLICT', 'This module source changed.');
  const state = readDocumentViewMetadata(selected.owner, reference),
    active = state?.activeKind ?? 'source',
    known = roles(selected.form);
  if (!['yaml-blocks', 'schema-blocks'].includes(request.kind))
    fail('REPRESENTATION_UNSUPPORTED', 'Choose YAML blocks or script blocks.');
  if (request.direction === 'from-source') {
    if (active !== 'source') {
      if (!['yaml-blocks', 'schema-blocks'].includes(active))
        fail('DOCUMENT_VIEW_ACTIVE', 'The active view is unsupported.');
      const reflected = await buildKamishibaiGraphDocumentViewCandidate(
        {...input, request: {kind: active, direction: 'to-source'}},
        options,
      );
      if (active === request.kind && reflected.source === source)
        return {
          project,
          source,
          summary: 'Validate the unchanged visible module and retain its saved block format.',
        };
      return buildKamishibaiGraphDocumentViewCandidate({...input, ...reflected, request}, options);
    }
    installDsl4EmbeddedYamlRoot(project, {channel: selected.form});
    const checked = await options.replaceSource(project, reference.documentId, source);
    project = checked.project;
    selected = selectedOwner(project, reference);
    const existing = root(project, reference, known.story);
    if (existing?.block.next)
      fail('VIEW_OCCUPIED', 'The document root already has connected blocks.');
    let descriptor: unknown;
    if (request.kind === 'yaml-blocks') {
      const stages = targets(project).filter((t) => t.isStage === true);
      if (!existing && stages.length !== 1)
        fail('VIEW_PROJECT_INVALID', 'A unique Stage is required.');
      const target = existing?.target ?? stages[0]!,
        blocks = target.blocks as ObjectRecord,
        prefix = uniquePrefix(project),
        rootId = existing?.id ?? `${prefix}root`,
        built = createYamlSourceBlockView({
          source,
          format: 'yaml',
          sourceRevision: selected.file.integrity,
          reference,
          rootId,
          rootOpcode: known.story,
          opcodes: createYamlBlockOpcodes(known.story.slice(0, -'embeddedYaml'.length)),
          idPrefix: prefix,
          x: typeof existing?.block.x === 'number' ? existing.block.x : 32,
          y: typeof existing?.block.y === 'number' ? existing.block.y : 32,
        });
      if (existing)
        built.blocks[rootId] = {
          ...existing.block,
          next: built.blocks[rootId]!.next,
        } as (typeof built.blocks)[string];
      Object.assign(blocks, built.blocks);
      descriptor = {
        ...built.descriptor,
        sourceGraphIntegrity: selected.graph.integrity,
      };
    } else {
      const baseline = readGraphValues(project, reference),
        temporary = rawDeclarations(project, reference),
        stage = existing?.target ?? targets(project).find((t) => t.isStage === true);
      if (!stage) fail('VIEW_PROJECT_INVALID', 'A Stage is required.');
      for (const opcode of [known.story, known.config]) {
        const r = root(temporary, reference, opcode);
        if (!r) continue;
        const blocks = subtree(r);
        if (opcode === known.story && existing) {
          const generated = blocks[r.id] as ObjectRecord;
          delete blocks[r.id];
          if (typeof generated.next === 'string')
            (blocks[generated.next] as ObjectRecord).parent = existing.id;
          blocks[existing.id] = {...existing.block, next: generated.next};
        }
        Object.assign(stage.blocks as ObjectRecord, blocks);
      }
      if (!same(baseline, readGraphValues(project, reference, project)))
        fail('VIEW_NOT_EQUIVALENT', 'The module script view changed the source graph meaning.');
      const details: CommentReadDetails = {};
      const value = readGraphValues(project, reference, project, details)[selected.path];
      const documentRoot = root(project, reference, known.story)!;
      const lineOpcode = createYamlBlockOpcodes(
        known.story.slice(0, -'embeddedYaml'.length),
      ).lineComment;
      if (typeof lineOpcode !== 'string')
        fail(
          'VIEW_SCHEMA_COMMENT_UNSUPPORTED',
          'The explicit line comment declaration is unavailable.',
        );
      const lineComments = addSchemaLineCommentBlocks({
        source,
        blocks: documentRoot.target.blocks as ObjectRecord,
        rootIds: details.rootIds!,
        locations: details.locations!,
        semanticValue: value,
        opcode: lineOpcode,
        idPrefix: uniquePrefix(project) + 'comment-',
      });
      descriptor = {
        version: 1,
        kind: 'graph-schema-blocks',
        lineComments,
        reference: clone(reference),
        form: selected.form,
        baseSourceRevision: selected.file.integrity,
        sourceGraphIntegrity: selected.graph.integrity,
      };
      addAuthoring(project);
    }
    writeDocumentViewMetadata(selected.owner, reference, {
      activeKind: request.kind,
      descriptors: {[request.kind]: descriptor},
    });
    return {
      project,
      source,
      summary: `Create ${request.kind} for ${selected.path}; preserve all original module files and assets.`,
    };
  }
  if (request.direction !== 'to-source' || active !== request.kind || !state)
    fail('VIEW_INACTIVE', 'This module does not have that active representation.');
  const read = readGraphDocumentView(project, reference);
  source = read.source;
  if (read.values) {
    const checked = await options.replaceSource(
      cloneKamishibaiDocumentProject(project),
      reference.documentId,
      source,
    );
    if (!same(read.values, readGraphValues(checked.project, reference)))
      fail('VIEW_NOT_EQUIVALENT', 'The edited module does not preserve the full graph meaning.');
  }
  removeBody(project, reference, selected.form, request.kind === 'schema-blocks');
  const updated = await options.replaceSource(project, reference.documentId, source);
  project = updated.project;
  selected = selectedOwner(project, reference);
  source = selected.file.source;
  writeDocumentViewMetadata(selected.owner, reference, {
    activeKind: 'source',
    descriptors: {},
  });
  return {
    project,
    source,
    summary: `Reflect ${selected.path} into its canonical raw file; preserve other documents and assets.`,
  };
}
/** Preview only the selected document subtree, without copying archive assets or loading extensions. */
export async function buildKamishibaiGraphDocumentPreviewArtifact(
  input: Omit<KamishibaiGraphDocumentViewInput, 'request'> & {kind: string},
  options: Options,
) {
  const {project, reference, kind} = input;
  let source = input.source;
  const selected = selectedOwner(project, reference),
    active = readDocumentViewMetadata(selected.owner, reference)?.activeKind ?? 'source';
  if (!['source', 'yaml-blocks', 'schema-blocks'].includes(kind))
    fail('REPRESENTATION_UNSUPPORTED', 'Choose an available representation.');
  if (selected.file.source !== source) fail('PROJECT_CONFLICT', 'This module source changed.');
  let graphProject = project;
  let candidate:
    | ({request: KamishibaiGraphDocumentViewInput['request']} & Awaited<
        ReturnType<typeof buildKamishibaiGraphDocumentViewCandidate>
      >)
    | undefined;
  if (kind !== active) {
    const request: KamishibaiGraphDocumentViewInput['request'] =
      kind === 'source' ? {kind: active, direction: 'to-source'} : {kind, direction: 'from-source'};
    const converted = await buildKamishibaiGraphDocumentViewCandidate(
      {project, source, reference, request},
      options,
    );
    candidate = {...converted, request};
    graphProject = converted.project;
    source = converted.source;
  } else if (active !== 'source') {
    const request: KamishibaiGraphDocumentViewInput['request'] = {kind, direction: 'from-source'};
    const converted = await buildKamishibaiGraphDocumentViewCandidate(
      {project, source, reference, request},
      options,
    );
    candidate = {...converted, request};
    graphProject = converted.project;
    source = converted.source;
  }
  if (kind === 'source')
    return {
      preview: normalizeSourceDocumentPreview({kind, source}, kind),
      ...(candidate ? {candidate} : {}),
    };
  const current = selectedOwner(graphProject, reference),
    known = roles(current.form),
    blocks: ObjectRecord = {},
    rootIds: string[] = [];
  for (const opcode of [known.story, known.config]) {
    const r = root(graphProject, reference, opcode);
    if (r) {
      Object.assign(blocks, subtree(r));
      rootIds.push(r.id);
    }
  }
  if (!rootIds.length) fail('VIEW_ROOT_MISSING', 'The module preview has no root.');
  const info = createDsl4BlockAuthoringInfo({
      narrativeControlEnabled: true,
      referenceViews: true,
    }),
    prefix = known.story.slice(0, -'embeddedYaml'.length),
    runtimeDefinitions = [
      createDsl4EmbeddedYamlHatDefinition({HAT: 'hat'}),
      createDsl4EmbeddedYamlConfigHatDefinition({HAT: 'hat'}),
      createDsl4EmbeddedYamlIncludeDefinition({
        BlockType: {COMMAND: 'command'},
      }),
      ...createYamlBlockDefinitions(),
    ];
  const used = new Set(
    Object.values(blocks)
      .filter(record)
      .map((b) => b.opcode),
  );
  const blockDefinitions = [
    ...info.blocks.map((d) => ({
      ...d,
      opcode: `${info.id}_${d.opcode}`,
      colour: info.color1,
    })),
    ...runtimeDefinitions.map((d) => ({
      ...d,
      opcode: `${prefix}${d.opcode}`,
      colour: '#6b49a8',
    })),
  ].filter((d) => used.has(d.opcode));
  const menus = {
    ...info.menus,
    ...createYamlBlockMenus(),
    embeddedYamlDocuments: {
      items: Object.keys(current.graph.files)
        .sort()
        .map((path) => ({
          text: path,
          value: key({
            providerId: reference.providerId,
            documentId: sourceGraphDocumentId(current.graph, path),
          }),
        })),
    },
    embeddedYamlIncludeDocuments: {
      items: Object.keys(current.graph.files)
        .filter((path) => path !== current.graph.entryPath)
        .sort()
        .map((path) => ({
          text: path,
          value: key({
            providerId: reference.providerId,
            documentId: sourceGraphDocumentId(current.graph, path),
          }),
        })),
    },
  };
  return {
    preview: normalizeSourceDocumentPreview(
      {kind, source, blocks, rootIds, blockDefinitions, menus},
      kind,
    ),
    ...(candidate ? {candidate} : {}),
  };
}

/** Public preview compatibility: conversion artifacts remain private to the owner transaction. */
export async function buildKamishibaiGraphDocumentPreview(
  input: Parameters<typeof buildKamishibaiGraphDocumentPreviewArtifact>[0],
  options: Parameters<typeof buildKamishibaiGraphDocumentPreviewArtifact>[1],
) {
  return (await buildKamishibaiGraphDocumentPreviewArtifact(input, options)).preview;
}
