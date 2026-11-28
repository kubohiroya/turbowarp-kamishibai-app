# DSL 4.0 ブロックパレットの統合（草案）

状態: 段階1を 4.0.25（#1213）、段階2を #1214、段階3を 4.0.27（#1215）で実装済み。2026-11-28。実装で決めたことは §10〜§13 に記録する。

## 1. 結論（提案）

- 「紙芝居の台本ブロック」拡張（`kubohiroyakamishibaiauthoring4`）を runtime 拡張（`kubohiroyakamishibairuntime4`）に吸収し、パレットを一つにする。
- パレットのグループは実装の都合ではなく、作者の作業の順に並べ直す（§5）。全体の表示名は「紙芝居」とする。
- 既存の SB3 は、同梱している旧拡張でそのまま開いて動く。runtime は当面、旧 opcode の台本ブロックも読む。新しいパレットへ移すには移行 CLI を使う（§6）。

## 2. 現状

| 拡張                             | 表示名                     | 中身                                                                                                         | 配り方                                                                                                                                         |
| -------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `kubohiroyakamishibairuntime4`   | Kamishibai DSL 4.0 Runtime | core action と1対1の命令、状態・診断 reporter、組込 YAML                                                     | 版を切ってリリースし、fingerprint で固定。Standard では composite `kubohiroyakamishibai4` の bundle メンバー                                   |
| `kubohiroyakamishibaiauthoring4` | 紙芝居の台本ブロック       | 紙芝居ハット、設定、取り込み、シーン、定義、作品の設定、ポーズの手順、もし・くりかえす、条件と値、詳しい指定 | SB3 に data URL で同梱。Plus カタログに8種類＋組込 YAML 用の変種（[dsl4-catalog-extensions.ts](../../src/builder/dsl4-catalog-extensions.ts)） |

グループの定義は [block-palette-i18n.ts](../../src/dsl4/block-palette-i18n.ts) の
`dsl4AuthoringPaletteGroups` と `dsl4RuntimePaletteGroups`。

## 3. 問題

1. **分け方が作者の意味と合わない。** 実際の分け目は「どちらの拡張が実装しているか」で、宣言か命令かでもない。
   - 宣言的なデータである組込 YAML が Runtime 側にある。
   - `pose` 命令の別表記であるポーズの手順（`poseSteps`/`poseStep`）が台本側にあり、`pose` と離れている。
   - 制御である もし・くりかえす が台本側に、`goto`・分岐が Runtime 側にある。
   - シーン（台本側）の中に命令（Runtime 側）を入れるので、1シーンを書くたびに2つのパレットを行き来する。
2. **名前が中身を表さない。** 「Kamishibai DSL 4.0 Runtime」は配布物の名前で、日本語の画面でも英語のまま。
   「紙芝居の台本ブロック」は、Runtime 側の命令も台本に使うので区別の手がかりにならない。
3. **分けた理由が弱くなっている。** 設計書の理由は「補助ブロックを変えても通常ランタイムの再リリースが要らない」
   （[structured-block-script.md](structured-block-script.md)）。しかし台本ブロックを読む codec は runtime に含まれ、
   読み方を変えれば runtime の版を切る。独立して変えられるのはブロック定義（見た目）だけで、その代わりに
   runtime の opcode 形式（`bundle`/`runtime`）と機能の組み合わせごとの変種を配り続けている。

## 4. 検討した案

| 案                                   | 内容                                                                | 解決                    | 費用・制約                                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. 名前だけ変える                    | 2つの表示名を中身の分かる名前に                                     | 問題2                   | 最小。移行不要                                                                                                                                                    |
| B. 拡張の間で移す                    | 組込 YAML を台本側へ、ポーズの手順・もし・くりかえすを Runtime 側へ | 問題1の一部             | 移したブロックの opcode 移行。パレットは2つのままで行き来は残る                                                                                                   |
| B'. 台本拡張を bundle メンバーにする | composite に台本拡張を加え、同じカテゴリに並べる                    | 見た目が1カテゴリになる | sb3-toolchain の bundle はグループ ID をメンバーごとに区切る（`componentId + '-' + groupId`）ため、別メンバーのグループへブロックを入れられない。配置のずれは残る |
| **C. 1つの拡張にまとめる**           | 台本ブロックを runtime 拡張に吸収し、作業別のグループに並べ直す     | 問題1〜3すべて          | 台本ブロック全部の opcode が変わる。§6 の互換と移行が要る                                                                                                         |

C を採る。B' のとおり、グループを自由に並べられるのは同じ拡張（同じ bundle メンバー）の中だけなので、
問題1を解くには統合が必要になる。

## 5. 統合後のグループ（案）

作者が台本を組み立てる順に並べる。「宣言」「命令」の区別はグループの中で色・形（ハット、C型、reporter）で表す。

| グループ       | ブロック                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------- |
| 骨組み         | 紙芝居、紙芝居の設定、ブロックを取り込む、シーン、この部分を使う、組込 YAML                     |
| 素材と登場人物 | 素材、登場人物、操作、文字の書式、変数                                                          |
| 作品の設定     | 表紙、読み込み画面、認識、表示領域                                                              |
| 舞台           | stage、transition、presentationEffect                                                           |
| 音             | bgm、stopBgm、setBgmVolume、sound                                                               |
| 音声・動画     | audio、audioControl、video、videoControl                                                        |
| セリフと文字   | say、think、setText、sayText、thinkText                                                         |
| 登場人物の表示 | show、hide、setTransparency など                                                                |
| 進行           | wait、goto、branch、broadcastMessageAndWait、もし、くりかえす、順番に                           |
| 条件と値       | 参照、台本の変数、比較、論理、ではない                                                          |
| 入力で移動     | keyInputToChangeScene、touchInputToChangeScene、poseInputToChangeScene、imageInputToChangeScene |
| ポーズ         | pose、ポーズの手順、ポーズ                                                                      |
| 台本の変数     | setVariable、changeVariable、toggleVariable                                                     |
| 進行の状態     | 状態 reporter                                                                                   |
| 詳しい指定     | 命令の追加設定、独自の命令                                                                      |
| 開発・診断     | debugger、診断 reporter、タイトル操作                                                           |

- 組込 YAML の低水準ブロック（`yamlMap`、`yamlKey` など）は「骨組み」の末尾、または折りたたみの別グループとする。
- 台本の宣言として読まれるブロック（ハット、シーン、定義、ポーズの手順、もし・くりかえす）を普通の Scratch
  スクリプトで実行した場合は、今の宣言ハットと同じく何もしない。必要なら診断を出す。

## 6. 互換と移行

**既存 SB3 はそのまま動く。** 台本拡張は SB3 に data URL で同梱されている（またはカタログの URL から読まれる）ので、
既存作品は旧拡張を読み込み、旧 opcode のブロックを表示できる。runtime の codec は旧 prefix
（`kubohiroyakamishibaiauthoring4_*`）と新 prefix の両方を読む。

**移行は明示的に行う。** 新しいパレットへ移したい作品は移行 CLI で変換する。前例は
`migrate-embedded-yaml`（[dsl4-embedded-yaml-migrate.ts](../../src/builder/dsl4-embedded-yaml-migrate.ts)）で、
同じ形で次を行う。

1. 全 target の旧 opcode を新 opcode に書き換える（入力名・shadow・mutation は保つ）。
2. `extensions` と `extensionURLs` から台本拡張を外す。
3. 保存し直した SB3 を読み戻し、台本の StoryDocument が変換前と一致することを確かめる。

Editor で開いた時に自動で移すかは §8 で決める。TurboWarp は登録されていない拡張のブロックを壊れた表示にするため、
自動化するなら、ブロックが描画される前の作品読み込みの段階で置き換える必要がある。

**配布物。** compiled 形式は台本の宣言スタックを消す（`removeDsl4BlockSourceDeclarations`）ので、
配布用の playback runtime には台本ブロックの定義を入れなくてよい。定義は authoring runtime の profile だけに入れ、
playback の bundle からは tree-shake する。

## 7. 段階計画

| 段階 | 内容                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | 前提の確定（§8）。segment・publication の撤去がマージされてから着手する（`block-palette-i18n.ts` などが重なる）                                        |
| 1    | runtime 拡張に台本ブロックの定義を移し、§5 のグループで並べる。codec を新旧 prefix 両対応にする。`author-block-dsl` と新規作成は1拡張だけの SB3 を作る |
| 2    | 移行 CLI と、その往復テスト（変換前後の StoryDocument 一致）                                                                                           |
| 3    | カタログの台本拡張の変種（8種類＋組込 YAML 用）を新規作成から外す。既存作品用に配信は続ける                                                            |
| 4    | 次のメジャー版で、旧 prefix の読み取りと台本拡張の配信を終える                                                                                         |

各段階で runtime が変わるので、版を切る（[docs/releases/README.md](../releases/README.md)）。

## 8. 未確定事項

- **Editor で開いた時の自動移行**: するか、CLI だけにするか。する場合、置き換えを置く場所（Plus-Editor の読み込み処理か、runtime の登録時か）。
- **samples の作品**: turbowarp-kamishibai-samples の scripts が `kamishibaiauthoring4` を参照している
  （block-diagnostic-fixture、build-urashima-dsl4、verify-* など8ファイル）。移行 CLI で作り直す範囲と時期。
- **docs リポジトリ**: turbowarp-kamishibai-docs のブロック台本の説明・画面写真の更新。
- **Plus-Editor**: 手元の turbowarp-plus-editor に台本拡張 ID の参照は見当たらない。組込 YAML のビュー、
  ブロックアイコンプレビュー（`block-icon-preview-editor.ts`、`block-icon-preview-location.ts`）など、
  この repo 内で拡張 ID を前提にしている箇所（`dsl4BlockAuthoringExtensionId` を使う約16ファイル）の扱い。
- **グループ構成**: §5 の並びと名前、組込 YAML の低水準ブロックの置き場所。
- **全体の表示名**: 「紙芝居」でよいか。bundle の `name`（[dsl4-downloadable-release.ts](../../scripts/sb3/dsl4-downloadable-release.ts)）と
  runtime の `getInfo().name` を揃える。

## 9. ロールバック

段階1〜3では旧拡張と旧 prefix の読み取りを残すため、差分を戻せば以前の2拡張構成に戻る。
移行 CLI で変換した作品は、逆変換（新 opcode → 旧 opcode と台本拡張の再同梱）で戻せるようにする。

## 10. 段階1の実装記録

- **opcode の3つの書き方**: 宣言ブロックは、旧台本拡張（`kubohiroyakamishibaiauthoring4_scene`）、runtime 単体
  （`kubohiroyakamishibairuntime4_scene`）、Standard bundle（`kubohiroyakamishibai4_kubohiroyakamishibairuntime4__scene`）
  のどれでも同じ宣言として読む。判定は [block-source-shared.ts](../../src/dsl4/block-source-shared.ts) の
  `dsl4AuthoringBlockName` / `canonicalizeDsl4AuthoringBlocks` に集め、codec は読み始めに旧拡張の綴りへ揃えてから比べる。
  名前の一覧（`dsl4AuthoringBlockNames`）は runtime の opcode と重ならないことを確かめた。
- **書き手の切り替え**: 土台の runtime が `// Kamishibai capabilities: unified-declarations-v1` を持つときだけ、宣言を
  runtime の opcode で書き、旧台本拡張を同梱しない。持たない古い土台には、従来どおり旧拡張を同梱して旧 opcode で書く。
  組込 YAML のビューは現行 runtime の中で動くので、常に新しい書き方で書き、旧拡張を足さない。
- **runtime の定義**: runtime 拡張の `getInfo()` が宣言ブロックを定義し、全プロファイル（authoring・playback）で
  受け付ける。宣言は実行しない（クリックしても何もしない）。編集フォームと「この部分を使う」の見た目は
  `installDsl4RuntimeDeclarationEditors` が runtime 単体と bundle の両方の綴りに登録する。4.0.25 では authoring
  プロファイルだけが登録していたが、§13 のとおり全プロファイルで登録するよう改めた。
- **「この部分を使う」の表示**: 旧拡張では CLI の `--block-sections true` で選んだ変種がパレット表示を決めていた。
  runtime では、読み込んだ作品に「この部分を使う」ブロックが既にあるときだけパレットに出す。古い土台へ書く場合は
  従来どおり CLI の指定に従う。
- **表示名**: パレット上の runtime の名前を「紙芝居」（英語 `Kamishibai`）にした。拡張ファイル先頭の `// Name:` と
  bundle の名前は、配布物の同一性の検査に使われているため変えていない。
- **グループ**: §5 の並びで `dsl4RuntimePaletteGroups` を作り直した。組込 YAML の4つの文書ハットは「台本の骨組み」に、
  低水準の YAML ブロックは最後の「YAMLの部品」に置いた。グループ ID が変わったものは、Plus の表示・非表示の設定が
  初期状態に戻る。

## 11. 段階2の実装記録（移行 CLI）

```sh
turbowarp-kamishibai migrate-block-palette --input OLD.sb3 --output NEW.sb3 [--report REPORT.json]
turbowarp-kamishibai migrate-block-palette --input NEW.sb3 --output OLD.sb3 --restore
```

- **変換**: 旧台本拡張の opcode で書かれた台本ブロックと「この部分を使う」のメニュー shadow を、作品の runtime の
  opcode（runtime 単体または Standard bundle）へ書き換え、`extensions`・`extensionURLs`・`extensionStorage`・
  Plus manifest から旧台本拡張を外す。既に runtime の opcode になっているブロックはそのまま残す。変換は
  [block-palette-migration.ts](../../src/dsl4/block-palette-migration.ts) の `unifyDsl4BlockPaletteProject`。
- **検証**: 変換の前後でブロックから読んだ台本（全ソースファイル）が一致すること、アーカイブの素材のバイト列と
  各 target のブロック以外のデータが変わらないことを確かめ、どれかが違えば何も書き出さない。
- **runtime の差し替え**: 作品の runtime が `unified-declarations-v1` を持たない場合は、現行の runtime に差し替える。
  旧 runtime が narrative 対応なら narrative authoring runtime、そうでなければ playback runtime を使う。Plus manifest
  が旧 runtime を固定している作品は、manifest を無効にしないよう変換を断り、先に標準形式で保存するよう案内する。
- **逆変換**: `--restore` は台本ブロックを旧台本拡張の opcode に戻し、作品の使い方（「この部分を使う」・narrative の
  有無）に合う旧台本拡張を同梱する。runtime は変えない。
- **出力**: 入力は変えない。出力とレポートが既にあれば断り、両方をまとめて置く（`migrate-embedded-yaml` と共通の
  [dsl4-migration-output.ts](../../src/builder/dsl4-migration-output.ts)）。
- **`migrate-embedded-yaml` との関係**: 組込 YAML への移行で差し替える runtime が統合後の版なら、同じ変換で旧台本
  拡張を外す。統合前の runtime（開発用の差し替えなど）の場合は、従来どおり旧台本拡張を作品の形式に合う変種へ
  作り直す。

## 12. 段階3の実装記録（カタログ）

- **一覧から外す手段がない**: TurboWarp Plus のカタログ（turbowarp-plus-packages の `extension-catalog`）は、
  `package.json` の `turbowarpExtension.catalog` に載せた拡張を、追加できる一覧に出し、そのバイト列を SHA-256 で
  信頼済みとして扱う。「信頼するが一覧には出さない」という項目はない。カタログから外すと、古い runtime を土台に
  作った作品の旧台本拡張も信頼されなくなるため、項目は残す。一覧から外す仕組みは turbowarp-plus-packages 側の
  課題として残す。
- **旧形式と明示する**: 代わりに、旧台本拡張の名前を `Kamishibai Block Script (legacy)`（日本語のパレット名は
  「紙芝居の台本ブロック（旧形式）」）にし、拡張ファイル先頭の説明で `migrate-block-palette` を案内する。一覧や
  セキュリティの確認画面でも、新しい作品に使うものではないことが分かる。
- **組込 YAML 用の変種を撤去**: 組込 YAML のビューは段階1から旧台本拡張を足さなくなったので、その変種
  （`embedded-yaml.js`）、生成スクリプト `generate-embedded-yaml-authoring-runtime.mjs` と生成物
  `src/dsl4/generated/embedded-yaml-authoring-runtime.js` を撤去した。カタログの変種は、古い土台へ書く8種類と
  `authored.js` の9つになった。カタログが信頼するのは公開した版のバイト列だけで、版ごとに先頭の `// Version:` が
  変わるため、以前の版で保存した作品の変種は撤去の前から信頼の対象ではない。
- **版**: 旧台本拡張の名前は runtime にも含まれる（runtime が台本ブロックの定義と日本語の表示文を共有する）ため、
  4.0.27 を切る。
- **段階4**: 旧 opcode の読み取りと旧台本拡張の配信を終えるのは、次のメジャー版で行う。

## 13. playback runtime の編集フォーム

- **問題**: 4.0.25 から台本ブロックの編集フォーム（素材などの JSON 入力、シーンの設定、ポーズの手順、セリフ、
  narrative の条件・行の表）は runtime が登録するようになったが、登録は authoring プロファイルだけだった。旧台本
  拡張は作品ごとに同梱され、どの runtime でもフォームを出していたので、playback runtime を積んだ作品を Editor で
  開くとフォームが出ない後退になっていた。`migrate-block-palette` が非 narrative の旧 runtime を playback runtime に
  差し替える場合も同じだった。
- **対応**: `installDsl4RuntimeDeclarationEditors` を全プロファイルで呼ぶ。Editor の外（Packager・Web Player）では
  `Scratch.gui.blockEditors` が無いので何も登録しない。
- **大きさ**: playback runtime は約 16.5 KB（gzip で約 7 KB、約 0.8%）大きくなる。フォームの JSON Schema は、playback runtime が台本の検証のために既に持っている DSL の Schema から作るので、増えるのは主にフォームを組み立てて登録するコードである。
  組込 YAML の編集用 Schema（`dsl-4-editor.schema.json`）は従来どおり authoring プロファイルだけが持つ。
