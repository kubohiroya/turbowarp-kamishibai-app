import Ajv2020 from 'ajv/dist/2020.js';
import type {ErrorObject} from 'ajv';
import {dsl4SchemaValidationDetail} from './schema-validation-detail.js';
import type {Dsl4SchemaValidationDetail} from './schema-validation-detail.js';
import {isAlias, isMap, isPair, isScalar, isSeq, LineCounter, parseAllDocuments, visit} from 'yaml';

import {
  dsl4EmptyActionRegistrySnapshot,
  validateDsl4ActionRegistrySnapshot,
} from './action-registry.js';
import {validateDsl4Semantics} from './semantic-validator.js';
import {canonicalizeDsl4Source} from './source-canonicalizer.js';
import {normalizeDsl4DiagnosticSequence} from './diagnostic-sequence-policy.js';
import {createStoryDocument, deepFreeze, sourceRangeForNode} from './story-document.js';
import {encodeDsl4StoryPathSegment} from './story-path.js';
import {
  applyDsl4StoryVariableDefaults,
  Dsl4ImplicitProjectAssetError,
  resolveDsl4ImplicitProjectAssets,
} from './implicit-project-assets.js';
import {
  compileDsl4NarrativeSource,
  Dsl4NarrativeControlError,
  findDsl4NarrativeControlPath,
} from './narrative-control.js';
import type {NarrativeCompilation, NarrativePath} from './narrative-control.js';

export {canonicalizeDsl4Source} from './source-canonicalizer.js';

const forbiddenMappingKeys = new Set(['__proto__', 'constructor', 'prototype']);
const textEncoder = new TextEncoder();

export const dsl4SourceFrontendDefaultLimits = Object.freeze({
  maxCanonicalSourceBytes: 1024 * 1024,
  maxYamlNodes: 20_000,
  maxYamlDepth: 64,
  maxScalarScalars: 16_384,
  maxScenes: 512,
  maxActionsPerScene: 1_024,
  maxTotalActions: 4_096,
  maxAssets: 1_024,
  maxDiagnostics: 100,
  maxRelatedLocations: 8,
});

export interface Dsl4Diagnostic {
  version: 1;
  code: string;
  severity: 'error' | 'warning';
  message: string;
  sourceId: string;
  range: import('./story-document.js').SourceRange;
  storyPath?: string;
  path: string;
  related: readonly unknown[];
  validation?: Dsl4SchemaValidationDetail;
}

export interface ParseSuccess {
  ok: true;
  canonicalSource: string;
  diagnostics: readonly Dsl4Diagnostic[];
  storyDocument: Readonly<Record<string, unknown>>;
  implicitProjectAssets?: readonly string[];
  implicitProjectActors?: readonly string[];
}

export interface ParseFailure {
  ok: false;
  canonicalSource: string;
  diagnostics: readonly Dsl4Diagnostic[];
}

export type ParseResult = ParseSuccess | ParseFailure;

interface YamlNodeView {
  readonly range?: readonly [number, number, ...number[]];
  readonly anchor?: unknown;
  readonly tag?: unknown;
  readonly key?: Readonly<{value?: unknown}>;
  readonly items?: readonly unknown[];
  readonly value?: unknown;
}

interface YamlDocumentView {
  readonly contents?: unknown;
  getIn(path: readonly (string | number)[], keepScalar?: boolean): unknown;
  toJS(options?: Readonly<Record<string, unknown>>): unknown;
}

interface ParsedYamlDocument extends YamlDocumentView {
  readonly errors: readonly Readonly<{message: string; pos?: readonly [number, number]}>[];
  readonly warnings: readonly Readonly<{message: string; pos?: readonly [number, number]}>[];
}

/**
 * The canonical single-source frontend, as its consumers take it.
 *
 * Everything that turns DSL 4.0 source into a story document receives the frontend by injection
 * rather than constructing one, because the frontend needs the JSON schema and the browser and the
 * builder load that differently. `createDsl4SourceFrontend` returns exactly this, and
 * `createDsl4SourceGraphFrontend` takes one -- its own `parse` is a different contract, over a
 * source graph and with composition limits, so it is not a drop-in for this one.
 */
export interface Dsl4SourceFrontend {
  parse(source: string, options?: {sourceId?: string; project?: unknown}): ParseResult;
}

/** Keep project context fixed across a preview session and its reloads. */
export function bindDsl4ProjectSourceFrontend(
  frontend: Dsl4SourceFrontend,
  project: unknown,
): Dsl4SourceFrontend {
  // Preview parsing needs names and owners, not retained blocks, archive payloads or storage.
  const context =
    isRecord(project) && Array.isArray(project.targets)
      ? deepFreeze({
          targets: project.targets.filter(isRecord).map((target) => ({
            name: typeof target.name === 'string' ? target.name : undefined,
            isStage: typeof target.isStage === 'boolean' ? target.isStage : undefined,
            costumes: Array.isArray(target.costumes)
              ? target.costumes.filter(isRecord).map((costume) => ({
                  name: typeof costume.name === 'string' ? costume.name : undefined,
                  bitmapResolution: costume.bitmapResolution === 2 ? 2 : 1,
                }))
              : [],
            sounds: Array.isArray(target.sounds)
              ? target.sounds
                  .filter(isRecord)
                  .map((sound) => ({name: typeof sound.name === 'string' ? sound.name : undefined}))
              : [],
            variables: Object.fromEntries(
              Object.entries(isRecord(target.variables) ? target.variables : {})
                .filter(
                  ([, value]) =>
                    Array.isArray(value) &&
                    value[0] === 'actorName' &&
                    typeof value[1] === 'string',
                )
                .map(([key, value]) => [key, (value as unknown[]).slice(0, 2)]),
            ),
          })),
        })
      : undefined;
  return Object.freeze({
    parse: (source: string, options?: {sourceId?: string; project?: unknown}) =>
      frontend.parse(source, {...options, project: context}),
  });
}

function jsonPointerSegments(pointer: string): (string | number)[] {
  if (!pointer) return [];
  return pointer
    .slice(1)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .map((segment) => (/^(?:0|[1-9][0-9]*)$/.test(segment) ? Number(segment) : segment));
}

function jsonPathSegments(path: string): (string | number)[] {
  const segments: (string | number)[] = [];
  for (const match of path.matchAll(/([^[.\]]+)|\[([0-9]+)\]|\["((?:[^"\\]|\\.)*)"\]/g)) {
    const value = match[1] ?? match[2] ?? JSON.parse(`"${match[3]}"`);
    if (value === '$') continue;
    segments.push(match[2] === undefined ? value : Number(value));
  }
  return segments;
}

function escapedJsonPath(segments: readonly (string | number)[]): string {
  return segments.reduce<string>(
    (path, segment) =>
      typeof segment === 'number'
        ? `${path}[${segment}]`
        : `${path}[${JSON.stringify(segment).replace(/\u007f/gu, '\\u007f')}]`,
    '$',
  );
}

function storyPathFromSourceSegments(segments: (string | number)[]): string | undefined {
  if (segments[0] !== 'scenes' || typeof segments[1] !== 'string') return undefined;
  const sceneId = segments[1];
  const actionOffset = segments[2] === 'actions' ? 3 : 2;
  const actionIndex = segments[actionOffset];
  if (typeof actionIndex !== 'number') {
    return `/scenes/${encodeDsl4StoryPathSegment(sceneId)}`;
  }
  const actionPath = `/scenes/${encodeDsl4StoryPathSegment(sceneId)}/actions/${actionIndex}`;
  const commandOffset = actionOffset + 1;
  const argumentSegments = segments.slice(commandOffset + 1);
  if (argumentSegments.length === 0) return actionPath;
  if (argumentSegments[0] === 'stableId') return `${actionPath}/stableId`;
  const normalizedArguments =
    argumentSegments[0] === 'arguments' ? argumentSegments.slice(1) : argumentSegments;
  return normalizedArguments.length === 0
    ? `${actionPath}/args`
    : `${actionPath}/args/${normalizedArguments
        .map((segment) =>
          typeof segment === 'string' ? encodeDsl4StoryPathSegment(segment) : String(segment),
        )
        .join('/')}`;
}

function nodeAtPath(document: YamlDocumentView, segments: (string | number)[]): unknown {
  for (let length = segments.length; length >= 0; length -= 1) {
    const node = length === 0 ? document.contents : document.getIn(segments.slice(0, length), true);
    if (node) return node;
  }
  return document.contents;
}

function diagnostic({
  code,
  message,
  sourceId,
  path,
  node,
  lineCounter,
  storyPath,
  validation,
}: {
  code: string;
  message: string;
  sourceId: string;
  path: string;
  node: unknown;
  lineCounter: import('yaml').LineCounter;
  storyPath?: string | undefined;
  validation?: Dsl4SchemaValidationDetail;
}): Dsl4Diagnostic {
  return {
    version: 1,
    code,
    severity: 'error',
    message,
    sourceId,
    range: sourceRangeForNode(node, lineCounter),
    ...(storyPath ? {storyPath} : {}),
    path,
    related: [],
    ...(validation ? {validation} : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveFrontendLimits(input: unknown) {
  if (!isRecord(input)) throw new TypeError('source frontend limits must be an object');
  const unknown = Object.keys(input).filter(
    (name) => !Object.hasOwn(dsl4SourceFrontendDefaultLimits, name),
  );
  if (unknown.length > 0) {
    throw new TypeError(`Unknown source frontend limits: ${unknown.sort().join(', ')}`);
  }
  // The entries come from the defaults, so the result carries exactly their names.
  return Object.freeze(
    Object.fromEntries(
      Object.entries(dsl4SourceFrontendDefaultLimits).map(([name, maximum]) => {
        const value = Object.hasOwn(input, name) ? input[name] : maximum;
        const minimum = name === 'maxRelatedLocations' ? 0 : 1;
        if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
          throw new TypeError(`${name} must be a safe integer between ${minimum} and ${maximum}`);
        }
        return [name, Number(value)];
      }),
    ),
  ) as Readonly<typeof dsl4SourceFrontendDefaultLimits>;
}

function finalizeDiagnostics(
  diagnostics: readonly Dsl4Diagnostic[],
  limits: Readonly<typeof dsl4SourceFrontendDefaultLimits>,
) {
  return normalizeDsl4DiagnosticSequence(diagnostics, {
    maxDiagnostics: limits.maxDiagnostics,
    maxRelatedLocations: limits.maxRelatedLocations,
  }).diagnostics;
}

function sortDiagnostics(diagnostics: readonly Dsl4Diagnostic[]): readonly Dsl4Diagnostic[] {
  const compareCodeUnits = (left: string, right: string) =>
    left < right ? -1 : left > right ? 1 : 0;
  return deepFreeze(
    [...diagnostics].sort(
      (left, right) =>
        left.range.start.offset - right.range.start.offset ||
        compareCodeUnits(left.code, right.code) ||
        compareCodeUnits(left.message, right.message),
    ),
  );
}

/** Count YAML collections and scalars without recursively traversing an attacker-controlled tree. */
function inspectYamlResources(
  root: unknown,
  limits: Readonly<typeof dsl4SourceFrontendDefaultLimits>,
) {
  const stack = [{node: root, collectionDepth: 0}];
  let nodeCount = 0;
  let firstNodeOverflow = null;
  let firstDepthOverflow = null;
  let firstScalarOverflow = null;

  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) break;
    const {node, collectionDepth} = next;
    if (!node) continue;
    if (isPair(node)) {
      stack.push({node: node.value, collectionDepth});
      stack.push({node: node.key, collectionDepth});
      continue;
    }

    if (isMap(node) || isSeq(node)) {
      nodeCount += 1;
      if (nodeCount > limits.maxYamlNodes && !firstNodeOverflow) firstNodeOverflow = node;
      const nextDepth = collectionDepth + 1;
      if (nextDepth > limits.maxYamlDepth && !firstDepthOverflow) firstDepthOverflow = node;
      const items = (node as YamlNodeView).items ?? [];
      for (let index = items.length - 1; index >= 0; index -= 1) {
        stack.push({node: items[index], collectionDepth: nextDepth});
      }
      continue;
    }

    if (isScalar(node)) {
      nodeCount += 1;
      if (nodeCount > limits.maxYamlNodes && !firstNodeOverflow) firstNodeOverflow = node;
      const value = (node as YamlNodeView).value;
      if (
        typeof value === 'string' &&
        [...value].length > limits.maxScalarScalars &&
        !firstScalarOverflow
      ) {
        firstScalarOverflow = node;
      }
    }
  }

  return {nodeCount, firstNodeOverflow, firstDepthOverflow, firstScalarOverflow};
}

function validateStoryResourceLimits(
  story: Record<string, unknown>,
  document: YamlDocumentView,
  lineCounter: import('yaml').LineCounter,
  sourceId: string,
  limits: Readonly<typeof dsl4SourceFrontendDefaultLimits>,
) {
  const diagnostics: Dsl4Diagnostic[] = [];
  const assets = isRecord(story.assets) ? story.assets : {};
  if (Object.keys(assets).length > limits.maxAssets) {
    diagnostics.push(
      diagnostic({
        code: 'K4-ASSET-LIMIT-001',
        message: `Story exceeds the ${limits.maxAssets} asset limit`,
        sourceId,
        path: '$.assets',
        node: document.getIn(['assets'], true),
        lineCounter,
      }),
    );
  }

  const scenes = isRecord(story.scenes) ? story.scenes : {};
  if (Object.keys(scenes).length > limits.maxScenes) {
    diagnostics.push(
      diagnostic({
        code: 'K4-SCENE-LIMIT-001',
        message: `Story exceeds the ${limits.maxScenes} scene limit`,
        sourceId,
        path: '$.scenes',
        node: document.getIn(['scenes'], true),
        lineCounter,
      }),
    );
  }

  let totalActions = 0;
  let totalOverflowNode = null;
  for (const [sceneId, scene] of Object.entries(scenes)) {
    const actions = Array.isArray(scene)
      ? scene
      : isRecord(scene) && Array.isArray(scene.actions)
        ? scene.actions
        : [];
    const actionsPath = Array.isArray(scene) ? ['scenes', sceneId] : ['scenes', sceneId, 'actions'];
    if (actions.length > limits.maxActionsPerScene) {
      diagnostics.push(
        diagnostic({
          code: 'K4-ACTION-LIMIT-SCENE-001',
          message: `Scene exceeds the ${limits.maxActionsPerScene} action limit`,
          sourceId,
          path: Array.isArray(scene)
            ? `$.scenes[${JSON.stringify(sceneId)}]`
            : `$.scenes[${JSON.stringify(sceneId)}].actions`,
          node: document.getIn(actionsPath, true),
          lineCounter,
          storyPath: `/scenes/${encodeDsl4StoryPathSegment(sceneId)}`,
        }),
      );
    }
    if (!totalOverflowNode && totalActions + actions.length > limits.maxTotalActions) {
      const overflowIndex = Math.max(0, limits.maxTotalActions - totalActions);
      totalOverflowNode = document.getIn([...actionsPath, overflowIndex], true);
    }
    totalActions += actions.length;
  }
  if (totalActions > limits.maxTotalActions) {
    diagnostics.push(
      diagnostic({
        code: 'K4-ACTION-LIMIT-TOTAL-001',
        message: `Story exceeds the ${limits.maxTotalActions} total action limit`,
        sourceId,
        path: '$.scenes',
        node: totalOverflowNode ?? document.getIn(['scenes'], true),
        lineCounter,
      }),
    );
  }
  return diagnostics;
}

function validateBranchExpressions(
  story: Record<string, unknown>,
  document: YamlDocumentView,
  lineCounter: import('yaml').LineCounter,
  sourceId: string,
  createRuntimeExpressionComposition: (() => unknown) | null,
) {
  const branches = isRecord(story.branches) ? story.branches : {};
  const conditions = Object.entries(branches).flatMap(([branchId, value]) =>
    Array.isArray(value)
      ? value.flatMap((rule, index) =>
          isRecord(rule) && typeof rule.if === 'string'
            ? [{branchId, index, expression: rule.if}]
            : [],
        )
      : [],
  );
  if (conditions.length === 0) return [];
  if (typeof createRuntimeExpressionComposition !== 'function') return [];

  const diagnostics: Dsl4Diagnostic[] = [];
  let composition;
  try {
    composition = createRuntimeExpressionComposition();
    if (
      !isRecord(composition) ||
      typeof composition.validateConditionSyntax !== 'function' ||
      typeof composition.releaseAll !== 'function'
    ) {
      throw new TypeError(
        'Runtime Expression composition must provide validateConditionSyntax and releaseAll',
      );
    }
    for (const {branchId, index, expression} of conditions) {
      const result = composition.validateConditionSyntax(expression);
      if (isRecord(result) && result.ok === true) continue;
      const position =
        isRecord(result) && Number.isSafeInteger(result.position) ? result.position : 0;
      const unknownRuntimeKey =
        isRecord(result) && result.code === 'RUNTIME_EXPRESSION_UNKNOWN_RUNTIME_KEY';
      diagnostics.push(
        diagnostic({
          code: unknownRuntimeKey ? 'K4-EXPRESSION-RUNTIME-UNKNOWN' : 'K4-EXPRESSION-SYNTAX-001',
          message: unknownRuntimeKey
            ? `Condition uses an unknown runtime key at expression offset ${position}`
            : `Condition syntax is invalid at expression offset ${position}`,
          sourceId,
          path: `$.branches[${JSON.stringify(branchId)}][${index}].if`,
          node: document.getIn(['branches', branchId, index, 'if'], true),
          lineCounter,
          storyPath: `/branches/${encodeDsl4StoryPathSegment(branchId)}/${index}/if`,
        }),
      );
    }
  } catch {
    diagnostics.push(
      diagnostic({
        code: 'K4-EXPRESSION-INTERNAL-001',
        message: 'Expression validation failed internally',
        sourceId,
        path: '$.branches',
        node: document.getIn(['branches'], true),
        lineCounter,
      }),
    );
  } finally {
    try {
      if (isRecord(composition) && typeof composition.releaseAll === 'function') {
        composition.releaseAll();
      }
    } catch {
      diagnostics.push(
        diagnostic({
          code: 'K4-EXPRESSION-INTERNAL-001',
          message: 'Expression validation resources could not be released',
          sourceId,
          path: '$.branches',
          node: document.getIn(['branches'], true),
          lineCounter,
        }),
      );
    }
  }
  return diagnostics;
}

function schemaDiagnosticCode(error: ErrorObject): string {
  if (error.instancePath === '/kamishibai' && error.keyword === 'const') {
    return 'K4-VERSION-001';
  }
  if (error.keyword === 'additionalProperties') return 'K4-SCHEMA-UNKNOWN-KEY';
  if (error.schemaPath.endsWith('/keyCode/pattern')) return 'K4-KEY-UNSUPPORTED';
  if (error.keyword === 'propertyNames') return 'K4-ID-INVALID';
  return 'K4-SCHEMA-001';
}

function schemaErrorSegments(error: ErrorObject): (string | number)[] {
  const segments = jsonPointerSegments(error.instancePath);
  const params = error.params as Readonly<Record<string, unknown>>;
  const extraProperty = params.additionalProperty ?? params.propertyName;
  if (typeof extraProperty !== 'string' && typeof extraProperty !== 'number') return segments;
  return extraProperty === undefined ? segments : [...segments, extraProperty];
}

function parseRestrictedYaml(
  source: string,
  sourceId: string,
  limits: Readonly<typeof dsl4SourceFrontendDefaultLimits>,
): {
  document: YamlDocumentView | undefined;
  lineCounter: import('yaml').LineCounter;
  diagnostics: readonly Dsl4Diagnostic[];
} {
  const lineCounter = new LineCounter();
  const documents = parseAllDocuments(source, {
    lineCounter,
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
    version: '1.2',
  });
  const diagnostics: Dsl4Diagnostic[] = [];

  for (const document of documents as readonly ParsedYamlDocument[]) {
    for (const error of [...document.errors, ...document.warnings]) {
      const node = {range: error.pos ?? [0, 0]};
      diagnostics.push(
        diagnostic({
          code: 'K4-YAML-001',
          message: error.message,
          sourceId,
          path: '$',
          node,
          lineCounter,
        }),
      );
    }
  }

  if (documents.length !== 1) {
    const secondDocument = documents[1];
    diagnostics.push(
      diagnostic({
        code: 'K4-YAML-002',
        message: 'Exactly one YAML document is required',
        sourceId,
        path: '$',
        node: secondDocument?.contents ?? documents[0]?.contents,
        lineCounter,
      }),
    );
  }

  for (const document of documents) {
    const documentView = document as unknown as ParsedYamlDocument;
    visit(document, (_key, node) => {
      const yamlNode = node as YamlNodeView;
      if (isAlias(node) || yamlNode?.anchor) {
        diagnostics.push(
          diagnostic({
            code: 'K4-YAML-003',
            message: 'YAML aliases and anchors are not supported',
            sourceId,
            path: '$',
            node,
            lineCounter,
          }),
        );
      }
      if (isPair(node) && yamlNode.key?.value === '<<') {
        diagnostics.push(
          diagnostic({
            code: 'K4-YAML-004',
            message: 'YAML merge keys are not supported',
            sourceId,
            path: '$',
            node,
            lineCounter,
          }),
        );
      }
      if (yamlNode?.tag) {
        diagnostics.push(
          diagnostic({
            code: 'K4-YAML-005',
            message: 'Custom YAML tags are not supported',
            sourceId,
            path: '$',
            node,
            lineCounter,
          }),
        );
      }
      if (isPair(node) && forbiddenMappingKeys.has(String(yamlNode.key?.value))) {
        diagnostics.push(
          diagnostic({
            code: 'K4-YAML-006',
            message: `Mapping key ${String(yamlNode.key?.value)} is not supported`,
            sourceId,
            path: '$',
            node,
            lineCounter,
          }),
        );
      }
    });
    const resources = inspectYamlResources(documentView.contents, limits);
    if (resources.firstNodeOverflow) {
      diagnostics.push(
        diagnostic({
          code: 'K4-YAML-LIMIT-NODES-001',
          message: `YAML exceeds the ${limits.maxYamlNodes} node limit`,
          sourceId,
          path: '$',
          node: resources.firstNodeOverflow,
          lineCounter,
        }),
      );
    }
    if (resources.firstDepthOverflow) {
      diagnostics.push(
        diagnostic({
          code: 'K4-YAML-LIMIT-DEPTH-001',
          message: `YAML exceeds the ${limits.maxYamlDepth} collection depth limit`,
          sourceId,
          path: '$',
          node: resources.firstDepthOverflow,
          lineCounter,
        }),
      );
    }
    if (resources.firstScalarOverflow) {
      diagnostics.push(
        diagnostic({
          code: 'K4-YAML-LIMIT-SCALAR-001',
          message: `YAML scalar exceeds the ${limits.maxScalarScalars} Unicode scalar limit`,
          sourceId,
          path: '$',
          node: resources.firstScalarOverflow,
          lineCounter,
        }),
      );
    }
  }

  return {document: documents[0], lineCounter, diagnostics: sortDiagnostics(diagnostics)};
}

/**
 * Compile a schema once and return the shared pure source frontend.
 *
 */
export function createDsl4SourceFrontend(
  schema: import('ajv').AnySchema,
  {
    actionRegistry = dsl4EmptyActionRegistrySnapshot,
    limits: limitOverrides = {},
    createRuntimeExpressionComposition = null,
    narrativeControlEnabled = false,
    narrativeControlSchema,
  }: {
    actionRegistry?: unknown;
    limits?: Partial<typeof dsl4SourceFrontendDefaultLimits>;
    createRuntimeExpressionComposition?: (() => unknown) | null;
    narrativeControlEnabled?: boolean;
    narrativeControlSchema?: import('ajv').AnySchema;
  } = {},
): Dsl4SourceFrontend {
  const registry = validateDsl4ActionRegistrySnapshot(actionRegistry);
  if (typeof narrativeControlEnabled !== 'boolean')
    throw new TypeError('narrativeControlEnabled must be boolean');
  const limits = resolveFrontendLimits(limitOverrides);
  if (
    createRuntimeExpressionComposition !== null &&
    typeof createRuntimeExpressionComposition !== 'function'
  ) {
    throw new TypeError('createRuntimeExpressionComposition must be a function or null');
  }
  const AjvConstructor = Ajv2020 as unknown as typeof import('ajv/dist/2020.js').default;
  const validateSchema = new AjvConstructor({allErrors: true, strict: true}).compile(schema);
  if (narrativeControlEnabled && !narrativeControlSchema)
    throw new TypeError(
      'narrativeControlSchema must be injected when narrative control is enabled',
    );
  const validateNarrativeSchema = narrativeControlEnabled
    ? new AjvConstructor({allErrors: true, strict: true}).compile(narrativeControlSchema!)
    : null;
  return Object.freeze({
    parse(
      source: string,
      {sourceId = 'main', project}: {sourceId?: string; project?: unknown} = {},
    ): ParseResult {
      const canonicalSource = canonicalizeDsl4Source(source);
      if (textEncoder.encode(canonicalSource).byteLength > limits.maxCanonicalSourceBytes) {
        const lineCounter = new LineCounter();
        lineCounter.addNewLine(0);
        const diagnostics = finalizeDiagnostics(
          [
            diagnostic({
              code: 'K4-SOURCE-LIMIT-BYTES-001',
              message: `Canonical source exceeds the ${limits.maxCanonicalSourceBytes} byte limit`,
              sourceId,
              path: '$',
              node: {range: [0, 0]},
              lineCounter,
            }),
          ],
          limits,
        );
        return deepFreeze({ok: false, canonicalSource, diagnostics});
      }
      const parsed = parseRestrictedYaml(canonicalSource, sourceId, limits);
      if (parsed.diagnostics.length > 0 || !parsed.document) {
        return deepFreeze({
          ok: false,
          canonicalSource,
          diagnostics: finalizeDiagnostics(parsed.diagnostics, limits),
        });
      }
      const originalDocument = parsed.document;
      let yamlDocument = originalDocument;
      const originalStory = applyDsl4StoryVariableDefaults(yamlDocument.toJS({maxAliasCount: 0}));
      let rawStory = originalStory;
      let implicitProjectAssets: string[] = [];
      let implicitProjectActors: string[] = [];
      let narrative: NarrativeCompilation | undefined;
      const conditionPaths = new Map<string, NarrativePath>();
      const narrativePathInSource = findDsl4NarrativeControlPath(originalStory);
      if (
        isRecord(originalStory) &&
        (originalStory.kamishibai === '4.1' || narrativePathInSource !== undefined)
      ) {
        try {
          if (originalStory.kamishibai === '4.1')
            throw new Dsl4NarrativeControlError(
              'K4-NARRATIVE-VERSION-001',
              'Experimental DSL 4.1 is not a release series; change kamishibai to 4.0 and validate with --narrative-control using a matching runner',
              ['kamishibai'],
            );
          if (!narrativeControlEnabled)
            throw new Dsl4NarrativeControlError(
              'K4-NARRATIVE-FLAG-001',
              'DSL 4.0 narrative control requires dsl4NarrativeControl and a matching runner',
              narrativePathInSource!,
            );
          if (!validateNarrativeSchema!(originalStory)) {
            const issue = validateNarrativeSchema!.errors?.[0];
            const segments = issue ? schemaErrorSegments(issue) : [];
            return deepFreeze({
              ok: false,
              canonicalSource,
              diagnostics: [
                diagnostic({
                  code: 'K4-NARRATIVE-SOURCE-001',
                  message: issue?.message ?? 'Invalid narrative structure',
                  sourceId,
                  path: escapedJsonPath(segments),
                  node: nodeAtPath(originalDocument, segments),
                  lineCounter: parsed.lineCounter,
                  ...(issue
                    ? {
                        validation: dsl4SchemaValidationDetail(
                          issue,
                          validateNarrativeSchema!.errors ?? [],
                        ),
                      }
                    : {}),
                }),
              ],
            });
          }
          narrative = compileDsl4NarrativeSource(originalStory, limits);
          const scenes = Object.fromEntries(
            Object.entries(narrative.story.scenes as Record<string, unknown>).map(([id, scene]) => {
              const actions = narrative!.validation[id]!.map(({action}) => action);
              return [
                id,
                Array.isArray(scene) ? actions : {...(scene as Record<string, unknown>), actions},
              ];
            }),
          );
          const branches = {...(narrative.story.branches as Record<string, unknown>)};
          for (const entries of Object.values(narrative.validation))
            for (const {origin} of entries) {
              if (typeof origin.decision?.condition !== 'string') continue;
              let name = `__${origin.decision.id.replaceAll('-', '_')}`;
              while (Object.hasOwn(branches, name)) name += '_';
              branches[name] = [
                {if: origin.decision.condition, goto: Object.keys(scenes)[0]},
                {else: Object.keys(scenes)[0]},
              ];
              conditionPaths.set(name, [...origin.path, 'if', 'condition']);
            }
          rawStory = {...narrative.story, scenes, branches};
          const compilation = narrative;
          yamlDocument = {
            ...originalDocument,
            getIn(path, keepScalar) {
              let mapped = [...path];
              if (path[0] === 'scenes' && typeof path[1] === 'string') {
                const offset = path[2] === 'actions' ? 3 : 2;
                const index = path[offset];
                if (typeof index === 'number') {
                  const origin = compilation.validation[path[1]]?.[index]?.origin;
                  if (origin) mapped = [...origin.path, ...path.slice(offset + 1)];
                }
              } else if (
                path[0] === 'branches' &&
                typeof path[1] === 'string' &&
                conditionPaths.has(path[1])
              )
                mapped = conditionPaths.get(path[1])!;
              return originalDocument.getIn(mapped, keepScalar);
            },
          };
        } catch (error) {
          if (!(error instanceof Dsl4NarrativeControlError)) throw error;
          return deepFreeze({
            ok: false,
            canonicalSource,
            diagnostics: [
              diagnostic({
                code: error.code,
                message: error.message,
                sourceId,
                path: escapedJsonPath(error.path),
                node: nodeAtPath(originalDocument, error.path),
                lineCounter: parsed.lineCounter,
              }),
            ],
          });
        }
      }
      const narrativePath = (path: (string | number)[]) => {
        if (!narrative) return path;
        if (path[0] === 'branches' && typeof path[1] === 'string' && conditionPaths.has(path[1]))
          return conditionPaths.get(path[1])!;
        if (path[0] === 'scenes' && typeof path[1] === 'string') {
          const offset = path[2] === 'actions' ? 3 : 2;
          const index = path[offset];
          const origin =
            typeof index === 'number' ? narrative.validation[path[1]]?.[index]?.origin : undefined;
          if (origin) return [...origin.path, ...path.slice(offset + 1)];
        }
        return path;
      };
      if (project !== undefined && isRecord(rawStory)) {
        try {
          const resolved = resolveDsl4ImplicitProjectAssets(rawStory, project, schema);
          rawStory = resolved.story;
          let execution = resolved;
          if (narrative) {
            execution = resolveDsl4ImplicitProjectAssets(narrative.story, project, schema);
            narrative = {...narrative, story: execution.story};
          }
          implicitProjectAssets = execution.inferred;
          implicitProjectActors = execution.actors;
        } catch (error) {
          if (!(error instanceof Dsl4ImplicitProjectAssetError)) throw error;
          return deepFreeze({
            ok: false,
            canonicalSource,
            diagnostics: [
              diagnostic({
                code: error.code,
                message: error.message,
                sourceId,
                path: escapedJsonPath(narrativePath(error.path)),
                node: nodeAtPath(yamlDocument, error.path),
                lineCounter: parsed.lineCounter,
              }),
            ],
          });
        }
      }
      if (!validateSchema(rawStory)) {
        const diagnostics = (validateSchema.errors ?? []).map((error) => {
          const segments = schemaErrorSegments(error);
          const rawPath =
            typeof error.instancePath === 'string' && error.instancePath ? error.instancePath : '$';
          return diagnostic({
            code: schemaDiagnosticCode(error),
            validation: dsl4SchemaValidationDetail(error, validateSchema.errors ?? []),
            message: error.message ?? 'Schema validation failed',
            sourceId,
            path: narrative
              ? escapedJsonPath(narrativePath(segments))
              : /[\u0000-\u001f\u007f]/u.test(rawPath)
                ? escapedJsonPath(segments)
                : rawPath,
            node: nodeAtPath(yamlDocument, segments),
            lineCounter: parsed.lineCounter,
            storyPath: storyPathFromSourceSegments(segments),
          });
        });
        return deepFreeze({
          ok: false,
          canonicalSource,
          diagnostics: finalizeDiagnostics(diagnostics, limits),
        });
      }

      const story = rawStory as Record<string, unknown>;
      const semanticDiagnostics = validateDsl4Semantics(story, {actionRegistry: registry}).map(
        (issue) => {
          const segments = jsonPathSegments(issue.path);
          return diagnostic({
            code: issue.code,
            message: issue.message,
            sourceId,
            path: narrative ? escapedJsonPath(narrativePath(segments)) : issue.path,
            node: nodeAtPath(yamlDocument, segments),
            lineCounter: parsed.lineCounter,
            storyPath: storyPathFromSourceSegments(segments),
          });
        },
      );
      const resourceDiagnostics = validateStoryResourceLimits(
        story,
        yamlDocument,
        parsed.lineCounter,
        sourceId,
        limits,
      );
      const expressionDiagnostics = validateBranchExpressions(
        story,
        yamlDocument,
        parsed.lineCounter,
        sourceId,
        createRuntimeExpressionComposition,
      );
      const finalDiagnostics = finalizeDiagnostics(
        [...semanticDiagnostics, ...resourceDiagnostics, ...expressionDiagnostics].map((issue) =>
          narrative && issue.path.startsWith('$.branches[')
            ? {...issue, path: escapedJsonPath(narrativePath(jsonPathSegments(issue.path)))}
            : issue,
        ),
        limits,
      );
      if (finalDiagnostics.length > 0) {
        return deepFreeze({
          ok: false,
          canonicalSource,
          diagnostics: finalDiagnostics,
        });
      }

      let storyDocument: Readonly<Record<string, unknown>> = createStoryDocument(
        story,
        yamlDocument,
        parsed.lineCounter,
        sourceId,
      );
      if (narrative) {
        const compilation = narrative;
        const executionDocument = {
          ...originalDocument,
          getIn(path: readonly (string | number)[], keepScalar?: boolean) {
            if (path[0] === 'scenes' && typeof path[1] === 'string') {
              const offset = path[2] === 'actions' ? 3 : 2;
              const index = path[offset];
              const origin =
                typeof index === 'number' ? compilation.origins[path[1]]?.[index] : undefined;
              if (origin)
                return originalDocument.getIn(
                  [...origin.path, ...path.slice(offset + 1)],
                  keepScalar,
                );
            }
            return originalDocument.getIn(path, keepScalar);
          },
        };
        const compiled = structuredClone(
          createStoryDocument(compilation.story, executionDocument, parsed.lineCounter, sourceId),
        ) as Record<string, unknown>;
        compiled.metadata = {
          ...(compiled.metadata as Record<string, unknown>),
          sourceVersion: '4.0',
          narrativeControl: true,
          ...(compilation.hasInvalidation ? {invalidateSource: true} : {}),
          ...(compilation.invalidatedRecognitionScenes.length
            ? {invalidatedRecognitionScenes: compilation.invalidatedRecognitionScenes}
            : {}),
        };
        for (const scene of compiled.scenes as Record<string, unknown>[]) {
          for (const [index, action] of (scene.actions as Record<string, unknown>[]).entries())
            action.narrative = compilation.origins[String(scene.id)]![index];
        }
        storyDocument = deepFreeze(compiled);
      }
      if (implicitProjectActors.length || implicitProjectAssets.length)
        storyDocument = deepFreeze({
          ...storyDocument,
          metadata: {
            ...(storyDocument.metadata as Record<string, unknown>),
            ...(implicitProjectActors.length ? {implicitProjectActors} : {}),
            ...(implicitProjectAssets.length ? {implicitProjectAssets} : {}),
          },
        });
      return deepFreeze({
        ok: true,
        canonicalSource,
        diagnostics: [],
        storyDocument,
        ...(implicitProjectAssets.length ? {implicitProjectAssets} : {}),
        ...(implicitProjectActors.length ? {implicitProjectActors} : {}),
      });
    },
  });
}
