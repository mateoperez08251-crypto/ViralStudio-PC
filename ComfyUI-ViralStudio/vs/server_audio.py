"""API del modo «Mi audio → video» (se registra desde vs/server.py).

  POST  /viralstudio/api/projects/{pid}/audio                 subir narración (multipart, streaming, con tope)
  GET   /viralstudio/api/projects/{pid}/audio                 metadatos, forma de onda, transcripción, plan, URLs
  POST  /viralstudio/api/projects/{pid}/audio/analyze         encola transcribe + plan (no bloquea aiohttp)
  PATCH /viralstudio/api/projects/{pid}/transcript            corrige texto (los tiempos no se falsifican)
  POST  /viralstudio/api/projects/{pid}/transcript/manual     transcripción pegada (sin ASR; tiempos estimados)
  PATCH /viralstudio/api/projects/{pid}/storyboard            edita lo visual de una escena o mueve un corte
  POST  /viralstudio/api/projects/{pid}/storyboard/regenerate rehace el storyboard (conserva la biblia visual)
  POST  /viralstudio/api/projects/{pid}/audio/render          encola music + build + render + qa
  POST  /viralstudio/api/projects/{pid}/scenes/{sid}/rerender aplica cambios a UNA escena y re-renderiza (caché)
Las descargas usan /viralstudio/files/{pid}/... (protegidas por la puerta con llave en Colab).
"""
import asyncio
import json
import os
import uuid

from aiohttp import web

from . import asr as ASR
from . import audio_ingest as AI
from . import audio_mode as AM
from . import audio_storyboard as SB
from . import audio_timeline as TL
from . import pipeline
from . import visual_assets as VA
from .config import settings
from .errors import VSError


def _json(data, status=200):
    return web.json_response(data, status=status, dumps=lambda o: json.dumps(o, ensure_ascii=False))


def _err(msg, status=400, code=None):
    return _json({"error": str(msg), "code": code}, status)


def limits():
    s = settings()
    return {"max_bytes": int(float(s.get("audio_max_mb", 500)) * 1024 * 1024), "max_seconds": float(s.get("audio_max_seconds", 1800)),
            "allow_video": bool(s.get("audio_allow_video", True))}


def _load(pid, audio_only=False):
    """Proyecto del modo audio o, para storyboard/vista previa/render, de tema/guion con el motor ilustrado."""
    if not pid or "/" in pid or "\\" in pid or pid.startswith(".") or not os.path.isdir(pipeline.pdir(pid)):
        raise web.HTTPNotFound(text="Proyecto no encontrado")
    proj = pipeline.load(pid)
    if pipeline.input_mode(proj) != "audio" and (audio_only or pipeline.engine(proj) != "vector"):
        raise web.HTTPBadRequest(text="Este proyecto no es del modo «Mi audio → video»")
    return proj


def _busy(pid):
    st = pipeline._state.get(pid) or {}
    return bool(st.get("running"))


def _url(pid, rel):
    return f"/viralstudio/files/{pid}/{rel}" if rel else None


def audio_view(proj):
    pid = proj["id"]
    d = pipeline.pdir(pid)
    a = proj.get("audio")
    out = {"audio": a, "settings": proj["settings"], "transcript": None, "plan": None, "urls": {}}
    if a:
        out["urls"].update(original=_url(pid, a["original_path"]), master=_url(pid, a["master_path"]))
        out["waveform"] = AM.read_json(os.path.join(d, a["waveform_path"]))
    tr = AM.current_transcript(d)
    if tr:
        raw = AM.read_json(os.path.join(d, "transcript", "transcript_raw.json")) or {}
        out["transcript"] = tr
        out["transcript_raw_text"] = raw.get("text")
    plan = AM.current_plan(d)
    if plan:
        out["plan"] = {k: v for k, v in plan.items() if k not in ("choices",)}
        out["library"] = {k: {i: {"name": e.get("name"), "actions": e.get("actions")} for i, e in v.items()}
                          for k, v in VA.library().items()
                          if k in ("characters", "backgrounds", "props", "infographics")}
        out["enums"] = {"templates": SB.TEMPLATES, "shots": SB.SHOTS, "moves": SB.MOVES, "overlays": SB.OVERLAYS, "transitions": SB.TRANSITIONS}
    exp = (proj.get("outputs") or {}).get("export")
    if exp and os.path.isdir(exp):
        out["urls"]["export"] = {fn: _url(pid, os.path.relpath(os.path.join(exp, fn), d)) for fn in sorted(os.listdir(exp))}
    fr = os.path.join(d, "out", "qa_frames")
    if os.path.isdir(fr):
        out["urls"]["qa_frames"] = [_url(pid, f"out/qa_frames/{fn}") for fn in sorted(os.listdir(fr))]
    return out


def setup(routes):
    @routes.post("/viralstudio/api/projects/{pid}/audio")
    async def upload_audio(request):
        pid = request.match_info["pid"]
        proj = _load(pid, audio_only=True)
        if _busy(pid):
            return _err("Hay un trabajo en marcha en este proyecto: cancélalo o espera.", 409)
        lim = limits()
        if request.content_length and request.content_length > lim["max_bytes"] + 1024 * 64:
            return _err(f"Archivo demasiado grande (límite {lim['max_bytes'] // (1024 * 1024)} MB, ajuste audio_max_mb).", 413)
        try:
            reader = await request.multipart()
        except Exception:
            return _err("Envía el archivo como multipart/form-data (campo «file»).")
        field = await reader.next()
        while field is not None and field.name not in ("file", "audio"):
            field = await reader.next()
        if field is None:
            return _err("Sin archivo (campo «file»).")
        d = pipeline.pdir(pid)
        os.makedirs(os.path.join(d, "audio"), exist_ok=True)
        tmp = os.path.join(d, "audio", f".upload_{uuid.uuid4().hex}.part")  # nombre del sistema, nunca el del cliente
        size = 0
        try:
            with open(tmp, "wb") as f:
                while True:
                    chunk = await field.read_chunk(1 << 20)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > lim["max_bytes"]:
                        raise VSError("INPUT_INVALID", f"Archivo demasiado grande (límite {lim['max_bytes'] // (1024 * 1024)} MB).")
                    f.write(chunk)
            if size == 0:
                raise VSError("INPUT_INVALID", "El archivo está vacío.")
            meta = await asyncio.get_running_loop().run_in_executor(None, AI.ingest, d, tmp, field.filename or "audio", lim)
        except VSError as e:
            try:
                os.remove(tmp)
            except OSError:
                pass
            return _err(e, 413 if "grande" in str(e) else 400, e.code)
        except Exception as e:
            try:
                os.remove(tmp)
            except OSError:
                pass
            return _err(f"No se pudo procesar el audio: {e}", 400, "INPUT_INVALID")
        proj = pipeline.load(pid)
        changed = (proj.get("audio") or {}).get("sha256") != meta["sha256"]
        proj["audio"] = meta
        proj["settings"]["duration"] = round(meta["duration_s"], 3)
        proj.setdefault("bible", {})["title"] = proj["bible"].get("title") or os.path.splitext(meta["original_name"])[0][:70]
        if changed:  # audio nuevo: lo derivado deja de valer (los archivos viejos se versionan, no se usan)
            for k in ("transcript", "plan", "qa", "approval", "job", "total"):
                proj.pop(k, None)
            proj["outputs"] = {}
            for fn in ("transcript_raw.json", "transcript_edited.json"):
                p = os.path.join(d, "transcript", fn)
                if os.path.exists(p):
                    os.replace(p, p + ".old")
            p = os.path.join(d, "plan", "audio_plan.json")
            if os.path.exists(p):
                os.replace(p, p + ".old")
        proj["status"] = {"stage": "audio", "progress": 0, "message": f"Audio cargado: {meta['duration_s']:.1f}s", "done": [], "error": None}
        pipeline.save(proj)
        return _json(audio_view(proj))

    @routes.get("/viralstudio/api/projects/{pid}/audio")
    async def get_audio(request):
        return _json(audio_view(_load(request.match_info["pid"])))

    @routes.get("/viralstudio/api/projects/{pid}/audio/preview")
    async def preview_data(request):
        """Datos del motor vectorial para la vista previa en vivo (mismo motor que el render)."""
        from . import vector_compiler as VC

        proj = _load(request.match_info["pid"])
        plan = AM.current_plan(pipeline.pdir(proj["id"]))
        if not plan:
            return _err("Aún no hay storyboard.", 404)
        plan["captions"]["enabled"] = proj["settings"].get("captions", "explainer") != "none"
        return _json(VC.engine_data(plan, captions=plan["captions"]["enabled"]))

    @routes.post("/viralstudio/api/projects/{pid}/audio/analyze")
    async def analyze(request):
        pid = request.match_info["pid"]
        proj = _load(pid)
        if pipeline.input_mode(proj) != "audio":  # guion/tema ilustrado: (guion →) voz → narración → storyboard
            if _busy(pid):
                return _err("Ya hay un trabajo en marcha.", 409)
            stages = ["narration", "plan"] if proj.get("scenes") else ["story", "voice", "narration", "plan"]
            proj["settings"]["replan"] = True
            pipeline.save(proj)
            pipeline.run(pid, stages)
            return _json({"ok": True, "stages": stages})
        if not proj.get("audio"):
            return _err("Primero sube la narración.")
        if _busy(pid):
            return _err("Ya hay un trabajo en marcha.", 409)
        body = await request.json() if request.can_read_body else {}
        if body.get("force_transcribe"):
            proj["settings"]["force_transcribe"] = True
        if body.get("replan"):
            proj["settings"]["replan"] = True
        for k in ("language", "diarize", "auto_storyboard", "visual_style", "pace_visual", "professional_gate"):
            if k in body:
                proj["settings"][k] = body[k]
        try:
            AM.validate_settings(proj["settings"])
        except VSError as e:
            return _err(e)
        pipeline.save(proj)
        stages = pipeline.stage_order(proj) if proj['settings'].get('pc_auto_run') else ["transcribe", "plan"]
        pipeline.run(pid, stages)
        return _json({"ok": True, "stages": stages})

    @routes.patch("/viralstudio/api/projects/{pid}/transcript")
    async def patch_transcript(request):
        pid = request.match_info["pid"]
        proj = _load(pid)
        if _busy(pid):
            return _err("Hay un trabajo en marcha.", 409)
        d = pipeline.pdir(pid)
        tr = AM.current_transcript(d)
        if not tr:
            return _err("Aún no hay transcripción.")
        body = await request.json()
        try:
            new = ASR.apply_text_edit(tr, new_text=body.get("text"), word_edits=body.get("words"))
        except Exception as e:
            return _err(e)
        new["audio_sha256"] = proj["audio"]["sha256"]
        AM.write_json(os.path.join(d, "transcript", "transcript_edited.json"), new)
        plan = AM.current_plan(d)
        if plan:
            AM.save_plan(d, AM.refresh_plan_words(plan, new), "transcripción corregida")
        proj["transcript"] = dict(proj.get("transcript") or {}, words=len(new["words"]), review_count=new["review_count"], edited=True)
        proj["outputs"].pop("info", None)  # los subtítulos cambian: hay que volver a montar (solo cambian las escenas afectadas)
        pipeline.save(proj)
        return _json(audio_view(proj))

    @routes.post("/viralstudio/api/projects/{pid}/transcript/manual")
    async def manual_transcript(request):
        pid = request.match_info["pid"]
        proj = _load(pid, audio_only=True)
        if _busy(pid):
            return _err("Hay un trabajo en marcha.", 409)
        body = await request.json()
        a = proj.get("audio")
        if not a:
            return _err("Primero sube la narración.")
        try:
            tr = ASR.manual_transcript(body.get("text", ""), a["duration_s"], a.get("silences"), body.get("language"))
        except VSError as e:
            return _err(e)
        tr["audio_sha256"] = a["sha256"]
        d = pipeline.pdir(pid)
        AM.write_json(os.path.join(d, "transcript", "transcript_raw.json"), tr)
        p = os.path.join(d, "transcript", "transcript_edited.json")
        if os.path.exists(p):
            os.remove(p)
        proj["transcript"] = {"status": "manual", "words": len(tr["words"]), "language": tr.get("language"), "review_count": tr["review_count"],
                              "engine": "manual (tiempos estimados)"}
        pipeline.save(proj)
        return _json(audio_view(proj))

    @routes.patch("/viralstudio/api/projects/{pid}/storyboard")
    async def patch_storyboard(request):
        pid = request.match_info["pid"]
        proj = _load(pid)
        if _busy(pid):
            return _err("Hay un trabajo en marcha.", 409)
        d = pipeline.pdir(pid)
        plan = AM.current_plan(d)
        if not plan:
            return _err("Aún no hay storyboard.")
        body = await request.json()
        try:
            if body.get("cuts"):
                TL.retime_scene_bounds(plan, body["cuts"])
                reason = "cortes movidos (el audio no cambia)"
            elif body.get("scene_id"):
                SB.edit_scene(plan, body["scene_id"], body.get("fields") or {})
                reason = f"escena {body['scene_id']} editada"
            elif body.get("bible"):
                b = body["bible"]
                for c in plan["visual_bible"]["characters"]:
                    if c["id"] in (b.get("characters") or {}):
                        ch = b["characters"][c["id"]]
                        for k in ("variant", "colors", "name", "locked"):
                            if k in ch:
                                c[k] = ch[k]
                reason = "biblia visual editada"
            else:
                return _err("Nada que cambiar (usa scene_id+fields, cuts o bible).")
            AM.save_plan(d, plan, reason)
        except (TL.PlanError, VSError, KeyError, TypeError, ValueError) as e:
            return _err(f"Cambio rechazado: {e}")
        proj["outputs"].pop("info", None)
        from . import direction_quality as DQ
        gate = DQ.enforce(plan, d, strict=False)
        proj["quality_gate"] = {k: gate[k] for k in ("status", "fail_count", "review_count", "render_engine")}
        proj["quality_gate"]["examples"] = [f"Escena {x['scene']}: {x['detail']}" for x in gate["issues"] if x["severity"] == "FAIL"][:4]
        proj["plan"] = dict(proj.get("plan") or {}, version=plan["plan_version"], scenes=len(plan["scenes"]))
        pipeline.save(proj)
        return _json(audio_view(proj))

    @routes.post("/viralstudio/api/projects/{pid}/storyboard/regenerate")
    async def regenerate(request):
        pid = request.match_info["pid"]
        proj = _load(pid)
        if _busy(pid):
            return _err("Hay un trabajo en marcha.", 409)
        body = await request.json() if request.can_read_body else {}
        proj["settings"]["replan"] = True
        if "auto_storyboard" in body:
            proj["settings"]["auto_storyboard"] = bool(body["auto_storyboard"])
        pipeline.save(proj)
        pipeline.run(pid, ["plan"])
        return _json({"ok": True})

    @routes.post("/viralstudio/api/projects/{pid}/audio/render")
    async def render_audio(request):
        pid = request.match_info["pid"]
        proj = _load(pid)
        if _busy(pid):
            return _err("Ya hay un trabajo en marcha.", 409)
        if not AM.current_plan(pipeline.pdir(pid)):
            if pipeline.input_mode(proj) != "audio":  # guion ilustrado sin storyboard todavía: todo seguido
                pipeline.run(pid, pipeline.stage_order(proj))
                return _json({"ok": True})
            return _err("Primero analiza el audio (transcripción + storyboard).")
        body = await request.json() if request.can_read_body else {}
        for k in ("music", "sfx", "captions", "quality", "audio_loudnorm", "preserve_original_audio", "music_prompt", "music_volume", "professional_gate"):
            if k in body:
                proj["settings"][k] = body[k]
        try:
            AM.validate_settings(proj["settings"])
        except VSError as e:
            return _err(e)
        proj["outputs"].pop("info", None)
        pipeline.save(proj)
        pipeline.run(pid, ["music", "build", "render", "qa"])
        return _json({"ok": True})

    @routes.post("/viralstudio/api/projects/{pid}/scenes/{sid}/rerender")
    async def rerender_scene(request):
        pid, sid = request.match_info["pid"], request.match_info["sid"]
        proj = _load(pid)
        if _busy(pid):
            return _err("Ya hay un trabajo en marcha.", 409)
        d = pipeline.pdir(pid)
        plan = AM.current_plan(d)
        if not plan or not any(s["id"] == sid for s in plan["scenes"]):
            return _err("Escena no encontrada.", 404)
        body = await request.json() if request.can_read_body else {}
        if body.get("fields"):
            try:
                SB.edit_scene(plan, sid, body["fields"])
                AM.save_plan(d, plan, f"escena {sid} editada para re-render")
            except (TL.PlanError, VSError) as e:
                return _err(f"Cambio rechazado: {e}")
        proj["outputs"].pop("info", None)
        pipeline.save(proj)
        # build reescribe las composiciones; el render reutiliza todas las escenas cuyo hash no cambió
        pipeline.run(pid, ["build", "render", "qa"])
        return _json({"ok": True, "scene": sid})
