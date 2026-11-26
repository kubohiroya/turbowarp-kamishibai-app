export const dsl4TextInterpolationLimits = Object.freeze({depth: 16, nodes: 128, chars: 8192});

export type Dsl4TextExpression =
  | string
  | number
  | {readonly variable: string}
  | {readonly join: readonly [Dsl4TextExpression, Dsl4TextExpression]};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isDsl4TextInterpolation(value: unknown): value is {interpolate: unknown} {
  return record(value) && Object.hasOwn(value, 'interpolate');
}

export function dsl4TextInterpolationError(message: string) {
  return Object.assign(new Error(message), {code: 'K4-TEXT-INTERPOLATION-001'});
}

/** Walk only typed, bounded nodes. No Scratch, JavaScript, locale, or implicit variable lookup. */
export function evaluateDsl4TextInterpolation(
  value: unknown,
  readVariable: (name: string) => unknown,
): string {
  if (
    !isDsl4TextInterpolation(value) ||
    Object.keys(value).length !== 1 ||
    !record(value.interpolate)
  ) {
    throw dsl4TextInterpolationError('Expected a text interpolation');
  }
  let remaining = dsl4TextInterpolationLimits.chars;
  let nodes = 0;

  function visit(node: unknown, depth: number): string {
    if (depth > dsl4TextInterpolationLimits.depth || ++nodes > dsl4TextInterpolationLimits.nodes) {
      throw dsl4TextInterpolationError('Text interpolation is too deeply nested or too large');
    }
    let leaf: unknown = node;
    if (record(node)) {
      if (Object.keys(node).length !== 1) {
        throw dsl4TextInterpolationError('Expected a variable or a two-part join');
      }
      if (Object.hasOwn(node, 'join') && Array.isArray(node.join) && node.join.length === 2) {
        return visit(node.join[0], depth + 1) + visit(node.join[1], depth + 1);
      }
      if (
        !Object.hasOwn(node, 'variable') ||
        typeof node.variable !== 'string' ||
        !/^[\p{L}_][\p{L}\p{N}_-]*$/u.test(node.variable) ||
        node.variable !== node.variable.normalize('NFC')
      ) {
        throw dsl4TextInterpolationError('Invalid story variable name in text interpolation');
      }
      leaf = readVariable(node.variable);
      if (leaf === undefined) {
        throw dsl4TextInterpolationError(
          `Unknown story variable in text interpolation: ${node.variable}`,
        );
      }
      if (typeof leaf === 'boolean') leaf = leaf ? 'true' : 'false';
    }
    if (typeof leaf !== 'string' && (typeof leaf !== 'number' || !Number.isFinite(leaf))) {
      throw dsl4TextInterpolationError('Text interpolation requires strings or finite numbers');
    }
    const result = String(leaf);
    remaining -= result.length;
    if (remaining < 0)
      throw dsl4TextInterpolationError('Text interpolation exceeds its text limit');
    return result;
  }

  return visit(value.interpolate, 0);
}
