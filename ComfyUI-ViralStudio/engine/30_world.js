/* ==========================================================================
   VIRAL STUDIO ENGINE — escenarios, atmósfera y acabado
   VS.ENV[nombre] = { s: dibujo estático (se cachea), d: dibujo animado }
   Cada capa recibe (ctx, st, L, T, pal, R) donde L = {W,H,gy,portrait,u}
   ========================================================================== */
(function () {
  "use strict";
  const VS = window.VS;
  const { clamp, lerp, hash, mix, rgba, shade, rng, E } = VS;
  const PI = Math.PI;
  const ENV = (VS.ENV = {});

  /* ---------- paleta del escenario según estilo y hora ---------- */
  VS.envPalette = function (st, time, mood) {
    const night = time === "night", dusk = time === "dusk" || time === "dawn", day = time === "day";
    const base = st.bg;
    let sky1 = st.sky1 || shade(base, night ? -0.2 : 0.05), sky2 = st.sky2 || shade(base, night ? 0.12 : 0.3);
    if (!st.sky1) {
      if (day) { sky1 = mix(base, "#6f9fd8", 0.35); sky2 = mix(base, "#d9e6f2", 0.35); }
      if (dusk) { sky1 = mix(base, "#3a2a4a", 0.4); sky2 = mix(base, "#e0703a", 0.45); }
    }
    const pal = {
      sky1, sky2,
      far: st.far || mix(sky1, st.ink, st.mode === "silhouette" ? 0 : 0.12),
      mid: st.mid || shade(mix(sky1, "#000", 0.25), 0.02),
      near: st.near || shade(base, -0.35),
      ground: st.groundCol || st.ground,
      light: st.lightCol || st.accent,
      line: st.mode === "silhouette" ? st.ink : rgba(st.ink, 0.22),
      ink: st.ink,
      win: night ? "#ffd27a" : day ? "#cfe3f5" : "#ffc27a",
      night, dusk, day,
    };
    if (st.mode === "silhouette") { pal.far = shade(st.ink, 0.25); pal.mid = shade(st.ink, 0.12); pal.near = st.ink; pal.ground = st.ink; }
    if (mood === "fear" || mood === "danger") { pal.sky1 = mix(pal.sky1, "#2a0a0a", 0.35); pal.light = st.danger; }
    if (mood === "hope") pal.light = st.accent;
    return pal;
  };

  /* ---------- utilidades de dibujo ---------- */
  function vgrad(ctx, y0, y1, c0, c1) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    return g;
  }
  function sky(ctx, st, L, pal) {
    ctx.fillStyle = vgrad(ctx, 0, L.gy, pal.sky1, pal.sky2);
    ctx.fillRect(-L.W, -L.H, L.W * 3, L.gy + L.H + 2);
  }
  function ground(ctx, st, L, pal, col) {
    ctx.fillStyle = vgrad(ctx, L.gy, L.H, col || pal.ground, shade(col || pal.ground, -0.4));
    ctx.fillRect(-L.W, L.gy, L.W * 3, L.H * 1.5);
    if (st.mode !== "silhouette" && st.mode !== "doc") {
      ctx.strokeStyle = rgba(st.ink, 0.25);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-L.W, L.gy);
      ctx.lineTo(L.W * 2, L.gy);
      ctx.stroke();
    }
  }
  VS.sky = sky;
  VS.ground = ground;
  function glow(ctx, x, y, r, col, a = 0.6) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, a));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  VS.glow = glow;
  function moon(ctx, x, y, r, col) {
    glow(ctx, x, y, r * 4, col, 0.25);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, PI * 2);
    ctx.fill();
  }
  function stars(ctx, L, n, seed, T, a = 0.8) {
    const R = rng(seed);
    for (let i = 0; i < n; i++) {
      const x = R() * L.W, y = R() * L.gy * 0.8, s = R() * 2 + 0.5;
      const tw = 0.5 + 0.5 * Math.sin(T * (1 + R() * 3) + i);
      ctx.fillStyle = `rgba(255,255,240,${a * (0.3 + tw * 0.7)})`;
      ctx.fillRect(x, y, s, s);
    }
  }
  function skyline(ctx, L, seed, y, hMin, hMax, col, winCol, winA, density = 1) {
    const R = rng(seed);
    let x = -L.W * 0.2;
    const bw = L.u * 70;
    while (x < L.W * 1.25) {
      const w = bw * (0.6 + R() * 1.1), h = L.u * (hMin + R() * (hMax - hMin));
      ctx.fillStyle = col;
      ctx.fillRect(x, y - h, w, h + 2);
      if (R() < 0.3) ctx.fillRect(x + w * 0.4, y - h - L.u * 25, w * 0.12, L.u * 25);
      if (winA > 0) {
        for (let wy = y - h + L.u * 12; wy < y - L.u * 12; wy += L.u * 18)
          for (let wx = x + L.u * 8; wx < x + w - L.u * 10; wx += L.u * 15)
            if (R() < 0.38 * density) {
              ctx.fillStyle = rgba(winCol, winA * (0.5 + R() * 0.5));
              ctx.fillRect(wx, wy, L.u * 6, L.u * 8);
            }
      }
      x += w + L.u * (2 + R() * 10);
    }
  }
  function hills(ctx, L, seed, y, amp, col, freq = 1) {
    const R = rng(seed);
    const ph = R() * 10;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-L.W * 0.3, L.H * 1.2);
    for (let x = -L.W * 0.3; x <= L.W * 1.3; x += 20) {
      const yy = y - amp * (0.5 + 0.3 * Math.sin(x * 0.004 * freq + ph) + 0.2 * Math.sin(x * 0.011 * freq + ph * 2));
      ctx.lineTo(x, yy);
    }
    ctx.lineTo(L.W * 1.3, L.H * 1.2);
    ctx.closePath();
    ctx.fill();
  }
  function peaks(ctx, L, seed, y, amp, col, snow) {
    const R = rng(seed);
    let x = -L.W * 0.3;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, L.H);
    const pts = [];
    while (x < L.W * 1.3) {
      const w = L.u * (120 + R() * 200), h = amp * (0.5 + R() * 0.5);
      pts.push([x + w / 2, y - h, w]);
      ctx.lineTo(x + w / 2, y - h);
      ctx.lineTo(x + w, y - h * 0.25 * R());
      x += w * 0.85;
    }
    ctx.lineTo(L.W * 1.3, L.H);
    ctx.closePath();
    ctx.fill();
    if (snow) {
      ctx.fillStyle = snow;
      for (const p of pts) {
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[0] + p[2] * 0.13, p[1] + p[2] * 0.16);
        ctx.lineTo(p[0] + p[2] * 0.03, p[1] + p[2] * 0.12);
        ctx.lineTo(p[0] - p[2] * 0.06, p[1] + p[2] * 0.17);
        ctx.lineTo(p[0] - p[2] * 0.13, p[1] + p[2] * 0.15);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  function trees(ctx, L, seed, y, n, sMin, sMax, col, kind = "pine") {
    const R = rng(seed);
    for (let i = 0; i < n; i++) {
      const x = -L.W * 0.15 + R() * L.W * 1.3, s = L.u * (sMin + R() * (sMax - sMin));
      ctx.fillStyle = col;
      if (kind === "pine") {
        ctx.beginPath();
        ctx.moveTo(x, y - s * 3.2);
        ctx.lineTo(x + s * 0.9, y - s * 0.3);
        ctx.lineTo(x - s * 0.9, y - s * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(x - s * 0.1, y - s * 0.4, s * 0.2, s * 0.45);
      } else {
        ctx.fillRect(x - s * 0.12, y - s * 1.6, s * 0.24, s * 1.6);
        ctx.beginPath();
        ctx.arc(x, y - s * 2.1, s * 0.85, 0, PI * 2);
        ctx.arc(x - s * 0.6, y - s * 1.6, s * 0.6, 0, PI * 2);
        ctx.arc(x + s * 0.6, y - s * 1.6, s * 0.6, 0, PI * 2);
        ctx.fill();
      }
    }
  }
  function bricks(ctx, x, y, w, h, col, u) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = shade(col, -0.35);
    ctx.lineWidth = Math.max(1, u * 2);
    const bh = u * 22, bw = u * 56;
    for (let r = 0, yy = y; yy < y + h; r++, yy += bh) {
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
      for (let xx = x + (r % 2) * bw * 0.5; xx < x + w; xx += bw) {
        ctx.beginPath();
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx, Math.min(y + h, yy + bh));
        ctx.stroke();
      }
    }
  }
  function barbed(ctx, x0, x1, y, col, u) {
    ctx.strokeStyle = col;
    ctx.lineWidth = u * 2.2;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 6) ctx.lineTo(x, y + Math.sin(x * 0.08) * u * 3);
    ctx.stroke();
    for (let x = x0; x < x1; x += u * 26) {
      ctx.beginPath();
      ctx.moveTo(x - u * 6, y - u * 6);
      ctx.lineTo(x + u * 6, y + u * 6);
      ctx.moveTo(x + u * 6, y - u * 6);
      ctx.lineTo(x - u * 6, y + u * 6);
      ctx.stroke();
    }
  }
  function windowFrame(ctx, x, y, w, h, frame, glass, u) {
    ctx.fillStyle = glass;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = frame;
    ctx.lineWidth = u * 8;
    ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = u * 5;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + h);
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();
  }
  function lamp(ctx, st, x, y, u, T, pal) {
    const fl = 0.9 + 0.1 * Math.sin(T * 13) * Math.sin(T * 7.1);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glow(ctx, x, y - u * 60, u * 700, st.lampCol || "#fff1dc", 0.22 * fl);
    glow(ctx, x, y - u * 60, u * 220, "#ffffff", 0.35 * fl);
    // charco de luz sobre la mesa
    ctx.save();
    ctx.translate(x - u * 160, y + u * 40);
    ctx.scale(1, 0.32);
    glow(ctx, 0, 0, u * 520, st.lampCol || "#fff1dc", 0.28 * fl);
    ctx.restore();
    ctx.restore();
    ctx.fillStyle = "#1a1512";
    ctx.beginPath();
    ctx.ellipse(x, y, u * 34, u * 10, 0, 0, PI * 2);
    ctx.fill();
    ctx.fillRect(x - u * 7, y - u * 30, u * 14, u * 30);
    ctx.fillStyle = "#1a1512";
    ctx.beginPath();
    ctx.ellipse(x, y - u * 34, u * 16, u * 8, 0, 0, PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fffdf6";
    ctx.shadowColor = st.lampCol || "#fff1dc";
    ctx.shadowBlur = u * 80;
    ctx.beginPath();
    ctx.arc(x, y - u * 72, u * 38, 0, PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(40,30,25,.35)";
    ctx.lineWidth = u * 2;
    ctx.stroke();
    // cable
    ctx.strokeStyle = "#1a1512";
    ctx.lineWidth = u * 5;
    ctx.beginPath();
    ctx.moveTo(x + u * 20, y + u * 4);
    ctx.bezierCurveTo(x + u * 90, y + u * 10, x + u * 60, y + u * 90, x + u * 160, y + u * 140);
    ctx.stroke();
  }
  VS.lamp = lamp;

  /* ---------- escenarios ---------- */
  ENV.void = {
    s(ctx, st, L, pal) {
      ctx.fillStyle = vgrad(ctx, 0, L.H, pal.sky1, shade(pal.sky1, -0.35));
      ctx.fillRect(-L.W, -L.H, L.W * 3, L.H * 3);
      glow(ctx, L.W / 2, L.gy - L.u * 200, L.u * 900, pal.sky2, 0.45);
      ctx.fillStyle = rgba("#000", 0.25);
      ctx.beginPath();
      ctx.ellipse(L.W / 2, L.gy + L.u * 8, L.u * 420, L.u * 40, 0, 0, PI * 2);
      ctx.fill();
    },
  };
  ENV.night_city = {
    s(ctx, st, L, pal, R, seed) {
      sky(ctx, st, L, pal);
      if (pal.night || st.mode === "line") stars(ctx, L, 140, seed, 0);
      if (pal.night) moon(ctx, L.W * 0.78, L.gy * 0.22, L.u * 46, "#f1ead2");
      skyline(ctx, L, seed + 1, L.gy, 120, 380, pal.far, pal.win, 0.35);
      skyline(ctx, L, seed + 2, L.gy, 60, 240, pal.mid, pal.win, 0.6);
      ground(ctx, st, L, pal);
    },
  };
  ENV.city_day = {
    s(ctx, st, L, pal, R, seed) {
      sky(ctx, st, L, pal);
      skyline(ctx, L, seed + 1, L.gy, 140, 420, mix(pal.sky2, pal.far, 0.5), pal.win, 0.15);
      skyline(ctx, L, seed + 2, L.gy, 80, 260, pal.mid, pal.win, 0.25);
      ground(ctx, st, L, pal);
    },
    d(ctx, st, L, T, pal) {
      for (let i = 0; i < 3; i++) VS.PROPS.cloud(ctx, st, ((i * 0.38 + T * 0.012) % 1.3) * L.W * 1.2 - L.W * 0.1, L.gy * (0.15 + i * 0.1), L.u * (0.9 + i * 0.3), T);
    },
  };
  ENV.street = {
    s(ctx, st, L, pal, R, seed) {
      sky(ctx, st, L, pal);
      const Rr = rng(seed);
      let x = -L.W * 0.1;
      while (x < L.W * 1.2) {
        const w = L.u * (220 + Rr() * 160), h = L.u * (340 + Rr() * 260);
        const col = mix(pal.mid, st.outfits[Math.floor(Rr() * st.outfits.length)], st.mode === "silhouette" ? 0 : 0.35);
        ctx.fillStyle = col;
        ctx.fillRect(x, L.gy - h, w, h);
        ctx.fillStyle = shade(col, -0.3);
        ctx.fillRect(x, L.gy - h, w, L.u * 16);
        if (st.mode !== "silhouette") {
          for (let wy = L.gy - h + L.u * 50; wy < L.gy - L.u * 150; wy += L.u * 95)
            for (let wx = x + L.u * 30; wx < x + w - L.u * 60; wx += L.u * 80) windowFrame(ctx, wx, wy, L.u * 46, L.u * 62, shade(col, -0.45), Rr() < 0.4 ? rgba(pal.win, 0.85) : shade(col, -0.55), L.u * 0.6);
          ctx.fillStyle = shade(col, -0.55);
          ctx.fillRect(x + w * 0.4, L.gy - L.u * 120, L.u * 60, L.u * 120);
        }
        x += w + L.u * 4;
      }
      ground(ctx, st, L, pal, shade(pal.ground, 0.05));
      if (st.mode !== "silhouette") {
        ctx.strokeStyle = rgba("#000", 0.25);
        ctx.lineWidth = L.u * 2;
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-L.W, L.gy + L.u * (20 + i * i * 18)); ctx.lineTo(L.W * 2, L.gy + L.u * (20 + i * i * 18)); ctx.stroke(); }
      }
    },
    d(ctx, st, L, T, pal) {
      for (const lx of [0.18, 0.82]) {
        const x = L.W * lx;
        ctx.fillStyle = st.mode === "silhouette" ? st.ink : "#15130f";
        ctx.fillRect(x - L.u * 5, L.gy - L.u * 330, L.u * 10, L.u * 330);
        ctx.fillRect(x - L.u * 22, L.gy - L.u * 345, L.u * 44, L.u * 22);
        if (!pal.day) glow(ctx, x, L.gy - L.u * 320, L.u * 260, pal.light, 0.35 * (0.9 + 0.1 * Math.sin(T * 9 + lx * 10)));
      }
    },
  };
  ENV.ghetto = ENV.wall = {
    s(ctx, st, L, pal, R, seed) {
      sky(ctx, st, L, pal);
      skyline(ctx, L, seed + 4, L.gy - L.u * 120, 80, 260, pal.far, pal.win, 0.2, 0.5);
      const wy = L.gy - L.u * 300;
      if (st.mode === "silhouette") { ctx.fillStyle = st.ink; ctx.fillRect(-L.W, wy, L.W * 3, L.u * 300); }
      else bricks(ctx, -L.W * 0.2, wy, L.W * 1.4, L.u * 300, st.brick || "#6e3a2e", L.u);
      barbed(ctx, -L.W * 0.2, L.W * 1.2, wy - L.u * 14, st.mode === "silhouette" ? st.ink : "#9aa0a8", L.u);
      ground(ctx, st, L, pal);
    },
  };
  ENV.room = {
    s(ctx, st, L, pal, R, seed) {
      const wall = st.wall || mix(pal.sky2, "#7a6a60", 0.35);
      ctx.fillStyle = vgrad(ctx, 0, L.gy, shade(wall, -0.15), wall);
      ctx.fillRect(-L.W, -L.H, L.W * 3, L.gy + L.H);
      if (st.mode !== "silhouette") {
        ctx.fillStyle = rgba("#000", 0.05);
        for (let x = -L.W; x < L.W * 2; x += L.u * 60) ctx.fillRect(x, 0, L.u * 24, L.gy);
      }
      windowFrame(ctx, L.W * 0.62, L.gy * 0.22, L.u * 300, L.u * 360, shade(wall, -0.5), pal.night ? "#1a2238" : rgba("#cfe3f5", 0.9), L.u);
      if (pal.night) moon(ctx, L.W * 0.62 + L.u * 220, L.gy * 0.22 + L.u * 80, L.u * 26, "#f1ead2");
      ctx.fillStyle = shade(wall, -0.55);
      ctx.fillRect(L.W * 0.18, L.gy * 0.3, L.u * 170, L.u * 210);
      ctx.fillStyle = shade(wall, -0.25);
      ctx.fillRect(L.W * 0.18 + L.u * 14, L.gy * 0.3 + L.u * 14, L.u * 142, L.u * 182);
      const fl = st.floor || shade(wall, -0.5);
      ctx.fillStyle = vgrad(ctx, L.gy, L.H, fl, shade(fl, -0.5));
      ctx.fillRect(-L.W, L.gy, L.W * 3, L.H);
      ctx.strokeStyle = rgba("#000", 0.3);
      ctx.lineWidth = L.u * 2;
      for (let x = -L.W; x < L.W * 2; x += L.u * 130) { ctx.beginPath(); ctx.moveTo(x, L.gy); ctx.lineTo(x - L.u * 240, L.H); ctx.stroke(); }
      ctx.fillStyle = shade(wall, -0.6);
      ctx.fillRect(-L.W, L.gy - L.u * 16, L.W * 3, L.u * 16);
    },
  };
  ENV.study = {
    // escritorio con lámpara y papeles (referencia: ilustración noir)
    s(ctx, st, L, pal, R, seed) {
      ENV.room.s(ctx, st, L, pal, R, seed);
      const dy = L.gy - L.u * 40;
      const desk = st.desk || mix(st.bg, "#8a8484", 0.5);
      ctx.fillStyle = desk;
      ctx.beginPath();
      ctx.moveTo(-L.W * 0.1, dy);
      ctx.lineTo(L.W * 1.1, dy);
      ctx.lineTo(L.W * 1.2, L.H * 1.1);
      ctx.lineTo(-L.W * 0.2, L.H * 1.1);
      ctx.closePath();
      ctx.fill();
      if (st.mode === "charcoal" || st.mode === "painted") {
        ctx.save();
        ctx.clip();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = VS.pattern(ctx, "charcoal", 256);
        ctx.fillRect(-L.W, dy, L.W * 3, L.H);
        ctx.restore();
      }
      const Rr = rng(seed + 9);
      for (let i = 0; i < 7; i++) {
        const px = L.W * (0.05 + Rr() * 0.9), py = dy + L.u * (40 + Rr() * (L.H - dy) / L.u * 0.7), rot = (Rr() - 0.5) * 0.5;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        ctx.fillStyle = Rr() < 0.5 ? "#e6dcd2" : "#d9c4c0";
        ctx.strokeStyle = "rgba(20,15,12,.7)";
        ctx.lineWidth = L.u * 1.6;
        ctx.fillRect(-L.u * 110, -L.u * 70, L.u * 220, L.u * 140);
        ctx.strokeRect(-L.u * 110, -L.u * 70, L.u * 220, L.u * 140);
        ctx.strokeStyle = "rgba(20,15,12,.5)";
        for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(-L.u * 85, -L.u * 45 + k * L.u * 17); ctx.lineTo(L.u * (40 + Rr() * 40), -L.u * 45 + k * L.u * 17); ctx.stroke(); }
        ctx.restore();
      }
    },
    d(ctx, st, L, T, pal) {
      lamp(ctx, st, L.W * (L.portrait ? 0.8 : 0.82), L.gy - L.u * 10, L.u * 1.25, T, pal);
    },
    key: { x: 0.82, y: 0.7, r: 0.95, dark: 0.62 },
  };
  ENV.office = {
    s(ctx, st, L, pal, R, seed) {
      ENV.room.s(ctx, st, Object.assign({}, L), pal, R, seed);
      const dx = L.W * 0.55, dy = L.gy - L.u * 150;
      ctx.fillStyle = shade(pal.near, 0.2);
      ctx.fillRect(dx, dy, L.u * 420, L.u * 26);
      ctx.fillRect(dx + L.u * 20, dy, L.u * 18, L.u * 150);
      ctx.fillRect(dx + L.u * 380, dy, L.u * 18, L.u * 150);
      VS.PROPS.computer(ctx, st, dx + L.u * 210, dy - L.u * 90, L.u * 0.9, 0);
    },
  };
  ENV.school = {
    s(ctx, st, L, pal, R, seed) {
      ENV.room.s(ctx, st, L, pal, R, seed);
      ctx.fillStyle = "#24382e";
      ctx.fillRect(L.W * 0.1, L.gy * 0.18, L.W * 0.5, L.gy * 0.5);
      ctx.strokeStyle = "#6b4a2e";
      ctx.lineWidth = L.u * 14;
      ctx.strokeRect(L.W * 0.1, L.gy * 0.18, L.W * 0.5, L.gy * 0.5);
      ctx.strokeStyle = "rgba(240,240,230,.6)";
      ctx.lineWidth = L.u * 3;
      const Rr = rng(seed);
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(L.W * 0.14, L.gy * (0.26 + i * 0.08)); ctx.lineTo(L.W * (0.25 + Rr() * 0.3), L.gy * (0.26 + i * 0.08)); ctx.stroke(); }
    },
  };
  ENV.hospital = {
    s(ctx, st, L, pal, R, seed) {
      ENV.room.s(ctx, st, L, Object.assign({}, pal, { sky2: mix(pal.sky2, "#dfe8ea", 0.5) }), R, seed);
      ctx.fillStyle = st.danger;
      ctx.fillRect(L.W * 0.3 - L.u * 20, L.gy * 0.2, L.u * 40, L.u * 120);
      ctx.fillRect(L.W * 0.3 - L.u * 60, L.gy * 0.2 + L.u * 40, L.u * 120, L.u * 40);
      ctx.fillStyle = "#e9eef0";
      ctx.fillRect(L.W * 0.5, L.gy - L.u * 120, L.u * 420, L.u * 60);
      ctx.fillStyle = "#9aa0a8";
      ctx.fillRect(L.W * 0.5, L.gy - L.u * 60, L.u * 14, L.u * 60);
      ctx.fillRect(L.W * 0.5 + L.u * 406, L.gy - L.u * 60, L.u * 14, L.u * 60);
    },
  };
  ENV.lab = {
    s(ctx, st, L, pal, R, seed) {
      ENV.room.s(ctx, st, L, pal, R, seed);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = shade(pal.near, 0.15);
        ctx.fillRect(L.W * 0.08, L.gy * (0.3 + i * 0.18), L.W * 0.35, L.u * 12);
        for (let k = 0; k < 4; k++) VS.PROPS.flask(ctx, st, L.W * (0.12 + k * 0.08), L.gy * (0.3 + i * 0.18) - L.u * 32, L.u * 0.3, k);
      }
    },
  };
  ENV.forest = {
    s(ctx, st, L, pal, R, seed) {
      sky(ctx, st, L, pal);
      if (pal.night) moon(ctx, L.W * 0.7, L.gy * 0.25, L.u * 40, "#f1ead2");
      trees(ctx, L, seed + 1, L.gy - L.u * 60, 26, 60, 110, pal.far);
      ctx.fillStyle = rgba(pal.sky2, 0.35);
      ctx.fillRect(-L.W, L.gy - L.u * 220, L.W * 3, L.u * 220);
      trees(ctx, L, seed + 2, L.gy - L.u * 10, 16, 90, 150, pal.mid);
      ground(ctx, st, L, pal);
      trees(ctx, L, seed + 3, L.gy + L.u * 40, 4, 160, 240, pal.near);
    },
    d(ctx, st, L, T, pal) {
      if (!pal.day) for (let i = 0; i < 24; i++) {
        const x = (hash(i) * L.W + Math.sin(T * 0.6 + i) * 40), y = L.gy - L.u * (40 + hash(i + 9) * 300) + Math.cos(T * 0.8 + i) * 20;
        const a = 0.5 + 0.5 * Math.sin(T * 3 + i * 2);
        glow(ctx, x, y, L.u * 14, pal.light, a * 0.8);
      }
    },
  };
  ENV.desert = {
    s(ctx, st, L, pal, R, seed) {
      sky(ctx, st, Object.assign({}, L), Object.assign({}, pal, { sky2: mix(pal.sky2, "#f0b070", 0.4) }));
      const sun = st.mode === "silhouette" ? "#ffd9a0" : mix(pal.light, "#fff3c0", 0.4);
      glow(ctx, L.W * 0.65, L.gy * 0.45, L.u * 500, sun, 0.4);
      ctx.fillStyle = sun;
      ctx.beginPath(); ctx.arc(L.W * 0.65, L.gy * 0.45, L.u * 110, 0, PI * 2); ctx.fill();
      hills(ctx, L, seed, L.gy, L.u * 120, mix(pal.mid, "#b07a45", st.mode === "silhouette" ? 0 : 0.5), 0.6);
      hills(ctx, L, seed + 3, L.gy + L.u * 60, L.u * 90, mix(pal.near, "#8a5a32", st.mode === "silhouette" ? 0 : 0.5), 0.9);
      ctx.fillStyle = mix(pal.near, "#8a5a32", st.mode === "silhouette" ? 0 : 0.5);
      ctx.fillRect(-L.W, L.gy + L.u * 40, L.W * 3, L.H);
    },
  };
  ENV.sea = {
    // horizonte alto, agua hasta la orilla y suelo de rocas donde pisan los personajes
    s(ctx, st, L, pal, R, seed) {
      const hz = L.gy - L.u * (L.portrait ? 330 : 250);
      sky(ctx, st, Object.assign({}, L, { gy: hz }), pal);
      if (pal.night) moon(ctx, L.W * 0.3, hz * 0.45, L.u * 40, "#f1ead2");
      ctx.fillStyle = vgrad(ctx, hz, L.gy, shade(mix(pal.sky1, "#1f4a6a", st.mode === "silhouette" ? 0 : 0.5), -0.1), shade(mix(pal.sky1, "#163a52", st.mode === "silhouette" ? 0 : 0.5), -0.35));
      ctx.fillRect(-L.W, hz, L.W * 3, L.gy - hz + 2);
      const Rr = rng(seed + 5);
      const rock = st.mode === "silhouette" ? st.ink : shade(pal.ground, 0.06);
      ctx.fillStyle = rock;
      ctx.beginPath();
      ctx.moveTo(-L.W, L.H * 1.2);
      ctx.lineTo(-L.W, L.gy + L.u * 6);
      for (let x = -L.W * 0.2; x <= L.W * 1.25; x += L.u * 60) ctx.lineTo(x, L.gy - L.u * (Rr() * 16) + L.u * 4);
      ctx.lineTo(L.W * 1.25, L.H * 1.2);
      ctx.closePath();
      ctx.fill();
      if (st.mode !== "silhouette") {
        ctx.fillStyle = rgba("#000", 0.25);
        for (let i = 0; i < 18; i++) ctx.fillRect(Rr() * L.W * 1.2 - L.W * 0.1, L.gy + Rr() * (L.H - L.gy), L.u * (20 + Rr() * 60), L.u * (6 + Rr() * 10));
      }
      ENV.sea._hz = hz;
    },
    d(ctx, st, L, T, pal) {
      const hz = L.gy - L.u * (L.portrait ? 330 : 250);
      VS.PROPS.ship(ctx, st, L.W * 0.3, hz + L.u * 10, L.u * 0.45, T);
      ctx.strokeStyle = rgba(st.mode === "silhouette" ? "#000" : "#ffffff", 0.16);
      ctx.lineWidth = L.u * 3;
      for (let r = 0; r < 9; r++) {
        const y = hz + (L.gy - hz) * ((r + 1) / 10) ** 1.4;
        ctx.beginPath();
        for (let x = -50; x <= L.W + 50; x += 30) ctx.lineTo(x, y + Math.sin(x * 0.01 + T * (1.2 + r * 0.1) + r) * L.u * (2 + r * 0.6));
        ctx.stroke();
      }
      // espuma en la orilla
      ctx.fillStyle = rgba(st.mode === "silhouette" ? "#000" : "#e8f0f4", 0.35 + 0.15 * Math.sin(T * 1.4));
      ctx.fillRect(-L.W, L.gy - L.u * 8 + Math.sin(T * 1.4) * L.u * 4, L.W * 3, L.u * 6);
    },
  };
  ENV.lighthouse = {
    s(ctx, st, L, pal, R, seed) {
      ENV.sea.s(ctx, st, L, pal, R, seed);
      // acantilado y faro
      ctx.fillStyle = st.mode === "silhouette" ? st.ink : shade(pal.near, 0.08);
      ctx.beginPath();
      ctx.moveTo(L.W * 0.55, L.H);
      ctx.lineTo(L.W * 0.6, L.gy - L.u * 60);
      ctx.lineTo(L.W * 0.95, L.gy - L.u * 90);
      ctx.lineTo(L.W * 1.2, L.gy - L.u * 80);
      ctx.lineTo(L.W * 1.2, L.H);
      ctx.closePath();
      ctx.fill();
      const x = L.W * 0.8, base = L.gy - L.u * 85, h = L.u * (L.portrait ? 520 : 430);
      ctx.fillStyle = st.mode === "silhouette" ? st.ink : "#e8e2d6";
      ctx.beginPath();
      ctx.moveTo(x - L.u * 48, base); ctx.lineTo(x - L.u * 30, base - h); ctx.lineTo(x + L.u * 30, base - h); ctx.lineTo(x + L.u * 48, base);
      ctx.closePath(); ctx.fill();
      if (st.mode !== "silhouette") {
        ctx.fillStyle = st.danger;
        for (let i = 0; i < 3; i++) {
          const y0 = base - h * (0.18 + i * 0.28), y1 = y0 - h * 0.12;
          ctx.beginPath();
          ctx.moveTo(x - L.u * (46 - i * 6), y0); ctx.lineTo(x - L.u * (42 - i * 6), y1); ctx.lineTo(x + L.u * (42 - i * 6), y1); ctx.lineTo(x + L.u * (46 - i * 6), y0);
          ctx.closePath(); ctx.fill();
        }
      }
      ctx.fillStyle = st.mode === "silhouette" ? st.ink : "#2a2a2e";
      ctx.fillRect(x - L.u * 40, base - h - L.u * 16, L.u * 80, L.u * 16);
      ctx.fillRect(x - L.u * 26, base - h - L.u * 70, L.u * 52, L.u * 10);
      ctx.beginPath(); ctx.moveTo(x - L.u * 30, base - h - L.u * 70); ctx.lineTo(x, base - h - L.u * 110); ctx.lineTo(x + L.u * 30, base - h - L.u * 70); ctx.fill();
    },
    d(ctx, st, L, T, pal) {
      ENV.sea.d(ctx, st, L, T, pal);
      const x = L.W * 0.8, y = L.gy - L.u * 85 - L.u * (L.portrait ? 520 : 430) - L.u * 40;
      const a = T * 1.1;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const w = Math.cos(a);
      const len = L.W * 1.4 * Math.abs(w);
      const dir = w >= 0 ? -1 : 1;
      const g = ctx.createLinearGradient(x, y, x + dir * len, y);
      g.addColorStop(0, rgba("#fff3c8", 0.55));
      g.addColorStop(1, rgba("#fff3c8", 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, y - L.u * 8);
      ctx.lineTo(x + dir * len, y - L.u * (60 + 140 * Math.abs(w)));
      ctx.lineTo(x + dir * len, y + L.u * (60 + 140 * Math.abs(w)));
      ctx.lineTo(x, y + L.u * 8);
      ctx.closePath();
      ctx.fill();
      glow(ctx, x, y, L.u * 120, "#fff3c8", 0.8);
      ctx.restore();
    },
  };
  ENV.mountains = {
    s(ctx, st, L, pal, R, seed) {
      sky(ctx, st, L, pal);
      peaks(ctx, L, seed, L.gy - L.u * 120, L.u * 420, pal.far, st.mode === "silhouette" ? null : rgba("#ffffff", 0.75));
      ctx.fillStyle = rgba(pal.sky2, 0.4);
      ctx.fillRect(-L.W, L.gy - L.u * 260, L.W * 3, L.u * 260);
      peaks(ctx, L, seed + 5, L.gy, L.u * 260, pal.mid, null);
      ground(ctx, st, L, pal);
    },
  };
  ENV.space = {
    s(ctx, st, L, pal, R, seed) {
      ctx.fillStyle = vgrad(ctx, 0, L.H, "#05060d", "#0d1022");
      ctx.fillRect(-L.W, -L.H, L.W * 3, L.H * 3);
      glow(ctx, L.W * 0.3, L.H * 0.3, L.u * 700, "#5a2a8a", 0.25);
      glow(ctx, L.W * 0.75, L.H * 0.6, L.u * 600, "#1a5a8a", 0.22);
      stars(ctx, Object.assign({}, L, { gy: L.H * 1.2 }), 380, seed, 0, 1);
      VS.PROPS.planet(ctx, st, L.W * 0.78, L.H * 0.28, L.u * 1.6, 0, { color: "#c9874a" });
    },
    d(ctx, st, L, T) { stars(ctx, Object.assign({}, L, { gy: L.H * 1.2 }), 60, 99, T, 1); },
  };
  ENV.battlefield = {
    s(ctx, st, L, pal, R, seed) {
      const p2 = Object.assign({}, pal, { sky1: mix(pal.sky1, "#3a1a10", 0.4), sky2: mix(pal.sky2, "#c0502a", 0.45) });
      sky(ctx, st, L, p2);
      const Rr = rng(seed);
      ctx.fillStyle = pal.far;
      for (let i = 0; i < 9; i++) {
        const x = Rr() * L.W * 1.2 - L.W * 0.1, w = L.u * (80 + Rr() * 140), h = L.u * (120 + Rr() * 260);
        ctx.beginPath();
        ctx.moveTo(x, L.gy);
        ctx.lineTo(x, L.gy - h);
        for (let k = 0; k < 5; k++) ctx.lineTo(x + (w * (k + 1)) / 5, L.gy - h * (0.55 + Rr() * 0.45));
        ctx.lineTo(x + w, L.gy);
        ctx.closePath();
        ctx.fill();
      }
      ground(ctx, st, L, pal, shade(pal.ground, -0.1));
      barbed(ctx, -L.W * 0.1, L.W * 1.1, L.gy + L.u * 30, st.mode === "silhouette" ? st.ink : "#6a6e74", L.u);
    },
    d(ctx, st, L, T, pal) {
      for (let i = 0; i < 5; i++) {
        const x = L.W * (0.1 + i * 0.2) + hash(i) * 80;
        for (let k = 0; k < 6; k++) {
          const ph = (T * 0.12 + k / 6 + hash(i * 3)) % 1;
          ctx.fillStyle = rgba(st.mode === "silhouette" ? "#000" : "#2a2522", 0.35 * (1 - ph));
          ctx.beginPath();
          ctx.arc(x + Math.sin(ph * 4 + i) * L.u * 40 + ph * L.u * 120, L.gy - L.u * 40 - ph * L.u * 520, L.u * (40 + ph * 120), 0, PI * 2);
          ctx.fill();
        }
        glow(ctx, x, L.gy - L.u * 20, L.u * 160, "#ff6a2a", 0.3 + 0.15 * Math.sin(T * 8 + i));
      }
    },
  };
  ENV.castle = {
    s(ctx, st, L, pal, R, seed) {
      sky(ctx, st, L, pal);
      if (pal.night) moon(ctx, L.W * 0.25, L.gy * 0.25, L.u * 44, "#f1ead2");
      hills(ctx, L, seed, L.gy, L.u * 80, pal.mid);
      VS.PROPS.castle(ctx, Object.assign({}, st, { mode: st.mode === "silhouette" ? "silhouette" : "flat" }), L.W * 0.66, L.gy - L.u * 230, L.u * 2.2, 0);
      ground(ctx, st, L, pal);
    },
    d(ctx, st, L, T) { VS.flame(ctx, L.W * 0.66 - L.u * 110, L.gy - L.u * 210, L.u * 1.2, T); VS.flame(ctx, L.W * 0.66 + L.u * 110, L.gy - L.u * 210, L.u * 1.2, T + 1); },
  };
  ENV.ancient = {
    s(ctx, st, L, pal, R, seed) {
      sky(ctx, st, L, Object.assign({}, pal, { sky2: mix(pal.sky2, "#e8b070", 0.3) }));
      VS.PROPS.pyramid(ctx, Object.assign({}, st, { mode: st.mode === "silhouette" ? "silhouette" : "flat" }), L.W * 0.25, L.gy - L.u * 170, L.u * 2.4, 0);
      VS.PROPS.temple(ctx, Object.assign({}, st, { mode: st.mode === "silhouette" ? "silhouette" : "flat" }), L.W * 0.72, L.gy - L.u * 190, L.u * 1.8, 0);
      ground(ctx, st, L, pal, mix(pal.ground, "#a07a4a", st.mode === "silhouette" ? 0 : 0.3));
    },
  };
  ENV.village = {
    s(ctx, st, L, pal, R, seed) {
      sky(ctx, st, L, pal);
      hills(ctx, L, seed, L.gy - L.u * 30, L.u * 140, pal.far);
      const Rr = rng(seed + 3);
      for (let i = 0; i < 5; i++) VS.PROPS.house(ctx, Object.assign({}, st, { mode: st.mode === "silhouette" ? "silhouette" : "flat" }), L.W * (0.08 + i * 0.22 + Rr() * 0.05), L.gy - L.u * 100, L.u * (1.0 + Rr() * 0.4), 0);
      ground(ctx, st, L, pal);
      trees(ctx, L, seed + 7, L.gy + L.u * 10, 3, 100, 140, pal.near, "round");
    },
  };
  ENV.stage = {
    s(ctx, st, L, pal) {
      ctx.fillStyle = "#0a0607";
      ctx.fillRect(-L.W, -L.H, L.W * 3, L.H * 3);
      const cur = st.mode === "silhouette" ? st.ink : "#5a0f16";
      for (const sd of [-1, 1]) {
        ctx.fillStyle = cur;
        const x0 = sd < 0 ? -L.W * 0.1 : L.W * 0.82;
        ctx.fillRect(x0, -10, L.W * 0.28, L.H + 20);
        ctx.fillStyle = rgba("#000", 0.35);
        for (let k = 0; k < 6; k++) ctx.fillRect(x0 + k * L.W * 0.05, -10, L.W * 0.018, L.H + 20);
      }
      ctx.fillStyle = cur;
      ctx.fillRect(-10, -10, L.W + 20, L.u * 90);
      ctx.fillStyle = vgrad(ctx, L.gy, L.H, "#3a2416", "#140c08");
      ctx.fillRect(-L.W, L.gy, L.W * 3, L.H);
    },
    d(ctx, st, L, T, pal) {
      const x = L.W / 2 + Math.sin(T * 0.7) * L.u * 30;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createLinearGradient(x, 0, x, L.gy);
      g.addColorStop(0, rgba(pal.light, 0.0));
      g.addColorStop(1, rgba(pal.light, 0.22));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - L.u * 40, 0);
      ctx.lineTo(x + L.u * 40, 0);
      ctx.lineTo(x + L.u * 260, L.gy + L.u * 20);
      ctx.lineTo(x - L.u * 260, L.gy + L.u * 20);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = rgba(pal.light, 0.22);
      ctx.beginPath();
      ctx.ellipse(x, L.gy + L.u * 20, L.u * 270, L.u * 40, 0, 0, PI * 2);
      ctx.fill();
    },
  };
  ENV.road = {
    s(ctx, st, L, pal, R, seed) {
      sky(ctx, st, L, pal);
      hills(ctx, L, seed, L.gy, L.u * 100, pal.mid);
      ground(ctx, st, L, pal);
      ctx.fillStyle = shade(pal.ground, -0.25);
      ctx.beginPath();
      ctx.moveTo(L.W * 0.47, L.gy);
      ctx.lineTo(L.W * 0.53, L.gy);
      ctx.lineTo(L.W * 0.95, L.H);
      ctx.lineTo(L.W * 0.05, L.H);
      ctx.closePath();
      ctx.fill();
    },
    d(ctx, st, L, T, pal) {
      ctx.fillStyle = rgba(st.mode === "silhouette" ? "#000" : "#e8dcc0", 0.7);
      for (let i = 0; i < 8; i++) {
        const k = ((i / 8 + T * 0.25) % 1), y = L.gy + (L.H - L.gy) * k * k, w = L.u * (4 + 30 * k * k), h = L.u * (6 + 50 * k * k);
        ctx.fillRect(L.W / 2 - w / 2, y, w, h);
      }
    },
  };
  ENV.sky = {
    s(ctx, st, L, pal, R, seed) {
      ctx.fillStyle = vgrad(ctx, 0, L.H, pal.sky1, pal.sky2);
      ctx.fillRect(-L.W, -L.H, L.W * 3, L.H * 3);
      glow(ctx, L.W * 0.5, L.H * 0.3, L.u * 700, pal.light, 0.25);
    },
    d(ctx, st, L, T) {
      for (let i = 0; i < 7; i++) VS.PROPS.cloud(ctx, st, ((hash(i) + T * 0.02 * (1 + i * 0.2)) % 1.3) * L.W * 1.2 - L.W * 0.1, L.H * (0.15 + hash(i + 3) * 0.7), L.u * (1.2 + hash(i + 5) * 1.5), T);
    },
  };
  ENV.cave = {
    s(ctx, st, L, pal, R, seed) {
      ctx.fillStyle = vgrad(ctx, 0, L.H, "#0c0a09", "#1a1512");
      ctx.fillRect(-L.W, -L.H, L.W * 3, L.H * 3);
      const Rr = rng(seed);
      ctx.fillStyle = st.mode === "silhouette" ? st.ink : "#24201c";
      for (let i = 0; i < 18; i++) {
        const x = Rr() * L.W * 1.2 - L.W * 0.1, w = L.u * (30 + Rr() * 60), h = L.u * (60 + Rr() * 220);
        ctx.beginPath(); ctx.moveTo(x - w, 0); ctx.lineTo(x + w, 0); ctx.lineTo(x, h); ctx.closePath(); ctx.fill();
      }
      ground(ctx, st, L, pal, "#1f1a16");
    },
    d(ctx, st, L, T, pal) {
      glow(ctx, L.W * 0.2, L.gy - L.u * 260, L.u * 500, "#ff8a3a", 0.25 + 0.06 * Math.sin(T * 11));
      VS.flame(ctx, L.W * 0.2, L.gy - L.u * 260, L.u * 1.4, T);
    },
  };
  ENV.church = {
    s(ctx, st, L, pal, R, seed) {
      const wall = mix(pal.sky1, "#6a5a50", 0.4);
      ctx.fillStyle = vgrad(ctx, 0, L.gy, shade(wall, -0.3), wall);
      ctx.fillRect(-L.W, -L.H, L.W * 3, L.gy + L.H);
      for (let i = 0; i < 4; i++) {
        const x = L.W * (0.12 + i * 0.25);
        ctx.fillStyle = shade(wall, -0.4);
        ctx.fillRect(x - L.u * 30, L.gy * 0.15, L.u * 60, L.gy);
        ctx.fillStyle = mix("#e3a83e", st.cool, i % 2 ? 0.6 : 0.2);
        ctx.beginPath();
        ctx.moveTo(x + L.u * 70, L.gy * 0.7);
        ctx.lineTo(x + L.u * 70, L.gy * 0.32);
        ctx.arc(x + L.u * 120, L.gy * 0.32, L.u * 50, PI, 0);
        ctx.lineTo(x + L.u * 170, L.gy * 0.7);
        ctx.closePath();
        ctx.fill();
      }
      ground(ctx, st, L, pal, shade(wall, -0.5));
    },
    d(ctx, st, L, T, pal) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 4; i++) {
        const x = L.W * (0.12 + i * 0.25) + L.u * 120;
        const g = ctx.createLinearGradient(x, L.gy * 0.4, x + L.u * 300, L.gy);
        g.addColorStop(0, rgba(pal.light, 0.16 + 0.03 * Math.sin(T + i)));
        g.addColorStop(1, rgba(pal.light, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - L.u * 50, L.gy * 0.35);
        ctx.lineTo(x + L.u * 50, L.gy * 0.35);
        ctx.lineTo(x + L.u * 400, L.gy + L.u * 40);
        ctx.lineTo(x + L.u * 150, L.gy + L.u * 40);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    },
  };
  ENV.prison = {
    s(ctx, st, L, pal, R, seed) {
      if (st.mode === "silhouette") { ctx.fillStyle = shade(st.bg, -0.2); ctx.fillRect(-L.W, -L.H, L.W * 3, L.H * 3); }
      else bricks(ctx, -L.W, -L.H, L.W * 3, L.gy + L.H, "#4a4640", L.u);
      windowFrame(ctx, L.W * 0.45, L.gy * 0.18, L.u * 160, L.u * 120, "#1a1816", "#3a4a66", L.u);
      ground(ctx, st, L, pal, "#2a2724");
    },
    d(ctx, st, L) {
      ctx.fillStyle = st.mode === "silhouette" ? st.ink : "#15130f";
      for (let i = 0; i < 9; i++) ctx.fillRect(L.W * 0.05 + i * L.W * 0.11, -10, L.u * 18, L.H + 20);
      ctx.fillRect(-10, L.H * 0.12, L.W + 20, L.u * 18);
    },
  };
  ENV.throne = {
    s(ctx, st, L, pal, R, seed) {
      const wall = mix(pal.sky1, "#5a2a2a", 0.4);
      ctx.fillStyle = vgrad(ctx, 0, L.gy, shade(wall, -0.3), wall);
      ctx.fillRect(-L.W, -L.H, L.W * 3, L.gy + L.H);
      for (let i = 0; i < 6; i++) {
        const x = L.W * (0.05 + i * 0.18);
        ctx.fillStyle = shade(wall, 0.15);
        ctx.fillRect(x, L.gy * 0.1, L.u * 50, L.gy);
        ctx.fillStyle = shade(wall, 0.3);
        ctx.fillRect(x - L.u * 10, L.gy * 0.1, L.u * 70, L.u * 20);
      }
      ctx.fillStyle = st.mode === "silhouette" ? st.ink : st.danger;
      ctx.beginPath();
      ctx.moveTo(L.W * 0.44, L.gy);
      ctx.lineTo(L.W * 0.56, L.gy);
      ctx.lineTo(L.W * 0.75, L.H);
      ctx.lineTo(L.W * 0.25, L.H);
      ctx.closePath();
      ctx.fill();
      ground(ctx, st, L, pal, shade(wall, -0.5));
      ctx.fillStyle = st.mode === "silhouette" ? st.ink : st.accent;
      ctx.fillRect(L.W * 0.5 - L.u * 70, L.gy - L.u * 280, L.u * 140, L.u * 280);
    },
  };
  ENV.field = {
    s(ctx, st, L, pal, R, seed) {
      sky(ctx, st, L, pal);
      hills(ctx, L, seed, L.gy, L.u * 90, mix(pal.mid, "#5a7a3a", st.mode === "silhouette" ? 0 : 0.4));
      ground(ctx, st, L, pal, mix(pal.ground, "#4a6a2a", st.mode === "silhouette" ? 0 : 0.4));
    },
    d(ctx, st, L, T) {
      ctx.strokeStyle = st.mode === "silhouette" ? st.ink : rgba("#2a3a1a", 0.7);
      ctx.lineWidth = L.u * 2;
      for (let i = 0; i < 120; i++) {
        const x = hash(i) * L.W, y = L.gy + hash(i + 7) * (L.H - L.gy), h = L.u * (14 + hash(i + 3) * 18);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.sin(T * 2 + i) * 6, y - h / 2, x + Math.sin(T * 2 + i) * 10, y - h);
        ctx.stroke();
      }
    },
  };
  // alias habituales
  const ALIAS = { faro: "lighthouse", lighthouse_tower: "lighthouse", city: "night_city", ciudad: "night_city", calle: "street", habitacion: "room", oficina: "office", escuela: "school", bosque: "forest", desierto: "desert", mar: "sea", ocean: "sea", montanas: "mountains", espacio: "space", guerra: "battlefield", war: "battlefield", castillo: "castle", templo: "ancient", egypt: "ancient", aldea: "village", pueblo: "village", escenario: "stage", carretera: "road", cielo: "sky", cueva: "cave", iglesia: "church", carcel: "prison", palacio: "throne", campo: "field", desk: "study", escritorio: "study", home: "room", house: "room", interior: "room", jungle: "forest", beach: "sea", playa: "sea", snow: "mountains", heaven: "sky", hell: "cave", infierno: "cave", dark: "void", black: "void", none: "void" };
  VS.envName = (n) => {
    n = String(n || "void").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s-]+/g, "_");
    if (ENV[n]) return n;
    if (ALIAS[n]) return ALIAS[n];
    for (const k in ENV) if (n.includes(k)) return k;
    for (const k in ALIAS) if (n.includes(k)) return ALIAS[k];
    return "void";
  };

  /* ---------- clima / atmósfera (animado) ---------- */
  VS.weather = function (ctx, st, L, T, kind, pal) {
    if (!kind || kind === "none") return;
    const u = L.u;
    if (kind === "rain" || kind === "storm") {
      ctx.strokeStyle = rgba(st.mode === "silhouette" ? "#000" : "#c8d6e6", 0.35);
      ctx.lineWidth = u * 2;
      ctx.beginPath();
      for (let i = 0; i < 220; i++) {
        const sp = 1400 + hash(i) * 600;
        const x = (hash(i * 3.1) * L.W * 1.3 + T * 180) % (L.W * 1.3) - L.W * 0.15;
        const y = (hash(i * 7.7) * L.H + T * sp) % (L.H + 100) - 50;
        ctx.moveTo(x, y);
        ctx.lineTo(x - u * 6, y + u * 34);
      }
      ctx.stroke();
    }
    if (kind === "storm") {
      const k = Math.floor(T * 1.3);
      if (hash(k * 5.3) > 0.55) {
        const ph = T * 1.3 - k;
        if (ph < 0.18) {
          ctx.fillStyle = rgba("#ffffff", (ph < 0.06 ? 0.55 : 0.25) * (1 - ph / 0.18));
          ctx.fillRect(-L.W, -L.H, L.W * 3, L.H * 3);
          if (ph < 0.1) {
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = u * 5;
            ctx.shadowColor = "#cfe0ff";
            ctx.shadowBlur = 30;
            ctx.beginPath();
            let x = L.W * (0.2 + hash(k) * 0.6), y = 0;
            ctx.moveTo(x, y);
            while (y < L.gy * 0.7) { x += (hash(x + y) - 0.5) * u * 90; y += u * 60; ctx.lineTo(x, y); }
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }
      }
    }
    if (kind === "snow") {
      ctx.fillStyle = "rgba(255,255,255,.85)";
      for (let i = 0; i < 160; i++) {
        const x = (hash(i * 2.3) * L.W + Math.sin(T + i) * 30 + T * 20) % L.W;
        const y = (hash(i * 9.1) * L.H + T * (60 + hash(i) * 60)) % L.H;
        ctx.beginPath(); ctx.arc(x, y, u * (2 + hash(i) * 3), 0, PI * 2); ctx.fill();
      }
    }
    if (kind === "dust" || kind === "fog") {
      for (let i = 0; i < 6; i++) {
        const x = ((hash(i) + T * 0.015 * (1 + i * 0.3)) % 1.4) * L.W * 1.2 - L.W * 0.2;
        glow(ctx, x, L.gy - u * (40 + i * 60), u * (380 + i * 60), kind === "fog" ? "#d8dde2" : "#c8a878", 0.14);
      }
    }
    if (kind === "embers" || kind === "fire") {
      for (let i = 0; i < 70; i++) {
        const ph = (T * (0.12 + hash(i) * 0.15) + hash(i * 4)) % 1;
        const x = hash(i * 3) * L.W + Math.sin(T * 2 + i) * 30;
        const y = L.H - ph * L.H * 1.1;
        ctx.fillStyle = rgba(i % 3 ? "#ffb43a" : "#ff6a2a", (1 - ph) * 0.9);
        ctx.fillRect(x, y, u * 4, u * 4);
      }
      if (kind === "fire") glow(ctx, L.W / 2, L.H, L.u * 900, "#ff6a2a", 0.3 + 0.05 * Math.sin(T * 9));
    }
    if (kind === "stars") stars(ctx, L, 120, 7, T);
    if (kind === "sunrays") {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 6; i++) {
        const a = -0.5 + i * 0.18 + Math.sin(T * 0.3 + i) * 0.02;
        ctx.fillStyle = rgba(pal.light, 0.06);
        ctx.beginPath();
        ctx.moveTo(L.W * 0.8, -50);
        ctx.lineTo(L.W * 0.8 + Math.cos(a + 2) * L.W * 2, -50 + Math.sin(a + 2) * L.W * 2);
        ctx.lineTo(L.W * 0.8 + Math.cos(a + 2.06) * L.W * 2, -50 + Math.sin(a + 2.06) * L.W * 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  };
})();
