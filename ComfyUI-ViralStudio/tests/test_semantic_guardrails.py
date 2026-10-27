"""Pruebas de regresión de fallos vistos en los videos de prueba de 26-10-2026."""
import unittest
from vs import audio_storyboard as SB
from vs import semantic_guardrails as SG
from vs import vector_compiler as VC
from vs import visual_assets as VA


def make_plan(txt):
    toks = txt.split()
    words = [dict(id=f"w{i:04d}", text=t, start_s=round(i * .36, 3), end_s=round((i+1)*.36, 3))
             for i, t in enumerate(toks)]
    return SB.plan_from_transcript(dict(text=txt, words=words, language="es"),
                                   dict(duration_s=len(toks)*.36),
                                   dict(format="vertical", fps=30, auto_storyboard=False),
                                   log=lambda *_: None, use_llm=False)


class Cases(unittest.TestCase):
    def test_cat_is_white_and_stripe_free(self):
        p = make_plan("Toby era un perro marrón. Debajo del árbol había una gata blanca. La gata se llamaba Luna.")
        cat = next(c for c in p["visual_bible"]["characters"] if c["asset_id"] == "cat_rig_v1")
        self.assertEqual(cat["params"]["body"], "#f4f4f1")
        self.assertEqual(cat["params"]["pattern"], "none")
        self.assertEqual(cat["aliases"], ["luna"])
        sc = next(s for s in p["scenes"] if "gata blanca" in s["narration_exact"])
        engine = VC.engine_scene(p, sc)
        ec = next(c for c in engine["characters"] if c["rig"] == "cat")
        self.assertEqual(ec["colors"]["body"], "#f4f4f1")
        self.assertEqual(ec["colors"]["pattern"], "none")

    def test_night_does_not_turn_into_sunny_park(self):
        p = make_plan("A las tres de la mañana Toby, un perro, estaba en casa. Corrió hacia el jardín. Debajo de un árbol había una gata blanca.")
        bg = {x["id"]: x["asset_id"] for x in p["visual_bible"]["backgrounds"]}
        self.assertTrue(all(bg[s["background_id"]] not in ("park_day_v1", "forest_day_v1") for s in p["scenes"]))

    def test_dinosaur_not_drawn_before_their_arrival(self):
        p = make_plan("Los tiburones son más antiguos que los árboles. Todavía faltaban millones de años para que aparecieran los dinosaurios. Los tiburones siguieron evolucionando.")
        cmap = {c["id"]: c["asset_id"] for c in p["visual_bible"]["characters"]}
        self.assertTrue(all("dinosaur" not in cmap[c["id"]] for s in p["scenes"] for c in s["characters"]))
        bg = {x["id"]: x["asset_id"] for x in p["visual_bible"]["backgrounds"]}
        self.assertTrue(all(bg[s["background_id"]] != "park_day_v1" for s in p["scenes"] if "tiburones" in s["narration_exact"]))

    def test_no_friend_or_sleeper_human_in_pet_story(self):
        p = make_plan("Toby era un perro. Salió de su cama y se levantó. Al final encontró a su nueva mejor amiga, la gata Luna.")
        people = [c for c in p["visual_bible"]["characters"] if c["asset_id"] in ("person_rig_v1", "sleeper_rig_v1")]
        self.assertFalse(people, people)

    def test_earth_is_not_a_human_named_tierra(self):
        p = make_plan("La Tierra cambió. Los tiburones nadaban en el océano hace millones de años.")
        self.assertFalse(any(c.get("name") == "Tierra" for c in p["visual_bible"]["characters"]))

    def test_shark_framing_and_motion(self):
        p = make_plan("Hace cuatrocientos millones de años, los tiburones nadaban en los océanos.")
        e = VC.engine_scene(p, next(s for s in p["scenes"] if s["characters"]))
        shark = next(c for c in e["characters"] if c["rig"] == "fish")
        self.assertEqual(shark["action"], "swim")
        self.assertIn(e["camera"]["shot"], ("wide", "medium"))
        self.assertFalse(any(o["type"] == "counter_badge" for s in p["scenes"] for o in s["overlays"]))

    def test_complex_interaction_is_not_marked_verified(self):
        p = make_plan("Ana abrió la puerta. Ana tomó a Luna, una gata blanca, en sus brazos.")
        self.assertTrue(any(x["severity"] == "REVIEW" for x in p["semantic_qa"]))


if __name__ == "__main__":
    unittest.main()
