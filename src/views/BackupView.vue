<script setup>
import { ref, computed } from "vue";
import { store, exportData, importFile } from "../store/todoStore";

const fileInputRef = ref(null);

const itemCount = computed(() => store.items.length);
const trashCount = computed(() => store.trash.length);

function onExport() {
  exportData();
}

function onImportClick() {
  if (fileInputRef.value) {
    fileInputRef.value.click();
  }
}

function onFileChange(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = ""; // allow picking the same file again later
  if (file) {
    importFile(file);
  }
}
</script>

<template>
  <div class="backup">
    <h2>Export</h2>
    <p>
      Download everything stored in this browser ({{ itemCount }} item{{ itemCount === 1 ? "" : "s" }}
      <template v-if="trashCount"> plus {{ trashCount }} in Trash</template>) as a JSON file.
    </p>
    <button class="bk-btn" @click="onExport">⬇ Export data</button>

    <h2>Import</h2>
    <p>
      Choose a JSON file exported from this app.
      <b>It replaces everything currently stored.</b>
    </p>
    <button class="bk-btn warn" @click="onImportClick">⬆ Import data…</button>

    <input
      ref="fileInputRef"
      type="file"
      accept=".json,application/json"
      hidden
      @change="onFileChange"
    />
  </div>
</template>
