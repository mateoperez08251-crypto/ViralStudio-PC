"""Rutas HTTP del Studio, servidas por el propio servidor de ComfyUI.
  /viralstudio/            interfaz
  /viralstudio/api/...     API JSON
  /viralstudio/engine.js   motor de animación (para la vista previa en vivo)
  /viralstudio/files/...   archivos de los proyectos (video, audio, miniatura)
"""
import asyncio
import json
import os
import shutil
import subprocess
import time
import zipfile

from aiohttp import web

from . import comfy_api, llm, pipeline
from .config import (FORMATS, LANGUAGES, STUDIO_DIR, data_dir, engine_js, hyperframes_cmd, presets, projects_dir,
                     save_settings, settings, tools_dir)

_hf_preview = {}


def _json(data, status=200):
    return web.json_response(data, status=status, dumps=lambda o: json.dumps(o, ensure_ascii=False))


def _err(msg, status=400):
    return _json({"error": str(msg)}, status)


def _models_status():
    s = settings()
    te = comfy_api.list_models("text_encoders")
    ck = comfy_api.list_models("checkpoints")
    return {
        "llm": {"selected": s["llm_model"], "available": [m for m in te if "qwen" in m.lower() or "gemma" in m.lower()],
                "ok": s["llm_model"] in te or s["llm_fallback"] in te},
        "music": {"selected": s["music_model"], "ok": s["music_model"] in ck},
        "tts": {"engine": s["tts_engine"], "python": os.environ.get("VS_TTS_PYTHON", "(ComfyUI)"),
                "kokoro": bool(os.environ.get("VS_KOKORO_DIR") or os.path.exists(os.path.join(tools_dir(), "kokoro", "kokoro.onnx")))},
        "hyperframes": " ".join(hyperframes_cmd()),
    }


def _audio_options():
    from . import audio_mode as AM
    from . import visual_assets as VA

    lib = VA.library()
    s = settings()
    return {"defaults": AM.AUDIO_DEFAULTS, "enums": {k: sorted(v) for k, v in AM.ENUMS.items()},
            "styles": {k: v.get("name") for k, v in (lib.get("styles") or {}).items()},
            "limits": {"max_mb": s.get("audio_max_mb"), "max_seconds": s.get("audio_max_seconds")},
            "accept": ".mp3,.wav,.m4a,.flac,.ogg,.oga,.aac,.mp4,.mov,audio/*,video/mp4,video/quicktime",
            "asr_model": s.get("asr_model") or s.get("whisper_model")}


def _safe_join(base, rel):
    p = os.path.abspath(os.path.join(base, rel))
    if not p.startswith(os.path.abspath(base) + os.sep):
        raise web.HTTPForbidden()
    return p


def _project_view(proj):
    proj = dict(proj)
    proj["live"] = pipeline.live_status(proj)
    proj["input_mode"] = pipeline.input_mode(proj)
    proj["engine"] = pipeline.engine(proj)
    proj["state"] = pipeline.state(proj)
    for k in ("video", "video_light", "thumb", "srt", "meta"):
        v = (proj.get("outputs") or {}).get(k)
        if v and os.path.exists(v):
            proj.setdefault("urls", {})[k] = f"/viralstudio/files/{proj['id']}/" + os.path.relpath(v, pipeline.pdir(proj["id"])).replace(os.sep, "/")
    meta = (proj.get("outputs") or {}).get("meta")
    if meta and os.path.exists(meta):
        with open(meta, encoding="utf-8") as f:
            proj["youtube_txt"] = f.read()
    info = (proj.get("outputs") or {}).get("info") or {}
    for c in info.get("chapters", []):
        c.pop("part_html", None)
    return proj


_T0 = time.time()


def healthz():
    """V3 §10: el proceso vive (no dice nada de si el render funciona)."""
    return {"ok": True, "service": "orchestrator", "pid": os.getpid(), "uptime_s": round(time.time() - _T0),
            "host": os.environ.get("VS_HOST", "standalone"), "capabilities": {"pc_guidance_v1": True, "idempotent_create_v1": True, "visual_review_v1": True}}


def readyz():
    """V3 §10: listo = almacenamiento escribible + herramientas mínimas presentes.
    ComfyUI es opcional: si falta, solo se avisa (modo «mi propio guion»)."""
    checks = {}
    try:
        d = data_dir()
        os.makedirs(d, exist_ok=True)
        tp = os.path.join(d, ".rw_test")
        with open(tp, "w") as f:
            f.write("ok")
        os.remove(tp)
        checks["storage"] = {"ok": True, "detail": d, "free_gb": round(shutil.disk_usage(d).free / 1e9, 1)}
    except Exception as e:
        checks["storage"] = {"ok": False, "detail": str(e)[:200]}
    checks["ffmpeg"] = {"ok": bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))}
    hf = hyperframes_cmd()
    checks["hyperframes"] = {"ok": bool(shutil.which(hf[0]) or os.path.exists(hf[0])), "detail": " ".join(hf)}
    checks["engine"] = {"ok": len(engine_js()) > 10000}
    checks["comfyui"] = {"ok": comfy_api.alive(), "optional": True}
    ready = all(v["ok"] for v in checks.values() if not v.get("optional"))
    return {"ready": ready, "checks": checks}


def setup(routes):
    try:
        rec = pipeline.recover()
        if rec:
            print(f"[ViralStudio] {len(rec)} trabajo(s) interrumpidos por un reinicio: se pueden reanudar desde el Studio")
    except Exception as e:
        print("[ViralStudio] recuperación de trabajos:", e)

    from . import server_audio

    server_audio.setup(routes)

    @routes.get("/viralstudio/healthz")
    async def vs_healthz(request):
        return _json(healthz())

    @routes.get("/viralstudio/api/visual/status")
    async def visual_status(request):
        from .visual_review import DEFAULT_MODEL
        def check():
            model=os.environ.get('VS_VISUAL_MODEL',DEFAULT_MODEL)
            info=comfy_api.object_info('TextGenerate').get('TextGenerate',{}).get('input',{})
            image_input='image' in {**info.get('required',{}),**info.get('optional',{})}
            installed=model in comfy_api.list_models('text_encoders')
            return {'ok':image_input and installed,'model':model,'image_input':image_input,'installed':installed,
                    'error':'' if image_input and installed else 'Falta el modelo visual o TextGenerate con entrada de imagen; activa REVISION_VISUAL en la libreta.'}
        try:
            data=await asyncio.get_running_loop().run_in_executor(None,check)
            return _json(data,200 if data['ok'] else 503)
        except Exception:
            return _err('ComfyUI no responde al comprobar el revisor visual.',503)

    @routes.get("/viralstudio/readyz")
    async def vs_readyz(request):
        r = await asyncio.get_running_loop().run_in_executor(None, readyz)
        return _json(r, 200 if r["ready"] else 503)

    @routes.post("/viralstudio/api/projects/{pid}/resume")
    async def vs_resume(request):
        try:
            return _json({"ok": True, "stages": pipeline.resume(request.match_info["pid"])})
        except Exception as e:
            return _err(e)

    @routes.get("/viralstudio")
    async def vs_root(request):
        raise web.HTTPFound("/viralstudio/")

    @routes.get("/viralstudio/")
    async def vs_index(request):
        return web.FileResponse(os.path.join(STUDIO_DIR, "index.html"), headers={"Cache-Control": "no-cache"})

    @routes.get("/viralstudio/static/{path:.*}")
    async def vs_static(request):
        return web.FileResponse(_safe_join(STUDIO_DIR, request.match_info["path"]), headers={"Cache-Control": "no-cache"})

    @routes.get("/viralstudio/engine.js")
    async def vs_engine(request):
        return web.Response(text=engine_js(), content_type="application/javascript", headers={"Cache-Control": "no-cache"})

    @routes.get("/viralstudio/files/{pid}/{path:.*}")
    async def vs_files(request):
        base = pipeline.pdir(request.match_info["pid"])
        p = _safe_join(base, request.match_info["path"])
        if not os.path.exists(p):
            raise web.HTTPNotFound()
        return web.FileResponse(p)

    @routes.get("/viralstudio/api/options")
    async def vs_options(request):
        P = presets()
        return _json({"presets": P, "formats": FORMATS, "languages": LANGUAGES, "settings": settings(),
                      "shots": llm.SHOTS, "envs": llm.ENVS, "actions": llm.ACTIONS, "props": llm.PROPS, "trans": llm.TRANS,
                      "moods": llm.MOODS, "faces": llm.FACES, "cams": llm.CAMS, "models": _models_status(),
                      "audio_mode": _audio_options()})

    @routes.get("/viralstudio/api/system")
    async def vs_system(request):
        st = await asyncio.get_running_loop().run_in_executor(None, comfy_api.system_stats)
        q = {}
        try:
            q = await asyncio.get_running_loop().run_in_executor(None, lambda: comfy_api._req("/queue", timeout=5))
        except Exception:
            pass
        total, used, free = shutil.disk_usage(data_dir())
        return _json({"stats": st, "queue": {"running": len(q.get("queue_running", [])), "pending": len(q.get("queue_pending", []))},
                      "disk": {"free_gb": round(free / 1e9, 1)}, "time": time.time()})

    @routes.get("/viralstudio/api/settings")
    async def vs_get_settings(request):
        return _json(settings())

    @routes.post("/viralstudio/api/settings")
    async def vs_set_settings(request):
        return _json(save_settings(await request.json()))

    @routes.get("/viralstudio/api/projects")
    async def vs_list(request):
        return _json(pipeline.list_all())

    @routes.post("/viralstudio/api/projects")
    async def vs_create(request):
        body = await request.json()
        cfg = body.get("settings") or body
        if not isinstance(cfg, dict) or not isinstance(cfg.get('pc_auto_run', False), bool):
            return _err('Ajustes o modo automático inválidos.')
        mode = cfg.get("input_mode")
        if mode not in (None, "", "topic", "script", "audio"):
            return _err("input_mode debe ser topic, script o audio.")
        if mode != "audio" and not (cfg.get("topic") or cfg.get("script")):
            return _err("Escribe el tema del video (o pega tu guion).")
        try:
            proj = pipeline.create(cfg, request_id=request.headers.get("Idempotency-Key"))
        except Exception as e:  # validación de enums/límites del modo audio
            return _err(e)
        replayed = proj.pop('_request_replayed', False)
        stages = True if cfg.get('pc_auto_run') else body.get("run")
        if mode == "audio":
            stages = None  # el modo audio no se procesa hasta que se sube la narración
        if stages and not replayed:
            pipeline.run(proj["id"], stages if isinstance(stages, list) else None)
        return _json(_project_view(pipeline.load(proj["id"])))

    @routes.get("/viralstudio/api/projects/{pid}")
    async def vs_get(request):
        try:
            return _json(_project_view(pipeline.load(request.match_info["pid"])))
        except FileNotFoundError:
            return _err("Proyecto no encontrado", 404)

    @routes.get("/viralstudio/api/projects/{pid}/status")
    async def vs_status(request):
        pid = request.match_info["pid"]
        try:
            proj = pipeline.load(pid)
        except FileNotFoundError:
            return _err("Proyecto no encontrado", 404)
        st = pipeline.live_status(proj)
        return _json({"live": st, "outputs_ready": bool(proj["outputs"].get("video")), "scenes": len(proj["scenes"]), "updated": proj.get("updated")})

    @routes.delete("/viralstudio/api/projects/{pid}")
    async def vs_delete(request):
        pipeline.delete(request.match_info["pid"])
        return _json({"ok": True})

    @routes.post("/viralstudio/api/projects/{pid}/run")
    async def vs_run(request):
        body = await request.json() if request.can_read_body else {}
        try:
            pipeline.run(request.match_info["pid"], body.get("stages"))
        except ValueError as e:
            return _err(e, 409)
        return _json({"ok": True})

    @routes.post("/viralstudio/api/projects/{pid}/cancel")
    async def vs_cancel(request):
        pipeline.cancel(request.match_info["pid"])
        comfy_api.interrupt()
        return _json({"ok": True})

    @routes.post("/viralstudio/api/projects/{pid}/settings")
    async def vs_proj_settings(request):
        pid = request.match_info["pid"]
        body = await request.json()
        proj = pipeline.load(pid)
        if 'animation_guidance' in body and body['animation_guidance'] != proj['settings'].get('animation_guidance'):
            return _err('La guía de este proyecto está congelada. Crea un proyecto nuevo para usar otra versión.')
        voice_keys = {"voice", "voice_design", "language", "clone_audio", "clone_text", "tts_engine", "voice_speed", "kokoro_voice"}
        if voice_keys & set(body):
            for s in proj["scenes"]:
                s.pop("audio", None)
        if {"music", "music_prompt"} & set(body):
            proj["outputs"].pop("music", None)
        proj["settings"].update(body)
        pipeline.save(proj)
        return _json(_project_view(proj))

    @routes.patch("/viralstudio/api/projects/{pid}/scenes/{idx}")
    async def vs_scene_patch(request):
        sc = pipeline.update_scene(request.match_info["pid"], int(request.match_info["idx"]), await request.json())
        return _json(sc)

    @routes.post("/viralstudio/api/projects/{pid}/scenes")
    async def vs_scene_insert(request):
        body = await request.json()
        proj = pipeline.insert_scene(request.match_info["pid"], int(body.get("index", 0)), body.get("scene"))
        return _json(_project_view(proj))

    @routes.delete("/viralstudio/api/projects/{pid}/scenes/{idx}")
    async def vs_scene_delete(request):
        return _json(_project_view(pipeline.remove_scene(request.match_info["pid"], int(request.match_info["idx"]))))

    @routes.post("/viralstudio/api/projects/{pid}/scenes/{idx}/move")
    async def vs_scene_move(request):
        body = await request.json()
        return _json(_project_view(pipeline.move_scene(request.match_info["pid"], int(request.match_info["idx"]), int(body["to"]))))

    @routes.post("/viralstudio/api/projects/{pid}/scenes/{idx}/rewrite")
    async def vs_scene_rewrite(request):
        pid, idx = request.match_info["pid"], int(request.match_info["idx"])
        body = await request.json()
        proj = pipeline.load(pid)

        def job():
            return llm.rewrite_scene(proj["settings"], proj.get("bible") or {}, proj["scenes"], idx, body.get("instruction") or "hazla más impactante")

        try:
            new = await asyncio.get_running_loop().run_in_executor(None, job)
        except Exception as e:
            return _err(f"No se pudo reescribir: {e}", 500)
        proj = pipeline.load(pid)
        proj["scenes"][idx] = new
        pipeline.save(proj)
        return _json(new)

    @routes.post("/viralstudio/api/projects/{pid}/approve")
    async def vs_approve(request):
        body = await request.json() if request.can_read_body else {}
        try:
            return _json(_project_view(pipeline.approve(request.match_info["pid"], body.get("approved", True), body.get("note", ""))))
        except Exception as e:
            return _err(e)

    @routes.get("/viralstudio/api/health")
    async def vs_health(request):
        from . import doctor

        return _json(await asyncio.get_running_loop().run_in_executor(None, doctor.report))

    @routes.post("/viralstudio/api/upload")
    async def vs_upload(request):
        reader = await request.multipart()
        field = await reader.next()
        if field is None:
            return _err("Sin archivo")
        d = os.path.join(data_dir(), "uploads")
        os.makedirs(d, exist_ok=True)
        name = os.path.basename(field.filename or "muestra.wav").replace(" ", "_")
        path = os.path.join(d, f"{int(time.time())}_{name}")
        with open(path, "wb") as f:
            while True:
                chunk = await field.read_chunk()
                if not chunk:
                    break
                f.write(chunk)
        return _json({"path": path})

    @routes.get("/viralstudio/api/projects/{pid}/download")
    async def vs_download(request):
        """Zip con el proyecto HyperFrames editable + salidas."""
        pid = request.match_info["pid"]
        base = pipeline.pdir(pid)
        zp = os.path.join(base, f"{pid}.zip")

        def make():
            with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
                for root, _, files in os.walk(base):
                    if "renders" in root or ".hyperframes" in root or root.endswith("voice") or "/.work_" in root or root.endswith(os.sep + "cache"):
                        continue
                    for fn in files:
                        if fn.endswith((".zip", ".part", ".tmp", ".old")):
                            continue
                        full = os.path.join(root, fn)
                        z.write(full, os.path.relpath(full, base))

        await asyncio.get_running_loop().run_in_executor(None, make)
        return web.FileResponse(zp, headers={"Content-Disposition": f'attachment; filename="{pid}.zip"'})

    @routes.post("/viralstudio/api/projects/{pid}/hfstudio")
    async def vs_hf_preview(request):
        """Abre el Studio de HyperFrames (editor con línea de tiempo) sobre el proyecto."""
        pid = request.match_info["pid"]
        proj = pipeline.load(pid)
        hf = (proj.get("outputs") or {}).get("hf")
        if not hf:
            return _err("Primero monta el proyecto (etapa Montaje).")
        port = int(os.environ.get("VS_HF_PREVIEW_PORT", "3002"))
        prev = _hf_preview.get("proc")
        if prev and prev.poll() is None:
            prev.kill()
        _hf_preview["proc"] = subprocess.Popen(hyperframes_cmd() + ["preview", "--foreground", "--port", str(port)], cwd=hf,
                                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return _json({"port": port, "path": f"/#project/{os.path.basename(hf)}", "hint": os.environ.get("VS_HF_PREVIEW_URL", "")})
