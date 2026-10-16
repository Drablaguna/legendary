/* Legendary To-Do — Utility and formatting helpers */
import { TIERS, TARGET_RE, CRUMB_MAX } from "../constants";

export const pad2 = (n) => String(n).padStart(2, "0");

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function isValidItem(i) {
  return i && typeof i.id === "string" && typeof i.title === "string" && i.tier >= 1 && i.tier <= 5;
}

export function tierOf(tierNum) {
  return TIERS[tierNum - 1] || TIERS[0];
}

export function tierStyle(tierNum) {
  const t = tierOf(tierNum);
  return {
    "--c": t.color,
    "--ci": t.ink,
  };
}

export function tierStyleString(tierNum) {
  const t = tierOf(tierNum);
  return `--c:${t.color};--ci:${t.ink};`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export function shortTitle(title, max = CRUMB_MAX) {
  if (!title) return "";
  const chars = Array.from(title);
  return chars.length > max ? chars.slice(0, max - 1).join("").trimEnd() + "…" : title;
}

export function fmtDue(ms) {
  if (typeof ms !== "number" || !isFinite(ms)) return "";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function targetLabel(target, short = false) {
  if (!target || typeof target !== "string") return "";
  if (target.length === 7) {
    return new Date(+target.slice(0, 4), +target.slice(5) - 1, 1).toLocaleDateString(undefined, {
      month: short ? "short" : "long",
      year: "numeric",
    });
  }
  return target;
}

export function targetEnd(target) {
  if (!target || typeof target !== "string") return 0;
  return target.length === 7
    ? new Date(+target.slice(0, 4), +target.slice(5), 1).getTime()
    : new Date(+target + 1, 0, 1).getTime();
}

export function hasDue(item) {
  return item && typeof item.dueAt === "number" && isFinite(item.dueAt);
}

export function hasTarget(item) {
  return item && !hasDue(item) && typeof item.target === "string" && TARGET_RE.test(item.target);
}

export function hasDeadline(item) {
  return hasDue(item) || hasTarget(item);
}

export function deadlineEnd(item) {
  if (!item) return null;
  if (hasDue(item)) return item.dueAt;
  if (hasTarget(item)) return targetEnd(item.target);
  return null;
}

export function periodOf(item) {
  if (!item) return null;
  if (hasDue(item)) {
    const d = new Date(item.dueAt);
    return { y: d.getFullYear(), m: d.getMonth() };
  }
  if (hasTarget(item)) {
    return {
      y: +item.target.slice(0, 4),
      m: item.target.length === 7 ? +item.target.slice(5) - 1 : null,
    };
  }
  return null;
}

export function isOverdue(item) {
  if (!item || item.done || !hasDeadline(item)) return false;
  const end = deadlineEnd(item);
  return end !== null && end <= Date.now() && (hasDue(item) ? item.dueAt < Date.now() : true);
}

export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  return pad2(Math.floor(sec / 3600)) + ":" + pad2(Math.floor((sec % 3600) / 60)) + ":" + pad2(sec % 60);
}

export function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}h ${pad2(m)}m` : m ? `${m}m ${pad2(s)}s` : `${s}s`;
}

export function toLocalInput(ms) {
  if (!ms || !isFinite(ms)) return "";
  const d = new Date(ms);
  return (
    d.getFullYear() +
    "-" +
    pad2(d.getMonth() + 1) +
    "-" +
    pad2(d.getDate()) +
    "T" +
    pad2(d.getHours()) +
    ":" +
    pad2(d.getMinutes())
  );
}

export function fromLocalInput(s) {
  const t = s ? new Date(s).getTime() : NaN;
  return isFinite(t) ? t : null;
}

export function dayKey(d) {
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

export function xpForLevel(lv) {
  return 50 * lv * (lv - 1);
}

export function levelInfo(total) {
  let level = 1;
  while (xpForLevel(level + 1) <= total) level++;
  const lo = xpForLevel(level);
  return { level, into: total - lo, span: xpForLevel(level + 1) - lo };
}
