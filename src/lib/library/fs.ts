/* Small helpers over the File System Access API used by sync and cleanup. */

/** Folder (at the library root) where replaced model files are moved, never deleted. */
export const ARCHIVE_DIR = '_Archive';

// `entries()` isn't in the default TS DOM lib yet.
type IterableDirectory = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

export async function listEntries(dir: FileSystemDirectoryHandle): Promise<FileSystemHandle[]> {
  const out: FileSystemHandle[] = [];
  for await (const [, entry] of (dir as IterableDirectory).entries()) out.push(entry);
  return out;
}

export async function getDirectory(dir: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await dir.getDirectoryHandle(name);
  } catch {
    return null;
  }
}

export async function readJson<T>(dir: FileSystemDirectoryHandle, name: string): Promise<T | null> {
  try {
    const file = await (await dir.getFileHandle(name)).getFile();
    return JSON.parse(await file.text()) as T;
  } catch {
    return null;
  }
}

export async function writeFile(dir: FileSystemDirectoryHandle, name: string, data: Blob | string): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

export const writeJson = (dir: FileSystemDirectoryHandle, name: string, value: unknown) =>
  writeFile(dir, name, JSON.stringify(value, null, 2));

export const isNamFile = (name: string) => name.toLowerCase().endsWith('.nam');

/** A2 models are SlimmableContainer files; anything else is a legacy (A1 or custom) model. */
export async function isA2File(file: File): Promise<boolean> {
  return (await file.text()).includes('"SlimmableContainer"');
}

/**
 * Moves `<root>/<category>/<folder>/<name>` to `<root>/_Archive/<category>/<folder>/<name>`
 * (adding " (2)", " (3)"… if the archive already has that name). Copies first and
 * only removes the original once the copy has the same size.
 */
export async function archiveFile(
  root: FileSystemDirectoryHandle,
  pack: FileSystemDirectoryHandle,
  category: string,
  folder: string,
  name: string,
): Promise<string> {
  const archiveRoot = await root.getDirectoryHandle(ARCHIVE_DIR, { create: true });
  const archiveCategory = await archiveRoot.getDirectoryHandle(category, { create: true });
  const target = await archiveCategory.getDirectoryHandle(folder, { create: true });

  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let targetName = name;
  for (let i = 2; await exists(target, targetName); i++) targetName = `${stem} (${i})${ext}`;

  const file = await (await pack.getFileHandle(name)).getFile();
  await writeFile(target, targetName, file);
  const copy = await (await target.getFileHandle(targetName)).getFile();
  if (copy.size !== file.size) throw new Error(`Archive copy of "${name}" is incomplete`);
  await pack.removeEntry(name);
  return `${ARCHIVE_DIR}/${category}/${folder}/${targetName}`;
}

async function exists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}
