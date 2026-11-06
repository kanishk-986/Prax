// Runs db/027_replies_review.sql in Postgres (PGlite) on stub tables, not Supabase: re-runnable, ext_replies_add
// (matching to logged comments, posts and leads, link checks, duplicates and cut-short copies, Reply back tasks, the
// token, the 50 cap) and weekly_reviews (Monday only, the plan list, RLS by role, saved_by). Skips without PGLITE:
//   PGLITE=/path/to/node_modules/@electric-sql/pglite node scripts/test-replies-sql.ts
import { readFileSync } from "node:fs";
const dir = process.env.PGLITE;
if (!dir) { console.log("skip set PGLITE to run db/027 in Postgres (PGlite)\n\nall passed"); process.exit(0); }
const { PGlite } = await import(dir + "/dist/index.js");
const sql027 = readFileSync(new URL("../db/027_replies_review.sql", import.meta.url), "utf8");
const db = new PGlite();
let fails = 0;
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log(`${ok ? "ok  " : "FAIL"} ${n}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`); };
await db.exec(`
create role anon; create role authenticated;
create schema auth; create table auth.users(id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create publication supabase_realtime;
create table workspaces(id uuid primary key default gen_random_uuid(), slug text, name text not null);
create table members(workspace_id uuid, user_id uuid, role text);
create or replace function role_rank(r text) returns int language sql immutable as $$ select case r when 'owner' then 4 when 'editor' then 3 when 'commenter' then 2 when 'viewer' then 1 else 0 end $$;
create or replace function has_role(ws uuid, min_role text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members m where m.workspace_id = ws and m.user_id = auth.uid() and role_rank(m.role) >= role_rank(min_role)) $$;
create table prospects(id uuid primary key default gen_random_uuid(), workspace_id uuid, name text, linkedin text default '', stage text default 'Target', warmth text default 'cold', company text default '', created_at timestamptz default now());
create table posts(id uuid primary key default gen_random_uuid(), workspace_id uuid, title text default '', url text default '', created_at timestamptz default now());
create table comment_log(id uuid primary key default gen_random_uuid(), workspace_id uuid, url text default '', text text default '', author text default '', reply boolean default false, replied_at timestamptz, prospect_id uuid, created_at timestamptz default now());
create table daily_items(id uuid primary key default gen_random_uuid(), workspace_id uuid, day date, kind text, idx int, title text default '', done boolean default false, link text default '', note text default '', prospect_id uuid, unique(workspace_id, day, kind, idx));
create or replace function comment_replied_at() returns trigger language plpgsql as $$ begin
  if new.reply and new.replied_at is null and (tg_op = 'INSERT' or not coalesce(old.reply, false)) then new.replied_at := now(); end if; return new; end $$;
create trigger comment_replied_at before insert or update of reply on comment_log for each row execute function comment_replied_at();
create or replace function match_prospect(ws uuid, url text, nm text) returns uuid language sql stable security definer set search_path = public as $$
  select id from prospects p where p.workspace_id = ws and (
    (coalesce(url,'') <> '' and p.linkedin <> '' and lower(p.linkedin) like '%' || lower(substring(url from 'linkedin\\.com/in/([^/?#]+)')) || '%')
    or (coalesce(nm,'') <> '' and lower(p.name) = lower(nm)))
  order by (p.linkedin <> '') desc limit 1 $$;
create or replace function ext_auth(tok text, out ws uuid, out uid uuid) language plpgsql as $$ begin
  if tok <> 'good' then raise exception 'invalid token'; end if;
  select id, '00000000-0000-0000-0000-0000000000aa'::uuid into ws, uid from workspaces where slug = 'shashi'; end $$;
insert into workspaces(slug, name) values ('shashi', 'Shashi Pal'), ('other', 'Other');
`);
const W = (await db.query("select id from workspaces where slug='shashi'")).rows[0].id;
const W2 = (await db.query("select id from workspaces where slug='other'")).rows[0].id;
await db.exec(sql027);
await db.exec(sql027); // re-runnable
eq("ran twice", true, true);
await db.query(`insert into prospects(workspace_id, name, linkedin) values ($1, 'Priya Nair', 'https://www.linkedin.com/in/priya-nair/'), ($2, 'Tom Becker', 'https://www.linkedin.com/in/tom-becker-123/')`, [W, W2]);
await db.query(`insert into comment_log(workspace_id, url, text, author) values ($1, 'https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000031/', 'In my view the settlement layer decides it', 'Amira Haddad'),
  ($1, 'https://www.linkedin.com/posts/x-activity-7390000000000000031-ab', 'An older comment on the same post', 'Amira Haddad')`, [W]);
await db.query(`insert into posts(workspace_id, title, url) values ($1, 'Controls', 'https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000021/'), ($2, 'Other profile post', 'https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000021/')`, [W, W2]);
const call = async (p) => (await db.query("select ext_replies_add('good', $1::jsonb) as r", [JSON.stringify(p)])).rows[0].r;
const batch = { day: new Date().toISOString().slice(0, 10), replies: [
  { kind: "comment_reply", name: "Priya Nair", url: "https://www.linkedin.com/in/priya-nair/", text: "Agreed, and the reconciliation work…", post_url: "https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000031/", at: new Date(Date.now() - 2 * 36e5).toISOString(), mine: "In my view the settlement layer decides it" },
  { kind: "post_comment", name: "Tom Becker", url: "https://www.linkedin.com/in/tom-becker-123/", text: "What about smaller banks?", post_url: "https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000021/", at: "" },
  { kind: "mention", name: "Hessa Al Marri", url: "javascript:alert(1)", text: "Shashi made the same point", post_url: "https://evil.example/x", at: "not a date" },
  { kind: "comment_reply", name: "Shashi Pal", text: "Thank you", post_url: "https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000031/" },
  { kind: "comment_reply", name: "", text: "x" },
] };
const r1 = await call(batch);
eq("first call", [r1.added, r1.known, r1.skipped, r1.comments, r1.posts, r1.tasks, r1.leads], [3, 0, 2, 1, 1, 1, ["Priya Nair"]]);
const rows = (await db.query("select person, kind, person_url, post_url, comment_log_id is not null as c, post_id is not null as p, prospect_id is not null as l from replies order by person")).rows;
eq("rows: unsafe links dropped, matched to comment, post and lead (Tom is a lead of another profile only)", rows.map((x) => [x.person, x.kind, x.person_url, x.post_url, x.c, x.p, x.l]), [
  ["Hessa Al Marri", "mention", "", "", false, false, false],
  ["Priya Nair", "comment_reply", "https://www.linkedin.com/in/priya-nair/", "https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000031/", true, false, true],
  ["Tom Becker", "post_comment", "https://www.linkedin.com/in/tom-becker-123/", "https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000021/", false, true, false]]);
const cl = (await db.query("select text, reply, replied_at is not null as at from comment_log order by text")).rows;
eq("the matching logged comment (by its text) is marked replied, the other is not", cl.map((x) => [x.text.slice(0, 10), x.reply, x.at]), [["An older c", false, false], ["In my view", true, true]]);
eq("own post stamped, the other profile's post is not", (await db.query("select title, replied_at is not null as r from posts order by title")).rows.map((x) => [x.title, x.r]), [["Controls", true], ["Other profile post", false]]);
eq("lead warmed", (await db.query("select name, warmth from prospects order by name")).rows.map((x) => [x.name, x.warmth]), [["Priya Nair", "warm"], ["Tom Becker", "cold"]]);
const task = (await db.query("select kind, idx, title, note like 'replyback:%' as n, link from daily_items")).rows;
eq("one Reply back task", task.map((x) => [x.kind, x.idx, x.title, x.n]), [["reply", 500, "Reply back to Priya Nair", true]]);
const r2 = await call({ ...batch, replies: [{ ...batch.replies[0], text: "Agreed, and the reconciliation work behind it is where most of the cost sits." }, batch.replies[1]] });
eq("second call: the same replies are known, no new tasks", [r2.added, r2.known, r2.tasks], [0, 2, 0]);
eq("the longer text replaces the cut one", (await db.query("select body from replies where person = 'Priya Nair'")).rows[0].body, "Agreed, and the reconciliation work behind it is where most of the cost sits.");
eq("still three rows", (await db.query("select count(*)::int as n from replies")).rows[0].n, 3);
const r3 = await call({ day: batch.day, replies: [{ kind: "post_comment", name: "Priya Nair", url: "https://www.linkedin.com/in/priya-nair/", text: "A second, different comment", post_url: "https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000021/" }] });
eq("a different reply from the same lead: a second task at the next index", [r3.added, r3.tasks, (await db.query("select max(idx) as m from daily_items")).rows[0].m], [1, 1, 501]);
const far = await call({ day: "2020-01-01", replies: [{ kind: "mention", name: "Priya Nair", url: "https://www.linkedin.com/in/priya-nair/", text: "third one", post_url: "" }] });
eq("a day far from today falls back to today", (await db.query("select count(*)::int as n from daily_items where day = current_date")).rows[0].n, 3); void far;
let bad = ""; try { await db.query("select ext_replies_add('nope', '{}'::jsonb)"); } catch (e) { bad = e.message; }
eq("bad token refused", bad.includes("invalid token"), true);
eq("no replies array is fine", (await call({})).added, 0);
const many = await call({ replies: Array.from({ length: 70 }, (_, i) => ({ kind: "mention", name: `Person ${i}`, text: `hello ${i}`, post_url: "" })) });
eq("at most 50 per call", many.added, 50);
eq("dedupe ignores case, spacing and a trailing ellipsis", (await db.query(`select reply_dedupe('', 'A B', '1', '', 'Hello,  World…') = reply_dedupe('', 'a b', '1', '', 'hello world') as s`)).rows[0].s, true);
eq("activity ids", (await db.query(`select li_activity('https://www.linkedin.com/posts/a-activity-7390000000000000044-AbCd') a, li_activity('urn%3Ali%3Aactivity%3A7390000000000000044') b, li_activity('nothing') c`)).rows[0], { a: "7390000000000000044", b: "7390000000000000044", c: "" });

// weekly_reviews: Monday only, plan must be an array, RLS by role.
await db.query("insert into weekly_reviews(workspace_id, week, keep, plan) values ($1, '2026-11-02', 'Comments on bank posts', '[{\"id\":\"a\",\"text\":\"x\",\"done\":false}]')", [W]);
let e1 = ""; try { await db.query("insert into weekly_reviews(workspace_id, week) values ($1, '2026-11-03')", [W]); } catch (e) { e1 = e.message; }
eq("week must be a Monday", e1.includes("weekly_reviews_monday"), true);
let e2 = ""; try { await db.query("insert into weekly_reviews(workspace_id, week, plan) values ($1, '2026-11-09', '{}')", [W]); } catch (e) { e2 = e.message; }
eq("plan must be a list", e2.includes("weekly_reviews_plan_array"), true);
const V = "00000000-0000-0000-0000-0000000000bb", E = "00000000-0000-0000-0000-0000000000cc";
await db.query("insert into members values ($1, $2, 'viewer'), ($1, $3, 'editor')", [W, V, E]);
await db.exec("grant select, insert, update, delete on weekly_reviews, replies to authenticated; grant usage on schema auth to authenticated; grant select on members to authenticated; grant execute on function auth.uid() to authenticated;");
await db.exec(`set role authenticated; select set_config('test.uid', '${V}', false);`);
eq("viewer reads the review", (await db.query("select count(*)::int n from weekly_reviews")).rows[0].n, 1);
eq("viewer reads replies", (await db.query("select count(*)::int n from replies")).rows[0].n > 0, true);
let e3 = ""; try { await db.query("update weekly_reviews set keep = 'x'"); const n = (await db.query("select keep from weekly_reviews")).rows[0].keep; if (n === "x") e3 = "changed"; } catch (e) { e3 = e.message; }
eq("viewer cannot change it", e3 !== "changed", true);
await db.exec(`select set_config('test.uid', '${E}', false);`);
await db.query("update weekly_reviews set stop = 'Long threads' where week = '2026-11-02'");
const saved = (await db.query("select stop, saved_by from weekly_reviews")).rows[0];
eq("editor saves, recorded as themselves", [saved.stop, saved.saved_by], ["Long threads", E]);
let e4 = ""; try { await db.query("insert into weekly_reviews(workspace_id, week) values ($1, '2026-11-09')", [W2]); } catch (e) { e4 = e.message; }
eq("not on another profile", /row-level security/.test(e4), true);
await db.exec("reset role");
console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
