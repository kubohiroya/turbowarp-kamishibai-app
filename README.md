# TurboWarp-Kamishibai

English | [日本語](README.ja.md)

**Participatory AI storytelling driven by body poses**

TurboWarp-Kamishibai is an interactive storytelling system in which participants move a story forward by posing in front of a camera. It uses Teachable Machine for pose recognition and TurboWarp for authoring and playback, turning scripts and assets into stories that run on the Web or as SB3 projects.

<img src="site/turbowarp-plus-icon.svg" width="24" height="24" alt="TurboWarp Plus" align="top"> TurboWarp-Kamishibai is one of the projects in the [TurboWarp Plus](https://kubohiroya.github.io/turbowarp-plus-packages/) family: a set of extensions, toolchains, applications and documentation sites that add features to [TurboWarp](https://turbowarp.org/). The family's packages are listed on the [TurboWarp Plus dashboard](https://kubohiroya.github.io/turbowarp-plus-packages/). TurboWarp-Kamishibai and TurboWarp Plus are independent projects built on TurboWarp and are not affiliated with or endorsed by the TurboWarp project or the Scratch Foundation.

This repository contains the runtime, DSL, CLI and JavaScript APIs, distributable SB3 projects, and the public website. The [documentation site](https://kubohiroya.github.io/turbowarp-kamishibai-docs/) is the source of truth for operating instructions, author guides, command references, troubleshooting, and migration notes.

![TurboWarp-Kamishibai showing Urashima Taro and a turtle over a camera feed while pose recognition advances the story](site/images/image01.png)

[Project website](https://kubohiroya.github.io/turbowarp-kamishibai-app/) · [Try the Web app](https://sqs.prof.cuc.ac.jp/kamishibai/) · [Download an SB3](https://kubohiroya.github.io/turbowarp-kamishibai-app/downloads/) · [Read the documentation](https://kubohiroya.github.io/turbowarp-kamishibai-docs/) · [Explore samples](https://kubohiroya.github.io/turbowarp-kamishibai-samples/)

## What You Can Build

- Advance a story through participant poses, keyboard input, and stage touches
- Describe scenes, branches, dialogue, motion, audio, and pose recognition in YAML or the 3.1/3.2 text DSL
- Preview scripts in TurboWarp and export self-contained SB3 stories for distribution
- Automate validation, live preview, SB3 builds, legacy DSL conversion, and asset distribution with the CLI
- Invoke DSL 4.0 core actions from TurboWarp blocks or the JavaScript API

## Choose a Version

|                 | 3.2.3                                           | 4.0.5                                              |
| --------------- | ----------------------------------------------- | -------------------------------------------------- |
| Status          | Stable for existing 3.1/3.2 stories             | Stable 4.0                                         |
| Best for        | Workshops, stable use, existing 3.1/3.2 stories | YAML authoring, browser workflows, and the CLI/API |
| Script format   | 3.1/3.2 text DSL                                | DSL 4.0 YAML                                       |
| Get it          | [Downloads][downloads]                          | [Downloads][downloads] (SB3)                       |
| Read on updates | [Published documentation][docs]                 | [4.0 release status][current-release]              |

Version 4.0.5 is the stable release for YAML authoring and the 4.0 APIs. Use 3.2.3 for existing 3.1/3.2 stories. Published 3.1 and 3.2 stories continue to work without migrating to 4.0.

## Try It First

Open the [published Web app](https://sqs.prof.cuc.ac.jp/kamishibai/) or the [Urashima Taro sample](https://kubohiroya.github.io/turbowarp-kamishibai-samples/stories/urashima/web/) to try a story in your browser. Allow camera access, then follow the on-screen instructions and perform the requested poses.

To open a project in TurboWarp, download an SB3 for the series you need from the [downloads page][downloads]. Materials for running an event are organized on the [workshops page](https://kubohiroya.github.io/turbowarp-kamishibai-docs/workshops/).

## Start Authoring

### Use 3.2 for stable workshops

Use 3.2.3 when you need the stable path for an event or an existing 3.1/3.2 story. Download the 3.2 SB3, open it in the [TurboWarp-Plus-Editor](https://kubohiroya.github.io/turbowarp-plus-editor/editor.html?lang=ja), and follow the [published documentation][docs] for the classic text DSL and workshop flow.

### Use 4.0 for YAML projects

The stable release, 4.0.5, prefetches the recognition models of the scenes a scene can move to next once its own model is ready, and also loads recognition models in the background for works split into publication segments, instead of waiting for them when a scene starts. Version 4.0.4 no longer bundles TensorFlow.js (about 1.3 MB) for pose recognition: a work loads it from the Kamishibai site when it enters a scene that uses a recognition model, which shrinks the Standard SB3 from about 2.7 MB to about 1.5 MB. Recognition models now load in the background for each scene, and a work waits only if a model is still loading when recognition starts. Version 4.0.3 stopped embedding the pose recognition model (PoseNet) in each work: the work fetches it from the Kamishibai site the first time pose recognition starts and shares it with every other work. Works for venues without a network keep the model and TensorFlow.js embedded when built with an asset profile that sets `network: forbidden`. Version 4.0.3 also left the editor schema out of the playback runtime and took asset-cache 0.9.2, which gives the IndexedDB cache a single owner per page. Version 4.0.2 shows the title sooner by preparing the YAML reader only when a story is first read, and 4.0.1 added the playback settings screen: open it from Config on the title or with Esc during playback to change pose-wait skipping and the BGM and sound effect volumes, and to open the camera and recognition backend settings. See the [4.0.5 release notes][stable4] and check the [current release status][current-release] before installing a versioned Standard SB3, Player, or npm package.

```yaml
kamishibai: '4.0'

controls:
  keymaps:
    production:
      Space: navigation.nextAction

scenes:
  opening:
    - wait: 1
    - goto: ending
  ending: []
```

For practical scripts, asset references, pose models, branches, speech bubbles, browser requirements, and troubleshooting, continue with the [DSL 4.0 author guide](https://kubohiroya.github.io/turbowarp-kamishibai-docs/dsl-author-guides/dsl-4.0-author-guide/) and the [sample repository](https://github.com/kubohiroya/turbowarp-kamishibai-samples).

## CLI Quick Start

rc.64 fixes the initial language of the recognition backend settings, following the TurboWarp language or the browser language when the host has no preference. The panel supports English and Japanese, including its accessible labels; the app’s language switch also updates it. Teachable Machine 4.0.2 and backend selection were added in rc.63. The earlier rc.58 fixed preview cleanup for the client’s own stream abort. Stories sealed with rc.51 through rc.55 remain unsupported; rebuild them as source or compiled distributions. The following examples target 4.0.0 and should be run after its release job completes; confirm the [release status][current-release] first.

The [`@kubohiroya/turbowarp-kamishibai-app`](https://www.npmjs.com/package/@kubohiroya/turbowarp-kamishibai-app/v/4.0.5) CLI is intended for CI, reproducible builds, larger projects, and distribution-profile management. Use Node.js 24.0.0 or later and pnpm 11, and install the exact version you have validated. The CLI command is `turbowarp-kamishibai`, and `tm-kamishibai` stays as a deprecated alias.

```bash
pnpm add --save-exact @kubohiroya/turbowarp-kamishibai-app@4.0.5
pnpm exec turbowarp-kamishibai --help
pnpm exec turbowarp-kamishibai validate-dsl4 --input opening.k4.yml --format pretty
pnpm exec turbowarp-kamishibai preview-dsl4 --watch --base kamishibai-4-base.sb3 --project-root .
pnpm exec turbowarp-kamishibai build-dsl4 --base kamishibai-4-base.sb3 --project-root . --output dist/my-story.sb3
pnpm exec turbowarp-kamishibai convert-dsl4 --input legacy-story.txt --output opening.k4.yml
pnpm exec turbowarp-kamishibai author-block-dsl --input opening.k4.yml --base kamishibai-4-base.sb3 --output block-story.sb3
pnpm exec turbowarp-kamishibai export-block-dsl --input block-story.sb3 --output-dir dist
```

`author-block-dsl` creates an editable SB3 with real action blocks grouped into scenes. After editing
inputs or rearranging blocks in TurboWarp and saving, use `export-block-dsl` to write the edited
script back to YAML. YAML includes become labeled scripts and `includeBlocks` references; exporting
preserves the module boundaries and include order. See the [conversion guide](https://kubohiroya.github.io/turbowarp-kamishibai-docs/4.0/dsl-author-guides/dsl-4.0-block-script-conversion-guide/).

See the [maintainer guide](https://kubohiroya.github.io/turbowarp-kamishibai-docs/developer-guides/developer-guide/) for the complete command reference, exit statuses, and release workflow.

## How It Works

```text
YAML + assets
    ↓
source frontend (parse, schema, semantic validation)
    ↓
browser preview / CLI build
    ↓
self-contained SB3
    ↓
TurboWarp runtime + Teachable Machine
```

Preview, validation, build, and runtime loading use the same StoryDocument and diagnostics. Local assets are embedded in the story SB3; remote assets declare integrity and a distribution profile; failed builds preserve existing output and replace it only with a validated candidate.

Implementation details live in the repository design docs:

- [DSL 4.0 surface specification](https://github.com/kubohiroya/turbowarp-kamishibai-app/blob/main/docs/design/dsl-4-surface.md): YAML contracts, action surface, resource limits, model initialization, and pose overlay
- [DSL 4.0 processing architecture](https://github.com/kubohiroya/turbowarp-kamishibai-app/blob/main/docs/design/dsl-4-processing-architecture.md): source frontend, StoryDocument, runtime boundaries, and diagnostics
- [Asset distribution profiles](https://github.com/kubohiroya/turbowarp-kamishibai-app/blob/main/docs/design/dsl-4-asset-distribution-profiles.md): local, remote, embedded, and offline asset behavior
- [DSL 4.0 video playback (experimental)](https://github.com/kubohiroya/turbowarp-kamishibai-app/blob/main/docs/design/dsl-4-video.md): video regions, planes, z-index, playback controls, activation, and rollback
- [Capability bundle and release contract](https://github.com/kubohiroya/turbowarp-kamishibai-app/blob/main/docs/design/dsl-4-capability-bundle-release.md): pinned extension packages, embedded IDs, artifact provenance, and rollback policy
- [DSL 3.1/3.2 to 4.0 migration](https://github.com/kubohiroya/turbowarp-kamishibai-app/blob/main/docs/design/dsl-4-migration.md): conversion classes, warnings, and legacy artifact policy

The current 4.0 stable release uses `@kubohiroya/turbowarp-teachable-machine@4.4.0` and the `kubohiroyatm` embedded Teachable Machine extension ID. Older package names, CLI names, URLs, and SB3 IDs appear only in historical releases and migration notes. Recognition defaults to Auto. In standalone HTML, hover over or tap the edge Tools handle to reveal the shared Dock, then open Teachable Machine next to Camera; Dock settings select the top, bottom, left, or right edge. A settings button registered with the green-flag/stop toolbar API lets users select JavaScript (CPU), WASM, or WebGPU. See the [compute backend guide (Japanese)](https://github.com/kubohiroya/turbowarp-kamishibai-app/blob/main/docs/recognition-compute.ja.md) for developer options and model disposal on restart.

## Develop This Repository

Requirements:

- Node.js 24.0.0 or later. CI runs on Node.js 24, and Node.js 24 is no longer supported.
  The build scripts import TypeScript modules directly using Node's built-in type stripping.
- pnpm 11
- A desktop environment capable of running TurboWarp when changing SB3 or browser integration

This repository is written in TypeScript. Add new modules as `.ts`, including scripts under
`scripts/`; the only JavaScript files kept in `src/` are generated artifacts. Convert a file you
have to edit rather than extending it in JavaScript.

Setup:

```bash
pnpm install --frozen-lockfile
pnpm verify:quick
```

Common checks:

| Command             | Purpose                                                                |
| ------------------- | ---------------------------------------------------------------------- |
| `pnpm verify:quick` | Lint, type-check, and run the lightweight tests during development     |
| `pnpm verify:full`  | Run the CI-equivalent SB3, full test, E2E, site, and package checks    |
| `pnpm format`       | Check formatting with Prettier                                         |
| `pnpm test`         | Run the full unit and integration suite                                |
| `pnpm run build`    | Build the site and fetch verified Release SB3 assets into `site-dist/` |
| `pnpm build:lib`    | Compile `src/` into the published `dist/` package                      |
| `pnpm sb3:check`    | Verify the frozen current DSL 4.0 release                              |
| `pnpm pack:smoke`   | Verify the installable npm package contents                            |

Site navigation is owned by [`@kubohiroya/turbowarp-kamishibai-site-navigation`](https://github.com/kubohiroya/turbowarp-kamishibai-site-navigation). This repository consumes that package from its build scripts instead of tracking a synchronized
`scripts/site-navigation.mjs` artifact. Change shared navigation in the package repository, release
or pin the updated package, then update this repository's dependency.

## Documentation

- [Published documentation](https://kubohiroya.github.io/turbowarp-kamishibai-docs/): operating instructions, author guides, command references, troubleshooting, migration notes, and workshop materials
- [Documentation source](https://github.com/kubohiroya/turbowarp-kamishibai-docs): source documents and issues
- [v4.0.0-rc.82 release notes][rc82]: latest published upstream packages and the document-source 0.2 contract
- [v4.0.0-rc.81 release notes][rc81]: named SB3 save formats and verified retained copies of remote assets
- [v4.0.0-rc.71 release notes][rc71]: actionable runtime errors and original block locations
- [v4.0.0-rc.65 release notes][rc65]: author metadata, family dependencies, and embedded pin updates
- [Pages deployment and release history](https://github.com/kubohiroya/turbowarp-kamishibai-app/blob/main/docs/pages-deployment.md)
- [Issue tracker](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues): bugs, proposals, implementation scope, acceptance criteria, and rollback plans

## Related Projects

- [`kubohiroya/turbowarp-kamishibai-samples`](https://github.com/kubohiroya/turbowarp-kamishibai-samples): sample scripts, images, audio, SB3 projects, and Web stories
- [`kubohiroya/turbowarp-kamishibai-docs`](https://github.com/kubohiroya/turbowarp-kamishibai-docs): documentation for participants, authors, developers, and workshop staff
- [`kubohiroya/sb3-toolchain`](https://github.com/kubohiroya/sb3-toolchain): SB3 extraction, validation, rebuilding, and embedded-extension management
- [`kubohiroya/turbowarp-teachable-machine`](https://github.com/kubohiroya/turbowarp-teachable-machine): pose-recognition extension for TurboWarp

## License

Software and assets copyrighted by this project are licensed under MPL-2.0 unless marked otherwise. See [`LICENSES.md`](LICENSES.md) for third-party works and asset-specific terms. Documentation and samples are governed by the terms in their respective repositories.

[docs]: https://kubohiroya.github.io/turbowarp-kamishibai-docs/
[downloads]: https://kubohiroya.github.io/turbowarp-kamishibai-app/downloads/
[rc65]: https://github.com/kubohiroya/turbowarp-kamishibai-app/blob/main/docs/releases/v4.0.0-rc.65.md
[rc71]: https://github.com/kubohiroya/turbowarp-kamishibai-app/blob/main/docs/releases/v4.0.0-rc.71.md
[rc81]: https://github.com/kubohiroya/turbowarp-kamishibai-app/blob/main/docs/releases/v4.0.0-rc.81.md
[rc82]: https://github.com/kubohiroya/turbowarp-kamishibai-app/blob/main/docs/releases/v4.0.0-rc.82.md
[rc88]: https://github.com/kubohiroya/turbowarp-kamishibai-app/blob/main/docs/releases/v4.0.0-rc.88.md
[current-release]: https://github.com/kubohiroya/turbowarp-kamishibai-app/releases/tag/v4.0.5
[stable4]: https://github.com/kubohiroya/turbowarp-kamishibai-app/blob/main/docs/releases/v4.0.5.md
