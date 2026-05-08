# Blue Moon Trust And Safety Playbook

Blue Moon is for lightweight, public-interest community events. GA should keep the loop simple while making review, reporting, and escalation obvious.

## GA Event Scope

Supported for GA:

- public-space cleanups
- food pantry packing or sorting
- community garden days
- tree planting with permission
- neighborhood support events with a clear meetup plan

Not supported for GA:

- events involving medical care, emergency response, childcare, overnight stays, private homes, weapons, political campaigning, paid work, fundraising for an individual, or activities that require complex credential checks
- events that ask participants to share sensitive personal, health, financial, immigration, or legal information
- automated moderation decisions without human review

## Review Model

Organizations:

- `pending_review`: created by an organizer, not allowed to publish as an official organization yet
- `approved`: reviewed by a maintainer, allowed to publish organization events
- `rejected`: not approved; the review note should explain why
- `suspended`: previously approved, temporarily blocked from publishing

Events:

- `draft`: private to the creator or organization
- `pending_review`: submitted for maintainer review
- `published`: visible and joinable
- `completed`: finished and eligible for proof
- `cancelled` or `rejected`: not joinable

Proof:

- `pending_review`: submitted, not public yet
- `published`: visible on public proof surfaces
- `rejected` or `removed`: not public

The static demo still lets one-off events appear in the same browser for local testing. Production one-off and organization events should move through server-backed review before public publishing.

Users cannot approve their own organization. A maintainer must review the organization owner, public description, contact path, and event fit before the organization can publish official events.

## Report Intake

Event pages include a report form for:

- unsafe event details
- privacy issues
- wrong or misleading information
- abusive joins or roster concerns
- proof concerns
- other trust and safety concerns

When the backend is enabled, `/api/trust-report` validates reports, rejects bot-field submissions, applies Supabase-backed rate limits, and stores open reports in `trust_reports`. When the backend is not configured, the browser stores the report locally for demo visibility and tells the user to contact the project owner privately for urgent or sensitive issues.

Reports must not expose reporter email, bearer tokens, API keys, raw details, or private participant data in function logs.

### POST /api/trust-report

The production report endpoint accepts event, organization, or proof targets. It allows only known reasons, requires enough details for review, accepts an optional reporter email, rejects bot-field submissions, and rate-limits repeated submissions before inserting an open `trust_reports` row.

## User Privacy Promise

- Participant emails are for event coordination, receipts, reminders, support, and safety review only.
- Public/private join visibility controls whether the participant name appears publicly; organizers still receive roster information for coordination.
- Report details and reporter emails stay out of public pages, public views, function logs, and public issue comments.
- Proof is public only after review; pending, rejected, or removed proof must not appear in public proof views.
- Users can ask for correction or deletion of personal data through the support or trust/safety path.

## Operator Response

Minimum response targets for GA:

- P0, act immediately: credible physical safety risk, active privacy exposure, threatening abuse, or an event happening within 24 hours.
- P1, same day: event within 48 hours, organizer impersonation, misleading location, or exposed participant information.
- P2, 2 business days: abusive joins, spam, misleading proof, or repeated low-trust submissions.
- P3, 5 business days: typo, non-urgent content correction, or low-risk context request.
- High-risk safety or privacy concern: review same day.
- Event taking place within 48 hours: review before the event starts.
- Abuse, spam, or misleading proof: review within 2 business days.
- Low-risk content correction: review within 5 business days.

Operator steps:

1. Open the report in Supabase `trust_reports`.
2. Review the public event, organization, proof, and any related participant records.
3. Avoid copying private personal information into public GitHub issues.
4. If the issue is urgent or sensitive, coordinate privately with the project owner.
5. Update the affected organization, event, or proof status when needed.
6. Add a concise `review_note` or report resolution note.
7. Mark the report `reviewing`, then `resolved` or `dismissed`.

## Operator Playbooks

Unsafe event:

1. Set the event to `pending_review`, `cancelled`, or `rejected`.
2. If the organizer is the risk, set the organization to `suspended`.
3. Contact the organizer only when it is safe and useful.
4. Leave a concise private review note without public PII.

Unapproved organization publishing attempt:

1. Keep the organization `pending_review` or set it to `rejected`.
2. Keep official organization events in `draft` or `pending_review`.
3. Ask for a public website, contact path, and event fit before approval.

Privacy issue or incorrect roster:

1. Verify the affected participant or reporter controls the email or account.
2. Remove public proof or public participant names when needed.
3. Correct or remove the affected participant row.
4. Check whether an organizer email already received incorrect roster data.
5. Avoid public discussion of private details.

Misleading or bad proof:

1. Set proof to `removed` or `rejected` until corrected.
2. Keep the event public only if the event itself is still accurate and safe.
3. Ask the organizer for corrected proof when appropriate.

Abusive joins:

1. Remove affected participants or mark them `removed`.
2. Preserve minimal audit detail.
3. Monitor `join.rate_limited`, `join.bot_detected`, and duplicate-join logs.
4. Tighten join rate-limit settings if abuse is active.

Email delivery incident:

1. Set `backendEnabled: false` and redeploy if the public join flow is misfiring.
2. Remove or rotate `RESEND_API_KEY` when needed.
3. Check Resend bounce, complaint, and delivery logs.
4. Confirm `/api/health?readiness=1` and `/api/join` before re-enabling backend calls.

## First-Hour Maintainer Checklist

Before handling production reports, a maintainer should be able to:

1. Read the GA event scope and reject or defer unsupported event types.
2. Confirm users cannot approve their own organization in the production workflow.
3. Open Supabase and find `trust_reports`, `events`, `organizations`, `event_participants`, and `event_proofs`.
4. Confirm they know which public domain is active and whether `site.backendEnabled` is true.
5. Run `/api/health` and protected `/api/health?readiness=1&deep=1`.
6. Submit one staging report through `POST /api/trust-report` and confirm the row appears with `status = 'open'`.
7. Review Vercel function logs and confirm reporter emails, report details, secrets, and bearer tokens are absent.
8. Find the current deploy rollback path in [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md).
9. Identify the private channel for sensitive safety/privacy details.

## GA Blockers

Before GA, run a live staging review with anon, authenticated, and service-role credentials to prove:

- only safe public views are readable by anonymous clients
- unapproved organizations cannot publish official events
- pending events and pending proof are not public
- `trust_reports` accepts public inserts but does not expose report contents publicly
- `/api/trust-report` rate limits repeated submissions
