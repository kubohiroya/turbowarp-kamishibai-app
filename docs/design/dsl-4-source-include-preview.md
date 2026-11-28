# DSL 4.0 Source Graph Preview

## 1. 適用範囲

development previewは、entry sourceが`include`を宣言しているとき、entry sourceだけでなく`include`から到達する
全sourceを一つのimmutable generationとして扱います。flagやCLIの指定は要りません。宣言していないときは従来どおり
manifestが指す単一sourceだけを読み、entry以外のfileの変更では読み直しません。watcherはproject rootを再帰的に監視し、
entryが`include`を書き足した時点からincluded sourceの変更にも反応します。

新規sourceの推奨suffixは`.k4.yml`です。entry sourceは`project.source.yml`（`.yaml`／`.json`互換入力可）のroot-level basename、
included sourceはinclude元から解決されるproject内の相対pathで指定します。directory名やbasename本体は任意で、
`.k4.yml`で終わればSource Graphのsourceとして使用できます。既存projectとの互換性のため、従来suffixも
引き続き受理します。

## 2. generation境界

generation identityは、discovery order順の全`[logical source path, canonical source]`をSHA-256で
fingerprintした値です。composed sourceが同じでも、declarationを別sourceへ移動した場合はidentityが変わります。
diagnosticとStoryDocumentのsource originはlogical source pathを保持します。

Node local previewは次の全処理を二回行い、二つのidentityが一致した場合だけstageします。

1. entry sourceをbounded stable readする
2. project rootから脱出しない全included sourceを読み、cycle、file数、depth、合計byte数を検証する
3. Source Graph frontendで一つのcanonical StoryDocumentへcomposeする
4. validなStoryDocumentが参照する全local assetをbounded stable readする
5. source fingerprintとasset manifest fingerprintを一つのgeneration keyへ結合する

二回の取得中にsourceまたはassetが変化した場合は、有限timeout内でgeneration全体を取り直します。
途中状態、sourceだけ新しい状態、assetだけ新しい状態はprotocolへ公開しません。include flag ON時のNode watcherは
project rootをrecursiveに監視し、included source、asset、atomic replaceのいずれのeventでも同じ全体取得を開始します。

Browser Web Previewも全Source Graphを二回取得して一致を確認します。local asset live reloadがONの場合は、
asset pipelineのtransactionが`ready`または`active`になるまでsource candidateのprotocol stageを保留します。
File System Access APIのhandle、source本文、絶対machine pathはsession stateやdiagnosticへ保存しません。

## 3. 上限と失敗時の動作

Source Graph固有の三上限は任意で、省略時は`dsl4SourceGraphDefaultLimits`を使います。
source一ファイルの上限は共通CLIデフォルトを使用し、必要なら小さい値へoverrideします。`--enable-source-includes`は
既存のscriptのために受理しますが、効果はありません。

- `--max-source-files`: Source Graphのfile数上限
- `--max-total-source-bytes`: graph全source合計とcomposed canonical sourceの上限
- `--max-include-depth`: include depth上限
- asset一ファイル、file数、合計byte数は共通CLIデフォルトまたは明示override

missingまたはunstableなsource／assetは有限回retryします。timeout後もmissingならerror、変化し続ける場合は
`K4-PREVIEW-SOURCE-UNSTABLE` warningを一度publishし、現在実行中のgenerationは置換しません。cycle、path escape、
上限超過、duplicate declaration、schema／semantic errorはinvalid generationとしてstageし、既存runtimeを維持します。

## 4. rolloutとrollback

include はflagなしで全previewとbuildに入りました（[segment・publicationの廃止](dsl-4-segment-retirement.md)）。
production artifactへwatcherやbrowser handleを追加しません。includeを宣言しない台本の読み方と成果物は変わらないため、
既存projectの移行やdata cleanupは不要です。rollbackはこの変更のrevertです。
