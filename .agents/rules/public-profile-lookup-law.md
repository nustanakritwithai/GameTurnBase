<!-- coalmine: verified 2026-08-08 · exemplar CQRS read-model pattern (Microsoft Azure Architecture Center) + PlayFab AddFriend API + Guardian Tales report system · revalidate 90d -->

# Public Profile Lookup Law

> **Scope**: any feature that lets one player look up another player's public info by a player-supplied identifier (UID, username, etc.) — the friend-add flow (`AddFriendPanel.tsx`, `findPlayerByUid`) is the first case, but this binds any future cross-player lookup (leaderboards, guild search, chat mentions).

## Why (real incident, not hypothetical)

2026-08-08: `findPlayerByUid` (`src/data/accountRepository.supabase.ts:322`) queries the `profiles` table directly, filtered by public UID. The table's only SELECT RLS policy is `auth.uid() = id` (own row only), so the lookup returns 0 rows for anyone else in production — the "add friend by UID" feature has never worked. Two fixes were proposed (a public-read RLS policy/view on `profiles`, or a `SECURITY DEFINER` RPC matching the existing currency-RPC pattern); a CoalBoard opinion-lane review (4 blind seats: realtime, reality, feeling, outdim) refuted both as unsafe if implemented naively:

- Postgres RLS is **row**-level, not column-level — a permissive SELECT policy on `profiles` would expose `gold`/`gem`/`flags`/`defeated_npc_ids` to any caller who bypasses the app's own restricted `.select(...)` (e.g. a direct PostgREST call with the shipped anon key). Live-measured this session: the anon key can already reach `profiles` and every existing RPC (`earn_gold` et al.) with no authenticated session, past the SQL body, only stopped by an unrelated NOT-NULL constraint — proving this repo's RPCs have never had `EXECUTE` locked down either.
- Copy-pasting the existing RPC pattern (`returns public.profiles`) for a cross-player lookup reproduces the exact same full-row leak, since every existing RPC is safe today only because it looks up the _caller's own_ row.
- `outdim` (spawned blind, no context on the above) independently designed a separate denormalized "public directory" table synced one-way from the private profile — this is the industry-standard **CQRS read-model pattern** (Microsoft Azure Architecture Center: separate the read model that serves public queries from the write model that holds the source of truth) — and this repo already has exactly this shape: the `friends` table (`supabase/migrations/0001_init.sql` ~line 55) stores a snapshot (`friend_uid, name, level, title`) at add-time, not a live join.

## The rule

1. **Never grant a public/cross-player SELECT policy directly on a table that also holds private state** (currency, flags, admin status, or anything not meant for other players). If a table mixes public and private columns, RLS cannot restrict to "just the public ones" — the fix is a separate table/view, never a looser policy on the shared one.
2. **A cross-player lookup RPC must declare its return shape explicitly** (`returns table(...)` with only the public fields) — never `returns public.profiles` or any full-row type, even for a function that looks safe today. Grep for `returns public\.` before adding a new RPC that looks up someone else's row.
3. **`EXECUTE` on any RPC that can be called by an unauthenticated or under-privileged caller must be explicitly revoked** (`revoke execute on function ... from public, anon`) — do not assume `SECURITY DEFINER` alone restricts who can call it. Verify live (a real unauthenticated request against the deployed function) before trusting this, per the incident above.
4. **Prefer the read-model shape for anything queried repeatedly by other players** (friend lookup, future leaderboard/guild search): a denormalized public table/view synced from the source of truth, not a widened policy on the private table. This project's own `friends` table is the existing precedent to extend, not a new pattern to invent.
5. **Rate-limit or otherwise bound any lookup-by-guessable-identifier surface** against enumeration. UID generation (`src/game/uid.ts`) already uses `crypto.getRandomValues` with rejection sampling for a uniform, non-sequential 10-digit space — keep it that way; do not switch to a sequential or predictable id for anything looked up cross-player.
6. **A social/lookup feature that lets players find each other needs a report/block path before or alongside shipping**, not after. Precedent: Guardian Tales added an in-game report function specifically to prevent player-to-player discomfort in its social features. This repo's `friends`/social system (row 12, `TASKS.md`) currently has neither — flagged as a separate, larger gap this rule does not itself close (do not scope-creep a data-sync fix into building moderation tooling; track it as its own task).

## What this doesn't mean

- Doesn't mandate one specific implementation for `findPlayerByUid` today — it constrains the SHAPE any fix must take (rules 1-4 above), leaving the exact schema to whoever implements it.
- Doesn't cover moderation/reporting itself (rule 6 flags the gap; building it is separate scoped work, gated by the usual TASKS.md claim protocol).
