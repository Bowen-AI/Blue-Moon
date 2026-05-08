# Contributing To Blue Moon

Thanks for helping. Blue Moon is trying to make real-world good actions easier to post, join, complete, and share.

## Project Principles

- Keep the first version simple.
- Optimize for real completed events, not abstract engagement.
- Make organizers feel seen.
- Make joining feel low-friction.
- Keep trust and safety visible without making the product bureaucratic.
- Prefer clear language over nonprofit jargon.

## Local Setup

```bash
npm run dev
```

Then open `http://localhost:8000`.

The current prototype is static and uses `localStorage`, so many flows are browser-local until Supabase is connected.

## Before You Start

1. Check the issue tracker for an existing issue.
2. If none exists, open one before starting larger work.
3. Keep pull requests focused on one behavior or improvement.
4. For UI work, include screenshots or a short screen recording.

## Useful Issue Types

- Bug report: something is broken or confusing.
- Feature request: a user problem and a proposed small solution.
- Event template: a repeatable type of good-action event.
- Content/copy improvement: wording that makes the product clearer.
- Trust and safety concern: a risk around public events, identity, moderation, or abuse.

## Lightweight Checks

Run relevant checks before opening a pull request:

```bash
npm run check
```

`npm run check` runs static/API contract checks plus a headless Chrome smoke suite for the core browse, create, join, account, member profile, proof sharing, mobile, and accessibility-contract paths. The browser smoke suite is enforced in CI. If a constrained local sandbox cannot launch Chrome or bind localhost, use `SKIP_BROWSER_SMOKE=1 npm run check` only for that local run and note the limitation in the PR.

For CSS or HTML changes, also test the page manually in a browser at desktop and mobile widths.

For backend data, email, report, or cron changes, read [docs/PRODUCTION_SETUP.md](docs/PRODUCTION_SETUP.md) and keep the Supabase migration, seed data, API code, and `npm run check` assertions in sync.

For event scope, moderation, reports, privacy, or support-escalation changes, read [docs/TRUST_AND_SAFETY.md](docs/TRUST_AND_SAFETY.md) before changing product copy or policies.

## Pull Request Expectations

Include:

- what changed
- why it matters
- how you tested it
- screenshots for visual changes
- any follow-up work you intentionally left out

Avoid:

- broad rewrites without an issue
- adding heavy dependencies without discussion
- adding payments, complex verification, or AI matching before the core loop is proven
- making the product feel guilt-based, bureaucratic, or corporate

## Community Tone

Be direct, kind, and specific. Assume good intent, but name risks clearly. This project touches real people meeting in public places, so safety feedback is welcome and should be taken seriously.
