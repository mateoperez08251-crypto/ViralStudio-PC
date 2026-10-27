"""Arranque supervisado de Viral Studio (Ampliación V3 §9-§10).

    python -m vs.services up        # arranca lo que falte, en orden, y verifica cada paso
    python -m vs.services status    # salud en 3 niveles: proceso · API local · acceso externo
    python -m vs.services link      # enlace privado actual (el túnel puede cambiarlo)
    python -m vs.services restart-tunnel
    python -m vs.services report    # startup_report.json con secretos redactados
    python -m vs.services watch     # vigilante: rehace el túnel/puerta si caen (con espera creciente)

Orden: PRECHECK → orquestador (uno solo) → ComfyUI (opcional) → puerta con llave → túnel.
El túnel NO ejecuta nada: si se cae, el render sigue. La puerta y el túnel (sin estado) se
rehacen siempre; el orquestador y ComfyUI solo si su proceso murió (rearrancarlos no corta
nada; lo que quedó a medias pasa a INTERRUPTED y se reanuda a mano), con máximo 5 intentos.
Un servicio colgado pero vivo nunca se mata solo. Cada servicio deja PID y registro en <run_dir>; un segundo `up` reutiliza lo que ya
está sano (no duplica procesos ni ocupa puertos nuevos).

La definición vive en services.json (argv sin shell, entorno, puerto, salud, dependencias,
política de reinicio, registro, exposición pública). Los secretos (llave, token HF) nunca
se escriben en services.json ni en los informes.
"""
import argparse
import json
import os
import re
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUN_DIR = os.environ.get("VS_RUN_DIR") or os.path.join(os.environ.get("VS_DATA") or os.path.join(PKG, "_data"), "run")
TUNNEL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")
SECRET_RES = [re.compile(r"hf_[A-Za-z0-9]{20,}"), re.compile(r"([?&]key=)[^&\s\"']+"), re.compile(r"(vs_key=)[^;\s\"']+"),
              re.compile(r"(HF_TOKEN[\"']?\s*[:=]\s*[\"']?)[^\s\"',]+")]


# ------------------------------------------------------------------ utilidades
def redact(text, extra=()):
    text = str(text)
    for s in extra:
        if s and len(s) >= 8:
            text = text.replace(s, "***")
    for r in SECRET_RES:
        text = r.sub(lambda m: (m.group(1) if m.groups() else "") + "***", text)
    return text


def _p(*a):
    return os.path.join(RUN_DIR, *a)


def _read(path):
    with open(path, errors="ignore") as f:
        return f.read()


def key_file():
    return _p("access_key")


def access_key(create=True):
    kf = key_file()
    if os.path.exists(kf):
        return _read(kf).strip()
    if not create:
        return ""
    os.makedirs(RUN_DIR, exist_ok=True)
    k = secrets.token_urlsafe(18)
    fd = os.open(kf, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(k)
    return k


def port_open(port, host="127.0.0.1"):
    try:
        with socket.create_connection((host, port), timeout=1.5):
            return True
    except OSError:
        return False


def http_get(url, timeout=4):
    """→ (status, cuerpo corto, diagnóstico)."""
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status, r.read(4096).decode(errors="ignore"), "OK"
    except urllib.error.HTTPError as e:
        return e.code, e.read(2048).decode(errors="ignore"), _diag_status(e.code)
    except urllib.error.URLError as e:
        reason = str(e.reason)
        return None, "", "ECONNREFUSED (nadie escucha en ese puerto)" if "refused" in reason.lower() else "RED: " + reason[:120]
    except (TimeoutError, socket.timeout):
        return None, "", "TIMEOUT (el servicio no respondió a tiempo)"
    except Exception as e:
        return None, "", type(e).__name__ + ": " + str(e)[:120]


def _diag_status(code):
    return {401: "401 autorización (falta la llave)", 403: "403 autorización (proxy/cuenta lo prohíbe)",
            404: "404 ruta/proxy equivocado", 502: "502 servicio local caído detrás del proxy",
            503: "503 servicio arrancado pero no listo", 504: "504 servicio local lento/colgado"}.get(code, f"HTTP {code}")


def pid_alive(pid):
    try:
        os.kill(int(pid), 0)
    except (OSError, ValueError, TypeError):
        return False
    try:  # un zombi no cuenta como vivo
        with open(f"/proc/{int(pid)}/stat") as f:
            return f.read().split()[2] != "Z"
    except OSError:
        return True


def read_pid(sid):
    try:
        return int(_read(_p(sid + ".pid")).strip())
    except Exception:
        return None


def log_tail(sid, n=40, extra=()):
    try:
        with open(_p(sid + ".log"), errors="ignore") as f:
            return redact("".join(f.readlines()[-n:]), extra)
    except OSError:
        return ""


LOG_SIGNS = [("CUDA out of memory", "VRAM_OOM (memoria de GPU agotada)"), ("OutOfMemoryError", "VRAM_OOM (memoria de GPU agotada)"),
             ("ModuleNotFoundError", "dependencia faltante (ModuleNotFoundError)"), ("Address already in use", "puerto ocupado por otro proceso"),
             ("Traceback (most recent call last)", "excepción de Python (ver registro)"), ("failed to unmarshal quick Tunnel", "cloudflared: el servicio de túneles rápidos no respondió"),
             ("websocket: close", "WebSocket cerrado (upgrade/proxy)")]


def log_diagnosis(sid):
    t = log_tail(sid, 200)
    return [d for s, d in LOG_SIGNS if s in t]


# ------------------------------------------------------------------ definición
def default_config(env=None):
    """services.json por defecto a partir de variables VS_* (lo usa la celda de Colab)."""
    e = env or os.environ
    py = sys.executable
    comfy_dir = e.get("VS_COMFY_DIR", "")
    orch_port = int(e.get("VS_ORCH_PORT", 8765))
    comfy_port = int(e.get("VS_COMFY_PORT", 8188))
    gw_port = int(e.get("VS_GW_PORT", 8189))
    cf = e.get("VS_CLOUDFLARED") or shutil.which("cloudflared") or os.path.join(e.get("VS_TOOLS", PKG), "cloudflared")
    svcs = [
        {"id": "orchestrator", "argv": [py, os.path.join(PKG, "standalone.py"), "--port", str(orch_port)], "cwd": PKG, "port": orch_port,
         "health": f"http://127.0.0.1:{orch_port}/healthz", "ready": f"http://127.0.0.1:{orch_port}/readyz", "required": True,
         "restart": "on-exit", "public": False, "auth": "detrás de la puerta", "license": "propio (este repo)", "timeout_s": 60},
    ]
    if comfy_dir:
        svcs.append({"id": "comfyui", "argv": [py, os.path.join(comfy_dir, "main.py"), "--listen", "127.0.0.1", "--port", str(comfy_port),
                                                "--disable-auto-launch"], "cwd": comfy_dir, "port": comfy_port,
                     "health": f"http://127.0.0.1:{comfy_port}/system_stats", "required": False, "restart": "on-exit", "public": False,
                     "auth": "detrás de la puerta", "license": "GPL-3.0 (ComfyUI)", "timeout_s": 480, "env": {"VS_EMBED_STUDIO": "0"}})
    svcs.append({"id": "gateway", "argv": [py, "-m", "vs.gateway", "--port", str(gw_port), "--target", f"http://127.0.0.1:{comfy_port}",
                                           "--route", f"/viralstudio=http://127.0.0.1:{orch_port}", "--key-file", key_file()],
                 "cwd": PKG, "port": gw_port, "health": f"http://127.0.0.1:{gw_port}/__gw/healthz", "required": True,
                 "depends": ["orchestrator"], "restart": "always", "public": False, "auth": "llave (cookie httponly)",
                 "license": "propio", "timeout_s": 20})
    if e.get("VS_TUNNEL", "cloudflared") != "off":
        argv = json.loads(e["VS_TUNNEL_CMD"]) if e.get("VS_TUNNEL_CMD") else \
            [cf, "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{gw_port}"]
        svcs.append({"id": "tunnel", "argv": argv, "cwd": RUN_DIR, "port": None, "health": None, "required": False,
                     "depends": ["gateway"], "restart": "always", "public": True, "auth": "toda petición pasa por la puerta con llave",
                     "license": "Apache-2.0 (cloudflared)", "timeout_s": 60, "url_from_log": True})
    return {"run_dir": RUN_DIR, "services": svcs}


def load_config():
    p = _p("services.json")
    if os.path.exists(p):
        return json.loads(_read(p))
    return default_config()


def write_config(cfg):
    os.makedirs(RUN_DIR, exist_ok=True)
    with open(_p("services.json"), "w") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


ENV_ALLOW = re.compile(r"^(VS_|HF_|PYTHON|PATH$|HOME$|LANG|LC_|CUDA|NVIDIA|LD_LIBRARY_PATH$|TORCH|PYTORCH|TMPDIR$|XDG_|NODE|PUPPETEER|CHROME|COLAB_|TRITON|TF_|SSL_CERT|REQUESTS_CA|CURL_CA|OMP_|MKL_)")


def _env_for(svc):
    env = {k: v for k, v in os.environ.items() if ENV_ALLOW.match(k)}
    env.update(svc.get("env") or {})
    env["PYTHONUNBUFFERED"] = "1"
    env["VS_RUN_DIR"] = RUN_DIR
    env.pop("HF_HUB_ENABLE_HF_TRANSFER", None)
    if svc["id"] in ("gateway", "tunnel"):  # la puerta y el túnel no necesitan el token de HF
        env.pop("HF_TOKEN", None)
    return env


# ------------------------------------------------------------------ estado
def state_file():
    return _p("services_state.json")


def load_state():
    try:
        return json.loads(_read(state_file()))
    except Exception:
        return {}


def save_state(st):
    os.makedirs(RUN_DIR, exist_ok=True)
    tmp = state_file() + ".tmp"
    with open(tmp, "w") as f:
        json.dump(st, f, indent=2, ensure_ascii=False)
    os.replace(tmp, state_file())


def event(st, msg):
    st.setdefault("events", []).append(time.strftime("%H:%M:%S ") + msg)
    st["events"] = st["events"][-60:]


def healthy(svc):
    if svc.get("health"):
        code, _, _ = http_get(svc["health"], timeout=3)
        return code is not None and 200 <= code < 300
    pid = read_pid(svc["id"])
    return bool(pid and pid_alive(pid))


def tunnel_url(svc_id="tunnel"):
    t = log_tail(svc_id, 400)
    m = TUNNEL_RE.findall(t)
    return m[-1] if m else None


# ------------------------------------------------------------------ arranque
def start(svc, st, log=print):
    """Arranca un servicio si no está sano. Devuelve 'reused' | 'started' | error."""
    sid = svc["id"]
    pid = read_pid(sid)
    own = bool(pid and pid_alive(pid))
    if own and healthy(svc):
        # solo se reutiliza un proceso lanzado por este supervisor (otro podría tener otra llave u otra carpeta de datos)
        st.setdefault("services", {})[sid] = dict(st.get("services", {}).get(sid, {}), status="ok", pid=pid, note="reutilizado")
        log(f"  ✓ {sid}: ya estaba sano, se reutiliza")
        return "reused"
    if svc.get("port") and port_open(svc["port"]):
        if own:
            pass  # proceso nuestro que aún arranca: se espera
        else:
            msg = f"el puerto {svc['port']} lo ocupa otro proceso que no lanzó este supervisor"
            st.setdefault("services", {})[sid] = {"status": "error", "diagnosis": "PORT_BUSY: " + msg}
            log(f"  ✗ {sid}: {msg} (no se mata: podría ser de otra aplicación)")
            return "PORT_BUSY"
    if not own:
        exe = svc["argv"][0]
        if not (os.path.exists(exe) or shutil.which(exe)):
            st.setdefault("services", {})[sid] = {"status": "error", "diagnosis": f"MISSING_BINARY: {exe}"}
            log(f"  ✗ {sid}: falta {exe}")
            return "MISSING_BINARY"
        os.makedirs(RUN_DIR, exist_ok=True)
        lf = open(_p(sid + ".log"), "a")
        lf.write(f"\n===== {time.strftime('%Y-%m-%d %H:%M:%S')} arranque de {sid} =====\n")
        lf.flush()
        # start_new_session: sobrevive a que se interrumpa la celda de Colab
        p = subprocess.Popen(svc["argv"], cwd=svc.get("cwd") or None, env=_env_for(svc), stdout=lf, stderr=subprocess.STDOUT,
                             stdin=subprocess.DEVNULL, start_new_session=True)
        lf.close()  # el hijo conserva su copia del descriptor
        with open(_p(sid + ".pid"), "w") as f:
            f.write(str(p.pid))
        pid = p.pid
        event(st, f"{sid} arrancado (pid {pid})")
        log(f"  … {sid}: arrancando (pid {pid})")
    t0 = time.time()
    while time.time() - t0 < svc.get("timeout_s", 60):
        if not pid_alive(pid):
            d = log_diagnosis(sid)
            st.setdefault("services", {})[sid] = {"status": "error", "pid": pid, "diagnosis": "EXITED: " + (", ".join(d) or "el proceso terminó"),
                                                  "log_tail": log_tail(sid, 25)}
            log(f"  ✗ {sid}: terminó al arrancar → {', '.join(d) or 'mira ' + _p(sid + '.log')}")
            return "EXITED"
        if svc.get("url_from_log"):
            url = tunnel_url(sid)
            if url:
                st.setdefault("services", {})[sid] = {"status": "ok", "pid": pid, "started": time.time()}
                if st.get("public_url") != url:
                    if st.get("public_url"):
                        event(st, "el túnel cambió de URL: hay que usar el enlace nuevo")
                    st["public_url"] = url
                    st["public_url_since"] = time.time()
                log(f"  ✓ {sid}: {url}")
                return "started"
        elif healthy(svc) and (svc.get("health") or time.time() - t0 >= 3):  # sin URL de salud: debe seguir vivo 3 s
            st.setdefault("services", {})[sid] = {"status": "ok", "pid": pid, "started": time.time(), "startup_s": round(time.time() - t0, 1)}
            log(f"  ✓ {sid}: sano en {time.time() - t0:.0f}s")
            return "started"
        time.sleep(1.0)
    d = log_diagnosis(sid)
    st.setdefault("services", {})[sid] = {"status": "error", "pid": pid, "diagnosis": "TIMEOUT_STARTUP: " + (", ".join(d) or "no respondió a tiempo"),
                                          "log_tail": log_tail(sid, 25)}
    log(f"  ✗ {sid}: no quedó sano en {svc.get('timeout_s', 60)}s")
    return "TIMEOUT"


def stop(sid, st=None):
    pid = read_pid(sid)
    if pid and pid_alive(pid):
        try:
            os.killpg(os.getpgid(pid), signal.SIGTERM)
        except Exception:
            try:
                os.kill(pid, signal.SIGTERM)
            except Exception:
                pass
        for _ in range(30):
            if not pid_alive(pid):
                break
            time.sleep(0.2)
        if pid_alive(pid):
            try:
                os.killpg(os.getpgid(pid), signal.SIGKILL)
            except Exception:
                pass
    try:
        os.remove(_p(sid + ".pid"))
    except OSError:
        pass
    if st is not None:
        event(st, f"{sid} detenido")


def up(only=None, log=print):
    cfg = load_config()
    if not os.path.exists(_p("services.json")):
        write_config(cfg)
    access_key()
    st = load_state()
    st["precheck"] = precheck()
    res = {}
    for svc in cfg["services"]:
        if only and svc["id"] not in only:
            continue
        deps = [d for d in svc.get("depends", []) if res.get(d) not in (None, "reused", "started") and healthy_by_id(cfg, d) is False]
        if deps:
            res[svc["id"]] = "BLOCKED"
            st.setdefault("services", {})[svc["id"]] = {"status": "blocked", "diagnosis": "depende de " + ", ".join(deps)}
            log(f"  ✗ {svc['id']}: bloqueado, depende de {', '.join(deps)}")
            continue
        res[svc["id"]] = start(svc, st, log)
        if svc["id"] == "tunnel" and res["tunnel"] in ("started", "reused"):
            external_check(st, log)
    st["updated"] = time.time()
    save_state(st)
    return res, st


def healthy_by_id(cfg, sid):
    for s in cfg["services"]:
        if s["id"] == sid:
            return healthy(s)
    return None


def precheck():
    du = shutil.disk_usage(os.path.dirname(RUN_DIR) if os.path.exists(os.path.dirname(RUN_DIR)) else "/")
    gpu = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total,memory.used", "--format=csv,noheader"], capture_output=True,
                         text=True).stdout.strip() if shutil.which("nvidia-smi") else ""
    return {"disk_free_gb": round(du.free / 1e9, 1), "gpu": gpu or "sin GPU", "python": sys.version.split()[0],
            "ffmpeg": bool(shutil.which("ffmpeg")), "writable": os.access(os.path.dirname(RUN_DIR) or "/", os.W_OK)}


def external_check(st, log=print, tries=None):
    """Nivel 3: ¿se llega desde Internet a la puerta? (solo el /__gw/healthz público, sin llave)."""
    url = st.get("public_url")
    if not url:
        return None
    diag = None
    tries = tries or int(os.environ.get("VS_EXT_TRIES", 6))
    for i in range(tries):
        code, body, diag = http_get(url + "/__gw/healthz", timeout=8)
        if code == 200 and '"ok"' in body:
            st["external"] = {"ok": True, "at": time.time(), "url_ok": url}
            log("  ✓ acceso externo: el túnel llega a la puerta")
            return True
        time.sleep(min(10, 2 + i * 2))  # el DNS de trycloudflare tarda unos segundos
    st["external"] = {"ok": False, "diagnosis": diag, "at": time.time()}
    log(f"  ⚠ acceso externo no confirmado desde aquí ({diag}); prueba el enlace en tu navegador")
    return False


# ------------------------------------------------------------------ salud
def status():
    cfg = load_config()
    st = load_state()
    out = {"run_dir": RUN_DIR, "services": {}, "public_url": st.get("public_url")}
    for svc in cfg["services"]:
        sid = svc["id"]
        pid = read_pid(sid)
        s = {"process": bool(pid and pid_alive(pid)), "pid": pid, "public": svc.get("public"), "required": svc.get("required")}
        if svc.get("health"):
            code, body, diag = http_get(svc["health"], timeout=3)
            s["api"] = {"http": code, "diagnosis": diag}
            if svc.get("ready"):
                code2, body2, diag2 = http_get(svc["ready"], timeout=20)
                s["ready"] = {"http": code2, "diagnosis": diag2}
                try:
                    s["ready"]["checks"] = {k: v.get("ok") for k, v in json.loads(body2)["checks"].items()}
                except Exception:
                    pass
            if not s["process"] and code == 200:
                s["note"] = "sano pero arrancado por otro proceso"
        s["log_signs"] = log_diagnosis(sid)
        out["services"][sid] = s
    if st.get("public_url"):
        code, body, diag = http_get(st["public_url"] + "/__gw/healthz", timeout=8)
        out["external"] = {"http": code, "diagnosis": diag}
    out["events"] = st.get("events", [])[-10:]
    return out


def report(path=None):
    """startup_report.json redactado (para compartir en un diagnóstico)."""
    key = access_key(create=False)
    rep = {"note": "Informe redactado: sin llaves ni tokens. Salud de procesos ≠ render de punta a punta.", "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
           "precheck": precheck(), "status": status(), "logs": {}}
    for svc in load_config()["services"]:
        rep["logs"][svc["id"]] = log_tail(svc["id"], 60, extra=(key, os.environ.get("HF_TOKEN", "")))
    if rep["status"].get("public_url"):
        rep["status"]["public_url"] = re.sub(r"https://[a-z0-9-]+", "https://<oculto>", rep["status"]["public_url"])
    text = redact(json.dumps(rep, indent=2, ensure_ascii=False), extra=(key, os.environ.get("HF_TOKEN", "")))
    path = path or _p("startup_report.json")
    with open(path, "w") as f:
        f.write(text)
    return path


def link():
    st = load_state()
    url = st.get("public_url")
    return (url.rstrip("/") + "/viralstudio/?key=" + access_key(create=False)) if url else None


# ------------------------------------------------------------------ vigilante
def watch(interval=None, max_backoff=300, log=print):
    """Rehace puerta y túnel si caen (backoff exponencial con tope). No toca el orquestador
    ni ComfyUI: si caen, lo registra para que una persona decida."""
    me = _p("watch.pid")
    old = read_pid("watch")
    if old and old != os.getpid() and pid_alive(old):
        log(f"ya hay un vigilante (pid {old})")
        return
    with open(me, "w") as f:
        f.write(str(os.getpid()))
    interval = interval or float(os.environ.get("VS_WATCH_INTERVAL", 15))
    backoff = {}
    restarts = {}  # sid -> marcas de tiempo (tope por hora para no entrar en bucle)
    fails_ext = 0
    while True:
        cfg = load_config()
        st = load_state()
        for svc in cfg["services"]:
            sid = svc["id"]
            ok = healthy(svc)
            if ok:
                backoff.pop(sid, None)
                continue
            pid = read_pid(sid)
            dead = not (pid and pid_alive(pid)) and not (svc.get("port") and port_open(svc["port"]))
            # on-exit: solo si el proceso MURIÓ (rearrancarlo no corta ningún trabajo; los trabajos
            # a medias quedan INTERRUPTED y se reanudan a mano). Colgado pero vivo → decide una persona.
            recent = [t for t in restarts.get(sid, []) if time.time() - t < 3600]
            restarts[sid] = recent
            if len(recent) >= (5 if svc.get("restart") == "on-exit" else 30):
                if st.get("services", {}).get(sid, {}).get("status") != "gave_up":
                    st.setdefault("services", {})[sid] = {"status": "gave_up", "diagnosis": "demasiados reinicios en una hora: " +
                                                          (", ".join(log_diagnosis(sid)) or "mira el registro")}
                    event(st, f"{sid}: demasiados reinicios, se deja parado")
                continue
            if svc.get("restart") == "on-exit" and dead:
                pass
            elif svc.get("restart") != "always":
                if st.get("services", {}).get(sid, {}).get("status") != "down":
                    st.setdefault("services", {})[sid] = {"status": "down", "diagnosis": ", ".join(log_diagnosis(sid)) or "no responde",
                                                          "since": time.time()}
                    event(st, f"{sid} no responde (no se reinicia solo: decide tú)")
                continue
            b = backoff.get(sid, {"wait": 5, "next": 0, "count": 0})
            if time.time() < b["next"]:
                continue
            event(st, f"{sid} caído → reintento #{b['count'] + 1}")
            restarts[sid].append(time.time())
            stop(sid)
            r = start(svc, st, log)
            if r in ("started", "reused"):
                backoff.pop(sid, None)
                if sid == "tunnel":
                    external_check(st, log, tries=4)
            else:
                b = {"wait": min(max_backoff, b["wait"] * 2), "next": time.time() + b["wait"], "count": b["count"] + 1}
                backoff[sid] = b
        # túnel vivo pero inalcanzable desde fuera (el proveedor invalidó la sesión). Solo se rehace
        # si ese enlace SÍ funcionó antes: si nunca se pudo comprobar desde aquí (DNS/red del
        # contenedor), rehacerlo en bucle solo cambiaría el enlace sin arreglar nada.
        if st.get("public_url") and any(s["id"] == "tunnel" for s in cfg["services"]):
            code, _, _ = http_get(st["public_url"] + "/__gw/healthz", timeout=8)
            if code == 200:
                fails_ext = 0
                st["external"] = {"ok": True, "at": time.time(), "url_ok": st["public_url"]}
            else:
                fails_ext += 1
            was_ok = (st.get("external") or {}).get("url_ok") == st["public_url"]
            if fails_ext >= 4 and was_ok and len(restarts.get("tunnel", [])) < 30:
                event(st, "el túnel dejó de responder desde fuera: se rehace (habrá enlace nuevo)")
                restarts.setdefault("tunnel", []).append(time.time())
                st["external"] = {"ok": False, "at": time.time()}
                stop("tunnel")
                fails_ext = 0
        st["watch"] = {"pid": os.getpid(), "at": time.time()}
        save_state(st)
        time.sleep(interval)


def spawn_watch():
    pid = read_pid("watch")
    if pid and pid_alive(pid):
        return pid
    os.makedirs(RUN_DIR, exist_ok=True)
    lf = open(_p("watch.log"), "a")
    p = subprocess.Popen([sys.executable, "-m", "vs.services", "watch"], cwd=PKG, env=_env_for({"id": "gateway"}), stdout=lf,
                         stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, start_new_session=True)
    lf.close()
    return p.pid


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["up", "status", "link", "restart-tunnel", "report", "watch", "stop", "init"])
    ap.add_argument("--only", nargs="*")
    a = ap.parse_args()
    if a.cmd == "init":
        write_config(default_config())
        print(_p("services.json"))
    elif a.cmd == "up":
        res, st = up(a.only)
        print(json.dumps(res, ensure_ascii=False))
    elif a.cmd == "status":
        print(json.dumps(status(), indent=2, ensure_ascii=False))
    elif a.cmd == "link":
        print(link() or "sin túnel todavía (python -m vs.services up)")
    elif a.cmd == "restart-tunnel":
        st = load_state()
        stop("tunnel", st)
        save_state(st)
        res, st = up(["tunnel"])
        print(link() or res)
    elif a.cmd == "report":
        print(report())
    elif a.cmd == "watch":
        watch()
    elif a.cmd == "stop":
        st = load_state()
        for sid in a.only or ["tunnel", "gateway"]:
            stop(sid, st)
        save_state(st)


if __name__ == "__main__":
    main()
