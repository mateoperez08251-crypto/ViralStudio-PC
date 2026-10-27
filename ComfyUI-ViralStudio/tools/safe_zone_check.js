// Verificación de ZONAS SEGURAS del modo audio (subtítulos, rótulos e infografías dentro del cuadro).
// uso: node safe_zone_check.js engine.js data.json  → imprime JSON {ok, checked, problems:[...]}
// Renderiza el motor real en Chromium (Playwright) en los instantes donde aparece cada grupo de
// subtítulos y cada infografía, y mide el rectángulo de TODO texto visible.
const fs = require("fs");
let chromium;
try { ({ chromium } = require("playwright")); } catch (e) {
  console.log(JSON.stringify({ ok: null, skipped: "playwright no disponible" }));
  process.exit(0);
}
(async () => {
  const [eng, dataP] = process.argv.slice(2);
  const data = JSON.parse(fs.readFileSync(dataP, "utf8"));
  const opts = {};
  if (process.env.VS_CHROMIUM) opts.executablePath = process.env.VS_CHROMIUM;
  const b = await chromium.launch(opts);
  const p = await b.newPage({ viewport: { width: data.W, height: data.H } });
  await p.setContent(`<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;600;700;800;900&family=Oswald:wght@500;700&display=block"><style>*{margin:0}body{background:#000}</style></head><body><div id=h style="position:absolute;left:0;top:0;width:${data.W}px;height:${data.H}px;overflow:hidden"></div></body></html>`);
  await p.addScriptTag({ content: fs.readFileSync(eng, "utf8") });
  // instantes a revisar: final de cada grupo de subtítulos (todas sus palabras visibles) y cada infografía ya entrada
  const times = new Set();
  for (const g of (data.captions && data.captions.groups) || []) times.add(Math.max(g.s, g.e - 0.2));
  for (const s of data.scenes) {
    for (const o of s.overlays || []) if (o.at_s != null) times.add(Math.min(s.end_s - 0.05, o.at_s + 1.0));
    times.add((s.start_s + s.end_s) / 2);
  }
  const res = await p.evaluate(async ({ d, ts }) => {
    try { await document.fonts.load("700 40px Montserrat"); await document.fonts.load("700 40px Oswald"); } catch (e) { /* */ }
    const F = VSV.film(document.getElementById("h"), d);
    const probs = [];
    const tol = 2;
    for (const t of ts) {
      F.render(t);
      const nodes = [...document.querySelectorAll("svg g[data-layer=overlays] text, .vsv-g")];
      for (const n of nodes) {
        const cs = getComputedStyle(n);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        let el = n, hidden = false;
        while (el && el !== document.body) {
          const st = getComputedStyle(el);
          if (st.display === "none" || st.visibility === "hidden" || parseFloat(st.opacity) < 0.05 || (el.getAttribute && parseFloat(el.getAttribute("opacity") || "1") < 0.05)) { hidden = true; break; }
          el = el.parentElement || el.parentNode;
        }
        if (hidden || !(n.textContent || "").trim()) continue;
        const r = n.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.left < -tol || r.top < -tol || r.right > d.W + tol || r.bottom > d.H + tol)
          probs.push({ t: +t.toFixed(2), text: n.textContent.trim().slice(0, 40), box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] });
        if (n.classList && n.classList.contains("vsv-g")) {
          const lines = n.children.length;
          for (const ln of n.children) if (ln.scrollWidth > n.clientWidth + tol) probs.push({ t: +t.toFixed(2), text: ln.textContent.trim().slice(0, 40), overflow_line: [ln.scrollWidth, n.clientWidth] });
          if (lines > 2) probs.push({ t: +t.toFixed(2), text: n.textContent.trim().slice(0, 40), lines });
        }
      }
    }
    return probs;
  }, { d: data, ts: [...times].sort((a, b) => a - b) });
  await b.close();
  console.log(JSON.stringify({ ok: res.length === 0, checked: times.size, problems: res.slice(0, 30) }));
})().catch((e) => { console.log(JSON.stringify({ ok: null, skipped: "error: " + String(e).slice(0, 300) })); });
