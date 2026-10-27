"""Transcripción con tiempos por palabra para el modo «Mi audio → video».

  · transcribe(): lanza tts_worker/asr_worker.py (faster-whisper, VAD Silero,
    WhisperX y pyannote opcionales) en el entorno de voz, con progreso,
    cancelación y caché por hash del audio + parámetros.
  · normalize_words(): ids estables, tiempos absolutos ordenados dentro de
    [0, duración], palabras dudosas marcadas `needs_review`.
  · manual_transcript(): sin ASR, el usuario pega el texto y los tiempos se
    ESTIMAN sobre las zonas con voz (todas marcadas para revisión).
  · apply_text_edit(): corrige el texto conservando los tiempos (nunca se
    falsifica un tiempo: palabras nuevas heredan/interpolan y quedan marcadas).
"""
import difflib
import hashlib
import json
import os
import subprocess
import tempfile

from .config import PKG_DIR, settings, tts_python, worker_env
from .errors import VSError
from .textutil import norm_word, syllables_es

WORKER = os.path.join(PKG_DIR, "tts_worker", "asr_worker.py")
REVIEW_CONF = 0.5


def cache_key(sha, params):
    return hashlib.sha256((sha + json.dumps(params, sort_keys=True)).encode()).hexdigest()[:20]


def asr_params(cfg):
    s = settings()
    return {
        "model": cfg.get("asr_model") or s.get("asr_model") or s.get("whisper_model") or "large-v3-turbo",
        "language": (cfg.get("language") if cfg.get("language") not in (None, "", "auto") else "auto"),
        "vad": bool(cfg.get("asr_vad", s.get("asr_vad", True))),
        "vad_min_silence_ms": int(s.get("asr_vad_min_silence_ms", 500)),
        "align": cfg.get("asr_align") or s.get("asr_align", "auto"),
        "diarize": bool(cfg.get("diarize", s.get("diarization", False))),
        "device": s.get("asr_device", "auto"),
        "compute_type": s.get("asr_compute_type", "auto"),
        "cpu_downgrade": bool(s.get("asr_cpu_downgrade", True)),
    }


def transcribe(audio16k, sha, cfg, cache_dir, progress=None, log=print, cancel=None):
    """Devuelve el resultado crudo del worker (con caché)."""
    params = asr_params(cfg)
    os.makedirs(cache_dir, exist_ok=True)
    key = cache_key(sha, params)
    cpath = os.path.join(cache_dir, f"asr_{key}.json")
    if os.path.exists(cpath):
        log(f"[asr] transcripción en caché ({key})")
        with open(cpath, encoding="utf-8") as f:
            return json.load(f)
    if params["device"] != "cpu":
        try:  # el LLM de ComfyUI puede ocupar casi toda la VRAM: se descarga antes de transcribir
            from . import comfy_api

            comfy_api.free(True)
        except Exception:
            pass
    job = dict(params, audio=audio16k, hf_token_env="HF_TOKEN")
    fd, jp = tempfile.mkstemp(suffix=".json", dir=cache_dir)
    os.close(fd)
    job["result"] = jp.replace(".json", ".result.json")
    with open(jp, "w", encoding="utf-8") as f:
        json.dump(job, f)
    py = tts_python()
    env = worker_env(py)
    try:
        rc, tail = _run_worker(py, jp, env, progress, log, cancel)
        if rc != 0 and params["device"] != "cpu" and not any(l.startswith("ERROR ModuleNotFoundError") for l in tail):
            # el proceso murió en la GPU (p. ej. cuDNN aborta sin excepción de Python): se repite en CPU
            log("[asr] la transcripción en GPU falló: " + _err_line(tail) + " · repito en CPU")
            with open(jp, "w", encoding="utf-8") as f:
                json.dump(dict(job, device="cpu", compute_type="int8"), f)
            rc, tail = _run_worker(py, jp, env, progress, log, cancel)
    finally:
        try:
            os.remove(jp)
        except OSError:
            pass
    if rc != 0 or not os.path.exists(job["result"]):
        txt = "\n".join(tail[-15:])
        if "No module named" in txt:
            raise VSError("MODEL_UNAVAILABLE", "faster-whisper no está instalado en el entorno de voz/ASR "
                          "(pip install faster-whisper soundfile). También puedes pegar la transcripción a mano.\n" + txt)
        raise VSError("ASR_FAILED", "La transcripción falló: " + _err_line(tail) + "\n\nÚltimas líneas del registro:\n" + txt)
    os.replace(job["result"], cpath)
    with open(cpath, encoding="utf-8") as f:
        res = json.load(f)
    log(f"[asr] {res.get('engine')} {res.get('model')} ({res.get('device')}) · idioma {res.get('language')} "
        f"({res.get('language_probability')}) · {len(res.get('words', []))} palabras en {res.get('seconds')}s")
    return res


def _err_line(tail):
    """La línea que explica el fallo (no el principio de la traza)."""
    for l in reversed(tail):
        if l.startswith("ERROR "):
            return l[6:]
    for l in reversed(tail):
        t = l.strip()
        if t and not t.startswith(("File ", "^", "~", "Traceback", "PROGRESS", "LOG")) and ("Error" in t or "error" in t or ":" in t):
            return t[:400]
    return (tail[-1].strip() if tail else "el proceso terminó sin mensaje")[:400] or "el proceso terminó sin mensaje"


def _run_worker(py, jp, env, progress, log, cancel):
    try:
        p = subprocess.Popen([py, WORKER, jp], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, env=env)
    except FileNotFoundError:
        raise VSError("MODEL_UNAVAILABLE", f"No existe el intérprete del entorno de voz/ASR ({py}).")
    tail = []
    try:
        for line in p.stdout:
            line = line.rstrip()
            tail = (tail + [line])[-40:]
            if line.startswith("PROGRESS"):
                parts = line.split(" ", 3)
                try:
                    if progress:
                        progress(int(parts[1]) / max(1, int(parts[2])), parts[3] if len(parts) > 3 else "")
                except Exception:
                    pass
            elif line.startswith("LOG"):
                log("[asr] " + line[4:])
            elif line.startswith(("ERROR", "Traceback", "RuntimeError", "  File")) or "Error" in line:
                log("[asr] " + line)
            if cancel and cancel():
                p.kill()
                raise RuntimeError("Cancelado")
        p.wait()
    finally:
        if p.poll() is None:
            p.kill()
    return p.returncode, tail


def normalize_words(words, duration):
    """Ids estables w0001…, orden, sin solapes, dentro de [0, duración]."""
    out, last = [], 0.0
    for i, w in enumerate(sorted(words, key=lambda x: (float(x["start_s"]), float(x["end_s"])))):
        s = max(0.0, min(float(w["start_s"]), duration))
        e = max(0.0, min(float(w["end_s"]), duration))
        s = max(s, last)
        if e <= s:
            e = min(duration, s + 0.02)
        if e <= s:  # palabra pegada al final del audio
            continue
        conf = w.get("confidence")
        rev = bool(w.get("needs_review")) or (conf is not None and conf < REVIEW_CONF) or (e - s) > 3.0
        nw = {"id": f"w{len(out) + 1:04d}", "text": w["text"], "start_s": round(s, 3), "end_s": round(e, 3),
              "confidence": conf, "needs_review": rev}
        for k in ("speaker", "edited", "timing", "emph", "scene_src"):
            if w.get(k) is not None:
                nw[k] = w[k]
        out.append(nw)
        last = e
    return out


def build_transcript(raw, duration, source="asr"):
    words = normalize_words(raw.get("words", []), duration)
    return {
        "schema_version": 1, "source": source, "language": raw.get("language"),
        "language_probability": raw.get("language_probability"), "engine": raw.get("engine"), "model": raw.get("model"),
        "device": raw.get("device"), "alignment": raw.get("alignment"), "diarization": raw.get("diarization"),
        "duration_s": duration, "text": " ".join(w["text"] for w in words), "words": words,
        "segments": raw.get("segments", []),
        "review_count": sum(1 for w in words if w["needs_review"]),
        "needs_review": any(w["needs_review"] for w in words),
        "no_speech": not words,
    }


def _voiced_regions(duration, silences):
    regs, t = [], 0.0
    for a, b in sorted(silences or []):
        if a > t:
            regs.append([t, a])
        t = max(t, b)
    if t < duration:
        regs.append([t, duration])
    return [r for r in regs if r[1] - r[0] > 0.05] or [[0.0, duration]]


def manual_transcript(text, duration, silences, language=None):
    """Transcripción pegada por el usuario cuando no hay ASR: los tiempos se
    reparten por sílabas sobre las zonas con voz. TODO queda `needs_review`
    y `timing: estimated` (no se presenta como reconocimiento real)."""
    toks = [t for t in (text or "").split() if t.strip()]
    if not toks:
        raise VSError("INPUT_INVALID", "La transcripción manual está vacía.")
    regs = _voiced_regions(duration, silences)
    total = sum(b - a for a, b in regs)
    syl = [syllables_es(t) + (1.2 if t[-1:] in ".,;:!?" else 0) for t in toks]
    unit = total / max(1e-6, sum(syl))
    words, ri, cur = [], 0, regs[0][0]
    for tok, n in zip(toks, syl):
        d = n * unit
        while ri < len(regs) and cur + d * 0.5 > regs[ri][1]:
            ri += 1
            if ri < len(regs):
                cur = max(cur, regs[ri][0])
        if ri >= len(regs):
            ri = len(regs) - 1
        s, e = cur, min(duration, cur + d * 0.92)
        words.append({"text": tok, "start_s": s, "end_s": max(e, s + 0.02), "confidence": None, "needs_review": True, "timing": "estimated"})
        cur += d
    tr = build_transcript({"words": words, "language": language, "engine": "manual"}, duration, source="manual_estimated")
    return tr


def apply_text_edit(transcript, new_text=None, word_edits=None):
    """Corrige el texto sin tocar el audio ni falsificar tiempos.
    · word_edits={id: "texto"}: cambia el texto de palabras concretas (mismo tiempo).
    · new_text: texto completo nuevo; se alinea con difflib a las palabras con
      tiempo. Palabras iguales conservan su tiempo; las cambiadas/insertadas
      reparten el hueco de las que sustituyen y quedan marcadas."""
    tr = json.loads(json.dumps(transcript))
    words = tr["words"]
    if word_edits:
        byid = {w["id"]: w for w in words}
        for wid, txt in word_edits.items():
            if wid in byid and isinstance(txt, str) and txt.strip() and txt.strip() != byid[wid]["text"]:
                byid[wid]["text"] = txt.strip()
                byid[wid]["edited"] = True
                byid[wid]["needs_review"] = False
    if new_text is not None:
        toks = new_text.split()
        a = [norm_word(w["text"]) for w in words]
        b = [norm_word(t) for t in toks]
        sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
        out = []
        for op, i1, i2, j1, j2 in sm.get_opcodes():
            if op == "equal":
                for k in range(i2 - i1):
                    w = dict(words[i1 + k])
                    w["text"] = toks[j1 + k]  # conserva mayúsculas/puntuación del usuario
                    out.append(w)
            elif op in ("replace", "insert"):
                if i2 > i1:
                    t0, t1 = words[i1]["start_s"], words[i2 - 1]["end_s"]
                else:  # inserción pura: hueco entre vecinas
                    t0 = words[i1 - 1]["end_s"] if i1 > 0 else 0.0
                    t1 = words[i1]["start_s"] if i1 < len(words) else tr["duration_s"]
                    if t1 - t0 < 0.05 * (j2 - j1):  # sin hueco: se comparte la palabra vecina
                        t0 = words[i1 - 1]["start_s"] if i1 > 0 else t0
                n = j2 - j1
                for k in range(n):
                    s = t0 + (t1 - t0) * k / n
                    e = t0 + (t1 - t0) * (k + 1) / n
                    out.append({"id": "", "text": toks[j1 + k], "start_s": round(s, 3), "end_s": round(max(e, s + 0.02), 3),
                                "confidence": None, "needs_review": True, "edited": True, "timing": "interpolated"})
            # "delete": las palabras borradas desaparecen de los subtítulos; el audio no cambia
        words = out
    tr["words"] = normalize_words(words, tr["duration_s"])
    tr["text"] = " ".join(w["text"] for w in tr["words"])
    tr["source"] = "edited"
    tr["review_count"] = sum(1 for w in tr["words"] if w["needs_review"])
    tr["needs_review"] = tr["review_count"] > 0
    tr["no_speech"] = not tr["words"]
    return tr
