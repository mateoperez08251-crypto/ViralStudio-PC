/* ==========================================================================
   VIRAL STUDIO ENGINE — tipos de plano
   Cada plano dibuja el primer plano de una escena (el director ya puso el
   fondo, la cámara y el acabado). Todos funcionan en 16:9 y 9:16.
   VS.SHOTS[tipo](ctx, S)   S = {sc, lt, T, dur, k, L, st, pal, u, W, H, R, actor, prop, text}
   ========================================================================== */
(function () {
  "use strict";
  const VS = window.VS;
  const { clamp, lerp, hash, mix, rgba, shade, E, bump, decay, rng } = VS;
  const PI = Math.PI;
  const SHOTS = (VS.SHOTS = {});

  /* ---------- utilidades de composición ---------- */
  const isFig = (S) => !!(VS.FIGURE_MODES[S.st.mode] || S.st.figure);
  // escala para que un personaje de pie mida "frac" del alto útil
  function cscale(S, mult = 1) {
    const base = isFig(S) ? 290 : 236;
    const target = S.L.portrait ? Math.min(S.H * 0.31, S.W * 0.62) : S.H * 0.47;
    return (target / base) * mult;
  }
  const SLOTS = { 1: [0.5], 2: [0.32, 0.68], 3: [0.2, 0.5, 0.8], 4: [0.14, 0.38, 0.62, 0.86] };
  const SLOTS_P = { 1: [0.5], 2: [0.28, 0.72], 3: [0.18, 0.5, 0.82], 4: [0.12, 0.37, 0.63, 0.88] };
  function chars(S) {
    const c = S.sc.chars || [];
    return c.length ? c : S.sc.who ? [{ who: S.sc.who, action: S.sc.action }] : [];
  }
  // texto que cabe en un ancho
  function fit(ctx, str, size, font, maxW, weight = 900) {
    ctx.save();
    ctx.font = `${weight} ${size}px "${font}"`;
    const w = ctx.measureText(str).width;
    ctx.restore();
    return w > maxW ? Math.floor((size * maxW) / w) : size;
  }
  VS.fitText = fit;
  // rótulo documental "LUGAR · AÑO" (se escribe letra a letra)
  function chip(S, text) {
    if (!text) return;
    const ctx = S.ctx, u = S.u;
    const k = clamp((S.lt - 0.25) / 0.6);
    if (k <= 0) return;
    const fs = Math.round((S.L.portrait ? 40 : 34) * u);
    const str = String(text).toUpperCase();
    const n = Math.ceil(str.length * k);
    const x = S.L.portrait ? S.W * 0.08 : S.W * 0.055, y = S.L.portrait ? S.H * 0.13 : S.H * 0.1;
    ctx.save();
    ctx.font = `700 ${fs}px "${S.st.font}"`;
    ctx.letterSpacing = 4 * u + "px";
    ctx.fillStyle = S.st.accent;
    ctx.fillRect(x, y - fs * 0.6, 6 * u, fs * 1.2 * E.out(clamp(k * 3)));
    ctx.fillStyle = rgba("#f4ede4", 0.95);
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,.8)";
    ctx.shadowBlur = 12 * u;
    ctx.fillText(str.slice(0, n), x + 22 * u, y);
    ctx.restore();
  }
  VS.chip = chip;
  // texto grande con golpe de entrada
  function slamText(S, str, x, y, size, o = {}) {
    const ctx = S.ctx;
    const t0 = o.t0 || 0;
    const k = clamp((S.lt - t0) / (o.d || 0.28));
    if (k <= 0) return 0;
    const sc = o.noScale ? 1 : 1 + (1 - E.out(k)) * (o.from || 0.9);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    ctx.globalAlpha *= clamp(k * 2.5);
    if (k < 1 && !o.noBlur) ctx.filter = `blur(${Math.round((1 - k) * 10)}px)`;
    VS.text(ctx, str, 0, 0, Object.assign({ size, font: S.st.fontDisplay, color: S.st.ink, shadow: "rgba(0,0,0,.55)", sy: size * 0.06 }, o));
    ctx.restore();
    return k;
  }
  VS.slamText = slamText;
  // posición x con entrada caminando
  function travelX(S, c, x0) {
    const tr = c.travel;
    const W = S.W;
    if (!tr) return { x: x0, moving: false };
    const lt = S.lt;
    if (tr === "in_left" || tr === "in_right") {
      const d = Math.min(1.6, S.dur * 0.55), k = clamp(lt / d);
      const from = tr === "in_left" ? -W * 0.2 : W * 1.2;
      return { x: lerp(from, x0, E.out(k)), moving: k < 0.97, dir: tr === "in_left" ? 1 : -1 };
    }
    if (tr === "out_left" || tr === "out_right") {
      const t0 = S.dur * 0.45, k = clamp((lt - t0) / (S.dur - t0));
      const to = tr === "out_left" ? -W * 0.25 : W * 1.25;
      return { x: lerp(x0, to, E.in(k)), moving: k > 0.01, dir: tr === "out_left" ? -1 : 1 };
    }
    if (tr === "across" || tr === "across_left") {
      const dir = tr === "across" ? 1 : -1;
      const k = S.k;
      return { x: dir > 0 ? lerp(-W * 0.1, W * 1.1, k) : lerp(W * 1.1, -W * 0.1, k), moving: true, dir };
    }
    return { x: x0, moving: false };
  }
  function drawCast(S, list, o = {}) {
    const n = Math.min(4, list.length);
    const slots = (S.L.portrait ? SLOTS_P : SLOTS)[Math.max(1, n)];
    const s = cscale(S, o.mult || (n >= 3 ? 0.88 : 1));
    list.slice(0, 4).forEach((c, i) => {
      let x = S.W * (c.x != null ? c.x : slots[i]);
      const tv = travelX(S, c, x);
      let action = c.action || "idle";
      if (tv.moving) action = c.run ? "run" : (action === "run" ? "run" : "walk");
      let dir = c.dir || tv.dir || (n === 1 ? (S.seed % 2 ? -1 : 1) : x < S.W / 2 ? 1 : -1);
      if (c.face_away) dir = -dir;
      const lt = tv.moving ? S.lt : Math.max(0, S.lt - (c.travel === "in_left" || c.travel === "in_right" ? Math.min(1.6, S.dur * 0.55) : 0));
      // sombra en el suelo
      if (S.st.mode !== "silhouette") {
        S.ctx.fillStyle = "rgba(0,0,0,.28)";
        S.ctx.beginPath();
        S.ctx.ellipse(tv.x, S.L.gy + 4 * S.u, 70 * s * (c.scale || 1), 12 * s, 0, 0, PI * 2);
        S.ctx.fill();
      }
      S.actor({ who: c.who, look: c.look, id: c.id == null ? i : c.id, x: tv.x, y: S.L.gy + (c.dy || 0) * S.u, s: s * (c.scale || 1), dir, action, face: c.face, lt, back: c.back, alpha: c.alpha });
      if (c.held_prop) S.prop(c.held_prop, tv.x + dir * 60 * s, S.L.gy - 120 * s, 0.35 * s);
    });
  }
  VS.drawCast = drawCast;

  /* ---------- fondo animado de agua oscura (tipografía cinética) ---------- */
  VS.waterBg = function (ctx, L, T, col) {
    const W = L.W, H = L.H, u = L.u;
    ctx.fillStyle = col || "#0d1116";
    ctx.fillRect(-W, -H, W * 3, H * 3);
    ctx.strokeStyle = "rgba(200,215,230,.07)";
    ctx.lineWidth = 2 * u;
    for (let r = 0; r < 70; r++) {
      const y = (r / 70) * H * 1.1;
      ctx.beginPath();
      for (let x = -40; x <= W + 40; x += 24 * u) {
        const yy = y + Math.sin(x * 0.012 + T * 0.9 + r * 0.7) * 5 * u + Math.sin(x * 0.031 - T * 1.3 + r) * 3 * u;
        x === -40 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    VS.glow(ctx, W * 0.5, H * 0.45, Math.max(W, H) * 0.6, "#3a4a5a", 0.25);
  };

  /* ================= PLANOS ================= */

  // Personajes actuando en un escenario (plano principal)
  SHOTS.scene = function (ctx, S) {
    const sc = S.sc;
    if (sc.prop && sc.prop_pos !== "none") {
      const pk = E.back(clamp((S.lt - 0.35) / 0.4));
      const px = S.W * (sc.prop_x || (chars(S).length ? (S.L.portrait ? 0.5 : 0.78) : 0.5));
      const py = sc.prop_pos === "ground" ? S.L.gy - 110 * S.u : S.L.portrait ? S.H * 0.27 : S.H * 0.3;
      if (pk > 0) {
        ctx.save();
        ctx.translate(px, py + Math.sin(S.T * 1.6) * 8 * S.u);
        ctx.scale(pk, pk);
        if (S.st.mode !== "silhouette" && S.st.mode !== "doc") VS.glow(ctx, 0, 0, 260 * S.u, S.st.accent, 0.25);
        S.prop(sc.prop, 0, 0, (S.L.portrait ? 1.15 : 1.0) * S.u * (sc.prop_scale || 1));
        ctx.restore();
      }
    }
    drawCast(S, chars(S));
    chip(S, sc.chip);
  };

  // Primer plano dramático (busto grande)
  SHOTS.closeup = function (ctx, S) {
    const c = chars(S)[0] || { action: "idle" };
    const s = cscale(S, S.L.portrait ? 2.6 : 2.25);
    const x = S.W * (c.x || (S.L.portrait ? 0.5 : 0.42));
    const dir = c.dir || (S.seed % 2 ? -1 : 1);
    const y = S.L.portrait ? S.H * 0.95 : S.H * 1.42;
    const action = c.action && !["walk", "run", "carry", "sneak"].includes(c.action) ? c.action : "idle";
    S.actor({ who: c.who, look: c.look, id: c.id || 0, x, y, s, dir, action, face: c.face });
    chip(S, S.sc.chip);
  };

  // Dos personajes conversando, con bocadillo opcional
  SHOTS.dialogue = function (ctx, S) {
    const cs = chars(S);
    const a = cs[0] || { action: "talk" }, b = cs[1] || { action: "idle" };
    const half = S.lt < S.dur / 2;
    drawCast(S, [Object.assign({}, a, { action: half ? "talk" : a.action || "idle", face: half ? "talk" : a.face, dir: 1 }), Object.assign({}, b, { action: half ? b.action || "idle" : "talk", face: half ? b.face : "talk", dir: -1 })]);
    if (S.sc.label) {
      const sx = half ? (S.L.portrait ? 0.3 : 0.34) : S.L.portrait ? 0.7 : 0.66;
      bubble(S, S.sc.label, S.W * sx, S.L.portrait ? S.H * 0.25 : S.H * 0.2, half ? 1 : -1, half ? 0.15 : S.dur / 2 + 0.1);
    }
  };
  function bubble(S, text, x, y, side, t0) {
    const ctx = S.ctx, u = S.u;
    const k = E.back(clamp((S.lt - t0) / 0.3));
    if (k <= 0) return;
    const fs = Math.round((S.L.portrait ? 50 : 44) * u);
    const lines = VS.wrap(ctx, text, fs, S.st.font, S.W * (S.L.portrait ? 0.62 : 0.32), 800);
    const lh = fs * 1.2;
    let w = 0;
    ctx.save();
    ctx.font = `800 ${fs}px "${S.st.font}"`;
    for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
    const bw = w + 60 * u, bh = lines.length * lh + 44 * u;
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.fillStyle = "#f4ede4";
    ctx.strokeStyle = "#14110f";
    ctx.lineWidth = 4 * u;
    VS.roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 26 * u);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-side * bw * 0.1, bh / 2 - 2);
    ctx.lineTo(-side * bw * 0.25, bh / 2 + 50 * u);
    ctx.lineTo(-side * bw * 0.28, bh / 2 - 2);
    ctx.fill();
    ctx.fillStyle = "#14110f";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lines.forEach((l, i) => ctx.fillText(l, 0, -bh / 2 + 22 * u + lh * (i + 0.5)));
    ctx.restore();
  }

  // Héroe contra villano
  SHOTS.confront = function (ctx, S) {
    const cs = chars(S);
    const a = cs[0] || { action: "fight" }, b = cs[1] || { action: "angry", look: { villain: true } };
    const lean = E.io(clamp(S.k * 1.5)) * 0.05;
    drawCast(S, [Object.assign({ action: "fight", face: "determined" }, a, { x: (S.L.portrait ? 0.27 : 0.3) + lean, dir: 1 }), Object.assign({ action: "angry", face: "evil" }, b, { x: (S.L.portrait ? 0.73 : 0.7) - lean, dir: -1 })]);
    // chispas en el centro
    const cx = S.W / 2, cy = S.L.gy - cscale(S) * 150;
    for (let i = 0; i < 10; i++) {
      const ph = (S.T * 2 + hash(i)) % 1;
      const a2 = hash(i * 3) * PI * 2;
      ctx.strokeStyle = rgba(S.st.accent, 1 - ph);
      ctx.lineWidth = 3 * S.u;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a2) * ph * 60 * S.u, cy + Math.sin(a2) * ph * 60 * S.u);
      ctx.lineTo(cx + Math.cos(a2) * (ph * 60 + 18) * S.u, cy + Math.sin(a2) * (ph * 60 + 18) * S.u);
      ctx.stroke();
    }
    chip(S, S.sc.chip);
  };

  // Multitud (pueblo, ejército, familias…)
  SHOTS.crowd = function (ctx, S) {
    const sc = S.sc, R = rng(S.seed + 3);
    const rows = S.L.portrait ? 3 : 2;
    const n = clamp(sc.count || 14, 4, 30);
    const base = cscale(S, 0.62);
    const march = sc.action === "walk" || sc.action === "run" || sc.action === "march";
    for (let r = 0; r < rows; r++) {
      const depth = (rows - r) / rows;
      const s = base * (0.55 + 0.45 * (1 - depth) + 0.1);
      const y = S.L.gy - (rows - 1 - r) * 40 * S.u * (S.L.portrait ? 1.4 : 1);
      const cnt = Math.round(n / rows + r);
      for (let i = 0; i < cnt; i++) {
        const off = march ? ((S.T * 70 * S.u) % (S.W / cnt)) : 0;
        const x = ((i + 0.5 + (R() - 0.5) * 0.6) / cnt) * S.W * 1.1 - S.W * 0.05 + off;
        const col = S.st.mode === "line" ? mix(S.st.crowd, S.st.bg, depth * 0.45) : null;
        const look = { outfit: S.st.outfits[(i + r) % S.st.outfits.length], hair: ["short", "bun", "short", "long"][(i + r) % 4], dress: (i + r) % 3 === 1, hat: (i * 7 + r) % 5 === 0 ? "fedora" : null, kind: (i + r * 3) % 7 === 0 ? "child" : "person" };
        ctx.save();
        ctx.globalAlpha *= 1 - depth * 0.35;
        S.actor({ id: i * 3 + r, x, y, s, dir: march ? 1 : i % 2 ? -1 : 1, action: march ? "walk" : sc.action || "idle", look, col, face: sc.face });
        ctx.restore();
      }
    }
    if (sc.chars && sc.chars.length) {
      // protagonista destacado delante con foco
      if (S.st.mode !== "silhouette") VS.glow(ctx, S.W / 2, S.L.gy - 150 * S.u, 420 * S.u, S.st.accent, 0.3);
      drawCast(S, sc.chars.slice(0, 1).map((c) => Object.assign({ x: 0.5, dy: 30 }, c)), { mult: 1.05 });
    }
    chip(S, sc.chip);
  };

  // Figura alejándose de espaldas (estilo documental)
  SHOTS.walk_away = function (ctx, S) {
    const c = chars(S)[0] || {};
    const s = cscale(S, lerp(1.55, 1.25, S.k));
    const x = S.W * (c.x || 0.47);
    const y = S.L.gy + lerp(160, 60, S.k) * S.u;
    S.actor({ who: c.who, look: c.look, id: 0, x, y, s, dir: 1, action: "walk", back: true, face: "none" });
    chip(S, S.sc.chip);
  };

  // Personaje escribiendo en su escritorio con lámpara (ilustración noir)
  SHOTS.desk = function (ctx, S) {
    const c = chars(S)[0] || {};
    const s = cscale(S, S.L.portrait ? 1.7 : 1.95);
    const x = S.W * (S.L.portrait ? 0.42 : 0.4);
    const deskY = S.L.portrait ? S.H * 0.56 : S.H * 0.6;
    const write = Math.sin(S.T * 9) * 0.06 + Math.sin(S.T * 3.1) * 0.05;
    const pose = VS.blendPose(VS.POSE.sit, VS.POSE.sit, 0);
    pose.aF = [1.05 + write, 1.05 - write];
    pose.aB = [0.85, 1.3];
    pose.lean = 0.28;
    pose.tilt = 0.45;
    S.actor({ who: c.who, look: Object.assign({ downcast: true }, c.look), id: 0, x, y: deskY + 26 * S.u + 64 * s, s, dir: 1, pose, face: c.face || "neutral" });
    // tablero de la mesa (tapa las piernas), con textura
    ctx.save();
    ctx.fillStyle = S.st.desk || mix(S.st.bg, "#8a8484", 0.5);
    ctx.fillRect(-S.W, deskY, S.W * 3, S.H);
    if (S.st.mode === "charcoal" || S.st.mode === "painted") {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = VS.pattern(ctx, "charcoal", 256);
      ctx.fillRect(-S.W, deskY, S.W * 3, S.H);
    }
    ctx.restore();
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(-S.W, deskY, S.W * 3, 6 * S.u);
    // papel y pluma
    const px = x + 150 * s, py = deskY + 70 * S.u;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-0.05);
    ctx.fillStyle = "#e6d6d0";
    ctx.strokeStyle = "rgba(20,15,12,.8)";
    ctx.lineWidth = 2 * S.u;
    ctx.fillRect(-150 * S.u, -40 * S.u, 300 * S.u, 220 * S.u);
    ctx.strokeRect(-150 * S.u, -40 * S.u, 300 * S.u, 220 * S.u);
    const lines = Math.floor(S.lt * 3) + 2;
    ctx.strokeStyle = "rgba(20,15,12,.75)";
    ctx.lineWidth = 4 * S.u;
    for (let i = 0; i < Math.min(8, lines); i++) {
      ctx.beginPath();
      ctx.moveTo(-110 * S.u, i * 22 * S.u);
      ctx.lineTo((-110 + (i === lines - 1 ? (S.lt * 3 % 1) * 200 : 160 + hash(i) * 50)) * S.u, i * 22 * S.u);
      ctx.stroke();
    }
    ctx.restore();
    VS.lamp(ctx, S.st, S.W * (S.L.portrait ? 0.8 : 0.8), deskY + 70 * S.u, S.u * 1.5, S.T, S.pal);
    chip(S, S.sc.chip);
  };

  // Calendario que pasa hojas hasta un año / fecha
  SHOTS.year = function (ctx, S) {
    const sc = S.sc;
    const target = parseInt(sc.year || sc.number || sc.label, 10);
    const isNum = !isNaN(target);
    const flipEnd = Math.min(1.4, S.dur * 0.5);
    const kf = clamp(S.lt / flipEnd);
    const startY = isNum ? target - Math.min(40, Math.max(8, sc.from_back || 20)) : 0;
    const cur = isNum ? Math.round(lerp(startY, target, E.out(kf))) : sc.label || "";
    const cx = S.W / 2, cy = S.L.portrait ? S.H * 0.38 : S.H * 0.42;
    const s = (S.L.portrait ? 2.6 : 2.3) * S.u;
    // hojas volando
    for (let i = 0; i < 9; i++) {
      const ph = (kf * 9 - i);
      if (ph < 0 || ph > 1.6 || kf >= 1) continue;
      ctx.save();
      ctx.translate(cx + ph * (i % 2 ? 1 : -1) * 500 * S.u, cy - ph * 420 * S.u);
      ctx.rotate(ph * (i % 2 ? 2 : -2));
      ctx.globalAlpha *= clamp(1.4 - ph);
      S.prop("calendar", 0, 0, s * 0.8, { text: String(Math.round(lerp(startY, target, i / 9))) });
      ctx.restore();
    }
    const land = kf >= 1 ? E.back(clamp((S.lt - flipEnd) / 0.25)) : 1;
    ctx.save();
    ctx.translate(cx, cy);
    const pop = kf >= 1 ? 1 + 0.18 * decay(S.lt, flipEnd, 0.35) : 1;
    ctx.scale(pop, pop);
    S.prop("calendar", 0, 0, s, { text: String(cur) });
    ctx.restore();
    if (kf >= 1 && S.st.mode !== "doc") VS.glow(ctx, cx, cy, 500 * S.u * land, S.st.accent, 0.18 * decay(S.lt, flipEnd, 1));
    if (sc.label && isNum) slamText(S, sc.label, cx, cy + 330 * S.u * (S.L.portrait ? 1.1 : 0.95), fit(ctx, sc.label.toUpperCase(), 64 * S.u, S.st.fontDisplay, S.W * 0.85), { t0: flipEnd + 0.1, upper: true, color: S.st.accent });
  };

  // Mapa real: zoom del mundo al lugar, país resaltado y chincheta
  SHOTS.map = function (ctx, S) {
    const sc = S.sc;
    let lon = +sc.lon, lat = +sc.lat;
    let country = sc.country ? VS.findCountry(sc.country) : null;
    if ((isNaN(lon) || isNaN(lat)) && country) { lon = country.lp[0]; lat = country.lp[1]; }
    if (isNaN(lon) || isNaN(lat)) { lon = 0; lat = 20; }
    if (!country) country = VS.countryAt(lon, lat);
    const zk = E.io(clamp(S.lt / Math.min(2.2, S.dur * 0.6)));
    const z = lerp(1.1, sc.zoom || 7, zk);
    const clon = lerp(lon * 0.3, lon, zk), clat = lerp(25, lat, zk);
    const pad = 0;
    VS.drawMap(ctx, Object.assign({}, S.st), {
      x: -S.W * 0.1, y: -S.H * 0.1, w: S.W * 1.2, h: S.H * 1.2,
      lon: clon, lat: clat, zoom: z, hi: country, hiK: clamp((zk - 0.5) * 2),
      pin: [lon, lat], pinK: clamp((S.lt - Math.min(2.2, S.dur * 0.6) + 0.2) / 0.5), label: sc.label || sc.place || (country ? country.es : ""),
      labelSize: (S.L.portrait ? 60 : 50) * S.u, T: S.T, vx0: S.W * 0.06, vx1: S.W * 0.94,
      route: sc.from_lon != null ? [[+sc.from_lon, +sc.from_lat], [lon, lat]] : null, routeK: S.k * 1.4,
    });
    chip(S, sc.chip);
  };

  // Número gigante que cuenta (dinero, víctimas, años…)
  SHOTS.number = function (ctx, S) {
    const sc = S.sc;
    const val = parseFloat(String(sc.number || "0").replace(/[^\d.\-]/g, "")) || 0;
    const d = Math.min(1.6, S.dur * 0.6);
    const kk = E.expo(clamp((S.lt - 0.1) / d));
    const v = val * kk;
    const dec = String(sc.number || "").includes(".") ? 1 : 0;
    const str = (sc.prefix || "") + v.toLocaleString("es-ES", { maximumFractionDigits: dec, minimumFractionDigits: dec }) + (sc.suffix || "");
    const cx = S.W / 2, cy = S.L.portrait ? S.H * 0.36 : S.H * 0.42;
    const size = fit(ctx, (sc.prefix || "") + val.toLocaleString("es-ES") + (sc.suffix || ""), (S.L.portrait ? 230 : 260) * S.u, S.st.fontDisplay, S.W * 0.86);
    const done = kk > 0.995;
    const pop = done ? 1 + 0.12 * decay(S.lt, d + 0.1, 0.35) : 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pop, pop);
    VS.text(ctx, str, 0, 0, { size, font: S.st.fontDisplay, color: sc.color === "danger" ? S.st.danger : S.st.accent, shadow: "rgba(0,0,0,.6)", glow: S.st.mode === "neon" ? S.st.accent : null });
    ctx.restore();
    if (sc.prop) S.prop(sc.prop, cx, cy - size * 1.05, 0.9 * S.u);
    if (sc.label) slamText(S, sc.label, cx, cy + size * 0.85, fit(ctx, sc.label.toUpperCase(), 70 * S.u, S.st.fontDisplay, S.W * 0.86), { t0: d * 0.6, upper: true });
    // partículas al terminar
    if (done) for (let i = 0; i < 26; i++) {
      const ph = clamp((S.lt - d - 0.1) / 0.9);
      if (ph >= 1) break;
      const a = (i / 26) * PI * 2;
      ctx.fillStyle = rgba(i % 2 ? S.st.accent : S.st.ink, 1 - ph);
      ctx.fillRect(cx + Math.cos(a) * ph * 520 * S.u, cy + Math.sin(a) * ph * 320 * S.u, 9 * S.u, 9 * S.u);
    }
  };

  // Gráfico de barras o línea
  SHOTS.chart = function (ctx, S) {
    const sc = S.sc, u = S.u;
    const items = (sc.items || []).slice(0, 6).map((it) => (typeof it === "object" ? it : { label: String(it), value: 1 }));
    if (!items.length) return SHOTS.object(ctx, Object.assign(S, { sc: Object.assign({}, sc, { prop: "chart_up" }) }));
    const max = Math.max(...items.map((i) => +i.value || 0), 1);
    const x0 = S.W * 0.12, x1 = S.W * 0.88, yb = S.L.portrait ? S.H * 0.6 : S.H * 0.74, top = S.L.portrait ? S.H * 0.2 : S.H * 0.16;
    const bw = ((x1 - x0) / items.length) * 0.62;
    ctx.strokeStyle = rgba(S.st.ink, 0.5);
    ctx.lineWidth = 4 * u;
    ctx.beginPath(); ctx.moveTo(x0 - 20 * u, yb); ctx.lineTo(x1 + 20 * u, yb); ctx.stroke();
    items.forEach((it, i) => {
      const k = E.out(clamp((S.lt - 0.2 - i * 0.18) / 0.7));
      const h = ((+it.value || 0) / max) * (yb - top) * k;
      const x = x0 + ((i + 0.5) * (x1 - x0)) / items.length;
      const hiI = sc.highlight != null ? +sc.highlight === i : i === items.length - 1;
      ctx.fillStyle = hiI ? S.st.accent : mix(S.st.ink, S.st.bg, 0.45);
      VS.roundRect(ctx, x - bw / 2, yb - h, bw, Math.max(1, h), 8 * u);
      ctx.fill();
      if (k > 0.05) {
        VS.text(ctx, (it.prefix || sc.prefix || "") + Math.round((+it.value || 0) * k).toLocaleString("es-ES") + (it.suffix || sc.suffix || ""), x, yb - h - 40 * u, { size: fit(ctx, String(it.value), 54 * u, S.st.fontDisplay, bw * 1.3), font: S.st.fontDisplay, color: hiI ? S.st.accent : S.st.ink });
        VS.text(ctx, it.label, x, yb + 44 * u, { size: fit(ctx, String(it.label), 34 * u, S.st.font, bw * 1.5, 800), font: S.st.font, weight: 800, color: S.st.ink });
      }
    });
    if (sc.label) slamText(S, sc.label, S.W / 2, top - 70 * u, fit(ctx, sc.label.toUpperCase(), 64 * u, S.st.fontDisplay, S.W * 0.86), { t0: 0.1, upper: true });
  };

  // Pantalla dividida: antes/después, A contra B
  SHOTS.versus = function (ctx, S) {
    const sc = S.sc, u = S.u;
    const items = sc.items && sc.items.length >= 2 ? sc.items : [{ label: sc.left || "ANTES" }, { label: sc.right || "DESPUÉS" }];
    const cs = chars(S);
    const vert = S.L.portrait;
    const k = E.io(clamp(S.lt / 0.5));
    for (let i = 0; i < 2; i++) {
      ctx.save();
      const it = typeof items[i] === "object" ? items[i] : { label: String(items[i]) };
      if (vert) {
        ctx.beginPath(); ctx.rect(-S.W, i ? S.H * 0.48 : -S.H, S.W * 3, i ? S.H * 2 : S.H * 1.48); ctx.clip();
        ctx.translate(0, (i ? 1 : -1) * (1 - k) * S.H * 0.5);
      } else {
        ctx.beginPath(); ctx.rect(i ? S.W / 2 : -S.W, -S.H, S.W * 1.5, S.H * 3); ctx.clip();
        ctx.translate((i ? 1 : -1) * (1 - k) * S.W * 0.5, 0);
      }
      ctx.fillStyle = i ? rgba(S.st.danger, 0.22) : rgba(S.st.cool, 0.22);
      ctx.fillRect(-S.W, -S.H, S.W * 3, S.H * 3);
      const cx = vert ? S.W / 2 : S.W * (i ? 0.75 : 0.25);
      const gy = vert ? (i ? S.H * 0.86 : S.H * 0.42) : S.L.gy;
      if (cs[i]) S.actor({ who: cs[i].who, look: cs[i].look, id: i, x: cx, y: gy, s: cscale(S, vert ? 0.7 : 0.9), dir: i ? -1 : 1, action: cs[i].action || (i ? "sad" : "cheer"), face: cs[i].face });
      else if (it.prop) S.prop(it.prop, cx, vert ? gy - 260 * u : S.H * 0.5, (vert ? 1.6 : 1.9) * u);
      VS.text(ctx, it.label, cx, vert ? gy - (cs[i] ? 520 : 470) * u * 0.85 : S.H * 0.14, { size: fit(ctx, String(it.label).toUpperCase(), 74 * u, S.st.fontDisplay, S.W * (vert ? 0.8 : 0.42)), upper: true, font: S.st.fontDisplay, color: S.st.ink, shadow: "rgba(0,0,0,.6)" });
      ctx.restore();
    }
    // divisor y sello VS
    ctx.fillStyle = S.st.ink;
    if (vert) ctx.fillRect(-S.W, S.H * 0.48 - 3 * u, S.W * 3, 6 * u);
    else ctx.fillRect(S.W / 2 - 3 * u, -S.H, 6 * u, S.H * 3);
    const vk = E.back(clamp((S.lt - 0.45) / 0.3));
    if (vk > 0) {
      ctx.save();
      ctx.translate(S.W / 2, vert ? S.H * 0.48 : S.H * 0.45);
      ctx.scale(vk, vk);
      ctx.rotate(-0.08);
      ctx.fillStyle = S.st.accent;
      ctx.beginPath(); ctx.arc(0, 0, 80 * u, 0, PI * 2); ctx.fill();
      VS.text(ctx, sc.badge || "VS", 0, 4 * u, { size: 70 * u, font: S.st.fontDisplay, color: "#14110f" });
      ctx.restore();
    }
  };

  // Objeto protagonista
  SHOTS.object = function (ctx, S) {
    const sc = S.sc, u = S.u;
    const k = E.back(clamp((S.lt - 0.05) / 0.45));
    const cx = S.W / 2, cy = S.L.portrait ? S.H * 0.38 : S.H * 0.42;
    if (S.st.mode !== "silhouette" && S.st.mode !== "doc") VS.glow(ctx, cx, cy, 600 * u, S.st.accent, 0.22);
    // rayos giratorios
    if (sc.rays !== false && S.st.mode !== "doc") {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(S.T * 0.15);
      ctx.fillStyle = rgba(S.st.accent, 0.07);
      for (let i = 0; i < 12; i++) {
        ctx.rotate(PI / 6);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-90 * u, -1400 * u); ctx.lineTo(90 * u, -1400 * u); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.translate(cx, cy + Math.sin(S.T * 1.7) * 10 * u);
    ctx.rotate(Math.sin(S.T * 1.1) * 0.04);
    ctx.scale(k, k);
    const ok = S.prop(sc.prop || "question", 0, 0, (S.L.portrait ? 2.0 : 1.75) * u * (sc.prop_scale || 1), { text: sc.year || sc.number });
    if (!ok) S.prop("question", 0, 0, 1.7 * u);
    ctx.restore();
    if (sc.label) slamText(S, sc.label, cx, cy + (S.L.portrait ? 380 : 300) * u, fit(ctx, sc.label.toUpperCase(), 78 * u, S.st.fontDisplay, S.W * 0.86), { t0: 0.35, upper: true });
  };

  // Top N: número de ranking + título + objeto
  SHOTS.list = function (ctx, S) {
    const sc = S.sc, u = S.u;
    const rank = sc.rank || sc.number || 1;
    const vert = S.L.portrait;
    const rx = vert ? S.W / 2 : S.W * 0.27, ry = vert ? S.H * 0.22 : S.H * 0.42;
    const k = slamText(S, "#" + rank, rx, ry, (vert ? 300 : 360) * u, { color: S.st.accent, t0: 0, d: 0.3, from: 1.4 });
    if (sc.prop) {
      const pk = E.back(clamp((S.lt - 0.3) / 0.4));
      ctx.save();
      ctx.translate(vert ? S.W / 2 : S.W * 0.68, (vert ? S.H * 0.47 : S.H * 0.38) + Math.sin(S.T * 1.5) * 8 * u);
      ctx.scale(pk, pk);
      S.prop(sc.prop, 0, 0, (vert ? 1.5 : 1.3) * u);
      ctx.restore();
    } else if (chars(S).length) drawCast(S, chars(S).slice(0, 1).map((c) => Object.assign({ x: vert ? 0.5 : 0.68 }, c)));
    if (sc.label) {
      const lines = VS.wrap(ctx, sc.label.toUpperCase(), 80 * u, S.st.fontDisplay, vert ? S.W * 0.86 : S.W * 0.4);
      lines.slice(0, 3).forEach((l, i) => slamText(S, l, vert ? S.W / 2 : S.W * 0.68, (vert ? S.H * 0.63 : S.H * 0.68) + i * 90 * u, fit(ctx, l, 80 * u, S.st.fontDisplay, vert ? S.W * 0.86 : S.W * 0.42), { t0: 0.45 + i * 0.12 }));
    }
  };

  // Cita textual palabra a palabra
  SHOTS.quote = function (ctx, S) {
    const sc = S.sc, u = S.u;
    const q = String(sc.quote || sc.label || "");
    const vert = S.L.portrait;
    const fs = (vert ? 74 : 70) * u;
    const lines = VS.wrap(ctx, q, fs, S.st.fontSerif || "EB Garamond", S.W * (vert ? 0.8 : 0.7), 700);
    const lh = fs * 1.25;
    const y0 = (vert ? S.H * 0.36 : S.H * 0.42) - ((lines.length - 1) * lh) / 2;
    VS.text(ctx, "“", S.W * (vert ? 0.14 : 0.16), y0 - 70 * u, { size: 260 * u, font: S.st.fontSerif || "EB Garamond", color: S.st.accent, weight: 700 });
    let wi = 0;
    const words = q.split(/\s+/).length;
    const per = Math.min(0.28, (S.dur * 0.8) / Math.max(1, words));
    lines.forEach((l, li) => {
      const ws = l.split(" ");
      ctx.save();
      ctx.font = `700 ${fs}px "${S.st.fontSerif || "EB Garamond"}"`;
      const total = ctx.measureText(l).width;
      let x = S.W / 2 - total / 2;
      for (const w of ws) {
        const k = clamp((S.lt - 0.2 - wi * per) / 0.18);
        const ww = ctx.measureText(w + " ").width;
        if (k > 0) {
          ctx.globalAlpha = k;
          ctx.fillStyle = S.st.ink;
          ctx.textBaseline = "middle";
          ctx.fillText(w, x, y0 + li * lh + (1 - k) * 12 * u);
        }
        x += ww;
        wi++;
      }
      ctx.restore();
    });
    if (sc.author) slamText(S, "— " + sc.author, S.W / 2, y0 + lines.length * lh + 50 * u, 44 * u, { font: S.st.font, weight: 800, t0: 0.4 + words * per, color: S.st.accent, upper: true, from: 0.2 });
  };

  // Peligro: una sombra gigante (la Muerte, un monstruo) se alza detrás
  SHOTS.danger = function (ctx, S) {
    const sc = S.sc, u = S.u;
    const rise = E.out(clamp((S.lt - 0.2) / Math.min(1.4, S.dur * 0.6)));
    const kind = sc.creature || "reaper";
    const bx = S.W * (S.L.portrait ? 0.62 : 0.66);
    if (S.st.mode !== "silhouette") VS.glow(ctx, bx, S.L.gy - 300 * u, 700 * u, S.st.danger, 0.35 * rise * (0.8 + 0.2 * Math.sin(S.T * 5)));
    const bs = cscale(S, 1) * (S.L.portrait ? 1.05 : 1.2) * (kind === "monster" ? 0.85 : 1);
    VS.drawActor(ctx, S.st, { x: bx, y: S.L.gy + (1 - rise) * 600 * u, s: bs, dir: -1, look: { kind }, T: S.T, alpha: rise, pose: VS.poseFor("idle", S.lt, S.T, 3) });
    const hero = chars(S)[0] || { action: "scared" };
    drawCast(S, [Object.assign({ x: S.L.portrait ? 0.3 : 0.3, dir: 1 }, hero, { action: hero.action || "scared", face: hero.face || "scared" })], { mult: 0.8 });
    chip(S, sc.chip);
  };

  // Revelación: un foco recorre la oscuridad y descubre al protagonista
  SHOTS.reveal = function (ctx, S) {
    const sc = S.sc, u = S.u;
    if (chars(S).length) drawCast(S, chars(S));
    else if (sc.prop) S.prop(sc.prop, S.W / 2, S.L.portrait ? S.H * 0.4 : S.H * 0.45, 1.6 * u);
    const k = E.io(clamp(S.lt / Math.min(1.5, S.dur * 0.6)));
    const sx = lerp(S.W * 0.1, S.W / 2, k), sy = S.L.portrait ? S.H * 0.45 : S.H * 0.5;
    const r = lerp(180, 520, E.out(clamp((S.lt - 0.6) / 0.8))) * u;
    ctx.save();
    const g = ctx.createRadialGradient(sx, sy, r * 0.55, sx, sy, r * 1.2);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,.92)");
    ctx.fillStyle = g;
    ctx.fillRect(-S.W, -S.H, S.W * 3, S.H * 3);
    ctx.restore();
    if (sc.label) slamText(S, sc.label, S.W / 2, S.L.portrait ? S.H * 0.17 : S.H * 0.14, fit(ctx, sc.label.toUpperCase(), 90 * u, S.st.fontDisplay, S.W * 0.86), { t0: Math.min(1.5, S.dur * 0.6), upper: true, color: S.st.accent });
  };

  // Retrato enmarcado con placa de nombre (presentación de personaje)
  SHOTS.portrait = function (ctx, S) {
    const sc = S.sc, u = S.u;
    const c = chars(S)[0] || {};
    const vert = S.L.portrait;
    const fw = (vert ? 620 : 520) * u, fh = (vert ? 760 : 640) * u;
    const cx = S.W / 2, cy = vert ? S.H * 0.38 : S.H * 0.44;
    const k = E.back(clamp(S.lt / 0.45));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(lerp(0.8, 1, k), lerp(0.8, 1, k));
    ctx.globalAlpha *= clamp(k * 2);
    ctx.shadowColor = "rgba(0,0,0,.6)";
    ctx.shadowBlur = 40 * u;
    ctx.fillStyle = S.st.mode === "silhouette" ? S.st.ink : "#7a5a26";
    ctx.fillRect(-fw / 2 - 30 * u, -fh / 2 - 30 * u, fw + 60 * u, fh + 60 * u);
    ctx.shadowBlur = 0;
    ctx.fillStyle = S.st.accent;
    ctx.fillRect(-fw / 2 - 14 * u, -fh / 2 - 14 * u, fw + 28 * u, fh + 28 * u);
    ctx.fillStyle = mix(S.st.bg, S.st.ink, 0.12);
    ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
    ctx.beginPath(); ctx.rect(-fw / 2, -fh / 2, fw, fh); ctx.clip();
    { const ps = cscale(S, 1) * (fh / (S.L.portrait ? S.H * 0.31 : S.H * 0.47)) * 1.55;
      const headTop = (isFig(S) ? 284 : 233) * ps;
      S.actor({ who: c.who, look: c.look, id: 0, x: 0, y: -fh / 2 + fh * 0.1 + headTop, s: ps, dir: c.dir || 1, action: "idle", face: c.face || "determined" }); }
    // brillo que barre el cristal
    const sh = ((S.lt - 0.5) / 1.2);
    if (sh > 0 && sh < 1) {
      ctx.fillStyle = "rgba(255,255,255,.18)";
      ctx.beginPath();
      const xx = lerp(-fw, fw, sh);
      ctx.moveTo(xx, -fh / 2); ctx.lineTo(xx + 90 * u, -fh / 2); ctx.lineTo(xx - 110 * u, fh / 2); ctx.lineTo(xx - 200 * u, fh / 2);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    const name = sc.label || (c.who && S.cast[c.who] && S.cast[c.who].name) || "";
    if (name) {
      const pk = E.out(clamp((S.lt - 0.4) / 0.35));
      const fs = fit(ctx, name.toUpperCase(), 64 * u, S.st.fontDisplay, fw + 80 * u);
      const py = cy + fh / 2 + 90 * u;
      ctx.save();
      ctx.globalAlpha *= pk;
      ctx.fillStyle = "#1a1410";
      ctx.fillRect(cx - (fw + 60 * u) / 2 * pk, py - fs * 0.75, (fw + 60 * u) * pk, fs * 1.5);
      ctx.restore();
      if (pk > 0.6) VS.text(ctx, name, cx, py, { size: fs, upper: true, font: S.st.fontDisplay, color: S.st.accent });
      if (sc.sub) slamText(S, sc.sub, cx, py + fs * 1.3, 38 * u, { font: S.st.font, weight: 700, t0: 0.8, from: 0.2, upper: true });
    }
  };

  // Línea de tiempo con hitos
  SHOTS.timeline = function (ctx, S) {
    const sc = S.sc, u = S.u;
    const items = (sc.items || []).slice(0, 6).map((it) => (typeof it === "object" ? it : { label: String(it) }));
    if (!items.length) return;
    const vert = S.L.portrait;
    const span = vert ? S.H * 0.6 : S.W * 0.84;
    const st0 = vert ? S.H * 0.15 : S.W * 0.08;
    const k = E.io(clamp(S.lt / Math.max(1, S.dur * 0.8)));
    ctx.strokeStyle = rgba(S.st.ink, 0.6);
    ctx.lineWidth = 6 * u;
    ctx.beginPath();
    if (vert) { ctx.moveTo(S.W * 0.25, st0); ctx.lineTo(S.W * 0.25, st0 + span * k); }
    else { ctx.moveTo(st0, S.H * 0.5); ctx.lineTo(st0 + span * k, S.H * 0.5); }
    ctx.stroke();
    items.forEach((it, i) => {
      const p = (i + 0.5) / items.length;
      if (p > k + 0.02) return;
      const pk = E.back(clamp((k - p) * 6 + 0.3));
      const x = vert ? S.W * 0.25 : st0 + span * p, y = vert ? st0 + span * p : S.H * 0.5;
      ctx.fillStyle = i === items.length - 1 ? S.st.accent : S.st.ink;
      ctx.beginPath(); ctx.arc(x, y, 18 * u * pk, 0, PI * 2); ctx.fill();
      const big = it.year || it.date || "";
      if (vert) {
        if (big) VS.text(ctx, big, x + 60 * u, y - 30 * u, { size: 64 * u, align: "left", font: S.st.fontDisplay, color: S.st.accent });
        VS.text(ctx, it.label, x + 60 * u, y + (big ? 30 : 0) * u, { size: fit(ctx, it.label, 40 * u, S.st.font, S.W * 0.62, 800), align: "left", font: S.st.font, weight: 800, color: S.st.ink });
      } else {
        const up = i % 2 === 0;
        if (big) VS.text(ctx, big, x, y + (up ? -110 : 110) * u, { size: 60 * u, font: S.st.fontDisplay, color: S.st.accent });
        VS.text(ctx, it.label, x, y + (up ? -50 : 170) * u, { size: fit(ctx, it.label, 34 * u, S.st.font, span / items.length * 0.95, 800), font: S.st.font, weight: 800, color: S.st.ink });
      }
    });
  };

  // Montaje rápido de objetos
  SHOTS.montage = function (ctx, S) {
    const sc = S.sc, u = S.u;
    const items = (sc.items && sc.items.length ? sc.items : [sc.prop || "question"]).slice(0, 5).map((it) => (typeof it === "object" ? it : { prop: String(it) }));
    const n = items.length;
    const i = Math.min(n - 1, Math.floor((S.lt / S.dur) * n));
    const lt = S.lt - (i * S.dur) / n;
    const it = items[i];
    const k = E.back(clamp(lt / 0.25));
    const cx = S.W / 2, cy = S.L.portrait ? S.H * 0.4 : S.H * 0.42;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(k * (1 + lt * 0.05), k * (1 + lt * 0.05));
    ctx.rotate((i % 2 ? 1 : -1) * 0.05);
    if (!S.prop(it.prop || it.label, 0, 0, 1.7 * u)) VS.text(ctx, it.label || it.prop, 0, 0, { size: 120 * u, font: S.st.fontDisplay, color: S.st.accent, upper: true });
    ctx.restore();
    if (it.label && it.prop) VS.text(ctx, it.label, cx, cy + 300 * u, { size: fit(ctx, it.label.toUpperCase(), 70 * u, S.st.fontDisplay, S.W * 0.86), upper: true, font: S.st.fontDisplay, color: S.st.ink, shadow: "rgba(0,0,0,.6)" });
    const f = decay(lt, 0, 0.12);
    if (i > 0 && f > 0) { ctx.fillStyle = rgba("#fff", 0.6 * f); ctx.fillRect(-S.W, -S.H, S.W * 3, S.H * 3); }
  };

  // Explosión / impacto
  SHOTS.explosion = function (ctx, S) {
    const sc = S.sc, u = S.u;
    const cx = S.W / 2, cy = S.L.portrait ? S.H * 0.45 : S.L.gy - 160 * u;
    const tb = Math.min(0.6, S.dur * 0.3);
    if (S.lt < tb) {
      ctx.save();
      ctx.translate(cx + (hash(Math.floor(S.T * 30)) - 0.5) * 16 * u * (S.lt / tb), cy);
      S.prop(sc.prop || "bomb", 0, 0, 1.6 * u * (1 + S.lt * 0.3));
      ctx.restore();
      return;
    }
    const k = clamp((S.lt - tb) / 1.2);
    VS.glow(ctx, cx, cy, (300 + k * 900) * u, "#ffb43a", 0.9 * (1 - k));
    for (let r = 0; r < 3; r++) {
      ctx.strokeStyle = rgba("#fff3c0", (1 - k) * 0.8);
      ctx.lineWidth = (30 - r * 8) * u * (1 - k);
      ctx.beginPath(); ctx.ellipse(cx, cy, (k * 900 - r * 80) * u, (k * 500 - r * 50) * u, 0, 0, PI * 2); ctx.stroke();
    }
    for (let i = 0; i < 30; i++) {
      const a = hash(i) * PI * 2, sp = 400 + hash(i * 2) * 900;
      const x = cx + Math.cos(a) * sp * k * u, y = cy + Math.sin(a) * sp * k * u + k * k * 400 * u;
      ctx.fillStyle = i % 3 ? "#2a2522" : "#ff6a2a";
      ctx.fillRect(x, y, 16 * u, 16 * u);
    }
    for (let i = 0; i < 10; i++) {
      const ph = clamp(k + hash(i) * 0.3);
      ctx.fillStyle = rgba("#3a332e", 0.5 * (1 - ph * 0.6));
      ctx.beginPath(); ctx.arc(cx + (hash(i * 5) - 0.5) * 600 * u * ph, cy - ph * 300 * u, (80 + ph * 260) * u, 0, PI * 2); ctx.fill();
    }
    if (sc.label) slamText(S, sc.label, cx, S.L.portrait ? S.H * 0.2 : S.H * 0.18, fit(ctx, sc.label.toUpperCase(), 120 * u, S.st.fontDisplay, S.W * 0.86), { t0: tb + 0.1, upper: true, color: S.st.accent });
  };

  // Cierre con llamada a la acción
  SHOTS.end = function (ctx, S) {
    const sc = S.sc, u = S.u;
    const vert = S.L.portrait;
    const title = sc.label || "";
    if (chars(S).length) drawCast(S, chars(S).slice(0, 2), { mult: 0.8 });
    if (title) {
      const fs0 = vert ? 130 * u : 140 * u;
      const lines = VS.wrap(ctx, title.toUpperCase(), fs0, S.st.fontDisplay, S.W * 0.86);
      lines.slice(0, 3).forEach((l, i) => slamText(S, l, S.W / 2, (vert ? S.H * 0.2 : S.H * 0.22) + i * fs0 * 1.08, fit(ctx, l, fs0, S.st.fontDisplay, S.W * 0.86), { t0: i * 0.15, color: i === lines.length - 1 ? S.st.accent : S.st.ink }));
    }
    const cta = sc.cta || "SUSCRÍBETE";
    const bk = E.back(clamp((S.lt - 0.6) / 0.35));
    if (bk > 0 && cta) {
      const bx = S.W / 2, by = vert ? S.H * 0.52 : S.H * 0.56;
      const click = bump(S.lt, 1.3, 0.25);
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(bk * (1 - click * 0.08), bk * (1 - click * 0.08));
      const fs = 56 * u;
      ctx.font = `900 ${fs}px "${S.st.font}"`;
      const tw = ctx.measureText(cta).width;
      const done = S.lt > 1.42;
      ctx.fillStyle = done ? "#3a3a3a" : "#e62117";
      VS.roundRect(ctx, -tw / 2 - 50 * u, -fs * 0.9, tw + 100 * u, fs * 1.8, 16 * u);
      ctx.fill();
      VS.text(ctx, done ? "✓ " + cta : cta, 0, 2 * u, { size: fs, font: S.st.font, weight: 900, color: "#fff" });
      ctx.restore();
      if (S.lt > 0.9 && S.lt < 1.6) {
        const ck = E.io(clamp((S.lt - 0.9) / 0.4));
        const mx = lerp(bx + 300 * u, bx + 40 * u, ck), my = lerp(by + 200 * u, by + 20 * u, ck);
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 3 * u;
        ctx.beginPath();
        ctx.moveTo(mx, my); ctx.lineTo(mx, my + 60 * u); ctx.lineTo(mx + 16 * u, my + 46 * u); ctx.lineTo(mx + 30 * u, my + 72 * u); ctx.lineTo(mx + 40 * u, my + 66 * u); ctx.lineTo(mx + 26 * u, my + 42 * u); ctx.lineTo(mx + 46 * u, my + 40 * u);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
  };

  /* ---------- tipografía cinética ---------- */
  // sc.lines = [{text, accent, size}]  sc.variant = stack | slam | type   sc.badge = "MÁS"
  SHOTS.kinetic = SHOTS.title = function (ctx, S) {
    const sc = S.sc, u = S.u;
    if (sc.bg === "water" || (!sc.env && sc.bg !== "env")) VS.waterBg(ctx, Object.assign({}, S.L), S.T, sc.bgCol || S.st.kineticBg);
    let lines = sc.lines && sc.lines.length ? sc.lines.map((l) => (typeof l === "object" ? l : { text: String(l) })) : String(sc.label || sc.narration || "").split(/\s*\/\s*|\n/).filter(Boolean).map((t) => ({ text: t }));
    if (!lines.length) return;
    const variant = sc.variant || ["stack", "slam", "stack"][S.seed % 3];
    const font = S.st.fontKinetic || "League Gothic";
    const vert = S.L.portrait;
    const maxW = S.W * (vert ? 0.78 : 0.62);
    if (variant === "slam") {
      // una línea a la vez, la siguiente expulsa a la anterior
      const per = S.dur / lines.length;
      const i = Math.min(lines.length - 1, Math.floor(S.lt / per));
      const lt = S.lt - i * per;
      const l = lines[i];
      const size = fit(ctx, l.text.toUpperCase(), (vert ? 300 : 280) * u, font, S.W * 0.86, 400);
      const k = E.out(clamp(lt / 0.2));
      const shake = decay(lt, 0.12, 0.3) * 14 * u;
      ctx.save();
      ctx.translate(S.W / 2 + (hash(Math.floor(S.T * 30)) - 0.5) * shake, S.H * (vert ? 0.42 : 0.46));
      const sc2 = lerp(2.2, 1, k);
      ctx.scale(sc2, sc2);
      ctx.globalAlpha *= k;
      VS.text(ctx, l.text, 0, 0, { size, upper: true, font, weight: 400, color: l.accent ? S.st.accent : "#f4f2ee", shadow: "rgba(0,0,0,.5)", sy: size * 0.04 });
      ctx.restore();
      if (i > 0 && lt < 0.18) {
        const p = lines[i - 1];
        const ps = fit(ctx, p.text.toUpperCase(), (vert ? 300 : 280) * u, font, S.W * 0.86, 400);
        ctx.save();
        ctx.globalAlpha *= 1 - lt / 0.18;
        ctx.filter = `blur(${Math.round((lt / 0.18) * 14)}px)`;
        VS.text(ctx, p.text, S.W / 2, S.H * (vert ? 0.42 : 0.46) - (lt / 0.18) * 300 * u, { size: ps, upper: true, font, weight: 400, color: "#f4f2ee" });
        ctx.restore();
      }
      return;
    }
    if (variant === "type") {
      const full = lines.map((l) => l.text).join(" ");
      const n = Math.floor(clamp(S.lt / Math.max(0.6, S.dur * 0.7)) * full.length);
      const fs = (vert ? 92 : 84) * u;
      const wl = VS.wrap(ctx, full.toUpperCase(), fs, S.st.font, S.W * 0.82, 900);
      let left = n;
      const y0 = S.H * (vert ? 0.38 : 0.42) - ((wl.length - 1) * fs * 1.2) / 2;
      wl.forEach((l, i) => {
        const part = l.slice(0, Math.max(0, left));
        left -= l.length + 1;
        VS.text(ctx, part + (left < 0 && left > -l.length - 2 && Math.floor(S.T * 2) % 2 ? "▍" : ""), S.W * 0.09, y0 + i * fs * 1.2, { size: fs, font: S.st.font, weight: 900, align: "left", color: "#f4f2ee" });
      });
      return;
    }
    // "stack": líneas apiladas de tamaños distintos que llenan el ancho (estilo póster)
    // cada línea se ajusta para llenar el ancho (palabras cortas = gigantes), con tope
    const cap = (vert ? 520 : 400) * u;
    const sizes = lines.map((l, i) => {
      const base = l.size ? l.size * u : cap;
      const f = fit(ctx, l.text.toUpperCase(), 2000 * u, font, maxW, 400);
      return Math.max(70 * u, Math.min(base, f, i === 0 && lines.length > 2 ? cap * 0.55 : cap));
    });
    let tot = sizes.reduce((a, b) => a + b * 0.98, 0);
    const maxH = S.H * (vert ? 0.5 : 0.78);
    if (tot > maxH) for (let i = 0; i < sizes.length; i++) sizes[i] *= maxH / tot;
    const gap = 0.06;
    const total = sizes.reduce((a, b) => a + b * (0.92 + gap), 0);
    let y = S.H * (vert ? 0.4 : 0.47) - total / 2;
    const x0 = S.W / 2 - maxW / 2;
    lines.forEach((l, i) => {
      const fs = sizes[i];
      y += fs * 0.46;
      const t0 = 0.08 + i * Math.min(0.35, (S.dur * 0.5) / lines.length);
      const k = E.out(clamp((S.lt - t0) / 0.22));
      if (k > 0) {
        ctx.save();
        ctx.globalAlpha *= k;
        ctx.translate(x0, y);
        if (k < 1) ctx.filter = `blur(${Math.round((1 - k) * 8)}px)`;
        ctx.translate(0, (1 - k) * 30 * u);
        VS.text(ctx, l.text, 0, 0, { size: fs, upper: true, font, weight: 400, align: "left", color: l.accent ? S.st.accent : "#f6f4ef", shadow: "rgba(0,0,0,.35)", sy: fs * 0.03 });
        ctx.restore();
      }
      if (i === lines.length - 1 && sc.badge) {
        const bk = E.back(clamp((S.lt - t0 - 0.35) / 0.3));
        if (bk > 0) {
          const w = VS.measure(ctx, l.text.toUpperCase(), fs, font, 400);
          const r = Math.max(70 * u, fs * 0.32);
          ctx.save();
          ctx.translate(x0 + Math.min(w, maxW) + r * 0.15, y + fs * 0.12);
          ctx.scale(bk, bk);
          ctx.fillStyle = S.st.accent;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, PI * 2); ctx.fill();
          VS.text(ctx, sc.badge, 0, 2 * u, { size: fit(ctx, sc.badge.toUpperCase(), r * 0.55, S.st.font, r * 1.6, 800), upper: true, font: S.st.font, weight: 800, color: "#141414" });
          ctx.restore();
        }
      }
      y += fs * (0.46 + gap);
    });
    if (sc.handle) VS.text(ctx, sc.handle, S.W / 2, S.H * (vert ? 0.66 : 0.9), { size: 38 * u, font: S.st.font, weight: 700, color: "#f4f2ee" });
  };

  // plano de viaje: mismo que escena con desplazamiento
  SHOTS.travel = function (ctx, S) {
    const cs = chars(S).map((c) => Object.assign({ travel: "across" }, c));
    drawCast(S, cs);
    chip(S, S.sc.chip);
  };

  VS.SHOT_LIST = Object.keys(SHOTS);
})();
