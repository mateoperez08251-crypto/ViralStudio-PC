# 🎧 Mi audio → video (ViralStudio Pro)

Sube **tu narración** y ViralStudio la escucha, entiende qué ocurre, y la anima **al segundo exacto de tu voz** con
marionetas vectoriales articuladas, escenarios por capas (2.5D), cámara, infografías y subtítulos palabra a palabra.

> **Tu audio manda.** No se reescribe, recorta, acelera ni vuelve a sintetizar. Su duración fija la del video.
> La voz llega al MP4 **idéntica** (en PCM es bit a bit la misma; después solo pasa por el códec AAC del MP4).
> Se conserva el archivo original descargable. Música y efectos solo si los activas, y siempre por debajo de la voz.

---

## 1. Cómo se usa (Studio)

1. **Crear → 🎧 Mi audio → video.** Arrastra tu archivo: MP3, WAV, M4A, FLAC, OGG, AAC o un MP4/MOV (se extrae su
   audio). Verás la forma de onda y podrás escucharlo antes de subirlo.
2. Elige formato (9:16 · 16:9 · 1:1), idioma (o automático), estilo visual, ritmo visual, subtítulos y si quieres música/efectos.
3. **Subir y analizar.** El servidor:
   - valida el archivo **decodificándolo** con ffprobe/FFmpeg (no por la extensión), calcula su SHA-256, guarda el
     original intacto con un nombre del sistema y crea dos derivados: `analysis_16k.wav` (para el ASR) y
     `source_voice_master.wav` (48 kHz, la pista del video);
   - transcribe en local con **faster-whisper** (`word_timestamps=True`, VAD Silero) → palabras con tiempo absoluto;
     las dudosas (confianza < 0,5) quedan marcadas en naranja para revisar;
   - construye la **biblia visual** (personajes con id persistente, escenarios, props) y el **storyboard**: escenas
     contiguas que cubren exactamente [0, duración], con acciones ancladas a la palabra que las justifica.
4. **Revisa** en la vista del proyecto:
   - *Audio y línea de tiempo*: forma de onda con las escenas coloreadas; **arrastra un borde** para mover un corte
     (solo cambia la imagen; la voz no se toca).
   - *Transcripción*: clic = escuchar la palabra · doble clic = corregirla. «Editar texto» corrige frases enteras: las
     palabras iguales conservan su tiempo exacto; las nuevas heredan el hueco de las que sustituyen y quedan marcadas.
     Corregir el texto **solo** cambia los subtítulos.
   - *Storyboard*: por escena eliges plantilla, escenario, plano, movimiento de cámara, transición y la acción de cada
     personaje; ▶ reproduce el tramo; **🔁 Re-renderizar esta escena** rehace solo esa escena (las demás salen de caché).
   - *Video*: vista previa **en vivo** con el mismo motor que el render final, sincronizada con tu audio; subtítulos on/off.
5. **🎞️ Renderizar video** → MP4 H.264/AAC + QA automática + tu aprobación.
6. **Archivos**: MP4, SRT, audio original, master 48 kHz, mezcla final, transcripción JSON, storyboard, biblia visual,
   manifiesto de assets/licencias, y el proyecto HyperFrames editable (.zip).

### Sin ASR (o si prefieres tu texto)
«📋 Pegar transcripción»: los tiempos se **estiman** sobre las zonas con voz y TODO queda marcado `needs_review`
(`timing: estimated`). No se presenta como reconocimiento real.

### Audio sin habla
No se inventa narración: se crean planos de ambientación y la QA lo marca para revisión.

---

## 2. Instalación

### Colab (recomendado con GPU)
Sube `colab/ViralStudio_Colab.ipynb`, elige GPU y ejecuta la celda. faster-whisper ya se instala en el entorno de voz
(`/content/vs_tts`) con el modelo `large-v3-turbo`. Opcionales en el formulario de la celda:
`ASR_WHISPERX` (alineación fina) y `DIARIZACION_PYANNOTE` (varios hablantes; requiere aceptar las condiciones de
`pyannote/speaker-diarization-community-1` con tu token). El doctor final lista qué es **CRÍTICO** y qué es **opcional**.

### Local (Linux/macOS, CPU o GPU)
Requisitos: Python ≥ 3.10, Node 22, FFmpeg ≥ 6, Chrome/Chromium (HyperFrames lo gestiona).

```bash
cd ViralStudio/ComfyUI-ViralStudio
./run_local.sh                      # crea .venv, instala requirements-audio.txt y hyperframes@0.8.193, arranca el Studio
# abre http://127.0.0.1:8765/viralstudio/
```
Equivalente manual:
```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-audio.txt
mkdir -p ../.viralstudio_tools && echo '{"name":"viralstudio-tools","private":true}' > ../.viralstudio_tools/package.json
(cd ../.viralstudio_tools && npm install hyperframes@0.8.193)
VS_TTS_PYTHON=$PWD/.venv/bin/python VS_HF_BIN=$PWD/../.viralstudio_tools/node_modules/.bin/hyperframes \
  .venv/bin/python standalone.py --port 8765
```
En CPU el ASR usa `small` int8 automáticamente si el modelo configurado es `large-*` (ajuste `asr_cpu_downgrade`).
Dentro de ComfyUI el Studio se sirve igual en `/viralstudio/` (el nodo se carga como antes).

### Ajustes (pestaña Ajustes o `settings.json`)
| clave | por defecto | qué hace |
|---|---|---|
| `audio_max_mb` / `audio_max_seconds` | 500 / 1800 | límites de subida (se cortan en streaming) |
| `audio_allow_video` | true | aceptar MP4/MOV y extraer su audio |
| `asr_model` | (vacío = `whisper_model`) | modelo faster-whisper o ruta CT2 |
| `asr_vad`, `asr_vad_min_silence_ms` | true, 500 | VAD Silero (offsets siempre absolutos) |
| `asr_align` | auto | `whisperx` si está instalado; si no, tiempos de faster-whisper |
| `asr_device`, `asr_compute_type` | auto | `cuda/float16` o `cpu/int8` |
| `diarization` | false | pyannote Community-1 (si falta token/paquete → narrador único, sin error) |

Opciones del proyecto: `preserve_original_audio`, `captions` (`explainer`/`none`), `music`, `sfx`, `visual_style`,
`pace_visual` (`calmo`/`normal`/`rapido`), `storyboard_mode` (`auto`/`manual`), `asset_mode`, `format`, `fps`,
`audio_loudnorm` (ganancia lineal a −14 LUFS; desactivado por defecto para conservar el nivel original).

---

## 3. API (`/viralstudio/api/...`)
| método | ruta | qué hace |
|---|---|---|
| POST | `projects` con `{"settings":{"input_mode":"audio",…}}` | crea el proyecto (sin tema ni guion) |
| POST | `projects/{pid}/audio` (multipart `file`) | sube y valida la narración (streaming, tope de bytes, nombre generado) |
| GET | `projects/{pid}/audio` | metadatos, forma de onda, transcripción, plan, URLs |
| POST | `projects/{pid}/audio/analyze` | encola transcribe + plan (`force_transcribe`, `replan`, `language`, `diarize`) |
| PATCH | `projects/{pid}/transcript` | `{"text": …}` o `{"words": {"w0003": "texto"}}` |
| POST | `projects/{pid}/transcript/manual` | transcripción pegada (tiempos estimados) |
| PATCH | `projects/{pid}/storyboard` | `{"scene_id", "fields"}` · `{"cuts": {"sc004": 12.3}}` · `{"bible": …}` |
| POST | `projects/{pid}/storyboard/regenerate` | rehace el storyboard (conserva la biblia; versiona el anterior) |
| GET | `projects/{pid}/audio/preview` | datos del motor para la vista previa en vivo |
| POST | `projects/{pid}/audio/render` | music + build + render + qa |
| POST | `projects/{pid}/scenes/{sid}/rerender` | cambia una escena y re-renderiza solo esa |
| POST | `projects/{pid}/cancel` · `resume` | cancelar / reanudar (etapas que faltaban) |

---

## 4. Cómo funciona por dentro
```
audio ─► audio_ingest (ffprobe, sha256, master 48k, análisis 16k, forma de onda, silencios)
      ─► asr (faster-whisper + VAD; WhisperX/pyannote opcionales; caché por hash+parámetros)
      ─► audio_timeline (unidades por frase/pausa, cortes con anticipación, frames enteros, partición 0→ceil(dur·fps))
      ─► audio_storyboard (biblia visual + reglas o LLM con JSON VALIDADO; el LLM nunca da tiempos ni JS)
      ─► vector_compiler (una composición HyperFrames por escena; motor engine/60-75 SVG; subtítulos por palabra)
      ─► render por escena con caché ─► concat + mezcla (voz original continua) ─► MP4 ─► qa_audio_mode
```
- **Tiempo absoluto**: cada escena dibuja `VSV.film(...).render(inicio_escena + t_local)`; el frame del segundo 2,5
  es idéntico se renderice suelto o en el proyecto completo. Sin `Math.random`, `Date.now` ni rAF en el render.
- **Rigs** (piezas con pivote propio, jerárquicas): paloma (14), persona (25; variantes hombre/mujer/niño/mayor),
  durmiente de perfil (8), araña cenital (21: 8 patas con rodilla), gato (13), ojo en primer plano (6). Acciones: caminar (con la cabeza de la
  paloma estabilizada de verdad), mirar, parpadeo determinista, hablar, señalar, sorpresa, saludar, pensar, sentarse,
  respirar/roncar, bajar por el hilo, saltar, picotear…
- **Escenarios por capas** con profundidad: plaza al atardecer, dormitorio de noche, espacio/nebulosa, parque, estudio.
  Parallax por capa, seguimiento del personaje que camina, profundidad de campo en primeros planos.
- **Infografías**: contador con unidad, ×N, número neón, tipografía cinética, documento, etiqueta con flecha, ondas,
  anillo de foco, línea guía, cuenta atrás, balanza, tira de meses. Solo con palabras/cifras **dichas**.
- **Zonas seguras**: todo texto (subtítulos, rótulos, contadores, títulos) se mide con la tipografía real y se ajusta
  para no salir del cuadro; la QA lo comprueba en Chromium (`tools/safe_zone_check.js`).

## 5. Añadir assets propios
`<datos>/assets/library_mio.json` amplía el catálogo (mismo formato que `vs/assets/library.json`); el dibujo se añade en
`engine/6x_*.js` registrando `VSV.RIGS.<builder>` / `VSV.WORLDS` / `VSV.PROPS` y su id en `VSV.CHAR_ASSETS` etc.
Cada asset lleva versión, hash, procedencia y licencia en `asset_manifest.json`.

## 6. Problemas frecuentes
| síntoma | causa / solución |
|---|---|
| `ASR_FAILED … libcublas / cuDNN / CUDA failed` (Colab) | desde Pro 1.1 el worker añade las librerías CUDA de pip a `LD_LIBRARY_PATH` y, si la GPU falla, repite en CPU automáticamente; el mensaje muestra la causa real |
| `MODEL_UNAVAILABLE … faster-whisper` | instala `faster-whisper soundfile` en el Python de `VS_TTS_PYTHON`, o pega la transcripción |
| 413 al subir | supera `audio_max_mb` |
| «no contiene ninguna pista de audio» / «en silencio» | el archivo no tiene audio audible (se rechaza sin tocar el proyecto) |
| Muchas palabras en naranja | audio con música fuerte, ruido o acento: corrígelas (doble clic) o usa un modelo mayor en GPU |
| Varios hablantes y todo sale como «narrador» | falta `pyannote.audio` o `HF_TOKEN`/condiciones aceptadas: es el comportamiento previsto (fallback) |
| Render lento | en CPU ~7 s por segundo de video; en GPU usa `VS_GPU_ENCODE=1`; solo se re-renderizan las escenas que cambian |
| Trabajo INTERRUPTED | ↻ Reanudar: sigue por las etapas que faltaban |
