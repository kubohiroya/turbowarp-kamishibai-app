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
