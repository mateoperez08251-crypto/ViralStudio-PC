/* ==========================================================================
   VIRAL STUDIO ENGINE — director
   Une escenas en una película: cámara virtual, parallax, transiciones,
   luz de ambiente, clima y acabado de película. Es la única pieza que el
   capítulo de HyperFrames llama: VS.film(canvas, data).render(t)
   ========================================================================== */
(function () {
  "use strict";
  const VS = window.VS;
  const { clamp, lerp, hash, mix, rgba, shade, rng, E, decay, bump, strSeed } = VS;
  const PI = Math.PI;

  /* ---------- presets de cámara ---------- */
  // devuelven {z, x, y, r} en función del progreso k (0..1) y tiempo local
  const CAMS = {
    static: (k, lt) => ({ z: 1.03 + k * 0.012, x: 0, y: 0, r: 0 }),
    push_in: (k) => ({ z: 1.0 + E.io(k) * 0.14, x: 0, y: -E.io(k) * 0.01, r: 0 }),
    slow_push: (k) => ({ z: 1.02 + k * 0.07, x: 0, y: 0, r: 0 }),
    pull_out: (k) => ({ z: 1.2 - E.out(k) * 0.17, x: 0, y: 0, r: 0 }),
    pan_left: (k) => ({ z: 1.12, x: lerp(0.045, -0.045, E.io(k)), y: 0, r: 0 }),
    pan_right: (k) => ({ z: 1.12, x: lerp(-0.045, 0.045, E.io(k)), y: 0, r: 0 }),
    tilt_up: (k) => ({ z: 1.12, x: 0, y: lerp(0.05, -0.04, E.io(k)), r: 0 }),
    tilt_down: (k) => ({ z: 1.12, x: 0, y: lerp(-0.04, 0.05, E.io(k)), r: 0 }),
    dolly_left: (k) => ({ z: 1.04 + E.io(k) * 0.1, x: lerp(0.03, -0.03, E.io(k)), y: 0, r: 0 }),
    dolly_right: (k) => ({ z: 1.04 + E.io(k) * 0.1, x: lerp(-0.03, 0.03, E.io(k)), y: 0, r: 0 }),
    crash_zoom: (k, lt) => ({ z: 1 + E.expo(clamp(lt / 0.35)) * 0.32 + k * 0.03, x: 0, y: -0.02 * E.expo(clamp(lt / 0.35)), r: 0 }),
    dutch: (k) => ({ z: 1.12 + k * 0.04, x: 0, y: 0, r: lerp(-0.035, -0.06, k) }),
    handheld: (k, lt) => ({ z: 1.08, x: Math.sin(lt * 1.3) * 0.006 + Math.sin(lt * 2.9) * 0.003, y: Math.cos(lt * 1.7) * 0.005, r: Math.sin(lt * 1.1) * 0.004 }),
    orbit: (k) => ({ z: 1.1, x: Math.sin(k * PI) * 0.03, y: 0, r: Math.sin(k * PI * 2) * 0.012 }),
  };
  VS.CAMS = CAMS;

  /* ---------- capa de acabado (grano, viñeta, texturas) ---------- */
  function makeVignette(W, H, amt) {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${amt})`);
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    return c;
  }

  VS.film = function (canvas, data) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const portrait = H > W;
    const u = Math.min(W, H) / 1080;
    const L = { W, H, portrait, u, gy: portrait ? H * 0.64 : H * 0.8, cx: W / 2 };
    const st = Object.assign({}, VS.STYLE_BASE, data.style || {});
    if (data.style && data.style.fontDisplay) st.fontDisplay = data.style.fontDisplay;
    const scenes = (data.scenes || []).map((s, i) => Object.assign({ i, id: s.id || "s" + i, seed: strSeed((s.id || "s") + i + (data.seed || 0)) }, s));
    const cast = data.cast || {};
    const emph = (data.emph || []).slice().sort((a, b) => a - b);
    const vign = makeVignette(W, H, st.vignette == null ? 0.55 : st.vignette);
    const bgCache = {};
    const buf = document.createElement("canvas");
    buf.width = W; buf.height = H;
    const bctx = buf.getContext("2d");
    const buf2 = document.createElement("canvas");
    buf2.width = W; buf2.height = H;
    const b2 = buf2.getContext("2d");
    const snapCur = () => { b2.setTransform(1, 0, 0, 1, 0, 0); b2.clearRect(0, 0, W, H); b2.drawImage(canvas, 0, 0); return buf2; };
    const grainC = VS.texture("grain", 256);

    function sceneAt(t) {
      let lo = 0, hi = scenes.length - 1, ans = 0;
      while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (scenes[m].start <= t + 1e-6) { ans = m; lo = m + 1; } else hi = m - 1;
      }
      return ans;
    }

    function sceneStyle(sc) {
      if (!sc._st) {
        sc._st = Object.assign({}, st, sc.style || {});
        sc._pal = VS.envPalette(sc._st, sc.time || st.time || "night", sc.mood);
      }
      return sc._st;
    }

    /* fondo estático cacheado (más grande que el cuadro para parallax) */
    function background(sc) {
      if (bgCache[sc.id]) return bgCache[sc.id];
      const s = sceneStyle(sc), pal = sc._pal;
      const env = VS.ENV[VS.envName(sc.env)] || VS.ENV.void;
      const pad = 0.12;
      const c = document.createElement("canvas");
      c.width = Math.ceil(W * (1 + pad * 2));
      c.height = Math.ceil(H * (1 + pad * 2));
      const x = c.getContext("2d");
      x.translate(W * pad, H * pad);
      env.s(x, s, L, pal, rng(sc.seed), sc.seed);
      x.setTransform(1, 0, 0, 1, 0, 0);
      // profundidad de campo: fondo desenfocado en primeros planos y retratos
      if ((sc.shot === "closeup" || sc.shot === "portrait" || sc.dof) && s.mode !== "doc") {
        const cb = document.createElement("canvas");
        cb.width = c.width; cb.height = c.height;
        const xb = cb.getContext("2d");
        xb.filter = `blur(${Math.round(9 * u)}px)`;
        xb.drawImage(c, 0, 0);
        x.clearRect(0, 0, c.width, c.height);
        x.drawImage(cb, 0, 0);
      }
      // acabados por estilo
      if (s.mode === "doc") {
        const c2 = document.createElement("canvas");
        c2.width = c.width; c2.height = c.height;
        const x2 = c2.getContext("2d");
        x2.filter = `blur(${Math.round(7 * u)}px) sepia(0.85) contrast(0.9) brightness(1.05)`;
        x2.drawImage(c, 0, 0);
        x2.filter = "none";
        x2.globalCompositeOperation = "soft-light";
        x2.fillStyle = "#b48a52";
        x2.fillRect(0, 0, c2.width, c2.height);
        x2.globalCompositeOperation = "source-over";
        // niebla clara en el suelo
        const g = x2.createLinearGradient(0, H * pad + L.gy - 300 * u, 0, c2.height);
        g.addColorStop(0, "rgba(214,196,160,0)");
        g.addColorStop(1, "rgba(214,196,160,.55)");
        x2.fillStyle = g;
        x2.fillRect(0, 0, c2.width, c2.height);
        return (bgCache[sc.id] = c2);
      }
      if (s.mode === "charcoal" || s.mode === "painted") {
        x.globalAlpha = 0.55;
        x.fillStyle = x.createPattern(VS.texture("brush", 512), "repeat");
        x.fillRect(0, 0, c.width, c.height);
        x.globalAlpha = s.mode === "charcoal" ? 0.4 : 0.22;
        x.fillStyle = x.createPattern(VS.texture("charcoal", 256), "repeat");
        x.fillRect(0, 0, c.width, c.height);
        x.globalAlpha = 1;
        if (s.mode === "charcoal") {
          const c2 = document.createElement("canvas");
          c2.width = c.width; c2.height = c.height;
          const x2 = c2.getContext("2d");
          x2.filter = `saturate(${s.saturate == null ? 0.25 : s.saturate}) contrast(1.08)`;
          x2.drawImage(c, 0, 0);
          return (bgCache[sc.id] = c2);
        }
      }
      if (s.texture === "paper" || s.mode === "puppet") {
        x.globalCompositeOperation = "multiply";
        x.globalAlpha = 0.35;
        x.fillStyle = x.createPattern(VS.texture("paper", 256), "repeat");
        x.fillRect(0, 0, c.width, c.height);
        x.globalAlpha = 1;
        x.globalCompositeOperation = "source-over";
      }
      return (bgCache[sc.id] = c);
    }

    function camFor(sc, lt) {
      const dur = sc.dur || 3;
      const k = clamp(lt / dur);
      const name = sc.cam && CAMS[sc.cam] ? sc.cam : VS.defaultCam(sc);
      const c = CAMS[name](k, lt);
      // golpe de entrada (punch-in de corte)
      if (sc.punch !== false) c.z += 0.045 * decay(lt, 0, 0.32);
      // sacudidas
      let shake = 0;
      if (sc.sfx === "impact" || sc.sfx === "boom" || sc.shake) shake += 22 * decay(lt, 0, 0.5);
      if (sc.mood === "fear" || sc.mood === "danger" || sc.mood === "tension") shake += 1.6;
      for (const e of sc.hits || []) shake += 18 * decay(lt, e, 0.4);
      if (shake > 0) {
        const f = Math.floor((sc.start + lt) * 30);
        c.x += ((hash(f * 1.3) - 0.5) * shake * u) / W;
        c.y += ((hash(f * 2.7) - 0.5) * shake * u) / H;
        c.r += (hash(f * 3.1) - 0.5) * shake * 0.0006;
      }
      return c;
    }
    function emphPunch(t) {
      let z = 0;
      for (let i = 0; i < emph.length; i++) {
        const e = emph[i];
        if (e > t) break;
        if (t - e < 0.3) z += 0.028 * Math.pow(1 - (t - e) / 0.3, 2);
      }
      return z;
    }

    /* dibuja una escena completa (sin acabado global) */
    function drawScene(c, sc, lt, t) {
      const s = sceneStyle(sc), pal = sc._pal;
      const T = s.step ? Math.floor(t * s.step) / s.step : t;
      const cam = camFor(sc, lt);
      cam.z += emphPunch(t);
      c.save();
      c.fillStyle = s.bg;
      c.fillRect(0, 0, W, H);
      // fondo con parallax suave
      const bg = background(sc);
      c.save();
      c.translate(W / 2, H / 2);
      c.rotate(cam.r * 0.5);
      const bz = 1 + (cam.z - 1) * 0.55;
      c.scale(bz, bz);
      c.translate(-W / 2 - cam.x * W * 0.45, -H / 2 - cam.y * H * 0.45);
      c.drawImage(bg, -W * 0.12, -H * 0.12);
      const env = VS.ENV[VS.envName(sc.env)];
      if (env && env.d) env.d(c, s, L, T, pal);
      c.restore();
      // primer plano con cámara completa
      c.save();
      c.translate(W / 2, H / 2);
      c.rotate(cam.r);
      c.scale(cam.z, cam.z);
      c.translate(-W / 2 - cam.x * W, -H / 2 - cam.y * H);
      const shot = VS.SHOTS[sc.shot] || VS.SHOTS.scene;
      shot(c, makeShotCtx(c, sc, lt, T, s, pal));
      c.restore();
      // luz principal (claroscuro): oscurece lejos de la fuente
      const key = sc.key || (env && env.key) || s.keyLight;
      if (key && s.mode !== "silhouette") {
        const kx = (key.x == null ? 0.7 : key.x) * W, ky = (key.y == null ? 0.4 : key.y) * H;
        const g = c.createRadialGradient(kx, ky, Math.min(W, H) * 0.08, kx, ky, Math.max(W, H) * (key.r || 0.9));
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, `rgba(0,0,0,${key.dark == null ? 0.55 : key.dark})`);
        c.fillStyle = g;
        c.fillRect(0, 0, W, H);
      }
      // clima y luz de ambiente encima de todo
      VS.weather(c, s, L, T, sc.weather, pal);
      moodLight(c, s, sc, lt, pal);
      c.restore();
    }

    function moodLight(c, s, sc, lt, pal) {
      const m = sc.mood;
      if (s.mode === "doc") return;
      let col = null, a = 0;
      if (m === "fear" || m === "danger") { col = s.danger; a = 0.16; }
      else if (m === "hope" || m === "epic") { col = s.accent; a = 0.1; }
      else if (m === "sad") { col = "#3a5a8a"; a = 0.14; }
      else if (m === "mystery") { col = "#2a4a5a"; a = 0.14; }
      if (col) {
        c.save();
        c.globalCompositeOperation = "soft-light";
        c.fillStyle = rgba(col, a * 3);
        c.fillRect(0, 0, W, H);
        c.restore();
      }
      if (sc.flash || sc.sfx === "impact" || sc.sfx === "boom") {
        const f = decay(lt, 0, 0.22);
        if (f > 0) {
          c.fillStyle = rgba(sc.flashCol || "#ffffff", 0.55 * f);
          c.fillRect(0, 0, W, H);
        }
      }
    }

    /* contexto que reciben los planos */
    function makeShotCtx(c0, sc, lt, T, s, pal) {
      const dur = sc.dur || 3;
      const R = rng(sc.seed + 17);
      const S = {
        sc, lt, T, dur, k: clamp(lt / dur), L, st: s, pal, u, W, H, R, cast, seed: sc.seed,
        actor(o) {
          const id = o.id == null ? 0 : o.id;
          const look = Object.assign({}, (cast[o.who] || {}), o.look || {});
          const action = o.action || "idle";
          const alt = o.lt == null ? lt : o.lt;
          const pose = o.pose || VS.poseFor(action, alt, T, id + (o.who ? strSeed(o.who) % 7 : 0));
          const face = o.face || look.face || VS.ACTION_FACE[action] || "neutral";
          VS.drawActor(this.ctx, s, Object.assign({}, o, { pose, face, look, T, id }));
        },
        prop(name, x, y, sc2, opt) { return VS.drawProp(this.ctx, s, name, x, y, sc2, T, opt); },
        text(str, x, y, o) { VS.text(this.ctx, str, x, y, Object.assign({ font: s.fontDisplay, color: s.ink }, o)); },
      };
      S.ctx = c0;
      return S;
    }

    /* ---------- transiciones ---------- */
    function transition(sc, prev, lt, t) {
      const kind = sc.trans || "cut";
      const d = { cut: 0, flash: 0.25, whip: 0.32, zoom: 0.4, iris: 0.45, dip: 0.3, glitch: 0.25, slide: 0.38, fade: 0.5, burn: 0.45 }[kind] || 0;
      return { kind, d };
    }

    function render(t) {
      t = Math.max(0, t);
      if (!scenes.length) {
        ctx.fillStyle = st.bg;
        ctx.fillRect(0, 0, W, H);
        return;
      }
      const i = sceneAt(t);
      const sc = scenes[i];
      const lt = t - sc.start;
      const prev = i > 0 ? scenes[i - 1] : null;
      const tr = transition(sc, prev, lt, t);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.filter = "none";
      if (prev && tr.d > 0 && lt < tr.d) {
        const k = lt / tr.d;
        // escena anterior congelada en su último instante, en el búfer
        drawScene(bctx, prev, prev.dur - 0.001 + lt * 0.5, t);
        drawScene(ctx, sc, lt, t);
        applyTransition(tr.kind, k, sc);
      } else {
        drawScene(ctx, sc, lt, t);
      }
      finish(t, sc, lt);
    }

    function applyTransition(kind, k, sc) {
      const c = ctx;
      c.save();
      if (kind === "flash") {
        c.globalAlpha = 1 - E.out(k);
        c.drawImage(buf, 0, 0);
        c.globalAlpha = 1;
        c.fillStyle = rgba(sc.flashCol || "#ffffff", 0.9 * (1 - k));
        c.fillRect(0, 0, W, H);
      } else if (kind === "whip") {
        const dir = sc.i % 2 ? -1 : 1;
        if (k < 0.5) {
          const kk = E.in(k * 2);
          c.filter = `blur(${Math.round(30 * kk * u)}px)`;
          c.drawImage(buf, -dir * W * 0.6 * kk, 0);
        } else {
          const kk = 1 - E.out((k - 0.5) * 2);
          const snap = snapCur();
          c.fillStyle = "#000";
          c.fillRect(0, 0, W, H);
          c.filter = `blur(${Math.round(24 * kk * u)}px)`;
          c.drawImage(snap, dir * W * 0.12 * kk, 0);
        }
        c.filter = "none";
      } else if (kind === "zoom") {
        if (k < 0.5) {
          const kk = E.in(k * 2);
          c.translate(W / 2, H / 2);
          c.scale(1 + kk * 0.9, 1 + kk * 0.9);
          c.translate(-W / 2, -H / 2);
          c.filter = `blur(${Math.round(16 * kk * u)}px)`;
          c.drawImage(buf, 0, 0);
        }
        c.filter = "none";
      } else if (kind === "iris") {
        c.globalCompositeOperation = "destination-in";
        const r = Math.hypot(W, H) * 0.55 * E.out(k);
        c.beginPath();
        c.arc(W / 2, H * 0.45, Math.max(1, r), 0, PI * 2);
        c.fill();
        c.globalCompositeOperation = "destination-over";
        c.drawImage(buf, 0, 0);
      } else if (kind === "dip" || kind === "fade") {
        if (kind === "fade") {
          c.globalAlpha = 1 - E.io(k);
          c.drawImage(buf, 0, 0);
        } else {
          const a = k < 0.5 ? E.out(k * 2) : 1 - E.out((k - 0.5) * 2);
          if (k < 0.5) c.drawImage(buf, 0, 0);
          c.globalAlpha = 1;
          c.fillStyle = rgba("#000", a);
          c.fillRect(0, 0, W, H);
        }
      } else if (kind === "slide") {
        const dir = sc.i % 2 ? -1 : 1;
        const kk = E.io(k);
        const snapNew = snapCur();
        c.clearRect(0, 0, W, H);
        c.drawImage(buf, -dir * W * kk, 0);
        c.drawImage(snapNew, dir * W * (1 - kk), 0);
      } else if (kind === "glitch") {
        if (k < 0.6) {
          for (let b = 0; b < 9; b++) {
            const y = hash(b + Math.floor(k * 20)) * H, h = H * (0.03 + hash(b * 3) * 0.08);
            const off = (hash(b * 7 + Math.floor(k * 30)) - 0.5) * W * 0.12;
            c.drawImage(buf, 0, y, W, h, off, y, W, h);
          }
          c.globalCompositeOperation = "screen";
          c.fillStyle = rgba("#ff0040", 0.15 * (1 - k));
          c.fillRect(0, 0, W, H);
        }
      } else if (kind === "burn") {
        c.globalAlpha = 1 - E.io(k);
        c.drawImage(buf, 0, 0);
        c.globalAlpha = 1;
        c.globalCompositeOperation = "lighter";
        VS.glow(c, W * 0.15, H * 0.5, Math.max(W, H) * (0.4 + k), "#ff8a3a", 0.8 * bump(k, 0, 1));
      }
      c.restore();
    }

    function finish(t, sc, lt) {
      const s = sceneStyle(sc);
      const c = ctx;
      const f = Math.floor(t * (s.step || 12));
      c.save();
      // textura de estilo
      if (s.mode === "doc") {
        // polvo y rayas de película antigua
        c.fillStyle = "rgba(20,14,8,.55)";
        for (let i = 0; i < 14; i++) {
          if (hash(i * 13.1 + f * 0.37) > 0.55) continue;
          const x = hash(i + f * 1.7) * W, y = hash(i * 3.3 + f * 0.9) * H;
          c.beginPath();
          c.arc(x, y, (1 + hash(i + f) * 3) * u, 0, PI * 2);
          c.fill();
        }
        if (hash(f * 0.71) > 0.6) {
          const x = hash(f * 1.3) * W;
          c.fillStyle = "rgba(240,230,210,.18)";
          c.fillRect(x, 0, 1.5 * u, H);
        }
        const flick = 0.04 * (hash(f * 0.37) - 0.5);
        c.fillStyle = flick > 0 ? `rgba(255,240,210,${flick})` : `rgba(0,0,0,${-flick})`;
        c.fillRect(0, 0, W, H);
      }
      if (s.texture === "halftone" || s.mode === "comic") {
        c.globalCompositeOperation = "multiply";
        c.globalAlpha = 0.12;
        c.fillStyle = c.createPattern(VS.texture("hatch", 128), "repeat");
        c.fillRect(0, 0, W, H);
        c.globalAlpha = 1;
        c.globalCompositeOperation = "source-over";
      }
      if (s.texture === "scan" || s.mode === "neon") {
        c.fillStyle = "rgba(0,0,0,.18)";
        for (let y = 0; y < H; y += 4 * u) c.fillRect(0, y, W, 1.5 * u);
      }
      if (s.texture === "parchment" || s.mode === "ink") {
        c.globalCompositeOperation = "multiply";
        c.globalAlpha = 0.4;
        c.fillStyle = c.createPattern(VS.texture("paper", 256), "repeat");
        c.fillRect(0, 0, W, H);
        c.globalAlpha = 1;
        c.globalCompositeOperation = "source-over";
      }
      // viñeta
      c.drawImage(vign, 0, 0);
      // grano animado
      const ga = s.grain == null ? 0.06 : s.grain;
      if (ga > 0) {
        // grano de película: grueso (2×) y a 12 cambios por segundo, como el celuloide;
        // además se comprime mucho mejor que un ruido fino distinto en cada cuadro
        const fg = Math.floor(t * 12);
        c.globalAlpha = ga;
        c.globalCompositeOperation = "overlay";
        const ox = Math.floor(hash(fg * 1.13) * 256), oy = Math.floor(hash(fg * 2.71) * 256);
        const gs = Math.max(1, Math.round(2 * u));
        c.scale(gs, gs);
        c.translate(-ox, -oy);
        c.fillStyle = c.createPattern(grainC, "repeat");
        c.fillRect(0, 0, W / gs + 256, H / gs + 256);
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.globalCompositeOperation = "source-over";
        c.globalAlpha = 1;
      }
      if (s.letterbox && !portrait) {
        c.fillStyle = "#000";
        const h = H * s.letterbox;
        c.fillRect(0, 0, W, h);
        c.fillRect(0, H - h, W, h);
      }
      c.restore();
    }

    return { render, L, st, scenes };
  };

  // cámara por defecto según el tipo de plano y una semilla (variedad sin repetir)
  VS.defaultCam = function (sc) {
    const byShot = {
      title: ["static", "slow_push"], closeup: ["slow_push", "push_in", "handheld"], scene: ["push_in", "pan_right", "pan_left", "dolly_left", "dolly_right", "slow_push"],
      dialogue: ["static", "slow_push"], confront: ["push_in", "dutch"], crowd: ["pan_right", "pull_out"], year: ["static", "push_in"],
      map: ["static"], number: ["slow_push"], chart: ["static"], versus: ["static"], object: ["slow_push", "push_in"],
      list: ["slow_push"], quote: ["slow_push"], danger: ["tilt_up", "dutch", "push_in"], reveal: ["pull_out"], portrait: ["push_in"],
      timeline: ["static"], montage: ["static"], explosion: ["crash_zoom"], end: ["static"], desk: ["slow_push", "dolly_right"], walk_away: ["slow_push"],
      travel: ["static"], kinetic: ["static"],
    };
    const opts = byShot[sc.shot] || byShot.scene;
    return opts[sc.seed % opts.length];
  };
})();
