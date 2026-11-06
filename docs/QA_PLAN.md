# Prax QA acceptance plan

Owner of this plan: the QA supervisor agent. Scope: Humanization (H1, Q128 to Q134), Connections (C1, Q135 to Q141), tester setup (TS1 to TS8, Q142 to Q149) and the copied invite link with the Join Prax page (TS9, Q150 to Q153 as changed by "Free tier only during the proof of concept"). Written against `main` at bb1fbaa. IDs follow `docs/BACKLOG.md` rows TS1 to TS9. The older Today rows T1 to T9 are not in scope.

**Free tier only.** Prax is a proof of concept. Everything must work on Vercel Hobby and Supabase Free, with no domain and no paid service. Paid tools in Connections stay optional and bring-your-own-key. Any stage that needs a paid plan, a custom domain, Resend, SMTP, a paid cron or a paid add-on to work is a P1 defect. To check it, read the diff for new dependencies, env vars, `vercel.json` crons (Hobby allows daily crons only) and Supabase features beyond Free.

The coordinator merges and deploys. QA does not push, deploy, run production SQL or edit `docs/BACKLOG.md`.

---

## 0. How every stage is checked

### 0.1 Gate (must be green before any browser work)

Run on a fresh fetch of `~/prax` main:

```
npx tsc --noEmit
npx eslint src
for f in scripts/test-*.ts; do node "$f" || echo "FAIL $f"; done
npm run build
```

Plus, when `extension/` changed: `PLAYWRIGHT_CORE=<path> node scripts/e2e-extension.mjs`, and check that `extension/manifest.json` `version` equals `LATEST_EXT` in `src/lib/bridge.ts` and that `public/prax-extension.zip` was rebuilt (unzip it and diff its manifest).

Any red result is a FAIL with severity P1 at least.

### 0.2 Browser pass

- Local `npm run dev`, Chrome (claude-in-chrome), at 1440 by 900 and 390 by 844. Every tab and every panel, scrolled top to bottom. Screenshots go in `/private/tmp/claude-503/-Users-kanishk-raj-claude-md/5ea672f0-465e-415c-b793-7822bc9d8b7c/scratchpad/qa/<stage>/`, named `<section>-<state>-<width>.png`.
- When the extension is needed, add a temporary route (for example `src/app/qa-bridge/`) that answers the page's `postMessage` calls the way `extension/bridge.js` does, with a state picker: no extension, extension older than required, installed but not connected, connected without keys, connected with keys. It holds fake keys only in memory and never calls a real provider. Delete the route after the pass. It must never be committed.
- Console: no errors and no React warnings on any path.
- Network: on every path, check that no request to the Prax origin or to Supabase carries a key (see 0.4).

### 0.3 The states every screen is checked in

| State | How to produce it | Pass when |
|---|---|---|
| Loading | Throttle to Slow 4G | Skeletons, no layout jump, no "0" or "None" flashed before data arrives |
| Empty | Own new workspace (TS4), or a demo copy with the section's rows removed | An honest empty state that says what to do next, one action. No dashes as values, no invented numbers |
| Error | Block the Supabase host in DevTools; fake bridge returns an error | A plain sentence and a Try again button. No stack traces, no raw error codes, nothing stuck spinning (QA1: AI buttons must not hang for 2 minutes) |
| No extension | Fake bridge off | Says Prax for Chrome is not installed, links to the Prax for Chrome tab in Connections, and keeps the rest of the page usable |
| Extension older than required | Fake bridge reports a version below `LATEST_EXT` | Says to update, names the version needed, gates only the features that need it |
| 390 wide | Viewport 390 | No horizontal scroll, nothing cut off, the one red action stays in the header, the other actions move into the ⋯ menu, tap targets 44 px or more, tables become labelled pairs |

### 0.4 Security checks that apply everywhere

1. **Key leakage.** Keys live only in `chrome.storage` in the extension. Check:
   - Network panel, with a fake key `sk-qa-LEAKCHECK-0000` set through the bridge: the string must not appear in any request to the Prax origin, `/api/*` or `*.supabase.co`. That covers bodies, headers and query strings, Realtime frames included.
   - `grep -rI "LEAKCHECK" .next` after a build, which must find nothing.
   - The database tables touched by the stage (`ext_usage`, the new routes, usage and humanize tables) have no column that could hold a key. Read the migration and confirm no `key`, `secret` or `token` text column except `ext_tokens.token_hash`.
   - No new `/api/*` route proxies a provider (Pangram, Walter, OpenAI and the rest). Calls with a key go from `extension/background.js` straight to the provider.
   - The key field is `type="password"`, `autocomplete="off"` and `spellcheck=false`, and it is cleared after save. A saved key is never echoed back, only "Saved ····".
2. **RLS.** A tester must never see Shashi's workspace. Check:
   - Every new table has RLS enabled, with `has_role(workspace_id, ...)` policies, written to be re-runnable.
   - Signed in as a tester, `supabase.from(<every table>).select("*")` from the browser console returns rows only for the tester's demo copy and the tester's own workspace.
   - Direct URL `/w/<shashi-slug>` and `/w/<shashi-slug>/settings` as a tester give a not-found page, not an empty shell.
   - `ext_*` functions only write to workspaces where the token's user has a role.
3. **Invite only.** Public sign-up returns "Signups not allowed". The magic link keeps `shouldCreateUser: false` (`src/app/login/page.tsx:46`). `/api/invite` returns 403 for anyone who is not an owner and keeps the 20 per hour limit.
4. **No LinkedIn automation.** No new code in `extension/` clicks, submits, scrolls, likes, connects or crawls. To check it, grep the diff for `.click(`, `dispatchEvent`, `submit(`, `scrollBy`, `scrollTo`, `fetch("https://www.linkedin.com` and new `chrome.tabs.create` to LinkedIn URLs. Data tools in Connections are for web, news and company data, never LinkedIn.
5. **Branding (Q150 to Q153 rule).** Prax is its own product. Shared UI, invite pages and emails say "Prax", never "Antier", and never hardcode a person's name. The inviter's name comes from their profile. To check it, `grep -rInE "Antier|Alok|Shashi|Kanishk" src extension` and the email templates in the stage diff. Any hit outside comments, tests, fixtures or a specific workspace's own data is a defect.
6. **Design rules.** The palette is #141414, #d64545, #9e1c1c and white, with greys only for small text at 4.5:1 or better (check with DevTools contrast). There is one red primary action per screen. There are no eyebrow labels, no dashes as values, no emoji, no gradients and no contractions in copy. Section headers use the shell from `src/components/shell/`.
7. **Accessibility.** Run axe on each new screen. Every input has a label, dialogs trap focus and close on Escape, tabs work with the arrow keys and focus rings are visible.

### 0.5 Defect format

Each defect gets a number, a severity, where it is (URL and file:line), steps, the expected behaviour, the actual behaviour and evidence (a screenshot path or a code line).

- P0: data or key exposure, a tester seeing Shashi's data, any LinkedIn automation, or sign-up open to the public.
- P1: an agreed behaviour is missing or broken, or the gate is red.
- P2: a wrong state, a layout break at 390, a copy or design-rule breach.
- P3: polish.

The verdict is PASS only with zero P0 and zero P1 defects.

---

## 1. Connections (C1, Q135 to Q141, migration 032)

### 1.1 Acceptance criteria

1. One "Connections" item in the Set up group of the sidebar (`src/components/sidebar.tsx`) replaces "Extension". `/w/<slug>/extension`, `/extension` (`src/app/extension/page.tsx`) and `/extension#search-keys` all redirect to Connections. The old hash should open the matching tool or tab. "Prax for Chrome" is a tab inside Connections, with install, connect, version and Quiet mode, and nothing is lost from today's Extension page.
2. A catalog of 20 to 25 real tools in seven sections: AI writing models, AI citations engines, Humanization and detection, Data and discovery, Images and video, Meetings, Prax MCP. Logos are official and unaltered. A tool with no legitimate mark shows its name only. No made-up tools.
3. Filters by section, status and job, and they combine. A filter with no results shows an honest empty state with a Clear filters action.
4. Every card states, from real routes, whether Prax uses it today: "Connected · used by N jobs", "Connected · not used by any job yet" or "Not connected". A card never shows connected without a key in this browser (AC16).
5. A full page for each tool covers:
   - a description and its use cases in Prax;
   - connect by API key, MCP details or both, with a docs link;
   - a Test connection button with a clear success or failure line;
   - the jobs it can do, with routing and fallback;
   - usage this month by section (% of calls, call count, cost, trend);
   - a monthly cap with a warning at 80%;
   - Edit, Review, Delete (confirm, then a toast with Undo) and Replace key;
   - Back and Next between tools.
6. One key per tool (Q136). One routes table maps each job to a tool and a fallback. An optional separate key per job sits under Advanced, closed by default.
7. Every call is tagged with its job (Q137), so usage adds up per tool, per job and per section. The totals agree across those three views.
8. Key forms are gone from every other section (Q138, inventory in section 7). Each section shows "Using X · change", and Connect opens the same Connections panel in place without leaving the page. AI citations keeps only its engine selection.
9. Data tools fetch web, news and company data only. Nothing reads or crawls LinkedIn.
10. Keys stay in `chrome.storage`. Migration 032 holds routes, caps and usage tags only, never a key. It is re-runnable and has RLS.

### 1.2 Click paths

1. Sidebar → Connections. The catalog loads with the seven sections, and the counts match the cards.
2. Filter by section Humanization and detection, then by status Not connected, then by job Write comment. Clear filters.
3. Open Claude → Connect → paste the fake key → Test connection (the fake bridge answers ok) → Save. A toast appears and the card reads "Connected · used by 1 job" (or whatever the routes say).
4. On the Claude page: Replace key → paste → Save. Delete → Confirm → Undo, and the key comes back. Delete → Confirm, and the card reads "Not connected".
5. Next and Back walk through every tool in catalog order, and wrap or stop at the ends without errors.
6. Routes: set Write comment to OpenAI with Claude as the fallback. Make OpenAI fail in the fake bridge, and the job runs on Claude with usage tagged to the job and to Claude.
7. Advanced → add a separate key for one job → check that the job uses it and the rest still use the tool key.
8. Cap: set a cap of 100 calls, then feed 80 fake usage rows. The 80% warning shows on the card, on the tool page and in the section that uses it. At 100% paid calls stop, with a plain message.
9. Comment Studio → "Using Claude · change" → the panel opens in place → switch to Gemini → back in the studio without a reload.
10. Content Studio images, Discovery AI search, AI citations, Network, Inbox draft reply and the Dashboard get-started card: each shows "Using X · change" or Connect, and none has a key field.
11. AI citations → the engine selection only, with no key rows (the old `KeysModal` is gone).
12. Old URLs: `/extension`, `/w/<slug>/extension`, `/w/<slug>/extension#search-keys` and the extension's own "Open keys" link (`extension/panel.js:316`) all land on the right place in Connections.
13. The Prax for Chrome tab: install link, connect, version shown, Quiet mode, and the update prompt when the extension is old.

### 1.3 States

All six states in 0.3, on the catalog, a tool page, the in-place panel and the Prax for Chrome tab. Also check:

- No extension: the catalog still renders. Cards say keys need Prax for Chrome and Connect leads to the Prax for Chrome tab.
- Old extension: Test connection is disabled with an update line.
- Usage with zero calls shows "None this month", not a dash or 0%. The trend needs two months of data, otherwise it says so.
- At 390 the tool page is a single column, the usage table turns into labelled pairs, and Back and Next stay reachable.

### 1.4 Security

- All of 0.4.1, using the fake key on Connect, Replace, Test, the per-job key and in-place Connect.
- Test connection runs in the extension, not through a Prax server route.
- Migration 032 is read for RLS, `has_role` policies and no key columns.
- The MCP details show only public endpoints and setup steps, never a token Prax holds.
- Data tools have no LinkedIn domains in their allowed fetch targets.

### 1.5 Scripted tests that must exist

- `scripts/test-connections.ts`, which checks:
  - the catalog has 20 to 25 tools, each in one of the seven sections, with a name, a docs URL and jobs;
  - every logo has a recorded source;
  - the filter logic;
  - the card honesty line from routes;
  - route resolution with fallback, and the per-job key overriding the tool key;
  - usage rolled up per tool, job and section, with totals that agree;
  - cap maths at 79, 80, 99 and 100%;
  - the old URL redirect map;
  - Next and Back order;
  - that the `ext_usage` row shape has no key field;
  - that migration 032 is re-runnable (run it twice in PGlite like `test-text.ts`).
- `scripts/test-extension.ts` is extended with job tagging on every call type and the cap stop.
- A key-leak check: a script or e2e step that saves `LEAKCHECK` through the bridge, runs one job and fails if the string appears in any request off the provider's host.

---

## 2. Humanization (H1, Q128 to Q134, migration 031)

### 2.1 Acceptance criteria

1. Pangram is the judge in Comment Studio, in the extension's drafts and in Content Studio (Q128).
2. A draft that fails is first fixed by Prax's own targeted rewrite of the flagged sentences only, up to 2 rounds. Walter AI is a second fixer, offered only after both local rounds fail and only when a Walter key exists (Q129).
3. Each profile sets its own level from 0 to 100%, with presets 20, 50, 70, 90 and 100, separately for comments, posts and articles. At 0% Pangram is never called (Q130, Q134).
4. Posts and articles must pass before Send for approval is enabled. Comments only show the badge and are never blocked (Q131).
5. Pangram checks only the chosen, final text, on copy, save, log or send for approval, never every draft. Long pieces check only on click (Q132).
6. The estimated cost shows before a long check, and the month's usage is visible (Q133).
7. Cost rules:
   - the free local Human score (`humanScore` in `src/lib/studio.ts:69`) runs first, and a paid check runs only when the local score is close to or above the level;
   - the cache is keyed by text hash, so unchanged text is never re-checked;
   - in articles only the edited paragraphs are re-checked;
   - the monthly word cap per service is entered by the user, with a warning at 80%; at 100% paid checks stop and the badge reads "Not verified, free score only";
   - Walter only runs after Pangram fails and both local rounds fail.
8. Pangram and Walter keys live in the extension and are connected in Connections (C1). There are no key forms in the studios.
9. The badge says "per Pangram" and never claims a guaranteed "100% human". An empty draft shows no score (commit e6f996a).
10. Migration 031 is re-runnable and has RLS. It stores levels, caps, usage counts and text hashes, not text sent to Pangram and not keys.

### 2.2 Click paths

1. Settings (or wherever the level is built) → the demo profile → comments 50%, posts 90%, articles 70%. Reload and the values persist. A second profile keeps its own values.
2. Comment Studio → draft → pick one draft → Copy. One Pangram call (fake bridge counts it) and the badge appears "per Pangram". Copy the same text again and no new call is made, because of the cache.
3. Set comments to 0% → Copy. No Pangram call and only the local score.
4. Content Studio → a post below the level → Send for approval is disabled, with a reason → Fix → only the flagged sentences change (diff them) → round 2 → it passes → Send for approval is enabled.
5. Make both local rounds fail with no Walter key: a plain message with Connect Walter (in place, from Connections). With a Walter key: Walter is offered and its result is checked again by Pangram.
6. An article → Check (on click only) → the cost estimate shows first → confirm → edit one paragraph → Check → only that paragraph is sent (count words in the fake bridge payload).
7. Cap: set a cap of 1,000 words and feed 800. The warning shows. At 1,000 the badge reads "Not verified, free score only" and no paid call is made.
8. On LinkedIn fixtures (`scripts/e2e-extension.mjs`): an extension draft → Use → badge only, no Pangram call until the text is used or logged.
9. The monthly usage view shows words and cost per service, matching the Connections tool page.

### 2.3 States

All of 0.3, and also:

- No extension: the local score only, with a "Connect Pangram" line, never a blocked approval with no way out. Posts still need a pass, so the message must say how to get one.
- Pangram error or timeout: one retry, then "Not verified" with Try again, and the draft stays editable.
- At 390 the badge and the fix flow fit without overflow.

### 2.4 Security

- 0.4.1 with a Pangram fake key.
- Text goes to Pangram only from the extension.
- No server route forwards drafts to Pangram or Walter.
- The cache stores hashes, not text.
- The level setting is editable only by editors and owners of that workspace (RLS).

### 2.5 Scripted tests that must exist

- `scripts/test-humanize.ts`, which checks:
  - the level presets, and that 0 means no call;
  - the gate rule (a paid check only near or above the level);
  - the hash cache, and only edited paragraphs being re-sent;
  - the fix order: local, local, Walter, never Walter first, and never Walter without a key;
  - that posts and articles block approval while comments never do;
  - the cost estimate maths and cap maths at 80 and 100%;
  - the badge copy ("per Pangram", "Not verified, free score only", never "100% human", no score on empty text);
  - that migration 031 is re-runnable in PGlite.
- `scripts/test-studio.ts` is extended so the badge goes through the shared function.
- `scripts/e2e-extension.mjs` is extended so no Pangram request goes out before Use or Log.

---

## 3. TS1: hidden from Google (Q142)

### 3.1 Acceptance criteria and checks

1. `GET /robots.txt` returns `User-agent: *` and `Disallow: /`.
2. Every HTML response has `<meta name="robots" content="noindex, nofollow">` (through `metadata.robots` in `src/app/layout.tsx`) or an `X-Robots-Tag: noindex` header. That includes `/login`, the Join Prax page and `/share/[token]`.
3. There is no sitemap, and nothing in the build lists URLs.

To check: `curl -sI` and `curl -s` on `/`, `/login`, `/robots.txt`, a share link and the invite page, both locally and on production in the smoke test.

### 3.2 Scripted test

A case in `scripts/test-access.ts` that reads the built metadata and the robots output.

---

## 4. TS2: invite only (Q143)

### 4.1 Acceptance criteria

1. The owner adds a tester's email in Settings → Team. Prax creates the account on the server with Supabase admin `generateLink` (type `invite`) and shows a **one-time invite link** with a Copy button. The owner sends it themselves, on WhatsApp or by email. **No email is sent by Prax**, and no SMTP, Resend or domain is needed.
2. The link is shown once. Leaving the dialog and coming back shows "Link already shown", with a "Make a new link" action that invalidates the old one. The link carries the 7-day expiry, and the dialog states it.
3. Public sign-up is off in Supabase Auth. The login page has no sign-up link. The magic link never creates an account (`shouldCreateUser: false`).
4. **Only an owner can create invites.** The route checks `has_role(..., 'owner')` on the server, not only in the UI. It returns 401 when signed out and 403 for editors and viewers. The 20 per hour limit holds.
5. **The service-role key never reaches the client.** It is read only in server code (`src/app/api/invite/route.ts`, `runtime = "nodejs"`) from a non-`NEXT_PUBLIC_` env var. It is never in a client bundle, never in a response body or header, and never logged. The generated link is returned only to the owner who asked for it.
6. **Inviting a tester must not make them a member of the workspace the owner happens to be in.** Today `invites` grants a role in a given `workspace_id`, and `claim_invites()` turns it into membership. If the owner invites from Shashi's Settings → Team, the tester becomes a member of Shashi's workspace. The tester invite must be its own kind ("tester", which grants a demo copy only), separate from "add a member to this workspace". This is a P0 risk to check first.
7. The reply for an email that already has an account says so plainly, and does not create a second account.

### 4.2 Click paths

1. As the owner: Settings → Team → Invite tester → enter an email → Create link. The dialog shows the link, its expiry and Copy. Copy gives a "Link copied" toast. The person shows as "invited" with a date.
2. Close and reopen the dialog: "Link already shown". Make a new link, and the old link now opens the "used or replaced" page.
3. Invite the same email again: a clear line, and no second account.
4. As a non-owner editor: the invite controls are hidden. A direct `POST /api/invite` from the console returns 403. Signed out, it returns 401.
5. Open the copied link in a fresh browser profile: it opens "Join Prax" (TS9).
6. Sign-up probe: `POST <supabase>/auth/v1/signup` with a throwaway address returns "Signups not allowed". Run this on preview, or on production only with the coordinator's OK.

### 4.3 Security checks for the service-role key

- `grep -rI "SERVICE_ROLE" src` hits only server files (route handlers and server-only modules), and no file under `"use client"` imports them.
- After `npm run build`, `grep -rIl "<first 12 chars of the service role JWT>" .next/static` finds nothing, and neither does `grep -rI "service_role" .next/static`. Read the value from `.env.local` into a shell variable and never print it.
- In the browser, the Network panel on the invite request shows a response that holds only the link and a status, with no key and no admin payload. Error responses hold a plain sentence only (the existing `FAILED` copy), with no Supabase error text.
- `vercel env ls` shows the service role key is not prefixed `NEXT_PUBLIC_`. Read the names only, never the values.

### 4.4 States

Loading and error on Create link, an invalid email, Copy failing (clipboard blocked: the link stays selectable with a "Select and copy" line), 390 wide, and an owner with no team yet ("None invited yet").

### 4.5 Scripted tests

- `scripts/test-auth.ts` gets tester-invite cases: owner only, 401 and 403 paths, the same-email reply, rate limit, and the link being returned once.
- `scripts/test-rls.ts` (new, PGlite with an `auth.uid()` stub) gets "an invite from Shashi's workspace never yields a Shashi membership" and "claim_invites on a tester invite creates exactly one demo copy".
- A bundle check (in `scripts/test-access.ts` or the gate) fails if `SUPABASE_SERVICE_ROLE` or the `service_role` claim appears in `.next/static`.

---

## 5. TS3 to TS8

### TS3: a private demo copy per tester, and Shashi owner-only (Q144)

**Acceptance criteria**

1. On first sign-in each tester gets their own copy of the Layla Haddad demo (from `db/019_demo_profile.sql`), owned by the tester and marked `is_demo` with the Demo tag. Editing it changes nothing for anyone else.
2. Shashi's workspace is visible only to the owner and the members the owner adds.
3. The copy is made once. Signing in again does not make a second copy.
4. The copy has every section's data (`scripts/test-demo.ts` cross-section consistency holds for the copy).

**Click path**

1. Tester A signs in and edits a Today task in the demo.
2. Tester B signs in and sees the original value.
3. The owner sees neither copy unless added.
4. Tester A tries `/w/<shashi-slug>` and gets not-found.
5. From tester A's browser console, `select` on workspaces, members, posts, prospects, comment_log, ext_usage, feedback and the new 031 and 032 tables returns only tester A's rows.

**States**

- The copy is still being made: a calm loading moment, not an empty dashboard.
- Copy failed: a plain error with Try again.

**Security**

- RLS is the whole item.
- The copy function is `security definer`, copies only the demo template, and cannot take a source workspace id from the caller.
- The `/` home (`src/app/page.tsx`) and the `/extension` redirect pick the "first workspace by created_at". For a tester that must be their demo copy.

**Scripted tests**

`scripts/test-rls.ts` covers:

- every workspace table, read and write, as an owner, a member, tester A and tester B;
- copy idempotence;
- the copy cannot target Shashi;
- re-running `db/011` after testers exist adds nothing to their workspaces (today its loop inserts "Shashi Pal" and renames to "Antier" for any workspace with a lone company self entity: `db/011_citations_person_company.sql:17-24`).

`scripts/test-demo.ts` checks the copy against the seed.

### TS4: the "Set up my own profile" wizard and workspace switcher (Q145)

**Acceptance criteria**

1. A "Set up my own profile" button creates an empty workspace and opens a wizard:
   - name and LinkedIn URL;
   - goals and audience;
   - topics;
   - connect an AI tool (the Connections panel in place);
   - install Prax for Chrome.
2. Each step can be skipped and resumed. Progress persists.
3. The account menu (`src/components/account-menu.tsx`) switches between the demo and the tester's own workspace, and shows which one is open.
4. Every section in the new empty workspace shows honest empty states (0.3) and no demo data.

**Click path**

1. Account menu → Set up my own profile.
2. Fill the name and an invalid LinkedIn URL: an inline error.
3. Fix it → Next through all five steps.
4. Skip "install".
5. Finish → you land on the Dashboard of the new workspace → switch to the demo → switch back, and the wizard state is kept.
6. Visit every sidebar section in the new workspace.

**States**

All of 0.3, plus "Connect AI" with no extension and with an old extension.

**Security**

The new workspace is owned by the tester only. The voice and seeds carry no Shashi, Antier or Alok text (the 0.4.5 grep, plus `db/003_extension.sql:145`, which only applies to `name ilike 'shashi%'`).

**Scripted tests**

`scripts/test-setup.ts` (new) covers the wizard step model, validation, skip and resume, and the switcher list.

### TS5: tours in every section, replayed from "?" (Q146)

**Acceptance criteria**

1. Every section in section 8's list has an anchored first-visit tour.
2. The tour starts once per user per section and can be replayed from a "?" button in each section header.
3. Every step points at an element that exists in that state. In an empty workspace a step whose anchor is missing is skipped or re-anchored, never floating.
4. Escape closes the tour and focus returns to "?".
5. Reduced motion is respected.

**Click path**

For each section: first visit (clear localStorage) → the tour auto-starts → Next to the end → reload, and it does not start again → "?" → it replays. Repeat in the tester's empty own workspace and at 390.

**Open decision to confirm with the owner**

Q146 says "?" replays the tour and Q147 says "?" links to the Guide page. Recommended answer: "?" opens a two-item menu, Replay tour and Open guide page.

**Scripted tests**

`scripts/test-shell.ts` is extended to check that:

- every NAV item (`src/components/sidebar.tsx`) has a non-empty step list;
- every step `target` has a matching `data-tour` in that section's files;
- the seen key is per user and per section (Content Studio's `prax-tour-content-studio` key in `src/components/content/guide.tsx:41` is not per user today).

### TS6: the in-app searchable Guide (Q147)

**Acceptance criteria**

1. A Guide section in the Set up group has one page per section. Each page covers the purpose, step-by-step use, every button and menu, the settings, the logic behind it and common problems, with real screenshots of the demo, not mock-ups.
2. Search finds the right page by section names, button labels and Command K words.
3. "?" links to that section's page.
4. "Download PDF" gives the whole guide with working links, selectable text and every page.
5. The copy follows the design rules: no dashes, no contractions, no Antier or person names, and "Prax" throughout.

**Click path**

Guide → search "pipeline stage" → open the page → follow a link back to the section → "?" in Pipeline → its Guide page → Download PDF → open it, and check the page count and images. Also check at 390.

**States**

- Search with no result: "No page matches", with a link to the full list.
- The PDF is generating: a progress line.

**Scripted tests**

`scripts/test-guide.ts` (new) covers:

- one page per NAV section, and no orphan pages;
- every button label named on a page exists in that section's source;
- the search ranking;
- that the PDF builds and has the same page count as the guide.

### TS7: the Send feedback button and the owner-only list (Q148)

**Acceptance criteria**

1. A "Send feedback" control is on every page, and it is not red, so the one red action per screen stays.
2. It saves the page URL, a note and an optional screenshot.
3. Only the product owner sees the list. A tester sees only a confirmation, never the list and never other testers' feedback.
4. Screenshots are size-checked and stored in a private bucket. The capture excludes key fields.

**Click path**

1. As a tester: Send feedback → note → attach a screenshot → Send. A toast appears.
2. Send an empty note: an inline error.
3. As the owner: the feedback list shows the item with the page, the note, the screenshot and the tester's email.
4. As a tester: open the list URL directly and get not-found. A console `select` on feedback returns 0 rows.

**Security**

- RLS on the feedback table: insert by any signed-in user for themselves, select only by the owner.
- The storage bucket is private, with signed URLs.
- The screenshot must not capture password or key fields (check with the Connections key field open).

**Scripted tests**

`scripts/test-feedback.ts` (new) covers payload validation and size limits. `scripts/test-rls.ts` covers the feedback policies.

### TS8: the brand-new-user walkthrough and QA sign-off (Q149)

Pass when the script in section 6 runs end to end on production, with zero P0 or P1 defects, and every screenshot is saved under `qa/walkthrough/`. Only then is C1, H1 or TS1 to TS9 marked done.

### TS9: the copied invite link, the Join Prax page, and email templates saved for later (Q150 to Q153, free-tier rule)

**Acceptance criteria**

1. **Nothing is emailed.** Supabase's built-in email reaches only the project's own team, and there is no domain or Resend. The invite is the one-time link from TS2. Check that no code path in the stage calls Resend or SMTP, or relies on Supabase sending an invite, reset or change email to a tester. `generateLink` returns a link and must not send an email.
2. **The invite link opens "Join Prax".** It is a login-style page showing:
   - the Corners logo;
   - "<inviter> invited you to try Prax", with the inviter's name from their profile and never hardcoded;
   - the tester's email, read-only;
   - password and confirm, with the rules from `scripts/test-auth.ts`.

   A valid submit lands on the tester's demo copy and starts the first tour. It says "Prax" throughout, and never Antier, Alok or Shashi.
3. **An expired or used link shows its own page.** Each of these gets its own calm page with a next step ("Ask <inviter> for a new link"), never a raw Supabase error, a blank page or the plain login page:
   - expired (past 7 days);
   - used (the account already set a password);
   - replaced (a new link was made);
   - malformed or tampered;
   - opened while signed in as a different account.

   The `src/app/auth/callback/route.ts` paths are covered too.
4. The link works once. After a password is set, the same link shows the used page, and the password still works on `/login`.
5. **Forgot password with no email.** The login page's Forgot password must not promise an email that cannot arrive. The page must say to ask the owner for a reset link, or the owner must be able to make one in Settings → Team (same copy-link flow, owner only). Which one is a decision for the owner, but either way nothing may silently fail.
6. **Premium email templates are saved, not sent.** The invite, reset, email change and welcome templates (Q151, Q152) are in the repo and render, but nothing sends them. When they are switched on later they must meet the email-client checks below. They are checked now as files only.
7. The page, the link and the templates escape all user text (inviter name and any note).

**Click path**

1. The owner creates a link (TS2) and copies it.
2. In a fresh browser profile, paste the link → Join Prax shows the inviter and the email → mismatched passwords give an inline error → a weak password gives the rule line → a valid password → you land in the demo copy and the tour starts.
3. Open the same link again: the used page.
4. Owner makes a new link, then the old one opens: the replaced (or used) page.
5. Tamper with one character of the token: the invalid page.
6. Expired: on preview, use an invite older than 7 days, or ask the coordinator for one. Do not change production data. The expired page shows.
7. Open a link while signed in as the owner: the wrong-account page with Sign out and continue.
8. `/login` → Forgot password: the honest copy from criterion 5, with no "check your email" when nothing is sent.

**States**

Join Prax in loading, error (Supabase down), expired, used, replaced, invalid and wrong-account states, at 1440 and 390. Use the full 0.3 matrix, but no extension state applies here.

**Security**

- The token is only in the URL fragment or query once, and is not stored in localStorage.
- The page never shows another person's data.
- The account is created server-side only.
- The service-role key checks from TS2 4.3.
- No open redirect after Join: `next` is checked by the safe redirect rules in `test-auth.ts`.

**Template checks (files only, nothing sent)**

To check:

- `scripts/test-emails.ts` renders each template.
- Open the rendered HTML in Chrome at 600 and 390 wide, with images off, and in emulated dark mode (`prefers-color-scheme: dark`).

The templates must have:

- the Corners logo with alt "Prax";
- the inviter's name from data;
- an optional note, shown only when given;
- one red #d64545 button with white text, built as a bulletproof table button for Outlook;
- the expiry stated;
- a quiet footer;
- a plain-text part;
- links built from `SITE_URL`.

There must be no "Antier", "Alok", "Shashi" or "Kanishk" literal. The full Gmail, Outlook, Apple Mail and phone client pass is deferred until a domain exists, and is listed as a pre-switch-on gate, not a TS9 blocker.

**Scripted tests**

- `scripts/test-auth.ts` gets cases for:
  - the invite token states (valid, expired, used, replaced, tampered, wrong account);
  - Join Prax password rules;
  - the safe `next` redirect.
- `scripts/test-emails.ts` (new) checks that:
  - each saved template renders with and without a note;
  - the inviter's name comes from data;
  - there are no hardcoded names;
  - the note is escaped;
  - a plain-text part exists;
  - links use `SITE_URL`;
  - the expiry text matches 7 days;
  - no module imports a mail sender (Resend, nodemailer or similar).

---

## 6. New tester walkthrough (run for TS8, on production)

Use a fresh Chrome profile with no Prax extension at the start. Take a screenshot at every numbered step, at 1440 and again on a 390 phone (or emulated) for steps 2 to 6. Record the time taken for each step.

1. The owner (not QA) adds `qa-tester+<date>@<test address>` as a tester in Settings → Team, gets the one-time invite link and sends it to the tester by WhatsApp or by email by hand. No email comes from Prax.
2. The tester opens the link in a fresh browser profile. It opens "Join Prax", which shows the inviter's name from their profile and says Prax, never Antier.
3. Set a password and confirm it.
4. You land in **your own demo copy** (Layla Haddad, Demo tag). The Dashboard entry moment plays and its tour starts. Follow the tour to the end.
5. Visit every sidebar section in order. Each tour auto-starts once. Finish two of them and close one with Escape. Reload one section, and its tour does not start again. Use "?" to replay it.
6. Edit something in the demo (tick a Today task). Then check, through the owner, that Shashi's workspace and other testers' demos are unchanged. Try `/w/<shashi-slug>`, which must give not-found.
7. Open the Guide. Search "comment", open the Comment Studio page, Download PDF, and check it.
8. Account menu → Set up my own profile → complete the wizard: name, LinkedIn URL, goals, audience and topics.
9. At the Connect step, Connections opens in place. Install Prax for Chrome from the Prax for Chrome tab, connect it, connect one AI tool with the tester's own key, and Test connection. The owner or tester enters the key: **QA never types a real key**. Check the network panel for key leakage while doing it.
10. Back in your own workspace: Comment Studio, paste a sample post, Draft, pick one, Copy. The humanization badge appears (per Pangram if connected, the local score otherwise). Nothing is posted anywhere, and Prax never opens LinkedIn.
11. Switch to the demo and back with the account menu.
12. Send feedback from the Comment Studio page with a note and a screenshot. A toast appears.
13. The owner opens the feedback list and sees it, with the right page and the tester's email. The tester cannot open the list.
14. Sign out, then sign in again on `/login` with the new password. Open the invite link again, and it shows the used page. Check that Forgot password gives the honest copy from TS9 criterion 5.
15. Clean-up is the owner's call. QA deletes nothing.

Pass when every step works without help, with no console errors, no P0 or P1 defects, and no copy that names Antier or a hardcoded person.

---

## 7. Inventory A: every API key form today (all must move into Connections)

Read from `main` at bb1fbaa (no code changed since c4c799f).

**Key entry forms (must be removed):**

1. **Extension page, drafting key.** `<DraftModel>` at `src/app/w/[slug]/extension/page.tsx:131`, from `src/components/provider-keys.tsx:15-83`. It has a password key input (`#x-key`, line 66) and a model field (line 68), for Claude, OpenAI, Gemini and Grok.
2. **Extension page, AI search keys.** `<SearchKeys>` at `src/app/w/[slug]/extension/page.tsx:133`, from `src/components/provider-keys.tsx:85+`. It is a `KeyRow` list for the search engines, Perplexity and SerpApi (for Google AI and Copilot), and is the `#search-keys` anchor.
3. **AI citations, "AI keys" dialog.** `KeysModal` at `src/app/w/[slug]/citations/studio.tsx:34-64`. It is opened from `citations/page.tsx:210` and from the RunPanel's `onKeys` (`citations/page.tsx:209`). Per Q138 only the engine selection stays.
4. **The shared form behind 2 and 3.** `KeyRow` in `src/components/provider-mark.tsx:119-170`, with the key input at line 161. After C1 it may be used only inside Connections.

**Links and copy that send the user to the old key location (must become "Using X · change", or point at Connections):**

- `src/app/w/[slug]/studio/page.tsx:104`: `DraftModelRow` → `/extension` (component at `src/components/provider-mark.tsx:69`, "Change" or "Connect").
- `src/components/discovery/search.tsx:61`: Connect → `/extension#search-keys`. Line 85 is the "No AI search" copy.
- `src/components/content/write.tsx:624`: the images card has a red Connect → `/extension#search-keys`. Line 268 is the error copy.
- `src/app/w/[slug]/citations/extras.tsx:331`: "Add a key" → `/extension#search-keys`. `citations/page.tsx:405` and `citations/studio.tsx:52` say "Install ... from the Extension page".
- `src/app/w/[slug]/network/page.tsx:703`: "Extension and AI key".
- `src/app/w/[slug]/comments/page.tsx:186`: "Set up the extension". `src/app/w/[slug]/studio/draft.tsx:190`: "Open Extension". `src/components/inbox/inbox-screen.tsx:193`: "Set up the extension". `src/components/get-started.tsx:46`: the extension step. `src/app/w/[slug]/page.tsx:261`: Reach "How to capture it".
- `src/components/sidebar.tsx:35`: the Extension nav item. `src/components/strategy/panels.tsx:21`: "Extension voice": "/extension". `src/app/extension/page.tsx`: the post-install redirect target.
- `src/lib/bridge.ts:34` and `:60`: the `NO_EXTENSION` and timeout copy ("connect it on the Extension page").
- Extension side: `extension/background.js:91`, `:178`, `:238` and `:269` (missing-key errors naming the Extension or AI citations page), `extension/panel.js:105` and `:316` (the Open keys button → `/extension#search-keys`), and `extension/panel.html:65`. Changing these needs a version bump, a `LATEST_EXT` bump and `npm run ext:zip`.

**Checked and not key forms:**

- `src/app/w/[slug]/settings/page.tsx` has no key field.
- `extension/panel.html` has no key input. Keys arrive only through `extension/bridge.js`, which is correct.
- The login and reset password fields are account passwords.
- The `setKey` calls in `campaigns.tsx` and `strategy/panels.tsx` are keyword and template keys, not API keys.
- Pangram and Walter have no key form yet. They must be built in Connections only.

## 8. Inventory B: sections with no tour yet

**These have a tour today (anchored, first visit, from the Guide button):**

- Through `Section` / `useTour`: Dashboard, Today, Inbox, Pipeline, Comment Studio, Profile Studio, Discovery Studio, Network, Engagement, Playbook, Weekly report and Monday review.
- Content Studio has its own `Tour` in `src/components/content/guide.tsx`.
- AI citations has its own `Tour` plus a setup tour (`citations/studio.tsx:494-513`, `citations/page.tsx:142`).

**No tour today (TS5 must add one):**

1. Templates: `src/app/w/[slug]/templates/page.tsx:83`, a `Section` with no `steps`, so it has no Guide button either.
2. Extension: `src/app/w/[slug]/extension/page.tsx`, no tour. It is replaced by Connections, which needs a catalog tour and a tool page tour.
3. Settings: `src/app/w/[slug]/settings/page.tsx`, no tour. It gets the Team tester invite and probably the humanization levels.
4. Pipeline lead page: `src/components/pipeline/lead-page.tsx:32-43`, a `Section` with no `steps`.
5. New sections that will need one from the start:
   - Connections (catalog and tool page);
   - Guide;
   - the feedback list (owner);
   - the Set up my own profile wizard;
   - the workspace switcher in the account menu (one step on the Dashboard tour is enough).

`/content`, `/notes` and `/strategy` are redirects only and need no tour.

**Tour gaps TS5 must also close:**

- No section has a "?" button. All use a "Guide" button (`src/components/shell/index.tsx:191-193`).
- There are three separate tour implementations (shell `useTour`, `content/guide.tsx`, `citations/studio.tsx`). Their seen-state keys differ, and Content Studio's key is not per user. They should be one.
- Step anchors that exist only when data exists are `row` (Today, Network), `card` (Discovery) and `inbox-actions` (Inbox). In the tester's empty own workspace these steps have nothing to point at.

## 9. Risks to raise before building

| # | Risk | Where | Severity if shipped |
|---|---|---|---|
| R1 | Tester invite reuses workspace membership, so an invite sent from Shashi's Settings → Team gives Shashi access | `invites` and `claim_invites()` in `db/schema.sql:28` and `:195`, `src/app/api/invite/route.ts` | P0 |
| R2 | The home and `/extension` redirect pick the first workspace by `created_at`, so a tester may not land in their demo copy | `src/app/page.tsx`, `src/app/extension/page.tsx` | P1 |
| R3 | Re-running `db/011` inserts "Shashi Pal" and "Antier" into any workspace with a lone company self entity, which could include testers' own workspaces | `db/011_citations_person_company.sql:17-24` | P2 |
| R4 | Tour anchors that only exist when data exists float in empty workspaces | section 8 | P2 |
| R5 | "?" means two different things in Q146 and Q147 | section TS5 | Decision |
| R6 | Forgot password and email change have no working email on the free tier, so testers can be locked out | `src/app/login/forgot`, Supabase built-in email | P1 until decided |
| R7 | `generateLink` and the admin API need the service-role key, which must stay server-only | `src/app/api/invite/route.ts` | P0 if leaked |
| R8 | Anything that quietly needs a paid tier (Vercel Hobby crons are daily only, Supabase Free pauses after a week idle, storage is 1 GB) | `vercel.json`, `src/app/api/cron`, the feedback screenshots bucket | P1 |

## 10. Scripted tests: summary of what must exist

| Script | New or extended | Stage |
|---|---|---|
| `scripts/test-connections.ts` | New | Connections |
| `scripts/test-extension.ts`, `scripts/e2e-extension.mjs` | Extended (job tags, caps, the key-leak check, no Pangram before Use) | Connections, Humanize |
| `scripts/test-humanize.ts` | New | Humanize |
| `scripts/test-studio.ts` | Extended (shared badge) | Humanize |
| `scripts/test-rls.ts` | New, PGlite with an `auth.uid()` stub (owner, member, tester A, tester B across every workspace table, feedback, demo copy, 011 re-run) | Agent A |
| `scripts/test-access.ts` | New (robots, noindex) | Agent A |
| `scripts/test-auth.ts` | Extended (tester invite, Join Prax token states) | Agent A, TS9 |
| `scripts/test-setup.ts` | New (wizard, switcher) | Agent A |
| `scripts/test-demo.ts` | Extended (copy equals seed) | Agent A |
| `scripts/test-emails.ts` | New (saved templates only, no sender) | TS9 |
| `scripts/test-shell.ts` | Extended (every NAV item has a tour, every target is anchored, per-user seen key) | Agent B |
| `scripts/test-guide.ts` | New | Agent B |
| `scripts/test-feedback.ts` | New | Agent B |

Each new script must also be listed in `CLAUDE.md` under Commands, so the gate in 0.1 picks it up.
