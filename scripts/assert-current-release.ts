import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export type Run = (args: string[]) => string;

/**
 * Changes under these paths cannot reach a published artifact: no build, pack or site step reads
 * them, so main carrying only such commits still describes what this release publishes. Everything
 * else is publication relevant, `package.json`, `pnpm-lock.yaml`, `src/`, `scripts/`, `schema/`,
 * `release-metadata/` and `site/` among them.
 */
const publicationFreePrefixes = ['docs/'];

/** How far main may have advanced during a release run and still be comparable here. */
const mainFetchDepth = 100;

function remoteSha(git: Run, ref: string) {
  const rows = git(['ls-remote', 'origin', ref]).trim().split('\n');
  assert.equal(rows.length, 1, 'The release ref is missing or ambiguous.');
  return rows[0]?.split(/\s+/u)[0];
}

/**
 * The release checkout is shallow and holds the tag alone; deepen it just enough to compare the
 * release commit with main, and report the tip it actually brought in.
 */
function fetchMain(git: Run) {
  const shallow = git(['rev-parse', '--is-shallow-repository']).trim() === 'true';
  git([
    'fetch',
    '--no-tags',
    '--quiet',
    ...(shallow ? [`--depth=${mainFetchDepth}`] : []),
    'origin',
    '+refs/heads/main:refs/remotes/origin/main',
  ]);
  return git(['rev-parse', 'refs/remotes/origin/main']).trim();
}

/**
 * A stale release job must not change mutable registry tags or request a Pages build. The tag must
 * still name the release commit, and the release commit must still be on main: main may have moved
 * ahead by commits that only touch publication free paths, which no publication step reads.
 */
export function assertCurrentRelease({
  sha = process.env.GITHUB_SHA,
  tag = process.env.GITHUB_REF_NAME,
  git = (args: string[]) => execFileSync('git', args, {encoding: 'utf8'}),
}: {sha?: string; tag?: string; git?: Run} = {}) {
  assert(sha && /^[a-f0-9]{40}$/u.test(sha), 'A release commit is required.');
  assert(tag && /^v[0-9A-Za-z.-]+$/u.test(tag), 'A release tag is required.');
  assert.equal(remoteSha(git, `refs/tags/${tag}^{}`), sha, 'The release tag advanced.');
  if (remoteSha(git, 'refs/heads/main') === sha) return sha;
  const head = fetchMain(git);
  assert(/^[a-f0-9]{40}$/u.test(head), 'The current main could not be read.');
  try {
    git(['merge-base', '--is-ancestor', sha, head]);
  } catch {
    throw new Error('The release commit is no longer on main.');
  }
  const changed = git(['diff', '--name-only', '-z', sha, head]).split('\0').filter(Boolean);
  const relevant = changed.filter(
    (file) => !publicationFreePrefixes.some((prefix) => file.startsWith(prefix)),
  );
  assert.equal(
    relevant.length,
    0,
    `main advanced past the release with publication relevant changes: ${relevant.join(', ')}`,
  );
  return head;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const head = assertCurrentRelease();
  const sha = process.env.GITHUB_SHA;
  console.log(
    head === sha
      ? `The release commit ${sha} is the current main.`
      : `The release commit ${sha} is still on main (${head}); only publication free paths changed.`,
  );
}
