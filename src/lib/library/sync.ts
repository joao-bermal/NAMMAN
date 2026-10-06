/* Downloads one tone into the local library, keeping a single version per capture. */

import type { T3KClient } from '../tone3000/tone3000-client';
import type { Model, Tone } from '../tone3000/types';
import { archiveFile, isA2File, isNamFile, listEntries, readJson, writeFile, writeJson } from './fs';
import { METADATA_FILE, gearFolder, safeName, type PackLocation, type PackMetadata, type PackModelInfo } from './library';
import { hasNamModels, modelKind, selectModels, type NamArch, type SyncMode } from './versions';

export class NoMatchingModelsError extends Error {
  constructor(tone: Pick<Tone, 'title'>, mode: SyncMode) {
    super(`"${tone.title}" has no models for the "${mode}" version setting.`);
    this.name = 'NoMatchingModelsError';
  }
}

export interface SyncOutcome {
  location: PackLocation;
  meta: PackMetadata;
  /** Models written (or handed to the browser download fallback). */
  written: number;
  /** Selected models that failed to download. When > 0 nothing is archived. */
  failed: number;
  /** Paths (relative to the library root) of files moved to the archive. */
  archived: string[];
}

interface SyncOptions {
  client: T3KClient;
  /** Library root, or null to fall back to plain browser downloads. */
  root: FileSystemDirectoryHandle | null;
  tone: Tone;
  mode: SyncMode;
  /** Where this tone already lives locally (found by tone id), so renamed tones reuse their folder. */
  location?: PackLocation;
  /** Optional link stored in metadata.json. */
  url?: string;
}

// The API caps page_size; big community packs have more than one page.
async function listAllModels(client: T3KClient, toneId: number, architecture?: number): Promise<Model[]> {
  const out: Model[] = [];
  let page = 1;
  let pages = 1;
  do {
    const res = await client.listModels(toneId, { page, pageSize: 100, architecture });
    out.push(...res.data);
    pages = res.total_pages || 1;
    page += 1;
  } while (page <= pages && page <= 10);
  return out;
}

function browserDownload(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function syncTone({ client, root, tone, mode, location, url }: SyncOptions): Promise<SyncOutcome> {
  // Omitting `architecture` returns A1 + custom + IRs; A2 needs its own listing.
  // Sequential on purpose: the client queue throttles requests to avoid rate limits.
  const legacy = await listAllModels(client, tone.id);
  const a2 = await listAllModels(client, tone.id, 2);
  const all = [...legacy, ...a2];
  const selected = selectModels(all, mode);
  if (selected.length === 0 || (hasNamModels(all) && !hasNamModels(selected))) {
    throw new NoMatchingModelsError(tone, mode);
  }

  const target = location ?? { category: gearFolder(tone), folder: safeName(tone.title || '', 'Unnamed_Pack') };
  let pack: FileSystemDirectoryHandle | null = null;
  if (root) {
    const category = await root.getDirectoryHandle(target.category, { create: true });
    pack = await category.getDirectoryHandle(target.folder, { create: true });
  }
  const previous = pack ? await readJson<PackMetadata>(pack, METADATA_FILE) : null;

  const usedNames = new Set<string>();
  const models: PackModelInfo[] = [];
  let failed = 0;

  for (const m of selected) {
    try {
      if (!m.model_url) throw new Error('missing model_url');
      const res = await client.directDownload(m.model_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();

      let internalMetadata: unknown = null;
      let internalArchitecture: string | null = null;
      try {
        const parsed = JSON.parse(await blob.text());
        internalMetadata = parsed.metadata ?? null;
        internalArchitecture = parsed.architecture ?? null;
      } catch {
        // Not JSON (an IR .wav)
      }

      let base = safeName(m.name || '', 'model');
      if (usedNames.has(base)) {
        let j = 2;
        while (usedNames.has(`${base}_${j}`)) j++;
        base = `${base}_${j}`;
      }
      usedNames.add(base);
      const ext = (new URL(m.model_url).pathname.match(/\.([a-z0-9]+)$/i)?.[0] ?? '.nam').toLowerCase();
      const filename = base + ext;

      if (pack) await writeFile(pack, filename, blob);
      else browserDownload(blob, filename);

      models.push({
        id: m.id,
        name: m.name,
        size: m.size ?? null,
        architecture: m.architecture_version ?? null,
        filename,
        internal_metadata: internalMetadata,
        internal_architecture: internalArchitecture,
      });
    } catch (err) {
      failed += 1;
      console.error(`Error downloading model ${m.name}:`, err);
    }
  }

  // Move out files this sync replaced: anything the previous sync wrote that is no
  // longer selected, plus model files of an architecture we didn't keep (leftovers
  // from older versions of NAMMAN). Only after a complete sync, and only to _Archive.
  const archived: string[] = [];
  if (root && pack && failed === 0) {
    const keep = new Set(selected.map(modelKind).filter((k): k is NamArch => k !== 'ir'));
    const written = new Set(models.map(m => m.filename));
    const listedBefore = new Set((previous?.models ?? []).map(m => m.filename));

    for (const entry of await listEntries(pack)) {
      if (entry.kind !== 'file' || entry.name === METADATA_FILE || written.has(entry.name)) continue;
      let replaced = listedBefore.has(entry.name);
      if (!replaced && isNamFile(entry.name) && keep.size > 0) {
        const a2 = await isA2File(await (entry as FileSystemFileHandle).getFile());
        replaced = a2 ? !keep.has('2') : !keep.has('1') && !keep.has('custom');
      }
      if (replaced) archived.push(await archiveFile(root, pack, target.category, target.folder, entry.name));
    }
  }

  const meta: PackMetadata = {
    id: tone.id,
    title: tone.title,
    description: tone.description,
    gear: tone.gear,
    platform: tone.platform,
    creator: tone.user?.username || 'unknown',
    creator_id: tone.user_id,
    url,
    downloads_count: tone.downloads_count,
    favorites_count: tone.favorites_count,
    makes: tone.makes || [],
    tags: tone.tags || [],
    models,
    synced_at: new Date().toISOString(),
    sync_mode: mode,
  };

  if (pack) await writeJson(pack, METADATA_FILE, meta);
  else browserDownload(new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }), METADATA_FILE);

  return { location: target, meta, written: models.length, failed, archived };
}
