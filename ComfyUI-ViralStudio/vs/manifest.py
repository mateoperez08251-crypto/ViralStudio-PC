"""Manifiestos del proyecto (Guía Maestra V2 §5): escenas en el contrato de la
guía, clips renderizados con hashes, línea de tiempo y licencias de cada pieza."""
import hashlib
import json
import os
import time

from .config import HYPERFRAMES_VERSION, settings

LICENSES = [
    {"id": "hyperframes", "url": "https://github.com/heygen-com/hyperframes", "version": HYPERFRAMES_VERSION, "license": "Apache-2.0",
     "commercial": True, "attribution": "no", "role": "render HTML→MP4"},
    {"id": "gsap", "url": "https://gsap.com/standard-license", "version": "3.14.2", "license": "GSAP Standard 'no charge' license",
     "commercial": True, "attribution": "no", "role": "línea de tiempo de animación"},
    {"id": "comfyui", "url": "https://github.com/comfyanonymous/ComfyUI", "license": "GPL-3.0", "commercial": True, "attribution": "no",
     "role": "anfitrión, cola de LLM y música"},
    {"id": "qwen3.8-27b", "url": "https://huggingface.co/Qwen/Qwen3.8-27B", "license": "Apache-2.0", "commercial": True, "attribution": "no",
     "role": "guionista (LLM)"},
    {"id": "qwen3.5-9b", "url": "https://huggingface.co/Qwen/Qwen3.5-9B", "license": "Apache-2.0", "commercial": True, "attribution": "no",
     "role": "guionista alternativo"},
    {"id": "qwen3-tts", "url": "https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base", "license": "Apache-2.0", "commercial": True,
     "attribution": "no", "role": "voz (diseño + clonado)"},
    {"id": "kokoro-82m", "url": "https://huggingface.co/hexgrad/Kokoro-82M", "license": "Apache-2.0", "commercial": True, "attribution": "no",
     "role": "voz rápida"},
    {"id": "faster-whisper", "url": "https://github.com/SYSTRAN/faster-whisper", "license": "MIT (código y pesos)", "commercial": True,
     "attribution": "no", "role": "tiempos por palabra"},
    {"id": "ace-step-1.5", "url": "https://huggingface.co/Comfy-Org/ACE-Step-1.5", "license": "Apache-2.0 (repack) / MIT (original)",
     "commercial": True, "attribution": "no", "role": "música original"},
    {"id": "pixabay-sfx", "url": "https://pixabay.com/service/license-summary/", "license": "Pixabay Content License", "commercial": True,
     "attribution": "no", "role": "efectos de sonido (librería de HyperFrames)"},
    {"id": "natural-earth", "url": "https://www.naturalearthdata.com/about/terms-of-use/", "license": "Dominio público", "commercial": True,
     "attribution": "no", "role": "contornos de países (mapas)"},
    {"id": "google-fonts", "url": "https://fonts.google.com", "license": "SIL Open Font License", "commercial": True, "attribution": "no",
     "role": "tipografías (Archivo Black, League Gothic, Montserrat, EB Garamond…)"},
]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def scene_contract(sc, idx, cast):
    """Escena en el formato del scene.schema.json de la guía (render_backend = web)."""
    start = float(sc.get("start", 0))
    narr = sc.get("narration") or ""
    pre = float(sc.get("pre", 0))
    vdur = float((sc.get("audio") or {}).get("dur") or 0)
    return {
        "scene_id": sc.get("id", f"s{idx:03d}"),
        "story_span": narr,
        "audio_start_s": round(start + pre, 3),
        "audio_end_s": round(start + pre + vdur, 3),
        "exact_narration": narr,
        "historical_sources": [],
        "visual_justification": sc.get("visual_justification") or "ilustra la frase narrada",
        "style_profile": sc.get("style", "") if isinstance(sc.get("style"), str) else "",
        "location": sc.get("place") or sc.get("env", ""),
        "era": str(sc.get("year", "")),
        "character_ids": [c.get("who") for c in sc.get("chars") or [] if c.get("who")],
        "prop_ids": [sc["prop"]] if sc.get("prop") else [],
        "asset_refs": [],
        "action_beats": [{"at_s": 0, "verb": c.get("action", "idle"), "who": c.get("who")} for c in sc.get("chars") or []],
        "camera": {"preset": sc.get("cam", "auto"), "transition_in": sc.get("trans", "cut")},
        "lighting": {"mood": sc.get("mood", ""), "time": sc.get("time", "")},
        "animation": {"shot": sc.get("shot"), "engine": "vs-engine canvas 2D (HyperFrames)"},
        "contact_events": [],
        "vfx": [sc["weather"]] if sc.get("weather") else [],
        "sfx_cues": [sc["sfx"]] if sc.get("sfx") else [],
        "music_cues": [],
        "text_policy": "labels_only" if sc.get("label") or sc.get("lines") else "none",
        "expected_duration_s": float(sc.get("dur") or 1),
        "render_backend": "web",
        "qa_gates": ["fidelity", "audio_sync", "no_black_frames"],
        "revision": int(sc.get("revision", 1)),
    }


LICENSES += [
    {"id": "whisperx", "url": "https://github.com/m-bain/whisperX", "license": "BSD-2-Clause (código); modelos de alineación con su propia licencia",
     "commercial": True, "attribution": "no", "role": "alineación fina de palabras (opcional)"},
    {"id": "pyannote-community-1", "url": "https://huggingface.co/pyannote/speaker-diarization-community-1", "license": "CC-BY-4.0 (requiere aceptar condiciones)",
     "commercial": True, "attribution": "sí", "role": "diarización de hablantes (opcional)"},
    {"id": "viralstudio-vector-assets", "url": "engine/6x-7x_*.js", "license": "Original de ViralStudio (código SVG propio)", "commercial": True,
     "attribution": "no", "role": "marionetas, fondos por capas, props e infografías del modo audio"},
    {"id": "user-narration", "url": "(archivo subido por el usuario)", "license": "Derechos del usuario", "commercial": None, "attribution": "—",
     "role": "narración original (no se modifica ni se sintetiza)"},
]
SCENE_CONTRACT_V2 = "viralstudio.scene.v2"


def scene_contract_v2(sc, plan):
    """Contrato v2 (modo audio): tiempos absolutos del audio, frames y motor vectorial.
    El esquema legacy (scene.schema.json, render_backend blender|web|map|comfyui) no se toca:
    los proyectos clásicos siguen escribiendo v1 con scene_contract()."""
    return {
        "schema": SCENE_CONTRACT_V2, "scene_id": sc["id"], "audio_start_s": sc["start_s"], "audio_end_s": sc["end_s"],
        "start_frame": sc["start_frame"], "end_frame": sc["end_frame"], "exact_narration": sc.get("narration_exact", ""),
        "word_ids": sc.get("word_ids", []), "visual_justification": sc.get("visual_justification", ""),
        "render_backend": sc.get("render_backend"), "template": sc.get("template"), "asset_ids": sc.get("asset_ids", []),
        "character_ids": sc.get("character_ids", []), "action_beats": sc.get("action_beats", []), "camera": sc.get("camera", {}),
        "overlays": sc.get("overlays", []), "caption_policy": sc.get("caption_policy", "word_timed"), "revision": sc.get("revision", 1),
        "narration_source": plan["audio"].get("narration_source"), "tts_used": plan["audio"].get("tts_used"),
    }


def write_all(proj, out_dir, parts=None, qa=None):
    d = os.path.join(out_dir, "manifests")
    os.makedirs(d, exist_ok=True)
    if (proj.get("settings") or {}).get("input_mode") == "audio":
        return _write_all_audio(proj, out_dir, d, parts, qa)
    cast = (proj.get("bible") or {}).get("cast") or {}
    scenes = [scene_contract(s, i + 1, cast) for i, s in enumerate(proj["scenes"])]
    with open(os.path.join(d, "scenes.json"), "w", encoding="utf-8") as f:
        json.dump(scenes, f, ensure_ascii=False, indent=1)
    info = (proj.get("outputs") or {}).get("info") or {}
    clips = []
    for c, p in zip(info.get("chapters", []), parts or []):
        if os.path.exists(p):
            clips.append({"chapter": c["id"], "scenes": c["scenes"], "backend": "hyperframes", "output_path": p, "sha256": sha256(p),
                          "fps": info.get("fps"), "dimensions": [info.get("W"), info.get("H")], "start_s": c["start"], "dur_s": c["dur"]})
    with open(os.path.join(d, "clips.json"), "w", encoding="utf-8") as f:
        json.dump(clips, f, ensure_ascii=False, indent=1)
    with open(os.path.join(d, "timeline.json"), "w", encoding="utf-8") as f:
        json.dump([{"id": s["id"], "start": s.get("start"), "dur": s.get("dur"), "shot": s.get("shot"), "narration": s.get("narration")}
                   for s in proj["scenes"]], f, ensure_ascii=False, indent=1)
    s = settings()
    used = {"hyperframes", "gsap", "pixabay-sfx", "google-fonts"}
    if any(sc.get("shot") == "map" for sc in proj["scenes"]):
        used.add("natural-earth")
    if not proj["settings"].get("script"):
        used.add("qwen3.8-27b" if "3.8" in s.get("llm_model", "") else "qwen3.5-9b")
        used.add("comfyui")
    used.add("kokoro-82m" if proj["settings"].get("tts_engine") == "kokoro" else "qwen3-tts")
    used.add("faster-whisper")
    if proj["outputs"].get("music"):
        used.update({"ace-step-1.5", "comfyui"})
    with open(os.path.join(d, "licensing_manifest.json"), "w", encoding="utf-8") as f:
        json.dump([dict(l, used=l["id"] in used) for l in LICENSES], f, ensure_ascii=False, indent=1)
    if qa:
        with open(os.path.join(d, "qa_report.json"), "w", encoding="utf-8") as f:
            json.dump(dict(qa, generated=time.strftime("%Y-%m-%d %H:%M:%S")), f, ensure_ascii=False, indent=1)
    return d


def _write_all_audio(proj, out_dir, d, parts, qa):
    from .audio_mode import current_plan, current_transcript

    pdir = os.path.dirname(out_dir)
    plan = current_plan(pdir) or {"scenes": [], "audio": {}}
    with open(os.path.join(d, "scenes.json"), "w", encoding="utf-8") as f:
        json.dump([scene_contract_v2(s, plan) for s in plan["scenes"]], f, ensure_ascii=False, indent=1)
    info = (proj.get("outputs") or {}).get("info") or {}
    clips = []
    for c, p in zip(info.get("chapters", []), parts or []):
        if os.path.exists(p):
            clips.append({"scene": c["id"], "backend": "hyperframes+vsv", "output_path": p, "sha256": sha256(p), "cache_key": c.get("key"),
                          "fps": info.get("fps"), "frames": c.get("frames"), "start_s": c["start"], "dur_s": c["dur"]})
    with open(os.path.join(d, "clips.json"), "w", encoding="utf-8") as f:
        json.dump(clips, f, ensure_ascii=False, indent=1)
    with open(os.path.join(d, "timeline.json"), "w", encoding="utf-8") as f:
        json.dump([{"id": s["id"], "start_s": s["start_s"], "end_s": s["end_s"], "start_frame": s["start_frame"], "end_frame": s["end_frame"],
                    "template": s.get("template"), "narration": s.get("narration_exact")} for s in plan["scenes"]], f, ensure_ascii=False, indent=1)
    tr = current_transcript(pdir) or {}
    used = {"hyperframes", "gsap", "google-fonts", "viralstudio-vector-assets", "user-narration"}
    if tr.get("engine") == "faster-whisper":
        used.add("faster-whisper")
    if (tr.get("alignment") or {}).get("method") == "whisperx":
        used.add("whisperx")
    if (tr.get("diarization") or {}).get("method", "").startswith("pyannote"):
        used.add("pyannote-community-1")
    if plan.get("planner") == "llm":
        used.update({"qwen3.8-27b" if "3.8" in settings().get("llm_model", "") else "qwen3.5-9b", "comfyui"})
    if proj["settings"].get("music") and (proj.get("outputs") or {}).get("music"):
        used.update({"ace-step-1.5", "comfyui"})
    if proj["settings"].get("sfx"):
        used.add("pixabay-sfx")
    with open(os.path.join(d, "licensing_manifest.json"), "w", encoding="utf-8") as f:
        json.dump([dict(l, used=l["id"] in used) for l in LICENSES], f, ensure_ascii=False, indent=1)
    if qa:
        with open(os.path.join(d, "qa_report.json"), "w", encoding="utf-8") as f:
            json.dump(dict(qa, generated=time.strftime("%Y-%m-%d %H:%M:%S")), f, ensure_ascii=False, indent=1)
    return d
