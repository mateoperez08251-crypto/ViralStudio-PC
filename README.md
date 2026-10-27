# 🎬 Viral Studio — videos animados virales con IA 100 % abierta

> **Versión 1.2.1 · PC + Colab:** interfaz local, guías `.md` por tipo, cola persistente, revisión visual y correcciones acotadas. Empieza por [LEEME_PC_COLAB.md](LEEME_PC_COLAB.md). Consulta [VALIDACION_PC_COLAB.md](VALIDACION_PC_COLAB.md) para las pruebas y límites de esta entrega.

Le das un **tema** y una **duración** y te entrega el **MP4 terminado**: historia, narración, subtítulos sincronizados,
música, efectos y animación de cada escena. Sirve para Shorts/Reels/TikTok (9:16) y para YouTube (16:9), de 15 s a 30 min.

- **La animación está hecha con código por [HyperFrames](https://github.com/heygen-com/hyperframes)**, como tu video de Irena:
  personajes articulados, escenarios, mapas reales, cámaras, luces, transiciones y tipografía cinética. No usa generadores de
  imagen ni de video (ni Wan ni Z-Image).
- **Los modelos son abiertos y gratuitos**, y todos corren en tu Colab: Qwen3.8 escribe (dentro de ComfyUI), Qwen3-TTS narra,
  faster-whisper sincroniza y ACE-Step 1.5 compone la música.
- **Se instala en ComfyUI y se usa desde ComfyUI**: el Studio vive en `/viralstudio/`, hay un botón 🎬 en ComfyUI y 3 nodos para el grafo.
- **Una sola celda de Colab**: pide tu token de Hugging Face, lo instala todo y abre el Studio.

> **Nuevo en Pro 1.1 — 🎨 motor ilustrado para «Mi guion → video» y «Tema → video»:** detecta en tu texto los
> personajes y animales (99 especies, 32 roles con su aspecto, nombres propios) y los crea y anima, todo guiado por el
> guion. Ver **README_GUION_ILUSTRADO.md**.
>
> **Nuevo en ViralStudio Pro — 🎧 Mi audio → video:** sube tu narración y se anima al segundo exacto de tu voz con
> marionetas SVG articuladas, escenarios 2.5D, cámara e infografías. Guía: **[README_AUDIO_A_VIDEO.md](README_AUDIO_A_VIDEO.md)** ·
> cambios: **[CHANGELOG.md](CHANGELOG.md)** · pruebas: **[QA_REPORT.md](QA_REPORT.md)**.

> Qué está probado y qué falta por probar en tu GPU: **[VERIFICADO_vs_PENDIENTE.md](VERIFICADO_vs_PENDIENTE.md)**.
> Licencias de cada pieza: **[MODELOS_Y_LICENCIAS.md](MODELOS_Y_LICENCIAS.md)**.

---

## 1. Empezar (Google Colab)

1. Sube `colab/ViralStudio_Colab.ipynb` a Colab (Archivo → Subir cuaderno).
2. Entorno de ejecución → Cambiar tipo de entorno → **GPU G4 (RTX PRO 6000)**.
3. Ejecuta la única celda y pega tu **token de Hugging Face** cuando lo pida (https://huggingface.co/settings/tokens, permiso de lectura).
4. Al terminar aparece el botón **ABRIR VIRAL STUDIO ↗** (enlace privado con llave) y, debajo, el visor de Colab como alternativa.

### Cómo se accede (y por qué)
El proxy de Colab (`*.prod.colab.dev`) puede responder **403** al abrir el puerto en una pestaña nueva (depende de la cuenta y
de las cookies de Google del navegador). Por eso la celda abre un **túnel cloudflared** (gratis, sin cuenta) que llega **solo**
a una **puerta con llave** (`vs/gateway.py`): sin la llave del enlace no se ve ni se controla nada (401). La llave es nueva en
cada sesión de Colab; no compartas el enlace.

Servicios (todos en `127.0.0.1`, nunca en `0.0.0.0`): orquestador/Studio `8765` · ComfyUI `8188` (opcional) · puerta `8189` · túnel.
El túnel solo conecta tu navegador: si se cae, **los trabajos siguen**; un vigilante lo rehace y la celda **🔗 Enlace y
diagnóstico** te da el enlace nuevo. Si el orquestador se reinicia, lo que estaba a medias queda **INTERRUPTED** y el botón
**↻ Reanudar** sigue por las etapas que faltaban. Comandos (desde la carpeta del nodo):
`python -m vs.services status | link | restart-tunnel | report` (el informe sale sin llaves ni tokens).

¿Ya tenías la versión anterior instalada y te salió el 403? Pega en una celda nueva `colab/CELDA_RESCATE_acceso.py`:
pone la puerta y el túnel delante de tu ComfyUI sin reinstalar nada.

La primera vez tarda unos 15–25 min por las descargas (LLM 17 GB, música 10 GB, voz 9 GB). Las siguientes, unos 2 min.
Activa **GUARDAR_EN_DRIVE** para que tus proyectos sobrevivan a que se cierre la sesión.

## 2. Crear un video

**Crear** → escribe el tema → elige formato y duración → tipo de video → estilo visual → voz, subtítulos y música →
**⚡ Crear video completo**. Si prefieres revisar antes, usa **✍️ Solo el guion**: editas el storyboard escena por escena
(texto, tipo de plano, escenario, acción, objeto, transición o "✨ IA: mejorar") y luego pulsas **▶ Continuar desde el guion**.

Pestañas del proyecto:
- **Video**: el MP4 final o la **vista previa en vivo** (el motor corre en tu navegador, con voz y subtítulos, sin esperar el render).
- **QA**: control de calidad automático (resolución, fps, duración, sincronía A/V, cuadros negros, sonoridad −14 LUFS, voz,
  subtítulos y fidelidad). **Tú apruebas** el video: nunca se publica nada solo.
- **YouTube**: título, descripción con hashtags, capítulos con marcas de tiempo y etiquetas.
- **Archivos**: MP4, SRT, miniatura, `youtube.txt` y el **proyecto HyperFrames editable** (.zip).

También puedes **pegar tu propio guion**: se respeta palabra por palabra, y el plano, el escenario y la acción salen de lo que dice
cada frase.

## 3. Lo que incluye

| | |
|---|---|
| **18 tipos de video** | historia oscura, misterio, terror, true crime, curiosidades/top, ¿qué pasaría si?, ciencia, biografía, motivación, mitología, guerras, dinero, cuento infantil, noticias, historias bíblicas, tecnología/IA, fantasía, historias tipo Reddit |
| **12 estilos visuales** | cine oscuro (stickman dorado), documental sepia (siluetas estilo ARTE), ilustración a carbón noir, ilustración a color, títere de papel (stop-motion), sombras al atardecer, terror, cómic pop, neón, pizarra, pergamino, minimalista |
| **24 tipos de plano** | escena, primer plano, diálogo, enfrentamiento, multitud, de espaldas, escritorio con lámpara, viaje, peligro (la Muerte, monstruo, fantasma), revelación, retrato, año, **mapa real** con zoom, cifra, gráfico, versus, objeto, top N, cita, línea de tiempo, montaje, explosión, tipografía cinética, cierre con "Suscríbete" |
| **Personajes** | 30 acciones (caminar, correr, señalar, susto, llorar, pelear, rezar, caer…), 13 expresiones, ropa, pelo, sombreros, barba, capa y objetos en la mano; figuras de palitos con "línea viva" o figuras humanas ilustradas |
| **29 escenarios** | ciudad de noche, calle, gueto, habitación, escritorio, oficina, escuela, hospital, laboratorio, bosque, desierto, mar, **faro**, montañas, espacio, campo de batalla, castillo, ruinas antiguas, aldea, teatro, carretera, cielo, cueva, iglesia, cárcel, salón del trono, campo… con lluvia, tormenta, nieve, niebla, brasas, fuego o estrellas |
| **Cámara y montaje** | 14 movimientos (push, paneo, dolly, crash zoom, cámara en mano, holandés…), punch-in en cada palabra clave, sacudidas en los impactos, 10 transiciones (flash, whip, zoom, iris, dip, glitch, slide, fade, burn, corte), parallax, profundidad de campo |
| **Acabado** | grano de película, viñeta, claroscuro, polvo y rayas de película antigua, papel, trama de cómic, líneas de escaneo |
| **Subtítulos** | 7 estilos: viral, karaoke cinematográfico, caja de color, cine documental, tira de papel, neón, minimal |
| **Voces** | 8 narradores diseñados (épico, misterio, terror, viral, cuentacuentos, noticias, motivacional) + **clonar tu voz** con una muestra |
| **Idiomas** | español, inglés, portugués, francés, alemán, italiano |

## 4. En ComfyUI

- **Menú → Viral Studio**, el botón flotante 🎬, o la dirección `http://<comfy>/viralstudio/`.
- Nodos (categoría 🎬 Viral Studio): **VS · Escribir historia** (usa el CLIP de un LLM cargado con CLIPLoader),
  **VS · Narrar** (texto → AUDIO) y **VS · Crear video (HyperFrames)** (guion + AUDIO de música opcional → MP4).
  Hay un flujo de ejemplo en `ComfyUI-ViralStudio/workflows/`.
- Sin ComfyUI también funciona: `python standalone.py` (modo "mi propio guion").

## 5. Cómo funciona

```
Tema + duración ─► Qwen3.8 (ComfyUI · TextGenerate) ─► biblia + escenas JSON ─► validador de FIDELIDAD
      │                                                                              │
      ▼                                                                              ▼
Qwen3-TTS (diseño de voz → clonado) ─► faster-whisper (tiempos por palabra)   ACE-Step 1.5 (música)
      │                                                                              │
      └──────────────► mezcla (ducking, SFX con causa en pantalla, −14 LUFS) ◄───────┘
                                         │
             compilador ─► proyecto HyperFrames (canvas del motor + subtítulos GSAP)
                                         │
             HyperFrames render por capítulos (Chrome headless + FFmpeg) ─► MP4 ─► QA ─► tu aprobación
```

## 6. Ampliarlo (pensado para nuevas actualizaciones)

- **Estilos, voces, tipos de video y subtítulos** son JSON: crea `vs/presets/styles.mio.json` (o en `<datos>/presets/`) con
  el mismo formato y aparecen solos en el Studio.
- **Nuevos planos**: añade una función en `engine/50_shots.js` (`VS.SHOTS.mi_plano = (ctx, S) => {…}`) y su descripción en
  `vs/llm.py → SHOTS` para que el guionista pueda usarlo.
- **Nuevos escenarios / objetos**: `engine/30_world.js` (`VS.ENV`) y `engine/20_props.js` (`VS.PROPS`).
- Cada proyecto generado es un proyecto **HyperFrames estándar** con su `CLAUDE.md`: puedes abrirlo con Claude Code, Qwen Code
  o Codex y la skill `/hyperframes` para retocarlo a mano.

## 7. Pruebas

```bash
cd ComfyUI-ViralStudio
python -m unittest discover -s tests -v          # 66 pruebas (las de ASR real y render se saltan sin sus variables) (sin GPU; algunas se saltan si falta ffmpeg/node/playwright)
VS_ASR_TESTS=1 python -m unittest tests.test_audio_mode.ASRRealTests   # faster-whisper real sobre el fixture
VS_E2E=1 python -m unittest tests.test_core.E2ETests tests.test_audio_mode.E2ERenderTests   # render real HyperFrames
```

## 8. Problemas frecuentes

| Síntoma | Solución |
|---|---|
| `MODEL_UNAVAILABLE` | Vuelve a ejecutar la celda (descarga lo que falte) o cambia el LLM en Ajustes |
| `NODE_MISSING` | Tu ComfyUI es antiguo: la celda hace `git pull`; reinicia el entorno |
| `VRAM_OOM` | Elige Qwen3.5 9B o la voz Kokoro en Ajustes |
| La voz suena distinta entre videos | La voz diseñada se guarda en `<datos>/voices/`; con Drive activado se conserva entre sesiones |
| Render lento | Calidad "Estándar" en Ajustes; los capítulos que no cambian no se vuelven a renderizar |
| HTTP 403 al abrir el Studio | Usa el botón del túnel (no el enlace `*.colab.dev`); en una instalación anterior, la celda de rescate |
| 401 / pide la llave | Abre el enlace completo (lleva `?key=`) o pega la llave que mostró la celda |
| 502 «no está escuchando» | El túnel y la llave van bien; el servicio local cayó: `python -m vs.services status` |
| Trabajo INTERRUPTED | El proceso se reinició: pulsa **↻ Reanudar** (no repite lo ya hecho) |
| Colab se desconectó | Vuelve a ejecutar la celda: tus proyectos siguen en Drive (si lo activaste) y continúas desde la etapa pendiente |
