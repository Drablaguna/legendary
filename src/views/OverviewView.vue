<script setup>
import { ref, computed, nextTick } from "vue";
import { DOMAINS, TIERS } from "../constants";
import {
  store,
  byId,
  getChildren,
  saveUI,
} from "../store/todoStore";
import {
  tierOf,
  tierStyleString,
  periodOf,
  hasDue,
  hasTarget,
  hasDeadline,
  deadlineEnd,
  isOverdue,
  fmtDue,
  targetLabel,
  dayKey,
  pad2,
} from "../utils/helpers";
import { navigateItem } from "../router/index";

/* ---- Target filter ---- */
const isFilterActive = computed(() => {
  return store.ovFilter.y != null || store.ovFilter.m != null || store.ovFilter.none;
});

function matchesFilter(i) {
  const f = store.ovFilter;
  if (!isFilterActive.value) return true;
  const p = periodOf(i);
  if (f.none) return !p;
  if (!p) return false;
  if (f.y != null && p.y !== f.y) return false;
  if (f.m != null && p.m !== f.m) return false;
  return true;
}

const activeKids = (id) =>
  getChildren(id)
    .filter((k) => !k.done)
    .sort((a, b) => a.tier - b.tier || a.createdAt - b.createdAt);

function nodeVisible(i) {
  return matchesFilter(i) || activeKids(i.id).some(nodeVisible);
}

const availableYears = computed(() => {
  const years = new Set([new Date().getFullYear()]);
  store.items.forEach((i) => {
    const p = i.domain === store.domain && !i.done ? periodOf(i) : null;
    if (p) years.add(p.y);
  });
  if (store.ovFilter.y != null) years.add(store.ovFilter.y);
  return [...years].sort();
});

const monthOptions = Array.from({ length: 12 }, (_, k) => ({
  value: k,
  label: new Date(2000, k, 1).toLocaleDateString(undefined, { month: "long" }),
}));

function onFilterYear(e) {
  const val = e.target.value === "" ? null : Number(e.target.value);
  store.ovFilter.y = val;
  store.ovFilter.none = false;
}

function onFilterMonth(e) {
  const val = e.target.value === "" ? null : Number(e.target.value);
  store.ovFilter.m = val;
  store.ovFilter.none = false;
}

function toggleNoDeadline() {
  store.ovFilter = { y: null, m: null, none: !store.ovFilter.none };
}

function clearFilter() {
  store.ovFilter = { y: null, m: null, none: false };
}

/* ---- Domain & View Switching ---- */
function setDomain(domId) {
  store.domain = domId;
  saveUI();
}

function setView(viewName) {
  store.ovView = viewName;
  saveUI();
  if (viewName === "timeline") {
    nextTick(scrollTimelineToNow);
  }
}

/* ---- List View ---- */
const rootItems = computed(() => {
  return store.items
    .filter((i) => i.domain === store.domain && !i.done && (!i.parentId || (byId(i.parentId) || { done: true }).done))
    .filter((i) => !isFilterActive.value || nodeVisible(i))
    .sort((a, b) => a.tier - b.tier || a.createdAt - b.createdAt);
});

function expandAll() {
  store.items.forEach((i) => {
    if (activeKids(i.id).length) store.overviewOpen.add(i.id);
  });
}

function collapseAll() {
  store.overviewOpen.clear();
}

function toggleRow(id) {
  if (store.overviewOpen.has(id)) {
    store.overviewOpen.delete(id);
  } else {
    store.overviewOpen.add(id);
  }
}

/* ---- Calendar View ---- */
const calCursor = ref({ y: new Date().getFullYear(), m: new Date().getMonth() });
const calDay = ref(dayKey(new Date()));

const dueItems = computed(() => {
  return store.items.filter(
    (i) => i.domain === store.domain && !i.done && hasDue(i) && matchesFilter(i)
  );
});

const deadlineItems = computed(() => {
  return store.items.filter(
    (i) => i.domain === store.domain && !i.done && hasDeadline(i) && matchesFilter(i)
  );
});

const monthName = computed(() => {
  const { y, m } = calCursor.value;
  return new Date(y, m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
});

const calendarCells = computed(() => {
  const { y, m } = calCursor.value;
  const todayKey = dayKey(new Date());
  const byDay = {};

  dueItems.value.sort((a, b) => a.dueAt - b.dueAt).forEach((i) => {
    const k = dayKey(new Date(i.dueAt));
    (byDay[k] = byDay[k] || []).push(i);
  });

  const offset = (new Date(y, m, 1).getDay() + 6) % 7; // weeks start on Monday
  const dim = new Date(y, m + 1, 0).getDate();
  const total = Math.ceil((offset + dim) / 7) * 7;

  const cells = [];
  for (let idx = 0; idx < total; idx++) {
    const d = new Date(y, m, idx - offset + 1);
    const k = dayKey(d);
    const list = byDay[k] || [];
    cells.push({
      dateStr: k,
      dayNum: d.getDate(),
      isOut: d.getMonth() !== m,
      isToday: k === todayKey,
      isSelected: k === calDay.value,
      list,
    });
  }
  return cells;
});

const selectedDayItems = computed(() => {
  const day = calDay.value;
  return dueItems.value.filter((i) => dayKey(new Date(i.dueAt)) === day);
});

const selectedDayLabel = computed(() => {
  if (!calDay.value) return "";
  const d = new Date(calDay.value + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
});

const targetMonthItems = computed(() => {
  const key = `${calCursor.value.y}-${pad2(calCursor.value.m + 1)}`;
  return deadlineItems.value.filter((i) => i.target === key);
});

const targetYearItems = computed(() => {
  const key = String(calCursor.value.y);
  return deadlineItems.value.filter((i) => i.target === key);
});

function prevMonth() {
  const c = calCursor.value;
  const m = c.m - 1;
  calCursor.value = { y: c.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
}

function nextMonth() {
  const c = calCursor.value;
  const m = c.m + 1;
  calCursor.value = { y: c.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
}

function onCalToday() {
  calCursor.value = { y: new Date().getFullYear(), m: new Date().getMonth() };
  calDay.value = dayKey(new Date());
}

/* ---- Timeline View ---- */
const timelineScrollRef = ref(null);
const DAY = 86400000;
const PX = 32;

const timelineData = computed(() => {
  const now = Date.now();
  const items = deadlineItems.value.slice().sort((a, b) => deadlineEnd(a) - deadlineEnd(b));
  if (!items.length) return null;

  const startOf = (i) => Math.min(i.createdAt, deadlineEnd(i));
  const sod = (ms) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  const t0 = sod(Math.min(now, ...items.map(startOf))) - 2 * DAY;
  const t1 = sod(Math.max(now, ...items.map(deadlineEnd))) + 3 * DAY;
  const days = Math.round((t1 - t0) / DAY);
  const x = (ms) => ((ms - t0) / DAY) * PX;
  const first = new Date(t0);

  const daysHeader = [];
  const monthsHeader = [];
  const todayStr = dayKey(new Date());

  for (let k = 0; k < days; k++) {
    const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + k);
    const isWknd = [0, 6].includes(d.getDay());
    daysHeader.push({
      date: d.getDate(),
      left: k * PX,
      isToday: dayKey(d) === todayStr,
      isWknd,
    });
    if (k === 0 || d.getDate() === 1) {
      monthsHeader.push({
        label: d.toLocaleDateString(undefined, { month: "short", year: "numeric" }),
        left: k * PX,
      });
    }
  }

  const rows = items.map((i) => {
    const end = deadlineEnd(i);
    const left = x(startOf(i));
    const width = Math.max(14, x(end) - left);
    const label = hasDue(i) ? fmtDue(i.dueAt) : `🎯 ${targetLabel(i.target, true)}`;
    return {
      item: i,
      left,
      width,
      label,
    };
  });

  return {
    days,
    totalWidth: days * PX,
    nowX: Math.round(x(now)),
    daysHeader,
    monthsHeader,
    rows,
  };
});

function scrollTimelineToNow() {
  if (timelineScrollRef.value && timelineData.value) {
    const sc = timelineScrollRef.value;
    sc.scrollLeft = Math.max(0, timelineData.value.nowX - sc.clientWidth / 3);
  }
}

const unscheduledCount = computed(() => {
  return store.items.filter((i) => i.domain === store.domain && !i.done && !hasDeadline(i)).length;
});
</script>

<template>
  <div class="overview-view">
    <!-- Top Segments Bar -->
    <div class="ov-top">
      <div class="seg" role="group" aria-label="Domain">
        <button
          v-for="d in DOMAINS"
          :key="d.id"
          :aria-pressed="store.domain === d.id"
          @click="setDomain(d.id)"
        >
          {{ d.name }}
        </button>
      </div>

      <div class="seg" role="group" aria-label="View">
        <button
          :aria-pressed="store.ovView === 'list'"
          @click="setView('list')"
        >
          ☰ List
        </button>
        <button
          :aria-pressed="store.ovView === 'calendar'"
          @click="setView('calendar')"
        >
          📅 Calendar
        </button>
        <button
          :aria-pressed="store.ovView === 'timeline'"
          @click="setView('timeline')"
        >
          📊 Timeline
        </button>
      </div>
    </div>

    <!-- Overview Target Filter -->
    <div class="ov-filter" role="group" aria-label="Filter by target">
      <span class="ov-filter-label">🎯 Target</span>
      <select
        :value="store.ovFilter.y ?? ''"
        aria-label="Target year"
        @change="onFilterYear"
      >
        <option value="">Any year</option>
        <option v-for="y in availableYears" :key="y" :value="y">{{ y }}</option>
      </select>

      <select
        :value="store.ovFilter.m ?? ''"
        aria-label="Target month"
        @change="onFilterMonth"
      >
        <option value="">Any month</option>
        <option
          v-for="m in monthOptions"
          :key="m.value"
          :value="m.value"
        >
          {{ m.label }}
        </option>
      </select>

      <button
        class="preset-dark"
        :aria-pressed="store.ovFilter.none"
        @click="toggleNoDeadline"
      >
        No deadline
      </button>

      <button
        v-if="isFilterActive"
        class="ov-link"
        @click="clearFilter"
      >
        Clear
      </button>
    </div>

    <!-- ============ LIST VIEW ============ -->
    <div v-if="store.ovView === 'list'">
      <div v-if="rootItems.length && !isFilterActive" class="ov-tools">
        <button class="ov-link" @click="expandAll">Expand all</button>
        <button class="ov-link" @click="collapseAll">Collapse all</button>
      </div>

      <p v-if="rootItems.length && isFilterActive" class="ov-note">
        Showing items that match the target filter, with the items they are inside (dimmed).
      </p>

      <ul v-if="rootItems.length" class="o-list">
        <!-- Render root items recursively -->
        <li
          v-for="item in rootItems"
          :key="item.id"
          class="o-node"
          :class="{ dim: isFilterActive && !matchesFilter(item) }"
        >
          <div class="o-row" :style="tierStyleString(item.tier)">
            <button
              v-if="activeKids(item.id).length && !isFilterActive"
              class="o-chev"
              :aria-expanded="isFilterActive || store.overviewOpen.has(item.id)"
              :aria-label="'Show what is inside ' + item.title"
              @click="toggleRow(item.id)"
            >
              <span class="chev-ico">›</span>
            </button>
            <span v-else class="o-chev o-ph"></span>

            <button class="o-card" @click="navigateItem(item.id)">
              <span class="edge"></span>
              <span class="o-body">
                <span class="o-title">{{ item.title }}</span>
                <span class="o-meta">
                  <span class="ctier">{{ tierOf(item.tier).name }}</span>
                  <span
                    v-if="hasDue(item)"
                    class="due"
                    :class="{ overdue: isOverdue(item) }"
                  >
                    ⏰ {{ fmtDue(item.dueAt) }}
                  </span>
                  <span
                    v-else-if="hasTarget(item)"
                    class="due target"
                    :class="{ overdue: isOverdue(item) }"
                  >
                    🎯 {{ targetLabel(item.target, true) }}
                  </span>
                </span>
              </span>
            </button>
          </div>

          <!-- Sub items -->
          <ul
            v-if="(isFilterActive || store.overviewOpen.has(item.id)) && activeKids(item.id).length"
            class="o-sub"
          >
            <li
              v-for="kid in activeKids(item.id).filter((k) => !isFilterActive || nodeVisible(k))"
              :key="kid.id"
              class="o-node"
              :class="{ dim: isFilterActive && !matchesFilter(kid) }"
            >
              <div class="o-row" :style="tierStyleString(kid.tier)">
                <button
                  v-if="activeKids(kid.id).length && !isFilterActive"
                  class="o-chev"
                  :aria-expanded="isFilterActive || store.overviewOpen.has(kid.id)"
                  @click="toggleRow(kid.id)"
                >
                  <span class="chev-ico">›</span>
                </button>
                <span v-else class="o-chev o-ph"></span>

                <button class="o-card" @click="navigateItem(kid.id)">
                  <span class="edge"></span>
                  <span class="o-body">
                    <span class="o-title">{{ kid.title }}</span>
                    <span class="o-meta">
                      <span class="ctier">{{ tierOf(kid.tier).name }}</span>
                      <span
                        v-if="hasDue(kid)"
                        class="due"
                        :class="{ overdue: isOverdue(kid) }"
                      >
                        ⏰ {{ fmtDue(kid.dueAt) }}
                      </span>
                      <span
                        v-else-if="hasTarget(kid)"
                        class="due target"
                        :class="{ overdue: isOverdue(kid) }"
                      >
                        🎯 {{ targetLabel(kid.target, true) }}
                      </span>
                    </span>
                  </span>
                </button>
              </div>
            </li>
          </ul>
        </li>
      </ul>

      <div v-else class="empty">
        <p>
          {{ isFilterActive ? "No open items match this target filter." : "Nothing open in this domain.<br>Create items from the To-Do list." }}
        </p>
      </div>
    </div>

    <!-- ============ CALENDAR VIEW ============ -->
    <div v-else-if="store.ovView === 'calendar'">
      <div class="cal-head">
        <button class="icon-btn" aria-label="Previous month" @click="prevMonth">‹</button>
        <h2 class="cal-title">{{ monthName }}</h2>
        <button class="icon-btn" aria-label="Next month" @click="nextMonth">›</button>
        <button class="ov-link" @click="onCalToday">Today</button>
      </div>

      <div class="cal-week">
        <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
      </div>

      <div class="cal-grid">
        <button
          v-for="cell in calendarCells"
          :key="cell.dateStr"
          class="cal-cell"
          :class="{
            out: cell.isOut,
            today: cell.isToday,
            selected: cell.isSelected,
          }"
          :data-day="cell.dateStr"
          @click="calDay = cell.dateStr"
        >
          <span class="cal-n">{{ cell.dayNum }}</span>
          <span class="cal-dots">
            <i
              v-for="it in cell.list.slice(0, 3)"
              :key="it.id"
              :style="{ background: tierOf(it.tier).color }"
            ></i>
            <b v-if="cell.list.length > 3">+{{ cell.list.length - 3 }}</b>
          </span>
          <span class="cal-titles">
            <span
              v-for="it in cell.list.slice(0, 2)"
              :key="it.id"
              class="cal-t"
              :class="{ overdue: isOverdue(it) }"
              :style="tierStyleString(it.tier)"
            >
              {{ it.title }}
            </span>
            <span v-if="cell.list.length > 2" class="cal-more">
              +{{ cell.list.length - 2 }} more
            </span>
          </span>
        </button>
      </div>

      <h3 class="cal-day-title">{{ selectedDayLabel }}</h3>

      <ul v-if="selectedDayItems.length" class="o-list">
        <li v-for="it in selectedDayItems" :key="it.id">
          <button
            class="cal-item"
            :style="tierStyleString(it.tier)"
            @click="navigateItem(it.id)"
          >
            <span class="edge"></span>
            <span class="cal-time" :class="{ overdue: isOverdue(it) }">
              {{ new Date(it.dueAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) }}
            </span>
            <span class="o-body">
              <span class="o-title">{{ it.title }}</span>
              <span class="o-meta">
                <span class="ctier">{{ tierOf(it.tier).name }}</span>
              </span>
            </span>
          </button>
        </li>
      </ul>
      <p v-else class="ov-note">Nothing due on this day.</p>

      <!-- Targets for Month and Year -->
      <template v-if="targetMonthItems.length">
        <h3 class="cal-day-title">🎯 Targeting {{ monthName }}</h3>
        <ul class="o-list">
          <li v-for="it in targetMonthItems" :key="it.id">
            <button
              class="cal-item"
              :style="tierStyleString(it.tier)"
              @click="navigateItem(it.id)"
            >
              <span class="edge"></span>
              <span class="cal-time" :class="{ overdue: isOverdue(it) }">🎯</span>
              <span class="o-body">
                <span class="o-title">{{ it.title }}</span>
                <span class="o-meta"><span class="ctier">{{ tierOf(it.tier).name }}</span></span>
              </span>
            </button>
          </li>
        </ul>
      </template>

      <template v-if="targetYearItems.length">
        <h3 class="cal-day-title">🎯 Targeting {{ calCursor.y }}</h3>
        <ul class="o-list">
          <li v-for="it in targetYearItems" :key="it.id">
            <button
              class="cal-item"
              :style="tierStyleString(it.tier)"
              @click="navigateItem(it.id)"
            >
              <span class="edge"></span>
              <span class="cal-time" :class="{ overdue: isOverdue(it) }">🎯</span>
              <span class="o-body">
                <span class="o-title">{{ it.title }}</span>
                <span class="o-meta"><span class="ctier">{{ tierOf(it.tier).name }}</span></span>
              </span>
            </button>
          </li>
        </ul>
      </template>

      <p v-if="unscheduledCount" class="ov-note">
        {{ unscheduledCount }} open item{{ unscheduledCount === 1 ? " has" : "s have" }} no deadline, so {{ unscheduledCount === 1 ? "it isn't" : "they aren't" }} shown here.
      </p>
    </div>

    <!-- ============ TIMELINE VIEW ============ -->
    <div v-else-if="store.ovView === 'timeline'">
      <div v-if="timelineData" ref="timelineScrollRef" class="tl-scroll" :data-today="timelineData.nowX">
        <div class="tl-grid" :style="{ '--w': timelineData.totalWidth + 'px', '--px': PX + 'px' }">
          <div class="tl-head">
            <div class="tl-corner"></div>
            <div class="tl-axis">
              <div class="tl-months">
                <span
                  v-for="(m, mIdx) in timelineData.monthsHeader"
                  :key="mIdx"
                  class="tl-month"
                  :style="{ left: m.left + 'px' }"
                >
                  {{ m.label }}
                </span>
              </div>
              <div class="tl-days">
                <span
                  v-for="(d, dIdx) in timelineData.daysHeader"
                  :key="dIdx"
                  class="tl-day"
                  :class="{ today: d.isToday, wknd: d.isWknd }"
                  :style="{ left: d.left + 'px', width: PX + 'px' }"
                >
                  {{ d.date }}
                </span>
              </div>
            </div>
          </div>

          <!-- Rows -->
          <div
            v-for="r in timelineData.rows"
            :key="r.item.id"
            class="tl-row"
          >
            <button class="tl-label" @click="navigateItem(r.item.id)">
              <span class="tl-name">{{ r.item.title }}</span>
            </button>
            <div class="tl-track">
              <button
                class="tl-bar"
                :class="{
                  target: hasTarget(r.item),
                  overdue: isOverdue(r.item),
                }"
                :style="[
                  tierStyleString(r.item.tier),
                  { left: r.left + 'px', width: r.width + 'px' },
                ]"
                @click="navigateItem(r.item.id)"
              >
                <span>{{ r.label }}</span>
              </button>
            </div>
          </div>

          <!-- Live Now Indicator -->
          <div
            class="tl-now"
            :style="{ left: 'calc(var(--lw) + ' + timelineData.nowX + 'px)' }"
            title="Now"
          ></div>
        </div>
      </div>

      <div v-else class="empty">
        <p>
          No open items with a deadline{{ isFilterActive ? " match this filter" : " in this domain" }}.<br />
          Add a date or target when you create or edit an item.
        </p>
      </div>

      <p v-if="timelineData" class="ov-note">
        Each bar runs from when the item was created to its due date (dashed bars: to the end of its target month or year). A red outline means overdue; the red line is now.
      </p>
      <p v-if="unscheduledCount" class="ov-note">
        {{ unscheduledCount }} open item{{ unscheduledCount === 1 ? " has" : "s have" }} no deadline, so {{ unscheduledCount === 1 ? "it isn't" : "they aren't" }} shown here.
      </p>
    </div>
  </div>
</template>
