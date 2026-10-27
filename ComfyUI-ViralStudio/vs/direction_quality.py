"""Control de dirección cinematográfica, separado del control de codecs.

No confundir motion-graphics basados en SVG con 3D: este preflight NO
certifica profesionalidad estética. Bloquea fallos que el motor actual
no puede resolver antes de malgastar minutos en una exportación fallida.
"""
import json
import os
import re
from .textutil import norm_word
from . import visual_assets as VA

# Verbos que exigen interacción física real. El motor vectorial 1.x no dispone
# de rigs de contacto ni cinemática inversa objeto/mano/puerta.
UNSUPPORTED = {
    "abrir puerta": r"\b(?:abrio|abren|abre|abrir|abriendo)\b.{0,35}\b(?:puerta|porton)\b",
    "encender luz": r"\b(?:encendio|encender|enciende|encendiendo)\b.{0,28}\b(?:luz|lampara)\b",
    "cargar animal": r"\b(?:tomo|tomar|recogio|recoger|cargo|cargar|levanto|levantar)\b.{0,65}\b(?:gat[oa]|perr[oa]|luna|cachorr[oa])\b",
    "acurrucarse juntos": r"\b(?:acosto|acostar|durmieron|dormir|acurrucar|abrazar|abrazo)\b.{0,85}\b(?:junto|juntos|separados|gat[oa]|perr[oa]|luna|toby)\b",
    "golpes a la puerta": r"\b(?:golpes|golpeo|golpearon|golpeando)\b.{0,60}\b(?:puerta|portal)\b",
    "transformacion de eras": r"\b(?:evolucion|evolucionaron|evolucionando|extinciones|cambiaban|millones de anos)\b",
}
REQUIRED_MOTION = {
    "walk": r"\b(?:camina|caminaba|caminar|caminando|avanza|avanzo|acerca|acerco|acercarse )\b",
    "run": r"\b(?:corre|corrio|corriendo|correr|salio corriendo)\b",
    "swim": r"\b(?:nada|nadaba|nadan|nadando|nadar)\b",
    "talk": r"\b(?:ladra|ladr[oó]|ladrando|maulla|maullo|maullando)\b",
}


def tokens(text):
    return " ".join(norm_word(w) for w in (text or "").split())


def inspect(plan):
    """Devuelve hallazgos accionables por escena y globales. Nunca inventa calidad."""
    findings = []
    scenes = plan.get("scenes") or []
    bible = (plan.get("visual_bible") or {}).get("characters") or []
    charmap = {c["id"]: c for c in bible}
    lib = VA.library()

    def add(code, severity, i, msg):
        findings.append({"code": code, "severity": severity, "scene": i, "detail": msg})

    if not scenes:
        add("NO_SCENES", "FAIL", 0, "No existe una secuencia de escenas.")
    for idx, sc in enumerate(scenes, 1):
        text = tokens(sc.get("narration_exact") or "")
        duration = (sc.get("end_frame", 0) - sc.get("start_frame", 0)) / (plan.get("video", {}).get("fps") or 30)
        chars = sc.get("characters") or []
        beats = sc.get("action_beats") or []
        action_set = {a.get("action") for a in chars} | {a.get("action") for a in beats}
        active = set(action_set) - {"idle", "appear", None}
        cam = sc.get("camera") or {}
        for label, pattern in UNSUPPORTED.items():
            if re.search(pattern, text):
                add("UNSUPPORTED_PHYSICAL_ACTION", "FAIL", idx,
                    f"«{label}»: se menciona, pero no hay rig de contacto/objeto para representarlo físicamente; "
                    "requiere escena específica o biblioteca 3D de acciones.")
        # Motricidad: nombrar un verbo no significa que el plan lo dibuje.
        for action, pattern in REQUIRED_MOTION.items():
            if re.search(pattern, text) and action not in active:
                add("NARRATED_ACTION_NOT_ANIMATED", "FAIL", idx,
                    f"El guion exige «{action}», pero las poses y beats del plano no contienen esa acción.")
        if chars and duration >= 1.45 and not active:
            add("STATIC_CHARACTER_SHOT", "FAIL", idx,
                f"Personaje(s) en pantalla {duration:.1f} s sin acción real. Zoom/paneo no cuenta como animación.")
        elif chars and duration > 3.5 and active.issubset({"swim", "fly", "walk", "run", "breathe", "shiver"}):
            add("REPETITIVE_ACTION", "REVIEW", idx,
                f"{duration:.1f} s con una acción cíclica y sin cambio dramático. Crear nuevo plano/acción relevante.")
        # Un beat rápido en una toma de cinco segundos NO elimina la congelación.
        # Un animal que camina 1.5 segundos y queda quieto otros 3 sigue siendo
        # una mala escena, aunque tenga camera shake y música.
        if chars and beats:
            end = sc.get("end_frame", 0) / (plan.get("video", {}).get("fps") or 30)
            start = sc.get("start_frame", 0) / (plan.get("video", {}).get("fps") or 30)
            long_still = max(0, end - max((float(b.get("at_s") or start) + float(b.get("dur") or 1.5)
                                             for b in beats if b.get("action") in {"walk", "run", "crawl", "swim", "fly"}),
                                            default=end))
            if long_still > 1.9 and active.issubset({"walk", "run", "crawl", "swim", "fly", "breathe"}):
                add("STATIC_TAIL", "FAIL", idx,
                    f"El personaje termina su movimiento y permanece al menos {long_still:.1f} s sin acción narrativa.")
        if not chars and not sc.get("overlays") and duration >= 1.8:
            add("EMPTY_SCENE", "FAIL", idx, "No hay personaje, infografía ni otra acción narrativa.")
        if chars and cam.get("movement") in {"push_in", "slow_push", "pull_out", "orbit"} and not active:
            add("CAMERA_ONLY", "FAIL", idx, "La única actividad es movimiento de cámara sobre ilustraciones estáticas.")
        for c in chars:
            cid = c.get("id")
            ce = charmap.get(cid, {})
            allowed = VA.actions_of(ce.get("asset_id"), lib)
            if c.get("action") not in allowed:
                add("INVALID_ACTOR_ACTION", "FAIL", idx,
                    f"{cid}: la acción {c.get('action')} no está implementada por su rig.")
        # Evitar creaciones de personajes ajenos a lo narrado por mantenimiento ciego.
        if len(chars) >= 2 and not re.search(r"\b(?:juntos|junto|ambos|dos|mientras|a su lado|con ella|con el)\b", text):
            mentioned = [c for c in chars if any(tokens(alias) in text.split() for alias in charmap.get(c.get("id"), {}).get("aliases", []))]
            if not mentioned:
                add("UNJUSTIFIED_CO_PRESENCE", "REVIEW", idx,
                    "Varios personajes persistentes sin mención explícita; revisar la continuidad de la escena.")
    # Se comprueba la secuencia de tomas, no solo escenas independientes:
    # repetir el mismo tiburón, fondo y gesto 4 veces no es evolución visual.
    for j in range(1, len(scenes)):
        p, c = scenes[j - 1], scenes[j]
        actors_p = [(a.get("id"), a.get("action")) for a in p.get("characters") or []]
        actors_c = [(a.get("id"), a.get("action")) for a in c.get("characters") or []]
        if (actors_p and actors_p == actors_c and p.get("background_id") == c.get("background_id")
                and not p.get("action_beats") and not c.get("action_beats")
                and not p.get("overlays") and not c.get("overlays")):
            add("REPEATED_VISUAL", "FAIL", j + 1,
                "Plano prácticamente idéntico al anterior: mismo personaje, misma acción, mismo fondo; no desarrolla la historia.")
    return findings


def summary(plan):
    issues = inspect(plan)
    return {"status": "FAIL" if any(i["severity"] == "FAIL" for i in issues)
            else ("REVIEW" if issues else "PASS"),
            "render_engine": "SVG vectorial 2D/2.5D, NO 3D cinematográfico",
            "certifies_cinematic_quality": False,
            "fail_count": sum(i["severity"] == "FAIL" for i in issues),
            "review_count": sum(i["severity"] == "REVIEW" for i in issues),
            "issues": issues}


def enforce(plan, pdir, strict=True):
    result = summary(plan)
    out = os.path.join(pdir, "plan", "quality_gate.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    if strict and result["status"] == "FAIL":
        from .errors import VSError
        msgs = [f"Escena {i['scene']}: {i['detail']}" for i in result["issues"] if i["severity"] == "FAIL"]
        raise VSError("INPUT_INVALID", "No se renderiza un video engañosamente básico: "
                      + " | ".join(msgs[:5]) + f". Informe completo: {out}. "
                      "El motor SVG no dispone de la acción/escenario solicitado; "
                      "hay que crear el rig o usar un backend 3D real. "
                      "Para pruebas técnicas no profesionales, desactiva professional_gate.")
    return result
