# Prax handoff, 5 November 2026

## What exists and is live

**Web app** (https://prax-gamma.vercel.app)

| Area | Page | What it does |
|---|---|---|
| Profiles | `/` | List of profiles (workspaces) with the user's role; create a new one |
| Dashboard | `/w/[slug]` | KPIs, next actions, 14-day execution chart, funnel, LinkedIn reach from snapshots, live activity, follow-ups |
| Today | `/today` | Daily checklist generated from quotas; J/K/X keys, Undo toasts, live updates |
| Pipeline | `/pipeline` | Board and table, drag to change stage (optimistic, Undo), prospect drawer with threads |
| Profile Studio | `/profile` | Upload LinkedIn Save-to-PDF or paste text; score out of 100, keyword map, pros and cons, fixes, 3-month roadmap with ticks, history |
| Content | `/content` | Post plan (titles only so far; drafts deliberately left for later) |
| Engagement | `/comments` | Fills itself from the extension; reply rate, modes that earn replies, segments, waiting for reply |
| Templates, AI citations, Strategy, Notes | | Record lists; citations is a weekly grid of 4 AI tools |
| Extension | `/extension` | Install steps, one-click connect, AI provider and key, Quiet mode, usage and billing |
| Settings | `/settings` | Profile, daily quotas, comment voice, team roles and invites |

Roles: owner, editor, commenter, viewer, enforced by RLS.

**Chrome extension v0.3.0** (`extension/`)

- `content.js` on linkedin.com: a "Write with Prax" bar under every post's action row with 10 mode chips and Alt+P. It auto-detects post type, shows 3 ranked drafts with Human and Value scores, and offers Shorter, Sharper, Warmer and Push back. Use fills an open box or copies. Reply on comments under the profile's own posts. Prax note in LinkedIn's connection note box (300 characters). Posts are found by their Like, Comment and Repost buttons rather than class names.
- `background.js`: the only place that calls the AI provider and Prax. It reports token usage, never text.
- `bridge.js` on the Prax site: lets the Extension page connect the browser and set the AI key.
- `panel.*` side panel: Capture (profile, analytics) and a Quiet mode drafter.

**Automatic moves in the database**

- Logging a comment ticks one of today's comment items. A comment on a prospect's post moves Target to Warming. A reply marks them warm.
- A note sent moves the prospect to Requested (or creates them) and ticks a request item.

## Verified

- Extension API end to end with a temporary token: log, capture, prospect matching, stage move and ticks. Test data was deleted afterwards.
- The bar and drafts panel on a mock LinkedIn-style page.

## Not verified yet

- The bar on real LinkedIn pages. Testing it through automation would break rule 1, so Alok tests by hand and sends screenshots.
- Live AI calls with a real key. No key was used during the build.

## Next, in the agreed order

1. **Step 3:** LinkedIn data export (zip) upload, then network intelligence: connections by segment, warm paths, topics of past posts and comments.
2. **Step 4:** Content Studio (post drafts), account map, Inbox view (DMs and follow-ups, also in the extension), weekly report, multi-profile overview, merge Strategy and Notes into a Playbook.

## Known gaps

- Sign-in email uses Supabase's built-in sender, which is rate-limited. Fix: custom SMTP (Resend) set up by Alok.
- The extension is installed unpacked and does not auto-update. Option: unlisted Chrome Web Store listing (developer account, one-time 5 USD, set up by Alok).
- Comment voice and topics are per workspace; a second profile needs its own voice written in Settings.

## Reference data

- `seed/shashi/workspace_import.sql`: the SQL that loaded Shashi's workspace (prospects, posts, templates, notes). Already applied; keep for rebuilds.
- `seed/shashi/prospects.json`: the 50 researched prospects behind that import.
- `docs/reference/shashi-30-day-roadmap.html`: the one-month strategy to execution plan the product grew from.
