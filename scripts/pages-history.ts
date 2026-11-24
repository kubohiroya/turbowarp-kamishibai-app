import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {lstat} from 'node:fs/promises';
import path from 'node:path';

const version = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?`;
// `runtime/<version>/` holds the runtime bundles a published work points its extension at, so a
// deployment may add a release's files but never change or drop one another work already names.
const versionedArtifact = new RegExp(
  String.raw`^(?:downloads/kamishibai-${version}\.sb3|(?:players|runtime)/${version}/.+)$`,
  'u',
);

/** Identify the same immutable URL paths at publication and verification time. */
export function isVersionedPagesArtifact(filename: string) {
  return versionedArtifact.test(filename);
}

/** Restore immutable release files from the publisher's fetched HEAD before it commits. */
export async function restorePagesHistory(repository: string, sourceDirectory: string) {
  const head = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
  });
  if (head.error) throw head.error;
  // gh-pages creates an unborn branch for the first deployment.
  if (head.status === 1 && head.stdout === '' && head.stderr === '') return [];
  assert.equal(head.status, 0, `Cannot read published Pages HEAD: ${head.stderr}`);

  const tree = execFileSync('git', ['ls-tree', '-rz', '--full-tree', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const retained: string[] = [];
  for (const entry of tree.split('\0').filter(Boolean)) {
    const separator = entry.indexOf('\t');
    const filename = entry.slice(separator + 1);
    if (!isVersionedPagesArtifact(filename)) continue;
    const [mode, kind, object] = entry.slice(0, separator).split(' ');
    assert(
      kind === 'blob' && (mode === '100644' || mode === '100755'),
      `Published release artifact must be a regular file: ${filename}`,
    );

    const incoming = path.join(sourceDirectory, filename);
    const stat = await lstat(incoming).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (stat) {
      assert(stat.isFile(), `Release artifact must be a regular file: ${filename}`);
      const candidate = execFileSync('git', ['hash-object', '--no-filters', '--', incoming], {
        cwd: repository,
        encoding: 'utf8',
      }).trim();
      assert.equal(
        candidate,
        object,
        `Refusing to replace published release artifact: ${filename}. Use a new release version.`,
      );
    }
    retained.push(filename);
  }
  // Restore from Git objects, not the generated output or the publisher's working tree.
  for (let index = 0; index < retained.length; index += 100) {
    execFileSync(
      'git',
      [
        'restore',
        '--source=HEAD',
        '--staged',
        '--worktree',
        '--',
        ...retained.slice(index, index + 100),
      ],
      {cwd: repository},
    );
  }
  return retained;
}
