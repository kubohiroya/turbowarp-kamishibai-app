import {isDsl4RecognitionSourceCommand} from './recognition-actions.js';

/** Compile bounded narrative structure without executing Scratch or evaluating expressions. */
export type NarrativePath = (string | number)[];
type RecordValue = Record<string, unknown>;
type Scalar = string | number | boolean;
export interface NarrativeOrigin {
  path: NarrativePath;
  frames: {scope: string; index: number; number: number}[];
  guards: {id: string; expected: boolean}[];
  boundary?: true;
  decision?: {id: string; condition: string | boolean};
}
export interface NarrativeCompilation {
  story: RecordValue;
  hasInvalidation: boolean;
  invalidatedRecognitionScenes: string[];
  origins: Record<string, NarrativeOrigin[]>;
  validation: Record<string, {action: RecordValue; origin: NarrativeOrigin}[]>;
}
export const dsl4NarrativeControlLimits = Object.freeze({maxIterations: 1024, maxNesting: 16});
export class Dsl4NarrativeControlError extends Error {
  readonly code: string;
  constructor(
    code: string,
    message: string,
    readonly path: NarrativePath,
  ) {
    super(message);
    this.name = 'Dsl4NarrativeControlError';
    this.code = code;
  }
}
const id = /^[\p{L}_][\p{L}\p{N}_-]*$/u;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
function record(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Detect the dedicated source form only in scene action positions, including nested controls. */
export function hasDsl4Invalidation(input: unknown): boolean {
  if (!record(input) || !record(input.scenes)) return false;
  const visit = (items: unknown, depth = 0): boolean => {
    if (!Array.isArray(items) || depth > 32) return false;
    return items.some((action) => {
      if (!record(action)) return false;
      if (Object.hasOwn(action, 'invalidate')) return true;
      if (record(action.if))
        return visit(action.if.then, depth + 1) || visit(action.if.else, depth + 1);
      if (record(action.repeat)) return visit(action.repeat.do, depth + 1);
      if (record(action.forEach)) return visit(action.forEach.do, depth + 1);
      return false;
    });
  };
  return Object.values(input.scenes).some((scene) =>
    visit(Array.isArray(scene) ? scene : record(scene) ? scene.actions : undefined),
  );
}

/** Detect control commands in scene action positions, never in arbitrary literal payloads. */
export function findDsl4NarrativeControlPath(input: unknown): NarrativePath | undefined {
  if (!record(input) || !record(input.scenes)) return undefined;
  for (const [sceneId, scene] of Object.entries(input.scenes)) {
    const body = Array.isArray(scene) ? scene : record(scene) ? scene.actions : undefined;
    if (!Array.isArray(body)) continue;
    for (const [index, action] of body.entries()) {
      if (!record(action)) continue;
      for (const command of ['if', 'repeat', 'forEach', 'invalidate']) {
        if (Object.hasOwn(action, command))
          return ['scenes', sceneId, ...(Array.isArray(scene) ? [] : ['actions']), index, command];
      }
    }
  }
  return undefined;
}
function fail(message: string, path: NarrativePath, limit = false): never {
  throw new Dsl4NarrativeControlError(
    limit ? 'K4-NARRATIVE-LIMIT-001' : 'K4-NARRATIVE-SOURCE-001',
    message,
    path,
  );
}
function keys(value: RecordValue, allowed: string[], path: NarrativePath) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    fail('Unknown narrative field', path);
}
function scopeName(value: unknown, path: NarrativePath): string {
  if (
    typeof value !== 'string' ||
    !id.test(value) ||
    value !== value.normalize('NFC') ||
    forbidden.has(value)
  ) {
    fail('Narrative scope and column names must be canonical DSL identifiers', path);
  }
  return value;
}
function actions(value: unknown, path: NarrativePath): RecordValue[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => !record(item) || Object.keys(item).length !== 1)
  ) {
    fail('Narrative body must be a sequence of single-command mappings', path);
  }
  return value as RecordValue[];
}

/** Inspect only action positions; never resolve the contents of an OFF draft. */
function containsRecognitionAction(list: RecordValue[]): boolean {
  return list.some((action) => {
    const command = Object.keys(action)[0]!;
    if (isDsl4RecognitionSourceCommand(command)) return true;
    const value = action[command];
    if (!record(value)) return false;
    if (command === 'if')
      return (
        containsRecognitionAction(value.then as RecordValue[]) ||
        containsRecognitionAction((value.else ?? []) as RecordValue[])
      );
    if (command === 'repeat' || command === 'forEach')
      return containsRecognitionAction(value.do as RecordValue[]);
    return command === 'invalidate' && containsRecognitionAction(value.then as RecordValue[]);
  });
}

/** Convert the declarative condition tree to the existing bounded expression language. */
export function compileDsl4NarrativeCondition(
  value: unknown,
  variables: RecordValue,
  path: NarrativePath,
): string | boolean {
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  let count = 0;
  function expression(node: unknown, depth: number, operand = false): string {
    if (++count > 512 || depth > 16) fail('Condition tree exceeds its finite limits', path, true);
    if (typeof node === 'string') return operand ? JSON.stringify(node) : node;
    if (typeof node === 'boolean') return JSON.stringify(node);
    if (typeof node === 'number' && operand && Number.isFinite(node)) return JSON.stringify(node);
    if (!record(node) || Object.keys(node).length !== 1) fail('Invalid condition node', path);
    if (typeof node.variable === 'string') {
      const name = scopeName(node.variable, path);
      if (!Object.hasOwn(variables, name)) fail('Unknown story variable in condition', path);
      return `vars[${JSON.stringify(name)}]`;
    }
    if (record(node.compare)) {
      keys(node.compare, ['left', 'operator', 'right'], path);
      const operator = node.compare.operator;
      if (typeof operator !== 'string' || !['==', '!=', '<', '<=', '>', '>='].includes(operator))
        fail('Unknown comparison operator', path);
      return `(${expression(node.compare.left, depth + 1, true)} ${operator} ${expression(node.compare.right, depth + 1, true)})`;
    }
    if (Object.hasOwn(node, 'not')) return `!(${expression(node.not, depth + 1)})`;
    const kind = Object.hasOwn(node, 'all') ? 'all' : 'any';
    const children = node[kind];
    if (!Array.isArray(children) || children.length < 1 || children.length > 32)
      fail('Logic must contain 1 through 32 conditions', path);
    const flattened: unknown[] = [];
    function append(child: unknown) {
      if (record(child) && Object.keys(child).length === 1 && Array.isArray(child[kind]))
        for (const item of child[kind] as unknown[]) append(item);
      else flattened.push(child);
    }
    for (const child of children) append(child);
    if (flattened.length > 32) fail('Logic exceeds 32 conditions', path, true);
    return `(${flattened.map((child) => expression(child, depth + 1)).join(kind === 'all' ? ' && ' : ' || ')})`;
  }
  return expression(value, 0);
}

/** The caller validates ordinary actions through the existing schema and semantic frontend. */
export function compileDsl4NarrativeSource(
  input: RecordValue,
  {
    maxActionsPerScene = 1024,
    maxTotalActions = 4096,
    maxIterations = 1024,
    maxNesting = 16,
  }: {
    maxActionsPerScene?: number;
    maxTotalActions?: number;
    maxIterations?: number;
    maxNesting?: number;
  } = {},
): NarrativeCompilation {
  for (const limit of [maxActionsPerScene, maxTotalActions]) {
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new TypeError('Narrative action limits must be positive integers');
  }
  if (
    !Number.isSafeInteger(maxIterations) ||
    maxIterations < 0 ||
    maxIterations > 1024 ||
    !Number.isSafeInteger(maxNesting) ||
    maxNesting < 0 ||
    maxNesting > 16
  )
    throw new TypeError('Narrative policy may only lower the default limits');
  if (input.kamishibai !== '4.0' || !record(input.scenes))
    fail('Narrative source requires version 4.0 and scenes', []);
  const sceneEntries = Object.entries(input.scenes);
  const sourceBodies = sceneEntries.map(([sceneId, scene]) => {
    if (!Array.isArray(scene) && !record(scene))
      fail('Scene must contain an action sequence', ['scenes', sceneId]);
    const path: NarrativePath = ['scenes', sceneId, ...(Array.isArray(scene) ? [] : ['actions'])];
    return {
      sceneId,
      scene,
      path,
      body: actions(Array.isArray(scene) ? scene : scene.actions, path),
    };
  });
  let hasInvalidation = false;
  // Count bounded control boundaries as well as both arms before allocating an expanded sequence.
  function cost(body: RecordValue[], path: NarrativePath, depth: number): number {
    if (depth > maxNesting) fail(`Narrative nesting exceeds ${maxNesting}`, path, true);
    let count = 0;
    body.forEach((action, index) => {
      const [command] = Object.keys(action);
      const at = [...path, index, command!];
      const value = action[command!];
      if (['if', 'repeat', 'forEach', 'invalidate'].includes(command!)) {
        if (!record(value)) fail('Narrative arguments must be a mapping', at);
        if (command === 'invalidate') {
          hasInvalidation = true;
          keys(value, ['condition', 'then'], at);
          if (typeof value.condition !== 'boolean')
            fail('Invalidation condition must be a static boolean', [...at, 'condition']);
          count += 1 + cost(actions(value.then, [...at, 'then']), [...at, 'then'], depth + 1);
        } else if (command === 'if') {
          keys(value, ['condition', 'then', 'else'], at);
          if (!Object.hasOwn(value, 'condition')) fail('Condition is required', at);
          count +=
            1 +
            cost(actions(value.then, [...at, 'then']), [...at, 'then'], depth + 1) +
            cost(actions(value.else ?? [], [...at, 'else']), [...at, 'else'], depth + 1);
        } else {
          const each = command === 'forEach';
          keys(value, each ? ['as', 'items', 'do'] : ['as', 'times', 'do'], at);
          if (each || value.as !== undefined) scopeName(value.as, [...at, 'as']);
          const times = each ? (Array.isArray(value.items) ? value.items.length : -1) : value.times;
          if (
            typeof times !== 'number' ||
            !Number.isSafeInteger(times) ||
            times < 0 ||
            times > maxIterations
          ) {
            fail(`Iteration count must be an integer from 0 through ${maxIterations}`, at, true);
          }
          const inner = cost(actions(value.do, [...at, 'do']), [...at, 'do'], depth + 1);
          count += 1 + times * (1 + inner);
          if (each) {
            let columns: string | undefined;
            for (const [rowIndex, row] of (value.items as unknown[]).entries()) {
              if (!record(row))
                fail('Each narrative row must be a mapping', [...at, 'items', rowIndex]);
              if (Object.keys(row).length > 32)
                fail('Narrative rows exceed 32 columns', [...at, 'items', rowIndex], true);
              for (const [name, field] of Object.entries(row)) {
                scopeName(name, [...at, 'items', rowIndex, name]);
                if (
                  !['string', 'number', 'boolean'].includes(typeof field) ||
                  (typeof field === 'number' && !Number.isFinite(field))
                ) {
                  fail('Narrative row values must be finite scalar values', [
                    ...at,
                    'items',
                    rowIndex,
                    name,
                  ]);
                }
              }
              const shape = JSON.stringify(
                Object.entries(row)
                  .map(([name, field]) => [name, typeof field])
                  .sort(),
              );
              if (columns !== undefined && shape !== columns)
                fail('Narrative row column names and types must match', [...at, 'items', rowIndex]);
              columns = shape;
            }
          }
        }
      } else count += 1;
      if (count > Math.min(maxActionsPerScene, maxTotalActions))
        fail('Expanded action count exceeds the host limit', at, true);
    });
    return count;
  }
  let total = 0;
  for (const entry of sourceBodies) {
    total += cost(entry.body, entry.path, 0);
    if (total > maxTotalActions)
      fail('Expanded story exceeds the total action limit', entry.path, true);
  }
  const origins: NarrativeCompilation['origins'] = Object.create(null);
  const validation: NarrativeCompilation['validation'] = Object.create(null);
  const scenes: RecordValue = Object.create(null);
  const invalidatedRecognitionScenes = new Set<string>();
  let sequence = 0;
  for (const {sceneId, scene, path, body} of sourceBodies) {
    const expanded: RecordValue[] = [];
    origins[sceneId] = [];
    validation[sceneId] = [];
    function resolve(
      value: unknown,
      scopes: Map<string, Record<string, Scalar>>,
      at: NarrativePath,
    ): unknown {
      if (Array.isArray(value)) return value.map((child, i) => resolve(child, scopes, [...at, i]));
      if (!record(value)) return value;
      if (Object.keys(value).length === 1 && Object.hasOwn(value, 'ref')) {
        const match = typeof value.ref === 'string' ? value.ref.split('.') : [];
        const [scope, name] = match;
        if (
          match.length !== 2 ||
          !scope ||
          !name ||
          !scopes.has(scope) ||
          !Object.hasOwn(scopes.get(scope)!, name)
        ) {
          fail('Unknown narrative reference', at);
        }
        return scopes.get(scope)![name];
      }
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => {
          if (forbidden.has(key)) fail('Forbidden mapping key', [...at, key]);
          return [key, resolve(child, scopes, [...at, key])];
        }),
      );
    }
    function resolveCondition(
      value: unknown,
      scopes: Map<string, Record<string, Scalar>>,
      at: NarrativePath,
      operand = false,
    ): unknown {
      if (!record(value)) return value;
      if (Object.keys(value).length === 1 && Object.hasOwn(value, 'ref')) {
        const resolved = resolve(value, scopes, at);
        if (!operand && typeof resolved !== 'boolean')
          fail('Condition reference must be boolean', at);
        return resolved;
      }
      if (record(value.compare))
        return {
          compare: {
            ...value.compare,
            left: resolveCondition(value.compare.left, scopes, [...at, 'compare', 'left'], true),
            right: resolveCondition(value.compare.right, scopes, [...at, 'compare', 'right'], true),
          },
        };
      if (Object.hasOwn(value, 'not'))
        return {not: resolveCondition(value.not, scopes, [...at, 'not'])};
      for (const kind of ['all', 'any'])
        if (Array.isArray(value[kind]))
          return {
            [kind]: (value[kind] as unknown[]).map((child, i) =>
              resolveCondition(child, scopes, [...at, kind, i]),
            ),
          };
      return value;
    }
    function emit(action: RecordValue, origin: NarrativeOrigin, active: boolean) {
      if (validation[sceneId]!.length >= maxTotalActions)
        fail('Validation action count exceeds the host limit', origin.path, true);
      validation[sceneId]!.push({action, origin});
      if (active) {
        expanded.push(action);
        origins[sceneId]!.push(origin);
      }
    }
    function walk(
      list: RecordValue[],
      at: NarrativePath,
      scopes: Map<string, Record<string, Scalar>>,
      parent: Omit<NarrativeOrigin, 'path'>,
      active: boolean,
    ) {
      list.forEach((action, index) => {
        const [command] = Object.keys(action);
        const path = [...at, index];
        const value = action[command!];
        const origin: NarrativeOrigin = {
          path,
          frames: [...parent.frames],
          guards: [...parent.guards],
        };
        if (command === 'invalidate') {
          const args = value as RecordValue;
          emit({wait: 0}, {...origin, boundary: true}, active);
          // Disabled authoring content remains in YAML, but is neither resolved nor dispatched.
          if (args.condition === true)
            walk(
              args.then as RecordValue[],
              [...path, 'invalidate', 'then'],
              scopes,
              parent,
              active,
            );
          else if (containsRecognitionAction(args.then as RecordValue[]))
            invalidatedRecognitionScenes.add(sceneId);
        } else if (command === 'if') {
          const args = value as RecordValue;
          const resolvedCondition = resolveCondition(args.condition, scopes, [
            ...path,
            'if',
            'condition',
          ]);
          const condition = compileDsl4NarrativeCondition(
            resolvedCondition,
            record(input.variables) ? input.variables : {},
            [...path, 'if', 'condition'],
          );
          if (!(
            typeof condition === 'boolean' ||
            (typeof condition === 'string' && condition.length > 0)
          ))
            fail('Condition must be a boolean or expression string', [...path, 'if', 'condition']);
          if (
            record(args.condition) &&
            Object.hasOwn(args.condition, 'ref') &&
            typeof condition !== 'boolean'
          )
            fail('Condition reference must be boolean', [...path, 'if', 'condition']);
          const id = `narrative-${sequence++}`;
          emit({wait: 0}, {...origin, boundary: true, decision: {id, condition}}, active);
          for (const [arm, expected] of [
            ['then', true],
            ['else', false],
          ] as const) {
            walk(
              (args[arm] ?? []) as RecordValue[],
              [...path, 'if', arm],
              scopes,
              {...parent, guards: [...parent.guards, {id, expected}]},
              active,
            );
          }
        } else if (command === 'repeat' || command === 'forEach') {
          const args = value as RecordValue;
          emit({wait: 0}, {...origin, boundary: true}, active);
          const each = command === 'forEach';
          const count = each ? (args.items as unknown[]).length : (args.times as number);
          for (let i = 0; i < Math.max(1, count); i += 1) {
            const scoped = new Map(scopes);
            if (typeof args.as === 'string')
              scoped.set(
                args.as,
                each
                  ? ((args.items as Record<string, Scalar>[])[i] ?? {})
                  : {index: i, number: i + 1},
              );
            const frame = {scope: String(args.as ?? ''), index: i, number: i + 1};
            const context = {...parent, frames: [...parent.frames, frame]};
            if (count > 0)
              emit({wait: 0}, {...origin, frames: context.frames, boundary: true}, active);
            walk(
              args.do as RecordValue[],
              [...path, command, 'do'],
              scoped,
              context,
              active && count > 0,
            );
          }
        } else {
          const resolved = resolve(action, scopes, path) as RecordValue;
          const args = resolved[command!];
          if (record(args) && typeof args.stableId === 'string' && parent.frames.length) {
            args.stableId += `__iteration_${parent.frames.map((frame) => frame.index).join('_')}`;
          }
          emit(resolved, origin, active);
        }
      });
    }
    walk(body, path, new Map(), {frames: [], guards: []}, true);
    scenes[sceneId] = Array.isArray(scene) ? expanded : {...scene, actions: expanded};
  }
  return {
    story: {...input, kamishibai: '4.0', scenes},
    hasInvalidation,
    invalidatedRecognitionScenes: [...invalidatedRecognitionScenes],
    origins,
    validation,
  };
}
