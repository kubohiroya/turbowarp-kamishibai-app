# DSL 4.0 のアニメーションと演出

台本の宣言は `kamishibai: '4.0'` のままです。対応する標準ランタイムとローカルプレビューでは
既定で実行できます。旧版のランタイムでは、対応版でSB3を作り直す必要があります。
既存の `moveTo`、`setTransparency`、`setSkin`、`loop` は変更しません。

```yaml
kamishibai: '4.0'
actors:
  Hero: HeroIdle
assets:
  HeroIdle: costume:Hero
scenes:
  opening:
    - Hero.show: {}
    - Hero.animate:
        to: {x: 60, y: 10, scale: 125, direction: 90, transparency: 25}
        seconds: 0.6
        easing: easeInOut
    - presentationEffect:
        scope: presentation
        effect: fade
        seconds: 0.4
        params: {color: '#000000', opacity: 0.8}
```

- `animate` は `to` に指定した値だけを同じ時間軸で変えます。位置と大きさはScratchと同じ単位、
  向きはScratchの方向、透明度は0〜100です。`delaySeconds`、`repeat`（追加周回数）、
  `alternate`（奇数番目の追加周回は逆方向）、`background`（後続の命令を待たせない）を指定できます。
  同じ人物の同じ値に別の演出を始めると、新しい命令がその値だけを引き継ぎます。
  他の値は継続します。スキップでは所有中の値を終点にし、保存状態の復元では以前の補間が復元値を上書きしません。
- `presentationEffect` は一時的な演出です。`stage` はステージの描画面だけ、
  `presentation` はステージと、その描画面に重なる物語の吹き出しを含みます。
  別レイヤーにあるカメラプレビュー、メニュー、エディターUIは対象外です。
- `shake` は `amplitude`（0〜64 CSS px）、`axis`（`x`、`y`、`both`）、
  `cycles`（1〜12）。`zoom` は `scale`（1〜3）。`wipe` は `direction`（上下左右）と
  `color`、`fade` は `color` と `opacity`（0〜1）。色は `#RRGGBB` です。
  揺れとズームは別の効果として扱い、ワイプとフェードは同じマスクを引き継ぎます。
  終了・中断後も、元の表示スタイルは維持されます。

ブロック台本では専用の日英ブロックを使えます。標準で表せない演出は、従来どおり
カスタムアクションでTurboWarp側へ委ねられます。名前付きプリセットは未導入です。
