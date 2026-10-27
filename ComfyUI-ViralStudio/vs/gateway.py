"""Puerta de acceso con llave para Viral Studio + ComfyUI (Guía V2 §2 / V3 §9: nada
expuesto a Internet sin autenticación).

    python -m vs.gateway --port 8189 --target http://127.0.0.1:8188 \\
        --route /viralstudio=http://127.0.0.1:8765 --key-file /ruta/.access_key

Se pone delante de los servicios locales y es lo único que publica el túnel (cloudflared).
Solo entra quien abre el enlace con ?key=<LLAVE> (se guarda en una cookie) o pega la llave
en la página de acceso. Reenvía HTTP (con Range para el video) y WebSocket (ComfyUI lo usa).

Rutas: cada --route PREFIJO=URL manda ese prefijo a otro servicio (el orquestador
independiente), el resto va a --target (ComfyUI). Así el Studio sigue funcionando
aunque ComfyUI se caiga (V3 T04).

Errores separados (V3 §9): 401 = sin llave · 502 = el servicio local no escucha
(ECONNREFUSED) · 504 = el servicio local no respondió a tiempo. La llave nunca se
escribe en el registro.
"""
import argparse
import asyncio
import hmac
import json
import os
import time

import aiohttp
from aiohttp import web

HOP = {"host", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "transfer-encoding",
       "upgrade", "content-length", "accept-encoding", "authorization", "cookie"}
LOGIN = """<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Viral Studio</title><body style="background:#0b0c10;color:#e9e6df;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0">
<form method="get" style="background:#12141a;border:1px solid #242833;padding:28px;border-radius:14px;width:320px">
<h2 style="margin:0 0 14px">🎬 Viral Studio</h2><p style="color:#8f96a6">Acceso privado. Pega la llave que mostró Colab.</p>
<input name="key" type="password" autofocus autocomplete="off" style="width:100%;box-sizing:border-box;padding:11px;border-radius:9px;border:1px solid #2e3340;background:#0b0c10;color:#fff">
<button style="margin-top:12px;width:100%;padding:11px;border:0;border-radius:9px;background:#f0b648;font-weight:700">Entrar</button>
%MSG%</form></body></html>"""
DOWN = """<!doctype html><html lang="es"><meta charset="utf-8"><title>Viral Studio</title>
<body style="background:#0b0c10;color:#e9e6df;font:16px system-ui;padding:40px"><h2>%T%</h2><p>%D%</p>
<p style="color:#8f96a6">El túnel y la llave funcionan; el problema está en el servicio local. Tus trabajos no se pierden:
se guardan en disco y se ven al volver.</p><script>setTimeout(()=>location.reload(),8000)</script></body></html>"""
MAX_FAILS = 20  # intentos de llave equivocada por IP y por hora


def _routes(target, routes):
    out = [(p.rstrip("/"), u.rstrip("/")) for p, u in (routes or [])]
    out.sort(key=lambda r: -len(r[0]))
    return out, target.rstrip("/")


def upstream_for(path, routes, default):
    for prefix, url in routes:
        if path == prefix or path.startswith(prefix + "/"):
            return url
    return default


def make_app(target, key, routes=None):
    routes, default = _routes(target, routes)
    fails = {}

    def authed(request):
        bearer = request.headers.get('Authorization', '')
        token = bearer[7:] if bearer.startswith('Bearer ') else ''
        return hmac.compare_digest(token, key) or hmac.compare_digest(request.cookies.get("vs_key", ""), key)

    def login(msg="", status=401):
        return web.Response(text=LOGIN.replace("%MSG%", f'<p style="color:#ff7a7a">{msg}</p>' if msg else ""), content_type="text/html",
                            status=status, headers={"Cache-Control": "no-store"})

    def down(status, title, detail):
        if "text/html" in (status[1] or ""):
            return web.Response(text=DOWN.replace("%T%", title).replace("%D%", detail), content_type="text/html", status=status[0])
        return web.json_response({"error": title, "detail": detail, "code": status[0]}, status=status[0])

    async def handler(request):
        if request.path == "/__gw/healthz":  # público y sin datos: solo "la puerta está viva"
            return web.json_response({"ok": True})
        if not authed(request):
            given = request.query.get("key", "")
            if given:
                ip = request.headers.get("CF-Connecting-IP") or request.remote or "?"
                n, t = fails.get(ip, (0, time.time()))
                if time.time() - t > 3600:
                    n, t = 0, time.time()
                if n >= MAX_FAILS:
                    return login("Demasiados intentos. Espera una hora.", 429)
                if hmac.compare_digest(given, key):
                    fails.pop(ip, None)
                    q = {k: v for k, v in request.query.items() if k != "key"}
                    loc = request.path + ("?" + "&".join(f"{k}={v}" for k, v in q.items()) if q else "")
                    r = web.HTTPFound(loc)
                    https = request.secure or request.headers.get("X-Forwarded-Proto") == "https"
                    # SameSite=None solo con https (permite abrirlo dentro del iframe de Colab)
                    r.set_cookie("vs_key", key, max_age=7 * 86400, httponly=True, secure=https, samesite="None" if https else "Lax", path="/")
                    raise r
                fails[ip] = (n + 1, t)
                await asyncio.sleep(1.0)
                return login("Llave incorrecta.")
            if request.path.startswith(("/viralstudio/api", "/api", "/prompt", "/history", "/view", "/ws")):
                return web.json_response({"error": "UNAUTHORIZED", "detail": "Falta la llave de acceso"}, status=401)
            return login()
        base = upstream_for(request.path, routes, default)
        headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP}
        headers.pop("Cookie", None)
        headers.pop("Authorization", None)
        # ComfyUI rechaza peticiones cuyo Origin no coincide con su Host: se reescribe
        if "Origin" in headers:
            headers["Origin"] = base
        if "Referer" in headers:
            headers["Referer"] = base + request.path
        url = base + request.rel_url.path_qs
        accept = request.headers.get("Accept", "")
        try:
            if request.headers.get("Upgrade", "").lower() == "websocket":
                return await ws_proxy(request, url, headers)
            sess = request.app["sess"]
            body = request.content.iter_chunked(1 << 16) if request.can_read_body else None
            async with sess.request(request.method, url, headers=headers, data=body, allow_redirects=False) as up:
                out_h = {k: v for k, v in up.headers.items() if k.lower() not in HOP}
                resp = web.StreamResponse(status=up.status, headers=out_h)
                if up.headers.get("Content-Length") and "Content-Encoding" not in up.headers:
                    resp.content_length = int(up.headers["Content-Length"])
                await resp.prepare(request)
                async for chunk in up.content.iter_chunked(1 << 16):
                    await resp.write(chunk)
                await resp.write_eof()
                return resp
        except aiohttp.ClientConnectorError:
            name = "el Studio (orquestador)" if base != default else "ComfyUI"
            return down((502, accept), f"502 · {name} no está escuchando",
                        f"La puerta no pudo conectar con {base} (ECONNREFUSED). Ejecuta en Colab: <code>!python -m vs.services status</code>")
        except asyncio.TimeoutError:
            return down((504, accept), "504 · el servicio local tardó demasiado", f"{base} no respondió a tiempo.")

    async def ws_proxy(request, url, headers):
        wsurl = url.replace("http://", "ws://").replace("https://", "wss://")
        h = {k: v for k, v in headers.items() if not k.lower().startswith("sec-websocket")}
        ws_up = await request.app["sess"].ws_connect(wsurl, headers=h, max_msg_size=0)
        ws_client = web.WebSocketResponse(max_msg_size=0)
        await ws_client.prepare(request)
        async with ws_up:
            async def a2b():
                async for m in ws_client:
                    if m.type == aiohttp.WSMsgType.TEXT:
                        await ws_up.send_str(m.data)
                    elif m.type == aiohttp.WSMsgType.BINARY:
                        await ws_up.send_bytes(m.data)
                    else:
                        break

            async def b2a():
                async for m in ws_up:
                    if m.type == aiohttp.WSMsgType.TEXT:
                        await ws_client.send_str(m.data)
                    elif m.type == aiohttp.WSMsgType.BINARY:
                        await ws_client.send_bytes(m.data)
                    else:
                        break

            tasks = [asyncio.ensure_future(a2b()), asyncio.ensure_future(b2a())]
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for t in tasks:
                t.cancel()
        await ws_client.close()
        return ws_client

    async def on_start(app):
        app["sess"] = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=None, sock_connect=10, sock_read=3600), auto_decompress=False)

    async def on_stop(app):
        await app["sess"].close()

    app = web.Application(client_max_size=4 * 1024 ** 3)
    app.on_startup.append(on_start)
    app.on_cleanup.append(on_stop)
    app.router.add_route("*", "/{tail:.*}", handler)
    return app


def read_key(args_key, key_file):
    if args_key:
        return args_key
    if key_file and os.path.exists(key_file):
        return open(key_file).read().strip()
    return os.environ.get("VS_ACCESS_KEY", "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8189)
    ap.add_argument("--target", default="http://127.0.0.1:8188")
    ap.add_argument("--route", action="append", default=[], help="PREFIJO=URL, p. ej. /viralstudio=http://127.0.0.1:8765")
    ap.add_argument("--key", default="", help="mejor --key-file o VS_ACCESS_KEY (no queda en la lista de procesos)")
    ap.add_argument("--key-file", default="")
    a = ap.parse_args()
    key = read_key(a.key, a.key_file)
    if len(key) < 12:
        raise SystemExit("Falta una llave de al menos 12 caracteres (--key-file, --key o VS_ACCESS_KEY)")
    routes = [r.split("=", 1) for r in a.route]
    print(json.dumps({"gateway": f"127.0.0.1:{a.port}", "default": a.target, "routes": dict(routes)}), flush=True)
    # host 127.0.0.1: nunca 0.0.0.0; solo el túnel llega aquí. Sin registro de accesos (las URL llevan ?key=)
    web.run_app(make_app(a.target, key, routes), host="127.0.0.1", port=a.port, print=None, access_log=None)


if __name__ == "__main__":
    main()
