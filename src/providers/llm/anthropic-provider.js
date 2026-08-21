/**
 * Anthropic Messages API provider.
 *
 * Written against the raw HTTP API with global `fetch` because the platform ships
 * with zero third-party dependencies. Token counts come back from the response
 * rather than being estimated: the cost ledger is only useful if it is exact.
 */
import { config } from "../../config/index.js";
import { createLogger } from "../../lib/logger.js";

const log = createLogger("llm:anthropic");

const API_VERSION = "2023-06-01";
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 529]);

/**
 * Adaptive thinking is the current on-mode, but it is rejected by pre-4.6
 * models — Haiku 4.5 among them. The parameter is therefore never sent: Opus 5
 * thinks adaptively by default when it is omitted, and the older triage model
 * stays a plain completion.
 */
function buildBody({ model, system, prompt, maxTokens, schema }) {
  const body = {
    model,
    max_tokens: maxTokens ?? config.llm.maxOutputTokens,
    messages: [{ role: "user", content: prompt }],
  };
  if (system) body.system = system;
  // Structured outputs constrain the response to the schema the caller demands.
  // The pipeline still validates what comes back before anything is persisted.
  if (schema) body.output_config = { format: { type: "json_schema", schema } };
  return body;
}

function textFromContent(content) {
  return (Array.isArray(content) ? content : [])
    .filter((block) => block?.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createAnthropicProvider() {
  if (!config.llm.apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured; the mock provider is the offline fallback");
  }

  return {
    name: "anthropic",

    async complete({ task, model, system, prompt, maxTokens, schema } = {}) {
      const url = `${config.llm.baseUrl.replace(/\/$/, "")}/v1/messages`;
      const body = JSON.stringify(buildBody({ model, system, prompt, maxTokens, schema }));
      let lastError = "unknown error";

      for (let attempt = 0; attempt <= config.http.retries; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), config.http.timeoutMs);

        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": config.llm.apiKey,
              "anthropic-version": API_VERSION,
              "user-agent": config.http.userAgent,
            },
            body,
            signal: controller.signal,
          });

          if (!response.ok) {
            const detail = await response.text().catch(() => "");
            lastError = `HTTP ${response.status}: ${detail.slice(0, 300)}`;
            if (!RETRYABLE_STATUS.has(response.status)) throw new Error(lastError);
            throw Object.assign(new Error(lastError), { retryable: true });
          }

          const payload = await response.json();

          // A safety decline arrives as HTTP 200. Treating it as text would put
          // an apology into the extraction path, so it fails loudly instead.
          if (payload.stop_reason === "refusal") {
            throw new Error(`refusal: ${payload.stop_details?.category ?? "unspecified"}`);
          }

          return {
            text: textFromContent(payload.content),
            model: payload.model ?? model,
            inputTokens: payload.usage?.input_tokens ?? 0,
            outputTokens: payload.usage?.output_tokens ?? 0,
            cached: (payload.usage?.cache_read_input_tokens ?? 0) > 0,
          };
        } catch (error) {
          const message = error?.name === "AbortError" ? "timeout" : error?.message || String(error);
          const retryable = error?.retryable === true || error?.name === "AbortError" || error instanceof TypeError;
          if (!retryable || attempt === config.http.retries) {
            log.error("completion failed", { task, model, error: message });
            throw new Error(message);
          }
          lastError = message;
          await sleep(500 * 2 ** attempt);
        } finally {
          clearTimeout(timer);
        }
      }

      throw new Error(lastError);
    },
  };
}

export default createAnthropicProvider;
