import {encodeDsl4StoryPathSegment} from './story-path.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Find opt-in actions in the normalized scene sequence, not in arbitrary custom payloads. */
export function dsl4FirstPresentationEffectStoryPath(story: Readonly<Record<string, unknown>>) {
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

export const dsl4PresentationEffectsFlagError = 'K4-PRESENTATION-EFFECTS-FLAG-001';
export const dsl4PresentationEffectsFlagMessage =
  'dsl4PresentationEffects must be enabled for actor animation or presentation effects';
