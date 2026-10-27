/* ==========================================================================
   VIRAL STUDIO PRO — criaturas PARAMÉTRICAS (cualquier animal del guion)
   Seis rigs genéricos que se configuran con parámetros del catálogo de
   especies (vs/assets/species.json) o, validados, del LLM:
     quadruped  perro, gato grande, caballo, vaca, elefante, jirafa, león,
                conejo (salta), rana, tortuga, cocodrilo, oso, ratón…
     bird       gallina, pato, búho, loro, pingüino, flamenco, águila,
                colibrí, murciélago (alas de membrana)…
     fish       pez, tiburón, delfín, ballena, pez payaso…
     octopus    pulpo, calamar, medusa
     insect     hormiga, abeja, mosca, mosquito, mariposa, mariquita,
                escarabajo, saltamontes, libélula, luciérnaga…
     snake      serpiente, cobra, gusano, caracol
   Misma convención que 62_vector_characters.js: origen en el suelo bajo el
   animal (los acuáticos: en su centro), mirando a +x, y negativa hacia arriba;
   pose(s) PURA (s.v = parámetros), apply(inst, pose) toca el DOM.
   Cada rig expone metaFor(v) (tamaño y puntos de foco según parámetros).
   ========================================================================== */
(function () {
  "use strict";
  const G = typeof window !== "undefined" ? window : globalThis;
  const VSV = G.VSV;
  const { clamp, lerp, hash, noise1, E, bump, mix, shade, smoothPath, capsule, partMatrix, matStr, rng } = VSV;
  const PI = Math.PI, TAU = PI * 2;
  const el = (...a) => VSV.el(...a);
  const f1 = (v) => Math.round(v * 10) / 10;
  const setAttr = VSV.setAttr, applyParts = VSV.applyParts;

  function mkPart(inst, parent, name, pivot) {
    const g = VSV.el("g", { "data-part": name }, parent);
    inst.parts[name] = g;
    inst.pivots[name] = pivot;
    return g;
  }
  function newInst(rig, parent, kind, v) {
    // la sombra queda FUERA de la raíz: no sube cuando el animal salta o vuela
    const shadow = VSV.el("g", { "data-shadow": kind }, parent);
    const root = VSV.el("g", { "data-rig": kind }, parent);
    return { rig, root, shadow, parts: {}, pivots: {}, extra: {}, v };
  }
  // cápsula de p0 a p1 (extremidad, cuello, cola)
  function capTo(parent, p0, p1, w0, w1, fill, extra) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    const L = Math.hypot(dx, dy) || 1;
    const deg = (Math.atan2(dy, dx) * 180) / PI - 90;
    return el("path", Object.assign({ d: capsule(L, w0, w1), transform: `translate(${f1(p0[0])},${f1(p0[1])}) rotate(${f1(deg)})`, fill }, extra || {}), parent);
  }
  // extremo de un segmento que parte de p con ángulo a (rad; 0 = hacia abajo, + = horario → hacia atrás)
  const segEnd = (p, L, a) => [p[0] - Math.sin(a) * L, p[1] + Math.cos(a) * L];
  const withDefaults = (D, v) => {
    const o = Object.assign({}, D, v || {});
    for (const k in D) if (o[k] == null) o[k] = D[k];
    return o;
  };
  function beatsW(beats, a, T) { return VSV.beatWeight(beats, a, T); }
  const isMove = (b) => b === "walk" || b === "travel" || b === "run" || b === "crawl" || b === "swim" || b === "fly";
  function shadowEllipse(inst, defs, rx, ry, op) {
    inst.extra.shadowE = el("ellipse", { cx: 0, cy: 3, rx, ry, fill: "#000", opacity: op == null ? 0.22 : op, filter: defs.blur(6) }, inst.shadow);
  }
  function rootApply(inst, pose) {
    const r = pose.root || {};
    const tr = `translate(${f1(r.x || 0)},${f1(r.y || 0)})${r.r ? ` rotate(${f1((r.r * 180) / PI)})` : ""}`;
    setAttr(inst.root, "transform", tr);
    if (inst.extra.shadowE) {
      const up = Math.max(0, -(r.y || 0));
      const k = clamp(1 - up / (inst.extra.shadowFade || 600), 0.25, 1);
      setAttr(inst.extra.shadowE, "transform", `translate(${f1(r.x || 0)},0) scale(${k.toFixed(3)},1)`);
      setAttr(inst.extra.shadowE, "opacity", (0.22 * k).toFixed(3));
    }
  }
  // ojo de dibujo animado (blanco + pupila + brillo); devuelve la pieza para parpadear
  function cartoonEye(inst, parent, name, x, y, r, col, big) {
    const e = mkPart(inst, parent, name, [x, y]);
    el("ellipse", { cx: x, cy: y, rx: r * (big ? 1.15 : 1), ry: r * (big ? 1.15 : 1.05), fill: "#fbfbf6", stroke: "#1b1512", "stroke-width": Math.max(1.5, r * 0.12) }, e);
    el("circle", { cx: x + r * 0.22, cy: y + r * 0.05, r: r * (big ? 0.72 : 0.62), fill: col || "#1d140f" }, e);
    if (big) el("circle", { cx: x + r * 0.22, cy: y + r * 0.05, r: r * 0.36, fill: "#060606" }, e);
    el("circle", { cx: x + r * 0.42, cy: y - r * 0.22, r: r * 0.22, fill: "#fff" }, e);
    return e;
  }

  /* ======================================================================
     CUADRÚPEDO paramétrico
     piezas: body, neck, head, jaw, eye, ear_F, ear_B, tail_1..3, 4 patas con
     muslo y caña (leg_FL/leg_FL_k…), trompa (trunk_1..3) si la hay
     ====================================================================== */
  const QD = { bodyL: 320, bodyH: 130, legL: 140, legW: 34, neckL: 70, neckA: 0.55, neckW: 72, headR: 58, snout: 46, snoutH: 0.72,
    ears: "pointy", earS: 1, tail: "thin", tailL: 120, tailW: 16, horns: "none", trunk: false, tusks: false, mane: "none", hump: 0,
    shell: false, pattern: "none", body: "#b98a5e", belly: null, dark: null, legC: null, paw: null, hooves: false, nose: "#2b2222",
    earIn: "#e3a3a0", eyeC: "#24170f", eyeS: 1, gait: "walk", whiskers: false, beard: false, mask: false, eyePatch: false,
    spines: false, wool: false, crest: false, size: 0.42 };

  function quadGeo(v) {
    const g = {};
    // postura inclinada (mono, gorila, canguro): el tronco gira `tilt` alrededor de la cadera trasera
    const tl = v.tilt || 0, ox = -v.bodyL * 0.3, oy = -v.legL - v.bodyH * 0.3;
    g.rotP = (p) => tl ? [ox + (p[0] - ox) * Math.cos(tl) + (p[1] - oy) * Math.sin(tl), oy - (p[0] - ox) * Math.sin(tl) + (p[1] - oy) * Math.cos(tl)] : p;
    g.tiltO = [ox, oy];
    const L = v.bodyL, H = v.bodyH, R = v.headR;
    g.cy = -v.legL - H * 0.35;
    g.top = g.cy - H / 2; g.bot = g.cy + H / 2;
    g.xs = L * 0.3; g.xh = -L * 0.3;
    g.hipY = g.cy + H * 0.05;
    g.knee = -v.legL * 0.48;
    g.nb = [L * 0.36, g.cy - H * 0.16];
    g.ne = [g.nb[0] + v.neckL * Math.cos(v.neckA), g.nb[1] - v.neckL * Math.sin(v.neckA)];
    g.hc = [g.ne[0] + R * 0.28, g.ne[1] - R * 0.12];
    g.sn = [g.hc[0] + R * 0.55 + v.snout * 0.5, g.hc[1] + R * 0.28];
    g.snRx = R * 0.36 + v.snout * 0.52;
    g.snRy = R * 0.44 * v.snoutH;
    g.tip = [g.sn[0] + g.snRx * 0.92, g.sn[1] - g.snRy * 0.25];
    g.eye = [g.hc[0] + R * 0.36, g.hc[1] - R * 0.2];
    g.tb = [-L * 0.47, g.cy - H * 0.22];
    return g;
  }

  const TAIL_ANG = { thin: [62, 40, 22], long: [40, 25, 15], bushy: [78, 68, 58], squirrel: [150, 195, 235], reptile: [94, 92, 88],
    tuft: [40, 22, 12], up: [140, 160, 172], short: [70, 70, 70], curly: [90, 90, 90], flat: [96, 96, 96], none: [0, 0, 0],
    curl: [100, 150, 210], thick: [70, 80, 90] };

  const QUAD = {
    kind: "quadruped",
    defaults: QD,
    metaFor(v0) {
      const v = withDefaults(QD, v0);
      const g = quadGeo(v);
      const headTop = g.hc[1] - v.headR * (v.ears === "long" ? 2.4 : v.horns === "antlers" ? 2.6 : 1.3);
      const h = Math.max(-headTop, -g.top + v.hump * v.bodyH * 0.6, v.legL + v.bodyH);
      const w = (g.tip[0] + 10) - Math.min(-v.bodyL / 2 - v.tailL * 0.8, -v.bodyL / 2);
      const r = g.rotP;
      const hc = r(g.hc);
      const hh = v.tilt ? Math.max(h, -(hc[1] - v.headR * 1.4)) : h;
      return { h: hh, w, xmin: -v.bodyL / 2 - v.tailL * 0.8,
        focus: { head: [hc[0] + v.headR * 0.3, hc[1]], eye: r(g.eye), face: hc, mouth: r([g.sn[0], g.sn[1] + g.snRy * 0.4]),
          beak: r(g.tip), body: r([0, g.cy]), legs: [0, -v.legL * 0.4], tail: [g.tb[0] - v.tailL * 0.4, g.tb[1] + 20] } };
    },
    build(parent, defs, opts = {}) {
      const v = withDefaults(QD, opts.variant);
      const inst = newInst(this, parent, "quadruped", v);
      const Rt = inst.root, gq = quadGeo(v);
      inst.extra.g = gq;
      const col = v.body, dark = v.dark || shade(col, -0.45), belly = v.belly || shade(col, 0.28), legC = v.legC || col;
      const pawC = v.paw || (v.hooves ? "#3b2d26" : shade(legC, -0.18));
      const R = v.headR, L = v.bodyL, H = v.bodyH;
      shadowEllipse(inst, defs, L * 0.55, 14);
      inst.extra.shadowFade = v.legL * 3;
      const bodyFill = defs.linear([[0, shade(col, 0.18)], [0.6, col], [1, shade(col, -0.22)]]);
      const legFill = (far) => (far ? shade(legC, -0.28) : defs.linear([[0, shade(legC, 0.1)], [1, shade(legC, -0.2)]], 0, 0, 1, 0));
      const tiltG = v.tilt ? VSV.el("g", { transform: `rotate(${f1((-v.tilt * 180) / PI)},${f1(gq.tiltO[0])},${f1(gq.tiltO[1])})` }, Rt) : Rt;
      const body = mkPart(inst, tiltG, "body", [0, gq.cy]);
      // patas: lejanas detrás del cuerpo, cercanas delante. Con postura inclinada las delanteras salen del
      // hombro girado: largas hasta el suelo (mono, gorila) o cortas como brazos (canguro: frontArms)
      const leg = (name, x0, far, hind) => {
        let x = x0, top = gq.hipY;
        if (v.tilt && !hind) { const p = gq.rotP([x0, gq.hipY]); x = p[0]; top = p[1]; }
        const arm = v.frontArms && !hind;
        const up = mkPart(inst, Rt, name, [x, top]);
        const knee = arm ? top + (-top) * 0.28 : v.tilt && !hind ? top * 0.48 : gq.knee;
        const foot = arm ? top + (-top) * 0.5 : -4;
        const upLen = knee - top;
        if (arm) {
          el("path", { d: capsule(upLen, v.legW * 0.8, v.legW * 0.6), transform: `translate(${f1(x)},${f1(top)})`, fill: legFill(far) }, up);
          const lo = mkPart(inst, up, name + "_k", [x, knee]);
          el("path", { d: capsule(foot - knee, v.legW * 0.6, v.legW * 0.5), transform: `translate(${f1(x)},${f1(knee)}) rotate(-40)`, fill: legFill(far) }, lo);
          return;
        }
        if (v.legL < 60) { // patas cortas (reptiles, tortuga, rana): una sola pieza robusta
          el("path", { d: capsule(-gq.hipY, v.legW * 1.2, v.legW * 0.9), transform: `translate(${x},${f1(gq.hipY)})`, fill: legFill(far) }, up);
          el("ellipse", { cx: x + v.legW * 0.4, cy: -3, rx: v.legW * 0.75, ry: v.legW * 0.3, fill: far ? shade(pawC, -0.2) : pawC }, up);
          mkPart(inst, up, name + "_k", [x, gq.knee]);
          return;
        }
        el("path", { d: capsule(upLen, v.legW * (hind ? 1.55 : 1.15), v.legW * 0.8), transform: `translate(${f1(x)},${f1(top)})`, fill: legFill(far) }, up);
        const lo = mkPart(inst, up, name + "_k", [x, knee]);
        el("path", { d: capsule(-knee - 4, v.legW * 0.8, v.legW * 0.62), transform: `translate(${f1(x)},${f1(knee)})`, fill: legFill(far) }, lo);
        if (v.hooves) el("path", { d: `M${f1(x - v.legW * 0.42)},-14 L${f1(x + v.legW * 0.42)},-14 L${f1(x + v.legW * 0.5)},2 L${f1(x - v.legW * 0.46)},2 Z`, fill: far ? shade(pawC, -0.2) : pawC }, lo);
        else el("ellipse", { cx: x + v.legW * 0.28, cy: -4, rx: v.legW * 0.55, ry: v.legW * 0.32, fill: far ? shade(pawC, -0.2) : pawC }, lo);
      };
      leg("leg_BL", gq.xh + L * 0.05, true, true);
      leg("leg_FL", gq.xs - L * 0.04, true, false);
      // cola
      const ta = (TAIL_ANG[v.tail] || TAIL_ANG.thin).map((d) => (d * PI) / 180);
      if (v.tail !== "none") {
        const segL = v.tailL / 3;
        let p = gq.tb, par = body;
        for (let i = 0; i < 3; i++) {
          const tg = mkPart(inst, par, "tail_" + (i + 1), p);
          const a = ta[i] + (i ? ta[i - 1] * 0 : 0);
          const e = segEnd(p, segL, a);
          const wBase = v.tail === "bushy" || v.tail === "squirrel" ? v.tailW * 2.4 : v.tail === "reptile" || v.tail === "thick" ? H * (0.5 - i * 0.16) : v.tail === "flat" ? v.tailW * 3 : v.tailW;
          const w0 = v.tail === "reptile" || v.tail === "thick" ? wBase : wBase * (1 - i * 0.12), w1 = v.tail === "reptile" || v.tail === "thick" ? H * (0.34 - i * 0.14) : wBase * (0.9 - i * 0.12);
          if (v.tail === "curly" && i === 0) el("path", { d: `M${f1(p[0])},${f1(p[1])} c-30,-6 -34,-34 -12,-36 c18,-2 16,22 -4,18`, fill: "none", stroke: shade(col, -0.05), "stroke-width": v.tailW, "stroke-linecap": "round" }, tg);
          else if (v.tail === "short" && i === 0) el("ellipse", { cx: p[0] - v.tailW * 0.6, cy: p[1] + 4, rx: v.tailW * 1.3, ry: v.tailW * 1.1, fill: v.tailTip || shade(col, 0.15) }, tg);
          else if (v.tail === "flat" && i === 0) el("path", { d: `M${f1(p[0])},${f1(p[1] + 10)} q-40,-26 -110,-6 q-12,24 0,34 q70,10 110,-12 Z`, fill: v.tailC || shade(col, -0.35) }, tg);
          else if (v.tail !== "curly" && v.tail !== "short" && v.tail !== "flat") {
            capTo(tg, p, e, Math.max(4, w0), Math.max(3, w1), i === 2 && v.tailTip ? v.tailTip : shade(col, -0.05 * i));
            if (v.tail === "tuft" && i === 2) el("ellipse", { cx: e[0], cy: e[1], rx: v.tailW * 1.4, ry: v.tailW * 2, fill: dark, transform: `rotate(${f1((ta[i] * 180) / PI)},${f1(e[0])},${f1(e[1])})` }, tg);
            if (v.ringed && i < 3) for (let r = 0.3; r < 1; r += 0.35) { const q = [lerp(p[0], e[0], r), lerp(p[1], e[1], r)]; el("circle", { cx: q[0], cy: q[1], r: w0 * 0.45, fill: dark }, tg); }
          }
          par = tg; p = e;
        }
      }
      // tronco
      const bpts = [[-L / 2, gq.cy + H * 0.05], [-L * 0.42, gq.top + H * 0.08], [-L * 0.18, gq.top - v.hump * H * 0.55], [0, gq.top + (v.hump ? H * 0.05 : 0)],
        [L * 0.12, gq.top - v.hump * H * 0.35], [L * 0.36, gq.top + H * 0.02], [L / 2, gq.cy - H * 0.06], [L * 0.45, gq.bot - H * 0.18], [L * 0.22, gq.bot],
        [-L * 0.2, gq.bot + H * 0.02], [-L * 0.47, gq.bot - H * 0.22]];
      const bd = smoothPath(bpts, true);
      el("path", { d: bd, fill: bodyFill }, body);
      const clip = defs.clip((c) => el("path", { d: bd }, c));
      const deco = VSV.el("g", { "clip-path": clip }, body);
      el("ellipse", { cx: L * 0.05, cy: gq.bot, rx: L * 0.42, ry: H * 0.3, fill: belly, opacity: 0.85 }, deco);
      const R2 = rng(opts.seed || 5);
      if (v.pattern === "spots") for (let i = 0; i < 22; i++) el("ellipse", { cx: (R2() - 0.5) * L, cy: gq.top + R2() * H * 0.8, rx: 7 + R2() * 9, ry: 6 + R2() * 7, fill: dark, opacity: 0.85 }, deco);
      if (v.pattern === "rosettes") for (let i = 0; i < 18; i++) { const x = (R2() - 0.5) * L, y = gq.top + R2() * H * 0.8, r = 9 + R2() * 6; el("circle", { cx: x, cy: y, r, fill: "none", stroke: dark, "stroke-width": 5, "stroke-dasharray": `${f1(r * 1.3)} ${f1(r * 0.6)}` }, deco); }
      if (v.pattern === "stripes") for (let i = 0; i < 9; i++) { const x = -L * 0.44 + i * L * 0.1; el("path", { d: `M${f1(x)},${f1(gq.top - 6)} q${f1(H * 0.12)},${f1(H * 0.35)} ${f1(-H * 0.04)},${f1(H * 0.7)}`, stroke: dark, "stroke-width": L * 0.028, fill: "none", "stroke-linecap": "round" }, deco); }
      if (v.pattern === "patches") for (let i = 0; i < 5; i++) { const x = (R2() - 0.5) * L * 0.9, y = gq.top + R2() * H * 0.7; el("path", { d: smoothPath([[x - 40, y], [x - 10, y - 30], [x + 34, y - 18], [x + 40, y + 20], [x, y + 34], [x - 34, y + 22]], true), fill: dark }, deco); }
      if (v.pattern === "blocks") for (let i = 0; i < 26; i++) { const x = -L / 2 + (i % 7) * L / 6.5 + (R2() - 0.5) * 12, y = gq.top + Math.floor(i / 7) * H / 3.4 + 4; el("rect", { x, y, width: L / 8, height: H / 4.2, rx: 8, fill: dark }, deco); }
      if (v.pattern === "panda") { el("ellipse", { cx: 0, cy: gq.cy - H * 0.05, rx: L * 0.2, ry: H * 0.62, fill: dark }, deco); }
      if (v.pattern === "back_stripe") el("path", { d: `M${-L / 2},${f1(gq.top + 8)} Q0,${f1(gq.top - 10)} ${L / 2},${f1(gq.top + 14)}`, stroke: v.stripeC || "#f4f4f4", "stroke-width": H * 0.16, fill: "none" }, deco);
      if (v.wool) for (let i = 0; i < 16; i++) el("circle", { cx: -L * 0.46 + (i % 8) * L * 0.13, cy: gq.top + 10 + Math.floor(i / 8) * H * 0.45, r: H * 0.2, fill: shade(col, 0.12), stroke: shade(col, -0.12), "stroke-width": 2 }, deco);
      if (v.spines) for (let i = 0; i < 26; i++) { const x = -L * 0.46 + (i % 13) * L * 0.07, y = gq.top + 6 + Math.floor(i / 13) * H * 0.25; el("path", { d: `M${f1(x)},${f1(y + 14)} l-12,-38 l22,30 Z`, fill: dark }, deco); }
      el("path", { d: bd, fill: "none", stroke: shade(col, -0.5), "stroke-width": 3, opacity: 0.35 }, body);
      if (v.shell) {
        const sh = mkPart(inst, body, "shell", [0, gq.top]);
        const sd = `M${f1(-L * 0.52)},${f1(gq.cy + H * 0.12)} Q${f1(-L * 0.45)},${f1(gq.top - H * 0.9)} 0,${f1(gq.top - H * 0.75)} Q${f1(L * 0.45)},${f1(gq.top - H * 0.9)} ${f1(L * 0.52)},${f1(gq.cy + H * 0.12)} Z`;
        el("path", { d: sd, fill: defs.linear([[0, shade(v.shellC || "#6f8a3c", 0.15)], [1, shade(v.shellC || "#6f8a3c", -0.3)]]) }, sh);
        for (let i = -2; i <= 2; i++) el("path", { d: `M${f1(i * L * 0.17 - L * 0.07)},${f1(gq.top - H * 0.45 + Math.abs(i) * 12)} l${f1(L * 0.07)},-${f1(H * 0.18)} l${f1(L * 0.08)},${f1(H * 0.18)} l-${f1(L * 0.04)},${f1(H * 0.18)} l-${f1(L * 0.07)},0 Z`, fill: "none", stroke: shade(v.shellC || "#6f8a3c", -0.45), "stroke-width": 5 }, sh);
        el("path", { d: `M${f1(-L * 0.54)},${f1(gq.cy + H * 0.14)} L${f1(L * 0.54)},${f1(gq.cy + H * 0.14)}`, stroke: "#d8c48a", "stroke-width": 12, "stroke-linecap": "round" }, sh);
      }
      // cuello y cabeza
      const neck = mkPart(inst, body, "neck", gq.nb);
      if (v.neckL > 12) {
        const nf = defs.linear([[0, shade(col, 0.12)], [1, shade(col, -0.18)]], 0, 0, 1, 0);
        capTo(neck, [gq.nb[0] - v.neckW * 0.15, gq.nb[1] + v.neckW * 0.2], gq.ne, v.neckW, v.neckW * 0.72, nf);
        if (v.pattern === "blocks") {
          const n = Math.max(2, Math.round(v.neckL / 60));
          for (let i = 0; i < n; i++) { const k = (i + 0.5) / n; el("rect", { x: lerp(gq.nb[0], gq.ne[0], k) - 12, y: lerp(gq.nb[1], gq.ne[1], k) - 14, width: 26, height: 24, rx: 7, fill: dark }, neck); }
        }
        if (v.mane === "horse" || v.mane === "short") {
          const pts = [];
          for (let i = 0; i <= 6; i++) { const k = i / 6; pts.push([lerp(gq.nb[0] - v.neckW * 0.5, gq.ne[0] - v.neckW * 0.25, k), lerp(gq.nb[1] - v.neckW * 0.25, gq.ne[1] - v.neckW * 0.4, k)]); }
          el("path", { d: smoothPath(pts, false), stroke: v.maneC || dark, "stroke-width": v.mane === "horse" ? 26 : 14, fill: "none", "stroke-linecap": "round" }, neck);
        }
      }
      const head = mkPart(inst, neck, "head", gq.ne);
      const hc = gq.hc;
      if (v.mane === "lion") {
        const mp = [];
        for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU, r = R * (i % 2 ? 1.55 : 1.85); mp.push([hc[0] - R * 0.15 + Math.cos(a) * r, hc[1] + R * 0.1 + Math.sin(a) * r * 0.95]); }
        el("path", { d: smoothPath(mp, true), fill: defs.radial([[0, v.maneC || "#9b5a22"], [1, shade(v.maneC || "#9b5a22", -0.3)]]) }, head);
      }
      // oreja lejana
      const ear = (name, x, y, far) => {
        const e = mkPart(inst, head, name, [x, y]);
        const s = R * v.earS * (far ? 0.9 : 1), fc = far ? shade(col, -0.25) : shade(col, -0.05);
        if (v.ears === "pointy") { el("path", { d: `M${f1(x - s * 0.4)},${f1(y + s * 0.2)} L${f1(x - s * 0.05)},${f1(y - s * 0.75)} L${f1(x + s * 0.38)},${f1(y + s * 0.15)} Z`, fill: fc }, e); if (!far) el("path", { d: `M${f1(x - s * 0.22)},${f1(y + s * 0.1)} L${f1(x - s * 0.05)},${f1(y - s * 0.5)} L${f1(x + s * 0.2)},${f1(y + s * 0.08)} Z`, fill: v.earIn }, e); }
        else if (v.ears === "round" || v.ears === "small") { const r = s * (v.ears === "small" ? 0.22 : 0.34); el("circle", { cx: x, cy: y - r * 0.4, r, fill: v.pattern === "panda" ? dark : fc }, e); if (!far && v.ears === "round") el("circle", { cx: x, cy: y - r * 0.35, r: r * 0.55, fill: v.pattern === "panda" ? shade(dark, 0.15) : v.earIn }, e); }
        else if (v.ears === "long") { el("path", { d: `M${f1(x - s * 0.18)},${f1(y + s * 0.1)} C${f1(x - s * 0.5)},${f1(y - s * 1.6)} ${f1(x + s * 0.3)},${f1(y - s * 1.7)} ${f1(x + s * 0.16)},${f1(y + s * 0.1)} Z`, fill: fc }, e); if (!far) el("path", { d: `M${f1(x - s * 0.08)},${f1(y)} C${f1(x - s * 0.3)},${f1(y - s * 1.3)} ${f1(x + s * 0.16)},${f1(y - s * 1.36)} ${f1(x + s * 0.08)},${f1(y)} Z`, fill: v.earIn }, e); }
        else if (v.ears === "floppy") el("path", { d: `M${f1(x - s * 0.3)},${f1(y)} C${f1(x - s * 0.6)},${f1(y + s * 0.5)} ${f1(x - s * 0.4)},${f1(y + s * 1.05)} ${f1(x - s * 0.05)},${f1(y + s * 0.95)} C${f1(x + s * 0.15)},${f1(y + s * 0.6)} ${f1(x + s * 0.2)},${f1(y + s * 0.2)} ${f1(x + s * 0.1)},${f1(y - s * 0.05)} Z`, fill: v.earC || shade(col, -0.3) }, e);
        else if (v.ears === "elephant") el("path", { d: `M${f1(x)},${f1(y - s * 0.2)} C${f1(x - s * 1.3)},${f1(y - s * 0.6)} ${f1(x - s * 1.4)},${f1(y + s * 1.2)} ${f1(x - s * 0.3)},${f1(y + s * 1.25)} C${f1(x + s * 0.1)},${f1(y + s * 0.8)} ${f1(x + s * 0.1)},${f1(y + s * 0.3)} ${f1(x)},${f1(y - s * 0.2)} Z`, fill: far ? shade(col, -0.25) : shade(col, -0.08), stroke: shade(col, -0.4), "stroke-width": 3 }, e);
        else if (v.ears === "side") el("ellipse", { cx: x - s * 0.25, cy: y + s * 0.15, rx: s * 0.36, ry: s * 0.14, fill: fc, transform: `rotate(-20,${f1(x)},${f1(y)})` }, e);
        return e;
      };
      if (v.ears !== "none" && v.ears !== "elephant") ear("ear_B", hc[0] + R * 0.12, hc[1] - R * 0.72, true);
      // cráneo + hocico
      const hf = defs.radial([[0, shade(col, 0.25)], [1, shade(col, -0.12)]], 0.45, 0.35, 0.75);
      el("ellipse", { cx: hc[0], cy: hc[1], rx: R, ry: R * 0.9, fill: hf }, head);
      if (v.pattern === "stripes") for (let i = 0; i < 3; i++) el("path", { d: `M${f1(hc[0] - R * 0.5 + i * R * 0.3)},${f1(hc[1] - R * 0.85)} q6,${f1(R * 0.3)} -2,${f1(R * 0.5)}`, stroke: dark, "stroke-width": R * 0.1, fill: "none", "stroke-linecap": "round" }, head);
      const mouthIn = el("ellipse", { cx: gq.sn[0], cy: gq.sn[1] + gq.snRy * 0.45, rx: gq.snRx * 0.8, ry: gq.snRy * 0.5, fill: "#5a1f24" }, head);
      inst.extra.mouthIn = mouthIn;
      const jaw = mkPart(inst, head, "jaw", [hc[0] + R * 0.2, gq.sn[1] + gq.snRy * 0.3]);
      el("ellipse", { cx: gq.sn[0] - gq.snRx * 0.08, cy: gq.sn[1] + gq.snRy * 0.62, rx: gq.snRx * 0.86, ry: gq.snRy * 0.42, fill: shade(belly, -0.05) }, jaw);
      if (v.snout > 4) el("ellipse", { cx: gq.sn[0], cy: gq.sn[1], rx: gq.snRx, ry: gq.snRy, fill: v.muzzle || shade(col, 0.2) }, head);
      if (v.mask) el("path", { d: `M${f1(hc[0] - R * 0.2)},${f1(gq.eye[1] - R * 0.18)} q${f1(R * 0.5)},-${f1(R * 0.12)} ${f1(R * 0.9)},${f1(R * 0.06)} l-4,${f1(R * 0.36)} q-${f1(R * 0.45)},-${f1(R * 0.06)} -${f1(R * 0.86)},0 Z`, fill: dark }, head);
      if (v.eyePatch) el("ellipse", { cx: gq.eye[0], cy: gq.eye[1] + 2, rx: R * 0.28, ry: R * 0.22, fill: dark, transform: `rotate(-25,${f1(gq.eye[0])},${f1(gq.eye[1])})` }, head);
      if (v.beard) el("path", { d: `M${f1(gq.sn[0] - gq.snRx * 0.3)},${f1(gq.sn[1] + gq.snRy)} l-8,${f1(R * 0.5)} l22,-${f1(R * 0.38)} Z`, fill: shade(col, -0.2) }, head);
      // nariz
      if (v.noseType === "pig") { el("ellipse", { cx: gq.tip[0], cy: gq.tip[1] + 4, rx: R * 0.14, ry: R * 0.22, fill: shade(col, -0.08), stroke: shade(col, -0.35), "stroke-width": 3 }, head); el("ellipse", { cx: gq.tip[0] + 2, cy: gq.tip[1] - 2, rx: 3, ry: 6, fill: "#5a2a2a" }, head); el("ellipse", { cx: gq.tip[0] + 2, cy: gq.tip[1] + 10, rx: 3, ry: 6, fill: "#5a2a2a" }, head); }
      else if (v.snout > 4) el("ellipse", { cx: gq.tip[0], cy: gq.tip[1], rx: Math.max(5, R * 0.13), ry: Math.max(4, R * 0.1), fill: v.nose }, head);
      if (v.whiskers) el("path", { d: `M${f1(gq.tip[0] - 6)},${f1(gq.tip[1] + 8)} l${f1(R * 0.7)},-6 M${f1(gq.tip[0] - 6)},${f1(gq.tip[1] + 12)} l${f1(R * 0.66)},10`, stroke: "#f4f4f4", "stroke-width": 2, opacity: 0.7 }, head);
      // cuernos / astas / cuerno de rinoceronte / colmillos / osiconos
      const hornC = v.hornC || "#efe3c8";
      if (v.horns === "short") { el("path", { d: `M${f1(hc[0] - R * 0.1)},${f1(hc[1] - R * 0.75)} q-4,-${f1(R * 0.5)} ${f1(R * 0.3)},-${f1(R * 0.6)} q-${f1(R * 0.1)},${f1(R * 0.3)} 0,${f1(R * 0.62)} Z`, fill: hornC }, head); }
      else if (v.horns === "curved") el("path", { d: `M${f1(hc[0] - R * 0.2)},${f1(hc[1] - R * 0.6)} c-${f1(R * 0.9)},-${f1(R * 0.5)} -${f1(R * 1.1)},${f1(R * 0.7)} -${f1(R * 0.3)},${f1(R * 0.75)}`, stroke: hornC, "stroke-width": R * 0.26, fill: "none", "stroke-linecap": "round" }, head);
      else if (v.horns === "antlers") {
        const ax = hc[0] - R * 0.05, ay = hc[1] - R * 0.78;
        el("path", { d: `M${f1(ax)},${f1(ay)} q-${f1(R * 0.5)},-${f1(R * 0.9)} -${f1(R * 0.2)},-${f1(R * 1.6)} M${f1(ax - R * 0.28)},${f1(ay - R * 0.6)} l-${f1(R * 0.5)},-${f1(R * 0.3)} M${f1(ax - R * 0.3)},${f1(ay - R * 1.05)} l${f1(R * 0.4)},-${f1(R * 0.35)} M${f1(ax - R * 0.22)},${f1(ay - R * 1.35)} l-${f1(R * 0.36)},-${f1(R * 0.25)}`, stroke: v.hornC || "#8a6a46", "stroke-width": R * 0.12, fill: "none", "stroke-linecap": "round" }, head);
      } else if (v.horns === "rhino") { el("path", { d: `M${f1(gq.tip[0] - R * 0.5)},${f1(gq.sn[1] - gq.snRy * 0.6)} q${f1(R * 0.3)},-${f1(R * 0.9)} ${f1(R * 0.38)},-${f1(R * 1.05)} q${f1(R * 0.05)},${f1(R * 0.6)} ${f1(R * 0.24)},${f1(R * 0.95)} Z`, fill: hornC }, head); }
      else if (v.horns === "ossicones") for (const dx of [-0.25, 0.05]) { el("path", { d: `M${f1(hc[0] + R * dx)},${f1(hc[1] - R * 0.7)} l-3,-${f1(R * 0.5)}`, stroke: shade(col, -0.3), "stroke-width": 9, "stroke-linecap": "round" }, head); el("circle", { cx: hc[0] + R * dx - 3, cy: hc[1] - R * 1.22, r: 9, fill: shade(col, -0.5) }, head); }
      if (v.crest) el("path", { d: smoothPath([[hc[0] - R * 0.7, hc[1] - R * 0.4], [hc[0] - R * 0.3, hc[1] - R * 1.1], [hc[0] + R * 0.1, hc[1] - R * 0.9], [hc[0] + R * 0.4, hc[1] - R * 0.7]], false), stroke: v.crestC || shade(col, -0.3), "stroke-width": R * 0.2, fill: "none", "stroke-linecap": "round", "stroke-dasharray": "6 5" }, head);
      // ojo
      const er = R * 0.2 * v.eyeS;
      cartoonEye(inst, head, "eye", gq.eye[0], gq.eye[1], er, v.eyeC, v.eyeS > 1.3);
      // trompa (elefante): 3 segmentos colgando del hocico
      if (v.trunk) {
        let p = [gq.tip[0] - R * 0.25, gq.sn[1] + R * 0.1], par = head;
        const tl = v.trunkL || R * 2.2;
        for (let i = 0; i < 3; i++) {
          const tg = mkPart(inst, par, "trunk_" + (i + 1), p);
          const e = [p[0] + (i === 0 ? R * 0.18 : 0), p[1] + tl / 3];
          capTo(tg, p, e, R * (0.42 - i * 0.1), R * (0.34 - i * 0.1), shade(col, -0.04 * i));
          for (let r = 0.2; r < 1; r += 0.3) el("path", { d: `M${f1(lerp(p[0], e[0], r) - R * 0.15)},${f1(lerp(p[1], e[1], r))} l${f1(R * 0.3)},0`, stroke: shade(col, -0.35), "stroke-width": 2, opacity: 0.6 }, tg);
          par = tg; p = e;
        }
      }
      if (v.tusks) el("path", { d: `M${f1(gq.tip[0] - R * 0.45)},${f1(gq.sn[1] + R * 0.35)} q${f1(R * 0.25)},${f1(R * 0.7)} ${f1(R * 0.85)},${f1(R * 0.45)} q-${f1(R * 0.55)},0 -${f1(R * 0.7)},-${f1(R * 0.55)} Z`, fill: "#f6f0dc" }, head);
      if (v.ears !== "none") ear("ear_F", v.ears === "elephant" ? hc[0] - R * 0.1 : hc[0] - R * 0.22, v.ears === "elephant" ? hc[1] - R * 0.35 : hc[1] - R * 0.7, false);
      // patas cercanas
      leg("leg_BR", gq.xh - L * 0.05, false, true);
      leg("leg_FR", gq.xs + L * 0.02, false, false);
      return inst;
    },
    pose(s) {
      const v = withDefaults(QD, s.v);
      const T = s.t, base = s.base || "idle", seed = s.seed || 0, beats = s.beats || [];
      const o = {};
      const hop = v.gait === "hop";
      const run = base === "run";
      const moving = isMove(base);
      const f = (run ? 2.4 : 1.35) * Math.sqrt(140 / Math.max(40, v.legL)) * (hop ? 1.1 : 1);
      const ph = T * f * TAU + seed;
      const amp = moving ? (run ? 0.62 : 0.36) : 0;
      const lie = base === "breathe" || base === "sleep" || base === "snore";
      const sit = base === "sit";
      let rootY = 0;
      if (hop && moving) {
        const air = Math.max(0, Math.sin(ph));
        rootY = -air * v.legL * 0.7;
        for (const n of ["leg_BL", "leg_BR"]) { o[n] = { r: -0.5 * air + 0.25 }; o[n + "_k"] = { r: 0.3 * (1 - air) }; }
        for (const n of ["leg_FL", "leg_FR"]) { o[n] = { r: -0.55 * air }; o[n + "_k"] = { r: 0.2 }; }
      } else {
        const pairs = { leg_FL: 0, leg_BR: 0, leg_FR: PI, leg_BL: PI };
        for (const n in pairs) {
          const p = ph + pairs[n] + (n === "leg_BR" || n === "leg_BL" ? 0.3 : 0);
          o[n] = { r: Math.sin(p) * amp };
          o[n + "_k"] = { r: Math.max(0, -Math.cos(p)) * amp * 1.1 };
        }
      }
      if (lie || sit) {
        const k = 1;
        rootY = v.legL * (lie ? 0.78 : 0.42) * k;
        o.leg_FL = { r: lie ? -1.35 : -0.1 }; o.leg_FR = { r: lie ? -1.25 : -0.05 };
        o.leg_FL_k = { r: lie ? 2.4 : 0 }; o.leg_FR_k = { r: lie ? 2.3 : 0 };
        o.leg_BL = { r: -1.3 }; o.leg_BR = { r: -1.2 }; o.leg_BL_k = { r: 2.5 }; o.leg_BR_k = { r: 2.4 };
      }
      const breathe = Math.sin(T * (lie ? 1.3 : 2.1) + seed);
      o.body = { y: moving && !hop ? -Math.abs(Math.cos(ph)) * v.bodyH * 0.05 : 0, sy: 1 + breathe * 0.012, r: sit ? -0.18 : 0 };
      // cola: meneo (más rápido si está contenta / habla)
      const wag = (base === "talk" ? 3 : moving ? 2 : 1.1) * (v.tail === "thin" || v.tail === "up" ? 1.6 : 1);
      const tA = v.tail === "reptile" || v.tail === "thick" ? 0.06 : v.tail === "flat" || v.tail === "short" ? 0.05 : 0.16;
      for (let i = 1; i <= 3; i++) o["tail_" + i] = { r: Math.sin(T * wag * 2 + seed - i * 0.7) * tA * (1 + i * 0.35) };
      // cabeza y cuello
      const wl = beatsW(beats, "look_left", T), wr = beatsW(beats, "look_right", T);
      const peck = beatsW(beats, "peck", T) + (base === "peck" ? 0.5 + 0.5 * Math.sin(T * 3) : 0);
      const talk = beatsW(beats, "talk", T) + (base === "talk" ? 1 : 0);
      const sur = beatsW(beats, "surprise", T);
      const hopB = beatsW(beats, "hop", T);
      o.neck = { r: clamp(peck, 0, 1) * (v.neckL > 100 ? 0.75 : 0.45) + (lie ? 0.25 : 0) + noise1(T * 0.5, seed) * 0.03 };
      o.head = { r: -wl * 0.28 + wr * 0.14 + clamp(peck, 0, 1) * 0.35 + (moving ? Math.sin(ph * 2) * 0.03 : Math.sin(T * 0.9 + seed) * 0.04) - sur * 0.12 + (lie ? 0.15 : 0) };
      o.jaw = { r: talk > 0 ? Math.max(0, Math.sin(T * 11 + seed)) * 0.32 * clamp(talk) : sur * 0.25 + clamp(peck) * 0.12 * Math.max(0, Math.sin(T * 9)) };
      const twitch = hash(Math.floor(T * 0.7) + seed) > 0.8 ? Math.sin(fract(T * 0.7) * PI) : 0;
      o.ear_F = { r: v.ears === "elephant" ? Math.sin(T * 1.6 + seed) * 0.12 : -twitch * 0.2 - sur * 0.3 };
      o.ear_B = { r: v.ears === "elephant" ? Math.sin(T * 1.6 + seed + 0.5) * 0.1 : -twitch * 0.15 - sur * 0.3 };
      const blink = lie && base !== "talk" ? 1 : VSV.blinkAt(T, seed, beats);
      o.eye = { sy: 1 - blink * 0.9 + sur * 0.25, sx: 1 + sur * 0.2 };
      if (v.trunk) for (let i = 1; i <= 3; i++) o["trunk_" + i] = { r: Math.sin(T * 1.3 + seed - i * 0.6) * 0.12 * i - clamp(talk + sur) * 0.45 * i * 0.6 + clamp(peck) * 0.2 };
      rootY += -bump(T, (beats.find((b) => b.action === "hop") || {}).at || -9, 0.55) * v.legL * 0.6 - sur * v.legL * 0.08;
      o.root = { y: rootY };
      o._hop = hopB;
      return o;
    },
    apply(inst, pose) { applyParts(inst, pose); rootApply(inst, pose); },
    speed(scale, v0) { const v = withDefaults(QD, v0); return 2 * 1.35 * Math.sqrt(140 / Math.max(40, v.legL)) * v.legL * 0.62 * scale * (v.gait === "hop" ? 1.4 : 1); },
  };
  const fract = (x) => x - Math.floor(x);
  VSV.RIGS.quadruped = QUAD;

  /* ======================================================================
     AVE paramétrica · body, wing, wing_far, wing_tip, tail, neck, head, eye,
     beak, beak_low, crest, leg_L/leg_R (+ dedos)
     ====================================================================== */
  const BD = { bodyRx: 92, bodyRy: 62, tilt: 0.25, neckL: 34, neckA: 1.2, neckW: 44, headR: 34, beak: "short", beakL: 30, beakC: "#f2b632",
    legL: 74, legC: "#e8a13a", feet: "talon", crest: "none", crestC: "#d8322e", wattle: false, tail: "short", tailL: 70, tailC: null,
    body: "#8d7b68", belly: null, wingC: null, headC: null, neckC: null, eyeRing: false, eyeBig: false, eyeC: "#20140c", wings: "feather",
    flapHz: 3, hover: false, size: 0.34, cheek: null, mask: null };

  function birdGeo(v) {
    const g = {};
    g.bc = [0, -v.legL - v.bodyRy * 0.72];
    const ct = Math.cos(-v.tilt), st = Math.sin(-v.tilt);
    g.rot = (x, y) => [g.bc[0] + x * ct - y * st, g.bc[1] + x * st + y * ct];
    g.nb = g.rot(v.bodyRx * 0.62, -v.bodyRy * 0.42);
    g.ne = [g.nb[0] + v.neckL * Math.cos(v.neckA), g.nb[1] - v.neckL * Math.sin(v.neckA)];
    g.hc = [g.ne[0] + v.headR * 0.2, g.ne[1] - v.headR * 0.25];
    g.eye = [g.hc[0] + v.headR * 0.3, g.hc[1] - v.headR * 0.14];
    g.beak0 = [g.hc[0] + v.headR * 0.82, g.hc[1] + v.headR * 0.08];
    g.tail0 = g.rot(-v.bodyRx * 0.85, -v.bodyRy * 0.05);
    g.wing0 = g.rot(v.bodyRx * 0.25, -v.bodyRy * 0.5);
    g.hip = g.rot(-v.bodyRx * 0.05, v.bodyRy * 0.6);
    return g;
  }

  const BIRD = {
    kind: "bird",
    defaults: BD,
    metaFor(v0) {
      const v = withDefaults(BD, v0);
      const g = birdGeo(v);
      const top = Math.min(g.hc[1] - v.headR * (v.crest === "none" ? 1.1 : 1.9), g.bc[1] - v.bodyRy);
      return { h: -top, w: g.beak0[0] + v.beakL + v.bodyRx + v.tailL, fitW: false,
        focus: { head: g.hc, eye: g.eye, face: g.hc, beak: [g.beak0[0] + v.beakL * 0.5, g.beak0[1]], mouth: [g.beak0[0] + v.beakL * 0.5, g.beak0[1]],
          body: g.bc, legs: [0, -v.legL * 0.5], wing: g.wing0, tail: g.tail0 } };
    },
    build(parent, defs, opts = {}) {
      const v = withDefaults(BD, opts.variant);
      const inst = newInst(this, parent, "bird", v);
      const Rt = inst.root, g = birdGeo(v);
      const col = v.body, belly = v.belly || shade(col, 0.3), wingC = v.wingC || shade(col, -0.15), headC = v.headC || col, neckC = v.neckC || headC;
      shadowEllipse(inst, defs, v.bodyRx * 0.9, 10);
      inst.extra.shadowFade = 500;
      const legs = (side, far) => {
        const x = g.hip[0] + (far ? -v.bodyRx * 0.12 : v.bodyRx * 0.1);
        const lg = mkPart(inst, Rt, "leg_" + side, [x, g.hip[1]]);
        const c = far ? shade(v.legC, -0.25) : v.legC;
        el("path", { d: `M${f1(x)},${f1(g.hip[1])} L${f1(x + 3)},${f1(-v.legL * 0.45)} L${f1(x)},-4`, stroke: c, "stroke-width": Math.max(5, v.legL * 0.07 + 3), fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, lg);
        if (v.feet === "web") el("path", { d: `M${f1(x - 6)},-4 l${f1(v.legL * 0.45 + 14)},0 l-8,6 l-${f1(v.legL * 0.45 + 8)},2 Z`, fill: c }, lg);
        else el("path", { d: `M${f1(x - 10)},-2 l${f1(v.legL * 0.32 + 12)},0 M${f1(x)},-3 l-14,2 M${f1(x)},-3 l${f1(v.legL * 0.28 + 6)},-6`, stroke: c, "stroke-width": 5, "stroke-linecap": "round" }, lg);
      };
      if (v.legL > 8) legs("L", true);
      const tail = mkPart(inst, Rt, "tail", g.tail0);
      const tc = v.tailC || shade(col, -0.25);
      const tx = g.tail0[0], ty = g.tail0[1];
      if (v.tail === "fan") {
        for (let i = 0; i < 9; i++) { const th = ((88 + i * 13) * PI) / 180; const ex = tx + Math.cos(th) * v.tailL * 1.4, ey = ty - Math.sin(th) * v.tailL * 1.4; el("path", { d: `M${f1(tx)},${f1(ty)} L${f1(ex)},${f1(ey)}`, stroke: tc, "stroke-width": 26, "stroke-linecap": "round" }, tail); el("circle", { cx: ex, cy: ey, r: 12, fill: v.eyespot || "#2a6fd6", stroke: "#e2c13b", "stroke-width": 4 }, tail); }
      } else if (v.tail === "upright") el("path", { d: `M${f1(tx + 10)},${f1(ty + 10)} C${f1(tx - v.tailL * 0.9)},${f1(ty - v.tailL * 0.2)} ${f1(tx - v.tailL * 0.6)},${f1(ty - v.tailL * 1.3)} ${f1(tx - v.tailL * 0.1)},${f1(ty - v.tailL * 1.2)} C${f1(tx - v.tailL * 0.2)},${f1(ty - v.tailL * 0.6)} ${f1(tx)},${f1(ty - v.tailL * 0.2)} ${f1(tx + 20)},${f1(ty - 10)} Z`, fill: tc }, tail);
      else if (v.tail === "long") el("path", { d: `M${f1(tx + 10)},${f1(ty - 12)} L${f1(tx - v.tailL * 1.6)},${f1(ty + v.tailL * 0.25)} L${f1(tx - v.tailL * 1.5)},${f1(ty + v.tailL * 0.42)} L${f1(tx + 10)},${f1(ty + 14)} Z`, fill: tc }, tail);
      else if (v.tail === "fork") el("path", { d: `M${f1(tx + 10)},${f1(ty - 10)} L${f1(tx - v.tailL)},${f1(ty - 6)} L${f1(tx - v.tailL * 0.7)},${f1(ty + 6)} L${f1(tx - v.tailL)},${f1(ty + 22)} L${f1(tx + 10)},${f1(ty + 12)} Z`, fill: tc }, tail);
      else el("path", { d: `M${f1(tx + 14)},${f1(ty - 14)} L${f1(tx - v.tailL)},${f1(ty + 2)} L${f1(tx - v.tailL * 0.9)},${f1(ty + 20)} L${f1(tx + 14)},${f1(ty + 16)} Z`, fill: tc }, tail);
      // ala lejana (solo se ve volando)
      const wf = mkPart(inst, Rt, "wing_far", g.wing0);
      inst.extra.wingFar = wf;
      const wingShape = (gp, c, far) => {
        const [x, y] = g.wing0, L = v.bodyRx * (v.wings === "flipper" ? 0.9 : 1.55);
        if (v.wings === "membrane") el("path", { d: `M${f1(x)},${f1(y)} L${f1(x - L)},${f1(y + 6)} q${f1(L * 0.2)},${f1(L * 0.22)} ${f1(L * 0.32)},${f1(L * 0.1)} q${f1(L * 0.15)},${f1(L * 0.22)} ${f1(L * 0.33)},${f1(L * 0.08)} q${f1(L * 0.15)},${f1(L * 0.2)} ${f1(L * 0.35)},${f1(L * 0.02)} Z`, fill: c, stroke: shade(c, -0.4), "stroke-width": 3 }, gp);
        else if (v.wings === "flipper") el("path", { d: `M${f1(x)},${f1(y - 6)} C${f1(x - L * 0.3)},${f1(y + L * 0.2)} ${f1(x - L * 0.5)},${f1(y + L * 0.8)} ${f1(x - L * 0.42)},${f1(y + L * 1.05)} C${f1(x - L * 0.2)},${f1(y + L * 0.7)} ${f1(x + 8)},${f1(y + L * 0.3)} ${f1(x + 10)},${f1(y)} Z`, fill: c }, gp);
        else {
          el("path", { d: `M${f1(x + 14)},${f1(y - 10)} C${f1(x - L * 0.4)},${f1(y - 22)} ${f1(x - L * 0.85)},${f1(y)} ${f1(x - L)},${f1(y + v.bodyRy * 0.38)} C${f1(x - L * 0.6)},${f1(y + v.bodyRy * 0.62)} ${f1(x - L * 0.1)},${f1(y + v.bodyRy * 0.62)} ${f1(x + 16)},${f1(y + v.bodyRy * 0.2)} Z`, fill: c }, gp);
          if (!far) for (let i = 0; i < 4; i++) el("path", { d: `M${f1(x - L * (0.45 + i * 0.13))},${f1(y + v.bodyRy * 0.1)} l${f1(-L * 0.12)},${f1(v.bodyRy * 0.42)}`, stroke: shade(c, -0.35), "stroke-width": 3, opacity: 0.6 }, gp);
        }
      };
      wingShape(wf, shade(wingC, -0.3), true);
      // cuerpo
      const body = mkPart(inst, Rt, "body", g.bc);
      const bdeg = (-v.tilt * 180) / PI;
      el("ellipse", { cx: g.bc[0], cy: g.bc[1], rx: v.bodyRx, ry: v.bodyRy, transform: `rotate(${f1(bdeg)},${f1(g.bc[0])},${f1(g.bc[1])})`, fill: defs.linear([[0, shade(col, 0.15)], [1, shade(col, -0.2)]]) }, body);
      const bclip = defs.clip((c) => el("ellipse", { cx: g.bc[0], cy: g.bc[1], rx: v.bodyRx, ry: v.bodyRy, transform: `rotate(${f1(bdeg)},${f1(g.bc[0])},${f1(g.bc[1])})` }, c));
      const bdeco = VSV.el("g", { "clip-path": bclip }, body);
      const bl = g.rot(v.bodyRx * 0.25, v.bodyRy * 0.55);
      el("ellipse", { cx: bl[0], cy: bl[1], rx: v.bodyRx * 0.8, ry: v.bodyRy * 0.62, fill: belly }, bdeco);
      if (v.spots) { const R2 = rng(opts.seed || 3); for (let i = 0; i < 16; i++) el("circle", { cx: g.bc[0] + (R2() - 0.5) * v.bodyRx * 1.6, cy: g.bc[1] + (R2() - 0.4) * v.bodyRy * 1.4, r: 4 + R2() * 4, fill: v.spots }, bdeco); }
      const neck = mkPart(inst, body, "neck", g.nb);
      if (v.neckL > 6) capTo(neck, [g.nb[0] - 4, g.nb[1] + v.neckW * 0.3], g.ne, v.neckW, v.neckW * 0.8, neckC);
      if (v.collar) el("path", { d: `M${f1(g.ne[0] - v.neckW * 0.45)},${f1(g.ne[1] + v.neckW * 0.3)} l${f1(v.neckW * 0.9)},-6`, stroke: v.collar, "stroke-width": 8, "stroke-linecap": "round" }, neck);
      const head = mkPart(inst, neck, "head", g.ne);
      const hc = g.hc, R = v.headR;
      if (v.crest === "comb") el("path", { d: `M${f1(hc[0] - R * 0.5)},${f1(hc[1] - R * 0.7)} q${f1(R * 0.1)},-${f1(R * 0.7)} ${f1(R * 0.3)},-${f1(R * 0.2)} q${f1(R * 0.15)},-${f1(R * 0.7)} ${f1(R * 0.3)},-${f1(R * 0.1)} q${f1(R * 0.2)},-${f1(R * 0.6)} ${f1(R * 0.35)},${f1(R * 0.15)} Z`, fill: v.crestC }, head);
      else if (v.crest === "tuft") for (const dx of [-0.45, 0.25]) el("path", { d: `M${f1(hc[0] + R * dx - R * 0.15)},${f1(hc[1] - R * 0.75)} l${f1(R * 0.1)},-${f1(R * 0.55)} l${f1(R * 0.25)},${f1(R * 0.5)} Z`, fill: shade(headC, -0.25) }, head);
      else if (v.crest === "crest") { const cr = mkPart(inst, head, "crest", [hc[0] - R * 0.2, hc[1] - R * 0.8]); for (let i = 0; i < 4; i++) el("path", { d: `M${f1(hc[0] - R * 0.1)},${f1(hc[1] - R * 0.7)} q-${f1(R * (0.3 + i * 0.15))},-${f1(R * (0.6 + i * 0.1))} -${f1(R * (0.6 + i * 0.25))},-${f1(R * (0.4 + i * 0.05))}`, stroke: v.crestC, "stroke-width": R * 0.14, fill: "none", "stroke-linecap": "round" }, cr); }
      el("circle", { cx: hc[0], cy: hc[1], r: R, fill: defs.radial([[0, shade(headC, 0.25)], [1, shade(headC, -0.15)]], 0.4, 0.35, 0.7) }, head);
      if (v.mask) el("ellipse", { cx: g.eye[0], cy: g.eye[1] + 2, rx: R * 0.45, ry: R * 0.3, fill: v.mask }, head);
      if (v.cheek) el("circle", { cx: hc[0] + R * 0.2, cy: hc[1] + R * 0.35, r: R * 0.24, fill: v.cheek, opacity: 0.85 }, head);
      if (v.eyeBig) { el("circle", { cx: g.eye[0] - R * 0.05, cy: g.eye[1] + R * 0.08, r: R * 0.48, fill: shade(headC, 0.35) }, head); }
      if (v.eyeRing) el("circle", { cx: g.eye[0], cy: g.eye[1], r: R * 0.3, fill: v.eyeRing }, head);
      cartoonEye(inst, head, "eye", g.eye[0], g.eye[1], R * (v.eyeBig ? 0.36 : 0.2), v.eyeC, v.eyeBig);
      // pico (superior e inferior articulado)
      const [bx, by] = g.beak0, BL = v.beakL, bc = v.beakC;
      const low = mkPart(inst, head, "beak_low", [bx - 4, by + 2]);
      const top = mkPart(inst, head, "beak", [bx - 4, by]);
      if (v.beak === "hook") { el("path", { d: `M${f1(bx - 6)},${f1(by - R * 0.22)} Q${f1(bx + BL)},${f1(by - R * 0.3)} ${f1(bx + BL * 0.9)},${f1(by + R * 0.3)} Q${f1(bx + BL * 0.6)},${f1(by)} ${f1(bx - 6)},${f1(by + 4)} Z`, fill: bc }, top); el("path", { d: `M${f1(bx - 6)},${f1(by + 3)} L${f1(bx + BL * 0.55)},${f1(by + 6)} L${f1(bx - 4)},${f1(by + R * 0.2)} Z`, fill: shade(bc, -0.2) }, low); }
      else if (v.beak === "flat") { el("path", { d: `M${f1(bx - 8)},${f1(by - R * 0.18)} L${f1(bx + BL)},${f1(by - 4)} Q${f1(bx + BL + 8)},${f1(by + 2)} ${f1(bx + BL)},${f1(by + 4)} L${f1(bx - 8)},${f1(by + 3)} Z`, fill: bc }, top); el("path", { d: `M${f1(bx - 8)},${f1(by + 3)} L${f1(bx + BL)},${f1(by + 5)} Q${f1(bx + BL * 0.5)},${f1(by + 14)} ${f1(bx - 8)},${f1(by + 12)} Z`, fill: shade(bc, -0.15) }, low); }
      else if (v.beak === "big") { el("path", { d: `M${f1(bx - 10)},${f1(by - R * 0.5)} Q${f1(bx + BL * 0.6)},${f1(by - R * 0.7)} ${f1(bx + BL)},${f1(by)} L${f1(bx - 10)},${f1(by + 2)} Z`, fill: bc }, top); el("path", { d: `M${f1(bx + BL * 0.55)},${f1(by - R * 0.5)} Q${f1(bx + BL * 0.9)},${f1(by - R * 0.3)} ${f1(bx + BL)},${f1(by)} L${f1(bx + BL * 0.5)},${f1(by)} Z`, fill: v.beakTip || "#e0452a" }, top); el("path", { d: `M${f1(bx - 10)},${f1(by + 2)} L${f1(bx + BL)},${f1(by + 2)} Q${f1(bx + BL * 0.5)},${f1(by + R * 0.35)} ${f1(bx - 10)},${f1(by + R * 0.3)} Z`, fill: shade(bc, -0.2) }, low); }
      else if (v.beak === "bent") { el("path", { d: `M${f1(bx - 6)},${f1(by - R * 0.2)} L${f1(bx + BL * 0.5)},${f1(by - 4)} Q${f1(bx + BL)},${f1(by)} ${f1(bx + BL * 0.85)},${f1(by + BL * 0.5)} L${f1(bx + BL * 0.4)},${f1(by + 6)} L${f1(bx - 6)},${f1(by + 4)} Z`, fill: bc }, top); el("path", { d: `M${f1(bx + BL * 0.6)},${f1(by + BL * 0.1)} Q${f1(bx + BL * 0.95)},${f1(by + BL * 0.3)} ${f1(bx + BL * 0.85)},${f1(by + BL * 0.5)} Z`, fill: "#1d1d1d" }, top); el("path", { d: `M${f1(bx - 6)},${f1(by + 4)} L${f1(bx + BL * 0.4)},${f1(by + 7)} L${f1(bx - 4)},${f1(by + 14)} Z`, fill: shade(bc, -0.2) }, low); }
      else if (v.beak === "needle") { el("path", { d: `M${f1(bx - 4)},${f1(by - 3)} L${f1(bx + BL)},${f1(by + 1)} L${f1(bx - 4)},${f1(by + 3)} Z`, fill: bc }, top); el("path", { d: `M${f1(bx - 4)},${f1(by + 3)} L${f1(bx + BL * 0.9)},${f1(by + 2)} L${f1(bx - 4)},${f1(by + 6)} Z`, fill: shade(bc, -0.2) }, low); }
      else if (v.beak === "snout") { el("path", { d: `M${f1(bx - 10)},${f1(by - R * 0.25)} Q${f1(bx + BL)},${f1(by - R * 0.2)} ${f1(bx + BL * 0.9)},${f1(by + 4)} L${f1(bx - 10)},${f1(by + 4)} Z`, fill: bc }, top); el("circle", { cx: bx + BL * 0.8, cy: by - 2, r: 3, fill: "#111" }, top); el("path", { d: `M${f1(bx - 10)},${f1(by + 4)} L${f1(bx + BL * 0.8)},${f1(by + 5)} Q${f1(bx + BL * 0.4)},${f1(by + R * 0.3)} ${f1(bx - 10)},${f1(by + R * 0.25)} Z`, fill: shade(bc, -0.2) }, low); }
      else { el("path", { d: `M${f1(bx - 6)},${f1(by - R * 0.18)} L${f1(bx + BL)},${f1(by + 1)} L${f1(bx - 6)},${f1(by + 4)} Z`, fill: bc }, top); el("path", { d: `M${f1(bx - 6)},${f1(by + 3)} L${f1(bx + BL * 0.8)},${f1(by + 3)} L${f1(bx - 6)},${f1(by + R * 0.16)} Z`, fill: shade(bc, -0.2) }, low); }
      if (v.wattle) el("path", { d: `M${f1(bx - 4)},${f1(by + 6)} q4,${f1(R * 0.6)} ${f1(R * 0.15)},${f1(R * 0.55)} q${f1(R * 0.12)},-${f1(R * 0.3)} -2,-${f1(R * 0.55)} Z`, fill: v.crestC }, head);
      if (v.legL > 8) legs("R", false);
      // ala cercana (encima del cuerpo)
      const wing = mkPart(inst, body, "wing", g.wing0);
      wingShape(wing, wingC, false);
      mkPart(inst, wing, "wing_tip", [g.wing0[0] - v.bodyRx, g.wing0[1]]);
      return inst;
    },
    pose(s) {
      const v = withDefaults(BD, s.v);
      const T = s.t, base = s.base || "idle", seed = s.seed || 0, beats = s.beats || [];
      const o = {};
      const fly = base === "fly" || (v.hover && base !== "walk" && base !== "peck" && base !== "sit");
      const walk = base === "walk" || base === "travel" || base === "run";
      const f = base === "run" ? 3.4 : 2.2;
      const ph = T * f * TAU + seed;
      const waddle = v.tilt > 1 || v.feet === "web";
      if (fly) {
        const fl = Math.sin(T * v.flapHz * TAU + seed);
        o.wing = { r: v.wings === "flipper" ? fl * 0.3 : -0.9 + fl * 1.05 };
        o.wing_far = { r: v.wings === "flipper" ? fl * 0.3 : -1.0 + fl * 1.0 };
        o.leg_L = { r: 1.1 }; o.leg_R = { r: 1.0 };
        o.body = { y: 0, r: 0 };
        o.root = { y: -v.legL * 0.5 + Math.sin(T * 1.6 + seed) * 12 - (v.flapHz > 6 ? 0 : fl * 6) };
      } else {
        o.leg_L = { r: walk ? Math.sin(ph) * 0.45 : 0 };
        o.leg_R = { r: walk ? -Math.sin(ph) * 0.45 : 0 };
        const fold = VSV.beatWeight(beats, "surprise", T);
        o.wing = { r: -fold * 0.9 + Math.sin(T * 2 + seed) * 0.02 };
        o.wing_far = { r: -fold * 0.9 };
        o.body = { y: walk ? -Math.abs(Math.sin(ph)) * 6 : Math.sin(T * 2.2 + seed) * 1.5, r: waddle && walk ? Math.sin(ph) * 0.08 : 0 };
        const hopW = bump(T, (beats.find((b) => b.action === "hop") || {}).at || -9, 0.55);
        o.root = { y: -hopW * v.legL * 0.9 - fold * 10 + (base === "sit" ? v.legL * 0.75 : 0) };
        if (base === "sit") { o.leg_L = { r: 0 }; o.leg_R = { r: 0 }; }
      }
      const peck = VSV.beatWeight(beats, "peck", T) + (base === "peck" ? Math.max(0, Math.sin(T * 5 + seed)) : 0);
      const talk = VSV.beatWeight(beats, "talk", T) + (base === "talk" ? 1 : 0);
      const wl = VSV.beatWeight(beats, "look_left", T), wr = VSV.beatWeight(beats, "look_right", T);
      o.neck = { r: clamp(peck) * 1.0 + (walk && !waddle ? Math.sin(ph * 2) * 0.12 : 0) };
      o.head = { r: -wl * 0.35 + wr * 0.2 + clamp(peck) * 0.5 + noise1(T * 0.7, seed) * 0.06, x: walk && !waddle ? Math.sin(ph * 2) * 4 : 0 };
      o.beak_low = { r: talk ? Math.max(0, Math.sin(T * 12 + seed)) * 0.35 * clamp(talk) : 0 };
      o.tail = { r: walk ? Math.sin(ph) * 0.08 : Math.sin(T * 1.5 + seed) * 0.04 };
      o.crest = { r: -VSV.beatWeight(beats, "surprise", T) * 0.4 };
      const blink = base === "breathe" || base === "sleep" ? 1 : VSV.blinkAt(T, seed, beats);
      o.eye = { sy: 1 - blink * 0.9 };
      return o;
    },
    apply(inst, pose) {
      applyParts(inst, pose);
      rootApply(inst, pose);
      // el ala lejana solo asoma cuando aletea
      setAttr(inst.extra.wingFar, "opacity", pose.wing_far && pose.wing_far.r < -0.25 ? 1 : 0);
    },
    speed(scale, v0) { const v = withDefaults(BD, v0); return (v.hover ? 260 : 2 * 2.2 * v.legL * 0.5 + 40) * scale; },
  };
  VSV.RIGS.bird = BIRD;

  /* ======================================================================
     PEZ / TIBURÓN / DELFÍN / BALLENA · body (delantero), body_back, tail,
     dorsal, fin_pec, fin_low, eye, jaw — origen en el CENTRO (nada)
     ====================================================================== */
  const FD = { bodyL: 300, bodyH: 120, shape: "fish", tailT: "fork", dorsal: "tri", body: "#f08a2a", belly: null, fin: null, bands: null,
    stripes: null, spots: null, teeth: false, eyeS: 1, eyeC: "#151515", blowhole: false, glow: null, size: 0.4 };

  function fishOutline(v) {
    const L = v.bodyL, H = v.bodyH;
    const nose = v.shape === "whale" ? [L * 0.5, -H * 0.05] : v.shape === "shark" ? [L * 0.52, -H * 0.02] : v.shape === "dolphin" ? [L * 0.56, H * 0.06] : [L * 0.5, 0];
    const front = [[-L * 0.08, -H * 0.5], [L * 0.22, -H * (v.shape === "whale" ? 0.52 : 0.46)], nose, [L * 0.24, H * 0.42], [-L * 0.08, H * 0.48]];
    const back = [[-L * 0.1, -H * 0.48], [-L * 0.32, -H * 0.3], [-L * 0.47, -H * 0.1], [-L * 0.47, H * 0.1], [-L * 0.32, H * 0.3], [-L * 0.1, H * 0.46]];
    return { front, back, nose };
  }
  const FISH = {
    kind: "fish",
    defaults: FD,
    metaFor(v0) {
      const v = withDefaults(FD, v0);
      return { h: v.bodyH * 1.9, w: v.bodyL * 1.25, fitW: true, center: true,
        focus: { head: [v.bodyL * 0.3, -v.bodyH * 0.1], eye: [v.bodyL * 0.32, -v.bodyH * 0.12], face: [v.bodyL * 0.3, 0], mouth: [v.bodyL * 0.46, v.bodyH * 0.12],
          body: [0, 0], tail: [-v.bodyL * 0.55, 0] } };
    },
    build(parent, defs, opts = {}) {
      const v = withDefaults(FD, opts.variant);
      const inst = newInst(this, parent, "fish", v);
      const Rt = inst.root, L = v.bodyL, H = v.bodyH, col = v.body;
      const belly = v.belly || shade(col, 0.35), fin = v.fin || shade(col, -0.2);
      const ol = fishOutline(v);
      const fill = defs.linear([[0, shade(col, -0.15)], [0.55, col], [0.75, belly], [1, belly]]);
      const back = mkPart(inst, Rt, "body_back", [-L * 0.08, 0]);
      const tail = mkPart(inst, back, "tail", [-L * 0.45, 0]);
      const tx = -L * 0.45;
      if (v.tailT === "fork") el("path", { d: `M${f1(tx + 10)},0 L${f1(tx - L * 0.22)},${f1(-H * 0.55)} Q${f1(tx - L * 0.12)},0 ${f1(tx - L * 0.22)},${f1(H * 0.55)} Z`, fill: fin }, tail);
      else if (v.tailT === "fluke") el("path", { d: `M${f1(tx + 10)},-6 Q${f1(tx - L * 0.1)},${f1(-H * 0.1)} ${f1(tx - L * 0.2)},${f1(-H * 0.38)} Q${f1(tx - L * 0.16)},0 ${f1(tx - L * 0.2)},${f1(H * 0.3)} Q${f1(tx - L * 0.1)},${f1(H * 0.08)} ${f1(tx + 10)},6 Z`, fill: fin }, tail);
      else if (v.tailT === "shark") el("path", { d: `M${f1(tx + 10)},-4 L${f1(tx - L * 0.2)},${f1(-H * 0.75)} Q${f1(tx - L * 0.1)},${f1(H * 0.05)} ${f1(tx - L * 0.13)},${f1(H * 0.4)} L${f1(tx + 10)},6 Z`, fill: fin }, tail);
      else el("path", { d: `M${f1(tx + 10)},0 C${f1(tx - L * 0.1)},${f1(-H * 0.6)} ${f1(tx - L * 0.25)},${f1(-H * 0.3)} ${f1(tx - L * 0.24)},0 C${f1(tx - L * 0.25)},${f1(H * 0.3)} ${f1(tx - L * 0.1)},${f1(H * 0.6)} ${f1(tx + 10)},0 Z`, fill: fin }, tail);
      const bpath = smoothPath(ol.back.concat([[-L * 0.02, H * 0.2], [-L * 0.02, -H * 0.2]]), true);
      el("path", { d: bpath, fill }, back);
      const finLow = mkPart(inst, Rt, "fin_low", [-L * 0.05, H * 0.42]);
      el("path", { d: `M${f1(-L * 0.12)},${f1(H * 0.4)} l-${f1(L * 0.08)},${f1(H * 0.28)} l${f1(L * 0.14)},-${f1(H * 0.22)} Z`, fill: fin }, finLow);
      const dors = mkPart(inst, Rt, "dorsal", [0, -H * 0.46]);
      if (v.dorsal === "tri") el("path", { d: `M${f1(L * 0.1)},${f1(-H * 0.45)} Q${f1(-L * 0.02)},${f1(-H * 0.9)} ${f1(-L * 0.12)},${f1(-H * 0.95)} Q${f1(-L * 0.12)},${f1(-H * 0.6)} ${f1(-L * 0.18)},${f1(-H * 0.38)} Z`, fill: fin }, dors);
      else if (v.dorsal === "long") el("path", { d: `M${f1(L * 0.18)},${f1(-H * 0.44)} Q${f1(0)},${f1(-H * 0.75)} ${f1(-L * 0.36)},${f1(-H * 0.28)} L${f1(-L * 0.3)},${f1(-H * 0.2)} Z`, fill: fin }, dors);
      else if (v.dorsal === "sail") el("path", { d: `M${f1(L * 0.2)},${f1(-H * 0.44)} Q${f1(0)},${f1(-H * 1.3)} ${f1(-L * 0.3)},${f1(-H * 0.36)} Z`, fill: fin }, dors);
      else if (v.dorsal === "small") el("path", { d: `M${f1(-L * 0.18)},${f1(-H * 0.4)} l-${f1(L * 0.06)},-${f1(H * 0.22)} l-${f1(L * 0.04)},${f1(H * 0.2)} Z`, fill: fin }, dors);
      const body = mkPart(inst, Rt, "body", [0, 0]);
      const fpath = smoothPath(ol.front.concat([[-L * 0.12, 0]]), true);
      el("path", { d: fpath, fill }, body);
      const clip = defs.clip((c) => { el("path", { d: fpath }, c); el("path", { d: bpath }, c); });
      const deco = VSV.el("g", { "clip-path": clip }, Rt);
      if (v.bands) for (const x of [0.28, 0, -0.3]) el("path", { d: `M${f1(L * x)},${f1(-H)} q-${f1(L * 0.06)},${f1(H)} 0,${f1(H * 2)}`, stroke: v.bands, "stroke-width": L * 0.07, fill: "none" }, deco);
      if (v.bands) for (const x of [0.28, 0, -0.3]) el("path", { d: `M${f1(L * x - L * 0.045)},${f1(-H)} q-${f1(L * 0.06)},${f1(H)} 0,${f1(H * 2)} M${f1(L * x + L * 0.045)},${f1(-H)} q-${f1(L * 0.06)},${f1(H)} 0,${f1(H * 2)}`, stroke: "#151515", "stroke-width": 4, fill: "none" }, deco);
      if (v.stripes) for (let i = 0; i < 3; i++) el("path", { d: `M${f1(L * 0.4)},${f1(-H * 0.2 + i * H * 0.18)} L${f1(-L * 0.5)},${f1(-H * 0.12 + i * H * 0.14)}`, stroke: v.stripes, "stroke-width": 7, opacity: 0.7 }, deco);
      if (v.spots) { const R2 = rng(opts.seed || 2); for (let i = 0; i < 20; i++) el("circle", { cx: (R2() - 0.55) * L, cy: (R2() - 0.7) * H * 0.8, r: 3 + R2() * 5, fill: v.spots }, deco); }
      if (v.shape === "whale") for (let i = 0; i < 6; i++) el("path", { d: `M${f1(L * 0.42 - i * 18)},${f1(H * 0.18)} L${f1(L * 0.05 - i * 18)},${f1(H * 0.42)}`, stroke: shade(belly, -0.2), "stroke-width": 4 }, deco);
      el("path", { d: smoothPath(ol.front.concat([[-L * 0.12, 0]]), true), fill: "none", stroke: shade(col, -0.45), "stroke-width": 3, opacity: 0.35 }, body);
      const jaw = mkPart(inst, body, "jaw", [L * 0.3, H * 0.1]);
      el("path", { d: `M${f1(L * 0.28)},${f1(H * 0.12)} Q${f1(L * 0.42)},${f1(H * 0.2)} ${f1(ol.nose[0] - 6)},${f1(ol.nose[1] + 6)}`, stroke: shade(col, -0.5), "stroke-width": 4, fill: "none", "stroke-linecap": "round" }, jaw);
      if (v.teeth) for (let i = 0; i < 6; i++) el("path", { d: `M${f1(L * 0.3 + i * L * 0.03)},${f1(H * 0.13 + i * 1.5)} l4,9 l4,-9 Z`, fill: "#fff" }, jaw);
      const pec = mkPart(inst, body, "fin_pec", [L * 0.12, H * 0.12]);
      el("path", { d: `M${f1(L * 0.14)},${f1(H * 0.1)} Q${f1(-L * 0.02)},${f1(H * 0.3)} ${f1(-L * 0.04)},${f1(H * 0.42)} Q${f1(L * 0.08)},${f1(H * 0.3)} ${f1(L * 0.16)},${f1(H * 0.18)} Z`, fill: shade(fin, 0.1), opacity: 0.95 }, pec);
      if (v.shape === "shark") for (let i = 0; i < 4; i++) el("path", { d: `M${f1(L * 0.2 - i * 10)},${f1(-H * 0.12)} q-5,${f1(H * 0.15)} 0,${f1(H * 0.3)}`, stroke: shade(col, -0.4), "stroke-width": 3, fill: "none" }, body);
      cartoonEye(inst, body, "eye", L * 0.32, -H * 0.12 + (v.shape === "whale" ? H * 0.12 : 0), Math.max(8, H * 0.12) * v.eyeS, v.eyeC, v.eyeS > 1.2);
      if (v.blowhole) { inst.extra.spout = el("path", { d: `M${f1(L * 0.12)},${f1(-H * 0.5)} q-20,-60 -40,-90 M${f1(L * 0.12)},${f1(-H * 0.5)} q0,-70 10,-100 M${f1(L * 0.12)},${f1(-H * 0.5)} q20,-60 40,-86`, stroke: "#dff4ff", "stroke-width": 8, fill: "none", "stroke-linecap": "round", opacity: 0 }, Rt); }
      if (v.glow) el("circle", { cx: L * 0.55, cy: -H * 0.7, r: 12, fill: v.glow, filter: defs.glow(8, v.glow) }, Rt);
      return inst;
    },
    pose(s) {
      const v = withDefaults(FD, s.v);
      const T = s.t, base = s.base || "idle", seed = s.seed || 0, beats = s.beats || [];
      const fast = isMove(base) ? 1.8 : 1;
      const w = T * 2.4 * fast + seed;
      const amp = v.shape === "whale" ? 0.5 : 1;
      const talk = VSV.beatWeight(beats, "talk", T) + (base === "talk" ? 1 : 0);
      const sur = VSV.beatWeight(beats, "surprise", T);
      const o = {
        body_back: { r: Math.sin(w) * 0.1 * amp },
        tail: { r: Math.sin(w - 0.9) * 0.28 * amp },
        fin_pec: { r: Math.sin(T * 4 + seed) * 0.25 },
        fin_low: { r: Math.sin(T * 3 + seed) * 0.1 },
        dorsal: { r: Math.sin(w - 0.4) * 0.03 },
        jaw: { r: talk ? Math.max(0, Math.sin(T * 9)) * 0.2 * clamp(talk) : 0 },
        eye: { sy: 1 - VSV.blinkAt(T, seed, beats) * (v.shape === "dolphin" || v.shape === "whale" ? 0.9 : 0) + sur * 0.3, sx: 1 + sur * 0.3 },
        body: { r: Math.sin(w + 0.6) * 0.03 * amp },
        root: { y: Math.sin(T * 0.8 + seed) * v.bodyH * 0.12 - bump(T, (beats.find((b) => b.action === "hop") || {}).at || -9, 0.6) * v.bodyH, r: Math.sin(T * 0.8 + seed + 1) * 0.04 },
      };
      o._spout = v.blowhole ? Math.max(0, Math.sin(T * 0.5 + seed)) : 0;
      return o;
    },
    apply(inst, pose) {
      applyParts(inst, pose);
      rootApply(inst, pose);
      if (inst.extra.spout) setAttr(inst.extra.spout, "opacity", (pose._spout > 0.8 ? (pose._spout - 0.8) * 4 : 0).toFixed(2));
    },
    speed(scale, v0) { const v = withDefaults(FD, v0); return v.bodyL * 0.9 * scale; },
  };
  VSV.RIGS.fish = FISH;

  /* ======================================================================
     PULPO / CALAMAR / MEDUSA · mantle, eye_L, eye_R, 8 tentáculos × 3
     ====================================================================== */
  const OD = { kind: "octopus", R: 110, armL: 230, body: "#d8566b", spots: null, glow: false, size: 0.42 };
  const OCTO = {
    kind: "octopus",
    defaults: OD,
    metaFor(v0) { const v = withDefaults(OD, v0); return { h: v.R * 2 + v.armL, w: v.R * 2.6, center: true, fitW: false, focus: { head: [0, -v.R * 0.9], eye: [v.R * 0.3, -v.R * 0.6], face: [0, -v.R * 0.6], body: [0, -v.R * 0.5], legs: [0, v.armL * 0.5] } }; },
    build(parent, defs, opts = {}) {
      const v = withDefaults(OD, opts.variant);
      const inst = newInst(this, parent, "octopus", v);
      const Rt = inst.root, R = v.R, col = v.body;
      const jelly = v.kind === "jellyfish";
      const n = jelly ? 7 : 8;
      for (let i = 0; i < n; i++) {
        const x0 = -R * 0.75 + (i / (n - 1)) * R * 1.5, far = i % 2 === 0;
        let p = [x0, -R * 0.1], par = Rt;
        for (let k = 0; k < 3; k++) {
          const tg = mkPart(inst, par, `arm_${i}_${k}`, p);
          const e = [p[0], p[1] + v.armL / 3];
          if (jelly) el("path", { d: `M${f1(p[0])},${f1(p[1])} L${f1(e[0])},${f1(e[1])}`, stroke: shade(col, 0.2), "stroke-width": 5 - k, opacity: 0.7, "stroke-linecap": "round" }, tg);
          else {
            capTo(tg, p, e, R * (0.3 - k * 0.08), R * (0.24 - k * 0.08), far ? shade(col, -0.25) : col);
            if (!far) for (let r = 0.25; r < 1; r += 0.3) el("circle", { cx: p[0] + R * 0.06, cy: lerp(p[1], e[1], r), r: R * 0.04, fill: shade(col, 0.45) }, tg);
          }
          par = tg; p = e;
        }
      }
      const mantle = mkPart(inst, Rt, "mantle", [0, -R * 0.2]);
      const md = jelly ? `M${-R},${f1(-R * 0.05)} Q${-R},${f1(-R * 1.25)} 0,${f1(-R * 1.25)} Q${R},${f1(-R * 1.25)} ${R},${f1(-R * 0.05)} Q${f1(R * 0.5)},${f1(R * 0.1)} 0,${f1(-R * 0.05)} Q${f1(-R * 0.5)},${f1(R * 0.1)} ${-R},${f1(-R * 0.05)} Z`
        : v.kind === "squid" ? `M${f1(-R * 0.6)},0 Q${f1(-R * 0.7)},${f1(-R * 1.2)} 0,${f1(-R * 2.2)} Q${f1(R * 0.7)},${f1(-R * 1.2)} ${f1(R * 0.6)},0 Z`
          : smoothPath([[-R * 0.85, -R * 0.1], [-R * 0.95, -R * 0.9], [-R * 0.4, -R * 1.55], [R * 0.4, -R * 1.5], [R * 0.95, -R * 0.85], [R * 0.85, -R * 0.1]], true);
      el("path", { d: md, fill: defs.radial([[0, shade(col, 0.3), jelly ? 0.7 : 1], [1, shade(col, -0.2), jelly ? 0.55 : 1]], 0.45, 0.35, 0.75), stroke: jelly ? shade(col, 0.4) : "none", "stroke-width": 3 }, mantle);
      if (v.spots) { const R2 = rng(opts.seed || 4); for (let i = 0; i < 12; i++) el("circle", { cx: (R2() - 0.5) * R * 1.4, cy: -R * (0.3 + R2() * 1.0), r: 4 + R2() * 8, fill: v.spots, opacity: 0.8 }, mantle); }
      if (v.glow) el("path", { d: md, fill: "none", stroke: shade(col, 0.5), "stroke-width": 10, opacity: 0.5, filter: defs.blur(8) }, mantle);
      if (!jelly) for (const [nm, x] of [["eye_L", -R * 0.35], ["eye_R", R * 0.35]]) cartoonEye(inst, mantle, nm, x, -R * 0.55, R * 0.2, "#1a1a1a", false);
      else { mkPart(inst, mantle, "eye_L", [0, 0]); mkPart(inst, mantle, "eye_R", [0, 0]); }
      return inst;
    },
    pose(s) {
      const v = withDefaults(OD, s.v);
      const T = s.t, seed = s.seed || 0, beats = s.beats || [];
      const o = {};
      const jelly = v.kind === "jellyfish";
      const pulse = Math.sin(T * (jelly ? 2.2 : 1.4) + seed);
      const n = jelly ? 7 : 8;
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) o[`arm_${i}_${k}`] = { r: Math.sin(T * 1.8 + seed + i * 0.8 - k * 0.7) * (0.18 + k * 0.1) * (i < n / 2 ? 1 : -1) };
      o.mantle = { sx: 1 + pulse * (jelly ? 0.08 : 0.03), sy: 1 - pulse * (jelly ? 0.06 : 0.02) };
      const bl = VSV.blinkAt(T, seed, beats);
      o.eye_L = { sy: 1 - bl * 0.9 }; o.eye_R = { sy: 1 - bl * 0.9 };
      o.root = { y: Math.sin(T * 0.9 + seed) * 18 - (jelly ? Math.max(0, pulse) * 14 : 0) };
      return o;
    },
    apply(inst, pose) { applyParts(inst, pose); rootApply(inst, pose); },
    speed(scale, v0) { return withDefaults(OD, v0).R * 1.2 * scale; },
  };
  VSV.RIGS.octopus = OCTO;

  /* ======================================================================
     INSECTO · head, thorax, abdomen, 6 patas (3 cercanas + 3 lejanas, con
     articulación), antenas, alas (transparentes / mariposa / élitros)
     ====================================================================== */
  const ID = { kind: "ant", headR: 30, thoraxR: 28, abdRx: 52, abdRy: 36, legL: 70, body: "#2a1d18", abd: null, stripes: null, spots: null,
    wings: "none", wingC: "#d9f1ff", wingC2: null, antL: 70, stinger: false, proboscis: false, jumpLegs: false, glow: null, eyeC: "#1b1b1b",
    eyeBig: false, hover: false, flapHz: 7.5, size: 0.22 };
  function insGeo(v) {
    const y = -v.legL * 0.55 - v.thoraxR;
    return { y, th: [0, y], hd: [v.thoraxR + v.headR * 0.85, y - v.headR * 0.25], ab: [-v.thoraxR - v.abdRx * 0.9, y + v.abdRy * 0.1] };
  }
  const INSECT = {
    kind: "insect",
    defaults: ID,
    metaFor(v0) {
      const v = withDefaults(ID, v0);
      const g = insGeo(v);
      const top = Math.min(g.hd[1] - v.headR - v.antL * 0.7, g.th[1] - (v.wings === "butterfly" ? v.abdRx * 2.9 : v.wings !== "none" ? v.thoraxR * 2 : v.thoraxR));
      return { h: -top, w: g.hd[0] + v.headR * 2 - (g.ab[0] - v.abdRx), fitW: v.wings !== "butterfly",
        focus: { head: g.hd, eye: [g.hd[0] + v.headR * 0.3, g.hd[1] - v.headR * 0.2], face: g.hd, mouth: [g.hd[0] + v.headR, g.hd[1] + v.headR * 0.3],
          body: g.th, legs: [0, -v.legL * 0.3], wing: [0, g.th[1] - v.thoraxR * 1.5] } };
    },
    build(parent, defs, opts = {}) {
      const v = withDefaults(ID, opts.variant);
      const inst = newInst(this, parent, "insect", v);
      const Rt = inst.root, g = insGeo(v), col = v.body, abd = v.abd || col;
      shadowEllipse(inst, defs, v.abdRx * 1.6, 8, 0.18);
      const legSet = (side, far) => {
        [[-0.4, 1.05], [0.05, 1], [0.5, 1.05]].forEach(([dx, kk], i) => {
          const x = g.th[0] + dx * v.thoraxR * 1.6 + (far ? -6 : 0);
          const hind = i === 0 && v.jumpLegs;
          const up = mkPart(inst, Rt, `leg_${i}${side}`, [x, g.th[1] + v.thoraxR * 0.5]);
          const kneeP = [x + (i - 1) * v.legL * 0.35 + (hind ? -v.legL * 0.3 : 0), g.th[1] - (hind ? v.legL * 0.5 : v.legL * 0.1)];
          const c = far ? shade(col, -0.35) : shade(col, 0.1);
          el("path", { d: `M${f1(x)},${f1(g.th[1] + v.thoraxR * 0.5)} L${f1(kneeP[0])},${f1(kneeP[1])}`, stroke: c, "stroke-width": hind ? 12 : 6, "stroke-linecap": "round" }, up);
          const lo = mkPart(inst, up, `leg_${i}${side}_k`, kneeP);
          el("path", { d: `M${f1(kneeP[0])},${f1(kneeP[1])} L${f1(kneeP[0] + (i - 1) * v.legL * 0.25 + (hind ? -v.legL * 0.25 : 0))},-2`, stroke: c, "stroke-width": 5, "stroke-linecap": "round" }, lo);
        });
      };
      legSet("L", true);
      // alas lejanas
      const wingPath = (k) => {
        const [x, y] = [g.th[0] - v.thoraxR * 0.2, g.th[1] - v.thoraxR * 0.7];
        if (v.wings === "butterfly") {
          // ala anterior grande (arriba-delante) + posterior redondeada (atrás), vistas de perfil con las alas juntas
          const A = v.abdRx * 1.35 * k;
          return `M${f1(x)},${f1(y)} C${f1(x + A * 0.2)},${f1(y - A * 1.0)} ${f1(x + A * 1.1)},${f1(y - A * 1.9)} ${f1(x + A * 0.55)},${f1(y - A * 2.05)} C${f1(x - A * 0.2)},${f1(y - A * 2.1)} ${f1(x - A * 0.9)},${f1(y - A * 1.3)} ${f1(x - A * 0.35)},${f1(y - A * 0.55)}`
            + ` C${f1(x - A * 1.25)},${f1(y - A * 0.75)} ${f1(x - A * 1.35)},${f1(y + A * 0.05)} ${f1(x - A * 0.7)},${f1(y + A * 0.35)} C${f1(x - A * 0.35)},${f1(y + A * 0.5)} ${f1(x - A * 0.1)},${f1(y + A * 0.2)} ${f1(x)},${f1(y)} Z`;
        }
        if (v.wings === "long") return `M${f1(x)},${f1(y)} Q${f1(x - v.abdRx * 0.6)},${f1(y - v.thoraxR * 1.2)} ${f1(x - v.abdRx * 2.6)},${f1(y - v.thoraxR * 0.9)} Q${f1(x - v.abdRx * 1.2)},${f1(y + 4)} ${f1(x)},${f1(y)} Z`;
        return `M${f1(x)},${f1(y)} Q${f1(x - v.abdRx * 0.4)},${f1(y - v.thoraxR * 2.2)} ${f1(x - v.abdRx * 1.5)},${f1(y - v.thoraxR * 1.6)} Q${f1(x - v.abdRx * 1.1)},${f1(y - v.thoraxR * 0.2)} ${f1(x)},${f1(y)} Z`;
      };
      const wingPivot = [g.th[0] - v.thoraxR * 0.2, g.th[1] - v.thoraxR * 0.7];
      if (v.wings !== "none" && v.wings !== "shell") {
        const wb = mkPart(inst, Rt, "wing_B", wingPivot);
        el("path", { d: wingPath(0.85), fill: v.wings === "butterfly" ? shade(v.wingC, -0.25) : v.wingC, opacity: v.wings === "butterfly" ? 1 : 0.45, stroke: shade(v.wingC, -0.4), "stroke-width": 2 }, wb);
      }
      // abdomen
      const ab = mkPart(inst, Rt, "abdomen", [g.ab[0] + v.abdRx * 0.8, g.ab[1]]);
      el("ellipse", { cx: g.ab[0], cy: g.ab[1], rx: v.abdRx, ry: v.abdRy, fill: defs.radial([[0, shade(abd, 0.3)], [1, shade(abd, -0.2)]], 0.4, 0.3, 0.75) }, ab);
      if (v.stripes) { const c = defs.clip((cc) => el("ellipse", { cx: g.ab[0], cy: g.ab[1], rx: v.abdRx, ry: v.abdRy }, cc)); const sg = VSV.el("g", { "clip-path": c }, ab); for (let i = -1; i <= 1; i++) el("rect", { x: g.ab[0] + i * v.abdRx * 0.55 - v.abdRx * 0.14, y: g.ab[1] - v.abdRy, width: v.abdRx * 0.28, height: v.abdRy * 2, fill: v.stripes }, sg); }
      if (v.glow) inst.extra.glow = el("ellipse", { cx: g.ab[0] - v.abdRx * 0.4, cy: g.ab[1], rx: v.abdRx * 0.7, ry: v.abdRy * 0.9, fill: v.glow, filter: defs.glow(10, v.glow) }, ab);
      if (v.stinger) el("path", { d: `M${f1(g.ab[0] - v.abdRx * 0.95)},${f1(g.ab[1] - 4)} l-16,4 l16,4 Z`, fill: "#222" }, ab);
      if (v.kind === "ant" || v.kind === "termite") el("ellipse", { cx: g.ab[0] + v.abdRx * 0.95, cy: g.ab[1] - 2, rx: 9, ry: 7, fill: shade(col, -0.1) }, ab);
      // tórax
      const th = mkPart(inst, Rt, "thorax", g.th);
      el("ellipse", { cx: g.th[0], cy: g.th[1], rx: v.thoraxR * 1.1, ry: v.thoraxR, fill: defs.radial([[0, shade(col, 0.3)], [1, shade(col, -0.25)]], 0.4, 0.3, 0.75) }, th);
      if (v.wings === "shell") {
        const sh = mkPart(inst, th, "elytra", [g.th[0] + v.thoraxR * 0.6, g.th[1] - v.thoraxR * 0.5]);
        const sd = `M${f1(g.th[0] + v.thoraxR * 0.7)},${f1(g.th[1] - v.thoraxR * 0.4)} Q${f1(g.ab[0])},${f1(g.th[1] - v.thoraxR * 1.9)} ${f1(g.ab[0] - v.abdRx * 1.05)},${f1(g.ab[1] + v.abdRy * 0.3)} L${f1(g.th[0] + v.thoraxR * 0.7)},${f1(g.ab[1] + v.abdRy * 0.4)} Z`;
        el("path", { d: sd, fill: defs.linear([[0, shade(v.wingC, 0.25)], [1, shade(v.wingC, -0.2)]]), stroke: shade(v.wingC, -0.5), "stroke-width": 3 }, sh);
        if (v.spots) { const cc = defs.clip((c) => el("path", { d: sd }, c)); const sg = VSV.el("g", { "clip-path": cc }, sh); [[0.1, -1.1], [-0.55, -1.2], [-1.05, -0.6], [-0.3, -0.4], [-1.4, 0.0]].forEach(([dx, dy]) => el("circle", { cx: g.th[0] + v.abdRx * dx, cy: g.th[1] + v.thoraxR * dy, r: v.thoraxR * 0.36, fill: v.spots }, sg)); }
      }
      // cabeza
      const hd = mkPart(inst, Rt, "head", [g.hd[0] - v.headR * 0.6, g.hd[1]]);
      for (const [nm, dx] of [["ant_B", -0.2], ["ant_F", 0.2]]) {
        const a = mkPart(inst, hd, nm, [g.hd[0] + v.headR * dx, g.hd[1] - v.headR * 0.8]);
        const ax = g.hd[0] + v.headR * dx, ay = g.hd[1] - v.headR * 0.8;
        if (v.kind === "butterfly" || v.kind === "moth") el("path", { d: `M${f1(ax)},${f1(ay)} q${f1(v.antL * 0.2)},-${f1(v.antL * 0.7)} ${f1(v.antL * 0.5)},-${f1(v.antL * 0.85)}`, stroke: "#222", "stroke-width": 3, fill: "none" }, a), el("circle", { cx: ax + v.antL * 0.5, cy: ay - v.antL * 0.85, r: 5, fill: "#222" }, a);
        else el("path", { d: `M${f1(ax)},${f1(ay)} q${f1(v.antL * 0.15)},-${f1(v.antL * 0.6)} ${f1(v.antL * 0.55)},-${f1(v.antL * 0.7)}`, stroke: shade(col, -0.1), "stroke-width": 4, fill: "none", "stroke-linecap": "round" }, a);
      }
      el("circle", { cx: g.hd[0], cy: g.hd[1], r: v.headR, fill: defs.radial([[0, shade(col, 0.35)], [1, shade(col, -0.2)]], 0.4, 0.3, 0.75) }, hd);
      if (v.proboscis) el("path", { d: `M${f1(g.hd[0] + v.headR * 0.8)},${f1(g.hd[1] + v.headR * 0.3)} l${f1(v.headR * 1.5)},${f1(v.headR * 0.8)}`, stroke: "#2a2a2a", "stroke-width": 4, "stroke-linecap": "round" }, hd);
      else el("path", { d: `M${f1(g.hd[0] + v.headR * 0.75)},${f1(g.hd[1] + v.headR * 0.4)} q10,6 4,16 M${f1(g.hd[0] + v.headR * 0.6)},${f1(g.hd[1] + v.headR * 0.55)} q12,4 8,14`, stroke: shade(col, -0.3), "stroke-width": 4, fill: "none", "stroke-linecap": "round" }, hd);
      if (v.eyeBig) { const e = mkPart(inst, hd, "eye", [g.hd[0] + v.headR * 0.3, g.hd[1] - v.headR * 0.1]); el("ellipse", { cx: g.hd[0] + v.headR * 0.3, cy: g.hd[1] - v.headR * 0.1, rx: v.headR * 0.6, ry: v.headR * 0.7, fill: v.eyeC }, e); el("circle", { cx: g.hd[0] + v.headR * 0.45, cy: g.hd[1] - v.headR * 0.4, r: v.headR * 0.15, fill: "#fff", opacity: 0.8 }, e); }
      else cartoonEye(inst, hd, "eye", g.hd[0] + v.headR * 0.35, g.hd[1] - v.headR * 0.2, v.headR * 0.32, v.eyeC, false);
      legSet("R", false);
      if (v.wings !== "none" && v.wings !== "shell") {
        const wf = mkPart(inst, Rt, "wing_F", wingPivot);
        el("path", { d: wingPath(1), fill: v.wings === "butterfly" ? defs.radial([[0, v.wingC2 || shade(v.wingC, 0.4)], [0.7, v.wingC], [1, "#1b1b1b"]], 0.4, 0.55, 0.8) : v.wingC, opacity: v.wings === "butterfly" ? 1 : 0.55, stroke: v.wings === "butterfly" ? "#1b1b1b" : shade(v.wingC, -0.4), "stroke-width": v.wings === "butterfly" ? 5 : 2 }, wf);
        if (v.wings === "butterfly") {
          const A = v.abdRx * 1.35, [px, py] = wingPivot;
          el("path", { d: `M${f1(px)},${f1(py)} L${f1(px + A * 0.5)},${f1(py - A * 1.9)} M${f1(px)},${f1(py)} L${f1(px - A * 0.6)},${f1(py - A * 1.4)} M${f1(px)},${f1(py)} L${f1(px - A * 0.95)},${f1(py)}`, stroke: "#1b1b1b", "stroke-width": 3, opacity: 0.55 }, wf);
          for (const [dx, dy, r] of [[0.45, -1.75, 0.13], [0.15, -1.85, 0.1], [-0.8, -0.1, 0.12], [-0.25, -1.1, 0.16]]) el("circle", { cx: px + A * dx, cy: py + A * dy, r: A * r, fill: r > 0.15 ? (v.wingC2 || "#fff") : "#fff", stroke: "#1b1b1b", "stroke-width": 2 }, wf);
        }
        else el("path", { d: `M${f1(wingPivot[0])},${f1(wingPivot[1])} l-${f1(v.abdRx * 0.9)},-${f1(v.thoraxR * 1.1)} M${f1(wingPivot[0])},${f1(wingPivot[1])} l-${f1(v.abdRx * 1.2)},-${f1(v.thoraxR * 0.6)}`, stroke: shade(v.wingC, -0.4), "stroke-width": 2, opacity: 0.6 }, wf);
      }
      return inst;
    },
    pose(s) {
      const v = withDefaults(ID, s.v);
      const T = s.t, base = s.base || "idle", seed = s.seed || 0, beats = s.beats || [];
      const fly = v.wings !== "none" && v.wings !== "shell" && (base === "fly" || (v.hover && base !== "walk" && base !== "crawl")) || (v.wings === "shell" && base === "fly");
      const walk = !fly && isMove(base);
      const o = {};
      const ph = T * 3.2 * TAU + seed;
      for (const side of ["L", "R"]) for (let i = 0; i < 3; i++) {
        const grp = (i + (side === "L" ? 0 : 1)) % 2;
        const p = ph + grp * PI;
        o[`leg_${i}${side}`] = { r: fly ? 0.5 : walk ? Math.sin(p) * 0.3 : Math.sin(T * 2 + i + seed) * 0.03 };
        o[`leg_${i}${side}_k`] = { r: fly ? 0.6 : walk ? Math.max(0, Math.cos(p)) * 0.25 : 0 };
      }
      const flap = Math.sin(T * (v.wings === "butterfly" ? 2.6 : v.flapHz) * TAU + seed);
      // mariposa de perfil: al aletear las alas se abren (se ven de canto) y se cierran sobre el cuerpo
      if (v.wings === "butterfly") { o.wing_F = { sy: fly ? 0.18 + 0.82 * (0.5 + 0.5 * flap) : 1 - 0.08 * Math.max(0, Math.sin(T * 0.9 + seed)), r: fly ? -0.12 * flap : 0 }; o.wing_B = { sy: fly ? 0.15 + 0.8 * (0.5 + 0.5 * Math.sin(T * 2.6 * TAU + seed - 0.3)) : 1, r: -0.15 }; }
      else { o.wing_F = { r: fly ? flap * 0.6 - 0.4 : 0, sy: fly ? 0.75 + 0.25 * flap : 1 }; o.wing_B = { r: fly ? -flap * 0.5 - 0.3 : 0 }; }
      o.elytra = { r: fly ? -0.7 : 0 };
      o.abdomen = { r: Math.sin(T * 2.6 + seed) * 0.04 + (v.stinger ? VSV.beatWeight(beats, "surprise", T) * 0.3 : 0) };
      const talk = VSV.beatWeight(beats, "talk", T) + (base === "talk" ? 1 : 0);
      o.ant_F = { r: Math.sin(T * 3 + seed) * 0.15 + talk * Math.sin(T * 10) * 0.1 };
      o.ant_B = { r: Math.sin(T * 3 + seed + 1.3) * 0.15 };
      o.head = { r: -VSV.beatWeight(beats, "look_left", T) * 0.25 + VSV.beatWeight(beats, "look_right", T) * 0.15 + (walk ? Math.sin(ph * 2) * 0.04 : 0) };
      o.eye = { sy: 1 - VSV.blinkAt(T, seed, beats) * (v.eyeBig ? 0 : 0.9) };
      const hopW = bump(T, (beats.find((b) => b.action === "hop") || {}).at || -9, 0.6);
      const hov = v.thoraxR * 3;  // el director ya sube a los voladores; aquí solo flotan
      o.root = { y: fly ? -hov + Math.sin(T * 1.3 + seed) * hov * 0.3 : -hopW * v.legL * (v.jumpLegs ? 3 : 1), r: fly ? Math.sin(T * 0.9 + seed) * 0.06 : 0 };
      o._glow = v.glow ? 0.35 + 0.65 * Math.max(0, Math.sin(T * 2.2 + seed)) : 0;
      return o;
    },
    apply(inst, pose) {
      applyParts(inst, pose);
      rootApply(inst, pose);
      if (inst.extra.glow) setAttr(inst.extra.glow, "opacity", pose._glow.toFixed(2));
    },
    speed(scale, v0) { const v = withDefaults(ID, v0); return (v.hover || v.wings === "butterfly" ? 220 : v.legL * 2.6) * scale; },
  };
  VSV.RIGS.insect = INSECT;

  /* ======================================================================
     SERPIENTE / GUSANO / CARACOL · cuerpo continuo recalculado por pose,
     head, eye, tongue, jaw, hood (cobra), shell y stalks (caracol)
     ====================================================================== */
  const SD = { kind: "snake", L: 560, W: 44, body: "#5c8f3a", belly: null, dark: null, pattern: "bands", headT: "round", hood: false,
    shellC: "#b07a3e", rattle: false, size: 0.5 };
  const SN = 26;
  function snakePts(v, T, base, seed, beats) {
    const pts = [];
    const moving = isMove(base);
    const worm = v.kind === "worm", snail = v.kind === "snail";
    const sp = moving ? 1 : 0.35;
    const rise = v.hood || base === "surprise" ? 1 : VSV.beatWeight(beats, "surprise", T);
    for (let i = 0; i < SN; i++) {
      const u = i / (SN - 1);
      const x = -u * v.L + v.L * 0.15;
      let y;
      if (worm) y = -Math.max(0, Math.sin(u * PI * 2 - T * 3 * sp + seed)) * v.W * 0.9;
      else if (snail) y = -Math.sin(u * PI) * 0;
      else y = Math.sin(u * PI * 3 - T * 2.6 * sp + seed) * v.W * 0.35 * (0.4 + u);
      // la cabeza se levanta (cobra / sorpresa)
      if (!worm && !snail && u < 0.3) { const k = 1 - u / 0.3; y -= rise * k * k * v.L * 0.28; }
      pts.push([x, y - v.W * 0.5]);
    }
    return pts;
  }
  const SNAKE = {
    kind: "snake",
    defaults: SD,
    metaFor(v0) { const v = withDefaults(SD, v0); return { h: v.kind === "snail" ? v.W * 4.2 : v.W * 2.6 + (v.hood ? v.L * 0.3 : 0), w: v.L * 1.05, fitW: true, focus: { head: [v.L * 0.15, -v.W * 0.6], eye: [v.L * 0.17, -v.W * 0.7], face: [v.L * 0.15, -v.W * 0.6], mouth: [v.L * 0.19, -v.W * 0.5], body: [-v.L * 0.3, -v.W * 0.5] } }; },
    build(parent, defs, opts = {}) {
      const v = withDefaults(SD, opts.variant);
      const inst = newInst(this, parent, "snake", v);
      const Rt = inst.root, col = v.body, dark = v.dark || shade(col, -0.45), belly = v.belly || shade(col, 0.35);
      shadowEllipse(inst, defs, v.L * 0.5, 10, 0.18);
      inst.extra.shadowE.setAttribute("cx", -v.L * 0.3);
      const segs = [[0, 0.65, 1], [0.6, 0.85, 0.75], [0.82, 1, 0.42]];
      inst.extra.paths = segs.map(([a, b, w]) => ({ a, b, w,
        base: el("path", { fill: "none", stroke: shade(col, -0.15), "stroke-width": v.W * w, "stroke-linecap": "round", "stroke-linejoin": "round" }, Rt) }));
      inst.extra.belly = el("path", { fill: "none", stroke: belly, "stroke-width": v.W * 0.35, "stroke-linecap": "round", opacity: v.kind === "worm" ? 0 : 0.9 }, Rt);
      inst.extra.top = el("path", { fill: "none", stroke: col, "stroke-width": v.W * 0.6, "stroke-linecap": "round", "stroke-linejoin": "round" }, Rt);
      const dash = v.pattern === "bands" ? `${v.W * 0.4} ${v.W * 0.9}` : v.pattern === "diamonds" ? `${v.W * 0.5} ${v.W * 0.5}` : v.pattern === "rings" ? `${v.W * 0.12} ${v.W * 0.35}` : null;
      inst.extra.pat = dash ? el("path", { fill: "none", stroke: v.kind === "worm" ? shade(col, -0.2) : dark, "stroke-width": v.W * (v.pattern === "diamonds" ? 0.5 : 0.85), "stroke-dasharray": dash, "stroke-linecap": v.pattern === "diamonds" ? "butt" : "round", opacity: 0.9 }, Rt) : null;
      if (v.rattle) inst.extra.rattle = el("g", null, Rt), [0, 1, 2].forEach((i) => el("ellipse", { cx: -i * 12, cy: 0, rx: 9, ry: 7, fill: "#d8c08a", stroke: "#8a6a3a", "stroke-width": 2 }, inst.extra.rattle));
      if (v.kind === "snail") {
        const sh = mkPart(inst, Rt, "shell", [-v.L * 0.25, -v.W]);
        const cx = -v.L * 0.3, cy = -v.W * 2;
        el("circle", { cx, cy, r: v.W * 1.7, fill: defs.radial([[0, shade(v.shellC, 0.3)], [1, shade(v.shellC, -0.3)]], 0.4, 0.35, 0.8) }, sh);
        const sp = [];
        for (let i = 0; i < 40; i++) { const a = i * 0.42, r = v.W * 1.55 * (1 - i / 44); sp.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
        el("path", { d: smoothPath(sp, false), stroke: shade(v.shellC, -0.5), "stroke-width": 5, fill: "none" }, sh);
      }
      const head = mkPart(inst, Rt, "head", [0, 0]);
      const hw = v.W * (v.headT === "tri" ? 0.85 : 0.65);
      if (v.hood) el("path", { d: `M${f1(-v.W * 1.4)},${f1(-v.W * 0.1)} Q${f1(-v.W * 0.4)},${f1(-v.W * 2.2)} ${f1(v.W * 0.3)},${f1(-v.W * 0.1)} Q${f1(-v.W * 0.4)},${f1(v.W * 2.2)} ${f1(-v.W * 1.4)},${f1(v.W * 0.1)} Z`, fill: shade(col, -0.1), stroke: dark, "stroke-width": 4 }, head);
      const tongue = mkPart(inst, head, "tongue", [hw * 1.4, hw * 0.25]);
      if (v.kind === "snake") el("path", { d: `M${f1(hw * 1.4)},${f1(hw * 0.25)} l${f1(hw * 1.1)},0 l${f1(hw * 0.35)},-${f1(hw * 0.25)} M${f1(hw * 2.5)},${f1(hw * 0.25)} l${f1(hw * 0.35)},${f1(hw * 0.25)}`, stroke: "#d6283a", "stroke-width": 4, fill: "none", "stroke-linecap": "round" }, tongue);
      const jaw = mkPart(inst, head, "jaw", [-hw * 0.3, hw * 0.2]);
      el("path", { d: v.headT === "tri" ? `M${f1(-hw * 0.6)},${f1(hw * 0.1)} L${f1(hw * 1.5)},${f1(hw * 0.2)} L${f1(-hw * 0.4)},${f1(hw * 0.7)} Z` : `M${f1(-hw * 0.6)},${f1(hw * 0.1)} Q${f1(hw * 1.4)},${f1(hw * 0.15)} ${f1(hw * 1.2)},${f1(hw * 0.35)} Q${f1(hw * 0.2)},${f1(hw * 0.8)} ${f1(-hw * 0.5)},${f1(hw * 0.6)} Z`, fill: belly }, jaw);
      const hp = v.headT === "tri" ? `M${f1(-hw * 0.8)},${f1(-hw * 0.6)} L${f1(hw * 0.9)},${f1(-hw * 0.6)} Q${f1(hw * 1.7)},${f1(-hw * 0.2)} ${f1(hw * 1.5)},${f1(hw * 0.2)} L${f1(-hw * 0.8)},${f1(hw * 0.5)} Z`
        : `M${f1(-hw * 0.8)},${f1(-hw * 0.5)} Q${f1(hw * 0.6)},${f1(-hw * 0.95)} ${f1(hw * 1.4)},${f1(-hw * 0.05)} Q${f1(hw * 0.8)},${f1(hw * 0.45)} ${f1(-hw * 0.8)},${f1(hw * 0.45)} Z`;
      el("path", { d: hp, fill: defs.radial([[0, shade(col, 0.25)], [1, shade(col, -0.15)]], 0.4, 0.35, 0.8) }, head);
      if (v.kind === "snail") for (const [nm, dx] of [["stalk_B", -0.05], ["stalk_F", 0.25]]) { const s2 = mkPart(inst, head, nm, [hw * dx, -hw * 0.4]); el("path", { d: `M${f1(hw * dx)},${f1(-hw * 0.4)} l${f1(hw * 0.3)},-${f1(hw * 1.6)}`, stroke: col, "stroke-width": 7, "stroke-linecap": "round" }, s2); el("circle", { cx: hw * dx + hw * 0.3, cy: -hw * 2.05, r: 7, fill: "#1b1b1b" }, s2); mkPart(inst, s2, nm === "stalk_F" ? "eye" : "eye_b", [hw * dx + hw * 0.3, -hw * 2.05]); }
      else if (v.kind === "worm") { el("circle", { cx: hw * 0.55, cy: -hw * 0.15, r: hw * 0.16, fill: "#1b1b1b" }, head); mkPart(inst, head, "eye", [hw * 0.55, -hw * 0.15]); }
      else cartoonEye(inst, head, "eye", hw * 0.5, -hw * 0.3, hw * 0.28, v.headT === "tri" ? "#c8a21a" : "#1b1b1b", false);
      return inst;
    },
    pose(s) {
      const v = withDefaults(SD, s.v);
      const T = s.t, base = s.base || "idle", seed = s.seed || 0, beats = s.beats || [];
      const pts = snakePts(v, T, base, seed, beats);
      const a = Math.atan2(pts[0][1] - pts[1][1], pts[0][0] - pts[1][0]);
      const talk = VSV.beatWeight(beats, "talk", T) + (base === "talk" ? 1 : 0);
      const flick = Math.max(0, Math.sin(T * 5 + seed)) > 0.6 ? 1 : 0;
      return {
        head: { x: pts[0][0], y: pts[0][1], r: a + VSV.beatWeight(beats, "look_left", T) * -0.3 },
        tongue: { sx: flick || talk ? 1 : 0.001 },
        jaw: { r: talk ? Math.max(0, Math.sin(T * 8)) * 0.4 * clamp(talk) : VSV.beatWeight(beats, "surprise", T) * 0.5 },
        eye: { sy: 1 - VSV.blinkAt(T, seed, beats) * (v.kind === "snake" ? 0 : 0.9) },
        stalk_F: { r: Math.sin(T * 1.6 + seed) * 0.12 }, stalk_B: { r: Math.sin(T * 1.6 + seed + 1) * 0.12 },
        shell: { y: Math.sin(T * 2 + seed) * 1.5 },
        root: { y: 0 },
        _pts: pts,
      };
    },
    apply(inst, pose) {
      const pts = pose._pts;
      const sub = (a, b) => pts.slice(Math.floor(a * (SN - 1)), Math.ceil(b * (SN - 1)) + 1);
      for (const p of inst.extra.paths) setAttr(p.base, "d", smoothPath(sub(p.a, p.b), false));
      setAttr(inst.extra.top, "d", smoothPath(pts.slice(0, Math.ceil(0.85 * (SN - 1))).map(([x, y]) => [x, y - inst.v.W * 0.1]), false));
      setAttr(inst.extra.belly, "d", smoothPath(pts.slice(0, Math.ceil(0.8 * (SN - 1))).map(([x, y]) => [x, y + inst.v.W * 0.28]), false));
      if (inst.extra.pat) setAttr(inst.extra.pat, "d", smoothPath(pts.slice(1, Math.ceil(0.9 * (SN - 1))), false));
      if (inst.extra.rattle) { const e = pts[SN - 1]; setAttr(inst.extra.rattle, "transform", `translate(${f1(e[0])},${f1(e[1])})`); }
      // la cabeza sigue al primer punto del cuerpo (posición incluida en la pose)
      const h = pose.head;
      const tr = `translate(${f1(h.x)},${f1(h.y)}) rotate(${f1((h.r * 180) / PI)})`;
      setAttr(inst.parts.head, "transform", tr);
      const rest = Object.assign({}, pose);
      delete rest.head;
      for (const name in inst.parts) {
        if (name === "head") continue;
        const p = rest[name];
        const tr2 = p ? matStr(partMatrix(inst.pivots[name], p)) : "";
        setAttr(inst.parts[name], "transform", tr2);
      }
      rootApply(inst, pose);
    },
    speed(scale, v0) { const v = withDefaults(SD, v0); return (v.kind === "snail" ? 30 : v.kind === "worm" ? 60 : v.L * 0.35) * scale; },
  };
  VSV.RIGS.snake = SNAKE;

  // rigs paramétricos: el director toma tamaño/foco de metaFor(params)
  VSV.CREATURE_RIGS = { quadruped: 1, bird: 1, fish: 1, octopus: 1, insect: 1, snake: 1 };
})();
