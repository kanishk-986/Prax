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
| AI citations | `/citations` | Automated runs through the extension (ChatGPT, Gemini, Claude with web search; Perplexity stubbed), named, linked and position kept separate, every source saved with owned ones marked, evidence drawer, honest counts, competitors leaderboard, citation gaps to Content ideas, regions and languages, dropped-out and newly named. Tabs: Overview, Questions, Runs, Sources, Competitors. Page-scoped new palette |
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

## AI citations details

- Built from the Ranko teardown (Q48, Q49). Results are labelled "API with web search" everywhere, never "what buyers see".
- `db/008_citations.sql`: `citation_questions` gains `language` and `status` (active, suggested, archived); new `citation_entities` (self and up to 8 competitors, aliases and owned domains), `citation_runs` (full answer, model, status ok, failed or no_sources, exact prompt sent, tokens), `citation_sources` (url, domain, title, cited or only read). The old `citation_results` ticks show on the Runs tab as Manual history and are not mixed into scores.
- The extension (0.5.0) only fetches raw provider responses with keys in `chrome.storage` (`cfg.keys` per provider, plus the main key for its own provider); `src/lib/citations.ts` parses, detects and scores on the page. Detection runs at display time, so alias edits re-score past runs.
- APIs used: Claude Messages with `web_search_20260209` (claude-api skill), pause_turn resumed, server-side fallback on; OpenAI Responses `web_search` with `url_citation` annotations and `user_location` (developers.openai.com/api/docs/guides/tools-web-search); Gemini Interactions API `google_search` with `url_citation` annotations, `Api-Revision: 2026-05-20` (aistudio.google.com/docs/google-search). The parser also reads the older Gemini groundingMetadata shape.
- Region: OpenAI and Claude get an approximate country; Gemini gets the region as a one-line hint in the prompt, shown as "Sent as" in the evidence.
- Share of voice excludes branded questions (containing a self alias), archived questions and failed runs; no sources means linked is unknown, not false.
- Not built yet (scope 9 and 11): accuracy check against a facts sheet, AI-suggested questions (the `suggested` status exists for it).

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

- AI citations against Supabase and real provider keys: needs `db/008_citations.sql`, extension 0.5.0 and keys. Verified offline: `node scripts/test-citations.ts` (33 checks with sample responses shaped like each provider), the extension search job and bridge run in Node with a fake Chrome and network (request shapes, keys, pause_turn, no text in usage reports), types, lint and build. The Gemini Interactions response sample in the docs has no usage block, so Gemini token counts may show as 0.

- Comment Studio against Supabase: needs `db/007_studio.sql`. The extension flow was checked on a mock page with a fake AI (chips from settings, VIP bar, post type, smart style, 2 drafts, repair, Impact, Save, history).

- Network page end to end against Supabase: needs `db/006_network.sql` run in the SQL editor, then a real export uploaded by Alok.

- The bar on real LinkedIn pages. Testing it through automation would break rule 1, so Alok tests by hand and sends screenshots.
- Live AI calls with a real key. No key was used during the build.

## Next, in the agreed order

1. **Step 3 is live** (Network). Waiting for Shashi's real export.
2. **Comment Studio and extension v0.4.0 are built**; waiting for `db/007_studio.sql` and a deploy. Then reinstall the extension from the Extension page.
3. **Step 4:** Content Studio (post drafts), account map, Inbox view (DMs and follow-ups, also in the extension), weekly report, multi-profile overview, merge Strategy and Notes into a Playbook.

## Agreed for the next builds (5 to 6 Nov 2026)

Design direction: the Content Studio preview at https://claude.ai/artifact/GMXzZutPRrr8ZQrrgHctEd (private). Palette dark #141414, red #d64545, dark red #9e1c1c, white; neutral grey only for small secondary text and borders. Plain page title, underline tabs, actions top right, no banners or badges for show. This palette replaces the light-red tokens across the whole app.

Content Studio (posts) and Comment Studio (comments) stay separate; the voice lives in Comment Studio and both use it.
- Write a post: source (idea, link fetched, PDF uploaded, rough draft, saved comment, topic gap), type (text, image, carousel, video, poll, article), scored ideas, hooks checked against the mobile fold (about 140 characters; video: under 3 seconds), 3 drafts with Human and Impact, quick edits that rewrite the text, formatter, visual (statement card, simple diagram, photo with caption; carousels from Antier templates; video script with beats, cover and captions), plan and hand off ("Copy and open LinkedIn", never posts).
- Image generation only once an OpenAI or Google Nano Banana key is added (Connect image key goes to the Extension page).
- Approval: team drafts go to Shashi (owner) on his Today list and Library, In review; approve or ask for changes; withdraw works; only approved posts can be planned.
- Formatter: bold, italic, bold italic, underline, strikethrough, serif, monospace, script, outline, bullets, numbers, arrows, checks, blank line keeper, divider, case changes, undo, clear, Markdown conversion, shortcuts, 3,000 counter, mobile and desktop preview.
- Plan follows the real date; Library shows type, pillar, campaign or Independent, status, date, Human; filters and search.
- Repurpose (one piece into several), post results read when the user opens the post analytics, first comment and reply prep only where needed, team reshare notes later. No quote cards.
- Campaigns: brief (name required, topic, AI-suggested plus manual keywords, 9 objectives, segments, start, duration, posts per week, format mix, message, call to action, success measure); proposed posts in Open, Prove, Deepen, Ask; edit after creation (save, or re-plan unwritten posts); campaign page with the 4-step flow and next action per post. Also agreed: target accounts per campaign, comment campaign on target accounts' posts via Today and Comment Studio, Shashi's weekly time budget with batched approval, connection notes and DMs only when there is a reason (never timed), resource request tracking into Pipeline, end-of-campaign report, mid-campaign check, balance warnings. Later: fast-response mode, event mode, company page and reshare notes, templates. Cut: A/B hooks.

Pipeline: no drag and drop; list plus lead panel (full page on demand) with Lead and Status sections, clickable stage bar with days in stage, next action required on each move, keyboard shortcuts; custom pipelines with templates (Outreach, Bank partners, Investors, Events, blank); activity timeline, lead heat, manual touch plan as a task queue on Today, AI-drafted DM per stage, accounts, deal value, saved views, lost reasons, import from CSV and Network.

AI citations: automated runs through the extension with the user's keys (ChatGPT, Gemini, Claude with web search; Perplexity when keyed), named, linked and ranked kept separate, every cited source logged with owned ones marked, evidence drill-down, honest counts (branded questions and failed runs excluded), competitor leaderboard, citation gaps as tasks, Arabic and Hindi questions, dropped-out alerts; then accuracy check and AI-suggested questions; later lift, repeats, reports. Results are labelled API plus web search.

Order: Content Studio, then Pipeline, then AI citations, then restyle the remaining pages.

## Known gaps

- Sign-in email uses Supabase's built-in sender, which is rate-limited. Fix: custom SMTP (Resend) set up by Alok.
- The extension is installed unpacked and does not auto-update. Option: unlisted Chrome Web Store listing (developer account, one-time 5 USD, set up by Alok).
- Comment voice and topics are per workspace; a second profile needs its own voice written in Settings.

## Reference data

- `seed/shashi/workspace_import.sql`: the SQL that loaded Shashi's workspace (prospects, posts, templates, notes). Already applied; keep for rebuilds.
- `seed/shashi/prospects.json`: the 50 researched prospects behind that import.
- `docs/reference/shashi-30-day-roadmap.html`: the one-month strategy to execution plan the product grew from.
