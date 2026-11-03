import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {parse} from 'yaml';

import {dsl4RuntimeProvenance} from '../src/dsl4/runtime-provenance.ts';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const releasePins = JSON.parse(
  await readFile(new URL('fixtures/dsl4/release-pins.json', import.meta.url), 'utf8'),
);

test('locks every DSL4 extension to a reviewed npm release with matching caret specifiers', async () => {
  const [packageJsonSource, lockfileSource, workspaceSource] = await Promise.all([
    readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
    readFile(path.join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8'),
    readFile(path.join(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8'),
  ]);
  const packageJson = JSON.parse(packageJsonSource);
  const lockfile = parse(lockfileSource);
  const workspace = parse(workspaceSource);
  const allowedBuilds = Object.keys(workspace.allowBuilds ?? {});
  // pnpm 11 groups finite exact exclusions for one package into an OR expression.
  const ageExclusions = new Set(
    (workspace.minimumReleaseAgeExclude ?? []).flatMap((entry: string) => {
      assert.equal(typeof entry, 'string', 'Age exceptions must be strings.');
      const exactVersions =
        /^(@[^/]+\/[^@]+)@(\d+\.\d+\.\d+(?:-[\w.-]+)?(?: \|\| \d+\.\d+\.\d+(?:-[\w.-]+)?)*)$/u.exec(
          entry,
        );
      assert(exactVersions, 'Age exceptions must enumerate exact package releases.');
      const [, packageName, versions] = exactVersions;
      assert(packageName && versions, 'An exact age exception must name its package and versions.');
      return versions.split(' || ').map((version) => `${packageName}@${version}`);
    }),
  );

  assert.equal(releasePins.formatVersion, 1);
  for (const [name, version] of Object.entries(releasePins.extensions)) {
    const specifier = `^${version}`;
    assert.equal(packageJson.dependencies[name], specifier, `${name} package range`);
    const patchHash = lockfile.patchedDependencies?.[`${name}@${version}`];
    const lockedVersion = patchHash ? `${version}(patch_hash=${patchHash})` : version;
    const importerDependency = lockfile.importers['.'].dependencies[name];
    assert.equal(importerDependency.specifier, specifier, `${name} lock specifier`);
    assert.equal(
      importerDependency.version === lockedVersion ||
        importerDependency.version.startsWith(`${lockedVersion}(`),
      true,
      `${name} lock version`,
    );
    const packageEntry = lockfile.packages[`${name}@${version}`];
    assert.equal(typeof packageEntry?.resolution?.integrity, 'string', `${name} lock integrity`);
    assert.match(packageEntry.resolution.integrity, /^sha512-/u);
    assert.equal(
      allowedBuilds.some((entry) => entry.startsWith(`${name}@`)),
      false,
      `${name} must use the prebuilt npm artifact`,
    );
    assert.equal(ageExclusions.has(`${name}@${version}`), true, `${name} exact age exception`);
  }
  const toolchainName = '@kubohiroya/sb3-toolchain';
  const toolchainVersion = releasePins.devDependencies[toolchainName];
  // asset-cache 0.6.1 ships the fix the local 0.6.0 patch carried, so nothing is patched.
  assert.equal(workspace.patchedDependencies, undefined);
  assert.equal(lockfile.patchedDependencies, undefined);
  assert.equal(packageJson.devDependencies[toolchainName], `^${toolchainVersion}`);
  const toolchainDependency = lockfile.importers['.'].devDependencies[toolchainName];
  assert.equal(toolchainDependency.specifier, `^${toolchainVersion}`);
  assert.equal(toolchainDependency.version.split('(')[0], toolchainVersion);
  assert.match(
    lockfile.packages[`${toolchainName}@${toolchainVersion}`].resolution.integrity,
    /^sha512-/u,
  );
  assert.equal(ageExclusions.has(`${toolchainName}@${toolchainVersion}`), true);
});

test('runtime provenance matches the resolved dependency versions', async () => {
  const lockfile = parse(await readFile(path.join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8'));
  for (const component of dsl4RuntimeProvenance) {
    const dependency = lockfile.importers['.'].dependencies[component.source];
    if (dependency !== undefined) {
      const resolved = dependency.version.split('(')[0];
      // A git dependency resolves to a tarball URL; pnpm records its real version beside it.
      const entry = lockfile.packages?.[`${component.source}@${resolved}`];
      const gitHosted = entry?.resolution?.gitHosted === true;
      if (gitHosted) {
        assert.match(
          dependency.specifier,
          /#[0-9a-f]{40}$/u,
          `${component.source} must pin an exact commit`,
        );
      }
      const resolvedVersion = gitHosted ? entry.version : resolved;
      assert.equal(component.version, resolvedVersion, `${component.source} runtime provenance`);
    }
  }
});
