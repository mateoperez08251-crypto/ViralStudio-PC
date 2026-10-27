# ViralStudio Pro 1.1 — Auditoría comparativa + parche experimental de coherencia

Fecha: 26 de octubre de 2026. Versionado del archivo corregido: **1.1.1 RC (parche, NO solución definitiva)**.

## Evidencia estudiada

- `tiburones-mas-antiguos-que-los-arboles.mp4`: 50,367 s; H.264, AAC, 1080 × 1920, 30 fps.
- `la-noche-en-que-toby-encontro-a-luna.mp4`: 52,833 s; H.264, AAC, 1080 × 1920, 30 fps.
- Base técnica: `ViralStudio_Pro_1.1_2026-10-26.zip`, carpeta `ComfyUI-ViralStudio`.
- Método: extracción visual de fotogramas de ambos videos cada 2,5 segundos y contraste con los guiones aportados; inspección de motores JS y planificadores Python. **No se afirma haber inspeccionado visualmente la totalidad de los ~3.100 fotogramas.**

## Errores visibles confirmados

| ID | Severidad | Video / tramo aproximado | Hallazgo | Causa probable identificada |
|---|---|---|---|---|
| V01 | Crítica | Tiburones, 0–5 s | Tiburón sobre paisaje terrestre con sol y árboles | Fijación de entorno por palabras «árboles» sin comprender «antes» |
| V02 | Crítica | Tiburones, 5–10 s | Humanos sobre campo moderno para hablar de tiempo prehistórico | Recurso persona activado fuera de su época; falta de validación cronológica |
| V03 | Grave | Tiburones, 7,5–17,5 s | Contadores próximos a 1.000.000 en vez de 400 millones | Parser numérico y elección de superposición inadecuados |
| V04 | Grave | Tiburones, 17,5–30 s | Tiburón y dinosaurio se representan simultáneamente aunque faltaba mucho para la aparición de dinosaurios | No se entiende el evento negado/futuro; arrastre automático de personaje anterior |
| V05 | Grave | Tiburones, 20–27,5 s | Animal crece y tapa al otro, casi saliéndose del marco | Tamaño de rig calculado según fracción de altura, sin límite según su anchura real; zoom acumulativo |
| V06 | Crítica | Tiburones, 32,5–45 s | Humanos y tiburón superpuestos en composición absurda | Planificador asume copresencia sin validar hábitat y simultaneidad |
| V07 | Grave | Tiburones, gran parte | Mismo tiburón sobre fondos repetidos mientras se narra evolución | No hay animación para transformación histórica ni cambio geológico específico |
| V08 | Grave | Tiburones, 45–50 s | Cierre con personajes genéricos sin relación directa con el dato | Detección de nombres y relleno no fundamentado |
| V09 | Crítica | Toby, 0–7,5 s | Se narra 3:00 a. m. pero el jardín está a plena luz del día | El horario se trata como palabra local, no propiedad persistente del relato |
| V10 | Crítica | Toby, 7,5–12,5 s | Sale un durmiente humano en lugar del perro en el pasillo | Palabras «cama»/«dormía» activan un asset humano genérico |
| V11 | Grave | Toby, 15–22,5 s | Ana y Toby no ejecutan físicamente todos los eventos de ladrido/encender/abrir | Verbos flexionados no representados; biblioteca de acciones insuficiente |
| V12 | Crítica | Toby, 27,5–35 s | Luna está gris y atigrada pese a la descripción «gata blanca» | `cat_rig_v1` dibuja gris y rayas sin usar atributos narrativos |
| V13 | Grave | Toby, 25–37,5 s | Patio soleado durante supuesto rescate nocturno | Ausencia de continuidad temporal y decorado nocturno específico |
| V14 | Grave | Toby, 30–37,5 s | Luna no parece temblar ni Toby aproximarse y darle calor de forma convincente | Rigs básicos sin coreografía de interacción ni frío |
| V15 | Grave | Toby, 40–42,5 s | Ana no carga a Luna en brazos | El rig persona no implementa interacción `pick_up` con el rig gato |
| V16 | Grave | Toby, 45–50 s | Reaparece un durmiente humano o cama gigante que eclipsa la acción | Actor espurio y escala/foco descontrolados |
| V17 | Grave | Toby, 50–52,8 s | No se observa el acto de dormir juntos representado claramente | Falta pose `lie_down/cuddle` sincronizada entre dos rigs |
| V18 | General | Ambos | Grandes intervalos con personajes apenas móviles y paneos/zooms genéricos | Motor de animación 2D + fallback `idle` en verbos no soportados |
| V19 | General | Ambos | Transiciones y tamaños distraen más de lo que cuentan | Cámara configurada con 2,5× en closeup y enfoques no sujetos a límites de encuadre |
| V20 | General | Ambos | La QA técnica puede aprobar audio/frames con historia incoherente | Verificador orientado a audio, cuadros negros y metadatos, no al significado visual |

## Fallos arquitectónicos detectados

1. **Planificación lexical en lugar de causal:** `vs/audio_storyboard.py` busca nombres, verbos y fondos por palabra; no tiene una representación completa de sujeto → acción → objeto → lugar → tiempo.
2. **Biblia visual incompleta:** persistencia de IDs, pero colores de animales no se extraían del guion, y el gato rig original siempre añadía rayas.
3. **Múltiples detectores de nombres ambiguos:** «Tierra», «amiga», «cama» pueden crear personajes incorrectos.
4. **Negaciones y cronología:** se muestran elementos que el guion menciona precisamente para indicar que todavía no existen.
5. **Datos numéricos:** multiplicadores «400 millones» mal interpretados al mezclarse cifras y palabras.
6. **Cámara sin bounding-box:** el tamaño del actor no garantizaba que su silueta completa cupiera; efectos de entrada y zoom agravan el desborde.
7. **Acciones ausentes:** el sistema no puede dibujar con fiabilidad acciones compuestas como abrir puerta, cargar un animal o acurrucarse.
8. **Incongruencia de hábitat y personajes:** permite personajes terrestres debajo del agua sin motivación narrativa.
9. **QA sin verificación semántica suficiente:** `qa_audio_mode.py` no puede certificar que los dibujos representan la narración.
10. **Caída al fallback de reglas:** cuando el JSON del LLM falla, la salida determinista puede ser formalmente válida pero narrativamente mediocre.
11. **Déficit de recursos visuales:** el catálogo principal es 2D ilustrado; no puede generar por sí solo escenas 3D cinematográficas o reconstrucciones paleontológicas precisas.
12. **No hay regeneración automática por escena incorrecta:** el flujo actual necesita comparación visual posterior y no un simple chequeo del JSON.

## Correcciones aplicadas realmente en el código

- `vs/semantic_guardrails.py` NUEVO: validación conservadora de noche persistente, entornos, negación histórica, incompatibilidad humano/pez, actores ausentes, aparición prematura de dinosaurios, efectos y contadores.
- `vs/audio_storyboard.py`: atributos de apariencia derivados del guion, elimina durmiente genérico en historias de mascotas, no interpreta «amiga» como nueva persona, normaliza verbos pasados y facilita acción `shiver`; conecta reglas con las dos rutas (LLM y fallback).
- `vs/cast.py`: evita que Tierra/planeta/sol/océano se interpreten como nombres personales.
- `vs/vector_compiler.py`: propaga el color del personaje felino al render y mantiene alias permanente.
- `engine/62_vector_characters.js` + catálogo: permite gata blanca sin rayas y añade capacidad de `shiver` para el rig gato.
- `engine/75_vector_director.js`: reduce zoom de planos y focos, limita escala real según la geometría del asset, acota la ampliación de animales acuáticos y añade temblor sutil.
- `vs/fidelity.py`: reconoce `400 millones` como 400.000.000.
- `vs/qa_audio_mode.py`: añade evaluación del storyboard semántico `FAIL/REVIEW`, e informa sin mentir sobre acciones complejas no verificadas.
- `tests/test_semantic_guardrails.py`: siete pruebas de regresión sobre los defectos reales detectados.

## Validación ejecutada

- Nuevas regresiones semánticas: **7/7 PASS**.
- Planificador y contrato: **11/11 PASS**.
- Detección de roles/especies: **5/5 PASS**.
- Motor de animación: **4/4 PASS**.
- Fidelidad numérica y reglas generales: **4/4 PASS**.
- Total de pruebas focalizadas: **31/31 PASS**.
- Compilación Python y chequeo sintáctico JavaScript: PASS.
- La suite integral excedió el límite de ejecución en la parte de pipelines de audio y no se considera aprobada.
- Intento de fotogramas de referencia con Chromium directo: no concluyó. **No se ha verificado un MP4 final corregido.**

## Bloqueos que siguen abiertos (no maquillarlos como resueltos)

1. **Coreografía/contacto físico:** para `abrir`, `recoger`, `llevar en brazos`, `abrazar`, `acurrucarse`, debe implementarse un rig compuesto de manos/puerta/cat o integrarse un motor de video generativo con QA visual.
2. **Reconstrucciones de eras:** evitar que la misma maqueta de tiburón represente cientos de millones de años sin variación; requiere nuevos escenarios, especies de época, morphing o material documental verificado.
3. **Acciones semánticas arbitrarias:** si un verbo no tiene animación, debe bloquear render o sustituirse por un plano alternativo explícitamente verificado; hoy emite `REVIEW` para ciertos casos.
4. **Verificación multimodal:** aplicar un verificador cuadro-a-cuadro o sobre puntos clave comparando cada evento con lo visible, atributos, movimiento y condiciones de luz. Las reglas sobre el plan son necesarias pero no suficientes.
5. **Calidad estética:** la librería 2D, aun depurada, no puede igualar automáticamente una producción 3D hiperrealista con cámara y efectos cinematográficos.
6. **Escenarios concretos:** crear casa nocturna con pasillo/puerta y jardín con árbol, sombras y localizaciones conectadas. La sustitución por `bedroom_night_v1` / `night_meadow_v1` evita el día, pero no equivale al espacio narrado en todos sus detalles.
7. **Cobertura general:** validación de atributos, cronología y coherencia para cualquier historia y cualquier animal exige analizador estructural de lenguaje y pruebas audiovisuales en un conjunto más amplio de guiones.

## Instalación y nueva prueba

1. Respaldar la carpeta actual `ComfyUI-ViralStudio` y guardar trabajos en progreso.
2. Detener ComfyUI/ViralStudio; extraer el ZIP parcheado y copiar `ComfyUI-ViralStudio` al directorio original.
3. Reiniciar el servicio y **crear un proyecto nuevo** (un storyboard cacheado de la versión anterior no se reescribe automáticamente).
4. Probar los mismos guiones de Luna y tiburones; revisar biblia visual, storyboard y avisos semánticos antes del render.
5. Comparar el nuevo MP4 por escenas, no solo la ausencia de errores técnicos. Evitar publicar mientras haya avisos `FAIL`; revisar manualmente todos los `REVIEW`.

**Precisión:** el paquete es un parche experimental de coherencia, no una garantía de que «todos» los errores posibles hayan sido corregidos. Un motor de animación limitado no puede ejecutar escenas físicas para las que no tiene assets ni acciones.
