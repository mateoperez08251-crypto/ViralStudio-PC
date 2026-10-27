/* ==========================================================================
   VIRAL STUDIO ENGINE — núcleo
   Motor de animación 2D determinista para HyperFrames.
   Todo lo que se dibuja es función del tiempo t (segundos). Nada de
   Math.random(), Date.now() ni timers: el mismo t da siempre el mismo frame.
   ========================================================================== */
(function () {
  "use strict";
  const VS = (window.VS = window.VS || {});
  VS.version = "1.0.0";

  /* ---------- números ---------- */
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const seg = (t, a, b) => clamp((t - a) / (b - a || 1e-6));
  const hash = (n) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return s - Math.floor(s);
  };
  const hash2 = (a, b) => hash(a * 12.9898 + b * 78.233);
  // PRNG con semilla (mulberry32) para disposiciones fijas
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
  const strSeed = (s) => {
    let h = 2166136261;
    s = String(s || "");
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0) % 100000;
  };

  /* ---------- curvas ---------- */
  const E = {
    lin: (k) => k,
    out: (k) => 1 - Math.pow(1 - k, 3),
    in: (k) => k * k * k,
    io: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    out4: (k) => 1 - Math.pow(1 - k, 4),
    expo: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
    expoIn: (k) => (k <= 0 ? 0 : Math.pow(2, 10 * k - 10)),
    back: (k) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
    },
    elastic: (k) =>
      k <= 0 ? 0 : k >= 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
    // resorte en forma cerrada (amortiguado), z = amortiguación
    spring: (k, z = 0.55, w = 14) => 1 - Math.exp(-z * w * k) * Math.cos(w * Math.sqrt(1 - z * z) * k),
  };
  // golpe: 0 → 1 → 0 durante d segundos a partir de t0
  const bump = (t, t0, d) => {
    const k = (t - t0) / d;
    return k < 0 || k > 1 ? 0 : Math.sin(k * Math.PI);
  };
  // decaimiento tras un impacto
  const decay = (t, t0, d) => {
    const k = (t - t0) / d;
    return k < 0 || k > 1 ? 0 : Math.pow(1 - k, 2);
  };

  /* ---------- color ---------- */
  const _rgbCache = {};
  function hexRGB(c) {
    if (Array.isArray(c)) return c;
    if (_rgbCache[c]) return _rgbCache[c];
    let r = 0, g = 0, b = 0;
    if (typeof c === "string" && c[0] === "#") {
      let h = c.slice(1);
      if (h.length === 3) h = h.split("").map((x) => x + x).join("");
      r = parseInt(h.slice(0, 2), 16);
      g = parseInt(h.slice(2, 4), 16);
      b = parseInt(h.slice(4, 6), 16);
    } else if (typeof c === "string" && c.startsWith("rgb")) {
      const m = c.match(/[\d.]+/g) || [0, 0, 0];
      r = +m[0]; g = +m[1]; b = +m[2];
    }
    return (_rgbCache[c] = [r, g, b]);
  }
  const mix = (a, b, k) => {
    const A = hexRGB(a), B = hexRGB(b);
    k = clamp(k);
    return `rgb(${Math.round(lerp(A[0], B[0], k))},${Math.round(lerp(A[1], B[1], k))},${Math.round(lerp(A[2], B[2], k))})`;
  };
  const rgba = (c, a) => {
    const A = hexRGB(c);
    return `rgba(${A[0]},${A[1]},${A[2]},${clamp(a)})`;
  };
  const shade = (c, k) => (k >= 0 ? mix(c, "#ffffff", k) : mix(c, "#000000", -k));

  Object.assign(VS, { clamp, lerp, seg, hash, hash2, rng, strSeed, E, bump, decay, hexRGB, mix, rgba, shade });

  /* ---------- estilos visuales ----------
     El compilador manda un objeto "style" que se mezcla con estos valores. */
  VS.STYLE_BASE = {
    mode: "line",          // line | puppet | silhouette | chalk | comic | neon | ink
    bg: "#0f1116",
    bg2: "#1b1f2a",
    ground: "#15181f",
    ink: "#efe6d6",
    head: "#16181f",
    accent: "#e3a83e",
    danger: "#c4473a",
    cool: "#6f9fd8",
    good: "#6fbf73",
    crowd: "#b3bccb",
    skin: "#efd5ae",
    lineW: 7,
    boil: 12,              // veces por segundo que "hierve" la línea (0 = quieta)
    jitter: 1.6,
    step: 0,               // 0 = fluido; 15 = stop-motion a 15 cuadros/s
    grain: 0.06,
    vignette: 0.55,
    texture: "none",       // none | paper | parchment | board | halftone | scan
    glow: 0,
    letterbox: 0,
    font: "Montserrat",
    fontDisplay: "Archivo Black",
    fontSerif: "EB Garamond",
    outfits: ["#5d6b7f", "#7b5a47", "#56664f", "#6e5a70", "#8a7356", "#4f5d6b"],
    hairs: ["#4a3426", "#2e2420", "#6b4a2e", "#3b3b40", "#a07a4a"],
  };

  /* ---------- lápiz: abstrae cómo se traza según el estilo ---------- */
  function Pen(ctx, st) {
    this.ctx = ctx;
    this.st = st;
  }
  Pen.prototype.stroke = function (path, col, w, opts = {}) {
    const c = this.ctx, st = this.st;
    c.lineCap = "round";
    c.lineJoin = "round";
    const mode = st.mode;
    if (mode === "comic" || mode === "puppet") {
      c.strokeStyle = opts.outline || "#14110f";
      c.lineWidth = w + (mode === "comic" ? 7 : 5);
      path(c);
      c.stroke();
    }
    if (mode === "neon" || st.glow) {
      c.save();
      c.shadowColor = col;
      c.shadowBlur = (st.glow || 18) * (opts.glow == null ? 1 : opts.glow);
      c.strokeStyle = col;
      c.lineWidth = w;
      path(c);
      c.stroke();
      c.restore();
      return;
    }
    if (mode === "chalk") {
      c.save();
      c.globalAlpha *= 0.9;
      c.strokeStyle = col;
      c.lineWidth = w;
      path(c);
      c.stroke();
      c.globalAlpha *= 0.35;
      c.lineWidth = w * 1.8;
      path(c);
      c.stroke();
      c.restore();
      return;
    }
    c.strokeStyle = col;
    c.lineWidth = w;
    path(c);
    c.stroke();
  };
  Pen.prototype.fill = function (path, col, opts = {}) {
    const c = this.ctx, st = this.st;
    if (st.mode === "neon" || st.glow) {
      c.save();
      c.shadowColor = opts.glowCol || col;
      c.shadowBlur = (st.glow || 18) * 0.8;
      c.fillStyle = col;
      path(c);
      c.fill();
      c.restore();
    } else {
      c.fillStyle = col;
      path(c);
      c.fill();
    }
    if (opts.outline !== false && (st.mode === "comic" || st.mode === "puppet")) {
      c.strokeStyle = opts.outline || "#14110f";
      c.lineWidth = st.mode === "comic" ? 5 : 3;
      path(c);
      c.stroke();
    }
  };
  VS.Pen = Pen;

  /* ---------- texto en canvas ---------- */
  VS.text = function (ctx, str, x, y, o = {}) {
    const size = o.size || 80;
    ctx.save();
    ctx.font = `${o.weight || 900} ${size}px "${o.font || "Archivo Black"}"`;
    ctx.textAlign = o.align || "center";
    ctx.textBaseline = o.baseline || "middle";
    if (o.letter) ctx.letterSpacing = o.letter + "px";
    let s = String(str);
    if (o.upper) s = s.toUpperCase();
    if (o.maxW) {
      let w = ctx.measureText(s).width;
      if (w > o.maxW) {
        const k = o.maxW / w;
        ctx.font = `${o.weight || 900} ${Math.floor(size * k)}px "${o.font || "Archivo Black"}"`;
      }
    }
    if (o.shadow) {
      ctx.fillStyle = o.shadow;
      ctx.fillText(s, x + (o.sx == null ? 0 : o.sx), y + (o.sy == null ? size * 0.07 : o.sy));
    }
    if (o.glow) {
      ctx.shadowColor = o.glow;
      ctx.shadowBlur = o.glowBlur || 30;
    }
    if (o.stroke) {
      ctx.lineJoin = "round";
      ctx.strokeStyle = o.stroke;
      ctx.lineWidth = o.strokeW || size * 0.12;
      ctx.strokeText(s, x, y);
    }
    ctx.fillStyle = o.color || "#fff";
    ctx.fillText(s, x, y);
    ctx.restore();
  };
  VS.measure = function (ctx, str, size, font, weight) {
    ctx.save();
    ctx.font = `${weight || 900} ${size}px "${font || "Archivo Black"}"`;
    const w = ctx.measureText(String(str)).width;
    ctx.restore();
    return w;
  };
  // ajusta texto a varias líneas
  VS.wrap = function (ctx, str, size, font, maxW, weight) {
    const words = String(str).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";
    ctx.save();
    ctx.font = `${weight || 900} ${size}px "${font || "Archivo Black"}"`;
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (ctx.measureText(test).width > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = test;
    }
    if (cur) lines.push(cur);
    ctx.restore();
    return lines;
  };
})();
