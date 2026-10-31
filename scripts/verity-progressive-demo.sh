#!/usr/bin/env bash
# Verity progressive demo (v0): cute face → horror face → spawn "friend" near Maple.
# Prefer live RCON (no Paper restart; do not touch bore tunnel).
#
# Prerequisites (Peter's machine, typical):
#   - Paper 1.21.4 running with RCON on 127.0.0.1:25575, password maplelocal
#   - SkinsRestorer installed (jar already staged under maple-verity-skin/)
#   - Maple bot (or player) online as MC_USERNAME (default Maple)
#
# Usage:
#   cd /Users/zhangchen/maple-english-mc   # or this repo root
#   bash scripts/verity-progressive-demo.sh
#   bash scripts/verity-progressive-demo.sh --dry-run   # print commands only
#   TARGET=Maple STEP_SLEEP=2 bash scripts/verity-progressive-demo.sh
#
# Manual fallback (paste into server console or any RCON client):
#   skin set Maple https://textures.minecraft.net/texture/4d48419d3273a5d7c663bff36959102e61ef32efdfec6203cd53f5e1bd81d041
#   skin set Maple https://textures.minecraft.net/texture/32e6677844331c82aca7de1d9fddbdf2f98d1b0c3a7abc89f3de668ed3e845b5
#   execute at Maple run summon armor_stand ~2 ~ ~ {CustomName:'{"text":"friend","color":"yellow"}',CustomNameVisible:1b,NoGravity:1b,ShowArms:1b,Tags:["verity_friend"]}
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RCON_HOST="${RCON_HOST:-127.0.0.1}"
RCON_PORT="${RCON_PORT:-25575}"
RCON_PASSWORD="${RCON_PASSWORD:-maplelocal}"
TARGET="${TARGET:-Maple}"
FRIEND_LABEL="${FRIEND_LABEL:-friend}"
STEP_SLEEP="${STEP_SLEEP:-3}"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

# MineSkin-hosted textures already verified in maple-verity-skin/ (prefer URL apply over local file for SR).
# Cute = yellow smiley cube; Horror = lanky maple Verity (MineSkin). Local PNGs:
#   assets/verity-skins/verity-cute.png  (from MundoSkin yellow)
#   assets/verity-skins/verity-horror.png (from verity-malvado.png) — upload later if SR needs URL.
CUTE_URL="${CUTE_URL:-https://textures.minecraft.net/texture/4d48419d3273a5d7c663bff36959102e61ef32efdfec6203cd53f5e1bd81d041}"
HORROR_URL="${HORROR_URL:-https://textures.minecraft.net/texture/32e6677844331c82aca7de1d9fddbdf2f98d1b0c3a7abc89f3de668ed3e845b5}"

rcon_send() {
  local cmd="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] $cmd"
    return 0
  fi
  python3 - "$RCON_HOST" "$RCON_PORT" "$RCON_PASSWORD" "$cmd" <<'PY'
import socket, struct, sys

host, port, password, command = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]

def pkt(req_id: int, req_type: int, body: str) -> bytes:
    payload = struct.pack("<ii", req_id, req_type) + body.encode("utf-8") + b"\x00\x00"
    return struct.pack("<i", len(payload)) + payload

def read_pkt(sock: socket.socket):
    hdr = sock.recv(4)
    if len(hdr) < 4:
        raise RuntimeError("RCON: short length header (is the server up? RCON enabled?)")
    (length,) = struct.unpack("<i", hdr)
    data = b""
    while len(data) < length:
        chunk = sock.recv(length - len(data))
        if not chunk:
            raise RuntimeError("RCON: connection closed")
        data += chunk
    req_id, req_type = struct.unpack("<ii", data[:8])
    body = data[8:-2].decode("utf-8", errors="replace")
    return req_id, req_type, body

with socket.create_connection((host, port), timeout=5) as sock:
    sock.sendall(pkt(1, 3, password))  # SERVERDATA_AUTH
    _id, typ, _ = read_pkt(sock)
    # Some servers send an empty RESPONSE_VALUE before AUTH_RESPONSE
    if typ == 0:
        _id, typ, _ = read_pkt(sock)
    if _id == -1:
        raise SystemExit("RCON auth failed (check password / enable-rcon)")
    sock.sendall(pkt(2, 2, command))  # SERVERDATA_EXECCOMMAND
    _id, typ, body = read_pkt(sock)
    if body.strip():
        print(body.rstrip())
PY
}

step() {
  local title="$1"
  local cmd="$2"
  echo ""
  echo "==> $title"
  echo "    $cmd"
  rcon_send "$cmd"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    sleep "$STEP_SLEEP"
  fi
}

echo "Verity progressive demo"
echo "  root=$ROOT"
echo "  rcon=${RCON_HOST}:${RCON_PORT}  target=${TARGET}  dry_run=${DRY_RUN}"
echo "  (SkinsRestorer: if 'skin set' fails, try 'skin url ${TARGET} <url>' or install SkinsRestorer.jar)"

# (a) cute / face skin on Maple
step "(a) apply cute yellow Verity skin on ${TARGET}" \
  "skin set ${TARGET} ${CUTE_URL}"

# announce
step "(a2) title cue" \
  "title ${TARGET} title {\"text\":\"Verity: cute face\",\"color\":\"yellow\"}"

# (b) switch to horror
step "(b) switch to horror / lanky Verity" \
  "skin set ${TARGET} ${HORROR_URL}"

step "(b2) title cue" \
  "title ${TARGET} title {\"text\":\"Verity: horror\",\"color\":\"red\"}"

# (c) spawn second entity labeled friend near Maple (armor stand v0 — no NPC plugin)
# Clean previous demo stands first.
step "(c0) clear previous verity_friend stands" \
  "kill @e[type=armor_stand,tag=verity_friend]"

step "(c) summon friend armor stand near ${TARGET}" \
  "execute at ${TARGET} run summon armor_stand ~2 ~ ~ {CustomName:'{\"text\":\"${FRIEND_LABEL}\",\"color\":\"yellow\"}',CustomNameVisible:1b,NoGravity:1b,ShowArms:1b,Invisible:0b,Tags:[\"verity_friend\"]}"

step "(c2) optional: second bot plan (documented only)" \
  "say [verity-demo] v0 friend = armor_stand. Next: offline second bot username Friend / Vocity near Maple."

echo ""
echo "Done. If skins did not change: confirm SkinsRestorer is loaded (/plugins) and ${TARGET} is online."
echo "Local PNG refs (for later URL host or SR file apply):"
echo "  ${ROOT}/assets/verity-skins/verity-cute.png"
echo "  ${ROOT}/assets/verity-skins/verity-horror.png"
