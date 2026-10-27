"""Fidelidad narración → imagen (Guía Maestra V2 §7).

Regla: lo que se ve tiene que estar justificado por lo que se narra.
  · mapa       solo si la narración (o el capítulo) nombra un lugar
  · año        solo si la narración contiene ese año
  · cifra      solo si la narración contiene esa cantidad (en número o en palabras)
  · criatura   (la Muerte, monstruo, fantasma) solo con muerte, miedo o lo sobrenatural
  · personajes solo los del reparto que la escena menciona o el protagonista implícito
Cada escena recibe "visual_justification"; lo injustificado se degrada a un plano
neutro y se anota en el informe de fidelidad.
"""
import re
import unicodedata

from .textutil import strip_emphasis

NUM_WORDS = {
    "cero": 0, "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9,
    "diez": 10, "once": 11, "doce": 12, "trece": 13, "catorce": 14, "quince": 15, "veinte": 20, "treinta": 30, "cuarenta": 40,
    "cincuenta": 50, "sesenta": 60, "setenta": 70, "ochenta": 80, "noventa": 90, "cien": 100, "ciento": 100, "doscientos": 200,
    "trescientos": 300, "cuatrocientos": 400, "quinientos": 500, "seiscientos": 600, "setecientos": 700, "ochocientos": 800,
    "novecientos": 900, "mil": 1000, "millon": 10**6, "millones": 10**6, "billon": 10**12,
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "ten": 10, "hundred": 100, "thousand": 1000, "million": 10**6, "billion": 10**9,
}
DEATH = ("muert", "morir", "muri", "asesin", "mata", "cadaver", "tumba", "fantasm", "espiritu", "demonio", "monstruo", "terror",
         "miedo", "pesadilla", "sombra", "diablo", "maldic", "death", "die", "kill", "ghost", "monster", "fear", "horror", "peligro",
         "amenaza", "verdugo", "ejecuc", "guerra", "nazi", "veneno", "sangre")


def _n(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def spoken_numbers(text):
    """Cantidades presentes en el texto: '2.500', '2500', 'dos mil quinientos' → {2500}."""
    t = _n(strip_emphasis(text))
    found = set()
    for m in re.finditer(r"\d[\d.,]*", t):
        raw = m.group(0).rstrip(".,")
        digits = re.sub(r"[.,](?=\d{3}\b)", "", raw).replace(",", ".")
        try:
            found.add(float(digits))
        except ValueError:
            pass
    # Magnitud que sigue a una cifra escrita: «400 millones» = 400.000.000,
    # no el contador incorrecto «1.000.000» del parser previo.
    for m in re.finditer(r"(\d[\d.,]*)\s+(mil|millones|millon|billones|billon|million|billion)\b", t):
        raw, mag = m.groups()
        token = re.sub(r"[.,](?=\d{3}\b)", "", raw).replace(",", ".")
        mul = NUM_WORDS.get(mag)
        if mul:
            try:
                found.add(float(token) * mul)
            except ValueError:
                pass
    # números en palabras (español/inglés, suficiente para cifras de guion)
    total, cur, any_w = 0, 0, False
    for w in re.findall(r"[a-zñ]+", t):
        if w == "y" and any_w:
            continue
        v = NUM_WORDS.get(w)
        if v is None:
            if any_w:
                found.add(float(total + cur))
            total, cur, any_w = 0, 0, False
            continue
        any_w = True
        if v >= 1000:
            cur = (cur or 1) * v
            total += cur
            cur = 0
        elif v == 100 and cur:
            cur *= 100
        else:
            cur += v
    if any_w:
        found.add(float(total + cur))
    return found


_GEO = {}


def country_names(country):
    """Nombres (inglés y español, normalizados) de un país del mapa Natural Earth."""
    if not country:
        return []
    if not _GEO:
        import json
        import os

        from .config import ENGINE_DIR

        try:
            with open(os.path.join(ENGINE_DIR, "05_geo.js"), encoding="utf-8") as fh:
                js = fh.read()
            data = json.loads(js[js.index("VS.GEO=") + 7: js.rindex(";})")])
            for c in data:
                names = {_n(c["n"]), _n(c["es"]), _n(c["iso"])}
                for k in names:
                    _GEO[k] = [x for x in names if len(x) > 3]
        except Exception:
            _GEO["_"] = []
    c = _n(country)
    return _GEO.get(c) or [c]


def _num_value(x):
    try:
        return float(re.sub(r"[^\d.]", "", str(x).replace(".", "").replace(",", ".")) or "nan")
    except ValueError:
        return None


def check_scene(sc, cast, chapter_text=""):
    """Devuelve (escena_corregida, problemas[])."""
    issues = []
    narr = sc.get("narration") or ""
    t = _n(strip_emphasis(narr))
    ctx = _n(chapter_text)
    shot = sc.get("shot", "scene")
    why = []

    if shot == "map":
        place = _n(sc.get("place") or sc.get("label") or "")
        named = [p for p in re.split(r"[\s,·-]+", place) if len(p) > 3]
        cnames = country_names(sc.get("country"))
        hit = any(p in t for p in named) or any(c in t for c in cnames)
        if not hit:
            issues.append(f"mapa sin lugar en la narración ({sc.get('place') or sc.get('country')}) → plano de escena")
            sc["shot"] = "scene"
        else:
            why.append(f"la narración sitúa la acción en {sc.get('place') or sc.get('label') or sc.get('country')}")

    elif shot == "year":
        y = str(sc.get("year", ""))
        if not y or y not in t:
            issues.append(f"año {y} no aparece en la narración → plano de escena")
            sc["shot"] = "scene"
        else:
            why.append(f"la narración dice el año {y}")

    elif shot == "number":
        v = _num_value(sc.get("number"))
        nums = spoken_numbers(narr)
        if v is None or not any(abs(v - n) < 0.5 or (n and abs(v - n) / max(n, 1) < 0.001) for n in nums):
            issues.append(f"cifra {sc.get('number')} no se dice en la narración → objeto")
            sc["shot"] = "object" if sc.get("prop") else "scene"
        else:
            why.append(f"la narración da la cifra {sc.get('number')}")

    elif shot == "danger":
        if not any(k in t or k in ctx for k in DEATH):
            issues.append("criatura/amenaza sin muerte ni miedo en la narración → primer plano")
            sc["shot"] = "closeup"
        else:
            why.append("la narración habla de muerte, miedo o amenaza")

    elif shot == "quote":
        q = _n(sc.get("quote") or "")
        if q and q[:20] not in t and not re.search(r"[«\"“]|dijo|escrib|said|wrote|frase", t):
            issues.append("cita que no se narra → plano de escena")
            sc["shot"] = "scene"
            sc.pop("quote", None)
        elif q:
            why.append("la narración cita textualmente")

    # personajes: solo los del reparto; si la escena nombra a alguien, ese
    chars = sc.get("chars") or []
    if chars:
        keep = []
        for c in chars:
            who = c.get("who")
            if who and who not in cast:
                issues.append(f"personaje '{who}' no existe en el reparto → eliminado")
                continue
            keep.append(c)
        sc["chars"] = keep
        names = [n for n in (cast.get(c.get("who"), {}).get("name", "") for c in keep if c.get("who")) if n]
        if names:
            why.append("aparece " + ", ".join(names))
    if sc.get("chip"):
        chip = _n(sc["chip"])
        if not any(p in t or p in ctx for p in re.split(r"[\s·,|-]+", chip) if len(p) > 3):
            issues.append(f"rótulo '{sc['chip']}' no sale de la narración → quitado")
            sc.pop("chip", None)
    if not why:
        why.append({"scene": "ilustra la acción narrada", "closeup": "reacción emocional del momento narrado",
                    "kinetic": "frase clave de la narración en pantalla", "end": "cierre del video",
                    "object": "objeto mencionado o símbolo de la idea narrada"}.get(sc.get("shot"), "ilustra la frase narrada"))
    sc["visual_justification"] = "; ".join(why)
    return sc, issues


def check_story(scenes, cast, chapters=None):
    """Valida todas las escenas. Devuelve (escenas, informe)."""
    report = {"scenes": [], "maps": 0, "issues": 0}
    chap_text = {}
    for i, ch in enumerate(chapters or []):
        chap_text[i] = (ch.get("summary") or "") + " " + (ch.get("title") or "")
    for sc in scenes:
        ctx = chap_text.get(sc.get("chapter", 0), "")
        sc, issues = check_scene(sc, cast or {}, ctx)
        if sc.get("shot") == "map":
            report["maps"] += 1
        report["issues"] += len(issues)
        report["scenes"].append({"id": sc.get("id"), "shot": sc.get("shot"), "justification": sc["visual_justification"], "issues": issues})
    return scenes, report


# ---------------------------------------------------------------- planificador por palabras clave
# (modo "mi propio guion" sin LLM: el escenario y la acción salen del texto narrado)
ENV_WORDS = [
    ("lighthouse", ("faro", "farero", "lighthouse")),
    ("sea", ("mar ", "mares", "oceano", "costa", "barco", "naufrag", "puerto", "isla", "playa", "pescador", "ola", "sea", "ship", "ocean")),
    ("battlefield", ("guerra", "batalla", "soldad", "trinchera", "bomba", "ejercito", "frente", "war", "battle", "soldier")),
    ("ghetto", ("gueto", "muro", "muralla", "campo de concentr", "alambr", "ghetto")),
    ("prison", ("carcel", "prision", "celda", "preso", "prisionero", "encarcel", "prison", "jail")),
    ("church", ("iglesia", "templo", "catedral", "rezar", "misa", "church")),
    ("castle", ("castillo", "rey ", "reina", "reino", "caballero", "medieval", "castle", "king")),
    ("throne", ("trono", "palacio", "emperador", "corte real", "throne", "palace")),
    ("ancient", ("egipto", "faraon", "piramide", "roma ", "romano", "grecia", "antigu", "imperio", "egypt", "pyramid")),
    ("space", ("espacio", "planeta", "estrella", "galaxia", "astronauta", "luna", "nasa", "space", "planet")),
    ("forest", ("bosque", "selva", "arbol", "jungla", "forest", "woods")),
    ("desert", ("desierto", "arena", "duna", "desert")),
    ("mountains", ("montana", "nieve", "cumbre", "volcan", "mountain")),
    ("hospital", ("hospital", "medico", "enferm", "doctor", "clinica")),
    ("lab", ("laboratorio", "cientific", "experiment", "lab ")),
    ("school", ("escuela", "colegio", "clase", "maestr", "profesor", "school")),
    ("office", ("oficina", "empresa", "jefe", "trabajo", "negocio", "office")),
    ("study", ("escrib", "carta", "diario", "investig", "documento", "papeles")),
    ("cave", ("cueva", "caverna", "mina", "tunel", "cave")),
    ("village", ("pueblo", "aldea", "granja", "campesin", "village")),
    ("field", ("campo", "pradera", "cosecha", "field")),
    ("road", ("camino", "carretera", "viaje", "huir", "huyo", "road")),
    ("room", ("casa", "habitacion", "cama", "cocina", "hogar", "salon", "home", "room")),
    ("street", ("calle", "ciudad", "barrio", "plaza", "street", "city")),
]
ACT_WORDS = [
    ("run", ("corr", "huy", "escap", "run")), ("walk", ("camin", "lleg", "entr", "sali", "avanz", "walk")),
    ("cry", ("llor", "lagrim", "cry")), ("shock", ("grit", "descubri", "horror", "sorpres", "shock")),
    ("scared", ("miedo", "temblab", "terror", "afraid")), ("lie", ("muert", "murio", "cadaver", "dead")),
    ("pray", ("rez", "oracion", "pray")), ("fight", ("pele", "lucha", "golpe", "fight")), ("angry", ("furi", "rabia", "odi", "angry")),
    ("think", ("pens", "pregunt", "record", "sabia", "think")), ("carry", ("cargab", "llevab", "carg", "carry")),
    ("celebrate", ("celebr", "gano", "victori", "win")), ("sad", ("triste", "solo", "perdi", "sad")), ("talk", ("dijo", "habl", "said")),
    ("point", ("encend", "señal", "mostr", "point")), ("look_up", ("mir", "cielo", "look")),
]


def env_from_text(text, default="void"):
    t = " " + _n(strip_emphasis(text)) + " "
    for env, words in ENV_WORDS:
        if any(w in t for w in words):
            return env
    return default


def action_from_text(text, default="idle"):
    t = _n(strip_emphasis(text))
    for act, words in ACT_WORDS:
        if any(w in t for w in words):
            return act
    return default


def time_from_text(text, default="night"):
    t = _n(text)
    if any(w in t for w in ("noche", "oscur", "luna", "night")):
        return "night"
    if any(w in t for w in ("atardec", "amanec", "ocaso", "dusk", "dawn")):
        return "dusk"
    if any(w in t for w in ("dia ", "sol ", "manana", "mediodia", "day")):
        return "day"
    return default


def weather_from_text(text):
    t = _n(text)
    for w, keys in (("storm", ("tormenta", "rayo", "trueno", "storm")), ("rain", ("lluvia", "llov", "rain")), ("snow", ("nieve", "nevab", "snow")),
                    ("fog", ("niebla", "bruma", "fog")), ("fire", ("incendio", "fuego", "llamas", "fire"))):
        if any(k in t for k in keys):
            return w
    return None
