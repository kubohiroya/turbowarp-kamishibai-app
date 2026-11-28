# DSL 4.0の保存・復元と固定viewport

追跡: #771（保存・復元）、#779（viewport）、#1010（動画の保存）、#1011（動画の座標）。実装ブランチ: `codex/feat-video-persistence-viewport`。依存順は保存codec・history・save-slot → sessionの復元境界 → native表示・動画、viewport定義 → VM・renderer・DOMの共通座標 → host接続とする。

DSLは引き続き`4.0`。新しいURLスイッチや有効化フラグは追加しない。任意の章選択、物語を巻き戻す履歴UIは追加せず、復元は明示的に保存したsave pointを使う。

## viewport

```yaml
kamishibai: '4.0'
viewport:
  width: 360
  height: 640
  orientation: portrait
  fit: contain
```

宣言がなければ480×360、landscape、contain。幅・高さは1〜4096の整数、面積は4,194,304以下。orientation省略時は寸法から決まり、宣言と寸法の不一致は拒否する。作品の論理寸法はウィンドウ回転で変更しない。`contain`は全体を収め余白を作り、`cover`は比率を保って広げ、外側をcropする。動画矩形の`fit`はその動画の矩形内の収まり方で、作品全体のviewport.fitとは別。

原点はstage中央、xは右が正、yは上が正。safe areaを除いた矩形へ一様拡大して中央配置し、pointerには同じ変換の逆を使う。letterboxとcrop外の領域は入力対象外。publicationの保存バーはstageの外の行に置く。

native `runtime.setStageSize`でWebGLとDOM overlayとVM mouse座標を揃える。前面動画はrendererの`scale-centered`、背景動画はnative video drawableを使い、plane・zIndexの意味は従来どおり。動画はpointerを遮らない。browser stageとpublicationではcanvas・overlayの積層全体を一緒に拡大する。cameraはcanvasの測定矩形を使い、Previewのtitle/menuも同じ表示mountに置く。

source graphではviewportをsingletonとして合成し、Story IRとcompiled artifactへ保持する。構造化ブロックではviewport定義をconfigへ格納する。live reloadでviewportが変わった場合は表示を保持する「現在actionから」を無効とし、scene/storyの再起動を使う。native寸法にはownerを持たせ、新owner成立後に旧ownerを解放しても新寸法を取り消さない。解放時のresize失敗はownerを保持して再試行する。

## SaveDataV1

`save-data.ts`を正本とし、`dsl4FormatVersions.saveData = 1`。source DSLの版とは独立したformatVersion。

- `formatVersion: 1`、`dslVersion: '4.0'`、`storyId`、`sourceIntegrity`（SHA-256 SRI）、`savedAt`（UTC ISO）。
- `runtime`: sceneId、actionIndex、有限scalarのvariables、paused/finished、scene visit/action commitの履歴DTO。
- `presentation`: actor/backdropのcostume名とimage asset binding、位置・大きさ・向き・可視性・effect・layer、動画の論理参照と再生状態。

動画はid、assetまたはHTTP(S) URL、矩形、plane、zIndex、fit、time、paused、loop、volume、muted、rateを保存する。Object URL、renderer/decoder、Blob、Promise、timer、Object Store handleは保存しない。

未知key・未知version、accessor、非JSON値、疎配列、循環、非有限値、履歴不整合を拒否する。既定上限はUTF-8 2MiB、20,000 entries、深さ32、動画32。呼び出し側は上限を下げられる。台本ID・指紋が異なるsaveを暗黙に移行しない。

公開runtimeは検証済みsource descriptorの指紋を使う。Web Previewは現在generationのStory IR全体の指紋を使い、古いbase descriptorへ結び付けない。Previewのsaveは同じIR generation用で、公開sourceのsaveと指紋を自動変換しない。

## APIと保存領域

```ts
import {createDsl4SaveSlotStore} from '@kubohiroya/turbowarp-kamishibai-app/dsl4';

const save = await host.captureSave();
const store = createDsl4SaveSlotStore();
await store.put('slot-1', save);
const blob = await host.exportSave(); // application/json; download処理は呼び出し側
const stored = await store.get(save.storyId, 'slot-1');
if (stored) await host.restore(stored); // Blobも受理する
await host.retrySaveCleanup();
await store.dispose();
```

低水準のnavigation sessionは`saveIdentity`を受け取る。指紋がないsessionは通常再生できるがsave/restoreは拒否する。保存専用IndexedDBの`saveSlots` storeを使い、asset cacheのpurge/LRUから分離する。既定のslot上限は作品ごと32。保存済みslotの更新は上限時も可能。transactionのcompleteを待って結果を返し、dispose後は通常操作を閉じる。失敗したconnection closeは再dispose可能。

## 復元境界と失敗

saveは現在actionのquiesce契約（終了待ち、または取消し・再実行可能）で安全な境界まで待つ。variablesと履歴と表示をcapture後、元の実行を続ける。復元は保存時のactionを待機位置として採用し、通常の次へ操作で実行を再開する。終了済みsaveは終了済みとして復元する。

restoreはcodec、指紋、実scene/action、変数型、履歴を検証してから現在の実行をquiesceする。Structured Dataのstory/scene scopeも候補用の独立realmに準備し、採用前に旧scopeを解放しない。終了済みsaveには実行用scene iteratorを作らない。旧realmのdispose失敗も採用後のcleanupとして所有・再試行する。必要なscene素材と隠した動画を準備し、metadata、時間、native playが成功してから表示と論理状態を採用する。prepare/metadata/play失敗は候補を解放し、元の表示・variables・実行を再開する。cleanup失敗は参照を保持し、`retrySaveCleanup`またはdisposeで再試行する。採用後の旧owner cleanup失敗は`save.diagnostic`として通知し、採用成功と区別する。採用直後のdisposeや通知失敗でもfinallyから旧ownerを解放し、失敗したcleanupを明示再試行へ保持する。採用後の終了通知を採用前の取消しへ読み替えない。

採用後の動画はassetから新しいObject URLを得る。autoplayを独自に許可したり、拒否された音声をmutedへ変更して成功扱いにしない。ブラウザの制約で再生できなければ復元を失敗させ、既存sessionを維持する。

disposeは新しいcheckpoint操作を閉じてprepareへabortを通知し、遅れて得た候補も解放する。保存・復元と通常の起動/入力/変数更新は同時採用しない。cleanupが残る間は次のcheckpointを拒否する。

## 表示の復元範囲

組込みは、準備済みcostume名によるactor/backdropと画像assetのbinding、actorのXY・size・direction・visible・effect、story actor同士の相対layer順、および動画を復元する。renderer IDやVM target objectを保存しない。物語と無関係なspriteとの任意のinterleaveは復元対象にしない。

action が終わった後も残る作用は、通常のcommandを再実行して推測復元しない。core は BGM（`bgm`、および `sound` を持つ `pose` の段）、場面の音声（`audio`・`audioControl`）、動的SVG text（`setText`）、コスチュームの `loop`、外部broadcast（`broadcastMessageAndWait`）、custom action を履歴に持つcheckpointを、portが`validateSaveRestoreSupport(save, actions)`と対応するcapture/prepareRestorePresentation handlerを持つ場合だけ許可する。speech bubble（`say`・`think`）、`sound`、`sound` を持たない `pose` は action の終了とともに作用が消え、save 中の実行は取り消して再実行する（`sound` は終了を待つ）ため、残る作用がなく handler なしで許可する。handlerはデータ検証、commit、失敗時rollback、採用後finalizeを持ち、非JSONのownerをsaveへ混ぜない。未対応を黙って落とさない。

TurboWarp host は表示のsaveに `media` を加え、次をデータとして保持して復元する（`src/dsl4/platform/presentation-media-save.ts`）。

- BGM: crossfade の BGM の asset と、fade 中なら向かう先の音量（0〜100）。復元は今鳴っている BGM（fade 中の voice を含む）を止め、保存した BGM を最初から鳴らし直す。voice は再生位置を返さないため位置は保持しない。保存時に BGM がなければ止めるだけになる。crossfade を使えない host は `bgm` を対応外として拒否を続ける。
- 場面の音声: id、asset または URL、再生位置、paused、loop、音量、muted、速度。復元は prepare で playback を作って位置を合わせ、失敗すればcheckpoint全体を拒否する。採用後に置き換え、再生中だったものだけを再開する。
- `setText`: 俳優ごとの content run と style。commit の中で、保存時に text がない俳優のtextを解放し、costumeとbindingを戻した後に保存した text を描き直す。rollback は以前の text を描き直す。後から skin を貼った俳優の text は覆われて見えないため、記録から外す。
- `loop`: 俳優ごとの steps。復元は最初の段から再開する。
- `sound` を持つ `pose` の段の音は一度だけ鳴る音で、復元では途中で止め、再開しない。取り消された `sound` と同じ扱いになる。

BGM・場面の音声・`loop` は鳴らし始めると rollback で取り消せないため、採用後の finalize で旧作品の音とloopを止めた後に始める。この段階の失敗は `save.diagnostic` として通知し、採用は取り消さない。`media` のない以前のsaveは、BGM・音声・text・loopのない状態として復元する。`broadcastMessageAndWait` は Scratch の変数やリストを含む任意の状態を変えるため拒否を続けるが、作者が `saveSafe: true` を付けた action は、receiver が残す状態はないという作者の宣言として core が許可する。復元は message を送り直さない。custom action は TurboWarp host に配線されておらず（`customAction` の port がなく、custom action を含む台本は host 作成時に `K4-HOST-PORT-MISSING` で止まる見込み。コードからの推定で未実行）、拒否を続ける。配線するときに、custom action の登録へ同じ宣言を加えるかを決める。

## 受け入れ基準と検証

- Codec/Blobのroundtrip、上限・互換性・履歴不整合の拒否。
- fresh sessionと実IndexedDB接続からの位置・variables・表示の復元。
- 不在asset、native autoplay拒否、prepare失敗で有効なsessionを維持。
- dispose競合とcleanup失敗のowner保持・明示再試行。
- 縦横・contain/cover・safe area・resizeで前面動画と背景WebGL、native VM pointerの座標が一致。
- 既存の未宣言DSL 4.0と構造化ブロック/source graphの互換性。

日常検証は変更境界のunitとChromium。Firefoxはメジャーリリース時のみ、Safariは対象外。検証結果・未完了項目はIssue #771/#779/#1010/#1011へ記録する。コードの公開操作は別途承認を得て行う。

## ロールバック

今回のsource・schema・host接続をまとめてrevertする。既存の未宣言4.0台本はそのまま有効。保存DBはasset cacheから独立しているため、資産purgeで削除しない。未知のsave versionは読み込まず、別途export済みBlobを保持する。公開済みnpm/SB3/Pagesは今回変更しない。

## 再現用fixture

`test/fixtures/dsl4/viewport-portrait.kamishibai.yaml`は、同じ音声track付き動画を前面・背景へ配置するDSL 4.0台本。両方mutedとして、音声autoplayの許可に依存せず表示を検証できる。`video-audible.webm`の生成コマンドは次のとおり。テスト実行時にffmpegは必要ない。

```sh
ffmpeg -f lavfi -i testsrc=size=96x64:rate=12 \
  -f lavfi -i sine=frequency=440:sample_rate=48000 -t 2 \
  -c:v libvpx -b:v 64k -pix_fmt yuv420p \
  -c:a libopus -b:a 24k -af volume=0.05 video-audible.webm
```

Chromiumの自動検証はCDP `userGesture:false`で行い、音声を有効にした候補のnative autoplay拒否も確認する。自動操作のactivationを人の操作に読み替えない。終了待ちの動画controlでsaveを要求した場合は終了境界を待ち、待機上限でsaveだけを失敗させる。再生自体をabort・再始動しない。

resize検証では、window寸法だけでなく、新しいmount寸法に対するfitの完了を待ってからpointerの基準矩形を測る。旧矩形を使って新canvasへクリックする検証上の競合を避ける。

## ローカル検証の完了記録（2026-10-26）

- `pnpm verify:pr`: 成功。211ファイル・2037テスト。公開済みrc.56のSB3照合、lint、format、型検査、quick回帰を含む。`verify:full`は実施していない。
- Chromium 155.0.8059.86: 対象E2E 2件成功。縦横×contain/coverの112項目、native VM/WebGL/動画、実IDBの失敗・明示再試行、ページ再読込後のfresh session復元・解放、保存バーの表示・入力。
- 実聴は別記録。rc.46のChrome実ウィンドウ6条件で、利用者が`heard-and-stopped`と回答。入力回帰30件もverify:prに含む。新しいsave/viewportコードの実聴と混同しない。
- 最初のverify:prで検出したcore/platform境界3件と旧decoder失敗fixture2件を修正。境界検査は緩めず、失敗したdecoderのowner保持と明示再試行を既存回帰へ追加した。

記録: [Chromium測定](../testing/evidence/save-viewport-20261025/results.json)。実装は専用worktreeの作業ブランチで保持し、main統合・コードの外部公開は未実施。Firefoxはメジャーリリース時のみ、Safariは対象外。音声・動的SVG text・custom表示等の復元は対応handlerがなければ拒否する範囲を維持する。

## マージ前レビューの追加修正（2026-10-26）

採用callback後のdisposeで旧表示のfinalizeを飛ばす経路と、採用後の通知例外で同じownerを保持できない経路を、追加回帰2件で再現した。採用済みならfinallyで旧表示・runtimeのcleanupを必ず試み、失敗ownerを明示再試行へ保持する。採用前の取消しは従来どおりrollbackする。対象session・Structured Data・表示の16テスト、変更ファイルのlint/format、型検査が成功。生成runtimeを更新し、対象の保存・viewport Chromium E2E 1件も再確認した。
