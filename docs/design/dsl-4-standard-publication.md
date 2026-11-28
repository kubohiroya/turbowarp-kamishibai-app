# DSL 4.0 Standard publication導線と所有権

> **撤去済み（2026-11-28）**: segment・`gotoSegment`・`publication.json` と、ここで述べる publication の実装は削除した。台本の分割は include、移動は `goto` で行う。経緯は [segment・publication の廃止](dsl-4-segment-retirement.md) を参照。本書は当時の記録として残す。

関連Issueは[#773](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/773) → [#775](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/775) → [#780](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/780)。2026-10-23、ブランチ`feat/dsl4/standard-publication`、基準main `ce0f9a80`（#979）。未公開コミット`27dc2cea`へのローカル修正を記録する。検証後のユーザー指示によりローカルmainへSquash統合する。push・PR・GitHub上のmerge・package公開は行わず、公開済みrc.43は変更しない。DSLは4.0を維持し、有効化用URLやフラグを追加しない。Safariは対象外。

## 物語の進行をシナリオが所有する

複数台本は作者による構成・分割の単位である。再生画面には任意の章選択、前章・次章一覧、履歴移動、「章を開く」、その読込だけを取り消すボタンを設けない。`27dc2cea`で追加した章選択・Open・Cancel UIと、hostの任意章切替メソッド`transitionPublication`を撤去する。

章を移るには、作者がDSLの`gotoSegment`を記述する。manifestの`next`はその章から許可する遷移先であり、自動で実行する順序やユーザー向けリンクではない。章末でも`gotoSegment`がなければ物語を終了し、暗黙に次章へ進まない。配列上の前章、公開entry point、同一章という理由だけで途中移動を許可しない。Standard ownerは現在の章の`next`を検査する。loaderも前章・公開entry pointへの暗黙の途中移動を許可しない。`entryPoints`は初期読込の検証用であり、章選択UIには使わない。

主人公が時間を行き来する物語では、作者が戻り先の章を`next`に宣言し、シナリオから`gotoSegment`で移る。変数・世界の状態・演出の意味はシナリオが定める。システムは章移動を過去状態の復元として扱わない。現在の実装では各章の変数はその章の初期値から開始する。型付き変数の章間引継ぎは#773の残務であり、復元済みとは報告しない。

ユーザーによる過去状態の復元は、セーブポイントで保存したデータのロードに限定する。これは#771等で扱う別の状態復元契約であり、今回セーブ・ロード機能を実装したわけではない。既存の単一台本の履歴・前scene/action操作全体の整理は、この差分で完了したとは扱わない。章遷移命令の待機中は、next action / next scene・rehearsal skip・repositionでその命令を飛ばさず、停止・終了は受け付ける。

## 台本とブロック

```yaml
kamishibai: '4.0'
controls:
  keymaps:
    production:
      Space: navigation.nextAction
scenes:
  ending:
    - gotoSegment: chapter2
```

対応する公開ブロックは`gotoSegment`（`go to story segment [SEGMENT]`）で、DSLと同じ正規化・Schema・dispatcherを使う。構造化台本ブロックのruntime/bundle両形式で往復できる。`goto`は従来どおり同じ台本内のsceneを対象とし、意味を変更しない。`gotoSegment`はpublication hostを必要とし、単一台本hostでは能力検証で拒否する。

章内の条件分岐や入力選択で到達したsceneに`gotoSegment`を置けば、その選択に従って章が移る。manifestと各章のsource/componentを検証する際、すべての`gotoSegment`の宛先が、その章の`next`に含まれることを照合する。未宣言・不明な宛先は起動前に拒否する。公開ブロックも現在実行中のシナリオactionのcontextを使い、独立した章閲覧APIにはしない。

## 入力と配布

1. フォルダ直下に`publication.json`を置く。既存のPublicationManifestV1で各章の完全な`.k4.yml`等を参照し、`next`にシナリオが使う遷移先を宣言する。`source.entry`はmanifestからの相対path、`size`と`integrity`はcanonical化前のUTF-8 bytesを対象とする。[形式](dsl-4-publication-asset-groups.md#publicationmanifestv1)を参照。
2. Standard Editorの「プロジェクトを開く」でフォルダを選ぶかstageへdropする。manifestがあればpublicationとして検証・構成する。今回は全章source/componentを一括検証・同梱する。章内素材はその章ファイルのフォルダを基準に解決する。単一台本/watch経路を保持し、単一台本を新たに選ぶ際は、元SB3の古いpublicationとstage archiveを除く。
3. 再生を開始するとentry章が動き、`gotoSegment`へ到達した時だけ章が移る。候補の準備中も現章の表示・動画を保持する。進行中のactionが待機を所有し、候補成功前に後続actionを実行しない。
4. 「SB3を保存」は全章と起動用アーカイブを含む配布物の保存であり、プレイ状態やセーブポイントの保存ではない。保存したSB3をEditor / Playerへ読み込み、PackagerでHTMLにできる。保存・診断欄には章リストを置かない。

配布データは`extensionStorage.kubohiroyakamishibai4.publication`の`formatVersion: 1`（2026-10-24以降に作るものは章間でasset fileを共有する[`formatVersion: 2`](dsl-4-publication-asset-dedup.md)）、manifest、元の章source、章ごとの通常のsource/artifact/asset component、配布時の`stageArchive`である。単一台本componentもentry章として保持する（v2ではasset dataを除き、`assetFiles`を参照する）。章sourceは同梱offline providerを使うが、remote assetは既存providerがnetworkを使うため、全素材の完全offline配布を保証しない。

source合計は`maxTotalAssetBytes`、componentのシリアライズ合計はその2倍、起動アーカイブは64 MiB、保存時project.jsonは16 MiB、SB3全体の展開bytesは256 MiBを上限とする。manifestのsize/hash不一致・欠落章・不正DSL・component/source不一致・archive path逸脱を拒否する。Stage原本も起動アーカイブもない場合は衣装欠落をエラーにする。

## VM・実行・資源の所有権

各章は親hostにロード済みのVM / Renderer / AudioEngine / Storage / BitmapAdapterのconstructorから作る独立VM・canvas・audio engineを持つ。章VMは親の拡張を再帰ロードせず、Scratchのhatを起動しない。Stageの衣装・変数monitor・素材原本を引き継ぎ、台本controllerが進行を所有する。

1. 候補をhidden stageで作り、source/artifact/bundle・boot・初期scene groupを準備する。候補イベントとLoading/Busy/Cursorは共有画面へ出さない。
2. 停止・破棄のAbortSignalを確認し、同期commitで表示と入力を交換する。input接続失敗では候補を外して現章へ再接続する。loaderのcurrent更新はcommit成功後である。
3. commit時点で元の`gotoSegment`を完了させ、その後に旧host/VMを破棄する。元のactionが章遷移Promiseを待ち、旧hostのdisposeが同じactionを待つ循環を避ける。旧章の終了はpublication全体の終了として扱わず、新章の再生を開始する。
4. 再生全体を待つPromiseは章をまたいで維持し、最終章の終了で完了する。明示的な再生開始は新しい実行世代とPromiseを持ち、同じ章hostの古い開始結果も新しいrunを完了させない。停止は候補準備をabortし、遅れて準備完了しても新章を開始しない。
5. commit後の旧資源cleanup失敗は成功した遷移と区別する。既に公開した候補をrollback済みとは報告しない。

候補の準備失敗では旧章・変数・動画と入力ownerを維持し、診断欄へ失敗を表示する。`gotoSegment`は`retained`を返し、controllerはそのaction位置でpausedになる。失敗した命令をcommitせず、後続actionも実行せず、`runtime.fail`に伴う旧資源の全解放を起こさない。通常の継続処理による再開時は同じ命令を再試行する。章の一覧や別章への逃げ道は追加しない。

## group coordinatorと内部中断

publicationのasset lifecycleがscene coordinatorを提供し、controllerはそれを採用する。旧coordinatorと同じ資源を二重に管理しない。

- startupはloading素材を先に準備してからboot/sharedを取得する。scene準備中はcommit済みgroupを保持し、確定後に旧scene groupを外す。訪問済みstory-retainedとcrossfade BGMの保持を継承する。
- startupにもsceneにも保持したAbortControllerを使う。`cancel()`は両方に届き、停止・破棄時は部分取得分だけをrollbackして全cleanupを試す。ユーザー向けCancelボタンはない。provider/lifecycleは渡されたsignalに従って中断する。
- coordinatorはstartup/scene待機を`setLoading(true/false)`で囲む。成功・失敗・取消しでも非表示に戻す。commit済みhostはLoading/Busy/Cursorをshellへ転送し、hidden候補だけ抑制する。
- 動画はpublication共通adapterで同じbytes/MIMEのURLを共有する。各VMのleaseは独立し、不要動画のpause・src除去・decoder unload・描画破棄後にleaseを外す。最後のleaseでURLをrevokeする。

Packagerによる`costume.asset`等の破棄に備え、拡張・blockを除いた起動ZIPをbase64/SHA-256付きで保持する。起動アーカイブと全章componentは原本のownerであり、sceneのmaterialization purgeで解放したとは扱わない。

## 今回の受け入れ基準

- [x] 章選択・Open・Cancel UIと任意章切替host APIを撤去する。
- [x] DSL・公開ブロックの`gotoSegment`が同じ経路で実行され、`next`の明示リンクだけに従う。
- [x] 未宣言移動・暗黙の前章移動を拒否し、作者が明示した後方遷移は新しい章VMで実行する。
- [x] startup中断・古いpublicationの残留・連続startの結果混線・Loading欠落の4回帰を防ぐ。
- [x] 遷移失敗時に旧章・変数・動画を保持し、失敗した命令と後続命令をcommitしない。
- [x] シナリオ遷移中の停止と再開始、最後の章の終了・メニュー復帰が動作し、破棄時に待機や資源を残さない。
- [x] 生成runtime・設計文書を揃え、ローカル差分として保持する。

## 検証記録

今回の追加回帰は、startup中断signalと部分取得rollback、Loadingの成功/失敗時の表示解除、保存済みpublicationから単一台本を開く経路、同一hostへの連続start、候補失敗・中断・input rollback、シナリオ遷移と旧run解放の循環防止、章選択UI/APIの不在を対象とする。DSLとブロックの正規化・構造化台本の往復、明示next linkの検証、シナリオによる後方遷移、次action/sceneによる遷移命令skipの拒否も確認する。

対象13ファイルの回帰・接続・境界テストは219件成功。最初の対象実行の既存結果に、修正したhost境界と追加owner回帰の再実行結果を合わせた件数である。生成runtime profile整合性1件、build・型検査・対象lint/formatも成功。`verify:full`は実行しない。

Chrome製品版155.0.8059.86、独立profileの実ウィンドウでEditor / Player / Packager各2条件（成功・候補素材生成失敗）、計6条件・39確認が成功。fixtureは3章、実WebM・muted動画2領域、marker 7→8→9。ユーザーによる章選択なしでシナリオ内の`gotoSegment`が2回実行され、旧章の後続marker=99へ進まない。Shared URLの継続、scene group purge、最終章終了後のメニュー復帰、親VM停止後のstage/src/動画URL残留0、srcを残したURLのrevoke 0、Page error 0を確認した。候補失敗時は旧章の2動画とmarker=7を保持し、runtimeは`gotoSegment`の位置でpausedとなる。

Editor / Playerは公開Standard GUIの通常loaderへローカルSB3の応答だけを差し替え、拡張確認と緑旗から起動した。Packagerは同じSB3からローカルHTMLを生成した。公開物は変更していない。今回のSB3 SHA-256は`7d853a3c9a7b2082f79c8f63bbce09e32f9c39e905ca4df34c19dff867afab0d`。3画面から保存したSB3について全章manifest・シナリオ命令・起動ZIPのsize/SHA-256を照合し、成功した（今回の保存物の実画面再読込は未実施）。[新Chrome観測値](../testing/evidence/publication-scenario-20261023/chrome-results.json)・[新fixtureと保存物照合](../testing/evidence/publication-scenario-20261023/fixture.json)。

起動用素材の準備中断とLoading表示・解除は回帰テストで検証し、今回のブラウザ6条件の測定項目には加算しない。最初の検証では、既存の固定action件数・全命令fixtureを34命令へ更新し、単一台本hostの能力不足が例外になる契約にテストを合わせた。ブラウザの最初の確認では、EOF直後にも全URL解放を要求して失敗したが、再生停止・src除去と所有leaseの解放を分け、破棄時に全URL解放を確認する条件へ訂正した。EOF時点の0 URLという実装変更・保証は行っていない。

旧コミット`27dc2cea`ではChrome/Edge実ウィンドウのEditor / Player / Packager各7項目、計42確認、保存物3件の再読込、仕上げ後Packager7確認を実施した。これらは撤去前の章選択UIを使った旧実装の履歴であり、新しいシナリオ遷移の実画面検証に加算しない。[旧Chrome観測値](../testing/evidence/publication-20261023/chrome-results.json)・[旧Edge観測値](../testing/evidence/publication-20261023/edge-results.json)・[旧保存物再読込](../testing/evidence/publication-20261023/saved-reload-results.json)・[旧最終Packager](../testing/evidence/publication-20261023/final-packager-results.json)。

旧fixtureは実WebM・mutedの動画2領域、3章・各2sceneである。42確認時のSB3 SHA-256は`e8f599cf78c0b5f70c23a682234bbb4220714637f9ee2241209f76781f78f8c2`、旧最終候補は`3f9070886356b2ab5c9ec81b9244af8ca3047ebeef50143d70a1f679812deb7c`。[旧metadata](../testing/evidence/publication-20261023/final-fixture.json)。公開rc.43の親projectへ未公開runtimeを入れたローカル検証物であり、新しいリリースではない。

## ローカルmainへの統合

2026-10-23、修正を作業ブランチの`fb53ecdd`へコミットし、ローカルmainの`cc86d480`へSquash統合する。先行する反復・条件分岐の実装を保持する。runtime controllerは自動統合でき、競合したplayback runtimeは統合後のsourceから再生成した。共通runtime・startup・publication所有権・group・先行の反復/条件分岐・architectureの8ファイル187件、生成profile整合性1件、build・型検査が成功。先行の219件とChrome 6条件39確認は前提が維持された結果として保持し、統合後の実画面検証へは加算しない。[ローカル統合記録](../testing/evidence/publication-scenario-20261023/local-integration.json)。

push・PR作成・GitHub上のmerge・Issue更新・公開は行わない。GitHub上のmerge確認がないため、作業ブランチとworktreeは保持する。

## Asset groupの不整合修正（2026-10-23、ローカル作業）

関連Issueは#775・#780、基準はローカルmain `7cdb950c`、作業ブランチは
`codex/fix-asset-group-lifecycle`。今回の対象は、解放失敗時の追跡、commit後のcleanup診断、
`loading: eager`と`retention: scene`の両立の3件に限定する。DSL版・作者向け命令・フラグは追加しない。
Issue更新・push・PR作成・マージは行わず、次の公開時に転記できる記録をこの節に残す。

### 契約

- group managerは論理的な参照と未解放候補を分ける。解放処理を呼ぶ前に対象を記録し、成功するまで
  `snapshot().pendingReleaseAssetIds`へ残す。部分解放・rollbackの解放失敗も同じ扱いであり、参照数0は
  実資源0を意味しない。次の直列group操作またはdisposeで未所有の候補を再試行する。タイマーによる
  無限再試行は行わない。`releaseAssets`は一部または全てが既に解放済みのIDにも安全に呼べる契約とする。
- 未解放候補が再取得された場合は、部分解放の可能性があるため改めてprepareし、新しい所有権を確定した
  後は解放再試行の対象から外す。既存のcurrent groupと共有される素材をrollbackで解放しない。
- disposeは解放失敗時に完了扱いにしない。以後の新しいgroup取得は拒否するが、dispose自体は再試行できる。
  coordinatorも失敗したmanagerを新しい空managerへ置き換えず、明示的なreleaseまたは次のstartupで
  解放を再試行する。再試行の成功前に素材準備は始めない。失敗したstartup候補をpendingに残さず、
  破棄中・既に交換済みのmanagerに取消し後の所有権整理を実行しない。再試行も失敗した場合は失敗を返し、
  後続のrelease／startupを過去のcleanup Promiseの拒否状態へ固定しない。
- startupは要求を受け付けた時点のrelease待機とcleanup待機を固定する。後から取消し処理が追加した
  cleanupは、そのstartup自身の完了を待ち得るため、受付後の共有cleanupを改めて待たない。通常の連続起動、
  controllerによる停止を挟む連続start、解放失敗後の再起動でも、古い要求は終了し最新の要求が準備を完了する。
- embedded/remote lifecycleは有効なcacheと解放待ちの実resource handleを分ける。adapter.releaseの成功後に
  だけreleasedを確定し、失敗したhandleはcacheから外しても保持する。asset IDだけでなくhandle単位で追跡し、
  選択解放・全解放・中断後に遅れて返ったresourceのcleanupで再試行する。再取得時は古いhandleの解放を
  済ませてから新しいresourceを生成し、選択解放と全解放が同じhandleへ並行してreleaseしない。
  prepareは各待機の後に、全解放・個別解放・中断済みprepare・retired handle・cacheの状態を再確認する。
  旧prepareを待つ間に発生したcleanup失敗を飛ばして新resourceを生成しない。解放失敗中は再取得も失敗とし、
  障害解消後の再試行では旧handleを解放してから生成する。複数の再取得が重なっても同じcache entryを共有する。
- platform router・動画・media・Poseの各adapterも成功前に解放済みとしない。routerとPoseの並行releaseは
  実行中のPromiseへ合流する。mediaの登録解除とObject URL破棄は個別に成功を記録する。動画の最後のleaseで
  URL破棄が失敗した場合、そのURLは新しいleaseへ共有せず、古いleaseからの再試行が新しいURLへ影響しない。
- groupの`commitScene`は成功した所有権変更と`cleanupError`を分けて返す。controllerは初回scene・通常の
  scene遷移・再開の経路で`assets.cleanup.error`へscene IDとmessageを記録し、再生を継続する。
  成功した切替をrollback済みとは報告せず、このcleanup失敗だけで`runtime.fail`や全資源解放を起こさない。
  prepareの失敗や不正なcommitは従来どおり失敗として扱う。取消し後の所有権整理でもcleanup診断を分離し、
  後続queueを失敗状態へ固定しない。
- `startup` groupは起動時に準備すべきscene-retained素材と`boot`依存を持つ一時所有者である。起動準備は
  `eager`を尊重し、最初のscene commitで`startup`だけを外す。現在scene・共有表示が必要な素材は保持し、
  他は解放する。後のsceneから必要になれば再準備する。恒久的な`boot` groupへ入れて保持期間を延ばさない。
  Standard coordinatorと低レベルpublication asset loaderの両方がこの順序に従う。
- 低レベルpublication asset loaderも初回sceneのcleanupErrorをprepared segmentへ残す。
  publication loaderの`transition()`は候補の初回scene診断と旧章解放の診断を両方返し、二つあれば
  AggregateErrorへ集約する。候補のcurrentへの切替は維持する。Standard controllerはtrace、低レベルAPIは
  戻り値を診断の通知先とし、cleanupに失敗した資源が消えたとは扱わない。

### 受け入れ基準と検証記録

- [x] 解放前の例外・部分解放後の例外・rollback解放失敗を追跡し、後の操作／disposeで再解放できる。
- [x] dispose失敗後も追跡が残り、再試行の成功後にだけ新しいcoordinator sessionを開始できる。
- [x] 未解放素材の再取得後に、古い解放待ち処理が使用中素材を破棄しない。
- [x] 初回sceneと次sceneのcleanup失敗が診断となり、後続actionと再生完了まで進む。
- [x] eager・scene素材は起動時に準備され、初回commitで不要分を解放し、後の利用時に再準備される。
- [x] 実embedded lifecycleからadapterまで解放失敗を通し、同じhandleの再解放と実資源の残留0を確認する。
- [x] platform router・動画adapterを通るURL破棄失敗を再試行し、media・Poseの成功前の完了扱いも防ぐ。
- [x] release失敗→startup失敗→release再試行、および障害解消後のstartupによる自動再試行が成功する。
- [x] 通常起動時・解放再試行中に複数のstartup要求が重なっても待機が循環せず、最新要求だけが準備を完了する。
- [x] 初回sceneと旧章のcleanup失敗を同時に発生させ、成功した切替と二つの診断を保持する。
- [x] 中断済みprepareの完了前に複数の再取得を始め、旧cleanup失敗中は生成せず、成功後だけ新しい1件を生成する。

追加回帰の最初の実行では修正前の3ファイル32件のうち7件が失敗し、修正後は同じ32件が成功した。
その後、coordinator disposalの再試行と低レベルpublication起動の回帰を加え、関連8ファイル136件が成功した。
ただし、後続レビューで、実lifecycle／adapterの解放前の完了扱い、失敗後のstartupを挟むと復旧できないqueue、
初回sceneのcleanup診断の欠落を再現した。136件の成功だけでは今回の完了条件を満たさなかったため、
下位lifecycleとadapterを含む修正・回帰で完了記録を更新する。

レビュー指摘の回帰を追加した最初の実行では3ファイル27件中7件が失敗した。今回の再レビュー対応で13件を
追加し、修正後は関連15ファイル229件とbuild:lib・型検査が成功した。
実embedded lifecycle・platform router・動画adapterを通るURL破棄の再試行、
部分解放後の再試行、再取得前の旧handle解放、遅れて返った中断済みhandle、全解放と選択解放の合流、
controllerからの停止失敗後の再起動、再起動要求の競合、初回sceneと旧章の診断集約を含む。
既存の「解放失敗後の2回目を空振りの成功にする」テスト期待値も、adapterへ再試行を届ける契約へ訂正した。

今回は実lifecycle実装と模擬adapter／動画・描画fixtureを使った回帰であり、新規の実ブラウザ・実聴確認、
native decoder buffer/RSS/IndexedDB purgeの証明には加算しない。Safariは引き続き検証対象外。
playback runtimeを再生成し、authoring/playback profileの生成物整合性1件も成功した。関連回帰と合わせて230件。
変更した20個のTypeScriptファイルのlintと、文書を含む対象format、git diff --checkが成功した。
verify:fullは実行していない。

上記230件は前回の検証結果である。その後の再レビューでは、通常の連続startup／controller.startによる
cleanupの自己待機と、旧prepareの完了前に再取得を始めると旧cleanup失敗を飛ばす2条件を再現した。
前回のテストは解放再試行中の競合と旧prepare完了後の再取得を確認しており、この操作順は覆えていなかった。
今回、startupごとの待機対象固定と、prepareの各待機後の状態再確認を追加した。

今回の追加回帰は4件。通常の3連続startup、実動画lifecycleを使うcontrollerの2連続start、旧prepare完了前の
2つの再取得（旧cleanupが成功／失敗する2条件）を含む。最初の3ファイル40件では3件が失敗し、修正後は
同じ40件が成功した。失敗条件では旧handleだけを保持して新規生成を拒否し、障害解消後の再取得・最後の全解放で
fixtureの生存resourceが0になることを確認した。関連15ファイル233件と、再生成したauthoring/playback profileの
整合性1件が成功し、今回の最終結果は234件となる。build:lib・型検査・今回変更した5つのTypeScriptファイルのlint、
文書を含む対象format、git diff --checkも成功した。実ブラウザ・実聴の追加実行やverify:fullは行っていない。

運用ログ: `start` 3件の失敗条件を回帰化。`blocked` 初回型検査はbuildによるdist再生成との同時実行で
dist importを解決できなかったため、build後に直列で再実行。追加テストの引数型漏れを修正した。
`review` 初回136件では覆えていなかった3件を再現。`start` 下位owner・再起動・初回診断を修正。
前回の`done`は関連229件・生成profile1件の範囲であり、後続レビューで上記2条件の検証漏れを確認した。
`start` 2条件を回帰化し、通常の連続起動と待機中の再取得を修正。対象40件・build・型検査・対象lintが成功。
`done` 関連233件・生成profile1件・build・型検査・対象lint/format・diff検査が成功。今回指摘された2条件の
受け入れ基準を満たし、通常起動の競合と旧prepare完了前の再取得の完了記録を更新した。
外部Issueへの投稿・commit・push・PR作成・マージ・公開は行っていない。

ロールバックは基準`7cdb950c`からの今回のsource・test・文書・生成playback runtimeの差分だけを一緒に戻す。
既存のシナリオ主体の章遷移は維持する。公開済みrc.43と版付きartifactは変更しない。

## 公開準備（2026-10-23）

ユーザーから今回の修正・回帰テスト・設計文書のcommit/push/PR作成、CI・review成功後のSquash Mergeと
Issue #775・#780への結果・残務追記の指示を受けた。今回の24ファイルを`7f7f9312`へコミットした。
公開先は`kubohiroya/turbowarp-kamishibai-app`、head `codex/fix-asset-group-lifecycle`、base `main`。

fetchで確認したリモートmainは`a86b37dd`であり、前提となるシナリオ主体のStandard publication統合
`7cdb950c`がまだ含まれていなかった。そのためPR差分には、この前提実装とその検証記録も含まれる。
今回の修正24ファイルだけのPRにはならず、mainとの比較は67ファイルとなる。先行実装を含めた公開範囲を
最終文面と差分で確認するまで、push・PR作成・GitHub merge・Issue投稿は行わない。

mainの別作業による更新は保持して作業branchへ取り込み、競合した生成runtimeは統合後のsourceから再生成した。
既存の生成profileも同じsourceへ揃え、今回の機能にDSL版・有効化スイッチを追加しない。
初回統合検証は関連350件中349件成功・1件失敗。失敗はrenderer DOM disposal失敗時のURL解放を固定20回の
microtaskで判定する既存テストであり、条件付きの待機へ変更してhost66件の再実行が成功した。
URL全件破棄・DOM残留の検証内容は維持した。既存の通常／明示profileの生成整合性2件、build・型検査も成功した。
mainとの差分にある47個のTypeScriptファイルのlint/formatと、この文書のformat・diff検査も成功した。
この統合状態をローカルコミットへ保存し、公開範囲の確認待ちとして保持する。

npm/SB3/Pagesの新規公開は今回の対象にしない。今回の統合後の実画面・実聴確認は追加せず、先行のChrome
6条件39確認と実聴・autoplayの履歴を新規結果へ加算しない。#775・#780の全体DoDは残しOpenを維持する。
ロールバックは、今回のPRに含むsource・test・文書・生成runtimeを一括でrevertする。

## 残務とロールバック

- #773: 型付きpublication/segment変数の引継ぎ、publication cover、segment単位preview/build/live reload、CLI builder、実配布物のonline/hybrid/offline。セーブポイント保存データによる復元は#771等の別契約。任意章選択UIを残務には戻さない。
- #775: raw memory / IndexedDB / 原本bundleの寿命分離、byte budget・materialization LRU・cache prune、動画以外の全種dedup、AudioBuffer / Pose / GPU / カメラ・共通UI ownerの組合せ検証。
- #780: 新publication導線でのFirefox製品版、MP4、音声付きautoplayと背景planeは末尾の追試で確認済み。Firefoxの再検証はメジャーバージョンのリリース時だけとする。native decoder buffer/RSS/IndexedDB purgeの証明とURL数の観測を混同しない。過去の実聴・autoplay記録を維持し、新規の実聴には加算しない。#779可変viewport等も継続。Safariは対象外。
- 共通: 次回公開への反映。3 Issueの全体DoDは未完了でOpenを維持する。初期のローカル作業時は外部追記を行わなかったが、その後、前提統合を含む公開手順の承認を受けてPR #987を作成し、Issue #775・#780への検証結果・残務記録を進める。ローカルmainへの統合時は、先行して入った反復・条件分岐の実装を保持し、共通runtimeと生成物を検証する。

切戻しは今回のsource・Schema・ブロック・生成playback runtimeをまとめて戻す。未マージの修正を破棄する場合は`27dc2cea`との差分を対象とするが、撤去前の任意章選択UIが復活するため採用しない。既存の単一台本へ戻す場合は`27dc2cea`を含むpublication接続差分全体を戻す。公開済みrc.43と版付きartifactは上書きしない。

### PR #987の初回CIと契約fixtureの補正（2026-10-23）

初回CIは1573件成功・3件失敗。`gotoSegment`の実装とStandard契約fixtureのopcode一覧2箇所が不一致だったため、一覧と可視ブロック数を更新した。非embedded版の自動再読込テストでは、publication検出が扱う`NotFoundError`をテストのdirectory handleが通常の`Error`で返していた。実ブラウザのFile System Accessと同じ`DOMException`へ修正し、publicationを持たない通常のproject directoryが従来のwatchへ進む条件を既存の配布版統合テストで再検証する。production側のエラー判定や検証assertionは緩和しない。

補正後は契約2ファイルと配布版32件の計44件、directory helperを使うpreview source adapter17件が成功した。対象lint/format・型検査も成功。CIで再確認し、全体DoDの残務は維持する。

## 新publication導線の動画追試（2026-10-23）

PR #987のmain `57ebb09f`を基準に、Chrome / Firefox製品版 / Edgeの実ウィンドウで、
Editor / Player / Packager × WebM / MP4 × 操作後音声付き / 無操作消音 / 無操作音声付きの54条件・432確認が成功した。
scene group purge、シナリオの`gotoSegment`、共有URL、旧章VM・背景drawable/skin・停止後の動画解放を確認した。
無操作音声付き18条件はnative拒否・診断・cleanupの成功であり、autoplay許可や新規実聴の結果ではない。
詳細と証跡は[動画の実画面検証](dsl-4-video-validation.md#新publication導線の実画面追試2026-10-23)を参照する。

別の追加1試行でPackager保存バーとstage上端37.5 CSS pxの重なり、固定480×360のcanvasを確認した。
保存操作部の領域とpublication stageのviewport統合を表示残務として残す。native buffer / RSS / IDB・cache管理、
保存復元と次回公開への反映も継続し、上記54条件は未検証へ戻さない。Safariは対象外、Issue #780はOpenを維持する。
今回は検証用fixtureと記録のみを作成し、製品ソース・公開artifactを変更していない。

## publication保存バー・stage配置の修正（2026-10-23）

前節の表示残務をローカルで修正した。publication rootをstage viewportと保存・診断の2行に分け、
保存バーの高さを確保する。stageは残りの領域に4:3で中央配置し、論理480×360のcanvas・動画overlay・
背景描画を同じ倍率で拡縮する。pointer targetも同じ矩形とし、resize時に追従する。
端数CSS pxはcomputed sizeで扱い、ResizeObserverとresize listenerは候補失敗・破棄時に解除する。
保存操作のkeydown / keyup / pointerupは章への伝播を止め、buttonのnative Enter / Spaceを維持する。
自然終了で元のメニューへ戻るときはpublication rootも隠し、再開時に表示する。

Editor / Player / Packagerの実画面54条件・612確認が成功。保存ボタンのmouse / Enter / Spaceによる
SB3生成、stage座標、サイズ変更、動画purge・autoplay拒否、メニュー復帰と破棄を確認した。
保存バーとcanvasの重なりは37.5から0 CSS pxになった。関連55テスト・型検査・build・対象lint/formatも成功。
[詳細と証跡](dsl-4-video-validation.md#保存バーとstageの配置修正2026-10-23)を参照する。

ユーザー指示に従い、Firefox製品版の検証はメジャーバージョンのリリース時だけ実行する。
通常PR・CIには追加しない。方針変更前に完了した今回のFirefox 18条件は再利用し、追加実行しない。
通常の自動回帰はChromiumで行う。Safariは対象外を維持する。

修正は`codex/fix-publication-stage-layout`の未コミット差分で、公開rc.43・npm/SB3/Pagesは更新していない。
次回公開への反映、#775の資源寿命・cache管理、#771の保存復元、#779の全体viewport統合は残る。
切戻しは配置helper・host・VM factory・関連テストと3生成runtimeをまとめて戻す。
新規のフラグ・URLスイッチ・DSL版は追加しない。

### 公開手順への移行（2026-10-23）

ユーザーの指示により、上記の修正・回帰テスト・検証記録をcommit / push / PR化し、CIとレビューで
問題がなければSquash Mergeする。mainに先行したPR #988・#990・#991の物語制御統合とrc.44の凍結記録を
取り込み、改名されたDSL 4.0の生成profileへ配置修正を再生成する。公開済み・凍結済みartifactは上書きしない。
54条件の実画面記録は基準main `57ebb09f`と修正sourceの測定として保持し、統合後の追加実画面結果には数えない。
Firefoxはメジャーバージョンのリリース時だけ、Safariは対象外とする。

main `5b40af8b`の取り込みでは3生成runtimeだけが競合した。sourceは競合せず、mainの生成手順から
DSL 4.0の3profileを再生成して解消した。統合後に関連6ファイル52件と生成profile3件が成功し、
build・型検査・対象lintも成功した。配置helperとhost/VM factoryのsourceは実画面測定時から変更していない。
Chromium配置E2E 1件の既存成功結果を再利用し、Firefox・Safariは実行しない。
ローカルレビューでは配置・座標・入力伝播・候補失敗/破棄・メニュー復帰・生成profileと証跡を照合し、
追加の不具合指摘はなかった。GitHub CIと公開先のレビュー状態をPRで確認してからmergeする。

PR [#993](https://github.com/kubohiroya/turbowarp-kamishibai-app/pull/993)を作成し、
ブランチ保護の最新base条件に従って追加のrc.44公開記録（#992、main `078d571e`）も取り込んだ。
追加分は公開記録3ファイルだけであり、製品source・生成runtimeと測定結果は変わらない。
本差分のmain反映とCI・レビューの確定結果、公開後に残る作業はIssue #780へ記録する。

### #775のbytes/cache寿命調査と修正（2026-10-23、ローカル）

[アセットのbytes・cache・原本の寿命](dsl-4-asset-memory-lifetimes.md)に、既存実装・今回の原本解放修正・
回帰とChrome native IndexedDBの結果・未完了範囲を記録した。
scene/章のpurgeと、remote補助IDBのLRU/pruneと、再保存に必要な起動ZIP/全章原本は別寿命である。
今回も総常駐予算やnative buffer/RSS回収を保証せず、公開済みrc.46は変更しない。

追加レビューではcleanup callback同期再入（明示/自動releaseの成功/失敗）と、最後のread直後にdisposeされる
exportの競合を修正し、5回帰を追加した。関連81件・生成runtime整合性2件が成功し、既存exportの独立所有も維持する。
詳細と未完了範囲は上記の寿命設計書に記録する。今回の差分は未コミット・未公開である。

その後のabort通知経由の再入も、通知前に進行中Promiseを登録することで修正した。
成功・同期throw・非同期rejectの3回帰で合流・失敗時owner保持・後続の明示再試行を確認し、
関連84件・再生成runtime整合性2件が成功した。callback/export追補時の81件は前段階の結果である。

## 寿命管理修正の公開手順（2026-10-23）

上記の「未コミット・未公開」は実装・検証時点の記録である。ユーザーの公開指示により、
`codex/fix-asset-memory-budget`からmainへのPRで、寿命管理のsource・正式回帰・設計書・
Chrome native IndexedDBの証跡・3生成runtimeを公開する。
関連84件・生成runtime整合性2件と、再レビュー時の既存32件・一時診断4条件の成功結果を用い、
CIとレビューに問題がなければSquash Mergeする。Issue #775・#780全体のDoDは未完了でOpenを維持する。
KVS内部/上位ownerのcleanup再試行、全章/起動ZIPの総常駐予算、全ownerのmaterialization budget/LRU等は
継続残務であり、このPRの完了と区別する。Firefoxはメジャーリリース時のみ、Safariは対象外。
公開済みrc.46・npm/SB3/Pagesは変更しない。切戻しはPRのsource/test/docs/3生成runtimeを一式でrevertする。

## 解放再試行の後続修正（2026-10-23〜24）

[KVSからplatform session/runtime hostまでの解放再試行](dsl-4-session-cleanup-retry.md)に、
成立済みsessionの失敗owner保持・成功step非再実行・native IDBでの再試行結果を記録した。
上記のKVS内部/上位owner再試行の残務は、後続のKVS/App PRで進めている。
KVSは未公開ソースでの検証であり、公開済み0.2.0・通常npm依存への反映、作成途中のcleanup失敗、
外側ownerの統合等は引き続き残る。公開済みrc.46へ読み替えない。

## 通常npm経路への反映（2026-10-24）

上記の未公開KVSソースによる検証は当時の記録。KVS 0.2.1をnpmへ公開し、Appの依存/lockとruntime3種を更新した。
ローカルソースaliasを撤去して通常npm経路で検証済み。本PRでApp差分をmainへ統合し、新しいApp配布は別途行う。
結果・残務・切戻しは[session解放再試行の追補](dsl-4-session-cleanup-retry.md)を参照。
成立前cleanup失敗、publicationの外側owner、下位OPFS資源、全体budget/LRU等は引き続き残務とする。
