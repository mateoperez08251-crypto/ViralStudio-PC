# Flujos de ejemplo (formato API)

`viralstudio_historia_a_video.api.json` — dentro del grafo de ComfyUI:
LLM nativo (CLIPLoader + Qwen3.8) → **VS · Escribir historia** → música ACE-Step 1.5 → **VS · Crear video (HyperFrames)** → MP4.

Cárgalo en ComfyUI con *Workflow → Open* (ComfyUI acepta el formato API) o envíalo a `POST /prompt`.
Todos los `class_type` son nodos nativos de ComfyUI o los 3 nodos de este paquete; el Studio (`/viralstudio/`)
hace lo mismo con un clic y además permite editar escena por escena.
