import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {
  auditDsl4AssetDistribution,
  createDsl4AssetDistributionAudit,
  createDsl4ProductionSourceFrontend,
  formatDsl4AssetDistributionAudit,
  loadDsl4AssetAuditInputs,
  Sb3BuilderError,
  serializeDsl4AssetDistributionAudit,
} from '../src/builder/index.js';
import {createDsl4SourceFrontend} from '../src/dsl4/index.js';
import {thrown} from './helpers/thrown-error.ts';
import {requireDefined, requireRecord, requireString} from './helpers/require-value.ts';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const storySchema = JSON.parse(
  await readFile(path.join(repositoryRoot, 'schema', 'dsl-4.schema.json'), 'utf8'),
);
const sourceFrontend = createDsl4SourceFrontend(storySchema);
const productionFrontend = createDsl4ProductionSourceFrontend(storySchema);
const hash = (digit: string) => `sha256-${digit.repeat(64)}`;

const source = [
  "kamishibai: '4.0'",
  'assets:',
  '  Logo: backdrop',
  '  Narration:',
  '    kind: sound',
  '    file: assets/narration.mp3',
  '    loading: lazy',
  '  Chime:',
  '    kind: sound',
  '    file: assets/chime.mp3',
  '    loading: lazy',
  '  RescuePose:',
  '    kind: recognitionModel',
  '    file: models/rescue',
  'scenes:',
  '  opening:',
  '    recognitionModel: RescuePose',
  '    actions:',
  '      - sound: Narration',
  '      - sound: Chime',
].join('\n');

function storyDocument() {
  const parsed = sourceFrontend.parse(source, {sourceId: 'asset-audit-test'});
  assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
  return parsed.storyDocument;
}

function config() {
  return {
    formatVersion: 1,
    profiles: {
      offline: {network: 'forbidden', defaultDelivery: 'embedded'},
      online: {
        network: 'allowed',
        defaultDelivery: 'remote',
        kinds: {backdrop: 'embedded'},
        assets: {Narration: 'embedded'},
      },
    },
    providers: {
      Chime: {remote: {url: 'https://cdn.example.com/audio/chime.mp3'}},
      Narration: {remote: {url: 'https://cdn.example.com/audio/narration.mp3'}},
      RescuePose: {remote: {url: 'https://cdn.example.com/models/rescue.zip'}},
    },
  };
}

function lock() {
  return {
    formatVersion: 1,
    assets: {
      Logo: {
        kind: 'backdrop',
        contentIntegrity: hash('1'),
        contentType: 'image/svg+xml',
        size: 100,
        providers: {embedded: {name: 'Logo'}},
      },
      Narration: {
        kind: 'sound',
        contentIntegrity: hash('2'),
        contentType: 'audio/mpeg',
        size: 400,
        providers: {
          embedded: {file: 'assets/narration.mp3'},
          remote: {
            url: 'https://cdn.example.com/audio/narration.mp3',
            transportIntegrity: hash('2'),
            contentType: 'audio/mpeg',
            size: 400,
          },
        },
      },
      Chime: {
        kind: 'sound',
        contentIntegrity: hash('2'),
        contentType: 'audio/mpeg',
        size: 400,
        providers: {
          embedded: {file: 'assets/chime.mp3'},
          remote: {
            url: 'https://cdn.example.com/audio/chime.mp3',
            transportIntegrity: hash('2'),
            contentType: 'audio/mpeg',
            size: 400,
          },
        },
      },
      RescuePose: {
        kind: 'recognitionModel',
        contentIntegrity: hash('3'),
        contentType: 'application/vnd.tm.pose-model',
        size: 1000,
        providers: {
          embedded: {file: 'models/rescue'},
          remote: {
            url: 'https://cdn.example.com/models/rescue.zip',
            transportIntegrity: hash('4'),
            contentType: 'application/zip',
            size: 700,
          },
        },
      },
    },
  };
}

/**
 * The audit report members these cases assert on.
 *
 * The audit is a JSON report the CLI prints; its shape is the contract this suite pins, so it is
 * declared here rather than narrowed at each assertion.
 */
interface AuditReport {
  profile: string;
  network: string;
  offlineReady: boolean;
  totals: unknown;
  byKind: Record<string, {assets: number} | undefined>;
  preparation: {startup: {ids: string[]}};
  scenes: Record<
    string,
    | {
        all: {ids: string[]};
        eager: {ids: string[]};
        lazy: {ids: string[]};
        background: {ids: string[]};
        sceneRetained: {ids: string[]};
      }
    | undefined
  >;
  duplicates: unknown;
  assets: {id: string; kind: string}[];
}

function auditReport(audit: unknown): AuditReport {
  return requireRecord(audit, 'the audit report') as unknown as AuditReport;
}

function assertAuditShape(audit: AuditReport) {
  assert.equal(audit.profile, 'online');
  assert.equal(audit.network, 'allowed');
  assert.equal(audit.offlineReady, false);
  assert.deepEqual(audit.totals, {
    assets: 4,
    logicalBytes: 1900,
    embedded: {assets: 2, logicalBytes: 500},
    remote: {assets: 2, logicalBytes: 1400, transportBytes: 1100},
    eager: {
      assets: 2,
      logicalBytes: 1100,
      embedded: {assets: 1, logicalBytes: 100},
      remote: {assets: 1, logicalBytes: 1000, transportBytes: 700},
    },
    lazy: {
      assets: 2,
      logicalBytes: 800,
      embedded: {assets: 1, logicalBytes: 400},
      remote: {assets: 1, logicalBytes: 400, transportBytes: 400},
    },
  });
  assert.equal(requireDefined(audit.byKind.sound, 'the sound totals').assets, 2);
  // The recognition model loads in the background of its scene, not at startup.
  assert.deepEqual(audit.preparation.startup.ids, ['Logo']);
  assert.deepEqual(requireDefined(audit.scenes.opening, 'the opening scene').all.ids, [
    'Chime',
    'Narration',
    'RescuePose',
  ]);
  assert.deepEqual(requireDefined(audit.scenes.opening, 'the opening scene').eager.ids, []);
  assert.deepEqual(requireDefined(audit.scenes.opening, 'the opening scene').background.ids, [
    'RescuePose',
  ]);
  assert.deepEqual(requireDefined(audit.scenes.opening, 'the opening scene').lazy.ids, [
    'Chime',
    'Narration',
  ]);
  assert.deepEqual(requireDefined(audit.scenes.opening, 'the opening scene').sceneRetained.ids, [
    'RescuePose',
  ]);
  assert.deepEqual(audit.duplicates, {
    groups: [
      {
        contentIntegrity: hash('2'),
        assetIds: ['Chime', 'Narration'],
        logicalBytes: 400,
        savingsBytes: 400,
      },
    ],
    savingsBytes: 400,
  });
}

async function withProject<T>(callback: (fixture: AuditFixture) => Promise<T> | T): Promise<T> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsl4-asset-audit-'));
  const sourceManifest = path.join(directory, 'project.source.yml');
  const assetConfig = path.join(directory, 'project.assets.json');
  const assetLock = path.join(directory, 'project.assets.lock.json');
  try {
    await Promise.all([
      writeFile(path.join(directory, 'story.kamishibai.yaml'), `${source}\n`),
      writeFile(
        sourceManifest,
        'formatVersion: 1\nmode: external\nsourceId: main\npath: story.kamishibai.yaml\n',
      ),
      writeFile(assetConfig, `${JSON.stringify(config())}\n`),
      writeFile(assetLock, `${JSON.stringify(lock())}\n`),
    ]);
    return await callback({directory, sourceManifest, assetConfig, assetLock});
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
}

/** The paths one audit fixture writes into a temporary project. */
interface AuditFixture {
  directory: string;
  sourceManifest: string;
  assetConfig: string;
  assetLock: string;
}

function auditOptions(fixture: AuditFixture) {
  return {
    projectRoot: fixture.directory,
    sourceManifest: fixture.sourceManifest,
    assetConfig: fixture.assetConfig,
    assetLock: fixture.assetLock,
    assetProfile: 'online',
    sourceFrontend: productionFrontend,
    maxSourceBytes: 16 * 1024,
    maxSourceManifestBytes: 4096,
    maxAssetConfigBytes: 16 * 1024,
    maxAssetLockBytes: 32 * 1024,
  };
}

test('creates a deterministic redacted distribution and lifecycle audit without I/O', () => {
  const audit = createDsl4AssetDistributionAudit({
    storyDocument: storyDocument(),
    config: config(),
    lock: lock(),
    profile: 'online',
  });
  assertAuditShape(auditReport(audit));
  assert.equal(Object.isFrozen(audit), true);

  const serialized = serializeDsl4AssetDistributionAudit(audit);
  assert.equal(serialized.endsWith('\n'), true);
  assert.equal(serialized.includes('https://'), false);
  assert.equal(serialized.includes('assets/narration.mp3'), false);
  assert.equal(serialized.includes(repositoryRoot), false);
  const pretty = formatDsl4AssetDistributionAudit(audit);
  assert.match(pretty, /Remote: 2 \(1400 logical bytes; 1100 transport bytes\)/u);
  assert.match(pretty, /Scene opening: 3 assets/u);
  assert.equal(pretty.includes('https://'), false);

  const offline = createDsl4AssetDistributionAudit({
    storyDocument: storyDocument(),
    config: config(),
    lock: lock(),
    profile: 'offline',
  });
  assert.equal(offline.offlineReady, true);
  assert.equal(offline.totals.remote.assets, 0);
  assert.equal(
    offline.assets.every(({delivery}) => delivery === 'embedded'),
    true,
  );
});

test('loads bounded project snapshots and audits a real DSL source without network access', async () => {
  await withProject(async (fixture) => {
    const inputs = await loadDsl4AssetAuditInputs({
      ...auditOptions(fixture),
      maxSourceManifestBytes: 4096,
      maxAssetConfigBytes: 16 * 1024,
      maxAssetLockBytes: 32 * 1024,
    });
    assert.equal(inputs.sourceManifest.path, 'story.kamishibai.yaml');
    assert.equal(Object.isFrozen(inputs), true);

    const audit = await auditDsl4AssetDistribution(auditOptions(fixture));
    assertAuditShape(auditReport(audit));
  });
});

test('audits an included source graph only with explicit finite graph limits', async () => {
  await withProject(async (fixture) => {
    const lines = source.split('\n');
    const assetsStart = lines.indexOf('assets:');
    const scenesStart = lines.indexOf('scenes:');
    await Promise.all([
      writeFile(
        path.join(fixture.directory, 'story.kamishibai.yaml'),
        ['include: chapter.k4.yml', "kamishibai: '4.0'", ...lines.slice(scenesStart), ''].join(
          '\n',
        ),
      ),
      writeFile(
        path.join(fixture.directory, 'chapter.k4.yml'),
        [...lines.slice(assetsStart, scenesStart), ''].join('\n'),
      ),
    ]);

    await assert.rejects(auditDsl4AssetDistribution(auditOptions(fixture)));
    const audit = await auditDsl4AssetDistribution({
      ...auditOptions(fixture),
      sourceIncludesEnabled: true,
      maxSourceFiles: 8,
      maxTotalSourceBytes: 32 * 1024,
      maxIncludeDepth: 4,
    });
    assertAuditShape(auditReport(audit));
  });
});

test('rejects oversized, linked, or unstable project JSON snapshots without path disclosure', async () => {
  await withProject(async (fixture) => {
    await assert.rejects(
      loadDsl4AssetAuditInputs({
        ...auditOptions(fixture),
        maxSourceManifestBytes: 4096,
        maxAssetConfigBytes: 8,
        maxAssetLockBytes: 32 * 1024,
      }),
      (error) => {
        assert.equal(error instanceof Sb3BuilderError, true);
        assert.equal(thrown(error).code, 'K4-ASSET-PROFILE-001');
        assert.equal(
          requireString(thrown(error).message, 'the message').includes(fixture.directory),
          false,
        );
        return true;
      },
    );

    const linkedConfig = path.join(fixture.directory, 'linked.assets.json');
    await symlink(fixture.assetConfig, linkedConfig);
    await assert.rejects(
      loadDsl4AssetAuditInputs({
        ...auditOptions(fixture),
        assetConfig: linkedConfig,
      }),
      (error) => {
        assert.equal(thrown(error).code, 'K4-ASSET-PROFILE-001');
        assert.match(requireString(thrown(error).message, 'the message'), /symbolic link/u);
        assert.equal(
          requireString(thrown(error).message, 'the message').includes(fixture.directory),
          false,
        );
        return true;
      },
    );

    let configReads = 0;
    await assert.rejects(
      loadDsl4AssetAuditInputs({
        ...auditOptions(fixture),
        readFile: async (filePath) => {
          const bytes = await readFile(filePath);
          if (
            path.basename(filePath) === path.basename(fixture.assetConfig) &&
            ++configReads === 2
          ) {
            return Buffer.concat([bytes, Buffer.from(' ')]);
          }
          return bytes;
        },
      }),
      (error) => {
        assert.equal(thrown(error).code, 'K4-ASSET-PROFILE-001');
        assert.match(
          requireString(thrown(error).message, 'the message'),
          /changed while it was being read/u,
        );
        return true;
      },
    );
  });
});
