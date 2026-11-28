/**
 * Editor-only relation declarations for scene references (`scriptRelations` on a getInfo() block).
 * TurboWarp ignores the key; the Plus Editor draws a reference arrow from each block that moves to a
 * scene to the `scene` block with the same SCENE name. The channel is a name, not an opcode, so it
 * links the runtime's action blocks to the block script's scene blocks across extensions.
 */
export const dsl4SceneRelationChannel = 'kubohiroya.kamishibai4.scene';
export const dsl4SceneRelationTarget = Object.freeze({
  targets: Object.freeze([Object.freeze({channel: dsl4SceneRelationChannel, argument: 'SCENE'})]),
});
export const dsl4SceneRelationReference = Object.freeze({
  references: Object.freeze([
    Object.freeze({channel: dsl4SceneRelationChannel, argument: 'SCENE'}),
  ]),
});
/** Block operations whose SCENE argument names the scene they move to. */
export const dsl4SceneReferenceOperations: readonly string[] = Object.freeze([
  'goto',
  'gotoFromCurrentAction',
]);
/**
 * The input routes name a scene per input, as `{"Space": "next"}` or `{"routes": {...}}`; each string
 * value is one reference.
 */
export const dsl4SceneRoutesRelationReference = Object.freeze({
  references: Object.freeze([
    Object.freeze({
      channel: dsl4SceneRelationChannel,
      argument: 'ROUTES',
      json: Object.freeze({
        objectPaths: Object.freeze([Object.freeze(['routes']), Object.freeze([])]),
      }),
    }),
  ]),
});
/** Block operations whose ROUTES argument maps each input to the scene it moves to. */
export const dsl4SceneRoutesOperations: readonly string[] = Object.freeze([
  'keyInputToChangeScene',
  'touchInputToChangeScene',
  'poseInputToChangeScene',
  'imageInputToChangeScene',
]);
/** The relation declaration for one block operation, if it moves to scenes. */
export function dsl4SceneRelationFor(operation: string) {
  if (dsl4SceneReferenceOperations.includes(operation)) return dsl4SceneRelationReference;
  if (dsl4SceneRoutesOperations.includes(operation)) return dsl4SceneRoutesRelationReference;
  return undefined;
}
