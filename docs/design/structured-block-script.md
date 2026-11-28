# ブロック台本の生成とYAMLへの書き戻し

関連: [Issue #886](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/886)、[Issue #883](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/883)、[Issue #881](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/881)、#834、#684、#579。

`author-block-dsl`は、検証したYAMLを実際の命令ブロックへ変換する。シーンごとのC字型宣言の内側へ、
core action manifestで定義した命令ブロックを順番に接続する。元のYAML全文は保持しない。
台本の分割はincludeで行い、ファイルをまたぐ移動も`goto`で表す（[segment・publicationの廃止](dsl-4-segment-retirement.md)）。

```sh
turbowarp-kamishibai author-block-dsl --input story.k4.yml --base base.sb3 --output blocks.sb3
# TurboWarpでblocks.sb3を開き、ブロックを編集して保存する。
turbowarp-kamishibai export-block-dsl --input blocks.sb3 --output-dir exported
```

`export-block-dsl`と`build-dsl4`は、保存された接続と入力値から台本を復元し、共通frontendのschema・意味検証へ渡す。
命令の追加・削除・並べ替え、対象・引数の変更、シーン名・順序の変更が反映される。
シーンを改名した際の`goto`や入力経路の参照先もブロック上で変更する。参照不整合は共通検証でエラーになる。
ハットから切り離したブロックは台本に含まれない。YAMLのコメント・引用符・空行は保持しない。

## 補助ブロック

補助ブロックは runtime 拡張が定義する。土台の runtime が
`// Kamishibai capabilities: unified-declarations-v1` を持つ場合、生成SB3は補助ブロックを runtime の opcode で書き、
別の拡張を同梱しない。古い土台には、従来どおり編集用拡張`kubohiroyakamishibaiauthoring4`をdata URLで同梱し、
その opcode で書く。どちらの書き方も同じ台本として読む。経緯は[パレットの統合](dsl-4-block-palette-unification.md)を参照。
以下の「編集用拡張」の記述は、古い土台へ書く場合の記録として残す。

| ブロック        | 役割                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `scene`         | シーン名とシーン属性を持ち、内側に命令を接続する。                                                                |
| `property`      | 旧表現の読取と、専用ブロックがない設定の保持に使う。パレットでは非表示。PATHは1〜2要素のJSON配列、VALUEはJSON値。 |
| `actionOptions` | 安定ID、追加属性などを保持し、内側に実命令1個を接続する。`arguments`には実命令の入力にない属性だけを記載する。    |
| `customAction`  | 登録済みcustom actionの対象、命令名、JSON引数、任意の安定IDを保持する。検証には対応するregistryが必要。           |

既存ブロックのSPEC・ROUTES・STEPSは、公開ランタイムの契約どおりJSON入力を使う。
省略可能な引数の空欄は省略を表す。`setText`のrun配列はTEXTをJSONで保持し、
`actionOptions`の`textFormat: "json"`で区別する。通常の文字列は`plain`を使う。
補助属性で実命令の入力を上書きすることはできない。

宣言ハットと補助ブロックはオーサリング用で、台本を実行するハットではない。
ランタイムが起動時に宣言を読み取り、空名のルートから物語を開始する。ハット自身は発火しない。
CLIの実行用成果物は、書き戻したYAMLから`build-dsl4`で生成する。

## 種類別の定義ブロック（Issue #886）

素材、操作、アクター、文字スタイル、変数は名前付きの定義ブロックにする。
表紙、ローディング画面、認識設定は台本ごとに一つなので名前入力を設けない。
YAMLの内部パスを入力する必要はなく、ブロック名から定義の種類が分かる。

| ブロック表記                      | YAMLの定義先             | JSON値の例                                                                     |
| --------------------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| `asset [NAME] = JSON [VALUE]`     | `assets[NAME]`           | `"costume:Urashima"`、`{"kind":"costume","target":"Urashima","name":"walk-1"}` |
| `control [NAME] = JSON [VALUE]`   | `controls.keymaps[NAME]` | `{"Space":"navigation.nextAction"}`                                            |
| `actor [NAME] = JSON [VALUE]`     | `actors[NAME]`           | `"Urashima-walk-1"`                                                            |
| `textStyle [NAME] = JSON [VALUE]` | `textStyles[NAME]`       | `{"size":24,"color":"#ffffff"}`                                                |
| `variable [NAME] = JSON [VALUE]`  | `variables[NAME]`        | `0`、`false`、`"浦島"`                                                         |
| `cover = JSON [VALUE]`            | `cover`                  | `{"backdrop":"Beach","bgm":"OpeningSound"}`                                    |
| `loading = JSON [VALUE]`          | `loading`                | `{"backdrop":"Beach","costumes":["Loading1","Loading2"]}`                      |
| `recognition = JSON [VALUE]`      | `recognition`            | `{"preview":{"mirroring":"mirrored"}}`                                         |

例えば、名前欄を`Urashima-walk-1`にした`asset`ブロックは、同名の素材を1件定義する。
`control`の名前はキーマップ名であり、値に`keymaps`を重ねて書かない。
`actor`の値は初期スキンのアセットIDを表すJSON文字列であり、オブジェクトではない。
JSON文字列には二重引用符が必要。`variable`は有限数・真偽値・文字列のみを受理し、`null`・配列・オブジェクトは使えない。
名前欄には引用符を付けず、DSLの識別子をそのまま入力する。
素材名は空でない文字列、他の名前は先頭がUnicode文字か`_`、続きがUnicode文字・数字・`_`・`-`の識別子とする。
禁止キーや非NFCの識別子など、既存DSLの制約も適用する。

生成・読取はruntime単体形式とbundle形式の両方に対応し、ラベル付きモジュール内にも同じ定義ブロックを置ける。
名前・JSON値の編集、定義の接続・切離しはYAML書き戻しへ反映する。改名した定義への参照も作者が編集する。
同一宣言内の同名定義、単一設定の重複、旧`property`と新ブロックによる同じ範囲への書込は、順序にかかわらずエラーになる。
モジュール間の衝突は既存のinclude合成規則で検出する。
入力の欠損・不正JSON・基本型の不一致・接続の不整合はtargetとblock ID付きで診断する。
内部属性のschema違反と参照不整合は、書き戻し・ビルド時に共通frontendで検証し、不正なYAML成果物は出力しない。

既存の`property`は読取互換を保ち、新しい拡張でもopcodeと入力形式を維持する。パレットへは新規定義用として表示しない。
8種類の定義は専用ブロックで生成する。
`branches`・`bubbleStyles`・`bubbleClosePolicies`・`presentation`・`audio`は引き続き`property`で保持し、生成済みブロックの値を編集できる。
`assets: {}`など、名前付き項目が存在しない明示的な空マッピングも、存在自体を失わないよう非表示の`property`で保持する。
旧`property`を持つSB3はexportでYAMLへ戻し、`author-block-dsl`で再生成すれば専用ブロックへ移行できる。
旧SB3に埋め込まれた編集用拡張には新しいパレット定義がないため、専用ブロックを追加する際は先に再生成する。

変更は生成SB3に同梱する編集用拡張と変換処理に限定し、通常ランタイムや既存feature flagの既定値は変更しない。
切戻しに備えて元YAMLと編集前SB3を保持する。専用ブロック編集後は対応CLIでYAMLへ書き戻して退避し、
変更前のCLIでそのYAMLから従来形式を再生成する。専用ブロックを含むSB3を旧CLIへ直接渡しても読取は保証しない。

## 対象形式・検証・ロールバック

### 専用定義のフォーム編集（Issue #891）

生成SB3の編集用拡張は、`Scratch.gui.blockEditors` API v1がある場合に8種類の`VALUE`用Schemaフォームを登録する。
`blockEditorDialogs=1`を起動時に指定した対応Editorで、配置した専用ブロック左端のアイコンから開く。
編集用拡張はサンドボックスなしで読み込む。APIがないEditorでは通常の文字列入力を使い、ランタイムの動作は変えない。
古い編集用SB3の埋込拡張は自動更新されないため、対応CLIでYAMLへ書き戻して再生成する。

`scene`の`PROPERTIES`も左端のアイコンからフォームで編集する（Issue #925）。
認識モデル・認識モード・場面のカメラプレビュー・開始時の切り替え効果を設定できる。
正本の`longScene`から`actions`を除いてSchemaを生成し、空の設定`{}`も受理する。
切り替え効果の`const`は保持し、フォームで`cut`と`crossfade`を直接切り替えられるようにする。
場面名は通常の入力、命令列は接続されたブロックで編集する。

アクション用には`pose`の`STEPS`と、`say`・`think`の`SPEC`を登録する（Issue #904 / #913）。
runtime単体・Standard bundleの実opcodeに対応し、`TARGET`は従来のブロック入力で編集する。
`say`・`think`は正本の`speechArgs`に従い、未指定の`styles`を開閉だけで追加しない。
RJSFのpath-schema処理で例外を起こす`properties`内の`true`は同値の空Schemaへ投影する。

Schemaは`schema/dsl-4.schema.json`の到達可能な定義から生成し、GUIが使うdraft-07へローカル参照・依存制約を射影する。
素材の入手元ごとの制約は完全なフォームへ展開する。任意のobjectは未設定を選べるようにし、未編集の値へ
既定値や空objectを補わない。`actor`のJSON文字列、`variable`の数値・真偽値・文字列も同じ保存形式を維持する。
名前欄は通常の入力で編集する。フォーム内のSchema検証と、export/build時の名前・参照・台本全体の意味検証は別に行う。

保存・キャンセル・競合防止・Undo/RedoはExtension Data Editorの既存セッションに委譲する。
登録が途中で失敗した場合は登録済みフォームを解除して警告し、通常ブロックを維持する。
切戻しはEditor URLから`blockEditorDialogs=1`を外して再読込する。公開済みruntime/SB3やfeature flagの既定値は変更しない。

台本の入口は`kamishibai [4.0] [ラベル]`ハットへ統一する。
旧`whenDsl4Source`と`dsl4SourceFromYamlJson`はランタイムの定義・読取・生成APIから削除し、互換読取は行わない。
旧ハットを含むSB3は`K4-BLOCK-SOURCE-REMOVED-001`で拒否する。
新形式は`author-block-dsl`で生成する。公開済み配布物は再リリースせず、開発版のランタイム定義と内部再生bundleを更新する。
include付きの生成は下記のラベル付き宣言で行う。読取・exportではStage/Spriteの各targetに置いた新ハットも読み取る。

生成物は読取処理と共通frontendに通し、生成前後のcanonical StoryDocumentを比較する。
同じ入力のSB3はブロックIDとZIP timestampを含めて決定的に生成する。
循環・接続不整合・重複・不明なopcode・不正JSON・schema違反はエラーとし、元の台本へフォールバックしない。
ブロック数・入力長・JSON深さ等には上限がある。動的なScratch式の評価は行わず、対応する静的入力を読み取る。

非対応ブロックの診断改善（[Issue #931](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/931)）では、ステージ上にブロックの表示名とステージ／スプライト名を表示する。
エディターのBlocklyが利用可能なら「該当ブロックを表示」からコードタブと対象へ切り替え、折りたたまれた親を展開し、
該当ブロックを選択・中央表示する。選択時にエラーパネルを閉じても、台本の実行は再開しない。
コードタブを開けない場合や対象が削除・置換された場合は移動失敗を表示する。
編集機能のないプレイヤーでは移動ボタンを表示せず、取得可能な名前とエラーコードを表示する。
名前はブロック自身の表示ラベルから取得し、接続された子ブロックや式を評価しない。
定義が取得できないブロックはopcodeを代わりに表示する。切戻しはこの診断表示の差分をrevertする。

ロールバックは本変更をrevertし、以前のCLIで旧形式を再生成する。通常ランタイムのfeature flagの既定値は変更しない。

## ラベル付き宣言とincludeBlocks（Issue #883）

新しい生成では編集用拡張の`kamishibai [VERSION] [LABEL]`をハットとして使う。
VERSIONは文字列`4.0`、LABELの既定は空文字。`includeBlocks [LABEL]`を宣言直下に接続する。
`includeBlocks`は実行命令ではなく、既存YAMLのincludeと同じモジュール合成を指す。
宣言列内ではシーンの前後に置けるが、シーンやactionOptionsの内側には置けない。

- 空でないラベルはSB3全体で一意。Stage/Spriteをまたいで完全一致で解決し、同一targetにも複数宣言を置ける。
- Stage上の名前（ラベル）が空の宣言をルートにする。Stage上には空名の宣言が1個必要で、名前付き宣言だけの場合は診断する。
  空ラベル宣言は各targetに1個まで。
- SB3を開いた際は組み込み台本を検出し、タイトルを閉じると既存の物語開始経路で再生する。再開時には現在のブロックを読み直し、編集内容を反映する。
- プロジェクト素材・remote素材は宣言から解決する。file素材にはSB3内の対応するアセットバンドルが必要で、ファイル選択への自動フォールバックは行わない。
- 新ハットのラベル入力がなければ空文字と解釈する。旧whenDsl4Sourceハットは対応しない。
- includeBlocksの参照ラベルは空文字にできない。Scratch変数や動的式は使えない。
- 自己参照・循環・重複・未定義ラベル・接続不整合・合成時の同名宣言を拒否する。
  ブロック診断はtargetとblock IDを持ち、合成衝突もソースを宣言したtargetとhat IDを表示する。

`author-block-dsl`は入力ファイルのフォルダーをプロジェクトのルートとしてincludeを読み取る。
既存の安全なファイル読取とsource graph検証を使い、symlinkによるルート外参照や変更中の入力も拒否する。
生成時のラベルは元の相対ソースパス、主台本のラベルは空文字。全宣言をStageに並べる。
名前付きモジュールにkamishibaiプロパティを生成せず、各ハットのVERSIONから入口のバージョンだけを復元する。
素材のfileはプロジェクトルート基準へ補正する。素材ファイル自体はYAML exportには同梱しない。

### 設定ハット（Issue #916）

YAMLからブロック台本を生成するとき、`control`、`asset`、`cover`、`textStyle`、
`variable`、`loading`、`recognition`の定義列は`kamishibaiConfig [LABEL]`へ接続する。
`actor`と`scene`は従来の`kamishibai [VERSION] [LABEL]`側に残す。明示的な空マッピングも
設定ハット内の`property`で保持する。設定がないソースには設定ハットを生成しない。
入口の設定ハットは空名、include先の設定ハットは元の相対ソースパスを名前にする。

実行時には、Stage上の空名`kamishibai`から、プロジェクト全体の設定ハットを暗黙に取り込む。
空名を最初に、その後は名前の文字列順（JavaScriptの文字列比較順）に読む。
targetの配列順、ハットの配置、ブロックIDには依存しない。明示`includeBlocks`は不要。
空名を含め設定ハットの名前はプロジェクト全体で一意とし、同名の多重定義は起動時に
`K4-BLOCK-SOURCE-DUPLICATE-001`で停止する。設定ハットと通常の台本ハットは別の名前空間を持つ。
同じ設定項目の重複は既存の定義衝突として診断し、読み込み順で上書きはしない。

設定ハットは上記7種の設定と、それらの`property`・定義用セクションだけを受け付ける。
セクションOFFの内容と設定ハット自体もYAML書戻し・再生成で保持する。
Sprite上の設定でエラーが生じた場合も、元のtargetとblock IDを診断に表示する。
従来の通常ハット直下の設定定義も引き続き読み込める。

ロールバックは変更をrevertし、旧CLIで通常ハット直下の定義列を再生成する。
samplesの配布更新は[samples #184](https://github.com/kubohiroya/turbowarp-kamishibai-samples/issues/184)で追跡し、authoring pin・SB3・lockを一組で更新・切り戻す。
新しいハットを持つSB3には本変更を含むauthoringランタイムが必要。
既存のrc.25 SB3へ編集用拡張だけを差し替えても、内部の旧読取処理は新ハットを収集できない。
配布更新時は対応するランタイムを組み込んだbaseも準備する。

読取では、ラベルをパスとして直接使用しない。空でないラベルを辞書順に並べ、
`blocks-0001.k4.yml`などの安全な仮想ファイル名を割り当てる。入口と既存の空ラベル宣言はtarget名を維持する。
参照を対応するファイル名へ変換し、includeの順序・モジュール分割を保つ。
ラベル変更・追加により連番は変わり得る。同じ入力に対しては決定的である。
既存名やexport時の主台本名と衝突した場合は、大文字小文字・Unicode正規化も考慮して拒否する。
参照されないモジュールは既存のexport規則どおりエラーにする。

生成CLIは64ファイル、各ソース1 MiB、合計4 MiB、深さ32を既定上限とする。
共通frontendの合成後ソース上限は1 MiB以内。読取には宣言数256、target数256、各targetのブロック数8192の上限もある。
`--max-source-files`、`--max-source-bytes`、`--max-total-source-bytes`、`--max-include-depth`で生成側の上限を指定できる。

同期API`authorDsl4BlockSourceSb3`は単一台本用とし、
非同期API`authorDsl4BlockSourceGraphSb3`をinclude graph用に追加する。
各モジュールを生成した後に再読取・再合成し、両側のcanonical StoryDocumentの意味を比較する。
ソース位置と元のファイル名は変換で変わるため、合成後YAMLを共通frontendで再解析して比較する。

CLIで再生用SB3を作るときは、exportしたZIPを展開し、`build-dsl4 --source <主台本>`を指定する。
主台本が`include`を宣言していれば合成され、graphの上限は必要なときだけ指定する。既存の低水準build APIはブロックSB3の直接読取にも対応する。
通常ランタイムのfeature flagの既定値や公開済み配布物は変更しない。
ロールバックは本変更のrevertと以前のCLIによる単一台本の再生成。元の分割YAMLと編集SB3は退避して保持する。

## ハットの責務と旧定義の廃止

`kamishibai [4.0] [ラベル]`は、変換ツールが収集する台本ソースの入口であり、同時に版と識別名を宣言する。
イベント受信や作品の再生開始を表さない。`when kamishibai DSL source`を前段に置く二段構成は作らない。

新しいランタイムから旧sourceハット・YAML/JSON文字列命令を削除する。
公開rc.22のような既存の埋込JavaScriptをベースに使う場合は、拡張の公開register境界でこの2定義を除去する。
同じ拡張の他の命令・状態ブロックと素材は維持する。元の配布SB3は書き換えない。
ランタイム拡張をURL参照するベースは入力として受理せず、JavaScriptを埋め込んだベースを使う。
読取側には旧ハット、旧ソース文字列、YAML/JSON reporter評価の互換経路を残さない。
旧ブロック台本を使っている場合は、元のYAMLから新ハットのSB3を再生成する。

## 「この部分を使う」オン／オフブロック

`useSection`は、内側に定義ブロックまたは場面内の命令列を接続するC字型ブロックです。
メニューで「✅ オン」「🚫 オフ」を選びます。オンは内側をその位置へ展開し、オフは実行用台本から除外します。
通常のScratchの`if`を台本へ混ぜる必要はありません。入れ子では外側のオフが優先します。

ブロック本体は専用のスレートグレーで表示します。TurboWarpの`Scratch.gui.getBlockly()` APIを
利用できるエディターでは、オフのC字内側に明るい灰色の斜線背景と破線の境界を表示し、
囲まれた定義・命令・入力ブロックも灰色にします。外側のオフは内側のオンにも適用されます。
オンへ戻すか、囲みの外へブロックを移動すると元の色へ戻ります。Undo／Redoとターゲット変更にも追従します。
この装飾はSVG表示だけに適用し、Scratchの`disabled`状態や保存される台本の実行条件を変更しません。
APIを持たないホストでも専用色と絵文字のメニューを表示し、台本のオン／オフは同じ意味で動作します。
装飾は編集用拡張へ埋め込むため、既存のSB3へ反映する場合は更新したCLIで再生成します。
見た目の切り戻しは以前のCLIでの再生成、パレットの切り戻しは`sourceSections: false`です。

生成時のパレット表示フラグ`sourceSections`は既定OFFです。読み取り場所と既定値は
`src/dsl4/structured-block-source.ts`の`dsl4BlockAuthoringDefaultFeatureFlags`です。
CLIでは次のように明示して有効化します。

```sh
turbowarp-kamishibai author-block-dsl --input story.k4.yml --base base.sb3 --output blocks.sb3 --block-sections true
```

台本の宣言列では定義を、sceneの内側では命令を囲みます。scene全体とincludeBlocksは囲めません。
最大32段の入れ子に制限します。オフでも接続・循環・JSON構文・基本型の安全な読み取りは検査し、
内部のschema制約やアセットなどの参照についての意味検査は、オンにしたときだけ行います。
物語を開始し直すと現在の切り替えが反映されます。実行中の切り替えではありません。

SB3保存では囲んだブロックと選択値をそのまま保持します。YAMLへの書き戻しでは、実行対象だけを
通常のYAMLとして出力し、復元用の編集状態を`# kamishibai-block-sections-v1:`コメントへ保持します。
同じCLIで再びSB3を生成すると、オフ部分も復元します。状態はサイズ制限付きの圧縮データであり、
実行用のschemaへ新しい項目を追加しません。YAMLだけを独立に変更して状態と食い違った場合は、
その変更を上書きせず診断します。YAML側の編集へ移る場合は、SB3を保存してから復元用コメントを
削除してください。この場合、オフ部分と囲み構造はYAMLから再生成されません。

直接再生には、このブロックの読み取りに対応するランタイムを使います。旧rc.23のベースは対応して
いません。更新したCLIでYAMLへ書き戻し、`build-dsl4`で実行用成果物を作ることもできます。
フラグをfalseへ戻すと新規生成SB3のパレットでは非表示になります。保存済みブロックの読取互換性は
維持します。実装全体の切り戻しは、この変更のrevertと、保存済み台本から書き出した有効部分の利用です。

## 物語の反復と条件分岐（4.0 RC改訂）

[Issue #980の仕様](dsl-4-narrative-control.md)で、4.0 RCのif／repeat／forEachと型付き行参照を定めます。
公開rc.43の機能ではありません。rc.44ではStandardに昇格し、通常CLI・対応runnerで有効です。低水準のグローバル既定OFFと既存4.0の意味は維持します。

### 4.0 RCの専用制御ブロック

rc.44の通常author-block-dsl／export-block-dsl／validate-dsl4で4.0 RCを扱います。実験flagは不要です。
通常の4.0台本と区別してcapabilityを有効化します。対応する編集用拡張は、2囲みの「もし〜ならば／でなければ」、
「〜回くりかえす」、「一覧を順番に、それぞれについて」と、回次／列参照・台本変数・比較・論理入力を表示します。
条件は専用reporterまたはブロックの固定JSON入力で編集します。各回の一覧は表形式で編集できます。ブロックの接続を読んでYAMLへ戻すため、
元YAMLのcacheには戻しません。標準Scratch制御ブロックの混入は引き続き対象ブロックで診断します。

構造用Schemaはschema/dsl-4-narrative-control.schema.json、通常命令は展開・参照解決後の4.0 Schemaで検証します。
条件の比較は`{compare: {left: {variable: score}, operator: '>=', right: 1}}`、論理はall／any／notです。
これらを既存Runtime Expressionへ変換し、任意JavaScriptやScratch式は実行しません。

一覧は対応GUIの既存custom mount APIで表表示し、列名・型・値の編集、行の追加・削除・上下移動ができます。
変更は下書きに留めて保存時にITEMSを1回で更新し、キャンセルでは原文を保持します。不正な数値・列の型不一致は
保存を拒否します。custom mount APIを持たないSchema専用ホストでは同じ構造の一覧フォームに戻ります。
列名を変えた場合は、対応する値参照ブロックも更新してください。

条件reporterをJSON文字列として再解釈するフォームは登録しません。集合編集では条件の構造を保持します。
4.0 RCの台詞フォームは参照解決前の`{ref: scope.column}`も受理し、一覧の集合保存で内側の型付き参照を失いません。
通常命令の最終的な型検証はfrontendの参照解決後に行います。capability OFFの台詞フォームは従来どおりです。
