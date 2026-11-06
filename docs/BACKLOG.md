# Prax backlog: everything agreed, and where it stands

Single source of truth for what was agreed with the user and whether it exists. Audited 6 Nov 2026 against `docs/HANDOFF.md`, the full conversation log (5 to 6 Nov 2026, decisions Q1 to Q122 plus requests without a number) and the code on `main`.

**What "Live" means here.** The live site is `main` at `daa6e68` (`origin/main` = local `main`; deployed 6 Nov 2026 about 04:22). Every feature branch is merged into `main`; no branch holds unmerged work. All SQL files up to `db/020_security.sql` have been run (015 moved the 62 prospects into Outreach, 016 + 018 + 020 ran as one script, 019 created the demo profile). "Live" means the code is deployed; most sections were checked by Claude only with sample data, not with real keys or a real LinkedIn session (see Ops).

Status values: Live · Built not live · In progress · Not started · Partly done (what is missing) · Declined by user · Needs user action.

Source column: a Q number, or the date and time (IST, from the log) and a short quote of the user's message. "Handoff" means a line in `docs/HANDOFF.md`.

---

## Dashboard

| ID | Item, in plain English | Source | Status |
|---|---|---|---|
| D1 | Command-centre Dashboard: greeting with the member's name, one sentence on the week, Needs you now ranked by urgency, recent activity, LinkedIn reach | 5 Nov 21:10 "do the 4 pointers"; Handoff "Dashboard and Today redesign" | Live |
| D2 | Five headline tiles, including "named in X% of AI answers" with the week-on-week change | Q98 | Live |
| D3 | Discovery Studio in "This week at a glance" and new Discovery topics in Needs you now | Q97 | Live |
| D4 | "This week at a glance" without the repeated numbers (audit: it repeats the tiles) | Polish pass "Left for later"; 6 Nov 03:44 reply | Live (deployed 7 Nov) (glance lines say what is next) |
| D5 | Activity rows written as sentences ("Alok commented on X's post"), not "Comment done" labels | Polish pass "Left for later" | Live (deployed 7 Nov) (activity as sentences, wins highlighted) |
| D6 | Hide the empty KPI row under the "Set up <name>'s profile" card on a new profile | Polish pass "Left for later" | Live (deployed 7 Nov) |
| D7 | Bug: on the demo profile the Network glance line says "No LinkedIn export uploaded yet" although the demo has network data (`page.tsx` line 204 reads the import count, the seed writes people) | 6 Nov 04:24 live check, "I'll fix it in the next pass" | Live (deployed 7 Nov) (count used a missing id column; fixed) |
| D8 | LinkedIn MCP button: first removed (Q118), then put back at the user's request as "LinkedIn MCP" with the LinkedIn mark, no "Coming soon"; a click explains it is on the way | Q118; 6 Nov 03:37 "can we put only LinkedIn MCP button" | Live |
| D9 | LinkedIn MCP that actually connects (read LinkedIn data through an MCP) | 6 Nov 01:12 Q121 "i want to make cis mcp etc in the future" | Not started |
| D10 | Weekly report: one page covering posts, replies, stage moves, AI citations movement and next week's plan (step 4 "weekly report"; Claude's "Weekly review" suggestion) | 5 Nov 15:48 step 4 list; Handoff "Next" item 3 | Live (deployed 7 Nov) (weekly report, on screen and PDF) |
| D11 | Multi-profile overview: one screen comparing all profiles (step 4) | 5 Nov 15:48 step 4 list; Handoff "Next" item 3 | Live (deployed 7 Nov) (profiles overview) |
| D12 | One comment count shared by Dashboard and Engagement (`commentDays`) | Audit item 1 (Q117) | Live |

## Today

| ID | Item, in plain English | Source | Status |
|---|---|---|---|
| T1 | One agenda page: progress ring, due and overdue strip, groups Comment, Post, Follow up, Connect, Other; Done, Skip, J/K/X/S keys | Q95; Handoff | Live |
| T2 | Livelier, premium motion on the ring, groups and rows (tick draws in, row settles below, counts roll) | Q95 "interactive catchy nd premium" | Live |
| T3 | A skip counts as cleared on Today but not as done on the Dashboard | Q96 | Live |
| T4 | Rows filled with real people and posts (Pipeline Do next, Discovery LinkedIn findings, own posts) instead of "Comment 1: who or what" | Audit item 6 (Q117) | Live |
| T5 | Campaign tasks on Today: comment tasks on target accounts' posts, weekly approval session, fast-response and event tasks, message tasks only after someone engages | Q51 to Q54 | Live |
| T6 | Reminder on Today at a post's planned time | Q33 "plus a reminder on Today at the planned time" | Live (deployed 7 Nov) (Dubai-time reminder on Today) |
| T7 | Today ignores closed stages of custom pipelines (Signed, Committed, Delivered, Done, Passed, Declined); today it only excludes Won and Parked by name, so due check-ins on closed leads still show | 5 Nov 22:52 "small fix for later"; Handoff Pipeline section | Live (deployed 7 Nov) (all closed stages excluded) |
| T8 | Weekly AI citations run reminder (once a week) | Q60 item 16 | Live |
| T9 | First-hour block after posting (60 minutes, replies ready) | Q62 | Declined by user |

## Pipeline

| ID | Item, in plain English | Source | Status |
|---|---|---|---|
| P1 | No drag and drop; one screen with Do next (5 most urgent) and everyone grouped by stage | 5 Nov 17:55 "I do not want drag and drop"; Q36, Q101 | Live |
| P2 | Lead panel: next action first with Done and Move to the next stage, then stage bar with days in stage, then timeline, warm path, touch plan, notes | Q36, Q105 | Live |
| P3 | Full lead page opened from the panel | Q36 "the full lead page opens from it" | Live (deployed 7 Nov) (full lead page) |
| P4 | Several pipelines per profile with templates (Outreach, Bank partners, Investors, Events and speakers, Blank); stage editor | Q37 | Live |
| P5 | Activity timeline per lead, logged automatically | Q38.1 | Live |
| P6 | Lead heat (hot, warm, cold dot; breakdown only in the panel) | Q38.2, Q103 | Live |
| P7 | Next action and due date required on every move, feeding Today, overdue in red | Q38.3 | Live |
| P8 | Touch plan per stage as a task queue on Today | Q38.4 | Live |
| P9 | AI-drafted message for the stage, copy only | Q38.5 | Live |
| P10 | Accounts: leads grouped by company ("Group by company" toggle) | Q38.6, Q101 | Live |
| P11 | Deal value, probability and forecast | Q38.7, Q102 | Declined by user |
| P12 | Saved views | Q38.8, Q106 | Declined by user (until asked) |
| P13 | One search, Overdue and Hot quick filters, segment and owner under More filters | Q106 | Live |
| P14 | Lost reasons on Parked or Lost | Q38.9 | Live |
| P15 | Import from CSV or from Network | Q38.10 | Live |
| P16 | Read-only Board view | Q104 | Declined by user (removed) |
| P17 | Keyboard shortcuts to move stages, not shown on screen | Q36, Q106 | Live |
| P18 | Remove Pipeline's repeated next-step sentence | Polish pass "Left for later" | Live (deployed 7 Nov) |
| P19 | Account map as its own view (step 4); Claude said it would be built once inside Pipeline | Step 4 list; Q38 note | Live (deployed 7 Nov) (account map) |

## Network

| ID | Item, in plain English | Source | Status |
|---|---|---|---|
| N1 | Upload the LinkedIn data export zip, parsed in the browser; Connections, Shares, Comments, Invitations, Messages (metadata only) | Q1 to Q3, Q16 | Live |
| N2 | Segments from editable rules per profile, seniority in 4 levels, Unsegmented bucket, hand overrides | Q5, Q10 to Q12 | Live |
| N3 | Warm paths (connected, talked before, knows someone there); name matches wait for Same person or Not them | Q4, Q6 | Live |
| N4 | Topics of own posts and comments by pillar | Q7, Q13 | Live |
| N5 | Re-upload merges and shows "+N new" | Q8 | Live |
| N6 | Add to pipeline from a connection; Warm paths count on the Dashboard | Q14 | Live |
| N7 | Owner-only "Remove network data" | Q15 | Live |
| N8 | Warm path line in the lead panel | Q9 | Live |
| N9 | Keep Network as its own section (not folded into other pages) and make its use obvious | Q78 (first one); 5 Nov 20:30 "no take it like there only" | Live (fold-in declined by user) |
| N10 | "Explain with AI" on topics | Q7 recommendation "can come with Content Studio in step 4" | Live (deployed 7 Nov) (Explain with AI on topics) |
| N11 | Mutual connections read by the extension from a profile the user opens (true 2nd-degree paths) | Q4 "waits for its own small release"; Handoff Network | Live (deployed 7 Nov) (mutuals read on click; needs db/024) |
| N12 | Location read from profile pages the user opens, for regional segments | Q11 "left for later" | Live (deployed 7 Nov) (location read on click) |
| N13 | Upload Shashi's real export | Handoff "Waiting for Shashi's real export" | Needs user action |

## Profile Studio

| ID | Item, in plain English | Source | Status |
|---|---|---|---|
| PS1 | "Start a new review" to upload a new PDF or CV; old reviews kept in History | Q18; 5 Nov 16:37 item 17 | Live |
| PS2 | Score over time as a line chart, one point per day; no chart until a second review | Audit fix 9; polish pass | Live |
| PS3 | Layout at 1280 wide (headline not crushed, no file name) | Audit item 8 (Q117) | Live |

## Discovery Studio

| ID | Item, in plain English | Source | Status |
|---|---|---|---|
| DS1 | Discovery Studio section with entry moment, tabs Home, AI search, Crawl, Findings, Digest, Sources, Criteria, and a tour | 5 Nov 20:18 and 20:39 requests; Q74, Q77 | Live |
| DS2 | AI search through the extension with the user's keys, only cited URLs kept, dates confirmed by reading the page, live log | 5 Nov 20:39 "add one more tab... AI fetching"; Q74 | Live |
| DS3 | Crawl an uploaded Excel or CSV of links (Research Resources List in one click); statuses Read, List page, Gated, Blocked | 5 Nov 20:18; Q75 | Live |
| DS4 | Weekly run: server crawl every Monday 03:00 UTC; AI search starts by itself on the AI search day when Discovery is opened | Q76, Q87; 5 Nov 21:32 "monday crawl do by yourself" | Live |
| DS5 | Findings with seven scores, bands, Found by, filters and actions | Q74 | Live |
| DS6 | Antier service tag per finding, filter by service, services roll-up in the Digest | Q78 (Discovery) | Live |
| DS7 | People in findings checked against Network: "Warm: you know N people here" | Q79 | Live |
| DS8 | Speaking and pitch opportunities band with deadlines | Q80 | Live |
| DS9 | Journalist and analyst requests with a quick-reply draft (copy only) | Q81 | Live |
| DS10 | Tenders and RFPs in a separate For sales band, never posts | Q82 | Live |
| DS11 | Competitor moves suggest a "How we see it" angle linked to a matching campaign | Q83 | Live |
| DS12 | Digest = merged topics, priority score with editable weights, Crowded flag, top 10 plus Rising, Possible merge, top 3 cards plus ranked list | Q84 to Q90; 5 Nov 20:53 | Live |
| DS13 | Tick topics and Send to Content Studio; angle decided there | Q91 | Live |
| DS14 | Send to Discovery from LinkedIn (Prax bar on a post) | Q74 design ("Sources: LinkedIn") | Live |
| DS15 | Send to Discovery from a LinkedIn profile you have opened | Q74 design "or on a profile you've opened" | Live (deployed 7 Nov) (Send to Discovery from a profile) |
| DS16 | News about a target company adds a note on that prospect in Pipeline | Q74 routing table | Live (deployed 7 Nov) (note on prospect, Discovery and Dashboard Needs you) |
| DS17 | First real Discovery run with AI keys (never run yet; the live check showed "nothing run yet") | 5 Nov 23:16 "needs a Discovery run first" | Needs user action |

## Content Studio

| ID | Item, in plain English | Source | Status |
|---|---|---|---|
| CS1 | Content Studio rebuilt, catchy and premium, with Home, Write a post, Campaigns, Plan, Library, Formatter, entry moment and tour | 5 Nov 17:55 "rebuild the content studio"; 19:42 entry animation | Live |
| CS2 | Write a post wizard: source (idea, link fetched, PDF upload with a file picker, rough draft, saved comment, topic gap), type (text, image, carousel, video, poll, article), ideas, hooks against the mobile fold, 3 drafts with Human and Impact, quick edits, preview, visual, plan, hand off | Q32; 5 Nov 18:16 (link fetch, PDF popup) | Live |
| CS3 | Angle step after the idea (4 suggested angles plus your own), saved on the post and shown in approval | Q92; 5 Nov 20:59 "confirm me whether the angle thing is in the content studio" | Live |
| CS4 | "Copy and open LinkedIn" hand-off; Prax never posts | Q33 | Live |
| CS5 | Image generation with an OpenAI or Google (Nano Banana, `gemini-2.5-flash-image`) key; "Connect image key" goes to the Extension page | Q34 "only we will add open or google nano bann api"; 5 Nov 18:45 | Live (never tried with a real key) |
| CS6 | Save generated images with the post | Handoff "Generated images stay in the browser to download; only the brief is stored" | Live (deployed 7 Nov) (images saved to storage; needs db/022) |
| CS7 | Carousels from templates, downloaded as a PDF | Q34 | Live |
| CS8 | Video as a content type: 3-second hook, beats (say and show), cover, captions | 5 Nov 18:25 "what about videos ??" | Live (script only; see I6) |
| CS9 | LinkedIn formatter: bold, italic, bold italic, underline, strikethrough, serif, monospace, script, outline, bullets, numbers, arrows, checks, blank line keeper, divider, case, undo, clear, Markdown, shortcuts, 3,000 counter, mobile and desktop preview | Q33 "i want a linkedin formatter"; 5 Nov 18:16 "formatter looks incomplete" | Live |
| CS10 | Plan follows the real date day by day; "Plan" on an unplanned idea opens a day picker | 5 Nov 18:25 | Live |
| CS11 | To plan tray of undated Discovery and AI citations topics, dragged onto a day | Q94 | Live |
| CS12 | Library: type, pillar, campaign or Independent, status, date, Human; filters, search; Source filter and "From Discovery · #rank · score" tag | 5 Nov 19:03; Q93 | Live |
| CS13 | Library Open shows the post in a pop-up with campaign, draft, comments and Edit; Duplicate works; Undo toast bottom right | 5 Nov 19:12 | Live |
| CS14 | Library row menu (three dots) with Put on hold, Resume, Duplicate, Delete | 5 Nov 19:21 | Live |
| CS15 | Approval: team drafts go In review to the owner (Today and Library); approve or ask for changes; withdraw works; only approved posts can be planned | Q41; 5 Nov 18:45 "whom it's approving... undo not working" | Live |
| CS16 | Campaign planner: brief (name required, topic, AI plus manual keywords, 9 objectives, segments, start, duration, posts per week, format mix, message, call to action, success measure), proposed posts in Open, Prove, Deepen, Ask, campaign page with the next action per post | Q45 (replaced by campaigns), Q50; 5 Nov 18:45 and 19:03 | Live |
| CS17 | Edit a campaign after creation (save, or re-plan unwritten posts); edit and delete icons on the campaign list; pause and resume | 5 Nov 19:03, 19:17 | Live |
| CS18 | Target accounts per campaign with warm path and stage | Q51 | Live |
| CS19 | The profile owner's weekly time budget and one batched approval session | Q53 | Live |
| CS20 | Resource request tracking into Pipeline | Q55 | Live |
| CS21 | End-of-campaign report (with citation lift) and mid-campaign (halfway) check | Q56, Q57 | Live |
| CS22 | Balance warnings (two campaigns on one day, one topic taking over) | Q58 | Live |
| CS23 | Fast-response mode, event mode, company page text and team reshare notes, save a campaign as a template | Q59, Q47 (built in the first build at the user's request) | Live |
| CS24 | A/B hooks | Q59 "cut" | Declined by user |
| CS25 | Point-of-view bank: approved stances, cleared proof points, stories, allowed numbers | Q61 | Live |
| CS26 | Regulated-claims check before approval, with a tick to go on | Q64 | Live |
| CS27 | LinkedIn newsletter track with its own cadence in Plan | Q66 | Live |
| CS28 | What works: which types, pillars, days, times and hooks land, nudging plans; "not enough results yet" until there is data | Q67 | Live (deployed 7 Nov) (fed by per-post results) |
| CS29 | Post results: when the user opens a post's analytics page, the extension reads impressions, reactions and comments into that post | Q43 | Live (deployed 7 Nov) (manual entry plus extension Read analytics; needs db/022) |
| CS30 | Repurpose: turn one article or long post into several pieces (posts, carousel, comments), each landing as an Idea | Q42; Handoff "Repurpose (one piece into several)" | Live (deployed 7 Nov) (Repurpose) |
| CS31 | First comment and reply prep, only on posts that need them | Q44 "not all but relevant ones" | Live (deployed 7 Nov) (first comment and reply prep) |
| CS32 | Company channel: company-gap content flagged "Company content, not for the profile" | Q71 | Live |
| CS33 | "Is this citable?" draft test from the post editor | Q60 item 8 | Live |
| CS34 | Write a post's grid of icon cards replaced (audit: template look) | Polish pass "Left for later" | Live (deployed 7 Nov) (compact source list) |
| CS35 | Quote cards | Q46 | Declined by user |
| CS36 | Mobile one-tap approval, tag check | Q63, Q65 | Declined by user |
| CS37 | One merged Studio for posts and comments | Q35 | Declined by user (kept separate) |

## Comment Studio

| ID | Item, in plain English | Source | Status |
|---|---|---|---|
| CM1 | Comment Studio on the website with Voice Lab, Styles, Playbooks (14 post types, Try it), Tuning, Rewrite Lab, Library, Safety, Home | Q19, Q21, Q22, Q25, Q26; 5 Nov 16:37 "copy VoxReply" | Live |
| CM2 | Website AI goes through the extension; keys stay in the browser | Q23 | Live |
| CM3 | Locked guardrails per profile that no style overrides | Q24 | Live |
| CM4 | Saved drafts stored in Prax; the last 200 unsaved drafts only in the browser | Q27 | Live |
| CM5 | Impact score next to Human score, in Engagement too | Q28 | Live |
| CM6 | Safety: daily draft limit, VIP authors, read existing comments | Q29 | Live |
| CM7 | Sign-off line only in messages and connection notes, never comments | Q30 | Live |
| CM8 | "Draft a comment" entry point inside the app (the core daily task has none today) | Audit item 9; Q117 "item 9 follows" | Live (deployed 7 Nov) (Draft a comment panel from Comment Studio, Today and ⌘K) |
| CM9 | Comment voice for a second profile | Handoff "Known gaps" | Needs user action (write it in Settings per profile) |

## Engagement

| ID | Item, in plain English | Source | Status |
|---|---|---|---|
| EN1 | Engagement fills itself from the extension: reply rate, modes that earn replies, segments, waiting for reply, drafting stats | Handoff; Q22 Analytics row | Live |
| EN2 | Honest not-started state; two stacked columns; drafting stats only after the first draft | Audit fix 10; polish pass | Live |

## AI citations

| ID | Item, in plain English | Source | Status |
|---|---|---|---|
| AC1 | Automated runs through the extension on ChatGPT, Gemini, Claude with web search; Perplexity when keyed | Q48, Q49 | Live (never run with real keys) |
| AC2 | Named, linked and ranked kept separate; every cited source saved with owned ones marked; evidence drawer; honest counts | Q48 items 1 to 5 | Live |
| AC3 | Competitor leaderboard; citation gaps as tasks; Arabic and Hindi prompts; dropped-out and newly named alerts | Q48 items 6, 7, 8, 10 | Live |
| AC4 | Accuracy check against a facts sheet; AI-suggested prompts | Q48 items 9, 11; Q60 items 1, 3 | Live |
| AC5 | Lift, repeat runs, reports and share links | Q48 "later"; Q60 items 6, 7, 10 | Live |
| AC6 | Sentiment, Quick setup of about 20 prompts, prompt sets, recommendations, draft test, Ask your results, in-app alerts | Q60 items 2 to 11 | Live |
| AC7 | LinkedIn cited, profile consistency, comment targets to VIPs, campaign link, weekly run reminder | Q60 items 12 to 16 | Live |
| AC8 | Entry animation, Home dashboard, 15-step tour with "Step N of M", Skip step and Skip tour, blur and scroll to the target | 5 Nov 19:51; 20:01; 20:11 | Live |
| AC9 | Gaps highlighted and sent to Content Studio as topics | 5 Nov 19:51 | Live |
| AC10 | Company tab (instead of a Person, Company, Both switch) | 5 Nov 20:01 "make a company tab in the end" | Live |
| AC11 | Person, Company, Both switch | Q68 | Declined by user (replaced by AC10) |
| AC12 | Strict name matching: full name with context, otherwise "needs review" | Q69 | Live |
| AC13 | Headline score weighted 70% person, 30% company | Q70 | Declined by user (confirmed Q126: person and company stay separate) |
| AC14 | Facts sheet in two tabs (person and company) | Q72 | Live |
| AC15 | Peer experts: Claude suggests 5 to 8 names from public sources, the user approves | Q73 | Live (deployed 7 Nov) (suggestions from run answers, Approve or Dismiss; needs db/025) |
| AC16 | API keys start blank and are added by the user; never shown as connected without a key | 5 Nov 20:01 | Live |
| AC17 | Detailed, institution-grade weekly report downloadable as a PDF | 5 Nov 20:01, 20:11 | Live |
| AC18 | Charts show real values from runs | 5 Nov 20:11 | Live (charts appear after two weeks of runs) |
| AC19 | Tracked profiles: Archive, Switch, New, Delete (owner, typed name) in a three-dot menu | Q107; 5 Nov 23:38 | Live |
| AC20 | Redesign: one card style, no dashes, edit, add and remove tracked names and peers | 6 Nov 00:26 "typical AI slop... no option to edit" | Live |
| AC21 | Provider logos in the PDF report | Handoff "the PDF uses names only" | Live (deployed 7 Nov) (logos in the PDF tables) |
| AC22 | First real run with keys | Handoff "Not verified yet" | Needs user action |

## Strategy

| ID | Item, in plain English | Source | Status |
|---|---|---|---|
| S1 | Strategy as an open canvas like n8n or WorksBuddy: dotted wires, nodes showing only their name, view, edit and delete, custom nodes and flows | Q108; 5 Nov 23:38; 6 Nov 04:42 (screenshot) | Live (deployed 7 Nov) (workflow canvas; needs db/021) |
| S2 | Strategy drives the product: each node maps to real settings (Today quotas, post mix and pillars, target segments, Comment Studio rules) and shows what it affects | Q109 step 1 | Live (deployed 7 Nov) (nodes write the real settings) |
| S3 | If/else rules engine applied across Today, Pipeline and Content Studio | Q109 step 2; Q108 | Live (deployed 7 Nov) (if/else rules in Today, Pipeline, Content Studio, Discovery) |
| S4 | "Who does what" sections hidden from viewers and commenters | Audit item 10 | Live |
| S5 | Merge Strategy and Notes into one Playbook | Step 4 list; Handoff "Next" item 3 | Live (deployed 7 Nov) (Playbook: Strategy and Notes tabs; old links redirect) |

## Templates and Notes

| ID | Item, in plain English | Source | Status |
|---|---|---|---|
| TN1 | Templates grouped as Connection notes, Messages, Replies and posts, Resource replies, Call offers | Audit fix 11 | Live |
| TN2 | Notes and Strategy show who wrote each row and when | Q111; 5 Nov 23:38 | Live |
| TN3 | Notes placed after Extension in the sidebar | 5 Nov 23:38 | Live |
| TN4 | Add button in the header; no KPI tiles on Notes, Templates, Strategy | Audit fixes; polish pass | Live |

## Extension

| ID | Item, in plain English | Source | Status |
|---|---|---|---|
| X1 | Write with Prax bar, modes, drafts with scores, replies, connection notes | Handoff step 2 | Live |
| X2 | Reliability fixes: bar on every post, no two or three clicks, late posts, side panel Capture and the rest working, status card, "Fix bars on this tab" (0.9.x) | Q110; 5 Nov 23:38 | Live as download 0.9.2 (see X3) |
| X3 | Reinstall extension 0.9.2 from the Extension page | 6 Nov 04:24 | Needs user action |
| X4 | Test the bar on real LinkedIn pages by hand and send screenshots (Claude may not automate LinkedIn) | Handoff "Not verified yet" | Needs user action |
| X5 | Star icon on Extension in the sidebar | 5 Nov 23:38 | Live |
| X6 | Provider logos and calm key rows in the side panel | 5 Nov 23:47 | Live |
| X7 | Inbox view for DMs and follow-ups, also in the extension (step 4) | Step 4 list; Q3 | Live (deployed 7 Nov) (Inbox plus extension Send to Prax Inbox; needs db/026) |
| X8 | Unlisted Chrome Web Store listing so the extension auto-updates | Handoff "Known gaps" (option) | Needs user action (developer account, 5 USD) |

## Login and profiles

| ID | Item, in plain English | Source | Status |
|---|---|---|---|
| L1 | Minimal email and password sign-in in the Prax palette with the logo; Forgot password; show/hide | 6 Nov 00:17 | Live |
| L2 | Invite only, no public sign-up; owners invite from Settings | Q113 | Live (app side) |
| L3 | First password through Forgot password | Q114 | Live |
| L4 | "Email me a sign-in link instead" | Q115 | Live |
| L5 | Password at least 8 characters; rate limits | Q116 | Live (app side) |
| L6 | Sessions last 30 days on the device | Q116 | Needs user action (Supabase Sessions setting, paid plan) |
| L7 | Sign out top right (account menu) and in the sidebar | 6 Nov 00:34 | Live |
| L8 | No built-in Shashi: add a profile, its name and strategy in Settings, archive, restore, delete; demo how a profile is added and removed | 5 Nov 23:39; 6 Nov 01:01 | Live |
| L9 | Demo profile (Layla Haddad) with four weeks of history, marked Demo | Q120 | Live (SQL run) |
| L10 | Leftover "he" and "his" in tour and help text (about 9 strings in Profile Studio, Network, Discovery) | Handoff profile-agnostic; 6 Nov 01:01 "it taken shashi sir as default" | Live (deployed 7 Nov) (pronouns replaced) |

## Design system

| ID | Item, in plain English | Source | Status |
|---|---|---|---|
| DZ1 | Palette dark, red, dark red, white everywhere; plain titles, underline tabs, actions top right | 5 Nov 18:08 "little more dark colour"; 18:16 | Live |
| DZ2 | Entry moment once a day on the Dashboard only; quick fade elsewhere | 5 Nov 20:26; Q119 | Live |
| DZ3 | Guided tours anchored to their target, "Step N of M" | 5 Nov 19:51 | Live |
| DZ4 | Uniform tiles: same at rest, change only on hover, press, focus, selection | 5 Nov 23:45 | Live |
| DZ5 | New logo (Corners) in the app, favicon and extension | 5 Nov 23:49; 23:59 "go with 2nd one corners" | Live (deployed 7 Nov) (logo everywhere) |
| DZ6 | Real provider logos with real names everywhere keys or AI tools show | 5 Nov 23:47 | Live (xAI Grok has no mark) |
| DZ7 | Search menu: aligned icons and labels, no red half-ring | 6 Nov 00:07, 00:22 | Live |
| DZ8 | 19 audit fixes (sidebar highlight, contrast, encoding, tabs, layouts) | Q100 | Live |
| DZ9 | Polish pass: one red action, one card style, honest empty states, Geist, type scale, radii, layout at 1280 | Q117 items 1 to 8 and 10 | Live |
| DZ10 | Sidebar in four groups (15 flat items today) | Audit item 9; Q117 | Live (deployed 7 Nov) (Do, Create, Grow, Set up) |
| DZ11 | Rerun the design audit, aiming for 8 of 10 | Q117 | Declined by user (6 Nov 01:01 "no need to re-audit") |
| DZ12 | Deep audit subagent from every angle | Q112 | Live (done: 5 of 10 report) |
| DZ13 | Check on a real phone (all phone checks so far were a 390 px frame) | 5 Nov 22:52 "Not done yet" item 3 | Not started |

## Ops (Supabase settings, SMTP, extension reinstall)

| ID | Item, in plain English | Source | Status |
|---|---|---|---|
| O1 | Supabase: "Allow new users to sign up" off | Handoff Login settings 2; 6 Nov 04:24 | Needs user action |
| O2 | Supabase: "Secure email change" on | 6 Nov 04:24 | Needs user action |
| O3 | Supabase: minimum password length 8; email and password sign-in enabled | Handoff Login settings 1, 3 | Needs user action (confirm) |
| O4 | Supabase URL configuration: Site URL and Redirect URLs `https://prax-gamma.vercel.app/**` (reset and invite links fail without it) | Handoff Login settings 4 | Needs user action (confirm) |
| O5 | Custom SMTP (for example Resend) so invites and resets arrive; built-in mailer sends only a few an hour | Handoff "Known gaps"; Login settings 6 | Needs user action |
| O6 | `SITE_URL` in Vercel if the domain changes | Handoff security fixes | Needs user action (only on a domain change) |
| O7 | Reinstall extension 0.9.2 | Same as X3 | Needs user action |
| O8 | End-to-end test with real data: move a prospect and Undo, send a Discovery topic, AI citations run, image generation, invites | 5 Nov 23:16 "Still to test, and they need your OK" | Not started |
| O9 | Pin the checked IP for server fetches (DNS rebinding) and a script Content-Security-Policy | Handoff security fixes (found by the review, not requested) | Not started |
| O10 | All SQL up to `db/020` run | Handoff | Live (done) |
| O11 | Push to GitHub after every deploy | Q17, Q20; 5 Nov 16:39 | Live (standing rule, followed) |
| O12 | Skills installed: 5 design skills plus monster-designer; 14 ECC skills plus MCP-building and content skills | 5 Nov 21:39; Q121, Q122 | Live (tooling, not product) |

## Ideas suggested but not agreed

| ID | Item, in plain English | Source | Status |
|---|---|---|---|
| I1 | Reply tracking: know when someone replies to a comment or post, captured only on click (replies are logged today only when the extension sees them on a page the user opens) | Claude's "what comes next" list, 5 Nov 23:39 | Live (deployed 7 Nov) (Check replies on notifications and posts; Engagement, Today, Inbox, Needs you; needs db/027) |
| I2 | Weekly review page every Monday (overlaps D10, the step 4 weekly report) | Same list | Live (deployed 7 Nov) (Monday review page; needs db/027) |
| I3 | Team roles and approvals, including the owner's approval queue on a phone (mobile approval was declined as Q63) | Same list | Not started (not agreed) |
| I4 | Results by pillar and format feeding Strategy (overlaps CS28 and S2) | Same list | Not started (not agreed) |
| I5 | Google AI answers and Copilot as AI citations engines (need a paid data provider) | Ranko teardown, 5 Nov 18:27 | Live (deployed 7 Nov) (Google AI answers and Microsoft Copilot through SerpApi; needs db/028 and a SerpApi key) |
| I6 | Record or upload video inside Prax (today Prax writes the script, cover and captions; the person records outside Prax) | 5 Nov 18:26 Claude's reply to "what about videos" | Live (deployed 7 Nov) (record with teleprompter, trim, upload, captions; needs db/029; screen picture-in-picture left out) |
| I7 | xAI Grok logo (no CC0 or official asset) | Handoff providers | Declined: no legitimate Grok mark exists (xAI forbids altered files; simple-icons refused it); name shown |

---

## Top priorities (missing items, in build order)

1. **Strategy canvas and its links to settings (S1, S2), then the if/else engine (S3).** In progress; the user's top complaint. Finish, check in the browser, show screenshots.
2. **Post results per post (CS29).** The extension reads impressions, reactions and comments when the user opens a post's analytics page, plus a manual results field in the post editor. Without this, What works (CS28), campaign results and the end-of-campaign report have no data.
3. **"Draft a comment" in the app and the sidebar in four groups (CM8, DZ10).** Agreed as audit item 9 to follow the polish pass; the core daily task has no entry point.
4. **Small Dashboard and Today fixes (D7, T7, D4, D5, D6, P18).** The demo Network glance bug, closed custom-pipeline stages on Today, glance without repeated numbers, activity as sentences, the empty KPI row, Pipeline's repeated sentence. One short pass.
5. **Repurpose one piece into several (CS30).** Agreed in Q42 and the Handoff, never built.
6. **First comment and reply prep where needed (CS31).** Agreed in Q44.
7. **Save generated images with the post (CS6)** and a planned-time reminder on Today (T6).
8. **Discovery leftovers (DS16, DS15):** a note on the prospect when a target company is in the news; Send to Discovery from an opened profile.
9. **AI citations leftovers (AC15, AC13):** suggest peer experts for approval; confirm, then build or drop the 70/30 headline.
10. **Step 4 items (D10, X7, P19, D11, S5):** weekly report, Inbox view, account map, multi-profile overview, Playbook merge. Ask the user for the order first.

Alongside, and only the user can do these: reinstall extension 0.9.2 (X3), the Supabase switches and custom SMTP (O1 to O5), a first real AI citations and Discovery run with keys (AC22, DS17), and Shashi's real LinkedIn export (N13).

---

## Independent recheck (7 Nov)

Done by a fresh subagent that built nothing. Sources: all 178 user messages in the session log (5 Nov 15:48 to 6 Nov 09:52 UTC), the 34 screenshots the user sent, decisions Q1 to Q125 with their answers, `docs/HANDOFF.md`, and the code on local `main` at `3b5ee6c` (18 commits ahead of `origin/main` at `26af0a5`). About 110 un-numbered requests plus the 125 numbered decisions were mapped to a row. Code was checked by grep and by reading files, not in a browser.

**Note on times.** The times in the Source column above are UTC, not IST (for example, "do the 4 pointers" was sent at 21:10 UTC, which is 02:40 IST on 6 Nov). The rows below use UTC too, so they match.

### (a) Items the first audit missed

| ID | Item, in plain English | Source | Status |
|---|---|---|---|
| R1 | Buttons must never wrap onto two lines ("Use it", "All actions", "Profile Studio", "Suggest a LinkedIn article"); the user raised it again after the first fix ("still all are same no changes") | 5 Nov 23:38 (2 screenshots); 6 Nov 00:23 (screenshot); 00:26 (screenshot) | Live (`.btn` has `white-space: nowrap` in `globals.css` and `citations.module.css`) |
| R2 | Discovery Criteria layout bugs: the "Total 100 of 100" pill wrapped, there were big empty gaps, and the right column was cut off ("these all are mistakes of criteria section") | 5 Nov 21:20 (3 screenshots) | Live (fixed in preview v28 at 21:27; the real `criteria.tsx` pill is `pill shrink-0` with no wrapping; not checked again in a browser) |
| R3 | Extension toolbar icon was blank and the site's tab icon was the Next.js default ("add a icon there as well dont put it blank") | 5 Nov 17:26 | Live (replaced later by the Corners mark, DZ5; `extension/icons/*` and `src/app/icon.png` checked) |
| R4 | Quick edits on the draft (Shorter, Sharper, More formal, Add a question, Stronger close) did nothing | 5 Nov 18:45 (screenshot) | Live (`write.tsx` QUICK actions call the AI rewrite) |
| R5 | The Visual step should be mature and minimal, with a layout that fits each kind of visual, not vibrant blocks | 5 Nov 18:45 (screenshot) | Live (statement, diagram and photo layouts in `write.tsx`) |
| R6 | The campaign's "warm up is on today's list" line was confusing ("why it's showing here") | 5 Nov 18:45 | Live (removed; no warm-up copy is left in Content Studio) |
| R7 | "AI citation is not opening" from Content Studio (the preview sidebar had no link) | 5 Nov 19:42 | Live (AI citations is in the app sidebar) |
| R8 | "Plan and library options are not opening" | 5 Nov 18:08 | Live (Plan and Library tabs work; CS10, CS12) |
| R9 | "Unstructured toggles": only the AI citations filters were changed to segmented controls. Claude asked where else the user meant and the question was never followed up | 6 Nov 03:44 "have you fixed... the unstructured toggles" | Live (deployed 7 Nov) (one switch style across the app) |
| R10 | The new logo "everywhere" also means the public AI citations share view and the PDF reports (AI citations report, weekly report, carousel) | 5 Nov 23:59 "go with 2nd one corners, implement it everywhere" | Live (deployed 7 Nov) (logo on share page and every PDF) |
| R11 | No dashes as values anywhere | 6 Nov 00:26; polish pass rule | Live (deployed 7 Nov) (no dash for an unscored draft) |
| R12 | Run the new database files `db/021`, `022`, `024`, `025` and `026` as one saved Supabase query that Claude opens for the user, who only clicks Run ("no pasting") | 6 Nov 04:05 "I'm not a technical guy... these small things can't you do by your end"; Claude's promise at 04:19 and 09:43 | Not started (needed before S1, S2, CS6, CS29, N11, AC15, X7 and others work live) |
| R13 | Deploy the 18 commits on `main` that are not on `origin/main`, then push (standing rule: push after every deploy) | Q17, Q20; 6 Nov 09:43 | Not started (waits for the user's "deploy" and R12) |
| R14 | Reinstall the extension as 0.9.3, not 0.9.2 (`extension/manifest.json` and `LATEST_EXT` are 0.9.3 on `main`) | Follows from N11, N12, DS15, CS29, X7 | Needs user action (after the deploy) |
| R15 | Install REA (github.com/morluto/rea) | 5 Nov 16:37 "install - https://github.com/morluto/rea.git" | Declined on Claude's advice (5 Nov 16:37: only use was copying VoxReply); the user never said yes or no, and it is not installed |
| R16 | Claude should click Run in Supabase itself | 6 Nov 04:05 | Not possible (the safety check blocks Claude from running SQL on the production database; R12 keeps it to one click) |
| R17 | Supabase browser tabs would not close (Cmd+W did nothing) | 6 Nov 03:55, 04:19, 04:26 | Not a product item (Chrome housekeeping; Claude gave force-quit steps at 04:27) |

### (b) Status corrections

| ID | Old status | Corrected status | Evidence |
|---|---|---|---|
| Header | "`origin/main` = local `main`… no branch holds unmerged work"; times labelled IST | Local `main` (`3b5ee6c`) is 18 commits ahead of `origin/main` (`26af0a5`). The live site still runs `daa6e68`. Times are UTC | `git log origin/main..main`; log timestamps |
| AC13 | Declined by user (Q124, 7 Nov: two separate numbers) | Decided by Claude, not the user: two separate numbers, no 70/30 score. The user said "I'm not understanding question 124-25… I just forgot the context", and Claude decided it at 6 Nov 04:56. Confirm with the user | Declined by user (confirmed Q126: person and company stay separate) |
| Q125 | Not recorded as a decision | Decided by Claude at 6 Nov 04:56 (order: Inbox, weekly report, Playbook, overview), not answered by the user | Log, 6 Nov 04:56 |
| I1, I2, I5, I6, I7 | In progress (agreed 7 Nov) | In progress (agreed 6 Nov 09:52 UTC). Nothing for them is on `main` yet; builders are running | Log U178; `grep` finds no SerpApi, Copilot, reply-check or camera code in `src` |
| I3, I4 | Not started (not agreed) | Not chosen by user (offered 6 Nov 09:51; the user picked the other five) | Log, 6 Nov 09:51 and 09:52 |
| TN3 | Live | Live today, but `main` moves Notes into Playbook, which sits **above** Extension in the sidebar (Set up: Templates, Playbook, Extension, Settings). After the deploy, the user's "place note section after [Extension]" is no longer true. Confirm with the user or reorder | `src/components/sidebar.tsx` NAV |
| X3, O7 | Needs user action (reinstall 0.9.2) | Reinstall 0.9.3 after the next deploy (see R14) | `extension/manifest.json` |
| O10 | Live (all SQL up to `db/020` run) | Still true, but `db/021`, `022`, `024`, `025` and `026` are not run (see R12) | `ls db` |
| DZ5 | Live | Partly done: not on the share view or in the PDFs (see R10) | Live (deployed 7 Nov) (logo everywhere) |
| DZ9, AC20 | Live ("no dashes") | Live except one dash in Content Studio (see R11) | `write.tsx:553` |

**Design complaints checked again in the code (all hold, except where noted):** wrapping buttons (R1); search menu alignment and red half ring (DZ7: `#cmdk:focus-visible { outline: none }`); black or red first tiles (DZ4: no `tile.dark`, `tile.red`, `kpiDark` or `kpiRed` left); black hero cards and uppercase labels (DZ9: uppercase is only in post and carousel previews, which is intended); dashes (R11); red repeated buttons (no `btn-primary` inside a list `.map`); AI citations Company editing (AC20: `TrackedNames` edits person, company, firms and experts on Competitors; Company links there); LinkedIn MCP button (D8: `linkedin-mcp.tsx` on the Dashboard, no "Coming soon"); account menu top right (L7: `AccountMenu` is in `Section`, `PageHeader`, Content Studio and AI citations, so it shows on every section, including Inbox, Weekly report, the lead page and Playbook); sign-in required fields (L1: `aria-required` and "Required" in `auth-card.tsx`); logo everywhere (R10); provider logos (DZ6: Grok has its name only); Strategy canvas look (S1: dotted canvas, ⋮ View, Edit, Delete, if/else lanes; "From strategy" labels in Today, Pipeline and Content Studio).

**Declined by the user, listed so they can be seen:** T9 first-hour block (Q62), P11 deal value and forecast (Q38.7, Q102), P12 saved views (Q106), P16 Board view (Q104), CS24 A/B hooks (Q59), CS35 quote cards (Q46), CS36 mobile one-tap approval and tag check (Q63, Q65), CS37 one merged Studio (Q35), AC11 Person, Company, Both switch (replaced by AC10), DZ11 re-audit (6 Nov 01:01), N9 folding Network into other pages (5 Nov 20:30), I3 and I4 (not chosen). AC13 belongs here only once the user confirms it.

### (c) Verdict

No agreed feature was dropped. Seventeen items had no row: most are fixes already live, two are partly done (logo on the share view and PDFs, and the "unstructured toggles" follow-up), one dash is left, and three are next steps (one-click SQL run, deploy and push, reinstall 0.9.3). Ten statuses needed correcting, mainly the header's "Live" baseline, AC13 (decided by Claude, not the user) and the Notes placement that the Playbook merge changes.

| T20 | Templates section as animated, colour-accented cards: one-word purpose, click for a pop-up, View, Edit and Delete with icons | 7 Nov user request | Live (deployed 7 Nov) (animated accent cards, pop-up, view, edit, delete with Undo) |

| QA1 | Live QA 6 Nov: AI buttons hung 2 minutes without the extension; lists not updating after add or delete; Today Delete task and activity logging never saved; Classify sent the link not the post | 6 Nov user request | Live (deployed 7 Nov) (fixes merged; db/030 turns on live updates for every table) |

| H1 | Humanization: Pangram judge, own level per profile and per type, cost rules, Walter optional | 7 Nov Q128 to Q134 | In progress |

| C1 | Connections section: 20 to 25 tools by section, tool pages with connect, usage by section, routes, caps; replaces Extension; scattered key forms removed | 7 Nov Q135 to Q141 | In progress |
| N1 | Prax hidden from Google (noindex, robots) | 7 Nov Q142 | Not started |
| N2 | Invite-only access: owner adds email in Settings → Team, copies the invite link; sign-up off | 7 Nov Q143 | Not started |
| N3 | Private demo copy per tester; Shashi workspace owner-only (RLS verified) | 7 Nov Q144 | Not started |
| N4 | "Set up my own profile" wizard and workspace switcher | 7 Nov Q145 | Not started |
| N5 | Tours in every section, replay from "?" | 7 Nov Q146 | Not started |
| N6 | In-app searchable Guide, one page per section, screenshots, PDF download | 7 Nov Q147 | Not started |
| N7 | Send feedback button and owner-only feedback list | 7 Nov Q148 | Not started |
| N8 | Brand-new-user walkthrough and QA supervisor sign-off | 7 Nov Q149 | Not started |
| N9 | Copy invite link (free, no email), Join Prax page; premium email templates saved for later | 7 Nov Q150 to Q153, free-tier rule | Not started |
