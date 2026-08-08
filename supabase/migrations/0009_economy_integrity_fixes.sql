-- Economy/RLS integrity fixes — 2026-08-08 gold-standard AUDIT (Heavy tier, adversarially
-- verified) found live-exploitable gaps in the currency/inventory RPCs and their RLS backing.
-- See MEMORY.md for the full audit writeup; this migration closes items 1/3/4 from that pass.
-- Item 2 (coupon dedup race) is a separate migration (0010) — a CoalBoard truth-lens review
-- of this fix found that CREATE UNIQUE INDEX can fail outright if a duplicate row already
-- exists from the very race this closes, and Supabase applies each migration file in one
-- transaction — bundling it here would risk rolling back these 3 fixes too if that index
-- statement fails. Isolated so a data problem in one fix can't block the other three.

-- ── Fix 1: earn_gold / grant_item accepted client-supplied amount/quantity with no upper
-- bound. Any authenticated session (guest included) could call
-- supabase.rpc('earn_gold', {p_source:'quest', p_amount: 999999999}) and self-mint gold.
-- Real reward magnitudes in this game top out around 75 gold per stage
-- (src/game/reward/rewardConfig.ts) — cap generously above that so legitimate content
-- growth doesn't need a migration every time, while closing off orders-of-magnitude abuse.
-- This is a bound, not a full reward-catalog redesign (that's a separate, larger task —
-- see MEMORY.md's audit item 1 "Effort: Medium" note).

create or replace function public.earn_gold(p_source text, p_amount int, p_ref_id text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
  v_max_amount constant int := 1000; -- ~13x the largest single configured reward (75 gold)
begin
  if p_amount <= 0 then
    raise exception 'จำนวนทองไม่ถูกต้อง';
  end if;
  if p_amount > v_max_amount then
    raise exception 'จำนวนทองเกินขีดจำกัดต่อครั้ง (%): %', v_max_amount, p_amount;
  end if;
  if p_source not in ('quest', 'drop', 'topup') then
    raise exception 'แหล่งที่มาทองไม่ถูกต้อง: %', p_source;
  end if;

  insert into public.currency_transactions (profile_id, currency, source, amount, ref_id)
  values (auth.uid(), 'gold', p_source, p_amount, p_ref_id);

  update public.profiles set gold = gold + p_amount where id = auth.uid()
  returning * into result;

  return result;
end;
$$;

create or replace function public.grant_item(p_item_id text, p_quantity int, p_source text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_quantity constant int := 100; -- generous headroom over any single legitimate drop
begin
  if p_quantity <= 0 then
    raise exception 'จำนวนไอเทมไม่ถูกต้อง';
  end if;
  if p_quantity > v_max_quantity then
    raise exception 'จำนวนไอเทมเกินขีดจำกัดต่อครั้ง (%): %', v_max_quantity, p_quantity;
  end if;
  if p_source not in ('quest', 'drop') then
    raise exception 'แหล่งที่มาไอเทมไม่ถูกต้อง: %', p_source;
  end if;

  insert into public.inventory_items (profile_id, item_id, quantity, obtained_from)
  values (auth.uid(), p_item_id, p_quantity, p_source)
  on conflict (profile_id, item_id)
  do update set quantity = public.inventory_items.quantity + excluded.quantity;

  return (select p.* from public.profiles p where id = auth.uid());
end;
$$;

-- ── Fix 3: RLS alone cannot restrict WHICH COLUMNS a client may set within a row it's
-- otherwise allowed to update — that's a row-visibility mechanism, not a column-value one.
-- profiles' only UPDATE policy (auth.uid() = id) governs whether a row is touchable at all;
-- nothing in RLS stops a client from writing gold/gem directly via
-- supabase.from('profiles').update(...), bypassing every RPC above (and the
-- currency_transactions ledger) entirely.
--
-- A CoalBoard adversary-lens review of an earlier draft (`revoke update (gold, gem) ...`)
-- correctly refuted it: Postgres tracks table-level UPDATE privilege (pg_class.relacl) and
-- column-level UPDATE privilege (pg_attribute.attacl) as SEPARATE, OR'd ACL entries — a
-- column-scoped REVOKE only strips a column-scoped grant, it does nothing against a
-- pre-existing table-wide grant on the same table. Supabase's project bootstrap grants
-- `authenticated` broad table-wide privileges on every public-schema table by default (this
-- repo's own migrations lean on RLS as the sole gate everywhere else, e.g. currency_transactions
-- and admin_accounts have zero matching INSERT/UPDATE policy rather than a REVOKE) — so a
-- column-scoped REVOKE alone would very likely be a no-op against that default, leaving the
-- exact bypass this fix claims to close still open.
--
-- The fix that actually closes it: REVOKE the table-wide UPDATE grant entirely, then GRANT
-- UPDATE back only on the exact column allowlist `savePlayer()` legitimately writes (confirmed
-- against src/data/accountRepository.supabase.ts's one `.update(...)` call site: name, title,
-- level, exp, exp_to_next, frame_id, flags, defeated_npc_ids — gold/gem deliberately excluded).
-- With no table-wide grant left to fall back on, gold/gem become writable ONLY by a
-- SECURITY DEFINER function (which runs as the function owner, unaffected by `authenticated`'s
-- grants either way).

revoke update on public.profiles from authenticated;
grant update (name, title, level, exp, exp_to_next, frame_id, flags, defeated_npc_ids)
  on public.profiles to authenticated;

-- ── Fix 4: owned_characters had no INSERT policy for `authenticated` at any point in this
-- repo's migration history (only SELECT in 0001, UPDATE in 0008) — savePlayer()'s direct
-- client-side upsert (ON CONFLICT DO UPDATE still evaluates the INSERT policy in Postgres,
-- per docs) should fail RLS on effectively every call, since every player has >=1 owned
-- character from the signup trigger. This is the deterministic common path, not an edge
-- case — closing it so progression saves actually persist.

create policy "own characters insert" on public.owned_characters
  for insert with check (auth.uid() = profile_id);
