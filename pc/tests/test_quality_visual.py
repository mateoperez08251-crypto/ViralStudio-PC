import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch,Mock

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'ComfyUI-ViralStudio'))
try:import requests
except ImportError:
    from pip._vendor import requests
    sys.modules['requests']=requests
from vs import quality_repair as QR, visual_review as VR, guidance, llm, pipeline
from vs.errors import VSError


class Quality(unittest.TestCase):
    def project(self):return {'settings':{'pc_max_repairs':2,'professional_gate':True,'engine':'vector'},'outputs':{},'qa':{'status':'PASS','checks':[]}}
    def test_guia_base_y_feedback_en_llamada_real_del_backend(self):
        calls=[]
        old=llm._BACKEND['fn']
        llm.use_backend(lambda prompt,system,*args:calls.append(system) or '{}')
        try:
            cfg={'animation_guidance':{'profile':'animales','title':'Animales','markdown':'Conserva el pelaje.'},'_repair_feedback':'La cabeza salió cortada.'}
            with guidance.scope(cfg):llm.generate('Revisar');llm.generate('Corregir')
        finally:llm.use_backend(old)
        self.assertEqual(len(calls),2)
        for system in calls:
            self.assertIn('pelaje',system);self.assertIn('cabeza salió cortada',system);self.assertIn('baja tolerancia',system)
        self.assertNotIn('pelaje',guidance.apply('JSON'))
    def test_error_de_plan_se_corrige_y_reporte_registra_resultado(self):
        p=self.project();ctx=SimpleNamespace(cancel_flag=lambda:False);calls=[]
        def run(stage):
            calls.append(stage)
            if len(calls)==1:raise ValueError('Acción imposible en escena 2')
            self.assertIn('Acción imposible',p['settings']['_repair_feedback'])
        with tempfile.TemporaryDirectory() as folder:
            QR.execute('plan',p,ctx,run,lambda _:None,folder,lambda _:None)
            report=json.loads((Path(folder)/'out/repair_report.json').read_text())
        self.assertEqual(calls,['plan','plan']);self.assertEqual(ctx.repair_used,1)
        self.assertEqual(report[-1]['outcome'],'supera_controles_de_la_etapa')
    def test_limite_de_reintentos_y_cancelacion(self):
        for exc in [VSError('MODEL_UNAVAILABLE','Falta el modelo'),RuntimeError('Cancelado')]:
            p=self.project();ctx=SimpleNamespace(cancel_flag=lambda:False);run=Mock(side_effect=exc)
            with tempfile.TemporaryDirectory() as folder,self.assertRaises(Exception):QR.execute('plan',p,ctx,run,lambda _:None,folder,lambda _:None)
            self.assertEqual(run.call_count,1)
        p=self.project();ctx=SimpleNamespace(cancel_flag=lambda:False);run=Mock(side_effect=ValueError('fallo persistente'))
        with tempfile.TemporaryDirectory() as folder,self.assertRaises(ValueError):QR.execute('plan',p,ctx,run,lambda _:None,folder,lambda _:None)
        self.assertEqual(run.call_count,3);self.assertEqual(len(p['repair_history']),2)
    def test_qa_fail_y_revisor_ausente_nunca_se_aprueban(self):
        p=self.project();p['qa']={'status':'FAIL','checks':[{'status':'FAIL','check':'visual','detail':'Objeto fuera de cuadro'}]}
        with self.assertRaises(VSError):QR.check_result(p,'qa')
        ctx=SimpleNamespace(cancel_flag=lambda:False);run=Mock(side_effect=VSError('VISUAL_REVIEW_UNAVAILABLE','Falta el revisor'))
        with tempfile.TemporaryDirectory() as folder,self.assertRaises(VSError):QR.execute('qa',p,ctx,run,lambda _:None,folder,lambda _:None)
        self.assertEqual(run.call_count,1)
    def test_qa_visual_fallida_solo_repara_senaladas_y_revisa_otra_vez(self):
        p=self.project();p['visual_review']={'status':'FAIL','scenes':[{'scene':'sc001','status':'FAIL'}]};ctx=SimpleNamespace(cancel_flag=lambda:False);calls=[]
        def run(stage):
            calls.append(stage)
            if calls==['qa']:
                p['qa']={'status':'FAIL','checks':[{'status':'FAIL','check':'visual','detail':'Recorte incorrecto'}]}
            elif stage=='qa':p['qa']={'status':'PASS','checks':[]}
        with tempfile.TemporaryDirectory() as folder,patch.object(VR,'repair_failed') as repair,patch.object(QR,'invalidate_render_cache') as invalidate:
            QR.execute('qa',p,ctx,run,lambda _:None,folder,lambda _:None)
        self.assertEqual(calls,['qa','build','render','qa']);repair.assert_called_once();invalidate.assert_not_called()


class Visual(unittest.TestCase):
    def test_informe_invalido_no_se_acepta_y_pass_con_fallos_es_fail(self):
        for value in [{},{'status':'PASS','issues':[]},{'status':'PASS','observed':'Veo la escena','issues':[{}]}]:
            with self.assertRaises(ValueError):VR.parse_review(value,'sc001')
        report=VR.parse_review({'status':'PASS','observed':'Texto cortado','issues':[{'problem':'Corte','fix':'Alejar cámara'}]},'sc001')
        self.assertEqual(report['status'],'FAIL')
    @unittest.skipUnless(shutil.which('ffmpeg'),'ffmpeg necesario')
    def test_revision_recibe_fotogramas_reales_y_cubre_cada_escena(self):
        from vs import audio_mode as AM
        with tempfile.TemporaryDirectory() as folder:
            video=Path(folder)/'video.mp4'
            subprocess.run(['ffmpeg','-y','-v','error','-f','lavfi','-i','testsrc2=size=160x240:rate=12:duration=2','-c:v','libx264',str(video)],check=True)
            p={'settings':{},'outputs':{'video':str(video)},'qa':{'status':'PASS','checks':[]}}
            plan={'scenes':[{'id':'sc001','start_s':0,'end_s':1,'narration_exact':'Primera escena'},{'id':'sc002','start_s':1,'end_s':2,'narration_exact':'Segunda escena'}]}
            calls=[]
            def reviewer(sheet,prompt,model,cancel):
                self.assertTrue(sheet.read_bytes().startswith(b'\xff\xd8'));calls.append(prompt)
                return {'status':'PASS','observed':'Se ve el patrón de prueba sin recorte','issues':[]}
            with patch.object(AM,'current_plan',return_value=plan):
                report=VR.run(p,folder,reviewer=reviewer,log=lambda _:None)
                second=VR.run(p,folder,reviewer=reviewer,log=lambda _:None)
            self.assertEqual(report['scenes_reviewed'],2);self.assertEqual(len(calls),2)
            self.assertTrue(all(s['cached'] for s in second['scenes']))
            self.assertTrue(all(len(s['sample_times'])==3 and len(s['image_sha256'])==64 for s in report['scenes']))
    def test_workflow_visual_contiene_entrada_de_imagen(self):
        info={'TextGenerate':{'input':{'optional':{'image':['IMAGE']}}}}
        with patch.object(VR.comfy_api,'object_info',return_value=info),patch.object(VR.comfy_api,'list_models',return_value=['visual.safetensors']),patch.object(VR,'upload_sheet',return_value='viralstudio-review/test.jpg'),patch.object(VR.comfy_api,'run',return_value={'4':{'text':['{"status":"PASS","observed":"Vista","issues":[]}']}}) as run:
            value=VR.vision('sheet.jpg','Verifica','visual.safetensors')
        workflow=run.call_args.args[0]
        self.assertEqual(workflow['3']['inputs']['image'],['2',0]);self.assertEqual(workflow['2']['class_type'],'LoadImage')
        self.assertEqual(value['status'],'PASS')
    def test_parches_de_escenas_conservan_audio_tiempos_y_escenas_correctas(self):
        from vs import audio_mode as AM,audio_storyboard as SB
        plan={'scenes':[{'id':'sc001','start_s':0,'end_s':1,'narration_exact':'Primero','camera':{'shot':'closeup'}},
                        {'id':'sc002','start_s':1,'end_s':2,'narration_exact':'Segundo','camera':{'shot':'wide'}}],
              'units':[],'visual_bible':{}}
        original=copy.deepcopy(plan)
        p={'settings':{},'outputs':{},'visual_review':{'scenes':[{'scene':'sc001','status':'FAIL','issues':[{'problem':'cortado','fix':'alejar'}]}]}}
        def edit(plan,sid,fields):next(s for s in plan['scenes'] if s['id']==sid).update(fields)
        with patch.object(AM,'current_plan',return_value=plan),patch.object(SB,'llm_prompt',return_value='catálogo'),patch.object(SB,'edit_scene',side_effect=edit),patch.object(llm,'generate',return_value='{"patches":[{"scene_id":"sc001","fields":{"camera":{"shot":"wide"}}}]}'),patch.object(AM,'save_plan') as save:
            VR.repair_failed(p,'folder',log=lambda _:None)
        fixed=save.call_args.args[1]
        self.assertEqual(fixed['scenes'][1],original['scenes'][1]);self.assertEqual(fixed['scenes'][0]['narration_exact'],'Primero')
        self.assertEqual(fixed['scenes'][0]['camera']['shot'],'wide')


class RemotePipeline(unittest.TestCase):
    def test_idempotencia_y_guia_persistida(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'VS_DATA':folder}):
            cfg={'input_mode':'audio','animation_guidance':{'profile':'x','title':'X','markdown':'Mismos colores.'}}
            a=pipeline.create(cfg,request_id='same_request_123456789');b=pipeline.create(cfg,request_id='same_request_123456789')
            self.assertEqual(a['id'],b['id']);self.assertEqual(len(pipeline.list_all()),1)
            self.assertEqual(pipeline.load(a['id'])['settings']['animation_guidance']['markdown'],'Mismos colores.')
            with self.assertRaises(ValueError):pipeline.create({**cfg,'format':'horizontal'},request_id='same_request_123456789')
    def test_no_se_encola_dos_veces_el_mismo_proyecto(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'VS_DATA':folder}),patch.object(pipeline,'_ensure_worker'):
            proj=pipeline.create({'input_mode':'audio'})
            pipeline.run(proj['id'],['transcribe'])
            with self.assertRaises(ValueError):pipeline.run(proj['id'],['transcribe'])
            pipeline._state.pop(proj['id'],None)
            pipeline._jobs.get_nowait()
