/* ==========================================================================
   VIRAL STUDIO PRO — más escenarios por capas (2.5D) para las especies:
   bosque, selva, sabana, granja, casa (salón), desierto, nieve/polo, fondo
   marino, playa, río/estanque, cielo, noche y jardín "macro" (insectos).
   Misma convención que 61_vector_world.js: capas con profundidad d (0 cielo,
   1 plano de los personajes), `tile` para seguir a quien camina, anim(t) pura.
   ========================================================================== */
(function () {
  "use strict";
  const G = typeof window !== "undefined" ? window : globalThis;
  const VSV = G.VSV;
  const { rng, mix, shade } = VSV;
  const el = (...a) => VSV.el(...a);
  const g = (p, a) => VSV.el("g", a, p);
  const f1 = (v) => Math.round(v * 10) / 10;

  function layer(L, root, depth, tile) {
    const outer = g(root, { "data-depth": depth });
    const inner = g(outer);
    const o = { g: outer, inner, depth, tile: tile || 0, anim: null };
    L.push(o);
    return o;
  }
  const sky = (L, root, defs, W, H, stops) => {
    const s = layer(L, root, 0);
    el("rect", { x: -W, y: -H, width: 3 * W, height: 3 * H, fill: defs.linear(stops) }, s.inner);
    return s;
  };
  function clouds(L, root, W, H, hz, seed, op) {
    const c = layer(L, root, 0.08, 1600);
    const R = rng(seed + 21);
    for (let k = -2; k <= 3; k++) for (let i = 0; i < 3; i++) {
      const cx = k * 1600 + i * 520 + R() * 200, cy = hz - H * (0.22 + R() * 0.22), s = 0.6 + R() * 0.6;
      const gg = g(c.inner, { transform: `translate(${f1(cx)},${f1(cy)}) scale(${s.toFixed(2)})` });
      [[-80, 10, 70], [0, -20, 90], [90, 8, 70], [20, 30, 80]].forEach(([x, y, r]) => el("circle", { cx: x, cy: y, r, fill: "#ffffff", opacity: op == null ? 0.92 : op }, gg));
    }
    return c;
  }
  // colinas onduladas repetibles
  function hills(L, root, depth, tile, W, hz, lift, col, seed) {
    const h = layer(L, root, depth, tile);
    const R = rng(seed);
    for (let k = -3; k <= 4; k++) {
      const x0 = k * tile;
      const a = lift * (0.6 + R() * 0.6), b = lift * (0.5 + R() * 0.7);
      el("path", { d: `M${x0},${hz + 40} Q${f1(x0 + tile * 0.25)},${f1(hz - a)} ${f1(x0 + tile * 0.5)},${f1(hz - lift * 0.3)} T${x0 + tile},${hz + 40} L${x0 + tile},${hz + 400} L${x0},${hz + 400} Z`, fill: col }, h.inner);
      if (b > 9999) break;
    }
    return h;
  }
  function groundRect(L, root, defs, W, H, hz, c0, c1, texture) {
    const gl = layer(L, root, 1);
    el("rect", { x: -2 * W, y: hz, width: 5 * W, height: H * 1.2, fill: defs.linear([[0, c0], [1, c1]]) }, gl.inner);
    if (texture) el("rect", { x: -2 * W, y: hz + H * 0.06, width: 5 * W, height: H * 1.2, fill: texture }, gl.inner);
    return gl;
  }
  function pine(p, x, y, s, c) {
    el("rect", { x: x - 7 * s, y: y - 30 * s, width: 14 * s, height: 32 * s, fill: "#5a3a24" }, p);
    for (let i = 0; i < 3; i++) el("path", { d: `M${f1(x - (70 - i * 16) * s)},${f1(y - (26 + i * 52) * s)} L${f1(x)},${f1(y - (120 + i * 52) * s)} L${f1(x + (70 - i * 16) * s)},${f1(y - (26 + i * 52) * s)} Z`, fill: shade(c, -i * 0.06) }, p);
  }
  function palm(p, x, y, s, R) {
    const lean = (R() - 0.5) * 60 * s;
    el("path", { d: `M${f1(x)},${f1(y)} Q${f1(x + lean * 0.4)},${f1(y - 150 * s)} ${f1(x + lean)},${f1(y - 300 * s)}`, stroke: "#8a6238", "stroke-width": 18 * s, fill: "none", "stroke-linecap": "round" }, p);
    const tx = x + lean, ty = y - 300 * s;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI + (i / 6) * Math.PI;
      el("path", { d: `M${f1(tx)},${f1(ty)} Q${f1(tx + Math.cos(a) * 90 * s)},${f1(ty + Math.sin(a) * 80 * s - 30 * s)} ${f1(tx + Math.cos(a) * 170 * s)},${f1(ty + Math.sin(a) * 40 * s + 40 * s)}`, stroke: i % 2 ? "#3f8a3a" : "#2f7a32", "stroke-width": 22 * s, fill: "none", "stroke-linecap": "round" }, p);
    }
  }
  function bush(p, x, y, s, c) {
    [[-40, 0, 46], [0, -24, 56], [44, -4, 46], [10, 10, 50]].forEach(([dx, dy, r], i) => el("circle", { cx: x + dx * s, cy: y + dy * s - 30 * s, r: r * s, fill: shade(c, (i % 2) * 0.08) }, p));
  }
  function flower(p, x, y, s, c, R) {
    el("path", { d: `M${f1(x)},${f1(y)} q${f1(8 * s)},${f1(-60 * s)} 0,${f1(-120 * s)}`, stroke: "#3f8a3a", "stroke-width": 8 * s, fill: "none" }, p);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; el("ellipse", { cx: x + Math.cos(a) * 26 * s, cy: y - 120 * s + Math.sin(a) * 26 * s, rx: 20 * s, ry: 13 * s, fill: c, transform: `rotate(${f1((a * 180) / Math.PI)},${f1(x + Math.cos(a) * 26 * s)},${f1(y - 120 * s + Math.sin(a) * 26 * s)})` }, p); }
    el("circle", { cx: x, cy: y - 120 * s, r: 16 * s, fill: "#ffd23a" }, p);
  }
  function sun(p, defs, x, y, r, col) {
    el("circle", { cx: x, cy: y, r: r * 4, fill: defs.radial([[0, col, 0.6], [1, col, 0]]) }, p);
    el("circle", { cx: x, cy: y, r, fill: col }, p);
  }

  /* ---------------------------------------------------------------- BOSQUE */
  VSV.WORLDS.forest = function (root, defs, W, H, seed) {
    const L = [], gr = VSV.groundOf(W, H, "forest"), hz = gr.horizon, R = rng(seed + 31);
    sky(L, root, defs, W, H, [[0, "#6fa8dc"], [0.6, "#bfe0f2"], [1, "#eaf6ff"]]);
    clouds(L, root, W, H, hz, seed, 0.85);
    hills(L, root, 0.15, 1800, W, hz, H * 0.18, "#7fa98a", seed + 1);
    const far = layer(L, root, 0.3, 700);
    for (let k = -4; k <= 5; k++) for (let i = 0; i < 4; i++) pine(far.inner, k * 700 + i * 170 + R() * 60, hz + 6, 0.9 + R() * 0.5, "#4f7f5a");
    const mid = layer(L, root, 0.55, 900);
    for (let k = -4; k <= 5; k++) for (let i = 0; i < 3; i++) pine(mid.inner, k * 900 + i * 300 + R() * 80, hz + 30, 1.5 + R() * 0.6, "#2f6a3e");
    groundRect(L, root, defs, W, H, hz, "#6aa04a", "#3a6a2a", defs.pattern(46, 30, (p) => el("path", { d: "M5,30 l4,-14 M20,30 l-3,-12 M34,30 l5,-16", stroke: "#2a5a22", "stroke-width": 3, opacity: 0.25 }, p)));
    const fg = layer(L, root, 1.25, 1400);
    for (let k = -3; k <= 4; k++) bush(fg.inner, k * 1400 + 120, H * 1.02, 1.6, "#2f6a32");
    return { layers: L, ground: gr, tone: "#e8ffd8", ambient: "day" };
  };

  /* ---------------------------------------------------------------- SELVA */
  VSV.WORLDS.jungle = function (root, defs, W, H, seed) {
    const L = [], gr = VSV.groundOf(W, H, "jungle"), hz = gr.horizon, R = rng(seed + 41);
    sky(L, root, defs, W, H, [[0, "#2f6a52"], [0.5, "#7fbf8a"], [1, "#d8f0c0"]]);
    const rays = layer(L, root, 0.1);
    for (let i = 0; i < 4; i++) el("path", { d: `M${f1(W * (0.1 + i * 0.25))},${-H * 0.2} L${f1(W * (0.2 + i * 0.25))},${-H * 0.2} L${f1(W * (0.5 + i * 0.25))},${H} L${f1(W * (0.35 + i * 0.25))},${H} Z`, fill: "#f6ffd0", opacity: 0.12, filter: defs.blur(14) }, rays.inner);
    const far = layer(L, root, 0.25, 800);
    for (let k = -4; k <= 5; k++) for (let i = 0; i < 3; i++) bush(far.inner, k * 800 + i * 260 + R() * 60, hz - H * 0.05 - R() * H * 0.1, 2.2 + R(), "#3f7f4a");
    const vines = layer(L, root, 0.6, 600);
    for (let k = -4; k <= 5; k++) for (let i = 0; i < 2; i++) { const x = k * 600 + i * 300 + R() * 80; el("path", { d: `M${f1(x)},${-H} Q${f1(x + 40)},${f1(hz * 0.4)} ${f1(x - 10)},${f1(hz * (0.55 + R() * 0.3))}`, stroke: "#2f5a2a", "stroke-width": 9, fill: "none" }, vines.inner); for (let j = 0; j < 5; j++) el("ellipse", { cx: x + 14, cy: hz * (0.1 + j * 0.12), rx: 20, ry: 9, fill: "#3f8a3a", transform: `rotate(-30,${f1(x + 14)},${f1(hz * (0.1 + j * 0.12))})` }, vines.inner); }
    const palms = layer(L, root, 0.75, 1100);
    for (let k = -3; k <= 4; k++) palm(palms.inner, k * 1100 + 200 + R() * 200, hz + 30, 1.4, R);
    groundRect(L, root, defs, W, H, hz, "#4f8a3a", "#2a4a22", null);
    const fg = layer(L, root, 1.3, 1200);
    for (let k = -3; k <= 4; k++) for (let i = 0; i < 4; i++) { const x = k * 1200 + i * 90; el("path", { d: `M${f1(x)},${f1(H * 1.05)} Q${f1(x - 60)},${f1(H * 0.8)} ${f1(x - 120 + i * 40)},${f1(H * 0.66)}`, stroke: "#1f5a2a", "stroke-width": 34, fill: "none", "stroke-linecap": "round" }, fg.inner); }
    return { layers: L, ground: gr, tone: "#d8ffd0", ambient: "day" };
  };

  /* ---------------------------------------------------------------- SABANA */
  VSV.WORLDS.savanna = function (root, defs, W, H, seed) {
    const L = [], gr = VSV.groundOf(W, H, "savanna"), hz = gr.horizon, R = rng(seed + 51);
    const s = sky(L, root, defs, W, H, [[0, "#f2a24a"], [0.45, "#f8c870"], [0.8, "#ffe4a8"], [1, "#fff0c8"]]);
    sun(s.inner, defs, W * 0.72, hz - H * 0.12, Math.max(W, H) * 0.07, "#fff2c0");
    hills(L, root, 0.15, 2200, W, hz, H * 0.06, "#c89a5a", seed + 3);
    const acacia = layer(L, root, 0.35, 1300);
    for (let k = -3; k <= 4; k++) {
      const x = k * 1300 + 300 + R() * 300, y = hz + 4, sc = 0.9 + R() * 0.5;
      el("path", { d: `M${f1(x)},${f1(y)} L${f1(x + 6 * sc)},${f1(y - 120 * sc)} M${f1(x + 4 * sc)},${f1(y - 90 * sc)} L${f1(x - 50 * sc)},${f1(y - 150 * sc)} M${f1(x + 6 * sc)},${f1(y - 110 * sc)} L${f1(x + 60 * sc)},${f1(y - 160 * sc)}`, stroke: "#4a3020", "stroke-width": 10 * sc, "stroke-linecap": "round" }, acacia.inner);
      el("ellipse", { cx: x + 4 * sc, cy: y - 165 * sc, rx: 150 * sc, ry: 32 * sc, fill: "#5a7a2a" }, acacia.inner);
      el("ellipse", { cx: x + 10 * sc, cy: y - 175 * sc, rx: 110 * sc, ry: 22 * sc, fill: "#6a8a32" }, acacia.inner);
    }
    groundRect(L, root, defs, W, H, hz, "#d8b060", "#a87a3a", defs.pattern(60, 34, (p) => el("path", { d: "M6,34 l6,-22 M24,34 l-4,-18 M42,34 l8,-24", stroke: "#8a6a2a", "stroke-width": 3, opacity: 0.35 }, p)));
    const fg = layer(L, root, 1.25, 1500);
    for (let k = -3; k <= 4; k++) for (let i = 0; i < 9; i++) { const x = k * 1500 + i * 26; el("path", { d: `M${f1(x)},${f1(H * 1.04)} l${f1(-20 + i * 5)},${f1(-H * 0.14 - (i % 3) * 20)}`, stroke: "#b88a3a", "stroke-width": 9, "stroke-linecap": "round" }, fg.inner); }
    return { layers: L, ground: gr, tone: "#ffe0a8", ambient: "warm" };
  };

  /* ---------------------------------------------------------------- GRANJA */
  VSV.WORLDS.farm = function (root, defs, W, H, seed) {
    const L = [], gr = VSV.groundOf(W, H, "farm"), hz = gr.horizon, R = rng(seed + 61);
    sky(L, root, defs, W, H, [[0, "#5a9ae2"], [0.6, "#a8d2f2"], [1, "#e8f6ff"]]);
    clouds(L, root, W, H, hz, seed);
    hills(L, root, 0.18, 1900, W, hz, H * 0.14, "#9ac87a", seed + 5);
    const barn = layer(L, root, 0.4, 1800);
    for (let k = -2; k <= 3; k++) {
      const x = k * 1800 + 900, y = hz + 10, s = 1.1;
      el("rect", { x: x - 150 * s, y: y - 200 * s, width: 300 * s, height: 200 * s, fill: "#b8322a" }, barn.inner);
      el("path", { d: `M${f1(x - 175 * s)},${f1(y - 195 * s)} L${f1(x)},${f1(y - 320 * s)} L${f1(x + 175 * s)},${f1(y - 195 * s)} Z`, fill: "#7a2a22" }, barn.inner);
      el("rect", { x: x - 50 * s, y: y - 130 * s, width: 100 * s, height: 130 * s, fill: "#f4ece0" }, barn.inner);
      el("path", { d: `M${f1(x - 50 * s)},${f1(y - 130 * s)} L${f1(x + 50 * s)},${y} M${f1(x + 50 * s)},${f1(y - 130 * s)} L${f1(x - 50 * s)},${y}`, stroke: "#b8322a", "stroke-width": 8 * s }, barn.inner);
      el("rect", { x: x + 190 * s, y: y - 260 * s, width: 70 * s, height: 260 * s, rx: 30 * s, fill: "#c8ccd4" }, barn.inner);
    }
    const fence = layer(L, root, 0.62, 160);
    for (let k = -14; k <= 16; k++) { const x = k * 160; el("rect", { x, y: hz + 20, width: 14, height: 80, fill: "#e8dcc4" }, fence.inner); }
    el("rect", { x: -16 * 160, y: hz + 38, width: 34 * 160, height: 12, fill: "#e8dcc4" }, fence.inner);
    el("rect", { x: -16 * 160, y: hz + 70, width: 34 * 160, height: 12, fill: "#e8dcc4" }, fence.inner);
    groundRect(L, root, defs, W, H, hz, "#8ac860", "#4f8a3a", defs.pattern(40, 30, (p) => el("path", { d: "M5,30 l4,-16 M18,30 l-3,-14 M30,30 l5,-18", stroke: "#2f6a2a", "stroke-width": 3, opacity: 0.22 }, p)));
    const fg = layer(L, root, 1.2, 1300);
    for (let k = -3; k <= 4; k++) { const x = k * 1300 + 1000; el("ellipse", { cx: x, cy: H * 1.0, rx: 180, ry: 70, fill: "#e8c060" }, fg.inner); el("path", { d: `M${x - 160},${H * 0.98} l320,0 M${x - 140},${H * 0.95} l280,0`, stroke: "#c89a3a", "stroke-width": 6 }, fg.inner); }
    return { layers: L, ground: gr, tone: "#fff4d0", ambient: "day" };
  };

  /* ---------------------------------------------------------------- CASA (salón) */
  VSV.WORLDS.home = function (root, defs, W, H, seed) {
    const L = [], hz = H * 0.66;
    const wall = layer(L, root, 0.12);
    el("rect", { x: -W, y: -H, width: 3 * W, height: 3 * H, fill: defs.linear([[0, "#f2e2c8"], [1, "#e4ccaa"]]) }, wall.inner);
    const stripes = defs.pattern(60, 60, (p) => el("rect", { x: 0, y: 0, width: 28, height: 60, fill: "#ffffff", opacity: 0.18 }, p));
    el("rect", { x: -W, y: -H, width: 3 * W, height: hz + H, fill: stripes }, wall.inner);
    const furn = layer(L, root, 0.45, 2000);
    for (let k = -2; k <= 3; k++) {
      const x = k * 2000 + 400;
      // ventana con luz
      el("rect", { x: x, y: hz - H * 0.5, width: 260, height: 300, rx: 10, fill: "#bfe4ff", stroke: "#f8f4ec", "stroke-width": 18 }, furn.inner);
      el("path", { d: `M${x + 130},${f1(hz - H * 0.5)} l0,300 M${x},${f1(hz - H * 0.5 + 150)} l260,0`, stroke: "#f8f4ec", "stroke-width": 12 }, furn.inner);
      // cuadro y lámpara
      el("rect", { x: x + 500, y: hz - H * 0.46, width: 200, height: 140, fill: "#6a8ab2", stroke: "#8a6238", "stroke-width": 14 }, furn.inner);
      el("path", { d: `M${x + 520},${f1(hz - H * 0.36)} l60,-40 l40,30 l60,-50 l0,80 Z`, fill: "#9ac87a" }, furn.inner);
      // sofá
      const sx = x + 900, sy = hz + 6;
      el("rect", { x: sx, y: sy - 170, width: 420, height: 120, rx: 30, fill: "#c86a4a" }, furn.inner);
      el("rect", { x: sx - 30, y: sy - 90, width: 480, height: 90, rx: 26, fill: "#b85a3a" }, furn.inner);
      el("rect", { x: sx + 20, y: sy - 10, width: 20, height: 14, fill: "#4a3020" }, furn.inner);
      el("rect", { x: sx + 380, y: sy - 10, width: 20, height: 14, fill: "#4a3020" }, furn.inner);
      // estantería
      el("rect", { x: x + 1500, y: hz - H * 0.42, width: 200, height: H * 0.42, fill: "#8a6238" }, furn.inner);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) el("rect", { x: x + 1512 + j * 36, y: hz - H * 0.42 + 14 + i * (H * 0.1), width: 26, height: H * 0.08, fill: ["#c8322a", "#2a6ab8", "#e8b23a", "#3a8a5a", "#8a4ab8"][(i + j) % 5] }, furn.inner);
    }
    const floor = layer(L, root, 1);
    el("rect", { x: -2 * W, y: hz, width: 5 * W, height: H, fill: defs.linear([[0, "#b8865a"], [1, "#8a5a32"]]) }, floor.inner);
    const boards = defs.pattern(220, 40, (p) => { el("rect", { x: 0, y: 38, width: 220, height: 2, fill: "#5a3a20", opacity: 0.35 }, p); el("rect", { x: 110, y: 0, width: 2, height: 40, fill: "#5a3a20", opacity: 0.25 }, p); });
    el("rect", { x: -2 * W, y: hz, width: 5 * W, height: H, fill: boards }, floor.inner);
    el("rect", { x: -2 * W, y: hz - 14, width: 5 * W, height: 16, fill: "#f8f0e4" }, floor.inner);
    el("ellipse", { cx: W * 0.5, cy: hz + H * 0.2, rx: W * 0.4, ry: H * 0.08, fill: "#4a6ab2", opacity: 0.55 }, floor.inner);
    return { layers: L, ground: { horizon: hz, near: H * 0.9, at: (z) => ({ y: hz + 30 + (H * 0.9 - hz - 30) * z, s: 0.7 + 0.3 * z }) }, tone: "#ffe8c8", ambient: "warm" };
  };

  /* ---------------------------------------------------------------- DESIERTO */
  VSV.WORLDS.desert = function (root, defs, W, H, seed) {
    const L = [], gr = VSV.groundOf(W, H, "desert"), hz = gr.horizon, R = rng(seed + 71);
    const s = sky(L, root, defs, W, H, [[0, "#3a8ad2"], [0.55, "#9acff2"], [1, "#fff0d0"]]);
    sun(s.inner, defs, W * 0.2, hz - H * 0.32, Math.max(W, H) * 0.05, "#fffbe0");
    hills(L, root, 0.15, 1700, W, hz, H * 0.12, "#e8b878", seed + 7);
    hills(L, root, 0.35, 1300, W, hz, H * 0.08, "#dca060", seed + 8);
    const cac = layer(L, root, 0.6, 1100);
    for (let k = -3; k <= 4; k++) {
      const x = k * 1100 + 500 + R() * 200, y = hz + 30, sc = 1 + R() * 0.4;
      el("path", { d: `M${f1(x)},${f1(y)} l0,${f1(-200 * sc)}`, stroke: "#4a8a3a", "stroke-width": 44 * sc, "stroke-linecap": "round" }, cac.inner);
      el("path", { d: `M${f1(x)},${f1(y - 90 * sc)} l-50,0 l0,-60 M${f1(x)},${f1(y - 120 * sc)} l50,0 l0,-50`, stroke: "#4a8a3a", "stroke-width": 26 * sc, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, cac.inner);
    }
    groundRect(L, root, defs, W, H, hz, "#f0c888", "#d09a58", defs.pattern(140, 40, (p) => el("path", { d: "M0,30 q35,-14 70,0 t70,0", stroke: "#c08a48", "stroke-width": 3, fill: "none", opacity: 0.4 }, p)));
    return { layers: L, ground: gr, tone: "#fff0d0", ambient: "warm" };
  };

  /* ---------------------------------------------------------------- NIEVE / POLO */
  VSV.WORLDS.snow = function (root, defs, W, H, seed) {
    const L = [], gr = VSV.groundOf(W, H, "snow"), hz = gr.horizon, R = rng(seed + 81);
    sky(L, root, defs, W, H, [[0, "#6a8ab8"], [0.6, "#c8dcf0"], [1, "#f4faff"]]);
    const mt = layer(L, root, 0.15, 1600);
    for (let k = -3; k <= 4; k++) { const x = k * 1600; el("path", { d: `M${x},${hz + 10} L${x + 400},${f1(hz - H * 0.3)} L${x + 800},${hz + 10} L${x + 1100},${f1(hz - H * 0.2)} L${x + 1600},${hz + 10} Z`, fill: "#dfe8f4" }, mt.inner); el("path", { d: `M${x + 330},${f1(hz - H * 0.23)} L${x + 400},${f1(hz - H * 0.3)} L${x + 470},${f1(hz - H * 0.23)} Z`, fill: "#ffffff" }, mt.inner); }
    const ice = layer(L, root, 0.45, 1200);
    for (let k = -3; k <= 4; k++) { const x = k * 1200 + R() * 300; el("path", { d: `M${f1(x)},${hz + 20} l60,-110 l90,-20 l40,130 Z`, fill: "#c8e4f8" }, ice.inner); el("path", { d: `M${f1(x + 60)},${hz - 90} l90,-20 l-20,60 Z`, fill: "#ffffff", opacity: 0.7 }, ice.inner); }
    groundRect(L, root, defs, W, H, hz, "#f4f8fc", "#d0e0f0", null);
    const flakes = layer(L, root, 1.1);
    const fl = [];
    for (let i = 0; i < 70; i++) fl.push({ e: el("circle", { r: 2 + R() * 4, fill: "#ffffff", opacity: 0.85 }, flakes.inner), x: R() * W * 1.4 - W * 0.2, y: R() * H, v: 30 + R() * 60, p: R() * 6 });
    flakes.anim = (t) => fl.forEach((f) => { const y = ((f.y + t * f.v) % (H * 1.1)) - H * 0.05; VSV.setAttr(f.e, "cx", f1(f.x + Math.sin(t + f.p) * 20)); VSV.setAttr(f.e, "cy", f1(y)); });
    return { layers: L, ground: gr, tone: "#e8f4ff", ambient: "day" };
  };

  /* ---------------------------------------------------------------- FONDO MARINO */
  VSV.WORLDS.ocean = function (root, defs, W, H, seed) {
    const L = [], R = rng(seed + 91), hz = H * 0.78;
    const deep = layer(L, root, 0);
    el("rect", { x: -W, y: -H, width: 3 * W, height: 3 * H, fill: defs.linear([[0, "#3ab0d8"], [0.45, "#1a6aa8"], [1, "#0a2a5a"]]) }, deep.inner);
    const rays = layer(L, root, 0.12);
    const rr = [];
    for (let i = 0; i < 5; i++) rr.push(el("path", { d: `M${f1(W * (i * 0.25 - 0.1))},${-H * 0.1} L${f1(W * (i * 0.25 + 0.02))},${-H * 0.1} L${f1(W * (i * 0.25 + 0.3))},${H * 1.1} L${f1(W * (i * 0.25 + 0.12))},${H * 1.1} Z`, fill: "#bff4ff", opacity: 0.1, filter: defs.blur(16) }, rays.inner));
    rays.anim = (t) => rr.forEach((r, i) => VSV.setAttr(r, "opacity", (0.07 + 0.05 * Math.sin(t * 0.7 + i * 1.7)).toFixed(3)));
    const rocks = layer(L, root, 0.35, 1400);
    for (let k = -3; k <= 4; k++) { const x = k * 1400 + R() * 400; el("path", { d: VSV.smoothPath([[x - 220, hz + 40], [x - 160, hz - 120], [x, hz - 190], [x + 150, hz - 110], [x + 240, hz + 40]], true), fill: "#1f4a6a" }, rocks.inner); }
    const coral = layer(L, root, 0.7, 900);
    const weeds = [];
    for (let k = -4; k <= 5; k++) {
      const x = k * 900 + 200 + R() * 300;
      ["#f26a6a", "#f2a24a", "#c86ae2"].forEach((c, i) => { for (let j = 0; j < 3; j++) el("path", { d: `M${f1(x + i * 60)},${hz + 20} q${f1(-20 + j * 20)},-60 ${f1(-30 + j * 30)},${f1(-100 - j * 20)}`, stroke: c, "stroke-width": 14, fill: "none", "stroke-linecap": "round" }, coral.inner); });
      const wg = g(coral.inner);
      el("path", { d: `M${f1(x + 300)},${hz + 30} q30,-80 0,-160 q-30,-80 10,-170`, stroke: "#3a9a5a", "stroke-width": 16, fill: "none", "stroke-linecap": "round" }, wg);
      weeds.push({ g: wg, x: x + 300, p: R() * 6 });
    }
    coral.anim = (t) => weeds.forEach((w) => VSV.setAttr(w.g, "transform", `rotate(${(Math.sin(t * 1.1 + w.p) * 4).toFixed(2)},${f1(w.x)},${hz + 30})`));
    const sand = layer(L, root, 1);
    el("rect", { x: -2 * W, y: hz, width: 5 * W, height: H, fill: defs.linear([[0, "#e8d4a0"], [1, "#b89a62"]]) }, sand.inner);
    const bub = layer(L, root, 1.05);
    const bs = [];
    for (let i = 0; i < 26; i++) bs.push({ e: el("circle", { r: 4 + R() * 9, fill: "none", stroke: "#e4fbff", "stroke-width": 2.5, opacity: 0.7 }, bub.inner), x: R() * W, y: R() * H, v: 40 + R() * 70, p: R() * 6 });
    bub.anim = (t) => bs.forEach((b) => { const y = H * 1.05 - ((H * 1.1 - b.y + t * b.v) % (H * 1.1)); VSV.setAttr(b.e, "cx", f1(b.x + Math.sin(t * 2 + b.p) * 8)); VSV.setAttr(b.e, "cy", f1(y)); });
    return { layers: L, ground: { horizon: hz, near: H * 0.94, at: (z) => ({ y: hz + 20 + (H * 0.94 - hz - 20) * z, s: 0.75 + 0.25 * z }) }, tone: "#bfeaff", ambient: "water", water: true };
  };

  /* ---------------------------------------------------------------- PLAYA */
  VSV.WORLDS.beach = function (root, defs, W, H, seed) {
    const L = [], gr = VSV.groundOf(W, H, "beach"), hz = gr.horizon, R = rng(seed + 101);
    const s = sky(L, root, defs, W, H, [[0, "#3a9ae2"], [0.7, "#a8dcf8"], [1, "#e8f8ff"]]);
    sun(s.inner, defs, W * 0.8, hz - H * 0.3, Math.max(W, H) * 0.05, "#fff8d8");
    clouds(L, root, W, H, hz, seed, 0.85);
    const sea = layer(L, root, 0.2, 800);
    el("rect", { x: -4 * 800, y: hz - H * 0.07, width: 10 * 800, height: H * 0.1, fill: defs.linear([[0, "#2a8ac8"], [1, "#5ac0e2"]]) }, sea.inner);
    const waves = [];
    for (let k = -4; k <= 5; k++) for (let i = 0; i < 3; i++) waves.push(el("path", { d: `M${k * 800 + i * 260},${f1(hz - H * 0.03 + i * 8)} q40,-10 80,0`, stroke: "#ffffff", "stroke-width": 4, fill: "none", opacity: 0.7 }, sea.inner));
    sea.anim = (t) => VSV.setAttr(sea.inner.firstChild, "y", f1(hz - H * 0.07 + Math.sin(t * 0.8) * 3));
    const palms = layer(L, root, 0.5, 1400);
    for (let k = -3; k <= 4; k++) palm(palms.inner, k * 1400 + 300, hz + 40, 1.2, R);
    groundRect(L, root, defs, W, H, hz, "#f4dca8", "#e0bc80", defs.pattern(30, 30, (p) => el("circle", { cx: 8, cy: 12, r: 1.6, fill: "#b8945a", opacity: 0.5 }, p)));
    const fg = layer(L, root, 1.15, 1300);
    for (let k = -3; k <= 4; k++) { const x = k * 1300 + 900; el("path", { d: `M${x},${H * 0.97} q20,-40 40,0 q20,-40 40,0 Z`, fill: "#f2a2b0" }, fg.inner); el("circle", { cx: x - 200, cy: H * 0.97, r: 14, fill: "#f8f0e4" }, fg.inner); }
    return { layers: L, ground: gr, tone: "#fff4d8", ambient: "day" };
  };

  /* ---------------------------------------------------------------- RÍO / ESTANQUE */
  VSV.WORLDS.river = function (root, defs, W, H, seed) {
    const L = [], gr = VSV.groundOf(W, H, "river"), hz = gr.horizon, R = rng(seed + 111);
    sky(L, root, defs, W, H, [[0, "#5a9ad8"], [0.6, "#b8dcf2"], [1, "#eaf6ff"]]);
    clouds(L, root, W, H, hz, seed, 0.8);
    hills(L, root, 0.2, 1700, W, hz, H * 0.14, "#7fae6a", seed + 9);
    const trees = layer(L, root, 0.4, 900);
    for (let k = -4; k <= 5; k++) VSV.PROPS.tree(trees.inner, defs, k * 900 + 300 + R() * 200, hz + 6, 1.0, seed + k);
    const gl = groundRect(L, root, defs, W, H, hz, "#7ab85a", "#4a8a3a", null);
    // agua: franja central con reflejos (los animales del agua flotan sobre ella)
    const wy = hz + (H - hz) * 0.32;
    el("rect", { x: -2 * W, y: wy, width: 5 * W, height: (H - hz) * 0.5, fill: defs.linear([[0, "#5ab0d8"], [1, "#2a7ab0"]]) }, gl.inner);
    const sh = [];
    for (let i = 0; i < 18; i++) sh.push(el("path", { d: `M0,0 l${40 + R() * 60},0`, stroke: "#ffffff", "stroke-width": 4, opacity: 0.5, "stroke-linecap": "round", transform: `translate(${f1(R() * W * 2 - W * 0.5)},${f1(wy + 20 + R() * (H - hz) * 0.42)})` }, gl.inner));
    for (let k = -6; k <= 8; k++) { const x = k * 300 + R() * 100; el("ellipse", { cx: x, cy: wy + (H - hz) * 0.15, rx: 50, ry: 14, fill: "#3f9a4a" }, gl.inner); }
    gl.anim = (t) => sh.forEach((e, i) => VSV.setAttr(e, "opacity", (0.25 + 0.3 * Math.max(0, Math.sin(t * 1.5 + i))).toFixed(2)));
    const fg = layer(L, root, 1.2, 1100);
    for (let k = -3; k <= 4; k++) for (let i = 0; i < 6; i++) { const x = k * 1100 + 100 + i * 22; el("path", { d: `M${x},${H * 1.03} q${-10 + i * 4},-90 ${-6 + i * 3},-180`, stroke: "#3a7a32", "stroke-width": 8, fill: "none" }, fg.inner); if (i % 2) el("ellipse", { cx: x - 6 + i * 3, cy: H * 1.03 - 190, rx: 9, ry: 30, fill: "#6a4a2a" }, fg.inner); }
    return { layers: L, ground: gr, tone: "#eaffea", ambient: "day" };
  };

  /* ---------------------------------------------------------------- CIELO */
  VSV.WORLDS.sky = function (root, defs, W, H, seed) {
    const L = [], R = rng(seed + 121);
    const s = sky(L, root, defs, W, H, [[0, "#2a7ad8"], [0.6, "#8ac4f2"], [1, "#dff2ff"]]);
    sun(s.inner, defs, W * 0.78, H * 0.18, Math.max(W, H) * 0.05, "#fff8d8");
    clouds(L, root, W, H, H * 0.7, seed, 0.75);
    const near = layer(L, root, 0.6, 1500);
    for (let k = -3; k <= 4; k++) for (let i = 0; i < 2; i++) {
      const cx = k * 1500 + i * 700 + R() * 200, cy = H * (0.75 + R() * 0.3), sc = 1.6 + R();
      const gg = g(near.inner, { transform: `translate(${f1(cx)},${f1(cy)}) scale(${sc.toFixed(2)})` });
      [[-90, 10, 80], [0, -24, 100], [100, 8, 80], [20, 34, 90]].forEach(([x, y, r]) => el("circle", { cx: x, cy: y, r, fill: "#ffffff" }, gg));
    }
    return { layers: L, ground: { horizon: H * 0.7, near: H * 0.85, at: (z) => ({ y: H * (0.72 + 0.12 * z), s: 1 }) }, tone: "#e8f4ff", ambient: "day", noGround: true };
  };

  /* ---------------------------------------------------------------- NOCHE (prado con luna) */
  VSV.WORLDS.night = function (root, defs, W, H, seed) {
    const L = [], gr = VSV.groundOf(W, H, "night"), hz = gr.horizon, R = rng(seed + 131);
    const s = sky(L, root, defs, W, H, [[0, "#0a1030"], [0.6, "#1f2a5a"], [1, "#3a3a6a"]]);
    const st = [];
    for (let i = 0; i < 120; i++) st.push({ e: el("circle", { cx: (R() * 1.6 - 0.3) * W, cy: R() * hz, r: 0.8 + R() * 2, fill: "#ffffff" }, s.inner), p: R() * 6, f: 0.5 + R() * 2 });
    el("circle", { cx: W * 0.75, cy: H * 0.18, r: Math.max(W, H) * 0.2, fill: defs.radial([[0, "#fff8d8", 0.35], [1, "#fff8d8", 0]]) }, s.inner);
    el("circle", { cx: W * 0.75, cy: H * 0.18, r: Math.max(W, H) * 0.045, fill: "#fff6d0" }, s.inner);
    s.anim = (t) => st.forEach((x) => VSV.setAttr(x.e, "opacity", (0.4 + 0.5 * Math.sin(t * x.f + x.p)).toFixed(2)));
    hills(L, root, 0.2, 1700, W, hz, H * 0.12, "#1a2a4a", seed + 11);
    const trees = layer(L, root, 0.45, 800);
    for (let k = -4; k <= 5; k++) pine(trees.inner, k * 800 + 200 + R() * 300, hz + 20, 1.4 + R() * 0.5, "#14203a");
    groundRect(L, root, defs, W, H, hz, "#22385a", "#101a30", null);
    return { layers: L, ground: gr, tone: "#8f9cff", ambient: "night" };
  };

  /* ---------------------------------------------------------------- JARDÍN DE CERCA (insectos) */
  VSV.WORLDS.garden = function (root, defs, W, H, seed) {
    const L = [], gr = VSV.groundOf(W, H, "garden"), hz = gr.horizon, R = rng(seed + 141);
    sky(L, root, defs, W, H, [[0, "#9ad2f2"], [0.7, "#d8f0ff"], [1, "#f4fbff"]]);
    const bokeh = layer(L, root, 0.1);
    for (let i = 0; i < 18; i++) el("circle", { cx: R() * W * 1.4 - W * 0.2, cy: R() * hz, r: 30 + R() * 80, fill: ["#f8c8d8", "#fff0a8", "#c8f0c8"][i % 3], opacity: 0.35, filter: defs.blur(14) }, bokeh.inner);
    const back = layer(L, root, 0.35, 700);
    for (let k = -4; k <= 5; k++) for (let i = 0; i < 3; i++) flower(back.inner, k * 700 + i * 230 + R() * 60, hz + 40, 2 + R(), ["#f26a8a", "#fff", "#c86ae2"][i % 3], R);
    const blades = layer(L, root, 0.7, 500);
    for (let k = -5; k <= 6; k++) for (let i = 0; i < 9; i++) { const x = k * 500 + i * 55 + R() * 20, h = H * (0.25 + R() * 0.25); el("path", { d: `M${f1(x)},${hz + 60} q${f1(-30 + R() * 60)},${f1(-h * 0.5)} ${f1(-40 + R() * 80)},${f1(-h)} q10,${f1(h * 0.5)} 22,${f1(h)} Z`, fill: i % 2 ? "#5aa83a" : "#4a9a32" }, blades.inner); }
    groundRect(L, root, defs, W, H, hz, "#6a4a32", "#4a3222", defs.pattern(50, 40, (p) => { el("circle", { cx: 10, cy: 10, r: 4, fill: "#8a6a4a", opacity: 0.6 }, p); el("circle", { cx: 34, cy: 28, r: 6, fill: "#3a2a1a", opacity: 0.4 }, p); }));
    const fg = layer(L, root, 1.3, 900);
    for (let k = -3; k <= 4; k++) { const x = k * 900 + 140; el("path", { d: `M${x},${H * 1.05} q-120,-300 40,-560 q60,200 -40,560 Z`, fill: "#3f8a2a", opacity: 0.9 }, fg.inner); }
    return { layers: L, ground: gr, tone: "#f4ffe0", ambient: "day" };
  };

  Object.assign(VSV.WORLD_ASSETS, {
    forest_day_v1: "forest", jungle_v1: "jungle", savanna_v1: "savanna", farm_v1: "farm", home_living_v1: "home", desert_v1: "desert",
    snow_v1: "snow", ocean_under_v1: "ocean", beach_v1: "beach", river_v1: "river", sky_v1: "sky", night_meadow_v1: "night", garden_macro_v1: "garden",
  });
  // suelos planos propios (salón, fondo marino, cielo): mismos valores que devuelve cada mundo
  VSV.FLAT_GROUNDS = {
    home: (W, H) => { const hz = H * 0.66; return { horizon: hz, near: H * 0.9, flat: true, at: (z) => ({ y: hz + 30 + (H * 0.9 - hz - 30) * z, s: 1 }) }; },
    ocean: (W, H) => { const hz = H * 0.78; return { horizon: hz, near: H * 0.94, flat: true, at: (z) => ({ y: hz + 20 + (H * 0.94 - hz - 20) * z, s: 1 }) }; },
    sky: (W, H) => ({ horizon: H * 0.7, near: H * 0.85, flat: true, at: (z) => ({ y: H * (0.72 + 0.12 * z), s: 1 }) }),
  };
  // escenarios con suelo en perspectiva (profundidad z → altura y escala); los demás son planos
  VSV.PERSPECTIVE_WORLDS = { plaza: 1, park: 1, forest: 1, jungle: 1, savanna: 1, farm: 1, desert: 1, snow: 1, beach: 1, river: 1, night: 1, garden: 1 };
})();
