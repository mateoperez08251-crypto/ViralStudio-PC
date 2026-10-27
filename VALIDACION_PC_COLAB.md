# Actualización 1.2.1

21 pruebas de `pc/tests` superadas. Nuevas comprobaciones: carga del catálogo original sin conexión y con respuesta remota inválida, disponibilidad de HTML, motor y JavaScript originales. Sintaxis de bridge.js validada con Node. La interfaz visual no se ha comprobado en un navegador real en este entorno; la inferencia GPU sigue pendiente.

# Validación de la migración PC + Colab

Entrega 1.2.0, 27 de octubre de 2026. Base: ZIP ViralStudio 1.1.2 AntiFreeze suministrado en esta conversación.

## Resultado

65 pruebas ejecutadas: **63 superadas y 2 omitidas** por dependencias opcionales. Incluyen 19 pruebas nuevas del cliente PC, guías, reparaciones y revisión visual; los módulos existentes `test_core`, `test_direction_quality`, `test_semantic_guardrails`, `test_script_vector` y `test_startup.GatewayTests` completan la selección de regresión.

Se verificaron persistencia de guías y cola, aislamiento de contexto, instantáneas SHA-256, reenvío idempotente, reconexión, descarga, rechazo de orígenes externos, compatibilidad del motor, transferencia de audio y autenticación Bearer sin reenviar secretos al servicio interno. También se comprobaron los límites de corrección, cancelaciones, bloqueo de aprobaciones inválidas y parches visuales que conservan narración, tiempos y escenas correctas.

La prueba de imágenes utiliza FFmpeg sobre un video real generado para la prueba. Comprueba los tres fotogramas por escena y su hoja de contacto. **La respuesta del modelo visual y ComfyUI se simulan**: se verifica el grafo y que la imagen esté conectada a TextGenerate; no se ejecuta Qwen en este entorno. El servidor remoto de las pruebas de PC también es un servidor de prueba.

Se comprueban la sintaxis Python y JavaScript, las celdas de la libreta y el contenido del código incorporado. No se ejecutó una sesión de Colab, una generación completa con GPU ni el lanzador en Windows. No se hizo validación visual de la interfaz en un navegador real.

## Suite original completa

La exploración de las 93 pruebas originales dio 2 fallos, 4 errores y 5 omisiones. No se presenta esa suite como aprobada:

- Dos errores requieren `soundfile`, ausente en este entorno de comprobación.
- Un fallo requiere el navegador Chromium de Playwright, ausente en este entorno. La libreta nueva instala Playwright y Chromium para los controles de zonas seguras; esa instalación necesita validación en Colab.
- Dos errores de fixtures de AudioPipelineTests son bloqueos del control AntiFreeze original: una escena de personaje congelado. Se reprodujeron también con el código original, sin esta migración.
- Un fallo de ServicesTests espera `EXITED` y obtiene `started`; también se reprodujo en la base original. Queda pendiente corregir esa carrera del supervisor en un trabajo específico.

## Repetir la selección de pruebas

Necesita Python 3.10+, `aiohttp`, `requests`, `numpy`, `Pillow` y FFmpeg. Desde la carpeta principal:

```sh
python -m pip install aiohttp requests numpy Pillow
python -m unittest discover -s pc/tests -v
```

Para la selección existente, desde `ComfyUI-ViralStudio`:

```sh
PYTHONPATH=.:tests python -m unittest test_core test_direction_quality test_semantic_guardrails test_script_vector test_startup.GatewayTests
```

La inferencia real debe validarse con un proyecto breve: conectar el motor, generar un video, comprobar el informe visual, provocar un fallo controlado y confirmar que la corrección o el bloqueo se correspondan con las imágenes. No hay garantía de detección perfecta: se revisan tres muestras por escena.
