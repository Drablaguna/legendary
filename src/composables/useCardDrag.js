import { reactive } from "vue";
import {
  store,
  byId,
  moveItem,
  showToast,
} from "../store/todoStore";
import { TOP_LEVEL_ALLOWED } from "../constants";

const HOLD_MS = 350;
const SLOP = 8;

export const dnd = reactive({
  active: false,
  dragId: null,
  dragItem: null,
  held: false,
  canDropTop: false,
  hoverTargetId: null, // item id or '__top__'
  ghost: {
    visible: false,
    x: 0,
    y: 0,
    width: 0,
    dx: 0,
    dy: 0,
  },
});

let timer = null;
let startX = 0;
let startY = 0;
let pointerType = "";
let raf = null;
let currentPy = 0;
let suppressClick = false;
let currentCardEl = null;

function autoScroll() {
  if (!dnd.active) return;
  const edge = 70;
  const h = window.innerHeight;
  if (currentPy < edge) window.scrollBy(0, -12);
  else if (currentPy > h - edge) window.scrollBy(0, 12);
  raf = requestAnimationFrame(autoScroll);
}

function clearHover() {
  dnd.hoverTargetId = null;
}

function updateHover(x, y) {
  const el = document.elementFromPoint(x, y);
  const card = el && el.closest(".card.can-drop");
  const top = el && el.closest("#drop-top");
  if (card) {
    dnd.hoverTargetId = card.dataset.id;
  } else if (top && dnd.canDropTop) {
    dnd.hoverTargetId = "__top__";
  } else {
    dnd.hoverTargetId = null;
  }
}

export function isClickSuppressed() {
  return suppressClick;
}

export function startHoldTimer(item, cardEl, e) {
  if (store.selectMode) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;

  currentCardEl = cardEl;
  dnd.dragId = item.id;
  dnd.dragItem = item;
  startX = e.clientX;
  startY = e.clientY;
  pointerType = e.pointerType;
  dnd.held = false;

  clearTimeout(timer);
  timer = setTimeout(() => {
    // Hold triggered: open quick actions menu
    dnd.held = true;
    showContextMenu(item, cardEl);
  }, HOLD_MS);
}

function showContextMenu(item, cardEl) {
  if (navigator.vibrate) navigator.vibrate(15);
  cardEl.classList.add("ctx-open");
  const r = cardEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const menuWidth = Math.min(280, vw - 16);
  const menuHeight = 210; // approximate

  const below = vh - r.bottom;
  const above = r.top;
  let top = (below >= menuHeight + 12 || below >= above) ? r.bottom + 6 : r.top - menuHeight - 6;
  top = Math.max(8, Math.min(top, vh - menuHeight - 8));
  const left = Math.max(8, Math.min(r.left + 8, vw - menuWidth - 8));

  store.contextMenu.id = item.id;
  store.contextMenu.x = left;
  store.contextMenu.y = top;
  store.contextMenu.width = menuWidth;
  store.contextMenu.cardEl = cardEl;
  store.contextMenu.open = true;
}

export function onPointerMove(e) {
  if (!dnd.dragId) return;

  if (!dnd.active) {
    if (Math.hypot(e.clientX - startX, e.clientY - startY) <= SLOP) return;
    if (dnd.held || pointerType === "mouse") {
      // Begin drag
      clearTimeout(timer);
      if (store.contextMenu.open) {
        if (store.contextMenu.cardEl) store.contextMenu.cardEl.classList.remove("ctx-open");
        store.contextMenu.open = false;
      }
      dnd.held = false;
      dnd.active = true;

      const r = currentCardEl.getBoundingClientRect();
      dnd.ghost.width = r.width;
      dnd.ghost.dx = e.clientX - r.left;
      dnd.ghost.dy = e.clientY - r.top;
      dnd.ghost.x = e.clientX - dnd.ghost.dx;
      dnd.ghost.y = e.clientY - dnd.ghost.dy;
      dnd.ghost.visible = true;

      dnd.canDropTop = !!dnd.dragItem.parentId && TOP_LEVEL_ALLOWED.includes(dnd.dragItem.tier);
      document.body.classList.add("is-dragging");

      currentPy = e.clientY;
      autoScroll();
    } else {
      // Finger moved before hold: user is scrolling
      clearTimeout(timer);
      dnd.dragId = null;
      dnd.dragItem = null;
    }
    return;
  }

  currentPy = e.clientY;
  dnd.ghost.x = e.clientX - dnd.ghost.dx;
  dnd.ghost.y = e.clientY - dnd.ghost.dy;
  updateHover(e.clientX, e.clientY);
}

export function onPointerUp() {
  if (!dnd.dragId) return;

  clearTimeout(timer);

  if (dnd.held) {
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 150);
  }

  if (dnd.active) {
    cancelAnimationFrame(raf);
    document.body.classList.remove("is-dragging");

    const targetId = dnd.hoverTargetId === "__top__" ? null : dnd.hoverTargetId;
    const dragId = dnd.dragId;
    const dragItem = dnd.dragItem;

    dnd.active = false;
    dnd.held = false;
    dnd.dragId = null;
    dnd.dragItem = null;
    dnd.ghost.visible = false;
    clearHover();

    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 150);

    if (targetId !== undefined && (targetId !== null || dnd.hoverTargetId === "__top__")) {
      const res = moveItem(dragId, targetId);
      if (res.error) {
        showToast(res.error);
      } else if (res.item) {
        const p = targetId ? byId(targetId) : null;
        showToast(`Moved "${dragItem.title}" ${p ? `into "${p.title}"` : "to the top level"}`);
      }
    }
  } else {
    dnd.held = false;
    dnd.dragId = null;
    dnd.dragItem = null;
  }
}

export function onPointerCancel() {
  clearTimeout(timer);
  if (dnd.active) {
    cancelAnimationFrame(raf);
    document.body.classList.remove("is-dragging");
    dnd.active = false;
    dnd.held = false;
    dnd.dragId = null;
    dnd.dragItem = null;
    dnd.ghost.visible = false;
    clearHover();
  }
}
