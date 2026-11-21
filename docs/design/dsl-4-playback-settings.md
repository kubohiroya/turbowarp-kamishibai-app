# DSL 4.0 再生設定画面

Copyright © 2026 Hiroya Kubo.

文書状態: Issue #1149 実装済み

## 1. 目的

作品を再生する人が変えられる設定を、一つの画面にまとめます。入口はタイトルの「設定 / Config」と、
再生中の Esc の二つです。台本の DSL と保存形式は変わりません。

## 2. 表示する項目

画面は、その作品で効く設定だけを出します。判定は正規化済みの台本から一度だけ行います
（`resolveDsl4PlaybackFeatures`、`src/dsl4/playback-features.ts`）。分岐や反復の中の action も数えます。

| 項目                      | 出す条件                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------ |
| ポーズ待ちのスキップ      | `pose`、`poseSequence`、`poseInputToChangeScene` のいずれかを使う                    |
| BGM のオン／オフと音量    | `bgm`、`stopBgm`、`setBgmVolume` のいずれかを使う                                    |
| 効果音のオン／オフと音量  | `sound`、`audio`、`audioControl`、または `recognition` の `idleSound`／`chargeSound` |
| カメラ、Teachable Machine | 上のポーズ系か `imageInputToChangeScene` を使う                                      |

物語を読み込む前のタイトル（Editor で最初に出るタイトル）は作品が分からないため、BGM と効果音だけを出します。

## 3. スキップ

初期値は台本の `recognition.navigation.allowSkip` です。スイッチで許可・禁止を上書きでき、
「台本の設定に戻す」で上書きを外せます。上書きは runtime controller が判定のたびに読むので
（`skipOverride`）、再生中に変えてもすぐ効きます。上書きはその作品だけのもので、保存せず、
別の作品を読み込むと台本の設定に戻ります。

## 4. 音量

BGM と効果音は独立したオン／オフと 0〜100 の音量を持ちます。台本が指定した音量やフェードはそのまま残し、
`createDsl4AudioMixer` がチャンネルの係数を掛けてから再生側へ渡します。スライダーを動かすと、
鳴っている音にもその場で反映します。

- BGM: crossfade platform の管理 BGM（`createAudioVoice`）
- 効果音: `sound` と ID 付きの `audio`（Asset Manager の `createAudioPlayback`）

音量の設定は端末ごとに `localStorage` の `kamishibai.playback.audio.v1` へ保存します。保存できない環境でも、
そのセッションの間は効きます。Scratch の SoundBank を使う旧経路の音は対象外です。

## 5. 再生中の一時停止

再生中に Esc を押すと、live reload と同じ quiesce で action の境界に止めてから画面を出します。
打ち切れる action は打ち切り、閉じるとその action を最初からやり直します（`replay-action`）。
最後まで実行する種類の action は、終わった次の境界で止まります。閉じると止めた位置から再開します。

Esc は window の keydown（capture）で受けるので、台本のキーマップより先に処理されます。
台本が Esc を独自に割り当てていても、再生中の Esc は設定画面を開きます。テキスト入力中と、
カメラ・計算方式・エラー表示などのダイアログにフォーカスがあるときは扱いません。
Web プレビュー（フォルダーから開いた台本）の再生は対象外です。

## 6. Dock（Tools）

Player と Packager では Editor のツールバーがないため、app-shell の Runtime controls Dock が常に
「Tools」を表示していました。設定画面が入口になったので、Editor のツールバーがない環境では Dock を
CSS で隠します。カメラの設定は Camera Source が Dock に登録したボタンを、Teachable Machine の計算方式は
既存のパネルを、設定画面から開きます。Editor では従来どおりツールバーのボタンも使えます。

## 7. 検証と切り戻し

単体テストは `test/dsl4-playback-settings.test.ts`、controller の上書きは
`test/dsl4-runtime-controller.test.ts`、host のミキサー接続は `test/dsl4-turbowarp-runtime-host.test.ts` です。
Chromium の通し確認（タイトルの設定、Esc での一時停止と同じ action からの再開、終演メニュー、Dock の非表示）は
`test/e2e/dsl4-web-preview-chromium.test.ts` にあります。

切り戻しは該当コミットの revert です。台本や作品ファイルの移行は要りません。保存済みの音量設定は残りますが、
古い版はそれを読みません。
