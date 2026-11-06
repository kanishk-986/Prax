-- 031: Humanization with Pangram (and Walter AI later), agreed 7 Nov 2026 (Q128 to Q134). Re-runnable; deletes nothing.
-- 1. humanize_settings: per profile, the level for comments, posts and articles (0 to 100; 0 means Pangram is never
--    called), the monthly word cap per service from the user's plan (0 = not entered, so no paid checks), and the cost
--    per 100 words (Pangram 0.05 by default, editable). Members read; the owner changes them.
-- 2. humanize_usage: one row per paid call (service, kind, words, cost, day, text hash, result, and the job and Prax
--    section it was for: humanize_check or humanize_rewrite; comment_studio, linkedin_bar, content_write or
--    content_editor). Members read; editors
--    add rows. Prax stores the hash, never the text.
-- 3. humanize_results: the cache, one Pangram result per profile and text hash, so unchanged text is never re-checked.
--    It keeps the score and the flagged sentences as character offsets into the normalised text, never the text.
-- 4. posts.humanize and saved_drafts.humanize (jsonb: score, level, service, checked_at, passed, hash, flagged).
-- 5. ext_humanize_state and ext_humanize_record for the extension (token checked by ext_auth). They act on the profile
--    on screen (p.profile_id) when the token's user is an editor there (has_role_of, the token-user form of has_role),
--    else on the token's own profile; and ext_save_draft again so drafts saved on LinkedIn keep their badge.
-- Keys for Pangram and Walter stay in the extension in each browser; nothing here holds a key.

-- 1. Settings.
create table if not exists humanize_settings (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  level_comment int not null default 0,
  level_post int not null default 0,
  level_article int not null default 0,
  pangram_cap int not null default 0,
  walter_cap int not null default 0,
  pangram_cost_100 numeric(10,4) not null default 0.05,
  walter_cost_100 numeric(10,4) not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
do $$ begin
  alter table humanize_settings add constraint humanize_levels check (level_comment between 0 and 100 and level_post between 0 and 100 and level_article between 0 and 100);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table humanize_settings add constraint humanize_caps check (pangram_cap >= 0 and walter_cap >= 0 and pangram_cost_100 >= 0 and walter_cost_100 >= 0);
exception when duplicate_object then null; end $$;

-- 2. Usage log.
create table if not exists humanize_usage (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid default auth.uid(),
  service text not null,
  kind text not null default 'post',
  words int not null default 0,
  cost numeric(10,4) not null default 0,
  day date not null default current_date,
  text_hash text not null default '',
  result text not null default '',
  score int,
  job text not null default 'humanize_check',
  section text not null default '',
  created_at timestamptz not null default now()
);
-- Usage tags for the Connections section (Q137): the job (humanize_check or humanize_rewrite) and the Prax section.
alter table humanize_usage add column if not exists job text not null default 'humanize_check';
alter table humanize_usage add column if not exists section text not null default '';
do $$ begin
  alter table humanize_usage add constraint humanize_usage_service check (service in ('pangram', 'walter'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table humanize_usage add constraint humanize_usage_kind check (kind in ('comment', 'post', 'article'));
exception when duplicate_object then null; end $$;
create index if not exists humanize_usage_month on humanize_usage (workspace_id, service, day);

-- 3. Results cache.
create table if not exists humanize_results (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  text_hash text not null,
  service text not null default 'pangram',
  score int not null,
  words int not null default 0,
  result jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  primary key (workspace_id, text_hash)
);

-- 4. The badge saved with a post or a draft.
alter table posts add column if not exists humanize jsonb not null default '{}'::jsonb;
alter table saved_drafts add column if not exists humanize jsonb not null default '{}'::jsonb;

-- RLS: members read; the owner sets the levels and caps; editors log usage and fill the cache.
alter table humanize_settings enable row level security;
alter table humanize_usage enable row level security;
alter table humanize_results enable row level security;
drop policy if exists hs_r on humanize_settings;
drop policy if exists hs_w on humanize_settings;
drop policy if exists hu_r on humanize_usage;
drop policy if exists hu_i on humanize_usage;
drop policy if exists hr_r on humanize_results;
drop policy if exists hr_w on humanize_results;
create policy hs_r on humanize_settings for select using (has_role(workspace_id, 'viewer'));
create policy hs_w on humanize_settings for all using (has_role(workspace_id, 'owner')) with check (has_role(workspace_id, 'owner'));
create policy hu_r on humanize_usage for select using (has_role(workspace_id, 'viewer'));
create policy hu_i on humanize_usage for insert with check (has_role(workspace_id, 'editor') and user_id = auth.uid());
create policy hr_r on humanize_results for select using (has_role(workspace_id, 'viewer'));
create policy hr_w on humanize_results for all using (has_role(workspace_id, 'editor')) with check (has_role(workspace_id, 'editor'));

do $$ begin alter publication supabase_realtime add table humanize_settings; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table humanize_usage; exception when duplicate_object then null; end $$;

-- 5. The extension's door.
-- Which profile a call is for: the page's profile (p.profile_id) when the token's user is an editor of it, the token's
-- own profile when none is given (the LinkedIn bar). Any other profile is refused.
create or replace function ext_humanize_ws(tok_ws uuid, tok_uid uuid, p jsonb) returns uuid
language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare pid text := coalesce(p->>'profile_id', '');
begin
  if pid = '' then return tok_ws; end if;
  if pid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'unknown profile'; end if;
  if not has_role_of(pid::uuid, tok_uid, 'editor') then raise exception 'not an editor of that profile' using errcode = '42501'; end if;
  return pid::uuid;
end $$;
revoke all on function ext_humanize_ws(uuid, uuid, jsonb) from public, anon, authenticated;

-- Settings (defaults when none are saved), this month's words and cost per service, and the cached results for the
-- hashes asked about (at most 60, one per article paragraph).
create or replace function ext_humanize_state(tok text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare a record; pw uuid; s humanize_settings; hashes text[]; m date := date_trunc('month', current_date)::date;
begin
  select * into a from ext_auth(tok);
  pw := ext_humanize_ws(a.ws, a.uid, p);
  select * into s from humanize_settings where workspace_id = pw;
  select coalesce(array_agg(h), '{}') into hashes from (select jsonb_array_elements_text(coalesce(p->'hashes', '[]'::jsonb)) h limit 60) x;
  return jsonb_build_object(
    'settings', jsonb_build_object(
      'level_comment', coalesce(s.level_comment, 0), 'level_post', coalesce(s.level_post, 0), 'level_article', coalesce(s.level_article, 0),
      'pangram_cap', coalesce(s.pangram_cap, 0), 'walter_cap', coalesce(s.walter_cap, 0),
      'pangram_cost_100', coalesce(s.pangram_cost_100, 0.05), 'walter_cost_100', coalesce(s.walter_cost_100, 0)),
    'usage', jsonb_build_object(
      'pangram', (select coalesce(sum(words), 0) from humanize_usage where workspace_id = pw and service = 'pangram' and day >= m),
      'walter', (select coalesce(sum(words), 0) from humanize_usage where workspace_id = pw and service = 'walter' and day >= m)),
    'results', coalesce((select jsonb_object_agg(r.text_hash, jsonb_build_object('score', r.score, 'words', r.words, 'result', r.result, 'checked_at', r.checked_at))
      from humanize_results r where r.workspace_id = pw and r.text_hash = any(hashes)), '{}'::jsonb), 'profile_id', pw);
end $$;

-- One paid call: the usage row (cost from the profile's rate) and, for Pangram, the cached result.
create or replace function ext_humanize_record(tok text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare a record; s humanize_settings; svc text := p->>'service'; k text := coalesce(p->>'kind', 'post');
  w int := greatest(0, least(coalesce((p->>'words')::int, 0), 200000)); sc int := (p->>'score')::int; h text := left(coalesce(p->>'hash', ''), 64);
  rate numeric; lvl int; c numeric; outcome text; m date := date_trunc('month', current_date)::date; pw uuid;
  sec text := case when p->>'section' in ('comment_studio', 'linkedin_bar', 'content_write', 'content_editor') then p->>'section' else '' end;
begin
  select * into a from ext_auth(tok);
  pw := ext_humanize_ws(a.ws, a.uid, p);
  if svc not in ('pangram', 'walter') then raise exception 'unknown service'; end if;
  if k not in ('comment', 'post', 'article') then k := 'post'; end if;
  if sc is not null and (sc < 0 or sc > 100) then raise exception 'score out of range'; end if;
  if svc = 'pangram' and h !~ '^[0-9a-f]{64}$' then raise exception 'bad text hash'; end if;
  select * into s from humanize_settings where workspace_id = pw;
  rate := case when svc = 'pangram' then coalesce(s.pangram_cost_100, 0.05) else coalesce(s.walter_cost_100, 0) end;
  lvl := case k when 'comment' then coalesce(s.level_comment, 0) when 'article' then coalesce(s.level_article, 0) else coalesce(s.level_post, 0) end;
  c := round(w / 100.0 * rate, 4);
  outcome := case when svc = 'walter' then 'rewrite' when sc is null then 'failed' when sc >= lvl then 'passed' else 'needs work' end;
  insert into humanize_usage(workspace_id, user_id, service, kind, words, cost, text_hash, result, score, job, section)
  values (pw, a.uid, svc, k, w, c, h, outcome, sc, case when svc = 'walter' then 'humanize_rewrite' else 'humanize_check' end, sec);
  if svc = 'pangram' and sc is not null and h <> '' then
    insert into humanize_results(workspace_id, text_hash, service, score, words, result, checked_at)
    values (pw, h, 'pangram', sc, w, coalesce(p->'result', '{}'::jsonb), now())
    on conflict (workspace_id, text_hash) do update set score = excluded.score, words = excluded.words, result = excluded.result, checked_at = now();
  end if;
  return jsonb_build_object('cost', c, 'level', lvl, 'outcome', outcome,
    'used', (select coalesce(sum(words), 0) from humanize_usage where workspace_id = pw and service = svc and day >= m), 'profile_id', pw);
end $$;

-- 007's ext_save_draft, now also keeping the badge (p.humanize) with a draft saved on LinkedIn.
create or replace function ext_save_draft(tok text, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare a record; did uuid;
begin
  select * into a from ext_auth(tok);
  insert into saved_drafts(workspace_id, kind, text, author, post_url, style, post_type, human, impact, source, created_by, humanize)
  values (a.ws, coalesce(p->>'kind','comment'), left(coalesce(p->>'text',''), 4000), coalesce(p->>'author',''), coalesce(p->>'url',''),
          coalesce(p->>'style',''), coalesce(p->>'post_type',''), (p->>'human')::int, (p->>'impact')::int, 'extension', a.uid,
          case when jsonb_typeof(p->'humanize') = 'object' then p->'humanize' else '{}'::jsonb end)
  returning id into did;
  return did;
end $$;

revoke all on function ext_humanize_state(text, jsonb) from public;
revoke all on function ext_humanize_record(text, jsonb) from public;
grant execute on function ext_humanize_state(text, jsonb) to anon, authenticated;
grant execute on function ext_humanize_record(text, jsonb) to anon, authenticated;
grant execute on function ext_save_draft(text, jsonb) to anon, authenticated;

select 'ok' as status,
  (select count(*) from information_schema.tables where table_name in ('humanize_settings', 'humanize_usage', 'humanize_results')) as new_tables,
  (select count(*) from information_schema.columns where column_name = 'humanize' and table_name in ('posts', 'saved_drafts')) as new_columns;
