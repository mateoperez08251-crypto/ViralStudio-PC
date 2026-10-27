"""Compilador del modo audio: plan validado → proyecto HyperFrames con escenas
SVG (motor engine/6x-7x) y la narración ORIGINAL como pista continua.

Estructura generada (hf/):
  index.html                    raíz editable: todas las escenas + assets/audio/mix.wav
  compositions/sc001.html …     una composición por escena (render y caché por escena)
  assets/vs-engine.js           motor (Canvas clásico + vectorial)
  assets/audio/mix.wav          narración original (+ música/SFX opcionales)
  assets/plan.json              plan usado (para el editor de HyperFrames / Claude Code)
  captions.srt                  subtítulos con los tiempos de las palabras

Cada composición dibuja con VSV.film(...).render(t_absoluto), donde
t_absoluto = inicio_de_la_escena + tiempo_local: un frame en el segundo 2.5 es
idéntico se renderice como parte suelta o como proyecto completo.
"""
import html
import json
import os
import re
import shutil

from . import audio_storyboard as SB
from . import visual_assets as VA
from .config import FORMATS, engine_js
from .textutil import norm_word

FONTS_LINK = ("https://fonts.googleapis.com/css2?family=Montserrat:wght@300;600;700;800;900&family=Oswald:wght@500;700"
              "&display=block")
SENT_END = re.compile(r"[.!?…]+[»\"”')]*$")


# ------------------------------------------------------------------ subtítulos
def caption_groups(words, highlight_ids, portrait=True, max_line=20, max_lines=2, pause=0.45):
    """Frases cortas (≤2 líneas) que se construyen palabra a palabra."""
    groups, cur = [], []
    limit = max_line * max_lines

    def flush():
        if cur:
            groups.append(list(cur))
            cur.clear()

    for i, w in enumerate(words):
        if cur:
            prev = cur[-1]
            chars = sum(len(x["text"]) + 1 for x in cur) + len(w["text"])
            if SENT_END.search(prev["text"]) or w["start_s"] - prev["end_s"] > pause or chars > limit:
                flush()
        cur.append(w)
    flush()
    out = []
    for gi, g in enumerate(groups):
        # partir en líneas equilibradas
        lines, line = [], []
        total = sum(len(x["text"]) + 1 for x in g)
        target = total / max(1, min(max_lines, -(-total // max_line)))
        acc = 0
        for w in g:
            if line and acc + len(w["text"]) > target + 3 and len(lines) < max_lines - 1:
                lines.append(line)
                line, acc = [], 0
            line.append(w)
            acc += len(w["text"]) + 1
        if line:
            lines.append(line)
        s = max(0.0, g[0]["start_s"] - 0.05)
        nxt = groups[gi + 1][0]["start_s"] - 0.05 if gi + 1 < len(groups) else g[-1]["end_s"] + 0.6
        e = max(s + 0.3, min(nxt, g[-1]["end_s"] + 0.55))
        out.append({"s": round(s, 3), "e": round(e, 3),
                    "lines": [[{"w": w["text"], "s": round(w["start_s"], 3), "e": round(w["end_s"], 3), "id": w["id"],
                                "hl": w["id"] in highlight_ids} for w in ln] for ln in lines]})
    return out


def srt(groups):
    def ts(t):
        h, r = divmod(max(0.0, t), 3600)
        m, s = divmod(r, 60)
        return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int(round((s - int(s)) * 1000)) % 1000:03d}"

    return "\n".join(f"{i}\n{ts(g['s'])} --> {ts(g['e'])}\n" + "\n".join(" ".join(w["w"] for w in ln) for ln in g["lines"]) + "\n"
                     for i, g in enumerate(groups, 1))


# ------------------------------------------------------------------ datos del motor
def engine_scene(plan, sc, lib=None):
    lib = lib or VA.library()
    bible = plan["visual_bible"]
    cmap = {c["id"]: c for c in bible["characters"]}
    bgs = {b["id"]: b for b in bible["backgrounds"]}
    pmap = {p["id"]: p for p in bible.get("props", [])}
    words = {w["id"]: w for w in plan["transcript"]["words"]}
    from .config import presets  # noqa: F401  (paridad con el compilador clásico)

    chars = []
    for c in sc.get("characters", []):
        b = cmap.get(c["id"])
        if not b:
            continue
        entry = lib["characters"][b["asset_id"]]
        rig = entry["builder"]
        ec = {"id": c["id"], "rig": rig, "variant": b.get("variant", "default"), "action": c.get("action", "idle")}
        if entry.get("params") or b.get("params"):  # criaturas paramétricas: especie del catálogo (+ ajustes de la biblia)
            ec["params"] = dict(entry.get("params") or {}, **(b.get("params") or {}))
        for k in ("x", "facing", "colors"):
            if c.get(k) is not None:
                ec[k] = c[k]
        if b.get("colors") or b.get("look"):  # aspecto del rol (bata, corona…) + colores fijos del personaje
            ec["colors"] = dict(b.get("look") or {}, **(b.get("colors") or {}))
        if b.get("params") and rig == "cat":
            ec["colors"] = dict(ec.get("colors") or {}, **b["params"])
        chars.append(ec)
    props = []
    for p in sc.get("props", []):
        b = pmap.get(p.get("id"))
        if not b:
            continue
        w = words.get(p.get("word"))
        props.append({"name": lib["props"][b["asset_id"]]["builder"], "at_s": round(w["start_s"], 3) if w else None})
    ovs = []
    for o in sc.get("overlays", []):
        o2 = {k: v for k, v in o.items() if k not in ("word",)}
        if o["type"] == "kinetic_title":
            ids = o.get("words") or sc["word_ids"][:3]
            o2["words_t"] = [{"w": words[i]["text"], "s": words[i]["start_s"]} for i in ids if i in words]
        if o["type"] in ("ripples", "callout", "guide_line", "highlight_ring") and not o.get("target") and chars:
            o2["target"] = chars[0]["id"]
        ovs.append(o2)
    cam = dict(sc.get("camera") or {})
    hl = sc.get("highlight_word_ids") or []
    return {
        "id": sc["id"], "start_frame": sc["start_frame"], "end_frame": sc["end_frame"], "start_s": sc["start_s"], "end_s": sc["end_s"],
        "template": sc.get("template"), "background": {"asset_id": bgs.get(sc.get("background_id"), {}).get("asset_id", "studio_gradient_v1")},
        "characters": chars, "props": props,
        "beats": [{"at_s": b["at_s"], "action": b["action"], "target": b.get("target")} for b in sc.get("action_beats", [])],
        "camera": cam, "overlays": ovs, "transition_in": sc.get("transition_in", "cut"),
        "punch_s": [round(words[i]["start_s"], 3) for i in hl if i in words],
    }


def engine_data(plan, scene_ids=None, captions=True):
    v = plan["video"]
    all_hl = set()
    for s in plan["scenes"]:
        all_hl |= set(s.get("highlight_word_ids") or [])
    W, H = v["width"], v["height"]
    groups = caption_groups(plan["transcript"]["words"], all_hl, portrait=H > W, max_line=20 if H > W else 32) if captions else []
    scenes = plan["scenes"] if scene_ids is None else [s for s in plan["scenes"] if s["id"] in scene_ids]
    lib = VA.library()
    style = (lib.get("styles") or {}).get((plan.get("visual_bible") or {}).get("style"), {})
    return {
        "W": W, "H": H, "fps": v["fps"], "seed": 7, "lang": (plan["transcript"].get("language") or "es")[:2],
        "vignette": style.get("vignette", 0.42),
        "scenes": [engine_scene(plan, s, lib) for s in scenes],
        "captions": {"enabled": bool(captions and plan.get("captions", {}).get("enabled", True)), "groups": groups,
                     "position": plan.get("captions", {}).get("position", "top")},
    }


# ------------------------------------------------------------------ HTML
HEAD = """<!doctype html>
<html lang="{lang}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width={W}, height={H}" />
<title>{title}</title>
<link rel="stylesheet" href="{fonts}" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script src="assets/vs-engine.js"></script>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
html, body {{ margin: 0; width: {W}px; height: {H}px; overflow: hidden; background: #000; }}
</style>
</head>
<body>
"""


def scene_html(cid, data, t0, dur, W, H):
    """Composición de UNA escena: su reloj local se convierte a tiempo absoluto."""
    return f"""<template>
<style>
#root {{ position: absolute; inset: 0; background: #000; overflow: hidden; }}
#{cid}-host {{ position: absolute; left: 0; top: 0; width: {W}px; height: {H}px; overflow: hidden; }}
</style>
<div id="root" data-composition-id="{cid}" data-width="{W}" data-height="{H}">
  <div id="{cid}-host" data-layout-ignore data-layout-allow-overlap></div>
</div>
<script>
(function () {{
  var D = {json.dumps(data, ensure_ascii=False, separators=(',', ':'))};
  var T0 = {t0}, DUR = {dur};
  var tl = gsap.timeline({{ paused: true }});
  var clock = {{ t: 0 }};
  var film = null;
  function draw(lt) {{ if (film) film.render(T0 + lt); }}
  var fonts = ['700 40px Montserrat', '800 40px Montserrat', '900 40px Montserrat', '700 40px Oswald'];
  Promise.all(fonts.map(function (f) {{ return document.fonts.load(f).catch(function () {{}}); }})).then(function () {{
    film = window.VSV.film(document.getElementById("{cid}-host"), D);
    tl.fromTo(clock, {{ t: 0 }}, {{ t: DUR, duration: DUR, ease: "none", onUpdate: function () {{ draw(clock.t); }} }}, 0);
    draw(0);
    window.__timelines["{cid}"] = tl;
  }});
}})();
</script>
</template>
"""


def _root(lang, W, H, title, hosts, total, audio=True):
    s = HEAD.format(lang=lang, W=W, H=H, title=title, fonts=FONTS_LINK)
    aud = (f'  <audio id="vs-mix" class="clip" src="assets/audio/mix.wav" data-start="0" data-duration="{total}" '
           f'data-track-index="5" data-volume="1"></audio>\n') if audio else ""
    s += (f'<div id="root" data-composition-id="main" data-start="0" data-duration="{total}" data-width="{W}" data-height="{H}">\n'
          + "\n".join(hosts) + "\n" + aud + "</div>\n"
          '<script>window.__timelines = window.__timelines || {}; window.__timelines["main"] = gsap.timeline({ paused: true });</script>\n'
          "</body>\n</html>\n")
    return s


def build(plan, out_dir, mix_path=None, title="Viral Studio"):
    """Escribe el proyecto HyperFrames del modo audio. Devuelve info con una
    parte por escena (clave de caché propia por escena)."""
    v = plan["video"]
    W, H, fps = v["width"], v["height"], v["fps"]
    total = round(v["frame_count"] / fps, 6)
    hf = out_dir
    os.makedirs(os.path.join(hf, "compositions"), exist_ok=True)
    os.makedirs(os.path.join(hf, "assets", "audio"), exist_ok=True)
    with open(os.path.join(hf, "assets", "vs-engine.js"), "w", encoding="utf-8") as f:
        f.write(engine_js())
    if mix_path and os.path.abspath(mix_path) != os.path.abspath(os.path.join(hf, "assets", "audio", "mix.wav")):
        shutil.copy(mix_path, os.path.join(hf, "assets", "audio", "mix.wav"))
    full = engine_data(plan, captions=plan.get("captions", {}).get("enabled", True))
    lang = (plan["transcript"].get("language") or "es")[:2]
    hosts, parts = [], []
    scenes = plan["scenes"]
    for i, sc in enumerate(scenes):
        cid = sc["id"]
        t0 = round(sc["start_frame"] / fps, 6)
        dur = round((sc["end_frame"] - sc["start_frame"]) / fps, 6)
        # la parte lleva su escena + la anterior (por si la transición la necesita)
        ids = {cid} | ({scenes[i - 1]["id"]} if i > 0 and sc.get("transition_in", "cut") != "cut" else set())
        data = dict(full, scenes=[s for s in full["scenes"] if s["id"] in ids])
        cap = full["captions"]
        data["captions"] = dict(cap, groups=[g for g in cap["groups"] if g["e"] > t0 - 0.05 and g["s"] < t0 + dur + 0.05])
        markup = scene_html(cid, data, t0, dur, W, H)
        with open(os.path.join(hf, "compositions", f"{cid}.html"), "w", encoding="utf-8") as f:
            f.write(markup)
        host = (f'  <div id="{cid}" class="clip" data-composition-id="{cid}" data-composition-src="compositions/{cid}.html" '
                f'data-start="{t0}" data-duration="{dur}" data-track-index="1" data-track-kind="graphics" '
                f'data-width="{W}" data-height="{H}"></div>')
        hosts.append(host)
        part_html = _root(lang, W, H, html.escape(title), [host.replace(f'data-start="{t0}"', 'data-start="0"')], dur, audio=False)
        key = SB.scene_visual_key(plan, sc, extra=markup)
        parts.append({"id": cid, "start": t0, "dur": dur, "frames": sc["end_frame"] - sc["start_frame"], "part": f"part_{cid}.html",
                      "part_html": part_html, "scenes": [cid], "key": key})
    with open(os.path.join(hf, "index.html"), "w", encoding="utf-8") as f:
        f.write(_root(lang, W, H, html.escape(title), hosts, total, audio=os.path.exists(os.path.join(hf, "assets", "audio", "mix.wav"))))
    with open(os.path.join(hf, "assets", "plan.json"), "w", encoding="utf-8") as f:
        json.dump({k: v for k, v in plan.items() if k != "choices"}, f, ensure_ascii=False, indent=1)
    with open(os.path.join(hf, "captions.srt"), "w", encoding="utf-8") as f:
        f.write(srt(full["captions"]["groups"]))
    cj = os.path.join(hf, "CLAUDE.md")
    with open(cj, "w", encoding="utf-8") as f:
        f.write(f"# {title} — proyecto HyperFrames del modo «Mi audio → video» (Viral Studio Pro)\n\n"
                "- `index.html`: raíz con todas las escenas + `assets/audio/mix.wav` (narración ORIGINAL continua; no la recortes).\n"
                "- `compositions/scNNN.html`: una escena. Dibuja `assets/vs-engine.js` con `VSV.film(host, D).render(T0 + t)`:\n"
                "  el tiempo es ABSOLUTO del audio. Los datos de la escena están en la variable `D` (personajes, cámara,\n"
                "  infografías, subtítulos con tiempos de palabra).\n"
                "- `assets/plan.json`: plan completo (palabras con tiempo, biblia visual, escenas en frames enteros).\n"
                "- Reglas: no cambies `data-start`/`data-duration` (son frames del audio); nada de Date.now(), Math.random() ni timers.\n"
                "- Comprobar: `npx hyperframes lint`, `npx hyperframes snapshot --at <s>`, `npx hyperframes render`.\n")
    import shutil as _sh

    _sh.copy(cj, os.path.join(hf, "AGENTS.md"))
    from .compiler import _scaffold

    _scaffold(hf, title)
    return {"W": W, "H": H, "fps": fps, "total": total, "frame_count": v["frame_count"], "chapters": parts,
            "captions": len(full["captions"]["groups"]), "mode": "audio"}
