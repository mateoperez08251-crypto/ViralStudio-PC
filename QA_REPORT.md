# QA_REPORT — ViralStudio Pro · Modo «Mi audio → video»

Fecha: 26-oct-2026. Rama `pro/audio-a-video` (base intacta en `backup/original`).
**Regla aplicada:** solo se marca como verificado lo que se ejecutó aquí y dejó evidencia. «Código escrito» ≠ «modelo
instalado» ≠ «video verificado»; cada estado se indica por separado.

## 1. Entorno real de las pruebas
| | |
|---|---|
| Máquina | contenedor Linux, **sin GPU**, 4 CPU, 15 GB RAM |
| Software | Python 3.13.17 · Node v22.22.0 · FFmpeg 6.1.1 · HyperFrames 0.8.193 (npm, Apache-2.0) · Chromium (Playwright build 1243) |
| ASR | faster-whisper 1.2.1 + CTranslate2 4.8.4 · modelo **`small` int8 en CPU** (en GPU/Colab se usa `large-v3-turbo`) |
| No disponible aquí | GPU/CUDA, ComfyUI + LLM Qwen, ACE-Step, WhisperX, pyannote (ver §7) |

## 2. Pruebas automáticas
`VS_ASR_TESTS=1 VS_E2E=1 python -m unittest discover -s tests -v` → **Ran 66 tests · OK · 0 omitidas** (377 s).
Salida completa: `logs/pruebas_completas.txt` (en la carpeta de entrega).

| Bloque (04_PRUEBAS_Y_ENTREGA) | Pruebas | Resultado |
|---|---|---|
| 1 crear proyecto audio sin tema; tema/guion como antes; proyectos antiguos sin `input_mode` | `CreateTests` (4, incl. HTTP real) | ✅ |
| 2-3 subida válida (sha256, mismos bytes, 48k/16k) · rechazo de corrupto, sin pista, silencio, demasiado largo/grande, *path traversal* | `IngestTests` (4) + HTTP | ✅ |
| 4-5 ASR real con tiempos absolutos, idioma, palabras clave, pausa sin palabras · audio sin habla | `ASRRealTests` (2) + `ASRUnitTests` (5) | ✅ |
| 6 línea de tiempo sin huecos (0→ceil(dur·fps)), silencios dentro de escena, sin habla → ambientación | `PlanTests` | ✅ |
| 7 el modo audio NO ejecuta TTS (mock de `voice.synthesize` que falla si se llama) | `test_audio_mode_skips_tts` | ✅ |
| 8 continuidad de la voz (mezcla bit a bit; lag/correlación; control negativo de 120 ms detectado; con música) | `test_audio_master_continuity` | ✅ |
| 9 subtítulos con tiempos absolutos de palabra, sin `pre`/`gap`; ocultables | `test_audio_captions_absolute` | ✅ |
| 10 re-render de una escena (solo cambia su composición; audio igual; versión anterior guardada) | `test_rerender_single_scene` + E2E | ✅ |
| 11 plan del LLM malo (fuera de rango, asset desconocido, hueco, cifra/rótulo inventado, JS libre, vacío) | `test_bad_llm_plan`, `test_plan_validator_rejects` | ✅ |
| 12 pose determinista `stateAt(2.5)`; rigs articulados que se mueven; parpadeo; mirar; misma apariencia por personaje | `EngineTests` (5) | ✅ |
| 13 render HyperFrames real: frames exactos, voz continua, PSNR t=2,5 s entre 2 renders > 40 dB, re-render parcial | `E2ERenderTests` | ✅ |
| 14 regresión del modo clásico (27 pruebas originales + E2E clásico) | `test_core`, `test_startup` | ✅ |
| 15 Colab/doctor: notebook incluye el modo audio; doctor distingue crítico/opcional | `ColabTests` (2) | ✅ (estructura; la ejecución en Colab está PENDIENTE) |
| extra: zonas seguras con textos extremos en 9:16, 16:9 y 1:1 | `SafeZoneTests` | ✅ |
| extra: cancelación durante ASR / reinicio → INTERRUPTED → reanudar | `test_cancel_and_interrupt_keep_project_consistent` | ✅ |

## 3. Renders reales (MP4 verificados)
| Video | Entrada | Duración | Escenas | Frames | Voz original en el MP4 | QA |
|---|---|---|---|---|---|---|
| `EJEMPLO_AUDIO_A_VIDEO/palomas/video_palomas.mp4` | MP3 sintético (Kokoro) | 22,996 s | 6 | **690 = ceil(22,996×30)** | lag 0,0 ms · r = 1,0 en 0,5/10/19,7 s · deriva 0 | **PASS** |
| `EJEMPLO_AUDIO_A_VIDEO/aranas/video_aranas.mp4` | M4A sintético (Kokoro) | 22,229 s | 6 | **667** | lag 0,0 ms · r = 1,0 · deriva 0 | **PASS** |
| `PRUEBA_PRIVADA_tu_narracion_palomas/video.mp4` (carpeta de entrega, fuera del ZIP) | **MP4 de tu referencia de palomas: voz humana real con música** → audio extraído | 79,937 s | 16 | **2399** | lag 0,0 ms · r = 0,9999 / 1,0 / 0,9994 · deriva 0 | **REVIEW** (solo por 6 palabras dudosas marcadas) |
| Modo clásico (guion → Kokoro → render) | texto | 12,1 s | — | — | — | **PASS** (−14,2 LUFS) |

Tiempos en CPU (palomas): ingesta 0,4 s · ASR 9,7 s · plan < 0,1 s · montaje 0,7 s · render 176 s · QA 17,6 s.
Referencia 80 s: ASR 28,8 s · render 640 s (~8 s de cómputo por segundo de video en esta CPU).

Comprobaciones de la QA por render (todas sobre el **MP4 final**): pistas, resolución, fps, códec, duración, A/V,
negros, congelados, sonoridad (informativa), subtítulos, nº exacto de frames, duración del audio (Δ ≤ 1 frame + relleno
AAC), video cubre todo el audio, **continuidad de la voz**, partición de escenas, TTS no usado, transcripción, assets
con licencia, **zonas seguras** (20/21/63 instantes revisados en Chromium), escenas no negras, **animación visible**.
Capturas por escena (inicio/medio/fin) en `capturas_qa/` y hojas de contacto `hoja_de_contactos.jpg`.

### G · Determinismo (dos renders completos independientes, sin caché)
Fotogramas en 0,5 s · 2,5 s · 11,5 s · 22,5 s → **MSE = 0,0 (idénticos píxel a píxel)** en los 4 instantes.
Tolerancia documentada para el test automático: PSNR > 40 dB (por si otro códec/hardware introdujera diferencias).

### F · Re-render de una sola escena
Cambio de cámara en `sc002` → solo `part_sc002.mp4` se recodificó (47 s frente a 176 s del render completo);
`mix.wav` con el mismo SHA-256; la versión anterior del plan quedó en `plan/versions/`.

### C · La voz importada queda intacta
- En PCM, la mezcla es **bit a bit igual** al master (los dos canales), con 4 ms de silencio añadido al final para
  completar el último frame. (Esta prueba detectó y se corrigió un −3 dB del *upmix* mono→estéreo de FFmpeg.)
- En el MP4 (AAC 256 kb/s) la correlación con el original es ≥ 0,999 y el desfase 0,0 ms al inicio, centro y final.
- Control negativo: un retraso artificial de 120 ms se detecta como 120 ms (la medida no es complaciente).

## 4. Interfaz (navegador real, Playwright/Chromium)
- Crear → «Mi audio → video» → subir MP3 (forma de onda local) → analizar → proyecto con 6 escenas y 58 palabras.
- Doble clic en una palabra → corregida; tiempos y escenas sin cambios.
- Arrastrar el borde de una escena en la forma de onda → corte movido (3,433 → 3,667 s), partición intacta.
  (Esta prueba detectó un fallo: las acciones ancladas a palabras quedaban fuera de su escena; corregido y cubierto.)
- Vista previa en vivo con subtítulos on/off (11 → 0 grupos). **0 errores de consola.**

## 5. Zonas seguras (petición del 26-oct)
Todo texto (subtítulos, contador, ×N, número neón, tipografía cinética, documento, etiquetas, balanza) se mide con la
tipografía real y se reduce si no cabe; los subtítulos se limitan a 2 líneas dentro del 88 % del ancho; las etiquetas
se recolocan dentro del margen. Verificación automática en Chromium (`tools/safe_zone_check.js`) incluida en la QA.
**Control negativo:** con los mismos textos extremos, el motor anterior producía 20 desbordes; el actual, 0.

## 6. Calidad visual (revisión manual de fotogramas)
Revisé hojas de contacto y fotogramas sueltos de los 3 renders comparándolos con tus 4 referencias:
- ✔ Subtítulos arriba, palabra a palabra, pasadas atenuadas, recuadro azul con tiradores en palabras clave.
- ✔ Paloma ilustrada con cuello iridiscente y plumas en escamas; cabeza que **realmente** se queda quieta en el mundo
  mientras el cuerpo avanza (con la línea guía dorada), plaza con capas, soportales, farolas y adoquines en perspectiva;
  primeros planos con desenfoque de fondo.
- ✔ Durmiente de perfil, manta azul, araña que baja por su hilo hasta la boca, «8 arañas al año», ondas, documento.
- ✔ El mismo personaje conserva diseño y colores entre escenas (se detectó y corrigió un cambio de piel/pelo).
- ✖ No es idéntico a las referencias: las ilustraciones originales tienen más detalle a mano (texturas, sombras
  pintadas, más tipos de plano por historia). El sistema compone y anima una **biblioteca** de assets propios; las
  historias cuyos sujetos no están en la biblioteca usan infografías/tipografía (honestamente marcado), no imágenes falsas.

## 7. Pendiente (no se pudo ejecutar aquí)
| | Motivo | Cómo verificarlo en tu Colab |
|---|---|---|
| ASR `large-v3-turbo` en GPU | sin GPU | doctor de la celda + un audio tuyo |
| WhisperX | opcional, no instalado | `ASR_WHISPERX=True` |
| pyannote con varios hablantes reales | requiere tu token y aceptar condiciones (aquí solo el *fallback*) | `DIARIZACION_PYANNOTE=True` |
| Storyboard con el LLM real (Qwen3.8) | sin ComfyUI aquí; contrato probado con respuestas simuladas | «Regenerar storyboard» con ComfyUI |
| Música ACE-Step bajo la narración | sin ComfyUI; la mezcla con música se probó con audio sintético | activar «Música» |
| Render de audios de 10–30 min | aquí: plan de 10 min (200 escenas) en 0,17 s; render completo verificado hasta 80 s | un audio largo tuyo |

## 8. Cómo reproducir
```bash
cd ComfyUI-ViralStudio
python -m unittest discover -s tests -v
VS_ASR_TESTS=1 VS_E2E=1 python -m unittest discover -s tests -v
python tools/demo_audio_a_video.py tests/fixtures/narracion_palomas.mp3 /tmp/demo --asr-model small --determinism --rerender-scene sc002
```
(con `VS_HF_BIN` apuntando a `hyperframes` y `VS_TTS_PYTHON` al Python con faster-whisper; ver README_AUDIO_A_VIDEO.md)

---

# Pro 1.1 · Guion/Tema con el motor ilustrado (personajes y animales del texto) + arreglo del ASR en Colab

## A. Pruebas automáticas
`VS_ASR_TESTS=1 VS_E2E=1 python -m unittest discover -s tests -v` → **Ran 81 tests · OK · 0 omitidas** (381 s;
salida completa en `logs/pruebas_completas.txt` de la entrega). Nuevas:

| Bloque | Pruebas | Qué demuestran |
|---|---|---|
| Pipeline guion → ilustrado | `ScriptPipelineTests` (3) | motor ilustrado por defecto en proyectos nuevos (los antiguos siguen con el clásico); narración = texto EXACTO del guion; plan válido; personajes, nombres y escenarios naturales; «el elefante corre» se asigna al elefante; renderizar no rehace la narración (no se pierden correcciones) |
| Detección | `DetectionTests` (5) | catálogo de 99 especies completo (rig, ≥5 piezas, hábitat existente); frases «oso polar» / «serpiente de cascabel»; «se llama» y «pata» no crean animales; roles + género + nombres; «la gata duerme» no crea al durmiente; «Luna» (nombre) no es la luna |
| Diseño por LLM | `CreatureDesignTests` (2) | palabras que no están en el texto, rigs inexistentes, enums inválidos y claves extra se descartan; números limitados; el plan usa el personaje diseñado |
| Motor | `CreatureEngineTests` + `test_rigs_have_articulated_parts_and_motion` | 8 criaturas de rigs distintos: mismo t → mismo estado; se mueven; las 99 especies tienen ≥5 piezas que se mueven |
| ASR en Colab | `ASRFallbackTests` (3) | proceso que muere en GPU (cuDNN) → se repite en CPU; el error muestra «RuntimeError: Library libcublas.so.12…» en vez de la traza; `LD_LIBRARY_PATH` incluye `nvidia/*/lib` |
| E2E | `ScriptE2ETests` | render HyperFrames real de un guion con perro, abeja y tiburón → QA PASS, «narración = guion» PASS, zonas seguras PASS |

Además se ejecutó el ASR real forzando `device=cuda` en esta máquina sin GPU: CTranslate2 falla con
«CUDA driver version is insufficient», se repite en CPU y salen las 58 palabras.

## B. Renders reales
| Video | Entrada | Duración | Escenas | Frames | QA |
|---|---|---|---|---|---|
| `EJEMPLO_GUION_A_VIDEO/animales/video_animales.mp4` | guion de 52 palabras, voz Kokoro | 18,627 s | 5 | **559 = ceil(18,627×30)** | **PASS** (narración = guion; desfase 0,0 ms; r = 1,0) |
| Proyecto creado desde la **interfaz** (paloma, perro, doctora Ana, cocodrilo, pulpo) | guion pegado en «Mi guion → video» | 16,111 s | 6 | 484 | **PASS** (21 comprobaciones) |
| `ScriptE2ETests` | perro, abeja, tiburón | — | 3 | exactos | **PASS** |

Tiempos en CPU (demo de 18,6 s): guion + voz Kokoro + narración + plan ≈ 20 s · render 116 s · QA 14 s.

## C. Interfaz (Chromium real)
- Crear → «Mi guion → video» → *Animación: Ilustrado* (vista previa en vivo del motor) → pegar guion → «Crear video
  completo» → el proyecto avanza por Guion → Voz → Narración → Storyboard → Música → Montaje → Render → QA ✅.
- Vista del proyecto: forma de onda con 6 escenas, texto narrado, storyboard editable, biblia («doctor_01 · rol doctor ·
  woman · «Ana»»). **0 errores de consola**.
- Esta prueba encontró un fallo que las pruebas unitarias no cubrían (faltaba el peso de progreso de la etapa
  `narration`) y quedó corregido.

## D. Revisión visual
Galerías renderizadas en Chromium de las 99 especies, los 32 roles y los 18 escenarios. Corregido tras revisarlas:
- tamaño de insectos y lagartos (tamaño normalizado por alto o ancho);
- mariposa (alas de dos lóbulos que se pliegan);
- mono y canguro (postura inclinada y brazos);
- pelo largo que parecía barba;
- mosquito volando fuera del cuadro;
- ala de la paloma que bajaba en lugar de subir al volar.

Sin resolver: en el modo ilustrado una escena muestra hasta 2 personajes y el segundo va más al fondo. Algunas especies
poco comunes se parecen a su «familia».

## E. Pendiente de tu Colab
| Qué | Por qué no aquí |
|---|---|
| El arreglo del ASR **en tu GPU** de Colab | aquí no hay GPU: se verificó el reintento en CPU y la ruta de librerías, no que tu cuDNN concreto cargue. Si aún falla, el mensaje dirá la causa exacta y la transcripción seguirá en CPU |
| Diseño de personajes y storyboard con el LLM real (Qwen) | sin ComfyUI aquí; contrato probado con respuestas simuladas |
| Voz Qwen3-TTS para el guion | aquí se usó Kokoro; el modo ilustrado usa el mismo `voice.synthesize` que el clásico |
