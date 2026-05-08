import { requestMeta, respondJson } from "../lib/observability.js";

function clean(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dayRange(offsetDays) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + offsetDays);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function dateLabel(date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(date);
}

function supabaseHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
  };
}

async function supabaseGet(path) {
  const base = process.env.SUPABASE_URL.replace(/\/$/, "");
  const result = await fetch(`${base}/rest/v1/${path}`, {
    headers: supabaseHeaders()
  });
  if (!result.ok) {
    throw new Error(await result.text().catch(() => "supabase_request_failed"));
  }
  return result.json();
}

async function eventsForRange(range) {
  const query = new URLSearchParams({
    select: "id,title,location_name,start_time,organizer_name,organizer_email,status",
    status: "eq.published",
    start_time: `gte.${range.start.toISOString()}`
  });
  const path = `events?${query.toString()}&start_time=lt.${encodeURIComponent(range.end.toISOString())}`;
  return supabaseGet(path);
}

async function participantsForEvent(eventId) {
  const query = new URLSearchParams({
    select: "name,email,visibility,status,joined_at",
    event_id: `eq.${eventId}`,
    status: "eq.joined",
    order: "joined_at.asc"
  });
  return supabaseGet(`event_participants?${query.toString()}`);
}

function rosterText(participants) {
  if (!participants.length) return "No one has joined yet.";
  return participants
    .map((participant, index) => `${index + 1}. ${clean(participant.name) || "Unnamed participant"} <${clean(participant.email) || "no email"}> (${participant.visibility === "public" ? "public on page" : "private on page"})`)
    .join("\n");
}

function rosterHtml(participants) {
  if (!participants.length) return "<p>No one has joined yet.</p>";
  return `
    <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%">
      <thead>
        <tr>
          <th align="left">Name</th>
          <th align="left">Email</th>
          <th align="left">Page visibility</th>
        </tr>
      </thead>
      <tbody>
        ${participants.map((participant) => `
          <tr>
            <td>${escapeHtml(participant.name) || "Unnamed participant"}</td>
            <td>${escapeHtml(participant.email) || "No email"}</td>
            <td>${participant.visibility === "public" ? "Public" : "Private"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function sendOrganizerEmail(event, participants, kind) {
  const organizerEmail = clean(event.organizer_email);
  if (!organizerEmail) return { sent: false, reason: "missing_organizer_email" };

  const start = new Date(event.start_time);
  const timing = kind === "day_before" ? "tomorrow" : "today";
  const subject = `Blue Moon roster for ${event.title} ${timing}`;
  const text = [
    `${event.title} is ${timing}.`,
    "",
    `When: ${dateLabel(start)}`,
    `Where: ${event.location_name || "Location to be confirmed"}`,
    `Joining: ${participants.length}`,
    "",
    rosterText(participants)
  ].join("\n");

  const html = `
    <p><strong>${escapeHtml(event.title)}</strong> is ${timing}.</p>
    <p><strong>When:</strong> ${escapeHtml(dateLabel(start))}<br>
    <strong>Where:</strong> ${escapeHtml(event.location_name || "Location to be confirmed")}<br>
    <strong>Joining:</strong> ${participants.length}</p>
    ${rosterHtml(participants)}
    <p style="color:#52666a">Private means hidden from the public event page. Organizers receive this roster so they can coordinate the event.</p>
  `;

  const result = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `organizer-${event.id}-${kind}-${new Date().toISOString().slice(0, 10)}`
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [organizerEmail],
      subject,
      text,
      html,
      tags: [
        { name: "event_id", value: clean(event.id).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256) || "blue_moon_event" },
        { name: "reminder_kind", value: kind }
      ]
    })
  });

  const data = await result.json().catch(() => ({}));
  if (!result.ok) {
    return { sent: false, reason: "email_send_failed", status: result.status };
  }
  return { sent: true, id: data.id };
}

async function sendDigestForRange(kind, range) {
  const events = await eventsForRange(range);
  const results = [];
  for (const event of events) {
    const participants = await participantsForEvent(event.id);
    const email = await sendOrganizerEmail(event, participants, kind);
    results.push({
      eventId: event.id,
      kind,
      participantCount: participants.length,
      ...email
    });
  }
  return results;
}

export default async function handler(request, response) {
  const meta = requestMeta(request, "api/organizer-reminders");

  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    return respondJson(response, 405, { ok: false, error: "method_not_allowed" }, {
      ...meta,
      event: "reminders.method_not_allowed"
    });
  }

  const configured = process.env.SUPABASE_URL
    && process.env.SUPABASE_SERVICE_ROLE_KEY
    && process.env.RESEND_API_KEY
    && process.env.EMAIL_FROM;

  if (!configured) {
    return respondJson(response, 202, {
      ok: true,
      sent: 0,
      reason: "reminders_not_configured"
    }, {
      ...meta,
      event: "reminders.not_configured"
    });
  }

  const cronSecret = clean(process.env.CRON_SECRET);
  if (!cronSecret) {
    return respondJson(response, 503, {
      ok: false,
      error: "cron_secret_required"
    }, {
      ...meta,
      event: "reminders.cron_secret_required"
    });
  }

  const auth = request.headers.authorization || "";
  if (auth !== `Bearer ${cronSecret}`) {
    return respondJson(response, 401, { ok: false, error: "unauthorized" }, {
      ...meta,
      event: "reminders.unauthorized"
    });
  }

  let dayBefore = [];
  let dayOf = [];
  try {
    dayBefore = await sendDigestForRange("day_before", dayRange(1));
    dayOf = await sendDigestForRange("day_of", dayRange(0));
  } catch (error) {
    return respondJson(response, 502, {
      ok: false,
      error: "reminder_digest_failed"
    }, {
      ...meta,
      event: "reminders.digest_failed",
      errorClass: error?.name || "Error"
    });
  }

  const results = [...dayBefore, ...dayOf];

  return respondJson(response, 200, {
    ok: true,
    sent: results.filter((result) => result.sent).length,
    results
  }, {
    ...meta,
    event: "reminders.completed",
    sent: results.filter((result) => result.sent).length,
    failed: results.filter((result) => !result.sent).length,
    eventCount: results.length
  });
}
