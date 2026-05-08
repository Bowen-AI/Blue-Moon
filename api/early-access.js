import { createHash } from "node:crypto";
import { headerValue, requestMeta, respondJson } from "../lib/observability.js";

const MAX = {
  email: 254,
  name: 180,
  interest: 80,
  userAgent: 500
};

const ALLOWED_INTERESTS = new Set([
  "Attend events",
  "Create events",
  "Invite organizers"
]);

function clean(value, maxLength = MAX.name) {
  return String(value || "").trim().slice(0, maxLength);
}

function emailAddress(value) {
  const email = clean(value, MAX.email).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
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
    windowSeconds: positiveIntEnv("EARLY_ACCESS_RATE_LIMIT_WINDOW_SECONDS", 600, 60, 86400),
    max: positiveIntEnv("EARLY_ACCESS_RATE_LIMIT_MAX", 8, 1, 1000)
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
  return sha256(`${salt}:early-access:${requestIp(request)}:${requestUserAgent(request)}`);
}

async function recordRateLimitHit(subjectHash, windowStart, windowSeconds, limit) {
  const result = await fetch(`${supabaseBase()}/rest/v1/rpc/record_api_rate_limit_hit`, {
    method: "POST",
    headers: supabaseHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({
      requested_route: "early-access-ip",
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
    retryAfterSeconds: Number(data.retryAfterSeconds) || windowSeconds
  };
}

async function enforceRateLimit(request) {
  if (String(process.env.EARLY_ACCESS_RATE_LIMIT_DISABLED || "").toLowerCase() === "true") {
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

function botFieldFilled(body, waitlist) {
  return Boolean(clean(body.website || body.company || waitlist.website || waitlist.company, MAX.interest));
}

function normalizeRequest(body) {
  const waitlist = body.waitlist || body.earlyAccess || body;
  const name = clean(waitlist.name, MAX.name);
  const email = emailAddress(waitlist.email);
  const interest = clean(waitlist.interest, MAX.interest);

  if (botFieldFilled(body, waitlist)) return { ok: false, error: "bot_detected" };
  if (!name) return { ok: false, error: "missing_name" };
  if (!email) return { ok: false, error: "invalid_email" };
  if (!ALLOWED_INTERESTS.has(interest)) return { ok: false, error: "invalid_interest" };

  return {
    ok: true,
    request: {
      name,
      email,
      interest,
      status: "new",
      source: "site"
    },
    interest
  };
}

async function saveEarlyAccessRequest(request) {
  const result = await fetch(`${supabaseBase()}/rest/v1/early_access_requests`, {
    method: "POST",
    headers: supabaseHeaders({
      "Content-Type": "application/json",
      Prefer: "return=representation"
    }),
    body: JSON.stringify(request)
  });

  const data = await result.json().catch(() => []);
  if (result.status === 409) {
    return {
      saved: false,
      reason: "duplicate_request",
      status: result.status
    };
  }
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

function notificationConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.EARLY_ACCESS_NOTIFY_TO);
}

function escapeText(value) {
  return clean(value, 1000).replace(/[<>&]/g, "");
}

async function sendOperatorNotification(request, requestId) {
  if (!notificationConfigured()) {
    return { sent: false, reason: "notification_not_configured" };
  }

  const text = [
    "New Blue Moon early access request.",
    "",
    `Name: ${request.name}`,
    `Email: ${request.email}`,
    `Interest: ${request.interest}`,
    `Request ID: ${requestId || "unknown"}`
  ].join("\n");

  const result = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `early-access-${requestId || sha256(request.email).slice(0, 24)}`
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [process.env.EARLY_ACCESS_NOTIFY_TO],
      subject: `Blue Moon early access: ${escapeText(request.interest)}`,
      html: `<p>New Blue Moon early access request.</p><ul><li>Name: ${escapeText(request.name)}</li><li>Email: ${escapeText(request.email)}</li><li>Interest: ${escapeText(request.interest)}</li></ul>`,
      text,
      tags: [
        { name: "flow", value: "early_access" },
        { name: "interest", value: request.interest.toLowerCase().replace(/[^a-z0-9]+/g, "_") }
      ]
    })
  });

  const data = await result.json().catch(() => ({}));
  if (!result.ok) {
    return {
      sent: false,
      reason: "notification_send_failed",
      status: result.status
    };
  }

  return {
    sent: true,
    id: data.id || ""
  };
}

export default async function handler(request, response) {
  const meta = requestMeta(request, "api/early-access");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return respondJson(response, 405, { ok: false, error: "method_not_allowed" }, {
      ...meta,
      event: "early_access.method_not_allowed"
    });
  }

  let body = {};
  try {
    body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
  } catch (error) {
    return respondJson(response, 400, { ok: false, error: "invalid_json" }, {
      ...meta,
      event: "early_access.invalid_json"
    });
  }

  const normalized = normalizeRequest(body);
  if (!normalized.ok) {
    const status = normalized.error === "bot_detected" ? 400 : 422;
    return respondJson(response, status, { ok: false, error: normalized.error }, {
      ...meta,
      event: normalized.error === "bot_detected" ? "early_access.bot_detected" : "early_access.invalid_request"
    });
  }

  if (!supabaseConfigured()) {
    return respondJson(response, 202, {
      ok: true,
      requestSaved: false,
      notificationSent: false,
      reason: "database_not_configured"
    }, {
      ...meta,
      event: "early_access.database_not_configured",
      interest: normalized.interest
    });
  }

  const rateLimit = await enforceRateLimit(request);
  if (!rateLimit.allowed) {
    if (rateLimit.retryAfterSeconds) {
      response.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
    }
    return respondJson(response, rateLimit.status, {
      ok: false,
      requestSaved: false,
      notificationSent: false,
      error: rateLimit.error,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      upstreamStatus: rateLimit.upstreamStatus
    }, {
      ...meta,
      event: "early_access.rate_limited",
      interest: normalized.interest,
      upstreamStatus: rateLimit.upstreamStatus
    });
  }

  const saved = await saveEarlyAccessRequest(normalized.request);
  if (!saved.saved) {
    const status = saved.reason === "duplicate_request" ? 409 : 502;
    return respondJson(response, status, {
      ok: false,
      requestSaved: false,
      notificationSent: false,
      error: saved.reason,
      status: saved.status
    }, {
      ...meta,
      event: "early_access.save_rejected",
      interest: normalized.interest,
      upstreamStatus: saved.status
    });
  }

  const notification = await sendOperatorNotification(normalized.request, saved.id);
  if (!notification.sent) {
    return respondJson(response, 202, {
      ok: true,
      requestSaved: true,
      notificationSent: false,
      reason: notification.reason,
      status: notification.status,
      requestId: saved.id
    }, {
      ...meta,
      event: "early_access.notification_not_sent",
      interest: normalized.interest,
      requestId: saved.id,
      upstreamStatus: notification.status
    });
  }

  return respondJson(response, 200, {
    ok: true,
    requestSaved: true,
    notificationSent: true,
    requestId: saved.id,
    notificationId: notification.id
  }, {
    ...meta,
    event: "early_access.completed",
    interest: normalized.interest,
    requestId: saved.id
  });
}
