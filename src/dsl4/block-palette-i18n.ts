/**
 * Palette groups and Japanese texts of the Kamishibai blocks.
 *
 * Block texts are written in English in the block definitions; `getInfo()` swaps in another language's texts
 * when the editor uses it. Opcodes, argument names and menu values never change, so projects stay the same in
 * every language. Groups follow the `groups` / `paletteGroup` declaration that TurboWarp Plus reads: each group
 * has an ID that settings record and a display name per language, where `\n` starts a new line. Other editors
 * ignore both fields and show one category.
 */

/** A display name per language. */
export type Dsl4LocalizedName = Readonly<Record<string, string>>;

/** A mark on the group's icon: a circle in `color` with a white glyph drawn on a 24-unit grid. */
export interface Dsl4GroupBadge {
  readonly color: string;
  /** SVG path data of the glyph. */
  readonly glyph: string;
  /** Fills the glyph instead of stroking it. */
  readonly filled?: boolean;
}

export interface Dsl4PaletteGroup {
  readonly id: string;
  readonly name: Dsl4LocalizedName;
  /** Tells the group's icon apart from the extension's: the extension's icon with this badge. */
  readonly badge?: Dsl4GroupBadge;
  readonly color1?: string;
  readonly color2?: string;
  readonly color3?: string;
  /** The opcodes the group holds, without the extension ID. */
  readonly opcodes: readonly string[];
}

/** The texts of one language: the extension name, block texts by opcode, and menu item texts by value. */
export interface Dsl4BlockTexts {
  readonly name?: string;
  readonly blocks?: Readonly<Record<string, string | readonly string[]>>;
  readonly menus?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/** Texts by language code, such as `ja`. English is the definitions' own text. */
export type Dsl4BlockTranslations = Readonly<Record<string, Dsl4BlockTexts>>;

/**
 * The extension info in `language`: block texts, menu item texts and the name from its translation, when there is
 * one. Self-contained, so the inert authoring extension can carry it as source text.
 */
export function localizeDsl4ExtensionInfo<T>(
  info: T,
  translations: Dsl4BlockTranslations,
  language: string | undefined,
): T {
  type Entry = Record<string, unknown>;
  const isEntry = (value: unknown): value is Entry => !!value && typeof value === 'object';
  const own = (object: unknown, key: string) =>
    isEntry(object) && Object.prototype.hasOwnProperty.call(object, key);
  const code = String(language || '')
    .toLowerCase()
    .split(/[-_]/)[0];
  const table = code && own(translations, code) ? translations[code] : undefined;
  if (!table || !isEntry(info)) return info;
  const blocks: Entry = table.blocks || {};
  const menus: Entry = table.menus || {};
  const localized: Entry = {...info};
  if (typeof table.name === 'string') localized.name = table.name;
  if (Array.isArray(info.blocks)) {
    localized.blocks = info.blocks.map((block: unknown) =>
      isEntry(block) && typeof block.opcode === 'string' && own(blocks, block.opcode)
        ? {...block, text: blocks[block.opcode]}
        : block,
    );
  }
  if (isEntry(info.menus)) {
    const localizedMenus: Entry = {};
    for (const [menuName, menu] of Object.entries(info.menus)) {
      const texts = own(menus, menuName) ? menus[menuName] : undefined;
      const items = Array.isArray(menu)
        ? (menu as unknown[])
        : isEntry(menu) && Array.isArray(menu.items)
          ? (menu.items as unknown[])
          : undefined;
      if (!isEntry(texts) || !items) {
        localizedMenus[menuName] = menu;
        continue;
      }
      const translated = items.map((item: unknown) => {
        const value = typeof item === 'string' ? item : isEntry(item) ? item.value : undefined;
        return typeof value === 'string' && own(texts, value) ? {text: texts[value], value} : item;
      });
      localizedMenus[menuName] = Array.isArray(menu)
        ? translated
        : {...(menu as Entry), items: translated};
    }
    localized.menus = localizedMenus;
  }
  return localized as T;
}

/**
 * An icon for a group: the extension's icon (SVG markup) with the badge at its lower right, as a data URL. The
 * extension's icon is drawn in a 64-unit square whatever its own size.
 */
export function dsl4BadgedIconURI(baseSvg: string, badge: Dsl4GroupBadge): string {
  const base = baseSvg.replace(/^<svg\b[^>]*>/, (tag) =>
    tag.replace(/\s(?:width|height)="[^"]*"/g, '').replace('<svg', '<svg width="64" height="64"'),
  );
  const paint = badge.filled
    ? 'fill="#fff"'
    : 'fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    base +
    `<circle cx="47" cy="47" r="16" fill="${badge.color}" stroke="#fff" stroke-width="3"/>` +
    `<path transform="translate(37 37) scale(0.833)" ${paint} d="${badge.glyph}"/>` +
    '</svg>';
  // Scratch Blocks puts the icon in an unquoted CSS url(), where parentheses and quotes must be escaped too.
  const encoded = encodeURIComponent(svg).replace(
    /[()'!*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `data:image/svg+xml,${encoded}`;
}

/**
 * The info with its groups declared and each block of a group marked with `paletteGroup`. Given the extension's
 * icon, each group with a badge gets that icon with its badge.
 */
export function withDsl4PaletteGroups<T extends {blocks: readonly unknown[]}>(
  info: T,
  groups: readonly Dsl4PaletteGroup[],
  iconSvg?: string,
): T & {groups: (Omit<Dsl4PaletteGroup, 'opcodes' | 'badge'> & {menuIconURI?: string})[]} {
  const groupOf = new Map(
    groups.flatMap((group) => group.opcodes.map((opcode) => [opcode, group.id])),
  );
  return {
    ...info,
    groups: groups.map(({opcodes: _opcodes, badge, ...group}) => ({
      ...group,
      ...(badge && iconSvg ? {menuIconURI: dsl4BadgedIconURI(iconSvg, badge)} : {}),
    })),
    blocks: info.blocks.map((block) => {
      const opcode =
        block && typeof block === 'object' ? (block as {opcode?: unknown}).opcode : undefined;
      const group = typeof opcode === 'string' ? groupOf.get(opcode) : undefined;
      return group ? {...(block as object), paletteGroup: group} : block;
    }),
  };
}

const narrativeColors = {color1: '#98683d', color2: '#805731', color3: '#684629'} as const;

/** The groups of the retired Block Script extension, still written for bases that predate the merge. */
export const dsl4AuthoringPaletteGroups: readonly Dsl4PaletteGroup[] = Object.freeze([
  {
    id: 'structure',
    badge: {color: '#7b4ba8', glyph: 'M4 6h16M8 12h12M8 18h12'},
    name: {en: 'Story\nstructure', ja: '台本の\n骨組み'},
    opcodes: ['kamishibai', 'kamishibaiConfig', 'includeBlocks', 'property', 'scene', 'useSection'],
  },
  {
    id: 'definitions',
    badge: {
      color: '#3f8fd2',
      glyph: 'M12 4a4 4 0 1 1 0 8a4 4 0 1 1 0-8M4 21c0-5 3.5-7 8-7s8 2 8 7',
    },
    name: {en: 'Assets and\nactors', ja: '素材と\n登場人物'},
    opcodes: ['asset', 'actor', 'control', 'textStyle', 'variable'],
  },
  {
    id: 'settings',
    badge: {color: '#5a6b80', glyph: 'M4 7h16M4 17h16M9 4v6M15 14v6'},
    name: {en: 'Story\nsettings', ja: '作品の\n設定'},
    opcodes: ['cover', 'loading', 'recognition', 'viewport'],
  },
  {
    id: 'pose',
    badge: {
      color: '#d4566a',
      glyph: 'M12 2a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5M12 9v6M5 6l7 4 7-4M12 15l-5 7M12 15l5 7',
    },
    name: {en: 'Pose\nsteps', ja: 'ポーズの\n手順'},
    opcodes: ['poseSteps', 'poseStep'],
  },
  {
    id: 'flow',
    badge: {color: '#98683d', glyph: 'M6 3v18M6 12h5l7-7M11 12l7 7'},
    name: {en: 'Story\nflow', ja: '流れの\n制御'},
    ...narrativeColors,
    opcodes: ['narrativeIf', 'narrativeRepeat', 'narrativeForEach'],
  },
  {
    id: 'values',
    badge: {color: '#98683d', glyph: 'M5 9h14M5 15h14'},
    name: {en: 'Conditions\nand values', ja: '条件と値'},
    ...narrativeColors,
    opcodes: [
      'narrativeReference',
      'narrativeVariable',
      'narrativeCompare',
      'narrativeLogic',
      'narrativeLogicList',
      'narrativeNot',
    ],
  },
  {
    id: 'details',
    badge: {color: '#6b7280', glyph: 'M5 12h.01M12 12h.01M19 12h.01'},
    name: {en: 'Details', ja: '詳しい\n指定'},
    opcodes: ['actionOptions', 'customAction'],
  },
]);

/** Japanese texts of the retired Block Script extension; the runtime reuses its block texts. */
export const dsl4AuthoringTranslations: Dsl4BlockTranslations = Object.freeze({
  ja: {
    name: '紙芝居の台本ブロック（旧形式）',
    blocks: {
      kamishibai: '紙芝居 [VERSION] [LABEL]',
      kamishibaiConfig: '紙芝居の設定 [LABEL]',
      includeBlocks: 'ブロックを取り込む [LABEL]',
      property: '台本の項目 [PATH] = JSON [VALUE]',
      asset: '素材 [NAME] = JSON [VALUE]',
      control: '操作 [NAME] = JSON [VALUE]',
      actor: '登場人物 [NAME] = JSON [VALUE]',
      textStyle: '文字の書式 [NAME] = JSON [VALUE]',
      variable: '変数 [NAME] = JSON [VALUE]',
      cover: '表紙 = JSON [VALUE]',
      loading: '読み込み画面 = JSON [VALUE]',
      recognition: '認識 = JSON [VALUE]',
      viewport: '表示領域 = JSON [VALUE]',
      scene: 'シーン [SCENE] 属性 JSON [PROPERTIES]',
      useSection: 'この部分を使う [ENABLED]',
      actionOptions: '命令の追加設定 JSON [PROPERTIES]',
      poseSteps: '登場人物 [TARGET] のポーズを順に認識する',
      poseStep: 'ポーズ [POSE] コスチューム [SKIN] 音 [SOUND]',
      narrativeIf: ['もし [CONDITION] ならば', 'でなければ'],
      narrativeRepeat: '[TIMES] 回くりかえす 回次の名前 [AS]',
      narrativeForEach: '一覧 [ITEMS] を順番に それぞれ [AS] について',
      narrativeReference: '[SCOPE] の [COLUMN]',
      narrativeVariable: '台本の変数 [NAME]',
      narrativeLogicList: '[OP] 条件の一覧 [VALUES]',
      narrativeNot: '[VALUE] ではない',
      customAction:
        '登場人物 [TARGET] の独自の命令 [COMMAND] 引数 JSON [ARGUMENTS] 固定ID [STABLEID]',
    },
    menus: {sectionEnabled: {on: '✅ オン', off: '🚫 オフ'}},
  },
});

/** Low-level YAML parts of an embedded document; its four document hats sit in the structure group. */
const yamlPartOpcodes = [
  'yamlMap',
  'yamlKey',
  'yamlSequence',
  'yamlItem',
  'yamlScalar',
  'yamlText',
  'yamlTextLine',
  'yamlComment',
  'yamlLineComment',
  'yamlInlineComment',
];

/**
 * The groups of the Kamishibai blocks, in the order an author builds a story: its frame, what it
 * declares, then what its scenes do.
 *
 * The runtime defines the Block Script declarations itself, so a scene and the actions inside it
 * share one palette. Each opcode belongs to exactly one group.
 */
export const dsl4RuntimePaletteGroups: readonly Dsl4PaletteGroup[] = Object.freeze([
  {
    id: 'structure',
    name: {en: 'Story\nstructure', ja: '台本の\n骨組み'},
    color1: '#7b4ba8',
    badge: {color: '#7b4ba8', glyph: 'M4 6h16M8 12h12M8 18h12'},
    color2: '#683f8f',
    color3: '#563375',
    opcodes: [
      'kamishibai',
      'kamishibaiConfig',
      'includeBlocks',
      'property',
      'scene',
      'useSection',
      'embeddedYamlRoot',
      'embeddedYaml',
      'embeddedYamlConfig',
      'embeddedYamlInclude',
    ],
  },
  {
    id: 'definitions',
    name: {en: 'Assets and\nactors', ja: '素材と\n登場人物'},
    color1: '#3f8fd2',
    badge: {
      color: '#3f8fd2',
      glyph: 'M12 4a4 4 0 1 1 0 8a4 4 0 1 1 0-8M4 21c0-5 3.5-7 8-7s8 2 8 7',
    },
    color2: '#3579b2',
    color3: '#2b6392',
    opcodes: ['asset', 'actor', 'control', 'textStyle', 'variable'],
  },
  {
    id: 'settings',
    name: {en: 'Story\nsettings', ja: '作品の\n設定'},
    color1: '#5a6b80',
    badge: {color: '#5a6b80', glyph: 'M4 7h16M4 17h16M9 4v6M15 14v6'},
    color2: '#4c5b6d',
    color3: '#3f4b5a',
    opcodes: ['cover', 'loading', 'recognition', 'viewport'],
  },
  {
    id: 'stage',
    name: {en: 'Stage', ja: '舞台'},
    color1: '#4c8fe0',
    badge: {color: '#4c8fe0', glyph: 'M2 20 9 10l5 6 3-3 5 7Z', filled: true},
    color2: '#4079be',
    color3: '#35649c',
    opcodes: ['stage', 'transition', 'presentationEffect'],
  },
  {
    id: 'sound',
    name: {en: 'Sound', ja: '音'},
    color1: '#bf5fc4',
    badge: {
      color: '#bf5fc4',
      glyph: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0M20 16a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
    },
    color2: '#a250a6',
    color3: '#854289',
    opcodes: ['bgm', 'stopBgm', 'setBgmVolume', 'sound'],
  },
  {
    id: 'media',
    name: {en: 'Audio and\nvideo', ja: '音声・\n動画'},
    color1: '#8a63d2',
    badge: {color: '#8a63d2', glyph: 'M3 6h18v12H3ZM3 10h18M8 6v4M13 6v4'},
    color2: '#7554b2',
    color3: '#604593',
    opcodes: ['audio', 'audioControl', 'video', 'videoControl'],
  },
  {
    id: 'speech',
    name: {en: 'Speech\nand text', ja: 'セリフと\n文字'},
    color1: '#36a874',
    badge: {color: '#36a874', glyph: 'M3 4h18v12H11l-6 5v-5H3Z'},
    color2: '#2d8e62',
    color3: '#257551',
    opcodes: ['say', 'think', 'setText', 'sayText', 'thinkText'],
  },
  {
    id: 'actor',
    name: {en: 'Show\nactors', ja: '登場人物の\n表示'},
    color1: '#2a9d96',
    badge: {
      color: '#2a9d96',
      glyph: 'M12 4a4 4 0 1 1 0 8a4 4 0 1 1 0-8M4 21c0-5 3.5-7 8-7s8 2 8 7',
    },
    color2: '#23857f',
    color3: '#1d6d69',
    opcodes: [
      'show',
      'hide',
      'setTransparency',
      'moveTo',
      'animate',
      'setSkin',
      'setLayer',
      'loop',
    ],
  },
  {
    id: 'flow',
    name: {en: 'Story\nflow', ja: '進行'},
    color1: '#e0a030',
    badge: {color: '#e0a030', glyph: 'M3 12h15M13 6l6 6-6 6'},
    color2: '#be8828',
    color3: '#9c7021',
    opcodes: [
      'wait',
      'goto',
      'branch',
      'broadcastMessageAndWait',
      'narrativeIf',
      'narrativeRepeat',
      'narrativeForEach',
    ],
  },
  {
    id: 'values',
    name: {en: 'Conditions\nand values', ja: '条件と値'},
    ...narrativeColors,
    badge: {color: '#98683d', glyph: 'M5 9h14M5 15h14'},
    opcodes: [
      'narrativeReference',
      'narrativeVariable',
      'narrativeCompare',
      'narrativeLogic',
      'narrativeLogicList',
      'narrativeNot',
    ],
  },
  {
    id: 'input',
    name: {en: 'Move by\ninput', ja: '入力で\n移動'},
    color1: '#e0753a',
    badge: {color: '#e0753a', glyph: 'M5 3l13 9-6 1.5 3.5 7-3 1.5-3.5-7L5 18Z', filled: true},
    color2: '#be6331',
    color3: '#9c5128',
    opcodes: [
      'keyInputToChangeScene',
      'touchInputToChangeScene',
      'poseInputToChangeScene',
      'imageInputToChangeScene',
    ],
  },
  {
    id: 'pose',
    name: {en: 'Pose', ja: 'ポーズ'},
    color1: '#d4566a',
    badge: {
      color: '#d4566a',
      glyph: 'M12 2a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5M12 9v6M5 6l7 4 7-4M12 15l-5 7M12 15l5 7',
    },
    color2: '#b4495a',
    color3: '#943c4a',
    opcodes: ['pose', 'poseSteps', 'poseStep'],
  },
  {
    id: 'variables',
    name: {en: 'Story\nvariables', ja: '台本の\n変数'},
    color1: '#ec8a2e',
    badge: {color: '#ec8a2e', glyph: 'M6 6l12 12M18 6 6 18'},
    color2: '#c87527',
    color3: '#a56020',
    opcodes: [
      'setVariable',
      'changeVariable',
      'toggleVariable',
      'storyVariableReporter',
      'storyVariableExists',
      'storyVariableType',
    ],
  },
  {
    id: 'status',
    name: {en: 'Story\nstatus', ja: '進行の\n状態'},
    color1: '#4ea3c4',
    badge: {color: '#4ea3c4', glyph: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18M12 11v6M12 7.5v.01'},
    color2: '#428aa6',
    color3: '#367289',
    opcodes: [
      'storyStatusReporter',
      'currentSceneIdReporter',
      'currentActionNumberReporter',
      'currentActionPathReporter',
      'posePhaseReporter',
      'poseTargetReporter',
      'poseNameReporter',
      'poseStepNumberReporter',
      'applicationStatusReporter',
      'canNavigateToPreviousAction',
      'canNavigateToNextAction',
    ],
  },
  {
    id: 'details',
    name: {en: 'Details', ja: '詳しい\n指定'},
    color1: '#6b7280',
    badge: {color: '#6b7280', glyph: 'M5 12h.01M12 12h.01M19 12h.01'},
    color2: '#5a606c',
    color3: '#4a4f59',
    opcodes: ['actionOptions', 'customAction'],
  },
  {
    id: 'debug',
    name: {en: 'Debugging', ja: '開発・\n診断'},
    color1: '#748091',
    badge: {color: '#748091', glyph: 'M12 4v10M12 19v.01'},
    color2: '#626c7b',
    color3: '#515965',
    opcodes: [
      'debugger',
      'lastRuntimeErrorCodeReporter',
      'lastRuntimeErrorStoryPathReporter',
      'runtimeVersionReporter',
      'versionReporter',
      'statusReporter',
      'lastErrorReporter',
      'binaryBackingStatusReporter',
      'runtimeDiagnosticsReporter',
      'setTextValue',
      'showTitle',
      'closeTitle',
      'openOfficialWebsite',
      'toggleTitleLanguage',
    ],
  },
  {
    id: 'document',
    name: {en: 'YAML\nparts', ja: 'YAMLの\n部品'},
    color1: '#6b7280',
    badge: {
      color: '#6b7280',
      glyph: 'M9 4C6 4 6 6 6 8s-2 4-2 4 2 0 2 4 0 4 3 4M15 4c3 0 3 2 3 4s2 4 2 4-2 0-2 4 0 4-3 4',
    },
    color2: '#5a606c',
    color3: '#4a4f59',
    opcodes: yamlPartOpcodes,
  },
]);

/** Japanese texts of the runtime blocks. */
export const dsl4RuntimeTranslations: Dsl4BlockTranslations = Object.freeze({
  ja: {
    name: '紙芝居',
    blocks: {
      // The declarations keep the texts they had in the retired Block Script extension.
      ...dsl4AuthoringTranslations.ja!.blocks,
      embeddedYamlRoot: '組込YAMLの起点 [VERSION] [DOCUMENT]',
      embeddedYaml: '組込YAML [DOCUMENT]',
      embeddedYamlConfig: '組込YAMLの設定 [DOCUMENT]',
      embeddedYamlInclude: '組込YAMLを取り込む [DOCUMENT]',
      stage: '背景を [BACKDROP] にする',
      bgm: 'BGM [SOUND] を流す',
      stopBgm: 'BGM を [SECONDS] 秒かけて止める',
      setBgmVolume: 'BGM の音量を [SECONDS] 秒かけて [VOLUME] % にする',
      sound: '終わるまで音 [SOUND] を鳴らす',
      audio:
        '音声 [ID] を [SOURCE_TYPE] [SOURCE] から用意する フェードイン [FADEIN] 秒 音量 [VOLUME] % フェードアウト [FADEOUT] 秒',
      audioControl:
        '音声 [ID] を [OPERATION] 値 [VALUE] フェードイン [FADEIN] 秒 音量 [VOLUME] % フェードアウト [FADEOUT] 秒',
      video:
        '動画 [ID] を [SOURCE_TYPE] [SOURCE] から表示する x [X] y [Y] 幅 [WIDTH] 高さ [HEIGHT] 面 [PLANE] 重なり [ZINDEX]',
      videoControl: '動画 [ID] を [OPERATION] 値 [VALUE]',
      wait: '[SECONDS] 秒待つ',
      debugger: 'デバッガーで止める',
      broadcastMessageAndWait: '[MESSAGE] を送って待つ',
      transition: '[EFFECT] で [SECONDS] 秒かけて切り替える',
      presentationEffect:
        '[SCOPE] に [EFFECT] の演出を [SECONDS] 秒適用する パラメーター JSON [PARAMS]',
      goto: 'シーン [SCENE] へ移る',
      branch: '分岐 [BRANCH] を選ぶ',
      setVariable: '台本の変数 [NAME] を [VALUE] にする 型 [TYPE]',
      changeVariable: '台本の変数 [NAME] を [BY] ずつ変える',
      toggleVariable: '台本の変数 [NAME] を反転する',
      keyInputToChangeScene: 'キー入力で移る 行き先 [ROUTES]',
      touchInputToChangeScene: '登場人物へのタッチで移る 行き先 [ROUTES]',
      poseInputToChangeScene: 'ポーズで移る 行き先 [ROUTES]',
      imageInputToChangeScene: '画像のラベルで移る 行き先 [ROUTES]',
      show: '登場人物 [TARGET] をコスチューム [SKIN] x [X] y [Y] 大きさ [SCALE] % 回転 [ROTATION] 向き [DIRECTION] で表示する',
      hide: '登場人物 [TARGET] を隠す',
      setTransparency: '登場人物 [TARGET] の透明度を [SPEC] にする',
      moveTo: '登場人物 [TARGET] を [SECONDS] 秒で x [X] y [Y] へ動かす [EASING]',
      animate: '登場人物 [TARGET] をアニメーションさせる 指定 JSON [SPEC]',
      say: '登場人物 [TARGET] が言う 指定 [SPEC]',
      think: '登場人物 [TARGET] が考える 指定 [SPEC]',
      setSkin: '登場人物 [TARGET] のコスチュームを [SKIN] にする 大きさ [SCALE]',
      setLayer: '登場人物 [TARGET] の重なりを [LAYER] にする',
      loop: '登場人物 [TARGET] のコスチュームを繰り返す 手順 [STEPS]',
      setText: '文字の登場人物 [TARGET] を [TEXT] にする 書式 [STYLE]',
      pose: '登場人物 [TARGET] のポーズを順に認識する 手順 [STEPS]',
      sayText: '登場人物 [TARGET] が [TEXT] と [SECONDS] 秒言う',
      thinkText: '登場人物 [TARGET] が [TEXT] と [SECONDS] 秒考える',
      storyVariableReporter: '台本の変数 [NAME]',
      storyVariableExists: '台本の変数 [NAME] がある',
      storyVariableType: '台本の変数 [NAME] の型',
      storyStatusReporter: '台本の状態',
      currentSceneIdReporter: '今のシーンのID',
      currentActionNumberReporter: '今の命令の番号',
      currentActionPathReporter: '今の命令の位置',
      lastRuntimeErrorCodeReporter: '最後のエラーのコード',
      lastRuntimeErrorStoryPathReporter: '最後のエラーの台本の位置',
      posePhaseReporter: 'ポーズ認識の段階',
      poseTargetReporter: 'ポーズ認識の登場人物',
      poseNameReporter: 'ポーズの名前',
      poseStepNumberReporter: 'ポーズの手順の番号',
      runtimeVersionReporter: '紙芝居 DSL 4.0 ランタイムの版',
      applicationStatusReporter: 'アプリの状態',
      canNavigateToPreviousAction: '前の命令へ戻れる',
      canNavigateToNextAction: '次の命令へ進める',
      versionReporter: '紙芝居 DSL 4.0 ランタイムの版',
      statusReporter: '紙芝居 DSL 4.0 ランタイムの状態',
      lastErrorReporter: '紙芝居 DSL 4.0 ランタイムのエラー',
      binaryBackingStatusReporter: '紙芝居 DSL 4.0 のバイナリーの保存状態',
      runtimeDiagnosticsReporter: '紙芝居 DSL 4.0 ランタイムの診断情報',
      setTextValue: '内部の文字 [NAME] を [VALUE] にする',
      showTitle: 'タイトル画面を出す',
      closeTitle: 'タイトル画面を閉じる',
      openOfficialWebsite: '公式サイトを開く',
      toggleTitleLanguage: 'タイトルの言語を切り替える',
    },
    menus: {
      ...dsl4AuthoringTranslations.ja!.menus,
      dsl4VideoSourceType: {asset: '素材', url: 'URL'},
      dsl4VideoPlane: {front: '前面', background: '背面'},
      dsl4VideoOperation: {
        playUntilDone: '終わるまで再生',
        play: '再生',
        resume: '再開',
        pause: '一時停止',
        stop: '停止',
        loop: '繰り返し再生',
        seek: '位置を移す',
        setVolume: '音量を設定',
        setMuted: '消音を設定',
        setPlaybackRate: '再生速度を設定',
      },
      dsl4TransitionEffect: {
        fadeOut: 'フェードアウト',
        fadeUp: 'フェードアップ',
        fadeToWhite: '白へフェード',
        fadeFromWhite: '白からフェード',
        reset: '元に戻す',
      },
      dsl4PresentationEffectScope: {stage: '舞台', presentation: '画面全体'},
      dsl4MoveEasing: {
        linear: '一定の速さ',
        easeIn: 'だんだん速く',
        easeOut: 'だんだん遅く',
        easeInOut: 'ゆっくり始めてゆっくり止まる',
      },
      dsl4RotationStyle: {
        allAround: '自由に回転',
        leftRight: '左右のみ',
        none: '回転しない',
      },
      dsl4VariableValueType: {string: '文字列', number: '数値', boolean: '真偽値'},
    },
  },
});
