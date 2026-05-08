import { createHash } from "node:crypto";
import { headerValue, requestMeta, respondJson } from "../lib/observability.js";

const MAX = {
  id: 120,
  email: 254,
  reason: 180,
  details: 4000,
  userAgent: 500
};

const ALLOWED_REASONS = new Set([
  "unsafe_event",
  "privacy",
  "wrong_or_misleading",
  "abusive_join",
  "bad_proof",
  "other"
]);

function clean(value, maxLength = MAX.details) {
  return String(value || "").trim().slice(0, maxLength);
}

function emailAddress(value) {
  const email = clean(value, MAX.email).toLowerCase();
  if (!email) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function safeTextId(value) {
  const id = clean(value, MAX.id).toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{2,119}$/.test(id) ? id : "";
}

function safeEventId(value) {
  const id = clean(value, MAX.id).toLowerCase();
  return /^[a-z0-9][a-z0-9-]{2,119}$/.test(id) ? id : "";
}

function safeUuid(value) {
  const id = clean(value, 60).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)
    ? id
    : "";
}

function supabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function supabaseBase() {
  return process.env.SUPABASE_URL.replace(/\/$/, "");
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra
  };
}

function positiveIntEnv(name, fallback, minimum, maximum) {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value < minimum || value > maximum) return fallback;
  return value;
}

function rateLimitSettings() {
  return {
    windowSeconds: positiveIntEnv("TRUST_REPORT_RATE_LIMIT_WINDOW_SECONDS", 600, 60, 86400),
    max: positiveIntEnv("TRUST_REPORT_RATE_LIMIT_MAX", 8, 1, 1000)
  };
}

function rateLimitWindowStart(windowSeconds) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return new Date(Math.floor(nowSeconds / windowSeconds) * windowSeconds * 1000).toISOString();
}

function requestIp(request) {
  const forwarded = clean(headerValue(request.headers, "x-forwarded-for"), 300)
    .split(",")[0]
    .trim();
  return forwarded
    || clean(headerValue(request.headers, "x-real-ip"), 100)
    || clean(request.socket?.remoteAddress, 100)
    || "unknown";
}

function requestUserAgent(request) {
  return clean(headerValue(request.headers, "user-agent"), MAX.userAgent) || "unknown";
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function rateLimitSubject(request) {
  const salt = clean(process.env.RATE_LIMIT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "blue-moon", 500);
  return sha256(`${salt}:trust-report:${requestIp(request)}:${requestUserAgent(request)}`);
}

async function recordRateLimitHit(subjectHash, windowStart, windowSeconds, limit) {
  const result = await fetch(`${supabaseBase()}/rest/v1/rpc/record_api_rate_limit_hit`, {
    method: "POST",
    headers: supabaseHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({
      requested_route: "trust-report-ip",
      requested_subject_hash: subjectHash,
      requested_window_start: windowStart,
      requested_window_seconds: windowSeconds,
      requested_limit: limit
    })
  });

  const data = await result.json().catch(() => ({}));
  if (!result.ok) {
    return {
      ok: false,
      reason: "rate_limit_check_failed",
      status: result.status
    };
  }

  return {
    ok: true,
    allowed: data.allowed !== false,
    retryAfterSeconds: Number(data.retryAfterSeconds) || windowSeconds,
    requestCount: Number(data.requestCount) || 0
  };
}

async function enforceReportRateLimit(request) {
  if (String(process.env.TRUST_REPORT_RATE_LIMIT_DISABLED || "").toLowerCase() === "true") {
    return { allowed: true };
  }

  const settings = rateLimitSettings();
  const result = await recordRateLimitHit(
    rateLimitSubject(request),
    rateLimitWindowStart(settings.windowSeconds),
    settings.windowSeconds,
    settings.max
  );

  if (!result.ok) {
    return {
      allowed: false,
      status: 503,
      error: result.reason,
      upstreamStatus: result.status
    };
  }
  if (!result.allowed) {
    return {
      allowed: false,
      status: 429,
      error: "rate_limited",
      retryAfterSeconds: result.retryAfterSeconds
    };
  }

  return { allowed: true };
}

function botFieldFilled(body, report) {
  return Boolean(clean(body.website || body.company || report.website || report.company, MAX.reason));
}

function normalizeReport(body) {
  const target = body.target || {};
  const report = body.report || {};
  const reason = clean(report.reason || body.reason, MAX.reason).toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const details = clean(report.details || body.details, MAX.details);
  const reporterEmailRaw = clean(report.reporterEmail || report.email || body.reporterEmail || body.email, MAX.email);
  const reporterEmail = emailAddress(reporterEmailRaw);
  const eventId = safeEventId(target.eventId || body.eventId);
  const organizationId = safeTextId(target.organizationId || body.organizationId);
  const proofId = safeUuid(target.proofId || body.proofId);

  if (botFieldFilled(body, report)) return { ok: false, error: "bot_detected" };
  if (!eventId && !organizationId && !proofId) return { ok: false, error: "missing_target" };
  if (!ALLOWED_REASONS.has(reason)) return { ok: false, error: "invalid_reason" };
  if (details.length < 10) return { ok: false, error: "missing_details" };
  if (reporterEmailRaw && !reporterEmail) return { ok: false, error: "invalid_email" };

  return {
    ok: true,
    report: {
      reporter_email: reporterEmail || null,
      event_id: eventId || null,
      organization_id: organizationId || null,
      proof_id: proofId || null,
      reason,
      details,
      status: "open"
    },
    eventId,
    organizationId,
    proofId,
    reason
  };
}

async function saveTrustReport(report) {
  const result = await fetch(`${supabaseBase()}/rest/v1/trust_reports`, {
    method: "POST",
    headers: supabaseHeaders({
      "Content-Type": "application/json",
      Prefer: "return=representation"
    }),
    body: JSON.stringify(report)
  });

  const data = await result.json().catch(() => []);
  if (!result.ok) {
    return {
      saved: false,
      reason: "database_save_failed",
      status: result.status
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    saved: true,
    id: row?.id || ""
  };
}

export default async function handler(request, response) {
  const meta = requestMeta(request, "api/trust-report");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return respondJson(response, 405, { ok: false, error: "method_not_allowed" }, {
      ...meta,
      event: "trust_report.method_not_allowed"
    });
  }

  let body = {};
  try {
    body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
  } catch (error) {
    return respondJson(response, 400, { ok: false, error: "invalid_json" }, {
      ...meta,
      event: "trust_report.invalid_json"
    });
  }

  const normalized = normalizeReport(body);
  if (!normalized.ok) {
    const status = normalized.error === "bot_detected" ? 400 : 422;
    return respondJson(response, status, { ok: false, error: normalized.error }, {
      ...meta,
      event: normalized.error === "bot_detected" ? "trust_report.bot_detected" : "trust_report.invalid_request"
    });
  }

  if (!supabaseConfigured()) {
    return respondJson(response, 202, {
      ok: true,
      reportSaved: false,
      reason: "database_not_configured"
    }, {
      ...meta,
      event: "trust_report.database_not_configured",
      eventId: normalized.eventId,
      organizationId: normalized.organizationId,
      proofId: normalized.proofId,
      reasonType: normalized.reason
    });
  }

  const rateLimit = await enforceReportRateLimit(request);
  if (!rateLimit.allowed) {
    if (rateLimit.retryAfterSeconds) {
      response.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
    }
    return respondJson(response, rateLimit.status, {
      ok: false,
      reportSaved: false,
      error: rateLimit.error,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      upstreamStatus: rateLimit.upstreamStatus
    }, {
      ...meta,
      event: "trust_report.rate_limited",
      eventId: normalized.eventId,
      organizationId: normalized.organizationId,
      proofId: normalized.proofId,
      reasonType: normalized.reason,
      upstreamStatus: rateLimit.upstreamStatus
    });
  }

  const saved = await saveTrustReport(normalized.report);
  if (!saved.saved) {
    return respondJson(response, 502, {
      ok: false,
      reportSaved: false,
      error: saved.reason,
      status: saved.status
    }, {
      ...meta,
      event: "trust_report.save_failed",
      eventId: normalized.eventId,
      organizationId: normalized.organizationId,
      proofId: normalized.proofId,
      reasonType: normalized.reason,
      upstreamStatus: saved.status
    });
  }

  return respondJson(response, 200, {
    ok: true,
    reportSaved: true,
    reportId: saved.id
  }, {
    ...meta,
    event: "trust_report.saved",
    eventId: normalized.eventId,
    organizationId: normalized.organizationId,
    proofId: normalized.proofId,
    reasonType: normalized.reason,
    reportId: saved.id
  });
}
