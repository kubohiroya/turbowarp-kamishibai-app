import narrativeSchema from '../../schema/dsl-4-narrative-control.schema.json' with {type: 'json'};
import canonicalSchema from '../../schema/dsl-4.schema.json' with {type: 'json'};
import {createDsl4NarrativeEditorDefinitions} from '../dsl4/narrative-blocks.js';
import {
  dsl4BlockSourceBundleExtensionId,
  dsl4BlockSourceRuntimeExtensionId,
} from '../dsl4/block-source-shared.js';

type Schema = {[key: string]: unknown};
const definitions = canonicalSchema.$defs as Record<string, Schema>;
const editorRoots = {
  asset: ['asset', '素材'],
  control: ['keymap', '操作キー'],
  actor: ['assetId', '登場人物の初期コスチューム'],
  textStyle: ['textStyle', '文字スタイル'],
  variable: ['variableValue', '変数の初期値'],
  cover: ['cover', '表紙'],
  loading: ['loadingScreen', '読み込み画面'],
  recognition: ['poseRecognition', 'ポーズ・画像認識'],
} as const;

const titles: Record<string, string> = {
  compactAsset: 'SB3内の同名素材（短形式）',
  namedBackdrop: '背景',
  namedSound: '音',
  namedCostume: 'コスチューム',
  namedRecognitionModel: '認識モデル',
  namedImage: '操作アイコン画像',
  kind: '素材の種類',
  name: 'SB3内の素材名',
  file: '作品フォルダー内のパス',
  target: '対象アクター',
  source: 'Web上の入手元',
  url: 'HTTPS URL',
  loading: '準備する時期',
  delivery: '配布方法',
  retention: '保持する期間',
  backdrop: '背景アセットID',
  bgm: 'BGMアセットID',
  costumes: 'コスチュームのアセットID',
  size: '大きさ',
  color: '色',
  idleSound: '認識待ちの音',
  chargeSound: '認識完了の音',
  preview: 'カメラプレビュー',
  mirroring: '左右反転',
  modelInitialization: 'モデル初期化',
  sequence: '順番にポーズを行う',
  selection: 'ポーズで選択する',
  feedback: '認識の表示',
  navigation: '場面の移動',
  overlay: '関節とボーンの表示',
  controls: 'カメラ操作ボタン',
  bitmapResolution: '画像の解像度倍率',
  recognitionModel: '認識モデルのアセットID',
  recognitionMode: '認識モード',
  posePreview: '場面のカメラプレビュー',
  entryTransition: '場面開始時の切り替え効果',
};

/** Expand provider constraints into complete forms, avoiding RJSF's untyped true-schema fields. */
function assetVariants(): Schema {
  const variants: Schema[] = [{$ref: '#/$defs/compactAsset'}];
  for (const entry of definitions.asset!.oneOf as {$ref: string}[]) {
    const name = entry.$ref.slice('#/$defs/'.length);
    if (name === 'compactAsset') continue;
    const {oneOf, properties, required, ...base} = definitions[name]!;
    for (const branch of oneOf as Schema[]) {
      const needed = branch.required as string[];
      const provider = ['name', 'file', 'source'].find((key) => needed.includes(key))!;
      const providerTitle = {
        name: 'SB3内の素材',
        file: '作品フォルダーのファイル',
        source: 'Web上のファイル',
      }[provider];
      const props = Object.fromEntries(
        Object.entries(properties as Schema).filter(
          ([key]) => !['name', 'file', 'source'].includes(key) || key === provider,
        ),
      );
      for (const [key, constraint] of Object.entries(branch.properties as Schema)) {
        if (constraint !== true)
          props[key] = {...(props[key] as Schema), ...(constraint as Schema)};
      }
      variants.push({
        ...base,
        title: `${titles[name]} — ${providerTitle}`,
        properties: props,
        required: [...new Set([...(required as string[]), ...needed])],
      });
    }
  }
  return {oneOf: variants};
}

/** Project only the reachable canonical definitions into the editor's draft-07 dialect. */
function editorSchema(root: string | Schema, title: string, preserveConst = false): Schema {
  const selected: Record<string, Schema> = {};
  function convert(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(convert);
    if (typeof value !== 'object' || value === null) return value;
    const source = value as Schema;
    const result: Schema = {};
    for (const [key, child] of Object.entries(source)) {
      // Defaults must not add optional properties to an otherwise unchanged authored value.
      if (key === 'default') continue;
      if (key === '$ref') {
        if (typeof child !== 'string' || !child.startsWith('#/$defs/'))
          throw new TypeError('Authoring editors require local canonical schema references');
        const name = child.slice('#/$defs/'.length);
        if (!Object.hasOwn(selected, name)) {
          const definition = definitions[name];
          if (!definition) throw new TypeError(`Missing authoring schema definition: ${name}`);
          selected[name] = {};
          selected[name] = convert(definition) as Schema;
          if (titles[name]) selected[name].title = titles[name];
        }
        result.$ref = `#/definitions/${name}`;
      } else if (key === 'const') {
        result.enum = [child];
        result.type ??= typeof child;
        // RJSF uses const to replace discriminators when switching between object variants.
        if (preserveConst) result.const = child;
      } else if (key === 'dependentRequired') result.dependencies = convert(child);
      else if (key === 'prefixItems') result.items = convert(child);
      else if (key === 'items' && Object.hasOwn(source, 'prefixItems'))
        result.additionalItems = convert(child);
      else if (key === 'properties') {
        result.properties = Object.fromEntries(
          Object.entries(child as Schema).map(([name, property]) => {
            // RJSF's path-schema walker requires object schemas; true and {} are equivalent here.
            const projected = property === true ? {} : convert(property);
            const required = (source.required as string[] | undefined)?.includes(name);
            const original = property as Schema;
            const referenced =
              typeof original?.$ref === 'string'
                ? definitions[original.$ref.slice('#/$defs/'.length)]
                : original;
            // An impossible null branch preserves absent optional objects and speech style arrays in RJSF.
            // The real branch retains every canonical constraint and is selected for existing data.
            const field =
              !required &&
              (referenced?.type === 'object' ||
                (root === 'speechArgs' && referenced?.type === 'array'))
                ? {
                    oneOf: [
                      {type: 'null', not: {}, title: '設定しない'},
                      {
                        ...(projected as Schema),
                        title: `${titles[name] ?? name}を設定`,
                      },
                    ],
                  }
                : projected;
            return [
              name,
              typeof field === 'object' && field !== null
                ? {
                    ...(field as Schema),
                    ...(titles[name] ? {title: titles[name]} : {}),
                  }
                : field,
            ];
          }),
        );
      } else result[key] = convert(child);
    }
    return result;
  }
  const schema = convert(
    typeof root === 'string'
      ? root === 'asset'
        ? assetVariants()
        : {$ref: `#/$defs/${root}`}
      : root,
  ) as Schema;
  if (root === 'variableValue') {
    const variants = selected.variableValue!.oneOf as Schema[];
    ['文字列', '数値', '真偽値'].forEach((label, index) => (variants[index]!.title = label));
  }
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    ...schema,
    title,
    definitions: selected,
  };
}

/** Serializable registrations; the GUI owns the schema form, draft, validation and commit. */
export function createDsl4BlockAuthoringEditorDefinitions(
  extensionId: string,
  {narrativeControlEnabled = false}: {narrativeControlEnabled?: boolean} = {},
) {
  const valueEditors = Object.entries(editorRoots).map(([opcode, [root, title]]) => ({
    apiVersion: 1,
    extensionId,
    editorId: `definition-${opcode}`,
    opcodes: [`${extensionId}_${opcode}`],
    argument: 'VALUE',
    format: 'json',
    schema: editorSchema(root, title),
  }));
  const scene = definitions.longScene!;
  // Scene actions belong to the connected substack, never to the JSON properties input.
  const sceneProperties = {
    ...scene,
    required: (scene.required as string[]).filter((name) => name !== 'actions'),
    properties: Object.fromEntries(
      Object.entries(scene.properties as Schema).filter(([name]) => name !== 'actions'),
    ),
  };
  return [
    ...valueEditors,
    ...(narrativeControlEnabled
      ? createDsl4NarrativeEditorDefinitions(extensionId, narrativeSchema.$defs)
      : []),
    {
      apiVersion: 1,
      extensionId,
      editorId: 'scene-properties',
      opcodes: [`${extensionId}_scene`],
      argument: 'PROPERTIES',
      format: 'json',
      schema: editorSchema(sceneProperties, '場面の設定', true),
    },
  ];
}

const animateTitles: Record<string, string> = {
  to: '変化させる値',
  seconds: '秒数',
  easing: '動き方',
  delaySeconds: '開始までの秒数',
  repeat: '繰り返す回数',
  alternate: '往復する',
  background: '終わりを待たずに次へ進む',
};
const animateTargetTitles: Record<string, string> = {
  x: 'x座標',
  y: 'y座標',
  scale: '大きさ（%）',
  direction: '向き',
  transparency: '透明度（%）',
};

/** Label the animation fields here, so the shared titles of other forms stay unchanged. */
function animateArgsWithTitles(): Schema {
  const animate = definitions.animateArgs!;
  const properties = animate.properties as Record<string, Schema>;
  const titled = (props: Record<string, Schema>, labels: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(props).map(([name, property]) => [
        name,
        labels[name] ? {...property, title: labels[name]} : property,
      ]),
    );
  return {
    ...animate,
    properties: titled(
      {
        ...properties,
        to: {
          ...properties.to!,
          properties: titled(
            properties.to!.properties as Record<string, Schema>,
            animateTargetTitles,
          ),
        },
      },
      animateTitles,
    ),
  };
}

/** Match action editors to the opcode namespace the authored project's base actually loads. */
export function createDsl4CoreActionBlockEditorDefinitions(
  form: 'runtime' | 'bundle',
  {narrativeControlEnabled = false}: {narrativeControlEnabled?: boolean} = {},
) {
  const extensionId =
    form === 'bundle' ? dsl4BlockSourceBundleExtensionId : dsl4BlockSourceRuntimeExtensionId;
  const opcodePrefix =
    form === 'bundle' ? `${extensionId}_${dsl4BlockSourceRuntimeExtensionId}__` : `${extensionId}_`;
  const steps = (definitions.poseArgs!.properties as Record<string, Schema>).steps!;
  function speechSchema(title: string) {
    const schema = editorSchema('speechArgs', title);
    if (narrativeControlEnabled) {
      const speech = (schema.definitions as Record<string, Schema>).speechArgs!;
      const properties = speech.properties as Record<string, Schema>;
      for (const [name, property] of Object.entries(properties))
        properties[name] = {
          anyOf: [property, {...narrativeSchema.$defs.reference, title: '各回の値参照'}],
        };
    }
    return schema;
  }
  return [
    {
      apiVersion: 1,
      extensionId,
      editorId: 'action-pose-steps',
      opcodes: [`${opcodePrefix}pose`],
      argument: 'STEPS',
      format: 'json',
      schema: editorSchema(steps, 'ポーズ認識の手順'),
    },
    {
      apiVersion: 1,
      extensionId,
      editorId: 'action-animate-spec',
      opcodes: [`${opcodePrefix}animate`],
      argument: 'SPEC',
      format: 'json',
      schema: editorSchema(animateArgsWithTitles(), 'アニメーション'),
    },
    ...(['say', 'think'] as const).map((command) => ({
      apiVersion: 1,
      extensionId,
      editorId: `action-${command}-spec`,
      opcodes: [`${opcodePrefix}${command}`],
      argument: 'SPEC',
      format: 'json',
      schema: speechSchema(command === 'say' ? 'セリフ' : '心の声'),
    })),
  ];
}
