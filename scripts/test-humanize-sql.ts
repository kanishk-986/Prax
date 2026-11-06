// Runs db/031_humanize.sql in Postgres (PGlite) on stub tables, not Supabase: re-runnable, settings defaults, the usage
// log with cost, job and section, the profile on screen checked against the token's user (two profiles), the results cache by hash, this month's sums, levels deciding passed or needs work,
// Walter as a rewrite, ext_save_draft keeping the badge, the token, and RLS by role. Skips without PGLITE:
//   PGLITE=/path/to/node_modules/@electric-sql/pglite node scripts/test-humanize-sql.ts
import { readFileSync } from "node:fs";
const dir = process.env.PGLITE;
if (!dir) { console.log("skipped (no PGlite): set PGLITE to run db/031 in Postgres"); process.exit(0); }
const { PGlite } = await import(dir + "/dist/index.js");
const sql = readFileSync(new URL("../db/031_humanize.sql", import.meta.url), "utf8");
const db = new PGlite();
let fails = 0;
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log(`${ok ? "ok  " : "FAIL"} ${n}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`); };
const V = "00000000-0000-0000-0000-0000000000a1", E = "00000000-0000-0000-0000-0000000000a2", O = "00000000-0000-0000-0000-0000000000a3";
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create publication supabase_realtime;
create table workspaces(id uuid primary key default gen_random_uuid(), slug text, name text not null);
create table members(workspace_id uuid, user_id uuid, role text);
create or replace function role_rank(r text) returns int language sql immutable as $$ select case r when 'owner' then 4 when 'editor' then 3 when 'commenter' then 2 when 'viewer' then 1 else 0 end $$;
create or replace function has_role_of(ws uuid, u uuid, min_role text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members m where m.workspace_id = ws and m.user_id = u and role_rank(m.role) >= role_rank(min_role)) $$;
create or replace function has_role(ws uuid, min_role text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members m where m.workspace_id = ws and m.user_id = auth.uid() and role_rank(m.role) >= role_rank(min_role)) $$;
create table posts(id uuid primary key default gen_random_uuid(), workspace_id uuid, title text default '');
create table saved_drafts(id uuid primary key default gen_random_uuid(), workspace_id uuid, kind text, text text, author text, post_url text, style text, post_type text, human int, impact int, source text, created_by uuid, created_at timestamptz default now());
create or replace function ext_auth(tok text, out ws uuid, out uid uuid) language plpgsql as $$ begin
  if tok <> 'good' then raise exception 'invalid token'; end if;
  select id, '${E}'::uuid into ws, uid from workspaces where slug = 'shashi'; end $$;
insert into workspaces(slug, name) values ('shashi', 'Shashi Pal'), ('other', 'Other'), ('third', 'Third');
`);
const W = (await db.query("select id from workspaces where slug='shashi'")).rows[0].id;
const W2 = (await db.query("select id from workspaces where slug='other'")).rows[0].id;
const W3 = (await db.query("select id from workspaces where slug='third'")).rows[0].id;
const hx = (c: string) => c.repeat(64); // a real SHA-256 is 64 hex characters
await db.query(`insert into members values ($1, '${V}', 'viewer'), ($1, '${E}', 'editor'), ($1, '${O}', 'owner')`, [W]);
await db.exec(sql);
await db.exec(sql); // re-runnable
eq("ran twice", true, true);
const state = async (p: unknown) => (await db.query("select ext_humanize_state('good', $1::jsonb) as r", [JSON.stringify(p)])).rows[0].r;
const record = async (p: unknown) => (await db.query("select ext_humanize_record('good', $1::jsonb) as r", [JSON.stringify(p)])).rows[0].r;

const s0 = await state({ hashes: [] });
eq("defaults before any settings: all off, cost 0.05", [s0.settings.level_post, s0.settings.pangram_cap, Number(s0.settings.pangram_cost_100), s0.usage.pangram, s0.results], [0, 0, 0.05, 0, {}]);
await db.query("insert into humanize_settings(workspace_id, level_comment, level_post, level_article, pangram_cap, walter_cap) values ($1, 70, 90, 90, 10000, 2000)", [W]);
const r1 = await record({ service: "pangram", kind: "post", hash: hx("1"), words: 250, score: 94, result: { score: 94, words: 250, flagged: [] }, section: "content_write" });
eq("record: cost from the rate, passed at level 90", [Number(r1.cost), r1.level, r1.outcome, Number(r1.used)], [0.125, 90, "passed", 250]);
const r2 = await record({ service: "pangram", kind: "comment", hash: hx("2"), words: 60, score: 65, result: { score: 65, words: 60, flagged: [{ start: 0, end: 10 }] }, section: "linkedin_bar" });
eq("record: needs work under the comment level", [r2.level, r2.outcome, Number(r2.used)], [70, "needs work", 310]);
const r3 = await record({ service: "walter", kind: "post", hash: hx("3"), words: 40, section: "nowhere" });
eq("record: Walter is a rewrite, no cache row", [r3.outcome, Number(r3.used)], ["rewrite", 40]);
const usage = (await db.query("select service, job, section, words, user_id from humanize_usage order by created_at, words desc")).rows;
eq("usage rows tagged with job and section (unknown section dropped)", usage.map((u) => [u.service, u.job, u.section, u.words]), [["pangram", "humanize_check", "content_write", 250], ["pangram", "humanize_check", "linkedin_bar", 60], ["walter", "humanize_rewrite", "", 40]]);
eq("usage rows carry the token's user", usage.every((u) => u.user_id === E), true);
const s1 = await state({ hashes: [hx("1"), hx("2"), "nope"] });
eq("state: month sums and the cache by hash", [s1.usage.pangram, s1.usage.walter, Object.keys(s1.results).sort(), s1.results[hx("1")].score, s1.results[hx("2")].result.flagged.length], [310, 40, [hx("1"), hx("2")], 94, 1]);
await record({ service: "pangram", kind: "post", hash: hx("1"), words: 250, score: 96, result: { score: 96 } });
eq("re-checking the same hash updates the cache row", [(await state({ hashes: [hx("1")] })).results[hx("1")].score, (await db.query("select count(*)::int n from humanize_results")).rows[0].n], [96, 2]);
await db.query(`insert into humanize_usage(workspace_id, service, words, day) values ($1, 'pangram', 999, (date_trunc('month', current_date) - interval '1 day')::date)`, [W]);
eq("last month's words are not counted", (await state({ hashes: [] })).usage.pangram, 560);
let bad = ""; try { await record({ service: "gpt", words: 1 }); } catch (e) { bad = (e as Error).message; }
eq("unknown service refused", /unknown service/.test(bad), true);
bad = ""; try { await record({ service: "pangram", hash: hx("4"), words: 5, score: 140 }); } catch (e) { bad = (e as Error).message; }
eq("a score over 100 is refused", /score out of range/.test(bad), true);
bad = ""; try { await record({ service: "pangram", hash: "h9", words: 5, score: 80 }); } catch (e) { bad = (e as Error).message; }
eq("a Pangram record needs a real text hash", /bad text hash/.test(bad), true);

// Two profiles: the token belongs to Shashi's profile; its user (E) also edits "other" and is only a viewer of "third".
await db.query(`insert into members values ($1, '${E}', 'editor'), ($2, '${E}', 'viewer')`, [W2, W3]);
await db.query("insert into humanize_settings(workspace_id, level_post, pangram_cap) values ($1, 50, 3000)", [W2]);
const o1 = await state({ hashes: [hx("1")], profile_id: W2 });
eq("the profile on screen wins: its level, cap and (empty) cache and usage", [o1.profile_id, o1.settings.level_post, o1.settings.pangram_cap, o1.usage.pangram, o1.results], [W2, 50, 3000, 0, {}]);
const o2 = await record({ service: "pangram", kind: "post", hash: hx("5"), words: 100, score: 60, result: { score: 60, flagged: [{ start: 0, end: 4 }] }, section: "content_write", profile_id: W2 });
eq("a record goes to the profile on screen, with its level", [o2.profile_id, o2.level, o2.outcome, Number(o2.used)], [W2, 50, "passed", 100]);
eq("the other profile's usage and cache are untouched", [(await state({ hashes: [hx("5")] })).results, (await state({ hashes: [] })).usage.pangram], [{}, 560]);
eq("and the second profile has its own cache row", Object.keys((await state({ hashes: [hx("5")], profile_id: W2 })).results), [hx("5")]);
bad = ""; try { await state({ hashes: [], profile_id: W3 }); } catch (e) { bad = (e as Error).message; }
eq("a profile the token's user only views is refused", /not an editor of that profile/.test(bad), true);
bad = ""; try { await record({ service: "pangram", hash: hx("6"), words: 5, score: 80, profile_id: "not-a-uuid" }); } catch (e) { bad = (e as Error).message; }
eq("a malformed profile id is refused", /unknown profile/.test(bad), true);
eq("no profile id means the token's own profile (the LinkedIn bar)", (await state({ hashes: [] })).profile_id, W);
const cacheText = (await db.query("select result::text t from humanize_results")).rows.map((r) => r.t).join(" ");
eq("cache rows in this test hold offsets only (the route writes toCache)", /"text"/.test(cacheText), false);

bad = ""; try { await db.query("select ext_humanize_state('bad', '{}'::jsonb)"); } catch (e) { bad = (e as Error).message; }
eq("bad token refused", /invalid token/.test(bad), true);
const did = (await db.query("select ext_save_draft('good', $1::jsonb) as id", [JSON.stringify({ kind: "comment", text: "In my view", humanize: { score: 94, level: 70, service: "pangram", passed: true, checked_at: "2026-11-07T10:00:00Z" } })])).rows[0].id;
eq("ext_save_draft keeps the badge", (await db.query("select humanize->>'score' s from saved_drafts where id = $1", [did])).rows[0].s, "94");
await db.query("select ext_save_draft('good', '{\"text\": \"x\", \"humanize\": \"junk\"}'::jsonb)");
eq("a non-object badge is stored as {}", (await db.query("select humanize from saved_drafts where text = 'x'")).rows[0].humanize, {});
eq("posts.humanize defaults to {}", (await db.query("insert into posts(workspace_id) values ($1) returning humanize", [W])).rows[0].humanize, {});
let chk = ""; try { await db.query("update humanize_settings set level_post = 120 where workspace_id = $1", [W]); } catch (e) { chk = (e as Error).message; }
eq("levels must be 0 to 100", /humanize_levels/.test(chk), true);

// RLS: viewers read, the owner sets levels and caps, editors log their own usage.
await db.exec("grant select, insert, update, delete on humanize_settings, humanize_usage, humanize_results to authenticated; grant usage on schema auth to authenticated; grant select on members to authenticated; grant execute on function auth.uid() to authenticated;");
await db.query("insert into humanize_settings(workspace_id) values ($1) on conflict do nothing", [W2]);
await db.exec(`set role authenticated; select set_config('test.uid', '${V}', false);`);
eq("viewer reads this profile's settings only", (await db.query("select count(*)::int n from humanize_settings")).rows[0].n, 1);
await db.query("update humanize_settings set level_post = 20");
eq("viewer cannot change the levels", (await db.query("select level_post from humanize_settings")).rows[0].level_post, 90);
let ins = ""; try { await db.query(`insert into humanize_usage(workspace_id, user_id, service, words) values ($1, '${V}', 'pangram', 10)`, [W]); } catch (e) { ins = (e as Error).message; }
eq("viewer cannot log usage", /row-level security/.test(ins), true);
await db.exec(`select set_config('test.uid', '${E}', false);`);
await db.query("update humanize_settings set level_post = 20");
eq("editor cannot change the levels either", (await db.query("select level_post from humanize_settings")).rows[0].level_post, 90);
await db.query(`insert into humanize_usage(workspace_id, user_id, service, words) values ($1, '${E}', 'pangram', 10)`, [W]);
ins = ""; try { await db.query(`insert into humanize_usage(workspace_id, user_id, service, words) values ($1, '${O}', 'pangram', 10)`, [W]); } catch (e) { ins = (e as Error).message; }
eq("editor logs usage as themselves only", /row-level security/.test(ins), true);
await db.query("insert into humanize_results(workspace_id, text_hash, score) values ($1, 'h9', 80)", [W]);
eq("editor fills the cache", (await db.query("select count(*)::int n from humanize_results where text_hash = 'h9'")).rows[0].n, 1);
await db.exec(`select set_config('test.uid', '${O}', false);`);
await db.query("update humanize_settings set level_post = 50");
eq("owner changes the levels", (await db.query("select level_post from humanize_settings")).rows[0].level_post, 50);
await db.exec("reset role");

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
