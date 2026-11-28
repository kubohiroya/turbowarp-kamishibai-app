import type {SourceDocumentReference} from '@kubohiroya/turbowarp-document-data/composition';
export const kamishibaiEmbeddedYamlProviderId = 'kamishibai-dsl4';
export const kamishibaiEmbeddedYamlDocumentId = 'story';
export const kamishibaiEmbeddedYamlReference: Readonly<SourceDocumentReference> = Object.freeze({
  providerId: kamishibaiEmbeddedYamlProviderId,
  documentId: kamishibaiEmbeddedYamlDocumentId,
});
export const dsl4EmbeddedYamlHatOperation = 'embeddedYaml';
export const dsl4EmbeddedYamlHatOpcode = 'kubohiroyakamishibairuntime4_embeddedYaml';
export const dsl4BundledEmbeddedYamlHatOpcode =
  'kubohiroyakamishibai4_kubohiroyakamishibairuntime4__embeddedYaml';

export const dsl4EmbeddedYamlConfigHatOperation = 'embeddedYamlConfig';
export const dsl4EmbeddedYamlConfigHatOpcode = 'kubohiroyakamishibairuntime4_embeddedYamlConfig';
export const dsl4BundledEmbeddedYamlConfigHatOpcode =
  'kubohiroyakamishibai4_kubohiroyakamishibairuntime4__embeddedYamlConfig';

export const dsl4EmbeddedYamlRootOperation = 'embeddedYamlRoot';
export const dsl4EmbeddedYamlRootOpcode = 'kubohiroyakamishibairuntime4_embeddedYamlRoot';
export const dsl4BundledEmbeddedYamlRootOpcode =
  'kubohiroyakamishibai4_kubohiroyakamishibairuntime4__embeddedYamlRoot';

/**
 * Editor-only relation declarations (`scriptRelations` on a getInfo() block). TurboWarp ignores the key;
 * the Plus Editor draws a reference arrow from each referring block to the story hat with the same
 * DOCUMENT value. The channel is a name, not an opcode, so it holds in bundled and unbundled forms.
 */
export const dsl4EmbeddedYamlRelationChannel = 'kubohiroya.kamishibai4.embeddedYamlDocument';
export const dsl4EmbeddedYamlDocumentRelationTarget = Object.freeze({
  targets: Object.freeze([
    Object.freeze({channel: dsl4EmbeddedYamlRelationChannel, argument: 'DOCUMENT'}),
  ]),
});
export const dsl4EmbeddedYamlDocumentRelationReference = Object.freeze({
  references: Object.freeze([
    Object.freeze({channel: dsl4EmbeddedYamlRelationChannel, argument: 'DOCUMENT'}),
  ]),
});
