<script setup>
import { computed } from "vue";
import {
  store,
  byId,
  toggleDone,
  openSheet,
  confirmDeleteItem,
} from "../store/todoStore";

const item = computed(() => {
  if (!store.contextMenu.id) return null;
  return byId(store.contextMenu.id);
});

function closeMenu() {
  if (store.contextMenu.cardEl) {
    store.contextMenu.cardEl.classList.remove("ctx-open");
  }
  store.contextMenu.open = false;
  store.contextMenu.id = null;
  store.contextMenu.cardEl = null;
}

function onSelect() {
  if (!item.value) return;
  const id = item.value.id;
  closeMenu();
  store.selectMode = true;
  store.selected.clear();
  store.selected.add(id);
}

function onToggleDone() {
  if (!item.value) return;
  const id = item.value.id;
  closeMenu();
  toggleDone(id);
}

function onEdit() {
  if (!item.value) return;
  const id = item.value.id;
  closeMenu();
  openSheet("edit", { id });
}

function onDelete() {
  if (!item.value) return;
  const id = item.value.id;
  closeMenu();
  confirmDeleteItem(id);
}
</script>

<template>
  <div
    v-if="store.contextMenu.open && item"
    class="ctx-menu"
    role="menu"
    :style="{
      top: store.contextMenu.y + 'px',
      left: store.contextMenu.x + 'px',
      width: store.contextMenu.width + 'px',
    }"
    @click.stop
  >
    <button class="ctx-item" role="menuitem" @click="onSelect">
      <span class="ctx-icon" aria-hidden="true">☑</span>
      <span class="ctx-text">
        <b>Select</b>
        <small>Pick several items to complete or delete</small>
      </span>
    </button>

    <button class="ctx-item" role="menuitem" @click="onToggleDone">
      <span class="ctx-icon" aria-hidden="true">{{ item.done ? "↺" : "✓" }}</span>
      <span class="ctx-text">
        <b>{{ item.done ? "Mark as not done" : "Mark as done" }}</b>
        <small>{{ item.done ? "Put it back on your list" : "Tick it off your list" }}</small>
      </span>
    </button>

    <button class="ctx-item" role="menuitem" @click="onEdit">
      <span class="ctx-icon" aria-hidden="true">✎</span>
      <span class="ctx-text">
        <b>Edit</b>
        <small>Change title, type or notes</small>
      </span>
    </button>

    <button class="ctx-item danger" role="menuitem" @click="onDelete">
      <span class="ctx-icon" aria-hidden="true">🗑</span>
      <span class="ctx-text">
        <b>Delete</b>
        <small>Move it and what's inside to Trash</small>
      </span>
    </button>
  </div>
</template>
