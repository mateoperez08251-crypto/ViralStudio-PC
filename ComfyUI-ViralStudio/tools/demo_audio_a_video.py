"""Demostración reproducible del modo «Mi audio → video» (sin servidor ni navegador del usuario).

    python tools/demo_audio_a_video.py NARRACION.mp3 SALIDA/ [--asr-model small] [--format vertical]
                                       [--quality standard] [--determinism] [--rerender-scene sc002]

Hace exactamente lo mismo que el Studio: crea un proyecto input_mode=audio, ingesta, transcribe (faster-whisper real),
planifica, monta, renderiza con HyperFrames y pasa la QA. Copia a SALIDA/: MP4, SRT, plan, transcripción, storyboard,
biblia, manifiestos, informe QA, capturas por escena, hoja de contactos y metrics.json.
--determinism   vuelve a renderizar TODO sin caché y compara fotogramas en 4 instantes (PSNR).
--rerender-scene cambia la cámara de una escena y comprueba que solo esa parte se recodifica y que el audio no cambia.
Necesita: ffmpeg, node + hyperframes (VS_HF_BIN) y faster-whisper en VS_TTS_PYTHON (o en este Python).
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("out")
    ap.add_argument("--asr-model", default="")
    ap.add_argument("--format", default="vertical")
    ap.add_argument("--quality", default="standard")
    ap.add_argument("--style", default="cutout_ilustrado")
    ap.add_argument("--music", action="store_true")
    ap.add_argument("--no-captions", action="store_true")
    ap.add_argument("--determinism", action="store_true")
    ap.add_argument("--rerender-scene", default="")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    os.environ.setdefault("VS_DATA", os.path.join(os.path.abspath(a.out), "_data"))
    os.environ.setdefault("VS_TTS_PYTHON", sys.executable)
    from vs import audio_ingest as AI
    from vs import audio_mode as AM
    from vs import audio_storyboard as SB
    from vs import pipeline
    from vs import qa_audio_mode as QAA
    from vs.config import save_settings

    if a.asr_model:
        save_settings({"asr_model": a.asr_model})
    t0 = time.time()
    times = {}
    proj = pipeline.create({"input_mode": "audio", "format": a.format, "quality": a.quality, "visual_style": a.style,
                            "music": a.music, "captions": "none" if a.no_captions else "explainer"})
    d = pipeline.pdir(proj["id"])
    os.makedirs(os.path.join(d, "audio"), exist_ok=True)
    tmp = os.path.join(d, "audio", ".upload_demo.part")
    shutil.copy(a.audio, tmp)
    proj["audio"] = AI.ingest(d, tmp, os.path.basename(a.audio), {"max_seconds": 3600})
    proj.setdefault("bible", {})["title"] = os.path.splitext(os.path.basename(a.audio))[0]
    pipeline.save(proj)
    times["ingest"] = round(time.time() - t0, 1)
    print(f"[demo] audio {proj['audio']['duration_s']:.3f}s sha256 {proj['audio']['sha256'][:16]}…", flush=True)

    class Ctx:
        def cancel_flag(self):
            return False

    log = lambda m: print(m, flush=True)
    for st in AM.AUDIO_STAGES:
        t1 = time.time()
        proj = pipeline.load(proj["id"])
        AM.AUDIO_STAGE_FN[st](proj, Ctx(), log, lambda *x, **k: None, d)
        pipeline.save(proj)
        times[st] = round(time.time() - t1, 1)
        print(f"[demo] ✓ {st} {times[st]}s", flush=True)
    proj = pipeline.load(proj["id"])
    video = proj["outputs"]["video"]
    metrics = {"audio": proj["audio"]["original_name"], "duration_s": proj["audio"]["duration_s"], "seconds": times,
               "qa_status": proj["qa"]["status"], "qa": proj["qa"]["checks"], "transcript": proj.get("transcript"), "plan": proj.get("plan")}
    if a.determinism:
        f1 = {t: QAA.frame_gray(video, t, 270, 480) for t in (0.5, 2.5, proj["audio"]["duration_s"] / 2, proj["audio"]["duration_s"] - 0.5)}
        keep = video + ".first.mp4"
        shutil.copy(video, keep)
        shutil.rmtree(os.path.join(d, "hf", "renders"))
        t1 = time.time()
        AM.stage_render(proj, Ctx(), log, lambda *x, **k: None, d)
        times["render_again"] = round(time.time() - t1, 1)
        res = {}
        import numpy as np

        for t, g in f1.items():
            g2 = QAA.frame_gray(proj["outputs"]["video"], t, 270, 480)
            mse = float(np.mean((g - g2) ** 2))
            res[f"{t:.2f}"] = {"mse": round(mse, 4), "psnr_db": 99.0 if mse == 0 else round(10 * np.log10(255 ** 2 / mse), 2)}
        metrics["determinism"] = res
        os.remove(keep)
        print("[demo] determinismo:", res, flush=True)
    if a.rerender_scene:
        parts = proj["outputs"]["parts"]
        before = {os.path.basename(p): sha(p) for p in parts}
        mix0 = sha(os.path.join(d, "hf", "assets", "audio", "mix.wav"))
        plan = AM.current_plan(d)
        SB.edit_scene(plan, a.rerender_scene, {"camera": {"shot": "medium", "movement": "orbit"}})
        AM.save_plan(d, plan, "demo: re-render de una escena")
        proj["outputs"].pop("info", None)
        t1 = time.time()
        AM.stage_build(proj, Ctx(), log, lambda *x, **k: None, d)
        AM.stage_render(proj, Ctx(), log, lambda *x, **k: None, d)
        times["rerender_one_scene"] = round(time.time() - t1, 1)
        after = {os.path.basename(p): sha(p) for p in proj["outputs"]["parts"]}
        metrics["rerender"] = {"scene": a.rerender_scene, "changed_parts": sorted(k for k in after if after[k] != before.get(k)),
                               "mix_unchanged": mix0 == sha(os.path.join(d, "hf", "assets", "audio", "mix.wav")), "seconds": times["rerender_one_scene"]}
        AM.stage_qa(proj, Ctx(), log, lambda *x, **k: None, d)
        pipeline.save(proj)
        metrics["qa_status_after_rerender"] = proj["qa"]["status"]
        print("[demo] re-render:", metrics["rerender"], flush=True)
    # copia de evidencias
    out = os.path.abspath(a.out)
    shutil.copy(proj["outputs"]["video"], os.path.join(out, "video.mp4"))
    shutil.copy(proj["outputs"]["srt"], os.path.join(out, "subtitulos.srt"))
    for fn in os.listdir(proj["outputs"]["export"]):
        if fn.endswith(".json"):
            shutil.copy(os.path.join(proj["outputs"]["export"], fn), os.path.join(out, fn))
    man = os.path.join(os.path.dirname(proj["outputs"]["video"]), "manifests")
    shutil.copytree(man, os.path.join(out, "manifests"), dirs_exist_ok=True)
    shutil.copytree(proj["qa"]["frames_dir"], os.path.join(out, "qa_frames"), dirs_exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(out, "video.mp4"), "-vf", "fps=1,scale=240:-1,tile=8x4", "-frames:v", "1",
                    os.path.join(out, "hoja_de_contactos.jpg")], check=False)
    proj = pipeline.load(proj["id"])
    proj["status"] = {"stage": "listo", "progress": 1, "message": "¡Listo! (demo)", "done": list(AM.AUDIO_STAGES), "error": None}
    pipeline.save(proj)
    metrics["seconds"] = times
    metrics["total_s"] = round(time.time() - t0, 1)
    with open(os.path.join(out, "metrics.json"), "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=1)
    print(f"[demo] listo en {metrics['total_s']}s · QA {proj['qa']['status']} · {out}", flush=True)


if __name__ == "__main__":
    main()
