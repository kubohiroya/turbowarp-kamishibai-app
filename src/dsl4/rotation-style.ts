export const dsl4RotationStyleNames = Object.freeze(['allAround', 'leftRight', 'none'] as const);

export type Dsl4RotationStyle = (typeof dsl4RotationStyleNames)[number];

const rotationStyleNames: ReadonlySet<string> = new Set(dsl4RotationStyleNames);

export function isDsl4RotationStyle(value: unknown): value is Dsl4RotationStyle {
  return typeof value === 'string' && rotationStyleNames.has(value);
}

/** Scratch names the same three choices differently; keep the mapping in one place. */
const scratchNames = Object.freeze({
  allAround: 'all around',
  leftRight: 'left-right',
  none: "don't rotate",
} as const satisfies Record<Dsl4RotationStyle, string>);

export function scratchDsl4RotationStyle(style: Dsl4RotationStyle) {
  if (!isDsl4RotationStyle(style)) throw new TypeError(`Unknown rotation style: ${String(style)}`);
  return scratchNames[style];
}

/**
 * Wrap an authored angle into Scratch's own −179 through 180 range, so a saved value and one
 * read back from a sprite compare equal. 90 points right, as everywhere else in Scratch.
 */
export function normalizeDsl4Direction(direction: number) {
  if (!Number.isFinite(direction)) {
    throw new TypeError(`Direction must be a finite number: ${String(direction)}`);
  }
  const wrapped = ((((direction + 179) % 360) + 360) % 360) - 179;
  return Math.round(wrapped * 100) / 100;
}
