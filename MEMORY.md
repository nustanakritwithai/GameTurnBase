# MEMORY.md — Project State & History Journal

> **Operator / Human User**: `HetCreep`
> **Repository**: `KatomnoiStudio/LegendOfSoulTH`
> **Default Branch**: `master`
> **Last Updated**: 2026-08-11T12:55:00+07:00 by `Claude Code` — task #93 split at the gate: the honest login error shipped, the password-recovery half dropped until custom SMTP exists (without one it was a 100%-reliable account-existence oracle). Two more enumeration branches deleted from the login path and recorded in `SECURITY.md`; 16/16 mutations killed (item 197).
> **Last Updated (prior)**: 2026-08-11T06:50:00+07:00 by `Claude Code` (audit-#36 caretaker) — audit #36 verified STALE: `loadPlayer`'s 8 queries have all been guarded since `0bee26d`; the real open gap was its test, which hand-listed 5 of the 8 tables. List now derived from the real calls, all 8 covered, red reproduced by re-injecting the old shape (item 195). No source change.
> **Last Updated (prior)**: 2026-08-09T20:15:00+07:00 by `Claude Code` — design-fork handoff answered and implemented: currency ledger archive built on the live Postgres backend, gacha's determinism criterion rewritten to statistical testing + dead client module deleted, PvP P12 private-room ruled scope drift not an interim phase (item 179).
> **Last Updated (prior)**: 2026-08-10T03:40:00+07:00 by `Claude Code` — full doc-vs-code fidelity audit: 63 agents, 147 stale doc claims corrected across AGENTS.md/AGENT_BLUEPRINT.md/28 system contracts/`.agents/rules/`/MASTER_BLUEPRINT/TASKS/MEMORY, README.md rewritten for its real (agent/dev) audience, 3 real design forks handed off for a human decision (item 178).
> **Last Updated (prior)**: 2026-08-10T01:15:00+07:00 by `Claude Code` — v0.15.2: closed the PvP gate leak found by rot-canary over v0.15.1 (item 177). Gacha is live and verified; PvP stays gated until its Edge Function is deployed.
> **Last Updated (prior)**: 2026-08-10T00:30:00+07:00 by `Claude Code` — v0.15.1: gated the PvP button behind its undeployed backend after v0.15.0 shipped it broken to live; applied and verified the gacha migration in production (item 176).
> **Last Updated (prior)**: 2026-08-09T23:10:00+07:00 by `Claude Code` — **v0.14.1 released** — shipped the OAuth redirect + PKCE fix to live (item 175). Messenger/webview hypothesis ruled out by a real-device test.
> **Last Updated (prior)**: 2026-08-09T22:05:00+07:00 by `Claude Code` — OAuth redirect + PKCE fix (item 175): Google login was redirecting to the org root instead of the app, stranding the session JWT in the address bar. Pushed direct to master per Ring 0.
> **Last Updated (prior)**: 2026-08-09T21:30:00+07:00 by `Codex` — P12 private authoritative PvP prototype (#21); see item 173.
> **Last Updated (prior)**: 2026-08-09T14:35:59+07:00 by `Codex` — PR #96 CoalBoard review fixes for P12 authority; see item 174.
> **Last Updated (prior)**: 2026-08-09T20:40:00+07:00 by `Codex` — P12 ranked power normalization (#20) implementation; see item 170.
>
> _History below is newest-first. Several concurrent agents each appended their own `Last Updated` line, so this block had drifted out of chronological order and carried four differently-labelled "latest" entries; re-sorted and relabelled 2026-08-09 while resolving the PR #84 merge. One label rule: the newest line is `Last Updated`, every older one is `Last Updated (prior)`._
>
> **Last Updated (prior)**: 2026-08-09T18:20:00+07:00 by `Codex` — Production trust-boundary follow-up for consolidated PR #77/#78; see items 168–169.
> **Last Updated (prior)**: 2026-08-09T11:30:00+07:00 by `Cursor Agent` — P11 Chapter 1 PvE expansion (v0.14.0): per-stage rewards, locked energy, mini-boss trial-08, difficulty/duration metadata.
> **Last Updated (prior)**: 2026-08-09T03:15:00+07:00 by `Cursor Agent` — P10 Production Batch 01 (5 archetypes, v0.13.0): per-hero kits/combos, 3 new roster heroes, summon/CC runtime, gacha+star skeleton; see `docs/hero-production/PRODUCTION_BATCH_01.md`.
> **Last Updated (prior)**: 2026-08-09T02:50:00+07:00 by `Cursor Agent` — branch hygiene pass: pruned merged local `cursor/*-b471` branches; documented remote WIP branch ledger (item 159).
> **Last Updated (prior)**: 2026-08-09T02:10:00+07:00 by `Claude Code` — Hero Kit #12/DF20: CoalBoard opinion-lane (ask CB, 4 blind seats) fixed the Lv11+ EXP formula regression and the Ultimate damage-scale outlier; `ffb741c`. TASKS.md row DF20 stays 90% (Ring 0 instruction) pending playtest graduation.
> **Last Updated (prior)**: 2026-08-09T00:25:00+07:00 by `Cursor Agent` — v0.12.5 fix: ปุ่มต่อสู้แสดงหน้าเลือกด่าน (pending-reward recovery ไม่ปิด overlay + StageSelect z-index/DOM order).
> **Last Updated (prior)**: 2026-08-08T20:58:00+07:00 by `Claude Code` — Hero Kit #12/DF20: wired the blueprint's locked `castDelayMs` (S2 250 / S3 320 / Ult 480) into `attacks.ts`; re-derived `SkillSystem.test.ts` Done-criterion 4's phase checkpoints since castDelay composes as an additive phase before startup, not folded in. `6a92982`/PR #90.
> **RULES_VERSION last synced: 30** (2026-08-10, Operator: HetCreep, Agent: Claude Code (belt-end main) — worker-DONE verified by main on the commit stream + completion-challenge right; quota-death = transient, re-dispatch same sid self-contained, never main-fallback; cwd hygiene duty incl. empty-folder removal, 5-main-turn sweep limit, binds every ring; see items 183)
> **(prior) RULES_VERSION last synced: 29** (2026-08-10, Operator: HetCreep, Agent: Claude Code (belt-end main) — queue-cleanup hard limit: completed swept at next queue touch, ceiling 2, reaching 3 = the violation; cleanup is MAIN's own duty; DONE requires ship-verification — gate named + landing checked, code-written is not done; set after the owner caught exactly 3 lingering)
> **(prior) RULES_VERSION last synced: 28** (local `master`, 2026-08-09, Operator: HetCreep, Agent: Claude Code (belt-end main) — 27: rule 23 belt-system-law installed + rules 16/18 amended (item 180) · 28: the ADDRESSING rule (a law binds only the seat it addresses; Layer 1 = belt end alone, worker duties = every worker seat any ring, Layer 2 intake = Ring-1) + Ring-1 duty ends at PR submission, sole prohibition = merging even with permission; see item 181)
> **(prior) RULES_VERSION last synced: 26** (local `master`, this session) — bumped 17→18 (multi-dev task queue law) →19 (Agent Blueprint execution-order rule) →20 (Ring 0 traffic control law) →21 (claim protocol made Ring-0-locked) →22 (break-glass claim fallback for repo-admin devs) →23 (security doc sync law, from a `/gold-standard` AUDIT) →24 (tasks/memory parity law, HetCreep asked directly after catching TASKS.md drift twice) →25 (working-directory concurrency lock law, added after Claude/Antigravity live collision) within this same session. **Unrelated note carried forward, now corrected**: an earlier version of this line read "19" citing a pending fork PR #59 (Cursor Agent, cloud) as not yet merged. That was wrong, not just unconfirmed — PR #59 **is** merged (`ce4980d`, a confirmed ancestor of `origin/master`; see item 142, the Stage/Adventure System Dogfood second pass). This session's 17→18→19→20→21→22→23→24→25 RULES_VERSION chain was independent of PR #59 either way, so no renumbering is needed.

> **2026-08-06 overhaul**: this file had grown to 65+ interleaved, verbose items (two colliding numbering
> tracks from concurrent sessions/forks) and was getting expensive to read every session. Compressed to
> essentials per HetCreep's explicit request. **Full narrative detail for anything below now lives in
> `git log`/`git show <sha>` — commit messages this session are detailed and are the source of truth for
> "why," not this file.** Keep future entries to 1-3 lines; link a commit SHA instead of re-narrating it.
>
> **2026-08-08 second surgery** (HetCreep's explicit request): Current Status was capped hard (~40 bullets → 15) — anything fully resolved/superseded got cut, not narrated (it's already in the Timeline or in `git log`). Every Timeline item (1-101, plus 102-106 for facts that had only ever lived in Current Status) was re-compressed to 1-3 sentences; nothing was renumbered, merged, or silently dropped.

---

## 👤 Identity & System Context

- **Owner**: `HetCreep`
- **Project**: Legend of Soul TH (repo slug `LegendOfSoulTH`) — **Stage-based 2.5D Hero Collection Action RPG** · **Universe of Legends** (รามเกียรติ์ = Chapter/Series แรกได้ ไม่ใช่เพดาน IP) · 2D HD sprites · PvE-first → Ranked PvP 1v1 ทีหลัง. Stack: React 19 + TypeScript (strict) + Vite 8 + Three.js/R3F (lobby), Oxlint. Auth/accounts are real Supabase (server-side, item 41) — the localStorage backend (`accountRepository.ts`) stays in the tree as an untouched fallback seam, not the active one. World Chat server authority is implemented but awaits migration apply (item 158).
- **Product baseline**: [`docs/MASTER_BLUEPRINT_v3.0.md`](docs/MASTER_BLUEPRINT_v3.0.md) (ADOPTED, HetCreep Ring 0, 2026-08-07 — **the only blueprint file now**, v1.0 deleted/consolidated) · [`docs/BLUEPRINT_V3_MIGRATION_AUDIT.md`](docs/BLUEPRINT_V3_MIGRATION_AUDIT.md) · gap register [`docs/BLUEPRINT_GAP_ANALYSIS.md`](docs/BLUEPRINT_GAP_ANALYSIS.md) (historical, v1.0-era) · law `.agents/rules/master-blueprint-law.md`
- **Live**: https://katomnoistudio.github.io/LegendOfSoulTH/

---

## 🎯 Current Status

- **Repo**: upstream `master` @ `d45552b` · **v0.14.0** · merged this session: PR #90 (castDelayMs), #91 (memory), #95 (P12 ranked power normalization), #84 (branch hygiene). `cursor/*-b471` agent branches pruned locally after merge (item 159).
- **Version**: **0.15.2** on live — v0.14.0 was P11 Chapter 1 PvE expansion; 0.14.1 was the OAuth redirect + PKCE fix (item 175, not item 172 as this line previously misattributed — item 172 is the Lobby/Gacha integration entry); 0.15.1 gated the undeployed PvP button and applied the gacha migration live, and 0.15.2 closed the PvP gate leak found by rot-canary (items 176-177). Deploy gate: bump BOTH `GAME_INFO.version` and `package.json` in the same PR — `gameInfo.test.ts` pins them equal and bumping only one turns CI red.
- **Org/Live**: `KatomnoiStudio` — https://katomnoistudio.github.io/LegendOfSoulTH/
- **Backend**: Supabase Auth+Postgres live, wired via `useAuth.ts` (item 41/87). `accountRepository.ts` (localStorage) stays as a dormant fallback seam only.
- **Master Blueprint v3.0**: P0–P3 DONE · §3.6/§3.7 LOCKED · mobile combat UI done (§3.3) · P4 LANDED (item 109) · P5 dungeon slice + reward pipeline LANDED (items 111-112) · P8 per-hero progression LANDED (item 119, numerics still NON-PRODUCTION) · Basic Attack Lunge Distance closed (item 124).
- **Battle (current)**: realtime 2.5D · ต่อสู้/เริ่มผจญภัย → StageSelect → BattleScene (Ch.1 10 stages, P11 enriched). **Hero Batch 01**: monkey-king (Fighter), pig-warrior (Heavy), celestial-archer (Ranged), nezha-warden (Control), sand-sage (Summoner) — 3 ตัวใหม่ placeholder sprites (`docs/hero-production/PRODUCTION_BATCH_01.md`). pilgrim-monk → Batch 02.
- **P11**: `stageRewardConfig.ts` per-stage tables + first-clear; energy locked 120/60/10/boss×2 + gem refill skeleton; `trial-08` mini-boss; all Ch.1 stages have `difficultyMultiplier` + `targetDurationMs`.
- **P8 balance lock** (Ring 0, 2026-08-09): DF20 ownership is Codex on PR #83 · caps + playtest baseline in `progressionConfig.ts`/`rewardConfig.ts` · Lv11+ EXP uses the monotonic continuation `10n²+10n+100` · Ultimate is 4×1.1 = 4.4x ATK total · stage 1 tutorial-easy (2 waves, HP×0.7, 2500ms interval) · failure `partial` = heroExp by progress only · `nonProductionBalance` banner stays · talent/awakening UI hidden (`showTalentAwakeningUi: false`). **PR #90**: S2/S3/Ultimate's blueprint-locked `castDelayMs` (250/320/480) now wired into `attacks.ts`, composing as an additive phase before startup.
- **DF20 open follow-ups (flagged, decided 2026-08-08)**: S2 (`monkey-staff-thrust`)/S3 (`monkey-staff-sweep`) still reuse the basic combo's own `animationId` ('attack-2'/'attack-3') — a CoalBoard "feeling"-seat finding that they read as "spend a cooldown to punch slightly harder with the same animation" rather than a distinct kit identity, unlike S1/Ultimate. HetCreep's call when asked directly: **defer** — wait for real hero animation/sprites before deciding S2/S3 kit identity, don't build against placeholder art. Same precedent as item #13's sprite-flip deferral. Not implemented; no code change from this finding.
- **Still open**: measured mobile playtest/TTK dataset for S2/S3/basic-finisher magnitude and the full playtest round required before dropping the NON-PRODUCTION banner. Do not infer final literals from the current test dungeon alone.
- **Gold-standard**: current figure is item 99's **77%** (12-dim AUDIT+FILL+ADOPT). An earlier ~84% figure merged in via PR #25 is SUPERSEDED — different scoring pass/day, don't average or reconcile.
- **UI/UX gold-standard backlog**: `.agents/rules/gold-standard-baseline.md` — MUST-HAVEs closed, EXCELLENCE-tier gaps (3D char-select keyboard path, tab-strip `aria-controls`, `AuthModal` live-validation, breakpoint tokens, some reduced-motion) tracked there, not scaffolded.
- **Security posture**: real Supabase/RLS/RPC trust boundary (`SECURITY.md` corrected item 99). CodeQL + Dependabot + Secret Scanning + Gitleaks + NPM Audit + branch protection + SHA-pinning all on; `secret_scanning_validity_checks` needs manual toggle (Settings → Code security). **2026-08-08 (items 145-148)**: economy/RLS integrity fixes (unbounded-currency-mint RPC gap, `profiles.gold/gem` column-write bypass, `owned_characters` progression-save bug, coupon double-redemption race, RPC rate limiting, `findPlayerByUid` lookup RPC, reward idempotency) all shipped as `0009`-`0013` **and VERIFIED LIVE on production** (item 148) — closes a standing blocker open for most of this session. Two real bugs surfaced and were fixed during the live apply: a pre-existing duplicate-row set on 2 dev/test accounts (not real players) that blocked 0013's unique index, and a `grant_item` function-overload collision (old 3-arg + new 4-arg coexisting) since fixed live. Migration deploy is still a manual Supabase-Dashboard-SQL-editor step — no automated pipeline exists yet.
- **Repo access**: `HetCreep` / `nustanakritwithai` / `DemoGODRTX` all `admin:true`. `kaoshock123` git-author = `DemoGODRTX` account (confirmed).
- **CharacterPreview sprites**: re-cropped to 396x376 (was 640x512), `SPRITE_ZOOM` now `1` (was `1.31`) — item 122.
- **Branch protection — open, HetCreep's call**: required check + conversation-resolution + no force-push are ON (item 80), but `enforce_admins` is still `false` — all 3 admins can still push straight to `master` (also flagged in item 99's audit).
- **CI/Deploy**: web deploys only when `GAME_INFO.version` changes (cheap `gate` job decides first); manual release via `workflow_dispatch` — see README "การปล่อยเว็บ".
- **Player accounts/currency/items/friends/chat**: Supabase-backed live path. World Chat server-authority code/migration is implemented (`world_chat_messages` + RLS/RPC/Realtime) but is not production-live until the new migration is applied.
- **Multi-dev governance**: `TASKS.md` is the Ring-0-locked claim ledger for 3+ concurrent devs; Ring 1 never pushes straight to `master` (`ring0-traffic-control-law.md`) — branch+PR or hand off to Ring 0 directly.

---

## 🧠 Lessons & Conventions (`[[tag]]`)

- **`[[browser-pane-not-compositing]]`** — this environment's Browser pane sometimes doesn't render/composite frames (canvas stuck at default size, `screenshot` errors "not compositing"). When it happens, verify via code review + typecheck/build + DOM/layout inspection instead of visual screenshots, and say so honestly rather than claiming untested visuals worked.
- **`[[css-fix-overcorrection]]`** — resizing/rescaling a themed frame (proportional CSS changes) without also checking what's positioned _inside_ it against the same math causes overflow/misalignment. Always recompute inner-element positions by the same scale factor, not just the outer box.
- **`[[percent-maxheight-grid-indeterminate]]`** — a percentage `max-height` on a grid/flex item whose container sizes to content (`display:grid; place-items:center`) never resolves (circular sizing). Use `dvh`/viewport units or an explicit container size instead.
- **`[[test-existence-not-authenticity]]`** — a test file testing a code path proves the code was once exercised, not that it's reachable in production today. Always trace real callers/entry points before trusting "it has tests" as evidence of aliveness.
- **`[[shared-hook-refuted-by-divergent-semantics]]`** — a "let's extract one shared hook/component" instinct across superficially-similar systems (UI modals, input handling) should be checked against real behavioral divergence first; ask-CB has independently refuted this proposal twice this project (UI/HUD systems, then input systems) because the systems' downstream semantics genuinely differed.
- **`[[verify-before-assuming-regression]]`** — a reverted-looking diff from a concurrent push/merge can be a legitimate supersession (e.g. an asset that was deleted got re-added with new content), not a regression. Check the CURRENT state of the file/asset before "fixing" it back.
- **New-systems law**: any system a session builds, or discovers another dev/session merged, that's genuinely new (not a fix/content-addition to an existing system) gets a multi-perspective review pass before being considered done — **Claude Code sessions**: CoalBoard's "ask CB" 4-seat opinion lane; **any other agent** (e.g. Cursor Agent, which doesn't have that tool): get explicit HetCreep sign-off directly before marking it done, don't skip the check silently just because the specific tool isn't available. Ring-0-scoped instruction text lives in gitignored `MEMORY.local.md`; the practice itself is documented here since it governs project history.
- **Pre-push sync law**: `.agents/rules/pre-push-sync-law.md` — `git fetch` + check ahead/behind, merge any incoming commits, re-run full verify, only then push. Binding on every machine, every push.
- **`[[fork-pr-not-delivery]]`** — fork PR = staging branch holder only. Delivery = upstream PR URL on `KatomnoiStudio/LegendOfSoulTH`, or report **BLOCKED** + compare link. Never say "ส่งงานแล้ว" from fork PR alone (`.agents/rules/upstream-submission-workflow.md` §0, RULES_VERSION 19).
- **Personal-scope law**: `.agents/rules/personal-scope-law.md` — personal/off-project content never goes in this file (mandatory reading has a token cost every future session pays); use gitignored `MEMORY.local.md`.
- **Commit-granularity law**: `.agents/rules/commit-granularity-law.md` — one completed task = one commit.
- **PowerShell 5.1 has no `` `u{XXXX} `` unicode escape** — silently inserts literal text instead of erroring. Use `[char]0x201C` or type the character directly; always verify inserted content with Read afterward.
- **`[[git-bash-msys-pathconv]]`** — Git Bash's MSYS path-conversion mangles a raw base64/key string passed as a CLI arg if it happens to start with `/` (e.g. `/9Gksc3Ti...` → `C:/Program Files/Git/9Gksc3Ti...`), producing cryptic downstream errors (e.g. "bad public key size" from an encryption lib) with no hint the argument itself was corrupted. Prefix the command with `MSYS_NO_PATHCONV=1` on this machine whenever passing a raw base64/key string as a bash argument to `node`/similar.
- **`[[org-level-secret-not-secrets-repo]]`** — for centralizing a secret needed by more than one repo in an org, use an **org-level GitHub Actions secret with `visibility:"selected"`** scoped to the repos that need it. A "dedicated private secrets repo" doesn't actually work: a consuming repo needs a PAT to read another repo's secrets, and that PAT itself becomes a secret needing the same protection (circular, no real isolation gained).
- **`[[parallel-backend-fix-scope]]`** — `useAuth.ts`/`accountRepository.supabase.ts` (live) and `accountRepository.ts` (localStorage, dormant fallback) are deliberately parallel implementations; only one is imported by `useAuth.ts` at a time. Whenever one gets modified, grep for the other before assuming a fix/removal applies there too — "fix X" almost always means "fix X in whichever backend `useAuth.ts` currently imports," not both.
- **A module that throws synchronously at import/eval time is a single point of total-app failure `ErrorBoundary` can never catch** (the throw happens before React mounts) — any such module (env-var-gated clients like `supabaseClient.ts` are the common case) should be behind a dynamic `import()` with a `.catch()` fallback, not a static top-level `import`.

---

## 📜 Timeline (compact — see `git log --oneline` / `git show <sha>` for full detail)

All entries 2026-08-05/06 unless noted. Roughly chronological.

- **1.** Lobby scene + 2.5D graphics engine (R3F) built. — `MEMORY/archive/001-025.md`
- **2.** CI/CD + automation set up (build/typecheck/lint/CodeQL/security workflows). — `MEMORY/archive/001-025.md`
- **3.** Branch/settings consolidation. — `MEMORY/archive/001-025.md`
- **4.** Player accounts + gold/gem currency system (`c019bb7`, refined `6157f89`/`0a66592`). — `MEMORY/archive/001-025.md`
- **5.** ECC coding rules installed. — `MEMORY/archive/001-025.md`
- **6.** gold-standard AUDIT+FILL, 11 dimensions, ~25% (not inflated). — `MEMORY/archive/001-025.md`
- **7.** Ring system + rules-freshness-check installed. — `MEMORY/archive/001-025.md`
- **8.** Merged concurrent-session work from two machines by hand. — `MEMORY/archive/001-025.md`
- **9.** Pre-push sync law codified (RULES_VERSION→2). — `MEMORY/archive/001-025.md`
- **10.** CI cleanup, broken images fixed live, GLB models stopped shipping to prod. — `MEMORY/archive/001-025.md`
- **11.** Ring 0 detection fixed for cloud agents (RULES_VERSION→3). — `MEMORY/archive/001-025.md`
- **12.** ponytail-audit cleanup, README refresh, AuthModal Esc-to-switch-tab. — `MEMORY/archive/001-025.md`
- **13.** Battle/exploration/dialogue/NPC system merged from an untrusted external PR (`Hih#11`) — investigated file-by-file (Ring ... — `MEMORY/archive/001-025.md`
- **14.** False-positive "lost account data" investigation (no real bug — browser-automation artifact); commit-granularity law ... — `MEMORY/archive/001-025.md`
- **15.** `SECURITY.md` added, written for this project's actual (client-only) shape. — `MEMORY/archive/001-025.md`
- **16.** `.coalmine.json` scan-exclusion fix + Dependency Review + Harden-Runner added. — `MEMORY/archive/001-025.md`
- **17.** `.coalmine.json` untracked from git entirely (personal tuning knob, not team-shared). — `MEMORY/archive/001-025.md`
- **18.** `GameViewport` fixed-1600×900 letterbox removed → fluid stage; 2 real breakages fixed. — `MEMORY/archive/001-025.md`
- **19.** rot-canary follow-up: fixed a stale-`sceneSize` bug in item 18's fix (missing effect dependency). — `MEMORY/archive/001-025.md`
- **20.** Modal background unification (4 modals → gold-panel design language). — `MEMORY/archive/001-025.md`
- **21.** Version sync + first tagged release `v0.1.0`. — `MEMORY/archive/001-025.md`
- **22.** Repo renamed `GameTurnBase`→`LegendOfSoulTH`, all infra/prose swept. — `MEMORY/archive/001-025.md`
- **23.** GitHub "About" panel filled in. — `MEMORY/archive/001-025.md`
- **24.** Gold made purchasable — `GemShopModal` generalized to `CurrencyShopModal`. — `MEMORY/archive/001-025.md`
- **25.** Esc-to-close audited across every modal, 4 real gaps fixed. — `MEMORY/archive/001-025.md`
- **26.** Image pipeline built (WebP, 77% smaller), 88MB dead assets archived. — `MEMORY/archive/026-050.md`
- **27.** Icon-scaling audit + CPU re-render fix + deploy-watcher banner. — `MEMORY/archive/026-050.md`
- **28.** Personal/off-project content law added — `MEMORY.local.md` created (RULES_VERSION→5). — `MEMORY/archive/026-050.md`
- **29.** FPS/render-sync pass: refresh-rate-aware `dpr`, capped React commit at 60Hz. — `MEMORY/archive/026-050.md`
- **30.** WebGPU primary renderer, WebGL2 fallback (`three@0.185.1`). — `MEMORY/archive/026-050.md`
- **31.** rot-canary: `WebGPURenderer` disposal-on-fallback leak fixed. — `MEMORY/archive/026-050.md`
- **32.** gold-standard AUDIT+FILL: ~67% (RULES_VERSION→6). — `MEMORY/archive/026-050.md`
- **33.** gold-standard CONFORM: 5/6 MUST-HAVEs fixed (CSP, CHANGELOG, CONTRIBUTING, CODE_OF_CONDUCT, pre-commit hook). — `MEMORY/archive/026-050.md`
- **34.** Gold-standard recomputed honestly to ~89% — SBOM+provenance attestation added, 2 lint warnings fixed properly, analytics ... — `MEMORY/archive/026-050.md`
- **35.** Repo settings hardened via `gh api` (branch protection, push-protection, SHA-pin enforcement). — `MEMORY/archive/026-050.md`
- **36.** `LICENSE` installed: MIT, HetCreep's explicit decision. — `MEMORY/archive/026-050.md`
- **37.** Admin command console + `/givecharacter` — client-only gate, self-disclosed as not real security. — `MEMORY/archive/026-050.md`
- **38.** 10-system CoalBoard ask-CB sweep — `MEMORY/archive/026-050.md`
- **39.** `ask-cb-on-new-systems.md` moved to `MEMORY.local.md` (Ring-0-only) — RULES_VERSION→8. — `MEMORY/archive/026-050.md`
- **40.** `ring0-authority.md`'s hardcoded email removed from Ring 0 detection (RULES_VERSION→9). — `MEMORY/archive/026-050.md`
- **41.** Audio engine built (`src/lib/audio/AudioEngine.ts`, Web Audio API, no dependency). Same-day fix: `initAudioEngine()` ... — `MEMORY/archive/026-050.md`
- **42.** 8 CC0 SFX (Kenney.nl) wired in. `CommandConsole` reskinned into `WorldChat` (same-browser-only, disclosed). — `MEMORY/archive/026-050.md`
- **43.** "เดินชมจันทร์" character picker added to `ProfileModal`. — `MEMORY/archive/026-050.md`
- **44.** `WorldChat` retroactive ask-CB pass — found+fixed a message-loss race, a11y gap, zero-test gap; escalated 2 product ... — `MEMORY/archive/026-050.md`
- **45.** Error-code helper system (`src/lib/errors/`) — `as const` registry, `tier:'silent'|'visible'` split, `no-console` oxlint ... — `MEMORY/archive/026-050.md`
- **46.** Loading-screen system, scope narrowed after ask-CB found "every scene transition" would regress (only one real async ... — `MEMORY/archive/026-050.md`
- **47.** gold-standard UI/UX AUDIT+FILL+ADOPT — ~70%, hand-written a11y over Radix (litigated twice), 5 MUST-HAVEs closed ... — `MEMORY/archive/026-050.md`
- **48.** Adaptive performance/FPS quality-scaling system — live FPS-sampled tier drives `dprMax`+shadows, manual override ... — `MEMORY/archive/026-050.md`
- **49.** AuthModal/NameModal short-viewport overflow fixed — real fix needed `dvh` not `%` (grid-sizing circularity), same bug ... — `MEMORY/archive/026-050.md`
- **50.** GitHub Pages `base` path was hardcoded — forks deployed blank pages. Fixed via `resolveBasePath()` from ... — `MEMORY/archive/026-050.md`
- **51.** Battle room was unreachable in the shipped game — 2 stacked bugs (z-index, NPC inside map obstacle) fixed. — `MEMORY/archive/051-075.md`
- **52.** Cherry-picked the fork's realtime battle overhaul (items 22-26) onto `master` — 6 commits, full verify green. — `MEMORY/archive/051-075.md`
- **53.** Retroactive ask-CB audit of the just-landed battle system found a CRITICAL gap: battle never transitioned to ... — `MEMORY/archive/051-075.md`
- **54.** GitHub Pages deploy queue-congestion diagnosed and fixed (this repo's push volume outran Pages' backend). — `MEMORY/archive/051-075.md`
- **55.** PR #10 (`nustanakritwithai/GameTurnBase`) reviewed and merged (battle sprite/asset fixes). — `MEMORY/archive/051-075.md`
- **56.** Retroactive ask-CB audit of 3 input systems — "unify into one hook" REFUTED 3/4; real bug fixed instead ... — `MEMORY/archive/051-075.md`
- **57.** Repo-wide constant/config centralization via `ultracode` (13 agents) — 6 central modules, 34 files, 3 CSS color-drift ... — `MEMORY/archive/051-075.md`
- **58.** Dead turn-based battle subsystem deleted (9 files, confirmed zero callers) — see ... — `MEMORY/archive/051-075.md`
- **59.** PR #11 (`nustanakritwithai`) reviewed via 4-seat ask-CB — real concerns flagged, HetCreep chose to merge as-is anyway. — `MEMORY/archive/051-075.md`
- **60.** Full ask-CB backfill sweep on every other-dev system found so far — `AddFriendModal` bug fixed (`1a8609a`). — `MEMORY/archive/051-075.md`
- **61.** PR #12 (`nustanakritwithai`, skill system) merged, reviewed after the fact — one real touch-target bug found ... — `MEMORY/archive/051-075.md`
- **62.** MEMORY.md compressed — `MEMORY/archive/051-075.md`
- **63.** Vendored `react-three-fiber`+`threejs-webgl` skills (MIT, `freshtechbro/claudedesignskills`) into `.claude/skills/` — ... — `MEMORY/archive/051-075.md`
- **64.** Added `.github/workflows/upstream-skill-watch.yml` (weekly cron) — diffs vendored-skill upstream HEAD shas, opens an ... — `MEMORY/archive/051-075.md`
- **65.** Two real lobby bugs from a player screenshot: (1) WebGPU `renderer.init()` had no timeout — stalled adapter negotiation ... — `MEMORY/archive/051-075.md`
- **66.** Full-repo CoalBoard audit (4 blind seats, 214 files) — found+fixed **1 CRITICAL + 5 HIGH**: `importSave()` could brick ... — `MEMORY/archive/051-075.md`
- **67.** Judge disconfirmed one of its own seats' HIGH findings — `MEMORY/archive/051-075.md`
- **68.** Fork sync verified empty, not assumed — `MEMORY/archive/051-075.md`
- **69.** Full `gold-standard` AUDIT, all 12 dimensions, 6 scouts, bar re-derived fresh from live-fetched exemplars — **overall ... — `MEMORY/archive/051-075.md`
- **70.** Verified directly — `MEMORY/archive/051-075.md`
- **71.** RE-VALIDATE pass — 7 binding rules were asserting stale/false things — `MEMORY/archive/051-075.md`
- **72.** Released 0.2.0 + changed deploy to version-gated — `MEMORY/archive/051-075.md`
- **73.** GitHub Actions major outage from 2026-08-06 15:22 UTC — `MEMORY/archive/051-075.md`
- **74.** Audit debt cleared: 4 silent bugs (`updatePlayer` dropped `savePlayer`'s result; `LobbyScene` leaked a ... — `MEMORY/archive/051-075.md`
- **75.** Open, HetCreep's call — `MEMORY/archive/051-075.md`
- **76.** Closed the gold-standard gaps that could be closed: **lint gate live** (`oxlint --deny-warnings`, 0 warnings — 34 ... — `MEMORY/archive/076-100.md`
- **77.** `no-shadow` proved itself twice in one hour — `MEMORY/archive/076-100.md`
- **78.** Ran the remaining 6 CoalMine canaries in parallel — all converged on one theme: **detected + handled but never disclosed ... — `MEMORY/archive/076-100.md`
- **79.** CLOSED 2026-08-10 by item 190 — Kenney CC0 attribution now recorded in `assets/ATTRIBUTION.md` — `MEMORY/archive/076-100.md`
- **80.** HetCreep decided all 7 open items (RULES_VERSION 12→13) — `MEMORY/archive/076-100.md`
- **81.** Error channel now live — `MEMORY/archive/076-100.md`
- **82.** ask-CB 4-seat on `admins.ts` + ledger cap — `MEMORY/archive/076-100.md`
- **83.** Open, bigger than instructed — flagged not solved — `MEMORY/archive/076-100.md`
- **84.** New rule: `MEMORY.md` must ship with every push/PR/delivery (RULES_VERSION 13→14, `agent-memory-law.md` §4). PR: ... — `MEMORY/archive/076-100.md`
- **85.** Reward system shipped and merged 0.4.0 — `BattleResultPanel`→`RewardSystem`→`earnGold`/`grantItem`/`applyBattleExp`→retu ... — `MEMORY/archive/076-100.md`
- **86.** Master Blueprint v1.0 adopted as product baseline — `MEMORY/archive/076-100.md`
- **87.** CRITICAL production incident found + fixed, then hardened to org-level — `MEMORY/archive/076-100.md`
- **88.** `main.tsx` hardened against the same failure class (`823f721`) — `MEMORY/archive/076-100.md`
- **89.** AuthModal autofill/import-save cleanup, pushed as 0.5.1 — `MEMORY/archive/076-100.md`
- **90.** Master Blueprint v3.0 merged as the sole blueprint, PR #19 — `MEMORY/archive/076-100.md`
- **91.** PR #22 (Combat Foundation Design Lock §3.6, docs-only, closes fork #33) + PR #21 (P3 skills+ultimate, real code) merged, ... — `MEMORY/archive/076-100.md`
- **92.** All 20 fork gap issues (#34–54) resolved — `MEMORY/archive/076-100.md`
- **93.** Mobile combat control UI redesign, v0.7.1 — `MEMORY/archive/076-100.md`
- **94.** Agent Blueprint + multi-dev task queue built — `MEMORY/archive/076-100.md`
- **95.** `AGENT_BLUEPRINT.md` moved `docs/`→repo root, `AGENTS.md` rule 17 added — `MEMORY/archive/076-100.md`
- **96.** Ring 0 traffic control law added, via 4-seat ask-CB gap sweep — `MEMORY/archive/076-100.md`
- **97.** Task-claiming made Ring-0-locked too — `MEMORY/archive/076-100.md`
- **98.** Break-glass claim fallback restored, symmetric with item 96 — `MEMORY/archive/076-100.md`
- **99.** `/gold-standard` full AUDIT+FILL+ADOPT, 12 dimensions, 6 scouts — `MEMORY/archive/076-100.md`
- **100.** Upstream PR #25 merged (Cursor's v0.7.2+v0.7.3), resolves item 93's "BLOCKED" state — `MEMORY/archive/076-100.md`
- **101.** 41-agent `close-gold-standard-gaps-and-tier1-systems` workflow landed, 6 scoped commits — `MEMORY/archive/101-125.md`
- **102.** Performance pass — `MEMORY/archive/101-125.md`
- **103.** Resilience pass — `MEMORY/archive/101-125.md`
- **104.** Session TTL added, v0.3.1 — `MEMORY/archive/101-125.md`
- **105.** Deploy-gate root cause found — `MEMORY/archive/101-125.md`
- **106.** Git-history rewrite (old admin email, 49 commits) — decided NOT to do — `MEMORY/archive/101-125.md`
- **107.** Combat camera framing — `MEMORY/archive/101-125.md`
- **108.** Combat camera pitch raise — `MEMORY/archive/101-125.md`
- **109.** Upstream PR #29 (P4 combat core, v0.9.0) reconciled against this session's 9 Tier-1 systems (item 101) — `MEMORY/archive/101-125.md`
- **110.** Upstream PR #28 (camera 30° + 8-dir walk sprites, v0.8.3) merged — `MEMORY/archive/101-125.md`
- **111.** Upstream PR #30 (P5 dungeon vertical slice, v0.10.0) merged — `MEMORY/archive/101-125.md`
- **112.** Upstream PR #31 (result/reward pipeline, v0.11.0) merged — `MEMORY/archive/101-125.md`
- **113.** Upstream PR #32 (camera +30% view height fix, v0.11.1) merged, zero conflicts — `MEMORY/archive/101-125.md`
- **114.** PR #33 flagged as a real collision, PR #34 closed as redundant, TASKS.md brought current — `MEMORY/archive/101-125.md`
- **115.** "Continue with Google" sign-in added — `MEMORY/archive/101-125.md`
- **116.** Email↔Google account linking added — `MEMORY/archive/101-125.md`
- **117.** Guest (anonymous) accounts + 30-day cleanup added — `MEMORY/archive/101-125.md`
- **118.** Cloudflare Turnstile CAPTCHA wired into all 3 auth entry points — `MEMORY/archive/101-125.md`
- **119.** PR #33 (P8 Character Progression) merged — false-alarm on the "design collision" flagged in item 114 — `MEMORY/archive/101-125.md`
- **120.** Tasks/Memory parity law adopted — `MEMORY/archive/101-125.md`
- **121.** CharacterPreview scale-lock + auto-rotate + fullscreen — `MEMORY/archive/101-125.md`
- **122.** Sprite re-crop closes the item-121 zoom gap — `MEMORY/archive/101-125.md`
- **123.** TASKS.md backfilled again + tasks-memory-parity-law's real gap diagnosed — `MEMORY/archive/101-125.md`
- **124.** Movement System tests & sub-stepping graduation — `MEMORY/archive/101-125.md`
- **125.** Hero Collection System tests graduation — `MEMORY/archive/101-125.md`
- **126.** Currency system tests graduation — `MEMORY/archive/126-150.md`
- **127.** Basic Attack lungeDistance gap closed — `MEMORY/archive/126-150.md`
- **128.** Combat Facing System (#2) graduated to 100% — `MEMORY/archive/126-150.md`
- **129.** Hit Reaction System Dogfood (#6) graduated to 100% — `MEMORY/archive/126-150.md`
- **130.** Battle presentation regression fixed on `codex/battle-control-ui-regression` — `MEMORY/archive/126-150.md`
- **131.** Control / Input System Dogfood (#26) graduated to 100% — `MEMORY/archive/126-150.md`
- **132.** Skill / Cast System Dogfood (#4) graduated to 100% — `MEMORY/archive/126-150.md`
- **133.** Enemy AI System Dogfood (#9) graduated to 100% — `MEMORY/archive/126-150.md`
- **134.** Reward System Dogfood (#18) graduated to 100% — `MEMORY/archive/126-150.md`
- **135.** Progression System Dogfood (#14) graduated to 100% — `MEMORY/archive/126-150.md`
- **136.** Stage / Adventure System Dogfood (#16) graduated to 100% — `MEMORY/archive/126-150.md`
- **137.** Per-Move Property Schema Dogfood (#5) graduated to 100% — `MEMORY/archive/126-150.md`
- **138.** Effects System Dogfood (#7) graduated to 100% — `MEMORY/archive/126-150.md`
- **139.** Skill-Targeting System Dogfood (#8) graduated to 100% — `MEMORY/archive/126-150.md`
- **140.** Boss System Dogfood (#11) graduated to 100% — `MEMORY/archive/126-150.md`
- **141.** Elite/Mini-boss Tier System Dogfood (#10) graduated to 100% — `MEMORY/archive/126-150.md`
- **142.** Stage/Adventure System Dogfood, second pass — `MEMORY/archive/126-150.md`
- **143.** Stage Variation System Dogfood (#17) graduated to 100% — `MEMORY/archive/126-150.md`
- **144.** Hero Kit / Archetype System Dogfood (#12) — real caveat, held at 90% not 100% — `MEMORY/archive/126-150.md`
- **145.** Economy/RLS integrity fixes — live-exploitable currency self-mint + silent progression-save failure, both closed — `MEMORY/archive/126-150.md`
- **146.** Item 145's 3 residual gaps closed the same session — `MEMORY/archive/126-150.md`
- **147.** Fork PR #73 split — PR-3 reward idempotency rebased — `MEMORY/archive/126-150.md`
- **148.** Migrations 0008-0013 VERIFIED LIVE on production — `MEMORY/archive/126-150.md`
- **149.** Upstream PR #64 merged — `MEMORY/archive/126-150.md`
- **150.** Fork PR #73 split — PR-4 P8 playtest regression tests — `MEMORY/archive/126-150.md`
- **151.** Hero Kit optional-field consumers corrected — `MEMORY/archive/151-175.md`
- **152.** Dungeon final-stage hang fixed — `MEMORY/archive/151-175.md`
- **153.** Battle grounding + curved Combat Cluster — `MEMORY/archive/151-175.md`
- **154.** Chapter 1 story stages 1-1..1-10 + StageSelect refresh — `MEMORY/archive/151-175.md`
- **155.** Battle stage-select overlay fix — `MEMORY/archive/151-175.md`
- **156.** Dead (never-played) account cleanup — `0014_dead_account_cleanup.sql` — `MEMORY/archive/151-175.md`
- **157.** Blueprint-vs-code audit (10-agent workflow) + moderation gap #10 resolved — `MEMORY/archive/151-175.md`
- **158.** Ring-0 Blueprint divergence decisions implemented — `MEMORY/archive/151-175.md`
- **159.** Real-Browser Visual Dogfooding of All In-Game Modals & Layering Architecture Fix — `MEMORY/archive/151-175.md`
- **160.** Backend / Server-Authority System Dogfood (#25 / DF9) graduated to 100% — `MEMORY/archive/151-175.md`
- **161.** Star Ascension System (#15) graduated to 100% — `MEMORY/archive/151-175.md`
- **162.** Gacha System (#23) graduated to 100% — `MEMORY/archive/151-175.md`
- **163.** Screen Aspect Ratio & Responsive Layout Dogfood (#29 / DF22) graduated to 100% — `MEMORY/archive/151-175.md`
- **164.** Battle Viewport Reactive Hooks and Overlays Dogfood — `MEMORY/archive/151-175.md`
- **165.** Ring-0 Blueprint divergence decisions implemented — `MEMORY/archive/151-175.md`
- **166.** DF20/P8 ownership handoff + PR #83 continuation — `MEMORY/archive/151-175.md`
- **167.** Ring 0 Full Master Branch Consolidation — `MEMORY/archive/151-175.md`
- **168.** Star Ascension Production authority follow-up — `MEMORY/archive/151-175.md`
- **169.** Gacha trust-boundary correction after master consolidation — `MEMORY/archive/151-175.md`
- **170.** P12 ranked power normalization #20 — `MEMORY/archive/151-175.md`
- **171.** Git branch hygiene — `MEMORY/archive/151-175.md`
- **172.** Lobby system integration + Gacha Production authority — `MEMORY/archive/151-175.md`
- **173.** P12 private authoritative PvP #21 — `MEMORY/archive/151-175.md`
- **174.** PR #96 P12 authority review fixes — `MEMORY/archive/151-175.md`
- **175.** OAuth redirect stranded the session JWT in the URL — fixed 2026-08-09 (HetCreep reported from another dev's screenshot) — `MEMORY/archive/151-175.md`
- **176.** v0.15.0 shipped two player-facing buttons whose backend was not deployed — `MEMORY/archive/176-200.md`
- **177.** The v0.15.1 PvP gate leaked, and the fix moved the flag rather than patching the hole — `MEMORY/archive/176-200.md`
- **178.** Full doc-vs-code fidelity audit — 63 agents, 147 stale claims fixed, 3 real design forks handed off — `MEMORY/archive/176-200.md`
- **179.** Design-fork handoff answered (1.a/2.b/3.a/4.b) and implemented — `MEMORY/archive/176-200.md`
- **180.** The belt system installed + law overhaul to RULES_VERSION 27 — `MEMORY/archive/176-200.md`
- **181.** RULES_VERSION 28 — the ADDRESSING rule + Ring-1 duty ends at PR submission — `MEMORY/archive/176-200.md`
- **182.** RULES_VERSION 29 — queue discipline hardened — `MEMORY/archive/176-200.md`
- **183.** Belt run 1 — security wave + design-lock dispatches under fire — `MEMORY/archive/176-200.md`
- **184.** Belt run 2 — the 4-PR hold wave, all three QC-failed, dispositioned, #98 landed — `MEMORY/archive/176-200.md`
- **185.** #100 stage-objective reimplement landed — the belt's first inward reimplement of a QC-failed external PR — `MEMORY/archive/176-200.md`
- **186.** Erlang Shen (`spear-warrior`) landed — belt inward-reimplement 2/2 complete — `MEMORY/archive/176-200.md`
- **187.** #104 belt round-trip — a rule-violating direct merge caught, reverted, re-entered at MAKE — `MEMORY/archive/176-200.md`
- **188.** #25 server-owns-progression code LANDED — first full claude -p caretaker → fresh-eyes gate → merge cycle + the ... — `MEMORY/archive/176-200.md`
- **189.** The 12-agent audit, the memory split, and five lanes that all failed their first gate — `MEMORY/archive/176-200.md`
- **190.** Asset provenance recorded (870 assets, authorship measured) + two account-deletion cron jobs disarmed — `MEMORY/archive/176-200.md`
- **191.** DESIGN LOCK (owner) — game values are BASE x SCALE under one rule; a PR carrying a per-case magic number is converted at intake — `MEMORY/archive/176-200.md`
- **192.** v0.17.0 shipped — 10 belt lanes, 52 audit findings worked off, every lane bounced at least once on the same species: correct code with nothing pinning it — `MEMORY/archive/176-200.md`
- **193.** Three external PRs taken in — #111 reverted for bypassing its own gate, #107 and #109 adopted through it — `MEMORY/archive/176-200.md`
- **194.** Master's history rewritten to remove a leaked Supabase key — every SHA after `e8e9d210` is dead on master; item 193's `5135bde` corrected to `ff5d384` — `MEMORY/archive/176-200.md`
- **195.** A shipped migration told the operator a zero meant safe — the zero was a moving window (0 accounts on 2026-09-06, 12 on 2026-09-08); the pre-arm check is now a per-account projection, SQL body unchanged — `MEMORY/archive/176-200.md`
- **196.** Audit #36 (`loadPlayer` ignores 7 of 8 query errors) was already fixed in `0bee26d` — its TEST covered 5 of 8 tables; list now derived from the real calls — `MEMORY/archive/176-200.md`
- **197.** Task #93 split at the gate — honest login error shipped, recovery form held for SMTP; two account-existence oracles closed, one named as still open — `MEMORY/archive/176-200.md`
- **198.** DESIGN LOCK (owner) — sprite geometry contracted; the draft's own verification killed 50 of 96 claims, and the live browser settled the rest — `MEMORY/archive/176-200.md`

- **199.** The sprite lock split into template + conformance; a six-domain sweep found 172 published values, and proved the anchor tolerance cannot have one — no tool stores a per-frame anchor to validate — `MEMORY/archive/176-200.md`

- **200.** The anchor tolerance nobody publishes, measured out of two external corpora — base = 1 px absolute for alignment (proved not to scale with character size), proportional bands for depicted movement; template carved out to CC BY-NC-ND — `MEMORY/archive/176-200.md`
- **201.** Sprite belt lanes 1 and 2 landed (preload burst 96→80 with a 4-deep queue; an 18-test frame contract with every invariant proven red-then-green) — lane 3 blocked by main dispatching three agents into one tree without the workdir lock — `MEMORY/archive/201-225.md`
- **202.** `E3` turned #100/#106 from "design a mechanism" into "extend a table that already exists" — size spread 8.0-75.1% down to 0.02-0.55%, feet at 356.0000 for all ten families, the resolution cost published rather than buried, and a green-staying seventh mutation disclosed as a real hole jsdom cannot see — `MEMORY/archive/201-225.md`
