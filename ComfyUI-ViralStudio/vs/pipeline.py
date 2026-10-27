"""Orquestador de Viral Studio: proyectos en disco + una cola de trabajos que
ejecuta las etapas (guion → voz → música → montaje → render) en segundo plano."""
import json
import os
import queue
import re
import shutil
import threading
import time
import traceback
import uuid
import hashlib
from .guidance import scope as guidance_scope, validate as validate_guidance

from . import audio as AUD
from . import compiler, llm, manifest, music, qa, render, voice
from .errors import describe
from .config import data_dir, presets, projects_dir, settings, sfx_dir
from .textutil import slug, strip_emphasis

STAGES = ["story", "voice", "music", "build", "render", "qa"]
WEIGHTS = {"story": 0.14, "voice": 0.2, "music": 0.08, "build": 0.06, "render": 0.5, "qa": 0.02, "transcribe": 0.16, "plan": 0.06,
           "narration": 0.03}
INPUT_MODES = ("topic", "script", "audio")
_jobs = queue.Queue()
_state = {}  # id -> estado vivo
_lock = threading.RLock()
_worker = None


# ------------------------------------------------------------------ proyectos
def pdir(pid):
    return os.path.join(projects_dir(), pid)


def load(pid):
    with open(os.path.join(pdir(pid), "project.json"), "r", encoding="utf-8") as f:
        return json.load(f)


def save(proj):
    with _lock:
        d = pdir(proj["id"])
        os.makedirs(d, exist_ok=True)
        proj["updated"] = time.time()
        tmp = os.path.join(d, "project.json.tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(proj, f, ensure_ascii=False, indent=1)
        os.replace(tmp, os.path.join(d, "project.json"))


def input_mode(proj_or_cfg):
    """Modo de entrada. Proyectos antiguos no tienen el campo: se deduce como
    antes (guion si hay script, si no tema) sin reescribir su project.json."""
    cfg = proj_or_cfg.get("settings", proj_or_cfg) if isinstance(proj_or_cfg, dict) else {}
    m = cfg.get("input_mode")
    if m in INPUT_MODES:
        return m
    return "script" if cfg.get("script") else "topic"


def engine(proj_or_cfg):
    """Motor de animación: "vector" (ilustrado, estilo explicativo) o "classic" (canvas original).
    Los proyectos antiguos no tienen el campo → classic (siguen exactamente igual)."""
    cfg = proj_or_cfg.get("settings", proj_or_cfg) if isinstance(proj_or_cfg, dict) else {}
    if input_mode(cfg) == "audio":
        return "vector"
    return "vector" if cfg.get("engine") == "vector" else "classic"


def stage_order(proj):
    from .audio_mode import AUDIO_STAGES, VECTOR_STAGES

    if input_mode(proj) == "audio":
        return AUDIO_STAGES
    return VECTOR_STAGES if engine(proj) == "vector" else STAGES


def stage_function(proj, st):
    """Función de una etapa según modo y motor."""
    from .audio_mode import AUDIO_STAGE_FN

    if input_mode(proj) == "audio" or (engine(proj) == "vector" and st not in ("story", "voice")):
        return lambda p, ctx, log, prog: AUDIO_STAGE_FN[st](p, ctx, log, prog, pdir(p["id"]))
    return STAGE_FN[st]


def defaults(cfg):
    if (cfg or {}).get("input_mode") == "audio":
        from .audio_mode import AUDIO_DEFAULTS, validate_settings

        out = dict(AUDIO_DEFAULTS)
        out["fps"] = settings().get("fps", 30)
        out["quality"] = settings().get("render_quality", "high")
        for k, v in (cfg or {}).items():
            if v not in (None, ""):
                out[k] = v
        out["input_mode"] = "audio"
        out["script"] = ""
        out.setdefault("duration", 0)
        return validate_settings(out)
    P = presets()
    vt = P["video_types"].get(cfg.get("video_type") or "historia_oscura") or {}
    out = {
        "topic": "", "duration": 60, "format": "vertical", "video_type": "historia_oscura", "language": "es",
        "style": vt.get("style", "cine_oscuro"), "captions": vt.get("captions", "karaoke"), "voice": vt.get("voice", "narrador_epico"),
        "music": True, "music_prompt": vt.get("music", ""), "pace": "normal", "fps": settings().get("fps", 30),
        "quality": settings().get("render_quality", "high"), "extra": "", "script": "", "end_card": True,
    }
    for k, v in (cfg or {}).items():
        if v not in (None, ""):
            out[k] = v
    out["duration"] = max(10, min(3600, int(float(out["duration"]))))
    out["input_mode"] = "script" if out.get("script") else (out.get("input_mode") if out.get("input_mode") in ("topic", "script") else "topic")
    # proyectos NUEVOS de tema/guion: motor ilustrado por defecto (el clásico se elige con engine="classic")
    out["engine"] = "classic" if (cfg or {}).get("engine") == "classic" else "vector"
    if out["engine"] == "vector":
        from .audio_mode import VECTOR_DEFAULTS, validate_settings

        for k, v in VECTOR_DEFAULTS.items():
            if k not in (cfg or {}) or k in ("end_card", "preserve_original_audio"):
                out[k] = v
        if out.get("captions") not in ("none",):
            out["captions"] = "explainer"
        validate_settings(out)
    return out


def create(cfg, request_id=None):
    repairs=(cfg or {}).get('pc_max_repairs',0)
    if isinstance(repairs,bool) or not isinstance(repairs,int) or not 0<=repairs<=3:
        raise ValueError('Máximo de correcciones no válido (0 a 3).')
    guide = validate_guidance((cfg or {}).get('animation_guidance'))
    if guide:
        cfg = dict(cfg, animation_guidance=guide)
    if request_id:
        if not re.fullmatch(r'[A-Za-z0-9_-]{16,128}', request_id):
            raise ValueError('Idempotency-Key inválida.')
        fingerprint = hashlib.sha256(json.dumps(cfg, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        with _lock:
            for item in list_all():
                prior = load(item['id'])
                if prior.get('client_request_id') == request_id:
                    if prior.get('client_request_hash') != fingerprint:
                        raise ValueError('Esta solicitud ya existe con otros ajustes.')
                    return dict(prior, _request_replayed=True)
            proj = create(cfg)
            proj.update(client_request_id=request_id, client_request_hash=fingerprint)
            save(proj)
            return proj
    cfg = defaults(cfg)
    pid = time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:4]
    proj = {"id": pid, "created": time.time(), "settings": cfg, "bible": {}, "scenes": [], "outputs": {},
            "status": {"stage": "nuevo", "progress": 0, "message": "Proyecto creado", "done": [], "error": None}}
    save(proj)
    return proj


def list_all():
    out = []
    for d in sorted(os.listdir(projects_dir()), reverse=True):
        try:
            p = load(d)
            out.append({"id": p["id"], "title": (p.get("bible") or {}).get("title") or p["settings"].get("topic", "")[:60]
                        or (p.get("audio") or {}).get("original_name", ""), "input_mode": input_mode(p),
                        "format": p["settings"].get("format"), "duration": p["settings"].get("duration"),
                        "style": p["settings"].get("style"), "status": live_status(p), "video": p["outputs"].get("video"),
                        "thumb": p["outputs"].get("thumb"), "created": p.get("created")})
        except Exception:
            continue
    return out


def live_status(proj):
    st = _state.get(proj["id"])
    return dict(st) if st else proj.get("status", {})


def delete(pid):
    cancel(pid)
    shutil.rmtree(pdir(pid), ignore_errors=True)


def update_scene(pid, idx, fields):
    proj = load(pid)
    sc = proj["scenes"][idx]
    if "narration" in fields and fields["narration"] != sc.get("narration"):
        sc.pop("audio", None)
    for k, v in fields.items():
        if k in ("id", "audio", "start", "dur", "pre"):
            continue
        if v in (None, ""):
            sc.pop(k, None)
        else:
            sc[k] = v
    proj["scenes"][idx] = sc
    save(proj)
    return sc


def insert_scene(pid, idx, scene=None):
    proj = load(pid)
    sc = scene or {"narration": "Nueva escena.", "shot": "scene", "env": "void"}
    sc = llm.normalize_scene(sc, (proj.get("bible") or {}).get("cast") or {}, len(proj["scenes"]) + 1)
    sc["id"] = "s" + uuid.uuid4().hex[:6]
    proj["scenes"].insert(idx, sc)
    save(proj)
    return proj


def remove_scene(pid, idx):
    proj = load(pid)
    proj["scenes"].pop(idx)
    save(proj)
    return proj


def move_scene(pid, idx, to):
    proj = load(pid)
    sc = proj["scenes"].pop(idx)
    proj["scenes"].insert(max(0, min(len(proj["scenes"]), to)), sc)
    save(proj)
    return proj


# ------------------------------------------------------------------ guion propio sin LLM
def script_to_scenes(text, cast):
    """Divide un guion propio en escenas SIN cambiar una palabra y elige plano,
    escenario y acción a partir de lo que dice cada frase (fidelidad)."""
    from .fidelity import action_from_text, env_from_text, time_from_text, weather_from_text

    parts = [p.strip() for p in re.split(r"\n\s*\n|(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÑ¿¡«\"])", text.strip()) if p.strip()]
    scenes, cur = [], ""
    for p in parts:
        cur = (cur + " " + p).strip()
        if len(cur.split()) >= 7:
            scenes.append(cur)
            cur = ""
    if cur:
        if scenes and len(cur.split()) < 4:
            scenes[-1] += " " + cur
        else:
            scenes.append(cur)
    out = []
    first = next(iter(cast), None)
    env_prev, time_prev = env_from_text(text, "void"), time_from_text(text)
    for i, t in enumerate(scenes):
        env = env_from_text(t, env_prev)
        tm = time_from_text(t, time_prev)
        env_prev, time_prev = env, tm
        sc = {"narration": t, "shot": "scene", "env": env, "time": tm}
        w = weather_from_text(t)
        if w:
            sc["weather"] = w
        clean = strip_emphasis(t)
        y = re.search(r"\b(1[0-9]{3}|20[0-9]{2})\b", clean)
        n = re.search(r"\b(\d{1,3}(?:[.,]\d{3})+|\d{3,})\b", clean)
        act = action_from_text(t)
        if y:
            sc.update(shot="year", year=int(y.group(1)))
        elif n and (not y or n.group(1) != y.group(1)):
            sc.update(shot="number", number=re.sub(r"[.,]", "", n.group(1)))
        elif re.search(r"[«\"“]([^»\"”]{8,})[»\"”]", t):
            sc.update(shot="quote", quote=re.search(r"[«\"“]([^»\"”]{8,})[»\"”]", t).group(1))
        elif act == "lie" or (i == 0 and act in ("shock", "scared")):
            sc.update(shot="closeup" if act != "lie" else "scene", mood="tension")
        elif env == "study":
            sc.update(shot="desk")
        elif i == 0:
            sc.update(shot="closeup", mood="tension", sfx="impact")
        if first and sc["shot"] in ("scene", "closeup", "desk"):
            sc["chars"] = [{"who": first, "action": act if sc["shot"] != "desk" else "idle"}]
        out.append(llm.normalize_scene(sc, cast, i + 1))
    return out


# ------------------------------------------------------------------ etapas
class Ctx:
    def __init__(self, pid, stages):
        self.pid = pid
        self.stages = stages
        self.cancelled = False
        self.t0 = time.time()

    def cancel_flag(self):
        return self.cancelled or _state.get(self.pid, {}).get("cancel")


def _set(pid, **kw):
    with _lock:
        st = _state.setdefault(pid, {"stage": "", "progress": 0, "message": "", "log": [], "done": [], "error": None})
        log = kw.pop("log", None)
        st.update(kw)
        if log:
            st["log"] = (st.get("log", []) + [time.strftime("%H:%M:%S ") + log])[-300:]


def _logger(pid):
    def log(msg):
        print(f"[ViralStudio:{pid}] {msg}")
        _set(pid, log=str(msg))
    return log


def _progress(pid, stage, stages):
    order = list(stages)
    before = sum(WEIGHTS[s] for s in order[: order.index(stage)])
    tot = sum(WEIGHTS[s] for s in order) or 1

    def cb(frac, msg=""):
        _set(pid, stage=stage, stage_progress=round(frac, 3), progress=round((before + WEIGHTS[stage] * min(1, frac)) / tot, 3), message=msg)
    return cb


def stage_story(proj, ctx, log, prog):
    cfg = proj["settings"]
    if cfg.get("script"):
        log("[guion] usando el guion propio del creador")
        bible = proj.get("bible") or {}
        bible.setdefault("title", cfg["topic"][:70] or "Mi video")
        bible.setdefault("cast", {"protagonista": {"name": "Protagonista", "hair": "short"}})
        scenes = None
        try:
            bible2, scenes = llm.visualize_script(cfg, log=log, progress=prog, cancel=ctx.cancel_flag)
            bible.update({k: v for k, v in bible2.items() if v})
            log("[guion] tu guion se repartió en escenas con el LLM, palabra por palabra")
        except Exception as e:
            if cfg.get('animation_guidance'):
                raise ValueError('No se pudo aplicar la guía Markdown al guion. Revisa Qwen y reintenta; no se usará un reparto sin guía.') from e
            log(f"[guion] sin LLM ({e}); escenas por palabras clave")
        if not scenes:
            if cfg.get('animation_guidance'):
                raise ValueError('Qwen no devolvió escenas con la guía seleccionada. No se usará un reparto sin guía.')
            scenes = script_to_scenes(cfg["script"], bible["cast"])
        from .fidelity import check_story

        scenes, bible["fidelity"] = check_story(scenes, bible["cast"])
        prog(1, f"{len(scenes)} escenas desde tu guion")
    else:
        bible, scenes = llm.write_story(cfg, log=log, progress=prog, cancel=ctx.cancel_flag)
    if cfg.get("end_card") and scenes and scenes[-1]["shot"] != "end":
        scenes.append(llm.normalize_scene({"narration": "", "shot": "end", "label": bible.get("title", ""), "cta": "SUSCRÍBETE", "env": "void"},
                                          bible.get("cast") or {}, len(scenes) + 1))
        scenes[-1]["hold"] = 2.6
    proj["bible"], proj["scenes"] = bible, scenes
    save(proj)


def stage_voice(proj, ctx, log, prog):
    vdir = os.path.join(pdir(proj["id"]), "voice")
    todo = [{"id": s["id"], "text": s["narration"]} for s in proj["scenes"]
            if s.get("narration") and not (s.get("audio") and os.path.exists(s["audio"].get("file", "")))]
    if not todo:
        prog(1, "Voz ya generada")
        return
    res = voice.synthesize(todo, proj["settings"], vdir, progress=prog, log=log, cancel=ctx.cancel_flag)
    for s in proj["scenes"]:
        r = res.get(s["id"])
        if r:
            s["audio"] = {"file": r["file"], "dur": r["dur"], "words": r.get("words") or []}
    save(proj)


def stage_music(proj, ctx, log, prog):
    cfg = proj["settings"]
    if not cfg.get("music"):
        prog(1, "Sin música (desactivada)")
        return
    total = compiler.assign_timeline(proj["scenes"], int(cfg.get("fps", 30)), cfg.get("pace", "normal"))
    out = os.path.join(pdir(proj["id"]), "audio", "music.wav")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if proj["outputs"].get("music") and os.path.exists(out) and AUD.duration(out) >= total - 1:
        prog(1, "Música ya compuesta")
        return
    tags = cfg.get("music_prompt") or (proj.get("bible") or {}).get("music") or "cinematic instrumental underscore"
    bible_tags = (proj.get("bible") or {}).get("music")
    if bible_tags and bible_tags not in tags:
        tags = bible_tags + ", " + tags
    try:
        path = music.generate(tags, total, out, progress=prog, cancel=ctx.cancel_flag, log=log)
    except Exception as e:
        log(f"[música] no se pudo generar ({e}); el video seguirá sin música")
        path = None
    proj["outputs"]["music"] = path
    save(proj)


def stage_build(proj, ctx, log, prog):
    cfg = proj["settings"]
    fps = int(cfg.get("fps", 30))
    total = compiler.assign_timeline(proj["scenes"], fps, cfg.get("pace", "normal"))
    proj["total"] = total
    d = pdir(proj["id"])
    hf = os.path.join(d, "hf")
    adir = os.path.join(hf, "assets", "audio")
    os.makedirs(adir, exist_ok=True)
    prog(0.1, "Mezclando voz, efectos y música…")
    s = settings()
    vp, sp = AUD.build_tracks(proj["scenes"], total, sfx_dir(), adir, sfx_volume=float(s.get("sfx_volume", 0.55)))
    mixp = AUD.mix(vp, sp, proj["outputs"].get("music"), total, os.path.join(adir, "mix.wav"), music_volume=float(cfg.get("music_volume") or s.get("music_volume", 0.16)))
    prog(0.6, "Escribiendo el proyecto HyperFrames…")
    info = compiler.build(proj, hf, mixp)
    proj["outputs"]["hf"] = hf
    proj["outputs"]["info"] = info
    save(proj)
    ok, out = render.lint(hf, log=log)
    prog(1, f"Proyecto listo: {len(info['chapters'])} capítulo(s), {info['captions']} subtítulos" + ("" if ok else " (revisa el lint)"))


def stage_render(proj, ctx, log, prog):
    cfg = proj["settings"]
    if not proj["outputs"].get("info"):
        stage_build(proj, ctx, log, lambda f, m="": None)
    hf = proj["outputs"]["hf"]
    info = proj["outputs"]["info"]
    gpu = bool(os.environ.get("VS_GPU_ENCODE"))
    parts = render.render_parts(hf, info, quality=cfg.get("quality", "high"), workers=settings().get("render_workers", "auto"),
                                fps=int(cfg.get("fps", 30)), progress=lambda f, m: prog(f * 0.95, m), log=log, cancel=ctx.cancel_flag, gpu=gpu)
    d = pdir(proj["id"])
    out_dir = os.path.join(d, "out")
    os.makedirs(out_dir, exist_ok=True)
    name = slug((proj.get("bible") or {}).get("title") or cfg.get("topic"))
    final = os.path.join(out_dir, f"{name}.mp4")
    render.assemble(parts, os.path.join(hf, "assets", "audio", "mix.wav"), final, log=log)
    light = os.path.join(out_dir, f"{name}_redes.mp4")
    try:
        prog(0.97, "Versión ligera para redes…")
        render.social_copy(final, light)
    except Exception as e:
        log(f"[render] no se pudo crear la versión ligera: {e}")
        light = None
    thumb = os.path.join(out_dir, "miniatura.jpg")
    try:
        render.thumbnail(final, thumb, t=min(1.2, info["total"] / 3))
    except Exception:
        thumb = None
    shutil.copy(os.path.join(hf, "captions.srt"), os.path.join(out_dir, f"{name}.srt"))
    _write_meta(proj, out_dir, name)
    proj["outputs"].update(video=final, video_light=light, thumb=thumb, srt=os.path.join(out_dir, f"{name}.srt"), meta=os.path.join(out_dir, "youtube.txt"),
                           parts=parts)
    proj.pop("approval", None)  # un render nuevo necesita una aprobación nueva
    save(proj)
    prog(1, "Video renderizado")


def stage_qa(proj, ctx, log, prog):
    """Control de calidad automático + manifiestos. No aprueba: eso lo hace una persona."""
    v = (proj.get("outputs") or {}).get("video")
    if not v or not os.path.exists(v):
        raise RuntimeError("QA: no hay video renderizado que revisar")
    info = proj["outputs"]["info"]
    cfg = proj["settings"]
    prog(0.2, "Control de calidad: pistas, duración, negros, sonoridad…")
    expect = {"W": info["W"], "H": info["H"], "fps": info["fps"], "total": info["total"], "captions": info.get("captions", 0),
              "captions_enabled": cfg.get("captions") != "none",
              "scenes_without_voice": [s["id"] for s in proj["scenes"] if (s.get("narration") or "").strip() and not s.get("audio")],
              "fidelity_issues": ((proj.get("bible") or {}).get("fidelity") or {}).get("issues", 0)}
    rep = qa.run_qa(v, expect)
    proj["qa"] = rep
    manifest.write_all(proj, os.path.dirname(v), proj["outputs"].get("parts"), rep)
    save(proj)
    for c in rep["checks"]:
        log(f"[QA] {c['status']:6s} {c['check']}: {c['detail']}")
    prog(1, f"QA: {rep['status']} — {'pendiente de tu aprobación' if rep['status'] != 'FAIL' else 'revisa los fallos'}")


def approve(pid, ok=True, note=""):
    proj = load(pid)
    if not (proj.get("outputs") or {}).get("video"):
        raise RuntimeError("No hay video que aprobar")
    proj["approval"] = {"approved": bool(ok), "note": note, "at": time.time(), "qa_status": (proj.get("qa") or {}).get("status")}
    save(proj)
    return proj


def state(proj):
    """Estado del trabajo según la máquina de estados de la Guía V2."""
    live = _state.get(proj["id"]) or {}
    if live.get("running"):
        return {"story": "PLANNED", "voice": "ASSET_READY", "music": "ASSET_READY", "build": "ANIMATING", "render": "RENDERING",
                "qa": "QA_PENDING"}.get(live.get("stage"), "DRAFT")
    st = (proj.get("status") or {}).get("stage")
    if st == "error":
        if ((proj.get("status") or {}).get("error") or {}).get("code") == "INTERRUPTED":
            return "INTERRUPTED"
        return "CANCELLED" if "ancel" in str((proj.get("status") or {}).get("message")) else "FAILED_RETRYABLE"
    ap = proj.get("approval")
    if ap and ap.get("approved"):
        return "DONE"
    if input_mode(proj) == "audio" or engine(proj) == "vector" and proj.get("audio"):
        if proj.get("qa"):
            return "QA_PENDING"
        if (proj.get("outputs") or {}).get("video"):
            return "RENDERING"
        if proj.get("plan"):
            return "VALIDATED"
        if proj.get("transcript"):
            return "TRANSCRIBED"
        return "AUDIO_READY" if proj.get("audio") else "DRAFT"
    if proj.get("qa"):
        return "QA_PENDING"
    if (proj.get("outputs") or {}).get("video"):
        return "RENDERING"
    if any(s.get("audio") for s in proj.get("scenes", [])):
        return "ASSET_READY"
    if proj.get("scenes"):
        return "VALIDATED" if (proj.get("bible") or {}).get("fidelity") else "PLANNED"
    return "DRAFT"


def _write_meta(proj, out_dir, name):
    b = proj.get("bible") or {}
    yt = b.get("youtube") or {}
    lines = [f"TÍTULO: {yt.get('title') or b.get('title', '')}", "", "DESCRIPCIÓN:", yt.get("description", ""), ""]
    # capítulos de YouTube con marcas de tiempo
    chs = b.get("chapters") or []
    if len(chs) > 1 and proj["settings"].get("format") != "vertical":
        lines.append("CAPÍTULOS:")
        seen = set()
        for s in proj["scenes"]:
            c = s.get("chapter", 0)
            if c in seen or c >= len(chs):
                continue
            seen.add(c)
            t = int(s.get("start", 0))
            lines.append(f"{t // 60}:{t % 60:02d} {chs[c].get('title', '')}")
        lines.append("")
    lines.append("ETIQUETAS: " + ", ".join(yt.get("tags", [])))
    lines.append("")
    lines.append("TEXTO DE MINIATURA: " + str(b.get("thumbnail_text", "")))
    lines.append("")
    lines.append("Efectos de sonido: Pixabay Content License. Música: ACE-Step 1.5 (generada). Voz: Qwen3-TTS / Kokoro.")
    with open(os.path.join(out_dir, "youtube.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


STAGE_FN = {"story": stage_story, "voice": stage_voice, "music": stage_music, "build": stage_build, "render": stage_render, "qa": stage_qa}


# ------------------------------------------------------------------ cola
def run(pid, stages=None):
    with _lock:
        if _state.get(pid, {}).get("running"):
            raise ValueError("Este proyecto ya tiene un trabajo en marcha.")
        try:
            order = stage_order(load(pid))
        except Exception:
            order = STAGES
        stages = list(stages or order)
        if "render" in stages and "qa" not in stages:
            stages.append("qa")
        if "transcribe" in order:  # modo audio: "story" equivale a "plan"; la voz es el audio original
            stages = ["plan" if s == "story" else s for s in stages]
        elif "narration" in order:  # tema/guion con motor ilustrado
            if stages == ["story"]:  # «Solo el guion»: también voz + storyboard ilustrado para poder revisarlo
                stages = ["story", "voice", "narration", "plan"]
            if {"story", "voice"} & set(stages):  # el texto o la voz cambian → narración y storyboard nuevos
                stages += ["narration", "plan"]
            elif {"build", "render"} & set(stages):  # render sin storyboard aún: se crea (nunca se rehace uno existente)
                from .audio_mode import current_plan
    
                if not current_plan(pdir(pid)):
                    stages += ["narration", "plan"]
        stages = [s for s in order if s in stages]
        _set(pid, stage="en cola", progress=0, message="En cola…", error=None, cancel=False, done=[], running=True, stages=stages)
        _journal(pid, {"id": uuid.uuid4().hex[:12], "stages": stages, "done": [], "queued_at": time.time(), "state": "QUEUED"})
        _jobs.put((pid, stages))
        _ensure_worker()

def _journal(pid, job=None, **kw):
    """Diario del trabajo en project.json (V3 §9 persistencia): si el proceso muere,
    al volver a arrancar se sabe qué etapas faltaban y se puede reanudar."""
    with _lock:
        try:
            proj = load(pid)
        except Exception:
            return
        if job is not None:
            proj["job"] = job
        elif kw.get("clear"):
            proj.pop("job", None)
        elif proj.get("job"):
            proj["job"].update(kw)
        save(proj)


def recover():
    """Al arrancar el orquestador: trabajos que quedaron a medias por un reinicio
    (Colab, caída del proceso) se marcan INTERRUPTED con las etapas que faltan.
    No se relanzan solos: el usuario pulsa Reanudar (control humano)."""
    out = []
    if not os.path.isdir(projects_dir()):
        return out
    for pid in sorted(os.listdir(projects_dir())):
        if pid in _state and _state[pid].get("running"):
            continue
        try:
            proj = load(pid)
        except Exception:
            continue
        job = proj.get("job")
        if not job or job.get("state") in ("INTERRUPTED", "FAILED"):
            continue
        remaining = [s for s in job.get("stages", []) if s not in job.get("done", [])]
        job.update(state="INTERRUPTED", remaining=remaining, interrupted_at=time.time())
        d = {"code": "INTERRUPTED", "message": "El proceso se reinició mientras este trabajo estaba en marcha.",
             "action": "Pulsa «Reanudar»: sigue por " + (", ".join(remaining) or "el final") + " sin repetir lo ya hecho."}
        proj["status"] = {"stage": "error", "progress": 0, "message": f"[INTERRUPTED] {d['message']} → {d['action']}", "error": d,
                          "done": job.get("done", [])}
        save(proj)
        out.append({"id": pid, "remaining": remaining})
    return out


def resume(pid):
    proj = load(pid)
    job = proj.get("job") or {}
    remaining = job.get("remaining") or [s for s in job.get("stages", []) if s not in job.get("done", [])]
    if not remaining:
        raise ValueError("No hay nada pendiente que reanudar")
    run(pid, remaining)
    return remaining


def cancel(pid):
    if pid in _state:
        _state[pid]["cancel"] = True


def _ensure_worker():
    global _worker
    if _worker and _worker.is_alive():
        return
    _worker = threading.Thread(target=_loop, name="viralstudio-worker", daemon=True)
    _worker.start()


def _loop():
    while True:
        pid, stages = _jobs.get()
        ctx = Ctx(pid, stages)
        _journal(pid, state="RUNNING", started_at=time.time())
        log = _logger(pid)
        try:
            proj = load(pid)
            for st in stages:
                if ctx.cancel_flag():
                    raise RuntimeError("Cancelado por el usuario")
                t0 = time.time()
                log(f"▶ etapa {st}")
                guide = validate_guidance(proj['settings'].get('animation_guidance'))
                if guide:
                    log(f"Guía: {guide['title']} · {guide['sha256'][:12]}")
                from .quality_repair import execute as execute_with_repair
                def run_one(name):
                    with guidance_scope(proj['settings']):
                        progress = _progress(pid, name, stages) if name in stages else (lambda fraction, message='': _progress(pid, st, stages)(fraction, 'Corrección '+name+': '+message))
                        stage_function(proj, name)(proj, ctx, log, progress)
                    if name == 'qa' and proj['settings'].get('visual_review',False):
                        from . import visual_review
                        visual_review.run(proj, pdir(pid), ctx.cancel_flag, log)
                    if input_mode(proj) == 'audio' or engine(proj) == 'vector' or name == 'qa':
                        save(proj)
                execute_with_repair(st, proj, ctx, run_one, save, pdir(pid), log)
                if input_mode(proj) == "audio" or engine(proj) == "vector":
                    save(proj)
                done = _state[pid].get("done", []) + [st]
                _set(pid, done=done, log=f"✓ {st} en {time.time() - t0:.0f}s")
                _journal(pid, done=done, state="RUNNING")
                proj = load(pid)
            proj = load(pid)
            proj.pop("job", None)
            proj["status"] = {"stage": "listo", "progress": 1, "message": "¡Listo!", "done": stages, "error": None}
            save(proj)
            _set(pid, stage="listo", progress=1, message="¡Listo!", running=False)
        except Exception as e:
            tb = traceback.format_exc()
            log(tb[-2000:])
            d = describe(e)
            msg = f"[{d['code']}] {d['message'][:400]} → {d['action']}"
            try:
                proj = load(pid)
                proj["status"] = {"stage": "error", "progress": 0, "message": msg, "error": d}
                if proj.get("job"):
                    proj["job"]["state"] = "FAILED"
                    proj["job"]["remaining"] = [s for s in proj["job"].get("stages", []) if s not in proj["job"].get("done", [])]
                save(proj)
            except Exception:
                pass
            _set(pid, stage="error", message=msg, error=d, running=False)
