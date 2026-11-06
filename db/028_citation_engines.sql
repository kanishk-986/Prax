-- AI citations engines (I5): Google AI answers and Microsoft Copilot, read from search results through SerpApi with
-- the user's own SerpApi key in the extension (the key never reaches Prax). Their runs are stored like every other run,
-- with engine 'google_ai' or 'copilot' and the SerpApi engine name as the model. A search where the engine showed no AI
-- answer is stored with the new status 'no_answer': a result, not a failure, and not scored.
-- Run after 008 (any time after 026). Re-runnable; deletes nothing; existing rows already satisfy the wider checks.

alter table citation_runs drop constraint if exists citation_runs_engine_check;
alter table citation_runs add constraint citation_runs_engine_check
  check (engine in ('claude','openai','gemini','perplexity','google_ai','copilot'));

alter table citation_runs drop constraint if exists citation_runs_status_check;
alter table citation_runs add constraint citation_runs_status_check
  check (status in ('ok','failed','no_sources','no_answer'));

select 'ok' as status;
