# Prax: working notes for Claude

Prax is a multi-profile LinkedIn outreach and authority product. The first profile is Shashi Pal (Co-Founder and COO, Antier). Alok runs it day to day. Read `docs/HANDOFF.md` for current status before starting work.

## Stack and where things run

- Next.js 15.5 (App Router, `src/`), TypeScript, Tailwind 4 tokens in `src/app/globals.css`, Geist fonts, lucide-react icons.
- Supabase project "prax" (ref `kywvseeyradaxpxkhtcb`, Mumbai): email and password auth by invitation (magic link as a fallback), Postgres with RLS, Realtime.
- Vercel project `prax` (team antier-branding-and-marketing), production https://prax-gamma.vercel.app. Env vars come from the Supabase Vercel integration; pull with `npx vercel env pull .env.local --environment=production`. Never print their values.
- Chrome extension (MV3) in `extension/`. `npm run ext:zip` packs it into `public/prax-extension.zip`, which the Extension page serves for download.

## Commands

- `npm run dev` / `npm run build`. Lint and types: `npx tsc --noEmit && npx eslint src`.
- Logic tests: `node scripts/test-studio.ts` (Comment Studio defaults, rules, Human score), `node scripts/test-citations.ts` (AI citations parsing incl. Perplexity, detection, strict person matching, audiences, keywords, weekly trend, gaps, the PDF writer, maths, repeats, tone and facts, alerts, lift, share links) and `node scripts/test-network.ts` (fake export with LinkedIn's real file layout; pass a path to also write the zip).
- Sign-in tests: `node scripts/test-auth.ts` (email and required checks, new password rules, sign-in error copy, safe redirects, invite link tokens).
- Shell tests: `node scripts/test-shell.ts` (entry moment and tour gating, tour step maths, tour card placement, sidebar active matching).
- Text tests: `node scripts/test-text.ts` (Mac Roman mojibake repair, byte order marks, UTF-8, Windows-1252, page charsets, and the `db/018` code point table; `PGLITE=<path to node_modules/@electric-sql/pglite> node scripts/test-text.ts` also runs the 018 SQL in Postgres against the same cases).
- Dashboard tests: `node scripts/test-dashboard.ts` (progress, skips, deltas, week over week, agenda groups, row action, Needs you ranking, settle order, copy, the one weekly comment count, Today prefill, page names).
- Pipeline tests: `node scripts/test-pipeline.ts` (heat, Do next ranking, the move gate, template stages, days per stage, the migration mapping checked against `db/015_pipelines.sql`).
- Inbox and weekly report tests: `node scripts/test-inbox.ts` (conversation stages, the three sources, folding one person into one row, Done and Snooze keys, ranking, labels, the reply prompt) and `node scripts/test-weekly.ts` (the week window, out, engaged, moved, conversations, overdue, AI citations movement, topics, next week, the sentences, the profiles overview row).
- Campaign logic tests: `node scripts/test-campaigns.ts` (plan per objective, date slots, re-plan, time budget, warnings, halfway check, report).
- Content Studio logic tests: `node scripts/test-content-studio.ts` (fold, formatter round trips, lists, Markdown, claims check, URL safety, AI reply parsing, point of view, newsletter dates, What works, carousel PDF).
- Discovery Studio logic tests: `node scripts/test-discovery.ts` (seven-dimension scoring and bands, rules scorer, opportunities and deadlines, the crawl URL guard, CSV and Excel lists with hidden hyperlinks, page dates and list pages, AI search replies, topic merge, priority maths, weights total, Digest selection, the post a topic becomes, angles and Library sources).
- Strategy canvas tests: `node scripts/test-strategy.ts` (the if/else rules engine: conditions, Yes and No lanes, nested rules, unknown facts; comment tasks, advice, angle and raise rules; the layout of lanes, forks and rejoins, top to bottom and left to right; keyboard moves, zoom and fit, insert order; the write-through mapping to workspaces, studio_settings and content_settings and back; the sections that read it: Discovery buyers and priority lift, campaign plan defaults; templates and copy; `db/021` checks).
- Demo profile: `node scripts/demo-profile.ts` writes `db/019_demo_profile.sql` (the sample Layla Haddad profile); `node scripts/test-demo.ts` checks the seed is current and consistent across sections.
- Extension tests: `node scripts/test-extension.ts` (post detection in `extension/dom.js` against the LinkedIn-like fixtures in `scripts/fixtures/linkedin`, analytics reading). End to end in a real Chromium with the fixtures served at linkedin.com (no traffic to LinkedIn or Prax): `PLAYWRIGHT_CORE=<path to playwright-core> node scripts/e2e-extension.mjs`.
- Deploy: `npx vercel deploy --prod --yes`. Production deploys need Alok's explicit go-ahead each time. After every deploy, commit and push to GitHub.
- After any change in `extension/`: bump `version` in `extension/manifest.json` and `LATEST_EXT` in `src/lib/bridge.ts`, then `npm run ext:zip` before deploying.

## Database changes

Local Postgres access does not work (direct host is IPv6-only, pooler rejects the password), so `scripts/migrate.mjs` is kept but unused. Apply SQL in the Supabase SQL editor in the browser. Files run in order: `db/schema.sql`, then `db/002_*.sql` to `db/013_*.sql` (011 splits AI citations into Shashi as a person and Antier as a company, adds prompt audience and keywords, and adds `posts.channel`; 012 adds the Content Studio fields and also guards `posts.channel`; 013 adds Discovery Studio and `posts.angle` and `posts.discovery`). 021 adds the Strategy canvas (`strategies`, `strategy_nodes`, `strategy_activate()`, `workspaces.segment_weights`, `content_settings.plan`) and turns each profile's Strategy notes into a first strategy. 014 and 018 repair mojibake; run `db/018_text_repair_v2.sql` (its PART 1 and PART 2 alone are a read-only preview). New changes go in a new numbered file, written to be re-runnable (`if not exists`, `create or replace`).

The extension never touches tables directly. It calls `/api/ext/[action]` with a per-browser token; the API calls `security definer` functions (`ext_*`) that check the token hash.

## Rules that are not negotiable

1. **No LinkedIn automation of any kind.** A colleague's account (Vikram) was restricted. The extension only reads the page the user is on, and only drafts suggestions. It never clicks, posts, comments, likes, connects, sends, scrolls or crawls. "Use" fills a box the user has already opened, otherwise it copies to the clipboard. Logging to Prax happens when the user presses LinkedIn's own Post or Send.
2. **AI keys stay in the browser.** The user brings their own key (Claude, OpenAI, Grok, Gemini). The Prax Extension page hands it to the extension through `extension/bridge.js`; it is never sent to or stored on the Prax server.
3. **Never enter passwords, API keys or tokens yourself**, and never ask for them in chat. Alok approves logins himself.
4. **Design:** dark #141414, red #d64545, dark red #9e1c1c, white, and neutral greys for secondary text and borders. Light mode only (tokens in `globals.css`). The sidebar `.side-red` is dark; the active item is quiet (white text on #2a2a2a). One red primary action per screen; secondary actions are outlined, repeated row actions are quiet; dark red is for status only. Type scale 12, 14, 16, 22, 32 (`text-meta`, `text-body`, `text-title`, `text-page`, `text-kpi`) at weights 400, 500, 600; radii 8 for controls and 12 for panels, pills only for counts. Every section is built on the shell in `src/components/shell/` (see `docs/HANDOFF.md`): an entry moment once a day on the Dashboard only (a 150 ms content fade elsewhere), a plain header with actions top right, underline tabs with counts, a Home tab of KPI tiles, Needs you, Start something and recent activity, and a guided tour from the Guide button. Mature and calm, never AI-generic: press states, focus rings, toasts with Undo bottom right, skeletons, no emoji, no gradients. No dashes or contractions in copy Shashi sees.
5. **Comment voice** for Shashi lives in `workspaces.voice` (editable in Settings). Source of truth for the rules: `SHASHI_SEEDING_COMMENT_SYSTEM` in the Antier-and-Shashi-Marketing repo. 50 to 70 words, "I think" or "In my view", value layer not summary, no overlap with other comments, never against a regulator or government, no em dashes, no contractions.

## Working with Alok

He types fast with typos; never correct his spelling. Before anything new, ask the open decisions in numbered rounds with a recommended answer for each, and build once he confirms. Do exactly what was asked. Commit and push only when asked.
