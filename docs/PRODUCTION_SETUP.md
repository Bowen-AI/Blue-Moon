# Blue Moon Production Setup

This guide covers the smallest production-ready backend shape for the current static/Vercel app: Supabase for durable data and auth, Resend for email, and a protected Vercel cron route for organizer roster reminders.

## Production Shape

- Vercel serves the static HTML, CSS, and browser JavaScript.
- Vercel Functions run `/api/early-access`, `/api/join`, `/api/organizer-reminders`, `/api/trust-report`, and `/api/health`.
- Supabase stores profiles, organizations, organization members, events, event participants, event proof, early access requests, trust reports, audit logs, and API rate-limit buckets.
- Resend sends participant receipts, optional early-access operator notifications, and organizer roster reminders.
- `site.js` keeps `backendEnabled: false` until the database, email sender, secrets, and smoke tests are complete.

## Prerequisites

- A Vercel project connected to this repository.
- A Supabase project with SQL editor or Supabase CLI access.
- A Resend API key and verified sender.
- A generated `CRON_SECRET` with at least 32 random bytes.
- At least one operator who can review organizations, events, proof, privacy issues, and trust reports.

Generate a local cron secret with:

```bash
openssl rand -base64 32
```

## Supabase Setup

Apply the schema migration:

```bash
supabase db push
```

The migration file is `supabase/migrations/202605080001_ga_schema.sql`. It creates:

- `profiles`
- `organizations`
- `organization_members`
- `events`
- `event_participants`
- `event_proofs`
- `early_access_requests`
- `trust_reports`
- `audit_log`
- `api_rate_limits`

It also enables RLS on every application table and creates safe public views:

- `published_events_public`
- `public_event_participants`
- `published_event_proofs_public`

For a staging or demo project, seed the static event inventory:

```bash
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

You can also paste `supabase/seed.sql` into the Supabase SQL editor for a one-time staging seed.

The seed file uses `example.com` organizer addresses. Replace those with monitored organizer addresses before enabling organizer roster reminders.

## Vercel Environment

Set these production environment variables in Vercel:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=...
EMAIL_FROM=Blue Moon <hello@your-domain.example>
CRON_SECRET=...
EARLY_ACCESS_NOTIFY_TO=operator@your-domain.example
```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Do not place it in browser JavaScript, screenshots, issue comments, static files, or client-visible logs.

Optional join-rate controls:

```text
RATE_LIMIT_SALT=...
JOIN_RATE_LIMIT_WINDOW_SECONDS=600
JOIN_RATE_LIMIT_MAX=20
JOIN_EMAIL_RATE_LIMIT_MAX=3
EARLY_ACCESS_RATE_LIMIT_WINDOW_SECONDS=600
EARLY_ACCESS_RATE_LIMIT_MAX=8
TRUST_REPORT_RATE_LIMIT_WINDOW_SECONDS=600
TRUST_REPORT_RATE_LIMIT_MAX=8
```

`EARLY_ACCESS_NOTIFY_TO` is optional but recommended. Without it, early access requests still save to Supabase, but no operator notification email is sent.

If `RATE_LIMIT_SALT` is not set, the join, early-access, and trust-report routes hash rate-limit subjects with the service role key. Set a dedicated salt before GA so service key rotation does not reset rate windows unexpectedly.

When `CRON_SECRET` is set, Vercel Cron sends it to scheduled functions as `Authorization: Bearer <CRON_SECRET>`. `/api/organizer-reminders` depends on that header and refuses configured reminder sends without it. `/api/health?readiness=1` uses the same bearer secret for protected readiness diagnostics.

## Enable Backend Calls

Deploy with `backendEnabled: false` first. Run smoke tests against the deployed APIs. Then set `backendEnabled: true` in `site.js` and redeploy.

Do not enable backend calls until all of these are true:

- The Supabase migration has been applied.
- Seed or production event rows exist with `status = 'published'`.
- Resend can send from `EMAIL_FROM`.
- Vercel has all five environment variables.
- `/api/health` returns public liveness and `/api/health?readiness=1` returns ready with the correct bearer token.
- `/api/early-access` saves a test request to Supabase and sends an operator notification when `EARLY_ACCESS_NOTIFY_TO` is configured.
- `/api/join` succeeds against a real published event.
- `/api/trust-report` saves a test report against a published event.
- `/api/organizer-reminders` rejects a wrong bearer token and accepts the correct `CRON_SECRET`.

## Local Verification

Run the dependency-free checks:

```bash
npm run check
```

This validates JavaScript syntax, JSON files, event inventory consistency, backend contract files, early-access API behavior, join API behavior, trust-report API behavior, organizer reminder auth behavior, and the core browser flows in headless Chrome. The browser smoke suite covers browse/filter, account creation, event creation, early access, joining, trust/safety reporting, duplicate backend rejection handling, full-event behavior, account dashboard, member profile, proof sharing, mobile overflow, and basic accessibility contracts.

CI must run the browser smoke suite. A constrained local sandbox may skip it with `SKIP_BROWSER_SMOKE=1`, but do not cut a release candidate from a run that skipped browser smoke coverage.

## Production Smoke Tests

Verify API liveness:

```bash
curl -i https://YOUR_DOMAIN/api/health
```

Expected result:

- `200` with `ok: true`, `check: "liveness"`, a version, environment, and timestamp.
- No secrets, environment variable values, participant data, or organizer data appear in the response.

Verify protected readiness:

```bash
curl -i 'https://YOUR_DOMAIN/api/health?readiness=1' \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected result:

- `200` with `ok: true` only when Supabase, email, and cron auth are configured.
- `503` when required production dependencies are missing.
- `401` when the bearer token is wrong.
- The `rate_limit_salt` check is recommended rather than required, but set it before GA.

Verify deep readiness after the Supabase migration and seed/production events are present:

```bash
curl -i 'https://YOUR_DOMAIN/api/health?readiness=1&deep=1' \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected result:

- `200` with `supabase_public_events` reporting `published_event_visible`.
- `503` with `no_published_events` if the database has no published event rows visible through the safe public view.

Verify a join against a published event:

```bash
curl -i https://YOUR_DOMAIN/api/join \
  -H 'Content-Type: application/json' \
  -d '{
    "event": {
      "id": "santa-monica-beach-cleanup",
      "summary": "Production smoke test",
      "url": "https://YOUR_DOMAIN/events/santa-monica-beach-cleanup"
    },
    "join": {
      "name": "Production Tester",
      "email": "tester@example.com",
      "visibility": "private",
      "reminderOptIn": true
    }
  }'
```

Expected result:

- `200` with `joinSaved: true` and `emailSent: true` when Resend is configured.
- `202` with `joinSaved: true` and `emailSent: false` if email is intentionally not configured.
- A row exists in `event_participants`.
- The email receipt contains server-generated event details and a server-generated `.ics` attachment.
- A duplicate email for the same event returns `409 duplicate_join`.
- A full event returns `409 event_full`.
- Too many attempts in the same window return `429 rate_limited` with `Retry-After`.

Verify early access capture:

```bash
curl -i https://YOUR_DOMAIN/api/early-access \
  -H 'Content-Type: application/json' \
  -d '{
    "waitlist": {
      "name": "Early Tester",
      "email": "early-tester@example.com",
      "interest": "Create events"
    }
  }'
```

Expected result:

- `200` with `requestSaved: true` and `notificationSent: true` when Supabase, Resend, and `EARLY_ACCESS_NOTIFY_TO` are configured.
- `202` with `requestSaved: true` and `notificationSent: false` when the row saved but operator email is intentionally not configured.
- A row exists in `early_access_requests`.
- A duplicate email returns `409 duplicate_request`.
- Invalid submissions return `422 missing_name`, `422 invalid_email`, or `422 invalid_interest`.
- Too many attempts in the same window return `429 rate_limited` with `Retry-After`.

Verify reminder auth:

```bash
curl -i https://YOUR_DOMAIN/api/organizer-reminders \
  -X POST \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected result:

- `200` when Supabase, Resend, `EMAIL_FROM`, and `CRON_SECRET` are configured.
- `401` when the bearer token is wrong.
- `503 cron_secret_required` when reminder dependencies are configured but `CRON_SECRET` is missing.

Verify a trust/safety report:

```bash
curl -i https://YOUR_DOMAIN/api/trust-report \
  -H 'Content-Type: application/json' \
  -d '{
    "target": {
      "eventId": "santa-monica-beach-cleanup"
    },
    "report": {
      "reason": "unsafe_event",
      "details": "Production smoke test report. Please close after verification.",
      "reporterEmail": "tester@example.com"
    }
  }'
```

Expected result:

- `200` with `reportSaved: true` when Supabase is configured.
- A row exists in `trust_reports` with `status = 'open'`.
- `202 database_not_configured` only before the backend is enabled.
- `422 invalid_reason`, `422 missing_details`, or `422 invalid_email` for invalid input.
- `429 rate_limited` with `Retry-After` after repeated submissions from the same client.

## RLS And Privacy

Use public views for browser-readable public data. Do not query base tables from anonymous browser code unless the column exposure has been reviewed.

- `published_events_public` excludes `organizer_email`.
- `public_event_participants` exposes public participant names only, not participant emails.
- `published_event_proofs_public` exposes approved proof only.
- `early_access_requests` is private operator intake; it should not be exposed through public views.
- `trust_reports` accepts inserts for review but does not expose reporter emails or report details through public views.
- Participants can read their own join rows when authenticated.
- Organizers can read rosters for events they own or organizations they belong to.
- The server join route writes participants with `SUPABASE_SERVICE_ROLE_KEY` only after validating the event and request body.
- The trust report route writes `trust_reports` with `SUPABASE_SERVICE_ROLE_KEY` only after validating the target, reason, details, bot field, and rate limit.

Public/private join visibility only controls public page display. Organizers still receive names and emails for event coordination.

Review scope, escalation, and operator playbooks live in [docs/TRUST_AND_SAFETY.md](TRUST_AND_SAFETY.md). Keep public GitHub issues free of participant names, participant emails, reporter emails, bearer tokens, API keys, and raw provider error bodies.

## Operations

Functions emit single-line structured logs as JSON. The log `event` field identifies the operational path, for example `early_access.completed`, `early_access.save_rejected`, `join.completed`, `join.save_rejected`, `join.email_send_failed`, `trust_report.saved`, `trust_report.save_failed`, `reminders.completed`, `reminders.digest_failed`, and `health.readiness`. Logs intentionally avoid participant names, participant emails, early-access names and emails, reporter emails, report details, bearer tokens, API keys, and raw provider error bodies.

After each deploy, check:

- Vercel function logs for `/api/join` and `/api/organizer-reminders`.
- Vercel function logs for `/api/early-access`, especially `early_access.save_rejected` and `early_access.notification_not_sent`.
- Vercel function logs for `/api/trust-report`, especially `trust_report.save_failed` or repeated `trust_report.rate_limited` events.
- Vercel function logs for `/api/health`, especially failed `health.readiness` or `supabase_public_events` checks.
- Supabase inserts into `event_participants`.
- Duplicate-join failures from the active-join unique index.
- Resend delivery logs for receipts and roster reminders.
- New rows in `trust_reports`.
- New rows in `early_access_requests`.
- GitHub issues labeled for privacy, trust/safety, or support.

Minimum GA dashboard or alert expectations:

- Alert on any sustained `join.email_send_failed`, `join.event_lookup_failed`, `join.save_rejected` with unexpected reasons, or `reminders.digest_failed` events.
- Alert on sustained `trust_report.save_failed` or sudden spikes in `trust_report.rate_limited`.
- Alert on sustained `early_access.save_rejected` or `early_access.notification_not_sent` when operator notifications are expected.
- Alert when protected `/api/health?readiness=1&deep=1` returns non-200 after a production deploy.
- Watch spikes in `join.rate_limited` and `join.bot_detected` for abuse patterns.
- Watch Resend bounce and complaint rates for `EMAIL_FROM`.
- Review reminder sends daily until roster delivery is proven stable.

Deploy verification checklist:

1. Run `npm run check` locally or in CI with browser smoke enabled.
2. Deploy with `backendEnabled: false`.
3. Confirm `/api/health` liveness.
4. Confirm protected `/api/health?readiness=1`.
5. Confirm protected `/api/health?readiness=1&deep=1`.
6. Run the `/api/early-access` smoke test and confirm `early_access_requests` contains the request.
7. Run the `/api/join` smoke test against a published event.
8. Confirm `event_participants` contains the smoke join and Resend delivered the receipt.
9. Run the `/api/trust-report` smoke test against a published event and confirm `trust_reports` contains the open report.
10. Confirm `/api/organizer-reminders` rejects a wrong bearer token.
11. Confirm `/api/organizer-reminders` accepts the correct bearer token in staging or during a controlled production test.
12. Enable `backendEnabled: true`, redeploy, and repeat the early-access, join, and trust-report smoke paths from the public pages.
13. Watch structured logs and Resend delivery for at least one reminder cron window.

Common failures:

- `database_not_configured`: missing `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`.
- `event_not_found`: no published Supabase `events` row for the submitted event ID.
- `duplicate_join`: the same normalized email already has an active join for that event.
- `event_full`: the live participant count plus the seeded participant count has reached `max_participants`.
- `rate_limited`: the IP or email-event bucket exceeded the configured join limit.
- `duplicate_request`: the early-access email already exists in `early_access_requests`.
- `notification_not_configured`: the early-access request saved, but `EARLY_ACCESS_NOTIFY_TO` or email settings are missing.
- `early_access.save_rejected`: Supabase rejected the early-access insert, commonly because the table is missing or the email is duplicated.
- `rate_limit_check_failed`: the deployed Supabase migration does not match the API route or Supabase rejected the rate-limit function call.
- `database_save_failed`: Supabase rejected the join because of a schema mismatch or unavailable backend function.
- `email_not_configured`: `RESEND_API_KEY` or `EMAIL_FROM` is missing.
- `email_send_failed`: Resend rejected the request.
- `cron_secret_required`: reminder dependencies are configured without `CRON_SECRET`.
- `reminder_digest_failed`: the reminder route could not load events, load participants, or finish digest generation.
- `supabase_public_events`: deep readiness could not verify a published event through the safe public view.
- `missing_target`: a trust report did not include an event, organization, or proof target.
- `invalid_reason`: a trust report used a reason outside the allowed review categories.
- `missing_details`: a trust report did not include enough detail for maintainer review.
- `trust_report.save_failed`: Supabase rejected the report insert, commonly because the target does not exist or the schema is out of date.

## Rollback

If backend behavior is unsafe or broken:

1. Set `backendEnabled: false` in `site.js` and redeploy.
2. Roll back the Vercel deployment if the issue came from a code change.
3. Remove or rotate `RESEND_API_KEY` if emails are misfiring.
4. Rotate `SUPABASE_SERVICE_ROLE_KEY` if it may have leaked.
5. Remove `CRON_SECRET` or disable the cron route until reminder behavior is fixed.
6. Record affected rows, user impact, and follow-up in `audit_log` or the linked support issue.

## Remaining GA Work

- Verify rate-limit, duplicate-join, full-event, and server-calendar behavior against a live Supabase project.
- Replace browser-local account, organization, event, and proof flows with Supabase-backed production flows.
- Add deployed smoke automation that runs the health, readiness, join, trust-report, reminder-auth, and public-page checks after every production deploy.
