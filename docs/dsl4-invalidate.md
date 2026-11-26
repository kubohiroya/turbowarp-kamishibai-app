# DSL 4.0の専用無効化区間

`invalidate`は「この部分を使う」のC型ブロックをYAMLに保存するための専用書式です。
`if`の条件分岐とは区別します。DSLの系列は4.0のままです。

```yaml
- invalidate:
    condition: false
    then:
      - Sato.pose:
          steps:
            - pose: kime
              skin: sato-kime
```

- `condition: false`はオフ。`then`はYAMLとブロックに保持されますが、実行用の命令列へは入りません。
- `condition: true`はオン。`then`を順番に1回実行します。
- `condition`は静的なbooleanだけです。文字列`"false"`や式、変数参照は受理しません。
- `then`は単一命令マッピングの配列です。構造・有限のサイズ/深さはオフでも検証します。
- オフの本体は値の解決・素材参照の意味検証・ランタイム呼び出しを行いません。未作成モデルなどの下書きを保持できます。
- 上位のオフ区間に含まれるオン区間は実行されません。
- 素材・登場人物などの依存収集ではオフの本体もたどり、後でオンにするために必要な宣言を削除しません。

## モデル宣言の保持と実行時の先読み

オフ区間にしか認識命令がないシーンでは、そのシーンの`recognitionModel`を実行時の先読み対象へ追加しません。
起動時の準備・シーンのバックグラウンド取得・次シーンのprefetchのいずれも対象です。
モデル宣言とオフの本体は残し、同じモデルを使う有効な`pose`・`poseInputToChangeScene`・`imageInputToChangeScene`がある場合は従来どおり準備します。
別の有効なシーンから共有されているモデルも、そのシーンの依存として先読みできます。
モデルを使う全認識命令がオフなら、同じモデルを宣言するだけの別シーンからも先読みしません。

旧台本の「認識命令がなくてもシーンのモデル宣言だけで準備する」動作は維持します。
今回の除外は`invalidate: {condition: false, then: ...}`に認識命令を保持したシーンと、そこにしか認識命令がないモデルへ適用します。
オフ区間内の入れ子はアクション位置だけを調べ、参照の解決や下書きの意味検証は行いません。

- Schema：既存の静的boolean／then書式を使い、新しいYAML項目やDSL系列は追加しません。
- 変換器：無効な認識命令を保持するシーンIDを、派生した`StoryDocument.metadata.invalidatedRecognitionScenes`へ記録します。編集用YAMLとモデル宣言は変更しません。
- ランタイム：実行用の依存indexがこの記録と有効な認識命令を照合し、不要なモデルを除外します。preload coordinatorとremote loaderは、このindexを通じて取得対象を決めます。明示的な後続呼び出しに必要なオンデマンド取得は維持します。
- C型ブロックcodecと保存用の宣言依存収集は従来どおりです。モデルを削除して先読みを防ぐ方法は使いません。

YAMLなしのcompiled配布でも、この派生metadataを保持します。IRの検証器は、重複のない既存シーンID配列であることとnarrative用の記録であることを確認します。
ビルドとブロックauthoringは`invalidate-model-preload-v1`能力markerを必要とし、旧runtimeとの組合せを`K4-INVALIDATE-PRELOAD-RUNTIME-001`で拒否します。
`invalidate-source-v1`だけの4.0.15へ、新しいIR項目を渡して黙って先読みを再開する組合せは生成しません。

この先読み抑止はIssue #1200の未公開修正です。公開済み4.0.15の生成物には遡って適用せず、対応Appで作品を再生成して追従します。

`schema/dsl-4-narrative-control.schema.json`に書式を定義します。
編集支援用の`schema/dsl-4-editor.schema.json`も同じ定義から生成し、
`node scripts/schema/generate-dsl4-editor-schema.mjs --check`とeditor-schema auditで同期を確認します。
通常命令専用の`dsl-4.schema.json`は、構造を展開した後の命令列を検証する既存の役割を維持します。
`invalidate`は構造のため、新しいruntime port命令やcore-action manifest項目を増やしません。
既存の4.0 narrative capabilityと、新しい`invalidate-source-v1` markerを持つfrontend/runnerを使います。
既存の`narrative-control-v1`だけの古いbaseは、builder/authoringで`K4-INVALIDATE-RUNTIME-001`として拒否します。能力が無効なfrontendでは明示的に拒否し、黙って読み飛ばしません。

YAMLからは`useSection`（`ENABLED: off/on`）を作り、ブロックからは同じ`invalidate`を出力します。
命令内の区間については、旧来の圧縮コメント`kamishibai-block-sections-v1`に本体の保存を依存しません。
これによりシーン別の内部YAMLでも、編集→台本への反映→SB3保存→読み込み→ブロック表示で本体とオン/オフを保持できます。

定義宣言を囲む旧形式の区間はこの変更の対象外で、既存のauthoring-stateコメントの互換性を維持します。
専用書式はApp 4.0.15から提供しています。公開済みの4.0配布物は変更しません。
