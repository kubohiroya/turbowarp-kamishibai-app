import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {tscPath} from './tsc.ts';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const outputDirectory = path.join(projectRoot, 'dist');

/**
 * Files that ship beside the compiled modules but never enter the TypeScript program: they are
 * generated bundles read at runtime through `new URL(..., import.meta.url)`.
 */
const copiedArtifacts = [
  'builder/generated/dsl4-playback-runtime-extension.js',
  'builder/generated/dsl4-narrative-playback-runtime-extension.js',
  'builder/generated/dsl4-narrative-authoring-runtime-extension.js',
  'builder/generated/dsl4-teachable-machine-offline-runtime.json',
];

function run(command: string, arguments_: readonly string[]) {
  const result = spawnSync(command, arguments_, {cwd: projectRoot, stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${command} terminated by ${result.signal}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

await rm(outputDirectory, {recursive: true, force: true});
run(process.execPath, [tscPath, '--project', 'tsconfig.build.json']);

for (const artifact of copiedArtifacts) {
  const source = path.join(projectRoot, 'src', artifact);
  const target = path.join(outputDirectory, artifact);
  await mkdir(path.dirname(target), {recursive: true});
  await cp(source, target);
}

// Every Block Script variant an authored SB3 can carry, so the TurboWarp Plus catalog can list
// their exact bytes (package.json `turbowarpExtension.catalog`).
const {
  dsl4CatalogAuthoredRuntimePath,
  dsl4CatalogBlockAuthoringVariants,
  wrapDsl4AuthoredRuntimeSource,
} = (await import(
  pathToFileURL(path.join(outputDirectory, 'builder/dsl4-catalog-extensions.js')).href
)) as typeof import('../src/builder/dsl4-catalog-extensions.ts');
const variants = [
  ...dsl4CatalogBlockAuthoringVariants(),
  {
    path: dsl4CatalogAuthoredRuntimePath,
    source: wrapDsl4AuthoredRuntimeSource(
      await readFile(
        path.join(
          outputDirectory,
          'builder/generated/dsl4-narrative-authoring-runtime-extension.js',
        ),
        'utf8',
      ),
    ),
  },
];
// The Block Script embeds compiled function text, so only this build's output is comparable with
// the committed embedded-YAML artifact that browser hosts install. A stale one would be unlisted.
const {embeddedYamlAuthoringRuntimeURL} = (await import(
  pathToFileURL(path.join(outputDirectory, 'dsl4/generated/embedded-yaml-authoring-runtime.js'))
    .href
)) as typeof import('../src/dsl4/generated/embedded-yaml-authoring-runtime.js');
const embeddedYaml = Buffer.from(
  embeddedYamlAuthoringRuntimeURL.split(',')[1]!,
  'base64',
).toString();
if (!variants.some(({source}) => source === embeddedYaml)) {
  throw new Error(
    'src/dsl4/generated/embedded-yaml-authoring-runtime.js is stale; run node scripts/generate-embedded-yaml-authoring-runtime.mjs',
  );
}
for (const {path: artifact, source} of variants) {
  const target = path.join(projectRoot, artifact);
  await mkdir(path.dirname(target), {recursive: true});
  await writeFile(target, source);
}

console.log(
  `Built the package in dist/ (${copiedArtifacts.length} copied artifact(s), ${variants.length} catalog variant(s)).`,
);
