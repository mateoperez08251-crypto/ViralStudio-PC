# ViralStudio 1.1.2 — parche preventivo AntiFreeze (NO motor 3D)

## Qué cambia
- `vs/audio_storyboard.py`: no arrastra `walk`/`run`/`talk` de escenas anteriores.
- `engine/75_vector_director.js`: los beats de locomoción tienen inicio/duración/final; no se simula caminar con solo movimiento de cámara; el personaje no vuelve de golpe a su punto inicial.
- `vs/direction_quality.py` (nuevo): control de acciones imposibles, personaje congelado, cámara sin acción, tomas repetidas, desplazamiento insuficiente y ausencia de actividad narrativa.
- `vs/audio_mode.py` / `vs/server_audio.py`: preflight tras generar plan, tras editar storyboard, antes de construir y antes de renderizar. Los errores se registran en `plan/quality_gate.json`. Por defecto bloquea exportaciones claramente incoherentes.
- `studio/audio.js`: banner con estado y motivos; el botón Render se desactiva cuando hay `FAIL` en modo estricto. Casilla para configurar el control al crear un proyecto.
- `tests/test_direction_quality.py`: cinco pruebas nuevas de regresión.

## Uso
1. Conserva una copia de la versión anterior y de los proyectos antes de actualizar.
2. Copia `ComfyUI-ViralStudio` del ZIP a la instalación y reinicia ComfyUI.
3. **Regenera el storyboard.** Los proyectos con planes cacheados de 1.1 no se actualizan automáticamente.
4. Revisa el aviso de dirección antes de renderizar. La información detallada queda en `plan/quality_gate.json`.
5. Si falta un rig/acción, hay que aportarlo o cambiar el diseño visual de la toma. No existe un botón que convierta la biblioteca SVG en escenas 3D cinematográficas.
6. `professional_gate=false` es solo para depuración. Permite exportar tomas que seguirán teniendo problemas visuales; no equivale a aprobación de calidad.

## Validación (local)
`python -m unittest tests.test_script_vector tests.test_semantic_guardrails tests.test_direction_quality`

23 tests OK, 1 E2E omitido sin VS_E2E; sintaxis Python/JS verificada. **No se ha validado render completo de un nuevo video con esta versión.**

Consulta `PLAN_RECONSTRUCCION_3D_PROFESIONAL.md` para construir el motor que realmente corresponde al nivel solicitado.
