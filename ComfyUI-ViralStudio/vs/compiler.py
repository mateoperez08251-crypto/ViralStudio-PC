"""Compilador: proyecto Viral Studio (guion + audio con tiempos) → proyecto
HyperFrames listo para revisar en el Studio de HyperFrames y renderizar.

Estructura generada:
  hf/
    index.html                 raíz: todos los capítulos + la mezcla de audio
    part_01.html …             raíces de un capítulo (render por partes)
    compositions/ch01.html …   canvas del motor + subtítulos karaoke
    assets/vs-engine.js        motor de animación
    assets/audio/mix.wav       voz + música + efectos
"""
import html
import json
import os
import re
import shutil

from . import captions as CAP
from .config import FORMATS, engine_js, presets
from .textutil import emphasis_words, norm_word, strip_emphasis, words as split_words

FONTS_CANVAS = [
    '900 80px "Archivo Black"', '400 80px "League Gothic"', '900 80px "Montserrat"', '800 80px "Montserrat"',
    '700 80px "Montserrat"', '700 80px "EB Garamond"', '700 80px "Playfair Display"', '700 80px "Oswald"',
]


def q(t, fps):
    return round(round(t * fps) / fps, 6)


# --------------------------------------------------------------- línea de tiempo
def assign_timeline(scenes, fps=30, pace="normal", min_dur=1.4):
    """Fija start/dur de cada escena a partir de la duración real de su voz."""
    gap = {"rapido": 0.1, "normal": 0.2, "lento": 0.38}.get(pace, 0.2)
    pre = 0.1
    t = 0.0
    for s in scenes:
        a = s.get("audio") or {}
        vd = float(a.get("dur") or 0)
        if vd > 0:
            s["pre"] = pre
            dur = pre + vd + gap
        else:
            s["pre"] = 0.0
            dur = float(s.get("hold") or s.get("dur_hint") or 2.2)
        dur = max(min_dur, dur)
        s["start"] = q(t, fps)
        s["dur"] = q(dur, fps)
        t = s["start"] + s["dur"]
    return q(t, fps)


def scene_words(s):
    """Palabras con tiempo absoluto. Usa los tiempos de la voz si existen; si no,
    reparte por sílabas a lo largo de la locución."""
    text = s.get("narration") or ""
    toks = split_words(text)
    if not toks:
        return []
    emph = emphasis_words(text)
    danger = s.get("mood") in ("fear", "danger")
    a = s.get("audio") or {}
    timed = a.get("words") or []
    base = s["start"] + s.get("pre", 0)
    out = []
    if timed and len(timed) == len(toks):
        for i, (tok, w) in enumerate(zip(toks, timed)):
            out.append({"w": tok, "s": base + w["s"], "e": base + w["e"]})
    elif timed:
        # alinear por contenido (whisper puede partir/unir palabras)
        out = _align(toks, timed, base)
    else:
        from .textutil import syllables_es

        vd = float(a.get("dur") or max(1.0, s["dur"] - 0.3))
        syl = [syllables_es(x) + (1.5 if re.search(r"[.,;:!?]$", x) else 0) for x in toks]
        tot = sum(syl) or 1
        t = 0.0
        for tok, n in zip(toks, syl):
            d = vd * n / tot
            out.append({"w": tok, "s": base + t, "e": base + t + d * 0.92})
            t += d
    for i, w in enumerate(out):
        if i in emph:
            w["k"] = "red" if danger else "em"
    return out


def _align(toks, timed, base):
    """Transfiere los tiempos de las palabras transcritas a las palabras del guion
    (que son las que se muestran) y rellena los huecos interpolando."""
    import difflib

    a = [norm_word(x) for x in toks]
    b = [norm_word(x.get("w", "")) for x in timed]
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    res = [None] * len(toks)
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            w = timed[blk.b + k]
            res[blk.a + k] = (w["s"], w["e"])
    first, last = timed[0]["s"], timed[-1]["e"]
    i = 0
    while i < len(res):
        if res[i] is not None:
            i += 1
            continue
        j = i
        while j < len(res) and res[j] is None:
            j += 1
        t0 = res[i - 1][1] if i > 0 else first
        t1 = res[j][0] if j < len(res) else last
        n = j - i
        for k in range(n):
            res[i + k] = (t0 + (t1 - t0) * k / n, t0 + (t1 - t0) * (k + 0.9) / n)
        i = j
    return [{"w": t, "s": base + r[0], "e": base + r[1]} for t, r in zip(toks, res)]


def chapters_of(scenes, max_sec=75):
    out, cur, acc = [], [], 0.0
    for s in scenes:
        if cur and acc + s["dur"] > max_sec:
            out.append(cur)
            cur, acc = [], 0.0
        cur.append(s)
        acc += s["dur"]
    if cur:
        out.append(cur)
    return out


# ------------------------------------------------------------------ escenas → motor
ENGINE_KEYS = (
    "shot", "env", "time", "weather", "mood", "cam", "trans", "sfx", "chars", "who", "action", "prop", "props", "prop_pos",
    "prop_x", "prop_scale", "label", "sub", "chip", "number", "prefix", "suffix", "color", "year", "from_back", "place",
    "country", "lat", "lon", "zoom", "from_lat", "from_lon", "items", "highlight", "quote", "author", "rank", "lines",
    "variant", "badge", "handle", "bg", "creature", "count", "cta", "left", "right", "flash", "shake", "punch", "dof", "key", "style", "id",
)


def engine_scene(s, t0):
    e = {k: s[k] for k in ENGINE_KEYS if k in s and s[k] not in (None, "", [])}
    e["start"] = round(s["start"] - t0, 4)
    e["dur"] = s["dur"]
    return e


def style_for(proj, P=None):
    P = P or presets()
    st = dict(P["styles"].get(proj["settings"].get("style"), {}) or next(iter(P["styles"].values())))
    st.update(proj["settings"].get("style_overrides") or {})
    for k in ("name", "icon", "desc", "captions"):
        st.pop(k, None)
    return st


def caption_style(proj, P=None):
    P = P or presets()
    key = proj["settings"].get("captions")
    if not key or key not in P["captions"]:
        key = P["styles"].get(proj["settings"].get("style"), {}).get("captions", "viral")
    cs = dict(P["captions"].get(key) or P["captions"]["viral"])
    cs["key"] = key
    return cs


# ------------------------------------------------------------------ HTML
HEAD = """<!doctype html>
<html lang="{lang}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width={W}, height={H}" />
<title>{title}</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script src="assets/vs-engine.js"></script>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
html, body {{ margin: 0; width: {W}px; height: {H}px; overflow: hidden; background: {bg}; }}
</style>
</head>
<body>
"""


def chapter_html(cid, scenes, t0, dur, W, H, style, cast, cstyle, emph, seed, fps):
    words = []
    for s in scenes:
        words += scene_words(s)
    rel = [dict(w, s=round(w["s"] - t0, 3), e=round(w["e"] - t0, 3)) for w in words]
    groups = CAP.group_words(rel, cstyle, portrait=H > W)
    cap_html = CAP.markup(groups, cid) if cstyle.get("key") != "none" else ""
    cap_data = CAP.timeline_data(groups, cstyle)
    data = {
        "W": W, "H": H, "fps": fps, "seed": seed, "style": style, "cast": cast,
        "scenes": [engine_scene(s, t0) for s in scenes],
        "emph": [round(t - t0, 3) for t in emph if t0 <= t < t0 + dur],
    }
    fonts_css = "\n".join(
        f'.{cid}-f{i} {{ font-family:"{f.split(chr(34))[1]}"; font-weight:{f.split()[0]}; }}' for i, f in enumerate(FONTS_CANVAS)
    )
    warm = "".join(f'<span class="{cid}-f{i}">Aa</span>' for i in range(len(FONTS_CANVAS)))
    return f"""<template>
<style>
#root {{ position: absolute; inset: 0; background: {style.get('bg', '#000')}; overflow: hidden; }}
#{cid}-cv {{ position: absolute; left: 0; top: 0; width: {W}px; height: {H}px; }}
#{cid}-warm {{ position: absolute; left: 0; top: 0; opacity: 0; font-size: 12px; pointer-events: none; }}
{fonts_css}
{CAP.css(cstyle, cid, W, H)}
</style>
<div id="root" data-composition-id="{cid}" data-width="{W}" data-height="{H}">
  <canvas id="{cid}-cv" width="{W}" height="{H}" data-layout-ignore></canvas>
  <div id="{cid}-warm" data-layout-ignore>{warm}</div>
  {cap_html}
</div>
<script>
(function () {{
  {CAP.GSAP_JS}
  var D = {json.dumps(data, ensure_ascii=False, separators=(',', ':'))};
  var C = {json.dumps(cap_data, ensure_ascii=False, separators=(',', ':'))};
  var DUR = {dur};
  var cv = document.getElementById("{cid}-cv");
  var tl = gsap.timeline({{ paused: true }});
  var clock = {{ t: 0 }};
  var film = null;
  function draw(t) {{ if (film) film.render(t); }}
  var loads = {json.dumps(FONTS_CANVAS)}.map(function (f) {{ return document.fonts.load(f).catch(function () {{}}); }});
  Promise.all(loads).then(function () {{
    film = window.VS.film(cv, D);
    tl.fromTo(clock, {{ t: 0 }}, {{ t: DUR, duration: DUR, ease: "none", onUpdate: function () {{ draw(clock.t); }} }}, 0);
    vsCaptions(tl, C);
    draw(0);
    window.__timelines["{cid}"] = tl;
  }});
}})();
</script>
</template>
""", groups


def build(proj, out_dir, mix_path=None):
    """Escribe el proyecto HyperFrames. Devuelve info con capítulos y partes."""
    P = presets()
    st = proj["settings"]
    fmt = FORMATS.get(st.get("format", "vertical"), FORMATS["vertical"])
    W, H = fmt["W"], fmt["H"]
    fps = int(st.get("fps", 30))
    scenes = proj["scenes"]
    total = proj.get("total") or (scenes[-1]["start"] + scenes[-1]["dur"])
    style = style_for(proj, P)
    cstyle = caption_style(proj, P)
    if st.get("captions") == "none":
        cstyle["key"] = "none"
    cast = (proj.get("bible") or {}).get("cast") or {}
    hf = out_dir
    os.makedirs(os.path.join(hf, "compositions"), exist_ok=True)
    os.makedirs(os.path.join(hf, "assets", "audio"), exist_ok=True)
    with open(os.path.join(hf, "assets", "vs-engine.js"), "w", encoding="utf-8") as f:
        f.write(engine_js())
    if mix_path and os.path.abspath(mix_path) != os.path.abspath(os.path.join(hf, "assets", "audio", "mix.wav")):
        shutil.copy(mix_path, os.path.join(hf, "assets", "audio", "mix.wav"))
    # momentos de énfasis (punch de cámara en palabras clave)
    emph = []
    all_groups = []
    for s in scenes:
        for w in scene_words(s):
            if w.get("k"):
                emph.append(w["s"])
    chs = chapters_of(scenes, float(st.get("chapter_seconds", 75)))
    info = {"W": W, "H": H, "fps": fps, "total": total, "chapters": []}
    title = html.escape((proj.get("bible") or {}).get("title") or st.get("topic") or "Viral Studio")
    lang = st.get("language", "es")
    seed = abs(hash(proj.get("id", "x"))) % 10000
    hosts = []
    for ci, group in enumerate(chs, 1):
        cid = f"ch{ci:02d}"
        t0 = group[0]["start"]
        dur = round(group[-1]["start"] + group[-1]["dur"] - t0, 4)
        markup, groups = chapter_html(cid, group, t0, dur, W, H, style, cast, cstyle, emph, seed + ci, fps)
        with open(os.path.join(hf, "compositions", f"{cid}.html"), "w", encoding="utf-8") as f:
            f.write(markup)
        for g in groups:
            all_groups.append(dict(g, s=g["s"] + t0, e=g["e"] + t0))
        host = (f'  <div id="{cid}" class="clip" data-composition-id="{cid}" data-composition-src="compositions/{cid}.html" '
                f'data-start="{t0}" data-duration="{dur}" data-track-index="1" data-track-kind="graphics" '
                f'data-width="{W}" data-height="{H}"></div>')
        hosts.append(host)
        # raíz de una sola parte (para render por capítulos)
        part = HEAD.format(lang=lang, W=W, H=H, title=title, bg=style.get("bg", "#000"))
        part += (f'<div id="root" data-composition-id="main" data-start="0" data-duration="{dur}" data-width="{W}" data-height="{H}">\n'
                 + host.replace(f'data-start="{t0}"', 'data-start="0"') + "\n</div>\n"
                 '<script>window.__timelines = window.__timelines || {}; window.__timelines["main"] = gsap.timeline({ paused: true });</script>\n</body>\n</html>\n')
        info["chapters"].append({"id": cid, "start": t0, "dur": dur, "part": f"part_{ci:02d}.html", "part_html": part,
                                 "scenes": [s["id"] for s in group]})
    audio_tag = ""
    if os.path.exists(os.path.join(hf, "assets", "audio", "mix.wav")):
        audio_tag = (f'  <audio id="vs-mix" class="clip" src="assets/audio/mix.wav" data-start="0" data-duration="{total}" '
                     f'data-track-index="5" data-volume="1"></audio>')
    root = HEAD.format(lang=lang, W=W, H=H, title=title, bg=style.get("bg", "#000"))
    root += (f'<div id="root" data-composition-id="main" data-start="0" data-duration="{total}" data-width="{W}" data-height="{H}">\n'
             + "\n".join(hosts) + "\n" + audio_tag + "\n</div>\n"
             '<script>window.__timelines = window.__timelines || {}; window.__timelines["main"] = gsap.timeline({ paused: true });</script>\n</body>\n</html>\n')
    with open(os.path.join(hf, "index.html"), "w", encoding="utf-8") as f:
        f.write(root)
    _scaffold(hf, title)
    with open(os.path.join(hf, "captions.srt"), "w", encoding="utf-8") as f:
        f.write(CAP.srt(all_groups))
    info["captions"] = len(all_groups)
    return info


def _scaffold(hf, title):
    from .config import HYPERFRAMES_VERSION as V

    pj = os.path.join(hf, "package.json")
    if not os.path.exists(pj):
        with open(pj, "w") as f:
            json.dump({"name": "viral-studio-film", "private": True, "type": "module", "scripts": {
                "dev": f"npx --yes hyperframes@{V} preview", "check": f"npx --yes hyperframes@{V} check",
                "render": f"npx --yes hyperframes@{V} render"}}, f, indent=2)
    hj = os.path.join(hf, "hyperframes.json")
    if not os.path.exists(hj):
        with open(hj, "w") as f:
            json.dump({"$schema": "https://hyperframes.heygen.com/schema/hyperframes.json",
                       "paths": {"blocks": "compositions", "components": "compositions/components", "assets": "assets"},
                       "media": {"autoProxy": True}}, f, indent=2)
    cj = os.path.join(hf, "CLAUDE.md")
    if not os.path.exists(cj):
        txt = (f"# {title} — proyecto HyperFrames generado por Viral Studio\n\n"
               "Puedes editarlo con Claude Code, Qwen Code o Codex usando la skill oficial `/hyperframes`.\n\n"
               "- `index.html`: raíz (capítulos + `assets/audio/mix.wav`).\n"
               "- `compositions/chNN.html`: un `<canvas>` dibujado por `assets/vs-engine.js` (motor determinista; los datos de cada\n"
               "  escena están en la variable `D` del script) + subtítulos karaoke en DOM animados con GSAP (variable `C`).\n"
               "- Para cambiar una escena: edita su objeto en `D.scenes` (shot, env, chars, label…) y ejecuta `npx hyperframes lint`,\n"
               "  `npx hyperframes snapshot --at <segundos>` y `npx hyperframes render`.\n"
               "- No uses Date.now(), Math.random() sin semilla ni timers: todo es función del tiempo.\n")
        with open(cj, "w", encoding="utf-8") as f:
            f.write(txt)
        shutil.copy(cj, os.path.join(hf, "AGENTS.md"))
    mj = os.path.join(hf, "meta.json")
    if not os.path.exists(mj):
        with open(mj, "w") as f:
            json.dump({"id": "viral-studio", "name": title}, f)
