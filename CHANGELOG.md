# Changelog

## Unreleased

- Added the first GA Supabase backend contract with schema, RLS, safe public views, seed data, and production setup documentation.
- Hardened email-backed API paths for joins and organizer reminders, including published-event verification and cron secret enforcement.
- Added join abuse controls: bot-field rejection, Supabase-backed rate limits, duplicate/full-event API responses, capacity-aware join admission, and server-generated calendar attachments.
- Added dependency-free repository checks for syntax, content inventory, backend contracts, and API behavior.
- Added a dependency-free headless Chrome smoke suite for core GA browser flows, mobile overflow, and basic accessibility contracts.
- Added `/api/health` liveness/readiness diagnostics, structured serverless function logs, and production deploy verification guidance.
- Added `/api/trust-report` with bot-field rejection, allowed-reason validation, Supabase-backed rate limits, privacy-safe logs, and open report storage.
- Added `/api/early-access` with Supabase-backed request capture, rate limits, optional operator notification email, and browser fallback messaging.
- Removed the public local organization self-approval control so organization requests stay in maintainer review until a trusted approval path handles them.
- Added trust/safety operations documentation for supported event scope, report intake, moderation triage, privacy handling, and operator escalation.
- Added trust/safety report coverage to the API checks, browser smoke suite, README, and production verification guide.
