# Prax: working notes for Claude

Prax is a multi-profile LinkedIn outreach and authority product. The first profile is Shashi Pal (Co-Founder and COO, Antier). Alok runs it day to day. Read `docs/HANDOFF.md` for current status before starting work.

## Stack and where things run

- Next.js 15.5 (App Router, `src/`), TypeScript, Tailwind 4 tokens in `src/app/globals.css`, Geist fonts, lucide-react icons.
- Supabase project "prax" (ref `kywvseeyradaxpxkhtcb`, Mumbai): magic-link auth, Postgres with RLS, Realtime.
- Vercel project `prax` (team antier-branding-and-marketing), production https://prax-gamma.vercel.app. Env vars come from the Supabase Vercel integration; pull with `npx vercel env pull .env.local --environment=production`. Never print their values.
- Chrome extension (MV3) in `extension/`. `npm run ext:zip` packs it into `public/prax-extension.zip`, which the Extension page serves for download.

## Commands

- `npm run dev` / `npm run build`. Lint and types: `npx tsc --noEmit && npx eslint src`.
- Logic tests: `node scripts/test-studio.ts` (Comment Studio defaults, rules, Human score), `node scripts/test-citations.ts` (AI citations parsing, detection, maths) and `node scripts/test-network.ts` (fake export with LinkedIn's real file layout; pass a path to also write the zip).
- Deploy: `npx vercel deploy --prod --yes`. Production deploys need Alok's explicit go-ahead each time. After every deploy, commit and push to GitHub.
- After any change in `extension/`: bump `version` in `extension/manifest.json` and `LATEST_EXT` in `src/lib/bridge.ts`, then `npm run ext:zip` before deploying.

## Database changes

Local Postgres access does not work (direct host is IPv6-only, pooler rejects the password), so `scripts/migrate.mjs` is kept but unused. Apply SQL in the Supabase SQL editor in the browser. Files run in order: `db/schema.sql`, then `db/002_*.sql` to `db/008_*.sql`. New changes go in a new numbered file, written to be re-runnable (`if not exists`, `create or replace`).

The extension never touches tables directly. It calls `/api/ext/[action]` with a per-browser token; the API calls `security definer` functions (`ext_*`) that check the token hash.

## Rules that are not negotiable

1. **No LinkedIn automation of any kind.** A colleague's account (Vikram) was restricted. The extension only reads the page the user is on, and only drafts suggestions. It never clicks, posts, comments, likes, connects, sends, scrolls or crawls. "Use" fills a box the user has already opened, otherwise it copies to the clipboard. Logging to Prax happens when the user presses LinkedIn's own Post or Send.
2. **AI keys stay in the browser.** The user brings their own key (Claude, OpenAI, Grok, Gemini). The Prax Extension page hands it to the extension through `extension/bridge.js`; it is never sent to or stored on the Prax server.
3. **Never enter passwords, API keys or tokens yourself**, and never ask for them in chat. Alok approves logins himself.
4. **Design:** white and light red only, light mode only (tokens in `globals.css`, sidebar `.side-red`). Mature and calm, never AI-generic: press states, toasts with Undo, skeletons, no emoji, no gradients for decoration.
5. **Comment voice** for Shashi lives in `workspaces.voice` (editable in Settings). Source of truth for the rules: `SHASHI_SEEDING_COMMENT_SYSTEM` in the Antier-and-Shashi-Marketing repo. 50 to 70 words, "I think" or "In my view", value layer not summary, no overlap with other comments, never against a regulator or government, no em dashes, no contractions.

## Working with Alok

He types fast with typos; never correct his spelling. Before anything new, ask the open decisions in numbered rounds with a recommended answer for each, and build once he confirms. Do exactly what was asked. Commit and push only when asked.
