"""Subtítulos sincronizados palabra por palabra (DOM + GSAP dentro de HyperFrames)
y exportación SRT."""
import html
import re

from .textutil import norm_word

_SENT_END = re.compile(r"[.!?…:;]$|[.!?]»$|[.!?]\"$")
_FUNC = {"a", "al", "de", "del", "la", "las", "el", "los", "lo", "un", "una", "unos", "unas", "y", "e", "o", "u", "que", "en", "por",
         "para", "con", "sin", "su", "sus", "mi", "tu", "se", "no", "ni", "como", "the", "of", "to", "and", "in", "on", "for",
         "with", "at", "by", "an", "le", "les", "des", "du", "et", "der", "die", "das", "und", "il", "di", "da", "do", "dos", "das"}


def group_words(words, style, portrait=True):
    """words: [{w, s, e, k}] en segundos absolutos del capítulo/video.
    Devuelve grupos [{s, e, words:[...]}] (uno visible a la vez)."""
    maxw = int(style.get("words", 3))
    if style.get("upper"):
        maxc = 16 if portrait else 26
    else:
        maxc = 28 if portrait else 40
    groups, cur = [], []

    def flush(carry=False):
        if not cur:
            return []
        keep = []
        # no terminar un grupo en palabra funcional ("de", "la", "a"…): pasa al siguiente
        while carry and len(cur) > 1 and len(keep) < 2 and norm_word(cur[-1]["w"]) in _FUNC and not _SENT_END.search(cur[-1]["w"]):
            keep.insert(0, cur.pop())
        groups.append({"words": list(cur)})
        cur.clear()
        return keep

    for i, w in enumerate(words):
        if cur:
            prev = cur[-1]
            pause = w["s"] - prev["e"]
            chars = sum(len(x["w"]) + 1 for x in cur) + len(w["w"])
            if pause > 0.28 or _SENT_END.search(prev["w"]) or re.search(r"[,;:]$", prev["w"]) and len(cur) >= 2:
                cur[:] = flush(False)
            elif len(cur) >= maxw or chars > maxc:
                cur[:] = flush(True)
        cur.append(w)
    flush()
    for gi, g in enumerate(groups):
        ws = g["words"]
        g["s"] = max(0.0, ws[0]["s"] - 0.06)
        nxt = groups[gi + 1]["words"][0]["s"] - 0.06 if gi + 1 < len(groups) else ws[-1]["e"] + 0.6
        g["e"] = max(g["s"] + 0.3, min(nxt, ws[-1]["e"] + 0.45))
    return groups


def css(style, cid, W, H):
    portrait = H > W
    size = style["size"][0] if portrait else style["size"][1]
    y = int(H * 0.715) if portrait else int(H - 150)
    stroke = style.get("stroke", 0)
    shadow = "0 5px 0 rgba(0,0,0,.55), 0 0 24px rgba(0,0,0,.85)" if not stroke else "0 6px 0 rgba(0,0,0,.6)"
    if style.get("glow"):
        shadow = f"0 0 18px {style['active']}, 0 0 36px {style['active']}"
    upper = "uppercase" if style.get("upper") else "none"
    maxw = int(W * (0.86 if portrait else 0.78))
    paper = style.get("paper")
    c = f"""
#{cid}-caps {{ position:absolute; left:0; top:0; width:{W}px; height:{H}px; pointer-events:none; z-index:5; }}
#{cid}-caps .vsg {{ position:absolute; left:0; width:{W}px; top:{y}px; text-align:center; opacity:0; visibility:hidden; }}
#{cid}-caps .vsg-in {{ display:inline-block; max-width:{maxw}px; line-height:1.12; text-wrap:balance; font-family:"{style['font']}"; font-weight:{style['weight']};
  font-size:{size}px; text-transform:{upper}; letter-spacing:{'0.01em' if style.get('upper') else '0'}; text-shadow:{shadow};
  {'-webkit-text-stroke:' + str(stroke) + 'px #0b0b0b; paint-order:stroke fill;' if stroke else ''}
  {'background:' + paper + '; padding:14px 34px 18px; clip-path:polygon(0% 8%,4% 0%,12% 6%,22% 1%,35% 7%,48% 0%,62% 6%,75% 1%,88% 7%,100% 2%,98% 92%,90% 100%,78% 94%,64% 100%,50% 95%,36% 100%,22% 94%,10% 100%,2% 95%); filter:drop-shadow(4px 8px 6px rgba(10,6,3,.55)); text-shadow:none;' if paper else ''}
  {'background:rgba(0,0,0,.38); padding:6px 22px 10px; border-radius:12px;' if style.get('scrim') else ''} }}
#{cid}-caps .vsw {{ display:inline-block; margin:0 0.13em; transform-origin:50% 60%; border-radius:12px; padding:0 0.08em; }}
"""
    return c


def _rgba(col, a):
    m = re.match(r"rgba?\(([^)]+)\)", col or "")
    if m:
        p = [x.strip() for x in m.group(1).split(",")][:3]
        return f"rgba({p[0]},{p[1]},{p[2]},{a})"
    if col and col.startswith("#") and len(col) == 7:
        r, g, b = int(col[1:3], 16), int(col[3:5], 16), int(col[5:7], 16)
        return f"rgba({r},{g},{b},{a})"
    return col


def markup(groups, cid):
    out = [f'<div id="{cid}-caps" data-layout-allow-caption-zone data-layout-allow-overlap>']
    wid = 0
    for gi, g in enumerate(groups):
        spans = []
        for w in g["words"]:
            w["id"] = f"{cid}-w{wid}"
            spans.append(f'<span id="{w["id"]}" class="vsw">{html.escape(w["w"])}</span>')
            wid += 1
        g["id"] = f"{cid}-g{gi}"
        out.append(f'<div id="{g["id"]}" class="vsg"><span class="vsg-in">{"".join(spans)}</span></div>')
    out.append("</div>")
    return "\n".join(out)


def timeline_data(groups, style):
    """Datos compactos para el script GSAP del capítulo."""
    base = style["color"]
    dim = _rgba(base, style.get("dim", 1)) if style.get("dim", 1) < 1 else base
    data = {"base": base, "dim": dim, "active": style["active"], "em": style["em"], "red": style["red"],
            "pop": style.get("pop", 1.1), "enter": style.get("enter", "pop"), "box": style.get("box"), "g": []}
    for g in groups:
        data["g"].append([g["id"], round(g["s"], 3), round(g["e"], 3),
                          [[w["id"], round(w["s"], 3), round(w["e"], 3), w.get("k", "")] for w in g["words"]]])
    return data


GSAP_JS = r"""
function vsCaptions(tl, D){
  const ease = D.enter === "pop" ? "back.out(2)" : "power2.out";
  D.g.forEach(function(G, gi){
    const id = "#" + G[0], s = G[1], e = G[2];
    tl.set(id, { visibility: "visible" }, s);
    if (D.enter === "pop") tl.fromTo(id, { opacity: 0, scale: 0.86, y: 14 }, { opacity: 1, scale: 1, y: 0, duration: 0.14, ease: ease }, s);
    else if (D.enter === "paper") tl.fromTo(id, { opacity: 0, y: 18, rotation: gi % 2 ? 1.4 : -1.6 }, { opacity: 1, y: 0, rotation: gi % 2 ? 1.4 : -1.6, duration: 0.16, ease: "power3.out" }, s);
    else tl.fromTo(id, { opacity: 0 }, { opacity: 1, duration: 0.16, ease: "power2.out" }, s);
    G[3].forEach(function(W){
      const wid = "#" + W[0], ws = W[1], we = Math.max(W[2], ws + 0.1), k = W[3];
      const on = k === "em" ? D.em : k === "red" ? D.red : D.active;
      const after = k === "em" ? D.em : k === "red" ? D.red : D.base;
      const v0 = { color: D.dim, scale: 1 }, v1 = { color: on, scale: D.pop, duration: 0.08, ease: "power2.out" };
      if (D.box) { v0.backgroundColor = "rgba(0,0,0,0)"; v1.backgroundColor = k ? on : D.box; v1.color = k ? "#14110f" : D.active; }
      tl.fromTo(wid, v0, v1, ws);
      const v2 = { color: after, scale: 1, duration: 0.12, ease: "power2.out" };
      if (D.box) v2.backgroundColor = "rgba(0,0,0,0)";
      tl.to(wid, v2, Math.max(ws + 0.09, we - 0.02));
    });
    const out = Math.max(s + 0.2, e - 0.1);
    tl.to(id, { opacity: 0, duration: 0.1, ease: "power2.in" }, out);
    tl.set(id, { visibility: "hidden" }, e);
  });
}
"""


def srt(groups_abs):
    def ts(t):
        h, r = divmod(max(0, t), 3600)
        m, s = divmod(r, 60)
        return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int((s - int(s)) * 1000):03d}"

    lines = []
    for i, g in enumerate(groups_abs, 1):
        txt = " ".join(w["w"] for w in g["words"])
        lines.append(f"{i}\n{ts(g['s'])} --> {ts(g['e'])}\n{txt}\n")
    return "\n".join(lines)
