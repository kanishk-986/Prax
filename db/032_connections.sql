-- 032: Connections (C1, Q135 to Q141, agreed 7 Nov 2026). Run after 031. Re-runnable; deletes nothing; holds no key.
-- 1. connection_settings: per profile, the routes (job -> primary tool and fallback), the monthly caps per tool
--    ({ limit, unit: usd | calls | words }) and which jobs use a separate key under Advanced (a flag only; the key
--    itself stays in the extension in each browser). Members read; editors change them.
-- 2. ext_usage gets usage tags (Q137): job, section, units (searches, credits, words or images), cost (when the vendor
--    reports it, such as Exa, Perplexity or xAI), ok (false for a failed call) and ms (how long it took). No text.
-- 3. ext_log_usage takes the tags, keeping 007's style, post type and scores. Unknown jobs and sections are stored as ''.
-- 4. ext_connection_state(tok): the profile's settings and this month's usage rows (counts and costs only), so the
--    extension door (/api/ext/connections) can route jobs and stop paid calls at a cap.
-- 5. GPTZero and Originality.ai join Pangram as detectors: the humanize_usage service check and ext_humanize_record
--    from 031 accept them, with list rates per 100 words (GPTZero about $0.046, Originality.ai one credit, about $0.012).

-- 1. Settings.
create table if not exists connection_settings (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  routes jsonb not null default '{}'::jsonb,
  caps jsonb not null default '{}'::jsonb,
  advanced jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
do $$ begin
  alter table connection_settings add constraint connection_settings_shape check (jsonb_typeof(routes) = 'object' and jsonb_typeof(caps) = 'object' and jsonb_typeof(advanced) = 'object');
exception when duplicate_object then null; end $$;
alter table connection_settings enable row level security;
drop policy if exists cs_r on connection_settings;
drop policy if exists cs_w on connection_settings;
create policy cs_r on connection_settings for select using (has_role(workspace_id, 'viewer'));
create policy cs_w on connection_settings for all using (has_role(workspace_id, 'editor')) with check (has_role(workspace_id, 'editor'));
-- The signed-in user who changed them.
create or replace function connection_settings_by() returns trigger
language plpgsql set search_path = public, pg_catalog as $$
begin
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists connection_settings_by on connection_settings;
create trigger connection_settings_by before insert or update on connection_settings for each row execute function connection_settings_by();
do $$ begin alter publication supabase_realtime add table connection_settings; exception when duplicate_object then null; end $$;

-- 2. Usage tags. ext_usage keeps 005's read policy (members read); only ext_log_usage writes it.
alter table ext_usage add column if not exists job text not null default '';
alter table ext_usage add column if not exists section text not null default '';
alter table ext_usage add column if not exists units int not null default 0;
alter table ext_usage add column if not exists cost numeric(12,6);
alter table ext_usage add column if not exists ok boolean not null default true;
alter table ext_usage add column if not exists ms int;
create index if not exists ext_usage_ws_at on ext_usage (workspace_id, at);
do $$ begin alter publication supabase_realtime add table ext_usage; exception when duplicate_object then null; end $$;

-- 3. The extension's usage report, with the tags.
create or replace function ext_log_usage(tok text, p jsonb) returns int
language plpgsql security definer set search_path = public, pg_catalog as $$
declare a record;
  j text := case when p->>'job' in ('comment', 'post', 'analysis', 'discovery_search', 'discovery_fetch', 'citations', 'humanize_check', 'humanize_rewrite', 'image', 'test') then p->>'job' else '' end;
  s text := case when p->>'section' in ('comment_studio', 'linkedin_bar', 'content_write', 'content_editor', 'content_studio', 'discovery', 'citations', 'inbox', 'pipeline', 'network', 'side_panel', 'connections') then p->>'section' else '' end;
  c numeric := case when jsonb_typeof(p->'cost') = 'number' then least(greatest((p->>'cost')::numeric, 0), 1000) else null end;
begin
  select * into a from ext_auth(tok);
  insert into ext_usage(workspace_id, user_id, kind, provider, model, input_tokens, output_tokens, style, post_type, human, impact, job, section, units, cost, ok, ms)
  values (a.ws, a.uid, left(coalesce(p->>'kind','draft'), 40), left(coalesce(p->>'provider',''), 40), left(coalesce(p->>'model',''), 120),
          greatest(coalesce((p->>'input_tokens')::int, 0), 0), greatest(coalesce((p->>'output_tokens')::int, 0), 0),
          left(coalesce(p->>'style',''), 80), left(coalesce(p->>'post_type',''), 80), (p->>'human')::int, (p->>'impact')::int,
          j, s, greatest(least(coalesce((p->>'units')::int, 0), 1000000), 0), c, coalesce((p->>'ok')::boolean, true),
          case when jsonb_typeof(p->'ms') = 'number' then least(greatest((p->>'ms')::int, 0), 3600000) else null end);
  return 1;
end $$;
revoke all on function ext_log_usage(text, jsonb) from public;
grant execute on function ext_log_usage(text, jsonb) to anon, authenticated;

-- 4. What the extension needs to route and to respect the caps: settings and this month's rows (no text exists to send).
create or replace function ext_connection_state(tok text) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare a record; s connection_settings; m timestamptz := date_trunc('month', now());
begin
  select * into a from ext_auth(tok);
  select * into s from connection_settings where workspace_id = a.ws;
  return jsonb_build_object(
    'settings', jsonb_build_object('routes', coalesce(s.routes, '{}'::jsonb), 'caps', coalesce(s.caps, '{}'::jsonb), 'advanced', coalesce(s.advanced, '{}'::jsonb)),
    'usage', coalesce((select jsonb_agg(jsonb_build_object('at', u.at, 'kind', u.kind, 'provider', u.provider, 'model', u.model, 'input_tokens', u.input_tokens,
        'output_tokens', u.output_tokens, 'job', u.job, 'section', u.section, 'units', u.units, 'cost', u.cost, 'ok', u.ok))
      from (select * from ext_usage where workspace_id = a.ws and at >= m order by at desc limit 5000) u), '[]'::jsonb),
    'humanize', coalesce((select jsonb_agg(jsonb_build_object('day', h.day, 'service', h.service, 'words', h.words, 'cost', h.cost, 'job', h.job, 'section', h.section))
      from humanize_usage h where h.workspace_id = a.ws and h.day >= m::date), '[]'::jsonb));
end $$;
revoke all on function ext_connection_state(text) from public;
grant execute on function ext_connection_state(text) to anon, authenticated;

-- 5. GPTZero and Originality.ai as detectors beside Pangram (031 allowed pangram and walter only).
alter table humanize_usage drop constraint if exists humanize_usage_service;
alter table humanize_usage add constraint humanize_usage_service check (service in ('pangram', 'walter', 'gptzero', 'originality'));

-- 031's ext_humanize_record (with the QA fixes: the profile on screen, the score range and the text hash), now also for
-- gptzero and originality. Everything else is as in 031.
create or replace function ext_humanize_record(tok text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare a record; s humanize_settings; svc text := p->>'service'; k text := coalesce(p->>'kind', 'post');
  w int := greatest(0, least(coalesce((p->>'words')::int, 0), 200000)); sc int := (p->>'score')::int; h text := left(coalesce(p->>'hash', ''), 64);
  rate numeric; lvl int; c numeric; outcome text; m date := date_trunc('month', current_date)::date; pw uuid;
  sec text := case when p->>'section' in ('comment_studio', 'linkedin_bar', 'content_write', 'content_editor') then p->>'section' else '' end;
begin
  select * into a from ext_auth(tok);
  pw := ext_humanize_ws(a.ws, a.uid, p);
  if svc not in ('pangram', 'walter', 'gptzero', 'originality') then raise exception 'unknown service'; end if;
  if k not in ('comment', 'post', 'article') then k := 'post'; end if;
  if sc is not null and (sc < 0 or sc > 100) then raise exception 'score out of range'; end if;
  if svc <> 'walter' and h !~ '^[0-9a-f]{64}$' then raise exception 'bad text hash'; end if;
  select * into s from humanize_settings where workspace_id = pw;
  rate := case svc when 'pangram' then coalesce(s.pangram_cost_100, 0.05) when 'walter' then coalesce(s.walter_cost_100, 0)
    when 'gptzero' then 0.046 else 0.012 end;
  lvl := case k when 'comment' then coalesce(s.level_comment, 0) when 'article' then coalesce(s.level_article, 0) else coalesce(s.level_post, 0) end;
  c := round(w / 100.0 * rate, 4);
  outcome := case when svc = 'walter' then 'rewrite' when sc is null then 'failed' when sc >= lvl then 'passed' else 'needs work' end;
  insert into humanize_usage(workspace_id, user_id, service, kind, words, cost, text_hash, result, score, job, section)
  values (pw, a.uid, svc, k, w, c, h, outcome, sc, case when svc = 'walter' then 'humanize_rewrite' else 'humanize_check' end, sec);
  if svc <> 'walter' and sc is not null and h <> '' then
    insert into humanize_results(workspace_id, text_hash, service, score, words, result, checked_at)
    values (pw, h, svc, sc, w, coalesce(p->'result', '{}'::jsonb), now())
    on conflict (workspace_id, text_hash) do update set service = excluded.service, score = excluded.score, words = excluded.words, result = excluded.result, checked_at = now();
  end if;
  return jsonb_build_object('cost', c, 'level', lvl, 'outcome', outcome,
    'used', (select coalesce(sum(words), 0) from humanize_usage where workspace_id = pw and service = svc and day >= m), 'profile_id', pw);
end $$;
revoke all on function ext_humanize_record(text, jsonb) from public;
grant execute on function ext_humanize_record(text, jsonb) to anon, authenticated;

select 'ok' as status,
  (select count(*) from information_schema.tables where table_name = 'connection_settings') as new_tables,
  (select count(*) from information_schema.columns where table_name = 'ext_usage' and column_name in ('job', 'section', 'units', 'cost', 'ok', 'ms')) as usage_tags;
