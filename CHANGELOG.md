# Changelog

รูปแบบอิง [Keep a Changelog 2.0.0](https://keepachangelog.com/en/2.0.0/)
เวอร์ชันอิง [Semantic Versioning 2.0.0](https://semver.org/)

## [Unreleased]

ยังไม่มี

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
