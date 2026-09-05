/**
 * Message protocol between content script, side panel, options page, and
 * the background service worker. The worker is the only process that may
 * talk to Canvas or an LLM.
 */

export const CURRENT_PHASE = 0;

export type PingMessage = { type: "PING" };
export type PingResponse = { ok: true; phase: number; worker: "alive" };

export type ExtensionMessage = PingMessage;

export function isPingMessage(value: unknown): value is PingMessage {
  return Boolean(value && typeof value === "object" && (value as PingMessage).type === "PING");
}
