#@title 🔗 URL y llave verificadas para ViralStudio PC
ACCION = "Rehacer túnel (enlace nuevo)" #@param ["Mostrar enlace", "Rehacer túnel (enlace nuevo)", "Estado de servicios", "Informe de diagnóstico (redactado)"]
import json, os, sys, time
from pathlib import Path

sys.path.insert(0, "/content/ComfyUI/custom_nodes/ComfyUI-ViralStudio")
os.environ.setdefault("VS_RUN_DIR", "/content/vs_run")
from vs import services as SV

if ACCION.startswith("Estado"):
    print(json.dumps(SV.status(), indent=2, ensure_ascii=False))
elif ACCION.startswith("Informe"):
    print(Path(SV.report()).read_text()[:6000])
else:
    if ACCION.startswith("Rehacer"):
        # Evita que el vigilante arranque otro túnel mientras se cambia la URL.
        SV.stop("watch")
        try:
            estado = SV.load_state()
            SV.stop("tunnel", estado)
            estado.pop("public_url", None)
            estado.pop("external", None)
            # También funciona con versiones anteriores del supervisor:
            # aparta el registro viejo para que no se recupere su URL caducada.
            registro = Path(SV.RUN_DIR) / "tunnel.log"
            if registro.exists():
                registro.rename(registro.with_name(f"tunnel_anterior_{time.time_ns()}.log"))
            SV.save_state(estado)
            SV.up(["gateway", "tunnel"])
        finally:
            SV.spawn_watch()

    estado = SV.load_state()
    url = (estado.get("public_url") or "").rstrip("/")
    llave = SV.access_key(False)
    if not url or not llave:
        print("No se obtuvo un túnel y una llave válidos. Ejecuta primero la instalación.")
    else:
        codigo, cuerpo, detalle = SV.http_get(url + "/__gw/healthz", timeout=10)
        try:
            sano = codigo == 200 and json.loads(cuerpo).get("ok") is True
        except (ValueError, AttributeError):
            sano = False
        if sano:
            print("CONEXIÓN VERIFICADA — copia cada valor en su campo de la PC.")
            print("\nURL:\n" + url)
            print("\nLLAVE:\n" + llave)
        else:
            print(f"El túnel todavía no responde correctamente (HTTP {codigo}).")
            print("No pegues una URL anterior. Mantén Colab conectado y vuelve a ejecutar esta celda.")
            print("Si persiste, selecciona «Informe de diagnóstico (redactado)» y comparte ese informe.")
