import type {Dsl4SourceFrontend} from './source-frontend.js';

/**
 * A source frontend that is built the first time something parses with it.
 *
 * Building the production frontend compiles the DSL 4.0 JSON Schema, which takes on the order of
 * a hundred milliseconds. The runtime extension needs a frontend from its constructor, but a
 * title screen, a compiled story or a project without a story never parses source, so they no
 * longer pay for it. A failed build is not remembered: the next parse tries again and reports the
 * same error to its own caller.
 */
export function createLazyDsl4SourceFrontend(
  createFrontend: () => Dsl4SourceFrontend,
): Dsl4SourceFrontend {
  if (typeof createFrontend !== 'function') {
    throw new TypeError('createFrontend must be a function');
  }
  let frontend: Dsl4SourceFrontend | null = null;
  return Object.freeze({
    parse(source: string, options?: {sourceId?: string; project?: unknown}) {
      if (!frontend) {
        const created = createFrontend();
        if (!created || typeof created.parse !== 'function') {
          throw new TypeError('createFrontend must return a source frontend');
        }
        frontend = created;
      }
      return options === undefined ? frontend.parse(source) : frontend.parse(source, options);
    },
  });
}
