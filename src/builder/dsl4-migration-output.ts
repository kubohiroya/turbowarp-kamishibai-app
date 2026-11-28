import {randomUUID} from 'node:crypto';
import {link, lstat, mkdir, realpath, unlink, writeFile} from 'node:fs/promises';
import path from 'node:path';

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), {code});
}

/** Refuse a path that already exists; migrations never overwrite. */
export async function assertDsl4MigrationPathFree(filename: string): Promise<void> {
  try {
    await lstat(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  fail('K4-MIGRATION-OUTPUT-EXISTS', `Refusing to overwrite an existing path: ${filename}`);
}

/**
 * Install every output at once, or none of them.
 *
 * Each file is written to a temporary name beside its target and then hard-linked into place, so a
 * file that appears in the meantime is never replaced. If any link fails, the outputs already
 * installed by this call are removed again.
 */
export async function writeDsl4MigrationOutputs(
  outputs: readonly {path: string; bytes: Uint8Array}[],
  inputPath: string,
): Promise<void> {
  const staged: {path: string; temporary: string; installed: boolean; dev: number; ino: number}[] =
    [];
  try {
    for (const item of outputs) {
      await mkdir(path.dirname(item.path), {recursive: true});
      const parent = await realpath(path.dirname(item.path));
      if (path.join(parent, path.basename(item.path)) === inputPath)
        fail('K4-MIGRATION-IN-PLACE', 'Output resolves to the original input file.');
      await assertDsl4MigrationPathFree(item.path);
      const temporary = path.join(parent, `.${path.basename(item.path)}.migration-${randomUUID()}`);
      await writeFile(temporary, item.bytes, {flag: 'wx'});
      const stat = await lstat(temporary);
      staged.push({path: item.path, temporary, installed: false, dev: stat.dev, ino: stat.ino});
    }
    for (const item of staged) {
      await link(item.temporary, item.path);
      item.installed = true;
    }
  } catch (error) {
    for (const item of staged.filter((s) => s.installed).reverse()) {
      const current = await lstat(item.path).catch(() => null);
      if (current?.ino === item.ino && current.dev === item.dev) await unlink(item.path);
    }
    throw error;
  } finally {
    for (const item of staged) await unlink(item.temporary).catch(() => {});
  }
}
