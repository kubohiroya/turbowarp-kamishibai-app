import {
  canonicalizeDsl4AuthoringBlocks,
  dsl4AuthoringBlockName,
  dsl4AuthoringMenuNames,
  dsl4BlockAuthoringExtensionId,
  dsl4BlockSourceBundleExtensionId,
  dsl4BlockSourceRuntimeExtensionId,
  formDsl4AuthoringBlocks,
  type Dsl4BlockOpcodeForm,
} from './block-source-shared.js';
import {extractDsl4BlockSourcesFromProject} from './turbowarp-yaml-json-block-source.js';

type ObjectRecord = Record<string, unknown>;

/** What a palette migration changed, for the CLI report. */
export interface Dsl4BlockPaletteMigrationReport {
  readonly direction: 'unify' | 'restore';
  readonly form: Dsl4BlockOpcodeForm;
  /** Declaration blocks and menu shadows whose opcode was rewritten. */
  readonly rewrittenBlocks: number;
  /** Whether the retired Block Script extension was removed (unify) or added back (restore). */
  readonly authoringExtensionChanged: boolean;
  /** Source files the block story reads, compared before and after the rewrite. */
  readonly verifiedSources: readonly string[];
}

export class Dsl4BlockPaletteMigrationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'Dsl4BlockPaletteMigrationError';
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new Dsl4BlockPaletteMigrationError(code, message);
}

function isRecord(value: unknown): value is ObjectRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function targetsOf(project: ObjectRecord): ObjectRecord[] {
  if (!Array.isArray(project.targets) || !project.targets.every(isRecord))
    fail('K4-MIGRATION-PALETTE-PROJECT', 'The project has no readable targets.');
  return project.targets as ObjectRecord[];
}

/** The opcode form the project's own runtime uses; the declarations follow it. */
export function dsl4ProjectOpcodeForm(project: ObjectRecord): Dsl4BlockOpcodeForm {
  const declared = new Set(Array.isArray(project.extensions) ? project.extensions : []);
  if (declared.has(dsl4BlockSourceBundleExtensionId)) return 'bundle';
  if (declared.has(dsl4BlockSourceRuntimeExtensionId)) return 'runtime';
  fail(
    'K4-MIGRATION-PALETTE-RUNTIME',
    `The project must load ${dsl4BlockSourceBundleExtensionId} or ${dsl4BlockSourceRuntimeExtensionId}.`,
  );
}

/** Whether a block's opcode is a declaration, or a declaration menu, in the retired spelling. */
function isRetiredSpelling(opcode: unknown): boolean {
  if (typeof opcode !== 'string' || !opcode.startsWith(`${dsl4BlockAuthoringExtensionId}_`))
    return false;
  if (dsl4AuthoringBlockName(opcode) !== null) return true;
  const menu = opcode.slice(`${dsl4BlockAuthoringExtensionId}_menu_`.length);
  return (
    opcode.startsWith(`${dsl4BlockAuthoringExtensionId}_menu_`) && dsl4AuthoringMenuNames.has(menu)
  );
}

/** Read the block story the way the builder does, so the comparison is about meaning. */
function readSources(project: ObjectRecord): Record<string, string> | null {
  const hasDeclarations = targetsOf(project).some(
    (target) =>
      isRecord(target.blocks) &&
      Object.values(target.blocks).some(
        (block) => isRecord(block) && dsl4AuthoringBlockName(block.opcode) === 'kamishibai',
      ),
  );
  return hasDeclarations ? {...extractDsl4BlockSourcesFromProject(project).sources} : null;
}

function rewrite(
  project: ObjectRecord,
  direction: 'unify' | 'restore',
  form: Dsl4BlockOpcodeForm,
): number {
  let rewritten = 0;
  for (const target of targetsOf(project)) {
    if (!isRecord(target.blocks)) continue;
    const blocks = target.blocks;
    if (direction === 'unify') {
      // Only the retired spelling moves; a block already in a runtime spelling stays as it is.
      const retired = Object.fromEntries(
        Object.entries(blocks).filter(
          ([, block]) => isRecord(block) && isRetiredSpelling(block.opcode),
        ),
      );
      formDsl4AuthoringBlocks(retired, form);
      rewritten += Object.keys(retired).length;
      Object.assign(blocks, retired);
    } else {
      const canonical = canonicalizeDsl4AuthoringBlocks(blocks);
      for (const [id, block] of Object.entries(canonical))
        if (block !== blocks[id]) {
          blocks[id] = block;
          rewritten += 1;
        }
    }
  }
  return rewritten;
}

/** Drop the retired extension from the project's extension list, URLs and a Plus manifest. */
function removeAuthoringExtension(project: ObjectRecord): boolean {
  let changed = false;
  if (
    Array.isArray(project.extensions) &&
    project.extensions.includes(dsl4BlockAuthoringExtensionId)
  ) {
    project.extensions = project.extensions.filter((id) => id !== dsl4BlockAuthoringExtensionId);
    changed = true;
  }
  if (
    isRecord(project.extensionURLs) &&
    Object.hasOwn(project.extensionURLs, dsl4BlockAuthoringExtensionId)
  ) {
    delete project.extensionURLs[dsl4BlockAuthoringExtensionId];
    changed = true;
  }
  if (
    isRecord(project.extensionStorage) &&
    Object.hasOwn(project.extensionStorage, dsl4BlockAuthoringExtensionId)
  ) {
    delete project.extensionStorage[dsl4BlockAuthoringExtensionId];
    changed = true;
  }
  const manifest = project.turboWarpPlus;
  if (isRecord(manifest) && Array.isArray(manifest.extensions)) {
    const kept = manifest.extensions.filter(
      (entry) => !isRecord(entry) || entry.id !== dsl4BlockAuthoringExtensionId,
    );
    if (kept.length !== manifest.extensions.length) {
      manifest.extensions = kept;
      changed = true;
    }
  }
  return changed;
}

function compare(before: Record<string, string> | null, after: Record<string, string> | null) {
  if (JSON.stringify(before) !== JSON.stringify(after))
    fail(
      'K4-MIGRATION-PALETTE-NOT-EQUIVALENT',
      'The rewritten blocks no longer read as the same story.',
    );
  return Object.keys(after ?? {}).sort();
}

/**
 * Move a project's Block Script declarations onto its runtime's opcodes and drop the retired
 * extension. The project must already carry a runtime that defines the declarations; the caller
 * checks that, since only it can read the runtime's source.
 *
 * Returns a new project; the input is left as it was. The story read from the blocks must be the
 * same before and after, or nothing is returned.
 */
export function unifyDsl4BlockPaletteProject(input: ObjectRecord): {
  project: ObjectRecord;
  report: Dsl4BlockPaletteMigrationReport;
} {
  const project = structuredClone(input);
  const form = dsl4ProjectOpcodeForm(project);
  const before = readSources(project);
  const rewrittenBlocks = rewrite(project, 'unify', form);
  const authoringExtensionChanged = removeAuthoringExtension(project);
  const verifiedSources = compare(before, readSources(project));
  return {
    project,
    report: {direction: 'unify', form, rewrittenBlocks, authoringExtensionChanged, verifiedSources},
  };
}

/**
 * Undo `unifyDsl4BlockPaletteProject`: give the declarations the retired extension's opcodes and
 * declare that extension with the given source, for a project that must open on an older runtime.
 */
export function restoreDsl4BlockPaletteProject(
  input: ObjectRecord,
  authoringExtensionSource: string,
): {project: ObjectRecord; report: Dsl4BlockPaletteMigrationReport} {
  if (
    typeof authoringExtensionSource !== 'string' ||
    !authoringExtensionSource.includes(`// ID: ${dsl4BlockAuthoringExtensionId}\n`)
  )
    fail(
      'K4-MIGRATION-PALETTE-AUTHORING',
      'A Block Script extension source is required to restore.',
    );
  const project = structuredClone(input);
  const form = dsl4ProjectOpcodeForm(project);
  const before = readSources(project);
  const rewrittenBlocks = rewrite(project, 'restore', form);
  const extensions = Array.isArray(project.extensions) ? project.extensions : [];
  const alreadyDeclared = extensions.includes(dsl4BlockAuthoringExtensionId);
  project.extensions = alreadyDeclared
    ? extensions
    : [...extensions, dsl4BlockAuthoringExtensionId];
  if (!isRecord(project.extensionURLs)) project.extensionURLs = {};
  (project.extensionURLs as ObjectRecord)[dsl4BlockAuthoringExtensionId] =
    'data:text/javascript;base64,' + base64(authoringExtensionSource);
  const verifiedSources = compare(before, readSources(project));
  return {
    project,
    report: {
      direction: 'restore',
      form,
      rewrittenBlocks,
      authoringExtensionChanged: !alreadyDeclared,
      verifiedSources,
    },
  };
}

function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}
