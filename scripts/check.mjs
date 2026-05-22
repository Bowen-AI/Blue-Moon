import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.BLUE_MOON_LOG_SILENT = "1";
const envKeys = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "CRON_SECRET",
  "RATE_LIMIT_SALT",
  "JOIN_RATE_LIMIT_WINDOW_SECONDS",
  "JOIN_RATE_LIMIT_MAX",
  "JOIN_EMAIL_RATE_LIMIT_MAX",
  "JOIN_RATE_LIMIT_DISABLED",
  "EARLY_ACCESS_RATE_LIMIT_WINDOW_SECONDS",
  "EARLY_ACCESS_RATE_LIMIT_MAX",
  "EARLY_ACCESS_RATE_LIMIT_DISABLED",
  "EARLY_ACCESS_NOTIFY_TO",
  "TRUST_REPORT_RATE_LIMIT_WINDOW_SECONDS",
  "TRUST_REPORT_RATE_LIMIT_MAX",
  "TRUST_REPORT_RATE_LIMIT_DISABLED"
];

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: "pipe" });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function mockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

async function withEnv(values, callback) {
  const previous = new Map(envKeys.map((key) => [key, process.env[key]]));
  envKeys.forEach((key) => {
    delete process.env[key];
  });
  Object.entries(values).forEach(([key, value]) => {
    process.env[key] = value;
  });

  try {
    await callback();
  } finally {
    envKeys.forEach((key) => {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
}

async function withFetch(fetchImpl, callback) {
  const previous = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    await callback();
  } finally {
    globalThis.fetch = previous;
  }
}

async function apiHandler(file) {
  const moduleUrl = `${pathToFileURL(path.join(root, file)).href}?check=${Date.now()}-${Math.random()}`;
  const module = await import(moduleUrl);
  return module.default;
}

function loadWindowValue(file, key) {
  const context = { window: {} };
  vm.runInNewContext(readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  return context.window[key];
}

function sectionBetween(content, startNeedle, endNeedle) {
  const lower = content.toLowerCase();
  const start = lower.indexOf(startNeedle.toLowerCase());
  assert.notEqual(start, -1, `Missing section: ${startNeedle}`);
  const end = endNeedle ? lower.indexOf(endNeedle.toLowerCase(), start + startNeedle.length) : -1;
  return content.slice(start, end === -1 ? content.length : end);
}

function checkSyntaxAndJson() {
  [
    "site.js",
    "events.js",
    "account.js",
    "member-utils.js",
    "app.js",
    "event-page.js",
    "member-page.js",
    "lib/observability.js",
    "api/early-access.js",
    "api/health.js",
    "api/join.js",
    "api/organizer-reminders.js",
    "api/trust-report.js",
    "scripts/browser-smoke.mjs"
  ].forEach((file) => run("node", ["--check", file]));

  ["events.json", "site.webmanifest", "vercel.json"].forEach((file) => {
    JSON.parse(readFileSync(path.join(root, file), "utf8"));
  });
}

function checkEventInventory() {
  const scriptEvents = loadWindowValue("events.js", "BLUE_MOON_EVENTS");
  const jsonEvents = JSON.parse(readFileSync(path.join(root, "events.json"), "utf8")).events;
  assert.ok(Array.isArray(scriptEvents), "events.js should expose an event array");
  const scriptEventIds = Array.from(scriptEvents, (event) => event.id);
  const jsonEventIds = Array.from(jsonEvents, (event) => event.id);
  assert.deepEqual(
    scriptEventIds,
    jsonEventIds,
    "events.js and events.json should list the same event ids"
  );

  for (const event of scriptEvents) {
    assert.match(event.id, /^[a-z0-9-]+$/, `event id should be URL-safe: ${event.id}`);
    assert.ok(event.title, `event should have a title: ${event.id}`);
    assert.ok(["published", "completed"].includes(event.status), `event should have a GA-supported status: ${event.id}`);
    assert.ok(!Number.isNaN(new Date(event.dateTime).getTime()), `event should have parseable dateTime: ${event.id}`);
    assert.ok(existsSync(path.join(root, "events", `${event.id}.md`)), `event markdown mirror missing: ${event.id}`);
  }
}

function checkTrustSafetyUxContract() {
  const app = readFileSync(path.join(root, "app.js"), "utf8");
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  const eventPage = readFileSync(path.join(root, "event-page.js"), "utf8");

  assert.ok(!app.includes("Approve organization"), "public browser UI must not include a self-approval control");
  assert.ok(index.includes("A maintainer must approve"), "organization copy should name maintainer review");
  assert.ok(app.includes("/api/early-access"), "early access form should submit to the backend route when enabled");
  assert.ok(app.includes("blueMoonWaitlist"), "early access form should preserve local demo submissions");
  assert.ok(eventPage.includes("/api/trust-report"), "event pages should submit trust reports to the backend route");
  assert.ok(eventPage.includes("blueMoonTrustReports"), "event pages should preserve local demo report submissions");
}

function checkSeoMetadata() {
  const verification = '<meta name="google-site-verification" content="NwJpwhXA1G-YpV--g6VyNhiFM9226IUPxmlSFHf_dKI">';
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  const event = readFileSync(path.join(root, "event.html"), "utf8");
  const member = readFileSync(path.join(root, "member.html"), "utf8");
  const robots = readFileSync(path.join(root, "robots.txt"), "utf8");
  const sitemap = readFileSync(path.join(root, "sitemap.xml"), "utf8");
  const vercelConfig = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8"));

  [index, event, member].forEach((html) => {
    assert.ok(html.includes(verification), "entry HTML should include the Google Search Console verification tag");
  });

  assert.match(index, /<title>Blue Moon Beige \| Local good-action events<\/title>/);
  assert.match(index, /<h1>Blue Moon Beige<\/h1>/);
  assert.match(index, /<span class="example-flag">Example event<\/span>/);
  assert.match(index, /href="\/event\?id=santa-monica-beach-cleanup"/);
  assert.match(event, /<title>Blue Moon Beige Event<\/title>/);
  assert.match(member, /<title>Blue Moon Beige Member<\/title>/);
  assert.match(index, /<link rel="canonical" href="https:\/\/bluemoonbeige\.vercel\.app\/">/);
  assert.match(index, /<link rel="alternate" hreflang="x-default" href="https:\/\/bluemoonbeige\.vercel\.app\/">/);
  const structuredDataMatch = index.match(/<script id="blue-moon-structured-data" type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(structuredDataMatch, "home page should include source-visible JSON-LD");
  const structuredData = JSON.parse(structuredDataMatch[1]);
  assert.equal(structuredData[0]["@type"], "WebSite");
  assert.equal(structuredData[0].name, "Blue Moon Beige");
  assert.ok(structuredData[0].alternateName.includes("bluemoon beige"));
  assert.equal(structuredData[1]["@type"], "Organization");
  assert.ok(structuredData[1].alternateName.includes("Blue Moon Beige"));
  assert.match(robots, /Sitemap: https:\/\/bluemoonbeige\.vercel\.app\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/bluemoonbeige\.vercel\.app\/<\/loc>/);
  assert.match(sitemap, /<lastmod>2026-05-22<\/lastmod>/);
  assert.deepEqual(
    vercelConfig.rewrites.slice(0, 2),
    [
      { source: "/events/:slug", destination: "/event?id=:slug" },
      { source: "/members/:id", destination: "/member?id=:id" }
    ],
    "clean Vercel event/member URLs should rewrite to clean HTML routes with query ids"
  );
}

function checkBackendContractFiles() {
  const migrationFile = "supabase/migrations/202605080001_ga_schema.sql";
  const seedFile = "supabase/seed.sql";
  const productionSetupFile = "docs/PRODUCTION_SETUP.md";
  const trustSafetyFile = "docs/TRUST_AND_SAFETY.md";
  const migrationFiles = readdirSync(path.join(root, "supabase/migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  assert.deepEqual(
    migrationFiles,
    ["202605080001_ga_schema.sql"],
    "Supabase migrations should expose one canonical GA schema file"
  );

  [migrationFile, seedFile, productionSetupFile, trustSafetyFile].forEach((file) => {
    assert.ok(existsSync(path.join(root, file)), `${file} should exist`);
  });

  const migration = readFileSync(path.join(root, migrationFile), "utf8");
  const seed = readFileSync(path.join(root, seedFile), "utf8");
  const productionSetup = readFileSync(path.join(root, productionSetupFile), "utf8");
  const trustSafety = readFileSync(path.join(root, trustSafetyFile), "utf8");

  [
    "profiles",
    "organizations",
    "organization_members",
    "events",
    "event_participants",
    "event_proofs",
    "trust_reports",
    "early_access_requests",
    "audit_log",
    "api_rate_limits"
  ].forEach((table) => {
    assert.match(
      migration,
      new RegExp(`create table if not exists public\\.${table}\\b`, "i"),
      `${migrationFile} should create public.${table}`
    );
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security`, "i"),
      `${migrationFile} should enable RLS on public.${table}`
    );
    assert.match(
      migration,
      new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, "i"),
      `${migrationFile} should revoke browser table access for public.${table}`
    );
    assert.match(
      migration,
      new RegExp(`grant all on table public\\.${table} to service_role`, "i"),
      `${migrationFile} should grant service role access for public.${table}`
    );
  });

  [
    "published_events_public",
    "public_event_participants",
    "published_event_proofs_public"
  ].forEach((view) => {
    assert.match(
      migration,
      new RegExp(`create or replace view public\\.${view}\\b`, "i"),
      `${migrationFile} should create safe public view ${view}`
    );
    assert.ok(
      migration.includes(`grant select on public.${view} to anon, authenticated`),
      `${migrationFile} should grant browser reads on public.${view}`
    );
  });

  const eventsTable = sectionBetween(
    migration,
    "create table if not exists public.events",
    "create table if not exists public.event_participants"
  );
  [
    "id text primary key",
    "title text not null",
    "status public.event_status",
    "location_name text not null",
    "start_time timestamptz not null",
    "organizer_name text not null",
    "organizer_email text not null",
    "source text not null",
    "participant_count_seed integer",
    "proof_summary text",
    "published_at timestamptz"
  ].forEach((snippet) => {
    assert.ok(eventsTable.toLowerCase().includes(snippet), `events table missing API field: ${snippet}`);
  });

  const participantsTable = sectionBetween(
    migration,
    "create table if not exists public.event_participants",
    "create table if not exists public.event_proofs"
  );
  [
    "event_id text not null",
    "name text not null",
    "email text not null",
    "visibility public.participant_visibility",
    "status public.participant_status",
    "joined_at timestamptz"
  ].forEach((snippet) => {
    assert.ok(participantsTable.toLowerCase().includes(snippet), `event_participants table missing API field: ${snippet}`);
  });

  [
    "profiles_owner_select",
    "organizations_owner_insert",
    "events_owner_insert",
    "event_participants_self_insert",
    "event_proofs_submitter_insert",
    "trust_reports_public_insert"
  ].forEach((policyName) => {
    assert.ok(migration.includes(policyName), `${migrationFile} should include RLS policy ${policyName}`);
  });
  ["private.event_is_published", "private.event_is_completed"].forEach((helperName) => {
    assert.ok(migration.includes(helperName), `${migrationFile} should include RLS helper ${helperName}`);
  });
  ["public.record_api_rate_limit_hit", "public.join_published_event"].forEach((functionName) => {
    assert.ok(migration.includes(functionName), `${migrationFile} should include backend function ${functionName}`);
  });
  [
    "grant execute on function public.record_api_rate_limit_hit",
    "grant execute on function public.join_published_event"
  ].forEach((snippet) => {
    assert.ok(migration.includes(snippet), `${migrationFile} should grant service-only backend function access`);
  });

  const publicEventsView = sectionBetween(
    migration,
    "create or replace view public.published_events_public",
    "create or replace view public.public_event_participants"
  );
  assert.ok(!/\borganizer_email\b/i.test(publicEventsView), "public event view must not expose organizer_email");

  const publicParticipantsView = sectionBetween(
    migration,
    "create or replace view public.public_event_participants",
    "create or replace view public.published_event_proofs_public"
  );
  assert.ok(!/\bemail\b/i.test(publicParticipantsView), "public participant view must not expose participant email");
  assert.match(publicParticipantsView, /events\.status in \('published', 'completed'\)/i, "public participant view should only expose names for public events");

  const scriptEvents = loadWindowValue("events.js", "BLUE_MOON_EVENTS");
  for (const event of scriptEvents) {
    assert.ok(seed.includes(`'${event.id}'`), `${seedFile} should seed ${event.id}`);
  }
  assert.ok(seed.includes("insert into public.event_proofs"), `${seedFile} should seed the completed proof table`);
  ["source", "time_zone", "participant_count_seed", "proof_summary", "published_at"].forEach((column) => {
    assert.match(seed, new RegExp(`\\b${column}\\b`), `${seedFile} should use ${column}`);
  });

  [
    migrationFile,
    seedFile,
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "CRON_SECRET",
    "RATE_LIMIT_SALT",
    "duplicate_join",
    "event_full",
    "rate_limited",
    "backendEnabled",
    "/api/health",
    "/api/trust-report",
    "readiness",
    "structured logs",
    "trust_reports",
    "early_access_requests",
    "unsafe_event",
    "EARLY_ACCESS_NOTIFY_TO",
    "TRUST_REPORT_RATE_LIMIT_MAX",
    "npm run check",
    "Rollback"
  ].forEach((snippet) => {
    assert.ok(productionSetup.includes(snippet), `${productionSetupFile} should document ${snippet}`);
  });

  [
    "GA Event Scope",
    "Not supported for GA",
    "Review Model",
    "POST /api/trust-report",
    "P0, act immediately",
    "Operator Playbooks",
    "First-Hour Maintainer Checklist",
    "User Privacy Promise",
    "Users cannot approve their own organization"
  ].forEach((snippet) => {
    assert.ok(trustSafety.includes(snippet), `${trustSafetyFile} should document ${snippet}`);
  });
}

async function checkJoinApi() {
  const handler = await apiHandler("api/join.js");

  function eventRow(overrides = {}) {
    return {
      id: "santa-monica-beach-cleanup",
      title: "Santa Monica Beach Cleanup",
      location_name: "Tower 24, Santa Monica Beach",
      start_time: "2026-05-16T09:00:00-07:00",
      end_time: "2026-05-16T11:00:00-07:00",
      time_zone: "America/Los_Angeles",
      organizer_name: "Maya Chen",
      organizer_email: "maya@example.com",
      status: "published",
      max_participants: 30,
      participant_count_seed: 12,
      summary: "Trusted Supabase summary.",
      bring: "Water and sun protection.",
      ...overrides
    };
  }

  function allowedRateLimit() {
    return jsonResponse({
      allowed: true,
      requestCount: 1,
      limit: 20,
      retryAfterSeconds: 600
    });
  }

  let response = mockResponse();
  await handler({ method: "GET", headers: {} }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, "POST");

  response = mockResponse();
  await handler({ method: "POST", headers: {}, body: "{" }, response);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, "invalid_json");

  response = mockResponse();
  await handler({ method: "POST", headers: {}, body: { event: { id: "demo" }, join: { name: "Pat" } } }, response);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, "missing_email");

  await withEnv({}, async () => {
    await withFetch(async () => {
      throw new Error("fetch should not run when Supabase is not configured");
    }, async () => {
      response = mockResponse();
      await handler({
        method: "POST",
        headers: {},
        body: {
          event: { id: "santa-monica-beach-cleanup" },
          join: { name: "Pat", email: "pat@example.com" }
        }
      }, response);
      assert.equal(response.statusCode, 202);
      assert.equal(response.body.reason, "database_not_configured");
      assert.equal(response.body.emailSent, false);
    });
  });

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role"
  }, async () => {
    await withFetch(async (url) => {
      if (String(url).includes("/rest/v1/rpc/record_api_rate_limit_hit")) {
        return allowedRateLimit();
      }
      assert.ok(String(url).includes("/rest/v1/events?"), "join should verify the event before saving");
      return jsonResponse([]);
    }, async () => {
      response = mockResponse();
      await handler({
        method: "POST",
        headers: {},
        body: {
          event: { id: "missing-event" },
          join: { name: "Pat", email: "pat@example.com" }
        }
      }, response);
      assert.equal(response.statusCode, 404);
      assert.equal(response.body.error, "event_not_found");
    });
  });

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role"
  }, async () => {
    await withFetch(async () => {
      throw new Error("fetch should not run for bot-field submissions");
    }, async () => {
      response = mockResponse();
      await handler({
        method: "POST",
        headers: {},
        body: {
          event: { id: "santa-monica-beach-cleanup" },
          join: { name: "Pat", email: "pat@example.com", website: "https://spam.example" }
        }
      }, response);
      assert.equal(response.statusCode, 400);
      assert.equal(response.body.error, "bot_detected");
    });
  });

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role"
  }, async () => {
    let fetchCount = 0;
    await withFetch(async (url) => {
      fetchCount += 1;
      assert.ok(String(url).includes("/rest/v1/rpc/record_api_rate_limit_hit"), "join should check rate limits before lookup");
      return jsonResponse({
        allowed: false,
        requestCount: 21,
        limit: 20,
        retryAfterSeconds: 300
      });
    }, async () => {
      response = mockResponse();
      await handler({
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.9", "user-agent": "check" },
        body: {
          event: { id: "santa-monica-beach-cleanup" },
          join: { name: "Pat", email: "pat@example.com" }
        }
      }, response);
      assert.equal(response.statusCode, 429);
      assert.equal(response.body.error, "rate_limited");
      assert.equal(response.headers["retry-after"], "300");
      assert.equal(fetchCount, 1);
    });
  });

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    RESEND_API_KEY: "resend-key",
    EMAIL_FROM: "Blue Moon <hello@example.com>"
  }, async () => {
    const calls = [];
    await withFetch(async (url, options = {}) => {
      calls.push(String(url));
      if (String(url).includes("/rest/v1/events?")) {
        return jsonResponse([eventRow()]);
      }
      if (String(url).includes("/rest/v1/rpc/record_api_rate_limit_hit")) {
        return allowedRateLimit();
      }
      if (String(url).includes("/rest/v1/rpc/join_published_event")) {
        assert.equal(options.method, "POST");
        const participant = JSON.parse(options.body);
        assert.equal(participant.requested_event_id, "santa-monica-beach-cleanup");
        assert.equal(participant.participant_name, "Pat");
        assert.equal(participant.participant_email, "pat@example.com");
        assert.equal(participant.requested_visibility, "private");
        return jsonResponse({ saved: true, id: "join-test", participantCount: 13, capacity: 30 });
      }
      if (String(url).includes("api.resend.com/emails")) {
        assert.match(options.headers["Idempotency-Key"], /^join-santa-monica-beach-cleanup-join-test$/);
        const email = JSON.parse(options.body);
        assert.equal(email.to[0], "pat@example.com");
        assert.equal(email.subject, "You're joining Santa Monica Beach Cleanup");
        assert.equal(email.html.includes("<script>"), false);
        assert.equal(email.html.includes("https://evil.example"), false);
        assert.match(email.text, /Tower 24/);
        assert.match(email.text, /Trusted Supabase summary/);
        assert.equal(email.attachments[0].filename, "santa-monica-beach-cleanup.ics");
        const calendar = Buffer.from(email.attachments[0].content, "base64").toString("utf8");
        assert.match(calendar, /BEGIN:VCALENDAR/);
        assert.match(calendar, /Tower 24/);
        assert.doesNotMatch(calendar, /CLIENT SUPPLIED/);
        return jsonResponse({ id: "email_123" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }, async () => {
      response = mockResponse();
      await handler({
        method: "POST",
        headers: {},
        body: {
          event: {
            id: "santa-monica-beach-cleanup",
            summary: "<script>alert(1)</script>Bring water.",
            url: "https://evil.example/events/santa-monica-beach-cleanup"
          },
          join: {
            id: "join-test",
            name: "Pat",
            email: "PAT@example.com",
            visibility: "private",
            reminderOptIn: true
          },
          receipt: {
            html: "<script>alert(1)</script>"
          },
          calendar: {
            filename: "test.ics",
            content: "BEGIN:VCALENDAR\r\nSUMMARY:CLIENT SUPPLIED\r\nEND:VCALENDAR"
          }
        }
      }, response);
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.joinSaved, true);
      assert.equal(response.body.emailSent, true);
      assert.deepEqual(calls.map((url) => {
        if (url.includes("record_api_rate_limit_hit")) return "rate";
        if (url.includes("events?")) return "lookup";
        if (url.includes("join_published_event")) return "save";
        return "email";
      }), ["rate", "rate", "lookup", "save", "email"]);
    });
  });

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    RESEND_API_KEY: "resend-key",
    EMAIL_FROM: "Blue Moon <hello@example.com>"
  }, async () => {
    let emailAttempted = false;
    await withFetch(async (url) => {
      if (String(url).includes("/rest/v1/rpc/record_api_rate_limit_hit")) return allowedRateLimit();
      if (String(url).includes("/rest/v1/events?")) return jsonResponse([eventRow()]);
      if (String(url).includes("/rest/v1/rpc/join_published_event")) {
        return jsonResponse({ saved: false, reason: "duplicate_join" });
      }
      if (String(url).includes("api.resend.com/emails")) {
        emailAttempted = true;
        return jsonResponse({ id: "should-not-send" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }, async () => {
      response = mockResponse();
      await handler({
        method: "POST",
        headers: {},
        body: {
          event: { id: "santa-monica-beach-cleanup" },
          join: { name: "Pat", email: "pat@example.com" }
        }
      }, response);
      assert.equal(response.statusCode, 409);
      assert.equal(response.body.error, "duplicate_join");
      assert.equal(response.body.emailSent, false);
      assert.equal(emailAttempted, false);
    });
  });

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    RESEND_API_KEY: "resend-key",
    EMAIL_FROM: "Blue Moon <hello@example.com>"
  }, async () => {
    await withFetch(async (url) => {
      if (String(url).includes("/rest/v1/rpc/record_api_rate_limit_hit")) return allowedRateLimit();
      if (String(url).includes("/rest/v1/events?")) {
        return jsonResponse([eventRow({ max_participants: 12, participant_count_seed: 12 })]);
      }
      if (String(url).includes("/rest/v1/rpc/join_published_event")) {
        return jsonResponse({ saved: false, reason: "event_full", participantCount: 12, capacity: 12 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }, async () => {
      response = mockResponse();
      await handler({
        method: "POST",
        headers: {},
        body: {
          event: { id: "santa-monica-beach-cleanup" },
          join: { name: "Pat", email: "pat@example.com" }
        }
      }, response);
      assert.equal(response.statusCode, 409);
      assert.equal(response.body.error, "event_full");
      assert.equal(response.body.capacity, 12);
    });
  });
}

async function checkHealthApi() {
  const handler = await apiHandler("api/health.js");

  let response = mockResponse();
  await handler({ method: "POST", headers: {}, url: "/api/health" }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, "GET");

  response = mockResponse();
  await handler({ method: "GET", headers: {}, url: "/api/health" }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.check, "liveness");
  assert.equal(response.headers["cache-control"], "no-store");

  await withEnv({}, async () => {
    response = mockResponse();
    await handler({ method: "GET", headers: {}, url: "/api/health?readiness=1" }, response);
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.error, "cron_secret_required");
  });

  await withEnv({ CRON_SECRET: "secret" }, async () => {
    response = mockResponse();
    await handler({ method: "GET", headers: { authorization: "Bearer wrong" }, url: "/api/health?readiness=1" }, response);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.error, "unauthorized");
  });

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    RESEND_API_KEY: "resend-key",
    EMAIL_FROM: "Blue Moon <hello@example.com>",
    CRON_SECRET: "secret",
    RATE_LIMIT_SALT: "salt"
  }, async () => {
    response = mockResponse();
    await handler({ method: "GET", headers: { authorization: "Bearer secret" }, url: "/api/health?readiness=1" }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.check, "readiness");
    assert.equal(response.body.checks.filter((check) => check.required).every((check) => check.ok), true);
  });

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    RESEND_API_KEY: "resend-key",
    EMAIL_FROM: "Blue Moon <hello@example.com>",
    CRON_SECRET: "secret"
  }, async () => {
    let fetchCount = 0;
    await withFetch(async (url) => {
      fetchCount += 1;
      assert.equal(String(url), "https://db.example/rest/v1/published_events_public?select=id&limit=1");
      return jsonResponse([{ id: "santa-monica-beach-cleanup" }]);
    }, async () => {
      response = mockResponse();
      await handler({ method: "GET", headers: { authorization: "Bearer secret" }, url: "/api/health?readiness=1&deep=1" }, response);
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.ok, true);
      assert.equal(response.body.deep, true);
      assert.equal(response.body.checks.find((check) => check.name === "supabase_public_events").ok, true);
      assert.equal(fetchCount, 1);
    });
  });

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    RESEND_API_KEY: "resend-key",
    EMAIL_FROM: "Blue Moon <hello@example.com>",
    CRON_SECRET: "secret"
  }, async () => {
    await withFetch(async () => jsonResponse([]), async () => {
      response = mockResponse();
      await handler({ method: "GET", headers: { authorization: "Bearer secret" }, url: "/api/health?readiness=1&deep=1" }, response);
      assert.equal(response.statusCode, 503);
      assert.equal(response.body.ok, false);
      assert.equal(response.body.checks.find((check) => check.name === "supabase_public_events").detail, "no_published_events");
    });
  });
}

async function checkEarlyAccessApi() {
  const handler = await apiHandler("api/early-access.js");

  function validRequest(overrides = {}) {
    const { waitlist: waitlistOverrides = {}, ...rest } = overrides;
    return {
      waitlist: {
        name: "Riley Stone",
        email: "riley@example.com",
        interest: "Create events",
        ...waitlistOverrides
      },
      ...rest
    };
  }

  function allowedRateLimit() {
    return jsonResponse({
      allowed: true,
      requestCount: 1,
      limit: 8,
      retryAfterSeconds: 600
    });
  }

  let response = mockResponse();
  await handler({ method: "GET", headers: {} }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, "POST");

  response = mockResponse();
  await handler({ method: "POST", headers: {}, body: "{" }, response);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, "invalid_json");

  response = mockResponse();
  await handler({ method: "POST", headers: {}, body: validRequest({ waitlist: { name: "" } }) }, response);
  assert.equal(response.statusCode, 422);
  assert.equal(response.body.error, "missing_name");

  response = mockResponse();
  await handler({ method: "POST", headers: {}, body: validRequest({ waitlist: { email: "not-an-email" } }) }, response);
  assert.equal(response.statusCode, 422);
  assert.equal(response.body.error, "invalid_email");

  response = mockResponse();
  await handler({ method: "POST", headers: {}, body: validRequest({ waitlist: { interest: "Something else" } }) }, response);
  assert.equal(response.statusCode, 422);
  assert.equal(response.body.error, "invalid_interest");

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role"
  }, async () => {
    await withFetch(async () => {
      throw new Error("fetch should not run for bot-field submissions");
    }, async () => {
      response = mockResponse();
      await handler({
        method: "POST",
        headers: {},
        body: validRequest({ waitlist: { website: "https://spam.example" } })
      }, response);
      assert.equal(response.statusCode, 400);
      assert.equal(response.body.error, "bot_detected");
    });
  });

  await withEnv({}, async () => {
    await withFetch(async () => {
      throw new Error("fetch should not run when Supabase is not configured");
    }, async () => {
      response = mockResponse();
      await handler({ method: "POST", headers: {}, body: validRequest() }, response);
      assert.equal(response.statusCode, 202);
      assert.equal(response.body.reason, "database_not_configured");
      assert.equal(response.body.requestSaved, false);
    });
  });

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role"
  }, async () => {
    let fetchCount = 0;
    await withFetch(async (url) => {
      fetchCount += 1;
      assert.ok(String(url).includes("/rest/v1/rpc/record_api_rate_limit_hit"), "early access should rate-limit before saving");
      return jsonResponse({
        allowed: false,
        requestCount: 9,
        limit: 8,
        retryAfterSeconds: 300
      });
    }, async () => {
      response = mockResponse();
      await handler({
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.11", "user-agent": "check" },
        body: validRequest()
      }, response);
      assert.equal(response.statusCode, 429);
      assert.equal(response.body.error, "rate_limited");
      assert.equal(response.headers["retry-after"], "300");
      assert.equal(fetchCount, 1);
    });
  });

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role"
  }, async () => {
    const calls = [];
    await withFetch(async (url, options = {}) => {
      calls.push(String(url));
      if (String(url).includes("/rest/v1/rpc/record_api_rate_limit_hit")) return allowedRateLimit();
      if (String(url).includes("/rest/v1/early_access_requests")) {
        assert.equal(options.method, "POST");
        assert.equal(options.headers.Prefer, "return=representation");
        const request = JSON.parse(options.body);
        assert.equal(request.name, "Riley Stone");
        assert.equal(request.email, "riley@example.com");
        assert.equal(request.interest, "Create events");
        assert.equal(request.status, "new");
        return jsonResponse([{ id: "00000000-0000-4000-8000-000000000002" }]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    }, async () => {
      response = mockResponse();
      await handler({ method: "POST", headers: {}, body: validRequest() }, response);
      assert.equal(response.statusCode, 202);
      assert.equal(response.body.requestSaved, true);
      assert.equal(response.body.notificationSent, false);
      assert.equal(response.body.reason, "notification_not_configured");
      assert.deepEqual(calls.map((url) => {
        if (url.includes("record_api_rate_limit_hit")) return "rate";
        if (url.includes("early_access_requests")) return "save";
        return "email";
      }), ["rate", "save"]);
    });
  });

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    RESEND_API_KEY: "resend-key",
    EMAIL_FROM: "Blue Moon <hello@example.com>",
    EARLY_ACCESS_NOTIFY_TO: "operator@example.com"
  }, async () => {
    const calls = [];
    await withFetch(async (url, options = {}) => {
      calls.push(String(url));
      if (String(url).includes("/rest/v1/rpc/record_api_rate_limit_hit")) return allowedRateLimit();
      if (String(url).includes("/rest/v1/early_access_requests")) {
        return jsonResponse([{ id: "00000000-0000-4000-8000-000000000002" }]);
      }
      if (String(url).includes("api.resend.com/emails")) {
        const email = JSON.parse(options.body);
        assert.equal(email.to[0], "operator@example.com");
        assert.match(email.text, /riley@example.com/);
        assert.match(options.headers["Idempotency-Key"], /^early-access-/);
        return jsonResponse({ id: "email_early_access" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }, async () => {
      response = mockResponse();
      await handler({ method: "POST", headers: {}, body: validRequest() }, response);
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.requestSaved, true);
      assert.equal(response.body.notificationSent, true);
      assert.deepEqual(calls.map((url) => {
        if (url.includes("record_api_rate_limit_hit")) return "rate";
        if (url.includes("early_access_requests")) return "save";
        return "email";
      }), ["rate", "save", "email"]);
    });
  });

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role"
  }, async () => {
    await withFetch(async (url) => {
      if (String(url).includes("/rest/v1/rpc/record_api_rate_limit_hit")) return allowedRateLimit();
      if (String(url).includes("/rest/v1/early_access_requests")) return jsonResponse({ message: "duplicate key" }, 409);
      throw new Error(`unexpected fetch: ${url}`);
    }, async () => {
      response = mockResponse();
      await handler({ method: "POST", headers: {}, body: validRequest() }, response);
      assert.equal(response.statusCode, 409);
      assert.equal(response.body.error, "duplicate_request");
    });
  });
}

async function checkTrustReportApi() {
  const handler = await apiHandler("api/trust-report.js");

  function validReport(overrides = {}) {
    const { target: targetOverrides = {}, report: reportOverrides = {}, ...rest } = overrides;
    return {
      target: {
        eventId: "santa-monica-beach-cleanup",
        ...targetOverrides
      },
      report: {
        reason: "unsafe_event",
        details: "The meetup spot looks unsafe after dark.",
        reporterEmail: "reporter@example.com",
        ...reportOverrides
      },
      ...rest
    };
  }

  function allowedRateLimit() {
    return jsonResponse({
      allowed: true,
      requestCount: 1,
      limit: 8,
      retryAfterSeconds: 600
    });
  }

  let response = mockResponse();
  await handler({ method: "GET", headers: {} }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, "POST");

  response = mockResponse();
  await handler({ method: "POST", headers: {}, body: "{" }, response);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, "invalid_json");

  response = mockResponse();
  await handler({ method: "POST", headers: {}, body: validReport({ report: { reason: "unknown_reason" } }) }, response);
  assert.equal(response.statusCode, 422);
  assert.equal(response.body.error, "invalid_reason");

  response = mockResponse();
  await handler({ method: "POST", headers: {}, body: validReport({ report: { details: "short" } }) }, response);
  assert.equal(response.statusCode, 422);
  assert.equal(response.body.error, "missing_details");

  response = mockResponse();
  await handler({ method: "POST", headers: {}, body: validReport({ report: { reporterEmail: "not-an-email" } }) }, response);
  assert.equal(response.statusCode, 422);
  assert.equal(response.body.error, "invalid_email");

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role"
  }, async () => {
    await withFetch(async () => {
      throw new Error("fetch should not run for bot-field submissions");
    }, async () => {
      response = mockResponse();
      await handler({
        method: "POST",
        headers: {},
        body: validReport({ report: { website: "https://spam.example" } })
      }, response);
      assert.equal(response.statusCode, 400);
      assert.equal(response.body.error, "bot_detected");
    });
  });

  await withEnv({}, async () => {
    await withFetch(async () => {
      throw new Error("fetch should not run when Supabase is not configured");
    }, async () => {
      response = mockResponse();
      await handler({ method: "POST", headers: {}, body: validReport() }, response);
      assert.equal(response.statusCode, 202);
      assert.equal(response.body.reason, "database_not_configured");
      assert.equal(response.body.reportSaved, false);
    });
  });

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role"
  }, async () => {
    let fetchCount = 0;
    await withFetch(async (url) => {
      fetchCount += 1;
      assert.ok(String(url).includes("/rest/v1/rpc/record_api_rate_limit_hit"), "trust reports should rate-limit before saving");
      return jsonResponse({
        allowed: false,
        requestCount: 9,
        limit: 8,
        retryAfterSeconds: 300
      });
    }, async () => {
      response = mockResponse();
      await handler({
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.10", "user-agent": "check" },
        body: validReport()
      }, response);
      assert.equal(response.statusCode, 429);
      assert.equal(response.body.error, "rate_limited");
      assert.equal(response.headers["retry-after"], "300");
      assert.equal(fetchCount, 1);
    });
  });

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role"
  }, async () => {
    const calls = [];
    await withFetch(async (url, options = {}) => {
      calls.push(String(url));
      if (String(url).includes("/rest/v1/rpc/record_api_rate_limit_hit")) {
        return allowedRateLimit();
      }
      if (String(url).includes("/rest/v1/trust_reports")) {
        assert.equal(options.method, "POST");
        assert.equal(options.headers.Prefer, "return=representation");
        const report = JSON.parse(options.body);
        assert.equal(report.event_id, "santa-monica-beach-cleanup");
        assert.equal(report.reason, "unsafe_event");
        assert.equal(report.reporter_email, "reporter@example.com");
        assert.match(report.details, /meetup spot/);
        assert.equal(report.status, "open");
        return jsonResponse([{ id: "00000000-0000-4000-8000-000000000001" }]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    }, async () => {
      response = mockResponse();
      await handler({ method: "POST", headers: {}, body: validReport() }, response);
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.reportSaved, true);
      assert.equal(response.body.reportId, "00000000-0000-4000-8000-000000000001");
      assert.deepEqual(calls.map((url) => url.includes("record_api_rate_limit_hit") ? "rate" : "save"), ["rate", "save"]);
    });
  });

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role"
  }, async () => {
    await withFetch(async (url) => {
      if (String(url).includes("/rest/v1/rpc/record_api_rate_limit_hit")) return allowedRateLimit();
      if (String(url).includes("/rest/v1/trust_reports")) return jsonResponse({ message: "foreign key failed" }, 409);
      throw new Error(`unexpected fetch: ${url}`);
    }, async () => {
      response = mockResponse();
      await handler({ method: "POST", headers: {}, body: validReport() }, response);
      assert.equal(response.statusCode, 502);
      assert.equal(response.body.error, "database_save_failed");
      assert.equal(response.body.status, 409);
    });
  });
}

async function checkReminderApi() {
  const handler = await apiHandler("api/organizer-reminders.js");

  await withEnv({}, async () => {
    await withFetch(async () => {
      throw new Error("fetch should not run when reminders are not configured");
    }, async () => {
      const response = mockResponse();
      await handler({ method: "GET", headers: {} }, response);
      assert.equal(response.statusCode, 202);
      assert.equal(response.body.reason, "reminders_not_configured");
    });
  });

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    RESEND_API_KEY: "resend-key",
    EMAIL_FROM: "Blue Moon <hello@example.com>"
  }, async () => {
    await withFetch(async () => {
      throw new Error("fetch should not run without CRON_SECRET");
    }, async () => {
      const response = mockResponse();
      await handler({ method: "GET", headers: {} }, response);
      assert.equal(response.statusCode, 503);
      assert.equal(response.body.error, "cron_secret_required");
    });
  });

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    RESEND_API_KEY: "resend-key",
    EMAIL_FROM: "Blue Moon <hello@example.com>",
    CRON_SECRET: "secret"
  }, async () => {
    const response = mockResponse();
    await handler({ method: "GET", headers: { authorization: "Bearer wrong" } }, response);
    assert.equal(response.statusCode, 401);
  });

  await withEnv({
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    RESEND_API_KEY: "resend-key",
    EMAIL_FROM: "Blue Moon <hello@example.com>",
    CRON_SECRET: "secret"
  }, async () => {
    let eventFetchCount = 0;
    let emailFetchCount = 0;
    await withFetch(async (url, options = {}) => {
      if (String(url).includes("/rest/v1/events?")) {
        eventFetchCount += 1;
        return jsonResponse([
          {
            id: `event-${eventFetchCount}`,
            title: `Roster Event ${eventFetchCount}`,
            location_name: "Community Room",
            start_time: "2026-05-16T09:00:00-07:00",
            organizer_name: "Organizer",
            organizer_email: "organizer@example.com",
            status: "published"
          }
        ]);
      }
      if (String(url).includes("/rest/v1/event_participants?")) {
        return jsonResponse([
          {
            name: "Lee",
            email: "lee@example.com",
            visibility: "private",
            status: "joined",
            joined_at: "2026-05-07T12:00:00.000Z"
          }
        ]);
      }
      if (String(url).includes("api.resend.com/emails")) {
        emailFetchCount += 1;
        assert.match(options.headers["Idempotency-Key"], /^organizer-event-[12]-(day_before|day_of)-/);
        const email = JSON.parse(options.body);
        assert.equal(email.to[0], "organizer@example.com");
        assert.match(email.text, /lee@example.com/);
        return jsonResponse({ id: `email-${emailFetchCount}` });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }, async () => {
      const response = mockResponse();
      await handler({ method: "POST", headers: { authorization: "Bearer secret" } }, response);
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.sent, 2);
      assert.equal(emailFetchCount, 2);
    });
  });
}

checkSyntaxAndJson();
checkEventInventory();
checkTrustSafetyUxContract();
checkSeoMetadata();
checkBackendContractFiles();
await checkJoinApi();
await checkHealthApi();
await checkEarlyAccessApi();
await checkTrustReportApi();
await checkReminderApi();

console.log("Blue Moon checks passed");
