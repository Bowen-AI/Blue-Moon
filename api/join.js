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

async function saveJoinToSupabase(event, join) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { saved: false, reason: "database_not_configured" };
  }

  const payload = {
    id: clean(join.id) || undefined,
    event_id: clean(event.id),
    name: clean(join.name),
    email: clean(join.email),
    visibility: join.visibility === "public" ? "public" : "private",
    reminder_opt_in: Boolean(join.reminderOptIn),
    status: "joined",
    joined_at: new Date().toISOString()
  };

  const result = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/event_participants`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(payload)
  });

  if (!result.ok) {
    return {
      saved: false,
      reason: "database_save_failed",
      detail: await result.text().catch(() => "")
    };
  }

  return { saved: true };
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  let body = {};
  try {
    body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
  } catch (error) {
    return response.status(400).json({ ok: false, error: "invalid_json" });
  }
  const { event = {}, join = {}, receipt = {}, calendar = {} } = body;
  const to = clean(join.email);
  const subject = clean(receipt.subject) || `You're joining ${clean(event.title) || "a Blue Moon event"}`;

  if (!to || !to.includes("@")) {
    return response.status(400).json({ ok: false, error: "missing_email" });
  }

  const joinSave = await saveJoinToSupabase(event, join);

  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    return response.status(202).json({
      ok: true,
      joinSaved: joinSave.saved,
      emailSent: false,
      reason: "email_not_configured",
      reminderRequested: Boolean(join.reminderOptIn)
    });
  }

  const html = receipt.html || `
    <p>You're joining <strong>${escapeHtml(event.title)}</strong>.</p>
    <p>${escapeHtml(event.dateLabel)} · ${escapeHtml(event.timeLabel)}</p>
    <p>${escapeHtml(event.locationName)}</p>
    <p><a href="${escapeHtml(event.url)}">Open the event page</a></p>
  `;

  const payload = {
    from: process.env.EMAIL_FROM,
    to: [to],
    subject,
    html,
    text: receipt.text || "",
    attachments: calendar.content
      ? [
          {
            filename: clean(calendar.filename) || "blue-moon-event.ics",
            content: Buffer.from(calendar.content, "utf8").toString("base64")
          }
        ]
      : undefined,
    tags: [
      { name: "event_id", value: clean(event.id).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256) || "blue_moon_event" },
      { name: "join_visibility", value: join.visibility === "public" ? "public" : "private" }
    ]
  };

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await resendResponse.json().catch(() => ({}));
  if (!resendResponse.ok) {
    return response.status(502).json({
      ok: false,
      emailSent: false,
      error: "email_send_failed",
      detail: data
    });
  }

  return response.status(200).json({
    ok: true,
    joinSaved: joinSave.saved,
    emailSent: true,
    id: data.id,
    reminderRequested: Boolean(join.reminderOptIn)
  });
}
