const recognitionCommands = new Set(['pose', 'poseInputToChangeScene', 'imageInputToChangeScene']);

export const dsl4InvalidatedRecognitionPreloadCapability =
  '// Kamishibai capabilities: invalidate-model-preload-v1';

/** This derived runtime metadata must not be silently dropped by an older runner. */
export function hasDsl4InvalidatedRecognitionMetadata(story: unknown): boolean {
  if (!story || typeof story !== 'object') return false;
  const metadata = (story as Readonly<Record<string, unknown>>).metadata as
    Readonly<Record<string, unknown>> | undefined;
  return (
    Array.isArray(metadata?.invalidatedRecognitionScenes) &&
    metadata.invalidatedRecognitionScenes.length > 0
  );
}

/** Commands that actually consume the current scene's recognition model. */
export function isDsl4RecognitionCommand(command: unknown): boolean {
  return typeof command === 'string' && recognitionCommands.has(command);
}

/** Source actions use an actor-qualified name for pose sequences. */
export function isDsl4RecognitionSourceCommand(command: string): boolean {
  return isDsl4RecognitionCommand(command) || command.endsWith('.pose');
}
