# Modelos, herramientas y licencias

Consultado el 25-oct-2026 en la API de Hugging Face y en npm. Todo es gratuito; nada requiere API de pago.

| Pieza | Para qué | Archivo / versión | Licencia | Uso comercial | Dónde corre | VRAM aprox. |
|---|---|---|---|---|---|---|
| **HyperFrames** (HeyGen) | Render HTML → MP4 (toda la animación) | `hyperframes@0.8.193` (npm) | Apache-2.0 | Sí | Node 22 + Chrome headless | — (CPU/GPU de Chrome) |
| GSAP | Línea de tiempo de animación | 3.14.2 | GSAP Standard "no charge" | Sí | Navegador | — |
| ComfyUI | Anfitrión, cola del LLM y la música, nodos | `master` (oct-2026) | GPL-3.0 | Sí | Python | — |
| **Qwen3.8-27B** | Guionista (historia, escenas) | `Comfy-Org/Qwen3.8-27B` → `text_encoders/qwen3.8_27b_w4a8.safetensors` (17,3 GB) | Apache-2.0 | Sí | ComfyUI (nodo nativo `TextGenerate`) | ~20 GB |
| Qwen3.5-9B | Guionista alternativo (más rápido) | `Comfy-Org/Qwen3.5` → `text_encoders/qwen3.5_9b_bf16.safetensors` (19,3 GB) | Apache-2.0 | Sí | ComfyUI | ~21 GB |
| **Qwen3-TTS 1.7B** VoiceDesign + Base | Voz: diseña al narrador una vez y lo clona en todo el video | `Qwen/Qwen3-TTS-12Hz-1.7B-*` (`qwen-tts==0.1.1`) | Apache-2.0 | Sí | Entorno aislado `/content/vs_tts` | ~8 GB |
| Kokoro-82M | Voz rápida / respaldo (es: em_alex, ef_dora, em_santa) | `kokoro-v1.0.int8.onnx` | Apache-2.0 | Sí | CPU (onnxruntime) | — |
| faster-whisper large-v3-turbo | Tiempos por palabra para los subtítulos | `deepdml/faster-whisper-large-v3-turbo-ct2` | MIT | Sí | Entorno aislado | ~2 GB |
| **ACE-Step 1.5 turbo** | Música original instrumental | `Comfy-Org/ACE-Step-1.5` → `checkpoints/ace_step_1.5_turbo_aio.safetensors` (10 GB) | Apache-2.0 (repack) / MIT (original) | Sí | ComfyUI (nodos nativos) | ~12 GB |
| Efectos de sonido | whoosh, impactos, pop, riser, glitch… | Librería incluida en HyperFrames | Pixabay Content License | Sí, sin atribución | — | — |
| Efectos sintetizados | trueno, latido, boom, viento, lluvia | Generados por código (`vs/audio.py`) | Propios | Sí | CPU | — |
| Natural Earth 1:110m | Contornos reales de países en los mapas | Incrustado en `engine/05_geo.js` | Dominio público | Sí | — | — |
| Tipografías | Archivo Black, League Gothic, Montserrat, EB Garamond, Playfair, Oswald | Google Fonts / incluidas en HyperFrames | SIL OFL | Sí | — | — |
| cloudflared (Cloudflare) | Túnel rápido sin cuenta para abrir el Studio fuera del proxy de Colab (solo transporte; todo pasa por la puerta con llave) | binario `2026.10.3` de GitHub Releases | Apache-2.0 (LICENSE del repo, leído el 25-oct-2026) | Sí | CPU | — |

**Orden de uso de la GPU (uno a la vez):** el LLM escribe → ComfyUI libera VRAM (`/free`) → la voz se genera en su propio proceso y termina → ACE-Step compone → ComfyUI libera → HyperFrames renderiza (Chrome + FFmpeg). En una RTX PRO 6000 (96 GB) todo cabe con holgura, pero se mantiene el orden para que también funcione con GPUs de 24 GB eligiendo el LLM de 9B.

**Clonar una voz** solo con el consentimiento de su dueño (opción "Mi voz").

## Modo «Mi audio → video» (ViralStudio Pro, 26-oct-2026)

| Pieza | Para qué | Versión | Licencia | Obligatorio | Dónde corre |
|---|---|---|---|---|---|
| **faster-whisper** (SYSTRAN) | Transcripción con tiempos por palabra + VAD Silero integrado | `faster-whisper==1.2.1`, `ctranslate2==4.8.4`; modelos `large-v3-turbo` (GPU) / `small` (CPU) | MIT (código y pesos Whisper) | **Sí** (o transcripción pegada a mano) | Entorno de voz / CPU |
| WhisperX | Alineación fina de palabras | no fijada (opcional) | BSD-2-Clause; los modelos de alineación wav2vec2 tienen su propia licencia por idioma | No | Entorno de voz |
| pyannote `speaker-diarization-community-1` | Varios hablantes | opcional | CC-BY-4.0, **requiere aceptar condiciones** en Hugging Face y `HF_TOKEN` | No (fallback: narrador único) | Entorno de voz (GPU recomendable) |
| Motor vectorial ViralStudio (`engine/60-75`) | Marionetas, escenarios 2.5D, props, infografías | 1.0.0 | Código propio (sin assets de terceros) | Sí | Navegador / HyperFrames |
| Montserrat, Oswald | Subtítulos y cifras | Google Fonts | SIL OFL | Sí | Navegador |
| Kokoro-82M (voz `em_alex`, `ef_dora`) | **Solo** para generar los audios sintéticos de prueba (`tests/fixtures`) | `kokoro-v1.0.int8.onnx` | Apache-2.0 | No (el modo audio NUNCA sintetiza voz) | CPU |

**Privacidad:** el audio del usuario se procesa en local (no se envía a servicios externos); se guarda dentro de la
carpeta del proyecto y se borra al eliminar el proyecto. En Colab el acceso al Studio pasa por la puerta con llave.
**Derechos:** el usuario declara tener derechos sobre la narración que sube. Los videos de referencia se usaron solo
como guía de estilo; ningún asset, personaje, voz ni tipografía de ellos se copió al producto.

## Pro 1.1 · motor ilustrado para guion/tema (26-oct-2026)
| Pieza | Para qué | Licencia | Obligatorio |
|---|---|---|---|
| Rigs de criaturas (`engine/63_vector_creatures.js`) y catálogo de 99 especies (`vs/assets/species.json`) | Animales del guion | Código y datos propios, dibujados por código (sin imágenes ni modelos de terceros) | Sí (modo ilustrado) |
| Escenarios nuevos (`engine/64_vector_worlds2.js`) y accesorios de rol del rig de persona | Bosque, sabana, granja, mar…; bata, corona, cascos… | Código propio | Sí |
| Diseño de personajes por LLM (`vs/creature_design.py`) | Animales fuera del catálogo | Usa el LLM que ya tienes en ComfyUI (Qwen); su salida son solo **parámetros validados** | No (sin LLM se usa el catálogo) |
| Voz del guion | Narración | La del motor elegido: Qwen3-TTS (Apache-2.0) o Kokoro-82M (Apache-2.0), como en el modo clásico | Sí |

No se añadió ninguna dependencia, modelo ni servicio externo nuevo.

