import {
  readReference,
  validateEmbeddedYamlFilename,
} from '@kubohiroya/turbowarp-document-source';
import {
  validateEmbeddedYamlRootMarker,
  readEmbeddedYamlRootVersion,
} from '@kubohiroya/turbowarp-document-data/document-source';
import type {SourceDocumentReference} from '@kubohiroya/turbowarp-document-data/composition';
import {
  readEmbeddedYamlSourceGraphRecord,
  sourceGraphDocumentPath,
} from './embedded-yaml-source-graph.js';
import {
  dsl4EmbeddedYamlRootOpcode,
  dsl4BundledEmbeddedYamlRootOpcode,
  dsl4EmbeddedYamlHatOpcode,
  dsl4BundledEmbeddedYamlHatOpcode,
  dsl4EmbeddedYamlConfigHatOpcode,
  dsl4BundledEmbeddedYamlConfigHatOpcode,
  kamishibaiEmbeddedYamlProviderId,
  kamishibaiEmbeddedYamlDocumentId,
} from './embedded-yaml-identity.js';
type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const rootOpcodes = new Set([dsl4EmbeddedYamlRootOpcode, dsl4BundledEmbeddedYamlRootOpcode]);
const fileOpcodes = new Set([
  dsl4EmbeddedYamlHatOpcode,
  dsl4BundledEmbeddedYamlHatOpcode,
  dsl4EmbeddedYamlConfigHatOpcode,
  dsl4BundledEmbeddedYamlConfigHatOpcode,
]);
function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), {code});
}
function owner(project: RecordValue) {
  const storage = record(project.extensionStorage) ? project.extensionStorage : {};
  const bundle = record(storage.kubohiroyakamishibai4) ? storage.kubohiroyakamishibai4 : {};
  const components = record(bundle.components) ? bundle.components : {};
  const bundled = components.kubohiroyakamishibairuntime4,
    direct = storage.kubohiroyakamishibairuntime4;
  if (bundled !== undefined && direct !== undefined)
    fail('K4-ROOT-OWNER', 'The root has two possible runtime component owners.');
  const component = bundled ?? direct;
  return {
    component: record(component) ? component : null,
    form: bundled !== undefined ? ('bundled' as const) : ('unbundled' as const),
  };
}
function children(block: RecordValue): string[] {
  const values = typeof block.next === 'string' ? [block.next] : [];
  for (const input of Object.values(record(block.inputs) ? block.inputs : {})) {
    if (Array.isArray(input)) {
      for (const part of input.slice(1)) if (typeof part === 'string') values.push(part);
    } else if (record(input)) {
      if (typeof input.block === 'string') values.push(input.block);
      if (typeof input.shadow === 'string') values.push(input.shadow);
    }
  }
  return values;
}
export interface KamishibaiEmbeddedYamlRootSelection {
  readonly reference: SourceDocumentReference;
  readonly rootId: string;
  readonly form: 'bundled' | 'unbundled';
  readonly version: '4.0';
  readonly path?: string;
  readonly entryPath?: string;
}
/** Read an explicit valid entry selection; entryPath matching is checked separately. */
export function readKamishibaiEmbeddedYamlRootSelection(
  project: RecordValue,
  {allowLegacySingle = true}: {allowLegacySingle?: boolean} = {},
): KamishibaiEmbeddedYamlRootSelection | null {
  const selected = owner(project),
    graph =
      selected.component && Object.hasOwn(selected.component, 'sourceDocuments')
        ? readEmbeddedYamlSourceGraphRecord(selected.component.sourceDocuments)
        : null;
  const targets = Array.isArray(project.targets) ? project.targets.filter(record) : [];
  const roots = targets.flatMap((target) =>
    Object.entries(record(target.blocks) ? target.blocks : {})
      .filter(
        ([, block]) =>
          record(block) && typeof block.opcode === 'string' && rootOpcodes.has(block.opcode),
      )
      .map(([id, block]) => ({id, block: block as RecordValue, target})),
  );
  if (roots.length === 0) {
    if (graph || !allowLegacySingle)
      fail('K4-ROOT-MISSING', 'An explicit embedded YAML root is required.');
    return null;
  }
  if (roots.length !== 1) fail('K4-ROOT-DUPLICATE', 'Exactly one embedded YAML root is required.');
  const root = roots[0]!;
  if (!selected.component)
    fail('K4-ROOT-OWNER', 'The root has no owning Kamishibai runtime component.');
  if (
    root.target.isStage !== true ||
    targets.filter((target) => target.isStage === true).length !== 1
  )
    fail('K4-ROOT-TARGET', 'The embedded YAML root must be on the one Stage.');
  const expected =
    selected.form === 'bundled' ? dsl4BundledEmbeddedYamlRootOpcode : dsl4EmbeddedYamlRootOpcode;
  if (root.block.opcode !== expected)
    fail('K4-ROOT-OWNER', 'The root opcode does not match its runtime owner.');
  const reference = validateEmbeddedYamlRootMarker(root.block, {
    opcode: expected,
    target: root.target,
  });
  const version = readEmbeddedYamlRootVersion(root.block);
  if (version !== '4.0')
    fail('K4-ROOT-VERSION', 'The embedded YAML root VERSION must be the literal 4.0.');
  if (reference.providerId !== kamishibaiEmbeddedYamlProviderId)
    fail('K4-ROOT-OWNER', 'The root must reference a Kamishibai source document.');
  for (const target of targets)
    for (const [id, block] of Object.entries(record(target.blocks) ? target.blocks : {}))
      if (
        record(block) &&
        !(target === root.target && id === root.id) &&
        children(block).includes(root.id)
      )
        fail('K4-ROOT-CONNECTED', 'The embedded YAML root cannot be connected to another block.');
  if (graph) {
    const path = sourceGraphDocumentPath(graph, reference.documentId);
    return {
      reference,
      rootId: root.id,
      form: selected.form,
      version: '4.0',
      path,
      entryPath: graph.entryPath,
    };
  }
  const source = record(selected.component.source) ? selected.component.source : {};
  if (
    selected.component.compiled !== undefined ||
    source.mode !== 'embedded' ||
    typeof source.text !== 'string'
  )
    fail('K4-ROOT-SOURCE', 'The root requires an editable embedded source document.');
  if (reference.documentId !== kamishibaiEmbeddedYamlDocumentId)
    fail('K4-ROOT-DOCUMENT', 'The single-file root must reference its story document.');
  validateEmbeddedYamlFilename(
    typeof source.displayName === 'string' ? source.displayName : 'story.k4.yml',
  );
  return {reference, rootId: root.id, form: selected.form, version: '4.0'};
}
/** Validate the explicit entry and all document references without choosing a fallback root. */
export function validateKamishibaiEmbeddedYamlRoot(
  project: RecordValue,
  options: {allowLegacySingle?: boolean; allowEntryMismatch?: boolean} = {},
): KamishibaiEmbeddedYamlRootSelection | null {
  const selected = owner(project),
    graph =
      selected.component && Object.hasOwn(selected.component, 'sourceDocuments')
        ? readEmbeddedYamlSourceGraphRecord(selected.component.sourceDocuments)
        : null;
  const result = readKamishibaiEmbeddedYamlRootSelection(project, options);
  if (!options.allowEntryMismatch && result?.path !== undefined && result.path !== result.entryPath)
    fail(
      'K4-ROOT-ENTRY-MISMATCH',
      'The selected root file differs from the source graph entry. Explicit entry synchronization is required.',
    );
  const namedDocuments = new Map<string, number>();
  for (const target of Array.isArray(project.targets) ? project.targets : []) {
    if (!record(target) || !record(target.blocks)) continue;
    for (const block of Object.values(target.blocks)) {
      if (!record(block) || typeof block.opcode !== 'string' || !fileOpcodes.has(block.opcode))
        continue;
      const reference = readReference(block, {blocks: target.blocks});
      if (reference.providerId !== kamishibaiEmbeddedYamlProviderId) continue;
      const expectedNormal =
        selected.form === 'bundled' ? dsl4BundledEmbeddedYamlHatOpcode : dsl4EmbeddedYamlHatOpcode;
      const isNormal =
        block.opcode === dsl4EmbeddedYamlHatOpcode ||
        block.opcode === dsl4BundledEmbeddedYamlHatOpcode;
      if (result && isNormal && block.opcode !== expectedNormal)
        fail('K4-DOCUMENT-OWNER', 'The document hat opcode does not match its runtime owner.');
      if (isNormal)
        namedDocuments.set(
          reference.documentId,
          (namedDocuments.get(reference.documentId) ?? 0) + 1,
        );
      if (graph) sourceGraphDocumentPath(graph, reference.documentId);
      else if (reference.documentId !== kamishibaiEmbeddedYamlDocumentId)
        fail('K4-DOCUMENT-UNKNOWN', 'The document hat references an unknown single-file document.');
    }
  }
  if (result) {
    if (namedDocuments.get(result.reference.documentId) !== 1)
      fail(
        'K4-ROOT-DOCUMENT',
        'The root must name exactly one ordinary embedded YAML document hat.',
      );
    if ([...namedDocuments.values()].some((count) => count > 1))
      fail(
        'K4-DOCUMENT-DUPLICATE',
        'Ordinary embedded YAML document hats must name distinct files.',
      );
  }
  return result;
}
