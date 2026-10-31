#!/usr/bin/env bash
# Local Paper 1.21.4 server for Maple. Offline mode, no paid Minecraft account.
# Running this script writes eula=true. Read https://aka.ms/MinecraftEULA first.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="$ROOT/.local-server"
JAR="$SERVER_DIR/paper-1.21.4-232.jar"
URL="https://fill-data.papermc.io/v1/objects/5ee4f542f628a14c644410b08c94ea42e772ef4d29fe92973636b6813d4eaffc/paper-1.21.4-232.jar"
SHA256="5ee4f542f628a14c644410b08c94ea42e772ef4d29fe92973636b6813d4eaffc"
PORT="25565"

if [[ -f "$ROOT/.env" ]]; then
  parsed="$(grep -E '^MC_PORT=' "$ROOT/.env" | tail -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  if [[ -n "${parsed}" ]]; then
    PORT="$parsed"
  fi
fi

mkdir -p "$SERVER_DIR"

if [[ ! -f "$JAR" ]]; then
  echo "[server] Downloading Paper 1.21.4 build 232..."
  curl -fL --retry 3 -A "minecraft-english-companion/0.1" -o "$JAR.partial" "$URL"
  mv "$JAR.partial" "$JAR"
fi

if command -v sha256sum >/dev/null 2>&1; then
  echo "${SHA256}  ${JAR}" | sha256sum -c -
fi

printf 'eula=true\n' > "$SERVER_DIR/eula.txt"

PROPS="$SERVER_DIR/server.properties"
if [[ ! -f "$PROPS" ]]; then
  cat > "$PROPS" <<EOF
motd=Maple English Companion
server-port=${PORT}
online-mode=false
enforce-secure-profile=false
prevent-proxy-connections=false
white-list=false
spawn-protection=0
difficulty=peaceful
gamemode=survival
force-gamemode=false
pvp=false
spawn-monsters=false
view-distance=6
simulation-distance=4
max-players=10
enable-command-block=false
level-name=world
level-type=minecraft\:normal
EOF
else
  set_prop() {
    local key="$1"
    local value="$2"
    if grep -q "^${key}=" "$PROPS"; then
      sed -i "" "s|^${key}=.*|${key}=${value}|" "$PROPS"
    else
      echo "${key}=${value}" >> "$PROPS"
    fi
  }
  set_prop server-port "$PORT"
  set_prop online-mode false
  set_prop enforce-secure-profile false
  set_prop prevent-proxy-connections false
  set_prop white-list false
  set_prop spawn-protection 0
fi

echo "[server] Paper 1.21.4 on port ${PORT} (online-mode=false). Ctrl+C to stop."
cd "$SERVER_DIR"
exec java -Xms512M -Xmx1024M -jar "$JAR" --nogui
