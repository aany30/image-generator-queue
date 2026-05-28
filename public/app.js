const maxImages = 10;
const storageKey = "imagePromptAutomator.settings.v1";
const samplePrompt = "Edit this image into a premium brand campaign visual. Preserve the main subject from the uploaded image, use polished studio lighting, sharp product detail, elegant composition, and keep the result realistic.";

const state = {
  items: [],
  running: false
};

const els = {
  prompt: document.querySelector("#prompt"),
  promptCount: document.querySelector("#promptCount"),
  samplePrompt: document.querySelector("#samplePrompt"),
  model: document.querySelector("#model"),
  size: document.querySelector("#size"),
  quality: document.querySelector("#quality"),
  generateBtn: document.querySelector("#generateBtn"),
  retryFailedBtn: document.querySelector("#retryFailedBtn"),
  clearCompletedBtn: document.querySelector("#clearCompletedBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  browseBtn: document.querySelector("#browseBtn"),
  imageInput: document.querySelector("#imageInput"),
  dropZone: document.querySelector("#dropZone"),
  imageGrid: document.querySelector("#imageGrid"),
  queueMeta: document.querySelector("#queueMeta"),
  totalCount: document.querySelector("#totalCount"),
  waitingCount: document.querySelector("#waitingCount"),
  completedCount: document.querySelector("#completedCount"),
  failedCount: document.querySelector("#failedCount"),
  statusPill: document.querySelector("#statusPill"),
  template: document.querySelector("#imageCardTemplate")
};

function getQueueCounts() {
  return state.items.reduce((counts, item) => {
    counts.total += 1;
    if (item.status === "done") counts.completed += 1;
    else if (item.status === "error") counts.failed += 1;
    else if (item.status === "loading") counts.processing += 1;
    else counts.waiting += 1;
    return counts;
  }, { total: 0, waiting: 0, completed: 0, failed: 0, processing: 0 });
}

function setStatus(text) {
  els.statusPill.textContent = text;
}

function saveSettings() {
  const settings = {
    prompt: els.prompt.value,
    model: els.model.value,
    size: els.size.value,
    quality: els.quality.value
  };
  localStorage.setItem(storageKey, JSON.stringify(settings));
}

function restoreSettings() {
  const rawSettings = localStorage.getItem(storageKey);
  if (!rawSettings) return;

  try {
    const settings = JSON.parse(rawSettings);
    if (typeof settings.prompt === "string") els.prompt.value = settings.prompt;
    if (typeof settings.model === "string") els.model.value = settings.model;
    if (typeof settings.size === "string") els.size.value = settings.size;
    if (typeof settings.quality === "string") els.quality.value = settings.quality;
  } catch {
    localStorage.removeItem(storageKey);
  }
}

function updatePromptCount() {
  els.promptCount.textContent = `${els.prompt.value.trim().length} characters`;
  updateActions();
}

function updateActions() {
  const counts = getQueueCounts();
  const hasPrompt = Boolean(els.prompt.value.trim());
  const hasPendingItems = state.items.some((item) => item.status === "waiting" || item.status === "error");

  els.generateBtn.disabled = !hasPendingItems || !hasPrompt || state.running;
  els.retryFailedBtn.hidden = counts.failed === 0;
  els.retryFailedBtn.disabled = state.running || !hasPrompt;
  els.clearCompletedBtn.hidden = counts.completed === 0;
  els.clearCompletedBtn.disabled = state.running;
  els.clearBtn.disabled = counts.total === 0 || state.running;

  els.totalCount.textContent = counts.total;
  els.waitingCount.textContent = counts.waiting;
  els.completedCount.textContent = counts.completed;
  els.failedCount.textContent = counts.failed;

  if (!counts.total) {
    els.queueMeta.textContent = "No images selected";
    return;
  }

  const processingText = counts.processing ? `, ${counts.processing} processing` : "";
  els.queueMeta.textContent = `${counts.total} total, ${counts.completed} completed, ${counts.failed} failed, ${counts.waiting} waiting${processingText}`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function truncateName(name) {
  return name.length > 28 ? `${name.slice(0, 24)}...` : name;
}

function render() {
  els.imageGrid.innerHTML = "";

  state.items.forEach((item, index) => {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const source = node.querySelector(".source-img");
    const result = node.querySelector(".result-img");
    const title = node.querySelector("h3");
    const status = node.querySelector(".card-status");
    const download = node.querySelector(".download-link");

    node.classList.toggle("loading", item.status === "loading");
    node.classList.toggle("done", item.status === "done");
    node.classList.toggle("error", item.status === "error");

    source.src = item.source;
    source.alt = `Source image ${index + 1}`;
    result.alt = `Generated image ${index + 1}`;
    title.textContent = truncateName(item.name);
    status.textContent = item.message;

    if (item.result) {
      result.src = item.result;
      download.href = item.result;
      download.download = `generated-${index + 1}-${item.safeName}.png`;
    }

    els.imageGrid.append(node);
  });

  updateActions();
}

async function addFiles(files) {
  const accepted = Array.from(files).filter((file) => file.type.startsWith("image/"));
  const openSlots = maxImages - state.items.length;
  const nextFiles = accepted.slice(0, openSlots);

  if (!nextFiles.length) {
    setStatus(state.items.length >= maxImages ? "Limit reached" : "No images found");
    return;
  }

  const additions = await Promise.all(nextFiles.map(async (file) => ({
    id: crypto.randomUUID(),
    name: file.name,
    safeName: file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").toLowerCase(),
    source: await fileToDataUrl(file),
    result: "",
    status: "waiting",
    message: "Waiting"
  })));

  state.items.push(...additions);
  setStatus(`${state.items.length}/${maxImages} queued`);
  render();
}

async function requestGeneration(item) {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt: els.prompt.value.trim(),
      imageDataUrl: item.source,
      model: els.model.value,
      size: els.size.value,
      quality: els.quality.value
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Generation failed.");
  }

  return payload.imageDataUrl;
}

async function processQueue(filter) {
  const queue = state.items.filter(filter);
  if (!queue.length) return;

  state.running = true;
  updateActions();

  for (const [queueIndex, item] of queue.entries()) {
    const progress = `${queueIndex + 1} of ${queue.length}`;
    item.status = "loading";
    item.message = `Processing ${progress}`;
    setStatus(`Processing ${progress}`);
    render();

    try {
      item.result = await requestGeneration(item);
      item.status = "done";
      item.message = "Generated";
    } catch (error) {
      item.status = "error";
      item.message = error.message;
    }

    render();
  }

  state.running = false;
  const counts = getQueueCounts();
  setStatus(counts.failed ? `${counts.failed} failed` : "Queue complete");
  updateActions();
}

function startQueue() {
  processQueue((item) => item.status === "waiting" || item.status === "error");
}

function retryFailed() {
  processQueue((item) => item.status === "error");
}

function clearCompleted() {
  state.items = state.items.filter((item) => item.status !== "done");
  setStatus(state.items.length ? "Queue updated" : "Ready");
  render();
}

function clearQueue() {
  state.items = [];
  setStatus("Ready");
  render();
}

function handleSettingChange() {
  saveSettings();
  updatePromptCount();
}

els.browseBtn.addEventListener("click", () => els.imageInput.click());
els.imageInput.addEventListener("change", (event) => {
  addFiles(event.target.files);
  event.target.value = "";
});
els.prompt.addEventListener("input", handleSettingChange);
els.model.addEventListener("change", handleSettingChange);
els.size.addEventListener("change", handleSettingChange);
els.quality.addEventListener("change", handleSettingChange);
els.samplePrompt.addEventListener("click", () => {
  els.prompt.value = samplePrompt;
  handleSettingChange();
});
els.generateBtn.addEventListener("click", startQueue);
els.retryFailedBtn.addEventListener("click", retryFailed);
els.clearCompletedBtn.addEventListener("click", clearCompleted);
els.clearBtn.addEventListener("click", clearQueue);

["dragenter", "dragover"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("dragging");
  });
});

els.dropZone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));

restoreSettings();
updatePromptCount();
render();
