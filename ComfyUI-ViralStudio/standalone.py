"""Viral Studio sin ComfyUI como anfitrión (Guía Maestra V2 §1: el sistema debe
funcionar aunque ComfyUI esté desactivado).

    python standalone.py --port 8765

Con ComfyUI apagado funciona el modo "mi propio guion": voz, subtítulos,
animación HyperFrames, QA y MP4. Si ComfyUI está en marcha en VS_COMFY_URL,
el guionista (LLM) y la música se usan a través de su API.
"""
import argparse
import os
import sys

from aiohttp import web

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vs import server  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1", help="no uses 0.0.0.0 sin un túnel autenticado")
    ap.add_argument("--port", type=int, default=8765)
    a = ap.parse_args()
    app = web.Application(client_max_size=1024 ** 3)
    routes = web.RouteTableDef()
    server.setup(routes)

    @routes.get("/healthz")
    async def healthz(request):
        return web.json_response(server.healthz())

    @routes.get("/readyz")
    async def readyz(request):
        import asyncio

        r = await asyncio.get_running_loop().run_in_executor(None, server.readyz)
        return web.json_response(r, status=200 if r["ready"] else 503)

    @routes.get("/")
    async def root(request):
        raise web.HTTPFound("/viralstudio/")

    app.add_routes(routes)
    print(f"[ViralStudio] Studio independiente en http://{a.host}:{a.port}/viralstudio/")
    web.run_app(app, host=a.host, port=a.port, print=None)


if __name__ == "__main__":
    main()
