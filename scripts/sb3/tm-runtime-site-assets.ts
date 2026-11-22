import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  dsl4TeachableMachineSiteFiles,
  readDsl4TeachableMachineRuntimeSite,
  readDsl4TeachableMachineSiteFile,
} from './teachable-machine-runtime.ts';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const publishedRuntimesPath = path.join(
  projectRoot,
  'test/fixtures/dsl4/tm-runtime-published.json',
);
const tmPackageName = '@kubohiroya/turbowarp-teachable-machine';

type PublishedFile = {path: string; sha256: string; size: number};
type PublishedRuntime = {version: string; since: string; files: PublishedFile[]};

export async function readPublishedTMRuntimes(): Promise<PublishedRuntime[]> {
  const record = JSON.parse(await readFile(publishedRuntimesPath, 'utf8'));
  if (record?.formatVersion !== 1 || !Array.isArray(record.runtimes)) {
    throw new Error('tm-runtime-published.json must be formatVersion 1 with runtimes');
  }
  return record.runtimes;
}

/**
 * The package a published runtime version is read from: the installed Teachable Machine package
 * for the version this build pins, or an npm alias `tm-runtime-<version>` for an earlier one.
 */
function packageSpecifierFor(version: string, currentVersion: string) {
  return version === currentVersion ? tmPackageName : `tm-runtime-${version}`;
}

/**
 * Write each recorded Teachable Machine runtime to `<site>/teachable-machine/<version>/`.
 *
 * Works built since lazy loading load `runtime.js` (and, from beside it, the WebGPU and WASM
 * backends) from these paths, and every Pages deployment replaces the whole site. So the site keeps
 * every version an earlier release recorded, byte for byte: a new Teachable Machine version is
 * added beside the old ones, never instead of them, and a version this build pins must be recorded.
 */
export async function writeTMRuntimeSiteAssets(siteRoot: string) {
  const {version: currentVersion} = await readDsl4TeachableMachineRuntimeSite();
  const published = await readPublishedTMRuntimes();
  if (!published.some(({version}) => version === currentVersion)) {
    throw new Error(
      `Record Teachable Machine runtime ${currentVersion} in tm-runtime-published.json`,
    );
  }
  const written = [];
  for (const runtime of published) {
    const specifier = packageSpecifierFor(runtime.version, currentVersion);
    const recorded = new Map(runtime.files.map((file) => [file.path, file]));
    if (
      recorded.size !== dsl4TeachableMachineSiteFiles.length ||
      dsl4TeachableMachineSiteFiles.some((file) => !recorded.has(file))
    ) {
      throw new Error(`Teachable Machine runtime ${runtime.version} must record every site file`);
    }
    const directory = path.join(siteRoot, 'teachable-machine', runtime.version);
    for (const file of dsl4TeachableMachineSiteFiles) {
      let bytes: Buffer;
      try {
        bytes = await readDsl4TeachableMachineSiteFile(file, specifier);
      } catch (error) {
        throw new Error(
          `Teachable Machine runtime ${runtime.version} is published but ${specifier} is not installed; ` +
            `add "${specifier}": "npm:${tmPackageName}@${runtime.version}" to devDependencies`,
          {cause: error},
        );
      }
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const expected = recorded.get(file)!;
      if (sha256 !== expected.sha256 || bytes.byteLength !== expected.size) {
        throw new Error(
          `Teachable Machine runtime ${runtime.version} ${file} no longer matches its recorded digest`,
        );
      }
      await mkdir(path.dirname(path.join(directory, file)), {recursive: true});
      await writeFile(path.join(directory, file), bytes);
      written.push({file: `teachable-machine/${runtime.version}/${file}`, size: bytes.byteLength});
    }
  }
  return written;
}
