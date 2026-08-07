# Contributing

โปรเจกต์นี้เปิดรับ PR แต่ maintain แบบ solo-maintained (best-effort) — ดู [`SECURITY.md`](SECURITY.md)

## เริ่มต้น

```bash
npm install
npm run dev       # http://localhost:5173
npm run ci        # typecheck + lint + test + build — รันให้ผ่านก่อนส่ง PR เสมอ
```

รายละเอียดคำสั่ง/โครงสร้างโปรเจกต์ทั้งหมด → [`README.md`](README.md)

## ก่อนส่ง PR

1. `npm run ci` ต้องผ่านทั้งหมด (typecheck/lint/test/build) — CI จะรันซ้ำอีกทีอยู่แล้ว แต่เช็คก่อนส่งเร็วกว่า
2. ทำตาม [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md)
3. commit message อธิบาย "ทำไม" ไม่ใช่แค่ "อะไร" — ดูสไตล์จาก `git log` ที่ผ่านมา

## รายงานบั๊ก / เสนอฟีเจอร์

ใช้ GitHub Issues — มี template ให้เลือก ([bug report](.github/ISSUE_TEMPLATE/bug_report.yml) /
[feature request](.github/ISSUE_TEMPLATE/feature_request.yml))

รายงานช่องโหว่ความปลอดภัย **ห้าม**เปิด public issue — ดูขั้นตอนที่ [`SECURITY.md`](SECURITY.md)

## Release process

`.github/workflows/deploy.yml` ผูก release เข้ากับเลขเวอร์ชันใน `src/game/gameInfo.ts`
(`GAME_INFO.version`) โดยตรง ไม่ใช่ตาม push:

1. เขียน entry ใหม่ใน [`CHANGELOG.md`](CHANGELOG.md) หัวข้อ `## [x.y.z]`
2. ขึ้นเลขที่ `GAME_INFO.version` ให้ตรงกับหัวข้อนั้น — `src/game/gameInfo.test.ts` เช็คว่า
   ค่านี้ตรงกับ `package.json` เสมอ ลืมข้างใดข้างหนึ่งจะ fail ตั้งแต่ `npm run ci`
3. push เข้า `master` — workflow เทียบเวอร์ชันก่อน/หลัง push นั้นเอง ถ้าไม่เปลี่ยนจะข้าม deploy
   ทั้งชุด (ปลอดภัยสำหรับ push ปกติที่ไม่ตั้งใจ release), ถ้าเปลี่ยนจะ build → test → deploy
   ขึ้น GitHub Pages → ตัด GitHub Release ให้อัตโนมัติ (แนบ SBOM, ดึง release note จากหัวข้อ
   CHANGELOG ที่ตรงกัน)
4. ยืนยันที่ [Releases](https://github.com/KatomnoiStudio/LegendOfSoulTH/releases) ว่าขึ้นจริง

รัน workflow มือได้ผ่าน "Run workflow" บนแท็บ Actions เสมอ (ไม่สนว่าเวอร์ชันเปลี่ยนไหม)
ใช้ตอนต้องการ deploy ซ้ำโดยไม่ผูกกับ commit ใหม่

## ถ้าใช้ AI agent ช่วยเขียนโค้ด

โปรเจกต์นี้มีกฎบังคับสำหรับ AI agent ที่ทำงานในนี้ (memory protocol, coding standard,
ring-authority policy) — อ่าน [`AGENTS.md`](AGENTS.md) และ [`MEMORY.md`](MEMORY.md) ก่อนเริ่ม

**ส่งงานเข้าระบบหลัก (upstream):** อ่าน
[`.agents/rules/upstream-submission-workflow.md`](.agents/rules/upstream-submission-workflow.md)
— กำหนด repo หลัก vs fork, แยก docs/code PR, pre-push sync, และวิธี cherry-pick docs ไป
`KatomnoiStudio/LegendOfSoulTH` โดยไม่ force

ถ้า agent ของคุณไม่รองรับการอ่านไฟล์เหล่านี้อัตโนมัติ ให้สั่งตรง ๆ ให้อ่านก่อนแก้โค้ดใด ๆ

## Code of Conduct

โปรเจกต์นี้ยึด [Contributor Covenant](CODE_OF_CONDUCT.md)
