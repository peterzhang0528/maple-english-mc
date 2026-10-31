#!/usr/bin/env bash
# Start Maple (voice mic on 47822) + Spark (chat/movement only) against the local Paper server.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p .local-logs

# Stop prior companion processes for this project (not the Paper server).
pkill -f "/Users/zhangchen/maple-english-mc/node_modules/.bin/tsx src/index.ts" 2>/dev/null || true
pkill -f "maple-english-mc/node_modules/tsx/dist/preflight" 2>/dev/null || true
# Broader match for tsx index in this repo
for pid in $(pgrep -f "tsx src/index.ts" 2>/dev/null || true); do
  cwd=$(lsof -a -p "$pid" -d cwd 2>/dev/null | awk 'NR==2 {print $NF}')
  if [[ "${cwd:-}" == "$ROOT" ]]; then
    kill "$pid" 2>/dev/null || true
  fi
done
sleep 1

export OPENAI_TYPED="${OPENAI_TYPED:-1}"
# Keep Doubao mic until companion.js supports gpt-live WebRTC
export OPENAI_LIVE="${OPENAI_LIVE:-0}"

echo "[duo] starting Maple (persona=maple, voice on)..."
nohup env COMPANION_PERSONA=maple MC_USERNAME=Maple VOICE_COMPANION=1 OPENAI_TYPED="${OPENAI_TYPED}" OPENAI_LIVE="${OPENAI_LIVE}"   npm start > .local-logs/maple-duo.log 2>&1 &
MAPLE_PID=$!
echo "[duo] Maple pid=$MAPLE_PID log=.local-logs/maple-duo.log"

sleep 3

echo "[duo] starting Spark (persona=spark, voice off)..."
nohup env COMPANION_PERSONA=spark MC_USERNAME=Spark VOICE_COMPANION=0 OPENAI_TYPED="${OPENAI_TYPED}" OPENAI_LIVE="${OPENAI_LIVE}"   npm run start:spark > .local-logs/spark-duo.log 2>&1 &
SPARK_PID=$!
echo "[duo] Spark pid=$SPARK_PID log=.local-logs/spark-duo.log"

sleep 4
echo "[duo] health:"
curl -sS "http://127.0.0.1:47822/api/health" || echo "(mic health not ready yet)"
echo
echo "[duo] tail Maple:"
tail -n 15 .local-logs/maple-duo.log || true
echo "[duo] tail Spark:"
tail -n 15 .local-logs/spark-duo.log || true
echo "[duo] mic: http://127.0.0.1:47822"
echo "[duo] Paper left running. Stop bots: kill $MAPLE_PID $SPARK_PID"
