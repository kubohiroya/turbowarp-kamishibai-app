import {evaluateDsl4TextInterpolation, isDsl4TextInterpolation} from './text-interpolation.js';
import {
  isDsl4ActorCoreSourceAction,
  dsl4EmptyActionRegistrySnapshot,
  validateDsl4ActionRegistrySnapshot,
} from './action-registry.js';
import {composeBubbleStyles} from './bubble-style.js';
import {isDsl4VideoUrl} from './video-source.js';
import {resolveDsl4Viewport} from './viewport.js';

const identifierSections = [
  'actors',
  'textStyles',
  'bubbleStyles',
  'bubbleClosePolicies',
  'variables',
  'branches',
];
const speechPresentationFields = [
  'characterIntervalSeconds',
  'characterSound',
  'noSoundCharacters',
  'restCharacters',
  'restCharacterIntervalSeconds',
];

function validateSpeechPresentation(
  issues: SemanticIssue[],
  presentation: Record<string, unknown>,
  path: string,
) {
  const requirements: Array<[string, string[]]> = [
    ['characterSound', ['characterIntervalSeconds']],
    ['noSoundCharacters', ['characterIntervalSeconds', 'characterSound']],
    ['restCharacters', ['characterIntervalSeconds', 'restCharacterIntervalSeconds']],
    ['restCharacterIntervalSeconds', ['characterIntervalSeconds', 'restCharacters']],
  ];
  for (const [field, dependencies] of requirements) {
    if (!Object.hasOwn(presentation, field)) continue;
    for (const dependency of dependencies) {
      if (Object.hasOwn(presentation, dependency)) continue;
      issues.push({
        code: 'K4-SPEECH-STYLE-001',
        path: `${path}.${field}`,
        message: `${field} requires ${dependency} after bubble styles are composed`,
      });
    }
  }
}

function escapedJsonString(value: string) {
  return JSON.stringify(value).replace(
    /[\u0000-\u001f\u007f]/gu,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

function propertyPath(base: string, property: string) {
  return `${base}[${escapedJsonString(property)}]`;
}

function diagnosticValue(value: unknown) {
  return escapedJsonString(String(value));
}

export interface SemanticIssue {
  code: string;
  path: string;
  message: string;
}

function assetKind(asset: unknown): {kind: string | undefined; target: string | undefined} {
  if (typeof asset === 'string') {
    const [kind, target] = asset.split(':');
    return {kind, target};
  }
  if (typeof asset !== 'object' || asset === null) return {kind: undefined, target: undefined};
  const record = asset as Record<string, unknown>;
  return {
    kind: typeof record.kind === 'string' ? record.kind : undefined,
    target: typeof record.target === 'string' ? record.target : undefined,
  };
}

function isCanonicalRemoteHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value.startsWith('https://')) return false;
  const authority = value.slice('https://'.length).split(/[/?#]/u, 1)[0];
  if (!authority) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname.length > 0 &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.hash.length === 0
    );
  } catch {
    return false;
  }
}

function actionArgument(action: Record<string, unknown>, key: string): unknown {
  const value = action[key];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const namedKey = {
    bgm: 'sound',
    branch: 'branch',
    goto: 'scene',
    sound: 'sound',
    stage: 'backdrop',
  }[key];
  return namedKey ? (value as Record<string, unknown>)[namedKey] : value;
}

function sceneActions(scene: unknown): Record<string, unknown>[] {
  if (Array.isArray(scene)) return scene as Record<string, unknown>[];
  return (scene as Record<string, unknown>).actions as Record<string, unknown>[];
}

function addReferenceIssue(
  issues: SemanticIssue[],
  collection: Record<string, unknown>,
  id: unknown,
  expectedKind: string | undefined,
  path: string,
) {
  if (typeof id !== 'string') return;
  if (!Object.hasOwn(collection, id)) {
    issues.push({
      code: 'K4-REF-001',
      path,
      message: `Unknown reference: ${diagnosticValue(id)}`,
    });
    return;
  }
  if (expectedKind && assetKind(collection[id]).kind !== expectedKind) {
    issues.push({
      code: 'K4-REF-002',
      path,
      message: `Reference ${diagnosticValue(id)} must have asset kind ${expectedKind}`,
    });
  }
}

/**
 * Validate relationships that JSON Schema cannot express.
 *
 * @param {Record<string, unknown>} story
 */
export function validateDsl4Semantics(
  story: Record<string, unknown>,
  {actionRegistry = dsl4EmptyActionRegistrySnapshot}: {actionRegistry?: unknown} = {},
): SemanticIssue[] {
  const registry = validateDsl4ActionRegistrySnapshot(actionRegistry);
  const customActions = new Map(registry.actions.map((action) => [action.name, action]));
  const issues: SemanticIssue[] = [];
  if (story.viewport !== undefined) {
    try {
      resolveDsl4Viewport(story.viewport);
    } catch (error) {
      issues.push({
        code: 'K4-VIEWPORT-001',
        path: '$.viewport',
        message: String((error as Error).message),
      });
    }
  }
  const assets = (story.assets ?? {}) as Record<string, unknown>;
  const actors = (story.actors ?? {}) as Record<string, string>;
  const scenes = (story.scenes ?? {}) as Record<string, unknown>;
  const branches = (story.branches ?? {}) as Record<string, Record<string, string>[]>;
  const textStyles = (story.textStyles ?? {}) as Record<string, unknown>;
  const bubbleStyles = (story.bubbleStyles ?? {}) as Record<string, Record<string, unknown>>;
  const bubbleClosePolicies = (story.bubbleClosePolicies ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const stableIds = new Map();
  const storyInputCodes = new Map();

  for (const section of identifierSections) {
    const values = (story[section] ?? {}) as Record<string, unknown>;
    for (const id of Object.keys(values)) {
      if (id !== id.normalize('NFC')) {
        issues.push({
          code: 'K4-ID-001',
          path: `$.${section}.${id}`,
          message: 'Identifiers must use Unicode NFC',
        });
      }
    }
  }

  for (const [id, asset] of Object.entries(assets)) {
    if (typeof asset !== 'object' || asset === null) continue;
    const assetRecord = asset as Record<string, unknown>;
    const file = assetRecord.file;
    if (assetRecord.delivery === 'remote') {
      const source = assetRecord.source as Record<string, unknown>;
      if (!isCanonicalRemoteHttpsUrl(source.url)) {
        issues.push({
          code: 'K4-ASSET-REMOTE-URL-001',
          path: `${propertyPath('$.assets', id)}.source.url`,
          message: 'Remote asset URL must be an absolute HTTPS URL without credentials or fragment',
        });
      }
      if (
        assetRecord.kind === 'image' &&
        source.contentType !== undefined &&
        (typeof source.contentType !== 'string' || !source.contentType.startsWith('image/'))
      ) {
        issues.push({
          code: 'K4-ASSET-IMAGE-MIME-001',
          path: `${propertyPath('$.assets', id)}.source.contentType`,
          message: 'Target-independent image assets require an image Content-Type',
        });
      }
      if (
        assetRecord.kind === 'video' &&
        source.contentType !== undefined &&
        (typeof source.contentType !== 'string' || !source.contentType.startsWith('video/'))
      ) {
        issues.push({
          code: 'K4-ASSET-VIDEO-MIME-001',
          path: `${propertyPath('$.assets', id)}.source.contentType`,
          message: 'Video assets require a video Content-Type',
        });
      }
    }
    if (typeof file !== 'string') continue;
    const components = file.split('/');
    if (
      components.some((component) => component === '.' || component === '..') ||
      /^[A-Za-z][A-Za-z0-9+.-]*:/.test(file)
    ) {
      issues.push({
        code: 'K4-ASSET-001',
        path: `${propertyPath('$.assets', id)}.file`,
        message: 'Asset file must be a local relative path without dot segments',
      });
    }
  }

  for (const [actor, initialCostume] of Object.entries(actors)) {
    addReferenceIssue(issues, assets, initialCostume, 'costume', `$.actors.${actor}`);
    if (
      Object.hasOwn(assets, initialCostume) &&
      assetKind(assets[initialCostume]).target !== actor
    ) {
      issues.push({
        code: 'K4-REF-003',
        path: `$.actors.${actor}`,
        message: `Initial costume ${diagnosticValue(initialCostume)} must target actor ${diagnosticValue(actor)}`,
      });
    }
  }

  for (const [styleId, style] of Object.entries(bubbleStyles)) {
    const inheritedStyleIds = Array.isArray(style.styles) ? (style.styles as string[]) : [];
    inheritedStyleIds.forEach((inheritedStyleId, styleIndex) =>
      addReferenceIssue(
        issues,
        bubbleStyles,
        inheritedStyleId,
        undefined,
        `$.bubbleStyles.${styleId}.styles[${styleIndex}]`,
      ),
    );
    if (style.textStyle !== 'default') {
      addReferenceIssue(
        issues,
        textStyles,
        style.textStyle,
        undefined,
        `$.bubbleStyles.${styleId}.textStyle`,
      );
    }
    addReferenceIssue(
      issues,
      assets,
      style.characterSound,
      'sound',
      `$.bubbleStyles.${styleId}.characterSound`,
    );
    const portrait = (style.portrait ?? {}) as Record<string, unknown>;
    addReferenceIssue(
      issues,
      assets,
      portrait.base,
      'image',
      `$.bubbleStyles.${styleId}.portrait.base`,
    );
    for (const animationName of ['blink', 'lipSync']) {
      const animation = (portrait[animationName] ?? {}) as Record<string, unknown>;
      for (const [index, frame] of ((animation.frames ?? []) as unknown[]).entries()) {
        addReferenceIssue(
          issues,
          assets,
          frame,
          'image',
          `$.bubbleStyles.${styleId}.portrait.${animationName}.frames[${index}]`,
        );
      }
    }
    const indicator = (style.continueIndicator ?? {}) as Record<string, unknown>;
    for (const [index, frame] of ((indicator.frames ?? []) as unknown[]).entries()) {
      addReferenceIssue(
        issues,
        assets,
        frame,
        'image',
        `$.bubbleStyles.${styleId}.continueIndicator.frames[${index}]`,
      );
    }
    const reveal = (style.reveal ?? {}) as Record<string, unknown>;
    addReferenceIssue(
      issues,
      assets,
      reveal.sound,
      'sound',
      `$.bubbleStyles.${styleId}.reveal.sound`,
    );
    const audio = (style.audio ?? {}) as Record<string, unknown>;
    for (const audioName of ['voice', 'reveal', 'finish']) {
      addReferenceIssue(
        issues,
        assets,
        audio[audioName],
        'sound',
        `$.bubbleStyles.${styleId}.audio.${audioName}`,
      );
    }
  }

  const reportedStyleCycles = new Set();
  for (const styleId of Object.keys(bubbleStyles)) {
    try {
      const effectiveStyle = composeBubbleStyles([styleId], bubbleStyles);
      if (
        Object.hasOwn(effectiveStyle, 'reveal') &&
        speechPresentationFields.some((field) => Object.hasOwn(effectiveStyle, field))
      ) {
        issues.push({
          code: 'K4-SPEECH-STYLE-002',
          path: `$.bubbleStyles.${styleId}.reveal`,
          message: 'Bubble reveal cannot be combined with legacy character presentation fields',
        });
      }
    } catch (error) {
      if (!(error instanceof Error)) continue;
      const styleError = error as Error & {reason?: string; cycle?: unknown};
      if (styleError.reason !== 'cycle' || !Array.isArray(styleError.cycle)) {
        continue;
      }
      const cycle = styleError.cycle as string[];
      const cycleMembers = cycle.slice(0, -1);
      const cycleKey = [...new Set(cycleMembers)].sort().join('\u0000');
      if (reportedStyleCycles.has(cycleKey)) continue;
      reportedStyleCycles.add(cycleKey);
      issues.push({
        code: 'K4-BUBBLE-STYLE-CYCLE-001',
        path: `$.bubbleStyles.${styleId}.styles`,
        message: `Bubble styles must not form a cycle: ${cycle.join(' -> ')}`,
      });
    }
  }

  const cover = story.cover as Record<string, unknown> | undefined;
  if (cover) {
    addReferenceIssue(issues, assets, cover.backdrop, 'backdrop', '$.cover.backdrop');
    if (cover.bgm) addReferenceIssue(issues, assets, cover.bgm, 'sound', '$.cover.bgm');
  }

  const loading = story.loading as Record<string, unknown> | undefined;
  if (loading) {
    addReferenceIssue(issues, assets, loading.backdrop, 'backdrop', '$.loading.backdrop');
    (loading.costumes as string[]).forEach((id, index) =>
      addReferenceIssue(issues, assets, id, 'costume', `$.loading.costumes[${index}]`),
    );
  }

  const recognition = story.recognition as Record<string, unknown> | undefined;
  if (recognition) {
    const recognitionPath = '$.recognition';
    for (const key of ['idleSound', 'chargeSound']) {
      if (!Object.hasOwn(recognition, key)) continue;
      addReferenceIssue(issues, assets, recognition[key], 'sound', `${recognitionPath}.${key}`);
    }
    const preview = (recognition.preview ?? {}) as Record<string, unknown>;
    const previewControls = (preview.controls ?? {}) as Record<string, unknown>;
    const mirroringControl = (previewControls.mirroring ?? {}) as Record<string, unknown>;
    const mirroringAssets = (mirroringControl.assets ?? {}) as Record<string, unknown>;
    const cameraMenuControl = (previewControls.cameraMenu ?? {}) as Record<string, unknown>;
    const controlAssetReferences: Array<[string, unknown]> = [
      [
        `${recognitionPath}.preview.controls.mirroring.assets.showMirrored`,
        mirroringAssets.showMirrored,
      ],
      [
        `${recognitionPath}.preview.controls.mirroring.assets.showUnmirrored`,
        mirroringAssets.showUnmirrored,
      ],
      [`${recognitionPath}.preview.controls.cameraMenu.buttonAsset`, cameraMenuControl.buttonAsset],
    ];
    for (const [path, id] of controlAssetReferences) {
      if (typeof id !== 'string') continue;
      addReferenceIssue(issues, assets, id, 'image', path);
      const asset = (assets[String(id)] ?? {}) as Record<string, unknown>;
      if (asset.loading === 'lazy') {
        issues.push({
          code: 'K4-PREVIEW-CONTROL-ASSET-001',
          path,
          message: `Camera preview control asset ${diagnosticValue(id)} must use eager loading`,
        });
      }
    }
  }

  for (const [branchId, rules] of Object.entries(branches)) {
    if (!Object.hasOwn(rules.at(-1) ?? {}, 'else')) {
      issues.push({
        code: 'K4-BRANCH-001',
        path: `$.branches.${branchId}`,
        message: 'The final branch rule must be else',
      });
    }
    rules.forEach((rule, index) => {
      addReferenceIssue(
        issues,
        scenes,
        rule.goto ?? rule.else,
        undefined,
        `$.branches.${branchId}[${index}]`,
      );
    });
  }

  for (const [sceneId, scene] of Object.entries(scenes)) {
    const sceneRecord = Array.isArray(scene) ? null : (scene as Record<string, unknown>);
    const sceneRecognitionModel = sceneRecord?.recognitionModel;
    if (!Array.isArray(scene)) {
      if (sceneRecord?.recognitionModel) {
        addReferenceIssue(
          issues,
          assets,
          sceneRecognitionModel,
          'recognitionModel',
          `${propertyPath('$.scenes', sceneId)}.recognitionModel`,
        );
      }
    }

    let usesPoseRecognition = false;
    const scenePath = propertyPath('$.scenes', sceneId);
    const actionBasePath = Array.isArray(scene) ? scenePath : `${scenePath}.actions`;
    sceneActions(scene).forEach((action, actionIndex) => {
      // A validated action carries exactly one command key.
      const [key = ''] = Object.keys(action);
      const value = action[key];
      const actionPath = `${actionBasePath}[${actionIndex}][${JSON.stringify(key)}]`;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const stableId = (value as Record<string, unknown>).stableId;
        if (typeof stableId === 'string') {
          const previousPath = stableIds.get(stableId);
          if (previousPath) {
            issues.push({
              code: 'K4-STABLE-ID-001',
              path: `${actionPath}.stableId`,
              message: `stableId ${stableId} is already used at ${previousPath}`,
            });
          } else {
            stableIds.set(stableId, `${actionPath}.stableId`);
          }
        }
      }

      if (key === 'stage') {
        addReferenceIssue(issues, assets, actionArgument(action, key), 'backdrop', actionPath);
      } else if (key === 'video' || key === 'audio') {
        const video = value as Record<string, unknown>;
        if (typeof video.asset === 'string') {
          addReferenceIssue(
            issues,
            assets,
            video.asset,
            key === 'audio' ? 'sound' : 'video',
            `${actionPath}.asset`,
          );
        }
        if (video.url !== undefined && !isDsl4VideoUrl(video.url)) {
          issues.push({
            code: key === 'audio' ? 'K4-AUDIO-SOURCE' : 'K4-VIDEO-SOURCE',
            path: `${actionPath}.url`,
            message: `${key} URL must be an HTTP(S) media URL without credentials`,
          });
        }
      } else if (key === 'bgm' || key === 'sound') {
        addReferenceIssue(issues, assets, actionArgument(action, key), 'sound', actionPath);
      } else if (key === 'goto') {
        addReferenceIssue(issues, scenes, actionArgument(action, key), undefined, actionPath);
      } else if (key === 'branch') {
        addReferenceIssue(issues, branches, actionArgument(action, key), undefined, actionPath);
      } else if (
        key === 'keyInputToChangeScene' ||
        key === 'touchInputToChangeScene' ||
        key === 'poseInputToChangeScene' ||
        key === 'imageInputToChangeScene'
      ) {
        const argumentRecord = value as Record<string, unknown>;
        const routes = argumentRecord.routes ?? (argumentRecord as Record<string, string>);
        for (const [route, destination] of Object.entries(routes)) {
          if (key === 'keyInputToChangeScene') storyInputCodes.set(route, `${actionPath}.${route}`);
          addReferenceIssue(issues, scenes, destination, undefined, `${actionPath}.${route}`);
        }
        if (key === 'poseInputToChangeScene' || key === 'imageInputToChangeScene') {
          usesPoseRecognition = true;
        }
      } else if (key.includes('.')) {
        const separator = key.lastIndexOf('.');
        const actor = key.slice(0, separator);
        const opcode = key.slice(separator + 1);
        if (!Object.hasOwn(actors, actor)) {
          issues.push({code: 'K4-REF-001', path: actionPath, message: `Unknown actor: ${actor}`});
        }
        const text = (value as Record<string, unknown>)?.text;
        if (['say', 'think', 'setText'].includes(opcode) && isDsl4TextInterpolation(text)) {
          try {
            const declared = (story.variables ?? {}) as Record<string, unknown>;
            // Source validation checks references and the literal part of the size budget. Values
            // are resolved and checked against the same budget only when this action is entered.
            evaluateDsl4TextInterpolation(text, (name) =>
              Object.hasOwn(declared, name) ? '' : undefined,
            );
          } catch (error) {
            issues.push({
              code: 'K4-TEXT-INTERPOLATION-001',
              path: `${actionPath}.text`,
              message: (error as Error).message,
            });
          }
        }
        if (opcode === 'show' || opcode === 'setSkin') {
          const valueRecord = value as Record<string, unknown>;
          const skin = opcode === 'show' ? valueRecord.skin : (valueRecord.skin ?? value);
          addReferenceIssue(issues, assets, skin, 'costume', `${actionPath}.skin`);
          if (
            typeof skin === 'string' &&
            Object.hasOwn(assets, skin) &&
            assetKind(assets[skin]).target !== actor
          ) {
            issues.push({
              code: 'K4-REF-003',
              path: `${actionPath}.skin`,
              message: `Costume ${diagnosticValue(skin)} must target actor ${diagnosticValue(actor)}`,
            });
          }
        } else if (opcode === 'loop') {
          const steps = (value as Record<string, unknown>).steps as {
            skin: string;
            seconds: number;
          }[];
          steps.forEach((step, stepIndex) => {
            addReferenceIssue(
              issues,
              assets,
              step.skin,
              'costume',
              `${actionPath}.steps[${stepIndex}].skin`,
            );
            if (
              typeof step.skin === 'string' &&
              Object.hasOwn(assets, step.skin) &&
              assetKind(assets[step.skin]).target !== actor
            ) {
              issues.push({
                code: 'K4-REF-003',
                path: `${actionPath}.steps[${stepIndex}].skin`,
                message: `Costume ${diagnosticValue(step.skin)} must target actor ${diagnosticValue(actor)}`,
              });
            }
          });
        } else if (opcode === 'setText') {
          const style = (value as Record<string, unknown>).style;
          addReferenceIssue(issues, textStyles, style, undefined, `${actionPath}.style`);
        } else if (opcode === 'say' || opcode === 'think') {
          const speech = value as Record<string, unknown>;
          addReferenceIssue(
            issues,
            bubbleClosePolicies,
            speech.closePolicy,
            undefined,
            `${actionPath}.closePolicy`,
          );
          const styleIds = Array.isArray(speech.styles) ? (speech.styles as string[]) : [];
          styleIds.forEach((styleId, styleIndex) =>
            addReferenceIssue(
              issues,
              bubbleStyles,
              styleId,
              undefined,
              `${actionPath}.styles[${styleIndex}]`,
            ),
          );
          if (styleIds.every((styleId) => Object.hasOwn(bubbleStyles, styleId))) {
            let effectivePresentation;
            try {
              effectivePresentation = composeBubbleStyles(styleIds, bubbleStyles);
            } catch {
              effectivePresentation = null;
            }
            if (effectivePresentation) {
              for (const field of speechPresentationFields) {
                if (Object.hasOwn(speech, field)) effectivePresentation[field] = speech[field];
              }
              validateSpeechPresentation(issues, effectivePresentation, actionPath);
              if (
                Object.hasOwn(effectivePresentation, 'reveal') &&
                speechPresentationFields.some((field) =>
                  Object.hasOwn(effectivePresentation, field),
                )
              ) {
                issues.push({
                  code: 'K4-SPEECH-STYLE-002',
                  path: `${actionPath}.styles`,
                  message:
                    'Bubble reveal cannot be combined with legacy character presentation fields',
                });
              }
              if (
                Object.hasOwn(speech, 'startSound') &&
                typeof effectivePresentation.audio === 'object' &&
                effectivePresentation.audio !== null &&
                Object.hasOwn(effectivePresentation.audio, 'voice')
              ) {
                issues.push({
                  code: 'K4-SPEECH-STYLE-002',
                  path: `${actionPath}.startSound`,
                  message: 'startSound cannot be combined with Bubble audio.voice',
                });
              }
            }
          }
          for (const field of ['startSound', 'characterSound']) {
            addReferenceIssue(issues, assets, speech[field], 'sound', `${actionPath}.${field}`);
          }
        } else if (opcode === 'pose') {
          usesPoseRecognition = true;
          const steps = (value as Record<string, unknown>).steps as {
            pose: string;
            skin?: string;
            sound?: string;
          }[];
          steps.forEach((step, stepIndex) => {
            addReferenceIssue(
              issues,
              assets,
              step.skin,
              'costume',
              `${actionPath}.steps[${stepIndex}].skin`,
            );
            if (
              typeof step.skin === 'string' &&
              Object.hasOwn(assets, step.skin) &&
              assetKind(assets[step.skin]).target !== actor
            ) {
              issues.push({
                code: 'K4-REF-003',
                path: `${actionPath}.steps[${stepIndex}].skin`,
                message: `Costume ${diagnosticValue(step.skin)} must target actor ${diagnosticValue(actor)}`,
              });
            }
            addReferenceIssue(
              issues,
              assets,
              step.sound,
              'sound',
              `${actionPath}.steps[${stepIndex}].sound`,
            );
          });
        } else if (!isDsl4ActorCoreSourceAction(opcode, value)) {
          const registration = customActions.get(opcode);
          if (!registration) {
            issues.push({
              code: 'K4-COMMAND-UNSUPPORTED',
              path: actionPath,
              message: `Custom action ${opcode} is not registered`,
            });
            return;
          }
          const customAction = value as Record<string, unknown>;
          const customArguments = (customAction.arguments ?? {}) as Record<string, unknown>;
          const parameters = new Map(
            registration.parameters.map((parameter) => [parameter.name, parameter]),
          );
          for (const [name, argument] of Object.entries(customArguments)) {
            const parameter = parameters.get(name);
            if (!parameter) {
              issues.push({
                code: 'K4-SCHEMA-UNKNOWN-KEY',
                path: `${actionPath}.arguments.${name}`,
                message: `Custom action ${opcode} has no parameter named ${name}`,
              });
            } else if (typeof argument !== parameter.type) {
              issues.push({
                code: 'K4-SCHEMA-001',
                path: `${actionPath}.arguments.${name}`,
                message: `Custom action ${opcode} parameter ${name} must be ${parameter.type}`,
              });
            }
          }
          for (const parameter of registration.parameters) {
            if (parameter.required && !Object.hasOwn(customArguments, parameter.name)) {
              issues.push({
                code: 'K4-SCHEMA-001',
                path: `${actionPath}.arguments`,
                message: `Custom action ${opcode} requires parameter ${parameter.name}`,
              });
            }
          }
        }
      }
    });
    if (usesPoseRecognition && typeof sceneRecognitionModel !== 'string') {
      issues.push({
        code: 'K4-POSE-MODEL-001',
        path: scenePath,
        message:
          'A scene with recognition actions must use the long form and declare recognitionModel',
      });
    }
  }

  const controls = story.controls as Record<string, unknown> | undefined;
  const keymaps = ((controls?.keymaps as Record<string, unknown> | undefined) ?? {}) as Record<
    string,
    Record<string, string>
  >;
  for (const [profile, keymap] of Object.entries(keymaps)) {
    for (const code of Object.keys(keymap)) {
      if (storyInputCodes.has(code)) {
        issues.push({
          code: 'K4-KEY-001',
          path: `$.controls.keymaps.${profile}.${code}`,
          message: `Key ${code} conflicts with story input at ${storyInputCodes.get(code)}`,
        });
      }
    }
  }

  return issues;
}
