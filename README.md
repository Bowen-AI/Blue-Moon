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
- local prototype forms for one-off event creation, organization creation, organization approval, joining events, and early access
- local email/password accounts that show joined and organized events by matching the user's email
- event social links for Instagram or another social page
- a past-event showcase with share buttons for X, LinkedIn, Facebook, Threads, Instagram, TikTok, copy link, and native share
- local member lookup by name or email
- member profile pages showing community service joined, organized, completed, and type-of-good bubbles with event counts
- public/private join visibility, calendar downloads, backend-ready email receipts, and organizer roster reminders
- MVP search filters for city, ZIP, place, category, and time window
- event templates for beach cleanups, park cleanups, food pantry packing, garden days, tree planting, neighborhood help, and custom events
- suggested event capacity, prefilled by template and editable by the organizer
- static SEO basics: crawlable metadata, Open Graph/Twitter tags, structured data, `robots.txt`, and `sitemap.xml`
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
- tiny optional API routes for email and roster reminders
- one daily cron job, which stays within Hobby's once-per-day cron rule

By default, `site.js` has `backendEnabled: false`, so the browser does not call the email API. Set it to `true` only after the Resend and Supabase environment variables are configured.

## Run Locally

```bash
npm run dev
```

Then open `http://localhost:8000`.

The forms use `localStorage` so the prototype works without a backend. One-off events appear in the event feed immediately. Users can search by location text, ZIP, category, and time. Organizations can be created, approved in the local demo, and then used as the organizer for official organization events. The intended production path is to move the same flows into Next.js, Supabase, Supabase Storage, and Resend.

The account flow is also local-only for the prototype. It hashes the demo password in this browser and matches joined/organized events by email. Production should use Supabase Auth with server-side access controls.

Joining an event works locally right now: the page stores the join, respects public/private name visibility, and generates an `.ics` calendar file with an event reminder. On Vercel, `/api/join` can send the email receipt through Resend when these environment variables are set:

- `RESEND_API_KEY`
- `EMAIL_FROM`

Day-of email reminders need a database-backed scheduled job so the server can find who needs a reminder that morning. The production path is to save joins in Supabase and have a daily Vercel Cron Job call a reminder endpoint. Until that backend is connected, the calendar file provides the day-of reminder after the user imports it.

Organizer roster emails are wired for the backend path too. `/api/join` can save joins to Supabase, and `/api/organizer-reminders` is scheduled daily in `vercel.json` to email organizers the roster for events happening tomorrow and today. Add these environment variables before relying on it in production:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

The reminder endpoint expects `events` to include `id`, `title`, `location_name`, `start_time`, `organizer_email`, and `status`; it expects `event_participants` to include `event_id`, `name`, `email`, `visibility`, `status`, and `joined_at`.

Until Supabase is connected, the static localStorage demo cannot send scheduled roster emails because the server cannot see browser-only joins.

## SEO URL

SEO files currently use `https://blue-moon.vercel.app` as the production URL in:

- `site.js`
- `sitemap.xml`
- `robots.txt`
- canonical and Open Graph tags in `index.html` and `event.html`

Update those values if the Vercel project or custom domain uses a different URL.

## License

This project is intended to be open source. A formal license still needs to be selected before broad reuse. If you need a license now, open an issue so the project owner can choose one explicitly.
