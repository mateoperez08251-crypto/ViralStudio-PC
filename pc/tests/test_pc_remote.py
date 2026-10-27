import asyncio
import gzip
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from aiohttp import web, ClientSession, FormData
from aiohttp.test_utils import TestClient, TestServer

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'pc'));sys.path.insert(0,str(ROOT/'ComfyUI-ViralStudio'))
from pc_app import Store, make_app
from vs import guidance


class Guides(unittest.TestCase):
    def test_persistencia_version_y_lectura_del_markdown(self):
        with tempfile.TemporaryDirectory() as folder:
            store=Store(folder)
            self.addCleanup(store.db.close)
            g=store.save_guide(dict(profile='animales',title='Animales',markdown='# Reglas\nMismo pelaje en todas las escenas.'))
            self.assertEqual(store.guide('animales'),g)
            (Path(folder)/'guias/animales/guia.md').write_text('Nueva regla: conservar la cola.')
            nuevo=store.guide('animales')
            self.assertNotEqual(g['sha256'],nuevo['sha256'])
            self.assertIn('Mismo pelaje',g['markdown'])
            with self.assertRaises(ValueError):store.save_guide(dict(profile='../escape',title='X',markdown='X'))
            with self.assertRaises(ValueError):guidance.validate(dict(profile='x',title='x',markdown='x'*25000))
    def test_cada_llamada_recibe_guia_y_no_se_mezcla_entre_hilos(self):
        from concurrent.futures import ThreadPoolExecutor
        def work(name):
            with guidance.scope({'animation_guidance':dict(profile=name,title=name,markdown='Regla '+name)}):
                return guidance.apply('JSON')
        with ThreadPoolExecutor(max_workers=2) as pool:
            a,b=list(pool.map(work,['uno','dos']))
        self.assertIn('Regla uno',a);self.assertNotIn('Regla dos',a)
        self.assertIn('Regla dos',b);self.assertNotIn('Regla uno',guidance.apply('JSON'));self.assertIn('baja tolerancia',guidance.apply('JSON'))
    def test_url_y_llave_no_se_transfieren_a_otro_servidor_sin_confirmacion(self):
        with tempfile.TemporaryDirectory() as folder:
            s=Store(folder);self.addCleanup(s.db.close)
            s.connection({'url':'https://uno.trycloudflare.com','token':'secreto'})
            with self.assertRaises(ValueError):s.connection({'url':'https://dos.trycloudflare.com'})
            for url in ['http://remoto.example','https://user:pass@example.com','https://example.com/path']:
                with self.assertRaises(ValueError):s.connection({'url':url,'token':'secreto'})


class PCIntegration(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.count=0;self.seen=[];self.fail=False;self.last={};self.fingerprints={};self.audio_case=False;self.fail_audio=False;self.audio_data=b'';self.analyzed=0
        self.remote_app=web.Application()
        async def health(request):
            self.assertEqual(request.headers.get('Authorization'),'Bearer llave-test')
            raw=json.dumps({'ok':True,'capabilities':{'pc_guidance_v1':True,'idempotent_create_v1':True,'visual_review_v1':True}}).encode()
            return web.Response(body=gzip.compress(raw),headers={'Content-Type':'application/json','Content-Encoding':'gzip'})
        async def create(request):
            self.assertEqual(request.headers.get('Authorization'),'Bearer llave-test')
            if self.fail:return web.json_response({'error':'Temporal'},status=503)
            self.count+=1;self.seen.append(await request.json());self.last=self.seen[-1]
            return web.json_response({'id':'proyecto-test','settings':self.last['settings']})
        async def get(request):
            if self.audio_case:return web.json_response({'id':'proyecto-test','status':{'stage':'audio'},'live':{'running':bool(self.analyzed)},'urls':{}})
            return web.json_response({'id':'proyecto-test','status':{'stage':'listo'},'live':{'running':False},'qa':{'status':'PASS'},'visual_review':{'status':'PASS'},'urls':{'video':'/viralstudio/files/proyecto-test/video.mp4','srt':'/viralstudio/files/proyecto-test/sub.srt'}})
        async def file(request):
            if request.match_info['name'].endswith('.srt'):return web.Response(body=b'1\n00:00:00,000 --> 00:00:01,000\nHola\n')
            return web.Response(body=b'video-de-prueba',content_type='video/mp4')
        async def echo(request):return web.Response(body=await request.read(),content_type=request.content_type)
        async def audio(request):
            if self.fail_audio:return web.json_response({'error':'Desconectado'},status=503)
            reader=await request.multipart();field=await reader.next();self.audio_data=await field.read()
            return web.json_response({'ok':True})
        async def analyze(request):
            self.analyzed+=1;return web.json_response({'ok':True})
        self.remote_app.router.add_post('/viralstudio/api/projects/{pid}/audio',audio)
        self.remote_app.router.add_post('/viralstudio/api/projects/{pid}/audio/analyze',analyze)
        self.remote_app.router.add_get('/viralstudio/healthz',health)
        self.remote_app.router.add_get('/viralstudio/api/visual/status',lambda r:web.json_response({'ok':True,'model':'visual-test'}))
        self.remote_app.router.add_post('/viralstudio/api/projects',create)
        self.remote_app.router.add_get('/viralstudio/api/projects/{pid}',get)
        self.remote_app.router.add_get('/viralstudio/files/proyecto-test/{name}',file)
        self.remote_app.router.add_post('/viralstudio/api/echo',echo)
        self.remote=TestServer(self.remote_app);await self.remote.start_server()
        self.app=make_app(self.tmp.name,worker=False);self.pc=TestClient(TestServer(self.app));await self.pc.start_server()
        r=await self.pc.post('/pc/api/connection',json={'url':str(self.remote.make_url('')).rstrip('/'),'token':'llave-test'})
        self.assertEqual(r.status,200)
    async def asyncTearDown(self):
        await self.pc.close();await self.remote.close();self.tmp.cleanup()
    async def test_catalogo_original_disponible_sin_colab(self):
        self.app['store'].config_path.unlink(missing_ok=True)
        response=await self.pc.get('/viralstudio/api/options')
        self.assertEqual(response.status,200)
        data=await response.json()
        self.assertTrue(data['pc_offline'])
        self.assertTrue(data['presets']['styles'])
        self.assertTrue(data['presets']['video_types'])
        self.assertTrue(data['audio_mode']['styles'])
        for path in ['/viralstudio/','/viralstudio/static/app.js','/viralstudio/static/audio.js','/viralstudio/engine.js']:
            response=await self.pc.get(path)
            self.assertEqual(response.status,200,path)

    async def test_catalogo_disponible_si_colab_no_entrega_opciones(self):
        response=await self.pc.get('/viralstudio/api/options')
        self.assertEqual(response.status,200)
        self.assertTrue((await response.json())['pc_offline'])

    async def test_interfaz_original_sin_modelos_en_pc_y_guia_congelada(self):
        r=await self.pc.get('/viralstudio/');html=await r.text()
        self.assertIn('VIRAL STUDIO',html);self.assertIn('/pc/bridge.js',html)
        r=await self.pc.post('/pc/api/guides',json={'profile':'cientifico','title':'Científico','markdown':'Conservar anatomía y escala.'});self.assertEqual(r.status,200)
        h={'Idempotency-Key':'request_test_123456789','X-ViralStudio-Guide':'cientifico','X-ViralStudio-Auto':'1'}
        payload={'settings':{'input_mode':'script','script':'Hola','duration':30}}
        r=await self.pc.post('/viralstudio/api/projects',json=payload,headers=h);self.assertEqual(r.status,200)
        sent=self.last['settings'];self.assertTrue(sent['pc_auto_run']);self.assertIn('anatomía',sent['animation_guidance']['markdown'])
        r=await self.pc.post('/viralstudio/api/projects',json=payload,headers=h);self.assertEqual(r.status,200);self.assertEqual(self.count,1)
        await self.pc.post('/pc/api/guides',json={'profile':'cientifico','title':'Científico','markdown':'Nueva versión.'})
        job=self.app['store'].jobs()[0];self.assertIn('anatomía',json.loads(job['payload'])['settings']['animation_guidance']['markdown'])
        state=await (await self.pc.get('/pc/api/state')).json();self.assertNotIn('llave-test',json.dumps(state))
    async def test_cola_offline_se_conserva_y_descarga_al_volver(self):
        self.fail=True
        r=await self.pc.post('/pc/api/batch',json={'mode':'topic','items':['Animales','Historia'],'duration':30});self.assertEqual(r.status,200)
        await self.app['broker'].tick();self.assertEqual(len(self.app['store'].jobs()),2)
        self.assertTrue(any(j['state']=='esperando_conexion' for j in self.app['store'].jobs()))
        self.fail=False
        await self.app['broker'].tick()
        self.assertEqual(self.count,2)
        self.assertTrue(all(j['state']=='completo' for j in self.app['store'].jobs()))
        data=Path(self.tmp.name)/'resultados/proyecto-test/video.mp4';self.assertEqual(data.read_bytes(),b'video-de-prueba')
        await self.app['broker'].tick();self.assertEqual(self.count,2)
    async def test_subida_streaming_y_origen_externo_rechazado(self):
        body=b'audio'*12000
        r=await self.pc.post('/viralstudio/api/echo',data=body,headers={'Content-Type':'application/octet-stream'})
        self.assertEqual(await r.read(),body)
        r=await self.pc.post('/pc/api/connection',json={'url':'https://evil.example','token':'x'},headers={'Origin':'https://evil.example'})
        self.assertEqual(r.status,403)
    async def test_audio_se_guarda_localmente_y_reintenta_sin_duplicar_analisis(self):
        self.audio_case=True
        r=await self.pc.post('/viralstudio/api/projects',json={'settings':{'input_mode':'audio'}},headers={'Idempotency-Key':'audio_request_123456789'})
        self.assertEqual(r.status,200)
        self.fail_audio=True
        form=FormData();form.add_field('file',b'audio-original',filename='narracion.mp3',content_type='audio/mpeg')
        r=await self.pc.post('/viralstudio/api/projects/proyecto-test/audio',data=form)
        self.assertEqual(r.status,202)
        job=self.app['store'].jobs()[0];self.assertEqual(Path(job['audio_path']).read_bytes(),b'audio-original')
        self.fail_audio=False
        await self.app['broker'].tick()
        self.assertEqual(self.audio_data,b'audio-original');self.assertEqual(self.analyzed,1)
        r=await self.pc.post('/viralstudio/api/projects/proyecto-test/audio/analyze',json={})
        self.assertEqual(r.status,200)
        await self.app['broker'].tick();self.assertEqual(self.analyzed,1);self.assertEqual(self.count,1)

    async def test_motor_viejo_no_crea_proyectos_sin_aplicar_guia(self):
        with patch.object(self.app['broker'],'json',return_value={'ok':True}):
            r=await self.pc.post('/pc/api/batch',json={'items':['Guion'],'mode':'script'});self.assertEqual(r.status,200)
            await self.app['broker'].tick()
        self.assertEqual(self.count,0)
        self.assertIn('Actualiza la libreta',self.app['store'].jobs()[0]['error'])


if __name__=='__main__':unittest.main()
