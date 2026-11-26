# 物語の有限反復と条件分岐（Issue #980）

状態: 4.0.0-rc.44のStandardとしてGitHub Releaseと固定SB3を公開済み（Issue #989）。rc.43以前では使用できません。Docs／Samplesへの同版反映と公開実物の確認は同Issueへ記録します。
この文書を初期版の意味の正本とし、未実装の機能を既存の4.0作品へ自動適用しません。

## 目的と既存機能

説話の三段反復など、共通の展開を一度書き、人物・選択・結果の違いを各行で指定できるようにします。
台本は静的に読み取る構造ですが、条件は再生時に判定できます。既存のvariables、branch、gotoと
同じruntimeが所有し、Scratch制御ブロックを読み取り時に実行しません。
Actor.loopは衣装アニメーション、useSectionは編集時の採否であり、物語の反復・条件とは別です。

## 対応版と導入

新構文はDSL 4.0 RCの改訂として扱い、`kamishibai: '4.0'`を使います。4.1系列は新設しません。
仕様版ではなくsceneの命令位置のif／repeat／forEachでcapabilityを検出します。通常の4.0台本は従来の検証・IRを維持し、
任意の設定・値の中に同じ語があるだけでは制御構造と扱いません。`dsl4NarrativeControl`は起動時固定です。低水準のグローバル既定はOFFを維持し、Standard production／authoring／playbackと通常CLIはrc.44からONにします。
flag OFFの新構文は元の命令位置で`K4-NARRATIVE-FLAG-001`により拒否します。
flagの正本はsrc/dsl4/feature-flags.ts、builderの伝達はsrc/builder/dsl4-build-feature-flags.tsです。
新しい独立設定ファイルは追加しません。Issue #989ではGitHub Release・配布SB3・Pagesへ反映し、npm公開は別途保留します。

## 構文

- `if: {condition, then, else?}`: conditionはboolean、既存の条件式文字列、または型付きref。
  thenとelseは命令列で、else省略は空列です。到達時に一度だけ条件を評価し、片側を再生して合流します。
- `repeat: {times, as?, do}`: timesは0以上の整数、asは任意の回次スコープ名です。
  回次refは`{ref: '回次.index'}`（0始まり）と`{ref: '回次.number'}`（1始まり）です。
- `forEach: {as, items, do}`: itemsは記述順の固定行一覧です。各行は同じ列名・型を持ち、値はstring、
  finite number、booleanに限ります。空一覧は0回、各行の空mappingも許可します。
- `{ref: 'スコープ.列名'}`は値そのものを置き換えます。文字列内の暗黙補間はしません。
  scopeと列名はDSL ID規則に従い、最も近い字句スコープを参照します。外側の異名scopeも参照できます。
  動的なproperty traversalやScratch reporterを評価する構文ではありません。

```yaml
kamishibai: '4.0'
actors:
  Narrator: NarratorIdle
assets:
  NarratorIdle: costume:Narrator
scenes:
  三人の訪問:
    - forEach:
        as: 訪問
        items:
          - {人物: 長兄, 親切にする: false}
          - {人物: 次兄, 親切にする: false}
          - {人物: 末弟, 親切にする: true}
        do:
          - Narrator.say: {text: {ref: 訪問.人物}, seconds: 2}
          - if:
              condition: {ref: 訪問.親切にする}
              then:
                - Narrator.say: {text: 贈り物を授かりました。, seconds: 2}
              else:
                - Narrator.say: {text: 何も得られませんでした。, seconds: 2}
```

例の素材は実際の作品で実在する衣装へ解決します。rc.44以降のStandard SB3向けの構文です。
値参照の語彙は#770の本文埋込みと共通化し、初期版の固定行参照からruntime変数の自由補間へ拡張しません。

## 静的検証と上限

構造、全分岐、全行、未実行の本体も検証し、0回や空一覧を使って不正な台本を隠せません。
未知key、未知ref、型の違う行、非整数／負数の回数、入力の循環・危険なmapping keyを拒否します。
回数と行数は各1024、行の列数は32、制御構造の入れ子は16を上限とします。hostは上限を引き下げられます。
展開前に必要命令数を見積もり、既存のmaxActionsPerScene／maxTotalActions以下だけを受理します。
ifの両側と内部判定境界も上限に含めます。巨大な展開配列を確保してから検査しません。

固定反復は事前展開します。未選択側も型・参照・アセット・式を検証しますが、副作用は起こしません。
条件文字列には既存Runtime Expressionの検証と実行・上限を使います。評価器を二重実装しません。
0回の本体は検証用に一度だけ型解決し、実行IRには追加しません。空itemsで参照列の型が分からない場合は
列参照を診断し、空itemsだからと未知参照を黙認しません。

## 実行位置・履歴・中断

if条件はその構造へ到達した時だけ評価します。内側が未選択なら内側の条件も評価しません。
false側の命令はdispatchせず、動画／音声再生、入力待ちも開始しません。sceneの先読みでは既存の
保守的な依存収集を維持し、両候補の素材を事前取得する場合があります。分岐別の遅延取得は別の最適化とします。
内部の分岐境界を別sceneに見せず、既存scene順・scene末尾の暗黙遷移・scene履歴を維持します。

展開後actionは元のsource位置・ブロック・入れ子・反復回次へ対応させます。stableIdは各展開位置へ
決定的に修飾し、元のIDも診断用に保持します。現在位置はscene、元命令位置、回次、選択側を識別します。
履歴から分岐内部へ戻るときはその位置の選択側・回次を復元します。作品変数は巻き戻しません。
進め直して新たに条件境界へ到達した場合は現在の変数で再評価し、既存のfuture破棄規則へ従います。

goto、branch、入力による別scene移動は、その命令列と残りの反復を終了します。暗黙returnはありません。
stop、skip、scene移動、reloadは既存のaction scope・generation・signal・cleanupを使用します。
未選択命令のために新しいresource ownerや永続timerを作りません。

## 台本ブロック

専用ifは2囲み、repeat／forEachは1囲みを持ちます。表示名は「もし〜ならば／でなければ」、
「〜回くりかえす」、「一覧を順番に、それぞれについて」です。条件は専用reporter、一覧は型付きフォームで編集でき、
各回の値を参照する専用入力を用意します。既存のSchema editor APIと同じ登録・解除を使います。
編集情報は現在のblock graphから読むため、元YAMLのcacheへfallbackしません。
生成・読取・exportで入れ子と順序を保ち、4.0のhat versionを保持します。

標準Scratch制御の互換読取、forever、while、再帰、動的回数・動的一覧、共通エピソード呼出しは初期版に含めません。
標準制御の混入は現在の診断を維持し、ブロック日本語名・Stage/Sprite名・移動と強調表示へ接続します。

## 検証・関連文書・切戻し

Schema／frontend→runtime→block codec→surfaceの順に小粒PRで進め、各PRで対応文書を更新します。
三段反復、入れ子、空列、非選択側の不正、上限、巻き戻し、途中goto、入力cancel、reloadを受け入れfixtureにします。
公開Editor・SB3・Web Playerと同じ共通runtimeを使う統合fixtureで比較し、公開済み版へ機能があるとは扱いません。

- surface／design: 構文と既存branch／gotoの関係、実装状況。
- structured-block-script: 専用ブロック、フォーム、4.0 RC改訂の相互変換。
- expression-limits-diagnostics／feature-flag-inventory: 制限、診断、flagの正本。
- processing-architecture: 展開、source位置、履歴／reload／cleanup。
- README／移行、Docs、Samples: 同じ例、対応する公開RCとnpm未公開の区別。

切戻しはflag OFFと旧台本・旧SB3への復帰を同時に行います。新構文を使う4.0台本は対応していない旧runtimeで実行できません。
実装PRをrevertしても既存4.0作品が動くことを確認します。公開物を同じ版のまま差し替えません。

## 実装記録

静的modelは`src/dsl4/narrative-control.ts`に分離します。入力を変更せず、事前の命令数見積り、
両分岐と0回の検証用命令、型付き行参照、回次・元位置・guard情報を返します。通常命令のSchema／semantic検証と
式評価は既存frontend／runtimeへ接続する次段階の責務であり、model単独で台本を実行しません。

再生接続では、4.0の新構文を検証・展開した後、既存4.0 StoryDocument IRへ正規化し、metadataで
sourceVersion=4.0とnarrativeControl必須を記録します。IR版と台本言語版を混同しません。
frontendのnarrativeControlEnabledとruntimeの同名optionを起動時に明示する必要があります。
内部境界はdispatchせず、Structured Data iteratorのscopeを解放して次へ進みます。

ブロックの条件値はboolean／既存式文字列／refに加え、variable、compare（left/operator/right）、all／any／notの
宣言的な木を受理します。variableは宣言済み作品変数だけを参照します。比較・論理は専用reporterとして生成し、
静的読取後に既存のbounded expressionへ変換します。構造Schemaと条件・一覧フォームは同じ定義を使用します。

rc.44以降の通常CLIは追加flagなしで物語制御を受理します。`--narrative-control`は互換alias、`--no-narrative-control`は能力を無効化する検証用指定です。
公開rc.43以前のSB3は対応runnerではありません。rc.44の同じ版のベースSB3を使用し、タイトル／メニュー画像も揃えます。

## 開発surfaceの接続

開発CLIの`--narrative-control`はvalidate／author／exportに加えbuild／previewへ伝達します。
Standardを基にauthorする場合はcapability対応のauthoring bundleをコピーに組み込み、buildでは対応playback bundleを組み込みます。
通常の生成物もrc.44から対応capabilityを持つStandard bundleです。能力のないrunnerで新構文を使う4.0作品を生成しようとすると
`K4-NARRATIVE-RUNTIME-001`で拒否し、新台本だけを古い公開SB3へ移植しません。

ローカルpreviewは起動時固定の設定をHTMLから読み、frontendとruntimeの両方へ同じflagを渡します。
ブロックの検証エラーは最も深い元の命令／参照ブロックへ対応し、既存の日本語名・target表示・移動／強調表示を再利用します。
元の診断コードは`diagnosticCode`に保ち、表示用のblock source診断から案内します。

CLIの使用例、各surfaceの確認結果、対応版の制限は同Issueの運用ログへ記録します。
公開Editorの既存pinで配布SB3の互換性を確認します。npm版は保留し、GitHub Releaseと配布SB3を更新します。


## 開発時4.1形式からの移行（Issue #986）

4.1は公開系列として維持しません。frontendはflagのON／OFFによらず`K4-NARRATIVE-VERSION-001`で拒否し、
4.0宣言への変更・`--narrative-control`での検証・対応runnerの使用を案内します。ブロックの4.1 hatも元ブロックで拒否します。
旧4.0作品を一括変換する必要はありません。

1. 開発用SB3・YAMLの原本を保存します。SB3だけの場合は作成に用いた開発版ツールでYAMLを書き出します。
2. 作業コピーの`kamishibai`を`'4.0'`へ変更します。構文・条件・行順・参照は維持します。
3. この改訂に対応するCLIの`validate-dsl4 --narrative-control`で全体を検証します。
4. 対応authoring／playback runnerで別名のSB3を生成し直します。hatの文字列だけを変えて旧runnerで動くとは扱いません。

構造Schemaは`schema/dsl-4-narrative-control.schema.json`（4.0 RCのcapability用）、通常命令は展開後に
`schema/dsl-4.schema.json`で検証します。生成物名は`dsl4-narrative-{authoring,playback}-runtime-extension.js`です。
IRの`sourceVersion: '4.0'`とは独立に`narrativeControl: true`でruntime能力を要求します。

## 標準配布へ進める順序と判定

Issue #986の識別子統合は既定OFFでした。Issue #989でStandard既定ON化とrc.44配布を行います。公開前の候補と公開済み実物は区別します。

1. Appの4.0契約・生成物・CLIを揃え、旧4.0互換性、有限展開、履歴／中断、往復変換、診断位置の対象検証と必須CIを確認します。
2. DocsとSamplesの開発例を同じ契約へ揃え、通常配布rc.43では未対応である表示を維持します。
3. 公開準備の承認後、新しい4.0 RC番号を選びます。Standard profileの既定ON化に先立ち回帰結果と切戻しを記録し、
   authoring／playbackとfrontendへ同じcapabilityを伝えます。グローバル既定値を無条件に切り替えません。
4. 同じ入力・source identityからruntimeとタイトル／メニュー画像を含むベースSB3を生成し、候補のsize・SHA-256を検証して固定します。
   既存rc.43のasset・tag・メタデータは上書きしません。
5. 候補を公開Editorで読み込み、三人の訪問の6台詞、一覧の下書き／取消／保存、YAML往復、停止／再開、
   日本語ブロック名・Sprite名・エラー位置への移動と強調表示を確認します。GUI pinは必要な変更がある場合だけ更新します。
6. 承認されたRelease・SB3配布を行い、既存の依存更新経路でSamplesのSB3／Webを生成し、Docsの対応版・Schema・リンクを更新します。
   安定版3.2系と開発版4.0 RC系の最新公開版は別々に保持します。未公開mainを公開版として扱いません。
7. 公開URLから取得したSB3・メタデータ・Docs・Samples・Editor導線の版とハッシュを照合し、公開版で同じ操作を再確認して完了記録します。

npm公開は今回行いません。package公開・dist-tag、4系正式版化の判定も別です。正式安定版ビルドでは規約の全体検証を行います。
候補の検証結果を公開済みの結果と混同しません。公開後の切戻しは直前の検証済みSB3・配布導線・Samples・Docsを揃え、
新構文を残したままflagだけOFFにしません。同じ版の成果物は置換しません。


## rc.44 Standard昇格の回帰・切戻し根拠

#986で、旧4.0の意味不変、有限展開、停止・履歴、YAML往復、公開Editorの表編集・診断移動と強調、
playback／Packager Webの7項目を確認しました。今回もStandardの通常CLI・通常runtimeで同じ境界を検証し、必須CI成功後に公開します。
低水準frontend／runtimeの既定OFFは維持します。明示falseのruntime生成では能力を宣言せず、通常frontendは`narrativeControlEnabled: false`で拒否できます。
CLIの`--no-narrative-control`で入力を拒否する場合も診断位置を保持します。公開物の切戻しはrc.43の台本・SB3・Docs／Samples導線を揃えて戻し、
新構文の台本だけを残しません。凍結したrc.44の失敗を修正して同版へ上書きせず、必要なら次RCを使用します。

npmのrc.44は未公開として扱います。SB3はGitHub Releaseから取得できます。CLIが必要な場合はrc.44のタグを別checkoutへ取得し、
lockfile固定で依存を用意して`pnpm build:lib`後の`bin/turbowarp-kamishibai.mjs`を使います。npmの旧版が新しいStandard機能を備えるとは案内しません。

## 専用の無効化区間（Issue #1198、ローカル実装候補）

`invalidate: {condition: false, then: […]}`を編集時の採否の専用書式として追加します。
静的booleanだけを受け取り、falseの本体をYAMLに保持しながら意味解決・実行用命令列から除外します。
汎用ifの未選択側も意味検証する契約とは異なります。専用C型ブロックのon/offと相互変換します。
[書式・保存往復の契約](../dsl4-invalidate.md)を参照してください。既存作品へ自動適用せず、DSL 4.0系列の対応版でのみ使用します。
実行用の構造Schemaと、それから生成する編集支援Schemaを同時に更新・同期検証します。
