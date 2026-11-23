import {normalizeDsl4ContentRuns, type Dsl4ContentRun} from '../content-run.js';
import {validateCompositionMethods} from './composition-contract.js';

import {normalizeDsl4BubbleMotions} from '../bubble-motion.js';
import {dsl4MoveEasingNames, isDsl4MoveEasing} from '../move-easing.js';
import {dsl4RotationStyleNames, isDsl4RotationStyle} from '../rotation-style.js';
import {createDsl4OrderedCursorNotifier} from './ordered-cursor-notifier.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function portError(code: string, message: string) {
  const error = new Error(message);
  Object.defineProperty(error, 'code', {value: code});
  return error;
}

function abortError(cause?: unknown) {
  const error = new Error('DSL 4.0 actor action was cancelled');
  error.name = 'AbortError';
  if (cause !== undefined) Object.defineProperty(error, 'cause', {value: cause});
  return error;
}

function validateComposition(value: unknown) {
  const methods = ['isRegistered', 'getMimeType', 'applyToTarget'] as const;
  return validateCompositionMethods(value, 'Asset Manager composition', methods);
}

function validateHost(value: unknown, speechAdvanceTypewriterEnabled: boolean) {
  const baseMethods = [
    'showActor',
    'hideActor',
    'setActorLayer',
    'setTransparency',
    'createTransparencyTransition',
    'createMove',
    'createSay',
  ] as const;
  const typewriterMethods = ['createThink'] as const;
  // The flag decides what must exist; the type names everything the port can reach, with the
  // crossfade member optional because the port probes for it before every use.
  return validateCompositionMethods<
    (typeof baseMethods)[number] | (typeof typewriterMethods)[number],
    'createVisibilityTransition'
  >(value, 'Actor presentation host', [
    ...baseMethods,
    ...(speechAdvanceTypewriterEnabled ? typewriterMethods : []),
  ]);
}

function validateSpeechPayload(value: unknown, command: string, extended: boolean) {
  if (!extended) return validatePayloadShape(value, ['target', 'text', 'seconds'], command);
  if (!isRecord(value)) {
    throw portError('K4-ACTOR-PORT-001', `${command} payload must be an object`);
  }
  const allowed = new Set([
    'target',
    'text',
    'seconds',
    'waitFor',
    'characterIntervalSeconds',
    'startSound',
    'characterSound',
    'noSoundCharacters',
    'restCharacters',
    'restCharacterIntervalSeconds',
    'bubbleStyle',
    'bubbleReveal',
    'bubbleMotions',
  ]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = ['target', 'text'].filter((key) => !Object.hasOwn(value, key));
  if (
    unknown.length > 0 ||
    missing.length > 0 ||
    (!Object.hasOwn(value, 'seconds') && !Object.hasOwn(value, 'waitFor'))
  ) {
    throw portError(
      'K4-ACTOR-PORT-001',
      `${command} payload keys are invalid (unknown: ${unknown.sort().join(', ') || 'none'}; missing: ${missing.sort().join(', ') || 'seconds or waitFor'})`,
    );
  }
  if (Object.hasOwn(value, 'characterSound') && !Object.hasOwn(value, 'characterIntervalSeconds')) {
    throw portError(
      'K4-ACTOR-PORT-001',
      `${command}.characterSound requires characterIntervalSeconds`,
    );
  }
  if (
    Object.hasOwn(value, 'noSoundCharacters') &&
    (!Object.hasOwn(value, 'characterIntervalSeconds') || !Object.hasOwn(value, 'characterSound'))
  ) {
    throw portError(
      'K4-ACTOR-PORT-001',
      `${command}.noSoundCharacters requires characterIntervalSeconds and characterSound`,
    );
  }
  if (
    Object.hasOwn(value, 'restCharacters') !== Object.hasOwn(value, 'restCharacterIntervalSeconds')
  ) {
    throw portError(
      'K4-ACTOR-PORT-001',
      `${command}.restCharacters and restCharacterIntervalSeconds must be specified together`,
    );
  }
  if (
    (Object.hasOwn(value, 'restCharacters') ||
      Object.hasOwn(value, 'restCharacterIntervalSeconds')) &&
    !Object.hasOwn(value, 'characterIntervalSeconds')
  ) {
    throw portError(
      'K4-ACTOR-PORT-001',
      `${command}.restCharacters requires characterIntervalSeconds`,
    );
  }
  return value;
}

function validateContext(value: unknown) {
  if (!isRecord(value) || !isRecord(value.signal)) {
    throw portError('K4-ACTOR-PORT-001', 'actor action context must provide an AbortSignal');
  }
  const signal = value.signal;
  if (
    typeof signal.aborted !== 'boolean' ||
    typeof signal.addEventListener !== 'function' ||
    typeof signal.removeEventListener !== 'function'
  ) {
    throw portError('K4-ACTOR-PORT-001', 'actor action signal is invalid');
  }
  return signal as unknown as AbortSignal;
}

function validatePayloadShape(
  value: unknown,
  keys: string[],
  command: string,
  optionalKeys: string[] = [],
) {
  const allowedKeys = new Set([...keys, ...optionalKeys]);
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !allowedKeys.has(key)) ||
    keys.some((key) => !Object.hasOwn(value, key))
  ) {
    throw portError(
      'K4-ACTOR-PORT-001',
      `${command} payload must provide ${keys.join(', ')}${optionalKeys.length > 0 ? ` and only optional ${optionalKeys.join(', ')}` : ''}`,
    );
  }
  return value;
}

function requireNonEmptyString(value: unknown, field: string, command: string) {
  if (typeof value !== 'string' || value.length === 0) {
    throw portError('K4-ACTOR-PORT-001', `${command}.${field} must be a non-empty string`);
  }
  return value;
}

function requireFiniteNumber(value: unknown, field: string, command: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw portError('K4-ACTOR-PORT-001', `${command}.${field} must be a finite number`);
  }
  return value;
}

function requireTransparency(value: number, field: string) {
  if (value < 0 || value > 100) {
    throw portError('K4-ACTOR-PORT-001', `setTransparency.${field} must be between 0 and 100`);
  }
  return value;
}

function validateActor(value: unknown, actorId: string) {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    value.isStage !== false
  ) {
    throw portError('K4-ACTOR-PORT-003', `Actor target is unavailable: ${actorId}`);
  }
  return value as unknown as Readonly<{id: string; isStage: false}>;
}

/**
 * Race one operation with action cancellation and contain stale settlement.
 */
async function runCancellable<T>(start: () => T | Promise<T>, signal: AbortSignal) {
  if (signal.aborted) throw abortError();
  let rejectAbort: (error: Error) => void = () => {};
  let cancelled = false;
  const aborted = new Promise((_resolve, reject) => {
    rejectAbort = reject;
  });
  const handleAbort = () => {
    if (cancelled) return;
    cancelled = true;
    rejectAbort(abortError());
  };
  signal.addEventListener('abort', handleAbort, {once: true});
  if (signal.aborted) {
    signal.removeEventListener('abort', handleAbort);
    throw abortError();
  }

  let operation;
  try {
    operation = Promise.resolve(start());
  } catch (error) {
    signal.removeEventListener('abort', handleAbort);
    throw error;
  }
  void operation.catch(() => {});
  try {
    return await (Promise.race([operation, aborted]) as Promise<T>);
  } finally {
    signal.removeEventListener('abort', handleAbort);
  }
}

function validatePresentationOperation(
  value: unknown,
  command: 'setTransparency' | 'moveTo' | 'say' | 'think' | 'show' | 'hide',
) {
  if (!isRecord(value) || typeof value.start !== 'function' || typeof value.finish !== 'function') {
    throw portError(
      'K4-ACTOR-PORT-004',
      `${command} presentation operation must provide start and finish`,
    );
  }
  return value as unknown as {
    start: () => unknown;
    startBackground?: () => void;
    finish: (reason?: string) => unknown;
  };
}

/** Start a validated presentation operation. Abort synchronously calls finish before rejection. */
async function runPresentationOperation(
  operation: {start: () => unknown; finish: (reason?: string) => unknown},
  signal: AbortSignal,
) {
  if (signal.aborted) throw abortError();
  let rejectAbort: (error: Error) => void = () => {};
  let started = false;
  let settled = false;
  let cancelled = false;
  let cancellationError: Error | undefined;
  const aborted = new Promise((_resolve, reject) => {
    rejectAbort = reject;
  });
  const handleAbort = () => {
    if (cancelled || settled) return;
    cancelled = true;
    let finishError;
    try {
      if (started) operation.finish();
    } catch (error) {
      finishError = error;
    }
    cancellationError = abortError(finishError);
    rejectAbort(cancellationError);
  };
  signal.addEventListener('abort', handleAbort, {once: true});
  if (signal.aborted) {
    signal.removeEventListener('abort', handleAbort);
    throw abortError();
  }

  let presentation;
  try {
    started = true;
    presentation = Promise.resolve(operation.start());
  } catch (error) {
    signal.removeEventListener('abort', handleAbort);
    throw error;
  }
  const trackedPresentation = presentation.then(
    (result) => {
      settled = true;
      if (cancelled) throw cancellationError ?? abortError();
      return result;
    },
    (error) => {
      settled = true;
      if (cancelled) throw cancellationError ?? abortError();
      throw error;
    },
  );
  void trackedPresentation.catch(() => {});
  try {
    return await Promise.race([trackedPresentation, aborted]);
  } finally {
    signal.removeEventListener('abort', handleAbort);
  }
}

/** Complete one speech operation from its timer or an explicitly armed advance gate. */
async function runSpeechPresentationOperation(
  operation: {start: () => unknown; finish: (reason?: string) => unknown},
  signal: AbortSignal,
  context: unknown,
  waitForAdvance: boolean,
) {
  if (!waitForAdvance) return runPresentationOperation(operation, signal);
  if (!isRecord(context) || typeof context.createAdvanceWait !== 'function') {
    throw portError('K4-ACTOR-PORT-001', 'speech advance context must provide createAdvanceWait');
  }
  const createAdvanceWaitForContext = context.createAdvanceWait as (this: unknown) => unknown;
  const createAdvanceWait = () => {
    const advanceWait = createAdvanceWaitForContext.call(context);
    if (
      !isRecord(advanceWait) ||
      !isRecord(advanceWait.promise) ||
      typeof advanceWait.promise.then !== 'function' ||
      typeof advanceWait.cancel !== 'function'
    ) {
      if (isRecord(advanceWait) && typeof advanceWait.cancel === 'function') {
        advanceWait.cancel();
      }
      throw portError('K4-ACTOR-PORT-001', 'createAdvanceWait returned an invalid handle');
    }
    return advanceWait as unknown as {promise: Promise<unknown>; cancel: () => void};
  };
  let advanceWait = createAdvanceWait();
  const presentation = runPresentationOperation(operation, signal);
  try {
    while (true) {
      let outcome;
      try {
        outcome = await Promise.race([
          presentation.then(() => 'presentation'),
          advanceWait.promise.then((result: unknown) => {
            if (isRecord(result) && result.outcome === 'advance') return 'advance';
            if (isRecord(result) && result.outcome === 'cancelled') return 'cancelled';
            throw portError('K4-ACTOR-PORT-001', 'speech advance wait returned an invalid outcome');
          }),
        ]);
      } finally {
        advanceWait.cancel();
      }
      if (outcome === 'presentation') return await presentation;
      if (outcome === 'cancelled') {
        operation.finish('cancel');
        if (signal.aborted) throw abortError();
        throw portError('K4-ACTOR-PORT-001', 'speech advance wait was cancelled unexpectedly');
      }
      const finishResult = operation.finish('advance');
      if (!isRecord(finishResult) || finishResult.consumed !== true) {
        return await presentation;
      }
      advanceWait = createAdvanceWait();
    }
  } catch (error) {
    try {
      operation.finish('cancel');
    } catch (finishError) {
      if (error instanceof Error && error.cause === undefined) {
        Object.defineProperty(error, 'cause', {value: finishError});
      }
    }
    throw error;
  }
}

/**
 * Adapt DSL 4.0 actor actions to an app-shell-scoped presentation host.
 * The host must create move/say operations without presentation side effects. Their start method
 * begins presentation, and finish synchronously applies the action's skipped final state.
 */
export function createDsl4ActorActionPort(options: {
  composition: unknown;
  resolveActor: (
    actorId: string,
    context: Readonly<Record<string, unknown>>,
  ) => unknown | Promise<unknown>;
  host: unknown;
  speechAdvanceTypewriterEnabled?: boolean;
  stopActorLoop?: (actorId: string) => unknown | Promise<unknown>;
  setCursor?: (
    payload: Readonly<{visible: boolean; source: string; cursor: string}>,
  ) => unknown | Promise<unknown>;
}) {
  if (!isRecord(options)) throw new TypeError('actor action port options must be an object');
  const composition = validateComposition(options.composition);
  if (typeof options.resolveActor !== 'function') {
    throw new TypeError('resolveActor must be a function');
  }
  const resolveActor = options.resolveActor;
  const speechAdvanceTypewriterEnabled = options.speechAdvanceTypewriterEnabled ?? false;
  if (typeof speechAdvanceTypewriterEnabled !== 'boolean') {
    throw new TypeError('speechAdvanceTypewriterEnabled must be boolean');
  }
  const host = validateHost(options.host, speechAdvanceTypewriterEnabled);
  if (options.stopActorLoop !== undefined && typeof options.stopActorLoop !== 'function') {
    throw new TypeError('stopActorLoop must be a function');
  }
  const stopActorLoop = options.stopActorLoop;
  const setCursor = options.setCursor;
  if (setCursor !== undefined && typeof setCursor !== 'function') {
    throw new TypeError('setCursor must be a function');
  }
  let speechCursorId = 0;
  const publishCursor = setCursor ? createDsl4OrderedCursorNotifier(setCursor) : null;

  function notifySpeechCursor(visible: boolean, source: string) {
    publishCursor?.(Object.freeze({visible, source, cursor: 'pointer'}));
  }

  function requireImageAsset(skin: string) {
    if (!composition.isRegistered(skin)) {
      throw portError('K4-ACTOR-PORT-002', `Actor skin is not registered: ${skin}`);
    }
    const mimeType = composition.getMimeType(skin);
    if (typeof mimeType !== 'string' || !mimeType.startsWith('image/')) {
      throw portError('K4-ACTOR-PORT-002', `Actor skin ${skin} must have image MIME type`);
    }
  }

  function requireAudioAsset(sound: string) {
    if (!composition.isRegistered(sound)) {
      throw portError('K4-ACTOR-PORT-002', `Character sound is not registered: ${sound}`);
    }
    const mimeType = composition.getMimeType(sound);
    if (typeof mimeType !== 'string' || !mimeType.startsWith('audio/')) {
      throw portError('K4-ACTOR-PORT-002', `Character sound ${sound} must have audio MIME type`);
    }
  }

  async function resolveTarget(
    target: string,
    context: Readonly<Record<string, unknown>>,
    signal: AbortSignal,
  ) {
    return validateActor(await runCancellable(() => resolveActor(target, context), signal), target);
  }

  async function runSpeech(command: 'say' | 'think', payload: unknown, context: unknown) {
    const value = validateSpeechPayload(payload, command, speechAdvanceTypewriterEnabled);
    const target = requireNonEmptyString(value.target, 'target', command);
    let text: string | readonly Dsl4ContentRun[];
    if (typeof value.text === 'string') {
      text = value.text;
    } else {
      try {
        text = normalizeDsl4ContentRuns(value.text);
      } catch {
        throw portError('K4-ACTOR-PORT-001', `${command}.text must be a string or content runs`);
      }
    }
    let seconds;
    if (Object.hasOwn(value, 'seconds')) {
      seconds = requireFiniteNumber(value.seconds, 'seconds', command);
      if (seconds < 0) {
        throw portError('K4-ACTOR-PORT-001', `${command}.seconds must not be negative`);
      }
    }
    const waitFor = value.waitFor;
    if (waitFor !== undefined && waitFor !== 'advance') {
      throw portError('K4-ACTOR-PORT-001', `${command}.waitFor must be advance`);
    }
    let characterIntervalSeconds;
    if (Object.hasOwn(value, 'characterIntervalSeconds')) {
      characterIntervalSeconds = requireFiniteNumber(
        value.characterIntervalSeconds,
        'characterIntervalSeconds',
        command,
      );
      if (characterIntervalSeconds <= 0) {
        throw portError(
          'K4-ACTOR-PORT-001',
          `${command}.characterIntervalSeconds must be greater than zero`,
        );
      }
    }
    let startSound;
    if (Object.hasOwn(value, 'startSound')) {
      startSound = requireNonEmptyString(value.startSound, 'startSound', command);
    }
    let characterSound;
    if (Object.hasOwn(value, 'characterSound')) {
      characterSound = requireNonEmptyString(value.characterSound, 'characterSound', command);
    }
    let noSoundCharacters;
    if (Object.hasOwn(value, 'noSoundCharacters')) {
      noSoundCharacters = requireNonEmptyString(
        value.noSoundCharacters,
        'noSoundCharacters',
        command,
      );
    }
    let restCharacters;
    if (Object.hasOwn(value, 'restCharacters')) {
      restCharacters = requireNonEmptyString(value.restCharacters, 'restCharacters', command);
    }
    let restCharacterIntervalSeconds;
    if (Object.hasOwn(value, 'restCharacterIntervalSeconds')) {
      restCharacterIntervalSeconds = requireFiniteNumber(
        value.restCharacterIntervalSeconds,
        'restCharacterIntervalSeconds',
        command,
      );
      if (restCharacterIntervalSeconds <= 0) {
        throw portError(
          'K4-ACTOR-PORT-001',
          `${command}.restCharacterIntervalSeconds must be greater than zero`,
        );
      }
    }
    const bubbleStyle = Object.hasOwn(value, 'bubbleStyle')
      ? requireNonEmptyString(value.bubbleStyle, 'bubbleStyle', command)
      : undefined;
    let bubbleReveal;
    if (Object.hasOwn(value, 'bubbleReveal')) {
      if (bubbleStyle === undefined) {
        throw portError('K4-ACTOR-PORT-001', `${command}.bubbleReveal requires bubbleStyle`);
      }
      const candidate = value.bubbleReveal;
      const allowedRevealKeys = new Set([
        'unit',
        'delimiters',
        'showDelimiters',
        'layout',
        'intervalSeconds',
        'sound',
      ]);
      if (
        !isRecord(candidate) ||
        Object.keys(candidate).some((key) => !allowedRevealKeys.has(key)) ||
        !['CHARACTER', 'WORD', 'LINE', 'BLOCK'].includes(String(candidate.unit))
      ) {
        throw portError('K4-ACTOR-PORT-001', `${command}.bubbleReveal is invalid`);
      }
      bubbleReveal = candidate;
    }
    let bubbleMotions;
    if (Object.hasOwn(value, 'bubbleMotions')) {
      if (bubbleStyle === undefined) {
        throw portError('K4-ACTOR-PORT-001', `${command}.bubbleMotions requires bubbleStyle`);
      }
      try {
        bubbleMotions = normalizeDsl4BubbleMotions(value.bubbleMotions);
      } catch (error) {
        const normalizedError = portError(
          'K4-ACTOR-PORT-001',
          `${command}.bubbleMotions is invalid`,
        );
        Object.defineProperty(normalizedError, 'cause', {value: error});
        throw normalizedError;
      }
    }
    const signal = validateContext(context);
    if (signal.aborted) throw abortError();
    for (const sound of new Set([startSound, characterSound].filter(Boolean))) {
      requireAudioAsset(sound as string);
    }
    if (isRecord(bubbleReveal) && typeof bubbleReveal.sound === 'string') {
      requireAudioAsset(bubbleReveal.sound);
    }
    const actionContext = context as unknown as Readonly<Record<string, unknown>>;
    const actor = await resolveTarget(target, actionContext, signal);
    const operation = validatePresentationOperation(
      host[command === 'say' ? 'createSay' : 'createThink'](
        actor,
        Object.freeze({
          text,
          ...(seconds === undefined ? {} : {seconds}),
          ...(characterIntervalSeconds === undefined ? {} : {characterIntervalSeconds}),
          ...(startSound === undefined ? {} : {startSound}),
          ...(characterSound === undefined ? {} : {characterSound}),
          ...(noSoundCharacters === undefined ? {} : {noSoundCharacters}),
          ...(restCharacters === undefined ? {} : {restCharacters}),
          ...(restCharacterIntervalSeconds === undefined ? {} : {restCharacterIntervalSeconds}),
          ...(bubbleStyle === undefined ? {} : {bubbleStyle}),
          ...(bubbleReveal === undefined ? {} : {bubbleReveal}),
          ...(bubbleMotions === undefined ? {} : {bubbleMotions}),
          ...(waitFor === undefined ? {} : {waitFor}),
        }),
        actionContext,
      ),
      command,
    );
    let cursorSource;
    if (waitFor === 'advance') {
      speechCursorId += 1;
      cursorSource = `speech-advance-${speechCursorId}`;
      notifySpeechCursor(true, cursorSource);
    }
    try {
      return await runSpeechPresentationOperation(
        operation,
        signal,
        context,
        waitFor === 'advance',
      );
    } finally {
      if (cursorSource) notifySpeechCursor(false, cursorSource);
    }
  }

  return Object.freeze({
    async show(payload: unknown, context: unknown) {
      const value = validatePayloadShape(payload, ['target', 'skin', 'x', 'y', 'scale'], 'show', [
        'rotation',
        'direction',
        'transition',
      ]);
      const target = requireNonEmptyString(value.target, 'target', 'show');
      const skin = requireNonEmptyString(value.skin, 'skin', 'show');
      const x = requireFiniteNumber(value.x, 'x', 'show');
      const y = requireFiniteNumber(value.y, 'y', 'show');
      const scale = requireFiniteNumber(value.scale, 'scale', 'show');
      if (scale <= 0) {
        throw portError('K4-ACTOR-PORT-001', 'show.scale must be greater than zero');
      }
      // Rotation is optional; absent values leave the actor's own rotation untouched.
      if (Object.hasOwn(value, 'rotation') && !isDsl4RotationStyle(value.rotation)) {
        throw portError(
          'K4-ACTOR-PORT-001',
          `show.rotation must be one of ${dsl4RotationStyleNames.join(', ')}`,
        );
      }
      const direction = Object.hasOwn(value, 'direction')
        ? requireFiniteNumber(value.direction, 'direction', 'show')
        : undefined;
      const signal = validateContext(context);
      if (signal.aborted) throw abortError();
      requireImageAsset(skin);
      const actionContext = context as unknown as Readonly<Record<string, unknown>>;
      const actor = await resolveTarget(target, actionContext, signal);
      await runCancellable(() => stopActorLoop?.(target), signal);
      await runCancellable(() => composition.applyToTarget(skin, actor), signal);
      await runCancellable(
        () =>
          host.showActor(
            actor,
            Object.freeze({
              x,
              y,
              scale,
              ...(Object.hasOwn(value, 'rotation') ? {rotation: value.rotation} : {}),
              ...(direction === undefined ? {} : {direction}),
            }),
            actionContext,
          ),
        signal,
      );
      if (isRecord(value.transition) && value.transition.effect === 'crossfade') {
        if (typeof host.createVisibilityTransition !== 'function') {
          throw portError('K4-ACTOR-PORT-004', 'Actor visibility crossfade is unavailable');
        }
        const operation = validatePresentationOperation(
          host.createVisibilityTransition(
            actor,
            Object.freeze({
              visible: true,
              seconds: value.transition.seconds,
              easing: value.transition.easing,
            }),
            actionContext,
          ),
          'show',
        );
        await runPresentationOperation(operation, signal);
      }
    },

    async hide(payload: unknown, context: unknown) {
      const value =
        isRecord(payload) && Object.hasOwn(payload, 'transition')
          ? validatePayloadShape(payload, ['target', 'transition'], 'hide')
          : validatePayloadShape(payload, ['target'], 'hide');
      const target = requireNonEmptyString(value.target, 'target', 'hide');
      const signal = validateContext(context);
      if (signal.aborted) throw abortError();
      const actionContext = context as unknown as Readonly<Record<string, unknown>>;
      const actor = await resolveTarget(target, actionContext, signal);
      if (isRecord(value.transition) && value.transition.effect === 'crossfade') {
        if (typeof host.createVisibilityTransition !== 'function') {
          throw portError('K4-ACTOR-PORT-004', 'Actor visibility crossfade is unavailable');
        }
        const operation = validatePresentationOperation(
          host.createVisibilityTransition(
            actor,
            Object.freeze({
              visible: false,
              seconds: value.transition.seconds,
              easing: value.transition.easing,
            }),
            actionContext,
          ),
          'hide',
        );
        await runPresentationOperation(operation, signal);
        return;
      }
      await runCancellable(() => host.hideActor(actor, actionContext), signal);
    },

    async setLayer(payload: unknown, context: unknown) {
      const value = validatePayloadShape(payload, ['target', 'layer'], 'setLayer');
      const target = requireNonEmptyString(value.target, 'target', 'setLayer');
      const layer = value.layer;
      if (
        layer !== 'front' &&
        layer !== 'back' &&
        (typeof layer !== 'number' || !Number.isFinite(layer))
      ) {
        throw portError(
          'K4-ACTOR-PORT-001',
          'setLayer.layer must be front, back, or a finite number',
        );
      }
      const signal = validateContext(context);
      if (signal.aborted) throw abortError();
      const actionContext = context as unknown as Readonly<Record<string, unknown>>;
      const actor = await resolveTarget(target, actionContext, signal);
      await runCancellable(() => host.setActorLayer(actor, layer, actionContext), signal);
    },

    async setTransparency(payload: unknown, context: unknown) {
      const transitionRequested =
        isRecord(payload) &&
        ['from', 'to', 'seconds', 'background'].some((field) => Object.hasOwn(payload, field));
      const transition = transitionRequested
        ? Object.hasOwn(payload as Record<string, unknown>, 'background')
          ? validatePayloadShape(
              payload,
              ['target', 'from', 'to', 'seconds', 'background'],
              'setTransparency',
            )
          : validatePayloadShape(payload, ['target', 'from', 'to', 'seconds'], 'setTransparency')
        : null;
      const value =
        transition ?? validatePayloadShape(payload, ['target', 'transparency'], 'setTransparency');
      const target = requireNonEmptyString(value.target, 'target', 'setTransparency');
      const effect = transition
        ? (() => {
            const from = requireTransparency(
              requireFiniteNumber(transition.from, 'from', 'setTransparency'),
              'from',
            );
            const to = requireTransparency(
              requireFiniteNumber(transition.to, 'to', 'setTransparency'),
              'to',
            );
            const seconds = requireFiniteNumber(transition.seconds, 'seconds', 'setTransparency');
            if (seconds < 0 || !Number.isFinite(seconds * 1000)) {
              throw portError(
                'K4-ACTOR-PORT-001',
                'setTransparency.seconds must produce a finite non-negative duration',
              );
            }
            const background = transition.background ?? false;
            if (typeof background !== 'boolean') {
              throw portError('K4-ACTOR-PORT-001', 'setTransparency.background must be a boolean');
            }
            return Object.freeze({from, to, seconds, background});
          })()
        : Object.freeze({
            transparency: requireTransparency(
              requireFiniteNumber(value.transparency, 'transparency', 'setTransparency'),
              'transparency',
            ),
          });
      const signal = validateContext(context);
      if (signal.aborted) throw abortError();
      const actionContext = context as unknown as Readonly<Record<string, unknown>>;
      const actor = await resolveTarget(target, actionContext, signal);
      if (!transition) {
        await runCancellable(() => host.setTransparency(actor, effect, actionContext), signal);
        return;
      }
      const transitionEffect = effect as Readonly<{
        from: number;
        to: number;
        seconds: number;
        background: boolean;
      }>;
      const operation = validatePresentationOperation(
        host.createTransparencyTransition(
          actor,
          Object.freeze({
            from: transitionEffect.from,
            to: transitionEffect.to,
            seconds: transitionEffect.seconds,
          }),
          actionContext,
        ),
        'setTransparency',
      );
      if (!transitionEffect.background) return runPresentationOperation(operation, signal);
      if (signal.aborted) throw abortError();
      if (typeof operation.startBackground !== 'function') {
        throw portError(
          'K4-ACTOR-PORT-004',
          'setTransparency background operation must provide startBackground',
        );
      }
      operation.startBackground();
    },

    async moveTo(payload: unknown, context: unknown) {
      const value = validatePayloadShape(payload, ['target', 'x', 'y', 'seconds'], 'moveTo', [
        'easing',
      ]);
      const target = requireNonEmptyString(value.target, 'target', 'moveTo');
      const x = requireFiniteNumber(value.x, 'x', 'moveTo');
      const y = requireFiniteNumber(value.y, 'y', 'moveTo');
      const seconds = requireFiniteNumber(value.seconds, 'seconds', 'moveTo');
      const easing = value.easing ?? 'linear';
      if (!isDsl4MoveEasing(easing)) {
        throw portError(
          'K4-ACTOR-PORT-001',
          `moveTo.easing must be one of ${dsl4MoveEasingNames.join(', ')}`,
        );
      }
      if (seconds < 0) {
        throw portError('K4-ACTOR-PORT-001', 'moveTo.seconds must not be negative');
      }
      const signal = validateContext(context);
      if (signal.aborted) throw abortError();
      const actionContext = context as unknown as Readonly<Record<string, unknown>>;
      const actor = await resolveTarget(target, actionContext, signal);
      const operation = validatePresentationOperation(
        host.createMove(actor, Object.freeze({x, y, seconds, easing}), actionContext),
        'moveTo',
      );
      return runPresentationOperation(operation, signal);
    },

    say(payload: unknown, context: unknown) {
      return runSpeech('say', payload, context);
    },

    think(payload: unknown, context: unknown) {
      if (!speechAdvanceTypewriterEnabled) {
        throw portError('K4-ACTOR-PORT-001', 'think is disabled');
      }
      return runSpeech('think', payload, context);
    },
  });
}
