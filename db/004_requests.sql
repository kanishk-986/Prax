-- Connection requests sent with a Prax note: create or move the prospect to Requested and tick a request item.
create or replace function ext_log_request(tok text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a record; pid uuid; item uuid; made boolean := false;
begin
  select * into a from ext_auth(tok);
  pid := match_prospect(a.ws, p->>'url', p->>'name');
  if pid is null and coalesce(p->>'name','') <> '' then
    insert into prospects(workspace_id, name, role, linkedin, stage, why, notes)
    values (a.ws, p->>'name', left(coalesce(p->>'headline',''), 200), coalesce(p->>'url',''), 'Requested', 'Connection request sent from Prax', coalesce(p->>'note',''))
    returning id into pid; made := true;
  else
    update prospects set stage = 'Requested', notes = trim(both from coalesce(notes,'') || E'\n\nNote sent ' || current_date || ': ' || coalesce(p->>'note',''))
    where id = pid and stage in ('Target','Warming');
  end if;
  select id into item from daily_items where workspace_id = a.ws and day = current_date and kind = 'request' and not done order by idx limit 1;
  if item is not null then update daily_items set done = true, note = coalesce(p->>'name',''), link = coalesce(p->>'url',''), prospect_id = pid where id = item; end if;
  return jsonb_build_object('prospect', p->>'name', 'created', made, 'ticked', item is not null);
end $$;
grant execute on function ext_log_request(text, jsonb) to anon, authenticated;
select 'ok' as status;
