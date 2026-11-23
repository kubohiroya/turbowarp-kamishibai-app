/**
 * Where the camera preview sits while a pose action owns it, and how strongly it shows.
 *
 * DSL 3.2 always covered the stage at a fifth of full strength, so that stays the default and a
 * story that says nothing keeps the picture it has today. `recognition.preview.position` and
 * `recognition.preview.opacity` let a script ask for something else — a corner box, or a preview
 * strong enough to see in a bright room — and this module is the one place that reads them, so the
 * camera lifecycle and the pose actions cannot disagree about the placement they apply.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The placements the Teachable Machine composition accepts for its preview. */
export const dsl4PosePreviewPositions = Object.freeze([
  'full-stage',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'center',
] as const);

export type Dsl4PosePreviewPosition = (typeof dsl4PosePreviewPositions)[number];

export const dsl4DefaultPosePreviewPosition: Dsl4PosePreviewPosition = 'full-stage';
/** DSL 3.2 showed the camera over the whole stage at this strength. */
export const dsl4DefaultPosePreviewOpacity = 0.2;

export interface Dsl4PosePreviewPlacement {
  readonly position: Dsl4PosePreviewPosition;
  readonly opacity: number;
}

export function validateDsl4PosePreviewPosition(
  value: unknown,
  label = 'pose preview position',
): Dsl4PosePreviewPosition {
  if (
    typeof value !== 'string' ||
    !(dsl4PosePreviewPositions as readonly string[]).includes(value)
  ) {
    throw new TypeError(
      `${label} must be one of ${dsl4PosePreviewPositions.join(', ')}, received ${String(value)}`,
    );
  }
  return value as Dsl4PosePreviewPosition;
}

export function validateDsl4PosePreviewOpacity(
  value: unknown,
  label = 'pose preview opacity',
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${label} must be a finite number from 0 to 1, received ${String(value)}`);
  }
  return value;
}

/**
 * Read the placement a story asked for, falling back to the DSL 3.2 picture key by key.
 *
 * The schema already rejects an out-of-range opacity or an unknown position, so an invalid value
 * here means the caller passed something the source frontend never validated: it fails rather than
 * being rounded into a placement the story did not ask for.
 */
export function readDsl4PosePreviewPlacement(preview: unknown): Dsl4PosePreviewPlacement {
  const source = isRecord(preview) ? preview : {};
  return Object.freeze({
    position:
      source.position === undefined
        ? dsl4DefaultPosePreviewPosition
        : validateDsl4PosePreviewPosition(source.position, 'recognition.preview.position'),
    opacity:
      source.opacity === undefined
        ? dsl4DefaultPosePreviewOpacity
        : validateDsl4PosePreviewOpacity(source.opacity, 'recognition.preview.opacity'),
  });
}
