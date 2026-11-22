// Name: Kamishibai Runtime
// ID: kubohiroyakamishibairuntime
// Description: Validate kamishibai scripts and show fatal errors on the TurboWarp stage.
// By: Hiroya Kubo
// License: MPL-2.0

/* global Scratch */

(function (Scratch) {
  'use strict';

  const extensionId = 'kubohiroyakamishibairuntime';
  const currentVersion = '3.2';
  const supportedVersions = ['3.1', currentVersion];
  const legacyTextWarningCode = 'LEGACY_TEXT_ASSET_DEPRECATED';
  const featureFlagName = 'featureDetailedScriptErrors';
  const promptSpriteName = 'prompt';
  const errorVariablePrefix = 'kamishibaiError';
  const errorVariableNames = ['Category', 'Code', 'Column', 'Line', 'Message', 'Source', 'Svg'];

  const dsl32Contract = {
    commands: new Map([
      ['kamishibai', {kind: 'version'}],
      ['asset', {kind: 'assetDeclaration'}],
      ['actor', {kind: 'actorDeclaration'}],
      ['cover', {kind: 'cover'}],
      ['setRuntimeVariable', {kind: 'pass'}],
      ['registerBranch', {kind: 'branchDeclaration'}],
      ['setLoadingBackdrop', {kind: 'singleAssetReference'}],
      ['setLoadingCostume', {kind: 'assetListReference'}],
      ['setPoseRecognitionSound', {kind: 'assetListReference'}],
      ['text', {kind: 'textReference'}],
      ['textStyle', {kind: 'textReference'}],
      ['svgTextStyle', {kind: 'pass'}],
      ['sceneLabel', {kind: 'sceneDeclaration'}],
      ['TMPoseURL', {kind: 'pass'}],
      ['action', {kind: 'action'}],
    ]),
    globalActions: new Map([
      ['stage', {singleAssetReferences: [1]}],
      ['wait', {}],
      ['bgm', {singleAssetReferences: [1]}],
      ['sound', {singleAssetReferences: [1]}],
      ['text', {singleAssetReferences: [1]}],
      ['transition', {transitionIndex: 1}],
      ['branch', {branchReferenceIndex: 1}],
      ['keyInputToChangeScene', {sceneListReferenceIndexes: [2]}],
      ['touchInputToChangeScene', {sceneListReferenceIndexes: [2]}],
    ]),
    actorActions: new Map([
      ['show', {showSkinReference: true}],
      ['hide', {}],
      ['say', {}],
      ['think', {}],
      ['setText', {}],
      ['setSkin', {singleAssetReferences: [2]}],
      ['setScale', {}],
      ['setPosition', {}],
      ['moveTo', {}],
      ['setLayer', {}],
      ['loop', {assetListReferenceIndexes: [2]}],
      ['sequence', {assetListReferenceIndexes: [2]}],
      ['pose', {assetListReferenceIndexes: [2, 4]}],
    ]),
    transitions: new Set(['fadeFromWhite', 'fadeOut', 'fadeToWhite', 'fadeUp', 'reset']),
  };

  const categoryLabels = {
    ja: {
      'asset-address': 'アセット参照先',
      'expression-syntax': '条件式の文法',
      'internal-error': '内部エラー',
      'invalid-command': 'コマンド形式',
      'undefined-asset': '未定義アセット',
      'undefined-branch': '未定義分岐',
      'undefined-scene': '未定義シーン',
      'unsupported-action': '非対応アクション',
      'unsupported-command': '非対応コマンド',
      'unsupported-version': '非対応バージョン',
    },
    en: {
      'asset-address': 'Asset address',
      'expression-syntax': 'Expression syntax',
      'internal-error': 'Internal error',
      'invalid-command': 'Command format',
      'undefined-asset': 'Undefined asset',
      'undefined-branch': 'Undefined branch',
      'undefined-scene': 'Undefined scene',
      'unsupported-action': 'Unsupported action',
      'unsupported-command': 'Unsupported command',
      'unsupported-version': 'Unsupported version',
    },
  };

  const diagnosticMessages = {
    unsupportedVersion: {
      ja: ({actual, supported}) =>
        `kamishibai=${actual} には対応していません。対応バージョンは ${supported.join('、')} です。`,
      en: ({actual, supported}) =>
        `kamishibai=${actual} is not supported. This app supports versions ${supported.join(
          ' and ',
        )}.`,
    },
    invalidCommand: {
      ja: () => 'コマンドは「キー=値」の形式で記述してください。',
      en: () => 'Write the command in key=value form.',
    },
    unsupportedCommand: {
      ja: ({command}) => `コマンド「${command}」には対応していません。`,
      en: ({command}) => `The command "${command}" is not supported.`,
    },
    assetDefinitionFormat: {
      ja: () => 'assetにはアセット名とリソース識別子をカンマ区切りで指定してください。',
      en: () => 'asset must contain an asset name and resource identifier separated by a comma.',
    },
    invalidAssetAddress: {
      ja: ({asset, detail, label, type}) =>
        `アセット「${asset}」の参照先が見つからないか無効です（${type}: ${label}）。${detail}`,
      en: ({asset, detail, label, type}) =>
        `The address for asset "${asset}" is missing or invalid (${type}: ${label}). ${detail}`,
    },
    undefinedAsset: {
      ja: ({asset, usage}) => `${usage}で参照されたアセット「${asset}」は定義されていません。`,
      en: ({asset, usage}) => `The asset "${asset}" referenced by ${usage} is not defined.`,
    },
    undefinedActor: {
      ja: ({actor}) => `アクション対象「${actor}」はactorで定義されていません。`,
      en: ({actor}) => `The action target "${actor}" is not defined by actor.`,
    },
    unsupportedAction: {
      ja: ({action}) => `アクションコマンド「${action}」には対応していません。`,
      en: ({action}) => `The action command "${action}" is not supported.`,
    },
    unsupportedTransition: {
      ja: ({transition}) => `トランジション「${transition}」には対応していません。`,
      en: ({transition}) => `The transition "${transition}" is not supported.`,
    },
    undefinedScene: {
      ja: ({scene}) => `遷移先のシーンラベル「${scene}」は定義されていません。`,
      en: ({scene}) => `The destination scene label "${scene}" is not defined.`,
    },
    undefinedBranch: {
      ja: ({branch}) => `分岐「${branch}」はregisterBranchで定義されていません。`,
      en: ({branch}) => `The branch "${branch}" is not defined by registerBranch.`,
    },
    expressionSyntax: {
      ja: ({branch, expression}) =>
        `分岐「${branch}」の条件式「${expression}」に文法エラーがあります。`,
      en: ({branch, expression}) =>
        `The condition "${expression}" in branch "${branch}" has a syntax error.`,
    },
    dependencyUnavailable: {
      ja: ({dependency}) => `${dependency}の検証APIを利用できません。`,
      en: ({dependency}) => `The validation API from ${dependency} is unavailable.`,
    },
    invalidDependencyResult: {
      ja: ({dependency}) => `${dependency}の検証APIが不正な結果を返しました。`,
      en: ({dependency}) => `The validation API from ${dependency} returned an invalid result.`,
    },
    internalError: {
      ja: () => '台本の検証中に予期しない内部エラーが発生しました。',
      en: () => 'An unexpected internal error occurred while validating the script.',
    },
  };

  class ScriptDiagnosticError extends Error {
    constructor(diagnostic) {
      super(diagnostic.code);
      this.name = 'ScriptDiagnosticError';
      this.diagnostic = diagnostic;
    }
  }

  function createDiagnostic({
    args = {},
    category,
    code,
    column = 1,
    command,
    messageKey,
    technicalDetail = '',
  }) {
    return {
      severity: 'fatal',
      code,
      category,
      phase: 'preflight',
      messageKey,
      args,
      source: {
        line: command?.lineNumber ?? 0,
        column,
        text: command?.sourceLine ?? '',
      },
      technicalDetail,
    };
  }

  function raiseDiagnostic(options) {
    throw new ScriptDiagnosticError(createDiagnostic(options));
  }

  function formatDiagnosticMessage(diagnostic, locale) {
    const message = diagnosticMessages[diagnostic.messageKey];
    const formatter = message?.[locale] ?? message?.en;
    return formatter ? formatter(diagnostic.args) : diagnostic.code;
  }

  function splitList(value) {
    return String(value ?? '')
      .split(',')
      .map((item) => item.trim());
  }

  function parseCommands(script) {
    const commands = [];
    const lines = String(script ?? '').split(/\r\n|\n|\r/u);
    for (const [index, sourceLine] of lines.entries()) {
      const line = sourceLine.trim();
      if (!line || line.startsWith('#') || line === '---') continue;
      const separatorIndex = line.indexOf('=');
      if (separatorIndex < 1) {
        raiseDiagnostic({
          category: 'invalid-command',
          code: 'K32-COMMAND-001',
          messageKey: 'invalidCommand',
          command: {lineNumber: index + 1, sourceLine},
        });
      }
      commands.push({
        key: line.slice(0, separatorIndex).trim(),
        lineNumber: index + 1,
        sourceLine,
        value: line.slice(separatorIndex + 1).trim(),
      });
    }
    return commands;
  }

  function isLegacyTextResourceId(value) {
    const resourceId = String(value ?? '')
      .trim()
      .toLowerCase();
    return resourceId === 'text' || resourceId.startsWith('text:');
  }

  function isAppShellTextName(value) {
    return String(value ?? '')
      .trim()
      .startsWith('ui.');
  }

  function collectLegacyTextUsage(script) {
    const assetNames = new Set();
    const referencedNames = new Set();
    const lines = String(script ?? '').split(/\r\n|\n|\r/u);
    for (const sourceLine of lines) {
      const line = sourceLine.trim();
      if (!line || line.startsWith('#') || line === '---') continue;
      const separatorIndex = line.indexOf('=');
      if (separatorIndex < 1) continue;
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (key === 'asset') {
        const parts = value.split(',');
        const name = parts.shift()?.trim() ?? '';
        const resourceId = parts.join(',');
        if (name && isLegacyTextResourceId(resourceId)) assetNames.add(name);
      } else if (key === 'text' || key === 'textStyle') {
        const name = value.split(':', 1)[0]?.trim() ?? '';
        if (name && !isAppShellTextName(name)) referencedNames.add(name);
      } else if (key === 'action') {
        const parts = value.split(':');
        if (parts[0]?.trim() === 'text') {
          const name = parts[1]?.trim() ?? '';
          if (name) referencedNames.add(name);
        }
      }
    }
    return {
      assetNames,
      names: new Set([...assetNames, ...referencedNames]),
    };
  }

  function readDeclaredVersion(script) {
    for (const sourceLine of String(script ?? '').split(/\r\n|\n|\r/u)) {
      const line = sourceLine.trim();
      if (!line || line.startsWith('#') || line === '---') continue;
      const separatorIndex = line.indexOf('=');
      if (separatorIndex < 1) continue;
      if (line.slice(0, separatorIndex).trim() === 'kamishibai') {
        return line.slice(separatorIndex + 1).trim();
      }
    }
    return '';
  }

  function validateVersion(script, commands) {
    const versionCommand = commands.find((command) => command.key === 'kamishibai');
    if (supportedVersions.includes(versionCommand?.value)) return;
    const actual = versionCommand?.value || '(missing)';
    raiseDiagnostic({
      args: {actual, supported: supportedVersions},
      category: 'unsupported-version',
      code: 'K32-VERSION-001',
      messageKey: 'unsupportedVersion',
      command: versionCommand ?? {
        lineNumber: 1,
        sourceLine: String(script ?? '').split(/\r\n|\n|\r/u)[0] ?? '',
      },
    });
  }

  function validateCommandNames(commands) {
    for (const command of commands) {
      if (dsl32Contract.commands.has(command.key)) continue;
      raiseDiagnostic({
        args: {command: command.key},
        category: 'unsupported-command',
        code: 'K32-COMMAND-002',
        messageKey: 'unsupportedCommand',
        command,
      });
    }
  }

  function parseScalarResult(value, dependency, command) {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      if (parsed && typeof parsed === 'object' && typeof parsed.ok === 'boolean') {
        return parsed;
      }
    } catch (error) {
      raiseDiagnostic({
        args: {dependency},
        category: 'internal-error',
        code: 'K32-INTERNAL-001',
        messageKey: 'invalidDependencyResult',
        technicalDetail: error instanceof Error ? error.message : String(error),
        command,
      });
    }
    raiseDiagnostic({
      args: {dependency},
      category: 'internal-error',
      code: 'K32-INTERNAL-001',
      messageKey: 'invalidDependencyResult',
      technicalDetail: `Unexpected result: ${String(value)}`,
      command,
    });
  }

  function callValidationApi(runtime, opcode, args, dependency, command) {
    const validate = runtime.getOpcodeFunction?.(opcode);
    if (!validate) {
      raiseDiagnostic({
        args: {dependency},
        category: 'internal-error',
        code: 'K32-INTERNAL-001',
        messageKey: 'dependencyUnavailable',
        command,
      });
    }
    try {
      return parseScalarResult(
        validate(args, {runtime, target: runtime.getTargetForStage()}),
        dependency,
        command,
      );
    } catch (error) {
      if (error instanceof ScriptDiagnosticError) throw error;
      raiseDiagnostic({
        args: {dependency},
        category: 'internal-error',
        code: 'K32-INTERNAL-001',
        messageKey: 'invalidDependencyResult',
        technicalDetail: error instanceof Error ? error.message : String(error),
        command,
      });
    }
  }

  function parseAsset(command, runtime) {
    const separatorIndex = command.value.indexOf(',');
    if (separatorIndex < 0) {
      raiseDiagnostic({
        category: 'asset-address',
        code: 'K32-ASSET-ADDRESS-001',
        messageKey: 'assetDefinitionFormat',
        command,
      });
    }
    const name = command.value.slice(0, separatorIndex).trim();
    const address = command.value.slice(separatorIndex + 1).trim();
    const result = callValidationApi(
      runtime,
      'kubohiroyaassetcache_validateProjectAssetAddress',
      {NAME: name, RESOURCE_ID: address},
      'Asset Cache',
      command,
    );
    if (!result.ok) {
      const detail = String(result.message ?? '').trim();
      raiseDiagnostic({
        args: {
          asset: name || '(empty)',
          detail,
          label: String(result.label ?? (address || '(empty)')),
          type: String(result.type ?? 'resource-id'),
        },
        category: 'asset-address',
        code: 'K32-ASSET-ADDRESS-001',
        messageKey: 'invalidAssetAddress',
        technicalDetail: detail,
        command,
      });
    }
    return name;
  }

  function requireAsset(assets, name, command, usage) {
    const normalizedName = String(name ?? '').trim();
    if (normalizedName && assets.has(normalizedName)) return;
    raiseDiagnostic({
      args: {asset: normalizedName || '(empty)', usage},
      category: 'undefined-asset',
      code: 'K32-ASSET-REF-001',
      messageKey: 'undefinedAsset',
      command,
    });
  }

  function requireAssets(assets, names, command, usage) {
    for (const name of splitList(names)) {
      if (name) requireAsset(assets, name, command, usage);
    }
  }

  function parseBranch(command) {
    const [name = '', conditions = '', labels = ''] = command.value.split(':');
    return {
      command,
      conditions: splitList(conditions),
      labels: splitList(labels),
      name: name.trim(),
    };
  }

  function expressionColumn(command, expression, position) {
    const expressionIndex = command.sourceLine.indexOf(expression);
    return expressionIndex < 0 ? 1 : expressionIndex + Math.max(0, position) + 1;
  }

  function validateExpression(runtime, expression, branch) {
    const result = callValidationApi(
      runtime,
      'kubohiroyaruntimeexpression_validateConditionSyntax',
      {EXPRESSION: expression},
      'Runtime Expression',
      branch.command,
    );
    if (result.ok) return;
    const position = Number.isFinite(Number(result.position)) ? Number(result.position) : 0;
    raiseDiagnostic({
      args: {branch: branch.name, expression},
      category: 'expression-syntax',
      code: 'K32-EXPRESSION-001',
      column: expressionColumn(branch.command, expression, position),
      messageKey: 'expressionSyntax',
      technicalDetail: String(result.message ?? ''),
      command: branch.command,
    });
  }

  function validateGlobalAction(command, parts, actionName, specification, context) {
    for (const index of specification.singleAssetReferences ?? []) {
      requireAsset(context.assets, parts[index], command, actionName);
    }
    for (const index of specification.sceneListReferenceIndexes ?? []) {
      context.sceneReferences.push({command, labels: splitList(parts[index])});
    }
    if (specification.branchReferenceIndex !== undefined) {
      context.branchReferences.push({
        command,
        name: parts[specification.branchReferenceIndex] ?? '',
      });
    }
    if (specification.transitionIndex !== undefined) {
      const transition = parts[specification.transitionIndex] ?? '';
      if (!dsl32Contract.transitions.has(transition)) {
        raiseDiagnostic({
          args: {transition: transition || '(empty)'},
          category: 'unsupported-action',
          code: 'K32-ACTION-001',
          messageKey: 'unsupportedTransition',
          command,
        });
      }
    }
  }

  function validateActorAction(command, parts, actionName, specification, context) {
    for (const index of specification.singleAssetReferences ?? []) {
      requireAsset(context.assets, parts[index], command, actionName);
    }
    for (const index of specification.assetListReferenceIndexes ?? []) {
      requireAssets(context.assets, parts[index], command, actionName);
    }
    if (specification.showSkinReference && parts.length >= 4) {
      requireAsset(context.assets, parts[2], command, actionName);
    }
  }

  function validateAction(command, context) {
    const parts = command.value.split(':').map((part) => part.trim());
    const targetOrCommand = parts[0] ?? '';
    const globalSpecification = dsl32Contract.globalActions.get(targetOrCommand);
    if (globalSpecification) {
      validateGlobalAction(command, parts, targetOrCommand, globalSpecification, context);
      return;
    }

    const actorTargets = splitList(targetOrCommand);
    const undefinedActor = actorTargets.find((name) => name !== '*' && !context.actors.has(name));
    if (undefinedActor) {
      raiseDiagnostic({
        args: {actor: undefinedActor},
        category: 'unsupported-action',
        code: 'K32-ACTION-001',
        messageKey: 'undefinedActor',
        command,
      });
    }
    const actionName = parts[1] ?? '';
    const actorSpecification = dsl32Contract.actorActions.get(actionName);
    if (!actorSpecification) {
      raiseDiagnostic({
        args: {action: actionName || '(empty)'},
        category: 'unsupported-action',
        code: 'K32-ACTION-001',
        messageKey: 'unsupportedAction',
        command,
      });
    }
    validateActorAction(command, parts, actionName, actorSpecification, context);
  }

  function validateReferences(context) {
    for (const {command, labels} of context.sceneReferences) {
      for (const label of labels) {
        if (!label || context.scenes.has(label)) continue;
        raiseDiagnostic({
          args: {scene: label},
          category: 'undefined-scene',
          code: 'K32-SCENE-REF-001',
          messageKey: 'undefinedScene',
          command,
        });
      }
    }
    for (const reference of context.branchReferences) {
      if (context.branches.has(reference.name)) continue;
      raiseDiagnostic({
        args: {branch: reference.name || '(empty)'},
        category: 'undefined-branch',
        code: 'K32-BRANCH-REF-001',
        messageKey: 'undefinedBranch',
        command: reference.command,
      });
    }
    for (const branch of context.branches.values()) {
      for (const expression of branch.conditions) {
        if (expression) validateExpression(context.runtime, expression, branch);
      }
      for (const label of branch.labels) {
        if (!label || context.scenes.has(label)) continue;
        raiseDiagnostic({
          args: {scene: label},
          category: 'undefined-scene',
          code: 'K32-SCENE-REF-001',
          messageKey: 'undefinedScene',
          command: branch.command,
        });
      }
    }
  }

  function collectDeclarations(commands, runtime) {
    const context = {
      actors: new Set(),
      assets: new Set(),
      branches: new Map(),
      branchReferences: [],
      runtime,
      sceneReferences: [],
      scenes: new Set(),
    };
    for (const command of commands) {
      const kind = dsl32Contract.commands.get(command.key).kind;
      if (kind === 'assetDeclaration') {
        context.assets.add(parseAsset(command, runtime));
      } else if (kind === 'actorDeclaration') {
        context.actors.add(splitList(command.value)[0]);
      } else if (kind === 'sceneDeclaration') {
        context.scenes.add(command.value);
      } else if (kind === 'branchDeclaration') {
        const branch = parseBranch(command);
        context.branches.set(branch.name, branch);
      }
    }
    return context;
  }

  function validateCommandReferences(commands, context) {
    for (const command of commands) {
      const kind = dsl32Contract.commands.get(command.key).kind;
      if (kind === 'actorDeclaration') {
        requireAsset(context.assets, splitList(command.value)[1], command, 'actor');
      } else if (kind === 'cover') {
        const [backdrop, sound] = splitList(command.value);
        requireAsset(context.assets, backdrop, command, 'cover');
        if (sound) requireAsset(context.assets, sound, command, 'cover');
      } else if (kind === 'singleAssetReference') {
        requireAsset(context.assets, command.value, command, command.key);
      } else if (kind === 'assetListReference') {
        requireAssets(context.assets, command.value, command, command.key);
      } else if (kind === 'action') {
        validateAction(command, context);
      }
    }
  }

  function validateScript(script, runtime) {
    const commands = parseCommands(script);
    validateVersion(script, commands);
    validateCommandNames(commands);
    const context = collectDeclarations(commands, runtime);
    validateCommandReferences(commands, context);
    validateReferences(context);
  }

  function escapeXml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }

  function wrapText(value, maximumLength = 43) {
    const characters = Array.from(String(value));
    const lines = [];
    while (characters.length > 0) {
      lines.push(characters.splice(0, maximumLength).join(''));
    }
    return lines.length > 0 ? lines : [''];
  }

  function createErrorSvg(diagnostic, locale) {
    const isJapanese = locale === 'ja';
    const message = formatDiagnosticMessage(diagnostic, locale);
    const category = categoryLabels[locale][diagnostic.category] ?? diagnostic.category;
    const location =
      diagnostic.source.line > 0
        ? isJapanese
          ? `${diagnostic.source.line}行目 ${diagnostic.source.column}列`
          : `line ${diagnostic.source.line}, column ${diagnostic.source.column}`
        : isJapanese
          ? '不明'
          : 'unknown';
    const lines = [
      `${isJapanese ? '種類' : 'Type'}: ${category}`,
      `${isJapanese ? '位置' : 'Location'}: ${location}`,
      `${isJapanese ? 'コード' : 'Code'}: ${diagnostic.code}`,
      ...wrapText(`${isJapanese ? '内容' : 'Message'}: ${message}`),
      ...wrapText(`${isJapanese ? '該当行' : 'Source'}: ${diagnostic.source.text || '(none)'}`),
    ].slice(0, 11);
    const body = lines
      .map(
        (line, index) =>
          `<text x="28" y="${92 + index * 22}" class="body">${escapeXml(line)}</text>`,
      )
      .join('');
    const title = isJapanese
      ? '台本エラー — 処理を中断しました'
      : 'Script error — execution stopped';
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">',
      '<rect width="480" height="360" rx="12" fill="#24070d"/>',
      '<rect x="10" y="10" width="460" height="340" rx="8" fill="none" stroke="#ff6b7a" stroke-width="3"/>',
      '<style>.title{font:700 24px sans-serif;fill:#fff}.body{font:16px sans-serif;fill:#ffecef}</style>',
      `<text x="28" y="52" class="title">${escapeXml(title)}</text>`,
      body,
      '</svg>',
    ].join('');
  }

  function contractSnapshot() {
    return {
      commands: [...dsl32Contract.commands.keys()],
      globalActions: [...dsl32Contract.globalActions.keys()],
      actorActions: [...dsl32Contract.actorActions.keys()],
      transitions: [...dsl32Contract.transitions],
    };
  }

  class KamishibaiRuntimeExtension {
    constructor() {
      this.runtime = Scratch.vm.runtime;
      this.renderer = this.runtime.renderer;
      this.featureEnabled = null;
      this.lastDiagnostic = null;
      this.errorSkinId = null;
      this.usedTextFallback = false;
      this.visibilitySnapshot = null;
      this.promptTarget = null;
      this.legacyTextWarning = null;
      this.legacyTextWarningEmitted = false;
      this.legacyTextWarningEmissionCount = 0;
      this.runtime.on?.('PROJECT_START', () => this.resetForProjectStart());
    }

    getInfo() {
      return {
        id: extensionId,
        name: 'Kamishibai Runtime',
        color1: '#9B1C31',
        blocks: [
          {
            opcode: 'validateScriptOrStop',
            blockType: Scratch.BlockType.COMMAND,
            text: 'validate kamishibai script or stop',
            hideFromPalette: true,
          },
        ],
      };
    }

    getDsl32ContractJson() {
      return JSON.stringify(contractSnapshot());
    }

    getLegacyTextWarningJson() {
      return this.legacyTextWarning ? JSON.stringify(this.legacyTextWarning) : '';
    }

    getLegacyTextWarningEmissionCount() {
      return this.legacyTextWarningEmissionCount;
    }

    getLastDiagnosticJson() {
      return this.lastDiagnostic ? JSON.stringify(this.lastDiagnostic) : '';
    }

    validateScriptSource(args) {
      try {
        validateScript(String(args.SCRIPT ?? ''), this.runtime);
        return JSON.stringify({ok: true});
      } catch (error) {
        if (error instanceof ScriptDiagnosticError) {
          return JSON.stringify({ok: false, diagnostic: error.diagnostic});
        }
        return JSON.stringify({
          ok: false,
          diagnostic: createDiagnostic({
            category: 'internal-error',
            code: 'K32-INTERNAL-001',
            messageKey: 'internalError',
            technicalDetail:
              error instanceof Error ? (error.stack ?? error.message) : String(error),
          }),
        });
      }
    }

    resetForProjectStart() {
      this.clearPresentation();
      this.featureEnabled = null;
      this.lastDiagnostic = null;
      this.legacyTextWarning = null;
      this.legacyTextWarningEmitted = false;
      this.legacyTextWarningEmissionCount = 0;
      for (const name of errorVariableNames) this.deleteErrorVariable(name);
    }

    readFeatureFlag() {
      const stage = this.runtime.getTargetForStage();
      const rawValue = stage?.lookupVariableByNameAndType(featureFlagName, '')?.value;
      if (rawValue === true || rawValue === 1) return true;
      return ['1', 'on', 'true'].includes(
        String(rawValue ?? '')
          .trim()
          .toLowerCase(),
      );
    }

    readScript() {
      return this.runtime.ext_lmsTempVars2?.getRuntimeVariable?.({VAR: 'script'}) ?? '';
    }

    readLocale() {
      const getViewerLanguage = this.runtime.getOpcodeFunction?.('translate_getViewerLanguage');
      if (!getViewerLanguage) return 'en';
      try {
        const value = String(
          getViewerLanguage(
            {},
            {runtime: this.runtime, target: this.runtime.getTargetForStage()},
          ) ?? '',
        )
          .trim()
          .toLowerCase();
        return value === 'ja' ||
          value.startsWith('ja-') ||
          value.includes('japanese') ||
          value.includes('日本')
          ? 'ja'
          : 'en';
      } catch {
        return 'en';
      }
    }

    setErrorVariable(name, value) {
      this.runtime.ext_lmsTempVars2?.setRuntimeVariable?.({
        VAR: `${errorVariablePrefix}${name}`,
        STRING: value,
      });
    }

    deleteErrorVariable(name) {
      const temporaryVariables = this.runtime.ext_lmsTempVars2;
      const variableName = `${errorVariablePrefix}${name}`;
      if (temporaryVariables?.deleteRuntimeVariable) {
        temporaryVariables.deleteRuntimeVariable({VAR: variableName});
      } else {
        temporaryVariables?.setRuntimeVariable?.({VAR: variableName, STRING: ''});
      }
    }

    captureVisibility(layoutTarget) {
      if (this.visibilitySnapshot) return;
      this.visibilitySnapshot = new Map();
      for (const target of this.runtime.targets) {
        if (target.isStage) continue;
        this.visibilitySnapshot.set(target, {
          visible: target.visible,
          ...(target === layoutTarget
            ? {restoreLayout: true, size: target.size, x: target.x, y: target.y}
            : {}),
        });
      }
    }

    restoreVisibility() {
      if (!this.visibilitySnapshot) return;
      for (const [target, snapshot] of this.visibilitySnapshot) {
        if (snapshot.restoreLayout) {
          target.setXY?.(snapshot.x, snapshot.y);
          target.setSize?.(snapshot.size);
        }
        target.setVisible?.(snapshot.visible);
      }
      this.visibilitySnapshot = null;
    }

    restorePromptSkin() {
      const prompt = this.promptTarget;
      if (!prompt) return;
      if (this.renderer && prompt.drawableID !== null && prompt.drawableID !== undefined) {
        const costume = prompt.getCostumes?.()[prompt.currentCostume];
        if (typeof costume?.skinId === 'number') {
          this.renderer.updateDrawableSkinId(prompt.drawableID, costume.skinId);
        }
      }
      if (this.usedTextFallback) {
        const setText = this.runtime.getOpcodeFunction?.('text_setText');
        setText?.({TEXT: ''}, {runtime: this.runtime, target: prompt});
      }
      this.usedTextFallback = false;
      this.promptTarget = null;
    }

    clearPresentation() {
      this.restorePromptSkin();
      this.restoreVisibility();
      if (this.errorSkinId !== null) {
        try {
          this.renderer?.destroySkin?.(this.errorSkinId);
        } catch {
          // The renderer may already have discarded project-owned skins.
        }
        this.errorSkinId = null;
      }
    }

    storeCompatibilityValues(diagnostic, message, svg) {
      this.setErrorVariable('Category', diagnostic.category);
      this.setErrorVariable('Code', diagnostic.code);
      this.setErrorVariable('Line', diagnostic.source.line);
      this.setErrorVariable('Column', diagnostic.source.column);
      this.setErrorVariable('Message', message);
      this.setErrorVariable('Source', diagnostic.source.text);
      this.setErrorVariable('Svg', svg);
    }

    fallbackInvalidScript() {
      this.runtime.startHats?.('event_whenbroadcastreceived', {
        BROADCAST_OPTION: 'invalidScript',
      });
    }

    presentDiagnostic(diagnostic) {
      this.lastDiagnostic = diagnostic;
      this.runtime.stopAll();

      const locale = this.readLocale();
      const message = formatDiagnosticMessage(diagnostic, locale);
      const svg = createErrorSvg(diagnostic, locale);
      this.storeCompatibilityValues(diagnostic, message, svg);

      const prompt = this.runtime.targets.find(
        (target) =>
          !target.isStage && target.isOriginal && target.sprite?.name === promptSpriteName,
      );
      if (!prompt) {
        this.fallbackInvalidScript();
        return;
      }

      this.captureVisibility(prompt);
      this.promptTarget = prompt;
      for (const target of this.runtime.targets) {
        if (!target.isStage && target !== prompt) target.setVisible?.(false);
      }

      let rendered = false;
      if (this.renderer && prompt.drawableID !== null && prompt.drawableID !== undefined) {
        try {
          const previousSkinId = this.errorSkinId;
          this.errorSkinId = this.renderer.createSVGSkin(svg);
          this.renderer.updateDrawableSkinId(prompt.drawableID, this.errorSkinId);
          if (previousSkinId !== null) this.renderer.destroySkin(previousSkinId);
          rendered = true;
        } catch {
          rendered = false;
        }
      }
      if (!rendered) {
        const setText = this.runtime.getOpcodeFunction?.('text_setText');
        if (setText) {
          setText(
            {
              TEXT: `${locale === 'ja' ? '台本エラー' : 'Script error'}\n${message}\n${
                diagnostic.source.line
              }: ${diagnostic.source.text}`,
            },
            {runtime: this.runtime, target: prompt},
          );
          this.usedTextFallback = true;
        } else {
          this.fallbackInvalidScript();
        }
      }

      prompt.setXY?.(0, 0);
      prompt.setSize?.(100);
      prompt.setVisible?.(true);
      prompt.goToFront?.();
      this.runtime.requestRedraw?.();
    }

    validateScriptOrStop() {
      const script = this.readScript();
      const declaredVersion = readDeclaredVersion(script);
      const legacyTextUsage = collectLegacyTextUsage(script);
      if (supportedVersions.includes(declaredVersion) && legacyTextUsage.names.size > 0) {
        this.legacyTextWarning = {
          code: legacyTextWarningCode,
          dslVersion: declaredVersion,
          names: [...legacyTextUsage.names],
        };
        if (!this.legacyTextWarningEmitted) {
          console.warn(
            `[DSL ${declaredVersion}][${legacyTextWarningCode}] Legacy text assets remain supported during the DSL 3.2 migration period: ${[
              ...legacyTextUsage.names,
            ].join(
              ', ',
            )}. Migrate to https://github.com/kubohiroya/turbowarp-svg-text before compatibility support is removed.`,
          );
          this.legacyTextWarningEmitted = true;
          this.legacyTextWarningEmissionCount += 1;
        }
      } else {
        this.legacyTextWarning = null;
      }
      if (this.featureEnabled === null) this.featureEnabled = this.readFeatureFlag();
      if (!this.featureEnabled) return;

      const result = JSON.parse(this.validateScriptSource({SCRIPT: script}));
      if (result.ok) return;
      this.presentDiagnostic(result.diagnostic);
    }
  }

  if (!Scratch.extensions.unsandboxed) {
    throw new Error('Kamishibai Runtime must run unsandboxed.');
  }
  Scratch.extensions.register(new KamishibaiRuntimeExtension());
})(Scratch);
