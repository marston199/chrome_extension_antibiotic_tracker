import { BATCH_SIZE, WEEKDAY_COLORS } from "./constants.js";
import { getTrackers, patchTracker, upsertTracker } from "./storage.js";
import { buildTrackerLine, getWeekday, toIsoDate, uuid } from "./utils.js";

const DIALOG_ID = "abx-tracker-dialog";
const TOOLBAR_BTN_ID = "abx-tracker-toolbar-button";

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "OPEN_TRACKER_DIALOG") {
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
    openTrackerDialog();
  });

  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
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

function openTrackerDialog() {
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
      antibioticName: formData.get("antibioticName").toString().trim(),
      startDate: formData.get("startDate").toString(),
      dosingInterval: formData.get("dosingInterval").toString() || null,
      stopDate: formData.get("stopDate").toString() || null,
      totalPlannedDays: null,
      lastUpdatedDate: null,
      lastAppliedWeekday: null,
      createdAt: new Date().toISOString(),
      status: "active"
    };

    if (!tracker.antibioticName || !tracker.startDate) {
      return;
    }

    insertTrackerLine(tracker);
    await upsertTracker(tracker);
    wrapper.remove();
  });

  document.body.appendChild(wrapper);
}

function extractDocumentId() {
  const match = window.location.pathname.match(/\/document\/d\/([^/]+)/);
  return match ? match[1] : "unknown-doc";
}

function insertTrackerLine(tracker) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);
  const anchorParagraph = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer.closest("[role='paragraph'], p, div")
    : range.startContainer.parentElement?.closest("[role='paragraph'], p, div");

  const paragraphId = anchorParagraph?.dataset.abxParagraphId || uuid();
  if (anchorParagraph) {
    anchorParagraph.dataset.abxParagraphId = paragraphId;
  }

  const line = buildTrackerLine(tracker);
  const span = document.createElement("span");
  span.dataset.abxTrackerId = tracker.trackerId;
  span.textContent = line;
  span.style.backgroundColor = WEEKDAY_COLORS[getWeekday()];
  span.style.padding = "0 2px";

  range.deleteContents();
  range.insertNode(span);
  range.insertNode(document.createTextNode("\n"));

  tracker.paragraphAnchor = paragraphId;
  tracker.textRange = {
    startOffset: 0,
    length: line.length
  };
  tracker.lastUpdatedDate = toIsoDate();
  tracker.lastAppliedWeekday = getWeekday();
}

async function runDailyUpdates() {
  const docId = extractDocumentId();
  const trackers = (await getTrackers()).filter((t) => t.documentId === docId && t.status === "active");
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
  if (tracker.lastUpdatedDate === todayIso && tracker.lastAppliedWeekday === getWeekday(todayIso)) {
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

  const weekday = getWeekday(todayIso);
  const nextColor = WEEKDAY_COLORS[weekday];
  if (node.style.backgroundColor !== nextColor) {
    node.style.backgroundColor = nextColor;
  }

  await patchTracker(tracker.trackerId, {
    textRange: { ...tracker.textRange, length: expected.length },
    totalPlannedDays: tracker.stopDate ? expected.match(/Day \d+\/(\d+)/)?.[1] ?? null : null,
    lastUpdatedDate: todayIso,
    lastAppliedWeekday: weekday
  });
}
