-- Comment Studio: styles, playbooks, tuning and safety per profile, voice fingerprints, saved drafts,
-- and richer usage rows (style, post type, scores; never draft text). Re-runnable.

-- Empty columns mean the defaults in src/lib/studio.ts.
create table if not exists studio_settings (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  styles jsonb not null default '[]',
  playbooks jsonb not null default '[]',
  tuning jsonb not null default '{}',
  safety jsonb not null default '{}',
  voice_profile jsonb not null default '{}',   -- the fingerprint in use; workspaces.voice keeps the locked rules
  updated_at timestamptz default now()
);

-- Every fingerprint built in Voice Lab, so a rebuild can be compared with the last one.
create table if not exists voice_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  source_name text default '',
  source_chars int not null default 0,
  fingerprint jsonb not null default '{}',
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);

-- Drafts someone bookmarked, from the extension or Rewrite Lab.
create table if not exists saved_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  kind text not null default 'comment',
  text text not null,
  author text default '',
  post_url text default '',
  style text default '',
  post_type text default '',
  human int, impact int,
  source text default 'extension',
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);

do $$ declare t text; begin
  foreach t in array array['studio_settings','voice_versions','saved_drafts'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists r on %I', t);
    execute format('drop policy if exists w on %I', t);
    execute format('create policy r on %I for select using (has_role(workspace_id, ''viewer''))', t);
    execute format('create policy w on %I for all using (has_role(workspace_id, ''editor'')) with check (has_role(workspace_id, ''editor''))', t);
  end loop;
end $$;
do $$ begin alter publication supabase_realtime add table saved_drafts; exception when duplicate_object then null; end $$;

alter table ext_usage add column if not exists style text not null default '';
alter table ext_usage add column if not exists post_type text not null default '';
alter table ext_usage add column if not exists human int;
alter table ext_usage add column if not exists impact int;

create or replace function ext_log_usage(tok text, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from ext_auth(tok);
  insert into ext_usage(workspace_id, user_id, kind, provider, model, input_tokens, output_tokens, style, post_type, human, impact)
  values (a.ws, a.uid, coalesce(p->>'kind','draft'), coalesce(p->>'provider',''), coalesce(p->>'model',''),
          coalesce((p->>'input_tokens')::int, 0), coalesce((p->>'output_tokens')::int, 0),
          left(coalesce(p->>'style',''), 80), left(coalesce(p->>'post_type',''), 80), (p->>'human')::int, (p->>'impact')::int);
  return 1;
end $$;

-- The extension reads the studio settings and the VIP list with its profile.
create or replace function ext_me(tok text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a record; w workspaces;
begin
  select * into a from ext_auth(tok);
  select * into w from workspaces where id = a.ws;
  return jsonb_build_object('workspace', w.name, 'slug', w.slug, 'headline', w.headline, 'topics', w.topics, 'voice', w.voice,
    'email', (select email from auth.users where id = a.uid),
    'today', (select count(*) filter (where done) || '/' || count(*) from daily_items where workspace_id = a.ws and day = current_date and kind = 'comment'),
    'studio', coalesce((select to_jsonb(s) - 'workspace_id' - 'updated_at' from studio_settings s where s.workspace_id = a.ws), '{}'::jsonb),
    'prospects', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'linkedin', linkedin)) from prospects
                           where workspace_id = a.ws and stage not in ('Won','Parked')), '[]'::jsonb));
end $$;

-- Bookmark a draft from the extension.
create or replace function ext_save_draft(tok text, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare a record; did uuid;
begin
  select * into a from ext_auth(tok);
  insert into saved_drafts(workspace_id, kind, text, author, post_url, style, post_type, human, impact, source, created_by)
  values (a.ws, coalesce(p->>'kind','comment'), left(coalesce(p->>'text',''), 4000), coalesce(p->>'author',''), coalesce(p->>'url',''),
          coalesce(p->>'style',''), coalesce(p->>'post_type',''), (p->>'human')::int, (p->>'impact')::int, 'extension', a.uid)
  returning id into did;
  return did;
end $$;
grant execute on function ext_save_draft(text, jsonb) to anon, authenticated;
grant execute on function ext_me(text) to anon, authenticated;
grant execute on function ext_log_usage(text, jsonb) to anon, authenticated;

select 'ok' as status;
