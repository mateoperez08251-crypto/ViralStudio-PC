#@title 🚑 Acceso al Studio sin reinstalar (para un Colab que ya instaló Viral Studio) { display-mode: "form" }
#@markdown Pon una puerta con llave delante de ComfyUI y abre un túnel seguro (cloudflared, Apache-2.0). No toca tus modelos ni tus proyectos.
import base64, json, os, re, secrets, subprocess, sys, time, urllib.request

D = "/content/vs_rescue"
os.makedirs(f"{D}/vs", exist_ok=True)
open(f"{D}/vs/gateway.py", "wb").write(base64.b64decode("__GATEWAY__"))
KF = f"{D}/access_key"
if not os.path.exists(KF):
    fd = os.open(KF, os.O_WRONLY | os.O_CREAT, 0o600)
    os.write(fd, secrets.token_urlsafe(18).encode())
    os.close(fd)
KEY = open(KF).read().strip()
try:
    urllib.request.urlopen("http://127.0.0.1:8188/viralstudio/", timeout=5)
    print("✓ ComfyUI + Viral Studio responden en local (127.0.0.1:8188)")
except Exception as e:
    raise SystemExit(f"✗ ComfyUI no responde en local ({e}): ejecuta de nuevo la celda principal; el túnel no lo arregla.")
subprocess.run("pkill -f '[v]s.gateway --port 8189' ; pkill -f '[c]loudflared tunnel' ; true", shell=True)
time.sleep(1)
gw = subprocess.Popen([sys.executable, "-m", "vs.gateway", "--port", "8189", "--target", "http://127.0.0.1:8188", "--key-file", KF], cwd=D,
                      stdout=open(f"{D}/gateway.log", "w"), stderr=subprocess.STDOUT, start_new_session=True)
for _ in range(30):
    try:
        urllib.request.urlopen("http://127.0.0.1:8189/__gw/healthz", timeout=2)
        print("✓ puerta con llave en 127.0.0.1:8189")
        break
    except Exception:
        time.sleep(0.5)
else:
    raise SystemExit("✗ la puerta no arrancó: " + open(f"{D}/gateway.log").read()[-1500:])
CF = "/content/vs_tools/cloudflared"
if not os.path.exists(CF):
    urllib.request.urlretrieve("https://github.com/cloudflare/cloudflared/releases/download/2026.10.3/cloudflared-linux-amd64", CF)
    os.chmod(CF, 0o755)
tl = open(f"{D}/tunnel.log", "w")
subprocess.Popen([CF, "tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:8189"], stdout=tl, stderr=subprocess.STDOUT, start_new_session=True)
url = None
for _ in range(60):
    m = re.findall(r"https://[a-z0-9-]+\.trycloudflare\.com", open(f"{D}/tunnel.log").read())
    if m:
        url = m[-1]
        break
    time.sleep(1)
if not url:
    raise SystemExit("✗ cloudflared no dio enlace: " + open(f"{D}/tunnel.log").read()[-1500:])
from IPython.display import HTML, display

link = f"{url}/viralstudio/?key={KEY}"
display(HTML(f'<div style="font:15px system-ui"><a href="{link}" target="_blank" style="background:#f0b648;color:#111;padding:10px 16px;border-radius:9px;'
             f'font-weight:700;text-decoration:none">ABRIR VIRAL STUDIO ↗</a> &nbsp; <a href="{url}/?key={KEY}" target="_blank">ComfyUI ↗</a><br><br>'
             f'🔑 Llave: <code>{KEY}</code> · enlace privado, no lo compartas. (El DNS del enlace puede tardar ~20 s la primera vez.)</div>'))
