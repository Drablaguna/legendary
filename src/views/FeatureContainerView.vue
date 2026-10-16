<script setup>
import { computed } from "vue";
import { FEATURES } from "../constants";
import { store } from "../store/todoStore";
import { route } from "../router/index";
import OverviewView from "./OverviewView.vue";
import HistoryView from "./HistoryView.vue";
import TrashView from "./TrashView.vue";
import BackupView from "./BackupView.vue";
import SettingsView from "./SettingsView.vue";

const currentFeature = computed(() => {
  const featId = route.value.id;
  return FEATURES.find((f) => f.id === featId) || { id: featId, name: featId };
});
</script>

<template>
  <section id="feature" class="screen feature" :aria-label="currentFeature.name">
    <div class="feature-bar">
      <button
        class="icon-btn menu-btn"
        aria-label="Open menu"
        :aria-expanded="store.drawerOpen"
        aria-controls="drawer"
        @click="store.drawerOpen = true"
      >
        ☰
      </button>
      <h1 id="feature-title">{{ currentFeature.name }}</h1>
    </div>

    <div id="feature-body" class="feature-body">
      <OverviewView v-if="currentFeature.id === 'overview'" />
      <HistoryView v-else-if="currentFeature.id === 'history'" />
      <TrashView v-else-if="currentFeature.id === 'trash'" />
      <BackupView v-else-if="currentFeature.id === 'backup'" />
      <SettingsView v-else-if="currentFeature.id === 'settings'" />
      <div v-else class="empty">
        <p>{{ currentFeature.name }} is coming soon.</p>
      </div>
    </div>
  </section>
</template>
