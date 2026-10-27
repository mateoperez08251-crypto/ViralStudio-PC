"""Guion/Tema → video con el motor ILUSTRADO: personajes y animales detectados del texto.

    python -m unittest tests.test_script_vector            # rápidas (voz simulada, sin render)
    VS_E2E=1 python -m unittest tests.test_script_vector   # + render HyperFrames real de un guion con animales
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

from test_audio_mode import HAS_FF, speechlike  # noqa: E402
from vs import asr as ASR  # noqa: E402
from vs import audio_mode as AM  # noqa: E402
from vs import audio_storyboard as SB  # noqa: E402
from vs import audio_timeline as TL  # noqa: E402
from vs import cast as CAST  # noqa: E402
from vs import creature_design as CD  # noqa: E402
from vs import llm, pipeline, voice  # noqa: E402
from vs import vector_compiler as VC  # noqa: E402
from vs import visual_assets as VA  # noqa: E402
from vs.config import engine_js  # noqa: E402


def fake_synth(todo, cfg, vdir, progress=None, log=print, cancel=None):
    """Voz simulada (sin modelo): un clip con forma de voz por escena, sin tiempos de palabra."""
    os.makedirs(vdir, exist_ok=True)
    out = {}
    for it in todo:
        d = max(1.2, len(it["text"].split()) * 0.36)
        f = os.path.join(vdir, it["id"] + ".wav")
        speechlike(f, d, sr=48000)
        out[it["id"]] = {"file": f, "dur": d, "words": []}
    return out


def wr(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


class Ctx:
    def cancel_flag(self):
        return False


def plan_text(text, mn=1.4, use_llm=False):
    toks, words, t = text.split(), [], 0.2
    for x in toks:
        words.append({"text": x, "start_s": t, "end_s": t + 0.3, "confidence": 0.9})
        t += 0.36 + (0.4 if x[-1] in ".!?" else 0)
    dur = t + 0.5
    tr = ASR.build_transcript({"words": words}, dur)
    return SB.plan_from_transcript(tr, {"duration_s": dur, "sha256": "x"}, {"fps": 30, "scene_min_s": mn}, log=lambda *a: None, use_llm=use_llm)


def scene_text(plan, s):
    return " ".join(w["text"] for w in plan["transcript"]["words"] if w["id"] in s["word_ids"])


class Env(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self._env = patch.dict(os.environ, {"VS_DATA": self.tmp})
        self._env.start()

    def tearDown(self):
        self._env.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_script(self, script, stages=("story", "voice", "narration", "plan")):
        proj = pipeline.create({"script": script, "format": "vertical"})
        with patch.object(voice, "synthesize", fake_synth), patch.object(llm, "generate", side_effect=RuntimeError("sin LLM en la prueba")):
            for st in stages:
                proj = pipeline.load(proj["id"])
                pipeline.stage_function(proj, st)(proj, Ctx(), lambda *a: None, lambda *a, **k: None)
                pipeline.save(proj)
        return pipeline.load(proj["id"])


# ------------------------------------------------------------------ pipeline guion → ilustrado
@unittest.skipUnless(HAS_FF, "ffmpeg")
class ScriptPipelineTests(Env):
    SCRIPT = ("Un elefante camina por la sabana africana. De pronto un león ruge y el elefante corre. "
              "La doctora Ana mira al perro Toby. Un pulpo tiene 3 corazones y vive en el mar.")

    def test_engine_default_and_stages(self):
        p = pipeline.create({"script": "Hola."})
        self.assertEqual(p["settings"]["engine"], "vector")
        self.assertEqual(pipeline.stage_order(p), AM.VECTOR_STAGES)
        self.assertFalse(p["settings"]["end_card"])
        # proyectos antiguos (sin engine) siguen con el motor clásico
        raw = pipeline.load(p["id"])
        raw["settings"].pop("engine")
        pipeline.save(raw)
        self.assertEqual(pipeline.stage_order(pipeline.load(p["id"])), pipeline.STAGES)

    def test_script_drives_everything(self):
        proj = self.run_script(self.SCRIPT)
        d = pipeline.pdir(proj["id"])
        plan = AM.current_plan(d)
        # narración = voz del guion, texto EXACTO del guion (no lo que entienda un ASR)
        self.assertEqual(plan["audio"]["narration_source"], "tts_script")
        self.assertTrue(plan["audio"]["tts_used"])
        self.assertEqual(" ".join(w["text"] for w in plan["transcript"]["words"]), self.SCRIPT)
        TL.validate_plan(plan, VA.all_ids())
        # personajes y animales detectados del texto, con id persistente
        bible = {c["id"]: c for c in plan["visual_bible"]["characters"]}
        for cid in ("elephant_01", "lion_01", "doctor_01", "dog_01", "octopus_01"):
            self.assertIn(cid, bible)
        self.assertEqual(bible["doctor_01"]["name"], "Ana")
        self.assertEqual(bible["doctor_01"]["variant"], "woman")
        self.assertEqual(bible["dog_01"]["name"], "Toby")
        # escenarios naturales: sabana con el elefante, fondo marino con el pulpo
        by = {scene_text(plan, s): s for s in plan["scenes"]}
        first = plan["scenes"][0]
        self.assertEqual(first["background_id"], "savanna_01")
        octo = next(s for s in plan["scenes"] if any(c["id"] == "octopus_01" for c in s["characters"]))
        self.assertEqual(octo["background_id"], "ocean_under_01")
        self.assertTrue(any(o["type"] == "counter_badge" for o in octo["overlays"]))
        # «el elefante corre» → corre el elefante (no el león que se nombró antes)
        lion_scene = next(s for t, s in by.items() if "ruge" in t)
        acts = {c["id"]: c["action"] for c in lion_scene["characters"]}
        self.assertEqual(acts.get("elephant_01"), "run")
        # la QA reconoce la narración del guion
        self.assertEqual(proj["audio"]["script_text"].split(), self.SCRIPT.split())

    def test_render_does_not_redo_narration(self):
        proj = self.run_script("Una paloma camina por la plaza.")
        d = pipeline.pdir(proj["id"])
        ed = os.path.join(d, "transcript", "transcript_edited.json")
        with open(os.path.join(d, "transcript", "transcript_raw.json"), encoding="utf-8") as f:
            tr = ASR.apply_text_edit(json.load(f), word_edits={"w0002": "PALOMA"})
        wr(ed, json.dumps(tr))
        before = proj["audio"]["voice_sig"]
        proj = pipeline.load(proj["id"])
        AM.stage_narration(proj, Ctx(), lambda *a: None, lambda *a, **k: None, d)
        self.assertEqual(proj["audio"]["voice_sig"], before)
        self.assertTrue(os.path.exists(ed), "la corrección de subtítulos no debe perderse al renderizar")


# ------------------------------------------------------------------ catálogo y detección
class DetectionTests(unittest.TestCase):
    def test_species_catalog_complete(self):
        lib = VA.library()
        sp = [a for a, e in lib["characters"].items() if a.startswith("sp_")]
        self.assertGreaterEqual(len(sp), 95)
        bgs = set(lib["backgrounds"])
        for a in sp:
            e = lib["characters"][a]
            self.assertIn(e["builder"], VA.RIG_PARTS, a)
            self.assertIn(e["env"], bgs, a)
            self.assertGreaterEqual(len(e["parts"]), 5, a)
            self.assertTrue(e["keywords"], a)

    def test_phrases_and_ambiguity(self):
        m = lambda t: [a for a, _ in VA.match_text(t)["characters"]]  # noqa: E731
        self.assertEqual(m("un oso polar"), ["sp_polar_bear_v1"])
        self.assertEqual(m("la serpiente de cascabel"), ["sp_rattlesnake_v1"])
        self.assertEqual(m("el pavo real abre la cola"), ["sp_peacock_v1"])
        self.assertEqual(m("Se llama Pedro y se rompió una pata"), [])  # «llama» y «pata» no son animales aquí
        self.assertIn("sp_dog_v1", m("los perros ladran"))

    def test_roles_gender_names(self):
        plan = plan_text("La doctora García examina a un perro. El perro se llama Toby. Después llega el bombero. "
                         "La reina saluda al bombero. Pedro corre por el parque con su abuela.")
        b = {c["id"]: c for c in plan["visual_bible"]["characters"]}
        self.assertEqual((b["doctor_01"]["variant"], b["doctor_01"]["name"]), ("woman", "García"))
        self.assertTrue(b["doctor_01"]["look"]["coat"])
        self.assertEqual(b["queen_01"]["look"]["hat"], "crown")
        self.assertEqual(b["firefighter_01"]["look"]["hat"], "fire")
        self.assertEqual(b["grandma_01"]["variant"], "elder")
        self.assertEqual(b["dog_01"]["name"], "Toby")
        pedro = next(c for c in b.values() if c.get("name") == "Pedro")
        self.assertNotEqual(pedro["id"], "firefighter_01", "un nombre no se une a un personaje de OTRA frase")
        # el aspecto del rol llega al motor
        d = VC.engine_data(plan)
        looks = {c["id"]: c.get("colors", {}) for s in d["scenes"] for c in s["characters"]}
        self.assertEqual(looks["queen_01"].get("hat"), "crown")

    def test_animal_named_and_sleep(self):
        plan = plan_text("Luna, la gata, duerme en la casa. Un ratón camina despacio. Luna lo mira y salta.")
        b = {c["id"]: c for c in plan["visual_bible"]["characters"]}
        self.assertEqual(b["cat_01"]["name"], "Luna")
        self.assertNotIn("sleeper_01", b, "«la gata duerme» no crea al durmiente humano")
        self.assertEqual(plan["scenes"][0]["background_id"], "home_living_01", "«Luna» (nombre) no es la luna")
        last = plan["scenes"][-1]
        self.assertIn("cat_01", [c["id"] for c in last["characters"]])
        # sin otro personaje, «duermes» sí es el durmiente (historias existentes intactas)
        p2 = plan_text("Duermes con la boca abierta. Una araña baja por su hilo.")
        self.assertIn("sleeper_01", [c["id"] for c in p2["visual_bible"]["characters"]])

    def test_find_names(self):
        w = "Pedro corre. Ella mira. Luna, la perra, salta. Hoy llueve. Dijo Marta que sí.".split()
        names = [n for _, n in CAST.find_names(w)]
        self.assertIn("Pedro", names)
        self.assertIn("Luna", names)
        self.assertIn("Marta", names)
        for x in ("Ella", "Hoy", "Dijo"):
            self.assertNotIn(x, names)


# ------------------------------------------------------------------ diseño por LLM (validado)
class CreatureDesignTests(unittest.TestCase):
    def test_validate_cast(self):
        lib = VA.library()
        items = [{"word": "quetzal", "kind": "animal", "rig": "bird", "like": "parrot",
                  "params": {"body": "#1fa86a", "tailL": 140, "legL": 99999, "evil": "<script>", "beak": "laser", "tail": "long"}, "habitat": "air"},
                 {"word": "dragón", "kind": "animal", "rig": "quadruped"},             # no está en el texto
                 {"word": "ornitorrinco", "kind": "animal", "rig": "spaceship"},        # rig inexistente
                 {"word": "alcaldesa", "kind": "person", "variant": "woman", "look": {"shirt": "#2a5ab8", "hat": "crown", "x": "javascript:"}}]
        out = CD.validate_cast(items, "Un quetzal vuela. El ornitorrinco nada. La alcaldesa saluda.", lib, set())
        ids = [e["id"] for e in out]
        self.assertEqual(ids, ["quetzal_01", "alcaldesa_01"])
        q = out[0]["params"]
        self.assertEqual(q["legL"], 230)                 # limitado al rango dibujable
        self.assertNotIn("evil", q)
        self.assertEqual(q["tail"], "long")
        self.assertNotEqual(q.get("beak"), "laser")      # enum inválido descartado (queda el del loro)
        self.assertTrue(q["hover"])
        self.assertEqual(out[0]["asset_id"], "creature_bird_v1")
        self.assertEqual(out[1]["look"], {"shirt": "#2a5ab8", "hat": "crown"})

    def test_plan_uses_designed_characters(self):
        fake = {"characters": [{"word": "quetzal", "kind": "animal", "rig": "bird", "like": "parrot", "params": {"body": "#1fa86a"}, "habitat": "air"}]}

        def gen(prompt, **k):
            if "diseñador de personajes" in prompt:
                return json.dumps(fake)
            raise RuntimeError("sin storyboard por LLM")

        with patch.object(llm, "generate", gen):
            plan = plan_text("Un quetzal vuela sobre la selva tropical.", use_llm=True)
        TL.validate_plan(plan, VA.all_ids())
        s = plan["scenes"][0]
        self.assertEqual([c["id"] for c in s["characters"]], ["quetzal_01"])
        self.assertEqual(s["background_id"], "jungle_01")
        d = VC.engine_data(plan)
        self.assertEqual(d["scenes"][0]["characters"][0]["rig"], "bird")
        self.assertEqual(d["scenes"][0]["characters"][0]["params"]["body"], "#1fa86a")


# ------------------------------------------------------------------ motor: criaturas deterministas
class CreatureEngineTests(unittest.TestCase):
    def test_creatures_deterministic_and_moving(self):
        lib = VA.library()
        sel = ["sp_dog_v1", "sp_elephant_v1", "sp_owl_v1", "sp_shark_v1", "sp_octopus_v1", "sp_bee_v1", "sp_snake_v1", "sp_kangaroo_v1"]
        scenes = []
        for i, aid in enumerate(sel):
            e = lib["characters"][aid]
            scenes.append({"id": f"s{i}", "start_frame": i * 60, "end_frame": i * 60 + 60, "start_s": i * 2, "end_s": i * 2 + 2,
                           "background": {"asset_id": e["env"]}, "characters": [{"id": aid, "rig": e["builder"], "action": "walk", "params": e["params"]}],
                           "props": [], "beats": [{"at_s": i * 2 + 0.5, "action": "look_left", "target": aid}], "camera": {"shot": "wide", "movement": "static"},
                           "overlays": [], "transition_in": "cut", "punch_s": []})
        data = {"W": 1080, "H": 1920, "fps": 30, "seed": 7, "scenes": scenes, "captions": {"enabled": False, "groups": []}}
        with tempfile.TemporaryDirectory() as d:
            ej, dp, js = (os.path.join(d, x) for x in ("e.js", "d.json", "t.js"))
            wr(ej, engine_js())
            wr(dp, json.dumps(data))
            wr(js, "global.window = global;\nconst fs = require('fs');\neval(fs.readFileSync(process.argv[2], 'utf8'));\n"
                                "const data = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));\n"
                                "const out = data.scenes.map((s) => { const t = s.start_s + 1.0; const a = VSV.stateAt(data, t), b = VSV.stateAt(JSON.parse(JSON.stringify(data)), t), c = VSV.stateAt(data, t + 0.2);"
                                " return {same: JSON.stringify(a) === JSON.stringify(b), moves: JSON.stringify(a.actors[0].pose) !== JSON.stringify(c.actors[0].pose), x: a.actors[0].x, s: a.actors[0].s}; });\n"
                                "console.log(JSON.stringify(out));")
            r = subprocess.run(["node", js, ej, dp], capture_output=True, text=True, timeout=120)
            self.assertEqual(r.returncode, 0, r.stderr[-1500:])
            out = json.loads(r.stdout)
        for aid, o in zip(sel, out):
            self.assertTrue(o["same"], aid)       # determinista: mismo t → mismo estado
            self.assertTrue(o["moves"], aid)      # animado
            self.assertGreater(o["s"], 0, aid)


# ------------------------------------------------------------------ E2E: render real
@unittest.skipUnless(os.environ.get("VS_E2E") and HAS_FF, "render real: VS_E2E=1")
class ScriptE2ETests(Env):
    def test_render_script_with_animals(self):
        proj = self.run_script("Un perro corre por el parque. Una abeja vuela entre las flores. Un tiburón nada en el mar.",
                               stages=pipeline.stage_order(pipeline.create({"script": "x"})))
        self.assertEqual(proj["qa"]["status"], "PASS", json.dumps(proj["qa"]["checks"], ensure_ascii=False)[:2000])
        names = {c["check"]: c["status"] for c in proj["qa"]["checks"]}
        self.assertEqual(names["narración = guion"], "PASS")
        self.assertEqual(names["zonas seguras (textos dentro del cuadro)"], "PASS")


if __name__ == "__main__":
    unittest.main()
