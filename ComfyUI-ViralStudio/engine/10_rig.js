/* ==========================================================================
   VIRAL STUDIO ENGINE — rig de personaje
   Personaje articulado (cabeza, torso, brazos con codo, piernas con rodilla),
   caras expresivas, ropa, pelo, sombreros, accesorios y criaturas.
   Ángulos en radianes medidos desde "colgando hacia abajo"; positivo = hacia
   donde mira el personaje.
   ========================================================================== */
(function () {
  "use strict";
  const VS = window.VS;
  const { clamp, lerp, hash, E, mix, rgba, shade } = VS;
  const PI = Math.PI;

  const B = { R: 24, neck: 9, torso: 80, upper: 44, fore: 40, thigh: 48, shin: 48, foot: 14 };

  /* ---------- poses ---------- */
  const P = (aB, aF, lB, lF, lean = 0, tilt = 0, extra = {}) => Object.assign({ aB, aF, lB, lF, lean, tilt, lift: 0, rot: 0, sq: 0 }, extra);
  const BASE = {
    stand: P([0.14, 0.12], [-0.1, 0.18], [0.04, 0.04], [-0.06, 0.06]),
    point: P([0.15, 0.15], [1.45, 0.08], [0.06, 0.05], [-0.1, 0.06], 0.06, 0.04),
    shock: P([2.4, -0.5], [2.6, -0.4], [0.25, 0.35], [-0.2, 0.2], -0.18, -0.12),
    armsUp: P([2.75, 0.2], [2.85, 0.15], [0.12, 0.08], [-0.12, 0.08], -0.04, -0.15),
    sad: P([0.06, 0.05], [0.05, 0.08], [0.03, 0.03], [-0.03, 0.03], 0.18, 0.42),
    think: P([0.2, 0.2], [0.55, 2.35], [0.05, 0.05], [-0.06, 0.06], 0.02, -0.18),
    fight: P([1.15, 1.7], [1.35, 1.9], [0.42, 0.5], [-0.38, 0.32], 0.16, 0.06),
    kneel: P([0.2, 0.3], [0.35, 0.4], [1.55, 1.55], [-0.15, 1.62], 0.05, 0.1),
    pray: P([0.75, 1.9], [0.8, 1.85], [1.55, 1.55], [-0.15, 1.62], 0.02, 0.28),
    crouch: P([1.9, 1.4], [2.1, 1.3], [1.25, 1.9], [0.9, 1.7], 0.5, 0.35),
    carry: P([0.95, 0.9], [1.05, 0.95], [0.05, 0.05], [-0.08, 0.06], -0.04, 0.12),
    wave: P([0.12, 0.1], [2.3, 0.9], [0.05, 0.04], [-0.07, 0.06], -0.02, -0.06),
    angry: P([0.45, 1.2], [0.5, 1.25], [0.25, 0.15], [-0.3, 0.2], 0.22, 0.12),
    sit: P([0.35, 0.6], [0.5, 0.7], [1.55, -1.45], [1.45, -1.5], 0.0, 0.05),
    lie: P([0.4, 0.2], [0.6, 0.1], [0.1, 0.05], [-0.05, 0.05], 0, 0, { rot: -PI / 2 }),
    push: P([1.45, 0.25], [1.55, 0.2], [0.35, 0.2], [-0.45, 0.15], 0.45, -0.05),
    lookUp: P([0.18, 0.15], [0.12, 0.2], [0.04, 0.04], [-0.06, 0.06], -0.12, -0.6),
    shrug: P([0.6, -1.2], [0.6, -1.2], [0.05, 0.04], [-0.07, 0.06], 0, 0.15),
    facepalm: P([0.15, 0.15], [0.7, 2.5], [0.05, 0.05], [-0.06, 0.05], 0.12, 0.3),
    hide: P([2.6, 2.3], [2.7, 2.2], [1.3, 1.95], [1.0, 1.8], 0.55, 0.45),
  };
  function blend(a, b, k) {
    const o = {};
    for (const key in a) {
      const va = a[key], vb = b[key] == null ? va : b[key];
      o[key] = Array.isArray(va) ? [lerp(va[0], vb[0], k), lerp(va[1], vb[1], k)] : lerp(va, vb, k);
    }
    return o;
  }
  VS.POSE = BASE;
  VS.blendPose = blend;

  function idle(T, id) {
    const br = Math.sin(T * 2.1 + id * 1.7);
    const p = blend(BASE.stand, BASE.stand, 0);
    p.aB = [0.14 + br * 0.03, 0.12 + br * 0.04];
    p.aF = [-0.1 - br * 0.03, 0.18 + br * 0.05];
    p.tilt = br * 0.03;
    p.sq = br * 0.012;
    return p;
  }
  function walk(T, hz, id, amp = 1) {
    const ph = T * hz * 2 * PI + id;
    const s = Math.sin(ph), c = Math.cos(ph);
    return P(
      [-s * 0.5 * amp, 0.3 + Math.max(0, s) * 0.4],
      [s * 0.5 * amp, 0.3 + Math.max(0, -s) * 0.4],
      [s * 0.42 * amp, Math.max(0, -c) * 0.75 * amp + 0.05],
      [-s * 0.42 * amp, Math.max(0, c) * 0.75 * amp + 0.05],
      0.06 * amp, 0.02,
      { lift: Math.abs(c) * 5 * amp }
    );
  }
  function run(T, hz, id) {
    const ph = T * hz * 2 * PI + id;
    const s = Math.sin(ph), c = Math.cos(ph);
    return P(
      [-s * 1.0, 1.6 + s * 0.2],
      [s * 1.0, 1.6 - s * 0.2],
      [s * 0.85 + 0.15, Math.max(0, -c) * 1.6 + 0.2],
      [-s * 0.85 + 0.15, Math.max(0, c) * 1.6 + 0.2],
      0.32, 0.05,
      { lift: Math.abs(c) * 16 }
    );
  }

  /* Acción → pose en el tiempo local lt (s) de la escena.
     Cada acción tiene anticipación al entrar (de idle a la pose) y vida propia. */
  const ACTIONS = {};
  const enter = (lt, d = 0.32) => E.back(clamp(lt / d));
  ACTIONS.idle = (lt, T, id) => idle(T, id);
  ACTIONS.talk = (lt, T, id) => {
    const p = idle(T, id);
    const g = Math.sin(T * 3.3 + id) * 0.5 + 0.5;
    p.aF = [lerp(0.3, 1.1, g), lerp(0.6, 1.4, g)];
    p.aB = [lerp(0.15, 0.5, 1 - g), 0.5];
    p.tilt = Math.sin(T * 2.6 + id) * 0.08;
    return p;
  };
  ACTIONS.walk = (lt, T, id) => walk(T, 1.05, id);
  ACTIONS.sneak = (lt, T, id) => {
    const p = walk(T, 0.7, id, 0.6);
    return blend(p, BASE.crouch, 0.35);
  };
  ACTIONS.run = (lt, T, id) => run(T, 1.9, id);
  ACTIONS.point = (lt, T, id) => {
    const p = blend(idle(T, id), BASE.point, enter(lt, 0.35));
    p.aF[0] += Math.sin(T * 2 + id) * 0.02;
    return p;
  };
  ACTIONS.shock = (lt, T, id) => {
    const k = enter(lt, 0.22);
    const p = blend(idle(T, id), BASE.shock, k);
    p.lift = Math.sin(clamp(lt / 0.35) * PI) * 26;
    p.sq = -0.08 * Math.sin(clamp(lt / 0.3) * PI);
    p.aB[0] += Math.sin(T * 30) * 0.03;
    p.aF[0] += Math.cos(T * 31) * 0.03;
    return p;
  };
  ACTIONS.scared = (lt, T, id) => {
    const p = blend(idle(T, id), blend(BASE.shock, BASE.crouch, 0.35), enter(lt, 0.3));
    const tr = Math.sin(T * 38 + id) * 0.04;
    p.aB[0] += tr; p.aF[0] -= tr; p.tilt += tr;
    return p;
  };
  ACTIONS.cheer = (lt, T, id) => {
    const p = blend(idle(T, id), BASE.armsUp, enter(lt, 0.3));
    const pump = Math.sin(T * 7 + id);
    p.aB[0] += pump * 0.18; p.aF[0] -= pump * 0.18;
    p.lift = Math.max(0, pump) * 14;
    return p;
  };
  ACTIONS.celebrate = (lt, T, id) => {
    const p = blend(idle(T, id), BASE.armsUp, enter(lt, 0.25));
    const j = Math.abs(Math.sin(T * 5.5 + id));
    p.lift = j * 60;
    p.lB = [0.3 * j, 0.9 * j]; p.lF = [-0.2 * j, 0.9 * j];
    return p;
  };
  ACTIONS.sad = (lt, T, id) => {
    const p = blend(idle(T, id), BASE.sad, E.io(clamp(lt / 0.8)));
    p.tilt += Math.sin(T * 1.1 + id) * 0.04;
    return p;
  };
  ACTIONS.cry = (lt, T, id) => {
    const p = blend(idle(T, id), BASE.facepalm, enter(lt, 0.5));
    p.aB = [0.75, 2.4];
    p.sq = Math.sin(T * 9) * 0.015;
    p.tilt = 0.35 + Math.sin(T * 9) * 0.03;
    return p;
  };
  ACTIONS.think = (lt, T, id) => {
    const p = blend(idle(T, id), BASE.think, enter(lt, 0.45));
    p.tilt += Math.sin(T * 1.3 + id) * 0.05;
    return p;
  };
  ACTIONS.fight = (lt, T, id) => {
    const p = blend(idle(T, id), BASE.fight, enter(lt, 0.25));
    const bob = Math.sin(T * 6 + id);
    p.lift = Math.abs(bob) * 6;
    const punch = Math.max(0, Math.sin(T * 3.1 + id)) ** 8;
    p.aF = [lerp(p.aF[0], 1.6, punch), lerp(p.aF[1], 0.05, punch)];
    p.lean += punch * 0.15;
    return p;
  };
  ACTIONS.angry = (lt, T, id) => {
    const p = blend(idle(T, id), BASE.angry, enter(lt, 0.25));
    p.tilt += Math.sin(T * 24) * 0.015;
    return p;
  };
  ACTIONS.fall = (lt, T, id) => {
    const k = E.in(clamp(lt / 0.55));
    const p = blend(BASE.shock, BASE.lie, k);
    p.rot = -k * PI * 0.5;
    p.lift = Math.sin(clamp(lt / 0.55) * PI) * 20;
    return p;
  };
  ACTIONS.lie = () => blend(BASE.lie, BASE.lie, 0);
  ACTIONS.kneel = (lt, T, id) => blend(idle(T, id), BASE.kneel, E.io(clamp(lt / 0.5)));
  ACTIONS.pray = (lt, T, id) => {
    const p = blend(idle(T, id), BASE.pray, E.io(clamp(lt / 0.6)));
    p.tilt += Math.sin(T * 1.2) * 0.03;
    return p;
  };
  ACTIONS.hide = (lt, T, id) => {
    const p = blend(idle(T, id), BASE.hide, enter(lt, 0.3));
    p.tilt += Math.sin(T * 40 + id) * 0.03;
    return p;
  };
  ACTIONS.carry = (lt, T, id) => {
    const w = walk(T, 0.85, id, 0.7);
    const p = blend(w, BASE.carry, 0.85);
    p.lB = w.lB; p.lF = w.lF; p.lift = w.lift;
    return p;
  };
  ACTIONS.hold = (lt, T, id) => blend(idle(T, id), BASE.carry, enter(lt, 0.35));
  ACTIONS.wave = (lt, T, id) => {
    const p = blend(idle(T, id), BASE.wave, enter(lt, 0.3));
    p.aF[1] += Math.sin(T * 9 + id) * 0.45;
    return p;
  };
  ACTIONS.sit = (lt, T, id) => {
    const p = blend(BASE.sit, BASE.sit, 0);
    p.tilt = Math.sin(T * 1.5 + id) * 0.04;
    return p;
  };
  ACTIONS.push = (lt, T, id) => {
    const p = blend(idle(T, id), BASE.push, enter(lt, 0.3));
    const st = Math.sin(T * 2.2 + id) * 0.08;
    p.lB = [0.35 + st, 0.2]; p.lF = [-0.45 - st, 0.15];
    return p;
  };
  ACTIONS.look_up = (lt, T, id) => blend(idle(T, id), BASE.lookUp, E.io(clamp(lt / 0.6)));
  ACTIONS.shrug = (lt, T, id) => {
    const p = blend(idle(T, id), BASE.shrug, enter(lt, 0.3));
    p.lift = 0;
    return p;
  };
  ACTIONS.facepalm = (lt, T, id) => blend(idle(T, id), BASE.facepalm, enter(lt, 0.4));
  ACTIONS.dance = (lt, T, id) => {
    const ph = T * 4.2 + id, s = Math.sin(ph), c = Math.cos(ph);
    return P([2.2 + s * 0.6, 0.4], [1.0 - s * 0.8, 1.2 + c * 0.3], [0.3 + s * 0.3, 0.5], [-0.3 + s * 0.3, 0.5], s * 0.12, c * 0.15, { lift: Math.abs(c) * 18 });
  };
  ACTIONS.jump = (lt, T, id) => ACTIONS.celebrate(lt, T, id);
  ACTIONS.stand = ACTIONS.idle;
  VS.ACTIONS = ACTIONS;
  VS.poseFor = function (action, lt, T, id) {
    const fn = ACTIONS[action] || ACTIONS.idle;
    return fn(Math.max(0, lt), T, id || 0);
  };
  // emoción por defecto de cada acción
  VS.ACTION_FACE = {
    shock: "shocked", scared: "scared", cheer: "happy", celebrate: "happy", sad: "sad", cry: "sad",
    think: "thinking", fight: "determined", angry: "angry", fall: "shocked", pray: "calm", hide: "scared",
    wave: "happy", dance: "happy", point: "determined", talk: "talk", facepalm: "sad", lie: "closed",
  };

  /* ---------- esqueleto ---------- */
  function limbPts(P0, a1, a2, L1, L2, dir) {
    const p1 = [P0[0] + Math.sin(a1) * L1 * dir, P0[1] + Math.cos(a1) * L1];
    const A2 = a1 + a2;
    const p2 = [p1[0] + Math.sin(A2) * L2 * dir, p1[1] + Math.cos(A2) * L2];
    return [P0, p1, p2, A2];
  }
  function legPts(P0, h, k, dir, lk = 1) {
    const p1 = [P0[0] + Math.sin(h) * B.thigh * lk * dir, P0[1] + Math.cos(h) * B.thigh * lk];
    const A2 = h - k;
    const p2 = [p1[0] + Math.sin(A2) * B.shin * lk * dir, p1[1] + Math.cos(A2) * B.shin * lk];
    return [P0, p1, p2, A2];
  }
  function skeleton(pose, dir, kind) {
    const lean = pose.lean || 0;
    const hip = [0, 0];
    const tl = B.torso * (kind === "child" ? 0.78 : 1);
    const sh = [Math.sin(lean) * tl * dir, -Math.cos(lean) * tl];
    const ht = lean + (pose.tilt || 0) * 0.6;
    const neckTop = [sh[0] + Math.sin(ht) * B.neck * dir, sh[1] - Math.cos(ht) * B.neck];
    const headR = B.R * (kind === "child" ? 1.12 : kind === "alien" ? 1.45 : 1);
    const head = [neckTop[0] + Math.sin(ht) * headR * dir, neckTop[1] - Math.cos(ht) * headR];
    const lk = kind === "child" ? 0.72 : 1;
    const armB = limbPts(sh, pose.aB[0] + lean, pose.aB[1], B.upper * lk, B.fore * lk, dir);
    const armF = limbPts(sh, pose.aF[0] + lean, pose.aF[1], B.upper * lk, B.fore * lk, dir);
    const legB = legPts(hip, pose.lB[0], pose.lB[1], dir, lk);
    const legF = legPts(hip, pose.lF[0], pose.lF[1], dir, lk);
    return { hip, sh, neckTop, head, headR, ht, armB, armF, legB, legF };
  }

  /* ---------- dibujo del personaje ---------- */
  // o: {x,y,s,dir,pose,face,look,col,alpha,T,id,glowEyes}
  VS.drawCharacter = function (ctx, st, o) {
    const look = o.look || {};
    const kind = look.kind || "person";
    if (kind === "reaper") return VS.drawReaper(ctx, st, o);
    if (kind === "monster") return VS.drawMonster(ctx, st, o);
    if (kind === "ghost") return VS.drawGhost(ctx, st, o);
    const T = o.T || 0, id = o.id || 0, dir = o.dir || 1;
    const s = (o.s || 1) * (kind === "child" ? 0.72 : 1) * (kind === "giant" ? 1.6 : 1);
    const pose = o.pose || idle(T, id);
    const sk = skeleton(pose, dir, kind);
    const mode = st.mode;
    const pen = new VS.Pen(ctx, st);

    // "línea viva": desplazamiento que cambia boil veces por segundo
    const F = st.boil ? Math.floor(T * st.boil) : 0;
    const amp = (st.jitter || 0) * (mode === "puppet" ? 0.3 : 1);
    const J = (k) => (st.boil ? (hash(k * 17.17 + F * 3.31 + id * 91.7) - 0.5) * amp * 2 : 0);
    const jp = (p, k) => [p[0] + J(k), p[1] + J(k + 0.5)];

    // apoyar pies en el suelo
    let maxY = Math.max(sk.legB[2][1], sk.legF[2][1], sk.legB[1][1], sk.legF[1][1]);
    if (pose.rot) maxY = 0;
    const sq = pose.sq || 0;

    ctx.save();
    ctx.translate(o.x, o.y - (pose.lift || 0) * s);
    if (pose.rot) {
      ctx.translate(0, -16 * s);
      ctx.rotate(pose.rot * dir);
    }
    ctx.scale(s * (1 + sq), s * (1 - sq));
    ctx.translate(0, -maxY);
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;

    const inkBase = o.col || (look.villain && mode !== "silhouette" ? shade(st.ink, -0.05) : st.ink);
    const lw = (st.lineW || 7) * (mode === "silhouette" ? 1.9 : 1) * (look.thick || 1);
    const outfit = look.outfit || st.outfits[id % st.outfits.length];
    const skin = look.skin || st.skin;
    const dark = shade(outfit, -0.35);
    const limbCol = mode === "puppet" ? outfit : mode === "comic" ? skin : mode === "neon" ? (look.glow || outfit) : inkBase;
    const legCol = mode === "puppet" ? dark : mode === "comic" ? dark : limbCol;

    const seg2 = (pts, col, w, k) => {
      const a = jp(pts[0], k), b = jp(pts[1], k + 1), c = jp(pts[2], k + 2);
      if (mode === "puppet") {
        bone(ctx, a, b, w * 1.9, col);
        bone(ctx, b, c, w * 1.7, col);
        return;
      }
      pen.stroke((x) => { x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineTo(c[0], c[1]); }, col, w);
    };

    // capa (detrás)
    if (look.cape) {
      const capeCol = look.capeCol || st.danger;
      const wave = Math.sin(T * 3 + id) * 6;
      pen.fill((x) => {
        x.beginPath();
        x.moveTo(sk.sh[0] - 6 * dir, sk.sh[1] + 2);
        x.quadraticCurveTo(sk.sh[0] - 40 * dir, sk.sh[1] + 60, -34 * dir - wave * dir, 22);
        x.lineTo(6 * dir, 18);
        x.lineTo(sk.sh[0] + 6 * dir, sk.sh[1] + 4);
        x.closePath();
      }, capeCol);
    }
    // pelo largo (detrás)
    if (look.hair === "long" || look.hair === "bun" || look.hair === "ponytail") {
      const hc = look.hairCol || st.hairs[id % st.hairs.length];
      const hx = sk.head[0], hy = sk.head[1], R = sk.headR;
      pen.fill((x) => {
        x.beginPath();
        if (look.hair === "long") {
          x.moveTo(hx - R * 0.95 * dir, hy - R * 0.2);
          x.quadraticCurveTo(hx - R * 1.35 * dir, hy + R * 1.4, hx - R * 0.2 * dir, hy + R * 1.55);
          x.lineTo(hx + R * 0.4 * dir, hy + R * 0.6);
          x.closePath();
        } else if (look.hair === "bun") {
          x.arc(hx - R * 0.95 * dir, hy - R * 0.55, R * 0.5, 0, 7);
        } else {
          x.moveTo(hx - R * 0.8 * dir, hy - R * 0.5);
          x.quadraticCurveTo(hx - R * 1.9 * dir, hy + R * 0.2 + Math.sin(T * 4) * 3, hx - R * 1.4 * dir, hy + R * 1.3);
          x.lineTo(hx - R * 0.7 * dir, hy);
          x.closePath();
        }
      }, mode === "silhouette" ? inkBase : hc);
    }

    // brazo y pierna traseros
    const backDim = mode === "line" || mode === "ink" || mode === "chalk" ? 0.82 : 0.9;
    ctx.save();
    ctx.globalAlpha *= backDim;
    seg2(sk.legB, legCol, lw, 10);
    foot(sk.legB, legCol);
    seg2(sk.armB, limbCol, lw, 20);
    ctx.restore();

    // torso
    const hipJ = jp(sk.hip, 30), shJ = jp(sk.sh, 31);
    if (mode === "puppet") {
      const tw = look.dress ? 24 : 19;
      trap(ctx, shJ, hipJ, 17, tw, outfit, st);
      if (look.dress) skirt(ctx, hipJ, dir, outfit, st, pose);
    } else {
      if (look.dress) {
        pen.fill((x) => {
          x.beginPath();
          x.moveTo(shJ[0] - 9, shJ[1] + 8);
          x.lineTo(shJ[0] + 9, shJ[1] + 8);
          x.lineTo(hipJ[0] + 30, hipJ[1] + 46);
          x.lineTo(hipJ[0] - 30, hipJ[1] + 46);
          x.closePath();
        }, mode === "silhouette" ? inkBase : outfit, { outline: mode === "comic" ? undefined : false });
      } else if (look.coat !== false && mode !== "silhouette" && mode !== "neon" && mode !== "chalk") {
        pen.fill((x) => {
          x.beginPath();
          x.moveTo(shJ[0] - 13, shJ[1] + 2);
          x.lineTo(shJ[0] + 13, shJ[1] + 2);
          x.lineTo(hipJ[0] + 11, hipJ[1] + 6);
          x.lineTo(hipJ[0] - 11, hipJ[1] + 6);
          x.closePath();
        }, outfit, { outline: mode === "comic" ? undefined : false });
      }
      pen.stroke((x) => { x.beginPath(); x.moveTo(hipJ[0], hipJ[1]); x.lineTo(shJ[0], shJ[1]); }, mode === "neon" ? (look.glow || outfit) : (mode === "comic" ? dark : inkBase), lw * (mode === "silhouette" ? 1.5 : 1));
    }

    // pierna delantera
    seg2(sk.legF, legCol, lw, 40);
    foot(sk.legF, legCol);

    // cuello y cabeza
    const nt = jp(sk.neckTop, 50);
    if (mode !== "puppet") pen.stroke((x) => { x.beginPath(); x.moveTo(shJ[0], shJ[1]); x.lineTo(nt[0], nt[1]); }, limbCol === skin ? skin : inkBase, lw);
    drawHead(ctx, st, pen, sk, o, look, dir, T, id, J, inkBase, lw);

    // objeto en la mano delantera / brazo delantero
    seg2(sk.armF, limbCol, lw, 60);
    const hand = sk.armF[2], handB = sk.armB[2];
    if (mode === "puppet") {
      pin(ctx, sk.armF[1]); pin(ctx, sk.legF[1]); pin(ctx, sk.hip); pin(ctx, sk.sh);
      hands(ctx, hand, skin); hands(ctx, handB, skin);
    } else if (mode === "comic") {
      hands(ctx, hand, skin); hands(ctx, handB, skin);
    }
    if (look.held) VS.drawHeld(ctx, st, look.held, hand, sk.armF[3], dir, T);
    if (look.cane) pen.stroke((x) => { x.beginPath(); x.moveTo(hand[0], hand[1]); x.lineTo(hand[0] + 6 * dir, 0); }, "#8a6a45", 5);

    ctx.restore();

    function foot(L, col) {
      const p = L[2];
      if (mode === "puppet") {
        ctx.save();
        ctx.fillStyle = "#2b211b";
        ctx.beginPath();
        ctx.ellipse(p[0] + 7 * dir, p[1] + 2, 13, 6, 0, 0, 7);
        ctx.fill();
        ctx.restore();
        return;
      }
      pen.stroke((x) => { x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(p[0] + B.foot * dir, p[1] + 1); }, col, lw);
    }
  };

  function bone(ctx, a, b, w, col) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(a[0], a[1]);
    ctx.rotate(ang);
    ctx.shadowColor = "rgba(10,6,3,.45)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = col;
    roundRect(ctx, -w / 2, -w / 2, L + w, w, w / 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = shade(col, -0.35);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  VS.roundRect = roundRect;
  function trap(ctx, sh, hip, wTop, wBot, col, st) {
    ctx.save();
    ctx.shadowColor = "rgba(10,6,3,.45)";
    ctx.shadowBlur = 7;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(sh[0] - wTop, sh[1] - 2);
    ctx.lineTo(sh[0] + wTop, sh[1] - 2);
    ctx.lineTo(hip[0] + wBot, hip[1] + 6);
    ctx.lineTo(hip[0] - wBot, hip[1] + 6);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = shade(col, -0.35);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  function skirt(ctx, hip, dir, col, st, pose) {
    ctx.save();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(hip[0] - 20, hip[1]);
    ctx.lineTo(hip[0] + 20, hip[1]);
    ctx.lineTo(hip[0] + 32, hip[1] + 52);
    ctx.lineTo(hip[0] - 32, hip[1] + 52);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shade(col, -0.35);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  function pin(ctx, p) {
    ctx.save();
    ctx.fillStyle = "#c99a3e";
    ctx.strokeStyle = "#6e4f18";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p[0], p[1], 4.2, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f6e3a0";
    ctx.beginPath();
    ctx.arc(p[0] - 1.2, p[1] - 1.2, 1.4, 0, 7);
    ctx.fill();
    ctx.restore();
  }
  function hands(ctx, p, skin) {
    ctx.save();
    ctx.fillStyle = skin;
    ctx.strokeStyle = "#14110f";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p[0], p[1], 7, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- cabeza y cara ---------- */
  function drawHead(ctx, st, pen, sk, o, look, dir, T, id, J, ink, lw) {
    const mode = st.mode;
    const R = sk.headR;
    const hx = sk.head[0] + J(70), hy = sk.head[1] + J(71);
    const kind = look.kind || "person";
    let headFill = st.head;
    if (mode === "puppet" || mode === "comic") headFill = look.skin || st.skin;
    if (mode === "silhouette") headFill = ink;
    if (mode === "neon") headFill = st.bg;
    if (mode === "ink" || mode === "chalk") headFill = st.head;
    if (kind === "robot") {
      pen.fill((x) => { roundRect(x, hx - R, hy - R * 0.95, R * 2, R * 1.9, 6); }, mode === "silhouette" ? ink : "#8d99a6");
      pen.stroke((x) => { roundRect(x, hx - R, hy - R * 0.95, R * 2, R * 1.9, 6); }, ink, lw * 0.6);
      pen.stroke((x) => { x.beginPath(); x.moveTo(hx, hy - R); x.lineTo(hx, hy - R * 1.5); }, ink, 4);
      ctx.fillStyle = st.danger;
      ctx.beginPath(); ctx.arc(hx, hy - R * 1.55, 5, 0, 7); ctx.fill();
    } else {
      if (mode === "puppet") {
        ctx.save();
        ctx.shadowColor = "rgba(10,6,3,.45)"; ctx.shadowBlur = 7; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 6;
        ctx.fillStyle = headFill; ctx.beginPath(); ctx.arc(hx, hy, R * 1.25, 0, 7); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = shade(headFill, -0.3); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx, hy, R * 1.25, 0, 7); ctx.stroke();
      } else {
        pen.fill((x) => { x.beginPath(); x.arc(hx, hy, R, 0, 7); }, kind === "alien" && mode !== "silhouette" ? "#7fbf7a" : headFill, { outline: false });
        if (mode !== "silhouette") pen.stroke((x) => { x.beginPath(); x.arc(hx, hy, R, 0, 7); }, mode === "neon" ? (look.glow || look.outfit || st.accent) : (mode === "comic" ? "#14110f" : ink), lw * (mode === "comic" ? 0.7 : 0.85));
      }
    }
    const RR = mode === "puppet" ? R * 1.25 : R;
    // pelo corto / sombreros
    const hairCol = look.hairCol || st.hairs[id % st.hairs.length];
    const hcol = mode === "silhouette" ? ink : mode === "line" || mode === "neon" || mode === "chalk" ? (look.hairCol || ink) : hairCol;
    if (look.hair === "short" || look.hair === "bun" || look.hair === "long" || look.hair === "ponytail" || look.hair === "curly" || look.hair === "spiky") {
      pen.fill((x) => {
        x.beginPath();
        if (look.hair === "spiky") {
          x.moveTo(hx - RR, hy - RR * 0.1);
          for (let i = 0; i <= 6; i++) {
            const a = PI + (i / 6) * PI;
            const r = i % 2 ? RR * 1.45 : RR * 1.02;
            x.lineTo(hx + Math.cos(a) * r, hy + Math.sin(a) * r);
          }
          x.closePath();
        } else if (look.hair === "curly") {
          for (let i = 0; i < 7; i++) {
            const a = PI * 1.05 + (i / 6) * PI * 0.9;
            x.moveTo(hx + Math.cos(a) * RR * 0.95 + RR * 0.32, hy + Math.sin(a) * RR * 0.95);
            x.arc(hx + Math.cos(a) * RR * 0.95, hy + Math.sin(a) * RR * 0.95, RR * 0.32, 0, 7);
          }
        } else {
          x.arc(hx, hy, RR * 1.04, PI * 1.02, PI * 1.98);
          x.quadraticCurveTo(hx + RR * 0.2 * dir, hy - RR * 0.55, hx - RR * 0.9 * dir, hy - RR * 0.15);
          x.closePath();
        }
      }, hcol, { outline: mode === "comic" ? undefined : false });
    }
    if (look.hat) VS.drawHat(ctx, st, pen, look.hat, hx, hy, RR, dir, ink, look);
    if (look.beard && mode !== "silhouette") {
      pen.fill((x) => {
        x.beginPath();
        x.moveTo(hx - RR * 0.7, hy + RR * 0.25);
        x.quadraticCurveTo(hx + RR * 0.3 * dir, hy + RR * 1.7, hx + RR * 0.85 * dir, hy + RR * 0.2);
        x.closePath();
      }, look.beardCol || (mode === "line" ? shade(ink, -0.25) : "#6a5a50"), { outline: false });
    }
    // cara
    if (mode === "silhouette") {
      if (look.villain || o.glowEyes) {
        ctx.save();
        ctx.fillStyle = st.danger;
        ctx.shadowColor = st.danger;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(hx + RR * 0.32 * dir - 6, hy - 2, 3.5, 0, 7);
        ctx.arc(hx + RR * 0.32 * dir + 6, hy - 2, 3.5, 0, 7);
        ctx.fill();
        ctx.restore();
      }
      return;
    }
    if (kind === "robot") {
      ctx.fillStyle = st.cool;
      ctx.fillRect(hx - RR * 0.6 + RR * 0.2 * dir, hy - RR * 0.25, RR * 1.2, RR * 0.28);
      return;
    }
    const face = o.face || "neutral";
    if (o.back || face === "none") return;
    VS.drawFace(ctx, st, hx + RR * 0.28 * dir, hy + RR * 0.02, RR, face, dir, T, id, look);
    if (look.glasses) {
      ctx.save();
      ctx.strokeStyle = mode === "line" ? ink : "#14110f";
      ctx.lineWidth = 2.5;
      const ex = hx + RR * 0.28 * dir;
      ctx.beginPath();
      ctx.arc(ex - RR * 0.3, hy - RR * 0.08, RR * 0.24, 0, 7);
      ctx.moveTo(ex + RR * 0.3 + RR * 0.24, hy - RR * 0.08);
      ctx.arc(ex + RR * 0.3, hy - RR * 0.08, RR * 0.24, 0, 7);
      ctx.moveTo(ex - RR * 0.06, hy - RR * 0.08);
      ctx.lineTo(ex + RR * 0.06, hy - RR * 0.08);
      ctx.stroke();
      ctx.restore();
    }
  }

  VS.drawFace = function (ctx, st, cx, cy, R, face, dir, T, id, look = {}) {
    const mode = st.mode;
    const col = mode === "puppet" || mode === "comic" ? "#2a1d16" : mode === "neon" ? (look.glow || st.ink) : st.ink;
    const eyeDX = R * 0.3, eyeY = cy - R * 0.08;
    // parpadeo determinista (cada ~3.4 s, 0.12 s cerrado)
    const blinkPh = (T + id * 1.37) % 3.4;
    const blink = blinkPh > 3.25;
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = Math.max(2.5, R * 0.12);
    let eyes = "open", brows = null, mouth = "flat";
    switch (face) {
      case "happy": eyes = "happy"; mouth = "smile"; break;
      case "sad": eyes = "sad"; brows = "sad"; mouth = "frown"; break;
      case "angry": eyes = "open"; brows = "angry"; mouth = "grit"; break;
      case "scared": eyes = "wide"; brows = "sad"; mouth = "wobble"; break;
      case "shocked": eyes = "wide"; brows = "up"; mouth = "o"; break;
      case "determined": eyes = "open"; brows = "angry"; mouth = "flat"; break;
      case "evil": eyes = "open"; brows = "angry"; mouth = "smirk"; break;
      case "smug": eyes = "half"; mouth = "smirk"; break;
      case "thinking": eyes = "up"; brows = "one"; mouth = "flat"; break;
      case "calm": eyes = "closed"; mouth = "smile"; break;
      case "closed": eyes = "closed"; mouth = "flat"; break;
      case "talk": eyes = "open"; mouth = "talk"; break;
      case "love": eyes = "happy"; mouth = "smile"; break;
    }
    if (blink && (eyes === "open" || eyes === "wide" || eyes === "up")) eyes = "closed";
    for (const sgn of [-1, 1]) {
      const ex = cx + eyeDX * sgn, ey = eyeY;
      ctx.beginPath();
      if (eyes === "open") ctx.arc(ex, ey, R * 0.11, 0, 7), ctx.fill();
      else if (eyes === "up") ctx.arc(ex + R * 0.04 * dir, ey - R * 0.07, R * 0.1, 0, 7), ctx.fill();
      else if (eyes === "wide") {
        ctx.save();
        ctx.fillStyle = mode === "line" || mode === "neon" ? st.head : "#fff";
        ctx.arc(ex, ey, R * 0.2, 0, 7);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(ex + R * 0.03 * dir, ey, R * 0.08, 0, 7);
        ctx.fill();
      } else if (eyes === "closed") ctx.moveTo(ex - R * 0.12, ey), ctx.lineTo(ex + R * 0.12, ey), ctx.stroke();
      else if (eyes === "happy") ctx.arc(ex, ey + R * 0.05, R * 0.12, PI * 1.1, PI * 1.9), ctx.stroke();
      else if (eyes === "sad") ctx.arc(ex, ey - R * 0.02, R * 0.1, PI * 0.1, PI * 0.9), ctx.stroke(), ctx.beginPath(), ctx.arc(ex, ey + R * 0.02, R * 0.07, 0, 7), ctx.fill();
      else if (eyes === "half") ctx.moveTo(ex - R * 0.12, ey), ctx.lineTo(ex + R * 0.12, ey), ctx.stroke(), ctx.beginPath(), ctx.arc(ex, ey + R * 0.03, R * 0.07, 0, PI), ctx.fill();
      // cejas
      if (brows) {
        ctx.beginPath();
        const by = ey - R * 0.3;
        if (brows === "angry") { ctx.moveTo(ex + R * 0.16 * sgn, by - R * 0.09); ctx.lineTo(ex - R * 0.14 * sgn, by + R * 0.06); }
        else if (brows === "sad") { ctx.moveTo(ex + R * 0.15 * sgn, by + R * 0.07); ctx.lineTo(ex - R * 0.14 * sgn, by - R * 0.07); }
        else if (brows === "up") { ctx.moveTo(ex - R * 0.14, by - R * 0.1); ctx.lineTo(ex + R * 0.14, by - R * 0.1); }
        else if (brows === "one" && sgn === 1) { ctx.moveTo(ex - R * 0.14, by - R * 0.12); ctx.lineTo(ex + R * 0.14, by - R * 0.04); }
        ctx.stroke();
      }
    }
    // mejillas en títere
    if (mode === "puppet") {
      ctx.save();
      ctx.fillStyle = "rgba(220,110,100,.35)";
      ctx.beginPath();
      ctx.arc(cx - R * 0.5, cy + R * 0.28, R * 0.13, 0, 7);
      ctx.arc(cx + R * 0.5, cy + R * 0.28, R * 0.13, 0, 7);
      ctx.fill();
      ctx.restore();
    }
    const my = cy + R * 0.42;
    ctx.beginPath();
    if (mouth === "flat") ctx.moveTo(cx - R * 0.2, my), ctx.lineTo(cx + R * 0.2, my), ctx.stroke();
    else if (mouth === "smile") ctx.arc(cx, my - R * 0.15, R * 0.27, PI * 0.15, PI * 0.85), ctx.stroke();
    else if (mouth === "frown") ctx.arc(cx, my + R * 0.18, R * 0.22, PI * 1.2, PI * 1.8), ctx.stroke();
    else if (mouth === "o") ctx.ellipse(cx, my, R * 0.13, R * 0.18, 0, 0, 7), ctx.fill();
    else if (mouth === "smirk") ctx.moveTo(cx - R * 0.2, my + R * 0.04), ctx.quadraticCurveTo(cx + R * 0.05, my + R * 0.1, cx + R * 0.24, my - R * 0.08), ctx.stroke();
    else if (mouth === "grit") {
      ctx.save();
      ctx.fillStyle = mode === "line" ? st.head : "#fff";
      ctx.rect(cx - R * 0.24, my - R * 0.08, R * 0.48, R * 0.18);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (mouth === "wobble") {
      ctx.moveTo(cx - R * 0.22, my);
      for (let i = 1; i <= 6; i++) ctx.lineTo(cx - R * 0.22 + (i * R * 0.44) / 6, my + (i % 2 ? -1 : 1) * R * 0.06);
      ctx.stroke();
    } else if (mouth === "talk") {
      const op = Math.max(0, Math.sin(T * 17 + id)) * 0.7 + Math.max(0, Math.sin(T * 9.3 + id)) * 0.3;
      ctx.ellipse(cx, my, R * 0.16, R * (0.03 + op * 0.14), 0, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  };

  /* ---------- sombreros ---------- */
  VS.drawHat = function (ctx, st, pen, hat, hx, hy, R, dir, ink, look) {
    const mode = st.mode;
    const c = mode === "silhouette" ? ink : look.hatCol || (mode === "line" || mode === "neon" ? ink : "#2e2a28");
    const gold = mode === "silhouette" ? ink : st.accent;
    const F = (fn, col) => pen.fill(fn, mode === "silhouette" ? ink : col, { outline: mode === "comic" ? undefined : false });
    if (hat === "fedora") {
      F((x) => { x.beginPath(); x.ellipse(hx, hy - R * 0.72, R * 1.45, R * 0.22, 0, 0, 7); }, c);
      F((x) => { x.beginPath(); x.moveTo(hx - R * 0.8, hy - R * 0.72); x.lineTo(hx - R * 0.65, hy - R * 1.45); x.quadraticCurveTo(hx, hy - R * 1.6, hx + R * 0.65, hy - R * 1.45); x.lineTo(hx + R * 0.8, hy - R * 0.72); x.closePath(); }, c);
    } else if (hat === "cap") {
      F((x) => { x.beginPath(); x.arc(hx, hy - R * 0.3, R * 1.02, PI, 0); x.closePath(); }, look.hatCol || st.danger);
      F((x) => { x.beginPath(); x.ellipse(hx + R * 0.95 * dir, hy - R * 0.32, R * 0.7, R * 0.14, 0, 0, 7); }, look.hatCol || st.danger);
    } else if (hat === "crown") {
      F((x) => {
        x.beginPath();
        x.moveTo(hx - R * 0.8, hy - R * 0.75);
        x.lineTo(hx - R * 0.9, hy - R * 1.6);
        x.lineTo(hx - R * 0.45, hy - R * 1.15);
        x.lineTo(hx, hy - R * 1.75);
        x.lineTo(hx + R * 0.45, hy - R * 1.15);
        x.lineTo(hx + R * 0.9, hy - R * 1.6);
        x.lineTo(hx + R * 0.8, hy - R * 0.75);
        x.closePath();
      }, gold);
    } else if (hat === "helmet") {
      F((x) => { x.beginPath(); x.arc(hx, hy - R * 0.25, R * 1.15, PI, 0); x.lineTo(hx + R * 1.35, hy - R * 0.2); x.lineTo(hx - R * 1.35, hy - R * 0.2); x.closePath(); }, look.hatCol || (mode === "line" ? shade(ink, -0.35) : "#4f5a45"));
    } else if (hat === "hood") {
      F((x) => { x.beginPath(); x.arc(hx, hy, R * 1.35, PI * 0.85, PI * 2.15); x.quadraticCurveTo(hx, hy - R * 2.2, hx - R * 1.3, hy + R * 0.4); x.closePath(); }, look.hatCol || shade(ink, -0.6));
    } else if (hat === "tophat") {
      F((x) => { x.beginPath(); x.ellipse(hx, hy - R * 0.78, R * 1.3, R * 0.2, 0, 0, 7); }, c);
      F((x) => { x.beginPath(); x.rect(hx - R * 0.72, hy - R * 2.1, R * 1.44, R * 1.35); }, c);
    } else if (hat === "wizard") {
      F((x) => { x.beginPath(); x.moveTo(hx - R * 1.3, hy - R * 0.7); x.lineTo(hx + R * 0.4 * dir, hy - R * 3.0); x.lineTo(hx + R * 1.3, hy - R * 0.7); x.closePath(); }, look.hatCol || "#3d3a7a");
    } else if (hat === "headscarf") {
      F((x) => { x.beginPath(); x.arc(hx, hy - R * 0.1, R * 1.12, PI * 0.95, PI * 2.05); x.lineTo(hx - R * 1.05 * dir, hy + R * 0.6); x.closePath(); }, look.hatCol || st.cool);
    } else if (hat === "beret") {
      F((x) => { x.beginPath(); x.ellipse(hx - R * 0.15 * dir, hy - R * 0.85, R * 1.1, R * 0.4, -0.15 * dir, 0, 7); }, look.hatCol || st.danger);
    } else if (hat === "halo") {
      ctx.save();
      ctx.strokeStyle = st.accent;
      ctx.shadowColor = st.accent;
      ctx.shadowBlur = 16;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(hx, hy - R * 1.55, R * 0.85, R * 0.22, 0, 0, 7);
      ctx.stroke();
      ctx.restore();
    } else if (hat === "horns") {
      F((x) => {
        x.beginPath();
        x.moveTo(hx - R * 0.6, hy - R * 0.7); x.quadraticCurveTo(hx - R * 1.3, hy - R * 1.4, hx - R * 0.9, hy - R * 1.9); x.lineTo(hx - R * 0.3, hy - R * 0.85); x.closePath();
        x.moveTo(hx + R * 0.6, hy - R * 0.7); x.quadraticCurveTo(hx + R * 1.3, hy - R * 1.4, hx + R * 0.9, hy - R * 1.9); x.lineTo(hx + R * 0.3, hy - R * 0.85); x.closePath();
      }, st.danger);
    }
  };

  /* ---------- criaturas ---------- */
  VS.drawReaper = function (ctx, st, o) {
    const T = o.T || 0, s = o.s || 1, dir = o.dir || 1;
    const sway = Math.sin(T * 1.3) * 4;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(s, s);
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    const robe = st.mode === "silhouette" ? "#050507" : "#0a0a0d";
    const edge = st.mode === "line" || st.mode === "neon" ? st.ink : "#000";
    // guadaña
    ctx.save();
    ctx.strokeStyle = st.mode === "silhouette" ? "#050507" : "#6b5a48";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(62 * dir, 10);
    ctx.lineTo(50 * dir, -330);
    ctx.stroke();
    ctx.fillStyle = st.mode === "silhouette" ? "#050507" : "#c9ced6";
    ctx.beginPath();
    ctx.moveTo(50 * dir, -330);
    ctx.quadraticCurveTo(-60 * dir, -360, -120 * dir, -270);
    ctx.quadraticCurveTo(-40 * dir, -320, 48 * dir, -300);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // túnica
    ctx.fillStyle = robe;
    ctx.strokeStyle = edge;
    ctx.lineWidth = st.mode === "line" ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(-70 + sway, 10);
    ctx.quadraticCurveTo(-60, -170, -38, -250);
    ctx.quadraticCurveTo(0, -330, 38, -250);
    ctx.quadraticCurveTo(60, -170, 75 + sway, 10);
    for (let i = 0; i < 6; i++) ctx.lineTo(75 - i * 29 + sway, i % 2 ? 0 : 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // capucha y ojos
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(6 * dir, -262, 22, 28, 0, 0, 7);
    ctx.fill();
    ctx.save();
    ctx.fillStyle = st.danger;
    ctx.shadowColor = st.danger;
    ctx.shadowBlur = 18;
    const g = 0.75 + Math.sin(T * 5) * 0.25;
    ctx.globalAlpha *= g;
    ctx.beginPath();
    ctx.arc(-2 + 8 * dir, -266, 4.5, 0, 7);
    ctx.arc(14 + 8 * dir, -266, 4.5, 0, 7);
    ctx.fill();
    ctx.restore();
    // mano
    ctx.strokeStyle = st.mode === "silhouette" ? "#050507" : "#d9d4c8";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(30 * dir, -170);
    ctx.lineTo(56 * dir, -150);
    ctx.stroke();
    ctx.restore();
  };
  VS.drawMonster = function (ctx, st, o) {
    const T = o.T || 0, s = o.s || 1;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(s, s);
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    const br = Math.sin(T * 1.6) * 6;
    ctx.fillStyle = "#050507";
    ctx.beginPath();
    ctx.moveTo(-150, 10);
    ctx.bezierCurveTo(-190, -200, -120, -380 - br, 0, -400 - br);
    ctx.bezierCurveTo(120, -380 - br, 190, -200, 150, 10);
    ctx.closePath();
    ctx.fill();
    // brazos-garra
    ctx.strokeStyle = "#050507";
    ctx.lineWidth = 22;
    ctx.lineCap = "round";
    for (const sg of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sg * 110, -220);
      ctx.quadraticCurveTo(sg * 230, -260 + br, sg * 260, -150 + br);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(sg * 260, -150 + br);
        ctx.lineTo(sg * (270 + i * 10), -120 + br + i * 8);
        ctx.stroke();
      }
      ctx.lineWidth = 22;
    }
    ctx.save();
    ctx.fillStyle = st.danger;
    ctx.shadowColor = st.danger;
    ctx.shadowBlur = 25;
    ctx.beginPath();
    ctx.ellipse(-38, -300, 14, 7, 0.3, 0, 7);
    ctx.ellipse(38, -300, 14, 7, -0.3, 0, 7);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#f2efe6";
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const x = -48 + i * 16;
      ctx.moveTo(x, -240);
      ctx.lineTo(x + 8, -222);
      ctx.lineTo(x + 16, -240);
    }
    ctx.fill();
    ctx.restore();
  };
  VS.drawGhost = function (ctx, st, o) {
    const T = o.T || 0, s = o.s || 1;
    ctx.save();
    ctx.translate(o.x, o.y - 40 - Math.sin(T * 2) * 12);
    ctx.scale(s, s);
    ctx.globalAlpha *= (o.alpha == null ? 1 : o.alpha) * 0.85;
    ctx.fillStyle = "#e8eef5";
    ctx.shadowColor = "#bcd6ff";
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.moveTo(-55, 0);
    ctx.bezierCurveTo(-60, -150, -40, -230, 0, -230);
    ctx.bezierCurveTo(40, -230, 60, -150, 55, 0);
    for (let i = 0; i < 5; i++) ctx.quadraticCurveTo(55 - i * 22 - 11, 18 + Math.sin(T * 6 + i) * 6, 55 - (i + 1) * 22, 0);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.ellipse(-18, -165, 9, 14, 0, 0, 7);
    ctx.ellipse(18, -165, 9, 14, 0, 0, 7);
    ctx.ellipse(0, -120, 10, 15, 0, 0, 7);
    ctx.fill();
    ctx.restore();
  };

  /* ---------- objetos en la mano ---------- */
  VS.drawHeld = function (ctx, st, item, hand, ang, dir, T) {
    const x = hand[0], y = hand[1];
    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = "round";
    if (item === "sword") {
      ctx.rotate(-(ang - Math.PI) * dir * 0 + (dir > 0 ? -0.6 : 0.6) * 0);
      ctx.strokeStyle = "#cfd6de"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(70 * dir, -70); ctx.stroke();
      ctx.strokeStyle = st.accent; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-10 * dir, -10); ctx.lineTo(10 * dir, 10); ctx.stroke();
    } else if (item === "torch") {
      ctx.strokeStyle = "#7a5530"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -40); ctx.stroke();
      VS.flame(ctx, 0, -48, 1, T);
    } else if (item === "lantern") {
      ctx.strokeStyle = st.ink; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 12); ctx.stroke();
      ctx.save(); ctx.fillStyle = st.accent; ctx.shadowColor = st.accent; ctx.shadowBlur = 30;
      ctx.fillRect(-10, 12, 20, 26); ctx.restore();
    } else if (item === "baby") {
      ctx.fillStyle = "#f1e7d6"; ctx.strokeStyle = "#6b5a48"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(8 * dir, -6, 26, 15, -0.2 * dir, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = st.skin; ctx.beginPath(); ctx.arc(28 * dir, -12, 10, 0, 7); ctx.fill(); ctx.stroke();
    } else if (item === "book") {
      ctx.fillStyle = st.danger; ctx.fillRect(-4, -26, 30 * dir, 36);
      ctx.fillStyle = "#f1e7d6"; ctx.fillRect(dir > 0 ? 24 : -28, -24, 4 * dir, 32);
    } else if (item === "phone") {
      ctx.fillStyle = "#15171c"; VS.roundRect(ctx, -9, -34, 18, 32, 4); ctx.fill();
      ctx.fillStyle = st.cool; ctx.fillRect(-6, -30, 12, 22);
    } else if (item === "money") {
      ctx.fillStyle = "#6fbf73"; ctx.strokeStyle = "#2f6b33"; ctx.lineWidth = 2;
      ctx.fillRect(-4, -18, 34 * dir, 20); ctx.strokeRect(-4, -18, 34 * dir, 20);
    } else if (item === "flag") {
      ctx.strokeStyle = "#7a5530"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(0, -110); ctx.stroke();
      ctx.fillStyle = st.danger;
      ctx.beginPath(); ctx.moveTo(0, -110);
      for (let i = 0; i <= 8; i++) ctx.lineTo(i * 8 * dir, -110 + Math.sin(T * 6 + i * 0.7) * 5);
      for (let i = 8; i >= 0; i--) ctx.lineTo(i * 8 * dir, -70 + Math.sin(T * 6 + i * 0.7) * 5);
      ctx.closePath(); ctx.fill();
    } else if (item === "staff") {
      ctx.strokeStyle = "#7a5530"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(0, 60); ctx.lineTo(0, -90); ctx.stroke();
      ctx.save(); ctx.fillStyle = st.cool; ctx.shadowColor = st.cool; ctx.shadowBlur = 22;
      ctx.beginPath(); ctx.arc(0, -98, 10, 0, 7); ctx.fill(); ctx.restore();
    } else if (item === "letter") {
      ctx.fillStyle = "#f1e7d6"; ctx.strokeStyle = "#6b5a48"; ctx.lineWidth = 2;
      ctx.fillRect(-2, -20, 34 * dir, 24); ctx.strokeRect(-2, -20, 34 * dir, 24);
      ctx.beginPath(); ctx.moveTo(-2, -20); ctx.lineTo(15 * dir, -6); ctx.lineTo(32 * dir, -20); ctx.stroke();
    } else if (VS.PROPS && VS.PROPS[item]) {
      VS.PROPS[item](ctx, st, 22 * dir, -18, 0.32, T, {});
    }
    ctx.restore();
  };
})();
