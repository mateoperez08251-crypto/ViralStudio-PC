"""Guionista: escribe la historia completa con un LLM abierto que corre dentro de
ComfyUI (nodo nativo TextGenerate + Qwen3.8 / Qwen3.5) y la convierte en
escenas que el motor de HyperFrames sabe dibujar.

Dos pasadas:
  1) Biblia: título, gancho, reparto (aspecto de cada personaje), capítulos,
     música y metadatos de YouTube.
  2) Escenas por capítulo: narración + plano + escenario + acciones.
"""
import json
import random
import re

from . import comfy_api
from .guidance import apply as apply_guidance, project_guidance
from .config import LANGUAGES, presets, settings

SHOTS = {
    "scene": "personajes actuando en un escenario (chars con action; opcional prop y chip)",
    "closeup": "primer plano dramático de 1 personaje (emoción fuerte)",
    "dialogue": "2 personajes hablando; label = frase corta del bocadillo (opcional)",
    "confront": "héroe contra villano cara a cara (2 chars)",
    "crowd": "multitud (pueblo, ejército, familias); action walk/idle/cheer; count 8-24; chars opcional = protagonista destacado",
    "walk_away": "personaje de espaldas alejándose (melancolía, partida, final)",
    "desk": "personaje escribiendo o investigando en su escritorio con lámpara",
    "travel": "personaje cruzando el escenario caminando o corriendo (viaje, huida)",
    "danger": "una sombra gigante se alza detrás del personaje; creature = reaper|monster|ghost",
    "reveal": "un foco descubre en la oscuridad a un personaje u objeto; label = la revelación (1-3 palabras)",
    "portrait": "retrato enmarcado al presentar a alguien; label = nombre; sub = quién es (2-4 palabras)",
    "year": "calendario que vuela hasta un año; year = número; label = qué pasó (2-5 palabras)",
    "map": "mapa real con zoom al lugar; place, country (en inglés), lat, lon; label = nombre del lugar",
    "number": "cifra gigante que cuenta; number, prefix/suffix, label (2-4 palabras)",
    "chart": "gráfico de barras; items=[{label,value}] 2-5; label = título",
    "versus": "pantalla dividida A contra B / antes y después; items=[{label, prop}] x2",
    "object": "objeto protagonista grande; prop; label (1-4 palabras) opcional",
    "list": "puesto de un top; rank (número), label = título del puesto, prop",
    "quote": "cita textual real; quote, author",
    "timeline": "línea de tiempo; items=[{year,label}] 3-5",
    "montage": "montaje rápido de 3 objetos; items=[{prop,label}]",
    "explosion": "explosión o impacto brutal; prop (bomb por defecto); label opcional",
    "kinetic": "tipografía cinética gigante; lines=[{text, accent}] 2-4 líneas de 1-2 palabras; badge opcional (1 palabra en círculo)",
    "end": "cierre; label = frase final; cta = llamada a la acción",
}
ACTIONS = ["idle", "talk", "walk", "run", "sneak", "point", "shock", "scared", "cheer", "celebrate", "sad", "cry", "think",
           "fight", "angry", "fall", "lie", "kneel", "pray", "hide", "carry", "hold", "wave", "sit", "push", "look_up", "shrug",
           "facepalm", "dance", "jump"]
FACES = ["neutral", "happy", "sad", "angry", "scared", "shocked", "determined", "evil", "smug", "thinking", "calm", "talk", "love"]
ENVS = ["void", "night_city", "city_day", "street", "ghetto", "room", "study", "office", "school", "hospital", "lab", "forest",
        "desert", "sea", "lighthouse", "mountains", "space", "battlefield", "castle", "ancient", "village", "stage", "road", "sky", "cave",
        "church", "prison", "throne", "field"]
PROPS = ["calendar", "clock", "hourglass", "money", "coin", "gold", "diamond", "skull", "crown", "sword", "shield", "book", "scroll",
         "letter", "newspaper", "phone", "computer", "lightbulb", "bomb", "fire", "heart", "broken_heart", "question", "exclamation",
         "rocket", "planet", "globe", "key", "lock", "door", "house", "car", "ship", "plane", "trophy", "medal", "flask", "potion",
         "pill", "syringe", "dna", "brain", "eye", "crystal_ball", "cross", "star", "flag", "map", "bell", "candle", "ring", "coffin",
         "tree", "magnifier", "chain", "handcuffs", "camera", "microphone", "chart_up", "chart_down", "atom", "virus", "bread", "apple",
         "ticket", "suitcase", "baby", "tank", "train", "wall", "moon", "sun", "cloud", "lightning", "arrow_up", "arrow_down", "check",
         "cross_x", "pyramid", "castle", "temple"]
TRANS = ["cut", "flash", "whip", "zoom", "iris", "dip", "glitch", "slide", "fade", "burn"]
SFX = ["none", "impact", "whoosh", "riser", "thunder", "heartbeat", "glitch", "pop", "sparkle"]
MOODS = ["calm", "tension", "fear", "danger", "sad", "hope", "epic", "mystery", "funny"]
CAMS = ["auto", "static", "push_in", "slow_push", "pull_out", "pan_left", "pan_right", "tilt_up", "dutch", "handheld", "crash_zoom", "orbit"]
HELD = ["none", "sword", "torch", "lantern", "baby", "book", "phone", "money", "flag", "staff", "letter"]
HATS = ["none", "fedora", "cap", "crown", "helmet", "hood", "tophat", "wizard", "headscarf", "beret", "halo", "horns"]
HAIR = ["short", "long", "bun", "ponytail", "curly", "spiky", "bald"]
KINDS = ["person", "child", "giant", "robot", "alien", "reaper", "monster", "ghost"]

WPS = {"es": 2.55, "en": 2.6, "pt": 2.5, "fr": 2.6, "de": 2.2, "it": 2.5}


# --------------------------------------------------------------------- LLM
_BACKEND = {"fn": None}


def use_backend(fn):
    """Permite generar con un CLIP/LLM ya cargado (nodos del grafo de ComfyUI)
    en lugar de mandar un flujo a la cola. fn(prompt, system, max_tokens, temperature, seed) -> str"""
    _BACKEND["fn"] = fn


def generate(prompt, system="", max_tokens=4096, temperature=None, seed=None, cancel=None, tick=None):
    system = apply_guidance(system)
    s = settings()
    if _BACKEND["fn"]:
        return _BACKEND["fn"](prompt, system, max_tokens, float(temperature if temperature is not None else s.get("llm_temperature", 0.85)),
                              int(seed if seed is not None else random.randint(1, 2**31)))
    model = s.get("llm_model")
    available = comfy_api.list_models("text_encoders")
    if model not in available:
        fb = s.get("llm_fallback")
        model = fb if fb in available else next((m for m in available if "qwen3.8" in m.lower() or "qwen3.5" in m.lower()), None)
        if not model:
            from .errors import VSError

            raise VSError("MODEL_UNAVAILABLE", f"No está instalado el LLM ({s.get('llm_model')}). Ejecuta la instalación o pega tu propio guion.")
    wf = {
        "1": {"class_type": "CLIPLoader", "inputs": {"clip_name": model, "type": "stable_diffusion", "device": "default"}},
        "2": {"class_type": "TextGenerate", "inputs": {
            "clip": ["1", 0], "prompt": prompt, "max_length": int(max_tokens),
            "sampling_mode": "on",
            "sampling_mode.temperature": float(temperature if temperature is not None else s.get("llm_temperature", 0.85)),
            "sampling_mode.top_k": 40, "sampling_mode.top_p": 0.92, "sampling_mode.min_p": 0.03,
            "sampling_mode.repetition_penalty": 1.05, "sampling_mode.seed": int(seed if seed is not None else random.randint(1, 2**31)),
            "sampling_mode.presence_penalty": 0.15,
            "thinking": bool(s.get("llm_thinking", False)), "use_default_template": True, "mtp": "auto",
            "system_prompt": system,
        }},
        "3": {"class_type": "PreviewAny", "inputs": {"source": ["2", 0]}},
    }
    out = comfy_api.run(wf, timeout=3600, cancel=cancel, tick=tick)
    txt = ""
    for node in out.values():
        for v in (node.get("text") or []):
            txt = v if isinstance(v, str) else txt
    return txt


# --------------------------------------------------------------------- JSON robusto
def parse_json(txt, want="object"):
    if not txt:
        raise ValueError("respuesta vacía del modelo")
    t = txt.strip()
    t = re.sub(r"^```(?:json)?|```$", "", t, flags=re.M).strip()
    t = t.replace("“", '"').replace("”", '"').replace("„", '"')
    o, c = ("{", "}") if want == "object" else ("[", "]")
    a = t.find(o)
    if a < 0:
        raise ValueError("no hay JSON en la respuesta")
    depth, end, ins, esc = 0, None, False, False
    for i in range(a, len(t)):
        ch = t[i]
        if ins:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                ins = False
            continue
        if ch == '"':
            ins = True
        elif ch in "{[":
            depth += 1
        elif ch in "}]":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    body = t[a:end] if end else t[a:] + c * max(1, depth)
    body = re.sub(r",\s*([}\]])", r"\1", body)
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        body2 = re.sub(r"(?<=[{,])\s*([A-Za-z_][\w]*)\s*:", r'"\1":', body)  # claves sin comillas
        body2 = re.sub(r"'", '"', body2) if body2.count('"') < 4 else body2
        return json.loads(body2)


# --------------------------------------------------------------------- prompts
def _style_line(vt, style):
    return f"Tipo de video: {vt.get('name')}. Estilo visual: {style.get('name')} — {style.get('desc', '')}"


SYSTEM = (
    "Eres el mejor guionista de canales virales de YouTube y TikTok del mundo, experto en retención: "
    "ganchos brutales en el primer segundo, bucles abiertos, frases cortas con ritmo, giros constantes y finales que obligan a comentar. "
    "Escribes historias verídicas cuando el tema es real (fechas, lugares y cifras exactas; nunca inventas datos históricos) y "
    "ficción memorable cuando el tema es ficticio. Respondes SOLO con JSON válido, sin texto adicional."
)


def bible_prompt(cfg, P):
    vt = P["video_types"].get(cfg["video_type"], {})
    style = P["styles"].get(cfg["style"], {})
    lang = LANGUAGES.get(cfg.get("language", "es"), LANGUAGES["es"])["name"]
    dur = int(cfg["duration"])
    short = dur <= 90
    nch = 1 if dur <= 60 else max(2, min(14, round(dur / 70)))
    words = int(dur * WPS.get(cfg.get("language", "es"), 2.5))
    return f"""Crea la BIBLIA de un video {('SHORT vertical' if cfg.get('format') == 'vertical' else 'horizontal para YouTube')} de unos {dur} segundos (~{words} palabras de narración en total).
TEMA: {cfg['topic']}
{_style_line(vt, style)}
Guía del género: {vt.get('guide', '')}
Idioma de toda la narración y textos: {lang}.
Instrucciones extra del creador: {cfg.get('extra') or 'ninguna'}

Estructura narrativa obligatoria ({'short' if short else 'largo'}):
{'- Gancho (0-3 s) brutal → contexto mínimo → escalada → giro → payoff → final que conecta con el inicio (loop).' if short else '- Gancho (primeros 8 s) con la promesa del video → contexto → escalada por capítulos, cada capítulo termina con un mini-cliffhanger → giro principal al 70% → clímax → resolución → reflexión final y llamada a comentar.'}

Devuelve este JSON (exactamente estas claves):
{{
 "title": "título viral (máx 70 caracteres, sin clickbait falso)",
 "hook": "la primera frase exacta que dirá el narrador (máx 14 palabras, tiene que detener el scroll)",
 "logline": "la historia en una frase",
 "cast": {{
   "<id_corto_sin_espacios>": {{"name": "Nombre", "kind": "person|child|giant|robot|alien|reaper|monster|ghost", "gender": "m|f",
     "hair": "{'|'.join(HAIR)}", "hairCol": "#hex", "outfit": "#hex color de ropa", "dress": false, "hat": "{'|'.join(HATS)}",
     "beard": false, "glasses": false, "cape": false, "held": "{'|'.join(HELD)}", "villain": false}}
 }},
 "chapters": [{{"title": "título del capítulo", "summary": "qué pasa (2-3 frases con datos concretos)", "seconds": número}}],
 "music": "descripción en inglés de la música de fondo (género, instrumentos, tempo, emoción), instrumental",
 "youtube": {{"title": "...", "description": "descripción SEO de 3-5 líneas con hashtags al final", "tags": ["..."]}},
 "thumbnail_text": "2-4 palabras gigantes para la miniatura"
}}
Reglas: entre 1 y 5 personajes con colores de ropa distintos y coherentes con la época; exactamente {nch} capítulo(s); la suma de "seconds" ≈ {dur}."""


def scenes_prompt(cfg, P, bible, ch_idx, prev_tail):
    vt = P["video_types"].get(cfg["video_type"], {})
    style = P["styles"].get(cfg["style"], {})
    lang = LANGUAGES.get(cfg.get("language", "es"), LANGUAGES["es"])["name"]
    ch = bible["chapters"][ch_idx]
    secs = float(ch.get("seconds") or cfg["duration"])
    short = cfg.get("format") == "vertical" or cfg["duration"] <= 90
    wps = WPS.get(cfg.get("language", "es"), 2.5)
    words = int(secs * wps)
    per = (6, 12) if short else (9, 18)
    n_sc = max(2, round(words / ((per[0] + per[1]) / 2)))
    cast = ", ".join(f"{k} ({v.get('name')})" for k, v in (bible.get("cast") or {}).items()) or "ninguno"
    first = ch_idx == 0
    last = ch_idx == len(bible["chapters"]) - 1
    shots = "\n".join(f"  - {k}: {v}" for k, v in SHOTS.items())
    pref = ", ".join(vt.get("shots", [])) or "scene, closeup"
    return f"""Escribe las ESCENAS del capítulo {ch_idx + 1}/{len(bible['chapters'])} "{ch.get('title')}" del video "{bible.get('title')}".
Resumen del capítulo: {ch.get('summary')}
Logline: {bible.get('logline')}
{_style_line(vt, style)}
Personajes (usa estos ids en "who"): {cast}
Idioma de la narración: {lang}. Duración del capítulo: ~{int(secs)} s → ~{words} palabras repartidas en ~{n_sc} escenas de {per[0]}-{per[1]} palabras.
{('La PRIMERA escena dice exactamente el gancho: "' + bible.get('hook', '') + '" y debe ser visualmente impactante (closeup, danger, kinetic, number o explosion).') if first else ('Continúa justo después de: "' + prev_tail + '"')}
{'La ÚLTIMA escena es un cierre potente con pregunta al espectador o llamada a comentar (shot end o kinetic).' if last else 'Termina el capítulo con un mini-cliffhanger que obligue a seguir viendo.'}

ESTILO DE NARRACIÓN: frases cortas y contundentes, presente dramático, segunda persona cuando ayude ("Imagina…"), datos concretos,
giros con "Pero…", "Nadie sabía que…", preguntas retóricas. Marca entre *asteriscos* 1-2 palabras clave por escena (se resaltan en color).
Nada de "en este video", ni saludos. Cada escena = una idea visual distinta.

PLANOS disponibles (campo "shot"); prefiere: {pref}
{shots}
Escenarios ("env"): {', '.join(ENVS)}
Acciones ("action"): {', '.join(ACTIONS)}
Caras ("face"): {', '.join(FACES)}
Objetos ("prop"): {', '.join(PROPS)}
Transiciones ("trans"): {', '.join(TRANS)}  · Efectos ("sfx"): {', '.join(SFX)}  · "mood": {', '.join(MOODS)}  · "time": day|dusk|night
Clima ("weather"): none|rain|storm|snow|fog|dust|embers|fire|stars|sunrays · "travel" de un personaje: in_left|in_right|out_left|out_right|across

Devuelve SOLO un array JSON. Cada escena:
{{"narration": "texto que dirá el narrador", "shot": "...", "env": "...", "time": "night", "weather": "none", "mood": "tension",
 "chars": [{{"who": "id", "action": "walk", "face": "determined", "travel": "in_left"}}], "prop": null, "label": null, "chip": null,
 "trans": "cut", "sfx": "none"}}
y añade los campos propios del plano (year, place, country, lat, lon, number, prefix, suffix, items, quote, author, rank, lines, badge, creature, count, cta, sub).
FIDELIDAD (obligatorio): lo que se ve debe corresponder a lo que se narra en ESA escena. Nunca añadas mapas, años, cifras, personas,
soldados, armas o textos que la narración no mencione. Usa "map" solo si la narración nombra un lugar, "year" solo si dice el año,
"number" solo si dice la cifra, "danger" solo si habla de muerte, miedo o amenaza. Prohibido el mapa de introducción por defecto
y los planos de relleno. Añade a cada escena "visual_justification": por qué esa imagen representa esa frase (máx 15 palabras).
Reglas visuales: alterna tipos de plano (nunca 3 iguales seguidos), usa "chip" (lugar · año) al cambiar de lugar o época,
transición "flash" o sfx "impact" en los golpes, "whip" en cambios rápidos; los textos en pantalla (label, lines) NO repiten la narración palabra por palabra."""


# --------------------------------------------------------------------- normalización
def _pick(v, allowed, default):
    v = (str(v).strip().lower() if v is not None else "")
    return v if v in allowed else default


def normalize_bible(b, cfg):
    b = dict(b or {})
    b.setdefault("title", cfg["topic"][:70])
    b.setdefault("hook", "")
    cast = {}
    for k, v in list((b.get("cast") or {}).items())[:6]:
        key = re.sub(r"[^a-z0-9_]", "", str(k).lower()) or f"c{len(cast)}"
        v = dict(v or {})
        look = {"name": v.get("name") or k}
        kind = _pick(v.get("kind"), KINDS, "person")
        if kind != "person":
            look["kind"] = kind
        if v.get("gender") == "f" and not v.get("hair"):
            v["hair"] = "bun"
        look["hair"] = _pick(v.get("hair"), HAIR, "short")
        for c in ("hairCol", "outfit"):
            if isinstance(v.get(c), str) and re.match(r"^#[0-9a-fA-F]{6}$", v[c]):
                look[c] = v[c]
        for flag in ("dress", "beard", "glasses", "cape", "villain"):
            if v.get(flag) in (True, "true", 1):
                look[flag] = True
        if v.get("gender") == "f" and v.get("dress") is None:
            look["dress"] = True
        hat = _pick(v.get("hat"), HATS, "none")
        if hat != "none":
            look["hat"] = hat
        held = _pick(v.get("held"), HELD, "none")
        if held != "none":
            look["held"] = held
        cast[key] = look
    b["cast"] = cast
    chs = [c for c in (b.get("chapters") or []) if isinstance(c, dict)] or [{"title": b["title"], "summary": b.get("logline", cfg["topic"]), "seconds": cfg["duration"]}]
    tot = sum(float(c.get("seconds") or 0) for c in chs) or 1
    for c in chs:
        c["seconds"] = max(8.0, float(c.get("seconds") or cfg["duration"] / len(chs)) * cfg["duration"] / tot)
    b["chapters"] = chs
    b.setdefault("music", "")
    b.setdefault("youtube", {"title": b["title"], "description": b.get("logline", ""), "tags": []})
    return b


def normalize_scene(s, cast, i):
    s = dict(s or {})
    out = {"narration": str(s.get("narration") or "").strip()}
    out["shot"] = _pick(s.get("shot"), SHOTS, "scene")
    out["env"] = str(s.get("env") or "void").lower()
    out["time"] = _pick(s.get("time"), ["day", "dusk", "night", "dawn"], "night")
    w = _pick(s.get("weather"), ["none", "rain", "storm", "snow", "fog", "dust", "embers", "fire", "stars", "sunrays"], "none")
    if w != "none":
        out["weather"] = w
    m = _pick(s.get("mood"), MOODS, "")
    if m:
        out["mood"] = m
    out["trans"] = _pick(s.get("trans"), TRANS, "cut")
    sfx = _pick(s.get("sfx"), SFX, "none")
    if sfx != "none":
        out["sfx"] = sfx
    cam = _pick(s.get("cam"), CAMS, "auto")
    if cam != "auto":
        out["cam"] = cam
    chars = []
    for c in (s.get("chars") or [])[:4]:
        if not isinstance(c, dict):
            continue
        cc = {}
        who = re.sub(r"[^a-z0-9_]", "", str(c.get("who") or "").lower())
        if who in cast:
            cc["who"] = who
        cc["action"] = _pick(c.get("action"), ACTIONS, "idle")
        f = _pick(c.get("face"), FACES, "")
        if f:
            cc["face"] = f
        tv = _pick(c.get("travel"), ["in_left", "in_right", "out_left", "out_right", "across", "across_left"], "")
        if tv:
            cc["travel"] = tv
        if not cc.get("who") and isinstance(c.get("look"), dict):
            cc["look"] = c["look"]
        chars.append(cc)
    if chars:
        out["chars"] = chars
    for k in ("label", "chip", "sub", "quote", "author", "badge", "cta", "place", "country", "prefix", "suffix", "creature", "variant", "visual_justification"):
        if s.get(k) not in (None, "", "null"):
            out[k] = str(s[k])[:140]
    if s.get("prop"):
        out["prop"] = str(s["prop"]).lower()
    for k in ("year", "rank", "count"):
        try:
            if s.get(k) is not None:
                out[k] = int(float(str(s[k]).replace(".", "").replace(",", "")[:9])) if k != "count" else int(s[k])
        except Exception:
            pass
    if s.get("number") is not None:
        out["number"] = str(s["number"])[:24]
    for k in ("lat", "lon"):
        try:
            if s.get(k) is not None:
                out[k] = float(s[k])
        except Exception:
            pass
    for k in ("items", "lines"):
        if isinstance(s.get(k), list):
            out[k] = s[k][:6]
    if out["shot"] == "kinetic" and not out.get("lines"):
        txt = out.get("label") or re.sub(r"\*", "", out["narration"])
        ws = txt.split()[:6]
        out["lines"] = [{"text": " ".join(ws[j:j + 2]), "accent": j == 2} for j in range(0, len(ws), 2)]
    if out["shot"] == "map" and ("lat" not in out or "lon" not in out) and not out.get("country"):
        out["shot"] = "scene"
    if out["shot"] == "year" and "year" not in out:
        out["shot"] = "scene"
    if out["shot"] == "number" and not out.get("number"):
        out["shot"] = "object" if out.get("prop") else "scene"
    if out["shot"] in ("scene", "closeup", "walk_away", "desk", "travel", "dialogue", "confront") and not chars:
        first = next(iter(cast), None)
        if first:
            out["chars"] = [{"who": first, "action": "idle" if out["shot"] != "travel" else "walk"}]
    out["id"] = f"s{i:03d}"
    return out


def vary(scenes):
    """Evita 3 planos iguales seguidos y alterna cámaras/transiciones."""
    for i in range(2, len(scenes)):
        if scenes[i]["shot"] == scenes[i - 1]["shot"] == scenes[i - 2]["shot"] and scenes[i]["shot"] == "scene":
            scenes[i]["shot"] = "closeup" if scenes[i].get("chars") else "object"
    return scenes


# --------------------------------------------------------------------- orquestación
@project_guidance
def write_story(cfg, log=print, progress=None, cancel=None):
    P = presets()
    seed = cfg.get("seed") or random.randint(1, 2**31)
    if progress:
        progress(0.02, "Creando la biblia de la historia…")
    raw = generate(bible_prompt(cfg, P), system=SYSTEM, max_tokens=3000, seed=seed, cancel=cancel,
                   tick=lambda t: progress and progress(min(0.15, 0.02 + t / 600), f"Pensando la historia… {int(t)}s"))
    log("[llm] biblia: " + raw[:400].replace("\n", " "))
    try:
        bible = normalize_bible(parse_json(raw, "object"), cfg)
    except Exception as e:
        log(f"[llm] biblia inválida ({e}); reintento")
        raw = generate(bible_prompt(cfg, P) + "\n\nIMPORTANTE: responde SOLO con el objeto JSON.", system=SYSTEM, max_tokens=3000, seed=seed + 1, cancel=cancel)
        bible = normalize_bible(parse_json(raw, "object"), cfg)
    scenes, tail = [], ""
    n = len(bible["chapters"])
    for ci in range(n):
        if progress:
            progress(0.15 + 0.8 * ci / n, f"Escribiendo capítulo {ci + 1}/{n}: {bible['chapters'][ci].get('title', '')}")
        prompt = scenes_prompt(cfg, P, bible, ci, tail)
        arr = None
        for attempt in range(3):
            raw = generate(prompt, system=SYSTEM, max_tokens=6000, seed=seed + 10 + ci * 7 + attempt, cancel=cancel,
                           tick=lambda t, ci=ci: progress and progress(min(0.95, 0.15 + 0.8 * (ci + min(0.9, t / 240)) / n), f"Escribiendo capítulo {ci + 1}/{n}… {int(t)}s"))
            try:
                arr = parse_json(raw, "array")
                if isinstance(arr, dict):
                    arr = arr.get("scenes") or next((v for v in arr.values() if isinstance(v, list)), [])
                arr = [a for a in arr if isinstance(a, dict) and a.get("narration")]
                if arr:
                    break
            except Exception as e:
                log(f"[llm] capítulo {ci + 1} intento {attempt + 1} inválido: {e}")
                prompt += "\n\nIMPORTANTE: responde SOLO con el array JSON, sin comentarios."
        if not arr:
            raise RuntimeError(f"El modelo no devolvió escenas válidas para el capítulo {ci + 1}")
        for a in arr:
            sc = normalize_scene(a, bible["cast"], len(scenes) + 1)
            sc["chapter"] = ci
            scenes.append(sc)
        tail = scenes[-1]["narration"][-160:]
    scenes = vary(scenes)
    from .fidelity import check_story

    scenes, rep = check_story(scenes, bible["cast"], bible.get("chapters"))
    bible["fidelity"] = rep
    if rep["issues"]:
        log(f"[fidelidad] {rep['issues']} elemento(s) sin justificación corregidos; mapas: {rep['maps']}")
    if progress:
        progress(1.0, f"Guion listo: {len(scenes)} escenas")
    return bible, scenes


@project_guidance
def rewrite_scene(cfg, bible, scenes, idx, instruction, cancel=None):
    """Reescribe una escena concreta siguiendo una instrucción del usuario."""
    P = presets()
    sc = scenes[idx]
    ctx = " / ".join(s["narration"] for s in scenes[max(0, idx - 2): idx + 3])
    prompt = (f"Contexto del video '{bible.get('title')}': {ctx}\n\nReescribe SOLO esta escena siguiendo la instrucción: {instruction}\n"
              f"Escena actual: {json.dumps(sc, ensure_ascii=False)}\nPersonajes: {list((bible.get('cast') or {}).keys())}\n"
              f"Planos válidos: {', '.join(SHOTS)}. Devuelve SOLO el objeto JSON de la escena.")
    raw = generate(prompt, system=SYSTEM, max_tokens=1200, cancel=cancel)
    new = normalize_scene(parse_json(raw, "object"), bible.get("cast") or {}, idx + 1)
    new["id"] = sc["id"]
    new["chapter"] = sc.get("chapter", 0)
    return new


@project_guidance
def visualize_script(cfg, log=print, progress=None, cancel=None):
    """Reparte el guion del usuario en escenas SIN cambiar sus palabras y decide
    los planos. Si el modelo altera el texto, se rechaza (fidelidad)."""
    P = presets()
    text = cfg["script"].strip()
    vt = P["video_types"].get(cfg["video_type"], {})
    style = P["styles"].get(cfg["style"], {})
    shots = "\n".join(f"  - {k}: {v}" for k, v in SHOTS.items())
    prompt = f"""Este es el guion EXACTO de un video. Divídelo en escenas de 6-18 palabras copiando el texto LITERALMENTE
(mismas palabras, mismo orden, sin añadir ni quitar nada; puedes marcar 1-2 palabras clave por escena con *asteriscos*).
{_style_line(vt, style)}
GUION (entre <<< y >>>):
<<<{text}>>>

Primero define el reparto (personajes que aparecen en el guion) y luego las escenas.
Planos disponibles:
{shots}
Escenarios: {', '.join(ENVS)} · Acciones: {', '.join(ACTIONS)} · Objetos: {', '.join(PROPS)}
FIDELIDAD: solo lo que el guion dice. Mapa solo si nombra un lugar, año solo si dice el año, cifra solo si la dice.
Devuelve SOLO JSON: {{"title": "...", "cast": {{"id": {{"name": "...", "gender": "m|f", "hair": "...", "outfit": "#hex", "hat": "none"}}}},
"scenes": [{{"narration": "...", "shot": "...", "env": "...", "time": "night", "mood": "tension", "chars": [{{"who": "id", "action": "..."}}],
"prop": null, "label": null, "visual_justification": "..."}}]}}"""
    if progress:
        progress(0.1, "Repartiendo tu guion en escenas…")
    raw = generate(prompt, system=SYSTEM, max_tokens=8000, cancel=cancel)
    data = parse_json(raw, "object")
    bible = normalize_bible({"title": data.get("title") or cfg.get("topic"), "cast": data.get("cast") or {}}, cfg)
    scenes = [normalize_scene(s, bible["cast"], i + 1) for i, s in enumerate(data.get("scenes") or []) if isinstance(s, dict)]
    from .textutil import norm_word, strip_emphasis as _se

    a = [norm_word(w) for w in _se(text).split()]
    b = [norm_word(w) for s in scenes for w in _se(s["narration"]).split()]
    if a != b:
        raise ValueError("el modelo cambió palabras del guion; se usa el reparto por palabras clave")
    return bible, vary(scenes)
