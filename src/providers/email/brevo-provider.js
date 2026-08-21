/**
 * Brevo email provider.
 *
 * `docs/newsletter/operations.md` draws a hard automation boundary: AI-assisted
 * draft and scheduled delivery are allowed, "send without verification" is not.
 * That rule is enforced here rather than in the caller, because the provider is
 * the last place a send can be stopped — a future job, CLI command or admin
 * route that forgets the gate still cannot get an unapproved issue out.
 */
import { config } from "../../config/index.js";
import { createLogger } from "../../lib/logger.js";

const log = createLogger("email");

/** Not in config: there is no deployment where this differs, and no key for it. */
const BREVO_BASE_URL = "https://api.brevo.com/v3";

export const name = "brevo";

function blocked(reason, detail) {
  return { ok: false, sent: false, blocked: true, reason, detail: detail ?? null, campaignId: null, status: null };
}

function failed(reason, detail) {
  return { ok: false, sent: false, blocked: false, reason, detail: detail ?? null, campaignId: null, status: null };
}

/**
 * An issue counts as approved only when a human left a trace. `status` alone is
 * not enough: a bug that flips a column must not be able to authorise a send.
 */
export function isApprovedForSending(issue) {
  if (!issue) return false;
  const approvedStatus = issue.status === "approved" || issue.status === "sent";
  return Boolean(approvedStatus && issue.approved_by && issue.approved_at);
}

async function brevoRequest(path, { method = "POST", body, apiKey, timeoutMs = 20_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BREVO_BASE_URL}${path}`, {
      method,
      headers: {
        "api-key": apiKey,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text.slice(0, 500) };
    }

    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    const message = error?.name === "AbortError" ? "timeout" : error?.message || String(error);
    return { ok: false, status: 0, payload: null, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} params
 * @param {object} params.issue     newsletter_issues row (subject, html, status, approved_by, approved_at)
 * @param {number} [params.listId]  Brevo list id; defaults to the configured Japan Market Weekly list
 * @param {string} [params.scheduledAt] ISO time for a scheduled send instead of send-now
 */
export async function sendCampaign({ issue, listId, senderEmail, senderName, scheduledAt } = {}) {
  if (!issue) return failed("no_issue", "sendCampaign requires a newsletter issue");

  if (config.newsletter.requireHumanApproval && !isApprovedForSending(issue)) {
    log.warn("send refused: issue not approved by a human", {
      issue: issue.issue_date ?? issue.id ?? null,
      status: issue.status ?? null,
    });
    return blocked(
      "human_approval_required",
      "docs/newsletter/operations.md forbids sending without human verification; approve the issue first"
    );
  }

  const apiKey = config.newsletter.brevoApiKey;
  if (!apiKey) return failed("no_api_key", "BREVO_API_KEY is not configured");

  const list = Number(listId ?? config.newsletter.listId);
  if (!list) return failed("no_list_id", "BREVO_LIST_ID_JAPAN_MARKET_WEEKLY is not configured");

  const html = issue.html || issue.markdown;
  if (!issue.subject || !html) return failed("empty_issue", "issue has no subject or body");

  const created = await brevoRequest("/emailCampaigns", {
    apiKey,
    body: {
      name: `Japan Market Weekly ${issue.issue_date ?? ""}`.trim(),
      subject: issue.subject,
      sender: {
        name: senderName ?? config.newsletter.senderName,
        email: senderEmail ?? config.newsletter.senderEmail,
      },
      htmlContent: html,
      recipients: { listIds: [list] },
      ...(scheduledAt ? { scheduledAt } : {}),
    },
  });

  if (!created.ok) {
    return failed("create_failed", created.error ?? `HTTP ${created.status}: ${JSON.stringify(created.payload)}`);
  }

  const campaignId = created.payload?.id ?? null;
  if (scheduledAt) {
    return { ok: true, sent: false, blocked: false, reason: "scheduled", detail: scheduledAt, campaignId, status: "scheduled" };
  }

  const sent = await brevoRequest(`/emailCampaigns/${campaignId}/sendNow`, { apiKey });
  if (!sent.ok) {
    return {
      ...failed("send_failed", sent.error ?? `HTTP ${sent.status}: ${JSON.stringify(sent.payload)}`),
      campaignId,
      status: "created",
    };
  }

  log.info("campaign sent", { campaignId, list });
  return { ok: true, sent: true, blocked: false, reason: "sent", detail: null, campaignId, status: "sent" };
}

export function createBrevoProvider() {
  return { name, sendCampaign, isApprovedForSending };
}

/**
 * Used whenever no API key is configured — development, CI and every test run.
 * It reports what it would have done so the weekly job still produces a result
 * object, and it applies the same approval gate so behaviour does not change
 * the day a key is added.
 */
export function createNoopEmailProvider() {
  return {
    name: "noop",
    isApprovedForSending,
    async sendCampaign({ issue } = {}) {
      if (!issue) return failed("no_issue", "sendCampaign requires a newsletter issue");
      if (config.newsletter.requireHumanApproval && !isApprovedForSending(issue)) {
        return blocked("human_approval_required", "no email provider configured, and the issue is not approved");
      }
      log.info("noop email provider: send skipped", { issue: issue.issue_date ?? issue.id ?? null });
      return { ok: true, sent: false, blocked: false, reason: "no_provider", detail: "no email provider configured", campaignId: null, status: "drafted" };
    },
  };
}

export default createBrevoProvider;
