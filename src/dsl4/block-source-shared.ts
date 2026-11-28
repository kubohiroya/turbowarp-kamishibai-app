export const dsl4BlockSourceRuntimeExtensionId = 'kubohiroyakamishibairuntime4';
export const dsl4BlockSourceBundleExtensionId = 'kubohiroyakamishibai4';
/**
 * The retired Block Script extension. Projects saved before the palettes were unified still carry
 * it and its opcodes; readers accept them, writers no longer produce them.
 */
export const dsl4BlockAuthoringExtensionId = 'kubohiroyakamishibaiauthoring4';
/**
 * The hats a block-source project keeps its YAML under, in the retired extension's spelling.
 *
 * Codecs compare canonical opcodes (see `canonicalDsl4AuthoringOpcode`), so these constants stay the
 * one internal name for each hat whichever extension a saved project used.
 */
export const dsl4LabeledBlockSourceHatOpcode = `${dsl4BlockAuthoringExtensionId}_kamishibai`;
export const dsl4ConfigBlockSourceHatOpcode = `${dsl4BlockAuthoringExtensionId}_kamishibaiConfig`;

/**
 * The marker a runtime carries when it defines the Block Script declarations itself. A writer whose
 * base runtime lacks it keeps the retired extension and its spelling, so older bases still render.
 */
export const dsl4UnifiedDeclarationsRuntimeCapability =
  '// Kamishibai capabilities: unified-declarations-v1';

/** Which extension a writer gives the declarations: the runtime, or the retired Block Script. */
export type Dsl4DeclarationSpelling = 'unified' | 'legacy';

/** How the base project's runtime spells its opcodes: alone, or inside the Standard bundle. */
export type Dsl4BlockOpcodeForm = 'runtime' | 'bundle';

/**
 * Every Block Script declaration the runtime now defines itself. A block whose name is listed
 * here is a declaration in any of the three spellings; anything else under the runtime prefix is a
 * runtime block.
 */
export const dsl4AuthoringBlockNames: ReadonlySet<string> = new Set([
  'kamishibai',
  'kamishibaiConfig',
  'includeBlocks',
  'property',
  'asset',
  'control',
  'actor',
  'textStyle',
  'variable',
  'cover',
  'loading',
  'recognition',
  'viewport',
  'scene',
  'useSection',
  'actionOptions',
  'poseSteps',
  'poseStep',
  'narrativeIf',
  'narrativeRepeat',
  'narrativeForEach',
  'narrativeReference',
  'narrativeVariable',
  'narrativeCompare',
  'narrativeLogic',
  'narrativeLogicList',
  'narrativeNot',
  'customAction',
]);
/** Menus the declarations own; their shadow blocks move with them. */
export const dsl4AuthoringMenuNames: ReadonlySet<string> = new Set(['sectionEnabled']);

const legacyAuthoringPrefix = `${dsl4BlockAuthoringExtensionId}_`;
const legacyAuthoringMenuPrefix = `${dsl4BlockAuthoringExtensionId}_menu_`;

/** The opcode prefix of a runtime block in the given form. */
export function dsl4RuntimeOpcodePrefix(form: Dsl4BlockOpcodeForm): string {
  return form === 'bundle'
    ? `${dsl4BlockSourceBundleExtensionId}_${dsl4BlockSourceRuntimeExtensionId}__`
    : `${dsl4BlockSourceRuntimeExtensionId}_`;
}

/** A menu shadow's opcode and field in the given form. */
export function dsl4RuntimeMenuIdentity(
  form: Dsl4BlockOpcodeForm,
  name: string,
): {opcode: string; field: string} {
  const field = form === 'bundle' ? `${dsl4BlockSourceRuntimeExtensionId}__${name}` : name;
  const extension =
    form === 'bundle' ? dsl4BlockSourceBundleExtensionId : dsl4BlockSourceRuntimeExtensionId;
  return {opcode: `${extension}_menu_${field}`, field};
}

/** The opcode a writer gives a declaration in the base project's form. */
export function dsl4AuthoringOpcode(name: string, form: Dsl4BlockOpcodeForm): string {
  if (!dsl4AuthoringBlockNames.has(name))
    throw new TypeError(`Unknown Block Script declaration: ${name}`);
  return `${dsl4RuntimeOpcodePrefix(form)}${name}`;
}

/** The declaration name of an opcode in any spelling, or null when it is not a declaration. */
export function dsl4AuthoringBlockName(opcode: unknown): string | null {
  if (typeof opcode !== 'string') return null;
  for (const prefix of [
    legacyAuthoringPrefix,
    dsl4RuntimeOpcodePrefix('runtime'),
    dsl4RuntimeOpcodePrefix('bundle'),
  ]) {
    if (!opcode.startsWith(prefix)) continue;
    const name = opcode.slice(prefix.length);
    if (dsl4AuthoringBlockNames.has(name)) return name;
  }
  return null;
}

/** The declaration menu name of a shadow opcode in any spelling, or null. */
function dsl4AuthoringMenuName(opcode: string): string | null {
  if (opcode.startsWith(legacyAuthoringMenuPrefix)) {
    const name = opcode.slice(legacyAuthoringMenuPrefix.length);
    return dsl4AuthoringMenuNames.has(name) ? name : null;
  }
  for (const form of ['runtime', 'bundle'] as const) {
    for (const name of dsl4AuthoringMenuNames)
      if (opcode === dsl4RuntimeMenuIdentity(form, name).opcode) return name;
  }
  return null;
}

/**
 * The one spelling codecs compare against: the retired extension's. Opcodes that are not
 * declarations, including every runtime block, come back unchanged.
 */
export function canonicalDsl4AuthoringOpcode(opcode: string): string {
  const name = dsl4AuthoringBlockName(opcode);
  if (name !== null) return `${legacyAuthoringPrefix}${name}`;
  const menu = dsl4AuthoringMenuName(opcode);
  return menu === null ? opcode : `${legacyAuthoringMenuPrefix}${menu}`;
}

/**
 * A view of a project's blocks with every declaration in the canonical spelling.
 *
 * Block objects whose opcode already is canonical, or that are not declarations, are shared; the
 * others are shallow copies, so the caller's project is never changed. Menu shadows also get their
 * field renamed back to the menu's bare name.
 */
export function canonicalizeDsl4AuthoringBlocks<T extends Record<string, unknown>>(blocks: T): T {
  let result: Record<string, unknown> | null = null;
  for (const [id, block] of Object.entries(blocks)) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
    const opcode = (block as {opcode?: unknown}).opcode;
    if (typeof opcode !== 'string') continue;
    const canonical = canonicalDsl4AuthoringOpcode(opcode);
    if (canonical === opcode) continue;
    const copy: Record<string, unknown> = {
      ...(block as Record<string, unknown>),
      opcode: canonical,
    };
    if (canonical.startsWith(legacyAuthoringMenuPrefix)) {
      const menu = canonical.slice(legacyAuthoringMenuPrefix.length);
      const fields = (block as {fields?: unknown}).fields;
      if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
        copy.fields = Object.fromEntries(
          Object.entries(fields).map(([field, value]) => [
            field === dsl4RuntimeMenuIdentity('bundle', menu).field ? menu : field,
            value,
          ]),
        );
      }
    }
    result ??= {...blocks};
    result[id] = copy;
  }
  return (result ?? blocks) as T;
}

/**
 * Rewrite canonical declarations into the given form, in place. Writers build blocks with the
 * canonical opcodes and call this once, so only one place knows how a form spells them.
 */
export function formDsl4AuthoringBlocks(
  blocks: Record<string, unknown>,
  form: Dsl4BlockOpcodeForm,
): void {
  for (const block of Object.values(blocks)) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
    const record = block as {opcode?: unknown; fields?: unknown};
    if (typeof record.opcode !== 'string') continue;
    if (record.opcode.startsWith(legacyAuthoringMenuPrefix)) {
      const menu = record.opcode.slice(legacyAuthoringMenuPrefix.length);
      if (!dsl4AuthoringMenuNames.has(menu)) continue;
      const identity = dsl4RuntimeMenuIdentity(form, menu);
      record.opcode = identity.opcode;
      if (record.fields && typeof record.fields === 'object' && !Array.isArray(record.fields)) {
        record.fields = Object.fromEntries(
          Object.entries(record.fields).map(([field, value]) => [
            field === menu ? identity.field : field,
            value,
          ]),
        );
      }
      continue;
    }
    if (!record.opcode.startsWith(legacyAuthoringPrefix)) continue;
    const name = record.opcode.slice(legacyAuthoringPrefix.length);
    if (dsl4AuthoringBlockNames.has(name)) record.opcode = dsl4AuthoringOpcode(name, form);
  }
}

/** Whether an opcode, in any spelling, is the labelled source hat. */
export function isDsl4LabeledBlockSourceHat(opcode: unknown): boolean {
  return dsl4AuthoringBlockName(opcode) === 'kamishibai';
}
/** Whether an opcode, in any spelling, is the shared configuration hat. */
export function isDsl4ConfigBlockSourceHat(opcode: unknown): boolean {
  return dsl4AuthoringBlockName(opcode) === 'kamishibaiConfig';
}
/** Whether an opcode, in any spelling, is the block that pulls in a labelled source. */
export function isDsl4IncludeBlocks(opcode: unknown): boolean {
  return dsl4AuthoringBlockName(opcode) === 'includeBlocks';
}
/** Whether an opcode, in any spelling, is either source hat. */
export function isDsl4BlockSourceHat(opcode: unknown): boolean {
  return isDsl4LabeledBlockSourceHat(opcode) || isDsl4ConfigBlockSourceHat(opcode);
}

export class Dsl4BlockSourceError extends Error {
  readonly code: string;
  readonly targetName: string | null;
  readonly blockId: string | null;

  constructor(
    code: string,
    message: string,
    details: {targetName?: string; blockId?: string; cause?: unknown} = {},
  ) {
    super(message, details.cause === undefined ? undefined : {cause: details.cause});
    this.name = 'Dsl4BlockSourceError';
    this.code = code;
    this.targetName = details.targetName ?? null;
    this.blockId = details.blockId ?? null;
  }
}
