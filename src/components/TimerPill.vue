<script setup>
import { computed } from "vue";
import { store, byId, timerElapsed } from "../store/todoStore";
import { fmtClock } from "../utils/helpers";
import { route, navigateItem } from "../router/index";

const timerItem = computed(() => {
  if (!store.timer) return null;
  return byId(store.timer.id);
});

const isVisible = computed(() => {
  if (!store.timer || !timerItem.value) return false;
  if (store.selectMode) return false;
  // If we are currently looking at the running item, hide the floating pill
  if (route.value.name === "item" && route.value.id === store.timer.id) return false;
  return true;
});

const formattedTime = computed(() => {
  // depends on store.now which updates every second
  return fmtClock(timerElapsed());
});

function openTimerItem() {
  if (store.timer) {
    navigateItem(store.timer.id);
  }
}
</script>

<template>
  <button
    v-if="isVisible"
    class="timer-pill"
    @click="openTimerItem"
    aria-label="Open the item with the running focus timer"
  >
    <span class="tp-dot" aria-hidden="true"></span>
    <span class="tp-title">{{ timerItem?.title }}</span>
    <span class="tp-clock">{{ formattedTime }}</span>
  </button>
</template>
