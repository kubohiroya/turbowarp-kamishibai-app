# DSL 4.0アセット配布プロファイル

## 1. 目的

DSL 4.0の物語上の意味と配布方法を分離し、同じ`StoryDocument`からonline／hybrid／offlineの
成果物を生成する。既存の`delivery`、`loading`、`retention`とremote cache／embedded binary
storeは変更せず、build前に既存の`AssetRef`へ解決する層だけを追加する。

この仕様はIssue #492の実装契約である。現在の実装では設定・lockfile・pure resolver、
network-free audit、allowlist付きlock生成command、content-addressed mirrorを作るvendor command、
`build-dsl4`の明示的なprofile接続を提供する。

## 2. 配布単位

profileはbuild時に解決する。一つのassetについて、生成成果物が使用するproviderは
`embedded`または`remote`の一つだけである。

- remote成果物のcache hitによるoffline再生は既存のverified IndexedDB cacheが担当する
- 初回からnetworkを使用しない成果物は`network: forbidden` profileで生成する
- remoteとembedded fallbackを一つの成果物へ二重格納しない
- runtimeが接続状態からprofileを暗黙選択しない

## 3. 三つの入力

### 3.1 StoryDocument

asset ID、kind、target、loading、retention、scene dependencyを保持する。既存YAMLの`file`、
project asset `name`、remote `source`はprimary providerになる。profileを使用しない既存buildでは、
従来どおりYAMLの`delivery`をそのまま使用する。

### 3.2 project.assets.json

作者が管理する配布設定である。機械可読schemaは
`schema/dsl-4-asset-config.schema.json`とする。

```json
{
  "formatVersion": 1,
  "profiles": {
    "online": {
      "network": "allowed",
      "defaultDelivery": "embedded",
      "kinds": {
        "sound": "remote",
        "recognitionModel": "remote"
      },
      "assets": {
        "OpeningNarration": "embedded"
      }
    },
    "offline": {
      "network": "forbidden",
      "defaultDelivery": "embedded"
    }
  },
  "providers": {
    "Narration": {
      "remote": {
        "url": "https://cdn.example.com/audio/narration.mp3"
      }
    }
  }
}
```

profileの解決優先順位は次で固定する。

1. `profiles.<profile>.assets.<assetId>`
2. `profiles.<profile>.kinds.<kind>`
3. `profiles.<profile>.defaultDelivery`
4. StoryDocumentの`delivery`

`providers`はprimary providerと異なるdeliveryのalternate providerを追加する。同じdeliveryに
異なるlocatorを指定してprimary providerを黙って上書きすることはできない。

embedded providerは次のどちらか一つを持つ。

- `file`: project-root-relativeのlocal fileまたはrecognitionModel directory
- `name`: base SB3内にすでに存在するproject asset

remote providerはcredentialとfragmentを持たないabsolute HTTPS URLだけを許可する。

### 3.3 project.assets.lock.json

toolが生成するcontent lockである。機械可読schemaは
`schema/dsl-4-asset-lock.schema.json`とする。asset ID順に正規化したJSONを使用し、timestamp、
absolute path、asset bytesを入れない。

```json
{
  "formatVersion": 1,
  "assets": {
    "Narration": {
      "kind": "sound",
      "contentIntegrity": "sha256-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "contentType": "audio/mpeg",
      "size": 12582912,
      "providers": {
        "embedded": {
          "file": "assets/narration.mp3"
        },
        "remote": {
          "url": "https://cdn.example.com/audio/narration.mp3",
          "transportIntegrity": "sha256-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          "contentType": "audio/mpeg",
          "size": 12582912
        }
      }
    }
  }
}
```

単一file assetではlogical contentとremote transportが同一byte列なので、integrity、Content-Type、
sizeの一致を必須にする。recognitionModelではlogical contentが展開後bundle、remote transportがarchiveで
あるため、両者のintegrityとsizeは異なってよい。lock生成とvendor実装がtrusted extractorで展開し、
canonical bundle digestへbindingする。

## 4. Pure resolver

`resolveDsl4AssetDistributionProfile`はfile／networkへ接続しない。次の順でfail-closedに解決する。

1. configとlockをstrictに検証しimmutableなcanonical objectへ正規化する
2. lockのasset ID集合とkindがStoryDocumentに完全一致することを確認する
3. StoryDocumentのprimary providerとconfigのalternate providerを結合する
4. lockのprovider集合とlocatorが宣言に完全一致することを確認する
5. 固定優先順位でassetごとのdeliveryを選ぶ
6. `network: forbidden`でremoteが選択された場合は拒否する
7. 選択providerを既存のembedded／remote AssetRefへ変換する

remoteへ解決したassetからlocal `file`／project `name`を除き、embeddedへ解決したassetからremote
`source`を除く。`loading`、`retention`、`target`等の物語上のmetadataは保持する。

resolverはprofile名、network policy、asset別content identityとproviderを含む
`canonicalResolution`を返す。後続のbuilderはこれをartifact fingerprintへ含める。

## 5. Network-free audit

`audit-dsl4-assets`は既存のsource manifest、config、lockを読み、選択profileをpure resolverで
解決する。HTTP request、remote asset取得、cache参照、file書き込みは行わない。

```bash
pnpm exec turbowarp-kamishibai audit-dsl4-assets \
  --project-root . \
  --source-manifest project.source.yaml \
  --asset-config project.assets.json \
  --asset-lock project.assets.lock.json \
  --asset-profile online \
  --max-source-manifest-bytes 16384 \
  --max-asset-config-bytes 65536 \
  --max-asset-lock-bytes 262144 \
  --format pretty
```

source includeを使うprojectは、entryが`include`を宣言していれば追加の指定なしに合成される。graphの上限を変えるときだけ次を指定する（省略時の既定値は下の値と同じ）。

```bash
  --max-source-files 64 \
  --max-total-source-bytes 4194304 \
  --max-include-depth 32
```

auditは次を返す。

- profile全体、embedded／remote、eager／lazy、kind別のasset数とlogical byte数
- remote transport byte数。recognitionModel archiveではlogical byte数と異なってよい
- startup、cover、actors、loading、pose recognition、preview controlの準備集合
- scene別のall／eager／lazy／scene-retained集合と容量
- 同一logical content hashを持つasset ID群と重複削減可能量
- remote選択が一件もない場合だけ`true`になる`offlineReady`

`offlineReady`は成果物の構造的判定であり、remote cacheが現在埋まっていることを意味しない。
config／lockはproject内のsymlinkでない`.json`通常file、source manifestはsymlinkでない`.yml`／`.yaml`／`.json`通常fileに限定し、個別byte上限の下で
二回読み取った内容とfile状態が一致した場合だけ採用する。JSON／pretty出力にはURL、providerのlocal
path、source本文、machine-local absolute pathを含めない。

主要4上限はCLIの有限デフォルト（source 256 KiB、単一asset 16 MiB、256 files、asset合計
128 MiB）を使用する。通常のcommand例では省略し、asset規模がデフォルトを超える場合だけ確認後に
対応する上限をoverrideする。

## 6. lock generation

`lock-dsl4-assets`は、sourceと作者設定からlocal／remote providerを検証し、canonical lockをatomicに
置換する唯一のnetwork使用コマンドである。remote providerはHTTPS、明示的なhost allowlist、timeout、
redirect数、asset単位・全体byte数の有限上限を満たす必要がある。redirect先もHTTPSとallowlistを再検証する。

recognitionModel archiveは既存のbounded trusted extractorで展開し、展開後file path／size／digestからlogical
bundle digestを作る。local fileとremote providerが同時にある場合、logical content integrity、Content-Type、
sizeが一致しなければ`K4-ASSET-CONTENT-MISMATCH-001`で拒否する。

project assetの`name`は既存SB3のbytesを参照できないため、remote alternateが無い場合はlock生成を拒否し、
推測値を書き込まない。

```bash
pnpm exec turbowarp-kamishibai lock-dsl4-assets \
  --project-root . \
  --source-manifest project.source.yaml \
  --asset-config project.assets.json \
  --output project.assets.lock.json \
  --allow-host cdn.example.com \
  --max-source-manifest-bytes 16384 \
  --timeout-ms 10000 \
  --max-redirects 3
```

既存lockはcandidateを検証してからatomicに置換し、source／config／remote検証の失敗では変更しない。

## 7. 診断

| code                            | 意味                                                    |
| ------------------------------- | ------------------------------------------------------- |
| `K4-ASSET-PROFILE-001`          | profile構造、profile名、overrideが不正                  |
| `K4-ASSET-PROVIDER-001`         | provider構造、locator、宣言の競合、選択provider欠落     |
| `K4-ASSET-LOCK-001`             | lock構造、version、asset集合、kind、locatorがstale      |
| `K4-ASSET-CONTENT-MISMATCH-001` | logical contentと単一file remote transportが不一致      |
| `K4-ASSET-OFFLINE-001`          | network禁止profileにremote assetが残る                  |
| `K4-ASSET-AUDIT-001`            | audit入力、byte集計、依存関係の不整合                   |
| `K4-ASSET-REMOTE-HOST-001`      | remote hostがallowlist外                                |
| `K4-ASSET-REMOTE-REDIRECT-001`  | HTTPS redirectまたはredirect上限が不正                  |
| `K4-ASSET-REMOTE-SIZE-001`      | remote responseが有限byte上限を超過                     |
| `K4-ASSET-ARCHIVE-001`          | recognitionModel archiveのtrusted extractionに失敗      |
| `K4-ASSET-VENDOR-INTEGRITY-001` | remote bytesがlockのtransport／logical identityと不一致 |
| `K4-ASSET-VENDOR-SIZE-001`      | vendorの総download byte上限を超過                       |
| `K4-ASSET-VENDOR-COUNT-001`     | vendorのfile／pose entry数上限を超過                    |
| `K4-ASSET-VENDOR-PATH-001`      | mirrorまたは出力先がproject root外                      |
| `K4-ASSET-VENDOR-OUTPUT-001`    | mirrorがsymlink、special file、または既存内容と不一致   |

診断へasset bytes、Base64本文、machine-local absolute pathを含めない。

## 8. 互換性とロールバック

- 新しいconfig／lockはprofile optionを指定した経路だけで読む
- 既存YAML schema、remote runtime、IndexedDB namespaceを変更しない
- profile resolverをbuildへ接続する前はruntime動作を一切変更しない
- 接続後もprofile optionを外せば従来のYAML `delivery`へ戻る
- unknown format versionはmigrationせず拒否する

## 9. Vendor生成

`vendor-dsl4-assets`は既存lockのremote providerだけを取得し、transport integrity、Content-Type、
sizeを再検証する。single-file assetはcontent integrityをディレクトリ名にした一つのlocal fileへ、
recognitionModelはtrusted extractorで展開した3ファイルbundleへ固定する。mirrorのrootにはlockのcanonical
digestを含めるため、別lockの生成物を上書きせず、同じ入力に対して再実行できる。

configとlockは作者入力を直接上書きせず、`--output-config`／`--output-lock`へ生成する。generated
configにはmirrorのembedded providerを追加し、generated lockにも同じrelative locatorを記録する。
各JSONはcandidate検証後にatomic置換し、mirror directoryはcandidateを検証してからatomic renameする。

```bash
pnpm exec turbowarp-kamishibai vendor-dsl4-assets \
  --project-root . \
  --asset-config project.assets.json \
  --asset-lock project.assets.lock.json \
  --output-config project.assets.offline.json \
  --output-lock project.assets.offline.lock.json \
  --vendor-dir .kamishibai/vendor/dsl4-assets \
  --allow-host cdn.example.com \
  --max-asset-config-bytes 65536 \
  --max-asset-lock-bytes 262144 \
  --timeout-ms 10000 \
  --max-redirects 3
```

vendorの失敗ではgenerated JSONを置換せず、既存のcontent-addressed mirrorも削除しない。mirrorを
利用するoffline buildではgenerated config／lockを選び、profileの`network: forbidden`を明示する。
buildは選択済みresolutionをruntime componentへ保存し、loaderがsourceのasset宣言と照合してから
resolved `StoryDocument`をruntime／asset bundleへ渡す。profileを指定しない既存buildではこのstorageを
削除し、従来のsource deliveryへ戻る。

```bash
pnpm exec turbowarp-kamishibai build-dsl4 \
  --base BASE.sb3 --project-root . \
  --source-manifest project.source.yaml --output dist/story.sb3 \
  --control-profile production --channel bundled \
  --asset-config project.assets.offline.json \
  --asset-lock project.assets.offline.lock.json \
  --asset-profile offline \
  --max-asset-config-bytes 65536 --max-asset-lock-bytes 262144
```

## 10. 後続実装

1. cold browser／空IndexedDB／fetch禁止のoffline smoke
