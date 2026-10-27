"""Utilidades de texto: énfasis con *asteriscos*, limpieza para la voz y tokenización."""
import re
import unicodedata

_EMPH = re.compile(r"\*([^*]+)\*")
_WORD = re.compile(r"\S+")


def strip_emphasis(text: str) -> str:
    """'El *gueto* de Varsovia' -> 'El gueto de Varsovia'."""
    return _EMPH.sub(r"\1", text or "").replace("*", "")


def emphasis_words(text: str) -> set:
    """Índices (en la lista de palabras limpias) de las palabras marcadas con *...*.
    Admite una palabra ('*gueto*') o varias seguidas ('*dos mil niños*')."""
    out, inside = set(), False
    for idx, tok in enumerate(_WORD.findall(text or "")):
        if tok.lstrip("¡¿\"'«“(").startswith("*"):
            inside = True
        if inside:
            out.add(idx)
        if tok.rstrip(".,;:!?»”\"')").endswith("*"):
            inside = False
    return out


def words(text: str) -> list:
    return _WORD.findall(strip_emphasis(text))


def norm_word(w: str) -> str:
    w = unicodedata.normalize("NFD", w.lower())
    w = "".join(c for c in w if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w]", "", w)


def tts_clean(text: str) -> str:
    """Texto que se envía a la voz: sin marcas, con pausas naturales."""
    t = strip_emphasis(text)
    t = t.replace("—", ", ").replace("–", ", ").replace("…", "...")
    t = re.sub(r"\s+", " ", t).strip()
    return t


def syllables_es(word: str) -> int:
    w = norm_word(word)
    if not w:
        return 1
    if w.isdigit():
        return max(1, len(w) * 2)
    return max(1, len(re.findall(r"[aeiouy]+", w)))


def slug(s: str, n: int = 40) -> str:
    s = unicodedata.normalize("NFD", s or "video")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return (s or "video")[:n]
