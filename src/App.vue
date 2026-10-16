<script setup>
import { onMounted, onUnmounted, watch } from "vue";
import { store, loadStore, applyTheme } from "./store/todoStore";
import { route } from "./router/index";
import { useKeyboardShortcuts } from "./composables/useKeyboardShortcuts";
import {
  onPointerMove,
  onPointerUp,
  onPointerCancel,
} from "./composables/useCardDrag";

import DrawerMenu from "./components/DrawerMenu.vue";
import TimerPill from "./components/TimerPill.vue";
import AppToast from "./components/AppToast.vue";
import UndoToast from "./components/UndoToast.vue";
import ItemSheetModal from "./components/ItemSheetModal.vue";
import ConfirmModal from "./components/ConfirmModal.vue";
import ContextMenu from "./components/ContextMenu.vue";
import DragGhost from "./components/DragGhost.vue";

import HomeView from "./views/HomeView.vue";
import DetailView from "./views/DetailView.vue";
import FeatureContainerView from "./views/FeatureContainerView.vue";

// Setup keyboard shortcuts
useKeyboardShortcuts();

// Synchronize body selecting class with selectMode
watch(
  () => store.selectMode,
  (isSelecting) => {
    document.body.classList.toggle("selecting", isSelecting);
  }
);

// Global pointer listeners for drag and drop
function handlePointerDown(e) {
  // If context menu is open and clicked outside, close it
  if (store.contextMenu.open && !e.target.closest(".ctx-menu")) {
    if (store.contextMenu.cardEl) store.contextMenu.cardEl.classList.remove("ctx-open");
    store.contextMenu.open = false;
  }
}

onMounted(() => {
  loadStore();
  window.addEventListener("pointerdown", handlePointerDown, true);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);
});

onUnmounted(() => {
  window.removeEventListener("pointerdown", handlePointerDown, true);
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerCancel);
});
</script>

<template>
  <div>
    <!-- Route Views -->
    <HomeView v-if="route.name === 'home'" />
    <DetailView v-else-if="route.name === 'item'" />
    <FeatureContainerView v-else-if="route.name === 'feature'" />

    <!-- Navigation Drawer -->
    <DrawerMenu />

    <!-- Running Focus Timer Pill -->
    <TimerPill />

    <!-- Modals -->
    <ItemSheetModal />
    <ConfirmModal />
    <ContextMenu />

    <!-- Drag Ghost -->
    <DragGhost />

    <!-- Toasts -->
    <UndoToast />
    <AppToast />
  </div>
</template>
