import { headerValue, requestMeta, respondJson } from "../lib/observability.js";

function clean(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function configured(...keys) {
  return keys.every((key) => Boolean(clean(process.env[key])));
}

function releaseVersion() {
  return clean(process.env.VERCEL_GIT_COMMIT_SHA, 40).slice(0, 12) || "local";
}

function runtimeEnvironment() {
  return clean(process.env.VERCEL_ENV || process.env.NODE_ENV || "local", 80);
}

function requestUrl(request) {
  return new URL(request.url || "/api/health", "http://127.0.0.1");
}

function truthyParam(url, name) {
  const value = url.searchParams.get(name);
  return value === "1" || value === "true" || value === "yes";
}

function bearerToken(request) {
  const auth = clean(headerValue(request.headers, "authorization"), 1000);
  return auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
}

function publicPayload(check) {
  return {
    ok: true,
    service: "blue-moon",
    check,
    version: releaseVersion(),
    environment: runtimeEnvironment(),
    timestamp: new Date().toISOString()
  };
}

function configurationChecks() {
  return [
    {
      name: "supabase",
      ok: configured("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"),
      required: true,
      detail: configured("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY") ? "configured" : "missing"
    },
    {
      name: "email",
      ok: configured("RESEND_API_KEY", "EMAIL_FROM"),
      required: true,
      detail: configured("RESEND_API_KEY", "EMAIL_FROM") ? "configured" : "missing"
    },
    {
      name: "cron_auth",
      ok: configured("CRON_SECRET"),
      required: true,
      detail: configured("CRON_SECRET") ? "configured" : "missing"
    },
    {
      name: "rate_limit_salt",
      ok: configured("RATE_LIMIT_SALT"),
      required: false,
      detail: configured("RATE_LIMIT_SALT") ? "configured" : "recommended_before_ga"
    }
  ];
}

async function supabasePublishedEventCheck() {
  if (!configured("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")) {
    return {
      name: "supabase_public_events",
      ok: false,
      required: true,
      detail: "supabase_not_configured"
    };
  }

  const base = process.env.SUPABASE_URL.replace(/\/$/, "");
  try {
    const result = await fetch(`${base}/rest/v1/published_events_public?select=id&limit=1`, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    if (!result.ok) {
      return {
        name: "supabase_public_events",
        ok: false,
        required: true,
        status: result.status,
        detail: "query_failed"
      };
    }
    const rows = await result.json().catch(() => null);
    const count = Array.isArray(rows) ? rows.length : 0;
    return {
      name: "supabase_public_events",
      ok: count > 0,
      required: true,
      count,
      detail: count > 0 ? "published_event_visible" : "no_published_events"
    };
  } catch (error) {
    return {
      name: "supabase_public_events",
      ok: false,
      required: true,
      detail: "request_failed"
    };
  }
}

export default async function handler(request, response) {
  const meta = requestMeta(request, "api/health");
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return respondJson(response, 405, { ok: false, error: "method_not_allowed" }, {
      ...meta,
      event: "health.method_not_allowed"
    });
  }

  const url = requestUrl(request);
  const readiness = truthyParam(url, "readiness") || truthyParam(url, "ready");
  const deep = truthyParam(url, "deep");

  if (!readiness) {
    return respondJson(response, 200, publicPayload("liveness"), {
      ...meta,
      event: "health.liveness"
    });
  }

  const cronSecret = clean(process.env.CRON_SECRET);
  if (!cronSecret) {
    return respondJson(response, 503, { ...publicPayload("readiness"), ok: false, error: "cron_secret_required" }, {
      ...meta,
      event: "health.cron_secret_required"
    });
  }

  if (bearerToken(request) !== cronSecret) {
    return respondJson(response, 401, { ok: false, error: "unauthorized" }, {
      ...meta,
      event: "health.unauthorized"
    });
  }

  const checks = configurationChecks();
  if (deep) {
    checks.push(await supabasePublishedEventCheck());
  }
  const ready = checks.filter((check) => check.required).every((check) => check.ok);
  const payload = {
    ...publicPayload("readiness"),
    ok: ready,
    deep,
    checks
  };

  return respondJson(response, ready ? 200 : 503, payload, {
    ...meta,
    event: "health.readiness",
    ready,
    deep
  });
}
