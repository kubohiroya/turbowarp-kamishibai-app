import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

import {createDsl4ProductionSourceFrontend} from '../../src/dsl4/production-source-frontend.js';
import {createDsl4SourceFrontend} from '../../src/dsl4/source-frontend.js';

export const dsl4TestProjectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const dsl4TestSchema = JSON.parse(
  await readFile(new URL('../../schema/dsl-4.schema.json', import.meta.url), 'utf8'),
);

/** The options each frontend factory takes, read off the factory rather than restated here. */
type SourceFrontendOptions = Parameters<typeof createDsl4SourceFrontend>[1];
type ProductionSourceFrontendOptions = Parameters<typeof createDsl4ProductionSourceFrontend>[1];

export function createDsl4TestSourceFrontend(options?: SourceFrontendOptions) {
  return createDsl4SourceFrontend(dsl4TestSchema, options);
}

export function createDsl4TestProductionSourceFrontend(options?: ProductionSourceFrontendOptions) {
  return createDsl4ProductionSourceFrontend(dsl4TestSchema, options);
}

export const dsl4TestSourceFrontend = createDsl4TestSourceFrontend();
export const dsl4TestProductionSourceFrontend = createDsl4TestProductionSourceFrontend();
