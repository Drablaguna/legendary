<script setup>
import { computed } from "vue";
import { DOMAINS, TRASH_DAYS } from "../constants";
import {
  store,
  restoreEntries,
  emptyTrash,
  purgeTrash,
} from "../store/todoStore";
import {
  tierOf,
  tierStyleString,
} from "../utils/helpers";

const trashList = computed(() => {
  return store.trash;
});

function onEmptyTrash() {
  if (
    !store.trash.length ||
    !window.confirm(
      `Permanently delete everything in Trash (${store.trash.length} entr${
        store.trash.length === 1 ? "y" : "ies"
      })? This can't be undone.`
    )
  ) {
    return;
  }
  emptyTrash();
}

function onRestore(entryId) {
  restoreEntries([entryId]);
}

function onPurge(entry) {
  const root = entry.items.find((i) => i.id === entry.rootId);
  const nested = entry.items.length - 1;
  const msg = `Permanently delete "${root?.title || "item"}"${
    nested > 0 ? ` and ${nested} nested item(s)` : ""
  }? This can't be undone.`;
  if (window.confirm(msg)) {
    purgeTrash(entry.id);
  }
}

function daysLeft(deletedAt) {
  return Math.max(1, Math.ceil(TRASH_DAYS - (Date.now() - deletedAt) / 86400000));
}

function formatDeletedDate(ms) {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getRootItem(entry) {
  return entry.items.find((i) => i.id === entry.rootId) || entry.items[0];
}

function getDomainName(domainId) {
  const d = DOMAINS.find((x) => x.id === domainId);
  return d ? d.name : "";
}
</script>

<template>
  <div class="trash-view">
    <div v-if="!trashList.length" class="empty">
      <p>Trash is empty.<br />Deleted items stay here for {{ TRASH_DAYS }} days.</p>
    </div>

    <template v-else>
      <div class="trash-head">
        <p>Items here are removed for good after {{ TRASH_DAYS }} days.</p>
        <button class="bk-btn warn" @click="onEmptyTrash">Empty Trash</button>
      </div>

      <ul class="h-list">
        <li
          v-for="entry in trashList"
          :key="entry.id"
          class="h-row"
          :style="tierStyleString(getRootItem(entry).tier)"
        >
          <span class="edge"></span>
          <div class="h-open">
            <span class="h-title">{{ getRootItem(entry).title }}</span>
            <span class="h-meta">
              {{ tierOf(getRootItem(entry).tier).name }}
              <template v-if="entry.items.length > 1">
                + {{ entry.items.length - 1 }} inside
              </template>
              <template v-if="getDomainName(getRootItem(entry).domain)">
                · {{ getDomainName(getRootItem(entry).domain) }}
              </template>
              · deleted {{ formatDeletedDate(entry.deletedAt) }} ·
              {{ daysLeft(entry.deletedAt) }} day{{ daysLeft(entry.deletedAt) === 1 ? "" : "s" }} left
            </span>
          </div>

          <button
            class="h-restore"
            aria-label="Restore item"
            @click="onRestore(entry.id)"
          >
            ↺ Restore
          </button>
          <button
            class="h-restore danger"
            aria-label="Delete forever"
            @click="onPurge(entry)"
          >
            ✕ Forever
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>
