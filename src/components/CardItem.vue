<script setup>
import { ref, computed } from "vue";
import {
  store,
  getAncestors,
  getProgress,
} from "../store/todoStore";
import {
  tierOf,
  tierStyleString,
  shortTitle,
  hasDue,
  hasTarget,
  fmtDue,
  targetLabel,
  isOverdue,
} from "../utils/helpers";
import { navigateItem } from "../router/index";
import {
  dnd,
  startHoldTimer,
  isClickSuppressed,
} from "../composables/useCardDrag";

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
});

const cardRef = ref(null);

const crumbs = computed(() => {
  const ancestors = getAncestors(props.item.id);
  if (!ancestors.length) return "";
  return ancestors.map((a) => shortTitle(a.title)).join(" › ");
});

const progress = computed(() => {
  return getProgress(props.item.id);
});

const progressPercent = computed(() => {
  if (!progress.value.total) return 0;
  return Math.round((progress.value.done / progress.value.total) * 100);
});

const isSelected = computed(() => {
  return store.selectMode && store.selected.has(props.item.id);
});

const isDragging = computed(() => {
  return dnd.active && dnd.dragId === props.item.id;
});

const canDrop = computed(() => {
  if (!dnd.active || !dnd.dragItem) return false;
  const dragged = dnd.dragItem;
  return (
    props.item.id !== dragged.id &&
    props.item.id !== dragged.parentId &&
    props.item.tier < dragged.tier
  );
});

const isDropHover = computed(() => {
  return canDrop.value && dnd.hoverTargetId === props.item.id;
});

function onPointerDown(e) {
  startHoldTimer(props.item, cardRef.value, e);
}

function onClick() {
  if (isClickSuppressed()) return;
  if (store.selectMode) {
    if (store.selected.has(props.item.id)) {
      store.selected.delete(props.item.id);
    } else {
      store.selected.add(props.item.id);
    }
  } else {
    navigateItem(props.item.id);
  }
}
</script>

<template>
  <button
    ref="cardRef"
    class="card"
    :class="{
      done: item.done,
      selected: isSelected,
      dragging: isDragging,
      'can-drop': canDrop,
      'drop-hover': isDropHover,
    }"
    draggable="false"
    :style="tierStyleString(item.tier)"
    :data-id="item.id"
    :aria-pressed="store.selectMode ? isSelected : undefined"
    @pointerdown="onPointerDown"
    @click="onClick"
  >
    <!-- Selection Checkmark Circle -->
    <span v-if="store.selectMode" class="sel-circle" aria-hidden="true">
      {{ isSelected ? "✓" : "" }}
    </span>

    <span class="band"></span>

    <span class="body">
      <span v-if="crumbs" class="crumb">{{ crumbs }}</span>
      <span class="ctitle">{{ item.title }}</span>
      <span class="meta">
        <span class="ctier">{{ tierOf(item.tier).name }}</span>

        <!-- Deadline Badge -->
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

        <!-- Progress Badge -->
        <span v-if="progress.total" class="prog">
          <span class="bar" aria-hidden="true">
            <i :style="{ width: progressPercent + '%' }"></i>
          </span>
          <span>{{ progress.done }}/{{ progress.total }}</span>
        </span>
      </span>
    </span>
  </button>
</template>
