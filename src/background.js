import { MENU_ID } from "./constants.js";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "🧪 Insert antibiotic tracker",
    contexts: ["all"],
    documentUrlPatterns: ["https://docs.google.com/document/*"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) {
    return;
  }

  await chrome.tabs.sendMessage(tab.id, { type: "OPEN_TRACKER_DIALOG" });
});
