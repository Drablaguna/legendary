import {
  ITEMS_KEY,
  TRASH_KEY,
  SETTINGS_KEY,
  TIMER_KEY,
  UI_KEY,
  OUTBOX_KEY,
  SYNC_META_KEY,
} from "../constants";
import { newId } from "../utils/helpers";

/* ==============================================================================
   Synchronous LocalStorage Helpers
   ============================================================================== */

export function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      try {
        localStorage.setItem(key + ":corrupt-backup", raw);
      } catch (e2) {}
      return fallback;
    }
  } catch (e) {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

/* ==============================================================================
   IndexedDB Layer with LocalStorage Fallback
   ============================================================================== */

const DB_NAME = "legendary_db";
const DB_VERSION = 1;
const OUTBOX_STORE = "outbox";
const ENTITIES_STORE = "entities";

let idbPromise = null;

function getIndexedDB() {
  if (typeof window === "undefined" || !window.indexedDB) {
    return null;
  }
  return window.indexedDB;
}

function initDB() {
  if (idbPromise) return idbPromise;

  const idb = getIndexedDB();
  if (!idb) {
    idbPromise = Promise.resolve(null);
    return idbPromise;
  }

  idbPromise = new Promise((resolve) => {
    try {
      const request = idb.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
          db.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(ENTITIES_STORE)) {
          db.createObjectStore(ENTITIES_STORE, { keyPath: "key" });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        resolve(null);
      };

      request.onblocked = () => {
        resolve(null);
      };
    } catch (err) {
      resolve(null);
    }
  });

  return idbPromise;
}

/* ==============================================================================
   Outbox Operations (Batched Mutation Queue)
   ============================================================================== */

/**
 * Retrieves all mutations currently waiting in the Outbox.
 * @returns {Promise<Array<{ id: string, table: string, action: string, entityId: string, data: any, timestamp: number }>>}
 */
export async function getOutbox() {
  const db = await initDB();
  if (db) {
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(OUTBOX_STORE, "readonly");
        const store = tx.objectStore(OUTBOX_STORE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      // Fallback below
    }
  }
  return readJSON(OUTBOX_KEY, []);
}

/**
 * Saves outbox mutations to both IndexedDB and LocalStorage.
 */
async function persistOutbox(mutations) {
  writeJSON(OUTBOX_KEY, mutations);

  const db = await initDB();
  if (!db) return;

  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(OUTBOX_STORE, "readwrite");
      const store = tx.objectStore(OUTBOX_STORE);
      store.clear();
      for (const m of mutations) {
        store.put(m);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {}
}

/**
 * Adds or coalesces a mutation into the Outbox.
 * @param {{ table: "items" | "trash" | "settings", action: "UPSERT" | "DELETE", entityId: string, data?: any, timestamp?: number }} param0
 */
export async function enqueueMutation({ table, action, entityId, data = null, timestamp = Date.now() }) {
  const mutations = await getOutbox();
  const existingIdx = mutations.findIndex(
    (m) => m.table === table && m.entityId === entityId
  );

  const mutation = {
    id: newId(),
    table,
    action,
    entityId,
    data,
    timestamp,
  };

  if (existingIdx >= 0) {
    const existing = mutations[existingIdx];
    if (action === "DELETE") {
      // Coalesce: mark existing as delete
      existing.action = "DELETE";
      existing.data = null;
      existing.timestamp = timestamp;
    } else {
      // Coalesce: update existing with latest data
      existing.action = "UPSERT";
      existing.data = data;
      existing.timestamp = timestamp;
    }
  } else {
    mutations.push(mutation);
  }

  await persistOutbox(mutations);
}

/**
 * Removes successfully processed mutations from the Outbox.
 * @param {string[]} appliedIds
 */
export async function removeOutboxMutations(appliedIds) {
  if (!Array.isArray(appliedIds) || !appliedIds.length) return;
  const appliedSet = new Set(appliedIds);
  const mutations = await getOutbox();
  const remaining = mutations.filter((m) => !appliedSet.has(m.id));
  await persistOutbox(remaining);
}

/**
 * Gets the number of pending outbox mutations.
 */
export async function getOutboxCount() {
  const mutations = await getOutbox();
  return mutations.length;
}

/**
 * Clears the outbox queue completely.
 */
export async function clearOutbox() {
  await persistOutbox([]);
}

/* ==============================================================================
   Sync Metadata
   ============================================================================== */

export function getLastSyncedAt() {
  const meta = readJSON(SYNC_META_KEY, {});
  return typeof meta.lastSyncedAt === "number" ? meta.lastSyncedAt : 0;
}

export function setLastSyncedAt(timestamp) {
  const meta = readJSON(SYNC_META_KEY, {});
  meta.lastSyncedAt = timestamp;
  writeJSON(SYNC_META_KEY, meta);
}

export function getClientId() {
  const meta = readJSON(SYNC_META_KEY, {});
  if (meta.clientId && typeof meta.clientId === "string") {
    return meta.clientId;
  }
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "client-" + newId() + "-" + Date.now().toString(36);
  meta.clientId = id;
  writeJSON(SYNC_META_KEY, meta);
  return id;
}

/* ==============================================================================
   Entity Persistence (Items, Trash, Settings, Timer, UI)
   ============================================================================== */

export function loadItemsFromLocal() {
  return readJSON(ITEMS_KEY, []);
}

export function saveItemsToLocal(items) {
  writeJSON(ITEMS_KEY, items);
}

export function loadTrashFromLocal() {
  return readJSON(TRASH_KEY, []);
}

export function saveTrashToLocal(trash) {
  writeJSON(TRASH_KEY, trash);
}

export function loadSettingsFromLocal() {
  return readJSON(SETTINGS_KEY, null);
}

export function saveSettingsToLocal(settings) {
  writeJSON(SETTINGS_KEY, settings);
}

export function loadTimerFromLocal() {
  return readJSON(TIMER_KEY, null);
}

export function saveTimerToLocal(timer) {
  try {
    if (timer) localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
    else localStorage.removeItem(TIMER_KEY);
  } catch (e) {}
}

export function loadUIFromLocal() {
  return readJSON(UI_KEY, null);
}

export function saveUIToLocal(ui) {
  writeJSON(UI_KEY, ui);
}
