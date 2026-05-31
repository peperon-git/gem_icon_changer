const STORAGE_KEY = "gemIconCustomizerSettings";
const SCAN_DELAY_MS = 250;

let settings = { enabled: true, gems: [] };
let scanTimer = null;

chrome.storage.local.get(STORAGE_KEY, (result) => {
  settings = normalizeSettings(result[STORAGE_KEY]);
  scheduleScan();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEY]) return;
  settings = normalizeSettings(changes[STORAGE_KEY].newValue);
  clearCustomIcons();
  scheduleScan();
});

const observer = new MutationObserver(() => scheduleScan());
observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

function normalizeSettings(value) {
  if (!value || typeof value !== "object") return { enabled: true, gems: [] };

  return {
    enabled: value.enabled !== false,
    gems: Array.isArray(value.gems)
      ? value.gems
          .map((gem) => ({
            name: String(gem.name || "").trim(),
            image: String(gem.image || "").trim()
          }))
          .filter((gem) => gem.name && gem.image)
      : []
  };
}

function scheduleScan() {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(applyCustomIcons, SCAN_DELAY_MS);
}

function applyCustomIcons() {
  clearCustomIcons();
  if (!settings.enabled || settings.gems.length === 0) return;

  for (const gem of settings.gems) {
    applyIconsNearGemLabels(gem);

    if (isGemOpenInEditor(gem.name) || isGemOpenOnDetailPage(gem.name)) {
      applyMainGemIcon(gem);
      applyVisibleGemPageBotLogos(gem);
    }
  }
}

function clearCustomIcons() {
  document.querySelectorAll(".gem-icon-customizer-target").forEach((element) => {
    element.classList.remove("gem-icon-customizer-target");
    element.style.removeProperty("--gem-icon-customizer-image");
    restoreBotLogoVariables(element);

    if (element instanceof HTMLImageElement && element.dataset.gemIconCustomizerOriginalSrc) {
      element.src = element.dataset.gemIconCustomizerOriginalSrc;
      delete element.dataset.gemIconCustomizerOriginalSrc;
    }

    delete element.dataset.gemIconCustomizerName;
  });
}

function findTextNodes(gemName) {
  const matches = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.textContent?.trim();
      if (!text || text.length > 120) return NodeFilter.FILTER_REJECT;
      return text === gemName ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });

  while (walker.nextNode()) {
    const parent = walker.currentNode.parentElement;
    if (parent && isVisible(parent)) matches.push(parent);
  }

  return matches;
}

function applyIconsNearGemLabels(gem) {
  const labels = findTextNodes(gem.name);

  for (const label of labels) {
    const row = findGemContainer(label);
    if (!row || isNavigationControl(row)) continue;

    const icon = findIconCandidate(row, label);
    if (icon) applyImageToElement(icon, gem);
  }
}

function applyMainGemIcon(gem) {
  const candidates = [...document.querySelectorAll("main bot-logo, main img, main svg, main mat-icon, main [class*='icon'], main [class*='avatar'], main [class*='gem']")]
    .filter((element) => isGemIconCandidate(element, { large: true }))
    .sort((a, b) => scoreMainGemIcon(b) - scoreMainGemIcon(a));

  if (candidates[0]) applyImageToElement(candidates[0], gem);
}

function applyVisibleGemPageBotLogos(gem) {
  const botLogos = [...document.querySelectorAll("main bot-logo")]
    .filter((element) => isGemIconCandidate(element, { includeSmall: true }));

  for (const botLogo of botLogos) {
    applyImageToElement(botLogo, gem);
  }
}

function findGemContainer(label) {
  let current = label;

  for (let depth = 0; current && depth < 7; depth += 1) {
    if (current.matches("a, button, [role='button'], [role='menuitem'], li, mat-list-item") && !isNavigationControl(current)) {
      return current;
    }

    const candidate = current.closest("a, button, [role='button'], [role='menuitem'], li, mat-list-item");
    if (candidate && !isNavigationControl(candidate)) return candidate;

    current = current.parentElement;
  }

  return label.parentElement;
}

function findIconCandidate(container, label) {
  const candidates = [
    ...container.querySelectorAll("bot-logo, img, svg, mat-icon, [class*='icon'], [class*='avatar'], [class*='gem']")
  ]
    .filter((element) => element !== label && isGemIconCandidate(element))
    .sort((a, b) => scoreIconCandidate(b, label) - scoreIconCandidate(a, label));

  return candidates[0] || null;
}

function applyImageToElement(element, gem) {
  storeBotLogoVariables(element);
  element.classList.add("gem-icon-customizer-target");
  element.style.setProperty("--gem-icon-customizer-image", `url("${cssUrl(gem.image)}")`);
  element.dataset.gemIconCustomizerName = gem.name;

  if (element.matches("bot-logo")) {
    element.style.setProperty("--bot-logo-bg", "transparent");
    element.style.setProperty("--bot-logo-border", "transparent");
    element.style.setProperty("--bot-logo-text", "transparent");
  }

  if (element instanceof HTMLImageElement) {
    if (!element.dataset.gemIconCustomizerOriginalSrc) {
      element.dataset.gemIconCustomizerOriginalSrc = element.currentSrc || element.src;
    }

    element.src = gem.image;
    element.srcset = "";
  }
}

function storeBotLogoVariables(element) {
  if (!element.matches("bot-logo") || element.dataset.gemIconCustomizerStoredVars) return;

  element.dataset.gemIconCustomizerStoredVars = JSON.stringify({
    bg: element.style.getPropertyValue("--bot-logo-bg"),
    border: element.style.getPropertyValue("--bot-logo-border"),
    text: element.style.getPropertyValue("--bot-logo-text")
  });
}

function restoreBotLogoVariables(element) {
  if (!element.matches("bot-logo") || !element.dataset.gemIconCustomizerStoredVars) return;

  const values = JSON.parse(element.dataset.gemIconCustomizerStoredVars);
  restoreStyleProperty(element, "--bot-logo-bg", values.bg);
  restoreStyleProperty(element, "--bot-logo-border", values.border);
  restoreStyleProperty(element, "--bot-logo-text", values.text);
  delete element.dataset.gemIconCustomizerStoredVars;
}

function restoreStyleProperty(element, property, value) {
  if (value) {
    element.style.setProperty(property, value);
  } else {
    element.style.removeProperty(property);
  }
}

function scoreIconCandidate(element, label) {
  const rect = element.getBoundingClientRect();
  const labelRect = label.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const distance = Math.abs(rect.left - labelRect.left) + Math.abs(rect.top - labelRect.top);
  let score = 0;

  if (element.matches("bot-logo")) score += 120;
  if (size >= 16 && size <= 72) score += 50;
  if (rect.left <= labelRect.left) score += 25;
  if (element.matches("img, svg, mat-icon")) score += 20;
  if (/icon|avatar|gem/i.test(element.className?.toString() || "")) score += 15;
  if (isNavigationControl(element)) score -= 200;

  return score - distance / 10;
}

function scoreMainGemIcon(element) {
  const rect = element.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  let score = size;

  if (element.matches("bot-logo")) score += 140;
  if (size >= 40 && size <= 120) score += 80;
  if (rect.top < 140) score -= 60;
  if (rect.left < 96) score -= 40;
  if (element.matches("img")) score += 15;
  if (/gem|avatar|icon/i.test(element.className?.toString() || "")) score += 20;
  if (isNavigationControl(element)) score -= 300;

  return score;
}

function isGemOpenInEditor(gemName) {
  const fields = document.querySelectorAll("input, textarea, [contenteditable='true']");

  return [...fields].some((field) => {
    if (!isVisible(field)) return false;
    const value = "value" in field ? field.value : field.textContent;
    return value?.trim() === gemName;
  });
}

function isGemOpenOnDetailPage(gemName) {
  const headings = document.querySelectorAll("h1, h2, [role='heading']");

  return [...headings].some((heading) => {
    return isVisible(heading) && heading.textContent?.trim() === gemName;
  });
}

function isGemIconCandidate(element, options = {}) {
  if (!isVisible(element) || isNavigationControl(element)) return false;
  if (!element.matches("bot-logo") && element.closest("header, nav, [role='navigation']")) return false;
  if (element.closest("input, textarea, select")) return false;

  const rect = element.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const min = options.includeSmall ? 8 : options.large ? 28 : 14;
  const max = options.large ? 180 : 96;

  if (element.matches("bot-logo")) return size >= min && size <= max;

  return size >= min && size <= max;
}

function isNavigationControl(element) {
  const control = element.closest("button, a, [role='button']");
  if (!control) return false;

  const label = [
    control.getAttribute("aria-label"),
    control.getAttribute("title"),
    control.textContent,
    element.textContent
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!label) return false;

  return /\b(back|arrow_back|close|menu|navigation)\b|戻る|閉じる|メニュー|ナビゲーション/i.test(label);
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function cssUrl(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "");
}
