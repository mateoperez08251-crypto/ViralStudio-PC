/* ==========================================================================
   VIRAL STUDIO PRO — marionetas vectoriales articuladas (rigs SVG)
   Cada rig = { meta, build(parent, defs, opts) → instancia, pose(s) → pose PURA,
                apply(inst, pose) }.
   · Piezas jerárquicas (<g> anidados) con pivote propio: la transformación de
     una pieza se compone con la de su padre (cabeza dentro de cuello dentro de
     cuerpo…).
   · pose(s) solo depende de s = {t (s absolutos), lt (desde inicio de escena),
     base (acción continua), beats [{at, action, dur}], seed, opts} → mismo t,
     misma pose, sin importar qué frames se calcularon antes.
   Coordenadas locales: origen en el suelo bajo el personaje, y hacia arriba
   negativa, mirando a la derecha (+x). El director refleja con escala -1.
   ========================================================================== */
(function () {
  "use strict";
  const G = typeof window !== "undefined" ? window : globalThis;
  const VSV = G.VSV;
  const { clamp, lerp, fract, hash, noise1, E, bump, env, mix, shade, smoothPath, capsule, partMatrix, matStr } = VSV;
  const PI = Math.PI, TAU = PI * 2;
  const el = (...a) => VSV.el(...a);

  // crea una pieza articulada: <g data-part> con pivote en coordenadas del padre
  function mkPart(inst, parent, name, pivot) {
    const g = VSV.el("g", { "data-part": name }, parent);
    inst.parts[name] = g;
    inst.pivots[name] = pivot;
    return g;
  }
  function newInst(rig, root) { return { rig, root, parts: {}, pivots: {}, extra: {} }; }
  // aplica las transformaciones de las piezas presentes en la pose
  function applyParts(inst, pose) {
    for (const name in inst.parts) {
      const p = pose[name];
      const g = inst.parts[name];
      const tr = p ? matStr(partMatrix(inst.pivots[name], p)) : "";
      if (g.__tr !== tr) { g.setAttribute("transform", tr); g.__tr = tr; }
    }
  }
  const setAttr = (e, k, v) => { if (e && e["__" + k] !== v) { e.setAttribute(k, v); e["__" + k] = v; } };
  VSV.setAttr = setAttr;
  VSV.applyParts = applyParts;

  /* ======================================================================
     PALOMA (vista lateral)  ·  piezas: body, wing, tail, neck, head, eye,
     eyelid, beak, thigh/shin/foot ×2
     ====================================================================== */
  const PIG = {
    meta: { h: 300, w: 440, stride: 58, focus: { head: [128, -262], eye: [146, -270], body: [-10, -140], legs: [5, -30], beak: [180, -254] } },
    pal(v) {
      const base = { body: "#a9adbf", bodyDark: "#737889", wing: "#c7cad8", neckA: "#59c9a0", neckB: "#3f9fb0", neckC: "#8a55c2",
        head: "#6f7488", bar: "#2a2c36", leg: "#e36d7b", eye: "#ff8a1a", beak: "#2d2e36", cere: "#ecebf1" };
      return Object.assign(base, (v && v.colors) || {}, v && v.body ? { body: v.body, wing: shade(v.body, 0.12), bodyDark: shade(v.body, -0.3) } : {});
    },
    build(parent, defs, opts = {}) {
      const P = this.pal(opts.variant);
      const inst = newInst(this, VSV.el("g", { "data-rig": "pigeon" }, parent));
      const R = inst.root;
      const shadow = el("ellipse", { cx: 0, cy: 2, rx: 120, ry: 14, fill: "#000", opacity: 0.22, filter: defs.blur(5) }, R);
      inst.extra.shadow = shadow;
      const scallop = defs.pattern(26, 18, (p) => {
        el("path", { d: "M0,18 Q13,4 26,18", fill: "none", stroke: "#ffffff", "stroke-opacity": 0.28, "stroke-width": 2 }, p);
        el("path", { d: "M-13,9 Q0,-5 13,9 M13,9 Q26,-5 39,9", fill: "none", stroke: "#ffffff", "stroke-opacity": 0.2, "stroke-width": 2 }, p);
      });
      // pierna lejana (más oscura), detrás del cuerpo
      const leg = (side, x, dark) => {
        const th = mkPart(inst, R, "thigh_" + side, [x, -78]);
        const col = dark ? shade(P.leg, -0.22) : P.leg;
        el("path", { d: capsule(42, 18, 11), transform: `translate(${x},-78)`, fill: shade(P.body, -0.25) }, th);
        const sh = mkPart(inst, th, "shin_" + side, [x, -40]);
        el("path", { d: capsule(36, 10, 8), transform: `translate(${x},-40)`, fill: col }, sh);
        const ft = mkPart(inst, sh, "foot_" + side, [x, -5]);
        el("path", { d: `M${x},-5 l38,5 M${x},-5 l26,11 M${x},-5 l-16,5`, stroke: col, "stroke-width": 8, "stroke-linecap": "round", fill: "none" }, ft);
        el("circle", { cx: x, cy: -5, r: 5.5, fill: col }, ft);
      };
      leg("L", -14, true);
      const body = mkPart(inst, R, "body", [0, -120]);
      const tail = mkPart(inst, body, "tail", [-130, -128]);
      el("path", { d: "M-128,-150 L-246,-128 Q-252,-112 -244,-100 L-124,-108 Z", fill: defs.linear([[0, P.bodyDark], [1, shade(P.bodyDark, -0.25)]]) }, tail);
      el("path", { d: "M-232,-126 L-240,-104", stroke: P.bar, "stroke-width": 7, "stroke-linecap": "round", opacity: 0.8 }, tail);
      const bodyD = "M-150,-148 C-70,-218 66,-226 112,-166 C142,-122 118,-66 48,-56 C-24,-46 -104,-68 -152,-108 Q-166,-128 -150,-148 Z";
      el("path", { d: bodyD, fill: defs.linear([[0, shade(P.body, 0.18)], [0.55, P.body], [1, P.bodyDark]]) }, body);
      el("path", { d: bodyD, fill: scallop, opacity: 0.9 }, body);
      el("path", { d: "M-140,-112 C-80,-70 10,-58 60,-62 C10,-48 -90,-58 -146,-104 Z", fill: "#000", opacity: 0.12 }, body);
      const wing = mkPart(inst, body, "wing", [40, -160]);
      const wingD = "M-128,-152 C-70,-196 34,-196 74,-150 C50,-116 -36,-104 -132,-122 Q-140,-138 -128,-152 Z";
      el("path", { d: wingD, fill: defs.linear([[0, shade(P.wing, 0.2)], [1, shade(P.wing, -0.12)]]) }, wing);
      el("path", { d: wingD, fill: scallop }, wing);
      el("path", { d: "M-62,-176 L-92,-126 M-26,-178 L-56,-126", stroke: P.bar, "stroke-width": 13, "stroke-linecap": "round" }, wing);
      el("path", { d: wingD, fill: "none", stroke: shade(P.wing, -0.35), "stroke-width": 2, opacity: 0.5 }, wing);
      const neck = mkPart(inst, body, "neck", [62, -168]);
      el("path", { d: "M18,-182 C34,-244 90,-276 124,-262 C152,-242 146,-178 114,-142 C88,-118 46,-124 16,-150 Z",
        fill: defs.linear([[0, P.neckA], [0.45, P.neckB], [0.8, P.neckC], [1, shade(P.neckC, -0.2)]], 0, 0, 0.3, 1) }, neck);
      el("path", { d: "M40,-200 C60,-232 96,-250 118,-246", stroke: "#ffffff", "stroke-width": 6, opacity: 0.18, fill: "none", "stroke-linecap": "round" }, neck);
      const head = mkPart(inst, neck, "head", [112, -236]);
      el("circle", { cx: 128, cy: -264, r: 47, fill: defs.radial([[0, shade(P.head, 0.28)], [0.7, P.head], [1, shade(P.head, -0.22)]], 0.4, 0.35, 0.65) }, head);
      el("ellipse", { cx: 170, cy: -263, rx: 11, ry: 7, fill: P.cere }, head);
      const beak = mkPart(inst, head, "beak", [168, -256]);
      el("path", { d: "M164,-261 Q190,-258 210,-251 Q190,-246 164,-247 Z", fill: defs.linear([[0, "#5a5b66"], [1, P.beak]], 0, 0, 1, 0) }, beak);
      const eye = mkPart(inst, head, "eye", [146, -270]);
      el("circle", { cx: 146, cy: -270, r: 14, fill: "#3b1c08" }, eye);
      el("circle", { cx: 146, cy: -270, r: 12, fill: defs.radial([[0, "#ffd06a"], [0.55, P.eye], [1, "#b84a00"]]) }, eye);
      inst.extra.pupil = el("circle", { cx: 146, cy: -270, r: 5.5, fill: "#0d0d10" }, eye);
      el("circle", { cx: 150, cy: -274, r: 2.6, fill: "#fff" }, eye);
      const lid = mkPart(inst, head, "eyelid", [146, -285]);
      el("path", { d: "M131,-285 A15,15 0 0 1 161,-285 L161,-270 A15,6 0 0 1 131,-270 Z", fill: shade(P.head, 0.06) }, lid);
      leg("R", 22, false);
      return inst;
    },
    // estado puro
    pose(s) {
      const T = s.t, lt = s.lt, beats = s.beats || [], base = s.base || "idle", seed = s.seed || 0;
      const o = {};
      const walking = base === "walk" || base === "travel" || base === "head_stabilize" && s.moving;
      const f = 2.4; // pasos por segundo
      let bodyX = 0, bodyY = 0, headOff = 0, neckR = 0, bodyR = 0;
      const breath = Math.sin(T * 2.2 + seed) * 0.012;
      if (walking) {
        const ph = T * f / 2; // ciclo completo = 2 pasos
        const a = Math.sin(ph * TAU), b = Math.sin(ph * TAU + PI);
        o.thigh_L = { r: -a * 0.45 };
        o.thigh_R = { r: -b * 0.45 };
        o.shin_L = { r: Math.max(0, a) * 0.5 };
        o.shin_R = { r: Math.max(0, b) * 0.5 };
        o.foot_L = { r: -Math.max(0, -a) * 0.3 };
        o.foot_R = { r: -Math.max(0, -b) * 0.3 };
        bodyY = -Math.abs(Math.cos(ph * TAU)) * 5;
        bodyR = Math.sin(ph * TAU * 2) * 0.015;
        // CABEZA ESTABILIZADA: fase de sostén (la cabeza queda quieta en el mundo
        // mientras el cuerpo avanza) + empujón rápido hacia delante.
        const v = this.meta.stride * f; // unidades/s del cuerpo
        const hold = 0.68;
        const A = (v * hold) / (4 * (f / 1)) * 1.0;
        const psi = fract(T * f + 0.25);
        headOff = psi < hold ? A * (1 - (2 * psi) / hold) : lerp(-A, A, E.out((psi - hold) / (1 - hold)));
        neckR = -headOff * 0.0035;
      } else {
        const sway = noise1(T * 0.6, seed) * 0.5;
        o.thigh_L = { r: 0.04 }; o.thigh_R = { r: -0.04 };
        bodyY = sway;
        // body_bob / head_stabilize sin caminar: el cuerpo oscila y la cabeza queda fija
        const wb = Math.max(VSV.beatWeight(beats, "body_bob", T), VSV.beatWeight(beats, "head_stabilize", T), base === "head_stabilize" || base === "body_bob" ? 1 : 0);
        if (wb > 0) {
          bodyX = Math.sin(T * 5.2) * 22 * wb;
          bodyY += Math.abs(Math.sin(T * 5.2)) * -4 * wb;
          headOff = -bodyX;
        }
      }
      // picoteo
      const wp = VSV.beatWeight(beats, "peck", T) || (base === "peck" ? (Math.sin(T * 4) > 0.6 ? 1 : 0) : 0);
      // salto
      let hopY = 0;
      for (const b of beats) if (b.action === "hop") {
        const k = (T - b.at) / (b.dur || 0.55);
        if (k >= 0 && k <= 1) { hopY = -Math.sin(k * PI) * 70; o.thigh_L = { r: 0.5 * Math.sin(k * PI) }; o.thigh_R = { r: 0.4 * Math.sin(k * PI) };
          o.shin_L = { r: -0.6 * Math.sin(k * PI) }; o.shin_R = { r: -0.6 * Math.sin(k * PI) }; bodyR = -0.12 * Math.sin(k * PI); }
      }
      // mirar (inclina/gira la cabeza)
      const wl = VSV.beatWeight(beats, "look_left", T), wr = VSV.beatWeight(beats, "look_right", T);
      const headR = -wl * 0.35 + wr * 0.18 + wp * 0.9 + noise1(T * 0.9, seed + 2) * 0.05;
      o.root = { x: bodyX * 0, y: hopY };
      o.body = { x: bodyX, y: bodyY, r: bodyR, sx: 1 + breath, sy: 1 - breath };
      o.wing = { r: Math.sin(T * 2.2 + seed) * 0.015 - (hopY ? 0.15 : 0) };
      if (base === "fly") {  // vuelo: aleteo rápido, patas recogidas, cuerpo algo inclinado
        const fl = Math.sin(T * 4.2 * TAU + seed);
        o.wing = { r: 0.9 + fl * 0.85 };  // el ala apunta hacia atrás: giro horario = punta arriba
        o.thigh_L = { r: 1.1 }; o.thigh_R = { r: 1.0 }; o.shin_L = { r: -0.9 }; o.shin_R = { r: -0.9 };
        o.body = { x: 0, y: -fl * 6, r: -0.12, sx: 1, sy: 1 };
        o.root = { x: 0, y: -60 + Math.sin(T * 1.6 + seed) * 12 };
      }
      o.tail = { r: Math.sin(T * 3.1 + seed) * 0.03 };
      o.neck = { x: headOff * 0.55, r: neckR + wp * 0.35 };
      o.head = { x: headOff * 0.45, r: headR, y: wp * 18 };
      const blink = VSV.blinkAt(T, seed, beats);
      o.eyelid = { sy: Math.max(0.001, blink) };
      o._headOff = headOff; o._bodyX = bodyX;
      return o;
    },
    apply(inst, pose) {
      applyParts(inst, pose);
      setAttr(inst.root, "transform", pose.root ? `translate(${pose.root.x || 0},${(pose.root.y || 0).toFixed(2)})` : "");
      if (inst.extra.shadow) setAttr(inst.extra.shadow, "transform", `translate(0,${(-(pose.root && pose.root.y) || 0).toFixed(2)}) scale(${(1 + ((pose.root && pose.root.y) || 0) / 300).toFixed(3)},1)`);
    },
    speed(scale) { return this.meta.stride * 2.4 * scale; },
  };
  VSV.RIGS.pigeon = PIG;

  /* ======================================================================
     PERSONA (frontal 3/4) · torso, cuello, cabeza, pelo, ojos, párpados,
     cejas, boca, brazos (hombro-codo-mano), piernas (cadera-rodilla-zapato)
     ====================================================================== */
  const SKINS = ["#f1c7a1", "#e2a87e", "#c98b5e", "#9c6644", "#f5d2b5"];
  const HAIRS = ["#3b2a20", "#6b4428", "#1f1a17", "#a8743a", "#d9c2a0"];
  const PER = {
    meta: { h: 640, w: 260, focus: { head: [0, -540], face: [6, -535], eye: [10, -545], mouth: [4, -505], body: [0, -360], hands: [70, -300] } },
    pal(v, seed) {
      v = v || {};
      return {
        skin: v.skin || SKINS[seed % SKINS.length], hair: v.hairColor || HAIRS[(seed >> 2) % HAIRS.length],
        shirt: v.shirt || "#3f6fb5", pants: v.pants || "#2f3446", shoe: v.shoe || "#24252b", hairStyle: v.hair || "short",
        scale: v.scale || 1, headScale: v.headScale || (v.scale && v.scale < 0.8 ? 1.22 : 1),
        // accesorios de ROL (médico, policía, rey…): todos opcionales
        hat: v.hat || null, hatC: v.hatC || null, coat: v.coat || null, cape: v.cape || null, glasses: !!v.glasses, beard: v.beard || null,
        tie: v.tie || null, badge: !!v.badge, stetho: !!v.stetho, apron: v.apron || null,
      };
    },
    build(parent, defs, opts = {}) {
      const P = this.pal(opts.variant, opts.seed || 0);
      const inst = newInst(this, VSV.el("g", { "data-rig": "person" }, parent));
      inst.extra.P = P;
      const R = inst.root;
      inst.extra.shadow = el("ellipse", { cx: 0, cy: 4, rx: 110, ry: 16, fill: "#000", opacity: 0.25, filter: defs.blur(6) }, R);
      const skinG = defs.radial([[0, shade(P.skin, 0.12)], [0.8, P.skin], [1, shade(P.skin, -0.12)]], 0.45, 0.4, 0.7);
      const shirtG = defs.linear([[0, shade(P.shirt, 0.15)], [1, shade(P.shirt, -0.2)]], 0, 0, 1, 1);
      const pantsG = defs.linear([[0, shade(P.pants, 0.1)], [1, shade(P.pants, -0.15)]], 0, 0, 1, 0);
      const body = mkPart(inst, R, "body", [0, -265]);
      if (P.cape) el("path", { d: "M-74,-440 Q-120,-220 -96,-60 Q0,-40 96,-60 Q120,-220 74,-440 Z", fill: defs.linear([[0, shade(P.cape, 0.1)], [1, shade(P.cape, -0.3)]]) }, body);
      const leg = (side, x) => {
        const th = mkPart(inst, body, "thigh_" + side, [x, -262]);
        el("path", { d: capsule(138, 50, 40), transform: `translate(${x},-262)`, fill: pantsG }, th);
        const sh = mkPart(inst, th, "shin_" + side, [x, -128]);
        el("path", { d: capsule(118, 40, 32), transform: `translate(${x},-128)`, fill: pantsG }, sh);
        const shoe = mkPart(inst, sh, "shoe_" + side, [x, -12]);
        el("path", { d: `M${x - 20},-18 Q${x - 22},4 ${x},4 L${x + 34},4 Q${x + 44},2 ${x + 38},-10 Q${x + 26},-22 ${x + 4},-22 Z`, fill: P.shoe }, shoe);
        el("path", { d: `M${x - 18},2 L${x + 40},2`, stroke: "#ffffff", "stroke-opacity": 0.35, "stroke-width": 4 }, shoe);
      };
      leg("L", -28);
      leg("R", 28);
      const arm = (side, x, back) => {
        const ua = mkPart(inst, body, "upper_arm_" + side, [x, -432]);
        el("path", { d: capsule(124, 38, 32), transform: `translate(${x},-432)`, fill: back ? shade(P.shirt, -0.12) : shirtG }, ua);
        const fa = mkPart(inst, ua, "fore_arm_" + side, [x, -312]);
        el("path", { d: capsule(112, 28, 24), transform: `translate(${x},-312)`, fill: back ? shade(P.skin, -0.1) : skinG }, fa);
        const hd = mkPart(inst, fa, "hand_" + side, [x, -202]);
        el("circle", { cx: x, cy: -192, r: 19, fill: back ? shade(P.skin, -0.1) : P.skin }, hd);
        el("path", { d: `M${x - 8},-182 q8,8 16,0`, stroke: shade(P.skin, -0.3), "stroke-width": 3, fill: "none", opacity: 0.6 }, hd);
      };
      arm("L", -70, true); // brazo izquierdo (detrás del torso en 3/4)
      const torso = mkPart(inst, body, "torso", [0, -265]);
      el("path", { d: "M-70,-438 Q0,-462 70,-438 L64,-300 Q60,-262 0,-258 Q-60,-262 -64,-300 Z", fill: shirtG }, torso);
      el("path", { d: "M-56,-280 Q0,-270 56,-280 L58,-252 Q0,-240 -58,-252 Z", fill: pantsG }, torso);
      el("path", { d: "M-20,-450 L0,-418 L20,-450", fill: "none", stroke: shade(P.shirt, -0.35), "stroke-width": 5, "stroke-linejoin": "round" }, torso);
      el("path", { d: "M-70,-438 Q-80,-360 -64,-300", fill: "none", stroke: "#ffffff", "stroke-opacity": 0.15, "stroke-width": 10 }, torso);
      if (P.tie) el("path", { d: "M-8,-446 L8,-446 L12,-420 L4,-330 L0,-318 L-4,-330 L-12,-420 Z", fill: P.tie }, torso);
      if (P.coat) {
        // bata/abrigo abierto: dos paneles que bajan hasta media pierna, solapas y bolsillo
        const cc = defs.linear([[0, shade(P.coat, 0.08)], [1, shade(P.coat, -0.14)]], 0, 0, 1, 1);
        el("path", { d: "M-74,-440 Q-40,-452 -14,-450 L-26,-330 L-30,-170 L-80,-176 Q-86,-300 -74,-440 Z", fill: cc, stroke: shade(P.coat, -0.25), "stroke-width": 2 }, torso);
        el("path", { d: "M74,-440 Q40,-452 14,-450 L26,-330 L30,-170 L80,-176 Q86,-300 74,-440 Z", fill: cc, stroke: shade(P.coat, -0.25), "stroke-width": 2 }, torso);
        el("path", { d: "M-14,-450 L-34,-392 L-22,-388 Z M14,-450 L34,-392 L22,-388 Z", fill: shade(P.coat, -0.12) }, torso);
        el("rect", { x: 40, y: -400, width: 26, height: 22, rx: 3, fill: "none", stroke: shade(P.coat, -0.3), "stroke-width": 2 }, torso);
      }
      if (P.apron) el("path", { d: "M-46,-430 L46,-430 L52,-210 L-52,-210 Z", fill: P.apron, stroke: shade(P.apron, -0.2), "stroke-width": 2 }, torso);
      if (P.badge) el("path", { d: "M-40,-410 l5,10 l11,1 l-8,7 l3,11 l-11,-6 l-11,6 l3,-11 l-8,-7 l11,-1 Z", fill: "#f2c23a", stroke: "#a8821a", "stroke-width": 1.5 }, torso);
      if (P.stetho) { el("path", { d: "M-24,-448 Q-34,-390 -6,-372 Q22,-390 24,-448", fill: "none", stroke: "#3a3e48", "stroke-width": 5 }, torso); el("circle", { cx: -6, cy: -366, r: 9, fill: "#c8ccd4", stroke: "#3a3e48", "stroke-width": 3 }, torso); }
      const neck = mkPart(inst, torso, "neck", [0, -452]);
      el("rect", { x: -18, y: -478, width: 36, height: 34, rx: 10, fill: shade(P.skin, -0.12) }, neck);
      const head = mkPart(inst, neck, "head", [0, -470]);
      const hs = P.headScale;
      const hg = VSV.el("g", { transform: hs !== 1 ? `translate(0,-470) scale(${hs}) translate(0,470)` : null }, head);
      const hair = mkPart(inst, hg, "hair", [0, -540]);
      if (P.hairStyle === "bun") el("circle", { cx: 0, cy: -632, r: 30, fill: P.hair }, hair);
      // pelo largo: casquete + dos mechones que caen DETRÁS de los hombros (nunca bajo la barbilla)
      if (P.hairStyle === "long") el("path", { d: "M-74,-560 Q-60,-620 0,-622 Q60,-620 74,-560 Q92,-470 84,-392 Q70,-386 54,-396 Q58,-440 56,-500 L-56,-500 Q-58,-440 -54,-396 Q-70,-386 -84,-392 Q-92,-470 -74,-560 Z", fill: P.hair }, hair);
      el("ellipse", { cx: -66, cy: -530, rx: 13, ry: 19, fill: shade(P.skin, -0.08) }, hg);
      el("ellipse", { cx: 66, cy: -530, rx: 13, ry: 19, fill: shade(P.skin, -0.08) }, hg);
      el("path", { d: "M-66,-540 Q-70,-470 -38,-478 Q0,-462 38,-478 Q70,-470 66,-540 Q66,-608 0,-610 Q-66,-608 -66,-540 Z", fill: skinG }, hg);
      el("circle", { cx: -40, cy: -508, r: 13, fill: "#ff7b7b", opacity: 0.22 }, hg);
      el("circle", { cx: 44, cy: -508, r: 13, fill: "#ff7b7b", opacity: 0.22 }, hg);
      const front = mkPart(inst, hg, "hair_front", [0, -560]);
      if (P.hairStyle === "short" || P.hairStyle === "long" || P.hairStyle === "bun")
        el("path", { d: "M-70,-540 Q-76,-616 0,-622 Q74,-618 70,-542 Q58,-582 20,-584 Q-8,-566 -40,-578 Q-62,-574 -70,-540 Z", fill: P.hair }, front);
      else el("ellipse", { cx: -18, cy: -598, rx: 26, ry: 8, fill: "#ffffff", opacity: 0.2 }, front);
      const eye = (side, x) => {
        const g = mkPart(inst, hg, "eye_" + side, [x, -540]);
        el("ellipse", { cx: x, cy: -540, rx: 13, ry: 15, fill: "#ffffff" }, g);
        const iris = el("g", null, g);
        el("circle", { cx: x, cy: -539, r: 8.5, fill: "#3a2618" }, iris);
        el("circle", { cx: x + 3, cy: -543, r: 3, fill: "#ffffff" }, iris);
        inst.extra["iris_" + side] = iris;
        const lid = mkPart(inst, g, "lid_" + side, [x, -556]);
        el("path", { d: `M${x - 15},-556 L${x + 15},-556 L${x + 15},-538 Q${x},-532 ${x - 15},-538 Z`, fill: shade(P.skin, -0.05) }, lid);
        const brow = mkPart(inst, hg, "brow_" + side, [x, -568]);
        el("path", { d: `M${x - 15},-566 Q${x},-576 ${x + 15},-568`, stroke: shade(P.hair, -0.1), "stroke-width": 6, "stroke-linecap": "round", fill: "none" }, brow);
      };
      eye("L", -24);
      eye("R", 26);
      inst.extra.nose = el("path", { d: "M4,-528 Q10,-516 2,-512", stroke: shade(P.skin, -0.3), "stroke-width": 4, fill: "none", "stroke-linecap": "round" }, hg);
      if (P.beard) el("path", { d: "M-62,-530 Q-66,-470 -30,-452 Q2,-436 34,-452 Q68,-470 64,-530 Q54,-494 36,-492 Q4,-512 -30,-492 Q-52,-494 -62,-530 Z", fill: P.beard }, hg);
      const mouth = mkPart(inst, hg, "mouth", [3, -500]);
      inst.extra.mouth = el("path", { d: "", fill: "#7a2a2a", stroke: "#5a1d1d", "stroke-width": 3, "stroke-linejoin": "round" }, mouth);
      if (P.beard) el("path", { d: "M-22,-512 Q3,-524 28,-512 Q3,-506 -22,-512 Z", fill: shade(P.beard, -0.1) }, hg);
      if (P.glasses) {
        for (const x of [-24, 26]) el("circle", { cx: x, cy: -540, r: 20, fill: "#dff2ff", "fill-opacity": 0.18, stroke: "#2a2a30", "stroke-width": 5 }, hg);
        el("path", { d: "M-4,-542 L6,-542 M-44,-544 L-66,-548 M46,-544 L66,-548", stroke: "#2a2a30", "stroke-width": 5 }, hg);
      }
      const hat = P.hat, hc = P.hatC;
      if (hat === "crown" || hat === "tiara") {
        const gold = defs.linear([[0, "#ffe27a"], [1, "#d8a21a"]]);
        if (hat === "crown") el("path", { d: "M-58,-596 L-62,-664 L-32,-630 L0,-676 L32,-630 L62,-664 L58,-596 Z", fill: gold, stroke: "#a8761a", "stroke-width": 3 }, hg);
        else el("path", { d: "M-44,-606 Q0,-630 44,-606 L30,-640 L14,-618 L0,-652 L-14,-618 L-30,-640 Z", fill: gold, stroke: "#a8761a", "stroke-width": 2 }, hg);
        for (const [x, y, c] of [[0, -640, "#e2322a"], [-34, -618, "#2a7ae2"], [34, -618, "#2ab07a"]]) el("circle", { cx: x, cy: hat === "crown" ? y : y + 8, r: 6, fill: c }, hg);
      } else if (hat === "police" || hat === "cap" || hat === "pilot") {
        const c = hc || (hat === "police" ? "#1d2440" : hat === "pilot" ? "#1d2440" : "#c8322a");
        el("path", { d: "M-70,-584 Q-70,-646 0,-650 Q70,-646 70,-584 Z", fill: c }, hg);
        el("path", { d: "M-74,-586 L74,-586 L96,-574 Q20,-566 -74,-576 Z", fill: shade(c, -0.35) }, hg);
        if (hat !== "cap") el("path", { d: "M-8,-630 l8,-12 l8,12 l-8,10 Z", fill: "#f2c23a" }, hg);
      } else if (hat === "fire" || hat === "hardhat" || hat === "helmet") {
        const c = hc || (hat === "fire" ? "#c8221e" : hat === "hardhat" ? "#f2b81a" : "#5a6a3a");
        el("path", { d: "M-76,-580 Q-80,-664 0,-668 Q80,-664 76,-580 Z", fill: defs.linear([[0, shade(c, 0.2)], [1, shade(c, -0.2)]]) }, hg);
        el("path", { d: hat === "fire" ? "M-92,-584 L92,-584 L110,-566 L-60,-570 Z" : "M-86,-584 L86,-584 L90,-574 L-90,-574 Z", fill: shade(c, -0.3) }, hg);
        if (hat === "fire") el("path", { d: "M-14,-660 L14,-660 L10,-606 L-10,-606 Z", fill: "#f2c23a" }, hg);
        if (hat === "hardhat") el("path", { d: "M-6,-664 L6,-664 L6,-588 L-6,-588 Z", fill: shade(c, 0.2) }, hg);
      } else if (hat === "chef") {
        el("rect", { x: -54, y: -632, width: 108, height: 46, fill: "#ffffff", stroke: "#d8d8d8", "stroke-width": 2 }, hg);
        for (const [x, r] of [[-36, 34], [0, 42], [36, 34]]) el("circle", { cx: x, cy: -652, r, fill: "#ffffff" }, hg);
      } else if (hat === "straw" || hat === "cowboy" || hat === "fedora") {
        const c = hc || (hat === "straw" ? "#e8c46a" : hat === "cowboy" ? "#8a5a2e" : "#3a3436");
        el("ellipse", { cx: 0, cy: -594, rx: hat === "fedora" ? 98 : 124, ry: hat === "fedora" ? 16 : 22, fill: shade(c, -0.12) }, hg);
        el("path", { d: hat === "cowboy" ? "M-60,-596 Q-66,-668 -20,-656 Q0,-640 20,-656 Q66,-668 60,-596 Z" : "M-58,-596 Q-60,-660 0,-664 Q60,-660 58,-596 Z", fill: c }, hg);
        el("path", { d: "M-58,-604 L58,-604", stroke: hat === "straw" ? "#c8322a" : shade(c, -0.4), "stroke-width": 10 }, hg);
      } else if (hat === "graduation") {
        el("path", { d: "M-100,-620 L0,-660 L100,-620 L0,-584 Z", fill: "#1d1d22" }, hg);
        el("path", { d: "M-50,-604 L-50,-582 Q0,-566 50,-582 L50,-604", fill: "#1d1d22" }, hg);
        el("path", { d: "M60,-624 L72,-570", stroke: "#f2c23a", "stroke-width": 4 }, hg);
      } else if (hat === "witch") {
        const c = hc || "#3a2a6a";
        el("ellipse", { cx: 0, cy: -592, rx: 120, ry: 20, fill: shade(c, -0.15) }, hg);
        el("path", { d: "M-56,-598 L20,-770 L28,-740 L56,-598 Z", fill: c }, hg);
      } else if (hat === "pirate") {
        el("path", { d: "M-96,-590 Q0,-700 96,-590 Q0,-616 -96,-590 Z", fill: "#1d1d22" }, hg);
        el("circle", { cx: 0, cy: -628, r: 12, fill: "#f4f4f4" }, hg);
      } else if (hat === "astronaut") {
        el("circle", { cx: 2, cy: -536, r: 104, fill: "#dff2ff", "fill-opacity": 0.22, stroke: "#e8eaee", "stroke-width": 14 }, hg);
        el("path", { d: "M-60,-610 Q-20,-628 20,-618", stroke: "#ffffff", "stroke-width": 8, opacity: 0.6, fill: "none" }, hg);
      }
      arm("R", 70, false);
      return inst;
    },
    pose(s) {
      const T = s.t, beats = s.beats || [], base = s.base || "idle", seed = s.seed || 0;
      const o = {};
      const A = { sL: 0.12, sR: -0.12, eL: 0.1, eR: -0.1, hL: 0, hR: 0, kL: 0, kR: 0, lean: 0, y: 0, headR: 0, look: 0, brow: 0, mouth: 0, mshape: "smile" };
      const breath = Math.sin(T * 2.0 + seed) * 0.5 + 0.5;
      if (base === "walk" || base === "travel") {
        const ph = T * 1.9;
        const a = Math.sin(ph * TAU);
        A.hL = a * 0.42; A.hR = -a * 0.42;
        A.kL = Math.max(0, -Math.cos(ph * TAU)) * 0.55; A.kR = Math.max(0, Math.cos(ph * TAU)) * 0.55;
        A.sL = 0.08 - a * 0.38; A.sR = -0.08 + a * 0.38; A.eL = 0.25; A.eR = -0.25;
        A.y = -Math.abs(Math.cos(ph * TAU)) * 10;
        A.lean = 0.03;
      } else if (base === "sit") {
        A.hL = 1.45; A.hR = 1.4; A.kL = -1.45; A.kR = -1.4; A.y = 128; A.sL = 0.35; A.sR = -0.35; A.eL = -0.6; A.eR = 0.6;
      } else {
        A.sL += breath * 0.03; A.sR -= breath * 0.03;
        A.y = breath * -2;
      }
      const blendTo = (w, P2) => { for (const k in P2) if (typeof P2[k] === "number") A[k] = lerp(A[k], P2[k], w); else if (w > 0.5) A[k] = P2[k]; };
      let w;
      if ((w = VSV.beatWeight(beats, "point", T)) > 0) blendTo(w, { sR: -1.55, eR: -0.08, lean: 0.04, mshape: "talk" });
      if ((w = VSV.beatWeight(beats, "wave", T)) > 0) blendTo(w, { sR: -2.7, eR: -0.5 + Math.sin(T * 11) * 0.45, mshape: "open_smile", mouth: 0.6 });
      if ((w = VSV.beatWeight(beats, "think", T)) > 0) blendTo(w, { sR: -0.55, eR: -2.35, headR: -0.08, brow: 0.4, mshape: "flat", look: -0.6 });
      if ((w = VSV.beatWeight(beats, "surprise", T)) > 0) blendTo(w, { sL: 1.2, sR: -1.2, eL: 0.9, eR: -0.9, brow: 1, mshape: "o", mouth: 1, y: A.y - 18 * bump(T, beats.find((b) => b.action === "surprise" && b.at <= T + 0.01 && T - b.at < 1.6)?.at ?? -9, 0.35), lean: -0.05 });
      if ((w = VSV.beatWeight(beats, "look_left", T)) > 0) blendTo(w, { look: -1, headR: -0.08 });
      if ((w = VSV.beatWeight(beats, "look_right", T)) > 0) blendTo(w, { look: 1, headR: 0.08 });
      const talkW = Math.max(VSV.beatWeight(beats, "talk", T), base === "talk" ? 1 : 0);
      if (talkW > 0) {
        A.mshape = A.mshape === "smile" ? "talk" : A.mshape;
        A.mouth = Math.max(A.mouth, talkW * clamp(0.5 + 0.5 * noise1(T * 9, seed), 0, 1));
        A.eL = lerp(A.eL, 0.5 + noise1(T * 1.3, seed + 5) * 0.3, talkW * 0.6);
      }
      const f = 1;
      o.root = { y: A.y };
      o.body = { r: A.lean * f };
      o.thigh_L = { r: -A.hL }; o.thigh_R = { r: -A.hR };
      o.shin_L = { r: A.kL }; o.shin_R = { r: A.kR };
      // brazo: ángulo positivo = hacia fuera para el izquierdo; el derecho usa el signo opuesto
      o.upper_arm_L = { r: A.sL }; o.upper_arm_R = { r: A.sR };
      o.fore_arm_L = { r: A.eL }; o.fore_arm_R = { r: A.eR };
      o.torso = { sy: 1 + breath * 0.008 };
      o.head = { r: A.headR + noise1(T * 0.7, seed + 9) * 0.03 };
      o.hair_front = { y: 0 };
      const blink = VSV.blinkAt(T, seed, beats);
      o.lid_L = { sy: Math.max(0.001, blink) }; o.lid_R = { sy: Math.max(0.001, blink) };
      o.brow_L = { y: -A.brow * 9 }; o.brow_R = { y: -A.brow * 9 };
      o._look = A.look; o._mouth = A.mouth; o._mshape = A.mshape;
      return o;
    },
    apply(inst, pose) {
      applyParts(inst, pose);
      setAttr(inst.root, "transform", `translate(0,${(pose.root.y || 0).toFixed(2)})`);
      if (inst.extra.shadow) setAttr(inst.extra.shadow, "transform", `translate(0,${(-(pose.root.y || 0)).toFixed(2)})`);
      const lx = (pose._look || 0) * 4.5;
      setAttr(inst.extra.iris_L, "transform", `translate(${lx.toFixed(2)},0)`);
      setAttr(inst.extra.iris_R, "transform", `translate(${lx.toFixed(2)},0)`);
      setAttr(inst.extra.nose, "transform", `translate(${(lx * 0.8).toFixed(2)},0)`);
      const m = pose._mouth || 0, sh = pose._mshape;
      let d;
      if (sh === "o") d = `M3,${-500 - 12 * m} C${16 + 4 * m},${-500 - 12 * m} ${16 + 4 * m},${-492 + 6 * m} 3,${-492 + 6 * m} C${-10 - 4 * m},${-492 + 6 * m} ${-10 - 4 * m},${-500 - 12 * m} 3,${-500 - 12 * m} Z`;
      else if (sh === "flat") d = "M-12,-500 Q3,-498 18,-500 Q3,-496 -12,-500 Z";
      else if (sh === "talk" || sh === "open_smile") d = `M-16,-503 Q3,${-496 + 1} 22,-503 Q${3},${-496 + 16 * m} -16,-503 Z`;
      else d = "M-16,-504 Q3,-490 22,-504 Q3,-496 -16,-504 Z";
      setAttr(inst.extra.mouth, "d", d);
    },
    speed(scale) { return 2 * 1.9 * 95 * scale; },
  };
  VSV.RIGS.person = PER;

  /* ======================================================================
     DURMIENTE (perfil tumbado) · almohada, cabeza, pelo, oreja, ojo/párpado,
     ceja, nariz, boca/mandíbula, pecho y manta (respiración)
     ====================================================================== */
  const SLE = {
    meta: { h: 420, w: 1100, focus: { head: [-250, -250], face: [-170, -320], mouth: [-114, -322], eye: [-208, -322], body: [150, -200] } },
    build(parent, defs, opts = {}) {
      const v = opts.variant || {};
      const skin = v.skin || "#e8b48c", hair = v.hairColor || "#5a3a24", blanketCol = v.blanket || "#2f63c9";
      const inst = newInst(this, VSV.el("g", { "data-rig": "sleeper" }, parent));
      const R = inst.root;
      const pillow = mkPart(inst, R, "pillow", [-260, -120]);
      el("path", { d: "M-520,-40 Q-560,-150 -470,-190 Q-300,-232 -110,-180 Q-40,-150 -60,-60 Q-80,-10 -300,-6 Q-480,-4 -520,-40 Z",
        fill: defs.linear([[0, "#d9dbea"], [1, "#9ea3c4"]]) }, pillow);
      el("path", { d: "M-470,-120 Q-300,-150 -120,-120", stroke: "#ffffff", "stroke-opacity": 0.35, "stroke-width": 6, fill: "none" }, pillow);
      const chest = mkPart(inst, R, "chest", [120, -60]);
      el("path", { d: "M-120,-150 Q-40,-250 120,-262 Q420,-270 640,-230 L640,-40 L-120,-40 Z", fill: shade(skin, -0.15) }, chest);
      const head = mkPart(inst, R, "head", [-170, -180]);
      const skinG = defs.linear([[0, shade(skin, 0.15)], [1, shade(skin, -0.18)]], 0, 0, 0.2, 1);
      // perfil mirando hacia arriba: nuca a la izquierda, frente/nariz/labios/barbilla arriba, cuello a la derecha
      const prof = "M-420,-170 Q-432,-320 -320,-362 C-290,-376 -246,-372 -222,-356 C-210,-349 -201,-350 -193,-357 " +
        "C-181,-370 -166,-390 -151,-386 C-141,-382 -141,-366 -149,-357 C-145,-352 -138,-350 -133,-346 C-127,-343 -120,-339 -118,-331 " +
        "L-110,-316 C-106,-311 -102,-308 -98,-304 C-90,-296 -85,-288 -83,-277 C-79,-262 -69,-250 -50,-241 C-41,-232 -40,-214 -40,-200 " +
        "L-40,-120 Q-200,-90 -360,-120 Q-412,-130 -420,-170 Z";
      el("path", { d: prof, fill: skinG }, head);
      el("path", { d: "M-238,-300 Q-200,-286 -160,-300", stroke: shade(skin, -0.12), "stroke-width": 10, fill: "none", opacity: 0.35, "stroke-linecap": "round" }, head);
      el("circle", { cx: -168, cy: -318, r: 20, fill: "#ff8a8a", opacity: 0.18 }, head);
      const hairP = mkPart(inst, head, "hair", [-360, -250]);
      el("path", { d: "M-420,-170 Q-432,-320 -320,-362 Q-280,-372 -262,-356 Q-300,-300 -296,-220 Q-300,-160 -330,-118 Q-400,-118 -420,-170 Z", fill: defs.linear([[0, shade(hair, 0.15)], [1, shade(hair, -0.2)]]) }, hairP);
      for (let i = 0; i < 6; i++) el("path", { d: `M${-410 + i * 8},${-300 + i * 26} Q${-360 + i * 4},${-310 + i * 26} ${-310},${-290 + i * 26}`, stroke: shade(hair, 0.25), "stroke-width": 3, fill: "none", opacity: 0.5 }, hairP);
      const ear = mkPart(inst, head, "ear", [-286, -224]);
      el("ellipse", { cx: -286, cy: -224, rx: 30, ry: 38, fill: shade(skin, -0.05) }, ear);
      el("path", { d: "M-296,-246 Q-268,-240 -274,-214 Q-282,-200 -294,-206", stroke: shade(skin, -0.35), "stroke-width": 5, fill: "none" }, ear);
      el("path", { d: "M-248,-342 Q-232,-354 -212,-348", stroke: shade(hair, -0.1), "stroke-width": 7, fill: "none", "stroke-linecap": "round" }, head);
      const eye = mkPart(inst, head, "eye", [-210, -322]);
      inst.extra.eyeOpen = el("g", { opacity: 0 }, eye);
      el("ellipse", { cx: -210, cy: -324, rx: 16, ry: 10, fill: "#fff" }, inst.extra.eyeOpen);
      el("circle", { cx: -204, cy: -326, r: 7, fill: "#3a2618" }, inst.extra.eyeOpen);
      inst.extra.lidLine = el("path", { d: "M-228,-322 Q-210,-312 -192,-322", stroke: shade(skin, -0.5), "stroke-width": 4, fill: "none", "stroke-linecap": "round" }, eye);
      el("path", { d: "M-222,-317 l-4,8 M-212,-314 l-2,9 M-202,-315 l1,9", stroke: shade(skin, -0.55), "stroke-width": 2.5 }, eye);
      const mouth = mkPart(inst, head, "mouth", [-114, -322]);
      const mg = VSV.el("g", { transform: "rotate(-48,-114,-322)" }, mouth);
      inst.extra.mouthIn = el("ellipse", { cx: -114, cy: -322, rx: 13, ry: 6, fill: "#5e1a26" }, mg);
      inst.extra.tongue = el("ellipse", { cx: -114, cy: -317, rx: 8, ry: 3, fill: "#e0717d" }, mg);
      el("path", { d: "M-130,-326 Q-114,-334 -98,-326", stroke: "#c4646a", "stroke-width": 5, fill: "none", "stroke-linecap": "round" }, mg);
      inst.extra.lowerLip = el("path", { d: "M-128,-316 Q-114,-308 -100,-316", stroke: "#c4646a", "stroke-width": 6, fill: "none", "stroke-linecap": "round" }, mg);
      const blanket = mkPart(inst, R, "blanket", [200, -40]);
      const bl = "M-70,-170 Q-10,-262 160,-276 Q420,-292 680,-240 L700,30 L-110,30 Q-130,-80 -70,-170 Z";
      el("path", { d: bl, fill: defs.linear([[0, shade(blanketCol, 0.2)], [1, shade(blanketCol, -0.25)]]) }, blanket);
      el("path", { d: bl, fill: defs.pattern(70, 70, (p) => el("path", { d: "M35,20 L44,35 L35,50 L26,35 Z", fill: "#ffffff", opacity: 0.16 }, p)) }, blanket);
      el("path", { d: "M-70,-170 Q-10,-262 160,-276 Q420,-292 680,-240", stroke: "#ffffff", "stroke-opacity": 0.25, "stroke-width": 8, fill: "none" }, blanket);
      return inst;
    },
    pose(s) {
      const T = s.t, beats = s.beats || [], base = s.base || "breathe", seed = s.seed || 0;
      const per = 3.8, br = 0.5 - 0.5 * Math.cos((T / per) * TAU + seed);
      const snoreW = Math.max(VSV.beatWeight(beats, "snore", T), base === "snore" ? 1 : 0);
      const openW = VSV.beatWeight(beats, "mouth_open", T);
      const wake = VSV.beatWeight(beats, "wake", T);
      const m = clamp(0.35 + br * 0.45 + snoreW * 0.5 * br + openW * 0.6, 0, 1.4);
      return {
        chest: { sy: 1 + br * 0.04 }, blanket: { sy: 1 + br * 0.035 }, head: { r: -br * 0.012 - wake * 0.05 }, pillow: {},
        _mouth: m, _wake: wake,
      };
    },
    apply(inst, pose) {
      applyParts(inst, pose);
      const m = pose._mouth;
      setAttr(inst.extra.mouthIn, "ry", (3 + 9 * m).toFixed(2));
      setAttr(inst.extra.mouthIn, "rx", (11 + 3 * m).toFixed(2));
      setAttr(inst.extra.lowerLip, "transform", `translate(0,${(7 * m).toFixed(2)})`);
      setAttr(inst.extra.tongue, "opacity", m > 0.5 ? 1 : 0);
      setAttr(inst.extra.eyeOpen, "opacity", pose._wake > 0.5 ? 1 : 0);
      setAttr(inst.extra.lidLine, "opacity", pose._wake > 0.5 ? 0 : 1);
    },
    speed() { return 0; },
  };
  VSV.RIGS.sleeper = SLE;

  /* ======================================================================
     ARAÑA (vista cenital) · abdomen, cefalotórax, ojos, quelíceros,
     8 patas de 3 segmentos, hilo
     ====================================================================== */
  const SPI = {
    meta: { h: 420, w: 520, focus: { body: [0, 0], head: [0, -70] } },
    // [n, ángulo de salida (lado derecho; 0 = derecha, negativo = hacia delante), y de anclaje, curva]
    LEGS: [["1", -0.75, -70, -0.55], ["2", -0.22, -55, -0.35], ["3", 0.3, -40, 0.35], ["4", 0.8, -28, 0.6]],
    build(parent, defs, opts = {}) {
      const v = opts.variant || {};
      const col = v.body || "#7a4b28";
      const inst = newInst(this, VSV.el("g", { "data-rig": "spider" }, parent));
      const R = inst.root;
      inst.extra.thread = el("line", { x1: 0, y1: -60, x2: 0, y2: -4000, stroke: "#e8e8f0", "stroke-width": 2.5, opacity: 0 }, R);
      inst.extra.shadow = el("ellipse", { cx: 18, cy: 30, rx: 150, ry: 150, fill: "#000", opacity: 0.18, filter: defs.blur(14) }, R);
      const segG = defs.linear([[0, shade(col, 0.25)], [1, shade(col, -0.35)]], 0, 0, 1, 1);
      const legs = mkPart(inst, R, "legs", [0, -40]);
      for (const side of ["L", "R"]) {
        const sg = side === "L" ? -1 : 1;
        for (const [n, ang, y, bend] of this.LEGS) {
          const base = [sg * 30, y];
          const lg = mkPart(inst, legs, `leg_${n}${side}`, base);
          const L1 = 125, L2 = 140, L3 = 85;
          const dir = (a) => [Math.cos(a) * sg, Math.sin(a)];
          const d1 = dir(ang), d2 = dir(ang + bend), d3 = dir(ang + bend * 1.7);
          const k1 = [base[0] + d1[0] * L1, base[1] + d1[1] * L1];
          const k2 = [k1[0] + d2[0] * L2, k1[1] + d2[1] * L2];
          const k3 = [k2[0] + d3[0] * L3, k2[1] + d3[1] * L3];
          const seg = (p, q, w0, w1, c) => {
            const ang2 = Math.atan2(q[1] - p[1], q[0] - p[0]) - PI / 2, L = Math.hypot(q[0] - p[0], q[1] - p[1]);
            el("path", { d: capsule(L, w0, w1), transform: `translate(${p[0].toFixed(1)},${p[1].toFixed(1)}) rotate(${((ang2 * 180) / PI).toFixed(2)})`, fill: c }, lg);
          };
          const s2 = mkPart(inst, lg, `leg_${n}${side}_k`, k1);
          seg(base, k1, 18, 14, segG);
          const tib = VSV.el("g", null, s2);
          const seg2 = (p, q, w0, w1, c) => {
            const ang2 = Math.atan2(q[1] - p[1], q[0] - p[0]) - PI / 2, L = Math.hypot(q[0] - p[0], q[1] - p[1]);
            el("path", { d: capsule(L, w0, w1), transform: `translate(${p[0].toFixed(1)},${p[1].toFixed(1)}) rotate(${((ang2 * 180) / PI).toFixed(2)})`, fill: c }, tib);
          };
          seg2(k1, k2, 14, 10, shade(col, -0.1));
          seg2(k2, k3, 9, 4, shade(col, -0.3));
          el("circle", { cx: k1[0], cy: k1[1], r: 8, fill: shade(col, -0.45) }, tib);
          el("circle", { cx: k2[0], cy: k2[1], r: 6, fill: shade(col, -0.45) }, tib);
          for (let h = 0; h < 4; h++) {
            const q = [lerp(k1[0], k2[0], 0.2 + h * 0.2), lerp(k1[1], k2[1], 0.2 + h * 0.2)];
            el("path", { d: `M${q[0].toFixed(1)},${q[1].toFixed(1)} l${(sg * 9).toFixed(1)},-10`, stroke: shade(col, -0.5), "stroke-width": 2 }, tib);
          }
        }
      }
      const body = mkPart(inst, R, "abdomen", [0, 40]);
      el("ellipse", { cx: 0, cy: 70, rx: 78, ry: 104, fill: defs.radial([[0, shade(col, 0.35)], [0.7, col], [1, shade(col, -0.45)]], 0.4, 0.35, 0.7) }, body);
      for (let i = 0; i < 4; i++) el("path", { d: `M-${40 - i * 6},${30 + i * 30} L0,${50 + i * 30} L${40 - i * 6},${30 + i * 30}`, stroke: shade(col, 0.55), "stroke-width": 7, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.75 }, body);
      el("ellipse", { cx: -22, cy: 20, rx: 18, ry: 34, fill: "#ffffff", opacity: 0.15 }, body);
      const ceph = mkPart(inst, R, "cephalothorax", [0, -40]);
      el("ellipse", { cx: 0, cy: -48, rx: 56, ry: 62, fill: defs.radial([[0, shade(col, 0.3)], [1, shade(col, -0.4)]], 0.4, 0.3, 0.7) }, ceph);
      el("path", { d: "M0,-96 L0,-10", stroke: shade(col, -0.5), "stroke-width": 4, opacity: 0.6 }, ceph);
      const eyes = mkPart(inst, ceph, "eyes", [0, -100]);
      [[-14, -100, 8], [14, -100, 8], [-28, -92, 5], [28, -92, 5], [-6, -88, 4], [6, -88, 4]].forEach(([x, y, r]) => {
        el("circle", { cx: x, cy: y, r, fill: "#120c0a" }, eyes);
        el("circle", { cx: x - r * 0.3, cy: y - r * 0.3, r: r * 0.35, fill: "#fff", opacity: 0.8 }, eyes);
      });
      for (const sg of [-1, 1]) {
        const fg = mkPart(inst, ceph, sg < 0 ? "fang_L" : "fang_R", [sg * 12, -104]);
        el("path", { d: `M${sg * 4},-104 Q${sg * 22},-118 ${sg * 14},-134 Q${sg * 8},-122 ${sg * 4},-104 Z`, fill: shade(col, -0.55) }, fg);
      }
      return inst;
    },
    pose(s) {
      const T = s.t, base = s.base || "idle", seed = s.seed || 0, beats = s.beats || [];
      const o = {};
      const walking = base === "walk" || base === "crawl" || base === "travel";
      const f = walking ? 3.2 : 0.4;
      for (const side of ["L", "R"]) {
        for (const [n] of this.LEGS) {
          const k = +n;
          const grp = (k + (side === "L" ? 0 : 1)) % 2;
          const ph = T * f * TAU + grp * PI + k * 0.2;
          const amp = walking ? 0.22 : 0.03 + 0.02 * noise1(T * 2 + k, seed);
          const sg = side === "L" ? 1 : -1;
          o[`leg_${n}${side}`] = { r: Math.sin(ph) * amp * sg };
          o[`leg_${n}${side}_k`] = { r: Math.max(0, Math.cos(ph)) * (walking ? 0.12 : 0.02) * sg };
        }
      }
      o.abdomen = { r: Math.sin(T * 2.4 + seed) * 0.02, sy: 1 + Math.sin(T * 3 + seed) * 0.01 };
      o.fang_L = { r: Math.sin(T * 5) * 0.08 }; o.fang_R = { r: -Math.sin(T * 5) * 0.08 };
      let y = 0, thread = 0;
      const desc = beats.find((b) => b.action === "descend");
      if (base === "descend" || desc) {
        const t0 = desc ? desc.at : 0, k = clamp((T - t0) / 2.2);
        y = -lerp(900, 0, E.out(k)) + Math.sin(T * 3) * 6 * (1 - k);
        thread = 1;
      }
      o.root = { y };
      o._thread = thread;
      return o;
    },
    apply(inst, pose) {
      applyParts(inst, pose);
      setAttr(inst.root, "transform", `translate(0,${(pose.root.y || 0).toFixed(2)})`);
      setAttr(inst.extra.thread, "opacity", pose._thread ? 0.85 : 0);
    },
    speed(scale) { return 160 * scale; },
  };
  VSV.RIGS.spider = SPI;

  /* ======================================================================
     GATO atigrado (lateral) · cuerpo, cabeza, orejas, ojos, cola (3), 4 patas
     ====================================================================== */
  const CAT = {
    meta: { h: 330, w: 520, focus: { head: [190, -250], body: [0, -170], eye: [210, -260] } },
    build(parent, defs, opts = {}) {
      const v = opts.variant || {};
      const col = v.body || "#8d8f99";
      const inst = newInst(this, VSV.el("g", { "data-rig": "cat" }, parent));
      const R = inst.root;
      inst.extra.shadow = el("ellipse", { cx: 0, cy: 4, rx: 190, ry: 14, fill: "#000", opacity: 0.22, filter: defs.blur(6) }, R);
      const bodyG = defs.linear([[0, shade(col, 0.2)], [1, shade(col, -0.25)]]);
      const leg = (name, x, dark) => {
        const g = mkPart(inst, R, name, [x, -130]);
        el("path", { d: capsule(128, 34, 26), transform: `translate(${x},-130)`, fill: dark ? shade(col, -0.3) : bodyG }, g);
        el("ellipse", { cx: x + 6, cy: -2, rx: 18, ry: 9, fill: dark ? shade(col, -0.3) : shade(col, 0.1) }, g);
      };
      leg("leg_BL", -120, true); leg("leg_FL", 100, true);
      const tail = mkPart(inst, R, "tail_1", [-170, -180]);
      el("path", { d: capsule(70, 24, 20), transform: "translate(-170,-180) rotate(120)", fill: bodyG }, tail);
      const t2 = mkPart(inst, tail, "tail_2", [-230, -214]);
      el("path", { d: capsule(70, 20, 16), transform: "translate(-230,-214) rotate(160)", fill: bodyG }, t2);
      const t3 = mkPart(inst, t2, "tail_3", [-250, -280]);
      el("path", { d: capsule(60, 16, 10), transform: "translate(-250,-280) rotate(185)", fill: shade(col, -0.3) }, t3);
      const body = mkPart(inst, R, "body", [0, -170]);
      const bd = "M-190,-170 Q-190,-250 -80,-252 L120,-250 Q200,-240 200,-170 Q190,-110 120,-108 L-110,-108 Q-190,-110 -190,-170 Z";
      el("path", { d: bd, fill: bodyG }, body);
      if (v.pattern !== "none") for (let i = 0; i < 6; i++) el("path", { d: `M${-150 + i * 50},-250 q14,40 -6,74`, stroke: shade(col, -0.45), "stroke-width": 12, fill: "none", "stroke-linecap": "round", opacity: 0.8 }, body);
      el("path", { d: "M-160,-130 Q0,-100 170,-130", stroke: "#ffffff", "stroke-width": 16, opacity: 0.12, fill: "none" }, body);
      leg("leg_BR", -90, false); leg("leg_FR", 130, false);
      const head = mkPart(inst, R, "head", [170, -220]);
      for (const [n, x] of [["ear_L", 170], ["ear_R", 222]]) {
        const e = mkPart(inst, head, n, [x, -300]);
        el("path", { d: `M${x - 26},-296 L${x - 6},-350 L${x + 22},-300 Z`, fill: shade(col, -0.1) }, e);
        el("path", { d: `M${x - 14},-300 L${x - 5},-334 L${x + 10},-302 Z`, fill: "#e8a3a8" }, e);
      }
      el("ellipse", { cx: 200, cy: -252, rx: 70, ry: 60, fill: defs.radial([[0, shade(col, 0.3)], [1, shade(col, -0.2)]], 0.4, 0.35, 0.7) }, head);
      if (v.pattern !== "none") el("path", { d: "M170,-310 q8,24 0,40 M196,-312 q6,24 0,42 M222,-306 q-4,22 -2,36", stroke: shade(col, -0.45), "stroke-width": 7, fill: "none", "stroke-linecap": "round" }, head);
      for (const [n, x] of [["eye_L", 196], ["eye_R", 238]]) {
        const e = mkPart(inst, head, n, [x, -258]);
        el("ellipse", { cx: x, cy: -258, rx: 13, ry: 12, fill: "#9be36a" }, e);
        el("ellipse", { cx: x + 2, cy: -258, rx: 3.5, ry: 10, fill: "#111" }, e);
        el("circle", { cx: x + 5, cy: -262, r: 2.5, fill: "#fff" }, e);
      }
      el("path", { d: "M258,-236 l10,6 l-10,6 Z", fill: "#d77a86" }, head);
      el("path", { d: "M252,-224 l50,-6 M252,-220 l48,6 M250,-216 l40,16", stroke: "#f2f2f2", "stroke-width": 2, opacity: 0.7 }, head);
      return inst;
    },
    pose(s) {
      const T = s.t, base = s.base || "idle", seed = s.seed || 0, beats = s.beats || [];
      const o = {};
      const walking = base === "walk" || base === "travel";
      const ph = T * 1.6 * TAU;
      const amp = walking ? 0.38 : 0;
      o.leg_FL = { r: -Math.sin(ph) * amp }; o.leg_BR = { r: -Math.sin(ph) * amp };
      o.leg_FR = { r: Math.sin(ph) * amp }; o.leg_BL = { r: Math.sin(ph) * amp };
      o.body = { y: walking ? -Math.abs(Math.cos(ph)) * 5 : Math.sin(T * 2) * 1.5, sy: 1 + Math.sin(T * 2 + seed) * 0.01 };
      o.tail_1 = { r: Math.sin(T * 1.7 + seed) * 0.12 };
      o.tail_2 = { r: Math.sin(T * 1.7 + seed - 0.7) * 0.18 };
      o.tail_3 = { r: Math.sin(T * 1.7 + seed - 1.4) * 0.25 };
      const wl = VSV.beatWeight(beats, "look_left", T), wr = VSV.beatWeight(beats, "look_right", T);
      o.head = { r: -wl * 0.2 + wr * 0.12 + Math.sin(T * 1.1 + seed) * 0.03, y: o.body.y };
      o.ear_L = { r: Math.max(0, Math.sin(T * 0.9 + seed * 3)) > 0.97 ? -0.3 : 0 };
      const blink = VSV.blinkAt(T, seed, beats);
      o.eye_L = { sy: 1 - blink * 0.92 }; o.eye_R = { sy: 1 - blink * 0.92 };
      o.root = { y: 0 };
      return o;
    },
    apply(inst, pose) { applyParts(inst, pose); },
    speed(scale) { return 2 * 1.6 * 60 * scale; },
  };
  VSV.RIGS.cat = CAT;

  /* ======================================================================
     OJO en primer plano · esclerótica, iris, pupila, brillo, párpados,
     pestañas, ceja (parpadeo, mirada, dilatación)
     ====================================================================== */
  const EYE = {
    meta: { h: 520, w: 900, focus: { eye: [0, -260], pupil: [0, -260] } },
    build(parent, defs, opts = {}) {
      const v = opts.variant || {};
      const iris = v.iris || "#3f8a6a";
      const skin = v.skin || "#e3b08c";
      const inst = newInst(this, VSV.el("g", { "data-rig": "eye" }, parent));
      const R = inst.root;
      const cy = -260;
      el("ellipse", { cx: 0, cy, rx: 470, ry: 300, fill: defs.radial([[0, shade(skin, 0.05)], [1, shade(skin, -0.3)]]) }, R);
      const almond = `M-380,${cy} Q0,${cy - 260} 380,${cy} Q0,${cy + 240} -380,${cy} Z`;
      const clip = defs.clip((c) => el("path", { d: almond }, c));
      const ball = VSV.el("g", { "clip-path": clip }, R);
      el("path", { d: almond, fill: defs.radial([[0, "#ffffff"], [0.75, "#eef0f4"], [1, "#c9ccd6"]]) }, ball);
      const ir = mkPart(inst, ball, "iris", [0, cy]);
      el("circle", { cx: 0, cy, r: 132, fill: defs.radial([[0, shade(iris, 0.35)], [0.55, iris], [0.92, shade(iris, -0.45)], [1, "#1a1a1a"]]) }, ir);
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * TAU, r0 = 58, r1 = 122 + (i % 3) * 4;
        el("path", { d: `M${(Math.cos(a) * r0).toFixed(1)},${(cy + Math.sin(a) * r0).toFixed(1)} L${(Math.cos(a + 0.05) * r1).toFixed(1)},${(cy + Math.sin(a + 0.05) * r1).toFixed(1)}`,
          stroke: i % 2 ? shade(iris, 0.5) : shade(iris, -0.3), "stroke-width": 3, opacity: 0.45 }, ir);
      }
      const pu = mkPart(inst, ir, "pupil", [0, cy]);
      el("circle", { cx: 0, cy, r: 56, fill: "#060608" }, pu);
      const hl = mkPart(inst, ir, "highlight", [40, cy - 44]);
      el("ellipse", { cx: 40, cy: cy - 44, rx: 26, ry: 20, fill: "#fff", opacity: 0.9 }, hl);
      el("path", { d: almond, fill: "none", stroke: "#000", "stroke-opacity": 0.25, "stroke-width": 26, filter: defs.blur(12) }, ball);
      const top = mkPart(inst, R, "lid_top", [0, cy - 250]);
      const lidClip = defs.clip((c) => el("path", { d: almond }, c));
      const topG = VSV.el("g", { "clip-path": lidClip }, top);
      el("rect", { x: -400, y: cy - 260, width: 800, height: 262, fill: shade(skin, -0.05) }, topG);
      inst.extra.topEdge = el("path", { d: `M-380,${cy} Q0,${cy - 260} 380,${cy}`, stroke: "#2a1a14", "stroke-width": 10, fill: "none" }, R);
      const lashes = mkPart(inst, R, "lashes", [0, cy]);
      for (let i = -6; i <= 6; i++) {
        const x = i * 52, y = cy - 125 * (1 - (i * i) / 49) - 8;
        el("path", { d: `M${x},${y.toFixed(1)} q${(i * 3).toFixed(1)},-28 ${(i * 6 + 6).toFixed(1)},-46`, stroke: "#1d1410", "stroke-width": 7, "stroke-linecap": "round", fill: "none" }, lashes);
      }
      el("path", { d: `M-380,${cy} Q0,${cy + 240} 380,${cy}`, stroke: shade(skin, -0.35), "stroke-width": 8, fill: "none" }, R);
      const brow = mkPart(inst, R, "brow", [0, cy - 330]);
      el("path", { d: `M-360,${cy - 300} Q0,${cy - 420} 380,${cy - 290}`, stroke: "#3a2a20", "stroke-width": 46, "stroke-linecap": "round", fill: "none" }, brow);
      inst.extra.cy = cy;
      return inst;
    },
    pose(s) {
      const T = s.t, beats = s.beats || [], seed = s.seed || 0;
      const blink = VSV.blinkAt(T, seed, beats);
      const wl = VSV.beatWeight(beats, "look_left", T), wr = VSV.beatWeight(beats, "look_right", T);
      const dil = VSV.beatWeight(beats, "dilate", T);
      const sacc = noise1(T * 0.8, seed) * 10;
      return {
        iris: { x: -wl * 150 + wr * 150 + sacc, y: noise1(T * 0.6, seed + 4) * 6 },
        pupil: { sx: 1 + dil * 0.55, sy: 1 + dil * 0.55 },
        lid_top: { sy: Math.max(0.001, blink) },
        lashes: { sy: 1 - blink * 1.9 },
        brow: { y: -dil * 30 + blink * 10 },
        _blink: blink,
      };
    },
    apply(inst, pose) {
      applyParts(inst, pose);
      const cy = inst.extra.cy, b = pose._blink;
      setAttr(inst.extra.topEdge, "d", `M-380,${cy} Q0,${(cy - 260 + 470 * b).toFixed(1)} 380,${cy}`);
    },
    speed() { return 0; },
  };
  VSV.RIGS.eye = EYE;

  // catálogo: asset_id → rig
  VSV.CHAR_ASSETS = { pigeon_rig_v1: "pigeon", person_rig_v1: "person", sleeper_rig_v1: "sleeper", spider_rig_v1: "spider", cat_rig_v1: "cat", eye_closeup_v1: "eye" };
  VSV.PERSON_VARIANTS = {
    man: { hair: "short", shirt: "#3f6fb5", pants: "#2f3446" }, woman: { hair: "long", shirt: "#c4566a", pants: "#34364a" },
    child: { hair: "short", shirt: "#e0a33a", pants: "#3b5f8a", scale: 0.72 }, elder: { hair: "bald", shirt: "#6b7f5a", pants: "#3a3a40" },
  };
})();
