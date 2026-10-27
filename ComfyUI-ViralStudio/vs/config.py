"""Rutas, ajustes persistentes y presets de Viral Studio.

Todo es configurable con variables de entorno (el instalador de Colab las fija)
o desde la pestaña Ajustes del Studio (se guarda en settings.json).
"""
import glob
import json
import os
import shutil
import sys
import threading

PKG_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VS_DIR = os.path.join(PKG_DIR, "vs")
ENGINE_DIR = os.path.join(PKG_DIR, "engine")
STUDIO_DIR = os.path.join(PKG_DIR, "studio")
PRESETS_DIR = os.path.join(VS_DIR, "presets")
HYPERFRAMES_VERSION = os.environ.get("VS_HYPERFRAMES_VERSION", "0.8.193")


def _comfy_output():
    try:
        import folder_paths  # disponible dentro de ComfyUI

        return folder_paths.get_output_directory()
    except Exception:
        return None


def data_dir():
    d = os.environ.get("VS_DATA")
    if not d:
        out = _comfy_output()
        d = os.path.join(out, "viralstudio") if out else os.path.expanduser("~/viralstudio")
    os.makedirs(d, exist_ok=True)
    return d


def projects_dir():
    d = os.path.join(data_dir(), "projects")
    os.makedirs(d, exist_ok=True)
    return d


def tools_dir():
    d = os.environ.get("VS_TOOLS") or os.path.join(os.path.dirname(PKG_DIR), ".viralstudio_tools")
    os.makedirs(d, exist_ok=True)
    return d


def hyperframes_cmd():
    """Comando para ejecutar la CLI de HyperFrames (versión fijada)."""
    env = os.environ.get("VS_HF_BIN")
    if env:
        return env.split()
    local = os.path.join(tools_dir(), "node_modules", ".bin", "hyperframes")
    if os.path.exists(local):
        return [local]
    return ["npx", "--yes", f"hyperframes@{HYPERFRAMES_VERSION}"]


def sfx_dir():
    """Efectos de sonido (librería de HyperFrames, licencia Pixabay) + generados."""
    d = os.path.join(data_dir(), "sfx")
    os.makedirs(d, exist_ok=True)
    if not glob.glob(os.path.join(d, "*.mp3")):
        pats = [
            os.path.join(tools_dir(), "node_modules", "hyperframes", "dist", "skills", "media-use", "audio", "assets", "sfx", "*"),
            os.path.join(os.path.expanduser("~"), ".npm", "_npx", "*", "node_modules", "hyperframes", "dist", "skills", "media-use", "audio", "assets", "sfx", "*"),
        ]
        for p in pats:
            files = glob.glob(p)
            if files:
                for f in files:
                    try:
                        shutil.copy(f, d)
                    except Exception:
                        pass
                break
    return d


def tts_python():
    return os.environ.get("VS_TTS_PYTHON") or sys.executable


_GPU_LIBS = {}


def gpu_lib_dirs(py=None):
    """Carpetas lib/ de los paquetes pip nvidia-* (cuBLAS, cuDNN…) visibles para el intérprete `py`.
    CTranslate2 (faster-whisper) las abre con dlopen y NO las encuentra solas: torch las carga por ruta,
    pero CTranslate2 depende de LD_LIBRARY_PATH (fallo típico en Colab: «libcublas.so.12 / libcudnn_ops
    not found» al empezar a transcribir)."""
    py = py or tts_python()
    if py in _GPU_LIBS:
        return _GPU_LIBS[py]
    import glob
    import subprocess

    dirs = []
    try:
        r = subprocess.run([py, "-c", "import site, sys; print('\\n'.join(site.getsitepackages() + [site.getusersitepackages()]))"],
                           capture_output=True, text=True, timeout=30)
        for sp in r.stdout.split("\n"):
            for d in sorted(glob.glob(os.path.join(sp.strip(), "nvidia", "*", "lib"))):
                if os.path.isdir(d) and d not in dirs:
                    dirs.append(d)
            # ctranslate2 >= 4.5 trae sus propias libs en ctranslate2.libs (wheels manylinux)
    except Exception:
        pass
    _GPU_LIBS[py] = dirs
    return dirs


def worker_env(py=None, base=None):
    """Entorno para los workers de voz/ASR: añade las libs CUDA de pip a LD_LIBRARY_PATH."""
    env = dict(os.environ if base is None else base)
    env.pop("HF_HUB_ENABLE_HF_TRANSFER", None)
    dirs = gpu_lib_dirs(py)
    if dirs:
        cur = [d for d in env.get("LD_LIBRARY_PATH", "").split(os.pathsep) if d]
        env["LD_LIBRARY_PATH"] = os.pathsep.join(dirs + [d for d in cur if d not in dirs])
    return env


def models_dir():
    d = os.environ.get("VS_MODELS")
    if d:
        return d
    try:
        import folder_paths

        return folder_paths.models_dir
    except Exception:
        return os.path.join(data_dir(), "models")


def comfy_url():
    return os.environ.get("VS_COMFY_URL", "http://127.0.0.1:8188")


DEFAULT_SETTINGS = {
    "llm_model": "qwen3.8_27b_w4a8.safetensors",
    "llm_fallback": "qwen3.5_9b_bf16.safetensors",
    "llm_temperature": 0.85,
    "llm_thinking": False,
    "tts_engine": "qwen3",  # qwen3 | kokoro
    "tts_design_model": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    "tts_base_model": "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
    "whisper_model": "large-v3-turbo",
    "music_model": "ace_step_1.5_turbo_aio.safetensors",
    "music_volume": 0.16,
    "sfx_volume": 0.55,
    "fps": 30,
    "render_quality": "high",
    "render_workers": "auto",
    "chapter_seconds": 75,
    "language": "es",
    # modo «Mi audio → video»
    "audio_max_mb": 500,
    "audio_max_seconds": 1800,
    "audio_allow_video": True,
    "asr_model": "",            # vacío = whisper_model; en CPU se usa 'small' si el modelo es large
    "asr_vad": True,
    "asr_vad_min_silence_ms": 500,
    "asr_align": "auto",        # auto | whisperx | none
    "asr_device": "auto",
    "asr_compute_type": "auto",
    "asr_cpu_downgrade": True,
    "diarization": False,       # pyannote Community-1 (requiere HF_TOKEN y aceptar condiciones)
}
_lock = threading.Lock()


def settings():
    p = os.path.join(data_dir(), "settings.json")
    s = dict(DEFAULT_SETTINGS)
    try:
        with open(p, "r", encoding="utf-8") as f:
            s.update(json.load(f))
    except Exception:
        pass
    return s


def save_settings(new):
    with _lock:
        s = settings()
        s.update({k: v for k, v in new.items() if k in DEFAULT_SETTINGS})
        with open(os.path.join(data_dir(), "settings.json"), "w", encoding="utf-8") as f:
            json.dump(s, f, indent=2, ensure_ascii=False)
        return s


def _load_json_dir(name):
    """Carga presets/<name>.json y además cualquier presets/<name>.*.json o
    data_dir/presets/<name>*.json (así se añaden estilos sin tocar el código)."""
    out = {}
    files = [os.path.join(PRESETS_DIR, name + ".json")]
    files += sorted(glob.glob(os.path.join(PRESETS_DIR, name + ".*.json")))
    files += sorted(glob.glob(os.path.join(data_dir(), "presets", name + "*.json")))
    for f in files:
        try:
            with open(f, "r", encoding="utf-8") as fh:
                out.update(json.load(fh))
        except Exception as e:  # un preset roto no debe tumbar el Studio
            print(f"[ViralStudio] preset ignorado {f}: {e}")
    return out


def presets():
    return {
        "styles": _load_json_dir("styles"),
        "captions": _load_json_dir("captions"),
        "voices": _load_json_dir("voices"),
        "video_types": _load_json_dir("video_types"),
    }


LANGUAGES = {
    "es": {"name": "Español", "tts": "Spanish", "whisper": "es"},
    "en": {"name": "English", "tts": "English", "whisper": "en"},
    "pt": {"name": "Português", "tts": "Portuguese", "whisper": "pt"},
    "fr": {"name": "Français", "tts": "French", "whisper": "fr"},
    "de": {"name": "Deutsch", "tts": "German", "whisper": "de"},
    "it": {"name": "Italiano", "tts": "Italian", "whisper": "it"},
}

FORMATS = {
    "vertical": {"name": "Short / Reel / TikTok (9:16)", "W": 1080, "H": 1920},
    "horizontal": {"name": "YouTube (16:9)", "W": 1920, "H": 1080},
    "cuadrado": {"name": "Cuadrado (1:1)", "W": 1080, "H": 1080},
}

_engine_cache = {"mtime": 0, "js": ""}


def engine_js():
    files = sorted(glob.glob(os.path.join(ENGINE_DIR, "*.js")))
    mtime = max([os.path.getmtime(f) for f in files] or [0])
    if mtime != _engine_cache["mtime"]:
        parts = []
        for f in files:
            with open(f, "r", encoding="utf-8") as fh:
                parts.append(f"/* ---- {os.path.basename(f)} ---- */\n" + fh.read())
        _engine_cache.update(mtime=mtime, js="\n".join(parts))
    return _engine_cache["js"]
