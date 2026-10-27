"""Pruebas del arranque y del acceso (Ampliación V3 §9-§11, sin GPU ni red externa):
T02 instancia única · T15 recuperación tras reinicio · T16 acceso sin llave · informes sin secretos.

    python -m unittest discover -s tests -v
"""
import asyncio
import json
import os
import socket
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from aiohttp import ClientSession, CookieJar, web  # noqa: E402

from vs import gateway, pipeline, services  # noqa: E402

KEY = "llave-de-prueba-123456"


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class GatewayTests(unittest.TestCase):
    """T16: sin llave no se controla nada ni se descarga nada; 502 claro si el servicio cae."""

    def test_gateway(self):
        asyncio.run(self._run())

    async def _run(self):
        async def comfy(request):
            return web.json_response({"who": "comfy", "path": request.path, "origin": request.headers.get("Origin"),
                                      "cookie": request.headers.get("Cookie"), "authorization": request.headers.get("Authorization")})

        async def orch(request):
            return web.json_response({"who": "orchestrator", "path": request.path})

        runners, ports = [], []
        for h in (comfy, orch):
            app = web.Application()
            app.router.add_route("*", "/{t:.*}", h)
            r = web.AppRunner(app)
            await r.setup()
            p = free_port()
            await web.TCPSite(r, "127.0.0.1", p).start()
            runners.append(r)
            ports.append(p)
        dead = free_port()
        gw = web.AppRunner(gateway.make_app(f"http://127.0.0.1:{ports[0]}", KEY,
                                            [("/viralstudio", f"http://127.0.0.1:{ports[1]}"), ("/caido", f"http://127.0.0.1:{dead}")]))
        await gw.setup()
        gp = free_port()
        await web.TCPSite(gw, "127.0.0.1", gp).start()
        base = f"http://127.0.0.1:{gp}"
        try:
            async with ClientSession(cookie_jar=CookieJar(unsafe=True)) as s:  # unsafe: cookies en 127.0.0.1
                for path in ("/viralstudio/", "/viralstudio/api/projects", "/viralstudio/files/x/video.mp4", "/prompt", "/"):
                    async with s.get(base + path, allow_redirects=False) as r:
                        self.assertEqual(r.status, 401, path)
                async with s.post(base + "/viralstudio/api/projects/x/run", json={}) as r:
                    self.assertEqual(r.status, 401)
                async with s.get(base + "/__gw/healthz") as r:
                    self.assertEqual(await r.json(), {"ok": True})  # público pero sin datos
                async with s.get(base + "/system_stats", headers={"Authorization": "Bearer " + KEY}) as r:
                    self.assertEqual(r.status, 200)
                    body = await r.json()
                    self.assertIsNone(body["authorization"])
                    self.assertIsNone(body["cookie"])
                async with s.get(base + "/system_stats", headers={"Authorization": "Bearer incorrecta"}) as r:
                    self.assertEqual(r.status, 401)
                with patch("asyncio.sleep", return_value=None):
                    async with s.get(base + "/viralstudio/?key=equivocada", allow_redirects=False) as r:
                        self.assertEqual(r.status, 401)
                async with s.get(base + f"/viralstudio/?key={KEY}&tab=qa", allow_redirects=False) as r:
                    self.assertEqual(r.status, 302)
                    self.assertEqual(r.headers["Location"], "/viralstudio/?tab=qa")  # la llave sale de la URL
                    self.assertIn("HttpOnly", r.headers["Set-Cookie"])
                async with s.get(base + "/viralstudio/api/projects") as r:
                    self.assertEqual((await r.json())["who"], "orchestrator")
                async with s.get(base + "/system_stats", headers={"Origin": "https://algo.trycloudflare.com"}) as r:
                    j = await r.json()
                    self.assertEqual(j["who"], "comfy")
                    self.assertEqual(j["origin"], f"http://127.0.0.1:{ports[0]}")  # Origin reescrito para ComfyUI
                    self.assertIsNone(j["cookie"])  # la cookie con la llave no viaja a los servicios
                async with s.get(base + "/caido/x", headers={"Accept": "application/json"}) as r:
                    self.assertEqual(r.status, 502)
                    self.assertIn("ECONNREFUSED", (await r.json())["detail"])
        finally:
            await gw.cleanup()
            for r in runners:
                await r.cleanup()

    def test_routes_longest_prefix(self):
        routes, default = gateway._routes("http://c", [("/viralstudio", "http://o"), ("/viralstudio/api/x", "http://z")])
        self.assertEqual(gateway.upstream_for("/viralstudio/api/x/1", routes, default), "http://z")
        self.assertEqual(gateway.upstream_for("/viralstudio/", routes, default), "http://o")
        self.assertEqual(gateway.upstream_for("/viralstudiox", routes, default), "http://c")


class RedactTests(unittest.TestCase):
    def test_no_secrets(self):
        t = ("token hf_abcdefghijklmnopqrstuvwxyz123 url https://a.trycloudflare.com/viralstudio/?key=SECRETO123456&x=1 "
             "Cookie: vs_key=SECRETO123456; HF_TOKEN=hf_zzz")
        r = services.redact(t, extra=("SECRETO123456",))
        self.assertNotIn("SECRETO123456", r)
        self.assertNotIn("hf_abcdefghijklmnopqrstuvwxyz123", r)
        self.assertNotIn("hf_zzz", r)
        self.assertIn("?key=***", r)


class ServicesTests(unittest.TestCase):
    """T01/T02: arranque verificado y un segundo `up` que reutiliza, sin duplicar."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self._old = services.RUN_DIR
        services.RUN_DIR = self.tmp
        self.port = free_port()
        cfg = {"services": [
            {"id": "web", "argv": [sys.executable, "-m", "http.server", str(self.port), "--bind", "127.0.0.1"], "cwd": self.tmp,
             "port": self.port, "health": f"http://127.0.0.1:{self.port}/", "required": True, "restart": "always", "timeout_s": 20},
            {"id": "opcional_roto", "argv": [sys.executable, "-c", "import sys; print('ModuleNotFoundError: No module named x'); sys.exit(1)"],
             "port": None, "health": None, "required": False, "timeout_s": 10},
        ]}
        services.write_config(cfg)

    def tearDown(self):
        services.stop("web")
        services.RUN_DIR = self._old

    def test_up_twice_reuses(self):
        res, st = services.up(log=lambda *a: None)
        self.assertEqual(res["web"], "started")
        self.assertEqual(res["opcional_roto"], "EXITED")
        self.assertIn("ModuleNotFoundError", st["services"]["opcional_roto"]["diagnosis"])  # causa real, no "error genérico"
        pid = services.read_pid("web")
        res2, _ = services.up(log=lambda *a: None)
        self.assertEqual(res2["web"], "reused")
        self.assertEqual(services.read_pid("web"), pid)
        s = services.status()
        self.assertEqual(s["services"]["web"]["api"]["http"], 200)

    def test_foreign_process_on_port_is_not_killed(self):
        sock = socket.socket()
        sock.bind(("127.0.0.1", self.port))
        sock.listen(1)
        try:
            res, st = services.up(["web"], log=lambda *a: None)
            self.assertEqual(res["web"], "PORT_BUSY")
        finally:
            sock.close()

    def test_key_file_private(self):
        k = services.access_key()
        self.assertGreaterEqual(len(k), 20)
        self.assertEqual(oct(os.stat(services.key_file()).st_mode & 0o777), "0o600")
        self.assertEqual(services.access_key(), k)


class RecoveryTests(unittest.TestCase):
    """T15: un trabajo cortado por un reinicio queda INTERRUPTED y se reanuda por lo que faltaba."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.env = patch.dict(os.environ, {"VS_DATA": self.tmp})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def test_interrupted_then_resume(self):
        proj = pipeline.create({"topic": "faro", "duration": 20, "script": "Hola."})
        proj["job"] = {"id": "j1", "stages": ["story", "voice", "music", "build", "render", "qa"], "done": ["story", "voice"], "state": "RUNNING"}
        pipeline.save(proj)
        done_proj = pipeline.create({"topic": "otro", "duration": 20})
        rec = pipeline.recover()
        self.assertEqual([r["id"] for r in rec], [proj["id"]])
        p = pipeline.load(proj["id"])
        self.assertEqual(pipeline.state(p), "INTERRUPTED")
        self.assertEqual(p["job"]["remaining"], ["music", "build", "render", "qa"])
        self.assertEqual(p["status"]["error"]["code"], "INTERRUPTED")
        self.assertEqual(pipeline.recover(), [])  # idempotente
        self.assertNotIn("job", pipeline.load(done_proj["id"]))
        with patch.object(pipeline, "run") as run:
            self.assertEqual(pipeline.resume(proj["id"]), ["music", "build", "render", "qa"])
            run.assert_called_once_with(proj["id"], ["music", "build", "render", "qa"])


if __name__ == "__main__":
    unittest.main()
