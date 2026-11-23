import {
  normalizeBubbleReveal,
  splitBubbleContent,
  splitBubbleText,
} from '@kubohiroya/turbowarp-bubble/reveal';
import {
  dsl4ContentRunsNeedRichText,
  dsl4PlainTextFromContentRuns,
  normalizeDsl4ContentRuns,
  type Dsl4ContentRun,
} from '../content-run.js';
import {normalizeDsl4BubbleMotions} from '../bubble-motion.js';
import {applyDsl4MoveEasing, dsl4MoveEasingNames, isDsl4MoveEasing} from '../move-easing.js';
import {
  dsl4RotationStyleNames,
  isDsl4RotationStyle,
  normalizeDsl4Direction,
  scratchDsl4RotationStyle,
} from '../rotation-style.js';

const defaultFrameMilliseconds = 1000 / 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function projectTargetName(target: unknown) {
  if (!isRecord(target)) return null;
  if (isRecord(target.sprite) && typeof target.sprite.name === 'string') {
    return target.sprite.name.length > 0 ? target.sprite.name : null;
  }
  return typeof target.name === 'string' && target.name.length > 0 ? target.name : null;
}

function adapterError(code: string, message: string) {
  const error = new Error(message);
  Object.defineProperty(error, 'code', {value: code});
  return error;
}

function createDefaultScheduler() {
  const schedule = (callback: () => void, milliseconds: number) =>
    setTimeout(callback, milliseconds);
  const cancel = (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>);
  return Object.freeze({
    now: () => performance.now(),
    setTimeout: schedule,
    clearTimeout: cancel,
  });
}

function validateScheduler(value: unknown) {
  const methods = ['now', 'setTimeout', 'clearTimeout'];
  if (!isRecord(value) || methods.some((method) => typeof value[method] !== 'function')) {
    throw new TypeError(`TurboWarp actor scheduler must provide ${methods.join(', ')}`);
  }
  return value as unknown as {
    now: () => number;
    setTimeout: (callback: () => void, milliseconds: number) => unknown;
    clearTimeout: (handle: unknown) => void;
  };
}

function validateRuntimeHost(value: unknown) {
  if (!isRecord(value) || typeof value.targets !== 'function' || !isRecord(value.runtime)) {
    throw new TypeError('TurboWarp actor platform requires an injected TurboWarp runtime host');
  }
  const runtimeHost = value as unknown as {
    targets: () => unknown[];
    runtime: Record<string, unknown>;
  };
  // The shared host validates the target list per call. Actor resolution runs on every action, so
  // reject a malformed runtime once, here, instead of surfacing it mid-story.
  runtimeHost.targets();
  return runtimeHost;
}

function validateSpeechSpec(value: unknown, operation: string, extended: boolean) {
  if (!extended) return validateSpec(value, ['text', 'seconds'], operation);
  if (!isRecord(value)) {
    throw adapterError('K4-TW-ACTOR-002', `${operation} specification must be an object`);
  }
  const allowed = new Set([
    'text',
    'seconds',
    'characterIntervalSeconds',
    'startSound',
    'characterSound',
    'noSoundCharacters',
    'restCharacters',
    'restCharacterIntervalSeconds',
    'bubbleStyle',
    'bubbleReveal',
    'bubbleMotions',
    'waitFor',
  ]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (!Object.hasOwn(value, 'text') || unknown.length > 0) {
    throw adapterError(
      'K4-TW-ACTOR-002',
      `${operation} specification keys are invalid: ${unknown.sort().join(', ') || 'text is missing'}`,
    );
  }
  if (Object.hasOwn(value, 'characterSound') && !Object.hasOwn(value, 'characterIntervalSeconds')) {
    throw adapterError(
      'K4-TW-ACTOR-002',
      `${operation}.characterSound requires characterIntervalSeconds`,
    );
  }
  if (
    Object.hasOwn(value, 'noSoundCharacters') &&
    (!Object.hasOwn(value, 'characterIntervalSeconds') || !Object.hasOwn(value, 'characterSound'))
  ) {
    throw adapterError(
      'K4-TW-ACTOR-002',
      `${operation}.noSoundCharacters requires characterIntervalSeconds and characterSound`,
    );
  }
  if (
    Object.hasOwn(value, 'restCharacters') !== Object.hasOwn(value, 'restCharacterIntervalSeconds')
  ) {
    throw adapterError(
      'K4-TW-ACTOR-002',
      `${operation}.restCharacters and restCharacterIntervalSeconds must be specified together`,
    );
  }
  if (
    (Object.hasOwn(value, 'restCharacters') ||
      Object.hasOwn(value, 'restCharacterIntervalSeconds')) &&
    !Object.hasOwn(value, 'characterIntervalSeconds')
  ) {
    throw adapterError(
      'K4-TW-ACTOR-002',
      `${operation}.restCharacters requires characterIntervalSeconds`,
    );
  }
  if (Object.hasOwn(value, 'waitFor') && value.waitFor !== 'advance') {
    throw adapterError('K4-TW-ACTOR-002', `${operation}.waitFor must be advance`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.length === 0) {
    throw adapterError('K4-TW-ACTOR-002', `${field} must be a non-empty string`);
  }
  return value;
}

function defaultSegmentText(text: string) {
  if (typeof Intl !== 'object' || typeof Intl.Segmenter !== 'function') {
    throw adapterError(
      'K4-TW-ACTOR-002',
      'Intl.Segmenter is required for Unicode grapheme segmentation',
    );
  }
  const segmenter = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
  return [...segmenter.segment(text)].map(({segment}) => segment);
}

function finiteNumber(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw adapterError('K4-TW-ACTOR-002', `${field} must be a finite number`);
  }
  return value;
}

function validateActor(value: unknown) {
  const methods = ['lookupVariableByNameAndType', 'setXY', 'setSize', 'setVisible'];
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    value.isStage !== false ||
    methods.some((method) => typeof value[method] !== 'function')
  ) {
    throw adapterError('K4-TW-ACTOR-002', 'TurboWarp actor target is invalid');
  }
  finiteNumber(value.x, 'actor.x');
  finiteNumber(value.y, 'actor.y');
  return value as unknown as Record<string, unknown> & {
    id: string;
    isStage: false;
    x: number;
    y: number;
    lookupVariableByNameAndType: (name: string, type: string) => unknown;
    setXY: (x: number, y: number) => void;
    setSize: (size: number) => void;
    setVisible: (visible: boolean) => void;
    setDirection?: (direction: number) => void;
    setRotationStyle?: (style: string) => void;
  };
}

/** Rotation and direction are optional; what the action leaves out stays as the actor has it. */
function applyActorRotation(
  actor: ReturnType<typeof validateActor>,
  value: Readonly<Record<string, unknown>>,
) {
  if (Object.hasOwn(value, 'rotation')) {
    const style = value.rotation;
    if (!isDsl4RotationStyle(style)) {
      throw adapterError(
        'K4-TW-ACTOR-002',
        `showActor.rotation must be one of ${dsl4RotationStyleNames.join(', ')}`,
      );
    }
    if (typeof actor.setRotationStyle !== 'function') {
      throw adapterError('K4-TW-ACTOR-002', 'TurboWarp actor must provide setRotationStyle');
    }
    actor.setRotationStyle(scratchDsl4RotationStyle(style));
  }
  if (!Object.hasOwn(value, 'direction')) return;
  const direction = normalizeDsl4Direction(finiteNumber(value.direction, 'showActor.direction'));
  if (typeof actor.setDirection !== 'function') {
    throw adapterError('K4-TW-ACTOR-002', 'TurboWarp actor must provide setDirection');
  }
  actor.setDirection(direction);
}

function validateEffectActor(value: unknown) {
  const actor = validateActor(value);
  if (typeof actor.setEffect !== 'function') {
    throw adapterError('K4-TW-ACTOR-002', 'TurboWarp actor target must provide setEffect');
  }
  return actor as ReturnType<typeof validateActor> & {
    setEffect: (effect: string, value: number) => void;
  };
}

function validateSpec(
  value: unknown,
  keys: string[],
  operation: string,
  optionalKeys: string[] = [],
) {
  const allowedKeys = new Set([...keys, ...optionalKeys]);
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !allowedKeys.has(key)) ||
    keys.some((key) => !Object.hasOwn(value, key))
  ) {
    throw adapterError(
      'K4-TW-ACTOR-002',
      `${operation} specification must provide exactly ${keys.join(', ')}${optionalKeys.length > 0 ? ` with only optional ${optionalKeys.join(', ')}` : ''}`,
    );
  }
  return value;
}

function durationMilliseconds(seconds: number, operation: string) {
  finiteNumber(seconds, `${operation}.seconds`);
  const duration = seconds * 1000;
  if (seconds < 0 || !Number.isFinite(duration)) {
    throw adapterError(
      'K4-TW-ACTOR-002',
      `${operation}.seconds must produce a finite non-negative duration`,
    );
  }
  return duration;
}

/** Connect the DSL4 actor presentation boundary to one TurboWarp runtime. */
/** The bubble the composition hands back for one speech presentation, as this adapter drives it. */
interface Dsl4BubbleHandle {
  animate(...parameters: unknown[]): unknown;
  close(...parameters: unknown[]): unknown;
  finish(...parameters: unknown[]): unknown;
  revealAll(...parameters: unknown[]): unknown;
  revealNext(...parameters: unknown[]): unknown;
  setAnimationMode(...parameters: unknown[]): unknown;
  setText(...parameters: unknown[]): unknown;
}

export function createDsl4TurboWarpActorPlatform(options: {
  /** Injected `@kubohiroya/turbowarp-runtime-adapter` adapter. */
  runtimeHost: unknown;
  implicitProjectActors?: readonly string[];
  scheduler?: unknown;
  frameMilliseconds?: number;
  speechAdvanceTypewriterEnabled?: boolean;
  playSpeechSound?: (sound: string) => unknown | Promise<unknown>;
  stopSpeechSound?: (sound: string) => unknown | Promise<unknown>;
  segmentText?: (text: string) => string[];
  /** Speech renderer owned by `@kubohiroya/turbowarp-bubble`. */
  bubbleComposition: unknown;
}) {
  if (!isRecord(options)) throw new TypeError('TurboWarp actor platform options must be an object');
  const speechAdvanceTypewriterEnabled = options.speechAdvanceTypewriterEnabled ?? false;
  if (typeof speechAdvanceTypewriterEnabled !== 'boolean') {
    throw new TypeError('speechAdvanceTypewriterEnabled must be boolean');
  }
  const runtimeHost = validateRuntimeHost(options.runtimeHost);
  if (
    options.implicitProjectActors !== undefined &&
    (!Array.isArray(options.implicitProjectActors) ||
      options.implicitProjectActors.some((name) => typeof name !== 'string'))
  )
    throw new TypeError('implicitProjectActors must be a string array');
  const implicitProjectActors = new Set(options.implicitProjectActors ?? []);
  const bubbleComposition = options.bubbleComposition;
  if (
    !isRecord(bubbleComposition) ||
    typeof bubbleComposition.show !== 'function' ||
    typeof bubbleComposition.releaseAll !== 'function'
  ) {
    throw new TypeError('Bubble composition must provide show and releaseAll');
  }
  if (options.playSpeechSound !== undefined && typeof options.playSpeechSound !== 'function') {
    throw new TypeError('playSpeechSound must be a function');
  }
  if (options.stopSpeechSound !== undefined && typeof options.stopSpeechSound !== 'function') {
    throw new TypeError('stopSpeechSound must be a function');
  }
  const playSpeechSound = options.playSpeechSound;
  const stopSpeechSound = options.stopSpeechSound;
  const segmentText = options.segmentText ?? defaultSegmentText;
  if (typeof segmentText !== 'function') throw new TypeError('segmentText must be a function');
  const scheduler = validateScheduler(options.scheduler ?? createDefaultScheduler());
  const frameMilliseconds =
    options.frameMilliseconds === undefined
      ? defaultFrameMilliseconds
      : finiteNumber(options.frameMilliseconds, 'frameMilliseconds');
  if (frameMilliseconds <= 0) {
    throw new TypeError('frameMilliseconds must be greater than zero');
  }
  const activeTransparencyTransitions: Map<
    ReturnType<typeof validateEffectActor>,
    {finish: () => void}
  > = new Map();
  let disposed = false;

  function ensureActive() {
    if (disposed) {
      throw adapterError('K4-TW-ACTOR-004', 'TurboWarp actor platform is disposed');
    }
  }

  function finishTransparencyTransitions() {
    const errors = [];
    for (const transition of [...activeTransparencyTransitions.values()]) {
      try {
        transition.finish();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'TurboWarp actor transparency transition cleanup failed');
    }
  }

  function resolveActor(actorId: string) {
    ensureActive();
    if (typeof actorId !== 'string' || actorId.length === 0) {
      throw adapterError('K4-TW-ACTOR-001', 'actorId must be a non-empty string');
    }
    // The Stage is a distinct DSL 4.0 type, so an actor target must carry isStage === false. That
    // is stricter than the shared spriteTargets() predicate, which only excludes isStage === true.
    const targets = runtimeHost.targets();
    const actorNameMatches = targets.filter((candidate) => {
      if (!isRecord(candidate) || candidate.isStage !== false) return false;
      if (typeof candidate.lookupVariableByNameAndType !== 'function') return false;
      const variable = candidate.lookupVariableByNameAndType('actorName', '');
      return isRecord(variable) && variable.value === actorId;
    });
    // DSL 4.0 projects may use one physical sprite per logical actor and therefore omit the
    // 3.2 compatibility actorName variable. Prefer the explicit variable when present, then
    // fall back to the target's project name for standalone 4.0 SB3 projects.
    const matches =
      actorNameMatches.length > 0 && !implicitProjectActors.has(actorId)
        ? actorNameMatches
        : targets.filter(
            (candidate) =>
              isRecord(candidate) &&
              candidate.isStage === false &&
              (!implicitProjectActors.has(actorId) || candidate.isOriginal !== false) &&
              projectTargetName(candidate) === actorId,
          );
    if (matches.length === 0) return null;
    if (matches.length > 1) {
      throw adapterError('K4-TW-ACTOR-001', `TurboWarp actor is ambiguous: ${actorId}`);
    }
    return validateActor(matches[0]);
  }

  function createSpeech(kind: 'say' | 'think', target: unknown, speech: unknown) {
    if (kind === 'think' && !speechAdvanceTypewriterEnabled) {
      throw adapterError('K4-TW-ACTOR-002', 'think is disabled');
    }
    const actor = validateActor(target);
    const value = validateSpeechSpec(speech, kind, speechAdvanceTypewriterEnabled);
    // Plain text keeps the string path. Content runs with ruby go to the bubble as runs, and the
    // typewriter reveals each ruby run as one unit so a reading is never shown without its base.
    let content: readonly Dsl4ContentRun[] | null = null;
    if (typeof value.text !== 'string') {
      try {
        content = normalizeDsl4ContentRuns(value.text);
      } catch (error) {
        const normalizedError = adapterError(
          'K4-TW-ACTOR-002',
          `${kind}.text must be a string or content runs`,
        );
        Object.defineProperty(normalizedError, 'cause', {value: error});
        throw normalizedError;
      }
      if (!dsl4ContentRunsNeedRichText(content)) content = null;
    }
    const text =
      typeof value.text === 'string'
        ? value.text
        : dsl4PlainTextFromContentRuns(normalizeDsl4ContentRuns(value.text));
    const bubbleStyle = Object.hasOwn(value, 'bubbleStyle')
      ? requireNonEmptyString(value.bubbleStyle, `${kind}.bubbleStyle`)
      : '__dsl4_default__';
    let bubbleReveal = null;
    if (Object.hasOwn(value, 'bubbleReveal')) {
      try {
        bubbleReveal = normalizeBubbleReveal(value.bubbleReveal);
      } catch (error) {
        const normalizedError = adapterError('K4-TW-ACTOR-002', `${kind}.bubbleReveal is invalid`);
        Object.defineProperty(normalizedError, 'cause', {value: error});
        throw normalizedError;
      }
    }
    let bubbleMotions: ReadonlyArray<Readonly<Record<string, unknown>>> = Object.freeze([]);
    if (Object.hasOwn(value, 'bubbleMotions')) {
      try {
        bubbleMotions = normalizeDsl4BubbleMotions(value.bubbleMotions);
      } catch (error) {
        const normalizedError = adapterError('K4-TW-ACTOR-002', `${kind}.bubbleMotions is invalid`);
        Object.defineProperty(normalizedError, 'cause', {value: error});
        throw normalizedError;
      }
    }
    const waitForAdvance = value.waitFor === 'advance';
    const duration = Object.hasOwn(value, 'seconds')
      ? durationMilliseconds(value.seconds as number, kind)
      : null;
    const characterInterval = Object.hasOwn(value, 'characterIntervalSeconds')
      ? durationMilliseconds(value.characterIntervalSeconds as number, `${kind}.characterInterval`)
      : null;
    if (characterInterval !== null && characterInterval <= 0) {
      throw adapterError(
        'K4-TW-ACTOR-002',
        `${kind}.characterIntervalSeconds must be greater than zero`,
      );
    }
    const restCharacterInterval = Object.hasOwn(value, 'restCharacterIntervalSeconds')
      ? durationMilliseconds(
          value.restCharacterIntervalSeconds as number,
          `${kind}.restCharacterInterval`,
        )
      : null;
    if (restCharacterInterval !== null && restCharacterInterval <= 0) {
      throw adapterError(
        'K4-TW-ACTOR-002',
        `${kind}.restCharacterIntervalSeconds must be greater than zero`,
      );
    }
    let characterSound = null;
    let startSound = null;
    if (Object.hasOwn(value, 'startSound')) {
      if (typeof value.startSound !== 'string' || value.startSound.length === 0) {
        throw adapterError('K4-TW-ACTOR-002', `${kind}.startSound must be a non-empty string`);
      }
      startSound = value.startSound;
    }
    if (Object.hasOwn(value, 'characterSound')) {
      if (typeof value.characterSound !== 'string' || value.characterSound.length === 0) {
        throw adapterError('K4-TW-ACTOR-002', `${kind}.characterSound must be a non-empty string`);
      }
      characterSound = value.characterSound;
    }
    if (characterSound !== null && (!playSpeechSound || !stopSpeechSound)) {
      throw adapterError(
        'K4-TW-ACTOR-002',
        `${kind}.characterSound requires sound playback callbacks`,
      );
    }
    if (startSound !== null && (!playSpeechSound || !stopSpeechSound)) {
      throw adapterError('K4-TW-ACTOR-002', `${kind}.startSound requires sound playback callbacks`);
    }
    const segmentGraphemes = (source: unknown, field: string) => {
      if (typeof source !== 'string' || source.length === 0) {
        throw adapterError('K4-TW-ACTOR-002', `${kind}.${field} must be a non-empty string`);
      }
      const result = segmentText(source);
      if (!Array.isArray(result) || result.some((segment) => typeof segment !== 'string')) {
        throw adapterError('K4-TW-ACTOR-002', 'segmentText must return a string array');
      }
      return result;
    };
    // One unit per grapheme of plain text, and one per ruby run. `segments` keeps each unit's plain
    // text for the sound and rest-character rules; `units` keeps the run the bubble shows.
    const units: Dsl4ContentRun[] = [];
    if (content === null) {
      if (text.length > 0) {
        for (const segment of segmentGraphemes(text, 'text'))
          units.push({type: 'text', text: segment});
      }
    } else {
      for (const run of content) {
        if (run.type === 'ruby') units.push(run);
        else if (run.text.length > 0) {
          for (const segment of segmentGraphemes(run.text, 'text')) {
            units.push({type: 'text', text: segment});
          }
        }
      }
    }
    const segments = units.map((unit) => (unit.type === 'ruby' ? unit.base : unit.text));
    const visibleContent = (count: number): string | readonly Dsl4ContentRun[] => {
      if (content === null || count <= 0) return segments.slice(0, count).join('');
      const runs: Dsl4ContentRun[] = [];
      for (const unit of units.slice(0, count)) {
        const last = runs.at(-1);
        if (unit.type === 'text' && last?.type === 'text') {
          runs[runs.length - 1] = {type: 'text', text: last.text + unit.text};
        } else runs.push(unit);
      }
      return Object.freeze(runs);
    };
    const bubbleRevealChunks = bubbleReveal
      ? content === null
        ? splitBubbleText(text, bubbleReveal)
        : splitBubbleContent(content, bubbleReveal)
      : [];
    const noSoundSegments = new Set(
      Object.hasOwn(value, 'noSoundCharacters')
        ? segmentGraphemes(value.noSoundCharacters, 'noSoundCharacters')
        : [],
    );
    const restSegments = new Set(
      Object.hasOwn(value, 'restCharacters')
        ? segmentGraphemes(value.restCharacters, 'restCharacters')
        : [],
    );
    let state = 'idle';
    let deadlineTimer: unknown;
    let characterTimer: unknown;
    let visibleCount = 0;
    let bubbleRevealedCount = bubbleReveal ? Math.min(1, bubbleRevealChunks.length) : 0;
    let bubbleMotionsStarted = false;
    let resolveOperation: (() => void) | undefined;
    let rejectOperation: ((error: unknown) => void) | undefined;
    const playedSounds = new Set<string>();
    let bubbleHandle: Dsl4BubbleHandle | null = null;
    let presentationTail = Promise.resolve();

    const cancelTimers = () => {
      if (deadlineTimer !== undefined) scheduler.clearTimeout(deadlineTimer);
      if (characterTimer !== undefined) scheduler.clearTimeout(characterTimer);
      deadlineTimer = undefined;
      characterTimer = undefined;
    };
    const stopSounds = () => {
      if (!stopSpeechSound) return;
      for (const sound of playedSounds) {
        try {
          const operation = Promise.resolve(stopSpeechSound(sound));
          void operation.catch(() => {});
        } catch {
          // Sound cleanup cannot prevent the speech operation from settling.
        }
      }
      playedSounds.clear();
    };
    const playSound = (sound: string | null) => {
      if (sound === null || !playSpeechSound) return;
      let playback;
      try {
        playback = Promise.resolve(playSpeechSound(sound));
        playedSounds.add(sound);
      } catch (error) {
        fail(error);
        return;
      }
      void playback.catch((error) => fail(error));
    };
    const playCharacterSound = (segment: string) => {
      if (noSoundSegments.has(segment) || restSegments.has(segment)) return;
      playSound(characterSound);
    };
    const queueBubbleText = (
      visibleText: string | readonly Dsl4ContentRun[],
      fullyRevealed: boolean,
    ) => {
      presentationTail = presentationTail.then(async () => {
        if (!bubbleHandle) {
          const createdHandle = await (
            bubbleComposition as {
              show(request: Readonly<Record<string, unknown>>): Promise<Dsl4BubbleHandle>;
            }
          ).show({
            actor,
            actorKey: actor.id,
            kind,
            text: visibleText,
            styleName:
              bubbleStyle === '__dsl4_default__' && kind === 'think'
                ? '__dsl4_default_think__'
                : bubbleStyle,
            animationMode: fullyRevealed && waitForAdvance ? 'awaiting-continue' : 'talking',
            ...(bubbleReveal === null ? {} : {reveal: {...bubbleReveal, intervalSeconds: 0}}),
          });
          bubbleHandle = createdHandle;
          if (!bubbleMotionsStarted && bubbleMotions.length > 0) {
            bubbleMotionsStarted = true;
            for (const motion of bubbleMotions) await createdHandle.animate(motion);
          }
        } else {
          await bubbleHandle.setText(visibleText);
          if (fullyRevealed && waitForAdvance) {
            await bubbleHandle.setAnimationMode('awaiting-continue');
          }
        }
      });
      void presentationTail.catch((error) => fail(error));
    };
    const reveal = (count: number, withSound: boolean) => {
      visibleCount = Math.min(count, segments.length);
      queueBubbleText(visibleContent(visibleCount), visibleCount >= segments.length);
      // visibleCount is clamped to the segment count above.
      if (withSound && visibleCount > 0) playCharacterSound(segments[visibleCount - 1] ?? '');
    };
    const nextCharacterInterval = () =>
      visibleCount > 0 && restSegments.has(segments[visibleCount - 1] ?? '')
        ? (restCharacterInterval as number)
        : (characterInterval as number);
    const cancelCharacterTimer = () => {
      if (characterTimer !== undefined) scheduler.clearTimeout(characterTimer);
      characterTimer = undefined;
    };
    const markBubbleRevealComplete = async () => {
      if (bubbleReveal === null || bubbleRevealedCount < bubbleRevealChunks.length) return;
      if (waitForAdvance) await bubbleHandle?.setAnimationMode('awaiting-continue');
    };
    const scheduleBubbleReveal = () => {
      if (
        bubbleReveal === null ||
        bubbleReveal.intervalSeconds <= 0 ||
        bubbleRevealedCount >= bubbleRevealChunks.length
      ) {
        return;
      }
      characterTimer = scheduler.setTimeout(() => {
        characterTimer = undefined;
        if (state !== 'running') return;
        presentationTail = presentationTail.then(async () => {
          if (!bubbleHandle || state !== 'running') return;
          const advanced = await bubbleHandle.revealNext();
          if (advanced) bubbleRevealedCount += 1;
          if (bubbleRevealedCount >= bubbleRevealChunks.length) {
            await markBubbleRevealComplete();
          } else {
            scheduleBubbleReveal();
          }
        });
        void presentationTail.catch((error) => fail(error));
      }, bubbleReveal.intervalSeconds * 1000);
    };
    const revealBubbleFromAdvance = (mode: 'next' | 'all') => {
      cancelCharacterTimer();
      presentationTail = presentationTail.then(async () => {
        if (!bubbleHandle || bubbleReveal === null) return;
        if (mode === 'all') {
          await bubbleHandle.revealAll();
          bubbleRevealedCount = bubbleRevealChunks.length;
        } else {
          const advanced = await bubbleHandle.revealNext();
          if (advanced) bubbleRevealedCount += 1;
        }
        if (bubbleRevealedCount >= bubbleRevealChunks.length) {
          await markBubbleRevealComplete();
        }
      });
      void presentationTail.catch((error) => fail(error));
    };
    const complete = (reason: 'advance' | 'timeout' | 'cancel') => {
      if (state === 'completed' || state === 'completing' || state === 'failed') return;
      cancelTimers();
      try {
        if (bubbleReveal === null && reason !== 'cancel' && visibleCount < segments.length) {
          reveal(segments.length, false);
        }
        stopSounds();
        state = 'completing';
        presentationTail = presentationTail.then(async () => {
          if (reason !== 'cancel' && typeof bubbleHandle?.finish === 'function') {
            await bubbleHandle.finish();
          }
          await bubbleHandle?.close();
          bubbleHandle = null;
        });
        void presentationTail.then(
          () => {
            state = 'completed';
            resolveOperation?.();
          },
          (error) => fail(error),
        );
      } catch (error) {
        fail(error);
      }
    };
    function fail(error: unknown) {
      if (state === 'completed' || state === 'failed') return;
      cancelTimers();
      stopSounds();
      state = 'failed';
      void Promise.resolve(bubbleHandle?.close()).then(
        () => rejectOperation?.(error),
        (cleanupError) =>
          rejectOperation?.(
            new AggregateError([error, cleanupError], 'Bubble presentation cleanup failed'),
          ),
      );
    }

    return Object.freeze({
      start() {
        if (state !== 'idle') {
          throw adapterError('K4-TW-ACTOR-003', `${kind} operation can only start once`);
        }
        state = 'running';
        return new Promise((resolve, reject) => {
          resolveOperation = () => resolve(undefined);
          rejectOperation = (error) => reject(error);
          try {
            if (bubbleReveal !== null) {
              queueBubbleText(content ?? text, false);
              playSound(startSound);
              presentationTail = presentationTail.then(async () => {
                if (state !== 'running') return;
                if (bubbleRevealedCount >= bubbleRevealChunks.length) {
                  await markBubbleRevealComplete();
                } else {
                  scheduleBubbleReveal();
                }
              });
              void presentationTail.catch((error) => fail(error));
            } else if (characterInterval !== null && segments.length > 0) {
              reveal(1, false);
              playSound(startSound);
              if (state !== 'running') return;
              playCharacterSound(segments[0] ?? '');
              const tick = () => {
                characterTimer = undefined;
                if (state !== 'running' || visibleCount >= segments.length) return;
                try {
                  reveal(visibleCount + 1, true);
                  if (state === 'running' && visibleCount < segments.length) {
                    characterTimer = scheduler.setTimeout(tick, nextCharacterInterval());
                  }
                } catch (error) {
                  fail(error);
                }
              };
              if (state === 'running' && visibleCount < segments.length) {
                characterTimer = scheduler.setTimeout(tick, nextCharacterInterval());
              }
            } else {
              reveal(segments.length, false);
              playSound(startSound);
            }
            if (state !== 'running') return;
            if (duration === 0) {
              complete('timeout');
            } else if (duration !== null) {
              deadlineTimer = scheduler.setTimeout(() => {
                deadlineTimer = undefined;
                complete('timeout');
              }, duration);
            }
          } catch (error) {
            fail(error);
          }
        });
      },
      finish(reason?: string) {
        if (
          reason === 'advance' &&
          state === 'running' &&
          bubbleReveal !== null &&
          bubbleRevealedCount < bubbleRevealChunks.length
        ) {
          revealBubbleFromAdvance(bubbleReveal.intervalSeconds === 0 ? 'next' : 'all');
          return Object.freeze({consumed: true});
        }
        complete(reason === 'advance' ? 'advance' : 'cancel');
        return Object.freeze({consumed: false});
      },
    });
  }

  const host = Object.freeze({
    showActor(target: unknown, transform: unknown) {
      const actor = validateActor(target);
      const value = validateSpec(transform, ['x', 'y', 'scale'], 'showActor', [
        'rotation',
        'direction',
      ]);
      const x = finiteNumber(value.x, 'showActor.x');
      const y = finiteNumber(value.y, 'showActor.y');
      const scale = finiteNumber(value.scale, 'showActor.scale');
      if (scale <= 0) throw adapterError('K4-TW-ACTOR-002', 'showActor.scale must be positive');
      actor.setXY(x, y);
      actor.setSize(scale);
      applyActorRotation(actor, value);
      actor.setVisible(true);
    },

    hideActor(target: unknown) {
      ensureActive();
      validateActor(target).setVisible(false);
    },

    setActorScale(target: unknown, scale: unknown) {
      ensureActive();
      const value = finiteNumber(scale, 'setActorScale.scale');
      if (value <= 0) {
        throw adapterError('K4-TW-ACTOR-002', 'setActorScale.scale must be positive');
      }
      validateActor(target).setSize(value);
    },

    setActorLayer(target: unknown, layer: unknown) {
      ensureActive();
      const actor = validateActor(target);
      if (layer === 'front') {
        if (typeof actor.goToFront !== 'function') {
          throw adapterError('K4-TW-ACTOR-002', 'TurboWarp actor must provide goToFront');
        }
        actor.goToFront();
        return;
      }
      if (layer === 'back') {
        if (typeof actor.goToBack !== 'function') {
          throw adapterError('K4-TW-ACTOR-002', 'TurboWarp actor must provide goToBack');
        }
        actor.goToBack();
        return;
      }
      const count = finiteNumber(layer, 'setActorLayer.layer');
      const method = count >= 0 ? 'goForwardLayers' : 'goBackwardLayers';
      if (typeof actor[method] !== 'function') {
        throw adapterError('K4-TW-ACTOR-002', `TurboWarp actor must provide ${method}`);
      }
      actor[method](Math.abs(count));
    },

    setTransparency(target: unknown, effect: unknown) {
      ensureActive();
      const actor = validateEffectActor(target);
      const value = validateSpec(effect, ['transparency'], 'setTransparency');
      const transparency = finiteNumber(value.transparency, 'setTransparency.transparency');
      if (transparency < 0 || transparency > 100) {
        throw adapterError(
          'K4-TW-ACTOR-002',
          'setTransparency.transparency must be between 0 and 100',
        );
      }
      activeTransparencyTransitions.get(actor)?.finish();
      actor.setEffect('ghost', transparency);
    },

    createTransparencyTransition(target: unknown, transition: unknown) {
      ensureActive();
      const actor = validateEffectActor(target);
      const value = validateSpec(transition, ['from', 'to', 'seconds'], 'setTransparency');
      const from = finiteNumber(value.from, 'setTransparency.from');
      const to = finiteNumber(value.to, 'setTransparency.to');
      if (from < 0 || from > 100 || to < 0 || to > 100) {
        throw adapterError(
          'K4-TW-ACTOR-002',
          'setTransparency from and to must be between 0 and 100',
        );
      }
      const duration = durationMilliseconds(value.seconds as number, 'setTransparency');
      let state = 'idle';
      let timer: unknown;
      let resolveOperation: (() => void) | undefined;
      let rejectOperation: ((error: unknown) => void) | undefined;
      let backgroundFailure: unknown;
      let operationSettled = false;
      let backgroundOwned = false;

      const cancelTimer = () => {
        if (timer === undefined) return;
        scheduler.clearTimeout(timer);
        timer = undefined;
      };
      const removeActiveTransition = () => {
        if (activeTransparencyTransitions.get(actor)?.finish === finish) {
          activeTransparencyTransitions.delete(actor);
        }
      };
      const resolvePresentation = () => {
        if (operationSettled) return;
        operationSettled = true;
        resolveOperation?.();
      };
      const rejectPresentation = (error: unknown) => {
        if (operationSettled) return;
        operationSettled = true;
        rejectOperation?.(error);
      };
      const applyFinalState = () => {
        cancelTimer();
        try {
          actor.setEffect('ghost', to);
        } catch (error) {
          state = 'finalization-pending';
          throw error;
        }
        state = 'completed';
        removeActiveTransition();
      };
      const finish = () => {
        if (state === 'completed') return;
        try {
          applyFinalState();
        } catch (error) {
          const terminalError =
            backgroundFailure === undefined
              ? error
              : new AggregateError(
                  [backgroundFailure, error],
                  'TurboWarp actor transparency finalization retry failed',
                );
          backgroundFailure = terminalError;
          if (backgroundOwned) rejectPresentation(terminalError);
          throw terminalError;
        }
        resolvePresentation();
      };
      const fail = (error: unknown) => {
        if (state !== 'running') return;
        cancelTimer();
        backgroundFailure = error;
        try {
          applyFinalState();
        } catch (finishError) {
          backgroundFailure = new AggregateError(
            [error, finishError],
            'TurboWarp actor transparency transition and finalization failed',
          );
        }
        rejectPresentation(backgroundFailure);
      };

      const startOperation = (background: boolean) => {
        if (state !== 'idle') {
          throw adapterError('K4-TW-ACTOR-003', 'setTransparency operation can only start once');
        }
        ensureActive();
        backgroundOwned = background;
        const startTime = finiteNumber(scheduler.now(), 'scheduler.now()');
        activeTransparencyTransitions.get(actor)?.finish();
        actor.setEffect('ghost', from);
        state = 'running';
        activeTransparencyTransitions.set(actor, operation);
        return new Promise((resolve, reject) => {
          resolveOperation = () => resolve(undefined);
          rejectOperation = (error) => reject(error);
          if (duration === 0) {
            try {
              finish();
            } catch (error) {
              backgroundFailure = error;
            }
            return;
          }
          const tick = () => {
            timer = undefined;
            if (state !== 'running') return;
            try {
              const elapsed = Math.max(
                0,
                finiteNumber(scheduler.now(), 'scheduler.now()') - startTime,
              );
              const progress = Math.min(elapsed / duration, 1);
              if (progress >= 1) {
                finish();
                return;
              }
              actor.setEffect('ghost', from + (to - from) * progress);
              timer = scheduler.setTimeout(tick, Math.min(frameMilliseconds, duration - elapsed));
            } catch (error) {
              fail(error);
            }
          };
          try {
            timer = scheduler.setTimeout(tick, Math.min(frameMilliseconds, duration));
          } catch (error) {
            fail(error);
          }
        });
      };

      const operation = Object.freeze({
        start() {
          return startOperation(false);
        },
        startBackground() {
          const presentation = startOperation(true);
          void presentation.catch((error) => {
            backgroundFailure = error;
          });
        },
        finish,
      });
      return operation;
    },

    createVisibilityTransition(target: unknown, transition: unknown) {
      ensureActive();
      const actor = validateEffectActor(target);
      const value = validateSpec(
        transition,
        ['visible', 'seconds', 'easing'],
        'visibilityTransition',
      );
      if (typeof value.visible !== 'boolean') {
        throw adapterError('K4-TW-ACTOR-002', 'visibilityTransition.visible must be boolean');
      }
      const duration = durationMilliseconds(value.seconds as number, 'visibilityTransition');
      const easing = String(value.easing ?? 'easeInOut');
      if (easing !== 'linear' && easing !== 'easeInOut') {
        throw adapterError(
          'K4-TW-ACTOR-002',
          'visibilityTransition.easing must be linear or easeInOut',
        );
      }
      const effects = isRecord(actor.effects) ? actor.effects : {};
      const baseline = Math.max(0, Math.min(100, Number(effects.ghost ?? 0)));
      let state = 'idle';
      let timer: unknown;
      let resolveOperation: (() => void) | undefined;
      let rejectOperation: ((error: unknown) => void) | undefined;

      const remove = () => {
        if (activeTransparencyTransitions.get(actor)?.finish === finish) {
          activeTransparencyTransitions.delete(actor);
        }
      };
      const cancelTimer = () => {
        if (timer === undefined) return;
        scheduler.clearTimeout(timer);
        timer = undefined;
      };
      const finish = () => {
        if (state === 'completed') return;
        cancelTimer();
        if (value.visible) {
          actor.setVisible(true);
          actor.setEffect('ghost', baseline);
        } else {
          actor.setEffect('ghost', 100);
          actor.setVisible(false);
          actor.setEffect('ghost', baseline);
        }
        state = 'completed';
        remove();
        resolveOperation?.();
      };
      const fail = (error: unknown) => {
        if (state !== 'running') return;
        try {
          finish();
        } catch (finishError) {
          rejectOperation?.(
            new AggregateError(
              [error, finishError],
              'TurboWarp actor visibility transition cleanup failed',
            ),
          );
          return;
        }
        rejectOperation?.(error);
      };
      const operation = Object.freeze({
        start() {
          if (state !== 'idle') {
            throw adapterError('K4-TW-ACTOR-003', 'visibility transition can only start once');
          }
          activeTransparencyTransitions.get(actor)?.finish();
          const startTime = finiteNumber(scheduler.now(), 'scheduler.now()');
          state = 'running';
          activeTransparencyTransitions.set(actor, operation);
          actor.setVisible(true);
          actor.setEffect('ghost', value.visible ? 100 : baseline);
          return new Promise((resolve, reject) => {
            resolveOperation = () => resolve(undefined);
            rejectOperation = reject;
            if (duration === 0) {
              finish();
              return;
            }
            const tick = () => {
              timer = undefined;
              if (state !== 'running') return;
              try {
                const elapsed = Math.max(
                  0,
                  finiteNumber(scheduler.now(), 'scheduler.now()') - startTime,
                );
                const progress = Math.min(elapsed / duration, 1);
                if (progress >= 1) {
                  finish();
                  return;
                }
                const eased = applyDsl4MoveEasing(easing, progress);
                actor.setEffect(
                  'ghost',
                  value.visible
                    ? 100 + (baseline - 100) * eased
                    : baseline + (100 - baseline) * eased,
                );
                timer = scheduler.setTimeout(tick, Math.min(frameMilliseconds, duration - elapsed));
              } catch (error) {
                fail(error);
              }
            };
            timer = scheduler.setTimeout(tick, Math.min(frameMilliseconds, duration));
          });
        },
        finish,
      });
      return operation;
    },

    createMove(target: unknown, destination: unknown) {
      const actor = validateActor(target);
      const value = validateSpec(destination, ['x', 'y', 'seconds'], 'moveTo', ['easing']);
      const destinationX = finiteNumber(value.x, 'moveTo.x');
      const destinationY = finiteNumber(value.y, 'moveTo.y');
      const duration = durationMilliseconds(value.seconds as number, 'moveTo');
      const easing = value.easing ?? 'linear';
      if (!isDsl4MoveEasing(easing)) {
        throw adapterError(
          'K4-TW-ACTOR-002',
          `moveTo.easing must be one of ${dsl4MoveEasingNames.join(', ')}`,
        );
      }
      let state = 'idle';
      let timer: unknown;
      let resolveOperation: (() => void) | undefined;
      let rejectOperation: ((error: unknown) => void) | undefined;

      const cancelTimer = () => {
        if (timer === undefined) return;
        scheduler.clearTimeout(timer);
        timer = undefined;
      };
      const complete = () => {
        if (state === 'completed' || state === 'failed') return;
        cancelTimer();
        actor.setXY(destinationX, destinationY);
        state = 'completed';
        resolveOperation?.();
      };
      const fail = (error: unknown) => {
        if (state !== 'running') return;
        cancelTimer();
        state = 'failed';
        rejectOperation?.(error);
      };

      return Object.freeze({
        start() {
          if (state !== 'idle') {
            throw adapterError('K4-TW-ACTOR-003', 'moveTo operation can only start once');
          }
          const startX = finiteNumber(actor.x, 'actor.x');
          const startY = finiteNumber(actor.y, 'actor.y');
          const startTime = finiteNumber(scheduler.now(), 'scheduler.now()');
          state = 'running';
          return new Promise((resolve, reject) => {
            resolveOperation = () => resolve(undefined);
            rejectOperation = (error) => reject(error);
            if (duration === 0) {
              try {
                complete();
              } catch (error) {
                fail(error);
              }
              return;
            }
            const tick = () => {
              timer = undefined;
              try {
                const elapsed = Math.max(
                  0,
                  finiteNumber(scheduler.now(), 'scheduler.now()') - startTime,
                );
                const progress = Math.min(elapsed / duration, 1);
                if (progress >= 1) {
                  complete();
                  return;
                }
                const easedProgress = applyDsl4MoveEasing(easing, progress);
                actor.setXY(
                  startX + (destinationX - startX) * easedProgress,
                  startY + (destinationY - startY) * easedProgress,
                );
                timer = scheduler.setTimeout(tick, Math.min(frameMilliseconds, duration - elapsed));
              } catch (error) {
                fail(error);
              }
            };
            try {
              timer = scheduler.setTimeout(tick, Math.min(frameMilliseconds, duration));
            } catch (error) {
              fail(error);
            }
          });
        },
        finish: complete,
      });
    },

    createSay(target: unknown, speech: unknown) {
      return createSpeech('say', target, speech);
    },

    createThink(target: unknown, speech: unknown) {
      return createSpeech('think', target, speech);
    },
  });

  return Object.freeze({
    host,
    resolveActor,
    resetImplicitActorCostumes() {
      for (const actorId of implicitProjectActors) {
        const actor = resolveActor(actorId);
        const target = actor as unknown as Record<string, unknown> | null;
        if (!target || typeof target.setCostume !== 'function')
          throw adapterError(
            'K4-TW-ACTOR-001',
            `Implicit actor cannot select its first costume: ${actorId}`,
          );
        target.setCostume(0);
      }
    },
    finishTransparencyTransitions,
    dispose() {
      if (disposed) return;
      finishTransparencyTransitions();
      disposed = true;
    },
  });
}
