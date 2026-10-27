"""Viral Studio para ComfyUI — videos animados virales de principio a fin
(historia con LLM abierto, voz, música, animación HyperFrames y render).

Abre el Studio en  http://<tu-comfyui>/viralstudio/  o con el botón 🎬 del menú.
"""
import os

from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

WEB_DIRECTORY = "./web"

try:
    if os.environ.get("VS_EMBED_STUDIO", "1") == "0":
        # el Studio lo sirve el orquestador independiente (standalone.py): un solo orquestador (V3 §9)
        raise RuntimeError("VS_EMBED_STUDIO=0 → el Studio corre como servicio aparte; aquí solo se cargan los nodos")
    from server import PromptServer

    try:
        from comfy.cli_args import args

        host = args.listen if args.listen not in ("0.0.0.0", "::", "", None) else "127.0.0.1"
        host = host.split(",")[0]
        os.environ.setdefault("VS_COMFY_URL", f"http://{host}:{args.port}")
    except Exception:
        pass
    from .vs import server as _vs_server

    os.environ["VS_HOST"] = "comfyui"
    _vs_server.setup(PromptServer.instance.routes)
    print("[ViralStudio] Studio listo en /viralstudio/")
except Exception as e:  # fuera de ComfyUI (pruebas) no hay servidor
    print(f"[ViralStudio] rutas web no registradas: {e}")

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
