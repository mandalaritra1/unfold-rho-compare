const state = {
  manifest: null,
  items: [],
  filtered: [],
  selectedPath: null,
  mode: "side",
  shortcut: "important",
};

const els = {
  summary: document.getElementById("summary"),
  leftVersion: document.getElementById("left-version"),
  rightVersion: document.getElementById("right-version"),
  filter: document.getElementById("filter"),
  shortcuts: Array.from(document.querySelectorAll(".shortcut")),
  modes: Array.from(document.querySelectorAll(".mode")),
  opacity: document.getElementById("opacity"),
  swipe: document.getElementById("swipe"),
  diffGain: document.getElementById("diff-gain"),
  plotCount: document.getElementById("plot-count"),
  plotList: document.getElementById("plot-list"),
  plotTitle: document.getElementById("plot-title"),
  plotPath: document.getElementById("plot-path"),
  compareLegend: document.getElementById("compare-legend"),
  warning: document.getElementById("warning"),
  stage: document.getElementById("stage"),
  leftCaption: document.getElementById("left-caption"),
  rightCaption: document.getElementById("right-caption"),
  leftImg: document.getElementById("left-img"),
  rightImg: document.getElementById("right-img"),
  overlayLeft: document.getElementById("overlay-left"),
  overlayRight: document.getElementById("overlay-right"),
  swipeLeft: document.getElementById("swipe-left"),
  swipeRight: document.getElementById("swipe-right"),
  swipeMask: document.getElementById("swipe-mask"),
  swipeLine: document.getElementById("swipe-line"),
  diffCanvas: document.getElementById("diff-canvas"),
};

const SHORTCUTS = {
  all: {
    label: "All",
    match: () => true,
  },
  response: {
    label: "Response",
    match: (path) => path.includes("unfold/response_"),
  },
  inputs: {
    label: "Inputs",
    match: (path) => /^input_(groomed|ungroomed)_/.test(path),
  },
  unfolded: {
    label: "Unfolded",
    match: (path) => (
      path.startsWith("bottom_line_")
      || path.includes("unfold/groomed_")
      || path.includes("unfold/ungroomed_")
      || path.includes("unfold/unfolded_basic_")
    ),
  },
  unc_grouped: {
    label: "Unc grouped",
    match: (path) => path.includes("uncertainties/summary_grouped"),
  },
  unc_ungrouped: {
    label: "Unc ungrouped",
    match: (path) => (
      path.includes("uncertainties/summary_")
      && !path.includes("uncertainties/summary_grouped")
    ),
  },
};

const INPUT_PT_LABELS = {
  "0": "0-200 GeV",
  "1": "200-290 GeV",
  "2": "290-400 GeV",
  "3": "400-inf GeV",
};

const SHIFTED_PT_LABELS = {
  "-1": "0-200 GeV",
  "0": "200-290 GeV",
  "1": "290-400 GeV",
  "2": "400-inf GeV",
};

function formatPtBin(raw, path) {
  const labels = path.startsWith("input_") ? INPUT_PT_LABELS : SHIFTED_PT_LABELS;
  return labels[raw] || `pT bin ${raw}`;
}

SHORTCUTS.important = {
  label: "Important",
  match: (path) => (
    SHORTCUTS.response.match(path)
    || SHORTCUTS.inputs.match(path)
    || SHORTCUTS.unfolded.match(path)
    || SHORTCUTS.unc_grouped.match(path)
    || SHORTCUTS.unc_ungrouped.match(path)
  ),
};

function normalizeManifest(raw) {
  const versions = raw.versions || ["original", "fixed_jec"];
  const plots = raw.plots || [];
  return { ...raw, versions, plots };
}

function titleFromPath(path) {
  const file = path.split("/").pop() || path;
  let title = file.replace(/\.png$/i, "").replaceAll("_", " ");
  title = title.replace(/ (-?\d+)$/, (_, bin) => `, ${formatPtBin(bin, path)}`);
  title = title.replace(/ pt(-?\d+)$/, (_, bin) => `, ${formatPtBin(bin, path)}`);
  return title;
}

function folderFromPath(path) {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/") || ".";
}

function pathFor(item, version) {
  return item.files?.[version] || null;
}

function populateVersions() {
  for (const select of [els.leftVersion, els.rightVersion]) {
    select.innerHTML = "";
    for (const version of state.manifest.versions) {
      const option = document.createElement("option");
      option.value = version;
      option.textContent = version;
      select.append(option);
    }
  }
  els.leftVersion.value = state.manifest.versions[0] || "original";
  els.rightVersion.value = state.manifest.versions[1] || state.manifest.versions[0] || "fixed_jec";
}

function currentItem() {
  return state.items.find((item) => item.path === state.selectedPath) || null;
}

function applyFilter() {
  const term = els.filter.value.trim().toLowerCase();
  const shortcut = SHORTCUTS[state.shortcut] || SHORTCUTS.important;
  state.filtered = state.items.filter((item) => {
    const text = `${item.path} ${item.folder} ${item.name}`.toLowerCase();
    return shortcut.match(item.path) && (!term || text.includes(term));
  });
  renderList();
  if (!state.filtered.some((item) => item.path === state.selectedPath)) {
    selectPlot(state.filtered[0]?.path || null);
  }
}

function renderList() {
  els.plotList.innerHTML = "";
  const shortcut = SHORTCUTS[state.shortcut] || SHORTCUTS.important;
  els.plotCount.textContent = `${state.filtered.length} ${shortcut.label.toLowerCase()} plots`;
  for (const item of state.filtered) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = item.path === state.selectedPath ? "active" : "";
    button.innerHTML = `${item.name}<span class="path">${item.folder}</span>`;
    button.addEventListener("click", () => selectPlot(item.path));
    els.plotList.append(button);
  }
}

function setImage(img, src, alt) {
  img.removeAttribute("src");
  img.alt = alt;
  if (src) {
    img.src = src;
  }
}

function missingMessage(item, leftVersion, rightVersion) {
  const missing = [];
  if (!pathFor(item, leftVersion)) missing.push(leftVersion);
  if (!pathFor(item, rightVersion)) missing.push(rightVersion);
  return missing.length ? `Missing image for: ${missing.join(", ")}` : "";
}

function selectPlot(path) {
  state.selectedPath = path;
  renderList();
  updateViewer();
}

function updateViewer() {
  const item = currentItem();
  const leftVersion = els.leftVersion.value;
  const rightVersion = els.rightVersion.value;
  els.leftCaption.textContent = leftVersion;
  els.rightCaption.textContent = rightVersion;

  if (!item) {
    els.plotTitle.textContent = "No plot selected";
    els.plotPath.textContent = "";
    els.compareLegend.textContent = "";
    clearImages();
    return;
  }

  const leftSrc = pathFor(item, leftVersion);
  const rightSrc = pathFor(item, rightVersion);
  els.plotTitle.textContent = item.name;
  els.plotPath.textContent = item.path;
  els.compareLegend.innerHTML = (
    `<span class="legend-swatch left"></span>${leftVersion} is the base image. `
    + `<span class="legend-swatch right"></span>${rightVersion} is the blue-tinted overlay/swipe layer.`
  );
  setImage(els.leftImg, leftSrc, `${leftVersion} ${item.path}`);
  setImage(els.rightImg, rightSrc, `${rightVersion} ${item.path}`);
  setImage(els.overlayLeft, leftSrc, `${leftVersion} ${item.path}`);
  setImage(els.overlayRight, rightSrc, `${rightVersion} ${item.path}`);
  setImage(els.swipeLeft, leftSrc, `${leftVersion} ${item.path}`);
  setImage(els.swipeRight, rightSrc, `${rightVersion} ${item.path}`);
  updateControls();

  const missing = missingMessage(item, leftVersion, rightVersion);
  if (missing) {
    showWarning(missing);
  } else {
    hideWarning();
  }

  Promise.all([decodeImage(els.leftImg), decodeImage(els.rightImg)])
    .then(() => {
      updateSwipeWidth();
      checkDimensions();
      if (state.mode === "diff") drawDiff();
    })
    .catch(() => {
      if (!missing) showWarning("Unable to load one or both images for this pair.");
    });
}

function clearImages() {
  for (const img of [els.leftImg, els.rightImg, els.overlayLeft, els.overlayRight, els.swipeLeft, els.swipeRight]) {
    img.removeAttribute("src");
    img.alt = "";
  }
  const ctx = els.diffCanvas.getContext("2d");
  ctx.clearRect(0, 0, els.diffCanvas.width, els.diffCanvas.height);
}

function decodeImage(img) {
  if (!img.src) return Promise.reject(new Error("missing image"));
  if (img.complete && img.naturalWidth) return Promise.resolve();
  if (img.decode) return img.decode();
  return new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });
}

function showWarning(message) {
  els.warning.textContent = message;
  els.warning.hidden = false;
}

function hideWarning() {
  els.warning.hidden = true;
  els.warning.textContent = "";
}

function checkDimensions() {
  if (!els.leftImg.naturalWidth || !els.rightImg.naturalWidth) return;
  const same = els.leftImg.naturalWidth === els.rightImg.naturalWidth
    && els.leftImg.naturalHeight === els.rightImg.naturalHeight;
  if (!same) {
    showWarning(
      `Image dimensions differ: ${els.leftImg.naturalWidth}x${els.leftImg.naturalHeight} vs ` +
      `${els.rightImg.naturalWidth}x${els.rightImg.naturalHeight}. Diff uses the overlapping region.`
    );
  } else if (!missingMessage(currentItem(), els.leftVersion.value, els.rightVersion.value)) {
    hideWarning();
  }
}

function updateControls() {
  els.stage.dataset.mode = state.mode;
  els.overlayRight.style.opacity = String(Number(els.opacity.value) / 100);
  const swipeValue = Number(els.swipe.value);
  els.swipeMask.style.setProperty("--swipe-pos", `${swipeValue}%`);
  els.swipeLine.style.left = `${swipeValue}%`;
}

function updateSwipeWidth() {
  updateControls();
}

function drawDiff() {
  const item = currentItem();
  if (!item || !els.leftImg.naturalWidth || !els.rightImg.naturalWidth) return;

  const width = Math.min(els.leftImg.naturalWidth, els.rightImg.naturalWidth);
  const height = Math.min(els.leftImg.naturalHeight, els.rightImg.naturalHeight);
  const gain = Number(els.diffGain.value);
  els.diffCanvas.width = width;
  els.diffCanvas.height = height;

  const workLeft = document.createElement("canvas");
  const workRight = document.createElement("canvas");
  workLeft.width = workRight.width = width;
  workLeft.height = workRight.height = height;
  const leftCtx = workLeft.getContext("2d", { willReadFrequently: true });
  const rightCtx = workRight.getContext("2d", { willReadFrequently: true });
  leftCtx.drawImage(els.leftImg, 0, 0, width, height);
  rightCtx.drawImage(els.rightImg, 0, 0, width, height);

  const left = leftCtx.getImageData(0, 0, width, height);
  const right = rightCtx.getImageData(0, 0, width, height);
  const out = leftCtx.createImageData(width, height);
  const whiteCut = 245;
  const deltaCut = 10;
  for (let i = 0; i < left.data.length; i += 4) {
    const leftWhite = left.data[i] > whiteCut && left.data[i + 1] > whiteCut && left.data[i + 2] > whiteCut;
    const rightWhite = right.data[i] > whiteCut && right.data[i + 1] > whiteCut && right.data[i + 2] > whiteCut;
    const dr = Math.abs(left.data[i] - right.data[i]);
    const dg = Math.abs(left.data[i + 1] - right.data[i + 1]);
    const db = Math.abs(left.data[i + 2] - right.data[i + 2]);
    const delta = Math.max(dr, dg, db);
    if ((leftWhite && rightWhite) || delta < deltaCut) {
      out.data[i] = 255;
      out.data[i + 1] = 255;
      out.data[i + 2] = 255;
    } else {
      const intensity = Math.min(255, delta * gain);
      out.data[i] = 255;
      out.data[i + 1] = 255 - intensity;
      out.data[i + 2] = Math.max(40, 255 - Math.floor(intensity * 0.35));
    }
    out.data[i + 3] = 255;
  }
  els.diffCanvas.getContext("2d").putImageData(out, 0, 0);
}

function setMode(mode) {
  state.mode = mode;
  for (const button of els.modes) {
    button.classList.toggle("active", button.dataset.mode === mode);
  }
  updateControls();
  if (mode === "diff") drawDiff();
}

function setShortcut(shortcut) {
  state.shortcut = shortcut;
  for (const button of els.shortcuts) {
    button.classList.toggle("active", button.dataset.shortcut === shortcut);
  }
  applyFilter();
}

async function init() {
  try {
    const response = await fetch("manifest.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
    state.manifest = normalizeManifest(await response.json());
  } catch (error) {
    els.summary.textContent = "Could not load manifest.json.";
    showWarning(error.message);
    return;
  }

  state.items = state.manifest.plots.map((item) => ({
    ...item,
    name: titleFromPath(item.path),
    folder: item.folder || folderFromPath(item.path),
  })).sort((a, b) => a.path.localeCompare(b.path));
  populateVersions();
  els.summary.textContent = `${state.items.length} plot entries from ${state.manifest.generated_at || "manifest"}`;
  applyFilter();
}

els.filter.addEventListener("input", applyFilter);
for (const button of els.shortcuts) {
  button.addEventListener("click", () => setShortcut(button.dataset.shortcut));
}
els.leftVersion.addEventListener("change", updateViewer);
els.rightVersion.addEventListener("change", updateViewer);
els.opacity.addEventListener("input", updateControls);
els.swipe.addEventListener("input", updateControls);
els.diffGain.addEventListener("input", () => {
  if (state.mode === "diff") drawDiff();
});
window.addEventListener("resize", updateSwipeWidth);
for (const button of els.modes) {
  button.addEventListener("click", () => setMode(button.dataset.mode));
}

init();
