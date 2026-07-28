/**
 * Persistence.
 *
 * Two halves live here:
 *  1. A pure save-payload codec (encodeSave/decodeSave/stampSavedAt) shared by
 *     the sim worker (which assembles saves without ever calling Date.now —
 *     determinism rule) and the main thread (which stamps `savedAt` before the
 *     bytes hit disk). Layout, all little-endian u32 length prefixes:
 *       [u32 headerJsonLen][headerJson][u32 gridLen][gridBytes][u32 metaJsonLen][metaJson]
 *  2. IndexedDB storage ('slimcity' db, 'saves' store) plus the autosave
 *     cadence driver (every 2 game-months of snapshot ticks) and the
 *     saveNow()/loadLatest() worker bridges.
 */
import { TICKS_PER_MONTH } from '../shared/constants';
import type { CityStats, MainToWorker, SaveHeader } from '../shared/types';
import type { SerializedBuildingRegistry } from '../sim/buildings';

// ---------------------------------------------------------------------------
// Save payload codec (pure)
// ---------------------------------------------------------------------------

/** Everything a save carries besides the raw grid layers. */
export interface SaveMeta {
  registry: SerializedBuildingRegistry;
  stats: CityStats;
}

export interface SavePayload {
  header: SaveHeader;
  /** serializeGrid() output. */
  grid: ArrayBuffer;
  meta: SaveMeta;
}

const U32_BYTES = 4;

export function encodeSave(payload: SavePayload): ArrayBuffer {
  const encoder = new TextEncoder();
  const headerBytes = encoder.encode(JSON.stringify(payload.header));
  const metaBytes = encoder.encode(JSON.stringify(payload.meta));
  const gridBytes = new Uint8Array(payload.grid);

  const total =
    U32_BYTES + headerBytes.length + U32_BYTES + gridBytes.length + U32_BYTES + metaBytes.length;
  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const out = new Uint8Array(buffer);

  let offset = 0;
  view.setUint32(offset, headerBytes.length, true);
  offset += U32_BYTES;
  out.set(headerBytes, offset);
  offset += headerBytes.length;

  view.setUint32(offset, gridBytes.length, true);
  offset += U32_BYTES;
  out.set(gridBytes, offset);
  offset += gridBytes.length;

  view.setUint32(offset, metaBytes.length, true);
  offset += U32_BYTES;
  out.set(metaBytes, offset);

  return buffer;
}

export function decodeSave(buf: ArrayBuffer): SavePayload {
  if (buf.byteLength < U32_BYTES * 3) {
    throw new Error(`decodeSave: buffer too small (${buf.byteLength} bytes)`);
  }
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const decoder = new TextDecoder();

  let offset = 0;
  const readSegment = (): Uint8Array => {
    if (offset + U32_BYTES > buf.byteLength) {
      throw new Error('decodeSave: truncated length prefix');
    }
    const len = view.getUint32(offset, true);
    offset += U32_BYTES;
    if (offset + len > buf.byteLength) {
      throw new Error('decodeSave: truncated segment');
    }
    const segment = bytes.slice(offset, offset + len);
    offset += len;
    return segment;
  };

  const header = JSON.parse(decoder.decode(readSegment())) as SaveHeader;
  const gridBytes = readSegment();
  const meta = JSON.parse(decoder.decode(readSegment())) as SaveMeta;

  // Copy the grid segment into a plain, independently-owned ArrayBuffer.
  const grid = new ArrayBuffer(gridBytes.byteLength);
  new Uint8Array(grid).set(gridBytes);
  return { header, grid, meta };
}

/** Re-encodes `buf` with header.savedAt set (main thread stamps wall-clock time). */
export function stampSavedAt(buf: ArrayBuffer, savedAt: number): ArrayBuffer {
  const payload = decodeSave(buf);
  return encodeSave({ ...payload, header: { ...payload.header, savedAt } });
}

// ---------------------------------------------------------------------------
// Autosave cadence
// ---------------------------------------------------------------------------

export const AUTOSAVE_INTERVAL_TICKS = 2 * TICKS_PER_MONTH;

/**
 * Fires `trigger` whenever the observed snapshot tick has advanced two
 * game-months past the last save. The first observed tick only sets the
 * baseline (no save of a brand-new/just-loaded city).
 */
export class AutoSaver {
  private lastSaveTick: number | null = null;

  constructor(private readonly trigger: () => void) {}

  onSnapshotTick(tick: number): void {
    if (this.lastSaveTick === null || tick < this.lastSaveTick) {
      this.lastSaveTick = tick;
      return;
    }
    if (tick - this.lastSaveTick >= AUTOSAVE_INTERVAL_TICKS) {
      this.lastSaveTick = tick;
      this.trigger();
    }
  }
}

// ---------------------------------------------------------------------------
// IndexedDB storage
// ---------------------------------------------------------------------------

const DB_NAME = 'slimcity';
const DB_VERSION = 1;
const SAVES_STORE = 'saves';
const SAVED_AT_INDEX = 'savedAt';
const MAX_STORED_SAVES = 10;

interface SaveRecord {
  id?: number;
  savedAt: number;
  mapName: string;
  tick: number;
  data: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SAVES_STORE)) {
        const store = db.createObjectStore(SAVES_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex(SAVED_AT_INDEX, 'savedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB.open failed'));
  });
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/**
 * Stamps `savedAt = Date.now()` into the worker-produced save payload and
 * stores it. Old saves beyond MAX_STORED_SAVES are pruned (oldest first).
 * Returns the stamped header.
 */
export async function storeSave(data: ArrayBuffer): Promise<SaveHeader> {
  const savedAt = Date.now();
  const stamped = stampSavedAt(data, savedAt);
  const header = decodeSave(stamped).header;

  const db = await openDb();
  try {
    const tx = db.transaction(SAVES_STORE, 'readwrite');
    const store = tx.objectStore(SAVES_STORE);
    const record: SaveRecord = {
      savedAt,
      mapName: header.mapName,
      tick: header.tick,
      data: stamped,
    };
    await requestToPromise(store.add(record));

    const keys = (await requestToPromise(store.getAllKeys())) as IDBValidKey[];
    if (keys.length > MAX_STORED_SAVES) {
      // Auto-increment keys are insertion-ordered: prune the oldest records.
      const excess = keys.slice(0, keys.length - MAX_STORED_SAVES);
      for (const key of excess) {
        await requestToPromise(store.delete(key));
      }
    }
    return header;
  } finally {
    db.close();
  }
}

/** The most recent stored save's payload, or null when nothing is saved yet. */
export async function loadLatestSave(): Promise<{ header: SaveHeader; data: ArrayBuffer } | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(SAVES_STORE, 'readonly');
    const store = tx.objectStore(SAVES_STORE);
    const records = (await requestToPromise(store.getAll())) as SaveRecord[];
    if (records.length === 0) return null;
    let latest = records[0]!;
    for (const record of records) {
      if (record.savedAt > latest.savedAt) latest = record;
    }
    return { header: decodeSave(latest.data).header, data: latest.data };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Worker bridges
// ---------------------------------------------------------------------------

/** Asks the sim worker for a save; the resulting 'save' message should be routed to storeSave(). */
export function saveNow(worker: Worker): void {
  const msg: MainToWorker = { type: 'requestSave' };
  worker.postMessage(msg);
}

/** Loads the most recent save into the sim worker. Resolves false when no save exists. */
export async function loadLatest(worker: Worker): Promise<boolean> {
  const latest = await loadLatestSave();
  if (!latest) return false;
  const msg: MainToWorker = { type: 'loadSave', data: latest.data };
  worker.postMessage(msg, [latest.data]);
  return true;
}
