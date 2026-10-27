"""Pruebas sin GPU ni ComfyUI:  python -m unittest discover -s tests -v
Las marcadas E2E (VS_E2E=1) necesitan HyperFrames + Chrome + Kokoro."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from vs import captions, comfy_api, compiler, errors, fidelity, llm, manifest, pipeline, qa  # noqa: E402
from vs.textutil import emphasis_words, strip_emphasis, words  # noqa: E402

CAST = {"irena": {"name": "Irena Sendler"}}


class TextTests(unittest.TestCase):
    def test_emphasis(self):
        t = "Salvó a *dos mil quinientos* niños del *gueto*."
        self.assertEqual(strip_emphasis(t), "Salvó a dos mil quinientos niños del gueto.")
        self.assertEqual(emphasis_words(t), {2, 3, 4, 7})

    def test_spoken_numbers(self):
        self.assertIn(2500.0, fidelity.spoken_numbers("salvó a dos mil quinientos niños"))
        self.assertIn(2500.0, fidelity.spoken_numbers("salvó a 2.500 niños"))
        self.assertIn(1942.0, fidelity.spoken_numbers("en 1942"))


class CaptionTests(unittest.TestCase):
    def groups(self, text, n=3, upper=True):
        ws = [{"w": w, "s": i * 0.3, "e": i * 0.3 + 0.25} for i, w in enumerate(text.split())]
        return captions.group_words(ws, {"words": n, "upper": upper})

    def test_one_group_at_a_time(self):
        g = self.groups("Durante cuarenta años un farero llamado Tomás encendió la luz cada noche sin faltar jamás")
        for a, b in zip(g, g[1:]):
            self.assertLessEqual(a["e"], b["s"] + 1e-6)

    def test_no_dangling_function_word(self):
        g = self.groups("Irena entraba cada día como enfermera y salía con niños escondidos en maletas", 3)
        for grp in g[:-1]:
            last = grp["words"][-1]["w"].lower()
            self.assertNotIn(last, {"a", "la", "de", "y", "con", "en"}, [x["w"] for x in grp["words"]])

    def test_every_word_once(self):
        t = "Su nombre era Irena Sendler y nadie la recuerda"
        g = self.groups(t, 4, False)
        self.assertEqual(" ".join(w["w"] for x in g for w in x["words"]), t)


class TimelineTests(unittest.TestCase):
    def test_frames_and_order(self):
        sc = [{"narration": "uno dos", "audio": {"dur": 1.234}}, {"narration": "", "hold": 2.0}, {"narration": "tres", "audio": {"dur": 0.5}}]
        total = compiler.assign_timeline(sc, fps=30)
        t = 0
        for s in sc:
            self.assertAlmostEqual(s["start"] * 30, round(s["start"] * 30), places=4)
            self.assertAlmostEqual(s["start"], t, places=4)
            t = s["start"] + s["dur"]
        self.assertAlmostEqual(total, t, places=4)

    def test_align_transfers_times(self):
        s = {"narration": "Su nombre era Irena", "start": 1.0, "pre": 0.1, "dur": 2,
             "audio": {"dur": 1.5, "words": [{"w": "Su", "s": 0, "e": 0.2}, {"w": "nombre", "s": 0.25, "e": 0.6}, {"w": "era", "s": 0.62, "e": 0.8}, {"w": "Irene", "s": 0.85, "e": 1.3}]}}
        w = compiler.scene_words(s)
        self.assertEqual([x["w"] for x in w], ["Su", "nombre", "era", "Irena"])
        self.assertAlmostEqual(w[1]["s"], 1.35, places=3)


class LLMParseTests(unittest.TestCase):
    def test_fenced_trailing_commas(self):
        self.assertEqual(llm.parse_json('Aquí está:\n```json\n{"a": [1, 2,], }\n```', "object"), {"a": [1, 2]})

    def test_unquoted_keys_and_array(self):
        self.assertEqual(llm.parse_json("[{narration: \"hola\", shot: \"scene\"}]", "array")[0]["narration"], "hola")

    def test_normalize_defaults(self):
        s = llm.normalize_scene({"narration": "x", "shot": "inventado", "time": "??", "trans": "nope", "chars": [{"who": "nadie", "action": "volar"}]}, CAST, 1)
        self.assertEqual(s["shot"], "scene")
        self.assertEqual(s["trans"], "cut")
        self.assertEqual(s["chars"][0]["action"], "idle")
        self.assertNotIn("who", s["chars"][0])


class FidelityTests(unittest.TestCase):
    def test_domestic_story_has_zero_maps(self):
        """Guía V2 T08: historia doméstica sin geografía → 0 mapas."""
        story = "Ana se levantó temprano. Preparó café en la cocina. Lavó los platos despacio. Miró por la ventana y sonrió."
        scenes = pipeline.script_to_scenes(story, {"ana": {"name": "Ana"}})
        for s in scenes:  # aunque alguien intente forzar un mapa
            s.update(shot="map", country="Spain", place="Madrid", lat=40.4, lon=-3.7)
        scenes, rep = fidelity.check_story(scenes, {"ana": {"name": "Ana"}})
        self.assertEqual(rep["maps"], 0)
        self.assertTrue(all(s["visual_justification"] for s in scenes))

    def test_map_kept_when_place_is_narrated(self):
        s, issues = fidelity.check_scene({"narration": "Detrás de los muros del gueto de Varsovia, en Polonia.", "shot": "map", "country": "Poland", "place": "Varsovia"}, CAST)
        self.assertEqual(s["shot"], "map")
        self.assertFalse(issues)

    def test_unjustified_year_number_creature(self):
        for sc, bad in [({"narration": "Ese día todo cambió.", "shot": "year", "year": 1940}, "year"),
                        ({"narration": "Salvó a muchos niños.", "shot": "number", "number": "2500"}, "number"),
                        ({"narration": "Preparó café tranquila.", "shot": "danger"}, "danger")]:
            out, issues = fidelity.check_scene(dict(sc), CAST)
            self.assertNotEqual(out["shot"], bad)
            self.assertTrue(issues)

    def test_script_words_are_verbatim(self):
        t = "Durante cuarenta años, un farero llamado *Tomás* encendió la luz cada noche. Nadie sabía por qué. En 1953 llegó la tormenta."
        sc = pipeline.script_to_scenes(t, {"tomas": {"name": "Tomás"}})
        self.assertEqual(" ".join(s["narration"] for s in sc).split(), t.split())
        self.assertEqual(sc[0]["env"], "lighthouse")


class ComfyTests(unittest.TestCase):
    def test_node_missing(self):
        comfy_api._OBJ.update(t=10**12, info={"CLIPLoader": {}})
        with self.assertRaises(errors.VSError) as cm:
            comfy_api.validate({"1": {"class_type": "CLIPLoader"}, "2": {"class_type": "NoExiste"}})
        self.assertEqual(cm.exception.code, "NODE_MISSING")

    def test_llm_and_music_workflows_use_real_nodes(self):
        """Los class_type usados existen en ComfyUI (lista tomada del código fuente de ComfyUI, oct-2026)."""
        known = {"CLIPLoader", "TextGenerate", "PreviewAny", "CheckpointLoaderSimple", "TextEncodeAceStepAudio1.5", "ConditioningZeroOut",
                 "EmptyAceStep1.5LatentAudio", "ModelSamplingAuraFlow", "KSampler", "VAEDecodeAudio", "SaveAudio"}
        from vs import music
        wf = music.workflow("dark cinematic", 30, 1)
        self.assertTrue({n["class_type"] for n in wf.values()} <= known)

    def test_error_classification(self):
        self.assertEqual(errors.classify(RuntimeError("CUDA out of memory")), "VRAM_OOM")
        self.assertEqual(errors.classify(errors.VSError("MODEL_UNAVAILABLE", "x")), "MODEL_UNAVAILABLE")


class ContractTests(unittest.TestCase):
    def test_scene_contract_matches_v2_schema(self):
        schema = json.load(open(os.path.join(ROOT, "docs", "schemas", "scene.schema.json")))
        sc = {"id": "s001", "narration": "Su nombre era *Irena*.", "shot": "portrait", "chars": [{"who": "irena"}], "start": 0, "dur": 2.5,
              "pre": 0.1, "audio": {"dur": 2.0}, "visual_justification": "aparece Irena Sendler"}
        c = manifest.scene_contract(sc, 1, CAST)
        for k in schema["required"]:
            self.assertIn(k, c)
        self.assertFalse(set(c) - set(schema["properties"]), "propiedades no permitidas")
        self.assertIn(c["render_backend"], schema["properties"]["render_backend"]["enum"])
        self.assertIn(c["text_policy"], schema["properties"]["text_policy"]["enum"])


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg no instalado")
class QATests(unittest.TestCase):
    def test_qa_detects_wrong_resolution(self):
        d = tempfile.mkdtemp()
        v = os.path.join(d, "t.mp4")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=320x240:r=30:d=2", "-f", "lavfi", "-i",
                        "sine=f=440:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", v], check=True)
        r = qa.run_qa(v, {"W": 1080, "H": 1920, "fps": 30, "total": 2.0, "captions": 3})
        st = {c["check"]: c["status"] for c in r["checks"]}
        self.assertEqual(st["resolución"], "FAIL")
        self.assertEqual(st["pistas"], "PASS")
        self.assertEqual(r["status"], "FAIL")


@unittest.skipUnless(os.environ.get("VS_E2E"), "prueba lenta: VS_E2E=1")
class E2ETests(unittest.TestCase):
    def test_build_single_root(self):
        d = tempfile.mkdtemp()
        os.environ["VS_DATA"] = d
        proj = pipeline.create({"topic": "prueba", "duration": 10, "format": "vertical", "style": "cine_oscuro", "music": False})
        proj["scenes"] = pipeline.script_to_scenes("Irena caminaba sola por la calle. Nadie la vio llegar.", CAST)
        for s in proj["scenes"]:
            s["audio"] = {"dur": 2.0, "words": []}
        compiler.assign_timeline(proj["scenes"])
        info = compiler.build(proj, os.path.join(d, "hf"))
        roots = [f for f in os.listdir(os.path.join(d, "hf")) if f.endswith(".html")]
        self.assertEqual(roots, ["index.html"])
        self.assertTrue(info["chapters"])


if __name__ == "__main__":
    unittest.main()
