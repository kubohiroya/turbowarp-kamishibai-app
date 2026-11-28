import {isDsl4ConfigBlockSourceHat, isDsl4LabeledBlockSourceHat} from './block-source-shared.js';
import {deepFreeze} from './story-document.js';
import {Dsl4BlockSourceError} from './block-source-shared.js';
import {readDsl4StructuredBlockSource} from './structured-block-source-codec.js';
export {
  dsl4BlockSourceRuntimeExtensionId,
  dsl4BlockSourceBundleExtensionId,
  Dsl4BlockSourceError,
} from './block-source-shared.js';

const sourceSuffix = '.k4.yml';
const scalarInputTypes = new Set([4, 5, 6, 7, 8]);

export const dsl4BlockSourceDefaultLimits = Object.freeze({
  maxTargets: 256,
  maxDeclarations: 256,
  maxBlocksPerTarget: 8192,
  maxScalarCodeUnits: 65536,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(code: string, message: string, details?: object): never {
  throw new Dsl4BlockSourceError(code, message, details);
}

function resolveLimits(input: unknown): Readonly<typeof dsl4BlockSourceDefaultLimits> {
  if (input === undefined) return dsl4BlockSourceDefaultLimits;
  if (!isRecord(input)) fail('K4-BLOCK-SOURCE-LIMIT-001', 'Block source limits must be an object');
  const unknown = Object.keys(input).filter(
    (key) => !Object.hasOwn(dsl4BlockSourceDefaultLimits, key),
  );
  if (unknown.length > 0) {
    fail('K4-BLOCK-SOURCE-LIMIT-001', `Unknown block source limits: ${unknown.sort().join(', ')}`);
  }
  const limits = {...dsl4BlockSourceDefaultLimits, ...input};
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      fail('K4-BLOCK-SOURCE-LIMIT-001', `${name} must be a positive safe integer`);
    }
  }
  return Object.freeze(limits);
}

function targetBlocks(target: unknown) {
  if (!isRecord(target) || typeof target.name !== 'string' || typeof target.isStage !== 'boolean') {
    fail('K4-BLOCK-SOURCE-PROJECT-001', 'SB3 target metadata is invalid');
  }
  if (!isRecord(target.blocks)) {
    fail('K4-BLOCK-SOURCE-PROJECT-001', 'SB3 target blocks are invalid', {
      targetName: target.name,
    });
  }
  return target.blocks as Record<string, unknown>;
}

function boundedScalar(value: unknown, limits: Readonly<typeof dsl4BlockSourceDefaultLimits>) {
  const text = String(value);
  if (text.length > limits.maxScalarCodeUnits) {
    fail('K4-BLOCK-SOURCE-LIMIT-001', 'YAML/JSON scalar exceeds the code unit limit');
  }
  return text;
}

function sourcePathForTargetName(name: string) {
  if (
    name.length === 0 ||
    name === '.' ||
    name === '..' ||
    name.includes('\0') ||
    name.includes('/') ||
    name.includes('\\')
  ) {
    fail('K4-BLOCK-SOURCE-PATH-001', 'Target name cannot be used as a DSL source filename', {
      targetName: name,
    });
  }
  return name.endsWith(sourceSuffix) ? name : `${name}${sourceSuffix}`;
}

/** Read static Scratch literals and their editor-created shadows; never evaluate code. */
function inputValue(blocks: Record<string, unknown>, input: unknown): unknown {
  if (!Array.isArray(input)) return '';
  const candidate = input[1];
  if (Array.isArray(candidate)) return candidate[1];
  if (typeof candidate === 'string') {
    const block = blocks[candidate];
    if (
      isRecord(block) &&
      block.shadow === true &&
      block.next === null &&
      block.topLevel === false &&
      isRecord(block.fields) &&
      isRecord(block.inputs) &&
      Object.keys(block.inputs).length === 0
    ) {
      const field =
        block.opcode === 'text'
          ? block.fields.TEXT
          : typeof block.opcode === 'string' &&
              /^math_(?:number|integer|whole_number|positive_number|angle)$/u.test(block.opcode)
            ? block.fields.NUM
            : undefined;
      if (Array.isArray(field)) return field[0];
    }
  }
  fail('K4-BLOCK-SOURCE-GRAPH-001', 'Source inputs require static text or number shadows');
}

/** The target name that carries one source path, inverting `sourcePathForTargetName`. */
export function targetNameForSourcePath(sourcePath: string) {
  if (!sourcePath.endsWith(sourceSuffix)) {
    fail('K4-BLOCK-SOURCE-PATH-001', `DSL source filename must end with ${sourceSuffix}`);
  }
  const name = sourcePath.slice(0, -sourceSuffix.length);
  if (name.length === 0) {
    fail('K4-BLOCK-SOURCE-PATH-001', 'DSL source filename must name a target');
  }
  // Round-trip through the reader's own rule so a name it would reject never reaches a project.
  if (sourcePathForTargetName(name) !== sourcePath) {
    fail('K4-BLOCK-SOURCE-PATH-001', 'DSL source filename does not match its target name', {
      targetName: name,
    });
  }
  return name;
}

export function extractDsl4BlockSourcesFromProject(
  project: unknown,
  {limits: inputLimits}: {limits?: unknown} = {},
) {
  if (!isRecord(project) || !Array.isArray(project.targets)) {
    fail('K4-BLOCK-SOURCE-PROJECT-001', 'SB3 project must contain targets');
  }
  const limits = resolveLimits(inputLimits);
  if (project.targets.length > limits.maxTargets) {
    fail('K4-BLOCK-SOURCE-LIMIT-001', 'SB3 target count exceeds the block source limit');
  }

  const declarations: {
    targetName: string;
    isStage: boolean;
    blocks: Record<string, unknown>;
    hatId: string;
    hat: Record<string, unknown>;
    label: string;
    sourcePath: string;
  }[] = [];
  const configHats: {
    blocks: Record<string, unknown>;
    hatId: string;
    label: string;
    targetName: string;
  }[] = [];
  function staticText(
    blocks: Record<string, unknown>,
    input: unknown,
    parent: string,
    targetName: string,
    optional = false,
  ): string {
    if (input === undefined && optional) return '';
    if (Array.isArray(input) && [1, 2, 3].includes(input[0])) {
      let literal = input[1];
      if (typeof literal === 'string') {
        const shadow = blocks[literal];
        if (
          isRecord(shadow) &&
          shadow.opcode === 'text' &&
          shadow.shadow === true &&
          shadow.parent === parent &&
          shadow.topLevel === false &&
          shadow.next === null &&
          isRecord(shadow.fields) &&
          isRecord(shadow.inputs) &&
          !Object.keys(shadow.inputs).length
        ) {
          const field = shadow.fields.TEXT;
          if (Array.isArray(field)) literal = [10, field[0]];
        }
      }
      if (Array.isArray(literal) && literal[0] === 10 && typeof literal[1] === 'string') {
        boundedScalar(literal[1], limits);
        return literal[1];
      }
    }
    fail('K4-BLOCK-SOURCE-LABEL-001', 'Declaration version and labels require static text', {
      targetName,
      blockId: parent,
    });
  }
  for (const target of project.targets) {
    const blocks = targetBlocks(target);
    const blockIds = Object.keys(blocks);
    for (const blockId of blockIds) {
      const block = blocks[blockId];
      if (
        isRecord(block) &&
        typeof block.opcode === 'string' &&
        block.opcode.endsWith('whenDsl4Source')
      ) {
        fail(
          'K4-BLOCK-SOURCE-REMOVED-001',
          'when kamishibai DSL source has been removed; regenerate a labeled kamishibai hat',
          {
            targetName: (target as Record<string, unknown>).name,
            blockId,
          },
        );
      }
    }
    if (blockIds.length > limits.maxBlocksPerTarget) {
      fail('K4-BLOCK-SOURCE-LIMIT-001', 'SB3 target block count exceeds the block source limit', {
        targetName: (target as Record<string, unknown>).name,
      });
    }
    const configs = blockIds
      .filter((id) => {
        const block = blocks[id];
        return isRecord(block) && isDsl4ConfigBlockSourceHat(block.opcode);
      })
      .sort();
    for (const blockId of configs) {
      const block = blocks[blockId] as Record<string, unknown>;
      if (
        block.topLevel !== true ||
        block.parent !== null ||
        block.shadow !== false ||
        !isRecord(block.inputs) ||
        Object.keys(block.inputs).some((key) => key !== 'LABEL') ||
        (typeof block.next !== 'string' && block.next !== null)
      )
        fail('K4-BLOCK-SOURCE-GRAPH-001', 'Configuration hat has invalid connections or inputs', {
          targetName: (target as Record<string, unknown>).name,
          blockId,
        });
      const targetName = (target as Record<string, unknown>).name as string;
      const label = staticText(
        blocks,
        (block.inputs as Record<string, unknown>).LABEL,
        blockId,
        targetName,
        true,
      );
      if (configHats.some((item) => item.label === label)) {
        fail(
          'K4-BLOCK-SOURCE-DUPLICATE-001',
          `Configuration label is duplicated: ${JSON.stringify(label)}`,
          {
            targetName,
            blockId,
          },
        );
      }
      configHats.push({blocks, hatId: blockId, label, targetName});
    }
    if (declarations.length + configHats.length > limits.maxDeclarations) {
      fail('K4-BLOCK-SOURCE-LIMIT-001', 'Project exceeds the source declaration limit');
    }
    const hats = blockIds
      .filter((blockId) => {
        const block = blocks[blockId];
        return (
          isRecord(block) &&
          typeof block.opcode === 'string' &&
          isDsl4LabeledBlockSourceHat(block.opcode) &&
          block.topLevel === true &&
          block.parent === null
        );
      })
      .sort();
    if (hats.length === 0) continue;
    const targetName = (target as Record<string, unknown>).name as string;
    for (const hatId of hats) {
      const hat = blocks[hatId] as Record<string, unknown>;
      if (
        hat.shadow !== false ||
        !isRecord(hat.inputs) ||
        (typeof hat.next !== 'string' && hat.next !== null)
      ) {
        fail('K4-BLOCK-SOURCE-GRAPH-001', 'DSL source hat has invalid connections', {
          targetName,
          blockId: hatId,
        });
      }
      if (Object.keys(hat.inputs).some((key) => !['VERSION', 'LABEL'].includes(key))) {
        fail('K4-BLOCK-SOURCE-GRAPH-001', 'Unexpected input in source hat', {
          targetName,
          blockId: hatId,
        });
      }
      if (staticText(blocks, hat.inputs.VERSION, hatId, targetName) !== '4.0') {
        fail(
          'K4-BLOCK-SOURCE-VERSION-001',
          'Source declaration version must be 4.0; replace experimental 4.1 and validate with --narrative-control',
          {
            targetName,
            blockId: hatId,
          },
        );
      }
      const label = staticText(blocks, hat.inputs.LABEL, hatId, targetName, true);
      if (!label && declarations.some((item) => item.blocks === blocks && !item.label)) {
        fail(
          'K4-BLOCK-SOURCE-DUPLICATE-001',
          'Target contains more than one unlabeled DSL source hat',
          {targetName, blockId: hatId},
        );
      }
      declarations.push({
        targetName,
        isStage: (target as Record<string, unknown>).isStage === true,
        blocks,
        hatId,
        hat,
        label,
        sourcePath: '',
      });
      if (declarations.length + configHats.length > limits.maxDeclarations) {
        fail('K4-BLOCK-SOURCE-LIMIT-001', 'Project exceeds the source declaration limit', {
          targetName,
          blockId: hatId,
        });
      }
    }
  }
  configHats.sort((left, right) =>
    left.label < right.label ? -1 : left.label > right.label ? 1 : 0,
  );
  const stages = declarations.filter((item) => item.isStage);
  const roots = stages.filter((item) => !item.label);
  const entry = roots.length === 1 ? roots[0] : undefined;
  if (!entry) {
    fail(
      'K4-BLOCK-SOURCE-MISSING-001',
      'Stage must contain one unambiguous root DSL source hat with an empty label',
    );
  }
  // Copy connected configuration graphs from other targets into an isolated root read view.
  // Remap their IDs and diagnostics because Scratch block IDs are only unique per target.
  const rootBlocks = {...entry.blocks};
  const configLocations = new Map<string, {targetName: string; blockId: string}>();
  const rootConfigIds: string[] = [];
  for (const [index, config] of configHats.entries()) {
    if (config.blocks === entry.blocks) {
      rootConfigIds.push(config.hatId);
      continue;
    }
    let prefix = `implicitConfig${index}_`;
    while (Object.keys(rootBlocks).some((id) => id.startsWith(prefix))) prefix += '_';
    const pending = [config.hatId];
    const copied = new Set<string>();
    while (pending.length) {
      const id = pending.pop()!;
      if (copied.has(id)) continue;
      copied.add(id);
      const value = config.blocks[id];
      const mapped = prefix + id;
      configLocations.set(mapped, {targetName: config.targetName, blockId: id});
      if (!isRecord(value)) continue;
      const block = structuredClone(value);
      if (typeof block.parent === 'string') block.parent = prefix + block.parent;
      if (typeof block.next === 'string') {
        pending.push(block.next);
        block.next = prefix + block.next;
      }
      if (isRecord(block.inputs)) {
        for (const connection of Object.values(block.inputs)) {
          if (!Array.isArray(connection)) continue;
          for (const offset of [1, 2]) {
            if (typeof connection[offset] === 'string') {
              pending.push(connection[offset]);
              connection[offset] = prefix + connection[offset];
            }
          }
        }
      }
      rootBlocks[mapped] = block;
    }
    rootConfigIds.push(prefix + config.hatId);
  }
  const labels = new Map<string, (typeof declarations)[number]>();
  for (const item of declarations) {
    if (!item.label) continue;
    if (labels.has(item.label)) {
      fail(
        'K4-BLOCK-SOURCE-DUPLICATE-001',
        `Source label is duplicated: ${JSON.stringify(item.label)}`,
        {
          targetName: item.targetName,
          blockId: item.hatId,
        },
      );
    }
    labels.set(item.label, item);
  }
  const numbered = [...labels.keys()].sort();
  const sources: Map<string, string> = new Map();
  for (const item of declarations) {
    item.sourcePath =
      item === entry || !item.label
        ? sourcePathForTargetName(item.targetName)
        : `blocks-${String(numbered.indexOf(item.label) + 1).padStart(4, '0')}${sourceSuffix}`;
    if (
      declarations.some(
        (other) =>
          other !== item &&
          other.sourcePath &&
          other.sourcePath.normalize('NFC').toLowerCase() ===
            item.sourcePath.normalize('NFC').toLowerCase(),
      )
    ) {
      fail('K4-BLOCK-SOURCE-DUPLICATE-001', 'DSL source filename is duplicated', {
        targetName: item.targetName,
        blockId: item.hatId,
      });
    }
  }
  const blockLocations: {
    sourcePath: string;
    path: readonly (string | number)[];
    targetName: string;
    blockId: string;
  }[] = [];
  const edges = new Map<string, {path: string; blockId: string}[]>();
  for (const item of declarations) {
    const {hatId, sourcePath, targetName} = item;
    const blocks = item === entry ? rootBlocks : item.blocks;
    if (sources.has(sourcePath)) {
      fail('K4-BLOCK-SOURCE-DUPLICATE-001', 'DSL source filename is duplicated', {
        targetName,
      });
    }
    let sourceText: string;
    try {
      sourceText = readDsl4StructuredBlockSource(
        blocks,
        hatId,
        (input) => {
          if (!Array.isArray(input) || input.length < 2 || ![1, 2, 3].includes(input[0])) {
            fail('K4-BLOCK-SOURCE-GRAPH-001', 'Structured source input is missing');
          }
          const literal = input[1];
          if (
            Array.isArray(literal) &&
            !scalarInputTypes.has(literal[0]) &&
            ![10, 11].includes(literal[0])
          ) {
            fail(
              'K4-BLOCK-SOURCE-GRAPH-001',
              'Structured source requires a literal, not a dynamic variable or list',
            );
          }
          if (typeof literal === 'string' && !isRecord(blocks[literal])) {
            fail('K4-BLOCK-SOURCE-GRAPH-001', 'Structured source reporter is missing', {
              blockId: literal,
            });
          }
          // Preserve blank optional number fields instead of coercing them to zero.
          const value = Array.isArray(literal) ? literal[1] : inputValue(blocks, input);
          if (
            typeof value !== 'string' &&
            typeof value !== 'number' &&
            typeof value !== 'boolean'
          ) {
            fail('K4-BLOCK-SOURCE-GRAPH-001', 'Structured source input must be a scalar');
          }
          boundedScalar(value, limits);
          return value;
        },
        {
          onSourceLocation(path, blockId) {
            // Implicit configuration is read in the root's synthetic ID space; UI locations are not.
            const original = item === entry ? configLocations.get(blockId) : undefined;
            blockLocations.push({
              sourcePath,
              path,
              targetName: original?.targetName ?? targetName,
              blockId: original?.blockId ?? blockId,
            });
          },
          entry: item === entry,
          configHatIds: item === entry ? rootConfigIds : [],
          resolveInclude(blockId) {
            const include = blocks[blockId] as Record<string, unknown>;
            const label = staticText(
              blocks,
              (include.inputs as Record<string, unknown>).LABEL,
              blockId,
              targetName,
            );
            const resolved = labels.get(label);
            if (!label || !resolved) {
              fail(
                'K4-BLOCK-SOURCE-LABEL-001',
                `includeBlocks label is empty or missing: ${JSON.stringify(label)}`,
                {targetName, blockId},
              );
            }
            const outgoing = edges.get(sourcePath) ?? [];
            outgoing.push({path: resolved.sourcePath, blockId});
            edges.set(sourcePath, outgoing);
            return resolved.sourcePath;
          },
        },
      );
    } catch (error) {
      if (error instanceof Dsl4BlockSourceError) {
        const location =
          item === entry && error.blockId ? configLocations.get(error.blockId) : undefined;
        throw new Dsl4BlockSourceError(error.code, error.message, {
          targetName: location?.targetName ?? targetName,
          blockId: location?.blockId ?? error.blockId ?? hatId,
          cause: error,
        });
      }
      throw error;
    }
    sources.set(sourcePath, sourceText);
  }
  // Check every label, including unused modules, so a detached module cannot hide a cycle.
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(path: string) {
    if (visited.has(path)) return;
    visiting.add(path);
    for (const edge of edges.get(path) ?? []) {
      if (visiting.has(edge.path)) {
        const item = declarations.find((candidate) => candidate.sourcePath === path)!;
        fail('K4-BLOCK-SOURCE-CYCLE-001', 'includeBlocks contains a self reference or cycle', {
          targetName: item.targetName,
          blockId: edge.blockId,
        });
      }
      visit(edge.path);
    }
    visiting.delete(path);
    visited.add(path);
  }
  for (const item of declarations) visit(item.sourcePath);
  return deepFreeze({
    formatVersion: 1,
    entryPath: entry.sourcePath,
    sources: Object.fromEntries([...sources].sort(([left], [right]) => (left < right ? -1 : 1))),
    blockLocations,
    sourceLocations: Object.fromEntries(
      declarations.map((item) => [
        item.sourcePath,
        {
          targetName: item.targetName,
          blockId: item.hatId,
        },
      ]),
    ),
  });
}
