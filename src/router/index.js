import { ref, computed } from "vue";

const currentHash = ref(window.location.hash || "#/");

window.addEventListener("hashchange", () => {
  currentHash.value = window.location.hash || "#/";
  window.scrollTo(0, 0);
});

export const route = computed(() => {
  const hash = currentHash.value;
  const itemMatch = hash.match(/^#\/item\/([^/]+)$/);
  if (itemMatch) {
    return {
      name: "item",
      id: decodeURIComponent(itemMatch[1]),
      raw: hash,
    };
  }

  const featureMatch = hash.match(/^#\/f\/([^/]+)$/);
  if (featureMatch) {
    return {
      name: "feature",
      id: decodeURIComponent(featureMatch[1]),
      raw: hash,
    };
  }

  return {
    name: "home",
    id: null,
    raw: "#/",
  };
});

export function navigateTo(hash) {
  if (window.location.hash === hash) {
    currentHash.value = hash;
  } else {
    window.location.hash = hash;
  }
}

export function navigateHome() {
  navigateTo("#/");
}

export function navigateItem(id) {
  navigateTo(`#/item/${encodeURIComponent(id)}`);
}

export function navigateFeature(featId) {
  navigateTo(featId === "todo" ? "#/" : `#/f/${encodeURIComponent(featId)}`);
}
