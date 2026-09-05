/**
 * Canvas Companion — MV3 service worker.
 *
 * Phase 0: scaffold only. This file must stay the single owner of all
 * Canvas API / LLM / cache-write logic in later phases.
 *
 * Do not fetch from the side panel, options page, or content script.
 * Phase 1 will add: queued fetch (max 1 concurrent per host), Link-header
 * pagination (per_page=100), cookie auth + token fallback, cache writes.
 */

import { CURRENT_PHASE, isPingMessage, type PingResponse } from "../shared/messages.js";

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {
    /* Chrome < 116 may lack setPanelBehavior; side panel still works via the API. */
  });

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isPingMessage(message)) {
    const response: PingResponse = { ok: true, phase: CURRENT_PHASE, worker: "alive" };
    sendResponse(response);
    return false;
  }
  return false;
});
