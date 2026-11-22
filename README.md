# TMPose紙芝居

**ポーズで進めるAIインタラクティブ紙芝居**

TMPose紙芝居は、TurboWarpとTMPoseを利用し、参加者がカメラの前でポーズを取ることで物語を進める紙芝居システムです。このリポジトリには、紙芝居アプリのソース、配布用SB3、公開ページ、および台本とアセットをSB3へ組み込むビルダーがあります。ドキュメントは専用の[`tmpose-kamishibai-docs`](https://github.com/kubohiroya/tmpose-kamishibai-docs)リポジトリで管理します。

## 使ってみる

- [現在公開中のWeb版](https://sqs.prof.cuc.ac.jp/kamishibai/)
- [GitHub Pages版](https://kubohiroya.github.io/tmpose-kamishibai/)
- [サンプル](https://kubohiroya.github.io/tmpose-kamishibai-samples/)

利用方法、台本の書式、利用できるコマンドについては[ドキュメントサイト](https://kubohiroya.github.io/tmpose-kamishibai-docs/)を参照してください。

## npmパッケージ

[`@kubohiroya/tmpose-kamishibai`](https://www.npmjs.com/package/@kubohiroya/tmpose-kamishibai)は、外部の画像・音声をベースSB3へ組み込み、台本の`asset=`行をプロジェクト内参照へ変換するCLIとJavaScript APIを提供します。

検証済みバージョンを固定して導入します。

```bash
pnpm add --save-exact @kubohiroya/tmpose-kamishibai@3.2.4
```

```bash
pnpm exec tmpose-kamishibai build-sb3 \
  --base kamishibai.sb3 \
  --script source.txt \
  --assets assets.lock.json \
  --output dist/_sample \
  --profile editor
```

API、アセットマニフェスト、安全設定、出力形式については[メンテナンスガイド](https://kubohiroya.github.io/tmpose-kamishibai-docs/developer-guides/developer-guide/)を参照してください。

## DSL 3.2の互換性

tmpose-kamishibai 3.2.xは、冒頭が`kamishibai=3.1`または`kamishibai=3.2`の台本を読み込めます。既存の3.1台本は冒頭を書き換えずに実行でき、新規の台本には`kamishibai=3.2`を推奨します。旧Text Asset構文はdeprecatedですが、移行期間中も表示・更新処理を含めて利用できます。

- `asset=NAME,text`
- `text=NAME:VALUE`
- `textStyle=NAME:PROPERTY:VALUE`
- `action=text:NAME:VALUE`
- 旧Text Assetを参照する`show`および`setSkin`

旧構文を含む台本では、プロジェクトごとに一度`LEGACY_TEXT_ASSET_DEPRECATED`警告を開発者コンソールへ出力しますが、実行は継続します。旧Text Assetは少なくとも3.2系列では維持し、削除する場合は将来のメジャーバージョンで事前に告知します。移行先は[`kubohiroya/turbowarp-svg-text`](https://github.com/kubohiroya/turbowarp-svg-text)です。この機能拡張を組み込んだ3.2プロジェクトでは、旧Text Assetと新しいSVG Textを同じ台本内で併用できます。新規の台本では、名前付きスタイルを共有するSVG Textを使用してください。アプリ自身のメニューやタイトルで使用する内部テキスト表示は、この警告の対象外です。

SVG Textは公開済みの`@kubohiroya/turbowarp-svg-text@0.17.0`を、スタイル付きの吹き出しは`@kubohiroya/turbowarp-bubble@0.21.0`を完全固定で利用します（3.2.4以降。3.2.3までは吹き出しもSVG Text 0.2.1が描いていました）。台本のシーン定義より前に、背景色、文字色、フォント、相対フォントサイズ、配置、吹き出し方向を名前付きスタイルとして定義します。吹き出し方向は、同じ名前のBubbleスタイルの配置になります。サイズ`100`は480×360ステージにおける標準14px相当で、ステージ寸法に比例して拡大・縮小します。

```text
svgTextStyle=title:#112233:#ffffff:Noto Sans JP:150:center:up
```

値の並びは`STYLE:BACKGROUND:TEXT_COLOR:FONT:SIZE:ALIGN:DIRECTION`です。`ALIGN`は`left`、`center`、`right`から指定します。`DIRECTION`の16方向は、`up`、`up-up-right`、`up-right`、`right-up-right`、`right`、`right-down-right`、`down-right`、`down-down-right`、`down`、`down-down-left`、`down-left`、`left-down-left`、`left`、`left-up-left`、`up-left`、`up-up-left`です。

方位エイリアスとして`north`、`northeast`、`east`、`southeast`、`south`、`southwest`、`west`、`northwest`の8方位と、`north-northeast`、`east-northeast`、`east-southeast`、`south-southeast`、`south-southwest`、`west-southwest`、`west-northwest`、`north-northwest`を含む16方位を指定できます。また、`0`以上`360`以下の数値と小数角度も指定できます。Scratchのスプライト方向と同じく`0`は上、`90`は右、`180`は下、`270`は左、`360`は`0`と同じ方向です。方向は吹き出しにだけ適用されます。

アクター自身をSVGテキストとして表示するには、アクションで文字列とスタイル名を指定します。文字列中のリテラル`\n`は改行になります。アニメーションは3.2系列の対象外です。

```text
action=Hero:setText:タイトル\nサブタイトル:title
```

アクターの`say`または`think`吹き出しへ名前付きスタイルを適用する場合は、表示秒数の後にスタイル名を指定します。

```text
svgTextStyle=baloonStyle:#ffffff:#222222:Noto Sans JP:120:left:up-right

action=Hero:say:こんにちは:5.0:baloonStyle
action=Hero:think:どうしよう……:5.0:baloonStyle
```

書式は`action=ACTOR:say|think:TEXT:SECONDS:STYLE`です。スタイル名を省略した従来の`action=Hero:say:こんにちは`および`action=Hero:say:こんにちは:5.0`は引き続き`default`スタイルを使用します。

## このリポジトリを開発する

### 必要な環境

- Node.js 22.12.0以上
- pnpm 11

### セットアップ

```bash
pnpm install
```

### 主なコマンド

| コマンド                                  | 内容                                            |
| ----------------------------------------- | ----------------------------------------------- |
| `pnpm run build`                          | 公開ページと配布用SB3を`dist/`へ生成            |
| `pnpm test`                               | SB3、ビルダー、公開ページをテスト               |
| `pnpm lint`                               | JavaScriptを検査                                |
| `pnpm typecheck`                          | ビルダーAPIを型検査                             |
| `pnpm sb3:build`                          | `app/`から編集用SB3を`tmp/kamishibai.sb3`へ生成 |
| `pnpm sb3:check`                          | `app/`のSB3ソースを検証                         |
| `pnpm sb3:import -- /path/to/project.sb3` | TurboWarpで編集したSB3を`app/`へ取り込み        |
| `pnpm run deploy`                         | ビルド結果をGitHub Pagesへ公開                  |

`pnpm sb3:*`は`devDependencies`へcommit固定した`@kubohiroya/sb3-toolchain`を使用します。
CIでも`pnpm sb3:check`を実行し、同じツールチェインで`app/`を検証します。

主な生成先は次のとおりです。

- `dist/`: GitHub Pagesへ公開する入口ページと配布用SB3
- `tmp/kamishibai.sb3`: TurboWarpで編集するためのSB3

## リポジトリ構成

- `app/`: 紙芝居SB3のGit管理上の正本
- `src/builder/`、`bin/`: npmで配布するビルダーAPIとCLI
- `site/`: 公開サイトの静的ファイル
- `scripts/`: 公開ページとSB3のビルド処理
- `test/`: 自動テストと最小検証用台本

## ドキュメント

一般向け、紙芝居DSL作成者向け、開発者向け、および体験会資料は、[公開ドキュメント一覧](https://kubohiroya.github.io/tmpose-kamishibai-docs/)から参照できます。原稿、図版、Vivliostyle設定は[`kubohiroya/tmpose-kamishibai-docs`](https://github.com/kubohiroya/tmpose-kamishibai-docs)で管理します。

実装前の設計レビュー資料として、[紙芝居DSL 4.0 設計レビュー草案](https://github.com/kubohiroya/tmpose-kamishibai/blob/main/docs/design/dsl-4-design.md)をこのリポジトリで管理します。

## 関連プロジェクト

- [`kubohiroya/sb3-toolchain`](https://github.com/kubohiroya/sb3-toolchain): このリポジトリで利用している、SB3の展開・検証・再構築・埋め込み拡張管理のためのツール
- [`kubohiroya/tmpose-kamishibai-samples`](https://github.com/kubohiroya/tmpose-kamishibai-samples): サンプル台本、スプライト、背景、画像、音声、組み込み済みSB3
- [`kubohiroya/tmpose-kamishibai-docs`](https://github.com/kubohiroya/tmpose-kamishibai-docs): 一般向け、DSL作成者向け、開発者向け、および体験会のドキュメント

## ライセンス

個別表示のない、本プロジェクトが著作権を持つソフトウェアおよび素材にはMPL-2.0を適用します。詳細と第三者著作物の扱いは[`LICENSES.md`](LICENSES.md)を参照してください。移設した文書のライセンスは文書リポジトリで管理します。
