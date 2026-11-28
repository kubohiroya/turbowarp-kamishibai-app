# 紙芝居DSL 4.0 capability／Bundle／release契約

Copyright © 2026 Hiroya Kubo.

文書状態: Issue #266／#517／#564／#601の実装正本（2026-08-16）

関連Issue: [#258](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/258)、
[#265](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/265)、
[#266](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/266)、
[#517](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/517)、
[#548](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/548)、
[#564](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/564)、
[#583](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/583)、
[#601](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/601)、
[#609](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/609)

機械可読な契約:
[`capability-bundle-release-contract.json`](../../test/fixtures/dsl4/capability-bundle-release-contract.json)

## 1. 結論

4.0.0-rc.10のStandard成果物は、`sb3-toolchain@0.9.0`の静的bundleにより、Runtime memberと
6つのcapability拡張を`kubohiroyakamishibai4`一件へ集約して生成します。
公式WebサイトボタンはこのRuntimeの固定URL用`openOfficialWebsite`を呼び、任意URLを受け取るWeb Link拡張を
組み込みません。release generatorは7 memberの展開sourceを一時生成しますが、Gitには保存しません。
生成SB3がTurboWarpへ登録する拡張とdata URLは、復元カプセルを重複保持しないcompact bundle一件だけです。
公開後の成果物はGitHub Release asset、公開前の再現性はgeneratorとsource identityを正本とします。

Runtime member自体は、6つの完全固定npm packageの公開composition subpathと、このrepositoryの
first-party Structured Dataをesbuildで一つのRuntime member sourceへ構成します。そのsource先頭には
Gallery形式のmember headerと、内部構成要素のtitle、copyright、license、package versionを残します。
6つのnpm packageのStandalone成果物も静的bundle memberとして同梱し、それぞれのトップレベル
`blockIconURI`を変換後の各通常ブロックへ継承します。

## 2. capability inventory

| capability         | provider／version                                | repository                                | Standalone ID                 | 4.0 Standardでの境界               |
| ------------------ | ------------------------------------------------ | ----------------------------------------- | ----------------------------- | ---------------------------------- |
| Asset Cache        | `@kubohiroya/turbowarp-asset-cache@0.1.0`        | `kubohiroya/turbowarp-asset-cache`        | `kubohiroyaassetcache`        | `./composition`                    |
| Async Input        | `@kubohiroya/turbowarp-async-input@0.7.0`        | `kubohiroya/turbowarp-async-input`        | `kubohiroyaasyncinput`        | `./composition`                    |
| Bubble             | `@kubohiroya/turbowarp-bubble@0.13.0`            | `kubohiroya/turbowarp-bubble`             | `kubohiroyabubble`            | `./reveal` + `./turbowarp-adapter` |
| Camera Source      | `@kubohiroya/turbowarp-camera-source@0.18.0`     | `kubohiroya/turbowarp-camera-source`      | `kubohiroyacamerasource`      | bundle memberのみ（compositionなし） |
| Runtime Expression | `@kubohiroya/turbowarp-runtime-expression@0.6.0` | `kubohiroya/turbowarp-runtime-expression` | `kubohiroyaruntimeexpression` | `./composition`                    |
| SVG Text           | `@kubohiroya/turbowarp-svg-text@0.10.0`          | `kubohiroya/turbowarp-svg-text`           | `kubohiroyasvgtext`           | `./composition`                    |
| TM                 | `@kubohiroya/turbowarp-teachable-machine@3.5.1`                 | `kubohiroya/turbowarp-teachable-machine`                 | `kubohiroyatm`                | `./composition` + `./posenet`      |

TM 2.0.0では公開block opcodeの`startPredict`、`stopPredict`、`isPredicting`、
`firstPredictMsReporter`を削除し、`startRecognition`、`stopRecognition`、`isRecognizing`、
`firstRecognitionMsReporter`へ置き換えました。Standard bundleは旧opcodeの互換aliasを追加せず、
Composition APIの既存recognition名へ直接接続します。
| Structured Data | first-party source v1 | `kubohiroya/turbowarp-kamishibai-app` | `kubohiroyastructdata1` | internal composition |
| Structured debug | Structured Dataと同じ | `kubohiroya/turbowarp-kamishibai-app` | `kubohiroyastructdata1debug` | Standardから除外 |
| Action Context | first-party source | `kubohiroya/turbowarp-kamishibai-app` | `kubohiroyakamishibai4actioncontext` | Standardから除外 |

package versionはrangeを使わず、lockfileのnpm integrityと一致させます。Runtime memberのcomposition rootは
6つのserviceを構成し、同じ6 packageのStandalone成果物はコード画面用の静的bundle memberとして提供します。
生成SB3は外側のbundleを一度だけ登録し、各memberのhandler、menu、storage、由来アイコンを名前空間付きで委譲します。

TM 2.0.0の`./posenet`を、固定model manifest、package asset、SHA-256検証、project bundleの
Base64変換、runtime fetch差し替えの正本とします。利用側はSB3のbundled／unbundled component storageから
model descriptorを一意に選ぶだけとし、検証・復号は初回pose recognition時に上流APIへ委譲します。
PoseNet model dataはruntime JavaScriptへ含めず、PNG／costume／soundへ偽装せず、明示的なcomponent model
dataとして保存します。

Standard Runtimeはnpmの完全固定releaseを直接利用し、`patchedDependencies`やrepository-local patchを
介しません。rollbackは直前のexact pinとlockfileを復元するか、
DSL 4 runtime flagをOFFにして3.2成果物を使用します。

カメラvideoをTensorFlow.jsへ渡すCanvas2D contextの選択はTMの責務です。物理カメラによる
320×240の1 draw + 1 read測定では`willReadFrequently`のend-to-end改善が再現せず、1 draw + 4 reads
以上のread-heavy条件でのみ改善したため、TM 2.0.0は通常contextを使います。Kamishibaiは
TM composition APIを利用するだけとし、上流のcamera canvasや`fromPixels()`経路を下流patchで
補修せず、Chromeの警告も抑制しません。

scratch-renderも公式commitを直接固定し、Packager成果物へ`willReadFrequently`を後付けしません。
`Silhouette.unlazy()`は画像のmaterializeごとに1 draw + 1 `getImageData()`を行いますが、以後の
hit-testはキャッシュした`_colorData`を参照します。一方Chromiumの警告は共有canvas上で累積した
2回目のreadbackに固定的に発生し、canvas size、経過時間、draw/read比、実測latency、現在の
acceleration状態を判定しません。さらに通常contextはreadback後に自動的なCPU fallback候補になります。
したがって、この警告はread-heavy workloadを発見する診断材料ではあっても、Silhouetteが
`willReadFrequently`を必要とする証拠にはなりません。480×360の同一処理ではChrome 149で改善なし、
Chrome 151で指定時に約22.4%低速化したため、警告抑制だけを目的とするfork／下流patchは行いません。

## 3. API、integrity、license、SBOM

Runtime member内部のsource composition互換契約は次の4点です。

1. `package.json`の完全固定version
2. `pnpm-lock.yaml`の同一versionとSHA-512 integrity
3. packageが公開する`./composition` export
4. Kamishibai adapterを通す統合test

Standard 4.0の生成SB3は静的bundle一件です。各memberはGallery形式のheader、単一の同期
`Scratch.extensions.register()`、固定IDを満たし、npm artifact integrity、bundle opcode、menu、storage、
block iconを回帰testで検証します。

配布SBOMの入力は`package.json`と`pnpm-lock.yaml`、attributionの正本は`LICENSES.md`です。Standard成果物を
生成するcurrent source、generatorが一時出力したpathとbyte列から求めたsource identity、
release metadataとdownload catalogのSHA-256を合わせて、
「どのsourceとpackageからどのSB3を作ったか」を追跡します。

## 4. 成果物とpalette

| surface                     | extension ID                         | 登録 |               palette |     preview UI |
| --------------------------- | ------------------------------------ | ---: | --------------------: | -------------: |
| Standard 4.0 Runtime bundle | `kubohiroyakamishibai4`              |    1 | member別のblockとicon | 非埋め込みのみ |
| Action Context              | `kubohiroyakamishibai4actioncontext` |    0 |              8 opcode |           なし |
| Structured Data Standalone  | `kubohiroyastructdata1`              |    0 |     developer surface |           なし |
| Structured Data debug       | `kubohiroyastructdata1debug`         |    0 |         debug surface |           なし |
| development preview host    | なし                                 |    0 |              DOM／CLI |     開発時のみ |

Runtime memberのopcodeはcanonical templateの内部接続・状態確認用で、すべて`hideFromPalette: true`です。
Runtimeと6つのStandalone memberの通常ブロックは由来元のSVG `blockIconURI`を保持し、生成LABEL見出しと
二重separatorでグループ化されます。block固有iconがある場合は、それを優先します。各見出しの直後には
member固有の`docsURI`を開くボタンを置き、core RuntimeはDSL 4.0 block reference、6つの上流memberは
それぞれのGitHub Pagesを参照します。
Standard SB3はruntime source、YAML source descriptor、runtime artifact、asset bundle bytesを内包し、
実行時にextension codeをremote取得しません。preview token、candidate、modal、reload preferenceなどの
transient stateも保存しません。非埋め込み`application.mode=menu`は制作・debug runnerとして
preview UIを初期化し、埋め込み`application.mode=story`はproduction実行として初期化しません。

## 5. asset、preview、security境界

remote **extension code**とremote previewは常に禁止します。asset bytesは別の境界です。作者が
`delivery: remote`を明示したposeModelは通常のHTTPS TMディレクトリURLを利用できます。内容固定が
必要ならembeddedへ変換します。integrity、media type、sizeを宣言したverified remoteは取得後のbytesを
再検証し、失敗時に未検証bytesへfallbackしません。

local preview transportはloopback address、許可origin、session token、project root confinementをすべて
満たす接続だけを受け入れます。protocol、fingerprint、candidate session、reload transaction、transport
policy、local HTTP host adapter、公開`preview-dsl4 --watch`のargument／signal／browser open接続は
実装済みです。CLIはbrowser runtime-ready ackを受け取るまで成功表示せず、未接続、full rebuild、
SIGINT／SIGTERMを有限終了させます。

artifact fingerprintにはbase SB3、asset bundle、app shell、Standard Runtime、builder設定、source path／ID、
control profileを含めます。YAML textのintegrityだけが変わった場合はlive reload、fingerprintが変わった場合は
full rebuildしてentrypointから再開します。reload preference、dialog layout、token、candidate revisionは
fingerprintにもproduction artifactにも含めません。

### 5.1 sourceの読込・保存sequence

| surface              | 作者入力                                                     | 読込sequence                                                                                                | 保存／再読込                                                                       |
| -------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Web Preview          | 非埋め込みSB3で選択した台本fileまたはproject root            | browser安定読込 → production frontend → 宣言asset準備 → 共有preview protocol → runtime                      | 台本は外部editorが保存し、handleやpreview stateはSB3へ書き込まない                 |
| local development    | `preview-dsl4 --watch`に渡すbase SB3、project root、manifest | Node安定読込 → production source frontend → 認証済みgeneration → browser-owned実TurboWarp runtime           | YAML-only保存はruntime generationだけを更新し、SB3を再buildしない                  |
| TurboWarp editor     | Standard SB3、または台本埋め込みSB3                          | 非埋め込みはOpen後にwatch、埋め込みはcomponent descriptorをproduction再生                                   | Editorで追加したcostume／soundを保持し、非埋め込みのYAML更新時に`name`から再解決   |
| Web player／Packager | 同じStandard SB3                                             | production shellはruntime componentのembedded descriptorだけを読み、external pathやpreview bridgeを読まない | playerは保存せず、Packagerは検証済みSB3のsource／artifact／asset storageを保持する |

4.0 StandardはRuntime内部のsource compositionに加え、SB3生成時に`extensionBundles`で7 memberを一件へ
集約します。source descriptorとbundleの展開source復元性は、Runtime component storage path、固定済み
一時生成source、TurboWarp VMの実際のload → `toJSON()`再保存testを正本とします。

## 6. lifecycle

Standard Runtimeはsource frontend、StoryDocument、scene dependency、asset preload、image／audio／pose model、
runtime controllerを一つのcomposition rootで所有します。正常終了、明示的stop、crash、transport切断のどれでも、
新しい入力を止め、実行中actionをquiesceし、candidate／current session、asset lease、sound、skin、pose、camera、
listener、timer、cache handleの順に所有resourceを解放します。disposeは冪等にし、途中の失敗を集約して残りの
cleanupを継続します。

タイトルから物語またはメニューへ進む分岐は、
[3.2内部仕様書の状態遷移](https://kubohiroya.github.io/turbowarp-kamishibai-docs/3.2/developer-guides/internal-specification/document.html#%E7%8A%B6%E6%85%8B%E9%81%B7%E7%A7%BB)
を4.0 Standardでも維持します。緑の旗は初期化後に`showTitle`へ進み、タイトル表示中は物語を開始しません。
ステージ上のタイトル背景クリックと右上の閉じるボタンは、いずれも`closeTitle`コマンドへ集約します。
ステージは「ステージが押されたとき → タイトル画面を閉じる」を直接実行し、閉じるボタンはランタイムから
同じコマンドを呼びます。broadcastを経由する往復はしません。
`closeTitle`の後は、台本埋め込み版なら`startStory`、非埋め込み版なら`showCover`からカバー／メニューへ進みます。
物語の終了または中止は`stopStory`からカバー／メニューへ戻し、タイトルを再表示しません。

## 7. releaseとrollback

4.0.0-rc.10 releaseは必ず次の順で行います。

1. capability packageを個別repositoryでtestしreleaseする
2. Kamishibaiの`package.json`とlockfileを完全固定versionへ更新する
3. package、runtime reporter、release catalogを同じrelease versionへ更新する
4. candidate状態で`pnpm release:dsl4:update`を実行し、一時sourceからSB3を生成してsource identity、hash、size、metadataを更新する
5. `pnpm release:dsl4:check`と`pnpm verify:full`でsource一致とSB3決定性を非破壊検証する
6. candidate PRをmainへ統合し、clean mainで`pnpm verify:full && pnpm release:check`を再実行する
7. `pnpm release:dsl4:freeze`でsource identityとartifact SHA-256を固定し、mainへ統合する
8. frozen commitへannotated `v4.0.0-rc.10` tagを作成する
9. npm packageをdist-tag `next`で公開し、`latest=3.2.3`を維持する
10. 一時生成したSB3をversion付きassetとしてGitHub prereleaseへ公開する
11. npm、GitHub、PagesのURLをmetadataへ記録してpublishedへ遷移する
12. 3.2.3を推奨安定版に維持し、GitHub Release assetを取得・検証してsiteを公開する
13. 公開済みassetのversion／size／hash／dist-tag／Pagesを照合する

更新中に失敗した場合は新しい成果物を公開しません。公開後は同じversionのpackage、tag、GitHub Release
assetを差し替えません。`main` checkoutは公開済み／candidateの展開sourceやSB3を保持せず、version、
source identity、asset URL、size、SHA-256、公開状態だけを`release-metadata/`へ保持します。Pages buildは
GitHub Releasesからbounded downloadし、size、SHA-256、ZIP、Title metadataを照合します。
`frozen`または`published`ではupdateをfail closedにし、修正は
4.0.0-rc.10、正式安定版は4.0.0として新しいmetadata、source identity、artifact hashを作成します。
既定OFFの対象surfaceを無効化し、必要に応じてnpm versionをdeprecateし、GitHub Releaseへ注記します。
過去の3.1／3.2はGitHub Release assetだけを配布正本とし、現在のtoolchainやsourceから再構築しません。

この手順の汎用部分、すなわちsource identity、決定的SB3 build検証、artifactのSHA-256とsize、candidateの
atomic書き出し、candidate／frozen／publishedのlifecycle、公開済みartifactの照合は
`@kubohiroya/sb3-toolchain`のrelease snapshot helperが所有します。Kamishibai固有のpolicy、すなわち
release version／series／channel／buildDate、`kamishibai-${version}.sb3`のnaming、npm／GitHub
Release／Pagesの公開方針、download catalogの照合、title build metadataのstampingは
`scripts/sb3/dsl4-release-policy.ts`に集約し、`scripts/sb3/dsl4-release-workflow.ts`は両者を
つなぐorchestrationとCLIだけを持ちます。

## 8. 受け入れ基準

- capability、repository、package、version、extension ID、providerがfixtureと一致する
- Standard source generatorがRuntimeと6つのcapability memberを一時生成し、Web Linkを含まない
- Standard SB3が`kubohiroyakamishibai4`一件だけをembedded URLから読み込む
- 各memberの通常ブロックが由来元の異なるSVG `blockIconURI`を保持する
- 各memberの見出し直後に、そのmember固有の`docsURI`を開くボタンが一つある
- Standard bundleが重複するrecovery capsuleを既定で含まず、current generatorから再現できる
- runtime source先頭にheader、全構成要素のprovenanceが残る
- Standard paletteのvisible DSL 4.0 blockがcore action manifestと一致し、preview専用opcodeを含まない
- 非埋め込みだけがpreviewを初期化し、埋め込みproductionは初期化しない
- preview handle、candidate、reload preference、dialog stateをSB3に保存しない
- exact dependency、lock integrity、license attributionが回帰testで検証される
- YAML-only変更と構造変更の分岐、transient state除外がfixtureで固定される
- 緑の旗、タイトル背景／閉じるボタン、台本有無、物語終了の遷移が3.2の状態遷移と一致する
- remote code／remote preview禁止とverified remote asset opt-inを混同しない
- release／update／rollback順序と実行済みevidenceが機械可読契約から検査される
- `app/`と`release-sources/`を保持せず、公開済みSB3をGitHub Releasesから検証して取得する

この契約だけを戻す場合は文書、fixture、test、release generatorをrevertし、公開済み
4.0.0-rc.5の固定成果物を使用します。


## rc.44: npmを保留したStandard物語制御の公開

Issue #989では4.0のif／repeat／forEachと型付き参照をStandardに昇格します。候補を生成・固定して必須CI成功後にmainへ統合し、
固定したSB3を新しいGitHub prereleaseへ添付します。公開記録はGitHub ReleaseとPagesのURLを渡し、未公開のnpm URLは渡しません。
Docs・Samplesは公式の版付きRelease artifactとタグcommitから生成し、npm未公開の状態も区別します。npmのdist-tagや3.2.3の安定版推奨は変更しません。
公開Editorの既存GUIで通常配布SB3の編集・再生・診断位置移動を確認し、GUIの更新が必要な場合だけ別差分でpinを更新します。
