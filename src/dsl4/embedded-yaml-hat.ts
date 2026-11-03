import {validateKamishibaiEmbeddedYamlRoot} from './embedded-yaml-root-validation.js';
import {
  readEmbeddedYamlSourceGraphRecord,
  sourceGraphDocumentId,
} from './embedded-yaml-source-graph.js';
import {
  encodeReference,
} from '@kubohiroya/turbowarp-document-source';
import {
  createEmbeddedYamlHatDefinition,
  createEmbeddedYamlRootHatDefinition,
  installEmbeddedYamlRootMarker,
  embeddedYamlFileIconURI,
  installEmbeddedYamlMarker,
  removeEmbeddedYamlMarkers,
} from '@kubohiroya/turbowarp-document-data/document-source';
import {
  dsl4ConfigBlockSourceHatOpcode,
  dsl4LabeledBlockSourceHatOpcode,
} from './block-source-shared.js';
import {
  dsl4EmbeddedYamlHatOperation,
  dsl4EmbeddedYamlHatOpcode,
  dsl4BundledEmbeddedYamlHatOpcode,
  kamishibaiEmbeddedYamlReference,
  dsl4EmbeddedYamlConfigHatOperation,
  dsl4EmbeddedYamlConfigHatOpcode,
  dsl4BundledEmbeddedYamlConfigHatOpcode,
  dsl4EmbeddedYamlRootOperation,
  dsl4EmbeddedYamlRootOpcode,
  dsl4BundledEmbeddedYamlRootOpcode,
} from './embedded-yaml-identity.js';
export {
  dsl4EmbeddedYamlHatOperation,
  dsl4EmbeddedYamlHatOpcode,
  dsl4BundledEmbeddedYamlHatOpcode,
} from './embedded-yaml-identity.js';
export const dsl4EmbeddedYamlHatIconURI: string = embeddedYamlFileIconURI;

/** This declaration references the canonical App document, never a copy of its text. */
export function createDsl4EmbeddedYamlHatDefinition(
  BlockType: Readonly<Record<string, string>>,
): ReturnType<typeof createEmbeddedYamlHatDefinition> {
  return createEmbeddedYamlHatDefinition({
    BlockType,
    operation: dsl4EmbeddedYamlHatOperation,
    menuName: 'embeddedYamlDocuments',
    defaultReference: kamishibaiEmbeddedYamlReference,
  });
}

/** A versioned entry reference whose registered ScratchBlocks shape has no connections. */
export function createDsl4EmbeddedYamlRootDefinition(BlockType: Readonly<Record<string, string>>) {
  return createEmbeddedYamlRootHatDefinition({
    BlockType,
    operation: dsl4EmbeddedYamlRootOperation,
    menuName: 'embeddedYamlDocuments',
    defaultReference: kamishibaiEmbeddedYamlReference,
    defaultVersion: '4.0',
  });
}

/** A derived configuration view references the same canonical document, without copying it. */
export function createDsl4EmbeddedYamlConfigHatDefinition(
  BlockType: Readonly<Record<string, string>>,
) {
  return Object.freeze({
    ...createEmbeddedYamlHatDefinition({
      BlockType,
      operation: dsl4EmbeddedYamlConfigHatOperation,
      menuName: 'embeddedYamlDocuments',
      defaultReference: kamishibaiEmbeddedYamlReference,
    }),
    text: 'embedded YAML configuration [DOCUMENT]',
    hideFromPalette: true,
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const markerOpcodes = new Set([dsl4EmbeddedYamlHatOpcode, dsl4BundledEmbeddedYamlHatOpcode]);

/** Add one source navigation marker to the Stage of an already cloned source project. */
export function installDsl4EmbeddedYamlHat(
  project: Record<string, unknown>,
  {channel}: {channel: 'bundled' | 'unbundled'},
): string | null {
  if (channel !== 'bundled' && channel !== 'unbundled') {
    throw new TypeError('Embedded YAML hat requires an explicit source channel');
  }
  const targets = Array.isArray(project.targets) ? project.targets : [];
  const storage = isRecord(project.extensionStorage) ? project.extensionStorage : {};
  const bundle = isRecord(storage.kubohiroyakamishibai4) ? storage.kubohiroyakamishibai4 : {};
  const components = isRecord(bundle.components) ? bundle.components : {};
  const component =
    channel === 'bundled'
      ? components.kubohiroyakamishibairuntime4
      : storage.kubohiroyakamishibairuntime4;
  if (!isRecord(component) || component.compiled !== undefined) return null;
  const application = isRecord(component.application) ? component.application : {};
  const source = isRecord(component.source) ? component.source : {};
  if (
    application.mode !== 'story' ||
    source.mode !== 'embedded' ||
    typeof source.text !== 'string'
  ) {
    return null;
  }
  const hasBlockSource = targets.some(
    (target) =>
      isRecord(target) &&
      isRecord(target.blocks) &&
      Object.values(target.blocks).some(
        (block) =>
          isRecord(block) &&
          (block.opcode === dsl4LabeledBlockSourceHatOpcode ||
            block.opcode === dsl4ConfigBlockSourceHatOpcode ||
            (typeof block.opcode === 'string' && block.opcode.endsWith('whenDsl4Source'))),
      ),
  );
  if (hasBlockSource) return null;
  const opcode =
    channel === 'bundled' ? dsl4BundledEmbeddedYamlHatOpcode : dsl4EmbeddedYamlHatOpcode;
  // Upgrade only the App's former marker, preserving its position and attached scripts.
  for (const target of targets) {
    if (!isRecord(target) || target.isStage !== true || !isRecord(target.blocks)) continue;
    for (const [id, block] of Object.entries(target.blocks)) {
      if (!isRecord(block) || typeof block.opcode !== 'string' || !markerOpcodes.has(block.opcode))
        continue;
      block.opcode = opcode;
      block.fields = {DOCUMENT: [encodeReference(kamishibaiEmbeddedYamlReference), null]};
      block.inputs = {};
      return id;
    }
  }
  return installEmbeddedYamlMarker(project, {opcode, reference: kamishibaiEmbeddedYamlReference});
}

/** Drop only the App's known document markers when source is omitted. */
export function removeDsl4EmbeddedYamlHats(project: Record<string, unknown>): number {
  return removeEmbeddedYamlMarkers(project, {
    opcodes: [
      ...markerOpcodes,
      dsl4EmbeddedYamlRootOpcode,
      dsl4BundledEmbeddedYamlRootOpcode,
      dsl4EmbeddedYamlConfigHatOpcode,
      dsl4BundledEmbeddedYamlConfigHatOpcode,
    ],
  });
}

/** Explicit opt-in only; ordinary single-file marker installation remains unchanged. */
export function installDsl4EmbeddedYamlRoot(
  project: Record<string, unknown>,
  {channel}: {channel: 'bundled' | 'unbundled'},
): string | null {
  if (channel !== 'bundled' && channel !== 'unbundled')
    throw new TypeError('The root requires an explicit source channel.');
  const storage = isRecord(project.extensionStorage) ? project.extensionStorage : {};
  const bundle = isRecord(storage.kubohiroyakamishibai4) ? storage.kubohiroyakamishibai4 : {};
  const components = isRecord(bundle.components) ? bundle.components : {};
  const component =
    channel === 'bundled'
      ? components.kubohiroyakamishibairuntime4
      : storage.kubohiroyakamishibairuntime4;
  if (
    !isRecord(component) ||
    component.compiled !== undefined ||
    !isRecord(component.application) ||
    component.application.mode !== 'story' ||
    !isRecord(component.source) ||
    component.source.mode !== 'embedded' ||
    typeof component.source.text !== 'string'
  )
    return null;
  const targets = Array.isArray(project.targets) ? project.targets : [];
  const hasRoot = targets.some(
    (target) =>
      isRecord(target) &&
      isRecord(target.blocks) &&
      Object.values(target.blocks).some(
        (block) =>
          isRecord(block) &&
          [dsl4EmbeddedYamlRootOpcode, dsl4BundledEmbeddedYamlRootOpcode].includes(
            String(block.opcode),
          ),
      ),
  );
  if (hasRoot)
    return validateKamishibaiEmbeddedYamlRoot(project, {allowLegacySingle: false})!.rootId;
  const graph = Object.hasOwn(component, 'sourceDocuments')
    ? readEmbeddedYamlSourceGraphRecord(component.sourceDocuments)
    : null;
  const reference = graph
    ? {
        providerId: kamishibaiEmbeddedYamlReference.providerId,
        documentId: sourceGraphDocumentId(graph, graph.entryPath),
      }
    : kamishibaiEmbeddedYamlReference;
  const topYs = targets.flatMap((target) =>
    isRecord(target) && target.isStage === true && isRecord(target.blocks)
      ? Object.values(target.blocks)
          .filter(isRecord)
          .filter((block) => block.topLevel === true && typeof block.y === 'number')
          .map((block) => block.y as number)
      : [],
  );
  const id = installEmbeddedYamlRootMarker(project, {
    opcode: channel === 'bundled' ? dsl4BundledEmbeddedYamlRootOpcode : dsl4EmbeddedYamlRootOpcode,
    reference,
    version: '4.0',
    x: 32,
    y: Math.min(32, ...topYs) - 140,
  });
  validateKamishibaiEmbeddedYamlRoot(project, {allowLegacySingle: false});
  return id;
}
