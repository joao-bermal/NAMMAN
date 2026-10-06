/* Finds pack folders that hold more than one version of the same captures
 * (e.g. A1 leftovers next to A2 models) and moves the extra files to _Archive.
 * Works offline from the files on disk and each pack's metadata.json. */

import { archiveFile, isA2File, isNamFile, listEntries, writeJson } from './fs';
import { METADATA_FILE, scanLibrary, type LocalPack } from './library';
import { keptArchitectures, type NamArch, type SyncMode } from './versions';

export interface CleanupItem {
  pack: LocalPack;
  /** Model files that would move to _Archive. */
  files: string[];
  /** Model files that stay. */
  kept: number;
}

type FileKind = NamArch | 'legacy';

const isUnwanted = (kind: FileKind, keep: Set<NamArch>) =>
  kind === 'legacy' ? !keep.has('1') && !keep.has('custom') : !keep.has(kind);

async function planPack(pack: LocalPack, mode: SyncMode): Promise<CleanupItem | null> {
  const listed = new Map(pack.meta.models.map(m => [m.filename, m]));
  const kinds = new Map<string, FileKind>();

  for (const entry of await listEntries(pack.handle)) {
    if (entry.kind !== 'file' || !isNamFile(entry.name)) continue;
    const info = listed.get(entry.name);
    let kind: FileKind;
    if (info?.architecture === '2' || info?.internal_architecture === 'SlimmableContainer') kind = '2';
    else if (info?.architecture === 'custom') kind = 'custom';
    else if (info?.architecture === '1') kind = '1';
    // Not in metadata.json (left behind by an older sync): read the file itself.
    else kind = (await isA2File(await (entry as FileSystemFileHandle).getFile())) ? '2' : 'legacy';
    kinds.set(entry.name, kind);
  }

  const present = new Set<NamArch>();
  for (const kind of kinds.values()) present.add(kind === 'legacy' ? '1' : kind);
  const keep = keptArchitectures(present, mode);
  if (keep.size === 0) return null;

  const files = [...kinds].filter(([, kind]) => isUnwanted(kind, keep)).map(([name]) => name);
  // Never empty a folder of its models.
  if (files.length === 0 || files.length === kinds.size) return null;
  return { pack, files: files.sort(), kept: kinds.size - files.length };
}

export async function planCleanup(
  root: FileSystemDirectoryHandle,
  mode: SyncMode,
  onProgress?: (done: number, total: number) => void,
): Promise<CleanupItem[]> {
  if (mode === 'all') return [];
  const packs = await scanLibrary(root);
  const items: CleanupItem[] = [];
  for (let i = 0; i < packs.length; i++) {
    try {
      const item = await planPack(packs[i], mode);
      if (item) items.push(item);
    } catch (err) {
      console.error(`Could not inspect ${packs[i].category}/${packs[i].folder}:`, err);
    }
    onProgress?.(i + 1, packs.length);
  }
  return items.sort((a, b) => `${a.pack.category}/${a.pack.folder}`.localeCompare(`${b.pack.category}/${b.pack.folder}`));
}

export async function applyCleanup(
  root: FileSystemDirectoryHandle,
  items: CleanupItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ moved: number; failed: number }> {
  let moved = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i++) {
    const { pack, files } = items[i];
    const gone = new Set<string>();
    for (const name of files) {
      try {
        await archiveFile(root, pack.handle, pack.category, pack.folder, name);
        gone.add(name);
        moved += 1;
      } catch (err) {
        failed += 1;
        console.error(`Could not archive ${pack.category}/${pack.folder}/${name}:`, err);
      }
    }
    if (gone.size > 0 && pack.meta.models.some(m => gone.has(m.filename))) {
      await writeJson(pack.handle, METADATA_FILE, { ...pack.meta, models: pack.meta.models.filter(m => !gone.has(m.filename)) });
    }
    onProgress?.(i + 1, items.length);
  }
  return { moved, failed };
}
