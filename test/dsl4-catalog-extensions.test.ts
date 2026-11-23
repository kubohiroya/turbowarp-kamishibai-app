import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {test} from 'vitest';

import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate';

import {authorDsl4BlockSourceSb3} from '../src/builder/dsl4-block-source-author.js';
import {
  dsl4CatalogAuthoredRuntimePath,
  dsl4CatalogBlockAuthoringVariants,
  dsl4CatalogRuntimeArtifactPaths,
  wrapDsl4AuthoredRuntimeSource,
} from '../src/builder/dsl4-catalog-extensions.js';
import {readDsl4NarrativeRuntimeExtensionSource} from '../src/builder/dsl4-playback-runtime-source.js';
import {dsl4BlockAuthoringExtensionId} from '../src/dsl4/structured-block-source.js';
import {dsl4TestSourceFrontend} from './helpers/dsl4-test-frontend.ts';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const catalog = packageJson.turbowarpExtension.catalog as {artifact: string; variants: string[]}[];
const sha256 = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');
const headerId = (source: string) => /^\/\/ ID: (\S+)$/mu.exec(source.slice(0, 4096))?.[1];

test('package.json lists every runtime and Block Script the package can put in a project', () => {
  const declared = catalog.flatMap(({artifact, variants}) => [artifact, ...variants]);
  assert.deepEqual(
    [...declared].sort(),
    [
      ...dsl4CatalogRuntimeArtifactPaths,
      dsl4CatalogAuthoredRuntimePath,
      ...dsl4CatalogBlockAuthoringVariants().map(({path}) => path),
    ].sort(),
  );
  assert.equal(new Set(declared).size, declared.length);
});

test('each catalog entry names one extension ID in all of its variants', async () => {
  const runtimeIds = await Promise.all(
    dsl4CatalogRuntimeArtifactPaths.map(async (path) =>
      headerId(
        await readFile(new URL(`../${path.replace(/^dist\//u, 'src/')}`, import.meta.url), 'utf8'),
      ),
    ),
  );
  assert.deepEqual(new Set(runtimeIds), new Set(['kubohiroyakamishibai4']));
  const variants = dsl4CatalogBlockAuthoringVariants();
  assert.deepEqual(
    new Set(variants.map(({source}) => headerId(source))),
    new Set([dsl4BlockAuthoringExtensionId]),
  );
  assert.equal(new Set(variants.map(({source}) => sha256(source))).size, variants.length);
});

test('an authored SB3 carries exactly the bytes of a listed Block Script variant', () => {
  const listed = new Set(dsl4CatalogBlockAuthoringVariants().map(({source}) => sha256(source)));
  for (const extensions of [['kubohiroyakamishibai4'], ['kubohiroyakamishibairuntime4']])
    for (const sourceSections of [false, true]) {
      const project = {
        targets: [
          {isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}},
        ],
        monitors: [],
        extensions,
      };
      const result = authorDsl4BlockSourceSb3({
        baseBytes: new Uint8Array(
          zipSync({'project.json': strToU8(JSON.stringify(project))}, {level: 6}),
        ),
        sourceText: "kamishibai: '4.0'\nscenes:\n  opening:\n    - wait: 0\n",
        sourceFrontend: dsl4TestSourceFrontend,
        sourceSections,
      });
      assert.ok(result.ok);
      const written = JSON.parse(strFromU8(unzipSync(result.bytes)['project.json']!)) as {
        extensionURLs: Record<string, string>;
      };
      const url = written.extensionURLs[dsl4BlockAuthoringExtensionId]!;
      assert.ok(listed.has(sha256(Buffer.from(url.split(',')[1]!, 'base64'))));
    }
});

test('a work authored with the standard features carries the published authored runtime', async () => {
  const runtime = await readDsl4NarrativeRuntimeExtensionSource('authoring');
  const project = {
    targets: [{isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}}],
    monitors: [],
    extensions: ['kubohiroyakamishibai4'],
    extensionURLs: {kubohiroyakamishibai4: 'data:text/javascript;base64,'},
  };
  const result = authorDsl4BlockSourceSb3({
    baseBytes: new Uint8Array(zipSync({'project.json': strToU8(JSON.stringify(project))})),
    sourceText: "kamishibai: '4.0'\nscenes:\n  opening:\n    - wait: 0\n",
    sourceFrontend: dsl4TestSourceFrontend,
    narrativeRuntimeSource: runtime,
  });
  assert.ok(result.ok);
  const written = JSON.parse(strFromU8(unzipSync(result.bytes)['project.json']!)) as {
    extensionURLs: Record<string, string>;
  };
  const carried = Buffer.from(
    written.extensionURLs.kubohiroyakamishibai4!.split(',')[1]!,
    'base64',
  );
  assert.equal(sha256(carried), sha256(wrapDsl4AuthoredRuntimeSource(runtime)));
  assert.equal(headerId(carried.toString()), 'kubohiroyakamishibai4');
});
