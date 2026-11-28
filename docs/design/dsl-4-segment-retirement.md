# DSL 4.0 segment・publication manifest の廃止と include の正式化

状態: 実装済み（2026-11-28）。関連: [#773](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/773)
（not_planned で close 済み）、[#1160](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/1160) C 節。

## 1. 決定

- 作者向けの「章（segment）」を廃止した。DSL・ブロックの `gotoSegment`（「台本の区切り [SEGMENT] へ移る」）と
  `publication.json`（PublicationManifestV1）を削除した。
- 台本の分割は include、移動は `goto`、素材の読込・解放は scene 単位の asset lifecycle に一本化した。
- include を flag なしの正式な機能にした。entry source が top-level の `include` を宣言すれば合成し、
  宣言しなければ従来どおり単一 source として読む。

配布済みの publication 形式の作品と凍結済み SB3 は存在しないため、互換の読込経路は残していない。

## 2. 背景

publication は「長編を章ファイルに分け、章ごとに読み込む」ために #773 → #775 → #780 で導入した
（[Standard publication 導線](dsl-4-standard-publication.md)）。その後、次の仕組みで同じことができるようになった。

- **include（Source Graph）**: 複数の台本を1つの StoryDocument に合成する。sb3 内の埋め込み文書同士の include も
  `includeBlocks` で定義できる。
- **scene**: 合成後は全 scene が一つの名前空間にあり、`goto` でファイルをまたいで移れる。
- **scene 単位の asset lifecycle**: `loading`/`retention` により、単一台本でも素材を場面単位で読み込み・解放する。

segment 方式には固有の欠点もあった。章間で変数を引き継げない、`size` と `integrity` を手で管理する必要がある、
Editor のブロック台本の経路を通らない、の3点である。

## 3. 撤去したもの

| 区分             | 内容                                                                                                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DSL・ブロック    | Schema の `gotoSegmentAction`、core action manifest・codec・palette・dispatcher・controller の `gotoSegment` と、その結果型 `suspended`                                                                                                                          |
| publication 本体 | `publication-{manifest,loader,asset-loader,video-prefetch}.ts`、`platform/publication-{distribution,project,resident-budget,runtime-host,vm-stage,video-prefetch-resolver,stage-layout}.ts`、compiled publication 変換、`dsl4FormatVersions.publicationManifest` |
| 導線             | Standard app shell と runtime entry の publication host、フォルダ選択・監視の `publication.json` 検出、`bundleStorage.publication`                                                                                                                               |
| group 経路       | `group-preload-coordinator.ts`・`asset-group-lifecycle.ts`。publication の章 host だけが使っていた。runtime host の `publicationSegmentId`・`preparePublicationScene`、controller の `sceneCoordinator` 差し込み口と `assets.cleanup.error` も外した             |

ブロックアイコンのプレビューが使う VM stage archive は汎用の `platform/stage-archive.ts` に、stage の配置は
`fitDsl4Stage` に改名して残した。

## 4. include の正式化

- 判定は `src/dsl4/source-include-detection.ts` の `dsl4SourceDeclaresIncludes` に一本化した。build、asset audit/lock、
  Node と browser の preview がこれを使う。単一 source の台本は成果物に入る本文も preview の本文も変わらない。
- `resolveDsl4FeatureFlags` は外部の呼び出し側のために `dsl4SourceIncludes` を当面受理し、boolean であることだけを
  確かめて捨てる。CLI の `--enable-source-includes` も受理して無視する。
- graph の三上限は任意になった。省略時は `dsl4SourceGraphDefaultLimits`（64 files、4 MiB、depth 32）を使う。
- preview watcher は project root を再帰的に監視する。entry が `include` を宣言していない間は entry の変更だけで
  読み直し、宣言した時点から included source の変更にも反応する。
- preview の Source Graph 生成は manifest の cache identity を引き継ぐ。
- web preview shell は、include から合成された結果（`storyDocument.sourceOrigins` を持つ）だけを、asset live reload の
  ときに source candidate より先に素材を準備する。

## 5. 残務

- turbowarp-kamishibai-docs の作者向け文書に残る `gotoSegment` と `--enable-source-includes` の記述の更新。
- samples の script が渡す `dsl4SourceIncludes: true` の削除。その後、この app 側の受理も外せる。

## 6. ロールバック

この変更の revert。作品の形式は変えていないため、データの移行や後始末は要らない。
