"""Catálogo de assets vectoriales (personajes con rig, fondos por capas, props e
infografías). El dibujo vive en engine/6x_*.js; aquí está el registro con
versión, hash, palabras clave, acciones permitidas y procedencia/licencia.

El LLM y el planificador solo pueden referenciar ids de este catálogo: nada de
SVG/JS libre generado por el modelo.
"""
import copy
import glob
import hashlib
import json
import os

from .config import ENGINE_DIR, VS_DIR, data_dir
from .textutil import norm_word

LIB_PATH = os.path.join(VS_DIR, "assets", "library.json")
SPECIES_PATH = os.path.join(VS_DIR, "assets", "species.json")
_cache = {"mtime": None, "lib": None}

# piezas articuladas y acciones de cada rig paramétrico (engine/63_vector_creatures.js)
RIG_PARTS = {
    "quadruped": ["body", "neck", "head", "jaw", "eye", "ear_F", "ear_B", "tail_1", "tail_2", "tail_3", "leg_FL", "leg_FL_k", "leg_FR",
                  "leg_FR_k", "leg_BL", "leg_BL_k", "leg_BR", "leg_BR_k"],
    "bird": ["body", "neck", "head", "eye", "beak", "beak_low", "wing", "wing_far", "tail", "leg_L", "leg_R"],
    "fish": ["body", "body_back", "tail", "dorsal", "fin_pec", "fin_low", "eye", "jaw"],
    "octopus": ["mantle", "eye_L", "eye_R"] + [f"arm_{i}_{k}" for i in range(8) for k in range(3)],
    "insect": ["head", "thorax", "abdomen", "eye", "ant_F", "ant_B", "wing_F", "wing_B"] + [f"leg_{i}{s}{k}" for s in "LR" for i in range(3) for k in ("", "_k")],
    "snake": ["head", "eye", "tongue", "jaw", "body_spline"],
}
RIG_ACTIONS = {
    "quadruped": ["idle", "walk", "run", "hop", "peck", "talk", "look_left", "look_right", "blink", "surprise", "sit", "breathe", "appear", "travel"],
    "bird": ["idle", "walk", "run", "fly", "peck", "talk", "hop", "look_left", "look_right", "blink", "surprise", "sit", "breathe", "appear", "travel"],
    "fish": ["idle", "swim", "travel", "talk", "surprise", "blink", "hop", "appear", "look_left", "look_right"],
    "octopus": ["idle", "swim", "travel", "blink", "appear"],
    "insect": ["idle", "walk", "crawl", "fly", "hop", "talk", "look_left", "look_right", "blink", "surprise", "appear", "travel"],
    "snake": ["idle", "walk", "crawl", "travel", "talk", "surprise", "look_left", "blink", "appear"],
}
RIG_FOCUS = {
    "quadruped": ["head", "eye", "face", "mouth", "body", "legs", "tail"], "bird": ["head", "eye", "face", "beak", "mouth", "body", "legs", "wing", "tail"],
    "fish": ["head", "eye", "face", "mouth", "body", "tail"], "octopus": ["head", "eye", "face", "body", "legs"],
    "insect": ["head", "eye", "face", "mouth", "body", "legs", "wing"], "snake": ["head", "eye", "face", "mouth", "body"],
}
# escenario por defecto de cada especie (species.json "env") → fondo del catálogo
ENV_ASSETS = {"park": "park_day_v1", "park_close": "garden_macro_v1", "forest": "forest_day_v1", "jungle": "jungle_v1", "savanna": "savanna_v1",
              "farm": "farm_v1", "home": "home_living_v1", "desert": "desert_v1", "snow": "snow_v1", "ocean": "ocean_under_v1",
              "ocean_shore": "beach_v1", "river": "river_v1", "river_under": "ocean_under_v1", "sky": "sky_v1", "night": "night_meadow_v1"}


def species_entries(path=SPECIES_PATH):
    """Especies → personajes del catálogo (sp_<id>_v1) que usan un rig paramétrico."""
    with open(path, encoding="utf-8") as f:
        sp = json.load(f)
    out = {}
    for e in sp.get("species", []):
        rig = e["rig"]
        out[f"sp_{e['id']}_v1"] = {
            "name": e["name"], "version": 1, "builder": rig, "engine_file": "63_vector_creatures.js", "species": e["id"],
            "keywords": e.get("keywords_es", []) + e.get("keywords_en", []), "parts": RIG_PARTS[rig], "actions": RIG_ACTIONS[rig],
            "focus": {k: [0, 0] for k in RIG_FOCUS[rig]}, "params": dict(e.get("params") or {}, size=e.get("size", 0.4)),
            "env": ENV_ASSETS.get(e.get("env"), "park_day_v1"),
        }
    # rigs genéricos para criaturas diseñadas por el LLM (validadas en vs/creature_design.py)
    for rig in RIG_PARTS:
        out[f"creature_{rig}_v1"] = {"name": f"Criatura paramétrica ({rig})", "version": 1, "builder": rig, "engine_file": "63_vector_creatures.js",
                                     "keywords": [], "parts": RIG_PARTS[rig], "actions": RIG_ACTIONS[rig],
                                     "focus": {k: [0, 0] for k in RIG_FOCUS[rig]}, "params": {}, "env": "park_day_v1"}
    return out


def library():
    """Biblioteca base + extensiones en <datos>/assets/library*.json (assets propios)."""
    files = [LIB_PATH, SPECIES_PATH] + sorted(glob.glob(os.path.join(data_dir(), "assets", "library*.json")))
    mt = tuple(os.path.getmtime(f) for f in files if os.path.exists(f))
    if _cache["mtime"] == mt and _cache["lib"]:
        return _cache["lib"]
    with open(LIB_PATH, encoding="utf-8") as f:
        lib = json.load(f)
    for aid, e in species_entries().items():  # las especies no pisan a los personajes dibujados a mano
        lib["characters"].setdefault(aid, e)
    if "person_rig_v1" in lib["characters"]:  # roles y parentescos también son personas («la doctora», «mi abuelo»)
        from .cast import PERSON_EXTRA_KEYWORDS

        kw = lib["characters"]["person_rig_v1"]["keywords"]
        kw += [k for k in PERSON_EXTRA_KEYWORDS if k not in kw]
    for extra in files[2:]:
        try:
            with open(extra, encoding="utf-8") as f:
                ext = json.load(f)
            for k in ("characters", "backgrounds", "props", "infographics", "templates", "styles"):
                lib.setdefault(k, {}).update(ext.get(k) or {})
        except Exception as e:  # una extensión rota no tumba el Studio
            print(f"[ViralStudio] biblioteca ignorada {extra}: {e}")
    _cache.update(mtime=mt, lib=lib)
    return lib


def all_ids(lib=None):
    lib = lib or library()
    out = set()
    for k in ("characters", "backgrounds", "props", "infographics"):
        out |= set(lib.get(k, {}))
    return out


def actions_of(asset_id, lib=None):
    lib = lib or library()
    a = lib["characters"].get(asset_id) or {}
    return set(a.get("actions") or [])


def _engine_hash(fname):
    p = os.path.join(ENGINE_DIR, fname or "")
    if not fname or not os.path.exists(p):
        return ""
    with open(p, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:16]


def asset_hash(asset_id, lib=None):
    """Hash estable del asset = entrada del catálogo + archivo del motor que lo dibuja."""
    lib = lib or library()
    for k in ("characters", "backgrounds", "props", "infographics"):
        if asset_id in lib.get(k, {}):
            e = lib[k][asset_id]
            raw = json.dumps(e, sort_keys=True) + _engine_hash(e.get("engine_file"))
            return hashlib.sha256(raw.encode()).hexdigest()[:16]
    return None


def _norm_kw(kw):
    return " ".join(norm_word(w) for w in kw.split())


_kw_cache = {"lib": None, "idx": None}


def keyword_index(lib=None):
    """{palabra_o_frase_normalizada: [(kind, asset_id)]} (frases de hasta 3 palabras: «oso polar», «serpiente de cascabel»)."""
    lib = lib or library()
    if _kw_cache["lib"] is lib:
        return _kw_cache["idx"]
    idx = {}
    for kind in ("characters", "backgrounds", "props"):
        for aid, e in lib.get(kind, {}).items():
            for kw in e.get("keywords", []):
                idx.setdefault(_norm_kw(kw), []).append((kind, aid))
    _kw_cache.update(lib=lib, idx=idx)
    return idx


def match_text(text, lib=None):
    """Assets que la narración menciona literalmente: {kind: [(asset_id, palabra)]} en orden de aparición.
    Una frase del catálogo gana a sus palabras sueltas («oso polar» no crea también un oso)."""
    idx = keyword_index(lib)
    out = {"characters": [], "backgrounds": [], "props": []}
    seen = set()
    toks = (text or "").split()
    norms = [norm_word(t) for t in toks]
    i = 0
    while i < len(toks):
        hits, used = idx.get(norms[i], []), 1
        for n in (3, 2):  # la frase más larga del catálogo que empiece aquí
            ph = " ".join(norms[i:i + n])
            if i + n <= len(toks) and all(norms[i:i + n]) and ph in idx:
                hits, used = idx[ph], n
                break
        tok = " ".join(toks[i:i + used])
        for kind, aid in hits:
            # mismo asset con otra palabra = otra entidad posible («el médico y la enfermera»)
            if (kind, aid, " ".join(norms[i:i + used])) not in seen:
                seen.add((kind, aid, " ".join(norms[i:i + used])))
                out[kind].append((aid, tok))
        i += used
    return out


def manifest(plan, lib=None):
    """asset_manifest.json: cada asset usado con versión, hash, procedencia y licencia."""
    lib = lib or library()
    used = {}
    for s in plan.get("scenes", []):
        for aid in s.get("asset_ids", []):
            used.setdefault(aid, []).append(s["id"])
    lic = lib.get("license_default", {})
    out = []
    for aid, scenes in sorted(used.items()):
        kind = next((k for k in ("characters", "backgrounds", "props", "infographics") if aid in lib.get(k, {})), None)
        e = copy.deepcopy(lib.get(kind, {}).get(aid, {})) if kind else {}
        out.append({
            "asset_id": aid, "kind": kind or "missing", "name": e.get("name"), "version": e.get("version", 1),
            "hash": asset_hash(aid, lib), "engine_file": e.get("engine_file"), "parts": e.get("parts"),
            "scenes": scenes, "status": "ok" if kind else "MISSING",
            "provenance": e.get("provenance") or {"origin": lic.get("origin"), "author": lic.get("author")},
            "license": e.get("license") or lic.get("license"), "commercial": e.get("commercial", lic.get("commercial")),
        })
    return {"schema_version": 1, "assets": out, "missing": [a["asset_id"] for a in out if a["status"] != "ok"]}
