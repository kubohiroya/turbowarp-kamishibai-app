import assert from 'node:assert/strict';
import {test} from 'vitest';

import {assertCurrentRelease} from '../scripts/assert-current-release.ts';
import {finalizeReleaseTags} from '../scripts/finalize-release-tags.ts';

const name = '@kubohiroya/turbowarp-kamishibai-app';
const version = '4.0.0-rc.58';
const sleep = async () => {};

test('waits for publication and verifies both tags after promotion', async () => {
  const commands: string[][] = [];
  let visible = false;
  const tags = {latest: '4.0.0-rc.49', next: version};
  const result = await finalizeReleaseTags(name, version, {
    sleep,
    run(args) {
      commands.push(args);
      if (args[2] === 'version') {
        if (!visible) {
          visible = true;
          throw Object.assign(new Error('pending'), {
            stdout: JSON.stringify({error: {code: 'E404'}}),
          });
        }
        return JSON.stringify(version);
      }
      if (args[0] === 'dist-tag') {
        tags.latest = version;
        return '';
      }
      return JSON.stringify(tags);
    },
  });
  assert.deepEqual(result, {latest: version, next: version});
  assert.deepEqual(
    commands.filter(([command]) => command === 'dist-tag'),
    [['dist-tag', 'add', `${name}@${version}`, 'latest']],
  );
});

test('already completed releases require no tag writes', async () => {
  await finalizeReleaseTags(name, version, {
    sleep,
    run(args) {
      assert.equal(args[0], 'view');
      return JSON.stringify(args[2] === 'version' ? version : {latest: version, next: version});
    },
  });
});

test('unpublished versions never change tags', async () => {
  await assert.rejects(
    finalizeReleaseTags(name, version, {
      sleep,
      attempts: 2,
      run(args) {
        assert.equal(args[0], 'view');
        throw Object.assign(new Error('pending'), {
          stdout: JSON.stringify({error: {code: 'E404'}}),
        });
      },
    }),
    /not visible/u,
  );
});

test('permission errors fail completion', async () => {
  const denied = new Error('OIDC permission denied');
  await assert.rejects(
    finalizeReleaseTags(name, version, {
      sleep,
      run(args) {
        if (args[0] === 'dist-tag') throw denied;
        return JSON.stringify(args[2] === 'version' ? version : {next: version});
      },
    }),
    denied,
  );
});

test('an unsuccessful tag write cannot be reported as a completed release', async () => {
  await assert.rejects(
    finalizeReleaseTags(name, version, {
      sleep,
      attempts: 2,
      run(args) {
        if (args[0] === 'dist-tag') return '';
        return JSON.stringify(args[2] === 'version' ? version : {next: version});
      },
    }),
    /incomplete/u,
  );
});

const sha = 'a'.repeat(40);
const head = 'b'.repeat(40);

/**
 * A release checkout as the guard sees it: `main` stands at `head`, the tag peels to `tagSha`,
 * and `changed` lists what main gained since the release commit.
 */
function releaseCheckout({
  tagSha = sha,
  mainSha = head,
  onMain = true,
  changed = [] as string[],
  calls = [] as string[][],
} = {}) {
  return (args: string[]) => {
    calls.push(args);
    const [command] = args;
    if (command === 'ls-remote') {
      const ref = args[2]!;
      return `${ref.startsWith('refs/tags/') ? tagSha : mainSha}\t${ref}\n`;
    }
    if (command === 'rev-parse')
      return args[1] === '--is-shallow-repository' ? 'true\n' : `${mainSha}\n`;
    if (command === 'fetch') return '';
    if (command === 'merge-base') {
      if (!onMain) throw new Error('exit status 1');
      return '';
    }
    if (command === 'diff') return changed.map((file) => `${file}\0`).join('');
    throw new Error(`Unexpected git ${args.join(' ')}`);
  };
}

test('accepts a main that advanced by documentation alone', () => {
  const calls: string[][] = [];
  assert.equal(
    assertCurrentRelease({
      sha,
      tag: `v${version}`,
      git: releaseCheckout({
        calls,
        changed: ['docs/releases/v4.0.13.md', 'docs/releases/README.md'],
      }),
    }),
    head,
  );
  assert.deepEqual(calls.filter(([command]) => command === 'fetch')[0], [
    'fetch',
    '--no-tags',
    '--quiet',
    '--depth=100',
    'origin',
    '+refs/heads/main:refs/remotes/origin/main',
  ]);
});

test('rejects a main that advanced by publication relevant changes', () => {
  assert.throws(
    () =>
      assertCurrentRelease({
        sha,
        tag: `v${version}`,
        git: releaseCheckout({
          changed: ['docs/releases/README.md', 'src/dsl4/runtime-provenance.ts'],
        }),
      }),
    /publication relevant changes: src\/dsl4\/runtime-provenance\.ts/u,
  );
});

test('rejects a tag moved off the release commit', () => {
  assert.throws(
    () =>
      assertCurrentRelease({
        sha,
        tag: `v${version}`,
        git: releaseCheckout({tagSha: head, mainSha: sha}),
      }),
    /tag advanced/u,
  );
});

test('rejects a release commit that main no longer carries', () => {
  assert.throws(
    () =>
      assertCurrentRelease({
        sha,
        tag: `v${version}`,
        git: releaseCheckout({onMain: false, changed: ['docs/releases/README.md']}),
      }),
    /no longer on main/u,
  );
});

test('an unchanged main needs no history of its own', () => {
  const calls: string[][] = [];
  assert.equal(
    assertCurrentRelease({
      sha,
      tag: `v${version}`,
      git: releaseCheckout({calls, mainSha: sha}),
    }),
    sha,
  );
  assert.deepEqual(
    calls.map(([command]) => command),
    ['ls-remote', 'ls-remote'],
  );
});

test('registry visibility waits cannot allow an obsolete release to downgrade tags', async () => {
  let moved = false;
  let calls = 0;
  const writes: string[][] = [];
  await assert.rejects(
    finalizeReleaseTags(name, version, {
      sleep: async () => {
        moved = true;
      },
      run(args) {
        if (args[2] === 'version') {
          if (calls++ === 0)
            throw Object.assign(new Error('pending'), {
              stdout: JSON.stringify({error: {code: 'E404'}}),
            });
          return JSON.stringify(version);
        }
        if (args[0] === 'dist-tag') {
          writes.push(args);
          return '';
        }
        return JSON.stringify({latest: '4.0.0-rc.60', next: '4.0.0-rc.60'});
      },
      assertCurrent() {
        assert(!moved, 'main advanced');
      },
    }),
    /main advanced/u,
  );
  assert.deepEqual(writes, []);
});

test('rechecks identity before each separate tag write', async () => {
  const writes: string[][] = [];
  let guards = 0;
  await assert.rejects(
    finalizeReleaseTags(name, version, {
      sleep,
      run(args) {
        if (args[0] === 'dist-tag') {
          writes.push(args);
          return '';
        }
        return JSON.stringify(args[2] === 'version' ? version : {});
      },
      assertCurrent() {
        guards++;
        assert(guards === 1, 'tag advanced');
      },
    }),
    /tag advanced/u,
  );
  assert.equal(guards, 2);
  assert.deepEqual(writes, [['dist-tag', 'add', `${name}@${version}`, 'latest']]);
});
