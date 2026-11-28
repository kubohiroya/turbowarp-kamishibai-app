import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'vitest';

import {
  dsl4ActionContextDefaultFeatureFlags,
  dsl4ActionContextManifest,
  dsl4CoreActionManifest,
  dsl4DefaultFeatureFlags,
  dsl4StandardProductionFeatureFlags,
  dsl4StructuredDataDefaultFeatureFlags,
  dsl4StructuredDataDeveloperManifest,
  dsl4StructuredDataStandaloneManifest,
} from '../src/dsl4/index.js';
import {createDsl4StandardAppShell} from '../src/dsl4/platform/index.js';

const contract = JSON.parse(
  await readFile(new URL('fixtures/dsl4/app-shell-contract.json', import.meta.url), 'utf8'),
);

/** The contract fixture members this suite reads back; `Object.values` otherwise hands back unknown. */
interface ContractSurface {
  extensionId?: string;
  productionArtifact?: boolean;
  previewUi?: boolean;
  registeredInStandard?: boolean;
}

const opcodes = (manifest: {blocks: readonly {opcode: string}[]}) =>
  manifest.blocks.map((definition) => definition.opcode);

test('freezes the #265 Standard author and template-internal palette boundary', () => {
  assert.equal(contract.formatVersion, 1);
  assert.equal(contract.standardRuntime.extensionId, 'kubohiroyakamishibai4');
  assert.equal(contract.standardRuntime.runtimeComponentId, 'kubohiroyakamishibairuntime4');
  assert.deepEqual(
    contract.standardRuntime.visibleOpcodes,
    dsl4CoreActionManifest
      .filter(({featureFlag}) => featureFlag === undefined)
      .map(({command}) => command),
  );
  assert.equal(new Set(contract.standardRuntime.visibleOpcodes).size, 33);
  assert.deepEqual(contract.standardRuntime.hiddenOpcodes, [
    'versionReporter',
    'statusReporter',
    'lastErrorReporter',
    'binaryBackingStatusReporter',
    'runtimeDiagnosticsReporter',
    'setTextValue',
    'showTitle',
    'closeTitle',
    'openOfficialWebsite',
    'toggleTitleLanguage',
  ]);
  assert.equal(new Set(contract.standardRuntime.hiddenOpcodes).size, 10);
});

test('specifies the app shell as a startup-fixed default-off implementation flag', () => {
  assert.deepEqual(contract.featureFlags.appShell, {
    name: 'dsl4AppShell',
    defaultEnabled: false,
    startupFixed: true,
    requires: ['dsl4Runtime'],
    implemented: true,
  });
  assert.equal(typeof createDsl4StandardAppShell, 'function');
  assert.deepEqual(contract.featureFlags.turboWarpActionSurface, {
    name: 'dsl4TurboWarpActionSurface',
    defaultEnabled: false,
    standardProductionEnabled: true,
    startupFixed: true,
    requires: ['dsl4Runtime'],
    implemented: true,
  });
  assert.equal(dsl4DefaultFeatureFlags.dsl4TurboWarpActionSurface, false);
  assert.equal(dsl4StandardProductionFeatureFlags.dsl4TurboWarpActionSurface, true);
});

test('keeps actual developer manifests aligned with the optional-surface contract', () => {
  const {actionContext, structuredDataStandalone, structuredDataDebug} = contract.optionalSurfaces;

  assert.equal(dsl4ActionContextManifest.id, actionContext.extensionId);
  assert.deepEqual(opcodes(dsl4ActionContextManifest), actionContext.opcodes);
  assert.equal(
    (dsl4ActionContextDefaultFeatureFlags as Record<string, boolean>)[actionContext.featureFlag],
    actionContext.defaultEnabled,
  );

  assert.equal(dsl4StructuredDataStandaloneManifest.id, structuredDataStandalone.extensionId);
  assert.deepEqual(opcodes(dsl4StructuredDataStandaloneManifest), structuredDataStandalone.opcodes);
  assert.equal(
    (dsl4StructuredDataDefaultFeatureFlags as Record<string, boolean>)[
      structuredDataStandalone.featureFlag
    ],
    structuredDataStandalone.defaultEnabled,
  );

  assert.equal(dsl4StructuredDataDeveloperManifest.id, structuredDataDebug.extensionId);
  assert.deepEqual(opcodes(dsl4StructuredDataDeveloperManifest), structuredDataDebug.opcodes);
  assert.equal(
    (dsl4StructuredDataDefaultFeatureFlags as Record<string, boolean>)[
      structuredDataDebug.featureFlag
    ],
    structuredDataDebug.defaultEnabled,
  );

  for (const surface of [actionContext, structuredDataStandalone, structuredDataDebug]) {
    assert.equal(surface.registeredInStandard, false);
    assert.equal(surface.defaultEnabled, false);
  }
});

test('uses distinct extension IDs and no TurboWarp extension for the preview host', () => {
  const extensionIds = [
    contract.standardRuntime.extensionId,
    ...Object.values<ContractSurface>(contract.optionalSurfaces)
      .map((surface) => surface.extensionId)
      .filter(Boolean),
  ];
  assert.equal(new Set(extensionIds).size, extensionIds.length);
  assert.equal(contract.optionalSurfaces.developmentPreviewHost.extensionId, null);
  assert.equal(contract.optionalSurfaces.developmentPreviewHost.production, false);
});

test('freezes zero-author-block, bounded-shell, and no-list budgets', () => {
  assert.deepEqual(contract.budgets, {
    requiredAuthorBlocks: 0,
    fixedDslConnectionBlocks: 30,
    stageBlocks: 150,
    nonStageBlocksPerTarget: 20,
    targetProjectBlocks: 350,
    maximumProjectBlocks: 500,
    customHandlerOverheadBlocks: 8,
    stageGlobalVariables: 16,
    localVariablesPerTarget: 4,
    projectVariables: 32,
    scratchLists: 0,
    broadcasts: 16,
  });
  assert.ok(contract.budgets.targetProjectBlocks <= contract.budgets.maximumProjectBlocks);
});

test('excludes preview UI and optional palettes from Standard production surfaces', () => {
  const productionSurfaces = Object.values<ContractSurface>(contract.surfaces).filter(
    (surface) => surface.productionArtifact,
  );
  assert.ok(productionSurfaces.length > 0);
  assert.ok(productionSurfaces.every((surface) => surface.previewUi === false));

  const optionalIds = Object.values<ContractSurface>(contract.optionalSurfaces)
    .filter((surface) => surface.extensionId && !surface.registeredInStandard)
    .map((surface) => surface.extensionId);
  assert.deepEqual(contract.standardProductionForbidden.extensionIds, optionalIds);
  assert.ok(contract.standardProductionForbidden.persistedFields.length > 0);
});
