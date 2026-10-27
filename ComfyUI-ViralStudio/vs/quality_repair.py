"""Correcciones acotadas por controles observables; no sustituye una revisión visual."""
import json
from pathlib import Path
import time
from .errors import VSError, classify

FATAL = {'CANCELLED','MODEL_UNAVAILABLE','NODE_MISSING','VRAM_OOM','GPU_DISCONNECTED','ASR_FAILED','TTS_FAILED','VISUAL_REVIEW_UNAVAILABLE'}
REPAIRABLE = {'story','plan','build','render','qa'}


def check_result(proj, stage):
    if stage == 'plan' and proj.get('settings',{}).get('professional_gate',True):
        gate=proj.get('quality_gate') or {}
        if gate.get('status')=='FAIL':
            raise VSError('QA_BLOCKED','El plan no supera los controles de dirección: '+' | '.join(gate.get('examples') or []))
    if stage == 'qa' and (proj.get('qa') or {}).get('status')=='FAIL':
        checks=[str(c.get('check',''))+': '+str(c.get('detail','')) for c in proj['qa'].get('checks',[]) if c.get('status')=='FAIL']
        raise VSError('QA_BLOCKED','El video no supera QA: '+' | '.join(checks)[:2000])


def invalidate_render_cache(folder):
    # Se conservan los archivos de video; se invalida únicamente la clave de sus capítulos.
    for p in Path(folder).rglob('*.key'):
        if p.parent.name=='renders' and not p.is_symlink():
            p.unlink(missing_ok=True)


def write_report(proj, folder):
    directory=Path(folder)/'out';directory.mkdir(parents=True,exist_ok=True)
    target=directory/'repair_report.json';temp=target.with_suffix('.tmp')
    temp.write_text(json.dumps(proj.get('repair_history',[]),ensure_ascii=False,indent=2));temp.replace(target)


def execute(stage, proj, ctx, run, save, folder, log=print):
    cfg=proj['settings'];limit=cfg.get('pc_max_repairs',0)
    if isinstance(limit,bool) or not isinstance(limit,int) or not 0<=limit<=3:
        raise ValueError('El máximo de correcciones debe estar entre 0 y 3.')
    corrective=False
    while True:
        try:
            if corrective and stage in ('build','render','qa'):
                visual_failed = stage=='qa' and (proj.get('visual_review') or {}).get('status')=='FAIL'
                if visual_failed:
                    from .visual_review import repair_failed
                    repair_failed(proj,folder,ctx.cancel_flag,log)
                elif proj.get('input_mode')=='audio' or cfg.get('input_mode')=='audio' or cfg.get('engine')=='vector':
                    cfg['replan']=True
                    run('plan');check_result(proj,'plan')
                proj['outputs'].pop('info',None)
                if stage in ('render','qa'):
                    run('build');check_result(proj,'build')
                    if not visual_failed:invalidate_render_cache(folder)
                if stage=='qa':
                    run('render');check_result(proj,'render')
            if corrective and stage=='plan':cfg['replan']=True
            run(stage);check_result(proj,stage)
            if corrective:
                proj['repair_history'][-1]['outcome']='supera_controles_de_la_etapa'
                save(proj);write_report(proj,folder)
            return
        except Exception as e:
            used=getattr(ctx,'repair_used',0)
            if ctx.cancel_flag() or stage not in REPAIRABLE or classify(e) in FATAL or used>=limit:
                if corrective and proj.get('repair_history'):
                    proj['repair_history'][-1]['outcome']='fallo_persistente'
                    save(proj);write_report(proj,folder)
                raise
            if any(x in str(e).lower() for x in ('401','403','429','cuota','rate limit','sin conexión','connection refused')):
                raise
            ctx.repair_used=used+1
            error=str(e)[:2500]
            cfg['_repair_feedback']=(f'Fallo observable en la etapa {stage}: {error}\n'
                'Corrige la causa con el catálogo real. Conserva la narración, los tiempos, la ficha visual y la guía. '
                'No repitas la misma escena fallida ni desactives controles.')
            entry={'attempt':ctx.repair_used,'stage':stage,'problem':error,'at':time.time(),
                   'guide_sha256':(cfg.get('animation_guidance') or {}).get('sha256'),
                   'outcome':'pendiente','visual_review':(proj.get('visual_review') or {}).get('status','no_ejecutada')}
            proj.setdefault('repair_history',[]).append(entry)
            save(proj)
            write_report(proj,folder)
            log(f'Corrección automática {ctx.repair_used}/{limit}: {stage} · {error[:250]}')
            corrective=True
