# Upstream Submission Workflow — ส่งงานเข้าระบบหลัก

> **Scope**: Binding for every AI agent submitting work to the **canonical** repository.  
> **Operator**: HetCreep (Ring 0, 2026-08-07)  
> **Canonical upstream**: `KatomnoiStudio/LegendOfSoulTH` (`master`)  
> **Design fork** (Q&A only): `nustanakritwithai/GameTurnBase`

---

## ⚠️ กฎเหล็ก — อ่านก่อนประกาศ "ส่งงานแล้ว"

### Fork PR **ไม่ใช่** การส่งงานเข้าระบบหลัก

| สถานะ                                                   | ความหมาย                                                               | ห้ามพูดว่า                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| มีแค่ PR บน **fork** (`nustanakritwithai/GameTurnBase`) | งานยัง **ไม่เข้า** canonical · deploy/release **ไม่เกิด**              | ❌ "ส่งงานแล้ว" · ❌ "พร้อม merge upstream" · ❌ "แจ้ง Backend แล้ว" |
| มี PR บน **upstream** (`KatomnoiStudio/LegendOfSoulTH`) | ส่งงานถูกที่แล้ว · รอ review/merge                                     | ✅ "Upstream PR: \<url\>"                                            |
| Bot push upstream ไม่ได้ (403)                          | **BLOCKED** — ต้องให้ HetCreep เปิด **cross-repo PR** หรือ cherry-pick | ✅ "BLOCKED: ต้องเปิด upstream PR" + ขั้นตอนด้านล่าง §6              |

**ตัวอย่างผิด (ห้ามทำซ้ำ):**

```text
ส่งงานแล้วครับ
Fork PR: https://github.com/nustanakritwithai/GameTurnBase/pull/61
Upstream: bot push ไม่ได้ — รอเปิด cross-repo PR เอง
```

นี่คือ **ยังไม่ส่งเข้าระบบหลัก** — fork PR เป็นแค่ที่เก็บ branch ชั่วคราว

**ตัวอย่างถูก:**

```text
สถานะ: BLOCKED — upstream PR ยังไม่มี (bot 403)

Branch พร้อมแล้ว: nustanakritwithai:cursor/mobile-combat-ui-e117
HetCreep เปิด PR:
  base  KatomnoiStudio/LegendOfSoulTH:master
  head  nustanakritwithai:cursor/mobile-combat-ui-e117

ลิงก์สร้าง PR:
  https://github.com/KatomnoiStudio/LegendOfSoulTH/compare/master...nustanakritwithai:cursor/mobile-combat-ui-e117?expand=1

npm run ci: green (223 tests) · MEMORY.md ใน branch แล้ว
```

**เมื่อ upstream PR เปิดแล้ว** ค่อยรายงาน:

```text
Upstream PR: https://github.com/KatomnoiStudio/LegendOfSoulTH/pull/XX
(Fork PR #61 — ปิด/supersede ได้หลัง merge upstream)
```

---

## 1. รู้ให้ชัด — repo ไหนทำอะไร

| Repo                                 | บทบาท                                                  | Agent ทำอะไรได้                                                                       |
| ------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| **`KatomnoiStudio/LegendOfSoulTH`**  | **ระบบหลัก (canonical)** — โค้ด, docs, deploy, release | เปิด PR ส่งงานจริง · merge ต้องผ่าน review/CI                                         |
| **`nustanakritwithai/GameTurnBase`** | **Fork สำหรับถาม/ตัดสิน design**                       | เปิด issue ถาม · Ring 0 comment แล้ว **ปิดทันที** — **ไม่ใช่** implementation backlog |
| **Local clone / cloud workspace**    | ที่ทำงานชั่วคราว                                       | พัฒนา → verify → push branch → เปิด PR ไป **upstream**                                |

**ห้ามสับสน:**

- Fork issue = **ถาม + classify + ปิด** (ไม่สะสม backlog)
- Blueprint + โค้ดจริง = อยู่ที่ **upstream** หรือ PR ที่ merge เข้า upstream
- ห้ามถือว่า fork เป็น source of truth ของ product

---

## 2. ลำดับงานมาตรฐาน (ทุก phase)

```
Ring 0 ตัดสิน (chat / issue)
    ↓
บันทึกลง Blueprint / MEMORY.md (docs PR)
    ↓
Implementation (code PR แยก)
    ↓
Verify → push → PR → merge upstream
    ↓
(ถ้า docs เริ่มบน fork) sync/cherry-pick docs ไป upstream — ห้าม force
```

### Phase A — Design / gap (fork issues)

1. ตรวจโค้ดจริงก่อนอ้าง blueprint
2. ถ้ามี conflict → เปิด issue บน **`nustanakritwithai/GameTurnBase`**
3. Ring 0 ตอบ → agent **comment สรุปผลตัดสิน → ปิด issue**
4. **ห้าม** implement ใน issue thread · **ห้าม**เปิด docs PR แยกเพื่อส่งคำตอบ issue

### Phase B — Docs / governance (upstream หรือ fork แล้ว sync)

1. อัปเดต `docs/MASTER_BLUEPRINT_v3.0.md` ตาม Ring 0 lock
2. อัปเดต `MEMORY.md` (สถานะ + identity stamp)
3. **Docs PR เท่านั้น** — ห้ามแอบ implement gameplay ใน PR เดียวกัน (`.agents/rules/master-blueprint-law.md`)
4. หลัง docs PR: **หยุดรอ review** ก่อนเริ่ม code PR ใหญ่ (ยกเว้น HetCreep สั่งต่อทันที)

### Phase C — Implementation (code PR แยก)

1. อ่าน blueprint section ที่ล็อกแล้ว + `MEMORY.md`
2. Implement **เฉพาะ contract ที่ล็อก** — ถ้าเจอตัวเลข/TBD ที่ยังไม่ lock → **หยุดส่วนนั้น** เปิด gap แทนการเดา
3. Branch แยกจาก `master` ล่าสุด
4. `npm run ci` ต้อง green ก่อน push
5. เปิด PR ไป **`KatomnoiStudio/LegendOfSoulTH` `master`** — **ไม่ใช่** PR ไป fork แล้วบอกว่าส่งงานแล้ว (ดู §0)
6. หนึ่งงานจบ = หนึ่ง PR topic (`.agents/rules/commit-granularity-law.md`)

---

## 3. Git remote และ branch

### Remote ที่ควรมี

```bash
git remote -v
# origin   → clone ที่ agent ทำงาน (มักเป็น fork หรือ upstream)
# upstream → KatomnoiStudio/LegendOfSoulTH (เพิ่มถ้ายังไม่มี)
```

ถ้า clone จาก fork ให้เพิ่ม upstream:

```bash
git remote add upstream https://github.com/KatomnoiStudio/LegendOfSoulTH.git
git fetch upstream master
```

### Branch naming (cloud agents)

```
cursor/<descriptive-kebab-name>-e117
```

- ใช้ prefix `cursor/`
- ตัวพิมพ์เล็กทั้งหมด
- suffix `-e117` บังคับสำหรับ cloud agent sessions
- หนึ่ง branch = หนึ่ง PR topic

**ตัวอย่าง:**

- `cursor/p4-enemy-ai-e117` — code
- `cursor/theme-world-direction-e117` — docs
- `cursor/docs-gap-locks-e117` — docs sync

---

## 4. ก่อน push ทุกครั้ง (บังคับ)

ทำตาม `.agents/rules/pre-push-sync-law.md` ทุกข้อ:

1. `git fetch origin` (และ `git fetch upstream` ถ้ามี)
2. เช็ค ahead/behind กับ `master` ที่จะ merge เข้า
3. ถ้า behind → `git merge origin/master` (หรือ `upstream/master`) ก่อน push
4. แก้ conflict ด้วยมือ — **รักษางานทั้งสองฝั่ง** ห้าม `--ours`/`--theirs` แบบตาบอด
5. `npm run ci` ต้อง green หลัง merge
6. **`MEMORY.md` ต้องอยู่ใน commit เดียวกับงาน** (`.agents/rules/agent-memory-law.md` §4)
7. แล้วค่อย `git push -u origin <branch>`

---

## 5. เปิด PR — กฎแยกประเภท

| ประเภท PR | เปลี่ยนอะไรได้                                         | เปลี่ยนอะไรห้าม                             |
| --------- | ------------------------------------------------------ | ------------------------------------------- |
| **Docs**  | `docs/**`, `MEMORY.md`, `.agents/rules/**`, governance | gameplay code, balance numerics ที่ยัง TBD  |
| **Code**  | `src/**`, tests, config ที่จำเป็นต่อ feature           | blueprint rewrite ยกเว้น MEMORY status line |
| **Chore** | tooling, CI, gitignore — **เฉพาะที่ขอ**                | แอบ refactor ไม่เกี่ยว                      |

### PR body ต้องมี

- Blueprint section ที่ implement / ล็อก (เช่น §3.6.8, P4)
- Acceptance criteria (checkbox)
- สิ่งที่ **intentionally deferred**
- Gap ใหม่ที่พบ (ถ้ามี)
- ผล `npm run ci` (tests count)

### ห้าม

- รวม docs cleanup + code implementation ใน PR เดียวถ้าแยก review ได้
- merge เอกสารซ้ำโดยไม่จำเป็น (supersede PR เก่าแทน)
- เปิด PR ไป fork แล้วถือว่า "ส่งเข้าระบบหลักแล้ว"

---

## 6. Bot ไม่มีสิทธิ์ push upstream (403) — ทำอย่างไร

Cloud agent มัก push ได้แค่ **fork** (`origin`) ไม่ใช่ `KatomnoiStudio/LegendOfSoulTH` (`upstream`)

### Agent ต้องทำ

1. Push branch ไป fork: `git push -u origin cursor/<topic>-e117`
2. `npm run ci` green · `MEMORY.md` อยู่ใน branch
3. **ห้าม**ประกาศ "ส่งงานแล้ว" / "พร้อม merge upstream"
4. รายงานสถานะ **`BLOCKED`** พร้อมข้อมูลครบ (template §0):
   - ชื่อ branch (`nustanakritwithai:cursor/...`)
   - ลิงก์ compare สร้าง cross-repo PR
   - สรุปเนื้องาน + test count
5. **ห้าม**เปิด fork PR แล้วถือว่าจบ — ถ้าเปิด fork PR ไปแล้ว ให้ระบุชัดว่า **"fork PR only — not canonical delivery"**

### HetCreep / มนุษย์เปิด upstream PR (cross-repo)

**วิธี GitHub UI:**

1. ไปที่ `https://github.com/KatomnoiStudio/LegendOfSoulTH`
2. Pull requests → New pull request
3. **base:** `KatomnoiStudio/LegendOfSoulTH` → `master`
4. **compare:** `nustanakritwithai:cursor/<branch>-e117`
5. เปิด PR · review · merge

**ลิงก์ compare สำเร็จรูป (แทนที่ `<branch>`):**

```
https://github.com/KatomnoiStudio/LegendOfSoulTH/compare/master...nustanakritwithai:<branch>?expand=1
```

**วิธี CLI (HetCreep เครื่องที่ auth upstream ได้):**

```bash
gh pr create \
  --repo KatomnoiStudio/LegendOfSoulTH \
  --base master \
  --head nustanakritwithai:cursor/<branch>-e117 \
  --title "feat: ..." \
  --body "..."
```

### ทางเลือก: cherry-pick เข้า upstream โดยตรง

ถ้าไม่ใช้ cross-repo PR — checkout `upstream/master`, cherry-pick commit จาก fork branch, push branch ใหม่บน upstream repo (ต้องมีสิทธิ์ write)

---

## 7. Sync docs จาก fork → upstream (canonical)

ใช้เมื่อ docs ผ่าน validation บน fork แล้ว ต้องเข้า `KatomnoiStudio/LegendOfSoulTH`

### ขั้นตอน

1. **เช็ค divergence ก่อน** — อย่า assume fork = upstream

   ```bash
   git fetch upstream master
   git fetch origin master
   git diff upstream/master origin/master -- docs/MASTER_BLUEPRINT_v3.0.md MEMORY.md
   ```

2. สร้าง branch จาก **`upstream/master`** (ไม่ใช่ fork master ถ้า diverge หนัก)

   ```bash
   git checkout upstream/master -b cursor/docs-sync-<topic>-e117
   ```

3. นำเฉพาะไฟล์ docs ที่ต้องการ (cherry-pick commit หรือ checkout path):

   ```bash
   git checkout origin/<docs-branch> -- docs/MASTER_BLUEPRINT_v3.0.md MEMORY.md
   ```

4. แก้ conflict ด้วยมือ — **ห้าม force-push** · **ห้าม overwrite** งาน upstream ที่ไม่เกี่ยว
5. Commit + push + PR ไป **upstream**
6. ถ้า bot ไม่มีสิทธิ์ push upstream (403) → รายงาน **BLOCKED** + ลิงก์ compare (§6) — **ห้าม**เขียนว่าส่งงานแล้ว

### ไฟล์ที่มักต้อง sync

- `docs/MASTER_BLUEPRINT_v3.0.md`
- `MEMORY.md`
- `.agents/rules/**` (ถ้ามีกฎใหม่)

---

## 8. ส่งงาน code เข้าระบบหลัก

### Checklist ก่อนประกาศ "เสร็จ"

- [ ] อ่าน `MEMORY.md` ตอนเริ่ม session
- [ ] Ring 0 lock ที่เกี่ยวข้องอยู่ใน Blueprint แล้ว (ไม่เดา numerics ที่ยัง TBD)
- [ ] `npm run ci` green
- [ ] `MEMORY.md` อัปเดต + identity stamp
- [ ] **Upstream PR URL** มีจริง — หรือรายงาน **BLOCKED** พร้อม compare link (§6)
- [ ] **ห้าม**เขียนว่า "ส่งงานแล้ว" ถ้ามีแค่ fork PR
- [ ] PR แยก docs/code ตามขอบเขต
- [ ] ไม่มี conflict marker ค้างในไฟล์
- [ ] Scope guard: ไม่แอบ implement phase อื่น (เช่น P4 PR ห้ามแอบ P5/P8/P9)

### Version bump

- Bump `GAME_INFO.version` / `package.json` / `CHANGELOG.md` **เมื่องานลงตัวและ HetCreep policy อนุญาต** (`MEMORY.md` — auto-bump policy)
- PR ที่ไม่ใช่ release ไม่จำเป็นต้อง bump ทุกครั้ง

---

## 9. Ring 0 vs Ring 1

|                           | Ring 0 (HetCreep)   | Ring 1 (agent อื่น)                      |
| ------------------------- | ------------------- | ---------------------------------------- |
| Live chat ของ HetCreep    | ชนะทุก written rule | —                                        |
| แก้ `.agents/rules/**`    | ได้                 | **ห้าม** weaken rule — แจ้ง disagreement |
| ตีความ blueprint          | lock ได้ผ่านคำสั่ง  | ทำตาม lock ที่มี · ไม่ reinterpret       |
| Infer numerics ที่ยัง TBD | ตัดสินได้เมื่อสั่ง  | **ห้ามเดา** — เปิด gap                   |

---

## 10. ข้อผิดพลาดที่พบบ่อย — ห้ามทำ

| ผิด                                                      | ที่ถูก                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| เปิด fork PR แล้วบอก "ส่งงานแล้ว / พร้อม merge upstream" | รายงาน **BLOCKED** + upstream compare link · หรือ upstream PR URL |
| แจ้ง Backend โดยอ้าง fork PR เป็น delivery               | อ้าง **upstream PR** เท่านั้น · fork PR = staging เท่านั้น        |
| Docs + code ใน PR เดียว                                  | แยก PR                                                            |
| Push โดยไม่ merge master ล่าสุด                          | pre-push sync ก่อนเสมอ                                            |
| ส่งโค้ดโดยไม่มี `MEMORY.md`                              | MEMORY ต้องไปกับ delivery เดียวกัน                                |
| Force-push upstream                                      | cherry-pick / merge ด้วยมือ                                       |
| ถือ fork master เป็น canonical                           | upstream `KatomnoiStudio/LegendOfSoulTH`                          |
| เดา maxLevel, gacha rate, star cost ที่ยัง OPEN          | หยุด · บันทึก gap · รอ Ring 0                                     |

---

## 11. อ้างอิงกฎที่เกี่ยวข้อง

| หัวข้อ              | ไฟล์                                      |
| ------------------- | ----------------------------------------- |
| Memory protocol     | `.agents/rules/agent-memory-law.md`       |
| Pre-push sync       | `.agents/rules/pre-push-sync-law.md`      |
| Blueprint authority | `.agents/rules/master-blueprint-law.md`   |
| Commit granularity  | `.agents/rules/commit-granularity-law.md` |
| Ring 0 authority    | `.agents/rules/ring0-authority.md`        |
| Product north star  | `docs/MASTER_BLUEPRINT_v3.0.md` §12       |
| สถานะปัจจุบัน       | `MEMORY.md`                               |

---

_Operator: HetCreep · Agent: Cursor Agent (cloud) · 2026-08-07_
