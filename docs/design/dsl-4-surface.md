# 紙芝居DSL 4.0 表層仕様

Copyright © 2026 Hiroya Kubo.

文書状態: Issue #260で合意した実装基準

関連Issue: [#260](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/260)、
[#264](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/264)、
[#266](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/266)、
[#267](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/267)、
[#284](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/284)、
[TM #63](https://github.com/kubohiroya/turbowarp-teachable-machine/issues/63)

機械可読な構造仕様: [`schema/dsl-4.schema.json`](../../schema/dsl-4.schema.json)

総合例:
[`test/fixtures/dsl4/valid/comprehensive.kamishibai.yaml`](../../test/fixtures/dsl4/valid/comprehensive.kamishibai.yaml)

## 1. 作者体験の最優先原則

通常の台本製作者は、TurboWarpのブロックを追加、複製、接続、修正せず、台本とアセットの
記述だけで標準的な紙芝居を完成できなければなりません。ブロック組立てを減らした分だけ台本を
明示的で読みやすくし、短さのために引数の意味を隠しません。

この原則から、表層構文には次の規則を適用します。

- 一つのactionはキーを一つだけ持つmappingとする
- 引数が一つで意味が明白なactionだけscalar短縮形を認める
- 意味の異なる複数引数には名前付きmappingを使い、位置引数listを認めない
- 同じ意味の要素の集合だけlistを使う
- 標準actionに必要な処理、DSL解釈、状態管理は機能拡張側が担当する
- Scratch Action Registryは作品固有の任意拡張用とし、標準作品には要求しない

単一引数のscalarは、`wait: 1`のように短くても意味が変わらないため採用します。一方、異なる意味の
複数値を位置listにすると、値だけから役割を判断できないため採用しません。scene短形式は通常sceneの
定型的な`actions` nestingを省き、長形式はmetadataとactionを混在させないために併用します。両形式は
検証後に同じ型付きaction引数と`SceneNode`へ正規化します。

## 2. 文書構造

台本はUTF-8で記述した単一のYAML 1.2文書です。トップレベルで使用できるキーは次だけです。
未知のキーは警告ではなくエラーにします。

| キー                  | 必須 | 役割                              |
| --------------------- | ---- | --------------------------------- |
| `kamishibai`          | 必須 | 文字列`'4.0'`                     |
| `assets`              | 任意 | 型付きアセットの宣言              |
| `actors`              | 任意 | actorと初期costumeの対応          |
| `cover`               | 任意 | 表紙の背景とBGM                   |
| `textStyles`          | 任意 | SVG Textの名前付きstyle           |
| `bubbleStyles`        | 任意 | say／thinkの名前付き吹き出しstyle |
| `bubbleClosePolicies` | 任意 | say／thinkの名前付き終了条件      |
| `variables`           | 任意 | string、number、booleanの初期値   |
| `loading`             | 任意 | 読み込み中の背景とcostume列       |
| `poseRecognition`     | 任意 | 待機中と認識成功時の音・認識設定  |
| `controls`            | 任意 | 環境別の開発・チート機能用keymap  |
| `branches`            | 任意 | 順序付き条件分岐                  |
| `presentation`        | 任意 | scene・背景・actorの遷移既定値    |
| `audio`               | 任意 | BGM遷移の既定値                   |
| `scenes`              | 必須 | 一つ以上のscene                   |

actor、style、variable、branch、action、parameterなど、DSL構文上の識別子にはUnicodeの文字、数字、
`_`、`-`を使用できます。先頭は文字または`_`とし、`.`はactor actionの区切りとして予約します。
これらの構文識別子はUnicode NFCでなければなりません。

asset IDとscene IDはScratch上の名前をそのまま保持できる、空でない文字列です。空白、`.`、`/`、
Unicodeの正規化形式、C0制御文字、DELを含められます。YAML sourceでは必要に応じてdouble-quoted scalarの
escapeを使います。parser、converter、runtimeは値をtrim、NFC変換、alias化しません。`__proto__`など
object pollutionを生じるmapping keyは、文字種とは別の安全境界として引き続き拒否します。

`bubbleStyles`と`bubbleClosePolicies`の名前は人が読むclass名として扱い、内部の空白と日本語を
使用できます。空文字、先頭・末尾の空白、改行、tab、制御文字は使用できず、Unicode NFCでなければなりません。

YAMLのduplicate key、anchor、alias、merge key、custom tag、複数文書を認めません。実装は
YAMLの構文位置を保持し、schema検証に成功するまでアセット読込などの副作用を開始しません。

表層grammarの概要は次のとおりです。各非終端の具体的なkey、型、必須性はJSON Schemaを正本とします。

```text
document     ::= mapping("kamishibai" => "4.0", "scenes" => scenes, top-level-field*)
scenes       ::= mapping(scene-id => short-scene | long-scene)+
short-scene  ::= sequence(action*)
long-scene   ::= mapping("actions" => sequence(action*), scene-metadata*)
action       ::= mapping(action-name => scalar-args | named-args)  # exactly one key
action-name  ::= global-command | actor-id "." actor-command
```

### 2.1 `scenes` mappingの順序

YAML 1.2のrepresentation modelではmappingは順序なしであり、mapping keyのserialization順を
applicationの意味に使用しないことが原則です（[YAML 1.2.2 Mapping Key Order](https://yaml.org/spec/1.2.2/#3221-mapping-key-order)）。
DSL 4.0はこの原則に対する明示的な固有規則として、
`scenes` mappingだけはsource YAMLのserialization treeに現れるpairの順序をscene順と解釈します。
最初のpairが通常実行の開始sceneになり、`goto`、`branch`、入力action等が別sceneを選ばない限り、
scene末尾では次のpairのsceneへ進みます。Source Graphを使用する場合は、合成後のcanonical sourceに
現れるpair順を同じ規則で解釈します。

この規則は一般的なYAML mapping、JSON object、またはYAMLからmaterializeされたnative objectの列挙順を
保証するものではありません。source frontendは`scenes`のYAML nodeが持つpair順、または全scene IDで
それと同値な順序を保証する中間表現から`StoryDocument.scenes`を作り、native objectのproperty列挙規則を
順序の正本にしてはいけません。scene IDは空でない任意の文字列であるため、数字だけのscene IDも例外なく
sourceのpair順を保持します。JSON Schemaは`scenes`のshapeと件数を検証しますが、この順序セマンティクスは
表現できないため、本節を正本とします。

DSL 4.0対応のparser、converter、formatter、serializer、editorは、scene keyのアルファベット順、数値順、
その他の順序への並べ替えを行ってはいけません。scene keyを並べ替えるとschema-validなまま台本の実行意味が
変わります。parse、serialize、parseのround tripでもpair順と`StoryDocument.scenes`の順序を維持します。

## 3. アセット

### 3.1 短形式

既にSB3へ埋め込まれたアセットは短形式で参照できます。

```yaml
assets:
  Beach: backdrop
  HeroIdle: costume:Hero
  OpeningSound: sound
```

### 3.2 名前付き形式

名前付き形式は`kind`に加え、既存の埋め込み名を示す`name`、project root基準のローカル相対pathを示す
`file`、または検証情報付きの`source`のいずれか一つを持ちます。`name`と`file`は
`delivery: embedded`、`source`は明示的な`delivery: remote`で使用します。

```yaml
assets:
  Ocean:
    kind: backdrop
    file: ocean.svg
    loading: lazy
    retention: story
  HeroHappy:
    kind: costume
    target: Hero
    name: happy
  OpeningSound:
    kind: sound
    name: OpeningSound
    loading: lazy
    retention: story
  救助Pose:
    kind: recognitionModel
    file: rescue-pose
    loading: lazy
    retention: scene
  RemoteOcean:
    kind: backdrop
    delivery: remote
    loading: lazy
    retention: story
    source:
      url: https://cdn.example.com/ocean.webp
      integrity: sha256-abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789
      contentType: image/webp
      size: 654321
  LivePose:
    kind: recognitionModel
    delivery: remote
    loading: lazy
    retention: scene
    source:
      url: https://teachablemachine.withgoogle.com/models/example/
```

`kind`は`backdrop`、`costume`、`sound`、`poseModel`のいずれかです。`costume`は`target`を
必須とします。`file`に絶対path、`.`または`..` path segment、HTTP(S)を含むURIなどの外部URIを
指定できません。`delivery`の省略時と短形式は`embedded`です。builderは`embedded`の参照byte列を
成果物へ埋め込み、ネットワークなしで動作するself-containedなSB3を生成します。

`delivery: remote`はSB3の初期download量を減らす必要がある作品だけが使用するopt-inです。
`source.url`はhostnameを持つ絶対HTTPS URLだけを認め、credentialとfragmentを禁止します。poseModelは
TM 3.2と同じdirectory URLを`url`だけで指定できます。この通常モードは取得時点のmodel内容を正本とし、
`model.json`、`metadata.json`、model manifestが宣言するweights fileをlazy取得します。

内容を固定する場合はmodel directoryをlocalへ取得して`file`で指定し、SB3へembedded化します。remoteの
ままbyte列を検証する場合は、期待するbyte列を固定する`integrity`、MIME typeを固定する`contentType`、
上限検査に使う`size`を三つとも指定します。`integrity`は`sha256-`に続けて64桁の小文字16進SHA-256を
記述します。三項目の一部だけの指定、poseModel以外での検証情報省略、HTTP、`name`または`file`との
併記はschema errorです。

### 3.3 読み込みとメモリ保持方針

アセットには、互いに独立した三つの方針があります。

| field       | 値                    | 管理するもの                                      |
| ----------- | --------------------- | ------------------------------------------------- |
| `delivery`  | `embedded` / `remote` | 正本となるbyte列をどこから供給するか              |
| `loading`   | `eager` / `lazy`      | いつ実行可能なresourceへmaterializeするか         |
| `retention` | `scene` / `story`     | materialize済みresourceをメモリ上でいつまで保つか |

`backdrop`、`costume`、`image`、`sound`、`recognitionModel`の名前付き形式には`loading`と`retention`を指定できます。
`loading`の省略時と短形式は`eager`です。`retention`の既定値は`recognitionModel`が`scene`、それ以外が
`story`です。未知の値はschema errorとします。モデル数に比例してPoseNet／TensorFlow resourceが
蓄積しないよう、`recognitionModel`には`retention: scene`を推奨します。

`eager`なremote assetはentry sceneへ入る前に準備します。`lazy`はembedded byte列のdecode、登録、
モデル初期化、またはremote byte列の取得と検証を遅延させます。controllerが次の遷移先sceneを
決定した時点で、そのsceneから直接必要になる未準備のlazy assetを先読みします。scene開始時に準備が
終わっていなければLoading表示で待ちます。`actors`の初期costume、`cover`、`loading`から参照される
assetは起動時に必要となるため、`lazy`でもentry sceneより前に準備します。準備済みassetは紙芝居停止まで
保持するとは限りません。`retention: story`は停止、再起動、session disposeまで保持し、
`retention: scene`はcurrent sceneまたは実際に選択されたnext sceneが必要とする間だけ保持します。

`loading: eager`と`retention: scene`も組み合わせられます。起動時に準備し、最初のsceneが必要としない
素材はそのsceneのcommitで解放します。後のsceneで再び必要になれば再準備します。起動時の準備を省略したり、
`eager`を理由に停止まで保持したりしません。

起動時は`loading`から参照されるassetだけを先にmaterializeし、その間は汎用indeterminate indicatorを
Scratch stage領域の中央・最前面に表示します。準備後は指定backdropを全面表示し、`costumes`を宣言順に
循環表示しながら残りのstartup assetを準備します。scene間のlazy loadingにも同じLoading宣言を使い、
設定がない場合は汎用indicatorへfallbackします。indicatorは`circular`／`bar`をapp-shell APIで選択できます。

scene遷移は二段階でcommitします。controllerは遷移先を一つに確定してから、そのsceneが必要とするlazy
assetだけを先読みします。準備に失敗した場合はcurrent sceneとそのresourceを維持し、遷移をcommitしません。
準備に成功した場合はcurrent／nextのdependencyを比較し、nextでも必要なresourceは再登録せず、
`retention: scene`でnextが必要としないresourceだけをcommit時に解放します。シナリオから解放済みsceneへ
再び到達する場合は永続cacheまたはembedded sourceから再materializeします。recognitionModelは先読み中にcurrentとselected
nextの最大二つが一時共存し得ますが、訪問済みmodelをすべて保持しません。

下位lifecycleも解放に失敗した実resource handleを保持し、再取得時はそのhandleの解放を済ませてから
新しいresourceを生成します。停止時の解放に失敗した場合、次の起動はcleanupを再試行してから準備に進みます。
連続した起動要求は要求受付時のcleanupまでを待ち、後の取消しが追加した自分自身の待機を取り込みません。
中断済みprepareの完了前に同じ素材を再取得した場合も、待機後に解放待ちhandleを再確認します。
旧cleanupが失敗している間は新しいresourceを生成せず、再取得の失敗を返して解放待ちhandleを保持します。

### 3.4 runtime境界と失敗

builderはremote assetのURLと、指定されていれば検証情報だけをasset bundle manifestへ格納し、byte列を
SB3へ格納しません。
controller coreは`fetch`、filesystem、VMへ直接依存せず、既存のasset preload coordinatorを通して
asset lifecycleを呼びます。通常のembedded lifecycleではremote取得を拒否し、hostが
`createDsl4RemoteAssetLifecycle`へ`loadRemoteAsset`を明示的に注入した場合だけremote modeを有効に
できます。

loaderは宣言されたURL、指定されていれば期待値、および`AbortSignal`を受け取り、byte列と実際の
Content-Typeを返します。
hostは接続先hostのallowlist、timeout、redirect数、stream受信中の最大byte数を制限します。lifecycleは
verified remoteではloaderの返却後、`size`、`contentType`、`integrity`をすべて再検証してからplatform
adapterへ登録します。
URL credentialはsource frontendで拒否するため、認証情報を作品へ埋め込む用途には使用できません。
検証情報付きremote `poseModel`のURLは一つのarchiveを指します。host loaderは検証対象となるarchive
byte列に加え、実際のContent-Typeを返します。lifecycleがarchiveのsize・Content-Type・SHA-256を検証した後、trusted
extractorが`model.json`、`metadata.json`、weights fileを展開します。path traversal、duplicate entry、
file数、圧縮前後と展開後の合計byte数へ上限を適用し、各fileをarchive integrityとextractor format versionへ
bindingしてからTM adapterへ登録します。loaderが別経路で渡した未検証の展開fileは受理しません。
通常の裸URL poseModelはarchiveを要求せず、同じdirectory配下の三fileをhost loader経由で取得します。
この経路は内容同一性を主張しないため、verified remote cacheへ保存しません。

materialize済みresourceは`retention`に従ってadapterからasset単位でreleaseし、停止・再起動・dispose時は
retentionにかかわらず全件releaseします。
navigationで同じassetの準備を中断した場合、古い処理がsettleしてstale resourceを解放するまで再準備を
開始しないため、同一assetを同時に二重登録しません。準備中は`assets.startup.start`、
`assets.preload.start`、`assets.loading.show`／`assets.loading.hide` eventを発行します。準備失敗時は
対象assetのStoryPathと検証種別ごとの診断codeを表示し、遷移先sceneのactionを一つも実行しません。
offlineへ切り戻す場合は`delivery: embedded`とローカル`file`へ戻します。

### 3.5 IndexedDB永続cache

IndexedDBへ保存した検証済みbyte列の寿命は`retention`とは別に管理します。memory resourceをreleaseしても
永続cacheは削除せず、cacheをclearしても既にmaterialize済みのresourceは直ちに無効化しません。cacheは
最終利用からのTTL、LRU、byte budget、format versionによりboundedに掃除し、保存失敗時は機械可読warningを
返します。verified remote assetはvalid cache hitならnetworkを呼ばず、missまたは不正recordの場合だけ取得と
再検証を行います。
裸URL recognitionModelはsession内のmaterialize済みresourceだけを再利用し、解放後の再materializeではURLから
現在のmodelを取得します。

DSL 4.0は台本をまたいでcacheを共有しません。builderは初回にstable story IDと台本ファイルのbasenameから
次のようなdatabase名を生成し、story manifestへ保存します。

```text
tw-kamishibai-assets-v1--<台本basename由来slug>--<stable-story-id>
```

`project.source.yml`（`.yaml`／`.json`も可）ではstable IDを`cacheId`、生成済みdatabase名を`cacheDatabaseName`として保持します。
正常な初回buildが両fieldをatomicに追記し、生成SB3のsource descriptorにも`cacheIdentity`として埋め込みます。
runtime hostは埋め込みidentityを正本として使用し、異なるidentityの外部注入を拒否します。

可読部分にはUnicodeの文字と数字を残し、pathは保存しません。同名台本はstable IDで分離し、台本名を変更しても
manifestに保存済みのdatabase名を継続利用します。database内のidentity metadataとapp shellの管理画面には、
台本表示名、database名、使用量、entry数、最終cleanupを表示し、台本単位でstats、prune、clearを実行できます。
これらを標準作者paletteのblockとしては公開しません。

台本別databaseの一覧とorigin全体の容量管理には、小さな共通catalog database
`tw-kamishibai-cache-catalog-v1`を使用します。catalogが保持するのはdatabase名、stable story ID、表示名、
論理byte数、entry数、最終利用時刻だけで、binary dataやasset keyを保持せず、
台本間のasset参照やdeduplicationには使用しません。各runtime instanceは短期leaseをrenewし、story stop／dispose時に
releaseします。app shellはAsset Managerの`renewVerifiedRemoteStoryCacheLease`をheartbeatとして呼び、停止処理で
`releaseVerifiedRemoteStoryCacheLease`を呼びます。origin全体がhigh-waterを超える場合は、実行中の全tabのleaseを
pinしたまま、最終利用時刻が古い別台本のdatabaseから削除してlow-waterへ戻します。crash等でreleaseされなかった
leaseは期限切れ後に掃除します。TTLを超えて開かれていない台本databaseは、binaryを読み込むことなくcatalogから
列挙してdatabaseごと削除できます。lease取得とcatalog更新は一つのtransactionで行い、database deleteは先に
排他的なdeletion markerを取得します。明示deleteはcurrent runtimeのleaseを自動解除せず、story stop／disposeと
lease releaseの完了後だけ実行します。

TurboWarp runtime hostは作品実行中だけ既定30秒間隔でleaseをrenewし、終了、停止、disposeでheartbeatを解除して
leaseをreleaseします。hostの非palette APIはcurrent storyのstats／prune／clearとcatalogのlist／prune／deleteを
公開し、app shell管理画面はこのAPIを使用します。

他のactive台本が使用しているbytesはcurrent台本の実効cache上限から差し引きます。active leaseをpinした結果、
新しいassetをorigin全体のhigh-water内へ格納できない場合は、検証済みbytesをmemory上で使用してIndexedDBへの
書き込みを省略し、`ASSET_CACHE_ORIGIN_BUDGET_PINNED` warningを返します。

app shellはcatalogを使って全台本cacheを一覧表示します。`clear`は現在のdatabaseとidentityを残してentryだけを
削除し、「作品のcacheを削除」はdatabaseとcatalog recordを削除します。stats、TTL、LRU、clearの保守走査では
keyと軽量metadataだけを読み、保存済み`ArrayBuffer`を容量計算のためにmaterializeしません。catalogが利用不能でも
現在台本の検証済みcache／memory実行を中止せず、機械可読warningを返します。story DBのwrite／delete／clearは
単調増加するstats revisionを更新し、catalogは別tabから遅れて到着した古いentry／byte数を採用しません。

runtimeが扱う寿命は次の四段階です。

1. SB3 ZIPまたはremote loaderが供給するsource bytes
2. 台本単位のIndexedDBに保存する検証済みbytes
3. 登録処理中だけ使用する一時`ArrayBuffer`／`File`
4. renderer、audio、TM／PoseNetが所有するmaterialized resource

source bytesと一時objectはtransactionまたは登録完了後にapplicationからの参照を破棄してGC対象にします。
物理メモリから即時消去されることは保証しません。2はstorage policy、4は`retention`で解放します。この契約の
実ブラウザ検証には`test/fixtures/dsl4/browser/remote-cache-retention.html`を使います。repository rootを
HTTPで配信してfixtureを開くと、12回のposeModel再materializeで同時保持数が1、解放後が0、IndexedDBが
1 entry／archive byte数のまま増えないこと、および明示cleanup後に0 entry／0 bytesとなることを表示します。
runtime／schema接続はIssue #284で実装済みです。TM 1.10.0の`releasePoseModel()`／`releaseAll()`は
classifierとPoseNet双方のdispose完了を待ちます。

self-contained 4.0 SB3の新規`binary-entry`形式は`dsl4RootBinaryEntryPackaging`による明示opt-inです。
descriptor format version 3はSB3 rootの`k4asset-v1-<sha256-hex>`だけを参照します。runtime startupへ渡すproviderは
`releaseAfterLastAsset: false`で作成し、全assetのtransaction commit後にproduct backingが一度だけreleaseします。
embedded assetは30日TTLのremote cacheへ保存せず、起動ごとのsession identityで分離したsession backingまたは
個別entryを取得できるdirect sourceから再materializeします。session backing確立後の欠落／破損ではSB3から再抽出せず
安全停止します。editorは同一descriptor／integrityの一時entry集合を再構築し、保存後は`releaseEntries()`で参照を
破棄します。source integrity errorではpolicyにかかわらずfallbackしません。
互換用Base64形式とDSL 3.2は変更せず、flag OFFまたは`assetBundleFormat`省略時は従来どおりBase64 loaderを使用します。
旧nested format version 2は読み取り互換だけを維持し、root形式へ暗黙変換しません。詳細は
[root binary／Packager契約](./dsl-4-root-binary-packager-contract.md)を参照してください。

real Chromiumのpose memory fixtureは24回のscene再訪で最大20 logical tensors／196,608 bytes、解放後0、
classifier／PoseNet dispose各24回を確認します。JavaScript heapのfixture上限はpeak増加32 MiB、CDP強制GC後は
baseline + 8 MiBです。WebGL／WASM allocatorが解放済み領域をpoolへ残すことは許容し、process memoryの即時縮小は
合格条件にしません。

## 4. 共通設定

表紙、認識音、SVG Textは、各値の意味が名前から分かるmappingで記述します。

```yaml
cover:
  backdrop: Beach
  bgm: OpeningSound

recognition:
  idleSound: ClockTicking
  chargeSound: Success
  modelInitialization:
    policy: latest-needed
    parallel: true
  sequence:
    confidenceThreshold: 0.5
    fullConfidenceHoldSeconds: 1
    idleChargePerSecond: 0
  selection:
    accumulationPerSecond: 1
    decayPerSecond: 0.9
    scoreThreshold: 0
  feedback:
    mode: scratchMirror
  navigation:
    allowSkip: false
  preview:
    mirroring: mirrored

textStyles:
  title:
    background: '#112233'
    color: '#ffffff'
    font: Noto Sans JP
    size: 150
    align: center

bubbleStyles:
  Typing base:
    characterIntervalSeconds: 0.05
    noSoundCharacters: '「」'
  日本語 効果音:
    characterSound: Typewriter
    restCharacters: '、。…'
    restCharacterIntervalSeconds: 0.5
    continueIndicator:
      frames: [Next1, Next2]
      frameIntervalSeconds: 0.12
  Hero style:
    styles:
      - Typing base
      - 日本語 効果音
    textStyle: title
    placement: FOOTER_LIKE
    visualStyle: NARRATION
  Native reveal:
    textStyle: title
    maxWidth: 320
    textLocale: ja
    portrait:
      base: HeroFace
      blink: {frames: [EyesOpen, EyesClosed], frameIntervalSeconds: 0.4}
      lipSync: {frames: [MouthClosed, MouthOpen], frameIntervalSeconds: 0.08}
      placement: top-left
      offset: [-4, 6, 120]
      cornerRadius: 12
    continueIndicator: {frames: [Next1, Next2], frameIntervalSeconds: 0.12}
    reveal:
      unit: CHARACTER
      layout: RESERVED
      intervalSeconds: 0.05
      sound: Typewriter
    audio: {voice: HeroVoice, finish: ContinueSound}
    showAnimation: {name: fadeIn, durationSeconds: 0.2, ease: easeOut}
    visibleAnimations:
      - {name: shake, direction: right, count: 2, ease: easeInOut}
      - {name: animateBubbleShape, visualStyle: YELLING, speed: 1.5, durationSeconds: 0.3}
    hideAnimation: {name: floatOut, durationSeconds: 0.15, direction: down}

bubbleClosePolicies:
  three seconds:
    seconds: 3
  user advance:
    waitFor: advance
  advance or timeout:
    seconds: 10
    waitFor: advance
```

`poseRecognition.idleSound`と`chargeSound`はそれぞれ任意です。両方を省略した無音、`idleSound`だけの
3.2互換設定、両方を指定した設定を受理します。音を指定しなくても`sequence`、`selection`、`feedback`、
`navigation`、`preview`は独立して設定できます。

### 4.1 Poseモデル初期化

`poseRecognition.modelInitialization`は、scene遷移で不要になったPoseモデルの初期化を止め、直近で
必要なモデルだけを準備する方法を指定します。

| DSL 4.0                                     | TM 1.10 Composition                          | 既定値   |
| ------------------------------------------- | -------------------------------------------- | -------- |
| `modelInitialization.policy: legacy`        | `modelInitializationPolicy: 'legacy'`        | `legacy` |
| `modelInitialization.policy: latest-needed` | `modelInitializationPolicy: 'latest-needed'` |          |
| `modelInitialization.parallel`              | `parallelModelInitialization`                | `false`  |

`modelInitialization.parallel`はbooleanで、`true`または`false`を指定します。

`latest-needed`では重い初期化を実行中1件、最新待機1件までに制限します。Aを初期化中にB、Cの順で要求が
変わった場合、Bは開始せず、Aを安全境界でcancelしてCだけを開始します。poseを使わないsceneへskipした場合は
待機要求を破棄し、新しい初期化を開始しません。cancel済みmodelはregistryへ公開せず、遅れて完了した
classifier、PoseNet、descriptor byte列はexactly onceで解放します。

カメラの`getUserMedia()`／`video.play()`と、記述子探索・Base64復号・fileごとのSHA検証・classifier loadは
並行できます。複数PoseNet fileのSHA検証も並行し、検証済みbyte列が揃うまでTensorFlow／PoseNetへ渡しません。
最初の推論だけが「カメラ準備完了」と「使用するモデルのregistry登録完了」の両方を待ちます。モデル初期化の
cancelだけでカメラは停止しません。

既定の`legacy`／`parallel: false`は従来動作を維持する安全なrollbackです。Web CryptoやTensorFlow.jsが
すでに開始した処理を物理的に中断できない場合でも、後続phaseを開始せず、完了した一時resourceを解放します。
この実行契約にはTM 1.10.0以降が必要です。npm公開前はSchemaとhost接続だけを先行でき、配布runtimeの
TM pinは1.10.0公開後に更新します。

`cover`は物語終了時に実行されます。runtimeは全story actorを隠してbackdropとBGMを適用し、続けて
3.2互換の`showCover`、`showMenu`通知を発行します。台本埋め込み版のタイトル終了は物語開始へ、
非埋め込み版は`showMenu`へ遷移します。言語の初期値はブラウザ言語から毎回決定し、localStorage保存を
互換要件にはしません。

### 4.2 control profile

```yaml
controls:
  keymaps:
    production:
      Space: rehearsal.skipPose
    rehearsal:
      Space: rehearsal.skipPose
      ArrowRight: rehearsal.skipAction
      ArrowDown: rehearsal.skipScene
```

`rehearsal.skipPose`はactive pose stepだけを完了し、同じpose actionの次stepへ進みます。
`rehearsal.skipAction`はactive actionを3.2と同じ最終状態へ完了し、次actionへ進みます。pose中に受理した場合は
pose action全体を終了します。`rehearsal.skipScene`はactive actionを完了した後、現在sceneの残りから`bgm`と
`transition`だけを最終状態で適用し、stage、actor、wait、input等を実行せず次sceneへ進みます。既存BGMは停止せず、
activeな`sound`だけを停止します。三commandは最初に受理した入力のcleanupと境界到達が完了するまで後続入力を受理しません。

これらは`history.nextScene`と異なり実行履歴を移動しません。選択するprofile名に特別な意味はなく、たとえば
`controls.keymaps.production`へ三commandを明示すれば本番buildでも有効です。keymapに記述しなければ無効です。

`variables`の初期値はstring、number、booleanだけです。object、array、nullは認めません。

`bubbleStyles`は`Actor.say`／`Actor.think`の文字送りpresentationを、再利用可能な部分styleとして
宣言します。各styleは単独で完結している必要はありません。`styles`から参照した全styleとaction内指定を
合成したeffective styleに対して、`characterSound`には`characterIntervalSeconds`が必要、などの相互依存を
検証します。本文、終了条件、吹き出し開始時の音声は表示styleではないため、`text`、`seconds`、
`waitFor`、`startSound`を`bubbleStyles`へ含めません。

`bubbleClosePolicies`は、吹き出しを閉じてspeech actionを完了する条件だけを名前付きで再利用します。各policyは
`seconds`、`waitFor: advance`、または両方を持ちます。両方なら入力とtimeoutのうち先に成立した方を使います。
policyの継承・合成は行わず、actionは`closePolicy`で1件だけ参照します。`closePolicy`とaction内の`seconds`／
`waitFor`は排他的です。runtime controllerはActor portへ渡す前にpolicyを既存の`{seconds, waitFor}`へ展開し、
platform adapterやTurboWarp Bubbleのblock registryはDSLのpolicy registryを参照しません。

registryはparse済みStoryDocumentの世代に属します。live reload中のspeechは開始時に解決した値を使い続け、
更新後のpolicyは次に開始するstory generationから適用します。skip、stop、scene遷移、live reloadによるcancelと
terminal cleanupはinlineの`seconds`／`waitFor`と同じです。

style定義自身の`styles`配列から既存styleを参照し、名前付き合成styleを定義できます。参照先を配列順に
合成した後、その定義自身に記述したpropertyを適用します。名前付き合成は再帰的に使用できますが、直接・
間接を問わず循環参照は`K4-BUBBLE-STYLE-CYCLE-001`で拒否します。参照先が存在しない場合と同じstyleの
重複指定もエラーです。

`continueIndicator.frames`は2件以上のtarget-independent `image` asset ID、
`frameIntervalSeconds`は正の秒数です。同じframe IDを複数回指定して表示時間を調整できます。
actionが参照するeffective styleに含まれる全frameを、sceneのasset依存としてprepareします。

Bubble Compositionでは
`textStyle`は本文レイヤーの`textStyles` IDで、省略時は`default`です。`placement`、`distance`、
`tailLength`、`offset`、`visualStyle`、`portrait`、`continueIndicator`で吹き出しsurfaceを構成し、
`characterIntervalSeconds`、`characterSound`、`noSoundCharacters`、`restCharacters`、
`restCharacterIntervalSeconds`で文字送りを指定できます。本文、完了条件、吹き出し開始時の音声は
セリフごとに異なるため、`text`、`seconds`、`waitFor`、`startSound`をstyleへ含めません。

SVG Text 0.4では`textStyles`は文字レイヤーだけを担当し、吹き出しの方向は持ちません。3.2の
`svgTextStyle`に含まれる`DIRECTION`は、converterがそのstyleを使うsay／think用`bubbleStyles`の
`placement`へ移します。DSL4を直接記述する場合も、吹き出し位置は`bubbleStyles.placement`で指定します。

Bubble 0.4のcoreはホスト非依存の`BubbleTextCapability`を使用し、TurboWarp Runtime HostがSVG Text 0.4の
compositionを公式adapterで接続します。`maxWidth`と`textLocale`を指定すると、このcapabilityの
`measureText`を使ってlocale-awareな自動改行を行います。`portrait.lipSync`は発話中だけ表示する口パクframe、
`continueIndicator`は入力待機中だけ表示するframeです。旧`portrait.talk`と`advanceIndicator`は
0.2 APIとの名称不一致を残さないため受理しません。

`portrait`の配置はBubble Composition APIと同じ`placement`、`offset`、`cornerRadius`で指定します。
`placement`は`left`、`right`、`top-left`、`top-right`、`bottom-left`、`bottom-right`のいずれかで、
省略時は`left`です。`offset`は吹き出し本体の`offset`と同じ`[x, y]`または`[x, y, zoom]`で、zoomは0より
大きい百分率、省略時は`[0, 0, 100]`です。`cornerRadius`は0以上の角丸半径で、省略時は`0`です。
DSL runtimeはこれらの値を変換せずBubbleへ渡し、省略した項目はBubbleの既定値を使います。

Bubble native presentationでは`reveal.unit`に`CHARACTER`、`WORD`、`LINE`、`BLOCK`を指定できます。
`WORD`は既定でspace、tab、CR、LFを区切りにし、`delimiters`で置換できます。`layout: DYNAMIC`は
表示済み本文に合わせてlayoutし、`RESERVED`は全文の領域を先に確保します。`intervalSeconds: 0`は
自動送りを止め、`waitFor: advance`の入力1回につき1 unitを表示します。正の値では時間で進み、表示途中の
advance入力は残り全文を表示し、次の入力でspeechを完了します。

`audio.voice`、`audio.reveal`、`audio.finish`と`reveal.sound`はsound asset IDです。
`reveal.sound`がある場合は`audio.reveal`より優先します。`audio.voice`とactionの`startSound`は
二重再生を避けるため併用できません。`showAnimation`／`hideAnimation`は
`fadeIn`／`fadeOut`、`floatIn`／`floatOut`、`zoomIn`／`zoomOut`、`riseUp`、`sink`、`shake`、
`explode`、`animateBubbleShape`とeasing・duration等をBubble surfaceへ渡します。`visibleAnimations`は
吹き出し表示後に`handle.animate()`へ配列順で渡し、表示中のshake、explode、外形変形を実行します。
native `reveal`と旧`characterIntervalSeconds`系を同じeffective styleへ混在させると意味が二重になるため
`K4-SPEECH-STYLE-002`で拒否します。

`sequence`は`Actor.pose.steps`を順番に成立させる対象pose専用チャージです。
`fullConfidenceHoldSeconds: 1`はconfidence 1.0で完了まで1秒、0.5なら約2秒を意味します。
`selection`は`poseInputToChangeScene`または`imageInputToChangeScene`が候補から1件を選ぶ時間減衰付き蓄積スコアであり、
`sequence`のチャージとは状態を共有しません。省略した数値には上の例の値を既定値として使います。

sequenceの進捗は、対象poseのconfidenceが`confidenceThreshold`以上なら
`confidence / fullConfidenceHoldSeconds × elapsedSeconds`、未満なら
`idleChargePerSecond × elapsedSeconds`を加え、1以上で成立します。selectionは各poseについて
`previous × decayPerSecond^elapsedSeconds + confidence × accumulationPerSecond × elapsedSeconds`
を計算し、最大scoreが`scoreThreshold`以上になったposeを1件だけ選びます。

二つの認識modeは排他です。`Actor.pose`のsequenceを優先し、sequence開始時に実行中の
selection待機があればcancelします。sequence中に開始されたselection待機は購読せず、sequence
終了後にだけ開始します。この間のselection eventでscene遷移してはいけません。

selectionの有効期限は`poseInputToChangeScene`または`imageInputToChangeScene`の1回のaction実行です。開始時に以前のselection
待機を解除し、selection用の蓄積scoreを0へresetしてから購読します。同じruntimeでselectionを
重ねた場合は直近の1回だけを残し、以前の待機を自動cancelします。候補決定、scene移動、巻き戻し、
停止、live reload、`Actor.pose`開始、runtime解放で失効し、同じsceneへ再入場した場合も新しい
selectionとしてscore 0から開始します。selectionのresetでsequenceのstep進捗は変更しません。

`feedback.mode`は`Actor.pose.steps`のsequence進捗をどこへ投影するかを選びます。

- `scratchMirror`: JavaScriptを正本とし、0〜100の認識度／進捗をScratch変数へ一方向投影する
- `scratchBinding`: Scratch側の有限な0〜100の変更を定義済みtick境界で取り込む
- `presenter`: Scratch変数を使わず、app shellの専用presenterへsemantic stateを通知する

`presenter`はapp shellが所有するDOM rendererです。対象actor／pose／stepを文字で示し、認識度と
チャージを別々のnative `progress`と数値で表示します。領域にはaccessible nameを付け、状態変化を
`role="status"`のpolite live regionでも通知するため、色だけには依存しません。文言のlocaleは
台本ではなくapp shellの起動時optionで与えます。Scratch variable、monitor、palette blockは作成・参照しません。
visualなprogressと数値は各tickで更新しますが、live regionはphase、actor、pose、stepのいずれかが変化した
場合だけ更新します。同じphaseの連続tickを読み上げqueueへ追加しません。

`waiting`／`charging`の間だけ表示し、`completed`／`cancelled`では値を0へ戻して領域を隠します。terminal
状態自体はlive regionへ通知してから保持し、次のactive eventで更新します。scene移動、skip、abort、stop、
live reload、runtime disposeはpose actionの最終`cancelled`を同じrendererへ通し、host disposeではDOMと
live regionを解放します。追加の開発者observerはpresenterと独立して通知し、一方の例外やrejectで他方または
pose実行を停止しません。

Scratch方式はStageの非cloud scalar変数「ポーズ認識」「チャージ」を使い、0〜1のsemantic
stateを0〜100へ投影します。`scratchMirror`はScratch側の書換えを読みません。
`scratchBinding`は各pose計算tickの開始時に1回だけ両変数をatomicにsampleし、そのtickの
confidence積分前に反映します。Scratch VMがnumeric inputをstringで保持する場合に限り、十進数と
等価なstringも数値化します。空文字、非数文字列、NaN、Infinity、0〜100範囲外、hex等は
pair全体を取り込まず、直前のJavaScript投影値へ戻します。同tick内に同じ変数へ複数回書かれた場合は、
Scratch runtimeの決定済み実行順による最終値をtick境界でsampleします。variable setterのwrapやwrite回数の
追跡は行わないため、通常のScratch last-write-wins semanticsを変更しません。completed／cancelledの
terminal eventではbindingを無効にして両変数を直ちに0へ戻し、platform sessionのdisposeでも0 resetします。
platformは0〜100の既存Stage variable slider monitorをvariable IDで一意に解決します。両monitorは
adapter startupで両変数を0、両monitorを非表示へ初期化し、waiting／chargingのactive期間だけ表示します。
completed／cancelledは非同期sound cleanupより先に0／非表示へ戻し、disposeでも同じcleanupを行います。

presenterはplatform renderer、TurboWarp runtime hostの明示的な`poseFeedbackPresenter` option、および
4つのdelivery surfaceで共有する`createDsl4StandardAppShell`から接続します。Standard shellは
`dsl4AppShell`が有効なときだけruntime hostを所有し、`dsl4PoseFeedbackModes=true`かつ台本が
`feedback.mode: presenter`の場合だけcontainerを遅延生成して同じrendererへ渡します。

| surface              | source channel | Standard接続         | ownership                                                  |
| -------------------- | -------------- | -------------------- | ---------------------------------------------------------- |
| Web player           | bundled        | `webPlayer`          | production shellがsessionごとの固定DOM領域を所有する       |
| 通常TurboWarp editor | unbundled      | `regularEditor`      | editor shellがsessionごとの固定DOM領域を所有する           |
| Packager             | bundled        | `packager`           | package済みproduction shellが同じconsumerを使用する        |
| development preview  | unbundled      | `developmentPreview` | preview shellが新sessionのDOMを所有し、dispose時に破棄する |

surface固有の暗黙modeは設けません。flag OFF、別のfeedback mode、DSL 3.1／3.2ではpresenter optionの
container／localeを検査せず、DOMを生成しません。shell disposeはruntime hostを先に停止・解放し、その後に
所有DOMを除去します。

省略時は`scratchMirror`です。runtime内部のsemantic eventは`phase`、`target`、`pose`、`stepIndex`、
0〜1の`confidence`／`progress`だけを持ち、Scratch variable ID、DOM、TurboWarp monitorを持ちません。
開始時、各計算tick、完了、cancelで通知し、scene移動、停止、live reload、disposeでは最終`cancelled`を
通知して一時状態を残しません。

`navigation.allowSkip`はfeedback方式と独立し、省略時は`false`です。`false`ではpose待機中の
`navigation.nextAction`で成立を迂回せず、`true`では現在の`waitForPose`だけをcancelし、cleanup後に同じ
`Actor.pose` actionの次stepへ進みます。skipしたstepの成立soundは再生せず、最終stepのskipはactionを
正常完了して次actionへ進みます。step skipでは`action.cancel`を発火しません。
`false`で拒否されたkeymap入力はDOM eventを消費せず、`setSkin`やstep soundなどpose待機外の処理は
従来どおりnavigation可能です。policy有効時の受理commandは同じ同期dispatch境界で処理し、historyと
`navigation.nextAction`の混在連打でも到着順を変更しません。
停止、close、runtime dispose等のlifecycle操作はどちらでも妨げません。初版のstate eventとconsumerは
`dsl4PoseFeedbackModes`のprogrammatic既定値はOFFのまま維持します。配布Standard 4.0 runtimeはこのflagを
明示的にONにし、起動時にconsumerとmonitor境界を検証・初期化します。OFFの独自compositionでは
sound-only動作を維持します。

`preview.mirroring`はcamera preview canvasのstory既定で、`mirrored | unmirrored`の二値です。
省略時は`mirrored`として従来の表示を維持します。scene固有の上書きは長形式sceneの
`posePreview.mirroring`に記述します。runtimeはsceneへ入場するたびにeffective値を
`scene.posePreview.mirroring ?? poseRecognition.preview.mirroring`として適用するため、上書きのない
sceneへ移ると必ずstory既定へ戻り、前sceneの値をstickyにしません。

この値が変更するのはpreview canvasの表示transformだけです。recognitionへ渡すframeの
`flipHorizontal`、pose confidence、sequence／selectionの計算と成立時刻は変更しません。実行時接続は
`@kubohiroya/turbowarp-teachable-machine/composition`の`setPreviewMirroring`だけを使い、Standalone block opcodeや
paletteを呼びません。起動時固定・既定OFFの`dsl4PosePreviewMirroring`がOFFなら新methodを検査・呼出し
せず、現行のmirrored表示を維持します。ONでmethodが不足する場合はstartupでfail closedにします。

`preview.position`と`preview.opacity`はpose actionが見せるpreviewの置き場所と濃さのstory既定です。
`position`は`full-stage | top-left | top-right | bottom-left | bottom-right | center`、`opacity`は
0以上1以下の数値で、省略時はDSL 3.2と同じ`full-stage`・`0.2`です。明るい部屋で薄すぎる場合は
`opacity`を上げ、場面の絵を隠したくない場合は`position`を角へ寄せます。

```yaml
recognition:
  preview:
    mirroring: mirrored
    position: bottom-right
    opacity: 0.8
```

runtimeはcamera lifecycleがpreviewを用意するときと、pose・poseInputToChangeScene・
imageInputToChangeSceneがpreviewを要求するたびに同じ値を`setPreviewOpacity`／`setPreviewPosition`で
適用します。scene単位の上書きは持たず、story全体で一つの置き場所です。`mirroring`と同様に表示だけの
設定で、recognitionへ渡すframeとconfidenceは変更しません。

### 4.3 Pose overlay

TM 2.0.0のSVG pose overlayは`poseRecognition.preview.overlay`で明示的に有効化・設定します。
既存台本との互換性を保つため、`overlay`を省略した場合はTM側の既定値にかかわらず非表示です。

```yaml
poseRecognition:
  preview:
    mirroring: mirrored
    overlay:
      visible: true
      jointStyles:
        leftWrist:
          color: '#ff00aa'
          opacity: 0.8
          radius: 6
        rightWrist:
          radius: 6
      boneStyle:
        color: '#00e5ff'
        opacity: 0.9
        width: 3
      minimumConfidence: 0.5
      confidenceScaling:
        jointOpacity: true
        jointRadius: false
        boneOpacity: true
        boneWidth: false
```

`jointStyles`のkeyはPoseNetの17 keypoint名です。各joint styleと`boneStyle`は部分指定でき、省略した
style値はTM 2.0.0の既定値（jointは`#00e5ff`／1／4、boneは`#00e5ff`／0.9／3）へ
正規化します。`minimumConfidence`は0〜1で、省略時は0.5です。`confidenceScaling`の省略値は4項目とも
`false`です。boneのconfidenceは両端jointの低い方を使用します。

runtime接続はStandalone blockを経由せず、`showPoseOverlay()`／`hidePoseOverlay()`、
`setPoseJointStyle()`、`setPoseBoneStyle()`、`setPoseOverlayMinimumConfidence()`、
`setPoseOverlayConfidenceScaling()`だけを呼びます。専用feature flagは設けません。`overlay`省略時は
`hidePoseOverlay()`で従来表示へ戻し、設定ありで必要methodが不足する場合はstartupでfail closedにします。
表示の配置・左右反転・preview非表示・camera停止・recognition停止のDOM lifecycleはTMが所有します。

### 4.4 クロスフェード

`dsl4CrossfadeTransitions`が有効なruntimeでは、scene、背景、actorのskin／表示、BGMに共通の
transition指定を使用できます。互換性を維持するため、組み込み既定値はすべて`cut`（0秒）です。
flagは起動時固定です。DSL4 runtime自体が無効な汎用default flagsではOFFを維持しますが、公式の
Standard production／non-embedded development profileでは既定ONです。明示的にOFFにしたruntimeは
crossfade構文を`K4-TRANSITION-FLAG-001`で実行前に拒否します。既存台本のport payloadと再生経路は
変更しません。

```yaml
presentation:
  transitions:
    scene: 0.5
    backdrop: 0.3
    actorSkin: 0.2
    actorVisibility: 0.15
audio:
  bgm:
    transition:
      effect: crossfade
      seconds: 1.5
      curve: equalPower
```

visual transitionは数値、`{effect: cut}`、または
`{effect: crossfade, seconds, easing?}`で指定します。`easing`は`linear | easeInOut`、省略時は
`easeInOut`です。BGMは数値、`{effect: cut}`、または
`{effect: crossfade, seconds, curve?}`を使い、`curve`は`linear | equalPower`、省略時は
`equalPower`です。秒数は0〜60の有限数で、数値短縮形とcrossfade objectの`seconds: 0`は
正規化時に`{effect: cut}`となります。

作品既定値は`presentation.transitions.scene | backdrop | actorSkin | actorVisibility`と
`audio.bgm.transition`に分けます。BGM curveをvisual easingと混在させません。actionの`transition`が
作品既定値を上書きします。

```yaml
scenes:
  ending:
    entryTransition: 0.8
    actions:
      - stage: {backdrop: Sunset, transition: 0.4}
      - Hero.setSkin: {skin: HeroSmile, transition: 0.2}
      - Hero.hide: {transition: 0.15}
      - bgm: {sound: EndingTheme, transition: 1.2, restart: true}
```

`entryTransition`はdestination scene所有の設定で、長形式sceneだけに記述します。通常のscene遷移では
遷移元renderer frameをcaptureし、遷移先先頭の即時presentation prefixを旧frameの下でcut適用してから、
旧frameを透明化します。prefixには`stage`、`bgm`、`Actor.show`／`hide`／`setSkin`／`setLayer`、
即時`Actor.setTransparency`、`Actor.setText`を連続して含めます。BGMはvisual staging中も固有のtransitionを
保持し、visual用のcutへ上書きしません。prefixが空でもscene crossfadeは実行します。

初回start、restart、rehearsal、history、live reload、resume、repositionは状態復元を優先してscene
crossfadeを行いません。stop、skip、restart、failure、dispose、新しい同scope transitionでは進行中の
transitionを終端状態へ確定し、timer、一時drawable、skinを回収します。

actor visibilityは元のghost effectをbaselineとして復元します。actor skinと背景は旧drawableを
platform所有の非interactive一時drawableへ複製し、完了後に破棄します。actor loop、pose step、loading
costumeへ`actorSkin`既定値を暗黙適用しません。

BGMは`@kubohiroya/turbowarp-asset-cache` 0.13.0以降の`createAudioVoice()`を使用し、flag ON中の
全BGMを単一のlogical channelとしてvoice管理します。cutもこのchannelを通すため、後続crossfadeは
直前のBGMを確実にfade-outできます。同じasset IDは`restart: true`がなければno-opです。
equal-powerでは進行率`p`に対して旧gainを`cos(πp/2)`、新gainを`sin(πp/2)`とし、完了時に旧voiceだけを
停止します。speechとsound effectは別voice／従来経路のままで、BGM切替によって誤停止しません。
`retention: scene`のBGMも進行中voiceをasset解放で停止しないよう、flag ON中はBGM参照assetを
story終了／stop／disposeまでtransition leaseとして保持します。

ロールバックはStandard profileで`dsl4CrossfadeTransitions=false`を明示してruntime bundleを再生成します。
台本にcrossfade指定が残る場合はcutへ戻すか指定を削除してからflagをOFFにします。flag OFFではframe
capture、一時drawable、BGM voice channelを作成しません。transition未指定台本は組み込み既定値がcutの
ため、profileのON／OFFによって表示やtimingが変わりません。

## 5. 環境別keymap

開発用の巻き戻しや早送りは固定キーをシステム的に占有せず、台本の環境別keymapで割り当てます。

```yaml
controls:
  keymaps:
    development:
      Space: navigation.nextAction
      ArrowLeft: history.previousAction
      ArrowUp: history.previousScene
      ArrowDown: history.nextScene
    production:
      Space: navigation.nextAction
```

キー名はlayoutに依存する文字ではなく`KeyboardEvent.code`です。modifierとの組合せを認めません。
ある環境のkeymapにhistory commandを割り当てなければ、その環境では巻き戻しが無効です。
同じ実行状態でnavigation keyと作品内の`keyInputToChangeScene`が衝突する場合はエラーにします。
各profileは継承、merge、fallbackを行わない完全なkeymapです。builderは`controlProfile`を必須入力として
一つ選び、指定省略、unknown profile、台本内のprofile欠落をbuild errorにします。runtime途中でprofileを
切り替えません。

`history.previousAction`は、実行中のactionがあればそのactionの開始前へ戻します。巻き戻しで
actionの開始位置に止まっている場合や実行中のactionが無い場合は、一つ前に完了したactionの開始前へ
戻します。`history.previousScene`は、sceneの途中にいれば現在のsceneの冒頭へ戻し、巻き戻しで
sceneの冒頭に止まっている場合は一つ前のscene訪問の冒頭へ戻します。最初のscene訪問の冒頭では
何もしません。

巻き戻しはscene遷移の実行履歴を使います。台本の実行位置を表すruntime stateは移動先に合わせて
変更しますが、作品変数など、それ以外のruntime stateは巻き戻しません。

Web版、TurboWarp editor、Packagerはkeymapを個別に解釈しません。builderが固定した同一の
`controlProfile`、canonical resolved keymap、そのintegrity、history有効化結果をruntime startupで
検証し、同じnavigation sessionへ渡します。surface shellが担当するのは検証対象projectと
`KeyboardEvent`の接続だけです。Web版とPackagerのstandard Compositeは`bundled` channel、
Standalone runtimeを直接読み込むTurboWarp editor fixtureは`unbundled` channelを使いますが、
storage pathの違いによってcommand、時系列scene visit、future切捨て、非位置変数の扱いを変えません。

`test/fixtures/dsl4/cross-surface-navigation.json`を3 surface共通の受け入れfixtureとし、同じSB3
round-trip、keymap、巻き戻し操作列、期待結果を適用します。surface固有のfallback keymapや暗黙bindを
追加してはいけません。

## 6. 分岐とscene

分岐規則は記述順に評価し、最後の一件を必ず`else`にします。`if`と遷移先を同じmappingへ置きます。

```yaml
branches:
  rescueResult:
    - if: 'score == 1'
      goto: seaRoute
    - if: takeSeaRoute
      goto: seaRoute
    - else: ending
```

scene固有設定がなければaction列を直接書きます。`recognitionModel`などを持つ場合は長形式を使います。

```yaml
scenes:
  opening:
    - stage: Beach
    - wait: 1

  rescue:
    recognitionModel: 救助Pose
    recognitionMode: pose
    posePreview:
      mirroring: unmirrored
    actions:
      - stage: Ocean
      - branch: rescueResult
```

画像認識でscene遷移する場合も同じ`recognitionModel` assetを参照し、`recognitionMode: image`を明示します。

```yaml
assets:
  FoodClassifier:
    kind: recognitionModel
    file: food-image-model

scenes:
  quiz:
    recognitionModel: FoodClassifier
    recognitionMode: image
    actions:
      - imageInputToChangeScene:
          apple: appleScene
          banana: bananaScene
```

pose preview mirroringのsurface境界は次のとおりです。いずれも台本値を個別解釈せず、同じschema、
StoryDocument、scene-entry consumerを使います。

| surface              | source channel | 適用条件                                          |
| -------------------- | -------------- | ------------------------------------------------- |
| Web player           | bundled        | build/startupで`dsl4PosePreviewMirroring=true`    |
| 通常TurboWarp editor | unbundled      | DSL 4.0 hostがflag ONで明示接続された場合だけ     |
| Packager             | bundled        | package済みruntimeの起動時flagがONの場合だけ      |
| development preview  | unbundled      | preview hostが同じ起動時flagをONにしたsessionだけ |

development preview専用の暗黙上書きは設けません。flag OFF時とDSL 3.1／3.2 SB3は対象外で、TMの
既存mirrored表示、recognition入力、Standalone paletteを変更しません。

camera preview操作UIは`poseRecognition.preview.controls`で任意に構成します。`mirroring`は
`showMirrored`／`showUnmirrored`のtarget-state icon、`cameraMenu`はmenu trigger iconを、それぞれ
target非依存`kind: image` assetとして参照します。両controlは8 anchor位置と0〜1のopacityを持ち、同じ
anchorでは`mirroring`、`cameraMenu`の順に並びます。暗黙の標準iconはなく、control省略時はDOMも上流APIも
生成しません。iconは`loading: eager`だけを許可します。

app shell rendererはpreview表示矩形を追跡し、camera停止、preview非表示、runtimeの自然終了／failで
controlを隠してlistenerを外します。自然終了／failでは履歴からの巻き戻しのためDOMとasset・
Object URL leaseを保持し、`navigation.reposition`／`runtime.resume`でrendererを再開します。明示的な
story stopまたはhost disposeでDOMとleaseを解放します。反転は`setPreviewMirroring`成功後だけiconを
commitします。camera menuはopenごとに
再列挙し、`default | front | back | {deviceId}`を`listCameraDevices`／`selectCamera`へ渡します。opaqueな
device IDはsession内のmenu mappingだけに保持し、StoryDocumentやruntime variableへ保存しません。
`dsl4CameraPreviewControls`は起動時固定・既定OFFです。OFFではcontrol assetをstartup materialize対象から
除外し、renderer optionと上流camera methodを検査・呼出ししません。`mirroring` controlを有効にした
sessionでは#387のstory／scene effective mirroringも同時に適用し、scene入場など外部の反転変更をtarget-state
iconへ反映します。

## 7. Core action

### 7.1 Global action

| action                    | 引数                                                                 |
| ------------------------- | -------------------------------------------------------------------- |
| `stage`                   | backdrop ID、または`{backdrop, transition?, stableId?}`              |
| `bgm`                     | sound ID、または`{sound, transition?, restart?, volume?, stableId?}` |
| `stopBgm`                 | 引数なし（`stopBgm:`）、fade-out 秒数、または`{seconds?, stableId?}` |
| `setBgmVolume`            | 0〜100、または`{volume, seconds?, stableId?}`                        |
| `sound`                   | sound ID、または`{sound, stableId?}`                                 |
| `wait`                    | 秒数、または`{seconds, stableId?}`                                   |
| `debugger`                | 引数なし（`debugger:`）                                              |
| `broadcastMessageAndWait` | message名、または`{message, stableId?}`                              |
| `transition`              | `{effect, seconds, stableId?}`                                       |
| `goto`                    | scene ID、または`{scene, stableId?}`                                 |
| `branch`                  | branch ID、または`{branch, stableId?}`                               |
| `setVariable`             | `{name, value}`                                                      |
| `changeVariable`          | `{name, by}`                                                         |
| `toggleVariable`          | variable ID、または`{name}`                                          |
| `keyInputToChangeScene`   | `KeyboardEvent.code`からscene IDへのmapping                          |
| `touchInputToChangeScene` | actor IDからscene IDへのmapping                                      |
| `poseInputToChangeScene`  | pose IDからscene IDへのmapping                                       |

`transition`は見た目の効果だけを実行し、scene遷移を暗黙に行いません。scene移動には別の`goto`、
`branch`または入力actionを使います。

台本を複数のファイルに分けるときは`include`で取り込み、場面の移動は`goto`で行います。取り込んだ
ファイルの場面も同じ名前空間に入るため、ファイルをまたぐ移動に別の命令は要りません。章（segment）と
`publication.json`は廃止しました（[経緯](dsl-4-segment-retirement.md)）。

`debugger`はdevelopment debug executionの停止境界です。`dsl4Debugger`が有効な非埋め込み
Standard SB3と、`dsl4EditorDebugger`が有効なエディタ上の埋め込み作品（authoring runtime）では
action実行直前に停止し、配布用のplayback runtime・packager・Web Playerでは副作用なしのno-opとして
直ちに完了します。引数、`stableId`、actor prefixは受理しません。実行modeとUI契約は
[`DSL 4.0 debug execution`](dsl-4-debug-execution.md)を正本とします。
Standard TurboWarp surfaceは3.2互換の`fadeOut`、`fadeUp`、`fadeToWhite`、`fadeFromWhite`、`reset`を
Stageのbrightness効果として描画します。actionのskip／cancel時は効果の終端値を同期的に確定してから次へ進みます。

`bgm`の`volume`と`stopBgm`、`setBgmVolume`はBGMの音量と終端を台本から制御します。`volume`は0〜100で、
runtimeはこれを音声voiceの0〜1 gainへ変換します。`stopBgm`は再生中のBGMを止め、秒数を与えるとその時間で
fade-outしてから停止します。`setBgmVolume`は再生中のBGMの音量を変更し、`seconds`を与えると現在の音量から
その時間で線形に変化させます。fade中のactionは完了を待ってから次のactionへ進みます。

BGMが鳴っていないときの`stopBgm`と`setBgmVolume`は何もしません。4.0のruntimeは持続的なBGM channelを
所有しないため、次に鳴るBGMのために音量を覚えておく置き場がありません。channelとしての所有はGA後の課題です。

**fade-inには専用の引数を設けません。** 再生中のBGMが無い状態で`bgm`に`transition: {effect: crossfade, seconds}`
を指定すると、新しいvoiceのgainが0から`volume`まで上がるため、これがそのままfade-inになります。

**`loop`は4.0では指定できません。** Asset Managerの`createAudioVoice`は`gain`以外のoptionを受け付けないため、
voice levelでのloopを渡す手段がありません。`ended`で作り直す方法は再生の切れ目に無音が入り、cancelとscene遷移の
扱いも複雑になるので、上流の能力が入るまで見送ります。

`setVariable`、`changeVariable`、`toggleVariable`は`variables`に宣言済みのstory variableを台本から更新します。
`name`は宣言済みの変数名でなければならず、未宣言なら`K4-VARIABLE-WRITE-UNKNOWN`でactionが失敗します。
`setVariable`の`value`は宣言時の型と一致するstring／number／booleanのリテラルで、型が違えば
`K4-VARIABLE-WRITE-TYPE`になります。`changeVariable`はnumber変数だけを受け付け、`by`の有限数を加算します。
`toggleVariable`はboolean変数だけを受け付け、現在値を反転します。代入式は4.0では受理せず、値はリテラルだけです。

更新はactionが成功したときにだけ確定します。同じaction内で複数の更新を積んだ場合は受理順に適用し、action が
cancel、skip、失敗、restoreで終わった場合は積んだ更新をすべて破棄します。したがって`branch`の条件式は、
直前までに成功したactionの結果だけを見ます。

`broadcastMessageAndWait`は、通常ならsceneのaction列に直接書く処理をTurboWarp project側へ委譲するための
core actionです。`broadcastMessageAndWait: "message"`は、Stageに宣言されたbroadcast名と大文字小文字・空白を
含めて完全一致する`message`を一度送信し、そのmessageで開始されたStage、sprite、cloneの全receiver threadが
終了してから次のactionへ進みます。完全一致するbroadcastまたはreceiverがない場合は何もせず直ちに完了します。

DSL4の`broadcastMessageAndWait`は、Scratchの「メッセージを送って待つ」（broadcast and wait）に相当します。
たとえば、紙芝居のsceneの途中にScratchで作成したミニゲームを挟み、ゲーム終了後に台本の次actionへ戻る用途に
使えます。また、コスチュームの切り替えを多用するアニメーションsequenceをScratch側のblockで作成し、その演出が
すべて終わるまで台本を待機させる用途にも使えます。台本から独立してScratch editor上で調整した方が扱いやすい処理を、
一つのmessageを境界としてsceneへ組み込むための機能です。

```yaml
- Narrator.say:
    text: ミニゲームに挑戦しよう
    seconds: 2
- broadcastMessageAndWait: playMiniGame
- broadcastMessageAndWait: playCostumeAnimation
- Narrator.say:
    text: お話に戻ります
    seconds: 2
```

Scratch側では`playMiniGame`や`playCostumeAnimation`の「メッセージを受け取ったとき」scriptが終了した時点を、
それぞれミニゲームやアニメーションsequenceの完了境界にします。receiverが`forever` blockなどで終了しない場合、
台本も次のactionへ進みません。常駐処理を開始する用途ではなく、有限時間で完了する一連の処理に使用します。

```yaml
- broadcastMessageAndWait: showEndingEffects
- broadcastMessageAndWait:
    message: showEndingEffects
    stableId: endingEffects
```

同じmessageを待つsessionが複数あっても、各actionは自身の送信で返されたthread identityだけを所有します。
skip、stop、scene再開始、live reload、host破棄ではそのactionが所有する未完了threadだけを停止し、別sessionや
project内の無関係なthreadは停止しません。DSL4の`ActionContext`、変数、遷移結果はreceiverへ暗黙伝播せず、
引数や遷移結果が必要な作品固有処理はCustom actionを使います。

このactionはTurboWarp host capabilityで、起動時固定・既定OFFの`dsl4BroadcastMessageAndWait`を必要とし、
同flagは`dsl4Runtime`を必要とします。OFFではactionを含む台本を実行前に拒否します。ロールバックはflagを
OFFに戻し、台本を標準core actionまたはCustom actionへ戻します。

#### ID付き音声（rc.38の次の4.0プレリリース向け）

`audio: {id, asset | url, volume?, muted?, playbackRate?, fadeIn?, fadeOut?}`は停止状態の音声をscene単位のIDへ準備します。
`audioControl: {id, operation, ...}`は`playUntilDone`・`play`・`loop`・`stop`・`pause`・`resume`・`seek`・`setVolume`・`setMuted`・`setPlaybackRate`を扱います。
再生・再開時は`fadeIn`・`volume`・`fadeOut`、停止時は`fadeOut`を指定できます。音量は100が既定の0以上の有限数で、100超は増幅します。
フェードは0以上の有限な実時間秒です。新しいnative engineはアプリへ追加せず、asset-cacheの共通controllerへ委譲します。
scene切替・終了・素材解放では即時停止と回収を行い、フェードを待つ場合は台本で`stop`を明示します。
旧BGM/SEの入口・crossfade・sceneを跨ぐBGM寿命は維持します。詳細は[音声仕様](../dsl4-audio.md)を参照してください。

### 7.2 Actor action

| action                     | 引数                                                                                                                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Actor.show`               | `{skin, x, y, scale, transition?, stableId?}`                                                                                                                                                                                      |
| `Actor.hide`               | `{transition?, stableId?}`                                                                                                                                                                                                         |
| `Actor.setTransparency`    | 0〜100、`{transparency, stableId?}`、または`{from, to, seconds, background?, stableId?}`                                                                                                                                           |
| `Actor.moveTo`             | `{x, y, seconds, easing?, stableId?}`                                                                                                                                                                                              |
| `Actor.say`／`Actor.think` | `{text, closePolicy?, seconds?, waitFor?, styles?, characterIntervalSeconds?, startSound?, characterSound?, noSoundCharacters?, restCharacters?, restCharacterIntervalSeconds?, stableId?}`。`text`は文字列またはcontent runの並び |
| `Actor.setSkin`            | skin ID、または`{skin, scale?, transition?, stableId?}`                                                                                                                                                                            |
| `Actor.setLayer`           | `front`／`back`／相対layer数、または`{layer, stableId?}`                                                                                                                                                                           |
| `Actor.loop`               | `{steps: [{skin, seconds}, ...], stableId?}`                                                                                                                                                                                       |
| `Actor.setText`            | `{text, style, stableId?}`。`text`は文字列またはcontent runの並び                                                                                                                                                                  |
| `Actor.pose`               | `{steps, stableId?}`                                                                                                                                                                                                               |

### content runとruby

`Actor.setText`の`text`は、1個の文字列か、**content runの並び**で書けます。並びの要素は文字列か
`{ruby: {base, reading}}`です。

```yaml
- Caption.setText:
    text:
      - むかしむかし、
      - ruby: {base: 竹取, reading: たけとり}
      - の翁がいました。
    style: body
```

frontendはどちらの形も同じ**型付きrun列**へ正規化します。文字列は`{type: text, text}`1件になり、
`ruby`は`{type: ruby, base, reading}`になります。並びは記述順のまま保たれ、隣接する文字列を連結したり、
前後の空白を落としたり、順序を変えたりしません。`base`と`reading`はどちらも空文字を許しません。

**plain text射影は`base`だけを残します。** backlog、読上げ、accessibilityへ渡す文字列は
`dsl4PlainTextFromContentRuns`が生成し、同じrun列からは常に同じ文字列になります。`reading`を落とすのは、
読上げやbacklogが両方を再生すると同じ語を二度読むことになるためです。読みを使いたいconsumer——発音を選ぶ
読上げ voiceなど——は射影ではなくrun列を直接読みます。

rubyを含むrun列は`@kubohiroya/turbowarp-svg-text`の`setRichText`へ渡し、含まないものは従来の`setText`の
まま既存のlayoutを使います。

**`Actor.say`と`Actor.think`の`text`も、文字列かcontent runの並びで書けます。**

```yaml
- Hero.say:
    text:
      - 昔、
      - ruby: {base: 浦島, reading: うらしま}
      - 太郎がいました。
    waitFor: advance
```

吹き出しでは、文字列はこれまでどおり文字列のまま渡し、並びだけを型付きrun列へ正規化します。rubyを
含まないrun列は文字列へ射影して、従来の吹き出しの経路で表示します。rubyを含むrun列は
`@kubohiroya/turbowarp-bubble`（0.18以降）へrun列のまま渡し、bubbleはtext capabilityの`setRichText`で
描きます。

**1文字ずつ表示（`characterIntervalSeconds`）では、ruby 1件を1単位として表示します。** 地の文は書記素
クラスタ（grapheme cluster）ごとに出し、rubyは`base`と`reading`を同時に出すので、読みだけが先に見えたり
`base`の途中で止まったりしません。無音文字・休止文字の判定には、rubyの単位では`base`を使います。
bubble自身のreveal（`bubbleReveal`）でも、rubyを含むときは`splitBubbleContent`でrun列を分け、ruby 1件を
分割しません。

`Actor.say`と`Actor.think`は、`closePolicy`を1件指定するか、action内で`seconds`または
`waitFor: advance`の少なくとも一方を指定します。`closePolicy`はトップレベルの`bubbleClosePolicies`に
存在する名前であり、action内の`seconds`／`waitFor`とは併用できません。`seconds`だけなら吹き出しの表示開始から
指定秒数後、`waitFor`だけならステージのprimary pointer入力または修飾キーを伴わないany key入力後に完了します。
両方を持つpolicyまたはinline指定では、入力とtimeoutのうち先に成立した方で完了します。入力待機は吹き出しを
表示した直後のmicrotaskで有効になり、そのactionを開始した同じ入力を再利用しません。

```yaml
bubbleClosePolicies:
  after-3-seconds: {seconds: 3}
  user-advance: {waitFor: advance}
  advance-or-timeout: {seconds: 10, waitFor: advance}

scenes:
  opening:
    - Hero.say:
        text: 次へ進みます
        closePolicy: user-advance
```

policyはdispatch前に同じ`seconds`／`waitFor`へ解決されるため、入力購読、timeout、`continueIndicator`、cancel、
hide animationを含むlifecycleはinline指定と同じです。未定義名はsource上の`closePolicy`位置を指す
`K4-REF-001`で拒否します。

`styles`にはトップレベルの`bubbleStyles`で宣言した名前を1件以上のYAML配列として指定します。1件でも
配列が必要であり、スペース区切り文字列は受理しません。記載順にdeep mergeし、同じpropertyは後のstyleを
優先します。objectは再帰的にmergeし、配列とscalarは連結せず後の値で全体を置換します。同じstyle名の
重複指定はエラーです。最後にaction内の文字送り指定を適用するため、action固有値が最優先になります。
合成後のeffective styleを共通speech引数へ解決してからActor portへ渡すため、platform adapterはstyle
registryを参照しません。asset依存も合成後のeffective styleから収集します。旧単数形`style`はaliasとして
残さず未知keyとして拒否します。

`continueIndicator`は、直接指定または`closePolicy`から解決した`waitFor: advance`で全文が表示済み、かつ
入力待機が継続している間だけ本文末尾へ表示します。frameは宣言順に`frameIntervalSeconds`間隔で循環します。
Bubbleがindicatorを所有するため、表示条件と解放もBubbleのhandle lifecycleに従います。

`Actor.say`／`Actor.think`の表示所有者は常に`@kubohiroya/turbowarp-bubble`です。runtime controllerは
合成後のeffective styleをBubble platformへ定義します。
Bubbleはtypewriter中を`talking`、全文表示後のadvance待機中を`awaiting-continue`、完了／cancelを
`close`へ写像し、sound、portrait、blink、lip-sync、indicator frameのasset依存もeffective styleから収集します。
BubbleはSVG overlayを優先し、overlayを提供しないhostではscratch-render backendへfallbackして描画します。
browser stageはrendererのoverlay containerを自前のstage canvasの上へmountし、pointer入力は下のcanvasへ通します。

`characterIntervalSeconds`を指定すると、Unicode grapheme cluster単位で1文字ずつ表示します。実行環境は
`Intl.Segmenter`を提供しなければならず、未提供の場合はcode point単位へfallbackせず開始前に失敗します。
`startSound`は最初の吹き出し内容を表示した直後に1回再生するsound asset IDです。セリフを読んだ音声を
指定してフルボイスにでき、speech完了、入力、タイムアウト、cancelのいずれでも再生を停止します。
`characterSound`は`characterIntervalSeconds`と組み合わせるsound asset IDで、実際に1文字ずつ表示した
各文字に対して再生します。`startSound`と`characterSound`は併用できます。文字送りの途中で入力または
タイムアウトが成立した場合、残り全文を効果音なしで一括表示してから次のactionへ進みます。
`noSoundCharacters`は`characterSound`を鳴らさない文字を連結した文字列です。
`restCharacters`は対象文字を無音にし、その文字を表示してから次の文字を表示するまでの間隔を
`restCharacterIntervalSeconds`へ置き換えます。両方の文字列は本文と同じUnicode grapheme cluster単位で
判定します。`noSoundCharacters`は`characterSound`と、`restCharacters`は
`restCharacterIntervalSeconds`と組み合わせ、いずれも`characterIntervalSeconds`による文字送りが必要です。
休止中に入力、タイムアウト、cancelが発生した場合は休止を即座に解除し、残り全文を一括表示する場合は
文字別の休止も効果音も適用しません。
sound停止はAsset Managerのasset ID単位です。speechに指定したsound asset IDはそのspeechが排他的に
使用し、BGMや別presentationとの同時再生には別のasset IDを割り当てます。terminal cleanupは、その
speechが実際に再生を開始したasset IDだけを停止します。
`dsl4SpeechAdvanceTypewriter`は起動時固定・既定OFFで、`closePolicy`もこのflagの対象です。OFFでは従来の
`Actor.say: {text, seconds}`だけを受理します。
`dsl4TurboWarpBubbleAdvancedPresentation`は起動時固定・既定OFFで、`dsl4Runtime`、`dsl4AppShell`、
`dsl4SpeechAdvanceTypewriter`を必要とします。
OFFでは`reveal`、`audio`、`showAnimation`、`hideAnimation`、`visibleAnimations`を含むstyleを起動時に明示拒否し、
未対応runtimeで黙って無視しません。

```yaml
- Hero.show:
    skin: HeroHappy
    x: 0
    y: -60
    scale: 30
- Hero.setTransparency: 50
- Hero.setTransparency:
    from: 0
    to: 50
    seconds: 1
    background: true
- Hero.moveTo:
    x: 100
    y: -60
    seconds: 1.5
    easing: easeInOut
- Hero.say:
    text: 助けに行こう
    seconds: 8
    waitFor: advance
    styles:
      - Hero style
    startSound: HeroGreetingVoice
- Hero.think:
    text: どうしよう……
    waitFor: advance
    startSound: HeroThinkingVoice
- Caption.setText:
    text: おしまい
    style: title
- Hero.pose:
    steps:
      - pose: help
        skin: HeroHelp
        sound: Success
      - pose: jump
        skin: HeroHappy
        sound: Success
- poseInputToChangeScene:
    help: ending
    jump: retry
```

`Actor.moveTo.easing`は`linear | easeIn | easeOut | easeInOut`から選びます。省略時は従来どおり
`linear`です。easingはX/Yへ同じ比率で適用し、0秒またはactionのskip時は即座に終点へ確定します。

`Actor.setTransparency`はScratch／TurboWarpの「幽霊の効果を指定値にする」へ一対一で対応します。
`0`は完全不透明、`50`は「幽霊の効果を50にする」、`100`は完全透明です。値の反転や換算は
行いません。

`from`、`to`、`seconds`を指定すると、透明度を`from`から`to`まで線形に変化させます。
`background`を省略するか`false`にすると、変化が完了するまでactionを待つforeground動作です。
`true`にすると、`from`を同期適用した直後に次actionへ進み、変化をbackgroundで続けます。
foreground・backgroundのどちらも、途中でスキップ、停止、再開始、破棄された場合は、`to`を
同期適用してtimerを回収してから処理を続けます。同じactorへ新しい透明度変化を開始する場合も、
先の変化をその`to`へ確定してから新しい`from`を適用します。`to`の適用に失敗した場合は
進行中の変化を保持してスキップを行わず、次のスキップまたはlifecycle境界で適用を再試行します。

`Actor.hide`はScratch／TurboWarpのvisible stateを`false`にし、透明度effectとは混同しません。次の
`Actor.show`は同じactorを再表示します。`Actor.setSkin.scale`はskin適用後に正のサイズ百分率を設定します。
`Actor.setLayer`の`front`／`back`は絶対位置、数値は正なら前方、負なら後方への相対移動です。

`Actor.loop.steps`は先頭skinを直ちに適用し、各`seconds`後に次のskinへ進むbackground loopです。step数と
duration数を同じ構造に固定し、少なくとも一つのdurationを正数にします。同じactorの`setSkin`、runtime停止、
またはenvironment破棄でloop timerを回収します。

`Actor.pose.steps`は配列の全要素を上から順に実行します。各stepは`skin`を先に適用し、`pose`の
チャージ完了を待ち、`sound`を鳴らしてから次へ進みます。`skin`と`sound`は省略できます。
`poseInputToChangeScene`と`imageInputToChangeScene`は同時に待つ候補であり、最初に選ばれた1件だけの
sceneへ移動します。どちらもsceneの`recognitionModel`を使い、画像認識では`recognitionMode: image`を
明示します。

一つのaction mappingに複数のaction keyを置けません。`stableId`は任意ですが、指定した場合は
文書全体で一意にします。

入力actionへ`stableId`を付ける場合は、遷移mappingを`routes`の下へ移します。

```yaml
- keyInputToChangeScene:
    stableId: routeSelection
    routes:
      Digit1: rescue
      Digit2: ending
```

## 8. Custom action

Custom actionは作品固有の工夫をScratch blockで加える任意機能です。標準作品はAction Registryが空でも
全core actionを実行でき、台本製作者にcustom action blockを要求しません。

```yaml
- Hero.wave:
    stableId: firstWave
    arguments:
      speed: fast
      count: 3
```

target actorとaction名を`Actor.action`で表し、異なる役割を持つ引数は`arguments`内のnamed mappingで
表します。位置listは許可しません。引数がないactionは`Hero.wave: {}`と書きます。外側で許可するkeyは
`arguments`と`stableId`だけです。

台本をparseする前にTurboWarp adapterがcustom action用hatを検出し、一つの不変な
`ActionRegistrySnapshot`を生成します。各登録は次を持ちます。

```json
{
  "name": "wave",
  "target": "actor",
  "parameters": [
    {"name": "speed", "type": "string", "required": true},
    {"name": "count", "type": "number", "required": false}
  ],
  "quiesce": "finish-only",
  "source": {"targetId": "...", "hatBlockId": "..."}
}
```

parameter typeは初版では`string`、`number`、`boolean`に限定します。`required`を省略してsnapshotを
生成する場合は`true`へ正規化します。台本の未宣言引数、必須引数の欠落、型不一致は実行前のerrorです。

`quiesce`はlive reload時のhandler停止契約であり、`finish-only`または`cancel-replay-safe`を取ります。
省略時は副作用を重複させない安全側の`finish-only`へ正規化します。この値はhatのdeveloper向け設定で
宣言し、台本製作者が作品ごとに指定する項目にはしません。

action名とparameter名は通常のDSL ID規則とUnicode NFCに従います。短いaction名を許可し、namespaceは
必須にしません。その代わりproject内でaction名を一意にし、同名handler、parameter重複、全core action名
との衝突をRegistry Snapshot生成時に拒否します。登録済みactionだけを受理し、runtimeは動的なport名を
作らず、固定`customAction` portへname、target、argumentsを渡します。

## 9. 検証境界

JSON Schemaは型、必須項目、未知key、actionの引数形を検証します。意味検証は次を追加で検証します。

- 参照するscene、branch、actor、style、assetが定義済みであること
- 参照assetの`kind`とcostumeの`target`が利用箇所に合うこと
- branchの`else`が一件だけ存在して末尾にあること
- `stableId`が文書全体で一意であること
- `file`が安全なローカル相対pathであること
- 構文識別子がUnicode NFCであり、asset／scene IDが空でないこと
- keymapと作品内入力に衝突がないこと
- custom actionが登録済みで、引数がRegistry parameter宣言と一致すること

構造または意味検証が失敗した場合、runtimeはscene actionやasset準備を開始しません。
現在のschemaとfixtureは表層契約を固定するための実装基準であり、DSL 4.0 runtimeが利用可能になった
ことを意味しません。

初期実装で固定する診断codeは次です。Source Mapによる行・列・関連位置はparser実装時に加えます。

| code                     | 意味                                           |
| ------------------------ | ---------------------------------------------- |
| `K4-YAML-*`              | YAML構文または禁止機能                         |
| `K4-VERSION-001`         | versionが文字列`4.0`ではない                   |
| `K4-SCHEMA-001`          | 引数型、必須field、構造がschemaと一致しない    |
| `K4-SCHEMA-UNKNOWN-KEY`  | schemaにないkey                                |
| `K4-ID-INVALID`          | 構文識別子の文字規則違反、または空のliteral ID |
| `K4-KEY-UNSUPPORTED`     | 未対応keyまたはmodifier combination            |
| `K4-REF-001`             | 参照先が未定義                                 |
| `K4-REF-002`             | asset kindが利用箇所と一致しない               |
| `K4-REF-003`             | costume targetがactorと一致しない              |
| `K4-ASSET-001`           | `file`が安全なローカル相対pathではない         |
| `K4-BRANCH-001`          | branchの末尾が`else`ではない                   |
| `K4-STABLE-ID-001`       | `stableId`が文書内で重複                       |
| `K4-KEY-001`             | navigation keymapと作品内key inputが衝突       |
| `K4-COMMAND-UNSUPPORTED` | Action Registryにないcustom action             |

入力byte数、YAML node数、nesting深度、scalar長、scene数、sceneごとのaction数、asset数、診断数には
資源上限を設け、超過を`K4-RESOURCE-LIMIT`で停止します。実装済み上限、必須explicit上限、benchmarkに
基づくfrontend提案値、診断の切詰めとredactionは
[`DSL 4.0 式評価・資源上限・診断境界`](dsl-4-expression-limits-diagnostics.md)を正本とします。

## 物語の反復と条件分岐（4.0 RC改訂）

[Issue #980の仕様](dsl-4-narrative-control.md)で、4.0 RCのif／repeat／forEachと型付き行参照を定めます。
公開rc.43の機能ではありません。rc.44ではStandardに昇格し、通常CLI・対応runnerで有効です。低水準のグローバル既定OFFと既存4.0の意味は維持します。

開発中の4.0 RC構造Schemaは`schema/dsl-4-narrative-control.schema.json`です。固定行・回数・条件構造を先に
検証し、参照解決・有限展開後の通常命令は既存4.0 Schemaで検証します。rc.44の通常CLIでは追加flagが不要です。

### 台詞・字幕への台本変数の埋め込み

DSL 4.0 の `say`、`think`、`setText` の本文には、固定文字列・ルビ付き本文に加え、台本変数を
読み取る本文を指定できます。ブロック台本では本文欄に通常の「つなげる」と「台本の変数」を
組み合わせます。たとえば `「得点: 」 + 台本の変数 [score]` は次の YAML に対応します。

```yaml
- Hero.say:
    text: {interpolate: {join: ['得点: ', {variable: score}]}}
    seconds: 2
```

本文は命令を実行し始めた時点で一度だけ確定します。表示中に値を書き換えても本文は変わらず、
次に同じ命令を実行したときに新しい値が反映されます。数値は桁区切りを付けず、真偽値は
`true` / `false` と表示します。使用できるのは文字列・有限の数値のリテラル、宣言済みの台本変数、
二項の「つなげる」だけです。Scratch の変数やほかのレポータは実行しません。ルビ本文や従来の
ランタイムとの互換性が必要な場合は、固定文字列または従来のルビの書式を使ってください。
