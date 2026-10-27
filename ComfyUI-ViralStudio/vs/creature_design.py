"""Personajes que el catálogo no conoce, diseñados por el LLM y VALIDADOS.

El texto puede nombrar cualquier animal («un ornitorrinco», «el quetzal») o una persona con un oficio
raro. Si el LLM está disponible, propone para cada uno un rig paramétrico del motor y sus parámetros;
aquí se valida TODO: la palabra debe estar literalmente en el texto, el rig y los enums deben existir,
los números se limitan a rangos dibujables y los colores deben ser hexadecimales. Nada de SVG/JS libre.
Sin LLM, este paso no hace nada (el catálogo de especies y los roles cubren lo habitual).
"""
import json
import re

from .textutil import norm_word

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
RIGS = ("quadruped", "bird", "fish", "octopus", "insect", "snake")
# rangos dibujables por parámetro numérico (unidades del rig)
RANGES = {
    "quadruped": {"bodyL": (120, 460), "bodyH": (50, 240), "legL": (25, 270), "legW": (12, 80), "neckL": (0, 340), "neckA": (0, 1.4),
                  "neckW": (20, 150), "headR": (22, 110), "snout": (0, 140), "snoutH": (0.4, 1.2), "earS": (0.4, 1.6), "tailL": (0, 400),
                  "tailW": (4, 30), "hump": (0, 1.2), "eyeS": (0.6, 1.8), "tilt": (0, 0.9), "size": (0.12, 0.7)},
    "bird": {"bodyRx": (36, 130), "bodyRy": (26, 110), "tilt": (0, 1.45), "neckL": (0, 180), "neckA": (0.6, 1.5), "neckW": (16, 70),
             "headR": (16, 60), "beakL": (8, 100), "legL": (8, 230), "tailL": (10, 140), "flapHz": (1, 7.5), "size": (0.12, 0.6)},
    "fish": {"bodyL": (120, 560), "bodyH": (40, 200), "eyeS": (0.6, 1.8), "size": (0.15, 0.85)},
    "octopus": {"R": (50, 140), "armL": (100, 300), "size": (0.2, 0.6)},
    "insect": {"headR": (12, 36), "thoraxR": (12, 36), "abdRx": (20, 90), "abdRy": (8, 44), "legL": (20, 120), "antL": (0, 100),
               "flapHz": (1, 7.5), "size": (0.12, 0.45)},
    "snake": {"L": (160, 640), "W": (20, 60), "size": (0.25, 0.75)},
}
ENUMS = {
    "quadruped": {"ears": {"pointy", "round", "small", "long", "floppy", "elephant", "side", "none"},
                  "tail": {"thin", "long", "bushy", "squirrel", "reptile", "tuft", "up", "short", "curly", "flat", "none", "curl", "thick"},
                  "horns": {"none", "short", "curved", "antlers", "rhino", "ossicones"}, "mane": {"none", "lion", "horse", "short"},
                  "pattern": {"none", "spots", "rosettes", "stripes", "patches", "blocks", "panda", "back_stripe"}, "gait": {"walk", "hop"},
                  "noseType": {"pig", "normal"}, "habitat": {"ground", "water"}},
    "bird": {"beak": {"short", "hook", "flat", "big", "bent", "needle", "snout"}, "feet": {"talon", "web"},
             "crest": {"none", "comb", "tuft", "crest"}, "tail": {"short", "fan", "upright", "long", "fork"}, "wings": {"feather", "flipper", "membrane"}},
    "fish": {"shape": {"fish", "shark", "dolphin", "whale"}, "tailT": {"fork", "round", "fluke", "shark"}, "dorsal": {"tri", "long", "sail", "small", "none"}},
    "octopus": {"kind": {"octopus", "squid", "jellyfish"}},
    "insect": {"kind": {"ant", "bee", "fly", "mosquito", "butterfly", "ladybug", "beetle", "grasshopper", "dragonfly", "firefly", "termite", "moth"},
               "wings": {"none", "clear", "butterfly", "shell", "long"}},
    "snake": {"kind": {"snake", "worm", "snail"}, "pattern": {"bands", "diamonds", "rings", "none"}, "headT": {"round", "tri"}},
}
COLORS = {"body", "belly", "dark", "legC", "paw", "nose", "earIn", "eyeC", "maneC", "hornC", "tailTip", "muzzle", "shellC", "earC", "stripeC",
          "beakC", "legC", "crestC", "tailC", "wingC", "headC", "neckC", "eyeRing", "cheek", "mask", "fin", "bands", "stripes", "spots", "abd",
          "wingC2", "glow", "collar", "beakTip", "eyespot", "crestC", "tailC"}
BOOLS = {"trunk", "tusks", "shell", "hooves", "whiskers", "beard", "eyePatch", "spines", "wool", "crest", "ringed", "frontArms", "wattle",
         "eyeBig", "hover", "teeth", "blowhole", "stinger", "proboscis", "jumpLegs", "hood", "rattle"}


def validate_params(rig, params):
    """Parámetros limpios y dibujables (descarta claves desconocidas; nunca lanza por un valor raro)."""
    out = {}
    if rig not in RIGS or not isinstance(params, dict):
        return out
    for k, v in params.items():
        if k in RANGES[rig]:
            try:
                lo, hi = RANGES[rig][k]
                out[k] = round(min(hi, max(lo, float(v))), 3)
            except (TypeError, ValueError):
                pass
        elif k in ENUMS.get(rig, {}):
            if isinstance(v, str) and v in ENUMS[rig][k]:
                out[k] = v
        elif k in COLORS:
            if isinstance(v, str) and HEX.match(v):
                out[k] = v.lower()
        elif k in BOOLS:
            if isinstance(v, bool):
                out[k] = v
    return out


def prompt(text, existing, species_ids):
    return f"""Eres el diseñador de personajes de un video animado (marionetas vectoriales 2D de perfil).
Texto de la narración (NO lo cambies):
\"\"\"{text[:6000]}\"\"\"

Ya existen estos personajes (no los repitas): {", ".join(existing) or "ninguno"}.
Especies ya dibujables (si el animal es una de estas o muy parecida, usa "like" con su id): {", ".join(species_ids)}.

Lista SOLO los personajes (animales, criaturas o personas) que el texto nombra y que NO están arriba.
Para cada uno: "word" = la palabra EXACTA del texto que lo nombra; "kind" = "animal" o "person".
Animales: "rig" ∈ {list(RIGS)}, "like" = id de especie parecida (opcional) y "params" con forma y colores
(claves válidas por rig: {json.dumps({r: sorted(set(RANGES[r]) | set(ENUMS.get(r, {}))) for r in RIGS}, ensure_ascii=False)};
colores en hexadecimal #rrggbb con claves body, belly, dark…), "habitat" ∈ ["ground","water","air"].
Personas: "variant" ∈ ["man","woman","child","elder"] y "look" con shirt/pants (#rrggbb), hat ∈ [crown, tiara, police, cap,
fire, hardhat, helmet, chef, straw, cowboy, fedora, graduation, witch, pirate, astronaut] y glasses/beard opcionales.
Devuelve SOLO JSON: {{"characters": [{{"word": "ornitorrinco", "kind": "animal", "rig": "quadruped", "like": "beaver",
"params": {{"snout": 60, "body": "#7a5a3e"}}, "habitat": "water"}}]}}"""


HATS = {"crown", "tiara", "police", "cap", "fire", "hardhat", "helmet", "chef", "straw", "cowboy", "fedora", "graduation", "witch", "pirate", "astronaut"}


def validate_cast(items, text, lib, existing_ids):
    """Valida la propuesta del LLM → entradas de biblia. Descarta (no corrige) lo que no cumple."""
    words = {norm_word(t) for t in (text or "").split()}
    out, seen = [], set()
    for it in items if isinstance(items, list) else []:
        if not isinstance(it, dict):
            continue
        w = str(it.get("word") or "").strip()
        n = norm_word(w.split()[0]) if w else ""
        if not n or n not in words or n in seen:
            continue  # la palabra debe estar en el texto: el LLM no inventa personajes
        seen.add(n)
        base = re.sub(r"[^a-z0-9]+", "_", n)[:24] or "char"
        k = 1
        while f"{base}_{k:02d}" in existing_ids:
            k += 1
        cid = f"{base}_{k:02d}"
        existing_ids.add(cid)
        if it.get("kind") == "person":
            look = {}
            lk = it.get("look") if isinstance(it.get("look"), dict) else {}
            for c in ("shirt", "pants", "hatC", "coat", "cape", "beard", "tie"):
                if isinstance(lk.get(c), str) and HEX.match(lk[c]):
                    look[c] = lk[c].lower()
            if lk.get("hat") in HATS:
                look["hat"] = lk["hat"]
            if isinstance(lk.get("glasses"), bool):
                look["glasses"] = lk["glasses"]
            variant = it.get("variant") if it.get("variant") in ("man", "woman", "child", "elder") else "man"
            out.append({"id": cid, "asset_id": "person_rig_v1", "variant": variant, "name": w, "first_word": w, "aliases": [n],
                        "description": "Persona diseñada por el LLM (validada)", "look": look, "designed_by": "llm", "locked": False})
            continue
        rig = it.get("rig")
        if rig not in RIGS:
            continue
        like = it.get("like")
        base_params = {}
        if isinstance(like, str) and f"sp_{like}_v1" in lib["characters"] and lib["characters"][f"sp_{like}_v1"]["builder"] == rig:
            base_params = dict(lib["characters"][f"sp_{like}_v1"].get("params") or {})
        params = dict(base_params, **validate_params(rig, it.get("params") or {}))
        hab = it.get("habitat")
        if hab == "water":
            params["habitat"] = "water"
        elif hab == "air" and rig in ("bird", "insect"):
            params["hover"] = True
        out.append({"id": cid, "asset_id": f"creature_{rig}_v1", "variant": "default", "name": w, "first_word": w, "aliases": [n],
                    "description": f"Criatura diseñada por el LLM ({rig}" + (f", parecida a {like}" if base_params else "") + ")",
                    "params": params, "designed_by": "llm", "locked": False})
    return out


def design_missing(text, bible, lib, log=print, cancel=None):
    """Pide al LLM los personajes que faltan; devuelve las entradas validadas (o [] si no hay LLM)."""
    from . import llm

    existing = [f"{c['id']} ({c.get('name')})" for c in bible["characters"]]
    species = sorted(e["species"] for e in lib["characters"].values() if e.get("species"))
    raw = llm.generate(prompt(text, existing, species), system="Responde solo con JSON válido.", max_tokens=3000, temperature=0.3, cancel=cancel)
    data = llm.parse_json(raw, "object")
    items = data.get("characters") if isinstance(data, dict) else None
    known = {al for c in bible["characters"] for al in (c.get("aliases") or [])} | {norm_word(c.get("first_word") or "") for c in bible["characters"]}
    items = [it for it in (items or []) if isinstance(it, dict) and norm_word(str(it.get("word") or "").split()[0] if it.get("word") else "") not in known]
    return validate_cast(items, text, lib, {c["id"] for c in bible["characters"]})
