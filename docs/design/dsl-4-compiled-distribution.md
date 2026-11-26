# DSL 4.0 compiled distribution profile

関連: [#781](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/781)（親 [#636](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/636)）。
2026-10-24、基準main `b0b2f160`、作業ブランチ `feat/dsl4/compiled-artifact`。

DSLは4.0のまま。authoring sourceの書き方は変えず、配布artifactの形式だけを足す。Safariは対象外。
#781のうち`compiled`を実装した。`sealed`（パスワードによる暗号化）とpublisher signatureは、いったん実装した後に撤去した（下の「撤去したもの」）。

## Distribution profile

| profile    | SB3に入るもの                                       | 状態                             |
| ---------- | --------------------------------------------------- | -------------------------------- |
| `source`   | YAMLのsource descriptor（従来どおり。既定）         | 既存                             |
| `compiled` | 検証済みのStory IRだけ。YAML・作者用のhatは入らない | 今回                             |
| `sealed`   | （撤去）パスワードで暗号化したもの                  | rc.51〜rc.55で提供し、その後撤去 |

選び方:

- CLI: `build-dsl4 --distribution-profile compiled`（API: `buildDsl4RuntimeComponent({distributionProfile: 'compiled'})`）。
- Standardアプリ（単一story）: メニューの「YAMLなしで配布用SB3を作る」（Build distribution SB3 without YAML）。
  「配布用SB3を作る」と同じ行に並び、表示・有効/無効・進行表示を共有する（API: `createDsl4BrowserDistributionSb3({distributionProfile: 'compiled'})`）。
- Standardアプリ（複数章）: 「Save SB3 without YAML / YAMLなしでSB3を保存」ボタン。すでにcompiledのpublicationでは表示しない。
  既定は`source`で、既存のビルド・SB3・Playerの挙動は変わらない。

### feature flagを足さない理由

#781の本文は`dsl4CompiledArtifact` flagを想定していたが、追加しない。#775と同じ方針（新しい有効化スイッチを追加しない）に揃えた。
profileはビルドの出力形式として明示的に選ぶもので、runtimeはSB3に入っている形式（`source`か`compiled`か）を読んで判別する。
既存のartifactは形式が変わらないため、flagで守る対象がない。切戻しは`source`でビルドし直せばよい。

## Compiled story artifact（`compiled-story-artifact.ts`）

`dsl4FormatVersions.compiledArtifact = 1`。source descriptorと同じchannel（bundled／unbundled）の`compiled`に保存する。

```json
{
  "formatVersion": 1,
  "profile": "compiled",
  "sourceIntegrity": "sha256-…（省いたcanonical sourceのintegrity）",
  "storyIntegrity": "sha256-…（storyのJSONのintegrity）",
  "story": {
    "kind": "StoryDocument",
    "version": "4.0",
    "metadata": {"sourceId": "compiled"},
    "…": "…"
  },
  "cacheIdentity": {"id": "…", "label": "compiled", "databaseName": "…"}
}
```

- **Story IR**は、frontendが検証に成功したStoryDocumentから、作者用の情報を除いたもの。
  - 除くもの: `sourceMap`、各actionの`sourceRange`、include graphの`sourceOrigins`。`metadata.sourceId`は`compiled`に置き換える。
  - YAMLのcommentとlayoutは、StoryDocumentになった時点でもともと含まれない。
  - narrative controlのstoryもcompileできる。各actionの`narrative`（scene IDと位置・分岐条件で、ファイルや行は含まない）と、
    `metadata.sourceVersion`／`metadata.narrativeControl`は、runtimeが読むため残す。
  - 無効区間だけの認識モデルの先読みを抑える`metadata.invalidatedRecognitionScenes`も保持する。既存シーンIDの重複のない配列として検証する。
    この項目がある出力は`invalidate-model-preload-v1`対応runtimeと組み合わせる。旧compiled成果物には項目を要求せず、旧台本の依存準備を維持する。
- `cacheIdentity`は、`id`と`databaseName`を残して`label`だけを`compiled`に置き換える。
  `label`はsourceファイルのbasenameであるため。`id`と`databaseName`は作者が一度決めて保存しているstoryの識別子で、
  これを残すと検証済みremote cacheが`source`と`compiled`の間で引き継がれる。
- runtime artifact descriptor（`artifact`）は`source`と同じものを使う。`sourceIntegrity`は省いたsourceのintegrityを指し続ける。

### 読込（runtimeはYAMLを再parseしない）

`loadDsl4RuntimeArtifact`は、projectに`compiled`があればYAML frontendを呼ばずに次の順で検証する。

1. envelope: 未知のkey・不足key・未知のformatVersionを拒否（`decodeDsl4Envelope`）。
2. `storyIntegrity`: storyのJSON（`JSON.stringify`）のSHA-256が一致するか。
3. Story IR: JSONとして表現できる値だけで構成され、どの深さにも`sourceMap`／`sourceRange`／`sourceOrigins`がない。
   `metadata`は`sourceId: 'compiled'`と、runtimeが読む`sourceVersion`・`narrativeControl`・`invalidatedRecognitionScenes`・`implicitProjectActors`・`implicitProjectAssets`・`sealedAssetSources`の許可リストだけ。
   無効認識のシーンIDは既存シーンを指す一意な配列で、`narrativeControl: true`の場合だけ受理する。
4. StoryDocumentの構造: scene・action・各mapの形。
5. 以降は`source`と同じ: asset distribution、runtime artifact descriptor（control profile・keymap）、asset bundle。

story自体の意味の検証（schema・semantic・式）はビルド時にfrontendが行い、その結果を`storyIntegrity`で固定する。
`compiled`と`source`を同時に保存したprojectは、どちらを実行するか決まらないため拒否する（`K4-COMPILED-STORY-SOURCE-001`）。
結果の`distributionProfile`で`source`／`compiled`を区別できる。

### ビルド（`builder/dsl4-compiled-profile.ts`）

1. 従来どおり`source`でビルドし、loaderで検証する。
2. 埋め込んだcanonical sourceを、runtime loaderと同じ方法で再parseしてcompileする。
3. source descriptorを`compiled`に置き換え、作者用のhat（`kamishibai`・`kamishibaiConfig`）の配下のblock・shadow・そのblockに付いたcommentを削除する。
   ほかのscriptとcommentは残す。
4. compiled projectをloaderでもう一度検証してからSB3を書き出す。

出力は決定的（同じ入力から同じbytes）。

## 複数章のpublication（`compiled-project.ts`）

`createDsl4PublicationDistributionSb3({distributionProfile: 'compiled'})`は、保存するSB3だけをcompiledにする。
開いているprojectはYAMLを保持したまま変わらない。省略すると現在のprofileを保つ。

- 各章のruntime componentを上と同じ方法でcompileし、`publication.sources`（章のYAML）を削除して`publication.profile = 'compiled'`とする。
- manifestは章・題名・`next`・入口をそのまま保ち、各章の`source`を、その章のStory IRのbytesを指すものに置き換える。
  `entry`は`story/<segment id>.json`、`size`と`integrity`はそのJSONのもの。`url`は持たない（章はSB3に入っている）。
  YAMLのファイル名・フォルダ名はmanifestにも残らない。1章のStory IRは1 MiBまで（manifestの章の上限）。
- 入口のprojectが持つ自身のcomponentとsource hatもcompileする。選択直後のprojectでは入口章のcomponentと同じobjectを共有しているため、
  章のcomponentを複製してから変換する。
- 開くとき（`validateDsl4ProjectPublication`）: `profile`は省略（source）か`compiled`だけ。compiledでは`sources`・章の`source`・
  別名のentry・URLを拒否し、各章のStory IRの構造と`gotoSegment`が`next`にあることを同期的に確かめる。
- 章を読むとき（publication host・保存）: providerがmanifestのsize・SHA-256でStory IRのbytesを照合し、loaderは`decode`でJSONを
  Story IRとして検証する。YAML frontendは呼ばない。章のruntimeは上のcomponent loaderがcompiledとして読む。
- compiledのpublicationをsourceとして保存し直すことはできない（YAMLが残っていないため）。
- 「SB3を保存」は現在のprofileを保ち、「YAMLなしでSB3を保存」がcompiledで保存する。

## 制約: compiledは秘匿ではない

### 日本語

`compiled`は**sourceを省くだけで、内容を秘匿しない**。

- Story IRは平文のJSONで、Playerが読める形でSB3に入っている。scene・台詞・分岐・変数・アセット参照は、SB3を展開すれば誰でも読める。
- 省くのは、作者用の情報（YAMLのcomment・layout・ファイル名・include path・行と列の対応表）だけである。
- `sourceIntegrity`は省いたsourceのhashであり、sourceの候補を持っている人は一致を確かめられる。
- 台詞やアセットを読まれたくない場合の手段にはならない。クライアントで実行する以上、暗号化しても実行中の内容の完全な秘匿はできない。

### English

The `compiled` profile **omits the source; it does not keep the story secret**.

- The Story IR is plain JSON stored in the SB3 in a form the player reads. Anyone who unpacks the SB3 can read scenes, lines, branches, variables, and asset references.
- Only authoring data is removed: YAML comments and layout, file names, include paths, and the line/column source map.
- `sourceIntegrity` is a hash of the omitted source, so anyone holding a candidate source can confirm whether it matches.
- It is not a way to keep lines or assets from being read. Encryption could not guarantee complete secrecy either: a story that runs on the client is decrypted while it runs.

## 検証

- `test/dsl4-compiled-artifact.test.ts`: 両channelで決定的なSB3。comment・ファイル名・`kamishibai:`・source map・作業ディレクトリがSB3のどのentryにも含まれない。
  `source`と同じruntime artifact・同じscene、YAML frontendを呼ばない読込、改ざん・source map注入・path注入・未知key・版違い・
  profile違い・YAMLとの同時保存の拒否、narrative storyのcompileと同じ台詞での再生、block sourceのSB3からhatとinclude pathが消えること、
  root binary entryのビルド、CLIの`--distribution-profile`。
- 実ブラウザ（Chrome 152、Claude desktopの内蔵ブラウザ）: 最小のStandard baseで`source`と`compiled`を同じstoryからビルドし、
  それぞれTurboWarp PackagerでPlayer HTMLにして再生した。どちらも緑旗で1枚目の背景、Spaceで2枚目の背景になり、
  runtimeは`running`・`/scenes/opening/actions/3`・エラーなしで一致した。`compiled`のproject.jsonにはYAMLのcommentとファイル名がない。
  [観測値](../testing/evidence/compiled-player-20261024/packaged-player.json)。公開Standard GUIのEditor／Player、
  app shellのstoryを開く導線、Edge、remote素材・動画・音声・pose・複数章は未確認。
- `test/dsl4-compiled-publication.test.ts`: 2章のpublicationをcompiledで保存すると、SB3のどこにも章のcomment・YAMLのパス・
  `kamishibai:`・source mapがない。各章がcompiledとして読め、開いているprojectは変わらない。compiledのまま再保存でき、sourceへの
  再保存は拒否する。YAMLの残存・別名entry・改ざんした章を拒否する。publication hostがYAML frontendを呼ばずに章を読み、
  `gotoSegment`で次の章へ移る。
- 実ブラウザ（同じChrome）で2章のpublicationを`source`と`compiled`で保存し、Player HTMLにして開いた。どちらもpublication hostが
  エラーなく「Ready」になり、「YAMLなしでSB3を保存」はsourceでだけ表示された。`compiled`のproject.jsonに章のcommentとパスはない。
  ただし、この検証環境では両profileとも舞台が白く、章の表示と章移動は確認できていない（章移動は単体テストで確認）。
  [観測値](../testing/evidence/compiled-player-20261024/packaged-publication.json)。
- `test/dsl4-format-contracts.test.ts`、`test/dsl4-architecture.test.ts`に新しい形式とcore moduleを登録した。

## 残り（#781）

- 公開Standard GUIとapp shellの導線でcompiled SB3を開く確認、`pnpm sb3:check`のcandidate hashとしてcompiled artifactの決定性を示すこと、
  `pnpm verify:full`と`pnpm release:check`。

## 撤去したもの（2026-10-25、ユーザー判断）

- **sealed（パスワードで暗号化した配布）**: PR #1026・#1028・#1031で実装し、rc.51〜rc.55で提供した後に撤去した。
  理由: パスワードは全閲覧者に同じものを配るため漏れれば終わりで、閲覧者ごとの取り消しもできない。再生中はブラウザのメモリに平文がある。
  守れるのは「ファイルだけ手に入れた人が読めない」ことだけで、配る範囲を限る方が簡単で確実。紙芝居の利用者（教員・学生）にはオーバースペックと判断した。
  rc.51〜rc.55でsealedにしたSB3は、単一storyは`K4-SEALED-UNSUPPORTED-001`、publicationは「Password-sealed publications are no longer supported」で開かない。
  sourceかcompiledで作り直す。`dsl4FormatVersions`の`sealedArtifact`も削除した。authenticated key service（#1040）も行わない。
- **publisher signature（作者の電子署名）**: PR #1041で実装したがmergeしなかった。
  理由: 作者が秘密鍵を保管し、指紋を公表し、閲覧者がそれを照合する運用が現実的でない。照合されなければ偽造は防げない。
  公式サンプルの真正性は、公式サイト（HTTPS）でSB3のSHA-256を公開すれば足りる（リリース手順は既にSB3のSHA-256を記録・照合している）。
