import {strToU8, unzipSync, zipSync} from 'fflate';

/** Pack the project's stage (targets without scripts) and its original assets into a VM-loadable archive. */
export function createDsl4StageArchive(
  project: Readonly<Record<string, unknown>>,
  projectFiles: unknown,
) {
  if (!projectFiles || typeof projectFiles !== 'object' || Array.isArray(projectFiles))
    throw new TypeError('Standard project files required');
  const archive: Record<string, Uint8Array> = Object.create(null);
  let total = 0;
  for (const [name, value] of Object.entries(projectFiles)) {
    if (name === 'project.json') continue;
    if (
      name.startsWith('/') ||
      name.includes('\\') ||
      name.includes('\0') ||
      name.split('/').some((part) => !part || part === '.' || part === '..')
    )
      throw new TypeError('Unsafe stage archive entry');
    const bytes =
      typeof value === 'string'
        ? strToU8(value)
        : value instanceof Uint8Array
          ? new Uint8Array(value)
          : value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : null;
    if (!bytes) throw new TypeError('Invalid Standard project file');
    total += bytes.length;
    if (total > 64 * 1024 * 1024 || Object.keys(archive).length >= 4096)
      throw new TypeError('Stage assets exceed limit');
    archive[name] = bytes;
  }
  const scratchProject = structuredClone(project) as {
    extensions?: unknown;
    extensionURLs?: unknown;
    extensionStorage?: unknown;
    monitors?: unknown;
    targets: {
      blocks: unknown;
      comments?: unknown;
      costumes?: {md5ext?: string}[];
      sounds?: {md5ext?: string}[];
    }[];
  };
  delete scratchProject.extensions;
  delete scratchProject.extensionURLs;
  delete scratchProject.extensionStorage;
  for (const target of scratchProject.targets) {
    target.blocks = {};
    target.comments = {};
    for (const asset of [...(target.costumes ?? []), ...(target.sounds ?? [])]) {
      if (typeof asset.md5ext === 'string' && !archive[asset.md5ext])
        throw new TypeError(`Stage archive requires original project asset: ${asset.md5ext}`);
    }
  }
  const bytes = zipSync({...archive, 'project.json': strToU8(JSON.stringify(scratchProject))});
  if (bytes.length > 64 * 1024 * 1024) throw new TypeError('Stage archive exceeds limit');
  unpackDsl4StageArchive(bytes);
  return {bytes};
}
/** Check entry metadata before inflation to keep copied originals within the same memory bound. */
export function unpackDsl4StageArchive(bytes: Uint8Array) {
  let total = 0,
    count = 0;
  return unzipSync(bytes, {
    filter(entry) {
      if (
        ++count > 4096 ||
        entry.originalSize > 64 * 1024 * 1024 ||
        (total += entry.originalSize) > 64 * 1024 * 1024
      )
        throw new TypeError('Expanded stage archive exceeds limit');
      if (
        entry.name.startsWith('/') ||
        entry.name.includes('\\') ||
        entry.name.includes('\0') ||
        entry.name.split('/').some((part) => !part || part === '.' || part === '..')
      )
        throw new TypeError('Unsafe stage archive entry');
      return true;
    },
  });
}
