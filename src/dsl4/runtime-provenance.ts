// SPDX-License-Identifier: MPL-2.0

/**
 * The source components that are composed into the DSL 4.0 runtime extension.
 * Keep this list close to the bundle so a downloaded extension remains
 * attributable even when a host shows the minified, composed source.
 */
export const dsl4RuntimeProvenance = Object.freeze([
  {
    title: 'Kamishibai DSL 4.0 Runtime',
    source: 'turbowarp-kamishibai-app',
    version: '4.0.0-rc.89',
    copyright: 'Hiroya Kubo',
    license: 'MPL-2.0',
  },
  {
    title: 'Document Data',
    source: '@kubohiroya/turbowarp-document-data',
    version: '0.6.0',
    copyright: 'Hiroya Kubo',
    license: 'MPL-2.0',
  },
  {
    title: 'Document Source',
    source: '@kubohiroya/turbowarp-document-source',
    version: '0.4.0',
    copyright: 'Hiroya Kubo',
    license: 'MPL-2.0',
  },
  {
    title: 'YAML/JSON',
    source: '@kubohiroya/turbowarp-yaml-json',
    version: '0.10.0',
    copyright: 'Hiroya Kubo',
    license: 'MPL-2.0',
  },
  {
    title: 'Asset Cache',
    source: '@kubohiroya/turbowarp-asset-cache',
    version: '0.8.0',
    copyright: 'Hiroya Kubo',
    license: 'MPL-2.0',
  },
  {
    title: 'KVS',
    source: '@kubohiroya/turbowarp-kvs',
    version: '0.6.0',
    copyright: 'Hiroya Kubo',
    license: 'MPL-2.0',
  },
  {
    title: 'Async Input',
    source: '@kubohiroya/turbowarp-async-input',
    version: '0.12.0',
    copyright: 'Hiroya Kubo',
    license: 'MPL-2.0',
  },
  {
    title: 'Bubble',
    source: '@kubohiroya/turbowarp-bubble',
    version: '0.18.0',
    copyright: 'Hiroya Kubo',
    license: 'MPL-2.0',
  },
  {
    title: 'Runtime Expression',
    source: '@kubohiroya/turbowarp-runtime-expression',
    version: '0.10.0',
    copyright: 'Hiroya Kubo',
    license: 'MPL-2.0',
  },
  {
    title: 'SVG Text',
    source: '@kubohiroya/turbowarp-svg-text',
    version: '0.14.0',
    copyright: 'Hiroya Kubo',
    license: 'MPL-2.0',
  },
  {
    title: 'Teachable Machine',
    source: '@kubohiroya/turbowarp-teachable-machine',
    version: '4.2.0',
    copyright: 'Hiroya Kubo',
    license: 'MPL-2.0',
  },
  {
    title: 'Teachable Machine Pose',
    source: '@teachablemachine/pose',
    version: '0.8.6',
    copyright: 'Google LLC',
    license: 'Apache-2.0',
  },
  {
    title: 'TensorFlow.js',
    source: '@tensorflow/tfjs',
    version: '4.22.0',
    copyright: 'Google LLC',
    license: 'Apache-2.0',
  },
  {
    title: 'PoseNet MobileNetV1 model',
    source: '@tensorflow-models/posenet',
    version: '2.2.2',
    copyright: 'TensorFlow Authors',
    license: 'Apache-2.0',
  },
]);

/**
 * The published package that owns every extension this App embeds in an SB3.
 *
 * Extension headers read their By, Version, Repository and Docs URL lines from this record, and a
 * test keeps it equal to package.json, so a header cannot advertise another release.
 */
export const dsl4PackageMetadata = Object.freeze({
  name: '@kubohiroya/turbowarp-kamishibai-app',
  version: dsl4RuntimeProvenance[0]!.version,
  author: 'Hiroya Kubo',
  authorURL: 'https://github.com/kubohiroya',
  repository: 'https://github.com/kubohiroya/turbowarp-kamishibai-app',
  homepage: 'https://kubohiroya.github.io/turbowarp-kamishibai-app/',
});

/**
 * Produce a legal comment that survives minification and is shown by hosts
 * which display the source of an embedded extension.
 *
 * @returns {string}
 */
export function formatDsl4RuntimeProvenanceComment() {
  const lines = [
    '/*!',
    ' * Kamishibai DSL 4.0 Runtime — composed source notices',
    ' * Copyright © 2026 Hiroya Kubo.',
    ' *',
    ' * Original component title / copyright / license:',
  ];
  for (const component of dsl4RuntimeProvenance) {
    lines.push(
      ` * - ${component.title} — ${component.copyright} — ${component.license} — ${component.source}@${component.version}`,
    );
  }
  lines.push(
    ' *',
    ' * Full license texts and source revisions are recorded in LICENSES.md.',
    ' */',
  );
  return `${lines.join('\n')}\n`;
}

/**
 * The identity of the DSL 4.0 runtime extension, as one record.
 *
 * The extension header below is generated from it, and the extension build passes the same record
 * to the TurboWarp extension contract, so the two cannot drift apart.
 */
export const dsl4RuntimeExtensionMetadata = Object.freeze({
  id: 'kubohiroyakamishibairuntime4',
  name: 'Kamishibai DSL 4.0 Runtime',
  description: 'Run a self-contained TurboWarp Kamishibai DSL 4.0 story.',
  author: 'Hiroya Kubo',
  license: 'MPL-2.0',
});

export function formatDsl4RuntimeExtensionHeader() {
  const {id, name, description, author, license} = dsl4RuntimeExtensionMetadata;
  return [
    `// Name: ${name}`,
    '// Kamishibai capabilities: simple-speech-v1',
    `// ID: ${id}`,
    `// Description: ${description}`,
    `// By: ${author}`,
    `// License: ${license}`,
    // The runtime reads Scratch.vm and the DOM, so it cannot run sandboxed. sb3-toolchain reads this
    // line and makes the static bundle register a notice explaining how to reload unsandboxed,
    // instead of throwing and leaving TurboWarp's project load waiting forever.
    '// Unsandboxed: required',
    '',
    formatDsl4RuntimeProvenanceComment().trimEnd(),
    '',
  ].join('\n');
}
