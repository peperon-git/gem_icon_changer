const STORAGE_KEY = "gemIconCustomizerSettings";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const SAVE_BUTTON_LABEL = "この画像を保存";

const enabledInput = document.querySelector("#enabled");
const gemNameInput = document.querySelector("#gemName");
const imageFileInput = document.querySelector("#imageFile");
const preview = document.querySelector("#preview");
const saveGemButton = document.querySelector("#saveGem");
const clearAllButton = document.querySelector("#clearAll");
const gemList = document.querySelector("#gemList");
const emptyState = document.querySelector("#emptyState");

let settings = { enabled: true, gems: [] };
let selectedImage = "";

loadSettings();

enabledInput.addEventListener("change", () => {
  settings.enabled = enabledInput.checked;
  saveSettings();
});

imageFileInput.addEventListener("change", async () => {
  const file = imageFileInput.files?.[0];
  selectedImage = "";
  preview.style.backgroundImage = "";

  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showInlineError("画像ファイルを選んでください");
    imageFileInput.value = "";
    return;
  }

  if (file.size > MAX_IMAGE_BYTES) {
    showInlineError("2MB以下の画像を選んでください");
    imageFileInput.value = "";
    return;
  }

  selectedImage = await readFileAsDataUrl(file);
  preview.style.backgroundImage = `url("${selectedImage}")`;
});

saveGemButton.addEventListener("click", () => {
  const name = gemNameInput.value.trim();

  if (!name) {
    showInlineError("Gem名を入力してください");
    return;
  }

  if (!selectedImage) {
    showInlineError("画像を選んでください");
    return;
  }

  const nextGem = { name, image: selectedImage };
  const existingIndex = settings.gems.findIndex((gem) => gem.name.toLowerCase() === name.toLowerCase());

  if (existingIndex >= 0) {
    settings.gems[existingIndex] = nextGem;
  } else {
    settings.gems.push(nextGem);
  }

  gemNameInput.value = "";
  imageFileInput.value = "";
  selectedImage = "";
  preview.style.backgroundImage = "";
  saveSettings();
});

clearAllButton.addEventListener("click", () => {
  settings.gems = [];
  saveSettings();
});

gemList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove]");
  if (!button) return;

  settings.gems = settings.gems.filter((gem) => gem.name !== button.dataset.remove);
  saveSettings();
});

function loadSettings() {
  chrome.storage.local.get(STORAGE_KEY, (result) => {
    settings = normalizeSettings(result[STORAGE_KEY]);
    render();
  });
}

function saveSettings() {
  chrome.storage.local.set({ [STORAGE_KEY]: settings }, render);
}

function normalizeSettings(value) {
  if (!value || typeof value !== "object") return { enabled: true, gems: [] };

  return {
    enabled: value.enabled !== false,
    gems: Array.isArray(value.gems)
      ? value.gems.filter((gem) => gem?.name && gem?.image)
      : []
  };
}

function render() {
  enabledInput.checked = settings.enabled;
  gemList.innerHTML = "";
  emptyState.hidden = settings.gems.length > 0;
  clearAllButton.disabled = settings.gems.length === 0;

  for (const gem of settings.gems) {
    const item = document.createElement("li");
    const thumb = document.createElement("div");
    const name = document.createElement("div");
    const remove = document.createElement("button");

    thumb.className = "thumb";
    thumb.style.backgroundImage = `url("${gem.image}")`;
    name.className = "name";
    name.textContent = gem.name;
    remove.className = "remove";
    remove.type = "button";
    remove.textContent = "削除";
    remove.title = `${gem.name}を削除`;
    remove.dataset.remove = gem.name;

    item.append(thumb, name, remove);
    gemList.append(item);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function showInlineError(message) {
  saveGemButton.textContent = message;
  saveGemButton.disabled = true;

  window.setTimeout(() => {
    saveGemButton.textContent = SAVE_BUTTON_LABEL;
    saveGemButton.disabled = false;
  }, 1500);
}
