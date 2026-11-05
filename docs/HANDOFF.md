# Prax handoff, 5 November 2026

## What exists and is live

**Web app** (https://prax-gamma.vercel.app)

| Area | Page | What it does |
|---|---|---|
| Profiles | `/` | List of profiles (workspaces) with the user's role; create a new one |
| Dashboard | `/w/[slug]` | KPIs, next actions, 14-day execution chart, funnel, LinkedIn reach from snapshots, live activity, follow-ups |
| Today | `/today` | Daily checklist generated from quotas; J/K/X keys, Undo toasts, live updates |
| Pipeline | `/pipeline` | Board and table, drag to change stage (optimistic, Undo), prospect drawer with threads |
| Network | `/network` | LinkedIn data export (zip) opened in the browser. Upload, Segments (rules plus hand overrides, seniority, Add to pipeline), Warm paths (connected, talked before, knows someone there; confirm or reject name matches), Topics (own posts and comments by the six pillars) |
| Profile Studio | `/profile` | Upload LinkedIn Save-to-PDF or paste text; score out of 100, keyword map, pros and cons, fixes, 3-month roadmap with ticks, history; Start a new review |
| Content | `/content` | Post plan (titles only so far; drafts deliberately left for later) |
| Comment Studio | `/studio` | Voice Lab (CV, PDF, TXT, DOCX or pasted text to a voice fingerprint, versions kept), Styles (toggle, tweak, custom), Playbooks for 14 post types with Try it, Tuning, Rewrite Lab, Library (saved drafts in Prax, history in the browser), Safety (daily limit, VIPs, export, import, reset) |
| Engagement | `/comments` | Fills itself from the extension; reply rate, modes that earn replies, segments, waiting for reply; Drafting stats (drafts, used, average Human and Impact, style usage, streak) |
| Templates, AI citations, Strategy, Notes | | Record lists; citations is a weekly grid of 4 AI tools |
| Extension | `/extension` | Install steps, one-click connect, AI provider and key, Quiet mode, usage and billing |
| Settings | `/settings` | Profile, daily quotas, comment voice, team roles and invites |

Roles: owner, editor, commenter, viewer, enforced by RLS.

**Chrome extension v0.4.0** (`extension/`)

- `content.js` on linkedin.com: a "Write with Prax" bar under every post's action row with 10 mode chips and Alt+P. It auto-detects post type, shows 3 ranked drafts with Human and Value scores, and offers Shorter, Sharper, Warmer and Push back. Use fills an open box or copies. Reply on comments under the profile's own posts. Prax note in LinkedIn's connection note box (300 characters). Posts are found by their Like, Comment and Repost buttons rather than class names.
- `background.js`: the only place that calls the AI provider and Prax. It reports token usage, never text.
- `bridge.js` on the Prax site: lets the Extension page connect the browser and set the AI key.
- `panel.*` side panel: Capture (profile, analytics) and a Quiet mode drafter.

**Automatic moves in the database**

- Logging a comment ticks one of today's comment items. A comment on a prospect's post moves Target to Warming. A reply marks them warm.
- A note sent moves the prospect to Requested (or creates them) and ticks a request item.

## Comment Studio details

- Modelled on the features of VoxReply (seen from Alok's screenshots), rebuilt for C-suite and B2B readers. No VoxReply code or text was used. License and managed AI were left out: Prax uses the user's own key.
- `db/007_studio.sql`: `studio_settings` (empty fields mean the defaults in `src/lib/studio.ts`), `voice_versions`, `saved_drafts`, scores and style on `ext_usage`, `ext_me` returns studio settings and open prospects (VIPs), `ext_save_draft`.
- `/api/ext/me` merges the defaults and sends ready-made rule text, so `src/lib/studio.ts` is the single source of defaults.
- Every draft: workspace voice (locked rules, Settings) + fingerprint + `LOCKED_RULES` + style + playbook + tuning. Guardrail repair and auto-humanize add at most one extra call.
- Website AI (Voice Lab, Playbooks Try it, Rewrite Lab) goes page → `bridge.js` → background → provider, with the key in the browser. Voice analysis uses `plain` so house rules do not colour it.
- Daily limit counts comment, reply and note drafts per browser. History is the last 200 drafts in `chrome.storage.local`.

## Network (step 3) details

- `db/006_network.sql`: `network_people` (connections and anyone messaged or invited; message counts and dates only, never text or emails), `network_posts` (own posts and comments), `network_imports`, `network_settings` (segment and topic rules; empty means the defaults in `src/lib/network.ts`). `network_merge` keeps hand-set segments, prospect links and first-seen dates on re-upload and returns the count of new people. `network_wipe` is owner only. `network_warm_count` feeds the Dashboard tile.
- Segments are computed at display time: hand-set segment, else a prospect's company, else the rules (regional D and B first, then C, A, E). The export has no location, so regional segments come from company names.
- Warm path levels: 1 already connected, 2 talked before (1:1 messages, or a reply logged by the extension), 3 a connection at the same company. True 2nd-degree paths are not in the export. Reading the mutual-connections line from a profile the user opens is a later extension release.
- A prospect's LinkedIn URL links them automatically on import; name matches wait for Same person or Not them.
- `net_norm()` in SQL and `normCompany()` in TS must stay identical.

## Verified

- Network logic: `node scripts/test-network.ts` passes (18 checks); 25,000 connections read in about 0.5 s, segments and warm paths in under 1 s. Build, types and lint pass.

- Extension API end to end with a temporary token: log, capture, prospect matching, stage move and ticks. Test data was deleted afterwards.
- The bar and drafts panel on a mock LinkedIn-style page.

## Not verified yet

- Comment Studio against Supabase: needs `db/007_studio.sql`. The extension flow was checked on a mock page with a fake AI (chips from settings, VIP bar, post type, smart style, 2 drafts, repair, Impact, Save, history).

- Network page end to end against Supabase: needs `db/006_network.sql` run in the SQL editor, then a real export uploaded by Alok.

- The bar on real LinkedIn pages. Testing it through automation would break rule 1, so Alok tests by hand and sends screenshots.
- Live AI calls with a real key. No key was used during the build.

## Next, in the agreed order

1. **Step 3 is live** (Network). Waiting for Shashi's real export.
2. **Comment Studio and extension v0.4.0 are built**; waiting for `db/007_studio.sql` and a deploy. Then reinstall the extension from the Extension page.
3. **Step 4:** Content Studio (post drafts), account map, Inbox view (DMs and follow-ups, also in the extension), weekly report, multi-profile overview, merge Strategy and Notes into a Playbook.

## Content Studio, first build (Campaigns, Plan, Library)

- `/studio-content` replaces the old Content page (`/content` redirects). Palette scoped by `.cs` in `globals.css`; global tokens unchanged.
- `db/009_campaigns.sql` (after 008): `campaigns` (brief jsonb, kind standard, fast or event, template flag, active, paused or done), `campaign_targets`, `resource_requests`, and new `posts` columns (campaign, pillar, phase, planned time, approval fields, hold status). Old post statuses map to Idea, Drafting, In review, Ready, Posted, On hold.
- Logic in `src/lib/campaigns.ts`, checked by `scripts/test-campaigns.ts`. UI in `src/components/content/`.
- Today items made by campaigns are kind `custom` in fixed index bands (2000s comment tasks, 3000 weekly approval session, 3100 fast response, 3200s event follow-ups, 4000s message tasks), so they upsert without duplicates. Paused campaigns create none.
- Approval: team drafts go In review; owners approve or ask for changes with a note; one weekly approval session item on Today.
- Not built yet: the seven-step Write flow and the Formatter (tabs say so). Not verified against Supabase: needs 008 and 009 run first.

## Known gaps

- Sign-in email uses Supabase's built-in sender, which is rate-limited. Fix: custom SMTP (Resend) set up by Alok.
- The extension is installed unpacked and does not auto-update. Option: unlisted Chrome Web Store listing (developer account, one-time 5 USD, set up by Alok).
- Comment voice and topics are per workspace; a second profile needs its own voice written in Settings.

## Reference data

- `seed/shashi/workspace_import.sql`: the SQL that loaded Shashi's workspace (prospects, posts, templates, notes). Already applied; keep for rebuilds.
- `seed/shashi/prospects.json`: the 50 researched prospects behind that import.
- `docs/reference/shashi-30-day-roadmap.html`: the one-month strategy to execution plan the product grew from.
