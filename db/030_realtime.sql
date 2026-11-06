-- 030: make sure every workspace table sends live changes, so lists update without a reload (QA 6 Nov:
-- inserts did not arrive over Realtime). Adds each public table that has a workspace_id column to the
-- supabase_realtime publication if it is not there yet. Re-runnable; changes no data.
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'workspace_id'
      and not exists (select 1 from pg_publication_tables p where p.pubname = 'supabase_realtime' and p.schemaname = 'public' and p.tablename = c.table_name)
  loop
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;

select 'ok' as status, (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public') as live_tables;
