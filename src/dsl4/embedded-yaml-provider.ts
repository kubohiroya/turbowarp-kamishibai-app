/**
 * The public `./embedded-yaml` entry: the Kamishibai embedded YAML provider with the editor
 * schema attached by default.
 *
 * The provider itself lives in `embedded-yaml-provider-core.ts` and takes the schema as an
 * option, so the playback runtime can register it without bundling the 150 KB schema. Callers of
 * this module keep the behavior they had: pass `editorSchema: null` to leave the schema out.
 */
import editorSchema from '../../schema/dsl-4-editor.schema.json' with {type: 'json'};
import {
  createKamishibaiEmbeddedYamlProvider as createProvider,
  registerKamishibaiEmbeddedYamlProvider as registerProvider,
  type KamishibaiEmbeddedYamlProviderOptions,
} from './embedded-yaml-provider-core.js';

export {buildKamishibaiDocumentSourceProject} from './embedded-yaml-provider-core.js';
export type {KamishibaiEmbeddedYamlProviderOptions};

const withEditorSchema = (
  options: KamishibaiEmbeddedYamlProviderOptions,
): KamishibaiEmbeddedYamlProviderOptions =>
  options.editorSchema === undefined ? {...options, editorSchema} : options;

export function createKamishibaiEmbeddedYamlProvider(
  vmInput: unknown,
  options: KamishibaiEmbeddedYamlProviderOptions = {},
) {
  return createProvider(vmInput, withEditorSchema(options));
}

export function registerKamishibaiEmbeddedYamlProvider(
  vmInput: unknown,
  options: KamishibaiEmbeddedYamlProviderOptions = {},
) {
  return registerProvider(vmInput, withEditorSchema(options));
}
