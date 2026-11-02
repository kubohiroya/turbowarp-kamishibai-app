import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'vitest';

import {discoverManifest} from '@kubohiroya/turbowarp-extension-loader';

import {createKamishibaiSb3} from '../scripts/sb3/build.ts';
import {createDsl4ReleaseSourceFiles} from '../scripts/sb3/dsl4-downloadable-release.ts';
import {runCli} from '../src/builder/cli.js';
import {readSb3, serializeSb3} from '../src/builder/sb3.js';
import {
  describeSb3SaveFormats,
  normalizeSb3SaveSelection,
  sb3SaveFormatSupport,
  sb3SaveFormats,
  sb3SavePayloads,
  sb3SupportedSaveFormats,
} from '../src/builder/sb3-save-format.js';
import {
  dsl4UnsandboxedExtensionIds,
  readSb3ExtensionPayloads,
  sb3PlusExtensionPath,
  verifySb3ExtensionUrls,
  writeSb3ExtensionFormat,
} from '../src/builder/sb3-extension-format.js';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const releasePins = JSON.parse(
  await readFile(new URL('fixtures/dsl4/release-pins.json', import.meta.url), 'utf8'),
);
const id = 'kubohiroyakamishibai4';
const code = '// Name: Kamishibai DSL 4.0 Runtime\n// ID: kubohiroyakamishibai4\nexport {};\n';
const dataUrl = (source: string) =>
  `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`;
const hex = (source: string) => createHash('sha256').update(source, 'utf8').digest('hex');
/** Serves one body, so a conversion from a reference has something pinned to fetch. */
const serving = (source: string) =>
  (async () =>
    new Response(new TextEncoder().encode(source), {status: 200})) as unknown as typeof fetch;

interface TestProject extends Record<string, unknown> {
  extensionURLs: Record<string, unknown>;
}

const embeddedDataProject = (extensionId = id, source = code): TestProject => ({
  targets: [{isStage: true}],
  extensions: [extensionId],
  extensionURLs: {[extensionId]: dataUrl(source)},
});

/** A Plus project another tool wrote, with metadata and a path this writer would not choose. */
function plusProject() {
  const a = '// a\n';
  const b = '// b\n';
  const archive: Record<string, Uint8Array> = {
    [`extensions/alpha-${hex(a)}.js`]: new TextEncoder().encode(a),
    [`extensions/beta-${hex(b)}.js`]: new TextEncoder().encode(b),
  };
  const project: TestProject = {
    targets: [{isStage: true}],
    extensions: ['alpha', 'beta'],
    extensionURLs: {},
    turboWarpPlus: {
      schemaVersion: 1,
      extensions: [
        {
          id: 'beta',
          source: {type: 'embedded-file', path: `extensions/beta-${hex(b)}.js`},
          execution: 'sandboxed',
          sha256: hex(b),
          version: '1.2.3',
          publisher: 'Example',
          capabilities: ['network'],
          dependencies: [],
        },
        {
          id: 'alpha',
          source: {type: 'embedded-file', path: `extensions/alpha-${hex(a)}.js`},
          execution: 'sandboxed',
          sha256: hex(a),
          capabilities: [],
          dependencies: ['beta'],
        },
      ],
    },
  };
  return {archive, project};
}

test('the vocabulary names four formats for three payloads', async () => {
  assert.deepEqual(sb3SaveFormats, [
    'remote-non-cacheable',
    'remote-cacheable',
    'embedded-file',
    'embedded-data',
  ]);
  assert.deepEqual(sb3SavePayloads, ['extensions', 'source', 'assets']);
  assert.equal(
    describeSb3SaveFormats(),
    'extensions: remote-non-cacheable|remote-cacheable|embedded-file|embedded-data; ' +
      'source: kept as built; assets: kept as built',
  );
});

test('an option left unset keeps that payload, and a named one is never ignored', async () => {
  // Leaving everything unset is a request to change nothing.
  assert.deepEqual(normalizeSb3SaveSelection({}), {
    extensions: undefined,
    source: undefined,
    assets: undefined,
    assetsAsProjectAssets: false,
  });
  // This command rewrites extensions only, so any named source or asset form is refused.
  assert.deepEqual(sb3SupportedSaveFormats('source'), []);
  assert.deepEqual(sb3SupportedSaveFormats('assets'), []);
  assert.throws(
    () => normalizeSb3SaveSelection({assets: 'embedded-data'}),
    /does not rewrite assets\. Omit --assets/u,
  );
  assert.throws(() => normalizeSb3SaveSelection({assets: 'remote-non-cacheable'}), /resolved at build time/u);
  assert.throws(
    () => normalizeSb3SaveSelection({assets: 'remote-cacheable'}),
    /no command produces one yet/u,
  );
  assert.throws(
    () => normalizeSb3SaveSelection({assets: 'embedded-file'}),
    /saveProjectSb3DontZip/u,
  );
  assert.throws(() => normalizeSb3SaveSelection({source: 'remote-non-cacheable'}), /turbowarp-document-source/u);
  assert.throws(
    () => normalizeSb3SaveSelection({assetsAsProjectAssets: true}),
    /Cannot store assets as project assets: .*convert-dsl4-assets --to project/u,
  );
  assert.deepEqual(sb3SupportedSaveFormats('extensions'), [
    'remote-non-cacheable',
    'remote-cacheable',
    'embedded-file',
    'embedded-data',
  ]);
  assert.equal(sb3SaveFormatSupport('extensions', 'remote-cacheable').supported, true);
});

test('a selection must name known options and known formats', async () => {
  assert.throws(() => normalizeSb3SaveSelection({nope: 'remote-non-cacheable'}), /Unknown save option nope/u);
  assert.throws(() => normalizeSb3SaveSelection({extensions: 'nope'}), /must be one of/u);
  assert.throws(() => normalizeSb3SaveSelection(null), /selection object is required/u);
  assert.throws(
    () => normalizeSb3SaveSelection({assetsAsProjectAssets: 'yes'}),
    /assetsAsProjectAssets must be a boolean/u,
  );
});

test('embedded-data and embedded-file round-trip the exact extension bytes', async () => {
  const archive: Record<string, Uint8Array> = {};
  const project = embeddedDataProject();
  await writeSb3ExtensionFormat(archive, project, 'embedded-file');
  assert.equal(Buffer.from(archive[sb3PlusExtensionPath(id)]!).toString('utf8'), code);
  assert.equal(project.extensionURLs[id], undefined, 'a single Plus form drops the data carrier');
  await writeSb3ExtensionFormat(archive, project, 'embedded-data');
  assert.equal(project.extensionURLs[id], dataUrl(code));
  assert.equal(archive[sb3PlusExtensionPath(id)], undefined);
  // A standard host ignores the Manifest and reads the carrier, so keeping it costs that host
  // nothing and keeps the digest, the execution mode and the dependencies for a Plus host.
  const carried = discoverManifest(project)!.extensions[0]!;
  assert.deepEqual(carried.source, {type: 'embedded-data'});
  assert.equal(carried.sha256, hex(code));
});

test('a rewrite keeps the execution mode, dependencies and metadata it found', async () => {
  const {archive, project} = plusProject();
  await writeSb3ExtensionFormat(archive, project, 'embedded-file');
  const manifest = discoverManifest(project)!;
  const beta = manifest.extensions.find((spec) => spec.id === 'beta')!;
  const alpha = manifest.extensions.find((spec) => spec.id === 'alpha')!;
  assert.equal(beta.execution, 'sandboxed', 'a sandboxed request is never promoted');
  assert.equal(alpha.execution, 'sandboxed');
  assert.deepEqual(alpha.dependencies, ['beta'], 'the dependency survives');
  assert.deepEqual(
    manifest.extensions.map((spec) => spec.id),
    ['beta', 'alpha'],
    'so the Loader still orders the dependency first',
  );
  assert.equal(beta.version, '1.2.3');
  assert.equal(beta.publisher, 'Example');
  assert.deepEqual(beta.capabilities, ['network']);
});

test('only the App’s own DSL 4.0 extensions are requested unsandboxed by default', async () => {
  assert.ok(dsl4UnsandboxedExtensionIds.includes(id));
  const runtime = embeddedDataProject();
  await writeSb3ExtensionFormat({}, runtime, 'embedded-file');
  assert.equal(discoverManifest(runtime)!.extensions[0]!.execution, 'unsandboxed');

  const thirdParty = embeddedDataProject('thirdparty', '// a sandboxed extension\n');
  await writeSb3ExtensionFormat({}, thirdParty, 'embedded-file');
  assert.equal(discoverManifest(thirdParty)!.extensions[0]!.execution, 'sandboxed');

  const named = embeddedDataProject('thirdparty', '// trusted by the caller\n');
  await writeSb3ExtensionFormat({}, named, 'embedded-file', {unsandboxed: ['thirdparty']});
  assert.equal(discoverManifest(named)!.extensions[0]!.execution, 'unsandboxed');
});

test('a rewrite releases the archive entry an extension occupied, wherever it was', async () => {
  const {archive, project} = plusProject();
  const original = Object.keys(archive).sort();
  await writeSb3ExtensionFormat(archive, project, 'embedded-file');
  for (const entry of original) assert.equal(archive[entry], undefined, `${entry} is released`);
  assert.deepEqual(Object.keys(archive).sort(), ['extensions/alpha.js', 'extensions/beta.js']);
});

test('a reference reuses the URL a project already names, and back again by fetching it', async () => {
  const archive: Record<string, Uint8Array> = {};
  const project = embeddedDataProject();
  const url = `https://example.test/${id}.js`;
  await writeSb3ExtensionFormat(archive, project, 'embedded-file', {urls: {[id]: url}});
  // Either carrier records the address, which is what keeps the way back open.
  assert.deepEqual(discoverManifest(project)!.extensions[0]!.source,
    {type: 'embedded-file', url, path: sb3PlusExtensionPath(id)});

  for (const format of ['remote-cacheable', 'remote-non-cacheable'] as const) {
    await writeSb3ExtensionFormat(archive, project, format);
    assert.deepEqual(discoverManifest(project)!.extensions[0]!.source, {type: format, url});
    assert.equal(archive[sb3PlusExtensionPath(id)], undefined, 'a reference keeps no copy');
  }

  // The project is now a reference with no bytes. It names the URL and pins the digest, so the
  // bytes are obtainable: the conversion fetches them rather than refusing.
  await writeSb3ExtensionFormat(archive, project, 'embedded-file', {fetch: serving(code)});
  assert.equal(Buffer.from(archive[sb3PlusExtensionPath(id)]!).toString('utf8'), code);
});

test('a conversion from a reference refuses anything but the bytes the project pins', async () => {
  const archive: Record<string, Uint8Array> = {};
  const project = embeddedDataProject();
  await writeSb3ExtensionFormat(archive, project, 'remote-cacheable', {
    urls: {[id]: `https://example.test/${id}.js`},
  });
  // Embedding unverified bytes would make a conversion a way to replace an extension.
  await assert.rejects(
    writeSb3ExtensionFormat(archive, project, 'embedded-file', {fetch: serving('// not it\n')}),
    /does not serve the bytes/u,
  );
  // With nothing to fetch from, there is nothing to obtain and nothing to skip.
  const noURL: TestProject = {targets: [{isStage: true}], extensions: [], extensionURLs: {}};
  noURL.turboWarpPlus = structuredClone(discoverManifest(project));
  (noURL.turboWarpPlus as {extensions: {source: unknown}[]}).extensions[0]!.source = {
    type: 'embedded-data',
  };
  await assert.rejects(
    writeSb3ExtensionFormat({}, noURL, 'embedded-file'),
    /missing the data: carrier/u,
  );
});

test('rewriting its own output is a no-op, so a converted SB3 can be rebuilt or rewritten', async () => {
  for (const format of ['embedded-file', 'remote-cacheable', 'embedded-data'] as const) {
    const archive: Record<string, Uint8Array> = {};
    const project = embeddedDataProject();
    const options = {urls: {[id]: `https://example.test/${id}.js`}, keepEmbeddedData: true};
    await writeSb3ExtensionFormat(archive, project, format, options);
    const once = serializeSb3({...archive}, structuredClone(project));
    await writeSb3ExtensionFormat(archive, project, format, options);
    assert.deepEqual(serializeSb3({...archive}, project), once, `${format} is idempotent`);
  }
});

test('keepEmbeddedData puts the data carrier beside a Plus form for standard hosts', async () => {
  const archive: Record<string, Uint8Array> = {};
  const project = embeddedDataProject();
  await writeSb3ExtensionFormat(archive, project, 'embedded-file', {keepEmbeddedData: true});
  assert.equal(project.extensionURLs[id], dataUrl(code), 'a standard host still finds it');
  assert.ok(discoverManifest(project), 'a Plus host verifies it through the Manifest');
  assert.ok(archive[sb3PlusExtensionPath(id)]);

  // A reference has no bytes in hand, but it names where they are, so the carrier can be added.
  const reference = embeddedDataProject();
  await writeSb3ExtensionFormat({}, reference, 'remote-cacheable', {
    urls: {[id]: 'https://example.test/x.js'},
  });
  await writeSb3ExtensionFormat({}, reference, 'remote-cacheable', {
    keepEmbeddedData: true,
    fetch: serving(code),
  });
  assert.equal(reference.extensionURLs[id], dataUrl(code));
});

test('the data carrier keeps dependencies, because the Manifest records them', async () => {
  const {archive, project} = plusProject();
  await writeSb3ExtensionFormat(archive, project, 'embedded-data');
  // This used to be refused, because the writer deleted the Manifest and a `data:` URL alone
  // cannot say that one extension needs another. The Manifest stays now, so it can.
  const manifest = discoverManifest(project)!;
  assert.deepEqual(manifest.extensions.find((spec) => spec.id === 'alpha')!.dependencies, ['beta']);
  assert.deepEqual(manifest.extensions.map((spec) => spec.id), ['beta', 'alpha']);
  // A standard host still finds both, in `extensions` order, knowing nothing of the dependency.
  assert.ok(String(project.extensionURLs.alpha).startsWith('data:text/javascript;base64,'));
});

test('an undeclared leftover data: URL is left alone rather than brought back', async () => {
  const project: TestProject = {
    ...embeddedDataProject(),
    extensionURLs: {[id]: dataUrl(code), leftover: dataUrl('// not declared\n')},
  };
  await writeSb3ExtensionFormat({}, project, 'embedded-file');
  assert.deepEqual(project.extensions, [id]);
  assert.equal(project.extensionURLs.leftover, dataUrl('// not declared\n'));
  assert.deepEqual(
    discoverManifest(project)!.extensions.map((spec) => spec.id),
    [id],
  );
});

test('unrelated content at the chosen archive path is refused rather than overwritten', async () => {
  await assert.rejects(
    writeSb3ExtensionFormat(
      {[sb3PlusExtensionPath(id)]: new Uint8Array([1])},
      embeddedDataProject(),
      'embedded-file',
    ),
    /already contains unrelated content/u,
  );
});

test('a project with no extension is left alone', async () => {
  const project: Record<string, unknown> = {targets: []};
  const archive: Record<string, Uint8Array> = {};
  assert.deepEqual((await writeSb3ExtensionFormat(archive, project, 'embedded-file')).converted, []);
  assert.deepEqual(project, {targets: []});
  assert.deepEqual(archive, {});
  assert.deepEqual(readSb3ExtensionPayloads(archive, project), []);
});

/**
 * Build the current release SB3 the way the release workflow does. A published artifact would be
 * the more faithful input, but the only copies live under the gitignored `site-dist/`, so reading
 * one passes or fails on whatever a checkout happens to have lying around. This rebuilds the real
 * release source instead: same single data: URL extension, no network, same result everywhere.
 */
async function buildCurrentReleaseSb3() {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'save-sb3-format-release-'));
  const sourceDirectory = path.join(temporaryRoot, 'app');
  try {
    for (const [relativePath, contents] of await createDsl4ReleaseSourceFiles()) {
      const outputPath = path.join(sourceDirectory, relativePath);
      await mkdir(path.dirname(outputPath), {recursive: true});
      await writeFile(outputPath, contents);
    }
    const {archive} = await createKamishibaiSb3({
      buildDate: '2026-08-16',
      faviconPath: path.join(repositoryRoot, 'site/favicon.png'),
      packageJsonPath: path.join(repositoryRoot, 'package.json'),
      sourceDirectory,
      version: releasePins.release.version,
    });
    return Buffer.from(archive);
  } finally {
    await rm(temporaryRoot, {recursive: true, force: true});
  }
}

test('a release SB3 converts to the Plus form and back to its exact bytes', async () => {
  const bytes = await buildCurrentReleaseSb3();
  const {archive, project} = readSb3(bytes);
  const originalURL = (project.extensionURLs as Record<string, string>)[id];
  assert.ok(originalURL?.startsWith('data:text/javascript;base64,'));
  await writeSb3ExtensionFormat(archive, project, 'embedded-file');
  assert.deepEqual(
    discoverManifest(project)!.extensions.map((spec) => [spec.source, spec.execution]),
    [[{type: 'embedded-file', path: sb3PlusExtensionPath(id)}, 'unsandboxed']],
  );
  await writeSb3ExtensionFormat(archive, project, 'embedded-data');
  assert.equal((project.extensionURLs as Record<string, string>)[id], originalURL);
});

test('the command keeps every payload it is not told to change, and bounds its input', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'save-sb3-format-'));
  try {
    const input = path.join(directory, 'in.sb3');
    const output = path.join(directory, 'out.sb3');
    await writeFile(input, serializeSb3({}, embeddedDataProject()));
    const writes: string[] = [];
    const stdout = {write: (text: string) => (writes.push(text), true)};

    await runCli(['save-sb3-format', '--input', input, '--output', output], {stdout});
    const kept = readSb3(await readFile(output)).project as TestProject;
    assert.equal(kept.extensionURLs[id], dataUrl(code), 'no --extensions means no rewrite');
    assert.equal(kept.turboWarpPlus, undefined);
    assert.match(writes.join(''), /extensions kept as they were/u);

    await assert.rejects(
      runCli(['save-sb3-format', '--input', input, '--output', output, '--max-input-bytes', '8'], {
        stdout,
      }),
      /more than --max-input-bytes 8/u,
    );
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

/** Serve fixed bodies by URL, recording what was asked, without a network. */
function fakeFetch(
  bodies: Record<string, string>,
  requests: {url: string; init?: RequestInit | undefined}[] = [],
) {
  return (async (url: string, init?: RequestInit) => {
    requests.push({url, init});
    const body = bodies[url];
    return body === undefined ? new Response('gone', {status: 404}) : new Response(body);
  }) as typeof fetch;
}

test('remote and cached URLs must serve the bytes their digest pins', async () => {
  const url = `https://example.test/${id}.js`;
  for (const format of ['remote-non-cacheable', 'remote-cacheable'] as const) {
    const archive: Record<string, Uint8Array> = {};
    const project = embeddedDataProject();
    await writeSb3ExtensionFormat(archive, project, format, {urls: {[id]: url}});

    const requests: {url: string; init?: RequestInit | undefined}[] = [];
    assert.deepEqual(
      await verifySb3ExtensionUrls(project, {fetch: fakeFetch({[url]: code}, requests)}),
      [id],
    );
    assert.equal(requests[0]!.init?.redirect, 'error', 'a redirect is refused, as the Loader does');

    // The release runtime and the npm one differ only by two header lines.
    await assert.rejects(
      verifySb3ExtensionUrls(project, {fetch: fakeFetch({[url]: `// header\n${code}`})}),
      (error: Error & {code?: string}) =>
        error.code === 'K4-EXT-FORMAT-009' && error.message.includes(hex(code)),
    );
    await assert.rejects(
      verifySb3ExtensionUrls(project, {fetch: fakeFetch({})}),
      (error: Error & {code?: string}) =>
        error.code === 'K4-EXT-FORMAT-008' && /HTTP 404/u.test(error.message),
    );
  }
  // Embedded forms name no URL, so there is nothing to fetch.
  const project = embeddedDataProject();
  await writeSb3ExtensionFormat({}, project, 'embedded-file');
  assert.deepEqual(await verifySb3ExtensionUrls(project, {fetch: fakeFetch({})}), []);
});

test('the command refuses a remote SB3 its URL cannot serve, unless told to skip the check', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'save-sb3-format-urls-'));
  try {
    const url = `https://example.test/${id}.js`;
    const input = path.join(directory, 'in.sb3');
    const output = path.join(directory, 'out.sb3');
    const urls = path.join(directory, 'urls.json');
    await writeFile(input, serializeSb3({}, embeddedDataProject()));
    await writeFile(urls, JSON.stringify({[id]: url}));
    const writes: string[] = [];
    const io = {
      stdout: {write: (text: string) => (writes.push(text), true)},
      stderr: {write: (text: string) => (writes.push(text), true)},
    };
    const args = [
      'save-sb3-format',
      '--input',
      input,
      '--output',
      output,
      '--extensions',
      'remote-cacheable',
      '--extension-urls',
      urls,
    ];

    await assert.rejects(
      runCli(args, io, {fetch: fakeFetch({[url]: '// other\n'})}),
      /does not serve the bytes/u,
    );
    await assert.rejects(readFile(output), {code: 'ENOENT'}, 'nothing is written');

    await runCli(args, io, {fetch: fakeFetch({[url]: code})});
    assert.match(writes.join(''), /1 URL\(s\) checked/u);

    await rm(output);
    await runCli([...args, '--skip-url-check'], io, {fetch: fakeFetch({})});
    assert.equal(
      discoverManifest(readSb3(await readFile(output)).project)!.extensions[0]!.sha256,
      hex(code),
    );
    assert.match(writes.join(''), /no recorded URL was confirmed/u);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
