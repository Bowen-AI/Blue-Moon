# Blue Moon

Once in a blue moon, do something good.

This repo currently contains a Stage 0 static prototype for the Blue Moon traction test:

- landing page
- manually curated event feed
- shareable event pages
- local prototype forms for one-off activity posts, organization creation, org approval, joining activities, and early access
- one completed-event proof example

## Run Locally

```bash
npm run dev
```

Then open `http://localhost:8000`.

The forms use `localStorage` so the prototype works without a backend. One-off posts appear in the activity feed immediately. Organizations can be created, approved in the local demo, and then used as the organizer for official org posts. The intended production path is to move the same flows into Next.js, Supabase, Supabase Storage, and Resend.
