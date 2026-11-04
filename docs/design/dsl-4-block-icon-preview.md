# ブロックアイコンからのプレビュー・配置編集

関連: [Issue #1100](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/1100)。

TurboWarp Plus EditorのExtension Data Editorに、既存フォームと同じ編集セッションを使うプレビューを併設する。プレビュー登録APIを持たないEditorでは従来のフォームを使用する。

## 操作

- asset アイコンをクリックすると、素材の画像表示や音声・動画の再生を既存フォームから確認できる。未保存の素材指定もプレビューに反映される。
- scene内のactionアイコンにマウスを合わせると、その位置の画面を静止画で確認する。マウスを離すと閉じる。
- sceneアイコンをクリックすると、その場面を再生する。場面の設定フォームも利用できる。
- show actorのアイコンをクリックすると、アクター本体をドラッグして座標、枠のボーダーをドラッグして表示スケールを変更する。
- moveToは移動先の座標・秒数・イージングを変更すると、変更後の下書きで移動を再生し直す。移動先はドラッグでも指定する。
- say / thinkは既存フォームの文章・表示時間・吹き出し設定を変更すると、変更後の下書きで吹き出しアニメーションを再生し直す。
- 保存するとブロックの引数へ反映する。キャンセルすると下書きを破棄する。再生・ドラッグ中に元のブロックやステージを書き換えない。

moveTo自体のDSLにはスケール引数がないため、拡大縮小はshowまたはsetSkinのスケールを持つブロックで設定する。プレビューのために台本の構文やactionの意味を追加しない。

文章と秒数を直接持つsayText/thinkTextのブロックも、固定入力フォームを変更すると即時に再生する。JSON設定を持つsay/thinkと、それぞれのブロック引数を保ったまま同じBubble実行経路を使用する。

## 接続と所有者

共通データエディターの`registerPreview`が、対象opcodeの既存フォームへプレビュー本体を追加する。フォームとプレビューは下書き・検証・保存・キャンセルの寿命を共有する。保存処理は既存フォームまたはfixed-inputのトランザクションを通し、数値・メニュー入力を直接書き換えない。

紙芝居側は現在のVMから作品を複製し、プレビュー対象のブロックにだけ下書きを適用する。描画には独立したVM・renderer・audio環境と既存の紙芝居runtimeを使う。編集用VMのアクター・背景・変数をプレビュー用に変更しない。

VMはEditorの`Scratch.gui.createPreviewVm()`で生成する。ホストが共有する拡張登録先を同期的な生成区間の前後で復元し、返却VMでは拡張読み込みを拒否する。プレビュー用コピーから命令列・拡張URL・監視項目を除く。このAPIがないEditorでは、既存VMのconstructorによる代替生成を行わず更新を案内する。

素材管理にもプレビューVMのruntimeを明示注入する。インストールされているAsset Cache 0.6.0に対する最小パッチを`patches/`に保持し、`pnpm-workspace.yaml`とlockで適用を固定する。パッチは描画・購読先の注入と所有する購読の解除だけを対象とし、依存先の別のアイコン変更は含めない。対応capabilityがないfactoryは呼び出す前に拒否する。

先頭から対象位置まで待機・音声を省略し、移動などの表示状態を即時に適用して再現する。前の場面の背景や変数も引き継ぐ。人の入力や独自アクションの結果が必要な経路は推測せず、再現できない理由を表示する。

名前付きYAML文書のschema-block viewでは、未保存の下書きを複数文書のincludeと合わせて読み取り専用で投影する。元の原文・view・VMを書き換えず、選択ブロックのIDと原文上の実行位置を対応付ける。変換できないviewを古い原文で代用せず、理由を表示する。

VMのJSON化ではブロックIDの最適化を無効にし、Editor上で選んだブロックと複製した台本の位置を一致させる。SB3の数値とBlocklyの数値文字列の差は共通エディターの固定入力契約で扱い、変更なし保存では元の値と型を維持する。

Teachable Machineは後続のbundle memberとして初期化されるため、登録時には参照せず、プレビュー開始時にruntimeを解決する。

設定変更時には前のプレビュー準備・再生を取り消し、最新の下書きだけを表示する。ホバー終了、ダイアログ終了、対象変更時に再生とリソースを解放する。

吹き出しの静止表示では文字送り・音・アニメーションを止め、全文と元の形・幅を保つ。動作プレビューでは元の設定を使う。画面の縮小はCanvasと吹き出し・動画のレイヤー全体へ同じ倍率で適用し、台本のviewport寸法とfitも保持する。広い画面ではフォームとプレビューを並べ、フォームのスクロール中もプレビューを保持する。

合成Bubbleスタイルの内部名に含まれていたNULがSVGのtitleを不正にする問題も修正した。内部名をXMLで使用できる文字へ変更し、台本・保存データのスタイルIDは維持する。この互換修正は編集用・再生用の両runtimeに含む。

## 導入と切戻し

asset のプレビューは、対応する Editor と編集用 runtime で既定 ON。場面・動作のプレビューは既定 OFF で、起動 URL の `twPlusBlockPreview=1` または読み込み前の `globalThis.TW_BLOCK_ICON_PREVIEWS = true` で有効化する。`src/dsl4/block-icon-preview-feature-flags.ts` が起動時に一度だけ設定を読む。編集用 runtime の authoring profile とプレビュー登録 API が必要。

asset のプレビューを切り戻すには、起動 URL に `twPlusBlockPreview=0` を指定するか、読み込み前に `globalThis.TW_BLOCK_ICON_PREVIEWS = false` を設定して Editor を再読み込みする。asset では起動前の真偽値を URL より優先する。場面・動作のプレビューを切り戻すには有効化指定を外して再読み込みする。コードを戻す場合は該当変更を revert し、元の YAML から編集用 SB3 を再生成する。

回帰確認では、プレビュー設定を指定せずに asset アイコンを開いてフォームと素材が表示されることを確認する。次に `twPlusBlockPreview=0` で開き直し、asset アイコンからフォームだけが開くことを確認する。場面・動作のプレビューは `twPlusBlockPreview=1` で確認する。

Asset Cacheの対応版を将来採用するときは、runtime注入と購読の検証を維持してパッチ指定・lock・パッチファイルを一組で外す。今回、依存パッケージやEditorのnpm公開・Pages配信は行わない。

## 依存パス・再生成

旧作業treeでは、インストール済みTeachable Machine 3.5.6の公開exportと異なる`dist/teachable-machine.js`を参照していたため、同版が公開する`dist/tm.js`へ修正した。起動・primitive・生成決定性の4件が一時hookなしで成功した。

PRは最新mainに合わせてTeachable Machine 4.1.0の固定依存を使う。同版では`dist/teachable-machine.js`と`dist/teachable-machine-webgpu.js`が公開exportであり、最新mainの正しい参照を維持する。旧版のパスを4.1.0へ持ち込まない。

凍結済みrc.76は書き換えず、rc.77のruntimeと新しいローカルSB3候補を生成・凍結する。push・PR作成はレビュー用のソースと生成記録のみで、npm・Release・Pagesへの配信は別の操作となる。

## 依存PR

- [Data Editor #94](https://github.com/kubohiroya/turbowarp-extension-data-editor/pull/94): 共通フォームと共有するpreview/hover API。
- [scratch-gui #79](https://github.com/kubohiroya/scratch-gui/pull/79): 共有dispatchを保持するVM生成。Data Editorの対応版を組み込んだEditorで利用する。
- [Asset Cache #32](https://github.com/kubohiroya/turbowarp-asset-cache/pull/32): runtime注入・所有購読解除。Appでは同じ変更を0.6.0のpnpm patchに固定して検証する。

各PRを個別にレビューできる。機能を有効にして利用するには、Data Editor対応版を組み込んだGUIの配布が必要。未対応APIのEditorでは従来フォームのままとなる。
