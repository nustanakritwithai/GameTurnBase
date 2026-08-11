# Changelog

Format based on [Keep a Changelog 2.0.0](https://keepachangelog.com/en/2.0.0/).
Versioning follows [Semantic Versioning 2.0.0](https://semver.org/).

> **Language:** entries are written in English. Releases 0.15.1 and earlier carry
> some Thai and are left as written — a shipped release note records what was said
> at the time; it is not a document to retrofit.

## [Unreleased]

## [0.18.0] - 2026-08-11

A release about things that read as safe and were not. A verification instruction
that could only ever return "all clear". A secret scan that reported green because
its own lookup never ran. A login error that named the wrong cause. Five commits
carrying a key that a revert could not reach. The common shape: **a check that
agrees with itself, and never asks who else depends on the answer.**

### Security

- **A shipped migration told the operator that a count of zero meant it was safe
  to arm an account-deletion job.** Zero on 2026-09-06; twelve two days later.
  Every clock-driven clause in that check has the form `<timestamp> < now() -
interval '30 days'` — an age test, and age only increases — while the clause
  that _shelters_ an account expires by the same arithmetic. Every term widened
  the deletable set as the clock ran and not one narrowed it, so the count was
  never a blast radius; it measured the leading edge of an advancing window at the
  one moment nobody was due. The replacement contains no `now()` at all: it
  projects a `deletable_from` date per account, so there is nothing left to
  misread as a green light. SQL body unchanged
- **Both account-deletion cron jobs are disarmed in a file, not just on one
  database.** `cron.unschedule('name')` raises when the job is absent, so the
  statement is set-based on purpose and re-runs clean. The functions are
  deliberately left in place; only the schedules are gone
- **The login error stopped naming a cause it could not know.** One message
  covered a wrong password, a deleted account and a network failure alike. Two
  Supabase codes that would have distinguished them were **removed rather than
  shipped**: `email_not_confirmed` and `user_banned` fire only for an address that
  _has_ an account, which is the account-existence oracle `invalid_credentials`
  deliberately avoids. Measured before deciding — `mailer_autoconfirm: true`, zero
  unconfirmed users, zero banned — so the first cannot fire today, and the day it
  could is the day custom SMTP arrives. It would have armed itself exactly when
  the recovery flow shipped
- **A Supabase publishable key and the project URL were removed from history,
  not silenced.** A revert had taken them out of the working tree the day before,
  but a scan walks commits, and a commit that exists cannot be un-found — so the
  secret scan stayed red on every push. History was rewritten across the five
  commits that carried them: 743 commits before and after, file contents
  byte-identical to the old tip, none of the 28 tags affected. The proof it worked
  is that `.gitleaksignore` could then be **deleted**, and the scan came back green
  on a commit that does not contain it. An alarm with nothing to report is not the
  same as an alarm told to stay quiet
- **Account enumeration is now a named, reportable class in `SECURITY.md`**, with
  the two known exceptions written down rather than left to be rediscovered

### Fixed

- **Two objective HUDs could describe the same stage differently.** One HUD now,
  with validity guards shared by both objective paths and a safe fallback when a
  stage carries no objective (external PR #107)
- **A Realtime migration aborted itself.** `alter table realtime.messages enable
row level security` targets a platform-owned table; it fails on ownership and
  takes the whole file down with it, leaving no policy at all. The migration is
  policy-only now, and the PGLite harness still models the platform default so
  removing that line turns three tests red (external PR #109)
- **PR #111 reverted.** Six commits, three unrelated topics, merged straight to
  master past a gate that had already bounced part of it

### Tests

- **`loadPlayer`'s guard was covered for five of its eight read slices.** Because
  all eight share one branch, five green rows read like proof of a branch three
  slices had never entered. The table list is now discovered from the calls the
  code actually makes, with a tripwire that fails if the query count changes
- **The save-export credential guard now walks every key at every depth** and
  matches a key pattern rather than a name list. The previous allowlist promised
  new sensitive fields could not leak unnoticed, but two sub-objects passed through
  whole — the promise stopped one level down
- The new pre-arm projection is pinned twice: as source text, and **executed** —
  lifted out of its comment block and run against the fully replayed migration
  chain on a fixture where the old check reads a clean zero

### Governance

- **`master` went from one required check to ten**, with up-to-date-before-merge
  enforced and self-merge closed: an approval is required, stale approvals are
  dismissed, and the last pusher cannot be the approver. `CODEOWNERS` makes it the
  owner's approval specifically — "one approval" never said whose, and two
  non-admin collaborators could close the loop between them
- **Outside code lands from a fork.** A repository ruleset restricts branch
  creation and updates, so a non-admin contributor forks and opens a pull request
  rather than pushing a branch here. Break-glass for admins is unchanged and
  deliberate

### Credits

- **nustanakritwithai** — external PRs #107 and #109, both taken in through the
  belt. #109 is also the standing evidence for a gap no local test can cover: the
  Realtime ownership error is a property of Supabase's hosted schema at runtime,
  and it was found by running the migration against a real project, not by reading
  it

## [0.17.0] - 2026-08-10

No new toys. This release swaps the material of an existing skeleton. All of it
traces to one 12-agent audit (MEMORY.md item 189) that returned 52 findings,
worked off across nine belt lanes, each cleared by a QC gate spawned fresh.
**Every lane was bounced at least once, and nearly every blocking finding was the
same species: correct code with nothing pinning it there.**

### Security

- **Mass account-deletion RPCs were callable without authenticating.** Twelve
  SECURITY DEFINER functions shipped with no EXECUTE revoke, and four of them are
  deletion or cleanup jobs with no `auth.uid()` guard — "delete every dormant
  account" sat one HTTP call away from the anon key. The four cleanup jobs now
  revoke **from `authenticated` by name** — Supabase's bootstrap grants that role
  directly, so revoking `public, anon` alone would have left them wide open — while
  the eight client-callable RPCs keep it deliberately and gate on `auth.uid()` in
  the body (`20260810160000`)
- **`grant_item` never validated the item id** — self-mint anything into your own
  inventory, including unreleased items. Closed with an RLS-locked `item_catalog`
  no client role can read or write, seeded 1:1 against `items.ts`
- **Two `grant_item` overloads coexisted.** The surviving 3-argument one had no
  ledger idempotency at all. Production had been hand-patched, but the fix lived
  in no migration file, so every fresh environment silently rebuilt the hole
- **The rate limiter never recorded a denial**, and a malformed argument throttled
  nothing. Validation now runs before the rate-limit call, and `raise warning` is
  the one channel that survives the rollback

### Fixed

- **Cleanup jobs deleted on account AGE, not inactivity — both of them.** A guest
  playing daily was deleted on day 31, and the registered-account sibling used the
  same predicate. Measured against production: **15 of 17 accounts** qualified
  within 30 days. Both jobs were disarmed on discovery, the predicate now reads
  real activity, and the guest job is re-armed after a PRE-ARM count returned 0.
  The sibling **stays disarmed** until its own PRE-ARM runs — and today's 0 is not
  a permanent safety property (`20260810170000`)
- **One network blip at boot bricked the game permanently** — `useAuth` session
  restore had no `.catch()`. It now degrades to a playable guest state behind a
  banner carrying a copyable code
- **The crash screen's "back up your data" button was 100% broken** — on the one
  screen that promises a player their data is safe. Deleted, not repaired: a button
  that always errors is worse than no button. Its twin in Settings called the same
  stub and went with it, along with the copy promising a backup file
- **The durable pending-reward row was written too late to cover its own crash
  window.** It now lands the moment the battle resolves, before the player touches
  anything, and the transaction id no longer derives from the client clock — a
  backwards clock jump used to void a whole battle's rewards while reporting success
- **An upgrade's effect persisted while its cost evaporated** (#26/#35). `savePlayer`
  could write `skill_levels`/`talent_state`/`awakening_state` but not `profiles.gold`,
  column-locked since `0009` — so the client's gold debit was dropped on save. Free,
  unlimited upgrades. Closing that door exposed a sibling: `commit_lobby_battle_progression`
  declared the same three columns as `SECURITY DEFINER` parameters and wrote them
  verbatim, where no client-side revoke can reach. QC measured a full upgrade sweep,
  priced by the table at **2,940 gold**, completing for nothing. The server now prices
  every upgrade from an RLS-locked catalog the client cannot read — no price crosses
  the wire — and debits and applies in one transaction, with a compare-and-swap on
  true server state as the replay guard. The three parameters were **removed from the
  signature** rather than ignored: a retained-but-unused parameter still answers 200
  through PostgREST, so a client writing a server-owned column would get a silent
  success — the same lie the fix exists to end
- **`savePlayer` silently dropped `friends`**, with a guard test that fails when
  someone adds a field and forgets the payload
- **Corpses shoved living enemies 105 units** — measured with a fixed-seed probe
- **A gold-priced gacha banner would charge gems and report gold** — the schema no
  longer permits that lie

### Added

- **Error egress** — a swappable sink, console-only by default. Zero egress was
  proven rather than assumed: the Edge Function had 0 log lines across 238. Every
  failing path now emits a structured log
- **`assets/ATTRIBUTION.md`** — 870 shipped assets previously had no provenance
  record of any kind; 849 now have a git-verified author. **Deliberately still a
  draft**: reference-image sources are unrecorded, and Blender turned out to be in
  the chain, which opens a second question about where the 3D models came from.
  Seven correction rounds, each retraction recorded in the file rather than erased
- **Branch protection** — PR required for outsiders, required check
  `Continuous Integration`, `enforce_admins` deliberately false (GitHub forbids
  self-approval; a solo owner would be locked out of their own repository)

### Changed

- **CI / release** — two workflows published the same required-check name and one
  was a bare echo, which is why branch protection could not be configured correctly
  · `deploy.yml` now runs the full `npm run ci` plus a blocking audit instead of a
  partially-copied command list · the bundle budget set a higher ceiling for app
  code than vendor code, contradicting its own stated rule, and classified app code
  as vendor
- **`tools/test-lock.sh`** — lanes may write concurrently but must take turns
  running tests; contending for CPU produced false failures a gate cannot
  distinguish from a real regression

### Server state

- **The progression-cost migration was applied after this build reached
  players, in that order on purpose.** `20260810180000` revokes UPDATE on
  `owned_characters` and drops the 21-argument
  `commit_lobby_battle_progression`, both of which the previously deployed
  client still used — applying it first would have turned every save into a
  `42501` (rolling back team, friends and flags, not just progression) and every
  battle commit into a `PGRST202`. Verified on production 2026-08-11: the cost
  catalog holds 21 rows and is unreachable from the client, the RPC is down to a
  single 18-argument overload, and `authenticated` holds no UPDATE on
  `owned_characters`. One residue: the revoke names `authenticated` only, so
  `anon` keeps a table-level UPDATE grant. RLS closes it — the UPDATE policy
  requires `auth.uid() = profile_id`, which no anonymous request can satisfy —
  but the migration's own comment claiming the client is left "no writable
  column at all" overstates what it did

### Credits

- **kaoshock123** — author of **849 of the 870** shipped art assets, confirmed
  against git history, and the questionnaire respondent whose first-hand answers
  put the provenance record on testimony instead of inference
- **nustanakritwithai** — external PRs taken in through the belt, plus 20 committed
  image files (moves and format conversions rather than authorship — recorded
  separately in the attribution file, because crediting the wrong person is a
  different failure from counting wrong)
- **mehvetero** — security reports that remain the origin of this release's
  economy-side work
- **TheColliery's belt** — a handoff on resource contention during parallel test
  runs; every claim was checked against this repository before being adopted as
  TASKS row 31, with four documented departures from theirs

## [0.16.0] - 2026-08-10

### Added

- **Erlang Shen (`spear-warrior`), the 7th playable hero.** A three-hit spear chain, the
  Three-Hound Assault skill (three hound projectiles), and a distinct `assassin` archetype. The
  external PR that proposed him re-skinned every enemy to his sprite and 404'd his walk sheet; the
  belt salvaged the verified-correct kit + hound effect and redid the breakage, and along the way
  fixed a repo-wide gap where every hero's `attack-2/3` frames were dead (a hard-forced `attack-1`).

### Fixed

- **Stage-objective clock.** One intro-exclusive `stageElapsedMs` now drives both the victory
  check and the on-screen HUD, closing a ~700ms gap where the timer disagreed with the verdict on
  Survival / Chase / Time-Attack stages.
- **Battle stage / camera / dungeon sync.** Smaller stage-objective HUD footprint, a wider combat
  camera framing (no hitbox change), and dungeon sprites no longer persist from the previous stage
  (the runtime subscription went stale after a stage swap) — with a regression test now pinning the
  fix so it cannot silently regress.
- **Gacha unready-banner freeze.** The Standard Banner's five placeholder heroes are gated behind
  one production-readiness flag so they cannot be pulled before they are real.

### Security

- **Server owns progression (level / EXP).** `profiles` and `owned_characters`
  `level`/`exp`/`exp_to_next` were client-writable — directly via `savePlayer`, and via the
  `commit_lobby_battle_progression` RPC, which any authenticated client could call with arbitrary
  values (a replayable client-supplied idempotency guard, no rate limit, no bound) and which would
  MINT an unowned hero at any level. Closed by migration `20260810130000` (applied and verified
  live on production): a column lock on both tables, a server-owned idempotency ledger, a rate
  limit, an ownership check (UPDATE-only — no mint), per-call level bounds, and an `EXECUTE` lock.
  The client remains the author of PvE outcomes (the game's accepted model); forging progression is
  now bounded and non-trivial rather than free. Designed by a CoalBoard review — three independent
  lenses converged that a plain column-revoke would have left the RPC back door wide open.

### Credits

- **mehvetero** — the security report that scoped this work (the `earn_gold`/`topup` and
  client-writable-progression findings) and twelve live probes on an isolated test instance that
  cross-checked the fixes.
- **nustanakritwithai** — the battle stage/camera/dungeon PR and the Erlang Shen, stage-objective,
  and gacha-freeze PRs, each reworked and landed through the belt rather than merged as-is.

## [0.15.2] - 2026-08-10

### Fixed

- **The v0.15.1 PvP gate leaked.** It lived inside `MainNavigation`, but `LobbyPage` opens the same
  modal from a second path — `?modal=pvp`, read straight off `window.location.search` and live in
  production — so the modal could still be reached against the undeployed backend. The flag moved to
  `src/game/featureFlags.ts` where every entry point reads it, and a test now asserts that each site
  which can set `pvpOpen` consults it and that neither file re-declares its own copy. Found by a
  rot-canary pass over the v0.15.1 fix itself.

## [0.15.1] - 2026-08-09

### Fixed

- **The PvP button reached live in v0.15.0 while its backend did not.** Merging #96 bumped the
  version, which is what the deploy gate keys off, so the button shipped before
  `20260809064000_p12_private_pvp_rooms.sql` was applied and before the `pvp-authority` Edge
  Function was deployed — every tap produced an error the player could do nothing about. The
  button now falls through to the coming-soon toast until `PVP_BACKEND_DEPLOYED` is flipped, which
  should happen only after the migration is applied AND the Edge Function is deployed and verified
  with two real clients.
- The Gacha (**อัญเชิญ**) button shipped in the same state; its migration has since been applied to
  production and verified read-only (RPC present, four tables with RLS enabled, banner rate table
  summing to exactly 1.000000, `EXECUTE` granted to `authenticated` but not `anon`), so that button
  now works rather than being gated.

## [0.15.0] - 2026-08-09

### Added

- Private 1v1 PvP room prototype (#21): six-character invite codes, a JWT-verified Edge Function
  as the sole authority, client prediction with authoritative reconciliation, participant-only
  Realtime snapshots, and reconnect/forfeit handling. Not deployed — the migration and Edge
  Function still need applying before it works live.
- Ranked power normalization (#20) — Hero Level and skill levels are pinned to their caps for
  ranked play; star is deliberately the only progression gap left.
- Lobby Standard Banner with five disclosed Hero playstyles, authenticated server-side RNG,
  atomic Gem debit, hard pity, duplicate shards, and request-id replay protection
- Active-Hero selection in the Character Roster; the selected Hero is saved to the current
  one-Hero dungeon slot
- Objective-specific battle HUD feedback and visible arena markers for Chapter 1 survival,
  defend, chase, hazard, mini-boss, and time-attack stages

### Fixed

- Connected the lobby **Summon**, **Heroes**, and **Battle** paths to their existing game systems
  instead of presenting summon as coming soon or every stage as a generic Wave fight

## [0.14.1] - 2026-08-09

### Fixed

- **Google login left the session token sitting in the URL, and did not actually sign the user in.**
  Both OAuth entry points passed `window.location.origin` as `redirectTo`, but the game is served
  from `/LegendOfSoulTH/` and `origin` always strips the path — so Google sent users to
  `https://katomnoistudio.github.io/` (a 404 page with no app on it). Nothing was there to consume
  the callback, so the access token stayed in the address bar and browser history, and the login
  silently failed. Reproduced on a real device before and after the fix.

### Security

- Auth now uses the **PKCE flow** (`flowType: 'pkce'`) instead of supabase-js's default implicit
  flow. The callback carries a single-use `?code=` that is worthless without the `code_verifier`
  held in the originating browser, so a copied login URL can no longer hand anyone a live session —
  previously the URL fragment carried the raw JWT.
- `SECURITY.md` now lists session-token exposure in scope, and `.env.local.example` names the exact
  Supabase Redirect URLs that must be whitelisted.

## [0.14.0] - 2026-08-09

### Added

- **P11 PvE Content Expansion — Chapter 1** (`trial-01`..`trial-10`):
  - Distinct encounter patterns: wave, survival, defend, chase, hazard, mini-boss, time-attack, boss
  - Per-stage `difficultyMultiplier`, `targetDurationMs` pacing metadata (normal 2–5 min, boss 5–8 min)
  - Per-stage reward tables (`stageRewardConfig.ts`) with first-clear bonuses wired through `RewardSystem`
  - `trial-08` upgraded to mini-boss (`demon-warlord`) with two-wave structure

### Changed

- Energy/stamina numerics locked for production: max 120, regen 60/hr, cost 10, boss 2× (`energySystem.ts`)
- Gem full-refill skeleton (`refillEnergyToMaxWithGems`, 50 gems) — UI wiring still deferred
- Boss `trial-10` difficulty multiplier tuned to 1.2

## [0.13.0] - 2026-08-09

### Added

- **P10 Production Batch 01** — 5 playable archetypes proving the hero pipeline before scaling to 10 → 20 → 50:
  - Fighter: `monkey-king` (existing production art)
  - Heavy: `pig-warrior` (new kit + combo)
  - Ranged: `celestial-archer` (จือหลาง — placeholder sprites)
  - Control: `nezha-warden` (นาจา — CC without knockdown)
  - Summoner: `sand-sage` (ชาหวู่จิง — summon + heal effects)
- Per-hero attack chains (`src/game/heroes/attackChains.ts`), skill kits (`src/game/heroes/kits/`), finisher table, gacha pool skeleton, star scaling table
- Runtime wiring for skill `effects[]` (heal/buff/cc/summon), ally summon AI, and CC control lock
- Art handoff doc: `docs/hero-production/PRODUCTION_BATCH_01.md`

## [0.12.5] - 2026-08-08

### Fixed

- ปุ่ม **ต่อสู้** ในล็อบบี้แสดงหน้า **เลือกด่าน** ได้เสมอ — กู้รางวัลค้างจากรอบก่อนไม่ปิด overlay ทันทีอีกต่อไป
- ปุ่ม **เริ่มการผจญภัย** (ราหู) เปิดหน้าเลือกด่านเดียวกัน — ไม่เข้า DungeonSession ตรงอีกต่อไป
- StageSelect ใช้ z-index ระดับ scene overlay และ mount หลัง WukongAdventure เพื่อไม่ให้ฉากเดินทับ modal

## [0.12.4] - 2026-08-08

Battle presentation hotfix following HetCreep's mobile review; sprite-sheet replacement remains paused for the incoming asset set

### Fixed

- Current character art is lifted at a nested visual-container boundary so feet land on battle Y=0 without moving the shadow, gameplay entity, hitbox/hurtbox, or sprite frames
- Combat controls use the revised §3.3 curved `S1 → S2 → S3 → ULT` thumb cluster around the larger ATK button
- Joystick and action buttons clamp to device safe areas; deterministic geometry tests cover four landscape viewport profiles and reject control collisions

### Changed

- Master Blueprint §3.3 supersedes the temporary straight-row layout with HetCreep's 2026-08-08 Combat Cluster lock

## [0.12.3] - 2026-08-08

Deploy fork PR #73 integration slice (P6 boss + P7 adventure/energy + reward idempotency) plus upstream backend hardening — live was still on 0.12.2 which only covered battle UI fixes

### Added

- P6 spirit guardian boss combat (upstream PR #62)
- P7 staged adventure progression and energy skeleton (upstream PR #63)
- Lobby battle reward pipeline with ordered-partial-commit idempotency (`lobbyBattleRewardPipeline.ts`, `0013_reward_idempotency.sql`)
- Supabase RPC rate limiting (`0011_rpc_rate_limit.sql`) and public profile lookup (`0012_public_profile_lookup.sql`)
- PGLite integration tests for reward idempotency migration chain

### Fixed

- Lobby battle rewards: refId-guarded gold/item grants, atomic progression commit, pending snapshot resume after reload
- Friend lookup via `find_player_by_uid` RPC (replaces always-empty direct query)

## [0.12.2] - 2026-08-08

Deploy upstream PR #39 battle UI fixes to live (live was still on 0.12.1 build from before #39 merged — deploy gate requires a version bump)

### Fixed

- Battle HUD HP reads authoritative runtime snapshot (`battleVitals.ts`); `maxHp` from progression `combatStats.hp`
- Sprite foot anchor via visual offset only (`entitySpritePresentation.ts`) — no battle coordinate changes
- Combat skill cluster polar layout (`combatUILayout.ts`) — no per-viewport magic offsets
- Compact `StageObjectiveHud` grid (~21vw) — no `transform: scale()`

### Changed

- CI: isolate `accountRepository.supabase.mapping.ts` so fork PR tests do not import `supabaseClient.ts` at module eval

## [0.12.1] - 2026-08-08

P8 balance lock playtest baseline (Ring 0) + deploy of tutorial-easy stage 1 and partial failure rewards

### Added

- Ring 0 P8 balance lock: playtest caps/baseline in `progressionConfig` / `rewardConfig`
- Tutorial-easy dungeon stage 1 — 2 waves, `enemyHpScale: 0.7`, `waveIntervalMs: 2500`
- Partial failure rewards — heroExp by stage/wave progress only (`rewardProgress.ts`)
- Supabase migration `0008_progression_state.sql` — `talent_state` / `awakening_state` + owned_characters UPDATE RLS
- E2E reward pipeline tests (dungeon clear → heroExp → พัฒนา tab)

### Changed

- Failure policy `partial` for `p5-test-dungeon` (no gold/first-clear/boss on fail)
- Talent/awakening test-fixture UI hidden (`showTalentAwakeningUi: false`); framework retained
- `savePlayer` upserts owned_characters progression fields (Supabase)

## [0.12.0] - 2026-08-08

"Continue with Google" sign-in, guest accounts, Cloudflare Turnstile CAPTCHA, and P8 Character Progression (per-hero level/EXP, skill upgrades, talent/awakening foundation)

### Added

- `signInWithOAuth('google')` via Supabase Auth, wired through `useAuth`/`App.tsx` into `AuthModal`
- Reuses existing session-detection flow (`detectSessionInUrl`) and `handle_new_user()` trigger — no new callback code, OAuth accounts get the same starter profile/character as email/password
- Guest (anonymous) sign-in via `signInAnonymously()`, 30-day stale-guest cleanup job (`pg_cron`), upgrade path via existing Google `linkIdentity()`
- Cloudflare Turnstile CAPTCHA on register/login/guest sign-in
- `src/game/progression/` — schema, config (NON-PRODUCTION balance), migration, EXP service, skill/talent/awakening services, stat resolver, view model, validator
- Per-hero `skillLevels`, `talentState`, `awakeningState` on `OwnedCharacter` with save migration
- Reward pipeline routes `heroExp` through `ProgressionService.applyHeroExpToLeadHero`; account EXP via `applyAccountExp`
- Combat snapshot uses `resolveFinalCombatStats` from hero level progression
- `HeroProgressionPanel` in Character Roster (พัฒนา tab) — EXP bar, skills, talent, awakening
- Progression tests (+23 tests)

### Changed

- `normalizePlayer` / Supabase `loadPlayer` migrate legacy owned-character saves
- `grantCharacter` / new-player starter uses `createInitialOwnedCharacterProgress`

### Placeholder / Ring 0 TBD

- EXP curve, stat growth, skill costs/max levels, awakening numerics — all labeled NON-PRODUCTION
- Max-level EXP overflow: `clamp_zero` (reversible)
- Supabase `owned_characters` columns for skill/talent/awakening not yet persisted server-side

## [0.11.1] - 2026-08-07

Camera +30% view height fix — revert character tilt regression from v0.8.3 misinterpretation

### Fixed

- Revert EntitySprite Y-axis billboard (root cause of walking tilt) — restore fixed pitch lean
- Restore v0.8.2 camera pitch/distance baseline; apply +30% via `heightOffset` only (1.264)
- Revert mistaken `targetCharacterScreenHeightRatio` zoom boost (0.36 → 0.3)

### Tests

- Camera +30% height regression guard + entity sprite presentation constants

## [0.11.0] - 2026-08-07

Result / Reward Pipeline — dungeon clear/fail → resolve → grant → save → result UI

### Added

- `src/game/reward/` — `DungeonResult` finalizer, data-driven `RewardResolver`, `RewardGrantService`, `ResultViewModel`, pipeline orchestrator
- NON-PRODUCTION placeholder balance in `rewardConfig.ts` for `p5-test-dungeon`
- Idempotent grant via `reward_tx_${runId}:final` progress flag
- `DungeonResultPanel` now renders `ResultViewModel` (no inline reward math in UI)
- Reward pipeline tests (+11 tests)

### Changed

- `DungeonOrchestrator` finalizes immutable `DungeonResult` with combat summary accumulator
- `DungeonSession` grants rewards on Continue via ledger (`earnGold`/`grantItem`) then saves once

## [0.10.0] - 2026-08-07

P5 Dungeon Vertical Slice — stage/dungeon orchestration above P4 combat core

### Added

- `src/game/dungeon/` — schema, stage runtime, objectives (7 types), timer, encounter, dungeon orchestrator
- `P5_TEST_DUNGEON` — 4-stage vertical slice (survival → hazard → elite → boss)
- `DungeonSession` + `DungeonResultPanel` + `StageObjectiveHud`
- P4 battle bridge hooks: `setAutoWaveAdvance`, `spawnWaveAt`, `forceVictory/Defeat`, `applyEnvironmentalDamage`
- Lobby "เริ่มการผจญภัย" now enters dungeon run; battle tab still opens trial-01

### Tests

- Stage timer, all 7 stage type fixtures, stage lifecycle, dungeon config (+23 tests, 278 total)

## [0.9.0] - 2026-08-07

P4 Combat Production Core — telegraph, hit reaction, interrupt, knockdown, AI baseline

### Added

- `combatMoveSchema` — move phases, telegraph/hitstun defaults (200ms), `phaseOverrides`, multi-strike
- `combatReaction` — hitstun/knockback/knockdown→getUp lifecycle (elite/boss only for knockdown)
- `combatInterrupt` — data-driven interrupt per phase
- `softTarget` — nearest-enemy assist + ultimate `targetLock: 'nearest'`
- Enemy telegraph AI loop + ground telegraph markers (`TelegraphMarkers.tsx`)
- Per-enemy attack data (`attackId`, `combatTier`, `aiRole`) in `stageConfig`

### Changed

- `EnemyAISystem`: idle→chase→telegraph→execute→recover
- `DamageSystem`: delegates to `applyCombatReaction`
- Ultimate setup uninterruptible via `phaseOverrides`

## [0.8.3] - 2026-08-07

Combat camera ~30° pitch + battle sprite sheets wired (presentation only)

### Changed

- `combatCameraConfig`: pitch **30°**, distance **5.0**, screen character height ratio **0.36**
- `battleSpriteSequences`: monkey-king + pig-warrior walk/dash use full 8-dir sheet frames (`monkey-walk` / `pigsy-walk`)
- `EntitySprite`: Y-axis billboard toward camera (replaces fixed plane tilt)

## [0.8.2] - 2026-08-07

Combat camera pitch tuning — slightly higher vantage (presentation only)

### Changed

- `combatCameraConfig`: pitch 15° → **18°**, height offset 0.42 → **0.58**, distance 5.4 → **5.5**

## [0.8.1] - 2026-08-07

Combat camera — Naruto-mobile-style elevated side framing (presentation only)

### Added

- **`combatCameraConfig.ts`** — centralized camera tuning (`pitch`, `distance`, `fov`, zoom clamps, smoothing)
- **`combatCameraFraming.ts`** — pure framing math: enemy-group focus, dynamic zoom, composition bias (+ tests)

### Changed

- `BattleCamera` frames midpoint between player and combat-relevant enemy group (not player-only lock)
- Reduced top-down feel: pitch ~15°, closer distance, FOV 38°, dynamic zoom with damping
- Aspect-ratio-aware horizontal limits; boss widens framing via config modifiers
- Includes v0.7.2 combat UI arc/HUD/fullscreen + v0.7.3 spawn composition (rebased on 0.8.0)

## [0.7.3] - 2026-08-07

Battlefield spawn composition — player left / enemy right / formation spacing (presentation only)

### Added

- **`battlePresentation.ts`** — normalized spawn presentation config
- **`spawnFormation.ts`** — formation resolver + overlap separation pass (+ tests)

### Changed

- Player spawns ~22% X (left), enemies ~76% X (right) with depth formation
- Initial facing: player `right`, enemies `left` (spawn presentation)
- Intro camera frames player + enemy group midpoint
- `stageConfig` enemy spawns delegated to formation resolver

## [0.7.2] - 2026-08-07

Combat UI layout fix — arc cluster, compact HUD, fullscreen + landscape guard (Blueprint §3.3 UI pass)

### Added

- **`battleViewport.ts`** + **`useBattleViewport`** — fullscreen request, landscape lock, portrait guard
- **`BattleViewportOverlays`** — rotate-device overlay + tap-for-fullscreen fallback prompt

### Changed

- Combat cluster repositioned to diagonal arc (S1→S2→S3→ULT) anchored on ATK bottom-right
- Player/Enemy vitals HUD scaled to ~75%; center stage info ~65% (2-line compact format)
- Relative cluster offsets via attack-size multipliers (no per-resolution pixel hardcoding)
- Safe-area insets on combat cluster anchor; viewport resize/orientation/fullscreen listeners

### [0.7.1] - 2026-08-07

Mobile combat control UI redesign (Naruto-mobile-inspired ergonomics) — Blueprint v3 §3.3

### Added

- **`combatUILayout.ts`** — centralized responsive layout config (joystick/attack/skill scales, safe-area CSS vars)
- **`playerInput.ts`** — `MovementInput` / `PlayerInputState` abstraction (x + depth, not screen coords)
- **`joystickMath.ts`** — dead zone + stick normalization (tested)
- **`combatButtonState.ts`** — READY/COOLDOWN/CASTING/DISABLED/LOCKED derivation from runtime
- **`CombatActionButton`** + **`CombatCluster`** — attack-primary cluster (ATK largest, S1/S2/S3/ULT arc)
- Radial cooldown mask + numeric countdown on skill buttons; ultimate gauge fill + ready pulse
- Battle HUD enemy vitals panel (top-right); player portrait slot (top-left)
- `castingSkillSlot` on battle snapshot for authoritative UI state

### Changed

- Joystick: responsive anchor (~15%/79%), enlarged touch area, dead zone 0.12, multi-touch isolated
- `InputSystem.setMovementInput()` — keyboard + joystick share one path; dead zone on stick only
- Removed legacy `AttackButton.tsx` / `SkillBar.tsx` (replaced by cluster)

### Removed

- Unused dash button CSS (Blueprint v3 CUT — no dash button)

## [0.7.0] - 2026-08-07

Blueprint v3 P3 — 3 Skills + Ultimate framework, ตัด dash button + Combat Foundation Design Lock §3.6

### Added

- **Skill kit** — 3 skills + 1 ultimate ต่อฮีโร่ (`skills.ts`, `RealtimeSkillKit`)
- **Ultimate gauge** — เติมจากการต่อสู้, ใช้เมื่อเต็ม (`ultimateGauge.ts`)
- **Skill bar UI** — ปุ่ม S1/S2/S3/U แทนปุ่มสกิลเดียว (`SkillBar.tsx`)
- **Blueprint §3.6 Combat Foundation Design Lock** (docs) — controls, lunge/multi-target, cast interrupt, hit reaction, boss telegraph SM, phase transition — ปิด fork gap [#33](https://github.com/nustanakritwithai/GameTurnBase/issues/33)
- **Blueprint §3.6.11–§3.7** — combo 3-hit/no-cancel, UI icons, tuning baseline, Monkey King S2/S3/Ult kit

### Removed

- **Dash button + DashSystem** — ตาม Blueprint v3 (mobility ย้ายเข้าสกิลได้ทีหลัง)

### Changed

- คีย์บอร์ด: 1/E, 2/R, 3/F, 4/Q สำหรับสกิล; ไม่มี Shift/K หลบแล้ว
- `skillCooldownsMs` แยกตามช่อง (skill1–3)

## [0.6.0] - 2026-08-07

Blueprint v3.0 รับเป็น Product Baseline เดียว (รวม PR #19 จาก fork `nustanakritwithai/GameTurnBase`) + Combat Foundation P0-P2

### Added

- **Blueprint v3.0** — Universe of Legends baseline, roadmap P0–P15, governance docs
  (`docs/MASTER_BLUEPRINT_v1.0.md` ถูกลบ — v3.0 เป็นพิมพ์เขียวไฟล์เดียวที่เหลืออยู่)
- **สนามต่อสู้ 2.5D side-down (P1)** — กล้องมุม brawler, แกน depth, `battleCoordinates.ts`
- **โจมตีซ้าย/ขวา + depth hit (P2)** — `combatFacing`, hitbox แนวนอน + depth tolerance สำหรับ basic attack

### Changed

- คอมโบผู้เล่นและ melee ศัตรูใช้ hit model แนวนอน (ไม่ใช่กรวย 360°)
- สกิลหมุนกระบวนทองคำยังเป็น radial 360° ชั่วคราว (รอ P3)

## [0.5.1] - 2026-08-07

### Fixed

- **Production ล่มทั้งเว็บ (จอขาว)** — build ตอนปล่อย v0.5.0 ไม่มี `VITE_SUPABASE_URL`/
  `VITE_SUPABASE_ANON_KEY` เป็น GitHub Actions secret เลย ผู้เล่นจริงทุกคนเจอหน้าขาวเปล่า
  เพิ่ม secret (ระดับ org, จำกัดสิทธิ์เฉพาะ repo นี้) + inject เข้า build step ทั้ง deploy/ci
- **หน้าเว็บล่มทั้งเว็บถ้า env หายอีกในอนาคต** — `main.tsx` เปลี่ยนเป็นโหลด `App` แบบ
  dynamic import แทน static import ถ้าโหลดไม่สำเร็จ (เช่น env หายอีก) จะขึ้นข้อความ
  "โหลดเกมไม่สำเร็จ" แทนจอขาวเปล่า
- **ฟอร์มล็อกอิน/สมัครถูก browser autofill เติมอีเมล/รหัสผ่านให้เองอัตโนมัติ** — ปิด
  `autoComplete` ของฟอร์มนี้ทั้งหมด (ยังจำอีเมลล่าสุดของแอปเองไว้ตามเดิม)

### Removed

- **ปุ่ม "นำเข้าไฟล์ save จากเครื่องอื่น"** — เหลือค้างจากยุค localStorage ใช้กับบัญชี
  Supabase ไม่ได้จริง (กดแล้วพังทุกครั้ง) ตัดทิ้งทั้งระบบ

## [0.5.0] - 2026-08-07

### Changed

- **ย้ายระบบบัญชี/ทอง/หยกไป Supabase จริง** — `useAuth.ts` wired; กติกา ledger บังคับที่ Postgres
- **⚠️ Breaking**: บัญชี/เซฟเก่าใน localStorage ใช้ต่อไม่ได้ ต้องสมัครใหม่

## [0.4.0] - 2026-08-07

รวม PR #14 (`cursor/submit-homework-e117`) เข้า master — งานที่ยังไม่เคยขึ้น upstream มาก่อน

### Added

- **แผงผลหลังต่อสู้ + รางวัลจริง** — ชนะ/แพ้แล้วขึ้น `BattleResultPanel` ก่อนกลับล็อบบี้
  คำนวณทอง/EXP/ไอเทมใน `RewardSystem` (แพ้ได้ศูนย์) ผ่าน `earnGold`/`grantItem` ledger
- ประวัติการต่อสู้เก็บ `durationMs` แทนเทิร์นปลอม — บัญชีเก่ายังอ่าน `turns` ได้

### Fixed

- **จบต่อสู้แล้วค้างในห้อง** — กดกลับจากแผงผลแล้วปิด `LobbyBattleSession` กลับล็อบบี้ทันที

## [0.3.2] - 2026-08-07

### Fixed

- **ปุ่ม "เริ่มการผจญภัย" ทับแถบเมนูลัดบนมือถือแนวนอน** — ทั้งสองชิดขอบขวาเหมือนกันโดยไม่รู้จักกัน
  เพิ่มระยะห่างให้ปุ่มเว้นพ้นแถบเมนูลัดจริงที่ 700x360/812x375/640x320 (ทดสอบจริงแล้ว)

### Changed

- **อัปเดตเกมแล้วรีเฟรชอัตโนมัติ** — แท็บที่เปิดค้างไว้จะรีเฟรชเองภายใน 5 วินาทีเมื่อมี build
  ใหม่ (เดิมแค่เตือนเฉย ๆ ให้กดเอง) และ session จะหมดอายุทันทีถ้าเลขเวอร์ชันไม่ตรงกับ build
  ปัจจุบัน แม้เป็นแท็บที่เพิ่งเปิดใหม่ก็ตาม

## [0.3.1] - 2026-08-07

### Fixed

- **Session ไม่มีวันหมดอายุ** — ล็อกอินครั้งเดียวเข้าเกมได้ตลอดไป ปิดแท็บทิ้งไว้กี่ปีก็ไม่เด้ง
  ออก ตอนนี้หมดอายุแบบ sliding window 30 วัน (เข้าเล่นต่อเนื่องไม่โดนเตะกลางเกม แต่แท็บที่
  ทิ้งไว้เกิน 30 วันจริง ๆ ต้องล็อกอินใหม่)

## [0.3.0] - 2026-08-07

รอบต่อจาก 0.2.0 (ที่ยังไม่เคยปล่อยจริง — run deploy ของ commit ที่ bump ไว้ถูก cancel
ก่อนตัด release ได้ กติกาเวอร์ชันเปลี่ยนถึงปล่อยจึง skip ทุกครั้งหลังจากนั้นถูกต้องแล้ว
เพราะเลขไม่เคยขยับ) เวอร์ชันนี้ปล่อยของทั้งสองรอบรวมกัน

### Fixed

- **`requestExit` ทับผลตัดสินการต่อสู้** — กดออกจากห้องพอดีเฟรมที่ชนะ/แพ้ตัดสินแล้ว
  ทำให้สถานะกลายเป็น "กำลังออก" แทนผลจริง ตอนนี้ผลที่ตัดสินแล้วแก้ไม่ได้อีก
- **บันทึกชนกันข้ามแท็บ** — เปิดเกมสองแท็บพร้อมกันแล้วบันทึกไล่กัน แท็บที่บันทึกทีหลัง
  เคยทับข้อมูลของแท็บแรกเงียบ ๆ เพิ่มตัวนับรุ่น (`rev`) เทียบก่อนเขียนทุกครั้ง

### Added

- Property-based fuzz testing ด้วย `fast-check` — ครอบสูตรดาเมจ/ป้องกัน/HP สูงสุด/สัดส่วนหลอดเลือด
- เทสต์ระดับ component ชุดแรก (`AuthModal`/`ErrorBoundary`/`GlobalErrorBanner`/`EnemyHealthBar`)
  — แต่ละตัวล็อกบั๊กที่โปรเจกต์นี้เจอจริง ไม่ใช่เขียนตามสเปก
- Prettier ผูกกับ pre-commit (`.prettierrc.json`) ให้ไฟล์ที่แก้ค่อย ๆ เป็นรูปแบบเดียวกัน
- CI รัน Node 22 และ 24 คู่ขนาน (`engines.node >=22` ของ `package.json`)
- `CONTRIBUTING.md` หัวข้อ Release process

### Changed

- แยก `vendor-react` chunk ออกจากโค้ดแอป — ผู้เล่นกลับมาเล่นได้ใช้ cache เดิมของ react
  ในดีพลอยที่ไม่ได้แตะ react
- บีบภาพตัวละครที่เกินเพดานการแสดงผลจริงก่อนแปลง WebP (`tools/optimize-images.mjs`)

## [0.2.0] - 2026-08-07

รวมงานทั้งหมดตั้งแต่ 0.1.0 — เว็บจริงตามหลัง 18 commit อยู่ก่อนหน้านี้ เพราะทุก push
ยิง deploy พร้อมกันจนถูก cancel ทับกันเอง เวอร์ชันนี้เป็นรอบแรกที่ปล่อยด้วยกติกาใหม่
(ปล่อยเมื่อเลขเวอร์ชันเกมเปลี่ยนเท่านั้น — ดู `.github/workflows/deploy.yml`)

### Fixed

- **นำเข้าไฟล์ save ที่ไม่มีข้อมูลผู้เล่นแล้วเกมเปิดไม่ได้ถาวร** — ตัวตรวจไม่ได้ดู `player`
  และฟังก์ชันเขียนบัญชีกับ session ลง localStorage สำเร็จ _ก่อน_ จะพัง ทำให้ทุกครั้งที่โหลดหน้า
  เจอข้อผิดพลาดเดิมซ้ำ กู้ได้ทางเดียวคือล้าง localStorage เอง
- **ล็อกอินแล้วเกมค้างยาว** — `renderer.init()` ของ WebGPU ไม่มี timeout ถ้าการเจรจา adapter
  ค้าง (เจอจริงบน GPU/ไดรเวอร์บางตัว) จะไม่ resolve ไม่ reject จึงไม่ตกไป WebGL2 เลย
- **สเกลพังบนมือถือแนวนอน** — กฎ CSS สามไฟล์เช็คแต่ `max-width` ไม่เช็ค `max-height`
  จอกว้างแต่เตี้ยจึงยังใช้ layout เดสก์ท็อป ปุ่ม "เริ่มการผจญภัย" ทับแถบเมนูล่าง
- สมัครสมาชิกตอนพื้นที่เก็บข้อมูลเต็มแล้วระบบบอกว่าล้มเหลว แต่ login ครั้งถัดไปกลับผ่าน
  เพราะ `loadDb()` คืนค่าคงที่ตัวเดียวร่วมกันแทนที่จะเป็นอ็อบเจ็กต์ใหม่
- กล่องเข้าสู่ระบบค้างใช้ต่อไม่ได้เมื่อ promise ถูก reject — ปุ่มถูก disable ทั้งหมดโดยไม่มีข้อความบอก
- พิมพ์ในช่องคูปองและช่องรหัสเพื่อนไม่ได้ — ตัวเดินในลอบบี้ดักคีย์บอร์ดจากทั้งหน้าต่าง
  ทำให้ w/a/s/d เดินตัวละครหลังโมดัล และลูกศร/เว้นวรรคถูกกิน
- จำนวนรอบ PBKDF2 ที่อ่านจากแฮชไม่ถูกตรวจ — ไฟล์ save ปลอมสั่งให้คำนวณจนค้างทั้งแท็บได้
- หลอดเลือดศัตรูไม่พอตั้งแต่คลื่นสอง และด่านที่หาศัตรูไม่เจอเลยกลายเป็นห้องที่ชนะก็ไม่ได้ แพ้ก็ไม่ได้
- ตัวเลขดาเมจสะสมหน่วยความจำไม่มีเพดานตลอดการต่อสู้

### Added

- สกิล "กระบวนทองคำ" ของหงอคง พร้อมปุ่มสกิลบนจอ คูลดาวน์ และช่วงอมตะ
- ปุ่ม "ต่อสู้" กับ "เริ่มการผจญภัย" เข้าห้องต่อสู้ตรง ๆ ไม่ต้องเดินหา NPC
- สไปรต์ตือโป๊ยก่ายชุด v7 ครบ 8 ทิศ พร้อมท่ายืนหายใจและท่าทางประจำตัว
- เทสต์ครอบ `accountRepository` กับ `password` (สองไฟล์นี้เคยไม่มีเทสต์เลย) และเทสต์กัน
  เลขเวอร์ชันเกมกับ `package.json` หลุดจากกัน — รวม 21 ไฟล์ / 176 เทสต์
- `.github/workflows/upstream-skill-watch.yml` — เฝ้าแหล่ง skill ต้นทาง เปิด issue เมื่อมีของใหม่

### Changed

- **deploy ผูกกับเลขเวอร์ชันเกม** ไม่ใช่ทุก push อีกต่อไป และตัด GitHub Release
  พร้อมแนบ SBOM ให้อัตโนมัติเมื่อปล่อย
- deploy รันเทสต์ก่อน build แล้ว (ก่อนหน้านี้ commit ที่เทสต์แดงขึ้น production ได้)
- Lobby arena-slot rendering (character models + idle animation, added in 0.1.0 below) switched off via `SHOW_ARENA_SLOTS = false` in `LobbyScene.tsx` — an agreed toggle, not a removal; the lobby currently shows the empty temple scene only. Flip the constant to restore it.
- แก้กฎใน `.agents/rules/**` เจ็ดข้อที่อ้างข้อเท็จจริงซึ่งไม่จริงแล้ว (`RULES_VERSION` 12)

## [0.1.0] - 2026-08-06

เวอร์ชันแรกที่ tag/release อย่างเป็นทางการ

### Added

- หน้า Lobby, สมัคร/เข้าสู่ระบบ, ตั้งชื่อตัวละครครั้งแรก
- ฉาก 3D Lobby (React Three Fiber) พร้อม idle animation ต่อตัวละคร
- ระบบทอง/หยก (เควส/ดรอปเท่านั้นสำหรับทอง, เติมเงินจริง/คูปองสำหรับหยก) ผ่าน `accountRepository.ts`
- ระบบเติมทอง/หยกด้วยเงินจริง (`CurrencyShopModal`) — เดโม ยังไม่ต่อ payment gateway จริง
- ฉากเดิน/สำรวจ + ระบบต่อสู้พื้นฐาน (`src/game/battle/`, `src/game/exploration/`)
- WebGPU เป็น renderer หลัก ล้มกลับ WebGL2 อัตโนมัติ
- ภาพทั้งหมดแปลงเป็น WebP ผ่าน pipeline `assets/raw/` → `npm run build:images`
- Governance: `AGENTS.md`, `MEMORY.md`, `.agents/rules/**`, `SECURITY.md`

[Unreleased]: https://github.com/KatomnoiStudio/LegendOfSoulTH/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/KatomnoiStudio/LegendOfSoulTH/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/KatomnoiStudio/LegendOfSoulTH/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/KatomnoiStudio/LegendOfSoulTH/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/KatomnoiStudio/LegendOfSoulTH/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/KatomnoiStudio/LegendOfSoulTH/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/KatomnoiStudio/LegendOfSoulTH/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/KatomnoiStudio/LegendOfSoulTH/releases/tag/v0.1.0
