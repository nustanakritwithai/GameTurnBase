# MEMORY/27 — Error / Observability System

Caretaker memory. Working knowledge only — git log holds history.

## What I own (contract: `docs/agent-blueprint/27-error-observability-system.md`)

The error-code registry (`src/lib/errors/codes.ts`), the single reporting funnel
(`reportError.ts` + `normalizeError.ts`), the visible-error relay, the two screens that show a
failure to a player (`ErrorBoundary`, `GlobalErrorBanner`), the out-of-React net
(`globalErrorHandlers.ts`), and — since 2026-08-10 — the Edge Function's server-side log
channel, which is the same duty on the other side of the wire.

Not mine: what each caller does about its own failure (retry, fallback, degrade), WebGL/WebGPU
recovery logic itself, non-error toasts, and the decision of whether to ship telemetry at all.
That last one is the owner's, permanently — see below.

## Load-bearing facts about this system

**The `ErrorCode` is this project's stack trace.** There is no external error sink, by a
settled decision (`.agents/rules/ecc/web/observability.md`). The player is the transport: they
read a code off the screen and paste it into an issue. Everything else follows from that — a
code that never reaches the screen is worth nothing, and a failure that reports nothing at all
is invisible forever, because there is no server log to fall back on.

**`no-console` is on repo-wide with three exemptions**, and they are not decoration:
`src/lib/errors/**` (the funnel itself), `src/lib/webVitals.ts`, `tools/**`, and now
`supabase/functions/**`. Adding one is a lint-policy decision that must be written up in
`.agents/rules/lint-policy.md` (rule 13) — never a silent config diff.

**oxlint DOES lint `supabase/functions/**`.** A dispatch told me to "confirm the Edge Function
is outside oxlint's src scope" — it is not; `oxlint --deny-warnings` has no path filter and the
Deno file was in scope. Check, don't assume, before writing `console.*` anywhere.

**`ErrorBoundary` must never statically import a Supabase-backed module.** `main.tsx` imports
the boundary statically, before `createRoot`, and imports `App.tsx` _dynamically_ precisely
because `supabaseClient.ts` throws at module-evaluate time when env vars are missing. A static
import of `accountRepository.supabase` inside the boundary moves that throw ahead of React and
white-screens the whole app — the exact bug main.tsx's long comment records as having happened
in production. The backup button uses `await import(...)` inside the handler. The test suite
catches this (LobbyBattleSession.test.tsx dies first), but only if you run it.

**The `err` argument travels all the way to the visible tier.** `reportError(code, tier, err)`
normalizes once and hands the normalized object to both the sink and every visible-error
subscriber. `GlobalErrorBanner` used to destructure only `(code)` and silently drop it.

## Scars

**A failure that is handled politely is still a failure that must report.** The crash screen's
backup button returned `{ok:false, 'ยังไม่ได้ล็อกอิน'}` 100% of the time for the whole life of
the Supabase migration — it called the dormant localStorage repo, whose `readActiveSession()`
reads a key the live backend never writes. It was invisible because the `ok:false` branch
reported nothing; only the `catch` did, and it never threw. Same shape in five subsystems
(gacha, hero skill/talent/awakening, currency shop, chat send): a Thai toast and no report.
**Rule I now apply: if a branch tells the player something went wrong, it reports.**
(The button itself is now gone, not repaired — see the HOLD below.)

**A read is not always a read.** `source[key]` invokes a getter, and a getter can throw
(revoked Proxy, cross-origin `Window`/`Location`, a hostile object). My first pass at
`normalizeError` read `name`/`message`/`stack`/`code`/`details`/`hint`/`cause` bare, so a
library rejecting with such a value made `reportError` itself throw — and because
`globalErrorHandlers` feeds it fully arbitrary values (`event.error ?? event.message`,
`event.reason`), the last-resort net became the failure. Worse, this was a regression I
introduced: on master `reportError` only handed the raw value to `console.*` and touched no
properties. Every property read in this subsystem now goes through `readProperty`, and
`reportError` wraps the whole normalize step as a structural guarantee. The QC gate caught
this, not me — I had written the invariant "ตัวแปลง error ต้องไม่กลายเป็น error เสียเอง" in a
comment and then honoured it in only one of the two code paths.

**A stale comment is load-bearing.** `ErrorBoundary`'s header asserted "เกมนี้เก็บทุกอย่างไว้ใน
localStorage … ไม่มี backend ให้กู้คืน" long after the Supabase migration, and that false premise
is exactly what justified leaving the button pointed at the dead repo. Doc rot in a comment is
not cosmetic when the comment is the argument for the code beneath it.

**`JSON.stringify(new Error('x')) === '{}'`.** `name`/`message`/`stack` are non-enumerable. Any
report that leaves the console — a sink, a file, a string the player copies — loses the entire
error unless it is normalized field by field first. Supabase's `PostgrestError` is worse: it is
a plain object whose `code`/`details`/`hint` carry the real cause (42501 = RLS) while `.message`
stays generic.

**One code for four call sites destroys the signal it was added to create.** `usePvPRoom` used
`PVP_AUTHORITY_FAIL` for create/join, input, reconnect and disconnect. "Can't enter a room" and
"in a room but inputs aren't reaching the server" are different bugs with different severities
and were indistinguishable in the logs.

## CLOSED — the second export surface (`SettingsModal`), branch `fix/boot-resilience`

The HOLD below said `SettingsModal.tsx`'s "ส่งออก save เป็นไฟล์" button was the same broken
promise, outside my fence, still on screen. It is no longer outside my fence — this dispatch's
constraint list didn't forbid `useAuth.ts` or `SettingsModal.tsx`, so I removed the button, the
`onExportSave` prop threaded through three layers (`App.tsx` → `LobbyPage.tsx` →
`SettingsModal.tsx` → its inner `GameInfoPanel`), the now-dead `exportSave` callback in
`useAuth.ts` (and its now-unused `downloadSaveJson` import), and the prose paragraph's claim
that "ปุ่มส่งออก save ด้านล่างมีไว้สำรองไฟล์เก็บเอง" (the button below exists so you can back up a
file yourself) — false, same as the crash screen was. `SettingsModal.test.tsx` pins the
button's absence and the toast's disappearance, same shape as `ErrorBoundary.test.tsx`.

**Still did NOT touch `accountRepository.supabase.ts` itself** — building a real server-side
export is a persistence-lane feature (what would "export" even mean server-side — a full RPC
dump?), not a UI-honesty fix, and out of scope for this dispatch regardless of the file fence.

**The `email` field in the dormant repo's export allowlist (`accountRepository.ts:483`) —
verdict: correct, not a leak, evidence recorded.** Reasoned it out rather than reflexively
stripping it, per the dispatch's own instruction:

- **Who can trigger it:** `exportSave()` reads `readActiveSession()` then indexes
  `loadDb().accounts[session.email]` — only the currently-logged-in player's OWN account. There
  is no code path to export anyone else's record.
- **Where the file goes:** `downloadSaveJson()` is a browser `Blob` → `<a download>` — it never
  leaves the device except by the player's own later choice (attach to a bug report, move to a
  new browser). Nothing in this codebase transmits it anywhere.
- **Is a player's own email in their own downloaded file a disclosure?** No — they already know
  their own email; nothing new reaches them or anyone else by the act of export. Contrast with
  `passwordHash`/`passwordSalt` (already stripped, session before this one): that pair is
  credential material useful to an ATTACKER who later obtains the file, with zero benefit to the
  legitimate use case. `email` is the opposite: `importSave()` requires it as the re-import key
  (`normalizeEmail(account.email)` — see that function) — stripping it would silently break the
  feature's entire purpose (move to a new device / restore your own backup) for no security gain.
- **Reachability, as of this branch:** `accountRepository.ts` (the dormant repo hosting this
  allowlist) now has **zero production importers** — confirmed by repo-wide grep. Its
  `exportSave()` is only reachable from its own test file. This is a secondary point, not the
  main argument (dead code can be re-wired later, so the reasoning above has to hold on its own
  merits) — but it means there is no LIVE exposure today regardless.

**Record this so the next audit doesn't re-raise it as a fresh finding without this context.**

**Dead code recorded, not fixed (as instructed):** `src/lib/errors/codes.ts:49`'s
`SAVE_EXPORT_FAIL` now has genuinely zero call sites — the one path that could have reported it
(`useAuth.ts`'s `exportSave` callback) is deleted entirely on this branch, not merely still
unreported. Leave the code for whoever wires a real sever-side export; it is the right code for
that path when it exists.

**Note for main — possible `SECURITY.md` fold:** main's re-sync note said `SECURITY.md` already
records that no production module imports the local `accountRepository` any more. Worth adding:
neither surviving UI surface (crash screen, Settings) offers ANY export today — both were
removed for promising a capability the live backend doesn't have. The `email`-in-allowlist
question above is about currently-dead code, strengthening rather than needing to soften that
claim.

## CLOSED — QC bounce: the deletion stopped one layer short (2026-08-10)

Removing the `SettingsModal` button removed the top link of a chain; three things beneath it
were left dead, two of them in comments the deletion made false. Fixed, not just recorded:

- **`src/lib/errors/codes.ts`'s `SAVE_EXPORT_FAIL`** — had zero call sites repo-wide. Deleted
  the entry and its comment (`// ... SILENT เพราะปุ่มที่กดแสดงข้อความบอกอยู่แล้ว` — pointed at a
  button that no longer existed). Chose delete over correcting the comment: the capability is
  fully gone now (see next point), not merely under-used, so there is nothing plausible left to
  justify keeping a dead entry around. A future real export gets a fresh code with an accurate
  comment when it exists.
- **`src/lib/saveFile.ts`** — deleted outright. Zero importers (`useAuth.ts` was the last, and
  my own earlier `+0 −13` on this branch removed it). This one I had genuinely missed — not
  named anywhere in this file before the bounce. Its header claimed "สองที่เรียก" (two callers):
  the crash screen (removed two sessions ago) and Settings (removed this session) — both gone,
  the file asserted two live callers against zero.
- **`accountRepository.supabase.ts`'s `exportSave` stub** (was lines 881-886) — deleted. Zero
  non-test callers, and `accountRepository.shared.ts:154`'s `AccountRepositorySubset` already
  excludes `exportSave`/`importSave` by design, so nothing outside this file depends on it
  existing at all.
- **Two test comments corrected**, not just the production code: `ErrorBoundary.test.tsx` and
  `SettingsModal.test.tsx` each had a block asserting present-tense that
  `accountRepository.supabase.ts` "ยัง hardcode ok:false" / "ยังเป็น stub" (still hardcodes /
  still is a stub) — true when written, false the moment the stub above was deleted. Reworded
  to state there is currently no server-side export function at all, past tense on the stub's
  history. The lesson generalizes: a comment naming a specific mechanism ages worse than one
  naming the outcome — "still a stub" broke the instant the stub was deleted, "no export
  exists" would not have.

**Found while sweeping, NOT fixed — flagged as pre-existing, cross-file, out of this dispatch's
scope:** `docs/agent-blueprint/27-error-observability-system.md` (this system's OWN contract)
still asserts `ErrorBoundary.tsx` imports `exportSave` from `src/data/accountRepository` and
lists `SAVE_EXPORT_FAIL` as a live fed code — both stale since the crash-screen button was
removed two sessions ago, predating this branch entirely. `docs/agent-blueprint/25-*.md` (a
DIFFERENT system's contract — not mine to edit, contract walls apply) and
`docs/BLUEPRINT-CHECK-HOLD.md` (an owner-level HELD design doc) carry the same stale stub
citation. Recommend a citation-refresh pass across `docs/agent-blueprint/**` the next time any
caretaker touches their own contract file — a mechanical checker over this class of drift was
already proposed as task #24 (see `MEMORY.md` item 183) and would have caught this for free.

## HOLD — the crash screen cannot back up a player's data, and no code I own can fix it

**Status: the backup button is REMOVED, not fixed.** Do not read the closed F1 entries in
`MEMORY.md`/`TASKS.md` as "the backup works now" — it does not exist.

**Updated 2026-08-10 (QC bounce on `fix/boot-resilience`): the stub itself is also gone now,
not just its callers.** The paragraph below is kept as the historical record of why the button
was removed — `accountRepository.supabase.ts:763-768` `exportSave()` **used to be** a hardcoded
stub that always returned `{ ok: false, error: 'ฟีเจอร์นี้ใช้กับบัญชี Supabase ไม่ได้ —
ข้อมูลอยู่บนเซิร์ฟเวอร์แล้ว' }`. Once both callers (`ErrorBoundary`, `SettingsModal`) were removed,
the stub had zero callers left and `accountRepository.shared.ts:154` already excludes
`exportSave`/`importSave` from the required contract, so it was deleted outright — see the new
section below this HOLD for the full list of what else went with it (`saveFile.ts`,
`SAVE_EXPORT_FAIL`). **Re-adding server-side export now means writing a new function, not
un-stubbing an old one.**

So the button failed 100% of the time both before and after I first repointed it: first
answering "not logged in" (dormant repo), then answering "this feature doesn't work" (live
stub, since deleted). Two different sentences, one identical outcome — the player never got a
file.

I removed the button rather than relabel it. A crash screen that tells a frightened player to
press a control which always errors is worse than a screen with no control at all, and a
relabel keeps the broken control on the screen. The screen now states plainly that progress is
saved on the server and offers only "โหลดใหม่", which actually works.
`ErrorBoundary.test.tsx` pins the absence, so re-adding it without fixing the stub goes red.

**A real fix needs `accountRepository.supabase.ts` — the persistence lane's file, outside my
fence — or an owner decision** on whether a server-side export is wanted at all (arguably it
is not: the data is already durable server-side, which is exactly what the stub's message
says). If it lands, re-add the button here and delete this HOLD.

**Second surface, same root cause — CLOSED on `fix/boot-resilience`, see the section above this
HOLD.** `SettingsModal.tsx`'s "ส่งออก save เป็นไฟล์" button routed through `useAuth.ts:348` to the
same stub and toasted the same error every time; it is now removed the same way this one was.

**Method scar from this one:** the old tests missed it for two rounds because all three
`vi.mock`'d `accountRepository.supabase` wholesale and asserted an `ok:true` path the real
module cannot produce. A mock that fabricates a return value the real callee never returns
tests the test author's belief, not the system. When mocking a module boundary, check the real
implementation can actually produce the value being mocked.

## Open / deliberately not done

- **No sink is wired.** `setErrorSink()` exists with the console as its default; picking a real
  destination is the owner's call. My recommendation is on the branch's dispatch report: a
  Supabase table + `INSERT`-only RPC fits the existing stack and keeps the no-third-party
  decision intact.
- **`webVitals.ts` still early-returns unless DEV.** Field CWV has nowhere to go until a sink is
  chosen; shipping collection first would be speculative work. Revisit when a sink lands.
- **Star ascension** (`ascendCharacterStar` call site) was outside my dispatch's file list and
  still has no `reportError`. Same defect class as the five I closed.
- **The crash-screen backup** — see the HOLD above. Blocked on the persistence lane, not on me.

**#70 (boot: session-restore promise had no `.catch()`) — verified already closed, not
re-done.** A `fix/boot-resilience` dispatch asked me to fix this; `useAuth.ts`'s restore effect
already has a `.catch()` (`reportError('AUTH_SESSION_RESTORE_FAIL', 'visible', cause)` then
`setStatus('guest')`), landed by a DIFFERENT lane's commit `0bee26d` ("F4" in that commit's own
language, same finding number the audit used) before this dispatch reached me. `git log -S` on
the code confirms that commit is the sole origin. `useAuth.test.tsx`'s
`describe('F4: session restore never leaves the game stuck at loading')` already asserts the
reject-then-degrade behavior and passes (7/7 in that file). I did not duplicate the fix or the
test — `App.tsx` branches on `status`, and `'guest'` is exactly the state that renders an
actionable `TitlePage` + openable `AuthModal`, confirmed by reading the render logic directly
rather than assumed.

**Recorded, not fixed (not mine — identical on master, flagged by the QC gate):**
`useAuth.ts`'s `void refreshLinkedProviders()` at four call sites (after restore, after
register/login, after `loginAsGuest`, after `linkGoogleAccount`) discards a promise whose callee
awaits a live Supabase call (`accounts.getLinkedProviders()`) with no `try`/`catch`. Not
blocking: `setStatus(...)` already ran before each of these fires, so the app is interactive
either way, and `globalErrorHandlers.ts` catches the rejection as `GLOBAL_REJECTION` at
`'visible'` — a generic but real, reported failure, not a silent one. The degraded consequence
worth knowing: on a rejection, `hasGoogleLinked` stays `false`, so `SettingsModal` offers
"เชื่อมบัญชี Google" to a player who already linked, under `GLOBAL_REJECTION`'s generic message
instead of a code that names what actually failed. Fix, if picked up: wrap each call site (or
`refreshLinkedProviders` itself) in a `try`/`catch` reporting a dedicated code — the same shape
as every other `useAuth.ts` mutation already uses.

## CLOSED — the export-leak finding was re-raised, re-measured, and is stale (2026-08-11)

A fresh audit dispatch arrived carrying the original finding verbatim ("the crash-screen backup
export can carry `passwordHash`, `salt`, and the account email"). Re-measured from scratch rather
than trusting either the finding or this file: registered an account, called the real
`exportSave()`, walked the produced JSON and dumped every key at every depth.

**What actually reaches the file today:** `exportVersion`, `exportedAt`, and `account.{uid, email,
createdAt, player, transactions}` — 57 key-paths, deepest 7 levels. `passwordHash` and
`passwordSalt` are absent at every depth. Two of the finding's three fields were already fixed in
`464637d` (which changed `account: StoredAccount` — the whole record — to the explicit allowlist
`{uid, email, createdAt, player, transactions}`); the third, `email`, is present by the deliberate
verdict recorded above. **Nothing to strip. No production code changed.**

The finding is also unreachable three ways over: the crash-screen button is gone (`7af8885`), the
Settings button is gone, and `accountRepository.supabase.ts` — the only repo any production module
imports — has no `exportSave` at all. `accountRepository.ts` still has zero production importers.

**What DID change: the test that guards it no longer rots.** The old assertion was two hand-listed
names (`json.not.toContain('passwordHash')`), which says nothing about a sensitive field added
later to `Player` or `CurrencyTransaction` — and `exportSave` passes both of those through whole,
so the allowlist's "a new sensitive field can't leak unnoticed" guarantee stops at depth 1. The
test now walks every key at every depth and matches on a key _pattern_ (the same set as
`normalizeError.ts`'s `SENSITIVE_KEY`), with `$.account.email` allowed by full path — not by key
name, so an `email` anywhere else still fails. Proven non-vacuous by injecting two regressions:
restoring the pre-`464637d` whole-record export (red), and nesting a `linkedAuthEmail` inside
`player` (red, naming `$.account.player.linkedAuthEmail` — the old test passed this one silently).
A size+depth floor keeps it from passing empty if the payload shape ever collapses.

**For the next auditor: this finding is closed. Re-raising it needs new evidence, not a re-read.**
