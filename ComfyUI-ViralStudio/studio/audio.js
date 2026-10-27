/* Viral Studio Pro — modo «Mi audio → video» (interfaz).
   Crear: carga de la narración (vista previa local + forma de onda) y opciones.
   Proyecto: reproductor + forma de onda con escenas (cortes arrastrables),
   transcripción editable (palabras dudosas marcadas), storyboard por escena
   (plantilla, escenario, acciones, cámara, re-render de UNA escena) y vista
   previa en vivo con el mismo motor vectorial que el render final.
   Se registra como window.VSAudio y lo usa studio/app.js. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (t) => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, "0")}`; };
  const COLORS = ["#f0b648", "#6fa8ff", "#5fd08a", "#e3743e", "#b98cff", "#4fd1c5", "#ff7aa8", "#c7d36b"];
  const STAGES = { transcribe: "🎧 Transcribir", plan: "🧭 Storyboard", music: "🎵 Música", build: "🧩 Montaje", render: "🎞️ Render", qa: "🔎 QA" };
  // tema/guion con el motor ilustrado: la narración es la voz del guion
  const VSTAGES = { story: "✍️ Guion", voice: "🗣️ Voz", narration: "🎙️ Narración", plan: "🧭 Storyboard", music: "🎵 Música", build: "🧩 Montaje", render: "🎞️ Render", qa: "🔎 QA" };
  const isScript = (p) => p && p.input_mode !== "audio";
  const A = { ctx: null, p: null, v: null, poll: null, raf: 0, audio: null, film: null, lastDone: -1, file: null, objUrl: null };

  async function api(path, opts) { return A.ctx.api(path, opts); }
  const toast = (m, e) => A.ctx.toast(m, e);

  /* ------------------------------------------------------------------ forma de onda */
  function drawWave(cv, peaks, dur, scenes, words, t, sel) {
    const c = cv.getContext("2d"), W = cv.width, H = cv.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = "#0b0c10";
    c.fillRect(0, 0, W, H);
    const top = 18, wh = H - top - 22;
    (scenes || []).forEach((s, i) => {
      const x0 = (s.start_s / dur) * W, x1 = (s.end_s / dur) * W;
      c.fillStyle = COLORS[i % COLORS.length] + (sel === s.id ? "55" : "26");
      c.fillRect(x0, 0, x1 - x0, H);
      c.fillStyle = COLORS[i % COLORS.length];
      c.fillRect(x0, 0, 2, H);
      c.font = "600 11px Inter";
      c.fillText(`#${i + 1}`, x0 + 5, 12);
    });
    if (peaks && peaks.length) {
      const mid = top + wh / 2;
      c.fillStyle = "#cfd6e6";
      for (let x = 0; x < W; x++) {
        const p = peaks[Math.floor((x / W) * peaks.length)] || [0, 0];
        c.fillRect(x, mid + p[0] * wh * 0.5, 1, Math.max(1, (p[1] - p[0]) * wh * 0.5));
      }
    }
    c.fillStyle = "#8f96a6";
    (words || []).forEach((w) => {
      const x = (w.start_s / dur) * W;
      c.fillStyle = w.needs_review ? "#f0b648" : "#596074";
      c.fillRect(x, H - 16, Math.max(1, ((w.end_s - w.start_s) / dur) * W - 1), 8);
    });
    if (t != null) { c.fillStyle = "#ff6a5a"; c.fillRect((t / dur) * W, 0, 2, H); }
  }

  function localWave(file, cv) {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    file.arrayBuffer().then((b) => ac.decodeAudioData(b)).then((buf) => {
      const x = buf.getChannelData(0), n = 1200, peaks = [];
      for (let i = 0; i < n; i++) {
        let lo = 1, hi = -1;
        const a = Math.floor((i / n) * x.length), b2 = Math.floor(((i + 1) / n) * x.length);
        for (let j = a; j < b2; j += 16) { if (x[j] < lo) lo = x[j]; if (x[j] > hi) hi = x[j]; }
        peaks.push([lo, hi]);
      }
      drawWave(cv, peaks, buf.duration, [], [], null);
      $("#aInfo").innerHTML += ` · <b>${fmt(buf.duration)}</b> · ${buf.numberOfChannels} canal(es) · ${buf.sampleRate} Hz (vista previa local; el servidor verifica con ffprobe)`;
    }).catch(() => { $("#aInfo").innerHTML += " · (el navegador no puede previsualizarlo; el servidor lo verificará)"; });
  }

  /* ------------------------------------------------------------------ CREAR */
  function createView(app, ctx) {
    A.ctx = ctx;
    const O = ctx.opt.audio_mode || { defaults: {}, enums: {}, styles: {}, limits: {}, accept: "audio/*" };
    const f = ctx.form;
    const d = Object.assign({}, O.defaults, f.audio || {});
    f.audio = d;
    const sel = (id, opts, val) => `<select id="${id}">${opts.map(([k, v]) => `<option value="${esc(k)}" ${String(val) === String(k) ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>`;
    app.innerHTML = `${ctx.modeTabs("audio")}
    <div class="grid cols">
      <div>
        <div class="card">
          <h2><span class="n">1</span>Tu narración</h2>
          <label class="drop" id="drop"><input type="file" id="aFile" accept="${esc(O.accept)}" hidden>
            <b>Arrastra aquí tu audio</b> o haz clic para elegirlo<br><small>MP3 · WAV · M4A · FLAC · OGG · AAC · o un MP4/MOV (se extrae su audio). Límite ${O.limits.max_mb || 500} MB / ${Math.round((O.limits.max_seconds || 1800) / 60)} min.</small></label>
          <div class="hint" id="aInfo">${A.file ? esc(A.file.name) : "Aún no has elegido archivo."}</div>
          <canvas id="aWave" width="1200" height="110" class="wave"></canvas>
          <audio id="aPrev" controls style="width:100%;margin-top:8px;display:${A.objUrl ? "block" : "none"}" ${A.objUrl ? `src="${A.objUrl}"` : ""}></audio>
          <p class="hint">Tu audio manda: <b>no se reescribe, recorta, acelera ni vuelve a sintetizar</b>. Su duración fija la del video y se conserva el original descargable.</p>
        </div>
        <div class="card">
          <h2><span class="n">2</span>Formato e idioma</h2>
          <div class="fmt">${Object.entries(ctx.opt.formats).map(([k, v]) => {
            const w = v.W > v.H ? 46 : v.W === v.H ? 30 : 22, hh = v.W > v.H ? 26 : v.W === v.H ? 30 : 38;
            return `<div class="opt ${d.format === k ? "on" : ""}" data-afmt="${k}"><div class="shape" style="width:${w}px;height:${hh}px"></div><b>${esc(v.name)}</b><small>${v.W}×${v.H}</small></div>`;
          }).join("")}</div>
          <div class="row" style="margin-top:6px">
            <div><label class="f">Idioma de la narración</label>${sel("a_language", [["auto", "Detectar automáticamente"]].concat(Object.entries(ctx.opt.languages).map(([k, v]) => [k, v.name])), d.language)}</div>
            <div><label class="f">FPS</label>${sel("a_fps", [[30, "30"], [24, "24"], [25, "25"], [60, "60"]], d.fps)}</div>
            <div><label class="f">Ritmo visual</label>${sel("a_pace_visual", [["calmo", "Calmo (planos largos)"], ["normal", "Normal (2–6 s)"], ["rapido", "Rápido (shorts)"]], d.pace_visual)}</div>
          </div>
        </div>
        <div class="card">
          <h2><span class="n">3</span>Estilo y acabado</h2>
          <label class="f">Estilo visual</label>${sel("a_visual_style", Object.entries(O.styles), d.visual_style)}
          <div class="row">
            <div><label class="f">Subtítulos</label>${sel("a_captions", [["explainer", "Explicativo (palabra a palabra + recuadro)"], ["none", "Sin subtítulos"]], d.captions)}</div>
            <div><label class="f">Storyboard</label>${sel("a_storyboard_mode", [["auto", "Automático (IA si está disponible)"], ["manual", "Manual: reglas, lo reviso yo"]], d.storyboard_mode)}</div>
          </div>
          <div class="row" style="margin-top:12px">
            <label class="toggle"><input type="checkbox" id="a_preserve_original_audio" checked disabled><i></i>Conservar audio original</label>
            <label class="toggle"><input type="checkbox" id="a_music" ${d.music ? "checked" : ""}><i></i>Música de fondo (opcional)</label>
            <label class="toggle"><input type="checkbox" id="a_sfx" ${d.sfx ? "checked" : ""}><i></i>Efectos de sonido</label>
            <label class="toggle"><input type="checkbox" id="a_diarize" ${d.diarize ? "checked" : ""}><i></i>Varios hablantes (pyannote)</label>
            <label class="toggle"><input type="checkbox" id="a_professional_gate" ${d.professional_gate !== false ? "checked" : ""}><i></i>Impedir escenas congeladas / acciones imposibles</label>
          </div>
          <p class="hint">Música y efectos van por debajo de la voz (la música baja sola cuando hablas). Varios hablantes requiere HF_TOKEN y aceptar las condiciones de pyannote; si no, se usa narrador único.</p>
        </div>
        <div class="actions"><button class="btn pri big" id="aGo">🎧 Subir y analizar</button></div>
        <div class="prog" id="upProg" style="display:none"><i></i></div><div class="msg" id="upMsg" role="status" aria-live="polite"></div>
      </div>
      <div><div class="card sticky"><h2>Cómo funciona</h2>
        <ol class="steps"><li><b>Escucha</b>: faster-whisper transcribe con tiempos por palabra (local, sin enviar tu audio a nadie).</li>
        <li><b>Entiende</b>: detecta personajes, lugares, cifras y acciones de lo que dices.</li>
        <li><b>Planifica</b>: escenas contiguas de 0 a fin del audio, sin huecos ni pausas añadidas.</li>
        <li><b>Anima</b>: marionetas SVG articuladas, fondos por capas 2.5D, cámara e infografías.</li>
        <li><b>Revisas</b>: corriges palabras, cambias planos o acciones y re-renderizas solo esa escena.</li>
        <li><b>Exporta</b>: MP4 + SRT + transcripción + storyboard + audio original.</li></ol></div></div>
    </div>`;
    const fileIn = $("#aFile"), drop = $("#drop");
    const take = (file) => {
      if (!file) return;
      A.file = file;
      if (A.objUrl) URL.revokeObjectURL(A.objUrl);
      A.objUrl = URL.createObjectURL(file);
      $("#aPrev").src = A.objUrl;
      $("#aPrev").style.display = "block";
      $("#aInfo").innerHTML = `<b>${esc(file.name)}</b> · ${(file.size / 1048576).toFixed(1)} MB`;
      localWave(file, $("#aWave"));
    };
    fileIn.onchange = (e) => take(e.target.files[0]);
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("on"); };
    drop.ondragleave = () => drop.classList.remove("on");
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("on"); take(e.dataTransfer.files[0]); };
    $$("[data-afmt]").forEach((el) => (el.onclick = () => { read(); d.format = el.dataset.afmt; createView(app, ctx); }));
    function read() {
      ["language", "fps", "pace_visual", "visual_style", "captions", "storyboard_mode"].forEach((k) => { const el = $("#a_" + k); if (el) d[k] = k === "fps" ? +el.value : el.value; });
      ["music", "sfx", "diarize", "professional_gate"].forEach((k) => (d[k] = $("#a_" + k).checked));
      d.auto_storyboard = d.storyboard_mode !== "manual";
    }
    $("#aGo").onclick = async () => {
      if (A.submitting) return;
      const button = $("#aGo"), message = $("#upMsg");
      const report = (text) => { message.textContent = text; message.style.color = ""; };
      button.disabled = true;
      button.textContent = "Preparando envío…";
      try {
        read();
        const settings = Object.assign({}, d, { input_mode: "audio", topic: "" });
        const result = await submitAudio(A.file, settings, { report });
        if (!result.queued) location.hash = "#/p/" + result.id;
      } catch (e) {
        message.textContent = e.message; message.style.color = "#ff8c8c";
        toast(e.message, true);
      } finally {
        button.disabled = false; button.textContent = "🎧 Subir y analizar";
      }
    };
    if (A.file && A.objUrl) localWave(A.file, $("#aWave"));
  }

  async function submitAudio(file, settings, { request = api, send = upload, report = () => {}, timeoutMs = 120000 } = {}) {
    if (!file) throw new Error("Elige primero tu archivo de audio.");
    if (A.submitting) throw new Error("El audio ya se está enviando. Espera a que termine este intento.");
    A.submitting = true;
    try {
      const identity = JSON.stringify({ settings, guide: window.VSActiveGuide ? window.VSActiveGuide() : null });
      if (!A.submitAttempt || A.submitAttempt.file !== file || A.submitAttempt.identity !== identity) {
        A.submitAttempt = { file, identity, key: crypto.randomUUID(), id: null, uploaded: false };
      }
      const attempt = A.submitAttempt;
      async function call(path, options = {}) {
        const controller = new AbortController();
        let timer;
        try {
          return await Promise.race([
            request(path, { ...options, signal: controller.signal }),
            new Promise((_, reject) => { timer = setTimeout(() => {
              controller.abort();
              reject(new Error("Colab no respondió a tiempo. Comprueba la conexión y vuelve a pulsar: se reutilizará este proyecto."));
            }, timeoutMs); }),
          ]);
        } finally { clearTimeout(timer); }
      }
      if (attempt.id) {
        report("Comprobando el proyecto del intento anterior…");
        const existing = await call(`projects/${attempt.id}`);
        if ((existing.live || {}).running || (existing.urls || {}).video) return { id: attempt.id };
        const status = existing.status || {};
        if (status.stage !== "error" && ((existing.live || {}).done || status.done || []).includes("plan")) return { id: attempt.id };
        // Si se perdió la respuesta de la subida, el servidor puede haber recibido el archivo.
        if (existing.audio) attempt.uploaded = true;
      } else {
        report("Creando el proyecto y comprobando el motor de Colab…");
        const project = await call("projects", { method: "POST", headers: { "Idempotency-Key": attempt.key }, body: { settings } });
        if (!project || !project.id) throw new Error("El servidor no confirmó el proyecto. Revisa la conexión.");
        attempt.id = project.id;
      }
      if (!attempt.uploaded) {
        report("Enviando el audio a Colab…");
        const uploaded = await send(attempt.id, file);
        if (uploaded && uploaded.queued) {
          report("Audio guardado en la PC y pendiente de conexión. Consulta la cola; no necesitas crear otro proyecto.");
          return { id: attempt.id, queued: true };
        }
        attempt.uploaded = true;
      }
      report("Audio recibido. Iniciando transcripción y storyboard…");
      const result = await call(`projects/${attempt.id}/audio/analyze`, { method: "POST", body: {} });
      if (result && result.queued) {
        report("La PC tiene pendiente iniciar el procesamiento. Consulta el estado en la cola.");
        return { id: attempt.id, queued: true };
      }
      report("Procesamiento iniciado. Abriendo el proyecto…");
      return { id: attempt.id };
    } finally { A.submitting = false; }
  }

  function upload(pid, file) {
    return new Promise((res, rej) => {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const x = new XMLHttpRequest();
      x.open("POST", `api/projects/${pid}/audio`);
      x.timeout = 15 * 60 * 1000;
      const bar = $("#upProg"), msg = $("#upMsg");
      if (bar) bar.style.display = "block";
      x.upload.onprogress = (e) => { if (e.lengthComputable && bar) { bar.firstChild.style.width = Math.round((e.loaded / e.total) * 100) + "%"; msg.textContent = `Subiendo… ${Math.round((e.loaded / e.total) * 100)}%`; } };
      x.onload = () => {
        let j = {};
        try { j = JSON.parse(x.responseText); } catch (e) {
          if (x.status >= 200 && x.status < 300) { rej(new Error("La subida recibió una respuesta inválida. Comprueba la URL de Colab y reintenta en este proyecto.")); return; }
        }
        if (x.status >= 200 && x.status < 300) {
          if (msg) msg.textContent = j.queued ? "Audio guardado en la PC; pendiente de enviar a Colab." : "Audio recibido ✓";
          res(j);
        } else rej(new Error(j.error || (x.status === 530 ? "Cloudflare HTTP 530: rehace el túnel en Colab y guarda la nueva URL y llave en la PC." : `Error HTTP ${x.status} al subir el audio.`)));
      };
      x.onerror = () => rej(new Error("Error de red al subir"));
      x.ontimeout = () => rej(new Error("La subida tardó demasiado. Comprueba la conexión y reintenta; se conservará el proyecto."));
      x.onabort = () => rej(new Error("Se interrumpió la subida del audio. Puedes reintentar en el mismo proyecto."));
      x.send(fd);
    });
  }

  /* ------------------------------------------------------------------ PROYECTO */
  async function projectView(p, ctx) {
    A.ctx = ctx;
    A.p = p;
    try { A.v = await api(`projects/${p.id}/audio`); } catch (e) { A.v = { audio: null }; }
    A.lastDone = ((p.live || {}).done || []).length;
    render();
    startPoll();
  }

  function render() {
    const p = A.p, v = A.v || {}, a = v.audio, live = p.live || {};
    const running = !!live.running;
    const scr = isScript(p), ST = scr ? VSTAGES : STAGES;
    const done = new Set(live.done || (p.status || {}).done || []);
    const plan = v.plan, tr = v.transcript;
    const fm = A.ctx.opt.formats[p.settings.format] || A.ctx.opt.formats.vertical;
    stop();
    $("#app").innerHTML = `
    <div class="phead"><div style="flex:1;min-width:280px">
      <h1>${esc((p.bible || {}).title || (scr ? p.settings.topic : a && a.original_name) || "Mi audio")}</h1>
      <div class="row tight" style="gap:6px"><span class="pill">${scr ? (p.input_mode === "script" ? "📝 Mi guion → video" : "🧠 Tema → video") + " · 🎨 ilustrado" : "🎧 Mi audio → video"}</span><span class="pill">${esc(fm.name)}</span>
        ${a ? `<span class="pill ok">${fmt(a.duration_s)} de narración</span><span class="pill" title="sha256">${a.sha256.slice(0, 10)}…</span>` : `<span class="pill ${scr ? "" : "bad"}">${scr ? "voz pendiente" : "sin audio"}</span>`}
        ${plan ? `<span class="pill">${plan.scenes.length} escenas · plan v${plan.plan_version} (${esc(plan.planner)})</span>` : ""}
        <span class="pill ${p.state === "DONE" ? "ok" : /FAIL|CANCEL|INTERRUPT/.test(p.state || "") ? "bad" : ""}">${esc(p.state || "")}</span></div>
      <div class="stages">${Object.entries(ST).map(([k, n]) => `<span class="stg ${done.has(k) ? "done" : ""} ${running && live.stage === k ? "run" : ""}">${n}</span>`).join("")}</div>
      <div class="prog"><i style="width:${Math.round((live.progress || 0) * 100)}%"></i></div>
      <div class="msg" id="pmsg">${esc(live.message || (p.status || {}).message || "")}</div>
      ${p.quality_gate ? `<div class="hint" style="padding:10px;margin:8px 0;border:1px solid ${p.quality_gate.status === "FAIL" ? "#cc5e5e" : "#74818d"};border-radius:6px">
        <b>Control narrativo: ${esc(p.quality_gate.status)}</b> · ${p.quality_gate.fail_count} fallos, ${p.quality_gate.review_count} advertencias. El motor actual es SVG 2D/2.5D, no animación 3D.
        ${(p.quality_gate.examples || []).map(e => `<div style="margin-top:5px">• ${esc(e)}</div>`).join("")}
        ${p.quality_gate.status === "FAIL" ? `<p>Para una exportación real hay que incorporar las acciones/escenarios faltantes. El render profesional se bloquea para no entregar tomas congeladas.</p>` : ""}
      </div>` : ""}</div>
      <div class="actions" style="margin-top:0">
        <button class="btn pri" id="aRender" ${running || (!plan && !scr) || (p.quality_gate && p.quality_gate.status === "FAIL" && p.settings.professional_gate !== false) ? "disabled" : ""}>🎞️ Renderizar video</button>
        <button class="btn" id="aAnalyze" ${running || (!a && !scr) ? "disabled" : ""}>${scr ? (plan ? "🧭 Rehacer storyboard" : "▶️ Preparar voz y storyboard") : "🔎 " + (tr ? "Re-analizar" : "Analizar audio")}</button>
        ${running ? `<button class="btn red" id="aCancel">⛔ Cancelar</button>` : ""}
        ${!running && p.job && (p.job.remaining || []).length ? `<button class="btn pri" id="aResume">↻ Reanudar (${p.job.remaining.map((s) => ST[s] || s).join(" → ")})</button>` : ""}
      </div></div>
    <div class="grid cols">
      <div>
        <div class="card"><div class="bhead"><h2>Audio y línea de tiempo</h2><span class="hint">Arrastra el borde de una escena para mover el corte (la voz no se toca)</span></div>
          ${a ? `<audio id="aMaster" controls preload="auto" src="${esc(v.urls.master)}" style="width:100%"></audio>
          <canvas id="tl" width="1400" height="130" class="wave" style="cursor:pointer"></canvas>
          <div class="row tight" style="gap:6px;margin-top:6px"><a class="btn sm" href="${esc(v.urls.original)}" download>⬇️ ${scr ? "Narración (voz del guion)" : "Audio original"}</a>
          <span class="hint">${scr ? `voz ${esc(a.tts_engine || "")} · texto exacto del guion` : `${a.probe.codec} · ${a.source_sample_rate} Hz · ${a.source_channels} canal(es) · ${(a.size_bytes / 1048576).toFixed(1)} MB${a.extracted_from_video ? " · extraído de video" : ""}`} · pico ${a.loudness.peak_db} dBFS</span></div>`
          : `<div class="empty">${scr ? "La narración aparece cuando se genera la voz del guion (▶️ Preparar voz y storyboard)." : "Sube tu narración para empezar."}</div>`}
        </div>
        <div class="card"><div class="bhead"><h2>${scr ? "Texto narrado (del guion)" : "Transcripción"}</h2><div class="btns">
          ${tr ? `<button class="btn sm" id="trFull">✏️ Editar texto</button>` : ""}${scr ? "" : `<button class="btn sm" id="trManual">📋 Pegar transcripción</button>`}
          ${tr && !scr ? `<button class="btn sm" id="trRedo" ${running ? "disabled" : ""}>↻ Volver a transcribir</button>` : ""}</div></div>
          <div id="trBox">${transcriptHtml(tr)}</div></div>
        <div class="card"><div class="bhead"><h2>Storyboard</h2><div class="btns">
          ${plan ? `<button class="btn sm" id="sbRegen" ${running ? "disabled" : ""}>🧭 Regenerar storyboard</button>` : ""}</div></div>
          <div id="sbBox">${plan ? "" : `<div class="empty">${running ? "Preparando…" : scr ? "El storyboard aparece cuando la voz del guion está lista: personajes y animales se detectan del texto." : "El storyboard aparece tras analizar el audio."}</div>`}</div></div>
      </div>
      <div><div class="card sticky">
        <div class="tabs"><a data-atab="video" class="on">Video</a><a data-atab="qa">QA${p.qa ? (p.qa.status === "PASS" ? " ✅" : p.qa.status === "FAIL" ? " ⛔" : " ⚠️") : ""}</a><a data-atab="log">Registro</a><a data-atab="files">Archivos</a><a data-atab="cfg">Ajustes</a><a data-atab="bible">Biblia</a></div>
        <div id="atab"></div></div></div>
    </div>`;
    bindHead();
    if (a) setupTimeline();
    if (plan) renderBoard();
    $$("[data-atab]").forEach((x) => (x.onclick = () => { $$("[data-atab]").forEach((y) => y.classList.toggle("on", y === x)); tab(x.dataset.atab); }));
    tab("video");
  }

  function transcriptHtml(tr) {
    if (!tr) return `<div class="empty">Aún no hay transcripción.</div>`;
    const info = `<div class="hint" style="margin-bottom:8px">${esc(tr.engine || "")} ${esc(tr.model || "")} · idioma <b>${esc(tr.language || "?")}</b>${tr.language_probability ? ` (${tr.language_probability})` : ""} · ${tr.words.length} palabras · <span style="color:var(--acc)">${tr.review_count} para revisar</span> · fuente <b>${esc(tr.source)}</b>${tr.alignment ? " · " + esc(tr.alignment.note || tr.alignment.method) : ""}${tr.diarization ? " · " + esc(tr.diarization.note) : ""}</div>`;
    if (tr.no_speech) return info + `<div class="empty">No se detectó habla. El video usará planos de ambientación. Si sí hay voz, prueba otro idioma o pega la transcripción.</div>`;
    return info + `<div class="words">${tr.words.map((w) => `<span class="wd ${w.needs_review ? "rev" : ""} ${w.edited ? "ed" : ""}" data-w="${w.id}" title="${w.start_s.toFixed(2)}–${w.end_s.toFixed(2)}s${w.confidence != null ? " · confianza " + w.confidence : ""}${w.speaker ? " · " + esc(w.speaker) : ""}">${esc(w.text)}</span>`).join(" ")}</div>
      <p class="hint">Clic: escuchar · doble clic: corregir. Corregir el texto cambia los subtítulos, nunca el audio ni sus tiempos.</p>`;
  }

  function bindHead() {
    const p = A.p;
    const go = async (path, body, msg) => { try { await api(path, { method: "POST", body: body || {} }); toast(msg); await refresh(true); } catch (e) { toast(e.message, true); } };
    $("#aRender") && ($("#aRender").onclick = () => go(`projects/${p.id}/audio/render`, {}, "Renderizando…"));
    $("#aAnalyze") && ($("#aAnalyze").onclick = () => go(`projects/${p.id}/audio/analyze`, {}, isScript(p) ? "Preparando voz y storyboard…" : "Analizando el audio…"));
    $("#aCancel") && ($("#aCancel").onclick = () => go(`projects/${p.id}/cancel`, {}, "Cancelando… (el proyecto queda consistente)"));
    $("#aResume") && ($("#aResume").onclick = () => go(`projects/${p.id}/resume`, {}, "Reanudando…"));
    $("#trRedo") && ($("#trRedo").onclick = () => go(`projects/${p.id}/audio/analyze`, { force_transcribe: true }, "Transcribiendo de nuevo…"));
    $("#sbRegen") && ($("#sbRegen").onclick = () => { if (confirm("¿Rehacer el storyboard? Se conserva la biblia visual; tus cambios de escena se guardan como versión anterior.")) go(`projects/${p.id}/storyboard/regenerate`, {}, "Regenerando storyboard…"); });
    $("#trManual") && ($("#trManual").onclick = async () => {
      const t = prompt("Pega la transcripción exacta de tu narración (los tiempos se estimarán y quedarán marcados para revisión):", (A.v.transcript || {}).text || "");
      if (!t) return;
      try { A.v = await api(`projects/${p.id}/transcript/manual`, { method: "POST", body: { text: t } }); toast("Transcripción manual guardada"); render(); } catch (e) { toast(e.message, true); }
    });
    $("#trFull") && ($("#trFull").onclick = async () => {
      const t = prompt("Corrige el texto (mismo orden; las palabras iguales conservan su tiempo exacto):", A.v.transcript.text);
      if (t == null || t === A.v.transcript.text) return;
      try { A.v = await api(`projects/${p.id}/transcript`, { method: "PATCH", body: { text: t } }); toast("Transcripción corregida"); render(); } catch (e) { toast(e.message, true); }
    });
    $$(".wd").forEach((el) => {
      el.onclick = () => { const w = A.v.transcript.words.find((x) => x.id === el.dataset.w); if (w && A.audio) { A.audio.currentTime = w.start_s; A.audio.play(); setTimeout(() => A.audio.pause(), Math.max(300, (w.end_s - w.start_s) * 1000 + 250)); } };
      el.ondblclick = async () => {
        const w = A.v.transcript.words.find((x) => x.id === el.dataset.w);
        const t = prompt(`Corregir «${w.text}» (${w.start_s.toFixed(2)}s):`, w.text);
        if (!t || t === w.text) return;
        try { A.v = await api(`projects/${p.id}/transcript`, { method: "PATCH", body: { words: { [w.id]: t } } }); toast("Palabra corregida"); render(); } catch (e) { toast(e.message, true); }
      };
    });
  }

  function setupTimeline() {
    const v = A.v, cv = $("#tl");
    A.audio = $("#aMaster");
    const dur = v.audio.duration_s, scenes = (v.plan || {}).scenes || [], words = (v.transcript || {}).words || [];
    const peaks = (v.waveform || {}).peaks || [];
    let drag = null;
    const xToT = (e) => { const r = cv.getBoundingClientRect(); return Math.max(0, Math.min(dur, ((e.clientX - r.left) / r.width) * dur)); };
    const redraw = () => drawWave(cv, peaks, dur, scenes, words, A.audio ? A.audio.currentTime : null, A.selScene);
    cv.onmousedown = (e) => {
      const t = xToT(e), tol = (dur / cv.getBoundingClientRect().width) * 6;
      const idx = scenes.findIndex((s, i) => i > 0 && Math.abs(s.start_s - t) < tol);
      if (idx > 0) drag = { idx, t };
      else { A.audio.currentTime = t; const s = scenes.find((x) => x.start_s <= t && t < x.end_s); A.selScene = s && s.id; redraw(); highlightRow(); }
    };
    window.onmousemove = (e) => { if (!drag) return; const t = xToT(e); const s = scenes[drag.idx]; const lo = scenes[drag.idx - 1].start_s + 0.3, hi = s.end_s - 0.3; drag.t = Math.max(lo, Math.min(hi, t)); s.start_s = drag.t; scenes[drag.idx - 1].end_s = drag.t; redraw(); };
    window.onmouseup = async () => {
      if (!drag) return;
      const d = drag; drag = null;
      try { A.v = await api(`projects/${A.p.id}/storyboard`, { method: "PATCH", body: { cuts: { [scenes[d.idx].id]: d.t } } }); toast(`Corte movido a ${fmt(d.t)} (audio intacto)`); render(); } catch (e) { toast(e.message, true); render(); }
    };
    const loop = () => { redraw(); if (A.film && A.audio) A.film.render(A.audio.currentTime); A.raf = requestAnimationFrame(loop); };
    A.raf = requestAnimationFrame(loop);
  }

  function highlightRow() { $$(".sbrow").forEach((r) => r.classList.toggle("cur", r.dataset.s === A.selScene)); }

  function renderBoard() {
    const plan = A.v.plan, lib = A.v.library || {}, en = A.v.enums || {};
    const bible = plan.visual_bible;
    const sel = (f, list, val, lab) => `<select data-f="${f}">${list.map((x) => `<option value="${esc(x)}" ${x === val ? "selected" : ""}>${esc(lab ? lab(x) : x)}</option>`).join("")}</select>`;
    $("#sbBox").innerHTML = plan.scenes.map((s, i) => {
      const chars = (s.characters || []).map((c, k) => {
        const bc = bible.characters.find((b) => b.id === c.id) || {};
        const acts = ((lib.characters || {})[bc.asset_id] || {}).actions || ["idle"];
        return `<span class="tag">${esc(c.id)} ${sel("act:" + k, acts, c.action)}</span>`;
      }).join(" ");
      const ov = (s.overlays || []).map((o) => `<span class="tag">${esc(o.type)}${o.value != null ? " " + esc(o.value) : ""}${o.label ? " · " + esc(o.label) : ""}</span>`).join(" ");
      const beats = (s.action_beats || []).map((b) => `<span class="tag">${fmt(b.at_s)} ${esc(b.target)}.${esc(b.action)}</span>`).join(" ");
      return `<div class="sbrow" data-s="${s.id}" data-i="${i}" style="border-left:4px solid ${COLORS[i % COLORS.length]}">
        <div class="meta"><span class="num">#${i + 1}</span><span class="tag">${fmt(s.start_s)} → ${fmt(s.end_s)} · ${(s.end_frame - s.start_frame)} fr</span>
          ${sel("template", en.templates || [], s.template)} ${sel("background_id", bible.backgrounds.map((b) => b.id), s.background_id)}
          ${sel("shot", en.shots || [], (s.camera || {}).shot || "wide")} ${sel("movement", en.moves || [], (s.camera || {}).movement || "static")}
          ${sel("transition_in", en.transitions || [], s.transition_in || "cut")} <span class="tag">v${s.revision}</span></div>
        <div class="narr">${esc(s.narration_exact || "(silencio)")}</div>
        <div class="row tight" style="gap:6px;flex-wrap:wrap">${chars} ${ov} ${beats}</div>
        <div class="hint">${esc(s.visual_justification || "")}</div>
        <div class="tools"><button class="btn sm" data-a="play">▶ Reproducir</button><button class="btn sm" data-a="save">💾 Guardar</button>
          <button class="btn sm pri" data-a="rerender">🔁 Re-renderizar esta escena</button></div></div>`;
    }).join("");
    $$(".sbrow").forEach((row) => {
      const s = plan.scenes[+row.dataset.i];
      const fields = () => {
        const f = { template: $("[data-f=template]", row).value, background_id: $("[data-f=background_id]", row).value, transition_in: $("[data-f=transition_in]", row).value,
          camera: Object.assign({}, s.camera, { shot: $("[data-f=shot]", row).value, movement: $("[data-f=movement]", row).value }),
          characters: (s.characters || []).map((c, k) => Object.assign({}, c, { action: ($(`[data-f="act:${k}"]`, row) || {}).value || c.action })) };
        delete f.camera.focus_at_s;
        return f;
      };
      $("[data-a=play]", row).onclick = () => { if (!A.audio) return; A.audio.currentTime = s.start_s; A.audio.play(); A.stopAt = s.end_s; A.selScene = s.id; highlightRow(); };
      $("[data-a=save]", row).onclick = async () => {
        try { A.v = await api(`projects/${A.p.id}/storyboard`, { method: "PATCH", body: { scene_id: s.id, fields: fields() } }); toast(`Escena #${+row.dataset.i + 1} guardada`); render(); } catch (e) { toast(e.message, true); }
      };
      $("[data-a=rerender]", row).onclick = async () => {
        try { await api(`projects/${A.p.id}/scenes/${s.id}/rerender`, { method: "POST", body: { fields: fields() } }); toast("Re-renderizando solo esta escena (las demás salen de la caché)"); await refresh(true); } catch (e) { toast(e.message, true); }
      };
    });
    if (A.audio) A.audio.ontimeupdate = () => { if (A.stopAt && A.audio.currentTime >= A.stopAt) { A.audio.pause(); A.stopAt = null; } };
  }

  async function tab(name) {
    const p = A.p, el = $("#atab");
    A.film = null;
    if (name === "video") {
      const url = p.urls && p.urls.video;
      el.innerHTML = `<div id="vHost"></div><div class="row" style="gap:8px;margin-top:10px" id="vBtns"></div>`;
      if (url && !A.forceLive) {
        const fm = A.ctx.opt.formats[p.settings.format] || A.ctx.opt.formats.vertical;
        $("#vHost").innerHTML = `<div class="stage ${fm.H > fm.W ? "v" : ""}"><video src="${url}?v=${p.updated}" controls playsinline></video><div class="badge">MP4 FINAL</div></div>`;
        $("#vBtns").innerHTML = `<a class="btn sm" href="${url}" download>⬇️ MP4</a><button class="btn sm" id="live">👁️ Vista previa en vivo</button><a class="btn sm" href="api/projects/${p.id}/download">📦 Proyecto (.zip)</a>`;
        $("#live").onclick = () => { A.forceLive = true; tab("video"); };
      } else if (A.v && A.v.plan) {
        await livePreview($("#vHost"));
        $("#vBtns").innerHTML = `<label class="toggle"><input type="checkbox" id="capT" ${A.hideCaps ? "" : "checked"}><i></i>Subtítulos</label>${url ? `<button class="btn sm" id="mp4">🎞️ Ver MP4</button>` : ""}<span class="hint">Usa el reproductor de audio de la izquierda: la vista previa sigue a la narración.</span>`;
        $("#capT").onchange = (e) => { A.hideCaps = !e.target.checked; tab("video"); };
        $("#mp4") && ($("#mp4").onclick = () => { A.forceLive = false; tab("video"); });
      } else el.innerHTML = `<div class="empty">La vista previa aparece cuando exista el storyboard.</div>`;
    } else if (name === "qa") {
      const q = p.qa, ap = p.approval;
      el.innerHTML = !q ? `<div class="empty">La QA se ejecuta al terminar el render.</div>` : `
        <div class="row tight" style="gap:8px;margin-bottom:10px"><span class="pill ${q.status === "PASS" ? "ok" : q.status === "FAIL" ? "bad" : ""}">QA ${q.status}</span>
        ${ap ? `<span class="pill ${ap.approved ? "ok" : "bad"}">${ap.approved ? "Aprobado" : "Rechazado"}</span>` : `<span class="pill">Pendiente de tu aprobación</span>`}</div>
        <div class="kv">${q.checks.map((c) => `<span class="k">${c.status === "PASS" ? "✅" : c.status === "FAIL" ? "⛔" : c.status === "INFO" ? "ℹ️" : "⚠️"} ${esc(c.check)}</span><span>${esc(c.detail)}</span>`).join("")}</div>
        <div class="thumbs">${((A.v.urls || {}).qa_frames || []).slice(0, 36).map((u) => `<a href="${u}" target="_blank"><img src="${u}?v=${p.updated}" loading="lazy"></a>`).join("")}</div>
        <div class="actions"><button class="btn pri" id="ok">✔ Aprobar</button><button class="btn red" id="ko">✕ Rechazar</button></div>`;
      const act = async (ok) => { try { await api(`projects/${p.id}/approve`, { method: "POST", body: { approved: ok } }); await refresh(true); } catch (e) { toast(e.message, true); } };
      $("#ok") && ($("#ok").onclick = () => act(true));
      $("#ko") && ($("#ko").onclick = () => act(false));
    } else if (name === "log") {
      el.innerHTML = `<div class="log" id="logBox">${esc(((p.live || {}).log || []).join("\n")) || "Sin actividad todavía."}</div>`;
    } else if (name === "files") {
      const u = (A.v || {}).urls || {}, ex = u.export || {};
      el.innerHTML = `<div class="kv"><span class="k">Video</span><span>${p.urls && p.urls.video ? `<a href="${p.urls.video}" download>MP4</a>` : "—"}</span>
        <span class="k">Subtítulos</span><span>${p.urls && p.urls.srt ? `<a href="${p.urls.srt}" download>SRT</a>` : "—"}</span>
        <span class="k">${isScript(p) ? "Narración" : "Audio original"}</span><span>${u.original ? `<a href="${u.original}" download>${isScript(p) ? "voz del guion (WAV)" : "tal cual lo subiste"}</a>` : "—"}</span>
        ${Object.entries(ex).map(([k, href]) => `<span class="k">${esc(k)}</span><span><a href="${href}" download>descargar</a></span>`).join("")}
        <span class="k">Proyecto editable</span><span><a href="api/projects/${p.id}/download">ZIP (HyperFrames + plan + manifiestos)</a></span></div>`;
    } else if (name === "cfg") {
      const st = p.settings;
      el.innerHTML = `<label class="f">Subtítulos</label><select id="c_captions"><option value="explainer" ${st.captions !== "none" ? "selected" : ""}>Explicativo</option><option value="none" ${st.captions === "none" ? "selected" : ""}>Ocultos</option></select>
        <label class="f">Calidad</label><select id="c_quality">${["draft", "standard", "high"].map((x) => `<option ${st.quality === x ? "selected" : ""}>${x}</option>`).join("")}</select>
        <div class="row" style="margin-top:12px"><label class="toggle"><input type="checkbox" id="c_music" ${st.music ? "checked" : ""}><i></i>Música</label>
        <label class="toggle"><input type="checkbox" id="c_sfx" ${st.sfx ? "checked" : ""}><i></i>Efectos</label></div>
        <div class="actions"><button class="btn pri" id="c_go">Guardar y renderizar</button></div>
        <p class="hint">${isScript(p) ? "La voz del guion es la pista principal" : "La narración original se conserva siempre"}; música y efectos se mezclan por debajo solo si los activas.</p>`;
      $("#c_go").onclick = async () => {
        const body = { captions: $("#c_captions").value, quality: $("#c_quality").value, music: $("#c_music").checked, sfx: $("#c_sfx").checked };
        try { await api(`projects/${p.id}/audio/render`, { method: "POST", body }); toast("Renderizando…"); await refresh(true); } catch (e) { toast(e.message, true); }
      };
    } else if (name === "bible") {
      const b = (A.v.plan || {}).visual_bible;
      el.innerHTML = !b ? `<div class="empty">Sin biblia visual todavía.</div>` : `<div class="kv"><span class="k">Estilo</span><span>${esc(b.style)}</span>
        ${b.characters.map((c) => `<span class="k">${esc(c.id)}</span><span>${esc(c.description)}${c.role ? ` · rol <b>${esc(c.role.replace("_f", ""))}</b>` : ""} · variante <b>${esc(c.variant)}</b> · «${esc(c.name)}»${c.designed_by ? " · diseñado por el LLM (validado)" : ""}</span>`).join("")}
        ${b.backgrounds.map((x) => `<span class="k">${esc(x.id)}</span><span>${esc(x.asset_id)}</span>`).join("")}</div>
        <p class="hint">Cada personaje conserva el mismo id y diseño en todas las escenas (continuidad visual).</p>`;
    }
  }

  async function livePreview(host) {
    let data;
    try { data = await api(`projects/${A.p.id}/audio/preview`); } catch (e) { host.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (A.hideCaps) data.captions.enabled = false;
    const box = Math.min(380, host.clientWidth || 380);
    const k = data.H > data.W ? (box * 1.35) / data.H : box / data.W;
    host.innerHTML = `<div class="stage ${data.H > data.W ? "v" : ""}" style="width:${data.W * k}px;height:${data.H * k}px;position:relative;overflow:hidden;margin:auto"><div id="vsvHost" style="position:absolute;left:0;top:0;width:${data.W}px;height:${data.H}px;transform:scale(${k});transform-origin:0 0"></div><div class="badge">VISTA PREVIA EN VIVO</div></div>`;
    A.film = window.VSV.film($("#vsvHost"), data);
    A.film.render(A.audio ? A.audio.currentTime : 0);
  }

  async function refresh(full) {
    const p = await api("projects/" + A.p.id);
    A.p = p;
    try { A.v = await api(`projects/${p.id}/audio`); } catch (e) { /* */ }
    if (full) render();
  }

  function startPoll() {
    clearInterval(A.poll);
    const id = A.p.id;
    A.poll = setInterval(async () => {
      if (!location.hash.startsWith("#/p/" + id)) return clearInterval(A.poll);
      try {
        const r = await api(`projects/${id}/status`);
        const live = r.live || {};
        const n = (live.done || []).length;
        const finished = A.p.live && A.p.live.running && !live.running;
        A.p.live = live;
        if (n !== A.lastDone || finished) { A.lastDone = n; return refresh(true); }
        const bar = $(".prog > i");
        if (bar) bar.style.width = Math.round((live.progress || 0) * 100) + "%";
        if ($("#pmsg")) $("#pmsg").textContent = live.message || "";
        const lb = $("#logBox");
        if (lb) { lb.textContent = (live.log || []).join("\n"); lb.scrollTop = lb.scrollHeight; }
      } catch (e) { /* reintento */ }
    }, 1500);
  }

  function stop() {
    cancelAnimationFrame(A.raf);
    if (A.audio) { try { A.audio.pause(); } catch (e) { /* */ } }
    A.film = null;
  }

  window.VSAudio = { createView, projectView, submitAudio, stop: () => { stop(); clearInterval(A.poll); } };
})();
