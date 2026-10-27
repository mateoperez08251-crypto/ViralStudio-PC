#@title 🔗 Enlace y diagnóstico (opcional: si el enlace dejó de funcionar) { display-mode: "form" }
ACCION = "Mostrar enlace"  #@param ["Mostrar enlace", "Rehacer túnel (enlace nuevo)", "Estado de servicios", "Informe de diagnóstico (redactado)"]
#@markdown El túnel solo conecta tu navegador: si se cae, los trabajos siguen y no se pierde nada.
import json, os, sys

sys.path.insert(0, "/content/ComfyUI/custom_nodes/ComfyUI-ViralStudio")
os.environ.setdefault("VS_RUN_DIR", "/content/vs_run")
from vs import services as SV

if ACCION.startswith("Rehacer"):
    st = SV.load_state()
    SV.stop("tunnel", st)
    SV.save_state(st)
    SV.up(["gateway", "tunnel"])
if ACCION.startswith("Estado"):
    print(json.dumps(SV.status(), indent=2, ensure_ascii=False))
elif ACCION.startswith("Informe"):
    p = SV.report()
    print("Informe sin llaves ni tokens:", p)
    print(open(p).read()[:6000])
else:
    from IPython.display import HTML, display

    link = SV.link()
    if link:
        display(HTML(f'<a href="{link}" target="_blank" style="font:16px system-ui;background:#f0b648;color:#111;padding:10px 16px;'
                     f'border-radius:9px;font-weight:700;text-decoration:none">ABRIR VIRAL STUDIO ↗</a> &nbsp; 🔑 <code>{SV.access_key(False)}</code>'))
    else:
        print("Aún no hay túnel. Elige «Rehacer túnel».")
