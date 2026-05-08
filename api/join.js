import { createHash } from "node:crypto";
import { requestMeta, respondJson } from "../lib/observability.js";

const MAX = {
  id: 120,
  email: 254,
  short: 180,
  long: 1200,
  url: 500
};

function clean(value, maxLength = MAX.long) {
  return String(value || "").trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function safeTagValue(value, fallback) {
  return clean(value, MAX.id).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256) || fallback;
}

function safeDbId(value) {
  const id = clean(value, MAX.id).toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  return /^[a-z0-9][a-z0-9_-]{2,119}$/.test(id) ? id : "";
}

function slugify(value) {
  return clean(value, MAX.short)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "blue-moon-event";
}

function safeTimeZone(value) {
  const timeZone = clean(value, MAX.short) || "America/Los_Angeles";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch (error) {
    return "America/Los_Angeles";
  }
}

function formatDateLabel(value, timeZone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date to be confirmed";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: safeTimeZone(timeZone)
  }).format(date);
}

function formatTimeLabel(value, timeZone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time to be confirmed";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: safeTimeZone(timeZone)
  }).format(date);
}

function eventUrl(value, eventId) {
  const fallback = `https://blue-moon.vercel.app/events/${encodeURIComponent(eventId)}`;
  try {
    const url = new URL(clean(value, MAX.url));
    if (!["http:", "https:"].includes(url.protocol)) return fallback;
    if (!["blue-moon.vercel.app", "localhost", "127.0.0.1"].includes(url.hostname)) return fallback;
    if (!url.pathname.includes(`/events/${eventId}`)) return fallback;
    return url.toString();
  } catch (error) {
    return fallback;
  }
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function publicEvent(record, requestEvent) {
  const id = clean(record.id, MAX.id);
  const timeZone = safeTimeZone(record.time_zone);
  const startTime = clean(record.start_time, MAX.short);
  return {
    id,
    title: clean(record.title, MAX.short) || "Blue Moon event",
    dateLabel: formatDateLabel(startTime, timeZone),
    timeLabel: formatTimeLabel(startTime, timeZone),
    locationName: clean(record.location_name, MAX.short) || "Location to be confirmed",
    organizer: clean(record.organizer_name, MAX.short) || "Blue Moon organizer",
    organizerEmail: emailAddress(record.organizer_email),
    summary: clean(record.summary, MAX.long) || "A local event on Blue Moon.",
    bring: clean(record.bring, MAX.long),
    startTime,
    endTime: clean(record.end_time, MAX.short),
    timeZone,
    maxParticipants: numberOrNull(record.max_participants),
    participantCountSeed: Math.max(numberOrNull(record.participant_count_seed) || 0, 0),
    url: eventUrl(requestEvent.url, id)
  };
}

async function findPublishedEvent(eventId) {
  if (!supabaseConfigured()) {
    return { configured: false };
  }

  const query = new URLSearchParams({
    select: [
      "id",
      "title",
      "location_name",
      "start_time",
      "end_time",
      "time_zone",
      "organizer_name",
      "organizer_email",
      "status",
      "max_participants",
      "participant_count_seed",
      "summary",
      "bring"
    ].join(","),
    id: `eq.${eventId}`,
    status: "eq.published",
    limit: "1"
  });
  const result = await fetch(`${supabaseBase()}/rest/v1/events?${query.toString()}`, {
    headers: supabaseHeaders()
  });

  if (!result.ok) {
    return {
      configured: true,
      ok: false,
      reason: "event_lookup_failed",
      status: result.status
    };
  }

  const events = await result.json().catch(() => []);
  return {
    configured: true,
    ok: true,
    event: Array.isArray(events) ? events[0] || null : null
  };
}

function headerValue(headers, name) {
  if (!headers) return "";
  const lowerName = name.toLowerCase();
  if (typeof headers.get === "function") {
    return headers.get(name) || headers.get(lowerName) || "";
  }
  return headers[lowerName] || headers[name] || "";
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function positiveIntEnv(name, fallback, minimum, maximum) {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value < minimum || value > maximum) return fallback;
  return value;
}

function rateLimitSettings() {
  return {
    windowSeconds: positiveIntEnv("JOIN_RATE_LIMIT_WINDOW_SECONDS", 600, 60, 86400),
    ipMax: positiveIntEnv("JOIN_RATE_LIMIT_MAX", 20, 1, 10000),
    emailMax: positiveIntEnv("JOIN_EMAIL_RATE_LIMIT_MAX", 3, 1, 1000)
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
  return clean(headerValue(request.headers, "user-agent"), 500) || "unknown";
}

function rateLimitSubject(kind, request, eventId, email) {
  const salt = clean(process.env.RATE_LIMIT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "blue-moon", 500);
  const identity = kind === "email"
    ? `${eventId}:${email}`
    : `${requestIp(request)}:${requestUserAgent(request)}`;
  return sha256(`${salt}:${kind}:${identity}`);
}

async function recordRateLimitHit(route, subjectHash, windowStart, windowSeconds, limit) {
  const result = await fetch(`${supabaseBase()}/rest/v1/rpc/record_api_rate_limit_hit`, {
    method: "POST",
    headers: supabaseHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({
      requested_route: route,
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

async function enforceJoinRateLimit(request, eventId, email) {
  if (String(process.env.JOIN_RATE_LIMIT_DISABLED || "").toLowerCase() === "true") {
    return { allowed: true };
  }

  const settings = rateLimitSettings();
  const windowStart = rateLimitWindowStart(settings.windowSeconds);
  const checks = [
    {
      route: "join-ip",
      subjectHash: rateLimitSubject("ip", request, eventId, email),
      limit: settings.ipMax
    },
    {
      route: "join-email",
      subjectHash: rateLimitSubject("email", request, eventId, email),
      limit: settings.emailMax
    }
  ];

  for (const check of checks) {
    const result = await recordRateLimitHit(
      check.route,
      check.subjectHash,
      windowStart,
      settings.windowSeconds,
      check.limit
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
        retryAfterSeconds: result.retryAfterSeconds,
        scope: check.route
      };
    }
  }

  return { allowed: true };
}

async function saveJoinToSupabase(event, join) {
  const result = await fetch(`${supabaseBase()}/rest/v1/rpc/join_published_event`, {
    method: "POST",
    headers: supabaseHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({
      requested_join_id: safeDbId(join.id) || null,
      requested_event_id: clean(event.id, MAX.id),
      participant_name: clean(join.name, MAX.short),
      participant_email: emailAddress(join.email),
      requested_visibility: join.visibility === "public" ? "public" : "private",
      requested_reminder_opt_in: Boolean(join.reminderOptIn)
    })
  });

  const data = await result.json().catch(() => ({}));
  if (!result.ok) {
    return {
      saved: false,
      reason: "database_save_failed",
      status: result.status
    };
  }
  if (data.saved === false) {
    return {
      saved: false,
      reason: data.reason || "database_save_failed",
      id: data.id || "",
      participantCount: data.participantCount,
      capacity: data.capacity
    };
  }

  return {
    saved: true,
    id: data.id || safeDbId(join.id) || ""
  };
}

function receiptText(event, join) {
  return [
    `You're joining ${event.title}.`,
    "",
    `Date: ${event.dateLabel}`,
    `Time: ${event.timeLabel}`,
    `Location: ${event.locationName}`,
    `Organizer: ${event.organizer}`,
    `Visibility: ${join.visibility === "public" ? "Public" : "Private"}`,
    `Day-of reminder: ${join.reminderOptIn ? "Requested" : "Off"}`,
    "",
    event.summary,
    "",
    `Event link: ${event.url}`
  ].join("\n");
}

function receiptHtml(event, join) {
  return `
    <p>You're joining <strong>${escapeHtml(event.title)}</strong>.</p>
    <ul>
      <li><strong>Date:</strong> ${escapeHtml(event.dateLabel)}</li>
      <li><strong>Time:</strong> ${escapeHtml(event.timeLabel)}</li>
      <li><strong>Location:</strong> ${escapeHtml(event.locationName)}</li>
      <li><strong>Organizer:</strong> ${escapeHtml(event.organizer)}</li>
      <li><strong>Visibility:</strong> ${join.visibility === "public" ? "Public" : "Private"}</li>
    </ul>
    <p>${escapeHtml(event.summary)}</p>
    <p><a href="${escapeHtml(event.url)}">Open the event page</a></p>
  `;
}

function formatIcsDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function eventDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calendarAttachment(event, join, joinId) {
  const start = eventDate(event.startTime);
  if (!start) return undefined;
  const end = eventDate(event.endTime) || new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const description = [
    event.summary,
    event.bring ? `Bring: ${event.bring}` : "",
    `Organizer: ${event.organizer}`,
    `Event link: ${event.url}`
  ].filter(Boolean).join("\n");

  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Blue Moon//Server Event Join//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcs(`${safeTagValue(joinId || join.id, "join")}@blue-moon.vercel.app`)}`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `LOCATION:${escapeIcs(event.locationName)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `URL:${escapeIcs(event.url)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcs(`Reminder: ${event.title} today`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");

  return {
    filename: `${slugify(event.title)}.ics`,
    content: Buffer.from(content, "utf8").toString("base64")
  };
}

function botFieldFilled(body, join) {
  return Boolean(clean(body.website || body.company || join.website || join.company, MAX.short));
}

function joinSaveStatus(reason) {
  if (reason === "duplicate_join" || reason === "event_full") return 409;
  if (reason === "event_not_found") return 404;
  return 502;
}

export default async function handler(request, response) {
  const meta = requestMeta(request, "api/join");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return respondJson(response, 405, { ok: false, error: "method_not_allowed" }, {
      ...meta,
      event: "join.method_not_allowed"
    });
  }

  let body = {};
  try {
    body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
  } catch (error) {
    return respondJson(response, 400, { ok: false, error: "invalid_json" }, {
      ...meta,
      event: "join.invalid_json"
    });
  }
  const { event = {}, join = {} } = body;
  const eventId = clean(event.id, MAX.id);
  const to = emailAddress(join.email);
  const name = clean(join.name, MAX.short);

  if (!eventId) {
    return respondJson(response, 400, { ok: false, error: "missing_event" }, {
      ...meta,
      event: "join.invalid_request"
    });
  }
  if (!name) {
    return respondJson(response, 400, { ok: false, error: "missing_name" }, {
      ...meta,
      event: "join.invalid_request",
      eventId
    });
  }
  if (!to) {
    return respondJson(response, 400, { ok: false, error: "missing_email" }, {
      ...meta,
      event: "join.invalid_request",
      eventId
    });
  }
  if (botFieldFilled(body, join)) {
    return respondJson(response, 400, { ok: false, error: "bot_detected" }, {
      ...meta,
      event: "join.bot_detected",
      eventId
    });
  }

  if (!supabaseConfigured()) {
    return respondJson(response, 202, {
      ok: true,
      joinSaved: false,
      emailSent: false,
      reason: "database_not_configured",
      reminderRequested: Boolean(join.reminderOptIn)
    }, {
      ...meta,
      event: "join.database_not_configured",
      eventId
    });
  }

  const rateLimit = await enforceJoinRateLimit(request, eventId, to);
  if (!rateLimit.allowed) {
    if (rateLimit.retryAfterSeconds) {
      response.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
    }
    return respondJson(response, rateLimit.status, {
      ok: false,
      joinSaved: false,
      emailSent: false,
      error: rateLimit.error,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      upstreamStatus: rateLimit.upstreamStatus
    }, {
      ...meta,
      event: "join.rate_limited",
      eventId,
      scope: rateLimit.scope,
      upstreamStatus: rateLimit.upstreamStatus
    });
  }

  const eventLookup = await findPublishedEvent(eventId);
  if (!eventLookup.ok) {
    return respondJson(response, 502, { ok: false, error: eventLookup.reason, status: eventLookup.status }, {
      ...meta,
      event: "join.event_lookup_failed",
      eventId,
      upstreamStatus: eventLookup.status
    });
  }
  if (!eventLookup.event) {
    return respondJson(response, 404, { ok: false, error: "event_not_found" }, {
      ...meta,
      event: "join.event_not_found",
      eventId
    });
  }

  const verifiedEvent = publicEvent(eventLookup.event, event);
  const verifiedJoin = {
    ...join,
    name,
    email: to,
    visibility: join.visibility === "public" ? "public" : "private",
    reminderOptIn: Boolean(join.reminderOptIn)
  };

  const joinSave = await saveJoinToSupabase(verifiedEvent, verifiedJoin);
  if (!joinSave.saved) {
    return respondJson(response, joinSaveStatus(joinSave.reason), {
      ok: false,
      joinSaved: false,
      emailSent: false,
      error: joinSave.reason,
      participantCount: joinSave.participantCount,
      capacity: joinSave.capacity
    }, {
      ...meta,
      event: "join.save_rejected",
      eventId,
      participantCount: joinSave.participantCount,
      capacity: joinSave.capacity
    });
  }

  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    return respondJson(response, 202, {
      ok: true,
      joinSaved: true,
      emailSent: false,
      reason: "email_not_configured",
      joinId: joinSave.id,
      reminderRequested: verifiedJoin.reminderOptIn
    }, {
      ...meta,
      event: "join.email_not_configured",
      eventId,
      joinId: joinSave.id
    });
  }

  const attachment = calendarAttachment(verifiedEvent, verifiedJoin, joinSave.id);
  const payload = {
    from: process.env.EMAIL_FROM,
    to: [to],
    subject: `You're joining ${verifiedEvent.title}`,
    html: receiptHtml(verifiedEvent, verifiedJoin),
    text: receiptText(verifiedEvent, verifiedJoin),
    attachments: attachment ? [attachment] : undefined,
    tags: [
      { name: "event_id", value: safeTagValue(verifiedEvent.id, "blue_moon_event") },
      { name: "join_visibility", value: verifiedJoin.visibility }
    ]
  };

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `join-${safeTagValue(verifiedEvent.id, "event")}-${safeTagValue(joinSave.id, "participant")}`
    },
    body: JSON.stringify(payload)
  });

  const data = await resendResponse.json().catch(() => ({}));
  if (!resendResponse.ok) {
    return respondJson(response, 502, {
      ok: false,
      joinSaved: true,
      emailSent: false,
      error: "email_send_failed",
      status: resendResponse.status,
      joinId: joinSave.id
    }, {
      ...meta,
      event: "join.email_send_failed",
      eventId,
      joinId: joinSave.id,
      upstreamStatus: resendResponse.status
    });
  }

  return respondJson(response, 200, {
    ok: true,
    joinSaved: true,
    emailSent: true,
    id: data.id,
    joinId: joinSave.id,
    calendarGenerated: Boolean(attachment),
    reminderRequested: verifiedJoin.reminderOptIn
  }, {
    ...meta,
    event: "join.completed",
    eventId,
    joinId: joinSave.id,
    calendarGenerated: Boolean(attachment),
    reminderRequested: verifiedJoin.reminderOptIn
  });
}
