/* ==========================================================================
   VIRAL STUDIO ENGINE — figura humana ilustrada
   Proporciones reales (≈7,5 cabezas), cuerpo con volumen, ropa, sombreado
   con textura de carbón / tinta y modo "silueta documental" (negro con
   contornos blancos). Usa los mismos ángulos de pose que el rig de palitos.
   ========================================================================== */
(function () {
  "use strict";
  const VS = window.VS;
  const { clamp, lerp, hash, mix, rgba, shade, rng } = VS;
  const PI = Math.PI;
  const FB = { headW: 17, headH: 22, neck: 12, torso: 100, upper: 54, fore: 50, thigh: 66, shin: 62, foot: 26 };

  /* ---------- texturas procedurales (deterministas) ---------- */
  const TEX = {};
  VS.texture = function (name, size = 256) {
    const key = name + size;
    if (TEX[key]) return TEX[key];
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const x = c.getContext("2d");
    const R = rng(VS.strSeed(name) + 7);
    if (name === "charcoal") {
      x.lineCap = "round";
      for (let i = 0; i < 900; i++) {
        const px = R() * size, py = R() * size, L = 6 + R() * 22, a = -0.9 + (R() - 0.5) * 0.5;
        x.strokeStyle = `rgba(0,0,0,${0.05 + R() * 0.14})`;
        x.lineWidth = 0.6 + R() * 2.2;
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L);
        x.stroke();
      }
    } else if (name === "hatch") {
      x.strokeStyle = "rgba(0,0,0,.28)";
      x.lineWidth = 1.2;
      for (let i = -size; i < size * 2; i += 7) {
        x.beginPath();
        x.moveTo(i + R() * 2, 0);
        x.lineTo(i - size + R() * 2, size);
        x.stroke();
      }
    } else if (name === "paper") {
      const img = x.createImageData(size, size);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 200 + R() * 55;
        img.data[i] = v; img.data[i + 1] = v * 0.96; img.data[i + 2] = v * 0.88; img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      x.strokeStyle = "rgba(120,90,60,.10)";
      for (let i = 0; i < 160; i++) {
        x.beginPath();
        const px = R() * size, py = R() * size;
        x.moveTo(px, py);
        x.quadraticCurveTo(px + R() * 20 - 10, py + R() * 20 - 10, px + R() * 40 - 20, py + R() * 40 - 20);
        x.stroke();
      }
    } else if (name.startsWith("grain")) {
      const img = x.createImageData(size, size);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = R() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
    } else if (name === "brush") {
      for (let i = 0; i < 260; i++) {
        const px = R() * size, py = R() * size;
        const g = x.createRadialGradient(px, py, 0, px, py, 10 + R() * 30);
        const a = 0.04 + R() * 0.08;
        g.addColorStop(0, `rgba(0,0,0,${a})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        x.fillStyle = g;
        x.fillRect(px - 40, py - 40, 80, 80);
      }
    }
    return (TEX[key] = c);
  };
  VS.pattern = function (ctx, name, size) {
    return ctx.createPattern(VS.texture(name, size), "repeat");
  };

  /* ---------- esqueleto de figura ---------- */
  function chain(P0, a1, a2, L1, L2, dir, knee) {
    const p1 = [P0[0] + Math.sin(a1) * L1 * dir, P0[1] + Math.cos(a1) * L1];
    const A2 = knee ? a1 - a2 : a1 + a2;
    const p2 = [p1[0] + Math.sin(A2) * L2 * dir, p1[1] + Math.cos(A2) * L2];
    return [P0, p1, p2, A2];
  }
  function figSkeleton(pose, dir, k) {
    const lean = pose.lean || 0;
    const hip = [0, 0];
    const sh = [Math.sin(lean) * FB.torso * k.t * dir, -Math.cos(lean) * FB.torso * k.t];
    const ht = lean + (pose.tilt || 0) * 0.6;
    const neckTop = [sh[0] + Math.sin(ht) * FB.neck * dir, sh[1] - Math.cos(ht) * FB.neck];
    const head = [neckTop[0] + Math.sin(ht) * FB.headH * k.h * dir, neckTop[1] - Math.cos(ht) * FB.headH * k.h];
    const shB = [sh[0] - 8 * dir, sh[1] + 4], shF = [sh[0] + 8 * dir, sh[1] + 3];
    return {
      hip, sh, neckTop, head, ht, lean,
      armB: chain(shB, pose.aB[0] + lean, pose.aB[1], FB.upper * k.l, FB.fore * k.l, dir),
      armF: chain(shF, pose.aF[0] + lean, pose.aF[1], FB.upper * k.l, FB.fore * k.l, dir),
      legB: chain([hip[0] - 5 * dir, 0], pose.lB[0], pose.lB[1], FB.thigh * k.l, FB.shin * k.l, dir, true),
      legF: chain([hip[0] + 5 * dir, 0], pose.lF[0], pose.lF[1], FB.thigh * k.l, FB.shin * k.l, dir, true),
    };
  }
  // cápsula cónica entre dos puntos
  function taper(c, a, b, w1, w2) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    c.moveTo(a[0] + nx * w1, a[1] + ny * w1);
    c.lineTo(b[0] + nx * w2, b[1] + ny * w2);
    c.arc(b[0], b[1], w2, Math.atan2(ny, nx), Math.atan2(ny, nx) + PI, true);
    c.lineTo(a[0] - nx * w1, a[1] - ny * w1);
    c.arc(a[0], a[1], w1, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) + PI, true);
    c.closePath();
  }
  // extremidad continua (hombro-codo-mano o cadera-rodilla-tobillo) con contorno suave
  function limb(c, pts, ws) {
    const n = pts.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      L.push([pts[i][0] - dy * ws[i], pts[i][1] + dx * ws[i]]);
      R.push([pts[i][0] + dy * ws[i], pts[i][1] - dx * ws[i]]);
    }
    c.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < n - 1; i++) c.quadraticCurveTo(L[i][0], L[i][1], (L[i][0] + L[i + 1][0]) / 2, (L[i][1] + L[i + 1][1]) / 2);
    c.lineTo(L[n - 1][0], L[n - 1][1]);
    const e = pts[n - 1], ang = Math.atan2(L[n - 1][1] - e[1], L[n - 1][0] - e[0]);
    c.arc(e[0], e[1], ws[n - 1], ang, ang + PI, true);
    for (let i = n - 2; i > 0; i--) c.quadraticCurveTo(R[i][0], R[i][1], (R[i][0] + R[i - 1][0]) / 2, (R[i][1] + R[i - 1][1]) / 2);
    c.lineTo(R[0][0], R[0][1]);
    const s0 = pts[0], a0 = Math.atan2(R[0][1] - s0[1], R[0][0] - s0[0]);
    c.arc(s0[0], s0[1], ws[0], a0, a0 + PI, true);
    c.closePath();
  }
  VS.limbPath = limb;

  /* ---------- pintor de partes según el acabado ---------- */
  function Painter(ctx, st, o, bbox) {
    this.ctx = ctx; this.st = st; this.o = o; this.bbox = bbox;
    this.mode = st.mode;
  }
  Painter.prototype.part = function (path, col, opt = {}) {
    const c = this.ctx, st = this.st, m = this.mode;
    if (m === "doc") {
      c.fillStyle = opt.inner ? "#0b0b0c" : "#050506";
      c.beginPath(); path(c); c.fill();
      c.strokeStyle = rgba("#f4f0e6", opt.edge == null ? 0.85 : opt.edge);
      c.lineWidth = opt.lw || 1.6;
      c.stroke();
      return;
    }
    if (m === "silhouette") {
      c.fillStyle = st.ink;
      c.beginPath(); path(c); c.fill();
      return;
    }
    // ilustración: relleno + luz + textura + contorno de tinta irregular
    c.save();
    c.beginPath(); path(c);
    c.fillStyle = col;
    c.fill();
    c.clip();
    const bb = this.bbox;
    const lx = st.lightX == null ? 0.7 : st.lightX;
    const g = c.createLinearGradient(bb[0], 0, bb[2], 0);
    g.addColorStop(lx < 0.5 ? 0 : 1, "rgba(255,255,255,.18)");
    g.addColorStop(lx < 0.5 ? 1 : 0, "rgba(0,0,0,.42)");
    c.fillStyle = g;
    c.fillRect(bb[0] - 50, bb[1] - 50, bb[2] - bb[0] + 100, bb[3] - bb[1] + 100);
    if (opt.texture !== false) {
      c.globalAlpha = m === "charcoal" ? 0.9 : 0.55;
      c.fillStyle = VS.pattern(c, m === "comic" ? "hatch" : "charcoal", 256);
      c.fillRect(bb[0] - 50, bb[1] - 50, bb[2] - bb[0] + 100, bb[3] - bb[1] + 100);
    }
    c.restore();
    c.strokeStyle = opt.line || (m === "comic" ? "#111" : "rgba(18,14,12,.9)");
    c.lineWidth = opt.lw || (m === "comic" ? 3.2 : 2.2);
    c.beginPath(); path(c); c.stroke();
  };
  Painter.prototype.line = function (path, w = 2) {
    const c = this.ctx;
    if (this.mode === "silhouette") return;
    c.strokeStyle = this.mode === "doc" ? "rgba(244,240,230,.75)" : "rgba(18,14,12,.75)";
    c.lineWidth = this.mode === "doc" ? 1.3 : w;
    c.beginPath(); path(c); c.stroke();
  };

  /* ---------- dibujo ---------- */
  // o: {x,y,s,dir,pose,face,look,T,id,alpha, back(true = de espaldas)}
  VS.drawFigure = function (ctx, st, o) {
    const look = o.look || {};
    const kind = look.kind || "person";
    if (kind === "reaper") return VS.drawReaper(ctx, st, Object.assign({}, o, { s: (o.s || 1) * 1.1 }));
    if (kind === "monster") return VS.drawMonster(ctx, st, o);
    if (kind === "ghost") return VS.drawGhost(ctx, st, o);
    const T = o.T || 0, id = o.id || 0, dir = o.dir || 1;
    const child = kind === "child";
    const k = { t: child ? 0.68 : 1, l: child ? 0.62 : 1, h: child ? 1.1 : 1 };
    const s = (o.s || 1) * (kind === "giant" ? 1.5 : 1);
    const pose = o.pose || VS.poseFor("idle", 0, T, id);
    const sk = figSkeleton(pose, dir, k);
    const woman = !!(look.dress || look.woman);
    const outfit = look.outfit || st.outfits[id % st.outfits.length];
    const pants = look.pants || shade(outfit, -0.3);
    const skin = look.skin || st.skin;
    const hairCol = look.hairCol || st.hairs[id % st.hairs.length];

    let maxY = Math.max(sk.legB[2][1], sk.legF[2][1], sk.legB[1][1] + 10, sk.legF[1][1] + 10);
    if (pose.rot) maxY = 0;
    ctx.save();
    ctx.translate(o.x, o.y - (pose.lift || 0) * s);
    if (pose.rot) { ctx.translate(0, -22 * s); ctx.rotate(pose.rot * dir); }
    const sq = pose.sq || 0;
    ctx.scale(s * (1 + sq), s * (1 - sq));
    ctx.translate(0, -maxY + FB.foot * 0.25);
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const bbox = [-70, sk.head[1] - 40, 70, 30];
    const pt = new Painter(ctx, st, o, bbox);
    const sleeve = look.sleeve || outfit;
    const shoe = look.shoe || "#1b1714";

    const drawLeg = (L, back) => {
      const [h, kn, ft] = L;
      const thin = look.dress ? 0.72 : 1;
      const col = back ? shade(pants, -0.14) : pants;
      const mid1 = [lerp(h[0], kn[0], 0.5), lerp(h[1], kn[1], 0.5)];
      const mid2 = [lerp(kn[0], ft[0], 0.55), lerp(kn[1], ft[1], 0.55)];
      pt.part((c) => limb(c, [h, mid1, kn, mid2, ft], [15 * thin, 13.5 * thin, 10.5 * thin, 9.5 * thin, 7.5 * thin]), col, { inner: back });
      const fx = ft[0], fy = ft[1];
      pt.part((c) => {
        c.moveTo(fx - 9 * dir, fy - 7);
        c.quadraticCurveTo(fx + 6 * dir, fy - 11, fx + FB.foot * dir, fy + 1);
        c.quadraticCurveTo(fx + (FB.foot + 2) * dir, fy + 6, fx + FB.foot * dir, fy + 7);
        c.lineTo(fx - 10 * dir, fy + 7);
        c.closePath();
      }, shoe, { texture: false });
      if (!back) pt.line((c) => { c.moveTo(kn[0] - 5 * dir, kn[1] - 4); c.quadraticCurveTo(kn[0] + 3 * dir, kn[1] + 3, kn[0] + 8 * dir, kn[1] - 2); }, 1.3);
    };
    const drawArm = (A, back) => {
      const [sh0, el, hd, A2] = A;
      const sc = back ? shade(sleeve, -0.14) : sleeve;
      const m1 = [lerp(sh0[0], el[0], 0.5), lerp(sh0[1], el[1], 0.5)];
      const wrist = [lerp(el[0], hd[0], 0.92), lerp(el[1], hd[1], 0.92)];
      pt.part((c) => limb(c, [sh0, m1, el, wrist], [11.5, 10.5, 9, 7]), sc, { inner: back });
      const hx = hd[0] + Math.sin(A2) * 5 * dir, hy = hd[1] + Math.cos(A2) * 5;
      pt.part((c) => { c.ellipse(hx, hy, 6, 8.5, -A2 * dir, 0, PI * 2); }, skin, { texture: false, lw: 1.3 });
    };

    // capa / pelo largo detrás
    if (look.cape) {
      const wave = Math.sin(T * 3 + id) * 8;
      pt.part((c) => {
        c.moveTo(sk.sh[0] - 14 * dir, sk.sh[1]);
        c.quadraticCurveTo(-40 * dir - wave * dir, sk.sh[1] + 70, -46 * dir - wave * dir, 40);
        c.lineTo(20 * dir, 40);
        c.lineTo(sk.sh[0] + 12 * dir, sk.sh[1] + 4);
        c.closePath();
      }, look.capeCol || st.danger);
    }
    if (look.hair === "long" || look.hair === "ponytail") {
      const hx = sk.head[0], hy = sk.head[1];
      pt.part((c) => {
        c.moveTo(hx - 16 * dir, hy - 10);
        c.quadraticCurveTo(hx - 26 * dir, hy + 30, hx - 14 * dir, hy + 52);
        c.lineTo(hx + 4 * dir, hy + 20);
        c.closePath();
      }, hairCol, { texture: true });
    }

    drawLeg(sk.legB, true);
    drawArm(sk.armB, true);

    // torso: chaqueta / vestido (eje del torso → normal)
    const sh = sk.sh, hp = sk.hip;
    let ux = sh[0] - hp[0], uy = sh[1] - hp[1];
    const ul = Math.hypot(ux, uy) || 1;
    ux /= ul; uy /= ul;
    const nx = -uy, ny = ux;
    const SW = child ? 17 : woman ? 18 : 23, WW = child ? 14 : woman ? 13.5 : 18, HPW = child ? 15 : woman ? 17 : 18;
    const at = (k, w, f = 0) => [lerp(hp[0], sh[0], k) + nx * w + ux * f, lerp(hp[1], sh[1], k) + ny * w + uy * f];
    const torsoPath = (c) => {
      const s1 = at(1, -SW, -6), s2 = at(1, SW, -6), w1 = at(0.45, -WW), w2 = at(0.45, WW), h1 = at(-0.08, -HPW), h2 = at(-0.08, HPW);
      const top = at(1, 0, 4);
      c.moveTo(s1[0], s1[1]);
      c.quadraticCurveTo(lerp(s1[0], top[0], 0.6), top[1] - 1, top[0], top[1]);
      c.quadraticCurveTo(lerp(s2[0], top[0], 0.6), top[1] - 1, s2[0], s2[1]);
      const cs2 = at(0.82, SW + 3);
      c.quadraticCurveTo(cs2[0], cs2[1], w2[0], w2[1]);
      c.lineTo(h2[0], h2[1]);
      c.lineTo(h1[0], h1[1]);
      c.lineTo(w1[0], w1[1]);
      const cs1 = at(0.82, -SW - 3);
      c.quadraticCurveTo(cs1[0], cs1[1], s1[0], s1[1]);
      c.closePath();
    };
    if (look.dress) {
      const sw = Math.sin(T * 2.2 + id) * 3;
      pt.part((c) => {
        c.moveTo(hp[0] - 14, hp[1] - 6);
        c.lineTo(hp[0] + 14, hp[1] - 6);
        c.quadraticCurveTo(hp[0] + 30, hp[1] + 40, hp[0] + 38 + sw, hp[1] + 78);
        c.lineTo(hp[0] - 38 + sw, hp[1] + 78);
        c.quadraticCurveTo(hp[0] - 30, hp[1] + 40, hp[0] - 14, hp[1] - 6);
        c.closePath();
      }, outfit);
    }
    pt.part(torsoPath, outfit);
    // cuello de camisa y corbata / solapas
    if (!look.dress && look.tie !== false && st.mode !== "silhouette") {
      const nx = sk.neckTop[0], ny = sh[1] - 4;
      pt.part((c) => { c.moveTo(nx - 7, ny); c.lineTo(nx + 7, ny); c.lineTo(nx + 3 * dir, ny + 30); c.closePath(); }, look.shirt || "#d9d6cf", { texture: false, lw: 1.2 });
      if (look.tie !== "none") pt.part((c) => { c.moveTo(nx - 2.5, ny + 3); c.lineTo(nx + 2.5, ny + 3); c.lineTo(nx + 4 + 2 * dir, ny + 42); c.lineTo(nx + 2 * dir, ny + 50); c.lineTo(nx - 4 + 2 * dir, ny + 42); c.closePath(); }, look.tieCol || "#1c1a1a", { texture: false, lw: 1.2 });
      pt.line((c) => { c.moveTo(nx - 8, ny); c.lineTo(nx - 2 + 3 * dir, ny + 46); c.moveTo(nx + 8, ny); c.lineTo(nx + 2 + 3 * dir, ny + 46); }, 1.6);
    }
    { const b1 = at(0.02, -HPW + 2), b2 = at(0.02, HPW - 2); pt.line((c) => { c.moveTo(b1[0], b1[1]); c.lineTo(b2[0], b2[1]); }, 1.4); }

    drawLeg(sk.legF, false);

    // cuello y cabeza
    const nt = sk.neckTop, hd = sk.head, ht = sk.ht;
    pt.part((c) => { taper(c, [lerp(sh[0], nt[0], 0.2), lerp(sh[1], nt[1], 0.2)], nt, 6.5, 6); }, shade(skin, -0.12), { texture: false, lw: 1.1 });
    ctx.save();
    ctx.translate(hd[0], hd[1]);
    ctx.rotate(ht * dir * 0.7);
    const HW = FB.headW * k.h, HH = FB.headH * k.h;
    const back = !!o.back;
    if (look.hair === "bun") pt.part((c) => { c.arc(-HW * 0.85 * dir, -HH * 0.55, 8.5, 0, PI * 2); }, hairCol);
    // cráneo + mandíbula en 3/4 (mira hacia dir)
    const headPath = (c) => {
      c.moveTo(-HW * 0.15 * dir, -HH);
      c.bezierCurveTo(HW * 0.9 * dir, -HH * 1.02, HW * 1.08 * dir, -HH * 0.25, HW * 1.0 * dir, HH * 0.15);
      c.bezierCurveTo(HW * 0.95 * dir, HH * 0.62, HW * 0.55 * dir, HH * 1.0, HW * 0.1 * dir, HH * 1.0);
      c.bezierCurveTo(-HW * 0.55 * dir, HH * 0.95, -HW * 0.98 * dir, HH * 0.35, -HW * 0.98 * dir, -HH * 0.15);
      c.bezierCurveTo(-HW * 0.98 * dir, -HH * 0.75, -HW * 0.65 * dir, -HH * 0.98, -HW * 0.15 * dir, -HH);
      c.closePath();
    };
    pt.part(headPath, skin, { texture: st.mode === "charcoal", lw: 1.6 });
    // sombra del lado opuesto a la luz, recortada a la cabeza
    if (st.mode !== "doc" && st.mode !== "silhouette") {
      ctx.save();
      ctx.beginPath(); headPath(ctx); ctx.clip();
      ctx.fillStyle = "rgba(0,0,0,.22)";
      ctx.beginPath(); ctx.ellipse(-HW * 0.75 * dir, HH * 0.1, HW * 0.55, HH * 1.1, 0, 0, PI * 2); ctx.fill();
      ctx.restore();
    }
    // oreja
    pt.part((c) => { c.ellipse(-HW * 0.5 * dir, HH * 0.08, 2.6, 4.6, 0, 0, PI * 2); }, shade(skin, -0.08), { texture: false, lw: 1.1, edge: 0.6 });
    // pelo
    if (look.hair !== "bald" && kind !== "robot") {
      const longH = look.hair === "long" || look.hair === "bun" || look.hair === "ponytail" || (woman && look.hair !== "short");
      pt.part((c) => {
        c.moveTo(-HW * 1.04 * dir, HH * (longH ? 0.55 : 0.05));
        c.bezierCurveTo(-HW * 1.2 * dir, -HH * 1.2, HW * 0.9 * dir, -HH * 1.35, HW * 1.06 * dir, -HH * 0.35);
        c.quadraticCurveTo(HW * 0.55 * dir, -HH * 0.72, HW * 0.05 * dir, -HH * 0.62);
        c.quadraticCurveTo(-HW * 0.45 * dir, -HH * 0.5, -HW * 0.55 * dir, -HH * 0.05);
        c.quadraticCurveTo(-HW * 0.6 * dir, HH * 0.25, -HW * 0.62 * dir, HH * (longH ? 0.6 : 0.2));
        c.closePath();
      }, hairCol);
    }
    if (!back && st.mode !== "silhouette" && st.mode !== "doc") VS.drawRealFace(ctx, st, HW, HH, dir, o.face || "neutral", T, id, look);
    if (look.beard && st.mode !== "doc") pt.part((c) => { c.moveTo(-HW * 0.45 * dir, HH * 0.2); c.quadraticCurveTo(-HW * 0.2 * dir, HH * 1.25, HW * 0.35 * dir, HH * 1.12); c.quadraticCurveTo(HW * 0.95 * dir, HH * 0.85, HW * 0.92 * dir, HH * 0.4); c.quadraticCurveTo(HW * 0.4 * dir, HH * 0.75, -HW * 0.45 * dir, HH * 0.2); c.closePath(); }, look.beardCol || hairCol);
    if (look.hat) {
      const hst = Object.assign({}, st, { mode: st.mode === "doc" ? "silhouette" : "comic", ink: st.mode === "doc" ? "#050506" : "#1a1714" });
      VS.drawHat(ctx, hst, new VS.Pen(ctx, hst), look.hat, 0, -3, HW * 1.08, dir, "#1a1714", Object.assign({ hatCol: "#1d1a18" }, look));
    }
    ctx.restore();

    drawArm(sk.armF, false);
    if (look.held) VS.drawHeld(ctx, st, look.held, sk.armF[2], sk.armF[3], dir, T);
    ctx.restore();
  };

  VS.drawRealFace = function (ctx, st, HW, HH, dir, face, T, id, look) {
    const ink = "rgba(22,16,13,.92)";
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineCap = "round";
    const fx = HW * 0.42 * dir;           // centro de la cara (3/4)
    const ey = -HH * 0.08;
    const blink = ((T + id * 1.37) % 3.6) > 3.47;
    const down = face === "sad" || face === "calm" || look.downcast;
    const closed = blink || face === "closed" || face === "calm";
    const wide = face === "shocked" || face === "scared";
    const brow = face === "angry" || face === "determined" || face === "evil" ? 1 : face === "sad" || face === "scared" ? -1 : 0;
    const eyes = [[fx - HW * 0.36 * dir, 0.82], [fx + HW * 0.3 * dir, 1]];
    for (const [ex, sz] of eyes) {
      // ceja
      ctx.lineWidth = 2.6 * sz;
      ctx.beginPath();
      const inner = ex + (ex === eyes[0][0] ? 4 : -4) * dir * -1;
      ctx.moveTo(ex - 6 * sz, ey - 8 - (brow < 0 ? -2 : 0) + (brow > 0 ? -2 : 0));
      ctx.quadraticCurveTo(ex, ey - 10 - (wide ? 3 : 0), ex + 6 * sz, ey - 8 + (brow > 0 ? 3 : 0) * (ex > fx ? 1 : -1) * dir);
      ctx.stroke();
      // ojo
      if (closed || down) {
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(ex - 5 * sz, ey);
        ctx.quadraticCurveTo(ex, ey + (down ? 3 : 1.5), ex + 5 * sz, ey);
        ctx.stroke();
      } else {
        ctx.save();
        ctx.fillStyle = "rgba(240,236,228,.95)";
        ctx.beginPath();
        ctx.ellipse(ex, ey, 4.6 * sz, (wide ? 3.6 : 2.6) * sz, 0, 0, PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(ex + 1.3 * dir, ey + 0.2, (wide ? 1.6 : 2.0) * sz, 0, PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(ex - 5 * sz, ey - 0.5);
        ctx.quadraticCurveTo(ex, ey - (wide ? 4.5 : 3.6) * sz, ex + 5 * sz, ey - 0.5);
        ctx.stroke();
      }
    }
    // nariz
    ctx.lineWidth = 1.3;
    ctx.globalAlpha *= 0.85;
    ctx.beginPath();
    const nx = fx + HW * 0.1 * dir;
    ctx.moveTo(nx + 1 * dir, ey + HH * 0.12);
    ctx.quadraticCurveTo(nx + 4.5 * dir, ey + HH * 0.36, nx + 3.5 * dir, ey + HH * 0.44);
    ctx.quadraticCurveTo(nx + 0.5 * dir, ey + HH * 0.5, nx - 2.5 * dir, ey + HH * 0.45);
    ctx.stroke();
    ctx.globalAlpha /= 0.85;
    // boca
    const mx = fx + HW * 0.05 * dir, my = HH * 0.62;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (face === "happy" || face === "love") ctx.arc(mx, my - 4, 6, 0.2 * PI, 0.8 * PI);
    else if (face === "shocked") { ctx.ellipse(mx, my + 1, 3.4, 4.8, 0, 0, PI * 2); ctx.fill(); }
    else if (face === "sad" || face === "scared") ctx.arc(mx, my + 5, 5.5, 1.2 * PI, 1.8 * PI);
    else if (face === "angry") { ctx.moveTo(mx - 6, my + 1); ctx.lineTo(mx + 6, my - 1); }
    else if (face === "talk") { const op = Math.max(0, Math.sin(T * 16 + id)) * 3.6; ctx.ellipse(mx, my, 4.5, 1 + op, 0, 0, PI * 2); ctx.fill(); }
    else if (face === "evil" || face === "smug") { ctx.moveTo(mx - 6, my + 1); ctx.quadraticCurveTo(mx, my + 3, mx + 7 * dir, my - 3); }
    else { ctx.moveTo(mx - 5.5, my); ctx.quadraticCurveTo(mx, my + 1.2, mx + 5.5, my); }
    ctx.stroke();
    ctx.restore();
  };

  /* elegir el dibujante según el estilo */
  VS.FIGURE_MODES = { charcoal: 1, doc: 1, painted: 1 };
  VS.drawActor = function (ctx, st, o) {
    if (VS.FIGURE_MODES[st.mode] || st.figure) return VS.drawFigure(ctx, st, o);
    return VS.drawCharacter(ctx, st, o);
  };
})();
