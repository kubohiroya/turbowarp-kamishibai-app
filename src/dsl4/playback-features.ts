/**
 * What a story can offer on its playback settings screen.
 *
 * The settings screen shows only the controls that change something for this story: a story
 * without BGM has no BGM slider, and a story without pose waits has no skip switch. The answer is
 * read once from the normalized story document, so it never depends on how far playback got.
 *
 * The module has no imports so the pure DSL 4.0 core can use it.
 */
export interface Dsl4PlaybackFeatures {
  /** The story plays, stops, or changes the volume of BGM. */
  readonly bgm: boolean;
  /** The story plays sound effects: `sound`, ID-based `audio`, or recognition cue sounds. */
  readonly effects: boolean;
  /** The story waits for poses, so the skip policy decides whether a person can skip them. */
  readonly skip: boolean;
  /** What the story itself says about skipping pose waits (`recognition.navigation.allowSkip`). */
  readonly skipDefault: boolean;
  /** The story uses Teachable Machine recognition, so its camera and compute settings apply. */
  readonly recognition: boolean;
}

const bgmCommands = new Set(['bgm', 'stopBgm', 'setBgmVolume']);
const effectCommands = new Set(['sound', 'audio', 'audioControl']);
const poseCommands = new Set(['pose', 'poseSequence', 'poseInputToChangeScene']);
const recognitionCommands = new Set([...poseCommands, 'imageInputToChangeScene']);

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Collect every `command` in the document, including actions nested in branches and loops. */
function collectCommands(value: unknown, commands: Set<string>, seen: Set<object>) {
  if (typeof value !== 'object' || value === null || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectCommands(item, commands, seen);
    return;
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (typeof record.command === 'string') commands.add(record.command);
  for (const child of Object.values(record)) collectCommands(child, commands, seen);
}

/** Read the playback settings a normalized DSL 4.0 story document can use. */
export function resolveDsl4PlaybackFeatures(storyDocument: unknown): Dsl4PlaybackFeatures {
  const document = isRecord(storyDocument) ? storyDocument : {};
  const commands = new Set<string>();
  collectCommands(document.scenes, commands, new Set());
  const recognition = isRecord(document.recognition) ? document.recognition : null;
  const navigation = isRecord(recognition?.navigation) ? recognition.navigation : null;
  const hasCueSound =
    typeof recognition?.idleSound === 'string' || typeof recognition?.chargeSound === 'string';
  const has = (names: ReadonlySet<string>) => [...names].some((name) => commands.has(name));
  return Object.freeze({
    bgm: has(bgmCommands),
    effects: has(effectCommands) || hasCueSound,
    skip: has(poseCommands),
    skipDefault: navigation?.allowSkip === true,
    recognition: has(recognitionCommands),
  });
}

/** The features of a story that is not known yet: every optional control stays hidden. */
export const dsl4NoPlaybackFeatures: Dsl4PlaybackFeatures = Object.freeze({
  bgm: false,
  effects: false,
  skip: false,
  skipDefault: false,
  recognition: false,
});
