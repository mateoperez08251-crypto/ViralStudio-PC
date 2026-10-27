/* ==========================================================================
   VIRAL STUDIO PRO — motor VECTORIAL (núcleo)
   Escenas SVG con marionetas articuladas, capas 2.5D, cámara e infografías.
   Determinista: todo estado visual es función PURA del tiempo absoluto t
   (segundos del audio). Sin Math.random, Date.now ni requestAnimationFrame.
   Convive con el motor Canvas clásico (VS.*): este vive en VSV.*.
   Las funciones de estado (poses, cámara, contadores) no tocan el DOM y se
   prueban en Node; los "builders" crean SVG solo cuando hay document.
   ========================================================================== */
(function () {
  "use strict";
  const G = typeof window !== "undefined" ? window : globalThis;
  const VSV = (G.VSV = G.VSV || {});
  VSV.version = "1.0.0";
  const NS = "http://www.w3.org/2000/svg";
  VSV.NS = NS;

  /* ---------- números ---------- */
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const seg = (t, a, b) => clamp((t - a) / (b - a || 1e-6));
  const smooth = (k) => { k = clamp(k); return k * k * (3 - 2 * k); };
  const fract = (x) => x - Math.floor(x);
  const hash = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453123);
  const strSeed = (s) => {
    let h = 2166136261;
    s = String(s || "");
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0) % 100000;
  };
  // PRNG con semilla (mulberry32): disposiciones fijas (estrellas, adoquines…)
  function rng(seed) {
    let a = (seed * 2654435761) >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // ruido 1D suave (valor) — para respiración, temblores, deriva de cámara
  function noise1(x, seed = 0) {
    const i = Math.floor(x), f = x - i;
    const a = hash(i + seed * 17.13), b = hash(i + 1 + seed * 17.13);
    return lerp(a, b, f * f * (3 - 2 * f)) * 2 - 1;
  }
  const E = {
    lin: (k) => k,
    in: (k) => k * k * k,
    out: (k) => 1 - Math.pow(1 - k, 3),
    io: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    sine: (k) => -(Math.cos(Math.PI * k) - 1) / 2,
    back: (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
    elastic: (k) => (k <= 0 ? 0 : k >= 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
    expo: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
  };
  // envolvente de una acción puntual: sube en `a`, se mantiene, baja en `r`
  function env(t, t0, dur, a = 0.18, r = 0.28) {
    if (t < t0 || t > t0 + dur + r) return 0;
    if (t < t0 + a) return E.sine((t - t0) / a);
    if (t <= t0 + dur) return 1;
    return 1 - E.sine((t - t0 - dur) / r);
  }
  const bump = (t, t0, d) => { const k = (t - t0) / d; return k < 0 || k > 1 ? 0 : Math.sin(k * Math.PI); };

  /* ---------- pistas de keyframes: [[t, valor], …] con easing por tramo ---------- */
  function track(keys, t, ease = E.io) {
    if (!keys.length) return 0;
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const [t0, v0] = keys[i - 1], [t1, v1, e] = keys[i];
        const k = (e || ease)((t - t0) / (t1 - t0 || 1e-6));
        return lerp(v0, v1, k);
      }
    }
    return keys[keys.length - 1][1];
  }

  /* ---------- color ---------- */
  function hexRGB(c) {
    if (Array.isArray(c)) return c;
    let h = String(c || "#000").replace("#", "");
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
  }
  const toHex = (r) => "#" + r.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, k) => { const A = hexRGB(a), B = hexRGB(b); return toHex([lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k)]); };
  const shade = (c, k) => (k >= 0 ? mix(c, "#ffffff", k) : mix(c, "#000000", -k));
  const rgba = (c, a) => { const A = hexRGB(c); return `rgba(${A[0]},${A[1]},${A[2]},${clamp(a)})`; };

  Object.assign(VSV, { clamp, lerp, seg, smooth, fract, hash, strSeed, rng, noise1, E, env, bump, track, hexRGB, mix, shade, rgba });

  /* ---------- transformaciones 2D (matrices) para calcular puntos de mundo sin DOM ---------- */
  // m = [a,b,c,d,e,f] como en SVG: x' = a x + c y + e ; y' = b x + d y + f
  const M = {
    id: () => [1, 0, 0, 1, 0, 0],
    mul: (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]],
    tr: (x, y) => [1, 0, 0, 1, x, y],
    rot: (r) => [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0],
    sc: (x, y = x) => [x, 0, 0, y, 0, 0],
    apply: (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]],
  };
  VSV.M = M;
  // transformación de una pieza: posición del pivote + rotación + escala alrededor del pivote
  // p = {x,y,r,sx,sy} ; pivot = [px,py] en coordenadas del padre (posición de reposo)
  function partMatrix(pivot, p) {
    const px = pivot[0] + (p.x || 0), py = pivot[1] + (p.y || 0);
    let m = M.tr(px, py);
    if (p.r) m = M.mul(m, M.rot(p.r));
    if (p.sx != null || p.sy != null) m = M.mul(m, M.sc(p.sx == null ? 1 : p.sx, p.sy == null ? 1 : p.sy));
    return M.mul(m, M.tr(-pivot[0], -pivot[1]));
  }
  VSV.partMatrix = partMatrix;
  const f3 = (v) => Math.round(v * 1000) / 1000;
  VSV.matStr = (m) => `matrix(${f3(m[0])},${f3(m[1])},${f3(m[2])},${f3(m[3])},${f3(m[4])},${f3(m[5])})`;

  /* ---------- SVG ---------- */
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  VSV.el = el;
  VSV.g = (parent, attrs) => el("g", attrs, parent);
  // fábrica de definiciones con ids únicos por instancia (gradientes, filtros, patrones)
  function Defs(svgDefs, prefix) {
    this.d = svgDefs;
    this.p = prefix;
    this.n = 0;
  }
  Defs.prototype.id = function (name) { return `${this.p}-${name}-${this.n++}`; };
  Defs.prototype.linear = function (stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1, extra) {
    const id = this.id("lg");
    const g = el("linearGradient", Object.assign({ id, x1, y1, x2, y2 }, extra || {}), this.d);
    stops.forEach(([o, c, a]) => el("stop", { offset: o, "stop-color": c, "stop-opacity": a == null ? 1 : a }, g));
    return `url(#${id})`;
  };
  Defs.prototype.radial = function (stops, cx = 0.5, cy = 0.5, r = 0.5, extra) {
    const id = this.id("rg");
    const g = el("radialGradient", Object.assign({ id, cx, cy, r }, extra || {}), this.d);
    stops.forEach(([o, c, a]) => el("stop", { offset: o, "stop-color": c, "stop-opacity": a == null ? 1 : a }, g));
    return `url(#${id})`;
  };
  Defs.prototype.blur = function (sd) {
    const id = this.id("bl");
    const f = el("filter", { id, x: "-50%", y: "-50%", width: "200%", height: "200%" }, this.d);
    el("feGaussianBlur", { stdDeviation: sd }, f);
    return `url(#${id})`;
  };
  Defs.prototype.shadow = function (dx, dy, sd, col, op) {
    const id = this.id("sh");
    const f = el("filter", { id, x: "-50%", y: "-50%", width: "200%", height: "200%" }, this.d);
    el("feDropShadow", { dx, dy, stdDeviation: sd, "flood-color": col || "#000", "flood-opacity": op == null ? 0.35 : op }, f);
    return `url(#${id})`;
  };
  Defs.prototype.glow = function (sd, col) {
    const id = this.id("gw");
    const f = el("filter", { id, x: "-100%", y: "-100%", width: "300%", height: "300%" }, this.d);
    el("feGaussianBlur", { in: "SourceGraphic", stdDeviation: sd, result: "b" }, f);
    const m = el("feMerge", null, f);
    el("feMergeNode", { in: "b" }, m);
    el("feMergeNode", { in: "SourceGraphic" }, m);
    return `url(#${id})`;
  };
  // textura de grano/papel (feTurbulence es determinista con su semilla)
  Defs.prototype.texture = function (freq, seed, op, col) {
    const id = this.id("tx");
    const f = el("filter", { id, x: "0%", y: "0%", width: "100%", height: "100%" }, this.d);
    el("feTurbulence", { type: "fractalNoise", baseFrequency: freq, numOctaves: 2, seed: seed || 3, result: "n" }, f);
    el("feColorMatrix", { in: "n", type: "matrix", values: `0 0 0 0 ${hexRGB(col || "#000")[0] / 255} 0 0 0 0 ${hexRGB(col || "#000")[1] / 255} 0 0 0 0 ${hexRGB(col || "#000")[2] / 255} 0 0 0 ${op || 0.25} 0`, result: "c" }, f);
    el("feComposite", { in: "c", in2: "SourceGraphic", operator: "in" }, f);
    return `url(#${id})`;
  };
  Defs.prototype.pattern = function (w, h, draw, extra) {
    const id = this.id("pt");
    const p = el("pattern", Object.assign({ id, width: w, height: h, patternUnits: "userSpaceOnUse" }, extra || {}), this.d);
    draw(p);
    return `url(#${id})`;
  };
  Defs.prototype.clip = function (draw) {
    const id = this.id("cp");
    const c = el("clipPath", { id }, this.d);
    draw(c);
    return `url(#${id})`;
  };
  VSV.Defs = Defs;

  // camino suavizado (Catmull-Rom → Bézier) a partir de puntos
  VSV.smoothPath = function (pts, closed) {
    if (pts.length < 2) return "";
    const P = closed ? pts.concat(pts.slice(0, 3)) : pts;
    let d = `M${f3(P[0][0])},${f3(P[0][1])}`;
    const n = closed ? pts.length : P.length - 1;
    for (let i = 0; i < n; i++) {
      const p0 = P[i - 1 < 0 ? (closed ? pts.length - 1 : 0) : i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${f3(c1[0])},${f3(c1[1])} ${f3(c2[0])},${f3(c2[1])} ${f3(p2[0])},${f3(p2[1])}`;
    }
    return d + (closed ? "Z" : "");
  };
  // cápsula (extremidad) de (0,0) hacia abajo con largo L y anchos w0→w1
  VSV.capsule = function (L, w0, w1) {
    const a = w0 / 2, b = w1 / 2;
    return `M${-a},0 C${-a},${-a * 1.1} ${a},${-a * 1.1} ${a},0 L${b},${L} C${b},${L + b * 1.2} ${-b},${L + b * 1.2} ${-b},${L} Z`;
  };

  /* ---------- zonas seguras: nada importante se sale del cuadro ---------- */
  VSV.SAFE = 0.05; // margen lateral (fracción del ancho) que ningún texto/rótulo puede invadir
  // ancho real de un elemento SVG ya dibujado (con la tipografía cargada); 0 si no se puede medir
  VSV.measure = function (e) {
    try { const b = e.getBBox(); return b.width || 0; } catch (err) { return 0; }
  };
  // factor (≤1) para que un ancho quepa en maxW
  VSV.fitScale = (w, maxW) => (w > maxW && w > 0 ? maxW / w : 1);

  /* ---------- registro de rigs/fondos/props/infografías ---------- */
  VSV.RIGS = VSV.RIGS || {};
  VSV.WORLDS = VSV.WORLDS || {};
  VSV.PROPS = VSV.PROPS || {};
  VSV.OVERLAYS = VSV.OVERLAYS || {};

  /* acciones puntuales (beats) → duración por defecto (s) */
  VSV.BEAT_DUR = { blink: 0.16, hop: 0.55, look_left: 1.4, look_right: 1.4, surprise: 1.3, point: 1.8, wave: 1.6, talk: 1.6, think: 2.0,
    peck: 0.7, head_stabilize: 2.4, body_bob: 2.0, wake: 1.6, snore: 1.6, mouth_open: 1.2, dilate: 1.5, appear: 0.6, descend: 2.2 };
  // peso de una acción puntual en t (0..1), con subida/bajada suaves
  VSV.beatWeight = function (beats, action, t) {
    let w = 0;
    for (const b of beats || []) {
      if (b.action !== action) continue;
      const d = b.dur || VSV.BEAT_DUR[action] || 1;
      w = Math.max(w, env(t, b.at, d, Math.min(0.18, d * 0.3), Math.min(0.3, d * 0.4)));
    }
    return w;
  };
  // tiempo desde el último beat de una acción (o null)
  VSV.beatSince = function (beats, action, t) {
    let best = null;
    for (const b of beats || []) if (b.action === action && b.at <= t && (best == null || t - b.at < best)) best = t - b.at;
    return best;
  };
  // parpadeo automático determinista (cada 2.6–4.6 s) + parpadeos pedidos
  VSV.blinkAt = function (T, seed, beats) {
    let k = 0;
    const per = 2.6 + hash(seed) * 2.0;
    const ph = fract(T / per + hash(seed + 3));
    const bl = 0.14 / per;
    if (ph < bl) k = Math.sin((ph / bl) * Math.PI);
    for (const b of beats || []) if (b.action === "blink") k = Math.max(k, bump(T, b.at, 0.16));
    return k; // 0 abierto … 1 cerrado
  };
})();
