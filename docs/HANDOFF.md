# Prax handoff, 5 November 2026

## AI providers and keys (6 Nov 2026, branch `provider-branding`, not deployed)

- One source: `src/lib/providers.ts` (names, logos, default models, usage maths, display rules in its header comment). `src/components/provider-mark.tsx` has `ProviderLogo`, `ProviderMark`, `KeyDot`, `KeyState`, `ModelId`, `KeyRow` (the key ledger row), `DraftModelRow` and `useProviderUsage`. `src/components/provider-keys.tsx` holds the Extension page's AI model and AI search key cards. `extension/marks.js` is the plain JS copy for the side panel; `node scripts/test-providers.ts` checks both copies match.
- Logos: simple-icons (CC0) paths, unaltered. Claude, Google Gemini, Perplexity from 16.36.0 in their simple-icons colours; OpenAI from 15.22.0 (the last release with it) in black per OpenAI's brand page. xAI Grok has no mark (no CC0 or downloadable official asset), so it shows its name with an empty slot.
- Rules: full name ("Anthropic Claude", "OpenAI ChatGPT", "Google Gemini", "Perplexity") in rows and pickers, short name in dense cells and logs; brand colour on light surfaces, white on dark; 16px in rows, 14px inline; the PDF uses names only. Key state is "Connected in this browser" or "No key in this browser" with a dot; keys are never read back, at most "Saved ····". One action per row: Connect or Replace key; Remove key sits inside the replace form.
- Usage per provider comes from `ext_usage` for the signed-in user (last used, this month's calls and tokens; cost only for models in `PRICE`), otherwise "None".
- Where: Extension page (AI model card, Keys for AI search ledger, usage table), AI citations (Connect AI keys window, Home engines table and recent activity, run panel, answer evidence, Runs table, draft test, share report, engine names in the PDF via `ENGINES`), Discovery Studio (run panel, AI tools panel, search log), Content Studio (image key block), Comment Studio Home (Drafts are written by row), Dashboard (AI citations line shows the marks of the tools that answered), extension side panel (AI keys in this browser card). Extension 0.8.1; only `panel.*`, `marks.js` and the manifest changed.
- Checked in a temporary preview route with sample data and a fake bridge at 1440 and 390 wide, and the side panel with stubbed Chrome APIs. Not checked signed in against Supabase, or as an installed extension.

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

Content Studio additions agreed on 6 Nov 2026 (next build, with Write and Formatter):
- Point-of-view bank (Q61): Shashi's approved stances, cleared proof points, stories and allowed numbers; every draft and campaign proposal draws only from it.
- Regulated-claims check (Q64): before approval, flag promises on returns or timelines, client names without a permission tick, harsh lines about a regulator, confidential deal details.
- LinkedIn newsletter track (Q66): mark articles for a newsletter (for example Operator Notes) with its own cadence in Plan; feeds AI citations.
- What works (Q67): from his own post results, which types, pillars, days, times and hooks land with target segments; nudges proposed plans. Shows "not enough results yet" until there is data.
- Declined: first-hour engagement block (Q62), mobile one-tap approval (Q63), tag check (Q65).

Order: Content Studio, then Pipeline, then AI citations, then restyle the remaining pages.
## Content Studio, first build (Campaigns, Plan, Library)

- `/studio-content` replaces the old Content page (`/content` redirects). Palette scoped by `.cs` in `globals.css`; global tokens unchanged.
- `db/009_campaigns.sql` (after 008): `campaigns` (brief jsonb, kind standard, fast or event, template flag, active, paused or done), `campaign_targets`, `resource_requests`, and new `posts` columns (campaign, pillar, phase, planned time, approval fields, hold status). Old post statuses map to Idea, Drafting, In review, Ready, Posted, On hold.
- Logic in `src/lib/campaigns.ts`, checked by `scripts/test-campaigns.ts`. UI in `src/components/content/`.
- Today items made by campaigns are kind `custom` in fixed index bands (2000s comment tasks, 3000 weekly approval session, 3100 fast response, 3200s event follow-ups, 4000s message tasks), so they upsert without duplicates. Paused campaigns create none.
- Approval: team drafts go In review; owners approve or ask for changes with a note; one weekly approval session item on Today.
- Not built yet: the seven-step Write flow and the Formatter (tabs say so). Not verified against Supabase: needs 008 and 009 run first.

## Content Studio, full build (branch content-studio-full, 6 Nov 2026)

- `db/012_content_studio.sql` (after 010; 011 belongs to AI citations): new `posts` columns `channel` (shashi or company), `newsletter`, `source_kind`, `source_ref`, `hook`, `script`, `visual`, `claims_ack`, and table `content_settings` (point-of-view bank and newsletter per workspace).
- Tabs: Home (tiles, Needs you, Start something, What works), Write a post (seven steps), Campaigns, Plan, Library, Formatter. Entry moment once per session; guided tour of 14 steps once per browser, replayed from Guide.
- `/api/fetch-url` reads public pages for the Link source: http and https only, never LinkedIn, private and local addresses refused (checked after DNS too and on each redirect), 10 s, 2 MB, scripts stripped, nothing stored.
- Images come from the extension's new `image` job (0.6.0) with the OpenAI or Google key already saved on the Extension page. Generated images stay in the browser to download; only the brief is stored. Carousels download as a PDF built in `src/lib/pdf.ts`.
- Claims check (`claimsCheck` in `src/lib/content.ts`) runs before approval in Write and in the post editor; it needs a tick to go on. Company content is flagged in every view.
- Not verified against Supabase or in a browser yet: needs 012 run and extension 0.6.0 installed.

## AI citations, complete (Q60)

- Page `/w/[slug]/citations`: tabs Overview, Questions, Answers, Sources, Competitors, Actions. Top right: Ask (right-side chat over your own runs), Draft test, a three-dot menu (Facts sheet, Report, Share a view-only link) and Run questions.
- Overview: headline count, per-engine rows, Alerts (dropped out, newly named, wrong fact, competitor overtook), Your next moves, His LinkedIn profile (facts sheet against headline and About).
- Questions: Quick setup drafts 20 questions (AI, or a fixed starter list without a key) as Suggested; Suggested list with approve or dismiss and Suggest more; question sets with roll-ups; asks per run 1 to 3 per question.
- Answers: grid on the latest batch (repeats within 3 hours count as one; named when more than half of usable repeats name him), tone, wrong-fact marker; evidence drawer with "Check tone and facts". Run history below.
- Sources: sites, citation gaps, Comment targets (LinkedIn people and pages the AI cites; Add as VIP writes Comment Studio safety.vips and a Today task), his LinkedIn in answers with "Suggest a LinkedIn article".
- Actions: recommendations On his profile and Elsewhere, from the data plus "Suggest more with AI"; Accept stores a baseline and creates a post Idea or a Today task; lift is the named share on the target questions then and now.
- Draft test also opens from Content Studio's post editor ("Is this citable?", saved drafts over 80 characters).
- Report overlay prints only the report; share links store a sha256 token and a snapshot, expire in 1 to 30 days, can be turned off, and are read at `/share/[token]` through `citation_share()`.
- Campaign report reads real numbers: `campaignLift` picks questions by campaign topic, keywords or `citation_questions.campaign_id`.
- Today adds one "Run the AI citation questions" task when the last run is 7 days old or there has never been one.
- `db/010_citations_more.sql` (after 009). Tone and wrong facts are stored on `citation_runs` when the check runs; alerts are computed on the page. Not verified against Supabase yet.

## Section shell (app-wide look, Wave 1)

Every section uses `src/components/shell/index.tsx`; the gating and tour maths are pure functions in `src/lib/shell.ts`, tested by `node scripts/test-shell.ts`.

- `Section({ id, title, status, entryStatus, actions, tabs, tab, onTab, steps, wide })` renders the entry moment, the header (title, status line, Guide button, actions top right), `UnderlineTabs` and the tour. `id` is the gating key, so keep it stable.
- Entry moment: blurred veil, Prax mark, title and `entryStatus` (one live sentence). It dissolves after 2.3 s, on Enter or Escape, or on the button. It plays once per section per session (`sessionStorage prax:intro:<id>`) and never with reduced motion.
- Tour: pass `steps: TourStep[]` (`{ target, title, body, tab? }`). Mark each target with `data-tour="<target>"`; `header` is built in. A step with `tab` switches to that tab through `onTab` first. The tour starts once per person per section after the entry moment (`localStorage prax:tour:<id>:<userId>`), and Guide reopens it. Keep tours at 6 to 10 steps, first step explains what the section is for.
- Home blocks: `KpiTiles` (`href` or `onClick`, optional `selected` and `tone: "alert"`; see Uniform tiles below), `NeedsYou`, `StartCards`, `Activity`, `DarkCard`. Each takes `tour` to become a tour target. Use real data and an honest empty state; show "None" rather than a dash.
- Settings and Extension keep `PageHeader`, restyled to the same type, with no entry moment.
- Palette and tab, pill, tile, entry and tour classes are in `globals.css`. Content Studio and AI citations move onto `Section` after merge; their previews already match this API.

## AI citations studio (6 Nov 2026, branch `citations-studio`)

- Tabs now: Home, Gaps (red count), Prompts (was Questions), Answers, Sources, Competitors, Actions, Report, Company. Old `?tab=Overview` and `?tab=Questions` links still work. New UI lives in `citations/studio.tsx`; the logic is in `src/lib/citations.ts` (person and company section at the end).
- `db/011_citations_person_company.sql` (after 010, re-runnable): `citation_entities.subject` (person or company) and `status` (active or suggested); splits the combined self row into Shashi Pal (person, LinkedIn domains) and Antier (company); `citation_questions.audience` (expert, vendor, leadership, backfilled from wording) and `keywords`; `citation_runs.person_review`; `posts.channel` (shashi or company) and `posts.citation_question_id`.
- Shashi counts only by his full name with context in the same paragraph (Antier, his role, or a topic or keyword); otherwise "needs review" with Yes or Someone else in the evidence drawer. "Shashi" or "Pal" alone never counts. Peer experts and peer firms are separate pools; suggested rows track nothing until approved. No peer experts were pre-filled: Prax does not guess people.
- Gaps send a posts row as an Idea (topic "AI citations", the prompt, rivals and AI tools in `resource`), channel `shashi` for expert and leadership prompts and `company` for vendor prompts; Undo deletes the row.
- Report tab: one report per week that has runs, 12 numbered sections, PDF from `src/lib/pdf.ts` (hand-written, Helvetica), CSV, and the existing share link.
- Keys: "Connect AI keys" writes OpenAI, Google, Anthropic and Perplexity keys to the extension through the bridge and never reads them back. Perplexity runs through Chat Completions with model `sonar` (docs.perplexity.ai API reference: `search_results`, `citations`, `usage`). Extension 0.7.0.
- Entry screen once per browser session; guided tour of 15 steps starts once per user and reopens from Guide.

## Dashboard and Today redesign (6 Nov 2026, branch `dashboard-today`)

- Dashboard (`/w/[slug]`): greeting plus one sentence on the week (`weekSentence`), four headline tiles (In pipeline with people added this week, Warm paths, Posts this week against planned, Comments this week against target with a 14-day line), Needs you now ranked by `rankNeeds` (overdue follow-ups and posts first, growing with age; then approvals, today's plan, the weekly AI citation run, people warming up, the Network upload), This week at a glance (Today, Content Studio, Comment Studio, Pipeline, Network, AI citations), recent activity and LinkedIn reach. Tour of 8 steps. Prax has no Discovery section, so the glance has no row for it.
- LinkedIn MCP button (`src/components/linkedin-mcp.tsx`): LinkedIn blue #0A66C2 with the simple-icons mark as inline SVG and a Coming soon tag. It only shows an info toast; nothing connects.
- Today (`/today`): no tabs any more, one agenda. Progress ring with per-group bars, a Due and overdue strip (pipeline follow-ups and posts whose date has come), then groups in a fixed order: Comment, Post, Follow up, Connect, Other (`groupOf` maps the campaign index bands). Each row: type, who or what, link, one action (`primaryAction`: the saved link, else the LinkedIn feed for comments, Pipeline for requests and messages; never posts or sends), Done and Skip. When nothing is left, a dark Day complete summary replaces the progress card. Keys: J and K move, X done, S skip (new). Tour of 8 steps.
- Skip is stored in `daily_items.note` behind a `skip:` prefix (`skipNote`, `unskipNote`), so no SQL change was needed. Done and skipped both clear an item; only done counts on the Dashboard. If the extension later ticks a skipped item it overwrites the note, which also clears the skip.
- Shell additions every section gets: `KpiTiles` take optional `delta` and `spark`, numbers count up once on first view, clickable tiles lift on hover; `NeedsYou` takes `when` and `count`; `Activity` takes `action`; new `Panel`, `ProgressRing`, `Spark`, `CountUp`, `useCountUp` and `reveal(i)` for the staggered entrance. The toaster takes `{ info: true }` for a neutral message. The entry moment no longer sticks in dev under React strict mode. All motion is off under reduced motion.
- Logic in `src/lib/dashboard.ts`, checked by `node scripts/test-dashboard.ts`.
- Checked in a browser against sample data through a temporary local harness (not committed); not checked signed in against Supabase.
- Second pass (Q95, Q98): a fifth Dashboard tile "Shashi in AI answers" (share of latest answers per prompt and AI tool over 28 days that name him under strict matching, change in points from this week's runs against last week's; "None" with the reason when there are no prompts or answers). Five tiles lay out 1 + 2 + 2 on phones, 2 + 3 on tablets, one row of five on wide screens. Today rows now hold a just-cleared row in place for a moment and then slide it below the open ones (`settleOrder`, `useFlip` in the shell); the tick draws in, the strike fades in, the ring and counts roll to the new number and the ring settles slightly as tasks clear; group bars show skipped as a grey segment, show what is left on hover and jump to the group on click; the type label explains itself on hover or focus; long titles wrap instead of being cut off. Phones get a second line per row for the type and buttons. Shell font shorthands were split because `@theme inline` does not emit `--font-sans` as a real variable.

## Design and UI audit fixes (6 Nov 2026, branch `audit-fixes`)

- Tokens in `globals.css`: text greys are `--muted` #5f5f5f and `--faint` #6b6b6b (both at least 4.5:1 on white and the canvas); `--stroke` #b5b5b5 and `--track` are for borders and chart strokes only. Tailwind gets `text-faint`, `border-stroke`, `bg-track`, `text-dark-red`. No #8c8c8c text is left. `.label` and `.tile-label` are sentence case now (no uppercase eyebrows anywhere in the app UI).
- `.field` sits in `@layer components`, so utilities on a field (`pl-8`, `w-auto`, `h-10`) now apply. `.btn` is still unlayered and overrides position, display, height and padding utilities: wrap a `.btn` to position it (see the sidebar menu button).
- Browser surfaces themed: selection, caret, focus-visible ring, scrollbars (light, and dark inside the sidebar).
- Sidebar: `navActive` in `src/lib/shell.ts` (exact path or path plus `/`), workspace name readable, fills the full height and scrolls inside on short screens; the phone menu button no longer sits in the page flow.
- Shell: tab rows scroll sideways on phones (`.tabs-row`) and the count never overlaps its label; Needs you rows use a dot, not a coloured rail; Start something is a compact action list (also on Content Studio); `Activity` rows take `count` and `detail`.
- Dashboard: greeting uses the member's name from their sign-in profile (`user_metadata.full_name`), then a readable email name (`greeting`, `firstName` in `lib/dashboard.ts`, same on Content Studio); repeats in Recent activity collapse into one row with a count (`collapseActivity`); LinkedIn reach is four compact rows with None and one honest line.
- Pipeline board scrolls inside its own area with arrows; Profile Studio score is a line chart, one point per day, 0 to 100 axis; Engagement is two stacked columns; Settings uses the section width with inputs on one line; Templates group as Connection notes, Messages, Replies and posts, Resource replies, Call offers (new `resource` and `call` types); Add sits in the header on Templates, Strategy and Notes (`AddButton` with `RecordList adding/onAdding`); AI citations first run has the shell entry moment, a Guide tour and a two-column setup.
- Text repair: `src/lib/text.ts` (`repairMojibake`, `decodeText`, `decodePage`, `repairFields`), tested by `node scripts/test-text.ts`. The Network export, Comment Studio text files, fetched pages and record and prospect saves all go through it. `db/014_text_repair.sql` repairs saved rows (re-runnable, not yet run).
- Checked in a browser at 1440 and 390 against sample data through a temporary local harness (removed); not checked signed in against Supabase.

## Known gaps

- Sign-in email uses Supabase's built-in sender, which is rate-limited. Fix: custom SMTP (Resend) set up by Alok.
- The extension is installed unpacked and does not auto-update. Option: unlisted Chrome Web Store listing (developer account, one-time 5 USD, set up by Alok).
- Comment voice and topics are per workspace; a second profile needs its own voice written in Settings.

## Reference data

- `seed/shashi/workspace_import.sql`: the SQL that loaded Shashi's workspace (prospects, posts, templates, notes). Already applied; keep for rebuilds.
- `seed/shashi/prospects.json`: the 50 researched prospects behind that import.
- `docs/reference/shashi-30-day-roadmap.html`: the one-month strategy to execution plan the product grew from.

## Discovery Studio, agreed additions (6 Nov 2026, Q78 to Q83)

- Q78: each finding is tagged with the Antier service it points to (stablecoin infrastructure, tokenisation, payments, custody and so on); filter by service, and the weekly digest shows which services draw the most news.
- Q79: people named in a finding are checked against Network; "Warm: you know N people here" plus a comment-first suggestion.
- Q80: Speaking and pitch opportunities as their own band (calls for speakers, panels, awards, consultations open for comment) with deadlines.
- Q81: journalist and analyst source requests on Antier topics, routed to a quick-reply draft. The user sends it.
- Q82: public tenders and requests for proposals from GCC and Indian banks and regulators, in a separate Sales band; never turned into posts.
- Q83: competitor moves suggest a "how we see it" post angle in Content Studio, linked to a matching campaign if there is one.

## Discovery Digest and the angle step, agreed (6 Nov 2026, Q84 to Q94)

- Q84: Findings are single articles; Digest is topics, built by merging every article about the same story.
- Q85: topic priority 0 to 100 = Fit 45 (the seven-dimension score), Coverage 20 (separate sources and publishers, growth over 3 days), Source quality 10 (regulator or primary > major media > blogs), Found both ways 5 (AI search and Crawl), Gap 10 (AI citations gap), Warm 5 (Network), Timing 5 (deadline); minus points for posted recently or crowded. Weights editable in Criteria.
- Q86: crowded topics stay, marked "Crowded: needs a different angle", with a contrarian or GCC-specific take suggested.
- Q87: Crawl runs on the server every Monday; AI search starts by itself when Prax is opened that day, with the keys in the browser; both visible live; the Digest builds when both finish.
- Q88: top 10 topics a week plus a Rising strip; the rest stay in Findings.
- Q89: unsure merges show "Possible merge" with Merge and Keep separate.
- Q90: Digest layout: top 3 as large feature cards, #4 to #10 as a ranked list.
- Q91: tick topics and Send to Content Studio; angle and post type are decided in Content Studio; Discovery's suggested angle is preselected.
- Q92: Write a post gets an Angle step after the idea and before the opening line, for every starting point: 4 suggested angles (contrarian, GCC and India lens, operator view, numbers and prediction) plus your own; it steers hooks and drafts, is saved on the post and shown in approval.
- Q93: Library Source filter (Discovery Studio, AI citations, Campaign, Written here) and a "From Discovery · #rank · score" tag linking back to the topic.
- Q94: Plan gets a To plan tray of undated Discovery and AI citations topics, dragged onto a day.

## Dashboard and Today follow-ups, agreed (6 Nov 2026, Q95 to Q98; branch `dashboard-today`, do after Discovery Studio)

- Q95: Today stays one agenda page, but it must feel interactive, catchy and premium: richer motion and interaction on the ring, groups and rows (hover detail, smooth done and skip transitions, focus states), still restrained and in palette.
- Q96: a skip counts as cleared on Today and not as done on the Dashboard (keep as built).
- Q97: once Discovery Studio exists, add it to "This week at a glance" (Digest ready, topics sent) and add new Discovery topics to Needs you now.
- Q98: AI citations becomes a fifth headline tile: "Shashi named in X% of AI answers", with the week-on-week change.

## Pipeline redesign, agreed (Wave 2; Q36 to Q38, refined)

- Q36: no drag and drop. A list on the left; clicking a lead opens a side panel, and the full lead page opens from it. Lead: profile, warm path, activity timeline, notes. Status: a stage bar showing days in each stage; each move asks for the next action and its date; keyboard shortcuts move stages. The board stays only as a read-only overview.
- Q37: several pipelines per profile, each with its own stages. Templates: Outreach (today's 9 stages), Bank partners, Investors, Events and speakers, and Blank. Each lead sits in one pipeline.
- Q38, all ten: (1) activity timeline logged automatically (comments, replies, notes, requests, stage moves); (2) lead heat score from real signals (your comments, their replies, warm path level, recency); (3) next action and due date required on every stage move, feeding Today, overdue in red; (4) touch plan per stage as a task queue: each step appears on Today with the message drafted, the user sends it and ticks it, never automated; (5) draft the DM for this stage with AI, copy it and send it yourself; (6) accounts: leads grouped by company, several contacts per bank (built once here, also serves the step 4 account map); (7) deal value and probability for a simple forecast; (8) saved views and filters (segment, heat, overdue, owner), starting with one main working list; (9) lost reasons on Parked or Lost; (10) import from CSV or from Network.

## Pipeline simplified (6 Nov 2026, Q101 to Q106; supersedes the Q36 to Q38 layout where they differ)

- Q101: one screen, not five tabs. "Do next" on top (the 5 most urgent: overdue first, then today; one line and one button each; red only for overdue), then everyone grouped by stage in collapsible sections. Accounts becomes a "Group by company" toggle; Pipelines and lost reasons move into a menu on the pipeline switcher.
- Q102: drop deal value, probability and the weighted forecast (Q38 item 7) for now.
- Q103: heat shown as a hot, warm or cold dot with the word; the signal breakdown only inside the lead panel.
- Q104: drop the read-only Board view.
- Q105: the lead panel shows the next action and its buttons (Done, Move to the next stage) first, then the stage bar, then timeline, warm path, touch plan and notes collapsed.
- Q106: one search plus two quick filters (Overdue, Hot); segment and owner under "More filters"; no saved views until asked. Keyboard keys still work but are not shown on screen.

## Discovery Studio (6 Nov 2026, branch `discovery-studio`)

- Page `/w/[slug]/discovery`, in the sidebar after Profile Studio. Built on the shell: entry moment, tabs Home, AI search, Crawl, Findings, Digest, Sources, Criteria, and a 14-step tour. Logic in `src/lib/discovery.ts` (pure, checked by `node scripts/test-discovery.ts`); UI in `src/components/discovery/`; runs in `src/components/discovery/runner.ts`.
- Method from the Antier discovery agent in the claude.md repo: passes by pillar, by entity (target accounts, VIPs, AI citations competitors and the Research Resources List of 12 Aug 2026, a weekly rotated batch), by event word, plus AI citations gap ideas and your own searches. Coverage is reported per pass, blocked is never shown as empty.
- AI search runs in the browser through the extension's existing `search` job (no extension change for it), on every engine with a key, web search on. Only items whose URL the AI actually cites are kept; each is read on the server by `/api/discovery/read` to confirm the date written on the page. Unconfirmed dates are capped at Watch. The live log (search, group, tool, results, cited, confirmed) is stored on `discovery_runs.log`.
- Crawl: upload .xlsx or CSV (parsed in the browser with fflate; hidden hyperlinks behind cell text and HYPERLINK formulas are kept; header aliases such as "Company / Entity Name", "Price/Month", "Strategic Focus"; LinkedIn links are left out). The Research Resources List is one click in the upload dialog. `/api/discovery/crawl` reads one link per call (browser loops, so statuses land live); `/api/cron/discovery` crawls every workspace every Monday 03:00 UTC (`vercel.json`), with `Authorization: Bearer CRON_SECRET` and the service role key. Both share `src/lib/crawl.ts` and `src/lib/safe-fetch.ts` (http and https only, never LinkedIn, private and local addresses refused after DNS and on each redirect, 8 s, 2 MB). List pages give their 5 newest articles; statuses Read, List page, Gated, Blocked, Could not read.
- Findings are single articles with seven scores (Buyer 25, Pillar 20, Geo 15, Service 15, Freshness 10, Evidence 10, Shashi angle 5). New findings get a rules score from the page's words at once (so the server crawl sorts itself); the AI check then rescores them in batches of 8 with the main AI key (`scored_by`). Bands: post 70+ (fresh within 7 days, evidence 3+), comment 55+ for LinkedIn items or 40+ for a target author, watch 35+, dropped under 35. Found by, Antier service (Q78), the warm line from Network through `discovery_warm()` (Q79), competitor and target detection, opportunities (pitch, press, sales with deadlines, Q80 to Q82).
- Digest: this week's findings (not dismissed, not dropped, not tenders or press requests) merged into topics by shared title words, organisations and event within 5 days; pairs between 0.30 and 0.45 show Possible merge with Merge and Keep separate (stored on `discovery_topics`). Priority per Q85 with weights and penalties editable in Criteria (must total 100). Crowded means 3+ LinkedIn voices or 15+ publishers. Top 3 cards, #4 to #10 list, Rising from the rest (small and mostly new in 3 days). Competitor topics show How we see it with a matching campaign. Pitch adds a Today item, press opens a reply draft that is only copied, sales is copy only.
- Sending: a topic or a finding becomes a posts Idea with `source_kind = 'discovery'`, `angle`, and `discovery` jsonb (topic id, rank, score, sources, service, angle, campaign); Undo deletes it. Fast response also adds a Today item. Today item bands: 5000 weekly run reminder, 5100s fast response, 5200s pitches, 5300s comment targets.
- Q87 as built: on the AI search day (Criteria, Monday by default) the AI search starts by itself once when Discovery Studio is opened by an editor with a key in that browser, with a toast to stop it. The Digest updates live as findings land.
- LinkedIn: extension 0.8.0 adds Send to Discovery on the Prax bar. It sends only the post on screen when pressed (`/api/ext/discovery` → `ext_discovery_add`). Nothing is read in the background.
- Content Studio: Write has eight steps with Angle after Idea (four suggested angles built from the topic plus your own; Sharpen with AI rewrites them; Discovery's angle preselected; Discovery and AI citations topics open straight at Angle). The angle goes into hook, draft and script prompts, is saved on `posts.angle` and shows in the post view. Library has a Source filter and the From Discovery tag with its sources panel; Plan has the To plan tray (drag onto a day, or Pick a date); Home Needs you lists new Discovery topics. Tour text updated.
- App-wide fixes found in the browser check: `.btn` and `.field` now sit in `@layer components`, so size utilities on them (h-10, w-auto, p-0) apply as written; the entry moment no longer sticks under React strict mode; tab rows scroll sideways on phones instead of wrapping.
- `db/013_discovery.sql` (after 012, re-runnable). Not verified against Supabase or live AI keys yet; checked with sample props in the browser at desktop and phone widths.

## Pipeline redesign, built (6 Nov 2026, branch `pipeline-redesign`)

- One screen, no tabs (Q101 to Q106). Header: title, one status line, a pipeline switcher (switch, New pipeline from a template, Stages and lost reasons in a side panel), Guide, Import (from Network or a CSV read in the browser) and Add lead. Then Do next (at most 5: overdue oldest first, then today; red only for overdue) and Everyone grouped by stage, collapsible, with counts and average days in stage; empty, won and lost stages start collapsed. One search, Overdue and Hot, More filters (segment, owner), Group by company. `[` and `]` move the focused row; nothing on screen mentions them.
- Lead panel: next action with Done (keeps the stage, asks for the next action) and Move to the next stage; every move needs a next action and a due date, the lost stage (Parked, Passed or Declined) also a lost reason (`moveGate`). Toast with Undo bottom right. Then the stage bar (days per stage on hover) and sections: Timeline (stage moves and Done from `stage_moves`, comments and replies from `comment_log`, requests and finished Today items, notes from `threads`), Warm path (Network export), Touch plan (each step goes to Today as a custom item, `note = pipeline:<lead>:<stage>:<i>`, idx 2000s for comment steps and 4000s for the rest), Heat (signal breakdown), Notes, Message for this stage (AI draft through the extension bridge, plain template if the extension does not answer; copy only), Details (edit, owner, delete). Full view widens it with every section open.
- Heat (`heatOf`, 0 to 100): your comments 8 each up to 32, their replies 12 each up to 36, warm path 20 for a connection or talked before and 12 for knowing someone there, last touch (comment or export message) 12 within 3 days and 6 within 10. Hot from 70, warm from 40.
- No deal values, forecast, Board or saved views. The old `prospect-drawer.tsx` is gone; the screen is `src/components/pipeline/` (screen, lead panel, panels, types), the page in `src/app/w/[slug]/pipeline/page.tsx` only wires Supabase, and the logic is `src/lib/pipeline.ts` (tested by `node scripts/test-pipeline.ts`). `Section` gained a `before` slot for the switcher.
- `db/015_pipelines.sql` (run after 014, re-runnable, deletes nothing): tables `pipelines` (stages as text[], won and lost stage), `lost_reasons` (five starting reasons per profile), `stage_moves` (moves written by the prospect trigger, Done written by the app, history backfilled from the activity feed); `prospects.pipeline_id`, `lost_reason`, `owner`. Every profile gets an Outreach pipeline with the nine stages and every existing prospect goes into it; a stage outside the nine is written into the notes and mapped to Target (`map_outreach_stage`, same as `mapStage`). Triggers are paused during the move so days in stage and the activity feed are untouched. New prospects without a pipeline (extension, Network) land in the first pipeline. `rename_pipeline_stage` renames a stage everywhere without logging a move.
- Before 015 is run the screen still works: one Outreach pipeline, lost reasons kept in the notes, history from the activity feed; more pipelines and stage edits wait for the SQL.
- Today and the Dashboard are unchanged and still read `prospects.next_action`, `next_date` and `stage`. They exclude Won and Parked by name, so a due check-in on a closed stage of another pipeline (Signed, Committed, Delivered, Done, Passed, Declined) does show on Today.
- Found while checking: `.btn` and `.field` in `globals.css` are not in a Tailwind layer, so utilities such as `h-10` or `px-4` on them lose everywhere in the app (every such button is 32 px). The Pipeline components use `!` on those utilities; the app-wide fix is to move the component classes into `@layer components`.
- Checked in Chrome at 1440 and 390 wide through a temporary local preview with sample data (deleted): tour, Do next, groups, a move to Parked with a reason, Done with Undo, Group by company, More filters, the pipeline menu, the Pipelines panel and stage editor, Import from Network, Add lead, and the lead panel in side and full view. Not checked signed in against Supabase, and 015 has not been run.

## Agreed 6 Nov 2026 (Q107 to Q112)

- Q107: AI citations gets Archive, Switch, New and Delete for a tracked profile set, all four required, placed in a three-dot menu in the header. Archive keeps everything; Switch moves between sets; New starts setup from scratch for another person and LinkedIn profile; Delete is permanent, owner-only, with typed confirmation.
- Q108 (most important): Strategy becomes an open canvas like n8n: nodes connected by dotted wires, each node showing only its final name (Goal for the month, Who we target, ...), with view (eye), edit and delete; users build custom nodes and flows, including if/else conditions.
- Q109: the strategy drives the rest of Prax: each node maps to real settings (Today quotas, post mix and pillars, target segments for Pipeline and Discovery, Comment Studio rules); each node shows what it affects; editing it changes those values. Built in two steps: canvas plus links to existing settings, then the if/else rules engine.
- Q110: fix every extension feature and error: the bar missing on some posts, needing two or three clicks, not reading every post, and the Live tab options (Capture and the rest) not working. No automation; the user clicks.
- Q111: notes show their author and time.
- Q112: a deep audit subagent after the fixes, from every angle: design, UI and UX, views, bugs, placement, the LinkedIn workflow end to end; reports bugs, gaps and what to add or remove.

## Uniform tiles (6 Nov 2026, branch `uniform-tiles`)

- Every tile in a row looks the same at rest: white, hairline border. The solid black lead tile and the red-outlined tile are gone everywhere (Dashboard, Network, Notes, Templates, Strategy, Comment Studio, Profile Studio, Discovery home and crawl stats, Content Studio home, AI citations Home). `.tile.dark`, `.tile.red`, `.kpiDark` and `.kpiRed` no longer exist.
- Interaction only: clickable tiles (`.tile.hit`) lift 1px with a darker border on hover and settle with a grey wash on press; focus-visible draws the red ring; static number tiles have no hover. Under reduced motion there is no lift.
- Selected: `KpiTiles` item `selected: true` gives `aria-current="page"` on a link tile or `aria-pressed="true"` on a button tile (pass `false` on the other filter tiles so they announce as toggles). It shows an ink border and a grey wash. No section uses it yet; use it when tiles filter in place.
- Overdue: `tone: "alert"` adds a small red dot before the label and a dark red number (plus "(overdue)" for screen readers). Only for something genuinely past its date; no tile uses it today.
- Checked in a browser against sample data through a temporary preview route (deleted) at 1440 and 390: rest, hover, keyboard focus and pressed. Not checked signed in against Supabase.


## AI citations tracked profiles, built (Q107, 6 Nov 2026, branch `citations-sets`)

- Header: under the title a "Tracking <name>" chip shows the profile in view and opens the same menu as the three dots. The menu lists the live profiles (tick on the one in view, click to switch), New tracked profile, Show archived (each with Restore, and Delete for owners), then Facts sheet, Weekly report and Share, then Archive this profile and, for owners only, Delete this profile.
- New opens the first-run setup with empty fields and a Cancel back to the profile in view; the profile is created on Start tracking and named "Person, Company" (`profileName`). Nothing is created if you cancel.
- Archive hides a profile and keeps every row; the view moves to the next live one. Restore brings it back into view. Switch, Archive and Restore toasts have Undo. When every profile is archived the setup shows with a note to restore one.
- Delete is owner-only in the menu and in the database (`citation_profile_delete(pid, confirm_name)` checks `has_role(owner)` and the typed name, case and end spaces ignored). It removes that profile's people and companies, prompts, runs and sources, facts sheet, recommendations, prompt groups and share links. Ideas already sent to Content Studio stay; their `citation_profile_id` goes to null, so they then show under every profile.
- Each user has their own choice (`citation_profile_picks`); a missing or archived pick falls back to the first live profile. `useCitationProfile()` in `src/lib/citation-profile.tsx` reads it; the citations page shares it through `CitationProfileProvider` and `useCitationScope()`.
- Scoped to the profile in view: every query and insert on the citations page (entities, prompts, prompt groups, runs, facts, recommendations, share links; manual history through its prompts), the Report tab and PDF ("Prepared for" is the profile name), new share snapshots (report title is the profile name), the Dashboard AI citations tile, the campaign report's citation lift, and Content Studio gap topics (Write's Topic gaps and Home's Needs you) through `posts.citation_profile_id`. Left workspace-wide on purpose: Today's weekly-run reminder and Discovery's competitor list.
- `db/017_citation_profiles.sql` (after 015 and 016, re-runnable, deletes nothing): tables `citation_profiles` (name, archived_at, sort; RLS read viewer, write editor, delete owner) and `citation_profile_picks` (own row only); `profile_id` with `on delete cascade` on `citation_entities`, `citation_questions`, `citation_runs`, `citation_facts`, `citation_recs`, `citation_sets`, `citation_shares`; the facts sheet key moves from workspace to profile; existing rows go to one default profile per workspace named from its self entities (else the workspace name), runs follow their prompt; a trigger fills a missing `profile_id` (older pages, the extension) and refuses a profile from another workspace; `posts.citation_profile_id` is backfilled from the prompt, else the default profile for `topic = 'AI citations'` ideas.
- Before 017 is run the page works as before: one profile, no chip, the old three-dot menu, nothing scoped (`useLive` now reports `error`, which marks this mode). `useLive` also gained `key` (reload when a filter value changes) and `skip`, and drops stale responses.
- Tests in `node scripts/test-citations.ts`: profile fallback, scope, insert tags, the gap-topic filter, names, the delete confirm, the migration mapping (`migrateRows`) and checks against `db/017` (every table scoped, runs follow prompts, only null rows filled, the only delete is the owner function, has_role, re-runnable).
- Checked in Chrome at 1440 and 390 wide through a temporary harness with sample profiles (deleted): menu, Switch with Undo, New setup, Show archived and Restore, Archive, the typed-name Delete confirm, and Delete hidden for non-owners. Not checked signed in against Supabase, and 017 has not been run.

## Extension 0.9.0: reliability fixes (Q110)

Branch `extension-fixes`. Not deployed; reinstall 0.9.0 from the Extension page after the deploy. No SQL.

Root causes found and fixed:

- **Posts with no bar.** Rows were found only from a Repost button, so posts with Repost turned off got no bar. Rows are now found from the Comment button next to a Like or React button (`extension/dom.js`, shared by the bar, the side panel and the tests), skipping comment threads, the comment box and its submit button, dialogs and Prax's own UI. The post owning a row is a known container only when it holds that row alone, otherwise the largest ancestor that does not reach a second row. The newer layout's `data-view-name` hints, permalinks and "Reaction button state" labels are covered.
- **Bars that never came back.** A `data-prx` flag on LinkedIn's row stayed after LinkedIn re-rendered and dropped the bar, so it was never re-added. Bars are now tracked in a map from row to bar and checked against the page on every scan; a bar is rebuilt when it is gone, its row is replaced, or the row now shows another post (key from the urn, or a hash of author and text) or different styles.
- **Late posts missed.** The MutationObserver used a 400 ms debounce, and LinkedIn's feed rarely goes quiet for 400 ms, so scans could wait indefinitely. It is now a 250 ms throttle that ignores Prax's own changes and watches the whole document.
- **Bars or panel only after a few clicks.** Chrome does not add content scripts to tabs that were open before an install, update or reload, and the copy left in such a tab is cut off from the extension, so its buttons failed silently. The background now checks every LinkedIn tab on install, update and browser start, and again on `tabs.onUpdated` (load and LinkedIn's in-app navigation), and adds the script if it does not answer. A cut-off copy steps aside when a new one arrives and otherwise says "Prax was updated. Reload this LinkedIn tab". Messages to an asleep or restarting service worker are retried twice, and long AI jobs keep the worker awake.
- **Side panel (Capture and the rest).** It read the page once at open and never refreshed; Read analytics took the first `article` (a banner) before `main` and its number match broke on a percent line; Read this post used old class names; errors were short toasts. The panel now follows tab and setting changes, readers share `dom.js`, analytics parsing is `PraxDOM.parseAnalytics`, and errors stay up longer in red.
- **Silent failures on the Prax site.** `useExtension().send` resolved even when the bridge failed; Remove key, Quiet mode and Remove search key had no error handler; the bridge did not answer at all when its extension was cut off. All now show the reason.
- Also fixed: the outer actor title (with LinkedIn's hidden screen-reader copy) won over the visible name, and the post itself was read as one of its comments.

New: **Prax bar status** card at the top of the side panel: extension version, Prax connection, AI key, posts seen and bars attached on this tab, last scan, last error, and **Fix bars on this tab** (adds the bar script again; reads and clicks nothing on LinkedIn).

No new automation. The background only adds Prax's own script to LinkedIn tabs; reading still happens only on a button press.

Tested: `node scripts/test-extension.ts` (fixtures written by hand to match LinkedIn's old and new layouts, not saved pages), and `scripts/e2e-extension.mjs` in Playwright's Chromium with the unpacked extension and the fixtures served at linkedin.com (27 checks: all bars, late posts during constant change, re-renders, SPA navigation, Write with Prax on the first click, Send to Discovery and its error, Quiet mode, the side panel's status, Read this post, Capture, analytics, the bar coming back after its script stops, the bridge handshake). The same run against 0.8.0 misses the post with Repost off and the late post. Not tested: real LinkedIn pages, a real Chrome update of an installed extension (Playwright unloads the extension on reload), and the Prax API against Supabase.

## Login, agreed (6 Nov 2026, Q113 to Q116)

- A minimalist sign-in page in the Prax palette with the Corners logo: one centred card, Email and Password (both marked required), Sign in, Forgot password?, show/hide on the password, clear errors, phone-ready.
- Q113: invite only; no public sign-up. Owners invite from Settings; the invitee sets a password from the invite email.
- Q114: existing users set their first password through Forgot password.
- Q115: keep a small "Email me a sign-in link instead".
- Q116: at least 8 characters; Supabase rate limits; sessions last 30 days on the user's device.

## AI citations redesign (6 Nov 2026, branch `citations-redesign`)

Brief from the owner: the section looked immature and AI-generated. This is a design pass on every tab plus the missing management controls. No SQL, no schema change.

- One card language (`Card`, `Empty`, `Status` in `citations/ui.tsx`): white surface, hairline border, a quiet title row with one link or small button, no eyebrow labels, no black hero cards, no red or black outlined cards. Tables have a light header and tabular numbers. Status is a dot and a word (red dot means named, red ring means named but not linked). The module CSS sits in `@layer components`, so Tailwind utilities on its elements now apply.
- Header: title, one short line, the tracked profile chip; actions Guide, Ask, Draft test, the three-dot menu, then one primary (Connect AI keys until a key is saved, then Run prompts) and `AccountMenu` last. On phones Guide, Ask and Draft test move into the three-dot menu. AI keys also sit in that menu and as "Manage keys" on Home.
- No dashes as values: "None", "Not run" or an empty state. Charts draw only with two or more weeks of data; otherwise one line says when they appear.
- First run: the black "Nothing has run yet" banner is gone. Home shows a four-step checklist (tracking, prompts, a key, run) with the next step's button, plus prompts by audience and who you are compared with. Every other tab has its own empty state.
- Home with data: the shell `KpiTiles` (uniform tiles), then two columns: trend, AI tools (state only, no per-row Connect), recent answers, changes; rank, open gaps, next moves, where answers come from, the LinkedIn profile check.
- Prompts: the inline add form became an "Add prompt" side panel with Undo; Active and Archived, and the prompt groups, are segmented controls; the keywords panel sits beside the table on wide screens.
- Competitors: leaderboard full width, then Tracked (person and company), Peer firms and Peer experts. Company: four tiles, direction chart, company gaps, pages and facts check, and the company with its peer firms.
- Management (`TrackedNames`, `EntityPanel` in `ui.tsx`), on Competitors and Company: Edit opens a side panel. Person: full name (first and last required), other full names, LinkedIn profile, other owned sites. Company or firm: name, other names, owned domains. Add peer firm and Add peer expert open the same panel (up to 8 each). Remove asks to confirm, deletes the row, and the toast's Undo puts the same row back with its id. Edit and Add toasts have Undo too. Suggested peers have Approve and Dismiss. Detection runs at display time, so edits re-score past runs.
- Copy is short and built from the tracked profile's names (`who()` in `ui.tsx`), including the tour (`makeTour`), the weekly report and PDF, the facts sheet tabs and the evidence drawer. `recommend()` and `alerts()` in `src/lib/citations.ts` no longer name anyone. Still hard-coded, left for the app-wide wording change: `gapTopic()` ("Answer it as Shashi", covered by a test) and the instruction texts sent to the AI model.
- Checked in Chrome (Playwright on the installed Chrome for screenshots, claude-in-chrome for the flows) through a temporary preview route with an in-memory sample database (deleted): every tab, empty and with sample data, at 1440 and 390, no horizontal page overflow; edit with Undo, remove with confirm and Undo, add a peer expert, the evidence drawer and the run panel. Not checked signed in against Supabase.
