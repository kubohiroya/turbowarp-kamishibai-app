import {deepFreeze} from './story-document.js';
import {composeBubbleStyles} from './bubble-style.js';

function sortedUnique(values: Iterable<string>) {
  return [...new Set(values)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function addDependency(value: unknown, dependencies: Set<string>) {
  if (typeof value === 'string') dependencies.add(value);
}

function addFrameDependencies(value: unknown, dependencies: Set<string>) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const frames = (value as Readonly<Record<string, unknown>>).frames;
  if (!Array.isArray(frames)) return;
  for (const frame of frames) addDependency(frame, dependencies);
}

function addActionDependencies(
  action: Readonly<Record<string, unknown>>,
  dependencies: Set<string>,
  bubbleStyles: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): boolean {
  const command = String(action.command);
  const args = (action.args ?? {}) as Readonly<Record<string, unknown>>;
  if (command === 'stage') addDependency(args.backdrop, dependencies);
  if (command === 'video' || command === 'audio') addDependency(args.asset, dependencies);
  if (command === 'bgm' || command === 'sound') addDependency(args.sound, dependencies);
  if (command === 'say' || command === 'think') {
    addDependency(args.startSound, dependencies);
    const styleIds = Array.isArray(args.styles)
      ? (args.styles.filter((styleId) => typeof styleId === 'string') as string[])
      : [];
    const style = styleIds.length > 0 ? composeBubbleStyles(styleIds, bubbleStyles) : undefined;
    addDependency(
      Object.hasOwn(args, 'characterSound') ? args.characterSound : style?.characterSound,
      dependencies,
    );
    const portrait = (style?.portrait ?? {}) as Readonly<Record<string, unknown>>;
    addDependency(portrait.base, dependencies);
    addFrameDependencies(portrait.blink, dependencies);
    addFrameDependencies(portrait.lipSync, dependencies);
    addFrameDependencies(style?.continueIndicator, dependencies);
    const reveal = (style?.reveal ?? {}) as Readonly<Record<string, unknown>>;
    addDependency(reveal.sound, dependencies);
    const audio = (style?.audio ?? {}) as Readonly<Record<string, unknown>>;
    addDependency(audio.voice, dependencies);
    addDependency(audio.reveal, dependencies);
    addDependency(audio.finish, dependencies);
  }
  if (command === 'loop' && Array.isArray(args.steps)) {
    for (const step of args.steps) {
      if (typeof step === 'object' && step !== null && !Array.isArray(step)) {
        addDependency((step as Readonly<Record<string, unknown>>).skin, dependencies);
      }
    }
  }
  if (command === 'show' || command === 'setSkin') addDependency(args.skin, dependencies);
  if (command === 'loop' && Array.isArray(args.steps)) {
    for (const step of args.steps) {
      if (typeof step === 'object' && step !== null && !Array.isArray(step)) {
        addDependency((step as Readonly<Record<string, unknown>>).skin, dependencies);
      }
    }
  }
  if (command !== 'pose') return false;

  const steps = (args.steps ?? []) as ReadonlyArray<Readonly<Record<string, unknown>>>;
  for (const step of steps) {
    addDependency(step.skin, dependencies);
    addDependency(step.sound, dependencies);
  }
  return true;
}

/**
 * Build the immutable preparation index consumed by runtime asset lifecycle adapters.
 *
 * Scene `eager` means the asset is already covered by the startup preparation set. Scene
 * `lazy` contains only direct dependencies that still need background preparation.
 */
export function createDsl4AssetDependencyIndex(storyDocument: Readonly<Record<string, unknown>>) {
  if (storyDocument.kind !== 'StoryDocument' || storyDocument.version !== '4.0') {
    throw new TypeError('DSL 4.0 asset dependency index requires a StoryDocument version 4.0');
  }

  const assets = (storyDocument.assets ?? {}) as Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >;
  const bubbleStyles = (storyDocument.bubbleStyles ?? {}) as Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >;
  const sceneRetainedAssets = new Set(
    Object.entries(assets)
      .filter(([, asset]) => asset.retention === 'scene')
      .map(([assetId]) => assetId),
  );
  // Recognition models never hold up startup or a scene entry: each scene loads its own model in
  // the background, and only a recognition action waits for it, and only while it is still loading.
  const recognitionModels = new Set(
    Object.entries(assets)
      .filter(([, asset]) => asset.kind === 'recognitionModel')
      .map(([assetId]) => assetId),
  );
  const startup = new Set(
    Object.entries(assets)
      .filter(([assetId, asset]) => asset.loading !== 'lazy' && !recognitionModels.has(assetId))
      .map(([assetId]) => assetId),
  );

  const loading = (storyDocument.loading ?? null) as Readonly<Record<string, unknown>> | null;
  const loadingDependencies = new Set<string>();
  if (loading) {
    addDependency(loading.backdrop, loadingDependencies);
    for (const costume of (loading.costumes ?? []) as ReadonlyArray<unknown>) {
      addDependency(costume, loadingDependencies);
    }
    for (const assetId of loadingDependencies) startup.add(assetId);
  }

  const coverDependencies = new Set<string>();
  const cover = (storyDocument.cover ?? null) as Readonly<Record<string, unknown>> | null;
  if (cover) {
    addDependency(cover.backdrop, coverDependencies);
    addDependency(cover.bgm, coverDependencies);
  }

  const actorDependencies = new Set<string>();
  for (const costume of Object.values(
    (storyDocument.actors ?? {}) as Readonly<Record<string, unknown>>,
  )) {
    addDependency(costume, actorDependencies);
  }

  const recognition = (storyDocument.recognition ?? null) as Readonly<
    Record<string, unknown>
  > | null;
  const recognitionDependencies = new Set<string>();
  const posePreviewControlDependencies = new Set<string>();
  if (recognition) {
    addDependency(recognition.idleSound, recognitionDependencies);
    addDependency(recognition.chargeSound, recognitionDependencies);
    const preview = (recognition.preview ?? {}) as Readonly<Record<string, unknown>>;
    const controls = (preview.controls ?? {}) as Readonly<Record<string, unknown>>;
    const mirroring = (controls.mirroring ?? {}) as Readonly<Record<string, unknown>>;
    const mirroringAssets = (mirroring.assets ?? {}) as Readonly<Record<string, unknown>>;
    const cameraMenu = (controls.cameraMenu ?? {}) as Readonly<Record<string, unknown>>;
    addDependency(mirroringAssets.showMirrored, posePreviewControlDependencies);
    addDependency(mirroringAssets.showUnmirrored, posePreviewControlDependencies);
    addDependency(cameraMenu.buttonAsset, posePreviewControlDependencies);
    for (const assetId of posePreviewControlDependencies) startup.add(assetId);
  }

  const startupAssets = sortedUnique(startup);
  const bgmDependencies = new Set<string>();
  /** The four dependency phases every scene entry carries. */
  const scenes: Record<
    string,
    Readonly<{
      all: ReadonlyArray<string>;
      eager: ReadonlyArray<string>;
      lazy: ReadonlyArray<string>;
      /** Recognition models the scene loads in the background without waiting for them. */
      background: ReadonlyArray<string>;
      /**
       * Recognition models of the scenes this scene can move to next, loaded in the background
       * once the scene's own models are ready, so the next scene rarely waits for its model.
       */
      prefetch: ReadonlyArray<string>;
      sceneRetained: ReadonlyArray<string>;
    }>
  > = {};
  const sceneList = (storyDocument.scenes ?? []) as ReadonlyArray<
    Readonly<Record<string, unknown>>
  >;
  const backgroundBySceneId = new Map<string, ReadonlyArray<string>>();
  const successorsBySceneId = new Map<string, ReadonlySet<string>>();
  for (const [sceneIndex, scene] of sceneList.entries()) {
    successorsBySceneId.set(
      String(scene.id),
      sceneSuccessors(scene, sceneList[sceneIndex + 1], storyDocument.branches),
    );
  }
  for (const scene of sceneList) {
    const dependencies = new Set<string>();
    addDependency(scene.recognitionModel, dependencies);
    let usesPoseRecognition = false;
    for (const action of (scene.actions ?? []) as ReadonlyArray<
      Readonly<Record<string, unknown>>
    >) {
      if (action.command === 'bgm') {
        addDependency(
          ((action.args ?? {}) as Readonly<Record<string, unknown>>).sound,
          bgmDependencies,
        );
      }
      usesPoseRecognition =
        addActionDependencies(action, dependencies, bubbleStyles) || usesPoseRecognition;
    }
    if (usesPoseRecognition) {
      for (const assetId of recognitionDependencies) dependencies.add(assetId);
    }
    const all = sortedUnique(dependencies);
    backgroundBySceneId.set(
      String(scene.id),
      all.filter((assetId) => recognitionModels.has(assetId)),
    );
    scenes[String(scene.id)] = {
      all,
      eager: all.filter((assetId) => startup.has(assetId)),
      lazy: all.filter((assetId) => !startup.has(assetId) && !recognitionModels.has(assetId)),
      background: backgroundBySceneId.get(String(scene.id)) ?? [],
      prefetch: [],
      sceneRetained: all.filter((assetId) => sceneRetainedAssets.has(assetId)),
    };
  }
  for (const [sceneId, entry] of Object.entries(scenes)) {
    const own = new Set(entry.background);
    const prefetch = new Set<string>();
    for (const next of successorsBySceneId.get(sceneId) ?? []) {
      for (const assetId of backgroundBySceneId.get(next) ?? []) {
        if (!own.has(assetId)) prefetch.add(assetId);
      }
    }
    scenes[sceneId] = deepFreeze({...entry, prefetch: sortedUnique(prefetch)});
  }

  return deepFreeze({
    formatVersion: 1,
    startup: startupAssets,
    cover: sortedUnique(coverDependencies),
    actors: sortedUnique(actorDependencies),
    loading: sortedUnique(loadingDependencies),
    recognition: sortedUnique(recognitionDependencies),
    posePreviewControls: sortedUnique(posePreviewControlDependencies),
    bgm: sortedUnique(bgmDependencies),
    sceneRetained: sortedUnique(sceneRetainedAssets),
    scenes,
  });
}

/**
 * The scenes a scene can move to next: the following scene in order unless the scene ends by
 * moving elsewhere, and every scene its actions
 * name through `goto`, a branch, or the routes of an input action, at any nesting depth. A custom
 * action can also move elsewhere, but its destination is not known before it runs.
 */
function sceneSuccessors(
  scene: Readonly<Record<string, unknown>>,
  following: Readonly<Record<string, unknown>> | undefined,
  branches: unknown,
): ReadonlySet<string> {
  const successors = new Set<string>();
  const actions = Array.isArray(scene.actions) ? scene.actions : [];
  const last = actions.at(-1) as Readonly<Record<string, unknown>> | undefined;
  // A scene that ends by moving elsewhere never runs on into the following scene.
  const endsByMoving =
    last?.command === 'goto' ||
    last?.command === 'branch' ||
    (typeof last?.command === 'string' && last.command.endsWith('InputToChangeScene'));
  if (following && !endsByMoving) successors.add(String(following.id));
  const branchRules =
    typeof branches === 'object' && branches !== null
      ? (branches as Readonly<Record<string, unknown>>)
      : {};
  const visit = (value: unknown, depth: number) => {
    if (depth > 64 || typeof value !== 'object' || value === null) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const record = value as Readonly<Record<string, unknown>>;
    const args =
      typeof record.args === 'object' && record.args !== null
        ? (record.args as Readonly<Record<string, unknown>>)
        : null;
    if (record.kind === 'Action' && args) {
      if (record.command === 'goto' && typeof args.scene === 'string') successors.add(args.scene);
      if (record.command === 'branch' && typeof args.branch === 'string') {
        const rules = branchRules[args.branch];
        for (const rule of Array.isArray(rules) ? rules : []) {
          const target =
            (rule as Readonly<Record<string, unknown>>)?.goto ??
            (rule as Readonly<Record<string, unknown>>)?.else;
          if (typeof target === 'string') successors.add(target);
        }
      }
      if (
        typeof record.command === 'string' &&
        record.command.endsWith('InputToChangeScene') &&
        typeof args.routes === 'object' &&
        args.routes !== null
      ) {
        for (const target of Object.values(args.routes)) {
          if (typeof target === 'string') successors.add(target);
        }
      }
    }
    for (const child of Object.values(record)) visit(child, depth + 1);
  };
  visit(scene.actions, 0);
  successors.delete(String(scene.id));
  return successors;
}
