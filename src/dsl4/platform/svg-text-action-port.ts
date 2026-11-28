import {createDsl4RetryableCleanup} from '../retryable-cleanup.js';
import {guardDsl4CompositionCreation} from '../creation-cleanup.js';
import {createSvgTextComposition} from '@kubohiroya/turbowarp-svg-text/composition';
import {
  dsl4ContentRunsNeedRichText,
  dsl4PlainTextFromContentRuns,
  normalizeDsl4ContentRuns,
} from '../content-run.js';

import type {Dsl4CompositionMethod, Dsl4ForwardedFactory} from './composition-contract.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function platformError(code: string, message: string) {
  const error = new Error(message);
  Object.defineProperty(error, 'code', {value: code});
  return error;
}

function abortError(cause?: unknown) {
  const error = new Error('DSL 4.0 SVG text action was cancelled');
  error.name = 'AbortError';
  if (cause !== undefined) Object.defineProperty(error, 'cause', {value: cause});
  return error;
}

function validateExactKeys(value: unknown, keys: string[], label: string) {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  ) {
    throw platformError('K4-SVG-TEXT-001', `${label} must provide exactly ${keys.join(', ')}`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.length === 0) {
    throw platformError('K4-SVG-TEXT-001', `${label} must be a non-empty string`);
  }
  return value;
}

function validateSignal(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.aborted !== 'boolean' ||
    typeof value.addEventListener !== 'function' ||
    typeof value.removeEventListener !== 'function'
  ) {
    throw platformError('K4-SVG-TEXT-001', 'setText context must provide an AbortSignal');
  }
  return value as unknown as AbortSignal;
}

function validateActor(value: unknown, actorId: string) {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    value.isStage !== false ||
    !Number.isInteger(value.drawableID) ||
    (value.drawableID as number) < 0
  ) {
    throw platformError('K4-SVG-TEXT-003', `SVG text actor target is unavailable: ${actorId}`);
  }
  return value as unknown as Readonly<{id: string; isStage: false; drawableID: number}>;
}

function validateComposition(value: unknown) {
  const methods = ['defineStyle', 'setText', 'setRichText', 'releaseTarget', 'releaseAll'];
  if (!isRecord(value) || methods.some((method) => typeof value[method] !== 'function')) {
    throw new TypeError(`SVG Text composition must provide ${methods.join(', ')}`);
  }
  return value as Record<
    'defineStyle' | 'setText' | 'setRichText' | 'releaseTarget' | 'releaseAll',
    Dsl4CompositionMethod
  >;
}

/**
 * Race actor resolution with action cancellation and contain stale settlement.
 */
async function runCancellable<T>(start: () => T | Promise<T>, signal: AbortSignal) {
  if (signal.aborted) throw abortError();
  let rejectAbort: (error: Error) => void = () => {};
  const aborted = new Promise((_resolve, reject) => {
    rejectAbort = reject;
  });
  const handleAbort = () => rejectAbort(abortError());
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

function validateStoryDocument(value: unknown) {
  if (!isRecord(value) || value.kind !== 'StoryDocument' || value.version !== '4.0') {
    throw new TypeError('SVG text platform requires a validated DSL 4.0 StoryDocument');
  }
  if (!isRecord(value.textStyles)) {
    throw new TypeError('DSL 4.0 StoryDocument textStyles must be an object');
  }
  return value;
}

function mapTextStyle(value: unknown, name: string) {
  if (!isRecord(value)) {
    throw platformError('K4-SVG-TEXT-002', `SVG text style is invalid: ${name}`);
  }
  const allowed = new Set(['background', 'color', 'font', 'size', 'align']);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw platformError('K4-SVG-TEXT-002', `SVG text style is invalid: ${name}`);
  }
  return Object.freeze({
    name,
    ...(value.background === undefined ? {} : {backgroundColor: value.background}),
    ...(value.color === undefined ? {} : {textColor: value.color}),
    ...(value.font === undefined ? {} : {font: value.font}),
    ...(value.size === undefined ? {} : {fontPercent: value.size}),
    ...(value.align === undefined ? {} : {alignment: value.align}),
  });
}

function createDisabledPlatform() {
  const port = Object.freeze({});
  return Object.freeze({
    enabled: false,
    composition: null,
    port,
    releaseTarget() {},
    releaseAll() {},
    captureTexts: () => ({}),
    forgetText() {},
    validateTexts(input: unknown) {
      if (!isRecord(input) || Object.keys(input).length)
        throw platformError('K4-SVG-TEXT-007', 'SVG text restore is unavailable');
    },
    releaseTextsExcept() {},
    async restoreTexts() {},
    hasPendingCleanup: () => false,
  });
}

/**
 * Create one block-free SVG Text composition for a DSL 4.0 app-shell runtime.
 * The caller passes the startup-fixed feature snapshot through `enabled`. The default is OFF and
 * does not inspect runtime dependencies. Enabled instances own every applied skin until explicit
 * target release or final `releaseAll()`.
 */
export function createDsl4SvgTextPlatform(
  options: {
    enabled?: boolean;
    runtime?: unknown;
    storyDocument?: unknown;
    resolveActor?: (
      actorId: string,
      context: Readonly<Record<string, unknown>>,
    ) => unknown | Promise<unknown>;
    createComposition?: Dsl4ForwardedFactory;
  } = {},
) {
  if (!isRecord(options)) throw new TypeError('SVG text platform options must be an object');
  const enabled = options.enabled ?? false;
  if (typeof enabled !== 'boolean')
    throw new TypeError('SVG text platform enabled must be boolean');
  if (!enabled) return createDisabledPlatform();

  const storyDocument = validateStoryDocument(options.storyDocument);
  if (typeof options.resolveActor !== 'function') {
    throw new TypeError('SVG text platform resolveActor must be a function');
  }
  const resolveActor = options.resolveActor;
  // The injected factory is forwarded through the runtime host, so it arrives as the permissive
  // `Dsl4ForwardedFactory`. Narrow it to the call this module makes; the result is validated below.
  const createComposition = (options.createComposition ??
    createSvgTextComposition) as (compositionOptions: {runtime: unknown}) => unknown;
  if (typeof createComposition !== 'function') {
    throw new TypeError('SVG text platform createComposition must be a function');
  }
  const candidate = createComposition({runtime: options.runtime});
  return guardDsl4CompositionCreation(
    candidate,
    () => {
      const composition = validateComposition(candidate);
      const styleNames = new Set(['default']);
      for (const [name, style] of Object.entries(
        storyDocument.textStyles as Record<string, unknown>,
      )) {
        requireNonEmptyString(name, 'SVG text style name');
        composition.defineStyle(mapTextStyle(style, name));
        styleNames.add(name);
      }

      const targets = new Map();
      /** What each actor shows, so a save can draw it again; a skin change forgets it. */
      const texts = new Map<string, Readonly<{text: readonly unknown[]; style: string}>>();
      const cleanup = createDsl4RetryableCleanup({
        message: 'DSL 4.0 SVG text cleanup failed',
        steps: [() => composition.releaseAll()],
      });

      function ensureActive() {
        if (cleanup.requested) {
          throw platformError('K4-SVG-TEXT-006', 'SVG text platform has been released');
        }
      }

      function parseText(value: Record<string, unknown>) {
        let runs;
        try {
          runs = normalizeDsl4ContentRuns(value.text);
        } catch (error) {
          throw platformError(
            'K4-SVG-TEXT-001',
            error instanceof Error ? error.message : 'setText.text is invalid',
          );
        }
        const styleName = requireNonEmptyString(value.style, 'setText.style');
        if (!styleNames.has(styleName)) {
          throw platformError('K4-SVG-TEXT-002', `SVG text style is not defined: ${styleName}`);
        }
        return {runs, styleName};
      }

      async function render(actorId: string, value: Record<string, unknown>, context: unknown) {
        const {runs, styleName} = parseText(value);
        const signal = validateSignal(isRecord(context) ? context.signal : undefined);
        const actionContext = context as unknown as Readonly<Record<string, unknown>>;
        const target = validateActor(
          await runCancellable(() => resolveActor(actorId, actionContext), signal),
          actorId,
        );
        if (signal.aborted) throw abortError();
        ensureActive();
        // Ruby needs the rich renderer; plain text keeps the simpler path and its existing layout.
        if (dsl4ContentRunsNeedRichText(runs)) {
          composition.setRichText({styleName, target, runs});
        } else {
          composition.setText({styleName, target, text: dsl4PlainTextFromContentRuns(runs)});
        }
        const previousTarget = targets.get(actorId);
        targets.set(actorId, target);
        texts.set(actorId, Object.freeze({text: structuredClone(runs), style: styleName}));
        if (previousTarget && previousTarget !== target) composition.releaseTarget(previousTarget);
      }

      const port = Object.freeze({
        async setText(payload: unknown, context: unknown) {
          ensureActive();
          const value = validateExactKeys(payload, ['target', 'text', 'style'], 'setText payload');
          const actorId = requireNonEmptyString(value.target, 'setText.target');
          await render(actorId, value, context);
        },
      });

      function validateTexts(input: unknown) {
        if (!isRecord(input) || Object.keys(input).length > 512)
          throw platformError(
            'K4-SVG-TEXT-007',
            'Saved SVG texts must be an object keyed by actor',
          );
        for (const [actorId, value] of Object.entries(input)) {
          requireNonEmptyString(actorId, 'Saved SVG text actor');
          parseText(validateExactKeys(value, ['text', 'style'], 'Saved SVG text'));
        }
        return input as Readonly<Record<string, Readonly<Record<string, unknown>>>>;
      }

      /** Give the costume back to every actor whose text the save does not hold. */
      function releaseTextsExcept(input: unknown) {
        ensureActive();
        const saved = validateTexts(input);
        for (const actorId of [...targets.keys()])
          if (!Object.hasOwn(saved, actorId) || !texts.has(actorId)) {
            composition.releaseTarget(targets.get(actorId));
            targets.delete(actorId);
            texts.delete(actorId);
          }
      }

      /** Draw each saved text again, after the saved costumes were applied. */
      async function restoreTexts(input: unknown) {
        ensureActive();
        const saved = validateTexts(input);
        const signal = new AbortController().signal;
        for (const [actorId, value] of Object.entries(saved))
          await render(actorId, value as Record<string, unknown>, {signal});
      }

      function releaseTarget(actorId: unknown) {
        ensureActive();
        const name = requireNonEmptyString(actorId, 'SVG text actor ID');
        const target = targets.get(name);
        if (!target) {
          throw platformError('K4-SVG-TEXT-005', `SVG text actor is not owned: ${name}`);
        }
        composition.releaseTarget(target);
        targets.delete(name);
        texts.delete(name);
      }

      function releaseAll() {
        targets.clear();
        texts.clear();
        styleNames.clear();
        return cleanup.run('svg-text-release');
      }

      return Object.freeze({
        enabled: true,
        composition,
        port,
        releaseTarget,
        releaseAll,
        captureTexts: () =>
          Object.fromEntries(
            [...texts].map(([actorId, value]) => [
              actorId,
              {text: structuredClone(value.text), style: value.style},
            ]),
          ),
        forgetText(actorId: string) {
          texts.delete(actorId);
        },
        validateTexts,
        releaseTextsExcept,
        restoreTexts,
        hasPendingCleanup: cleanup.hasPendingCleanup,
      });
    },
    'SVG text composition initialization cleanup failed',
  );
}
