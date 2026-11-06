import assert from 'node:assert/strict';
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

/** Share one reviewed graph across successive projects in the same Editor page. */
export async function createDsl4TeachableMachineExtensionSource({compactWasm = false} = {}) {
  const [embedded, loader] = await Promise.all([
    readFile(
      fileURLToPath(
        import.meta
          .resolve('@kubohiroya/turbowarp-teachable-machine/dist/teachable-machine-webgpu.js'),
      ),
      'utf8',
    ),
    readFile(
      fileURLToPath(
        import.meta.resolve('@kubohiroya/turbowarp-teachable-machine/dist/teachable-machine.js'),
      ),
      'utf8',
    ),
  ]);
  const captureRegistration = (source: string) => {
    const call = /\bScratch\s*\.\s*extensions\s*\.\s*register\s*\(/gu;
    assert.equal(
      [...source.matchAll(call)].length,
      1,
      'Teachable Machine must register exactly once',
    );
    return source.replace(call, 'captureTeachableMachine(');
  };
  // Keep the upstream threaded WASM factory and its Function.toString() output intact.
  const embeddedSource = compactWasm ? await compactEmbeddedWasm(embedded) : embedded;
  const key = '@kubohiroya/turbowarp-teachable-machine/runtime';
  return Buffer.from(`
(function () {
let teachableMachineExtension;
const captureTeachableMachine = (extension) => {
  if (teachableMachineExtension) throw new Error('Duplicate Teachable Machine registration');
  teachableMachineExtension = extension;
};
if (globalThis[Symbol.for(${JSON.stringify(key)})]?.version === '4.2.0' &&
    globalThis.tf && globalThis.tmPose && globalThis.tmCompute) {
${captureRegistration(loader)}
} else {
${captureRegistration(embeddedSource)}
}
if (!teachableMachineExtension) throw new Error('Teachable Machine did not register');
Scratch.extensions.register(teachableMachineExtension);
})();
`);
}
