# DSL 4.0 debug execution契約

Copyright © 2026 Hiroya Kubo.

文書状態: Issue #541実装済み

## 1. 目的と適用範囲

外部YAMLを実行する非埋め込み Standard SB3のdevelopment runnerで、作者が台本の境界を確認できるようにします。
共通feature flag `dsl4Debugger`は起動時固定・既定OFFです。非埋め込みentrypointだけが
`dsl4NonEmbeddedDevelopmentFeatureFlags`によりONにし、`dsl4Runtime`、`dsl4AppShell`、
`dsl4WebPreviewAdapter`、`dsl4PreviewReloadOverlay`を同時に要求します。埋め込み作品SB3と
`dsl4StandardProductionFeatureFlags`はOFFのままです。

エディタ（TurboWarp-Plus-Editor など）で埋め込み作品を実行する authoring runtime も、§7 の
`dsl4EditorDebugger`で同じ`debugger`境界に停止します。配布用の playback runtime、packager、
Web Playerでは従来どおり no-op です。

## 2. YAML action

`debugger`はglobal core actionです。canonical syntaxはYAML nullを値にする引数なし形式だけです。

```yaml
scenes:
  opening:
    - stage: Intro
    - debugger:
    - wait: 1
```

`debugger: true`、`debugger: {}`、scalar、actor prefix、`stableId`はschema errorです。frontendは
`{command: "debugger", target: null, args: {}}`へ正規化します。debug executionが接続されていない
production runtimeではruntime portを呼ばず、副作用なしでcommitして次へ進みます。

ブロックで台本を書く場合は、場面の中に実行ランタイム拡張の`debugger`ブロックを置きます。
ブロックからYAMLへの変換で`debugger:`になり、YAMLからブロックへの変換でも同じブロックに戻ります。

## 3. 実行mode

設定dialogは次のsession-only modeを持ちます。

| mode          | 停止境界                                          | 既定 |
| ------------- | ------------------------------------------------- | ---- |
| `breakpoints` | `debugger` actionの実行直前だけ                   | Yes  |
| `step`        | command種別にかかわらず、すべてのactionの実行直前 | No   |

停止は`action.start` eventおよびruntime port dispatchより前です。Resumeは現在のactionを一回だけ実行します。
`step` modeなら、commit後に次のaction直前で再び停止します。`debugger`をstep実行で停止した場合のreasonは
`debugger`とし、source上の明示境界であることを失いません。

## 4. UIと保存境界

reload status buttonはdebug停止中に`Ⅱ`／`Debug`を表示し、設定dialogはmode、停止理由、scene ID、
1始まりのaction番号、commandとResume buttonを表示します。mode selectorとResumeはkeyboard操作および
dialogのfocus trapに含めます。自動停止時にdialogを開いたりfocusを奪ったりはしません。

mode、停止状態、scene／action、reason、revisionはmemory内のcoordinatorだけが所有します。YAML、
project manifest、SB3、runtime artifact、runtime variable、localStorageへ保存しません。既存storage key
`dsl4.preview.reload.anchor.v1`はoverlay位置だけを保持します。

## 5. cancel、reload、failure

runtime stop／disposeはactive actionの`AbortSignal`を通じてdebug停止をcancelします。live reloadが
step停止中のfinish-only actionへ到着した場合も、その停止をcancel-replay-safeとして扱い、cleanup完了後に
同じactionの`replay-action` tokenを発行します。新generationは共有coordinatorの現在modeを引き継ぎますが、
古い停止promiseや停止位置は引き継ぎません。

observerまたはUI errorはruntime実行意味を変更しません。coordinator契約違反だけをruntime failureとして
閉じ、productionではcoordinator自体を作らないためdebug UIや停止処理を検査しません。

## 6. 検証とrollback

schema／normalization、production no-op、breakpoint／step、Resume、abort、live reload quiesce、DOM mode
selector、停止表示、session-only storageをunit testで固定します。配布SB3はsource-composed extensionと
catalog hashを再生成し、embedded productionからdebug UIが到達不能であることをrelease testで確認します。

rollbackは非埋め込みentrypointの`dsl4Debugger=false`、または
`dsl4NonEmbeddedDevelopmentFeatureFlags`から同flagを外して再生成します。YAML上の`debugger`はno-opとして
安全に残せるため、project data migrationはありません。

## 7. エディタ上の埋め込み作品（`dsl4EditorDebugger`）

### 7.1 有効になる範囲

`dsl4EditorDebugger`は起動時固定・既定OFFで、どのprofileにも含めません。runtime拡張の
`restart()`が、`DSL4_AUTHORING_PROFILE`のbuildで、packaged binary runtimeでないときだけ
`dsl4StandardProductionFeatureFlags`へ足します。条件は`dsl4Runtime`と`dsl4AppShell`だけで、
preview overlayを要求しません。coordinatorと橋渡しはauthoring profile
（`scripts/sb3/dsl4-runtime-authoring-profile.ts`の`createEditorDebugExecution`）が作るため、
playback runtimeのbundleには含まれません。

### 7.2 TurboWarpデバッガーとの橋渡し

story actionはScratch threadではなくruntime controllerのpromiseとして進むため、Scratch VMを
止めるだけでは台本は止まりません。`src/dsl4/platform/turbowarp-debugger-bridge.ts`は次を行います。

1. coordinatorが`debugger`の直前で停止したら、TurboWarpデバッガーアドオンが拡張機能向けに
   登録する隠しブロック`sa-pause`を呼び、作品を一時停止させます。デバッガーのウィンドウが開き、
   時計が止まり、`RUNTIME_PAUSED`が出ます。
2. 停止位置（場面IDと1始まりのaction番号）と、その時点の物語変数を、デバッガーの「ログ」タブへ
   `log`ブロックで書き出します。
3. デバッガーで再開すると出る`RUNTIME_UNPAUSED`で、coordinatorを`resume()`します。

`sa-pause`が無い（アドオンが無効、またはplayer onlyで停止を拒んだ）場合は、再開する手段が無い
ため、停止せずにそのまま次へ進みます。runtime stop／disposeでは従来どおり`AbortSignal`で停止を
cancelし、橋渡しも破棄します。

### 7.3 変数ペインでの確認

runtime拡張のinstance（`runtime.ext_kubohiroyakamishibairuntime4`）は、authoring buildだけ
`getInspectorVariables()`を持ちます。TurboWarp-Plus-Editorの変数ペイン
（`@kubohiroya/turbowarp-plus-editor-sprite-panes`の`readTemporaryVariables`）はこれを読み、
背景の変数ペインに「台本の変数」の表を出し、デバッガーで一時停止している間だけ値を表示します。
物語変数はScratchの変数へ書き写さないため、作品の保存内容は変わりません。
