import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';
import {builtinModules} from 'node:module';
import {build as bundleModules} from 'esbuild';
import * as ts from 'typescript';

import {resolveModulePath} from './helpers/module-path.ts';
import {requireDefined} from './helpers/require-value.ts';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const dsl4Root = path.join(repositoryRoot, 'src', 'dsl4');

/**
 * Shared packages the DSL 4.0 core may import. The core purity rule exists to keep platform and
 * I/O dependencies out of the core graph, not to forbid app-neutral extraction, so a package
 * earns a place here only while it stays dependency-free and platform-free. The test below
 * enforces that, so this list cannot silently become a hole in the rule.
 */
const pureSharedPackages = Object.freeze([
  '@kubohiroya/turbowarp-live-reload-controller',
  '@kubohiroya/turbowarp-runtime-adapter',
]);

/** Compositions may have pure transitive dependencies; unlike the packages above, they are audited as a graph. */
const pureCompositionEntries = Object.freeze([
  '@kubohiroya/turbowarp-document-source',
  '@kubohiroya/turbowarp-document-data/document-source',
  '@kubohiroya/turbowarp-document-data/project-views',
  '@kubohiroya/turbowarp-yaml-json/yaml-blocks',
  '@kubohiroya/turbowarp-yaml-json/source-view',
  '@kubohiroya/turbowarp-document-data/view-metadata',
  '@kubohiroya/turbowarp-document-data/composition',
  '@kubohiroya/turbowarp-yaml-json/source-syntax',
  '@kubohiroya/turbowarp-runtime-expression/composition',
]);
const schemaDataModules = new Set(
  ['dsl-4.schema.json', 'dsl-4-editor.schema.json', 'dsl-4-narrative-control.schema.json'].map(
    (file) => path.join(repositoryRoot, 'schema', file),
  ),
);

const platformGlobals =
  /(?<![.\w$])(?:globalThis|window|document|navigator|indexedDB|localStorage|fetch|XMLHttpRequest|WebSocket|Scratch|process|require)\b/u;

/**
 * Strip comments and string literals so the platform-global check measures code rather than prose.
 * A package that names `Scratch` in an error message, or reads `options.Scratch` from an injected
 * parameter, is not reaching for an ambient global — which is the only thing this rule is about.
 */
function executableSource(source: string) {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//gu, ' ')
    .replaceAll(/(^|[^:])\/\/[^\n]*/gu, '$1 ')
    .replaceAll(/'(?:[^'\\\n]|\\.)*'/gu, "''")
    .replaceAll(/"(?:[^"\\\n]|\\.)*"/gu, '""')
    .replaceAll(/`(?:[^`\\]|\\.)*`/gu, '``');
}

const pureEntries = [
  'definition-audit.js',
  'implicit-project-assets.js',
  'action-hat-detector.js',
  'action-invocation-adapter.js',
  'action-registry.js',
  'asset-bundle-descriptor.js',
  'asset-dependency-index.js',
  'asset-group-lifecycle.js',
  'binary-entry-provider.js',
  'block-source-export.js',
  'compiled-project.js',
  'structured-block-source-codec.js',
  'document-source-runtime.js',
  'embedded-yaml-view-state.js',
  'compiled-story-artifact.js',
  'control-profile-resolver.js',
  'embedded-asset-lifecycle.js',
  'history-reducer.js',
  'jsonpath.js',
  'kamishibai-structured-data.js',
  'live-reload-session.js',
  'navigation-session.js',
  'object-store/index.js',
  'preview-protocol.js',
  'pose-feedback-policy.js',
  'group-preload-coordinator.js',
  'publication-manifest.js',
  'publication-loader.js',
  'publication-asset-loader.js',
  'reload-planner.js',
  'runtime-artifact-descriptor.js',
  'runtime-artifact-loader.js',
  'runtime-controller.js',
  'runtime-startup.js',
  'semantic-validator.js',
  'source-descriptor.js',
  'source-frontend.js',
  'story-document.js',
  'structured-data.js',
];

function moduleSpecifiers(source: string, filename: string) {
  const result: string[] = [];
  for (const match of source.matchAll(
    /\b(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gmu,
  )) {
    result.push(requireDefined(match[1], `the specifier in ${filename}`));
  }
  for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gmu)) {
    result.push(requireDefined(match[1], `the dynamic specifier in ${filename}`));
  }
  assert.equal(
    result.every((specifier) => specifier.length > 0),
    true,
    filename,
  );
  return result;
}

async function importGraph(entry: string) {
  const pending = [await resolveModulePath(path.join(dsl4Root, entry))];
  const modules = new Map<string, {source: string; imports: string[]}>();
  while (pending.length > 0) {
    const filename = requireDefined(pending.pop(), 'the next module to read');
    if (modules.has(filename)) continue;
    const source = await readFile(filename, 'utf8');
    const imports = moduleSpecifiers(source, filename);
    modules.set(filename, {source, imports});
    for (const specifier of imports) {
      if (!specifier.startsWith('.')) continue;
      const target = path.resolve(path.dirname(filename), specifier);
      if (schemaDataModules.has(target)) {
        const data: unknown = JSON.parse(await readFile(target, 'utf8'));
        assert(
          data && typeof data === 'object' && !Array.isArray(data),
          `${target} must remain owner schema data`,
        );
        continue;
      }
      assert.equal(
        target.startsWith(`${dsl4Root}${path.sep}`),
        true,
        `${path.relative(repositoryRoot, filename)} escapes the DSL4 core`,
      );
      pending.push(await resolveModulePath(target));
    }
  }
  return modules;
}

test('keeps every declared DSL4 core graph outside platform and I/O dependencies', async () => {
  for (const entry of pureEntries) {
    const graph = await importGraph(entry);
    for (const [filename, {source, imports}] of graph) {
      const relative = path.relative(repositoryRoot, filename);
      assert.equal(
        relative.includes(`${path.sep}platform${path.sep}`),
        false,
        `${entry}: ${relative}`,
      );
      for (const specifier of imports) {
        if (pureSharedPackages.includes(specifier) || pureCompositionEntries.includes(specifier))
          continue;
        assert.doesNotMatch(specifier, /^node:/u, `${entry}: ${relative}`);
        assert.doesNotMatch(
          specifier,
          /(?:scratch-vm|@kubohiroya\/turbowarp-)/u,
          `${entry}: ${relative}`,
        );
      }
      assert.doesNotMatch(
        source,
        /(?:globalThis\.(?:document|window)|\bfetch\s*\(|\bScratch\.extensions\b|\bvm\.runtime\b|\bstartHats\b)/u,
        `${entry}: ${relative}`,
      );
    }
  }
});

test('keeps every DSL4 core shared package dependency-free and platform-free', async () => {
  for (const specifier of pureSharedPackages) {
    const manifest = JSON.parse(
      await readFile(fileURLToPath(import.meta.resolve(`${specifier}/package.json`)), 'utf8'),
    );
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      assert.deepEqual(manifest[field] ?? {}, {}, `${specifier}: ${field}`);
    }
    const entry = fileURLToPath(import.meta.resolve(specifier));
    const source = await readFile(entry, 'utf8');
    assert.deepEqual(moduleSpecifiers(source, specifier), [], specifier);
    assert.doesNotMatch(executableSource(source), platformGlobals, specifier);
  }
});

test('keeps shared composition entry graphs free of Node I/O, App builders, GUI modules and ambient browser I/O', async () => {
  const builtins = new Set(builtinModules.map((name) => name.replace(/^node:/u, '')));
  const bundled = await bundleModules({
    absWorkingDir: repositoryRoot,
    stdin: {
      contents: pureCompositionEntries
        .map((entry, index) => `export * as entry${index} from ${JSON.stringify(entry)};`)
        .join('\n'),
      resolveDir: repositoryRoot,
    },
    bundle: true,
    platform: 'browser',
    format: 'esm',
    write: false,
    treeShaking: false,
    metafile: true,
    plugins: [
      {
        name: 'pure-composition-boundary',
        setup(build) {
          build.onResolve({filter: /.*/}, (args) => {
            assert(
              !args.path.startsWith('node:') && !builtins.has(args.path),
              `${args.importer}: Node dependency ${args.path}`,
            );
            assert.doesNotMatch(
              args.path,
              /(?:^|\/)(?:scratch-vm|scratch-gui)(?:\/|$)|@kubohiroya\/turbowarp-(?:kamishibai-app|extension-data-editor|extension-security-dialog)(?:\/|$)/u,
            );
            return undefined;
          });
        },
      },
    ],
  });
  const files = Object.keys(
    requireDefined(bundled.metafile, 'the complete composition graph').inputs,
  )
    .filter((file) => /\.(?:m?js|cjs)$/u.test(file))
    .map((file) => path.resolve(repositoryRoot, file));
  assert(files.length > pureCompositionEntries.length, 'The audit must follow transitive modules.');
  for (const file of files) assert.doesNotMatch(file, /(?:^|\/)src\/(?:builder|platform)\//u, file);
  const program = ts.createProgram(files, {allowJs: true, noResolve: true, noLib: true});
  const checker = program.getTypeChecker();
  const unsafeNames = new Set([
    'window',
    'document',
    'navigator',
    'indexedDB',
    'localStorage',
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'Scratch',
    'process',
    'global',
    'Buffer',
  ]);
  for (const file of files) {
    const source = requireDefined(program.getSourceFile(file), `the parsed module ${file}`);
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && unsafeNames.has(node.text)) {
        const parent = node.parent;
        const isPropertyName =
          (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          // `const {fetch: fetcher} = options` names a property; it reads no ambient binding.
          (ts.isBindingElement(parent) && parent.propertyName === node) ||
          ((ts.isPropertyAssignment(parent) ||
            ts.isMethodDeclaration(parent) ||
            ts.isPropertyDeclaration(parent)) &&
            parent.name === node);
        if (!isPropertyName) {
          const bound = checker
            .getSymbolAtLocation(node)
            ?.declarations?.some((declaration) => !declaration.getSourceFile().isDeclarationFile);
          assert(bound, `${file}: ambient ${node.text} dependency`);
        }
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'globalThis'
      )
        assert(
          !unsafeNames.has(node.name.text),
          `${file}: ambient globalThis.${node.name.text} dependency`,
        );
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});

test('keeps specialized pure modules outside their forbidden graphs', async () => {
  const jsonPathSource = await readFile(
    await resolveModulePath(path.join(dsl4Root, 'jsonpath.js')),
    'utf8',
  );
  assert.deepEqual(moduleSpecifiers(jsonPathSource, 'jsonpath.js'), []);
  assert.doesNotMatch(jsonPathSource, /\b(?:eval|Function|RegExp)\s*\(|\.match\s*\(/u);

  const detectorSource = await readFile(
    await resolveModulePath(path.join(dsl4Root, 'action-hat-detector.js')),
    'utf8',
  );
  assert.doesNotMatch(detectorSource, /\b(?:eval|Function)\s*\(/u);

  const objectStore = await importGraph('object-store/index.js');
  for (const {imports} of objectStore.values()) {
    for (const specifier of imports) assert.doesNotMatch(specifier, /story-document/u);
  }

  const kamishibai = await importGraph('kamishibai-structured-data.js');
  for (const {imports} of kamishibai.values()) {
    for (const specifier of imports) {
      assert.doesNotMatch(specifier, /(?:structured-data\.js|jsonpath\.js)/u);
    }
  }
});

test('keeps custom action discovery and invocation outside default runtime graphs', async () => {
  for (const entry of [
    'runtime-startup.js',
    'navigation-session.js',
    'platform/turbowarp-runtime-host.js',
  ]) {
    const graph = await importGraph(entry);
    const files = [...graph.keys()].map((filename) => path.relative(dsl4Root, filename));
    assert.equal(files.includes('action-hat-detector.js'), false, entry);
    assert.equal(files.includes('action-invocation-adapter.js'), false, entry);
    assert.equal(files.includes('action-context-turbowarp.js'), false, entry);
  }
});

test('keeps startup and host composition independent from ambient platform globals', async () => {
  for (const filename of [
    path.join(dsl4Root, 'runtime-startup.js'),
    path.join(dsl4Root, 'platform', 'turbowarp-runtime-host.js'),
  ]) {
    const source = await readFile(await resolveModulePath(filename), 'utf8');
    assert.doesNotMatch(
      source,
      /(?:globalThis\.(?:document|window)|\bindexedDB\b|\bfetch\s*\(|\bScratch\.extensions\b)/u,
      path.relative(repositoryRoot, filename),
    );
  }
});

test('keeps platform adapters explicit, injected, and outside the public core graph', async () => {
  const coreGraph = await importGraph('index.js');
  for (const filename of coreGraph.keys()) {
    assert.equal(
      filename.includes(`${path.sep}platform${path.sep}`),
      false,
      path.relative(repositoryRoot, filename),
    );
  }

  for (const relative of [
    'asset-adapter-router.js',
    'asset-manager-adapter.js',
    'actor-action-port.js',
    'async-input-action-port.js',
    'media-action-port.js',
    'platform-asset-session.js',
    'svg-text-action-port.js',
    'tm-model-adapter.js',
    'turbowarp-actor-adapter.js',
    'turbowarp-runtime-host.js',
  ]) {
    const filename = await resolveModulePath(path.join(dsl4Root, 'platform', relative));
    const source = await readFile(filename, 'utf8');
    for (const specifier of moduleSpecifiers(source, filename)) {
      assert.doesNotMatch(specifier, /^node:/u, relative);
      assert.doesNotMatch(specifier, /scratch-vm/u, relative);
    }
    assert.doesNotMatch(
      source,
      /(?:globalThis\.(?:document|window)|\bindexedDB\b|\bfetch\s*\(|\bScratch\b|getInfo\s*\()/u,
      relative,
    );
    if (relative === 'turbowarp-runtime-host.js') {
      assert.match(source, /@kubohiroya\/turbowarp-runtime-adapter/u, relative);
    } else {
      assert.doesNotMatch(source, /\bstartHats\b/u, relative);
    }
  }
});

test('resolves the TurboWarp Stage target only through the injected runtime host', async () => {
  for (const relative of [
    path.join('src', 'dsl4', 'platform', 'turbowarp-transition-port.js'),
    path.join('src', 'dsl4', 'platform', 'scratch-pose-feedback-adapter.js'),
    path.join('src', 'dsl4', 'browser-turbowarp-stage.js'),
  ]) {
    const modulePath = await resolveModulePath(path.join(repositoryRoot, relative));
    const source = await readFile(modulePath, 'utf8');
    assert.doesNotMatch(source, /\bgetTargetForStage\b/u, relative);
    assert.match(source, /\bgetStageTarget\s*\(/u, relative);
  }

  const composition = await readFile(
    await resolveModulePath(path.join(dsl4Root, 'platform', 'turbowarp-runtime-host.js')),
    'utf8',
  );
  assert.match(composition, /createTurboWarpRuntimeHost\(\{runtime: options\.runtime\}\)/u);
  assert.match(composition, /runtimeHost: turboWarpHost/u);
});

test('routes runtime extension Scratch VM access through the shared runtime host', async () => {
  const sources = new Map();
  for (const relative of [
    path.join('scripts', 'sb3', 'dsl4-runtime-extension-entry.js'),
    path.join('scripts', 'sb3', 'dsl4-runtime-authoring-profile.js'),
  ]) {
    const modulePath = await resolveModulePath(path.join(repositoryRoot, relative));
    sources.set(relative, await readFile(modulePath, 'utf8'));
  }

  for (const [relative, source] of sources) {
    assert.doesNotMatch(source, /\bvm\.runtime\b/u, relative);
    assert.doesNotMatch(source, /\bgetTargetForStage\b/u, relative);
    for (const match of source.matchAll(/(\S*?)startHats\s*\(/gu)) {
      assert.match(match[1], /^(?:this\.)?turboWarpHost\.$/u, `${relative}: ${match[0]}`);
    }
  }

  const entry = sources.get(path.join('scripts', 'sb3', 'dsl4-runtime-extension-entry.js'));
  assert.match(entry, /from '@kubohiroya\/turbowarp-runtime-adapter'/u);
  assert.match(entry, /createTurboWarpRuntimeHost\(\{Scratch, requireUnsandboxed: true\}\)/u);
  assert.match(entry, /turboWarpHost\.onRuntimeEvent\('PROJECT_STOP_ALL'/u);
  // The camera preview control renderer is the host's, but its container, preview geometry and
  // frame scheduler are the shell's to supply. Without them the host refuses any story that
  // declares `preview.controls`, which is how 4.0.0-rc.17 and earlier shipped.
  assert.match(entry, /cameraPreviewControls: this\.cameraPreviewControlOptions\(\)/u);
  assert.match(entry, /source\.registerCameraControls/u);
  assert.match(entry, /getPreviewRect: \(\) => resolveCameraPreviewRect\(/u);
  assert.match(entry, /createObjectURL: \(blob: Blob\) => URL\.createObjectURL\(blob\)/u);
});

test('reads renderer, monitors, and targets through the shared runtime host', async () => {
  for (const relative of [
    path.join('src', 'dsl4', 'platform', 'turbowarp-crossfade-platform.js'),
  ]) {
    const source = await readFile(
      await resolveModulePath(path.join(repositoryRoot, relative)),
      'utf8',
    );
    assert.doesNotMatch(source, /\bruntime\.renderer\b/u, relative);
    assert.doesNotMatch(source, /\bruntime\.requestRedraw\b/u, relative);
    assert.match(source, /runtimeHost\.(?:getRenderer|requestRedraw)\s*\(/u, relative);
  }

  const poseFeedback = await readFile(
    await resolveModulePath(path.join(dsl4Root, 'platform', 'scratch-pose-feedback-adapter.js')),
    'utf8',
  );
  assert.doesNotMatch(poseFeedback, /\bruntime\.monitorBlocks\b/u);
  assert.doesNotMatch(poseFeedback, /\bruntime\.getMonitorState\b/u);
  assert.match(poseFeedback, /runtimeHost\.getMonitorBlocks\s*\(/u);
  assert.match(poseFeedback, /runtimeHost\.getMonitorState\s*\(/u);

  const browserStage = await readFile(
    await resolveModulePath(path.join(dsl4Root, 'browser-turbowarp-stage.js')),
    'utf8',
  );
  // The module owns the VM it creates, so it is the one place allowed to name vm.runtime — and
  // only to build the host every other read goes through.
  assert.deepEqual(
    [...browserStage.matchAll(/[^\n]*\bvm\.runtime\b[^\n]*/gu)].map((match) => match[0].trim()),
    ['runtimeHost = createTurboWarpRuntimeHost({runtime: vm.runtime});'],
  );

  const actorAdapter = await readFile(
    await resolveModulePath(path.join(dsl4Root, 'platform', 'turbowarp-actor-adapter.js')),
    'utf8',
  );
  assert.doesNotMatch(actorAdapter, /\bruntime\.targets\b/u);
  assert.match(actorAdapter, /runtimeHost\.targets\s*\(/u);

  const hatDetector = await readFile(
    await resolveModulePath(path.join(dsl4Root, 'action-hat-detector.js')),
    'utf8',
  );
  assert.doesNotMatch(hatDetector, /\bruntime\.targets\b/u);
  assert.match(hatDetector, /runtimeHost\.targets\s*\(/u);

  const assetManager = await readFile(
    await resolveModulePath(path.join(dsl4Root, 'platform', 'asset-manager-adapter.js')),
    'utf8',
  );
  assert.doesNotMatch(assetManager, /\bruntime\.targets\b/u);
  assert.match(assetManager, /runtimeHost\.(?:spriteTargets|getStageTarget)\s*\(/u);

  const variableBlocks = await readFile(
    await resolveModulePath(path.join(dsl4Root, 'platform', 'turbowarp-runtime-variable-block.js')),
    'utf8',
  );
  assert.match(variableBlocks, /createBlockSurfaceBuilder\(/u);
  assert.match(variableBlocks, /coerceScalarBlockValue\(/u);
  // Block records are the shared builder's job; the DSL 4.0 vocabulary stays here.
  assert.doesNotMatch(variableBlocks, /hideFromPalette/u);
  assert.doesNotMatch(variableBlocks, /disableMonitor/u);
});

/**
 * Speech is rendered by `@kubohiroya/turbowarp-bubble`, which is a public package surface. The
 * Looks extension members it replaced (`ext_scratch3_looks._say` / `._think`) were scratch-vm
 * internals, so app code must not reach for any `ext_scratch3_*` extension instance again.
 */
test('keeps Scratch extension internals out of app code', async () => {
  const roots = [path.join(repositoryRoot, 'src'), path.join(repositoryRoot, 'scripts', 'sb3')];
  const files: string[] = [];
  for (const root of roots) {
    for (const entry of await readdir(root, {recursive: true, withFileTypes: true})) {
      if (!entry.isFile() || !/\.(?:ts|js|mjs)$/u.test(entry.name)) continue;
      files.push(path.join(entry.parentPath, entry.name));
    }
  }
  assert.ok(files.length > 0);
  for (const filename of files) {
    assert.doesNotMatch(
      executableSource(await readFile(filename, 'utf8')),
      /\bext_scratch3_\w+/u,
      path.relative(repositoryRoot, filename),
    );
  }
});

test('keeps one-shot build output mutation outside the orchestration core', async () => {
  const source = await readFile(
    await resolveModulePath(path.join(repositoryRoot, 'src', 'builder', 'dsl4-build.js')),
    'utf8',
  );
  assert.doesNotMatch(source, /(?:atomic-output|\bwriteFile\b|\brename\b|\bmkdir\b|\brm\s*\()/u);
});
