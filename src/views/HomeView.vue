<script setup>
import { ref, computed, watch } from "vue";
import { TIERS, DOMAINS } from "../constants";
import {
  store,
  visibleItems,
  switchDomain,
  exitSelect,
  toggleSelectAll,
  completeSelected,
  deleteSelected,
  openSheet,
  saveUI,
} from "../store/todoStore";
import { tierStyleString } from "../utils/helpers";
import CardItem from "../components/CardItem.vue";
import { dnd } from "../composables/useCardDrag";

const searchInputRef = ref(null);
const cardsElRef = ref(null);
const slideClass = ref("");

const currentDomainName = computed(() => {
  const d = DOMAINS.find((x) => x.id === store.domain);
  return d ? d.name : "Client";
});

const itemsInDomain = computed(() => {
  return store.items.filter((i) => i.domain === store.domain);
});

const allDomainDone = computed(() => {
  return itemsInDomain.value.length > 0 && itemsInDomain.value.every((i) => i.done);
});

const visibleList = computed(() => {
  return visibleItems();
});

const allFiltersSelected = computed(() => {
  return store.filters.length === 5;
});

const selectedCount = computed(() => {
  return store.selected.size;
});

const selectAllLabel = computed(() => {
  const total = visibleList.value.length;
  return selectedCount.value > 0 && selectedCount.value === total ? "None" : "All";
});

function onPrevDomain() {
  triggerDomainSwitch(-1);
}

function onNextDomain() {
  triggerDomainSwitch(1);
}

function triggerDomainSwitch(step) {
  slideClass.value = step > 0 ? "slide-next" : "slide-prev";
  switchDomain(step);
  setTimeout(() => {
    slideClass.value = "";
  }, 220);
}

function onSearchInput(e) {
  store.search = e.target.value;
  saveUI();
}

function onChipAll() {
  store.filters = store.filters.length === 5 ? [] : [1, 2, 3, 4, 5];
  saveUI();
}

function onChipTier(tier) {
  if (store.filters.length === 5) {
    store.filters = [tier];
  } else if (!store.filters.includes(tier)) {
    store.filters = store.filters.concat(tier).sort();
  } else {
    const rest = store.filters.filter((x) => x !== tier);
    store.filters = rest.length ? rest : [1, 2, 3, 4, 5];
  }
  saveUI();
}

function clearFilters() {
  store.filters = [1, 2, 3, 4, 5];
  store.search = "";
  saveUI();
}

function openAddTop() {
  openSheet("create", { parentId: null });
}

// Touch swipe to switch domain
let touchStartX = 0;
let touchStartY = 0;
let swipeValid = false;

function onTouchStart(e) {
  if (e.touches.length !== 1 || e.target.closest(".chips, input")) {
    swipeValid = false;
    return;
  }
  swipeValid = true;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}

function onTouchEnd(e) {
  if (!swipeValid || dnd.active) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  swipeValid = false;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    triggerDomainSwitch(dx < 0 ? 1 : -1);
  }
}
</script>

<template>
  <main
    id="home"
    class="screen home"
    aria-label="All items"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
  >
    <!-- Top Bar -->
    <header class="home-top">
      <div class="domain-bar">
        <button
          class="icon-btn menu-btn"
          aria-label="Open menu"
          :aria-expanded="store.drawerOpen"
          aria-controls="drawer"
          @click="store.drawerOpen = true"
        >
          ☰
        </button>
        <div class="domain-nav">
          <button
            class="icon-btn"
            aria-label="Previous domain"
            @click="onPrevDomain"
          >
            ‹
          </button>
          <div class="domain-center" aria-live="polite">
            <h1 id="domain-title">{{ currentDomainName }}</h1>
            <div id="domain-dots" class="dots" aria-hidden="true">
              <i
                v-for="dom in DOMAINS"
                :key="dom.id"
                :class="{ on: dom.id === store.domain }"
              ></i>
            </div>
          </div>
          <button
            class="icon-btn"
            aria-label="Next domain"
            @click="onNextDomain"
          >
            ›
          </button>
        </div>
        <span></span>
      </div>

      <!-- Search Input -->
      <input
        ref="searchInputRef"
        id="search"
        type="search"
        :value="store.search"
        placeholder="Search titles and notes…"
        aria-label="Search items"
        autocomplete="off"
        @input="onSearchInput"
      />

      <!-- Filter Chips -->
      <div id="chips" class="chips" role="group" aria-label="Filter by type">
        <button
          class="chip all"
          :aria-pressed="allFiltersSelected"
          @click="onChipAll"
        >
          All
        </button>
        <button
          v-for="t in TIERS"
          :key="t.tier"
          class="chip"
          :style="tierStyleString(t.tier)"
          :aria-pressed="store.filters.includes(t.tier)"
          @click="onChipTier(t.tier)"
        >
          {{ t.name }}
        </button>
      </div>
    </header>

    <!-- Cards Container -->
    <div
      ref="cardsElRef"
      id="cards"
      class="cards"
      :class="slideClass"
      tabindex="-1"
    >
      <!-- Empty state: no items in domain -->
      <div v-if="!itemsInDomain.length" class="empty">
        <p>Your adventure starts here.<br />Tap + to create your first item.</p>
      </div>

      <!-- Empty state: all items in domain done -->
      <div v-else-if="allDomainDone" class="empty">
        <p>All caught up!<br />Completed items are in History (☰ menu).</p>
      </div>

      <!-- Empty state: search / filter returned no matches -->
      <div v-else-if="!visibleList.length" class="empty">
        <p>Nothing matches.</p>
        <button class="btn ghost" @click="clearFilters">Clear filters?</button>
      </div>

      <!-- Cards List -->
      <template v-else>
        <CardItem
          v-for="item in visibleList"
          :key="item.id"
          :item="item"
        />
      </template>
    </div>

    <!-- Selection Bar -->
    <div
      v-if="store.selectMode"
      id="select-bar"
      class="select-bar"
      role="toolbar"
      aria-label="Selection actions"
    >
      <button class="sel-x" aria-label="Cancel selection" @click="exitSelect">✕</button>
      <span id="select-count" class="sel-count" aria-live="polite">
        {{ selectedCount }} selected
      </span>
      <button id="select-all" class="sel-btn" @click="toggleSelectAll">
        {{ selectAllLabel }}
      </button>
      <button
        class="sel-btn good"
        :disabled="selectedCount === 0"
        @click="completeSelected"
      >
        ✓ Complete
      </button>
      <button
        class="sel-btn bad"
        :disabled="selectedCount === 0"
        @click="deleteSelected"
      >
        🗑 Delete
      </button>
    </div>

    <!-- Drop to Top Level Zone -->
    <div
      v-if="dnd.active && dnd.canDropTop"
      id="drop-top"
      class="drop-top"
      :class="{ 'drop-hover': dnd.hoverTargetId === '__top__' }"
    >
      Drop here to move to the top level
    </div>

    <!-- FAB -->
    <button
      v-if="!store.selectMode"
      class="fab"
      aria-label="Create new item"
      @click="openAddTop"
    >
      +
    </button>
  </main>
</template>
