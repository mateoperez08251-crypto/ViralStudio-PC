/* ==========================================================================
   VIRAL STUDIO PRO — escenarios por capas (2.5D) y props ilustrados
   Un escenario devuelve capas con profundidad d (0 = infinito/cielo,
   1 = plano de los personajes, >1 = primer plano). El director aplica la
   cámara a cada capa con su d (parallax). Capas con `tile` se repiten en x
   para que la cámara pueda seguir a un personaje que camina sin fin.
   ========================================================================== */
(function () {
  "use strict";
  const G = typeof window !== "undefined" ? window : globalThis;
  const VSV = G.VSV;
  const { clamp, lerp, hash, rng, mix, shade, rgba, noise1 } = VSV;
  const el = (...a) => VSV.el(...a);
  const g = (p, a) => VSV.el("g", a, p);

  // geometría común del suelo: horizonte y línea base de personajes
  VSV.groundOf = function (W, H, kind) {
    const portrait = H > W;
    const horizon = H * (kind === "bedroom" ? 0.62 : portrait ? 0.56 : 0.6);
    const near = H * (portrait ? 0.86 : 0.9);
    return { horizon, near, portrait,
      // profundidad z (0 lejos … 1 cerca) → y en pantalla y escala
      at(z) { const y = horizon + (near - horizon) * z; return { y, s: Math.max(0.05, (y - horizon) / (near - horizon)) }; } };
  };

  function layer(L, root, depth, tile) {
    const outer = g(root, { "data-depth": depth });
    const inner = g(outer);
    const o = { g: outer, inner, depth, tile: tile || 0, anim: null };
    L.push(o);
    return o;
  }

  /* ---------------------------------------------------------------- PLAZA */
  VSV.WORLDS.plaza = function (root, defs, W, H, seed, opts) {
    const L = [];
    const gr = VSV.groundOf(W, H, "plaza");
    const hz = gr.horizon, R = rng(seed + 11);
    const span = [-1.6 * W, 2.6 * W];
    // cielo
    const sky = layer(L, root, 0);
    el("rect", { x: -W, y: -H, width: 3 * W, height: 3 * H, fill: defs.linear([[0, "#5f7393"], [0.38, "#a9a3ab"], [0.62, "#f0c193"], [0.8, "#fbe2bd"], [1, "#fff1d6"]]) }, sky.inner);
    const sunX = W * 0.74, sunY = hz - H * 0.13;
    el("circle", { cx: sunX, cy: sunY, r: Math.max(W, H) * 0.42, fill: defs.radial([[0, "#fff6dc", 0.95], [0.18, "#ffe1a8", 0.6], [0.5, "#ffc98a", 0.18], [1, "#ffc98a", 0]]) }, sky.inner);
    // edificios lejanos (bruma)
    const far = layer(L, root, 0.18, 1400);
    for (let k = -2; k <= 3; k++) {
      let x = k * 1400;
      const r2 = rng(seed + 5);
      while (x < (k + 1) * 1400) {
        const w = 140 + r2() * 160, h = H * (0.12 + r2() * 0.1);
        el("rect", { x, y: hz - h, width: w + 1, height: h + 4, fill: mix("#c9a58e", "#e9cdb2", 0.5 + r2() * 0.3), opacity: 0.75 }, far.inner);
        x += w;
      }
    }
    // edificios principales con ventanas de contraventanas verdes
    const TW = 1500;
    const bl = layer(L, root, 0.38, TW);
    const facades = ["#c99a74", "#d6a985", "#be8d6b", "#d9b18c", "#c49270"];
    for (let k = -2; k <= 3; k++) {
      const r2 = rng(seed + 7);
      let x = k * TW;
      while (x < (k + 1) * TW - 1) {
        const w = Math.min((k + 1) * TW - x, 220 + Math.floor(r2() * 4) * 40);
        const h = H * (0.17 + r2() * 0.1), top = hz - h;
        const col = facades[Math.floor(r2() * facades.length)];
        const bg = g(bl.inner);
        el("rect", { x, y: top, width: w + 1, height: h + 6, fill: defs.linear([[0, shade(col, 0.06)], [1, shade(col, -0.12)]]) }, bg);
        el("rect", { x: x - 4, y: top - 10, width: w + 8, height: 16, fill: "#b8624a" }, bg);
        el("rect", { x, y: top + 6, width: w, height: 5, fill: "#000", opacity: 0.12 }, bg);
        const cols = Math.max(2, Math.floor(w / 72)), rows = Math.max(2, Math.floor((h - 60) / 92));
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          const wx = x + (w / cols) * (i + 0.5) - 14, wy = top + 34 + j * 92;
          if (wy > hz - 175) continue;
          el("rect", { x: wx - 10, y: wy - 4, width: 10, height: 50, fill: "#4f7f5c" }, bg);
          el("rect", { x: wx + 28, y: wy - 4, width: 10, height: 50, fill: "#4f7f5c" }, bg);
          el("rect", { x: wx, y: wy - 4, width: 28, height: 50, fill: "#5a3d2e" }, bg);
          el("rect", { x: wx + 2, y: wy - 2, width: 11, height: 20, fill: "#7a5a46", opacity: 0.6 }, bg);
          el("rect", { x: wx - 12, y: wy + 46, width: 52, height: 5, fill: shade(col, -0.25) }, bg);
        }
        // planta baja: soportales/escaparates y zócalo (al hacer zoom la fachada no queda plana)
        el("rect", { x, y: hz - 112, width: w + 1, height: 8, fill: shade(col, -0.22) }, bg);
        const nArch = Math.max(2, Math.floor(w / 78));
        for (let i = 0; i < nArch; i++) {
          const ax = x + (w / nArch) * (i + 0.5), aw = Math.min(30, w / nArch * 0.36);
          const lit = r2() > 0.55;
          el("path", { d: `M${ax - aw},${hz} L${ax - aw},${hz - 64} Q${ax},${hz - 98} ${ax + aw},${hz - 64} L${ax + aw},${hz} Z`, fill: lit ? "#8a5a3a" : "#5e3d2c" }, bg);
          if (lit) el("path", { d: `M${ax - aw + 6},${hz} L${ax - aw + 6},${hz - 60} Q${ax},${hz - 88} ${ax + aw - 6},${hz - 60} L${ax + aw - 6},${hz} Z`, fill: "#f3c98a", opacity: 0.35 }, bg);
        }
        el("rect", { x, y: hz - 14, width: w + 1, height: 14, fill: shade(col, -0.3), opacity: 0.6 }, bg);
        x += w;
      }
    }
    // farolas
    const lamps = layer(L, root, 0.62, 620);
    for (let k = -4; k <= 6; k++) {
      const x = k * 620 + 180, base = hz + 30, top = hz - H * 0.36;
      el("rect", { x: x - 7, y: top, width: 14, height: base - top, fill: defs.linear([[0, "#3f5a46"], [1, "#22342a"]], 0, 0, 1, 0) }, lamps.inner);
      el("rect", { x: x - 16, y: base - 30, width: 32, height: 30, rx: 4, fill: "#2a3a30" }, lamps.inner);
      el("path", { d: `M${x - 20},${top} L${x + 20},${top} L${x + 12},${top - 54} L${x - 12},${top - 54} Z`, fill: "#2f4536" }, lamps.inner);
      el("path", { d: `M${x - 14},${top - 54} L${x},${top - 84} L${x + 14},${top - 54} Z`, fill: "#22342a" }, lamps.inner);
      el("rect", { x: x - 8, y: top - 48, width: 16, height: 40, fill: "#ffe7b0", opacity: 0.65 }, lamps.inner);
    }
    // suelo: filas de adoquines en perspectiva. Cada fila es una capa con su profundidad, pero nunca
    // "más lejos" que los edificios (el suelo toca su base) y cada fila se prolonga hacia abajo para que,
    // con zoom, la fila siguiente (más cercana, dibujada encima) la tape sin dejar huecos.
    const DB = 0.38;
    const ground = layer(L, root, DB);
    el("rect", { x: span[0], y: hz, width: span[1] - span[0], height: H * 1.4, fill: defs.linear([[0, "#a99079"], [0.25, "#7d6d5f"], [1, "#4b4038"]]) }, ground.inner);
    let y = hz, k = 0;
    while (y < H * 1.25) {
      const z = (y - hz) / (gr.near - hz);
      const rh = Math.max(4, 46 * z), sw = Math.max(10, 92 * z);
      const row = layer(L, root, Math.max(DB, z), sw * 2);
      const base = mix("#8d7d6f", "#5a4e45", clamp(z / 1.6));
      const pat = defs.pattern(sw * 2, rh, (p) => {
        el("rect", { x: 0, y: 0, width: sw * 2, height: rh, fill: base }, p);
        const off = k % 2 ? sw * 0.5 : 0;
        for (let i = -1; i < 3; i++) {
          const x0 = i * sw + off, c = mix("#a39384", "#6d6158", hash(seed + k * 7 + i));
          el("rect", { x: x0 + sw * 0.06, y: rh * 0.1, width: sw * 0.88, height: rh * 0.8, rx: Math.min(rh, sw) * 0.35, fill: c }, p);
          el("rect", { x: x0 + sw * 0.12, y: rh * 0.12, width: sw * 0.6, height: rh * 0.22, rx: rh * 0.1, fill: "#ffffff", opacity: 0.16 }, p);
        }
      });
      el("rect", { x: span[0], y, width: span[1] - span[0], height: rh * 4 + 2, fill: pat }, row.inner);
      y += rh;
      k++;
    }
    // brillo del sol sobre el suelo junto al horizonte
    const haze = layer(L, root, 0.38);
    el("rect", { x: -W, y: hz - H * 0.03, width: 3 * W, height: H * 0.08, fill: defs.linear([[0, "#fff3d6", 0], [0.45, "#ffe9c2", 0.5], [1, "#ffe9c2", 0]]) }, haze.inner);
    // polvo dorado flotando (primer plano)
    const dust = layer(L, root, 1.15);
    const motes = [];
    for (let i = 0; i < 26; i++) motes.push({ e: el("circle", { r: 2 + R() * 4, fill: "#ffe7b0", opacity: 0.5 }, dust.inner), x: R() * W, y: R() * H, s: 4 + R() * 8, p: R() * 10 });
    dust.anim = (t) => motes.forEach((m) => {
      VSV.setAttr(m.e, "cx", (m.x + Math.sin(t * 0.3 + m.p) * 30).toFixed(1));
      VSV.setAttr(m.e, "cy", (((m.y - t * m.s) % H) + H) % H);
    });
    return { layers: L, ground: gr, tone: "#ffd9a0", ambient: "warm" };
  };

  /* ---------------------------------------------------------------- DORMITORIO */
  VSV.WORLDS.bedroom = function (root, defs, W, H, seed) {
    const L = [];
    const gr = VSV.groundOf(W, H, "bedroom");
    const wall = layer(L, root, 0.1);
    el("rect", { x: -W, y: -H, width: 3 * W, height: 3 * H, fill: defs.linear([[0, "#121633"], [0.5, "#2a2d6b"], [1, "#4b3b8a"]], 0, 0, 1, 1) }, wall.inner);
    for (let i = 0; i < 9; i++) el("rect", { x: -W + i * W * 0.4, y: -H, width: W * 0.08, height: 3 * H, fill: "#7a7ee0", opacity: 0.05 + 0.03 * (i % 3) }, wall.inner);
    const rays = layer(L, root, 0.25);
    const rr = [];
    for (let i = 0; i < 3; i++) rr.push(el("path", { d: `M${W * (0.1 + i * 0.25)},-${H * 0.2} L${W * (0.25 + i * 0.25)},-${H * 0.2} L${W * (0.55 + i * 0.25)},${H * 1.1} L${W * (0.3 + i * 0.25)},${H * 1.1} Z`, fill: "#b3b6ff", opacity: 0.06, filter: defs.blur(18) }, rays.inner));
    rays.anim = (t) => rr.forEach((r, i) => VSV.setAttr(r, "opacity", (0.05 + 0.03 * Math.sin(t * 0.5 + i * 2)).toFixed(3)));
    const bed = layer(L, root, 1);
    el("rect", { x: -W, y: gr.horizon - 30, width: 3 * W, height: H, fill: defs.linear([[0, "#b9b2ee"], [0.2, "#8d86d4"], [1, "#4b4596"]]) }, bed.inner);
    el("rect", { x: -W, y: gr.horizon - 34, width: 3 * W, height: 10, fill: "#ffffff", opacity: 0.25 }, bed.inner);
    return { layers: L, ground: { horizon: gr.horizon, near: H * 0.9, at: (z) => ({ y: gr.horizon + 40 + (H * 0.9 - gr.horizon) * z * 0.5, s: 1 }) }, tone: "#8f8cff", ambient: "night" };
  };

  /* ---------------------------------------------------------------- ESPACIO / NEBULOSA */
  VSV.WORLDS.space = function (root, defs, W, H, seed) {
    const L = [];
    const R = rng(seed + 3);
    const deep = layer(L, root, 0);
    el("rect", { x: -W, y: -H, width: 3 * W, height: 3 * H, fill: defs.radial([[0, "#1d1f4a"], [0.6, "#0c0d26"], [1, "#05050f"]]) }, deep.inner);
    const neb = layer(L, root, 0.15);
    [["#5b3fd6", 0.3, 0.3, 0.45], ["#c0397a", 0.75, 0.55, 0.35], ["#2f7fd1", 0.4, 0.8, 0.4], ["#f08a4b", 0.8, 0.15, 0.25]].forEach(([c, x, y, r]) =>
      el("ellipse", { cx: W * x, cy: H * y, rx: Math.max(W, H) * r, ry: Math.max(W, H) * r * 0.6, fill: defs.radial([[0, c, 0.55], [1, c, 0]]) }, neb.inner));
    const st = layer(L, root, 0.3);
    const stars = [];
    for (let i = 0; i < 160; i++) stars.push({ e: el("circle", { cx: (R() * 1.6 - 0.3) * W, cy: (R() * 1.6 - 0.3) * H, r: 0.8 + R() * 2.4, fill: "#ffffff" }, st.inner), p: R() * 6, f: 0.5 + R() * 2 });
    st.anim = (t) => stars.forEach((s) => VSV.setAttr(s.e, "opacity", (0.45 + 0.45 * Math.sin(t * s.f + s.p)).toFixed(2)));
    const gr = VSV.groundOf(W, H, "space");
    return { layers: L, ground: { horizon: H * 0.5, near: H * 0.8, at: (z) => ({ y: H * (0.55 + 0.2 * z), s: 1 }) }, tone: "#a9b4ff", ambient: "night", noGround: true };
  };

  /* ---------------------------------------------------------------- PARQUE */
  VSV.WORLDS.park = function (root, defs, W, H, seed) {
    const L = [];
    const gr = VSV.groundOf(W, H, "park");
    const hz = gr.horizon, R = rng(seed + 9);
    const sky = layer(L, root, 0);
    el("rect", { x: -W, y: -H, width: 3 * W, height: 3 * H, fill: defs.linear([[0, "#4f8fe0"], [0.55, "#9cc8f2"], [1, "#e4f2ff"]]) }, sky.inner);
    el("circle", { cx: W * 0.78, cy: hz - H * 0.32, r: W * 0.07, fill: "#fff8d8" }, sky.inner);
    el("circle", { cx: W * 0.78, cy: hz - H * 0.32, r: W * 0.3, fill: defs.radial([[0, "#fff6c8", 0.7], [1, "#fff6c8", 0]]) }, sky.inner);
    const clouds = layer(L, root, 0.08, 1600);
    for (let k = -2; k <= 3; k++) for (let i = 0; i < 3; i++) {
      const cx = k * 1600 + i * 520 + R() * 200, cy = hz - H * (0.25 + R() * 0.2), s = 0.7 + R() * 0.6;
      const c = g(clouds.inner, { transform: `translate(${cx},${cy}) scale(${s})` });
      [[-80, 10, 70], [0, -20, 90], [90, 8, 70], [20, 30, 80]].forEach(([x, y, r]) => el("circle", { cx: x, cy: y, r, fill: "#ffffff", opacity: 0.92 }, c));
    }
    const hf = layer(L, root, 0.2, 2000);
    el("path", { d: `M${-2 * W},${hz} Q${-W},${hz - 260} 0,${hz - 120} T${2 * W},${hz - 100} T${4 * W},${hz} Z`, fill: "#9cc58a" }, hf.inner);
    const hn = layer(L, root, 0.45, 2400);
    el("path", { d: `M${-2 * W},${hz + 20} Q${-0.5 * W},${hz - 200} ${W * 0.4},${hz - 40} T${2.5 * W},${hz - 60} T${4 * W},${hz + 20} Z`, fill: "#6faa5a" }, hn.inner);
    const trees = layer(L, root, 0.55, 900);
    for (let k = -3; k <= 4; k++) {
      const x = k * 900 + 260, base = hz + 10, s = 1.0;
      VSV.PROPS.tree(trees.inner, defs, x, base, 1.1 * s, seed + k);
    }
    const ground = layer(L, root, 1);
    el("rect", { x: -2 * W, y: hz, width: 5 * W, height: H, fill: defs.linear([[0, "#7fbf5e"], [1, "#3f7f34"]]) }, ground.inner);
    const blades = defs.pattern(40, 30, (p) => el("path", { d: "M5,30 l4,-16 M18,30 l-3,-14 M30,30 l5,-18", stroke: "#2f6a2a", "stroke-width": 3, opacity: 0.22 }, p));
    el("rect", { x: -2 * W, y: hz + H * 0.08, width: 5 * W, height: H, fill: blades }, ground.inner);
    return { layers: L, ground: gr, tone: "#fff4d0", ambient: "day" };
  };

  /* ---------------------------------------------------------------- ESTUDIO (infografías) */
  VSV.WORLDS.studio = function (root, defs, W, H, seed) {
    const L = [];
    const bg = layer(L, root, 0);
    el("rect", { x: -W, y: -H, width: 3 * W, height: 3 * H, fill: defs.radial([[0, "#2a3270"], [0.55, "#151a3e"], [1, "#080a1c"]], 0.5, 0.42, 0.7) }, bg.inner);
    const grid = layer(L, root, 0.2);
    const dots = defs.pattern(48, 48, (p) => el("circle", { cx: 24, cy: 24, r: 2, fill: "#9aa6ff", opacity: 0.18 }, p));
    el("rect", { x: -W, y: -H, width: 3 * W, height: 3 * H, fill: dots }, grid.inner);
    const glow = layer(L, root, 0.35);
    const gl = el("circle", { cx: W * 0.5, cy: H * 0.4, r: Math.max(W, H) * 0.45, fill: defs.radial([[0, "#6f7dff", 0.3], [1, "#6f7dff", 0]]) }, glow.inner);
    glow.anim = (t) => VSV.setAttr(gl, "r", (Math.max(W, H) * (0.45 + 0.03 * Math.sin(t * 0.8))).toFixed(1));
    const gr = VSV.groundOf(W, H, "studio");
    return { layers: L, ground: { horizon: H * 0.62, near: H * 0.8, at: (z) => ({ y: H * (0.66 + 0.16 * z), s: 1 }) }, tone: "#aab4ff", ambient: "studio", noGround: true };
  };

  VSV.WORLD_ASSETS = { plaza_layered_v1: "plaza", bedroom_night_v1: "bedroom", space_nebula_v1: "space", park_day_v1: "park", studio_gradient_v1: "studio" };

  /* ================================================================ PROPS
     prop(parent, defs, x, yBase, scale, seed) → <g> (origen en la base) */
  VSV.PROPS.bench = function (p, defs, x, y, s) {
    const b = g(p, { transform: `translate(${x},${y}) scale(${s})` });
    el("ellipse", { cx: 0, cy: 6, rx: 230, ry: 18, fill: "#000", opacity: 0.25, filter: defs.blur(6) }, b);
    for (const lx of [-170, 170]) el("path", { d: `M${lx - 8},0 L${lx - 8},-120 L${lx + 8},-120 L${lx + 8},0 Z`, fill: "#26282e" }, b);
    for (let i = 0; i < 3; i++) el("rect", { x: -220, y: -128 - i * 30 - (i > 0 ? 40 : 0), width: 440, height: 22, rx: 6, fill: defs.linear([[0, "#b07a4a"], [1, "#7a4f2c"]]) }, b);
    el("rect", { x: -220, y: -136, width: 440, height: 10, fill: "#000", opacity: 0.15 }, b);
    return b;
  };
  VSV.PROPS.lamp = function (p, defs, x, y, s) {
    const b = g(p, { transform: `translate(${x},${y}) scale(${s})` });
    el("rect", { x: -9, y: -700, width: 18, height: 700, fill: "#2c3e33" }, b);
    el("path", { d: "M-26,-700 L26,-700 L16,-770 L-16,-770 Z", fill: "#2f4536" }, b);
    el("rect", { x: -11, y: -764, width: 22, height: 56, fill: "#ffe7b0", opacity: 0.7 }, b);
    return b;
  };
  VSV.PROPS.tree = function (p, defs, x, y, s, seed) {
    const b = g(p, { transform: `translate(${x},${y}) scale(${s})` });
    el("path", { d: "M-16,0 L-10,-170 Q0,-190 10,-170 L16,0 Z", fill: "#6b4a2f" }, b);
    const fol = defs.radial([[0, "#8fd16a"], [1, "#3f8a3a"]], 0.4, 0.35, 0.7);
    [[-60, -200, 80], [55, -215, 85], [0, -280, 100], [-20, -190, 70]].forEach(([cx, cy, r]) => el("circle", { cx, cy, r, fill: fol }, b));
    return b;
  };
  VSV.PROPS.plant = function (p, defs, x, y, s) {
    const b = g(p, { transform: `translate(${x},${y}) scale(${s})` });
    for (let i = 0; i < 9; i++) {
      const a = -1.2 + i * 0.3;
      el("path", { d: `M0,-120 Q${Math.sin(a) * 90},${-200 - Math.cos(a) * 30} ${Math.sin(a) * 150},${-160 - Math.cos(a) * 120}`, stroke: i % 2 ? "#3f8f4a" : "#5fb062", "stroke-width": 18, fill: "none", "stroke-linecap": "round" }, b);
    }
    el("path", { d: "M-80,-130 L80,-130 L60,0 L-60,0 Z", fill: defs.linear([[0, "#c96a3d"], [1, "#8a4426"]], 0, 0, 1, 0) }, b);
    el("rect", { x: -88, y: -140, width: 176, height: 22, rx: 6, fill: "#b55a33" }, b);
    return b;
  };
  VSV.PROPS.camera = function (p, defs, x, y, s) {
    const b = g(p, { transform: `translate(${x},${y}) scale(${s})` });
    el("rect", { x: -150, y: -200, width: 300, height: 190, rx: 26, fill: defs.linear([[0, "#3b3e48"], [1, "#1c1d22"]]) }, b);
    el("rect", { x: -90, y: -236, width: 90, height: 44, rx: 10, fill: "#2a2c33" }, b);
    el("circle", { cx: 10, cy: -105, r: 70, fill: "#14151a" }, b);
    el("circle", { cx: 10, cy: -105, r: 52, fill: defs.radial([[0, "#5a7bd6"], [0.6, "#1e2a55"], [1, "#0a0c16"]]) }, b);
    el("circle", { cx: 30, cy: -125, r: 12, fill: "#fff", opacity: 0.6 }, b);
    el("circle", { cx: 110, cy: -170, r: 12, fill: "#e0473a" }, b);
    return b;
  };
  VSV.PROPS.seeds = function (p, defs, x, y, s, seed) {
    const b = g(p, { transform: `translate(${x},${y}) scale(${s})` });
    const R = rng(seed || 4);
    for (let i = 0; i < 18; i++) el("ellipse", { cx: (R() - 0.5) * 420, cy: -R() * 30, rx: 7, ry: 4, fill: "#e9c77a", transform: `rotate(${(R() * 180).toFixed(0)})` }, b);
    return b;
  };
  VSV.PROPS.book = function (p, defs, x, y, s) {
    const b = g(p, { transform: `translate(${x},${y}) scale(${s})` });
    el("path", { d: "M-260,-20 Q-130,-60 0,-20 Q130,-60 260,-20 L260,-300 Q130,-340 0,-300 Q-130,-340 -260,-300 Z", fill: "#f3ead6", stroke: "#8a6a44", "stroke-width": 6 }, b);
    el("path", { d: "M0,-300 L0,-20", stroke: "#b89a70", "stroke-width": 6 }, b);
    for (let i = 0; i < 8; i++) {
      el("rect", { x: -230, y: -270 + i * 28, width: 190, height: 8, rx: 4, fill: "#8d8270", opacity: 0.55 }, b);
      el("rect", { x: 40, y: -270 + i * 28, width: 190, height: 8, rx: 4, fill: "#8d8270", opacity: 0.55 }, b);
    }
    return b;
  };
  VSV.PROP_ASSETS = { bench_v1: "bench", lamp_v1: "lamp", tree_v1: "tree", plant_v1: "plant", camera_v1: "camera", seeds_v1: "seeds", book_v1: "book" };
})();
