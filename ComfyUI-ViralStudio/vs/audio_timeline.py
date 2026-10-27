"""Línea de tiempo ABSOLUTA del modo audio (especificación §3.4).

Invariante: las escenas forman una partición contigua y ordenada de
[0, duración del audio]. Los límites se guardan en frames enteros (video) y en
segundos (eventos de audio). El audio nunca se acelera, recorta ni desplaza:
no hay `pre` ni `gap` como en el compilador clásico de TTS.

  frame_count = ceil(duration_s * fps)
  start_frame(escena k+1) == end_frame(escena k)
  end_s = min(duration_s, end_frame / fps)   (la última imagen cubre la fracción final)
"""
import math
import re

SENT_END = re.compile(r"[.!?…]+[»\"”')]*$")
SOFT_END = re.compile(r"[,;:]+[»\"”')]*$")
BACKENDS = {"vector2d", "layered2d", "infographic", "legacy_canvas", "external_clip", "web3d"}


class PlanError(ValueError):
    pass


def frame_count(duration, fps):
    return int(math.ceil(round(duration * fps, 6)))


# ------------------------------------------------------------- unidades semánticas
def units_from_words(words, duration, min_s=2.0, max_s=6.0, pause_s=0.55):
    """Agrupa las palabras en unidades (frases) por puntuación y pausas reales.
    Devuelve [{w0, w1, start_s, end_s, text}] con w1 exclusivo."""
    if not words:
        return []
    units, cur = [], [0]
    for i in range(1, len(words)):
        prev = words[i - 1]
        gap = words[i]["start_s"] - prev["end_s"]
        if SENT_END.search(prev["text"]) or gap >= pause_s:
            units.append((cur[0], i))
            cur = [i]
    units.append((cur[0], len(words)))
    out = [{"w0": a, "w1": b} for a, b in units]
    # dividir unidades demasiado largas por la pausa/coma interna más cercana al centro
    i = 0
    while i < len(out):
        u = out[i]
        a, b = u["w0"], u["w1"]
        span = words[b - 1]["end_s"] - words[a]["start_s"]
        if span > max_s * 1.35 and b - a >= 4:
            mid = (words[a]["start_s"] + words[b - 1]["end_s"]) / 2
            best, score = None, None
            for k in range(a + 2, b - 1):
                g = words[k]["start_s"] - words[k - 1]["end_s"]
                sc = abs(words[k]["start_s"] - mid) / max(span, 1e-6) - g * 2 - (0.4 if SOFT_END.search(words[k - 1]["text"]) else 0)
                if score is None or sc < score:
                    best, score = k, sc
            if best:
                out[i:i + 1] = [{"w0": a, "w1": best}, {"w0": best, "w1": b}]
                continue
        i += 1
    # unir unidades muy cortas con la siguiente (o la anterior si es la última)
    i = 0
    while i < len(out) and len(out) > 1:
        u = out[i]
        span = words[u["w1"] - 1]["end_s"] - words[u["w0"]]["start_s"]
        if span < min_s:
            j = i + 1 if i + 1 < len(out) else i - 1
            a, b = sorted([i, j])
            merged_span = words[out[b]["w1"] - 1]["end_s"] - words[out[a]["w0"]]["start_s"]
            if merged_span <= max_s * 1.25 or span < 0.9:
                out[a:b + 1] = [{"w0": out[a]["w0"], "w1": out[b]["w1"]}]
                i = max(0, a)
                continue
        i += 1
    for u in out:
        ws = words[u["w0"]:u["w1"]]
        u.update(start_s=ws[0]["start_s"], end_s=ws[-1]["end_s"], text=" ".join(w["text"] for w in ws),
                 word_ids=[w["id"] for w in ws])
    return out


def ambient_units(duration, target=4.5):
    """Sin habla: planos de ambientación (no se inventa narración)."""
    n = max(1, int(round(duration / target)))
    return [{"w0": 0, "w1": 0, "start_s": duration * k / n, "end_s": duration * (k + 1) / n, "text": "", "word_ids": []} for k in range(n)]


def cut_between(prev_end, next_start, lead=0.12):
    """Momento del corte entre dos unidades: un poco antes de la primera palabra
    de la siguiente (corte con anticipación), nunca dentro de una palabra."""
    gap = next_start - prev_end
    if gap <= 0:
        return next_start
    return max(prev_end + gap * 0.5, next_start - lead) if gap > 2 * lead else prev_end + gap * 0.5


# ------------------------------------------------------------- frames
def assign_frames(scenes, duration, fps, min_frames=None):
    """Fija start/end en frames y segundos. Cada escena trae `cut_s` (inicio
    propuesto); la primera empieza en 0 y la última acaba en frame_count."""
    if not scenes:
        raise PlanError("No hay escenas")
    total = frame_count(duration, fps)
    min_frames = max(1, int(min_frames or round(0.5 * fps)))
    starts = [0]
    for sc in scenes[1:]:
        f = int(round(float(sc.get("cut_s", 0)) * fps))
        starts.append(f)
    # monotonía y duración mínima (si no cabe, se funde con la anterior)
    keep = [0]
    for i in range(1, len(scenes)):
        f = max(starts[i], starts[keep[-1]] + min_frames)
        if f > total - min_frames:
            continue
        starts[i] = f
        keep.append(i)
    if len(keep) < len(scenes):
        merged = []
        for k, idx in enumerate(keep):
            nxt = keep[k + 1] if k + 1 < len(keep) else len(scenes)
            sc = scenes[idx]
            for j in range(idx + 1, nxt):  # escenas absorbidas: sus palabras pasan a esta
                sc["word_ids"] = sc.get("word_ids", []) + scenes[j].get("word_ids", [])
                sc["narration_exact"] = (sc.get("narration_exact", "") + " " + scenes[j].get("narration_exact", "")).strip()
            merged.append(sc)
        scenes[:] = merged
        starts = [starts[i] for i in keep]
    bounds = starts + [total]
    for i, sc in enumerate(scenes):
        sc["start_frame"], sc["end_frame"] = bounds[i], bounds[i + 1]
        sc["start_s"] = round(bounds[i] / fps, 6)
        sc["end_s"] = round(min(duration, bounds[i + 1] / fps), 6)
        sc.pop("cut_s", None)
    check_partition(scenes, duration, fps)
    return scenes


def check_partition(scenes, duration, fps):
    total = frame_count(duration, fps)
    if not scenes or scenes[0]["start_frame"] != 0:
        raise PlanError("La primera escena no empieza en 0")
    if scenes[-1]["end_frame"] != total:
        raise PlanError(f"La última escena acaba en {scenes[-1]['end_frame']} y el audio necesita {total} frames")
    for a, b in zip(scenes, scenes[1:]):
        if a["end_frame"] != b["start_frame"]:
            raise PlanError(f"Hueco/solape entre {a['id']} y {b['id']}")
    for s in scenes:
        if s["end_frame"] <= s["start_frame"]:
            raise PlanError(f"Escena vacía: {s['id']}")
    return True


def retime_scene_bounds(plan, edits):
    """Edición manual de límites desde el timeline: edits={scene_id: start_s}.
    Solo mueve el corte entre dos escenas vecinas; el audio no cambia."""
    fps = plan["video"]["fps"]
    dur = plan["audio"]["duration_s"]
    sc = plan["scenes"]
    for sid, start in (edits or {}).items():
        idx = next((i for i, s in enumerate(sc) if s["id"] == sid), None)
        if idx is None or idx == 0:
            raise PlanError("Solo se puede mover el inicio de una escena que no sea la primera")
        f = int(round(float(start) * fps))
        lo, hi = sc[idx - 1]["start_frame"] + 1, sc[idx]["end_frame"] - 1
        if not lo <= f <= hi:
            raise PlanError(f"El corte debe quedar entre {lo / fps:.2f}s y {hi / fps:.2f}s")
        sc[idx - 1]["end_frame"] = sc[idx]["start_frame"] = f
        sc[idx]["start_s"] = round(f / fps, 6)
        sc[idx - 1]["end_s"] = round(min(dur, f / fps), 6)
        _move_timed_items(sc[idx - 1], sc[idx], fps)
    check_partition(sc, dur, fps)
    reassign_words(plan)
    return plan


def _move_timed_items(a, b, fps):
    """Tras mover el corte entre las escenas a|b, cada acción/infografía va a la escena donde cae su
    instante (sigue sincronizada con su palabra). Si el personaje no está en la otra escena, se queda
    en la suya y su instante se ajusta al borde (y la QA lo verá dentro de la escena)."""
    cut = b["start_frame"] / fps
    for key in ("action_beats", "overlays"):
        pool = [(x, a) for x in a.get(key, [])] + [(x, b) for x in b.get(key, [])]
        a[key], b[key] = [], []
        for item, home in pool:
            t = item.get("at_s")
            if t is None:
                home[key].append(item)
                continue
            dest = a if t < cut else b
            tgt = item.get("target")
            if key == "action_beats" and tgt and tgt not in dest.get("character_ids", []):
                dest = home
                lo, hi = home["start_frame"] / fps, home["end_frame"] / fps
                item["at_s"] = round(min(max(t, lo), hi - 1.0 / fps), 3)
            dest[key].append(item)
        for sc in (a, b):
            sc[key].sort(key=lambda x: x.get("at_s") or 0)


def reassign_words(plan):
    """Cada palabra pertenece a la escena donde cae su punto medio."""
    words = plan["transcript"]["words"]
    fps = plan["video"]["fps"]
    for s in plan["scenes"]:
        s["word_ids"] = []
    j = 0
    for w in words:
        mid = (w["start_s"] + w["end_s"]) / 2
        while j + 1 < len(plan["scenes"]) and mid >= plan["scenes"][j]["end_frame"] / fps:
            j += 1
        plan["scenes"][j]["word_ids"].append(w["id"])
    byid = {w["id"]: w for w in words}
    for s in plan["scenes"]:
        s["narration_exact"] = " ".join(byid[i]["text"] for i in s["word_ids"])


# ------------------------------------------------------------- validación del plan
def validate_plan(doc, known_assets=None):
    """Valida el contrato audio_scene_plan v1 (tiempos, palabras, motores, assets).
    Lanza PlanError con todos los problemas encontrados."""
    errs = []

    def need(cond, msg):
        if not cond:
            errs.append(msg)

    try:
        need(doc.get("schema_version") == 1, "schema_version incorrecta")
        need(doc.get("input_mode") == "audio", "input_mode debe ser audio")
        src, vid = doc["audio"], doc["video"]
        dur, fps = float(src["duration_s"]), int(vid["fps"])
        need(math.isfinite(dur) and dur > 0, "duración inválida")
        need(1 <= fps <= 120, "fps inválidos")
        ns = src.get("narration_source")
        need(ns in ("original_audio", "tts_script"), "fuente de narración desconocida")
        # el audio del usuario NUNCA se re-sintetiza; la voz TTS solo existe cuando la narración ES el guion
        need(src.get("tts_used") is (ns == "tts_script"), "el modo audio original no puede usar TTS")
        total = int(vid["frame_count"])
        need(total == frame_count(dur, fps), "frame_count no corresponde a la duración del audio")
        words = doc["transcript"]["words"]
        ids = [w["id"] for w in words]
        need(len(set(ids)) == len(ids), "ids de palabra repetidos")
        last = 0.0
        for w in words:
            a, b = float(w["start_s"]), float(w["end_s"])
            need(0 <= a < b <= dur + 1e-6, f"palabra fuera de rango: {w['id']}")
            need(a >= last - 1e-6, f"palabras desordenadas: {w['id']}")
            last = b
        byid = {w["id"]: w for w in words}
        scenes = doc["scenes"]
        need(bool(scenes), "no hay escenas")
        prev, seen = 0, set()
        for s in scenes:
            sid = s.get("id")
            need(sid and sid not in seen, f"id de escena vacío o repetido: {sid}")
            seen.add(sid)
            a, b = int(s["start_frame"]), int(s["end_frame"])
            need(a == prev, f"hueco/solape antes de {sid}: {a} != {prev}")
            need(0 <= a < b <= total, f"rango no válido en {sid}")
            need(abs(float(s["start_s"]) - a / fps) <= 1 / fps + 1e-6, f"start_s de {sid} no coincide con su frame")
            need(abs(float(s["end_s"]) - min(dur, b / fps)) <= 1 / fps + 1e-6, f"end_s de {sid} no coincide con su frame")
            for wid in s.get("word_ids", []):
                if wid not in byid:
                    errs.append(f"{sid} referencia una palabra inexistente: {wid}")
                    continue
                w = byid[wid]
                mid = (w["start_s"] + w["end_s"]) / 2
                need(a / fps - 1 / fps - 1e-6 <= mid <= b / fps + 1 / fps + 1e-6, f"la palabra {wid} cae fuera de {sid}")
            need(s.get("render_backend") in BACKENDS, f"motor inválido en {sid}: {s.get('render_backend')}")
            need(isinstance(s.get("asset_ids"), list), f"asset_ids falta en {sid}")
            if known_assets is not None:
                for aid in s.get("asset_ids", []):
                    need(aid in known_assets, f"{sid} usa un asset no registrado: {aid}")
            for bt in s.get("action_beats", []):
                at = float(bt.get("at_s", -1))
                need(a / fps - 1e-6 <= at <= b / fps + 1e-6, f"acción fuera de su escena en {sid} ({at})")
            prev = b
        need(prev == total, f"el video acaba en {prev} y el audio necesita {total} frames")
    except (KeyError, TypeError, ValueError) as e:
        errs.append(f"estructura inválida: {e!r}")
    if errs:
        raise PlanError("; ".join(errs[:12]))
    return {"ok": True, "scenes": len(doc["scenes"]), "words": len(doc["transcript"]["words"]), "frames": total, "audio_s": dur}
