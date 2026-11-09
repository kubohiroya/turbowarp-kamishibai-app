# ライセンス区分

Copyright © 2026 Hiroya Kubo.

このリポジトリでは、次のライセンスを適用します。

| 対象                                                                 | ライセンス                                       |
| -------------------------------------------------------------------- | ------------------------------------------------ |
| 個別の表示がない、本プロジェクトが著作権を持つソフトウェアおよび素材 | [Mozilla Public License 2.0](LICENSE)（MPL-2.0） |

一般向け、紙芝居DSL作成者向け、開発者向け、および体験会の文書と図版は
[`kubohiroya/turbowarp-kamishibai-docs`](https://github.com/kubohiroya/turbowarp-kamishibai-docs)
へ移設しました。文書のライセンス区分は移設先の表示を参照してください。

第三者のソフトウェア、フォント、画像、音声その他の素材には、それぞれの権利者が
定めたライセンスまたは利用条件が適用されます。個別のライセンス表示がある場合は、
この一覧より個別表示を優先します。

## DSL 4.0 Standard Runtimeの直接依存

次の一覧は`package.json`と`pnpm-lock.yaml`で完全固定している直接依存です。各packageに同梱された
license表示とsource repositoryを正本とします。

| package                                      | version／revision | license      | source repository                              |
| -------------------------------------------- | ----------------- | ------------ | ---------------------------------------------- |
| @kubohiroya/turbowarp-app-shell              | 0.6.0             | MPL-2.0      | `kubohiroya/turbowarp-app-shell`               |
| @kubohiroya/turbowarp-asset-cache            | 0.8.0             | MPL-2.0      | `kubohiroya/turbowarp-asset-cache`             |
| @kubohiroya/turbowarp-kvs                    | 0.6.0             | MPL-2.0      | `kubohiroya/turbowarp-kvs`                     |
| @kubohiroya/turbowarp-async-input            | 0.12.0            | MPL-2.0      | `kubohiroya/turbowarp-async-input`             |
| @kubohiroya/turbowarp-bubble                 | 0.18.0            | MPL-2.0      | `kubohiroya/turbowarp-bubble`                  |
| @kubohiroya/turbowarp-camera-source          | 0.23.0            | MPL-2.0      | `kubohiroya/turbowarp-camera-source`           |
| @kubohiroya/turbowarp-extension-manifest     | 0.5.0             | MPL-2.0      | `kubohiroya/turbowarp-extension-manifest`      |
| @kubohiroya/turbowarp-local-preview          | 0.3.0             | MPL-2.0      | `kubohiroya/turbowarp-local-preview`           |
| @kubohiroya/turbowarp-live-reload-controller | 0.4.0             | MPL-2.0      | `kubohiroya/turbowarp-live-reload-controller`  |
| @kubohiroya/turbowarp-runtime-expression     | 0.10.0            | MPL-2.0      | `kubohiroya/turbowarp-runtime-expression`      |
| @kubohiroya/turbowarp-runtime-adapter        | 0.5.0             | MPL-2.0      | `kubohiroya/turbowarp-runtime-adapter`         |
| @kubohiroya/turbowarp-svg-text               | 0.14.0            | MPL-2.0      | `kubohiroya/turbowarp-svg-text`                |
| @kubohiroya/turbowarp-teachable-machine      | 4.2.0             | MPL-2.0      | `kubohiroya/turbowarp-teachable-machine`       |
| @kubohiroya/turbowarp-document-data          | 0.6.0             | MPL-2.0      | `kubohiroya/turbowarp-document-data`           |
| @kubohiroya/turbowarp-named-data             | 0.8.0             | MPL-2.0      | `kubohiroya/turbowarp-named-data`              |
| @kubohiroya/turbowarp-document-source        | 0.4.0             | MPL-2.0      | `kubohiroya/turbowarp-document-source`         |
| @kubohiroya/turbowarp-yaml-json              | 0.10.0            | MPL-2.0      | `kubohiroya/turbowarp-yaml-json`               |
| @teachablemachine/pose                       | 0.8.6             | Apache-2.0   | `googlecreativelab/teachablemachine-libraries` |
| @tensorflow/tfjs                             | 4.22.0            | Apache-2.0   | `tensorflow/tfjs`                              |
| @turbowarp/scratch-storage                   | 2.0.0             | BSD-3-Clause | `TurboWarp/scratch-storage`                    |
| @turbowarp/scratch-svg-renderer              | 1.1.0             | MPL-2.0      | `TurboWarp/scratch-svg-renderer`               |
| ajv                                          | 8.20.0            | MIT          | `ajv-validator/ajv`                            |
| base64-js                                    | 1.5.1             | MIT          | `beatgammit/base64-js`                         |
| brfs                                         | 2.0.2             | MIT          | `browserify/brfs`                              |
| buffer                                       | 6.0.3             | MIT          | `feross/buffer`                                |
| fflate                                       | 0.8.3             | MIT          | `101arrowz/fflate`                             |
| scratch-audio                                | `aba00cd`         | BSD-3-Clause | `TurboWarp/scratch-audio`                      |
| scratch-render                               | `a67f7c9`         | MPL-2.0      | `TurboWarp/scratch-render`                     |
| scratch-vm                                   | `c482342`         | MPL-2.0      | `TurboWarp/scratch-vm`                         |
| yaml                                         | 2.9.1             | ISC          | `eemeli/yaml`                                  |

`ajv`はDSL 4.0 source frontendのschema検証に使うruntime依存です。文書の共有3パッケージも公開版を固定して取り込み、App固有の台本検証と組み合わせます。

## DSL 4.0 配布成果物のbuild dependencies

次のpackageはroot binary entryの正規化・Packager bridge回帰testと配布成果物生成にだけ使用し、
npm runtime packageへ直接組み込みません。Packagerが成果物へ含める第三者noticeは、Packager自身の生成headerを維持します。

| package                                     | version | license      | source repository                            |
| ------------------------------------------- | ------- | ------------ | -------------------------------------------- |
| @kubohiroya/sb3-toolchain                   | 0.22.0  | MPL-2.0      | `kubohiroya/sb3-toolchain`                   |
| @kubohiroya/vite-plugin-turbowarp-extension | 0.10.0  | MPL-2.0      | `kubohiroya/vite-plugin-turbowarp-extension` |
| @turbowarp/packager                         | 3.14.0  | MPL-2.0      | `TurboWarp/packager`                         |
| @turbowarp/sbdl                             | 7.0.0   | MIT          | `forkphorus/sb-downloader`                   |
| esbuild                                     | 0.28.2  | MIT          | `evanw/esbuild`                              |
| terser                                      | 5.51.2  | BSD-2-Clause | `terser/terser`                              |
| vite                                        | 8.3.5   | MIT          | `vitejs/vite`                                |

## DSL 4.0 bundled pose runtime and PoseNet supply

The DSL 4.0 runtime embeds the Apache-2.0 Teachable Machine Pose 0.8.6 browser runtime, including
its TensorFlow.js 4.22.0 runtime, instead of loading either library from a CDN. The SB3 runtime
component stores the PoseNet MobileNetV1 0.75 / stride16 checkpoint supplied by
`tensorflow/tfjs-models` v2.2.2 as explicit model data, outside the runtime JavaScript. The model
JSON and weight shards are Apache-2.0 material. `@kubohiroya/turbowarp-teachable-machine@4.2.0` publishes the
canonical `./posenet` manifest, upstream URLs, package assets, and SHA-256 values; the local
[`src/dsl4/platform/posenet-bundle.js`](src/dsl4/platform/posenet-bundle.js) adapter only selects
the SB3 storage channel.

## DSL 3.2 compatibility extension

Published DSL 3.2 SB3 files include the TurboWarp Text extension under its legacy `strings` ID.
Those immutable binaries are distributed from GitHub Releases rather than retained as expanded
source on the current branch.

| title | copyright                           | license         | source                                                                         |
| ----- | ----------------------------------- | --------------- | ------------------------------------------------------------------------------ |
| Text  | CST1229, BludIsAnLemon, Man-o-Valor | MIT AND MPL-2.0 | [`extensions.turbowarp.org/text.js`](https://extensions.turbowarp.org/text.js) |
