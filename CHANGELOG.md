# Changelog

รูปแบบอิง [Keep a Changelog 2.0.0](https://keepachangelog.com/en/2.0.0/)
เวอร์ชันอิง [Semantic Versioning 2.0.0](https://semver.org/)

## [Unreleased]

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
