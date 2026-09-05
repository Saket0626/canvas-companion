/**
 * Cache-first data model. Chat and calendar always read this shape from
 * chrome.storage.local — they never call the Canvas API themselves.
 * See PROJECT_SPEC.md.
 */

export type CachedCourse = {
  id: number;
  name: string;
  color: string;
  lastSyncedAt: string;
};

export type ItemType = "assignment" | "quiz" | "calendar_event" | "syllabus_inferred";

export type ItemSource = "canvas_api" | "llm_parsed_syllabus";

export type CachedItem = {
  id: string;
  courseId: number;
  title: string;
  type: ItemType;
  dueAt: string | null;
  pointsPossible: number | null;
  htmlUrl: string;
  description: string | null;
  suggestedStartAt: string | null;
  source: ItemSource;
};

export type LlmProvider = "none" | "openai" | "anthropic";

export type ReminderIntensity = "light" | "standard" | "intense";

export type Settings = {
  canvasDomain: string | null;
  /** Stored in chrome.storage.local only. Never log this. */
  canvasAccessToken: string | null;
  llmProvider: LlmProvider;
  /** Stored in chrome.storage.local only. Never log this. Never send to the content script. */
  llmApiKey: string | null;
  syncIntervalMinutes: number;
  reminderIntensity: ReminderIntensity;
  morningSummaryHour: number;
  morningSummaryMinute: number;
  icsFeedUrl: string | null;
};

export const STORAGE_KEYS = {
  courses: "cachedCourses",
  items: "cachedItems",
  settings: "settings",
  firedReminderIds: "firedReminderIds",
  chatResponseCache: "chatResponseCache",
} as const;

/** Default 60 min; never allow a sync interval below 15 min (PROJECT_SPEC). */
export const MIN_SYNC_INTERVAL_MINUTES = 15;
export const DEFAULT_SYNC_INTERVAL_MINUTES = 60;

/**
 * Placeholder effort heuristic for suggested start dates (Phase 7).
 * Tune these buckets later; do not replace with an LLM call in v1.
 */
export const EFFORT_DAYS = {
  quiz: 1,
  assignmentLte20: 2,
  assignment21to60: 4,
  assignmentGt60: 7,
  examOrFinal: 6,
} as const;

export const DEFAULT_SETTINGS: Settings = {
  canvasDomain: null,
  canvasAccessToken: null,
  llmProvider: "none",
  llmApiKey: null,
  syncIntervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
  reminderIntensity: "standard",
  morningSummaryHour: 8,
  morningSummaryMinute: 0,
  icsFeedUrl: null,
};
