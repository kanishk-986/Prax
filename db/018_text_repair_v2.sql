-- 018: text repair, version 2. Replaces prax_repair_mojibake from 014, which returned its input unchanged in the
-- live database (a read-only check showed before = after for a garbled prospect name). 014 kept the 128 Mac Roman
-- characters as a literal string; the same file works in a clean Postgres, so the literal was most likely altered
-- on its way into the SQL editor (a non-breaking space or a ligature changed by the paste shifts every position
-- after it, and the byte lookup then builds the wrong bytes). This file has no special characters at all: the
-- table is a list of code points (Python's mac_roman codec, bytes 0x80 to 0xFF) and every character is made with
-- chr(). The rules match repairMojibake in src/lib/text.ts; scripts/test-text.ts checks both on the same cases.
--
-- HOW TO RUN
--   Preview only (changes no rows): run PART 1 and PART 2. PART 1 only creates functions.
--   Repair: run the whole file. Safe to run again: a second run finds nothing to change.
--   Check: PART 4 is the preview again and should return no rows.
--
-- What the repair does: a "broken sequence" is a Mac Roman character for a UTF-8 lead byte (C2 to F4) followed by
-- the right number of Mac Roman characters for continuation bytes (80 to BF), for example square root + degree (C3 A1, meant as a-acute) or not sign + n-ary sum
-- (C2 B7, meant as a middle dot). Each one is turned back into its bytes and decoded as UTF-8, and it is replaced only when that gives a
-- single printable character (not a control character, not a combining mark). Everything else is left exactly as
-- it is, so a real square root sign before a digit and real accents stay. Only rows whose column contains a broken sequence are updated.

-- ======================================================================================================
-- PART 1: functions (no rows change)
-- ======================================================================================================

-- Unicode code points shown for Mac Roman bytes 0x80 to 0xFF, in order: element i is byte 0x7F + i.
create or replace function public.prax_mac_roman_high() returns int[]
language sql immutable parallel safe as $$
  select array[
    196, 197, 199, 201, 209, 214, 220, 225, 224, 226, 228, 227, 229, 231, 233, 232,  -- bytes 0x80 to 0x8F
    234, 235, 237, 236, 238, 239, 241, 243, 242, 244, 246, 245, 250, 249, 251, 252,  -- bytes 0x90 to 0x9F
    8224, 176, 162, 163, 167, 8226, 182, 223, 174, 169, 8482, 180, 168, 8800, 198, 216,  -- bytes 0xA0 to 0xAF
    8734, 177, 8804, 8805, 165, 181, 8706, 8721, 8719, 960, 8747, 170, 186, 937, 230, 248,  -- bytes 0xB0 to 0xBF
    191, 161, 172, 8730, 402, 8776, 8710, 171, 187, 8230, 160, 192, 195, 213, 338, 339,  -- bytes 0xC0 to 0xCF
    8211, 8212, 8220, 8221, 8216, 8217, 247, 9674, 255, 376, 8260, 8364, 8249, 8250, 64257, 64258,  -- bytes 0xD0 to 0xDF
    8225, 183, 8218, 8222, 8240, 194, 202, 193, 203, 200, 205, 206, 207, 204, 211, 212,  -- bytes 0xE0 to 0xEF
    63743, 210, 218, 219, 217, 305, 710, 732, 175, 728, 729, 730, 184, 733, 731, 711  -- bytes 0xF0 to 0xFF
  ]::int[]
$$;

-- The Mac Roman byte a character stands for (128 to 255), or null for ASCII and anything outside the table.
create or replace function public.prax_mac_roman_byte(c text) returns int
language sql immutable parallel safe as $$
  select 127 + array_position(public.prax_mac_roman_high(), ascii(c))
$$;

-- A quick test for "contains a broken sequence": a lead character (C2 to F4) next to a continuation character
-- (80 to BF). Built from chr(), so it has no literal special characters. None of the 128 is a regex metacharacter.
create or replace function public.prax_mojibake_pattern() returns text
language sql immutable parallel safe as $$
  select '[' || string_agg(chr(c), '' order by o) filter (where o + 127 between 194 and 244)
      || '][' || string_agg(chr(c), '' order by o) filter (where o + 127 between 128 and 191) || ']'
  from unnest(public.prax_mac_roman_high()) with ordinality as u(c, o)
$$;

-- The repair. Walks the text once, left to right, like the regular expression in src/lib/text.ts: at each
-- position a lead character with enough continuation characters after it is one sequence; a sequence that does
-- not decode to one printable character is kept as it is and skipped whole. The position always moves forward.
create or replace function public.prax_repair_mojibake(t text) returns text
language plpgsql immutable parallel safe as $fn$
declare
  n int; i int := 1; k int; lead int; cont int; need int; bytes bytea; ch text; cp int; res text := '';
begin
  if t is null or t !~ public.prax_mojibake_pattern() then return t; end if;
  n := char_length(t);
  while i <= n loop
    lead := public.prax_mac_roman_byte(substr(t, i, 1));
    need := case when lead between 194 and 223 then 1 when lead between 224 and 239 then 2 when lead between 240 and 244 then 3 else 0 end;
    if need = 0 or i + need > n then
      res := res || substr(t, i, 1); i := i + 1; continue;
    end if;
    bytes := set_byte(decode('00', 'hex'), 0, lead);
    for k in 1..need loop
      cont := public.prax_mac_roman_byte(substr(t, i + k, 1));
      if cont is null or cont > 191 then bytes := null; exit; end if;
      bytes := bytes || set_byte(decode('00', 'hex'), 0, cont);
    end loop;
    if bytes is null then
      res := res || substr(t, i, 1); i := i + 1; continue;
    end if;
    begin
      ch := convert_from(bytes, 'UTF8');
    exception when others then
      ch := null;
    end;
    cp := case when ch is not null and char_length(ch) = 1 then ascii(ch) end;
    if cp is null or cp < 160 or cp between 768 and 879 or cp = 65533 then
      res := res || substr(t, i, need + 1);
    else
      res := res || ch;
    end if;
    i := i + need + 1;
  end loop;
  return res;
end
$fn$;

-- The text columns the repair looks at. A column that does not exist is skipped.
create or replace function public.prax_mojibake_columns() returns table (table_name text, column_name text)
language sql stable as $$
  select c.table_name::text, c.column_name::text
  from information_schema.columns c
  join (values
    ('prospects', 'name'), ('prospects', 'role'), ('prospects', 'company'), ('prospects', 'region'), ('prospects', 'next_action'), ('prospects', 'why'), ('prospects', 'notes'),
    ('notes', 'title'), ('notes', 'body'),
    ('templates', 'name'), ('templates', 'body'),
    ('posts', 'title'), ('posts', 'topic'), ('posts', 'resource'), ('posts', 'draft'),
    ('citation_questions', 'question'), ('citation_questions', 'topic'),
    ('workspaces', 'name'), ('workspaces', 'headline'), ('workspaces', 'voice'), ('workspaces', 'company'),
    ('network_people', 'name'), ('network_people', 'company'), ('network_people', 'position'),
    ('comment_log', 'author'), ('comment_log', 'text'),
    ('daily_items', 'title')
  ) as w(t, col) on c.table_schema = 'public' and c.table_name = w.t and c.column_name = w.col
  where c.data_type = 'text'
$$;

-- ======================================================================================================
-- PART 2: PREVIEW (read only). Every value that would change, before and after. Changes nothing.
-- ======================================================================================================

do $preview$
declare
  r record; v record; pat text := public.prax_mojibake_pattern(); total int := 0;
begin
  for r in select * from public.prax_mojibake_columns() loop
    for v in execute format('select left(%I, 120) as before, left(public.prax_repair_mojibake(%I), 120) as after from public.%I where %I ~ %L and %I is distinct from public.prax_repair_mojibake(%I) limit 50',
      r.column_name, r.column_name, r.table_name, r.column_name, pat, r.column_name, r.column_name) loop
      total := total + 1;
      raise notice '%.%: "%" becomes "%"', r.table_name, r.column_name, v.before, v.after;
    end loop;
  end loop;
  raise notice 'Preview: % values would change (at most 50 listed per column).', total;
end
$preview$;

-- The same preview as a result grid, for prospects and notes (the two places the audit saw):
select 'prospects.name' as col, name as before, public.prax_repair_mojibake(name) as after
from public.prospects where name ~ public.prax_mojibake_pattern() and name is distinct from public.prax_repair_mojibake(name)
union all
select 'notes.body', left(body, 120), left(public.prax_repair_mojibake(body), 120)
from public.notes where body ~ public.prax_mojibake_pattern() and body is distinct from public.prax_repair_mojibake(body);

-- ======================================================================================================
-- PART 3: the repair. Updates only rows with a broken sequence that the repair actually changes.
-- ======================================================================================================

do $repair$
declare
  r record; n int; pat text := public.prax_mojibake_pattern();
begin
  for r in select * from public.prax_mojibake_columns() loop
    execute format('update public.%I set %I = public.prax_repair_mojibake(%I) where %I ~ %L and %I is distinct from public.prax_repair_mojibake(%I)',
      r.table_name, r.column_name, r.column_name, r.column_name, pat, r.column_name, r.column_name);
    get diagnostics n = row_count;
    if n > 0 then raise notice '%.% repaired in % rows', r.table_name, r.column_name, n; end if;
  end loop;
end
$repair$;

-- ======================================================================================================
-- PART 4: check (read only). Should return no rows after PART 3.
-- ======================================================================================================

select 'prospects.name' as col, name as still_broken
from public.prospects where name ~ public.prax_mojibake_pattern() and name is distinct from public.prax_repair_mojibake(name)
union all
select 'notes.body', left(body, 120)
from public.notes where body ~ public.prax_mojibake_pattern() and body is distinct from public.prax_repair_mojibake(body);
