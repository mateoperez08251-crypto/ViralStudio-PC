"""Regression: un render semánticamente malo debe fallar, no exportarse."""
import json
import os
import subprocess
import tempfile
import unittest
from tests.test_script_vector import plan_text
from vs import direction_quality as DQ
from vs import vector_compiler as VC
from vs.config import engine_js
from vs.errors import VSError

class QualityGateTests(unittest.TestCase):
    def test_toby_door_cat_contact_cannot_claim_success(self):
        p = plan_text("Toby el perro marrón caminaba por el pasillo oscuro. Ana abrió la puerta "
                      "y tomó a la gata blanca Luna en sus brazos. Toby y Luna se acostaron juntos.")
        issues = DQ.inspect(p)
        self.assertTrue(any(i["code"] == "UNSUPPORTED_PHYSICAL_ACTION" for i in issues))
        self.assertTrue(any(i["code"] == "STATIC_CHARACTER_SHOT" for i in issues))
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(VSError):
                DQ.enforce(p, d)
            self.assertTrue(os.path.isfile(os.path.join(d, "plan", "quality_gate.json")))
            self.assertEqual(DQ.enforce(p, d, strict=False)["status"], "FAIL")

    def test_sharks_reused_unchanged_are_not_professional(self):
        p = plan_text("Los tiburones nadaban antes de los árboles. Millones de años después "
                      "aparecieron dinosaurios. Los tiburones siguieron evolucionando durante extinciones.")
        codes = [i["code"] for i in DQ.inspect(p)]
        self.assertIn("UNSUPPORTED_PHYSICAL_ACTION", codes)
        self.assertTrue("REPEATED_VISUAL" in codes or "REPETITIVE_ACTION" in codes)

    def test_camera_does_not_count_as_character_motion(self):
        p = plan_text("El perro estaba frente a la casa y no se movía.")
        s = p["scenes"][0]
        s["characters"] = [{"id": p["visual_bible"]["characters"][0]["id"], "action": "idle"}]
        s["camera"] = {"shot": "medium", "movement": "push_in"}
        codes = [i["code"] for i in DQ.inspect(p)]
        self.assertIn("CAMERA_ONLY", codes)
        self.assertIn("STATIC_CHARACTER_SHOT", codes)

    def test_action_not_inherited_from_previous_sentence(self):
        p = plan_text("Toby el perro camina por el parque. Después Toby se queda quieto y mira una nube.")
        actions = [c["action"] for sc in p["scenes"] for c in sc["characters"] if c["id"] == "dog_01"]
        self.assertIn("walk", actions)
        self.assertIn("idle", actions)

    def test_choreography_moves_then_stops_without_snap_back(self):
        data = VC.engine_data(plan_text("El perro camina por el parque y se detiene."), captions=False)
        sc = data["scenes"][0]
        self.assertIn("walk", {b["action"] for b in sc["beats"]})
        # Una composición aislada con acción explícita a 0.5s y duración 1s:
        sc["start_frame"], sc["end_frame"] = 0, 120
        sc["beats"] = [{"at_s": 0.5, "action": "walk", "target": sc["characters"][0]["id"], "dur": 1.0}]
        sc["characters"][0]["action"] = "walk"
        data["scenes"] = [sc]
        with tempfile.TemporaryDirectory() as d:
            eng = os.path.join(d, "engine.js")
            js = os.path.join(d, "test.js")
            dp = os.path.join(d, "data.json")
            with open(eng, "w") as f: f.write(engine_js())
            with open(dp, "w") as f: json.dump(data, f)
            with open(js, "w") as f:
                f.write("global.window=global;const fs=require('fs');eval(fs.readFileSync(process.argv[2],'utf8'));"
                        "let d=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));"
                        "console.log(JSON.stringify([0.25,0.75,1.7,2.4,3.3].map(t=>{"
                        "let a=VSV.stateAt(d,t).actors[0];return {x:a.x,action:a.action,moving:a.moving};})));\n")
            res = subprocess.run(["node", js, eng, dp], capture_output=True, text=True, timeout=20)
            self.assertEqual(res.returncode, 0, res.stderr)
            st = json.loads(res.stdout)
            self.assertLess(st[0]["x"], st[1]["x"])
            self.assertLess(st[1]["x"], st[2]["x"])
            self.assertAlmostEqual(st[2]["x"], st[3]["x"], delta=0.1)
            self.assertAlmostEqual(st[3]["x"], st[4]["x"], delta=0.1)
            self.assertEqual(st[0]["action"], "idle")
            self.assertEqual(st[1]["action"], "walk")
            self.assertEqual(st[2]["action"], "idle")
            self.assertEqual(st[3]["action"], "idle")
            self.assertFalse(st[3]["moving"])

if __name__ == "__main__":
    unittest.main()
