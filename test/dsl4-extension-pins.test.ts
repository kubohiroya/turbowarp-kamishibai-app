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
  const ageExclusions = new Set<string>();
  assert.equal(workspace.minimumReleaseAge ?? 1440, 1440, 'Keep the 24-hour release age.');
  for (const entry of workspace.minimumReleaseAgeExclude ?? []) {
    assert.equal(typeof entry, 'string', 'Age exceptions must be strings.');
    assert.match(
      entry,
      /^@kubohiroya\/(?:turbowarp-[a-z0-9-]+|vite-plugin-turbowarp-extension|sb3-toolchain)$/u,
      'Age exceptions must name one family package, never a wildcard or external package.',
    );
    assert(
      Object.hasOwn(packageJson.dependencies, entry) ||
        Object.hasOwn(packageJson.devDependencies, entry),
      `Age exception must be for a declared dependency: ${entry}`,
    );
    assert(!ageExclusions.has(entry), `Duplicate age exception: ${entry}`);
    ageExclusions.add(entry);
  }
  assert(ageExclusions.has('@kubohiroya/turbowarp-sb3-save-format'));

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
    assert.equal(ageExclusions.has(name), true, `${name} family age exception`);
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
  assert.equal(ageExclusions.has(toolchainName), true);
});

test('runtime provenance matches the resolved dependency versions', async () => {
  const [lockfileSource, packageJsonSource] = await Promise.all([
    readFile(path.join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8'),
    readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
  ]);
  const lockfile = parse(lockfileSource);
  const {version: releaseVersion} = JSON.parse(packageJsonSource) as {version: string};
  // `packages` is keyed `name@version`, and a scoped name carries its own leading '@'.
  const installed = new Map<string, string[]>();
  for (const key of Object.keys(lockfile.packages ?? {})) {
    const separator = key.lastIndexOf('@');
    const name = key.slice(0, separator);
    installed.set(name, [...(installed.get(name) ?? []), key.slice(separator + 1)]);
  }
  for (const component of dsl4RuntimeProvenance) {
    // This release's own entry. It is what the published extension advertises as its
    // `// Version:` line, since dsl4PackageMetadata reads the version from here, and it is a
    // dependency of nothing, so neither branch below would ever reach it.
    if (component.source === 'turbowarp-kamishibai-app') {
      assert.equal(
        component.version,
        releaseVersion,
        'the version the composed runtime advertises must be this release',
      );
      continue;
    }
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
      continue;
    }
    // Composed without being depended on directly, such as a model that arrives through another
    // package. These used to be skipped, which left their recorded version unfalsifiable: one
    // version installed and it must be the recorded one, or the bundle's own notice is a guess.
    const versions = installed.get(component.source);
    assert(versions, `${component.source} is recorded as composed but is not installed`);
    assert.deepEqual(
      versions,
      [component.version],
      `${component.source} runtime provenance (one installed version, matching the record)`,
    );
  }
});
