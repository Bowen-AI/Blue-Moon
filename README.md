# Blue Moon

Once in a blue moon, do something good.

Blue Moon is an open-source social event platform for small real-world acts of good. The first goal is intentionally simple: help people create, find, join, complete, and share lightweight community service events.

Think:

> Meetup for doing good, with the emotional reward of Strava.

Not a charity portal. Not a guilt machine. Blue Moon should make it feel easy and social to say, "Some people are cleaning the park Saturday. I can just show up."

## Why This Exists

Communities already have people who want to help, but the path from "I care" to "I showed up" is often too heavy. Many volunteer systems feel bureaucratic, organization-first, or hard to browse casually.

Blue Moon is testing a smaller loop:

1. Someone posts a good-action event.
2. Other people join.
3. The event happens.
4. The organizer posts proof.
5. Participants feel proud.
6. The proof inspires another person to join or create something.

The north star is completed good-action events per month, not vanity metrics.

## Current Prototype

This repo currently contains a static first-MVP prototype:

- landing page
- manually curated event feed
- shareable event pages
- local prototype forms for one-off event creation, organization review requests, joining events, and early access
- local email/password accounts that show joined and organized events by matching the user's email
- event social links for Instagram or another social page
- event report paths for unsafe events, privacy issues, misleading details, abusive joins, and bad proof
- a past-event showcase with share buttons for X, LinkedIn, Facebook, Threads, Instagram, TikTok, copy link, and native share
- local member lookup by name or email
- member profile pages showing community service joined, organized, completed, and type-of-good bubbles with event counts
- public/private join visibility, calendar downloads, backend-ready email receipts, and organizer roster reminders
- MVP search filters for city, ZIP, place, category, and time window
- event templates for beach cleanups, park cleanups, food pantry packing, garden days, tree planting, neighborhood help, and custom events
- suggested event capacity, prefilled by template and editable by the organizer
- static SEO and crawler basics: crawlable metadata, Open Graph/Twitter tags, favicon, manifest, structured data, `robots.txt`, `sitemap.xml`, `events.json`, and `llms.txt`
- one completed-event proof example

## Who Can Contribute

You do not need to be a full-time engineer to help. Useful contributions include:

- product ideas that keep the first version simple
- bug reports with screenshots or exact steps
- copy edits that make the site clearer and warmer
- accessibility improvements
- frontend fixes
- trust and safety suggestions
- event templates for common good-action activities
- local growth ideas for campuses, neighborhoods, cleanup groups, and nonprofits

Start with the [issue tracker](https://github.com/Bowen-AI/Blue-Moon/issues). If you are unsure whether an idea fits, open a discussion-style issue and explain the problem you noticed.

## Ways To Help

Good first issues:

- improve mobile layout
- make event cards easier to scan
- add better empty states
- add more event templates
- improve member profile language
- write simple setup docs
- test the join flow and report rough edges

Larger contribution areas:

- Supabase data model and auth
- event moderation flow
- post-event proof upload
- shareable impact cards
- reminder emails
- organizer tools
- accessibility review
- SEO for event pages

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, issue, and pull request guidance.
See [CHANGELOG.md](CHANGELOG.md) for release-readiness changes.

Short version:

1. Open or pick an issue.
2. Keep the scope small.
3. Run the lightweight checks.
4. Open a pull request with screenshots for UI changes.

Please keep the spirit of the project intact: local, human, lightweight, and focused on real-world action.

## Sponsor Or Donate

Blue Moon is open source and early. Sponsorship helps cover:

- hosting and infrastructure
- email and notification tooling
- design and accessibility work
- moderation and trust-safety improvements
- community testing with real organizers
- small event-supply experiments when appropriate

Use the GitHub Sponsor button if it appears on the repo. If sponsorship is not enabled yet, open an issue titled `Sponsorship or donation` and describe how you would like to help.

Donations should support the platform and community experiments. They should not buy event approval, moderation preference, or influence over safety decisions.

## Vercel Hobby Shape

The default deployment is intentionally lightweight for Vercel's free Hobby plan:

- no Next.js or framework build
- no dependency install step
- no bundled images or uploads
- static HTML/CSS/JS as the main experience
- tiny optional API routes for early access, email, trust/safety reports, and roster reminders
- one daily cron job, which stays within Hobby's once-per-day cron rule

By default, `site.js` has `backendEnabled: false`, so the browser does not call the early-access, email, or report APIs. Set it to `true` only after the Resend and Supabase environment variables are configured.

For the production database contract, start with [`supabase/migrations/202605080001_ga_schema.sql`](supabase/migrations/202605080001_ga_schema.sql). For deployment order, RLS expectations, operator setup, verification commands, and rollback steps, use [`docs/PRODUCTION_SETUP.md`](docs/PRODUCTION_SETUP.md).
For supported event scope, report triage, review rules, and privacy handling, use [`docs/TRUST_AND_SAFETY.md`](docs/TRUST_AND_SAFETY.md).

## Run Locally

```bash
npm run dev
```

Then open `http://localhost:8000`.

Run the dependency-free validation suite with:

```bash
npm run check
```

The check suite runs static/API contract checks and a headless Chrome smoke test for the core browse, create, early access, join, trust/safety report, account, member profile, proof sharing, mobile, and accessibility-contract paths. In constrained local sandboxes where Chrome or localhost binding is unavailable, the browser smoke script skips with a warning; CI and `REQUIRE_BROWSER_SMOKE=1` treat that as a failure.

The forms use `localStorage` so the prototype works without a backend. One-off events appear in the event feed immediately. Users can search by location text, ZIP, category, and time. Organization requests are saved as pending review; production approval must happen through a trusted operator path before an organization can publish as official. The intended production path is to move the same flows into Next.js, Supabase, Supabase Storage, and Resend.

The account flow is also local-only for the prototype. It hashes the demo password in this browser and matches joined/organized events by email. Production should use Supabase Auth with server-side access controls.

## Production Backend

The first production backend contract is documented in [docs/PRODUCTION_SETUP.md](docs/PRODUCTION_SETUP.md). It includes the Supabase schema, RLS expectations, seed data, Vercel environment variables, Resend setup, smoke tests, rollback guidance, and common failure modes.

Backend files:

- [api/health.js](api/health.js)
- [api/early-access.js](api/early-access.js)
- [api/join.js](api/join.js)
- [api/organizer-reminders.js](api/organizer-reminders.js)
- [api/trust-report.js](api/trust-report.js)
- [supabase/migrations/202605080001_ga_schema.sql](supabase/migrations/202605080001_ga_schema.sql)
- [supabase/seed.sql](supabase/seed.sql)
- [docs/TRUST_AND_SAFETY.md](docs/TRUST_AND_SAFETY.md)

Do not enable `site.backendEnabled` until the Supabase migration, seed data, Resend sender, Vercel secrets, early-access capture, trust/safety report intake, and smoke tests are complete.

Use `/api/health` for public API liveness. Use `/api/health?readiness=1` with `Authorization: Bearer <CRON_SECRET>` for protected production readiness, and add `&deep=1` to verify that Supabase exposes at least one published event through the safe public view.

Joining an event works locally right now: the page stores the join, respects public/private name visibility, and generates an `.ics` calendar file with an event reminder. On Vercel, `/api/join` can save the join to Supabase and send the email receipt through Resend when these environment variables are set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `EMAIL_FROM`

For safety, the production join API verifies that the event exists as a published Supabase `events` row before it saves a participant or sends email. Supabase enforces duplicate-email and capacity rules in one backend function, the API rate-limits repeated join attempts, and receipt email plus calendar content are generated on the server instead of trusting browser-supplied HTML or `.ics` content.

Early access works locally as a browser-only demo, but production should use `/api/early-access`. With Supabase configured, the route saves each request in `early_access_requests`; with `EARLY_ACCESS_NOTIFY_TO` plus Resend configured, it also emails the operator. That is the central place to see who asked for early access.

Optional early access controls:

- `EARLY_ACCESS_NOTIFY_TO`
- `EARLY_ACCESS_RATE_LIMIT_WINDOW_SECONDS`
- `EARLY_ACCESS_RATE_LIMIT_MAX`

Event pages include a report form for unsafe details, privacy issues, misleading information, abusive joins, and proof concerns. In the local demo, reports are saved in this browser. With `backendEnabled: true`, `/api/trust-report` validates the target and reason, applies Supabase-backed rate limits, and saves an open row in `trust_reports` without logging reporter emails or report details.

Optional trust report rate controls:

- `TRUST_REPORT_RATE_LIMIT_WINDOW_SECONDS`
- `TRUST_REPORT_RATE_LIMIT_MAX`

Day-of email reminders need a database-backed scheduled job so the server can find who needs a reminder that morning. The production path is to save joins in Supabase and have a daily Vercel Cron Job call a reminder endpoint. Until that backend is connected, the calendar file provides the day-of reminder after the user imports it.

Organizer roster emails are wired for the backend path too. `/api/join` can save joins to Supabase, and `/api/organizer-reminders` is scheduled daily in `vercel.json` to email organizers the roster for events happening tomorrow and today. Add these environment variables before relying on it in production:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `CRON_SECRET`

The reminder endpoint expects `events` to include `id`, `title`, `location_name`, `start_time`, `organizer_email`, and `status`; it expects `event_participants` to include `event_id`, `name`, `email`, `visibility`, `status`, and `joined_at`. The Supabase migration in this repo defines those fields, RLS policies, safe public views, rate-limit storage, duplicate join protection, and capacity-aware join admission.

Until Supabase is connected, the static localStorage demo cannot send scheduled roster emails because the server cannot see browser-only joins.

The reminder endpoint refuses to send configured roster emails unless `CRON_SECRET` is present and the request uses `Authorization: Bearer <CRON_SECRET>`.

## SEO URL

SEO files currently use `https://blue-moon.vercel.app` as the production URL in:

- `site.js`
- `sitemap.xml`
- `robots.txt`
- `llms.txt`
- `llms-full.txt`
- `events.json`
- `site.webmanifest`
- canonical and Open Graph tags in `index.html` and `event.html`

Update those values if the Vercel project or custom domain uses a different URL.

Crawler-friendly entry points:

- `/events.json` is the pure JSON event inventory for agents and integrations.
- `/llms.txt` is the concise AI-readable site map.
- `/llms-full.txt` is the longer AI-readable product and event context.
- `/index.html.md` and `/events/*.md` are clean Markdown mirrors for simple AI/browser fetches.
- `/favicon.svg` and `/site.webmanifest` provide the app/search icon metadata.

## License

This project is intended to be open source. A formal license still needs to be selected before broad reuse. If you need a license now, open an issue so the project owner can choose one explicitly.
