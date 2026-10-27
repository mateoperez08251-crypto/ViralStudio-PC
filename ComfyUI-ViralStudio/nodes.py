"""Nodos de Viral Studio para el grafo de ComfyUI.

  VS · Escribir historia   (LLM nativo: CLIPLoader con Qwen → guion completo en JSON)
  VS · Narrar              (texto → AUDIO con Qwen3-TTS / Kokoro)
  VS · Crear video         (guion JSON [+ música AUDIO] → MP4 animado con HyperFrames)

El Studio (botón 🎬 Viral Studio en el menú de ComfyUI) hace todo esto con un
clic; los nodos permiten montarlo a mano y mezclarlo con otros flujos.
"""
import json
import os
import time
import wave

import numpy as np

from .vs import compiler, llm, pipeline, voice
from .vs.config import FORMATS, LANGUAGES, presets

P = presets()
VT = list(P["video_types"].keys())
STY = list(P["styles"].keys())
CAPS = list(P["captions"].keys()) + ["none"]
VOI = [k for k in P["voices"].keys() if k != "clonar"]


def _local_llm(clip):
    """Genera texto con un CLIP de LLM ya cargado (igual que el nodo TextGenerate)."""
    def gen(prompt, system, max_tokens, temperature, seed):
        tokens = clip.tokenize(prompt, skip_template=False, min_length=1, thinking=False, system_prompt=system)
        ids = clip.generate(tokens, do_sample=True, max_length=int(max_tokens), temperature=temperature, top_k=40, top_p=0.92,
                            min_p=0.03, repetition_penalty=1.05, presence_penalty=0.15, seed=seed)
        txt = clip.decode(ids)
        return txt.split("</think>")[-1].strip()
    return gen


class VSStoryWriter:
    CATEGORY = "🎬 Viral Studio"
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("guion_json", "narracion")
    FUNCTION = "run"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "clip": ("CLIP", {"tooltip": "CLIPLoader con un LLM (qwen3.8_27b_w4a8 o qwen3.5_9b)"}),
            "tema": ("STRING", {"multiline": True, "default": "La increíble historia de Irena Sendler"}),
            "duracion_segundos": ("INT", {"default": 60, "min": 10, "max": 3600, "step": 5}),
            "formato": (list(FORMATS.keys()), {"default": "vertical"}),
            "tipo_de_video": (VT, {"default": VT[0]}),
            "estilo": (STY, {"default": STY[0]}),
            "idioma": (list(LANGUAGES.keys()), {"default": "es"}),
            "seed": ("INT", {"default": 0, "min": 0, "max": 2**31 - 1}),
        }, "optional": {"instrucciones": ("STRING", {"multiline": True, "default": ""})}}

    def run(self, clip, tema, duracion_segundos, formato, tipo_de_video, estilo, idioma, seed, instrucciones=""):
        cfg = pipeline.defaults({"topic": tema, "duration": duracion_segundos, "format": formato, "video_type": tipo_de_video,
                                 "style": estilo, "language": idioma, "extra": instrucciones, "seed": seed or None})
        llm.use_backend(_local_llm(clip))
        try:
            bible, scenes = llm.write_story(cfg)
        finally:
            llm.use_backend(None)
        story = {"settings": cfg, "bible": bible, "scenes": scenes}
        narr = "\n\n".join(s["narration"] for s in scenes)
        return (json.dumps(story, ensure_ascii=False), narr)


class VSNarrator:
    CATEGORY = "🎬 Viral Studio"
    RETURN_TYPES = ("AUDIO",)
    FUNCTION = "run"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "texto": ("STRING", {"multiline": True, "default": "Esta es la historia que nadie te contó."}),
            "voz": (VOI, {"default": VOI[0]}),
            "idioma": (list(LANGUAGES.keys()), {"default": "es"}),
            "motor": (["qwen3", "kokoro"], {"default": "qwen3"}),
        }, "optional": {"diseno_de_voz": ("STRING", {"multiline": True, "default": ""})}}

    def run(self, texto, voz, idioma, motor, diseno_de_voz=""):
        import torch

        out = os.path.join(pipeline.projects_dir(), "_nodos", time.strftime("%Y%m%d-%H%M%S"))
        cfg = {"voice": voz, "language": idioma, "voice_design": diseno_de_voz or None}
        res = voice.synthesize([{"id": "n0", "text": texto}], cfg, out, engine=motor)
        f = res["n0"]["file"]
        import soundfile as sf  # disponible en ComfyUI por torchaudio/soundfile; si no, wave

        try:
            x, sr = sf.read(f, dtype="float32")
        except Exception:
            with wave.open(f, "rb") as w:
                sr = w.getframerate()
                x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        x = np.atleast_2d(x if x.ndim == 1 else x.T)
        return ({"waveform": torch.from_numpy(x).unsqueeze(0), "sample_rate": sr},)


class VSMakeVideo:
    CATEGORY = "🎬 Viral Studio"
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("video", "proyecto_hyperframes")
    FUNCTION = "run"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "guion_json": ("STRING", {"forceInput": True}),
            "subtitulos": (CAPS, {"default": "viral"}),
            "voz": (VOI, {"default": VOI[0]}),
            "motor_voz": (["qwen3", "kokoro"], {"default": "qwen3"}),
            "calidad": (["draft", "standard", "high"], {"default": "high"}),
        }, "optional": {"musica": ("AUDIO",), "estilo": (["(del guion)"] + STY, {"default": "(del guion)"})}}

    def run(self, guion_json, subtitulos, voz, motor_voz, calidad, musica=None, estilo="(del guion)"):
        story = json.loads(guion_json)
        cfg = dict(story.get("settings") or {})
        cfg.update(captions=subtitulos, voice=voz, tts_engine=motor_voz, quality=calidad, music=False)
        if estilo != "(del guion)":
            cfg["style"] = estilo
        proj = pipeline.create(cfg)
        proj["bible"], proj["scenes"] = story.get("bible") or {}, story.get("scenes") or []
        if musica is not None:
            path = os.path.join(pipeline.pdir(proj["id"]), "audio", "music.wav")
            os.makedirs(os.path.dirname(path), exist_ok=True)
            wf = musica["waveform"][0].cpu().numpy()
            mono = wf.mean(axis=0) if wf.ndim == 2 else wf
            with wave.open(path, "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(int(musica["sample_rate"]))
                w.writeframes((np.clip(mono, -1, 1) * 32767).astype(np.int16).tobytes())
            proj["outputs"]["music"] = path
        pipeline.save(proj)
        ctx = pipeline.Ctx(proj["id"], ["voice", "build", "render"])
        log = print
        for st in ["voice", "build", "render"]:
            pipeline.STAGE_FN[st](proj, ctx, log, lambda f, m="": print(f"[ViralStudio] {st} {int(f * 100)}% {m}"))
            proj = pipeline.load(proj["id"])
        v = proj["outputs"]["video"]
        return {"ui": {"text": [v]}, "result": (v, proj["outputs"]["hf"])}


NODE_CLASS_MAPPINGS = {"VS_StoryWriter": VSStoryWriter, "VS_Narrator": VSNarrator, "VS_MakeVideo": VSMakeVideo}
NODE_DISPLAY_NAME_MAPPINGS = {"VS_StoryWriter": "🎬 VS · Escribir historia", "VS_Narrator": "🎙️ VS · Narrar",
                              "VS_MakeVideo": "🎞️ VS · Crear video (HyperFrames)"}
