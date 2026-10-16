<script setup>
import { ref, watch } from "vue";
import { store } from "../store/todoStore";

const dialogRef = ref(null);

watch(
  () => store.confirmModal.open,
  (isOpen) => {
    if (!dialogRef.value) return;
    if (isOpen) {
      if (!dialogRef.value.open) {
        dialogRef.value.showModal();
      }
    } else {
      if (dialogRef.value.open) {
        dialogRef.value.close();
      }
    }
  }
);

function onCancel() {
  store.confirmModal.open = false;
  store.confirmModal.action = null;
}

function onConfirm() {
  const action = store.confirmModal.action;
  store.confirmModal.open = false;
  store.confirmModal.action = null;
  if (action) action();
}

function onClickOutside(e) {
  if (e.target === dialogRef.value) {
    onCancel();
  }
}
</script>

<template>
  <dialog
    ref="dialogRef"
    aria-labelledby="confirm-heading"
    @click="onClickOutside"
    @close="onCancel"
  >
    <form method="dialog" class="confirm-form" @submit.prevent>
      <h2 id="confirm-heading">{{ store.confirmModal.heading }}</h2>
      <p id="confirm-text">{{ store.confirmModal.text }}</p>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" @click="onCancel">Cancel</button>
        <button
          type="button"
          class="btn"
          :class="store.confirmModal.isDanger ? 'danger' : 'primary'"
          @click="onConfirm"
        >
          {{ store.confirmModal.confirmLabel || 'Delete' }}
        </button>
      </div>
    </form>
  </dialog>
</template>
