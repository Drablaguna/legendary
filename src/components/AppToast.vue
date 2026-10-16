<script setup>
import { store } from "../store/todoStore";
</script>

<template>
  <div
    v-if="store.toast.visible"
    class="toast"
    role="status"
    aria-live="polite"
  >
    {{ store.toast.message }}
  </div>
</template>
