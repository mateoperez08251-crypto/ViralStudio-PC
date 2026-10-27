"""Interfaz original en localhost; trabajos y cómputo en el motor remoto de Colab."""
import argparse
import asyncio
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import time
from urllib.parse import urlsplit
import uuid
import webbrowser

import aiohttp
from aiohttp import web

ROOT = Path(__file__).resolve().parents[1]
NODE = ROOT / 'ComfyUI-ViralStudio'
# Este módulo solo usa stdlib: no se importan motores, torch ni ComfyUI en la PC.
sys.path.insert(0, str(NODE))
from vs.guidance import validate as validate_guide

HOP = {'host','connection','content-length','transfer-encoding','content-encoding','cookie','authorization','origin','referer'}
PID = re.compile(r'[A-Za-z0-9_-]{1,100}')


def data_home():
    return Path(os.environ.get('VS_PC_DATA') or (Path(os.environ.get('LOCALAPPDATA') or Path.home()) / 'ViralStudio-PC'))


def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    with contextlib.suppress(OSError):tmp.chmod(0o600)
    tmp.replace(path)


class Store:
    def __init__(self, folder):
        self.root=Path(folder);self.root.mkdir(parents=True,exist_ok=True)
        self.config_path=self.root/'conexion.json'
        self.db=sqlite3.connect(self.root/'cola.sqlite3')
        self.db.row_factory=sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('''CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, payload TEXT NOT NULL, remote_id TEXT NOT NULL DEFAULT '',
            state TEXT NOT NULL DEFAULT 'en_cola', error TEXT NOT NULL DEFAULT '',
            created REAL NOT NULL, updated REAL NOT NULL, result TEXT NOT NULL DEFAULT '')''')
        columns={row[1] for row in self.db.execute('PRAGMA table_info(jobs)')}
        for name, definition in [('audio_path',"TEXT NOT NULL DEFAULT ''"),('audio_name',"TEXT NOT NULL DEFAULT ''"),('audio_uploaded','INTEGER NOT NULL DEFAULT 0'),('analysis_started','INTEGER NOT NULL DEFAULT 0')]:
            if name not in columns:self.db.execute('ALTER TABLE jobs ADD COLUMN '+name+' '+definition)
        self.db.commit()
    def config(self):
        try:return json.loads(self.config_path.read_text(encoding='utf-8'))
        except (OSError,ValueError):return {}
    def connection(self, body):
        old=self.config();url=str(body.get('url','')).strip().rstrip('/')
        p=urlsplit(url)
        if p.username or p.password or p.query or p.fragment or p.path or not p.hostname:
            raise ValueError('Pega solo la URL base HTTPS de Cloudflare, sin llave ni rutas.')
        if p.scheme!='https' and not (p.scheme=='http' and p.hostname in ('127.0.0.1','localhost','::1')):
            raise ValueError('La conexión remota debe usar HTTPS.')
        token=str(body.get('token') or (old.get('token','') if old.get('url')==url else '')).strip()
        if not token or not token.isascii() or len(token)>512 or any(c in token for c in '\r\n'):
            raise ValueError('Pega la llave de acceso que muestra Colab.')
        cfg=dict(url=url,token=token,auto_download=bool(body.get('auto_download',True)))
        atomic_json(self.config_path,cfg);return cfg
    def save_guide(self, value):
        g=validate_guide(value)
        if not g:raise ValueError('Escribe una guía.')
        directory=self.root/'guias'/g['profile'];directory.mkdir(parents=True,exist_ok=True)
        # La copia .md es editable y se conserva separada de los proyectos enviados.
        tmp=directory/'guia.md.tmp';tmp.write_text(g['markdown'],encoding='utf-8');tmp.replace(directory/'guia.md')
        atomic_json(directory/'perfil.json',{k:v for k,v in g.items() if k!='markdown'})
        return g
    def guide(self, profile):
        if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,63}',profile or ''):raise ValueError('Tipo de animación no válido.')
        d=self.root/'guias'/profile
        try:
            meta=json.loads((d/'perfil.json').read_text(encoding='utf-8'))
            # Releer el Markdown al enviar: también se admiten ediciones locales.
            return validate_guide(dict(meta,markdown=(d/'guia.md').read_text(encoding='utf-8'),sha256=None))
        except (OSError,ValueError) as e:raise ValueError('No se puede leer esta guía. Guárdala de nuevo.') from e
    def guides(self):
        result=[]
        for p in sorted((self.root/'guias').glob('*/perfil.json')):
            try:result.append(self.guide(p.parent.name))
            except ValueError:continue
        return result
    def get(self, jid):
        row=self.db.execute('SELECT * FROM jobs WHERE id=?',(jid,)).fetchone()
        return dict(row) if row else None
    def enqueue(self, payload, jid=None):
        jid=jid or uuid.uuid4().hex
        if not re.fullmatch(r'[A-Za-z0-9_-]{16,128}',jid):raise ValueError('Id de solicitud inválido.')
        encoded=json.dumps(payload,ensure_ascii=False,sort_keys=True)
        prior=self.get(jid)
        if prior:
            if prior['payload']!=encoded:raise ValueError('Esta solicitud ya está guardada con otros ajustes.')
            return prior
        now=time.time()
        with self.db:self.db.execute('INSERT INTO jobs(id,payload,created,updated) VALUES(?,?,?,?)',(jid,encoded,now,now))
        return self.get(jid)
    def update(self, jid, **values):
        if not set(values)<= {'remote_id','state','error','result','audio_path','audio_name','audio_uploaded','analysis_started'}:raise ValueError('Campo no permitido.')
        values['updated']=time.time()
        with self.db:self.db.execute('UPDATE jobs SET '+','.join(k+'=?' for k in values)+' WHERE id=?',(*values.values(),jid))
    def jobs(self):
        return [dict(r) for r in self.db.execute('SELECT * FROM jobs ORDER BY created DESC')]


class Broker:
    def __init__(self, store, session):
        self.store,self.session=store,session
        self.lock=asyncio.Lock();self.last_connection_error='';self.checked_connection=None
    def remote(self, path):
        cfg=self.store.config()
        if not cfg.get('url') or not cfg.get('token'):raise ValueError('Configura la conexión con Colab.')
        if not path.startswith('/viralstudio/') or path.startswith('//') or '\\' in path:
            raise ValueError('Ruta remota no válida.')
        return cfg['url']+path,{'Authorization':'Bearer '+cfg['token']}
    async def json(self, method,path,**kwargs):
        url,headers=self.remote(path)
        async with self.session.request(method,url,headers=headers,allow_redirects=False,**kwargs) as resp:
            try:data=await resp.json()
            except (ValueError,aiohttp.ContentTypeError):raise ValueError(f'Colab respondió HTTP {resp.status} sin JSON. Revisa la URL y la llave.')
            if resp.status>=400:raise ValueError(str(data.get('error') or data.get('detail') or f'HTTP {resp.status}'))
            return data
    def settings(self, payload, profile='', auto=True):
        if not isinstance(payload,dict):raise ValueError('Ajustes no válidos.')
        body=dict(payload);cfg=dict(body.get('settings') or body)
        if profile:
            cfg['animation_guidance']=self.store.guide(profile)
            cfg.update(auto_storyboard=True,manual_storyboard=False,storyboard_mode='auto')
        cfg['pc_auto_run']=bool(auto)
        cfg['pc_max_repairs']=2 if auto or profile else 0
        cfg['professional_gate']=True
        cfg['visual_review']=True
        if auto and cfg.get('input_mode')=='audio':
            cfg.update(auto_storyboard=True,manual_storyboard=False,storyboard_mode='auto')
        return {'settings':cfg,**({'run':body['run']} if 'run' in body else {})}
    async def submit(self, jid):
        async with self.lock:
            job=self.store.get(jid)
            if job['remote_id']:
                return await self.json('GET','/viralstudio/api/projects/'+job['remote_id'])
            url,headers=self.remote('/viralstudio/api/projects')
            fingerprint=hashlib.sha256((url+headers['Authorization']).encode()).hexdigest()
            if self.checked_connection!=fingerprint:
                health=await self.json('GET','/viralstudio/healthz')
                caps=health.get('capabilities') or {}
                if not caps.get('pc_guidance_v1') or not caps.get('idempotent_create_v1') or not caps.get('visual_review_v1'):
                    raise ValueError('Actualiza la libreta Colab: este motor no confirma guías e idempotencia.')
                await self.json('GET','/viralstudio/api/visual/status')
                self.checked_connection=fingerprint
            headers['Idempotency-Key']=jid
            async with self.session.post(url,json=json.loads(job['payload']),headers=headers,allow_redirects=False) as resp:
                try:data=await resp.json()
                except (ValueError,aiohttp.ContentTypeError):raise ValueError('La respuesta de Colab no es válida; comprueba su URL y la llave.')
                if resp.status>=400:
                    message=str(data.get('error') or f'HTTP {resp.status}')
                    # Un fallo de validación no se vuelve a enviar automáticamente.
                    if 400<=resp.status<500 and resp.status not in (401,408,429):self.store.update(jid,state='error',error=message)
                    raise ValueError(message)
                pid=data.get('id','')
                if not PID.fullmatch(pid):raise ValueError('El servidor no confirmó el id del proyecto.')
                self.store.update(jid,remote_id=pid,state='enviado',error='')
                return data
    async def transfer_audio(self, jid):
        async with self.lock:
            job=self.store.get(jid)
            if not job or not job['remote_id'] or not job.get('audio_path'):raise ValueError('No hay audio guardado para este proyecto.')
            if not job.get('audio_uploaded'):
                path=Path(job['audio_path'])
                if not path.is_relative_to(self.store.root/'entradas') or not path.is_file():raise ValueError('No se encuentra la copia local del audio.')
                url,headers=self.remote('/viralstudio/api/projects/'+job['remote_id']+'/audio')
                with path.open('rb') as f:
                    form=aiohttp.FormData();form.add_field('file',f,filename=job['audio_name'] or 'audio.bin',content_type='application/octet-stream')
                    async with self.session.post(url,data=form,headers=headers,allow_redirects=False) as response:
                        data=await response.json()
                        if response.status>=400:
                            message=str(data.get('error') or 'No se pudo enviar el audio.')
                            if 400<=response.status<500 and response.status not in (401,408,429):
                                self.store.update(jid,state='error',error=message)
                            raise ValueError(message)
                self.store.update(jid,audio_uploaded=1,error='')
            if json.loads(job['payload'])['settings'].get('pc_auto_run') and not job.get('analysis_started'):
                project=await self.json('GET','/viralstudio/api/projects/'+job['remote_id'])
                if not (project.get('live') or {}).get('running') and not (project.get('urls') or {}).get('video'):
                    await self.json('POST','/viralstudio/api/projects/'+job['remote_id']+'/audio/analyze',json={})
                self.store.update(jid,analysis_started=1,error='')
        return {'ok':True}

    async def download(self, job, project):
        pid=job['remote_id'];urls=project.get('urls') or {};destination=self.store.root/'resultados'/pid
        for key in ('video','srt','meta'):
            path=urls.get(key)
            if not path:continue
            if not path.startswith('/viralstudio/files/'+pid+'/') or '?' in path or '#' in path:
                raise ValueError('El servidor devolvió una ruta de resultado no válida.')
            ext={ 'video':'.mp4','srt':'.srt','meta':'.txt'}[key];target=destination/(key+ext)
            destination.mkdir(parents=True,exist_ok=True)
            url,headers=self.remote(path)
            tmp=target.with_suffix(target.suffix+'.part')
            async with self.session.get(url,headers=headers,allow_redirects=False) as response:
                if response.status!=200:raise ValueError(f'No se pudo descargar {key}: HTTP {response.status}')
                size=0
                with tmp.open('wb') as f:
                    async for chunk in response.content.iter_chunked(1<<18):f.write(chunk);size+=len(chunk)
                if not size:raise ValueError('El resultado descargado está vacío.')
                length=response.headers.get('Content-Length')
                if length and not response.headers.get("Content-Encoding") and size!=int(length):raise ValueError('La descarga quedó incompleta.')
            tmp.replace(target)
        if not (destination/'video.mp4').is_file():raise ValueError('El video final no está disponible todavía.')
        atomic_json(destination/'proyecto.json',project)
        self.store.update(job['id'],state='completo',error='',result=str(destination))
    async def tick(self):
        if not self.store.config().get('url'):return
        jobs=list(reversed(self.store.jobs()))
        for job in jobs:
            if job['state'] not in ('en_cola','esperando_conexion','enviado','listo'):continue
            try:
                if not job['remote_id']:
                    await self.submit(job['id']);job=self.store.get(job['id'])
                if job.get('audio_path') and (not job.get('audio_uploaded') or not job.get('analysis_started')):
                    await self.transfer_audio(job['id'])
                p=await self.json('GET','/viralstudio/api/projects/'+job['remote_id'])
                state=p.get('status') or {}
                if state.get('stage')=='error':
                    self.store.update(job['id'],state='error',error=str(state.get('message') or 'Falló el procesamiento.'));continue
                if (p.get('live') or {}).get('running'):continue
                if (p.get('qa') or {}).get('status')=='FAIL':
                    self.store.update(job['id'],state='error',error='QA detectó fallos. El resultado no se descarga automáticamente; abre el proyecto y su informe.');continue
                if (p.get('urls') or {}).get('video') and state.get('stage')=='listo':
                    if (p.get('qa') or {}).get('status')=='REVIEW' or (json.loads(job['payload'])['settings'].get('visual_review') and (p.get('visual_review') or {}).get('status')!='PASS'):
                        self.store.update(job['id'],state='revision_pendiente',error='El resultado requiere revisión; no se descarga como final sin superar todos los controles.');continue
                    if self.store.config().get('auto_download',True):await self.download(job,p)
                    else:self.store.update(job['id'],state='listo',error='')
                self.last_connection_error=''
            except (aiohttp.ClientError,asyncio.TimeoutError,OSError,ValueError) as e:
                self.last_connection_error=str(e) if isinstance(e,ValueError) else 'Se interrumpió la conexión con Colab. La cola permanece guardada.'
                if self.store.get(job['id'])['state']!='error':
                    self.store.update(job['id'],state='enviado' if job['remote_id'] else 'esperando_conexion',error=self.last_connection_error)
                break


def make_app(folder=None, worker=True):
    store=Store(folder or data_home())
    @web.middleware
    async def local_only(request, handler):
        origin=request.headers.get('Origin')
        if request.host not in ('localhost:'+str(request.url.port),'127.0.0.1:'+str(request.url.port)):
            return web.json_response({'error':'Acceso solo desde esta PC.'},status=403)
        if origin and origin!=str(request.url.origin()):return web.json_response({'error':'Origen no permitido.'},status=403)
        try:return await handler(request)
        except (ValueError,KeyError) as e:return web.json_response({'error':str(e)},status=400)
    app=web.Application(client_max_size=1024**3,middlewares=[local_only]);app['store']=store
    routes=web.RouteTableDef()
    @routes.get('/')
    async def root(request):raise web.HTTPFound('/viralstudio/')
    @routes.get('/viralstudio/')
    async def studio(request):
        html=(NODE/'studio/index.html').read_text(encoding='utf-8')
        html=html.replace('<script src="engine.js">','<script src="/pc/bridge.js"></script><script src="engine.js">')
        html=html.replace('<a href="../" target="_blank">ComfyUI ↗</a>','<a href="#" onclick="document.getElementById(\'pcPanel\').open=true;return false">Conexión PC ↔ Colab</a>')
        return web.Response(text=html,content_type='text/html')
    @routes.get('/viralstudio/engine.js')
    async def engine(request):
        return web.Response(text='\n'.join(p.read_text(encoding='utf-8') for p in sorted((NODE/'engine').glob('*.js'))),content_type='application/javascript')
    @routes.get('/viralstudio/static/{path:.*}')
    async def static(request):
        path=(NODE/'studio'/request.match_info['path']).resolve()
        if not path.is_relative_to((NODE/'studio').resolve()) or not path.is_file():raise web.HTTPNotFound()
        return web.FileResponse(path)
    @routes.get('/pc/health')
    async def local_health(request):return web.json_response({'ok':True,'service':'viralstudio_pc'})
    @routes.get('/viralstudio/api/options')
    async def studio_options(request):
        # La interfaz completa debe arrancar incluso antes de configurar Colab.
        if store.config().get('url'):
            try:
                remote=await asyncio.wait_for(app['broker'].json('GET','/viralstudio/api/options'),timeout=5)
                if not isinstance(remote,dict) or not all(k in remote for k in ('presets','settings','models','audio_mode')):
                    raise ValueError('Catálogo remoto incompleto.')
                return web.json_response(dict(remote,pc_offline=False))
            except (aiohttp.ClientError,asyncio.TimeoutError,OSError,ValueError):
                pass
        catalog=json.loads(Path(__file__).with_name('options.json').read_text(encoding='utf-8'))
        return web.json_response(dict(catalog,pc_offline=True))
    @routes.get('/pc/bridge.js')
    async def bridge(request):return web.FileResponse(Path(__file__).with_name('bridge.js'))
    @routes.get('/pc/api/state')
    async def state(request):
        cfg=store.config()
        return web.json_response(dict(url=cfg.get('url',''),has_token=bool(cfg.get('token')),auto_download=cfg.get('auto_download',True),
            guides=store.guides(),jobs=[{k:v for k,v in j.items() if k!='payload'} for j in store.jobs()],
            folder=str(store.root),connection_error=app['broker'].last_connection_error))
    @routes.post('/pc/api/connection')
    async def connection(request):
        store.connection(await request.json());return web.json_response({'ok':True})
    @routes.post('/pc/api/check')
    async def check(request):
        h=await app['broker'].json('GET','/viralstudio/healthz')
        if not (h.get('capabilities') or {}).get('pc_guidance_v1'):raise ValueError('Actualiza la libreta Colab de este paquete antes de usar el modo PC.')
        visual=await app['broker'].json('GET','/viralstudio/api/visual/status')
        return web.json_response({'ok':True,'detail':'Conectado al motor compatible y revisor visual '+str(visual.get('model',''))+'.'})
    @routes.post('/pc/api/guides')
    async def guides(request):return web.json_response(store.save_guide(await request.json()))
    @routes.post('/pc/api/batch')
    async def batch(request):
        body=await request.json();items=body.get('items')
        if not isinstance(items,list) or not 1<=len(items)<=100 or any(not isinstance(i,str) or not i.strip() or len(i)>60000 for i in items):raise ValueError('Envía entre 1 y 100 guiones o temas válidos.')
        mode=body.get('mode','script')
        if mode not in ('script','topic'):raise ValueError('El lote debe contener guiones o temas.')
        duration=body.get('duration',60)
        if isinstance(duration,bool) or not isinstance(duration,(int,float)) or not 10<=duration<=3600:
            raise ValueError('La duración del lote debe estar entre 10 y 3600 segundos.')
        payloads=[app['broker'].settings({'input_mode':mode,mode:i,'duration':body.get('duration',60),'music':False,'format':'vertical'},body.get('profile',''),True) for i in items]
        ids=[store.enqueue(p)['id'] for p in payloads]
        return web.json_response({'ok':True,'ids':ids})
    @routes.post('/pc/api/jobs/{jid}/cancel')
    async def cancel(request):
        async with app['broker'].lock:
            job=store.get(request.match_info['jid'])
            if not job:raise web.HTTPNotFound()
            if job['remote_id']:raise ValueError('Cancela el trabajo enviado desde el proyecto original para conocer su estado real.')
            store.update(job['id'],state='cancelado',error='')
        return web.json_response({'ok':True})
    @routes.route('*','/viralstudio/{tail:.*}')
    async def proxy(request):
        broker=app['broker'];path=request.path
        if not path.startswith(('/viralstudio/api/','/viralstudio/files/','/viralstudio/healthz','/viralstudio/readyz')):raise web.HTTPNotFound()
        if request.method=='POST' and path=='/viralstudio/api/projects':
            payload=broker.settings(await request.json(),request.headers.get('X-ViralStudio-Guide',''),request.headers.get('X-ViralStudio-Auto','1')=='1')
            jid=request.headers.get('Idempotency-Key') or uuid.uuid4().hex
            store.enqueue(payload,jid)
            try:return web.json_response(await broker.submit(jid))
            except (aiohttp.ClientError,asyncio.TimeoutError,ValueError):
                return web.json_response({'error':'No se confirmó el envío. La solicitud quedó guardada en la cola de la PC; revisa la conexión o el detalle de la cola.'},status=503)
        audio_match=re.fullmatch(r'/viralstudio/api/projects/([A-Za-z0-9_-]+)/audio',path)
        if request.method=='POST' and audio_match:
            pid=audio_match[1];job=next((j for j in store.jobs() if j['remote_id']==pid),None)
            if job:
                reader=await request.multipart();field=await reader.next()
                while field and field.name not in ('file','audio'):field=await reader.next()
                if not field:raise ValueError('No se recibió el audio.')
                directory=store.root/'entradas'/pid;directory.mkdir(parents=True,exist_ok=True)
                target=directory/(uuid.uuid4().hex+'.bin');tmp=target.with_suffix('.part');size=0
                try:
                    with tmp.open('wb') as f:
                        while True:
                            chunk=await field.read_chunk(1<<18)
                            if not chunk:break
                            size+=len(chunk)
                            if size>1024**3:raise ValueError('El audio supera el límite local de 1 GiB.')
                            f.write(chunk)
                    if not size:raise ValueError('El audio está vacío.')
                    tmp.replace(target)
                finally:tmp.unlink(missing_ok=True)
                store.update(job['id'],audio_path=str(target),audio_name=Path(field.filename or 'audio').name,
                             audio_uploaded=0,analysis_started=0,state='enviado',error='')
                try:return web.json_response(await broker.transfer_audio(job['id']))
                except (aiohttp.ClientError,asyncio.TimeoutError,ValueError):
                    current=store.get(job['id'])
                    if current['state']=='error':return web.json_response({'error':current['error']},status=400)
                    store.update(job['id'],error='Audio guardado en esta PC; se enviará cuando Colab vuelva a responder.')
                    return web.json_response({'ok':True,'queued':True},status=202)
        analyze_match=re.fullmatch(r'/viralstudio/api/projects/([A-Za-z0-9_-]+)/audio/analyze',path)
        if request.method=='POST' and analyze_match:
            job=next((j for j in store.jobs() if j['remote_id']==analyze_match[1]),None)
            if job and json.loads(job['payload'])['settings'].get('pc_auto_run'):
                body=await request.json() if request.can_read_body else {}
                if not body and job.get('audio_path'):
                    return web.json_response({'ok':True,'queued':not bool(job.get('analysis_started'))},status=200 if job.get('analysis_started') else 202)
                # Si el usuario pidió una regeneración explícita se reenvía su JSON.
                url,headers=broker.remote(request.path_qs)
                async with app['session'].post(url,json=body,headers=headers,allow_redirects=False) as response:
                    return web.json_response(await response.json(),status=response.status)
        url,auth=broker.remote(request.path_qs)
        headers={k:v for k,v in request.headers.items() if k.lower() not in HOP and not k.lower().startswith('x-viralstudio')};headers.update(auth)
        try:
            async with app['session'].request(request.method,url,headers=headers,data=request.content.iter_chunked(1<<16) if request.can_read_body else None,allow_redirects=False,auto_decompress=False) as resp:
                h={k:v for k,v in resp.headers.items() if k.lower() not in (HOP-{'content-encoding'})|{'set-cookie'}}
                out=web.StreamResponse(status=resp.status,headers=h);await out.prepare(request)
                async for chunk in resp.content.iter_chunked(1<<16):await out.write(chunk)
                await out.write_eof();return out
        except (aiohttp.ClientError,asyncio.TimeoutError):return web.json_response({'error':'Colab no responde. La cola de tu PC permanece guardada.'},status=502)
    async def lifecycle(app):
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=None,sock_connect=15,sock_read=3600)) as session:
            app['session']=session;app['broker']=Broker(store,session)
            async def loop():
                while True:
                    await app['broker'].tick();await asyncio.sleep(8)
            task=asyncio.create_task(loop()) if worker else None
            yield
            if task:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):await task
            store.db.close()
    app.cleanup_ctx.append(lifecycle);app.add_routes(routes);return app


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8790);parser.add_argument('--no-browser',action='store_true');args=parser.parse_args()
    if not 1024<=args.port<=65535:parser.error('Puerto no válido.')
    url=f'http://127.0.0.1:{args.port}/viralstudio/'
    try:
        from urllib.request import urlopen
        with urlopen(f'http://127.0.0.1:{args.port}/pc/health',timeout=1) as response:
            if json.load(response).get('service')=='viralstudio_pc':
                if not args.no_browser:webbrowser.open(url)
                print('ViralStudio PC ya está abierto:',url)
                return
    except (OSError,ValueError):pass
    if not args.no_browser:
        import threading
        threading.Timer(1,lambda:webbrowser.open(url)).start()
    print('ViralStudio PC:',url,'· datos:',data_home())
    web.run_app(make_app(),host='127.0.0.1',port=args.port,print=None)
if __name__=='__main__':main()
