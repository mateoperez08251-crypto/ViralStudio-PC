"""Storyboard del modo «Mi audio → video»: palabras con tiempo → plan de escenas.

Dos planificadores con el MISMO contrato de salida:
  · rule_plan(): determinista, sin modelos (siempre disponible).
  · llm_plan():  el LLM existente (ComfyUI · Qwen) elige plantilla, personajes,
    acciones, cámara y rótulos POR UNIDADES DE FRASE. Nunca da tiempos: los
    tiempos salen de las palabras reconocidas. Su JSON se valida (enums, ids
    del catálogo, rótulos literales de la narración, cifras dichas). Si no es
    válido se usa rule_plan() y se registra el motivo.

El audio y la transcripción son la fuente de verdad: ningún texto en pantalla
puede contener palabras que no se hayan dicho (salvo unidades del contador que
también deben estar en la narración).
"""
import copy
import hashlib
import json
import re
import time

from . import audio_timeline as TL
from . import visual_assets as VA
from .fidelity import NUM_WORDS, spoken_numbers
from .textutil import norm_word
from . import cast as CAST
from . import semantic_guardrails as SG

PLAN_SCHEMA_VERSION = 1
TEMPLATES = ["character_scene", "closeup", "counter", "kinetic", "document", "compare", "countdown", "ambient"]
SHOTS = ["wide", "medium", "closeup"]
MOVES = ["static", "slow_push", "push_in", "pull_out", "pan_left", "pan_right", "track", "orbit"]
OVERLAYS = ["counter_badge", "neon_number", "kinetic_title", "document_card", "callout", "ripples", "highlight_ring", "guide_line",
            "countdown", "compare_scale", "month_strip", "multiplier"]
TRANSITIONS = ["cut", "fade", "whip", "zoom"]

FUNC = {"a", "al", "de", "del", "la", "las", "el", "los", "lo", "un", "una", "unos", "unas", "y", "e", "o", "u", "que", "en", "por", "para",
        "con", "sin", "su", "sus", "mi", "tu", "se", "no", "ni", "como", "pero", "mas", "muy", "ya", "es", "son", "fue", "era", "esta",
        "este", "esto", "eso", "esa", "ese", "le", "les", "me", "te", "nos", "si", "hay", "ha", "han", "the", "of", "to", "and", "in", "on",
        "for", "with", "at", "by", "an", "is", "are", "was", "it", "that", "this", "so", "but", "or", "if", "your", "you", "its"}

# verbo/palabra narrada → acción del personaje (solo si el rig la admite)
VERB_ACTIONS = [
    ({"camina", "caminar", "caminando", "camino", "anda", "andar", "andando", "avanza", "avanzar", "avanzando", "pasea", "pasear",
      "paso", "pasos", "camino", "camino", "caminaba", "levanto", "levantarse", "acerco", "acercarse", "walk", "walks", "walking"}, "walk"),
    ({"corre", "correr", "corriendo", "corren", "huye", "huir", "persigue", "galopa", "galopar", "run", "runs", "running", "chases"}, "run"),
    ({"vuela", "volar", "volando", "vuelan", "revolotea", "planea", "aletea", "fly", "flies", "flying", "flew"}, "fly"),
    ({"nadar", "nadando", "nadan", "bucea", "bucear", "swim", "swims", "swimming"}, "swim"),
    ({"salta", "saltar", "salto", "saltos", "brinca", "jump", "jumps", "hop"}, "hop"),
    ({"picotea", "picotear", "come", "comer", "comiendo", "peck", "eat", "eats"}, "peck"),
    ({"mira", "mirar", "mirando", "observa", "observar", "observando", "fija", "look", "looks", "watch", "watches"}, "look"),
    ({"dice", "decir", "habla", "hablar", "cuenta", "explica", "pregunta", "says", "talk", "tells", "asks",
      "ladra", "ladrar", "ladrido", "ladro", "maulla", "maullar", "ruge", "rugir", "rugido", "canta", "cantar", "grazna", "cacarea",
      "muge", "relincha", "silba", "zumba", "croa", "aulla", "aullar", "barks", "meows", "roars", "sings", "howls", "buzzes"}, "talk"),
    ({"senala", "senalar", "apunta", "point", "points"}, "point"),
    ({"sorprendido", "sorprendida", "sorpresa", "asombrado", "asombrada", "increible", "wow", "surprised"}, "surprise"),
    ({"sentado", "sentada", "sienta", "sentarse", "acosto", "acostarse", "sit", "sits", "sitting"}, "sit"),
    ({"saluda", "saludar", "wave", "waves"}, "wave"),
    ({"piensa", "pensar", "cree", "creemos", "imagina", "think", "thinks", "believe"}, "think"),
    ({"duerme", "dormir", "dormido", "dormida", "durmiendo", "dormimos", "duermes", "sleep", "sleeps", "asleep"}, "breathe"),
    ({"ronca", "roncar", "ronquido", "ronquidos", "snore", "snores"}, "snore"),
    ({"temblando", "tiembla", "temblo", "shiver"}, "shiver"),
    ({"quieta", "quieto", "inmovil", "fija", "estable", "congela", "still", "steady", "fixed"}, "head_stabilize"),
    ({"baja", "bajar", "desciende", "cuelga", "hilo", "descend", "hangs"}, "descend"),
    ({"trepa", "trepar", "sube", "subir", "recorre", "crawl", "crawls", "climbs"}, "crawl"),
    ({"parpadea", "parpadear", "parpadeo", "blink", "blinks"}, "blink"),
    ({"despierta", "despertar", "despiertas", "wake", "wakes"}, "wake"),
]
BODY_PARTS = {
    "cabeza": "head", "cabezas": "head", "head": "head", "ojo": "eye", "ojos": "eye", "eye": "eye", "eyes": "eye", "pupila": "eye",
    "boca": "mouth", "mouth": "mouth", "labios": "mouth", "cara": "face", "rostro": "face", "face": "face", "cuerpo": "body",
    "body": "body", "patas": "legs", "piernas": "legs", "pies": "legs", "legs": "legs", "manos": "hands", "mano": "hands",
}
RIPPLE_WORDS = {"vibra", "vibracion", "vibraciones", "vibrar", "sonido", "ruido", "ronca", "ronquido", "terremoto", "alarma", "peligro",
                "latido", "latidos", "corazon", "respira", "respiracion", "temblar", "tiembla", "vibration", "sound", "noise", "alarm", "heart"}
DOC_WORDS = {"estudio", "estudios", "articulo", "revista", "periodista", "publico", "publicado", "investigacion", "libro", "medicina",
             "informe", "noticia", "periodico", "study", "article", "journal", "report", "paper"}
MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
DEFAULT_ENV = {"pigeon_rig_v1": "plaza_layered_v1", "cat_rig_v1": "plaza_layered_v1", "sleeper_rig_v1": "bedroom_night_v1",
               "spider_rig_v1": "bedroom_night_v1", "person_rig_v1": "park_day_v1", "eye_closeup_v1": "space_nebula_v1"}
ACTION_ALIAS = {"walk": ["swim", "crawl", "fly"], "run": ["walk", "swim", "fly", "crawl"], "swim": ["walk", "crawl"],
                "fly": ["hop", "walk"], "crawl": ["walk", "swim"], "hop": ["walk"], "peck": ["talk"]}
ARTICLES = {"un", "una", "uno", "one", "a"}
SKINS = ["#f1c7a1", "#e2a87e", "#c98b5e", "#9c6644", "#f5d2b5"]
HAIRS = ["#3b2a20", "#6b4428", "#1f1a17", "#a8743a"]
PERSON_VARIANT = {"nino": "child", "nina": "child", "chico": "child", "chica": "woman", "kid": "child", "boy": "child", "girl": "child",
                  "mujer": "woman", "senora": "woman", "abuela": "woman", "woman": "woman", "hombre": "man", "senor": "man",
                  "abuelo": "elder", "man": "man"}


# ------------------------------------------------------------------ ayudas
def default_env(asset_id, lib=None):
    """Escenario natural de un personaje: tabla fija para los rigs dibujados a mano, `env` del catálogo de especies."""
    if asset_id in DEFAULT_ENV:
        return DEFAULT_ENV[asset_id]
    lib = lib or VA.library()
    return (lib["characters"].get(asset_id) or {}).get("env") or "studio_gradient_v1"


def _toks(text):
    return [norm_word(t) for t in (text or "").split()]


def _clean(tok):
    return re.sub(r"^[¿¡\"'«(“]+|[\"'»)”.,;:!?…]+$", "", tok or "")


def scene_id(i):
    return f"sc{i + 1:03d}"


def number_label(words_txt, idx_after, n=3):
    """Hasta n palabras narradas tras la cifra (literales, sin puntuación final)."""
    out = []
    for tok in words_txt[idx_after:idx_after + n]:
        c = _clean(tok)
        if not c:
            break
        out.append(c)
        if re.search(r"[.,;:!?…]$", tok):
            break
    return " ".join(out)


def _is_num_tok(tok):
    n = norm_word(tok)
    return bool(n) and (n.isdigit() or (n in NUM_WORDS and n not in ARTICLES))


def find_number(word_objs):
    """Primera cifra dicha en la unidad: (valor, id de palabra, rótulo literal).
    Las cifras en palabras pueden ocupar varias («dos mil quinientos»), pero
    «una cámara» no es una cifra."""
    txt = [w["text"] for w in word_objs]
    for i, w in enumerate(word_objs):
        if not _is_num_tok(txt[i]) or norm_word(txt[i]) in ("mil", "millon", "millones", "billon", "billones", "million", "billion"):
            continue
        j = i + 1
        while j < len(txt) and (_is_num_tok(txt[j]) or norm_word(txt[j]) == "y" and j + 1 < len(txt) and _is_num_tok(txt[j + 1])):
            j += 1
        nums = spoken_numbers(" ".join(txt[i:j]))
        if nums:
            return max(nums), w["id"], number_label(txt, j)
    return None


def _until_sentence_end(wobj, n):
    out = []
    for w in wobj[:n]:
        out.append(w)
        if re.search(r"[.!?…]$", w["text"]):
            break
    return out


def pick_highlights(word_objs, matched_words, limit=2):
    """Palabras clave para el recuadro de los subtítulos (estilo explicativo)."""
    out = []
    mset = {norm_word(m) for m in matched_words}
    for w in word_objs:
        n = norm_word(w["text"])
        if n in mset or n in BODY_PARTS or spoken_numbers(w["text"]) and n not in FUNC:
            if w["id"] not in out:
                out.append(w["id"])
    if not out:
        # la palabra de contenido más larga de la frase (suele ser la que se recalca)
        cands = [w for w in word_objs if norm_word(w["text"]) not in FUNC and len(norm_word(w["text"])) >= 5]
        if cands:
            out.append(max(cands, key=lambda w: (len(norm_word(w["text"])), w["start_s"]))["id"])
    return out[:limit]


# ------------------------------------------------------------------ biblia visual
def build_bible(units, words, cfg, lib=None, previous=None):
    """Personajes y escenarios persistentes a partir de lo que la narración nombra.
    Si ya existe una biblia (editada por el usuario) se conserva y se amplía."""
    lib = lib or VA.library()
    bible = copy.deepcopy(previous) if previous else {"style": cfg.get("visual_style") or "cutout_ilustrado",
                                                      "characters": [], "backgrounds": [], "props": []}
    bible.setdefault("palette", (lib.get("styles", {}).get(bible["style"]) or {}).get("palette", []))
    have = {(c["asset_id"], c.get("variant", "default"), c.get("role")) for c in bible["characters"]}
    for u in units:
        m = VA.match_text(u["text"], lib)
        for aid, tok in _drop_generic_sleeper(m["characters"], lib):
            role, look, variant = _person_identity(u["text"], tok) if aid == "person_rig_v1" else (None, {}, "default")
            if (aid, variant, role) in have:
                continue
            have.add((aid, variant, role))
            # id persistente y legible: especie (elephant_01) o rig (person_02); nunca se repite
            base = (role or "").replace("_f", "") or lib["characters"][aid].get("species") or lib["characters"][aid]["builder"]
            n = 1
            while any(c["id"] == f"{base}_{n:02d}" for c in bible["characters"]):
                n += 1
            cid = f"{base}_{n:02d}"
            entry = {"id": cid, "asset_id": aid, "variant": variant, "name": _clean(tok), "first_word": tok,
                     "description": lib["characters"][aid]["name"], "locked": False}
            if aid == "person_rig_v1":
                # apariencia fijada en la biblia: el mismo personaje es idéntico en todas las escenas
                h = int(hashlib.sha256(cid.encode()).hexdigest(), 16)
                entry["colors"] = {"skin": SKINS[h % len(SKINS)], "hairColor": HAIRS[(h >> 8) % len(HAIRS)]}
                if role:  # aspecto del rol (bata, corona, casco…); las canas del rol mandan sobre el color al azar
                    entry["role"], entry["look"] = role, look
                    if "hairColor" in look:
                        entry["colors"].pop("hairColor")
            bible["characters"].append(entry)
        for aid, tok in m["backgrounds"]:
            if not any(b["asset_id"] == aid for b in bible["backgrounds"]):
                bible["backgrounds"].append({"id": aid.replace("_v1", "") + "_01", "asset_id": aid, "name": _clean(tok)})
        for aid, tok in m["props"]:
            if not any(p["asset_id"] == aid for p in bible["props"]):
                bible["props"].append({"id": aid.replace("_v1", "") + "_01", "asset_id": aid, "name": _clean(tok)})
    # «su cama» / «todos dormían» no crea un durmiente humano si la historia trata de mascotas.
    pet_story = any(c["asset_id"] in ("sp_dog_v1", "cat_rig_v1", "sp_cat_big_v1") for c in bible["characters"])
    all_t = " ".join(norm_word(w["text"]) for w in words)
    if pet_story and "hombre dormido" not in all_t and "mujer dormida" not in all_t:
        bible["characters"] = [c for c in bible["characters"] if c["asset_id"] != "sleeper_rig_v1" and
                               not (c["asset_id"] == "person_rig_v1" and norm_word(c.get("first_word") or "") in ("amigo", "amiga"))]
    _attach_names(bible, words, lib)
    SG.attach_explicit_looks(bible, " ".join(w["text"] for w in words), lib)
    # «3 de la mañana» debe conservar horario nocturno aunque ninguna frase
    # diga literalmente «noche» o «luna» (nunca sustituir por parque soleado).
    whole = " ".join(w["text"] for w in words)
    if SG.global_context(whole)["night"]:
        for nenv in ("night_meadow_v1", "bedroom_night_v1"):
            if not any(b["asset_id"] == nenv for b in bible["backgrounds"]):
                bible["backgrounds"].append({"id": nenv.replace("_v1", "") + "_01", "asset_id": nenv, "name": "(persistencia de noche)"})
    # el escenario por defecto de cada personaje también queda en la biblia
    for c in bible["characters"]:
        env = default_env(c["asset_id"], lib)
        if env and not any(b["asset_id"] == env for b in bible["backgrounds"]):
            bible["backgrounds"].append({"id": env.replace("_v1", "") + "_01", "asset_id": env, "name": "(por defecto)"})
    if not any(b["asset_id"] == "studio_gradient_v1" for b in bible["backgrounds"]):
        bible["backgrounds"].append({"id": "studio_gradient_01", "asset_id": "studio_gradient_v1", "name": "(infografías)"})
    return bible


# ------------------------------------------------------------------ planificador por reglas
def _person_identity(text, tok):
    """(rol, aspecto, variante) de una persona nombrada con `tok` dentro de `text` (mira el artículo anterior)."""
    toks = (text or "").split()
    first = norm_word(tok.split()[0])
    prev = None
    for i, t in enumerate(toks):
        if norm_word(t) == first:
            prev = toks[i - 1] if i else None
            break
    role, look = CAST.role_of(tok)
    return role, look, CAST.variant_of(tok, prev, role)


def _char_for(bible, aid, tok=None, text=None):
    if aid != "person_rig_v1":
        return next((c for c in bible["characters"] if c["asset_id"] == aid), None)
    role, _, variant = _person_identity(text or tok or "", tok or "")
    explicit = norm_word(tok or "") in CAST.VARIANT_WORDS or role
    people = [c for c in bible["characters"] if c["asset_id"] == aid]
    for test in ((lambda c: c.get("role") == role and c.get("variant") == variant),
                 (lambda c: role and c.get("role") == role),
                 (lambda c: not role and explicit and not c.get("role") and c.get("variant") == variant),
                 (lambda c: not role and not c.get("role")),
                 (lambda c: True)):
        hit = next((c for c in people if test(c)), None)
        if hit:
            return hit
    return None


def _drop_generic_sleeper(found, lib):
    """«La gata duerme»: duerme la gata; el durmiente humano (palabras como «duerme», «cama») solo aparece
    si el texto no nombra a otro personaje (p. ej. «duermes con la boca abierta»)."""
    others = [x for x in found if x[0] not in ("sleeper_rig_v1", "eye_closeup_v1")]
    sleep_words = {"dormir", "duerme", "duermes", "dormimos", "dormido", "dormida", "durmiendo", "sleep", "sleeping", "asleep", "ronca", "roncar"}
    if others:
        return [x for x in found if not (x[0] == "sleeper_rig_v1" and norm_word(x[1]) in sleep_words)]
    return found


def chars_in(text, bible, lib=None):
    """Personajes de la biblia mencionados en `text`, en orden de aparición: [(id, palabra)].
    Incluye nombres propios («Pedro», «Luna») guardados como alias en la biblia."""
    lib = lib or VA.library()
    toks = (text or "").split()
    norms = [norm_word(t) for t in toks]
    found = []
    for aid, tok in _drop_generic_sleeper(VA.match_text(text, lib)["characters"], lib):
        # Un vínculo afectivo («su mejor amiga») no es automáticamente una persona:
        # en una historia de animales suele referirse al animal ya nombrado.
        if norm_word(tok) in ("amigo", "amiga", "amigos", "amigas") and any(
                c0["asset_id"] in ("sp_dog_v1", "cat_rig_v1", "sp_cat_big_v1") for c0 in bible["characters"]):
            continue
        c = _char_for(bible, aid, tok, text)
        if c:
            first = norm_word(tok.split()[0])
            pos = next((i for i, n in enumerate(norms) if n == first), 0)
            found.append((pos, c["id"], tok))
    for c in bible["characters"]:
        for al in c.get("aliases") or []:
            for i, n in enumerate(norms):
                if n == al:
                    found.append((i, c["id"], toks[i]))
    out, seen = [], set()
    for _, cid, tok in sorted(found):
        if cid not in seen:
            seen.add(cid)
            out.append((cid, tok))
    return out


def _merge_names_into(bible, designed, words):
    """«La alcaldesa Rosa»: si un nombre propio quedó como persona suelta y en la misma frase está la palabra
    de un personaje recién diseñado, son el mismo personaje."""
    ends = [bool(re.search(r"[.!?…]['\"»)]*$", w["text"])) for w in words]
    norms = [norm_word(w["text"]) for w in words]
    for d in designed:
        dn = (d.get("aliases") or [None])[0]
        for i in [k for k, n in enumerate(norms) if n == dn]:
            for c in list(bible["characters"]):
                if c is d or c.get("description") != "Persona (nombre propio del texto)":
                    continue
                al = (c.get("aliases") or [None])[0]
                for j in range(max(0, i - 4), min(len(words), i + 5)):
                    if norms[j] == al and not any(ends[k] for k in range(min(i, j), max(i, j))):
                        d["name"], d["aliases"] = c["name"], (d.get("aliases") or []) + [al]
                        if d["asset_id"] == "person_rig_v1" and c.get("colors"):
                            d["colors"] = c["colors"]
                        bible["characters"].remove(c)
                        break


def _attach_names(bible, words, lib):
    """Nombres propios → personajes. «Luna, la perra» / «la perra Luna»: la perra se llama Luna.
    Un nombre sin nadie cerca es una persona nueva (género por artículo o terminación; editable)."""
    # un nombre puede coincidir con un lugar u objeto («Luna»), nunca con un personaje del catálogo
    known = {k for k, hits in VA.keyword_index(lib).items() if any(kind == "characters" for kind, _ in hits)}
    ends = [bool(re.search(r"[.!?…]['\"»)]*$", w["text"])) for w in words]
    for i, name in CAST.find_names(words, known):
        n = norm_word(name)
        if any(n in (c.get("aliases") or []) for c in bible["characters"]):
            continue
        near = None
        for j in sorted(range(max(0, i - 4), min(len(words), i + 5)), key=lambda j: (abs(j - i), j)):
            if j == i or any(ends[k] for k in range(min(i, j), max(i, j))):
                continue  # el nombre y el personaje deben estar en la misma frase
            mm = VA.match_text(words[j]["text"], lib)["characters"]
            if mm:
                ctx = " ".join(w["text"] for w in words[max(0, j - 1):j + 1])
                near = _char_for(bible, mm[0][0], mm[0][1], ctx)
                break
        if near is not None and not near.get("aliases"):
            near["name"], near["aliases"] = name, [n]
            continue
        prev = norm_word(words[i - 1]["text"]) if i else ""
        variant = "woman" if prev in CAST.FEM_ARTICLES or (n.endswith("a") and prev not in CAST.MASC_ARTICLES) else "man"
        k = 1
        while any(c["id"] == f"person_{k:02d}" for c in bible["characters"]):
            k += 1
        cid = f"person_{k:02d}"
        h = int(hashlib.sha256(cid.encode()).hexdigest(), 16)
        bible["characters"].append({"id": cid, "asset_id": "person_rig_v1", "variant": variant, "name": name, "first_word": name,
                                    "aliases": [n], "description": "Persona (nombre propio del texto)", "locked": False,
                                    "colors": {"skin": SKINS[h % len(SKINS)], "hairColor": HAIRS[(h >> 8) % len(HAIRS)]}})


def _bg_id(bible, aid):
    b = next((b for b in bible["backgrounds"] if b["asset_id"] == aid), None)
    return b["id"] if b else None


def rule_choices(units, words, bible, cfg, lib=None):
    """Decide, por unidad, qué se ve. Devuelve una lista de "choices" (mismo
    formato que el LLM) con unit_range y referencias a palabras."""
    lib = lib or VA.library()
    byid = {w["id"]: w for w in words}
    choices = []
    cur_chars, cur_env, last_shot, last_move = [], None, None, None
    moves_cycle = ["slow_push", "pan_right", "push_in", "pan_left", "pull_out", "track"]
    for ui, u in enumerate(units):
        wobj = [byid[i] for i in u.get("word_ids", [])]
        toks = _toks(u["text"])
        m = VA.match_text(u["text"], lib)
        just = []
        if not wobj:
            choices.append({"units": [ui, ui], "template": "ambient", "background": cur_env or _bg_id(bible, "studio_gradient_v1"),
                            "characters": [{"id": c, "action": "idle"} for c in cur_chars], "camera": {"shot": "wide", "movement": "slow_push"},
                            "overlays": [], "beats": [], "highlight": [],
                            "justification": "Silencio en el audio: plano de ambientación (sin narración inventada)."})
            continue
        # personajes nombrados en la unidad (o los del contexto si hay pronombre/continuación)
        named = []
        mentions = chars_in(u["text"], bible, lib)
        for cid, tok in mentions:
            if cid not in named:
                named.append(cid)
                just.append(f"«{_clean(tok)}» → {cid}")
        # «los ojos de la paloma»: si un personaje del contexto tiene esa parte, la cámara se acerca a ÉL;
        # el ojo humano en primer plano solo se usa cuando no hay a quién atribuir los ojos
        if any(c.startswith("eye_") for c in named) and (cur_chars or [c for c in named if not c.startswith("eye_")]):
            named = [c for c in named if not c.startswith("eye_")]
            just.append("«ojo(s)» → primer plano del ojo del personaje en escena")
        # copresencia: lo nombrado + quien ya estaba en el mismo lugar (la araña baja HACIA el durmiente)
        chars = list(named)
        if named and cur_env and not m["backgrounds"]:
            chars += [c for c in cur_chars if c not in chars]
        chars = (chars or list(cur_chars))[:2]
        # escenario
        env = None
        aliases = {al for c in bible["characters"] for al in c.get("aliases") or []}
        m["backgrounds"] = [x for x in m["backgrounds"] if norm_word(x[1]) not in aliases]  # «Luna» la gata no es la luna
        if m["backgrounds"]:
            # si se nombran varios lugares, gana el natural del protagonista («sabana» con un león → sabana, no la cama)
            pick = m["backgrounds"][0]
            if len(m["backgrounds"]) > 1 and chars:
                nat = {(lambda c: c.get("env") or default_env(c["asset_id"], lib))(next(c for c in bible["characters"] if c["id"] == cid)) for cid in chars}
                pick = next((b for b in m["backgrounds"] if b[0] in nat), pick)
            env = _bg_id(bible, pick[0])
            just.append(f"«{_clean(pick[1])}» → escenario {env}")
        elif named:
            main = next(c for c in bible["characters"] if c["id"] == named[0])
            env = cur_env if cur_env and cur_env != _bg_id(bible, "studio_gradient_v1") else _bg_id(bible, main.get("env") or default_env(main["asset_id"], lib))
        env = env or cur_env or _bg_id(bible, "studio_gradient_v1")
        # acciones por verbos narrados (sincronizadas con la palabra). Sujeto = el personaje nombrado más
        # cerca ANTES del verbo («un león ruge y el elefante corre» → corre el elefante)
        mention = []
        for cid, tok in mentions:
            first = norm_word(tok.split()[0])
            for wi, w in enumerate(wobj):
                if cid in chars and norm_word(w["text"]) == first:
                    mention.append((wi, cid))
        beats, base_action = [], {}
        for wi, w in enumerate(wobj):
            n = norm_word(w["text"])
            for vocab, act in VERB_ACTIONS:
                if n in vocab:
                    before = [cid for i, cid in sorted(mention) if i < wi]
                    subj = before[-1:] or (chars[:1] if act not in ("look", "surprise") else chars[-1:])
                    for cid in subj:
                        c = next(c for c in bible["characters"] if c["id"] == cid)
                        allowed = VA.actions_of(c["asset_id"], lib)
                        real = act
                        if act == "look":
                            real = "look_left" if "look_left" in allowed and len(beats) % 2 else "look_right"
                        if act == "breathe" and "breathe" not in allowed:
                            continue
                        if real not in allowed:  # el pez «camina» nadando, la serpiente repta…
                            real = next((x for x in ACTION_ALIAS.get(real, []) if x in allowed), real)
                        if real in allowed:
                            if real in ("walk", "breathe", "sit", "crawl", "head_stabilize", "snore", "run", "fly", "swim", "talk", "shiver"):
                                base_action.setdefault(cid, real)
                            beats.append({"word": w["id"], "action": real, "target": cid})
                            just.append(f"«{_clean(w['text'])}» → {cid}.{real}")
                    break
        # cifras, partes del cuerpo y otras ayudas visuales
        overlays, template, shot, focus = [], "character_scene" if chars else "kinetic", None, None
        num = find_number(wobj)
        if num:
            v, wid, label = num
            secs = any(t in ("segundos", "segundo", "seconds") for t in toks)
            if secs and v <= 60 and any(t in ("cuenta", "aguanta", "mira", "espera") for t in toks):
                overlays.append({"type": "countdown", "word": wid, "from": int(v), "to": 0})
                template = "countdown"
            else:
                overlays.append({"type": "counter_badge", "word": wid, "value": v, "label": label})
                template = "counter" if not chars else template
            just.append(f"cifra narrada «{byid[wid]['text']}» → contador {v:g}")
        for w in wobj:
            n = norm_word(w["text"])
            if n in BODY_PARTS and chars and not focus:
                # la parte se atribuye al primer personaje cuyo rig la tiene (la paloma tiene cabeza/ojo, el gato también…)
                owner = next((c for c in chars if BODY_PARTS[n] in (lib["characters"][next(x["asset_id"] for x in bible["characters"] if x["id"] == c)].get("focus") or {})), chars[0])
                focus = {"target": owner, "part": BODY_PARTS[n], "word": w["id"]}
                template = "closeup" if not num else template
                just.append(f"«{_clean(w['text'])}» → primer plano de {BODY_PARTS[n]}")
            if n in RIPPLE_WORDS and not any(o["type"] == "ripples" for o in overlays):
                alarm = n in ("alarma", "peligro", "alarm", "terremoto")
                tgt = next((c for c in chars if c.startswith("sleeper")), chars[0] if chars else None)
                overlays.append({"type": "ripples", "word": w["id"], "target": tgt, "color": "#ff5a6e" if alarm else "#5fd3ff",
                                 "part": "mouth" if n.startswith("ronc") or n.startswith("respir") else "body"})
            if n in MONTHS:
                overlays.append({"type": "month_strip", "word": w["id"], "highlight": [MONTHS.index(n)]})
        if any(b["action"] == "head_stabilize" for b in beats):
            b = next(b for b in beats if b["action"] == "head_stabilize")
            overlays.append({"type": "guide_line", "word": b["word"], "target": b["target"], "part": "head"})
        asset_of = {c["id"]: c["asset_id"] for c in bible["characters"]}
        named_persons_only = all(asset_of.get(c) == "person_rig_v1" for c in named)
        if any(t in DOC_WORDS for t in toks) and named_persons_only:  # «estudio científico» → documento, no una persona
            template, chars, beats = "document", [], []
            env = _bg_id(bible, "studio_gradient_v1")
            overlays.append({"type": "document_card", "word": wobj[0]["id"], "title": " ".join(_clean(w["text"]) for w in _until_sentence_end(wobj, 12))})
        if " al ano" in " " + " ".join(toks) and not any(o["type"] == "month_strip" for o in overlays):
            idx = toks.index("ano") if "ano" in toks else 0
            overlays.append({"type": "month_strip", "word": wobj[min(idx, len(wobj) - 1)]["id"], "highlight": list(range(12))})
        if template == "kinetic":
            kw = pick_highlights(wobj, [t for _, t in m["props"]], 3)
            overlays.append({"type": "kinetic_title", "word": wobj[0]["id"], "words": kw or [wobj[0]["id"]]})
        # cámara: variedad y foco
        if template == "closeup" and ui == 0:
            template, shot, move = "character_scene", "wide", "slow_push"  # plano de situación; el foco llega con la palabra
        elif template == "closeup":
            shot, move = "closeup", "push_in"
        elif template in ("counter", "countdown", "kinetic", "document"):
            shot, move = "medium", "slow_push"
        else:
            shot = "wide" if (ui == 0 or env != cur_env) else ("medium" if last_shot == "wide" else "wide")
            if env == _bg_id(bible, "studio_gradient_v1") and chars:
                shot = "medium"  # sobre fondo de estudio, un personaje en plano general queda diminuto
            move = "track" if any(b["action"] == "walk" for b in beats) and ui % 2 == 0 else moves_cycle[ui % len(moves_cycle)]
            if move == last_move:
                move = moves_cycle[(ui + 1) % len(moves_cycle)]
        cam = {"shot": shot, "movement": move}
        if focus:
            cam["focus"] = {"target": focus["target"], "part": focus["part"]}
            cam["focus_word"] = focus["word"]
        hl = pick_highlights(wobj, [t for _, t in m["characters"] + m["backgrounds"] + m["props"]])
        # objetos nombrados (banco, cámara, árbol…) como props de la escena
        props = []
        for aid, tok in m["props"]:
            p = next((p for p in bible["props"] if p["asset_id"] == aid), None)
            if p and not any(x["id"] == p["id"] for x in props):
                props.append({"id": p["id"], "word": next((w["id"] for w in wobj if norm_word(w["text"]) == norm_word(tok)), wobj[0]["id"])})
        if template == "closeup" and focus:  # primer plano: solo el personaje enfocado
            chars = [focus["target"]]
        if template == "document":
            props = []  # el documento ya es el objeto protagonista
        # Una acción pertenece exclusivamente al evento actual: no heredar indefinidamente
        # "walk"/"run"/"talk" de la escena anterior. Un idle puede animar respiración,
        # pero NO cuenta como acción narrativa y pasa por el quality gate.
        chosen = [{"id": c, "action": base_action.get(c, "idle")} for c in chars]
        choices.append({"units": [ui, ui], "template": template, "background": env, "characters": chosen, "props": props,
                        "camera": cam, "overlays": overlays, "beats": beats, "highlight": hl,
                        "justification": "; ".join(just) or "Continuidad: mismos personajes y escenario que la escena anterior."})
        if template != "closeup":
            cur_chars = chars
        else:  # tras un primer plano, el personaje enfocado pasa a ser el protagonista del contexto
            cur_chars = (chars + [c for c in cur_chars if c not in chars])[:2]
        cur_env, last_shot, last_move = env, shot, move
    return choices


# ------------------------------------------------------------------ planificador LLM
def llm_prompt(units, bible, cfg, lib):
    chars = "\n".join(f"  - {c['id']}: {c['description']} (variant {c.get('variant')}); acciones: "
                      f"{', '.join(lib['characters'][c['asset_id']]['actions'])}" for c in bible["characters"]) or "  (ninguno)"
    bgs = ", ".join(b["id"] for b in bible["backgrounds"])
    us = "\n".join(f"  U{i}: [{u['start_s']:.2f}-{u['end_s']:.2f}s] " + " ".join(f"{w}" for w in u.get("tagged", u["text"].split()))
                   for i, u in enumerate(units))
    return f"""Eres el director de arte de un video explicativo animado (vectores 2D/2.5D, marionetas articuladas).
La narración YA ESTÁ GRABADA: no puedes cambiar, resumir ni añadir palabras, ni proponer tiempos.
Unidades de frase (cada palabra lleva su id entre corchetes):
{us}

Personajes disponibles (biblia visual, mantener SIEMPRE el mismo id para continuidad):
{chars}
Escenarios: {bgs}
Plantillas: {', '.join(TEMPLATES)} · Planos: {', '.join(SHOTS)} · Movimientos: {', '.join(MOVES)}
Infografías: {', '.join(OVERLAYS)} · Transiciones: {', '.join(TRANSITIONS)}

Agrupa las unidades CONSECUTIVAS en escenas de 2 a 6 segundos (puedes juntar varias unidades). Cubre todas las
unidades en orden, sin saltar ninguna. Para cada escena elige plantilla, escenario, personajes con su acción base,
cámara y ayudas visuales. Las acciones puntuales se anclan a una palabra ("word": "w0012") y ocurren justo cuando
se dice. Los rótulos (label/title) deben ser palabras LITERALES de la narración; las cifras solo si se dicen.
Devuelve SOLO JSON:
{{"scenes": [{{"units": [0, 1], "template": "character_scene", "background": "plaza_layered_01",
  "characters": [{{"id": "pigeon_01", "action": "walk"}}], "camera": {{"shot": "wide", "movement": "slow_push",
  "focus": {{"target": "pigeon_01", "part": "head"}}}}, "beats": [{{"word": "w0003", "action": "look_left", "target": "pigeon_01"}}],
  "overlays": [{{"type": "counter_badge", "word": "w0010", "value": 15, "label": "veces por segundo"}}],
  "highlight": ["w0004"], "transition": "cut", "justification": "La narración dice «paloma» y «plaza»."}}]}}"""


def validate_choices(choices, units, words, bible, lib=None):
    """Valida el JSON del LLM (o de una edición manual). Lanza PlanError."""
    lib = lib or VA.library()
    errs = []
    byid = {w["id"]: w for w in words}
    char_ids = {c["id"]: c for c in bible["characters"]}
    bg_ids = {b["id"] for b in bible["backgrounds"]}
    nxt = 0
    if not isinstance(choices, list) or not choices:
        raise TL.PlanError("el plan no tiene escenas")
    for k, ch in enumerate(choices):
        try:
            a, b = int(ch["units"][0]), int(ch["units"][-1])
        except Exception:
            errs.append(f"escena {k}: units inválido")
            continue
        if a != nxt or b < a or b >= len(units):
            errs.append(f"escena {k}: las unidades deben ser consecutivas y cubrir todo ({a}-{b}, se esperaba empezar en {nxt})")
        nxt = b + 1
        ids_in = set()
        for ui in range(a, min(b, len(units) - 1) + 1):
            ids_in |= set(units[ui].get("word_ids", []))
        narr = {norm_word(byid[i]["text"]) for i in ids_in}
        nums = spoken_numbers(" ".join(byid[i]["text"] for i in ids_in))
        if ch.get("template") not in TEMPLATES:
            errs.append(f"escena {k}: plantilla desconocida {ch.get('template')}")
        if ch.get("background") not in bg_ids:
            errs.append(f"escena {k}: escenario no registrado {ch.get('background')}")
        for c in ch.get("characters", []):
            if c.get("id") not in char_ids:
                errs.append(f"escena {k}: personaje fuera de la biblia {c.get('id')}")
            elif c.get("action", "idle") not in VA.actions_of(char_ids[c["id"]]["asset_id"], lib):
                errs.append(f"escena {k}: acción no permitida {c.get('action')} para {c['id']}")
        cam = ch.get("camera") or {}
        if cam.get("shot", "wide") not in SHOTS or cam.get("movement", "static") not in MOVES:
            errs.append(f"escena {k}: cámara inválida {cam}")
        for bt in ch.get("beats", []):
            if bt.get("word") not in ids_in:
                errs.append(f"escena {k}: acción anclada a una palabra fuera de la escena ({bt.get('word')})")
            t = char_ids.get(bt.get("target"))
            if not t or bt.get("action") not in VA.actions_of(t["asset_id"], lib):
                errs.append(f"escena {k}: acción inválida {bt}")
        for ov in ch.get("overlays", []):
            if ov.get("type") not in OVERLAYS:
                errs.append(f"escena {k}: infografía desconocida {ov.get('type')}")
                continue
            if ov.get("word") and ov["word"] not in ids_in:
                errs.append(f"escena {k}: infografía anclada fuera de la escena")
            for key in ("label", "title", "text"):
                if ov.get(key):
                    bad = [t for t in _toks(ov[key]) if t and t not in narr]
                    if bad:
                        errs.append(f"escena {k}: el rótulo «{ov[key]}» usa palabras no narradas: {bad}")
            if "value" in ov and ov["value"] is not None:
                try:
                    if float(ov["value"]) not in nums:
                        errs.append(f"escena {k}: la cifra {ov['value']} no se dice en la narración")
                except (TypeError, ValueError):
                    errs.append(f"escena {k}: cifra inválida")
        for h in ch.get("highlight", []):
            if h not in ids_in:
                errs.append(f"escena {k}: palabra resaltada fuera de la escena")
        if ch.get("transition", "cut") not in TRANSITIONS:
            errs.append(f"escena {k}: transición desconocida")
    if nxt != len(units):
        errs.append(f"las escenas cubren {nxt} de {len(units)} unidades")
    if errs:
        raise TL.PlanError("; ".join(errs[:10]))
    return True


def llm_choices(units, words, bible, cfg, lib=None, log=print, cancel=None):
    from . import llm

    lib = lib or VA.library()
    byid = {w["id"]: w for w in words}
    tagged = []
    for u in units:
        u2 = dict(u)
        u2["tagged"] = [f"{byid[i]['text']}[{i}]" for i in u.get("word_ids", [])] or ["(silencio)"]
        tagged.append(u2)
    raw = llm.generate(llm_prompt(tagged, bible, cfg, lib), system="Responde solo con JSON válido.", max_tokens=8000,
                       temperature=0.4, cancel=cancel)
    data = llm.parse_json(raw, "object")
    ch = data.get("scenes") if isinstance(data, dict) else None
    validate_choices(ch, units, words, bible, lib)
    return ch


# ------------------------------------------------------------------ ensamblado del plan
def _scene_from_choice(i, ch, units, words, bible, lib):
    byid = {w["id"]: w for w in words}
    a, b = int(ch["units"][0]), int(ch["units"][-1])
    wids = [wid for ui in range(a, b + 1) for wid in units[ui].get("word_ids", [])]
    chars = [dict(c) for c in ch.get("characters", [])]
    bgs = {x["id"]: x for x in bible["backgrounds"]}
    cmap = {c["id"]: c for c in bible["characters"]}
    pmap = {p["id"]: p for p in bible.get("props", [])}
    bg = bgs.get(ch.get("background")) or bgs.get("studio_gradient_01")
    assets = [bg["asset_id"]] + [cmap[c["id"]]["asset_id"] for c in chars if c["id"] in cmap]
    assets += [pmap[p["id"]]["asset_id"] for p in ch.get("props", []) if p.get("id") in pmap]
    assets += [o["type"] for o in ch.get("overlays", [])]
    beats = []
    for bt in ch.get("beats", []):
        w = byid.get(bt.get("word"))
        if w:
            beats.append({"at_s": round(w["start_s"], 3), "word_id": w["id"], "action": bt["action"], "target": bt.get("target")})
    overlays = []
    for ov in ch.get("overlays", []):
        o = dict(ov)
        w = byid.get(ov.get("word"))
        o["at_s"] = round(w["start_s"], 3) if w else None
        if o["type"] == "kinetic_title" and o.get("words"):
            o["text_words"] = [byid[x]["text"] for x in o["words"] if x in byid]
        overlays.append(o)
    cam = dict(ch.get("camera") or {"shot": "wide", "movement": "static"})
    if cam.get("focus_word") in byid:
        cam["focus_at_s"] = round(byid[cam["focus_word"]]["start_s"], 3)
    tmpl = ch.get("template", "character_scene")
    backend = "infographic" if tmpl in ("counter", "kinetic", "document", "compare", "countdown") and not chars else (
        "layered2d" if bg["asset_id"] != "studio_gradient_v1" else "vector2d")
    narr = " ".join(byid[x]["text"] for x in wids)
    names = ", ".join(cmap[c["id"]]["description"] for c in chars if c["id"] in cmap) or "sin personajes"
    vp = f"{tmpl}: {names} en {lib['backgrounds'].get(bg['asset_id'], {}).get('name', bg['asset_id'])}; cámara {cam.get('shot')} {cam.get('movement')}"
    if overlays:
        vp += "; infografía " + ", ".join(o["type"] for o in overlays)
    return {
        "id": scene_id(i), "units": [a, b], "word_ids": wids, "narration_exact": narr,
        "visual_prompt": vp, "visual_justification": ch.get("justification") or "ilustra la frase narrada",
        "template": tmpl, "render_backend": backend, "background_id": bg["id"],
        "layer_order": ["background", "props", "characters", "overlays", "captions"],
        "asset_ids": sorted(set(assets)), "character_ids": [c["id"] for c in chars], "characters": chars,
        "props": [p for p in ch.get("props", []) if p.get("id") in pmap],
        "action_beats": beats, "camera": cam, "overlays": overlays,
        "highlight_word_ids": [h for h in ch.get("highlight", []) if h in byid],
        "transition_in": ch.get("transition", "cut"), "caption_policy": "word_timed",
        "qa_status": "pending", "locked": False, "revision": 1,
        "cut_s": None,
    }


def assemble(choices, units, transcript, audio, cfg, bible, planner, lib=None):
    lib = lib or VA.library()
    words = transcript["words"]
    fps = int(cfg.get("fps") or 30)
    dur = float(audio["duration_s"])
    scenes = [_scene_from_choice(i, ch, units, words, bible, lib) for i, ch in enumerate(choices)]
    for k in range(1, len(scenes)):
        pu, nu = units[scenes[k - 1]["units"][1]], units[scenes[k]["units"][0]]
        if pu.get("word_ids") and nu.get("word_ids"):
            scenes[k]["cut_s"] = TL.cut_between(pu["end_s"], nu["start_s"])
        else:
            scenes[k]["cut_s"] = nu["start_s"] if nu.get("word_ids") else (pu["end_s"] if pu.get("word_ids") else nu["start_s"])
    TL.assign_frames(scenes, dur, fps, min_frames=int(round(float(cfg.get("min_scene_s", 1.0)) * fps)))
    # beats y overlays quedan dentro de su escena (por seguridad tras fundir escenas)
    for s in scenes:
        lo, hi = s["start_frame"] / fps, s["end_frame"] / fps
        s["action_beats"] = [b for b in s["action_beats"] if lo - 1e-6 <= b["at_s"] <= hi + 1e-6]
        for o in s["overlays"]:
            if o.get("at_s") is None or not (lo <= o["at_s"] <= hi):
                o["at_s"] = round(lo + 0.15, 3)
    from .config import FORMATS

    fmt = FORMATS.get(cfg.get("format", "vertical"), FORMATS["vertical"])
    plan = {
        "schema_version": PLAN_SCHEMA_VERSION, "input_mode": "audio", "planner": planner, "created": time.time(),
        "audio": {"source_path": audio.get("original_path"), "master_path": audio.get("master_path"), "duration_s": dur,
                  "sample_rate": audio.get("sample_rate"), "channels": audio.get("channels"), "sha256": audio.get("sha256"),
                  "narration_source": audio.get("narration_source", "original_audio"),
                  "tts_used": audio.get("narration_source") == "tts_script",
                  **({"tts_engine": audio.get("tts_engine")} if audio.get("narration_source") == "tts_script" else {})},
        "video": {"format": cfg.get("format", "vertical"), "fps": fps, "width": fmt["W"], "height": fmt["H"],
                  "frame_count": TL.frame_count(dur, fps)},
        "transcript": {"language": transcript.get("language"), "text": transcript.get("text", ""), "words": words,
                       "needs_review": transcript.get("needs_review", False), "source": transcript.get("source")},
        "visual_bible": bible,
        "captions": {"enabled": cfg.get("captions", "explainer") != "none", "style": "explainer" if cfg.get("captions") in (None, "", "explainer", "karaoke") else cfg.get("captions")},
        "units": [{k: u[k] for k in ("start_s", "end_s", "text", "word_ids")} for u in units],
        "scenes": scenes,
    }
    TL.reassign_words(plan)
    TL.validate_plan(plan, VA.all_ids(lib))
    return plan


def plan_from_transcript(transcript, audio, cfg, log=print, cancel=None, previous_bible=None, use_llm=None):
    """Punto de entrada: transcripción + metadatos de audio → plan validado."""
    lib = VA.library()
    words = transcript["words"]
    dur = float(audio["duration_s"])
    units = TL.units_from_words(words, dur, float(cfg.get("scene_min_s", 2.0)), float(cfg.get("scene_max_s", 6.0)))
    if not units:
        units = TL.ambient_units(dur)
        log("[plan] no hay palabras reconocidas: planos de ambientación (sin inventar narración)")
    bible = build_bible(units, words, cfg, lib, previous_bible)
    planner = "rules"
    choices = None
    want_llm = cfg.get("auto_storyboard", True) if use_llm is None else use_llm
    if want_llm and words and cfg.get("design_characters", True):
        try:  # animales/personas que el catálogo no conoce: el LLM los diseña con parámetros VALIDADOS
            from .creature_design import design_missing

            extra = design_missing(transcript.get("text") or " ".join(w["text"] for w in words), bible, lib, log=log, cancel=cancel)
            for e in extra:
                env = "ocean_under_v1" if (e.get("params") or {}).get("habitat") == "water" else ("sky_v1" if (e.get("params") or {}).get("hover") else None)
                if env:
                    e["env"] = env
                    if not any(b["asset_id"] == env for b in bible["backgrounds"]):
                        bible["backgrounds"].append({"id": env.replace("_v1", "") + "_01", "asset_id": env, "name": "(por defecto)"})
                bible["characters"].append(e)
            if extra:
                _merge_names_into(bible, extra, words)
                log("[plan] personajes nuevos diseñados por el LLM: " + ", ".join(f"{e['name']} ({e['asset_id']})" for e in extra))
        except Exception as e:
            log(f"[plan] sin diseño de personajes por LLM ({str(e)[:160]}); se usa el catálogo")
    if want_llm and any(u.get("word_ids") for u in units):
        try:
            choices = llm_choices(units, words, bible, cfg, lib, log=log, cancel=cancel)
            planner = "llm"
            log(f"[plan] storyboard del LLM validado: {len(choices)} escenas")
        except Exception as e:
            if cfg.get('animation_guidance'):
                raise TL.PlanError('No se pudo aplicar la guía Markdown con Qwen. Revisa el modelo o el plan y reintenta; no se sustituye por un storyboard sin guía.') from e
            log(f"[plan] LLM no disponible o JSON inválido ({str(e)[:220]}); uso el planificador por reglas")
    if choices is None:
        choices = rule_choices(units, words, bible, cfg, lib)
        # fusionar unidades consecutivas idénticas visualmente en escenas de 2-6 s
        choices = merge_similar(choices, units, float(cfg.get("scene_max_s", 6.0)))
    guard_issues = SG.enforce_choices(choices, units, bible, lib, transcript.get("text") or " ".join(w["text"] for w in words))
    if guard_issues:
        log("[coherencia] " + " | ".join(guard_issues[:8]))
    plan = assemble(choices, units, transcript, audio, cfg, bible, planner, lib)
    plan["semantic_guardrail_notes"] = guard_issues
    plan["semantic_qa"] = SG.storyboard_issues(plan)
    plan["choices"] = choices
    return plan


def merge_similar(choices, units, max_s):
    out = []
    for ch in choices:
        if out:
            p = out[-1]
            span = units[ch["units"][1]]["end_s"] - units[p["units"][0]]["start_s"]
            same = (p["template"] == ch["template"] == "character_scene" and p["background"] == ch["background"]
                    and [c["id"] for c in p["characters"]] == [c["id"] for c in ch["characters"]] and not ch["overlays"]
                    and not p.get("camera", {}).get("focus") and not ch.get("camera", {}).get("focus") and span <= max_s * 0.75)
            if same:
                p["units"] = [p["units"][0], ch["units"][1]]
                p["beats"] += ch["beats"]
                p["highlight"] += ch["highlight"]
                p["justification"] += "; " + ch["justification"]
                continue
        out.append(copy.deepcopy(ch))
    return out


# ------------------------------------------------------------------ edición
EDITABLE = {"template", "background_id", "characters", "camera", "overlays", "transition_in", "highlight_word_ids", "visual_prompt",
            "locked", "props"}


def scene_visual_key(plan, scene, extra=""):
    """Clave de caché del clip: SHA-256 del JSON canónico de lo que se dibuja
    (assets + versión/hash, acciones, cámara, formato, fps, motor y palabras
    de subtítulos dentro del rango de la escena)."""
    words = {w["id"]: w for w in plan["transcript"]["words"]}
    fps = plan["video"]["fps"]
    lo, hi = scene["start_frame"] / fps, scene["end_frame"] / fps
    cap = [[w["text"], w["start_s"], w["end_s"]] for w in plan["transcript"]["words"] if w["end_s"] > lo - 3 and w["start_s"] < hi + 0.5]
    vis = {k: scene.get(k) for k in ("id", "template", "render_backend", "background_id", "characters", "props", "action_beats",
                                     "camera", "overlays", "highlight_word_ids", "transition_in", "start_frame", "end_frame")}
    bible = plan["visual_bible"]
    used = {"chars": [c for c in bible["characters"] if c["id"] in scene.get("character_ids", [])],
            "assets": {a: VA.asset_hash(a) for a in scene.get("asset_ids", [])}}
    raw = json.dumps({"v": vis, "u": used, "cap": cap, "caps": plan.get("captions"), "video": plan["video"], "x": extra},
                     sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()


def edit_scene(plan, scene_id_, fields, lib=None):
    """Cambia SOLO lo visual de una escena (nunca tiempos del audio)."""
    lib = lib or VA.library()
    sc = next((s for s in plan["scenes"] if s["id"] == scene_id_), None)
    if not sc:
        raise TL.PlanError("escena no encontrada")
    bad = set(fields) - EDITABLE
    if bad:
        raise TL.PlanError(f"campos no editables: {sorted(bad)} (los tiempos se cambian moviendo cortes)")
    trial = copy.deepcopy(sc)
    trial.update(fields)
    # validación con el mismo contrato que el LLM
    ch = {"units": [0, 0], "template": trial["template"], "background": trial["background_id"],
          "characters": trial.get("characters", []), "camera": {k: v for k, v in (trial.get("camera") or {}).items() if k in ("shot", "movement", "focus")},
          "beats": [], "overlays": [{k: v for k, v in o.items() if k not in ("at_s", "text_words")} for o in trial.get("overlays", [])],
          "highlight": trial.get("highlight_word_ids", []), "transition": trial.get("transition_in", "cut")}
    unit = {"word_ids": sc["word_ids"], "text": sc["narration_exact"]}
    validate_choices([ch], [unit], plan["transcript"]["words"], plan["visual_bible"], lib)
    byid = {w["id"]: w for w in plan["transcript"]["words"]}
    for o in trial.get("overlays", []):
        w = byid.get(o.get("word"))
        o["at_s"] = round(w["start_s"], 3) if w else round(sc["start_s"] + 0.15, 3)
    cmap = {c["id"]: c for c in plan["visual_bible"]["characters"]}
    trial["character_ids"] = [c["id"] for c in trial.get("characters", [])]
    bgs = {b["id"]: b for b in plan["visual_bible"]["backgrounds"]}
    pmap = {p["id"]: p for p in plan["visual_bible"].get("props", [])}
    trial["asset_ids"] = sorted({bgs[trial["background_id"]]["asset_id"]} | {cmap[c]["asset_id"] for c in trial["character_ids"]}
                                | {pmap[p["id"]]["asset_id"] for p in trial.get("props", []) if p.get("id") in pmap}
                                | {o["type"] for o in trial.get("overlays", [])})
    # acciones puntuales de personajes que ya no están en la escena se descartan
    trial["action_beats"] = [b for b in trial.get("action_beats", []) if b.get("target") in trial["character_ids"]]
    trial["revision"] = int(sc.get("revision", 1)) + 1
    trial["qa_status"] = "pending"
    sc.clear()
    sc.update(trial)
    TL.validate_plan(plan, VA.all_ids(lib))
    return sc
