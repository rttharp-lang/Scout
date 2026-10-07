// Shared Claude client for the Scout Mood functions (api/mood-*.js). Lives
// outside /api so Vercel never deploys it as its own function; handlers import
// it relatively. The Anthropic key stays server-side (ANTHROPIC_API_KEY).
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

// Errors carry the HTTP status + error code the handler should return.
export class MoodError extends Error {
  constructor(status, code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

let cached = null;
function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new MoodError(503, "ai-not-configured");
  // One attempt, bounded under the 60s function ceiling (see maxDuration in
  // the handlers) so a slow generation fails cleanly instead of being killed.
  // fetch is resolved per call (not bound at construction) so tests can swap it.
  if (!cached || cached.key !== apiKey) cached = { key: apiKey, sdk: new Anthropic({ apiKey, timeout: 55_000, maxRetries: 0, fetch: (...a) => globalThis.fetch(...a) }) };
  return cached.sdk;
}

// One structured-output call: returns the parsed JSON object matching
// `schema`. `content` is the user turn (a string or an array of content
// blocks, e.g. images + text). Opus 5.5 always thinks adaptively — depth is
// set with `effort` only. Server-side fallbacks ("default") re-run a declined
// request on Anthropic's recommended model instead of failing the board.
export async function callStructured({ system, content, schema, maxTokens = 8000, effort = "low" }) {
  let msg;
  try {
    msg = await client().beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      output_config: { effort, format: { type: "json_schema", schema } },
      messages: [{ role: "user", content }],
    });
  } catch (e) {
    if (e instanceof MoodError) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new MoodError(429, "ai-rate-limited", e.message);
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new MoodError(504, "ai-timeout", e.message);
    if (e instanceof Anthropic.APIError) throw new MoodError(502, "ai-request-failed", `${e.status ?? ""} ${e.message}`.trim());
    throw new MoodError(500, "ai-error", String(e));
  }
  if (msg.stop_reason === "refusal") throw new MoodError(422, "refused", msg.stop_details?.explanation || undefined);
  if (msg.stop_reason === "max_tokens") throw new MoodError(502, "ai-truncated");
  const text = (msg.content || []).find((b) => b.type === "text");
  if (!text) throw new MoodError(502, "no-output");
  try {
    return JSON.parse(text.text);
  } catch {
    throw new MoodError(502, "bad-output");
  }
}

// Uniform error response for every mood handler.
export function sendError(res, e) {
  if (e instanceof MoodError) {
    res.status(e.status).json(e.detail ? { error: e.code, detail: e.detail } : { error: e.code });
    return;
  }
  res.status(500).json({ error: "server-error", detail: String(e?.message || e) });
}
