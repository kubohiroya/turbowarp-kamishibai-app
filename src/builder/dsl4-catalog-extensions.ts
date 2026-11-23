import {
  createDsl4BlockAuthoringEditorDefinitions,
  createDsl4CoreActionBlockEditorDefinitions,
} from './dsl4-block-authoring-editors.js';
import {
  createDsl4BlockAuthoringExtensionSource,
  dsl4BlockAuthoringExtensionId,
} from '../dsl4/structured-block-source.js';

/**
 * The Block Script extension an authored SB3 carries, for the project's opcode form and features.
 *
 * Every writer of an authored project goes through this one function, so the bytes a project
 * carries are always one of `dsl4CatalogBlockAuthoringVariants()` below. That is what lets the
 * TurboWarp Plus catalog vouch for the code by its SHA-256.
 */
export function createDsl4BlockAuthoringProjectExtensionSource(
  form: 'runtime' | 'bundle',
  {
    sourceSections,
    narrativeControlEnabled,
  }: {sourceSections: boolean; narrativeControlEnabled: boolean},
): string {
  return createDsl4BlockAuthoringExtensionSource(
    [
      ...createDsl4BlockAuthoringEditorDefinitions(dsl4BlockAuthoringExtensionId, {
        narrativeControlEnabled,
      }),
      ...createDsl4CoreActionBlockEditorDefinitions(form, {narrativeControlEnabled}),
    ],
    {sourceSections, narrativeControlEnabled},
  );
}

/**
 * The runtime an authored SB3 carries: the base runtime, with the retired source declarations
 * removed from its public registration.
 *
 * The header stays first and unchanged, so a security dialog still reads the runtime's own name,
 * creator and picture. The wrapper is literal text, so the result depends only on the runtime.
 */
export function wrapDsl4AuthoredRuntimeSource(source: string): string {
  const header = source.match(/^(?:\s*\/\/[^\r\n]*\r?\n)*/u)?.[0] ?? '';
  return `${header}(function(Scratch){
    const scoped = Object.create(Scratch);
    const extensions = Object.create(Scratch.extensions);
    Object.defineProperty(extensions, 'register', {value(extension){
      const getInfo = extension.getInfo.bind(extension);
      extension.getInfo = function(){
        const info = getInfo();
        return {...info, blocks: info.blocks.filter(block =>
          !block || typeof block.opcode !== 'string' ||
          !/^(?:kubohiroyakamishibairuntime4__)?(?:whenDsl4Source|dsl4SourceFromYamlJson)$/.test(block.opcode))};
      };
      return Scratch.extensions.register(extension);
    }});
    Object.defineProperty(scoped, 'extensions', {configurable: true, value: extensions});
    (function(Scratch){\n${source.slice(header.length)}\n})(scoped);
  })(Scratch);`;
}

/** The fixed Block Script an embedded-YAML project view installs; see generate-embedded-yaml-authoring-runtime. */
export function createDsl4EmbeddedYamlAuthoringExtensionSource(): string {
  return createDsl4BlockAuthoringExtensionSource([], {
    narrativeControlEnabled: true,
    referenceViews: true,
  });
}

export interface Dsl4CatalogArtifact {
  /** Path inside the published package. */
  readonly path: string;
  readonly source: string;
}

/** Where the package publishes the Block Script variants, relative to the package root. */
export const dsl4CatalogBlockAuthoringDirectory = `dist/extensions/${dsl4BlockAuthoringExtensionId}`;

/**
 * Every Block Script the package can write into a project, one file each.
 *
 * The first is the variant a new project gets with the standard features; the rest differ only in
 * the opcode form of the project's base and the features it was authored with.
 */
export function dsl4CatalogBlockAuthoringVariants(): Dsl4CatalogArtifact[] {
  const variants: Dsl4CatalogArtifact[] = [];
  for (const narrativeControlEnabled of [true, false])
    for (const form of ['bundle', 'runtime'] as const)
      for (const sourceSections of [false, true])
        variants.push({
          path: `${dsl4CatalogBlockAuthoringDirectory}/${form}${narrativeControlEnabled ? '-narrative' : ''}${sourceSections ? '-sections' : ''}.js`,
          source: createDsl4BlockAuthoringProjectExtensionSource(form, {
            sourceSections,
            narrativeControlEnabled,
          }),
        });
  variants.push({
    path: `${dsl4CatalogBlockAuthoringDirectory}/embedded-yaml.js`,
    source: createDsl4EmbeddedYamlAuthoringExtensionSource(),
  });
  return variants;
}

/**
 * The runtime a work authored with the standard features carries, written by the library build
 * from the shipped narrative authoring runtime.
 */
export const dsl4CatalogAuthoredRuntimePath = 'dist/extensions/kubohiroyakamishibai4/authored.js';

/**
 * The runtime bundles the builder embeds, as the package already ships them.
 *
 * They are copied into `dist/builder/generated/` by the library build; the catalog names them
 * there rather than publishing a second copy.
 */
export const dsl4CatalogRuntimeArtifactPaths = Object.freeze([
  'dist/builder/generated/dsl4-narrative-authoring-runtime-extension.js',
  'dist/builder/generated/dsl4-playback-runtime-extension.js',
  'dist/builder/generated/dsl4-narrative-playback-runtime-extension.js',
]);
