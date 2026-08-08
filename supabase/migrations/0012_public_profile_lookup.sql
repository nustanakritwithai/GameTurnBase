-- Implements the fix `.agents/rules/public-profile-lookup-law.md` (AGENTS.md rule 22, adopted
-- 2026-08-08) constrains the shape of: `findPlayerByUid` (the "add friend by UID" flow) has
-- never worked in production, because profiles' only SELECT RLS policy is `auth.uid() = id`
-- (own row only) — a caller looking up someone else's UID always got 0 rows back, silently.
--
-- Per the adopted rule: never widen RLS on `profiles` itself (it also holds gold/gem/flags),
-- never `returns public.profiles`/any full-row type, explicitly revoke EXECUTE from
-- unauthenticated callers. This RPC declares its return shape explicitly — only the 4 fields
-- FriendCandidate (src/types/player.ts) actually needs — so even a client that bypasses the
-- app's own restricted .select(...) (a direct PostgREST/RPC call with the anon key) can never
-- get more than uid/name/level/title back for a row that isn't its own.
--
-- Deliberately NOT the full denormalized "public directory" table outdim's CoalBoard seat
-- designed (the rule's own "What this doesn't mean" section leaves the exact schema open) —
-- friend-add is a low-frequency, on-demand lookup by an exact UID a player already has, not a
-- repeatedly-queried surface like a leaderboard. A synced read-model table is the right move
-- WHEN this project ships something that needs one (leaderboard/guild search); building it now
-- for a single one-shot lookup would be exactly the "no field/table ahead of a real consumer"
-- over-build this project's own Dogfood contracts already reject elsewhere.
--
-- Rate-limited via the shared 0011 helper — a CoalBoard adversary-lens review of the first
-- draft caught that this function, despite implementing a rule whose own item 5 says "rate-limit
-- any lookup-by-guessable-identifier surface against enumeration," shipped with none: UID
-- generation (src/game/uid.ts) resists GUESSING (crypto-random, rejection-sampled), not
-- unbounded RATE — nothing stopped a client from scraping name/level/title for every UID in the
-- space at whatever speed the network allows. 30/60s is looser than earn_gold/grant_item's
-- 20/60s (a lookup isn't a currency mint, no need to match that number exactly) but still turns
-- unbounded scraping into a bounded, throttled one. `language plpgsql` (not `sql`/`stable`)
-- because this function now writes a rate-limit log row on every call via the nested
-- SECURITY DEFINER helper — it has a side effect, so it isn't actually stable.
create or replace function public.find_player_by_uid(p_uid text)
returns table (uid text, name text, level int, title text)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_and_log_rpc_rate_limit('find_player_by_uid', 30, 60);

  return query
    select p.uid, p.name, p.level, p.title
    from public.profiles p
    where p.uid = p_uid
    limit 1;
end;
$$;

-- SECURITY DEFINER alone does not restrict WHO can call a function — that's a separate GRANT,
-- same lesson item 145 already re-learned for column privileges. Callers must be authenticated
-- (a signed-in or guest session); revoke from `anon`/`public` explicitly rather than assuming
-- Supabase's default EXECUTE grant (PostgreSQL grants EXECUTE on new functions to PUBLIC by
-- default) doesn't include them.
revoke execute on function public.find_player_by_uid(text) from public, anon;
grant execute on function public.find_player_by_uid(text) to authenticated;
