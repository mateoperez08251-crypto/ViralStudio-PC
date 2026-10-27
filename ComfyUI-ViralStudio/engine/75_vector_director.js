/* ==========================================================================
   VIRAL STUDIO PRO — director vectorial
   VSV.film(host, data).render(t)   (t = segundo ABSOLUTO del audio)
     · elige la escena por FRAME (start_frame ≤ f < end_frame): misma partición
       que el plan de Python → sin huecos ni solapes;
     · cámara 2D con parallax por capas, seguimiento de personajes que caminan,
       foco en partes del cuerpo cuando se nombran, empujes en palabras clave;
     · marionetas con poses puras, props, infografías y subtítulos palabra a
       palabra (estilo explicativo: palabra actual blanca, pasadas atenuadas,
       clave con recuadro de selección).
   VSV.stateAt(data, t) devuelve el estado (escena, cámara, actores, poses) sin
   DOM: se usa en las pruebas de determinismo (Node).
   ========================================================================== */
(function () {
  "use strict";
  const G = typeof window !== "undefined" ? window : globalThis;
  const VSV = G.VSV;
  const { clamp, lerp, E, hash, strSeed, noise1, bump, M, track } = VSV;

  const SIZE = { pigeon: 0.42, person: 0.62, cat: 0.34, spider: 0.4, sleeper: 1.35, eye: 0.92 }; // fracción de min(W,H)
  const SIDE_VIEW = { pigeon: 1, person: 1, cat: 1 };
  const MOVE_ACT = new Set(["walk", "travel", "crawl", "run", "swim", "fly"]);
  const moveDuration = (action, duration) => Math.min(Math.max(0.36, duration || (action === "run" ? 1.0 : 1.5)), 2.5);

  const SHOT_Z = { wide: 1.0, medium: 1.16, closeup: 1.48 };
  // zoom de primer plano según la parte enfocada (la cabeza entera debe caber)
  const PART_Z = { head: 1.55, eye: 1.7, face: 1.5, mouth: 1.55, beak: 1.6, body: 1.25, legs: 1.25, hands: 1.4, pupil: 1.5 };

  VSV.groundFor = function (world, W, H) {
    if (world === "plaza" || world === "park" || (VSV.PERSPECTIVE_WORLDS || {})[world]) return VSV.groundOf(W, H, world);
    if ((VSV.FLAT_GROUNDS || {})[world]) return VSV.FLAT_GROUNDS[world](W, H);
    const hz = world === "bedroom" ? H * 0.62 : H * 0.62;
    return { horizon: hz, near: H * 0.86, portrait: H > W, flat: true, at: (z) => ({ y: hz + (H * 0.86 - hz) * z, s: 0.55 + 0.45 * z }) };
  };

  /* ------------------------------------------------------------ preparación pura */
  function prepScene(sc, data) {
    if (sc._prep) return sc._prep;
    const W = data.W, H = data.H, unit = Math.min(W, H), fps = data.fps || 30;
    const world = VSV.WORLD_ASSETS[(sc.background || {}).asset_id] || "studio";
    const ground = VSV.groundFor(world, W, H);
    const seed = strSeed(sc.id) + (data.seed || 0);
    const chars = (sc.characters || []).map((c) => Object.assign({}, c));
    const props = (sc.props || []).map((p) => Object.assign({}, p));
    const actors = [];
    const sideIdx = [];
    const CR = VSV.CREATURE_RIGS || {};
    const paramsOf = (c) => Object.assign({}, c.params || {}, c.colors || {});
    // animales que viven en el agua o en el aire no se apoyan en el suelo
    const floating = (c) => c.rig === "fish" || c.rig === "octopus" || (paramsOf(c).habitat === "water");
    const flying = (c) => (c.action === "fly") || (CR[c.rig] && paramsOf(c).hover && c.action !== "walk");
    chars.forEach((c, i) => { if (SIDE_VIEW[c.rig] || (CR[c.rig] && !floating(c))) sideIdx.push(i); });
    const hasBench = props.some((p) => p.name === "bench");
    const hasSleeper = chars.some((c) => c.rig === "sleeper");
    chars.forEach((c, i) => {
      const rig = VSV.RIGS[c.rig];
      if (!rig) return;
      const creature = !!CR[c.rig];
      const vv = c.rig === "person" ? Object.assign({}, VSV.PERSON_VARIANTS[c.variant] || {}, c.colors || {}) : creature ? paramsOf(c) : (c.colors || {});
      const meta = rig.metaFor ? rig.metaFor(vv) : rig.meta;
      // criaturas: `size` = fracción de min(W,H); los animales alargados se miden por su ancho (×0.45)
      let s = creature ? (vv.size || 0.4) * unit / Math.max(meta.h, meta.w * 0.45)
        : (SIZE[c.rig] || 0.4) * unit / ((c.rig === "sleeper" || c.rig === "eye") ? meta.w : meta.h);
      if (vv.scale) s *= vv.scale;
      // Seguridad de encuadre: la geometría real del rig manda, NO su tamaño de catálogo.
      // Un pez alargado no puede ocupar 150 % de la pantalla en un plano abierto.
      if (creature) s = Math.min(s, W * (floating(c) ? 0.59 : 0.44) / Math.max(1, meta.w),
                                 H * 0.36 / Math.max(1, meta.h));
      let x = W / 2, z = 1, y, facing = 1, base = c.action || "idle";
      const k = sideIdx.indexOf(i);
      if (creature && floating(c)) {
        // nadan a media agua; si hay varios, escalonados
        const fl = chars.filter(floating);
        const j = fl.indexOf(c);
        x = fl.length > 1 ? W * (0.36 + 0.3 * j) : W * 0.5;
        y = H * (0.5 + (fl.length > 1 ? (j % 2 ? 0.1 : -0.06) : 0));
        if (j > 0) { z = 0.7; s *= 0.85; facing = -1; }
      } else if (SIDE_VIEW[c.rig] || creature) {
        const n = sideIdx.length;
        if (n >= 2) {
          if (k === 0) { x = W * 0.38; z = 1; }
          else { x = W * (0.74 + 0.08 * (k - 1)); z = 0.36; facing = -1; }
        }
        if (c.rig === "person" && hasBench && (base === "idle" || base === "sit")) base = "sit";
        const gp = ground.at(z);
        y = gp.y;
        s *= ground.flat ? 1 : gp.s;
        if (creature && flying(c)) { y -= unit * 0.26; if (base === "idle") base = "fly"; }
        else if (!creature && base === "fly") y -= unit * 0.3;  // la paloma también vuela
      } else if (c.rig === "sleeper") {
        x = W * 0.56; y = H * (H > W ? 0.74 : 0.8);
      } else if (c.rig === "spider") {
        if (hasSleeper) { x = W * 0.62; y = H * 0.6; s *= 0.45; } else { x = W * 0.5; y = H * 0.5; }
      } else if (c.rig === "eye") {
        x = W / 2; y = H * 0.47 + 260 * s;
      }
      if (c.x != null) x = c.x * W;
      if (c.facing) facing = c.facing;
      // Secuenciar eventos con tiempo, no desplazar una marioneta sin fin.
      // El desplazamiento del cuerpo y la zancada deben tener la MISMA ventana.
      const rawBeats = (sc.beats || []).filter(b => b.target === c.id)
        .map(b => ({ at: b.at_s, action: b.action, dur: b.dur }));
      const motion = rawBeats.filter(b => MOVE_ACT.has(b.action))
        .map(b => ({ ...b, dur: moveDuration(b.action, b.dur) }));
      const moves = MOVE_ACT.has(base) || motion.length > 0;
      const speed = moves && rig.speed ? rig.speed(s, vv) : 0;
      // aseed: semilla de APARIENCIA ligada al id del personaje (misma cara/pelo/piel en todas las escenas);
      // seed: semilla de animación de la escena (parpadeos, respiración)
      actors.push({ id: c.id, rig: c.rig, variant: vv, meta, x0: x, y0: y, z, s, facing, base, speed, motion, seed: seed + i * 31, aseed: strSeed(c.id),
        beats: rawBeats });
    });
    // la araña con un durmiente: delante (z mayor) y junto a la boca, que es donde "cae" la historia
    const sl = actors.find((a) => a.rig === "sleeper"), sp = actors.find((a) => a.rig === "spider");
    if (sl && sp) {
      const mf = VSV.RIGS.sleeper.meta.focus.mouth;
      sp.x0 = sl.x0 + (mf[0] + 70) * sl.s; sp.y0 = sl.y0 + (mf[1] - 10) * sl.s; sp.z = 1.2; sp.s = sp.s * 0.85;
    }
    // props: posición por tipo
    const pr = props.map((p, i) => {
      const owner = actors.find((a) => a.rig === "person" && a.base === "sit");
      let x = W * 0.7, z = 0.45, s = unit / 1080;
      if (p.name === "bench") { if (owner) { x = owner.x0; z = owner.z; } const gp = ground.at(z); return { name: p.name, x, y: gp.y, s: s * (ground.flat ? 0.8 : gp.s) * 1.05, at: null, behind: true }; }
      if (p.name === "camera" || p.name === "book") return { name: p.name, x: W * 0.5, y: H * 0.42, s: s * 0.9, at: p.at_s, float: true };
      if (p.name === "seeds") { const a = actors[0]; const gp = ground.at(1); return { name: p.name, x: a ? a.x0 + 120 * s : W / 2, y: gp.y, s, at: null }; }
      if (p.name === "tree" || p.name === "plant") { const gp = ground.at(0.7); return { name: p.name, x: W * 0.16, y: gp.y, s: s * gp.s, at: null, behind: true }; }
      const gp = ground.at(z);
      return { name: p.name, x, y: gp.y, s: s * gp.s, at: p.at_s || null };
    });
    const main = actors[0];
    const prep = { world, ground, seed, actors, props: pr, main, W, start: sc.start_frame / fps, end: sc.end_frame / fps, fps };
    Object.defineProperty(sc, "_prep", { value: prep, enumerable: false, configurable: true });
    return prep;
  }

  function actorAt(a, t, sc) {
    const P = sc._prep;
    const lt = t - P.start;
    const dur = P.end - P.start;
    let x = a.x0, y = a.y0, mode = a.base, moving = false;
    // Los beats son acciones concretas, con inicio y fin. Ni zoom ni parallax
    // sustituyen desplazamiento real. El actor se mantiene en su destino al
    // terminar el paso; no rebota artificialmente hacia la posición inicial.
    if (a.motion.length) {
      mode = "idle";
      for (const b of a.motion) {
        const local = clamp((t - b.at) / b.dur, 0, 1);
        const d = a.speed * b.dur * E.io(local) * (b.action === "run" ? 1.4 : 0.82);
        x += d * a.facing;
        if (t >= b.at && t < b.at + b.dur) { mode = b.action; moving = true; }
      }
    } else if (MOVE_ACT.has(a.base) && a.speed) {
      const delta = a.speed * clamp(lt, 0, dur) * 0.73;
      x += a.facing * delta;
      moving = true;
    }
    // Encuadre sin teleportar: el recorrido termina en el borde seguro.
    x = clamp(x, P.W * 0.12, P.W * 0.88);
    if (mode === "swim") y += Math.sin(t * 1.7 + a.seed) * Math.min(11, a.s * 30);
    if (mode === "fly") y += Math.sin(t * 2.1 + a.seed) * Math.min(14, a.s * 30);
    if (a.base === "shiver") x += Math.sin(t * 46 + a.seed) * Math.min(2.5, a.s * 1.6);
    const rig = VSV.RIGS[a.rig];
    const pose = rig.pose({ t, lt, base: mode, beats: a.beats, seed: a.seed, moving, v: a.variant });
    return { id: a.id, rig: a.rig, x, y, s: a.s, facing: a.facing, action: mode, moving, pose, look: a.rig === "person" ? VSV.RIGS.person.pal(a.variant, a.aseed) : null };
  }

  // punto de mundo de una parte del personaje (foco de cámara, etiquetas, guías)
  function partWorld(a, st, part) {
    const meta = a.meta || VSV.RIGS[a.rig].meta;
    const f = (meta.focus || {})[part] || (meta.focus || {}).head || [0, -meta.h * 0.6];
    let px = f[0], py = f[1];
    const p = st.pose || {};
    if (a.rig === "pigeon" && (part === "head" || part === "eye" || part === "beak")) px += (p.body ? p.body.x || 0 : 0) + (p._headOff || 0);
    if (p.root && p.root.y) py += p.root.y;
    return [st.x + px * st.s * st.facing, st.y + py * st.s];
  }
  VSV.partWorld = partWorld;

  function cameraAt(sc, data, t, states) {
    const P = sc._prep, W = data.W, H = data.H;
    const cam = sc.camera || {};
    const lt = t - P.start, dur = Math.max(0.1, P.end - P.start), k = clamp(lt / dur);
    const shot = cam.shot || "wide";
    let z = SHOT_Z[shot] || 1;
    let cx = W / 2, cy = H / 2;
    const main = P.main && states[0];
    if (main && P.main.speed) cx += (main.x - P.main.x0) * (cam.movement === "track" ? 1 : 0.78);
    const focusPart = (cam.focus && cam.focus.part) || (shot === "closeup" ? "head" : null);
    const fa = cam.focus ? P.actors.findIndex((a) => a.id === cam.focus.target) : 0;
    const fp = focusPart && fa >= 0 && P.actors[fa] ? partWorld(P.actors[fa], states[fa], focusPart) : null;
    if (shot === "medium" && main) {
      const bp = partWorld(P.main, main, "body");
      cx = lerp(cx, bp[0], 0.6); cy = lerp(cy, bp[1], 0.5);
    }
    if (shot === "closeup" && fp) { cx = fp[0]; cy = fp[1]; z = PART_Z[focusPart] || z; }
    // foco que llega con la palabra (p. ej. «cabeza» → la cámara se acerca a la cabeza)
    if (cam.focus_at_s != null && fp && shot !== "closeup") {
      const w = E.io(clamp((t - cam.focus_at_s + 0.15) / 0.8));
      z = lerp(z, PART_Z[focusPart] || 2.3, w);
      cx = lerp(cx, fp[0], w); cy = lerp(cy, fp[1], w);
    }
    // movimiento de cámara a lo largo de la escena
    const mv = cam.movement || "static";
    if (mv === "slow_push") z *= 1 + 0.08 * k;
    else if (mv === "push_in") z *= 1 + 0.16 * E.io(k);
    else if (mv === "pull_out") z *= 1.16 - 0.16 * E.out(k);
    else if (mv === "pan_left") cx += (W * 0.07 * (0.5 - E.io(k)) * 2) / z;
    else if (mv === "pan_right") cx += (W * 0.07 * (E.io(k) - 0.5) * 2) / z;
    else if (mv === "orbit") { cx += Math.sin(k * Math.PI) * W * 0.03; }
    else if (mv === "static") { cx += noise1(t * 0.3, P.seed) * W * 0.004; cy += noise1(t * 0.27, P.seed + 1) * H * 0.003; }
    // golpe de entrada en el corte + empujes en palabras clave
    z *= 1 + 0.035 * Math.pow(1 - clamp(lt / 0.35), 2);
    for (const ht of sc.punch_s || []) z *= 1 + 0.022 * (t >= ht ? Math.pow(1 - clamp((t - ht) / 0.35), 2) : 0);
    let r = mv === "orbit" ? Math.sin(k * Math.PI * 2) * 0.012 : 0;
    // sacudida en sorpresa/impacto
    let sh = 0;
    for (const b of sc.beats || []) if (b.action === "surprise" || b.action === "hop") sh += bump(t, b.at_s, 0.35) * (b.action === "surprise" ? 9 : 4);
    if (sh) { cx += noise1(t * 40, 3) * sh; cy += noise1(t * 40, 7) * sh; }
    if (P.world === "plaza" || P.world === "park" || (VSV.PERSPECTIVE_WORLDS || {})[P.world]) {
      // nunca enseñar por encima del cielo pintado ni por debajo del suelo
      cy = clamp(cy, H * 0.5 - H * 0.25 / z, H * 0.5 + H * 0.5 * (1 - 1 / z) + H * 0.12);
    }
    // Zoom máximo según número y forma de los personajes: evita cabezas cortadas y animales gigantes.
    const aquatic = P.actors.some(a => a.rig === "fish" || a.rig === "octopus");
    z = clamp(z, 1, aquatic ? 1.18 : (P.actors.length > 1 ? 1.26 : 1.55));
    return { x: cx, y: cy, z, r };
  }

  function sceneIndexAt(scenes, t, fps) {
    const f = Math.floor(t * fps + 1e-6);
    let lo = 0, hi = scenes.length - 1, ans = 0;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (scenes[m].start_frame <= f) { ans = m; lo = m + 1; } else hi = m - 1;
    }
    return ans;
  }

  // estado completo puro (para pruebas): escena, cámara, actores
  VSV.stateAt = function (data, t) {
    const fps = data.fps || 30;
    const sc = data.scenes[sceneIndexAt(data.scenes, t, fps)];
    prepScene(sc, data);
    const states = sc._prep.actors.map((a) => actorAt(a, t, sc));
    const cam = cameraAt(sc, data, t, states);
    return { scene: sc.id, camera: cam, actors: states };
  };

  /* ------------------------------------------------------------ DOM */
  function layerMatrix(cam, d, W, H) {
    const zd = 1 + (cam.z - 1) * d;
    const cdx = W / 2 + (cam.x - W / 2) * d, cdy = H / 2 + (cam.y - H / 2) * d;
    let m = M.mul(M.tr(W / 2, H / 2), M.mul(M.rot(cam.r * d), M.mul(M.sc(zd), M.tr(-cdx, -cdy))));
    return { m, cdx, zd };
  }

  VSV.film = function (host, data) {
    const W = data.W, H = data.H, fps = data.fps || 30;
    const doc = host.ownerDocument || document;
    host.style.position = host.style.position || "absolute";
    const svg = VSV.el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: "position:absolute;left:0;top:0;overflow:hidden" });
    host.appendChild(svg);
    const defsEl = VSV.el("defs", null, svg);
    const stage = VSV.el("g", null, svg);
    const fin = VSV.el("g", { "pointer-events": "none" }, svg);
    const D0 = new VSV.Defs(defsEl, "f");
    VSV.el("rect", { x: 0, y: 0, width: W, height: H, fill: D0.radial([[0.55, "#000", 0], [1, "#000", data.vignette == null ? 0.42 : data.vignette]], 0.5, 0.48, 0.75) }, fin);
    const built = {};
    const scenes = data.scenes;
    scenes.forEach((s) => prepScene(s, data));

    function buildScene(sc) {
      if (built[sc.id]) return built[sc.id];
      const P = sc._prep;
      const defs = new VSV.Defs(defsEl, sc.id);
      // visibility:hidden (no display:none) para poder MEDIR textos al construir (zonas seguras)
      const root = VSV.el("g", { "data-scene": sc.id, style: "visibility:hidden" }, stage);
      const wroot = VSV.el("g", null, root);
      const world = (VSV.WORLDS[P.world] || VSV.WORLDS.studio)(wroot, defs, W, H, P.seed, sc);
      // capa de actores (profundidad 1) antes de los primeros planos (d > 1.05)
      const fg = world.layers.find((l) => l.depth > 1.05);
      const actorsG = VSV.el("g", { "data-layer": "actors" }, null);
      if (fg) wroot.insertBefore(actorsG, fg.g); else wroot.appendChild(actorsG);
      const propsI = P.props.map((p, i) => {
        const pg = VSV.el("g", null, actorsG);
        (VSV.PROPS[p.name] || (() => null))(pg, defs, 0, 0, 1, P.seed + i);
        return { p, g: pg };
      });
      // orden de dibujo: lo lejano (z pequeño) primero
      const order = P.actors.map((a, i) => i).sort((a, b) => P.actors[a].z - P.actors[b].z);
      const actI = [];
      order.forEach((i) => {
        const a = P.actors[i];
        const ag = VSV.el("g", { "data-actor": a.id }, actorsG);
        const inst = VSV.RIGS[a.rig].build(ag, defs, { variant: a.variant, seed: a.aseed });
        actI[i] = { a, g: ag, inst };
      });
      // props delante de los personajes que no son de fondo
      propsI.forEach((pi) => { if (!pi.p.behind) actorsG.appendChild(pi.g); else actorsG.insertBefore(pi.g, actorsG.firstChild); });
      const ovG = VSV.el("g", { "data-layer": "overlays" }, root);
      const ctx0 = { W, H, u: Math.min(W, H) / 1080, lang: data.lang || "es", sc: { end: P.end } };
      const ovI = (sc.overlays || []).map((ov) => {
        const O = VSV.OVERLAYS[ov.type];
        if (!O) return null;
        const o2 = Object.assign({ at: ov.at_s == null ? P.start + 0.2 : ov.at_s }, ov);
        return { O, ov: o2, inst: O.build(VSV.el("g", null, ovG), defs, o2, ctx0) };
      }).filter(Boolean);
      return (built[sc.id] = { root, world, actorsG, actI, propsI, ovI, ctx0 });
    }

    function drawScene(sc, t, alpha) {
      const B = buildScene(sc), P = sc._prep;
      const states = P.actors.map((a) => actorAt(a, t, sc));
      const cam = cameraAt(sc, data, t, states);
      for (const L of B.world.layers) {
        const { m, cdx, zd } = layerMatrix(cam, L.depth, W, H);
        VSV.setAttr(L.g, "transform", VSV.matStr(m));
        if (L.tile) VSV.setAttr(L.inner, "transform", `translate(${(L.tile * Math.round((cdx - W / 2) / L.tile)).toFixed(1)},0)`);
        if (L.anim) L.anim(t);
        // profundidad de campo: en primeros planos las capas lejanas se desenfocan (cámara real)
        const bl = L.depth < 0.9 ? clamp((cam.z - 1.2) * 5, 0, 9) * (1 - L.depth) * (W / 1080) : 0;
        VSV.setAttr(L.g, "style", bl > 0.3 ? `filter:blur(${bl.toFixed(1)}px)` : "");
      }
      const A = layerMatrix(cam, 1, W, H).m;
      VSV.setAttr(B.actorsG, "transform", VSV.matStr(A));
      B.actI.forEach((ai, i) => {
        if (!ai) return;
        const st = states[i];
        VSV.setAttr(ai.g, "transform", `translate(${st.x.toFixed(2)},${st.y.toFixed(2)}) scale(${(st.s * st.facing).toFixed(4)},${st.s.toFixed(4)})`);
        VSV.RIGS[ai.a.rig].apply(ai.inst, st.pose);
      });
      B.propsI.forEach((pi) => {
        const p = pi.p;
        const k = p.at == null ? 1 : clamp((t - p.at) / 0.45);
        const s = p.s * (p.at == null ? 1 : (t < p.at ? 0.001 : 0.5 + 0.5 * E.back(k)));
        const fy = p.float ? Math.sin(t * 1.6) * 10 : 0;
        VSV.setAttr(pi.g, "transform", `translate(${p.x.toFixed(1)},${(p.y + fy).toFixed(1)}) scale(${s.toFixed(4)})`);
        VSV.setAttr(pi.g, "opacity", p.at == null ? 1 : (t < p.at ? 0 : clamp(k * 3)).toFixed(3));
      });
      const ctx = Object.assign({}, B.ctx0, {
        zoom: cam.z,
        project: (pt) => M.apply(A, pt),
        screenPoint: (target, part) => {
          const i = P.actors.findIndex((a) => a.id === target);
          const j = i >= 0 ? i : 0;
          if (!P.actors[j]) return null;
          return M.apply(A, partWorld(P.actors[j], states[j], part));
        },
        groundScreenY: M.apply(A, [0, P.actors[0] ? P.actors[0].y0 : H * 0.85])[1],
      });
      B.ovI.forEach((o) => o.O.update(o.inst, t, ctx, o.ov));
      VSV.setAttr(B.root, "style", "display:inline");
      VSV.setAttr(B.root, "opacity", alpha == null ? 1 : alpha.toFixed(3));
      return B;
    }

    /* ---------------- subtítulos (HTML: tipografía nítida) ---------------- */
    const cap = data.captions || {};
    let capRoot = null, capGroups = [];
    if (cap.enabled !== false && (cap.groups || []).length) {
      const portrait = H > W;
      const fs = Math.round((cap.size || (portrait ? 0.05 : 0.03)) * W);
      const top = cap.position === "bottom" ? H * (portrait ? 0.74 : 0.82) : H * (portrait ? 0.165 : 0.07);
      capRoot = doc.createElement("div");
      capRoot.className = "vsv-caps";
      capRoot.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;z-index:5;font-family:Montserrat,Inter,Arial,sans-serif;`;
      host.appendChild(capRoot);
      const st = doc.createElement("style");
      st.textContent = `.vsv-g{position:absolute;left:${W * 0.06}px;width:${W * 0.88}px;top:${top}px;text-align:center;opacity:0;line-height:1.24;font-size:${fs}px;font-weight:700;letter-spacing:0.005em}
.vsv-g>div{white-space:nowrap}
.vsv-w{display:inline-block;position:relative;margin:0 0.13em;color:#fff;text-shadow:0 2px 14px rgba(0,0,0,.55),0 1px 3px rgba(0,0,0,.5)}
.vsv-box{position:absolute;left:-0.16em;right:-0.16em;top:-0.04em;bottom:-0.06em;border:3px solid #4b8dff;background:rgba(36,99,235,.30);border-radius:4px;transform-origin:0 50%}
.vsv-box:before,.vsv-box:after{content:"";position:absolute;width:11px;height:11px;border-radius:50%;background:#fff;border:3px solid #4b8dff;box-sizing:border-box}
.vsv-box:before{left:-7px;top:-7px}.vsv-box:after{right:-7px;bottom:-7px}`;
      capRoot.appendChild(st);
      capGroups = cap.groups.map((gq) => {
        const gd = doc.createElement("div");
        gd.className = "vsv-g";
        const words = [];
        gq.lines.forEach((line) => {
          const ld = doc.createElement("div");
          line.forEach((w) => {
            const sp = doc.createElement("span");
            sp.className = "vsv-w";
            let box = null;
            if (w.hl) { box = doc.createElement("i"); box.className = "vsv-box"; sp.appendChild(box); }
            sp.appendChild(doc.createTextNode(w.w));
            ld.appendChild(sp);
            words.push({ w, sp, box });
          });
          gd.appendChild(ld);
        });
        capRoot.appendChild(gd);
        // zona segura: si una línea no cabe en el 88 % del ancho, se reduce la letra de ESE grupo
        const avail = W * 0.88;
        const widest = Math.max(0, ...Array.from(gd.children).map((ld) => ld.scrollWidth || 0));
        if (widest > avail) gd.style.fontSize = Math.floor(fs * (avail / widest) * 0.97) + "px";
        return { g: gq, el: gd, words };
      });
    }
    function drawCaptions(t) {
      for (const C of capGroups) {
        const on = t >= C.g.s && t < C.g.e;
        const o = on ? clamp((t - C.g.s) / 0.1) * clamp((C.g.e - t) / 0.14) : 0;
        if (C._o !== o) { C.el.style.opacity = o.toFixed(3); C._o = o; }
        if (!on) continue;
        C.words.forEach((x, i) => {
          const nxt = C.words[i + 1];
          const visible = t >= x.w.s - 0.02;
          const current = visible && (!nxt || t < nxt.w.s - 0.02);
          const st = !visible ? "h" : current || x.w.hl ? "c" : "p";
          if (x._st !== st) {
            x.sp.style.visibility = st === "h" ? "hidden" : "visible";
            x.sp.style.color = st === "p" ? "rgba(236,238,245,0.62)" : "#ffffff";
            x._st = st;
          }
          if (x.box) {
            const k = clamp((t - x.w.s) / 0.14);
            x.box.style.transform = `scaleX(${E.out(k).toFixed(3)})`;
          }
        });
      }
    }

    let shown = [];
    function render(t) {
      t = Math.max(0, t);
      const i = sceneIndexAt(scenes, t, fps);
      const sc = scenes[i];
      const P = sc._prep;
      const vis = [sc.id];
      const trans = sc.transition_in || "cut";
      const D = { fade: 0.35, whip: 0.3, zoom: 0.35 }[trans] || 0;
      const lt = t - P.start;
      drawScene(sc, t, 1);
      if (D && i > 0 && lt < D) {
        const prev = scenes[i - 1];
        const k = E.io(lt / D);
        const B = drawScene(prev, t, 1 - k);
        if (trans === "whip") VSV.setAttr(B.root, "transform", `translate(${(-W * 0.8 * k).toFixed(1)},0)`);
        if (trans === "zoom") VSV.setAttr(B.root, "transform", `translate(${W / 2},${H / 2}) scale(${(1 + k).toFixed(3)}) translate(${-W / 2},${-H / 2})`);
        stage.appendChild(B.root);
        vis.push(prev.id);
      }
      for (const id of shown) if (!vis.includes(id) && built[id]) VSV.setAttr(built[id].root, "style", "display:none");
      shown = vis;
      drawCaptions(t);
    }
    return { render, svg, stateAt: (t) => VSV.stateAt(data, t), sceneAt: (t) => scenes[sceneIndexAt(scenes, t, fps)].id };
  };
})();
