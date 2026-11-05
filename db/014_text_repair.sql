-- 014: repair text that was saved as mojibake: UTF-8 read as Mac Roman, so "Santillán" shows as "Santill√°n" and
-- "A · Fintech" as "A ¬∑ Fintech". Safe to run more than once: a second run finds nothing left to change.
--
-- What it changes: only text columns listed below, and only rows whose text contains a telltale sequence (a Mac Roman
-- character for a UTF-8 lead byte followed by the right number of characters for continuation bytes). Each such
-- sequence is turned back into its bytes and decoded as UTF-8; it is replaced only when that gives one printable
-- character (not a control character or a combining mark). Everything else in the text is left exactly as it is.
-- Columns: prospects (name, role, company, region, next_action, why, notes), notes (title, body: Strategy and Notes),
-- templates (name, body), posts (title, topic, resource, draft), citation_questions (question, topic) and
-- workspaces (name, headline, voice). A column that does not exist is skipped. The same rules as repairMojibake in
-- src/lib/text.ts (tested in scripts/test-text.ts).
--
-- To preview first: run the create function statement, then the select at the bottom. Neither changes any row.

create or replace function prax_repair_mojibake(t text) returns text
language plpgsql immutable as $fn$
declare
  hi constant text := 'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ';
  m text; b bytea; ch text; cp int; i int; res text := t;
begin
  if t is null or t !~ '[¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙ][ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø]' then return t; end if;
  for m in select (regexp_matches(t, '([¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ][ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø]|[‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔ][ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø]{2}|[ÒÚÛÙ][ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø]{3})', 'g'))[1] loop
    b := ''::bytea;
    for i in 1..char_length(m) loop
      b := b || set_byte('\x00'::bytea, 0, 127 + strpos(hi, substr(m, i, 1)));
    end loop;
    begin
      ch := convert_from(b, 'UTF8');
    exception when others then
      continue;
    end;
    if char_length(ch) <> 1 then continue; end if;
    cp := ascii(ch);
    if cp < 160 or cp between 768 and 879 or cp = 65533 then continue; end if;
    res := replace(res, m, ch);
  end loop;
  return res;
end
$fn$;

do $do$
declare
  r record; n int;
begin
  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    join (values
      ('prospects', 'name'), ('prospects', 'role'), ('prospects', 'company'), ('prospects', 'region'), ('prospects', 'next_action'), ('prospects', 'why'), ('prospects', 'notes'),
      ('notes', 'title'), ('notes', 'body'),
      ('templates', 'name'), ('templates', 'body'),
      ('posts', 'title'), ('posts', 'topic'), ('posts', 'resource'), ('posts', 'draft'),
      ('citation_questions', 'question'), ('citation_questions', 'topic'),
      ('workspaces', 'name'), ('workspaces', 'headline'), ('workspaces', 'voice')
    ) as w(t, col) on c.table_schema = 'public' and c.table_name = w.t and c.column_name = w.col
    where c.data_type = 'text'
  loop
    execute format('update public.%I set %I = prax_repair_mojibake(%I) where %I ~ %L and %I is distinct from prax_repair_mojibake(%I)',
      r.table_name, r.column_name, r.column_name, r.column_name, '[¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙ][ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø]', r.column_name, r.column_name);
    get diagnostics n = row_count;
    if n > 0 then raise notice '%.% repaired in % rows', r.table_name, r.column_name, n; end if;
  end loop;
end
$do$;

-- Preview (read only): rows that still look broken. Empty after the repair.
-- select 'prospects' as t, id, name as before, prax_repair_mojibake(name) as after from prospects where name is distinct from prax_repair_mojibake(name)
-- union all select 'notes', id, left(body, 80), left(prax_repair_mojibake(body), 80) from notes where body is distinct from prax_repair_mojibake(body);
