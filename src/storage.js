import { STORAGE_KEY } from "./constants.js";

export async function getTrackers() {
  const { [STORAGE_KEY]: trackers = [] } = await chrome.storage.local.get(STORAGE_KEY);
  return trackers;
}

export async function saveTrackers(trackers) {
  await chrome.storage.local.set({ [STORAGE_KEY]: trackers });
}

export async function upsertTracker(tracker) {
  const trackers = await getTrackers();
  const index = trackers.findIndex((item) => item.trackerId === tracker.trackerId);
  if (index >= 0) {
    trackers[index] = tracker;
  } else {
    trackers.push(tracker);
  }

  await saveTrackers(trackers);
}

export async function patchTracker(trackerId, patch) {
  const trackers = await getTrackers();
  const index = trackers.findIndex((item) => item.trackerId === trackerId);
  if (index < 0) {
    return;
  }

  trackers[index] = { ...trackers[index], ...patch };
  await saveTrackers(trackers);
}
