-- Reward pipeline backend idempotency (Ring 0, 2026-08-08)
-- Ordered partial commit with per-step ledger guards — NOT one atomic EXP+gold+item RPC.
--
-- Gold: unique (profile_id, currency, source, ref_id) + earn_gold skip on duplicate ref_id
-- Item: item_grant_ledger unique (profile_id, ref_id) + grant_item skip on duplicate
-- Progression: commit_lobby_battle_progression — profile flags + owned_characters EXP in one DB txn
-- Resume: pending_lobby_rewards stores battle outcome for retry after reload

-- ── Gold ledger dedupe ─────────────────────────────────────────────────────────
create unique index if not exists currency_transactions_profile_ref_unique
  on public.currency_transactions (profile_id, currency, source, ref_id)
  where ref_id is not null;

create or replace function public.earn_gold(p_source text, p_amount int, p_ref_id text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
  v_profile_id uuid := auth.uid();
begin
  if p_amount <= 0 then
    raise exception 'จำนวนทองไม่ถูกต้อง';
  end if;
  if p_source not in ('quest', 'drop', 'topup') then
    raise exception 'แหล่งที่มาทองไม่ถูกต้อง: %', p_source;
  end if;

  if p_ref_id is not null then
    begin
      insert into public.currency_transactions (profile_id, currency, source, amount, ref_id)
      values (v_profile_id, 'gold', p_source, p_amount, p_ref_id);
    exception
      when unique_violation then
        select * into result from public.profiles where id = v_profile_id;
        return result;
    end;
  else
    insert into public.currency_transactions (profile_id, currency, source, amount, ref_id)
    values (v_profile_id, 'gold', p_source, p_amount, p_ref_id);
  end if;

  update public.profiles set gold = gold + p_amount where id = v_profile_id
  returning * into result;

  return result;
end;
$$;

-- ── Item grant ledger dedupe ───────────────────────────────────────────────────
create table if not exists public.item_grant_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  ref_id text not null,
  item_id text not null,
  quantity int not null check (quantity > 0),
  source text not null check (source in ('quest', 'drop')),
  created_at timestamptz not null default now(),
  unique (profile_id, ref_id)
);

alter table public.item_grant_ledger enable row level security;
create policy "own item grant ledger select"
  on public.item_grant_ledger for select using (auth.uid() = profile_id);

create or replace function public.grant_item(
  p_item_id text,
  p_quantity int,
  p_source text,
  p_ref_id text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  result public.profiles;
begin
  if p_quantity <= 0 then
    raise exception 'จำนวนไอเทมไม่ถูกต้อง';
  end if;
  if p_source not in ('quest', 'drop') then
    raise exception 'แหล่งที่มาไอเทมไม่ถูกต้อง: %', p_source;
  end if;

  if p_ref_id is not null then
    begin
      insert into public.item_grant_ledger (profile_id, ref_id, item_id, quantity, source)
      values (v_profile_id, p_ref_id, p_item_id, p_quantity, p_source);
    exception
      when unique_violation then
        select * into result from public.profiles where id = v_profile_id;
        return result;
    end;
  end if;

  insert into public.inventory_items (profile_id, item_id, quantity, obtained_from)
  values (v_profile_id, p_item_id, p_quantity, p_source)
  on conflict (profile_id, item_id)
  do update set quantity = public.inventory_items.quantity + excluded.quantity;

  select * into result from public.profiles where id = v_profile_id;
  return result;
end;
$$;

-- ── Battle history external id for idempotent inserts ──────────────────────────
alter table public.battle_history
  add column if not exists external_id text;

create unique index if not exists battle_history_profile_external_unique
  on public.battle_history (profile_id, external_id)
  where external_id is not null;

-- ── Durable pending reward for reload resume ────────────────────────────────────
create table if not exists public.pending_lobby_rewards (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  transaction_id text not null,
  stage_id text not null,
  stage_name text not null,
  outcome text not null check (outcome in ('victory', 'defeat')),
  earned_exp int not null default 0,
  earned_gold int not null default 0,
  dropped_items jsonb not null default '[]'::jsonb,
  finished_at timestamptz not null,
  duration_ms int,
  created_at timestamptz not null default now(),
  primary key (profile_id, transaction_id)
);

alter table public.pending_lobby_rewards enable row level security;
create policy "own pending lobby rewards select"
  on public.pending_lobby_rewards for select using (auth.uid() = profile_id);

create or replace function public.upsert_pending_lobby_reward(
  p_transaction_id text,
  p_stage_id text,
  p_stage_name text,
  p_outcome text,
  p_earned_exp int,
  p_earned_gold int,
  p_dropped_items jsonb,
  p_finished_at timestamptz,
  p_duration_ms int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pending_lobby_rewards (
    profile_id, transaction_id, stage_id, stage_name, outcome,
    earned_exp, earned_gold, dropped_items, finished_at, duration_ms
  )
  values (
    auth.uid(), p_transaction_id, p_stage_id, p_stage_name, p_outcome,
    p_earned_exp, p_earned_gold, coalesce(p_dropped_items, '[]'::jsonb),
    p_finished_at, p_duration_ms
  )
  on conflict (profile_id, transaction_id) do update set
    stage_id = excluded.stage_id,
    stage_name = excluded.stage_name,
    outcome = excluded.outcome,
    earned_exp = excluded.earned_exp,
    earned_gold = excluded.earned_gold,
    dropped_items = excluded.dropped_items,
    finished_at = excluded.finished_at,
    duration_ms = excluded.duration_ms;
end;
$$;

create or replace function public.clear_pending_lobby_reward(p_transaction_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.pending_lobby_rewards
  where profile_id = auth.uid() and transaction_id = p_transaction_id;
end;
$$;

-- ── Atomic lobby battle progression step (flags + hero EXP together) ─────────
create or replace function public.commit_lobby_battle_progression(
  p_transaction_id text,
  p_name text,
  p_title text,
  p_profile_level int,
  p_profile_exp int,
  p_profile_exp_to_next int,
  p_frame_id text,
  p_flags jsonb,
  p_defeated_npc_ids text[],
  p_lead_character_id text,
  p_hero_level int,
  p_hero_exp int,
  p_hero_exp_to_next int,
  p_skill_levels jsonb,
  p_talent_state jsonb,
  p_awakening_state jsonb,
  p_battle_external_id text,
  p_opponent text,
  p_battle_result text,
  p_duration_ms int,
  p_finished_at timestamptz
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_prog_key text := 'reward_tx_' || p_transaction_id || '_prog';
  v_existing_flags jsonb;
  result public.profiles;
begin
  select flags into v_existing_flags from public.profiles where id = v_profile_id;

  if coalesce(v_existing_flags->>v_prog_key, 'false') = 'true' then
    select * into result from public.profiles where id = v_profile_id;
    return result;
  end if;

  update public.profiles set
    name = p_name,
    title = p_title,
    level = p_profile_level,
    exp = p_profile_exp,
    exp_to_next = p_profile_exp_to_next,
    frame_id = p_frame_id,
    flags = p_flags,
    defeated_npc_ids = p_defeated_npc_ids
  where id = v_profile_id;

  insert into public.owned_characters (
    profile_id, character_id, level, exp, exp_to_next,
    skill_levels, talent_state, awakening_state
  )
  values (
    v_profile_id, p_lead_character_id, p_hero_level, p_hero_exp, p_hero_exp_to_next,
    p_skill_levels, p_talent_state, p_awakening_state
  )
  on conflict (profile_id, character_id) do update set
    level = excluded.level,
    exp = excluded.exp,
    exp_to_next = excluded.exp_to_next,
    skill_levels = excluded.skill_levels,
    talent_state = excluded.talent_state,
    awakening_state = excluded.awakening_state;

  begin
    insert into public.battle_history (
      profile_id, external_id, opponent, result, duration_ms, finished_at
    )
    values (
      v_profile_id, p_battle_external_id, p_opponent, p_battle_result, p_duration_ms, p_finished_at
    );
  exception
    when unique_violation then
      null;
  end;

  select * into result from public.profiles where id = v_profile_id;
  return result;
end;
$$;
