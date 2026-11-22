import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {deflateSync} from 'fflate';

const scalarWasmFilename = 'tfjs-backend-wasm.wasm';
const wasmFilenames = [
  scalarWasmFilename,
  'tfjs-backend-wasm-simd.wasm',
  'tfjs-backend-wasm-threaded-simd.wasm',
] as const;
const wasmDataUrlPrefix = 'data:application/octet-stream;base64,';

function replacePinnedSource(
  source: string,
  pattern: RegExp,
  replacement: string,
  description: string,
) {
  assert.equal([...source.matchAll(pattern)].length, 1, `Unexpected upstream ${description}`);
  return source.replace(pattern, replacement);
}

async function compactEmbeddedWasm(source: string) {
  const files = new Map(
    await Promise.all(
      wasmFilenames.map(
        async (filename) =>
          [
            filename,
            await readFile(
              new URL(
                import.meta.resolve(
                  `@kubohiroya/turbowarp-teachable-machine/wasm-assets/${filename}`,
                ),
              ),
            ),
          ] as const,
      ),
    ),
  );
  // Reject unsupported WASM before Emscripten tries to fetch a binary.
  const guarded = replacePinnedSource(
    source,
    /let \[(\w+), \w+\] = await Promise\.all\(\[\w+\(\)\.getAsync\("WASM_HAS_SIMD_SUPPORT"\), \w+\(\)\.getAsync\("WASM_HAS_MULTITHREAD_SUPPORT"\)\]\);/gu,
    '$&\n\tif (!$1) throw Error("WASM requires SIMD in this SB3");',
    'TensorFlow.js WASM initializer',
  );
  const withSimdPaths = replacePinnedSource(
    guarded,
    /^\t"tfjs-backend-wasm\.wasm",\n(?=\t"tfjs-backend-wasm-simd\.wasm",)/gmu,
    '',
    'TensorFlow.js WASM path list',
  );
  // Keep the requested mode in the report when routing an explicit WASM request to CPU.
  const withCpuFallback = replacePinnedSource(
    withSimdPaths,
    /await iHe\(o, r\)/gu,
    'await iHe(o, r, r === "wasm" && !await A().getAsync("WASM_HAS_SIMD_SUPPORT") ? ["cpu"] : undefined)',
    'Teachable Machine backend selection',
  );
  const withSimdCheck = replacePinnedSource(
    withCpuFallback,
    /if \(!await e\.isSupported\(a\)\) \{/gu,
    'if (!await e.isSupported(a) || (a === "wasm" && !await A().getAsync("WASM_HAS_SIMD_SUPPORT"))) {',
    'Teachable Machine capability check',
  );
  const packed = withSimdCheck.replace(
    /"(tfjs-backend-wasm(?:-threaded-simd|-simd)?\.wasm)": "data:application\/octet-stream;base64,([A-Za-z0-9+/]+={0,2})"(,?)/gu,
    (_match, filename: (typeof wasmFilenames)[number], base64: string, comma: string) => {
      const bytes = files.get(filename);
      assert(bytes?.toString('base64') === base64, `Unexpected embedded WASM for ${filename}`);
      files.delete(filename);
      if (filename === scalarWasmFilename) return '';
      const compressed = Buffer.from(deflateSync(bytes, {level: 9})).toString('base64');
      const key = JSON.stringify(filename);
      // Decode on first lookup by the WASM backend and keep the original data URL for its workers.
      return `get ${key}(){const url=kamishibaiPackedWasm.expand(${JSON.stringify(compressed)},${bytes.length});Object.defineProperty(this,${key},{value:url,enumerable:true});return url;}${comma}`;
    },
  );
  assert.equal(files.size, 0, 'Missing embedded Teachable Machine WASM assets');
  const {outputFiles} = await build({
    stdin: {
      resolveDir: fileURLToPath(new URL('.', import.meta.url)),
      contents: `
        import {inflateSync} from 'fflate';
        export function expand(base64, size) {
          const compressed = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
          const bytes = inflateSync(compressed, {out: new Uint8Array(size)});
          let binary = '';
          for (let offset = 0; offset < bytes.length; offset += 8192) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
          }
          return ${JSON.stringify(wasmDataUrlPrefix)} + btoa(binary);
        }`,
    },
    bundle: true,
    format: 'iife',
    globalName: 'kamishibaiPackedWasm',
    legalComments: 'inline',
    minify: true,
    write: false,
  });
  assert(outputFiles.length === 1 && outputFiles[0], 'Expected one WASM decoder bundle');
  return `${outputFiles[0].text}\n${packed}`;
}

const tmPackageName = '@kubohiroya/turbowarp-teachable-machine';
const kamishibaiSiteUrl = 'https://kubohiroya.github.io/turbowarp-kamishibai-app/';
/** Where a page asks for the one owner that loads the Teachable Machine runtime. */
export const dsl4TeachableMachineRuntimeOwnerKey =
  '@kubohiroya/turbowarp-kamishibai-app/tm-runtime';

async function readTeachableMachinePackage(specifier = tmPackageName) {
  const packageJsonUrl = new URL(import.meta.resolve(`${specifier}/package.json`));
  const metadata = JSON.parse(await readFile(packageJsonUrl, 'utf8'));
  assert.equal(metadata.name, tmPackageName, `${specifier} must be ${tmPackageName}`);
  return {
    version: String(metadata.version),
    distUrl: new URL('dist/', packageJsonUrl),
  };
}

/**
 * The files the Kamishibai site publishes for one Teachable Machine version, at the same relative
 * paths they have under the package's `dist/`. The reviewed runtime finds its backends and WASM
 * binaries next to `runtime.js`, so the directory keeps that shape.
 */
export const dsl4TeachableMachineSiteFiles = Object.freeze([
  'runtime.js',
  'backend-webgpu.js',
  'backend-wasm.js',
  'wasm/tfjs-backend-wasm.wasm',
  'wasm/tfjs-backend-wasm-simd.wasm',
  'wasm/tfjs-backend-wasm-threaded-simd.wasm',
  'wasm/tfjs-backend-wasm-threaded-simd.worker.js',
]);

export function dsl4TeachableMachineSiteBaseUrl(version: string) {
  assert(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version), `Invalid TM version ${version}`);
  return `${kamishibaiSiteUrl}teachable-machine/${version}/`;
}

/** Read one published file of a Teachable Machine package. */
export async function readDsl4TeachableMachineSiteFile(file: string, specifier = tmPackageName) {
  assert(dsl4TeachableMachineSiteFiles.includes(file), `Unknown TM site file ${file}`);
  const {distUrl} = await readTeachableMachinePackage(specifier);
  return readFile(new URL(file, distUrl));
}

export type Dsl4TeachableMachineRuntimeSite = Readonly<{
  version: string;
  runtimeUrl: string;
  /** Subresource Integrity of `runtime.js`, so the page runs only the reviewed bytes. */
  integrity: string;
}>;

/** Where the runtime this build pins lives on the Kamishibai site, and what it must hash to. */
export async function readDsl4TeachableMachineRuntimeSite(): Promise<Dsl4TeachableMachineRuntimeSite> {
  const {version} = await readTeachableMachinePackage();
  const runtime = await readDsl4TeachableMachineSiteFile('runtime.js');
  return Object.freeze({
    version,
    runtimeUrl: `${dsl4TeachableMachineSiteBaseUrl(version)}runtime.js`,
    integrity: `sha384-${createHash('sha384').update(runtime).digest('base64')}`,
  });
}

/**
 * The Teachable Machine member of the Standard bundle: the upstream lightweight extension.
 *
 * It carries no TensorFlow.js. When recognition first needs the runtime, it asks the page's runtime
 * owner — the Kamishibai runtime, which loads `runtime.js` from the Kamishibai site with Subresource
 * Integrity, or from the work itself when the work was built for a network-free venue — and loads
 * the site copy on its own only when no owner is present. The runtime then fetches the WebGPU or
 * WASM backend from beside itself only when a project reaches for one.
 */
export async function createDsl4TeachableMachineExtensionSource() {
  const {version} = await readTeachableMachinePackage();
  const loader = await readFile(
    fileURLToPath(import.meta.resolve(`${tmPackageName}/dist/teachable-machine.js`)),
    'utf8',
  );
  const runtimeUrl = `${dsl4TeachableMachineSiteBaseUrl(version)}runtime.js`;
  const atSite = replacePinnedSource(
    loader,
    /^var BROWSER_RUNTIME_URL = `https:\/\/cdn\.jsdelivr\.net\/npm\/\$\{package_default\.name\}@\$\{package_default\.version\}\/dist\/runtime\.js`;$/gmu,
    `var BROWSER_RUNTIME_URL = ${JSON.stringify(runtimeUrl)};`,
    'Teachable Machine runtime URL',
  );
  const owned = replacePinnedSource(
    atSite,
    /\) await loadScript\(BROWSER_RUNTIME_URL\);/gu,
    `) await (globalThis[Symbol.for(${JSON.stringify(dsl4TeachableMachineRuntimeOwnerKey)})]?.ensure?.() ?? loadScript(BROWSER_RUNTIME_URL));`,
    'Teachable Machine runtime loading',
  );
  const call = /\bScratch\s*\.\s*extensions\s*\.\s*register\s*\(/gu;
  assert.equal([...owned.matchAll(call)].length, 1, 'Teachable Machine must register exactly once');
  return Buffer.from(`
(function () {
let teachableMachineExtension;
const captureTeachableMachine = (extension) => {
  if (teachableMachineExtension) throw new Error('Duplicate Teachable Machine registration');
  teachableMachineExtension = extension;
};
${owned.replace(call, 'captureTeachableMachine(')}
if (!teachableMachineExtension) throw new Error('Teachable Machine did not register');
Scratch.extensions.register(teachableMachineExtension);
})();
`);
}

/**
 * The whole reviewed runtime as one script for works built for a network-free venue.
 *
 * It is the upstream self-contained WebGPU build, with every backend and the WASM binaries inside,
 * cut down to the part that publishes `tf`, `tmPose`, `tmImage`, `tmAudio` and `tmCompute`: it
 * creates and registers no extension, because the Standard bundle's member already did.
 */
export async function createDsl4TeachableMachineOfflineRuntimeSource({compactWasm = true} = {}) {
  const embedded = await readFile(
    fileURLToPath(import.meta.resolve(`${tmPackageName}/dist/teachable-machine-webgpu.js`)),
    'utf8',
  );
  // Keep the upstream threaded WASM factory and its Function.toString() output intact.
  const source = compactWasm ? await compactEmbeddedWasm(embedded) : embedded;
  const head = /\n([\w$]+)\(\), ([\w$]+)\(\{\n\t\.\.\.([\w$]+)\(\{\n/gu;
  const runtimeOnly = replacePinnedSource(
    replacePinnedSource(source, head, '\n$3({\n', 'Teachable Machine registration'),
    /\n\t\}\),\n\tcomputeMode: "webgpu",\n\tallowRemoteLibraries: !1\n\}\);\n/gu,
    '\n\t});\n',
    'Teachable Machine registration options',
  );
  const call = /\bScratch\s*\.\s*extensions\s*\.\s*register\s*\(/gu;
  assert.equal(
    [...runtimeOnly.matchAll(call)].length,
    1,
    'The offline runtime keeps only the unused registration function',
  );
  return runtimeOnly;
}
