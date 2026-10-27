#@title 🎬 VIRAL STUDIO · instalar y abrir (una sola celda) { display-mode: "form" }
#@markdown **1.** Entorno de ejecución → Cambiar tipo → **GPU (G4 · RTX PRO 6000)**. **2.** Ejecuta esta celda. **3.** Pega tu token de Hugging Face cuando lo pida.
HF_TOKEN = ""  #@param {type:"string"}
#@markdown Guionista (LLM abierto, Apache-2.0):
LLM = "Qwen3.8 27B (máxima calidad, 17 GB)"  #@param ["Qwen3.8 27B (máxima calidad, 17 GB)", "Qwen3.5 9B (más rápido, 19 GB)"]
MUSICA_ACE_STEP = True  #@param {type:"boolean"}
REVISION_VISUAL = True  #@param {type:"boolean"}
VOZ_QWEN3_TTS = True  #@param {type:"boolean"}
GUARDAR_EN_DRIVE = True  #@param {type:"boolean"}
#@markdown Modo «Mi audio → video» (opcionales; el modo funciona sin ellos):
ASR_WHISPERX = False  #@param {type:"boolean"}
DIARIZACION_PYANNOTE = False  #@param {type:"boolean"}
#@markdown ---
#@markdown Todo es código abierto y gratuito. Esta celda es idempotente: si la vuelves a ejecutar, salta lo ya instalado.

import base64, getpass, io, json, os, shutil, subprocess, sys, tarfile, textwrap, time, urllib.request

T0 = time.time()
BASE = "/content"
COMFY = f"{BASE}/ComfyUI"
NODE_DIR = f"{COMFY}/custom_nodes/ComfyUI-ViralStudio"
TOOLS = f"{BASE}/vs_tools"
TTS_VENV = f"{BASE}/vs_tts"
HF_HOME = f"{BASE}/hf_cache"
HFV = "0.8.193"
NODE_V = "v22.22.0"
os.environ["HF_HOME"] = HF_HOME
os.environ.pop("HF_HUB_ENABLE_HF_TRANSFER", None)  # descarga estándar (hf_xet), sin depender de hf_transfer


def step(msg):
    print(f"\n\033[1;33m▶ {msg}\033[0m  ({time.time() - T0:.0f}s)", flush=True)


def sh(cmd, check=True, quiet=True, env=None):
    r = subprocess.run(cmd, shell=True, capture_output=quiet, text=True, env=env)
    if check and r.returncode != 0:
        print((r.stdout or "")[-2500:], (r.stderr or "")[-2500:])
        raise RuntimeError(f"Falló: {cmd[:160]}")
    return r


# ------------------------------------------------------------------ 0. diagnóstico
step("Diagnóstico del entorno")
gpu = sh("nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader", check=False).stdout.strip()
print("GPU:", gpu or "⚠️ SIN GPU — activa una GPU en Entorno de ejecución (la voz Qwen3-TTS, el LLM y la música la necesitan)")
du = shutil.disk_usage(BASE)
print(f"Disco libre: {du.free / 1e9:.0f} GB · Python {sys.version.split()[0]}")
if du.free < 45e9:
    print("⚠️ Poco disco: elige 'Qwen3.5 9B' o desactiva la música.")

if not HF_TOKEN:
    HF_TOKEN = getpass.getpass("🔑 Pega tu token de Hugging Face (https://huggingface.co/settings/tokens) y pulsa Enter: ").strip()
os.environ["HF_TOKEN"] = HF_TOKEN

if GUARDAR_EN_DRIVE:
    from google.colab import drive

    drive.mount("/content/drive")
    VS_DATA = "/content/drive/MyDrive/ViralStudio"
else:
    VS_DATA = f"{COMFY}/output/viralstudio"

# ------------------------------------------------------------------ 1. sistema
step("Dependencias del sistema (ffmpeg, Node 22, librerías de Chrome)")
sh("apt-get -qq update && apt-get -qq install -y ffmpeg libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libgbm1 libasound2t64 "
   "libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libpango-1.0-0 libcairo2 libxfixes3 fonts-noto-color-emoji espeak-ng > /dev/null 2>&1 "
   "|| apt-get -qq install -y ffmpeg libnss3 libatk-bridge2.0-0 libgbm1 libasound2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 "
   "libpango-1.0-0 libcairo2 espeak-ng > /dev/null", check=False)
nv = sh("node --version", check=False).stdout.strip()
if not nv.startswith("v2") or int(nv[1:].split(".")[0]) < 22:
    sh(f"cd /tmp && curl -fsSL https://nodejs.org/dist/{NODE_V}/node-{NODE_V}-linux-x64.tar.xz -o node.tar.xz && "
       f"tar -xf node.tar.xz && cp -r node-{NODE_V}-linux-x64/* /usr/local/")
print("node", sh("node --version").stdout.strip(), "·", sh("ffmpeg -version").stdout.split("\n")[0])

# ------------------------------------------------------------------ 2. ComfyUI
step("ComfyUI")
if not os.path.exists(f"{COMFY}/main.py"):
    sh(f"git clone -q --depth 1 https://github.com/comfyanonymous/ComfyUI {COMFY}")
else:
    sh(f"cd {COMFY} && git pull -q", check=False)
sh(f"{sys.executable} -m pip install -q -r {COMFY}/requirements.txt")
sh(f"{sys.executable} -m pip install -q -U huggingface_hub", check=False)
import importlib

try:
    import torch

    cap = torch.cuda.get_device_capability() if torch.cuda.is_available() else None
    arch = torch.cuda.get_arch_list() if torch.cuda.is_available() else []
    print("torch", torch.__version__, "· GPU arch", cap, "· soportadas", arch[-3:])
    if cap and f"sm_{cap[0]}{cap[1]}" not in arch and cap[0] >= 12:
        print("Instalando torch con CUDA 12.8 para Blackwell…")
        sh(f"{sys.executable} -m pip install -q --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128")
except Exception as e:
    print("torch:", e)

# ------------------------------------------------------------------ 3. nodo Viral Studio
step("Viral Studio (nodo de ComfyUI + Studio web)")
PAYLOAD = "__PAYLOAD__"
if os.path.exists(NODE_DIR):
    shutil.rmtree(NODE_DIR)
with tarfile.open(fileobj=io.BytesIO(base64.b64decode(PAYLOAD)), mode="r:gz") as tf:
    try:
        tf.extractall(f"{COMFY}/custom_nodes", filter="data")
    except TypeError:
        tf.extractall(f"{COMFY}/custom_nodes")
print("instalado en", NODE_DIR)

# ------------------------------------------------------------------ 4. HyperFrames + Chrome + efectos + Kokoro
step(f"HyperFrames {HFV} + Chrome headless")
os.makedirs(TOOLS, exist_ok=True)
if not os.path.exists(f"{TOOLS}/node_modules/.bin/hyperframes"):
    sh(f"cd {TOOLS} && npm init -y > /dev/null && npm install --silent hyperframes@{HFV}")
sh(f"cd {TOOLS} && ./node_modules/.bin/hyperframes browser ensure", check=False)
print(sh(f"cd {TOOLS} && ./node_modules/.bin/hyperframes --version", check=False).stdout.strip())
# QA de zonas seguras: navegador real, separado del modelo visual.
sh(f"cd {TOOLS} && npm install --silent playwright@1.62.1")
sh(f"cd {TOOLS} && ./node_modules/.bin/playwright install chromium")
os.makedirs(f"{TOOLS}/kokoro", exist_ok=True)
for fn, url in (("kokoro.onnx", "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx"),
                ("voices.bin", "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin")):
    if not os.path.exists(f"{TOOLS}/kokoro/{fn}"):
        urllib.request.urlretrieve(url, f"{TOOLS}/kokoro/{fn}")

# ------------------------------------------------------------------ 5. entorno de voz aislado
step("Voz: Qwen3-TTS + Kokoro + faster-whisper (entorno aislado)")
# El Python de Colab no trae ensurepip: se crea el venv sin pip y se instala pip con get-pip.py.
# --system-site-packages reutiliza el torch con CUDA de Colab (no se descarga otro).
VPY = f"{TTS_VENV}/bin/python"
if not os.path.exists(VPY):
    sh(f"{sys.executable} -m venv --without-pip --system-site-packages {TTS_VENV}")
if sh(f"{VPY} -m pip --version", check=False).returncode != 0:
    urllib.request.urlretrieve("https://bootstrap.pypa.io/get-pip.py", "/tmp/get-pip.py")
    sh(f"{VPY} /tmp/get-pip.py -q")
pkgs = "faster-whisper kokoro-onnx soundfile" + (" qwen-tts==0.1.1" if VOZ_QWEN3_TTS else "")
sh(f"{VPY} -m pip install -q {pkgs}")
chk = sh(f"{VPY} -c \"import torch, faster_whisper, kokoro_onnx; print('torch', torch.__version__, 'cuda', torch.cuda.is_available())\"", check=False)
print(chk.stdout.strip() or chk.stderr.strip()[-800:])
# Modo «Mi audio → video»: faster-whisper (ya instalado) es lo único obligatorio. WhisperX y pyannote son
# opcionales y se instalan aparte para no romper el entorno de voz si fallan (fijan versiones de torch).
for flag, pkg in ((ASR_WHISPERX, "whisperx"), (DIARIZACION_PYANNOTE, "pyannote.audio")):
    if flag:
        r = sh(f"{VPY} -m pip install -q {pkg}", check=False)
        print(f"{'✓' if r.returncode == 0 else '⚠️ no se pudo instalar'} {pkg} (opcional: el modo audio sigue sin él)")
if DIARIZACION_PYANNOTE:
    print("ℹ️ pyannote/speaker-diarization-community-1 exige aceptar sus condiciones en Hugging Face con tu cuenta.")

# ------------------------------------------------------------------ 6. modelos
step("Descargando modelos abiertos desde Hugging Face")
from huggingface_hub import hf_hub_download, snapshot_download

models = []
if LLM.startswith("Qwen3.8"):
    models.append(("Comfy-Org/Qwen3.8-27B", "text_encoders/qwen3.8_27b_w4a8.safetensors"))
    llm_file = "qwen3.8_27b_w4a8.safetensors"
else:
    models.append(("Comfy-Org/Qwen3.5", "text_encoders/qwen3.5_9b_bf16.safetensors"))
    llm_file = "qwen3.5_9b_bf16.safetensors"
if REVISION_VISUAL:
    models.append(("Comfy-Org/Qwen3.5", "text_encoders/qwen3.5_4b_bf16.safetensors"))
if MUSICA_ACE_STEP:
    models.append(("Comfy-Org/ACE-Step-1.5", "checkpoints/ace_step_1.5_turbo_aio.safetensors"))
for repo, fn in models:
    dst = f"{COMFY}/models/{fn}"
    if os.path.exists(dst) and os.path.getsize(dst) > 1e8:
        print("✓ ya está", fn)
        continue
    print("↓", repo, fn, flush=True)
    hf_hub_download(repo, fn, local_dir=f"{COMFY}/models", token=HF_TOKEN or None)
tts_repos = ["deepdml/faster-whisper-large-v3-turbo-ct2"]
if VOZ_QWEN3_TTS:
    tts_repos += ["Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", "Qwen/Qwen3-TTS-12Hz-1.7B-Base"]
for repo in tts_repos:
    print("↓", repo, flush=True)
    snapshot_download(repo, token=HF_TOKEN or None)

# ------------------------------------------------------------------ 7. ajustes + túnel
step("Ajustes y cliente del túnel seguro")
os.makedirs(VS_DATA, exist_ok=True)
sett_path = f"{VS_DATA}/settings.json"
sett = json.load(open(sett_path)) if os.path.exists(sett_path) else {}
sett.update({"llm_model": llm_file, "llm_fallback": "qwen3.5_9b_bf16.safetensors" if llm_file.startswith("qwen3.8") else llm_file,
             "tts_engine": "qwen3" if VOZ_QWEN3_TTS else "kokoro", "whisper_model": "deepdml/faster-whisper-large-v3-turbo-ct2"})
json.dump(sett, open(sett_path, "w"), indent=2)
# cloudflared (Apache-2.0): túnel rápido sin cuenta. Versión fijada; si no existe, la última.
CF = f"{TOOLS}/cloudflared"
CF_V = "2026.10.3"
if not os.path.exists(CF):
    for u in (f"https://github.com/cloudflare/cloudflared/releases/download/{CF_V}/cloudflared-linux-amd64",
              "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"):
        try:
            urllib.request.urlretrieve(u, CF)
            os.chmod(CF, 0o755)
            break
        except Exception as e:
            print("cloudflared:", u.split("/")[-2], e)
print(sh(f"{CF} --version", check=False).stdout.strip() or "⚠️ cloudflared no disponible: solo quedará el visor de Colab")
hf_preview_url = ""
try:
    from google.colab.output import eval_js

    hf_preview_url = eval_js("google.colab.kernel.proxyPort(3002)").rstrip("/")
except Exception:
    pass

# ------------------------------------------------------------------ 8. arranque supervisado (Ampliación V3 §9)
# Orden: orquestador (Studio, uno solo) → ComfyUI (opcional) → puerta con llave → túnel.
# Cada paso se verifica antes del siguiente. El túnel solo conecta: si se cae, nada se pierde.
step("Arrancando servicios (orquestador · ComfyUI · puerta con llave · túnel)")
RUN = f"{BASE}/vs_run"  # PIDs, registros y la llave: viven solo en este runtime (llave nueva en cada sesión)
os.environ.update(VS_DATA=VS_DATA, VS_RUN_DIR=RUN, VS_TOOLS=TOOLS, VS_TTS_PYTHON=f"{TTS_VENV}/bin/python", VS_KOKORO_DIR=f"{TOOLS}/kokoro",
                  VS_HF_BIN=f"{TOOLS}/node_modules/.bin/hyperframes", VS_COMFY_URL="http://127.0.0.1:8188", VS_COMFY_DIR=COMFY,
                  VS_VISUAL_MODEL="qwen3.5_4b_bf16.safetensors", NODE_PATH=f"{TOOLS}/node_modules", VS_HF_PREVIEW_URL=hf_preview_url, VS_GPU_ENCODE="1" if gpu else "", VS_CLOUDFLARED=CF,
                  VS_TUNNEL="cloudflared" if os.path.exists(CF) else "off", PYTHONUNBUFFERED="1")
sys.path.insert(0, NODE_DIR)
for m in [m for m in sys.modules if m == "vs" or m.startswith("vs.")]:
    del sys.modules[m]
from vs import services as SV

os.makedirs(RUN, exist_ok=True)
code_hash = __import__("hashlib").sha1(PAYLOAD.encode()).hexdigest()[:12]
hash_f = f"{RUN}/code_version"
prev_hash = open(hash_f).read().strip() if os.path.exists(hash_f) else None
busy = []
try:
    busy = [p["id"] for p in json.load(urllib.request.urlopen("http://127.0.0.1:8765/viralstudio/api/projects", timeout=3))
            if (p.get("status") or {}).get("running")]
except Exception:
    pass
if prev_hash != code_hash:
    if busy:
        print(f"⚠️ Hay trabajos en marcha ({', '.join(busy)}): NO se reinician los servicios; el código nuevo se aplicará cuando termines.")
    else:
        # código nuevo: se paran SOLO nuestros procesos (incluido el ComfyUI de una versión anterior de esta celda)
        for sid in ("watch", "tunnel", "gateway", "orchestrator", "comfyui"):
            SV.stop(sid)
        if prev_hash is None:
            sh("pkill -f '[C]omfyUI/main.py' || true", check=False)
            time.sleep(3)
        open(hash_f, "w").write(code_hash)
SV.write_config(SV.default_config())
res, st = SV.up()
print("  resultado:", json.dumps(res, ensure_ascii=False))
if res.get("orchestrator") not in ("started", "reused"):
    print(SV.log_tail("orchestrator", 40))
    raise RuntimeError("El Studio (orquestador) no arrancó: registro arriba · " + f"{RUN}/orchestrator.log")
if res.get("comfyui") not in ("started", "reused"):
    print("⚠️ ComfyUI no arrancó: el Studio funciona en modo 'mi propio guion' (sin LLM ni música).")
    print(SV.log_tail("comfyui", 30))
SV.spawn_watch()  # vigilante: rehace la puerta y el túnel si caen

# ------------------------------------------------------------------ 9. doctor (verificación real)
step("Verificación (doctor)")
try:
    rep = json.load(urllib.request.urlopen("http://127.0.0.1:8765/viralstudio/api/health", timeout=180))
    c = rep.get("comfyui", {})
    rows = [("GPU", rep["gpu"]["detail"] if rep["gpu"]["ok"] else "NO"), ("HyperFrames", rep["hyperframes"].get("detail")),
            ("ComfyUI", f"{c.get('node_classes', 0)} nodos"), ("Nodos guion", c.get("required", {}).get("guion (LLM)")),
            ("Nodos música", c.get("required", {}).get("música (ACE-Step 1.5)")),
            ("LLM instalado", (c.get("models") or {}).get("llm")), ("Música instalada", (c.get("models") or {}).get("music")),
            ("Voz", rep["tts"].get("modules"))]
    for k, v in rows:
        print(f"  {k:16s} {v}")
    print("  Modo «Mi audio → video»:")
    for r in rep.get("audio_mode", []):
        mark = "✅" if r["ok"] else ("⛔" if r["critical"] else "➖")
        print(f"    {mark} {r['name']:30s} {'CRÍTICO' if r['critical'] else 'opcional'} · {r['detail'][:90]}" + ("" if r["ok"] else f" → {r['fix']}"))
    print(f"  (informe completo: {VS_DATA}/environment_report.json)")
except Exception as e:
    print("doctor:", e)
SV.report(f"{RUN}/startup_report.json")

# ------------------------------------------------------------------ 10. abrir el Studio
step(f"¡Listo en {(time.time() - T0) / 60:.1f} min! Abriendo Viral Studio")
from IPython.display import HTML, display

LINK = SV.link()
KEY = SV.access_key(create=False)
# Datos separados para la aplicación de la PC: no se envía la llave en la URL.
from urllib.parse import urlsplit
if LINK:
    _u=urlsplit(LINK)
    print("URL para ViralStudio PC:", f"{_u.scheme}://{_u.netloc}")
    print("Llave para ViralStudio PC:", KEY)
if LINK:
    display(HTML(f"""<div style="font:15px system-ui;background:#12141a;color:#e9e6df;border:1px solid #f0b648;border-radius:12px;padding:16px;max-width:760px">
<b style="font-size:18px">🎬 Viral Studio</b><br><br>
<a href="{LINK}" target="_blank" style="background:#f0b648;color:#111;padding:10px 16px;border-radius:9px;font-weight:700;text-decoration:none">ABRIR VIRAL STUDIO ↗</a>
&nbsp; <a href="{LINK.replace('/viralstudio/?', '/?')}" target="_blank" style="color:#f0b648">ComfyUI ↗</a><br><br>
🔑 Llave de acceso (por si te la pide): <code style="background:#000;padding:2px 6px">{KEY}</code><br>
<span style="color:#8f96a6">Enlace privado: no lo compartas. Cambia en cada sesión de Colab. Si el túnel se rehace, el enlace cambia:
ejecuta la celda «🔗 Enlace y diagnóstico» de abajo. Tus trabajos siguen aunque cierres la pestaña.</span></div>"""))
else:
    print("⚠️ El túnel no dio enlace (", (st.get("services", {}).get("tunnel") or {}).get("diagnosis"), "). Usa el visor de Colab de abajo.")
print("\nAlternativa (visor de Colab dentro del cuaderno; necesita las cookies de Google permitidas):")
try:
    from google.colab import output

    output.serve_kernel_port_as_iframe(8765, path="/viralstudio/", height=900)
except Exception as e:
    print("visor de Colab:", e)
print("Registros:", RUN, "· Tus videos:", VS_DATA)
