/* ==========================================================================
   VIRAL STUDIO ENGINE — objetos (props)
   Cada prop se dibuja centrado en (x, y); tamaño base ≈ 200 px con s = 1.
   Firma: VS.PROPS[nombre](ctx, st, x, y, s, T, opciones)
   ========================================================================== */
(function () {
  "use strict";
  const VS = window.VS;
  const { clamp, hash, mix, rgba, shade, E } = VS;
  const PI = Math.PI;
  const PROPS = (VS.PROPS = {});

  const OUT = (st) => (st.mode === "line" || st.mode === "neon" || st.mode === "chalk" ? st.ink : "#14110f");
  function begin(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }
  function F(ctx, st, col, path, lw = 6) {
    if (st.mode === "silhouette") col = st.ink;
    if (st.mode === "neon") {
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur = 22;
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      path(ctx);
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.fillStyle = col;
    path(ctx);
    ctx.fill();
    if (st.mode !== "silhouette") {
      ctx.strokeStyle = OUT(st);
      ctx.lineWidth = lw;
      path(ctx);
      ctx.stroke();
    }
  }
  function S(ctx, st, col, path, lw = 6) {
    ctx.save();
    if (st.mode === "silhouette") col = st.ink;
    if (st.mode === "neon") { ctx.shadowColor = col; ctx.shadowBlur = 18; }
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    path(ctx);
    ctx.stroke();
    ctx.restore();
  }
  const circ = (x, y, r) => (c) => { c.beginPath(); c.arc(x, y, r, 0, PI * 2); };
  const rect = (x, y, w, h, r = 0) => (c) => { if (r) VS.roundRect(c, x, y, w, h, r); else { c.beginPath(); c.rect(x, y, w, h); } };
  const poly = (pts) => (c) => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); };
  VS.P = { begin, F, S, circ, rect, poly, OUT };

  /* llama animada (también la usan antorchas y fogatas) */
  VS.flame = function (ctx, x, y, s, T, col1 = "#ffb43a", col2 = "#ff5a1f") {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    for (let i = 0; i < 3; i++) {
      const k = 1 - i * 0.3;
      const w = Math.sin(T * 9 + i * 2) * 3;
      ctx.fillStyle = i === 0 ? col2 : i === 1 ? col1 : "#fff3b0";
      if (i === 0) { ctx.shadowColor = col1; ctx.shadowBlur = 30; } else ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(-14 * k, 0);
      ctx.quadraticCurveTo(-18 * k + w, -22 * k, w * 1.5, -46 * k - Math.sin(T * 13 + i) * 5);
      ctx.quadraticCurveTo(18 * k + w, -22 * k, 14 * k, 0);
      ctx.quadraticCurveTo(0, 8 * k, -14 * k, 0);
      ctx.fill();
    }
    ctx.restore();
  };

  PROPS.calendar = (ctx, st, x, y, s, T, o = {}) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#f1e7d6", rect(-80, -90, 160, 180, 10));
    F(ctx, st, st.danger, rect(-80, -90, 160, 46, 10));
    S(ctx, st, OUT(st), (c) => { c.beginPath(); c.moveTo(-40, -104); c.lineTo(-40, -76); c.moveTo(40, -104); c.lineTo(40, -76); }, 8);
    if (st.mode !== "silhouette") VS.text(ctx, o.text || "1940", 0, 22, { size: o.text && String(o.text).length > 4 ? 40 : 56, font: st.fontDisplay, color: "#2a1d16", maxW: 140 });
    ctx.restore();
  };
  PROPS.clock = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#f1e7d6", circ(0, 0, 90));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      S(ctx, st, "#2a1d16", (c) => { c.beginPath(); c.moveTo(Math.cos(a) * 70, Math.sin(a) * 70); c.lineTo(Math.cos(a) * 80, Math.sin(a) * 80); }, 5);
    }
    const a1 = T * 2.2 - PI / 2, a2 = T * 0.4 - PI / 2;
    S(ctx, st, "#2a1d16", (c) => { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a1) * 62, Math.sin(a1) * 62); }, 6);
    S(ctx, st, st.danger, (c) => { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a2) * 42, Math.sin(a2) * 42); }, 9);
    ctx.restore();
  };
  PROPS.hourglass = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    const k = (T * 0.15) % 1;
    F(ctx, st, "#8a6a45", rect(-70, -100, 140, 16, 4));
    F(ctx, st, "#8a6a45", rect(-70, 84, 140, 16, 4));
    S(ctx, st, OUT(st), (c) => { c.beginPath(); c.moveTo(-55, -84); c.quadraticCurveTo(-55, -10, 0, 0); c.quadraticCurveTo(-55, 10, -55, 84); c.moveTo(55, -84); c.quadraticCurveTo(55, -10, 0, 0); c.quadraticCurveTo(55, 10, 55, 84); }, 6);
    ctx.fillStyle = st.accent;
    ctx.beginPath(); ctx.moveTo(-40 * (1 - k), -70 + k * 60); ctx.lineTo(40 * (1 - k), -70 + k * 60); ctx.lineTo(0, -4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-50, 82); ctx.lineTo(50, 82); ctx.lineTo(0, 82 - 60 * k); ctx.fill();
    ctx.fillRect(-2, -4, 4, 86);
    ctx.restore();
  };
  PROPS.money = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    for (let i = 0; i < 5; i++) {
      F(ctx, st, i % 2 ? "#5fae63" : "#6fbf73", rect(-90 + i * 4, 40 - i * 22, 180, 44, 4), 4);
    }
    if (st.mode !== "silhouette") VS.text(ctx, "$", 18, -50, { size: 46, font: st.fontDisplay, color: "#2f6b33" });
    ctx.restore();
  };
  PROPS.coin = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    const w = Math.abs(Math.cos(T * 3)) * 0.8 + 0.2;
    ctx.scale(w, 1);
    F(ctx, st, st.accent, circ(0, 0, 80));
    S(ctx, st, shade(st.accent, -0.35), circ(0, 0, 60), 5);
    if (st.mode !== "silhouette") VS.text(ctx, "$", 0, 4, { size: 80, font: st.fontDisplay, color: shade(st.accent, -0.45) });
    ctx.restore();
  };
  PROPS.gold = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    const bar = (bx, by) => F(ctx, st, st.accent, poly([[bx - 50, by + 22], [bx + 50, by + 22], [bx + 36, by - 22], [bx - 36, by - 22]]), 4);
    bar(-55, 50); bar(55, 50); bar(0, 6);
    ctx.restore();
  };
  PROPS.diamond = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    F(ctx, st, st.cool, poly([[-80, -30], [-40, -75], [40, -75], [80, -30], [0, 85]]));
    S(ctx, st, shade(st.cool, 0.5), (c) => { c.beginPath(); c.moveTo(-80, -30); c.lineTo(80, -30); c.moveTo(-40, -75); c.lineTo(-20, -30); c.lineTo(0, 85); c.lineTo(20, -30); c.lineTo(40, -75); }, 4);
    const g = (T * 0.6) % 1;
    ctx.globalAlpha *= 1 - g;
    S(ctx, st, "#ffffff", (c) => { c.beginPath(); c.moveTo(-40 - g * 30, -100); c.lineTo(-40 - g * 30, -70); c.moveTo(-55 - g * 30, -85); c.lineTo(-25 - g * 30, -85); }, 4);
    ctx.restore();
  };
  PROPS.skull = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#ece6d8", (c) => { c.beginPath(); c.arc(0, -15, 75, PI * 0.8, PI * 2.2); c.lineTo(42, 70); c.lineTo(-42, 70); c.closePath(); });
    ctx.fillStyle = "#14110f";
    ctx.beginPath(); ctx.ellipse(-30, -10, 20, 24, 0, 0, 7); ctx.ellipse(30, -10, 20, 24, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(-10, 38); ctx.lineTo(10, 38); ctx.fill();
    for (let i = -2; i <= 2; i++) ctx.fillRect(i * 14 - 3, 52, 6, 16);
    ctx.restore();
  };
  PROPS.crown = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    F(ctx, st, st.accent, poly([[-90, 50], [-100, -50], [-50, 0], [0, -75], [50, 0], [100, -50], [90, 50]]));
    ctx.fillStyle = st.danger; ctx.beginPath(); ctx.arc(0, 18, 12, 0, 7); ctx.arc(-50, 25, 9, 0, 7); ctx.arc(50, 25, 9, 0, 7); ctx.fill();
    ctx.restore();
  };
  PROPS.sword = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    ctx.rotate(-PI / 4);
    F(ctx, st, "#cfd6de", poly([[-10, -100], [0, -125], [10, -100], [10, 40], [-10, 40]]), 4);
    F(ctx, st, st.accent, rect(-45, 40, 90, 14, 6), 4);
    F(ctx, st, "#6b4a2e", rect(-8, 54, 16, 50, 4), 4);
    ctx.restore();
  };
  PROPS.shield = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    F(ctx, st, st.cool, (c) => { c.beginPath(); c.moveTo(-80, -80); c.lineTo(80, -80); c.quadraticCurveTo(85, 40, 0, 100); c.quadraticCurveTo(-85, 40, -80, -80); c.closePath(); });
    S(ctx, st, st.accent, (c) => { c.beginPath(); c.moveTo(0, -70); c.lineTo(0, 85); c.moveTo(-65, -10); c.lineTo(65, -10); }, 10);
    ctx.restore();
  };
  PROPS.book = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#f1e7d6", poly([[-95, -60], [0, -45], [95, -60], [95, 60], [0, 75], [-95, 60]]));
    S(ctx, st, OUT(st), (c) => { c.beginPath(); c.moveTo(0, -45); c.lineTo(0, 75); for (let i = 0; i < 4; i++) { c.moveTo(-75, -30 + i * 22); c.lineTo(-20, -22 + i * 22); c.moveTo(20, -22 + i * 22); c.lineTo(75, -30 + i * 22); } }, 3);
    ctx.restore();
  };
  PROPS.scroll = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#e9d9b4", rect(-70, -90, 140, 180));
    F(ctx, st, "#cdb88c", rect(-85, -105, 170, 24, 12));
    F(ctx, st, "#cdb88c", rect(-85, 82, 170, 24, 12));
    S(ctx, st, "#6b5a48", (c) => { c.beginPath(); for (let i = 0; i < 6; i++) { c.moveTo(-50, -60 + i * 24); c.lineTo(50 - (i % 2) * 20, -60 + i * 24); } }, 3);
    ctx.restore();
  };
  PROPS.letter = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#f1e7d6", rect(-100, -65, 200, 130, 6));
    S(ctx, st, OUT(st), (c) => { c.beginPath(); c.moveTo(-100, -65); c.lineTo(0, 15); c.lineTo(100, -65); }, 5);
    F(ctx, st, st.danger, circ(0, 15, 16), 3);
    ctx.restore();
  };
  PROPS.newspaper = (ctx, st, x, y, s, T, o = {}) => {
    begin(ctx, x, y, s);
    ctx.rotate(-0.06);
    F(ctx, st, "#ece6d8", rect(-110, -80, 220, 160, 2));
    if (st.mode !== "silhouette") VS.text(ctx, o.text || "EXTRA", 0, -50, { size: 30, font: st.fontSerif || "EB Garamond", weight: 700, color: "#14110f", maxW: 190 });
    S(ctx, st, "#555", (c) => { c.beginPath(); for (let i = 0; i < 5; i++) { c.moveTo(-95, -18 + i * 20); c.lineTo(-10, -18 + i * 20); } c.rect(10, -24, 85, 84); }, 3);
    ctx.restore();
  };
  PROPS.phone = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#15171c", rect(-55, -100, 110, 200, 18));
    ctx.fillStyle = st.mode === "silhouette" ? st.ink : st.cool;
    VS.roundRect(ctx, -45, -84, 90, 160, 8); ctx.fill();
    if (st.mode !== "silhouette") {
      ctx.fillStyle = "#fff";
      const n = Math.floor(T * 2) % 4;
      for (let i = 0; i <= n; i++) { VS.roundRect(ctx, -36, -70 + i * 34, 60, 24, 8); ctx.fill(); }
    }
    ctx.restore();
  };
  PROPS.computer = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#2a2d35", rect(-110, -85, 220, 140, 10));
    ctx.fillStyle = st.mode === "silhouette" ? st.ink : "#0d1b2a";
    ctx.fillRect(-98, -73, 196, 116);
    if (st.mode !== "silhouette") {
      ctx.fillStyle = st.good;
      for (let i = 0; i < 5; i++) ctx.fillRect(-88, -62 + i * 20, 40 + hash(i + Math.floor(T * 4)) * 110, 8);
    }
    F(ctx, st, "#2a2d35", poly([[-30, 55], [30, 55], [45, 85], [-45, 85]]));
    ctx.restore();
  };
  PROPS.lightbulb = (ctx, st, x, y, s, T, o = {}) => {
    begin(ctx, x, y, s);
    const on = o.on == null ? true : o.on;
    if (on && st.mode !== "silhouette") {
      const g = ctx.createRadialGradient(0, -20, 10, 0, -20, 170);
      g.addColorStop(0, rgba(st.accent, 0.55));
      g.addColorStop(1, rgba(st.accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-170, -190, 340, 340);
    }
    F(ctx, st, on ? "#ffe9a8" : "#cfcfcf", (c) => { c.beginPath(); c.arc(0, -30, 65, PI * 0.78, PI * 2.22); c.lineTo(28, 55); c.lineTo(-28, 55); c.closePath(); });
    F(ctx, st, "#9aa0a8", rect(-30, 55, 60, 36, 6), 4);
    S(ctx, st, "#c48a2a", (c) => { c.beginPath(); c.moveTo(-15, 40); c.lineTo(-15, -10); c.lineTo(0, -30); c.lineTo(15, -10); c.lineTo(15, 40); }, 4);
    if (on) for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2 + 0.2, r1 = 95 + Math.sin(T * 6 + i) * 6;
      S(ctx, st, st.accent, (c) => { c.beginPath(); c.moveTo(Math.cos(a) * r1, -30 + Math.sin(a) * r1); c.lineTo(Math.cos(a) * (r1 + 25), -30 + Math.sin(a) * (r1 + 25)); }, 6);
    }
    ctx.restore();
  };
  PROPS.bomb = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#1d1f24", circ(0, 15, 80));
    F(ctx, st, "#3a3d45", rect(-22, -78, 44, 26, 4), 4);
    S(ctx, st, "#8a6a45", (c) => { c.beginPath(); c.moveTo(0, -78); c.quadraticCurveTo(25, -120, 55, -105); }, 6);
    VS.flame(ctx, 58, -100, 0.6, T);
    ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.beginPath(); ctx.arc(-28, -15, 18, 0, 7); ctx.fill();
    ctx.restore();
  };
  PROPS.fire = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    S(ctx, st, "#6b4a2e", (c) => { c.beginPath(); c.moveTo(-70, 70); c.lineTo(70, 40); c.moveTo(-70, 40); c.lineTo(70, 70); }, 18);
    VS.flame(ctx, 0, 50, 2.6, T);
    ctx.restore();
  };
  PROPS.heart = (ctx, st, x, y, s, T, o = {}) => {
    begin(ctx, x, y, s);
    const p = 1 + Math.max(0, Math.sin(T * 7)) ** 6 * 0.08;
    ctx.scale(p, p);
    const path = (c) => { c.beginPath(); c.moveTo(0, 85); c.bezierCurveTo(-120, 10, -90, -90, 0, -40); c.bezierCurveTo(90, -90, 120, 10, 0, 85); c.closePath(); };
    F(ctx, st, st.danger, path);
    if (o.broken) S(ctx, st, st.bg, (c) => { c.beginPath(); c.moveTo(0, -40); c.lineTo(-15, 0); c.lineTo(12, 25); c.lineTo(-5, 85); }, 9);
    ctx.restore();
  };
  PROPS.broken_heart = (ctx, st, x, y, s, T) => PROPS.heart(ctx, st, x, y, s, T, { broken: true });
  PROPS.question = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    VS.text(ctx, "?", 0, 0, { size: 230, font: st.fontDisplay, color: st.accent, stroke: st.mode === "comic" ? "#14110f" : null, glow: st.mode === "neon" ? st.accent : null });
    ctx.restore();
  };
  PROPS.exclamation = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    VS.text(ctx, "!", 0, 0, { size: 240, font: st.fontDisplay, color: st.danger, stroke: st.mode === "comic" ? "#14110f" : null, glow: st.mode === "neon" ? st.danger : null });
    ctx.restore();
  };
  PROPS.rocket = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    ctx.rotate(0.5);
    VS.flame(ctx, 0, 95, 1.8, T * 1.5, "#ffd36a", "#ff6a2a");
    F(ctx, st, "#e8e8ec", (c) => { c.beginPath(); c.moveTo(0, -110); c.quadraticCurveTo(45, -60, 38, 70); c.lineTo(-38, 70); c.quadraticCurveTo(-45, -60, 0, -110); c.closePath(); });
    F(ctx, st, st.danger, poly([[-38, 30], [-70, 85], [-38, 70]]), 4);
    F(ctx, st, st.danger, poly([[38, 30], [70, 85], [38, 70]]), 4);
    F(ctx, st, st.cool, circ(0, -30, 18), 4);
    ctx.restore();
  };
  PROPS.planet = (ctx, st, x, y, s, T, o = {}) => {
    begin(ctx, x, y, s);
    const col = o.color || "#c9874a";
    F(ctx, st, col, circ(0, 0, 80));
    if (st.mode !== "silhouette") {
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 80, 0, 7); ctx.clip();
      ctx.fillStyle = shade(col, -0.2);
      for (let i = 0; i < 4; i++) ctx.fillRect(-90, -50 + i * 30 + Math.sin(T + i) * 3, 180, 10);
      ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.arc(30, 20, 90, 0, 7); ctx.fill();
      ctx.restore();
    }
    S(ctx, st, shade(col, 0.4), (c) => { c.beginPath(); c.ellipse(0, 0, 135, 30, -0.3, 0.1 * PI, 0.95 * PI, true); }, 8);
    ctx.restore();
  };
  PROPS.globe = (ctx, st, x, y, s, T) => VS.drawGlobe(ctx, st, x, y, 90 * s, T * 0.4, null);
  PROPS.key = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    ctx.rotate(-0.5);
    F(ctx, st, st.accent, circ(-55, 0, 42));
    ctx.fillStyle = st.bg; ctx.beginPath(); ctx.arc(-55, 0, 16, 0, 7); ctx.fill();
    F(ctx, st, st.accent, rect(-15, -12, 130, 24, 4), 4);
    F(ctx, st, st.accent, rect(80, 10, 18, 34, 2), 4);
    F(ctx, st, st.accent, rect(50, 10, 16, 24, 2), 4);
    ctx.restore();
  };
  PROPS.lock = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    S(ctx, st, "#9aa0a8", (c) => { c.beginPath(); c.arc(0, -30, 48, PI, 0); c.lineTo(48, 10); c.moveTo(-48, -30); c.lineTo(-48, 10); }, 20);
    F(ctx, st, st.accent, rect(-80, -5, 160, 115, 14));
    ctx.fillStyle = "#14110f"; ctx.beginPath(); ctx.arc(0, 40, 14, 0, 7); ctx.fill(); ctx.fillRect(-6, 40, 12, 36);
    ctx.restore();
  };
  PROPS.door = (ctx, st, x, y, s, T, o = {}) => {
    begin(ctx, x, y, s);
    const open = o.open == null ? clamp(Math.sin(T * 0.8)) * 0.8 : o.open;
    F(ctx, st, "#100d0b", rect(-70, -120, 140, 240));
    if (open > 0.05 && st.mode !== "silhouette") {
      const g = ctx.createLinearGradient(-70, 0, 70, 0);
      g.addColorStop(0, rgba(st.accent, 0.9)); g.addColorStop(1, rgba(st.accent, 0.2));
      ctx.fillStyle = g; ctx.fillRect(-66, -116, 132, 232);
    }
    F(ctx, st, "#6b4a2e", poly([[-70, -120], [-70 + 140 * (1 - open), -120 - 20 * open], [-70 + 140 * (1 - open), 140 + 20 * open - 20], [-70, 120]]));
    ctx.restore();
  };
  PROPS.house = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#b78b5b", rect(-90, -20, 180, 120));
    F(ctx, st, st.danger, poly([[-110, -15], [0, -110], [110, -15]]));
    F(ctx, st, "#3a2a1c", rect(-22, 30, 44, 70));
    F(ctx, st, "#ffe9a8", rect(35, 10, 36, 32), 4);
    ctx.restore();
  };
  PROPS.car = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    F(ctx, st, st.danger, (c) => { c.beginPath(); c.moveTo(-120, 30); c.lineTo(-115, -10); c.lineTo(-60, -20); c.lineTo(-30, -60); c.lineTo(50, -60); c.lineTo(80, -20); c.lineTo(120, -12); c.lineTo(122, 30); c.closePath(); });
    F(ctx, st, st.cool, poly([[-22, -52], [10, -52], [10, -22], [-48, -22]]), 4);
    F(ctx, st, st.cool, poly([[20, -52], [45, -52], [68, -22], [20, -22]]), 4);
    for (const wx of [-70, 75]) {
      F(ctx, st, "#1d1f24", circ(wx, 30, 28));
      S(ctx, st, "#9aa0a8", (c) => { c.beginPath(); const a = T * 12; c.moveTo(wx + Math.cos(a) * 18, 30 + Math.sin(a) * 18); c.lineTo(wx - Math.cos(a) * 18, 30 - Math.sin(a) * 18); }, 4);
    }
    ctx.restore();
  };
  PROPS.ship = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y + Math.sin(T * 1.5) * 4, s);
    ctx.rotate(Math.sin(T * 1.2) * 0.04);
    F(ctx, st, "#6b4a2e", poly([[-130, 0], [130, 0], [95, 55], [-100, 55]]));
    S(ctx, st, "#4a3426", (c) => { c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -170); }, 8);
    F(ctx, st, "#ece6d8", (c) => { c.beginPath(); c.moveTo(6, -160); c.quadraticCurveTo(80 + Math.sin(T * 2) * 8, -95, 6, -20); c.closePath(); }, 4);
    F(ctx, st, "#ece6d8", (c) => { c.beginPath(); c.moveTo(-6, -140); c.quadraticCurveTo(-60, -90, -6, -30); c.closePath(); }, 4);
    ctx.restore();
  };
  PROPS.plane = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y + Math.sin(T * 2) * 5, s);
    F(ctx, st, "#e8e8ec", (c) => { c.beginPath(); c.ellipse(0, 0, 130, 24, 0, 0, 7); });
    F(ctx, st, "#c9ced6", poly([[-20, 0], [40, 0], [-30, 80], [-55, 80]]), 4);
    F(ctx, st, "#c9ced6", poly([[-20, 0], [40, 0], [-30, -70], [-55, -70]]), 4);
    F(ctx, st, st.danger, poly([[-110, -5], [-135, -60], [-100, -60], [-80, -10]]), 4);
    ctx.restore();
  };
  PROPS.trophy = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    S(ctx, st, st.accent, (c) => { c.beginPath(); c.arc(-62, -40, 30, PI * 0.5, PI * 1.5); c.moveTo(62, -70); c.arc(62, -40, 30, -PI * 0.5, PI * 0.5); }, 12);
    F(ctx, st, st.accent, (c) => { c.beginPath(); c.moveTo(-65, -90); c.lineTo(65, -90); c.quadraticCurveTo(60, 20, 0, 30); c.quadraticCurveTo(-60, 20, -65, -90); c.closePath(); });
    F(ctx, st, st.accent, rect(-12, 28, 24, 40), 4);
    F(ctx, st, "#6b4a2e", rect(-55, 66, 110, 30, 4), 4);
    ctx.restore();
  };
  PROPS.medal = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    F(ctx, st, st.danger, poly([[-40, -110], [-10, -110], [20, -20], [-10, -20]]), 4);
    F(ctx, st, st.cool, poly([[40, -110], [10, -110], [-20, -20], [10, -20]]), 4);
    F(ctx, st, st.accent, circ(0, 30, 60));
    VS.text(ctx, "★", 0, 32, { size: 70, color: shade(st.accent, -0.4), font: "Montserrat" });
    ctx.restore();
  };
  PROPS.flask = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    const liq = (c) => { c.beginPath(); c.moveTo(-64, 70); c.lineTo(64, 70); c.lineTo(36, 10); c.lineTo(-36, 10); c.closePath(); };
    F(ctx, st, st.good, liq, 0.1);
    S(ctx, st, OUT(st), (c) => { c.beginPath(); c.moveTo(-22, -90); c.lineTo(-22, -20); c.lineTo(-80, 85); c.lineTo(80, 85); c.lineTo(22, -20); c.lineTo(22, -90); }, 7);
    for (let i = 0; i < 4; i++) {
      const k = (T * 0.7 + i * 0.25) % 1;
      ctx.fillStyle = rgba(st.good, 1 - k);
      ctx.beginPath(); ctx.arc(-10 + i * 8 + Math.sin(T * 4 + i) * 6, 50 - k * 150, 6 + i * 2, 0, 7); ctx.fill();
    }
    ctx.restore();
  };
  PROPS.potion = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#8a4fd0", circ(0, 25, 70));
    F(ctx, st, "#cfd6de", rect(-20, -80, 40, 40, 4), 4);
    F(ctx, st, "#6b4a2e", rect(-26, -100, 52, 22, 6), 4);
    ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.arc(-25, 5, 14, 0, 7); ctx.fill();
    ctx.restore();
  };
  PROPS.pill = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    ctx.rotate(-0.6);
    F(ctx, st, st.danger, (c) => { c.beginPath(); c.arc(-40, 0, 38, PI * 0.5, PI * 1.5); c.lineTo(0, -38); c.lineTo(0, 38); c.closePath(); });
    F(ctx, st, "#f1e7d6", (c) => { c.beginPath(); c.arc(40, 0, 38, -PI * 0.5, PI * 0.5); c.lineTo(0, 38); c.lineTo(0, -38); c.closePath(); });
    ctx.restore();
  };
  PROPS.syringe = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    ctx.rotate(-0.7);
    F(ctx, st, "#e6f2f7", rect(-80, -22, 140, 44, 6));
    ctx.fillStyle = st.cool; ctx.fillRect(-20, -16, 76, 32);
    S(ctx, st, OUT(st), (c) => { c.beginPath(); c.moveTo(60, 0); c.lineTo(120, 0); c.moveTo(-80, 0); c.lineTo(-120, 0); c.moveTo(-120, -26); c.lineTo(-120, 26); }, 6);
    ctx.restore();
  };
  PROPS.dna = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    for (let i = 0; i < 14; i++) {
      const yy = -110 + i * 17, a = i * 0.55 + T * 2;
      const x1 = Math.sin(a) * 55, x2 = -x1;
      S(ctx, st, rgba(st.ink, 0.6), (c) => { c.beginPath(); c.moveTo(x1, yy); c.lineTo(x2, yy); }, 4);
      F(ctx, st, st.cool, circ(x1, yy, 9), 2);
      F(ctx, st, st.danger, circ(x2, yy, 9), 2);
    }
    ctx.restore();
  };
  PROPS.brain = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#e89ab0", (c) => { c.beginPath(); c.moveTo(-100, 20); c.bezierCurveTo(-120, -90, 0, -110, 10, -80); c.bezierCurveTo(30, -110, 130, -80, 100, 10); c.bezierCurveTo(110, 70, 30, 80, 0, 60); c.bezierCurveTo(-40, 85, -110, 70, -100, 20); c.closePath(); });
    S(ctx, st, shade("#e89ab0", -0.35), (c) => { c.beginPath(); c.moveTo(0, -80); c.bezierCurveTo(-20, -30, 20, 0, 0, 60); c.moveTo(-60, -40); c.quadraticCurveTo(-30, -10, -70, 20); c.moveTo(55, -45); c.quadraticCurveTo(30, -5, 65, 25); }, 5);
    ctx.restore();
  };
  PROPS.eye = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    const bl = ((T % 3.2) > 3.05) ? 0.1 : 1;
    ctx.scale(1, bl);
    F(ctx, st, "#f1e7d6", (c) => { c.beginPath(); c.moveTo(-120, 0); c.quadraticCurveTo(0, -95, 120, 0); c.quadraticCurveTo(0, 95, -120, 0); c.closePath(); });
    F(ctx, st, st.danger, circ(Math.sin(T * 0.9) * 22, 0, 42), 4);
    ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(Math.sin(T * 0.9) * 22, 0, 18, 0, 7); ctx.fill();
    ctx.restore();
  };
  PROPS.crystal_ball = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    const g = ctx.createRadialGradient(-20, -30, 5, 0, -10, 90);
    g.addColorStop(0, "#e8dcff"); g.addColorStop(1, "#5a3fa0");
    F(ctx, st, g, circ(0, -10, 85));
    ctx.save(); ctx.globalAlpha *= 0.5 + Math.sin(T * 3) * 0.2; ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(Math.sin(T) * 20, -10 + Math.cos(T * 1.3) * 15, 20, 0, 7); ctx.fill(); ctx.restore();
    F(ctx, st, "#6b4a2e", poly([[-60, 70], [60, 70], [80, 100], [-80, 100]]));
    ctx.restore();
  };
  PROPS.cross = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    if (st.mode !== "silhouette") {
      const g = ctx.createRadialGradient(0, -20, 10, 0, -20, 180);
      g.addColorStop(0, rgba(st.accent, 0.5)); g.addColorStop(1, rgba(st.accent, 0));
      ctx.fillStyle = g; ctx.fillRect(-180, -200, 360, 360);
    }
    F(ctx, st, "#8a6a45", rect(-16, -110, 32, 220, 4));
    F(ctx, st, "#8a6a45", rect(-70, -60, 140, 30, 4));
    ctx.restore();
  };
  PROPS.star = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    ctx.rotate(T * 0.5);
    const pts = [];
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 40 : 95, a = -PI / 2 + (i * PI) / 5; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    F(ctx, st, st.accent, poly(pts));
    ctx.restore();
  };
  PROPS.flag = (ctx, st, x, y, s, T, o = {}) => {
    begin(ctx, x, y, s);
    S(ctx, st, "#6b4a2e", (c) => { c.beginPath(); c.moveTo(-70, 110); c.lineTo(-70, -110); }, 10);
    const col = o.color || st.danger;
    F(ctx, st, col, (c) => { c.beginPath(); c.moveTo(-70, -110); for (let i = 0; i <= 10; i++) c.lineTo(-70 + i * 15, -110 + Math.sin(T * 5 + i * 0.6) * 9); for (let i = 10; i >= 0; i--) c.lineTo(-70 + i * 15, -20 + Math.sin(T * 5 + i * 0.6) * 9); c.closePath(); }, 4);
    ctx.restore();
  };
  PROPS.map = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#e9d9b4", poly([[-120, -80], [-40, -95], [40, -80], [120, -95], [120, 80], [40, 95], [-40, 80], [-120, 95]]));
    S(ctx, st, st.danger, (c) => { c.setLineDash([10, 10]); c.beginPath(); c.moveTo(-90, 50); c.quadraticCurveTo(-20, -60, 60, -10); }, 5);
    ctx.setLineDash([]);
    S(ctx, st, st.danger, (c) => { c.beginPath(); c.moveTo(50, -20); c.lineTo(70, 0); c.moveTo(70, -20); c.lineTo(50, 0); }, 7);
    ctx.restore();
  };
  PROPS.bell = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    ctx.rotate(Math.sin(T * 6) * 0.25);
    F(ctx, st, st.accent, (c) => { c.beginPath(); c.moveTo(-80, 60); c.quadraticCurveTo(-70, -90, 0, -90); c.quadraticCurveTo(70, -90, 80, 60); c.closePath(); });
    F(ctx, st, shade(st.accent, -0.3), circ(0, 72, 16), 4);
    ctx.restore();
  };
  PROPS.candle = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#f1e7d6", rect(-25, -40, 50, 140, 6));
    VS.flame(ctx, 0, -42, 1.2, T);
    ctx.restore();
  };
  PROPS.ring = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    S(ctx, st, st.accent, (c) => { c.beginPath(); c.ellipse(0, 25, 70, 62, 0, 0, 7); }, 18);
    PROPS.diamond(ctx, st, 0, -60, 0.35, T);
    ctx.restore();
  };
  PROPS.coffin = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#4a3426", poly([[-40, -120], [40, -120], [70, -50], [45, 120], [-45, 120], [-70, -50]]));
    S(ctx, st, st.accent, (c) => { c.beginPath(); c.moveTo(0, -80); c.lineTo(0, 20); c.moveTo(-30, -45); c.lineTo(30, -45); }, 8);
    ctx.restore();
  };
  PROPS.tree = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#5a3d26", rect(-16, 0, 32, 110, 4));
    ctx.rotate(Math.sin(T * 1.2) * 0.02);
    F(ctx, st, st.good, (c) => { c.beginPath(); c.arc(0, -40, 75, 0, 7); c.arc(-55, 0, 50, 0, 7); c.arc(55, 0, 50, 0, 7); });
    ctx.restore();
  };
  PROPS.magnifier = (ctx, st, x, y, s, T) => {
    begin(ctx, x + Math.sin(T * 1.5) * 10, y, s);
    S(ctx, st, "#6b4a2e", (c) => { c.beginPath(); c.moveTo(45, 45); c.lineTo(110, 110); }, 22);
    ctx.fillStyle = rgba(st.cool, 0.25); ctx.beginPath(); ctx.arc(0, 0, 70, 0, 7); ctx.fill();
    S(ctx, st, "#9aa0a8", circ(0, 0, 70), 14);
    ctx.restore();
  };
  PROPS.chain = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    for (let i = 0; i < 5; i++) S(ctx, st, "#9aa0a8", (c) => { c.beginPath(); c.ellipse(-120 + i * 60, Math.sin(T * 2 + i) * 4, 34, 20, i % 2 ? 0.0 : 0, 0, 7); }, 10);
    ctx.restore();
  };
  PROPS.handcuffs = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    S(ctx, st, "#9aa0a8", (c) => { c.beginPath(); c.arc(-55, 20, 45, 0, 7); c.moveTo(100, 20); c.arc(55, 20, 45, 0, 7); c.moveTo(-15, 0); c.lineTo(15, 0); }, 14);
    ctx.restore();
  };
  PROPS.camera = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#2a2d35", rect(-100, -55, 200, 125, 14));
    F(ctx, st, "#2a2d35", rect(-40, -80, 70, 30, 6));
    F(ctx, st, "#14161a", circ(0, 8, 46));
    F(ctx, st, st.cool, circ(0, 8, 26), 4);
    if (Math.floor(T * 1.5) % 2 === 0) { ctx.fillStyle = st.danger; ctx.beginPath(); ctx.arc(75, -35, 9, 0, 7); ctx.fill(); }
    ctx.restore();
  };
  PROPS.microphone = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#9aa0a8", rect(-38, -110, 76, 120, 38));
    S(ctx, st, OUT(st), (c) => { c.beginPath(); c.arc(0, -20, 60, 0, PI); c.moveTo(0, 40); c.lineTo(0, 100); c.moveTo(-40, 100); c.lineTo(40, 100); }, 8);
    ctx.restore();
  };
  PROPS.chart_up = (ctx, st, x, y, s, T, o = {}) => {
    begin(ctx, x, y, s);
    const k = o.k == null ? 1 : o.k;
    S(ctx, st, OUT(st), (c) => { c.beginPath(); c.moveTo(-110, -100); c.lineTo(-110, 90); c.lineTo(120, 90); }, 6);
    const pts = [[-100, 70], [-50, 30], [-10, 45], [40, -20], [100, -85]];
    S(ctx, st, st.good, (c) => { c.beginPath(); pts.forEach((p, i) => { if (i / 4 <= k + 0.001) (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); }); }, 10);
    if (k > 0.95) F(ctx, st, st.good, poly([[100, -85], [70, -78], [94, -55]]), 4);
    ctx.restore();
  };
  PROPS.chart_down = (ctx, st, x, y, s, T, o = {}) => {
    begin(ctx, x, y, s);
    S(ctx, st, OUT(st), (c) => { c.beginPath(); c.moveTo(-110, -100); c.lineTo(-110, 90); c.lineTo(120, 90); }, 6);
    const pts = [[-100, -80], [-50, -40], [-10, -55], [40, 20], [100, 70]];
    S(ctx, st, st.danger, (c) => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); }, 10);
    ctx.restore();
  };
  PROPS.atom = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    for (let i = 0; i < 3; i++) S(ctx, st, st.cool, (c) => { c.beginPath(); c.ellipse(0, 0, 110, 38, (i * PI) / 3, 0, 7); }, 5);
    F(ctx, st, st.danger, circ(0, 0, 20), 3);
    for (let i = 0; i < 3; i++) {
      const a = T * 2.4 + i * 2.1, r = (i * PI) / 3;
      const ex = Math.cos(a) * 110, ey = Math.sin(a) * 38;
      F(ctx, st, st.accent, circ(ex * Math.cos(r) - ey * Math.sin(r), ex * Math.sin(r) + ey * Math.cos(r), 10), 2);
    }
    ctx.restore();
  };
  PROPS.virus = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    ctx.rotate(T * 0.4);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * PI * 2;
      S(ctx, st, "#6fbf73", (c) => { c.beginPath(); c.moveTo(Math.cos(a) * 60, Math.sin(a) * 60); c.lineTo(Math.cos(a) * 100, Math.sin(a) * 100); }, 8);
      F(ctx, st, "#6fbf73", circ(Math.cos(a) * 104, Math.sin(a) * 104, 12), 3);
    }
    F(ctx, st, "#4f9a53", circ(0, 0, 66));
    ctx.restore();
  };
  PROPS.bread = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#c98a4a", (c) => { c.beginPath(); c.ellipse(0, 0, 120, 55, 0, 0, 7); });
    S(ctx, st, shade("#c98a4a", -0.35), (c) => { c.beginPath(); for (let i = -2; i <= 2; i++) { c.moveTo(i * 38 - 15, -25); c.lineTo(i * 38 + 15, 15); } }, 6);
    ctx.restore();
  };
  PROPS.apple = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    F(ctx, st, st.danger, (c) => { c.beginPath(); c.moveTo(0, -55); c.bezierCurveTo(-90, -95, -110, 40, -30, 85); c.quadraticCurveTo(0, 70, 30, 85); c.bezierCurveTo(110, 40, 90, -95, 0, -55); c.closePath(); });
    S(ctx, st, "#5a3d26", (c) => { c.beginPath(); c.moveTo(0, -55); c.lineTo(8, -95); }, 8);
    F(ctx, st, st.good, (c) => { c.beginPath(); c.ellipse(32, -88, 26, 12, -0.5, 0, 7); }, 3);
    ctx.restore();
  };
  PROPS.ticket = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    ctx.rotate(-0.12);
    F(ctx, st, st.accent, rect(-120, -55, 240, 110, 10));
    S(ctx, st, OUT(st), (c) => { c.setLineDash([8, 8]); c.beginPath(); c.moveTo(60, -50); c.lineTo(60, 50); }, 4);
    ctx.setLineDash([]);
    ctx.restore();
  };
  PROPS.suitcase = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    S(ctx, st, "#3a2a1c", (c) => { VS.roundRect(c, -35, -95, 70, 40, 10); }, 12);
    F(ctx, st, "#7b5a47", rect(-110, -60, 220, 150, 12));
    S(ctx, st, "#c99a3e", (c) => { c.beginPath(); c.moveTo(-60, -60); c.lineTo(-60, 90); c.moveTo(60, -60); c.lineTo(60, 90); }, 8);
    ctx.restore();
  };
  PROPS.baby = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#f1e7d6", (c) => { c.beginPath(); c.ellipse(0, 20, 110, 60, -0.15, 0, 7); });
    F(ctx, st, st.skin, circ(80, -20, 42));
    if (st.mode !== "silhouette") VS.drawFace(ctx, st, 86, -20, 42, "calm", 1, 0, 0);
    ctx.restore();
  };
  PROPS.tank = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#4f5a45", rect(-140, -10, 280, 60, 18));
    F(ctx, st, "#5f6b52", rect(-70, -60, 130, 55, 12));
    S(ctx, st, "#4f5a45", (c) => { c.beginPath(); c.moveTo(50, -40); c.lineTo(170, -55); }, 16);
    for (let i = 0; i < 6; i++) F(ctx, st, "#2a2d24", circ(-115 + i * 46, 50, 16), 3);
    ctx.restore();
  };
  PROPS.train = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#2a2d35", rect(-140, -70, 200, 110, 6));
    F(ctx, st, "#2a2d35", rect(60, -30, 90, 70, 6));
    F(ctx, st, "#2a2d35", rect(100, -80, 30, 50, 4));
    for (let i = 0; i < 4; i++) F(ctx, st, "#14161a", circ(-110 + i * 70, 50, 22), 3);
    for (let i = 0; i < 3; i++) F(ctx, st, "#ffe9a8", rect(-125 + i * 60, -50, 40, 34, 3), 3);
    for (let i = 0; i < 4; i++) {
      const k = (T * 0.8 + i * 0.25) % 1;
      ctx.fillStyle = rgba("#cfcfcf", 0.6 * (1 - k));
      ctx.beginPath(); ctx.arc(115 - k * 90, -90 - k * 90, 18 + k * 30, 0, 7); ctx.fill();
    }
    ctx.restore();
  };
  PROPS.wall = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    for (let r = 0; r < 6; r++) for (let i = 0; i < 6; i++) F(ctx, st, i % 2 ? "#8a4a3a" : "#7a3f31", rect(-150 + i * 50 + (r % 2) * 25, -110 + r * 37, 48, 34, 2), 2);
    ctx.restore();
  };
  PROPS.gun = PROPS.sword; // no se dibujan armas de fuego: se sustituye por una espada
  PROPS.weapon = PROPS.sword;
  PROPS.ghost = (ctx, st, x, y, s, T) => VS.drawGhost(ctx, st, { x, y: y + 100 * s, s: s * 0.9, T });
  PROPS.reaper = (ctx, st, x, y, s, T) => VS.drawReaper(ctx, st, { x, y: y + 150 * s, s: s * 0.8, T, dir: 1 });
  PROPS.moon = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#f1ead2", circ(0, 0, 80));
    ctx.fillStyle = "rgba(0,0,0,.12)";
    ctx.beginPath(); ctx.arc(-25, -15, 16, 0, 7); ctx.arc(20, 25, 12, 0, 7); ctx.arc(30, -30, 8, 0, 7); ctx.fill();
    ctx.restore();
  };
  PROPS.sun = (ctx, st, x, y, s, T) => {
    begin(ctx, x, y, s);
    ctx.rotate(T * 0.2);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; S(ctx, st, st.accent, (c) => { c.beginPath(); c.moveTo(Math.cos(a) * 95, Math.sin(a) * 95); c.lineTo(Math.cos(a) * 125, Math.sin(a) * 125); }, 10); }
    F(ctx, st, st.accent, circ(0, 0, 80));
    ctx.restore();
  };
  PROPS.cloud = (ctx, st, x, y, s, T) => {
    begin(ctx, x + Math.sin(T * 0.4) * 10, y, s);
    F(ctx, st, "#e8eaee", (c) => { c.beginPath(); c.arc(-60, 10, 45, 0, 7); c.arc(0, -15, 60, 0, 7); c.arc(60, 10, 45, 0, 7); c.rect(-60, 10, 120, 45); }, 0.01);
    ctx.restore();
  };
  PROPS.lightning = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    F(ctx, st, st.accent, poly([[20, -120], [-50, 10], [-5, 10], [-30, 120], [55, -20], [10, -20], [40, -120]]));
    ctx.restore();
  };
  PROPS.arrow_up = (ctx, st, x, y, s) => { begin(ctx, x, y, s); F(ctx, st, st.good, poly([[0, -110], [80, -20], [30, -20], [30, 100], [-30, 100], [-30, -20], [-80, -20]])); ctx.restore(); };
  PROPS.arrow_down = (ctx, st, x, y, s) => { begin(ctx, x, y, s); F(ctx, st, st.danger, poly([[0, 110], [80, 20], [30, 20], [30, -100], [-30, -100], [-30, 20], [-80, 20]])); ctx.restore(); };
  PROPS.check = (ctx, st, x, y, s) => { begin(ctx, x, y, s); S(ctx, st, st.good, (c) => { c.beginPath(); c.moveTo(-80, 0); c.lineTo(-20, 60); c.lineTo(90, -70); }, 30); ctx.restore(); };
  PROPS.cross_x = (ctx, st, x, y, s) => { begin(ctx, x, y, s); S(ctx, st, st.danger, (c) => { c.beginPath(); c.moveTo(-75, -75); c.lineTo(75, 75); c.moveTo(75, -75); c.lineTo(-75, 75); }, 30); ctx.restore(); };
  PROPS.pyramid = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#d6b46a", poly([[0, -110], [140, 90], [-140, 90]]));
    ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.moveTo(0, -110); ctx.lineTo(140, 90); ctx.lineTo(30, 90); ctx.fill();
    ctx.restore();
  };
  PROPS.castle = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#8d8f96", poly([[-130, 100], [-130, -40], [-110, -40], [-110, -60], [-90, -60], [-90, -40], [-60, -40], [-60, -110], [-40, -110], [-40, -130], [-20, -130], [-20, -110], [20, -110], [20, -130], [40, -130], [40, -110], [60, -110], [60, -40], [90, -40], [90, -60], [110, -60], [110, -40], [130, -40], [130, 100]]));
    F(ctx, st, "#2a2018", (c) => { c.beginPath(); c.moveTo(-28, 100); c.lineTo(-28, 40); c.arc(0, 40, 28, PI, 0); c.lineTo(28, 100); c.closePath(); }, 4);
    ctx.restore();
  };
  PROPS.temple = (ctx, st, x, y, s) => {
    begin(ctx, x, y, s);
    F(ctx, st, "#e3d8bf", poly([[-140, -60], [0, -120], [140, -60]]));
    for (let i = 0; i < 5; i++) F(ctx, st, "#e3d8bf", rect(-120 + i * 55, -55, 22, 140), 4);
    F(ctx, st, "#e3d8bf", rect(-140, 85, 280, 20), 4);
    ctx.restore();
  };

  // nombres alternativos que el LLM suele usar
  const ALIAS = {
    dinero: "money", reloj: "clock", calendario: "calendar", calavera: "skull", corona: "crown", espada: "sword",
    libro: "book", carta: "letter", telefono: "phone", movil: "phone", bombilla: "lightbulb", idea: "lightbulb",
    bomba: "bomb", fuego: "fire", corazon: "heart", pregunta: "question", cohete: "rocket", planeta: "planet",
    llave: "key", candado: "lock", puerta: "door", casa: "house", coche: "car", barco: "ship", avion: "plane",
    trofeo: "trophy", medalla: "medal", pocion: "potion", pastilla: "pill", vacuna: "syringe", cerebro: "brain",
    ojo: "eye", estrella: "star", bandera: "flag", mapa: "map", vela: "candle", anillo: "ring", ataud: "coffin",
    arbol: "tree", lupa: "magnifier", cadena: "chain", esposas: "handcuffs", camara: "camera", microfono: "microphone",
    pan: "bread", manzana: "apple", maleta: "suitcase", bebe: "baby", tren: "train", tanque: "tank", muro: "wall",
    luna: "moon", sol: "sun", nube: "cloud", rayo: "lightning", piramide: "pyramid", castillo: "castle", templo: "temple",
    money_bag: "money", cash: "money", dollar: "coin", gold_bars: "gold", oro: "gold", diamante: "diamond",
    laptop: "computer", pc: "computer", ordenador: "computer", periodico: "newspaper", news: "newspaper",
    chart: "chart_up", graph: "chart_up", growth: "chart_up", crash: "chart_down", warning: "exclamation",
    death: "skull", hospital: "syringe", medicine: "pill", science: "flask", lab: "flask", poison: "potion",
    virus_cell: "virus", germ: "virus", earth: "globe", world: "globe", mundo: "globe", tierra: "globe",
  };
  VS.propName = function (name) {
    if (!name) return null;
    let n = String(name).toLowerCase().trim().replace(/[\s-]+/g, "_").normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (PROPS[n]) return n;
    if (ALIAS[n]) return ALIAS[n];
    for (const k in PROPS) if (n.includes(k)) return k;
    for (const k in ALIAS) if (n.includes(k)) return ALIAS[k];
    return null;
  };
  VS.drawProp = function (ctx, st, name, x, y, s, T, o) {
    const n = VS.propName(name);
    if (!n) return false;
    PROPS[n](ctx, st, x, y, s, T, o || {});
    return true;
  };
})();
