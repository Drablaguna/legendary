<script setup>
import { store, triggerUndo, hideUndo } from "../store/todoStore";
</script>

<template>
  <div
    v-if="store.undo.visible"
    class="undo-toast"
    role="status"
    aria-live="polite"
  >
    <span class="undo-msg">{{ store.undo.message }}</span>
    <button class="undo-btn" @click="triggerUndo">Undo</button>
    <button class="undo-x" @click="hideUndo" aria-label="Dismiss">✕</button>
  </div>
</template>
