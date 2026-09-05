# PROJECT SPEC: Canvas Companion (working name)

## Research context (read first)

This extension is a **DueGooder-class academic companion** for Canvas LMS. The product target and the Canvas API constraints below are non-optional: do not invent a different feature set, and do not hallucinate Canvas APIs.

### What DueGooder actually does (feature audit)

Confirmed from DueGooder's own store listing and Product Hunt launch:

- Upload a syllabus (PDF) → AI extracts assignments, exams, and class meeting times, auto-organized into one calendar, color-coded by course.
- Morning summary of what's due, configurable-intensity reminders before deadlines, a heads-up ~30 min before class.
- Home Screen widgets showing "what's next."
- "Duey" — an AI assistant scoped to the user's own classes, answers questions like "when is X due."
- AI-suggested start dates (a lightweight heuristic, not a full planning engine).
- Lecture recording → chapter-marked notes; slides/readings → flashcards or a practice test.
- A "Locker" (file storage) with AI search across saved materials.
- Google Calendar sync; join a classmate's course via share code.

**The core loop is:** structured extraction → calendar → proactive reminders → a chat layer that answers questions against that structured data, not a general-purpose chatbot.

That distinction matters for cost: most of DueGooder's value is **deterministic scheduling logic**, and the AI is a thin layer on top for the messy parts (parsing free-text syllabi, answering ambiguous questions).

A similar academic tool, ASU's "Syllabot," does the narrower version: turn one uploaded syllabus into a Q&A chatbot scoped strictly to that document. A syllabus-scoped chatbot does not need broad web/model access — just good retrieval over structured (or one-document) data.

**v1 of this extension clones the core loop only.** Explicit non-goals until after Phases 0–7: lecture recording/transcription, flashcards, practice tests, Locker search, share codes.

### How Canvas LMS actually exposes data

Most "syllabus parser" side-projects get this wrong: **most Canvas courses already have structured due-date data** through Canvas's own REST API — assignments, quizzes, and calendar events are typically entered into Canvas by the professor even when a PDF syllabus also exists. You usually do **not** need AI parsing to build the calendar. You need it only for courses where the real deadlines live only inside an uploaded syllabus PDF/Word doc that was never entered into Canvas as an Assignment.

Key facts (confirmed):

- Canvas exposes a full REST API at `https://<school>.instructure.com/api/v1/...` — `/courses`, `/courses/:id/assignments`, `/courses/:id/quizzes`, `/calendar_events`, `/users/self/todo`, `/users/self/upcoming_events`.
- Auth is normally a personal Bearer access token generated under Account → Settings → Approved Integrations. **However**, because the extension's background script runs with `host_permissions` for the Canvas domain, an authenticated `fetch()` from the extension to that same domain will carry the user's existing Canvas session cookies automatically (this is how Better Canvas / BetterCampus work). A manual API token is an **optional fallback**, not the default flow.
- Canvas paginates via the HTTP `Link` response header (`rel="next"`), **not** a JSON field. Always request `per_page=100` and follow `Link` headers. Ignoring this silently truncates results at ~10 items — the single most common bug in AI-generated Canvas integrations.
- Every Canvas user also has a personal ICS calendar feed (Account → Settings → "Calendar Feed", format `https://<school>.instructure.com/feeds/calendars/user_XXXX.ics`). Zero-API-cost secondary/verification source, and a one-click "subscribe in Google Calendar" path (Google can subscribe to an ICS URL natively). **Do not scrape or guess this URL** — the user copies it from Canvas.

**Implication:** use an LLM only for (a) parsing a syllabus file when Canvas's own structured assignment data is missing or incomplete, and (b) answering genuinely ambiguous natural-language questions. Everything else — "what's due this week," "what's due today," listing overdue items, building the calendar — is plain JavaScript filtering over cached JSON, with **no model calls**.

---

## What this is

A Chrome extension (Manifest V3) that attaches to a student's Canvas LMS instance (any `*.instructure.com` subdomain, configurable) and:

1. Pulls the student's real courses/assignments/quizzes/calendar events from Canvas's own REST API (no re-entering data by hand).
2. Falls back to parsing an uploaded syllabus file with an LLM **ONLY** when a course has no usable structured due-date data in Canvas.
3. Renders everything as a single cross-course calendar in a persistent Chrome side panel that stays open while browsing Canvas.
4. Includes a chat assistant ("Duey") scoped to the student's own course data, answering deadline/schedule questions.
5. Sends local notifications/reminders without needing the extension open.

Explicit non-goals for v1: lecture recording/transcription, flashcards, practice tests, "Locker" file search, share codes. Build the calendar + chatbot core first; these are stretch phases at the end.

## Hard technical constraints (do not deviate)

- Manifest V3 only. No Manifest V2 APIs (no persistent background page, no blocking webRequest — use a service worker + declarativeNetRequest if any request blocking is ever needed, which it should not be for v1).
- Use `chrome.sidePanel` (Chrome 114+) as the primary UI surface — **NOT** a popup. The whole point is it stays open across tab switches while the student browses Canvas. Requires the `"sidePanel"` permission and a `"side_panel": { "default_path": "sidepanel.html" }` key in the manifest.
- A lightweight content script also runs on matched Canvas pages purely to (a) detect the current course ID from the URL/DOM and message it to the side panel/service worker, and (b) inject one small floating launcher button as a fallback for users who don't know the side panel exists. The content script must **NOT** do any data fetching or heavy logic itself — keep all API/network/state logic centralized in the background service worker so multiple open Canvas tabs don't each independently poll the API.
- `host_permissions` should be dynamic/optional, not hardcoded to one school. On first run, ask the user for their Canvas base URL (e.g. `myschool.instructure.com`) and use `chrome.permissions.request` to add a scoped host permission for that origin at runtime (MV3 optional host permissions), rather than requesting `<all_urls>` or a fixed domain list.
- Auth: default to same-origin `fetch(..., { credentials: 'include' })` calls from the background service worker to `https://<domain>/api/v1/...`, relying on the student's existing logged-in Canvas session cookies — no token entry required for the default flow. Provide a Settings-page fallback field for a manually generated Canvas API access token, used only if the cookie-based call returns 401/403 (e.g. some school SSO setups block this). Never hardcode a token. Store any token only in `chrome.storage.local`, never in code, never logged to console.
- Pagination: Canvas returns pagination via the HTTP `Link` response header (`rel="next"`), not a JSON field. Always request `per_page=100` and write a small `paginate()` helper that follows `Link: <url>; rel="next"` until there is no next link.
- Respect rate limits: centralize ALL Canvas API calls through one queued fetch function in the service worker (simple in-memory queue, max ~1 concurrent request per host) so multiple UI panels/tabs never fire duplicate simultaneous requests.

## Data model (cache-first, minimize API calls)

Maintain a local structured store in `chrome.storage.local` (or IndexedDB if it exceeds storage.local's practical size) shaped roughly like:

```ts
type CachedCourse = {
  id: number;
  name: string;
  color: string; // assign a stable color per course for the calendar
  lastSyncedAt: string; // ISO timestamp
};

type CachedItem = {
  id: string; // `${courseId}-${sourceType}-${sourceId}`
  courseId: number;
  title: string;
  type: 'assignment' | 'quiz' | 'calendar_event' | 'syllabus_inferred';
  dueAt: string | null; // ISO
  pointsPossible: number | null;
  htmlUrl: string;
  description: string | null; // trimmed, for chat context only
  suggestedStartAt: string | null; // computed locally, see heuristic below
  source: 'canvas_api' | 'llm_parsed_syllabus';
};
```

Sync strategy:

- On install and on a `chrome.alarms` timer (default every 60 minutes, user-configurable, never less than every 15 minutes), refresh courses and items for courses whose `lastSyncedAt` is stale.
- Only re-fetch a course's items if Canvas's own `updated_at` on the course/assignments differs from what's cached — don't blindly refetch everything every cycle.
- A manual "Refresh now" button in the side panel bypasses the timer but still goes through the same single queued fetch function.
- The chat assistant and calendar view **ALWAYS** read from this local cache, never call the Canvas API directly themselves.

### AI-suggested start dates (do this WITHOUT calling an LLM)

Mirror DueGooder's "AI suggested start date" cheaply with a deterministic heuristic instead of a model call:

- Estimate effort in days from `pointsPossible` and type (e.g. quiz = 1 day lead time; assignment scaled by points into small buckets like `<=20` pts → 2 days, `21–60` → 4 days, `>60` → 7 days; exam/final → 5–7 days). Make these buckets a **named constant object** so they're easy to tune later.
- `suggestedStartAt = dueAt - effortDays`, clipped to not be earlier than "today" or earlier than the previous item's due date for the same course.
- This is a **placeholder heuristic** — say so in a code comment — and leave a clearly marked seam to swap in a smarter model later if desired.

### Syllabus file parsing (LLM path — use sparingly)

Only trigger this path when, after syncing, a course has zero or very few Canvas-native assignments/quizzes/calendar events relative to what the syllabus implies (e.g., fewer than some threshold, or the user explicitly clicks "Parse syllabus for this course").

- Content script/background locates the course's Syllabus page or Files tab and lets the user pick the syllabus file (PDF/DOCX) via Canvas's own `/api/v1/courses/:id/files` listing, or accept a manual upload.
- Extract raw text client-side first:
  - PDF: use pdf.js (bundle it locally, do not fetch from a CDN at runtime — MV3's CSP disallows remote code execution).
  - DOCX: use a lightweight local parser (e.g. mammoth, bundled).
- Send **ONLY** the extracted plain text (not the raw binary) to the LLM, truncated/chunked to stay well under context limits, with a strict system prompt instructing it to return STRICT JSON matching the `CachedItem` shape above and nothing else — no prose, no markdown fences. Parse defensively (try/catch, validate shape, reject and surface an error to the user rather than silently caching garbage).
- Cache the result with `source: 'llm_parsed_syllabus'` and a `lastSyncedAt`; do **NOT** re-parse the same file again unless the user re-uploads a changed file (compare a hash of the extracted text).
- This is the **only** part of the whole extension that should touch an LLM API for calendar-building — everything else is Canvas's own structured data.

### Chat assistant ("Duey") — hybrid rules-first design

Goal: answer the large majority of questions with **ZERO** model calls.

Build a small intent router that runs first on every user message:

- Date/deadline lookups ("what's due this week/today/tomorrow", "what do I have in [course]", "what's overdue", "next 3 things due") — match with a small set of regex/keyword patterns, then answer by filtering the local `CachedItem` array directly in JS and formatting a templated response. No network call at all.
- If a message doesn't confidently match a known intent (define a simple confidence check, e.g. no date/course keyword matched, or it's a policy/content question like "what's the late penalty in my history class"), **THEN** fall back to the LLM path below.

LLM fallback path:

- Only include the specific course(s) the question seems to be about (from keyword/course-name matching) in the prompt context — never dump every course's full data into every request.
- Include a compact JSON summary of that course's cached items (not full HTML descriptions — truncate/strip HTML) plus, if available, the relevant chunk of parsed syllabus text.
- Cache the `(queryHash, courseId) → answer` pair in `chrome.storage.local` with a short TTL (e.g. 1 hour) so repeated/near-duplicate questions don't re-call the model.
- Debounce: only send on explicit submit (Enter/send button), never on every keystroke.
- Keep the system prompt short and fixed; let the per-course JSON be the only thing that varies, to keep token usage predictable.
- API key for whichever LLM provider is chosen (make the provider a pluggable config, default to **none** until the user adds a key in Settings) is stored only in `chrome.storage.local`, entered via the options page, and only ever read from the background service worker — never exposed to the content script or page context.

### Reminders / notifications (also zero extra API calls)

- Use `chrome.alarms` for a periodic local check (e.g. every 15–30 min) against the **already-cached** `CachedItem` array — do not hit the Canvas API just to check reminder timing.
- Fire `chrome.notifications` for: a daily morning summary of what's due today (configurable time), a reminder N hours/minutes before each due date (user-configurable "intensity": e.g. once at 24h, or 24h+3h+30min), and a heads-up ~30 min before a class meeting time (calendar events with a location/meeting type).
- Track which reminders have already fired (a `firedReminderIds` set in storage) so alarms don't spam duplicate notifications on every check cycle.

## UI surfaces to build

- `sidepanel.html` (+ its own small JS bundle, framework optional — plain TS + a tiny templating approach is fine for v1, don't pull in a heavy framework unless you want to): tabs for Calendar (month/week/agenda list, color-coded by course, filterable), Courses (list with last-sync time, manual refresh, manual syllabus-parse trigger), and Chat (the Duey assistant).
- `options.html`: Canvas base domain input + "Connect" button that triggers the optional host-permission request; optional manual API token field (with a note on why it's optional); LLM provider + API key fields; reminder intensity settings; a visible link to subscribe to the user's Canvas ICS feed in Google Calendar as a free/instant alternative sync path (`https://<domain>/feeds/calendars/user_XXXX.ics`, the user must copy their own URL from Canvas — do not attempt to scrape or guess it).
- A minimal content-script-injected floating button on Canvas pages that just opens the side panel (`chrome.sidePanel.open()`), for discoverability.

## Manifest sketch (use as the starting point, adjust as needed)

```json
{
  "manifest_version": 3,
  "name": "Canvas Companion",
  "version": "0.1.0",
  "description": "Turns your Canvas courses into one calendar with a scoped AI assistant.",
  "permissions": ["storage", "alarms", "notifications", "sidePanel"],
  "optional_host_permissions": ["https://*.instructure.com/*"],
  "background": { "service_worker": "background.js", "type": "module" },
  "side_panel": { "default_path": "sidepanel.html" },
  "options_page": "options.html",
  "content_scripts": [
    {
      "matches": ["https://*.instructure.com/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "icons": { "128": "icons/icon128.png" }
}
```

Note: `content_scripts.matches` needs a concrete pattern at install time, but actual Canvas API fetches should still go through the `optional_host_permissions` + `chrome.permissions.request` flow scoped to whatever exact domain the user provides in onboarding, so the extension isn't silently granted API access to every Instructure customer's site before the user says which one is theirs.

Phase 0 addition (needed to *test* the side panel before the Phase 3 floating launcher exists): an `action` toolbar button plus `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` so clicking the extension icon opens the side panel.

## Security/privacy requirements (non-negotiable)

- Never transmit Canvas session data, tokens, or scraped course content anywhere other than: (a) the Canvas domain itself, (b) the LLM provider the user explicitly configured, and only the minimal per-course context described above.
- No analytics/telemetry beacon to any third party in v1.
- All stored keys/tokens live in `chrome.storage.local`, never `chrome.storage.sync` (which leaves the device) and never in source.
- Sanitize any Canvas-provided HTML (assignment descriptions, syllabus body) before rendering it in the side panel — don't `innerHTML` raw Canvas content without stripping scripts.

## Build phases (do these in order, one turn per phase; test by loading the unpacked extension after each phase before moving on)

- **Phase 0 — Scaffold.** Repo structure, `manifest.json`, empty background/content/sidepanel/options files, build tooling (plain TypeScript + esbuild/vite is enough, no need for a heavy framework), README with local-load instructions.
- **Phase 1 — Canvas connection.** Options page domain input + optional host permission request flow; background service worker's queued `fetch()` + Link-header pagination helper; `/users/self`, `/courses`, `/courses/:id/assignments`, `/courses/:id/quizzes`, `/calendar_events` wired up; write results into the `chrome.storage.local` cache shape above. Manual token fallback field. Log clearly (only in dev) when cookie-auth fails and token fallback is used.
- **Phase 2 — Calendar UI.** Side panel Calendar tab rendering cached items, color-coded per course, week/month/agenda toggle, "Refresh now."
- **Phase 3 — Content script + launcher.** Course-ID detection, message to background/side panel, floating button that opens the side panel.
- **Phase 4 — Reminders.** `chrome.alarms` + `chrome.notifications` wired to cached data, dedupe via `firedReminderIds`, settings for intensity/timing.
- **Phase 5 — Rules-based chat.** Intent router + local JS answers for date/deadline questions, chat UI in the side panel, no LLM calls yet.
- **Phase 6 — LLM fallback + syllabus parsing.** Provider-agnostic LLM client in the background worker, per-course context builder, response cache, pdf.js/mammoth-based syllabus text extraction and the strict-JSON parsing prompt, "Parse syllabus" trigger in the Courses tab.
- **Phase 7 — Suggested start dates + ICS link + polish.** The deterministic heuristic above, Settings link to the user's own Canvas ICS feed, error states, empty states, a short in-app onboarding flow, and a manual QA checklist in the README (multi-course account, account with zero assignments, expired session, revoked host permission).

Stretch (only after 0–7 are solid and tested): lecture recording/transcription, flashcards/practice tests, cross-device "Locker" search, share codes for classmates. Treat these as a v2 spec, not part of this build.

## Quick reference: why this design keeps API usage (and cost) low

| Cost driver | What most naive builds do | What this spec does |
|---|---|---|
| Canvas API calls | Poll on every tab load, per open tab | Single queued fetch in the background worker, timer-based sync, `updated_at`-aware skip logic |
| Pagination | Miss the `Link` header, silently truncate at ~10 items, or re-request per-page-1 in a loop without caching | `per_page=100` + one `paginate()` helper, cached |
| "When is X due" questions | Send every question to an LLM | Local intent router answers these with zero model calls |
| LLM context size | Dump the whole semester's data into every prompt | Only the matched course(s), HTML-stripped, capped |
| Repeated questions | Re-call the model every time | Query-hash cache with TTL |
| Syllabus parsing | Re-parse the PDF every sync cycle | Hash the extracted text, parse once, cache with source tag |
| Calendar sync | Build a full two-way Google Calendar sync integration | Point the user at Canvas's own ICS feed for one-click Google Calendar subscribe, zero extra code |

## Working agreement for this repo

- One phase at a time. After a phase is built, stop so it can be loaded unpacked and tested.
- Do not start the next phase until the user has looked at the current phase and asked to continue.
- Re-read this file at the start of every phase so the architecture does not drift.
- Ask permission before extra work (new dependencies, stretching into a later phase, committing/pushing, anything outside the current phase).
