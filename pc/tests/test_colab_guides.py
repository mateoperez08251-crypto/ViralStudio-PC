import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'ComfyUI-ViralStudio'))
from vs import server_guides

class ColabGuides(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.env=patch.dict(os.environ,{'VS_DATA':self.tmp.name});self.env.start()
        app=web.Application();routes=web.RouteTableDef();server_guides.install(routes);app.add_routes(routes)
        self.client=TestClient(TestServer(app));await self.client.start_server()
    async def asyncTearDown(self):
        await self.client.close();self.env.stop();self.tmp.cleanup()
    async def test_guia_se_guarda_y_recupera_con_huella(self):
        guide={'profile':'animales','title':'Animales','markdown':'Conserva el pelaje.'}
        r=await self.client.post('/viralstudio/api/guides',json=guide)
        self.assertEqual(r.status,200);saved=await r.json()
        self.assertEqual(len(saved['sha256']),64)
        self.assertEqual((Path(self.tmp.name)/'animation_guides/animales.md').read_text(),guide['markdown'])
        data=await (await self.client.get('/viralstudio/api/guides')).json()
        self.assertTrue(data['enabled_by_default']);self.assertEqual(data['guides'],[saved])
        guide['markdown']='Nueva versión.'
        await self.client.post('/viralstudio/api/guides',json=guide)
        self.assertEqual(saved['markdown'],'Conserva el pelaje.')
        self.assertNotEqual(server_guides.list_guides()[0]['sha256'],saved['sha256'])
    async def test_rechaza_rutas_tamano_y_huella_incorrectos(self):
        base={'profile':'animales','title':'Animales','markdown':'Reglas.'}
        for change in ({'profile':'../escape'},{'markdown':'x'*25000},{'sha256':'incorrecta'}):
            r=await self.client.post('/viralstudio/api/guides',json=dict(base,**change))
            self.assertEqual(r.status,400)
        self.assertEqual(server_guides.list_guides(),[])
