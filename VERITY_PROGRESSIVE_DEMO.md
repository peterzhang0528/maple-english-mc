# Verity progressive demo (Paper / browser)

Short guide for the restored **v2.5** pack. Full pack notes: `datapacks/verity_progressive/README.md`. Install dump: top-level `RUN.txt` inside `/workspace/verity-progressive-datapack.tar.gz`.

## Chain

你的脸 → 可爱 Verity → 恐怖脸 → friend（占位）→ friend-2（占位）

Say lines: `Look! This is my face.` / `Cute Verity! Say hi!` / `Oh no… scary face!` / `A friend is here!` / `Another friend! We did it!`

## Paper (when Windows available)

1. Unpack `verity-progressive-datapack.tar.gz`
2. Copy `verity_progressive/` → world `datapacks/`
3. `/reload` (op)
4. `/function verity:progressive/start`
5. Click green **`[我说了!]`** after each Say（needs op for clickEvent `/function`）
6. `/function verity:progressive/oral_summary` — ✓/○ all five
7. `/function verity:progressive/wecom_plain` — plain text matching browser「复制企微进度」
8. `/function verity:progressive/stamp_demo` — **演示一键打满**（Cecilia/Peter demos only; not kid play; does not rename friends）
9. `/function verity:progressive/cleanup`

Scoreboard: objective `verity_stamp`; fake players `verity_o1`…`verity_o5`.

## Browser

- Storyboard mid-chain: `web/public/verity/index.html`（file:// OK；`verityOralStamps`；家长面板 N≥1；PNG；复制企微）
- WeCom single-file: `/workspace/cecilia-meeting/share-for-cecilia.html`
- Paper command card: `/workspace/cecilia-meeting/paper-demo-card.html`
- `face-tryon.html` still missing — see `web/public/verity/README.md`

## Names / blockers

- Do **not** use Lavity / Vocity as official names until Cecilia confirms. Placeholders: `friend` / `friend-2`.
- Linux build box has **no Java** — structural validation only; no Paper live test claimed.
- NetEase / MC Studio still blocked (no Windows).

## Texture values

See `datapacks/verity_progressive/texture_values.json` (MineSkin signed values for cute + horror heads).
