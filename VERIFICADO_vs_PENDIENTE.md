# VERIFICADO vs PENDIENTE — Viral Studio

Fecha: 25-oct-2026. Entorno donde se construyó y probó: contenedor Linux **sin GPU** (4 CPU, 16 GB RAM, Node 22, FFmpeg 6.1, Python 3.13).
Regla de la Guía Maestra V2: nada se marca "listo" sin evidencia de ejecución real.

## ✅ VERIFICADO (ejecutado aquí, con evidencia)

| # | Qué | Evidencia |
|---|---|---|
| V1 | El motor de animación (`engine/*.js`) dibuja **24 tipos de plano**, **12 estilos** (línea, títere, silueta, documental sepia, carbón, ilustrado, cómic, neón, pizarra, pergamino, minimal, terror) en **9:16 y 16:9** | Hojas de contacto renderizadas en Chromium headless; revisadas visualmente |
| V2 | **HyperFrames 0.8.193** renderiza los proyectos generados | `hyperframes lint` → 0 errores, 0 avisos; MP4 H.264 + AAC, 1080×1920 y 1920×1080 a 30 fps |
| V3 | Voz **Kokoro** en español (CPU) y **tiempos por palabra** con faster-whisper (modelo small, CPU) | `tts_worker/worker.py` ejecutado; tiempos reales palabra a palabra |
| V4 | Mezcla de audio: voz + efectos (librería Pixabay de HyperFrames) + ducking + normalización en dos pasadas | Medido en el MP4: **−14,2 LUFS**, pico **−1,5 dBTP** |
| V5 | Subtítulos karaoke sincronizados (DOM + GSAP) y SRT | 17–27 grupos por video; sin cortes en "de/la/a" (prueba automática) |
| V6 | **QA automática** del MP4 (pistas, resolución, fps, códec, duración, A/V, negros, congelados, sonoridad, voz, subtítulos, fidelidad) | Etapa QA ejecutada: todo **PASS** en la prueba de punta a punta |
| V7 | **Fidelidad narración→imagen**: mapas, años, cifras y criaturas solo si la narración los justifica; `visual_justification` por escena | Pruebas: historia doméstica → **0 mapas** (T08 de la guía); año/cifra/criatura injustificados → degradados |
| V8 | Contrato de escena compatible con `scene.schema.json` de la guía (campos requeridos, enums, sin propiedades extra) | Prueba automática `test_scene_contract_matches_v2_schema` |
| V9 | **Studio web** completo en navegador real: crear → proyecto → progreso por etapas → vista previa en vivo → MP4 → QA → aprobación | Servidor independiente (`standalone.py`) + Playwright: flujo completo sin errores de consola |
| V10 | Funciona **sin ComfyUI** (modo "mi propio guion"): voz, montaje, render, QA | Prueba de punta a punta con ComfyUI apagado; el doctor marca ComfyUI como `OPTIONAL_UNAVAILABLE` |
| V11 | Re-render parcial: un capítulo que no cambió no se vuelve a renderizar (hash del capítulo + motor) | Código en `vs/render.py`; se reutiliza `renders/part_XX.mp4` |
| V12 | Pruebas automatizadas | `python -m unittest discover -s tests` → **27 OK** (incluye E2E con `VS_E2E=1`) |
| V13 | El notebook de Colab compila y su paquete interno se extrae y pasa las pruebas | Extraído en limpio + tests OK |
| V14 | Licencias de modelos consultadas en la API de Hugging Face / npm | Ver `MODELOS_Y_LICENCIAS.md` |
| V16 | **Arranque supervisado (V3 §9)**: orquestador independiente de ComfyUI, instancia única, `/healthz` + `/readyz`, salud en 3 niveles | T01/T02/T04 ejecutados; prueba automática `tests/test_startup.py` |
| V17 | **Puerta con llave**: sin llave 401 en página, API, control y descargas; llave fuera de registros e informes | T16 ejecutado + prueba automática |
| V18 | Caída de puerta/túnel en pleno trabajo: el trabajo sigue con el mismo ID | T03 con túnel simulado |
| V19 | Reinicio del orquestador en pleno render → INTERRUPTED → **Reanudar** termina solo lo pendiente (QA PASS) | T15 ejecutado + prueba automática; botón probado en Chromium a través de la puerta |
| V15 | **En tu Colab (25-oct-2026):** GPU real RTX PRO 6000 Blackwell 96 GB, torch 2.11 cu130 con sm_120, ComfyUI con 1016 nodos y el nodo Viral Studio cargado, Studio respondiendo en `/viralstudio/`, nodos del guion y de la música presentes, Qwen3.8-27B y ACE-Step 1.5 descargados, entorno de voz con qwen_tts, faster_whisper, kokoro y torch con CUDA | Salida de la celda + doctor (`environment_report.json`); instalación en 3,3 min |

## ⏳ PENDIENTE de verificar en tu Colab con GPU (no se pudo ejecutar aquí)

| # | Qué | Por qué no se verificó | Cómo se verificará |
|---|---|---|---|
| ~~P1~~ | ✅ Verificado en tu Colab (V15). Que ComfyUI cargue el nodo y sirva `/viralstudio/` | Aquí no se instaló torch (sin GPU, y lo indicaste) | La celda imprime `[ViralStudio] Studio listo` y el doctor |
| P2 | (nodos y modelo presentes ✅; falta la primera generación) Guionista **Qwen3.8-27B** con el nodo nativo `TextGenerate` vía API | Necesita GPU y 17 GB de modelo. Los nombres de nodos/entradas (incl. `sampling_mode.temperature`) se tomaron del **código fuente actual de ComfyUI**, no de una ejecución | Doctor: "Nodos guion OK" + crear un video de 15 s |
| P3 | (nodos y modelo presentes ✅; falta la primera canción) Música **ACE-Step 1.5** | Ídem; el flujo copia la plantilla oficial de ComfyUI | Doctor: "Nodos música OK" + un video con música |
| P4 | Voz **Qwen3-TTS 1.7B** (diseño de voz + clonado) | Necesita GPU; la API se leyó del paquete `qwen-tts 0.1.1` | Primer video con motor Qwen3-TTS; si falla, cae a Kokoro automáticamente |
| P5 | Velocidad real en la G4 / RTX PRO 6000 y codificación NVENC (`--gpu`) | Sin GPU aquí. Aquí: ~5× tiempo real con 4 CPU | El registro muestra los segundos por capítulo; si NVENC falla, reintenta con CPU |
| P9 | **Túnel real cloudflared** en tu Colab (abrir el enlace con llave) | En mi contenedor está prohibido abrir túneles públicos; lo probé con un túnel simulado | La celda imprime el enlace y comprueba `/__gw/healthz` desde fuera |
| P10 | Causa exacta del 403 del proxy de Colab | Sin cabeceras ni registros de tu runtime; hipótesis en `INFORME_AS_IS.md` §4 | Ya no bloquea: el acceso va por el túnel |
| P6 | Abrir el Studio de HyperFrames (editor con línea de tiempo) a través del proxy de Colab | Depende del proxy de Colab | Botón "Editar en HyperFrames Studio" |
| P7 | Calidad narrativa del LLM ("brutal") | Requiere ejecutar el modelo | Revisar el storyboard antes de renderizar (botón "Solo el guion") |
| ~~P8~~ | ✅ Verificado en tu Colab (V15). Que el hardware asignado sea realmente una RTX PRO 6000 | Colab asigna según disponibilidad | La primera línea de la celda imprime la GPU real |

## ❌ NO incluido (decisión explícita)

- **Godot, Motion Canvas, PixiJS, OpenToonz, Synfig, Manim (Ampliación V3)**: NO_SUPPORTED — no instalados ni probados; no aparecen en la interfaz.
- **Blender / 3D con rigs y física**: la guía lo propone como motor 3D principal, pero pediste que **toda la animación sea HyperFrames**. Queda como backend futuro (`render_backend: "blender"` está previsto en el contrato de escena).
- **Wan / Z-Image u otros generadores de imagen o video**: excluidos a petición tuya.
- **Publicación automática**: no existe. Aprobar un video solo lo marca como `DONE`.
- **Realismo de cine**: los personajes son ilustración/animación 2D por código (palitos, títere, silueta, figura a carbón…). No se promete fotorrealismo ni calidad Pixar.

---

# ViralStudio Pro · Modo «Mi audio → video» (26-oct-2026)

Entorno: contenedor Linux **sin GPU** (4 CPU, 15 GB), Python 3.13.17, Node 22.22.0, FFmpeg 6.1.1, HyperFrames 0.8.193,
Chromium (Playwright 1243), faster-whisper 1.2.1 / CTranslate2 4.8.4 (modelo `small`, int8, CPU). Detalle y salidas: **QA_REPORT.md**.

## ✅ VERIFICADO aquí (ejecutado, con evidencia)
| # | Qué | Evidencia |
|---|---|---|
| A1 | Pruebas originales siguen pasando (27) + modo clásico de punta a punta (guion → Kokoro → render → QA PASS) | `unittest` 66 OK; proyecto clásico renderizado con QA PASS |
| A2 | Crear proyecto audio sin tema/guion; subida en streaming con tope; validación por decodificación; nombre de archivo del cliente nunca usado como ruta | pruebas `CreateTests`, `IngestTests` (HTTP real con aiohttp) |
| A3 | Transcripción REAL con faster-whisper + VAD: palabras con tiempo absoluto, idioma, confianza, palabras dudosas marcadas, audio sin habla → 0 palabras | `ASRRealTests` (fixture sintético) + narración humana real de 80 s (229 palabras, 6 marcadas) |
| A4 | Storyboard con escenas contiguas 0→ceil(dur·fps), sin huecos ni solapes, silencios dentro de una escena | `PlanTests`, QA «partición» en 3 renders |
| A5 | La voz original llega intacta: mezcla PCM **bit a bit** igual al master; en el MP4 lag 0,0 ms y r ≥ 0,999 en inicio/centro/final, deriva 0 | `test_audio_master_continuity` + QA de los renders |
| A6 | No se ejecuta TTS en modo audio (mock de `voice.synthesize` que falla si se llama) | `test_audio_mode_skips_tts` |
| A7 | Subtítulos con tiempos de palabra absolutos (sin `pre`/`gap`), ocultables | `test_audio_captions_absolute` |
| A8 | Render real MP4 1080×1920 H.264/AAC con nº de frames exacto = ceil(dur·fps) | 3 renders (23 s, 22 s, 80 s) |
| A9 | Re-render de UNA escena: solo cambia esa composición/parte; el audio no cambia | `test_rerender_single_scene` + E2E + demo |
| A10 | Determinismo: `stateAt(2.5)` idéntico tras calcular otros instantes; fotograma t=2,5 s igual en dos renders | `test_deterministic_pose`, E2E (PSNR > 40 dB) |
| A11 | Plan del LLM inválido (fuera de rango, asset desconocido, cifra o rótulo inventado, JS libre) → rechazado y reglas | `test_bad_llm_plan` |
| A12 | Personajes: 6 rigs articulados (≥5 piezas), caminar/mirar/parpadear, mismo personaje idéntico en varias escenas | `EngineTests` + capturas |
| A13 | Zonas seguras: ningún texto sale del cuadro (control negativo: el motor anterior tenía 20 desbordes) | `SafeZoneTests`, QA «zonas seguras» |
| A14 | UI en navegador real: crear audio → subir → analizar → storyboard → vista previa, sin errores de consola | Playwright |
| A15 | Proyecto HyperFrames del modo audio pasa `hyperframes lint` (0 errores, 0 avisos) | lint |
| A16 | Cancelación durante ASR sin dejar transcripción a medias; reinicio → INTERRUPTED → reanudar | `test_cancel_and_interrupt_keep_project_consistent` |

## ⏳ PENDIENTE de tu Colab/GPU
| # | Qué | Por qué no aquí | Cómo verificar |
|---|---|---|---|
| PA1 | ASR `large-v3-turbo` en GPU (aquí: `small` en CPU) | sin GPU | doctor de la celda + un audio tuyo |
| PA2 | WhisperX (alineación fina) | opcional, no instalado aquí | `ASR_WHISPERX=True` en la celda |
| PA3 | Diarización pyannote Community-1 con varios hablantes reales | requiere tu token y aceptar condiciones; aquí solo se probó el *fallback* | `DIARIZACION_PYANNOTE=True` + audio con 2 voces |
| PA4 | Storyboard con el LLM (Qwen3.8 en ComfyUI) | sin ComfyUI/LLM aquí: se probó el contrato con respuestas simuladas y el planificador por reglas real | «Regenerar storyboard» con ComfyUI activo |
| PA5 | Música ACE-Step bajo una narración | sin ComfyUI; la mezcla con música se probó con un audio sintético | activar «Música» en un proyecto audio |
| PA6 | Velocidad de render en GPU | aquí ~7 s de cómputo por segundo de video (CPU) | registro de render |
| PA7 | Audios largos (10–30 min) renderizados completos | aquí: planificación de 10 min verificada (200 escenas, 0,17 s); render completo verificado hasta 80 s | un audio largo tuyo |

---

# Pro 1.1 · Guion/Tema ilustrado + animales + arreglo del ASR (26-oct-2026)

## ✅ VERIFICADO aquí
| # | Qué | Evidencia |
|---|---|---|
| B1 | Guion → voz → narración continua con el texto EXACTO del guion → plan → render → QA PASS | demo `EJEMPLO_GUION_A_VIDEO/animales` (559 frames), E2E `ScriptE2ETests`, proyecto creado desde la interfaz |
| B2 | Personajes y animales detectados del texto (99 especies, 32 roles, nombres propios, género por artículo) | `DetectionTests`, `ScriptPipelineTests`, biblia de la demo |
| B3 | Escenario natural del protagonista y escenarios nombrados (13 nuevos) | `test_script_drives_everything`, capturas |
| B4 | El verbo se aplica al personaje nombrado antes («el elefante corre») | `test_script_drives_everything` |
| B5 | Rigs de criaturas articulados (≥5 piezas), deterministas y animados | `CreatureEngineTests`, prueba de rigs (todas las especies) |
| B6 | Diseño de personajes por LLM validado (rechaza lo inventado, limita rangos) | `CreatureDesignTests` (respuesta simulada) |
| B7 | ASR: GPU que falla → reintento en CPU; mensaje con la causa real; libs CUDA de pip en `LD_LIBRARY_PATH` | `ASRFallbackTests` + ASR real forzando `cuda` sin GPU |
| B8 | Proyectos antiguos siguen con el motor clásico; «Clásico» elegible en proyectos nuevos | `test_engine_default_and_stages`, `CreateTests` |
| B9 | UI: selector de motor, vista previa ilustrada, vista de proyecto para guion, sin errores de consola | Playwright |

## ⏳ PENDIENTE de tu Colab/GPU
| # | Qué | Cómo verificar |
|---|---|---|
| PB1 | Que tu GPU de Colab transcriba con `large-v3-turbo` tras el arreglo (si no, ahora sigue en CPU sin fallar) | subir un audio en «Mi audio → video» y mirar el registro (`[asr] … (cuda)` o `repito en CPU`) |
| PB2 | Diseño de personajes y storyboard con el LLM real | guion con un animal poco común (p. ej. «un quetzal») con ComfyUI activo |
| PB3 | Voz Qwen3-TTS en el modo ilustrado | crear un guion con «Qwen3-TTS» |

