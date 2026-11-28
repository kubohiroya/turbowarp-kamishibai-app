import {isMap, parseAllDocuments} from 'yaml';

/**
 * Whether an entry source declares `include`, which decides if it is read as a Source Graph.
 *
 * Include needs no opt-in: a source that names other sources is composed with them, and a source
 * that does not is read on its own exactly as before, so its packaged text stays the authored text.
 * A source this cannot read as one YAML mapping is left to the single-source frontend, which owns
 * the diagnostic for it.
 */
export function dsl4SourceDeclaresIncludes(source: string): boolean {
  try {
    const documents = parseAllDocuments(source, {prettyErrors: false, version: '1.2'});
    const document = documents[0];
    if (documents.length !== 1 || !document || document.errors.length > 0) return false;
    return isMap(document.contents) && document.contents.has('include');
  } catch {
    return false;
  }
}
