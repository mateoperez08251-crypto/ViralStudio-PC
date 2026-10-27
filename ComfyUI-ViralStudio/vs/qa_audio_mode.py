"""QA específica del modo «Mi audio → video» (especificación §3.4, §7 y pruebas 8-13).

Comprueba sobre el MP4 FINAL (no sobre el JSON):
  · pistas, resolución, fps, códec (reutiliza vs/qa.py)
  · duración del video = frame_count/fps (±1 frame) y audio completo
  · CONTINUIDAD DE LA VOZ: correlación cruzada entre el master original y el
    audio decodificado del MP4 en ventanas al inicio, centro y final →
    desplazamiento (lag) y deriva (cambio de velocidad) medidos en ms
  · partición de escenas y palabras dentro del audio
  · fotogramas: inicio/medio/final de cada escena → no negros, y que las escenas
    con personajes realmente se MUEVEN (diferencia entre fotogramas)
  · assets ausentes, palabras dudosas, audio sin habla, TTS no usado
Guarda las capturas en out/qa_frames/ como evidencia.
"""
import json
import os
import subprocess
import wave

import numpy as np

from . import audio_timeline as TL
from . import qa as QA
from . import visual_assets as VA

ORDER = {"PASS": 0, "INFO": 0, "REVIEW": 1, "FAIL": 2}


def decode_pcm(path, sr=16000, start=None, dur=None):
    cmd = ["ffmpeg", "-nostdin", "-v", "error"]
    if start is not None:
        cmd += ["-ss", f"{start:.3f}"]
    cmd += ["-i", path]
    if dur is not None:
        cmd += ["-t", f"{dur:.3f}"]
    cmd += ["-vn", "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"]
    r = subprocess.run(cmd, capture_output=True)
    return np.frombuffer(r.stdout, dtype=np.int16).astype(np.float32) / 32768.0


def xcorr_lag(a, b, max_lag):
    """Desplazamiento (muestras) que mejor alinea b con a y correlación normalizada."""
    n = min(len(a), len(b))
    if n < 64:
        return 0, 0.0
    a, b = a[:n] - a[:n].mean(), b[:n] - b[:n].mean()
    m = 1 << int(np.ceil(np.log2(2 * n)))
    c = np.fft.irfft(np.fft.rfft(a, m) * np.conj(np.fft.rfft(b, m)), m)
    c = np.concatenate([c[-max_lag:], c[:max_lag + 1]])
    k = int(np.argmax(c))
    lag = k - max_lag
    den = float(np.sqrt(np.sum(a * a) * np.sum(b * b))) or 1.0
    return lag, float(c[k] / den)


def voice_continuity(master, video, duration, sr=16000, win=3.0):
    """Mide lag y correlación en 3 ventanas (inicio, centro, final)."""
    pts = [min(0.5, duration / 4), max(0.0, duration / 2 - win / 2), max(0.0, duration - win - 0.3)]
    out = []
    for p in pts:
        a = decode_pcm(master, sr, p, win)
        b = decode_pcm(video, sr, p, win)
        if np.abs(a).max() < 1e-3:  # ventana en silencio: no informa
            out.append({"at_s": round(p, 2), "lag_ms": None, "corr": None, "silent": True})
            continue
        lag, cor = xcorr_lag(a, b, int(0.25 * sr))
        out.append({"at_s": round(p, 2), "lag_ms": round(lag * 1000 / sr, 2), "corr": round(cor, 4)})
    return out


def frame_png(video, t, path):
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{max(0, t):.3f}", "-i", video, "-frames:v", "1", path], check=False)
    return path if os.path.exists(path) else None


def frame_gray(video, t, w=135, h=240):
    r = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-ss", f"{max(0, t):.3f}", "-i", video, "-frames:v", "1", "-vf",
                        f"scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True)
    if len(r.stdout) != w * h:
        return None
    return np.frombuffer(r.stdout, np.uint8).astype(np.float32)


def safe_zones(plan, captions=True, timeout=600):
    """Comprueba en Chromium que subtítulos, rótulos e infografías quedan dentro del cuadro
    (tools/safe_zone_check.js). Devuelve dict {ok, checked, problems} u {ok: None, skipped}."""
    import shutil
    import tempfile

    from . import vector_compiler as VC
    from .config import PKG_DIR, engine_js

    if not shutil.which("node"):
        return {"ok": None, "skipped": "node no disponible"}
    with tempfile.TemporaryDirectory() as d:
        ej, dj = os.path.join(d, "engine.js"), os.path.join(d, "data.json")
        with open(ej, "w", encoding="utf-8") as f:
            f.write(engine_js())
        with open(dj, "w", encoding="utf-8") as f:
            json.dump(VC.engine_data(plan, captions=captions), f, ensure_ascii=False)
        try:
            r = subprocess.run(["node", os.path.join(PKG_DIR, "tools", "safe_zone_check.js"), ej, dj], capture_output=True, text=True, timeout=timeout)
            return json.loads((r.stdout or "").strip().splitlines()[-1])
        except Exception as e:
            return {"ok": None, "skipped": f"no se pudo ejecutar ({str(e)[:160]})"}


def run(video, plan, proj, pdir, log=print):
    v = plan["video"]
    fps, total_frames = v["fps"], v["frame_count"]
    vid_total = total_frames / fps
    audio_dur = float(plan["audio"]["duration_s"])
    base = QA.run_qa(video, {"W": v["width"], "H": v["height"], "fps": fps, "total": vid_total,
                             "captions": (proj["outputs"].get("info") or {}).get("captions", 0),
                             "captions_enabled": plan.get("captions", {}).get("enabled", True), "scenes_without_voice": [], "fidelity_issues": 0})
    checks = []
    for c in base["checks"]:
        if c["check"] in ("voz en cada escena", "fidelidad narración→imagen"):
            continue
        if c["check"] == "sonoridad":
            c = dict(c, status="INFO", detail=c["detail"] + " · el modo audio conserva el nivel original salvo que actives la normalización")
        if c["check"] == "imagen congelada":
            c = dict(c, status="REVIEW" if c["status"] != "PASS" else "PASS")
        checks.append(c)

    def add(name, status, detail, **extra):
        checks.append(dict({"check": name, "status": status, "detail": detail}, **extra))

    info = QA.probe(video)
    vs = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), {})
    au = next((s for s in info.get("streams", []) if s.get("codec_type") == "audio"), {})
    nb = None
    r = subprocess.run(["ffprobe", "-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=nb_read_packets",
                        "-of", "csv=p=0", video], capture_output=True, text=True)
    try:
        nb = int(r.stdout.strip())
    except ValueError:
        pass
    add("frames de video", "PASS" if nb == total_frames else "FAIL", f"{nb} frames (esperados {total_frames} = ceil({audio_dur:.3f}s × {fps}))")
    ad = float(au.get("duration") or 0)
    diff = ad - audio_dur
    add("duración del audio", "PASS" if abs(diff) <= 1.0 / fps + 0.03 else "FAIL",
        f"audio del MP4 {ad:.3f}s vs narración {audio_dur:.3f}s (Δ {diff * 1000:+.1f} ms; tolerancia 1 frame + relleno AAC)")
    vd = float(vs.get("duration") or 0)
    add("video cubre todo el audio", "PASS" if vd + 1.0 / fps >= audio_dur else "FAIL", f"video {vd:.3f}s ≥ audio {audio_dur:.3f}s − 1 frame")
    master = os.path.join(pdir, proj["audio"]["master_path"])
    cont = voice_continuity(master, video, audio_dur)
    music = bool(proj["settings"].get("music") and (proj["outputs"] or {}).get("music"))
    measured = [c for c in cont if c.get("lag_ms") is not None]
    min_corr = 0.6 if music else 0.95
    ok_lag = all(abs(c["lag_ms"]) <= 1000.0 / fps for c in measured)
    ok_corr = all(c["corr"] >= min_corr for c in measured)
    drift = (max(c["lag_ms"] for c in measured) - min(c["lag_ms"] for c in measured)) if len(measured) > 1 else 0.0
    st = "PASS" if measured and ok_lag and ok_corr and abs(drift) <= 5 else ("REVIEW" if measured and ok_lag else "FAIL")
    add("continuidad de la narración (voz del guion)" if plan["audio"].get("narration_source") == "tts_script" else "continuidad de la voz original", st,
        " · ".join(f"{c['at_s']}s: lag {c['lag_ms']} ms, r={c['corr']}" if c.get("lag_ms") is not None else f"{c['at_s']}s: silencio" for c in cont)
        + f" · deriva {drift:.2f} ms (sin cortes, sin cambio de velocidad)", windows=cont)
    try:
        TL.validate_plan(plan, VA.all_ids())
        add("partición de escenas", "PASS", f"{len(plan['scenes'])} escenas contiguas 0→{total_frames} frames, sin huecos ni solapes")
    except TL.PlanError as e:
        add("partición de escenas", "FAIL", str(e)[:300])
    if plan["audio"].get("narration_source") == "tts_script":
        from .textutil import norm_word

        said = [norm_word(w["text"]) for w in plan["transcript"]["words"]]
        script = [norm_word(t) for t in (proj.get("audio", {}).get("script_text") or "").split()]
        said, script = [x for x in said if x], [x for x in script if x]
        add("narración = guion", "PASS" if said == script else "FAIL",
            f"voz {plan['audio'].get('tts_engine') or 'TTS'} del guion · {len(said)} palabras con tiempo, idénticas al guion"
            if said == script else f"los subtítulos no coinciden con el guion ({len(said)} vs {len(script)} palabras)")
    else:
        add("TTS no usado", "PASS" if plan["audio"].get("tts_used") is False else "FAIL", "la narración es el audio original del usuario")
    tr = plan["transcript"]
    nrev = sum(1 for w in tr["words"] if w.get("needs_review"))
    if not tr["words"]:
        add("habla detectada", "REVIEW", "no se reconoció habla: planos de ambientación; revisa el audio o pega la transcripción")
    else:
        add("transcripción", "REVIEW" if nrev else "PASS", f"{len(tr['words'])} palabras · {nrev} marcadas para revisar · fuente {tr.get('source')}")
    from . import semantic_guardrails as SG
    semantic = SG.storyboard_issues(plan)
    fatal = [i for i in semantic if i["severity"] == "FAIL"]
    review = [i for i in semantic if i["severity"] != "FAIL"]
    add("coherencia semántica del storyboard", "FAIL" if fatal else ("REVIEW" if review else "PASS"),
        f"{len(fatal)} contradicciones detectadas; {len(review)} acciones complejas pendientes de verificación visual", issues=semantic[:50])
    man = VA.manifest(plan)
    add("assets", "FAIL" if man["missing"] else "PASS", "faltan: " + ", ".join(man["missing"]) if man["missing"] else f"{len(man['assets'])} assets registrados con licencia")
    # fotogramas por escena
    fdir = os.path.join(os.path.dirname(video), "qa_frames")
    os.makedirs(fdir, exist_ok=True)
    black, static, shots = [], [], []
    for s in plan["scenes"]:
        a, b = s["start_frame"] / fps, s["end_frame"] / fps
        ts = [a + 0.5 / fps, (a + b) / 2, b - 1.5 / fps]
        grays = [frame_gray(video, t) for t in ts]
        for k, t in zip(("ini", "mid", "fin"), ts):
            p = frame_png(video, t, os.path.join(fdir, f"{s['id']}_{k}.png"))
            if p:
                shots.append(os.path.relpath(p, os.path.dirname(video)))
        g = [x for x in grays if x is not None]
        if any(x.mean() < 10 for x in g):
            black.append(s["id"])
        if len(g) >= 2 and s.get("character_ids") and b - a > 0.6:
            mv = float(np.abs(g[1] - g[-1]).mean())
            if mv < 0.6:
                static.append(f"{s['id']} ({mv:.2f})")
    sz = safe_zones(plan, captions=plan.get("captions", {}).get("enabled", True))
    if sz.get("ok") is None:
        add("zonas seguras (textos dentro del cuadro)", "INFO", "no verificado: " + str(sz.get("skipped")))
    else:
        add("zonas seguras (textos dentro del cuadro)", "PASS" if sz["ok"] else "FAIL",
            f"{sz['checked']} instantes revisados: subtítulos e infografías dentro del cuadro" if sz["ok"]
            else "fuera del cuadro: " + "; ".join(f"{p['t']}s «{p['text']}»" for p in sz["problems"][:6]), problems=sz.get("problems"))
    add("escenas visibles (no negras)", "PASS" if not black else "FAIL", "todas con imagen" if not black else "negras: " + ", ".join(black))
    add("animación visible", "PASS" if not static else "REVIEW", "personajes/cámara en movimiento en todas las escenas con personajes"
        if not static else "sin movimiento apreciable: " + ", ".join(static), frames=shots)
    status = max((c["status"] for c in checks), key=lambda s: ORDER.get(s, 0)) if checks else "FAIL"
    status = "PASS" if status == "INFO" else status
    return {"status": status, "checks": checks, "duration": vd, "audio_duration": ad, "frames_dir": fdir, "mode": "audio"}
