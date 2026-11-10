import {createDsl4NarrativeRowsEditor} from './narrative-row-editor.js';
import {installDsl4SectionAppearance} from './block-source-section-appearance.js';
import {Dsl4BlockSourceError, dsl4BlockAuthoringExtensionId} from './block-source-shared.js';
import {
  createDsl4BlockAuthoringInfo,
  dsl4BlockAuthoringDefaultFeatureFlags,
} from './structured-block-source-codec.js';
import {dsl4PackageMetadata} from './runtime-provenance.js';

/** Compatibility surface: pure codecs never import the editor extension factory below. */
export * from './structured-block-source-codec.js';

function json(value: unknown): string {
  const result = JSON.stringify(value);
  if (result === undefined)
    throw new Dsl4BlockSourceError(
      'K4-BLOCK-SOURCE-GRAPH-001',
      'Source value cannot be represented as JSON',
      {},
    );
  return result;
}

/**
 * The TurboWarp-style header every embedded copy of the authoring extension starts with.
 *
 * Security dialogs read only this leading comment block, never getInfo(), so its Name and banner
 * follow the extension's own getInfo() and the package lines follow the owning release. The
 * extension reads `Scratch.gui` and the block workspace, so it asks for an unsandboxed host.
 */
export function formatDsl4BlockAuthoringExtensionHeader(
  info: {
    readonly id: string;
    readonly name: string;
    readonly blockIconURI: string;
  } = createDsl4BlockAuthoringInfo(),
): string {
  const {name, version, author, authorURL, repository, homepage} = dsl4PackageMetadata;
  return [
    `// Name: ${info.name}`,
    `// ID: ${info.id}`,
    '// Description: Inert editor-only declarations for Kamishibai block scripts and embedded YAML views.',
    '// Description[ja]: 紙芝居のブロックスクリプトと組込YAMLの表示に使う、実行しない宣言用の機能拡張です。',
    `// By: ${author}`,
    `// Author URL: ${authorURL}`,
    `// Version: ${version}`,
    `// Repository: ${repository}`,
    `// Docs URL: ${homepage}`,
    `// Banner: ${info.blockIconURI}`,
    `// Package: ${name}`,
    '// License: MPL-2.0',
    '// Unsandboxed: required',
    '',
  ].join('\n');
}

/** Small, inert editor-only extension, included in each authored SB3 for older runtime bases too. */
export function createDsl4BlockAuthoringExtensionSource(
  editorDefinitions: readonly unknown[] = [],
  {
    sourceSections = dsl4BlockAuthoringDefaultFeatureFlags.sourceSections,
    narrativeControlEnabled = false,
    referenceViews = true,
  }: {sourceSections?: boolean; narrativeControlEnabled?: boolean; referenceViews?: boolean} = {},
): string {
  const info = createDsl4BlockAuthoringInfo({
    sourceSections,
    narrativeControlEnabled,
    referenceViews,
  });
  const definitions = info.blocks;
  return (
    formatDsl4BlockAuthoringExtensionHeader(info) +
    `// SPDX-License-Identifier: MPL-2.0\n` +
    `// Kamishibai block script declarations are inert; the builder reads their block graph.\n` +
    `(function(Scratch){"use strict";const extension={getInfo(){return ${json(info)};}};` +
    `${definitions.map(({opcode}) => `extension.${opcode}=function(){};`).join('')}` +
    `Scratch.extensions.register(extension);` +
    `const cleanup=[];let disposed=false;` +
    `extension.dispose=function(){disposed=true;for(const remove of cleanup.splice(0))remove();};` +
    `(${installDsl4SectionAppearance.toString()})(Scratch,()=>disposed).then(remove=>{` +
    `if(remove){if(disposed)remove();else cleanup.push(remove);}}).catch(error=>` +
    `console.warn("Kamishibai section appearance could not be installed.",error));` +
    `const api=Scratch.gui?.blockEditors;` +
    `if(api?.apiVersion===1&&typeof api.registerSchema==="function"){` +
    `const remove=[];try{for(const definition of ${json(editorDefinitions)}){` +
    `if(${JSON.stringify(narrativeControlEnabled)}&&definition.editorId==="narrative-condition")continue;` +
    `if(${JSON.stringify(narrativeControlEnabled)}&&typeof api.register==="function"&&definition.editorId==="narrative-rows")continue;` +
    `remove.push(api.registerSchema(definition));}` +
    `if(${JSON.stringify(narrativeControlEnabled)}&&typeof api.register==="function")` +
    `remove.push(api.register((${createDsl4NarrativeRowsEditor.toString()})(${json(dsl4BlockAuthoringExtensionId)})));` +
    `cleanup.push(...remove);` +
    `}catch(error){for(const unregister of remove)unregister();` +
    `console.warn("Kamishibai definition forms could not be registered.",error);}}` +
    `})(Scratch);\n`
  );
}
