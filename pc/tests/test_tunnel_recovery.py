import sys
from pathlib import Path
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'ComfyUI-ViralStudio'))
from vs import services

class TunnelRecovery(unittest.TestCase):
    def test_no_recupera_url_anterior_al_ultimo_arranque(self):
        log='https://vieja.trycloudflare.com\n===== hoy arranque de tunnel =====\niniciando'
        with patch.object(services,'log_tail',return_value=log):
            self.assertIsNone(services.tunnel_url())
        with patch.object(services,'log_tail',return_value=log+'\nhttps://nueva.trycloudflare.com'):
            self.assertEqual(services.tunnel_url(),'https://nueva.trycloudflare.com')
    def test_reutilizar_proceso_recupera_su_url_actual(self):
        state={'public_url':'https://vieja.trycloudflare.com','external':{'ok':True}}
        with patch.object(services,'read_pid',return_value=123),patch.object(services,'pid_alive',return_value=True),patch.object(services,'healthy',return_value=True),patch.object(services,'tunnel_url',return_value='https://nueva.trycloudflare.com'):
            self.assertEqual(services.start({'id':'tunnel','url_from_log':True},state,lambda _:None),'reused')
        self.assertEqual(state['public_url'],'https://nueva.trycloudflare.com')
        self.assertNotIn('external',state)
    def test_detener_tunel_descarta_enlace_y_verificacion_viejos(self):
        state={'public_url':'vieja','external':{'ok':True}}
        with patch.object(services,'read_pid',return_value=None),patch.object(services.os,'remove'):
            services.stop('tunnel',state)
        self.assertNotIn('public_url',state)
        self.assertNotIn('external',state)
