-- RPC call-frequency rate limiting — closes the residual gap the CoalBoard adversary lens
-- flagged on 0009 (2026-08-08, item 145): the per-call amount/quantity caps on earn_gold and
-- grant_item bound a SINGLE call, but nothing stopped a scripted client looping
-- `for (;;) await supabase.rpc('earn_gold', {p_source:'quest', p_amount:1000})` — same
-- unbounded-mint outcome, just N-calls-to-infinity instead of one-call-to-infinity.
--
-- Not a full anti-cheat system (that's a much larger, separate scope) — a bounded throttle so
-- automated farming has a real ceiling instead of none. Real play never gets close: a full
-- dungeon run fires a handful of earn_gold/grant_item calls total (see rewardGrantService.ts —
-- one call per reward-table entry, tables top out at ~3 entries).

-- Purely an operational rate-limit log, not a financial ledger (currency_transactions already
-- owns that job, item 145) — RLS-enabled with zero policies for `authenticated`, same pattern
-- as currency_transactions: only a SECURITY DEFINER function (owner, bypasses RLS) ever writes
-- or reads it.
create table public.rpc_rate_limit (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  rpc_name text not null,
  called_at timestamptz not null default now()
);

create index rpc_rate_limit_lookup on public.rpc_rate_limit (profile_id, rpc_name, called_at);

alter table public.rpc_rate_limit enable row level security;

-- Shared by every rate-limited RPC so the check can't drift between call sites (a security
-- control duplicated per-caller is a security control that silently diverges).
--
-- pg_advisory_xact_lock serializes concurrent callers on the same (profile_id, rpc_name) for
-- the rest of THIS transaction — without it, a caller firing many truly-simultaneous requests
-- (Promise.all, not a sequential loop) would have every request's count-check run before any
-- of their inserts commit, all reading the same "under the limit" count and all passing: a
-- CoalBoard adversary-lens review of the first draft caught this exact TOCTOU gap (2026-08-08),
-- the same class of race the coupon-dedup fix (0010) closed, just against a softer target this
-- time. hashtext() collapses (uid, rpc_name) into the bigint pg_advisory_xact_lock needs; a hash
-- collision would only ever make two DIFFERENT profiles/rpcs share a lock (over-serializing,
-- never under-serializing) — never a security gap, at worst a rare extra wait.
create or replace function public.check_and_log_rpc_rate_limit(
  p_rpc_name text,
  p_max_calls int,
  p_window_seconds int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_calls int;
begin
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':' || p_rpc_name));

  select count(*) into v_recent_calls
  from public.rpc_rate_limit
  where profile_id = auth.uid()
    and rpc_name = p_rpc_name
    and called_at > now() - make_interval(secs => p_window_seconds);

  if v_recent_calls >= p_max_calls then
    raise exception 'เรียกใช้งานถี่เกินไป กรุณาลองใหม่อีกครั้งในภายหลัง';
  end if;

  insert into public.rpc_rate_limit (profile_id, rpc_name) values (auth.uid(), p_rpc_name);
end;
$$;

-- SECURITY DEFINER alone never restricts WHO can call a function (item 145's repeated lesson,
-- re-caught here by the same adversary-lens pass before it could become a second instance of
-- the exact gap 0012 was written to close) — this helper is meant to be called only from other
-- SECURITY DEFINER RPCs via `perform`, never directly by a client.
revoke execute on function public.check_and_log_rpc_rate_limit(text, int, int) from public, anon;

-- 20 calls / 60s per RPC per account — generous over any real play pattern (a dungeon clear is
-- a handful of calls total, see rewardGrantService.ts), tight enough that a scripted SEQUENTIAL
-- loop caps out at 20 * 1000-gold-max = 20,000 gold/min instead of unbounded. The advisory lock
-- above closes the concurrent-burst variant of the same attack; this number is not a defense
-- against that shape of attack by itself.
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
  perform public.check_and_log_rpc_rate_limit('earn_gold', 20, 60);

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
  perform public.check_and_log_rpc_rate_limit('grant_item', 20, 60);

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

-- Self-pruning, same precedent as 0006_guest_cleanup.sql's pg_cron job: rows older than the
-- longest rate-limit window in use are never read again, delete them daily so this stays a
-- small operational table, not a second unbounded ledger.
select cron.schedule(
  'cleanup-stale-rpc-rate-limit-rows',
  '0 4 * * *',
  $$delete from public.rpc_rate_limit where called_at < now() - interval '1 day';$$
);
