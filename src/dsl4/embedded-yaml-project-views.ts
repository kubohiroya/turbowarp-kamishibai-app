import {cloneKamishibaiDocumentProject} from './embedded-yaml-project-clone.js';
import {installDsl4EmbeddedYamlRoot} from './embedded-yaml-hat.js';
import {readReference} from '@kubohiroya/turbowarp-document-source';
import {
  encodeSourceDocumentReference,
  normalizeSourceDocumentPreview,
  type SourceDocumentReference,
} from '@kubohiroya/turbowarp-document-data/composition';
import {
  createYamlBlockOpcodes,
  createYamlBlockDefinitions,
  createYamlBlockMenus,
  type YamlViewBlock,
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
import {createDsl4BlockAuthoringInfo} from './structured-block-source-codec.js';
import {dsl4BlockAuthoringExtensionId} from './block-source-shared.js';
import {embeddedYamlAuthoringRuntimeURL} from './generated/embedded-yaml-authoring-runtime.js';
import {
  buildKamishibaiSchemaBlockView,
  sourceFromKamishibaiSchemaBlockView,
  type KamishibaiSchemaViewDescriptor,
} from './embedded-yaml-representations.js';
import {kamishibaiDocumentOwner} from './embedded-yaml-document-owner.js';
import {
  dsl4EmbeddedYamlHatOpcode,
  dsl4BundledEmbeddedYamlHatOpcode,
  dsl4EmbeddedYamlConfigHatOpcode,
  dsl4BundledEmbeddedYamlConfigHatOpcode,
} from './embedded-yaml-identity.js';
import type {Dsl4SourceFrontend} from './source-frontend.js';
type JsonObject = Record<string, unknown>;
const record = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), {code});
}
const opcodeFor = (form: 'bundled' | 'unbundled') =>
  form === 'bundled' ? dsl4BundledEmbeddedYamlHatOpcode : dsl4EmbeddedYamlHatOpcode;
const configOpcodeFor = (form: 'bundled' | 'unbundled') =>
  form === 'bundled' ? dsl4BundledEmbeddedYamlConfigHatOpcode : dsl4EmbeddedYamlConfigHatOpcode;
const refKey = (reference: SourceDocumentReference) => encodeSourceDocumentReference(reference);
interface Root {
  id: string;
  block: JsonObject;
  target: JsonObject;
}
function findRoot(
  project: JsonObject,
  reference: SourceDocumentReference,
  opcode: string,
): Root | null {
  const found: Root[] = [];
  for (const target of Array.isArray(project.targets) ? project.targets : []) {
    if (!record(target) || !record(target.blocks)) continue;
    for (const [id, block] of Object.entries(target.blocks)) {
      if (!record(block) || block.opcode !== opcode) continue;
      let ref: SourceDocumentReference;
      try {
        ref = readReference(block, {blocks: target.blocks});
      } catch {
        fail('VIEW_ROOT_INVALID', 'A document reference hat is malformed.');
      }
      if (refKey(ref) !== refKey(reference)) continue;
      if (
        block.parent !== null ||
        block.topLevel !== true ||
        Object.keys(record(block.inputs) ? block.inputs : {}).some((key) => key !== 'DOCUMENT')
      )
        fail('VIEW_ROOT_INVALID', 'The document hat has unsupported connections.');
      found.push({id, block, target});
    }
  }
  if (found.length > 1) fail('VIEW_ROOT_INVALID', 'The document has duplicate reference roots.');
  return found[0] ?? null;
}
function referencedBlocks(block: JsonObject): string[] {
  const ids = typeof block.next === 'string' ? [block.next] : [];
  for (const connection of Object.values(record(block.inputs) ? block.inputs : {})) {
    if (Array.isArray(connection)) {
      for (const value of connection.slice(1)) if (typeof value === 'string') ids.push(value);
    } else if (record(connection)) {
      if (typeof connection.block === 'string') ids.push(connection.block);
      if (typeof connection.shadow === 'string') ids.push(connection.shadow);
    }
  }
  return ids;
}
function removeDerivedBodies(
  project: JsonObject,
  reference: SourceDocumentReference,
  form: 'bundled' | 'unbundled',
  schema: boolean,
) {
  const story = findRoot(project, reference, opcodeFor(form));
  if (!story) fail('VIEW_ROOT_MISSING', 'The document root is missing.');
  const config = schema ? findRoot(project, reference, configOpcodeFor(form)) : null;
  for (const root of [story, ...(config ? [config] : [])]) {
    const blocks = root.target.blocks as JsonObject;
    const owned = new Set<string>();
    const visit = (id: string) => {
      if (owned.has(id)) fail('VIEW_GRAPH_INVALID', 'The view graph is cyclic or shared.');
      const block = blocks[id];
      if (!record(block)) fail('VIEW_GRAPH_INVALID', 'A view block is missing.');
      owned.add(id);
      for (const next of referencedBlocks(block)) visit(next);
    };
    if (typeof root.block.next === 'string') visit(root.block.next);
    for (const [id, block] of Object.entries(blocks))
      if (
        id !== root.id &&
        !owned.has(id) &&
        record(block) &&
        referencedBlocks(block).some((next) => owned.has(next))
      )
        fail('VIEW_GRAPH_INVALID', 'Another script shares a derived view block.');
    for (const id of owned) delete blocks[id];
    root.block.next = null;
    if (root === config) delete blocks[root.id];
    if (record(root.target.comments))
      for (const [id, comment] of Object.entries(root.target.comments))
        if (record(comment) && typeof comment.blockId === 'string' && owned.has(comment.blockId))
          delete root.target.comments[id];
  }
}
function owner(project: JsonObject) {
  const selected = kamishibaiDocumentOwner(project);
  if (
    !selected ||
    !record(selected.owner.source) ||
    typeof selected.owner.source.text !== 'string' ||
    typeof selected.owner.source.integrity !== 'string'
  )
    fail('VIEW_SOURCE_INVALID', 'A canonical embedded story source is required.');
  return {...selected, source: selected.owner.source};
}
function authoringRuntime(project: JsonObject) {
  if (project.extensions !== undefined && !Array.isArray(project.extensions))
    fail('VIEW_PROJECT_INVALID', 'Project extensions must be an array.');
  const extensions = (project.extensions ??= []) as string[];
  if (!extensions.includes(dsl4BlockAuthoringExtensionId))
    extensions.push(dsl4BlockAuthoringExtensionId);
  if (project.extensionURLs === undefined) project.extensionURLs = {};
  if (!record(project.extensionURLs))
    fail('VIEW_PROJECT_INVALID', 'Project extension URLs must be an object.');
  if (project.extensionURLs[dsl4BlockAuthoringExtensionId] === undefined)
    project.extensionURLs[dsl4BlockAuthoringExtensionId] = embeddedYamlAuthoringRuntimeURL;
}
export interface KamishibaiViewBuildInput {
  project: JsonObject;
  source: string;
  reference: SourceDocumentReference;
  request: {kind: string; direction: 'from-source' | 'to-source'};
}
/** Read the current document view without reflecting it or changing live state. */
export function readKamishibaiDocumentViewSource(
  project: JsonObject,
  reference: SourceDocumentReference,
  frontend?: Dsl4SourceFrontend,
): string {
  const selected = owner(project),
    state = readDocumentViewMetadata(selected.owner, reference),
    kind = state?.activeKind,
    rootOpcode = opcodeFor(selected.form),
    opcodes = createYamlBlockOpcodes(rootOpcode.slice(0, -'embeddedYaml'.length));
  if (!state || (kind !== 'yaml-blocks' && kind !== 'schema-blocks'))
    fail('VIEW_INACTIVE', 'This document does not have a known active block representation.');
  let source = String(selected.source.text);
  const descriptor = state.descriptors[kind];
  if (
    !record(descriptor) ||
    !record(descriptor.reference) ||
    refKey(descriptor.reference as unknown as SourceDocumentReference) !== refKey(reference) ||
    descriptor.baseSourceRevision !== selected.source.integrity
  )
    fail('PROJECT_CONFLICT', 'The canonical source changed after this block view was created.');
  if (kind === 'schema-blocks') {
    if (!frontend) fail('VIEW_FRONTEND_REQUIRED', 'The owner source frontend is required.');
    if (
      descriptor.form !== selected.form ||
      descriptor.sourceId !== selected.source.sourceId ||
      !record(descriptor.reference) ||
      refKey(descriptor.reference as unknown as SourceDocumentReference) !== refKey(reference)
    )
      fail(
        'VIEW_DESCRIPTOR_INVALID',
        'The schema view descriptor does not identify this document.',
      );
    source = sourceFromKamishibaiSchemaBlockView(
      project,
      descriptor as unknown as KamishibaiSchemaViewDescriptor,
      source,
      frontend,
    );
  } else {
    if (
      descriptor.rootOpcode !== rootOpcode ||
      !record(descriptor.opcodes) ||
      Object.keys(descriptor.opcodes).some((kind) => !Object.hasOwn(opcodes, kind)) ||
      Object.entries(opcodes).some(([kind, opcode]) => {
        if (
          (kind === 'lineComment' || kind === 'inlineComment') &&
          !Object.hasOwn(descriptor.opcodes as JsonObject, kind)
        )
          return false;
        return (descriptor.opcodes as JsonObject)[kind] !== opcode;
      })
    )
      fail('VIEW_DESCRIPTOR_INVALID', 'The YAML view uses unknown declarations.');
    const root = findRoot(project, reference, rootOpcode);
    if (!root) fail('VIEW_ROOT_MISSING', 'The document root is missing.');
    const syntax = parseSourceSyntax(source, {format: 'yaml'});
    source = readYamlSourceBlockView({
      baseline: syntax.baseline,
      blocks: root.target.blocks as Record<string, unknown>,
      descriptor:
        descriptor as unknown as import('@kubohiroya/turbowarp-yaml-json/yaml-blocks').YamlViewDescriptor,
      sourceRevision: String(selected.source.integrity),
    }).source;
  }
  return source;
}
/** Owner-specific semantics around the common VM transaction and syntax/graph codecs. */
export async function buildKamishibaiDocumentViewCandidate(
  input: KamishibaiViewBuildInput,
  {
    frontend,
    replaceSource,
  }: {
    frontend: Dsl4SourceFrontend;
    replaceSource: (
      project: JsonObject,
      source: string,
    ) => Promise<{
      project: JsonObject;
      component: {source: {text: string}};
    }>;
  },
): Promise<{project: JsonObject; source: string; summary: string}> {
  let {project, source} = input;
  project = cloneKamishibaiDocumentProject(project);
  const {reference, request} = input;
  if (!['yaml-blocks', 'schema-blocks'].includes(request.kind))
    fail('REPRESENTATION_UNSUPPORTED', 'Choose YAML blocks or owner schema blocks.');
  let selected = owner(project);
  if (selected.source.text !== source) fail('PROJECT_CONFLICT', 'The canonical source changed.');
  const state = readDocumentViewMetadata(selected.owner, reference);
  const active = state?.activeKind ?? 'source';
  const rootOpcode = opcodeFor(selected.form);
  const opcodes = createYamlBlockOpcodes(rootOpcode.slice(0, -'embeddedYaml'.length));
  if (request.direction === 'from-source') {
    if (active !== 'source') {
      if (!['yaml-blocks', 'schema-blocks'].includes(active))
        fail(
          'DOCUMENT_VIEW_ACTIVE',
          'Reflect the current block view into source first; the active representation cannot be regenerated or overwritten.',
        );
      // Both pure steps share one caller-owned copy; only the final candidate reaches the VM.
      const reflected = await buildKamishibaiDocumentViewCandidate(
        {...input, request: {kind: active, direction: 'to-source'}},
        {frontend, replaceSource},
      );
      if (active === request.kind && reflected.source === source)
        return {
          project,
          source,
          summary: 'Validate the unchanged visible block document and retain its saved format.',
        };
      const converted = await buildKamishibaiDocumentViewCandidate(
        {...input, project: reflected.project, source: reflected.source},
        {frontend, replaceSource},
      );
      return {
        ...converted,
        summary: `${active} → source → ${request.kind}: reflect the current edits and preserve the canonical YAML, comments and assets in one transaction.`,
      };
    }
    const root = findRoot(project, reference, rootOpcode);
    if (root?.block.next)
      fail('VIEW_OCCUPIED', 'The document hat already has a body and will not be overwritten.');
    let descriptor: unknown;
    if (request.kind === 'schema-blocks') {
      const built = buildKamishibaiSchemaBlockView(project, {
        reference,
        source,
        sourceId: String(selected.source.sourceId),
        form: selected.form,
        sourceFrontend: frontend,
      });
      project = built.project;
      descriptor = {
        ...built.descriptor,
        baseSourceRevision: selected.source.integrity,
      };
      authoringRuntime(project);
    } else {
      const stages = (project.targets as JsonObject[]).filter((target) => target.isStage === true);
      if (!root && stages.length !== 1) fail('VIEW_ROOT_INVALID', 'A Stage is required.');
      const target = root?.target ?? stages[0]!;
      if (!record(target.blocks)) target.blocks = {};
      const blocks = target.blocks as JsonObject;
      let serial = 1;
      while (Object.keys(blocks).some((id) => id.startsWith(`appYaml${serial}_`))) serial++;
      const prefix = `appYaml${serial}_`;
      const rootId = root?.id ?? `${prefix}root`;
      const built = createYamlSourceBlockView({
        source,
        format: 'yaml',
        sourceRevision: String(selected.source.integrity),
        reference,
        rootId,
        rootOpcode,
        opcodes,
        idPrefix: prefix,
        x: typeof root?.block.x === 'number' ? root.block.x : 32,
        y: typeof root?.block.y === 'number' ? root.block.y : 32,
      });
      if (root) {
        // findRoot already validated this block as a document reference hat.
        const generated = built.blocks[rootId]!;
        built.blocks[rootId] = {
          ...(root.block as unknown as YamlViewBlock),
          next: generated.next,
        };
      }
      Object.assign(blocks, built.blocks);
      descriptor = built.descriptor;
    }
    selected = owner(project);
    installDsl4EmbeddedYamlRoot(project, {channel: selected.form});
    writeDocumentViewMetadata(selected.owner, reference, {
      activeKind: request.kind,
      descriptors: {[request.kind]: descriptor},
    });
    return {
      project,
      source,
      summary: `Source → ${request.kind}: preserve the canonical YAML and assets; edit the derived blocks, then explicitly reflect them into source.`,
    };
  }
  if (request.direction !== 'to-source' || active !== request.kind || !state)
    fail('VIEW_INACTIVE', 'This document does not have that active block representation.');
  source = readKamishibaiDocumentViewSource(project, reference, frontend);
  removeDerivedBodies(project, reference, selected.form, request.kind === 'schema-blocks');
  const updated = await replaceSource(project, source);
  project = updated.project;
  source = updated.component.source.text;
  selected = owner(project);
  writeDocumentViewMetadata(selected.owner, reference, {
    activeKind: 'source',
    descriptors: {},
  });
  return {
    project,
    source,
    summary: `${request.kind} → source: validate and preserve comments, update the canonical story, and return to its file reference hat.`,
  };
}

/** Return only the selected document graph, never its project, assets or extension URLs. */
function previewGraph(project: JsonObject, reference: SourceDocumentReference) {
  const selected = owner(project);
  const story = findRoot(project, reference, opcodeFor(selected.form));
  if (!story) fail('VIEW_ROOT_MISSING', 'The document root is missing.');
  const config = findRoot(project, reference, configOpcodeFor(selected.form));
  const rootIds = [story.id, ...(config ? [config.id] : [])];
  const blocks: JsonObject = {};
  const visit = (id: string, target: JsonObject) => {
    if (Object.hasOwn(blocks, id))
      fail('VIEW_GRAPH_INVALID', 'The view graph is cyclic or shared.');
    const block = (target.blocks as JsonObject)[id];
    if (!record(block)) fail('VIEW_GRAPH_INVALID', 'A view block is missing.');
    blocks[id] = JSON.parse(JSON.stringify(block)) as unknown;
    for (const child of new Set(referencedBlocks(block))) visit(child, target);
  };
  visit(story.id, story.target);
  if (config) visit(config.id, config.target);
  return {blocks, rootIds};
}

/** Pure preview construction, including unreflected edits in the current block graph. */
export async function buildKamishibaiDocumentPreviewArtifact(
  input: Omit<KamishibaiViewBuildInput, 'request'> & {kind: string},
  options: Parameters<typeof buildKamishibaiDocumentViewCandidate>[1],
) {
  const {project, reference, kind} = input;
  let previewSource = input.source;
  if (!['source', 'yaml-blocks', 'schema-blocks'].includes(kind))
    fail('REPRESENTATION_UNSUPPORTED', 'Choose source, YAML blocks or owner schema blocks.');
  const selected = owner(project);
  if (selected.source.text !== previewSource)
    fail('PROJECT_CONFLICT', 'The canonical source changed.');
  const active = readDocumentViewMetadata(selected.owner, reference)?.activeKind ?? 'source';
  let previewProject = project;
  let candidate:
    | ({request: KamishibaiViewBuildInput['request']} & Awaited<
        ReturnType<typeof buildKamishibaiDocumentViewCandidate>
      >)
    | undefined;
  if (kind !== active) {
    const request: KamishibaiViewBuildInput['request'] =
      kind === 'source' ? {kind: active, direction: 'to-source'} : {kind, direction: 'from-source'};
    const converted = await buildKamishibaiDocumentViewCandidate(
      {project, source: previewSource, reference, request},
      options,
    );
    candidate = {...converted, request};
    previewProject = converted.project;
    previewSource = converted.source;
  } else if (active !== 'source') {
    const request: KamishibaiViewBuildInput['request'] = {kind, direction: 'from-source'};
    const converted = await buildKamishibaiDocumentViewCandidate(
      {project, source: previewSource, reference, request},
      options,
    );
    candidate = {...converted, request};
    previewProject = converted.project;
    previewSource = converted.source;
  }
  if (kind === 'source')
    return {
      preview: normalizeSourceDocumentPreview({kind, source: previewSource}, kind),
      ...(candidate ? {candidate} : {}),
    };
  const graph = previewGraph(previewProject, reference);
  const info = createDsl4BlockAuthoringInfo({
    narrativeControlEnabled: true,
    referenceViews: true,
  });
  const used = new Set(
    Object.values(graph.blocks)
      .filter(record)
      .map((block) => block.opcode),
  );
  const runtimePrefix = opcodeFor(selected.form).slice(0, -'embeddedYaml'.length);
  const blockDefinitions = [
    ...info.blocks.map((definition) => ({
      ...definition,
      opcode: `${info.id}_${definition.opcode}`,
      colour: 'color1' in definition ? definition.color1 : info.color1,
      blockIconURI: 'blockIconURI' in definition ? definition.blockIconURI : info.blockIconURI,
    })),
    ...createYamlBlockDefinitions().map((definition) => ({
      ...definition,
      opcode: runtimePrefix + definition.opcode,
      colour: '#6b49a8',
    })),
  ].filter((definition) => used.has(definition.opcode));
  return {
    preview: normalizeSourceDocumentPreview(
      {
        kind,
        source: previewSource,
        ...graph,
        blockDefinitions,
        menus: {...info.menus, ...createYamlBlockMenus()},
      },
      kind,
    ),
    ...(candidate ? {candidate} : {}),
  };
}

/** Public preview compatibility: callers receive only the immutable display model. */
export async function buildKamishibaiDocumentPreview(
  input: Parameters<typeof buildKamishibaiDocumentPreviewArtifact>[0],
  options: Parameters<typeof buildKamishibaiDocumentPreviewArtifact>[1],
) {
  return (await buildKamishibaiDocumentPreviewArtifact(input, options)).preview;
}
