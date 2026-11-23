import {dsl4ActorCoreActionNames} from './action-registry.js';
import {normalizeDsl4ContentRuns} from './content-run.js';
import {encodeDsl4StoryPathSegment} from './story-path.js';
import {normalizeDsl4AudioTransition, normalizeDsl4VisualTransition} from './transition-spec.js';
import {resolveDsl4Viewport} from './viewport.js';

const actorCoreActionNames = new Set(dsl4ActorCoreActionNames);

export interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

interface YamlNodeView {
  readonly range?: readonly [number?, number?, unknown?];
  get?(key: string | number, keepScalar?: boolean): unknown;
}

interface YamlDocumentView {
  readonly contents?: unknown;
  getIn(path: readonly (string | number)[], keepScalar?: boolean): unknown;
}

function asYamlNode(value: unknown): YamlNodeView | undefined {
  return typeof value === 'object' && value !== null ? (value as YamlNodeView) : undefined;
}

function asYamlDocument(value: unknown): YamlDocumentView {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as {getIn?: unknown}).getIn !== 'function'
  ) {
    throw new TypeError('YAML document view must provide getIn');
  }
  return value as YamlDocumentView;
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      cloneValue(child),
    ]),
  );
}

function mapNestedSource(
  sourceMap: Record<string, SourceRange>,
  value: unknown,
  document: YamlDocumentView,
  lineCounter: import('yaml').LineCounter,
  yamlPath: Array<string | number>,
  storyPath: string,
  node?: YamlNodeView,
) {
  if (typeof value !== 'object' || value === null) return;
  const entries = Array.isArray(value)
    ? value.map((child, index) => [index, child])
    : Object.entries(value as Record<string, unknown>);
  for (const [key, child] of entries) {
    const segment = encodeDsl4StoryPathSegment(String(key));
    const childStoryPath = `${storyPath}/${segment}`;
    const childYamlPath = [...yamlPath, key];
    const childNode = asYamlNode(document.getIn(childYamlPath, true)) ?? node;
    sourceMap[childStoryPath] = sourceRangeForNode(childNode, lineCounter);
    mapNestedSource(
      sourceMap,
      child,
      document,
      lineCounter,
      childYamlPath,
      childStoryPath,
      childNode,
    );
  }
}

function mapNestedNode(
  sourceMap: Record<string, SourceRange>,
  value: unknown,
  node: YamlNodeView | undefined,
  lineCounter: import('yaml').LineCounter,
  storyPath: string,
) {
  if (typeof value !== 'object' || value === null) return;
  const entries = Array.isArray(value)
    ? value.map((child, index) => [index, child])
    : Object.entries(value as Record<string, unknown>);
  for (const [key, child] of entries) {
    const segment = encodeDsl4StoryPathSegment(String(key));
    const childPath = `${storyPath}/${segment}`;
    const childNode = asYamlNode(node?.get?.(key, true)) ?? node;
    sourceMap[childPath] = sourceRangeForNode(childNode, lineCounter);
    mapNestedNode(sourceMap, child, childNode, lineCounter, childPath);
  }
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function sourceRangeForNode(
  node: unknown,
  lineCounter: import('yaml').LineCounter,
): SourceRange {
  const yamlNode = asYamlNode(node);
  const startOffset = yamlNode?.range?.[0] ?? 0;
  const endOffset = yamlNode?.range?.[1] ?? startOffset;
  const start = lineCounter.linePos(startOffset);
  const end = lineCounter.linePos(endOffset);
  return {
    start: {line: start.line, column: start.col, offset: startOffset},
    end: {line: end.line, column: end.col, offset: endOffset},
  };
}

const zeroSourceRange = deepFreeze({
  start: {line: 1, column: 1, offset: 0},
  end: {line: 1, column: 1, offset: 0},
});

/**
 * Resolve the closest available source origin for a StoryDocument path.
 *
 * Included-source documents carry sourceOrigins. Legacy single-source documents fall back to
 * metadata.sourceId and sourceMap, preserving the existing diagnostic contract.
 */
export function sourceOriginForStoryPath(
  storyDocument: Readonly<Record<string, unknown>>,
  storyPath: string = '/',
) {
  const metadata = (storyDocument.metadata ?? {}) as Record<string, unknown>;
  const sourceMap = (storyDocument.sourceMap ?? {}) as Record<string, unknown>;
  const sourceOrigins = (storyDocument.sourceOrigins ?? {}) as Record<string, unknown>;
  let candidatePath = storyPath.startsWith('/') ? storyPath : '/';
  while (true) {
    const origin = sourceOrigins[candidatePath];
    if (typeof origin === 'object' && origin !== null && !Array.isArray(origin)) {
      const record = origin as Record<string, unknown>;
      if (typeof record.sourceId === 'string' && record.range !== undefined) {
        return deepFreeze({sourceId: record.sourceId, range: record.range});
      }
    }
    if (candidatePath === '/') break;
    const separator = candidatePath.lastIndexOf('/');
    candidatePath = separator > 0 ? candidatePath.slice(0, separator) : '/';
  }
  candidatePath = storyPath.startsWith('/') ? storyPath : '/';
  while (sourceMap[candidatePath] === undefined && candidatePath !== '/') {
    const separator = candidatePath.lastIndexOf('/');
    candidatePath = separator > 0 ? candidatePath.slice(0, separator) : '/';
  }
  return deepFreeze({
    sourceId: typeof metadata.sourceId === 'string' ? metadata.sourceId : 'main',
    range: sourceMap[candidatePath] ?? sourceMap['/'] ?? zeroSourceRange,
  });
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeAsset(asset: unknown, id: string): Record<string, unknown> {
  if (typeof asset === 'string') {
    const [kind, target] = asset.split(':');
    return {
      id,
      kind,
      name: id,
      ...(kind === 'backdrop' || kind === 'costume' ? {bitmapResolution: 1} : {}),
      delivery: 'embedded',
      loading: 'eager',
      retention: kind === 'recognitionModel' ? 'scene' : 'story',
      ...(target ? {target} : {}),
    };
  }
  const sourceAsset = cloneValue(asset) as Record<string, unknown>;
  return {
    id,
    delivery: 'embedded',
    loading: 'eager',
    retention: sourceAsset.kind === 'recognitionModel' ? 'scene' : 'story',
    ...(sourceAsset.kind === 'backdrop' || sourceAsset.kind === 'costume'
      ? {bitmapResolution: sourceAsset.bitmapResolution ?? 1}
      : {}),
    ...sourceAsset,
  };
}

function normalizeRecognition(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const source = cloneValue(value) as Record<string, unknown>;
  const modelInitialization = (source.modelInitialization ?? {}) as Record<string, unknown>;
  const feedback = (source.feedback ?? {}) as Record<string, unknown>;
  const navigation = (source.navigation ?? {}) as Record<string, unknown>;
  const preview = (source.preview ?? {}) as Record<string, unknown>;
  const overlay =
    preview.overlay && typeof preview.overlay === 'object' && !Array.isArray(preview.overlay)
      ? (preview.overlay as Record<string, unknown>)
      : null;
  const jointStyles =
    overlay?.jointStyles &&
    typeof overlay.jointStyles === 'object' &&
    !Array.isArray(overlay.jointStyles)
      ? (overlay.jointStyles as Record<string, Record<string, unknown>>)
      : null;
  const boneStyle =
    overlay?.boneStyle && typeof overlay.boneStyle === 'object' && !Array.isArray(overlay.boneStyle)
      ? (overlay.boneStyle as Record<string, unknown>)
      : null;
  const confidenceScaling =
    overlay?.confidenceScaling &&
    typeof overlay.confidenceScaling === 'object' &&
    !Array.isArray(overlay.confidenceScaling)
      ? (overlay.confidenceScaling as Record<string, unknown>)
      : {};
  const normalizedOverlay = overlay
    ? {
        visible: true,
        minimumConfidence: 0.5,
        ...overlay,
        ...(jointStyles
          ? {
              jointStyles: Object.fromEntries(
                Object.entries(jointStyles).map(([name, style]) => [
                  name,
                  {color: '#00e5ff', opacity: 1, radius: 4, ...style},
                ]),
              ),
            }
          : {}),
        ...(boneStyle ? {boneStyle: {color: '#00e5ff', opacity: 0.9, width: 3, ...boneStyle}} : {}),
        confidenceScaling: {
          jointOpacity: false,
          jointRadius: false,
          boneOpacity: false,
          boneWidth: false,
          ...confidenceScaling,
        },
      }
    : undefined;
  const controls =
    preview.controls && typeof preview.controls === 'object'
      ? (preview.controls as Record<string, Record<string, unknown>>)
      : null;
  const normalizedControls = controls
    ? Object.fromEntries(
        Object.entries(controls).map(([name, control]) => [name, {opacity: 1, ...control}]),
      )
    : undefined;
  return {
    ...source,
    modelInitialization: {policy: 'legacy', parallel: false, ...modelInitialization},
    feedback: {mode: 'scratchMirror', ...feedback},
    navigation: {allowSkip: false, ...navigation},
    preview: {
      mirroring: 'mirrored',
      position: 'full-stage',
      opacity: 0.2,
      ...preview,
      ...(normalizedOverlay ? {overlay: normalizedOverlay} : {}),
      ...(normalizedControls ? {controls: normalizedControls} : {}),
    },
  };
}

function mapPoseRecognitionSource(
  sourceMap: Record<string, SourceRange>,
  value: unknown,
  document: YamlDocumentView,
  lineCounter: import('yaml').LineCounter,
) {
  const recognitionNode = document.getIn(['recognition'], true);
  if (!recognitionNode) return;
  sourceMap['/recognition'] = sourceRangeForNode(recognitionNode, lineCounter);
  for (const field of [
    'idleSound',
    'chargeSound',
    'modelInitialization',
    'sequence',
    'selection',
    'feedback',
    'navigation',
    'preview',
  ]) {
    const fieldNode = document.getIn(['recognition', field], true);
    if (!fieldNode) continue;
    sourceMap[`/recognition/${field}`] = sourceRangeForNode(fieldNode, lineCounter);
    const nestedFields = {
      modelInitialization: ['policy', 'parallel'],
      sequence: ['confidenceThreshold', 'fullConfidenceHoldSeconds', 'idleChargePerSecond'],
      selection: ['accumulationPerSecond', 'decayPerSecond', 'scoreThreshold'],
      feedback: ['mode'],
      navigation: ['allowSkip'],
      preview: ['mirroring', 'position', 'opacity', 'overlay', 'controls'],
    }[field];
    for (const nestedField of nestedFields ?? []) {
      const nestedNode = document.getIn(['recognition', field, nestedField], true);
      if (nestedNode) {
        sourceMap[`/recognition/${field}/${nestedField}`] = sourceRangeForNode(
          nestedNode,
          lineCounter,
        );
      }
    }
    if (field === 'preview') {
      const poseRecognition =
        typeof value === 'object' && value !== null && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      const preview =
        typeof poseRecognition.preview === 'object' &&
        poseRecognition.preview !== null &&
        !Array.isArray(poseRecognition.preview)
          ? (poseRecognition.preview as Record<string, unknown>)
          : {};
      if (
        typeof preview.overlay === 'object' &&
        preview.overlay !== null &&
        !Array.isArray(preview.overlay)
      ) {
        mapNestedSource(
          sourceMap,
          preview.overlay,
          document,
          lineCounter,
          ['recognition', 'preview', 'overlay'],
          '/recognition/preview/overlay',
        );
      }
      for (const controlName of ['mirroring', 'cameraMenu']) {
        const controlPath = ['recognition', 'preview', 'controls', controlName];
        const controlNode = document.getIn(controlPath, true);
        if (!controlNode) continue;
        sourceMap[`/recognition/preview/controls/${controlName}`] = sourceRangeForNode(
          controlNode,
          lineCounter,
        );
        const controlFields =
          controlName === 'mirroring'
            ? ['position', 'opacity', 'assets']
            : ['position', 'opacity', 'buttonAsset'];
        for (const controlField of controlFields) {
          const controlFieldNode = document.getIn([...controlPath, controlField], true);
          if (controlFieldNode) {
            sourceMap[`/recognition/preview/controls/${controlName}/${controlField}`] =
              sourceRangeForNode(controlFieldNode, lineCounter);
          }
        }
        if (controlName === 'mirroring') {
          for (const assetField of ['showMirrored', 'showUnmirrored']) {
            const assetNode = document.getIn([...controlPath, 'assets', assetField], true);
            if (assetNode) {
              sourceMap[`/recognition/preview/controls/mirroring/assets/${assetField}`] =
                sourceRangeForNode(assetNode, lineCounter);
            }
          }
        }
      }
    }
  }
}

function mapBranchSources(
  sourceMap: Record<string, SourceRange>,
  branches: Record<string, unknown>,
  document: YamlDocumentView,
  lineCounter: import('yaml').LineCounter,
) {
  for (const [branchId, value] of Object.entries(branches)) {
    if (!Array.isArray(value)) continue;
    const branchPath = `/branches/${encodeDsl4StoryPathSegment(branchId)}`;
    sourceMap[branchPath] = sourceRangeForNode(
      document.getIn(['branches', branchId], true),
      lineCounter,
    );
    value.forEach((rule, index) => {
      const rulePath = `${branchPath}/${index}`;
      sourceMap[rulePath] = sourceRangeForNode(
        document.getIn(['branches', branchId, index], true),
        lineCounter,
      );
      if (typeof rule === 'object' && rule !== null && Object.hasOwn(rule, 'if')) {
        sourceMap[`${rulePath}/if`] = sourceRangeForNode(
          document.getIn(['branches', branchId, index, 'if'], true),
          lineCounter,
        );
      }
    });
  }
}

function normalizeAction(
  sourceAction: Record<string, unknown>,
  sceneId: string,
  actionIndex: number,
  actionNode: YamlNodeView | undefined,
  lineCounter: import('yaml').LineCounter,
  sourceMap: Record<string, SourceRange>,
): Record<string, unknown> {
  // The action shape is validated before this runs, so it always carries one command key.
  const [sourceCommand = ''] = Object.keys(sourceAction);
  const separator = sourceCommand.lastIndexOf('.');
  const target = separator === -1 ? null : sourceCommand.slice(0, separator);
  const command = separator === -1 ? sourceCommand : sourceCommand.slice(separator + 1);
  const sourceArguments = sourceAction[sourceCommand];
  const customAction = separator !== -1 && !actorCoreActionNames.has(command);
  const actionPath = `/scenes/${encodeDsl4StoryPathSegment(sceneId)}/actions/${actionIndex}`;
  const actionRange = sourceRangeForNode(actionNode, lineCounter);
  const argumentNode = asYamlNode(actionNode?.get?.(sourceCommand, true));
  const argumentRecord =
    typeof sourceArguments === 'object' && sourceArguments !== null
      ? (sourceArguments as Record<string, unknown>)
      : null;
  let args: Record<string, unknown>;

  if (customAction) {
    args = cloneValue((argumentRecord?.arguments ?? {}) as Record<string, unknown>) as Record<
      string,
      unknown
    >;
  } else if (sourceArguments === null && (command === 'debugger' || command === 'stopBgm')) {
    args = {};
  } else if (argumentRecord) {
    const routeCommand = [
      'keyInputToChangeScene',
      'touchInputToChangeScene',
      'poseInputToChangeScene',
      'imageInputToChangeScene',
    ].includes(command);
    args = cloneValue(
      routeCommand && !argumentRecord.routes ? {routes: argumentRecord} : argumentRecord,
    ) as Record<string, unknown>;
  } else {
    const argumentName = {
      bgm: 'sound',
      branch: 'branch',
      goto: 'scene',
      gotoSegment: 'segment',
      setSkin: 'skin',
      setLayer: 'layer',
      setTransparency: 'transparency',
      sound: 'sound',
      setBgmVolume: 'volume',
      stage: 'backdrop',
      stopBgm: 'seconds',
      toggleVariable: 'name',
      wait: 'seconds',
      broadcastMessageAndWait: 'message',
    }[command];
    if (!argumentName) throw new Error(`Cannot normalize scalar arguments for ${command}`);
    args = {[argumentName]: sourceArguments};
  }

  const stableId =
    typeof argumentRecord?.stableId === 'string' ? argumentRecord.stableId : undefined;
  delete args.stableId;
  if (!customAction && command === 'setText' && Object.hasOwn(args, 'text')) {
    // Both the plain string and the authored run list reach the runtime as one typed run list.
    args.text = normalizeDsl4ContentRuns(args.text);
  }
  if (
    !customAction &&
    (command === 'say' || command === 'think') &&
    Object.hasOwn(args, 'text') &&
    Array.isArray(args.text)
  ) {
    // A speech keeps its plain string, so stories without ruby reach the runtime as before. Only an
    // authored run list is normalized, to the same typed runs setText uses.
    args.text = normalizeDsl4ContentRuns(args.text);
  }
  if (!customAction && Object.hasOwn(args, 'transition')) {
    args.transition =
      command === 'bgm'
        ? normalizeDsl4AudioTransition(args.transition, `${actionPath}/args/transition`)
        : normalizeDsl4VisualTransition(args.transition, `${actionPath}/args/transition`);
  }
  const argsNode = customAction
    ? (asYamlNode(argumentNode?.get?.('arguments', true)) ?? argumentNode)
    : argumentNode;
  sourceMap[actionPath] = actionRange;
  sourceMap[`${actionPath}/args`] = sourceRangeForNode(argsNode, lineCounter);

  for (const field of Object.keys(args)) {
    let fieldNode = argsNode;
    if (customAction) {
      fieldNode = asYamlNode(argsNode?.get?.(field, true)) ?? argsNode;
    } else if (argumentNode?.get && argumentRecord) {
      const sourceField =
        field === 'routes' && !Object.hasOwn(argumentRecord, 'routes') ? undefined : field;
      if (sourceField) fieldNode = asYamlNode(argumentNode.get(sourceField, true)) ?? fieldNode;
    }
    sourceMap[`${actionPath}/args/${encodeDsl4StoryPathSegment(field)}`] = sourceRangeForNode(
      fieldNode,
      lineCounter,
    );
    if (field === 'transition') {
      mapNestedNode(
        sourceMap,
        args[field],
        fieldNode,
        lineCounter,
        `${actionPath}/args/transition`,
      );
    }
    if (field === 'styles' && Array.isArray(args[field])) {
      args[field].forEach((_, styleIndex) => {
        sourceMap[`${actionPath}/args/styles/${styleIndex}`] = sourceRangeForNode(
          asYamlNode(fieldNode?.get?.(styleIndex, true)) ?? fieldNode,
          lineCounter,
        );
      });
    }
  }
  if (stableId) {
    sourceMap[`${actionPath}/stableId`] = sourceRangeForNode(
      asYamlNode(argumentNode?.get?.('stableId', true)),
      lineCounter,
    );
  }

  return {
    kind: 'Action',
    id: actionPath,
    target,
    command,
    args,
    ...(customAction ? {handler: 'custom'} : {}),
    ...(stableId ? {stableId} : {}),
    sourceRange: actionRange,
  };
}

export function createStoryDocument(
  story: Record<string, unknown>,
  inputDocument: unknown,
  lineCounter: import('yaml').LineCounter,
  sourceId: string,
): Readonly<Record<string, unknown>> {
  const document = asYamlDocument(inputDocument);
  const sourceMap: Record<string, SourceRange> = {
    '/': sourceRangeForNode(document.contents, lineCounter),
  };
  mapPoseRecognitionSource(sourceMap, story.recognition, document, lineCounter);
  const sourceBranches = (story.branches ?? {}) as Record<string, unknown>;
  mapBranchSources(sourceMap, sourceBranches, document, lineCounter);
  const sourceAssets = (story.assets ?? {}) as Record<string, unknown>;
  const assets = Object.fromEntries(
    Object.entries(sourceAssets).map(([id, asset]) => {
      const assetPath = `/assets/${encodeDsl4StoryPathSegment(id)}`;
      sourceMap[assetPath] = sourceRangeForNode(document.getIn(['assets', id], true), lineCounter);
      mapNestedSource(sourceMap, asset, document, lineCounter, ['assets', id], assetPath);
      return [id, normalizeAsset(asset, id)];
    }),
  );

  const sourceBubbleStyles = (story.bubbleStyles ?? {}) as Record<string, Record<string, unknown>>;
  const bubbleStyles = cloneValue(sourceBubbleStyles);
  const bubbleStylesNode = document.getIn(['bubbleStyles'], true);
  if (bubbleStylesNode) {
    sourceMap['/bubbleStyles'] = sourceRangeForNode(bubbleStylesNode, lineCounter);
    for (const [styleId, style] of Object.entries(sourceBubbleStyles)) {
      const stylePath = `/bubbleStyles/${encodeDsl4StoryPathSegment(styleId)}`;
      const styleNode = document.getIn(['bubbleStyles', styleId], true);
      sourceMap[stylePath] = sourceRangeForNode(styleNode, lineCounter);
      mapNestedSource(
        sourceMap,
        style,
        document,
        lineCounter,
        ['bubbleStyles', styleId],
        stylePath,
      );
    }
  }

  const sourceBubbleClosePolicies = (story.bubbleClosePolicies ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const bubbleClosePolicies = cloneValue(sourceBubbleClosePolicies);
  const bubbleClosePoliciesNode = document.getIn(['bubbleClosePolicies'], true);
  if (bubbleClosePoliciesNode) {
    sourceMap['/bubbleClosePolicies'] = sourceRangeForNode(bubbleClosePoliciesNode, lineCounter);
    for (const [policyId, policy] of Object.entries(sourceBubbleClosePolicies)) {
      const policyPath = `/bubbleClosePolicies/${encodeDsl4StoryPathSegment(policyId)}`;
      const policyNode = document.getIn(['bubbleClosePolicies', policyId], true);
      sourceMap[policyPath] = sourceRangeForNode(policyNode, lineCounter);
      mapNestedSource(
        sourceMap,
        policy,
        document,
        lineCounter,
        ['bubbleClosePolicies', policyId],
        policyPath,
      );
    }
  }
  const presentation = Object.hasOwn(story, 'presentation')
    ? (cloneValue(story.presentation) as Record<string, unknown>)
    : undefined;
  const audio = Object.hasOwn(story, 'audio')
    ? (cloneValue(story.audio) as Record<string, unknown>)
    : undefined;
  if (
    presentation &&
    typeof presentation.transitions === 'object' &&
    presentation.transitions !== null
  ) {
    const transitions = presentation.transitions as Record<string, unknown>;
    for (const field of ['scene', 'backdrop', 'actorSkin', 'actorVisibility']) {
      if (!Object.hasOwn(transitions, field)) continue;
      transitions[field] = normalizeDsl4VisualTransition(
        transitions[field],
        `/presentation/transitions/${field}`,
      );
    }
  }
  if (audio && typeof audio.bgm === 'object' && audio.bgm !== null) {
    const bgm = audio.bgm as Record<string, unknown>;
    if (Object.hasOwn(bgm, 'transition')) {
      bgm.transition = normalizeDsl4AudioTransition(bgm.transition, '/audio/bgm/transition');
    }
  }
  for (const [field, value] of [
    ['presentation', presentation],
    ['audio', audio],
  ] as Array<[string, Record<string, unknown> | undefined]>) {
    if (value === undefined) continue;
    const node = document.getIn([field], true);
    sourceMap[`/${field}`] = sourceRangeForNode(node, lineCounter);
    mapNestedSource(sourceMap, value, document, lineCounter, [field], `/${field}`);
  }

  const sourceScenes = story.scenes as Record<string, unknown>;
  const scenes = Object.entries(sourceScenes).map(([sceneId, sourceScene]) => {
    const sourceScenePath = ['scenes', sceneId];
    const sceneNode = document.getIn(sourceScenePath, true);
    const isShortScene = Array.isArray(sourceScene);
    const sourceActions = isShortScene
      ? sourceScene
      : ((sourceScene as Record<string, unknown>).actions as Record<string, unknown>[]);
    const scenePath = `/scenes/${encodeDsl4StoryPathSegment(sceneId)}`;
    sourceMap[scenePath] = sourceRangeForNode(sceneNode, lineCounter);
    const actions = sourceActions.map((action, actionIndex) => {
      const actionSourcePath = isShortScene
        ? [...sourceScenePath, actionIndex]
        : [...sourceScenePath, 'actions', actionIndex];
      return normalizeAction(
        action,
        sceneId,
        actionIndex,
        asYamlNode(document.getIn(actionSourcePath, true)),
        lineCounter,
        sourceMap,
      );
    });
    const longScene = sourceScene as Record<string, unknown>;
    const recognitionModel = isShortScene ? null : (longScene.recognitionModel ?? null);
    const posePreview = isShortScene ? null : cloneValue(longScene.posePreview ?? null);
    const entryTransition =
      !isShortScene && Object.hasOwn(longScene, 'entryTransition')
        ? normalizeDsl4VisualTransition(longScene.entryTransition, `${scenePath}/entryTransition`)
        : undefined;
    if (recognitionModel) {
      sourceMap[`${scenePath}/recognitionModel`] = sourceRangeForNode(
        document.getIn([...sourceScenePath, 'recognitionModel'], true),
        lineCounter,
      );
    }
    if (posePreview) {
      const posePreviewNode = document.getIn([...sourceScenePath, 'posePreview'], true);
      sourceMap[`${scenePath}/posePreview`] = sourceRangeForNode(posePreviewNode, lineCounter);
      sourceMap[`${scenePath}/posePreview/mirroring`] = sourceRangeForNode(
        document.getIn([...sourceScenePath, 'posePreview', 'mirroring'], true),
        lineCounter,
      );
    }
    if (entryTransition !== undefined) {
      const entryTransitionNode = document.getIn([...sourceScenePath, 'entryTransition'], true);
      sourceMap[`${scenePath}/entryTransition`] = sourceRangeForNode(
        entryTransitionNode,
        lineCounter,
      );
      mapNestedNode(
        sourceMap,
        entryTransition,
        asYamlNode(entryTransitionNode),
        lineCounter,
        `${scenePath}/entryTransition`,
      );
    }
    return {
      kind: 'Scene',
      id: sceneId,
      recognitionModel,
      posePreview,
      ...(entryTransition === undefined ? {} : {entryTransition}),
      actions,
    };
  });

  const result = {
    kind: 'StoryDocument',
    version: '4.0',
    metadata: {sourceId},
    ...(story.viewport === undefined ? {} : {viewport: resolveDsl4Viewport(story.viewport)}),
    assets,
    actors: cloneValue(story.actors ?? {}),
    cover: cloneValue(story.cover ?? null),
    textStyles: cloneValue(story.textStyles ?? {}),
    bubbleStyles,
    bubbleClosePolicies,
    variables: cloneValue(story.variables ?? {}),
    loading: cloneValue(story.loading ?? null),
    recognition: normalizeRecognition(story.recognition ?? story.poseRecognition ?? null),
    controls: cloneValue(story.controls ?? null),
    branches: cloneValue(sourceBranches),
    ...(presentation === undefined ? {} : {presentation}),
    ...(audio === undefined ? {} : {audio}),
    scenes,
    sourceMap,
  };
  return deepFreeze(result);
}
