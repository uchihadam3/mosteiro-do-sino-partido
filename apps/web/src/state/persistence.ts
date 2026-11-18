/**
 * Local persistence (IndexedDB). Autosave + rolling backup + 3 manual slots + export/import.
 * Saves are versioned envelopes with a checksum (core/campaign.ts); a corrupt autosave falls back to the backup.
 */
import { migrate, toEnvelope, type CampaignState, type SaveEnvelope } from '@mosteiro/core';

const DB = 'mosteiro-sino-partido';
const STORE = 'saves';
export type SlotId = 'auto' | 'auto-backup' | 'slot1' | 'slot2' | 'slot3';
export const MANUAL_SLOTS: SlotId[] = ['slot1', 'slot2', 'slot3'];

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
async function put(slot: SlotId, env: SaveEnvelope) {
  const d = await db();
  await new Promise<void>((res, rej) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(env, slot);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function get(slot: SlotId): Promise<SaveEnvelope | null> {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(slot);
    r.onsuccess = () => res((r.result as SaveEnvelope) ?? null);
    r.onerror = () => rej(r.error);
  });
}
export async function removeSlot(slot: SlotId) {
  const d = await db();
  await new Promise<void>((res) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(slot);
    tx.oncomplete = () => res();
  });
}

let pending: CampaignState | null = null;
let timer: number | null = null;
let lastAuto: SaveEnvelope | null = null;

/** Debounced autosave; keeps the previous autosave as backup. */
export function autosave(s: CampaignState) {
  pending = s;
  if (timer) return;
  timer = window.setTimeout(flushAutosave, 350);
}
export async function flushAutosave() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!pending) return;
  const s = pending;
  pending = null;
  try {
    const env = toEnvelope(s, 'Autosave');
    if (lastAuto) await put('auto-backup', lastAuto);
    await put('auto', env);
    lastAuto = env;
  } catch (e) {
    console.warn('autosave failed', e);
  }
}

export async function saveSlot(slot: SlotId, s: CampaignState, label: string) {
  await put(slot, toEnvelope(s, label));
}

export interface SlotInfo {
  slot: SlotId;
  label: string;
  savedAt: number;
  summary: string;
  ok: boolean;
}
export async function listSlots(): Promise<SlotInfo[]> {
  const out: SlotInfo[] = [];
  for (const slot of ['auto', ...MANUAL_SLOTS] as SlotId[]) {
    try {
      const e = await get(slot);
      if (!e) continue;
      let ok = true;
      try {
        migrate(structuredClone(e));
      } catch {
        ok = false;
      }
      out.push({ slot, label: e.label, savedAt: e.savedAt, summary: summarize(e.state), ok });
    } catch {
      /* ignore */
    }
  }
  return out;
}
function summarize(s: CampaignState): string {
  const party = s.heroes.map((h) => h.name).join(', ');
  const where = s.phase === 'base' ? 'Base' : s.phase === 'combat' ? 'Em combate' : s.phase === 'gameover' ? 'Derrota' : 'Dungeon 1';
  return `${where} · ${party} · ${s.gold} ouro`;
}

/** Load a slot; if the autosave is corrupt, fall back to the backup. */
export async function loadSlot(slot: SlotId): Promise<CampaignState> {
  const e = await get(slot);
  if (!e) throw new Error('Slot vazio.');
  try {
    const s = migrate(structuredClone(e));
    if (slot === 'auto') lastAuto = e;
    return s;
  } catch (err) {
    if (slot === 'auto') {
      const b = await get('auto-backup');
      if (b) return migrate(structuredClone(b));
    }
    throw err;
  }
}
export async function hasContinue(): Promise<boolean> {
  try {
    return !!(await get('auto'));
  } catch {
    return false;
  }
}

export function exportSave(s: CampaignState) {
  const env = toEnvelope(s, 'Exportado');
  const blob = new Blob([JSON.stringify(env)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mosteiro-save-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export async function importSave(file: File): Promise<CampaignState> {
  const txt = await file.text();
  return migrate(JSON.parse(txt) as SaveEnvelope);
}
