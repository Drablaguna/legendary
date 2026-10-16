<script setup>
import { computed } from "vue";
import { store, getChildren, toggleDone } from "../store/todoStore";
import { tierOf, tierStyleString, hasDue, hasTarget, fmtDue, targetLabel } from "../utils/helpers";
import { navigateItem } from "../router/index";

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
});

const kids = computed(() => {
  return getChildren(props.item.id).sort((a, b) => a.createdAt - b.createdAt);
});

const isCollapsed = computed(() => {
  return store.collapsed.has(props.item.id);
});

function toggleFold() {
  if (store.collapsed.has(props.item.id)) {
    store.collapsed.delete(props.item.id);
  } else {
    store.collapsed.add(props.item.id);
  }
}

function onOpen() {
  navigateItem(props.item.id);
}

function onCheck() {
  toggleDone(props.item.id);
}

const deadlineText = computed(() => {
  if (hasDue(props.item)) {
    return ` · due ${fmtDue(props.item.dueAt)}`;
  }
  if (hasTarget(props.item)) {
    return ` · target ${targetLabel(props.item.target, true)}`;
  }
  return "";
});
</script>

<template>
  <li
    class="node"
    :class="{
      done: item.done,
      collapsed: isCollapsed,
    }"
  >
    <div class="row" :style="tierStyleString(item.tier)">
      <span class="edge"></span>
      <button
        class="chk"
        role="checkbox"
        :aria-checked="item.done"
        :aria-label="'Mark done: ' + item.title"
        @click="onCheck"
      >
        <span class="box">{{ item.done ? "✓" : "" }}</span>
      </button>

      <button class="open" @click="onOpen">
        <span class="rt">{{ item.title }}</span>
        <span class="rtier">{{ tierOf(item.tier).name }}{{ deadlineText }}</span>
      </button>

      <button
        v-if="kids.length"
        class="fold"
        :aria-expanded="!isCollapsed"
        aria-label="Toggle nested items"
        @click="toggleFold"
      >
        ▾
      </button>
    </div>

    <ul v-if="kids.length && !isCollapsed" class="tree">
      <DetailTreeNode
        v-for="kid in kids"
        :key="kid.id"
        :item="kid"
      />
    </ul>
  </li>
</template>
