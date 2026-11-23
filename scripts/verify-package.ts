import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

/** The `npm pack --json` entry this check reads: the tarball name and the paths it carries. */
interface NpmPackResult {
  readonly filename: string;
  readonly files: readonly {readonly path: string}[];
}

function run(
  command: string,
  arguments_: readonly string[],
  options: {cwd?: string; env?: NodeJS.ProcessEnv; expectedStatus?: number} = {},
) {
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd ?? projectRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${command} terminated by ${result.signal}`);
  if (result.status !== (options.expectedStatus ?? 0)) {
    throw new Error(
      `${command} ${arguments_.join(' ')} failed with status ${result.status}\n${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout;
}

const declaredPackageJson = JSON.parse(
  await readFile(path.join(projectRoot, 'package.json'), 'utf8'),
);
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'turbowarp-kamishibai-pack-'));
try {
  const packResult: NpmPackResult | undefined = JSON.parse(
    run(
      'npm',
      [
        'pack',
        '--ignore-scripts',
        '--dry-run=false',
        '--json',
        '--pack-destination',
        temporaryDirectory,
      ],
      {
        env: {...process.env, npm_config_dry_run: 'false'},
      },
    ),
  )[0];
  assert(packResult?.filename, 'npm pack did not return a package filename');

  const packedPaths = new Set(packResult.files.map(({path: filePath}) => filePath));
  for (const requiredPath of [
    'README.md',
    'README.ja.md',
    'bin/turbowarp-kamishibai.mjs',
    'schema/dsl-4.schema.json',
    'dist/builder/index.js',
    'dist/builder/index.d.ts',
    'dist/builder/generated/dsl4-playback-runtime-extension.js',
    // Every artifact the TurboWarp Plus catalog reads from package.json turbowarpExtension.catalog.
    ...declaredPackageJson.turbowarpExtension.catalog.flatMap(
      ({artifact, variants}: {artifact: string; variants: string[]}) => [artifact, ...variants],
    ),
    'dist/dsl4/index.js',
    'dist/dsl4/object-store/index.js',
    'dist/dsl4/platform/standard-app-shell.js',
    'dist/dsl4/platform/turbowarp-preview-session.js',
    'dist/dsl4/platform/turbowarp-runtime-host.js',
  ]) {
    assert(packedPaths.has(requiredPath), `npm package is missing ${requiredPath}`);
  }

  const archivePath = path.join(temporaryDirectory, packResult.filename);
  const consumerDirectory = path.join(temporaryDirectory, 'consumer');
  await mkdir(consumerDirectory);
  await writeFile(path.join(consumerDirectory, 'package.json'), '{"private":true}\n');
  const consumerEnv: NodeJS.ProcessEnv = {...process.env, npm_config_dry_run: 'false'};
  delete consumerEnv.NODE_PATH;
  run(
    'npm',
    [
      'install',
      '--omit=dev',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      archivePath,
    ],
    {cwd: consumerDirectory, env: consumerEnv},
  );
  const projectPackageJson = JSON.parse(
    await readFile(path.join(projectRoot, 'package.json'), 'utf8'),
  );
  const packageDirectory = path.join(consumerDirectory, 'node_modules', projectPackageJson.name);

  const packageJson = JSON.parse(
    await readFile(path.join(packageDirectory, 'package.json'), 'utf8'),
  );
  const dsl4 = await import(pathToFileURL(path.join(packageDirectory, 'dist/dsl4/index.js')).href);
  const builder = await import(
    pathToFileURL(path.join(packageDirectory, 'dist/builder/index.js')).href
  );
  assert.equal(typeof dsl4.createDsl4SourceFrontend, 'function');
  assert.equal(typeof dsl4.createDsl4InputArbitration, 'function');
  assert.equal(typeof builder.createDsl4ProductionSourceFrontend, 'function');
  assert.equal(typeof builder.runDsl4LocalPreviewCommand, 'function');

  const cliVersion = run(process.execPath, ['bin/turbowarp-kamishibai.mjs', '--version'], {
    cwd: packageDirectory,
    env: consumerEnv,
  }).trim();
  assert.equal(cliVersion, packageJson.version);
  const validSource = 'kamishibai: "4.0"\nscenes:\n  opening:\n    - wait: 1\n';
  await writeFile(path.join(consumerDirectory, 'valid.k4.yml'), validSource);
  await writeFile(
    path.join(consumerDirectory, 'invalid.k4.yml'),
    validSource.replace('"4.0"', '4'),
  );
  for (const [filename, valid, expectedStatus] of [
    ['valid.k4.yml', true, 0],
    ['invalid.k4.yml', false, 1],
  ] as const) {
    const validation = JSON.parse(
      run(
        process.execPath,
        [
          path.join(packageDirectory, 'bin/turbowarp-kamishibai.mjs'),
          'validate-dsl4',
          '--input',
          filename,
          '--format',
          'json',
        ],
        {cwd: consumerDirectory, env: consumerEnv, expectedStatus},
      ),
    );
    assert.equal(validation.ok, valid);
  }
  process.stdout.write(
    `Verified production install of ${packageJson.name}@${packageJson.version} (${packResult.files.length} files), CLI startup, and valid/invalid DSL validation.\n`,
  );
} finally {
  await rm(temporaryDirectory, {force: true, recursive: true});
}
