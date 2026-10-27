/* ==========================================================================
   VIRAL STUDIO PRO — infografías animadas (espacio de pantalla)
   Contador con unidad, número neón, tipografía cinética, documento, etiqueta
   con flecha, ondas, anillo de foco, línea guía, cuenta atrás, balanza, tira
   de meses y ×N. Todas: build(parent, defs, ov, ctx) + update(inst, t, ctx),
   con `ov.at` = segundo ABSOLUTO del audio en que aparecen (palabra narrada).
   ctx: {W, H, u, sc (escena), project([x,y]) → pantalla, point(target, part)}
   ========================================================================== */
(function () {
  "use strict";
  const G = typeof window !== "undefined" ? window : globalThis;
  const VSV = G.VSV;
  const { clamp, lerp, E, bump, rgba, shade } = VSV;
  const el = (...a) => VSV.el(...a);
  const g = (p, a) => VSV.el("g", a, p);
  const S = (e, k, v) => VSV.setAttr(e, k, v);
  const FONT = "Montserrat, Inter, 'Helvetica Neue', Arial, sans-serif";
  const COND = "Oswald, 'League Gothic', 'Arial Narrow', Impact, sans-serif";

  VSV.fmtNumber = function (v, lang) {
    const n = Math.round(v);
    const s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, lang === "en" ? "," : ".");
    return (n < 0 ? "-" : "") + s;
  };
  // aparición con rebote + desvanecido final de escena
  function appear(t, at, scEnd, d = 0.42) {
    const k = clamp((t - at) / d);
    const out = scEnd != null ? clamp((scEnd - t) / 0.18) : 1;
    return { k, s: t < at ? 0 : 0.55 + 0.45 * E.back(k), o: (t < at ? 0 : clamp(k * 2.5)) * out };
  }
  const O = VSV.OVERLAYS;

  /* ---- contador con unidad ("344 arañas") ---- */
  O.counter_badge = {
    build(p, defs, ov, ctx) {
      const { W, H } = ctx;
      const fs = Math.min(W, H) * 0.12, ls = fs * 0.36;
      const final = (ov.type === "multiplier" ? "×" : "") + VSV.fmtNumber(ov.value || 0, ctx.lang);
      const label = String(ov.label || "").slice(0, 40);
      const gr = g(p);
      const box = g(gr);
      const rect = el("rect", { rx: fs * 0.3, fill: "rgba(14,14,22,0.82)", stroke: "rgba(255,255,255,0.12)", "stroke-width": 2, filter: defs.shadow(0, 8, 14, "#000", 0.45) }, box);
      const num = el("text", { y: fs * 0.36, "font-family": COND, "font-weight": 700, "font-size": fs, fill: "#ffd36b", filter: defs.glow(fs * 0.06) }, box);
      const lab = el("text", { y: fs * 0.34, "font-family": FONT, "font-weight": 800, "font-size": ls, fill: "#ffd36b" }, box);
      num.textContent = final;
      lab.textContent = label;
      // medidas reales (o estimadas si el navegador aún no puede medir)
      const nw = VSV.measure(num) || final.length * fs * 0.5, lw = label ? VSV.measure(lab) || label.length * ls * 0.56 : 0;
      const pad = fs * 0.42, gap = label ? fs * 0.16 : 0, w = pad + nw + gap + lw + pad, h = fs * 1.35;
      rect.setAttribute("x", -w / 2); rect.setAttribute("y", -h / 2); rect.setAttribute("width", w); rect.setAttribute("height", h);
      num.setAttribute("x", -w / 2 + pad);
      lab.setAttribute("x", -w / 2 + pad + nw + gap);
      const fit = VSV.fitScale(w, W * (1 - 2 * VSV.SAFE));
      const cx = W / 2, cy = H * (H > W ? 0.36 : 0.3);
      return { gr, box, num, cx, cy, fit, prefix: ov.type === "multiplier" ? "×" : "" };
    },
    update(i, t, ctx, ov) {
      const a = appear(t, ov.at, ctx.sc.end);
      const k = clamp((t - ov.at) / 0.9);
      const v = lerp(ov.from || 0, ov.value || 0, E.out(k));
      i.num.textContent = i.prefix + VSV.fmtNumber(v, ctx.lang);
      S(i.gr, "opacity", a.o.toFixed(3));
      S(i.gr, "transform", `translate(${i.cx},${i.cy}) scale(${(a.s * i.fit).toFixed(3)})`);
    },
  };
  /* ---- ×N ---- */
  O.multiplier = {
    build(p, defs, ov, ctx) { return O.counter_badge.build(p, defs, Object.assign({}, ov, { type: "multiplier" }), ctx); },
    update(i, t, ctx, ov) { O.counter_badge.update(i, t, ctx, ov); },
  };
  /* ---- número neón dibujándose ---- */
  O.neon_number = {
    build(p, defs, ov, ctx) {
      const { W, H } = ctx;
      const fs = Math.min(W, H) * 0.55;
      const gr = g(p);
      const tx = el("text", { x: W / 2, y: H * 0.45 + fs * 0.35, "text-anchor": "middle", "font-family": FONT, "font-weight": 300, "font-size": fs,
        fill: "none", stroke: "#e9f1ff", "stroke-width": fs * 0.035, "stroke-dasharray": 6000, filter: defs.glow(fs * 0.04) }, gr);
      tx.textContent = VSV.fmtNumber(ov.value || 0, ctx.lang);
      const halo = el("text", { x: W / 2, y: H * 0.45 + fs * 0.35, "text-anchor": "middle", "font-family": FONT, "font-weight": 300, "font-size": fs,
        fill: "none", stroke: "#6f8cff", "stroke-width": fs * 0.09, opacity: 0.35, filter: defs.blur(fs * 0.05) }, gr);
      halo.textContent = tx.textContent;
      const fit = VSV.fitScale(VSV.measure(tx), W * (1 - 2 * VSV.SAFE));
      if (fit < 1) gr.setAttribute("transform", `translate(${W / 2},${H * 0.45}) scale(${fit.toFixed(3)}) translate(${-W / 2},${-H * 0.45})`);
      return { gr, tx, halo };
    },
    update(i, t, ctx, ov) {
      const k = clamp((t - ov.at) / 1.2);
      S(i.tx, "stroke-dashoffset", (6000 * (1 - E.io(k))).toFixed(1));
      S(i.gr, "opacity", (t < ov.at ? 0 : clamp((ctx.sc.end - t) / 0.2)).toFixed(3));
      S(i.halo, "opacity", (0.35 * k * (0.85 + 0.15 * Math.sin(t * 6))).toFixed(3));
    },
  };
  /* ---- tipografía cinética: palabras narradas que golpean al decirse ---- */
  O.kinetic_title = {
    build(p, defs, ov, ctx) {
      const { W, H } = ctx;
      const words = ov.words_t || [];
      const fs = Math.min(W, H) * (words.length > 2 ? 0.12 : 0.16);
      const gr = g(p);
      const items = words.map((w, k) => {
        const y = H * 0.42 + (k - (words.length - 1) / 2) * fs * 1.08;
        const tg = g(gr);
        const tx = el("text", { x: 0, y: fs * 0.35, "text-anchor": "middle", "font-family": FONT, "font-weight": 900, "font-size": fs,
          fill: k % 2 ? "#ffd36b" : "#ffffff", filter: defs.shadow(0, 6, 8, "#000", 0.5) }, tg);
        tx.textContent = String(w.w || "").toUpperCase().replace(/[.,;:!?¿¡]/g, "");
        const fit = VSV.fitScale(VSV.measure(tx), W * (1 - 2 * VSV.SAFE) / 1.6); // 1.6 = escala máxima del golpe de entrada
        return { tg, at: w.s, y, fit };
      });
      return { gr, items, cx: W / 2 };
    },
    update(i, t, ctx) {
      i.items.forEach((it) => {
        const a = appear(t, it.at, ctx.sc.end, 0.3);
        S(it.tg, "opacity", a.o.toFixed(3));
        S(it.tg, "transform", `translate(${i.cx},${(it.y - 40 * (1 - a.k)).toFixed(1)}) scale(${(a.s * (1 + 0.6 * (1 - a.k)) * it.fit).toFixed(3)})`);
      });
    },
  };
  /* ---- documento / artículo (título literal de la narración) ---- */
  O.document_card = {
    build(p, defs, ov, ctx) {
      const { W, H } = ctx;
      const w = Math.min(W * 0.7, H * 0.5), h = w * 1.2;
      const gr = g(p);
      const card = g(gr);
      el("rect", { x: -w / 2, y: -h / 2, width: w, height: h, rx: 10, fill: defs.linear([[0, "#f4ecda"], [1, "#e3d5b8"]]), filter: defs.shadow(0, 14, 18, "#000", 0.5) }, card);
      el("rect", { x: -w / 2, y: -h / 2, width: w, height: h * 0.09, rx: 10, fill: "#b8322f" }, card);
      const fs = w * 0.07;
      const words = String(ov.title || "").split(/\s+/).filter(Boolean);
      const lines = [];
      let cur = "";
      words.forEach((wd) => { if ((cur + " " + wd).trim().length > 16 && cur) { lines.push(cur); cur = wd; } else cur = (cur + " " + wd).trim(); });
      if (cur) lines.push(cur);
      const txs = lines.slice(0, 4).map((ln, k) => {
        const tx = el("text", { x: -w / 2 + w * 0.07, y: -h / 2 + h * 0.2 + k * fs * 1.15, "font-family": FONT, "font-weight": 800, "font-size": fs, fill: "#2a2522" }, card);
        tx.textContent = ln;
        return tx;
      });
      // ninguna línea del título puede salirse de la tarjeta
      const f2 = VSV.fitScale(Math.max(0, ...txs.map((t) => VSV.measure(t))), w * 0.86);
      if (f2 < 1) txs.forEach((t, k) => { t.setAttribute("font-size", (fs * f2).toFixed(1)); t.setAttribute("y", (-h / 2 + h * 0.2 + k * fs * f2 * 1.15).toFixed(1)); });
      for (let k = 0; k < 8; k++) el("rect", { x: -w / 2 + w * 0.07, y: -h / 2 + h * 0.52 + k * h * 0.05, width: w * (k % 3 === 2 ? 0.6 : 0.86), height: h * 0.018, rx: 4, fill: "#8d8270", opacity: 0.55 }, card);
      return { gr, cx: W / 2, cy: H * (H > W ? 0.56 : 0.54) };
    },
    update(i, t, ctx, ov) {
      const a = appear(t, ov.at, ctx.sc.end, 0.5);
      const rot = -3 + 3 * E.out(a.k);
      S(i.gr, "opacity", a.o.toFixed(3));
      S(i.gr, "transform", `translate(${i.cx},${(i.cy + 120 * (1 - E.out(a.k))).toFixed(1)}) rotate(${rot.toFixed(2)}) scale(${(0.9 + 0.1 * a.k).toFixed(3)})`);
    },
  };
  /* ---- etiqueta con línea guía hacia una parte del personaje ---- */
  O.callout = {
    build(p, defs, ov, ctx) {
      const gr = g(p);
      const fs = Math.min(ctx.W, ctx.H) * 0.032;
      const line = el("path", { fill: "none", stroke: "#ffffff", "stroke-width": 3, "stroke-dasharray": 2000 }, gr);
      const dot = el("circle", { r: 7, fill: "#ffffff" }, gr);
      const tx = el("text", { "font-family": FONT, "font-weight": 700, "font-size": fs, fill: "#ffffff", filter: defs.shadow(0, 2, 3, "#000", 0.6) }, gr);
      tx.textContent = ov.text || ov.label || "";
      return { gr, line, dot, tx, fs };
    },
    update(i, t, ctx, ov) {
      const P = ctx.screenPoint(ov.target, ov.part || "head", t);
      if (!P) return S(i.gr, "opacity", 0);
      const side = P[0] > ctx.W / 2 ? -1 : 1;
      const L = [P[0] + side * ctx.W * 0.18, P[1] - ctx.H * 0.06];
      const k = clamp((t - ov.at) / 0.5);
      S(i.line, "d", `M${P[0].toFixed(1)},${P[1].toFixed(1)} L${L[0].toFixed(1)},${L[1].toFixed(1)} l${side * 30},0`);
      S(i.line, "stroke-dashoffset", (2000 - 2000 * E.out(k)).toFixed(1));
      S(i.dot, "cx", P[0].toFixed(1)); S(i.dot, "cy", P[1].toFixed(1));
      // la etiqueta queda dentro de la zona segura (si no cabe a un lado, se recoloca)
      const tw = VSV.measure(i.tx) || String(i.tx.textContent).length * i.fs * 0.6, m = ctx.W * VSV.SAFE;
      let tx = L[0] + side * 40;
      if (side > 0) tx = Math.min(tx, ctx.W - m - tw); else tx = Math.max(tx, m + tw);
      const ty = clamp(L[1] + i.fs * 0.35, ctx.H * 0.08 + i.fs, ctx.H * 0.95);
      S(i.tx, "x", tx.toFixed(1)); S(i.tx, "y", ty.toFixed(1));
      S(i.tx, "text-anchor", side > 0 ? "start" : "end");
      S(i.gr, "opacity", (t < ov.at ? 0 : clamp((ctx.sc.end - t) / 0.2) * clamp(k * 3)).toFixed(3));
    },
  };
  /* ---- ondas concéntricas (vibración, sonido, alarma) ---- */
  O.ripples = {
    build(p, defs, ov, ctx) {
      const gr = g(p);
      const col = ov.color || "#5fd3ff";
      const rings = [0, 1, 2].map(() => el("circle", { fill: "none", stroke: col, "stroke-width": 6, filter: defs.glow(4) }, gr));
      return { gr, rings };
    },
    update(i, t, ctx, ov) {
      const P = ctx.screenPoint(ov.target, ov.part || "body", t) || [ctx.W / 2, ctx.H / 2];
      const R = Math.min(ctx.W, ctx.H) * 0.32;
      i.rings.forEach((r, k) => {
        const ph = (((t - ov.at) / 1.4 + k / 3) % 1 + 1) % 1;
        S(r, "cx", P[0].toFixed(1)); S(r, "cy", P[1].toFixed(1));
        S(r, "r", (R * (0.15 + ph)).toFixed(1));
        S(r, "opacity", (t < ov.at ? 0 : (1 - ph) * 0.8 * clamp((ctx.sc.end - t) / 0.3)).toFixed(3));
      });
    },
  };
  /* ---- anillo de foco ---- */
  O.highlight_ring = {
    build(p, defs, ov, ctx) {
      const gr = g(p);
      const c = el("circle", { fill: "none", stroke: "#ffe08a", "stroke-width": 6, "stroke-dasharray": 3000, filter: defs.glow(5) }, gr);
      return { gr, c };
    },
    update(i, t, ctx, ov) {
      const P = ctx.screenPoint(ov.target, ov.part || "head", t);
      if (!P) return S(i.gr, "opacity", 0);
      const k = clamp((t - ov.at) / 0.6);
      S(i.c, "cx", P[0].toFixed(1)); S(i.c, "cy", P[1].toFixed(1));
      S(i.c, "r", (Math.min(ctx.W, ctx.H) * (0.09 + 0.01 * Math.sin(t * 5)) * ctx.zoom).toFixed(1));
      S(i.c, "stroke-dashoffset", (3000 * (1 - E.out(k))).toFixed(1));
      S(i.gr, "opacity", (t < ov.at ? 0 : clamp((ctx.sc.end - t) / 0.2)).toFixed(3));
    },
  };
  /* ---- línea guía vertical (la cabeza "no se mueve") ---- */
  O.guide_line = {
    build(p, defs, ov, ctx) {
      const gr = g(p);
      // sin filtro en la línea: un filtro SVG sobre una línea vertical (caja de ancho 0) la haría invisible
      const halo = el("line", { stroke: "#ffd36b", "stroke-width": 16, "stroke-opacity": 0.28, "stroke-linecap": "round" }, gr);
      const ln = el("line", { stroke: "#ffe3a0", "stroke-width": 5, "stroke-linecap": "round" }, gr);
      const dot = el("circle", { r: 10, fill: "#ffd36b", filter: defs.glow(4) }, gr);
      return { gr, ln, halo, dot };
    },
    update(i, t, ctx, ov) {
      const P = ctx.screenPoint(ov.target, ov.part || "head", t);
      if (!P) return S(i.gr, "opacity", 0);
      const k = clamp((t - ov.at) / 0.4);
      const bottom = ctx.groundScreenY != null ? ctx.groundScreenY : ctx.H * 0.85;
      for (const L of [i.ln, i.halo]) {
        S(L, "x1", P[0].toFixed(1)); S(L, "x2", P[0].toFixed(1));
        S(L, "y1", (P[1] - ctx.H * 0.08).toFixed(1)); S(L, "y2", lerp(P[1], bottom, E.out(k)).toFixed(1));
      }
      S(i.dot, "cx", P[0].toFixed(1)); S(i.dot, "cy", P[1].toFixed(1));
      S(i.gr, "opacity", (t < ov.at ? 0 : clamp(k * 2) * clamp((ctx.sc.end - t) / 0.25)).toFixed(3));
    },
  };
  /* ---- cuenta atrás ---- */
  O.countdown = {
    build(p, defs, ov, ctx) {
      const gr = g(p);
      const fs = Math.min(ctx.W, ctx.H) * 0.16;
      const ring = el("circle", { cx: 0, cy: 0, r: fs * 0.9, fill: "rgba(10,12,30,0.75)", stroke: "#8fd0ff", "stroke-width": 8, "stroke-dasharray": 2 * Math.PI * fs * 0.9, filter: defs.glow(5) }, gr);
      const tx = el("text", { x: 0, y: fs * 0.36, "text-anchor": "middle", "font-family": FONT, "font-weight": 800, "font-size": fs, fill: "#ffffff" }, gr);
      return { gr, ring, tx, C: 2 * Math.PI * fs * 0.9, cx: ctx.W / 2, cy: ctx.H * 0.6 };
    },
    update(i, t, ctx, ov) {
      const el2 = Math.max(0, t - ov.at), from = ov.from || 10, to = ov.to || 0;
      const n = Math.max(to, from - Math.floor(el2));
      i.tx.textContent = String(n);
      S(i.ring, "stroke-dashoffset", (i.C * (el2 % 1)).toFixed(1));
      S(i.gr, "transform", `translate(${i.cx},${i.cy}) scale(${(1 + 0.08 * bump(el2 % 1, 0, 0.25)).toFixed(3)})`);
      S(i.gr, "opacity", (t < ov.at ? 0 : clamp((ctx.sc.end - t) / 0.2)).toFixed(3));
    },
  };
  /* ---- balanza comparativa ---- */
  O.compare_scale = {
    build(p, defs, ov, ctx) {
      const { W, H } = ctx;
      const gr = g(p);
      const s = Math.min(W, H) / 1080;
      el("rect", { x: -10 * s, y: -260 * s, width: 20 * s, height: 300 * s, fill: "#dfe3f0" }, gr);
      el("path", { d: `M${-90 * s},${40 * s} L${90 * s},${40 * s} L${50 * s},${10 * s} L${-50 * s},${10 * s} Z`, fill: "#c9cede" }, gr);
      const beam = g(gr);
      el("rect", { x: -300 * s, y: -270 * s, width: 600 * s, height: 14 * s, rx: 7 * s, fill: "#eef1fa" }, beam);
      const pans = [-1, 1].map((sg) => {
        const pg = g(beam);
        el("path", { d: `M${sg * 290 * s},${-262 * s} L${sg * 290 * s - 70 * s},${-140 * s} M${sg * 290 * s},${-262 * s} L${sg * 290 * s + 70 * s},${-140 * s}`, stroke: "#c9cede", "stroke-width": 3 }, pg);
        el("path", { d: `M${sg * 290 * s - 90 * s},${-140 * s} Q${sg * 290 * s},${-90 * s} ${sg * 290 * s + 90 * s},${-140 * s} Z`, fill: "#dfe3f0" }, pg);
        const tx = el("text", { x: sg * 290 * s, y: -60 * s, "text-anchor": "middle", "font-family": FONT, "font-weight": 800, "font-size": 44 * s, fill: "#ffffff" }, pg);
        tx.textContent = (sg < 0 ? ov.left : ov.right) || "";
        const f = VSV.fitScale(VSV.measure(tx), 250 * s);
        if (f < 1) tx.setAttribute("font-size", (44 * s * f).toFixed(1));
        return pg;
      });
      return { gr, beam, pans, cx: W / 2, cy: H * 0.55, s };
    },
    update(i, t, ctx, ov) {
      const k = clamp((t - ov.at) / 1.2);
      const tilt = (ov.tilt == null ? 0.12 : ov.tilt) * E.elastic(k);
      S(i.beam, "transform", `rotate(${((tilt * 180) / Math.PI).toFixed(2)},0,${(-263 * i.s).toFixed(1)})`);
      S(i.gr, "transform", `translate(${i.cx},${i.cy})`);
      S(i.gr, "opacity", (t < ov.at ? 0 : clamp((t - ov.at) * 4) * clamp((ctx.sc.end - t) / 0.2)).toFixed(3));
    },
  };
  /* ---- tira de meses ---- */
  O.month_strip = {
    build(p, defs, ov, ctx) {
      const { W, H } = ctx;
      const L = (ctx.lang === "en" ? "JFMAMJJASOND" : "EFMAMJJASOND").split("");
      const s = Math.min(W * 0.9 / (12 * 1.15), 64);
      const gr = g(p);
      const tiles = L.map((c, k) => {
        const tg = g(gr, { transform: `translate(${(k - 5.5) * s * 1.15},0)` });
        const r = el("rect", { x: -s / 2, y: -s / 2, width: s, height: s, rx: s * 0.18, fill: "rgba(255,255,255,0.08)", stroke: "rgba(255,255,255,0.25)", "stroke-width": 2 }, tg);
        const tx = el("text", { x: 0, y: s * 0.18, "text-anchor": "middle", "font-family": FONT, "font-weight": 800, "font-size": s * 0.5, fill: "#ffffff" }, tg);
        tx.textContent = c;
        return { r, tx };
      });
      return { gr, tiles, cx: W / 2, cy: H * (H > W ? 0.46 : 0.42) };
    },
    update(i, t, ctx, ov) {
      const hl = new Set(ov.highlight || []);
      i.tiles.forEach((tl, k) => {
        const on = hl.has(k) && t >= ov.at + k * 0.06;
        S(tl.r, "fill", on ? "#f0b648" : "rgba(255,255,255,0.08)");
        S(tl.tx, "fill", on ? "#1b1405" : "#ffffff");
      });
      S(i.gr, "transform", `translate(${i.cx},${i.cy})`);
      S(i.gr, "opacity", (t < ov.at ? 0 : clamp((t - ov.at) * 4) * clamp((ctx.sc.end - t) / 0.2)).toFixed(3));
    },
  };
})();
