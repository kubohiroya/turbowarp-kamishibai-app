# DSL 4.0のreleaseを切る

このディレクトリはreleaseごとのノートを持ちます。手順はここに書きます。

## 状態

`release-metadata/<version>.json`はsourceに保存する凍結記録です。現行の[Release workflow](../../.github/workflows/release.yml)はsourceを`frozen`のまま保持し、公開したSB3を照合して`published`の公開記録をReleaseへ添付します。過去のsourceにある`published`記録も保持します。

| 状態        | 意味                                                      |
| ----------- | --------------------------------------------------------- |
| `frozen`    | artifactが確定している。`release:dsl4:update`は拒否される |
| `published` | 公開済みassetと照合済み                                   |

`candidate`はローカルで`release:dsl4:update`を直接実行したときだけ現れる中間状態です。`main`には載せません。`candidate`が`main`にあると、その versionのバイト列をあとから差し替えられてしまい、pinした下流が別物を見ます。実際にturbowarp-kamishibai-samplesが中間candidateをpinし、公開artifactと207 bytes違っていたことがあります。`pnpm sb3:build`は`update`と`freeze`を一度に行うため、この窓が開きません。

freezeは一方向です。凍結した版は再ビルドして一致を検証できますが、source identity・artifactのハッシュとsizeは変更しません。あとで製品ソースに問題が見つかったら、次のcandidateを切って直します。

## 1. cutのPR

版の文字列を上げます。

- `package.json`
- `src/builder/constants.ts`
- `src/dsl4/runtime-provenance.ts`
- `scripts/sb3/dsl4-runtime-extension-entry.ts`
- `scripts/smoke/dsl4-packager-binary-memory.ts`
- `test/fixtures/dsl4/release-pins.json`
- `test/fixtures/dsl4/artifact-fingerprint-matrix.json`
- `test/fixtures/dsl4/capability-bundle-release-contract.json`
- `README.md`、`README.ja.md`（版の表、npm URL、`[rcNN]`リンク）
- `scripts/sb3/dsl4-release-policy.ts`の`dsl4NextReleaseVersion`を次の次へ

artifactを作って凍結します。

```sh
pnpm dsl4:playback-runtime:generate
pnpm sb3:build
```

`artifactFingerprint`は版の文字列から変わるので、失敗が報告する実測値へ再pinします。

```sh
pnpm vitest run test/dsl4-artifact-fingerprint.test.ts
# 失敗が出す Received を test/fixtures/dsl4/release-pins.json の expected へ
```

`docs/releases/v<version>.md`を書きます。前回の公開版以降に未公開のRCがある場合は、その変更・互換性への影響も含めます。「公開結果」は未公開のまま置きます。

```sh
pnpm verify:full
```

PRを出し、CIが通ったらmergeします。CIは`sb3:check`でSB3をsourceから再ビルドして照合するため、**凍結したartifactはmerge前に検証されます**。

> `pnpm typecheck`だけを単独で走らせると`dist/`が無いworktreeでは`test/e2e`が落ちます。`verify:full`は先にビルドするので、こちらを使ってください。

## 2. 承認済みのtag pushで公開する

公開操作の明示承認後、検証したPRをmainへmergeし、main CIの成功を確認します。公開対象は`package.json`と同じ版の凍結SB3を含む、現在のremote mainです。次のコマンドは公開操作であり、検証だけの作業では実行しません。

```sh
git fetch origin main --tags
release_commit=$(git rev-parse origin/main)
release_version=$(node -p "require('./package.json').version")
test "$(git rev-parse HEAD)" = "$release_commit"
test -z "$(git status --porcelain)"
git tag -a "v$release_version" "$release_commit" -m "Release v$release_version"
git push origin "refs/tags/v$release_version"
```

tagは注釈付きとし、既存tagを上書きしません。`v*`のtag pushがRelease workflowを起動します。workflowはtagとpackageの版が一致することを検査し、各段で`scripts/assert-current-release.ts`を呼んで、tagがrelease commitを指したままであることと、release commitが現在のremote mainに載っていることを確かめます。実行中にmainが`docs/`だけの変更で進んだ場合は公開を続けますが、tagの付け替え、mainの巻き戻しや分岐、`package.json`・`pnpm-lock.yaml`・`src/`・`scripts/`・`schema/`・`release-metadata/`・`site/`といった公開に関わるパスの変更があれば停止します。

Release workflowは次の順で処理します。

1. 固定依存をインストールし、`pnpm run check`（全検証）を実行する。
2. 凍結SB3を再ビルドしてsource identity・size・SHA-256を照合する。
3. npm tarballを作成し、GitHub ReleaseへtarballとSB3を添付する。RC版はprereleaseにする。
4. npm trusted publishing（OIDC）でprovenance付き公開を行い、registryのSHA-1をtarballと照合する。
5. npmの`latest`と`next`を公開した版へ同期する。3.2系列の推奨安定版とは別の指標として扱う。
6. 公開SB3の実物を照合した`kamishibai-<version>.release-metadata.json`をReleaseへ添付する。
7. 公開記録を使って版付きSB3・Player・配布ページを生成し、既存の履歴を保持してPagesへ配信する。

npm側のtrusted publisher設定はworkflow先頭のコメントに従います。この通常経路では、手元で`gh release create`・`npm publish`・`npm dist-tag add`を重ねて実行しません。既存のRelease添付物とnpm版は一致するbytesだけを受け入れ、不一致を検出したら停止します。公開済み版の差替えやtagの付け直しで解消しません。

途中で失敗した場合は、どこまで公開されたかをIssueへ記録します。Release・npm・Pagesは別の段階なので、一部の成功を全体の公開完了とは扱いません。再実行も対象操作の承認を得て、既存の添付物・registryと凍結記録の一致を確認してから行います。

## 3. 公開結果を確認する

Release workflowの成功後、次の実物を確認して対象Issueへ結果とURLを記録します。

- tagのcommit、packageの版、Releaseのprerelease状態。
- SB3のsize・SHA-256と、添付された公開記録のsource identity。sourceの凍結記録と照合する。
- npm tarballのSHA-1／integrity、provenance、`latest`／`next`。npm tarballの`gitHead`だけに依存せず、公開元commitとtarballの照合結果を残す。
- 実際のPages URL、版付きSB3・Playerと旧版履歴。配信失敗や伝播待ちを完了としない。

sourceのmetadataを公開後に書き換えるrecord PRは通常経路に含めません。Release添付の公開記録が公開状態の正本です。公開後のノート追記が必要な場合は文書だけの別PRにし、凍結済みmetadataや生成runtimeを変更しません。

## 4. Docs・Samplesを追従させる

DocsとSamplesは、それぞれの公開版解決スクリプトと`app-release.json`に従います。Docsのsource内の記録は`sources/dsl4/app-release.json`です。SamplesのCLI・ベースSB3・生成成果物の対応版とcommitを一式で揃え、作品別の重複した版固定設定を追加しません。

AppのReleaseだけで他repositoryへ自動通知されるとは仮定しません。対応Appの公開を確認した後、承認済みのmain更新・手動起動・明示的なrepository_dispatchという各repositoryの既存経路で追従させます。未公開候補を「最新公開版」として選びません。

Docsの対応版・Schema・仕様・導線と、SamplesのSB3・Web・生成lockを検証し、公開URLのmanifestと成果物でも照合します。3.2安定版の説明・作品は保持します。追従に失敗した系列は直前の検証済み参照と公開物を保持し、同じ公開版を別のbytesで上書きしません。
