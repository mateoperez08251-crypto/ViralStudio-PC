"""ViralStudio Pro 1.2 — salvaguardas verificables de continuidad semántica.

No pretende reconocer la imagen final: valida hechos del guion, roles, color,
negación, época, duración y tipos de movimiento ANTES del render. Las acciones
no dibujables quedan en QA como REVIEW en lugar de inventar que sucedieron.
"""
import re
from .textutil import norm_word

COLOR_HEX = {"blanco":"#f4f4f1", "blanca":"#f4f4f1", "blancos":"#f4f4f1", "blancas":"#f4f4f1",
             "gris":"#8b9095", "grises":"#8b9095", "negro":"#292b30", "negra":"#292b30",
             "marron":"#9b6034", "cafe":"#9b6034", "pardo":"#9b6034", "dorada":"#d6a255",
             "rojo":"#b64b42", "roja":"#b64b42"}
ANIMALS = {"gata","gato","gatita","gatito","perro","perra","perrito","perrita","tiburon","tiburones","dinosaurio","dinosaurios"}
NEGATION = re.compile(r"\b(?:no\s+habia|no\s+existian|sin\s+|todavia\s+no|aun\s+no|antes\s+de\s+(?:que\s+)?(?:aparecieran|existieran)|faltaban\s+.*?\s+para\s+que\s+aparecieran)\b")
SCIENTIFIC = {"millones", "prehistoric", "prehistoria", "dinosaurios", "extinciones", "evolucion", "antepasados"}
STORY_ACTIONS = {"abrio", "abrió", "abrir", "encendio", "encendió", "tomo", "tomó", "abrazó", "abrazo", "recogió", "recogio", "acostó", "acosto", "acaricio", "acarició", "llevó", "llevo", "golpes", "golpearon", "temblando"}


def words(txt):
    return [norm_word(x) for x in (txt or "").split() if norm_word(x)]


def default_motion(c, lib):
    """Evitar que los animales sean diapositivas congeladas por falta de verbo."""
    aid = c.get("asset_id") or ""
    rig = (lib.get("characters", {}).get(aid) or {}).get("builder")
    if rig in ("fish", "octopus"):
        return "swim"
    if rig == "bird" and c.get("params", {}).get("hover"):
        return "fly"
    return "idle"


def attach_explicit_looks(bible, text, lib):
    """Color descrito + identidad = atributo PERSISTENTE, no azar de un frame.

    Exige un sustantivo animal junto al color (hasta 5 palabras en la misma
    oración) o un nombre ya vinculado al animal. Así «luz blanca» no pinta al gato.
    """
    sentences = re.split(r"(?<=[.!?])\s+", text or "")
    animals = [c for c in bible.get("characters", []) if
               (lib["characters"].get(c["asset_id"], {}).get("builder") in ("cat", "quadruped", "fish", "bird", "snake", "insect"))]
    for sent in sentences:
        toks = words(sent)
        for i, t in enumerate(toks):
            if t not in COLOR_HEX:
                continue
            nearest = []
            for j, n in enumerate(toks):
                if n in ANIMALS and abs(i-j) <= 5:
                    nearest.append((abs(i-j), n))
            if not nearest:
                continue
            token = sorted(nearest)[0][1]
            for c in animals:
                aid = c["asset_id"]
                e = lib["characters"].get(aid, {})
                species = e.get("species", "")
                cat = token.startswith("gat") and (e.get("builder") == "cat" or species.startswith("cat"))
                dog = token.startswith("perr") and species == "dog"
                shark = token.startswith("tiburon") and species == "shark"
                dino = token.startswith("dinosaur") and species == "dinosaur"
                if cat or dog or shark or dino:
                    c.setdefault("params", {})["body"] = COLOR_HEX[t]
                    if cat:
                        c["params"].update(pattern="none" if t.startswith("blanc") else c["params"].get("pattern", "stripes"))
                    c["appearance_source"] = "literal: " + token + " " + t
                    break
    return bible


def global_context(full_text):
    toks = set(words(full_text))
    txt = " ".join(words(full_text))
    scientific = bool(toks & SCIENTIFIC and toks & {"tiburones", "tiburon"})
    night = bool(re.search(r"(?:tres|3)\s+de\s+la\s+manana|(?:madrugada|media\s+noche|noche|medianoche)", txt))
    return dict(scientific=scientific, night=night,
                prehistoric_ocean=scientific and bool(re.search(r"(?:anteriores|antiguos|antes)\s+(?:de\s+|que\s+|a\s+)*(?:los\s+)?arboles", txt)))


def negative_entities(text):
    t = " ".join(words(text))
    out = set()
    # Negaciones sobre ausencia histórica; excluir representaciones literales.
    if re.search(r"(?:sin|no\s+(?:habia|existian)|antes\s+de\s+que\s+(?:aparecieran|existieran)).{0,55}arbol", t):
        out.add("tree")
    if re.search(r"(?:faltaban|antes).{0,90}(?:aparecieran|aparecer|existieran).{0,30}dinosaur", t):
        out.add("dinosaur")
    if "todavia no" in t and "dinosaur" in t:
        out.add("dinosaur")
    return out


def is_absent_character(c, neg):
    return bool(neg and (("dinosaur" in neg and "dinosaur" in c.get("asset_id", "")) or
                         ("tree" in neg and "tree" in c.get("asset_id", ""))))


def stable_actions(ch, bible, lib):
    lookup = {c["id"]: c for c in bible["characters"]}
    for c in ch.get("characters", []):
        b = lookup.get(c.get("id"), {})
        if c.get("action", "idle") == "idle":
            c["action"] = default_motion(b, lib)
    return ch


def enforce_choices(choices, units, bible, lib, full_text):
    """Se aplica también al plan de LLM: no basta que su JSON tenga enums válidos."""
    ctx = global_context(full_text)
    cmap = {c["id"]: c for c in bible["characters"]}
    bgmap = {b["asset_id"]: b["id"] for b in bible["backgrounds"]}
    ocean = bgmap.get("ocean_under_v1")
    nocturnal = bgmap.get("night_meadow_v1")
    bedroom = bgmap.get("bedroom_night_v1")
    prev = None
    issues = []
    for i, ch in enumerate(choices):
        start, end = ch["units"]
        segment = " ".join(u["text"] for u in units[start:end+1])
        t = " ".join(words(segment))
        neg = negative_entities(segment)
        before = len(ch.get("characters", []))
        ch["characters"] = [c for c in ch.get("characters", []) if not is_absent_character(cmap.get(c.get("id"), {}), neg)]
        if len(ch["characters"]) != before:
            issues.append(f"escena {i+1}: se retiró un animal descrito como ausente o aún no existente")
        # Los océanos prehistóricos no son campos soleados ni bosques contemporáneos.
        ids = {cmap[c["id"]]["asset_id"] for c in ch.get("characters", []) if c.get("id") in cmap}
        if ctx["scientific"]:
            # «faltaban millones de años para que aparecieran» no es una invitación
            # a mantener al dinosaurio en la toma siguiente por copresencia residual.
            if any("dinosaur" in x for x in ids) and not any(q in t for q in
                    ("era de dinosaurios", "epoca de dinosaurios", "durante los dinosaurios", "junto a los dinosaurios")):
                ch["characters"] = [c for c in ch["characters"] if "dinosaur" not in cmap.get(c["id"], {}).get("asset_id", "")]
                ids = {cmap[c["id"]]["asset_id"] for c in ch["characters"]}
                issues.append(f"escena {i+1}: excluido dinosaurio por época no confirmada")
            if any("shark" in x for x in ids) and any("person_rig_v1" == x for x in ids):
                # No mostrar una persona común debajo del agua junto a un tiburón prehistórico.
                ch["characters"] = [c for c in ch["characters"] if cmap.get(c["id"], {}).get("asset_id") != "person_rig_v1"]
                ids = {cmap[c["id"]]["asset_id"] for c in ch["characters"]}
                issues.append(f"escena {i+1}: eliminado humano incompatible con escena submarina")
            if any("shark" in x for x in ids) and ocean:
                ch["background"] = ocean
            if ctx["prehistoric_ocean"] and any(x in t for x in ("antes", "400", "cuatrocientos", "arboles")) and ocean:
                ch["background"] = ocean
                # La palabra «árboles» en «antes de los árboles» no autoriza mostrar árboles.
                ch["props"] = [p for p in ch.get("props", []) if "tree" not in p.get("id", "")]
            elif "person_rig_v1" in ids and ch["background"] == ocean and bgmap.get("park_day_v1"):
                ch["background"] = bgmap["park_day_v1"]
        if ctx["night"] and not ctx["scientific"]:
            # Estado temporal persistente (hasta mención explícita de amanecer/día).
            if not any(x in t for x in ("amanecer", "salio el sol", "dia siguiente")):
                if (any(w in t for w in ("tres de la manana", "3 de la manana", "madrugada")) and
                        any(w in t for w in ("puerta", "casa", "dormian", "cama")) and bedroom):
                    ch["background"] = bedroom
                elif any(w in t for w in ("jardin", "arbol", "afuera", "exterior", "hojas", "campo")) and nocturnal:
                    ch["background"] = nocturnal
                elif any(w in t for w in ("cama", "dormir", "durmi", "pasillo", "habitacion", "dormitorio", "puerta", "luz")) and bedroom:
                    ch["background"] = bedroom
                elif ch.get("background") == bgmap.get("home_living_v1") and bedroom:
                    ch["background"] = bedroom
                elif ch.get("background") in (bgmap.get("park_day_v1"), bgmap.get("forest_day_v1")) and nocturnal:
                    ch["background"] = nocturnal
        # Evitar caras humanas flotando y secundarios derivados de una palabra genérica.
        if ctx["scientific"] and any(x in t for x in ("humanos", "primeros humanos", "cuando los primeros")):
            # Solo humanos + referencia contextual del tiburón, no añadir personas aleatorias.
            pass
        stable_actions(ch, bible, lib)
        # Los movimientos se justifican por acciones; en ausencia de acción física real, cámara contenida.
        cam = ch.setdefault("camera", {"shot":"wide", "movement":"static"})
        if cam.get("shot") == "closeup" and (len(ch["characters"]) > 1 or any("shark" in x for x in ids)):
            cam["shot"] = "medium"
            cam.pop("focus", None)
        if cam.get("movement") in ("push_in", "orbit") and not ch.get("beats"):
            cam["movement"] = "slow_push" if ch["characters"] else "static"
        if ch.get("transition") in ("zoom", "whip"):
            ch["transition"] = "cut"
        # Los contadores automáticos no son una visualización segura de fechas históricas.
        approved_ov = []
        for ov in ch.get("overlays", []):
            if ov.get("type") in ("counter_badge", "neon_number", "countdown") and (ctx["scientific"] or ctx["night"]):
                # Mostrar la CANTIDAD NARRADA como palabras fijas, no un contador
                # que salta de 998.628 a 1.000.000 sin sentido histórico.
                word_ids = [w for u in units[start:end+1] for w in u.get("word_ids", [])]
                if ov.get("word") in word_ids:
                    pos = word_ids.index(ov["word"])
                    approved_ov.append({"type":"kinetic_title", "word":ov["word"],
                                        "words":word_ids[pos:pos+4]})
                    issues.append(f"escena {i+1}: contador sustituido por rótulo narrado literalmente")
                else:
                    issues.append(f"escena {i+1}: contador automático deshabilitado por falta de anclaje")
                continue
            if ov.get("type") == "ripples" and not any(k in t for k in ("sonido", "golpes", "ruido", "ladra", "ronca", "vibra")):
                continue
            approved_ov.append(ov)
        ch["overlays"] = approved_ov
        if ch.get("template") in ("counter", "countdown") and not approved_ov:
            ch["template"] = "character_scene" if ch["characters"] else "kinetic"
        prev = ch
    return issues


def storyboard_issues(plan):
    """Auditoría de hechos inferibles sin visión computerizada; no finge comprobar píxeles."""
    issues = []
    bible = {c["id"]: c for c in plan.get("visual_bible", {}).get("characters", [])}
    backgrounds = {b["id"]: b["asset_id"] for b in plan.get("visual_bible", {}).get("backgrounds", [])}
    ctx = global_context(plan.get("transcript", {}).get("text", ""))
    for s in plan.get("scenes", []):
        t = " ".join(words(s.get("narration_exact", "")))
        chars = [bible.get(c["id"], {}) for c in s.get("characters", [])]
        env = backgrounds.get(s.get("background_id"), "")
        if ctx["night"] and not ctx["scientific"] and env in ("park_day_v1", "forest_day_v1", "sky_v1"):
            issues.append(dict(scene=s["id"], severity="FAIL", reason="Noche narrada con exterior diurno"))
        if any(c.get("asset_id") == "cat_rig_v1" for c in chars) and "blanca" in t:
            if not any(c.get("params", {}).get("body") == COLOR_HEX["blanca"] for c in chars):
                issues.append(dict(scene=s["id"], severity="FAIL", reason="Gata blanca sin color fijado"))
        if any(o.get("type") in ("counter_badge", "neon_number") for o in s.get("overlays", [])) and ctx["scientific"]:
            issues.append(dict(scene=s["id"], severity="FAIL", reason="Contador científico sin magnitud semántica comprobada"))
        if "dinosaur" in negative_entities(t) and any("dinosaur" in c.get("asset_id", "") for c in chars):
            issues.append(dict(scene=s["id"], severity="FAIL", reason="Se dibuja un dinosaurio cuando la narración dice que aún no existía"))
        if ctx["scientific"] and any(x in t for x in ("evolucion", "evolucionando", "continentes", "extinciones", "millones de anos")):
            issues.append(dict(scene=s["id"], severity="REVIEW", reason="Evolución/cambio geológico: validar visualmente la época; rigs genéricos no generan metamorfosis históricas"))
        if any(x in t for x in ("abrio", "puerta", "tomo", "brazos", "acosto", "junto")) and plan.get("input_mode") == "audio":
            # Los rigs tienen animación limitada; exigir comprobación manual de las interacciones.
            issues.append(dict(scene=s["id"], severity="REVIEW", reason="Acción con objeto/contacto: confirmar visualmente; el motor 2D no la garantiza"))
    return issues
