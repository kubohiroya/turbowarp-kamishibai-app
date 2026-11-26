/**
 * Concrete corrections for Kamishibai failures, keyed by diagnostic code.
 *
 * Each entry states what failed and what the author should change, so the screen can name a
 * correction instead of reporting an undetermined cause. Entries are matched in order, so a
 * specific code must appear before the family it belongs to. Matching uses codes and error
 * names only: an unknown English message never becomes a claim about the cause
 * (`docs/dsl4-runtime-errors.md`).
 */

/** Japanese first, English second. */
export type Dsl4ErrorText = readonly [string, string];

export interface Dsl4ErrorRemedy {
  readonly title: Dsl4ErrorText;
  readonly explanation: Dsl4ErrorText;
  readonly recovery: Dsl4ErrorText;
}

export interface Dsl4ErrorSignals {
  /** The original diagnostic code when one was mapped, else the outer code. */
  readonly code: string;
  /** The code carried by the reported error itself. */
  readonly outerCode: string;
  /** The outer code, the original code and the bounded cause codes. */
  readonly codes: readonly string[];
  /** The error names of the failure and its bounded causes. */
  readonly names: readonly string[];
  /** The story command being run, when the failure happened inside one. */
  readonly command: string;
  /** Whether the failure belongs to a camera or recognition operation. */
  readonly cameraOperation: boolean;
}

interface Dsl4ErrorRemedyEntry extends Dsl4ErrorRemedy {
  /** A stable name for the entries the screen refines further. */
  readonly id?: 'schema' | 'storage';
  /** Matched against the selected codes, or evaluated against every signal. */
  readonly when: RegExp | ((signals: Dsl4ErrorSignals) => boolean);
  /** Which codes `when` is matched against. 'code' is the original code alone. */
  readonly on?: 'code' | 'outer' | 'all';
}

const checkList = (steps: readonly string[], lead: string) => `${lead}\n${steps.join('\n')}`;

/**
 * Schema violations whose keyword the screen explains further.
 *
 * It also stands in for a validation failure whose code matches no entry, so a reported field is
 * never presented as an undetermined cause.
 */
export const dsl4SchemaFieldRemedy: Dsl4ErrorRemedy = {
  title: ['台本の項目を確認してください', 'Check the script fields'],
  explanation: [
    '台本の項目や値が、使える形式に合っていません。',
    'A script field or value does not match the supported format.',
  ],
  recovery: [
    '表示した箇所の項目名と値を確認してください。英語の検証結果は技術的な詳細で確認できます。',
    'Check the field name and value at the indicated location. The original validation result is in the technical details.',
  ],
};

const remedies: readonly Dsl4ErrorRemedyEntry[] = [
  // Camera and recognition. Only a camera operation may be reported as a camera failure.
  {
    when: ({cameraOperation, names, codes}) =>
      (cameraOperation && names.includes('NotAllowedError')) ||
      codes.includes('K4-CAMERA-PERMISSION-DENIED'),
    title: ['カメラの利用が許可されませんでした', 'Camera access was not allowed'],
    explanation: [
      'カメラの許可またはブラウザの利用制限により、開始できませんでした。',
      'The camera could not start because of permissions or browser restrictions.',
    ],
    recovery: [
      'ブラウザのサイト設定でカメラの許可を確認してください。学校・組織の端末では管理者への確認が必要な場合があります。',
      'Check camera permission in the browser’s site settings. Managed devices may require help from an administrator.',
    ],
  },
  {
    when: ({cameraOperation, names}) =>
      cameraOperation &&
      names.some((name) =>
        ['NotFoundError', 'NotReadableError', 'OverconstrainedError'].includes(String(name)),
      ),
    title: ['カメラを開始できませんでした', 'The camera could not start'],
    explanation: [
      'カメラの接続または利用条件を満たせませんでした。',
      'The camera was unavailable or could not meet the requested settings.',
    ],
    recovery: [
      'カメラの接続と選択を確認し、他のアプリで使用中なら終了してください。',
      'Check the camera connection and selection, and close other apps using it.',
    ],
  },
  {
    when: /^K4-POSE-MODEL-001$/u,
    title: ['場面に認識モデルの指定がありません', 'The scene does not declare a recognition model'],
    explanation: [
      'ポーズや画像の認識を使う場面には、認識モデルの指定が必要です。',
      'A scene with recognition actions must declare its recognition model.',
    ],
    recovery: [
      'その場面を処理の一覧だけの短い形式から長い形式に書き換え、recognitionModel に使うモデルを指定してください。',
      'Rewrite the scene in its long form and set recognitionModel to the model it uses.',
    ],
  },
  {
    when: /^K4-(?:POSENET-ASSET|TM-(?:ADAPTER|RUNTIME)|POSE-PORT|TW-POSE-FEEDBACK|HOST-POSE-FEEDBACK|RUNTIME-POSE-PREVIEW)-\d+$/u,
    title: ['認識モデルを使えませんでした', 'The recognition model could not be used'],
    explanation: [
      '認識モデルの読込、または認識処理の準備に失敗しました。',
      'Loading the recognition model or preparing recognition failed.',
    ],
    recovery: [
      'モデルのフォルダに必要なファイルがそろっているか、台本の指定と一致しているかを確認してください。配信元から読む場合は、通信とURLも確認してください。',
      'Check that the model folder is complete and matches the script. For a remote model, also check the connection and the URL.',
    ],
  },

  // Assets the author declares in the script.
  {
    when: /^K4-ASSET-001$/u,
    title: ['素材のファイル指定を直してください', 'Fix the asset file path'],
    explanation: [
      '素材の file は、作品フォルダの中を指す相対パスである必要があります。',
      'An asset file must be a local relative path inside the project folder.',
    ],
    recovery: [
      '先頭の「/」、ドライブ名、「http」から始まるURL、「../」や「./」を含む指定を、フォルダ内の相対パスに書き換えてください。配信元から読む場合は file ではなく source.url を使います。',
      'Replace a leading “/”, a drive letter, an http URL or any “../” and “./” segment with a plain relative path. Use source.url instead of file to read it from a server.',
    ],
  },
  {
    when: /^K4-ASSET-REMOTE-URL-001$/u,
    title: ['リモート素材のURLを直してください', 'Fix the remote asset URL'],
    explanation: [
      'リモート素材のURLは、資格情報と「#」以降を含まない絶対HTTPS URLである必要があります。',
      'A remote asset URL must be an absolute HTTPS URL without credentials or a fragment.',
    ],
    recovery: [
      'URLを「https://」から始まる形に直し、「ユーザー名:パスワード@」と「#」以降を削ってください。',
      'Rewrite the URL to start with “https://” and remove any “user:password@” part and any “#” fragment.',
    ],
  },
  {
    when: /^K4-ASSET-(?:IMAGE|VIDEO)-MIME-001$/u,
    title: ['素材の種類の指定が合っていません', 'The declared media type does not match'],
    explanation: [
      '素材の contentType が、その素材の種類に合っていません。',
      'The asset’s contentType does not match the kind of asset it declares.',
    ],
    recovery: [
      '画像の素材には image/png などの画像の種類、動画の素材には video/mp4 などの動画の種類を指定してください。',
      'Use an image type such as image/png for image assets and a video type such as video/mp4 for video assets.',
    ],
  },
  {
    when: /^K4-ASSET-PATH-001$/u,
    title: ['素材が作品フォルダの外にあります', 'An asset is outside the project folder'],
    explanation: [
      '台本が、選んだ作品フォルダの外にあるファイルを指しています。',
      'The script points to a file outside the selected project folder.',
    ],
    recovery: [
      '素材を作品フォルダの中に移してから、台本の指定をその場所に書き換えてください。',
      'Move the file into the project folder and update the script to point at its new location.',
    ],
  },
  {
    when: /^K4-ASSET-PERMISSION-001$/u,
    title: ['素材の読み取りが許可されていません', 'Reading an asset was not allowed'],
    explanation: [
      '素材のあるフォルダを読む許可が、与えられていないか取り消されています。',
      'Read access to the folder holding the asset was denied or revoked.',
    ],
    recovery: [
      'プレビューで作品フォルダを選び直し、読み取りを許可してください。',
      'Select the project folder for the preview again and allow reading it.',
    ],
  },
  {
    when: /^K4-ASSET-PROJECT-DIRECTORY-REQUIRED$/u,
    title: ['作品フォルダを選んでください', 'A project folder is required'],
    explanation: [
      'この素材はローカルのファイルを読むため、作品フォルダの選択が必要です。',
      'This asset reads a local file, so a selected project folder is required.',
    ],
    recovery: [
      'プレビューで台本のある作品フォルダを選び直してください。',
      'Select the project folder that holds the script in the preview again.',
    ],
  },
  {
    when: /^K4-ASSET-POSE-BUNDLE-001$/u,
    title: ['ポーズモデルのフォルダが不完全です', 'The pose model folder is incomplete'],
    explanation: [
      '指定したポーズモデルのフォルダに、必要なファイルがそろっていません。',
      'The declared pose model folder is missing required files or is invalid.',
    ],
    recovery: [
      'モデルの書き出しに含まれるファイルを1つのフォルダにそろえ、台本の指定をそのフォルダに合わせてください。',
      'Put every file from the exported model in one folder and point the script at that folder.',
    ],
  },
  {
    when: /^K4-ASSET-(?:LIMIT|SIZE|TOTAL-SIZE|REMOTE-SIZE|REMOTE-LIMIT|ENTRY-SIZE|BUNDLE-SIZE|ENTRY-LIMIT|BUNDLE-LIMIT|ARCHIVE-(?:COUNT|COMPRESSED-SIZE|EXPANDED-SIZE|RATIO))-001$/u,
    title: ['素材が上限を超えています', 'The assets exceed a limit'],
    explanation: [
      '素材の数か大きさが、1つの作品で扱える上限を超えています。',
      'The number or size of assets exceeds the limit for one story.',
    ],
    recovery: [
      '使っていない素材を台本から外す、画像や動画を小さく書き出す、章ごとにファイルを分けるなどで量を減らしてください。',
      'Remove unused assets, export images and videos at a smaller size, or split the story into separate files per chapter.',
    ],
  },
  {
    when: /^K4-ASSET-(?:OFFLINE|REMOTE-OFFLINE|REMOTE-CONNECT|REMOTE-TIMEOUT|REMOTE-HTTP|REMOTE-LOAD|REMOTE-CONTENT-TYPE)-001$/u,
    title: ['配信元から素材を読めませんでした', 'An asset could not be fetched'],
    explanation: [
      '素材の配信元に届かない、または配信元が素材を返しませんでした。',
      'The asset’s server could not be reached or did not return the asset.',
    ],
    recovery: [
      'ネットワーク接続を確認し、URLをブラウザで直接開いて、その素材が公開されているか確かめてください。配布前の確認では、素材を作品内に取り込む方法もあります。',
      'Check the network, open the URL directly in the browser and confirm the asset is published. You can also embed the asset in the project while testing.',
    ],
  },
  {
    when: /^K4-ASSET-REMOTE-CORS-001$/u,
    title: ['配信元が読込を許可していません', 'The server does not allow this read'],
    explanation: [
      '素材の配信元が、別のサイトからの読込を許可していません。',
      'The asset’s server does not allow cross-origin reads.',
    ],
    recovery: [
      '作品と同じ配信元に素材を置くか、配信元で読込の許可（CORS）を設定してください。素材を作品内に取り込む方法もあります。',
      'Serve the asset from the same origin as the story, or enable CORS on its server. Embedding the asset in the project also works.',
    ],
  },
  {
    when: /^K4-ASSET-(?:INTEGRITY|REMOTE-INTEGRITY|CONTENT-MISMATCH|RETAINED-INTEGRITY|BUNDLE-INTEGRITY|ENTRY-INTEGRITY|SIGNATURE|STALE)-001$/u,
    title: ['素材の内容が記録と違います', 'An asset differs from its recorded content'],
    explanation: [
      '素材のファイルが、作品に記録した内容と一致しません。',
      'The asset file does not match the content recorded in the story.',
    ],
    recovery: [
      '素材を差し替えたのであれば、素材の固定情報を作り直してから書き出し直してください。差し替えていない場合は、元のファイルに戻してください。',
      'If you replaced the asset, regenerate the asset lock and build again. If you did not, restore the original file.',
    ],
  },
  {
    when: /^K4-(?:ASSET-UNSTABLE-001|PREVIEW-SOURCE-UNSTABLE|SOURCE-MANIFEST-UNSTABLE)$/u,
    title: ['ファイルの保存中に読み込みました', 'The files were still being written'],
    explanation: [
      '台本か素材が書き込み中で、内容が落ち着く前に読み込みました。',
      'A script or asset was still being written when it was read.',
    ],
    recovery: [
      '編集中のアプリで保存を終えてから、もう一度プレビューを更新してください。自動保存や同期が動いている場合は、終わるまで待ってください。',
      'Finish saving in the editing app and refresh the preview. If autosave or file sync is running, wait until it settles.',
    ],
  },
  {
    when: /^K4-ASSET-REMOTE-DISABLED$/u,
    title: [
      'このプレビューではリモート素材を読み込めません',
      'Remote assets are unavailable in this preview',
    ],
    explanation: [
      'ローカルプレビューは、この素材のリモート配信に対応していません。',
      'Local preview does not support remote delivery for this asset.',
    ],
    recovery: [
      'プレビュー中は素材をローカル配信に切り替えるか、build-dsl4でビルドした作品で確認してください。',
      'Use local delivery while previewing, or build the story with build-dsl4 to test remote delivery.',
    ],
  },
  {
    when: /K4-ASSET-(?:MISSING|PROJECT-MISSING)/u,
    on: 'all',
    title: ['必要な素材が見つかりません', 'A required asset was not found'],
    explanation: [
      '台本で指定された素材を読み込めませんでした。',
      'An asset referenced by the script could not be loaded.',
    ],
    recovery: [
      '素材名、登録したファイル、台本の参照先が一致しているか確認してください。',
      'Check that the asset name, registered file and script reference match.',
    ],
  },
  {
    when: /^K4-(?:ASSET|POSENET)/u,
    title: ['素材を準備できませんでした', 'An asset could not be prepared'],
    explanation: [
      '素材の読込または検証に失敗しました。詳しい原因は技術的な詳細で確認できます。',
      'Loading or validating an asset failed. See the technical details for the reported cause.',
    ],
    recovery: [
      '該当素材のファイル・配信先・対応形式を確認してください。再読込だけで直らない場合は診断情報を制作者に渡してください。',
      'Check the asset file, delivery location and format. If reloading does not help, send the diagnostics to the author.',
    ],
  },

  // The script files themselves.
  {
    when: /^K4-SOURCE-MISSING$/u,
    title: ['台本ファイルが見つかりません', 'The script file was not found'],
    explanation: [
      '作品が参照している台本ファイルを開けませんでした。',
      'A script file referenced by the project could not be opened.',
    ],
    recovery: [
      '表示したファイルが選択したフォルダ内に存在するか、ファイル名と参照先が一致しているか確認してください。',
      'Check that the indicated file exists in the selected folder and that its name matches the reference.',
    ],
  },
  {
    when: /^K4-SOURCE-AMBIGUOUS$/u,
    title: ['開始する台本が1つに決まりません', 'The entry script is ambiguous'],
    explanation: [
      '作品フォルダに、開始できる台本ファイルが複数あります。',
      'The project folder has more than one possible entry script.',
    ],
    recovery: [
      '作品の source manifest で開始するファイルを1つ指定するか、使わない台本をフォルダの外に移してください。',
      'Name one entry file in the project’s source manifest, or move the unused scripts out of the folder.',
    ],
  },
  {
    when: /^K4-SOURCE-UTF8-001$/u,
    title: ['台本の文字コードを直してください', 'Save the script as UTF-8'],
    explanation: [
      '台本ファイルをUTF-8の文字として読み取れませんでした。',
      'The script file is not valid UTF-8.',
    ],
    recovery: [
      'テキストエディターで文字コードをUTF-8（BOMなし）にして保存し直してください。Shift_JISのまま保存した日本語の台本は読めません。',
      'Re-save the file as UTF-8 without a BOM. A Japanese script left in Shift_JIS cannot be read.',
    ],
  },
  {
    when: /^K4-SOURCE-(?:SIZE|LIMIT-BYTES)-001$/u,
    title: ['台本ファイルが大きすぎます', 'The script file is too large'],
    explanation: [
      '台本1ファイルの大きさが、読み込める上限を超えています。',
      'One script file exceeds the byte limit for reading it.',
    ],
    recovery: [
      '場面や章ごとにファイルを分け、include で取り込む形に書き換えてください。長いせりふを素材や別ファイルへ移す方法もあります。',
      'Split the script into files per scene or chapter and pull them in with include. Moving long text into assets or separate files also helps.',
    ],
  },
  {
    when: /^K4-SOURCE-(?:READ|FILE)-001$/u,
    title: ['台本ファイルを読めませんでした', 'The script file could not be read'],
    explanation: [
      '台本ファイルを開けない、または通常のファイルではありません。',
      'The script file could not be opened or is not a regular file.',
    ],
    recovery: [
      'ファイルがフォルダ・ショートカット・リンクでないこと、他のアプリで占有されていないことを確認し、作品フォルダを選び直してください。',
      'Check that the path is a plain file rather than a folder or link, that no other app is holding it, and select the project folder again.',
    ],
  },
  {
    when: /^K4-SOURCE-PATH-001$/u,
    title: ['台本が作品フォルダの外にあります', 'The script is outside the project folder'],
    explanation: [
      '参照している台本が、選んだ作品フォルダの外を指しています。',
      'The referenced script points outside the selected project folder.',
    ],
    recovery: [
      '台本を作品フォルダの中に移し、include や source manifest の指定をフォルダ内の相対パスに直してください。',
      'Move the script into the project folder and change include and source manifest entries to relative paths inside it.',
    ],
  },
  {
    when: /^K4-SOURCE-URL-(?:DISABLED|UNAVAILABLE|UNKNOWN|FETCH-FAILED)$/u,
    title: ['URL参照の台本を読めませんでした', 'A script referenced by URL could not be read'],
    explanation: [
      'URLで参照している台本を、この実行環境では読み込めませんでした。',
      'A script referenced by URL could not be read in this environment.',
    ],
    recovery: [
      '文書エディターでその台本を作品の中へ取り込んでから保存し直してください。URL参照のままにする場合は、公開先のURLと通信を確認してください。',
      'Embed that script into the project in the document editor and save again. To keep the URL reference, check the published URL and the connection.',
    ],
  },
  {
    when: /^K4-SOURCE-(?:MANIFEST|DOCUMENTS)/u,
    title: ['台本ファイルの構成を直してください', 'Fix how the script files are listed'],
    explanation: [
      '台本ファイルの一覧（開始ファイル・パス・対応関係）に、解決できない指定があります。',
      'The list of script files has an entry that cannot be resolved.',
    ],
    recovery: [
      '開始ファイルの指定が実在するファイルを指しているか、同じパスが二重に登録されていないか、作品フォルダ内の相対パスになっているかを確認してください。',
      'Check that the entry file exists, that no path is listed twice and that every path is relative to the project folder.',
    ],
  },
  {
    when: /^K4-(?:SOURCE-INTEGRITY|SOURCE-VIEW-UNAPPLIED)/u,
    title: ['台本の編集が反映されていません', 'The script edits are not applied yet'],
    explanation: [
      '編集中の内容と、作品に保存された台本が一致していません。',
      'The edited text and the script stored in the project do not match.',
    ],
    recovery: [
      '文書エディターで編集中の台本を保存（適用）してから、もう一度再生してください。',
      'Apply or save the script in the document editor, then play the story again.',
    ],
  },

  {
    when: /^K4-SOURCE-/u,
    title: ['台本の記録を確かめられませんでした', 'The stored script could not be verified'],
    explanation: [
      '作品に記録された台本の場所か対応関係を、解決できませんでした。',
      'Where the script is stored, or how it is linked, could not be resolved.',
    ],
    recovery: [
      '文書エディターで台本を開き、保存し直してから再生してください。作品ファイルを手で編集した場合は、編集前の作品に戻してください。',
      'Open the script in the document editor, save it again and play. If the project file was edited by hand, restore the earlier project.',
    ],
  },

  // include and the source graph.
  {
    when: /^K4-INCLUDE-CYCLE$/u,
    title: ['台本の取り込みが輪になっています', 'The script includes form a cycle'],
    explanation: [
      'include で指定したファイルが、たどると自分自身に戻ります。',
      'Following the include chain returns to the file it started from.',
    ],
    recovery: [
      '技術的な詳細に出ている取り込みの順序をたどり、どこか1か所の include を外してください。両方から使う部分は、別のファイルに分けて双方から取り込みます。',
      'Follow the include chain in the technical details and remove one of the links. Move shared parts into a separate file that both files include.',
    ],
  },
  {
    when: /^K4-INCLUDE-LIMIT-001$/u,
    title: ['台本の取り込みが多すぎます', 'There are too many includes'],
    explanation: [
      '取り込む台本ファイルの数か深さが、上限を超えています。',
      'The number or depth of included script files exceeds the limit.',
    ],
    recovery: [
      '入れ子になった include を減らし、開始ファイルから直接取り込む形にまとめてください。使っていないファイルの取り込みも外してください。',
      'Flatten nested includes so the entry file pulls them in directly, and drop includes you no longer use.',
    ],
  },
  {
    when: /^K4-INCLUDE-(?:PATH|READ)-001$/u,
    title: ['取り込む台本が見つかりません', 'An included script could not be read'],
    explanation: [
      'include で指定したファイルを開けませんでした。',
      'A file named by include could not be opened.',
    ],
    recovery: [
      'ファイル名の綴りと拡張子、大文字と小文字、作品フォルダ内の相対パスであることを確認してください。「../」でフォルダの外を指すことはできません。',
      'Check the spelling, extension and letter case of the file name, and that the path is relative to the project folder. It cannot point outside with “../”.',
    ],
  },
  {
    when: /^K4-INCLUDE-YAML-001$/u,
    title: ['取り込む台本の書き方を確認してください', 'Check the included script’s syntax'],
    explanation: [
      '取り込んだ台本をYAMLとして読み取れませんでした。',
      'An included script could not be read as YAML.',
    ],
    recovery: [
      '取り込んだファイルを開き、表示した行の前後で字下げ、コロンの後の空白、引用符と括弧の対応を確認してください。',
      'Open the included file and check indentation, the space after each colon and matching quotes and brackets around the indicated line.',
    ],
  },
  {
    when: /^K4-INCLUDE-(?:SOURCE|COMPOSITION|001)/u,
    title: ['include の書き方を確認してください', 'Check how include is written'],
    explanation: [
      'include の指定、または取り込んだ台本の形が、合成できる形になっていません。',
      'The include entry or the included script is not in a shape that can be composed.',
    ],
    recovery: [
      'include には1つのファイルのパスか、その一覧（「- 」で並べた形）を書きます。取り込むファイルの先頭は、項目名で始まる組にしてください。',
      'Write one file path, or a list of paths, under include. Each included file must start with a mapping of named fields.',
    ],
  },
  {
    when: /^K4-INCLUDE-ROOT-ONLY$/u,
    title: ['include は開始ファイルにだけ書けます', 'include belongs to the entry file only'],
    explanation: [
      '取り込まれた側の台本に、さらに include が書かれています。',
      'An included script contains an include of its own.',
    ],
    recovery: [
      '取り込まれる台本から include を外し、必要なファイルはすべて開始ファイルの include にまとめてください。',
      'Remove include from the included script and list every file in the entry file’s include instead.',
    ],
  },

  // Definitions and references the author writes.
  {
    when: /^K4-DEFINITION-UNDEFINED$/u,
    title: ['定義のない名前を参照しています', 'A name is used without a definition'],
    explanation: [
      '台本が、どこにも定義されていない名前を参照しています。',
      'The script refers to a name that is not defined anywhere.',
    ],
    recovery: [
      '参照している名前の綴りを定義側と見比べてください。定義が無い場合は、該当の節（登場人物・素材・場面・様式など）に定義を足してください。',
      'Compare the spelling with the definition. If none exists, add it to the matching section such as actors, assets, scenes or styles.',
    ],
  },
  {
    when: /^K4-(?:DEFINITION|DECLARATION)-DUPLICATE$/u,
    title: ['同じ名前が二重に定義されています', 'The same name is defined twice'],
    explanation: [
      '同じ名前の定義が、複数の場所にあります。',
      'A definition with the same name exists in more than one place.',
    ],
    recovery: [
      '重複している定義のどちらかを削るか、名前を変えてください。include で複数の台本を取り込んでいる場合は、取り込んだ先の定義も確認してください。',
      'Delete one of the duplicates or rename it. When several scripts are pulled in with include, check the included files too.',
    ],
  },
  {
    when: /^K4-DEFINITION-UNUSED$/u,
    title: ['使われていない定義があります', 'A definition is never used'],
    explanation: [
      '定義した名前が、台本のどこからも参照されていません。',
      'A defined name is never referenced by the script.',
    ],
    recovery: [
      'その定義を使う場所で名前を参照するか、使わない定義を削ってください。参照側の綴り違いが原因の場合もあります。',
      'Reference the name where you meant to use it, or delete the definition. A misspelling at the usage site can also cause this.',
    ],
  },
  {
    when: /^K4-DEFINITION-/u,
    title: ['定義の使われ方を確認してください', 'Check how the definition is used'],
    explanation: [
      '定義と、それを参照している場所の対応を確かめられませんでした。',
      'The link between a definition and the places using it could not be verified.',
    ],
    recovery: [
      '定義した名前と参照している名前を見比べ、どちらかの綴りをそろえてください。include で台本を分けている場合は、取り込んだ先の定義も確認してください。',
      'Compare the defined name with the names using it and make them match. When the script is split with include, check the included files too.',
    ],
  },
  {
    when: /^K4-REF-002$/u,
    title: ['素材の種類が合っていません', 'The asset is of the wrong kind'],
    explanation: [
      '参照した素材の種類が、その処理で使える種類と違います。',
      'The referenced asset is not of the kind this action accepts.',
    ],
    recovery: [
      '背景・コスチューム・音・動画のうち、その処理が使う種類の素材を参照してください。素材側の kind の指定も確認してください。',
      'Reference an asset of the kind the action needs — backdrop, costume, sound or video — and check the asset’s own kind field.',
    ],
  },
  {
    when: /^K4-REF-003$/u,
    title: ['別の登場人物のコスチュームです', 'The costume belongs to another actor'],
    explanation: [
      '指定したコスチュームは、その登場人物のものではありません。',
      'The costume does not belong to the actor it was given to.',
    ],
    recovery: [
      'その登場人物に登録したコスチューム名に書き換えるか、使いたいコスチュームをその登場人物へ登録してください。',
      'Use a costume registered to that actor, or register the costume you want on that actor.',
    ],
  },
  {
    when: /^K4-(?:REF-001|PROJECT-REF-001)$/u,
    title: ['参照先が見つかりません', 'The reference could not be resolved'],
    explanation: [
      '台本が指定した名前の定義が見つかりませんでした。',
      'No definition was found for the name the script used.',
    ],
    recovery: [
      '参照名の綴りを定義側と見比べてください。全角と半角、大文字と小文字、前後の空白の違いもよくある原因です。',
      'Compare the spelling with the definition. Width, letter case and stray spaces are common causes.',
    ],
  },
  {
    when: /^K4-(?:RUNTIME-SCENE|RUNTIME-BRANCH|RELOAD-SCENE-MISSING|CUSTOM-GOTO-001|RUNTIME-NAVIGATION-001|REF)/u,
    title: ['移動先の場面が見つかりません', 'The target scene was not found'],
    explanation: [
      '移動先として指定された場面や区切りを解決できませんでした。',
      'The scene or segment named as the destination could not be resolved.',
    ],
    recovery: [
      '移動先の名前が scenes に定義されているか、綴りが一致しているかを確認してください。場面を改名したときは、その場面へ移る処理と分岐もあわせて直してください。',
      'Check that the destination is defined under scenes and spelled the same way. After renaming a scene, update every action and branch that moves to it.',
    ],
  },
  {
    when: /^K4-BRANCH-001$/u,
    title: ['分岐の最後を else にしてください', 'The last branch rule must be else'],
    explanation: [
      '分岐の規則の最後が、条件付きのままになっています。',
      'The final rule of a branch is still a conditional one.',
    ],
    recovery: [
      '分岐の最後の規則を else に書き換えて、どの条件にも合わなかった場合の移動先を決めてください。',
      'Make the last rule an else so there is a destination when no condition matches.',
    ],
  },
  {
    when: /^K4-STABLE-ID-001$/u,
    title: ['stableId が重複しています', 'A stableId is used twice'],
    explanation: [
      '同じ stableId が、複数の処理に付けられています。',
      'The same stableId is attached to more than one action.',
    ],
    recovery: [
      '技術的な詳細に出ているもう一方の場所を確認し、どちらかの stableId を別の名前に変えてください。処理を複製したときに起こりやすい誤りです。',
      'Look at the other location in the technical details and rename one of them. This usually happens after copying an action.',
    ],
  },

  // Identifiers, keys and controls.
  {
    when: /^K4-ID-(?:INVALID|001)$/u,
    title: ['名前に使えない文字があります', 'The identifier cannot be used'],
    explanation: [
      '場面や登場人物などの名前に、使えない文字か正規化されていない文字が含まれています。',
      'A scene, actor or similar name uses characters that are not allowed or not normalized.',
    ],
    recovery: [
      '名前から空白・記号・改行を外してください。日本語の名前は、濁点や半角カナが分解されていない形（Unicode NFC）で入力し直すと直ります。',
      'Remove spaces, punctuation and line breaks from the name. For Japanese names, retype them so they are in Unicode NFC form.',
    ],
  },
  {
    when: /^K4-KEY-UNSUPPORTED$/u,
    title: ['使えないキーの指定です', 'That key cannot be used'],
    explanation: [
      'キーの指定が、扱えるキー名の書き方になっていません。',
      'The key is not written in a supported key-code form.',
    ],
    recovery: [
      'キーは KeyA、Digit1、ArrowLeft、Space、Enter のような決まった名前で指定してください。「a」や「←」のような表記は使えません。',
      'Use a standard key code such as KeyA, Digit1, ArrowLeft, Space or Enter. Plain letters or arrow symbols are not accepted.',
    ],
  },
  {
    when: /^K4-KEY-001$/u,
    title: ['キーの割り当てが重なっています', 'A key assignment conflicts'],
    explanation: [
      '操作に割り当てたキーが、台本の入力で使うキーと重なっています。',
      'A key assigned to a control is also used by the story’s own input.',
    ],
    recovery: [
      '技術的な詳細に出ているもう一方の割り当てを確認し、どちらかのキーを別のキーに変えてください。',
      'Check the other assignment in the technical details and move one of them to a different key.',
    ],
  },
  {
    when: /^K4-KEYMAP-/u,
    title: ['操作の割り当てを確認してください', 'Check the control profile'],
    explanation: [
      '使おうとした操作の割り当て（プロファイル）が、見つからないか今は使えません。',
      'The control profile for the requested operation is missing or not available now.',
    ],
    recovery: [
      'controls のプロファイル名が台本で定義されているか、綴りが一致しているかを確認してください。履歴を使う操作は、履歴を有効にした作品でだけ使えます。',
      'Check that the profile name under controls is defined and spelled the same way. Operations that use history need a story with history enabled.',
    ],
  },

  // Resource limits in the script.
  {
    when: /^K4-(?:SCENE-LIMIT|ACTION-LIMIT-SCENE|ACTION-LIMIT-TOTAL|NARRATIVE-LIMIT)-001$/u,
    title: ['台本が上限を超えています', 'The script exceeds a limit'],
    explanation: [
      '場面の数か処理の数が、1つの台本で扱える上限を超えています。',
      'The number of scenes or actions exceeds the limit for one script.',
    ],
    recovery: [
      '章ごとに台本ファイルを分けて include で取り込むか、繰り返している処理を様式や定義にまとめて数を減らしてください。',
      'Split the story into script files per chapter and pull them in with include, or fold repeated actions into shared styles or definitions.',
    ],
  },
  {
    when: /^K4-YAML-LIMIT-(?:NODES|DEPTH|SCALAR)-001$/u,
    title: ['台本の記述量が上限を超えています', 'The script’s YAML exceeds a limit'],
    explanation: [
      'YAMLの項目数、入れ子の深さ、または1つの文字列の長さが上限を超えています。',
      'The YAML has too many nodes, nests too deeply, or holds too long a single string.',
    ],
    recovery: [
      '台本をファイルに分けて include で取り込み、入れ子の深い記述は様式や定義に切り出してください。長い本文は複数のせりふに分けてください。',
      'Split the script into files pulled in with include, move deeply nested parts into shared styles or definitions, and break long text into several lines of speech.',
    ],
  },
  {
    when: /^K4-DIAGNOSTICS-TRUNCATED$/u,
    title: ['エラーが多いため一部だけ表示しています', 'Only some of the errors are shown'],
    explanation: [
      '検出したエラーが多く、表示できる件数を超えました。',
      'There were more errors than the screen can list.',
    ],
    recovery: [
      '表示されている先頭のエラーから順に直して、そのたびに再生し直してください。前のエラーが後ろのエラーの原因になっていることが多いため、件数は一気に減ります。',
      'Fix the errors from the top of the list and play again after each one. Earlier errors often cause the later ones, so the count drops quickly.',
    ],
  },

  // Version and format of the script.
  {
    when: /^K4-NARRATIVE-VERSION-001$/u,
    title: ['台本の版の指定を直してください', 'Fix the script version'],
    explanation: [
      'kamishibai の指定が、公開されている版ではありません。',
      'The kamishibai version is not a released series.',
    ],
    recovery: [
      "台本の先頭の kamishibai を '4.0' に書き換えてください。",
      'Change kamishibai at the top of the script to ‘4.0’.',
    ],
  },
  {
    when: /^K4-(?:NARRATIVE-FLAG|TRANSITION-FLAG|SEALED-UNSUPPORTED)-001$/u,
    title: ['この機能は今の設定では使えません', 'This feature is off in the current setup'],
    explanation: [
      '台本が使っている機能が、この実行環境では有効になっていません。',
      'A feature the script uses is not enabled in this runtime.',
    ],
    recovery: [
      'その機能に対応した版の紙芝居拡張で開き直してください。使わない場合は、該当の記述を台本から外してください。',
      'Open the story with a Kamishibai runtime that supports the feature, or remove that part from the script.',
    ],
  },
  {
    when: /^K4-PRESENTATION-EFFECTS-(?:FLAG|RUNTIME)-001$/u,
    title: ['試験的な演出が無効です', 'Experimental presentation effects are disabled'],
    explanation: [
      'この台本のアニメーションまたは演出には、対応するローカルプレビューが必要です。',
      'An animation or presentation effect in this story requires the matching local preview.',
    ],
    recovery: [
      'ローカルプレビューを --enable-presentation-effects 付きで開き直すか、該当の演出を外してください。',
      'Reopen local preview with --enable-presentation-effects, or remove the effect.',
    ],
  },
  {
    when: /^K4-PRESENTATION-EFFECT-00[123]$/u,
    title: ['演出を実行できません', 'This presentation effect cannot run'],
    explanation: [
      '演出の設定、表示レイヤー、または実行中のプレビューを確認してください。',
      'Check the effect parameters, rendering layer, and active preview.',
    ],
    recovery: [
      '対応する範囲とパラメーターを指定し、ローカルプレビューを開き直してください。',
      'Use supported parameters and scope, then reopen the local preview.',
    ],
  },
  {
    when: /^K4-VERSION-001$/u,
    title: ['台本の先頭の版の指定が違います', 'The version at the top of the script is wrong'],
    explanation: [
      '台本の kamishibai の値が、この形式で決められた版ではありません。',
      'The kamishibai value is not the version this format requires.',
    ],
    recovery: [
      "台本の1行目の kamishibai を '4.0' に書き換えてください。引用符を外して 4.0 と書くと数として扱われるため、引用符は残します。",
      'Set kamishibai on the first line to ‘4.0’. Keep the quotes, since 4.0 without them is read as a number.',
    ],
  },
  {
    when: /^K4-(?:FORMAT-VERSION|BLOCK-SOURCE-VERSION)-001$/u,
    title: ['台本と実行環境の版が合いません', 'The script and the runtime versions differ'],
    explanation: [
      '台本が記録している版と、読み込んでいる紙芝居拡張の版が一致しません。',
      'The version recorded in the script does not match the Kamishibai runtime that loaded it.',
    ],
    recovery: [
      '作品を保存したときと同じ版の紙芝居拡張で開き直すか、新しい版で台本を開いて保存し直してください。',
      'Open the project with the same runtime version that saved it, or open and save the script with the newer version.',
    ],
  },
  {
    when: /^K4-FORMAT-(?:MISSING-KEY|UNKNOWN-KEY|SHAPE)-001$/u,
    title: ['保存した内容の形が合いません', 'The stored data has an unexpected shape'],
    explanation: [
      '作品に保存された紙芝居の情報に、足りない項目か知らない項目があります。',
      'The stored Kamishibai data is missing a field or carries an unknown one.',
    ],
    recovery: [
      '作品を保存したときと同じ版の紙芝居拡張で開き直してください。直らない場合は、台本を書き出してから新しい作品に取り込み直してください。',
      'Open the project with the runtime version that saved it. If that fails, export the script and import it into a new project.',
    ],
  },

  {
    when: /^K4-VIEWPORT-001$/u,
    title: ['表示範囲の指定を直してください', 'Fix the viewport settings'],
    explanation: [
      'viewport に指定した値では、表示範囲を決められません。',
      'The values under viewport do not describe a usable display area.',
    ],
    recovery: [
      '幅と高さを0より大きい数にし、基準にする位置の指定が決まった選択肢であることを確認してください。',
      'Give width and height numbers greater than zero and use one of the allowed anchor values.',
    ],
  },

  // The root and document blocks that hold the script.
  {
    when: /^K4-ROOT-MISSING$/u,
    title: ['台本の土台ブロックがありません', 'The script’s root block is missing'],
    explanation: [
      '作品に、台本を置くための土台のブロックが見つかりません。',
      'The project has no root block to hold the script.',
    ],
    recovery: [
      'ステージのコードエリアに紙芝居の台本ブロックを置き、そこから台本を開いてください。土台ごと消してしまった場合は、作品を保存前の状態に戻してください。',
      'Place the Kamishibai script block on the Stage’s code area and open the script from it. If you deleted it, restore the project from before the deletion.',
    ],
  },
  {
    when: /^K4-ROOT-DUPLICATE$/u,
    title: ['台本の土台ブロックが複数あります', 'There is more than one root block'],
    explanation: [
      '台本の土台ブロックは、作品に1つだけ置けます。',
      'A project may hold only one script root block.',
    ],
    recovery: [
      '余分な土台ブロックを削除し、使うものを1つだけ残してください。スプライトを複製したときに増えていることがあります。',
      'Delete the extra root blocks and keep one. Duplicating a sprite can add another.',
    ],
  },
  {
    when: /^K4-ROOT-(?:TARGET|CONNECTED)$/u,
    title: ['台本の土台ブロックの置き場所を直してください', 'Move the script’s root block'],
    explanation: [
      '土台のブロックがステージ以外にあるか、他のブロックにつながっています。',
      'The root block is not on the Stage, or it is connected to another block.',
    ],
    recovery: [
      '土台のブロックをステージのコードエリアへ移し、他のブロックから切り離して単独で置いてください。',
      'Move the root block to the Stage’s code area and detach it so it stands alone.',
    ],
  },
  {
    when: /^K4-ROOT-ENTRY-(?:MISMATCH|SCHEMA)$/u,
    title: ['開始する台本ファイルが一致しません', 'The entry script does not match'],
    explanation: [
      '土台が指している台本と、開始ファイルとして記録されている台本が違います。',
      'The file the root points at differs from the recorded entry file.',
    ],
    recovery: [
      '文書エディターで開始する台本ファイルを選び直し、保存してください。ファイルを改名・移動した直後に起こります。',
      'Pick the entry script again in the document editor and save. This happens right after renaming or moving a file.',
    ],
  },
  {
    when: /^K4-(?:ROOT|DOCUMENT)-/u,
    title: ['台本と作品の対応を直してください', 'Fix how the script is attached'],
    explanation: [
      '台本のブロックと、作品に保存された台本の対応が取れていません。',
      'The script blocks and the script stored in the project do not line up.',
    ],
    recovery: [
      '文書エディターで台本を開き、開始ファイルを選び直して保存してください。台本ブロックを手で複製・削除した場合は、その変更を元に戻してください。',
      'Open the script in the document editor, select the entry file again and save. If you duplicated or deleted script blocks by hand, undo that.',
    ],
  },

  // Expressions and variables.
  {
    when: /^K4-EXPRESSION-VARIABLE-UNKNOWN$/u,
    title: ['式が知らない変数を使っています', 'The expression uses an undefined variable'],
    explanation: [
      '式の中で、台本に定義されていない変数を参照しています。',
      'The expression refers to a variable the script does not define.',
    ],
    recovery: [
      '変数名の綴りを定義側と見比べ、必要なら台本の変数として定義を足してください。場面の途中で作られる変数は、使う前に値を設定してください。',
      'Compare the variable name with its definition and add it to the script’s variables if needed. Set a value before reading a variable created mid-story.',
    ],
  },
  {
    when: /^K4-EXPRESSION-RUNTIME-UNKNOWN$/u,
    title: ['式が知らない実行時の値を使っています', 'The expression uses an unknown runtime value'],
    explanation: [
      '式の中で、用意されていない実行時の値を参照しています。',
      'The expression refers to a runtime value that does not exist.',
    ],
    recovery: [
      '参照している名前を、使える実行時の値（場面・入力・時間など）の名前に書き換えてください。綴りの違いもよくある原因です。',
      'Change the name to one of the available runtime values such as the current scene, input or time. A misspelling is a common cause.',
    ],
  },
  {
    when: /^K4-EXPRESSION-SYNTAX-001$/u,
    title: ['式の書き方を直してください', 'Fix the expression’s syntax'],
    explanation: [
      '条件式または値の式を読み取れませんでした。',
      'The expression could not be parsed.',
    ],
    recovery: [
      '括弧の対応、比較演算子（==、!=、<、>=）、かつ・または（&&、||）の書き方を確認してください。文字列は引用符で囲みます。',
      'Check matching brackets, the comparison operators (==, !=, <, >=) and the and/or operators (&&, ||). Quote string values.',
    ],
  },
  {
    when: /^K4-EXPRESSION-VARIABLE-001$/u,
    title: ['式の値の型が合いません', 'The expression’s value types do not match'],
    explanation: [
      '式が求める型と、変数に入っている値の型が違います。',
      'The variable’s value is not of the type the expression needs.',
    ],
    recovery: [
      '変数を設定する処理で型の指定を見直してください。数と文字列を比べている場合は、どちらかに合わせてください。',
      'Review the type given where the variable is set. If a number is compared with a string, make both the same type.',
    ],
  },
  {
    when: /^K4-EXPRESSION/u,
    title: ['式を処理できませんでした', 'An expression could not be processed'],
    explanation: [
      '条件式または値を求める式の検証・評価に失敗しました。',
      'Validating or evaluating an expression failed.',
    ],
    recovery: [
      '該当箇所の変数名、値の型、演算子を確認してください。詳しい検証結果は技術的な詳細で確認できます。',
      'Check variable names, value types and operators at the indicated location. See the technical details for the reported failure.',
    ],
  },
  {
    when: /^K4-VARIABLE-WRITE-UNKNOWN$/u,
    title: ['台本にない変数に書き込もうとしました', 'The variable being set does not exist'],
    explanation: [
      '値を設定しようとした変数が、台本に定義されていません。',
      'The variable being written is not defined in the script.',
    ],
    recovery: [
      '変数名の綴りを確認し、台本の変数として定義を足してください。Scratchの変数と台本の変数は別物です。',
      'Check the spelling and define the variable in the script. A Scratch variable is not the same as a script variable.',
    ],
  },
  {
    when: /^K4-VARIABLE-WRITE-(?:TYPE|VALUE|INPUT)$/u,
    title: ['変数に入れる値を直してください', 'Fix the value being stored'],
    explanation: [
      '設定しようとした値が、その変数の型や範囲に合っていません。',
      'The value does not match the variable’s type or allowed range.',
    ],
    recovery: [
      'ブロックの型の指定を変数の定義と合わせてください。数の変数には数だけを、true／false の変数には真偽の値だけを入れます。空欄のままの入力も原因になります。',
      'Make the block’s type match the variable’s definition: numbers only for a number variable and true/false only for a boolean. An empty input also causes this.',
    ],
  },
  {
    when: /^K4-VARIABLE-WRITE-INACTIVE$/u,
    title: ['再生していないため変数を変えられません', 'The story is not playing'],
    explanation: [
      '紙芝居を再生していない間は、台本の変数を書き換えられません。',
      'Script variables cannot be written while the story is not playing.',
    ],
    recovery: [
      '紙芝居を再生してから変数を変えるブロックを実行してください。開始時に値を決めたい場合は、台本の変数の初期値として書いてください。',
      'Play the story before running the block, or set the value as the variable’s initial value in the script.',
    ],
  },

  // Custom actions contributed by other extensions.
  {
    when: /^K4-COMMAND-UNSUPPORTED$/u,
    title: ['この処理は登録されていません', 'This action is not registered'],
    explanation: [
      '台本が使っている処理が、今の作品に読み込まれていません。',
      'The action the script uses is not available in this project.',
    ],
    recovery: [
      'その処理を提供する拡張を作品に追加してから開き直してください。処理名の綴りが違うだけの場合もあります。',
      'Add the extension that provides the action and reopen the project. The action name may also simply be misspelled.',
    ],
  },
  {
    when: /^K4-CUSTOM-(?:HANDLER-MISSING|HANDLER-AMBIGUOUS|CONTEXT-MISSING)$/u,
    title: ['処理の受け手が見つかりません', 'No handler answered the action'],
    explanation: [
      'その処理を受け取る拡張が見つからない、または複数が名乗り出ました。',
      'No extension handled the action, or more than one claimed it.',
    ],
    recovery: [
      '必要な拡張が1つだけ読み込まれているか確認してください。同じ処理を提供する拡張を重ねて読み込んでいる場合は、片方を外してください。',
      'Check that exactly one extension providing the action is loaded, and remove the duplicate if two provide it.',
    ],
  },
  {
    when: /^K4-CUSTOM-ARGUMENT-UNKNOWN$/u,
    title: ['処理に渡した引数の名前が違います', 'The action has no such argument'],
    explanation: [
      '処理が受け取らない名前の引数が、台本に書かれています。',
      'The script passes an argument the action does not accept.',
    ],
    recovery: [
      '引数名の綴りを、その処理のブロックに表示される名前と見比べてください。拡張の版を上げて引数名が変わった場合は、台本も直してください。',
      'Compare the argument name with the one shown on the action’s block. If the extension renamed it, update the script too.',
    ],
  },
  {
    when: /^K4-CUSTOM-TIMEOUT$/u,
    title: ['処理が時間内に終わりませんでした', 'The action did not finish in time'],
    explanation: [
      '拡張の処理が、待ち時間の上限までに終わりませんでした。',
      'An extension’s action did not complete before its timeout.',
    ],
    recovery: [
      '通信やカメラなど時間のかかる処理であれば、接続を確認してもう一度再生してください。毎回起きる場合は、その処理を使う場面を分けるか、制作者に相談してください。',
      'For slow work such as networking or camera use, check the connection and play again. If it always happens, split that scene or ask the author.',
    ],
  },
  {
    when: /^K4-CUSTOM-/u,
    title: ['拡張の処理が失敗しました', 'An extension’s action failed'],
    explanation: [
      '台本から呼び出した拡張の処理が、途中で失敗しました。',
      'An extension action called from the script failed partway.',
    ],
    recovery: [
      '引数の値と、その処理が必要とする素材や許可を確認してください。原因が分からない場合は「診断情報をコピー」で情報を取り、その拡張の制作者に渡してください。',
      'Check the argument values and anything the action needs, such as assets or permissions. Otherwise copy the diagnostics and send them to that extension’s author.',
    ],
  },

  // Video and audio playback.
  {
    when: /^K4-(?:VIDEO-AUTOPLAY|AUDIO-UNAVAILABLE)$/u,
    title: ['ブラウザが自動再生を止めました', 'The browser blocked automatic playback'],
    explanation: [
      '利用者の操作なしに音や動画を再生することを、ブラウザが許可していません。',
      'The browser does not allow sound or video to start without a user action.',
    ],
    recovery: [
      '画面をクリックまたはタップしてから再生し直してください。開始直後に音を鳴らす作品では、最初の場面を「押して始める」にするか、動画を muted にしてください。',
      'Click or tap the stage and play again. For a story that plays sound immediately, start with a “tap to begin” scene or mute the video.',
    ],
  },
  {
    when: /^K4-VIDEO-DISABLED$/u,
    title: ['動画の再生が有効になっていません', 'Video playback is not enabled'],
    explanation: [
      'この実行環境では、動画を再生する機能が有効になっていません。',
      'Video playback is not enabled in this runtime.',
    ],
    recovery: [
      '動画に対応した版の紙芝居拡張で開き直してください。動画を使わない場合は、台本から動画の処理を外してください。',
      'Open the story with a Kamishibai runtime that supports video, or remove the video actions from the script.',
    ],
  },
  {
    when: /^K4-VIDEO-UNAVAILABLE$/u,
    title: ['この画面では動画を表示できません', 'Video cannot be shown here'],
    explanation: [
      '動画を重ねて表示する仕組みを、この表示環境では使えません。',
      'This display cannot provide the overlay video needs.',
    ],
    recovery: [
      '通常のブラウザのステージで再生し直してください。小さな埋め込み表示や画面の取り込み中は、動画を表示できないことがあります。',
      'Play the story on a normal browser stage. A small embedded view, or capture mode, can prevent video from showing.',
    ],
  },
  {
    when: /^K4-VIDEO-(?:ASSET|ID|SOURCE)$/u,
    title: ['動画の指定を直してください', 'Fix the video reference'],
    explanation: [
      '指定した動画が、素材として用意されていないか名前が違います。',
      'The video is not prepared as an asset, or the name does not match.',
    ],
    recovery: [
      '動画を assets に登録し、台本から参照している名前と一致させてください。場面より先に動画を用意する指定も確認してください。',
      'Register the video under assets and use the same name in the script. Also check that it is prepared before the scene uses it.',
    ],
  },
  {
    when: /^K4-VIDEO-LIMIT$/u,
    title: ['同時に表示できる動画の数を超えました', 'Too many videos are active'],
    explanation: [
      '同時に表示できる動画の枠（32個）を超えました。',
      'More than the 32 video regions that may be active at once were requested.',
    ],
    recovery: [
      '使い終わった動画を止める処理を加えて、同時に表示する数を減らしてください。',
      'Stop videos you have finished with so fewer are active at the same time.',
    ],
  },
  {
    when: /^K4-VIDEO-ARGUMENT$/u,
    title: ['動画の設定値を直してください', 'Fix the video settings'],
    explanation: [
      '動画の表示や再生の指定に、使えない値があります。',
      'A video presentation or playback setting has a value that cannot be used.',
    ],
    recovery: [
      '位置・大きさ・音量・再生位置の値が数であること、表示方法や操作の名前が決まった選択肢であること、空欄がないことを確認してください。',
      'Check that position, size, volume and time are numbers, that the display mode and operation names are from the allowed set, and that nothing is left blank.',
    ],
  },
  {
    when: /^K4-(?:VIDEO|AUDIO)-/u,
    title: ['動画または音を再生できませんでした', 'The video or sound could not play'],
    explanation: [
      '素材の読込、復号、または再生の開始に失敗しました。',
      'Loading, decoding or starting the media failed.',
    ],
    recovery: [
      'ブラウザが対応する形式（動画は MP4／WebM、音は MP3／WAV）で書き出し直してください。ファイルが壊れていないかも確認してください。',
      'Re-export the file in a format the browser supports (MP4 or WebM for video, MP3 or WAV for sound) and check that the file is not damaged.',
    ],
  },

  // Speech bubbles and transitions.
  {
    when: /^K4-SPEECH-STYLE-001$/u,
    title: ['せりふの設定に足りない項目があります', 'A speech setting needs another field'],
    explanation: [
      '指定した項目は、別の項目と組にしないと使えません。',
      'The field you set requires another field alongside it.',
    ],
    recovery: [
      '技術的な詳細に出ている組になる項目を、同じ様式か同じ処理に書き足してください。様式を重ねている場合は、合成後に残る値を確認してください。',
      'Add the companion field named in the technical details to the same style or action, and check which values remain after styles are composed.',
    ],
  },
  {
    when: /^K4-SPEECH-STYLE-002$/u,
    title: ['併用できない指定が混ざっています', 'These settings cannot be combined'],
    explanation: [
      '新しい表示方法の指定と、以前の表示方法の指定が同時に書かれています。',
      'A newer presentation setting is combined with the older fields it replaces.',
    ],
    recovery: [
      'どちらか一方の書き方に統一してください。1文字ずつ出す指定を使う場合は、以前の文字送りや開始音の指定を外してください。',
      'Keep only one of the two. When using the reveal setting, remove the older character-by-character fields and startSound.',
    ],
  },
  {
    when: /^K4-BUBBLE-STYLE-CYCLE-001$/u,
    title: ['せりふの様式が輪になっています', 'The bubble styles form a cycle'],
    explanation: [
      '様式が互いを参照し合っていて、順番を決められません。',
      'The styles reference each other, so they cannot be ordered.',
    ],
    recovery: [
      '技術的な詳細に出ている参照の順序をたどり、どこか1か所の styles の指定を外してください。共通の見た目は、何も参照しない様式にまとめます。',
      'Follow the reference chain in the technical details and remove one styles entry. Put the shared look in a style that references nothing.',
    ],
  },
  {
    when: /^K4-(?:TRANSITION|CROSSFADE)/u,
    title: ['場面の切り替えを実行できませんでした', 'The transition could not run'],
    explanation: [
      '指定した切り替え方か、その設定値を使えませんでした。',
      'The requested transition or one of its settings could not be used.',
    ],
    recovery: [
      '切り替えの名前が決まった選択肢であること、時間の値が0以上の数であることを確認してください。重ね合わせの切り替えは、対応していない表示環境では使えません。',
      'Check that the transition name is one of the allowed values and that its duration is a number of zero or more. Crossfade is unavailable on displays that do not support it.',
    ],
  },
  {
    when: /^K4-RUNTIME-SPEECH-/u,
    title: ['せりふの表示を実行できませんでした', 'The speech could not be shown'],
    explanation: [
      'せりふの様式か、閉じ方の指定を解決できませんでした。',
      'The speech style or its closing rule could not be resolved.',
    ],
    recovery: [
      '参照している様式が bubbleStyles に定義されているか、綴りが一致しているかを確認してください。閉じ方の指定は決まった選択肢から選びます。',
      'Check that the referenced style is defined under bubbleStyles and spelled the same way, and that the closing rule is one of the allowed values.',
    ],
  },

  // The script as YAML, and schema validation of its fields.
  {
    when: /^K4-YAML/u,
    title: ['台本の書き方を確認してください', 'Check the script syntax'],
    explanation: [
      '台本をYAMLとして読み取れませんでした。',
      'The script could not be read as YAML.',
    ],
    recovery: [
      '表示した行の前後で、字下げ、コロン、引用符、括弧の対応を確認してください。',
      'Check indentation, colons, quotes and matching brackets around the indicated line.',
    ],
  },
  {
    id: 'schema',
    when: ({code}) => /^K4-SCHEMA/u.test(code) || code === 'K4-NARRATIVE-SOURCE-001',
    ...dsl4SchemaFieldRemedy,
  },

  // Script blocks in the code area.
  {
    when: /^K4-BLOCK-SOURCE-(?:CYCLE|DUPLICATE)-001$/u,
    on: 'outer',
    title: ['台本ブロックの取り込みを直してください', 'Fix how the script blocks are combined'],
    explanation: [
      '台本ブロックが互いを取り込んでいるか、同じ台本を二重に取り込んでいます。',
      'The script blocks include each other, or the same script twice.',
    ],
    recovery: [
      '取り込みのブロックをたどり、輪になっている箇所か重複している箇所のどちらか一方を外してください。',
      'Follow the include blocks and remove one side of the cycle or the duplicate.',
    ],
  },
  {
    when: /^K4-BLOCK-SOURCE-(?:MISSING|PATH|LABEL|PROJECT|FRAGMENT)-001$/u,
    on: 'outer',
    title: ['台本ブロックの指定を直してください', 'Fix the script block’s reference'],
    explanation: [
      '台本ブロックが指しているファイル名か見出しを解決できませんでした。',
      'The file name or label the script block points at could not be resolved.',
    ],
    recovery: [
      'ブロックに入力したファイル名と、文書エディターに並ぶ台本の名前を見比べてください。改名したときは、参照しているブロックもあわせて直します。',
      'Compare the name typed on the block with the script names listed in the document editor, and update the blocks after renaming a file.',
    ],
  },
  {
    when: /^K4-BLOCK-ACTION-/u,
    title: ['ブロックに入力した値を直してください', 'Fix the value typed on the block'],
    explanation: [
      'ブロックに入力したJSONか値を、台本の項目として読み取れませんでした。',
      'The JSON or value typed on the block could not be read as a script field.',
    ],
    recovery: [
      '入力欄のJSONを確認してください。文字列は二重引用符で囲み、項目の区切りのコンマと括弧の対応をそろえます。長すぎる入力は台本側に移してください。',
      'Check the JSON in the input: double-quote strings and balance the commas and brackets. Move very long values into the script instead.',
    ],
  },
  {
    when: /^K4-BLOCK-SOURCE/u,
    on: 'outer',
    title: ['台本のブロックを確認してください', 'Check the script block'],
    explanation: [
      '台本として読み取れないブロックまたは接続が含まれています。',
      'A block or connection could not be read as part of the script.',
    ],
    recovery: [
      '該当ブロックと接続を確認してください。台本用の対応ブロックを使用してください。',
      'Check the indicated block and its connections. Use blocks supported by the script.',
    ],
  },
  {
    when: /^K4-BLOCK-(?:EXPORT|PREVIEW)-/u,
    title: [
      'ブロックの書き出しとプレビューを確認してください',
      'Check the block export or preview',
    ],
    explanation: [
      'ブロックから台本を書き出す、またはブロックの内容を下見する処理に失敗しました。',
      'Exporting the script from blocks, or previewing a block, failed.',
    ],
    recovery: [
      '書き出す台本の名前が重複していないか、参照されていない台本が残っていないかを確認してください。下見は、その作品に取り込んだ台本と素材だけが対象です。',
      'Check for duplicate script names and scripts nothing references. Previewing only works for scripts and assets held by this project.',
    ],
  },

  // Saved progress.
  {
    when: /^K4-SAVE-INCOMPATIBLE$/u,
    title: ['このセーブは今の作品で使えません', 'This saved data does not fit this story'],
    explanation: [
      'セーブデータが、別の作品か別の版の台本のものです。',
      'The saved data belongs to a different story or a different version of the script.',
    ],
    recovery: [
      '対応するセーブを選び直すか、新しく始めてください。台本を大きく変えた後の古いセーブは、続きから再生できません。',
      'Choose a matching save or start over. An old save cannot resume after the script changed substantially.',
    ],
  },
  {
    when: /^K4-SAVE-SLOT-LIMIT$/u,
    title: ['セーブの枠がいっぱいです', 'The save slots are full'],
    explanation: ['使えるセーブの枠の数を超えました。', 'There are no free save slots left.'],
    recovery: [
      '使わないセーブを消してから、もう一度保存してください。',
      'Delete a save you no longer need and save again.',
    ],
  },
  {
    when: /^K4-SAVE-(?:BUSY|QUIESCE-TIMEOUT)$/u,
    title: ['前の保存処理が終わっていません', 'A previous save is still running'],
    explanation: [
      '保存または復元の処理が進んでいる間は、次の操作を受け付けません。',
      'Another save or restore is in progress.',
    ],
    recovery: [
      '少し待ってから、もう一度操作してください。何度も起きる場合は、再生を止めてから保存し直してください。',
      'Wait a moment and try again. If it keeps happening, stop playback before saving.',
    ],
  },
  {
    when: /^K4-SAVE-/u,
    title: ['セーブを読み書きできませんでした', 'The saved data could not be read or written'],
    explanation: [
      'セーブデータの内容か、作品との対応を確かめられませんでした。',
      'The saved data, or its link to this story, could not be verified.',
    ],
    recovery: [
      '別のセーブを選ぶか、新しく始めてください。ブラウザの保存領域を消した直後や、作品を入れ替えた直後に起こります。',
      'Choose another save or start over. This happens right after clearing browser storage or replacing the project.',
    ],
  },

  // Preview, live reload and the preview host.
  {
    when: /^K4-WEB-PREVIEW-UNSUPPORTED$/u,
    title: ['このブラウザではフォルダを開けません', 'This browser cannot open a project folder'],
    explanation: [
      'このブラウザは、作品フォルダを選んで読む仕組みに対応していません。',
      'This browser does not support choosing a project folder to read.',
    ],
    recovery: [
      'Chrome または Edge の最新版で開き直してください。対応していないブラウザでは、作品ファイルを読み込む方法で確認してください。',
      'Open the preview in a recent Chrome or Edge. Otherwise load the project file instead of a folder.',
    ],
  },
  {
    when: /^K4-WEB-PREVIEW-INSECURE-CONTEXT$/u,
    title: ['安全な接続で開き直してください', 'Open the preview over a secure connection'],
    explanation: [
      'この仕組みは、https の最上位ページでだけ使えます。',
      'This feature works only on a secure top-level page.',
    ],
    recovery: [
      'https のURLか http://localhost で開き直してください。別のページに埋め込んだ枠の中では使えません。',
      'Open the page over https or at http://localhost. It does not work inside a frame on another page.',
    ],
  },
  {
    when: /^K4-WEB-PREVIEW-PERMISSION-(?:DENIED|REVOKED)$/u,
    title: [
      '作品フォルダの読み取りが許可されていません',
      'Reading the project folder was not allowed',
    ],
    explanation: [
      'フォルダを読む許可が、与えられていないか取り消されています。',
      'Read access to the folder was denied or revoked.',
    ],
    recovery: [
      'プレビューでフォルダを選び直し、読み取りを許可してください。ブラウザを再起動した後は、もう一度選び直す必要があります。',
      'Select the folder again in the preview and allow reading it. After restarting the browser you must pick it again.',
    ],
  },
  {
    when: /^K4-WEB-PREVIEW-PICKER-CANCELLED$/u,
    title: ['フォルダの選択を取り消しました', 'Folder selection was cancelled'],
    explanation: [
      '作品フォルダが選ばれないまま、選択画面が閉じられました。',
      'The folder chooser closed without a project folder.',
    ],
    recovery: [
      'もう一度フォルダを選び、台本と素材が入っている作品フォルダを指定してください。',
      'Choose the folder again and pick the project folder that holds the script and assets.',
    ],
  },
  {
    when: /^K4-WEB-PREVIEW-BACKGROUND-THROTTLED$/u,
    title: ['タブが背面にあるため処理を止めました', 'The tab was in the background'],
    explanation: [
      'ブラウザが背面のタブの処理を抑えたため、更新の検知を続けられませんでした。',
      'The browser throttled the background tab, so watching for updates stopped.',
    ],
    recovery: [
      'プレビューのタブを前面に出してから、もう一度更新してください。長時間使う場合は、タブを前面に置いたままにしてください。',
      'Bring the preview tab to the front and refresh. Keep it in the front while you work.',
    ],
  },
  {
    when: /^K4-WEB-PREVIEW-MANIFEST-/u,
    title: ['作品フォルダの構成ファイルを確認してください', 'Check the project’s source manifest'],
    explanation: [
      '選んだフォルダに構成ファイルが無いか、その内容を読み取れませんでした。',
      'The selected folder has no source manifest, or it could not be read.',
    ],
    recovery: [
      '台本と素材が入っている作品フォルダを選び直してください。構成ファイルを手で編集した場合は、YAMLまたはJSONとして読める形になっているか確認してください。',
      'Select the project folder that holds the script and assets. If you edited the manifest by hand, check that it is valid YAML or JSON.',
    ],
  },
  {
    when: /^K4-(?:PREVIEW-RELOAD|RELOAD)-/u,
    title: ['更新を今の再生位置に反映できませんでした', 'The update could not be applied here'],
    explanation: [
      '変更の内容が、再生中の位置に当てはめられませんでした。',
      'The change could not be matched to the position being played.',
    ],
    recovery: [
      '場面の先頭から再生し直すと反映されます。場面や処理を増減・改名した直後は、位置を保ったままの反映ができません。',
      'Play the scene from its start to pick up the change. Right after adding, removing or renaming scenes and actions, the position cannot be kept.',
    ],
  },
  {
    when: /^K4-PREVIEW-CONTROL-ASSET-001$/u,
    title: ['下見用の素材の読込方法を直してください', 'Fix how the preview control asset loads'],
    explanation: [
      'カメラの下見に使う素材は、場面の開始前に読み込む指定が必要です。',
      'An asset used for the camera preview control must be loaded before the scene starts.',
    ],
    recovery: [
      'その素材の読込方法を、必要になってから読む指定から、先に読み込む指定（eager）に変えてください。',
      'Change that asset’s loading from lazy to eager.',
    ],
  },
  {
    when: /^K4-(?:WEB-)?PREVIEW/u,
    title: ['プレビューを続けられませんでした', 'The preview could not continue'],
    explanation: [
      'プレビューの接続か、下見用の作品の生成に失敗しました。',
      'The preview connection, or building the preview project, failed.',
    ],
    recovery: [
      'プレビューを開き直し、作品フォルダを選び直してください。台本と素材を保存し終えてから、もう一度試してください。',
      'Reopen the preview and select the project folder again, after the script and assets have finished saving.',
    ],
  },

  // Migration of older stories.
  {
    when: /^K4-MIGRATION-/u,
    title: ['古い台本を今の形式に移せませんでした', 'The older script could not be migrated'],
    explanation: [
      '以前の形式の台本を、今の形式へ移す途中で判断できない記述が見つかりました。',
      'Converting the older script to the current format found something it cannot decide.',
    ],
    recovery: [
      '元の作品を保存したまま、台本を1ファイルずつ開いて保存し直してください。1つの作品に新旧の形式が混ざっている場合は、どちらかにそろえてください。',
      'Keep the original project and open and save each script file one at a time. If a project mixes the old and new formats, settle on one.',
    ],
  },
  {
    when: /^K4-STRUCTURED-DATA-/u,
    title: ['構造データのブロックを確認してください', 'Check the structured data blocks'],
    explanation: [
      '台本の項目を読み書きするブロックの指定を解決できませんでした。',
      'A block that reads or writes a script field could not be resolved.',
    ],
    recovery: [
      '指定した項目の道順（パス）が台本の構造と一致しているか確認してください。場面の中の項目は、その場面が再生中のときにだけ読み書きできます。',
      'Check that the field path matches the script’s structure. Fields inside a scene can be read or written only while that scene is playing.',
    ],
  },
  {
    when: /^K4-SVG-TEXT-/u,
    title: ['文字の画像を作れませんでした', 'The text image could not be drawn'],
    explanation: [
      '文字をコスチュームとして描く処理に失敗しました。',
      'Drawing the text as a costume failed.',
    ],
    recovery: [
      '文字数、書体の名前、文字の大きさや色の指定を確認してください。読み込まれていない書体を指定すると失敗します。',
      'Check the text length, the font name and the size and colour settings. A font that is not loaded will fail.',
    ],
  },
  {
    when: /^K4-HISTORY-/u,
    title: ['履歴の機能を使えませんでした', 'The history feature is unavailable'],
    explanation: [
      '読んだ場面の履歴を、記録または利用できませんでした。',
      'The history of visited scenes could not be recorded or used.',
    ],
    recovery: [
      '台本で履歴を有効にしているか、記録できる件数の上限を超えていないかを確認してください。履歴を使う操作は、履歴が有効な作品でだけ使えます。',
      'Check that history is enabled in the script and that its limit is not exceeded. Operations that use history need it enabled.',
    ],
  },

  // Temporary storage used by the preview.
  {
    id: 'storage',
    when: /KVS_|SESSION_BINARY/u,
    on: 'all',
    title: ['一時保存した素材を利用できません', 'Temporary asset storage is unavailable'],
    explanation: [
      'ブラウザの一時ストレージで問題が発生しました。',
      'A problem occurred in temporary browser storage.',
    ],
    recovery: [
      '技術的な詳細に表示したストレージの案内を確認してください。解決しない場合は診断情報を制作者に渡してください。',
      'Follow the storage guidance in the technical details. If the problem persists, send the diagnostics to the author.',
    ],
  },

  // Runtime capabilities and internal contracts.
  {
    when: ({code}) => /^K4-HOST-/u.test(code) || code === 'K4-RUNTIME-PORT-001',
    title: ['この実行環境では処理を実行できません', 'This environment cannot run the operation'],
    explanation: [
      '必要な機能が不足しているか、実行環境の設定に問題があります。',
      'A required capability is missing or the runtime configuration is invalid.',
    ],
    recovery: [
      '対応する実行環境か制作者に確認してください。「診断情報をコピー」で調査用の情報を渡せます。',
      'Ask the author to check runtime compatibility. Copy the diagnostics to help investigate.',
    ],
  },
  {
    when: /^K4-(?:RUNTIME|NAVIGATION|ACTOR-PORT|MEDIA-PORT|ASYNC-INPUT-PORT|TW-ACTOR|STORY-CAMERA)/u,
    title: ['処理を実行できませんでした', 'The action could not be run'],
    explanation: [
      '台本の処理を、今の再生状態では実行できませんでした。',
      'The script’s action could not be carried out in the current playback state.',
    ],
    recovery: [
      '処理が対象にしている登場人物・素材・場面が、その場面で使える状態になっているかを確認してください。場面の先頭から再生し直すと直ることがあります。',
      'Check that the actor, asset or scene the action targets is available in that scene. Playing the scene from its start often clears it.',
    ],
  },
  {
    when: /^K4-PLAYBACK-RUNTIME-001$/u,
    title: [
      '再生用のランタイムを取得できませんでした',
      'The playback runtime could not be fetched',
    ],
    explanation: [
      '配布用SB3を作るときに、紙芝居アプリのサイトから再生用のランタイムを取得できないか、中身を確かめられませんでした。作品は制作用のランタイムのまま作られ、動きは同じですが大きくなります。',
      'While building the distribution SB3, the playback runtime could not be fetched from the Kamishibai site or verified. The work keeps the authoring runtime: it plays the same but is larger.',
    ],
    recovery: [
      'ネットワークにつながっていることを確かめてから、配布用SB3をもう一度作ってください。',
      'Check the network connection, then build the distribution SB3 again.',
    ],
  },
  {
    when: /^K4-(?:ARTIFACT|COMPILED|PUBLICATION|REGISTRY|BINARY-BACKING|PLATFORM|PACKAGER|BROWSER-BUILD|CONTENT-RUN|DIAGNOSTIC-POLICY)/u,
    title: ['作品の成果物を読み込めませんでした', 'The built story could not be loaded'],
    explanation: [
      '書き出した成果物の中身か、その対応関係を確かめられませんでした。',
      'The built story’s contents, or how they fit together, could not be verified.',
    ],
    recovery: [
      '作品を書き出し直してから、もう一度開いてください。配布物を手で編集・分割した場合は、書き出した状態に戻してください。',
      'Build the story again and reopen it. If the distributed files were edited or split by hand, restore the built output.',
    ],
  },
];

/** The first entry whose condition matches, or null when none explains the failure. */
export function dsl4RuntimeErrorRemedy(
  signals: Dsl4ErrorSignals,
): (Dsl4ErrorRemedy & {readonly id?: 'schema' | 'storage'}) | null {
  for (const entry of remedies) {
    const matched =
      typeof entry.when === 'function'
        ? entry.when(signals)
        : entry.on === 'all'
          ? signals.codes.some((value) => value.length > 0 && (entry.when as RegExp).test(value))
          : (entry.when as RegExp).test(entry.on === 'outer' ? signals.outerCode : signals.code);
    if (matched)
      return {
        ...(entry.id ? {id: entry.id} : {}),
        title: entry.title,
        explanation: entry.explanation,
        recovery: entry.recovery,
      };
  }
  return null;
}

/**
 * What to do when no code explains the failure.
 *
 * The explanation keeps saying that the cause is undetermined, and the steps are the ones that
 * help whatever the cause was, so the screen never guesses one.
 */
export const dsl4UnknownErrorRemedy: Dsl4ErrorRemedy = {
  title: ['紙芝居を続けられませんでした', 'The story could not continue'],
  explanation: ['原因を特定できませんでした。', 'The cause could not be determined.'],
  recovery: [
    checkList(
      [
        '1. 「確認する場所」に出ている場面・処理・項目を台本で開き、直前に書き換えた箇所を見直す。',
        '2. 直前に加えた台本・素材・設定の変更を元に戻して、もう一度再生する。',
        '3. それでも起きる場合は「診断情報をコピー」で情報を取り、制作者に渡す。',
      ],
      '次の順に確かめてください。',
    ),
    checkList(
      [
        '1. Open the scene, action or field shown under “Where to check” and review what you changed last.',
        '2. Undo the most recent change to the script, assets or settings and play again.',
        '3. If it still happens, copy the diagnostic information and send it to the author.',
      ],
      'Work through these steps:',
    ),
  ],
};
