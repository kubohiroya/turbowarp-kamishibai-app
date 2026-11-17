import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {parse} from 'yaml';

import {downloadCatalog} from '../scripts/download-catalog.ts';
import {createDsl4ReleaseSourceFiles} from '../scripts/sb3/dsl4-downloadable-release.ts';
import {dsl4CoreActionManifest} from '../src/dsl4/core-action-manifest.js';
import {dsl4RuntimeBlockIconURI} from '../src/dsl4/runtime-icon.js';
import {dsl4TurboWarpCoreActionBlockSpecs} from '../src/dsl4/platform/turbowarp-core-action-block.js';
import {
  requireArray,
  requireDefined,
  requireRecord,
  requireString,
} from './helpers/require-value.ts';
import {thrown} from './helpers/thrown-error.ts';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const contract = JSON.parse(
  await readFile(
    new URL('fixtures/dsl4/capability-bundle-release-contract.json', import.meta.url),
    'utf8',
  ),
);
const releasePins = JSON.parse(
  await readFile(new URL('fixtures/dsl4/release-pins.json', import.meta.url), 'utf8'),
);

const sourceExtensionPins = releasePins.extensions;
const sourceVisibleOpcodes = contract.standardArtifact.runtimeVisibleOpcodes;

/**
 * Read one repository file, letting a `.js` or `.mjs` path also name the `.ts` module that replaced
 * it. This contract pins modules by identity, not by source language, so it keeps holding while the
 * migration converts them one batch at a time.
 */
const readRepositoryFile = async (filePath: string) => {
  const candidate = path.join(repositoryRoot, filePath);
  try {
    return await readFile(candidate, 'utf8');
  } catch (error) {
    if (thrown(error).code !== 'ENOENT' || !/\.m?js$/u.test(candidate)) throw error;
    return readFile(candidate.replace(/\.m?js$/u, '.ts'), 'utf8');
  }
};

test('freezes the #266 capability inventory to reviewed lock resolutions and integrity', async () => {
  const [packageJsonSource, lockfileSource, licenses] = await Promise.all([
    readRepositoryFile('package.json'),
    readRepositoryFile('pnpm-lock.yaml'),
    readRepositoryFile('LICENSES.md'),
  ]);
  const packageJson = JSON.parse(packageJsonSource);
  assert.equal(packageJson.name, releasePins.release.package);
  assert.equal(contract.standardArtifact.version, releasePins.release.version);
  assert.equal(contract.standardArtifact.series, releasePins.release.series);
  assert.equal(packageJson.version, contract.standardArtifact.version);
  assert.equal(packageJson.publishConfig.tag, releasePins.release.channel);
  assert.equal(contract.releaseLifecycle.npmDistTag, releasePins.release.channel);
  const lockfile = parse(lockfileSource);
  const ids = new Set();
  const extensionIds = new Set([contract.standardArtifact.extensionId]);

  for (const capability of contract.capabilities) {
    assert.equal(ids.has(capability.id), false, `duplicate capability: ${capability.id}`);
    ids.add(capability.id);
    assert.equal(
      extensionIds.has(capability.standaloneExtensionId),
      false,
      `duplicate extension ID: ${capability.standaloneExtensionId}`,
    );
    extensionIds.add(capability.standaloneExtensionId);
    if (capability.debugExtensionId) {
      assert.equal(extensionIds.has(capability.debugExtensionId), false);
      extensionIds.add(capability.debugExtensionId);
    }

    if (capability.provider !== 'npm') continue;
    const pinnedVersion = sourceExtensionPins[capability.package];
    assert.equal(typeof pinnedVersion, 'string', `${capability.package} release pin`);
    const specifier = `^${pinnedVersion}`;
    assert.equal(packageJson.dependencies[capability.package], specifier);
    const patchHash = lockfile.patchedDependencies?.[`${capability.package}@${pinnedVersion}`];
    const lockedVersion = patchHash ? `${pinnedVersion}(patch_hash=${patchHash})` : pinnedVersion;
    const importerDependency = lockfile.importers['.'].dependencies[capability.package];
    assert.equal(importerDependency.specifier, specifier);
    assert.equal(
      importerDependency.version === lockedVersion ||
        importerDependency.version.startsWith(`${lockedVersion}(`),
      true,
      `${capability.package} lock version`,
    );
    assert.match(
      lockfile.packages[`${capability.package}@${pinnedVersion}`].resolution.integrity,
      /^sha512-/u,
    );
    assert.match(licenses, new RegExp(`${capability.package.replaceAll('/', '\\/')}\\s+\\|`));
  }

  for (const dependency of contract.supportPackages) {
    assert.equal(releasePins.supportDependencies[dependency.package], dependency.version);
    assert.equal(
      packageJson.dependencies[dependency.package],
      releasePins.supportDependencies[dependency.package],
    );
    assert.match(licenses, new RegExp(`\\| ${dependency.package}\\s+\\|`));
  }
});

test('keeps every external capability on its reviewed composition boundary', async () => {
  for (const [specifier, filePaths] of Object.entries(contract.compositionImports)) {
    for (const filePath of requireArray(filePaths, `the files for ${specifier}`)) {
      const source = await readRepositoryFile(requireString(filePath, 'a composition file path'));
      assert.match(source, new RegExp(`from ['\"]${specifier.replaceAll('/', '\\/')}['\"]`));
    }
  }
  assert.deepEqual(contract.apiCompatibility.sourceComposition, [
    'exact-package-version',
    'lockfile-integrity',
    'composition-export',
    'integration-tests',
  ]);
  assert.deepEqual(contract.apiCompatibility.staticBundleMember, [
    'api-manifest',
    'artifact-integrity',
    'saved-opcode-compatibility',
  ]);
});

test('ships the Standard artifact as one compact static extension bundle', async () => {
  const generatedFiles = await createDsl4ReleaseSourceFiles();
  const [entrypoint, authoringProfile] = await Promise.all([
    readRepositoryFile(contract.standardArtifact.entrypoint),
    readRepositoryFile('scripts/sb3/dsl4-runtime-authoring-profile.js'),
  ]);
  const projectSource = requireDefined(
    generatedFiles.get('project.source.json'),
    'the generated project source',
  ).toString('utf8');
  const bundleManifestSource = requireDefined(
    generatedFiles.get('embedded-extensions.json'),
    'the generated bundle manifest',
  ).toString('utf8');
  const project = JSON.parse(projectSource);
  const bundleManifest = JSON.parse(bundleManifestSource);
  const {extensionId, memberExtensionIds, runtimeComponentId} = contract.standardArtifact;

  assert.equal(contract.standardArtifact.integration, 'static-extension-bundle');
  assert.equal(contract.standardArtifact.recoveryCapsule, false);
  assert.equal(contract.standardArtifact.blockIconPolicy, 'member-blockIconURI');
  assert.equal(contract.standardArtifact.memberDocumentation.policy, 'member-docsURI-button');
  assert.deepEqual(
    Object.keys(contract.standardArtifact.memberDocumentation.urls),
    memberExtensionIds,
  );
  assert.equal(contract.standardArtifact.includesPreviewSurface, true);
  assert.equal(contract.standardArtifact.previewActivation, 'nonembedded-menu-default');
  assert.equal(contract.standardArtifact.embeddedStoryPreview, false);
  assert.deepEqual(project.extensions, memberExtensionIds);
  assert.deepEqual(Object.keys(project.extensionURLs), memberExtensionIds);
  assert.deepEqual(Object.keys(project.extensionStorage), [runtimeComponentId]);
  const appPackage = JSON.parse(await readRepositoryFile('package.json'));
  assert.deepEqual(bundleManifest.extensionBundles, [
    {
      id: extensionId,
      name: 'Kamishibai DSL 4.0 Runtime',
      members: memberExtensionIds,
      recoveryCapsule: contract.standardArtifact.recoveryCapsule,
      blockEditorRegistrations: true,
      paletteGroups: 'members',
      memberColors: 'member',
      metadata: {
        description: 'Run a self-contained TurboWarp Kamishibai DSL 4.0 story.',
        descriptions: {ja: 'TurboWarp紙芝居 DSL 4.0の作品を実行する、自己完結した機能拡張です。'},
        author: appPackage.author.name,
        authorURL: appPackage.author.url,
        version: appPackage.version,
        package: appPackage.name,
        repository: 'https://github.com/kubohiroya/turbowarp-kamishibai-app',
        docsURL: appPackage.homepage,
        banner: dsl4RuntimeBlockIconURI,
      },
    },
  ]);
  assert.deepEqual(
    requireArray(bundleManifest.extensions, 'the bundled extensions').map(
      (extension) => requireRecord(extension, 'a bundled extension').id,
    ),
    memberExtensionIds,
  );
  const npmSources = requireArray(bundleManifest.extensions, 'the bundled extensions')
    .map((extension) => requireRecord(extension, 'a bundled extension').source)
    .filter((source) => source !== undefined)
    .map((source) => requireRecord(source, 'an extension source'));
  assert.equal(npmSources.length, memberExtensionIds.length - 1);
  for (const source of npmSources) {
    assert.equal(source.provider, 'npm');
    const name = requireString(source.package, 'the source package');
    assert.equal(
      source.version,
      requireDefined(sourceExtensionPins[name], 'the reviewed release pin'),
    );
  }
  assert.equal((entrypoint.match(/Scratch\.extensions\.register\(/gu) ?? []).length, 1);
  assert.match(entrypoint, new RegExp(`const extensionId = '${runtimeComponentId}'`));
  assert.match(entrypoint, /installDsl4RuntimeAuthoringProfile/u);
  assert.doesNotMatch(entrypoint, /createDsl4RuntimeSourceChooser/u);
  assert.doesNotMatch(entrypoint, /createDsl4BrowserPreviewRuntimeComponent/u);
  assert.match(authoringProfile, /dsl4NonEmbeddedDevelopmentFeatureFlags/u);
  assert.match(authoringProfile, /createDsl4RuntimeSourceChooser/u);
  assert.match(authoringProfile, /createDsl4BrowserPreviewRuntimeComponent/u);
  assert.match(
    entrypoint,
    new RegExp(
      contract.standardArtifact.memberDocumentation.urls[runtimeComponentId].replaceAll('/', '\\/'),
      'u',
    ),
  );
  assert.doesNotMatch(entrypoint, /kubohiroyaweblink/u);

  const opcodes = [...entrypoint.matchAll(/opcode: '([^']+)'/gu)].map((match) => match[1]);
  assert.deepEqual(opcodes, contract.standardArtifact.runtimeHiddenOpcodes);
  assert.equal((entrypoint.match(/hideFromPalette: true/gu) ?? []).length, opcodes.length);
  assert.deepEqual(
    sourceVisibleOpcodes,
    dsl4CoreActionManifest.map(({command}) => command),
  );
  assert.deepEqual(
    dsl4TurboWarpCoreActionBlockSpecs.map(({command}) => command),
    sourceVisibleOpcodes,
  );
  assert.match(entrypoint, /createDsl4TurboWarpCoreActionBlockSurface/u);
  for (const opcode of sourceVisibleOpcodes) {
    // The entry is TypeScript, so the block method may carry a parameter annotation.
    assert.match(entrypoint, new RegExp(`\\n  ${opcode}\\(args(?:: [^)]+)?\\)`, 'u'));
  }
  assert.doesNotMatch(JSON.stringify(project.extensionURLs), /https?:/u);

  const persisted = JSON.stringify(project);
  for (const field of [
    'previewBridge',
    'previewToken',
    'reloadCandidate',
    'reloadModalState',
    'reloadPreference',
    'debugExecutionMode',
    'debugPauseState',
    'debugPauseLocation',
  ]) {
    assert.equal(persisted.includes(field), false, field);
  }
});

test('generates Standard 4.0 transiently and treats legacy 3.2 as a release asset', () => {
  assert.deepEqual(contract.bundleBoundaries.standard4, {
    kind: 'generated-extensionBundles',
    unbundle: 'regenerate-current-source',
    provenance: [
      'scripts/sb3/dsl4-downloadable-release.ts',
      'release-metadata/{release.version}.json',
      'package.json',
      'pnpm-lock.yaml',
      'LICENSES.md',
    ],
  });
  assert.deepEqual(contract.bundleBoundaries.legacy32, {
    kind: 'github-release-asset',
    unbundle: 'release-asset',
    provenance: [
      'https://github.com/kubohiroya/turbowarp-kamishibai-app/releases/download/v3.2.3/kamishibai-3.2.sb3',
    ],
  });
  assert.equal(contract.assetPolicy.remoteExtensionCode, 'forbidden');
  assert.equal(contract.assetPolicy.remoteAssetBytes, 'explicit-opt-in');
  assert.deepEqual(contract.assetPolicy.remoteAssetRequirements, [
    'https',
    'bare-pose-directory-or-complete-verification-metadata',
  ]);
  assert.equal(contract.previewPolicy.remotePreview, 'forbidden');
  assert.equal(contract.previewPolicy.localPreviewHost, 'tracked-by-issue-258');
  assert.equal(contract.previewPolicy.nonembeddedStandard, 'development-by-default');
  assert.equal(contract.previewPolicy.embeddedStory, 'production-no-preview');
});

test('keeps the 3.2 title state transition for Standard 4.0', () => {
  assert.match(contract.titleLifecycle.reference, /\/3\.2\/.*#%E7%8A%B6%E6%85%8B/u);
  assert.deepEqual(contract.titleLifecycle.greenFlag, ['initialize', 'showTitle', 'title']);
  assert.deepEqual(contract.titleLifecycle.closeInputs, ['stage-click', 'close-button']);
  assert.equal(contract.titleLifecycle.sharedBroadcast, 'closeTitle');
  assert.equal(contract.titleLifecycle.embeddedExit, 'startStory');
  assert.deepEqual(contract.titleLifecycle.externalExit, ['showCover', 'showMenu']);
  assert.deepEqual(contract.titleLifecycle.storyExit, ['stopStory', 'showCover', 'showMenu']);
  assert.equal(contract.titleLifecycle.storyExitShowsTitle, false);
});

test('pins a deterministic release, publication, and rollback sequence', async () => {
  assert.deepEqual(contract.releaseOrder, [
    'release-capability-packages',
    'update-exact-package-and-lock-pins',
    'set-release-candidate-version',
    'update-release-candidate-atomically',
    'run-full-verification',
    'check-release-candidate-without-mutation',
    'merge-release-candidate',
    'rerun-release-verification',
    'freeze-release-source-identity-and-artifact-hash',
    'create-version-tag',
    'publish-npm-package-with-next-dist-tag',
    'publish-github-prerelease',
    'record-publication',
    'publish-site-with-stable-recommendation-unchanged',
    'verify-publication',
  ]);
  assert.deepEqual(contract.rollbackOrder, [
    'disable-default-off-feature-surface',
    'deprecate-released-npm-version-if-required',
    'annotate-github-release',
    'restore-previous-recommended-download',
    'rerun-full-verification',
    'republish-site',
    'release-fix-as-next-patch',
  ]);

  const release = downloadCatalog.find(({version}) => version === releasePins.release.version);
  const releaseMetadataPath = `release-metadata/${releasePins.release.version}.json`;
  const metadata = JSON.parse(await readRepositoryFile(releaseMetadataPath));
  const releaseTag = `v${releasePins.release.version}`;
  const releaseFilename = `kamishibai-${releasePins.release.version}.sb3`;
  assert.equal(metadata.series, releasePins.release.series);
  assert.equal(metadata.version, releasePins.release.version);
  assert.equal(metadata.channel, releasePins.release.channel);
  assert.equal(metadata.artifact.filename, releaseFilename);
  assert.equal(
    metadata.artifact.url,
    `https://github.com${releasePins.release.repositoryPath}/releases/download/${releaseTag}/${releaseFilename}`,
  );
  assert.deepEqual(metadata.publication?.npm, {distTag: releasePins.release.channel});
  assert.deepEqual(metadata.publication?.github, {prerelease: true, tag: releaseTag});
  assert.match(metadata.artifact.sha256, /^[0-9a-f]{64}$/u);
  assert.match(metadata.sourceIdentity, /^sha256:[0-9a-f]{64}$/u);
  if (metadata.state === 'published') {
    assert.deepEqual(requireDefined(release, 'the pinned release').artifact, {
      buildDate: metadata.buildDate,
      ...metadata.artifact,
      sourceIdentity: metadata.sourceIdentity,
    });
  } else {
    assert.equal(
      requireDefined(release, 'the pinned release').artifact,
      undefined,
      'An unpublished release must not be offered before its release asset exists.',
    );
  }

  assert.deepEqual(contract.releaseLifecycle, {
    states: ['candidate', 'frozen', 'published'],
    updateCommand: 'pnpm release:dsl4:update',
    checkCommand: 'pnpm release:dsl4:check',
    freezeCommand: 'pnpm release:dsl4:freeze',
    publicationCommand: 'pnpm release:dsl4:record-publication',
    immutableStates: ['frozen', 'published'],
    npmDistTag: 'next',
    githubPrerelease: true,
    recommendedStableVersion: '3.2.3',
  });

  for (const evidencePath of contract.evidence) {
    assert.ok((await readRepositoryFile(evidencePath)).length > 0, evidencePath);
  }
});
