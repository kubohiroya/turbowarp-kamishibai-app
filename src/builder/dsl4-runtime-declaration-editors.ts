import {
  createDsl4BlockAuthoringEditorDefinitions,
  createDsl4CoreActionBlockEditorDefinitions,
} from './dsl4-block-authoring-editors.js';
import {
  dsl4BlockAuthoringExtensionId,
  dsl4BlockSourceBundleExtensionId,
  dsl4BlockSourceRuntimeExtensionId,
  dsl4RuntimeOpcodePrefix,
  type Dsl4BlockOpcodeForm,
} from '../dsl4/block-source-shared.js';
import {createDsl4NarrativeRowsEditor} from '../dsl4/narrative-row-editor.js';
import {installDsl4SectionAppearance} from '../dsl4/block-source-section-appearance.js';

interface EditorRegistration {
  readonly extensionId: string;
  readonly opcodes: readonly string[];
  readonly editorId?: string;
  readonly [key: string]: unknown;
}

const legacyPrefix = `${dsl4BlockAuthoringExtensionId}_`;
const forms: readonly Dsl4BlockOpcodeForm[] = ['runtime', 'bundle'];

function extensionIdOf(form: Dsl4BlockOpcodeForm) {
  return form === 'bundle' ? dsl4BlockSourceBundleExtensionId : dsl4BlockSourceRuntimeExtensionId;
}

/** Move a registration written for the retired extension onto the runtime's opcodes in a form. */
function retarget<T extends EditorRegistration>(registration: T, form: Dsl4BlockOpcodeForm): T {
  return {
    ...registration,
    extensionId: extensionIdOf(form),
    opcodes: registration.opcodes.map((opcode) =>
      opcode.startsWith(legacyPrefix)
        ? dsl4RuntimeOpcodePrefix(form) + opcode.slice(legacyPrefix.length)
        : opcode,
    ),
  };
}

/**
 * The schema forms the runtime registers for its declarations and actions, under its own ID.
 *
 * Inside the Standard bundle, the bundle hands its members a `blockEditors` that accepts only the
 * member's own extension ID and opcodes for schema, source and fixed-input editors, and rewrites
 * them into the bundle's namespace. Loaded alone, the runtime's own ID is the right one already. So
 * one registration in the runtime's form serves both; one in the bundle's form is refused inside
 * the bundle. These used to ship in the retired Block Script extension, one copy per form.
 */
export function createDsl4RuntimeDeclarationEditorDefinitions({
  narrativeControlEnabled,
}: {
  narrativeControlEnabled: boolean;
}): EditorRegistration[] {
  const declarations = createDsl4BlockAuthoringEditorDefinitions(dsl4BlockAuthoringExtensionId, {
    narrativeControlEnabled,
  }) as EditorRegistration[];
  return [
    ...declarations.map((registration) => retarget(registration, 'runtime')),
    ...(createDsl4CoreActionBlockEditorDefinitions('runtime', {
      narrativeControlEnabled,
    }) as EditorRegistration[]),
  ];
}

interface BlockEditorApi {
  apiVersion?: unknown;
  registerSchema?: (definition: unknown) => () => void;
  register?: (editor: unknown) => () => void;
}

interface DeclarationEditorHost {
  gui?: {blockEditors?: BlockEditorApi; [key: string]: unknown};
  [key: string]: unknown;
}

/**
 * Register the declaration forms and the disabled-section appearance in an editor. Returns the
 * function that removes all of it; a missing editor API leaves nothing to remove.
 */
export function installDsl4RuntimeDeclarationEditors(
  Scratch: DeclarationEditorHost,
  {narrativeControlEnabled}: {narrativeControlEnabled: boolean},
): () => void {
  const cleanup: (() => void)[] = [];
  let disposed = false;
  const dispose = () => {
    disposed = true;
    for (const remove of cleanup.splice(0).reverse()) remove();
  };
  installDsl4SectionAppearance(
    Scratch as Parameters<typeof installDsl4SectionAppearance>[0],
    () => disposed,
  )
    .then((remove) => {
      if (!remove) return;
      if (disposed) remove();
      else cleanup.push(remove);
    })
    .catch((error: unknown) =>
      console.warn('Kamishibai section appearance could not be installed.', error),
    );
  const api = Scratch.gui?.blockEditors;
  if (api?.apiVersion !== 1 || typeof api.registerSchema !== 'function') return dispose;
  // Each registration stands alone, so one the host refuses does not take the others with it.
  const register = (add: () => () => void) => {
    try {
      cleanup.push(add());
    } catch (error) {
      console.warn('A Kamishibai definition form could not be registered.', error);
    }
  };
  const rowsEditor = narrativeControlEnabled && typeof api.register === 'function';
  for (const definition of createDsl4RuntimeDeclarationEditorDefinitions({
    narrativeControlEnabled,
  })) {
    // The rows dialog replaces its schema form where the editor can host it.
    if (narrativeControlEnabled && definition.editorId === 'narrative-condition') continue;
    if (rowsEditor && definition.editorId === 'narrative-rows') continue;
    register(() => api.registerSchema!(definition));
  }
  if (rowsEditor) {
    // A custom editor passes through the bundle unchanged, so it names both spellings itself.
    const editor = createDsl4NarrativeRowsEditor(dsl4BlockAuthoringExtensionId);
    for (const form of forms) register(() => api.register!(retarget(editor, form)));
  }
  return dispose;
}
