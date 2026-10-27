"""Música original con ACE-Step 1.5 (Apache 2.0) ejecutado por ComfyUI.
Para videos largos se generan tramos y se encadenan con fundidos cruzados."""
import os
import random
import subprocess

from . import comfy_api
from .config import settings

MOOD_KEYS = {"dark": "D minor", "epic": "C minor", "sad": "A minor", "happy": "C major", "mystery": "E minor"}


def workflow(tags, seconds, seed, bpm=90, key="D minor", model=None):
    model = model or settings().get("music_model")
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": model}},
        "2": {"class_type": "TextEncodeAceStepAudio1.5", "inputs": {
            "clip": ["1", 1], "tags": tags, "lyrics": "[Instrumental]", "seed": int(seed), "bpm": int(bpm),
            "duration": float(seconds), "timesignature": "4", "language": "en", "keyscale": key,
            "generate_audio_codes": True, "cfg_scale": 2.0, "temperature": 0.85, "top_p": 0.9, "top_k": 0, "min_p": 0.0}},
        "3": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["2", 0]}},
        "4": {"class_type": "EmptyAceStep1.5LatentAudio", "inputs": {"seconds": float(seconds), "batch_size": 1}},
        "5": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3.0}},
        "6": {"class_type": "KSampler", "inputs": {
            "model": ["5", 0], "seed": int(seed), "steps": 8, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple",
            "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0], "denoise": 1.0}},
        "7": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["6", 0], "vae": ["1", 2]}},
        "8": {"class_type": "SaveAudio", "inputs": {"audio": ["7", 0], "filename_prefix": "viralstudio/music"}},
    }


def _first_audio(outputs):
    for node in outputs.values():
        for a in node.get("audio") or []:
            return comfy_api.output_path(a)
    return None


def generate(tags, total, out_path, bpm=None, key=None, seed=None, progress=None, cancel=None, log=print):
    if not comfy_api.list_models("checkpoints") or settings().get("music_model") not in comfy_api.list_models("checkpoints"):
        log("[music] modelo ACE-Step no instalado: el video irá sin música de fondo")
        return None
    seed = seed or random.randint(1, 2**31)
    bpm = bpm or (80 if any(w in tags for w in ("dark", "ambient", "horror", "sad")) else 100)
    key = key or ("C major" if any(w in tags for w in ("upbeat", "happy", "playful")) else "D minor")
    seg = 240.0
    n = max(1, int((total + 4) // seg) + (1 if (total + 4) % seg > 1 else 0))
    files = []
    for i in range(n):
        dur = min(seg, total + 4 - i * seg) if n > 1 else total + 4
        dur = max(20.0, dur + (3 if n > 1 else 0))
        if progress:
            progress(i / n, f"Componiendo música {i + 1}/{n}")
        outs = comfy_api.run(workflow(tags + (", variation, development" if i else ""), dur, seed + i, bpm, key), timeout=1800, cancel=cancel)
        f = _first_audio(outs)
        if f:
            files.append(f)
    if not files:
        return None
    if len(files) == 1:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", files[0], "-ar", "48000", "-ac", "2", out_path], check=True)
    else:
        # encadenar con fundidos cruzados de 3 s
        args, fc, last = [], [], "[0:a]"
        for f in files:
            args += ["-i", f]
        for i in range(1, len(files)):
            lab = f"[x{i}]"
            fc.append(f"{last}[{i}:a]acrossfade=d=3:c1=tri:c2=tri{lab}")
            last = lab
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args, "-filter_complex", ";".join(fc), "-map", last,
                        "-ar", "48000", "-ac", "2", out_path], check=True)
    comfy_api.free(True)
    return out_path
