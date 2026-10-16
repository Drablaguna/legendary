<script setup>
import { computed, watchEffect } from "vue";
import {
  store,
  byId,
  getChildren,
  getAncestors,
  getProgress,
  legalTiersFor,
  toggleDone,
  toggleTimer,
  timerElapsed,
  openSheet,
  confirmDeleteItem,
} from "../store/todoStore";
import {
  tierOf,
  shortTitle,
  hasDue,
  hasTarget,
  hasDeadline,
  fmtDue,
  targetLabel,
  isOverdue,
  fmtClock,
  fmtDuration,
} from "../utils/helpers";
import { route, navigateHome, navigateItem } from "../router/index";
import DetailTreeNode from "../components/DetailTreeNode.vue";

const item = computed(() => {
  if (route.value.name !== "item" || !route.value.id) return null;
  return byId(route.value.id);
});

// Update meta theme color dynamically when viewing an item
watchEffect(() => {
  if (item.value) {
    const t = tierOf(item.value.tier);
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute("content", t.color);
    }
  }
});

const tier = computed(() => (item.value ? tierOf(item.value.tier) : null));

const ancestors = computed(() => {
  return item.value ? getAncestors(item.value.id) : [];
});

const progress = computed(() => {
  return item.value ? getProgress(item.value.id) : { done: 0, total: 0 };
});

const progressPercent = computed(() => {
  if (!progress.value.total) return 0;
  return Math.round((progress.value.done / progress.value.total) * 100);
});

const kids = computed(() => {
  if (!item.value) return [];
  return getChildren(item.value.id).sort((a, b) => a.createdAt - b.createdAt);
});

const canAddInside = computed(() => {
  return item.value ? legalTiersFor(item.value.id).length > 0 : false;
});

const isTimerRunning = computed(() => {
  return !!store.timer && store.timer.id === item.value?.id;
});

const totalTimeSeconds = computed(() => {
  if (!item.value) return 0;
  return (item.value.timeSpent || 0) + (isTimerRunning.value ? timerElapsed() : 0);
});

const sessionCount = computed(() => {
  return (item.value?.sessions || []).length;
});

const sessionsList = computed(() => {
  if (!item.value || !item.value.sessions) return [];
  return item.value.sessions.slice().reverse();
});

const isSessionsOpen = computed(() => {
  return item.value ? store.sessionsOpen.has(item.value.id) : false;
});

function toggleSessionsFold() {
  if (!item.value) return;
  if (store.sessionsOpen.has(item.value.id)) {
    store.sessionsOpen.delete(item.value.id);
  } else {
    store.sessionsOpen.add(item.value.id);
  }
}

function onBack() {
  if (item.value && item.value.parentId) {
    navigateItem(item.value.parentId);
  } else {
    navigateHome();
  }
}

function onHome() {
  navigateHome();
}

function onEdit() {
  if (item.value) {
    openSheet("edit", { id: item.value.id });
  }
}

function onDelete() {
  if (item.value) {
    confirmDeleteItem(item.value.id);
  }
}

function onToggleDone() {
  if (item.value) {
    toggleDone(item.value.id);
  }
}

function onSetDeadline() {
  if (item.value) {
    openSheet("edit", { id: item.value.id, focusDeadline: true });
  }
}

function onToggleTimer() {
  if (item.value) {
    toggleTimer(item.value.id);
  }
}

function onAddInside() {
  if (item.value) {
    openSheet("create", { parentId: item.value.id });
  }
}

function onCrumbClick(ancestorId) {
  navigateItem(ancestorId);
}

function formatSessionDate(ms) {
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
</script>

<template>
  <section
    v-if="item && tier"
    id="detail"
    class="screen detail"
    aria-label="Item detail"
    :style="{
      '--item-color': tier.color,
      '--item-ink': tier.ink,
    }"
    :data-tier="item.tier"
  >
    <div class="detail-inner">
      <!-- Detail Action Bar -->
      <div class="detail-bar">
        <button class="icon-btn" aria-label="Back" @click="onBack">
          ←<span class="lbl">Back</span>
        </button>
        <span class="spacer"></span>
        <button class="icon-btn" aria-label="Home" @click="onHome">⌂</button>
        <button class="icon-btn" aria-label="Edit item" @click="onEdit">✎</button>
        <button class="icon-btn" aria-label="Delete item" @click="onDelete">🗑</button>
      </div>

      <div id="detail-body">
        <!-- Breadcrumbs Navigation -->
        <nav
          v-if="ancestors.length"
          class="breadcrumbs"
          aria-label="Breadcrumb"
        >
          <template v-for="(anc, idx) in ancestors" :key="anc.id">
            <button
              class="crumb-link"
              :title="anc.title + ' (' + tierOf(anc.tier).name + ')'"
              @click="onCrumbClick(anc.id)"
            >
              {{ shortTitle(anc.title) }}
            </button>
            <span
              v-if="idx < ancestors.length - 1"
              class="crumb-sep"
              aria-hidden="true"
            >
              ›
            </span>
          </template>
        </nav>

        <!-- Title -->
        <h2 class="d-title" :class="{ done: item.done }">
          {{ item.title }}
        </h2>

        <!-- Meta Information -->
        <div class="d-meta">
          <span>
            {{ tier.name.toUpperCase() }}
            <template v-if="progress.total">
              · {{ progress.done }} of {{ progress.total }} done
            </template>
          </span>

          <span
            v-if="hasDeadline(item)"
            class="d-due"
            :class="{ overdue: isOverdue(item) }"
          >
            <template v-if="hasDue(item)">
              ⏰ Due {{ fmtDue(item.dueAt) }}
            </template>
            <template v-else-if="hasTarget(item)">
              🎯 Target {{ targetLabel(item.target) }}
            </template>
            <template v-if="isOverdue(item)"> · overdue</template>
          </span>

          <button
            class="done-toggle"
            :aria-pressed="item.done"
            @click="onToggleDone"
          >
            {{ item.done ? "✓ Done" : "Mark done" }}
          </button>

          <button class="done-toggle" @click="onSetDeadline">
            ⏰ {{ hasDeadline(item) ? "Change deadline" : "Set deadline" }}
          </button>
        </div>

        <!-- Focus Timer Widget -->
        <div class="focus" :class="{ running: isTimerRunning }">
          <div class="focus-main">
            <div class="focus-label">Focus time</div>
            <div class="focus-clock" aria-live="off">
              {{ fmtClock(totalTimeSeconds) }}
            </div>
            <div class="focus-sub">
              <template v-if="isTimerRunning">
                ● Running · this session {{ fmtClock(timerElapsed()) }}
              </template>
              <template v-else-if="sessionCount">
                {{ sessionCount }} session{{ sessionCount === 1 ? "" : "s" }} ·
                {{ fmtDuration(item.timeSpent || 0) }} logged
              </template>
              <template v-else>
                Not started yet
              </template>
            </div>
          </div>

          <button class="focus-btn" @click="onToggleTimer">
            {{ isTimerRunning ? "⏹ Stop" : "▶ Start focus" }}
          </button>

          <!-- Sessions History Accordion -->
          <div
            v-if="sessionsList.length || isTimerRunning"
            class="sess"
          >
            <button
              class="sess-head"
              :aria-expanded="isSessionsOpen"
              @click="toggleSessionsFold"
            >
              <span class="chev-ico" aria-hidden="true">›</span>
              <span>Sessions ({{ sessionsList.length }})</span>
            </button>

            <ul v-if="isSessionsOpen" class="sess-list">
              <li v-if="isTimerRunning" class="sess-live">
                <span class="sess-when">
                  ● Running since {{ formatSessionDate(store.timer?.startedAt) }}
                </span>
                <span class="sess-dur">in progress</span>
              </li>
              <li
                v-for="(sess, sIdx) in sessionsList"
                :key="sIdx"
              >
                <span class="sess-when">
                  {{ formatSessionDate(sess.startedAt) }}
                </span>
                <span class="sess-dur">
                  {{ fmtDuration(sess.seconds) }}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <!-- Progress Bar -->
        <div v-if="progress.total" class="d-prog">
          <span class="bar" aria-hidden="true">
            <i :style="{ width: progressPercent + '%' }"></i>
          </span>
        </div>

        <!-- Notes -->
        <p v-if="item.notes" class="d-notes">
          {{ item.notes }}
        </p>

        <!-- Nested Items Tree -->
        <ul v-if="kids.length" class="tree">
          <DetailTreeNode
            v-for="kid in kids"
            :key="kid.id"
            :item="kid"
          />
        </ul>
        <p v-else-if="canAddInside" class="no-children">
          Nothing inside yet.
        </p>

        <!-- Add inside button -->
        <button
          v-if="canAddInside"
          class="add-inside"
          @click="onAddInside"
        >
          + Add inside this item
        </button>
      </div>
    </div>
  </section>
</template>
