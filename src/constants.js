/* Legendary To-Do — Constants */

export const TIERS = [
  { tier: 1, name: "Legend",     cssVar: "--legend",    color: "#F97316", ink: "#FFFFFF" },
  { tier: 2, name: "Quest",      cssVar: "--quest",     color: "#8B5CF6", ink: "#FFFFFF" },
  { tier: 3, name: "Side Quest", cssVar: "--sidequest", color: "#3B82F6", ink: "#FFFFFF" },
  { tier: 4, name: "Objective",  cssVar: "--objective", color: "#22C55E", ink: "#0B1F12" },
  { tier: 5, name: "Task",       cssVar: "--task",      color: "#FFFFFF", ink: "#1A1A1A" },
];

export const TOP_LEVEL_ALLOWED = [1, 2, 3, 4, 5];

export const ITEMS_KEY = "ltd:v1:items";
export const UI_KEY = "ltd:v1:ui";
export const TRASH_KEY = "ltd:v1:trash";
export const TIMER_KEY = "ltd:v1:timer";
export const SETTINGS_KEY = "ltd:v1:settings";

export const TRASH_DAYS = 30;
export const DEFAULT_XP = { 1: 100, 2: 50, 3: 25, 4: 10, 5: 5 };

export const DOMAINS = [
  { id: "client",   name: "Client" },
  { id: "work",     name: "Work" },
  { id: "personal", name: "Personal" },
];

export const isDomain = (d) => DOMAINS.some((x) => x.id === d);

export const FEATURES = [
  { id: "todo", name: "To-Do", icon: "✅", hash: "#/" },
  { id: "overview", name: "Overview", icon: "🌳", hash: "#/f/overview" },
  { id: "history", name: "History", icon: "🏆", hash: "#/f/history" },
  { id: "trash", name: "Trash", icon: "🗑", hash: "#/f/trash" },
  { id: "backup", name: "Backup", icon: "💾", hash: "#/f/backup" },
  { id: "settings", name: "Settings", icon: "⚙️", hash: "#/f/settings" },
];

export const TARGET_RE = /^\d{4}(-(0[1-9]|1[0-2]))?$/;
export const CRUMB_MAX = 14;
