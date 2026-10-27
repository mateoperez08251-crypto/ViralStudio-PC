"""Audio: lectura/escritura WAV, efectos de sonido (librería + sintetizados),
colocación de SFX según la acción en pantalla y mezcla final con ducking y
normalización a -14 LUFS."""
import glob
import json
import math
import os
import subprocess
import wave

import numpy as np

SR = 48000


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd[:4])}… falló:\n{r.stderr[-1500:]}")
    return r


def to_wav48(src, dst):
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", str(SR), "-sample_fmt", "s16", dst])
    return dst


def read_wav(path):
    """Devuelve float32 mono a 48 kHz (convierte con ffmpeg si hace falta)."""
    try:
        with wave.open(path, "rb") as w:
            sr, ch, sw = w.getframerate(), w.getnchannels(), w.getsampwidth()
            raw = w.readframes(w.getnframes())
        if sw == 2 and sr == SR and ch == 1:
            return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    except Exception:
        pass
    tmp = path + ".48k.wav"
    if not os.path.exists(tmp) or os.path.getmtime(tmp) < os.path.getmtime(path):
        to_wav48(path, tmp)
    with wave.open(tmp, "rb") as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0


def write_wav(path, x, sr=SR):
    x = np.clip(np.asarray(x, dtype=np.float32), -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    return path


def duration(path):
    try:
        r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path])
        return float(r.stdout.strip())
    except Exception:
        return len(read_wav(path)) / SR


def trim_silence(x, thr_db=-42.0, pad=0.04):
    """Recorta silencios al principio y al final (voz TTS)."""
    if not len(x):
        return x, 0.0
    thr = 10 ** (thr_db / 20)
    win = int(0.01 * SR)
    env = np.sqrt(np.convolve(x ** 2, np.ones(win) / win, mode="same"))
    idx = np.where(env > thr)[0]
    if not len(idx):
        return x, 0.0
    a = max(0, idx[0] - int(pad * SR))
    b = min(len(x), idx[-1] + int(pad * 2 * SR))
    return x[a:b], a / SR


def peak_offset(x):
    """Segundos hasta el pico de un SFX (para que el golpe caiga en el cuadro)."""
    if not len(x):
        return 0.0
    win = int(0.005 * SR)
    env = np.convolve(np.abs(x), np.ones(win) / win, mode="same")
    return float(np.argmax(env[: int(1.5 * SR)]) / SR)


# ---------------------------------------------------------------- SFX sintetizados
def _env(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / max(d, 1e-4))


def _noise(n, seed):
    return np.random.default_rng(seed).standard_normal(n).astype(np.float32)


def synth(kind, seed=1):
    if kind == "thunder":
        n = int(3.2 * SR)
        x = _noise(n, seed)
        x = np.cumsum(x) * 0.02
        x -= np.convolve(x, np.ones(800) / 800, mode="same")
        e = _env(n, 0.02, 0.9) + 0.4 * _env(n, 0.3, 1.6)
        return np.tanh(x * e * 2.2) * 0.9
    if kind == "heartbeat":
        n = int(1.6 * SR)
        t = np.arange(n) / SR
        x = np.zeros(n, np.float32)
        for t0, amp in ((0.0, 1.0), (0.28, 0.7)):
            m = t >= t0
            tt = t[m] - t0
            x[m] += amp * np.sin(2 * np.pi * (55 - 20 * tt) * tt) * np.exp(-tt * 14)
        return x * 0.95
    if kind == "boom":
        n = int(2.5 * SR)
        t = np.arange(n) / SR
        f = 70 * np.exp(-t * 2.2) + 32
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6)
        x += 0.25 * _noise(n, seed) * np.exp(-t * 9)
        return np.tanh(x * 1.6) * 0.9
    if kind == "riser":
        n = int(2.2 * SR)
        t = np.arange(n) / SR
        x = _noise(n, seed) * (t / t[-1]) ** 2 * 0.35
        x += 0.3 * np.sin(2 * np.pi * np.cumsum(200 + 900 * (t / t[-1]) ** 2) / SR) * (t / t[-1]) ** 1.5
        return x
    if kind == "wind":
        n = int(6 * SR)
        x = np.cumsum(_noise(n, seed)) * 0.01
        x -= np.convolve(x, np.ones(2000) / 2000, mode="same")
        return x / (np.abs(x).max() + 1e-6) * 0.5
    if kind == "rain":
        n = int(6 * SR)
        x = _noise(n, seed) * 0.12
        return x - np.convolve(x, np.ones(6) / 6, mode="same")
    return np.zeros(int(0.5 * SR), np.float32)


class SfxLib:
    """Efectos disponibles: librería de HyperFrames (Pixabay) + sintetizados."""

    FILES = {
        "whoosh": ["whoosh.mp3", "whoosh-short.mp3", "whoosh-cinematic.mp3"],
        "impact": ["impact-bass-1.mp3", "impact-bass-2.mp3"],
        "glitch": ["glitch-1.mp3", "glitch-3.mp3", "glitch-2.mp3"],
        "pop": ["pop.mp3"],
        "riser": ["riser.mp3"],
        "click": ["click.mp3"],
        "typing": ["typing.mp3"],
        "sparkle": ["sparkle.mp3"],
        "ping": ["ping.mp3"],
        "chime": ["chime.mp3"],
        "error": ["error.mp3"],
    }
    SYNTH = ("thunder", "heartbeat", "boom", "wind", "rain")

    def __init__(self, folder):
        self.folder = folder
        self.cache = {}
        self.count = {}

    def get(self, kind):
        """Devuelve (audio, pico) rotando entre tomas para no repetir el mismo sonido."""
        n = self.count.get(kind, 0)
        self.count[kind] = n + 1
        files = [f for f in self.FILES.get(kind, []) if os.path.exists(os.path.join(self.folder, f))]
        key = None
        if files:
            key = files[n % len(files)]
            if key not in self.cache:
                x = read_wav(os.path.join(self.folder, key))
                self.cache[key] = (x, peak_offset(x))
            return self.cache[key]
        if kind in self.SYNTH or kind in ("impact", "riser"):
            sk = "boom" if kind == "impact" else kind
            key = f"synth:{sk}:{n % 2}"
            if key not in self.cache:
                x = synth(sk, n % 2 + 1).astype(np.float32)
                self.cache[key] = (x, peak_offset(x))
            return self.cache[key]
        return None, 0.0


# ------------------------------------------------------------ colocación de SFX
def plan_sfx(scenes):
    """Elige efectos con causa en pantalla (whoosh en cortes rápidos, golpe en
    impactos, pop en números, riser antes de revelaciones…).
    Devuelve [(tiempo_del_golpe, tipo, volumen)]."""
    ev = []
    for i, s in enumerate(scenes):
        t = s["start"]
        tr = s.get("trans", "cut")
        cue = (s.get("sfx") or "").lower()
        shot = s.get("shot", "scene")
        if i > 0 and tr in ("whip", "slide", "zoom"):
            ev.append((t + 0.02, "whoosh", 0.7))
        if tr == "glitch":
            ev.append((t + 0.02, "glitch", 0.5))
        if cue in ("impact", "boom", "hit") or shot == "explosion" or tr == "flash":
            ev.append((t + (min(0.6, s["dur"] * 0.3) if shot == "explosion" else 0.03), "impact", 0.95 if cue else 0.6))
        if cue in ("thunder",) or s.get("weather") == "storm":
            ev.append((t + 0.1, "thunder", 0.6))
        if cue == "heartbeat" or (s.get("mood") == "fear" and cue == ""):
            ev.append((t + 0.15, "heartbeat", 0.55))
        if shot in ("number", "list", "object") or cue == "pop":
            ev.append((t + 0.36, "pop", 0.55))
        if shot == "year":
            ev.append((t + min(1.4, s["dur"] * 0.5), "impact", 0.55))
        if shot == "portrait":
            ev.append((t + 0.55, "sparkle", 0.5))
        if shot == "quote" or (shot in ("kinetic", "title") and s.get("variant") == "type"):
            ev.append((t + 0.2, "typing", 0.35))
        if shot == "end":
            ev.append((t + 1.3, "click", 0.7))
        if cue == "riser" or (i + 1 < len(scenes) and scenes[i + 1].get("shot") in ("reveal", "explosion")):
            ev.append((s["start"] + s["dur"], "riser_end", 0.45))
        if cue in ("glitch", "whoosh", "chime", "ping", "error", "sparkle", "click"):
            ev.append((t + 0.05, cue, 0.6))
    return ev


def build_tracks(scenes, total, sfx_folder, out_dir, sfx_volume=0.55):
    """Crea voice.wav y sfx.wav del largo total exacto."""
    n = int(math.ceil(total * SR)) + SR
    voice = np.zeros(n, np.float32)
    for s in scenes:
        a = s.get("audio") or {}
        if not a.get("file") or not os.path.exists(a["file"]):
            continue
        x = read_wav(a["file"])
        if a.get("trim"):
            i0 = int(a["trim"][0] * SR)
            i1 = int(a["trim"][1] * SR) if a["trim"][1] else len(x)
            x = x[i0:i1]
        i = int((s["start"] + s.get("pre", 0.0)) * SR)
        m = min(len(x), n - i)
        if m > 0:
            voice[i : i + m] += x[:m]
    lib = SfxLib(sfx_folder)
    sfx = np.zeros(n, np.float32)
    for (t, kind, vol) in plan_sfx(scenes):
        k = "riser" if kind == "riser_end" else kind
        x, pk = lib.get(k)
        if x is None:
            continue
        if kind == "riser_end":
            i = int((t - len(x) / SR + 0.05) * SR)
        else:
            i = int((t - pk + 1 / 30) * SR)  # el pico cae un cuadro después del golpe visual
        if i < 0:
            x = x[-i:]
            i = 0
        m = min(len(x), n - i)
        if m > 0:
            sfx[i : i + m] += x[:m] * vol * sfx_volume
    vp = write_wav(os.path.join(out_dir, "voice.wav"), voice[: int(total * SR)])
    sp = write_wav(os.path.join(out_dir, "sfx.wav"), np.tanh(sfx[: int(total * SR)] * 1.1))
    return vp, sp


def mix(voice, sfx, music, total, out_path, music_volume=0.16, lufs=-14.0):
    """Mezcla voz + sfx + música (con ducking bajo la voz) y normaliza."""
    inputs = ["-i", voice, "-i", sfx]
    if music and os.path.exists(music):
        inputs += ["-stream_loop", "-1", "-i", music]
        fc = (
            f"[2:a]aformat=sample_rates={SR}:channel_layouts=mono,atrim=0:{total:.3f},"
            f"afade=t=in:d=1.2,afade=t=out:st={max(0, total - 2.5):.3f}:d=2.5,volume={music_volume * 2.2:.3f}[m];"
            f"[0:a]asplit=2[v][vk];"
            f"[m][vk]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350:makeup=1[md];"
            f"[v][1:a][md]amix=inputs=3:normalize=0:duration=first,"
            f"loudnorm=I={lufs}:TP=-1.5:LRA=11[out]"
        )
    else:
        fc = f"[0:a][1:a]amix=inputs=2:normalize=0:duration=first,loudnorm=I={lufs}:TP=-1.5:LRA=11[out]"
    tmp = out_path + ".pre.wav"
    run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", fc.replace(f",loudnorm=I={lufs}:TP=-1.5:LRA=11", ""),
         "-map", "[out]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", "-t", f"{total:.3f}", tmp])
    # normalización en dos pasadas (medir y corregir) para clavar -14 LUFS
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", tmp, "-af", f"loudnorm=I={lufs}:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True)
    try:
        m = json.loads(r.stderr[r.stderr.rindex("{"): r.stderr.rindex("}") + 1])
        af = (f"loudnorm=I={lufs}:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
              f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    except Exception:
        af = f"loudnorm=I={lufs}:TP=-1.5:LRA=11"
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-af", af, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", out_path])
    os.remove(tmp)
    return out_path
