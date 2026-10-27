/* Viral Studio — interfaz (JavaScript sin dependencias; fácil de ampliar).
   Vistas: Crear · Proyecto (storyboard + vista previa en vivo) · Proyectos · Ajustes */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const S = { opt: null, form: null, proj: null, poll: null, player: null, thumbs: new Map(), lastDone: 0 };
  const STAGE_NAMES = { story: "✍️ Guion", voice: "🎙️ Voz", music: "🎵 Música", build: "🧩 Montaje", render: "🎞️ Render", qa: "🔎 QA" };
  const META_KEYS = ["name", "icon", "desc", "captions", "time"];

  async function api(path, opts = {}) {
    const o = Object.assign({ headers: {} }, opts);
    if (o.body && typeof o.body !== "string" && !(o.body instanceof FormData)) {
      o.body = JSON.stringify(o.body);
      o.headers["Content-Type"] = "application/json";
    }
    const r = await fetch("api/" + path, o);
    let j = null;
    try { j = await r.json(); } catch (e) { /* vacío */ }
    if (!r.ok) throw new Error((j && j.error) || r.statusText);
    return j;
  }
  function toast(msg, err) {
    const t = document.createElement("div");
    t.className = "toast" + (err ? " err" : "");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), err ? 6000 : 2600);
  }
  const fmtT = (t) => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, "0")}`; };
  const fmtDur = (s) => (s < 90 ? `${s} s` : `${Math.round(s / 60)} min`);

  /* ------------------------------------------------------------ motor (vista previa) */
  function styleObj(key, overrides) {
    const st = Object.assign({}, S.opt.presets.styles[key] || {}, overrides || {});
    META_KEYS.forEach((k) => delete st[k]);
    return st;
  }
  function estimateTimes(scenes) {
    let t = 0;
    return scenes.map((s) => {
      let d = s.dur;
      if (!d) {
        const a = s.audio && s.audio.dur;
        const words = (s.narration || "").split(/\s+/).filter(Boolean).length;
        d = a ? a + 0.3 : words ? Math.max(1.6, words / 2.5 + 0.3) : s.hold || 2.4;
      }
      const o = Object.assign({}, s, { start: s.start != null && s.dur ? s.start : t, dur: d });
      t = o.start + o.dur;
      return o;
    });
  }
  function filmData(W, H, styleKey, overrides, cast, scenes) {
    return { W, H, style: styleObj(styleKey, overrides), cast: cast || {}, scenes, emph: [] };
  }
  const SAMPLE = (portrait) => [
    { shot: "kinetic", variant: "stack", lines: [{ text: "Tu historia" }, { text: "más", accent: true }, { text: "viral" }], badge: "YA", dur: 2.6 },
    { shot: "scene", env: "night_city", time: "night", chars: [{ who: "hero", action: "walk", travel: "in_left" }], chip: "Lugar · 1942", trans: "flash", dur: 3 },
    { shot: "closeup", env: "room", chars: [{ who: "hero", action: "shock" }], trans: "whip", dur: 2.4 },
    { shot: "map", country: "Spain", lat: 40.4, lon: -3.7, label: "Madrid", trans: "zoom", dur: 3.2 },
    { shot: "danger", env: "street", mood: "fear", chars: [{ who: "hero", action: "scared" }], creature: "reaper", weather: "rain", dur: 3 },
    { shot: "number", number: "2500", label: "vidas salvadas", trans: "flash", dur: 2.6 },
  ];
  const SAMPLE_CAST = { hero: { name: "Héroe", hair: "bun", dress: true, outfit: "#e3a83e" } };

  function makeFilmCanvas(W, H) {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    return c;
  }
  function stillOf(canvas, data, t) {
    try {
      const f = window.VS.film(canvas, data);
      f.render(t);
    } catch (e) {
      console.warn(e);
    }
  }

  // Reproductor de vista previa en vivo (canvas + subtítulos simples + audio opcional)
  function Player(host, data, opts = {}) {
    const W = data.W, H = data.H;
    const scale = Math.min(1, (H > W ? 960 : 960) / Math.max(W, H));
    const c = makeFilmCanvas(Math.round(W * scale), Math.round(H * scale));
    const d2 = Object.assign({}, data, { W: c.width, H: c.height });
    const film = window.VS.film(c, d2);
    const total = data.scenes.length ? data.scenes[data.scenes.length - 1].start + data.scenes[data.scenes.length - 1].dur : 1;
    host.innerHTML = "";
    const stage = document.createElement("div");
    stage.className = "stage" + (H > W ? " v" : "");
    stage.appendChild(c);
    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = opts.badge || "VISTA PREVIA EN VIVO";
    stage.appendChild(badge);
    host.appendChild(stage);
    const ctrl = document.createElement("div");
    ctrl.className = "ctrl";
    ctrl.innerHTML = `<button class="btn sm" data-a="play">▶</button><input type="range" min="0" max="${total}" step="0.01" value="0"><span class="tc">0:00 / ${fmtT(total)}</span>`;
    host.appendChild(ctrl);
    const audio = opts.audio ? new Audio(opts.audio) : null;
    let t = 0, playing = !!opts.autoplay, last = performance.now(), raf = 0;
    const words = opts.words || [];
    const ctx = c.getContext("2d");
    function caption(t) {
      if (!words.length) return;
      let i = words.findIndex((w) => w.s <= t && t < w.e + 0.25);
      if (i < 0) return;
      const g0 = Math.floor(i / 3) * 3, grp = words.slice(g0, g0 + 3);
      const fs = Math.round(c.width * (H > W ? 0.075 : 0.04));
      ctx.save();
      ctx.font = `900 ${fs}px Montserrat`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const y = H > W ? c.height * 0.73 : c.height * 0.88;
      const txt = grp.map((w) => w.w).join(" ");
      const tw = ctx.measureText(txt).width;
      let x = c.width / 2 - tw / 2;
      ctx.textAlign = "left";
      grp.forEach((w) => {
        const ww = ctx.measureText(w.w + " ").width;
        ctx.lineWidth = fs * 0.16;
        ctx.strokeStyle = "rgba(0,0,0,.85)";
        ctx.strokeText(w.w, x, y);
        ctx.fillStyle = w.s <= t ? (w.k ? "#f0b648" : "#fff") : "rgba(255,255,255,.55)";
        ctx.fillText(w.w, x, y);
        x += ww;
      });
      ctx.restore();
    }
    function draw() {
      film.render(t);
      caption(t);
      ctrl.querySelector("input").value = t;
      ctrl.querySelector(".tc").textContent = `${fmtT(t)} / ${fmtT(total)}`;
    }
    function loop(now) {
      const dt = (now - last) / 1000;
      last = now;
      if (playing) {
        t = audio && !audio.paused ? audio.currentTime : t + dt;
        if (t >= total) { t = opts.loop ? 0 : total; if (!opts.loop) setPlay(false); if (audio) audio.currentTime = 0; }
      }
      draw();
      raf = requestAnimationFrame(loop);
    }
    function setPlay(p) {
      playing = p;
      ctrl.querySelector("[data-a=play]").textContent = p ? "❚❚" : "▶";
      if (audio) { if (p) { audio.currentTime = t; audio.play().catch(() => {}); } else audio.pause(); }
    }
    ctrl.querySelector("[data-a=play]").onclick = () => setPlay(!playing);
    ctrl.querySelector("input").oninput = (e) => { t = +e.target.value; if (audio) audio.currentTime = t; };
    setPlay(playing);
    raf = requestAnimationFrame(loop);
    return {
      seek(x) { t = x; if (audio) audio.currentTime = x; },
      stop() { cancelAnimationFrame(raf); if (audio) audio.pause(); },
    };
  }

  /* ------------------------------------------------------------ cabecera: GPU */
  async function pollSystem() {
    try {
      const s = await api("system");
      const dev = (s.stats && s.stats.devices && s.stats.devices[0]) || null;
      if (dev) {
        const used = dev.vram_total - dev.vram_free;
        $("#gpuName").textContent = (dev.name || "GPU").replace(/^cuda:\d+\s*/, "").replace(/ : .*/, "").slice(0, 34);
        $("#vramBar").style.width = Math.round((used / dev.vram_total) * 100) + "%";
        $("#vramTxt").textContent = `${(used / 1e9).toFixed(1)}/${(dev.vram_total / 1e9).toFixed(0)} GB`;
      }
      const q = s.queue || {};
      $("#queuePill").textContent = `cola ${q.running + q.pending || 0}`;
    } catch (e) { /* ComfyUI ocupado */ }
  }

  /* ------------------------------------------------------------ vista: Crear */
  function defaultsForm() {
    const vt = S.opt.presets.video_types.historia_oscura || Object.values(S.opt.presets.video_types)[0];
    return {
      topic: "", duration: 60, format: "vertical", video_type: "historia_oscura", language: S.opt.settings.language || "es",
      style: vt.style, captions: vt.captions, voice: vt.voice, music: true, music_prompt: vt.music, pace: "normal",
      quality: S.opt.settings.render_quality || "high", extra: "", script: "", useScript: false, end_card: true,
      tts_engine: S.opt.settings.tts_engine || "qwen3", voice_design: "", clone_audio: "", clone_text: "",
      engine: "vector",
    };
  }
  /* ---- selector de modo: Tema → video · Mi guion → video · Mi audio → video ---- */
  const MODES = [["topic", "🧠", "Tema → video", "Escribe una idea: la IA escribe, narra y anima."],
    ["script", "📝", "Mi guion → video", "Pega tu texto: se respeta palabra por palabra."],
    ["audio", "🎧", "Mi audio → video", "Sube tu narración: se anima al segundo exacto de tu voz."]];
  function modeTabs(cur) {
    return `<h1>Crea un video</h1><div class="modes">${MODES.map(([k, ic, n, d]) => `<div class="mode ${cur === k ? "on" : ""}" data-mode="${k}"><div class="ic">${ic}</div><b>${n}</b><small>${d}</small></div>`).join("")}</div>`;
  }
  document.addEventListener("click", (e) => {
    const m = e.target.closest && e.target.closest("[data-mode]");
    if (!m || !S.form) return;
    if (S.form.mode !== "audio" && $("#topic")) readForm();
    S.form.mode = m.dataset.mode;
    S.form.useScript = S.form.mode === "script";
    viewCreate();
  });
  function audioCtx() { return { api, toast, opt: S.opt, form: S.form, modeTabs }; }

  const DURS_SHORT = [15, 30, 45, 60, 90];
  const DURS_LONG = [180, 300, 480, 720, 1200, 1800];

  function viewCreate() {
    const f = S.form || (S.form = defaultsForm());
    f.mode = f.mode || (f.useScript ? "script" : "topic");
    if (f.mode === "audio" && window.VSAudio) return window.VSAudio.createView($("#app"), audioCtx());
    const P = S.opt.presets;
    const vt = P.video_types, st = P.styles, cap = P.captions, voi = P.voices;
    const app = $("#app");
    app.innerHTML = `${modeTabs(f.mode)}
    <p class="sub">Escribe el tema, elige duración y estilo. Viral Studio escribe la historia, la narra, compone la música, anima cada escena con HyperFrames y te entrega el MP4.</p>
    <div class="grid cols">
      <div>
        <div class="card">
          <h2><span class="n">1</span>¿De qué trata tu video?</h2>
          <textarea class="topic" id="topic" placeholder="Ej.: La enfermera que sacó a 2.500 niños del gueto de Varsovia escondidos en maletas">${esc(f.topic)}</textarea>
          <div class="row" style="margin-top:10px">
            <label class="toggle"><input type="checkbox" id="useScript" ${f.useScript ? "checked" : ""}><i></i>Tengo mi propio guion</label>
          </div>
          <div id="scriptBox" style="display:${f.useScript ? "block" : "none"}">
            <label class="f">Tu guion (se respeta palabra por palabra)</label>
            <textarea id="script" style="min-height:160px" placeholder="Pega aquí tu narración. Marca palabras clave con *asteriscos*.">${esc(f.script)}</textarea>
          </div>
          <label class="f">Instrucciones extra (opcional)</label>
          <input class="inp" id="extra" value="${esc(f.extra)}" placeholder="Ej.: tono más oscuro, final con giro, menciona la fecha exacta…">
        </div>

        <div class="card">
          <h2><span class="n">2</span>Formato y duración</h2>
          <div class="fmt">${Object.entries(S.opt.formats).map(([k, v]) => {
            const w = v.W > v.H ? 46 : v.W === v.H ? 30 : 22, hh = v.W > v.H ? 26 : v.W === v.H ? 30 : 38;
            return `<div class="opt ${f.format === k ? "on" : ""}" data-fmt="${k}"><div class="shape" style="width:${w}px;height:${hh}px"></div><b>${esc(v.name)}</b><small>${v.W}×${v.H}</small></div>`;
          }).join("")}</div>
          <label class="f">Duración aproximada</label>
          <div class="chips" id="durs">${(f.format === "horizontal" ? DURS_SHORT.concat(DURS_LONG) : DURS_SHORT.concat([180]))
            .map((d) => `<span class="chip ${+f.duration === d ? "on" : ""}" data-d="${d}">${fmtDur(d)}</span>`).join("")}
            <input class="inp" id="durCustom" style="width:120px;flex:0" type="number" min="10" max="3600" value="${f.duration}" title="segundos"></div>
          <div class="row" style="margin-top:4px">
            <div><label class="f">Idioma</label><select id="language">${Object.entries(S.opt.languages).map(([k, v]) => `<option value="${k}" ${f.language === k ? "selected" : ""}>${v.name}</option>`).join("")}</select></div>
            <div><label class="f">Ritmo</label><select id="pace">${[["rapido", "Rápido (shorts)"], ["normal", "Normal"], ["lento", "Lento (documental)"]].map(([k, v]) => `<option value="${k}" ${f.pace === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
            <div><label class="f">Calidad</label><select id="quality">${[["draft", "Borrador rápido"], ["standard", "Estándar"], ["high", "Máxima"]].map(([k, v]) => `<option value="${k}" ${f.quality === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
          </div>
          <div class="est" id="estimate"></div>
        </div>

        <div class="card">
          <h2><span class="n">3</span>Animación</h2>
          <div class="opts">
            <div class="opt ${f.engine !== "classic" ? "on" : ""}" data-eng="vector"><div class="ic">🎨</div><b>Ilustrado (recomendado)</b><small>Detecta en tu texto qué personajes y animales aparecen (perro, paloma, médica, reina…), los dibuja y los anima; subtítulos palabra a palabra.</small></div>
            <div class="opt ${f.engine === "classic" ? "on" : ""}" data-eng="classic"><div class="ic">🎬</div><b>Clásico</b><small>El motor original con estilos cinematográficos y tarjeta final.</small></div>
          </div>
        </div>

        <div class="card">
          <h2><span class="n">4</span>Tipo de video</h2>
          <div class="opts">${Object.entries(vt).map(([k, v]) => `<div class="opt ${f.video_type === k ? "on" : ""}" data-vt="${k}"><div class="ic">${v.icon || "🎬"}</div><b>${esc(v.name)}</b></div>`).join("")}</div>
        </div>

        <div class="card" style="display:${f.engine === "classic" ? "block" : "none"}">
          <h2><span class="n">5</span>Estilo visual</h2>
          <div class="opts" id="styleOpts">${Object.entries(st).map(([k, v]) => `<div class="opt ${f.style === k ? "on" : ""}" data-st="${k}"><canvas width="320" height="200" data-thumb="${k}"></canvas><b>${v.icon || ""} ${esc(v.name)}</b><small>${esc(v.desc || "")}</small></div>`).join("")}</div>
        </div>

        <div class="card">
          <h2><span class="n">${f.engine === "classic" ? 6 : 5}</span>Voz, subtítulos y música</h2>
          <div class="row">
            <div><label class="f">Narrador</label><select id="voice">${Object.entries(voi).map(([k, v]) => `<option value="${k}" ${f.voice === k ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></div>
            <div><label class="f">Motor de voz</label><select id="tts_engine"><option value="qwen3" ${f.tts_engine === "qwen3" ? "selected" : ""}>Qwen3-TTS (máxima calidad, GPU)</option><option value="kokoro" ${f.tts_engine === "kokoro" ? "selected" : ""}>Kokoro (rápido)</option></select></div>
            <div><label class="f">Subtítulos</label><select id="captions">${Object.entries(cap).map(([k, v]) => `<option value="${k}" ${f.captions === k ? "selected" : ""}>${esc(v.name)}</option>`).join("")}<option value="none" ${f.captions === "none" ? "selected" : ""}>Sin subtítulos</option></select></div>
          </div>
          <label class="f">Diseño de voz (opcional · describe cómo suena)</label>
          <input class="inp" id="voice_design" value="${esc(f.voice_design)}" placeholder="${esc((voi[f.voice] || {}).design || "")}">
          <div id="cloneBox" style="display:${f.voice === "clonar" ? "block" : "none"}">
            <label class="f">Muestra de tu voz (10-20 s, WAV/MP3)</label>
            <div class="row"><input type="file" id="cloneFile" accept="audio/*" class="inp"><input class="inp" id="clone_text" placeholder="Transcripción exacta de la muestra (opcional)" value="${esc(f.clone_text)}"></div>
            <div class="hint" id="cloneHint">${f.clone_audio ? "✓ muestra subida" : ""}</div>
          </div>
          <div class="row" style="margin-top:14px">
            <label class="toggle"><input type="checkbox" id="music" ${f.music ? "checked" : ""}><i></i>Música original (ACE-Step)</label>
            <label class="toggle" style="display:${f.engine === "classic" ? "" : "none"}"><input type="checkbox" id="end_card" ${f.end_card ? "checked" : ""}><i></i>Tarjeta final con "Suscríbete"</label>
          </div>
          <label class="f">Estilo musical</label>
          <input class="inp" id="music_prompt" value="${esc(f.music_prompt)}">
        </div>
        <div class="actions">
          <button class="btn pri big" id="goAll">⚡ Crear video completo</button>
          <button class="btn big" id="goStory">✍️ Solo el guion (lo reviso antes)</button>
        </div>
      </div>
      <div><div class="card sticky"><h2>${f.engine === "classic" ? "Vista previa del estilo" : "Así se ve el modo ilustrado"}</h2><div id="stylePreview"></div><p class="hint">${f.engine === "classic" ? "Animación real del motor HyperFrames con el estilo y formato elegidos." : "Motor real: los personajes salen de tu texto (ejemplo con «paloma», «perro» y «doctora»)."}</p></div></div>
    </div>`;
    bindCreate();
    drawStyleThumbs();
    stylePreview();
    estimate();
  }

  function readForm() {
    const f = S.form;
    ["topic", "script", "extra", "language", "pace", "quality", "voice", "tts_engine", "captions", "voice_design", "music_prompt", "clone_text"].forEach((k) => {
      const el = $("#" + k);
      if (el) f[k] = el.value;
    });
    f.useScript = $("#useScript").checked;
    f.music = $("#music").checked;
    f.end_card = $("#end_card").checked;
    const dc = +$("#durCustom").value;
    if (dc) f.duration = dc;
    return f;
  }

  function bindCreate() {
    const f = S.form;
    $("#useScript").onchange = (e) => { $("#scriptBox").style.display = e.target.checked ? "block" : "none"; f.mode = e.target.checked ? "script" : "topic"; $$(".mode").forEach((m) => m.classList.toggle("on", m.dataset.mode === f.mode)); };
    $$("[data-fmt]").forEach((el) => (el.onclick = () => { readForm(); f.format = el.dataset.fmt; if (f.format !== "horizontal" && f.duration > 180) f.duration = 60; viewCreate(); }));
    $$("[data-d]").forEach((el) => (el.onclick = () => { readForm(); f.duration = +el.dataset.d; $("#durCustom").value = f.duration; $$("[data-d]").forEach((x) => x.classList.toggle("on", x === el)); estimate(); }));
    $("#durCustom").oninput = () => { f.duration = +$("#durCustom").value || f.duration; estimate(); };
    $$("[data-vt]").forEach((el) => (el.onclick = () => {
      readForm();
      const v = S.opt.presets.video_types[el.dataset.vt];
      Object.assign(f, { video_type: el.dataset.vt, style: v.style || f.style, captions: v.captions || f.captions, voice: v.voice || f.voice, music_prompt: v.music || f.music_prompt });
      viewCreate();
    }));
    $$("[data-st]").forEach((el) => (el.onclick = () => { readForm(); f.style = el.dataset.st; const c = S.opt.presets.styles[f.style].captions; if (c) f.captions = c; viewCreate(); }));
    $("#voice").onchange = () => { readForm(); viewCreate(); };
    $("#cloneFile") && ($("#cloneFile").onchange = async (e) => {
      const fd = new FormData();
      fd.append("file", e.target.files[0]);
      try { const r = await api("upload", { method: "POST", body: fd }); f.clone_audio = r.path; $("#cloneHint").textContent = "✓ muestra subida"; } catch (er) { toast(er.message, true); }
    });
    $$("[data-eng]").forEach((el) => (el.onclick = () => { readForm(); f.engine = el.dataset.eng; viewCreate(); }));
    $("#goAll").onclick = () => start(["story", "voice", "music", "build", "render"]);
    $("#goStory").onclick = () => start(["story"]);
  }

  function estimate() {
    const f = S.form;
    const d = +f.duration || 60;
    const words = Math.round(d * 2.5), scenes = Math.max(3, Math.round(words / (d <= 90 ? 9 : 13)));
    const mins = (d / 60) * 1.6 + Math.ceil(d / 70) * 1.3 + 1.5;
    $("#estimate").innerHTML = `≈ <b>${words}</b> palabras · <b>${scenes}</b> escenas · ${d > 70 ? `<b>${Math.round(d / 70)}</b> capítulos · ` : ""}tiempo estimado en RTX PRO 6000: <b>${Math.round(mins)}–${Math.round(mins * 1.8)} min</b>`;
  }

  function drawStyleThumbs() {
    $$("[data-thumb]").forEach((cv) => {
      const k = cv.dataset.thumb;
      const sc = estimateTimes([{ shot: "scene", env: k === "documental_sepia" ? "village" : k === "carbon_noir" ? "room" : k === "sombras_atardecer" ? "desert" : "night_city", time: (S.opt.presets.styles[k] || {}).time || "night", chars: [{ who: "hero", action: "walk" }, { action: "point", look: { hat: "fedora" } }], dur: 3, punch: false }]);
      stillOf(cv, filmData(cv.width, cv.height, k, null, SAMPLE_CAST, sc), 1.3);
    });
  }
  function stylePreview() {
    const f = S.form;
    const fm = S.opt.formats[f.format];
    if (S.player) S.player.stop();
    if (f.engine !== "classic" && window.VSV && window.VSV.film) return vectorPreview(fm);
    const sc = estimateTimes(SAMPLE(fm.H > fm.W));
    S.player = Player($("#stylePreview"), filmData(fm.W, fm.H, f.style, null, SAMPLE_CAST, sc), { autoplay: true, loop: true, badge: "ESTILO: " + (S.opt.presets.styles[f.style] || {}).name });
  }

  // vista previa del modo ilustrado: motor vectorial real, en bucle, sin servidor
  function vectorPreview(fm) {
    const W = fm.W, H = fm.H, host = $("#stylePreview");
    const sc = (id, a, b, bg, chars, extra) => Object.assign({ id, start_frame: a * 30, end_frame: b * 30, start_s: a, end_s: b, template: "character_scene",
      background: { asset_id: bg }, characters: chars, props: [], beats: [], camera: { shot: "wide", movement: "slow_push" }, overlays: [], transition_in: "cut", punch_s: [] }, extra || {});
    const dog = { bodyL: 300, bodyH: 120, legL: 130, legW: 30, neckL: 60, neckA: 0.75, neckW: 64, headR: 52, snout: 46, ears: "floppy", tail: "up", tailL: 100, tailW: 14, body: "#c88a4a", earC: "#8a5a2e", muzzle: "#e9c49a", size: 0.36 };
    const words = "Una paloma camina por la plaza. Un perro la persigue. La doctora lo mira sorprendida.".split(" ");
    const caps = []; let t = 0.2;
    words.forEach((w) => { caps.push({ w, s: t, hl: /paloma|perro|doctora/.test(w) }); t += 0.42 + (/[.]$/.test(w) ? 0.3 : 0); });
    const groups = [[0, 6], [6, 10], [10, 15]].map(([i, j]) => ({ s: caps[i].s, e: j < caps.length ? caps[j].s - 0.02 : 99, lines: [caps.slice(i, j)] }));
    const data = { W, H, fps: 30, seed: 7, lang: "es", vignette: 0.35, captions: { enabled: true, groups },
      scenes: [sc("a", 0, 3, "plaza_layered_v1", [{ id: "pigeon_01", rig: "pigeon", action: "walk" }], { camera: { shot: "wide", movement: "track" } }),
        sc("b", 3, 4.9, "park_day_v1", [{ id: "dog_01", rig: "quadruped", action: "run", params: dog }]),
        sc("c", 4.9, 7.2, "park_day_v1", [{ id: "doctor_01", rig: "person", variant: "woman", action: "idle", colors: { coat: "#f6f8fa", shirt: "#7ab0d8", stetho: true, hair: "long" } }, { id: "dog_01", rig: "quadruped", action: "idle", params: dog }],
          { beats: [{ at_s: 5.6, action: "surprise", target: "doctor_01" }], camera: { shot: "medium", movement: "push_in" } })] };
    const box = Math.min(360, host.clientWidth || 360), k = H > W ? (box * 1.4) / H : box / W;
    host.innerHTML = `<div class="stage ${H > W ? "v" : ""}" style="width:${W * k}px;height:${H * k}px;position:relative;overflow:hidden;margin:auto"><div id="vpHost" style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform:scale(${k});transform-origin:0 0"></div><div class="badge">MODO ILUSTRADO</div></div>`;
    const film = window.VSV.film($("#vpHost"), data);
    const t0 = performance.now();
    let raf = 0;
    const loop = () => { if (!document.body.contains(host)) return; film.render(((performance.now() - t0) / 1000) % 7.2); raf = requestAnimationFrame(loop); };
    loop();
    S.player = { stop: () => cancelAnimationFrame(raf) };
  }

  async function start(stages) {
    const f = readForm();
    if (!f.topic.trim() && !(f.useScript && f.script.trim())) return toast("Escribe el tema del video", true);
    const settings = Object.assign({}, f);
    if (!f.useScript) settings.script = "";
    delete settings.useScript;
    if (!settings.topic) settings.topic = (settings.script || "").slice(0, 80);
    try {
      const p = await api("projects", { method: "POST", body: { settings, run: stages } });
      location.hash = "#/p/" + p.id;
    } catch (e) { toast(e.message, true); }
  }

  /* ------------------------------------------------------------ vista: Proyecto */
  async function viewProject(id) {
    let p;
    try { p = await api("projects/" + id); } catch (e) { $("#app").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    S.proj = p;
    if ((p.input_mode === "audio" || p.engine === "vector") && window.VSAudio) return window.VSAudio.projectView(p, audioCtx());
    S.lastDone = (p.live && p.live.done ? p.live.done.length : 0);
    renderProject();
    startPolling(id);
  }

  function projectFilm(p, W, H) {
    const sc = estimateTimes(p.scenes || []);
    return { data: filmData(W, H, p.settings.style, p.settings.style_overrides, (p.bible || {}).cast, sc), scenes: sc };
  }

  function wordsOf(scenes) {
    const out = [];
    scenes.forEach((s) => {
      const toks = (s.narration || "").split(/\s+/).filter(Boolean);
      if (!toks.length) return;
      const base = s.start + (s.audio ? 0.1 : 0);
      const timed = (s.audio && s.audio.words) || [];
      const vd = (s.audio && s.audio.dur) || s.dur - 0.3;
      toks.forEach((w, i) => {
        const k = /^\*|\*[.,;:!?]*$/.test(w) ? 1 : 0;
        const tw = timed.length === toks.length ? timed[i] : null;
        const s0 = tw ? base + tw.s : base + (vd * i) / toks.length, e0 = tw ? base + tw.e : base + (vd * (i + 1)) / toks.length;
        out.push({ w: w.replace(/\*/g, ""), s: s0, e: e0, k });
      });
    });
    return out;
  }

  function renderProject() {
    const p = S.proj, st = p.settings, b = p.bible || {};
    const fm = S.opt.formats[st.format] || S.opt.formats.vertical;
    const live = p.live || {};
    const app = $("#app");
    const done = new Set(live.done || (p.status && p.status.done) || []);
    const running = live.running;
    app.innerHTML = `
    <div class="phead">
      <div style="flex:1;min-width:280px">
        <h1>${esc(b.title || st.topic || "Proyecto")}</h1>
        <div class="row tight" style="gap:6px">
          <span class="pill">${esc(fm.name)}</span><span class="pill">${fmtDur(+st.duration)}</span>
          <span class="pill">${esc((S.opt.presets.styles[st.style] || {}).name || st.style)}</span>
          <span class="pill">${(p.scenes || []).length} escenas</span>
          ${p.total ? `<span class="pill ok">${fmtT(p.total)} reales</span>` : ""}
          <span class="pill ${p.state === "DONE" ? "ok" : /FAIL|CANCEL|INTERRUPT/.test(p.state || "") ? "bad" : ""}" title="Estado del trabajo (Guía V2)">${esc(p.state || "")}</span>
        </div>
        <div class="stages">${Object.entries(STAGE_NAMES).map(([k, v]) => `<span class="stg ${done.has(k) ? "done" : ""} ${running && live.stage === k ? "run" : ""}">${v}</span>`).join("")}</div>
        <div class="prog"><i style="width:${Math.round((live.progress || 0) * 100)}%"></i></div>
        <div class="msg" id="pmsg">${esc(live.message || (p.status || {}).message || "")}</div>
      </div>
      <div class="actions" style="margin-top:0">
        <button class="btn pri" data-run="story,voice,music,build,render" ${running ? "disabled" : ""}>⚡ Hacer todo</button>
        <button class="btn" data-run="voice,music,build,render" ${running || !(p.scenes || []).length ? "disabled" : ""}>▶ Continuar desde el guion</button>
        <button class="btn" data-run="build,render" ${running || !(p.scenes || []).length ? "disabled" : ""}>🎞️ Re-renderizar</button>
        ${running ? `<button class="btn red" id="cancel">⛔ Cancelar</button>` : ""}
        ${!running && p.job && (p.job.remaining || []).length ? `<button class="btn pri" id="resume" title="Sigue por las etapas que faltaban, sin repetir lo hecho">↻ Reanudar (${p.job.remaining.map((s) => STAGE_NAMES[s] || s).join(" → ")})</button>` : ""}
      </div>
    </div>
    <div class="grid cols">
      <div class="card">
        <div class="bhead"><h2>Storyboard</h2>
          <div class="btns">
            <button class="btn sm" data-run="story" ${running ? "disabled" : ""}>✍️ Reescribir guion</button>
            <button class="btn sm" data-run="voice" ${running ? "disabled" : ""}>🎙️ Voz</button>
            <button class="btn sm" data-run="music" ${running ? "disabled" : ""}>🎵 Música</button>
          </div></div>
        <div class="board" id="board">${(p.scenes || []).length ? "" : `<div class="empty">${running ? "La IA está escribiendo la historia…" : "Sin escenas todavía. Pulsa “Hacer todo” o “Reescribir guion”."}</div>`}</div>
      </div>
      <div><div class="card sticky">
        <div class="tabs"><a data-tab="video" class="on">Video</a><a data-tab="qa">QA${p.qa ? (p.qa.status === "PASS" ? " ✅" : p.qa.status === "FAIL" ? " ⛔" : " ⚠️") : ""}</a><a data-tab="log">Registro</a><a data-tab="yt">YouTube</a><a data-tab="files">Archivos</a><a data-tab="cfg">Ajustes</a></div>
        <div id="tab"></div>
      </div></div>
    </div>`;
    $$("[data-run]").forEach((el) => (el.onclick = () => run(el.dataset.run.split(","))));
    $("#resume") && ($("#resume").onclick = async () => { try { await api(`projects/${p.id}/resume`, { method: "POST" }); S.errShown = false; toast("Reanudando…"); await refresh(true); } catch (e) { toast(e.message, true); } });
    $("#cancel") && ($("#cancel").onclick = async () => { await api(`projects/${p.id}/cancel`, { method: "POST" }); toast("Cancelando…"); });
    $$(".tabs a").forEach((a) => (a.onclick = () => { $$(".tabs a").forEach((x) => x.classList.toggle("on", x === a)); renderTab(a.dataset.tab); }));
    renderBoard();
    renderTab("video");
  }

  function renderTab(tab) {
    const p = S.proj, el = $("#tab");
    if (S.player) { S.player.stop(); S.player = null; }
    const fm = S.opt.formats[p.settings.format] || S.opt.formats.vertical;
    if (tab === "video") {
      el.innerHTML = `<div id="playerHost"></div><div class="row" style="margin-top:10px;gap:8px" id="vbtns"></div>`;
      const url = p.urls && p.urls.video;
      const showFinal = url && !S.forceLive;
      if (showFinal) {
        el.querySelector("#playerHost").innerHTML = `<div class="stage ${fm.H > fm.W ? "v" : ""}"><video src="${url}?v=${p.updated}" controls playsinline></video><div class="badge">MP4 FINAL</div></div>`;
      } else if ((p.scenes || []).length) {
        const { data, scenes } = projectFilm(p, fm.W, fm.H);
        const mix = p.outputs && p.outputs.hf ? `files/${p.id}/hf/assets/audio/mix.wav?v=${p.updated}` : null;
        S.player = Player(el.querySelector("#playerHost"), data, { words: wordsOf(scenes), audio: mix && p.total ? "../viralstudio/" + mix : null });
      } else el.querySelector("#playerHost").innerHTML = `<div class="empty">Aquí verás la vista previa en cuanto exista el guion.</div>`;
      const vb = el.querySelector("#vbtns");
      if (url) vb.innerHTML += `<a class="btn sm" href="${url}" download>⬇️ MP4 máxima calidad</a>${p.urls.video_light ? `<a class="btn sm" href="${p.urls.video_light}" download>⬇️ MP4 para redes</a>` : ""}<button class="btn sm" id="toggleLive">${showFinal ? "👁️ Vista previa en vivo" : "🎞️ Ver MP4"}</button>`;
      vb.innerHTML += `<button class="btn sm" id="hfStudio">🎛️ Editar en HyperFrames Studio</button><a class="btn sm" href="api/projects/${p.id}/download">📦 Proyecto completo (.zip)</a>`;
      $("#toggleLive") && ($("#toggleLive").onclick = () => { S.forceLive = !S.forceLive; renderTab("video"); });
      $("#hfStudio").onclick = async () => {
        try {
          const r = await api(`projects/${p.id}/hfstudio`, { method: "POST" });
          const url2 = r.hint ? r.hint + r.path : `${location.protocol}//${location.hostname}:${r.port}${r.path}`;
          toast("Abriendo HyperFrames Studio…");
          window.open(url2, "_blank");
        } catch (e) { toast(e.message, true); }
      };
    } else if (tab === "qa") {
      const q = p.qa, ap = p.approval;
      const fid = (p.bible || {}).fidelity;
      el.innerHTML = !q ? `<div class="empty">El control de calidad se ejecuta solo al terminar el render.</div>` : `
        <div class="row tight" style="gap:8px;margin-bottom:10px"><span class="pill ${q.status === "PASS" ? "ok" : q.status === "FAIL" ? "bad" : ""}">QA ${q.status}</span>
          ${ap ? `<span class="pill ${ap.approved ? "ok" : "bad"}">${ap.approved ? "Aprobado por ti" : "Rechazado"} · ${new Date(ap.at * 1000).toLocaleString()}</span>` : `<span class="pill">Pendiente de tu aprobación</span>`}</div>
        <div class="kv">${q.checks.map((c) => `<span class="k">${c.status === "PASS" ? "✅" : c.status === "FAIL" ? "⛔" : "⚠️"} ${esc(c.check)}</span><span>${esc(c.detail)}</span>`).join("")}</div>
        ${fid && fid.issues ? `<h2 style="margin-top:16px">Fidelidad: correcciones automáticas</h2><div class="log" style="height:auto;max-height:220px">${esc(fid.scenes.filter((x) => x.issues.length).map((x) => x.id + ": " + x.issues.join("; ")).join("\n"))}</div>` : ""}
        <div class="actions"><button class="btn pri" id="approve">✔ Aprobar el video</button><button class="btn red" id="reject">✕ Rechazar</button></div>
        <p class="hint">Viral Studio nunca publica nada: aprobar solo marca el proyecto como terminado (estado DONE).</p>`;
      const act = async (ok) => { try { S.proj = Object.assign(S.proj, await api(`projects/${p.id}/approve`, { method: "POST", body: { approved: ok } })); toast(ok ? "Aprobado" : "Rechazado"); renderProject(); } catch (e) { toast(e.message, true); } };
      $("#approve") && ($("#approve").onclick = () => act(true));
      $("#reject") && ($("#reject").onclick = () => act(false));
    } else if (tab === "log") {
      el.innerHTML = `<div class="log" id="logBox">${esc(((p.live || {}).log || []).join("\n")) || "Sin actividad todavía."}</div>`;
      const lb = $("#logBox"); lb.scrollTop = lb.scrollHeight;
    } else if (tab === "yt") {
      const b = p.bible || {}, yt = b.youtube || {};
      el.innerHTML = p.youtube_txt ? `<div class="log" style="height:420px">${esc(p.youtube_txt)}</div>` :
        `<div class="kv"><span class="k">Título</span><span>${esc(yt.title || b.title || "—")}</span><span class="k">Descripción</span><span>${esc(yt.description || "—")}</span><span class="k">Etiquetas</span><span>${esc((yt.tags || []).join(", ") || "—")}</span><span class="k">Miniatura</span><span>${esc(b.thumbnail_text || "—")}</span></div>`;
    } else if (tab === "files") {
      const u = p.urls || {};
      el.innerHTML = `<div class="kv">
        <span class="k">Video</span><span>${u.video ? `<a href="${u.video}" download>MP4 máxima calidad</a>` : "—"}${u.video_light ? ` · <a href="${u.video_light}" download>MP4 para redes</a>` : ""}</span>
        <span class="k">Subtítulos</span><span>${u.srt ? `<a href="${u.srt}" download>SRT</a>` : "—"}</span>
        <span class="k">Miniatura</span><span>${u.thumb ? `<a href="${u.thumb}" target="_blank"><img src="${u.thumb}" style="max-width:220px;border-radius:8px"></a>` : "—"}</span>
        <span class="k">YouTube</span><span>${u.meta ? `<a href="${u.meta}" download>youtube.txt</a>` : "—"}</span>
        <span class="k">Proyecto HyperFrames</span><span><a href="api/projects/${p.id}/download">ZIP editable</a></span>
        <span class="k">Carpeta</span><span class="tag">${esc((p.outputs || {}).hf || "—")}</span></div>`;
    } else if (tab === "cfg") {
      const P = S.opt.presets, st = p.settings;
      el.innerHTML = `
        <label class="f">Estilo visual</label><select id="c_style">${Object.entries(P.styles).map(([k, v]) => `<option value="${k}" ${st.style === k ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select>
        <label class="f">Subtítulos</label><select id="c_captions">${Object.entries(P.captions).map(([k, v]) => `<option value="${k}" ${st.captions === k ? "selected" : ""}>${esc(v.name)}</option>`).join("")}<option value="none">Sin subtítulos</option></select>
        <label class="f">Narrador</label><select id="c_voice">${Object.entries(P.voices).map(([k, v]) => `<option value="${k}" ${st.voice === k ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select>
        <label class="f">Motor de voz</label><select id="c_tts_engine"><option value="qwen3" ${st.tts_engine !== "kokoro" ? "selected" : ""}>Qwen3-TTS</option><option value="kokoro" ${st.tts_engine === "kokoro" ? "selected" : ""}>Kokoro</option></select>
        <label class="f">Ritmo</label><select id="c_pace">${["rapido", "normal", "lento"].map((k) => `<option ${st.pace === k ? "selected" : ""}>${k}</option>`).join("")}</select>
        <label class="f">Volumen de música</label><input type="range" id="c_music_volume" min="0" max="0.5" step="0.01" value="${st.music_volume || S.opt.settings.music_volume}">
        <label class="f">Estilo musical</label><input class="inp" id="c_music_prompt" value="${esc(st.music_prompt || "")}">
        <div class="actions"><button class="btn pri" id="c_save">Guardar cambios</button></div>
        <p class="hint">Cambiar estilo/subtítulos solo requiere re-renderizar; cambiar la voz vuelve a narrar.</p>`;
      $("#c_save").onclick = async () => {
        const body = {};
        ["style", "captions", "voice", "tts_engine", "pace", "music_volume", "music_prompt"].forEach((k) => { const v = $("#c_" + k).value; if (String(v) !== String(st[k] || "")) body[k] = k === "music_volume" ? +v : v; });
        try { S.proj = Object.assign(S.proj, await api(`projects/${p.id}/settings`, { method: "POST", body })); toast("Guardado"); renderProject(); } catch (e) { toast(e.message, true); }
      };
    }
  }

  function renderBoard() {
    const p = S.proj, board = $("#board");
    if (!(p.scenes || []).length) return;
    const fm = S.opt.formats[p.settings.format] || S.opt.formats.vertical;
    const vert = fm.H > fm.W;
    const { data, scenes } = projectFilm(p, fm.W, fm.H);
    const O = S.opt;
    const sel = (name, list, val, labels) => `<select data-f="${name}">${list.map((x) => `<option value="${x}" ${x === val ? "selected" : ""}>${labels ? labels[x] || x : x}</option>`).join("")}</select>`;
    board.innerHTML = scenes.map((s, i) => {
      const c0 = (s.chars || [])[0] || {};
      return `<div class="scene ${vert ? "v" : ""}" data-i="${i}">
        <div><canvas width="${vert ? 180 : 320}" height="${vert ? 320 : 180}" data-th="${i}"></canvas><div class="hint" style="text-align:center">${fmtT(s.start)} · ${s.dur.toFixed(1)}s</div></div>
        <div>
          <div class="meta"><span class="num">#${i + 1}</span>
            ${sel("shot", Object.keys(O.shots), s.shot)}
            ${sel("env", O.envs, (O.envs.includes(s.env) ? s.env : "void"))}
            ${sel("mood", [""].concat(O.moods), s.mood || "")}
            ${sel("trans", O.trans, s.trans || "cut")}
            ${c0.who || c0.action ? sel("action", O.actions, c0.action || "idle") : ""}
            ${s.audio ? `<span class="tag">🎙️ ${s.audio.dur.toFixed(1)}s</span>` : ""}
          </div>
          <textarea data-f="narration" placeholder="(sin narración)">${esc(s.narration || "")}</textarea>
          <div class="row" style="gap:6px;margin-top:6px">
            <input class="inp" data-f="label" placeholder="Texto en pantalla (label)" value="${esc(s.label || "")}" style="padding:7px 10px">
            ${sel("prop", [""].concat(O.props), s.prop || "")}
          </div>
          <div class="tools">
            <button class="btn sm" data-act="ai">✨ IA: mejorar</button>
            <button class="btn sm" data-act="up">↑</button><button class="btn sm" data-act="down">↓</button>
            <button class="btn sm" data-act="add">＋ escena</button><button class="btn sm red" data-act="del">✕</button>
          </div>
        </div></div>`;
    }).join("");
    // miniaturas perezosas
    const io = new IntersectionObserver((ents) => ents.forEach((en) => {
      if (!en.isIntersecting) return;
      const cv = en.target, i = +cv.dataset.th, s = scenes[i];
      io.unobserve(cv);
      const d = filmData(cv.width, cv.height, p.settings.style, p.settings.style_overrides, (p.bible || {}).cast, [Object.assign({}, s, { start: 0 })]);
      stillOf(cv, d, Math.min(s.dur * 0.6, 1.6));
    }), { rootMargin: "200px" });
    $$("[data-th]").forEach((cv) => io.observe(cv));
    $$(".scene").forEach((el) => {
      const i = +el.dataset.i;
      el.querySelector("canvas").onclick = () => { S.player && S.player.seek(scenes[i].start + 0.05); $$(".scene").forEach((x) => x.classList.toggle("cur", x === el)); };
      $$("[data-f]", el).forEach((inp) => (inp.onchange = async () => {
        const f = inp.dataset.f;
        const body = {};
        if (f === "action") { const ch = JSON.parse(JSON.stringify(p.scenes[i].chars || [{}])); ch[0] = Object.assign(ch[0] || {}, { action: inp.value }); body.chars = ch; }
        else body[f] = inp.value;
        try { p.scenes[i] = await api(`projects/${p.id}/scenes/${i}`, { method: "PATCH", body }); toast("Escena actualizada"); renderBoard(); if (!S.player) renderTab("video"); } catch (e) { toast(e.message, true); }
      }));
      $$("[data-act]", el).forEach((b) => (b.onclick = async () => {
        const a = b.dataset.act;
        try {
          if (a === "ai") {
            const ins = prompt("¿Qué cambio quieres? (ej.: más dramática, añade un dato, cambia a primer plano)", "hazla más impactante");
            if (!ins) return;
            b.disabled = true; b.textContent = "✨ pensando…";
            p.scenes[i] = await api(`projects/${p.id}/scenes/${i}/rewrite`, { method: "POST", body: { instruction: ins } });
          } else if (a === "del") { if (!confirm("¿Eliminar esta escena?")) return; Object.assign(p, await api(`projects/${p.id}/scenes/${i}`, { method: "DELETE" })); }
          else if (a === "add") Object.assign(p, await api(`projects/${p.id}/scenes`, { method: "POST", body: { index: i + 1 } }));
          else if (a === "up" || a === "down") Object.assign(p, await api(`projects/${p.id}/scenes/${i}/move`, { method: "POST", body: { to: a === "up" ? i - 1 : i + 1 } }));
          renderBoard();
        } catch (e) { toast(e.message, true); b.disabled = false; }
      }));
    });
  }

  async function run(stages) {
    const p = S.proj;
    try { await api(`projects/${p.id}/run`, { method: "POST", body: { stages } }); S.forceLive = false; toast("En marcha: " + stages.map((s) => STAGE_NAMES[s]).join(" → ")); await refresh(true); } catch (e) { toast(e.message, true); }
  }

  function startPolling(id) {
    clearInterval(S.poll);
    S.poll = setInterval(async () => {
      if (!location.hash.startsWith("#/p/" + id)) return clearInterval(S.poll);
      try {
        const r = await api(`projects/${id}/status`);
        const live = r.live || {};
        const doneN = (live.done || []).length;
        const p = S.proj;
        const finished = p.live && p.live.running && !live.running;
        p.live = live;
        if (doneN !== S.lastDone || finished) { S.lastDone = doneN; return refresh(true); }
        const bar = $(".prog > i");
        if (bar) bar.style.width = Math.round((live.progress || 0) * 100) + "%";
        if ($("#pmsg")) $("#pmsg").textContent = live.message || "";
        $$(".stg").forEach((el, k) => el.classList.toggle("run", !!live.running && Object.keys(STAGE_NAMES)[k] === live.stage));
        const lb = $("#logBox");
        if (lb) { lb.textContent = (live.log || []).join("\n"); lb.scrollTop = lb.scrollHeight; }
        if (live.stage === "error" && !S.errShown) { S.errShown = true; toast("Error: " + live.message, true); }
      } catch (e) { /* reintento en el siguiente tic */ }
    }, 1500);
  }
  async function refresh(full) {
    const p = await api("projects/" + S.proj.id);
    S.proj = p;
    S.errShown = false;
    if (full) renderProject();
  }

  /* ------------------------------------------------------------ vista: Proyectos */
  async function viewProjects() {
    const list = await api("projects");
    $("#app").innerHTML = `<h1>Proyectos</h1><p class="sub">Tus videos, en orden del más reciente.</p>
      ${list.length ? `<div class="plist">${list.map((p) => `<div class="pc" data-id="${p.id}">
        <div class="th" style="${p.thumb ? `background-image:url('files/${p.id}/out/miniatura.jpg')` : ""}">${p.thumb ? "" : "🎬"}</div>
        <div class="in"><b>${esc(p.title || "Sin título")}</b><div class="row tight" style="gap:6px"><span class="pill">${p.input_mode === "audio" ? "🎧 audio" : p.input_mode === "script" ? "📝 guion" : "🧠 tema"}</span><span class="pill">${p.format === "horizontal" ? "16:9" : p.format === "cuadrado" ? "1:1" : "9:16"}</span><span class="pill">${p.input_mode === "audio" ? (+p.duration || 0).toFixed(1) + " s" : fmtDur(+p.duration)}</span>
        <span class="pill ${p.status && p.status.stage === "listo" ? "ok" : p.status && p.status.stage === "error" ? "bad" : ""}">${esc((p.status && p.status.stage) || "nuevo")}</span></div>
        <div class="row tight" style="margin-top:8px"><button class="btn sm red" data-del="${p.id}">Eliminar</button></div></div></div>`).join("")}</div>` : `<div class="empty">Todavía no hay proyectos. <a href="#/crear">Crea el primero</a>.</div>`}`;
    $$(".pc").forEach((el) => (el.onclick = (e) => { if (e.target.dataset.del) return; location.hash = "#/p/" + el.dataset.id; }));
    $$("[data-del]").forEach((b) => (b.onclick = async () => { if (confirm("¿Eliminar el proyecto y sus archivos?")) { await api("projects/" + b.dataset.del, { method: "DELETE" }); viewProjects(); } }));
  }

  /* ------------------------------------------------------------ vista: Ajustes */
  function viewSettings() {
    const s = S.opt.settings, m = S.opt.models;
    const llms = Array.from(new Set([s.llm_model, s.llm_fallback].concat(m.llm.available || [])));
    $("#app").innerHTML = `<h1>Ajustes</h1><p class="sub">Modelos abiertos y opciones de render. Todo se guarda en settings.json.</p>
    <div class="grid cols"><div class="card"><div class="kv">
      <span class="k">Guionista (LLM)</span><select id="s_llm_model">${llms.map((x) => `<option ${x === s.llm_model ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>
      <span class="k">Creatividad</span><input type="range" id="s_llm_temperature" min="0.3" max="1.3" step="0.05" value="${s.llm_temperature}">
      <span class="k">Pensar antes (más lento)</span><label class="toggle"><input type="checkbox" id="s_llm_thinking" ${s.llm_thinking ? "checked" : ""}><i></i></label>
      <span class="k">Motor de voz</span><select id="s_tts_engine"><option value="qwen3" ${s.tts_engine === "qwen3" ? "selected" : ""}>Qwen3-TTS 1.7B</option><option value="kokoro" ${s.tts_engine === "kokoro" ? "selected" : ""}>Kokoro 82M</option></select>
      <span class="k">Whisper (sincronía)</span><select id="s_whisper_model">${["large-v3-turbo", "large-v3", "medium", "small"].map((x) => `<option ${x === s.whisper_model ? "selected" : ""}>${x}</option>`).join("")}</select>
      <span class="k">Volumen música</span><input type="range" id="s_music_volume" min="0" max="0.5" step="0.01" value="${s.music_volume}">
      <span class="k">Volumen efectos</span><input type="range" id="s_sfx_volume" min="0" max="1" step="0.05" value="${s.sfx_volume}">
      <span class="k">Calidad de render</span><select id="s_render_quality">${["draft", "standard", "high"].map((x) => `<option ${x === s.render_quality ? "selected" : ""}>${x}</option>`).join("")}</select>
      <span class="k">Workers de render</span><input class="inp" id="s_render_workers" value="${esc(s.render_workers)}">
      <span class="k">FPS</span><select id="s_fps">${[24, 30, 60].map((x) => `<option ${+x === +s.fps ? "selected" : ""}>${x}</option>`).join("")}</select>
      <span class="k">Segundos por capítulo</span><input class="inp" id="s_chapter_seconds" type="number" value="${s.chapter_seconds}">
    </div><div class="actions"><button class="btn pri" id="saveS">Guardar</button></div></div>
    <div class="card"><h2>Estado</h2><div class="kv">
      <span class="k">LLM</span><span class="pill ${m.llm.ok ? "ok" : "bad"}">${m.llm.ok ? "instalado" : "falta el modelo"} · ${esc(m.llm.selected)}</span>
      <span class="k">Música</span><span class="pill ${m.music.ok ? "ok" : "bad"}">${m.music.ok ? "ACE-Step listo" : "sin modelo (videos sin música)"}</span>
      <span class="k">Voz</span><span class="pill ok">${esc(m.tts.engine)}${m.tts.kokoro ? " · Kokoro disponible" : ""}</span>
      <span class="k">HyperFrames</span><span class="tag">${esc(m.hyperframes)}</span></div>
      <p class="hint">Para añadir estilos, voces o tipos de video crea archivos <b>presets/styles.mio.json</b>, <b>voices.mio.json</b>… con el mismo formato: se cargan solos.</p></div></div>`;
    $("#saveS").onclick = async () => {
      const body = {};
      ["llm_model", "llm_temperature", "tts_engine", "whisper_model", "music_volume", "sfx_volume", "render_quality", "render_workers", "fps", "chapter_seconds"].forEach((k) => {
        const v = $("#s_" + k).value;
        body[k] = ["llm_temperature", "music_volume", "sfx_volume", "fps", "chapter_seconds"].includes(k) ? +v : v;
      });
      body.llm_thinking = $("#s_llm_thinking").checked;
      try { S.opt.settings = await api("settings", { method: "POST", body }); toast("Ajustes guardados"); } catch (e) { toast(e.message, true); }
    };
  }

  /* ------------------------------------------------------------ router */
  async function route() {
    if (S.player) { S.player.stop(); S.player = null; }
    clearInterval(S.poll);
    if (window.VSAudio) window.VSAudio.stop();
    const h = location.hash || "#/crear";
    const v = h.startsWith("#/p/") ? "proyectos" : h.slice(2);
    $$(".nav a[data-v]").forEach((a) => a.classList.toggle("on", a.dataset.v === v));
    window.scrollTo(0, 0);
    if (h.startsWith("#/p/")) return viewProject(h.slice(4));
    if (h === "#/proyectos") return viewProjects();
    if (h === "#/ajustes") return viewSettings();
    return viewCreate();
  }

  async function boot() {
    try {
      S.opt = await api("options");
    } catch (e) {
      $("#app").innerHTML = `<div class="empty">No se pudo conectar con ComfyUI: ${esc(e.message)}</div>`;
      return;
    }
    if (document.fonts) {
      try { await Promise.all(['900 40px "Archivo Black"', '400 40px "League Gothic"', '900 40px Montserrat', '700 40px "EB Garamond"'].map((f) => document.fonts.load(f))); } catch (e) { /* sin fuentes */ }
    }
    window.addEventListener("hashchange", route);
    route();
    pollSystem();
    setInterval(pollSystem, 4000);
  }
  boot();
})();
