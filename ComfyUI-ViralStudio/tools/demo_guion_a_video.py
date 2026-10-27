"""Demostración reproducible de «Mi guion → video» con el motor ILUSTRADO (sin servidor ni navegador).

    python tools/demo_guion_a_video.py "Tu guion…" SALIDA/ [--format vertical] [--tts kokoro] [--quality standard]
    python tools/demo_guion_a_video.py @guion.txt SALIDA/

Hace lo mismo que el Studio: crea un proyecto de guion (engine=vector), reparte el guion en escenas,
sintetiza la voz (Kokoro o Qwen3-TTS), une la narración con el texto EXACTO del guion, detecta
personajes y animales, planifica, monta, renderiza con HyperFrames y pasa la QA. Copia a SALIDA/:
MP4, SRT, plan, biblia visual, manifiestos, informe QA, capturas por escena, hoja de contactos y metrics.json.
Necesita: ffmpeg, node + hyperframes (VS_HF_BIN) y la voz en VS_TTS_PYTHON (Kokoro: VS_KOKORO_DIR).
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("script")
    ap.add_argument("out")
    ap.add_argument("--format", default="vertical")
    ap.add_argument("--quality", default="standard")
    ap.add_argument("--tts", default="kokoro")
    ap.add_argument("--voice", default="")
    ap.add_argument("--music", action="store_true")
    a = ap.parse_args()
    text = open(a.script[1:], encoding="utf-8").read().strip() if a.script.startswith("@") else a.script
    os.makedirs(a.out, exist_ok=True)
    os.environ.setdefault("VS_DATA", os.path.join(os.path.abspath(a.out), "_data"))
    os.environ.setdefault("VS_TTS_PYTHON", sys.executable)
    from vs import audio_mode as AM
    from vs import pipeline
    from vs.config import save_settings

    save_settings({"tts_engine": a.tts})
    cfg = {"script": text, "format": a.format, "quality": a.quality, "tts_engine": a.tts, "music": a.music}
    if a.voice:
        cfg["voice"] = a.voice
    proj = pipeline.create(cfg)
    pid = proj["id"]

    class Ctx:
        def cancel_flag(self):
            return False

    log = lambda m: print(m, flush=True)  # noqa: E731
    times, t0 = {}, time.time()
    for st in pipeline.stage_order(proj):
        t1 = time.time()
        proj = pipeline.load(pid)
        pipeline.stage_function(proj, st)(proj, Ctx(), log, lambda *x, **k: None)
        pipeline.save(proj)
        times[st] = round(time.time() - t1, 1)
        print(f"[demo] ✓ {st} {times[st]}s", flush=True)
    proj = pipeline.load(pid)
    d = pipeline.pdir(pid)
    plan = AM.current_plan(d)
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
    with open(os.path.join(out, "guion.txt"), "w", encoding="utf-8") as f:
        f.write(text + "\n")
    metrics = {"script": text, "duration_s": proj["audio"]["duration_s"], "tts_engine": proj["audio"].get("tts_engine"), "seconds": times,
               "total_s": round(time.time() - t0, 1), "qa_status": proj["qa"]["status"], "qa": proj["qa"]["checks"],
               "bible": plan["visual_bible"]["characters"],
               "scenes": [{"id": s["id"], "start_s": s["start_s"], "end_s": s["end_s"], "background": s["background_id"],
                           "characters": s["characters"], "overlays": [o["type"] for o in s["overlays"]],
                           "text": " ".join(w["text"] for w in plan["transcript"]["words"] if w["id"] in s["word_ids"])} for s in plan["scenes"]]}
    with open(os.path.join(out, "metrics.json"), "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=1)
    print(f"[demo] listo en {metrics['total_s']}s · QA {proj['qa']['status']} · {out}", flush=True)


if __name__ == "__main__":
    main()
