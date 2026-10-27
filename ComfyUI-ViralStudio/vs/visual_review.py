"""Revisión real de fotogramas con un VLM de ComfyUI y corrección de escenas señaladas."""
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import uuid

from . import comfy_api
from .errors import VSError

DEFAULT_MODEL='qwen3.5_4b_bf16.safetensors'


def parse_review(value, scene_id):
    if not isinstance(value,dict) or value.get('status') not in ('PASS','FAIL','UNCERTAIN'):
        raise ValueError('El revisor visual no devolvió un estado válido.')
    if not isinstance(value.get('observed'),str) or not value['observed'].strip():
        raise ValueError('Falta la descripción de lo observado en las imágenes.')
    issues=value.get('issues')
    if not isinstance(issues,list) or len(issues)>20:raise ValueError('Informe visual no válido.')
    for issue in issues:
        if not isinstance(issue,dict) or not isinstance(issue.get('problem'),str) or not issue['problem'].strip() or not isinstance(issue.get('fix'),str):
            raise ValueError('El problema visual no está descrito.')
    if value['status']=='PASS' and issues:
        value=dict(value,status='FAIL')
    return {'scene':scene_id,'status':value['status'],'observed':value['observed'][:2500],
            'issues':[{k:str(i.get(k,''))[:1000] for k in ('problem','fix','frame')} for i in issues]}


def upload_sheet(path):
    import requests
    from .config import comfy_url
    name='vs_review_'+uuid.uuid4().hex+'.jpg'
    with open(path,'rb') as f:
        r=requests.post(comfy_url().rstrip('/')+'/upload/image',files={'image':(name,f,'image/jpeg')},
                        data={'type':'input','overwrite':'true','subfolder':'viralstudio-review'},timeout=(10,90))
    r.raise_for_status();data=r.json()
    sub=data.get('subfolder','');filename=data.get('name','')
    if filename!=name or sub not in ('','viralstudio-review'):raise ValueError('Ruta de imagen no válida en ComfyUI.')
    return '/'.join(p for p in (sub,filename) if p)


def vision(sheet, prompt, model, cancel=None):
    from . import llm
    from .guidance import apply
    info=comfy_api.object_info('TextGenerate').get('TextGenerate',{}).get('input',{})
    if 'image' not in {**info.get('required',{}),**info.get('optional',{})}:
        raise VSError('VISUAL_REVIEW_UNAVAILABLE','El nodo TextGenerate no admite imagen. Actualiza ComfyUI desde la libreta.')
    if model not in comfy_api.list_models('text_encoders'):
        raise VSError('VISUAL_REVIEW_UNAVAILABLE','Falta el modelo visual '+model+'. Activa REVISION_VISUAL en la libreta y reinstala.')
    uploaded=upload_sheet(sheet)
    workflow={
        '1':{'class_type':'CLIPLoader','inputs':{'clip_name':model,'type':'stable_diffusion','device':'default'}},
        '2':{'class_type':'LoadImage','inputs':{'image':uploaded}},
        '3':{'class_type':'TextGenerate','inputs':{'clip':['1',0],'image':['2',0],'prompt':prompt,
            'max_length':1800,'sampling_mode':'on','sampling_mode.temperature':0.15,'sampling_mode.top_k':20,
            'sampling_mode.top_p':0.8,'sampling_mode.min_p':0.03,'sampling_mode.repetition_penalty':1.05,
            'sampling_mode.seed':0,'thinking':False,'use_default_template':True,
            'system_prompt':apply('Inspecciona únicamente las imágenes recibidas y responde solo con JSON. No identifiques personas reales.')}},
        '4':{'class_type':'PreviewAny','inputs':{'source':['3',0]}}}
    try:
        out=comfy_api.run(workflow,timeout=900,cancel=cancel)
        text=next((s for n in reversed(list(out.values())) for s in n.get('text',[]) if isinstance(s,str)),'')
        return llm.parse_json(text,'object')
    finally:
        base=os.environ.get('VS_COMFY_DIR')
        if base:
            target=(Path(base)/'input'/uploaded).resolve();input_dir=(Path(base)/'input').resolve()
            if target.is_relative_to(input_dir):target.unlink(missing_ok=True)


def sample_scene(video, scene, folder, previous=None):
    from PIL import Image, ImageDraw
    start,end=float(scene['start_s']),float(scene['end_s'])
    if not 0<=start<end:raise ValueError('Tiempos de escena inválidos.')
    paths=[];times=[]
    for n,fraction in enumerate((.12,.5,.88)):
        t=start+(end-start)*fraction;p=Path(folder)/(scene['id']+'_'+str(n)+'.jpg')
        subprocess.run(['ffmpeg','-y','-v','error','-ss',f'{t:.6f}','-i',str(video),'-frames:v','1',
                        '-vf','scale=384:-2',str(p)],capture_output=True,check=True,timeout=45)
        paths.append(p);times.append(t)
    images=[];labels=[]
    if previous and Path(previous).is_file():images.append(Image.open(previous).convert('RGB'));labels.append('Escena anterior: referencia de continuidad')
    for p,t in zip(paths,times):images.append(Image.open(p).convert('RGB'));labels.append(f"{scene['id']} | {t:.2f} s")
    width=384;height=max(i.height for i in images);canvas=Image.new('RGB',(width*len(images),height+40),'#20242c');draw=ImageDraw.Draw(canvas)
    for n,(im,label) in enumerate(zip(images,labels)):
        im.thumbnail((width,height));canvas.paste(im,(n*width+(width-im.width)//2,40));draw.text((n*width+5,10),label,fill='white');im.close()
    target=Path(folder)/(scene['id']+'_revision.jpg');canvas.save(target,quality=92)
    return target,paths[-1],times


def run(proj, folder, cancel=None, log=print, reviewer=None):
    from . import audio_mode as AM
    plan=AM.current_plan(str(folder))
    if plan:scenes=plan.get('scenes') or []
    else:
        scenes=[];cursor=0.
        for index,s in enumerate(proj.get('scenes') or []):
            duration=float(s.get('dur') or 0)
            cursor=float(s.get('start',cursor))
            if duration<=0:raise VSError('VISUAL_REVIEW_UNAVAILABLE','Faltan tiempos fiables para revisar todas las escenas.')
            scenes.append(dict(s,id=s.get('id') or f'sc{index+1:03d}',start_s=cursor,end_s=cursor+duration));cursor+=duration
    video=proj.get('outputs',{}).get('video')
    if not video or not Path(video).is_file() or not scenes:
        raise VSError('VISUAL_REVIEW_UNAVAILABLE','No hay video o escenas con tiempos para revisión visual.')
    model=os.environ.get('VS_VISUAL_MODEL',DEFAULT_MODEL)
    out=Path(folder)/'out'/'revision_visual';out.mkdir(parents=True,exist_ok=True)
    results=[];previous=None;reviewer=reviewer or vision
    guide=proj['settings'].get('animation_guidance') or {}
    prior={s['scene']:s for s in (proj.get('visual_review') or {}).get('scenes',[])}
    for scene in scenes:
        if cancel and cancel():raise RuntimeError('Cancelado por el usuario')
        try:
            sheet,previous,times=sample_scene(video,scene,out,previous)
            expected={k:scene.get(k) for k in ('id','narration_exact','narration','visual_prompt','characters','props','camera','background_id','overlays',
                'action_beats','shot','env','time','mood','chars','prop','label','sub')}
            fingerprint=hashlib.sha256(sheet.read_bytes()+json.dumps([expected,guide,model],sort_keys=True,ensure_ascii=False).encode()).hexdigest()
            old=prior.get(scene['id'])
            if old and old.get('status')=='PASS' and old.get('fingerprint')==fingerprint:
                result=dict(old,cached=True)
            else:
                prompt=('Revisa la escena actual en los tres últimos paneles; el primero puede ser una referencia de la escena anterior. '
                    'Compara lo visible con lo pedido. Señala recortes accidentales, objetos tapados o fuera de encuadre, textos cortados, '
                    'cambios de ropa/anatomía/estilo, composición incoherente y acciones incompatibles con la narración. '
                    'No penalices que un dibujo 2D no sea fotorealista. No inventes movimiento entre fotogramas ni defectos invisibles. '
                    'Si no hay evidencia suficiente, usa UNCERTAIN. Solo PASS si no ves errores. '
                    'Responde SOLO JSON {"status":"PASS|FAIL|UNCERTAIN","observed":"qué se ve",'
                    '"issues":[{"frame":"tiempo o panel","problem":"fallo visible","fix":"cambio visual concreto"}]}.\n'
                    'Escena solicitada: '+json.dumps(expected,ensure_ascii=False)+'\nGuía: '+guide.get('markdown',''))
                from .guidance import scope
                with scope(proj['settings']):raw=reviewer(sheet,prompt,model,cancel)
                result=parse_review(raw,scene['id']);result.update(fingerprint=fingerprint,cached=False)
            result.update(sample_times=times,image_sha256=hashlib.sha256(sheet.read_bytes()).hexdigest(),sheet=str(sheet.relative_to(Path(folder))))
            results.append(result);log(f"[revisión visual] {scene['id']}: {result['status']} · {model}")
        except VSError:raise
        except Exception as e:
            raise VSError('VISUAL_REVIEW_UNAVAILABLE','No se completó la revisión visual de '+scene['id']+': '+str(e)[:300]) from e
    failures=[r for r in results if r['status']!='PASS']
    report={'status':'FAIL' if failures else 'PASS','model':model,'scenes':results,'scenes_reviewed':len(results),
            'coverage':'tres fotogramas por escena y referencia de la anterior; no inspección de cada fotograma',
            'guide_sha256':guide.get('sha256'),'at':time.time()}
    target=out/'informe.json';temp=target.with_suffix('.tmp');temp.write_text(json.dumps(report,ensure_ascii=False,indent=2));temp.replace(target)
    proj['visual_review']=report
    detail=' | '.join(r['scene']+': '+('; '.join(i['problem']+' → '+i['fix'] for i in r['issues']) or r['observed']) for r in failures)[:2500]
    proj.setdefault('qa',{'status':'PASS','checks':[]})
    proj['qa']['checks']=[c for c in proj['qa'].get('checks',[]) if c.get('check')!='revisión visual VLM']
    proj['qa']['checks'].append({'check':'revisión visual VLM','status':report['status'],'detail':detail or f'{len(results)} escenas revisadas por {model}'})
    if failures:proj['qa']['status']='FAIL'
    return report


def repair_failed(proj, folder, cancel=None, log=print):
    """Parches validados solo sobre escenas señaladas; no toca audio ni escenas correctas."""
    from . import audio_mode as AM, audio_storyboard as SB, llm
    from .guidance import scope
    plan=AM.current_plan(str(folder))
    failed={r['scene']:r for r in (proj.get('visual_review') or {}).get('scenes',[]) if r['status']!='PASS'}
    if not failed:raise ValueError('No hay escenas visuales señaladas.')
    if not plan:
        from . import llm
        from .guidance import scope
        scenes=copy.deepcopy(proj.get('scenes') or [])
        for sid, report in failed.items():
            index=next((i for i,s in enumerate(scenes) if s.get('id')==sid),None)
            if index is None or scenes[index].get('locked'):raise VSError('QA_BLOCKED','Escena no editable: '+sid)
            original=scenes[index]
            with scope(proj['settings']):
                revised=llm.rewrite_scene(proj['settings'],proj.get('bible') or {},scenes,index,json.dumps(report,ensure_ascii=False),cancel=cancel)
            if revised.get('narration')!=original.get('narration'):raise VSError('QA_BLOCKED','La corrección cambió la narración.')
            for key in ('shot','env','time','mood','chars','prop','label','sub'):
                if key in revised:original[key]=revised[key]
        proj['scenes']=scenes
        proj['outputs'].pop('info',None)
        return

    allowed=SB.EDITABLE-{'locked'}
    chosen=[s for s in plan['scenes'] if s['id'] in failed]
    if len(chosen)!=len(failed) or any(s.get('locked') for s in chosen):raise VSError('QA_BLOCKED','Una escena fallida no se puede modificar automáticamente o está bloqueada.')
    prompt=('Corrige SOLO estas escenas a partir de fallos observados en imágenes. No cambies ids, narración, tiempos, audio ni fichas de personajes. '
            'Devuelve JSON {"patches":[{"scene_id":"sc001","fields":{...}}]}. '
            'Los campos editables son '+', '.join(sorted(allowed))+'. Usa exclusivamente el catálogo: '
            +SB.llm_prompt(plan['units'],plan['visual_bible'],proj['settings'],__import__('vs.visual_assets',fromlist=['library']).library())
            +'\nEscenas a corregir: '+json.dumps(chosen,ensure_ascii=False)+'\nFallos observados: '+json.dumps(failed,ensure_ascii=False))
    with scope(proj['settings']):raw=llm.generate(prompt,system='Responde solo con parches JSON del esquema pedido.',max_tokens=4000,temperature=.2,cancel=cancel)
    patches=llm.parse_json(raw,'object').get('patches')
    if not isinstance(patches,list) or len(patches)!=len(failed):raise VSError('QA_BLOCKED','La corrección no cubre exactamente las escenas fallidas.')
    trial=copy.deepcopy(plan);seen=set()
    for patch in patches:
        sid=patch.get('scene_id');fields=patch.get('fields')
        if sid not in failed or sid in seen or not isinstance(fields,dict) or not fields or not set(fields)<=allowed:
            raise VSError('QA_BLOCKED','Qwen propuso cambios fuera de las escenas o campos permitidos.')
        SB.edit_scene(trial,sid,fields);seen.add(sid)
    for a,b in zip(plan['scenes'],trial['scenes']):
        if a['id'] not in failed and a!=b:raise VSError('QA_BLOCKED','Se intentó modificar una escena correcta.')
        for key in ('start_s','end_s','start_frame','end_frame','narration_exact','word_ids'):
            if a.get(key)!=b.get(key):raise VSError('QA_BLOCKED','La corrección intentó cambiar narración o tiempos.')
    AM.save_plan(str(folder),trial,'corrección visual automática: '+', '.join(sorted(failed)))
    proj['outputs'].pop('info',None)
    log('Corregidas escenas señaladas: '+', '.join(sorted(failed)))
