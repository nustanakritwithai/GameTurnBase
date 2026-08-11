-- Reconcile `cleanup_dead_unplayed_accounts` between production and this repo, and close the
-- deletion defect — the registered-account twin of the guest job fixed in
-- 20260810160000_security_audit_hardening_wave1.sql.
--
-- ── HOW THIS IS DEPLOYED ────────────────────────────────────────────────────────────────────
-- Applied by the OWNER via the Supabase SQL Editor (migration relay), NEVER `supabase db push`,
-- and never by an agent. This file is the durable record of what was pasted.
-- Every statement is RE-RUNNABLE; a double-paste of the whole file is safe.
--
-- ⚠ THIS FILE SCHEDULES NOTHING. `cleanup-dead-unplayed-accounts` was `cron.unschedule`d on
-- 2026-08-10 (MEMORY item 190 Part B) and STAYS unscheduled. Applying this replaces the function
-- body; it does not put the job back on the schedule. Re-arming is the owner's separate,
-- deliberate act — do not read "fixed" as "running". Section 4 at the bottom of this file names
-- every account this job will eventually take and the date each one enters range; read it first,
-- and read it as an inventory, because no output of it authorises anything.
--
-- ── WHICH BODY WAS AUTHORITATIVE, AND HOW WE KNOW ───────────────────────────────────────────
-- Production ran, verbatim:
--     delete from auth.users u
--     where u.is_anonymous is false
--       and u.created_at < now() - interval '30 days'
--       and not exists (select 1 from public.battle_history bh where bh.profile_id = u.id);
-- That is byte-for-byte the FIRST revision of 0014_dead_account_cleanup.sql, commit 1204236
-- (2026-08-08 23:09:29 +0700). Four minutes later commit 835dd95 (23:13:03) added the
-- `cleanup_exempt_profiles` and `topup` guards under the message "add exemption paths to
-- dead-account cleanup BEFORE FIRST APPLY" — the author believed it had not been relayed yet.
-- Production proves it had been, inside that four-minute window.
--
-- So the answer is neither "0014 was never relayed" nor "a later hand-paste overwrote it":
-- **0014 WAS relayed, at revision 1204236, and its three follow-up commits (835dd95, db2c079,
-- 985d4c3) never were.** The committed file is authoritative as INTENT; production carries a
-- stale body that predates every guard the file appears to promise. Anyone reading 0014 in the
-- repo would have concluded the guards were live. They were not.
--
-- ⚠ CONSEQUENCE FOR THIS FILE: `cleanup_exempt_profiles` was introduced by 835dd95, which was
-- never relayed either — so this migration must NOT assume the table, its RLS, or its seed rows
-- exist on production. All three are (re)created here idempotently. If they do already exist
-- (main's 2026-08-10 sweep reported the table present, by a route this file cannot establish
-- from git), every statement below is a no-op. Either way this file is self-sufficient, which
-- is the whole lesson of the 20260810160000 `grant_item` overload: a fix that lives only in a
-- hand-paste is a fix that does not exist for the next environment.

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 1. THE EXEMPTION TABLE — carried here because its own migration never reached production
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Identical shape to 0014:34-38. `if not exists` makes this a no-op where it already landed.
create table if not exists public.cleanup_exempt_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

-- RLS on with zero policies — same pattern as rpc_rate_limit (0011) and item_catalog
-- (20260810160000). Only the SECURITY DEFINER function below, running as owner, ever reads it.
alter table public.cleanup_exempt_profiles enable row level security;
revoke all on public.cleanup_exempt_profiles from public, anon, authenticated;

-- The three standing exemptions from 0014:48-52 (dev/test accounts, MEMORY item 148, plus the
-- standing reusable smoke-test account). Re-seeded because 835dd95/db2c079 never relayed.
-- A profile that no longer exists is skipped rather than failing the paste.
insert into public.cleanup_exempt_profiles (profile_id, reason)
select v.profile_id, v.reason
from (values
  ('e79a973f-fd52-4b84-8e6a-c53a0394db88'::uuid, 'dev/test account (a@a.com) — item 148'),
  ('d0a7b94f-5d95-4e52-8d8f-ebdd835cf695'::uuid, 'dev/test account (kaoshock123, DemoGODRTX) — item 148'),
  ('9baf5833-89d4-401e-9ece-14e46a27a228'::uuid, 'standing reusable smoke-test account (smoketest-prod-verify@katomnoi.studio)')
) as v(profile_id, reason)
where exists (select 1 from public.profiles p where p.id = v.profile_id)
on conflict (profile_id) do nothing;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 2. THE PREDICATE
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠ THE CORE CRITERION IS DELIBERATELY *NOT* THE GUEST JOB'S. Read this before "harmonising"
-- the two functions.
--   * The guest job (20260810160000) reaps DORMANCY: an anonymous account with no activity in
--     30 days. Its purpose is anti-farming, and a guest who played last month but not since is
--     exactly what it is meant to collect.
--   * This job reaps NEVER-ENGAGED registered accounts: "signed up and never played once."
--     0014's own header draws that line explicitly and cites Kakao's three-YEAR window as the
--     figure for accounts that were active and went dormant — a different category this job
--     does not touch.
-- So `not exists (ANY battle_history row, ever)` stays as it is on production. Swapping in the
-- guest job's "no battle in the last 30 days" would WIDEN deletion to every player who ever
-- stopped playing — a policy change nobody authorised, dressed as a consistency fix.
--
-- Everything else is added, and every addition strictly NARROWS the deployed predicate. There
-- is no input for which this deletes an account the deployed body would have spared.
--
-- The four added guards:
--   (a) last_sign_in_at, coalesced to created_at for rows GoTrue has never stamped — the signal
--       the deployed body lacked entirely. `created_at` alone must never decide a deletion.
--   (b) no currency_transactions in 30 days, EXCLUDING source 'signup' — 20260810100000's
--       backfill wrote a signup row onto every pre-existing account at APPLY time, so without
--       this exclusion every account would read as active for 30 days after that migration
--       landed and the guard would be silently inert. (Same trap the guest job documents.)
--   (c) cleanup_exempt_profiles — the table 0014 created and its function never read.
--   (d) any 'topup' ever. A paying account is never auto-deleted, full stop, at any age.
--
-- KNOWN LIMIT, stated not hidden: a registered user who signs in through a persisted session
-- without re-authenticating does not refresh last_sign_in_at (a token refresh is not a sign-in).
-- Combined with "never played a battle" and "never spent or earned currency", the surviving
-- class is "registered, never battled, never transacted, never re-authenticated for 30 days" —
-- and the exempt table is the escape hatch for any real case that surfaces.
create or replace function public.cleanup_dead_unplayed_accounts()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users u
  where u.is_anonymous is false
    and u.created_at < now() - interval '30 days'
    and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '30 days'
    and not exists (
      select 1 from public.battle_history bh where bh.profile_id = u.id
    )
    and not exists (
      select 1 from public.currency_transactions ct
      where ct.profile_id = u.id
        and ct.source <> 'signup'
        and ct.created_at > now() - interval '30 days'
    )
    and not exists (
      select 1 from public.cleanup_exempt_profiles ce where ce.profile_id = u.id
    )
    and not exists (
      select 1 from public.currency_transactions ct
      where ct.profile_id = u.id and ct.source = 'topup'
    );
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 3. EXECUTE LOCK — re-asserted, not undone
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- `create or replace` above preserves the existing ACL, so 20260810160000's revoke survives on
-- its own. This is restated anyway so the lock cannot be lost if this file is ever replayed
-- into an environment that never saw that migration.
-- `authenticated` IS in this list deliberately: Supabase's bootstrap runs
--   alter default privileges in schema public grant all on functions to anon, authenticated
-- so a function created here holds a DIRECT grant to that role and revoking `public, anon`
-- alone leaves it standing. No live role has any business invoking a mass-deletion job —
-- pg_cron runs it as the function owner, which needs no grant at all.
revoke execute on function public.cleanup_dead_unplayed_accounts() from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 4. PRE-ARM PROJECTION — which accounts this job takes, and on what date. An inventory, not a
--    gate. Read it BEFORE any cron.schedule, and read everything under it as well
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠ WHAT WAS HERE BEFORE, AND WHY IT WAS A TRAP (task #92)
-- Until 2026-08-11 this section held the predicate above with `count(*)` in place of `delete`,
-- and one line of instruction: a returned 0 was the stated precondition for `cron.schedule`.
-- It was relayed to the owner in exactly those terms and believed. It bounds nothing.
--
-- Every clock-driven clause in that predicate has the shape
-- `<timestamp> < now() - interval '30 days'`. `now()` binds at the moment the query RUNS, so
-- each clause is an AGE test, and age only ever increases. An account created 25 days ago fails
-- the test today and passes it in six days, with nobody doing anything and no row changing. The
-- currency guard fails from the other side for the same reason: a recent transaction shelters an
-- account only until that transaction is itself 30 days old. Every time-dependent clause here
-- WIDENS the deletable set as the clock runs, and not one of them narrows it.
--
-- So the count never measured the blast radius. It measured the leading edge of a window that
-- keeps advancing — taken at the one moment nobody happens to be due, and read as proof that
-- nobody ever would be. And a cron job does not fire once. It fires every day, forever, against
-- whatever the predicate has swept up by the time it wakes. "How many right now" was never the
-- question that mattered.
--
-- The same predicate, the same population, measured forward in time:
--     2026-09-06 -> 0 accounts
--     2026-09-08 -> 12 accounts
-- Two days apart. Following the old instruction on the first of those dates would have armed a
-- job that deleted 12 real players on the second — with the check having returned exactly the
-- number it was told to require. One deletion cascades through 11 tables; this project runs
-- `pitr_enabled: false` with an empty backup list. There is no undo.
--
-- ── THE REPLACEMENT ─────────────────────────────────────────────────────────────────────────
-- Read-only, free of `now()`, and it answers the question a count cannot: WHICH accounts, and on
-- WHAT DATE each one enters range. `deletable_from` is the exact instant every clock-driven
-- clause in section 2 turns true for that row. Postgres `greatest()` ignores NULLs, so an
-- account GoTrue never stamped falls back to `created_at` — the same thing `coalesce()` does in
-- the function body, spelled shorter. The three surviving `not exists` clauses hold no clock at
-- all: a battle, a topup, or an exemption spares an account permanently, at any age.
--
--   select u.id, u.email, u.created_at, u.last_sign_in_at,
--          greatest(
--            u.created_at,
--            u.last_sign_in_at,
--            (select max(ct.created_at) from public.currency_transactions ct
--             where ct.profile_id = u.id and ct.source <> 'signup')
--          ) + interval '30 days' as deletable_from
--   from auth.users u
--   where u.is_anonymous is false
--     and not exists (select 1 from public.battle_history bh where bh.profile_id = u.id)
--     and not exists (select 1 from public.cleanup_exempt_profiles ce where ce.profile_id = u.id)
--     and not exists (select 1 from public.currency_transactions ct
--                     where ct.profile_id = u.id and ct.source = 'topup')
--   order by deletable_from;
--
-- HOW TO READ THE RESULT. Every row is an account this job takes on or after its own
-- `deletable_from`, so for any candidate firing date, the cohort that run destroys is the rows
-- dated on or before it. Rows dated in the past are already due. An all-future result means only
-- that no account which exists RIGHT NOW is due yet — a far smaller claim than "safe", and one
-- that expires by the clock rather than by any event.
--
-- WHAT IT STILL CANNOT TELL YOU, stated rather than buried:
--   * Accounts that do not exist yet. Every future signup joins this list 30 days later, so no
--     run of this query ever retires the question — an armed job re-asks it daily, and the only
--     honest reading of it is a standing one.
--   * Future activity moves rows OUT and pushes dates LATER (a battle, a topup, a spend, a real
--     sign-in) and never the reverse, so the list is the worst case for today's accounts. That
--     is the direction a safety check has to err in.
--   * The KNOWN LIMIT in section 2 still applies: a persisted session does not refresh
--     last_sign_in_at, so a returning player can sit in this list looking untouched.
--     `cleanup_exempt_profiles` is the escape hatch, and it only helps for a name someone read.
--   * Whether "signed up and never played" is a fair reason to delete a person's account at all.
--     That is task #95, and it is the owner's call — not this file's, and not an agent's.
--
-- THIS SECTION IS NOT A GATE. No output of this query authorises anything, and there is no
-- number that makes arming the job a formality. Arming is a decision taken about named accounts
-- on a named date, or it is not taken.
