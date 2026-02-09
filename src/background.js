import { MENU_ID } from "./constants.js";

async function ensureContextMenu() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "🧪 Insert antibiotic tracker",
    contexts: ["all"],
    documentUrlPatterns: ["https://docs.google.com/document/*"]
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  ensureContextMenu();
});

ensureContextMenu();

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) {
    return;
  }

  await chrome.tabs.sendMessage(tab.id, { type: "OPEN_TRACKER_DIALOG" });
});
