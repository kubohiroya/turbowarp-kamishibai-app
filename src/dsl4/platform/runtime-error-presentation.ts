import {diagnosticText, runtimeErrorCauses} from '../runtime-error-context.js';
import {
  dsl4RuntimeErrorRemedy,
  dsl4SchemaFieldRemedy,
  dsl4UnknownErrorRemedy,
} from './runtime-error-remedies.js';

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const actionNames: Readonly<Record<string, readonly [string, string]>> = {
  stage: ['背景を変える', 'Change backdrop'],
  bgm: ['BGMを再生する', 'Play BGM'],
  stopBgm: ['BGMを止める', 'Stop BGM'],
  setBgmVolume: ['BGMの音量を変える', 'Change BGM volume'],
  audio: ['音声を再生する', 'Play audio'],
  audioControl: ['音声を操作する', 'Control audio'],
  video: ['動画を再生する', 'Play video'],
  videoControl: ['動画を操作する', 'Control video'],
  transition: ['場面を切り替える', 'Transition'],
  gotoSegment: ['別の章へ移動する', 'Go to segment'],
  setVariable: ['変数の値を設定する', 'Set variable'],
  changeVariable: ['変数の値を変える', 'Change variable'],
  toggleVariable: ['変数を切り替える', 'Toggle variable'],
  keyInputToChangeScene: ['キー入力で場面を選ぶ', 'Choose scene by key'],
  touchInputToChangeScene: ['タッチで場面を選ぶ', 'Choose scene by touch'],
  setTransparency: ['透明度を変える', 'Change transparency'],
  moveTo: ['移動する', 'Move'],
  setSkin: ['見た目を変える', 'Change costume'],
  setLayer: ['重なり順を変える', 'Change layer'],
  loop: ['見た目を繰り返す', 'Loop costumes'],
  setText: ['文字を設定する', 'Set text'],
  broadcastMessageAndWait: ['メッセージを送って待つ', 'Broadcast and wait'],
  debugger: ['デバッグで停止する', 'Pause for debugging'],
  backdrop: ['背景を変える', 'Change backdrop'],
  setBackdrop: ['背景を変える', 'Change backdrop'],
  show: ['表示する', 'Show'],
  hide: ['隠す', 'Hide'],
  say: ['セリフを表示する', 'Say'],
  think: ['心の声を表示する', 'Think'],
  wait: ['待つ', 'Wait'],
  goto: ['場面へ移動する', 'Go to scene'],
  branch: ['条件で場面を選ぶ', 'Choose scene'],
  pose: ['ポーズを認識する', 'Recognize pose'],
  poseInputToChangeScene: ['ポーズで場面を選ぶ', 'Choose scene by pose'],
  imageInputToChangeScene: ['画像で場面を選ぶ', 'Choose scene by image'],
  playSound: ['音を再生する', 'Play sound'],
  sound: ['音を再生する', 'Play sound'],
  playVideo: ['動画を再生する', 'Play video'],
};

function pathParts(value: unknown): string[] {
  const path = diagnosticText(value);
  if (path.startsWith('$')) {
    return [...path.matchAll(/\.([^.[\]]+)|\[(\d+)\]|\["((?:[^"\\]|\\.)*)"\]/gu)].map(
      (match) => match[1] ?? match[2] ?? match[3] ?? '',
    );
  }
  if (!path.startsWith('/')) return [];
  return path
    .slice(1)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
}

export function runtimeErrorPlace(diagnostic: Record<string, unknown>, locale: 'ja' | 'en') {
  const ja = locale === 'ja';
  const context = record(diagnostic.failureContext);
  const parts = pathParts(diagnostic.storyPath ?? diagnostic.path);
  const sceneId =
    diagnosticText(context.sceneId) || (parts[0] === 'scenes' ? (parts[1] ?? '') : '');
  const indexText = parts[2] === 'actions' ? parts[3] : parts[2];
  const actionIndex =
    Number.isSafeInteger(context.actionIndex) && Number(context.actionIndex) >= 0
      ? Number(context.actionIndex)
      : indexText !== undefined && /^\d+$/u.test(indexText)
        ? Number(indexText)
        : null;
  const command = diagnosticText(context.command);
  const action = actionNames[command]?.[ja ? 0 : 1] ?? command;
  const target = diagnosticText(diagnostic.targetName);
  const block = diagnosticText(diagnostic.blockName);
  const asset =
    diagnosticText(context.assetId ?? diagnostic.assetId) ||
    (parts[0] === 'assets' ? (parts[1] ?? '') : '');
  const field = diagnostic.validation ? pathParts(diagnostic.path).at(-1) : '';
  const location = [
    target ? (ja ? `ステージ／スプライト「${target}」` : `Stage / sprite “${target}”`) : '',
    sceneId ? (ja ? `場面「${sceneId}」` : `Scene “${sceneId}”`) : '',
    actionIndex === null
      ? ''
      : ja
        ? `${actionIndex + 1}番目の処理${action ? `「${action}」` : ''}`
        : `Action ${actionIndex + 1}${action ? `: ${action}` : ''}`,
    block ? (ja ? `ブロック「${block}」` : `Block “${block}”`) : '',
    asset ? (ja ? `素材「${asset}」` : `Asset “${asset}”`) : '',
    field && !/^\d+$/u.test(field) ? (ja ? `確認する項目「${field}」` : `Field “${field}”`) : '',
  ].filter(Boolean);
  return location.join(' → ');
}

export function createRuntimeErrorPresentation(
  diagnostic: Record<string, unknown>,
  locale: 'ja' | 'en',
) {
  const ja = locale === 'ja';
  const code = diagnosticText(diagnostic.diagnosticCode ?? diagnostic.code);
  const outerCode = diagnosticText(diagnostic.code);
  const context = record(diagnostic.failureContext);
  const causes = Array.isArray(context.causes)
    ? context.causes.slice(0, 6).map(record)
    : runtimeErrorCauses(diagnostic);
  const codes = [outerCode, code, ...causes.map((cause) => diagnosticText(cause.code))];
  const command = diagnosticText(context.command);
  const validation = record(diagnostic.validation);
  const matched = dsl4RuntimeErrorRemedy({
    code,
    outerCode,
    codes,
    names: [diagnosticText(diagnostic.name), ...causes.map((cause) => diagnosticText(cause.name))],
    command,
    cameraOperation:
      /^(?:pose|poseInputToChangeScene|imageInputToChangeScene|camera)$/u.test(command) ||
      codes.some((value) => /CAMERA|POSE-PORT/u.test(value)),
  });
  // A reported field explains more than an undetermined cause, even when no code matched.
  const remedy = matched ?? (validation.keyword ? dsl4SchemaFieldRemedy : dsl4UnknownErrorRemedy);
  const title = remedy.title[ja ? 0 : 1];
  let explanation = remedy.explanation[ja ? 0 : 1];
  let recovery = remedy.recovery[ja ? 0 : 1];
  if (matched === null || matched.id === 'schema') {
    const field = diagnosticText(validation.field);
    const expected = diagnosticText(validation.expected);
    if (validation.alternative === true) {
      explanation = ja
        ? 'この記述は、対応する形式のいずれにも一致しません。'
        : 'This entry does not match any of the supported formats.';
      recovery = ja
        ? '該当ブロックまたは台本の項目と値の組合せを確認してください。技術的な詳細は候補形式ごとの検証結果であり、すべてを同時に満たす指示ではありません。'
        : 'Check the fields and values in the indicated block or script. Technical details list failures for alternative formats; they are not instructions to satisfy every alternative.';
    } else if (validation.keyword === 'required' && field) {
      explanation = ja
        ? `必須項目「${field}」がありません。`
        : `The required field “${field}” is missing.`;
      recovery = ja
        ? `表示した箇所に「${field}」を追加してください。`
        : `Add “${field}” at the indicated location.`;
    } else if (validation.keyword === 'additionalProperties' && field) {
      explanation = ja
        ? `項目「${field}」は、この場所では使えません。`
        : `The field “${field}” is not supported here.`;
      recovery = ja
        ? `「${field}」の綴りと記述する場所を確認してください。`
        : `Check the spelling and location of “${field}”.`;
    } else if (validation.keyword === 'type' && expected) {
      const types: Record<string, string> = {
        string: '文字列',
        number: '数値',
        integer: '整数',
        boolean: 'trueまたはfalse',
        array: '一覧',
        object: '項目の組',
      };
      explanation = ja
        ? `この値には${types[expected] ?? expected}を指定する必要があります。`
        : `This value must be of type ${expected}.`;
    }
  }
  // The storage guidance is written for the reported failure, so it replaces the generic steps.
  if (matched?.id === 'storage' && typeof diagnostic.message === 'string')
    recovery = diagnosticText(diagnostic.message);
  const place = runtimeErrorPlace(diagnostic, locale);
  const range = record(diagnostic.range);
  const start = record(range.start);
  const source = diagnosticText(diagnostic.displayName ?? diagnostic.sourceId);
  const file = source && source !== 'main' ? source : '';
  const position =
    Number.isSafeInteger(start.line) && Number(start.line) > 0
      ? ja
        ? `${start.line}行${Number(start.column) > 0 ? ` ${start.column}列` : ''}`
        : `line ${start.line}${Number(start.column) > 0 ? `, column ${start.column}` : ''}`
      : '';
  const generated = diagnostic.generatedSource === true || Boolean(diagnostic.blockId);
  const sourcePlace = file
    ? `${generated ? (ja ? '生成台本: ' : 'Generated script: ') : ''}${file}${position ? ` (${position})` : ''}`
    : '';
  return {
    title,
    explanation,
    impact: ja
      ? 'このエラーにより、紙芝居の開始または再生を中断しました。'
      : 'This error interrupted starting or playing the story.',
    recovery,
    place:
      [place, sourcePlace].filter(Boolean).join('\n') ||
      (ja ? '発生箇所を特定できませんでした。' : 'The location could not be determined.'),
    generated,
  };
}

export function formatRuntimeErrorReport(
  diagnostic: Record<string, unknown>,
  locale: 'ja' | 'en',
  runtimeVersion = '',
) {
  const presentation = createRuntimeErrorPresentation(diagnostic, locale);
  const context = record(diagnostic.failureContext);
  const start = record(record(diagnostic.range).start);
  const causes = Array.isArray(context.causes)
    ? context.causes.slice(0, 6).map(record)
    : runtimeErrorCauses(diagnostic);
  const fields: [string, unknown][] = [
    ['Version', runtimeVersion],
    ['Code', diagnostic.code],
    ['Original code', diagnostic.diagnosticCode],
    ['Message', diagnostic.message],
    ['Location', presentation.place],
    ['Source', diagnostic.displayName ?? diagnostic.sourceId],
    ['Line', start.line],
    ['Column', start.column],
    ['Path', diagnostic.path],
    ['Story path', diagnostic.storyPath],
    ['Phase', diagnostic.phase],
    ['Block', diagnostic.blockId],
    ['Opcode', diagnostic.blockOpcode],
    ['Alternative format', record(diagnostic.validation).alternative === true ? 'yes' : ''],
    [
      'Validation',
      diagnostic.validation
        ? ['keyword', 'field', 'expected']
            .map((key) => `${key}=${diagnosticText(record(diagnostic.validation)[key], 160)}`)
            .join(', ')
        : '',
    ],
    ...causes.map((cause, index): [string, unknown] => [
      `Cause ${index + 1}`,
      [cause.name, cause.code, cause.message].filter(Boolean).join(': '),
    ]),
    ...(Array.isArray(context.cleanupCauses)
      ? context.cleanupCauses.slice(0, 6).map((cause, index): [string, unknown] => [
          `Cleanup ${index + 1}`,
          [record(cause).name, record(cause).code, record(cause).message]
            .map((part) => diagnosticText(part, 500))
            .filter(Boolean)
            .join(': '),
        ])
      : []),
  ];
  return [
    presentation.title,
    ...fields
      .map(([label, value]) => {
        const text = diagnosticText(value);
        return text ? `${label}: ${text}` : '';
      })
      .filter(Boolean),
  ].join('\n');
}
