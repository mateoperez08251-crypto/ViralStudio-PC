import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'ComfyUI-ViralStudio'))
from vs import audio_storyboard as SB, quality_repair as QR
from vs.errors import VSError

class AudioPlanErrors(unittest.TestCase):
    def invoke(self, error, cfg):
        with patch.object(SB.VA, 'library', return_value={}), patch.object(SB.TL, 'units_from_words', return_value=[{'word_ids': ['w1']}]), patch.object(SB, 'build_bible', return_value={}), patch.object(SB, 'llm_choices', side_effect=error), patch.object(SB, 'rule_choices') as fallback:
            try:
                SB.plan_from_transcript({'words': [{'id': 'w1', 'text': 'hola'}]}, {'duration_s': 3}, cfg, log=lambda _: None)
            finally:
                fallback.assert_not_called()

    def test_validation_detail_reaches_repair(self):
        cfg = {'design_characters': False, 'animation_guidance': {'profile': 'animacion'}, 'pc_max_repairs': 2}
        ctx = SimpleNamespace(cancel_flag=lambda: False)
        error = SB.TL.PlanError('escena 2: escenario no registrado plaza')
        with tempfile.TemporaryDirectory() as folder, self.assertRaisesRegex(SB.TL.PlanError, 'escenario no registrado plaza'):
            QR.execute('plan', {'settings': cfg}, ctx, lambda _: self.invoke(error, cfg), lambda _: None, folder, lambda _: None)
        self.assertIn('escenario no registrado plaza', cfg['_repair_feedback'])
        self.assertEqual(ctx.repair_used, 2)

    def test_fatal_errors_are_not_retried(self):
        for error in (VSError('MODEL_UNAVAILABLE', 'LLM ausente'), RuntimeError('CUDA out of memory'), RuntimeError('Cancelado')):
            cfg = {'design_characters': False, 'animation_guidance': {'profile': 'animacion'}, 'pc_max_repairs': 2}
            ctx = SimpleNamespace(cancel_flag=lambda: False)
            with tempfile.TemporaryDirectory() as folder, self.assertRaises(type(error)) as caught:
                QR.execute('plan', {'settings': cfg}, ctx, lambda _: self.invoke(error, cfg), lambda _: None, folder, lambda _: None)
            self.assertIs(caught.exception, error)
            self.assertEqual(getattr(ctx, 'repair_used', 0), 0)
