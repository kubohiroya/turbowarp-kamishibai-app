/**
 * The single machine-readable contract for DSL 4.0 core actions.
 *
 * `requiredTurboWarpBlock` describes the public block that must exist before
 * TurboWarp -> DSL action parity can be considered complete. Runtime surfaces
 * consume the same command name so the block and YAML paths can share one
 * dispatcher instead of implementing parallel semantics.
 */

type Dsl4CoreActionTarget = 'global' | 'actor';
type Dsl4CoreActionDispatch =
  'port' | 'debug' | 'navigation' | 'branch' | 'selection' | 'pose-sequence' | 'variable';

function defineCoreAction(
  command: string,
  target: Dsl4CoreActionTarget,
  schemaDefinition: string,
  quiesce: 'finish-only' | 'cancel-replay-safe',
  runtimeDispatch: Dsl4CoreActionDispatch,
  featureFlag?: 'dsl4PresentationEffects',
) {
  return Object.freeze({
    command,
    target,
    schemaDefinition,
    schemaRef: `#/$defs/${schemaDefinition}`,
    quiesce,
    runtimeDispatch,
    ...(featureFlag === undefined ? {} : {featureFlag}),
    requiredTurboWarpBlock: Object.freeze({
      opcode: command,
      visibility: 'visible',
    }),
  });
}

export const dsl4CustomActionSchemaDefinition = 'customActorAction';

export const dsl4CoreActionManifest = Object.freeze([
  defineCoreAction('stage', 'global', 'stageAction', 'finish-only', 'port'),
  defineCoreAction('bgm', 'global', 'bgmAction', 'finish-only', 'port'),
  defineCoreAction('stopBgm', 'global', 'stopBgmAction', 'finish-only', 'port'),
  defineCoreAction('setBgmVolume', 'global', 'setBgmVolumeAction', 'finish-only', 'port'),
  defineCoreAction('sound', 'global', 'soundAction', 'finish-only', 'port'),
  defineCoreAction('audio', 'global', 'audioAction', 'cancel-replay-safe', 'port'),
  defineCoreAction('audioControl', 'global', 'audioControlAction', 'cancel-replay-safe', 'port'),
  defineCoreAction('video', 'global', 'videoAction', 'cancel-replay-safe', 'port'),
  defineCoreAction('videoControl', 'global', 'videoControlAction', 'cancel-replay-safe', 'port'),
  defineCoreAction('wait', 'global', 'waitAction', 'cancel-replay-safe', 'port'),
  defineCoreAction('debugger', 'global', 'debuggerAction', 'cancel-replay-safe', 'debug'),
  defineCoreAction(
    'broadcastMessageAndWait',
    'global',
    'broadcastMessageAndWaitAction',
    'finish-only',
    'port',
  ),
  defineCoreAction('transition', 'global', 'transitionAction', 'cancel-replay-safe', 'port'),
  defineCoreAction(
    'presentationEffect',
    'global',
    'presentationEffectAction',
    'cancel-replay-safe',
    'port',
    'dsl4PresentationEffects',
  ),
  defineCoreAction('goto', 'global', 'gotoAction', 'finish-only', 'navigation'),
  defineCoreAction('gotoSegment', 'global', 'gotoSegmentAction', 'finish-only', 'port'),
  defineCoreAction('branch', 'global', 'branchAction', 'finish-only', 'branch'),
  defineCoreAction('setVariable', 'global', 'setVariableAction', 'finish-only', 'variable'),
  defineCoreAction('changeVariable', 'global', 'changeVariableAction', 'finish-only', 'variable'),
  defineCoreAction('toggleVariable', 'global', 'toggleVariableAction', 'finish-only', 'variable'),
  defineCoreAction(
    'keyInputToChangeScene',
    'global',
    'keyInputAction',
    'cancel-replay-safe',
    'selection',
  ),
  defineCoreAction(
    'touchInputToChangeScene',
    'global',
    'touchInputAction',
    'cancel-replay-safe',
    'selection',
  ),
  defineCoreAction(
    'poseInputToChangeScene',
    'global',
    'poseInputAction',
    'cancel-replay-safe',
    'selection',
  ),
  defineCoreAction(
    'imageInputToChangeScene',
    'global',
    'imageInputAction',
    'cancel-replay-safe',
    'selection',
  ),
  defineCoreAction('show', 'actor', 'showAction', 'finish-only', 'port'),
  defineCoreAction('hide', 'actor', 'hideAction', 'finish-only', 'port'),
  defineCoreAction('setTransparency', 'actor', 'setTransparencyAction', 'finish-only', 'port'),
  defineCoreAction('moveTo', 'actor', 'moveToAction', 'cancel-replay-safe', 'port'),
  defineCoreAction(
    'animate',
    'actor',
    'animateAction',
    'finish-only',
    'port',
    'dsl4PresentationEffects',
  ),
  defineCoreAction('say', 'actor', 'sayAction', 'cancel-replay-safe', 'port'),
  defineCoreAction('think', 'actor', 'thinkAction', 'cancel-replay-safe', 'port'),
  defineCoreAction('setSkin', 'actor', 'setSkinAction', 'finish-only', 'port'),
  defineCoreAction('setLayer', 'actor', 'setLayerAction', 'finish-only', 'port'),
  defineCoreAction('loop', 'actor', 'loopAction', 'finish-only', 'port'),
  defineCoreAction('setText', 'actor', 'setTextAction', 'finish-only', 'port'),
  defineCoreAction('pose', 'actor', 'poseAction', 'cancel-replay-safe', 'pose-sequence'),
]);
