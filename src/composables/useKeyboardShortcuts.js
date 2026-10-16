import { onMounted, onUnmounted } from "vue";
import {
  store,
  byId,
  toggleTheme,
  switchDomain,
  exitSelect,
  toggleSelectAll,
  completeSelected,
  deleteSelected,
  openSheet,
  toggleTimer,
  toggleDone,
  confirmDeleteItem,
  legalTiersFor,
} from "../store/todoStore";
import { route, navigateHome, navigateItem, navigateFeature } from "../router/index";
import { dnd } from "./useCardDrag";

export function useKeyboardShortcuts() {
  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const a = document.activeElement;
    if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;

    // Check if dialog or dnd active
    if (store.sheet.open || store.confirmModal.open || dnd.active) return;

    if (e.key === "Escape") {
      if (store.contextMenu.open) {
        if (store.contextMenu.cardEl) store.contextMenu.cardEl.classList.remove("ctx-open");
        store.contextMenu.open = false;
        return;
      }
      if (store.drawerOpen) {
        store.drawerOpen = false;
        return;
      }
      if (store.selectMode) {
        exitSelect();
        return;
      }
    }

    const isHome = route.value.name === "home";
    const isItem = route.value.name === "item" && !!byId(route.value.id);
    const itemId = route.value.id;
    const k = e.key.toLowerCase();

    // Global anywhere
    if (k === "?") {
      e.preventDefault();
      navigateFeature("settings");
      return;
    }
    if (k === "m") {
      e.preventDefault();
      store.drawerOpen = !store.drawerOpen;
      return;
    }
    if (k === "h") {
      e.preventDefault();
      navigateHome();
      return;
    }
    if (k === "t") {
      e.preventDefault();
      toggleTheme();
      return;
    }

    // Home screen shortcuts
    if (isHome) {
      if (store.selectMode) {
        if (k === "a") {
          e.preventDefault();
          toggleSelectAll();
          return;
        }
        if (k === "c") {
          e.preventDefault();
          completeSelected();
          return;
        }
        if (e.key === "Delete") {
          e.preventDefault();
          deleteSelected();
          return;
        }
        if (k === "s") {
          e.preventDefault();
          exitSelect();
          return;
        }
      } else {
        if (k === "n") {
          e.preventDefault();
          openSheet("create", { parentId: null });
          return;
        }
        if (k === "/") {
          e.preventDefault();
          const searchInput = document.getElementById("search");
          if (searchInput) searchInput.focus();
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          switchDomain(-1);
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          switchDomain(1);
          return;
        }
        if (k === "s") {
          e.preventDefault();
          store.selectMode = true;
          store.selected.clear();
          return;
        }
      }
    }

    // Item screen shortcuts
    if (isItem && itemId) {
      if (k === "n" && legalTiersFor(itemId).length > 0) {
        e.preventDefault();
        openSheet("create", { parentId: itemId });
        return;
      }
      if (k === "e") {
        e.preventDefault();
        openSheet("edit", { id: itemId });
        return;
      }
      if (k === "f") {
        e.preventDefault();
        toggleTimer(itemId);
        return;
      }
      if (k === "d") {
        e.preventDefault();
        toggleDone(itemId);
        return;
      }
      if (e.key === "Delete") {
        e.preventDefault();
        confirmDeleteItem(itemId);
        return;
      }
      if (k === "b") {
        e.preventDefault();
        const cur = byId(itemId);
        if (cur && cur.parentId) {
          navigateItem(cur.parentId);
        } else {
          navigateHome();
        }
        return;
      }
    }
  }

  onMounted(() => {
    window.addEventListener("keydown", onKeyDown);
  });

  onUnmounted(() => {
    window.removeEventListener("keydown", onKeyDown);
  });
}
