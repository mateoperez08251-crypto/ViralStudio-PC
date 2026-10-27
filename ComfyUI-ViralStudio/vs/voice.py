"""Narración: lanza el worker de voz (Qwen3-TTS o Kokoro) en su entorno aislado."""
import json
import os
import subprocess
import tempfile

from . import comfy_api
from .config import LANGUAGES, PKG_DIR, data_dir, presets, settings, tools_dir, tts_python, worker_env
from .textutil import tts_clean

WORKER = os.path.join(PKG_DIR, "tts_worker", "worker.py")


def kokoro_dir():
    d = os.environ.get("VS_KOKORO_DIR") or os.path.join(tools_dir(), "kokoro")
    return d if os.path.exists(os.path.join(d, "kokoro.onnx")) else None


def synthesize(items, cfg, out_dir, progress=None, log=print, cancel=None, engine=None):
    """items: [{id, text}] → {id: {file, dur, words}}"""
    s = settings()
    P = presets()
    lang = cfg.get("language", "es")
    L = LANGUAGES.get(lang, LANGUAGES["es"])
    voice = dict(P["voices"].get(cfg.get("voice") or "narrador_epico") or {})
    eng = engine or cfg.get("tts_engine") or s.get("tts_engine", "qwen3")
    if cfg.get("voice_design"):
        voice["design"] = cfg["voice_design"]
    job = {
        "engine": eng,
        "language": L["tts"],
        "lang_code": L["whisper"],
        "voice": {
            "design": voice.get("design", ""),
            "kokoro": cfg.get("kokoro_voice") or voice.get("kokoro", "em_alex"),
            "speed": float(cfg.get("voice_speed") or 1.0),
            "ref_audio": cfg.get("clone_audio") or None,
            "ref_text": cfg.get("clone_text") or None,
            "cache_dir": os.path.join(data_dir(), "voices"),
        },
        "models": {"design": s["tts_design_model"], "base": s["tts_base_model"], "kokoro_dir": kokoro_dir(), "whisper": s["whisper_model"]},
        "align": True,
        "items": [{"id": it["id"], "text": tts_clean(it["text"]), "out": os.path.join(out_dir, f"{it['id']}.wav")} for it in items if it["text"].strip()],
    }
    os.makedirs(out_dir, exist_ok=True)
    fd, jp = tempfile.mkstemp(suffix=".json", dir=out_dir)
    os.close(fd)
    job["result"] = jp.replace(".json", ".result.json")
    with open(jp, "w", encoding="utf-8") as f:
        json.dump(job, f, ensure_ascii=False)
    if eng == "qwen3":
        comfy_api.free(True)  # deja la VRAM libre para la voz
    env = worker_env(tts_python())
    p = subprocess.Popen([tts_python(), WORKER, jp], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, env=env)
    tail = []
    for line in p.stdout:
        line = line.rstrip()
        tail = (tail + [line])[-30:]
        if line.startswith("PROGRESS"):
            parts = line.split(" ", 3)
            try:
                i, n = int(parts[1]), max(1, int(parts[2]))
                if progress:
                    progress(i / n, parts[3] if len(parts) > 3 else "")
            except Exception:
                pass
        elif line.startswith("LOG"):
            log("[voz] " + line[4:])
        if cancel and cancel():
            p.kill()
            raise RuntimeError("Cancelado")
    p.wait()
    if p.returncode != 0 or not os.path.exists(job["result"]):
        raise RuntimeError("La voz falló:\n" + "\n".join(tail[-15:]))
    with open(job["result"], "r", encoding="utf-8") as f:
        res = json.load(f)
    log(f"[voz] motor {res.get('engine')} · {len(res['items'])} clips en {res.get('seconds')}s")
    try:
        os.remove(jp)
    except Exception:
        pass
    return {r["id"]: r for r in res["items"]}
