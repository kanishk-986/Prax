-- AI usage reported by the extension after each draft, for the overview on the Extension page.
create table if not exists ext_usage (
  id bigserial primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid,
  at timestamptz default now(),
  kind text not null default 'draft',
  provider text not null default '',
  model text not null default '',
  input_tokens int not null default 0,
  output_tokens int not null default 0
);
alter table ext_usage enable row level security;
drop policy if exists r on ext_usage;
create policy r on ext_usage for select using (has_role(workspace_id, 'viewer'));

create or replace function ext_log_usage(tok text, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from ext_auth(tok);
  insert into ext_usage(workspace_id, user_id, kind, provider, model, input_tokens, output_tokens)
  values (a.ws, a.uid, coalesce(p->>'kind','draft'), coalesce(p->>'provider',''), coalesce(p->>'model',''),
          coalesce((p->>'input_tokens')::int, 0), coalesce((p->>'output_tokens')::int, 0));
  return 1;
end $$;
grant execute on function ext_log_usage(text, jsonb) to anon, authenticated;
select 'ok' as status;
