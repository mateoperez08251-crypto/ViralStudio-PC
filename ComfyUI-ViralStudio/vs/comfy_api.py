"""Cliente mínimo de la API de ComfyUI (cola /prompt, /history, /free).
El orquestador corre en un hilo aparte dentro del propio servidor de ComfyUI y
manda los flujos (LLM, música) a la cola como cualquier otro trabajo."""
import json
import os
import time
import urllib.error
import urllib.request
import uuid

from .config import comfy_url


def _req(path, data=None, timeout=30):
    url = comfy_url().rstrip("/") + path
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"} if body else {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        txt = r.read().decode()
        return json.loads(txt) if txt else {}


def alive():
    try:
        _req("/system_stats", timeout=5)
        return True
    except Exception:
        return False


def system_stats():
    try:
        return _req("/system_stats", timeout=5)
    except Exception:
        return {}


def object_info(node=None):
    return _req("/object_info" + (f"/{node}" if node else ""), timeout=60)


def free(unload=True):
    try:
        _req("/free", {"unload_models": unload, "free_memory": True})
    except Exception:
        pass


_OBJ = {"t": 0, "info": None}


def validate(prompt):
    """Comprueba que todos los class_type existen en /object_info (Guía V2 §6)
    antes de mandar nada a la cola."""
    import time as _t

    if not _OBJ["info"] or _t.time() - _OBJ["t"] > 300:
        _OBJ["info"] = object_info()
        _OBJ["t"] = _t.time()
    missing = sorted({n.get("class_type", "?") for n in prompt.values() if n.get("class_type") not in _OBJ["info"]})
    if missing:
        from .errors import VSError

        raise VSError("NODE_MISSING", "ComfyUI no tiene estos nodos (falta nodo): " + ", ".join(missing))
    return True


def queue(prompt, client_id=None):
    validate(prompt)
    try:
        r = _req("/prompt", {"prompt": prompt, "client_id": client_id or "viralstudio-" + uuid.uuid4().hex[:8]})
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="ignore")
        raise RuntimeError(f"ComfyUI rechazó el flujo: {detail[:1500]}")
    if r.get("node_errors"):
        raise RuntimeError("Errores en el flujo: " + json.dumps(r["node_errors"])[:1500])
    return r["prompt_id"]


def wait(prompt_id, timeout=3600, cancel=None, tick=None):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if cancel and cancel():
            interrupt()
            raise RuntimeError("Cancelado")
        try:
            h = _req(f"/history/{prompt_id}", timeout=30)
        except Exception:
            h = {}
        if prompt_id in h:
            item = h[prompt_id]
            st = item.get("status", {})
            if st.get("status_str") == "error":
                msgs = [m for m in st.get("messages", []) if m and m[0] == "execution_error"]
                err = msgs[0][1].get("exception_message", "error") if msgs else "error"
                raise RuntimeError("ComfyUI: " + str(err)[:1500])
            if st.get("completed", True) or item.get("outputs"):
                return item.get("outputs", {})
        if tick:
            tick(time.time() - t0)
        time.sleep(1.0)
    raise TimeoutError("ComfyUI tardó demasiado")


def run(prompt, timeout=3600, cancel=None, tick=None):
    return wait(queue(prompt), timeout=timeout, cancel=cancel, tick=tick)


def interrupt():
    try:
        _req("/interrupt", {})
    except Exception:
        pass


def output_path(fileinfo):
    """Ruta en disco de un archivo de salida {filename, subfolder, type}."""
    try:
        import folder_paths

        base = folder_paths.get_output_directory() if fileinfo.get("type", "output") == "output" else folder_paths.get_temp_directory()
    except Exception:
        base = os.environ.get("VS_COMFY_OUTPUT", "output")
    return os.path.join(base, fileinfo.get("subfolder", ""), fileinfo["filename"])


_LOADERS = {"text_encoders": ("CLIPLoader", "clip_name"), "checkpoints": ("CheckpointLoaderSimple", "ckpt_name")}


def list_models(folder):
    """Modelos instalados. Dentro de ComfyUI usa folder_paths; fuera (modo
    independiente) los pregunta a la API /object_info del cargador."""
    try:
        import folder_paths

        return folder_paths.get_filename_list(folder)
    except Exception:
        pass
    node, field = _LOADERS.get(folder, (None, None))
    if not node:
        return []
    try:
        info = object_info(node)[node]["input"]["required"][field]
        opts = info[0] if isinstance(info[0], list) else (info[1] or {}).get("options", [])
        return list(opts)
    except Exception:
        return []
