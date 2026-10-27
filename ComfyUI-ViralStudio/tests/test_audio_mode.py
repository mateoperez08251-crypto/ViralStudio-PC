"""Pruebas del modo «Mi audio → video» (04_PRUEBAS_Y_ENTREGA.md, pruebas 1-15).

    python -m unittest discover -s tests -v                    # rápidas (sin GPU; ffmpeg y node opcionales)
    VS_ASR_TESTS=1 python -m unittest tests.test_audio_mode    # + faster-whisper real sobre el fixture
    VS_E2E=1 python -m unittest tests.test_audio_mode          # + render real con HyperFrames (lento)

Las que necesitan algo que no está instalado se SALTAN con el motivo (no se dan por buenas).
"""
import asyncio
import copy
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import wave
from unittest.mock import patch

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
FIX = os.path.join(ROOT, "tests", "fixtures", "narracion_palomas.mp3")
HAS_FF = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))
HAS_NODE = bool(shutil.which("node"))

from vs import asr as ASR  # noqa: E402
from vs import audio_ingest as AI  # noqa: E402
from vs import audio_mode as AM  # noqa: E402
from vs import audio_storyboard as SB  # noqa: E402
from vs import audio_timeline as TL  # noqa: E402
from vs import pipeline  # noqa: E402
from vs import qa_audio_mode as QAA  # noqa: E402
from vs import vector_compiler as VC  # noqa: E402
from vs import visual_assets as VA  # noqa: E402
from vs.config import engine_js  # noqa: E402

SENT = ("Una paloma camina por la plaza. Su cabeza permanece casi inmóvil. El cuerpo se mueve debajo de ella. "
        "Un niño la mira desde un banco. Lo hace quince veces por segundo.")


def speechlike(path, dur=6.0, sr=24000, silent_from=None, silent_to=None, level=0.3):
    """Audio audible con 'sílabas' (tono modulado) y silencios opcionales."""
    t = np.arange(int(dur * sr)) / sr
    x = level * np.sin(2 * np.pi * 180 * t) * (0.55 + 0.45 * np.sin(2 * np.pi * 4 * t)) * (np.sin(2 * np.pi * 0.7 * t) > -0.6)
    if silent_from is not None:
        x[int(silent_from * sr):int(silent_to * sr)] = 0
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
    return path


def fake_raw(duration, text=SENT, start=0.3, gap_after=None):
    """Resultado de ASR simulado con tiempos absolutos realistas (solo para pruebas sin modelo)."""
    toks = text.split()
    step = (duration - start - 0.4) / len(toks)
    words, t = [], start
    for i, tok in enumerate(toks):
        if gap_after is not None and i == gap_after:
            t += 1.6
        words.append({"text": tok, "start_s": round(t, 3), "end_s": round(t + step * 0.8, 3), "confidence": 0.95 if i != 3 else 0.31})
        t += step * (1 if gap_after is None else (duration - start - 2.2) / (duration - start - 0.4))
    return {"engine": "faster-whisper", "model": "mock", "device": "cpu", "language": "es", "language_probability": 0.99,
            "duration": duration, "words": words, "segments": [], "alignment": {"method": "mock"}, "diarization": {"method": "single"}}


class Env(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self._env = patch.dict(os.environ, {"VS_DATA": self.tmp})
        self._env.start()

    def tearDown(self):
        self._env.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def audio_project(self, dur=12.0, **cfg):
        proj = pipeline.create(dict({"input_mode": "audio", "format": "vertical"}, **cfg))
        d = pipeline.pdir(proj["id"])
        src = speechlike(os.path.join(self.tmp, "in.wav"), dur)
        tmp = os.path.join(d, "audio", ".upload_t.part")
        os.makedirs(os.path.dirname(tmp), exist_ok=True)
        shutil.copy(src, tmp)
        proj["audio"] = AI.ingest(d, tmp, "mi historia.wav", {"max_seconds": 1800})
        pipeline.save(proj)
        return proj, d


# ------------------------------------------------------------------ 1. crear proyecto audio
class CreateTests(Env):
    def test_create_audio_project_without_topic(self):
        p = pipeline.create({"input_mode": "audio"})
        self.assertEqual(p["settings"]["input_mode"], "audio")
        self.assertEqual(p["settings"]["topic"], "")
        self.assertTrue(p["settings"]["preserve_original_audio"])
        self.assertFalse(p["settings"]["music"])
        self.assertEqual(pipeline.stage_order(p), AM.AUDIO_STAGES)
        # tema y guion siguen como antes
        t = pipeline.create({"topic": "faros"})
        s = pipeline.create({"script": "Hola mundo."})
        self.assertEqual((t["settings"]["input_mode"], s["settings"]["input_mode"]), ("topic", "script"))
        # proyectos NUEVOS de tema/guion: motor ilustrado por defecto; el clásico se pide explícitamente
        self.assertEqual(pipeline.stage_order(t), AM.VECTOR_STAGES)
        self.assertEqual(t["settings"]["engine"], "vector")
        c = pipeline.create({"topic": "faros", "engine": "classic"})
        self.assertEqual(pipeline.stage_order(c), pipeline.STAGES)

    def test_legacy_project_without_input_mode(self):
        """Proyecto JSON antiguo (sin input_mode): se deduce sin reescribirlo."""
        p = pipeline.create({"topic": "x"})
        raw = pipeline.load(p["id"])
        raw["settings"].pop("input_mode")
        pipeline.save(raw)
        self.assertEqual(pipeline.input_mode(pipeline.load(p["id"])), "topic")
        raw["settings"]["script"] = "Un guion."
        self.assertEqual(pipeline.input_mode(raw), "script")
        self.assertNotIn("input_mode", pipeline.load(p["id"])["settings"])

    def test_invalid_enums_rejected(self):
        for bad in ({"visual_style": "pixar"}, {"captions": "comic sans"}, {"fps": 7}, {"format": "8k"}):
            with self.assertRaises(Exception):
                pipeline.create(dict({"input_mode": "audio"}, **bad))

    def test_http_create_and_upload(self):
        if not HAS_FF:
            self.skipTest("ffmpeg no instalado")
        asyncio.run(self._http())

    async def _http(self):
        from aiohttp import FormData, web
        from aiohttp.test_utils import TestClient, TestServer

        from vs import server

        app = web.Application()
        routes = web.RouteTableDef()
        server.setup(routes)
        app.add_routes(routes)
        async with TestClient(TestServer(app)) as c:
            r = await c.post("/viralstudio/api/projects", json={"settings": {"input_mode": "audio"}})
            self.assertEqual(r.status, 200)
            pid = (await r.json())["id"]
            r = await c.post("/viralstudio/api/projects", json={"settings": {}})
            self.assertEqual(r.status, 400)  # sin tema ni guion ni modo audio: error como antes
            src = speechlike(os.path.join(self.tmp, "x.wav"), 4.0)
            fd = FormData()
            fd.add_field("file", open(src, "rb"), filename="../../../etc/passwd.wav", content_type="audio/wav")
            r = await c.post(f"/viralstudio/api/projects/{pid}/audio", data=fd)
            j = await r.json()
            self.assertEqual(r.status, 200, j)
            self.assertEqual(j["audio"]["original_path"], "audio/source/original.wav")
            self.assertEqual(j["audio"]["original_name"], "passwd.wav")
            self.assertFalse(os.path.exists(os.path.join(self.tmp, "etc")))
            # archivo corrupto: 400 y el audio anterior sigue intacto
            fd = FormData()
            fd.add_field("file", os.urandom(4096), filename="roto.mp3", content_type="audio/mpeg")
            r = await c.post(f"/viralstudio/api/projects/{pid}/audio", data=fd)
            self.assertEqual(r.status, 400)
            self.assertEqual(pipeline.load(pid)["audio"]["sha256"], j["audio"]["sha256"])
            r = await c.get(f"/viralstudio/api/projects/{pid}/audio")
            self.assertEqual(len((await r.json())["waveform"]["peaks"]), 2000)
            # tope de tamaño
            with patch("vs.server_audio.limits", return_value={"max_bytes": 1000, "max_seconds": 1800, "allow_video": True}):
                fd = FormData()
                fd.add_field("file", open(src, "rb"), filename="grande.wav")
                r = await c.post(f"/viralstudio/api/projects/{pid}/audio", data=fd)
                self.assertEqual(r.status, 413)
            self.assertFalse([f for f in os.listdir(os.path.join(pipeline.pdir(pid), "audio")) if f.endswith(".part")])


# ------------------------------------------------------------------ 2-3. ingesta
@unittest.skipUnless(HAS_FF, "ffmpeg no instalado")
class IngestTests(Env):
    def test_upload_valid_audio(self):
        proj, d = self.audio_project(7.5)
        a = proj["audio"]
        self.assertAlmostEqual(a["duration_s"], 7.5, places=3)
        orig = os.path.join(d, a["original_path"])
        self.assertEqual(AI.sha256_file(orig), a["sha256"])
        self.assertEqual(open(orig, "rb").read(), open(os.path.join(self.tmp, "in.wav"), "rb").read())  # mismos bytes
        self.assertEqual(AI.wav_info(os.path.join(d, a["master_path"]))["sample_rate"], 48000)
        self.assertEqual(AI.wav_info(os.path.join(d, a["analysis_path"]))["sample_rate"], 16000)

    def test_mp3_and_video_container(self):
        d = tempfile.mkdtemp(dir=self.tmp)
        shutil.copy(FIX, os.path.join(d, "u.part"))
        m = AI.ingest(d, os.path.join(d, "u.part"), "x.mp3", {"max_seconds": 1800})
        self.assertEqual(m["probe"]["codec"], "mp3")
        self.assertAlmostEqual(m["duration_s"], 23.0, delta=0.1)
        mp4 = os.path.join(self.tmp, "v.mp4")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x240:r=25:d=3", "-i", FIX, "-t", "3",
                        "-c:v", "libx264", "-c:a", "aac", mp4], check=True)
        d2 = tempfile.mkdtemp(dir=self.tmp)
        shutil.copy(mp4, os.path.join(d2, "u.part"))
        m2 = AI.ingest(d2, os.path.join(d2, "u.part"), "clip.mp4", {"max_seconds": 1800})
        self.assertTrue(m2["extracted_from_video"])
        self.assertEqual(m2["original_path"], "audio/source/original.mp4")

    def test_upload_rejects_invalid(self):
        d = tempfile.mkdtemp(dir=self.tmp)
        cases = []
        p = os.path.join(d, "a.part"); open(p, "wb").write(os.urandom(5000)); cases.append(("corrupto", p))
        p = speechlike(os.path.join(d, "silent.part"), 3.0, level=0.0); cases.append(("silencio", p))
        p = os.path.join(d, "novideo.part")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=160x120:r=10:d=1", "-c:v", "libx264", "-f", "mp4", p], check=True)
        cases.append(("sin pista de audio", p))
        p = speechlike(os.path.join(d, "long.part"), 5.0); cases.append(("demasiado largo", p))
        for name, path in cases:
            lim = {"max_seconds": 2 if name == "demasiado largo" else 1800}
            with self.assertRaises(Exception, msg=name):
                AI.ingest(d, path, name, lim)
            self.assertFalse(os.path.exists(path), f"{name}: el temporal debe borrarse")
            self.assertFalse(os.path.exists(os.path.join(d, "audio", "source_meta.json")), name)

    def test_silences_and_waveform(self):
        d = tempfile.mkdtemp(dir=self.tmp)
        speechlike(os.path.join(d, "u.part"), 8.0, silent_from=3.0, silent_to=5.0)
        m = AI.ingest(d, os.path.join(d, "u.part"), "x.wav", {"max_seconds": 100})
        self.assertTrue(any(a <= 3.1 and b >= 4.9 for a, b in m["silences"]), m["silences"])


# ------------------------------------------------------------------ 4-5. ASR
class ASRUnitTests(unittest.TestCase):
    def test_normalize_absolute_and_review(self):
        raw = [{"text": "b", "start_s": 1.0, "end_s": 1.4, "confidence": 0.9}, {"text": "a", "start_s": -0.2, "end_s": 0.5, "confidence": 0.2},
               {"text": "c", "start_s": 1.3, "end_s": 9.9, "confidence": 0.99}]
        w = ASR.normalize_words(raw, 5.0)
        self.assertEqual([x["text"] for x in w], ["a", "b", "c"])
        self.assertEqual(w[0]["start_s"], 0.0)
        self.assertTrue(w[0]["needs_review"])  # confianza baja
        self.assertLessEqual(w[-1]["end_s"], 5.0)
        self.assertGreaterEqual(w[2]["start_s"], w[1]["end_s"])  # sin solapes
        self.assertEqual([x["id"] for x in w], ["w0001", "w0002", "w0003"])

    def test_text_edit_keeps_times(self):
        tr = ASR.build_transcript(fake_raw(12.0), 12.0)
        new_text = tr["text"].replace("paloma", "palomita").replace("quince", "15")
        ed = ASR.apply_text_edit(tr, new_text=new_text)
        a = {w["text"]: (w["start_s"], w["end_s"]) for w in tr["words"]}
        b = {w["text"]: (w["start_s"], w["end_s"]) for w in ed["words"]}
        self.assertEqual(a["camina"], b["camina"])  # palabra igual: mismo tiempo exacto
        self.assertEqual(a["paloma"], b["palomita"])  # sustitución: hereda el tiempo
        pal = next(w for w in ed["words"] if w["text"] == "palomita")
        self.assertTrue(pal["edited"] and pal["needs_review"])
        self.assertEqual(ed["duration_s"], tr["duration_s"])

    def test_manual_transcript_is_marked_estimated(self):
        tr = ASR.manual_transcript("Hola a todos. Esto es una prueba.", 6.0, [[2.0, 3.0]])
        self.assertEqual(tr["source"], "manual_estimated")
        self.assertTrue(all(w["needs_review"] and w.get("timing") == "estimated" for w in tr["words"]))
        self.assertTrue(all(0 <= w["start_s"] < w["end_s"] <= 6.0 for w in tr["words"]))

    def test_cpu_fallback_and_missing_dependency(self):
        sys.path.insert(0, os.path.join(ROOT, "tts_worker"))
        import asr_worker

        dev, ct = asr_worker.pick_device({"device": "cpu"})
        self.assertEqual((dev, ct), ("cpu", "int8"))
        with tempfile.TemporaryDirectory() as d, patch("vs.asr.tts_python", return_value="/no/existe/python"):
            with self.assertRaises(Exception) as cm:
                ASR.transcribe(os.path.join(d, "x.wav"), "abc", {}, d)
            self.assertEqual(getattr(cm.exception, "code", None), "MODEL_UNAVAILABLE")

    def test_diarization_fallback(self):
        sys.path.insert(0, os.path.join(ROOT, "tts_worker"))
        import asr_worker

        res = {"words": [{"text": "hola", "start_s": 0, "end_s": 0.5}]}
        with patch.dict(os.environ, {"HF_TOKEN": ""}):
            r = asr_worker.diarize({"diarize": True, "audio": "x"}, res)
        self.assertEqual(r["method"], "single")


class ASRFallbackTests(Env):
    """Colab: CTranslate2 puede fallar en la GPU (libcublas/cuDNN no encontradas, VRAM llena) justo al
    empezar a decodificar. No debe quedar en «Error inesperado»: se repite en CPU y, si todo falla, se
    muestra la línea que explica el motivo (no el principio de la traza)."""

    FAKE = """import json, sys
job = json.load(open(sys.argv[1]))
if job["device"] != "cpu":
    print("Traceback (most recent call last):", flush=True)
    print('  File "asr_worker.py", line 80, in transcribe', flush=True)
    print("    for s in segs:", flush=True)
    print("        ^^^^", flush=True)
    import os; os._exit(134)  # cuDNN aborta el proceso sin excepción de Python
if job.get("model") == "roto":
    print("ERROR RuntimeError: Library libcublas.so.12 is not found or cannot be loaded", flush=True)
    sys.exit(1)
json.dump({"engine": "fake", "model": job["model"], "device": "cpu", "language": "es", "language_probability": 1.0,
           "words": [{"text": "hola", "start_s": 0.1, "end_s": 0.4, "confidence": 0.9}], "segments": []}, open(job["result"], "w"))
"""

    def _run(self, model):
        fake = os.path.join(self.tmp, "fake_worker.py")
        with open(fake, "w") as f:
            f.write(self.FAKE)
        logs = []
        with patch.object(ASR, "WORKER", fake), patch.object(ASR, "asr_params", lambda cfg: {"model": model, "device": "cuda", "language": "es"}):
            try:
                return ASR.transcribe(os.path.join(self.tmp, "a.wav"), "s" * 64, {}, os.path.join(self.tmp, "c"), log=logs.append), logs
            except Exception as e:
                return e, logs

    def test_gpu_crash_retries_on_cpu(self):
        res, logs = self._run("small")
        self.assertEqual(res["device"], "cpu")
        self.assertTrue(any("repito en CPU" in l for l in logs), logs)

    def test_failure_shows_real_reason(self):
        from vs.errors import describe

        err, _ = self._run("roto")
        d = describe(err)
        self.assertEqual(d["code"], "ASR_FAILED")
        self.assertTrue(d["message"].startswith("La transcripción falló: RuntimeError: Library libcublas.so.12"), d["message"][:200])

    def test_worker_env_adds_pip_cuda_libs(self):
        from vs import config

        sp = os.path.join(self.tmp, "site")
        os.makedirs(os.path.join(sp, "nvidia", "cublas", "lib"))
        os.makedirs(os.path.join(sp, "nvidia", "cudnn", "lib"))
        py = os.path.join(self.tmp, "py.sh")
        with open(py, "w") as f:
            f.write(f"#!/bin/sh\necho {sp}\n")
        os.chmod(py, 0o755)
        env = config.worker_env(py, {"LD_LIBRARY_PATH": "/usr/lib64-nvidia"})
        parts = env["LD_LIBRARY_PATH"].split(os.pathsep)
        self.assertEqual(parts[:2], [os.path.join(sp, "nvidia", "cublas", "lib"), os.path.join(sp, "nvidia", "cudnn", "lib")])
        self.assertIn("/usr/lib64-nvidia", parts)


@unittest.skipUnless(os.environ.get("VS_ASR_TESTS") and HAS_FF, "faster-whisper real: VS_ASR_TESTS=1")
class ASRRealTests(Env):
    def test_asr_outputs_absolute_word_timestamps(self):
        proj = pipeline.create({"input_mode": "audio"})
        d = pipeline.pdir(proj["id"])
        os.makedirs(os.path.join(d, "audio"), exist_ok=True)
        shutil.copy(FIX, os.path.join(d, "audio", "u.part"))
        a = AI.ingest(d, os.path.join(d, "audio", "u.part"), "f.mp3", {"max_seconds": 100})
        raw = ASR.transcribe(os.path.join(d, a["analysis_path"]), a["sha256"], {"asr_model": "small"}, os.path.join(d, "c"))
        tr = ASR.build_transcript(raw, a["duration_s"])
        self.assertEqual(tr["language"], "es")
        self.assertGreater(len(tr["words"]), 45)
        last = 0
        for w in tr["words"]:
            self.assertTrue(0 <= w["start_s"] < w["end_s"] <= a["duration_s"])
            self.assertGreaterEqual(w["start_s"], last)
            last = w["end_s"]
        txt = " ".join(ASR_norm(w["text"]) for w in tr["words"])
        for kw in ("palomas", "plaza", "cabeza", "salto", "camara"):
            self.assertIn(kw, txt)
        # la pausa real (12.3–14.0 s) no tiene palabras
        self.assertFalse([w for w in tr["words"] if 12.5 < w["start_s"] < 13.5])

    def test_asr_non_speech(self):
        p = os.path.join(self.tmp, "ns.wav")
        sr = 16000
        t = np.arange(sr * 6) / sr
        x = 0.05 * np.random.default_rng(1).standard_normal(len(t)) + 0.2 * np.sin(2 * np.pi * 220 * t) * (np.sin(2 * np.pi * 0.5 * t) > 0)
        with wave.open(p, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
            w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
        raw = ASR.transcribe(p, "ns", {"asr_model": "small"}, os.path.join(self.tmp, "c"))
        tr = ASR.build_transcript(raw, 6.0)
        self.assertTrue(tr["no_speech"] or all(w["needs_review"] for w in tr["words"]))


def ASR_norm(t):
    from vs.textutil import norm_word

    return norm_word(t)


# ------------------------------------------------------------------ 6, 9, 11. plan y línea de tiempo
class PlanTests(unittest.TestCase):
    def make(self, dur=14.0, gap_after=None, use_llm=False, raw=None):
        tr = ASR.build_transcript(raw or fake_raw(dur, gap_after=gap_after), dur)
        audio = {"duration_s": dur, "sha256": "x", "original_path": "audio/source/original.wav", "master_path": "m.wav", "sample_rate": 48000, "channels": 1}
        return SB.plan_from_transcript(tr, audio, {"fps": 30, "format": "vertical"}, log=lambda *a: None, use_llm=use_llm), tr

    def test_audio_timeline_no_gaps(self):
        plan, _ = self.make(14.0, gap_after=12)
        TL.validate_plan(plan, VA.all_ids())
        sc = plan["scenes"]
        self.assertGreaterEqual(len(sc), 2)
        self.assertEqual(sc[0]["start_frame"], 0)
        self.assertEqual(sc[-1]["end_frame"], TL.frame_count(14.0, 30))
        for a, b in zip(sc, sc[1:]):
            self.assertEqual(a["end_frame"], b["start_frame"])
        # todas las palabras pertenecen a alguna escena y el silencio queda dentro de una escena (sin negro)
        ids = [w for s in sc for w in s["word_ids"]]
        self.assertEqual(ids, [w["id"] for w in plan["transcript"]["words"]])
        self.assertTrue(all(s["background_id"] for s in sc))

    def test_frame_count_rounding(self):
        self.assertEqual(TL.frame_count(22.996, 30), 690)
        self.assertEqual(TL.frame_count(10.0, 30), 300)
        self.assertEqual(TL.frame_count(10.01, 30), 301)

    def test_no_speech_ambient(self):
        plan, _ = self.make(10.0, raw={"words": [], "language": None})
        self.assertTrue(plan["scenes"])
        self.assertTrue(all(s["narration_exact"] == "" for s in plan["scenes"]))
        self.assertTrue(all(s["template"] == "ambient" for s in plan["scenes"]))
        TL.validate_plan(plan)

    def test_semantic_choices(self):
        plan, _ = self.make(14.0)
        b = plan["visual_bible"]
        self.assertIn("pigeon_rig_v1", [c["asset_id"] for c in b["characters"]])
        self.assertIn("person_rig_v1", [c["asset_id"] for c in b["characters"]])
        child = next(c for c in b["characters"] if c["asset_id"] == "person_rig_v1")
        self.assertEqual(child["variant"], "child")
        ov = [o for s in plan["scenes"] for o in s["overlays"] if o["type"] == "counter_badge"]
        self.assertEqual(ov[0]["value"], 15.0)  # «quince» dicho → contador 15
        self.assertIn("veces", ov[0]["label"])
        beats = {b["action"] for s in plan["scenes"] for b in s["action_beats"]}
        self.assertIn("walk", beats)
        # el mismo personaje conserva su id en varias escenas (continuidad)
        n = sum(1 for s in plan["scenes"] if "pigeon_01" in s["character_ids"])
        self.assertGreaterEqual(n, 2)

    def test_article_is_not_a_number(self):
        raw = fake_raw(6.0, text="Así ve el mundo como una cámara estable.")
        plan, _ = self.make(6.0, raw=raw)
        self.assertFalse([o for s in plan["scenes"] for o in s["overlays"] if o["type"] == "counter_badge"])

    def test_audio_captions_absolute(self):
        plan, tr = self.make(14.0, gap_after=12)
        g = VC.caption_groups(plan["transcript"]["words"], set())
        flat = [w for grp in g for ln in grp["lines"] for w in ln]
        self.assertEqual(len(flat), len(tr["words"]))
        self.assertEqual(flat[0]["s"], round(tr["words"][0]["start_s"], 3))  # sin `pre` ni `gap`
        self.assertEqual(flat[-1]["e"], round(tr["words"][-1]["end_s"], 3))
        for a, b in zip(g, g[1:]):
            self.assertLessEqual(a["e"], b["s"] + 1e-6)  # un grupo visible a la vez
        # subtítulos ocultables
        d = VC.engine_data(plan, captions=False)
        self.assertFalse(d["captions"]["enabled"])

    def test_bad_llm_plan(self):
        """El JSON del LLM se valida; si es malo se usa el planificador por reglas."""
        from vs import llm

        dur = 14.0
        tr = ASR.build_transcript(fake_raw(dur), dur)
        units = TL.units_from_words(tr["words"], dur)
        bible = SB.build_bible(units, tr["words"], {})
        good = SB.rule_choices(units, tr["words"], bible, {})
        bads = []
        b = copy.deepcopy(good); b[0]["units"] = [0, len(units) + 3]; bads.append(("fuera de rango", b))
        b = copy.deepcopy(good); b[0]["background"] = "castillo_inventado"; bads.append(("asset desconocido", b))
        b = copy.deepcopy(good); b.pop(1); bads.append(("hueco de unidades", b))
        b = copy.deepcopy(good); b[0]["overlays"] = [{"type": "counter_badge", "word": units[0]["word_ids"][0], "value": 999, "label": "x"}]; bads.append(("cifra inventada", b))
        b = copy.deepcopy(good); b[0]["overlays"] = [{"type": "kinetic_title", "word": units[0]["word_ids"][0], "title": "Fuente: Harvard 2021"}]; bads.append(("rótulo no narrado", b))
        b = copy.deepcopy(good); b[0]["template"] = "<script>alert(1)</script>"; bads.append(("plantilla libre", b))
        b = []; bads.append(("escena vacía", b))
        for name, ch in bads:
            with self.assertRaises(TL.PlanError, msg=name):
                SB.validate_choices(ch, units, tr["words"], bible)
        audio = {"duration_s": dur, "sha256": "x"}
        llm.use_backend(lambda *a: '{"scenes": [{"units": [0, 99], "template": "nope"}]}')
        try:
            p = SB.plan_from_transcript(tr, audio, {"fps": 30}, log=lambda *a: None, use_llm=True)
            self.assertEqual(p["planner"], "rules")
            llm.use_backend(lambda *a: json.dumps({"scenes": good}))
            p2 = SB.plan_from_transcript(tr, audio, {"fps": 30}, log=lambda *a: None, use_llm=True)
            self.assertEqual(p2["planner"], "llm")
            TL.validate_plan(p2, VA.all_ids())
        finally:
            llm.use_backend(None)

    def test_scene_contract_v2_matches_schema(self):
        from vs import manifest

        schema = json.load(open(os.path.join(ROOT, "docs", "schemas", "scene.v2.schema.json")))
        legacy = json.load(open(os.path.join(ROOT, "docs", "schemas", "scene.schema.json")))
        plan, _ = self.make(14.0)
        for sc in plan["scenes"]:
            c = manifest.scene_contract_v2(sc, plan)
            for k in schema["required"]:
                self.assertIn(k, c)
            self.assertFalse(set(c) - set(schema["properties"]))
            self.assertIn(c["render_backend"], schema["properties"]["render_backend"]["enum"])
            self.assertIn(c["template"], schema["properties"]["template"]["enum"])
        # el esquema v1 (modo clásico) sigue intacto
        self.assertEqual(legacy["properties"]["render_backend"]["enum"], ["blender", "web", "map", "comfyui"])

    def test_plan_validator_rejects(self):
        plan, _ = self.make(14.0)
        for name, mut in [("hueco", lambda p: p["scenes"][1].__setitem__("start_frame", p["scenes"][1]["start_frame"] + 2)),
                          ("TTS", lambda p: p["audio"].__setitem__("tts_used", True)),
                          ("palabra fuera", lambda p: p["transcript"]["words"][-1].__setitem__("end_s", 99.0)),
                          ("motor", lambda p: p["scenes"][0].__setitem__("render_backend", "made_up")),
                          ("fin", lambda p: p["scenes"][-1].__setitem__("end_frame", p["scenes"][-1]["end_frame"] - 1))]:
            p = copy.deepcopy(plan)
            mut(p)
            with self.assertRaises(TL.PlanError, msg=name):
                TL.validate_plan(p, VA.all_ids())

    def test_move_cut_keeps_partition(self):
        plan, _ = self.make(14.0)
        s1 = plan["scenes"][1]
        TL.retime_scene_bounds(plan, {s1["id"]: s1["start_s"] + 0.3})
        TL.validate_plan(plan, VA.all_ids())
        # mover el corte por encima de acciones ancladas a palabras: siguen válidas (se reasignan)
        for k in range(1, len(plan["scenes"])):
            sk, prev = plan["scenes"][k], plan["scenes"][k - 1]
            for t in (sk["start_s"] + 0.9, prev["start_s"] + 0.4):
                if prev["start_s"] + 0.1 < t < sk["end_s"] - 0.1:
                    TL.retime_scene_bounds(plan, {sk["id"]: t})
                    TL.validate_plan(plan, VA.all_ids())
        with self.assertRaises(TL.PlanError):
            TL.retime_scene_bounds(plan, {plan["scenes"][0]["id"]: 1.0})

    def test_edit_scene_only_visual(self):
        plan, _ = self.make(14.0)
        sid = plan["scenes"][0]["id"]
        before = [(s["start_frame"], s["end_frame"]) for s in plan["scenes"]]
        SB.edit_scene(plan, sid, {"camera": {"shot": "closeup", "movement": "push_in", "focus": {"target": "pigeon_01", "part": "head"}}})
        self.assertEqual(before, [(s["start_frame"], s["end_frame"]) for s in plan["scenes"]])
        self.assertEqual(plan["scenes"][0]["revision"], 2)
        with self.assertRaises(TL.PlanError):
            SB.edit_scene(plan, sid, {"start_frame": 3})


# ------------------------------------------------------------------ 7, 8, 10. pipeline del modo audio
@unittest.skipUnless(HAS_FF, "ffmpeg no instalado")
class AudioPipelineTests(Env):
    def run_stages(self, pid, stages):
        proj = pipeline.load(pid)
        d = pipeline.pdir(pid)

        class C:
            def cancel_flag(self):
                return False

        for st in stages:
            AM.AUDIO_STAGE_FN[st](proj, C(), lambda *a: None, lambda *a, **k: None, d)
            pipeline.save(proj)
        return proj

    def test_audio_mode_skips_tts(self):
        proj, d = self.audio_project(12.0)
        boom = AssertionError("voice.synthesize NO debe llamarse en el modo audio")
        with patch("vs.voice.synthesize", side_effect=boom) as syn, patch("vs.asr.transcribe", return_value=fake_raw(12.0)):
            p = self.run_stages(proj["id"], ["transcribe", "plan", "music", "build"])
            syn.assert_not_called()
        self.assertTrue(os.path.exists(os.path.join(d, "hf", "assets", "audio", "mix.wav")))
        self.assertTrue(os.path.exists(os.path.join(d, "plan", "audio_plan.json")))
        # pedir "voice" a un proyecto de audio no hace nada (la voz es el audio original)
        pipeline._jobs = __import__("queue").Queue()
        with patch("vs.pipeline._ensure_worker"):
            pipeline.run(p["id"], ["voice", "build"])
            self.assertEqual(pipeline.load(p["id"])["job"]["stages"], ["build"])

    def test_audio_master_continuity(self):
        proj, d = self.audio_project(9.0)
        master = os.path.join(d, proj["audio"]["master_path"])
        total = TL.frame_count(9.0, 30) / 30
        mix = AM.build_audio_mode_tracks(master, total, os.path.join(self.tmp, "mix.wav"))
        x, y = AI.read_mono(master), AI.read_mono(mix)
        self.assertTrue(np.array_equal((x * 32768).astype(np.int16), (y[:len(x)] * 32768).astype(np.int16)), "la voz debe pasar sin cambios")
        vid = os.path.join(self.tmp, "v.mp4")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=gray:s=160x284:r=30", "-frames:v", str(TL.frame_count(9.0, 30)),
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", os.path.join(self.tmp, "p.mp4")], check=True)
        AM.assemble_audio_mode([os.path.join(self.tmp, "p.mp4")], mix, vid, 30)
        res = QAA.voice_continuity(master, vid, 9.0)
        for r in res:
            if r.get("lag_ms") is not None:
                self.assertLessEqual(abs(r["lag_ms"]), 1000 / 30)
                self.assertGreater(r["corr"], 0.95)
        # control negativo: un desplazamiento de 120 ms SÍ se detecta
        shifted = os.path.join(self.tmp, "shift.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mix, "-af", "adelay=120:all=1", shifted], check=True)
        bad = QAA.voice_continuity(master, shifted, 9.0)
        self.assertTrue(any(r.get("lag_ms") is not None and abs(abs(r["lag_ms"]) - 120) < 5 for r in bad), bad)
        # con música: la voz sigue en su sitio
        mus = speechlike(os.path.join(self.tmp, "music.wav"), 4.0, level=0.2)
        mix2 = AM.build_audio_mode_tracks(master, total, os.path.join(self.tmp, "mix2.wav"), music=mus, music_volume=0.12)
        res2 = QAA.voice_continuity(master, mix2, 9.0)
        self.assertTrue(all(r.get("lag_ms") is None or abs(r["lag_ms"]) <= 1 for r in res2), res2)

    def test_rerender_single_scene(self):
        """Editar una escena solo cambia SU composición; audio y demás escenas idénticos."""
        proj, d = self.audio_project(12.0)
        with patch("vs.asr.transcribe", return_value=fake_raw(12.0)):
            self.run_stages(proj["id"], ["transcribe", "plan", "build"])
        h = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
        comp = os.path.join(d, "hf", "compositions")
        before = {f: h(os.path.join(comp, f)) for f in os.listdir(comp)}
        mix0 = h(os.path.join(d, "hf", "assets", "audio", "mix.wav"))
        plan = AM.current_plan(d)
        sid = plan["scenes"][1]["id"]
        SB.edit_scene(plan, sid, {"camera": {"shot": "medium", "movement": "orbit"}})
        AM.save_plan(d, plan, "test")
        proj = pipeline.load(proj["id"])
        proj["outputs"].pop("info", None)
        pipeline.save(proj)
        self.run_stages(proj["id"], ["build"])
        after = {f: h(os.path.join(comp, f)) for f in os.listdir(comp)}
        changed = sorted(f for f in after if after[f] != before.get(f))
        self.assertEqual(changed, [f"{sid}.html"])
        self.assertEqual(mix0, h(os.path.join(d, "hf", "assets", "audio", "mix.wav")))
        self.assertTrue(os.path.exists(os.path.join(d, "plan", "versions")))  # versión anterior guardada

    def test_transcript_edit_invalidates_only_captions(self):
        proj, d = self.audio_project(12.0)
        with patch("vs.asr.transcribe", return_value=fake_raw(12.0)):
            self.run_stages(proj["id"], ["transcribe", "plan"])
        plan0 = AM.current_plan(d)
        tr = AM.current_transcript(d)
        ed = ASR.apply_text_edit(tr, word_edits={tr["words"][1]["id"]: "palomita"})
        plan1 = AM.refresh_plan_words(copy.deepcopy(plan0), ed)
        self.assertEqual([(s["start_frame"], s["end_frame"], s["template"]) for s in plan0["scenes"]],
                         [(s["start_frame"], s["end_frame"], s["template"]) for s in plan1["scenes"]])
        self.assertIn("palomita", plan1["scenes"][0]["narration_exact"])

    def test_cancel_and_interrupt_keep_project_consistent(self):
        proj, d = self.audio_project(6.0)
        p = pipeline.load(proj["id"])
        p["job"] = {"id": "j", "stages": ["transcribe", "plan", "build"], "done": ["transcribe"], "state": "RUNNING"}
        pipeline.save(p)
        rec = pipeline.recover()
        self.assertEqual(rec[0]["remaining"], ["plan", "build"])
        self.assertEqual(pipeline.state(pipeline.load(proj["id"])), "INTERRUPTED")
        json.load(open(os.path.join(d, "project.json")))  # sigue siendo JSON válido

        class Ctx:
            def cancel_flag(self):
                return True

        # cancelar durante la transcripción: el subproceso muere y no queda transcripción a medias
        fake = os.path.join(self.tmp, "slow.py")
        open(fake, "w").write("import time\nfor i in range(100):\n    print('PROGRESS 1 100 x', flush=True)\n    time.sleep(0.1)\n")
        with patch("vs.asr.WORKER", fake):
            with self.assertRaises(RuntimeError):
                AM.stage_transcribe(pipeline.load(proj["id"]), Ctx(), lambda *a: None, lambda *a, **k: None, d)
        self.assertFalse(os.path.exists(os.path.join(d, "transcript", "transcript_raw.json")))


# ------------------------------------------------------------------ 12. determinismo del motor (Node, sin navegador)
@unittest.skipUnless(HAS_NODE, "node no instalado")
class EngineTests(unittest.TestCase):
    def node(self, code, data):
        with tempfile.TemporaryDirectory() as d:
            ej = os.path.join(d, "engine.js")
            open(ej, "w").write(engine_js())
            dp = os.path.join(d, "data.json")
            json.dump(data, open(dp, "w"))
            js = os.path.join(d, "t.js")
            open(js, "w").write("global.window = global;\nconst fs = require('fs');\neval(fs.readFileSync(process.argv[2], 'utf8'));\n"
                                "const data = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));\n" + code)
            r = subprocess.run(["node", js, ej, dp], capture_output=True, text=True, timeout=120)
            self.assertEqual(r.returncode, 0, r.stderr[-2000:])
            return json.loads(r.stdout)

    def plan_data(self):
        dur = 14.0
        tr = ASR.build_transcript(fake_raw(dur), dur)
        audio = {"duration_s": dur, "sha256": "x"}
        plan = SB.plan_from_transcript(tr, audio, {"fps": 30, "format": "vertical"}, log=lambda *a: None, use_llm=False)
        return VC.engine_data(plan)

    def test_engine_parses_whole(self):
        """Un error de sintaxis en un archivo del motor rompería TAMBIÉN el modo clásico."""
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
            f.write(engine_js())
        r = subprocess.run(["node", "--check", f.name], capture_output=True, text=True)
        os.remove(f.name)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_deterministic_pose(self):
        out = self.node("""
const a = JSON.stringify(VSV.stateAt(data, 2.5));
[13.1, 0.2, 7.7, 2.49, 11.0, 5.5].forEach((t) => VSV.stateAt(data, t));
const b = JSON.stringify(VSV.stateAt(data, 2.5));
const P = VSV.RIGS.person.pose({t: 2.5, lt: 1, base: 'walk', beats: [{at: 2.0, action: 'surprise'}], seed: 3});
const P2 = VSV.RIGS.person.pose({t: 2.5, lt: 1, base: 'walk', beats: [{at: 2.0, action: 'surprise'}], seed: 3});
console.log(JSON.stringify({same: a === b, pose: JSON.stringify(P) === JSON.stringify(P2), scene: VSV.stateAt(data, 2.5).scene, a}));
""", self.plan_data())
        self.assertTrue(out["same"])
        self.assertTrue(out["pose"])

    def test_character_looks_identical_across_scenes(self):
        """El mismo character_id conserva piel, pelo, ropa y escala en todas las escenas."""
        dur = 14.0
        tr = ASR.build_transcript(fake_raw(dur), dur)
        plan = SB.plan_from_transcript(tr, {"duration_s": dur, "sha256": "x"}, {"fps": 30}, log=lambda *a: None, use_llm=False)
        child = next(c for c in plan["visual_bible"]["characters"] if c["asset_id"] == "person_rig_v1")
        self.assertIn("skin", child["colors"])
        data = VC.engine_data(plan)
        scenes_with = [s for s in data["scenes"] if any(c["id"] == child["id"] for c in s["characters"])]
        self.assertGreaterEqual(len(scenes_with), 2)
        times = [(s["start_s"] + s["end_s"]) / 2 for s in scenes_with]
        out = self.node(f"""
const looks = {json.dumps(times)}.map((t) => VSV.stateAt(data, t).actors.find((a) => a.id === {json.dumps(child["id"])}));
console.log(JSON.stringify(looks.map((a) => a && a.look)));
""", data)
        self.assertTrue(all(x == out[0] for x in out), out)
        self.assertEqual(out[0]["skin"], child["colors"]["skin"])

    def test_rigs_have_articulated_parts_and_motion(self):
        lib = VA.library()
        chars = {aid: [e["builder"], e.get("params") or {}] for aid, e in lib["characters"].items()}
        out = self.node("""
const res = {};
for (const [aid, [rig, v]] of Object.entries(data.chars)) {
  const R = VSV.RIGS[rig];
  if (!R) continue;
  const p0 = R.pose({t: 1.0, lt: 1, base: 'walk', beats: [], seed: 1, v});
  const p1 = R.pose({t: 1.3, lt: 1.3, base: 'walk', beats: [], seed: 1, v});
  res[aid] = {parts: Object.keys(p0).filter((k) => !k.startsWith('_')).length, moves: JSON.stringify(p0) !== JSON.stringify(p1)};
}
// parpadeo: en algún instante de 6 s el párpado se cierra
let closed = 0; for (let t = 0; t < 6; t += 1/30) closed = Math.max(closed, VSV.blinkAt(t, 5, []));
// mirar: la pose cambia con un beat look_left
const a = VSV.RIGS.pigeon.pose({t: 2, lt: 2, base: 'idle', beats: [], seed: 1});
const b = VSV.RIGS.pigeon.pose({t: 2, lt: 2, base: 'idle', beats: [{at: 1.5, action: 'look_left'}], seed: 1});
console.log(JSON.stringify({res, closed, look: a.head.r !== b.head.r, worlds: Object.keys(VSV.WORLD_ASSETS), props: Object.keys(VSV.PROP_ASSETS), ovs: Object.keys(VSV.OVERLAYS)}));
""", {"chars": chars})
        for aid in lib["characters"]:
            self.assertIn(aid, out["res"], aid)
            self.assertTrue(out["res"][aid]["moves"], aid)
            if aid.startswith("sp_"):  # cada especie: rig articulado con ≥ 5 piezas
                self.assertGreaterEqual(out["res"][aid]["parts"], 5, aid)
        self.assertGreaterEqual(out["res"]["person_rig_v1"]["parts"], 5)
        self.assertGreaterEqual(out["res"]["pigeon_rig_v1"]["parts"], 5)
        self.assertGreater(out["closed"], 0.9)
        self.assertTrue(out["look"])
        self.assertEqual(set(out["worlds"]), set(lib["backgrounds"]))
        self.assertEqual(set(out["props"]), set(lib["props"]))
        self.assertTrue(set(lib["infographics"]) <= set(out["ovs"]))


# ------------------------------------------------------------------ zonas seguras (textos dentro del cuadro)
def _has_playwright():
    if not HAS_NODE:
        return False
    return subprocess.run(["node", "-e", "require('playwright')"], capture_output=True, cwd=os.path.join(ROOT, "tools")).returncode == 0


@unittest.skipUnless(_has_playwright(), "node + playwright no disponibles")
class SafeZoneTests(unittest.TestCase):
    def test_long_texts_stay_inside_frame(self):
        """Rótulos y subtítulos extremos (palabras larguísimas, cifras enormes) no se salen del cuadro."""
        long_text = ("Electroencefalografistas otorrinolaringológicos desoxirribonucleico anticonstitucionalmente "
                     "veintitrés mil cuatrocientos cincuenta y seis interdisciplinariamente.")
        for fmt in ("vertical", "horizontal", "cuadrado"):
            dur = 12.0
            tr = ASR.build_transcript(fake_raw(dur, text=long_text), dur)
            audio = {"duration_s": dur, "sha256": "x"}
            plan = SB.plan_from_transcript(tr, audio, {"fps": 30, "format": fmt}, log=lambda *a: None, use_llm=False)
            w = {x["id"]: x for x in plan["transcript"]["words"]}
            first = plan["scenes"][0]
            wid = first["word_ids"][0]
            first["overlays"] = [
                {"type": "counter_badge", "at_s": w[wid]["start_s"], "value": 23456789, "label": "otorrinolaringológicos desoxirribonucleico"},
                {"type": "kinetic_title", "at_s": w[wid]["start_s"], "words": first["word_ids"][:3]},
                {"type": "document_card", "at_s": w[wid]["start_s"], "title": long_text},
            ]
            first["highlight_word_ids"] = first["word_ids"][:4]
            res = QAA.safe_zones(plan)
            self.assertTrue(res.get("ok"), f"{fmt}: {res}")


# ------------------------------------------------------------------ 13. render real con HyperFrames
@unittest.skipUnless(os.environ.get("VS_E2E") and HAS_FF, "render real: VS_E2E=1 (HyperFrames + Chrome)")
class E2ERenderTests(Env):
    def test_hyperframes_render_audio_mode(self):
        proj = pipeline.create({"input_mode": "audio", "quality": "draft"})
        d = pipeline.pdir(proj["id"])
        os.makedirs(os.path.join(d, "audio"), exist_ok=True)
        shutil.copy(FIX, os.path.join(d, "audio", "u.part"))
        proj["audio"] = AI.ingest(d, os.path.join(d, "audio", "u.part"), "palomas.mp3", {"max_seconds": 100})
        pipeline.save(proj)
        tr_raw = None
        if not os.environ.get("VS_ASR_TESTS"):
            tr_raw = fake_raw(proj["audio"]["duration_s"], text="¿Por qué las palomas mueven la cabeza al caminar? Mira esta paloma en la plaza. "
                              "Un niño la observa desde un banco sorprendido. Su cuerpo avanza pero la cabeza se queda quieta.")
        ctx = type("C", (), {"cancel_flag": lambda self: False})()
        ctxp = (lambda *a: None, lambda *a, **k: None)
        with patch("vs.asr.transcribe", return_value=tr_raw) if tr_raw else patch.dict(os.environ, {}):
            for st in AM.AUDIO_STAGES:
                proj = pipeline.load(proj["id"])
                AM.AUDIO_STAGE_FN[st](proj, ctx, *ctxp, d)
                pipeline.save(proj)
        proj = pipeline.load(proj["id"])
        rep = {c["check"]: c for c in proj["qa"]["checks"]}
        self.assertEqual(rep["frames de video"]["status"], "PASS", rep["frames de video"])
        self.assertEqual(rep["continuidad de la voz original"]["status"], "PASS", rep["continuidad de la voz original"])
        self.assertEqual(rep["duración del audio"]["status"], "PASS")
        v = proj["outputs"]["video"]
        f1 = QAA.frame_gray(v, 2.5, 270, 480)
        # G: segundo render completo (sin caché) → mismo fotograma en t=2.5 (tolerancia por códec)
        shutil.rmtree(os.path.join(d, "hf", "renders"))
        AM.stage_render(proj, ctx, *ctxp, d)
        f2 = QAA.frame_gray(proj["outputs"]["video"], 2.5, 270, 480)
        mse = float(np.mean((f1 - f2) ** 2))
        psnr = 99.0 if mse == 0 else 10 * np.log10(255 ** 2 / mse)
        self.assertGreater(psnr, 40.0, f"PSNR {psnr:.1f} dB")
        # F: re-render de una escena → solo esa parte se vuelve a codificar
        parts = proj["outputs"]["parts"]
        mt = {p: os.path.getmtime(p) for p in parts}
        plan = AM.current_plan(d)
        sid = plan["scenes"][0]["id"]
        SB.edit_scene(plan, sid, {"camera": {"shot": "medium", "movement": "orbit"}})
        AM.save_plan(d, plan, "e2e")
        proj["outputs"].pop("info", None)
        time.sleep(1.1)
        AM.stage_build(proj, ctx, *ctxp, d)
        AM.stage_render(proj, ctx, *ctxp, d)
        changed = [p for p in proj["outputs"]["parts"] if os.path.getmtime(p) != mt.get(p)]
        self.assertEqual([os.path.basename(p) for p in changed], [f"part_{sid}.mp4"])


# ------------------------------------------------------------------ 15. Colab / doctor
class ColabTests(unittest.TestCase):
    def test_notebook_embeds_new_modules(self):
        nb = os.path.join(os.path.dirname(ROOT), "colab", "ViralStudio_Colab.ipynb")
        txt = open(nb, encoding="utf-8").read()
        self.assertIn("faster-whisper", txt)
        self.assertIn("audio_mode", txt + open(os.path.join(os.path.dirname(ROOT), "colab", "setup_cell.py"), encoding="utf-8").read())

    def test_doctor_lists_asr_as_optional(self):
        from vs import doctor

        rows = doctor.audio_mode_checks()
        names = {r["name"]: r for r in rows}
        self.assertIn("ffmpeg/ffprobe", names)
        self.assertTrue(names["ffmpeg/ffprobe"]["critical"])
        self.assertFalse(names["pyannote (diarización)"]["critical"])


if __name__ == "__main__":
    unittest.main()
