#!/usr/bin/env bash
# Arranque local del Studio (sin ComfyUI) con el modo «Mi audio → video».
#   ./run_local.sh            → http://127.0.0.1:8765/viralstudio/
# Variables opcionales: VS_DATA (proyectos), VS_TOOLS (node_modules con hyperframes), PORT.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
VENV="${VENV:-$HERE/.venv}"
export VS_TOOLS="${VS_TOOLS:-$HERE/../.viralstudio_tools}"
export VS_DATA="${VS_DATA:-$HOME/viralstudio}"
if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q -r "$HERE/requirements-audio.txt"
fi
if [ ! -x "$VS_TOOLS/node_modules/.bin/hyperframes" ]; then
  mkdir -p "$VS_TOOLS"
  [ -f "$VS_TOOLS/package.json" ] || echo '{"name": "viralstudio-tools", "private": true}' > "$VS_TOOLS/package.json"
  (cd "$VS_TOOLS" && npm install --silent hyperframes@0.8.193)
fi
export VS_TTS_PYTHON="${VS_TTS_PYTHON:-$VENV/bin/python}"
export VS_HF_BIN="${VS_HF_BIN:-$VS_TOOLS/node_modules/.bin/hyperframes}"
command -v ffmpeg >/dev/null || { echo "Falta ffmpeg (apt install ffmpeg / brew install ffmpeg)"; exit 1; }
exec "$VENV/bin/python" "$HERE/standalone.py" --port "${PORT:-8765}"
