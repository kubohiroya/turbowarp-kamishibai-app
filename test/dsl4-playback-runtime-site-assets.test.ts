import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {test} from 'vitest';

import {dsl4PlaybackRuntimeSite} from '../scripts/sb3/playback-runtime-site.ts';
import {
  readSitePlaybackRuntimeVersions,
  readTarballFile,
  writePlaybackRuntimeSiteAssets,
} from '../scripts/sb3/playback-runtime-site-assets.ts';

const generated = 'builder/generated/dsl4-narrative-playback-runtime-extension.js';

/** A gzip-compressed ustar archive, as npm packs a package. */
function tarball(files: Record<string, string>) {
  const blocks: Buffer[] = [];
  for (const [name, text] of Object.entries(files)) {
    const body = Buffer.from(text);
    const header = Buffer.alloc(512);
    header.write(name, 0, 100);
    header.write('0000644\0', 100);
    header.write(`${body.byteLength.toString(8).padStart(11, '0')}\0`, 124);
    header.write('ustar\0', 257);
    header.write('00', 263);
    header.fill(' ', 148, 156);
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
    blocks.push(header, body, Buffer.alloc((512 - (body.byteLength % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

test('reads one file out of an npm package tarball', () => {
  const archive = tarball({'package/a.txt': 'a', [`package/dist/${generated}`]: '再生'});
  assert.equal(readTarballFile(archive, `package/dist/${generated}`).toString(), '再生');
  assert.throws(() => readTarballFile(archive, 'package/missing'), /not in the package tarball/u);
});

test('records the playback runtime the site serves for a release', () => {
  const bytes = Buffer.from('再生');
  assert.deepEqual(dsl4PlaybackRuntimeSite('4.0.9', bytes), {
    version: '4.0.9',
    url: 'https://kubohiroya.github.io/turbowarp-kamishibai-app/runtime/4.0.9/kamishibai-playback.js',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.byteLength,
  });
});

test('publishes every release playback runtime since 4.0.9, earlier published ones from npm', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'playback-site-'));
  try {
    await mkdir(path.join(root, 'release-metadata'));
    for (const version of ['4.0.8', '4.0.9', '4.0.10', '4.0.11', '4.0.0-rc.20'])
      await writeFile(path.join(root, 'release-metadata', `${version}.json`), '{}');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({version: '4.0.11'}));
    await mkdir(path.join(root, 'src', path.dirname(generated)), {recursive: true});
    await writeFile(path.join(root, 'src', generated), 'current');
    assert.deepEqual(await readSitePlaybackRuntimeVersions(root), ['4.0.9', '4.0.10', '4.0.11']);

    const archive = tarball({[`package/dist/${generated}`]: 'published 4.0.9'});
    const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`;
    const requested: string[] = [];
    const fetchImpl = (async (url: string) => {
      requested.push(url);
      if (url.endsWith('/4.0.10')) return new Response('', {status: 404});
      if (url.endsWith('/4.0.9'))
        return Response.json({dist: {tarball: 'https://registry.test/a.tgz', integrity}});
      return new Response(archive);
    }) as unknown as typeof fetch;

    const site = path.join(root, 'site');
    assert.deepEqual(await writePlaybackRuntimeSiteAssets(site, {fetchImpl, root}), [
      {file: 'runtime/4.0.9/kamishibai-playback.js', size: 15},
      {file: 'runtime/4.0.11/kamishibai-playback.js', size: 7},
    ]);
    assert.deepEqual(requested, [
      'https://registry.npmjs.org/@kubohiroya%2fturbowarp-kamishibai-app/4.0.9',
      'https://registry.test/a.tgz',
      'https://registry.npmjs.org/@kubohiroya%2fturbowarp-kamishibai-app/4.0.10',
    ]);
    assert.equal(
      await readFile(path.join(site, 'runtime/4.0.9/kamishibai-playback.js'), 'utf8'),
      'published 4.0.9',
    );

    const tampered = (async (url: string) =>
      url.endsWith('/4.0.9')
        ? Response.json({dist: {tarball: 'https://registry.test/a.tgz', integrity: 'sha512-x'}})
        : new Response(archive)) as unknown as typeof fetch;
    await assert.rejects(
      writePlaybackRuntimeSiteAssets(site, {fetchImpl: tampered, root}),
      /does not match its npm integrity/u,
    );
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('the generated authoring runtime records the generated playback runtime of its release', async () => {
  const generatedDirectory = new URL('../src/builder/generated/', import.meta.url);
  const playback = await readFile(
    new URL('dsl4-narrative-playback-runtime-extension.js', generatedDirectory),
  );
  const authoring = await readFile(
    new URL('dsl4-narrative-authoring-runtime-extension.js', generatedDirectory),
    'utf8',
  );
  const {version} = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ) as {version: string};
  const site = dsl4PlaybackRuntimeSite(version, playback);
  assert(authoring.includes(site.sha256), 'the authoring runtime names the playback SHA-256');
  assert(authoring.includes(site.url), 'the authoring runtime names the playback URL');
  assert(!playback.toString('utf8').includes('kamishibai-playback.js'));
});
