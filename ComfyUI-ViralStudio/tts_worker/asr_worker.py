"""Worker de transcripción de Viral Studio (modo «Mi audio → video»).

Se ejecuta en el mismo entorno aislado que la voz (VS_TTS_PYTHON), donde ya
están faster-whisper y soundfile. NO sintetiza nada: solo escucha el audio.

Uso:  python asr_worker.py job.json
job.json = {
  "audio": "/ruta/analysis_16k.wav",          # mono 16 kHz (lo crea vs/audio_ingest.py)
  "model": "large-v3-turbo" | "small" | ruta CT2,
  "device": "auto" | "cpu" | "cuda", "compute_type": "auto",
  "language": "auto" | "es" | ...,
  "vad": true, "vad_min_silence_ms": 500,
  "align": "auto" | "whisperx" | "none",       # refinamiento opcional
  "diarize": false, "hf_token_env": "HF_TOKEN",  # pyannote Community-1 opcional
  "result": "/ruta/result.json"
}
Imprime "PROGRESS i n texto" y "LOG texto". Los tiempos de palabra son SIEMPRE
absolutos respecto al archivo completo (faster-whisper restaura los offsets del VAD).
"""
import gc
import json
import os
import sys
import time
import traceback

import numpy as np
import soundfile as sf


def say(*a):
    print(*a, flush=True)


def load16k(path):
    x, sr = sf.read(path, dtype="float32")
    if x.ndim > 1:
        x = x.mean(axis=1)
    if sr != 16000:
        n = int(len(x) * 16000 / sr)
        x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)
    return x


def pick_device(job):
    dev = job.get("device") or "auto"
    if dev == "auto":
        try:
            import ctranslate2

            dev = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        except Exception:
            dev = "cpu"
    ct = job.get("compute_type") or "auto"
    if ct == "auto":
        ct = "float16" if dev == "cuda" else "int8"
    return dev, ct


def transcribe(job, audio):
    """Transcribe en GPU si hay; si la GPU falla (librerías CUDA/cuDNN que CTranslate2 no encuentra,
    memoria ocupada por otro modelo…) repite en CPU en lugar de abortar."""
    dev, _ = pick_device(job)
    if dev != "cpu":
        try:
            return _transcribe(job, audio)
        except Exception as e:
            msg = f"{type(e).__name__}: {str(e).strip()[:300]}"
            say(f"LOG la GPU falló al transcribir ({msg}); repito en CPU")
            gc.collect()
            res = _transcribe(dict(job, device="cpu", compute_type="int8"), audio)
            res["gpu_error"] = msg
            return res
    return _transcribe(job, audio)


def _transcribe(job, audio):
    from faster_whisper import WhisperModel

    dev, ct = pick_device(job)
    name = job.get("model") or "large-v3-turbo"
    if dev == "cpu" and job.get("cpu_downgrade", True) and "large" in name:
        say(f"LOG sin GPU: {name} sería muy lento en CPU; uso 'small' (ajuste asr_cpu_downgrade)")
        name = "small"
    say(f"LOG cargando faster-whisper {name} ({dev}, {ct})")
    model = WhisperModel(name, device=dev, compute_type=ct)
    lang = job.get("language") or "auto"
    kw = dict(word_timestamps=True, beam_size=int(job.get("beam_size", 5)), condition_on_previous_text=False,
              vad_filter=bool(job.get("vad", True)))
    if kw["vad_filter"]:
        kw["vad_parameters"] = {"min_silence_duration_ms": int(job.get("vad_min_silence_ms", 500))}
    if lang != "auto":
        kw["language"] = lang
    segs, info = model.transcribe(audio, **kw)
    dur = max(1e-6, float(info.duration))
    words, segments = [], []
    for s in segs:
        sw = []
        for w in s.words or []:
            tok = (w.word or "").strip()
            if not tok:
                continue
            sw.append({"text": tok, "start_s": round(float(w.start), 3), "end_s": round(float(w.end), 3),
                       "confidence": round(float(w.probability), 3)})
        segments.append({"start_s": round(float(s.start), 3), "end_s": round(float(s.end), 3), "text": s.text.strip(),
                         "avg_logprob": round(float(s.avg_logprob), 3), "no_speech_prob": round(float(s.no_speech_prob), 3),
                         "n_words": len(sw)})
        words += sw
        say(f"PROGRESS {int(min(dur, s.end) * 100)} {int(dur * 100)} Transcribiendo {s.end:.0f}/{dur:.0f}s")
    out = {"engine": "faster-whisper", "model": name, "device": dev, "compute_type": ct,
           "language": info.language, "language_probability": round(float(info.language_probability), 3),
           "duration": round(dur, 3), "vad": kw["vad_filter"], "words": words, "segments": segments}
    del model
    gc.collect()
    return out


def refine_whisperx(job, audio, res):
    """Alineación fonética opcional con WhisperX (si está instalado y hay modelo
    para el idioma). Si falla, se conservan los tiempos de faster-whisper."""
    mode = job.get("align") or "auto"
    if mode == "none":
        return {"method": "faster-whisper", "note": "refinamiento desactivado"}
    try:
        import whisperx  # noqa: F401
    except Exception:
        note = "WhisperX no está instalado: se usan los tiempos de faster-whisper"
        return {"method": "faster-whisper", "note": note}
    try:
        import whisperx

        dev, _ = pick_device(job)
        am, meta = whisperx.load_align_model(language_code=res["language"], device=dev)
        segs = [{"start": s["start_s"], "end": s["end_s"], "text": s["text"]} for s in res["segments"] if s["text"]]
        al = whisperx.align(segs, am, meta, audio, dev, return_char_alignments=False)
        new = []
        for s in al.get("segments", []):
            for w in s.get("words", []):
                if "start" in w and "end" in w and w.get("word", "").strip():
                    new.append({"text": w["word"].strip(), "start_s": round(float(w["start"]), 3), "end_s": round(float(w["end"]), 3),
                                "confidence": round(float(w.get("score", 0.0)), 3)})
        if len(new) >= 0.9 * len(res["words"]):
            res["words"] = new
            return {"method": "whisperx", "note": f"alineación fonética ({meta.get('language', res['language'])})"}
        return {"method": "faster-whisper", "note": "WhisperX perdió palabras; se conservan los tiempos originales"}
    except Exception as e:
        return {"method": "faster-whisper", "note": f"WhisperX no disponible para este idioma/modelo ({str(e)[:160]})"}


def diarize(job, res):
    if not job.get("diarize"):
        return {"method": "single", "speakers": ["narrador"], "note": "narrador único"}
    token = os.environ.get(job.get("hf_token_env") or "HF_TOKEN")
    try:
        from pyannote.audio import Pipeline
    except Exception:
        return {"method": "single", "speakers": ["narrador"], "note": "pyannote.audio no instalado: narrador único"}
    if not token:
        return {"method": "single", "speakers": ["narrador"],
                "note": "falta HF_TOKEN o no aceptaste las condiciones de pyannote/speaker-diarization-community-1: narrador único"}
    try:
        import torch

        pipe = Pipeline.from_pretrained("pyannote/speaker-diarization-community-1", token=token)
        if torch.cuda.is_available():
            pipe.to(torch.device("cuda"))
        x = load16k(job["audio"])
        out = pipe({"waveform": torch.from_numpy(x)[None, :], "sample_rate": 16000})
        ann = getattr(out, "speaker_diarization", out)
        turns = [(float(t.start), float(t.end), spk) for t, _, spk in ann.itertracks(yield_label=True)]
        for w in res["words"]:
            mid = (w["start_s"] + w["end_s"]) / 2
            best = min(turns, key=lambda tr: 0 if tr[0] <= mid <= tr[1] else min(abs(mid - tr[0]), abs(mid - tr[1])), default=None)
            w["speaker"] = best[2] if best else "SPEAKER_00"
        spk = sorted({w.get("speaker") for w in res["words"] if w.get("speaker")})
        return {"method": "pyannote-community-1", "speakers": spk, "note": f"{len(spk)} hablante(s)"}
    except Exception as e:
        return {"method": "single", "speakers": ["narrador"], "note": f"diarización falló ({str(e)[:160]}): narrador único"}


def main(job_path):
    with open(job_path, "r", encoding="utf-8") as f:
        job = json.load(f)
    t0 = time.time()
    audio = load16k(job["audio"])
    say(f"PROGRESS 0 100 Cargando modelo de transcripción…")
    res = transcribe(job, audio)
    res["alignment"] = refine_whisperx(job, audio, res)
    res["diarization"] = diarize(job, res)
    res["seconds"] = round(time.time() - t0, 1)
    tmp = job["result"] + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False)
    os.replace(tmp, job["result"])
    say(f"PROGRESS 100 100 Transcripción lista ({len(res['words'])} palabras)")


if __name__ == "__main__":
    try:
        main(sys.argv[1])
    except Exception as e:
        traceback.print_exc()
        # última línea legible para la interfaz (la traza completa queda arriba, en el registro)
        say(f"ERROR {type(e).__name__}: {str(e).strip()[:400]}")
        sys.exit(1)
