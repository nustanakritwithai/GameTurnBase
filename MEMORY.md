# MEMORY.md — Project State & History Journal

> **Operator / Human User**: `HetCreep`
> **Repository**: `LegendofSoulTH/LegendOfSoulTH`
> **Default Branch**: `master`
> **Last Updated**: 2026-08-07T13:30:00+07:00 by `Cursor Agent (cloud)`
> **RULES_VERSION last synced: 11** (see `.agents/rules/rules-freshness-check.md` — this exact line is what the check greps for; the compression pass that rewrote this file dropped it, restored here)

> **2026-08-06 overhaul**: this file had grown to 65+ interleaved, verbose items (two colliding numbering
> tracks from concurrent sessions/forks) and was getting expensive to read every session. Compressed to
> essentials per HetCreep's explicit request. **Full narrative detail for anything below now lives in
> `git log`/`git show <sha>` — commit messages this session are detailed and are the source of truth for
> "why," not this file.** Keep future entries to 1-3 lines; link a commit SHA instead of re-narrating it.

---

## 👤 Identity & System Context

- **Owner**: `HetCreep`
- **Project**: Legend of Soul-TH (repo slug `LegendOfSoulTH`) — mythic real-time action RPG, React 19 + TypeScript (strict) + Vite 8 + Three.js/R3F, Oxlint, client-only (no backend, localStorage persistence)
- **Live**: https://legendofsoulth.github.io/LegendOfSoulTH/

---

## 🎯 Current Status

- **Repo**: 🟢 clean & synced, `origin/master` @ `d9386db`. `npm run ci` (typecheck+lint+test+build) green — 165 tests/18 files.
- **Battle**: realtime action battle (`src/game/realtimeBattle/`) is the ONLY live combat path — attack, dash, 3-hit combo, one skill (Monkey King only, `skills.ts`). Old turn-based system (`src/game/battle/engine.ts` etc.) fully deleted (twice — see Lessons). `types.ts`/`formulas.ts` in that same folder are NOT dead — still imported by `BattleResultAdapter.ts`/`useGameFlow.ts`/`DamageSystem.ts`, keep them.
- **Lobby entry**: "ต่อสู้" and "เริ่มการผจญภัย" both open `LobbyBattleSession` → `trial-01` directly, skipping exploration. Exploration/NPC/dialogue subsystem (`GameExplorationSession`, `useGameFlow`, `game/dialogue/*`, `game/npc/*`) still exists but has **zero live entry point** — deliberate per PR #11 (ask-CB flagged concerns: mislabeled "เริ่มการผจญภัย" button, `trial-02` unreachable, no exploration re-entry — HetCreep chose to merge anyway, accepting the trade-off). Files remain; wire a new entry rather than rewriting.
- **Skill system** (PR #12, `c58c3c2`): ask-CB'd 2026-08-06 — code/architecture solid (3/4 seats bless as-is), one real bug found: `SkillButton` mobile-landscape touch target ~41.3px, under this file's own established 44px floor (Attack/Dash in the same file already fixed to this bar). Fix pending.
- **Other-dev systems ask-CB backfill**: complete as of last sweep — Auth/Economy/Roster/3D/Battle/Exploration/Dialogue/UI-HUD/Assets/Infra, WorldChat, realtime battle overhaul, 3 input systems, Items/Friends/WorldChat-admin, PR #11, PR #12 all reviewed. Standing rule still active: **any new system merged by another dev gets sent through the 4-seat ask-CB opinion lane (realtime/reality/feeling/outdim) retroactively, reworked per verdict** — flag if a future sweep finds a gap.
- **Reward integration**: deferred, not a risk yet — `BattleResultAdapter.ts` hardcodes `earnedGold`/`earnedExp`/`droppedItems` to `0`. Revisit the client-authoritative trust boundary consciously when real rewards get wired up.
- **Open/unbuilt, disclosed not hidden**: no quest system, no real drop table, no gamepad support. Audio placeholders unresolved by choice: `portalOpen`/`levelUp`/`victory`/`defeat` SFX + lobby music (no confident mood-matched CC0 file found). `ItemsModal`/`AddFriendModal`'s "block" list has no populating action anywhere — honestly empty, not broken.
- **UI/UX gold-standard backlog**: `.agents/rules/gold-standard-baseline.md` — ~70-89% depending on dimension, MUST-HAVEs closed, EXCELLENCE-tier gaps tracked there with exemplar citations, not scaffolded (3D character-select keyboard path, tab-strip `aria-controls`, `AuthModal` live-validation, breakpoint tokens, a few reduced-motion gaps).
- **Security posture**: client-only, no backend — documented in `SECURITY.md`'s Out-of-Scope (editable localStorage, demo PBKDF2 auth, client-only admin gate in `src/data/admins.ts`). CodeQL + Dependabot + Secret Scanning + Gitleaks + NPM Audit + branch protection (basic) + Action SHA-pinning all on. `secret_scanning_validity_checks` won't toggle via API — check manually at Settings → Code security.
- **Repo access note**: GitHub user `kaoshock123` has direct push access to `master` despite not being an org member — discovered incidentally, not yet deliberately reviewed by HetCreep at Settings → Collaborators.
- **CI/Deploy**: Pages queue-congestion fixed — a `queue-check` step in `deploy.yml` skips creating a new deployment while a prior one is still `queued`/`in_progress` (root cause: this repo's own push volume was piling deployments faster than GitHub Pages' backend could drain, not a code bug).
- **Player accounts/currency/items/friends/chat**: all functional locally, entirely client-side. `WorldChat` is same-browser-only (`localStorage`+`BroadcastChannel`), not real cross-device chat — disclosed via an in-app `SCOPE_NOTE`.
- **License**: MIT (HetCreep's explicit decision, gold-standard rule forbids an agent auto-picking).
- **Fork gap-closure issues** (`nustanakritwithai/GameTurnBase` #19–#25, 2026-08-07): #19 (demo topup vs premium model) **ยังประชุม** · #20–#24 **ถูกต้อง รอ implement** · #25 **กล้องล็อกแล้ว** — เป้าหมายคือเกมต่อสู้แบบ **2.5D side-down** (มองจากด้านข้างเฉียงลง ไม่ใช่ top-down) แต่เดิน **360°** บนสนาม (brawler/arena — สอดคล้อง Master Blueprint PART 3) · โค้ดปัจจุบัน `BattleCamera.tsx` ยัง top-down = CONFLICT รอ migration track แยก

---

## 🧠 Lessons & Conventions (`[[tag]]`)

- **`[[browser-pane-not-compositing]]`** — this environment's Browser pane sometimes doesn't render/composite frames (canvas stuck at default size, `screenshot` errors "not compositing"). When it happens, verify via code review + typecheck/build + DOM/layout inspection instead of visual screenshots, and say so honestly rather than claiming untested visuals worked.
- **`[[css-fix-overcorrection]]`** — resizing/rescaling a themed frame (proportional CSS changes) without also checking what's positioned *inside* it against the same math causes overflow/misalignment. Always recompute inner-element positions by the same scale factor, not just the outer box.
- **`[[percent-maxheight-grid-indeterminate]]`** — a percentage `max-height` on a grid/flex item whose container sizes to content (`display:grid; place-items:center`) never resolves (circular sizing). Use `dvh`/viewport units or an explicit container size instead.
- **`[[test-existence-not-authenticity]]`** — a test file testing a code path proves the code was once exercised, not that it's reachable in production today. Always trace real callers/entry points before trusting "it has tests" as evidence of aliveness.
- **`[[shared-hook-refuted-by-divergent-semantics]]`** — a "let's extract one shared hook/component" instinct across superficially-similar systems (UI modals, input handling) should be checked against real behavioral divergence first; ask-CB has independently refuted this proposal twice this project (UI/HUD systems, then input systems) because the systems' downstream semantics genuinely differed.
- **`[[verify-before-assuming-regression]]`** — a reverted-looking diff from a concurrent push/merge can be a legitimate supersession (e.g. an asset that was deleted got re-added with new content), not a regression. Check the CURRENT state of the file/asset before "fixing" it back.
- **New-systems law**: any system a session builds, or discovers another dev/session merged, that's genuinely new (not a fix/content-addition to an existing system) gets a CoalBoard "ask CB" 4-seat opinion-lane pass before being considered done. Ring-0-scoped instruction text lives in gitignored `MEMORY.local.md`; the practice itself is documented here since it governs project history.
- **Pre-push sync law**: `.agents/rules/pre-push-sync-law.md` — `git fetch` + check ahead/behind, merge any incoming commits, re-run full verify, only then push. Binding on every machine, every push.
- **Personal-scope law**: `.agents/rules/personal-scope-law.md` — personal/off-project content never goes in this file (mandatory reading has a token cost every future session pays); use gitignored `MEMORY.local.md`.
- **Commit-granularity law**: `.agents/rules/commit-granularity-law.md` — one completed task = one commit.
- **PowerShell 5.1 has no `` `u{XXXX} `` unicode escape** — silently inserts literal text instead of erroring. Use `[char]0x201C` or type the character directly; always verify inserted content with Read afterward.

---

## 📜 Timeline (compact — see `git log --oneline` / `git show <sha>` for full detail)

All entries 2026-08-05/06 unless noted. Roughly chronological.

1. Lobby scene + 2.5D graphics engine (R3F) built.
2. CI/CD + automation set up (build/typecheck/lint/CodeQL/security workflows).
3. Branch/settings consolidation.
4-5. GitHub security enforcement + automated security workflows enabled.
6. Player accounts + gold/gem currency system (`c019bb7`, refined `6157f89`/`0a66592`).
7. ECC coding rules installed.
8. gold-standard AUDIT+FILL, 11 dimensions, ~25% (not inflated).
9. Ring system + rules-freshness-check installed.
10. Merged concurrent-session work from two machines by hand.
11. Pre-push sync law codified (RULES_VERSION→2).
12. CI cleanup, broken images fixed live, GLB models stopped shipping to prod.
13. Ring 0 detection fixed for cloud agents (RULES_VERSION→3).
14. ponytail-audit cleanup, README refresh, AuthModal Esc-to-switch-tab.
15. Battle/exploration/dialogue/NPC system merged from an untrusted external PR (`Hih#11`) — investigated file-by-file before merging (Ring 1 due diligence), 40 genuinely new files pulled in, `publicUrl()` subpath-404 sweep extended.
16. False-positive "lost account data" investigation (no real bug found — browser-automation tool artifact); commit-granularity law added (RULES_VERSION→4).
17. `SECURITY.md` added, written for this project's actual (client-only) shape.
18. `.coalmine.json` scan-exclusion fix + Dependency Review + Harden-Runner added.
19. `.coalmine.json` untracked from git entirely (personal tuning knob, not team-shared).
20. `GameViewport` fixed-1600×900 letterbox removed → fluid stage; 2 real breakages fixed (`LobbyPage` CSS Grid min-width, `WukongAdventure` world→screen coordinate mapping).
21. rot-canary follow-up: fixed a stale-`sceneSize` bug in item 20's fix (missing effect dependency).
22-26 *(fork-side, `Claude Code cloud, Ring 1`, `nustanakritwithai/GameTurnBase`)*: realtime battle built step by step — room/runtime base, movement/camera/joystick, enemy AI chase+attack, hitbox+damage, 3-hit combo+dash. Built and verified on the fork; landed on this repo's `master` later (see #45 below).
27. Modal background unification (4 modals migrated to the gold-panel design language).
28. Version sync + first tagged release `v0.1.0`; `SettingsModal`/`CharacterRosterModal` character-count stat fixed.
29. Repo renamed `GameTurnBase`→`LegendOfSoulTH`, all infra/prose references swept.
30. GitHub "About" panel filled in (description/homepage/topics).
31. Gold made purchasable — `GemShopModal` generalized to `CurrencyShopModal`.
32. Esc-to-close audited across every modal, 4 real gaps fixed.
33. Image pipeline built (`assets/raw/`→WebP→`public/`, 77% smaller), 88MB of dead assets archived.
34. Icon-scaling audit + CPU re-render fix (`WukongAdventure`'s per-frame `setState`) + deploy-watcher banner.
35. Personal/off-project content law added — `MEMORY.local.md` created (RULES_VERSION→5).
36. FPS/render-sync pass: refresh-rate-aware `dpr` + capped React commit rate at 60Hz.
37. WebGPU primary renderer, WebGL2 fallback, `three@0.185.1`'s `WebGPURenderer`.
38. rot-canary: `WebGPURenderer` disposal-on-fallback resource leak fixed.
39. gold-standard AUDIT+FILL: ~67% vs OWASP ASVS/GitHub Community Standards/Keep-a-Changelog/SemVer/pmndrs-r3f (RULES_VERSION→6).
40. gold-standard CONFORM: 5/6 MUST-HAVEs fixed (CSP meta tag, CHANGELOG.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, husky+lint-staged pre-commit).
41. Gold-standard recomputed honestly to ~89% (not 100%) — SBOM+build-provenance attestation added, 2 real lint warnings fixed properly (not silenced), analytics declined (no backend, same wall as Sentry).
42-45. HUD icon shrink (desktop, then reverted-on-mobile after scope correction) + naga-frame/treasury resize iterations, 3 rounds of refinement including a measured (not eyeballed) text-overflow fix by decoding the actual PNG art — `@media (min-width:761px)` restructure now the load-bearing desktop-only convention for `TopBar.module.css`.
46. Repo settings hardened via `gh api` (basic branch protection, push-protection, SHA-pin enforcement).
47. `LICENSE` installed: MIT, HetCreep's explicit decision.
48. Admin command console + `/givecharacter` + `grantCharacter()` — client-only gate, self-disclosed as not real security.
49. **10-system CoalBoard ask-CB sweep** (Auth/Economy/Roster/3D-Render/Battle/Exploration/Dialogue/UI-HUD/Assets/Infra), 40 seats, all verdicts applied: PBKDF2 120k→600k iterations + save export/import, dev-only-gated admin console (later superseded), GLB pipeline stopped shipping to prod, `SkillDefinition` discriminated-union refactor, 40+ new unit tests, `useModalA11y` shared hook (6 modals), new-systems-ask-CB law established.
50. `.agents/rules/ask-cb-on-new-systems.md` retired from the public repo (Ring-0-only content) → moved to `MEMORY.local.md` (RULES_VERSION→8).
51. `ring0-authority.md`'s hardcoded real email removed from its Ring-0 detection signal (redundant with git-identity/`gh api` checks) — RULES_VERSION→9.
52. Audio engine built (`src/lib/audio/AudioEngine.ts`) — Web Audio API, no dependency (Howler.js researched and rejected, unmaintained since 2023). Same-day rot-canary catch: `initAudioEngine()` never fired for returning logged-in players (bypassed `TitlePage`) — fixed.
53. 8 real CC0 SFX files sourced from Kenney.nl, wired into shared touchpoints (modals, dialogue, battle hits, toasts, nav buttons). `CommandConsole` reskinned into `WorldChat` — visible to every player, admin commands hidden inside, same-browser-only chat honestly disclosed.
54. "เดินชมจันทร์" character picker added to `ProfileModal`.
55. `WorldChat` retroactive ask-CB pass (first use of the new-systems-law extended to catch OTHER sessions' unreviewed systems) — found and fixed a real message-loss race (`Promise`-chained write queue), `storage` event→`BroadcastChannel`, a11y gap, zero-test gap. Escalated 2 product questions to HetCreep (label honesty → added `SCOPE_NOTE`; admin command exposure → added a private nudge).
56. Error-code helper system (`src/lib/errors/`) — `as const` registry (never `enum`, `erasableSyntaxOnly` forbids it), `import.meta.env.DEV` toggle, `tier: 'silent'|'visible'` split (deliberately deviated from the literal "wrap everything" ask, explained why), `no-console` oxlint rule enforces it going forward.
57. Loading-screen system, scope deliberately narrowed after ask-CB found the literal "every scene transition" request would be a regression (only one real async boundary exists) — reused the existing 魂 seal motif instead of a generic spinner.
58. gold-standard UI/UX AUDIT+FILL+ADOPT vs Star Rail/Genshin/Material Design 3/WCAG 2.2 AA/Apple HIG — ~70%, hand-written a11y scaffolding chosen over adding Radix (litigated twice, same answer both times), 5 MUST-HAVEs closed, rest tracked as backlog (RULES_VERSION→10).
59. Adaptive performance/FPS quality-scaling system built — live FPS-sampled tier drives `dprMax`+shadow `castShadow`, asymmetric hysteresis, tab-visibility guard, manual override short-circuits the sampler entirely.
60. AuthModal/NameModal short-viewport overflow fixed, ported from a fork PR; found the real fix needed `dvh` not `%` (grid-sizing circularity) — same bug then confirmed+fixed in 4 more modals (`task_afb9645b`).
61. GitHub Pages `base` path was hardcoded to this repo's name — forks deployed blank pages. Fixed via `resolveBasePath()` deriving from `GITHUB_REPOSITORY`.
62. Battle room was unreachable in the shipped game — 2 stacked bugs (`ExplorationControls` z-index below the scene it sat under; an NPC positioned inside a map obstacle) — both fixed.
63. Cherry-picked the fork's realtime battle overhaul (items 22-26) onto this repo's `master` — 6 commits, full static verify green.
64. Retroactive ask-CB audit of the just-landed realtime battle system found a CRITICAL gap static verify missed: battle never transitioned to victory/defeat, never advanced past wave 1. Fixed (`RealtimeBattleRuntime.checkBattleEnd()`), 3 new tests lock it in.
65. GitHub Pages deploy queue-congestion diagnosed and fixed — debounce step, then a stronger `queue-check` step (this repo's own push volume was outrunning Pages' backend, not a code bug).
66. PR #10 (`nustanakritwithai/GameTurnBase`) reviewed and merged (battle sprite/asset fixes for the realtime cherry-pick).
67. Retroactive ask-CB audit of the 3 independent input systems (battle/exploration/moonlight-walk) — broad "unify into one hook" proposal REFUTED 3/4 (genuinely divergent semantics), narrow real bug confirmed and fixed instead: `useExploration.ts` used last-write-wins instead of a held-key Set, causing stuck/dropped movement.
68. Repo-wide constant/config centralization via an `ultracode` Workflow (13 agents) — 6 new/extended central modules, 34 files, 3 confirmed CSS color-drift bugs fixed as a side effect of forcing one canonical value. Caught and resolved a real merge collision with a concurrent push mid-deploy.
69. Dead old turn-based battle subsystem deleted (9 files, confirmed zero production callers) — corrected scope twice mid-task before the final list was right (see `[[verify-before-assuming-regression]]`-adjacent lesson: always re-verify import scope with a comprehensive grep before deleting, not a partial one).
70. PR #11 (`nustanakritwithai`) reviewed via 4-seat ask-CB — flagged real concerns (mislabeled button, `trial-02` orphaned, exploration cut from main path) but HetCreep chose to merge as-is anyway, informed trade-off.
71. Full ask-CB backfill sweep across every other-dev-introduced system found so far — Items/Friends/WorldChat-admin all reviewed; `AddFriendModal` had a real bug (success toast with zero persistence), fixed (`1a8609a`). Caught a merge-conflict regression mid-push, investigated before assuming (asset had actually been legitimately restored, not broken) — see `[[verify-before-assuming-regression]]`.
72. PR #12 (`nustanakritwithai`) — realtime battle skill system — merged directly, reviewed via 4-seat ask-CB after the fact: code/architecture solid, one real touch-target bug found (`SkillButton` mobile-landscape, ~41.3px vs this file's own 44px floor).
73. **This item — MEMORY.md compressed** from 65+ verbose interleaved items to this timeline, per HetCreep's explicit request. Nothing lost — `git log` has the rest.
74. Searched the Claude Code skill marketplace (awesome-claude-code + web) for game/web-dev skills — found nothing not already duplicated by the existing Coal-ecosystem, except real 3D/R3F-specific gaps. Vendored `react-three-fiber`+`threejs-webgl` skills (MIT, `freshtechbro/claudedesignskills`) into `.claude/skills/`, ECC-style (git-tracked, zero per-dev install) — picked over a from-scratch "Game Engine" skill and a non-R3F-aware generic Three.js skill because these two name-match the actual libraries in use. Anthropic's official `frontend-design` plugin was found too but NOT vendored — its repo is all-rights-reserved, can't be copied into a third-party repo like MIT content can; HetCreep installs it personally instead (`/plugin install frontend-design@claude-code-plugins`).
75. Added `.github/workflows/upstream-skill-watch.yml` (weekly cron) — compares the two vendored/cherry-picked upstream sources' (`freshtechbro/claudedesignskills`, `affaan-m/ECC`) current HEAD sha against `.github/upstream-watch/state.json`, opens an issue with the ahead-by count + compare link if either moved, self-updates the state file after. Excluded that state path from `ci.yml`/`deploy.yml` so its own bookkeeping commits don't trigger a full build+deploy. Verified end-to-end on a real Actions run (`workflow_dispatch`), not just locally.
76. Two real lobby bugs from a player screenshot: (1) "login stuck" — `LobbyScene.tsx`'s WebGPU `renderer.init()` had no timeout; if the adapter negotiation stalls (real failure mode on some GPU drivers), the promise never resolves *or* rejects, so the WebGL2 fallback never runs — the player sees this as the game hanging right after login. Fixed with a 4s `Promise.race` timeout. (2) "mobile scale broken" — three layout rules (`StartAdventure`/`MainNavigation`/`LobbyPage` module CSS) only checked `max-width`, never `max-height`, so a landscape-mobile viewport wider than their breakpoints but short kept desktop positioning — the "เริ่มการผจญภัย" button visibly collided with the bottom nav. Added `, (max-height: ...)` (OR) to all three, same pattern already used for BattleScene's touch-target fixes. Also found and merged two full duplicate `.button`/`@media` blocks left in `StartAdventure.module.css` from before it switched to an image-based design. Verified live via dev server + `getBoundingClientRect` (not just code review) at 4 viewports (900x400/812x375 landscape — confirmed real overlap before, clear after; 1280x720 desktop and 390x844 portrait — unaffected).
77. **Fork blueprint gap sweep — สถานะ issue + ล็อกกล้อง #25** (HetCreep 2026-08-07): #19 ยังคุย · #20–#24 รอสร้าง/ทำ · #25 ตัดสินแล้ว = fighting-game style, **side-down 2.5D + เดิน 360° ในฉาก** (ไม่ใช่ top-down ปัจจุบัน ไม่ใช่ side-scroller แกนเดียว) — คอมเมนต์บันทึกที่ `GameTurnBase#25`
