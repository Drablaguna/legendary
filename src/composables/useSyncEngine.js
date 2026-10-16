import { reactive, computed } from "vue";
import {
  getOutbox,
  removeOutboxMutations,
  getOutboxCount,
  getLastSyncedAt,
  setLastSyncedAt,
  getClientId,
} from "../services/storage";

let reconcilerCallback = null;
let debounceTimer = null;
let isSyncInProgress = false;

export const syncState = reactive({
  status: "synced", // "synced" | "syncing" | "offline" | "error"
  pendingCount: 0,
  lastSyncedAt: getLastSyncedAt(),
  errorMessage: null,
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
});

/**
 * Registers the store reconciliation function.
 * @param {Function} fn
 */
export function registerReconciler(fn) {
  reconcilerCallback = fn;
}

/**
 * Updates pending count from storage.
 */
export async function refreshPendingCount() {
  syncState.pendingCount = await getOutboxCount();
}

/**
 * Schedules a debounced sync request.
 * @param {number} delayMs
 */
export function scheduleSync(delayMs = 3000) {
  refreshPendingCount();

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    syncState.status = "offline";
    return;
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    syncNow();
  }, delayMs);
}

/**
 * Triggers an immediate push/pull sync operation.
 */
export async function syncNow() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    syncState.isOnline = false;
    syncState.status = "offline";
    return;
  }

  if (isSyncInProgress) {
    return;
  }

  isSyncInProgress = true;
  syncState.status = "syncing";
  syncState.errorMessage = null;

  try {
    const mutations = await getOutbox();
    const lastSyncedAt = getLastSyncedAt();
    const clientId = getClientId();

    const response = await fetch("/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mutations,
        lastSyncedAt,
        clientId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 503) {
        // DATABASE_URL is not yet set in Cloudflare Pages
        syncState.status = "error";
        syncState.errorMessage = data.error || "Database URL not configured.";
      } else {
        throw new Error(data.error || `Sync error (HTTP ${response.status})`);
      }
    } else {
      // 1. Remove applied mutations from local Outbox
      if (Array.isArray(data.appliedIds) && data.appliedIds.length) {
        await removeOutboxMutations(data.appliedIds);
      }

      // 2. Reconcile server changes into reactive store
      if (data.serverChanges && reconcilerCallback) {
        reconcilerCallback(data.serverChanges);
      }

      // 3. Update sync timestamps & state
      if (typeof data.serverTime === "number") {
        setLastSyncedAt(data.serverTime);
        syncState.lastSyncedAt = data.serverTime;
      }

      syncState.pendingCount = await getOutboxCount();
      syncState.status = syncState.pendingCount > 0 ? "syncing" : "synced";
      syncState.errorMessage = null;
    }
  } catch (err) {
    syncState.status = "error";
    syncState.errorMessage = err.message || "Failed to connect to sync server.";
  } finally {
    isSyncInProgress = false;
    await refreshPendingCount();
  }
}

// Global network connectivity listeners
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    syncState.isOnline = true;
    syncNow();
  });

  window.addEventListener("offline", () => {
    syncState.isOnline = false;
    syncState.status = "offline";
  });

  // Periodically refresh pending count and check for sync when tab becomes visible
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshPendingCount();
      if (navigator.onLine && syncState.status !== "syncing") {
        const timeSince = Date.now() - syncState.lastSyncedAt;
        // If more than 3 minutes since last sync or pending items exist, trigger a background sync
        if (timeSince > 180000 || syncState.pendingCount > 0) {
          syncNow();
        }
      }
    }
  });

  // Initial pending count load
  refreshPendingCount();
}

/**
 * Composable returning reactive sync engine state and controls.
 */
export function useSyncEngine() {
  return {
    syncState,
    scheduleSync,
    syncNow,
    refreshPendingCount,
  };
}
