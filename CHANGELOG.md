# 1.2.1 · Formularios originales disponibles al abrir la PC

- La pantalla de creación carga el catálogo original localmente cuando Colab no está configurado o no responde.
- Se mantienen los formularios de tema, guion, audio, estilos y ajustes de la interfaz original.
- El panel de conexión comienza plegado para dejar visible la aplicación.
- 21 pruebas del cliente y revisión superadas, incluidas apertura sin conexión y recursos originales.

# 1.2.0 · PC + Colab y revisión visual · 2026-10-27

- Interfaz original servida en localhost, motor remoto protegido con llave Bearer.
- Guías Markdown por perfil, instantáneas verificadas por proyecto y lista base de calidad.
- Cola SQLite persistente, solicitudes idempotentes, audio local y descarga de resultados aprobados.
- Revisión de tres fotogramas por escena con Qwen3.5 4B mediante ComfyUI.
- Reparación dirigida de escenas fallidas y máximo de dos correcciones por ejecución automática.
- Libreta autocontenida actualizada, modelo visual opcional en instalación y almacenamiento en Drive activado por defecto.
- Guía de inicio y validación en LEEME_PC_COLAB.md y VALIDACION_PC_COLAB.md.

---

# CHANGELOG — ViralStudio Pro

## [Pro 1.1] — 26-oct-2026 · Guion/Tema con el motor ilustrado: personajes y animales detectados del texto

### Nuevo
- **«Mi guion → video» y «Tema → video» con el motor ilustrado** (el de los videos estilo «la paloma»), elegible en
  *Crear → Animación* y activo por defecto en los proyectos nuevos. Etapas `story → voice → narration → plan → music →
  build → render → qa`: las voces de las escenas se unen en una pista continua, cada palabra del guion (texto exacto)
  recibe su tiempo, y el plan, el render y la QA son los del modo audio.
- **Animales**: `engine/63_vector_creatures.js`, con 6 rigs paramétricos articulados (cuadrúpedo, ave, pez,
  pulpo/calamar/medusa, insecto, serpiente/gusano/caracol) y poses puras deterministas, y `vs/assets/species.json`,
  con **99 especies** (es/en; frases como «oso polar», «serpiente de cascabel») → rig + parámetros + hábitat natural.
  Se regenera con `tools/make_species.py`.
- **Personas por rol** (`vs/cast.py`): 32 roles con su aspecto (bata, estetoscopio, corona, capa, cascos, gorras,
  sombreros, gorro de chef, birrete, casco de astronauta, gafas, barba, corbata, placa, delantal, moño). Género por
  artículo o terminación; **nombres propios** unidos al personaje de la misma frase («la vaca Lola», «Luna, la gata»).
- **13 escenarios nuevos** (`engine/64_vector_worlds2.js`): bosque, selva, sabana, granja, casa, desierto, nieve/polo,
  fondo marino, playa, río/estanque, cielo, noche y jardín macro. 18 en total.
- **Diseño de personajes por LLM** (`vs/creature_design.py`) para animales que el catálogo no tiene. Se valida la
  palabra literal del texto, el rig, los enums, los rangos y los colores; se usan los rigs genéricos `creature_<rig>_v1`.
- Planificador: verbos nuevos (corre, vuela, nada, ladra/ruge/canta…); el **sujeto** de cada verbo es el personaje
  nombrado justo antes; si se nombran varios lugares gana el hábitat del protagonista; acciones equivalentes cuando un
  rig no tiene la pedida (un pez «camina» nadando).
- Studio: tarjeta *Animación* con vista previa en vivo del motor ilustrado. Los proyectos ilustrados de guion/tema
  usan la vista del modo audio: forma de onda, texto narrado, storyboard editable, re-render por escena, QA y biblia
  con rol y nombre.
- `tools/demo_guion_a_video.py`, `tests/test_script_vector.py` (12 pruebas, incluido un render real) y
  `README_GUION_ILUSTRADO.md`.

### Corregido
- **Colab: «La transcripción falló … for s in segs»**. CTranslate2 (faster-whisper) no encontraba las librerías
  CUDA/cuDNN instaladas por pip. Ahora el worker recibe `site-packages/nvidia/*/lib` en `LD_LIBRARY_PATH`; si la GPU
  falla, se repite en CPU (también si el proceso muere sin traza); se libera la VRAM de ComfyUI antes de transcribir; y
  el error `ASR_FAILED` muestra la línea que explica el motivo, no el principio de la traza.
- Pelo largo que parecía una barba → mechones detrás de los hombros.
- La paloma ya vuela (aleteo, patas recogidas).
- Detectados al probar: todos los cuadrúpedos compartían el id `quadruped_01`; «sábana» (cama) ganaba a «sabana
  africana»; «la gata duerme» creaba al durmiente humano; un nombre se unía a un personaje de otra frase; faltaba el
  peso de progreso de la etapa `narration` (fallo visto en la prueba de interfaz).

### Compatibilidad
- Los proyectos antiguos sin `engine` siguen con el motor clásico, sin cambios. Para un proyecto nuevo con el motor
  clásico: *Animación → Clásico* (`engine: "classic"`).
- *Mi audio → video* no cambia: el audio del usuario nunca se re-sintetiza (el validador solo admite TTS cuando
  `narration_source = tts_script`).

## [Pro 1.0] — 26-oct-2026 · Modo «Mi audio → video» y motor vectorial

Base: `ViralStudio_completo` recibido el 25-oct-2026 (commit `3e925b3`, rama `backup/original`; copia del ZIP en
`backups/ViralStudio_original.zip`, SHA-256 `bcd4b49c…d9f6`). Nada del producto anterior se eliminó.

### Nuevo
- **Tercer modo de creación** «🎧 Mi audio → video» junto a «Tema → video» y «Mi guion → video».
- **Ingesta segura** (`vs/audio_ingest.py`): validación por decodificación (ffprobe/FFmpeg, sin shell), SHA-256, original
  intacto con nombre generado, master PCM 48 kHz + análisis 16 kHz, forma de onda, silencios, límites de tamaño y
  duración, subida en streaming con tope, renombres atómicos, MP4/MOV → extracción de audio.
- **ASR local** (`tts_worker/asr_worker.py`, `vs/asr.py`): faster-whisper con `word_timestamps=True` y VAD Silero,
  WhisperX y pyannote Community-1 opcionales con *fallback* limpio, caché por hash, palabras dudosas `needs_review`,
  transcripción manual con tiempos estimados (marcada), corrección de texto que conserva tiempos.
- **Línea de tiempo absoluta** (`vs/audio_timeline.py`): partición contigua de [0, duración] en frames enteros
  (`frame_count = ceil(dur·fps)`), cortes con anticipación entre palabras, mover cortes sin tocar la voz, validador
  del contrato `audio_scene_plan v1`.
- **Storyboard** (`vs/audio_storyboard.py`): biblia visual persistente (ids estables), planificador determinista por
  reglas y planificador LLM con JSON **validado** (unidades consecutivas, enums, ids de catálogo, rótulos literales,
  cifras dichas); edición por escena solo de lo visual; versiones del plan en `plan/versions/`.
- **Catálogo de assets** (`vs/assets/library.json`, `vs/visual_assets.py`) con versión, hash, procedencia y licencia.
- **Motor vectorial SVG** (`engine/60…75_*.js`, namespace `VSV`, convive con el motor Canvas `VS`): 6 rigs articulados,
  5 escenarios por capas 2.5D, 7 props, 12 infografías, cámara con foco por parte del cuerpo y profundidad de campo,
  subtítulos palabra a palabra estilo explicativo, **zonas seguras** (ningún texto sale del cuadro).
- **Compilador** (`vs/vector_compiler.py`): una composición HyperFrames por escena → render y caché por escena.
- **Etapas del modo audio** (`vs/audio_mode.py`): transcribe → plan → music → build → render → qa, sin etapa de voz;
  mezcla `build_audio_mode_tracks()` con la narración original continua (bit a bit en PCM), música con *ducking* y SFX
  solo opt-in; exportables (original, master, mezcla, transcripción, storyboard, biblia, manifiestos).
- **QA del modo audio** (`vs/qa_audio_mode.py`): frames exactos, duración, continuidad de la voz por correlación
  cruzada (lag y deriva en ms), partición, TTS no usado, assets, transcripción, fotogramas por escena (no negros, con
  movimiento), zonas seguras en Chromium; capturas en `out/qa_frames/`.
- **API** (`vs/server_audio.py`) y **UI** (`studio/audio.js`): subida con progreso, forma de onda con escenas y cortes
  arrastrables, transcripción editable, tabla de storyboard con re-render de una escena, vista previa en vivo, QA, biblia.
- **Esquemas versionados**: `docs/schemas/scene.v2.schema.json` y `audio_scene_plan.schema.json` (el v1 legacy no cambia).
- **Doctor/Colab**: `doctor.audio_mode_checks()` distingue crítico/opcional; la celda de Colab añade opciones
  `ASR_WHISPERX` y `DIARIZACION_PYANNOTE` y muestra el estado del modo audio. Notebook regenerado.
- `requirements-audio.txt` (versiones probadas), `run_local.sh`, `tools/safe_zone_check.js`.
- Pruebas: `tests/test_audio_mode.py` (39 pruebas, incluidas ASR real y E2E de render) y fixture sintético documentado;
  suite completa 66/66 OK.
- `EJEMPLO_AUDIO_A_VIDEO/` (2 videos renderizados con su audio, plan, SRT, QA y capturas), `QA_REPORT.md`, `ARCHIVOS_TOCADOS.md`.

### Cambiado (compatibles hacia atrás)
- `vs/pipeline.py`: `input_mode` (`topic|script|audio`) con deducción para proyectos antiguos sin reescribirlos;
  orden de etapas por modo; el modo audio nunca ejecuta `voice` (si se pide, se ignora).
- `vs/server.py`: crear proyectos `input_mode=audio` sin tema/guion; opciones del modo audio en `/api/options`.
- `vs/config.py`: ajustes `audio_*`, `asr_*`, `diarization`.
- `vs/manifest.py`: manifiestos v2 para el modo audio (escenas, clips con clave de caché, licencias sin TTS).
- `vs/doctor.py`, `studio/app.js` (selector de modo, delegación al modo audio), `studio/app.css`, `studio/index.html`.
- `colab/setup_cell.py`, `colab/build_notebook.py`, `colab/ViralStudio_Colab.ipynb`.

### Migración
- Proyectos existentes: siguen igual (sin `input_mode` → `script` si tienen guion, si no `topic`).
- No hay que migrar datos; el modo audio guarda sus artefactos en carpetas nuevas del proyecto
  (`audio/`, `transcript/`, `plan/`, `out/export/`).
- Vuelta atrás: `git checkout backup/original` o el ZIP de `backups/`.

### Corregido durante el desarrollo (detectado por las pruebas)
- La subida a estéreo de una voz mono atenuaba −3 dB → ahora `pan` explícito (la voz es bit a bit la original).
- Un filtro SVG en una línea vertical (caja de ancho 0) la hacía invisible → la línea guía usa halo por trazo.
- «una cámara» se interpretaba como la cifra 1 → los artículos no son cifras.
- Textos largos (cifras enormes, palabras largas) podían salir del cuadro → ajuste automático + verificación.
- El color de piel/pelo de una persona cambiaba entre escenas → apariencia fijada por `character_id` en la biblia.
- Mover un corte dejaba acciones ancladas a palabras fuera de su escena → se reasignan a la escena de su palabra.
- Suelo de la plaza con profundidades incoherentes (banda plana al hacer zoom) → perspectiva coherente.

### 1.1.1 RC (26 de octubre de 2026) — parche experimental de coherencia
- Guardrails semánticos de noche/hábitat/época/atributos narrados y QA explícita de acciones no dibujables.
- Control de cámara para evitar zooms gigantes de peces y cuadrúpedos.
- Gata blanca sin rayas conforme al guion; regresiones de Luna y tiburones.
- Multiplicadores numéricos «400 millones» y sustitución de contadores automáticos por palabras narradas.
- Informe incluido: `AUDITORIA_Y_PARCHE_SEMANTICO_26OCT2026.md`.
- Limitaciones abiertas: acciones de contacto físico, escenas 3D históricas, QA multimodal post-render.
