# Chrome Extension: Antibiotic Tracker for Google Docs Census

This repository contains a Manifest V3 Chrome extension that adds a right-click workflow for inserting and maintaining plain-text antibiotic tracker lines in Google Docs.

## Implemented behavior

- Context menu entry: `🧪 Insert antibiotic tracker` (Google Docs documents only).
- Fast insert form with required antibiotic name + start date, optional interval and stop date.
- Canonical plain-text line insertion with daily day-number recomputation.
- Weekday color highlighting for the full inserted line.
- Tracker metadata stored in `chrome.storage.local` keyed by tracker UUID and document ID.
- Update triggers limited to:
  - document load
  - tab focus
  - midnight rollover timer
- Batch processing (`BATCH_SIZE=8`) with cooperative yielding between batches.

## Notes on architecture

- The extension stores tracker objects as the source of truth.
- Each tracker stores a paragraph anchor (`data-abx-paragraph-id`) plus element identifier (`data-abx-tracker-id`) for targeted updates.
- Updates avoid whole-document scans and only iterate known tracker metadata.
- If a tracker node is removed, tracker status is set to `inactive`.
- If line structure appears tampered (missing `Day ` segment), tracker status is set to `detached`.

## Load locally

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this repository folder.
4. Open a Google Docs document and right-click to find the tracker insert command.
