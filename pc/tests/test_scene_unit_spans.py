import sys
from pathlib import Path
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'ComfyUI-ViralStudio'))
from vs import audio_storyboard as SB, semantic_guardrails as SG

class SceneUnitSpans(unittest.TestCase):
    def test_validated_choices_pass_guard_and_scene_assembly(self):
        for indices in ([0], [0, 1], [0, 1, 2], [0, 2], ['0']):
            with self.subTest(indices=indices):
                size = int(indices[-1]) + 1
                words = [{'id': f'w{i}', 'text': f'palabra{i}', 'start_s': i * 2, 'end_s': i * 2 + 1} for i in range(size)]
                units = [{'text': w['text'], 'word_ids': [w['id']], 'start_s': w['start_s'], 'end_s': w['end_s']} for w in words]
                bible = {'characters': [], 'backgrounds': [{'id': 'room', 'asset_id': 'room_asset'}]}
                lib = {'characters': {}, 'backgrounds': {'room_asset': {'name': 'Room'}}}
                choices = [{'units': indices[:], 'template': 'ambient', 'background': 'room'}]
                self.assertTrue(SB.validate_choices(choices, units, words, bible, lib))
                with patch.object(SG, 'negative_entities', wraps=SG.negative_entities) as negative:
                    SG.enforce_choices(choices, units, bible, lib, ' '.join(w['text'] for w in words))
                self.assertEqual(negative.call_args.args[0], ' '.join(w['text'] for w in words))
                scene = SB._scene_from_choice(0, choices[0], units, words, bible, lib)
                self.assertEqual(scene['units'], [0, size - 1])
                self.assertEqual(scene['word_ids'], [w['id'] for w in words])
                self.assertEqual(scene['narration_exact'], ' '.join(w['text'] for w in words))
                self.assertEqual(choices[0]['units'], indices)
