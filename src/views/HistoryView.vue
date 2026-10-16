<script setup>
import { computed } from "vue";
import { DOMAINS } from "../constants";
import {
  store,
  getChildren,
  getAncestors,
  restoreHistory,
} from "../store/todoStore";
import {
  tierOf,
  tierStyleString,
  shortTitle,
} from "../utils/helpers";
import { navigateItem } from "../router/index";

const rootCompletedItems = computed(() => {
  const doneIds = new Set(store.items.filter((i) => i.done).map((i) => i.id));
  return store.items
    .filter((i) => i.done && !getAncestors(i.id).some((a) => doneIds.has(a.id)))
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        (b.completedAt || b.updatedAt) - (a.completedAt || a.updatedAt)
    );
});

function toggleFold(id) {
  if (store.historyOpen.has(id)) {
    store.historyOpen.delete(id);
  } else {
    store.historyOpen.add(id);
  }
}

function onRestore(id) {
  restoreHistory(id);
}

function getCrumbs(id) {
  const ancs = getAncestors(id);
  return ancs.length ? ancs.map((a) => shortTitle(a.title)).join(" › ") : "";
}

function getDomainName(domainId) {
  const d = DOMAINS.find((x) => x.id === domainId);
  return d ? d.name : "";
}

function formatCompletedDate(ms) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getSortedKids(id) {
  return getChildren(id).sort(
    (a, b) => a.tier - b.tier || a.createdAt - b.createdAt
  );
}
</script>

<template>
  <div class="history-view">
    <div v-if="!rootCompletedItems.length" class="empty">
      <p>Nothing completed yet.<br />Finished Legends will show up here.</p>
    </div>

    <ul v-else class="h-list">
      <li
        v-for="item in rootCompletedItems"
        :key="item.id"
        class="h-node"
        :class="{ open: store.historyOpen.has(item.id) }"
      >
        <div class="h-row" :style="tierStyleString(item.tier)">
          <span class="edge"></span>

          <button class="h-open" @click="navigateItem(item.id)">
            <span class="h-title" :class="{ struck: item.done }">
              {{ item.title }}
            </span>
            <span class="h-meta">
              <template v-if="getCrumbs(item.id)">{{ getCrumbs(item.id) }} · </template>
              <template v-if="getDomainName(item.domain)">{{ getDomainName(item.domain) }} · </template>
              {{ formatCompletedDate(item.completedAt || item.updatedAt) }}
            </span>
          </button>

          <button
            class="h-restore"
            aria-label="Restore to the to-do list"
            @click="onRestore(item.id)"
          >
            ↺ Restore
          </button>

          <button
            v-if="getSortedKids(item.id).length"
            class="h-chev"
            :aria-expanded="store.historyOpen.has(item.id)"
            :aria-label="'Show what is inside ' + item.title"
            @click="toggleFold(item.id)"
          >
            <span class="chev-ico">›</span>
          </button>
        </div>

        <!-- Nested children in history -->
        <ul
          v-if="store.historyOpen.has(item.id) && getSortedKids(item.id).length"
          class="h-list h-sub"
        >
          <li
            v-for="kid in getSortedKids(item.id)"
            :key="kid.id"
            class="h-node"
          >
            <div class="h-row" :style="tierStyleString(kid.tier)">
              <span class="edge"></span>
              <button class="h-open" @click="navigateItem(kid.id)">
                <span class="h-title" :class="{ struck: kid.done }">
                  {{ kid.title }}
                </span>
                <span class="h-meta">
                  {{ tierOf(kid.tier).name }}{{ kid.done ? "" : " · not done" }}
                </span>
              </button>
            </div>
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>
