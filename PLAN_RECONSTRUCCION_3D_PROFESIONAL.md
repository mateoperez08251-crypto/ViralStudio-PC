# ViralStudio — Plan de reconstrucción para animación 3D narrativa profesional

**Estado:** especificación de ingeniería; NO está implementada. Fecha: 26 octubre 2026.

## Diagnóstico verificado

El motor actual (`engine/75_vector_director.js`, `engine/62_vector_characters.js`, `engine/63_vector_creatures.js`) compone SVG vectoriales. `vs/audio_storyboard.py` detecta palabras y propone escenas y poses de librería; `vs/vector_compiler.py` traduce el storyboard a composiciones SVG. **No hay motor 3D, esqueletos 3D, cinemática inversa, geometría con volumen, materiales PBR ni animaciones 3D de interacción.** Una cámara SVG puede realizar paneos, zooms y parallax, pero eso no equivale a representar actos físicos. Colocar “calidad alta” o “cinematográfico” en el prompt no modifica la tecnología que dibuja cada fotograma.

La versión 1.1.2 AntiFreeze es **un parche de prevención/diagnóstico**: corrige duración de locomoción e impide exportar escenas que no pueden representarse con el motor actual. No soluciona el aspecto gráfico 3D ni implementa puerta, brazos, contacto animal-animal o evolución histórica.

## Arquitectura objetivo (sin generar imágenes ni videos con IA)

1. **Director semántico:** segmentar guion por eventos. Cada evento representa `{sujeto, acción, objeto, destino, lugar, época, hora, estado inicial, estado final, emoción, inicio, fin, prioridad}`. Resolver pronombres, negaciones y anáforas; persistir identidad visual y propiedades de entidades.
2. **Compilador de acciones:** mapear cada verbo a animaciones reales con retargeting, interacciones IK, capas de animación, rutas de locomoción, expresiones y objetos manipulables. **Prohibido fallback silencioso a `idle`.** Si no existe acción compatible, marcar bloqueada la toma y ofrecer editar el storyboard o importar rig/animación.
3. **Gestión de activos:** GLB/FBX con esqueleto, materiales PBR, escala realista, colisiones, LOD, licencias y procedencia; catálogo indexado por especie/época/acción y versión. Ejemplos: perro con walk/run/bark/sit/lie/sniff; gato con shiver/walk/lie/sleep/pickup_pose; humano con wake/walk/turn/light_switch/door_open/pickup_cat/carry_cat.
4. **Escenas 3D coherentes:** entornos vinculados por mapa (habitación→pasillo→puerta→jardín), coordenadas persistentes y hora del día global. Reconstrucciones paleontológicas según época; no mezclar especies en tiempos incompatibles.
5. **Motor de animación:** Blender headless/Eevee o Cycles en GPU para composiciones finales; armatures, NLA actions, IK constraints, path animation, contact poses y física ligera. Importar 3D desde fuentes con licencias válidas. Reservar Three.js, opcionalmente, para vista previa rápida del storyboard.
6. **Cámaras dirigidas por eventos:** un movimiento debe tener motivación (seguir a Toby por el pasillo o descubrir Luna bajo un árbol); no usar un ciclo predefinido de zooms. Planos con objetivos, continuidad de eje, encuadre por volumen real y edición basada en acciones.
7. **Luz y acabado:** iluminación física interior nocturna coherente con 3:00 a. m., exteriores realmente oscuros, sombras y luces interactivas (interruptor), AO, niebla controlada, motion blur y depth of field moderado. No retocar resoluciones y presentarlo como «3D» cuando el render siga siendo SVG.
8. **QA automático multimodal y humano:** renderizar playblast bajo; verificar actividad del cuerpo/silueta (no solo variación de píxeles por zoom), objeto manipulado, contacto, correspondencia con el guion, color y escala, continuidad espacio/tiempo. Si falla, regenerar solo la toma afectada. Requerir aprobación humana sobre miniaturas y movimiento antes de exportar.
9. **Exportación:** solo después de aprobar QA; 1080×1920, fps solicitado, mezcla de narración preservada, H.264/AAC; preservar caché por plano e inventario de recursos.

## Contrato de escena obligatorio

```json
{
  "scene_id": "sc_014",
  "start_s": 26.8,
  "end_s": 30.1,
  "location_id": "house_garden_tree_01",
  "time_of_day": "03:00",
  "characters": [
    {"id": "toby", "model_id": "dog_brown_v01", "state_from": "running", "state_to": "stopped"},
    {"id": "luna", "model_id": "cat_white_v01", "state_from": "shivering", "state_to": "shivering"}
  ],
  "events": [
    {"subject": "toby", "verb": "approach", "object": "luna", "motion_clip": "dog_approach", "start_s": 26.9, "end_s": 28.3},
    {"subject": "luna", "verb": "shiver", "motion_clip": "cat_shiver", "start_s": 26.8, "end_s": 30.1}
  ],
  "camera": {"shot": "medium", "target": "toby", "movement": "track", "reason": "follow_dog_to_cat"},
  "validation": {"identity": "PASS", "action": "PENDING_RENDER_QA", "setting": "PASS", "interaction": "PENDING_RENDER_QA"}
}
```

Este contrato es **ejemplo del sistema futuro**, no un recurso que el motor 1.x ya pueda dibujar.

## Interfaz necesaria

**Guion → eventos narrativos → reparto/modelos → animaciones y ubicaciones → storyboard 3D → playblast → informe QA por escena → render final.** Debe mostrar los eventos en una línea temporal y el estado `LISTO`, `REVISAR` o `BLOQUEADO`, con mensaje específico: «Ana debe cargar a Luna pero no existe acción 3D humano-gato». Permitir reemplazar animación, ajustar puntos de contacto, mover cámara y repetir render de la toma, sin borrar narración ni reprocesar escenas correctas.

## Pruebas de aceptación obligatorias

- **Toby:** gato de pelaje blanco sin rayas en todos los planos; perro marrón persistente; exterior noche real; Toby sale de la cama, recorre pasillo, ladra, sigue recorrido continuo hasta jardín, se aproxima a Luna, se acuesta a su lado; Ana abre una puerta animada, levanta a la gata con ambas manos y la lleva adentro; termina con ambos animales acostados juntos, no con personajes estáticos junto a una cama.
- **Tiburones:** escena marina durante el período correcto; árboles y dinosaurios solo si el evento exige comparación temporal explícita; líneas temporales históricamente coherentes; tiburón nadando de forma articulada; cambio de contenido real entre períodos, no mismo tiburón en fondos repetidos.
- **Métricas duras:** no más de 1,5 s de protagonista principal congelado en un plano donde la narración exige acción; 100 % de escenas con relación causal `narración→evento visual` o `BLOQUEADO`; cero discrepancias de color/identidad; cero colocaciones incompatibles con el hábitat; cero transiciones sin motivación espacial; cero actores u objetos gigantes que desborden el encuadre fuera de una composición deliberada.
- **QA subjetiva obligatoria:** un director humano revisa composición, luz, actuación, ritmo y autenticidad de la animación. Pasar pruebas de unit testing no prueba que el video sea profesional.

## Orden de implementación sugerido

**Fase A:** inventario y adquisición de rigs reales con licencias, motor Blender probado en Colab/PC, personajes y escenarios de las dos historias.

**Fase B:** evento→clip 3D→ejecución verificable; locomoción, gestos y transiciones entre acciones. No avanzar si falla el primer playblast sin audio.

**Fase C:** contactos e interacción 3D (puerta, luz, gato en brazos, acostarse junto a otro animal), continuidad espacial y temporal.

**Fase D:** dirección de cámara, iluminación y composición cinematográfica, física ambiental y montaje por acciones.

**Fase E:** QA visual por escena y matriz de pruebas de regresión con los dos guiones; exportación final y caching.

**Criterio de lanzamiento:** los dos guiones deben producir clips aceptables para revisión profesional SIN escenas inmóviles, errores de identidad ni sustituciones silenciosas; el operador debe poder corregir fallos detectados. Hasta entonces, etiquetar el producto «prototipo de animación vectorial».
