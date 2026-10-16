/* Legendary To-Do — vanilla JS, no dependencies. */
(function () {
  "use strict";

  /* ============ 1. CONSTANTS ============ */
  const TIERS = [
    { tier: 1, name: "Legend",     cssVar: "--legend",    color: "#F97316", ink: "#FFFFFF" },
    { tier: 2, name: "Quest",      cssVar: "--quest",     color: "#8B5CF6", ink: "#FFFFFF" },
    { tier: 3, name: "Side Quest", cssVar: "--sidequest", color: "#3B82F6", ink: "#FFFFFF" },
    { tier: 4, name: "Objective",  cssVar: "--objective", color: "#22C55E", ink: "#0B1F12" },
    { tier: 5, name: "Task",       cssVar: "--task",      color: "#FFFFFF", ink: "#1A1A1A" },
  ];
  const TOP_LEVEL_ALLOWED = [1, 2, 3, 4, 5]; // e.g. [1, 3] to allow only Legend + Side Quest at top level
  const ITEMS_KEY = "ltd:v1:items";
  const UI_KEY = "ltd:v1:ui";
  const TRASH_KEY = "ltd:v1:trash";
  const TIMER_KEY = "ltd:v1:timer"; // the running focus timer { id, startedAt }, so it survives a page reload
  const TRASH_DAYS = 30; // deleted items are kept this long, then removed for good
  const SETTINGS_KEY = "ltd:v1:settings";
  const DEFAULT_XP = { 1: 100, 2: 50, 3: 25, 4: 10, 5: 5 }; // XP for completing each tier (Legend is the biggest)
  const homeColor = () => (state.settings.theme === "light" ? "#F4F4F7" : "#14141A");
  const DOMAINS = [
    { id: "client",   name: "Client" },
    { id: "work",     name: "Work" },
    { id: "personal", name: "Personal" },
  ];
  const isDomain = (d) => DOMAINS.some((x) => x.id === d);

  // Side-menu registry. To add a feature, push an entry here:
  //   { id: "notes", name: "Notes", icon: "📝", hash: "#/f/notes", render(el) { el.innerHTML = "…"; } }
  // `hash` must be "#/f/<id>"; render(el) fills the feature screen. Without render, a
  // "coming soon" placeholder is shown. The to-do tracker owns the "#/" and "#/item/<id>" routes.
  const FEATURES = [
    { id: "todo", name: "To-Do", icon: "✅", hash: "#/" },
    { id: "overview", name: "Overview", icon: "🌳", hash: "#/f/overview", render: renderOverview },
    { id: "history", name: "History", icon: "🏆", hash: "#/f/history", render: renderHistory },
    { id: "trash", name: "Trash", icon: "🗑", hash: "#/f/trash", render: renderTrash },
    { id: "backup", name: "Backup", icon: "💾", hash: "#/f/backup", render: renderBackup },
    { id: "settings", name: "Settings", icon: "⚙️", hash: "#/f/settings", render: renderSettings },
  ];

  /* ============ 2. STORAGE ============ */
  let storageWarned = false;

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      try {
        return JSON.parse(raw);
      } catch (e) {
        try { localStorage.setItem(key + ":corrupt-backup", raw); } catch (e2) { /* ignore */ }
        return fallback;
      }
    } catch (e) {
      warnStorage();
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      warnStorage();
    }
  }

  function warnStorage() {
    if (storageWarned) return;
    storageWarned = true;
    // Defer so the toast element exists even if this fires during load.
    setTimeout(() => toast("Storage unavailable — changes won't persist after you close this page."), 0);
  }

  function load() {
    const items = readJSON(ITEMS_KEY, []);
    normalizeItems(Array.isArray(items) ? items : []);
    state.trash = normalizeTrash(readJSON(TRASH_KEY, []));
    state.settings = normalizeSettings(readJSON(SETTINGS_KEY, null));
    const tm = readJSON(TIMER_KEY, null);
    state.timer = tm && typeof tm.id === "string" && typeof tm.startedAt === "number" && byId(tm.id) ? tm : null;
    const ui = readJSON(UI_KEY, null);
    if (ui && isDomain(ui.domain)) state.domain = ui.domain;
    if (ui && Array.isArray(ui.filters)) {
      state.filters = ui.filters.filter((t) => Number.isInteger(t) && t >= 1 && t <= 5);
    }
    if (ui && typeof ui.search === "string") state.search = ui.search;
    if (ui && ["list", "calendar", "timeline"].includes(ui.ovView)) state.ovView = ui.ovView;
  }

  // Cleans a list of items (from storage or an imported file) and makes it the current items.
  function normalizeItems(raw) {
    const seen = new Set();
    const now = Date.now();
    state.items = raw.filter(isValidItem).filter((i) => !seen.has(i.id) && seen.add(i.id)).map((i) => ({
      id: i.id,
      title: i.title,
      notes: typeof i.notes === "string" ? i.notes : "",
      tier: i.tier,
      parentId: typeof i.parentId === "string" ? i.parentId : null,
      domain: isDomain(i.domain) ? i.domain : null,
      done: !!i.done,
      dueAt: typeof i.dueAt === "number" && isFinite(i.dueAt) ? i.dueAt : undefined,
      target: !(typeof i.dueAt === "number") && typeof i.target === "string" && TARGET_RE.test(i.target) ? i.target : undefined,
      timeSpent: typeof i.timeSpent === "number" && i.timeSpent > 0 ? Math.round(i.timeSpent) : undefined,
      sessions: Array.isArray(i.sessions)
        ? i.sessions.filter((s) => s && typeof s.startedAt === "number" && typeof s.seconds === "number").slice(-200) : undefined,
      completedAt: typeof i.completedAt === "number" ? i.completedAt : undefined,
      createdAt: typeof i.createdAt === "number" ? i.createdAt : now,
      updatedAt: typeof i.updatedAt === "number" ? i.updatedAt : now,
    }));
    // An item whose parent is missing becomes a top-level item.
    state.items.forEach((i) => { if (i.parentId && !seen.has(i.parentId)) i.parentId = null; });
    // Items saved before domains existed go to "personal"; children follow their parent.
    state.items.forEach((i) => {
      if (i.domain) return;
      let cur = i, hops = 0;
      while (cur && !cur.domain && cur.parentId && hops++ < 10) cur = byId(cur.parentId);
      i.domain = (cur && cur.domain) || "personal";
    });
    // Items completed before History existed get a completion time.
    state.items.forEach((i) => {
      if (i.done && !i.completedAt) i.completedAt = i.updatedAt;
      if (!i.done) delete i.completedAt;
    });
  }

  // Validates trash entries (from storage or an imported file) and drops the ones past the retention period.
  function normalizeTrash(raw) {
    if (!Array.isArray(raw)) return [];
    const cutoff = Date.now() - TRASH_DAYS * 86400000;
    return raw.filter((e) => e && typeof e.id === "string" && typeof e.rootId === "string" &&
        typeof e.deletedAt === "number" && e.deletedAt > cutoff && Array.isArray(e.items))
      .map((e) => Object.assign({}, e, {
        items: e.items.filter(isValidItem).map((i) => Object.assign({}, i, {
          domain: isDomain(i.domain) ? i.domain : "personal",
          notes: typeof i.notes === "string" ? i.notes : "",
        })),
      }))
      .filter((e) => e.items.some((i) => i.id === e.rootId));
  }

  function normalizeSettings(raw) {
    const s = { theme: "dark", xp: Object.assign({}, DEFAULT_XP) };
    if (raw && (raw.theme === "light" || raw.theme === "dark")) s.theme = raw.theme;
    if (raw && raw.xp) {
      for (let t = 1; t <= 5; t++) {
        const v = Number(raw.xp[t]);
        if (Number.isFinite(v) && v >= 0) s.xp[t] = Math.min(99999, Math.round(v));
      }
    }
    return s;
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.settings.theme;
    // Item screens use the item's own color; only the home/feature screens follow the theme.
    if (location.hash.indexOf("#/item/") !== 0) themeMeta.setAttribute("content", homeColor());
  }

  function save() { writeJSON(ITEMS_KEY, state.items); }
  function saveSettings() { writeJSON(SETTINGS_KEY, state.settings); }
  function saveTimer() {
    try {
      if (state.timer) localStorage.setItem(TIMER_KEY, JSON.stringify(state.timer));
      else localStorage.removeItem(TIMER_KEY);
    } catch (e) { warnStorage(); }
  }
  function saveTrash() { writeJSON(TRASH_KEY, state.trash); }
  function saveUI() {
    writeJSON(UI_KEY, { filters: state.filters, search: state.search, domain: state.domain, ovView: state.ovView });
  }

  function isValidItem(i) {
    return i && typeof i.id === "string" && typeof i.title === "string" && i.tier >= 1 && i.tier <= 5;
  }

  /* ============ 3. STATE ============ */
  const state = {
    items: [],
    filters: [1, 2, 3, 4, 5],
    search: "",
    domain: "client",
    ovView: "list", // Overview screen: "list" | "calendar" | "timeline"
    ovFilter: { y: null, m: null, none: false }, // Overview target filter (year, month 0-11, or "no deadline")
    timer: null,    // { id, startedAt } while a focus timer is running
    settings: { theme: "dark", xp: Object.assign({}, DEFAULT_XP) },
    trash: [], // [{ id, rootId, deletedAt, items: [root + everything that was inside it] }]
  };
  const collapsed = new Set(); // ids of collapsed tree branches (in-memory only)
  let sheet = null;            // { mode: "create"|"edit", parentId, id, tier }
  let pendingDeleteId = null;
  let pendingDeleteIds = null; // set when deleting a multi-selection
  let selectMode = false;      // home list: circles + action pane
  const selected = new Set();  // ids picked in select mode

  /* ============ 4. DATA OPS ============ */
  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function createItem({ title, tier, parentId = null, notes = "", dueAt = null, target = null }) {
    title = (title || "").trim();
    if (!title) return { error: "Please enter a title." };
    if (!legalTiersFor(parentId).includes(tier)) return { error: "That type isn't allowed here." };
    const now = Date.now();
    const parent = parentId ? byId(parentId) : null;
    const item = {
      id: newId(), title, notes: (notes || "").trim(), tier, parentId,
      domain: parent ? parent.domain : state.domain,
      done: false, createdAt: now, updatedAt: now,
    };
    if (typeof dueAt === "number" && isFinite(dueAt)) item.dueAt = dueAt;
    else if (typeof target === "string" && TARGET_RE.test(target)) item.target = target;
    state.items.push(item);
    save();
    render();
    return { item };
  }

  function updateItem(id, patch) {
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
    if (typeof item.dueAt !== "number" || !isFinite(item.dueAt)) delete item.dueAt; // null / NaN clears the due date
    if (item.dueAt !== undefined || typeof item.target !== "string" || !TARGET_RE.test(item.target)) delete item.target; // one deadline kind at a time
    save();
    render();
    return { item };
  }

  function deleteItem(id) {
    const item = byId(id);
    if (!item) return;
    const gone = trashItems([id]);
    // Only navigate away if the user was looking at the deleted item (not when deleting from the home list).
    const viewing = currentId();
    if (viewing && gone.has(viewing)) {
      const target = item.parentId ? "#/item/" + item.parentId : "#/";
      if (location.hash === target) render(); else location.hash = target;
    } else {
      render();
    }
  }

  // Marks several items (and everything inside them) done in one go. Returns what changed.
  function completeMany(ids) {
    const now = Date.now();
    const completed = [];
    const legends = [];
    ids.forEach((id) => {
      const item = byId(id);
      if (!item) return;
      [item].concat(getDescendants(id)).forEach((i) => {
        if (i.done) return;
        i.done = true; i.updatedAt = now; i.completedAt = now;
        completed.push(i.id);
        if (i.id === id && i.tier === 1) legends.push(i);
      });
    });
    if (state.timer && completed.includes(state.timer.id)) stopTimer();
    save();
    return { completed, legends };
  }

  // "Deleting" moves items (and everything inside them) to the trash. Returns the ids that left the list.
  function trashItems(ids) {
    const now = Date.now();
    const idSet = new Set(ids);
    // An item picked together with one of its ancestors travels with that ancestor.
    const roots = ids.map((id) => byId(id))
      .filter((i) => i && !getAncestors(i.id).some((a) => idSet.has(a.id)));
    const gone = new Set();
    const entryIds = [];
    roots.forEach((root) => {
      const items = [root].concat(getDescendants(root.id));
      items.forEach((i) => gone.add(i.id));
      const entry = { id: newId(), rootId: root.id, deletedAt: now, items };
      state.trash.unshift(entry);
      entryIds.push(entry.id);
    });
    if (state.timer && gone.has(state.timer.id)) stopTimer(); // log the time before the item goes to Trash
    state.items = state.items.filter((i) => !gone.has(i.id));
    gone.forEach((g) => collapsed.delete(g));
    save();
    saveTrash();
    if (roots.length) {
      showUndo(roots.length === 1 ? 'Moved "' + roots[0].title + '" to Trash' : "Moved " + roots.length + " items to Trash",
        () => restoreEntries(entryIds));
    }
    return gone;
  }

  function deleteMany(ids) { trashItems(ids); }

  // Puts trash entries back. An entry whose old parent is gone (or no longer bigger than it) returns as a top-level item.
  function restoreEntries(entryIds) {
    let count = 0, topLevel = 0, first = null;
    entryIds.forEach((eid) => {
      const k = state.trash.findIndex((e) => e.id === eid);
      if (k < 0) return;
      const entry = state.trash.splice(k, 1)[0];
      const root = entry.items.find((i) => i.id === entry.rootId);
      const parent = root.parentId ? byId(root.parentId) : null;
      if (root.parentId && (!parent || parent.tier >= root.tier)) { root.parentId = null; topLevel++; }
      entry.items.forEach((i) => { if (!byId(i.id)) state.items.push(i); });
      count++;
      first = first || root;
    });
    save();
    saveTrash();
    render();
    if (count) {
      toast((count === 1 ? 'Restored "' + first.title + '"' : "Restored " + count + " items") +
        (topLevel ? " (its old parent is gone, so it's now top-level)" : ""));
    }
  }

  // parentId === null moves the item to the top level.
  function moveItem(id, parentId) {
    const item = byId(id);
    if (!item || item.parentId === parentId) return { error: "" };
    if (parentId) {
      const p = byId(parentId);
      if (!p || p.tier >= item.tier) return { error: "A " + tierOf(item.tier).name + " can't go inside that." };
      collapsed.delete(parentId);
    } else if (!TOP_LEVEL_ALLOWED.includes(item.tier)) {
      return { error: "A " + tierOf(item.tier).name + " can't be at the top level." };
    }
    item.parentId = parentId;
    item.updatedAt = Date.now();
    save();
    render();
    return { item };
  }

  function toggleDone(id) {
    const item = byId(id);
    if (!item) return;
    item.done = !item.done;
    const now = Date.now();
    item.updatedAt = now;
    const completed = []; // ids newly completed by this action (used by Undo)
    // Completing an item completes everything nested inside it. Un-marking only affects this item.
    if (item.done) {
      item.completedAt = now;
      completed.push(item.id);
      getDescendants(id).forEach((d) => {
        if (!d.done) { d.done = true; d.updatedAt = now; d.completedAt = now; completed.push(d.id); }
      });
    } else {
      delete item.completedAt;
    }
    if (state.timer && completed.includes(state.timer.id)) stopTimer(); // finishing an item stops its timer
    save();
    render();
    if (item.done) xpToast(completed);
    if (item.done && item.tier === 1) {
      showUndo('Completed "' + item.title + '"', () => uncomplete(completed));
    }
  }

  /* ---- Focus timer: tracks seconds spent on an item. Time comes from timestamps, so it stays correct
         when the tab is in the background or the page is reloaded. ---- */
  const timerElapsed = () => (state.timer ? Math.max(0, Math.floor((Date.now() - state.timer.startedAt) / 1000)) : 0);

  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    return pad2(Math.floor(sec / 3600)) + ":" + pad2(Math.floor((sec % 3600) / 60)) + ":" + pad2(sec % 60);
  }

  function fmtDuration(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? h + "h " + pad2(m) + "m" : m ? m + "m " + pad2(s) + "s" : s + "s";
  }

  // Stops the running timer and logs the session on its item. Returns the logged seconds.
  function stopTimer() {
    const t = state.timer;
    if (!t) return 0;
    const secs = timerElapsed();
    const item = byId(t.id);
    state.timer = null;
    saveTimer();
    if (item && secs >= 1) {
      item.timeSpent = (item.timeSpent || 0) + secs;
      item.sessions = (item.sessions || []).concat({ startedAt: t.startedAt, seconds: secs }).slice(-200);
      item.updatedAt = Date.now();
      save();
    }
    return item ? secs : 0;
  }

  function toggleTimer(id) {
    const item = byId(id);
    if (!item) return;
    if (state.timer && state.timer.id === id) {
      const secs = stopTimer();
      toast("Logged " + fmtDuration(secs) + " on \"" + item.title + "\"");
    } else {
      if (state.timer) {
        const prev = byId(state.timer.id);
        const secs = stopTimer();
        if (prev) toast("Logged " + fmtDuration(secs) + " on \"" + prev.title + "\"");
      }
      state.timer = { id, startedAt: Date.now() };
      saveTimer();
    }
    render();
  }

  // Refreshes every live clock on screen and the "timer running" pill (called each second).
  function updateClocks() {
    const t = state.timer && byId(state.timer.id) ? state.timer : null;
    document.querySelectorAll("[data-clock]").forEach((el) => {
      const item = byId(el.dataset.clock);
      if (item) el.textContent = fmtClock((item.timeSpent || 0) + (t && t.id === item.id ? timerElapsed() : 0));
    });
    const sess = document.querySelector("[data-session]");
    if (sess) sess.textContent = fmtClock(timerElapsed());
    const pill = $("#timer-pill");
    if (!t) { pill.hidden = true; return; }
    pill.hidden = currentId() === t.id || selectMode;
    pill.querySelector(".tp-title").textContent = byId(t.id).title;
    pill.querySelector(".tp-clock").textContent = fmtClock(timerElapsed());
  }

  /* ---- XP: every completed item is worth the XP set for its tier in Settings ---- */
  const xpOf = (item) => state.settings.xp[item.tier] || 0;
  const totalXp = () => state.items.reduce((sum, i) => sum + (i.done ? xpOf(i) : 0), 0);
  const xpForLevel = (lv) => 50 * lv * (lv - 1); // level 2 at 100 XP, 3 at 300, 4 at 600, ...
  function levelInfo(total) {
    let level = 1;
    while (xpForLevel(level + 1) <= total) level++;
    const lo = xpForLevel(level);
    return { level, into: total - lo, span: xpForLevel(level + 1) - lo };
  }

  function xpToast(ids) {
    const gained = ids.reduce((sum, id) => { const i = byId(id); return sum + (i ? xpOf(i) : 0); }, 0);
    if (gained <= 0) return;
    const total = totalXp();
    const leveled = levelInfo(total).level > levelInfo(total - gained).level;
    toast("+" + gained + " XP" + (leveled ? " — Level up! You're now level " + levelInfo(total).level : ""));
  }

  function uncomplete(ids) {
    const now = Date.now();
    ids.forEach((id) => {
      const i = byId(id);
      if (i) { i.done = false; i.updatedAt = now; delete i.completedAt; }
    });
    save();
    render();
  }

  /* ============ 5. QUERIES ============ */
  const byId = (id) => state.items.find((i) => i.id === id) || null;
  const tierOf = (n) => TIERS[n - 1];
  const getChildren = (id) => state.items.filter((i) => i.parentId === id);

  function getDescendants(id) {
    const out = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      for (const c of getChildren(cur)) { out.push(c); stack.push(c.id); }
    }
    return out;
  }

  function getAncestors(id) {
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

  function getProgress(id) {
    const d = getDescendants(id);
    return { done: d.filter((i) => i.done).length, total: d.length };
  }

  function legalTiersFor(parentId) {
    if (parentId == null) return TOP_LEVEL_ALLOWED.slice();
    const p = byId(parentId);
    if (!p) return [];
    return TIERS.map((t) => t.tier).filter((t) => t > p.tier);
  }

  // Returns an explanation if `item` cannot become `newTier`, otherwise "".
  function tierError(item, newTier) {
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

  function visibleItems() {
    const q = state.search.trim().toLowerCase();
    return state.items
      .filter((i) => i.domain === state.domain && !i.done) // completed items live in History
      .filter((i) => state.filters.includes(i.tier))
      .filter((i) => !q || (i.title + " " + (i.notes || "")).toLowerCase().includes(q))
      .sort((a, b) => a.tier - b.tier || b.updatedAt - a.updatedAt);
  }

  /* ============ 6. RENDER ============ */
  const $ = (sel) => document.querySelector(sel);
  const homeEl = $("#home");
  const detailEl = $("#detail");
  const detailBody = $("#detail-body");
  const chipsEl = $("#chips");
  const cardsEl = $("#cards");
  const searchEl = $("#search");
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  // Breadcrumb text is shortened so a long title can't push the trail off screen; the full title stays in the tooltip.
  const CRUMB_MAX = 14;
  function shortTitle(title, max) {
    const chars = Array.from(title);
    return chars.length > (max || CRUMB_MAX) ? chars.slice(0, (max || CRUMB_MAX) - 1).join("").trimEnd() + "…" : title;
  }
  const crumbTrail = (id) => getAncestors(id).map((a) => escapeHtml(shortTitle(a.title))).join(" › ");

  const tierStyle = (n) => {
    const t = tierOf(n);
    return "--c:" + t.color + ";--ci:" + t.ink;
  };

  const fmtDue = (ms) => new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  // A deadline is either an exact date+time (dueAt, ms) or a coarse target: a month "YYYY-MM" or a year "YYYY".
  const TARGET_RE = /^\d{4}(-(0[1-9]|1[0-2]))?$/;
  const hasDue = (i) => typeof i.dueAt === "number";
  const hasTarget = (i) => !hasDue(i) && typeof i.target === "string" && TARGET_RE.test(i.target);
  const hasDeadline = (i) => hasDue(i) || hasTarget(i);
  const targetLabel = (t, short) => t.length === 7
    ? new Date(+t.slice(0, 4), +t.slice(5) - 1, 1).toLocaleDateString(undefined, { month: short ? "short" : "long", year: "numeric" })
    : t;
  const targetEnd = (t) => (t.length === 7 ? new Date(+t.slice(0, 4), +t.slice(5), 1) : new Date(+t + 1, 0, 1)).getTime();
  const deadlineEnd = (i) => (hasDue(i) ? i.dueAt : hasTarget(i) ? targetEnd(i.target) : null);
  // The year (and month, if any) an item's deadline falls in; used by the Overview filter.
  function periodOf(i) {
    if (hasDue(i)) { const d = new Date(i.dueAt); return { y: d.getFullYear(), m: d.getMonth() }; }
    if (hasTarget(i)) return { y: +i.target.slice(0, 4), m: i.target.length === 7 ? +i.target.slice(5) - 1 : null };
    return null;
  }
  const isOverdue = (i) => !i.done && hasDeadline(i) && deadlineEnd(i) <= Date.now() && (hasDue(i) ? i.dueAt < Date.now() : true);
  const dueChipHtml = (i) => hasDue(i)
    ? '<span class="due' + (isOverdue(i) ? " overdue" : "") + '">⏰ ' + fmtDue(i.dueAt) + "</span>"
    : hasTarget(i) ? '<span class="due target' + (isOverdue(i) ? " overdue" : "") + '">🎯 ' + targetLabel(i.target, true) + "</span>" : "";

  function progressHtml(id) {
    const p = getProgress(id);
    if (!p.total) return "";
    const pct = Math.round((p.done / p.total) * 100);
    return '<span class="prog"><span class="bar" aria-hidden="true"><i style="width:' + pct +
      '%"></i></span><span>' + p.done + "/" + p.total + "</span></span>";
  }

  function renderChips() {
    const all = state.filters.length === 5;
    let html = '<button class="chip all" data-action="chip-all" aria-pressed="' + all + '">All</button>';
    for (const t of TIERS) {
      html += '<button class="chip" style="' + tierStyle(t.tier) + '" data-action="chip" data-tier="' +
        t.tier + '" aria-pressed="' + state.filters.includes(t.tier) + '">' + t.name + "</button>";
    }
    chipsEl.innerHTML = html;
  }

  function renderDomainBar() {
    $("#domain-title").textContent = DOMAINS.find((d) => d.id === state.domain).name;
    $("#domain-dots").innerHTML = DOMAINS.map((d) => "<i" + (d.id === state.domain ? ' class="on"' : "") + "></i>").join("");
  }

  function switchDomain(step) {
    const idx = DOMAINS.findIndex((d) => d.id === state.domain);
    state.domain = DOMAINS[(idx + step + DOMAINS.length) % DOMAINS.length].id;
    selectMode = false;
    selected.clear();
    saveUI();
    renderHome();
    cardsEl.classList.remove("slide-next", "slide-prev");
    void cardsEl.offsetWidth; // restart the animation
    cardsEl.classList.add(step > 0 ? "slide-next" : "slide-prev");
  }

  function exitSelect() {
    selectMode = false;
    selected.clear();
    render();
  }

  function updateSelectBar() {
    document.body.classList.toggle("selecting", selectMode);
    $("#select-bar").hidden = !selectMode;
    if (!selectMode) return;
    const n = selected.size;
    const total = visibleItems().length;
    $("#select-count").textContent = n + " selected";
    document.querySelectorAll("#select-bar [data-needs-selection]").forEach((b) => { b.disabled = n === 0; });
    $("#select-all").textContent = n && n === total ? "None" : "All";
  }

  function renderHome() {
    if (selectMode) { // only keep selected items that are still on screen (filters/search may hide some)
      const visible = new Set(visibleItems().map((i) => i.id));
      selected.forEach((id) => { if (!visible.has(id)) selected.delete(id); });
    }
    updateSelectBar();
    renderDomainBar();
    renderChips();
    const inDomain = state.items.filter((i) => i.domain === state.domain);
    if (!inDomain.length) {
      cardsEl.innerHTML = '<div class="empty"><p>Your adventure starts here.<br>Tap + to create your first item.</p></div>';
      return;
    }
    if (inDomain.every((i) => i.done)) {
      cardsEl.innerHTML = '<div class="empty"><p>All caught up!<br>Completed items are in History (☰ menu).</p></div>';
      return;
    }
    const list = visibleItems();
    if (!list.length) {
      cardsEl.innerHTML = '<div class="empty"><p>Nothing matches.</p>' +
        '<button class="btn ghost" data-action="clear-filters">Clear filters?</button></div>';
      return;
    }
    cardsEl.innerHTML = list.map((i) => {
      const crumbs = crumbTrail(i.id);
      const sel = selectMode && selected.has(i.id);
      return '<button class="card' + (i.done ? " done" : "") + (sel ? " selected" : "") +
        '" draggable="false" style="' + tierStyle(i.tier) +
        '" data-action="open" data-id="' + i.id + '"' + (selectMode ? ' aria-pressed="' + sel + '"' : "") + ">" +
        (selectMode ? '<span class="sel-circle" aria-hidden="true">' + (sel ? "✓" : "") + "</span>" : "") +
        '<span class="band"></span><span class="body">' +
        (crumbs ? '<span class="crumb">' + crumbs + "</span>" : "") +
        '<span class="ctitle">' + escapeHtml(i.title) + "</span>" +
        '<span class="meta"><span class="ctier">' + tierOf(i.tier).name + "</span>" + dueChipHtml(i) +
        progressHtml(i.id) + "</span></span></button>";
    }).join("");
  }

  function nodeHtml(item) {
    const kids = getChildren(item.id).sort((a, b) => a.createdAt - b.createdAt);
    const isCollapsed = collapsed.has(item.id);
    let html = '<li class="node' + (item.done ? " done" : "") + (isCollapsed ? " collapsed" : "") +
      '"><div class="row" style="' + tierStyle(item.tier) + '"><span class="edge"></span>' +
      '<button class="chk" data-action="toggle" data-id="' + item.id + '" role="checkbox" aria-checked="' +
      item.done + '" aria-label="Mark done: ' + escapeHtml(item.title) + '"><span class="box">' +
      (item.done ? "✓" : "") + "</span></button>" +
      '<button class="open" data-action="open" data-id="' + item.id + '"><span class="rt">' +
      escapeHtml(item.title) + '</span><span class="rtier">' + tierOf(item.tier).name +
      (hasDue(item) ? " · due " + fmtDue(item.dueAt) : hasTarget(item) ? " · target " + targetLabel(item.target, true) : "") +
      "</span></button>";
    if (kids.length) {
      html += '<button class="fold" data-action="fold" data-id="' + item.id + '" aria-expanded="' +
        !isCollapsed + '" aria-label="Toggle nested items">▾</button>';
    }
    html += "</div>";
    if (kids.length) html += '<ul class="tree">' + kids.map(nodeHtml).join("") + "</ul>";
    return html + "</li>";
  }

  // The focus timer panel on an item's screen: total tracked time, live while running, with a start/stop button.
  function focusHtml(item) {
    const running = !!state.timer && state.timer.id === item.id;
    const total = (item.timeSpent || 0) + (running ? timerElapsed() : 0);
    const n = (item.sessions || []).length;
    return '<div class="focus' + (running ? " running" : "") + '"><div class="focus-main"><div class="focus-label">Focus time</div>' +
      '<div class="focus-clock" data-clock="' + item.id + '" aria-live="off">' + fmtClock(total) + "</div>" +
      '<div class="focus-sub">' + (running
        ? '● Running · this session <span data-session>' + fmtClock(timerElapsed()) + "</span>"
        : (n ? n + " session" + (n === 1 ? "" : "s") + " · " + fmtDuration(item.timeSpent || 0) + " logged" : "Not started yet")) +
      '</div></div><button class="focus-btn" data-action="timer-toggle" data-id="' + item.id + '">' +
      (running ? "⏹ Stop" : "▶ Start focus") + "</button>" + sessionsHtml(item, running) + "</div>";
  }

  // Accordion under the focus clock: every logged session with when it started and how long it lasted.
  const sessionsOpen = new Set(); // item ids whose session list is expanded (in-memory only)
  function sessionsHtml(item, running) {
    const list = (item.sessions || []).slice().reverse(); // newest first
    if (!list.length && !running) return "";
    const open = sessionsOpen.has(item.id);
    const when = (ms) => new Date(ms).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    return '<div class="sess"><button class="sess-head" data-action="sess-fold" data-id="' + item.id + '" aria-expanded="' + open + '">' +
      '<span class="chev-ico" aria-hidden="true">›</span><span>Sessions (' + list.length + ")</span></button>" +
      (open
        ? '<ul class="sess-list">' + (running
          ? '<li class="sess-live"><span class="sess-when">● Running since ' + when(state.timer.startedAt) +
            '</span><span class="sess-dur">in progress</span></li>' : "") +
          list.map((s) => '<li><span class="sess-when">' + when(s.startedAt) + '</span><span class="sess-dur">' +
            fmtDuration(s.seconds) + "</span></li>").join("") + "</ul>"
        : "") + "</div>";
  }

  function renderDetail(item) {
    const t = tierOf(item.tier);
    detailEl.style.setProperty("--item-color", t.color);
    detailEl.style.setProperty("--item-ink", t.ink);
    detailEl.dataset.tier = item.tier;
    themeMeta.setAttribute("content", t.color);

    const crumbs = getAncestors(item.id).map((a) =>
      '<button class="crumb-link" data-action="open" data-id="' + a.id + '" title="' + escapeHtml(a.title) + " (" + tierOf(a.tier).name +
      ')">' + escapeHtml(shortTitle(a.title)) + "</button>").join('<span class="crumb-sep" aria-hidden="true">›</span>');
    const p = getProgress(item.id);
    const kids = getChildren(item.id).sort((a,b)=> a.createdAt - b.createdAt);
    const canAdd = legalTiersFor(item.id).length > 0;

    let html = (crumbs ? '<nav class="breadcrumbs" aria-label="Breadcrumb">' + crumbs + "</nav>" : "") +
      '<h2 class="d-title' + (item.done ? " done" : "") + '">' + escapeHtml(item.title) + "</h2>" +
      '<div class="d-meta"><span>' + t.name.toUpperCase() + (p.total ? " · " + p.done + " of " + p.total + " done" : "") + "</span>" +
      (hasDeadline(item) ? '<span class="d-due' + (isOverdue(item) ? " overdue" : "") + '">' +
        (hasDue(item) ? "⏰ Due " + fmtDue(item.dueAt) : "🎯 Target " + targetLabel(item.target)) +
        (isOverdue(item) ? " · overdue" : "") + "</span>" : "") +
      '<button class="done-toggle" data-action="toggle" data-id="' + item.id + '" aria-pressed="' + item.done + '">' +
      (item.done ? "✓ Done" : "Mark done") + "</button>" +
      '<button class="done-toggle" data-action="set-deadline" data-id="' + item.id + '">⏰ ' +
      (hasDeadline(item) ? "Change deadline" : "Set deadline") + "</button></div>" + focusHtml(item);
    if (p.total) {
      html += '<div class="d-prog"><span class="bar" aria-hidden="true"><i style="width:' +
        Math.round((p.done / p.total) * 100) + '%"></i></span></div>';
    }
    if (item.notes) html += '<p class="d-notes">' + escapeHtml(item.notes) + "</p>";
    html += kids.length
      ? '<ul class="tree">' + kids.map(nodeHtml).join("") + "</ul>"
      : (canAdd ? '<p class="no-children">Nothing inside yet.</p>' : "");
    if (canAdd) {
      html += '<button class="add-inside" data-action="add-inside" data-id="' + item.id + '">+ Add inside this item</button>';
    }
    detailBody.innerHTML = html;
  }

  /* ---- History feature: completed items grouped by tier ---- */
  const historyOpen = new Set(); // ids of expanded history entries (in-memory only)

  function historyNode(item, isRoot) {
    const kids = getChildren(item.id).sort((a, b) => a.tier - b.tier || a.createdAt - b.createdAt);
    const open = historyOpen.has(item.id);
    let meta;
    if (isRoot) {
      const crumbs = crumbTrail(item.id);
      const dom =DOMAINS.find((d) => d.id === item.domain);
      const date = new Date(item.completedAt || item.updatedAt)
        .toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      meta = (crumbs ? crumbs + " · " : "") + (dom ? dom.name + " · " : "") + date;
    } else {
      meta = tierOf(item.tier).name + (item.done ? "" : " · not done");
    }
    let html = '<li class="h-node' + (open ? " open" : "") + '"><div class="h-row" style="' + tierStyle(item.tier) +
      '"><span class="edge"></span><button class="h-open" data-action="open" data-id="' + item.id +
      '"><span class="h-title' + (item.done ? " struck" : "") + '">' + escapeHtml(item.title) +
      '</span><span class="h-meta">' + meta + "</span></button>";
    if (isRoot) {
      html += '<button class="h-restore" data-action="restore" data-id="' + item.id + '" aria-label="Restore ' +
        escapeHtml(item.title) + ' to the to-do list">↺ Restore</button>';
    }
    if (kids.length) {
      html += '<button class="h-chev" data-action="hist-fold" data-id="' + item.id + '" aria-expanded="' + open +
        '" aria-label="Show what is inside ' + escapeHtml(item.title) + '"><span class="chev-ico">›</span></button>';
    }
    html += "</div>";
    if (open && kids.length) html += '<ul class="h-list h-sub">' + kids.map((k) => historyNode(k, false)).join("") + "</ul>";
    return html + "</li>";
  }

  function renderHistory(el) {
    const doneIds = new Set(state.items.filter((i) => i.done).map((i) => i.id));
    // Entries are the topmost completed items: normally Legends, plus any smaller item completed
    // on its own inside a branch that is still open (so nothing completed goes missing).
    const roots = state.items
      .filter((i) => i.done && !getAncestors(i.id).some((a) => doneIds.has(a.id)))
      .sort((a, b) => a.tier - b.tier || (b.completedAt || b.updatedAt) - (a.completedAt || a.updatedAt));
    if (!roots.length) {
      el.innerHTML = '<div class="empty"><p>Nothing completed yet.<br>Finished Legends will show up here.</p></div>';
      return;
    }
    el.innerHTML = '<ul class="h-list">' + roots.map((r) => historyNode(r, true)).join("") + "</ul>";
  }

  /* ---- Overview feature: every open item as an expandable tree ---- */
  const overviewOpen = new Set(); // ids of expanded rows (in-memory only)

  const activeKids = (id) => getChildren(id).filter((k) => !k.done)
    .sort((a, b) => a.tier - b.tier || a.createdAt - b.createdAt);

  /* Overview target filter: keeps items whose deadline (exact date or target) falls in the chosen year / month,
     or items with no deadline at all. In the list view, parents of matching items stay (dimmed) for context. */
  const filterActive = () => state.ovFilter.y != null || state.ovFilter.m != null || state.ovFilter.none;
  function matchesFilter(i) {
    const f = state.ovFilter;
    if (!filterActive()) return true;
    const p = periodOf(i);
    if (f.none) return !p;
    if (!p) return false;
    if (f.y != null && p.y !== f.y) return false;
    if (f.m != null && p.m !== f.m) return false;
    return true;
  }
  const nodeVisible = (i) => matchesFilter(i) || activeKids(i.id).some(nodeVisible);

  function overviewFilterHtml() {
    const f = state.ovFilter;
    const years = new Set([new Date().getFullYear()]);
    state.items.forEach((i) => { const p = i.domain === state.domain && !i.done ? periodOf(i) : null; if (p) years.add(p.y); });
    if (f.y != null) years.add(f.y);
    const yOpts = '<option value="">Any year</option>' + [...years].sort().map((y) =>
      '<option value="' + y + '"' + (f.y === y ? " selected" : "") + ">" + y + "</option>").join("");
    const mOpts = '<option value="">Any month</option>' + Array.from({ length: 12 }, (_, k) =>
      '<option value="' + k + '"' + (f.m === k ? " selected" : "") + ">" +
      new Date(2000, k, 1).toLocaleDateString(undefined, { month: "long" }) + "</option>").join("");
    return '<div class="ov-filter" role="group" aria-label="Filter by target"><span class="ov-filter-label">🎯 Target</span>' +
      '<select data-ov-filter="y" aria-label="Target year">' + yOpts + "</select>" +
      '<select data-ov-filter="m" aria-label="Target month">' + mOpts + "</select>" +
      '<button class="preset-dark" data-action="ov-nodeadline" aria-pressed="' + f.none + '">No deadline</button>' +
      (filterActive() ? '<button class="ov-link" data-action="ov-clear-filter">Clear</button>' : "") + "</div>";
  }

  function overviewNode(item) {
    const filtering = filterActive();
    const kids = activeKids(item.id).filter((k) => !filtering || nodeVisible(k));
    const open = filtering || overviewOpen.has(item.id); // while filtering, matches are always shown with their parents
    let html = '<li class="o-node' + (filtering && !matchesFilter(item) ? " dim" : "") + '"><div class="o-row" style="' + tierStyle(item.tier) + '">' +
      (kids.length && !filtering
        ? '<button class="o-chev" data-action="ov-fold" data-id="' + item.id + '" aria-expanded="' + open +
          '" aria-label="Show what is inside ' + escapeHtml(item.title) + '"><span class="chev-ico">›</span></button>'
        : '<span class="o-chev o-ph"></span>') +
      '<button class="o-card" data-action="open" data-id="' + item.id + '"><span class="edge"></span>' +
      '<span class="o-body"><span class="o-title">' + escapeHtml(item.title) + '</span><span class="o-meta">' +
      '<span class="ctier">' + tierOf(item.tier).name + "</span>" + dueChipHtml(item) + progressHtml(item.id) +
      "</span></span></button></div>";
    if (open && kids.length) html += '<ul class="o-sub">' + kids.map(overviewNode).join("") + "</ul>";
    return html + "</li>";
  }

  function renderOverview(el) {
    const segBtns = (action, attr, current, opts) => opts.map((o) => '<button data-action="' + action + '" data-' + attr + '="' +
      o[0] + '" aria-pressed="' + (o[0] === current) + '">' + o[1] + "</button>").join("");
    let html = '<div class="ov-top"><div class="seg" role="group" aria-label="Domain">' +
      segBtns("ov-domain", "domain", state.domain, DOMAINS.map((d) => [d.id, d.name])) + "</div>" +
      '<div class="seg" role="group" aria-label="View">' +
      segBtns("ov-view", "view", state.ovView, [["list", "☰ List"], ["calendar", "📅 Calendar"], ["timeline", "📊 Timeline"]]) +
      "</div></div>" + overviewFilterHtml();

    if (state.ovView === "calendar") { el.innerHTML = html + overviewCalendar(); return; }
    if (state.ovView === "timeline") {
      el.innerHTML = html + overviewTimeline();
      const sc = el.querySelector(".tl-scroll"); // start with today in view
      if (sc && sc.dataset.today) sc.scrollLeft = Math.max(0, Number(sc.dataset.today) - sc.clientWidth / 3);
      return;
    }

    // List view. Top of each tree: open items with no parent (or whose parent is already completed).
    const roots = state.items
      .filter((i) => i.domain === state.domain && !i.done && (!i.parentId || (byId(i.parentId) || { done: true }).done))
      .filter((i) => !filterActive() || nodeVisible(i))
      .sort((a, b) => a.tier - b.tier || a.createdAt - b.createdAt);
    if (roots.length && !filterActive()) {
      html += '<div class="ov-tools"><button class="ov-link" data-action="ov-expand">Expand all</button>' +
        '<button class="ov-link" data-action="ov-collapse">Collapse all</button></div>';
    }
    if (roots.length && filterActive()) {
      html += '<p class="ov-note">Showing items that match the target filter, with the items they are inside (dimmed).</p>';
    }
    html += roots.length
      ? '<ul class="o-list">' + roots.map(overviewNode).join("") + "</ul>"
      : '<div class="empty"><p>' + (filterActive() ? "No open items match this target filter." : "Nothing open in this domain.<br>Create items from the To-Do list.") + "</p></div>";
    el.innerHTML = html;
  }

  /* ---- Overview: calendar and timeline views (open items that have a due date) ---- */
  const dayKey = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  const dueItems = () => state.items.filter((i) => i.domain === state.domain && !i.done && hasDue(i) && matchesFilter(i));
  const deadlineItems = () => state.items.filter((i) => i.domain === state.domain && !i.done && hasDeadline(i) && matchesFilter(i));
  let calCursor = null; // { y, m } month being shown; null = current month
  let calDay = null;    // "YYYY-MM-DD" of the selected day
  const calCursorNow = () => calCursor || { y: new Date().getFullYear(), m: new Date().getMonth() };

  function unscheduledNote() {
    const n = state.items.filter((i) => i.domain === state.domain && !i.done && !hasDeadline(i)).length;
    return n ? '<p class="ov-note">' + n + " open item" + (n === 1 ? " has" : "s have") + " no deadline, so " +
      (n === 1 ? "it isn't" : "they aren't") + " shown here.</p>" : "";
  }

  function overviewCalendar() {
    const { y, m } = calCursorNow();
    const todayKey = dayKey(new Date());
    if (!calDay) calDay = todayKey;
    const byDay = {};
    dueItems().sort((a, b) => a.dueAt - b.dueAt).forEach((i) => {
      const k = dayKey(new Date(i.dueAt));
      (byDay[k] = byDay[k] || []).push(i);
    });
    const offset = (new Date(y, m, 1).getDay() + 6) % 7; // weeks start on Monday
    const dim = new Date(y, m + 1, 0).getDate();
    const total = Math.ceil((offset + dim) / 7) * 7;
    const monthName = new Date(y, m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

    let cells = "";
    for (let idx = 0; idx < total; idx++) {
      const d = new Date(y, m, idx - offset + 1);
      const k = dayKey(d);
      const list = byDay[k] || [];
      const cls = "cal-cell" + (d.getMonth() !== m ? " out" : "") + (k === todayKey ? " today" : "") + (k === calDay ? " selected" : "");
      const dots = list.slice(0, 3).map((i) => '<i style="background:' + tierOf(i.tier).color + '"></i>').join("") +
        (list.length > 3 ? '<b>+' + (list.length - 3) + "</b>" : "");
      const titles = list.slice(0, 2).map((i) => '<span class="cal-t' + (isOverdue(i) ? " overdue" : "") + '" style="' +
        tierStyle(i.tier) + '">' + escapeHtml(i.title) + "</span>").join("") +
        (list.length > 2 ? '<span class="cal-more">+' + (list.length - 2) + " more</span>" : "");
      cells += '<button class="' + cls + '" data-action="cal-day" data-day="' + k + '" aria-label="' +
        d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) + ", " + list.length + ' due">' +
        '<span class="cal-n">' + d.getDate() + '</span><span class="cal-dots">' + dots + '</span><span class="cal-titles">' + titles + "</span></button>";
    }
    const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => "<span>" + w + "</span>").join("");

    const sel = byDay[calDay] || [];
    const selDate = new Date(calDay + "T00:00:00");
    const dayList = sel.length
      ? '<ul class="o-list">' + sel.map((i) =>
        '<li><button class="cal-item" style="' + tierStyle(i.tier) + '" data-action="open" data-id="' + i.id + '"><span class="edge"></span>' +
        '<span class="cal-time' + (isOverdue(i) ? " overdue" : "") + '">' +
        new Date(i.dueAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) + '</span><span class="o-body"><span class="o-title">' +
        escapeHtml(i.title) + '</span><span class="o-meta"><span class="ctier">' + tierOf(i.tier).name + "</span></span></span></button></li>").join("") + "</ul>"
      : '<p class="ov-note">Nothing due on this day.</p>';

    // Coarse targets can't sit on a day, so they are listed under the grid for the month / year being shown.
    const targetList = (key, title) => {
      const list = deadlineItems().filter((i) => i.target === key);
      return list.length ? '<h3 class="cal-day-title">🎯 ' + title + '</h3><ul class="o-list">' + list.map((i) =>
        '<li><button class="cal-item" style="' + tierStyle(i.tier) + '" data-action="open" data-id="' + i.id + '"><span class="edge"></span>' +
        '<span class="cal-time' + (isOverdue(i) ? " overdue" : "") + '">🎯</span><span class="o-body"><span class="o-title">' +
        escapeHtml(i.title) + '</span><span class="o-meta"><span class="ctier">' + tierOf(i.tier).name + "</span></span></span></button></li>").join("") + "</ul>" : "";
    };
    const targets = targetList(y + "-" + pad2(m + 1), "Targeting " + monthName) + targetList(String(y), "Targeting " + y);

    return '<div class="cal-head"><button class="icon-btn" data-action="cal-prev" aria-label="Previous month">‹</button>' +
      '<h2 class="cal-title">' + monthName + '</h2><button class="icon-btn" data-action="cal-next" aria-label="Next month">›</button>' +
      '<button class="ov-link" data-action="cal-today">Today</button></div>' +
      '<div class="cal-week">' + weekdays + '</div><div class="cal-grid">' + cells + "</div>" +
      '<h3 class="cal-day-title">' + selDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) + "</h3>" +
      dayList + targets + unscheduledNote();
  }

  // Gantt-style timeline: each open item with a due date is a bar from when it was created to when it is due.
  function overviewTimeline() {
    const DAY = 86400000, PX = 32;
    const now = Date.now();
    const items = deadlineItems().sort((a, b) => deadlineEnd(a) - deadlineEnd(b));
    if (!items.length) return '<div class="empty"><p>No open items with a deadline' + (filterActive() ? " match this filter" : " in this domain") +
      '.<br>Add a date or target when you create or edit an item.</p></div>' + unscheduledNote();
    const startOf = (i) => Math.min(i.createdAt, deadlineEnd(i));
    const sod = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const t0 = sod(Math.min(now, ...items.map(startOf))) - 2 * DAY;
    const t1 = sod(Math.max(now, ...items.map(deadlineEnd))) + 3 * DAY;
    const days = Math.round((t1 - t0) / DAY);
    const x = (ms) => ((ms - t0) / DAY) * PX;
    const first = new Date(t0);

    let head = "", months = "";
    for (let k = 0; k < days; k++) {
      const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + k);
      const cls = "tl-day" + (dayKey(d) === dayKey(new Date()) ? " today" : "") + ([0, 6].includes(d.getDay()) ? " wknd" : "");
      head += '<span class="' + cls + '" style="left:' + k * PX + "px;width:" + PX + 'px">' + d.getDate() + "</span>";
      if (k === 0 || d.getDate() === 1) {
        months += '<span class="tl-month" style="left:' + k * PX + 'px">' +
          d.toLocaleDateString(undefined, { month: "short", year: "numeric" }) + "</span>";
      }
    }
    const rows = items.map((i) => {
      const end = deadlineEnd(i);
      const left = x(startOf(i)), width = Math.max(14, x(end) - left);
      const label = hasDue(i) ? fmtDue(i.dueAt) : "🎯 " + targetLabel(i.target, true);
      const crumbs = crumbTrail(i.id);
      return '<div class="tl-row"><button class="tl-label" data-action="open" data-id="' + i.id + '"><span class="tl-name">' +
        escapeHtml(i.title) + "</span>" + (crumbs ? '<small>' + crumbs + "</small>" : "") + "</button>" +
        '<div class="tl-track"><button class="tl-bar' + (hasTarget(i) ? " target" : "") + (isOverdue(i) ? " overdue" : "") + '" style="' + tierStyle(i.tier) +
        ";left:" + left + "px;width:" + width + 'px" data-action="open" data-id="' + i.id + '" title="' + escapeHtml(i.title) +
        (hasDue(i) ? " — due " : " — target ") + escapeHtml(label.replace("🎯 ", "")) + '"><span>' + escapeHtml(label) + "</span></button></div></div>";
    }).join("");

    return '<div class="tl-scroll" data-today="' + Math.round(x(now)) + '"><div class="tl-grid" style="--w:' + days * PX + "px;--px:" + PX + 'px">' +
      '<div class="tl-head"><div class="tl-corner"></div><div class="tl-axis"><div class="tl-months">' + months +
      '</div><div class="tl-days">' + head + "</div></div></div>" + rows +
      '<div class="tl-now" style="left:calc(var(--lw) + ' + x(now) + 'px)" title="Now"></div></div></div>' +
      '<p class="ov-note">Each bar runs from when the item was created to its due date (dashed bars: to the end of its target month or year). A red outline means overdue; the red line is now.</p>' + unscheduledNote();
  }

  /* ---- Settings feature: XP values and theme ---- */
  function renderSettings(el) {
    const total = totalXp();
    const lv = levelInfo(total);
    const theme = state.settings.theme;
    el.innerHTML =
      '<div class="settings">' +
      '<div class="xp-card"><div class="xp-level">Level ' + lv.level + '</div><div class="xp-total">' + total +
      ' XP</div><span class="bar" style="--c:#FACC15" aria-hidden="true"><i style="width:' +
      Math.round((lv.into / lv.span) * 100) + '%"></i></span><small>' + (lv.span - lv.into) +
      " XP to level " + (lv.level + 1) + "</small></div>" +
      "<h2>Appearance</h2>" +
      '<div class="seg" role="group" aria-label="Theme">' +
      '<button data-action="set-theme" data-mode="dark" aria-pressed="' + (theme === "dark") + '">🌙 Dark</button>' +
      '<button data-action="set-theme" data-mode="light" aria-pressed="' + (theme === "light") + '">☀️ Light</button></div>' +
      "<h2>XP per completion</h2><p>XP earned when an item is completed. Your total is counted from the items you have " +
      "completed, so changing a value updates it.</p>" +
      TIERS.map((t) =>
        '<label class="xp-row" style="' + tierStyle(t.tier) + '"><span class="h-dot"></span><span class="xp-name">' +
        t.name + '</span><input class="xp-input" type="number" min="0" max="99999" step="1" inputmode="numeric" ' +
        'data-tier="' + t.tier + '" value="' + state.settings.xp[t.tier] + '" aria-label="XP for ' + t.name +
        '"><span>XP</span></label>').join("") +
      '<button class="bk-btn warn" data-action="xp-reset">Reset XP to defaults</button>' + shortcutsHtml() + "</div>";
  }

  /* ---- Trash feature: deleted items wait here for TRASH_DAYS ---- */
  function renderTrash(el) {
    if (!state.trash.length) {
      el.innerHTML = '<div class="empty"><p>Trash is empty.<br>Deleted items stay here for ' + TRASH_DAYS + " days.</p></div>";
      return;
    }
    const now = Date.now();
    el.innerHTML = '<div class="trash-head"><p>Items here are removed for good after ' + TRASH_DAYS +
      ' days.</p><button class="bk-btn warn" data-action="trash-empty">Empty Trash</button></div><ul class="h-list">' +
      state.trash.map((e) => {
        const root = e.items.find((i) => i.id === e.rootId);
        const nested = e.items.length - 1;
        const left = Math.max(1, Math.ceil(TRASH_DAYS - (now - e.deletedAt) / 86400000));
        const date = new Date(e.deletedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
        const dom = DOMAINS.find((d) => d.id === root.domain);
        return '<li class="h-row" style="' + tierStyle(root.tier) + '"><span class="edge"></span><div class="h-open">' +
          '<span class="h-title">' + escapeHtml(root.title) + '</span><span class="h-meta">' + tierOf(root.tier).name +
          (nested ? " + " + nested + " inside" : "") + (dom ? " · " + dom.name : "") + " · deleted " + date + " · " +
          left + " day" + (left === 1 ? "" : "s") + " left</span></div>" +
          '<button class="h-restore" data-action="trash-restore" data-id="' + e.id + '" aria-label="Restore ' +
          escapeHtml(root.title) + '">↺ Restore</button>' +
          '<button class="h-restore danger" data-action="trash-purge" data-id="' + e.id + '" aria-label="Delete ' +
          escapeHtml(root.title) + ' forever">✕ Forever</button></li>';
      }).join("") + "</ul>";
  }

  /* ---- Backup feature: export / import everything as one JSON file ---- */
  function renderBackup(el) {
    const stored = readJSON(ITEMS_KEY, null);
    const n = Array.isArray(stored) ? stored.length : state.items.length;
    const t = state.trash.length;
    el.innerHTML =
      '<div class="backup">' +
      "<h2>Export</h2><p>Download everything stored in this browser (" + n + " item" + (n === 1 ? "" : "s") +
      (t ? " plus " + t + " in Trash" : "") + ") as a JSON file.</p>" +
      '<button class="bk-btn" data-action="backup-export">⬇ Export data</button>' +
      "<h2>Import</h2><p>Choose a JSON file exported from this app. " +
      "<b>It replaces everything currently stored.</b></p>" +
      '<button class="bk-btn warn" data-action="backup-import">⬆ Import data…</button>' +
      '<input id="backup-file" type="file" accept=".json,application/json" hidden>' +
      "</div>";
  }

  function exportData() {
    const items = readJSON(ITEMS_KEY, null);
    const data = {
      app: "legendary-todo",
      version: 1,
      exportedAt: new Date().toISOString(),
      items: Array.isArray(items) ? items : state.items,
      trash: Array.isArray(readJSON(TRASH_KEY, null)) ? readJSON(TRASH_KEY, null) : state.trash,
      settings: state.settings,
      ui: readJSON(UI_KEY, null) || { filters: state.filters, search: state.search, domain: state.domain, ovView: state.ovView },
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
    toast("Exported " + data.items.length + " item" + (data.items.length === 1 ? "" : "s") + ".");
  }

  async function importFile(file) {
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch (e) {
      toast("Couldn't import: that file isn't valid JSON.");
      return;
    }
    const raw = Array.isArray(data) ? data : data && data.items;
    if (!Array.isArray(raw)) { toast("Couldn't import: no items found in that file."); return; }
    const valid = raw.filter(isValidItem);
    if (raw.length && !valid.length) { toast("Couldn't import: none of the items in that file are valid."); return; }
    const skipped = raw.length - valid.length;
    const msg = "Replace all " + state.items.length + " current item(s) with " + valid.length + " item(s) from \"" +
      file.name + "\"?" + (skipped ? "\n(" + skipped + " invalid entr" + (skipped === 1 ? "y" : "ies") + " will be skipped.)" : "") +
      "\n\nThis can't be undone.";
    if (!window.confirm(msg)) return;

    normalizeItems(valid);
    state.timer = null; // a running timer belongs to the data being replaced
    saveTimer();
    state.trash = normalizeTrash(!Array.isArray(data) && data ? data.trash : []); // a file without a trash empties it
    if (!Array.isArray(data) && data && data.settings) { // older backups have no settings: keep the current ones
      state.settings = normalizeSettings(data.settings);
      saveSettings();
      applyTheme();
    }
    const ui = !Array.isArray(data) && data && data.ui;
    state.filters = ui && Array.isArray(ui.filters) && ui.filters.length
      ? ui.filters.filter((t) => Number.isInteger(t) && t >= 1 && t <= 5) : [1, 2, 3, 4, 5];
    if (!state.filters.length) state.filters = [1, 2, 3, 4, 5];
    state.search = ui && typeof ui.search === "string" ? ui.search : "";
    if (ui && ["list", "calendar", "timeline"].includes(ui.ovView)) state.ovView = ui.ovView;
    state.domain = ui && isDomain(ui.domain) ? ui.domain : state.domain;
    searchEl.value = state.search;
    collapsed.clear();
    historyOpen.clear();
    selectMode = false;
    selected.clear();
    save();
    saveTrash();
    saveUI();
    render();
    toast("Imported " + state.items.length + " item" + (state.items.length === 1 ? "" : "s") + ".");
  }

  /* ---- Undo toast (shown when a Legend is completed) ---- */
  const undoEl = $("#undo-toast");
  let undoTimer = null;
  let undoFn = null;
  function showUndo(msg, fn) {
    undoFn = fn;
    undoEl.querySelector(".undo-msg").textContent = msg;
    undoEl.hidden = false;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(hideUndo, 8000);
  }
  function hideUndo() {
    clearTimeout(undoTimer);
    undoEl.hidden = true;
    undoFn = null;
  }

  /* ---- Side menu ---- */
  const drawerEl = $("#drawer");
  const backdropEl = $("#drawer-backdrop");
  const featureEl = $("#feature");

  const activeFeatureId = () => {
    const fm = location.hash.match(/^#\/f\/([^/]+)$/);
    return fm ? decodeURIComponent(fm[1]) : "todo";
  };

  function renderDrawer() {
    const active = activeFeatureId();
    $("#drawer-nav").innerHTML = FEATURES.map((f) =>
      '<button class="nav-item" data-action="nav" data-feature="' + escapeHtml(f.id) + '"' +
      (f.id === active ? ' aria-current="page"' : "") + '><span class="nav-icon" aria-hidden="true">' +
      f.icon + "</span><span>" + escapeHtml(f.name) + "</span></button>").join("");
  }

  function setDrawer(open) {
    if (open) renderDrawer();
    drawerEl.classList.toggle("open", open);
    drawerEl.inert = !open;
    drawerEl.setAttribute("aria-hidden", String(!open));
    backdropEl.hidden = !open;
    document.querySelectorAll(".menu-btn").forEach((b) => b.setAttribute("aria-expanded", String(open)));
    if (open) drawerEl.querySelector(".nav-item[aria-current], .nav-item").focus();
  }

  function renderFeature(id) {
    const f = FEATURES.find((x) => x.id === id);
    if (!f || id === "todo") { location.replace("#/"); return; }
    homeEl.hidden = true;
    detailEl.hidden = true;
    featureEl.hidden = false;
    themeMeta.setAttribute("content", homeColor());
    $("#feature-title").textContent = f.name;
    const body = $("#feature-body");
    body.innerHTML = "";
    if (typeof f.render === "function") f.render(body);
    else body.textContent = f.name + " is coming soon.";
  }

  function render() {
    renderRoute();
    updateClocks();
  }

  function renderRoute() {
    hideMenu();
    if (selectMode && location.hash && location.hash !== "#/") { // left the home list
      selectMode = false;
      selected.clear();
      document.body.classList.remove("selecting");
      $("#select-bar").hidden = true;
    }
    const fm =location.hash.match(/^#\/f\/([^/]+)$/);
    if (fm) { renderFeature(decodeURIComponent(fm[1])); return; }
    featureEl.hidden = true;
    const m = location.hash.match(/^#\/item\/([^/]+)$/);
    if (m) {
      const item = byId(decodeURIComponent(m[1]));
      if (!item) { location.replace("#/"); return; }
      homeEl.hidden = true;
      detailEl.hidden = false;
      renderDetail(item);
      window.scrollTo(0, 0);
    } else {
      detailEl.hidden = true;
      homeEl.hidden = false;
      themeMeta.setAttribute("content", homeColor());
      renderHome();
    }
  }

  /* ---- Sheet ---- */
  const sheetEl = $("#sheet");
  const sheetForm = $("#sheet-form");
  const fTitle = $("#f-title");
  const fNotes = $("#f-notes");
  const fDue = $("#f-due");
  const fTMonth = $("#f-t-month");
  const fTYear = $("#f-t-year");

  // Deadline type in the sheet: "none" | "date" (exact date+time) | "month" | "year" (coarse targets)
  function setDlMode(mode) {
    if (!sheet) return;
    sheet.dlMode = mode;
    document.querySelectorAll("#dl-modes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
    $("#dl-modes").classList.toggle("sep", mode !== "none"); // divider between the type buttons and the options below
    $("#dl-date").hidden = mode !== "date";
    $("#dl-target").hidden = mode !== "month" && mode !== "year";
    fTMonth.hidden = mode !== "month";
    document.querySelectorAll(".tg-m").forEach((b) => { b.hidden = mode !== "month"; });
    document.querySelectorAll(".tg-y").forEach((b) => { b.hidden = mode !== "year"; });
  }

  function fillTargetSelects(target) {
    const now = new Date();
    const y = target ? +target.slice(0, 4) : now.getFullYear();
    const m = target && target.length === 7 ? +target.slice(5) - 1 : now.getMonth();
    fTMonth.innerHTML = Array.from({ length: 12 }, (_, k) =>
      '<option value="' + k + '">' + new Date(2000, k, 1).toLocaleDateString(undefined, { month: "long" }) + "</option>").join("");
    const from = Math.min(now.getFullYear() - 1, y), to = Math.max(now.getFullYear() + 10, y);
    let years = "";
    for (let yr = from; yr <= to; yr++) years += '<option value="' + yr + '">' + yr + "</option>";
    fTYear.innerHTML = years;
    fTMonth.value = String(m);
    fTYear.value = String(y);
  }

  function applyTargetPreset(kind) {
    const now = new Date();
    if (kind === "thismonth" || kind === "nextmonth") {
      const d = new Date(now.getFullYear(), now.getMonth() + (kind === "nextmonth" ? 1 : 0), 1);
      fTMonth.value = String(d.getMonth());
      fTYear.value = String(d.getFullYear());
    } else {
      fTYear.value = String(now.getFullYear() + (kind === "nextyear" ? 1 : 0));
    }
  }

  // The deadline fields as { dueAt, target } for the current sheet mode (the unused one is null).
  function readDeadline() {
    const mode = sheet ? sheet.dlMode : "none";
    if (mode === "date") return { dueAt: fromLocalInput(fDue.value), target: null };
    if (mode === "month") return { dueAt: null, target: fTYear.value + "-" + pad2(+fTMonth.value + 1) };
    if (mode === "year") return { dueAt: null, target: fTYear.value };
    return { dueAt: null, target: null };
  }

  const pad2 = (n) => String(n).padStart(2, "0");
  // ms timestamp <-> the "YYYY-MM-DDTHH:mm" text a datetime-local input uses (local time)
  const toLocalInput = (ms) => {
    const d = new Date(ms);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  };
  const fromLocalInput = (s) => { const t = s ? new Date(s).getTime() : NaN; return isFinite(t) ? t : null; };

  // Quick due-date buttons. They keep any time already typed in the field, otherwise use 5 PM.
  function applyDuePreset(kind) {
    if (kind === "clear") { fDue.value = ""; return; }
    const cur = fromLocalInput(fDue.value);
    const curD = cur == null ? null : new Date(cur);
    const d = new Date();
    if (kind === "tomorrow") d.setDate(d.getDate() + 1);
    else if (kind === "week") d.setDate(d.getDate() + 7);
    else if (kind === "month") {
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
      d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); // Jan 31 -> Feb 28, not Mar 3
    }
    d.setHours(curD ? curD.getHours() : 17, curD ? curD.getMinutes() : 0, 0, 0);
    if (kind === "today" && !curD && d.getTime() <= Date.now()) d.setHours(23, 59, 0, 0); // 5 PM already passed
    fDue.value = toLocalInput(d.getTime());
  }
  const fError = $("#f-error");
  const pickerEl = $("#tier-picker");

  function showFormError(msg) {
    fError.textContent = msg || "";
    fError.hidden = !msg;
  }

  function enabledTiers() {
    if (sheet.mode === "create") return legalTiersFor(sheet.parentId);
    const item = byId(sheet.id);
    return TIERS.map((t) => t.tier).filter((n) => !tierError(item, n) || n === item.tier);
  }

  function renderPicker() {
    const ok = enabledTiers();
    pickerEl.setAttribute("role", "radiogroup");
    pickerEl.innerHTML = TIERS.map((t) => {
      const allowed = ok.includes(t.tier);
      return '<button type="button" class="tier-btn" style="' + tierStyle(t.tier) +
        '" role="radio" data-action="pick-tier" data-tier="' + t.tier + '" aria-checked="' +
        (sheet.tier === t.tier) + '"' + (allowed ? "" : " disabled") +
        (allowed ? "" : ' title="Not allowed here"') + ">" + t.name + "</button>";
    }).join("");
  }

  function openSheet(mode, opts) {
    sheet = Object.assign({ mode, parentId: null, id: null, tier: null }, opts);
    showFormError("");
    if (mode === "edit") {
      const item = byId(sheet.id);
      $("#sheet-heading").textContent = "Edit " + tierOf(item.tier).name;
      fTitle.value = item.title;
      fNotes.value = item.notes || "";
      fDue.value = typeof item.dueAt === "number" ? toLocalInput(item.dueAt) : "";
      fillTargetSelects(hasTarget(item) ? item.target : null);
      sheet.dlMode = hasDue(item) ? "date" : hasTarget(item) ? (item.target.length === 7 ? "month" : "year") : "none";
      sheet.tier = item.tier;
    } else {
      $("#sheet-heading").textContent = sheet.parentId ? "Add inside" : "New item";
      fTitle.value = "";
      fNotes.value = "";
      fDue.value = "";
      fillTargetSelects(null);
      sheet.dlMode = "none";
      sheet.tier = legalTiersFor(sheet.parentId)[0] || null;
    }
    renderPicker();
    setDlMode(sheet.dlMode);
    sheetEl.showModal();
    if (sheet.focusDeadline) {
      $("#dl-field").scrollIntoView({ block: "center" });
      const pressed = document.querySelector('#dl-modes [aria-pressed="true"]');
      if (pressed) pressed.focus({ preventScroll: true });
    } else {
      fTitle.focus();
    }
  }

  function submitSheet(e) {
    e.preventDefault();
    if (!sheet) return;
    const title = fTitle.value;
    if (!title.trim()) { showFormError("Please enter a title."); fTitle.focus(); return; }
    if (!sheet.tier) { showFormError("Choose a type."); return; }
    let res;
    if (sheet.mode === "create") {
      res = createItem(Object.assign({ title, tier: sheet.tier, parentId: sheet.parentId, notes: fNotes.value }, readDeadline()));
      if (res.item && sheet.parentId) collapsed.delete(sheet.parentId);
    } else {
      res = updateItem(sheet.id, Object.assign({ title, tier: sheet.tier, notes: fNotes.value.trim() }, readDeadline()));
    }
    if (res.error) { showFormError(res.error); return; }
    sheetEl.close();
  }

  /* ---- Toast ---- */
  const toastEl = $("#toast");
  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4500);
  }

  /* ============ 7. EVENTS ============ */
  const currentId = () => {
    const m = location.hash.match(/^#\/item\/([^/]+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  };

  function goBack() {
    const item = byId(currentId());
    location.hash = item && item.parentId ? "#/item/" + encodeURIComponent(item.parentId) : "#/";
  }

  function toggleSelectAll() {
    const all = visibleItems();
    if (selected.size === all.length) selected.clear();
    else all.forEach((i) => selected.add(i.id));
    renderHome();
  }

  function completeSelected() {
    if (!selected.size) return;
    const { completed, legends } = completeMany([...selected]);
    exitSelect();
    xpToast(completed);
    if (legends.length) {
      showUndo(legends.length === 1 ? 'Completed "' + legends[0].title + '"' : "Completed " + legends.length + " Legends",
        () => uncomplete(completed));
    }
  }

  function toggleTheme() {
    state.settings.theme = state.settings.theme === "light" ? "dark" : "light";
    saveSettings();
    applyTheme();
    render();
  }

  function confirmDeleteMany(ids) {
    if (!ids.length) return;
    const gone = new Set(ids);
    ids.forEach((id) => getDescendants(id).forEach((d) => gone.add(d.id)));
    const nested = gone.size - ids.length;
    pendingDeleteIds = ids;
    $("#confirm-heading").textContent = "Delete " + ids.length + " item" + (ids.length === 1 ? "" : "s") + "?";
    $("#confirm-text").textContent = (nested
      ? "They and " + nested + " nested item" + (nested === 1 ? "" : "s") + " will move to Trash. "
      : "They will move to Trash. ") + "You can restore them for " + TRASH_DAYS + " days.";
    $("#confirm").showModal();
  }

  function confirmDelete(id) {
    const item = byId(id);
    if (!item) return;
    const n = getDescendants(id).length;
    pendingDeleteId = id;
    $("#confirm-heading").textContent = 'Delete "' + item.title + '"?';
    $("#confirm-text").textContent = n
      ? "It and its " + n + " nested item" + (n === 1 ? "" : "s") + " will move to Trash. You can restore them for " + TRASH_DAYS + " days."
      : "It will move to Trash. You can restore it for " + TRASH_DAYS + " days.";
    $("#confirm").showModal();
  }

  document.addEventListener("click", (e) => {
    // Clicking a dialog's backdrop targets the dialog itself.
    if (e.target instanceof HTMLDialogElement) { e.target.close(); return; }

    const el = e.target.closest("[data-action]");
    if (!el) return;
    const id = el.dataset.id;

    switch (el.dataset.action) {
      case "open":
        if (selectMode && el.classList.contains("card")) { // select mode: tapping a card picks it
          if (selected.has(id)) selected.delete(id); else selected.add(id);
          renderHome();
        } else {
          location.hash = "#/item/" + encodeURIComponent(id);
        }
        break;
      case "ctx-select":
        hideMenu();
        selectMode = true;
        selected.clear();
        selected.add(id);
        renderHome();
        break;
      case "select-cancel":
        exitSelect();
        break;
      case "select-all":
        toggleSelectAll();
        break;
      case "select-complete":
        completeSelected();
        break;
      case "select-delete":
        confirmDeleteMany([...selected]);
        break;
      case "back":
        goBack();
        break;
      case "toggle":
        toggleDone(id);
        break;
      case "fold":
        if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
        render();
        break;
      case "add-top":
        openSheet("create", { parentId: null });
        break;
      case "add-inside":
        openSheet("create", { parentId: id });
        break;
      case "edit":
        if (currentId()) openSheet("edit", { id: currentId() });
        break;
      case "delete":
        if (currentId()) confirmDelete(currentId());
        break;
      case "chip": {
        const t = Number(el.dataset.tier);
        if (state.filters.length === 5) state.filters = [t];            // from "all": isolate this type
        else if (!state.filters.includes(t)) state.filters = state.filters.concat(t).sort();
        else {
          const rest = state.filters.filter((x) => x !== t);
          state.filters = rest.length ? rest : [1, 2, 3, 4, 5];         // removing the last one resets to all
        }
        saveUI();
        renderHome();
        break;
      }
      case "chip-all":
        state.filters = state.filters.length === 5 ? [] : [1, 2, 3, 4, 5];
        saveUI();
        renderHome();
        break;
      case "home":
        location.hash = "#/";
        break;
      case "undo": {
        const fn = undoFn;
        hideUndo();
        if (fn) fn();
        break;
      }
      case "undo-dismiss":
        hideUndo();
        break;
      case "set-theme":
        state.settings.theme = el.dataset.mode === "light" ? "light" : "dark";
        saveSettings();
        applyTheme();
        render();
        break;
      case "xp-reset":
        state.settings.xp = Object.assign({}, DEFAULT_XP);
        saveSettings();
        render();
        break;
      case "trash-restore":
        restoreEntries([id]);
        break;
      case "trash-purge": {
        const e = state.trash.find((x) => x.id === id);
        const root = e && e.items.find((i) => i.id === e.rootId);
        if (root && window.confirm('Permanently delete "' + root.title + '"' +
            (e.items.length > 1 ? " and " + (e.items.length - 1) + " nested item(s)" : "") + "? This can't be undone.")) {
          state.trash = state.trash.filter((x) => x.id !== id);
          saveTrash();
          render();
        }
        break;
      }
      case "trash-empty":
        if (state.trash.length && window.confirm("Permanently delete everything in Trash (" + state.trash.length +
            " entr" + (state.trash.length === 1 ? "y" : "ies") + ")? This can't be undone.")) {
          state.trash = [];
          saveTrash();
          render();
        }
        break;
      case "backup-export":
        exportData();
        break;
      case "backup-import":
        $("#backup-file").click();
        break;
      case "ov-nodeadline":
        state.ovFilter = { y: null, m: null, none: !state.ovFilter.none };
        render();
        break;
      case "ov-clear-filter":
        state.ovFilter = { y: null, m: null, none: false };
        render();
        break;
      case "set-deadline": // opens the edit sheet, scrolled to the deadline section
        openSheet("edit", { id, focusDeadline: true });
        break;
      case "sess-fold":
        if (sessionsOpen.has(id)) sessionsOpen.delete(id); else sessionsOpen.add(id);
        render();
        break;
      case "timer-toggle":
        toggleTimer(id);
        break;
      case "timer-open":
        if (state.timer) location.hash = "#/item/" + encodeURIComponent(state.timer.id);
        break;
      case "dl-mode":
        setDlMode(el.dataset.mode);
        break;
      case "tg-preset":
        applyTargetPreset(el.dataset.kind);
        break;
      case "due-preset":
        applyDuePreset(el.dataset.kind);
        break;
      case "ov-view":
        state.ovView = el.dataset.view;
        saveUI();
        render();
        break;
      case "cal-prev":
      case "cal-next": {
        const c = calCursorNow();
        const m = c.m + (el.dataset.action === "cal-next" ? 1 : -1);
        calCursor = { y: c.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
        render();
        break;
      }
      case "cal-today":
        calCursor = null;
        calDay = dayKey(new Date());
        render();
        break;
      case "cal-day":
        calDay = el.dataset.day;
        render();
        break;
      case "ov-fold":
        if (overviewOpen.has(id)) overviewOpen.delete(id); else overviewOpen.add(id);
        render();
        break;
      case "ov-expand":
        state.items.forEach((i) => { if (activeKids(i.id).length) overviewOpen.add(i.id); });
        render();
        break;
      case "ov-collapse":
        overviewOpen.clear();
        render();
        break;
      case "ov-domain":
        state.domain = el.dataset.domain;
        saveUI();
        render();
        break;
      case "hist-fold":
        if (historyOpen.has(id)) historyOpen.delete(id); else historyOpen.add(id);
        render();
        break;
      case "restore": // restoring an item also restores everything nested inside it
        uncomplete([id].concat(getDescendants(id).map((d) => d.id)));
        break;
      case "ctx-done":
        hideMenu();
        toggleDone(id);
        break;
      case "ctx-edit":
        hideMenu();
        openSheet("edit", { id });
        break;
      case "ctx-delete":
        hideMenu();
        confirmDelete(id);
        break;
      case "menu":
        setDrawer(true);
        break;
      case "menu-close":
        setDrawer(false);
        break;
      case "nav": {
        const f = FEATURES.find((x) => x.id === el.dataset.feature);
        setDrawer(false);
        if (f && location.hash !== f.hash) location.hash = f.hash;
        break;
      }
      case "domain-prev":
        switchDomain(-1);
        break;
      case "domain-next":
        switchDomain(1);
        break;
      case "clear-filters":
        state.filters = [1, 2, 3, 4, 5];
        state.search = "";
        searchEl.value = "";
        saveUI();
        renderHome();
        break;
      case "pick-tier":
        sheet.tier = Number(el.dataset.tier);
        showFormError("");
        renderPicker();
        break;
      case "sheet-cancel":
        sheetEl.close();
        break;
    }
  });

  searchEl.addEventListener("input", () => {
    state.search = searchEl.value;
    saveUI();
    renderHome();
  });

  /* ---- Drag a card onto a bigger card (or the top-level zone) to re-parent it ---- */
  const dropTopEl = $("#drop-top");
  const HOLD_MS = 350;   // touch: press and hold this long before the drag starts
  const SLOP = 8;        // px of movement that starts a mouse drag / cancels a touch hold
  // Gesture on a card: press -> (hold) quick-actions menu -> (move) drag, which dismisses the menu.
  // `held` = the menu is showing and the pointer is still down.
  const dnd = { id: null, card: null, ghost: null, timer: 0, x0: 0, y0: 0, type: "", active: false, held: false,
                hover: null, raf: 0, py: 0, dx: 0, dy: 0 };
  let suppressClick = false;

  /* ---- Quick-actions menu (press and hold a card) ---- */
  let ctxMenu = null; // { el, card }

  function hideMenu() {
    if (!ctxMenu) return;
    ctxMenu.el.remove();
    ctxMenu.card.classList.remove("ctx-open");
    ctxMenu = null;
  }

  function showMenu(card) {
    hideMenu();
    const item = byId(card.dataset.id);
    if (!item) return;
    const actions = [
      ["ctx-select", "☑", "Select", "Pick several items to complete or delete", ""],
      ["ctx-done", item.done ? "↺" : "✓", item.done ? "Mark as not done" : "Mark as done",
        item.done ? "Put it back on your list" : "Tick it off your list", ""],
      ["ctx-edit", "✎", "Edit", "Change title, type or notes", ""],
      ["ctx-delete", "🗑", "Delete", "Move it and what's inside to Trash", " danger"],
    ];
    const el = document.createElement("div");
    el.className = "ctx-menu";
    el.setAttribute("role", "menu");
    el.innerHTML = actions.map((a) =>
      '<button class="ctx-item' + a[4] + '" role="menuitem" data-action="' + a[0] + '" data-id="' + item.id +
      '"><span class="ctx-icon" aria-hidden="true">' + a[1] + '</span><span class="ctx-text"><b>' + a[2] +
      "</b><small>" + a[3] + "</small></span></button>").join("");
    document.body.appendChild(el);

    // Open below the card if there is room, otherwise above it.
    const r = card.getBoundingClientRect();
    const mh = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    const width = Math.min(280, vw - 16);
    const below = vh - r.bottom, above = r.top;
    let top = (below >= mh + 12 || below >= above) ? r.bottom + 6 : r.top - mh - 6;
    top = Math.max(8, Math.min(top, vh - mh - 8));
    el.style.width = width + "px";
    el.style.top = top + "px";
    el.style.left = Math.max(8, Math.min(r.left + 8, vw - width - 8)) + "px";
    card.classList.add("ctx-open");
    ctxMenu = { el, card };
    if (navigator.vibrate) navigator.vibrate(15);
  }

  function holdMenu() {
    if (!dnd.id || dnd.active) return;
    dnd.held = true;
    showMenu(dnd.card);
  }

  document.addEventListener("pointerdown", (e) => {
    if (ctxMenu && !e.target.closest(".ctx-menu")) hideMenu();
  }, true);
  window.addEventListener("scroll", hideMenu, { passive: true });
  window.addEventListener("resize", hideMenu);

  function clearHover() {
    if (dnd.hover) dnd.hover.classList.remove("drop-hover");
    dropTopEl.classList.remove("drop-hover");
    dnd.hover = null;
  }

  function startDrag(x, y) {
    clearTimeout(dnd.timer);
    hideMenu(); // moving means "drag": the quick actions are no longer available
    dnd.held = false;
    const item = byId(dnd.id);
    if (!item || !dnd.card.isConnected) { dnd.id = null; return; }
    dnd.active = true;
    const r = dnd.card.getBoundingClientRect();
    dnd.dx = x - r.left; dnd.dy = y - r.top;
    dnd.ghost = dnd.card.cloneNode(true);
    dnd.ghost.classList.add("drag-ghost");
    dnd.ghost.style.width = r.width + "px";
    document.body.appendChild(dnd.ghost);
    moveGhost(x, y);
    dnd.card.classList.add("dragging");
    document.body.classList.add("is-dragging");
    cardsEl.querySelectorAll(".card").forEach((c) => {
      const t = byId(c.dataset.id);
      if (t && t.id !== item.id && t.id !== item.parentId && t.tier < item.tier) c.classList.add("can-drop");
    });
    if (item.parentId && TOP_LEVEL_ALLOWED.includes(item.tier)) dropTopEl.hidden = false;
    dnd.py = y;
    autoScroll();
  }

  function moveGhost(x, y) {
    dnd.ghost.style.left = (x - dnd.dx) + "px";
    dnd.ghost.style.top = (y - dnd.dy) + "px";
  }

  function autoScroll() {
    if (!dnd.active) return;
    const edge = 70, h = window.innerHeight;
    if (dnd.py < edge) window.scrollBy(0, -12);
    else if (dnd.py > h - edge) window.scrollBy(0, 12);
    dnd.raf = requestAnimationFrame(autoScroll);
  }

  function updateHover(x, y) {
    const el = document.elementFromPoint(x, y);
    const card = el && el.closest(".card.can-drop");
    const top = !dropTopEl.hidden && el && el.closest("#drop-top");
    clearHover();
    if (card) { dnd.hover = card; card.classList.add("drop-hover"); }
    else if (top) dropTopEl.classList.add("drop-hover");
  }

  function endDrag(commit) {
    clearTimeout(dnd.timer);
    const wasActive = dnd.active;
    let result = null;
    if (wasActive) {
      const toTop = dropTopEl.classList.contains("drop-hover");
      const targetId = dnd.hover ? dnd.hover.dataset.id : null;
      if (commit && (targetId || toTop)) result = { id: dnd.id, parentId: targetId };
      cancelAnimationFrame(dnd.raf);
      dnd.ghost.remove();
      clearHover();
      cardsEl.querySelectorAll(".dragging, .can-drop").forEach((c) => c.classList.remove("dragging", "can-drop"));
      document.body.classList.remove("is-dragging");
      dropTopEl.hidden = true;
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 150);
    }
    dnd.active = false;
    dnd.held = false;
    dnd.id = null;
    dnd.ghost = null;
    if (result) {
      const item = byId(result.id);
      const res = moveItem(result.id, result.parentId);
      if (res.error) toast(res.error);
      else if (res.item) {
        const p = result.parentId ? byId(result.parentId) : null;
        toast('Moved "' + item.title + '" ' + (p ? 'into "' + p.title + '"' : "to the top level"));
      }
    }
  }

  cardsEl.addEventListener("pointerdown", (e) => {
    const card = e.target.closest(".card");
    if (!card || selectMode || (e.pointerType === "mouse" && e.button !== 0)) return; // no hold/drag while selecting
    dnd.card = card; dnd.id = card.dataset.id;
    dnd.x0 = e.clientX; dnd.y0 = e.clientY; dnd.type = e.pointerType;
    dnd.held = false;
    clearTimeout(dnd.timer);
    dnd.timer = setTimeout(holdMenu, HOLD_MS);
  });

  document.addEventListener("pointermove", (e) => {
    if (!dnd.id) return;
    if (!dnd.active) {
      if (Math.hypot(e.clientX - dnd.x0, e.clientY - dnd.y0) <= SLOP) return;
      if (dnd.held || dnd.type === "mouse") startDrag(e.clientX, e.clientY);
      else { clearTimeout(dnd.timer); dnd.id = null; } // finger moved before the hold finished: it's a scroll
      return;
    }
    dnd.py = e.clientY;
    moveGhost(e.clientX, e.clientY);
    updateHover(e.clientX, e.clientY);
  });
  document.addEventListener("pointerup", () => {
    if (!dnd.id) return;
    if (dnd.held) { // releasing after a hold leaves the menu open; don't let the click open the card
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 150);
    }
    endDrag(true);
  });
  document.addEventListener("pointercancel", () => { if (dnd.id) endDrag(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    hideMenu();
    if (dnd.active) endDrag(false);
    else if (selectMode && !document.querySelector("dialog[open]")) exitSelect();
  });
  // Stop the page scrolling under a finger that is holding or dragging a card.
  document.addEventListener("touchmove", (e) => { if (dnd.active || dnd.held) e.preventDefault(); }, { passive: false });
  cardsEl.addEventListener("contextmenu", (e) => e.preventDefault());
  // Swallow the click that follows a drop so it doesn't open the card.
  document.addEventListener("click", (e) => {
    if (suppressClick) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  // Swipe left/right on the home screen to change domain (ignores the sideways-scrolling chip row).
  let swipe = null;
  homeEl.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || e.target.closest(".chips, input")) { swipe = null; return; }
    swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  homeEl.addEventListener("touchend", (e) => {
    if (!swipe || dnd.active || suppressClick) { swipe = null; return; }
    const t = e.changedTouches[0];
    const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) switchDomain(dx < 0 ? 1 : -1);
  }, { passive: true });

  // Arrow keys switch domain on desktop (not while typing or in a dialog).
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawerEl.classList.contains("open")) { setDrawer(false); return; }
  });

  /* ---- Keyboard shortcuts: one registry drives both the key handling and the list shown in Settings ---- */
  const onHome = () => !homeEl.hidden;
  const onItem = () => !detailEl.hidden && !!byId(currentId());
  const SHORTCUTS = [
    { group: "Anywhere", key: "?", show: "?", label: "Open Settings (this list)", run: () => { location.hash = "#/f/settings"; } },
    { group: "Anywhere", key: "m", show: "M", label: "Open or close the menu", run: () => setDrawer(!drawerEl.classList.contains("open")) },
    { group: "Anywhere", key: "h", show: "H", label: "Go to the to-do list", run: () => { location.hash = "#/"; } },
    { group: "Anywhere", key: "t", show: "T", label: "Switch dark / light theme", run: toggleTheme },
    { group: "Anywhere", key: "Escape", show: "Esc", label: "Close a menu or dialog, or leave select mode", info: true },

    { group: "To-do list", key: "n", show: "N", label: "New item", when: onHome, run: () => openSheet("create", { parentId: null }) },
    { group: "To-do list", key: "/", show: "/", label: "Search", when: onHome, run: () => searchEl.focus() },
    { group: "To-do list", key: "ArrowLeft", show: "←", label: "Previous domain", when: onHome, run: () => switchDomain(-1) },
    { group: "To-do list", key: "ArrowRight", show: "→", label: "Next domain", when: onHome, run: () => switchDomain(1) },
    { group: "To-do list", key: "s", show: "S", label: "Start select mode", when: () => onHome() && !selectMode,
      run: () => { selectMode = true; selected.clear(); renderHome(); } },

    { group: "Selecting items", key: "a", show: "A", label: "Select all / none", when: () => onHome() && selectMode, run: toggleSelectAll },
    { group: "Selecting items", key: "c", show: "C", label: "Complete the selected items", when: () => onHome() && selectMode, run: completeSelected },
    { group: "Selecting items", key: "Delete", show: "Del", label: "Delete the selected items", when: () => onHome() && selectMode && selected.size > 0,
      run: () => confirmDeleteMany([...selected]) },
    { group: "Selecting items", key: "s", show: "S", label: "Leave select mode", when: () => onHome() && selectMode, run: exitSelect },

    { group: "Item screen", key: "n", show: "N", label: "Add inside this item", when: () => onItem() && legalTiersFor(currentId()).length > 0,
      run: () => openSheet("create", { parentId: currentId() }) },
    { group: "Item screen", key: "e", show: "E", label: "Edit this item", when: onItem, run: () => openSheet("edit", { id: currentId() }) },
    { group: "Item screen", key: "f", show: "F", label: "Start / stop the focus timer", when: onItem, run: () => toggleTimer(currentId()) },
    { group: "Item screen", key: "d", show: "D", label: "Mark this item done / not done", when: onItem, run: () => toggleDone(currentId()) },
    { group: "Item screen", key: "Delete", show: "Del", label: "Delete this item", when: onItem, run: () => confirmDelete(currentId()) },
    { group: "Item screen", key: "b", show: "B", label: "Back to the parent (or the list)", when: onItem, run: goBack },
  ];

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const a = document.activeElement;
    if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return; // typing
    if (document.querySelector("dialog[open]") || dnd.active) return;
    const drawerOpen = drawerEl.classList.contains("open");
    const k = e.key.toLowerCase();
    const hit = SHORTCUTS.find((s) => !s.info && s.key.toLowerCase() === k && (!s.when || s.when()) && (!drawerOpen || s.key === "m"));
    if (!hit) return;
    e.preventDefault();
    hit.run();
  });

  function shortcutsHtml() {
    const groups = [];
    SHORTCUTS.forEach((s) => {
      let g = groups.find((x) => x.name === s.group);
      if (!g) { g = { name: s.group, items: [] }; groups.push(g); }
      g.items.push(s);
    });
    return "<h2>Keyboard shortcuts</h2><p>For a computer keyboard. They are ignored while you are typing in a text box.</p>" +
      groups.map((g) => '<h3 class="kb-group">' + g.name + '</h3><ul class="kb-list">' +
        g.items.map((s) => "<li><kbd>" + escapeHtml(s.show) + "</kbd><span>" + escapeHtml(s.label) + "</span></li>").join("") +
        "</ul>").join("");
  }

  document.addEventListener("change", (e) => {
    if (e.target.dataset && e.target.dataset.ovFilter) { // Overview target filter selects
      const key = e.target.dataset.ovFilter;
      const v = e.target.value === "" ? null : Number(e.target.value);
      state.ovFilter = Object.assign({}, state.ovFilter, { [key]: v, none: false });
      render();
      return;
    }
    if (e.target.classList.contains("xp-input")) { // XP value edited in Settings
      const v = Number(e.target.value);
      const t = Number(e.target.dataset.tier);
      state.settings.xp[t] = Number.isFinite(v) && v >= 0 ? Math.min(99999, Math.round(v)) : DEFAULT_XP[t];
      saveSettings();
      render();
      return;
    }
    if (e.target.id !== "backup-file") return;
    const file = e.target.files[0];
    e.target.value = ""; // allow picking the same file again later
    if (file) importFile(file);
  });

  sheetForm.addEventListener("submit", submitSheet);
  sheetEl.addEventListener("close", () => { sheet = null; });

  $("#confirm").addEventListener("close", (e) => {
    if (e.target.returnValue === "delete") {
      if (pendingDeleteIds) { deleteMany(pendingDeleteIds); exitSelect(); }
      else if (pendingDeleteId) deleteItem(pendingDeleteId);
    }
    pendingDeleteId = null;
    pendingDeleteIds = null;
    e.target.returnValue = "";
  });

  /* ============ 8. ROUTER ============ */
  window.addEventListener("hashchange", render);

  /* ============ 9. INIT ============ */
  load();
  applyTheme();
  setInterval(updateClocks, 1000);
  searchEl.value = state.search;
  render();
})();