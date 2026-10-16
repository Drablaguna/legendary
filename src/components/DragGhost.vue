<script setup>
import { computed } from "vue";
import { dnd } from "../composables/useCardDrag";
import { tierOf, tierStyleString, shortTitle } from "../utils/helpers";
import { getAncestors } from "../store/todoStore";

const item = computed(() => dnd.dragItem);

const crumbs = computed(() => {
  if (!item.value) return "";
  const ancestors = getAncestors(item.value.id);
  if (!ancestors.length) return "";
  return ancestors.map((a) => shortTitle(a.title)).join(" › ");
});
</script>

<template>
  <div
    v-if="dnd.active && item"
    class="card drag-ghost"
    :style="[
      tierStyleString(item.tier),
      {
        left: dnd.ghost.x + 'px',
        top: dnd.ghost.y + 'px',
        width: dnd.ghost.width + 'px',
      },
    ]"
  >
    <span class="band"></span>
    <span class="body">
      <span v-if="crumbs" class="crumb">{{ crumbs }}</span>
      <span class="ctitle">{{ item.title }}</span>
      <span class="meta">
        <span class="ctier">{{ tierOf(item.tier).name }}</span>
      </span>
    </span>
  </div>
</template>
