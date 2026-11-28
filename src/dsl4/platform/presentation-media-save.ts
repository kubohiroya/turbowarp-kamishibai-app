/**
 * State that outlives the action that made it: the BGM, scene audio, text shown on actors and
 * costume loops. Each part is held as data and started again on restore; playback positions of
 * BGM and loops are not kept, so both start over from the beginning.
 */
export interface Dsl4PresentationMediaParts {
  bgm?: {
    captureBgm(): Readonly<{asset: string; volume: number}> | null;
    restoreBgm(state: Readonly<{asset: string; volume: number}> | null): Promise<void>;
  } | null;
  requireBgmAsset?(asset: string): void;
  audio?: {
    captureState(): readonly unknown[];
    prepareRestoreState(state: unknown): Promise<Readonly<{start(): void; dispose(): void}>>;
  } | null;
  texts?: {
    captureTexts(): Record<string, unknown>;
    validateTexts(input: unknown): unknown;
    releaseTextsExcept(input: unknown): void;
    restoreTexts(input: unknown): Promise<void>;
  } | null;
  loops?: {
    captureLoops(): Record<string, unknown>;
    validateLoops(input: unknown): unknown;
    restoreLoops(input: unknown): Promise<void>;
  } | null;
}

const fields = ['bgm', 'audio', 'texts', 'loops'] as const;

/**
 * Refuse a checkpoint whose history holds an action this media save cannot bring back. A pose
 * step's sound is a one-shot that restore stops rather than resumes, like the rest of a cancelled
 * sound. Messages to Scratch and custom actions change state no save holds, so they stay refused.
 */
export function validateDsl4MediaRestoreSupport(
  actions: readonly Readonly<Record<string, unknown>>[],
  options: {bgm: boolean},
) {
  for (const action of actions) {
    const command = String(action.command);
    const restorable =
      action.handler !== 'custom' &&
      (['audio', 'audioControl', 'setText', 'loop', 'pose'].includes(command) ||
        (options.bgm && command === 'bgm'));
    if (!restorable)
      throw new TypeError(
        `This checkpoint requires an explicit presentation restore handler: ${command}`,
      );
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function validateBgm(value: unknown, requireAsset?: (asset: string) => void) {
  if (value === null) return null;
  const bgm = record(value, 'Saved BGM');
  if (
    Object.keys(bgm).length !== 2 ||
    typeof bgm.asset !== 'string' ||
    !bgm.asset ||
    typeof bgm.volume !== 'number' ||
    !Number.isFinite(bgm.volume) ||
    bgm.volume < 0 ||
    bgm.volume > 100
  )
    throw new TypeError('Saved BGM must hold an asset and a volume from 0 to 100');
  requireAsset?.(bgm.asset);
  return {asset: bgm.asset, volume: bgm.volume};
}

export function createDsl4PresentationMediaSave(parts: Dsl4PresentationMediaParts) {
  return Object.freeze({
    capture() {
      return {
        bgm: parts.bgm?.captureBgm() ?? null,
        audio: parts.audio?.captureState() ?? [],
        texts: parts.texts?.captureTexts() ?? {},
        loops: parts.loops?.captureLoops() ?? {},
      };
    },
    /** Validate everything and prepare audio before any change, so a bad save changes nothing. */
    async prepare(input: unknown) {
      const saved = record(input, 'Saved media');
      if (Object.keys(saved).some((key) => !(fields as readonly string[]).includes(key)))
        throw new TypeError('Unknown saved media fields');
      const bgm = validateBgm(saved.bgm ?? null, parts.requireBgmAsset);
      if (bgm !== null && !parts.bgm) throw new TypeError('BGM restore is unavailable');
      const audioState = saved.audio ?? [];
      if (!Array.isArray(audioState)) throw new TypeError('Saved audio must be a list');
      if (audioState.length && !parts.audio) throw new TypeError('Audio restore is unavailable');
      const texts = saved.texts ?? {};
      if (parts.texts) parts.texts.validateTexts(texts);
      else if (Object.keys(record(texts, 'Saved texts')).length)
        throw new TypeError('Text restore is unavailable');
      const loops = saved.loops ?? {};
      if (parts.loops) parts.loops.validateLoops(loops);
      else if (Object.keys(record(loops, 'Saved loops')).length)
        throw new TypeError('Loop restore is unavailable');
      const previousTexts = parts.texts?.captureTexts() ?? {};
      const audio = await parts.audio?.prepareRestoreState(audioState);
      return Object.freeze({
        beforeTargets() {
          parts.texts?.releaseTextsExcept(texts);
        },
        async afterTargets() {
          await parts.texts?.restoreTexts(texts);
        },
        async revert() {
          parts.texts?.releaseTextsExcept(previousTexts);
          await parts.texts?.restoreTexts(previousTexts);
        },
        async start() {
          const errors: unknown[] = [];
          for (const step of [
            () => parts.bgm?.restoreBgm(bgm),
            () => audio?.start(),
            () => parts.loops?.restoreLoops(loops),
          ])
            try {
              await step();
            } catch (error) {
              errors.push(error);
            }
          if (errors.length) throw new AggregateError(errors, 'Saved media could not start');
        },
        dispose() {
          audio?.dispose();
        },
      });
    },
  });
}
