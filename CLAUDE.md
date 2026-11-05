# Prax: working notes for Claude

Prax is a multi-profile LinkedIn outreach and authority product. The first profile is Shashi Pal (Co-Founder and COO, Antier). Alok runs it day to day. Read `docs/HANDOFF.md` for current status before starting work.

## Stack and where things run

- Next.js 15.5 (App Router, `src/`), TypeScript, Tailwind 4 tokens in `src/app/globals.css`, Geist fonts, lucide-react icons.
- Supabase project "prax" (ref `kywvseeyradaxpxkhtcb`, Mumbai): magic-link auth, Postgres with RLS, Realtime.
- Vercel project `prax` (team antier-branding-and-marketing), production https://prax-gamma.vercel.app. Env vars come from the Supabase Vercel integration; pull with `npx vercel env pull .env.local --environment=production`. Never print their values.
- Chrome extension (MV3) in `extension/`. `npm run ext:zip` packs it into `public/prax-extension.zip`, which the Extension page serves for download.

## Commands

- `npm run dev` / `npm run build`. Lint and types: `npx tsc --noEmit && npx eslint src`.
- Logic tests: `node scripts/test-studio.ts` (Comment Studio defaults, rules, Human score), `node scripts/test-citations.ts` (AI citations parsing incl. Perplexity, detection, strict person matching, audiences, keywords, weekly trend, gaps, the PDF writer, maths, repeats, tone and facts, alerts, lift, share links) and `node scripts/test-network.ts` (fake export with LinkedIn's real file layout; pass a path to also write the zip).
- Shell tests: `node scripts/test-shell.ts` (entry moment and tour gating, tour step maths).
- Dashboard tests: `node scripts/test-dashboard.ts` (progress, skips, deltas, week over week, agenda groups, row action, Needs you ranking, settle order, copy).
- Campaign logic tests: `node scripts/test-campaigns.ts` (plan per objective, date slots, re-plan, time budget, warnings, halfway check, report).
- Content Studio logic tests: `node scripts/test-content-studio.ts` (fold, formatter round trips, lists, Markdown, claims check, URL safety, AI reply parsing, point of view, newsletter dates, What works, carousel PDF).
- Deploy: `npx vercel deploy --prod --yes`. Production deploys need Alok's explicit go-ahead each time. After every deploy, commit and push to GitHub.
- After any change in `extension/`: bump `version` in `extension/manifest.json` and `LATEST_EXT` in `src/lib/bridge.ts`, then `npm run ext:zip` before deploying.

## Database changes

Local Postgres access does not work (direct host is IPv6-only, pooler rejects the password), so `scripts/migrate.mjs` is kept but unused. Apply SQL in the Supabase SQL editor in the browser. Files run in order: `db/schema.sql`, then `db/002_*.sql` to `db/012_*.sql` (011 splits AI citations into Shashi as a person and Antier as a company, adds prompt audience and keywords, and adds `posts.channel`; 012 adds the Content Studio fields and also guards `posts.channel`). New changes go in a new numbered file, written to be re-runnable (`if not exists`, `create or replace`).

The extension never touches tables directly. It calls `/api/ext/[action]` with a per-browser token; the API calls `security definer` functions (`ext_*`) that check the token hash.

## Rules that are not negotiable

1. **No LinkedIn automation of any kind.** A colleague's account (Vikram) was restricted. The extension only reads the page the user is on, and only drafts suggestions. It never clicks, posts, comments, likes, connects, sends, scrolls or crawls. "Use" fills a box the user has already opened, otherwise it copies to the clipboard. Logging to Prax happens when the user presses LinkedIn's own Post or Send.
2. **AI keys stay in the browser.** The user brings their own key (Claude, OpenAI, Grok, Gemini). The Prax Extension page hands it to the extension through `extension/bridge.js`; it is never sent to or stored on the Prax server.
3. **Never enter passwords, API keys or tokens yourself**, and never ask for them in chat. Alok approves logins himself.
4. **Design:** dark #141414, red #d64545, dark red #9e1c1c, white, and neutral greys for secondary text and borders. Light mode only (tokens in `globals.css`). The sidebar `.side-red` is dark; the active item is red with white text. Every section is built on the shell in `src/components/shell/` (see `docs/HANDOFF.md`): an entry moment once per section per session, a plain header with actions top right, underline tabs with counts, a Home tab of KPI tiles, Needs you, Start something and recent activity, and a guided tour from the Guide button. Mature and calm, never AI-generic: press states, focus rings, toasts with Undo bottom right, skeletons, no emoji, no gradients. No dashes or contractions in copy Shashi sees.
5. **Comment voice** for Shashi lives in `workspaces.voice` (editable in Settings). Source of truth for the rules: `SHASHI_SEEDING_COMMENT_SYSTEM` in the Antier-and-Shashi-Marketing repo. 50 to 70 words, "I think" or "In my view", value layer not summary, no overlap with other comments, never against a regulator or government, no em dashes, no contractions.

## Working with Alok

He types fast with typos; never correct his spelling. Before anything new, ask the open decisions in numbered rounds with a recommended answer for each, and build once he confirms. Do exactly what was asked. Commit and push only when asked.
