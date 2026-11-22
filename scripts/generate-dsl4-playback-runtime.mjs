import {generateEmbeddedYamlAuthoringRuntime} from './generate-embedded-yaml-authoring-runtime.mjs';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {createDsl4RuntimeBundleSource} from './sb3/dsl4-downloadable-release.ts';
import {
  createDsl4TeachableMachineOfflineRuntimeSource,
  readDsl4TeachableMachineRuntimeSite,
} from './sb3/teachable-machine-runtime.ts';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
/** @type {[string, 'authoring' | 'playback', boolean][]} */
const variants = [
  ['dsl4-playback-runtime-extension.js', 'playback', true],
  ['dsl4-narrative-playback-runtime-extension.js', 'playback', true],
  ['dsl4-narrative-authoring-runtime-extension.js', 'authoring', true],
];
await generateEmbeddedYamlAuthoringRuntime();
for (const [filename, profile, narrativeControlEnabled] of variants) {
  const outputPath = path.join(repositoryRoot, 'src/builder/generated', filename);
  const source = await createDsl4RuntimeBundleSource({profile, narrativeControlEnabled});
  await mkdir(path.dirname(outputPath), {recursive: true});
  await writeFile(outputPath, source);
}

// A work built for a network-free venue carries the whole Teachable Machine runtime instead of
// loading it from the Kamishibai site.
const {version} = await readDsl4TeachableMachineRuntimeSite();
await writeFile(
  path.join(repositoryRoot, 'src/builder/generated/dsl4-teachable-machine-offline-runtime.json'),
  `${JSON.stringify({
    formatVersion: 1,
    version,
    source: await createDsl4TeachableMachineOfflineRuntimeSource(),
  })}\n`,
);
