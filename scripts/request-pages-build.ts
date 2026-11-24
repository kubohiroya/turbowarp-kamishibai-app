import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {setTimeout} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';

import {assertCurrentRelease} from './assert-current-release.ts';

type Api = (method: 'GET' | 'POST', endpoint: string) => Promise<unknown>;
const repository = 'kubohiroya/turbowarp-kamishibai-app';
const prefix = `repos/${repository}`;

/** A token push does not start legacy Pages; explicitly build and verify its exact commit. */
export async function requestPagesBuild(
  commit: string,
  sourceSha: string,
  {
    api = async (method, endpoint) =>
      JSON.parse(execFileSync('gh', ['api', '--method', method, endpoint], {encoding: 'utf8'})),
    sleep = () => setTimeout(10_000),
    attempts = 60,
    assertCurrent = () => {},
  }: {api?: Api; sleep?: () => Promise<void>; attempts?: number; assertCurrent?: () => void} = {},
) {
  assert.match(commit, /^[a-f0-9]{40}$/u);
  assert.match(sourceSha, /^[a-f0-9]{40}$/u);
  const settings = (await api('GET', `${prefix}/pages`)) as {
    build_type: string;
    source: {branch: string; path: string};
  };
  assert.equal(settings.build_type, 'legacy', 'The Pages publishing mode changed.');
  assert.deepEqual(settings.source, {branch: 'gh-pages', path: '/'}, 'Pages source changed.');
  const identity = (await api('GET', `${prefix}/git/commits/${commit}`)) as {
    sha: string;
    message: string;
  };
  assert.equal(identity.sha, commit);
  assert.equal(identity.message.trim(), `Publish verified release ${sourceSha}`);
  assertCurrent();
  await api('POST', `${prefix}/pages/builds`);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const builds = (await api('GET', `${prefix}/pages/builds?per_page=100`)) as {
      commit: string;
      status: string;
      url: string;
    }[];
    const build = builds.find((candidate) => candidate.commit === commit);
    if (build?.status === 'built') return build;
    if (build?.status === 'errored') throw new Error('The release Pages build failed.');
    if (attempt + 1 < attempts) await sleep();
  }
  throw new Error('Pages did not report a successful build of the release commit.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  const [commit] = process.argv.slice(2);
  const sourceSha = process.env.GITHUB_SHA;
  assert(commit && sourceSha);
  const build = await requestPagesBuild(commit, sourceSha, {
    assertCurrent: () => assertCurrentRelease(),
  });
  console.log(JSON.stringify({commit: build.commit, status: build.status, url: build.url}));
}
