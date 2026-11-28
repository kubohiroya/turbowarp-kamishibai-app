import {deflateSync, inflateSync, strFromU8, strToU8} from 'fflate';
import {parse} from 'yaml';
import {canonicalizeDsl4AuthoringBlocks, Dsl4BlockSourceError} from './block-source-shared.js';

const marker = '# kamishibai-block-sections-v1: ';
const maximumStateBytes = 8 * 1024 * 1024;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export interface Dsl4SectionAuthoringState {
  version: 1;
  source: Record<string, unknown>;
  hatId: string;
  activeBlockIds: string[];
  blocks: Record<string, unknown>;
}
function fail(message: string): never {
  throw new Dsl4BlockSourceError('K4-BLOCK-SOURCE-SECTION-STATE-001', message);
}
function stable(value: unknown, depth = 0): string {
  if (depth > 64) fail('Section state exceeds its nesting limit');
  if (Array.isArray(value)) return '[' + value.map((v) => stable(v, depth + 1)).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => {
          if (forbidden.has(key)) fail('Section state contains a forbidden key');
          return (
            JSON.stringify(key) + ':' + stable((value as Record<string, unknown>)[key], depth + 1)
          );
        })
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value) ?? 'null';
}
/** Preserve editable sections as bounded YAML comments, outside the executable story schema. */
export function appendDsl4SectionAuthoringState(
  source: string,
  state: Dsl4SectionAuthoringState,
): string {
  const bytes = strToU8(JSON.stringify(state));
  if (bytes.length > maximumStateBytes) fail('Section authoring state exceeds its byte limit');
  const compressed = deflateSync(bytes);
  let binary = '';
  for (let i = 0; i < compressed.length; i += 8192) {
    binary += String.fromCharCode(...compressed.subarray(i, i + 8192));
  }
  return source + marker + bytes.length + ':' + btoa(binary) + '\n';
}
/** Reject stale comments instead of silently overwriting independently edited YAML. */
export function readDsl4SectionAuthoringState(
  source: string,
): Dsl4SectionAuthoringState | undefined {
  const lines = source.split('\n').filter((line) => line.startsWith(marker));
  if (!lines.length) return undefined;
  if (lines.length !== 1) fail('Section authoring state must occur once');
  const match = /^(\d+):([A-Za-z0-9+/]+={0,2})$/.exec(lines[0]!.slice(marker.length));
  if (!match || match[2]!.length > maximumStateBytes * 2)
    fail('Section authoring state is malformed');
  const size = Number(match[1]);
  if (!Number.isSafeInteger(size) || size < 1 || size > maximumStateBytes) {
    fail('Section authoring state exceeds its byte limit');
  }
  let state: Dsl4SectionAuthoringState;
  try {
    const compressed = Uint8Array.from(atob(match[2]!), (c) => c.charCodeAt(0));
    const bytes = inflateSync(compressed, {out: new Uint8Array(size)});
    state = JSON.parse(strFromU8(bytes));
  } catch {
    fail('Section authoring state cannot be decoded');
  }
  if (
    state?.version !== 1 ||
    typeof state.hatId !== 'string' ||
    !state.blocks ||
    typeof state.blocks !== 'object' ||
    Array.isArray(state.blocks) ||
    !Array.isArray(state.activeBlockIds) ||
    state.activeBlockIds.length > 8192 ||
    state.activeBlockIds.some((id) => typeof id !== 'string' || !Object.hasOwn(state.blocks, id)) ||
    !Object.hasOwn(state.blocks, state.hatId) ||
    Object.keys(state.blocks).length > 8192
  ) {
    fail('Section authoring state has an invalid block graph');
  }
  stable(state);
  if (stable(parse(source, {uniqueKeys: true})) !== stable(state.source)) {
    fail(
      'YAML changed independently of its section state; edit the SB3 or remove the section-state comment',
    );
  }
  return state;
}
/** Give restored graphs fresh module-local IDs without changing literal input values. */
export function restoreDsl4SectionBlocks(
  state: Dsl4SectionAuthoringState,
  hatId: string,
  idPrefix: string,
  label: string,
  source: Record<string, unknown>,
  includeLabels: readonly string[],
): Record<string, unknown> {
  const ids = new Map(
    Object.keys(state.blocks).map((id, i) => [
      id,
      id === state.hatId ? hatId : `${idPrefix}Section${i}`,
    ]),
  );
  const remap = (id: unknown) =>
    id === null ? null : (ids.get(String(id)) ?? fail('Section graph refers to a missing block'));
  let includeIndex = 0;
  const active = new Set(state.activeBlockIds);
  function literal(block: Record<string, unknown>, name: string): unknown {
    const inputs = block.inputs as Record<string, unknown>;
    const connection = inputs[name];
    if (!Array.isArray(connection)) return undefined;
    if (Array.isArray(connection[1])) return connection[1][1];
    const shadow = state.blocks[String(connection[1])] as Record<string, unknown> | undefined;
    const text = (shadow?.fields as Record<string, unknown> | undefined)?.TEXT;
    return Array.isArray(text) ? text[0] : undefined;
  }
  // A state saved by an earlier writer may spell its declarations with the retired extension; the
  // caller gives the restored graph its project's spelling.
  const savedBlocks = canonicalizeDsl4AuthoringBlocks(state.blocks);
  return Object.fromEntries(
    Object.entries(savedBlocks).map(([id, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        fail('Invalid section block');
      const block = structuredClone(value) as Record<string, unknown>;
      block.parent = remap(block.parent);
      block.next = remap(block.next);
      if (!block.inputs || typeof block.inputs !== 'object' || Array.isArray(block.inputs))
        fail('Invalid section block inputs');
      for (const input of Object.values(block.inputs) as unknown[]) {
        if (!Array.isArray(input)) fail('Invalid section input connection');
        for (const offset of [1, 2]) {
          if (typeof input[offset] === 'string') input[offset] = remap(input[offset]);
        }
      }
      const inputs = block.inputs as Record<string, unknown>;
      if (block.opcode === 'kubohiroyakamishibaiauthoring4_includeBlocks') {
        const target = includeLabels[includeIndex++];
        if (target === undefined) fail('Section state does not match the module includes');
        inputs.LABEL = [1, [10, target]];
      }
      if (active.has(id) && block.opcode === 'kubohiroyakamishibaiauthoring4_asset') {
        const name = String(literal(value as Record<string, unknown>, 'NAME'));
        const assets = source.assets as Record<string, unknown> | undefined;
        if (assets && Object.hasOwn(assets, name))
          inputs.VALUE = [1, [10, JSON.stringify(assets[name])]];
      }
      if (id === state.hatId) inputs.LABEL = [1, [10, label]];
      return [ids.get(id), block];
    }),
  );
}
