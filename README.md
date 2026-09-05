# Canvas Companion

Chrome extension (Manifest V3) that turns a student's Canvas LMS courses into one side-panel calendar, with local reminders and a scoped assistant ("Duey").

Architecture, non-goals, and phase plan live in [`PROJECT_SPEC.md`](./PROJECT_SPEC.md). Read that file before changing anything.

**Current phase: 0 — Scaffold.** No Canvas API calls yet. Load the unpacked build, look at the side panel and settings shell, then continue to Phase 1 after you are happy with the structure.

v1 of this extension is **local-only** (Chrome side panel + `chrome.storage.local`). GitHub is the public source repo. Railway and Supabase projects exist so the accounts are linked; they are **not** a Canvas proxy and must not receive session cookies, tokens, or course content.

## Requirements

- Chrome 114+ (side panel API)
- Node 18+

## Build

```bash
npm install
npm run build
```

That writes a loadable extension into `dist/`.

Watch mode (rebuilds on TypeScript changes; reload the extension in Chrome after it rebuilds):

```bash
npm run watch
```

Typecheck only:

```bash
npm run typecheck
```

## Load unpacked (Phase 0 test)

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select this repo's **`dist/`** folder (not the repo root).
5. Pin **Canvas Companion** from the puzzle-piece menu.

### What you should see

| Surface | How to open | What Phase 0 shows |
|---|---|---|
| Side panel | Click the toolbar icon | Calendar / Courses / Chat tabs, a "Worker OK" status, settings link |
| Settings | Right-click the icon → **Options**, or use the side-panel footer link | Domain, token, LLM, reminder fields — **visual only**, not saved |
| Content script | Visit any `https://*.instructure.com` page | DevTools console: `[Canvas Companion] content script loaded (phase 0)` |

The Connect button on Settings will say it is not wired yet. That is correct.

If the toolbar icon does nothing, confirm Chrome is 114+ and that you loaded `dist/` after a successful `npm run build`.

### After you change code

1. `npm run build` (or keep `npm run watch` running).
2. On `chrome://extensions`, click the reload arrow on Canvas Companion.
3. Close and reopen the side panel so it picks up HTML/CSS/JS changes.

## Repo layout

```
PROJECT_SPEC.md          Persistent spec — @-reference this in every phase
README.md
package.json
scripts/build.mjs        esbuild + static copy + icon
src/
  manifest.json
  background/index.ts    Service worker (only place that will call Canvas)
  content/index.ts       Course-page stub (no fetching)
  sidepanel/             Persistent UI
  options/               Settings shell
  shared/                Types, message protocol, CSS
dist/                    Load this folder in Chrome (gitignored)
```

## What is intentionally not here yet

Phase 1 will add the Canvas domain permission flow, queued `fetch`, Link-header pagination, and the local cache. Do not start that until Phase 0 has been loaded and checked.

## Privacy

No analytics. Tokens and API keys will live only in `chrome.storage.local` when those phases land. Nothing is transmitted in Phase 0.
