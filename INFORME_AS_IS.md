# INFORME_AS_IS — Viral Studio (respuesta a la Ampliación V3, §1 y P0)

Fecha: 25-oct-2026. Autor: Claude Code, en un contenedor Linux **sin GPU** (4 CPU, 16 GB, Node 22, FFmpeg 6.1, Python 3.13).
Regla aplicada: **VERIFICADO** = lo ejecuté y hay evidencia. **HIPÓTESIS** = razonado, sin prueba. Nada más se da por hecho.

---

## 1. Qué inspeccioné y qué no pude inspeccionar

| Fuente | Estado |
|---|---|
| Todo el código del sistema (`ComfyUI-ViralStudio/`, `colab/`) | Inspeccionado completo. Copia de seguridad del estado anterior: `backups/ViralStudio_antes_P0_V3.zip` |
| Salida de tu celda de Colab (instalación correcta) y tu captura del error 403 | Leídas (las pegaste en el chat) |
| Registros de tu runtime (`/content/comfyui.log`), `nvidia-smi`, puertos, cabeceras de la respuesta 403 | **No disponibles**: tu runtime no es accesible desde aquí |
| `doctor_startup.py` de la V3 | Leído (solo lectura, peticiones locales). Su lógica se integró en `vs/services.py status/report` con los puertos reales |

## 2. Arquitectura REAL encontrada (antes de este cambio)

```
Colab ─ un proceso: ComfyUI :8188 (127.0.0.1)
          ├─ nodos de ComfyUI (VS_StoryWriter, VS_Narrator, VS_MakeVideo)
          ├─ rutas /viralstudio/* (Studio web + API)  ← el orquestador vivía DENTRO de ComfyUI
          └─ hilo de trabajos (guion → voz → música → montaje → render → QA)
               ├─ subproceso de voz (venv /content/vs_tts: Qwen3-TTS / Kokoro + faster-whisper)
               ├─ subproceso HyperFrames 0.8.193 (Node + Chrome headless) → MP4 por capítulo
               └─ FFmpeg (mezcla, unión, QA)
Acceso: proxy de Colab → https://8188-<runtime>.prod.colab.dev/viralstudio/
```
Consecuencias: si ComfyUI caía, caía el Studio; un trabajo a medias se perdía de la cola en memoria al reiniciar; el único
camino de acceso era el proxy de Colab.

## 3. Lo que arrancó y lo que no, en tu Colab (evidencia: la salida de tu celda)

| Nivel (V3 §9) | Componente | Resultado |
|---|---|---|
| 1 · proceso | GPU RTX PRO 6000 Blackwell 96 GB, torch 2.11 cu130 sm_120 | ✅ |
| 1 · proceso | ComfyUI (1016 nodos) con el nodo Viral Studio cargado | ✅ |
| 2 · API local | `GET 127.0.0.1:8188/viralstudio/api/health` respondió (el doctor imprimió todas sus filas) | ✅ |
| 2 · API local | Nodos de guion y música presentes; Qwen3.8 y ACE-Step instalados; módulos de voz OK | ✅ |
| 3 · acceso externo | `https://8188-…prod.colab.dev/viralstudio/` en el navegador → **HTTP ERROR 403** | ❌ |

**Conclusión verificada:** el motor y la API local estaban sanos; lo que falló fue **solo el acceso externo** (nivel 3).

## 4. El 403: raíz verificada vs. hipótesis

- **Verificado:** el 403 ocurre en el nivel 3. El código de Viral Studio solo devuelve 403 ante un intento de salir de la
  carpeta de un proyecto (`_safe_join`), que no aplica a `/viralstudio/`.
- **Hipótesis A (la más probable):** el proxy de Colab autentica con la sesión/cookies de Google del navegador; al abrir el
  enlace en otra pestaña, con otra cuenta, en ventana privada o con cookies de terceros bloqueadas, responde 403. Hay
  documentación de terceros que describe ese comportamiento ([cellucid](https://cellucid.readthedocs.io/en/latest/user_guide/python_package/e_jupyter_hooks/03_supported_environments_matrix.html),
  [DEV Community](https://dev.to/amarrella/how-to-run-and-serve-a-webserver-in-google-colab-without-ngrok-5a8a)); no encontré
  una confirmación oficial de Google para este mensaje exacto.
- **Hipótesis B (menos probable):** el filtro de origen de ComfyUI responde 403 vacío cuando `Origin` ≠ `Host` en local.
  No aplica a abrir la página (una navegación GET no envía `Origin`), pero sí podría afectar a las llamadas POST de la API.
- **Qué faltaría para confirmarla:** las cabeceras de la respuesta 403 (DevTools → Red) y `comfyui.log` de ese momento.

**La corrección no depende de cuál de las dos sea:** el túnel evita el proxy de Colab (A), y la puerta reescribe `Origin`
hacia el servicio local (B).

## 5. Qué cambié (P0) y cómo lo probé

Arquitectura nueva:
```
Navegador ─https─▶ túnel cloudflared ─▶ PUERTA con llave :8189 ─┬─ /viralstudio/* ─▶ ORQUESTADOR :8765 (standalone.py, uno solo)
                                                              └─ resto ───────────▶ ComfyUI :8188 (opcional, VS_EMBED_STUDIO=0)
vigilante (vs.services watch): rehace la puerta y el túnel; reinicia orquestador/ComfyUI solo si su proceso MURIÓ (máx. 5/h)
```

| Pieza | Archivo |
|---|---|
| Puerta con llave: cookie httponly, 401 sin llave, 429 con 20 intentos fallidos por hora, `/__gw/healthz` público sin datos, Origin reescrito, WebSocket, Range, **502/504 diferenciados**, sin registro de accesos | `vs/gateway.py` |
| Supervisor: `services.json` (argv sin shell, env con lista blanca, puerto, salud, dependencias, política de reinicio, registro, licencia, exposición pública), instancia única por PID + puerto, no mata procesos ajenos (`PORT_BUSY`), diagnóstico por registro (OOM, ModuleNotFoundError, puerto ocupado…), salud en 3 niveles, informe redactado | `vs/services.py` |
| `/healthz` (proceso vivo) y `/readyz` (almacenamiento, ffmpeg, HyperFrames, motor; ComfyUI opcional) | `vs/server.py`, `standalone.py` |
| Diario del trabajo en `project.json` → al arrancar, lo que quedó a medias pasa a **INTERRUPTED**; botón **↻ Reanudar** sigue por las etapas que faltaban | `vs/pipeline.py`, `studio/app.js` |
| Celda de Colab: arranque ordenado y verificado, llave nueva por sesión (`/content/vs_run`, permisos 600), no reinicia servicios si hay trabajos en marcha | `colab/setup_cell.py` |
| Celda «🔗 Enlace y diagnóstico» y **celda de rescate** para tu instalación actual (sin reinstalar) | `colab/util_cell.py`, `colab/CELDA_RESCATE_acceso.py` |

### Pruebas (V3 §11) — ejecutadas aquí

| Test | Qué se hizo | Resultado |
|---|---|---|
| **T01** | Arranque limpio sin ComfyUI: orquestador sano en 1 s, `/readyz` 200 con `comfyui: false (opcional)`; puerta 1 s | ✅ VERIFICADO |
| **T02** | Segundo `up`: los 3 servicios «reutilizado», mismo PID, 1 solo proceso del orquestador. Puerto ocupado por un proceso ajeno → `PORT_BUSY` y **no se mata** | ✅ VERIFICADO (+ prueba automática) |
| **T03** | Trabajo real (voz Kokoro → render HyperFrames) a través de la puerta; se matan puerta y túnel en plena etapa de voz → el vigilante los rehace en ~2 s; el trabajo sigue con el **mismo ID** y termina | ✅ VERIFICADO (túnel **simulado** localmente, ver §6) |
| **T04** | ComfyUI apagado: el Studio funciona (modo «mi propio guion»); `/system_stats` por la puerta → **502** «ComfyUI no está escuchando (ECONNREFUSED)» | ✅ VERIFICADO |
| **T05** | Clasificación `VRAM_OOM`/`MODEL_UNAVAILABLE` con acción clara (de la V2) | ⚠️ PARCIAL: probado con mensajes simulados, no con un OOM real de GPU |
| **T12** | MP4 H.264 1080×1920 + AAC **48 kHz** (ffprobe), QA automática PASS | ✅ VERIFICADO (excepción consciente: los subtítulos están activados por defecto porque los pediste) |
| **T15** | `kill -9` al orquestador en pleno render → el vigilante lo rearranca, el trabajo queda `INTERRUPTED` con `remaining: [render, qa]`; **Reanudar** termina solo eso → QA **PASS** | ✅ VERIFICADO (+ prueba automática) |
| **T16** | Sin llave: 401 en página, API, POST de control, descarga de video y API de ComfyUI; llave mala 401; la llave no aparece en ningún registro ni en `startup_report.json`; la cookie no se reenvía a los servicios | ✅ VERIFICADO (+ prueba automática) |
| T06–T11, T13, T14 | Semántica audio→imagen, consistencia de personajes, rostro, contacto, estilos por backend, benchmarks, licencias | Ver §7 |

Pruebas automáticas: `python -m unittest discover -s tests` → **27 OK** (20 anteriores + 7 nuevas en `tests/test_startup.py`).

## 6. Bloqueos y lo que queda sin verificar

- **Túnel real (cloudflared):** en mi entorno está **prohibido abrir un túnel público** (política del contenedor). Probé todo
  con un túnel **simulado** que imita su registro. El túnel real se verifica en tu Colab: la celda imprime el enlace y
  comprueba `/__gw/healthz` desde fuera. → **PENDIENTE (P9)**.
- **Colab termina la sesión:** los procesos mueren con el runtime. Con `GUARDAR_EN_DRIVE` los proyectos sobreviven y, al
  volver a ejecutar la celda, lo que quedó a medias aparece como INTERRUPTED. No se promete funcionamiento ininterrumpido.
- **Editor de HyperFrames Studio (puerto 3002)** sigue dependiendo del proxy de Colab (P6), no pasa por el túnel.

## 7. La Ampliación V3 frente a lo que existe (sin maquillaje)

**Decisión que respeto:** pediste expresamente que **toda la animación sea HyperFrames** (ni Wan ni Z-Image). La V3 propone
además Godot, Blender, Motion Canvas, PixiJS, OpenToonz, Synfig y Manim. No instalé ni probé ninguno, así que figuran como
**NO_SUPPORTED** y no se ofrecen en la interfaz. Si quieres un segundo motor, lo integraría como adaptador con contrato de
entrada/salida y su clip de 5–10 s de evidencia, empezando por el que elijas.

**Auditoría de HyperFrames (lo que la V3 pide no suponer):** paquete npm `hyperframes@0.8.193`, licencia **Apache-2.0**
(metadatos de npm), CLI `lint / render / preview` ejecutada aquí, renders 9:16 y 16:9 verificados. **No** genera música
ni voz: la música es ACE-Step 1.5 (ComfyUI), la voz Qwen3-TTS / Kokoro; los SFX vienen de la librería incluida en el
paquete (Pixabay Content License) y de síntesis propia (`vs/audio.py`).

| V3 | Estado | Detalle |
|---|---|---|
| §2 Orquestador independiente de ComfyUI | ✅ VERIFICADO | `standalone.py` + servicios; ComfyUI opcional |
| §2 Adaptadores Godot / Blender / Motion Canvas… | ❌ NO IMPLEMENTADO | Por tu decisión «todo HyperFrames»; `render_backend` ya existe en el contrato de escena |
| §4 Perfiles de estilo | ⚠️ PARCIAL | 12 estilos con paleta, línea, luz y grano. Equivalen a: SILHOUETTE_NOIR, GRAPHIC_NOVEL (cómic), HISTORICAL_25D (sepia/pergamino), STICKMAN_CINEMATIC, DOCUMENTARY_MAPS (mapas con justificación), MINIMAL. Sin STYLIZED_3D ni biblioteca de poses por perfil |
| §5 Audio primero, evidencia por escena | ⚠️ PARCIAL | Tiempos por palabra (whisper), `visual_justification` y reglas de fidelidad (sin mapas/años/criaturas no narrados: verificado). Falta `narration_evidence_id` por entidad y la descomposición sujeto-verbo-objeto (T06) |
| §6 Acting director, IK, foot locking, visemas | ❌ NO IMPLEMENTADO | Hay poses y acciones por plano (caminar, correr, señalar, caer…), parpadeo y expresiones; no hay IK ni QA de pies/penetración |
| §7 Personajes por historia bloqueados por `character_id` | ⚠️ PARCIAL | El reparto se genera por historia (sombrero, pelo, colores) y se mantiene en el proyecto; no hay seeds separados ni QA multivista (T07/T08) |
| §8 Capas de audio y ducking | ✅ VERIFICADO | voz, SFX por causa en pantalla, música con sidechain, −14 LUFS. Foley por eventos de animación: no |
| §9–§10 Arranque, túnel, contratos de servicio | ✅ VERIFICADO (túnel real pendiente) | Este informe |
| §12 «Diagnóstico» y «reiniciar interfaz ≠ reiniciar render» | ⚠️ PARCIAL | `vs.services report` y la celda de diagnóstico; aún no es un botón dentro del Studio |
| §14 Licencias por asset (T14) | ⚠️ PARCIAL | `manifest.json` por video con modelos, SFX y tipografías; las figuras son código propio |

## 8. Vuelta atrás (rollback)

El estado anterior completo está en `backups/ViralStudio_antes_P0_V3.zip`. Dentro del código nuevo, el modo anterior se
recupera sin reinstalar: arrancar ComfyUI con `VS_EMBED_STUDIO=1` (valor por defecto fuera de la celda) vuelve a servir el
Studio dentro de ComfyUI en `/viralstudio/`.

## 9. Siguiente paso propuesto

1. Ejecuta el cuaderno nuevo (o la celda de rescate) y abre el botón **ABRIR VIRAL STUDIO** → cierra P9.
2. Primer video real con Qwen3.8 + Qwen3-TTS + ACE-Step (P2–P5 de `VERIFICADO_vs_PENDIENTE.md`), con tiempos por etapa.
3. Después, la fase P3 de la V3 (evidencia por entidad, T06) dentro de HyperFrames, salvo que decidas añadir otro motor.
