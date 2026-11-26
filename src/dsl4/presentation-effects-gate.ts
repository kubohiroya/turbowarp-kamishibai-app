import {encodeDsl4StoryPathSegment} from './story-path.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Find presentation actions in the normalized scene sequence, not in arbitrary custom payloads. */
export function dsl4FirstPresentationEffectStoryPath(story: unknown) {
  if (!isRecord(story)) return null;
  const scenes: unknown[] = Array.isArray(story.scenes) ? story.scenes : [];
  for (const scene of scenes) {
    if (!isRecord(scene) || typeof scene.id !== 'string' || !Array.isArray(scene.actions)) continue;
    for (const [index, action] of (scene.actions as unknown[]).entries()) {
      if (!isRecord(action) || action.handler === 'custom') continue;
      if (action.command === 'animate' || action.command === 'presentationEffect') {
        return `/scenes/${encodeDsl4StoryPathSegment(scene.id)}/actions/${index}`;
      }
    }
  }
  return null;
}

export const dsl4PresentationEffectsRuntimeCapability =
  '// Kamishibai capabilities: presentation-effects-v1';

export const dsl4PresentationEffectsFlagError = 'K4-PRESENTATION-EFFECTS-FLAG-001';
export const dsl4PresentationEffectsFlagMessage =
  'dsl4PresentationEffects must be enabled for actor animation or presentation effects';

export function dsl4HasPresentationEffectsRuntime(
  replacementSource: string | undefined,
  embeddedUrl: unknown,
) {
  return dsl4HasRuntimeCapability(
    replacementSource,
    embeddedUrl,
    dsl4PresentationEffectsRuntimeCapability,
  );
}

export function dsl4HasRuntimeCapability(
  replacementSource: string | undefined,
  embeddedUrl: unknown,
  capability: string,
) {
  if (replacementSource !== undefined) return replacementSource.includes(capability);
  const prefix = 'data:text/javascript;base64,';
  if (typeof embeddedUrl !== 'string' || !embeddedUrl.startsWith(prefix)) return false;
  try {
    return atob(embeddedUrl.slice(prefix.length)).includes(capability);
  } catch {
    return false;
  }
}
