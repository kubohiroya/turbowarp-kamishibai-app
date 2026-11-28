import {dsl4CoreActionManifest} from './core-action-manifest.js';
import type {ActionContext} from './runtime-controller.js';

const coreActionNames = new Set(dsl4CoreActionManifest.map(({command}) => command));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
}

function invalidResult(message: string) {
  const error = new Error(message);
  Object.defineProperty(error, 'code', {value: 'K4-RUNTIME-RESULT-001'});
  return error;
}

function requireFunction(value: unknown, name: string) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
  return value;
}

/**
 * Create the command dispatcher shared by YAML execution and the TurboWarp
 * action surface. Callers must pass an already normalized StoryDocument action;
 * source- and block-specific validation stays outside this semantic boundary.
 */
/**
 * The per-invocation context the dispatcher hands each port call and branch resolution. This is the
 * runtime controller's own `ActionContext`, so the two cannot drift apart.
 */
type Dsl4ActionDispatchContext = ActionContext;
export type Dsl4ActionDispatchResult = {sceneId: string; reason: string} | null;

export function createDsl4RuntimeActionDispatcher(options: {
  invokePort: (
    method: string,
    payload: Record<string, unknown>,
    context: Dsl4ActionDispatchContext,
  ) => unknown | Promise<unknown>;
  resolveBranch: (branchId: string, context: Dsl4ActionDispatchContext) => string | Promise<string>;
  resolveSpeechStyle: (
    command: 'say' | 'think',
    args: Record<string, unknown>,
  ) => Record<string, unknown>;
  getRecognitionModel: () => string;
  poseSelectionRecognition: Readonly<Record<string, unknown>>;
  dispatchPose: (
    payload: Readonly<{target: string | null; args: Record<string, unknown>}>,
    context: Dsl4ActionDispatchContext,
  ) => unknown | Promise<unknown>;
  writeVariable: (
    request: Readonly<{operation: 'set' | 'change' | 'toggle'; name: string; value?: unknown}>,
  ) => Readonly<{accepted: boolean; code: string}>;
  /**
   * Wait for the scene's recognition model before an action that recognizes. The model loads in
   * the background from scene entry, so this returns at once unless it is still loading.
   */
  prepareRecognitionModel?: (context: Dsl4ActionDispatchContext) => unknown | Promise<unknown>;
}) {
  if (!isRecord(options))
    throw new TypeError('Runtime action dispatcher options must be an object');
  const invokePort = requireFunction(options.invokePort, 'invokePort');
  const resolveBranch = requireFunction(options.resolveBranch, 'resolveBranch');
  const resolveSpeechStyle = requireFunction(options.resolveSpeechStyle, 'resolveSpeechStyle');
  const getRecognitionModel = requireFunction(options.getRecognitionModel, 'getRecognitionModel');
  const dispatchPose = requireFunction(options.dispatchPose, 'dispatchPose');
  const writeVariable = requireFunction(options.writeVariable, 'writeVariable');
  const prepareRecognitionModel =
    options.prepareRecognitionModel === undefined
      ? () => undefined
      : requireFunction(options.prepareRecognitionModel, 'prepareRecognitionModel');
  if (!isRecord(options.poseSelectionRecognition)) {
    throw new TypeError('poseSelectionRecognition must be an object');
  }
  const poseSelectionRecognition = cloneValue(options.poseSelectionRecognition);

  /**
   */
  async function dispatch(
    action: Readonly<Record<string, unknown>>,
    context: Dsl4ActionDispatchContext,
    {rehearsalSceneSkip = false}: {rehearsalSceneSkip?: boolean} = {},
  ): Promise<Dsl4ActionDispatchResult> {
    if (!isRecord(action)) throw new TypeError('Runtime action must be an object');
    const command = String(action.command);
    const target = action.target === null ? null : String(action.target);
    const args = action.args as Record<string, unknown>;
    if (!isRecord(args)) throw new TypeError('Runtime action args must be an object');

    if (action.handler === 'custom') {
      const outcome = await invokePort(
        'customAction',
        {name: command, target, arguments: cloneValue(args)},
        context,
      );
      if (outcome === undefined || outcome === null) return null;
      if (isRecord(outcome) && outcome.outcome === 'completed' && Object.keys(outcome).length === 1)
        return null;
      if (
        isRecord(outcome) &&
        outcome.outcome === 'transitioned' &&
        typeof outcome.sceneId === 'string' &&
        Object.keys(outcome).length === 2
      ) {
        return {sceneId: outcome.sceneId, reason: 'customAction'};
      }
      throw invalidResult('Invalid custom action runtime result');
    }
    if (!coreActionNames.has(command)) {
      const error = new Error(`Unknown DSL 4.0 runtime action: ${command}`);
      Object.defineProperty(error, 'code', {value: 'K4-RUNTIME-DISPATCH-001'});
      throw error;
    }
    if (command === 'debugger') return null;
    if (command === 'goto') return {sceneId: String(args.scene), reason: 'goto'};
    if (command === 'branch') {
      return {sceneId: await resolveBranch(String(args.branch), context), reason: 'branch'};
    }
    if (command === 'keyInputToChangeScene') {
      const routes = args.routes as Record<string, string>;
      const selected = await invokePort(command, {codes: Object.keys(routes)}, context);
      if (typeof selected !== 'string' || !Object.hasOwn(routes, selected)) {
        throw invalidResult(`Invalid key input result: ${String(selected)}`);
      }
      return {sceneId: routes[selected] ?? '', reason: 'keyInput'};
    }
    if (command === 'touchInputToChangeScene') {
      const routes = args.routes as Record<string, string>;
      const selected = await invokePort(command, {actors: Object.keys(routes)}, context);
      if (typeof selected !== 'string' || !Object.hasOwn(routes, selected)) {
        throw invalidResult(`Invalid touch input result: ${String(selected)}`);
      }
      return {sceneId: routes[selected] ?? '', reason: 'touchInput'};
    }
    if (command === 'poseInputToChangeScene') {
      const modelReady = prepareRecognitionModel(context);
      if (modelReady) await modelReady;
      const routes = args.routes as Record<string, string>;
      const selected = await invokePort(
        command,
        {
          labels: Object.keys(routes),
          recognitionModel: getRecognitionModel(),
          recognitionMode: 'pose',
          recognition: cloneValue(poseSelectionRecognition),
        },
        context,
      );
      if (typeof selected !== 'string' || !Object.hasOwn(routes, selected)) {
        throw invalidResult(`Invalid pose input result: ${String(selected)}`);
      }
      return {sceneId: routes[selected] ?? '', reason: 'poseInput'};
    }
    if (command === 'imageInputToChangeScene') {
      const modelReady = prepareRecognitionModel(context);
      if (modelReady) await modelReady;
      const routes = args.routes as Record<string, string>;
      const selected = await invokePort(
        command,
        {
          labels: Object.keys(routes),
          recognitionModel: getRecognitionModel(),
          recognitionMode: 'image',
          recognition: cloneValue(poseSelectionRecognition),
        },
        context,
      );
      if (typeof selected !== 'string' || !Object.hasOwn(routes, selected)) {
        throw invalidResult(`Invalid image input result: ${String(selected)}`);
      }
      return {sceneId: routes[selected] ?? '', reason: 'imageInput'};
    }
    if (command === 'setVariable' || command === 'changeVariable' || command === 'toggleVariable') {
      const request =
        command === 'setVariable'
          ? {operation: 'set' as const, name: String(args.name), value: args.value}
          : command === 'changeVariable'
            ? {operation: 'change' as const, name: String(args.name), value: args.by}
            : {operation: 'toggle' as const, name: String(args.name)};
      const result = writeVariable(request);
      if (!isRecord(result) || result.accepted !== true) {
        const code = isRecord(result) && typeof result.code === 'string' ? result.code : '';
        const error = new Error(
          `DSL 4.0 story variable write was rejected: ${command} ${request.name}${
            code ? ` (${code})` : ''
          }`,
        );
        Object.defineProperty(error, 'code', {value: code || 'K4-VARIABLE-WRITE-INPUT'});
        throw error;
      }
      return null;
    }
    if (command === 'pose') {
      // A pose step waits for the model itself, inside its skippable pose wait.
      await dispatchPose({target, args}, context);
      return null;
    }
    const portArgs =
      command === 'say' || command === 'think'
        ? resolveSpeechStyle(command, args)
        : rehearsalSceneSkip && command === 'transition'
          ? {...args, seconds: 0}
          : args;
    await invokePort(command, target === null ? {...portArgs} : {target, ...portArgs}, context);
    return null;
  }

  return Object.freeze({dispatch});
}
