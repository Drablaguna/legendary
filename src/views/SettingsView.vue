<script setup>
import { computed } from "vue";
import { TIERS, DEFAULT_XP } from "../constants";
import {
  store,
  totalXp,
  setTheme,
  saveSettings,
} from "../store/todoStore";
import {
  tierStyleString,
  levelInfo,
} from "../utils/helpers";
import { useSyncEngine } from "../composables/useSyncEngine";

const { syncState, syncNow } = useSyncEngine();

function formatSyncTime(ts) {
  if (!ts) return "Never";
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 10) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

const total = computed(() => totalXp());
const lv = computed(() => levelInfo(total.value));

const currentTheme = computed(() => store.settings.theme);

const xpPercent = computed(() => {
  if (!lv.value.span) return 0;
  return Math.round((lv.value.into / lv.value.span) * 100);
});

function onThemeClick(theme) {
  setTheme(theme);
}

function onXpChange(tier, e) {
  const val = Number(e.target.value);
  store.settings.xp[tier] =
    Number.isFinite(val) && val >= 0 ? Math.min(99999, Math.round(val)) : DEFAULT_XP[tier];
  saveSettings();
}

function resetXp() {
  store.settings.xp = Object.assign({}, DEFAULT_XP);
  saveSettings();
}

const shortcutGroups = [
  {
    name: "Anywhere",
    items: [
      { show: "?", label: "Open Settings (this list)" },
      { show: "M", label: "Open or close the menu" },
      { show: "H", label: "Go to the to-do list" },
      { show: "T", label: "Switch dark / light theme" },
      { show: "Esc", label: "Close a menu or dialog, or leave select mode" },
    ],
  },
  {
    name: "To-do list",
    items: [
      { show: "N", label: "New item" },
      { show: "/", label: "Search" },
      { show: "←", label: "Previous domain" },
      { show: "→", label: "Next domain" },
      { show: "S", label: "Start select mode" },
    ],
  },
  {
    name: "Selecting items",
    items: [
      { show: "A", label: "Select all / none" },
      { show: "C", label: "Complete the selected items" },
      { show: "Del", label: "Delete the selected items" },
      { show: "S", label: "Leave select mode" },
    ],
  },
  {
    name: "Item screen",
    items: [
      { show: "N", label: "Add inside this item" },
      { show: "E", label: "Edit this item" },
      { show: "F", label: "Start / stop the focus timer" },
      { show: "D", label: "Mark this item done / not done" },
      { show: "Del", label: "Delete this item" },
      { show: "B", label: "Back to the parent (or the list)" },
    ],
  },
];
</script>

<template>
  <div class="settings">
    <!-- XP Level Card -->
    <div class="xp-card">
      <div class="xp-level">Level {{ lv.level }}</div>
      <div class="xp-total">{{ total }} XP</div>
      <span class="bar" style="--c:#FACC15" aria-hidden="true">
        <i :style="{ width: xpPercent + '%' }"></i>
      </span>
      <small>{{ lv.span - lv.into }} XP to level {{ lv.level + 1 }}</small>
    </div>

    <!-- Appearance -->
    <h2>Appearance</h2>
    <div class="seg" role="group" aria-label="Theme">
      <button
        :aria-pressed="currentTheme === 'dark'"
        @click="onThemeClick('dark')"
      >
        🌙 Dark
      </button>
      <button
        :aria-pressed="currentTheme === 'light'"
        @click="onThemeClick('light')"
      >
        ☀️ Light
      </button>
    </div>

    <!-- Cloud Sync & Storage -->
    <h2>Cloud Sync & Storage</h2>
    <div class="sync-card">
      <div class="sync-card-header">
        <span class="sync-card-title">Neon Postgres Cloud Sync</span>
        <span class="sync-status-badge" :class="['status-' + syncState.status]">
          <i class="status-dot"></i>
          {{
            syncState.status === 'synced'
              ? 'Synced'
              : syncState.status === 'syncing'
              ? 'Syncing...'
              : syncState.status === 'offline'
              ? 'Offline'
              : 'Error'
          }}
        </span>
      </div>

      <div class="sync-card-body">
        <div class="sync-meta-row">
          <span class="sync-meta-label">Pending Local Changes</span>
          <span class="sync-meta-val">{{ syncState.pendingCount }} item(s)</span>
        </div>
        <div class="sync-meta-row">
          <span class="sync-meta-label">Last Synced</span>
          <span class="sync-meta-val">{{ formatSyncTime(syncState.lastSyncedAt) }}</span>
        </div>
        <div class="sync-meta-row">
          <span class="sync-meta-label">Storage Backend</span>
          <span class="sync-meta-val">Neon Serverless (Cloudflare Pages)</span>
        </div>
      </div>

      <div v-if="syncState.errorMessage" class="sync-error-banner">
        ⚠️ {{ syncState.errorMessage }}
      </div>

      <div class="sync-actions">
        <button
          class="bk-btn primary"
          :disabled="syncState.status === 'syncing'"
          @click="syncNow"
        >
          <span v-if="syncState.status === 'syncing'" class="spin-inline">↻</span>
          {{ syncState.status === 'syncing' ? 'Syncing...' : 'Sync Now' }}
        </button>
      </div>
    </div>

    <!-- XP Configuration -->
    <h2>XP per completion</h2>
    <p>
      XP earned when an item is completed. Your total is counted from the items you have
      completed, so changing a value updates it.
    </p>

    <label
      v-for="t in TIERS"
      :key="t.tier"
      class="xp-row"
      :style="tierStyleString(t.tier)"
    >
      <span class="h-dot"></span>
      <span class="xp-name">{{ t.name }}</span>
      <input
        class="xp-input"
        type="number"
        min="0"
        max="99999"
        step="1"
        inputmode="numeric"
        :value="store.settings.xp[t.tier]"
        :aria-label="'XP for ' + t.name"
        @change="onXpChange(t.tier, $event)"
      />
      <span>XP</span>
    </label>

    <button class="bk-btn warn" @click="resetXp">Reset XP to defaults</button>

    <!-- Keyboard Shortcuts -->
    <h2>Keyboard shortcuts</h2>
    <p>For a computer keyboard. They are ignored while you are typing in a text box.</p>

    <template v-for="g in shortcutGroups" :key="g.name">
      <h3 class="kb-group">{{ g.name }}</h3>
      <ul class="kb-list">
        <li v-for="s in g.items" :key="s.show">
          <kbd>{{ s.show }}</kbd>
          <span>{{ s.label }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>
