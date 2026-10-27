"""Etapas del modo «Mi audio → video» (input_mode = "audio").

  transcribe → plan → music → build → render → qa

Diferencias con el modo clásico (tema/guion):
  · NO hay etapa de voz: la narración es el archivo del usuario. Nunca se llama
    a voice.synthesize() (Qwen3-TTS/Kokoro) en este modo.
  · La duración del video la fija el audio: frame_count = ceil(duración·fps).
  · La pista de voz es el master continuo (sin cortes por escena, sin `pre` ni
    `gap`, sin cambios de velocidad). Música y SFX solo si el usuario los activa.
  · Render por escena con caché (clave = hash visual de la escena): re-renderizar
    una escena no toca el audio ni las demás.

Archivos del proyecto (además de project.json):
  audio/source/original.<ext>  audio/source_voice_master.wav  audio/analysis_16k.wav
  transcript/transcript_raw.json  transcript/transcript_edited.json
  plan/audio_plan.json (+ plan/versions/)  plan/storyboard.json  plan/visual_bible.json
  plan/asset_manifest.json  plan/timed_words.json
"""
import hashlib
import json
import os
import shutil
import subprocess
import time

from . import asr as ASR
from . import audio_storyboard as SB
from . import audio_timeline as TL
from . import visual_assets as VA
from .config import settings
from .errors import VSError

AUDIO_STAGES = ["transcribe", "plan", "music", "build", "render", "qa"]
# Tema/guion con el motor ilustrado: el guion manda; la voz (Kokoro/Qwen3-TTS) lo narra y a partir de
# "narration" el proyecto sigue exactamente el mismo camino que el modo audio.
VECTOR_STAGES = ["story", "voice", "narration", "plan", "music", "build", "render", "qa"]
VECTOR_DEFAULTS = {"engine": "vector", "visual_style": "cutout_ilustrado", "captions": "explainer", "pace_visual": "normal",
                   "storyboard_mode": "auto", "auto_storyboard": True, "asset_mode": "library_first", "sfx": False,
                   "preserve_original_audio": False, "audio_loudnorm": True, "end_card": False, "music_volume": 0.12,
                   "scene_min_s": 1.4, "professional_gate": True}  # guion: cada frase puede ser su propio plano (ritmo de vídeo corto)
ENUMS = {
    "captions": {"explainer", "karaoke", "none", "viral", "caja", "cine", "papel", "neon", "minimal"},
    "visual_style": {"vector_explicativo", "cutout_ilustrado", "cientifico_animado", "escenas_2_5d", "vector_realista_mixto"},
    "pace_visual": {"calmo", "normal", "rapido"},
    "storyboard_mode": {"auto", "manual"},
    "asset_mode": {"library_first", "library_only", "generative_optional"},
    "format": {"vertical", "horizontal", "cuadrado"},
}
AUDIO_DEFAULTS = {
    "input_mode": "audio", "topic": "", "script": "", "language": "auto", "format": "vertical", "fps": 30,
    "visual_style": "cutout_ilustrado", "preserve_original_audio": True, "captions": "explainer", "music": False, "sfx": False,
    "storyboard_mode": "auto", "auto_storyboard": True, "manual_storyboard": False, "asset_mode": "library_first",
    "pace_visual": "normal", "quality": "high", "professional_gate": True, "diarize": False, "audio_loudnorm": False, "music_volume": 0.12,
}
PACE = {"calmo": (2.6, 7.0), "normal": (2.0, 6.0), "rapido": (1.5, 4.5)}


def validate_settings(cfg):
    for k, allowed in ENUMS.items():
        if k in cfg and cfg[k] not in allowed:
            raise VSError("INPUT_INVALID", f"Valor no válido para {k}: {cfg[k]!r} (admitidos: {', '.join(sorted(allowed))})")
    try:
        fps = int(cfg.get("fps", 30))
    except (TypeError, ValueError):
        raise VSError("INPUT_INVALID", "fps inválido")
    if fps not in (24, 25, 30, 50, 60):
        raise VSError("INPUT_INVALID", "fps admitidos: 24, 25, 30, 50, 60")
    cfg["fps"] = fps
    for b in ("preserve_original_audio", "music", "sfx", "auto_storyboard", "manual_storyboard", "diarize", "audio_loudnorm", "professional_gate"):
        if b in cfg:
            cfg[b] = bool(cfg[b]) if not isinstance(cfg[b], str) else cfg[b].lower() in ("1", "true", "si", "sí", "on")
    if cfg.get("manual_storyboard"):
        cfg["storyboard_mode"] = "manual"
    if cfg.get("storyboard_mode") == "manual":
        cfg["auto_storyboard"] = False
    if cfg.get("language") not in (None, "", "auto") and len(str(cfg["language"])) > 5:
        raise VSError("INPUT_INVALID", "Idioma inválido")
    return cfg


def scene_bounds(cfg):
    return PACE.get(cfg.get("pace_visual", "normal"), PACE["normal"])


# ------------------------------------------------------------------ archivos
def _p(pdir, *a):
    return os.path.join(pdir, *a)


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def read_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def current_transcript(pdir):
    return read_json(_p(pdir, "transcript", "transcript_edited.json")) or read_json(_p(pdir, "transcript", "transcript_raw.json"))


def current_plan(pdir):
    return read_json(_p(pdir, "plan", "audio_plan.json"))


def save_plan(pdir, plan, reason=""):
    """Guarda el plan validado + derivados versionados (storyboard, biblia, assets, palabras)."""
    TL.validate_plan(plan, VA.all_ids())
    old = current_plan(pdir)
    ver = int((old or {}).get("plan_version", 0)) + 1
    plan["plan_version"] = ver
    plan["saved_reason"] = reason
    plan["saved_at"] = time.time()
    if old:
        write_json(_p(pdir, "plan", "versions", f"audio_plan.v{ver - 1:03d}.json"), old)
    write_json(_p(pdir, "plan", "audio_plan.json"), plan)
    write_json(_p(pdir, "plan", "storyboard.json"), {"plan_version": ver, "scenes": [
        {k: s.get(k) for k in ("id", "start_s", "end_s", "start_frame", "end_frame", "narration_exact", "word_ids", "template",
                               "render_backend", "background_id", "character_ids", "action_beats", "camera", "overlays",
                               "visual_prompt", "visual_justification", "revision", "locked")} for s in plan["scenes"]]})
    write_json(_p(pdir, "plan", "visual_bible.json"), plan["visual_bible"])
    write_json(_p(pdir, "plan", "asset_manifest.json"), VA.manifest(plan))
    write_json(_p(pdir, "plan", "timed_words.json"), {"source": plan["transcript"].get("source"), "words": plan["transcript"]["words"]})
    return plan


def transcript_hash(tr):
    return hashlib.sha256(json.dumps([[w["id"], w["text"], w["start_s"], w["end_s"]] for w in tr.get("words", [])]).encode()).hexdigest()[:16]


def refresh_plan_words(plan, tr):
    """Corrección de transcripción: actualiza palabras/narración y subtítulos
    SIN cambiar la partición de escenas ni el audio."""
    plan["transcript"].update(language=tr.get("language"), text=tr.get("text", ""), words=tr["words"],
                              needs_review=tr.get("needs_review", False), source=tr.get("source"))
    ids = {w["id"] for w in tr["words"]}
    TL.reassign_words(plan)
    for s in plan["scenes"]:
        s["highlight_word_ids"] = [h for h in s.get("highlight_word_ids", []) if h in ids]
    plan["transcript_hash"] = transcript_hash(tr)
    return plan


# ------------------------------------------------------------------ etapas
def stage_transcribe(proj, ctx, log, prog, pdir):
    a = proj.get("audio")
    if not a:
        raise VSError("INPUT_INVALID", "Primero sube la narración (MP3, WAV, M4A, FLAC, OGG, AAC o MP4/MOV con audio).")
    raw_path = _p(pdir, "transcript", "transcript_raw.json")
    old = read_json(raw_path)
    if old and old.get("audio_sha256") == a["sha256"] and not proj["settings"].get("force_transcribe"):
        prog(1, "Transcripción ya hecha (edítala o pulsa «Volver a transcribir»)")
        return
    t0 = time.time()
    raw = ASR.transcribe(_p(pdir, a["analysis_path"]), a["sha256"], proj["settings"], _p(pdir, "transcript", "cache"),
                         progress=lambda f, m="": prog(min(0.97, f), m), log=log, cancel=ctx.cancel_flag)
    tr = ASR.build_transcript(raw, a["duration_s"])
    tr["audio_sha256"] = a["sha256"]
    tr["seconds"] = round(time.time() - t0, 1)
    write_json(raw_path, tr)
    # una transcripción nueva del MISMO audio no pisa las correcciones del usuario
    ed = read_json(_p(pdir, "transcript", "transcript_edited.json"))
    if ed and ed.get("audio_sha256") != a["sha256"]:
        os.remove(_p(pdir, "transcript", "transcript_edited.json"))
    proj["settings"].pop("force_transcribe", None)
    proj["transcript"] = {"status": "no_speech" if tr["no_speech"] else "ok", "words": len(tr["words"]), "language": tr["language"],
                          "review_count": tr["review_count"], "engine": f"{tr.get('engine')} {tr.get('model')} ({tr.get('device')})",
                          "alignment": (tr.get("alignment") or {}).get("method"), "diarization": (tr.get("diarization") or {}).get("note")}
    if tr["no_speech"]:
        log("[asr] no se detectó habla: el storyboard usará planos de ambientación; revisa el archivo o pega la transcripción")
    prog(1, f"Transcripción: {len(tr['words'])} palabras ({tr['language']}), {tr['review_count']} para revisar")


def stage_plan(proj, ctx, log, prog, pdir):
    tr = current_transcript(pdir)
    if not tr:
        raise VSError("INPUT_INVALID", "Falta la transcripción: ejecuta «Analizar audio» o pega la transcripción a mano.")
    cfg = dict(proj["settings"])
    old = current_plan(pdir)
    th = transcript_hash(tr)
    same_audio = old and old.get("audio", {}).get("sha256") == (proj.get("audio") or {}).get("sha256")
    if old and same_audio and not cfg.get("replan"):
        if old.get("transcript_hash") == th:
            prog(1, "Storyboard ya existe (usa «Regenerar storyboard» para rehacerlo)")
            return
        save_plan(pdir, refresh_plan_words(old, tr), "transcripción corregida: solo palabras y subtítulos")
        prog(1, "Storyboard conservado; palabras y subtítulos actualizados")
        return
    mn, mx = scene_bounds(cfg)
    if (proj.get("audio") or {}).get("narration_source") == "tts_script":
        mn = min(mn, float(cfg.get("scene_min_s") or 1.4))  # guion: cada frase puede ser su propio plano
    cfg.update(scene_min_s=mn, scene_max_s=mx)
    prog(0.1, "Entendiendo la historia y eligiendo planos…")
    plan = SB.plan_from_transcript(tr, proj["audio"], cfg, log=log, cancel=ctx.cancel_flag,
                                   previous_bible=(old or {}).get("visual_bible") if cfg.get("keep_bible", True) else None,
                                   use_llm=bool(cfg.get("auto_storyboard", True)))
    plan["transcript_hash"] = th
    plan["settings"] = {k: cfg.get(k) for k in ("format", "fps", "visual_style", "captions", "music", "sfx", "pace_visual")}
    save_plan(pdir, plan, "storyboard " + plan["planner"])
    from . import direction_quality as DQ
    gate = DQ.enforce(plan, pdir, strict=False)
    proj["quality_gate"] = {k: gate[k] for k in ("status", "fail_count", "review_count", "render_engine")}
    proj["quality_gate"]["examples"] = [f"Escena {x['scene']}: {x['detail']}" for x in gate["issues"] if x["severity"] == "FAIL"][:4]
    proj["settings"].pop("replan", None)
    proj.setdefault("bible", {})["title"] = proj["bible"].get("title") or (proj.get("audio") or {}).get("original_name", "Mi audio")
    proj["plan"] = {"version": plan["plan_version"], "scenes": len(plan["scenes"]), "planner": plan["planner"]}
    prog(1, f"Storyboard: {len(plan['scenes'])} escenas ({plan['planner']})")


def stage_narration(proj, ctx, log, prog, pdir):
    """Guion → pista de narración continua (motor ilustrado en tema/guion).
    Une las voces de cada escena en el orden del guion con pausas naturales y alinea CADA palabra
    del guion (texto exacto, no lo que entienda el ASR) con su tiempo absoluto: tiempos de
    faster-whisper del worker de voz cuando existen; si no, reparto por sílabas (marcado).
    Desde aquí, plan/music/build/render/qa son los del modo audio."""
    from . import audio as AUD
    from . import audio_ingest as AI
    from .compiler import _align
    from .textutil import emphasis_words, syllables_es, words as split_words

    scenes = [s for s in proj.get("scenes", []) if (s.get("narration") or "").strip()]
    if not scenes:
        raise VSError("INPUT_INVALID", "El guion no tiene texto narrable.")
    miss = [s["id"] for s in scenes if not (s.get("audio") and os.path.exists(s["audio"].get("file", "")))]
    if miss:
        raise VSError("TTS_FAILED", f"Faltan voces de {len(miss)} escena(s): ejecuta la etapa de voz.")
    # misma voz y mismo texto → la narración ya existe (conserva las correcciones de subtítulos)
    import hashlib

    sig = hashlib.sha256(json.dumps([[s["narration"], AI.sha256_file(s["audio"]["file"])] for s in scenes]).encode()).hexdigest()[:24]
    a0 = proj.get("audio") or {}
    if a0.get("voice_sig") == sig and os.path.exists(_p(pdir, a0.get("master_path") or "-")):
        prog(1, "Narración ya montada (misma voz y mismo guion)")
        return
    import numpy as np

    SR = AUD.SR
    lead, gap, tail = 0.3, 0.32, 0.6
    clips, words, t = [], [], lead
    estimated = 0
    for k, s in enumerate(scenes):
        x = AUD.read_wav(s["audio"]["file"])
        dur = len(x) / SR
        toks = split_words(s["narration"])
        emph = emphasis_words(s["narration"])
        timed = (s["audio"].get("words") or [])
        if timed:
            ws = _align(toks, timed, t)
        else:  # sin tiempos de palabra: reparto por sílabas dentro del clip (marcado como estimado)
            syl = [syllables_es(w) + (1.2 if w[-1:] in ".,;:!?" else 0) for w in toks]
            tot, acc, ws = sum(syl) or 1, 0.0, []
            for w, n in zip(toks, syl):
                ws.append({"w": w, "s": t + dur * acc / tot, "e": t + dur * (acc + n * 0.92) / tot})
                acc += n
            estimated += len(toks)
        for i, w in enumerate(ws):
            words.append({"text": w["w"], "start_s": round(max(t, w["s"]), 3), "end_s": round(min(t + dur, max(w["e"], w["s"] + 0.04)), 3),
                          "confidence": None, "timing": "aligned" if timed else "estimated", "emph": i in emph, "scene_src": s["id"]})
        clips.append((t, x))
        t += dur + (gap if k < len(scenes) - 1 else tail)
        if ctx.cancel_flag():
            raise RuntimeError("Cancelado")
    total = t
    buf = np.zeros(int(np.ceil(total * SR)) + 1, np.float32)
    for t0, x in clips:
        i = int(round(t0 * SR))
        buf[i:i + len(x)] += x[: len(buf) - i]
    adir = _p(pdir, "audio")
    os.makedirs(adir, exist_ok=True)
    master = _p(adir, "source_voice_master.wav")
    AUD.write_wav(master + ".tmp.wav", buf[: int(round(total * SR))])
    os.replace(master + ".tmp.wav", master)
    AI.decode(master, _p(adir, "analysis_16k.wav"), AI.ANALYSIS_SR, 1)
    x16 = AI.read_mono(_p(adir, "analysis_16k.wav"))
    mi = AI.wav_info(master)
    with open(_p(adir, "waveform.json"), "w") as f:
        json.dump({"duration_s": mi["duration_s"], "peaks": AI.waveform_peaks(AI.read_mono(master), 2000)}, f, separators=(",", ":"))
    from .textutil import tts_clean

    digest = AI.sha256_file(master)
    eng = proj["settings"].get("tts_engine") or settings().get("tts_engine")
    proj["audio"] = {
        "original_name": "narración del guion (" + str(eng) + ")", "original_path": "audio/source_voice_master.wav",
        "master_path": "audio/source_voice_master.wav", "analysis_path": "audio/analysis_16k.wav", "waveform_path": "audio/waveform.json",
        "sha256": digest, "size_bytes": os.path.getsize(master), "duration_s": round(mi["duration_s"], 6), "sample_rate": mi["sample_rate"],
        "channels": mi["channels"], "source_sample_rate": mi["sample_rate"], "source_channels": mi["channels"],
        "probe": {"codec": "pcm_s16le (TTS)", "format_name": "wav"}, "loudness": AI.loudness_stats(x16, AI.ANALYSIS_SR),
        "silences": AI.silence_regions(x16, AI.ANALYSIS_SR), "extracted_from_video": False, "uploaded_at": time.time(),
        "narration_source": "tts_script", "tts_engine": eng, "voice_sig": sig,
        "script_text": " ".join(tts_clean(s["narration"]) for s in scenes),
    }
    raw = {"engine": f"guion + {eng}", "model": "alineación faster-whisper del worker de voz", "device": None,
           "language": proj["settings"].get("language", "es"), "words": words, "segments": [],
           "alignment": {"method": "script+whisper" if not estimated else "script+estimado",
                         "note": "texto EXACTO del guion; tiempos de la voz sintetizada" + (f" ({estimated} palabras con tiempo estimado)" if estimated else "")},
           "diarization": {"method": "single", "note": "narrador único (voz del guion)"}}
    tr = ASR.build_transcript(raw, mi["duration_s"], source="script_tts")
    tr["audio_sha256"] = digest
    write_json(_p(pdir, "transcript", "transcript_raw.json"), tr)
    ed = _p(pdir, "transcript", "transcript_edited.json")
    if os.path.exists(ed):
        os.replace(ed, ed + ".old")
    proj["transcript"] = {"status": "script", "words": len(tr["words"]), "language": tr["language"], "review_count": tr["review_count"],
                          "engine": raw["engine"], "alignment": raw["alignment"]["method"]}
    proj["settings"]["duration"] = round(mi["duration_s"], 3)
    log(f"[narración] {len(scenes)} escenas · {len(words)} palabras del guion · {mi['duration_s']:.2f}s · {raw['alignment']['note']}")
    prog(1, f"Narración continua lista: {mi['duration_s']:.1f}s")


def stage_music(proj, ctx, log, prog, pdir):
    cfg = proj["settings"]
    if not cfg.get("music"):
        prog(1, "Sin música (desactivada: solo la narración original)")
        proj["outputs"].pop("music", None)
        return
    from . import music

    plan = current_plan(pdir)
    total = plan["video"]["frame_count"] / plan["video"]["fps"]
    out = _p(pdir, "audio", "music.wav")
    if proj["outputs"].get("music") and os.path.exists(out):
        prog(1, "Música ya compuesta")
        return
    tags = cfg.get("music_prompt") or "soft curious documentary underscore, light pizzicato, warm pads, instrumental"
    try:
        proj["outputs"]["music"] = music.generate(tags, total, out, progress=prog, cancel=ctx.cancel_flag, log=log)
    except Exception as e:
        log(f"[música] no disponible ({str(e)[:200]}); el video seguirá solo con la narración")
        proj["outputs"]["music"] = None


def sfx_events(plan):
    """SFX con causa en pantalla: whoosh en transiciones, pop al aparecer cifras."""
    ev = []
    for s in plan["scenes"]:
        if s.get("transition_in") in ("whip", "zoom"):
            ev.append((s["start_s"], "whoosh", 0.5))
        for o in s.get("overlays", []):
            if o["type"] in ("counter_badge", "multiplier", "neon_number", "kinetic_title") and o.get("at_s") is not None:
                ev.append((o["at_s"], "pop", 0.45))
    return ev


def build_audio_mode_tracks(master, total, out_path, music=None, sfx=None, sfx_folder=None, music_volume=0.12, loudnorm=False, log=print):
    """Mezcla del modo audio. La narración ORIGINAL entra entera y continua
    (sin cortes, sin cambio de velocidad, misma posición temporal); se rellena
    con silencio hasta el final del último frame. Música/SFX van por debajo
    (la música se atenúa con sidechain cuando hay voz). Devuelve la ruta."""
    from . import audio as AUD

    tmp_dir = os.path.dirname(out_path)
    os.makedirs(tmp_dir, exist_ok=True)
    from .audio_ingest import wav_info

    inputs = ["-i", master]
    # mono → estéreo copiando el canal tal cual (aformat haría un upmix a −3 dB)
    up = "pan=stereo|c0=c0|c1=c0," if wav_info(master)["channels"] == 1 else ""
    chain = [f"[0:a]aresample=48000,{up}aformat=sample_rates=48000:channel_layouts=stereo,apad=whole_dur={total:.6f}[v]"]
    mix_in = ["[v]"]
    if sfx:
        import numpy as np

        n = int(total * AUD.SR) + AUD.SR
        buf = np.zeros(n, np.float32)
        lib = AUD.SfxLib(sfx_folder or "")
        for t, kind, vol in sfx:
            x, pk = lib.get(kind)
            if x is None:
                continue
            i = max(0, int((t - pk) * AUD.SR))
            m = min(len(x), n - i)
            if m > 0:
                buf[i:i + m] += x[:m] * vol
        sp = os.path.join(tmp_dir, "sfx.wav")
        AUD.write_wav(sp, buf[: int(total * AUD.SR)])
        inputs += ["-i", sp]
        chain.append(f"[{len(inputs) // 2 - 1}:a]aformat=sample_rates=48000:channel_layouts=stereo[s]")
        mix_in.append("[s]")
    if music and os.path.exists(music):
        inputs += ["-stream_loop", "-1", "-i", music]
        k = len([x for x in inputs if x == "-i"]) - 1
        chain[0] = chain[0].replace("[v]", "[v0]") + ";[v0]asplit=2[v][vk]"
        chain.append(f"[{k}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:{total:.3f},afade=t=in:d=1.0,"
                     f"afade=t=out:st={max(0, total - 2):.3f}:d=2,volume={music_volume * 2:.3f}[m0];"
                     f"[m0][vk]sidechaincompress=threshold=0.02:ratio=8:attack=10:release=400:makeup=1[m]")
        mix_in.append("[m]")
    if len(mix_in) == 1:
        fc = ";".join(chain) + ";[v]anull[out]"
    else:
        # normalize=0: la voz se suma tal cual (su nivel no cambia por añadir capas)
        fc = ";".join(chain) + ";" + "".join(mix_in) + f"amix=inputs={len(mix_in)}:normalize=0:duration=first[out]"
    pre = out_path + ".pre.wav" if loudnorm else out_path + ".tmp.wav"
    r = subprocess.run(["ffmpeg", "-nostdin", "-y", "-loglevel", "error", *inputs, "-filter_complex", fc, "-map", "[out]",
                        "-t", f"{total:.6f}", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", pre], capture_output=True, text=True)
    if r.returncode != 0:
        raise VSError("FFMPEG_FAILED", "No se pudo mezclar el audio: " + r.stderr[-600:])
    if loudnorm:
        # normalización LINEAL (solo ganancia): no altera tiempos ni forma de onda relativa
        m = subprocess.run(["ffmpeg", "-hide_banner", "-i", pre, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
                           capture_output=True, text=True)
        try:
            j = json.loads(m.stderr[m.stderr.rindex("{"): m.stderr.rindex("}") + 1])
            gain = -14.0 - float(j["input_i"])
            peak = float(j["input_tp"])
            gain = min(gain, -1.5 - peak)
        except Exception:
            gain = 0.0
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", pre, "-af", f"volume={gain:.2f}dB", "-c:a", "pcm_s16le", out_path + ".tmp.wav"], check=True)
        os.remove(pre)
        log(f"[audio] ganancia lineal {gain:+.2f} dB (sin compresión ni cambio de tiempos)")
    os.replace(out_path + ".tmp.wav", out_path)
    return out_path


def stage_build(proj, ctx, log, prog, pdir):
    from . import vector_compiler as VC
    from .config import sfx_dir

    plan = current_plan(pdir)
    if not plan:
        raise VSError("INPUT_INVALID", "Falta el storyboard: ejecuta «Analizar audio».")
    TL.validate_plan(plan, VA.all_ids())
    from . import direction_quality as DQ
    DQ.enforce(plan, pdir, strict=proj.get("settings", {}).get("professional_gate", True))
    man = VA.manifest(plan)
    if man["missing"]:
        raise VSError("INPUT_INVALID", f"Assets no registrados en la biblioteca: {', '.join(man['missing'])}")
    cfg = proj["settings"]
    v = plan["video"]
    total = v["frame_count"] / v["fps"]
    hf = _p(pdir, "hf")
    adir = _p(hf, "assets", "audio")
    os.makedirs(adir, exist_ok=True)
    prog(0.1, "Preparando la pista: narración original continua…")
    master = _p(pdir, proj["audio"]["master_path"])
    mixp = build_audio_mode_tracks(master, total, _p(adir, "mix.wav"), music=(proj["outputs"] or {}).get("music") if cfg.get("music") else None,
                                   sfx=sfx_events(plan) if cfg.get("sfx") else None, sfx_folder=sfx_dir(),
                                   music_volume=float(cfg.get("music_volume") or 0.12),
                                   loudnorm=bool(cfg.get("audio_loudnorm")) and not cfg.get("preserve_original_audio", True), log=log)
    plan["captions"]["enabled"] = cfg.get("captions", "explainer") != "none"
    prog(0.5, "Escribiendo escenas SVG (HyperFrames)…")
    info = VC.build(plan, hf, mixp, title=(proj.get("bible") or {}).get("title") or "Viral Studio")
    proj["outputs"]["hf"] = hf
    proj["outputs"]["info"] = info
    proj["total"] = info["total"]
    from . import render as _render
    from .config import hyperframes_cmd

    ok = True
    if hyperframes_cmd()[0] != "npx":  # sin CLI instalada no se descarga nada solo para el lint
        try:
            ok, _ = _render.lint(hf, log=log)
        except Exception as e:
            log(f"[lint] no se pudo ejecutar: {e}")
    prog(1, ("" if ok else "(revisa el lint) ") + f"Proyecto listo: {len(info['chapters'])} escenas, {info['captions']} grupos de subtítulos")


def assemble_audio_mode(parts, mix_wav, out_mp4, fps, log=print):
    """Une las escenas (copia de video) y añade la mezcla SIN -shortest: el video
    dura frame_count/fps y el audio conserva toda la narración."""
    lst = out_mp4 + ".txt"
    with open(lst, "w") as f:
        for p in parts:
            f.write(f"file '{os.path.abspath(p)}'\n")
    tmp = out_mp4 + ".tmp.mp4"
    cmd = ["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-i", mix_wav,
           "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-movflags", "+faststart", tmp]
    r = subprocess.run(cmd, capture_output=True, text=True)
    os.remove(lst)
    if r.returncode != 0:
        raise VSError("FFMPEG_FAILED", "ffmpeg no pudo unir el video:\n" + r.stderr[-1200:])
    os.replace(tmp, out_mp4)
    log(f"[render] video final: {out_mp4}")
    return out_mp4


def stage_render(proj, ctx, log, prog, pdir):
    from . import render
    from .textutil import slug

    cfg = proj["settings"]
    # También comprobar si se reutiliza un build antiguo (caché de v1.1).
    from . import direction_quality as DQ
    live_plan = current_plan(pdir)
    if not live_plan:
        raise VSError("INPUT_INVALID", "No existe storyboard que renderizar.")
    DQ.enforce(live_plan, pdir, strict=cfg.get("professional_gate", True))
    if not (proj["outputs"] or {}).get("info"):
        stage_build(proj, ctx, log, lambda f, m="": None, pdir)
    hf = proj["outputs"]["hf"]
    info = proj["outputs"]["info"]
    gpu = bool(os.environ.get("VS_GPU_ENCODE"))
    parts = render.render_parts(hf, info, quality=cfg.get("quality", "high"), workers=settings().get("render_workers", "auto"),
                                fps=int(info["fps"]), progress=lambda f, m: prog(f * 0.93, m), log=log, cancel=ctx.cancel_flag, gpu=gpu)
    out = _p(pdir, "out")
    os.makedirs(out, exist_ok=True)
    name = slug((proj.get("bible") or {}).get("title") or (proj.get("audio") or {}).get("original_name") or "mi-audio")
    final = _p(out, f"{name}.mp4")
    assemble_audio_mode(parts, _p(hf, "assets", "audio", "mix.wav"), final, info["fps"], log=log)
    prog(0.96, "Miniatura, subtítulos y exportables…")
    thumb = _p(out, "miniatura.jpg")
    try:
        render.thumbnail(final, thumb, t=min(1.5, info["total"] / 3))
    except Exception:
        thumb = None
    shutil.copy(_p(hf, "captions.srt"), _p(out, f"{name}.srt"))
    # exportables: original intacto, master, transcripción, storyboard, manifiestos
    exp = _p(out, "export")
    os.makedirs(exp, exist_ok=True)
    src = _p(pdir, proj["audio"]["original_path"])
    shutil.copy(src, _p(exp, "narracion_original" + os.path.splitext(src)[1]))
    shutil.copy(_p(pdir, proj["audio"]["master_path"]), _p(exp, "narracion_master_48k.wav"))
    shutil.copy(_p(hf, "assets", "audio", "mix.wav"), _p(exp, "mezcla_final.wav"))
    for fn in ("audio_plan.json", "storyboard.json", "visual_bible.json", "asset_manifest.json", "timed_words.json"):
        if os.path.exists(_p(pdir, "plan", fn)):
            shutil.copy(_p(pdir, "plan", fn), _p(exp, fn))
    tr = current_transcript(pdir)
    if tr:
        write_json(_p(exp, "transcripcion.json"), tr)
    proj["outputs"].update(video=final, thumb=thumb, srt=_p(out, f"{name}.srt"), parts=parts, export=exp, video_light=None, meta=None)
    proj.pop("approval", None)
    prog(1, "Video renderizado")


def stage_qa(proj, ctx, log, prog, pdir):
    from . import manifest
    from . import qa_audio_mode as QAA

    v = (proj.get("outputs") or {}).get("video")
    if not v or not os.path.exists(v):
        raise RuntimeError("QA: no hay video renderizado que revisar")
    plan = current_plan(pdir)
    prog(0.2, "QA: duración, continuidad de la voz, sincronía, cobertura, fotogramas…")
    rep = QAA.run(v, plan, proj, pdir, log=log)
    proj["qa"] = rep
    out = os.path.dirname(v)
    manifest.write_all(proj, out, proj["outputs"].get("parts"), rep)
    write_json(_p(out, "manifests", "qa_audio_mode.json"), rep)
    for c in rep["checks"]:
        log(f"[QA] {c['status']:6s} {c['check']}: {c['detail']}")
    prog(1, f"QA: {rep['status']} — {'pendiente de tu aprobación' if rep['status'] != 'FAIL' else 'revisa los fallos'}")


AUDIO_STAGE_FN = {"transcribe": stage_transcribe, "plan": stage_plan, "music": stage_music, "build": stage_build,
                  "render": stage_render, "qa": stage_qa, "narration": stage_narration}
