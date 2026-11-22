import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';

const require = createRequire(import.meta.url);
const BlockType = require('scratch-vm/src/extension-support/block-type');
const Cast = require('scratch-vm/src/util/cast');
const bundledExtensionId = 'tmposebundle';
const bundledMemberIds = [
  'kubohiroyaassetmanager',
  'text',
  'kubohiroyakamishibairuntime',
  'kubohiroyasvgtext',
];
const assetManagerSource = readFileSync(
  new URL('../../app/extensions/kubohiroyaassetmanager.js', import.meta.url),
  'utf8',
);
const kamishibaiRuntimeSource = readFileSync(
  new URL('../../app/extensions/kubohiroyakamishibairuntime.js', import.meta.url),
  'utf8',
);
const runtimeExpressionSource = readFileSync(
  new URL('../../app/extensions/kubohiroyaruntimeexpression.js', import.meta.url),
  'utf8',
);

function block(opcode, blockType = BlockType.COMMAND, argumentNames = []) {
  return {
    opcode,
    blockType,
    text: opcode,
    arguments: Object.fromEntries(
      argumentNames.map((name) => [
        name,
        {
          type: 'string',
          defaultValue: '',
        },
      ]),
    ),
  };
}

function extensionInfo(id, blocks) {
  return {id, name: id, blocks};
}

function register(vm, id, ExtensionClass) {
  vm.extensionManager.addBuiltinExtension(id, ExtensionClass);
}

function rewriteBundledOpcode(opcode) {
  if (typeof opcode !== 'string') return opcode;
  for (const memberId of bundledMemberIds) {
    const prefix = `${memberId}_`;
    if (opcode.startsWith(prefix)) {
      return `${bundledExtensionId}_${memberId}__${opcode.slice(prefix.length)}`;
    }
  }
  return opcode;
}

function createBundledRuntime(runtime, memberId) {
  return new Proxy(runtime, {
    get(target, property) {
      if (property === 'getOpcodeFunction') {
        return (opcode, ...args) => target.getOpcodeFunction(rewriteBundledOpcode(opcode), ...args);
      }
      if (property === 'startHats') {
        return (opcode, ...args) => {
          const prefix = `${memberId}_`;
          const rewritten =
            typeof opcode === 'string' && opcode.startsWith(prefix)
              ? `${bundledExtensionId}_${memberId}__${opcode.slice(prefix.length)}`
              : opcode;
          return target.startHats(rewritten, ...args);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function createBundledVm(vm, runtime) {
  return new Proxy(vm, {
    get(target, property) {
      if (property === 'runtime') return runtime;
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function createTestBundleExtensionClass(memberDefinitions, onComponent) {
  return class TestBundleExtension {
    constructor() {
      this.components = new Map();
      for (const {ExtensionClass, id, runtime} of memberDefinitions) {
        const component = new ExtensionClass(runtime);
        this.components.set(id, component);
        onComponent(id, component);
      }
    }

    addDelegate(name, component, originalName) {
      this[name] = (...args) => component[originalName](...args);
    }

    getInfo() {
      const result = {
        id: bundledExtensionId,
        name: 'TMPose Extension Bundle',
        blocks: [],
        menus: {},
        customFieldTypes: {},
      };
      for (const memberId of bundledMemberIds) {
        const component = this.components.get(memberId);
        const info = component.getInfo();
        const namespace = `${memberId}__`;
        const customFieldTypes = info.customFieldTypes ?? {};
        for (const [fieldName, fieldInfo] of Object.entries(customFieldTypes)) {
          result.customFieldTypes[`${namespace}${fieldName}`] = fieldInfo;
        }
        for (const blockInfo of info.blocks ?? []) {
          if (blockInfo === '---') {
            result.blocks.push(blockInfo);
            continue;
          }
          const block = {...blockInfo};
          if (block.arguments) {
            block.arguments = Object.fromEntries(
              Object.entries(block.arguments).map(([argumentName, argumentInfo]) => {
                const argument = {...argumentInfo};
                if (typeof argument.menu === 'string')
                  argument.menu = `${namespace}${argument.menu}`;
                if (
                  typeof argument.type === 'string' &&
                  Object.hasOwn(customFieldTypes, argument.type)
                ) {
                  argument.type = `${namespace}${argument.type}`;
                }
                return [argumentName, argument];
              }),
            );
          }
          if (block.blockType === BlockType.LABEL) {
            result.blocks.push(block);
            continue;
          }
          if (block.blockType === BlockType.BUTTON) {
            const delegateName = `${namespace}button__${block.func}`;
            this.addDelegate(delegateName, component, block.func);
            block.func = delegateName;
            result.blocks.push(block);
            continue;
          }
          block.opcode = `${namespace}${block.opcode}`;
          if (block.blockType !== BlockType.EVENT) {
            const originalName = block.func || blockInfo.opcode;
            block.func = block.opcode;
            this.addDelegate(block.opcode, component, originalName);
          } else {
            delete block.func;
          }
          result.blocks.push(block);
        }
        for (const [menuName, menuInfo] of Object.entries(info.menus ?? {})) {
          const bundledMenuName = `${namespace}${menuName}`;
          if (typeof menuInfo === 'string') {
            const delegateName = `${namespace}menu__${menuName}`;
            this.addDelegate(delegateName, component, menuInfo);
            result.menus[bundledMenuName] = {items: delegateName};
          } else if (Array.isArray(menuInfo)) {
            result.menus[bundledMenuName] = [...menuInfo];
          } else {
            const menu = {...menuInfo};
            if (typeof menu.items === 'string') {
              const delegateName = `${namespace}menu__${menuName}`;
              this.addDelegate(delegateName, component, menu.items);
              menu.items = delegateName;
            }
            result.menus[bundledMenuName] = menu;
          }
        }
      }
      return result;
    }
  };
}

function createProductionAssetManagerClass(vm, onCreate) {
  let registeredExtension = null;
  const Scratch = {
    vm,
    extensions: {
      unsandboxed: true,
      register(extension) {
        registeredExtension = extension;
      },
    },
    BlockType,
    ArgumentType: {
      NUMBER: 'number',
      STRING: 'string',
    },
    translate(value) {
      return typeof value === 'object' && value !== null
        ? (value.default ?? value.defaultMessage ?? '')
        : value;
    },
  };
  runInNewContext(assetManagerSource, {
    AbortSignal,
    Audio: class {},
    Blob,
    console,
    fetch,
    indexedDB: {},
    performance,
    Response,
    Scratch,
    setTimeout,
    clearTimeout,
    URL,
  });
  if (!registeredExtension) {
    throw new Error('Production Asset Manager did not register itself.');
  }
  const ProductionAssetManager = registeredExtension.constructor;
  return class {
    constructor() {
      const extension = new ProductionAssetManager();
      onCreate(extension);
      return extension;
    }
  };
}

function createProductionExtensionClass(vm, source, onCreate = () => {}) {
  let registeredExtension = null;
  const Scratch = {
    vm,
    extensions: {
      unsandboxed: true,
      register(extension) {
        registeredExtension = extension;
      },
    },
    BlockType,
    ArgumentType: {
      BOOLEAN: 'Boolean',
      NUMBER: 'number',
      STRING: 'string',
    },
    Cast,
    translate(value) {
      return typeof value === 'object' && value !== null
        ? (value.default ?? value.defaultMessage ?? '')
        : value;
    },
  };
  runInNewContext(source, {console, Scratch, setTimeout, clearTimeout});
  if (!registeredExtension) throw new Error('Production extension did not register itself.');
  return class {
    constructor() {
      onCreate(registeredExtension);
      return registeredExtension;
    }
  };
}

export function registerKamishibaiTestExtensions(
  vm,
  clock,
  {
    asyncAssetDisplay = false,
    asyncExternalAssets = false,
    initialLocalStorage = {},
    productionAssetManager = false,
    productionRuntimeExpression = false,
    viewerLanguage = 'English',
  } = {},
) {
  const state = {
    actorSequences: new Map(),
    actorSkins: new Map(),
    assetManager: null,
    assetRegistrations: [],
    asyncInput: null,
    assets: new Map(),
    bubbleUpdates: [],
    consoleErrors: [],
    displayedAssets: new Map(),
    displayedAssetHistory: [],
    displayedText: new Map(),
    filePickerRequests: 0,
    keyInputBindings: new Map(),
    kamishibaiRuntime: null,
    localStorage: new Map(Object.entries(initialLocalStorage)),
    loadingAssetCount: 0,
    loadingBackdrop: '',
    loadingCostumes: [],
    openedUrls: [],
    playingSounds: new Set(),
    poseMatches: false,
    poseScore: 0,
    runtimeExpression: null,
    runtimeVariableWrites: [],
    svgText: null,
    svgTextActors: new Map(),
    svgTextBubbleUpdates: [],
    svgTextStyles: new Map(),
    timers: new Map(),
    tempVariables: null,
    textColors: new Map(),
    textFonts: new Map(),
    textOutlineColors: new Map(),
    textOutlineWidths: new Map(),
    touchInputBindings: new Map(),
    viewerLanguage,
  };
  vm.runtime.on('SAY', (target, type, text) => {
    state.bubbleUpdates.push({
      targetName: target.getName(),
      text: Cast.toString(text),
      type,
    });
  });

  class ConsoleExtension {
    getInfo() {
      return extensionInfo('sipcconsole', [
        block('Emptying'),
        block('Error', BlockType.COMMAND, ['string']),
        block('Journal', BlockType.COMMAND, ['string']),
        block('debug', BlockType.COMMAND, ['string']),
      ]);
    }
    Emptying() {}
    Error(args) {
      state.consoleErrors.push(Cast.toString(args.string));
    }
    Journal() {}
    debug() {}
  }

  class TempVariablesExtension {
    constructor(runtime) {
      this.runtimeVariables = Object.create(null);
      state.tempVariables = this;
      runtime.on('PROJECT_START', () => this.resetRuntimeVariables());
      runtime.on('PROJECT_STOP_ALL', () => this.resetRuntimeVariables());
    }
    getInfo() {
      return extensionInfo('lmsTempVars2', [
        block('setThreadVariable', BlockType.COMMAND, ['VAR', 'STRING']),
        block('changeThreadVariable', BlockType.COMMAND, ['VAR', 'NUM']),
        block('getThreadVariable', BlockType.REPORTER, ['VAR']),
        block('setRuntimeVariable', BlockType.COMMAND, ['VAR', 'STRING']),
        block('changeRuntimeVariable', BlockType.COMMAND, ['VAR', 'NUM']),
        block('getRuntimeVariable', BlockType.REPORTER, ['VAR']),
        block('runtimeVariableExists', BlockType.BOOLEAN, ['VAR']),
        block('deleteRuntimeVariable', BlockType.COMMAND, ['VAR']),
      ]);
    }
    threadVariables(util) {
      if (!util.thread.variables) {
        util.thread.variables = Object.create(null);
      }
      return util.thread.variables;
    }
    setThreadVariable(args, util) {
      this.threadVariables(util)[args.VAR] = args.STRING;
    }
    changeThreadVariable(args, util) {
      const variables = this.threadVariables(util);
      variables[args.VAR] = Cast.toNumber(variables[args.VAR]) + Cast.toNumber(args.NUM);
    }
    getThreadVariable(args, util) {
      return this.threadVariables(util)[args.VAR] ?? '';
    }
    setRuntimeVariable(args) {
      this.runtimeVariables[args.VAR] = args.STRING;
      state.runtimeVariableWrites.push({
        name: Cast.toString(args.VAR),
        value: Cast.toString(args.STRING),
      });
    }
    changeRuntimeVariable(args) {
      this.runtimeVariables[args.VAR] =
        Cast.toNumber(this.runtimeVariables[args.VAR]) + Cast.toNumber(args.NUM);
    }
    getRuntimeVariable(args) {
      return this.runtimeVariables[args.VAR] ?? '';
    }
    runtimeVariableExists(args) {
      return Object.hasOwn(this.runtimeVariables, args.VAR);
    }
    deleteRuntimeVariable(args) {
      Reflect.deleteProperty(this.runtimeVariables, args.VAR);
    }
    resetRuntimeVariables() {
      this.runtimeVariables = Object.create(null);
      state.runtimeVariableWrites.length = 0;
    }
  }

  class StringsExtension {
    getInfo() {
      return extensionInfo('strings', [
        block('count', BlockType.REPORTER, ['SUBSTRING', 'STRING']),
        block('identical', BlockType.BOOLEAN, ['OPERAND1', 'OPERAND2']),
        block('indexof', BlockType.REPORTER, ['SUBSTRING', 'STRING']),
        block('letters_of', BlockType.REPORTER, ['LETTER1', 'LETTER2', 'STRING']),
        block('menu_positions', BlockType.REPORTER),
        block('menu_trimMethod', BlockType.REPORTER),
        block('posWith', BlockType.BOOLEAN, ['STRING', 'POSITION', 'SUBSTRING']),
        block('replaceRegex', BlockType.REPORTER, ['REGEX', 'FLAGS', 'STRING', 'REPLACE']),
        block('split', BlockType.REPORTER, ['ITEM', 'STRING', 'SPLIT']),
        block('trim', BlockType.REPORTER, ['STRING', 'METHOD']),
      ]);
    }
    count(args) {
      const string = Cast.toString(args.STRING);
      const substring = Cast.toString(args.SUBSTRING);
      return substring ? string.split(substring).length - 1 : 0;
    }
    identical(args) {
      return Cast.toString(args.OPERAND1) === Cast.toString(args.OPERAND2);
    }
    indexof(args) {
      const index = Cast.toString(args.STRING).indexOf(Cast.toString(args.SUBSTRING));
      return index < 0 ? 0 : index + 1;
    }
    letters_of(args) {
      const string = Cast.toString(args.STRING);
      const first = Math.max(1, Math.trunc(Cast.toNumber(args.LETTER1)));
      const last = Math.max(first, Math.trunc(Cast.toNumber(args.LETTER2)));
      return string.slice(first - 1, last);
    }
    menu_positions(args) {
      return args.positions ?? '';
    }
    menu_trimMethod(args) {
      return args.trimMethod ?? '';
    }
    posWith(args) {
      const string = Cast.toString(args.STRING);
      const substring = Cast.toString(args.SUBSTRING);
      return args.POSITION === 'ends' ? string.endsWith(substring) : string.startsWith(substring);
    }
    replaceRegex(args) {
      return Cast.toString(args.STRING).replace(
        new RegExp(Cast.toString(args.REGEX), Cast.toString(args.FLAGS)),
        Cast.toString(args.REPLACE),
      );
    }
    split(args) {
      const parts = Cast.toString(args.STRING).split(Cast.toString(args.SPLIT));
      return parts[Math.trunc(Cast.toNumber(args.ITEM)) - 1] ?? '';
    }
    trim(args) {
      const string = Cast.toString(args.STRING);
      if (args.METHOD === 'left') return string.trimStart();
      if (args.METHOD === 'right') return string.trimEnd();
      return string.trim();
    }
  }

  class AssetManagerExtension {
    constructor(runtime) {
      this.runtime = runtime;
      const resetState = () => {
        state.actorSequences.clear();
        state.actorSkins.clear();
        state.assetRegistrations.length = 0;
        state.displayedAssets.clear();
        state.displayedAssetHistory.length = 0;
        state.loadingAssetCount = 0;
        state.loadingBackdrop = '';
        state.loadingCostumes = [];
        state.playingSounds.clear();
      };
      runtime.on('PROJECT_START', resetState);
      runtime.on('PROJECT_STOP_ALL', resetState);
    }
    getInfo() {
      return extensionInfo('kubohiroyaassetmanager', [
        block('isLoaded', BlockType.BOOLEAN, ['NAME']),
        block('playSound', BlockType.COMMAND, ['NAME']),
        block('playSoundUntilDone', BlockType.COMMAND, ['NAME']),
        block('registerAsset', BlockType.COMMAND, ['RESOURCE_ID', 'NAME']),
        block('setLoadingBackdrop', BlockType.COMMAND, ['NAME']),
        block('setLoadingCostumes', BlockType.COMMAND, ['NAMES']),
        block('prepareLoadingAssets', BlockType.COMMAND, ['LIST']),
        block('loadingAssetCount', BlockType.REPORTER),
        block('loadingBackdrop', BlockType.REPORTER),
        block('loadingCostumeAt', BlockType.REPORTER, ['INDEX']),
        block('setTextStyle', BlockType.COMMAND, ['NAME', 'PROPERTY', 'VALUE']),
        block('setTextValue', BlockType.COMMAND, ['NAME', 'VALUE']),
        block('setStageSkin', BlockType.COMMAND, ['NAME']),
        block('setThisSpriteSkin', BlockType.COMMAND, ['NAME']),
        block('startActorLoop', BlockType.COMMAND, ['ACTOR', 'ASSETS', 'DURATIONS']),
        block('startActorSequence', BlockType.COMMAND, ['ACTOR', 'ASSETS', 'DURATIONS']),
        block('finishAllActorSequences'),
        block('stopSound', BlockType.COMMAND, ['NAME']),
        block('stopAllSounds'),
      ]);
    }
    registerAsset(args) {
      const name = Cast.toString(args.NAME);
      const resourceId = Cast.toString(args.RESOURCE_ID);
      const register = () => {
        state.assetRegistrations.push(name);
        state.assets.set(name, resourceId);
      };
      if (/^https?:\/\//u.test(resourceId) && asyncExternalAssets) {
        return Promise.resolve().then(register);
      }
      register();
    }
    setLoadingCostumes(args) {
      const seen = new Set();
      state.loadingCostumes = Cast.toString(args.NAMES)
        .split(',')
        .map((name) => name.trim())
        .filter((name) => {
          if (!name || seen.has(name)) return false;
          seen.add(name);
          return true;
        });
      state.loadingAssetCount = 0;
    }
    setLoadingBackdrop(args) {
      state.loadingBackdrop = Cast.toString(args.NAME).trim();
      state.loadingAssetCount = 0;
    }
    prepareLoadingAssets(args, util) {
      const listName = Cast.toString(args.LIST).trim();
      const list = util.target.lookupVariableByNameAndType(listName, 'list');
      if (!list || !Array.isArray(list.value)) {
        throw new Error(`Loading asset list not found: ${listName || '(empty)'}`);
      }
      const priorityNames = [state.loadingBackdrop, ...state.loadingCostumes].filter(
        (name, index, values) => name && values.indexOf(name) === index,
      );
      const loadingNames = new Set(priorityNames);
      const entries = list.value.map((entry) => Cast.toString(entry));
      const declaredNames = new Set(
        entries.map((entry) => {
          const separatorIndex = entry.indexOf(',');
          return (separatorIndex < 0 ? entry : entry.slice(0, separatorIndex)).trim();
        }),
      );
      const missingNames = priorityNames.filter((name) => !declaredNames.has(name));
      if (missingNames.length > 0) {
        throw new Error(`Loading asset is not declared: ${missingNames.join(', ')}`);
      }
      const regular = [];
      const prioritized = new Map(priorityNames.map((name) => [name, []]));
      for (const entry of entries) {
        const separatorIndex = entry.indexOf(',');
        const assetName = (separatorIndex < 0 ? entry : entry.slice(0, separatorIndex)).trim();
        if (loadingNames.has(assetName)) prioritized.get(assetName).push(entry);
        else regular.push(entry);
      }
      const prioritizedEntries = priorityNames.flatMap((name) => prioritized.get(name));
      list.value.splice(0, list.value.length, ...prioritizedEntries, ...regular);
      state.loadingAssetCount = prioritizedEntries.length;
    }
    loadingAssetCount() {
      return state.loadingAssetCount;
    }
    loadingBackdrop() {
      return state.loadingBackdrop;
    }
    loadingCostumeAt(args) {
      if (state.loadingCostumes.length === 0) return '';
      const index = Math.max(1, Math.trunc(Cast.toNumber(args.INDEX)));
      return state.loadingCostumes[(index - 1) % state.loadingCostumes.length];
    }
    setTextStyle(args) {
      const name = Cast.toString(args.NAME);
      const property = Cast.toString(args.PROPERTY).trim().toLowerCase();
      state.tempVariables.setRuntimeVariable({
        VAR: `textStyle:${name}:${property}`,
        STRING: Cast.toString(args.VALUE),
      });
    }
    setTextValue(args) {
      const name = Cast.toString(args.NAME);
      const resource = state.assets.get(name);
      if (resource !== undefined && resource !== 'text' && !resource.startsWith('text:')) {
        throw new Error(`Asset is not text: ${name}`);
      }
      const explicitName = resource?.startsWith('text:')
        ? resource.slice('text:'.length).trim()
        : '';
      const value = Cast.toString(args.VALUE);
      state.tempVariables.setRuntimeVariable({
        VAR: `text:${explicitName || name}`,
        STRING: value,
      });
      for (const [targetId, displayedName] of state.displayedAssets) {
        if (displayedName === name) state.displayedText.set(targetId, value);
      }
    }
    isLoaded(args) {
      return state.assets.has(Cast.toString(args.NAME));
    }
    resolveCostumeName(name) {
      const resource = state.assets.get(Cast.toString(name)) ?? '';
      if (resource === 'backdrop' || resource === 'costume') return Cast.toString(name);
      const parts = resource.split(':');
      return parts.at(-1) || Cast.toString(name);
    }
    applyCostume(target, name) {
      state.displayedAssets.set(target.id, Cast.toString(name));
      state.displayedAssetHistory.push({
        assetName: Cast.toString(name),
        targetName: target.getName(),
      });
      const costumeName = this.resolveCostumeName(name);
      const index = target.getCostumes().findIndex((costume) => costume.name === costumeName);
      if (index >= 0) target.setCostume(index);
      const actorName = target.lookupVariableByNameAndType?.('actorName', '')?.value;
      if (actorName) state.actorSkins.set(actorName, Cast.toString(name));
    }
    setStageSkin(args) {
      this.applyCostume(this.runtime.getTargetForStage(), args.NAME);
    }
    setThisSpriteSkin(args, util) {
      const apply = () => {
        const name = Cast.toString(args.NAME);
        const resource = state.assets.get(name);
        if (resource === 'text' || resource?.startsWith('text:')) {
          const explicitName = resource.startsWith('text:')
            ? resource.slice('text:'.length).trim()
            : '';
          state.displayedAssets.set(util.target.id, name);
          state.displayedText.set(
            util.target.id,
            state.tempVariables.getRuntimeVariable({
              VAR: `text:${explicitName || name}`,
            }),
          );
          return;
        }
        this.applyCostume(util.target, name);
      };
      if (asyncAssetDisplay) return Promise.resolve().then(apply);
      apply();
    }
    playSound(args) {
      state.playingSounds.add(Cast.toString(args.NAME));
    }
    playSoundUntilDone(args, util) {
      const name = Cast.toString(args.NAME);
      if (!util.stackFrame.started) {
        util.stackFrame.started = true;
        state.playingSounds.add(name);
      }
      if (state.playingSounds.has(name)) util.yield();
    }
    stopAllSounds() {
      state.playingSounds.clear();
    }
    stopSound(args) {
      state.playingSounds.delete(Cast.toString(args.NAME));
    }
    startActorLoop() {}
    startActorSequence(args) {
      const actor = Cast.toString(args.ACTOR);
      const assets = Cast.toString(args.ASSETS)
        .split(',')
        .map((name) => name.trim());
      state.actorSequences.set(actor, assets.at(-1));
      if (assets[0]) state.actorSkins.set(actor, assets[0]);
    }
    finishAllActorSequences() {
      for (const [actor, finalAsset] of state.actorSequences) {
        state.actorSkins.set(actor, finalAsset);
      }
      state.actorSequences.clear();
    }
  }

  // Teachable Machine 4.4.0 (kubohiroyatm): only the blocks the app uses.
  class PoseExtension {
    getInfo() {
      return extensionInfo('kubohiroyatm', [
        block('currentPoseReporter', BlockType.REPORTER),
        block('hidePreview'),
        block('isModelLoaded', BlockType.BOOLEAN),
        block('isPoseWithThreshold', BlockType.BOOLEAN, ['NAME', 'THRESHOLD']),
        block('lastErrorReporter', BlockType.REPORTER),
        block('loadModel'),
        block('menu_positionMenu', BlockType.REPORTER),
        block('poseScoreReporter', BlockType.REPORTER, ['NAME']),
        block('scoreReporter', BlockType.REPORTER),
        block('setModelURL', BlockType.COMMAND, ['URL']),
        block('setPreviewOpacity', BlockType.COMMAND, ['OPACITY']),
        block('setPreviewPosition', BlockType.COMMAND, ['POSITION']),
        block('showPreview'),
        block('startCamera'),
        block('startRecognition'),
        block('stopCamera'),
        block('stopRecognition'),
      ]);
    }
    currentPoseReporter() {
      return '';
    }
    hidePreview() {}
    isModelLoaded() {
      return true;
    }
    isPoseWithThreshold() {
      return state.poseMatches;
    }
    lastErrorReporter() {
      return '';
    }
    loadModel() {}
    menu_positionMenu(args) {
      return args.positionMenu ?? 'top-left';
    }
    poseScoreReporter() {
      return state.poseScore;
    }
    scoreReporter() {
      return state.poseScore;
    }
    setModelURL() {}
    setPreviewOpacity() {}
    setPreviewPosition() {}
    showPreview() {}
    startCamera() {}
    startRecognition() {}
    stopCamera() {}
    stopRecognition() {}
  }

  class LocalStorageExtension {
    getInfo() {
      return extensionInfo('localstorage', [
        block('get', BlockType.REPORTER, ['KEY']),
        block('set', BlockType.COMMAND, ['KEY', 'VALUE']),
        block('setProjectId', BlockType.COMMAND, ['ID']),
      ]);
    }
    get(args) {
      return state.localStorage.get(Cast.toString(args.KEY)) ?? '';
    }
    set(args) {
      state.localStorage.set(Cast.toString(args.KEY), args.VALUE);
    }
    setProjectId() {}
  }

  class TranslateExtension {
    getInfo() {
      return extensionInfo('translate', [block('getViewerLanguage', BlockType.REPORTER)]);
    }
    getViewerLanguage() {
      return state.viewerLanguage;
    }
  }

  class TextLinesExtension {
    constructor(runtime) {
      this.runtime = runtime;
    }
    getInfo() {
      return extensionInfo('kubohiroyatextlines', [
        block('lineAt', BlockType.REPORTER, ['TEXT', 'LINE']),
        block('lineCount', BlockType.REPORTER, ['TEXT']),
        block('menu_LIST_MENU', BlockType.REPORTER),
        block('writeLinesToList', BlockType.COMMAND, ['TEXT', 'LIST']),
      ]);
    }
    lineAt(args) {
      const lines = Cast.toString(args.TEXT).split(/\r\n|\n|\r/u);
      const line = Math.trunc(Cast.toNumber(args.LINE));
      return line >= 1 && line <= lines.length ? (lines[line - 1] ?? '') : '';
    }
    lineCount(args) {
      return Cast.toString(args.TEXT).split(/\r\n|\n|\r/u).length;
    }
    menu_LIST_MENU(args) {
      return args.LIST_MENU ?? '';
    }
    writeLinesToList(args, util) {
      const listName = Cast.toString(args.LIST);
      const stage = this.runtime.getTargetForStage();
      const list =
        util.target.lookupVariableById(listName) ??
        stage?.lookupVariableById(listName) ??
        util.target.lookupVariableByNameAndType(listName, 'list') ??
        stage?.lookupVariableByNameAndType(listName, 'list');
      if (!list) throw new Error(`List not found: ${listName}`);
      list.value = Cast.toString(args.TEXT).split(/\r\n|\n|\r/u);
    }
  }

  class RuntimeExpressionExtension {
    constructor(runtime) {
      this.runtime = runtime;
    }
    getInfo() {
      return extensionInfo('kubohiroyaruntimeexpression', [
        block('runtimeCondition', BlockType.BOOLEAN, ['EXPRESSION']),
      ]);
    }
    runtimeCondition(args) {
      const expression = Cast.toString(args.EXPRESSION).trim();
      if (/(^|[^=!<>])=($|[^=])/u.test(expression)) {
        throw new SyntaxError('Unexpected assignment operator.');
      }
      if (expression === 'true') return true;
      if (expression === 'false' || !expression) return false;
      return Cast.toBoolean(this.runtime.ext_lmsTempVars2.getRuntimeVariable({VAR: expression}));
    }
  }

  class AsyncInputExtension {
    constructor(runtime) {
      this.runtime = runtime;
      state.asyncInput = this;
      const reset = () => {
        state.keyInputBindings.clear();
        state.touchInputBindings.clear();
      };
      runtime.on('PROJECT_START', reset);
      runtime.on('PROJECT_STOP_ALL', reset);
    }
    getInfo() {
      return extensionInfo('kubohiroyaasyncinput', [
        block('listenForKeyAndBroadcast', BlockType.COMMAND, [
          'KEY_ID',
          'RUNTIME_VAR',
          'VALUE',
          'MESSAGE',
        ]),
        block('listenForActorTouchAndBroadcast', BlockType.COMMAND, [
          'ACTOR',
          'RUNTIME_VAR',
          'VALUE',
          'MESSAGE',
        ]),
        block('stopAllInputListeners'),
        block('stopAllKeyListeners'),
      ]);
    }
    listenForKeyAndBroadcast(args, util) {
      state.keyInputBindings.set(Cast.toString(args.KEY_ID), {
        ...args,
        ownerTargetId: util.target.id,
      });
    }
    listenForActorTouchAndBroadcast(args, util) {
      state.touchInputBindings.set(Cast.toString(args.ACTOR), {
        ...args,
        ownerTargetId: util.target.id,
      });
    }
    stopAllInputListeners(_args, util) {
      this.removeOwnedBindings(state.keyInputBindings, util.target.id);
      this.removeOwnedBindings(state.touchInputBindings, util.target.id);
    }
    stopAllKeyListeners(_args, util) {
      this.removeOwnedBindings(state.keyInputBindings, util.target.id);
    }
    emitKey(keyId) {
      this.emit(state.keyInputBindings.get(keyId));
    }
    emitActorTouch(actorName) {
      this.emit(state.touchInputBindings.get(actorName));
    }
    emit(binding) {
      if (!binding) return;
      this.runtime.ext_lmsTempVars2.setRuntimeVariable({
        VAR: binding.RUNTIME_VAR,
        STRING: binding.VALUE,
      });
      this.runtime.startHats('event_whenbroadcastreceived', {
        BROADCAST_OPTION: binding.MESSAGE,
      });
    }
    removeOwnedBindings(bindings, ownerTargetId) {
      for (const [key, binding] of bindings) {
        if (binding.ownerTargetId === ownerTargetId) bindings.delete(key);
      }
    }
  }

  class TimersExtension {
    constructor(runtime) {
      runtime.on('PROJECT_START', () => state.timers.clear());
      runtime.on('PROJECT_STOP_ALL', () => state.timers.clear());
    }
    getInfo() {
      return extensionInfo('lmsTimers', [
        block('removeTimer', BlockType.COMMAND, ['TIMER']),
        block('startResetTimer', BlockType.COMMAND, ['TIMER']),
        block('valueOfTimer', BlockType.REPORTER, ['TIMER']),
      ]);
    }
    removeTimer(args) {
      state.timers.delete(Cast.toString(args.TIMER));
    }
    startResetTimer(args) {
      state.timers.set(Cast.toString(args.TIMER), clock.now);
    }
    valueOfTimer(args) {
      const start = state.timers.get(Cast.toString(args.TIMER));
      return start === undefined ? '' : (clock.now - start) / 1000;
    }
  }

  class FilesExtension {
    getInfo() {
      return extensionInfo('files', [
        block('menu_automaticallyOpen', BlockType.REPORTER),
        block('menu_encoding', BlockType.REPORTER),
        block('setOpenMode', BlockType.COMMAND, ['mode']),
        block('showPickerExtensionsAs', BlockType.COMMAND, ['extension', 'as']),
      ]);
    }
    menu_automaticallyOpen(args) {
      return args.automaticallyOpen ?? '';
    }
    menu_encoding(args) {
      return args.encoding ?? '';
    }
    setOpenMode() {}
    showPickerExtensionsAs() {
      state.filePickerRequests += 1;
      return '';
    }
  }

  class TextExtension {
    constructor(runtime) {
      runtime.on('targetWasCreated', (target) => {
        if (target.isOriginal) return;
        const original = target.sprite?.clones?.find((candidate) => candidate.isOriginal);
        if (!original) return;
        for (const values of [
          state.displayedText,
          state.textColors,
          state.textFonts,
          state.textOutlineColors,
          state.textOutlineWidths,
        ]) {
          if (values.has(original.id)) values.set(target.id, values.get(original.id));
        }
      });
      runtime.on('targetWasRemoved', (target) => {
        state.displayedText.delete(target.id);
        state.textColors.delete(target.id);
        state.textFonts.delete(target.id);
        state.textOutlineColors.delete(target.id);
        state.textOutlineWidths.delete(target.id);
      });
    }
    getInfo() {
      return extensionInfo('text', [
        block('setText', BlockType.COMMAND, ['TEXT']),
        block('animateText', BlockType.COMMAND, ['ANIMATE', 'TEXT']),
        block('setFont', BlockType.COMMAND, ['FONT']),
        block('setColor', BlockType.COMMAND, ['COLOR']),
        block('setWidth', BlockType.COMMAND, ['WIDTH', 'ALIGN']),
        block('setOutlineWidth', BlockType.COMMAND, ['WIDTH']),
        block('setOutlineColor', BlockType.COMMAND, ['COLOR']),
      ]);
    }
    setText(args, util) {
      state.displayedText.set(util.target.id, Cast.toString(args.TEXT));
    }
    animateText(args, util) {
      state.displayedText.set(util.target.id, Cast.toString(args.TEXT));
    }
    setFont(args, util) {
      state.textFonts.set(util.target.id, Cast.toString(args.FONT));
    }
    setColor(args, util) {
      state.textColors.set(util.target.id, Cast.toString(args.COLOR));
    }
    setWidth() {}
    setOutlineWidth(args, util) {
      state.textOutlineWidths.set(util.target.id, Cast.toNumber(args.WIDTH));
    }
    setOutlineColor(args, util) {
      state.textOutlineColors.set(util.target.id, Cast.toString(args.COLOR));
    }
  }

  class SvgTextExtension {
    constructor(runtime) {
      runtime.on('targetWasRemoved', (target) => state.svgTextActors.delete(target.id));
    }
    getInfo() {
      return extensionInfo('kubohiroyasvgtext', [
        block('defineStyle', BlockType.COMMAND, [
          'STYLE',
          'BACKGROUND',
          'TEXT_COLOR',
          'FONT',
          'SIZE',
          'ALIGN',
          'DIRECTION',
        ]),
        block('sayWithStyle', BlockType.COMMAND, ['MESSAGE', 'STYLE']),
        block('thinkWithStyle', BlockType.COMMAND, ['MESSAGE', 'STYLE']),
        block('setText', BlockType.COMMAND, ['TEXT', 'STYLE']),
      ]);
    }
    defineStyle(args) {
      state.svgTextStyles.set(Cast.toString(args.STYLE).trim() || 'default', {
        alignment: Cast.toString(args.ALIGN),
        backgroundColor: Cast.toString(args.BACKGROUND),
        direction: Cast.toString(args.DIRECTION),
        font: Cast.toString(args.FONT),
        fontPercent: Cast.toNumber(args.SIZE),
        textColor: Cast.toString(args.TEXT_COLOR),
      });
    }
    setText(args, util) {
      state.svgTextActors.set(util.target.id, {
        style: Cast.toString(args.STYLE).trim() || 'default',
        text: Cast.toString(args.TEXT).replace(/\\r\\n|\\n|\\r/gu, '\n'),
      });
    }
    showBubble(type, args, util) {
      const message = Cast.toString(args.MESSAGE).replace(/\\r\\n|\\n|\\r/gu, '\n');
      state.svgTextBubbleUpdates.push({
        message,
        style: Cast.toString(args.STYLE).trim() || 'default',
        targetId: util.target.id,
        type,
      });
      vm.runtime.getOpcodeFunction(`looks_${type}`)({MESSAGE: message}, util);
    }
    sayWithStyle(args, util) {
      this.showBubble('say', args, util);
    }
    thinkWithStyle(args, util) {
      this.showBubble('think', args, util);
    }
  }

  // TurboWarp gallery Network (true-fantom/network.js): only the block the app uses.
  class NetworkExtension {
    getInfo() {
      return extensionInfo('truefantomnetwork', [
        block('open_link_block', BlockType.COMMAND, ['USER_URL']),
      ]);
    }
    open_link_block(args) {
      state.openedUrls.push(Cast.toString(args.USER_URL));
    }
  }

  register(vm, 'sipcconsole', ConsoleExtension);
  register(vm, 'lmsTempVars2', TempVariablesExtension);
  register(vm, 'strings', StringsExtension);
  register(vm, 'kubohiroyatm', PoseExtension);
  register(vm, 'localstorage', LocalStorageExtension);
  register(vm, 'kubohiroyatextlines', TextLinesExtension);
  register(
    vm,
    'kubohiroyaruntimeexpression',
    productionRuntimeExpression
      ? createProductionExtensionClass(vm, runtimeExpressionSource, (extension) => {
          state.runtimeExpression = extension;
        })
      : RuntimeExpressionExtension,
  );
  register(vm, 'kubohiroyaasyncinput', AsyncInputExtension);
  register(vm, 'lmsTimers', TimersExtension);
  register(vm, 'files', FilesExtension);
  register(vm, 'translate', TranslateExtension);
  register(vm, 'truefantomnetwork', NetworkExtension);

  const memberRuntimes = new Map(
    bundledMemberIds.map((memberId) => [memberId, createBundledRuntime(vm.runtime, memberId)]),
  );
  const memberVm = (memberId) => createBundledVm(vm, memberRuntimes.get(memberId));
  const AssetManagerClass = productionAssetManager
    ? createProductionAssetManagerClass(memberVm('kubohiroyaassetmanager'), () => {})
    : AssetManagerExtension;
  const KamishibaiRuntimeClass = createProductionExtensionClass(
    memberVm('kubohiroyakamishibairuntime'),
    kamishibaiRuntimeSource,
  );
  const BundleExtension = createTestBundleExtensionClass(
    [
      {
        ExtensionClass: AssetManagerClass,
        id: 'kubohiroyaassetmanager',
        runtime: memberRuntimes.get('kubohiroyaassetmanager'),
      },
      {ExtensionClass: TextExtension, id: 'text', runtime: memberRuntimes.get('text')},
      {
        ExtensionClass: KamishibaiRuntimeClass,
        id: 'kubohiroyakamishibairuntime',
        runtime: memberRuntimes.get('kubohiroyakamishibairuntime'),
      },
      {
        ExtensionClass: SvgTextExtension,
        id: 'kubohiroyasvgtext',
        runtime: memberRuntimes.get('kubohiroyasvgtext'),
      },
    ],
    (memberId, component) => {
      if (memberId === 'kubohiroyaassetmanager') state.assetManager = component;
      if (memberId === 'kubohiroyakamishibairuntime') state.kamishibaiRuntime = component;
      if (memberId === 'kubohiroyasvgtext') state.svgText = component;
    },
  );
  register(vm, bundledExtensionId, BundleExtension);

  return state;
}
