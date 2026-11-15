# DSL 4.0 feature flag inventory

追跡 Issue: [#794](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/794)（GA 前の flag 棚卸し）。gate: [#782](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/782)（4.0 GA release gate）。親 Epic: [#636](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/636)。

`src/dsl4/feature-flags.ts` の flag それぞれについて、**「出荷 profile で ON」か「意図して OFF」かを 1 行の根拠つきで確定させる。** 4.0 を正式版と呼ぶ前に、実装と test を伴ったまま暗転している在庫を無くすのが目的で、新機能の作業ではない。

## 判定基準

flag を ON にするかどうかは次の 1 点だけで決めている。

> **その capability が OFF のままだと、4.0 を正式版として説明したときに嘘になるか。**

「実装が済んでいるから」は ON の理由にならない。逆に、OFF が設計上の既定（作者が明示的に opt-in する種類の摘み）であれば、実装が完成していても OFF のままにする。

## 1. Standard production profile で ON — 13 個

`dsl4StandardProductionFeatureFlags`。Web Player、Packager、embedded Standard SB3 が共通で持つ。

| flag                                      | 根拠                                                           |
| ----------------------------------------- | -------------------------------------------------------------- |
| `dsl4Runtime`                             | runtime そのもの。他の全 capability の前提                     |
| `dsl4CrossfadeTransitions`                | scene 遷移の既定表現。OFF は素の切替になり作品の見た目が変わる |
| `dsl4AppShell`                            | title／menu／error 表示を持つ shell。OFF では上演の外枠が無い  |
| `dsl4PoseFeedbackModes`                   | pose 認識の feedback。Teachable Machine 連携作品の中心機能     |
| `dsl4SpeechAdvanceTypewriter`             | 台詞送り。OFF では全文が一度に出る                             |
| `dsl4TurboWarpActionSurface`              | core action の block palette。台本を block から駆動する入口    |
| `dsl4TurboWarpStateSurface`               | **読み取り専用の state surface。下記 §3 参照**                 |
| `dsl4ExpressionRuntimeState`              | **式評価への runtime state 供給。下記 §3 参照**                |
| `dsl4PosePreviewMirroring`                | **camera preview の左右反転。下記 §3.1 参照**                  |
| `dsl4CameraPreviewControls`               | **camera preview の操作 UI。下記 §3.1 参照**                   |
| `dsl4BroadcastMessageAndWait`             | **broadcast action。下記 §3.2 参照**                           |
| `dsl4TurboWarpBubbleAdvancedPresentation` | **bubble の reveal／audio／motion。下記 §3.2 参照**            |
| `dsl4IndexedDBAssetSessionStore`          | **binary-entry asset の session store。下記 §3.4 参照**        |

## 2. development profile で追加 ON — 4 個

`dsl4NonEmbeddedDevelopmentFeatureFlags` が §1 に足す。非 embedded Standard SB3（作者向け runner）専用で、出荷される作品には載らない。

| flag                           | 根拠                                 |
| ------------------------------ | ------------------------------------ |
| `dsl4WebPreviewAdapter`        | Web Preview の本体                   |
| `dsl4BrowserDistributionBuild` | browser 上での配布物 build           |
| `dsl4PreviewReloadOverlay`     | reload 状態の overlay 表示           |
| `dsl4Debugger`                 | debugger。作者向け runner だけが持つ |

## 2.1 呼び出し側だけで ON — 1 個

どの profile にも含めず、エディタで埋め込み作品を実行する authoring runtime（`DSL4_AUTHORING_PROFILE`、packager 以外）だけが、起動時に `dsl4StandardProductionFeatureFlags` へ足す。playback runtime の bundle からは、ON にするコードごと tree-shake される。

| flag                 | 根拠                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `dsl4EditorDebugger` | 台本の `debugger` action でエディタの TurboWarp デバッガーを一時停止させる。preview overlay を要求しない |

## 3. 今回 ON にした 7 個の根拠

`dsl4TurboWarpStateSurface` と `dsl4ExpressionRuntimeState` は **どちらも読み取り専用** で、台本の意味を変えない。story variable への**書き込み**は core action（`setVariable`／`changeVariable`／`toggleVariable`）が持つ（§3.3）。

OFF のままだと、実装済みの surface が出荷版で次のように死んでいた。

- `scripts/sb3/dsl4-runtime-extension-entry.ts` の `applicationStatusReporter` が常に `'ready'` を返す
- 同じく `canNavigateToPreviousAction`／`canNavigateToNextAction` が常に `false` を返す。action history が実装されているのに block からは到達不能
- `runtimeVariableSnapshot` が常に `null`

ON にすると、`createDsl4TurboWarpRuntimeVariableBlockSurface` の**読み取り 17 block** が palette に出る。`setStoryVariable`、`changeNumberStoryVariable`、`lastStoryVariableWriteAccepted` の 3 つは `writeVisible` 側なので出ない。

2 つを同一 PR で ON にしたのは選択ではなく制約で、`resolveDsl4FeatureFlags` が `dsl4ExpressionRuntimeState` に `dsl4TurboWarpStateSurface` を要求している。片方だけの PR は不変条件で落ちる。

### 3.1 pose preview mirroring と camera preview controls

`dsl4PosePreviewMirroring` は camera preview canvas の**左右反転だけ**を切り替える（`mirrored | unmirrored`）。recognition へ渡す frame の `flipHorizontal`、confidence、sequence／selection の判定は変更しない。`dsl4CameraPreviewControls` はその反転 button と camera menu を app shell の固定 renderer が描くかどうかを決める。

ON にした理由は、**schema が受理する記法が実行時に黙殺されていた**こと。`poseRecognition.preview.mirroring`、scene 単位の `posePreview.mirroring`、`preview.controls` はいずれも `schema/dsl-4.schema.json` が受理し、validation も通る。しかし flag が OFF だと `applyPosePreviewMirroring` が冒頭で return し、control asset は `excludedStartupAssetIds` で startup materialize から外れる。**診断は出ない。** 作者が書いた指定が警告なしに無効化される状態だった。

依存は揃っていた。`@kubohiroya/turbowarp-teachable-machine` 2.0.0 が `setPreviewMirroring`、`listCameraDevices`、`selectCamera`、`getCameraSelection`、`getActiveCamera`、`isCameraRunning` を提供し、`platform-asset-session.ts` が flag ON のとき port を組み、`turbowarp-runtime-host.ts` が配線する。`resolveDsl4FeatureFlags` にこの 2 flag の不変条件は無い。

**`dsl4PosePreviewMirroring` は runtime port の契約を変える。** `runtime-controller.ts:233` は fail closed で、flag ON なら port は `setPosePreviewMirroring` を必ず実装していなければ startup で TypeError になる。これは設計文書が意図した挙動（method 欠落時は fail closed）だが、Standard profile を使って**自前の port を渡す呼び出し側**は実装を迫られる。§1 の他の flag には無い性質なので、embedder 向けの release note に書く。

`dsl4CameraPreviewControls` 側に fail-closed の port 要求は無い。control は story 側の opt-in で、`preview.controls` を書かなければ DOM も上流 API も生成しない。

### 3.2 broadcast action と advanced Bubble style

`dsl4BroadcastMessageAndWait` は Scratch broadcast へ message を 1 つ送り、全 receiver の完了を待つ action。`dsl4TurboWarpBubbleAdvancedPresentation` は bubbleStyle の 5 key（`reveal`、`audio`、`showAnimation`、`hideAnimation`、`visibleAnimations`）を許可する。

**どちらも schema が正式に公開している記法**である。`broadcastMessageAndWaitAction` は action の `oneOf` に入っており、advanced な bubbleStyle key も `bubbleStyle` の properties に並んでいる。flag OFF ではそれらを書いた台本が起動時に拒否されるため、**schema が広告しているものを runtime が実行できない**状態だった。§3.1 の 2 つは黙殺、この 2 つは拒否という違いはあるが、作者から見た問題は同じ。

`dsl4BroadcastMessageAndWait` の OFF は `docs/design/dsl-4-migration.md` が 3.x からの手動移行先という位置づけを与えていたことに由来するが、それは設計上の好みであって技術的制約ではなかった。依存は `dsl4Runtime` だけで、ON にして落ちる test は 1 件も無かった。

`dsl4TurboWarpBubbleAdvancedPresentation` の据え置き理由は [#776](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/776)／[#777](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/777) との重なりだったが、重なるのは両 Issue の **GA 後区画**（audio ownership、typewriter と rich text の両立）であって GA ゲート区画（BGM 停止・音量、ruby）ではない。GA を止める理由にはならないと判断した。

### 3.3 story variable の書き込み（flag ごと畳んだ）

一度は `dsl4TurboWarpStoryVariableWrite` を profile へ入れたが、[#770](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/770) の core action を足すのに合わせて **flag ごと削除した。** その flag が公開していた `setStoryVariable`、`changeNumberStoryVariable`、`lastStoryVariableWriteAccepted` の 3 block も削除している。

理由は重複。core action は manifest の不変条件で必ず同名の visible block を持つため、`setVariable` を core action にすると同義の block が palette に 2 系統並ぶ。#770 が「ON にするか、core action の追加に伴い畳むか」を未決に残していたのはこの点で、**畳む方を選んだ。**

書き込みは `setVariable`、`changeVariable`、`toggleVariable` の core action が担う。runtime 契約（`queueVariableWrite`／`commitVariableWrites`）は変わっておらず、`set`／`change` に `toggle` を足しただけ。flag を持たないのは、これが capability の on/off ではなく **core DSL の一部**だから。

これで台本だけで変数を更新できるようになり、`docs/design/dsl-4-design.md` §1.2 のゼロブロック原則が変数について満たされた。

### 3.4 binary-entry asset の session store

**旧名は `dsl4SessionBinaryBacking`。** `backing` が jargon で、対象も範囲も名前から読めなかったため改名した。`dsl4DefaultFeatureFlags` は公開 export で `resolveDsl4FeatureFlags` は未知 key を投げるので、旧名を渡していた呼び出し側は `Unknown DSL 4.0 feature flag` で明示的に落ちる（黙って無視されない）。

binary-entry 経路の asset を、実行 session 専用の IndexedDB store へ載せるか、archive から毎回読み直すかを決める。`policy` は `prefer`／`required`／`disabled` で、ON 時の既定は `prefer`。

**両 mode のコストは非対称。**

|                | direct                                                     | session                                                            |
| -------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| 1 回の read    | archive から読んで展開し、**全 bytes に SHA-256 を再計算** | metadata 比較のみ（namespace／name／integrity 文字列／size／path） |
| 並行性         | provider 全体が直列（`K4-ASSET-ENTRY-BUSY-001`）           | 充填後は store 依存                                                |
| archive の寿命 | dispose まで保持し続ける                                   | 充填と read-back 検証の後に解放                                    |

`binary-entry-provider.ts` の comment が意図を明言している — 「Direct runtime backing uses the same validation path without consuming the asset **so a released scene can materialize it again**」。つまり scene を解放して再入場するたび、direct は inflate と全 SHA-256 をやり直す。§3 で action history の後戻りを可視化した以上、再入場は一級の操作になった。

ON にしても IndexedDB への hard dependency は生まれない。`prefer` は失敗時に `KVS_SESSION_BINARY_DIRECT_FALLBACK` を警告して direct へ落ちる。hard dependency は `required` を明示した場合だけ。

**注意: この flag は Packager 経路では profile 値が使われない。** `scripts/sb3/dsl4-runtime-extension-entry.ts` が `binaryRuntime.sessionBackingEnabled` で上書きし、その値は `resolveDsl4PackagerSessionPolicy(surface)` が surface ごとに決めている。

| Packager surface              | policy                   |
| ----------------------------- | ------------------------ |
| `plain-html`、`zip-one-asset` | `prefer`（session 有効） |
| `zip`、`electron`             | `disabled`（direct）     |

したがって **出荷済みの Packager 成果物では plain-html と zip-one-asset がすでに session store を使っている。** #794 の「どの出荷 profile でも ON にならない 10 個」という前提は、この flag については正確ではなかった。profile 値が効くのは、embedder が自前の `binaryEntryProvider` を渡して host を組む場合。今回 ON にしたのはその既定を direct から prefer へ変えるため。

### 3.5 既知の粗さ

`runtime-controller.ts:358` の advanced Bubble style 拒否は、素の `TypeError` で **K4 診断 code を持たない**。同じ種類の拒否である `K4-RUNTIME-BROADCAST-FLAG-001` とは品質が揃っていない。Standard profile では両 flag が ON になったのでこの経路は出荷版では通らないが、flag を OFF にした独自 composition では今も code 無しで落ちる。

### 3.6 SB3 candidate hash

`scripts/sb3/dsl4-runtime-extension-entry.ts:298` が `resolveDsl4FeatureFlags(dsl4StandardProductionFeatureFlags)` を読むため、この profile を変えると release source が変わる。今回 `4.0.0-rc.12` の candidate を `2424468c…` から `bff2f140…` へ更新した。

**development profile も同じく hash を動かす。** `scripts/sb3/dsl4-runtime-authoring-profile.ts` が `dsl4NonEmbeddedDevelopmentFeatureFlags` を読み、それが同じ SB3 へ入るため。実測で確認済み。つまり **flag を profile へ入れる PR は、production／development のどちらであっても candidate hash の更新を伴う。**

## 4. 意図して OFF — 3 個

実装と test は在るが、出荷 profile では ON にしない。理由は flag ごとに異なる。

### 4.1 作者向けの DSL surface を持たない — 1 個

| flag                               | 根拠                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `structuredDataIntegrationEnabled` | `docs/design/dsl-4-iterator-jsonpath.md` が Kamishibai 内部統合を Standalone 有効化と分けて既定 OFF と規定 |

### 4.2 development profile 候補 — 1 個

| flag                            | 根拠                                                                                                                                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dsl4WebPreviewAssetLiveReload` | preview 専用で、出荷される作品の意味に影響しない。contract fixture（`test/fixtures/dsl4/asset-live-reload-contract.json`）と rollback 手順が揃っている。`dsl4NonEmbeddedDevelopmentFeatureFlags` へ入れるかを別 PR で判断する |

### 4.3 動画の実験機能 — 1 個

`dsl4Video` は既定 OFF。`dsl4Runtime` を必要とし、起動時に呼び出し側が明示的に有効化する。
矩形動画領域と ID による再生制御の契約・検証・ロールバックは [動画仕様](dsl-4-video.md) を参照。
追跡は [#780](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/780)。Standard profile の既定 ON 化は行わない。

## 5. profile ではなく呼び出し側で ON — 1 個

`dsl4SourceIncludes` はどの profile にも入っておらず、builder／CLI／preview の 7 箇所が `{dsl4Runtime: true, dsl4SourceIncludes: true}` と直に立てている（`src/builder/dsl4-build.ts`、`dsl4-asset-lock.ts`、`dsl4-block-source-export.ts`、`dsl4-asset-audit.ts`、`cli.ts` の 2 箇所、`src/dsl4/preview-source-graph-generation.ts`）。

これは **意図的にこの形のままにする。** include 解決は build 経路の capability であって、runtime の上演 capability ではない。production profile へ入れると、include を使わない上演 session にも立ってしまう。

## 6. 解消した乖離

`docs/design/dsl-4-surface.md:842` の表は Web player の適用条件を「build/startup で `dsl4PosePreviewMirroring=true`」と書いていたが、その条件を満たす profile が存在しなかった。**§3.1 で production profile へ入れたので、この行は実態と一致した。**

同じ表の他 3 行（通常 TurboWarp editor、Packager、development preview）は「起動時 flag が ON の場合だけ」という条件文で、Standard profile が ON になったことで満たされる。

なお `standard-app-shell.ts:20` は `webPlayer`／`regularEditor`／`packager`／`developmentPreview` の 4 surface を受理値として持つが、**出荷経路で実際に渡されるのは `packager` と `regularEditor` の 2 つだけ**で、`webPlayer` は test と fixture にしか現れない（`scripts/sb3/dsl4-runtime-extension-entry.ts:1288` が唯一の production 呼び出し）。flag は surface 非依存の起動時固定値なので上の表の意味は保たれるが、surface ごとに条件を変えたくなった時点でこの構造を見直す必要がある。

## 編集用パレットの明示 opt-in

`sourceSections`はruntimeの実行フラグではなく、生成する編集用SB3の「この部分を使う」ブロックを
パレットへ表示する起動時設定です。既定false、CLIの`--block-sections true`で有効化します。
読み取り場所は`src/dsl4/structured-block-source.ts`の`dsl4BlockAuthoringDefaultFeatureFlags`です。
既存の台本と保存済みブロックの読取互換性を保ち、falseに戻すと新規生成時のパレットで非表示にします。

## 物語の反復と条件分岐（4.0 RC改訂・未配布）

[Issue #980の仕様](dsl-4-narrative-control.md)で、4.0 RCのif／repeat／forEachと型付き行参照を定めます。
公開rc.43の機能ではありません。既存4.0の意味を維持し、既定OFFで段階実装します。

`dsl4NarrativeControl`は`src/dsl4/feature-flags.ts`のグローバル既定falseを維持します。Issue #989のrc.44でStandard production／development profileはtrueへ昇格します。
通常CLIと対応frontend／runtimeへ同じ起動時設定を伝達し、低水準APIの明示false・CLIの`--no-narrative-control`で拒否を確認できます。
公開前の回帰結果と、台本・SB3・公開導線を揃えてrc.43へ戻す手順は[専用仕様](dsl-4-narrative-control.md)を参照してください。
