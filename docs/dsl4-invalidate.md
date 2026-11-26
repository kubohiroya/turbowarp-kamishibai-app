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
本実装は4.0.15の未公開候補です。公開済みの4.0配布物は変更しません。
