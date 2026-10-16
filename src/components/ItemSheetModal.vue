<script setup>
import { ref, computed, watch, nextTick } from "vue";
import { TIERS } from "../constants";
import {
  store,
  byId,
  legalTiersFor,
  tierError,
  closeSheet,
  submitSheet,
} from "../store/todoStore";
import {
  tierOf,
  tierStyleString,
  fromLocalInput,
  toLocalInput,
} from "../utils/helpers";

const dialogRef = ref(null);
const titleInputRef = ref(null);
const dlFieldRef = ref(null);

const sheet = computed(() => store.sheet);

const headingText = computed(() => {
  if (sheet.value.mode === "edit") {
    const item = byId(sheet.value.id);
    return item ? `Edit ${tierOf(item.tier).name}` : "Edit item";
  }
  return sheet.value.parentId ? "Add inside" : "New item";
});

const allowedTiers = computed(() => {
  if (sheet.value.mode === "create") {
    return legalTiersFor(sheet.value.parentId);
  }
  const item = byId(sheet.value.id);
  if (!item) return [1, 2, 3, 4, 5];
  return TIERS.map((t) => t.tier).filter((n) => !tierError(item, n) || n === item.tier);
});

const yearOptions = computed(() => {
  const currentY = new Date().getFullYear();
  const selectedY = sheet.value.targetYear || currentY;
  const from = Math.min(currentY - 1, selectedY);
  const to = Math.max(currentY + 10, selectedY);
  const years = [];
  for (let yr = from; yr <= to; yr++) {
    years.push(yr);
  }
  return years;
});

const monthOptions = Array.from({ length: 12 }, (_, k) => ({
  value: k,
  label: new Date(2000, k, 1).toLocaleDateString(undefined, { month: "long" }),
}));

watch(
  () => sheet.value.open,
  async (isOpen) => {
    if (!dialogRef.value) return;
    if (isOpen) {
      if (!dialogRef.value.open) {
        dialogRef.value.showModal();
      }
      await nextTick();
      if (sheet.value.focusDeadline && dlFieldRef.value) {
        dlFieldRef.value.scrollIntoView({ block: "center" });
      } else if (titleInputRef.value) {
        titleInputRef.value.focus();
      }
    } else {
      if (dialogRef.value.open) {
        dialogRef.value.close();
      }
    }
  }
);

function onDialogClick(e) {
  if (e.target === dialogRef.value) {
    closeSheet();
  }
}

function setDlMode(mode) {
  sheet.value.dlMode = mode;
}

function applyDuePreset(kind) {
  if (kind === "clear") {
    sheet.value.dueInput = "";
    return;
  }
  const cur = fromLocalInput(sheet.value.dueInput);
  const curD = cur == null ? null : new Date(cur);
  const d = new Date();
  if (kind === "tomorrow") d.setDate(d.getDate() + 1);
  else if (kind === "week") d.setDate(d.getDate() + 7);
  else if (kind === "month") {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  d.setHours(curD ? curD.getHours() : 17, curD ? curD.getMinutes() : 0, 0, 0);
  if (kind === "today" && !curD && d.getTime() <= Date.now()) {
    d.setHours(23, 59, 0, 0);
  }
  sheet.value.dueInput = toLocalInput(d.getTime());
}

function applyTargetPreset(kind) {
  const now = new Date();
  if (kind === "thismonth" || kind === "nextmonth") {
    const d = new Date(now.getFullYear(), now.getMonth() + (kind === "nextmonth" ? 1 : 0), 1);
    sheet.value.targetMonth = d.getMonth();
    sheet.value.targetYear = d.getFullYear();
  } else {
    sheet.value.targetYear = now.getFullYear() + (kind === "nextyear" ? 1 : 0);
  }
}

function pickTier(t) {
  sheet.value.tier = t;
  sheet.value.error = "";
}

function onSubmit() {
  submitSheet();
}
</script>

<template>
  <dialog
    ref="dialogRef"
    aria-labelledby="sheet-heading"
    @click="onDialogClick"
    @close="closeSheet"
  >
    <form id="sheet-form" novalidate @submit.prevent="onSubmit">
      <h2 id="sheet-heading">{{ headingText }}</h2>

      <!-- Title Input -->
      <label class="field">
        <span>Title</span>
        <input
          ref="titleInputRef"
          v-model="sheet.title"
          id="f-title"
          type="text"
          maxlength="200"
          autocomplete="off"
          required
        />
      </label>
      <p v-if="sheet.error" id="f-error" class="error" role="alert">
        {{ sheet.error }}
      </p>

      <!-- Tier Picker -->
      <fieldset class="field">
        <legend>Type</legend>
        <div id="tier-picker" class="tier-picker" role="radiogroup">
          <button
            v-for="t in TIERS"
            :key="t.tier"
            type="button"
            class="tier-btn"
            :style="tierStyleString(t.tier)"
            role="radio"
            :aria-checked="sheet.tier === t.tier"
            :disabled="!allowedTiers.includes(t.tier)"
            :title="!allowedTiers.includes(t.tier) ? 'Not allowed here' : undefined"
            @click="pickTier(t.tier)"
          >
            {{ t.name }}
          </button>
        </div>
      </fieldset>

      <!-- Deadline Field -->
      <fieldset class="field" id="dl-field" ref="dlFieldRef">
        <legend>Deadline <em>(optional)</em></legend>
        <div
          id="dl-modes"
          class="dl-modes"
          :class="{ sep: sheet.dlMode !== 'none' }"
          role="group"
          aria-label="Deadline type"
        >
          <button
            type="button"
            :aria-pressed="sheet.dlMode === 'none'"
            @click="setDlMode('none')"
          >
            None
          </button>
          <button
            type="button"
            :aria-pressed="sheet.dlMode === 'date'"
            @click="setDlMode('date')"
          >
            Date &amp; time
          </button>
          <button
            type="button"
            :aria-pressed="sheet.dlMode === 'month'"
            @click="setDlMode('month')"
          >
            Target month
          </button>
          <button
            type="button"
            :aria-pressed="sheet.dlMode === 'year'"
            @click="setDlMode('year')"
          >
            Target year
          </button>
        </div>

        <!-- Date & Time Picker -->
        <div v-if="sheet.dlMode === 'date'" id="dl-date">
          <div class="due-presets">
            <button type="button" class="preset" @click="applyDuePreset('today')">Today</button>
            <button type="button" class="preset" @click="applyDuePreset('tomorrow')">Next day</button>
            <button type="button" class="preset" @click="applyDuePreset('week')">Next week</button>
            <button type="button" class="preset" @click="applyDuePreset('month')">Next month</button>
            <button type="button" class="preset clear" @click="applyDuePreset('clear')">Clear</button>
          </div>
          <input
            v-model="sheet.dueInput"
            id="f-due"
            type="datetime-local"
            aria-label="Due date and time"
          />
        </div>

        <!-- Target Month/Year Picker -->
        <div v-if="sheet.dlMode === 'month' || sheet.dlMode === 'year'" id="dl-target">
          <div class="due-presets">
            <template v-if="sheet.dlMode === 'month'">
              <button type="button" class="preset tg-m" @click="applyTargetPreset('thismonth')">This month</button>
              <button type="button" class="preset tg-m" @click="applyTargetPreset('nextmonth')">Next month</button>
            </template>
            <template v-if="sheet.dlMode === 'year'">
              <button type="button" class="preset tg-y" @click="applyTargetPreset('thisyear')">This year</button>
              <button type="button" class="preset tg-y" @click="applyTargetPreset('nextyear')">Next year</button>
            </template>
          </div>
          <div class="tg-row">
            <select
              v-if="sheet.dlMode === 'month'"
              v-model="sheet.targetMonth"
              id="f-t-month"
              aria-label="Target month"
            >
              <option
                v-for="m in monthOptions"
                :key="m.value"
                :value="m.value"
              >
                {{ m.label }}
              </option>
            </select>
            <select
              v-model="sheet.targetYear"
              id="f-t-year"
              aria-label="Target year"
            >
              <option v-for="yr in yearOptions" :key="yr" :value="yr">
                {{ yr }}
              </option>
            </select>
          </div>
        </div>
      </fieldset>

      <!-- Notes Field -->
      <label class="field">
        <span>Notes <em>(optional)</em></span>
        <textarea v-model="sheet.notes" id="f-notes" rows="3"></textarea>
      </label>

      <!-- Actions -->
      <div class="sheet-actions">
        <button type="button" class="btn ghost" @click="closeSheet">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>
  </dialog>
</template>
