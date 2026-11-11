import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'vitest';

import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate';

import {authorDsl4BlockSourceSb3} from '../src/builder/dsl4-block-source-author.js';
import {embeddedYamlAuthoringRuntimeURL} from '../src/dsl4/generated/embedded-yaml-authoring-runtime.js';
import {
  createDsl4BlockAuthoringExtensionSource,
  createDsl4BlockAuthoringInfo,
  dsl4BlockAuthoringExtensionId,
} from '../src/dsl4/structured-block-source.js';
import {dsl4TestSourceFrontend} from './helpers/dsl4-test-frontend.ts';

/**
 * The security dialog's reading of an extension: only the leading comment block, never getInfo().
 * Mirrors parseExtensionMetadata in @kubohiroya/turbowarp-extension-security-dialog (src/info.js).
 */
function parseHeader(source: string) {
  const header = /^\s*(?:(?:\/\/[^\n]*(?:\n|$))|(?:\/\*[\s\S]*?\*\/)\s*)*/u.exec(
    source.slice(0, 16384),
  )![0];
  const fields: Record<string, string> = {};
  for (const line of header.split('\n')) {
    const match = /^\s*\/\/\s*([\w -]+(?:\[[a-z-]+\])?):\s*(.*?)\s*$/iu.exec(line);
    if (match && !Object.hasOwn(fields, match[1]!)) fields[match[1]!] = match[2]!;
  }
  return fields;
}

function decode(url: string) {
  assert.match(url, /^data:text\/javascript;base64,/u);
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64').toString('utf8');
}

const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
) as {
  name: string;
  version: string;
  homepage: string;
  author: {name: string; url: string};
  repository: {url: string};
};

function assertHeader(source: string) {
  const fields = parseHeader(source);
  assert.equal(fields.Name, createDsl4BlockAuthoringInfo().name);
  assert.equal(fields.Name, 'Kamishibai Block Script');
  assert.equal(fields.ID, dsl4BlockAuthoringExtensionId);
  assert.equal(fields.By, packageJson.author.name);
  assert.equal(fields['Author URL'], packageJson.author.url);
  assert.equal(fields.Version, packageJson.version);
  assert.equal(
    fields.Repository,
    packageJson.repository.url.replace(/^git\+/u, '').replace(/\.git$/u, ''),
  );
  assert.equal(fields['Docs URL'], packageJson.homepage);
  assert.equal(fields.Package, packageJson.name);
  assert.equal(fields.License, 'MPL-2.0');
  assert.equal(fields.Unsandboxed, 'required');
  assert.equal(fields.Banner, createDsl4BlockAuthoringInfo().blockIconURI);
  assert.ok(fields.Description);
  assert.ok(fields['Description[ja]']);
  // The header comes first, so a dialog that stops at the first non-comment line still sees it.
  assert.ok(source.startsWith(`// Name: ${fields.Name}\n`));
}

test('the block-script authoring extension source starts with its TurboWarp header', () => {
  assertHeader(createDsl4BlockAuthoringExtensionSource());
  assertHeader(
    createDsl4BlockAuthoringExtensionSource([], {
      sourceSections: true,
      narrativeControlEnabled: true,
    }),
  );
});

test('the embedded YAML authoring runtime carries the same header', () => {
  assertHeader(decode(embeddedYamlAuthoringRuntimeURL));
});

test('an authored block-script SB3 embeds the authoring extension with its header', () => {
  const project = {
    targets: [{isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}}],
    monitors: [],
    extensions: ['kubohiroyakamishibai4'],
  };
  const result = authorDsl4BlockSourceSb3({
    baseBytes: new Uint8Array(zipSync({'project.json': strToU8(JSON.stringify(project))})),
    sourceText: "kamishibai: '4.0'\nscenes:\n  opening:\n    - wait: 0\n",
    sourceFrontend: dsl4TestSourceFrontend,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const authored = JSON.parse(
    strFromU8(unzipSync(new Uint8Array(result.bytes))['project.json']!),
  ) as {extensionURLs: Record<string, string>};
  assertHeader(decode(authored.extensionURLs[dsl4BlockAuthoringExtensionId]!));
});
