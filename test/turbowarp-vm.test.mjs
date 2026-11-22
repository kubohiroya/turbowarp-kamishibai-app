import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {loadKamishibaiVm, turbowarpVmCommit} from './helpers/turbowarp-vm.mjs';
import {appShellLocales, appShellSelectedLanguageNames} from '../scripts/sb3/app-shell-locales.mjs';

const runtimeFixtureUrl = new URL('./fixtures/runtime/skip-mode.txt', import.meta.url);
const poseFixtureUrl = new URL('./fixtures/runtime/pose-skip-mode.txt', import.meta.url);
const officialWebsiteUrl = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
).homepage;
const menuGridLayout = new Map([
  ['openButton', {size: 65, textWidth: 326, x: -93, y: 43}],
  ['reloadButton', {size: 65, textWidth: 208, x: 127, y: 43}],
  ['showTitleButton', {size: 65, textWidth: 360, x: -93, y: -97}],
  ['languageButton', {size: 65, textWidth: 220, x: 127, y: -97}],
]);
const menuIconLayout = new Map([
  [
    'openButtonIcon',
    {
      action: 'open-file',
      asset: 'ui.icon.open',
      labelId: 'openButton',
      size: 100,
      x: -93,
      y: 88,
    },
  ],
  [
    'reloadButtonIcon',
    {
      action: 'reload',
      asset: 'ui.icon.reload',
      labelId: 'reloadButton',
      size: 100,
      x: 127,
      y: 88,
    },
  ],
  [
    'showTitleButtonIcon',
    {
      action: 'show-title',
      asset: 'ui.icon.about',
      labelId: 'showTitleButton',
      size: 100,
      x: -93,
      y: -52,
    },
  ],
  [
    'languageButtonIcon',
    {
      action: 'show-language',
      asset: 'ui.icon.language',
      labelId: 'languageButton',
      size: 100,
      x: 127,
      y: -52,
    },
  ],
]);

async function startFixture(harness, fixtureUrl = runtimeFixtureUrl) {
  const script = await readFile(fixtureUrl, 'utf8');
  startScript(harness, script);
}

function loadDiagnosticVm(options = {}) {
  return loadKamishibaiVm({
    ...options,
    productionAssetManager: true,
    productionRuntimeExpression: true,
  });
}

function startScript(harness, script) {
  harness.greenFlag();
  harness.runUntil(() => harness.getRuntimeVariable('skipMode') === 'title');
  harness.setRuntimeVariable('script', script);
  harness.broadcast('startStory');
  harness.runUntil(() => harness.getBackdropName() === 'Stars');
}

async function startScriptAsync(harness, script) {
  harness.greenFlag();
  await harness.runUntilAsync(() => harness.getRuntimeVariable('skipMode') === 'title');
  harness.setRuntimeVariable('script', script);
  harness.broadcast('startStory');
  await harness.runUntilAsync(() => harness.getBackdropName() === 'Stars');
}

function uiItemId(target) {
  return target.lookupVariableByNameAndType('uiId', '')?.value;
}

function uiItemVariable(target, name) {
  return target.lookupVariableByNameAndType(name, '')?.value;
}

function uiItemClonesById(harness) {
  return new Map(harness.getClones('UiItem').map((target) => [uiItemId(target), target]));
}

function assertMenuGrid(clones, ids = [...menuGridLayout.keys()]) {
  for (const id of ids) {
    const target = clones.get(id);
    assert(target, `Missing menu item: ${id}`);
    const {size, x, y} = menuGridLayout.get(id);
    assert.deepEqual(
      {size: target.size, x: target.x, y: target.y},
      {size, x, y},
      `Unexpected menu position: ${id}`,
    );
  }
}

function assertMenuGridFitsStage(clones) {
  const bounds = new Map();
  for (const [id, {textWidth}] of menuGridLayout) {
    const target = clones.get(id);
    const halfWidth = (textWidth * target.size) / 200;
    const itemBounds = {left: target.x - halfWidth, right: target.x + halfWidth};
    assert(itemBounds.left >= -240, `${id} extends past the left edge`);
    assert(itemBounds.right <= 240, `${id} extends past the right edge`);
    bounds.set(id, itemBounds);
  }
  for (const [leftId, rightId] of [
    ['openButton', 'reloadButton'],
    ['showTitleButton', 'languageButton'],
  ]) {
    assert(bounds.get(leftId).right < bounds.get(rightId).left, `${leftId} overlaps ${rightId}`);
  }
  for (const [upperLabelId, lowerIconId] of [
    ['openButton', 'showTitleButtonIcon'],
    ['reloadButton', 'languageButtonIcon'],
  ]) {
    assert(
      clones.get(upperLabelId).y - clones.get(lowerIconId).y >= 90,
      `${upperLabelId} is too close to ${lowerIconId}`,
    );
  }
}

function assertMenuIcons(clones, ids = [...menuIconLayout.keys()]) {
  for (const id of ids) {
    const target = clones.get(id);
    assert(target, `Missing menu icon: ${id}`);
    const {action, asset, labelId, size, x, y} = menuIconLayout.get(id);
    const label = clones.get(labelId);
    assert(label, `Missing paired menu label: ${labelId}`);
    assert.deepEqual(
      {
        action: uiItemVariable(target, 'uiAction'),
        asset: uiItemVariable(target, 'uiAsset'),
        size: target.size,
        x: target.x,
        y: target.y,
      },
      {action, asset, size, x, y},
      `Unexpected menu icon configuration: ${id}`,
    );
    assert.equal(uiItemVariable(target, 'uiAction'), uiItemVariable(label, 'uiAction'));
    assert.equal(target.x, label.x);
    assert.ok(target.y > label.y, `${id} must be above ${labelId}`);
  }
}

function assertMenuIconsFitStage(clones) {
  for (const [id, {x, y}] of menuIconLayout) {
    const target = clones.get(id);
    const halfSize = (48 * target.size) / 200;
    assert(x - halfSize >= -240, `${id} extends past the left edge`);
    assert(x + halfSize <= 240, `${id} extends past the right edge`);
    assert(y - halfSize >= -180, `${id} extends past the bottom edge`);
    assert(y + halfSize <= 180, `${id} extends past the top edge`);
  }
}

async function startInvalidScript(harness, script) {
  harness.setStageVariable('featureDetailedScriptErrors', true);
  harness.greenFlag();
  await harness.runUntilAsync(() => harness.getRuntimeVariable('skipMode') === 'title');
  harness.setRuntimeVariable('script', script);
  harness.diagnosticAssetRegistrySize = harness.extensionState.assetManager.assetRegistry.size;
  harness.broadcast('startStory');
  await harness.runUntilAsync(() => Boolean(harness.getRuntimeVariable('kamishibaiErrorCategory')));
}

function assertScriptError(harness, {category, line, message}) {
  assert.equal(harness.getRuntimeVariable('kamishibaiErrorCategory'), category);
  assert.equal(Number(harness.getRuntimeVariable('kamishibaiErrorLine')), line);
  assert.match(harness.getRuntimeVariable('kamishibaiErrorMessage'), message);
  assert.match(harness.getRuntimeVariable('kamishibaiErrorSvg'), /^<svg[^>]*>/u);
  assert.match(harness.getRuntimeVariable('kamishibaiErrorCode'), /^K32-/u);
  assert.ok(Number(harness.getRuntimeVariable('kamishibaiErrorColumn')) >= 1);
  assert.equal(harness.getSprite('prompt').visible, true);
  assert.match(
    harness.extensionState.displayedText.get(harness.getSprite('prompt').id),
    /台本エラー|Script error/u,
  );
  const diagnostic = JSON.parse(harness.extensionState.kamishibaiRuntime.getLastDiagnosticJson());
  assert.equal(diagnostic.source.line, line);
  assert.equal(diagnostic.category, category);
  assert.equal(
    harness.extensionState.assetManager.assetRegistry.size,
    harness.diagnosticAssetRegistrySize,
  );
  assert.equal(
    harness.vm.runtime.targets.filter((target) => !target.isStage && !target.isOriginal).length,
    0,
  );
  assert.equal(harness.vm.runtime.threads.length, 0);
}

function actorActionScript(action, {before = [], declarations = []} = {}) {
  return [
    'kamishibai=3.2',
    'asset=Title,backdrop',
    'asset=Stars,backdrop',
    'asset=Hero,costume:Loading:loading',
    'actor=Hero,Hero',
    ...declarations,
    'cover=Title,',
    '---',
    'sceneLabel=first',
    'action=stage:Stars',
    ...before.map((line) => `action=${line}`),
    `action=${action}`,
    'action=stage:Title',
    'action=wait:30',
    '---',
    'sceneLabel=second',
    'action=stage:Stars',
    'action=wait:30',
  ].join('\n');
}

function sceneNavigationScript(firstSceneActions, {runtimeVariables = [], branches = []} = {}) {
  return [
    'kamishibai=3.2',
    'asset=Title,backdrop',
    'asset=Stars,backdrop',
    'asset=LeftDoor,costume:Loading:loading',
    'asset=RightDoor,costume:Loading:loading',
    'actor=LeftDoor,LeftDoor',
    'actor=RightDoor,RightDoor',
    ...runtimeVariables.map((value) => `setRuntimeVariable=${value}`),
    ...branches.map((value) => `registerBranch=${value}`),
    'cover=Title,',
    '---',
    'sceneLabel=first',
    'action=stage:Stars',
    ...firstSceneActions.map((action) => `action=${action}`),
    '---',
    'sceneLabel=home',
    'action=stage:Title',
    'action=wait:30',
    '---',
    'sceneLabel=ocean',
    'action=stage:Stars',
    'action=wait:30',
  ].join('\n');
}

test('pins and loads the generated SB3 in the TurboWarp VM', async (context) => {
  assert.equal(turbowarpVmCommit, 'c4823421cb7c17d8d8a89878851ce1668c26a21f');
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());

  assert.deepEqual(
    harness.vm.runtime.targets.map((target) => target.getName()),
    [
      'Stage',
      'Actor',
      'prompt',
      'UiItem',
      'officialWebsiteButton',
      'closeTitleButton',
      'Loading',
      'LoadingBubbleAnchor',
    ],
  );
  assert.deepEqual(
    harness
      .getStage()
      .getCostumes()
      .map((costume) => costume.name),
    ['Title', 'TitleRuntime', 'Stars', 'LoadingBackdrop'],
  );
  assert.deepEqual(harness.getSprite('Actor').getSounds(), []);
  assert.deepEqual(harness.getSprite('Loading').getSounds(), []);
  assert.deepEqual(
    harness
      .getSprite('prompt')
      .getCostumes()
      .map((costume) => costume.name),
    ['ui-placeholder'],
  );
  assert.deepEqual(
    harness
      .getSprite('UiItem')
      .getCostumes()
      .map((costume) => costume.name),
    [
      'ui-placeholder',
      'menu-icon-open',
      'menu-icon-reload',
      'menu-icon-about',
      'menu-icon-language',
    ],
  );
  assert.deepEqual(
    harness
      .getSprite('officialWebsiteButton')
      .getCostumes()
      .map((costume) => costume.name),
    ['official-website-button', 'official-website-button-runtime'],
  );
  assert.deepEqual(
    harness
      .getSprite('closeTitleButton')
      .getCostumes()
      .map((costume) => costume.name),
    ['title-close-button'],
  );
  const uiItemBlocks = harness.getSprite('UiItem').blocks;
  const cloneStart = Object.values(uiItemBlocks._blocks).find(
    (block) => block.opcode === 'control_start_as_clone',
  );
  const createClone = Object.values(uiItemBlocks._blocks).find(
    (block) => block.opcode === 'control_create_clone_of',
  );
  const createUiItemPrototype = Object.values(uiItemBlocks._blocks).find(
    (block) =>
      block.opcode === 'procedures_prototype' &&
      block.mutation?.proccode?.startsWith('create UI item'),
  );
  const setTemplateSize = uiItemBlocks.getBlock(createClone.parent);
  const applyCloneSkin = uiItemBlocks.getBlock(cloneStart.next);
  const showClone = uiItemBlocks.getBlock(applyCloneSkin.next);
  assert.equal(setTemplateSize.opcode, 'looks_setsizeto');
  assert.equal(createUiItemPrototype.mutation.warp, 'true');
  assert.equal(uiItemBlocks.getBlock(createClone.next).opcode, 'data_setvariableto');
  assert.equal(
    applyCloneSkin.opcode,
    'kubohiroyaassetcache_setThisSpriteSkin',
    'assets are applied only after cloning the stable placeholder drawable',
  );
  assert.equal(showClone.opcode, 'looks_show');
  assert.equal(uiItemBlocks.getBlock(showClone.next).opcode, 'control_wait');
  assert.equal(
    Object.values(uiItemBlocks._blocks).some((block) => block.opcode === 'text_setText'),
    false,
    'UiItem delegates text rendering to Asset Cache instead of cloning Animated Text state',
  );
  assert.equal(
    harness.getSprite('UiItem').getCostumes()[0].assetId,
    'b85391a10e36ffc5157fa1f4f2d419ce',
    'UiItem uses a 10x10 placeholder so 50% sizes are not fenced up to 100%',
  );
  const officialWebsiteBlocks = harness.getSprite('officialWebsiteButton').blocks;
  const showWebsiteButton = Object.values(officialWebsiteBlocks._blocks).find(
    (block) =>
      block.opcode === 'looks_show' &&
      officialWebsiteBlocks.getBlock(block.next)?.opcode === 'control_if',
  );
  const sendWebsiteButtonBehind = officialWebsiteBlocks.getBlock(showWebsiteButton.next);
  assert.equal(
    officialWebsiteBlocks.getBlock(sendWebsiteButtonBehind.inputs.CONDITION.block).fields.VARIABLE
      .value,
    'cloneUiItemsEnabled',
  );
  const goWebsiteButtonBehind = officialWebsiteBlocks.getBlock(
    sendWebsiteButtonBehind.inputs.SUBSTACK.block,
  );
  assert.equal(goWebsiteButtonBehind.opcode, 'looks_gotofrontback');
  assert.equal(goWebsiteButtonBehind.fields.FRONT_BACK.value, 'back');
  assert.equal(harness.getStageVariable('featureCloneUiItems'), undefined);
  assert.equal(harness.getStageVariable('cloneUiItemsEnabled'), true);
  assert.equal(harness.getSprite('UiItem').visible, false);
  assert.equal(harness.getClones('UiItem').length, 0);
});

test('shows an SVG error and stops on an unsupported kamishibai version', async (context) => {
  const harness = await loadDiagnosticVm();
  context.after(() => harness.quit());

  await startInvalidScript(harness, 'kamishibai=2.0');

  assertScriptError(harness, {
    category: 'unsupported-version',
    line: 1,
    message: /2\.0.*3\.1.*3\.2/u,
  });
  assert.equal(harness.getRuntimeVariable('kamishibaiErrorSource'), 'kamishibai=2.0');
});

test('reports unsupported top-level and actor action commands with their lines', async (context) => {
  for (const errorCase of [
    {
      category: 'unsupported-command',
      line: 2,
      message: /teleport/u,
      script: ['kamishibai=3.2', 'teleport=somewhere'].join('\n'),
    },
    {
      category: 'unsupported-action',
      line: 9,
      message: /fly/u,
      script: [
        'kamishibai=3.2',
        'asset=Title,backdrop',
        'asset=Stars,backdrop',
        'asset=Hero,costume:Loading:loading',
        'actor=Hero,Hero',
        'cover=Title,',
        '---',
        'sceneLabel=first',
        'action=Hero:fly',
      ].join('\n'),
    },
  ]) {
    const harness = await loadDiagnosticVm();
    context.after(() => harness.quit());
    await startInvalidScript(harness, errorCase.script);
    assertScriptError(harness, errorCase);
  }
});

test('reports a project-local asset address that cannot be resolved', async (context) => {
  const harness = await loadDiagnosticVm();
  context.after(() => harness.quit());

  await startInvalidScript(
    harness,
    ['kamishibai=3.2', 'asset=Missing,costume:Loading:not-there'].join('\n'),
  );

  assertScriptError(harness, {
    category: 'asset-address',
    line: 2,
    message: /Loading\/not-there/u,
  });
});

test('reports undefined assets referenced by setSkin and pose', async (context) => {
  for (const action of [
    'action=Hero:setSkin:MissingSkin',
    'action=Hero:pose:MissingSkin:firstPose:',
  ]) {
    const harness = await loadDiagnosticVm();
    context.after(() => harness.quit());
    await startInvalidScript(
      harness,
      [
        'kamishibai=3.2',
        'asset=Title,backdrop',
        'asset=Stars,backdrop',
        'asset=Hero,costume:Loading:loading',
        'actor=Hero,Hero',
        'cover=Title,',
        '---',
        'sceneLabel=first',
        action,
      ].join('\n'),
    );
    assertScriptError(harness, {
      category: 'undefined-asset',
      line: 9,
      message: /MissingSkin/u,
    });
  }
});

test('reports an undefined scene transition target', async (context) => {
  const harness = await loadDiagnosticVm();
  context.after(() => harness.quit());

  await startInvalidScript(
    harness,
    [
      'kamishibai=3.2',
      'asset=Title,backdrop',
      'asset=Stars,backdrop',
      'cover=Title,',
      '---',
      'sceneLabel=first',
      'action=keyInputToChangeScene:ArrowRight:missing-scene',
    ].join('\n'),
  );

  assertScriptError(harness, {
    category: 'undefined-scene',
    line: 7,
    message: /missing-scene/u,
  });
});

test('reports Runtime Expression syntax errors at the registerBranch line', async (context) => {
  const harness = await loadDiagnosticVm();
  context.after(() => harness.quit());

  await startInvalidScript(
    harness,
    [
      'kamishibai=3.2',
      'asset=Title,backdrop',
      'asset=Stars,backdrop',
      'registerBranch=choose:score = 1:first',
      'cover=Title,',
      '---',
      'sceneLabel=first',
      'action=stage:Stars',
    ].join('\n'),
  );

  assertScriptError(harness, {
    category: 'expression-syntax',
    line: 4,
    message: /score = 1/u,
  });
});

test('shows the built-in English Title fallback before runtime initialization', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());

  assert.equal(harness.getBackdropName(), 'Title');
  assert.equal(harness.getSprite('officialWebsiteButton').visible, true);
  assert.equal(harness.getSpriteCostumeName('officialWebsiteButton'), 'official-website-button');
  assert.equal(harness.getSprite('closeTitleButton').visible, true);
  assert.equal(harness.getSprite('UiItem').visible, false);
  assert.equal(harness.getClones('UiItem').length, 0);
});

test('localizes the app shell from the standard viewer-language reporter', async (context) => {
  const savedScript = await readFile(runtimeFixtureUrl, 'utf8');
  for (const {locale, viewerLanguage} of [
    {
      locale: 'en',
      viewerLanguage: 'English',
    },
    {
      locale: 'ja',
      viewerLanguage: '日本語',
    },
    {
      locale: 'ja',
      viewerLanguage: 'ja',
    },
    {
      locale: 'ja',
      viewerLanguage: 'ja-JP',
    },
  ]) {
    const harness = await loadKamishibaiVm({
      initialLocalStorage: {script: savedScript},
      viewerLanguage,
    });
    context.after(() => harness.quit());
    const localized = appShellLocales[locale];

    harness.greenFlag();
    await harness.runUntilAsync(() => {
      const clones = uiItemClonesById(harness);
      return harness.getRuntimeVariable('skipMode') === 'title' && clones.size === 7;
    });
    assert.equal(harness.getRuntimeVariable('uiLanguage'), locale);
    assert.equal(harness.getBackdropName(), 'TitleRuntime');
    assert.equal(
      harness.getSpriteCostumeName('officialWebsiteButton'),
      'official-website-button-runtime',
    );
    const titleClones = uiItemClonesById(harness);
    for (const [uiId, label] of [
      ['titleHeading', localized.about.title],
      ['titleLicenseApp', localized.about.license.app],
      ['titleLicenseStory', localized.about.license.story],
      ['officialWebsiteLabel', localized.about.officialWebsite.name],
    ]) {
      assert.equal(harness.extensionState.displayedText.get(titleClones.get(uiId).id), label);
    }
    assert(
      harness.extensionState.displayedText
        .get(titleClones.get('titleAuthorOrganization').id)
        .includes(localized.about.author.organization),
    );
    assert(
      harness.extensionState.displayedText
        .get(titleClones.get('titleAuthorName').id)
        .includes(localized.about.author.name),
    );

    harness.broadcast('showMenu');
    await harness.runUntilAsync(() => uiItemClonesById(harness).size === 8);
    const menuClones = uiItemClonesById(harness);
    assertMenuGrid(menuClones);
    assertMenuGridFitsStage(menuClones);
    assertMenuIcons(menuClones);
    assertMenuIconsFitStage(menuClones);
    for (const [uiId, label] of [
      ['openButton', localized.ui.open],
      ['reloadButton', localized.ui.reload],
      ['showTitleButton', localized.ui.about],
      ['languageButton', localized.ui.language],
    ]) {
      assert.equal(harness.extensionState.displayedText.get(menuClones.get(uiId).id), label);
    }
  }
});

test('uses clone UI as the standard app-shell path', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());

  assert.equal(harness.getStageVariable('featureCloneUiItems'), undefined);
  assert.equal(harness.getStageVariable('cloneUiItemsEnabled'), true);
  harness.greenFlag();
  await harness.runUntilAsync(() => uiItemClonesById(harness).size === 7);
  harness.broadcast('showMenu');
  await harness.runUntilAsync(() => uiItemClonesById(harness).size === 4);

  assert.deepEqual([...uiItemClonesById(harness).keys()].sort(), [
    'languageButton',
    'languageButtonIcon',
    'openButton',
    'openButtonIcon',
  ]);
});

test('prefers a saved UI language and changes it from the Language menu', async (context) => {
  const harness = await loadKamishibaiVm({
    initialLocalStorage: {uiLanguage: 'en'},
    viewerLanguage: '日本語',
  });
  context.after(() => harness.quit());

  harness.greenFlag();
  harness.runUntil(() => harness.getRuntimeVariable('skipMode') === 'title');
  assert.equal(harness.getRuntimeVariable('uiLanguage'), 'en');
  assert.equal(harness.getBackdropName(), 'TitleRuntime');

  harness.broadcast('showMenu');
  await harness.runUntilAsync(() => uiItemClonesById(harness).has('languageButton'));
  harness.clickTarget(uiItemClonesById(harness).get('languageButtonIcon'));
  await harness.runUntilAsync(() => uiItemClonesById(harness).size === 2);
  const languageClones = uiItemClonesById(harness);
  assert.equal(
    harness.extensionState.displayedText.get(languageClones.get('japaneseLanguageButton').id),
    '日本語',
  );
  assert.equal(
    harness.extensionState.displayedText.get(languageClones.get('englishLanguageButton').id),
    appShellSelectedLanguageNames.en,
  );

  harness.clickTarget(languageClones.get('japaneseLanguageButton'));
  await harness.runUntilAsync(
    () =>
      harness.getRuntimeVariable('uiLanguage') === 'ja' &&
      uiItemClonesById(harness).has('languageButton'),
  );
  const localizedMenuClones = uiItemClonesById(harness);
  assert.equal(harness.extensionState.localStorage.get('uiLanguage'), 'ja');
  assert.equal(
    harness.extensionState.displayedText.get(localizedMenuClones.get('openButton').id),
    appShellLocales.ja.ui.open,
  );
  assert.equal(localizedMenuClones.has('japaneseLanguageButton'), false);
  assert.equal(localizedMenuClones.has('englishLanguageButton'), false);

  harness.clickTarget(localizedMenuClones.get('languageButton'));
  await harness.runUntilAsync(() => uiItemClonesById(harness).has('japaneseLanguageButton'));
  const localizedLanguageClones = uiItemClonesById(harness);
  assert.equal(
    harness.extensionState.displayedText.get(
      localizedLanguageClones.get('japaneseLanguageButton').id,
    ),
    appShellSelectedLanguageNames.ja,
  );
  assert.equal(
    harness.extensionState.displayedText.get(
      localizedLanguageClones.get('englishLanguageButton').id,
    ),
    'English',
  );
  harness.broadcast('hideMenu');

  harness.broadcast('showTitle');
  await harness.runUntilAsync(
    () =>
      harness.getBackdropName() === 'TitleRuntime' && uiItemClonesById(harness).has('titleHeading'),
  );
  assert.equal(
    harness.getSpriteCostumeName('officialWebsiteButton'),
    'official-website-button-runtime',
  );
  assert.equal(
    harness.extensionState.displayedText.get(uiItemClonesById(harness).get('titleHeading').id),
    appShellLocales.ja.about.title,
  );
});

test('uses only active-screen UI clones and releases their Asset Manager state', async (context) => {
  const savedScript = await readFile(runtimeFixtureUrl, 'utf8');
  const harness = await loadKamishibaiVm({
    initialLocalStorage: {script: savedScript},
    productionAssetManager: true,
  });
  context.after(() => harness.quit());

  harness.greenFlag();
  await harness.runUntilAsync(() => {
    const clones = uiItemClonesById(harness);
    return clones.size === 7 && [...clones.values()].every((target) => target.visible);
  });
  assert.equal(harness.getStageVariable('cloneUiItemsEnabled'), true);
  const titleClones = uiItemClonesById(harness);
  assert.equal(
    harness.extensionState.displayedText.get(titleClones.get('officialWebsiteLabel').id),
    appShellLocales.en.about.officialWebsite.name,
  );
  assert.deepEqual([...titleClones.keys()].sort(), [
    'officialWebsiteLabel',
    'titleAuthorName',
    'titleAuthorOrganization',
    'titleHeading',
    'titleLicenseApp',
    'titleLicenseStory',
    'titleVersion',
  ]);
  for (const [id, expected] of new Map([
    ['titleHeading', {size: 140, x: 0, y: 62}],
    ['titleVersion', {size: 80, x: 0, y: 22}],
    ['titleLicenseApp', {size: 50, x: 0, y: -55}],
    ['titleLicenseStory', {size: 50, x: 0, y: -92}],
    ['titleAuthorOrganization', {size: 50, x: 0, y: -135}],
    ['titleAuthorName', {size: 50, x: 0, y: -158}],
    ['officialWebsiteLabel', {size: 60, x: 13, y: -16}],
  ])) {
    const target = titleClones.get(id);
    assert.deepEqual({size: target.size, x: target.x, y: target.y}, expected);
  }
  const titleTargetIds = [...titleClones.values()].map((target) => target.id);
  for (const target of titleClones.values()) {
    assert.equal(harness.extensionState.assetManager.displayedAssets.has(target.id), true);
  }

  harness.clickTarget(titleClones.get('titleHeading'));
  await harness.runUntilAsync(() => {
    const ids = [...uiItemClonesById(harness).keys()].sort();
    return ids.length === 8;
  });
  for (const targetId of titleTargetIds) {
    assert.equal(harness.extensionState.assetManager.displayedAssets.has(targetId), false);
  }

  const menuClones = uiItemClonesById(harness);
  assertMenuGrid(menuClones);
  assertMenuIcons(menuClones);
  for (const id of menuGridLayout.keys()) {
    assert.equal(harness.extensionState.textFonts.get(menuClones.get(id).id), 'Sans Serif');
  }
  const menuTargetIds = [...menuClones.values()].map((target) => target.id);
  harness.clickTarget(menuClones.get('languageButton'));
  await harness.runUntilAsync(() => {
    const ids = [...uiItemClonesById(harness).keys()].sort();
    return (
      ids.length === 2 && ids[0] === 'englishLanguageButton' && ids[1] === 'japaneseLanguageButton'
    );
  });
  for (const targetId of menuTargetIds) {
    assert.equal(harness.extensionState.assetManager.displayedAssets.has(targetId), false);
  }

  const languageClones = uiItemClonesById(harness);
  const languageTargetIds = [...languageClones.values()].map((target) => target.id);
  harness.clickTarget(languageClones.get('japaneseLanguageButton'));
  await harness.runUntilAsync(() => {
    const menuClonesAfterLanguageChange = uiItemClonesById(harness);
    const openButton = menuClonesAfterLanguageChange.get('openButton');
    return (
      harness.getRuntimeVariable('uiLanguage') === 'ja' &&
      openButton &&
      menuClonesAfterLanguageChange.has('languageButton') &&
      harness.extensionState.displayedText.get(openButton.id) === appShellLocales.ja.ui.open
    );
  });
  assert.equal(harness.extensionState.localStorage.get('uiLanguage'), 'ja');
  assert.equal(
    harness.extensionState.displayedText.get(uiItemClonesById(harness).get('openButton').id),
    appShellLocales.ja.ui.open,
  );
  for (const targetId of languageTargetIds) {
    assert.equal(harness.extensionState.assetManager.displayedAssets.has(targetId), false);
  }

  harness.broadcast('showTitle');
  await harness.runUntilAsync(() => uiItemClonesById(harness).size === 7);
  const linkedTitleClones = uiItemClonesById(harness);
  harness.clickTarget(linkedTitleClones.get('officialWebsiteLabel'));
  await harness.runUntilAsync(() => harness.extensionState.openedUrls.length === 1);
  assert.deepEqual(harness.extensionState.openedUrls, [officialWebsiteUrl]);
  assert.equal(uiItemClonesById(harness).size, 7);

  const finalTargetIds = [...linkedTitleClones.values()].map((target) => target.id);
  harness.broadcast('hideMenu');
  await harness.runUntilAsync(() => uiItemClonesById(harness).size === 0);
  for (const targetId of finalTargetIds) {
    assert.equal(harness.extensionState.assetManager.displayedAssets.has(targetId), false);
  }

  harness.greenFlag();
  await harness.runUntilAsync(() => uiItemClonesById(harness).size === 7);
  assert.equal(harness.getClones('UiItem').length, 7);
});

test('keeps saved-script menu actions running after their source clones are deleted', async (context) => {
  const savedScript = await readFile(runtimeFixtureUrl, 'utf8');
  const harness = await loadKamishibaiVm({initialLocalStorage: {script: savedScript}});
  context.after(() => harness.quit());

  harness.greenFlag();
  await harness.runUntilAsync(() => uiItemClonesById(harness).size === 7);
  harness.broadcast('showMenu');
  await harness.runUntilAsync(() => uiItemClonesById(harness).size === 8);
  assert.deepEqual([...uiItemClonesById(harness).keys()].sort(), [
    'languageButton',
    'languageButtonIcon',
    'openButton',
    'openButtonIcon',
    'reloadButton',
    'reloadButtonIcon',
    'showTitleButton',
    'showTitleButtonIcon',
  ]);
  assertMenuGrid(uiItemClonesById(harness));
  assertMenuIcons(uiItemClonesById(harness));

  harness.clickTarget(uiItemClonesById(harness).get('showTitleButtonIcon'));
  await harness.runUntilAsync(
    () =>
      harness.getRuntimeVariable('skipMode') === 'title' && uiItemClonesById(harness).size === 7,
  );

  harness.broadcast('showMenu');
  await harness.runUntilAsync(() => uiItemClonesById(harness).size === 8);
  harness.clickTarget(uiItemClonesById(harness).get('openButtonIcon'));
  await harness.runUntilAsync(() => harness.extensionState.filePickerRequests === 1);
  assert.equal(uiItemClonesById(harness).size, 0);
});

test('reloads a saved script from a UI clone after deleting the menu clones', async (context) => {
  const savedScript = await readFile(runtimeFixtureUrl, 'utf8');
  const harness = await loadKamishibaiVm({initialLocalStorage: {script: savedScript}});
  context.after(() => harness.quit());

  harness.greenFlag();
  await harness.runUntilAsync(() => uiItemClonesById(harness).size === 7);
  harness.broadcast('showMenu');
  await harness.runUntilAsync(() => uiItemClonesById(harness).has('reloadButton'));
  harness.clickTarget(uiItemClonesById(harness).get('reloadButtonIcon'));
  await harness.runUntilAsync(() => harness.getBackdropName() === 'Stars');

  assert.equal(uiItemClonesById(harness).size, 0);
  assert.equal(harness.getRuntimeVariable('script'), savedScript);
});

test('restores the clone title UI after a detailed diagnostic and green flag restart', async (context) => {
  const harness = await loadDiagnosticVm();
  context.after(() => harness.quit());
  harness.setStageVariable('featureDetailedScriptErrors', true);

  harness.greenFlag();
  await harness.runUntilAsync(() => uiItemClonesById(harness).size === 7);
  harness.setRuntimeVariable('script', 'kamishibai=2.0');
  harness.broadcast('startStory');
  await harness.runUntilAsync(() => Boolean(harness.getRuntimeVariable('kamishibaiErrorCategory')));
  assert.equal(uiItemClonesById(harness).size, 0);

  harness.greenFlag();
  await harness.runUntilAsync(
    () =>
      harness.getRuntimeVariable('skipMode') === 'title' && uiItemClonesById(harness).size === 7,
  );
  assert.equal(harness.getSprite('prompt').visible, false);
});

test('shows the official website button only on Title and opens the package homepage', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());

  harness.greenFlag();
  const button = harness.getSprite('officialWebsiteButton');
  await harness.runUntilAsync(() => uiItemClonesById(harness).size === 7);
  assert.equal(button.visible, true);
  assert.equal(button.x, 0);
  assert.equal(button.y, -16);

  harness.clickSprite('officialWebsiteButton');
  assert.deepEqual(harness.extensionState.openedUrls, [officialWebsiteUrl]);
  harness.clickTarget(uiItemClonesById(harness).get('officialWebsiteLabel'));
  assert.deepEqual(harness.extensionState.openedUrls, [officialWebsiteUrl, officialWebsiteUrl]);

  harness.broadcast('showMenu');
  harness.runUntil(() => !button.visible);
  harness.broadcast('showTitle');
  harness.runUntil(() => button.visible);

  await startFixture(harness);
  assert.equal(button.visible, false);
});

test('closes Title from the top-right close button using the same flow as a Stage click', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());

  harness.greenFlag();
  const closeButton = harness.getSprite('closeTitleButton');
  await harness.runUntilAsync(() => uiItemClonesById(harness).size === 7);
  assert.equal(closeButton.visible, true);
  assert.equal(closeButton.x, 220);
  assert.equal(closeButton.y, 160);

  harness.clickSprite('closeTitleButton');
  await harness.runUntilAsync(() => uiItemClonesById(harness).has('openButton'));

  assert.equal(closeButton.visible, false);
  assert.equal(harness.getSprite('officialWebsiteButton').visible, false);
  assert.equal(harness.hasRuntimeVariable('skipMode'), false);
});

test('closes Title when runtime-generated Title text is clicked', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());

  harness.greenFlag();
  await harness.runUntilAsync(() => uiItemClonesById(harness).has('titleHeading'));
  harness.clickTarget(uiItemClonesById(harness).get('titleHeading'));
  await harness.runUntilAsync(() => uiItemClonesById(harness).has('openButton'));

  assert.equal(uiItemClonesById(harness).has('titleHeading'), false);
  assert.equal(harness.hasRuntimeVariable('skipMode'), false);
});

test('initializes the idle pose charge rate to zero', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());

  harness.greenFlag();
  harness.runUntil(() => harness.getRuntimeVariable('skipMode') === 'title');

  assert.equal(harness.getRuntimeVariable('poseRecog'), '0.5');
  assert.equal(harness.getRuntimeVariable('poseCharge'), '10');
  assert.equal(harness.getRuntimeVariable('poseIdle'), '0');
});

test('does not add idle charge below the recognition threshold by default', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());
  await startFixture(harness, poseFixtureUrl);
  harness.runUntil(() => harness.getRuntimeVariable('skipContext') === 'pose');

  harness.extensionState.poseMatches = false;
  harness.extensionState.poseScore = 1;
  const initialCharge = harness.getStageVariable('チャージ');
  harness.step({milliseconds: 100, count: 20});

  assert.equal(harness.getStageVariable('チャージ'), initialCharge);
  assert.equal(harness.getStageVariable('poseIndex'), '1');
});

test('prioritizes the loading backdrop and costumes and reports only regular asset progress', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());

  startScript(
    harness,
    [
      'kamishibai=3.2',
      'asset=Title,backdrop',
      'asset=LoadingBackground,backdrop:Title',
      'asset=loading1,costume:Loading:loading',
      'asset=Music,https://example.com/test-music.mp3',
      'asset=loading2,costume:Loading:loading',
      'asset=Stars,backdrop',
      'setLoadingBackdrop=LoadingBackground',
      'setLoadingCostume=loading1, loading2',
      'cover=Title,',
      '---',
      'sceneLabel=first',
      'action=stage:Stars',
      'action=wait:30',
    ].join('\n'),
  );

  assert.deepEqual(
    harness.extensionState.assetRegistrations.filter((name) =>
      ['Title', 'LoadingBackground', 'loading1', 'Music', 'loading2', 'Stars'].includes(name),
    ),
    ['LoadingBackground', 'loading1', 'loading2', 'Title', 'Music', 'Stars'],
  );
  assert.equal(
    harness.extensionState.displayedAssetHistory.find(({targetName}) => targetName === 'Stage')
      ?.assetName,
    'LoadingBackground',
  );
  const loadingHistory = harness.extensionState.displayedAssetHistory
    .filter(({targetName}) => targetName === 'Loading')
    .map(({assetName}) => assetName)
    .filter((assetName, index, values) => index === 0 || assetName !== values[index - 1]);
  assert.deepEqual(loadingHistory, ['loading1', 'loading2', 'loading1']);
  assert.deepEqual(
    harness.extensionState.runtimeVariableWrites
      .filter(({name}) => name === 'message')
      .map(({value}) => value),
    ['1 / 3', '2 / 3', '3 / 3'],
  );
  assert.deepEqual(
    harness.extensionState.bubbleUpdates.filter(
      ({targetName}) => targetName === 'Loading' || targetName === 'LoadingBubbleAnchor',
    ),
    [
      {targetName: 'LoadingBubbleAnchor', text: '1 / 3', type: 'say'},
      {targetName: 'LoadingBubbleAnchor', text: '2 / 3', type: 'say'},
      {targetName: 'LoadingBubbleAnchor', text: '3 / 3', type: 'say'},
      {targetName: 'LoadingBubbleAnchor', text: '', type: 'say'},
    ],
  );
  const loadingBubbleAnchor = harness.getSprite('LoadingBubbleAnchor');
  assert.equal(loadingBubbleAnchor.getCustomState('Scratch.looks')?.text, '');
  assert.equal(
    loadingBubbleAnchor.getCostumes()[loadingBubbleAnchor.currentCostume]?.name,
    'loading-bubble-anchor',
  );
  assert.deepEqual([loadingBubbleAnchor.x, loadingBubbleAnchor.y], [1, -20]);
  assert.equal(loadingBubbleAnchor.visible, false);
  assert.equal(harness.getSprite('Loading').getCustomState('Scratch.looks')?.text ?? '', '');
  assert.equal(harness.getSprite('Loading').visible, false);
});

test('keeps asynchronous URL progress monotonic and flushes it before completion', async (context) => {
  const harness = await loadKamishibaiVm({
    asyncAssetDisplay: true,
    asyncExternalAssets: true,
  });
  context.after(() => harness.quit());

  await startScriptAsync(
    harness,
    [
      'kamishibai=3.2',
      'asset=Title,backdrop',
      'asset=loading1,costume:Loading:loading',
      'asset=Music,https://example.com/test-music.mp3',
      'asset=Stars,backdrop',
      'setLoadingCostume=loading1',
      'cover=Title,',
      '---',
      'sceneLabel=first',
      'action=stage:Stars',
      'action=wait:30',
    ].join('\n'),
  );

  const progressText = () =>
    harness.extensionState.bubbleUpdates
      .filter(({targetName}) => targetName === 'LoadingBubbleAnchor')
      .map(({text}) => text);
  assert.deepEqual(progressText(), ['1 / 3', '2 / 3', '3 / 3', '']);

  const completedValues = progressText()
    .filter(Boolean)
    .map((text) => Number.parseInt(text, 10));
  assert(
    completedValues.every((value, index) => index === 0 || value > completedValues[index - 1]),
  );

  const updateCountAfterCompletion = progressText().length;
  const displayCountAfterCompletion = harness.extensionState.displayedAssetHistory.filter(
    ({targetName}) => targetName === 'Loading',
  ).length;
  for (let index = 0; index < 5; index += 1) {
    harness.step();
    await Promise.resolve();
  }
  assert.equal(progressText().length, updateCountAfterCompletion);
  assert.equal(
    harness.extensionState.displayedAssetHistory.filter(({targetName}) => targetName === 'Loading')
      .length,
    displayCountAfterCompletion,
  );
});

test('keeps the built-in Loading costume separate from the fixed bubble anchor', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());

  startScript(
    harness,
    [
      'kamishibai=3.2',
      'asset=Title,backdrop',
      'asset=Stars,backdrop',
      'cover=Title,',
      '---',
      'sceneLabel=first',
      'action=stage:Stars',
      'action=wait:30',
    ].join('\n'),
  );

  const loading = harness.getSprite('Loading');
  assert.equal(loading.getCostumes()[loading.currentCostume]?.name, 'loading');
  assert.equal(
    harness.extensionState.displayedAssetHistory.some(({targetName}) => targetName === 'Loading'),
    false,
  );
  assert.deepEqual(
    harness.extensionState.bubbleUpdates
      .filter(({targetName}) => targetName === 'LoadingBubbleAnchor')
      .map(({text}) => text),
    ['1 / 2', '2 / 2', ''],
  );
});

for (const branchCase of [
  {condition: 'true', expectedSceneIndex: 3, expectedBackdrop: 'Stars'},
  {condition: 'false', expectedSceneIndex: 2, expectedBackdrop: 'Title'},
]) {
  test(`branches to the first true label when the first condition is ${branchCase.condition}`, async (context) => {
    const harness = await loadKamishibaiVm();
    context.after(() => harness.quit());
    startScript(
      harness,
      sceneNavigationScript(['wait:0.1', 'branch:chooseRoute', 'wait:30'], {
        runtimeVariables: [`takeSeaRoute:${branchCase.condition}`],
        branches: ['chooseRoute:takeSeaRoute,true:ocean,home'],
      }),
    );

    harness.runUntil(
      () =>
        Number(harness.getRuntimeVariable('sceneIndex')) === branchCase.expectedSceneIndex &&
        harness.getBackdropName() === branchCase.expectedBackdrop,
    );
    assert.equal(harness.getBackdropName(), branchCase.expectedBackdrop);
  });
}

test('continues the current scene when no registered branch condition is true', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());
  startScript(
    harness,
    sceneNavigationScript(['wait:0.1', 'branch:noRoute', 'stage:Title', 'wait:30'], {
      branches: ['noRoute:false,false:ocean,home'],
    }),
  );

  harness.runUntil(
    () =>
      harness.getBackdropName() === 'Title' &&
      Number(harness.getRuntimeVariable('sceneIndex')) === 1 &&
      harness.getRuntimeVariable('actionCommand') === 'wait',
  );
  assert.equal(harness.hasRuntimeVariable('nextSceneLabel'), false);
});

test('changes scene from a registered physical key input', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());
  startScript(
    harness,
    sceneNavigationScript(['keyInputToChangeScene:ArrowLeft,ArrowRight:home,ocean', 'wait:30']),
  );
  harness.runUntil(() => harness.extensionState.keyInputBindings.size === 2);
  assert.equal(harness.extensionState.keyInputBindings.get('ArrowLeft').VALUE, 'home');
  assert.equal(harness.extensionState.keyInputBindings.get('ArrowRight').VALUE, 'ocean');

  harness.triggerAsyncKey('ArrowRight');
  harness.runUntil(() => Number(harness.getRuntimeVariable('sceneIndex')) === 3);

  assert.equal(harness.getBackdropName(), 'Stars');
  assert.equal(harness.extensionState.keyInputBindings.size, 0);
});

test('changes scene from a registered actor touch input', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());
  startScript(
    harness,
    sceneNavigationScript([
      'LeftDoor:show:LeftDoor:-100,0,50',
      'RightDoor:show:RightDoor:100,0,50',
      'touchInputToChangeScene:LeftDoor,RightDoor:home,ocean',
      'wait:30',
    ]),
  );
  harness.runUntil(() => harness.extensionState.touchInputBindings.size === 2);
  assert.equal(harness.extensionState.touchInputBindings.get('LeftDoor').VALUE, 'home');
  assert.equal(harness.extensionState.touchInputBindings.get('RightDoor').VALUE, 'ocean');

  harness.triggerActorTouch('RightDoor');
  harness.runUntil(() => Number(harness.getRuntimeVariable('sceneIndex')) === 3);

  assert.equal(harness.getBackdropName(), 'Stars');
  assert.equal(harness.extensionState.touchInputBindings.size, 0);
});

test('accepts only Space while the title is active', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());

  harness.greenFlag();
  harness.runUntil(() => harness.getRuntimeVariable('skipMode') === 'title');

  harness.pressKey('ArrowRight');
  assert.equal(harness.getRuntimeVariable('skipMode'), 'title');
  harness.pressKey('ArrowDown');
  assert.equal(harness.getRuntimeVariable('skipMode'), 'title');

  harness.pressKey(' ');
  harness.runUntil(() => !harness.hasRuntimeVariable('skipMode'));
  assert.equal(harness.getBackdropName(), 'Stars');
});

test('keeps the external script flow when the embedded script slot is empty', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());

  harness.greenFlag();
  harness.runUntil(() => harness.getRuntimeVariable('skipMode') === 'title');
  assert.equal(harness.getStageVariable('__tmpose_embedded_script'), '');

  harness.clickStage();
  harness.runUntil(() => !harness.hasRuntimeVariable('skipMode'));
  assert.equal(harness.hasRuntimeVariable('script'), false);
});

test('keeps app-shell UI independent from scene 0 while allowing its pose prompt', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());

  harness.greenFlag();
  harness.runUntil(() => harness.getRuntimeVariable('skipMode') === 'title');
  harness.broadcast('showMenu');
  await harness.runUntilAsync(() => uiItemClonesById(harness).has('openButton'));

  const openButton = uiItemClonesById(harness).get('openButton');
  assert.equal(harness.extensionState.displayedText.get(openButton.id), appShellLocales.en.ui.open);

  harness.setRuntimeVariable(
    'script',
    [
      'kamishibai=3.2',
      'text=ui.prompt:ポーズをとろう！',
      'text=ui.invalidScript:エラー：不正な台本ファイル',
      'text=ui.open:ファイルをひらく',
      'text=ui.reload:もういちど',
      'text=ui.about:このアプリについて',
      'asset=Title,backdrop',
      'asset=Stars,backdrop',
      'cover=Title,',
      '---',
      'sceneLabel=first',
      'action=stage:Stars',
      'action=wait:30',
    ].join('\n'),
  );
  harness.broadcast('hideMenu');
  harness.broadcast('startStory');
  harness.runUntil(() => harness.getBackdropName() === 'Stars');

  assert.equal(harness.getRuntimeVariable('text:ui.prompt'), 'ポーズをとろう！');
  assert.equal(harness.getRuntimeVariable('text:ui.open'), appShellLocales.en.ui.open);

  harness.broadcast('showPrompt');
  harness.runUntil(() => harness.getSprite('prompt')?.visible === true);
  const prompt = harness.getSprite('prompt');
  assert.equal(harness.extensionState.displayedText.get(prompt.id), 'ポーズをとろう！');

  harness.broadcast('invalidScript');
  harness.runUntil(
    () =>
      harness.extensionState.displayedText.get(prompt.id) === appShellLocales.en.ui.invalidScript,
  );

  harness.broadcast('showMenu');
  await harness.runUntilAsync(
    () =>
      uiItemClonesById(harness).has('reloadButton') &&
      uiItemClonesById(harness).has('showTitleButton'),
  );
  const savedScriptMenuClones = uiItemClonesById(harness);
  assert.equal(
    harness.extensionState.displayedText.get(savedScriptMenuClones.get('openButton').id),
    appShellLocales.en.ui.open,
  );
  assert.equal(
    harness.extensionState.displayedText.get(savedScriptMenuClones.get('reloadButton').id),
    appShellLocales.en.ui.reload,
  );
  assert.equal(
    harness.extensionState.displayedText.get(savedScriptMenuClones.get('showTitleButton').id),
    appShellLocales.en.ui.about,
  );
  assert.equal(harness.extensionState.kamishibaiRuntime.getLegacyTextWarningJson(), '');
  assert.equal(harness.extensionState.kamishibaiRuntime.getLegacyTextWarningEmissionCount(), 0);
  assert.deepEqual(harness.extensionState.consoleErrors, []);
});

test('keeps deprecated text assets functional in both DSL 3.1 and 3.2 scripts', async (context) => {
  for (const dslVersion of ['3.1', '3.2']) {
    const harness = await loadKamishibaiVm();
    context.after(() => harness.quit());
    startScript(
      harness,
      [
        `kamishibai=${dslVersion}`,
        'asset=Title,backdrop',
        'asset=Stars,backdrop',
        'asset=Narration,text',
        'asset=Caption,text:Narration',
        'actor=Narration,Narration',
        'actor=Caption,Caption',
        'text=ui.prompt:ポーズをとろう！',
        'textStyle=ui.prompt:color:#ff6666',
        'text=Narration:本文',
        'textStyle=Narration:font:Sans Serif',
        'cover=Title,',
        '---',
        'sceneLabel=first',
        'action=stage:Stars',
        'action=text:Narration:むかし',
        'action=Narration:show:Narration:0,0,100',
        'action=Caption:setSkin:Caption',
        'action=wait:30',
      ].join('\n'),
    );

    harness.runUntil(
      () =>
        harness.getRuntimeVariable('text:Narration') === 'むかし' &&
        harness.getActor('Narration')?.visible === true,
    );

    assert.equal(harness.getBackdropName(), 'Stars');
    assert.equal(harness.getActor('Narration')?.visible, true);
    assert.notEqual(harness.getActor('Caption'), undefined);
    assert.equal(harness.extensionState.assetRegistrations.includes('Narration'), true);
    assert.equal(harness.extensionState.assetRegistrations.includes('Caption'), true);
    assert.equal(harness.getRuntimeVariable('text:Narration'), 'むかし');
    assert.equal(harness.getRuntimeVariable('textStyle:Narration:font'), 'Sans Serif');
    assert.equal(harness.hasRuntimeVariable('Narration'), false);
    assert.deepEqual(
      JSON.parse(harness.extensionState.kamishibaiRuntime.getLegacyTextWarningJson()),
      {
        code: 'LEGACY_TEXT_ASSET_DEPRECATED',
        dslVersion,
        names: ['Narration', 'Caption'],
      },
    );
    assert.equal(harness.extensionState.kamishibaiRuntime.getLegacyTextWarningEmissionCount(), 1);

    harness.extensionState.kamishibaiRuntime.validateScriptOrStop();
    assert.equal(harness.extensionState.kamishibaiRuntime.getLegacyTextWarningEmissionCount(), 1);
    assert.deepEqual(harness.extensionState.consoleErrors, []);
  }
});

test('uses SVG Text actors alongside deprecated text assets in DSL 3.2', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());
  startScript(
    harness,
    [
      'kamishibai=3.2',
      'asset=Title,backdrop',
      'asset=Stars,backdrop',
      'asset=Hero,costume:Loading:loading',
      'asset=Narration,text',
      'actor=Hero,Hero',
      'text=Narration:旧テキスト',
      'svgTextStyle=title:#112233:#ffffff:Noto Sans JP:150:center:up',
      'cover=Title,',
      '---',
      'sceneLabel=first',
      'action=stage:Stars',
      'action=text:Narration:移行中も利用可能',
      'action=Hero:show:Hero:0,0,100',
      'action=Hero:setText:タイトル\\nサブタイトル:title',
      'action=wait:30',
    ].join('\n'),
  );

  harness.runUntil(() => harness.getActorSvgText('Hero') !== undefined);

  assert.deepEqual(harness.extensionState.svgTextStyles.get('title'), {
    alignment: 'center',
    backgroundColor: '#112233',
    font: 'Noto Sans JP',
    fontPercent: 150,
    textColor: '#ffffff',
  });
  // The bubble direction now belongs to the Bubble style of the same name.
  assert.deepEqual(harness.extensionState.bubbleStyles.get('title'), {
    placement: 'up',
    textStyle: 'title',
  });
  assert.deepEqual(harness.getActorSvgText('Hero'), {
    style: 'title',
    text: 'タイトル\nサブタイトル',
  });
  assert.equal(harness.getRuntimeVariable('text:Narration'), '移行中も利用可能');
  assert.deepEqual(harness.extensionState.consoleErrors, []);
});

test('preserves SVG Text canonical, compass, and Scratch degree directions in DSL 3.2', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());
  const directions = [
    'up',
    'up-up-right',
    'up-right',
    'right-up-right',
    'right',
    'right-down-right',
    'down-right',
    'down-down-right',
    'down',
    'down-down-left',
    'down-left',
    'left-down-left',
    'left',
    'left-up-left',
    'up-left',
    'up-up-left',
    'north',
    'north-northeast',
    'northeast',
    'east-northeast',
    'east',
    'east-southeast',
    'southeast',
    'south-southeast',
    'south',
    'south-southwest',
    'southwest',
    'west-southwest',
    'west',
    'west-northwest',
    'northwest',
    'north-northwest',
    '0',
    '90',
    '180',
    '270',
    '360',
    '22.5',
  ];
  startScript(
    harness,
    [
      'kamishibai=3.2',
      'asset=Title,backdrop',
      'asset=Stars,backdrop',
      'asset=Hero,costume:Loading:loading',
      'actor=Hero,Hero',
      ...directions.map(
        (direction, index) =>
          `svgTextStyle=direction${index}:#ffffff:#222222:Noto Sans JP:100:left:${direction}`,
      ),
      'cover=Title,',
      '---',
      'sceneLabel=first',
      'action=stage:Stars',
      'action=Hero:show:Hero:0,0,100',
      'action=wait:30',
    ].join('\n'),
  );

  for (const [index, direction] of directions.entries()) {
    assert.equal(harness.extensionState.bubbleStyles.get(`direction${index}`).placement, direction);
  }
  assert.deepEqual(harness.extensionState.consoleErrors, []);
});

test('registers and displays a text asset through the production Asset Manager', async (context) => {
  const harness = await loadKamishibaiVm({productionAssetManager: true});
  context.after(() => harness.quit());
  assert.equal(typeof harness.vm.runtime.getOpcodeFunction('text_setText'), 'function');
  const actor = harness.vm.runtime.targets.find(
    (target) => target.isOriginal && target.sprite?.name === 'Actor',
  );
  const util = {runtime: harness.vm.runtime, target: actor};

  await harness.extensionState.assetManager.registerAsset({
    NAME: 'Narration',
    RESOURCE_ID: 'text',
  });
  await harness.extensionState.assetManager.setTextValue({
    NAME: 'Narration',
    VALUE: 'むかし',
  });
  await harness.extensionState.assetManager.setThisSpriteSkin({NAME: 'Narration'}, util);

  assert.equal(harness.extensionState.assetManager?.isLoaded({NAME: 'Narration'}), true);
  assert.equal(harness.extensionState.displayedText.get(actor.id), 'むかし');
  assert.equal(harness.extensionState.textColors.get(actor.id), '#ffffff');
  assert.equal(harness.extensionState.textOutlineWidths.get(actor.id), 2);
  assert.equal(harness.extensionState.textOutlineColors.get(actor.id), '#000000');

  await harness.extensionState.assetManager.setTextValue({
    NAME: 'Narration',
    VALUE: 'むかし　むかし、あるところに...',
  });
  assert.equal(
    harness.extensionState.displayedText.get(actor.id),
    'むかし　むかし、あるところに...',
  );

  await harness.extensionState.assetManager.setTextValue({
    NAME: 'Narration',
    VALUE: '',
  });
  assert.equal(harness.extensionState.displayedText.get(actor.id), '');
  assert.deepEqual(harness.extensionState.consoleErrors, []);
});

test('production Asset Manager prepares and cycles loading assets', async (context) => {
  const harness = await loadKamishibaiVm({productionAssetManager: true});
  context.after(() => harness.quit());
  const manager = harness.extensionState.assetManager;
  const stage = harness.getStage();
  const assetList = stage.lookupVariableByNameAndType('assetList', 'list');
  assetList.value = [
    'Title,backdrop',
    'LoadingBackground,backdrop:Title',
    'loading1,costume:Loading:loading',
    'Music,https://example.com/test-music.mp3',
    'loading2,costume:Loading:loading',
  ];

  manager.setLoadingBackdrop({NAME: 'LoadingBackground'});
  manager.setLoadingCostumes({NAMES: 'loading1, loading2, loading1'});
  manager.prepareLoadingAssets({LIST: 'assetList'}, {target: stage});

  assert.deepEqual(Array.from(assetList.value), [
    'LoadingBackground,backdrop:Title',
    'loading1,costume:Loading:loading',
    'loading2,costume:Loading:loading',
    'Title,backdrop',
    'Music,https://example.com/test-music.mp3',
  ]);
  assert.equal(manager.loadingAssetCount(), 3);
  assert.equal(manager.loadingBackdrop(), 'LoadingBackground');
  assert.equal(manager.loadingCostumeAt({INDEX: 1}), 'loading1');
  assert.equal(manager.loadingCostumeAt({INDEX: 2}), 'loading2');
  assert.equal(manager.loadingCostumeAt({INDEX: 3}), 'loading1');
});

test('ignores rehearsal keys while the project is stopped', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());

  harness.greenFlag();
  harness.runUntil(() => harness.getRuntimeVariable('skipMode') === 'title');
  harness.stopAll();

  for (const key of [' ', 'ArrowRight', 'ArrowDown']) {
    harness.pressKey(key);
    assert.equal(harness.hasRuntimeVariable('skipMode'), false, `${key} was not ignored.`);
  }
});

test('clears pending input at project, cover, stop, and final scene boundaries', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());

  harness.setRuntimeVariable('skipMode', 'scene');
  harness.setRuntimeVariable('skipContext', 'action');
  harness.greenFlag();
  harness.runUntil(() => harness.getRuntimeVariable('skipMode') === 'title');
  assert.equal(harness.hasRuntimeVariable('skipContext'), false);

  harness.setRuntimeVariable('skipMode', 'action');
  harness.setRuntimeVariable('skipContext', 'pose');
  harness.broadcast('showCover');
  harness.runUntil(() => !harness.hasRuntimeVariable('skipMode'));
  assert.equal(harness.hasRuntimeVariable('skipContext'), false);

  harness.setRuntimeVariable('skipMode', 'scene');
  harness.setRuntimeVariable('skipContext', 'action');
  harness.stopAll();
  assert.equal(harness.hasRuntimeVariable('skipMode'), false);
  assert.equal(harness.hasRuntimeVariable('skipContext'), false);

  startScript(
    harness,
    [
      'kamishibai=3.2',
      'asset=Title,backdrop',
      'asset=Stars,backdrop',
      'cover=Title,',
      '---',
      'sceneLabel=only',
      'action=stage:Stars',
      'action=wait:0.1',
    ].join('\n'),
  );
  harness.runUntil(
    () => harness.getBackdropName() === 'Title' && !harness.hasRuntimeVariable('skipContext'),
  );
  assert.equal(harness.hasRuntimeVariable('skipMode'), false);
});

test('keeps a wait active without input and accepts Right during the action', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());
  await startFixture(harness);

  harness.step({milliseconds: 100, count: 20});
  assert.equal(harness.getBackdropName(), 'Stars');
  assert.equal(harness.getRuntimeVariable('sceneIndex'), '1');

  harness.pressKey('ArrowRight');
  harness.runUntil(() => harness.getBackdropName() !== 'Stars');
  assert.equal(harness.getBackdropName(), 'Title');
  assert.equal(harness.getRuntimeVariable('sceneIndex'), '1');
  assert.equal(harness.hasRuntimeVariable('skipMode'), false);
});

test('accepts keys only in their specified runtime contexts', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());

  harness.greenFlag();
  harness.runUntil(() => harness.getRuntimeVariable('skipMode') === 'title');
  harness.stopAll();

  const assertInput = (runtimeContext, key, expected) => {
    harness.deleteRuntimeVariable('skipMode');
    harness.setRuntimeVariable('skipContext', runtimeContext);
    harness.pressKey(key);
    assert.equal(harness.getRuntimeVariable('skipMode'), expected);
  };

  assertInput('pose', ' ', 'pose');
  assertInput('pose', 'ArrowRight', 'action');
  assertInput('pose', 'ArrowDown', 'scene');
  assertInput('action', ' ', undefined);
  assertInput('action', 'ArrowRight', 'action');
  assertInput('action', 'ArrowDown', 'scene');
  assertInput('betweenActions', ' ', undefined);
  assertInput('betweenActions', 'ArrowRight', undefined);
  assertInput('betweenActions', 'ArrowDown', 'scene');
  assertInput('scene', ' ', undefined);
  assertInput('scene', 'ArrowRight', undefined);
  assertInput('scene', 'ArrowDown', 'scene');
});

test('keeps the first accepted input until its owner consumes it', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());

  harness.greenFlag();
  harness.runUntil(() => harness.getRuntimeVariable('skipMode') === 'title');
  harness.stopAll();
  harness.setRuntimeVariable('skipContext', 'pose');

  harness.pressKey(' ');
  harness.pressKey('ArrowRight');
  harness.pressKey('ArrowDown');
  assert.equal(harness.getRuntimeVariable('skipMode'), 'pose');
});

test('accepts Down during an action and advances to the next scene', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());
  await startFixture(harness);

  harness.pressKey('ArrowDown');
  harness.runUntil(() => harness.getRuntimeVariable('sceneIndex') === 2);

  assert.equal(harness.getRuntimeVariable('sceneIndex'), 2);
  assert.equal(harness.getBackdropName(), 'Stars');
  assert.equal(harness.hasRuntimeVariable('skipMode'), false);
});

test('preserves BGM and applies stateful tail actions when Down skips a scene', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());
  startScript(
    harness,
    [
      'kamishibai=3.2',
      'asset=Title,backdrop',
      'asset=Stars,backdrop',
      'asset=Music,https://example.com/music.mp3',
      'asset=NextMusic,https://example.com/next-music.mp3',
      'cover=Title,',
      '---',
      'sceneLabel=first',
      'action=stage:Stars',
      'action=bgm:Music',
      'action=transition:fadeOut',
      'action=stage:Title',
      'action=wait:30',
      'action=bgm:NextMusic',
      'action=transition:fadeUp',
      'action=stage:Title',
      '---',
      'sceneLabel=second',
      'action=wait:30',
    ].join('\n'),
  );
  harness.runUntil(() => {
    const brightness = harness.getStageEffect('brightness');
    return harness.isSoundPlaying('Music') && brightness > -100 && brightness < 0;
  });

  harness.pressKey('ArrowDown');
  harness.runUntil(
    () => harness.getRuntimeVariable('sceneIndex') === 2 && !harness.hasRuntimeVariable('skipMode'),
  );

  assert.equal(harness.getStageEffect('brightness'), 0);
  assert.equal(harness.getBackdropName(), 'Stars');
  assert.equal(harness.isSoundPlaying('Music'), true);
  assert.equal(harness.isSoundPlaying('NextMusic'), true);
});

test('stops only the current sound when Down skips a scene', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());
  startScript(
    harness,
    [
      'kamishibai=3.2',
      'asset=Title,backdrop',
      'asset=Stars,backdrop',
      'asset=Music,https://example.com/music.mp3',
      'asset=Effect,https://example.com/effect.mp3',
      'cover=Title,',
      '---',
      'sceneLabel=first',
      'action=stage:Stars',
      'action=bgm:Music',
      'action=sound:Effect',
      'action=wait:30',
      '---',
      'sceneLabel=second',
      'action=wait:30',
    ].join('\n'),
  );
  harness.runUntil(() => harness.isSoundPlaying('Effect'));

  harness.pressKey('ArrowDown');
  harness.runUntil(() => harness.getRuntimeVariable('sceneIndex') === 2);

  assert.equal(harness.isSoundPlaying('Effect'), false);
  assert.equal(harness.isSoundPlaying('Music'), true);
  assert.equal(harness.hasRuntimeVariable('skipMode'), false);
});

test('applies stateful actions when Down skips before they execute', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());
  const script = [
    'kamishibai=3.2',
    'asset=Title,backdrop',
    'asset=Stars,backdrop',
    'asset=Music,https://example.com/music.mp3',
    'cover=Title,',
    '---',
    'sceneLabel=first',
    'action=wait:30',
    'action=stage:Stars',
    'action=bgm:Music',
    'action=transition:fadeOut',
    'action=stage:Stars',
    '---',
    'sceneLabel=second',
    'action=wait:30',
  ].join('\n');

  harness.greenFlag();
  harness.runUntil(() => harness.getRuntimeVariable('skipMode') === 'title');
  harness.setRuntimeVariable('script', script);
  harness.broadcast('startStory');
  harness.runUntil(() => Number(harness.getRuntimeVariable('sceneIndex')) === 1);
  harness.setRuntimeVariable('skipContext', 'scene');

  harness.pressKey('ArrowDown');
  harness.runUntil(
    () =>
      Number(harness.getRuntimeVariable('sceneIndex')) === 2 &&
      !harness.hasRuntimeVariable('skipMode'),
  );

  assert.equal(harness.getStageEffect('brightness'), -100);
  assert.equal(harness.getBackdropName(), 'LoadingBackdrop');
  assert.equal(harness.isSoundPlaying('Music'), true);
});

test('consumes Space inside a pose action and continues with its next pose', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());
  await startFixture(harness, poseFixtureUrl);
  harness.runUntil(() => harness.getRuntimeVariable('skipContext') === 'pose');

  harness.pressKey(' ');
  harness.runUntil(() => harness.getStageVariable('poseIndex') === 2);

  assert.equal(harness.getRuntimeVariable('skipContext'), 'pose');
  assert.equal(harness.hasRuntimeVariable('skipMode'), false);
  assert.equal(harness.getBackdropName(), 'Stars');
});

test('plays configured pose recognition sounds and resets them for the next script', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());
  startScript(
    harness,
    [
      'kamishibai=3.2',
      'asset=Title,backdrop',
      'asset=Stars,backdrop',
      'asset=Hero,costume:Loading:loading',
      'asset=Tick,https://example.com/tick.mp3',
      'asset=Confirm,https://example.com/confirm.mp3',
      'setPoseRecognitionSound=Tick,Confirm',
      'actor=Hero,Hero',
      'cover=Title,',
      '---',
      'sceneLabel=first',
      'action=stage:Stars',
      'action=Hero:pose:Hero:pose1:',
      'action=stage:Title',
      'action=wait:30',
    ].join('\n'),
  );
  harness.runUntil(() => harness.getRuntimeVariable('skipContext') === 'pose');

  assert.equal(harness.isSoundPlaying('Tick'), true);
  assert.equal(harness.isSoundPlaying('Confirm'), false);
  assert.equal(harness.getRuntimeVariable('poseRecognitionSound'), 'Tick');
  assert.equal(harness.getRuntimeVariable('poseRecognitionSound2'), 'Confirm');

  harness.extensionState.poseMatches = true;
  harness.extensionState.poseScore = 1;
  harness.runUntil(() => harness.isSoundPlaying('Confirm'));

  harness.runUntil(() => harness.getBackdropName() === 'Title');
  assert.equal(harness.isSoundPlaying('Tick'), false);

  harness.extensionState.poseMatches = false;
  harness.extensionState.poseScore = 0;
  startScript(
    harness,
    [
      'kamishibai=3.2',
      'asset=Title,backdrop',
      'asset=Stars,backdrop',
      'asset=Hero,costume:Loading:loading',
      'actor=Hero,Hero',
      'cover=Title,',
      '---',
      'sceneLabel=first',
      'action=stage:Stars',
      'action=Hero:pose:Hero:pose1:',
      'action=wait:30',
    ].join('\n'),
  );
  harness.runUntil(() => harness.getRuntimeVariable('skipContext') === 'pose');

  assert.equal(harness.hasRuntimeVariable('poseRecognitionSound'), false);
  assert.equal(harness.hasRuntimeVariable('poseRecognitionSound2'), false);
  assert.equal(harness.extensionState.playingSounds.size, 0);
});

test('keeps a single pose recognition sound backward compatible', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());
  startScript(
    harness,
    [
      'kamishibai=3.2',
      'asset=Title,backdrop',
      'asset=Stars,backdrop',
      'asset=Hero,costume:Loading:loading',
      'asset=Tick,https://example.com/tick.mp3',
      'setPoseRecognitionSound=Tick',
      'actor=Hero,Hero',
      'cover=Title,',
      '---',
      'sceneLabel=first',
      'action=stage:Stars',
      'action=Hero:pose:Hero:pose1:',
      'action=stage:Title',
      'action=wait:30',
    ].join('\n'),
  );
  harness.runUntil(() => harness.getRuntimeVariable('skipContext') === 'pose');

  assert.equal(harness.getRuntimeVariable('poseRecognitionSound'), 'Tick');
  assert.equal(harness.hasRuntimeVariable('poseRecognitionSound2'), false);
  assert.equal(harness.isSoundPlaying('Tick'), true);
  assert.equal(harness.isSoundPlaying(''), false);

  harness.extensionState.poseMatches = true;
  harness.extensionState.poseScore = 1;
  harness.runUntil(() => harness.getBackdropName() === 'Title');
});

test('propagates Right from a pose to the action boundary', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());
  await startFixture(harness, poseFixtureUrl);
  harness.runUntil(() => harness.getRuntimeVariable('skipContext') === 'pose');

  harness.pressKey('ArrowRight');
  harness.runUntil(() => harness.getBackdropName() === 'Title');

  assert.equal(harness.getRuntimeVariable('sceneIndex'), '1');
  assert.equal(harness.hasRuntimeVariable('skipMode'), false);
});

test('propagates Down from a pose to the scene boundary', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());
  await startFixture(harness, poseFixtureUrl);
  harness.runUntil(() => harness.getRuntimeVariable('skipContext') === 'pose');

  harness.pressKey('ArrowDown');
  harness.runUntil(() => harness.getRuntimeVariable('sceneIndex') === 2);

  assert.equal(harness.getBackdropName(), 'Stars');
  assert.equal(harness.hasRuntimeVariable('skipMode'), false);
});

for (const command of ['say', 'think']) {
  test(`clears a ${command} bubble when Right finishes the action`, async (context) => {
    const harness = await loadKamishibaiVm();
    context.after(() => harness.quit());
    startScript(harness, actorActionScript(`Hero:${command}:message:30`));
    harness.runUntil(() => harness.getBubbleText('Hero') === 'message');

    harness.pressKey('ArrowRight');
    harness.runUntil(() => harness.getBackdropName() === 'Title', {maxSteps: 50});

    assert.equal(harness.getBubbleText('Hero'), '');
    assert.equal(harness.hasRuntimeVariable('skipMode'), false);
  });

  test(`applies and clears a Bubble style for a timed ${command} bubble`, async (context) => {
    const harness = await loadKamishibaiVm();
    context.after(() => harness.quit());
    startScript(
      harness,
      actorActionScript(`Hero:${command}:message:5.0:baloonStyle`, {
        declarations: ['svgTextStyle=baloonStyle:#ffffff:#222222:Noto Sans JP:120:left:up-right'],
      }),
    );
    const actor = () => harness.getActor('Hero');
    harness.runUntil(
      () => harness.extensionState.styledBubbles.get(actor()?.id)?.message === 'message',
    );

    assert.deepEqual(harness.extensionState.styledBubbleUpdates.at(-1), {
      message: 'message',
      style: 'baloonStyle',
      targetId: actor().id,
      type: command,
    });
    assert.deepEqual(harness.extensionState.bubbleStyles.get('baloonStyle'), {
      placement: 'up-right',
      textStyle: 'baloonStyle',
    });
    // A styled bubble is Bubble's own overlay; Scratch's native bubble stays empty.
    assert.equal(harness.getBubbleText('Hero'), '');

    harness.step({milliseconds: 5000});
    harness.runUntil(() => harness.getBackdropName() === 'Title', {maxSteps: 50});

    assert.equal(harness.extensionState.styledBubbles.has(actor().id), false);
    assert.equal(harness.hasRuntimeVariable('actionParam3'), false);
  });

  test(`clears a styled ${command} bubble when Right finishes the action`, async (context) => {
    const harness = await loadKamishibaiVm();
    context.after(() => harness.quit());
    startScript(
      harness,
      actorActionScript(`Hero:${command}:message:5.0:baloonStyle`, {
        declarations: ['svgTextStyle=baloonStyle:#ffffff:#222222:Noto Sans JP:120:left:up-right'],
      }),
    );
    const actor = () => harness.getActor('Hero');
    harness.runUntil(
      () => harness.extensionState.styledBubbles.get(actor()?.id)?.message === 'message',
    );

    harness.pressKey('ArrowRight');
    harness.runUntil(() => harness.getBackdropName() === 'Title', {maxSteps: 50});

    assert.equal(harness.extensionState.styledBubbles.has(actor().id), false);
    assert.equal(harness.hasRuntimeVariable('actionParam3'), false);
  });
}

test('moves an actor to the destination when Right finishes a glide', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());
  startScript(
    harness,
    actorActionScript('Hero:moveTo:100,50,30', {
      before: ['Hero:show:Hero:0,0,30'],
    }),
  );
  harness.runUntil(
    () =>
      harness.getRuntimeVariable('actionCommand') === 'moveTo' &&
      harness.getRuntimeVariable('skipContext') === 'action',
  );

  harness.pressKey('ArrowRight');
  harness.runUntil(() => harness.getBackdropName() === 'Title', {maxSteps: 50});

  assert.equal(harness.getActor('Hero').x, 100);
  assert.equal(harness.getActor('Hero').y, 50);
  assert.equal(harness.hasRuntimeVariable('skipMode'), false);
});

test('stops an asset sound when Right finishes sound-until-done', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());
  startScript(
    harness,
    [
      'kamishibai=3.2',
      'asset=Title,backdrop',
      'asset=Stars,backdrop',
      'asset=Effect,https://example.com/test-effect.mp3',
      'asset=Music,https://example.com/music.mp3',
      'cover=Title,',
      '---',
      'sceneLabel=first',
      'action=stage:Stars',
      'action=bgm:Music',
      'action=sound:Effect',
      'action=stage:Title',
      'action=wait:30',
      '---',
      'sceneLabel=second',
      'action=stage:Stars',
      'action=wait:30',
    ].join('\n'),
  );
  harness.runUntil(() => harness.isSoundPlaying('Effect'));

  harness.pressKey('ArrowRight');
  harness.runUntil(() => harness.getBackdropName() === 'Title', {maxSteps: 50});

  assert.equal(harness.isSoundPlaying('Effect'), false);
  assert.equal(harness.isSoundPlaying('Music'), true);
  assert.equal(harness.hasRuntimeVariable('skipMode'), false);
});

test('keeps BGM playing when Right finishes an unrelated wait', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());
  startScript(
    harness,
    [
      'kamishibai=3.2',
      'asset=Title,backdrop',
      'asset=Stars,backdrop',
      'asset=Music,https://example.com/test-music.mp3',
      'cover=Title,',
      '---',
      'sceneLabel=first',
      'action=stage:Stars',
      'action=bgm:Music',
      'action=wait:30',
      'action=stage:Title',
      'action=wait:30',
      '---',
      'sceneLabel=second',
      'action=stage:Stars',
      'action=wait:30',
    ].join('\n'),
  );
  harness.runUntil(
    () => harness.isSoundPlaying('Music') && harness.getRuntimeVariable('actionCommand') === 'wait',
  );

  harness.pressKey('ArrowRight');
  harness.runUntil(() => harness.getBackdropName() === 'Title', {maxSteps: 50});

  assert.equal(harness.isSoundPlaying('Music'), true);
  assert.equal(harness.hasRuntimeVariable('skipMode'), false);
});

for (const transition of [
  {
    name: 'fadeOut',
    before: [],
    finalBrightness: -100,
    isInProgress: (brightness) => brightness > -100 && brightness < 0,
  },
  {
    name: 'fadeUp',
    before: ['action=transition:fadeOut'],
    finalBrightness: 0,
    isInProgress: (brightness) => brightness > -100 && brightness < 0,
  },
  {
    name: 'fadeToWhite',
    before: [],
    finalBrightness: 100,
    isInProgress: (brightness) => brightness > 0 && brightness < 100,
  },
  {
    name: 'fadeFromWhite',
    before: ['action=transition:fadeToWhite'],
    finalBrightness: 0,
    isInProgress: (brightness) => brightness > 0 && brightness < 100,
  },
]) {
  test(`applies the final brightness when ${transition.name} completes`, async (context) => {
    const harness = await loadKamishibaiVm();
    context.after(() => harness.quit());
    startScript(
      harness,
      [
        'kamishibai=3.2',
        'asset=Title,backdrop',
        'asset=Stars,backdrop',
        'cover=Title,',
        '---',
        'sceneLabel=first',
        'action=stage:Stars',
        ...transition.before,
        `action=transition:${transition.name}`,
        'action=wait:30',
      ].join('\n'),
    );

    harness.runUntil(() => harness.getRuntimeVariable('actionCommand') === 'wait');

    assert.equal(harness.getStageEffect('brightness'), transition.finalBrightness);
  });

  test(`applies the final brightness when Right finishes ${transition.name}`, async (context) => {
    const harness = await loadKamishibaiVm();
    context.after(() => harness.quit());
    startScript(
      harness,
      [
        'kamishibai=3.2',
        'asset=Title,backdrop',
        'asset=Stars,backdrop',
        'cover=Title,',
        '---',
        'sceneLabel=first',
        'action=stage:Stars',
        ...transition.before,
        `action=transition:${transition.name}`,
        'action=stage:Title',
        'action=wait:30',
        '---',
        'sceneLabel=second',
        'action=stage:Stars',
        'action=wait:30',
      ].join('\n'),
    );
    harness.runUntil(() => {
      const brightness = harness.getStageEffect('brightness');
      return (
        harness.getRuntimeVariable('actionParam') === transition.name &&
        transition.isInProgress(brightness)
      );
    });

    harness.pressKey('ArrowRight');
    harness.runUntil(() => harness.getBackdropName() === 'Title', {maxSteps: 50});

    assert.equal(harness.getStageEffect('brightness'), transition.finalBrightness);
    assert.equal(harness.hasRuntimeVariable('skipMode'), false);
  });
}

test('applies the final image when a later Right input finishes a sequence', async (context) => {
  const harness = await loadKamishibaiVm();
  context.after(() => harness.quit());
  startScript(
    harness,
    [
      'kamishibai=3.2',
      'asset=Title,backdrop',
      'asset=Stars,backdrop',
      'asset=Hero,costume:Loading:loading',
      'asset=Hero2,costume:Loading:loading',
      'actor=Hero,Hero',
      'cover=Title,',
      '---',
      'sceneLabel=first',
      'action=stage:Stars',
      'action=Hero:sequence:Hero,Hero2:30',
      'action=wait:30',
      'action=stage:Title',
      'action=wait:30',
      '---',
      'sceneLabel=second',
      'action=stage:Stars',
      'action=wait:30',
    ].join('\n'),
  );
  harness.runUntil(
    () =>
      harness.getActorSkin('Hero') === 'Hero' &&
      harness.getRuntimeVariable('actionCommand') === 'wait',
  );

  harness.pressKey('ArrowRight');
  harness.runUntil(() => harness.getBackdropName() === 'Title', {maxSteps: 50});

  assert.equal(harness.getActorSkin('Hero'), 'Hero2');
  assert.equal(harness.hasRuntimeVariable('skipMode'), false);
});
