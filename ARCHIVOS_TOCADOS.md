# Archivos tocados (ViralStudio original → ViralStudio Pro)

Comparación `backup/original` (`3e925b3`) → rama `pro/audio-a-video`. **A** = añadido · **M** = modificado · **D** = borrado (ninguno).

```
A	.gitignore
A	ARCHIVOS_TOCADOS.md
A	CHANGELOG.md
A	ComfyUI-ViralStudio/docs/schemas/audio_scene_plan.schema.json
A	ComfyUI-ViralStudio/docs/schemas/scene.v2.schema.json
A	ComfyUI-ViralStudio/engine/60_vector_core.js
A	ComfyUI-ViralStudio/engine/61_vector_world.js
A	ComfyUI-ViralStudio/engine/62_vector_characters.js
A	ComfyUI-ViralStudio/engine/70_vector_infographics.js
A	ComfyUI-ViralStudio/engine/75_vector_director.js
A	ComfyUI-ViralStudio/requirements-audio.txt
A	ComfyUI-ViralStudio/run_local.sh
M	ComfyUI-ViralStudio/studio/app.css
M	ComfyUI-ViralStudio/studio/app.js
A	ComfyUI-ViralStudio/studio/audio.js
M	ComfyUI-ViralStudio/studio/index.html
A	ComfyUI-ViralStudio/tests/fixtures/README.md
A	ComfyUI-ViralStudio/tests/fixtures/make_fixture_kokoro.py
A	ComfyUI-ViralStudio/tests/fixtures/narracion_palomas.mp3
A	ComfyUI-ViralStudio/tests/test_audio_mode.py
A	ComfyUI-ViralStudio/tools/demo_audio_a_video.py
A	ComfyUI-ViralStudio/tools/safe_zone_check.js
A	ComfyUI-ViralStudio/tts_worker/asr_worker.py
A	ComfyUI-ViralStudio/vs/asr.py
A	ComfyUI-ViralStudio/vs/assets/library.json
A	ComfyUI-ViralStudio/vs/audio_ingest.py
A	ComfyUI-ViralStudio/vs/audio_mode.py
A	ComfyUI-ViralStudio/vs/audio_storyboard.py
A	ComfyUI-ViralStudio/vs/audio_timeline.py
M	ComfyUI-ViralStudio/vs/config.py
M	ComfyUI-ViralStudio/vs/doctor.py
M	ComfyUI-ViralStudio/vs/manifest.py
M	ComfyUI-ViralStudio/vs/pipeline.py
A	ComfyUI-ViralStudio/vs/qa_audio_mode.py
M	ComfyUI-ViralStudio/vs/server.py
A	ComfyUI-ViralStudio/vs/server_audio.py
A	ComfyUI-ViralStudio/vs/vector_compiler.py
A	ComfyUI-ViralStudio/vs/visual_assets.py
A	EJEMPLO_AUDIO_A_VIDEO/aranas/asset_manifest.json
A	EJEMPLO_AUDIO_A_VIDEO/aranas/audio_plan.json
A	EJEMPLO_AUDIO_A_VIDEO/aranas/capturas_qa/sc001_mid.png
A	EJEMPLO_AUDIO_A_VIDEO/aranas/capturas_qa/sc002_mid.png
A	EJEMPLO_AUDIO_A_VIDEO/aranas/capturas_qa/sc003_mid.png
A	EJEMPLO_AUDIO_A_VIDEO/aranas/capturas_qa/sc004_mid.png
A	EJEMPLO_AUDIO_A_VIDEO/aranas/capturas_qa/sc005_mid.png
A	EJEMPLO_AUDIO_A_VIDEO/aranas/capturas_qa/sc006_mid.png
A	EJEMPLO_AUDIO_A_VIDEO/aranas/hoja_de_contactos.jpg
A	EJEMPLO_AUDIO_A_VIDEO/aranas/licensing_manifest.json
A	EJEMPLO_AUDIO_A_VIDEO/aranas/make_fixture_kokoro_aranas.py
A	EJEMPLO_AUDIO_A_VIDEO/aranas/metrics.json
A	EJEMPLO_AUDIO_A_VIDEO/aranas/narracion_aranas.m4a
A	EJEMPLO_AUDIO_A_VIDEO/aranas/qa_audio_mode.json
A	EJEMPLO_AUDIO_A_VIDEO/aranas/scenes.json
A	EJEMPLO_AUDIO_A_VIDEO/aranas/storyboard.json
A	EJEMPLO_AUDIO_A_VIDEO/aranas/subtitulos.srt
A	EJEMPLO_AUDIO_A_VIDEO/aranas/transcripcion.json
A	EJEMPLO_AUDIO_A_VIDEO/aranas/video_aranas.mp4
A	EJEMPLO_AUDIO_A_VIDEO/aranas/visual_bible.json
A	EJEMPLO_AUDIO_A_VIDEO/palomas/asset_manifest.json
A	EJEMPLO_AUDIO_A_VIDEO/palomas/audio_plan.json
A	EJEMPLO_AUDIO_A_VIDEO/palomas/capturas_qa/sc001_mid.png
A	EJEMPLO_AUDIO_A_VIDEO/palomas/capturas_qa/sc002_mid.png
A	EJEMPLO_AUDIO_A_VIDEO/palomas/capturas_qa/sc003_mid.png
A	EJEMPLO_AUDIO_A_VIDEO/palomas/capturas_qa/sc004_mid.png
A	EJEMPLO_AUDIO_A_VIDEO/palomas/capturas_qa/sc005_mid.png
A	EJEMPLO_AUDIO_A_VIDEO/palomas/capturas_qa/sc006_mid.png
A	EJEMPLO_AUDIO_A_VIDEO/palomas/hoja_de_contactos.jpg
A	EJEMPLO_AUDIO_A_VIDEO/palomas/licensing_manifest.json
A	EJEMPLO_AUDIO_A_VIDEO/palomas/metrics.json
A	EJEMPLO_AUDIO_A_VIDEO/palomas/narracion_palomas.mp3
A	EJEMPLO_AUDIO_A_VIDEO/palomas/qa_audio_mode.json
A	EJEMPLO_AUDIO_A_VIDEO/palomas/scenes.json
A	EJEMPLO_AUDIO_A_VIDEO/palomas/storyboard.json
A	EJEMPLO_AUDIO_A_VIDEO/palomas/subtitulos.srt
A	EJEMPLO_AUDIO_A_VIDEO/palomas/transcripcion.json
A	EJEMPLO_AUDIO_A_VIDEO/palomas/video_palomas.mp4
A	EJEMPLO_AUDIO_A_VIDEO/palomas/visual_bible.json
M	MODELOS_Y_LICENCIAS.md
A	QA_REPORT.md
M	README.md
A	README_AUDIO_A_VIDEO.md
M	VERIFICADO_vs_PENDIENTE.md
M	colab/ViralStudio_Colab.ipynb
M	colab/build_notebook.py
M	colab/setup_cell.py
```

```
 85 files changed, 14990 insertions(+), 20 deletions(-)
```

---

# Pro 1.1 (26-oct-2026) · archivos tocados desde la entrega Pro 1.0 (`af797d8`)

A = añadido · M = modificado

```
M	CHANGELOG.md
M	ComfyUI-ViralStudio/engine/62_vector_characters.js
A	ComfyUI-ViralStudio/engine/63_vector_creatures.js
A	ComfyUI-ViralStudio/engine/64_vector_worlds2.js
M	ComfyUI-ViralStudio/engine/75_vector_director.js
M	ComfyUI-ViralStudio/studio/app.js
M	ComfyUI-ViralStudio/studio/audio.js
M	ComfyUI-ViralStudio/tests/test_audio_mode.py
A	ComfyUI-ViralStudio/tests/test_script_vector.py
A	ComfyUI-ViralStudio/tools/demo_guion_a_video.py
A	ComfyUI-ViralStudio/tools/make_species.py
M	ComfyUI-ViralStudio/tts_worker/asr_worker.py
M	ComfyUI-ViralStudio/vs/asr.py
M	ComfyUI-ViralStudio/vs/assets/library.json
A	ComfyUI-ViralStudio/vs/assets/species.json
M	ComfyUI-ViralStudio/vs/audio_mode.py
M	ComfyUI-ViralStudio/vs/audio_storyboard.py
M	ComfyUI-ViralStudio/vs/audio_timeline.py
A	ComfyUI-ViralStudio/vs/cast.py
M	ComfyUI-ViralStudio/vs/config.py
A	ComfyUI-ViralStudio/vs/creature_design.py
M	ComfyUI-ViralStudio/vs/errors.py
M	ComfyUI-ViralStudio/vs/pipeline.py
M	ComfyUI-ViralStudio/vs/qa_audio_mode.py
M	ComfyUI-ViralStudio/vs/server.py
M	ComfyUI-ViralStudio/vs/server_audio.py
M	ComfyUI-ViralStudio/vs/vector_compiler.py
M	ComfyUI-ViralStudio/vs/visual_assets.py
M	ComfyUI-ViralStudio/vs/voice.py
A	EJEMPLO_GUION_A_VIDEO/LEEME.md
A	EJEMPLO_GUION_A_VIDEO/animales/asset_manifest.json
A	EJEMPLO_GUION_A_VIDEO/animales/audio_plan.json
A	EJEMPLO_GUION_A_VIDEO/animales/guion.txt
A	EJEMPLO_GUION_A_VIDEO/animales/hoja_de_contactos.jpg
A	EJEMPLO_GUION_A_VIDEO/animales/metrics.json
A	EJEMPLO_GUION_A_VIDEO/animales/storyboard.json
A	EJEMPLO_GUION_A_VIDEO/animales/subtitulos.srt
A	EJEMPLO_GUION_A_VIDEO/animales/timed_words.json
A	EJEMPLO_GUION_A_VIDEO/animales/transcripcion.json
A	EJEMPLO_GUION_A_VIDEO/animales/video_animales.mp4
A	EJEMPLO_GUION_A_VIDEO/animales/visual_bible.json
M	MODELOS_Y_LICENCIAS.md
M	QA_REPORT.md
M	README.md
M	README_AUDIO_A_VIDEO.md
A	README_GUION_ILUSTRADO.md
M	VERIFICADO_vs_PENDIENTE.md
M	colab/ViralStudio_Colab.ipynb
M	colab/build_notebook.py
A	EJEMPLO_GUION_A_VIDEO/animales/qa_frames/ (5 capturas) y manifests/
```

```
 60 files changed, 12576 insertions(+), 953 deletions(-)
```
