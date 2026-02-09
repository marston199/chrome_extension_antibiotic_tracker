const STORAGE_KEY = "trackers";
const BATCH_SIZE = 8;
const DIALOG_ID = "abx-tracker-dialog";
const TOOLBAR_BTN_ID = "abx-tracker-toolbar-button";
let lastEditorSelectionContext = null;

const WEEKDAY_COLORS = {
  0: "#f9d5e5",
  1: "#d9e8ff",
  2: "#d6f5d6",
  3: "#fff8bf",
  4: "#e7d8ff",
  5: "#ffe5cc",
  6: "#ececec"
};

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "OPEN_TRACKER_DIALOG") {
    captureEditorSelectionContext();
    openTrackerDialog();
  }
});

window.addEventListener("focus", () => {
  injectToolbarEntry();
  runDailyUpdates();
});

document.addEventListener("DOMContentLoaded", () => {
  retryToolbarInjection();
  setTimeout(runDailyUpdates, 250);
});

scheduleMidnightRefresh();

function retryToolbarInjection() {
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    const inserted = injectToolbarEntry();
    if (inserted || attempts >= 40) {
      clearInterval(timer);
    }
  }, 500);
}

function injectToolbarEntry() {
  if (window.top !== window) {
    return false;
  }

  if (document.getElementById(TOOLBAR_BTN_ID)) {
    return true;
  }

  const menubar = document.querySelector("#docs-menubar") || document.querySelector("[role='menubar']");
  if (!menubar) {
    return false;
  }

  const template = menubar.querySelector("[role='menuitem']");
  const button = document.createElement("div");
  button.id = TOOLBAR_BTN_ID;
  button.setAttribute("role", "menuitem");
  button.setAttribute("tabindex", "0");
  button.setAttribute("aria-haspopup", "false");
  button.setAttribute("aria-label", "Antibiotic Tracker");
  if (template?.className) {
    button.className = template.className;
  }
  button.textContent = "Antibiotic Tracker";
  button.style.cursor = "pointer";
  button.style.userSelect = "none";

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    captureEditorSelectionContext();
    openTrackerDialog();
  });

  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      captureEditorSelectionContext();
      openTrackerDialog();
    }
  });

  menubar.appendChild(button);
  return true;
}

function scheduleMidnightRefresh() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(0, 0, 2, 0);
  const delay = tomorrow.getTime() - now.getTime();
  setTimeout(() => {
    runDailyUpdates();
    scheduleMidnightRefresh();
  }, delay);
}

function toIsoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value) {
  return new Date(`${value}T00:00:00`);
}

function computeDayNumber(startDateIso, todayIso = toIsoDate()) {
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = Math.floor((parseIsoDate(todayIso) - parseIsoDate(startDateIso)) / dayMs);
  return Math.max(1, diff + 1);
}

function plannedDays(startIso, stopIso) {
  if (!stopIso) {
    return null;
  }

  return Math.max(1, computeDayNumber(startIso, stopIso));
}

function formatShortDate(isoDate) {
  return parseIsoDate(isoDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function buildTrackerLine(tracker, todayIso = toIsoDate()) {
  const day = computeDayNumber(tracker.startDate, todayIso);
  const total = tracker.stopDate ? plannedDays(tracker.startDate, tracker.stopDate) : null;
  const intervalPart = tracker.dosingInterval ? ` ${tracker.dosingInterval}` : "";
  const dayPart = total ? `Day ${day}/${total}` : `Day ${day}`;

  const suffix = tracker.stopDate
    ? `(started ${formatShortDate(tracker.startDate)} → stop ${formatShortDate(tracker.stopDate)})`
    : `(started ${formatShortDate(tracker.startDate)})`;

  return `${tracker.antibioticName}${intervalPart} — ${dayPart} ${suffix}`;
}

function getWeekday(isoDate = toIsoDate()) {
  return parseIsoDate(isoDate).getDay();
}

function uuid() {
  return crypto.randomUUID();
}

function extractDocumentId() {
  const match = window.location.pathname.match(/\/document\/d\/([^/]+)/);
  return match ? match[1] : "unknown-doc";
}

async function getTrackers() {
  const { [STORAGE_KEY]: trackers = [] } = await chrome.storage.local.get(STORAGE_KEY);
  return trackers;
}

async function saveTrackers(trackers) {
  await chrome.storage.local.set({ [STORAGE_KEY]: trackers });
}

async function upsertTracker(tracker) {
  const trackers = await getTrackers();
  const index = trackers.findIndex((item) => item.trackerId === tracker.trackerId);
  if (index >= 0) {
    trackers[index] = tracker;
  } else {
    trackers.push(tracker);
  }

  await saveTrackers(trackers);
}

async function patchTracker(trackerId, patch) {
  const trackers = await getTrackers();
  const index = trackers.findIndex((item) => item.trackerId === trackerId);
  if (index < 0) {
    return;
  }

  trackers[index] = { ...trackers[index], ...patch };
  await saveTrackers(trackers);
}

function isEditorRange(range) {
  const container = range.startContainer.nodeType === 1
    ? range.startContainer
    : range.startContainer.parentElement;

  return Boolean(container?.closest("[role='paragraph'], .kix-lineview, .kix-appview-editor"));
}

function captureEditorSelectionContext() {
  const context = findActiveSelectionContext(window, { editorOnly: true });
  if (!context) {
    return null;
  }

  const liveRange = context.range;
  const clonedRange = context.document.createRange();
  clonedRange.setStart(liveRange.startContainer, liveRange.startOffset);
  clonedRange.setEnd(liveRange.endContainer, liveRange.endOffset);

  lastEditorSelectionContext = {
    ...context,
    range: clonedRange
  };

  return lastEditorSelectionContext;
}

function openTrackerDialog() {
  const dialogSelectionContext = captureEditorSelectionContext() || lastEditorSelectionContext;
  document.getElementById(DIALOG_ID)?.remove();
  const wrapper = document.createElement("div");
  wrapper.id = DIALOG_ID;
  wrapper.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.25);z-index:2147483647;display:grid;place-items:center;";
  wrapper.innerHTML = `
    <form style="background:#fff;padding:16px;border-radius:10px;min-width:320px;font-family:Arial,sans-serif;display:grid;gap:8px;">
      <label>Antibiotic name* <input name="antibioticName" required placeholder="Ampicillin 2 g IV" autofocus style="width:100%"></label>
      <label>Start date* <input name="startDate" type="date" required value="${toIsoDate()}"></label>
      <label>Dosing interval <select name="dosingInterval"><option value="">None</option><option>q6h</option><option>q8h</option><option>q12h</option><option>q24h</option></select></label>
      <label>Planned stop date <input name="stopDate" type="date"></label>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
        <button type="button" data-cancel>Cancel</button>
        <button type="submit">Insert</button>
      </div>
    </form>
  `;

  wrapper.querySelector("[data-cancel]").addEventListener("click", () => wrapper.remove());
  wrapper.addEventListener("click", (event) => {
    if (event.target === wrapper) {
      wrapper.remove();
    }
  });

  wrapper.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const tracker = {
      trackerId: uuid(),
      documentId: extractDocumentId(),
      paragraphAnchor: "",
      textRange: { startOffset: 0, length: 0 },
      antibioticName: String(formData.get("antibioticName") || "").trim(),
      startDate: String(formData.get("startDate") || ""),
      dosingInterval: String(formData.get("dosingInterval") || "") || null,
      stopDate: String(formData.get("stopDate") || "") || null,
      totalPlannedDays: null,
      lastUpdatedDate: null,
      lastAppliedWeekday: null,
      createdAt: new Date().toISOString(),
      status: "active"
    };

    if (!tracker.antibioticName || !tracker.startDate) {
      return;
    }

    const inserted = insertTrackerLine(tracker, dialogSelectionContext);
    if (!inserted) {
      return;
    }

    await upsertTracker(tracker);
    wrapper.remove();
  });

  document.body.appendChild(wrapper);
}

function findActiveSelectionContext(rootWindow = window, options = {}) {
  const queue = [rootWindow];

  while (queue.length) {
    const currentWindow = queue.shift();

    let selection;
    try {
      selection = currentWindow.getSelection();
    } catch (_error) {
      selection = null;
    }

    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (range && range.startContainer) {
        if (options.editorOnly && !isEditorRange(range)) {
          // Skip non-editor selections (e.g., dialog form fields).
        } else {
          return {
            selection,
            range,
            document: currentWindow.document
          };
        }
      }
    }

    for (const frame of currentWindow.frames) {
      try {
        const frameDocument = frame.document;
        if (frameDocument) {
          queue.push(frame);
        }
      } catch (_error) {
        // Ignore cross-origin frames.
      }
    }
  }

  return null;
}

function insertTrackerLine(tracker, preferredSelectionContext = null) {
  const selectionContext = preferredSelectionContext || lastEditorSelectionContext || findActiveSelectionContext(window, { editorOnly: true });
  if (!selectionContext) {
    return false;
  }

  const { selection, range, document: targetDocument } = selectionContext;

  const container = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer
    : range.startContainer.parentElement;
  const anchorParagraph = container?.closest("[role='paragraph'], p, div");

  const paragraphId = anchorParagraph?.dataset.abxParagraphId || uuid();
  if (anchorParagraph) {
    anchorParagraph.dataset.abxParagraphId = paragraphId;
  }

  const line = buildTrackerLine(tracker);
  const span = targetDocument.createElement("span");
  span.dataset.abxTrackerId = tracker.trackerId;
  span.textContent = line;
  span.style.backgroundColor = WEEKDAY_COLORS[getWeekday()];
  span.style.padding = "0 2px";

  range.deleteContents();
  range.insertNode(span);

  const trailingBreak = targetDocument.createTextNode("\n");
  range.setStartAfter(span);
  range.setEndAfter(span);
  range.insertNode(trailingBreak);

  selection.removeAllRanges();
  const cursorRange = targetDocument.createRange();
  cursorRange.setStartAfter(trailingBreak);
  cursorRange.collapse(true);
  selection.addRange(cursorRange);

  tracker.paragraphAnchor = paragraphId;
  tracker.textRange = { startOffset: 0, length: line.length };
  tracker.lastUpdatedDate = toIsoDate();
  tracker.lastAppliedWeekday = getWeekday();
  return true;
}


async function runDailyUpdates() {
  const docId = extractDocumentId();
  const trackers = (await getTrackers()).filter((tracker) => tracker.documentId === docId && tracker.status === "active");
  if (!trackers.length) {
    return;
  }

  const todayIso = toIsoDate();
  for (let i = 0; i < trackers.length; i += BATCH_SIZE) {
    const batch = trackers.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((tracker) => refreshTracker(tracker, todayIso)));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function refreshTracker(tracker, todayIso) {
  const weekday = getWeekday(todayIso);
  if (tracker.lastUpdatedDate === todayIso && tracker.lastAppliedWeekday === weekday) {
    return;
  }

  const paragraph = document.querySelector(`[data-abx-paragraph-id="${tracker.paragraphAnchor}"]`);
  const node = paragraph?.querySelector(`[data-abx-tracker-id="${tracker.trackerId}"]`);
  if (!node) {
    await patchTracker(tracker.trackerId, { status: "inactive" });
    return;
  }

  const expected = buildTrackerLine(tracker, todayIso);
  if (node.textContent !== expected) {
    if (!node.textContent.includes("Day ")) {
      await patchTracker(tracker.trackerId, { status: "detached" });
      return;
    }

    node.textContent = expected;
  }

  const nextColor = WEEKDAY_COLORS[weekday];
  if (node.style.backgroundColor !== nextColor) {
    node.style.backgroundColor = nextColor;
  }

  await patchTracker(tracker.trackerId, {
    textRange: { ...tracker.textRange, length: expected.length },
    totalPlannedDays: tracker.stopDate ? Number(expected.match(/Day \d+\/(\d+)/)?.[1] || 0) || null : null,
    lastUpdatedDate: todayIso,
    lastAppliedWeekday: weekday
  });
}
