# DSL 4.0 publicationの章間asset共有（publication formatVersion 2）

> **撤去済み（2026-11-28）**: segment・`gotoSegment`・`publication.json` と、ここで述べる publication の実装は削除した。台本の分割は include、移動は `goto` で行う。経緯は [segment・publication の廃止](dsl-4-segment-retirement.md) を参照。本書は当時の記録として残す。

関連: [#1008](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/1008)。
2026-10-24、基準main `b0b2f160`（[常駐予算](dsl-4-asset-owner-budget.md#publicationの常駐予算2026-10-24追補)、#1017）。
作業ブランチは`feat/dsl4/publication-asset-dedup`。

DSLは4.0のまま。新しい有効化スイッチは追加しない。Safariは対象外。公開済みのrc artifactは差し替えない。

## 問題

`extensionStorage.kubohiroyakamishibai4.publication.components[segmentId]`は、章ごとに通常のcomponentを保持する。
各componentのembedded asset bundle（`assets.files[]`）は、使用するfileのbase64（`data`）を章ごとに持つ。
N章が共有する素材は、memory上にもSB3（`project.json`）上にもN回保存される。常駐予算の`duplicateAssetBytes`がこの重複分を示していた。

さらに、publicationの外の単一台本component（`extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4`。以下「入口章component」）は、
入口章のcomponentをdata付きで丸ごと複製していた。3章のfixtureでは`project.json`の約29%（24,857 bytes中7,111 bytes、うちbase64が5,368 bytes）を占め、常駐予算にも数えていなかった。

## 保存形式の判断（ユーザー確認済み）

publicationの`formatVersion`を2に上げ、新しく作るpublicationはv2で書く。読込はv1とv2の両方を受け付ける。

```text
components.kubohiroyakamishibairuntime4   … 入口章component。publication.components[entrySegment]と同じ内容で、dataを持たない
publication (formatVersion 2)
├─ manifest / sources / stageArchive   … v1と同じ
├─ assetFiles: { "<sha256 integrity>": "<base64>" }   … 各fileを1回だけ保存
└─ components[segmentId].assets.files[]
     … assetId・path・size・integrity・encodingを保持し、dataだけを持たない
```

| 案                                   | 採否     | 理由                                                                                              |
| ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------- |
| v2へ上げ、v1も読む                   | **採用** | 旧版runtimeはv2を版エラー（`Unsupported publication project version`）で明確に拒否する            |
| v1のまま任意の`assetFiles`を追加     | 不採用   | 旧版runtimeはdataのないbundleを、版ではなく「bundleの破損」として遅れて拒否し、原因が分かりにくい |
| 保存形式を変えず、memory上だけで共有 | 不採用   | SB3上の重複が残り、`project.json`の16 MiB上限・配布サイズを改善しない                             |

互換性：

- rc.49以前が保存したv1のSB3は、そのまま開き、再生・配布できる。配布生成はv1をv2へ書き換えない（既存の保存物を変換しない）。
- 本変更後のEditorが新しく作るpublicationはv2。**rc.49以前のruntimeはv2のSB3を開けない**（版エラーで拒否）。公開済みartifactは変更しない。
- 単一台本だけのproject（publicationなし）のcomponentとembedded asset bundleの形式は変えない。
  dataの復元後のbundleは、v1で章ごとに保存していたbundleとbytes単位で同じである。
- v2の入口章componentは、`source`・`artifact`・`application`・fileのmetadataを保ち、`data`だけを持たない。
  publicationを知らない旧runtime（publication導入前）がこのprojectを開くと、入口章だけの単独再生ではなく、bundleの破損として拒否する。
  rc.49以前はv2をすでに版エラーで拒否するため、新たに失う互換はpublication導入前のruntimeの入口章単独再生だけである。

### 入口章componentの読み手（2026-10-24調査）

publicationを持つprojectで入口章componentを読む箇所と、使う部分は次のとおり。asset dataを使う読み手はない。

| 読み手                                                      | 使う部分                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| runtime entryの`packagedApplicationMode`                    | `application.mode`                                          |
| titleのカメラ表示判定（`packagedStoryUsesPoseRecognition`） | `source`                                                    |
| `createDsl4PackagedBinaryRuntimeBridge`                     | `assets.formatVersion`だけ                                  |
| `prepareDsl4EmbeddedBlockStoryProject`                      | 埋込ブロック台本がある場合だけ（publicationでは通らない）   |
| publication host・配布生成・章のVM stage                    | 使わない（章ごとに`publicationSegmentProject`で差し替える） |

project全体へ`loadDsl4RuntimeComponent`を適用する経路（preview・単一台本の配布生成）は、publicationのprojectを対象にしない。

入口章componentを消す案は、上の読み手をpublication側へ移す必要があり採用しない。入口章componentを正として`publication.components[entrySegment]`を省く案は、
他章と共有する素材が再び重複し、読み手の分岐も増えるため採用しない。

## 検証の順序

1. **開くとき**（`validateDsl4PublicationProject(project, …)`。publication host・配布生成・作成時の検証が使う）：常駐予算を章の解析より先に検査する。
   v2では、`assetFiles`の鍵がSRI（`sha256-…=`）で値が文字列であること、manifestの全章のbase64 fileが`data`を持たず`assetFiles`の鍵を参照すること、
   参照されない`assetFiles`がないこと、入口章component（両storage channel）のbase64 fileも`data`を持たず`assetFiles`を参照することを検査する。
   publicationだけを受け取る`validateDsl4ProjectPublication`は入口章componentを検査しない。
2. **使う前**（`publicationSegmentProject(project, component, assetFiles)`）：章のcomponentへ`data`を復元する。
   復元したbundleは、従来どおりcomponent loader（`validateDsl4EmbeddedAssetBundle`）が、bundle integrity、各fileのsizeとSHA-256を検証してから使う。
   `assetFiles`の値を差し替えても、その章の準備・配布生成で拒否される。開くときにはbytesを復号・hashしない（検証は従来どおり使用前の1回）。

## 常駐予算

`componentBytes`は、dataを除いたcomponent、`assetFiles`、v2の入口章componentの合計とする。上限（128 MiB）・合計上限は変えない。
`assetFiles`の分は`sharedAssetBytes`、入口章componentの分は`entryComponentBytes`としても報告する。v2では`duplicateAssetBytes`は0になる。
v1の入口章componentは、rc.49と同じく予算に数えない（既存の保存物を新たに拒否しない）。
作成時の上限（`maxTotalAssetBytes`の2倍）も、重複を除いた量で数える。

memory上では、publication snapshotが`assetFiles`を1回だけ保持する。章の準備ごとに、その章のcomponentへ`data`を復元した章projectを作る。
復元したbase64文字列は`assetFiles`の値と同じ文字列を参照する（JSの文字列は複製しない）。章projectは章の解放で手放す。
本変更ではmemory量の実測を行っていない。

## 検証

`test/dsl4-publication-project.test.ts`：

- 1つの素材を共有する3章のpublicationで、共有素材のbase64が保存データに1回だけ現れ、`duplicateAssetBytes`が0、
  `sharedAssetBytes`が4 file分になる。各章の復元componentがv1の保存内容と一致し、配布SB3もv2のまま`assetFiles`を保つ。
- 同じ内容をv1へ戻したpublicationを、検証・章の復元・配布生成でき、重複bytesが2回分と測定される。配布後もv1のまま。
- 参照先のない`assetFiles`、不要な`assetFiles`、v2のcomponentに残る`data`を開くときに拒否する。
  差し替えた`assetFiles`の値は、開く検査を通っても、使う前のintegrity検証で拒否される。
- 常駐予算の部分ごとの上限検査を、v1・v2の両方で行う。
- v2の入口章componentは`publication.components[entrySegment]`と一致し、dataを持たない。保存project全体でも共有素材のbase64は1回だけ現れる。
  `entryComponentBytes`が予算に数えられ、上限を1 byte下げると拒否する。dataを戻した入口章componentは開くときに拒否する。v1では`entryComponentBytes`が0。

全体では、3生成runtimeの再生成後に、full suite 195ファイル・1,677件、lint・format・型検査、`sb3:check`が成功した。実ブラウザでの再生確認は行っていない。

## ロールバック

source・回帰・本文書・3生成runtimeをまとめてrevertする。revert後のruntimeはv2のSB3を開けないため、
本変更後に作ったpublicationは、v1を書く版で作り直す。公開済みの同版artifactは差し替えない。
