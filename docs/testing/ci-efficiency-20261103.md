# CIの重複処理削減（2026-11-03）

対象: [Issue #1129](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/1129)。
ブランチ: `chore/ci/reduce-repeated-work`。基準: `160dbeb9`。

## 調査結果

通常CIは既に`verify:pr`を使用し、全検証は手動指定またはリリース時に実行する。
成功した2つのrunを調べた。

| 実行                                                                                           | 全体    | PR checks | Vitest   | テスト              |
| ---------------------------------------------------------------------------------------------- | ------- | --------- | -------- | ------------------- |
| [41515474624](https://github.com/kubohiroya/turbowarp-kamishibai-app/actions/runs/41515474624) | 4分34秒 | 228秒     | 179.11秒 | 243ファイル・2378件 |
| [41509102084](https://github.com/kubohiroya/turbowarp-kamishibai-app/actions/runs/41509102084) | 4分19秒 | 219秒     | 171.33秒 | 243ファイル・2378件 |

依存インストールはキャッシュが効いて約5秒だった。主な負荷はテストで、Vitestが報告する内訳はテスト62〜63%、import 34〜35%、transform 3%。`quick`が`full`から除外するのは`builder.test.ts`だけである。

## 今回の変更

- `verify:pr`の最初にライブラリを1回ビルドし、同じ`dist`でSB3検証とquickテストを実行する。従来の2回目のビルドを除去する。上記runのビルド本体は約1.75秒なので、これだけでは大幅な短縮にならない。
- 共通フロントエンドヘルパーとasset関連の5単体テストを、必要なモジュールからの直接importへ変更する。大きな公開index経由の不要な読み込みを除去する。
- テストの削除・除外、検証順の変更、worker間の分離解除は行わない。単独の`sb3:check`・`test:quick`、`verify:full`とリリース検証、workflowの必須`test`ゲートは維持する。

## ローカル検証

Node.js 26.7.0、pnpm 11.28.8、Vitest 5.0.5、macOSで実施。最新mainのlockfileに従って依存を導入した。

共通ヘルパーを参照するテストと直接変更したテストの和集合を、同じコマンドで修正前後に実行した。計測はNode/Vitestのプロセス開始から終了までの実時間で、各1回。

| 対象                  | 修正前   | 修正後   | 結果                |
| --------------------- | -------- | -------- | ------------------- |
| 48ファイル・690テスト | 18.933秒 | 13.796秒 | 両方成功、約27%短縮 |

環境と実行対象が異なるため、この比率をCI全体の短縮率には換算しない。修正後のGitHub Actionsは未実行。

対象の再現コマンド:

```python
from pathlib import Path
import subprocess

files = {
    str(p) for p in Path('test').glob('*.test.ts')
    if 'dsl4-test-frontend' in p.read_text()
}
files.update(f'test/dsl4-asset-{name}.test.ts' for name in [
    'dependency-index', 'snapshot-watch', 'reload-policy',
    'reload-protocol', 'reload-transaction',
])
subprocess.run(['node', 'node_modules/vitest/vitest.mjs', 'run', *sorted(files)], check=True)
```

追加確認:

- ライブラリbuild、プロジェクト型検査、変更した6つのテスト／ヘルパーファイルのESLint・Prettierと`package.json`のPrettier、diffの空白検査が成功。
- `verify:pr`の実コマンドを代替実行ファイルで駆動し、正常終了と6つの各コマンドでの失敗を注入。buildが1回で、失敗コードを返し後続コマンドを実行しないことを確認。
- 全体の`verify:pr`・`verify:full`は追加実行していない。SB3生成処理・アプリの実装・生成済みruntime・依存lockfileは変更していない。

## 残る候補と切戻し

`dsl4-downloadable-release.test.ts`単体は上記runで約102秒かかり、他のテストファイルもruntimeを生成する。生成Promiseのキャッシュはプロセス内だけなので、ファイルをまたぐ再生成の削減は後続候補。ただしテスト間の状態分離、入力変更時の失効、生成物の一致検証を維持する設計が必要なため、今回の小さな差分には含めない。

切戻しは`package.json`の`verify:pr`と6つのテスト／ヘルパーのimportを元に戻す。npm・SB3・Pagesの公開済み成果物には影響しない。
