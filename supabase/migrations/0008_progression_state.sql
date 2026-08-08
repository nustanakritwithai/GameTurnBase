-- P8 progression persistence — talent/awakening state on owned_characters (Ring 0, 2026-08-08)
-- Enables savePlayer to persist per-hero progression beyond level/exp/skill_levels.

alter table public.owned_characters
  add column if not exists talent_state jsonb not null default '{"unlockedNodes": []}'::jsonb,
  add column if not exists awakening_state jsonb not null default '{"tier": 0, "unlockedEffects": []}'::jsonb;

-- owned_characters previously had SELECT-only RLS — progression saves need UPDATE on own rows.
create policy "own characters update"
  on public.owned_characters
  for update
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);
