/* The local library layout: <root>/<Category>/<Pack>/{models, metadata.json}. */

import type { Size, Tone } from '../tone3000/types';
import { ARCHIVE_DIR, listEntries, readJson } from './fs';
import type { SyncMode } from './versions';

export const METADATA_FILE = 'metadata.json';

export interface PackModelInfo {
  id: number;
  name: string;
  size: Size | null;
  /** '1' | '2' | 'custom' for NAM models, null for IRs (older syncs stored '1' for IRs too). */
  architecture: string | null;
  filename: string;
  internal_metadata: unknown;
  internal_architecture: string | null;
}

export interface PackMetadata {
  id: number;
  title: string;
  description: string | null;
  gear: string;
  platform?: string;
  creator: string;
  creator_id?: string;
  url?: string;
  downloads_count?: number;
  favorites_count?: number;
  makes: unknown[];
  tags: unknown[];
  models: PackModelInfo[];
  synced_at: string;
  sync_mode?: SyncMode;
}

export interface PackLocation {
  category: string;
  folder: string;
}

export interface LocalPack extends PackLocation {
  handle: FileSystemDirectoryHandle;
  meta: PackMetadata;
}

export const safeName = (name: string, fallback = 'Unnamed') =>
  name.replace(/[^a-z0-9 _-]/gi, '_').trim() || fallback;

/** Category folder for a tone. Shared by every page so a tone always lands in the same place. */
export const gearFolder = (tone: Pick<Tone, 'gear'>): string => {
  const g = tone.gear?.toLowerCase() || 'unknown';

  if (g === 'full-rig' || g === 'amp-cab' || g === 'amp_cab' || g === 'amp+cab') return 'Amp_and_Cab';
  if (g === 'amp' || g === 'amp-head' || g === 'amp_head') return 'Amps';
  if (g === 'pedal') return 'Pedals';
  if (g === 'ir' || g === 'cabinet' || g === 'cab') return 'Cabinets_IRs';
  if (g === 'spaces' || g === 'space') return 'Spaces';
  if (g === 'experimental') return 'Experimental';
  if (g === 'outboard') return 'Outboard';
  if (g === 'unknown') return 'Unknown';

  return g.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('_');
};

/**
 * Every pack folder NAMMAN manages (one with a metadata.json), in any category
 * folder of the library. Folders without metadata (manual packs, zips) are ignored.
 */
export async function scanLibrary(root: FileSystemDirectoryHandle): Promise<LocalPack[]> {
  const categories = (await listEntries(root)).filter(
    (e): e is FileSystemDirectoryHandle => e.kind === 'directory' && !e.name.startsWith('_') && !e.name.startsWith('.') && e.name !== ARCHIVE_DIR,
  );

  const perCategory = await Promise.all(categories.map(async category => {
    const folders = (await listEntries(category)).filter((e): e is FileSystemDirectoryHandle => e.kind === 'directory');
    const packs = await Promise.all(folders.map(async handle => {
      const meta = await readJson<PackMetadata>(handle, METADATA_FILE);
      if (!meta || typeof meta.id !== 'number') return null;
      if (!Array.isArray(meta.models)) meta.models = [];
      return { category: category.name, folder: handle.name, handle, meta } satisfies LocalPack;
    }));
    return packs.filter((p): p is LocalPack => p !== null);
  }));

  return perCategory.flat();
}
