/* Which model versions (NAM architectures) a sync keeps.
 *
 * Creators often publish the same capture in several architectures: legacy A1
 * (WaveNet), A2 (SlimmableContainer) and custom ("Hyper Accuracy", "COMPLEX").
 * The names rarely match ("Clean - STD" vs "[AMP] Clean - DI", "_C" vs "_S"),
 * so de-duplicating by name lets every version through. Instead, the choice is
 * made per tone (or per local pack folder): pick the architecture(s) to keep,
 * and keep every model of that architecture plus any IRs. */

import type { Model } from '../tone3000/types';

export type NamArch = '1' | '2' | 'custom';
export type ModelKind = NamArch | 'ir';

/** 'best' = A2 when the tone has it, otherwise A1, custom only as a last resort. */
export type SyncMode = 'best' | NamArch | 'all';

export const SYNC_MODES: { value: SyncMode; label: string; hint: string }[] = [
  { value: 'best', label: 'Best version', hint: 'A2 when available, otherwise A1 (custom only if nothing else). One version per capture.' },
  { value: '2', label: 'A2 only', hint: 'Skips tones that have no A2 models.' },
  { value: '1', label: 'A1 only', hint: 'Legacy models, for hosts that cannot load A2.' },
  { value: 'custom', label: 'Custom only', hint: 'Custom architectures (e.g. Hyper Accuracy).' },
  { value: 'all', label: 'Every version', hint: 'Downloads A1, A2 and custom side by side.' },
];

export const DEFAULT_SYNC_MODE: SyncMode = 'best';

const PREFERENCE: NamArch[] = ['2', '1', 'custom'];

export const isSyncMode = (v: unknown): v is SyncMode =>
  typeof v === 'string' && SYNC_MODES.some(m => m.value === v);

export const modelKind = (m: Pick<Model, 'architecture_version'>): ModelKind => {
  const v = m.architecture_version as unknown;
  if (v == null || v === '') return 'ir';
  const s = String(v);
  return s === '2' ? '2' : s === 'custom' ? 'custom' : '1';
};

/** The NAM architectures to keep, given the ones a tone (or folder) has. */
export function keptArchitectures(present: Iterable<NamArch>, mode: SyncMode): Set<NamArch> {
  const has = new Set(present);
  if (mode === 'all') return has;
  if (mode === 'best') {
    const pick = PREFERENCE.find(a => has.has(a));
    return new Set(pick ? [pick] : []);
  }
  return has.has(mode) ? new Set([mode]) : new Set();
}

/** Picks the models to download for one tone. IRs are always kept. */
export function selectModels<M extends Pick<Model, 'id' | 'name' | 'architecture_version'>>(models: M[], mode: SyncMode): M[] {
  const byId = new Map<number, M>();
  for (const m of models) if (!byId.has(m.id)) byId.set(m.id, m);
  const unique = Array.from(byId.values());

  const present = unique.map(modelKind).filter((k): k is NamArch => k !== 'ir');
  const keep = keptArchitectures(present, mode);
  const chosen = unique.filter(m => {
    const k = modelKind(m);
    return k === 'ir' || keep.has(k);
  });

  // Same name twice: keep the highest architecture (only matters for 'all').
  const rank = (m: M) => {
    const k = modelKind(m);
    return k === 'ir' ? -1 : PREFERENCE.length - PREFERENCE.indexOf(k);
  };
  const byName = new Map<string, M>();
  for (const m of chosen) {
    const existing = byName.get(m.name);
    if (!existing || rank(m) > rank(existing)) byName.set(m.name, m);
  }
  return Array.from(byName.values());
}

/** True when a selection has nothing but IRs although the tone had NAM models. */
export const hasNamModels = (models: Pick<Model, 'architecture_version'>[]) =>
  models.some(m => modelKind(m) !== 'ir');
