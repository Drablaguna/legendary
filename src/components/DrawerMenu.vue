<script setup>
import { FEATURES } from "../constants";
import { store } from "../store/todoStore";
import { route, navigateFeature } from "../router/index";

function closeDrawer() {
  store.drawerOpen = false;
}

function onNav(featId) {
  closeDrawer();
  navigateFeature(featId);
}

const isCurrent = (featId) => {
  if (route.value.name === "home" || route.value.name === "item") {
    return featId === "todo";
  }
  return route.value.name === "feature" && route.value.id === featId;
};
</script>

<template>
  <div>
    <!-- Backdrop -->
    <div
      v-if="store.drawerOpen"
      class="drawer-backdrop"
      @click="closeDrawer"
    ></div>

    <!-- Aside Drawer -->
    <aside
      class="drawer"
      :class="{ open: store.drawerOpen }"
      :aria-hidden="!store.drawerOpen"
      :inert="!store.drawerOpen"
      aria-label="Main menu"
    >
      <div class="drawer-head">
        <span class="drawer-brand">Legendary</span>
        <button class="icon-btn" @click="closeDrawer" aria-label="Close menu">✕</button>
      </div>
      <nav class="drawer-nav">
        <button
          v-for="feat in FEATURES"
          :key="feat.id"
          class="nav-item"
          :aria-current="isCurrent(feat.id) ? 'page' : undefined"
          @click="onNav(feat.id)"
        >
          <span class="nav-icon" aria-hidden="true">{{ feat.icon }}</span>
          <span>{{ feat.name }}</span>
        </button>
      </nav>
    </aside>
  </div>
</template>
