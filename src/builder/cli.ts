import {migrateDsl4EmbeddedYamlFile} from './dsl4-embedded-yaml-migrate.js';
import {dsl4StandardProductionFeatureFlags} from '../dsl4/feature-flags.js';
import {readDsl4NarrativeRuntimeExtensionSource} from './dsl4-playback-runtime-source.js';
import {lstat, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {
  convertDsl32File,
  Dsl32ConversionError,
  formatConversionDiagnostic,
} from '../converter/index.js';
import {dsl4BrowserPreviewArtifactLimits} from '../dsl4/browser-preview-artifact-limits.js';
import {packageVersion} from './constants.js';
import {dsl4CliDefaultLimits} from './dsl4-cli-default-limits.js';
import {runDsl4LocalPreviewCommand} from './dsl4-local-preview-command.js';
import {auditDsl4ProjectDefinitions, formatDsl4DefinitionAudit} from './dsl4-definition-audit.js';
import {dsl4LocalPreviewBrowserBootstrapMaximums} from './dsl4-local-preview-browser-bootstrap.js';
import {createDsl4ProductionSourceFrontend} from './dsl4-source-frontend.js';
import {
  Dsl4BlockSourceExportError,
  exportDsl4BlockSourcesToYaml,
  formatDsl4BlockSourceExportFailure,
} from './dsl4-block-source-export.js';
import {authorDsl4BlockSourceGraphSb3} from './dsl4-block-source-author.js';
import {loadDsl4BuildSourceGraph} from './dsl4-source-graph.js';
import {dsl4SourceGraphDefaultLimits} from '../dsl4/source-graph.js';
import {
  formatDsl4Diagnostic,
  serializeDsl4CanonicalDocument,
  serializeDsl4ValidationResult,
  validateDsl4SourceFile,
} from './dsl4-validate.js';
import {Sb3BuilderError} from './errors.js';
import {readSb3, serializeSb3} from './sb3.js';
import {describeSb3SaveFormats, normalizeSb3SaveSelection} from './sb3-save-format.js';
import {verifySb3ExtensionUrls, writeSb3ExtensionFormat} from './sb3-extension-format.js';
import {
  auditDsl4AssetDistribution,
  buildDsl4RuntimeComponentFile,
  buildSb3Bundle,
  convertDsl4ProjectAssets,
  formatDsl4AssetDistributionAudit,
  generateDsl4AssetDistributionLockFile,
  serializeDsl4AssetDistributionAudit,
  vendorDsl4AssetDistribution,
} from './index.js';

const dsl4SchemaUrl = new URL('../../schema/dsl-4.schema.json', import.meta.url);

export {dsl4CliDefaultLimits} from './dsl4-cli-default-limits.js';

const dsl4CliDefaultLimitOptions = Object.freeze({
  '--max-source-bytes': dsl4CliDefaultLimits.maxSourceBytes,
  '--max-asset-file-bytes': dsl4CliDefaultLimits.maxAssetFileBytes,
  '--max-asset-files': dsl4CliDefaultLimits.maxAssetFiles,
  '--max-total-asset-bytes': dsl4CliDefaultLimits.maxTotalAssetBytes,
});

function resolveDsl4CliDefaultLimit(
  values: Map<string, string>,
  option: keyof typeof dsl4CliDefaultLimitOptions,
) {
  const value = Number(values.get(option) ?? dsl4CliDefaultLimitOptions[option]);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Sb3BuilderError(`${option} must be an integer >= 1.`, {stage: 'cli'});
  }
  if (option === '--max-source-bytes' && value > dsl4CliDefaultLimits.maxSourceBytes) {
    throw new Sb3BuilderError(
      `--max-source-bytes must be <= ${dsl4CliDefaultLimits.maxSourceBytes}.`,
      {stage: 'cli'},
    );
  }
  return value;
}

function parseCliFlagAndValueOptions(
  arguments_: string[],
  {flagOptions, valueOptions}: {flagOptions: Set<string>; valueOptions: Set<string>},
) {
  const values = new Map();
  const flags = new Set();
  for (let index = 0; index < arguments_.length; index += 1) {
    // The loop is bounded by the argument count, so the empty string is unreachable; it would
    // be rejected as an unknown option like any other unexpected argument.
    const option = arguments_[index] ?? '';
    if (flagOptions.has(option)) {
      if (flags.has(option)) {
        throw new Sb3BuilderError(`Duplicate option: ${option}`, {stage: 'cli'});
      }
      flags.add(option);
      continue;
    }
    if (!valueOptions.has(option)) {
      throw new Sb3BuilderError(`Unknown option: ${option}`, {stage: 'cli'});
    }
    const value = arguments_[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Sb3BuilderError(`${option} requires a value.`, {stage: 'cli'});
    }
    if (values.has(option)) {
      throw new Sb3BuilderError(`Duplicate option: ${option}`, {stage: 'cli'});
    }
    values.set(option, value);
    index += 1;
  }
  return {flags, values};
}

function requireCliValueOptions(values: Map<string, string>, requiredOptions: Iterable<string>) {
  for (const required of requiredOptions) {
    if (!values.has(required)) {
      throw new Sb3BuilderError(`Missing required option: ${required}`, {stage: 'cli'});
    }
  }
}

function readCliInteger(values: Map<string, string>, option: string, minimum: number) {
  const value = Number(values.get(option));
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Sb3BuilderError(`${option} must be an integer >= ${minimum}.`, {stage: 'cli'});
  }
  return value;
}

export function usage() {
  return `Usage:
  turbowarp-kamishibai build-sb3 --base BASE.sb3 --script SOURCE.txt \\
    --assets assets.lock.json --output dist/sample --profile editor [options]

  turbowarp-kamishibai build-dsl4 --base BASE.sb3 --project-root DIR \\
    --output dist/story.sb3 --control-profile production --channel bundled \\
    [--source STORY.k4.yml] [--source-id ID] \\
    [--source-manifest project.source.yml] \\
    [--asset-config FILE --asset-lock FILE --asset-profile PROFILE \\
     --max-asset-config-bytes N --max-asset-lock-bytes N] \\
    [--max-project-bytes N] [--max-project-json-bytes N] \\
    [--distribution-profile source|compiled] [--embedded-source-documents] [options]

  turbowarp-kamishibai migrate-embedded-yaml --input OLD.sb3 --output NEW.sb3 \\
    [--entry-file story.k4.yml] [--report REPORT.json] [--document-map PATHS.json]

  turbowarp-kamishibai save-sb3-format --input IN.sb3 --output OUT.sb3 \\
    [--extensions remote-non-cacheable|remote-cacheable|embedded-file|embedded-data] \\
    [--keep-embedded-data] \\
    [--extension-urls URLS.json] [--skip-url-check] [--unsandboxed-extensions ID,ID] \\
    [--source FORMAT] [--assets FORMAT] [--assets-as-project-assets] \\
    [--max-input-bytes N]
    Writable today: ${describeSb3SaveFormats()}. An option left unset keeps that payload as it is.
    Only embedded-data, or --keep-embedded-data beside another form, loads in a standard
    TurboWarp host; every form keeps the Manifest, so a Plus host always has the digest.
    The two remote forms differ in whether the opener's browser may keep a copy, which the
    author decides: non-cacheable forbids one, cacheable permits one the opener may decline.
    Neither remote form keeps a copy here. A copy lives in a viewer's browser cache, which no
    command can reach, so a remote-cacheable output is not grounds for offline use: the copy
    appears only once someone opens the work and does not decline it. Only the embedded forms
    put the bytes in the SB3 itself.
    Going from a remote form to a carried one fetches the URL and refuses anything but the
    pinned bytes. --skip-url-check skips the confirmation that a recorded URL still serves
    them, for a URL that is not published yet; it cannot skip a fetch that is the only way to
    obtain the bytes at all.

  turbowarp-kamishibai convert-dsl4 --input SOURCE.txt \\
    --output STORY.k4.yml [--pose-models REPLACEMENTS.json]

  turbowarp-kamishibai convert-dsl4-assets --project-root DIR \\
    [--source STORY.k4.yml] [--source-id ID] \\
    [--source-manifest project.source.yml] --base BASE.sb3 \\
    --output-dir converted --to local|remote|project \\
    --max-source-manifest-bytes N \\
    --max-remote-map-bytes N --max-base-sb3-bytes N \\
    --timeout-ms N --max-redirects N \\
    [--asset ASSET_ID] [--remote-map FILE | \\
     --rsync-destination USER@HOST:/PATH --remote-base-url HTTPS_URL] \\
    [--rsync-ssh-port N] [--rsync-timeout-ms N] \\
    [--allow-host HOST] [--output-name NAME]

  turbowarp-kamishibai validate-dsl4 --input STORY.k4.yml \\
    [--format pretty|json|canonical-json]

  turbowarp-kamishibai audit-dsl4-definitions --input STORY.k4.yml|PROJECT.sb3 \\
    [--base BASE.sb3] [--project-root DIR] [--control-profile NAME] \\
    [--format pretty|json] [--remove-unused --output-dir NEW_DIR]

  turbowarp-kamishibai author-block-dsl --input STORY.k4.yml --base BASE.sb3 \\
    --output project-blocks.sb3 [--max-source-bytes N] \\
    [--max-source-files N] [--max-total-source-bytes N] [--max-include-depth N]

  turbowarp-kamishibai export-block-dsl --input PROJECT.sb3 --output-dir dist \\
    [--name NAME] [--format pretty|json] [--max-source-files N] \\
    [--max-total-source-bytes N] [--max-include-depth N]

  turbowarp-kamishibai audit-dsl4-assets --project-root DIR \\
    [--source STORY.k4.yml] [--source-id ID] \\
    [--source-manifest project.source.yml] \\
    --asset-config project.assets.json --asset-lock project.assets.lock.json \\
    --asset-profile PROFILE --max-source-manifest-bytes N \\
    --max-asset-config-bytes N \\
    --max-asset-lock-bytes N [--format pretty|json] [options]

  turbowarp-kamishibai lock-dsl4-assets --project-root DIR \\
    [--source STORY.k4.yml] [--source-id ID] \\
    [--source-manifest project.source.yml] --asset-config project.assets.json \\
    --output project.assets.lock.json --allow-host HOST [options]

  turbowarp-kamishibai vendor-dsl4-assets --project-root DIR \\
    --asset-config project.assets.json --asset-lock project.assets.lock.json \\
    --output-config project.assets.offline.json --output-lock project.assets.offline.lock.json \\
    --allow-host HOST [options]

  turbowarp-kamishibai preview-dsl4 --watch --base BASE.sb3 --project-root DIR \\
    --control-profile production --channel bundled \\
    [--source STORY.k4.yml] [--source-id ID] \\
    [--source-manifest project.source.yml] [options]

DSL 3.1/3.2 build-sb3 options:
  --allow-file-root DIR   Allow file: assets below DIR (repeatable)
  --allow-http            Permit plain HTTP assets (HTTPS is the default)
  --timeout-ms N          Per-request timeout in milliseconds
  --max-asset-bytes N     Maximum bytes per asset
  --max-script-bytes N    Maximum embedded script bytes
  --max-redirects N       Maximum HTTP redirects

Standard DSL 4.0 narrative controls (enabled by default):
  --narrative-control            Compatibility alias for the Standard narrative capability

DSL 4.0 build-dsl4 options:
  --enable-source-includes       Enable multi-file include processing
  --enable-root-binary-entries  Package DSL assets as root content-addressed ZIP entries
  --max-source-files N          Maximum files in the include graph
  --max-total-source-bytes N    Maximum graph total and composed source bytes
  --max-include-depth N         Maximum include graph depth
  --history-navigation-available  Permit a selected history.* keymap
  --replace-existing              Replace a same-channel component in the base SB3
  --asset-config FILE             Asset distribution config (requires lock and profile)
  --asset-lock FILE               Asset distribution lock (requires config and profile)
  --asset-profile PROFILE         Explicit asset distribution profile
  --max-asset-config-bytes N      Maximum asset config bytes
  --max-asset-lock-bytes N        Maximum asset lock bytes
  --distribution-profile PROFILE  source (default) keeps the YAML; compiled stores only the
                                  validated Story IR (source omission, not secrecy)

DSL 4.0 preview-dsl4 options:
  --watch                         Keep watching the selected source (required)
  --enable-source-includes        Enable transactional Source Graph watching
  --max-source-files N            Maximum files in the include graph
  --max-total-source-bytes N      Maximum graph total and composed source bytes
  --max-include-depth N           Maximum include graph depth
  --max-project-bytes N           Maximum compressed preview SB3 bytes
  --max-project-json-bytes N      Maximum expanded project.json bytes
  --allow-large-preview-artifacts Acknowledge memory risk above recommended limits
  --port N                        Loopback port; 0 lets the OS select one (default)
  --replace-existing              Replace a same-channel component in the base SB3

DSL 4.0 common limit options (when supported):
  --max-source-bytes N       Maximum source bytes (default: 1048576)
  --max-asset-file-bytes N   Maximum bytes per asset file (default: 16777216)
  --max-asset-files N        Maximum asset files/pose entries (default: 256)
  --max-total-asset-bytes N  Maximum total asset bytes (default: 134217728)

Omit these four options for normal projects. The source limit is the current fixed
canonical maximum. Review memory, disk, and network impact before raising asset limits;
browser preview currently caps source bytes and asset files at their defaults.

DSL 4.0 project source options (when supported):
  --source FILE             Override the root-level entry source
  --source-id ID            Override the diagnostic source ID (default: main)
  --source-manifest FILE    Use an explicit manifest; otherwise discover one

Without an explicit source, the CLI uses the manifest path or the only root-level
*.k4.yml file. Zero or multiple candidates fail instead of choosing a fixed filename.

convert-dsl4 options:
  --pose-models FILE      Optionally embed exact TMPoseURL values as local poseModel assets

convert-dsl4-assets options:
  --asset ASSET_ID             Convert one asset (repeatable; omitted means all assets)
  --to local|remote|project    Destination representation
  --remote-map FILE            JSON map of asset IDs to verified remote source metadata
  --rsync-destination TARGET   rsync SSH target in safe [user@]host:/absolute/path form
  --remote-base-url URL        Public HTTPS directory URL corresponding to the rsync target
  --rsync-ssh-port N           SSH port for rsync (default: 22)
  --rsync-timeout-ms N         Overall rsync timeout (default: --timeout-ms)
  --allow-host HOST            Allowed HTTPS hostname for downloads (repeatable)
  --output-dir DIR             New reusable project root with manifest, YAML, SB3, and assets
  --output-name NAME           Output filename stem (defaults to the input story name)
  --max-remote-map-bytes N     Maximum remote mapping JSON bytes
  --max-base-sb3-bytes N       Maximum input SB3 bytes

audit-dsl4-definitions options:
  --base FILE                SB3 used to resolve implicit project assets for YAML input
  --project-root DIR         Root of the source include graph (default: input directory)
  --control-profile NAME     Check an externally selected control profile
  --remove-unused            Remove proven unused asset/actor/textStyle/variable definitions
  --output-dir DIR           Fresh directory for cleaned YAML; input files are preserved
  --format pretty|json       Audit output (default: pretty)
  --max-source-bytes N       Maximum bytes per source (default: 1048576)
  --max-source-files N       Maximum source files (default: 64)
  --max-total-source-bytes N  Maximum graph bytes (default: 4194304)
  --max-include-depth N      Maximum include depth (default: 32)
  --max-project-bytes N      Maximum input SB3 bytes (default: 536870912)

validate-dsl4 options:
  --narrative-control        Enable Standard narrative controls (default ON).
  --no-narrative-control     Disable narrative controls for compatibility checks.
  --format FORMAT         Diagnostic output: pretty (default) or json.
                          canonical-json prints the canonical story document instead,
                          with mapping keys sorted so two frontends that agree on the
                          meaning print the same bytes.

author-block-dsl options:
  --block-sections true|false    Show the source-section on/off block (default false).
  --max-source-bytes N          Maximum bytes per source (default: 1048576)
  --max-source-files N          Maximum files in the include graph (default: 64)
  --max-total-source-bytes N    Maximum graph total bytes (default: 4194304)
  --max-include-depth N         Maximum include graph depth (default: 32)

export-block-dsl options:
  --name NAME                   Work name for the root YAML and the ZIP package
                                (defaults to the input SB3 filename stem)
  --format FORMAT               Report output: pretty (default) or json
  --max-source-files N          Maximum files in the include graph
  --max-total-source-bytes N    Maximum graph total and composed source bytes
  --max-include-depth N         Maximum include graph depth

audit-dsl4-assets options:
  --enable-source-includes       Enable multi-file include processing
  --max-source-files N          Maximum files in the include graph
  --max-total-source-bytes N    Maximum total bytes in the include graph
  --max-include-depth N         Maximum include graph depth
  --format FORMAT               Audit output: pretty (default) or json

lock-dsl4-assets options:
  --allow-host HOST             Allowed HTTPS remote hostname (repeatable)
  --timeout-ms N                Per-request timeout in milliseconds
  --max-redirects N             Maximum HTTPS redirects
  --max-asset-file-bytes N      Maximum bytes per local or remote asset
  --max-asset-files N           Maximum local/expanded pose entries
  --max-total-asset-bytes N     Maximum total inspected bytes

vendor-dsl4-assets options:
  --vendor-dir DIR              Project-relative content-addressed mirror root
  --allow-host HOST             Allowed HTTPS remote hostname (repeatable)
  --timeout-ms N                Per-request timeout in milliseconds
  --max-redirects N             Maximum HTTPS redirects
  --max-asset-config-bytes N    Maximum input config bytes
  --max-asset-lock-bytes N      Maximum input lock bytes
  --max-asset-file-bytes N      Maximum bytes per remote asset
  --max-asset-files N           Maximum vendored files/pose entries
  --max-total-asset-bytes N     Maximum total downloaded bytes

General options:
  --help                  Show this help
  --version               Show the package version

build-sb3 takes an output basename and writes .sb3, .txt, and .manifest.json.
build-dsl4 writes one self-contained SB3 after revalidating the disk candidate.
preview-dsl4 builds a development-only browser runtime in memory, opens the system
browser, and reports success only after the authenticated runtime-ready acknowledgement.
validate-dsl4 uses the production canonicalizer, schema, semantics, and diagnostics. Its json
envelope carries diagnostics only; canonical-json prints the story document for comparing two
source frontends and is written only when the source is valid.
export-block-dsl reads the DSL declaration hats embedded in an SB3, sends them through the Block
frontend, Source Graph, and the same schema and semantic validation a YAML project gets, and only
then serializes YAML. A story without includes becomes one NAME.k4.yml; a story with includes
becomes NAME-k4.zip holding NAME-k4/ with the root and every referenced module. Every Sprite that
declares a DSL source must be reachable through an include. Invalid block sources fail with
source-located diagnostics instead of writing plausible YAML.
audit-dsl4-assets resolves a frozen asset lock without network access or file writes.
lock-dsl4-assets fetches only allowlisted HTTPS providers and atomically writes a canonical lock.
vendor-dsl4-assets fetches and verifies lock providers, then atomically installs a content-addressed
mirror and generated config/lock files for offline resolution.
convert-dsl4-assets writes one new authoring directory and never overwrites inputs or remote files
outside its content-addressed rsync payload names. It never performs remote deletion.
convert-dsl4 never modifies its DSL 3.2 input and atomically replaces only the
explicitly selected YAML output.`;
}

function parseExportBlockDsl4Arguments(arguments_: string[]): {
  input: string;
  outputDir: string;
  name?: string;
  format: 'pretty' | 'json';
  maxSourceBytes: number;
  maxSourceFiles?: number;
  maxTotalSourceBytes?: number;
  maxIncludeDepth?: number;
} {
  const {values} = parseCliFlagAndValueOptions(arguments_, {
    flagOptions: new Set(),
    valueOptions: new Set([
      '--input',
      '--output-dir',
      '--name',
      '--format',
      '--max-source-bytes',
      '--max-source-files',
      '--max-total-source-bytes',
      '--max-include-depth',
    ]),
  });
  requireCliValueOptions(values, ['--input', '--output-dir']);
  const format = values.get('--format') ?? 'pretty';
  if (format !== 'pretty' && format !== 'json') {
    throw new Sb3BuilderError('--format must be either pretty or json.', {stage: 'cli'});
  }
  const maxSourceBytes = resolveDsl4CliDefaultLimit(values, '--max-source-bytes');
  const maxTotalSourceBytes = values.has('--max-total-source-bytes')
    ? readCliInteger(values, '--max-total-source-bytes', maxSourceBytes)
    : undefined;
  return {
    input: path.resolve(values.get('--input') as string),
    outputDir: path.resolve(values.get('--output-dir') as string),
    ...(values.has('--name') ? {name: values.get('--name') as string} : {}),
    format,
    maxSourceBytes,
    ...(values.has('--max-source-files')
      ? {maxSourceFiles: readCliInteger(values, '--max-source-files', 1)}
      : {}),
    ...(maxTotalSourceBytes === undefined ? {} : {maxTotalSourceBytes}),
    ...(values.has('--max-include-depth')
      ? {maxIncludeDepth: readCliInteger(values, '--max-include-depth', 1)}
      : {}),
  };
}

function parseAuthorBlockDsl4Arguments(arguments_: string[]): {
  input: string;
  base: string;
  output: string;
  sourceSections: boolean;
  maxSourceBytes: number;
  maxTotalSourceBytes: number;
  maxSourceFiles: number;
  maxIncludeDepth: number;
} {
  const values = new Map<string, string>();
  const allowed = new Set([
    '--input',
    '--base',
    '--output',
    '--max-source-bytes',
    '--block-sections',
    '--max-total-source-bytes',
    '--max-source-files',
    '--max-include-depth',
  ]);
  for (let index = 0; index < arguments_.length; index += 2) {
    const option = arguments_[index] ?? '';
    const value = arguments_[index + 1];
    if (!allowed.has(option)) {
      throw new Sb3BuilderError(`Unknown option: ${option}`, {stage: 'cli'});
    }
    if (!value || value.startsWith('--')) {
      throw new Sb3BuilderError(`${option} requires a value.`, {stage: 'cli'});
    }
    if (values.has(option)) {
      throw new Sb3BuilderError(`Duplicate option: ${option}`, {stage: 'cli'});
    }
    values.set(option, value);
  }
  for (const required of ['--input', '--base', '--output']) {
    if (!values.has(required)) {
      throw new Sb3BuilderError(`Missing required option: ${required}`, {stage: 'cli'});
    }
  }
  const sectionMode = values.get('--block-sections') ?? 'false';
  if (!['true', 'false'].includes(sectionMode)) {
    throw new Sb3BuilderError('--block-sections must be true or false.', {stage: 'cli'});
  }
  return {
    sourceSections: sectionMode === 'true',
    input: path.resolve(values.get('--input') as string),
    base: path.resolve(values.get('--base') as string),
    output: path.resolve(values.get('--output') as string),
    maxSourceBytes: resolveDsl4CliDefaultLimit(values, '--max-source-bytes'),
    maxTotalSourceBytes: values.has('--max-total-source-bytes')
      ? readCliInteger(
          values,
          '--max-total-source-bytes',
          resolveDsl4CliDefaultLimit(values, '--max-source-bytes'),
        )
      : dsl4SourceGraphDefaultLimits.maxTotalSourceBytes,
    maxSourceFiles: values.has('--max-source-files')
      ? readCliInteger(values, '--max-source-files', 1)
      : dsl4SourceGraphDefaultLimits.maxSourceFiles,
    maxIncludeDepth: values.has('--max-include-depth')
      ? readCliInteger(values, '--max-include-depth', 1)
      : dsl4SourceGraphDefaultLimits.maxIncludeDepth,
  };
}

function parseValidateDsl4Arguments(arguments_: string[]): {
  input: string;
  format: 'pretty' | 'json' | 'canonical-json';
  maxSourceBytes: number;
} {
  const values = new Map();
  const allowed = new Set(['--input', '--format', '--max-source-bytes']);
  for (let index = 0; index < arguments_.length; index += 2) {
    // The loop is bounded by the argument count, so the empty string is unreachable; it would
    // be rejected as an unknown option like any other unexpected argument.
    const option = arguments_[index] ?? '';
    const value = arguments_[index + 1];
    if (!allowed.has(option)) {
      throw new Sb3BuilderError(`Unknown option: ${option}`, {stage: 'cli'});
    }
    if (!value || value.startsWith('--')) {
      throw new Sb3BuilderError(`${option} requires a value.`, {stage: 'cli'});
    }
    if (values.has(option)) {
      throw new Sb3BuilderError(`Duplicate option: ${option}`, {stage: 'cli'});
    }
    values.set(option, value);
  }
  for (const required of ['--input']) {
    if (!values.has(required)) {
      throw new Sb3BuilderError(`Missing required option: ${required}`, {stage: 'cli'});
    }
  }
  const maxSourceBytes = resolveDsl4CliDefaultLimit(values, '--max-source-bytes');
  const format = values.get('--format') ?? 'pretty';
  if (format !== 'pretty' && format !== 'json' && format !== 'canonical-json') {
    throw new Sb3BuilderError('--format must be pretty, json, or canonical-json.', {stage: 'cli'});
  }
  return {
    input: path.resolve(values.get('--input') as string),
    format,
    maxSourceBytes,
  };
}

function parseAuditDsl4AssetArguments(arguments_: string[]): {
  projectRoot: string;
  sourceManifest?: string;
  source?: string;
  sourceId?: string;
  assetConfig: string;
  assetLock: string;
  assetProfile: string;
  format: 'pretty' | 'json';
  maxSourceBytes: number;
  maxSourceManifestBytes: number;
  maxAssetConfigBytes: number;
  maxAssetLockBytes: number;
  sourceIncludesEnabled: boolean;
  maxSourceFiles?: number;
  maxTotalSourceBytes?: number;
  maxIncludeDepth?: number;
} {
  const values = new Map();
  const flags = new Set();
  const flagOptions = new Set(['--enable-source-includes']);
  const allowedValueOptions = new Set([
    '--project-root',
    '--source-manifest',
    '--source',
    '--source-id',
    '--asset-config',
    '--asset-lock',
    '--asset-profile',
    '--max-source-bytes',
    '--max-source-manifest-bytes',
    '--max-asset-config-bytes',
    '--max-asset-lock-bytes',
    '--max-source-files',
    '--max-total-source-bytes',
    '--max-include-depth',
    '--format',
  ]);

  for (let index = 0; index < arguments_.length; index += 1) {
    // The loop is bounded by the argument count, so the empty string is unreachable; it would
    // be rejected as an unknown option like any other unexpected argument.
    const option = arguments_[index] ?? '';
    if (flagOptions.has(option)) {
      if (flags.has(option)) {
        throw new Sb3BuilderError(`Duplicate option: ${option}`, {stage: 'cli'});
      }
      flags.add(option);
      continue;
    }
    if (!allowedValueOptions.has(option)) {
      throw new Sb3BuilderError(`Unknown option: ${option}`, {stage: 'cli'});
    }
    const value = arguments_[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Sb3BuilderError(`${option} requires a value.`, {stage: 'cli'});
    }
    if (values.has(option)) {
      throw new Sb3BuilderError(`Duplicate option: ${option}`, {stage: 'cli'});
    }
    values.set(option, value);
    index += 1;
  }

  for (const required of [
    '--project-root',
    '--asset-config',
    '--asset-lock',
    '--asset-profile',
    '--max-source-manifest-bytes',
    '--max-asset-config-bytes',
    '--max-asset-lock-bytes',
  ]) {
    if (!values.has(required)) {
      throw new Sb3BuilderError(`Missing required option: ${required}`, {stage: 'cli'});
    }
  }

  const positiveInteger = (option: string) => {
    const value = Number(values.get(option));
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Sb3BuilderError(`${option} must be an integer >= 1.`, {stage: 'cli'});
    }
    return value;
  };
  const maxSourceBytes = resolveDsl4CliDefaultLimit(values, '--max-source-bytes');
  const maxSourceManifestBytes = positiveInteger('--max-source-manifest-bytes');
  const maxAssetConfigBytes = positiveInteger('--max-asset-config-bytes');
  const maxAssetLockBytes = positiveInteger('--max-asset-lock-bytes');
  const format = values.get('--format') ?? 'pretty';
  if (format !== 'pretty' && format !== 'json') {
    throw new Sb3BuilderError('--format must be either pretty or json.', {stage: 'cli'});
  }

  const sourceIncludesEnabled = flags.has('--enable-source-includes');
  const sourceGraphOptions = [
    '--max-source-files',
    '--max-total-source-bytes',
    '--max-include-depth',
  ];
  if (!sourceIncludesEnabled) {
    const unexpected = sourceGraphOptions.find((option) => values.has(option));
    if (unexpected) {
      throw new Sb3BuilderError(`${unexpected} requires --enable-source-includes.`, {stage: 'cli'});
    }
  } else {
    const missing = sourceGraphOptions.find((option) => !values.has(option));
    if (missing) {
      throw new Sb3BuilderError(`${missing} is required with --enable-source-includes.`, {
        stage: 'cli',
      });
    }
  }

  const maxTotalSourceBytes = sourceIncludesEnabled
    ? positiveInteger('--max-total-source-bytes')
    : undefined;
  if (maxTotalSourceBytes !== undefined && maxTotalSourceBytes < maxSourceBytes) {
    throw new Sb3BuilderError(
      '--max-total-source-bytes must be greater than or equal to --max-source-bytes.',
      {stage: 'cli'},
    );
  }

  return {
    projectRoot: path.resolve(values.get('--project-root') as string),
    ...(values.has('--source-manifest')
      ? {sourceManifest: path.resolve(values.get('--source-manifest') as string)}
      : {}),
    ...(values.has('--source') ? {source: values.get('--source')} : {}),
    ...(values.has('--source-id') ? {sourceId: values.get('--source-id')} : {}),
    assetConfig: path.resolve(values.get('--asset-config') as string),
    assetLock: path.resolve(values.get('--asset-lock') as string),
    assetProfile: values.get('--asset-profile') as string,
    format,
    maxSourceBytes,
    maxSourceManifestBytes,
    maxAssetConfigBytes,
    maxAssetLockBytes,
    sourceIncludesEnabled,
    ...(sourceIncludesEnabled
      ? {
          maxSourceFiles: positiveInteger('--max-source-files'),
          ...(maxTotalSourceBytes === undefined ? {} : {maxTotalSourceBytes}),
          maxIncludeDepth: positiveInteger('--max-include-depth'),
        }
      : {}),
  };
}

function parseLockDsl4AssetArguments(arguments_: string[]): {
  projectRoot: string;
  sourceManifest?: string;
  source?: string;
  sourceId?: string;
  assetConfig: string;
  output: string;
  maxSourceBytes: number;
  maxSourceManifestBytes: number;
  maxAssetFileBytes: number;
  maxAssetFiles: number;
  maxTotalAssetBytes: number;
  timeoutMs: number;
  maxRedirects: number;
  allowedHosts: string[];
  sourceIncludesEnabled: boolean;
  maxSourceFiles?: number;
  maxTotalSourceBytes?: number;
  maxIncludeDepth?: number;
} {
  const values = new Map();
  const allowedHosts = [];
  const flags = new Set();
  const flagOptions = new Set(['--enable-source-includes']);
  const allowedValueOptions = new Set([
    '--project-root',
    '--source-manifest',
    '--source',
    '--source-id',
    '--asset-config',
    '--output',
    '--max-source-bytes',
    '--max-source-manifest-bytes',
    '--max-asset-file-bytes',
    '--max-asset-files',
    '--max-total-asset-bytes',
    '--timeout-ms',
    '--max-redirects',
    '--max-source-files',
    '--max-total-source-bytes',
    '--max-include-depth',
    '--allow-host',
  ]);
  for (let index = 0; index < arguments_.length; index += 1) {
    // The loop is bounded by the argument count, so the empty string is unreachable; it would
    // be rejected as an unknown option like any other unexpected argument.
    const option = arguments_[index] ?? '';
    if (flagOptions.has(option)) {
      if (flags.has(option))
        throw new Sb3BuilderError(`Duplicate option: ${option}`, {stage: 'cli'});
      flags.add(option);
      continue;
    }
    if (!allowedValueOptions.has(option)) {
      throw new Sb3BuilderError(`Unknown option: ${option}`, {stage: 'cli'});
    }
    const value = arguments_[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Sb3BuilderError(`${option} requires a value.`, {stage: 'cli'});
    }
    if (option === '--allow-host') {
      allowedHosts.push(value);
    } else {
      if (values.has(option))
        throw new Sb3BuilderError(`Duplicate option: ${option}`, {stage: 'cli'});
      values.set(option, value);
    }
    index += 1;
  }
  for (const required of [
    '--project-root',
    '--asset-config',
    '--output',
    '--max-source-manifest-bytes',
    '--timeout-ms',
    '--max-redirects',
  ]) {
    if (!values.has(required))
      throw new Sb3BuilderError(`Missing required option: ${required}`, {stage: 'cli'});
  }
  if (allowedHosts.length === 0) {
    throw new Sb3BuilderError('Missing required option: --allow-host', {stage: 'cli'});
  }
  const positiveInteger = (option: string) => {
    const value = Number(values.get(option));
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Sb3BuilderError(`${option} must be an integer >= 1.`, {stage: 'cli'});
    }
    return value;
  };
  const nonNegativeInteger = (option: string) => {
    const value = Number(values.get(option));
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Sb3BuilderError(`${option} must be an integer >= 0.`, {stage: 'cli'});
    }
    return value;
  };
  const maxSourceBytes = resolveDsl4CliDefaultLimit(values, '--max-source-bytes');
  const maxSourceManifestBytes = positiveInteger('--max-source-manifest-bytes');
  const maxAssetFileBytes = resolveDsl4CliDefaultLimit(values, '--max-asset-file-bytes');
  const maxAssetFiles = resolveDsl4CliDefaultLimit(values, '--max-asset-files');
  const maxTotalAssetBytes = resolveDsl4CliDefaultLimit(values, '--max-total-asset-bytes');
  const timeoutMs = positiveInteger('--timeout-ms');
  const maxRedirects = nonNegativeInteger('--max-redirects');
  if (maxAssetFileBytes > maxTotalAssetBytes) {
    throw new Sb3BuilderError('--max-asset-file-bytes must be <= --max-total-asset-bytes.', {
      stage: 'cli',
    });
  }
  const sourceIncludesEnabled = flags.has('--enable-source-includes');
  const sourceGraphOptions = [
    '--max-source-files',
    '--max-total-source-bytes',
    '--max-include-depth',
  ];
  if (!sourceIncludesEnabled) {
    const unexpected = sourceGraphOptions.find((option) => values.has(option));
    if (unexpected)
      throw new Sb3BuilderError(`${unexpected} requires --enable-source-includes.`, {stage: 'cli'});
  } else {
    const missing = sourceGraphOptions.find((option) => !values.has(option));
    if (missing)
      throw new Sb3BuilderError(`${missing} is required with --enable-source-includes.`, {
        stage: 'cli',
      });
  }
  const maxTotalSourceBytes = sourceIncludesEnabled
    ? positiveInteger('--max-total-source-bytes')
    : undefined;
  if (maxTotalSourceBytes !== undefined && maxTotalSourceBytes < maxSourceBytes) {
    throw new Sb3BuilderError(
      '--max-total-source-bytes must be greater than or equal to --max-source-bytes.',
      {stage: 'cli'},
    );
  }
  return {
    projectRoot: path.resolve(values.get('--project-root') as string),
    ...(values.has('--source-manifest')
      ? {sourceManifest: path.resolve(values.get('--source-manifest') as string)}
      : {}),
    ...(values.has('--source') ? {source: values.get('--source')} : {}),
    ...(values.has('--source-id') ? {sourceId: values.get('--source-id')} : {}),
    assetConfig: path.resolve(values.get('--asset-config') as string),
    output: path.resolve(values.get('--output') as string),
    maxSourceBytes,
    maxSourceManifestBytes,
    maxAssetFileBytes,
    maxAssetFiles,
    maxTotalAssetBytes,
    timeoutMs,
    maxRedirects,
    allowedHosts,
    sourceIncludesEnabled,
    ...(sourceIncludesEnabled
      ? {
          maxSourceFiles: positiveInteger('--max-source-files'),
          ...(maxTotalSourceBytes === undefined ? {} : {maxTotalSourceBytes}),
          maxIncludeDepth: positiveInteger('--max-include-depth'),
        }
      : {}),
  };
}

function parseVendorDsl4AssetArguments(arguments_: string[]): {
  projectRoot: string;
  assetConfig: string;
  assetLock: string;
  outputConfig: string;
  outputLock: string;
  vendorDirectory?: string;
  maxAssetConfigBytes: number;
  maxAssetLockBytes: number;
  maxAssetFileBytes: number;
  maxAssetFiles: number;
  maxTotalAssetBytes: number;
  timeoutMs: number;
  maxRedirects: number;
  allowedHosts: string[];
} {
  const values = new Map();
  const allowedHosts = [];
  const allowed = new Set([
    '--project-root',
    '--asset-config',
    '--asset-lock',
    '--output-config',
    '--output-lock',
    '--vendor-dir',
    '--max-asset-config-bytes',
    '--max-asset-lock-bytes',
    '--max-asset-file-bytes',
    '--max-asset-files',
    '--max-total-asset-bytes',
    '--timeout-ms',
    '--max-redirects',
    '--allow-host',
  ]);
  for (let index = 0; index < arguments_.length; index += 2) {
    // The loop is bounded by the argument count, so the empty string is unreachable; it would
    // be rejected as an unknown option like any other unexpected argument.
    const option = arguments_[index] ?? '';
    const value = arguments_[index + 1];
    if (!allowed.has(option))
      throw new Sb3BuilderError(`Unknown option: ${option}`, {stage: 'cli'});
    if (!value || value.startsWith('--'))
      throw new Sb3BuilderError(`${option} requires a value.`, {stage: 'cli'});
    if (option === '--allow-host') {
      allowedHosts.push(value);
    } else {
      if (values.has(option))
        throw new Sb3BuilderError(`Duplicate option: ${option}`, {stage: 'cli'});
      values.set(option, value);
    }
  }
  for (const required of [
    '--project-root',
    '--asset-config',
    '--asset-lock',
    '--output-config',
    '--output-lock',
    '--max-asset-config-bytes',
    '--max-asset-lock-bytes',
    '--timeout-ms',
    '--max-redirects',
  ]) {
    if (!values.has(required))
      throw new Sb3BuilderError(`Missing required option: ${required}`, {stage: 'cli'});
  }
  if (allowedHosts.length === 0)
    throw new Sb3BuilderError('Missing required option: --allow-host', {stage: 'cli'});
  const integer = (option: string, minimum: number) => {
    const value = Number(values.get(option));
    if (!Number.isSafeInteger(value) || value < minimum) {
      throw new Sb3BuilderError(`${option} must be an integer >= ${minimum}.`, {stage: 'cli'});
    }
    return value;
  };
  const maxAssetConfigBytes = integer('--max-asset-config-bytes', 1);
  const maxAssetLockBytes = integer('--max-asset-lock-bytes', 1);
  const maxAssetFileBytes = resolveDsl4CliDefaultLimit(values, '--max-asset-file-bytes');
  const maxTotalAssetBytes = resolveDsl4CliDefaultLimit(values, '--max-total-asset-bytes');
  if (maxAssetFileBytes > maxTotalAssetBytes) {
    throw new Sb3BuilderError('--max-asset-file-bytes must be <= --max-total-asset-bytes.', {
      stage: 'cli',
    });
  }
  return {
    projectRoot: path.resolve(values.get('--project-root') as string),
    assetConfig: path.resolve(values.get('--asset-config') as string),
    assetLock: path.resolve(values.get('--asset-lock') as string),
    outputConfig: path.resolve(values.get('--output-config') as string),
    outputLock: path.resolve(values.get('--output-lock') as string),
    ...(values.has('--vendor-dir') ? {vendorDirectory: values.get('--vendor-dir')} : {}),
    maxAssetConfigBytes,
    maxAssetLockBytes,
    maxAssetFileBytes,
    maxAssetFiles: resolveDsl4CliDefaultLimit(values, '--max-asset-files'),
    maxTotalAssetBytes,
    timeoutMs: integer('--timeout-ms', 1),
    maxRedirects: integer('--max-redirects', 0),
    allowedHosts,
  };
}

function parseConvertDsl4Arguments(arguments_: string[]): Parameters<typeof convertDsl32File>[0] {
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    // The loop is bounded by the argument count, so the empty string is unreachable; it would
    // be rejected as an unknown option like any other unexpected argument.
    const option = arguments_[index] ?? '';
    const value = arguments_[index + 1];
    if (!['--input', '--output', '--pose-models'].includes(option)) {
      throw new Sb3BuilderError(`Unknown option: ${option}`, {stage: 'cli'});
    }
    if (!value || value.startsWith('--')) {
      throw new Sb3BuilderError(`${option} requires a value.`, {stage: 'cli'});
    }
    if (values.has(option)) {
      throw new Sb3BuilderError(`Duplicate option: ${option}`, {stage: 'cli'});
    }
    values.set(option, value);
  }
  for (const required of ['--input', '--output']) {
    if (!values.has(required)) {
      throw new Sb3BuilderError(`Missing required option: ${required}`, {stage: 'cli'});
    }
  }
  return {
    inputPath: path.resolve(values.get('--input') as string),
    outputPath: path.resolve(values.get('--output') as string),
    ...(values.has('--pose-models')
      ? {poseModelMapPath: path.resolve(values.get('--pose-models') as string)}
      : {}),
  };
}

function parseConvertDsl4AssetsArguments(
  arguments_: string[],
): Omit<Parameters<typeof convertDsl4ProjectAssets>[0], 'sourceFrontend'> {
  const values = new Map();
  const assets = [];
  const allowedHosts = [];
  const allowed = new Set([
    '--project-root',
    '--source-manifest',
    '--source',
    '--source-id',
    '--base',
    '--output-dir',
    '--output-name',
    '--to',
    '--asset',
    '--remote-map',
    '--rsync-destination',
    '--remote-base-url',
    '--rsync-ssh-port',
    '--rsync-timeout-ms',
    '--allow-host',
    '--max-source-bytes',
    '--max-source-manifest-bytes',
    '--max-remote-map-bytes',
    '--max-base-sb3-bytes',
    '--max-asset-file-bytes',
    '--max-asset-files',
    '--max-total-asset-bytes',
    '--timeout-ms',
    '--max-redirects',
  ]);
  for (let index = 0; index < arguments_.length; index += 2) {
    // The loop is bounded by the argument count, so the empty string is unreachable; it would
    // be rejected as an unknown option like any other unexpected argument.
    const option = arguments_[index] ?? '';
    const value = arguments_[index + 1];
    if (!allowed.has(option)) {
      throw new Sb3BuilderError(`Unknown option: ${option}`, {stage: 'cli'});
    }
    if (!value || value.startsWith('--')) {
      throw new Sb3BuilderError(`${option} requires a value.`, {stage: 'cli'});
    }
    if (option === '--asset') assets.push(value);
    else if (option === '--allow-host') allowedHosts.push(value);
    else {
      if (values.has(option)) {
        throw new Sb3BuilderError(`Duplicate option: ${option}`, {stage: 'cli'});
      }
      values.set(option, value);
    }
  }
  const required = [
    '--project-root',
    '--base',
    '--output-dir',
    '--to',
    '--max-source-manifest-bytes',
    '--max-remote-map-bytes',
    '--max-base-sb3-bytes',
    '--timeout-ms',
    '--max-redirects',
  ];
  for (const option of required) {
    if (!values.has(option)) {
      throw new Sb3BuilderError(`Missing required option: ${option}`, {stage: 'cli'});
    }
  }
  const integer = (option: string, minimum: number) => {
    const value = Number(values.get(option));
    if (!Number.isSafeInteger(value) || value < minimum) {
      throw new Sb3BuilderError(`${option} must be an integer >= ${minimum}.`, {stage: 'cli'});
    }
    return value;
  };
  const to = values.get('--to');
  if (to !== 'local' && to !== 'project' && to !== 'remote') {
    throw new Sb3BuilderError('--to must be local, project, or remote.', {stage: 'cli'});
  }
  const maxAssetFileBytes = resolveDsl4CliDefaultLimit(values, '--max-asset-file-bytes');
  const maxTotalAssetBytes = resolveDsl4CliDefaultLimit(values, '--max-total-asset-bytes');
  if (maxAssetFileBytes > maxTotalAssetBytes) {
    throw new Sb3BuilderError('--max-asset-file-bytes must be <= --max-total-asset-bytes.', {
      stage: 'cli',
    });
  }
  const hasRsyncDestination = values.has('--rsync-destination');
  const hasRemoteBaseUrl = values.has('--remote-base-url');
  const hasRsyncOption =
    hasRsyncDestination ||
    hasRemoteBaseUrl ||
    values.has('--rsync-ssh-port') ||
    values.has('--rsync-timeout-ms');
  if (hasRsyncOption && (!hasRsyncDestination || !hasRemoteBaseUrl)) {
    throw new Sb3BuilderError(
      '--rsync-destination and --remote-base-url must be specified together.',
      {stage: 'cli'},
    );
  }
  if (hasRsyncOption && to !== 'remote') {
    throw new Sb3BuilderError('rsync options require --to remote.', {stage: 'cli'});
  }
  if (hasRsyncOption && values.has('--remote-map')) {
    throw new Sb3BuilderError('--remote-map cannot be combined with rsync options.', {
      stage: 'cli',
    });
  }
  const rsyncSshPort = values.has('--rsync-ssh-port') ? integer('--rsync-ssh-port', 1) : 22;
  if (rsyncSshPort > 65_535) {
    throw new Sb3BuilderError('--rsync-ssh-port must be <= 65535.', {stage: 'cli'});
  }
  return {
    projectRoot: path.resolve(values.get('--project-root') as string),
    ...(values.has('--source-manifest')
      ? {sourceManifest: path.resolve(values.get('--source-manifest') as string)}
      : {}),
    ...(values.has('--source') ? {source: values.get('--source')} : {}),
    ...(values.has('--source-id') ? {sourceId: values.get('--source-id')} : {}),
    baseSb3: path.resolve(values.get('--base') as string),
    outputDirectory: path.resolve(values.get('--output-dir') as string),
    to,
    assets,
    allowedHosts,
    maxSourceBytes: resolveDsl4CliDefaultLimit(values, '--max-source-bytes'),
    maxSourceManifestBytes: integer('--max-source-manifest-bytes', 1),
    maxRemoteMapBytes: integer('--max-remote-map-bytes', 1),
    maxBaseSb3Bytes: integer('--max-base-sb3-bytes', 1),
    maxAssetFileBytes,
    maxAssetFiles: resolveDsl4CliDefaultLimit(values, '--max-asset-files'),
    maxTotalAssetBytes,
    timeoutMs: integer('--timeout-ms', 1),
    maxRedirects: integer('--max-redirects', 0),
    ...(values.has('--remote-map')
      ? {remoteMap: path.resolve(values.get('--remote-map') as string)}
      : {}),
    ...(hasRsyncOption
      ? {
          rsyncDestination: values.get('--rsync-destination'),
          remoteBaseUrl: values.get('--remote-base-url'),
          rsyncSshPort,
          rsyncTimeoutMs: values.has('--rsync-timeout-ms')
            ? integer('--rsync-timeout-ms', 1)
            : integer('--timeout-ms', 1),
        }
      : {}),
    ...(values.has('--output-name') ? {outputName: values.get('--output-name')} : {}),
  };
}

function parseBuildSb3Arguments(rest: string[]): Parameters<typeof buildSb3Bundle>[0] {
  const values = new Map();
  const allowedFileRoots = [];
  let allowHttp = false;
  const numericOptions = new Set([
    '--timeout-ms',
    '--max-asset-bytes',
    '--max-script-bytes',
    '--max-redirects',
  ]);
  for (let index = 0; index < rest.length; index += 1) {
    // Bounded by the argument count above, so the empty string is unreachable here too.
    const option = rest[index] ?? '';
    if (option === '--allow-http') {
      allowHttp = true;
      continue;
    }
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Sb3BuilderError(`${option} requires a value.`, {stage: 'cli'});
    }
    if (option === '--allow-file-root') {
      allowedFileRoots.push(path.resolve(value));
    } else if (
      ['--base', '--script', '--assets', '--output', '--profile'].includes(option) ||
      numericOptions.has(option)
    ) {
      if (values.has(option)) {
        throw new Sb3BuilderError(`Duplicate option: ${option}`, {stage: 'cli'});
      }
      values.set(option, value);
    } else {
      throw new Sb3BuilderError(`Unknown option: ${option}`, {stage: 'cli'});
    }
    index += 1;
  }
  for (const required of ['--base', '--script', '--assets', '--output', '--profile']) {
    if (!values.has(required)) {
      throw new Sb3BuilderError(`Missing required option: ${required}`, {stage: 'cli'});
    }
  }
  const numberValue = (option: string) => {
    const raw = values.get(option);
    if (raw === undefined) return undefined;
    const value = Number(raw);
    const minimum = option === '--max-redirects' ? 0 : 1;
    if (!Number.isInteger(value) || value < minimum) {
      throw new Sb3BuilderError(`${option} must be an integer >= ${minimum}.`, {stage: 'cli'});
    }
    return value;
  };
  const outputBase = path.resolve(values.get('--output') as string);
  const profile = values.get('--profile');
  if (profile !== 'editor' && profile !== 'player') {
    throw new Sb3BuilderError('--profile must be either editor or player.', {stage: 'cli'});
  }
  const requestTimeoutMs = numberValue('--timeout-ms');
  const maxAssetBytes = numberValue('--max-asset-bytes');
  const maxEmbeddedScriptBytes = numberValue('--max-script-bytes');
  const maxRedirects = numberValue('--max-redirects');
  return {
    baseSb3: path.resolve(values.get('--base') as string),
    sourceScript: path.resolve(values.get('--script') as string),
    assetManifest: path.resolve(values.get('--assets') as string),
    outputDirectory: path.dirname(outputBase),
    outputName: path.basename(outputBase),
    profile,
    ...(allowedFileRoots.length > 0 ? {allowedFileRoots} : {}),
    allowHttp,
    ...(requestTimeoutMs === undefined ? {} : {requestTimeoutMs}),
    ...(maxAssetBytes === undefined ? {} : {maxAssetBytes}),
    ...(maxEmbeddedScriptBytes === undefined ? {} : {maxEmbeddedScriptBytes}),
    ...(maxRedirects === undefined ? {} : {maxRedirects}),
  };
}

export type Dsl4CliOptions = Omit<
  Parameters<typeof buildDsl4RuntimeComponentFile>[0],
  'sourceFrontend'
>;

function parseBuildDsl4Arguments(rest: string[]): Dsl4CliOptions {
  const booleanOptions = new Set([
    '--enable-source-includes',
    '--enable-root-binary-entries',
    '--embedded-source-documents',
    '--history-navigation-available',
    '--replace-existing',
  ]);
  const requiredValueOptions = new Set([
    '--base',
    '--project-root',
    '--output',
    '--control-profile',
    '--channel',
  ]);
  const defaultedValueOptions = new Set([
    '--max-source-bytes',
    '--max-asset-file-bytes',
    '--max-asset-files',
    '--max-total-asset-bytes',
  ]);
  const valueOptions = new Set([
    ...requiredValueOptions,
    ...defaultedValueOptions,
    '--source-manifest',
    '--source',
    '--source-id',
    '--max-source-files',
    '--max-total-source-bytes',
    '--max-include-depth',
    '--asset-config',
    '--asset-lock',
    '--asset-profile',
    '--max-asset-config-bytes',
    '--max-asset-lock-bytes',
    '--distribution-profile',
  ]);
  const {flags, values} = parseCliFlagAndValueOptions(rest, {
    flagOptions: booleanOptions,
    valueOptions,
  });
  requireCliValueOptions(values, requiredValueOptions);
  const distributionProfile = values.get('--distribution-profile') ?? 'source';
  if (distributionProfile !== 'source' && distributionProfile !== 'compiled') {
    throw new Sb3BuilderError('--distribution-profile must be either source or compiled.', {
      stage: 'cli',
    });
  }
  if (flags.has('--enable-source-includes')) {
    requireCliValueOptions(values, [
      '--max-source-files',
      '--max-total-source-bytes',
      '--max-include-depth',
    ]);
  }
  const positiveInteger = (option: string) => readCliInteger(values, option, 1);
  const channel = values.get('--channel');
  if (channel !== 'bundled' && channel !== 'unbundled') {
    throw new Sb3BuilderError('--channel must be either bundled or unbundled.', {stage: 'cli'});
  }
  const maxSourceBytes = resolveDsl4CliDefaultLimit(values, '--max-source-bytes');
  const sourceIncludesEnabled = flags.has('--enable-source-includes');
  const rootBinaryEntriesEnabled = flags.has('--enable-root-binary-entries');
  const maxTotalSourceBytes = sourceIncludesEnabled
    ? positiveInteger('--max-total-source-bytes')
    : null;
  if (maxTotalSourceBytes !== null && maxTotalSourceBytes < maxSourceBytes) {
    throw new Sb3BuilderError(
      '--max-total-source-bytes must be greater than or equal to --max-source-bytes.',
      {stage: 'cli'},
    );
  }
  const distributionOptions = ['--asset-config', '--asset-lock', '--asset-profile'];
  const distributionSelected = distributionOptions.some((option) => values.has(option));
  if (distributionSelected) {
    for (const required of [
      ...distributionOptions,
      '--max-asset-config-bytes',
      '--max-asset-lock-bytes',
    ]) {
      if (!values.has(required)) {
        throw new Sb3BuilderError(`${required} is required with asset distribution options.`, {
          stage: 'cli',
        });
      }
    }
  } else if (values.has('--max-asset-config-bytes') || values.has('--max-asset-lock-bytes')) {
    throw new Sb3BuilderError(
      '--max-asset-config-bytes and --max-asset-lock-bytes require asset distribution options.',
      {stage: 'cli'},
    );
  }
  return {
    baseSb3: path.resolve(values.get('--base') as string),
    projectRoot: path.resolve(values.get('--project-root') as string),
    ...(values.has('--source-manifest')
      ? {sourceManifest: path.resolve(values.get('--source-manifest') as string)}
      : {}),
    ...(values.has('--source') ? {source: values.get('--source')} : {}),
    ...(values.has('--source-id') ? {sourceId: values.get('--source-id')} : {}),
    output: path.resolve(values.get('--output') as string),
    controlProfile: values.get('--control-profile') as string,
    channel,
    maxSourceBytes,
    maxAssetFileBytes: resolveDsl4CliDefaultLimit(values, '--max-asset-file-bytes'),
    maxAssetFiles: resolveDsl4CliDefaultLimit(values, '--max-asset-files'),
    maxTotalAssetBytes: resolveDsl4CliDefaultLimit(values, '--max-total-asset-bytes'),
    ...(distributionSelected
      ? {
          assetConfig: path.resolve(values.get('--asset-config') as string),
          assetLock: path.resolve(values.get('--asset-lock') as string),
          assetProfile: values.get('--asset-profile') as string,
          maxAssetConfigBytes: positiveInteger('--max-asset-config-bytes'),
          maxAssetLockBytes: positiveInteger('--max-asset-lock-bytes'),
        }
      : {}),
    ...(sourceIncludesEnabled || rootBinaryEntriesEnabled
      ? {
          featureFlags: {
            dsl4Runtime: true,
            ...(sourceIncludesEnabled ? {dsl4SourceIncludes: true} : {}),
            ...(rootBinaryEntriesEnabled ? {dsl4RootBinaryEntryPackaging: true} : {}),
          },
          ...(sourceIncludesEnabled
            ? {
                maxSourceFiles: positiveInteger('--max-source-files'),
                maxTotalSourceBytes: maxTotalSourceBytes as number,
                maxIncludeDepth: positiveInteger('--max-include-depth'),
              }
            : {}),
        }
      : {}),
    ...(flags.has('--embedded-source-documents') ? {embeddedSourceDocuments: true} : {}),
    historyNavigationAvailable: flags.has('--history-navigation-available'),
    replaceExisting: flags.has('--replace-existing'),
    ...(distributionProfile === 'compiled' ? {distributionProfile} : {}),
  };
}

export type Dsl4PreviewCliOptions = Omit<
  Dsl4CliOptions,
  'output' | 'historyNavigationAvailable'
> & {
  watch: true;
  port: number;
  maxProjectBytes: number;
  maxProjectJsonBytes: number;
  allowLargePreviewArtifacts: boolean;
};

function parsePreviewDsl4Arguments(rest: string[]): Dsl4PreviewCliOptions {
  const booleanOptions = new Set([
    '--watch',
    '--replace-existing',
    '--enable-source-includes',
    '--allow-large-preview-artifacts',
  ]);
  const requiredValueOptions = new Set([
    '--base',
    '--project-root',
    '--control-profile',
    '--channel',
  ]);
  const defaultedValueOptions = new Set([
    '--max-source-bytes',
    '--max-asset-file-bytes',
    '--max-asset-files',
    '--max-total-asset-bytes',
  ]);
  const graphValueOptions = new Set([
    '--max-source-files',
    '--max-total-source-bytes',
    '--max-include-depth',
  ]);
  const valueOptions = new Set([
    ...requiredValueOptions,
    ...defaultedValueOptions,
    ...graphValueOptions,
    '--source-manifest',
    '--source',
    '--source-id',
    '--max-project-bytes',
    '--max-project-json-bytes',
    '--port',
  ]);
  const {flags, values} = parseCliFlagAndValueOptions(rest, {
    flagOptions: booleanOptions,
    valueOptions,
  });
  if (!flags.has('--watch')) {
    throw new Sb3BuilderError('Missing required option: --watch', {stage: 'cli'});
  }
  requireCliValueOptions(values, requiredValueOptions);
  const sourceIncludesEnabled = flags.has('--enable-source-includes');
  if (sourceIncludesEnabled) {
    requireCliValueOptions(values, graphValueOptions);
  } else {
    for (const option of graphValueOptions) {
      if (values.has(option)) {
        throw new Sb3BuilderError(`${option} requires --enable-source-includes.`, {stage: 'cli'});
      }
    }
  }
  const positiveInteger = (option: string) => readCliInteger(values, option, 1);
  const port = values.has('--port') ? Number(values.get('--port')) : 0;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Sb3BuilderError('--port must be an integer between 0 and 65535.', {stage: 'cli'});
  }
  const channel = values.get('--channel');
  if (channel !== 'bundled' && channel !== 'unbundled') {
    throw new Sb3BuilderError('--channel must be either bundled or unbundled.', {stage: 'cli'});
  }
  const maxAssetFileBytes = resolveDsl4CliDefaultLimit(values, '--max-asset-file-bytes');
  const maxTotalAssetBytes = resolveDsl4CliDefaultLimit(values, '--max-total-asset-bytes');
  if (maxAssetFileBytes > maxTotalAssetBytes) {
    throw new Sb3BuilderError('--max-asset-file-bytes must be <= --max-total-asset-bytes.', {
      stage: 'cli',
    });
  }
  const maxSourceBytes = resolveDsl4CliDefaultLimit(values, '--max-source-bytes');
  const maxTotalSourceBytes = sourceIncludesEnabled
    ? positiveInteger('--max-total-source-bytes')
    : null;
  if (maxTotalSourceBytes !== null && maxTotalSourceBytes < maxSourceBytes) {
    throw new Sb3BuilderError(
      '--max-total-source-bytes must be greater than or equal to --max-source-bytes.',
      {stage: 'cli'},
    );
  }
  const maxAssetFiles = resolveDsl4CliDefaultLimit(values, '--max-asset-files');
  const maxProjectBytes = values.has('--max-project-bytes')
    ? positiveInteger('--max-project-bytes')
    : dsl4BrowserPreviewArtifactLimits.defaults.maxProjectBytes;
  const maxProjectJsonBytes = values.has('--max-project-json-bytes')
    ? positiveInteger('--max-project-json-bytes')
    : dsl4BrowserPreviewArtifactLimits.defaults.maxProjectJsonBytes;
  for (const [option, value, maximum] of [
    ['--max-source-bytes', maxSourceBytes, dsl4LocalPreviewBrowserBootstrapMaximums.maxSourceBytes],
    [
      '--max-asset-file-bytes',
      maxAssetFileBytes,
      dsl4BrowserPreviewArtifactLimits.absoluteMaximums.maxTotalAssetBytes,
    ],
    ['--max-asset-files', maxAssetFiles, dsl4LocalPreviewBrowserBootstrapMaximums.maxAssetFiles],
    [
      '--max-total-asset-bytes',
      maxTotalAssetBytes,
      dsl4BrowserPreviewArtifactLimits.absoluteMaximums.maxTotalAssetBytes,
    ],
    [
      '--max-project-bytes',
      maxProjectBytes,
      dsl4BrowserPreviewArtifactLimits.absoluteMaximums.maxProjectBytes,
    ],
    [
      '--max-project-json-bytes',
      maxProjectJsonBytes,
      dsl4BrowserPreviewArtifactLimits.absoluteMaximums.maxProjectJsonBytes,
    ],
  ] as ReadonlyArray<[string, number, number]>) {
    if (value > maximum) {
      throw new Sb3BuilderError(`${option} must be <= ${maximum}.`, {stage: 'cli'});
    }
  }
  const allowLargePreviewArtifacts = flags.has('--allow-large-preview-artifacts');
  for (const [option, value, recommendedMaximum] of [
    [
      '--max-asset-file-bytes',
      maxAssetFileBytes,
      dsl4BrowserPreviewArtifactLimits.recommendedMaximums.maxTotalAssetBytes,
    ],
    [
      '--max-total-asset-bytes',
      maxTotalAssetBytes,
      dsl4BrowserPreviewArtifactLimits.recommendedMaximums.maxTotalAssetBytes,
    ],
    [
      '--max-project-bytes',
      maxProjectBytes,
      dsl4BrowserPreviewArtifactLimits.recommendedMaximums.maxProjectBytes,
    ],
    [
      '--max-project-json-bytes',
      maxProjectJsonBytes,
      dsl4BrowserPreviewArtifactLimits.recommendedMaximums.maxProjectJsonBytes,
    ],
  ] as ReadonlyArray<[string, number, number]>) {
    if (value > recommendedMaximum && !allowLargePreviewArtifacts) {
      throw new Sb3BuilderError(
        `${option} above ${recommendedMaximum} requires --allow-large-preview-artifacts.`,
        {stage: 'cli'},
      );
    }
  }
  return {
    watch: true,
    baseSb3: path.resolve(values.get('--base') as string),
    projectRoot: path.resolve(values.get('--project-root') as string),
    ...(values.has('--source-manifest')
      ? {sourceManifest: path.resolve(values.get('--source-manifest') as string)}
      : {}),
    ...(values.has('--source') ? {source: values.get('--source')} : {}),
    ...(values.has('--source-id') ? {sourceId: values.get('--source-id')} : {}),
    controlProfile: values.get('--control-profile') as string,
    channel,
    maxSourceBytes,
    maxAssetFileBytes,
    maxAssetFiles,
    maxTotalAssetBytes,
    maxProjectBytes,
    maxProjectJsonBytes,
    allowLargePreviewArtifacts,
    ...(sourceIncludesEnabled
      ? {
          featureFlags: {dsl4Runtime: true, dsl4SourceIncludes: true},
          maxSourceFiles: positiveInteger('--max-source-files'),
          maxTotalSourceBytes: maxTotalSourceBytes as number,
          maxIncludeDepth: positiveInteger('--max-include-depth'),
        }
      : {}),
    replaceExisting: flags.has('--replace-existing'),
    port,
  };
}

function parseAuditDsl4DefinitionsArguments(rest: string[]) {
  const {flags, values} = parseCliFlagAndValueOptions(rest, {
    flagOptions: new Set(['--remove-unused']),
    valueOptions: new Set([
      '--input',
      '--base',
      '--project-root',
      '--control-profile',
      '--output-dir',
      '--format',
      '--max-source-bytes',
      '--max-source-files',
      '--max-total-source-bytes',
      '--max-include-depth',
      '--max-project-bytes',
    ]),
  });
  requireCliValueOptions(values, ['--input']);
  const format = values.get('--format') ?? 'pretty';
  if (format !== 'pretty' && format !== 'json')
    throw new Sb3BuilderError('--format must be pretty or json.', {stage: 'cli'});
  if (flags.has('--remove-unused') !== values.has('--output-dir'))
    throw new Sb3BuilderError('--remove-unused and --output-dir must be supplied together.', {
      stage: 'cli',
    });
  const limit = (option: string, fallback: number) =>
    values.has(option) ? readCliInteger(values, option, 1) : fallback;
  return {
    input: path.resolve(values.get('--input')!),
    format,
    ...(values.has('--base') ? {base: path.resolve(values.get('--base')!)} : {}),
    ...(values.has('--project-root')
      ? {projectRoot: path.resolve(values.get('--project-root')!)}
      : {}),
    ...(values.has('--control-profile') ? {controlProfile: values.get('--control-profile')!} : {}),
    ...(values.has('--output-dir') ? {outputDir: path.resolve(values.get('--output-dir')!)} : {}),
    removeUnused: flags.has('--remove-unused'),
    maxSourceBytes: resolveDsl4CliDefaultLimit(values, '--max-source-bytes'),
    maxSourceFiles: limit('--max-source-files', 64),
    maxTotalSourceBytes: limit('--max-total-source-bytes', 4 * 1024 * 1024),
    maxIncludeDepth: limit('--max-include-depth', 32),
    maxProjectBytes: limit('--max-project-bytes', 512 * 1024 * 1024),
  };
}

function parseMigrateEmbeddedYamlArguments(arguments_: string[]) {
  const {values} = parseCliFlagAndValueOptions(arguments_, {
    flagOptions: new Set(),
    valueOptions: new Set(['--input', '--output', '--entry-file', '--report', '--document-map']),
  });
  requireCliValueOptions(values, ['--input', '--output']);
  return {
    input: path.resolve(values.get('--input')!),
    output: path.resolve(values.get('--output')!),
    ...(values.has('--entry-file') ? {entryFile: values.get('--entry-file')!} : {}),
    ...(values.has('--report') ? {report: path.resolve(values.get('--report')!)} : {}),
    ...(values.has('--document-map')
      ? {documentMap: path.resolve(values.get('--document-map')!)}
      : {}),
  };
}

/** Matches the input bound the other SB3-reading commands default to. */
const saveSb3FormatDefaultMaxInputBytes = 536_870_912;

function parseSaveSb3FormatArguments(arguments_: string[]) {
  const {flags, values} = parseCliFlagAndValueOptions(arguments_, {
    flagOptions: new Set([
      '--assets-as-project-assets',
      '--keep-embedded-data',
      '--skip-url-check',
    ]),
    valueOptions: new Set([
      '--input',
      '--output',
      '--extensions',
      '--source',
      '--assets',
      '--extension-urls',
      '--unsandboxed-extensions',
      '--max-input-bytes',
    ]),
  });
  requireCliValueOptions(values, ['--input', '--output']);
  const maxInputBytes = values.has('--max-input-bytes')
    ? Number(values.get('--max-input-bytes'))
    : saveSb3FormatDefaultMaxInputBytes;
  if (!Number.isSafeInteger(maxInputBytes) || maxInputBytes < 1)
    throw new Sb3BuilderError('--max-input-bytes must be an integer >= 1.', {stage: 'cli'});
  return {
    input: path.resolve(values.get('--input')!),
    output: path.resolve(values.get('--output')!),
    selection: {
      ...(values.has('--extensions') ? {extensions: values.get('--extensions')!} : {}),
      ...(values.has('--source') ? {source: values.get('--source')!} : {}),
      ...(values.has('--assets') ? {assets: values.get('--assets')!} : {}),
      ...(flags.has('--assets-as-project-assets') ? {assetsAsProjectAssets: true} : {}),
    },
    ...(values.has('--extension-urls')
      ? {extensionURLs: path.resolve(values.get('--extension-urls')!)}
      : {}),
    unsandboxed: values.has('--unsandboxed-extensions')
      ? values
          .get('--unsandboxed-extensions')!
          .split(',')
          .map((id: string) => id.trim())
          .filter(Boolean)
      : [],
    keepEmbeddedData: flags.has('--keep-embedded-data'),
    skipUrlCheck: flags.has('--skip-url-check'),
    maxInputBytes,
  };
}

function parseCliArgumentsBase(arguments_: string[]):
  | {action: 'migrate-embedded-yaml'; options: ReturnType<typeof parseMigrateEmbeddedYamlArguments>}
  | {action: 'save-sb3-format'; options: ReturnType<typeof parseSaveSb3FormatArguments>}
  | {action: 'help'}
  | {action: 'version'}
  | {action: 'build'; options: Parameters<typeof buildSb3Bundle>[0]}
  | {action: 'build-dsl4'; options: Dsl4CliOptions}
  | {action: 'preview-dsl4'; options: Dsl4PreviewCliOptions}
  | {action: 'convert'; options: Parameters<typeof convertDsl32File>[0]}
  | {action: 'convert-dsl4-assets'; options: ReturnType<typeof parseConvertDsl4AssetsArguments>}
  | {action: 'export-block-dsl'; options: ReturnType<typeof parseExportBlockDsl4Arguments>}
  | {action: 'author-block-dsl'; options: ReturnType<typeof parseAuthorBlockDsl4Arguments>}
  | {action: 'validate-dsl4'; options: ReturnType<typeof parseValidateDsl4Arguments>}
  | {
      action: 'audit-dsl4-definitions';
      options: ReturnType<typeof parseAuditDsl4DefinitionsArguments>;
    }
  | {action: 'audit-dsl4-assets'; options: ReturnType<typeof parseAuditDsl4AssetArguments>}
  | {action: 'lock-dsl4-assets'; options: ReturnType<typeof parseLockDsl4AssetArguments>}
  | {action: 'vendor-dsl4-assets'; options: ReturnType<typeof parseVendorDsl4AssetArguments>} {
  if (arguments_.includes('--help') || arguments_.includes('-h')) return {action: 'help'};
  if (arguments_.includes('--version') || arguments_.includes('-v')) return {action: 'version'};
  const [command, ...rest] = arguments_;
  if (command === 'migrate-embedded-yaml')
    return {action: 'migrate-embedded-yaml', options: parseMigrateEmbeddedYamlArguments(rest)};
  if (command === 'save-sb3-format')
    return {action: 'save-sb3-format', options: parseSaveSb3FormatArguments(rest)};
  if (command === 'build-sb3') {
    return {action: 'build', options: parseBuildSb3Arguments(rest)};
  }
  if (command === 'build-dsl4') {
    return {action: 'build-dsl4', options: parseBuildDsl4Arguments(rest)};
  }
  if (command === 'convert-dsl4') {
    return {action: 'convert', options: parseConvertDsl4Arguments(rest)};
  }
  if (command === 'convert-dsl4-assets') {
    return {action: 'convert-dsl4-assets', options: parseConvertDsl4AssetsArguments(rest)};
  }
  if (command === 'validate-dsl4') {
    return {action: 'validate-dsl4', options: parseValidateDsl4Arguments(rest)};
  }
  if (command === 'author-block-dsl') {
    return {action: 'author-block-dsl', options: parseAuthorBlockDsl4Arguments(rest)};
  }
  if (command === 'export-block-dsl') {
    return {action: 'export-block-dsl', options: parseExportBlockDsl4Arguments(rest)};
  }
  if (command === 'audit-dsl4-definitions') {
    return {action: 'audit-dsl4-definitions', options: parseAuditDsl4DefinitionsArguments(rest)};
  }
  if (command === 'audit-dsl4-assets') {
    return {action: 'audit-dsl4-assets', options: parseAuditDsl4AssetArguments(rest)};
  }
  if (command === 'lock-dsl4-assets') {
    return {action: 'lock-dsl4-assets', options: parseLockDsl4AssetArguments(rest)};
  }
  if (command === 'vendor-dsl4-assets') {
    return {action: 'vendor-dsl4-assets', options: parseVendorDsl4AssetArguments(rest)};
  }
  if (command === 'preview-dsl4') {
    return {action: 'preview-dsl4', options: parsePreviewDsl4Arguments(rest)};
  }
  throw new Sb3BuilderError(
    `Expected the audit-dsl4-definitions, audit-dsl4-assets, build-sb3, build-dsl4, convert-dsl4, convert-dsl4-assets, export-block-dsl, lock-dsl4-assets, preview-dsl4, save-sb3-format, vendor-dsl4-assets, or validate-dsl4 command, received ${command ?? '(none)'}.`,
    {stage: 'cli'},
  );
}

/** Standard DSL 4.0 commands enable narrative controls; an explicit opt-out is retained. */
export function parseCliArguments(
  arguments_: string[],
): ReturnType<typeof parseCliArgumentsBase> & {narrativeControlEnabled?: boolean} {
  const switches = ['--narrative-control', '--no-narrative-control'];
  const selected = arguments_.filter((argument) => switches.includes(argument));
  if (selected.length > 1)
    throw new Sb3BuilderError('Duplicate or conflicting option: --narrative-control', {
      stage: 'cli',
    });
  const result = parseCliArgumentsBase(
    arguments_.filter((argument) => !switches.includes(argument)),
  );
  const supported = [
    'validate-dsl4',
    'author-block-dsl',
    'export-block-dsl',
    'migrate-embedded-yaml',
    'build-dsl4',
    'preview-dsl4',
    'audit-dsl4-definitions',
    'audit-dsl4-assets',
    'lock-dsl4-assets',
    'convert-dsl4-assets',
  ].includes(result.action);
  if (!supported) {
    if (selected.length)
      throw new Sb3BuilderError(`${selected[0]} requires a DSL4 authoring command`, {stage: 'cli'});
    return result;
  }
  if (!selected.length) return result;
  return {...result, narrativeControlEnabled: selected[0] === '--narrative-control'};
}

export async function runCli(
  arguments_: string[],
  io: {stdout?: Pick<NodeJS.WriteStream, 'write'>; stderr?: Pick<NodeJS.WriteStream, 'write'>} = {},
  dependencies: {
    runPreview?: typeof runDsl4LocalPreviewCommand;
    runAssetAudit?: typeof auditDsl4AssetDistribution;
    runAssetConverter?: typeof convertDsl4ProjectAssets;
    runAssetLock?: typeof generateDsl4AssetDistributionLockFile;
    runAssetVendor?: typeof vendorDsl4AssetDistribution;
    runBlockDslExport?: typeof exportDsl4BlockSourcesToYaml;
    runEmbeddedYamlMigration?: typeof migrateDsl4EmbeddedYamlFile;
    fetch?: typeof fetch;
  } = {},
) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const parsed = parseCliArguments(arguments_);
  const narrativeControlEnabled =
    parsed.narrativeControlEnabled ?? dsl4StandardProductionFeatureFlags.dsl4NarrativeControl;
  if ('options' in parsed && ['build-dsl4', 'preview-dsl4'].includes(parsed.action)) {
    const options = parsed.options as {featureFlags?: Record<string, unknown>};
    options.featureFlags = {
      ...options.featureFlags,
      dsl4NarrativeControl: narrativeControlEnabled,
    };
  }
  if (parsed.action === 'help') {
    stdout.write(`${usage()}\n`);
    return null;
  }
  if (parsed.action === 'version') {
    stdout.write(`${packageVersion}\n`);
    return null;
  }
  if (parsed.action === 'convert') {
    const result = await convertDsl32File(parsed.options);
    for (const diagnostic of result.diagnostics) {
      stderr.write(`${formatConversionDiagnostic(diagnostic)}\n`);
    }
    if (!result.ok || !result.outputPath) {
      const errorCount = result.diagnostics.filter(
        (diagnostic) => diagnostic.severity === 'error',
      ).length;
      throw new Dsl32ConversionError(
        `DSL 3.2 to 4.0 conversion failed with ${errorCount} error(s).`,
        result.diagnostics,
        {reported: true},
      );
    }
    stdout.write(`Converted ${result.outputPath}\n`);
    return result;
  }
  if (parsed.action === 'build') {
    const result = await buildSb3Bundle(parsed.options);
    stdout.write(`Built ${result.outputPaths[`${parsed.options.outputName}.sb3`]}\n`);
    stdout.write(`Built ${result.outputPaths[`${parsed.options.outputName}.txt`]}\n`);
    stdout.write(`Built ${result.outputPaths[`${parsed.options.outputName}.manifest.json`]}\n`);
    return result;
  }
  const schema = JSON.parse(await readFile(dsl4SchemaUrl, 'utf8'));
  if (parsed.action === 'migrate-embedded-yaml') {
    const {documentMap, ...options} = parsed.options;
    const mapping =
      documentMap === undefined ? undefined : JSON.parse(await readFile(documentMap, 'utf8'));
    if (
      mapping !== undefined &&
      (!mapping ||
        typeof mapping !== 'object' ||
        Array.isArray(mapping) ||
        Object.values(mapping).some((value) => typeof value !== 'string'))
    )
      throw new Sb3BuilderError(
        '--document-map must contain a JSON object mapping labels to filenames.',
        {stage: 'cli'},
      );
    const result = await (dependencies.runEmbeddedYamlMigration ?? migrateDsl4EmbeddedYamlFile)({
      ...options,
      ...(mapping === undefined ? {} : {documentPaths: mapping}),
      narrativeControlEnabled,
      sourceFrontend: createDsl4ProductionSourceFrontend(schema, {
        narrativeControlEnabled,
        limits: {maxCanonicalSourceBytes: dsl4CliDefaultLimits.maxSourceBytes},
      }),
    });
    stdout.write(`Migrated ${result.outputPath} (${result.report.documents.length} documents)\n`);
    for (const warning of result.report.warnings) stderr.write(`Warning: ${warning}\n`);
    return result;
  }
  if (parsed.action === 'save-sb3-format') {
    const selection = normalizeSb3SaveSelection(parsed.options.selection);
    const extensionURLs =
      parsed.options.extensionURLs === undefined
        ? {}
        : JSON.parse(await readFile(parsed.options.extensionURLs, 'utf8'));
    if (
      !extensionURLs ||
      typeof extensionURLs !== 'object' ||
      Array.isArray(extensionURLs) ||
      Object.values(extensionURLs).some((value) => typeof value !== 'string')
    )
      throw new Sb3BuilderError(
        '--extension-urls must contain a JSON object mapping extension IDs to HTTPS URLs.',
        {stage: 'cli'},
      );
    // Bound the input before reading it, as the other SB3-reading commands do.
    const inputState = await lstat(parsed.options.input);
    if (!inputState.isFile())
      throw new Sb3BuilderError('--input must be a regular file.', {stage: 'cli'});
    if (inputState.size > parsed.options.maxInputBytes)
      throw new Sb3BuilderError(
        `--input is ${inputState.size} bytes, more than --max-input-bytes ${parsed.options.maxInputBytes}.`,
        {stage: 'cli'},
      );
    const {archive, project} = readSb3(await readFile(parsed.options.input));
    const converted =
      selection.extensions === undefined
        ? []
        : (
            await writeSb3ExtensionFormat(archive, project, selection.extensions, {
              urls: extensionURLs,
              unsandboxed: parsed.options.unsandboxed,
              keepEmbeddedData: parsed.options.keepEmbeddedData,
              fetch: dependencies.fetch,
            })
          ).converted;
    // Check what a host will load before writing an SB3 that only looks finished.
    const urlsChecked =
      selection.extensions === undefined || parsed.options.skipUrlCheck
        ? []
        : await verifySb3ExtensionUrls(project, {fetch: dependencies.fetch});
    await writeFile(parsed.options.output, serializeSb3(archive, project));
    // Name what this command left alone, so an unset option is never mistaken for a conversion.
    stdout.write(
      `Saved ${path.basename(parsed.options.output)}: ` +
        (selection.extensions === undefined
          ? 'extensions kept as they were'
          : `extensions as ${selection.extensions} (${converted.length} converted)`) +
        (urlsChecked.length ? `, ${urlsChecked.length} URL(s) checked` : '') +
        '; source and assets kept as built.' +
        // Saying which form was written is not the same as saying the work runs offline. The copy
        // a cacheable reference permits is made by a viewer's browser, not here.
        (selection.extensions === 'remote-cacheable'
          ? " No copy is kept here; a viewer's browser makes one when it opens the work and does" +
            ' not decline.'
          : '') +
        '\n',
    );
    if (
      parsed.options.skipUrlCheck &&
      ['remote-non-cacheable', 'remote-cacheable'].includes(selection.extensions ?? '')
    )
      stderr.write('Warning: --skip-url-check: no recorded URL was confirmed.\n');
    return {outputPath: parsed.options.output, selection, converted};
  }
  if (parsed.action === 'convert-dsl4-assets') {
    const runAssetConverter = dependencies.runAssetConverter ?? convertDsl4ProjectAssets;
    if (typeof runAssetConverter !== 'function') {
      throw new TypeError('runAssetConverter must be a function');
    }
    const result = await runAssetConverter({
      ...parsed.options,
      sourceFrontend: createDsl4ProductionSourceFrontend(schema, {
        narrativeControlEnabled: narrativeControlEnabled,
        limits: {maxCanonicalSourceBytes: parsed.options.maxSourceBytes},
      }),
    });
    stdout.write(`Converted ${Object.keys(result.converted).length} asset(s)\n`);
    stdout.write(`Saved ${path.basename(result.sourceManifestPath)}\n`);
    stdout.write(`Saved ${path.basename(result.sourcePath)}\n`);
    stdout.write(`Saved ${path.basename(result.sb3Path)}\n`);
    return result;
  }
  if (parsed.action === 'audit-dsl4-definitions') {
    const result = await auditDsl4ProjectDefinitions({
      ...parsed.options,
      schema,
      sourceFrontend: createDsl4ProductionSourceFrontend(schema, {
        narrativeControlEnabled,
        limits: {maxCanonicalSourceBytes: parsed.options.maxSourceBytes},
      }),
    });
    stdout.write(
      parsed.options.format === 'json'
        ? JSON.stringify(result, null, 2) + '\n'
        : formatDsl4DefinitionAudit(result),
    );
    return {...result, exitCode: result.ok ? 0 : 1};
  }
  if (parsed.action === 'validate-dsl4') {
    const result = await validateDsl4SourceFile({
      ...parsed.options,
      sourceFrontend: createDsl4ProductionSourceFrontend(schema, {
        narrativeControlEnabled: narrativeControlEnabled,
        limits: {maxCanonicalSourceBytes: parsed.options.maxSourceBytes},
      }),
    });
    if (parsed.options.format === 'json') {
      stdout.write(serializeDsl4ValidationResult(result));
    } else if (parsed.options.format === 'canonical-json') {
      // 不正な入力では何も出さず、pretty と同じ診断を stderr へ出して 1 で終える。
      if (result.ok) {
        stdout.write(serializeDsl4CanonicalDocument(result));
      } else {
        for (const diagnostic of result.diagnostics) {
          stderr.write(
            `${formatDsl4Diagnostic(diagnostic, path.basename(parsed.options.input))}\n`,
          );
        }
      }
    } else if (result.ok) {
      stdout.write(`${path.basename(parsed.options.input)}: valid\n`);
    } else {
      for (const diagnostic of result.diagnostics) {
        stderr.write(`${formatDsl4Diagnostic(diagnostic, path.basename(parsed.options.input))}\n`);
      }
    }
    return {...result, exitCode: result.ok ? 0 : 1};
  }
  if (parsed.action === 'author-block-dsl') {
    const displaySource = path.basename(parsed.options.input);
    const [sourceText, baseBytes] = await Promise.all([
      readFile(parsed.options.input, 'utf8'),
      readFile(parsed.options.base),
    ]);
    const sourceGraph = await loadDsl4BuildSourceGraph(
      path.dirname(parsed.options.input),
      {
        manifest: {path: path.basename(parsed.options.input)},
        descriptor: {text: sourceText},
      },
      {
        limits: {
          maxSourceBytes: parsed.options.maxSourceBytes,
          maxTotalSourceBytes: parsed.options.maxTotalSourceBytes,
          maxSourceFiles: parsed.options.maxSourceFiles,
          maxIncludeDepth: parsed.options.maxIncludeDepth,
        },
      },
    );
    const result = await authorDsl4BlockSourceGraphSb3({
      baseBytes: new Uint8Array(baseBytes),
      ...(narrativeControlEnabled
        ? {narrativeRuntimeSource: await readDsl4NarrativeRuntimeExtensionSource('authoring')}
        : {}),
      sourceGraph,
      sourceSections: parsed.options.sourceSections,
      sourceFrontend: createDsl4ProductionSourceFrontend(schema, {
        narrativeControlEnabled: narrativeControlEnabled,
        limits: {maxCanonicalSourceBytes: parsed.options.maxSourceBytes},
      }),
    });
    if (!result.ok) {
      for (const diagnostic of result.diagnostics) {
        stderr.write(`${formatDsl4Diagnostic({...diagnostic}, displaySource)}\n`);
      }
      return {ok: false, diagnostics: result.diagnostics, exitCode: 1};
    }
    await writeFile(parsed.options.output, result.bytes);
    stdout.write(`Authored ${path.basename(parsed.options.output)} holding ${result.sourcePath}\n`);
    return {ok: true, sourcePath: result.sourcePath, exitCode: 0};
  }
  if (parsed.action === 'export-block-dsl') {
    const runBlockDslExport = dependencies.runBlockDslExport ?? exportDsl4BlockSourcesToYaml;
    if (typeof runBlockDslExport !== 'function') {
      throw new TypeError('runBlockDslExport must be a function');
    }
    const displaySource = path.basename(parsed.options.input);
    try {
      const result = await runBlockDslExport({
        ...parsed.options,
        sourceFrontend: createDsl4ProductionSourceFrontend(schema, {
          narrativeControlEnabled:
            parsed.narrativeControlEnabled ??
            dsl4StandardProductionFeatureFlags.dsl4NarrativeControl,
          limits: {
            maxCanonicalSourceBytes:
              parsed.options.maxTotalSourceBytes ?? parsed.options.maxSourceBytes,
          },
        }),
      });
      if (parsed.options.format === 'json') {
        stdout.write(`${JSON.stringify({version: 1, ok: true, ...result})}\n`);
      } else {
        stdout.write(`Exported ${path.basename(result.outputPath)}\n`);
        for (const file of result.files) stdout.write(`  ${file.path}\n`);
      }
      return {...result, exitCode: 0};
    } catch (error) {
      if (!(error instanceof Dsl4BlockSourceExportError)) throw error;
      if (parsed.options.format === 'json') {
        stdout.write(
          `${JSON.stringify({
            version: 1,
            ok: false,
            code: error.code,
            message: error.message,
            diagnostics: error.diagnostics,
          })}\n`,
        );
      } else {
        stderr.write(formatDsl4BlockSourceExportFailure(error, displaySource));
      }
      throw Object.assign(error, {reported: true, exitCode: 1});
    }
  }
  if (parsed.action === 'audit-dsl4-assets') {
    const runAssetAudit = dependencies.runAssetAudit ?? auditDsl4AssetDistribution;
    if (typeof runAssetAudit !== 'function') {
      throw new TypeError('runAssetAudit must be a function');
    }
    const result = await runAssetAudit({
      ...parsed.options,
      sourceFrontend: createDsl4ProductionSourceFrontend(schema, {
        narrativeControlEnabled: narrativeControlEnabled,
        limits: {
          maxCanonicalSourceBytes:
            parsed.options.maxTotalSourceBytes ?? parsed.options.maxSourceBytes,
        },
      }),
    });
    stdout.write(
      parsed.options.format === 'json'
        ? serializeDsl4AssetDistributionAudit(result)
        : formatDsl4AssetDistributionAudit(result),
    );
    return {...result, exitCode: 0};
  }
  if (parsed.action === 'lock-dsl4-assets') {
    const runAssetLock = dependencies.runAssetLock ?? generateDsl4AssetDistributionLockFile;
    if (typeof runAssetLock !== 'function') throw new TypeError('runAssetLock must be a function');
    const result = await runAssetLock({
      ...parsed.options,
      sourceFrontend: createDsl4ProductionSourceFrontend(schema, {
        narrativeControlEnabled: narrativeControlEnabled,
        limits: {
          maxCanonicalSourceBytes:
            parsed.options.maxTotalSourceBytes ?? parsed.options.maxSourceBytes,
        },
      }),
    });
    stdout.write(`Locked ${path.basename(result.outputPath)}\n`);
    return result;
  }
  if (parsed.action === 'vendor-dsl4-assets') {
    const runAssetVendor = dependencies.runAssetVendor ?? vendorDsl4AssetDistribution;
    if (typeof runAssetVendor !== 'function')
      throw new TypeError('runAssetVendor must be a function');
    const result = await runAssetVendor(parsed.options);
    stdout.write(`Vendored ${result.vendoredAssets.length} asset(s)\n`);
    return result;
  }
  if (parsed.action === 'preview-dsl4') {
    const runPreview = dependencies.runPreview ?? runDsl4LocalPreviewCommand;
    if (typeof runPreview !== 'function') throw new TypeError('runPreview must be a function');
    return runPreview(
      {
        ...parsed.options,
        sourceFrontend: createDsl4ProductionSourceFrontend(schema, {
          narrativeControlEnabled:
            parsed.narrativeControlEnabled ??
            dsl4StandardProductionFeatureFlags.dsl4NarrativeControl,
          limits: {
            maxCanonicalSourceBytes:
              parsed.options.maxTotalSourceBytes ?? parsed.options.maxSourceBytes,
          },
        }),
      },
      {stdout, stderr},
    );
  }
  const result = await buildDsl4RuntimeComponentFile({
    ...parsed.options,
    sourceFrontend: createDsl4ProductionSourceFrontend(schema, {
      narrativeControlEnabled: narrativeControlEnabled,
      limits: {
        maxCanonicalSourceBytes:
          parsed.options.maxTotalSourceBytes ?? parsed.options.maxSourceBytes,
      },
    }),
  });
  stdout.write(`Built ${path.basename(result.outputPath)}\n`);
  return result;
}
