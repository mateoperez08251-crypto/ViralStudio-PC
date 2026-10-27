"""Worker de voz de Viral Studio (se ejecuta en su propio entorno virtual para no
romper las dependencias de ComfyUI).

Uso:  python worker.py job.json
job.json = {
  "engine": "qwen3" | "kokoro",
  "language": "Spanish", "lang_code": "es",
  "voice": {"design": "...", "kokoro": "em_alex", "speed": 1.0,
            "ref_audio": null, "ref_text": null, "cache_dir": "..."},
  "models": {"design": "Qwen/...VoiceDesign", "base": "Qwen/...Base", "kokoro_dir": "...", "whisper": "large-v3-turbo"},
  "align": true,
  "items": [{"id": "s1", "text": "...", "out": "/ruta/s1.wav"}],
  "result": "/ruta/result.json"
}
Imprime líneas "PROGRESS i n texto" y escribe result.json con duración y
tiempos por palabra de cada clip.
"""
import gc
import hashlib
import json
import os
import re
import sys
import time
import traceback

import numpy as np
import soundfile as sf

SAMPLES = {
    "Spanish": "Hace mucho tiempo, en una ciudad cubierta de niebla, ocurrió algo que nadie pudo explicar. Esta es esa historia.",
    "English": "A long time ago, in a city covered in fog, something happened that no one could explain. This is that story.",
    "Portuguese": "Há muito tempo, numa cidade coberta de névoa, aconteceu algo que ninguém conseguiu explicar. Esta é essa história.",
    "French": "Il y a longtemps, dans une ville couverte de brouillard, il s'est passé quelque chose que personne n'a pu expliquer.",
    "German": "Vor langer Zeit geschah in einer nebelverhangenen Stadt etwas, das niemand erklären konnte. Das ist diese Geschichte.",
    "Italian": "Tanto tempo fa, in una città coperta di nebbia, accadde qualcosa che nessuno riuscì a spiegare. Questa è quella storia.",
}


def say(*a):
    print(*a, flush=True)


def trim(x, sr, thr_db=-42.0):
    if not len(x):
        return x, 0.0
    thr = 10 ** (thr_db / 20)
    win = max(1, int(0.01 * sr))
    env = np.sqrt(np.convolve(x.astype(np.float64) ** 2, np.ones(win) / win, mode="same"))
    idx = np.where(env > thr)[0]
    if not len(idx):
        return x, 0.0
    a = max(0, idx[0] - int(0.03 * sr))
    b = min(len(x), idx[-1] + int(0.08 * sr))
    return x[a:b], a / sr


def normalize(x):
    pk = np.abs(x).max() if len(x) else 0
    if pk > 0:
        x = x / pk * 0.89
    return x.astype(np.float32)


# ------------------------------------------------------------------ motores
class Qwen3Engine:
    def __init__(self, job):
        import torch
        from qwen_tts import Qwen3TTSModel

        self.torch = torch
        self.job = job
        self.lang = job.get("language", "Spanish")
        self.dev = "cuda:0" if torch.cuda.is_available() else "cpu"
        self.dtype = torch.bfloat16 if self.dev.startswith("cuda") else torch.float32
        try:
            import flash_attn  # noqa: F401

            self.attn = "flash_attention_2"
        except Exception:
            self.attn = "sdpa"
        self.Model = Qwen3TTSModel
        self.prompt = None
        self.base = None

    def _load(self, name):
        say(f"LOG cargando {name} ({self.dev}, {self.attn})")
        return self.Model.from_pretrained(name, device_map=self.dev, dtype=self.dtype, attn_implementation=self.attn)

    def prepare(self):
        v = self.job["voice"]
        m = self.job["models"]
        ref_audio, ref_text = v.get("ref_audio"), v.get("ref_text")
        if not ref_audio:
            # Diseñar la voz una vez y guardarla: así el canal siempre suena igual
            cache = v.get("cache_dir") or os.path.dirname(self.job["result"])
            os.makedirs(cache, exist_ok=True)
            key = hashlib.sha1((v.get("design", "") + self.lang).encode()).hexdigest()[:12]
            ref_audio = os.path.join(cache, f"voice_{key}.wav")
            ref_text = SAMPLES.get(self.lang, SAMPLES["English"])
            if not os.path.exists(ref_audio):
                say("PROGRESS 0 1 Diseñando la voz del narrador…")
                dm = self._load(m["design"])
                wavs, sr = dm.generate_voice_design(text=ref_text, language=self.lang, instruct=v.get("design", ""))
                sf.write(ref_audio, normalize(wavs[0]), sr)
                del dm
                self._free()
        elif not ref_text:
            ref_text = transcribe_text(ref_audio, self.job)
        self.base = self._load(m["base"])
        self.prompt = self.base.create_voice_clone_prompt(ref_audio=ref_audio, ref_text=ref_text, x_vector_only_mode=not bool(ref_text))
        self.ref_audio = ref_audio

    def synth(self, texts):
        n = len(texts)
        wavs, sr = self.base.generate_voice_clone(text=texts, language=[self.lang] * n, voice_clone_prompt=self.prompt * n
                                                  if isinstance(self.prompt, list) and len(self.prompt) == 1 else self.prompt)
        return [np.asarray(w, dtype=np.float32) for w in wavs], sr

    def _free(self):
        gc.collect()
        if self.torch.cuda.is_available():
            self.torch.cuda.empty_cache()

    def close(self):
        self.base = None
        self.prompt = None
        self._free()


class KokoroEngine:
    def __init__(self, job):
        from kokoro_onnx import Kokoro

        d = job["models"].get("kokoro_dir")
        self.k = Kokoro(os.path.join(d, "kokoro.onnx"), os.path.join(d, "voices.bin"))
        self.voice = job["voice"].get("kokoro") or "em_alex"
        self.speed = float(job["voice"].get("speed") or 1.0)
        self.lang = {"es": "es", "en": "en-us", "pt": "pt-br", "fr": "fr-fr", "it": "it"}.get(job.get("lang_code", "es"), "es")
        if self.lang == "en-us" and self.voice.startswith("e"):
            self.voice = "am_adam"

    def prepare(self):
        pass

    def synth(self, texts):
        out, sr = [], 24000
        for t in texts:
            s, sr = self.k.create(t, voice=self.voice, speed=self.speed, lang=self.lang)
            out.append(np.asarray(s, dtype=np.float32))
        return out, sr

    def close(self):
        self.k = None


# ------------------------------------------------------------------ alineación
_WHISPER = {}


def whisper_model(job):
    if "m" in _WHISPER:
        return _WHISPER["m"]
    try:
        from faster_whisper import WhisperModel
        import ctranslate2

        dev = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        name = job["models"].get("whisper") or "large-v3-turbo"
        if dev == "cpu" and "large" in name:
            name = "small"
        say(f"LOG cargando whisper {name} ({dev})")
        _WHISPER["m"] = WhisperModel(name, device=dev, compute_type="float16" if dev == "cuda" else "int8")
    except Exception as e:
        say(f"LOG whisper no disponible ({e}); los tiempos se estimarán")
        _WHISPER["m"] = None
    return _WHISPER["m"]


def load16k(path):
    """Audio mono float32 a 16 kHz (se pasa ya decodificado a whisper: evita
    depender de la versión de PyAV)."""
    x, sr = sf.read(path, dtype="float32")
    if x.ndim > 1:
        x = x.mean(axis=1)
    if sr != 16000:
        n = int(len(x) * 16000 / sr)
        x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)
    return x


def word_times(path, job, text):
    m = whisper_model(job)
    if m is None:
        return None
    try:
        segs, _ = m.transcribe(load16k(path), language=job.get("lang_code", "es"), word_timestamps=True, beam_size=1,
                               vad_filter=False, initial_prompt=text[:200])
        out = []
        for s in segs:
            for w in s.words or []:
                tok = w.word.strip()
                if tok:
                    out.append({"w": tok, "s": round(float(w.start), 3), "e": round(float(w.end), 3)})
        return out
    except Exception as e:
        say(f"LOG fallo de alineación: {e}")
        return None


def transcribe_text(path, job):
    m = whisper_model(job)
    if m is None:
        return None
    segs, _ = m.transcribe(load16k(path), language=job.get("lang_code", "es"))
    return " ".join(s.text.strip() for s in segs)


# ------------------------------------------------------------------ main
def main(job_path):
    with open(job_path, "r", encoding="utf-8") as f:
        job = json.load(f)
    items = job["items"]
    eng_name = job.get("engine", "qwen3")
    t0 = time.time()
    try:
        eng = Qwen3Engine(job) if eng_name == "qwen3" else KokoroEngine(job)
        eng.prepare()
    except Exception as e:
        if eng_name == "qwen3" and job["models"].get("kokoro_dir"):
            say(f"LOG Qwen3-TTS no disponible ({e}); uso Kokoro")
            eng = KokoroEngine(job)
            eng_name = "kokoro"
        else:
            raise
    results = []
    bs = int(job.get("batch", 6 if eng_name == "qwen3" else 1))
    n = len(items)
    for i in range(0, n, bs):
        chunk = items[i : i + bs]
        texts = [re.sub(r"\s+", " ", it["text"]).strip() for it in chunk]
        say(f"PROGRESS {i} {n} Narrando escenas {i + 1}-{i + len(chunk)} de {n}")
        wavs, sr = eng.synth(texts)
        for it, w in zip(chunk, wavs):
            w, off = trim(normalize(w), sr)
            os.makedirs(os.path.dirname(it["out"]), exist_ok=True)
            sf.write(it["out"], w, sr)
            results.append({"id": it["id"], "file": it["out"], "dur": round(len(w) / sr, 3), "sr": sr})
    eng.close()
    if job.get("align", True):
        for k, r in enumerate(results):
            say(f"PROGRESS {k} {n} Sincronizando subtítulos {k + 1}/{n}")
            r["words"] = word_times(r["file"], job, items[k]["text"]) or []
    with open(job["result"], "w", encoding="utf-8") as f:
        json.dump({"engine": eng_name, "items": results, "seconds": round(time.time() - t0, 1)}, f, ensure_ascii=False)
    say(f"PROGRESS {n} {n} Voz lista")


if __name__ == "__main__":
    try:
        main(sys.argv[1])
    except Exception:
        traceback.print_exc()
        sys.exit(1)
