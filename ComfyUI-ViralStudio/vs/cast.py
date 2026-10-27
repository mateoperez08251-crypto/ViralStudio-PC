"""Reparto a partir del TEXTO (guion o transcripción): roles, género y nombres propios.

  · role_of(tok): «médico», «reina», «bombero»… → (rol, aspecto del rig de persona, género).
  · gender_of(tok, prev): artículo («la policía» / «el policía») o terminación del rol.
  · find_names(words): nombres propios en mayúscula fuera de inicio de frase («Pedro», «Luna»)
    y a qué personaje nombrado cerca se refieren («Luna, la perra» → la perra se llama Luna).
Todo es determinista y sin red; el usuario puede editar la biblia después.
"""
from .textutil import norm_word

# rol → aspecto (claves que entiende engine/62 PER.pal: hat, coat, cape, glasses, beard, tie, badge, stetho,
# apron, shirt, pants, hair, hairColor) y variante por defecto
ROLES = [
    ({"medico", "medicos", "doctor", "doctores", "enfermero", "enfermeros", "cirujano", "cirujanos", "pediatra", "dentista", "veterinario", "nurse", "surgeon", "dentist", "vet"},
     "doctor", {"coat": "#f6f8fa", "shirt": "#7ab0d8", "pants": "#3a4a6a", "stetho": True}),
    ({"medica", "medicas", "doctora", "doctoras", "enfermera", "enfermeras", "cirujana", "veterinaria"},
     "doctor_f", {"coat": "#f6f8fa", "shirt": "#7ab0d8", "pants": "#3a4a6a", "stetho": True, "hair": "long"}),
    ({"cientifico", "cientificos", "investigador", "investigadores", "quimico", "fisico", "biologo", "inventor", "scientist", "researcher", "chemist", "inventor"},
     "scientist", {"coat": "#f6f8fa", "glasses": True, "shirt": "#8a8aa0", "pants": "#3a3a48"}),
    ({"cientifica", "cientificas", "investigadora", "investigadoras", "quimica", "fisica", "biologa", "inventora"},
     "scientist_f", {"coat": "#f6f8fa", "glasses": True, "shirt": "#a07ab8", "pants": "#3a3a48", "hair": "long"}),
    ({"policia", "policias", "agente", "agentes", "sheriff", "police", "policeman", "officer", "cop", "cops"},
     "police", {"hat": "police", "shirt": "#2a3a6a", "pants": "#1d2440", "badge": True}),
    ({"detective", "detectives", "inspector", "inspectora", "espia"},
     "detective", {"hat": "fedora", "coat": "#a8865a", "shirt": "#e8e2d4", "tie": "#7a2a2a"}),
    ({"bombero", "bomberos", "bombera", "firefighter", "firefighters", "fireman"},
     "firefighter", {"hat": "fire", "shirt": "#c8322a", "pants": "#2a2a2e"}),
    ({"rey", "reyes", "emperador", "faraon", "king", "kings", "emperor", "pharaoh"},
     "king", {"hat": "crown", "cape": "#b8222a", "shirt": "#6a2a8a", "pants": "#3a2a4a", "beard": "#8a6a4a"}),
    ({"reina", "reinas", "emperatriz", "queen", "queens", "empress"},
     "queen", {"hat": "crown", "cape": "#7a2ab8", "shirt": "#c86ab8", "pants": "#6a2a6a", "hair": "long"}),
    ({"principe", "principes", "prince"}, "prince", {"hat": "tiara", "cape": "#2a5ab8", "shirt": "#f2f2f2", "pants": "#2a3a6a"}),
    ({"princesa", "princesas", "princess"}, "princess", {"hat": "tiara", "shirt": "#f28ab8", "pants": "#c86a9a", "hair": "long"}),
    ({"soldado", "soldados", "militar", "militares", "guerrero", "guerreros", "caballero", "caballeros", "soldier", "soldiers", "warrior", "knight"},
     "soldier", {"hat": "helmet", "shirt": "#5a6a3a", "pants": "#4a5a32"}),
    ({"granjero", "granjeros", "granjera", "campesino", "campesinos", "campesina", "agricultor", "agricultora", "farmer", "farmers"},
     "farmer", {"hat": "straw", "shirt": "#c8322a", "pants": "#3a5a8a"}),
    ({"vaquero", "vaqueros", "cowboy", "cowboys"}, "cowboy", {"hat": "cowboy", "shirt": "#c8862a", "pants": "#2a3a6a"}),
    ({"chef", "cocinero", "cocineros", "cocinera", "panadero", "panadera", "cook", "baker"},
     "chef", {"hat": "chef", "shirt": "#ffffff", "apron": "#f4f4f4", "pants": "#2a2a2e"}),
    ({"astronauta", "astronautas", "cosmonauta", "astronaut", "astronauts"},
     "astronaut", {"hat": "astronaut", "shirt": "#eef0f4", "pants": "#d8dce4", "badge": True}),
    ({"pirata", "piratas", "pirate", "pirates"}, "pirate", {"hat": "pirate", "beard": "#3a2a1a", "shirt": "#f4f0e4", "pants": "#3a2a2a"}),
    ({"maestro", "maestros", "profesor", "profesores", "teacher", "teachers", "professor"},
     "teacher", {"glasses": True, "shirt": "#7a5a8a", "tie": "#a83a3a", "pants": "#3a3440"}),
    ({"maestra", "maestras", "profesora", "profesoras"}, "teacher_f", {"glasses": True, "shirt": "#b85a6a", "pants": "#3a3440", "hair": "long"}),
    ({"estudiante", "estudiantes", "alumno", "alumnos", "alumna", "alumnas", "student", "students", "pupil"},
     "student", {"shirt": "#4a8ad8", "pants": "#2a3a6a"}),
    ({"graduado", "graduada", "graduados", "graduate"}, "graduate", {"hat": "graduation", "shirt": "#1d1d22", "pants": "#1d1d22"}),
    ({"obrero", "obreros", "obrera", "constructor", "albanil", "albaniles", "ingeniero", "ingenieros", "ingeniera", "builder", "worker", "engineer"},
     "builder", {"hat": "hardhat", "shirt": "#f2a22a", "pants": "#3a5a8a"}),
    ({"deportista", "deportistas", "futbolista", "futbolistas", "jugador", "jugadores", "jugadora", "atleta", "atletas", "athlete", "player", "footballer"},
     "athlete", {"shirt": "#e2322a", "pants": "#f4f4f4"}),
    ({"mago", "magos", "hechicero", "brujo", "wizard", "wizards", "sorcerer"}, "wizard", {"hat": "witch", "hatC": "#2a3a8a", "cape": "#2a3a8a", "beard": "#e8e8e8", "shirt": "#3a4a9a"}),
    ({"bruja", "brujas", "hechicera", "witch", "witches"}, "witch", {"hat": "witch", "cape": "#3a2a5a", "shirt": "#3a2a5a", "hair": "long"}),
    ({"cartero", "cartera", "mensajero", "postman", "mailman"}, "postman", {"hat": "cap", "hatC": "#2a5ab8", "shirt": "#3a6ab8", "pants": "#2a3a6a"}),
    ({"piloto", "pilotos", "aviador", "aviadora", "pilot", "pilots", "captain", "capitan"}, "pilot", {"hat": "pilot", "shirt": "#f4f4f4", "tie": "#1d2440", "pants": "#1d2440"}),
    ({"presidente", "presidenta", "empresario", "empresaria", "jefe", "jefa", "abogado", "abogada", "politico", "politica", "banquero", "ministro",
      "ministra", "director", "directora", "alcalde", "alcaldesa", "gobernador", "gobernadora", "president", "boss", "lawyer", "businessman",
      "businesswoman", "ceo", "mayor"},
     "suit", {"shirt": "#2a2e3a", "tie": "#a8322a", "pants": "#2a2e3a"}),
    ({"superheroe", "superheroes", "heroe", "heroes", "heroina", "superhero", "hero"}, "hero", {"cape": "#d8322a", "shirt": "#2a5ad8", "pants": "#2a3a8a"}),
    ({"abuelo", "abuelos", "anciano", "ancianos", "grandpa", "grandfather", "oldman"}, "grandpa", {"hairColor": "#dcdcdc", "glasses": True, "beard": "#dcdcdc", "shirt": "#6b7f5a"}),
    ({"abuela", "abuelas", "anciana", "ancianas", "grandma", "grandmother"}, "grandma", {"hairColor": "#e4e4e4", "glasses": True, "hair": "bun", "shirt": "#a86a8a"}),
    ({"bebe", "bebes", "baby", "babies"}, "baby", {"shirt": "#f2c8d8", "pants": "#f2c8d8"}),
]
_ROLE_IDX = {}
for _kws, _rid, _look in ROLES:
    for _k in _kws:
        _ROLE_IDX.setdefault(_k, (_rid, _look))

# palabras de persona → variante del rig (edad/género)
VARIANT_WORDS = {"nino": "child", "nina": "child", "ninos": "child", "ninas": "child", "chico": "child", "chica": "woman", "kid": "child",
                 "boy": "child", "girl": "child", "bebe": "child", "baby": "child", "nieto": "child", "nieta": "child", "hijo": "child", "hija": "child",
                 "mujer": "woman", "mujeres": "woman", "senora": "woman", "madre": "woman", "mama": "woman", "esposa": "woman", "hermana": "woman",
                 "amiga": "woman", "tia": "woman", "woman": "woman", "women": "woman", "mother": "woman", "lady": "woman",
                 "hombre": "man", "hombres": "man", "senor": "man", "padre": "man", "papa": "man", "esposo": "man", "hermano": "man", "amigo": "man",
                 "tio": "man", "man": "man", "men": "man", "father": "man",
                 "abuelo": "elder", "abuela": "elder", "anciano": "elder", "anciana": "elder", "grandpa": "elder", "grandma": "elder"}
FEMALE_ROLES = {"doctor_f", "scientist_f", "queen", "princess", "teacher_f", "witch", "grandma"}
FEM_ARTICLES = {"la", "una", "las", "unas", "esta", "esa", "aquella", "nuestra"}
MASC_ARTICLES = {"el", "un", "los", "unos", "este", "ese", "aquel", "nuestro", "del", "al"}
PERSON_EXTRA_KEYWORDS = sorted(set(_ROLE_IDX) | set(VARIANT_WORDS))


def role_of(tok):
    """(rol, aspecto) de una palabra, o (None, {})."""
    r = _ROLE_IDX.get(norm_word(tok))
    return (r[0], dict(r[1])) if r else (None, {})


def variant_of(tok, prev=None, role=None):
    """Variante del rig de persona: edad/género por la palabra, el rol o el artículo anterior."""
    n = norm_word(tok)
    if n in VARIANT_WORDS:
        return VARIANT_WORDS[n]
    if role in ("grandpa", "grandma"):
        return "elder"
    if role == "baby":
        return "child"
    p = norm_word(prev or "")
    if role in FEMALE_ROLES or p in FEM_ARTICLES:
        return "woman"
    if p in MASC_ARTICLES:
        return "man"
    if role and n.endswith("a") and not n.endswith(("ista", "eta", "ta")):  # «doctora», «granjera»
        return "woman"
    return "man"


COMMON_CAPS = {"el", "la", "los", "las", "un", "una", "y", "pero", "entonces", "luego", "despues", "cuando", "mientras", "si", "no", "en",
               "de", "a", "por", "para", "con", "sin", "hoy", "ayer", "manana", "este", "esta", "ese", "esa", "aquel", "aqui", "alli", "asi",
               "ademas", "tambien", "nadie", "todos", "todas", "cada", "otro", "otra", "dios", "senor", "senora", "the", "a", "and", "but", "then",
               "when", "while", "in", "on", "it", "he", "she", "they", "we", "i", "you", "this", "that", "there", "here", "one", "de", "dia",
               "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo", "enero", "febrero", "marzo", "abril", "mayo", "junio",
               "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre", "sabias", "imagina", "mira", "fijate", "oye", "hola",
               "tierra", "planeta", "universo", "oceano", "cielo", "sol"}


# lo que suele seguir al SUJETO al inicio de frase: «Pedro corre», «Luna lo mira», «Ana no sabe»
SUBJECT_NEXT = {"lo", "la", "le", "les", "los", "se", "no", "ya", "tambien", "siempre", "nunca", "es", "esta", "era", "estaba", "fue", "tiene",
                "tenia", "dice", "dijo", "vive", "vivia", "quiere", "queria", "llega", "llego", "sale", "salio", "mira", "miro", "piensa", "sabe",
                "ama", "juega", "jugaba", "come", "comia", "duerme", "dormia", "decide", "decidio", "descubre", "descubrio", "encuentra",
                "encontro", "busca", "buscaba", "siente", "va", "iba", "vio", "corre", "corria", "camina", "caminaba", "salta", "salto", "vuela",
                "nada", "habla", "hablo", "grita", "grito", "abre", "abrio", "cierra", "toma", "tomo", "lleva", "llevaba", "trabaja", "trabajaba",
                "is", "was", "has", "had", "says", "said", "lives", "lived", "wants", "wanted", "runs", "ran", "walks", "walked", "looks", "looked",
                "goes", "went", "sees", "saw", "loves", "loved", "finds", "found", "decides", "decided", "y"}
COMMON_CAPS |= {"ella", "ellas", "el", "ellos", "nosotros", "todo", "nada", "algo", "alguien", "usted", "ustedes", "tu", "yo", "aunque",
                "porque", "pues", "solo", "casi", "nunca", "siempre", "ahora", "antes", "primero", "segundo", "finalmente", "por", "que",
                "quien", "como", "donde", "cuanto", "cual", "his", "her", "my", "our", "their", "what", "who", "how", "why", "once", "some"}


def find_names(words, known=None):
    """Nombres propios en el texto: [(índice_de_palabra, nombre)].
    Cuenta como nombre una palabra en Mayúscula que no es funcional ni del catálogo (`known`) y que
    · aparece a mitad de frase («…dijo Pedro»), o
    · abre frase seguida de un verbo/clítico («Pedro corre», «Luna lo mira») o de una aposición («Luna, la gata»)."""
    known = known or set()
    toks = [w["text"] if isinstance(w, dict) else w for w in words]
    clean = [t.strip("¡¿!?.,;:«»\"'()") for t in toks]
    starts = {0}
    for i, t in enumerate(toks[:-1]):
        if t.rstrip("»\"')").endswith((".", "!", "?", "…", ":")):
            starts.add(i + 1)
    mid = set()
    for i, c in enumerate(clean):
        if len(c) < 3 or not c[:1].isupper() or not c.isalpha() or c.isupper():
            continue
        n = norm_word(c)
        if n in COMMON_CAPS or n in known or n.endswith("mente"):
            continue
        nxt = norm_word(clean[i + 1]) if i + 1 < len(clean) else ""
        apos = toks[i].endswith(",") and nxt in ("la", "el", "un", "una", "mi", "su", "the", "a", "my")
        if i not in starts or nxt in SUBJECT_NEXT or apos:
            mid.add(n)
    out = []
    for i, c in enumerate(clean):
        if c and c[:1].isupper() and norm_word(c) in mid:
            out.append((i, c))
    return out
