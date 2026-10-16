import { reactive, computed } from "vue";
import {
  TIERS,
  TOP_LEVEL_ALLOWED,
  DOMAINS,
  DEFAULT_XP,
  TRASH_DAYS,
  ITEMS_KEY,
  UI_KEY,
  TRASH_KEY,
  TIMER_KEY,
  SETTINGS_KEY,
  TARGET_RE,
  isDomain,
} from "../constants";
import {
  newId,
  isValidItem,
  tierOf,
  fmtDuration,
  levelInfo,
  fromLocalInput,
  toLocalInput,
  pad2,
} from "../utils/helpers";
import { readJSON, writeJSON, enqueueMutation } from "../services/storage";
import { scheduleSync, registerReconciler, syncNow } from "../composables/useSyncEngine";

export const store = reactive({
  items: [],
  trash: [],
  filters: [1, 2, 3, 4, 5],
  search: "",
  domain: "client",
  ovView: "list", // "list" | "calendar" | "timeline"
  ovFilter: { y: null, m: null, none: false },
  timer: null, // { id: string, startedAt: number } | null
  settings: {
    theme: "dark",
    xp: Object.assign({}, DEFAULT_XP),
    updatedAt: 0,
  },
  now: Date.now(), // live timestamp updated every second

  // UI state
  drawerOpen: false,
  selectMode: false,
  selected: new Set(),
  collapsed: new Set(),
  historyOpen: new Set(),
  overviewOpen: new Set(),
  sessionsOpen: new Set(),

  // Toast & Undo
  toast: { message: "", visible: false, timer: null },
  undo: { message: "", visible: false, fn: null, timer: null },

  // Modals
  sheet: {
    open: false,
    mode: "create", // "create" | "edit"
    parentId: null,
    id: null,
    tier: 1,
    title: "",
    notes: "",
    dlMode: "none", // "none" | "date" | "month" | "year"
    dueInput: "",
    targetMonth: new Date().getMonth(),
    targetYear: new Date().getFullYear(),
    error: "",
    focusDeadline: false,
  },
  confirmModal: {
    open: false,
    heading: "",
    text: "",
    confirmLabel: "Delete",
    isDanger: true,
    action: null,
  },
  contextMenu: {
    open: false,
    id: null,
    x: 0,
    y: 0,
    cardEl: null,
  },
});

// Periodic timer updates for live clocks
setInterval(() => {
  store.now = Date.now();
}, 1000);

/* ============ STORAGE & NORMALIZATION ============ */
export function normalizeItems(raw) {
  const seen = new Set();
  const now = Date.now();
  store.items = (Array.isArray(raw) ? raw : [])
    .filter(isValidItem)
    .filter((i) => !seen.has(i.id) && seen.add(i.id))
    .map((i) => ({
      id: i.id,
      title: i.title,
      notes: typeof i.notes === "string" ? i.notes : "",
      tier: i.tier,
      parentId: typeof i.parentId === "string" ? i.parentId : null,
      domain: isDomain(i.domain) ? i.domain : null,
      done: !!i.done,
      dueAt: typeof i.dueAt === "number" && isFinite(i.dueAt) ? i.dueAt : undefined,
      target:
        !(typeof i.dueAt === "number") && typeof i.target === "string" && TARGET_RE.test(i.target)
          ? i.target
          : undefined,
      timeSpent: typeof i.timeSpent === "number" && i.timeSpent > 0 ? Math.round(i.timeSpent) : undefined,
      sessions: Array.isArray(i.sessions)
        ? i.sessions
            .filter((s) => s && typeof s.startedAt === "number" && typeof s.seconds === "number")
            .slice(-200)
        : undefined,
      completedAt: typeof i.completedAt === "number" ? i.completedAt : undefined,
      createdAt: typeof i.createdAt === "number" ? i.createdAt : now,
      updatedAt: typeof i.updatedAt === "number" ? i.updatedAt : now,
    }));

  // Missing parent fallback to top level
  store.items.forEach((i) => {
    if (i.parentId && !seen.has(i.parentId)) i.parentId = null;
  });

  // Assign domain
  store.items.forEach((i) => {
    if (i.domain) return;
    let cur = i;
    let hops = 0;
    while (cur && !cur.domain && cur.parentId && hops++ < 10) cur = byId(cur.parentId);
    i.domain = (cur && cur.domain) || "personal";
  });

  // Ensure completedAt is present on completed items
  store.items.forEach((i) => {
    if (i.done && !i.completedAt) i.completedAt = i.updatedAt;
    if (!i.done) delete i.completedAt;
  });
}

export function normalizeTrash(raw) {
  if (!Array.isArray(raw)) return [];
  const cutoff = Date.now() - TRASH_DAYS * 86400000;
  return raw
    .filter(
      (e) =>
        e &&
        typeof e.id === "string" &&
        typeof e.rootId === "string" &&
        typeof e.deletedAt === "number" &&
        e.deletedAt > cutoff &&
        Array.isArray(e.items)
    )
    .map((e) =>
      Object.assign({}, e, {
        items: e.items.filter(isValidItem).map((i) =>
          Object.assign({}, i, {
            domain: isDomain(i.domain) ? i.domain : "personal",
            notes: typeof i.notes === "string" ? i.notes : "",
          })
        ),
      })
    )
    .filter((e) => e.items.some((i) => i.id === e.rootId));
}

export function normalizeSettings(raw) {
  const s = { theme: "dark", xp: Object.assign({}, DEFAULT_XP), updatedAt: 0 };
  if (raw && (raw.theme === "light" || raw.theme === "dark")) s.theme = raw.theme;
  if (raw && raw.xp) {
    for (let t = 1; t <= 5; t++) {
      const v = Number(raw.xp[t]);
      if (Number.isFinite(v) && v >= 0) s.xp[t] = Math.min(99999, Math.round(v));
    }
  }
  if (raw && typeof raw.updatedAt === "number") s.updatedAt = raw.updatedAt;
  return s;
}

export function loadStore() {
  const items = readJSON(ITEMS_KEY, []);
  normalizeItems(items);
  store.trash = normalizeTrash(readJSON(TRASH_KEY, []));
  store.settings = normalizeSettings(readJSON(SETTINGS_KEY, null));

  const tm = readJSON(TIMER_KEY, null);
  store.timer =
    tm && typeof tm.id === "string" && typeof tm.startedAt === "number" && byId(tm.id) ? tm : null;

  const ui = readJSON(UI_KEY, null);
  if (ui && isDomain(ui.domain)) store.domain = ui.domain;
  if (ui && Array.isArray(ui.filters)) {
    store.filters = ui.filters.filter((t) => Number.isInteger(t) && t >= 1 && t <= 5);
  }
  if (ui && typeof ui.search === "string") store.search = ui.search;
  if (ui && ["list", "calendar", "timeline"].includes(ui.ovView)) store.ovView = ui.ovView;

  applyTheme();

  // Schedule an initial background sync to fetch any remote changes
  scheduleSync(500);
}

export function save() {
  writeJSON(ITEMS_KEY, store.items);
}

export function saveSettings() {
  if (!store.settings.updatedAt) {
    store.settings.updatedAt = Date.now();
  }
  writeJSON(SETTINGS_KEY, store.settings);
  enqueueMutation({
    table: "settings",
    action: "UPSERT",
    entityId: "app_settings",
    data: store.settings,
    timestamp: store.settings.updatedAt,
  });
  scheduleSync();
}

export function saveTimer() {
  try {
    if (store.timer) localStorage.setItem(TIMER_KEY, JSON.stringify(store.timer));
    else localStorage.removeItem(TIMER_KEY);
  } catch (e) {}
}

export function saveTrash() {
  writeJSON(TRASH_KEY, store.trash);
}

export function saveUI() {
  writeJSON(UI_KEY, {
    filters: store.filters,
    search: store.search,
    domain: store.domain,
    ovView: store.ovView,
  });
}

export function applyTheme() {
  document.documentElement.dataset.theme = store.settings.theme;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    const isLight = store.settings.theme === "light";
    themeMeta.setAttribute("content", isLight ? "#F4F4F7" : "#14141A");
  }
}

export function setTheme(theme) {
  store.settings.theme = theme;
  store.settings.updatedAt = Date.now();
  saveSettings();
  applyTheme();
}

export function toggleTheme() {
  setTheme(store.settings.theme === "light" ? "dark" : "light");
}

/* ============ SERVER RECONCILIATION ============ */
export function reconcileServerChanges(changes) {
  if (!changes) return;

  let hasItemChanges = false;
  let hasTrashChanges = false;
  let hasSettingsChanges = false;

  // 1. Remote item deletions (tombstones)
  if (Array.isArray(changes.deletedItemIds) && changes.deletedItemIds.length) {
    const delSet = new Set(changes.deletedItemIds);
    const prevLen = store.items.length;
    store.items = store.items.filter((i) => !delSet.has(i.id));
    if (store.items.length !== prevLen) {
      delSet.forEach((id) => store.collapsed.delete(id));
      if (store.timer && delSet.has(store.timer.id)) {
        store.timer = null;
        saveTimer();
      }
      hasItemChanges = true;
    }
  }

  // 2. Remote item upserts (LWW)
  if (Array.isArray(changes.items) && changes.items.length) {
    for (const serverItem of changes.items) {
      if (!isValidItem(serverItem)) continue;
      const local = byId(serverItem.id);
      if (local) {
        if ((serverItem.updatedAt || 0) >= (local.updatedAt || 0)) {
          Object.assign(local, serverItem);
          hasItemChanges = true;
        }
      } else {
        const inTrash = store.trash.some((e) =>
          e.items.some((ti) => ti.id === serverItem.id)
        );
        if (!inTrash) {
          store.items.push(serverItem);
          hasItemChanges = true;
        }
      }
    }
    if (hasItemChanges) {
      normalizeItems(store.items);
    }
  }

  // 3. Remote trash deletions
  if (Array.isArray(changes.deletedTrashIds) && changes.deletedTrashIds.length) {
    const delTrashSet = new Set(changes.deletedTrashIds);
    const prevTrashLen = store.trash.length;
    store.trash = store.trash.filter((t) => !delTrashSet.has(t.id));
    if (store.trash.length !== prevTrashLen) {
      hasTrashChanges = true;
    }
  }

  // 4. Remote trash upserts
  if (Array.isArray(changes.trash) && changes.trash.length) {
    for (const serverEntry of changes.trash) {
      const localEntry = store.trash.find((t) => t.id === serverEntry.id);
      if (localEntry) {
        const sTime = serverEntry.updatedAt || serverEntry.deletedAt || 0;
        const lTime = localEntry.updatedAt || localEntry.deletedAt || 0;
        if (sTime >= lTime) {
          Object.assign(localEntry, serverEntry);
          hasTrashChanges = true;
        }
      } else {
        store.trash.unshift(serverEntry);
        hasTrashChanges = true;
      }
    }
    if (hasTrashChanges) {
      store.trash = normalizeTrash(store.trash);
    }
  }

  // 5. Remote settings
  if (changes.settings) {
    const s = changes.settings;
    const sTime = s.updatedAt || 0;
    const lTime = store.settings.updatedAt || 0;
    if (sTime >= lTime) {
      if (s.theme === "light" || s.theme === "dark") store.settings.theme = s.theme;
      if (s.xp) store.settings.xp = Object.assign({}, DEFAULT_XP, s.xp);
      store.settings.updatedAt = sTime || Date.now();
      hasSettingsChanges = true;
      applyTheme();
    }
  }

  if (hasItemChanges) save();
  if (hasTrashChanges) saveTrash();
  if (hasSettingsChanges) {
    writeJSON(SETTINGS_KEY, store.settings);
  }
}

// Register reconciler with sync engine
registerReconciler(reconcileServerChanges);

/* ============ QUERIES ============ */
export const byId = (id) => store.items.find((i) => i.id === id) || null;
export const getChildren = (id) => store.items.filter((i) => i.parentId === id);

export function getDescendants(id) {
  const out = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    for (const c of getChildren(cur)) {
      out.push(c);
      stack.push(c.id);
    }
  }
  return out;
}

export function getAncestors(id) {
  const out = [];
  const seen = new Set();
  let cur = byId(id);
  while (cur && cur.parentId && !seen.has(cur.parentId)) {
    seen.add(cur.parentId);
    cur = byId(cur.parentId);
    if (cur) out.unshift(cur);
  }
  return out;
}

export function getProgress(id) {
  const d = getDescendants(id);
  return { done: d.filter((i) => i.done).length, total: d.length };
}

export function legalTiersFor(parentId) {
  if (parentId == null) return TOP_LEVEL_ALLOWED.slice();
  const p = byId(parentId);
  if (!p) return [];
  return TIERS.map((t) => t.tier).filter((t) => t > p.tier);
}

export function tierError(item, newTier) {
  if (!legalTiersFor(item.parentId).includes(newTier)) {
    const p = item.parentId ? byId(item.parentId) : null;
    return p
      ? "It lives inside a " + tierOf(p.tier).name + ", so it must be smaller than that."
      : "That type isn't allowed at the top level.";
  }
  const kids = getChildren(item.id);
  if (kids.length) {
    const minKid = Math.min(...kids.map((k) => k.tier));
    if (newTier >= minKid) {
      return "It contains a " + tierOf(minKid).name + ", so it must be bigger than that.";
    }
  }
  return "";
}

export function visibleItems() {
  const q = store.search.trim().toLowerCase();
  return store.items
    .filter((i) => i.domain === store.domain && !i.done)
    .filter((i) => store.filters.includes(i.tier))
    .filter((i) => !q || (i.title + " " + (i.notes || "")).toLowerCase().includes(q))
    .sort((a, b) => a.tier - b.tier || b.updatedAt - a.updatedAt);
}

/* ============ FOCUS TIMER ============ */
export const timerElapsed = () =>
  store.timer ? Math.max(0, Math.floor((store.now - store.timer.startedAt) / 1000)) : 0;

export function stopTimer() {
  const t = store.timer;
  if (!t) return 0;
  const secs = timerElapsed();
  const item = byId(t.id);
  store.timer = null;
  saveTimer();
  if (item && secs >= 1) {
    item.timeSpent = (item.timeSpent || 0) + secs;
    item.sessions = (item.sessions || []).concat({ startedAt: t.startedAt, seconds: secs }).slice(-200);
    item.updatedAt = Date.now();
    save();
    enqueueMutation({
      table: "items",
      action: "UPSERT",
      entityId: item.id,
      data: item,
      timestamp: item.updatedAt,
    });
    scheduleSync();
  }
  return item ? secs : 0;
}

export function toggleTimer(id) {
  const item = byId(id);
  if (!item) return;
  if (store.timer && store.timer.id === id) {
    const secs = stopTimer();
    showToast(`Logged ${fmtDuration(secs)} on "${item.title}"`);
  } else {
    if (store.timer) {
      const prev = byId(store.timer.id);
      const secs = stopTimer();
      if (prev) showToast(`Logged ${fmtDuration(secs)} on "${prev.title}"`);
    }
    store.timer = { id, startedAt: Date.now() };
    saveTimer();
  }
}

/* ============ XP ============ */
export const xpOf = (item) => store.settings.xp[item.tier] || 0;
export const totalXp = () => store.items.reduce((sum, i) => sum + (i.done ? xpOf(i) : 0), 0);

export function xpToast(ids) {
  const gained = ids.reduce((sum, id) => {
    const i = byId(id);
    return sum + (i ? xpOf(i) : 0);
  }, 0);
  if (gained <= 0) return;
  const total = totalXp();
  const prevLevel = levelInfo(total - gained).level;
  const currLevel = levelInfo(total).level;
  const leveled = currLevel > prevLevel;
  showToast(`+${gained} XP${leveled ? ` — Level up! You're now level ${currLevel}` : ""}`);
}

/* ============ DATA OPERATIONS ============ */
export function createItem({ title, tier, parentId = null, notes = "", dueAt = null, target = null }) {
  title = (title || "").trim();
  if (!title) return { error: "Please enter a title." };
  if (!legalTiersFor(parentId).includes(tier)) return { error: "That type isn't allowed here." };

  const now = Date.now();
  const parent = parentId ? byId(parentId) : null;
  const item = {
    id: newId(),
    title,
    notes: (notes || "").trim(),
    tier,
    parentId,
    domain: parent ? parent.domain : store.domain,
    done: false,
    createdAt: now,
    updatedAt: now,
  };

  if (typeof dueAt === "number" && isFinite(dueAt)) item.dueAt = dueAt;
  else if (typeof target === "string" && TARGET_RE.test(target)) item.target = target;

  store.items.push(item);
  save();

  enqueueMutation({
    table: "items",
    action: "UPSERT",
    entityId: item.id,
    data: item,
    timestamp: item.updatedAt,
  });
  scheduleSync();

  return { item };
}

export function updateItem(id, patch) {
  const item = byId(id);
  if (!item) return { error: "Item not found." };
  const next = Object.assign({}, item, patch);
  next.title = (next.title || "").trim();
  if (!next.title) return { error: "Please enter a title." };
  if (next.tier !== item.tier) {
    const err = tierError(item, next.tier);
    if (err) return { error: err };
  }
  Object.assign(item, next, { updatedAt: Date.now() });
  if (typeof item.dueAt !== "number" || !isFinite(item.dueAt)) delete item.dueAt;
  if (item.dueAt !== undefined || typeof item.target !== "string" || !TARGET_RE.test(item.target)) {
    delete item.target;
  }
  save();

  enqueueMutation({
    table: "items",
    action: "UPSERT",
    entityId: item.id,
    data: item,
    timestamp: item.updatedAt,
  });
  scheduleSync();

  return { item };
}

export function deleteItem(id) {
  const item = byId(id);
  if (!item) return;
  trashItems([id]);
}

export function deleteMany(ids) {
  trashItems(ids);
}

export function trashItems(ids) {
  const now = Date.now();
  const idSet = new Set(ids);
  const roots = ids.map((id) => byId(id)).filter((i) => i && !getAncestors(i.id).some((a) => idSet.has(a.id)));
  const gone = new Set();
  const entryIds = [];

  roots.forEach((root) => {
    const items = [root].concat(getDescendants(root.id));
    items.forEach((i) => gone.add(i.id));
    const entry = { id: newId(), rootId: root.id, deletedAt: now, items };
    store.trash.unshift(entry);
    entryIds.push(entry.id);

    enqueueMutation({
      table: "trash",
      action: "UPSERT",
      entityId: entry.id,
      data: entry,
      timestamp: entry.deletedAt,
    });
  });

  if (store.timer && gone.has(store.timer.id)) stopTimer();
  store.items = store.items.filter((i) => !gone.has(i.id));
  gone.forEach((g) => {
    store.collapsed.delete(g);
    enqueueMutation({
      table: "items",
      action: "DELETE",
      entityId: g,
      timestamp: now,
    });
  });

  save();
  saveTrash();
  scheduleSync();

  if (roots.length) {
    showUndo(
      roots.length === 1 ? `Moved "${roots[0].title}" to Trash` : `Moved ${roots.length} items to Trash`,
      () => restoreEntries(entryIds)
    );
  }
  return gone;
}

export function restoreEntries(entryIds) {
  let count = 0;
  let topLevel = 0;
  let first = null;
  const now = Date.now();

  entryIds.forEach((eid) => {
    const k = store.trash.findIndex((e) => e.id === eid);
    if (k < 0) return;
    const entry = store.trash.splice(k, 1)[0];
    const root = entry.items.find((i) => i.id === entry.rootId);
    const parent = root.parentId ? byId(root.parentId) : null;
    if (root.parentId && (!parent || parent.tier >= root.tier)) {
      root.parentId = null;
      topLevel++;
    }
    entry.items.forEach((i) => {
      if (!byId(i.id)) {
        i.updatedAt = now;
        store.items.push(i);
        enqueueMutation({
          table: "items",
          action: "UPSERT",
          entityId: i.id,
          data: i,
          timestamp: i.updatedAt,
        });
      }
    });

    enqueueMutation({
      table: "trash",
      action: "DELETE",
      entityId: eid,
      timestamp: now,
    });

    count++;
    first = first || root;
  });

  save();
  saveTrash();
  scheduleSync();

  if (count) {
    showToast(
      (count === 1 ? `Restored "${first.title}"` : `Restored ${count} items`) +
        (topLevel ? " (its old parent is gone, so it's now top-level)" : "")
    );
  }
}

export function moveItem(id, parentId) {
  const item = byId(id);
  if (!item || item.parentId === parentId) return { error: "" };
  if (parentId) {
    const p = byId(parentId);
    if (!p || p.tier >= item.tier) return { error: `A ${tierOf(item.tier).name} can't go inside that.` };
    store.collapsed.delete(parentId);
  } else if (!TOP_LEVEL_ALLOWED.includes(item.tier)) {
    return { error: `A ${tierOf(item.tier).name} can't be at the top level.` };
  }
  item.parentId = parentId;
  item.updatedAt = Date.now();
  save();

  enqueueMutation({
    table: "items",
    action: "UPSERT",
    entityId: item.id,
    data: item,
    timestamp: item.updatedAt,
  });
  scheduleSync();

  return { item };
}

export function toggleDone(id) {
  const item = byId(id);
  if (!item) return;
  item.done = !item.done;
  const now = Date.now();
  item.updatedAt = now;
  const completed = [];
  const updatedItems = [item];

  if (item.done) {
    item.completedAt = now;
    completed.push(item.id);
    getDescendants(id).forEach((d) => {
      if (!d.done) {
        d.done = true;
        d.updatedAt = now;
        d.completedAt = now;
        completed.push(d.id);
        updatedItems.push(d);
      }
    });
  } else {
    delete item.completedAt;
  }

  if (store.timer && completed.includes(store.timer.id)) stopTimer();
  save();

  updatedItems.forEach((i) => {
    enqueueMutation({
      table: "items",
      action: "UPSERT",
      entityId: i.id,
      data: i,
      timestamp: i.updatedAt,
    });
  });
  scheduleSync();

  if (item.done) xpToast(completed);
  if (item.done && item.tier === 1) {
    showUndo(`Completed "${item.title}"`, () => uncomplete(completed));
  }
}

export function uncomplete(ids) {
  const now = Date.now();
  const updatedItems = [];
  ids.forEach((id) => {
    const i = byId(id);
    if (i) {
      i.done = false;
      i.updatedAt = now;
      delete i.completedAt;
      updatedItems.push(i);
    }
  });
  save();

  updatedItems.forEach((i) => {
    enqueueMutation({
      table: "items",
      action: "UPSERT",
      entityId: i.id,
      data: i,
      timestamp: i.updatedAt,
    });
  });
  scheduleSync();
}

export function completeMany(ids) {
  const now = Date.now();
  const completed = [];
  const legends = [];
  const updatedItems = [];

  ids.forEach((id) => {
    const item = byId(id);
    if (!item) return;
    [item].concat(getDescendants(id)).forEach((i) => {
      if (i.done) return;
      i.done = true;
      i.updatedAt = now;
      i.completedAt = now;
      completed.push(i.id);
      updatedItems.push(i);
      if (i.id === id && i.tier === 1) legends.push(i);
    });
  });

  if (store.timer && completed.includes(store.timer.id)) stopTimer();
  save();

  updatedItems.forEach((i) => {
    enqueueMutation({
      table: "items",
      action: "UPSERT",
      entityId: i.id,
      data: i,
      timestamp: i.updatedAt,
    });
  });
  scheduleSync();

  return { completed, legends };
}

export function restoreHistory(id) {
  uncomplete([id].concat(getDescendants(id).map((d) => d.id)));
}

export function emptyTrash() {
  if (!store.trash.length) return;
  const now = Date.now();
  store.trash.forEach((e) => {
    enqueueMutation({
      table: "trash",
      action: "DELETE",
      entityId: e.id,
      timestamp: now,
    });
  });
  store.trash = [];
  saveTrash();
  scheduleSync();
  showToast("Trash emptied.");
}

export function purgeTrash(id) {
  store.trash = store.trash.filter((x) => x.id !== id);
  saveTrash();
  enqueueMutation({
    table: "trash",
    action: "DELETE",
    entityId: id,
    timestamp: Date.now(),
  });
  scheduleSync();
  showToast("Deleted forever.");
}

/* ============ BACKUP & RESTORE ============ */
export function exportData() {
  const items = readJSON(ITEMS_KEY, null);
  const data = {
    app: "legendary-todo",
    version: 1,
    exportedAt: new Date().toISOString(),
    items: Array.isArray(items) ? items : store.items,
    trash: Array.isArray(readJSON(TRASH_KEY, null)) ? readJSON(TRASH_KEY, null) : store.trash,
    settings: store.settings,
    ui: readJSON(UI_KEY, null) || {
      filters: store.filters,
      search: store.search,
      domain: store.domain,
      ovView: store.ovView,
    },
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "legendary-todo-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`Exported ${data.items.length} item${data.items.length === 1 ? "" : "s"}.`);
}

export async function importFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (e) {
    showToast("Couldn't import: that file isn't valid JSON.");
    return;
  }
  const raw = Array.isArray(data) ? data : data && data.items;
  if (!Array.isArray(raw)) {
    showToast("Couldn't import: no items found in that file.");
    return;
  }
  const valid = raw.filter(isValidItem);
  if (raw.length && !valid.length) {
    showToast("Couldn't import: none of the items in that file are valid.");
    return;
  }
  const skipped = raw.length - valid.length;
  const msg =
    `Replace all ${store.items.length} current item(s) with ${valid.length} item(s) from "${file.name}"?` +
    (skipped ? `\n(${skipped} invalid entr${skipped === 1 ? "y" : "ies"} will be skipped.)` : "") +
    "\n\nThis can't be undone.";

  if (!window.confirm(msg)) return;

  normalizeItems(valid);
  store.timer = null;
  saveTimer();
  store.trash = normalizeTrash(!Array.isArray(data) && data ? data.trash : []);
  if (!Array.isArray(data) && data && data.settings) {
    store.settings = normalizeSettings(data.settings);
    saveSettings();
    applyTheme();
  }
  const ui = !Array.isArray(data) && data && data.ui;
  store.filters =
    ui && Array.isArray(ui.filters) && ui.filters.length
      ? ui.filters.filter((t) => Number.isInteger(t) && t >= 1 && t <= 5)
      : [1, 2, 3, 4, 5];
  if (!store.filters.length) store.filters = [1, 2, 3, 4, 5];
  store.search = ui && typeof ui.search === "string" ? ui.search : "";
  if (ui && ["list", "calendar", "timeline"].includes(ui.ovView)) store.ovView = ui.ovView;
  store.domain = ui && isDomain(ui.domain) ? ui.domain : store.domain;

  store.collapsed.clear();
  store.historyOpen.clear();
  store.selectMode = false;
  store.selected.clear();

  save();
  saveTrash();
  saveUI();

  // Enqueue all items and trash for cloud sync
  const now = Date.now();
  store.items.forEach((i) => {
    enqueueMutation({
      table: "items",
      action: "UPSERT",
      entityId: i.id,
      data: i,
      timestamp: i.updatedAt || now,
    });
  });
  store.trash.forEach((t) => {
    enqueueMutation({
      table: "trash",
      action: "UPSERT",
      entityId: t.id,
      data: t,
      timestamp: t.deletedAt || now,
    });
  });
  scheduleSync();

  showToast(`Imported ${store.items.length} item${store.items.length === 1 ? "" : "s"}.`);
}

/* ============ TOAST & UNDO ============ */
export function showToast(msg) {
  store.toast.message = msg;
  store.toast.visible = true;
  clearTimeout(store.toast.timer);
  store.toast.timer = setTimeout(() => {
    store.toast.visible = false;
  }, 4500);
}

export function showUndo(msg, fn) {
  store.undo.message = msg;
  store.undo.fn = fn;
  store.undo.visible = true;
  clearTimeout(store.undo.timer);
  store.undo.timer = setTimeout(hideUndo, 8000);
}

export function hideUndo() {
  clearTimeout(store.undo.timer);
  store.undo.visible = false;
  store.undo.fn = null;
}

export function triggerUndo() {
  if (store.undo.fn) {
    const fn = store.undo.fn;
    hideUndo();
    fn();
  }
}

/* ============ DOMAIN SWITCHING ============ */
export function switchDomain(step) {
  const idx = DOMAINS.findIndex((d) => d.id === store.domain);
  store.domain = DOMAINS[(idx + step + DOMAINS.length) % DOMAINS.length].id;
  exitSelect();
  saveUI();
}

/* ============ SELECTION MODE ============ */
export function exitSelect() {
  store.selectMode = false;
  store.selected.clear();
}

export function toggleSelectAll() {
  const visible = visibleItems();
  if (store.selected.size === visible.length) {
    store.selected.clear();
  } else {
    visible.forEach((i) => store.selected.add(i.id));
  }
}

export function completeSelected() {
  if (!store.selected.size) return;
  const { completed, legends } = completeMany([...store.selected]);
  exitSelect();
  xpToast(completed);
  if (legends.length) {
    showUndo(
      legends.length === 1 ? `Completed "${legends[0].title}"` : `Completed ${legends.length} Legends`,
      () => uncomplete(completed)
    );
  }
}

export function deleteSelected() {
  if (!store.selected.size) return;
  const ids = [...store.selected];
  const gone = new Set(ids);
  ids.forEach((id) => getDescendants(id).forEach((d) => gone.add(d.id)));
  const nested = gone.size - ids.length;

  store.confirmModal.heading = `Delete ${ids.length} item${ids.length === 1 ? "" : "s"}?`;
  store.confirmModal.text =
    (nested
      ? `They and ${nested} nested item${nested === 1 ? "" : "s"} will move to Trash. `
      : `They will move to Trash. `) + `You can restore them for ${TRASH_DAYS} days.`;
  store.confirmModal.confirmLabel = "Delete";
  store.confirmModal.isDanger = true;
  store.confirmModal.action = () => {
    deleteMany(ids);
    exitSelect();
  };
  store.confirmModal.open = true;
}

export function confirmDeleteItem(id) {
  const item = byId(id);
  if (!item) return;
  const n = getDescendants(id).length;
  store.confirmModal.heading = `Delete "${item.title}"?`;
  store.confirmModal.text = n
    ? `It and its ${n} nested item${n === 1 ? "" : "s"} will move to Trash. You can restore them for ${TRASH_DAYS} days.`
    : `It will move to Trash. You can restore it for ${TRASH_DAYS} days.`;
  store.confirmModal.confirmLabel = "Delete";
  store.confirmModal.isDanger = true;
  store.confirmModal.action = () => {
    deleteItem(id);
  };
  store.confirmModal.open = true;
}

/* ============ SHEET / MODAL ============ */
export function openSheet(mode, opts = {}) {
  const s = store.sheet;
  s.mode = mode;
  s.parentId = opts.parentId || null;
  s.id = opts.id || null;
  s.error = "";
  s.focusDeadline = !!opts.focusDeadline;

  if (mode === "edit") {
    const item = byId(s.id);
    if (!item) return;
    s.title = item.title;
    s.notes = item.notes || "";
    s.tier = item.tier;
    s.dueInput = typeof item.dueAt === "number" ? toLocalInput(item.dueAt) : "";
    if (typeof item.target === "string" && TARGET_RE.test(item.target)) {
      s.dlMode = item.target.length === 7 ? "month" : "year";
      s.targetYear = +item.target.slice(0, 4);
      s.targetMonth = item.target.length === 7 ? +item.target.slice(5) - 1 : new Date().getMonth();
    } else if (typeof item.dueAt === "number") {
      s.dlMode = "date";
      s.targetYear = new Date().getFullYear();
      s.targetMonth = new Date().getMonth();
    } else {
      s.dlMode = "none";
      s.targetYear = new Date().getFullYear();
      s.targetMonth = new Date().getMonth();
    }
  } else {
    s.title = "";
    s.notes = "";
    s.dueInput = "";
    s.dlMode = "none";
    s.targetYear = new Date().getFullYear();
    s.targetMonth = new Date().getMonth();
    s.tier = legalTiersFor(s.parentId)[0] || 1;
  }
  s.open = true;
}

export function closeSheet() {
  store.sheet.open = false;
}

export function submitSheet() {
  const s = store.sheet;
  const title = (s.title || "").trim();
  if (!title) {
    s.error = "Please enter a title.";
    return false;
  }
  if (!s.tier) {
    s.error = "Choose a type.";
    return false;
  }

  // Calculate deadline fields
  let dueAt = null;
  let target = null;
  if (s.dlMode === "date") {
    dueAt = fromLocalInput(s.dueInput);
  } else if (s.dlMode === "month") {
    target = `${s.targetYear}-${pad2(+s.targetMonth + 1)}`;
  } else if (s.dlMode === "year") {
    target = String(s.targetYear);
  }

  let res;
  if (s.mode === "create") {
    res = createItem({
      title,
      tier: s.tier,
      parentId: s.parentId,
      notes: s.notes,
      dueAt,
      target,
    });
    if (res.item && s.parentId) {
      store.collapsed.delete(s.parentId);
    }
  } else {
    res = updateItem(s.id, {
      title,
      tier: s.tier,
      notes: (s.notes || "").trim(),
      dueAt,
      target,
    });
  }

  if (res.error) {
    s.error = res.error;
    return false;
  }
  closeSheet();
  return true;
}
