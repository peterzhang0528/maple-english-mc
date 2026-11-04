# Verity progressive datapack (v2.5 stamp_demo + restored paths)

Paper / Vanilla datapack for the **你的脸 → 可爱 → 恐脸 → friend → friend-2** demo chain.

## What's new in v2.5 (2026-11-03)

- **Restored** into `maple-english-mc/datapacks/verity_progressive/` (was lost as untracked on ~Nov 2).
- **`/function verity:progressive/stamp_demo`:** 演示一键打满 — sets `verity_o1`…`verity_o5` to 1, then `_recount` + `oral_summary`, plus a gray note that this is for Cecilia/Peter demos (not kid play). Does **not** rename friends.
- Browser storyboard restored at `web/public/verity/index.html` (mid-chain from `share-for-cecilia.html`).

## What's new in v2.4 (2026-11-01)

- **`oral_summary` ✓/○ parity:** always lists all five milestones with ✓ or ○ (same as browser parent card / 企微进度).
- **`/function verity:progressive/wecom_plain`:** dumps plain-text lines matching browser「复制企微进度」schema（N/5、✓ 先、部分时 ○、朋友占位句）. In-game chat is for screenshot / copy into WeCom (MC has no clipboard).
- `oral_summary` (when N≥1) adds clickable **`[复制企微纯文本]`** → `wecom_plain`.

## What's new in v2.3 (2026-10-31)

- **口语打卡 parity with browser:** after each milestone `Say:` line, a green clickable **`[我说了!]`** tellraw runs `verity:progressive/stamp_N`.
- Scoreboard objective **`verity_stamp`** (dummy); fake players **`verity_o1`…`verity_o5`** hold 0/1 stamps (created on load).
- `/function verity:progressive/oral_summary` — parent-facing summary（孩子跟读了 N 句英语 · 里程碑不是成绩；N=0 提示还没打卡）.
- Stamp clicks lightly call `oral_summary` when N≥1（链中家长反馈）.
- `cleanup` also resets stamp scores.
- **Note:** tellraw `clickEvent` → `/function …` needs op / elevated permission in creative demos — OK for local Paper; document to players.

## What's new in v2.2 (2026-10-28)

- Each milestone tellraw adds a short **English oral invite** (`Say: …`) for Maple-style companion scaffolding — listen → say one line, no grade.
- Phrases: `Look! This is my face.` / `Cute Verity! Say hi!` / `Oh no… scary face!` / `A friend is here!` / `Another friend! We did it!`
- Browser storyboard mirrors the same lines + parent glimpse (`web/public/verity/index.html`).

## What's new in v2.1 (2026-10-26)

- Tellraw uses **里程碑 N/5** (你的脸 / 可爱 / 恐怖 / friend / friend-2) — visible milestone feedback, not grades.
- Step 1 armor stand now also wears the cute MineSkin head; CustomName stays 「你的脸」 so all five stands have visible heads (label distinguishes).

## What's in v2

Armor stands for cute / horror / friend / friend-2 wear **MineSkin Verity player heads**, so the chain is visible in-world **without SkinsRestorer**. Player body skin swap is still optional via `scripts/verity-progressive-demo.sh`.

## Install

1. Copy this folder into your world's `datapacks/` (or symlink).
2. `/reload` (op).
3. `/function verity:progressive/start`
4. After each Say line, click green **`[我说了!]`** (op needed for `/function` click).
5. Parent summary anytime: `/function verity:progressive/oral_summary`
6. WeCom-plain dump: `/function verity:progressive/wecom_plain`（或摘要里点紫字）
7. Demo one-click fill (Cecilia/Peter only): `/function verity:progressive/stamp_demo`
8. Cleanup: `/function verity:progressive/cleanup`

## Names

Do **not** rename stands to Lavity / Vocity until Cecilia confirms. Those remain `[unclear]`. Placeholders stay `friend` / `friend-2`.

## pack_format

`pack_format: 61` targets ~1.21.4. Adjust if your Paper version differs.

## Texture sources

See `texture_values.json` (MineSkin signed values matching yellow cute + maple horror URLs in `VERITY_PROGRESSIVE_DEMO.md`).

## Live test note

This Linux box has **no Java** — datapack files validated structurally only; **not** live-tested on Paper here. Run on Peter's Windows/Paper when available.
