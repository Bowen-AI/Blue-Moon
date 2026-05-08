# Blue Moon GA Release Readiness

Last updated: 2026-05-08

## GA Scope

Blue Moon is preparing for a first GA release as a lightweight community event platform for small real-world good actions. The GA product should let a real participant find an event, join it, receive useful confirmation/reminder support, attend, and share proof afterward. It should let a real organizer create an event under a safe approval model, see who is joining, and understand what happens next.

Non-goals for first GA:

- Payments, donations to individual events, or marketplace matching.
- Complex identity verification beyond the minimum needed for safe event coordination.
- Native mobile apps.
- AI matching, recommendations, or automated moderation decisions.
- Large-organization workflow depth before the simple post/join/complete/share loop is proven.

## Cross-Functional Review

### Engineering

Current strengths:

- Simple static-first architecture keeps the surface area small and cheap to deploy.
- Core browser prototype covers event discovery, creation, joining, accounts, member pages, proof sharing, SEO metadata, and crawler-friendly mirrors.
- Optional Vercel functions already sketch the production join receipt and organizer reminder path.

GA risks:

- Production data ownership is not complete. Most workflows still rely on `localStorage`, which is useful for demos but not durable, portable, auditable, or multi-user.
- `app.js` and `event-page.js` duplicate event conversion, URL, calendar, sharing, and sanitization logic. This increases regression risk as production data is introduced.
- A Supabase schema, migration, seed file, and RLS policy draft now exist, but they have not been applied to a real project or wired into the browser account/event creation flows.
- There is no build step, bundling, or module boundary, so browser behavior depends on script order.
- Static event data is duplicated across `events.js`, `events.json`, markdown mirrors, sitemap, and HTML fallback cards.

### Product / PM

Current strengths:

- The user problem is clear: reduce friction from "I care" to "I showed up."
- The core workflow is coherent: find, create, join, complete, share proof.
- Release priorities are naturally centered on completed good-action events, organizer confidence, and participant trust.

GA risks:

- GA success criteria need to be explicit. Recommended first metrics: completed events per month, join conversion rate, organizer repeat rate, and no-show rate.
- Acceptance criteria are clearer for moderation and organization approval, but production account behavior and proof posting still need implementation-level acceptance tests.
- The browser prototype now stores organization requests as `pending_review`; production still needs an operator approval tool or documented service-role procedure before official organization publishing can be enabled.
- Supported and excluded GA event types are now named in the trust and safety guide, but those rules still need to be reflected in production moderation tooling.

### Customer / User

Current strengths:

- A new user can understand the landing page, browse seed events, create local demo events, join, and download a calendar file.
- Copy is clear and human, with low nonprofit jargon.
- Public/private join visibility is explained near the join action.
- Event pages now include a report form for unsafe events, privacy issues, misleading information, abusive joins, and proof concerns.

GA risks:

- Demo-only `localStorage` behavior can confuse real users because their account, event, and join data do not move across browsers or devices.
- Error states are mostly local text and do not yet explain moderation rejection or all production backend failures. The production join and report paths now have clearer duplicate, full, rate-limit, invalid-report, and saved-without-email responses.
- The organization approval flow now names maintainer review, but production still needs the actual operator workflow and user-facing review timeline.
- A privacy promise now exists for participant emails, rosters, report emails, public names, and proof sharing; it still needs product-surface placement beyond docs.

### QA

Current strengths:

- Lightweight syntax and JSON checks are documented.
- This run adds automated API and content inventory coverage through `npm run check`.
- This run adds a dependency-free headless Chrome smoke runner for the GA-critical browse, create, join, account, member profile, proof sharing, backend rejection, capacity, mobile, and accessibility-contract paths.

GA risks:

- Browser smoke coverage now exercises the highest-risk participant, organizer, proof-sharing, and trust-reporting demo paths, but it is still a smoke suite rather than exhaustive regression coverage.
- No full accessibility audit exists for keyboard navigation, focus order, color contrast, and screen reader behavior. The smoke suite only checks core labels, live regions, status roles, and mobile overflow.
- Time-sensitive behavior still needs broader tests around timezone, event date windows, and completed events. The lightweight API checks now cover trusted server-side calendar generation for join receipts.

### Security

Current strengths:

- Supabase service role keys are only referenced in server routes, not browser code.
- Browser-rendered dynamic HTML generally escapes user-controlled values.
- Reminder cron authentication is now required before configured reminder sends can run.
- Join receipts now verify the Supabase event record, save the join before sending, ignore client-supplied receipt HTML, and mask provider error details.

GA risks:

- Public join submission now has a honeypot field, Supabase-backed rate-limit buckets, duplicate active-join handling, capacity enforcement, and server-generated receipt/calendar content.
- The trust-report route validates targets, allowed reasons, details, optional reporter email, bot fields, and Supabase-backed rate limits before saving open reports.
- Production auth is not implemented; local password hashing is explicitly demo-only.
- Initial RLS policies, least-privilege public views, join RPC functions, and rate-limit storage are now drafted; they still need live verification with Supabase anon, authenticated, and service-role access.
- Data retention, deletion, consent, and privacy handling for participant emails and organizer rosters now have initial policy language but still need implementation.
- Event creation, organization approval, proof posting, and trust reports have schema/status foundations; production operator tools and appeal mechanics are still missing.

### DevOps / SRE

Current strengths:

- Vercel deployment is simple: static files plus four serverless functions and one daily cron.
- This run adds a GitHub Actions check workflow with no dependency install step.
- `vercel.json` defines clean event/member URLs and static asset headers.
- A protected `/api/health?readiness=1` endpoint now gives operators a no-secret production readiness check, with optional deep Supabase public-view verification.
- API functions now emit structured JSON logs for join, reminder, and health paths without participant PII.
- `/api/trust-report` emits structured logs without reporter emails or report details, and the production guide now includes trust-report smoke and alert expectations.

GA risks:

- A production setup guide now covers Supabase, Resend, `CRON_SECRET`, join/report abuse controls, backend enablement, rollback, and troubleshooting, but no deployed smoke test or dashboard exists yet.
- The health endpoint, structured logs, deploy checklist, and alert expectations now exist, but no production dashboard or deployed smoke monitor has been configured.
- Rollback guidance is documented, but no rollback drill has been run against a deployed production project.
- Cron delivery and email provider failures are not observable beyond function responses.

### Documentation

Current strengths:

- README explains the project, prototype scope, local setup, deployment shape, SEO files, and required environment variables.
- CONTRIBUTING, SUPPORT, code of conduct, issue templates, crawler files, and markdown event mirrors exist.

GA risks:

- No formal license has been selected.
- Production setup and troubleshooting now cover Supabase schema, RLS, Resend domain setup, cron secret creation, trust report intake, deployment verification, backend enablement, rollback, and common API failures; the gap is live verification evidence.
- `CHANGELOG.md` now records GA-readiness changes; release notes still need versioned dates once the first GA candidate is cut.

### Support / Onboarding

Current strengths:

- GitHub issue templates support bugs, features, event templates, and trust/safety concerns.
- New contributors can run the static site without installing dependencies.

GA risks:

- A first-hour maintainer checklist now exists in the trust and safety guide.
- Support escalation paths for privacy or safety issues now have policy language, but still need a private maintainer channel and public issue-template guidance.
- Operator playbooks now cover bad events, abusive joins, incorrect rosters, bad proof, and email delivery incidents; these still need to be exercised against a staging deployment.

## Prioritized GA Plan

### P0 Release Blockers

1. Production data, auth, and permissions
   - Done this iteration: define Supabase schema for profiles, organizations, organization members, events, joins, proof, trust reports, and audit logs.
   - Done this iteration: add migration, seed data, RLS policies, safe public views, and production setup docs.
   - Done this iteration: add Supabase-backed early access capture with optional operator notification email.
   - Remaining: apply the migration to a real Supabase project, verify RLS with live anon/authenticated/service roles, add production account behavior, and wire event, organization, and proof flows to server-backed data.
   - Acceptance: event create/join/profile data persists across browsers, unauthorized users cannot read private roster data, and local demo language is replaced or clearly gated.

2. Trust, safety, and moderation
   - Done this iteration: document supported and excluded GA event types, organization/event/proof review states, report intake, triage priorities, operator playbooks, privacy expectations, and first-hour maintainer onboarding.
   - Done: replace local self-approval copy with pending maintainer review and add report paths for unsafe events, bad proof, privacy concerns, abusive joins, and misleading details.
   - Remaining: build a production operator workflow for organization/event/proof review, add appeal mechanics, create a private escalation channel, and verify `/api/trust-report` against live Supabase.
   - Acceptance: unapproved organizations cannot publish as official orgs, unsafe content has a documented handling path, reports create private operator-visible records, and participants know what organizer data is shared.

3. API abuse controls and backend hardening
   - Done: join API verifies the Supabase event, saves before email, does not trust client receipt HTML, masks provider errors, and reminder cron requires `CRON_SECRET`.
   - Done this iteration: add a bot-field check, Supabase-backed join rate limits, duplicate join responses, capacity-aware join admission, and server-side calendar generation from trusted event rows.
   - Done this iteration: apply the same bot-field, validation, rate-limit, structured-log, and smoke-test model to `/api/trust-report`.
   - Done this iteration: confirm `/api/trust-report` is included in production setup docs and static API contract checks.
   - Done this iteration: add bot-field, validation, rate-limit, duplicate-email handling, and optional notification email behavior to `/api/early-access`.
   - Remaining: verify against a live Supabase project, add operator alerts/dashboards for blocked joins, blocked reports, early-access save failures, report save failures, and email failures, and extend the same abuse-control model to future public write routes.
   - Acceptance: public join routes cannot be used as open email relays or roster triggers, duplicate/full/rate-limit cases return stable errors, and abuse attempts are rate-limited and logged.

4. GA-critical test coverage
   - Done this iteration: add a dependency-free browser smoke runner that launches the static app in headless Chrome and covers browse/filter, account creation, event creation, joining, calendar confirmation, duplicate backend rejection, full-event behavior, account dashboard, member profile, proof sharing, mobile overflow, and basic accessibility contracts.
   - Done this iteration: ensure the static check suite executes the early-access and trust-report API contracts and verifies trust/safety documentation.
   - Remaining: add deeper keyboard-only, screen reader, visual regression, timezone/date-window, and cross-browser coverage.
   - Acceptance: `npm run check` runs static/API contract checks plus browser smoke checks in CI, and browser failures block release candidates unless explicitly skipped in a constrained local sandbox.

5. Production deployment and operations
   - Done this iteration: document Vercel, Supabase, Resend, cron, secrets, backend enablement, rollback, and failure recovery.
   - Done this iteration: add `/api/health` liveness, protected readiness checks, optional deep Supabase public-event verification, structured API logs, deploy verification steps, and alert expectations.
   - Remaining: verify the production setup against a real deployed project, configure a dashboard/alerts, run a rollback drill, and add automated deployed smoke coverage.
   - Acceptance: a maintainer can deploy, verify, roll back, and diagnose common incidents without private knowledge.

### P1 GA Quality

1. Single source of truth for event content
   - Generate or validate `events.js`, `events.json`, markdown mirrors, and sitemap from one source.

2. Frontend maintainability
   - Extract shared event, member, URL, calendar, and sharing helpers from large browser scripts.

3. User-facing clarity
   - Add clearer empty states, backend failure states, privacy copy, and production-vs-demo labels where needed.

4. Release documentation
   - Add license, changelog, known limitations, privacy notes, and support escalation guidance.

## Current Iteration

Task: make early access observable to operators.

Acceptance criteria:

- Early access submissions no longer rely only on browser `localStorage` when backend calls are enabled.
- `/api/early-access` validates input, rejects bot-field submissions, applies Supabase-backed rate limits, stores requests in a private `early_access_requests` table, and optionally emails `EARLY_ACCESS_NOTIFY_TO`.
- Production docs explain where early access requests go, how to smoke test them, which env vars control notification/rate limits, and which logs/alerts to watch.
- `npm run check` or equivalent local validation executes the early-access API contract and browser smoke covers local early-access persistence.

Status: implemented in this run. Verification: `node scripts/check.mjs` passed. `node --check api/early-access.js`, `node --check app.js`, `node --check scripts/check.mjs`, `node --check scripts/browser-smoke.mjs`, and `git diff --check` passed. `node scripts/browser-smoke.mjs` skipped because this sandbox cannot bind a temporary localhost server. `npm run check` could not be run because `npm` is absent in this shell.

Next recommended task: verify the Supabase migration and API contracts against a live staging project, including RLS checks for anon/authenticated/service-role access and live early-access, duplicate/full/rate-limit join, and trust-report behavior.
