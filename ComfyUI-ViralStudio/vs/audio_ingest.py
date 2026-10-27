"""Ingesta de la narración del usuario (modo «Mi audio → video»).

Reglas (especificación §3.1):
  · se valida DECODIFICANDO con ffprobe/ffmpeg, nunca por extensión ni MIME;
  · el archivo original se guarda tal cual (mismos bytes) con nombre generado
    por el sistema, nunca con el nombre que manda el cliente;
  · de él salen dos derivados: analysis_16k.wav (mono 16 kHz, solo para ASR)
    y source_voice_master.wav (PCM 48 kHz, la pista que suena en el video);
  · la duración del proyecto es la del master decodificado (muestras / 48000);
  · todo se ejecuta con listas de argumentos (sin shell) y escrituras atómicas.
"""
import hashlib
import json
import math
import os
import re
import subprocess
import time
import wave

import numpy as np

from .errors import VSError

MASTER_SR = 48000
ANALYSIS_SR = 16000
# contenedores que ffprobe reconoce como audio/video admitidos (tras decodificar)
ALLOWED_FORMATS = {"mp3", "wav", "flac", "ogg", "aac", "mov,mp4,m4a,3gp,3g2,mj2", "matroska,webm", "adts", "aiff", "caf"}
VIDEO_FORMATS = {"mov,mp4,m4a,3gp,3g2,mj2", "matroska,webm"}


def _run(cmd, timeout=900):
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return r


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def probe(path):
    """ffprobe en JSON. Lanza VSError(INPUT_INVALID) si no es un medio legible."""
    r = _run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", path], timeout=120)
    try:
        info = json.loads(r.stdout or "{}")
    except json.JSONDecodeError:
        info = {}
    if r.returncode != 0 or not info.get("format"):
        raise VSError("INPUT_INVALID", "El archivo no es un audio válido (ffprobe no pudo leerlo): " + (r.stderr or "")[-300:].strip())
    return info


def summarize(info):
    fmt = info.get("format") or {}
    a = next((s for s in info.get("streams", []) if s.get("codec_type") == "audio"), None)
    v = next((s for s in info.get("streams", []) if s.get("codec_type") == "video" and
              not (s.get("disposition") or {}).get("attached_pic")), None)
    return {
        "format_name": fmt.get("format_name"),
        "duration_s": float(fmt.get("duration") or (a or {}).get("duration") or 0),
        "size_bytes": int(fmt.get("size") or 0),
        "bit_rate": int(fmt.get("bit_rate") or 0),
        "has_audio": bool(a),
        "has_video": bool(v),
        "codec": (a or {}).get("codec_name"),
        "sample_rate": int((a or {}).get("sample_rate") or 0),
        "channels": int((a or {}).get("channels") or 0),
    }


def validate(info, limits):
    """Comprueba pista de audio, formato y límites configurables. Devuelve el resumen."""
    s = summarize(info)
    if not s["has_audio"]:
        raise VSError("INPUT_INVALID", "El archivo no contiene ninguna pista de audio.")
    if s["format_name"] not in ALLOWED_FORMATS:
        raise VSError("INPUT_INVALID", f"Formato no admitido ({s['format_name']}). Usa MP3, WAV, M4A, FLAC, OGG, AAC o un MP4/MOV con audio.")
    if s["format_name"] in VIDEO_FORMATS and s["has_video"] and not limits.get("allow_video", True):
        raise VSError("INPUT_INVALID", "Se recibió un video; activa «extraer audio de video» o sube solo el audio.")
    max_s = float(limits.get("max_seconds") or 1800)
    if s["duration_s"] and s["duration_s"] > max_s:
        raise VSError("INPUT_INVALID", f"El audio dura {s['duration_s']:.0f} s y el límite configurado es {max_s:.0f} s (ajuste audio_max_seconds).")
    return s


def decode(src, dst, sr, channels, timeout=1800):
    """Decodifica a WAV PCM 16 bits. Escribe en .tmp y renombra (atómico)."""
    tmp = dst + ".tmp.wav"
    cmd = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-map", "0:a:0", "-vn", "-sn", "-dn",
           "-ac", str(channels), "-ar", str(sr), "-c:a", "pcm_s16le", tmp]
    r = _run(cmd, timeout=timeout)
    if r.returncode != 0 or not os.path.exists(tmp):
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise VSError("INPUT_INVALID", "No se pudo decodificar el audio: " + (r.stderr or "")[-400:].strip())
    os.replace(tmp, dst)
    return dst


def wav_info(path):
    with wave.open(path, "rb") as w:
        return {"sample_rate": w.getframerate(), "channels": w.getnchannels(), "frames": w.getnframes(),
                "duration_s": w.getnframes() / float(w.getframerate())}


def read_mono(path):
    """float32 mono de un WAV PCM16 (promedia canales)."""
    with wave.open(path, "rb") as w:
        ch, n = w.getnchannels(), w.getnframes()
        x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    return x


def loudness_stats(x, sr):
    """Pico, RMS y fracción de ventanas con señal (para detectar archivos mudos)."""
    if not len(x):
        return {"peak_db": -120.0, "rms_db": -120.0, "active_ratio": 0.0}
    peak = float(np.abs(x).max())
    rms = float(np.sqrt(np.mean(x.astype(np.float64) ** 2)))
    win = max(1, int(0.05 * sr))
    n = len(x) // win
    if n:
        e = np.sqrt(np.mean(x[: n * win].reshape(n, win).astype(np.float64) ** 2, axis=1))
        active = float(np.mean(e > 10 ** (-45 / 20)))
    else:
        active = 0.0
    db = lambda v: round(20 * math.log10(max(v, 1e-6)), 1)
    return {"peak_db": db(peak), "rms_db": db(rms), "active_ratio": round(active, 3)}


def waveform_peaks(x, buckets=1600):
    """Picos min/max por cubeta para dibujar la forma de onda en el Studio."""
    if not len(x):
        return []
    buckets = max(1, min(buckets, len(x)))
    edges = np.linspace(0, len(x), buckets + 1).astype(int)
    out = []
    for a, b in zip(edges[:-1], edges[1:]):
        seg = x[a:max(b, a + 1)]
        out.append([round(float(seg.min()), 3), round(float(seg.max()), 3)])
    return out


def silence_regions(x, sr, thr_db=-40.0, min_len=0.35):
    """Silencios (en segundos absolutos del audio) por energía en ventanas de 20 ms."""
    win = max(1, int(0.02 * sr))
    n = len(x) // win
    if not n:
        return []
    e = np.sqrt(np.mean(x[: n * win].reshape(n, win).astype(np.float64) ** 2, axis=1))
    quiet = e < 10 ** (thr_db / 20)
    out, start = [], None
    for i, q in enumerate(quiet):
        if q and start is None:
            start = i
        elif not q and start is not None:
            if (i - start) * win / sr >= min_len:
                out.append([round(start * win / sr, 3), round(i * win / sr, 3)])
            start = None
    if start is not None and (n - start) * win / sr >= min_len:
        out.append([round(start * win / sr, 3), round(n * win / sr, 3)])
    return out


def safe_display_name(name):
    """Nombre solo para mostrar (nunca se usa como ruta)."""
    from urllib.parse import unquote

    raw = unquote(str(name or "audio")).replace("\\", "/")
    base = os.path.basename(raw).replace("\x00", "")
    base = re.sub(r"[^\w.\- ()áéíóúñÁÉÍÓÚÑüÜ]", "_", base)[:120]
    return base or "audio"


def ingest(proj_dir, tmp_path, original_name, limits):
    """Valida y guarda la narración subida. `tmp_path` es el archivo recibido por
    streaming (dentro del proyecto). Devuelve el bloque `audio` del proyecto.
    Si algo falla, borra lo temporal y deja el proyecto como estaba."""
    adir = os.path.join(proj_dir, "audio")
    os.makedirs(os.path.join(adir, "source"), exist_ok=True)
    try:
        info = probe(tmp_path)
        summ = validate(info, limits)
        digest = sha256_file(tmp_path)
        ext = {"mp3": "mp3", "wav": "wav", "flac": "flac", "ogg": "ogg", "aac": "aac", "adts": "aac", "aiff": "aiff", "caf": "caf",
               "matroska,webm": "webm", "mov,mp4,m4a,3gp,3g2,mj2": "mp4" if summ["has_video"] else "m4a"}.get(summ["format_name"], "bin")
        work = os.path.join(adir, ".work_" + digest[:12])
        os.makedirs(work, exist_ok=True)
        master_ch = 2 if summ["channels"] >= 2 else 1
        master = decode(tmp_path, os.path.join(work, "source_voice_master.wav"), MASTER_SR, master_ch)
        analysis = decode(tmp_path, os.path.join(work, "analysis_16k.wav"), ANALYSIS_SR, 1)
        mi = wav_info(master)
        x16 = read_mono(analysis)
        stats = loudness_stats(x16, ANALYSIS_SR)
        if stats["peak_db"] < -60 or stats["active_ratio"] < 0.005:
            raise VSError("INPUT_INVALID", f"El audio está en silencio o es inaudible (pico {stats['peak_db']} dBFS). Revisa el archivo.")
        if mi["duration_s"] < 0.5:
            raise VSError("INPUT_INVALID", "El audio dura menos de medio segundo.")
        if mi["duration_s"] > float(limits.get("max_seconds") or 1800) + 1:
            raise VSError("INPUT_INVALID", f"El audio decodificado dura {mi['duration_s']:.0f} s: supera el límite configurado.")
        wf = waveform_peaks(read_mono(master), 2000)
        with open(os.path.join(work, "waveform.json"), "w") as f:
            json.dump({"duration_s": mi["duration_s"], "peaks": wf}, f, separators=(",", ":"))
        # todo correcto: se publica de golpe (renombres atómicos dentro del mismo disco)
        orig = os.path.join(adir, "source", "original." + ext)
        for old in os.listdir(os.path.join(adir, "source")):
            os.remove(os.path.join(adir, "source", old))
        os.replace(tmp_path, orig)
        for fn in ("source_voice_master.wav", "analysis_16k.wav", "waveform.json"):
            os.replace(os.path.join(work, fn), os.path.join(adir, fn))
        os.rmdir(work)
    except Exception:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except OSError:
            pass
        raise
    meta = {
        "original_name": safe_display_name(original_name),
        "original_path": os.path.relpath(orig, proj_dir),
        "master_path": "audio/source_voice_master.wav",
        "analysis_path": "audio/analysis_16k.wav",
        "waveform_path": "audio/waveform.json",
        "sha256": digest,
        "size_bytes": os.path.getsize(orig),
        "probe": summ,
        "duration_s": round(mi["duration_s"], 6),
        "sample_rate": MASTER_SR,
        "channels": mi["channels"],
        "source_sample_rate": summ["sample_rate"],
        "source_channels": summ["channels"],
        "loudness": stats,
        "silences": silence_regions(x16, ANALYSIS_SR),
        "extracted_from_video": bool(summ["has_video"]),
        "uploaded_at": time.time(),
    }
    with open(os.path.join(adir, "source_meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    return meta
