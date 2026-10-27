# ViralStudio PC + Colab · 1.2.2

La interfaz original se abre en tu PC. Colab ejecuta Qwen, la voz, la transcripción, la música, el render y la revisión visual. Cloudflare conecta ambos mediante HTTPS y una llave. No necesitas instalar los modelos ni ComfyUI en la PC.

La versión 1.2.1 carga los formularios originales de creación incluso sin conectar Colab: tema/prompts, guion, audio, estilos y ajustes. El panel de conexión comienza plegado para dejar visible la aplicación. Las opciones disponibles localmente no confirman que los modelos estén instalados; generar, consultar proyectos remotos y guardar ajustes del motor requiere conexión.

## Empezar

1. Extrae **todo** el ZIP en una carpeta. No ejecutes los archivos desde dentro del ZIP.
2. En Windows instala Python 3.10 o posterior y abre `pc/INICIAR_VIRALSTUDIO_PC.bat`. La primera vez descarga `aiohttp`; se abre `http://127.0.0.1:8790/viralstudio/`. En Linux/macOS: `sh pc/iniciar.sh` con Python y venv instalados.
3. Sube **la libreta nueva** `colab/ViralStudio_Colab.ipynb` a Colab, selecciona una GPU adecuada y ejecuta su instalación. Mantén `REVISION_VISUAL = True`. El revisor Qwen3.5 4B añade unos 8,7 GB de descarga a los modelos anteriores. El consumo de memoria depende de los modelos y del runtime; ComfyUI gestiona su carga.
4. `GUARDAR_EN_DRIVE = True` conserva los proyectos remotos entre sesiones. Si lo desactivas, los proyectos de ese runtime pueden perderse al terminar Colab. La cola y los resultados ya descargados siguen en la PC.
5. Al terminar Colab imprime **URL para ViralStudio PC** y **Llave para ViralStudio PC**. Pega ambas en el panel superior de la aplicación local. La URL debe ser solo `https://…trycloudflare.com`, sin `/viralstudio/` ni `?key=…`.
6. Pulsa **Guardar conexión**, **Comprobar motor** y recarga la página para cargar las opciones del motor. Después utiliza los formularios originales.

La primera instalación necesita Internet en ambos equipos. Este paquete entrega un lanzador de Python, no un instalador `.exe`. El arranque específico de Windows y la inferencia con GPU deben validarse en tus equipos.

## Guías Markdown por tipo de animación

En **Guardar guías .md por tipo de animación**, escribe un identificador como `documental_animales` y un nombre. Importa uno o varios `.md`, o escribe directamente las reglas, y pulsa **Guardar guía**. El conjunto admite hasta 24 KiB. Hay tres ejemplos en `pc/guias_ejemplo/`.

Selecciona la guía en **Guía para nuevos proyectos** antes de crear el video o enviar un lote. Cada proyecto guarda una copia y su huella SHA-256. Cambiar después el archivo no modifica los proyectos anteriores. Las llamadas de texto del proyecto reciben la guía; el revisor visual también la consulta. Además se carga siempre `ComfyUI-ViralStudio/vs/guides/razonamiento_y_calidad.md`, una lista de planificación y comprobación de resultados observables.

Describe personajes, ropa, proporciones, paleta, escenarios, posiciones, encuadre y acciones permitidas. Una guía orienta al modelo: no añade capacidades de dibujo al motor ni garantiza que el modelo cumpla todo. El sistema conserva las validaciones del catálogo y bloquea un reparto alternativo sin guía cuando falla Qwen en un proyecto guiado.

## Revisión y corrección automática

**Procesar hasta el video final automáticamente** está activado inicialmente. En modo audio comienza cuando se ha recibido el archivo. El panel permite también poner entre 1 y 100 guiones o temas en cola, separados por una línea `---`. Los lotes usan formato vertical, música desactivada y la duración orientativa elegida; usa Crear para otros ajustes.

Después del render se ejecutan los controles técnicos existentes y una revisión visual real:

- FFmpeg extrae tres fotogramas de **cada escena** al 12 %, 50 % y 88 % de su duración. Se añade el último fotograma muestreado de la escena anterior como referencia de continuidad.
- Qwen3.5 4B recibe esas imágenes mediante `LoadImage → TextGenerate`, además de lo pedido y la guía. Debe describir evidencia y devolver `PASS`, `FAIL` o `UNCERTAIN`, con defectos y cambios concretos.
- Un fallo visual puede generar parches sobre las escenas señaladas. Se mantienen la narración, los tiempos y las escenas correctas. Las escenas bloqueadas no se modifican automáticamente. Se reconstruye, renderiza y revisa de nuevo; la caché de capítulos puede reutilizar el contenido idéntico.
- Hay un máximo de **dos intentos de corrección por ejecución del trabajo**, compartido entre etapas. Un error persistente detiene el proceso. Falta de modelo, memoria insuficiente, cancelación o revisor no disponible no originan un bucle de regeneración.
- Un resultado incierto, un informe inválido o la ausencia de revisión nunca cuentan como aprobación. Los estados de QA que requieren revisión tampoco se descargan automáticamente como resultado final.

La revisión cubre muestras de todas las escenas; **no examina cada fotograma ni garantiza detectar todos los errores o evaluar todo el movimiento**. El modelo de 27B dirige y corrige; el modelo visual de 4B inspecciona las imágenes.

Cada proyecto remoto guarda `out/revision_visual/informe.json`, las hojas de imágenes examinadas y, si hubo correcciones, `out/repair_report.json`. El `proyecto.json` descargado a la PC incluye el resultado de la revisión y el historial. Los informes de imágenes quedan en el proyecto remoto.

## Cola, audio y resultados

La carpeta de datos aparece en el panel. En Windows es normalmente `%LOCALAPPDATA%\ViralStudio-PC`:

| Carpeta o archivo | Contenido |
| --- | --- |
| `guias/<tipo>/guia.md` | Guía editable de cada perfil |
| `cola.sqlite3` | Solicitudes persistentes y sus identificadores |
| `entradas/<proyecto>/` | Copias de audios enviados desde la PC |
| `resultados/<proyecto>/` | MP4, subtítulos y metadatos disponibles, y `proyecto.json` |
| `conexion.json` | URL y llave privadas de conexión |

Los envíos usan un identificador estable para que reintentar una respuesta perdida no cree otro proyecto. La cola se conserva al cerrar el programa; el procesamiento y la descarga necesitan que la aplicación local y Colab estén activos. Los audios ya recibidos en la PC se conservan para reintentar su transferencia al mismo proyecto.

Si cambia la URL de Cloudflare, guarda la nueva URL y su llave. No se transmite automáticamente una llave anterior a un destino nuevo. Si usaste Drive, puedes reencontrar los proyectos después de instalar y abrir el motor nuevo. Si desapareció el almacenamiento remoto, la cola por sí sola no puede recuperar un render que nunca se descargó.

Para quitar un trabajo todavía no enviado, pulsa **Retirar**. Para errores o revisiones pendientes, abre el proyecto en la interfaz, consulta el informe y corrige o relanza las etapas necesarias. Las descargas automáticas siguen la primera finalización satisfactoria; después de una edición manual puedes descargar desde el proyecto.

## Alcance del servicio

El túnel rápido de Cloudflare cambia de dirección y no ofrece disponibilidad garantizada. Colab debe permanecer conectado y sus recursos y sesiones son temporales. Esto no convierte Colab en un servidor permanente. Consulta las condiciones vigentes del plan: los runtimes administrados gratuitos restringen algunos usos principalmente mediante interfaces web y como workers; Colab documenta excepciones para planes de pago con unidades de cómputo positivas. No se implementa ningún mecanismo para eludir esas restricciones.

Fuentes oficiales de la integración:

- [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
- [Preguntas frecuentes de Google Colab](https://research.google.com/colaboratory/faq.html)
- [Plantilla oficial Qwen3.5 con entrada de imagen](https://github.com/Comfy-Org/Subgraph-Blueprints/blob/main/Qwen3.5%20Text%20Gen.json)
- [Modelos Qwen3.5 de Comfy-Org](https://huggingface.co/Comfy-Org/Qwen3.5)

Validación y límites de esta entrega: `VALIDACION_PC_COLAB.md`. Las auditorías anteriores del ZIP se conservan como documentación histórica.


## Guías directamente en Colab

La libreta actualizada incluye un panel **Guías .md** en la interfaz original. Está activado por defecto y funciona para tema, guion y audio. Importa uno o varios archivos (24 KiB en total por perfil), escribe el nombre y pulsa **Guardar y seleccionar guía**. Puedes editarla o descargarla desde ese panel. La selección es manual; la clasificación automática de estilos y el clip de prueba generado con la guía siguen pendientes.

Las guías se guardan en `animation_guides` dentro de la carpeta de proyectos del motor. Mantén `GUARDAR_EN_DRIVE` activado para conservarlas entre sesiones. Cada proyecto recibe una copia de la guía seleccionada. Con la función activada, debes seleccionar una guía antes de crear el video; puedes desactivarla explícitamente si quieres crear sin guía. La biblioteca local de la PC y la de Colab son independientes: puedes descargar e importar un mismo `.md` en ambas.

Para actualizar Colab, abre la libreta nueva y ejecuta la celda de instalación cuando no haya trabajos en marcha; recarga el Studio después. Esto no mantiene encendido Colab automáticamente.


## Error Cloudflare HTTP 530

Cloudflare no puede resolver el destino del túnel. Este estado no confirma que la llave sea incorrecta. Mantén Colab conectado y ejecuta la celda **Enlace y diagnóstico** con **Rehacer túnel (enlace nuevo)**. Copia la nueva URL base y llave a la PC, guarda y comprueba el motor. Si el runtime terminó, primero vuelve a ejecutar la instalación. La cola local permanece guardada; la existencia de los proyectos remotos depende de que se conserve su almacenamiento.

La celda de diagnóstico imprime ahora URL y llave por separado. El cliente distingue el error 530 de las respuestas de autenticación y conserva los trabajos pendientes al recibirlo.


## Audio: botón y estado del envío

Al pulsar Subir y analizar se muestra el paso actual: crear proyecto, enviar audio e iniciar análisis. Los fallos quedan visibles debajo del botón y se puede reintentar. Las consultas de creación y arranque esperan hasta dos minutos; la subida admite hasta quince minutos. Se conserva el identificador del intento para reutilizar el proyecto cuando se pierde una respuesta. Una transferencia guardada en la cola local se identifica como pendiente y no como audio ya verificado.

En Colab, si Aplicar guía está activado, primero importa y selecciona una guía o desactiva esa opción. El modo original analiza el audio y prepara el storyboard; después permite Renderizar video. En la PC, la opción Procesar hasta el video final automáticamente continúa las etapas. En ambos casos Colab y el túnel deben estar disponibles.
