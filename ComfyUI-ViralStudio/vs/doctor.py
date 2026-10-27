"""Diagnóstico de solo lectura (Guía Maestra V2 §4, F0/F1): qué hay realmente
instalado y conectado. No instala nada. Escribe environment_report.json."""
import json
import os
import platform
import shutil
import subprocess
import sys
import time

from . import comfy_api
from .config import data_dir, hyperframes_cmd, settings, tools_dir, tts_python

REQUIRED_NODES = {
    "guion (LLM)": ["CLIPLoader", "TextGenerate", "PreviewAny"],
    "música (ACE-Step 1.5)": ["CheckpointLoaderSimple", "TextEncodeAceStepAudio1.5", "EmptyAceStep1.5LatentAudio",
                              "ConditioningZeroOut", "ModelSamplingAuraFlow", "KSampler", "VAEDecodeAudio", "SaveAudio"],
}


def _cmd(args, timeout=30):
    exe = shutil.which(args[0]) if not os.path.isabs(args[0]) else args[0]
    if not exe:
        return {"ok": False, "detail": "no encontrado"}
    try:
        r = subprocess.run([exe, *args[1:]], capture_output=True, text=True, timeout=timeout)
        return {"ok": r.returncode == 0, "detail": (r.stdout or r.stderr).strip()[:400]}
    except Exception as e:
        return {"ok": False, "detail": str(e)[:300]}


def audio_mode_checks():
    """Modo «Mi audio → video»: qué es CRÍTICO (sin ello no hay video) y qué es
    OPCIONAL (mejora, con alternativa clara). No instala ni descarga nada."""
    py = tts_python()
    code = ("import importlib.util as u, json; print(json.dumps({m: bool(u.find_spec(m)) for m in "
            "['faster_whisper','ctranslate2','soundfile','whisperx','pyannote.audio' if u.find_spec('pyannote') else 'pyannote']}))")
    t = _cmd([py, "-c", code], timeout=60)
    mods = {}
    try:
        mods = json.loads(t["detail"].splitlines()[-1])
    except Exception:
        pass
    dev = _cmd([py, "-c", "import ctranslate2; print(ctranslate2.get_cuda_device_count())"], timeout=60)
    gpus = dev["detail"].strip() if dev["ok"] else "0"
    s = settings()
    rows = [
        {"name": "ffmpeg/ffprobe", "critical": True, "ok": bool(shutil.which("ffmpeg") and shutil.which("ffprobe")),
         "detail": "validación, decodificación, mezcla y muxing", "fix": "apt-get install ffmpeg"},
        {"name": "HyperFrames + Chrome", "critical": True, "ok": _cmd(hyperframes_cmd() + ["--version"], timeout=120)["ok"],
         "detail": " ".join(hyperframes_cmd()), "fix": "npm install hyperframes (versión fijada en vs/config.py)"},
        {"name": "faster-whisper (ASR)", "critical": True, "ok": bool(mods.get("faster_whisper")),
         "detail": f"python {py} · modelo {s.get('asr_model') or s.get('whisper_model')} · GPU CUDA: {gpus}",
         "fix": f"{py} -m pip install faster-whisper soundfile   (sin ASR: pega la transcripción a mano)"},
        {"name": "GPU para ASR", "critical": False, "ok": gpus not in ("", "0"),
         "detail": "sin GPU se usa CPU (int8) y el modelo 'small' (más lento, algo menos preciso)", "fix": "activa una GPU en Colab"},
        {"name": "WhisperX (alineación fina)", "critical": False, "ok": bool(mods.get("whisperx")),
         "detail": "opcional: refina tiempos por palabra; sin él se usan los de faster-whisper", "fix": f"{py} -m pip install whisperx"},
        {"name": "pyannote (diarización)", "critical": False, "ok": bool(mods.get("pyannote.audio") or mods.get("pyannote")),
         "detail": "opcional: varios hablantes (requiere HF_TOKEN y aceptar las condiciones de pyannote/speaker-diarization-community-1)",
         "fix": f"{py} -m pip install pyannote.audio"},
        {"name": "LLM (storyboard con IA)", "critical": False, "ok": comfy_api.alive(),
         "detail": "opcional: sin LLM el storyboard lo hace el planificador por reglas (determinista)", "fix": "arranca ComfyUI con el LLM"},
    ]
    return rows


def report(write=True):
    s = settings()
    rep = {"generated": time.strftime("%Y-%m-%d %H:%M:%S"), "python": sys.version.split()[0], "platform": platform.platform()}
    rep["gpu"] = _cmd(["nvidia-smi", "--query-gpu=name,memory.total,memory.used,driver_version", "--format=csv,noheader"])
    du = shutil.disk_usage(data_dir())
    rep["disk_free_gb"] = round(du.free / 1e9, 1)
    rep["ffmpeg"] = _cmd(["ffmpeg", "-version"])
    rep["ffprobe"] = _cmd(["ffprobe", "-version"])
    rep["node"] = _cmd(["node", "--version"])
    hf = hyperframes_cmd()
    rep["hyperframes"] = _cmd(hf + ["--version"], timeout=120)
    rep["hyperframes"]["command"] = " ".join(hf)
    # ComfyUI y nodos necesarios
    c = {"url": os.environ.get("VS_COMFY_URL", "http://127.0.0.1:8188"), "reachable": comfy_api.alive()}
    if c["reachable"]:
        try:
            info = comfy_api.object_info()
            c["node_classes"] = len(info)
            c["required"] = {k: [n for n in v if n not in info] or "OK" for k, v in REQUIRED_NODES.items()}
        except Exception as e:
            c["error"] = str(e)[:300]
        c["models"] = {"llm": {"configured": s["llm_model"], "installed": s["llm_model"] in comfy_api.list_models("text_encoders"),
                               "fallback_installed": s["llm_fallback"] in comfy_api.list_models("text_encoders")},
                       "music": {"configured": s["music_model"], "installed": s["music_model"] in comfy_api.list_models("checkpoints")}}
    else:
        c["status"] = "OPTIONAL_UNAVAILABLE (sin ComfyUI solo funciona el modo 'mi propio guion' y la música queda desactivada)"
    rep["comfyui"] = c
    # entorno de voz aislado
    py = tts_python()
    code = ("import importlib.util as u, json; print(json.dumps({m: bool(u.find_spec(m)) for m in "
            "['qwen_tts','faster_whisper','kokoro_onnx','soundfile','torch']}))")
    t = _cmd([py, "-c", code], timeout=60)
    try:
        t["modules"] = json.loads(t["detail"].splitlines()[-1])
    except Exception:
        pass
    t["python"] = py
    kd = os.environ.get("VS_KOKORO_DIR") or os.path.join(tools_dir(), "kokoro")
    t["kokoro_model"] = os.path.exists(os.path.join(kd, "kokoro.onnx"))
    rep["tts"] = t
    rep["audio_mode"] = audio_mode_checks()
    rep["note"] = "Disponible ≠ probado de punta a punta: usa 'Crear video' con 15 s para la prueba real."
    if write:
        with open(os.path.join(data_dir(), "environment_report.json"), "w", encoding="utf-8") as f:
            json.dump(rep, f, ensure_ascii=False, indent=1)
    return rep


if __name__ == "__main__":
    print(json.dumps(report(), ensure_ascii=False, indent=1))
