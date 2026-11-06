-- Profiles that start clean, and a way to take one out again (run after 015, re-runnable, deletes nothing by itself).
-- 1. workspaces gains company, pillars, regions (focus regions) and segment names, read by src/lib/persona.ts.
--    New profiles start with all of them empty. Profiles that exist when this file first runs used the built-in
--    defaults until now (the first profile's pillars, regions, segment rules and geography order), so those
--    defaults are written onto them once, inside the step that adds the pillars column, and nothing changes for them.
-- 2. archived_at: owners archive a profile (hidden from the profiles page) and can restore it.
--    delete_profile() removes an archived profile and all its data, owner only, with the exact name typed.
-- 3. notes.created_by (default auth.uid()), so Notes and Strategy show who wrote each one.

-- ---------- 1. who the profile is ----------
alter table workspaces add column if not exists company text not null default '';
alter table workspaces add column if not exists regions text[] not null default '{}';
alter table workspaces add column if not exists segments jsonb not null default '{}';

do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'workspaces' and column_name = 'pillars') then
    alter table workspaces add column pillars text[] not null default '{}';

    -- The defaults every existing profile ran on, now its own saved settings.
    update workspaces set
      pillars = array['Money That Moves Itself', 'The Liquid Balance Sheet', 'Regulation-to-Architecture', 'Production-Grade or Nothing', 'Agentic Finance', 'Build, Buy or Partner'],
      regions = case when regions = '{}' then array['GCC', 'India'] else regions end,
      segments = case when segments = '{}'::jsonb then '{"A": "Fintech & payments", "B": "MENA & India institutions", "D": "Africa"}'::jsonb else segments end;

    -- The company: the AI citations company row (db/011) where there is one.
    update workspaces w set company = e.name
      from citation_entities e
      where e.workspace_id = w.id and e.kind = 'self' and e.subject = 'company' and w.company = '';

    -- Network segment and topic rules (empty means the code defaults, which are now neutral).
    insert into network_settings (workspace_id, segments, topics)
      select id, '[{"seg":"D","roles":[],"companies":["africa","african","nigeria","nigerian","lagos","abuja","kenya","kenyan","nairobi","ghana","accra","south africa","johannesburg","cape town","egypt","egyptian","cairo","morocco","casablanca","rwanda","kigali","uganda","kampala","tanzania","ethiopia","senegal","ivory coast","zambia","mpesa","m pesa","flutterwave","paystack","chipper","onafriq","yellow card","nomba","moniepoint","opay","palmpay","mfs africa"]},{"seg":"B","roles":[],"companies":["emirates","emirati","uae","dubai","abu dhabi","sharjah","ajman","ras al khaimah","rak","saudi","ksa","riyadh","riyad","jeddah","qatar","qatari","doha","bahrain","manama","kuwait","kuwaiti","oman","muscat","gulf","gcc","mena","adgm","difc","india","indian","mumbai","bengaluru","bangalore","delhi","hyderabad","chennai","pune","gurugram","gurgaon","noida","rakbank","mashreq","adcb","adib","fab","first abu dhabi","enbd","emirates nbd","dib","cbd","wio","al rajhi","alinma","snb","sab","anb","bsf","qnb","nbk","kfh","hdfc","icici","axis bank","kotak","sbi","yes bank","indusind","paytm","razorpay","phonepe"]},{"seg":"C","companies":[],"roles":["partnerships","partnership","partner manager","business development","bd","bizdev","alliances","alliance","growth","chief business officer","cbo","chief revenue officer","cro","revenue","ecosystem","channel","strategic partnerships","go to market","gtm","commercial"]},{"seg":"A","roles":["payments","treasury"],"companies":["pay","payments","payment","stablecoin","stablecoins","remittance","remit","fintech","fx","money","wallet","card","cards","card issuing","cross border","banking as a service","baas","circle","ripple","stripe","wise","checkout","adyen","airwallex","rapyd","nium","thunes","conduit","rain","bvnk","paxos","zepz","toku"]},{"seg":"E","companies":["media","news","magazine","weekly","newsletter","podcast","research","consulting","advisory"],"roles":["journalist","editor","reporter","writer","author","publisher","analyst","columnist","podcast","host","commentator","researcher","professor","lecturer","speaker","influencer","creator"]}]'::jsonb, '[{"name":"Money That Moves Itself","words":["stablecoin","stablecoins","payment","payments","remittance","remittances","cross border","treasury","tokenised deposit","tokenized deposit","tokenised deposits","tokenized deposits","deposit token","deposit tokens","settlement","rails","usdc","usdt","cbdc","liquidity","fx","correspondent banking"]},{"name":"The Liquid Balance Sheet","words":["tokenisation","tokenization","tokenised","tokenized","rwa","rwas","real world asset","real world assets","fund","funds","private credit","real estate","bond","bonds","treasuries","asset management","asset manager","asset managers","securities"]},{"name":"Regulation-to-Architecture","words":["regulation","regulations","regulator","regulators","regulatory","compliance","genius act","mica","vara","mas","rbi","cbuae","sama","sec","occ","fca","licence","license","licensing","aml","kyc","travel rule","policy","rulebook","sandbox"]},{"name":"Production-Grade or Nothing","words":["security","custody","custodian","custodians","key management","mpc","audit","auditor","resilience","hack","hacked","breach","exploit","incident","soc 2","iso 27001","post quantum","quantum","cryptographic","infrastructure","production"]},{"name":"Agentic Finance","words":["ai agent","ai agents","agentic","agent","agents","autonomous","know your intent","kyi","abstraxn","machine payments","agent payments","llm","ai"]},{"name":"Build, Buy or Partner","words":["tco","total cost","build vs buy","build or buy","vendor","vendors","procurement","time to value","cost","costs","roi","business case","outsourcing"]}]'::jsonb from workspaces
    on conflict (workspace_id) do update set
      segments = case when network_settings.segments = '[]'::jsonb then excluded.segments else network_settings.segments end,
      topics = case when network_settings.topics = '[]'::jsonb then excluded.topics else network_settings.topics end;

    -- Discovery's geography order (empty now falls back to the profile's regions).
    insert into discovery_settings (workspace_id, settings)
      select id, '{"geo": ["MENA", "India", "Other emerging markets", "US and EU with a regional implication"]}'::jsonb from workspaces
    on conflict (workspace_id) do update set
      settings = case when jsonb_array_length(coalesce(discovery_settings.settings -> 'geo', '[]'::jsonb)) > 0 then discovery_settings.settings
                      else discovery_settings.settings || excluded.settings end;
  end if;
end $$;

-- ---------- 2. archive, restore, delete ----------
-- Archive and restore are an update of archived_at, which the existing owner-only update policy on workspaces covers.
alter table workspaces add column if not exists archived_at timestamptz;

-- Permanent delete: owner only, the profile must be archived first, and the exact name must be typed.
-- Every table hangs off workspaces with on delete cascade, so this removes all of the profile's data.
create or replace function delete_profile(p_ws uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role(p_ws, 'owner') then raise exception 'Only an owner can delete this profile'; end if;
  if not exists (select 1 from workspaces where id = p_ws and archived_at is not null) then raise exception 'Archive the profile before deleting it'; end if;
  if not exists (select 1 from workspaces where id = p_ws and name = p_name) then raise exception 'The name typed does not match the profile name'; end if;
  delete from workspaces where id = p_ws;
end $$;
revoke all on function delete_profile(uuid, text) from public;
grant execute on function delete_profile(uuid, text) to authenticated;

-- ---------- 3. who wrote each note ----------
alter table notes add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null;

select 'ok' as status;
