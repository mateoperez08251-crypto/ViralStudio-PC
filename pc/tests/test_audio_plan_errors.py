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

class AudioJsonRepair(unittest.TestCase):
    def call(self, responses, cancel=None):
        from vs import llm
        words = [{'id': 'w1', 'text': 'hola'}]
        units = [{'word_ids': ['w1'], 'start_s': 0, 'end_s': 3, 'text': 'hola'}]
        bible = {'characters': [], 'backgrounds': [{'id': 'room'}]}
        with patch.object(llm, 'generate', side_effect=responses) as generate:
            result = SB.llm_choices(units, words, bible, {}, lib={'characters': {}}, log=lambda _: None, cancel=cancel)
        return result, generate

    good = '{"scenes":[{"units":[0],"template":"ambient","background":"room"}]}'
    broken = '{"scenes":[{"units":[0] "template":"ambient","background":"room"}]}'

    def test_repairs_missing_comma_and_validates(self):
        result, generate = self.call([self.broken, self.good])
        self.assertEqual(result[0]['background'], 'room')
        self.assertEqual(generate.call_count, 2)
        self.assertIn(self.broken, generate.call_args.args[0])
        self.assertIn("Expecting ',' delimiter", generate.call_args.args[0])
        self.assertEqual(generate.call_args.kwargs['temperature'], 0.1)

    def test_valid_json_needs_no_repair(self):
        _, generate = self.call([self.good])
        self.assertEqual(generate.call_count, 1)

    def test_repaired_syntax_does_not_bypass_catalog(self):
        with self.assertRaisesRegex(SB.TL.PlanError, 'escenario no registrado'):
            self.call([self.broken, self.good.replace('room', 'inventado')])

    def test_only_one_format_repair(self):
        with self.assertRaisesRegex(SB.TL.PlanError, 'incluso tras reparar'):
            self.call([self.broken, self.broken])

    def test_cancel_before_repair(self):
        with self.assertRaises(VSError) as caught:
            self.call([self.broken], cancel=lambda: True)
        self.assertEqual(caught.exception.code, 'CANCELLED')
