/* ==========================================================================
   VIRAL STUDIO ENGINE — mapas reales (Natural Earth 1:110m)
   Zoom documental del mundo a un país/ciudad, país resaltado, chincheta,
   ondas, rótulo y ruta animada entre dos puntos. Globo terráqueo estilizado.
   ========================================================================== */
(function () {
  "use strict";
  const VS = window.VS;
  const { clamp, lerp, mix, rgba, shade, E, hash } = VS;
  const PI = Math.PI;

  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  VS.findCountry = function (name) {
    if (!name || !VS.GEO) return null;
    const n = norm(name);
    for (const c of VS.GEO) if (norm(c.n) === n || norm(c.es) === n || norm(c.iso) === n) return c;
    for (const c of VS.GEO) if (n.includes(norm(c.es)) || n.includes(norm(c.n))) return c;
    return null;
  };
  function inRing(lon, lat, r) {
    let ins = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const xi = r[i] / 10, yi = r[i + 1] / 10, xj = r[j] / 10, yj = r[j + 1] / 10;
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  }
  VS.countryAt = function (lon, lat) {
    if (!VS.GEO) return null;
    for (const c of VS.GEO) for (const r of c.p) if (inRing(lon, lat, r)) return c;
    return null;
  };

  /* mapa plano (equirectangular corregido por latitud) */
  // o: {x,y,w,h, lon, lat, zoom, hi(país), pin:[lon,lat], k(0..1 progreso de aparición), label, route:[[lon,lat],[lon,lat]], T}
  VS.drawMap = function (ctx, st, o) {
    const { x, y, w, h } = o;
    const zoom = o.zoom || 1;
    const clon = o.lon || 0, clat = o.lat || 20;
    const scale = (w / 360) * zoom;
    const ky = 1 / Math.max(0.35, Math.cos((clat * PI) / 180));
    const P = (lon, lat) => [x + w / 2 + (lon - clon) * scale, y + h / 2 - (lat - clat) * scale * Math.min(1.6, ky * 0.85)];
    const sea = st.mapSea || shade(st.bg, -0.25);
    const land = st.mapLand || mix(st.bg, st.ink, st.mode === "doc" ? 0.25 : 0.18);
    const border = st.mapBorder || rgba(st.ink, 0.35);
    const hiCol = st.mapHi || st.accent;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = sea;
    ctx.fillRect(x, y, w, h);
    // retícula
    ctx.strokeStyle = rgba(st.ink, 0.07);
    ctx.lineWidth = 1;
    for (let lo = -180; lo <= 180; lo += zoom > 4 ? 5 : 15) {
      const a = P(lo, 85), b = P(lo, -85);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    for (let la = -75; la <= 75; la += zoom > 4 ? 5 : 15) {
      const a = P(-180, la), b = P(180, la);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    const hi = o.hi ? (typeof o.hi === "string" ? VS.findCountry(o.hi) : o.hi) : null;
    const pulse = 0.75 + 0.25 * Math.sin((o.T || 0) * 4);
    for (const c of VS.GEO || []) {
      const isHi = hi && c === hi;
      ctx.beginPath();
      for (const r of c.p) {
        for (let i = 0; i < r.length; i += 2) {
          const p = P(r[i] / 10, r[i + 1] / 10);
          if (i === 0) ctx.moveTo(p[0], p[1]);
          else ctx.lineTo(p[0], p[1]);
        }
        ctx.closePath();
      }
      ctx.fillStyle = isHi ? mix(land, hiCol, (o.hiK == null ? 1 : o.hiK) * pulse) : land;
      ctx.fill();
      ctx.strokeStyle = isHi ? hiCol : border;
      ctx.lineWidth = isHi ? 2.5 : 1;
      ctx.stroke();
    }
    // ruta animada
    if (o.route && o.route.length > 1) {
      const a = P(o.route[0][0], o.route[0][1]), b = P(o.route[1][0], o.route[1][1]);
      const mx = (a[0] + b[0]) / 2, my = Math.min(a[1], b[1]) - Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.3;
      const k = clamp(o.routeK == null ? 1 : o.routeK);
      ctx.strokeStyle = st.danger;
      ctx.lineWidth = 5;
      ctx.setLineDash([14, 10]);
      ctx.beginPath();
      for (let i = 0; i <= 40 * k; i++) {
        const t = i / 40;
        const px = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * mx + t * t * b[0];
        const py = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * my + t * t * b[1];
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
    // chincheta con ondas
    if (o.pin) {
      const p = P(o.pin[0], o.pin[1]);
      const pk = clamp(o.pinK == null ? 1 : o.pinK);
      if (pk > 0) {
        const drop = E.back(pk);
        const T = o.T || 0;
        for (let i = 0; i < 3; i++) {
          const ph = (T * 0.8 + i / 3) % 1;
          ctx.strokeStyle = rgba(st.danger, (1 - ph) * 0.8 * pk);
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.ellipse(p[0], p[1], 10 + ph * 90, (10 + ph * 90) * 0.45, 0, 0, PI * 2);
          ctx.stroke();
        }
        const py = p[1] - (1 - drop) * 220;
        ctx.save();
        ctx.translate(p[0], py);
        ctx.fillStyle = "rgba(0,0,0,.35)";
        ctx.beginPath(); ctx.ellipse(4, 4, 12, 5, 0, 0, PI * 2); ctx.fill();
        ctx.fillStyle = st.danger;
        ctx.strokeStyle = "#14110f";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-26, -40, -30, -78, 0, -80);
        ctx.bezierCurveTo(30, -78, 26, -40, 0, 0);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#f4ede4";
        ctx.beginPath(); ctx.arc(0, -55, 10, 0, PI * 2); ctx.fill();
        ctx.restore();
        if (o.label) {
          const lk = clamp((pk - 0.55) / 0.45);
          if (lk > 0) {
            const fs = Math.round(o.labelSize || 52);
            ctx.save();
            ctx.globalAlpha *= E.out(lk);
            ctx.font = `900 ${fs}px "${st.fontDisplay}"`;
            const tw = ctx.measureText(o.label.toUpperCase()).width;
            const vx0 = o.vx0 == null ? x + 20 : o.vx0, vx1 = o.vx1 == null ? x + w - 20 : o.vx1;
            const lx = Math.max(vx0, Math.min(p[0] + 40, vx1 - tw - 36)), ly = p[1] - 110;
            ctx.fillStyle = rgba("#0b0b0d", 0.82);
            VS.roundRect(ctx, lx - 18, ly - fs * 0.72, tw + 36, fs * 1.35, 10);
            ctx.fill();
            ctx.fillStyle = "#f4ede4";
            ctx.textBaseline = "middle";
            ctx.fillText(o.label.toUpperCase(), lx, ly);
            ctx.restore();
          }
        }
      }
    }
    return P;
  };

  /* globo estilizado (retícula + continentes por proyección ortográfica) */
  VS.drawGlobe = function (ctx, st, x, y, r, rot, pin) {
    const lon0 = (rot || 0) * 57.3, lat0 = 15;
    const l0 = (lon0 * PI) / 180, p0 = (lat0 * PI) / 180;
    const proj = (lon, lat) => {
      const l = (lon * PI) / 180, p = (lat * PI) / 180;
      const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l - l0);
      return [x + r * Math.cos(p) * Math.sin(l - l0), y - r * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l - l0)), cosc];
    };
    ctx.save();
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, st.mode === "silhouette" ? st.ink : mix(st.cool, "#ffffff", 0.25));
    g.addColorStop(1, st.mode === "silhouette" ? st.ink : shade(st.cool, -0.45));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, PI * 2); ctx.fill();
    ctx.clip();
    ctx.fillStyle = st.mode === "silhouette" ? shade(st.ink, 0.15) : mix(st.good, "#d9c08a", 0.3);
    for (const c of VS.GEO || []) for (const ring of c.p) {
      let started = false, vis = 0;
      ctx.beginPath();
      for (let i = 0; i < ring.length; i += 2) {
        const q = proj(ring[i] / 10, ring[i + 1] / 10);
        if (q[2] < 0) continue;
        vis++;
        started ? ctx.lineTo(q[0], q[1]) : (ctx.moveTo(q[0], q[1]), (started = true));
      }
      if (vis > 2) { ctx.closePath(); ctx.fill(); }
    }
    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.lineWidth = 1.5;
    for (let lo = -180; lo < 180; lo += 30) {
      ctx.beginPath();
      let st2 = false;
      for (let la = -85; la <= 85; la += 5) { const q = proj(lo, la); if (q[2] < 0) { st2 = false; continue; } st2 ? ctx.lineTo(q[0], q[1]) : (ctx.moveTo(q[0], q[1]), (st2 = true)); }
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,.25)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, PI * 2); ctx.stroke();
    if (pin) {
      const q = proj(pin[0], pin[1]);
      if (q[2] > 0) { ctx.fillStyle = st.danger; ctx.beginPath(); ctx.arc(q[0], q[1], r * 0.05, 0, PI * 2); ctx.fill(); }
    }
  };
})();
