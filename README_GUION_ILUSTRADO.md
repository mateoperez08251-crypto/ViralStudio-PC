# 🎨 Mi guion → video (motor ilustrado)

Pega tu guion (o escribe un tema) y ViralStudio **detecta qué personajes y animales aparecen, los crea y los anima**,
todo guiado por el texto: quién aparece, dónde está, qué hace en cada palabra, qué cifras se muestran y cuándo cambia
el plano. Es el mismo motor de los videos estilo «la paloma» del modo 🎧 *Mi audio → video*, pero la voz la pone el
Studio a partir de tu guion.

---

## 1. Cómo se usa
1. **Crear → 📝 Mi guion → video** (o 🧠 *Tema → video* si quieres que la IA escriba el guion).
2. Pega tu texto. Escríbelo como lo dirías: *«Un elefante camina por la sabana africana. De pronto, un león ruge y el
   elefante corre.»*
3. En **3 · Animación** deja **🎨 Ilustrado (recomendado)**. *Clásico* es el motor anterior, que sigue disponible.
4. Elige formato, voz (Qwen3-TTS o Kokoro) y pulsa **⚡ Crear video completo**. Con **✍️ Solo el guion** se preparan la
   voz y el storyboard para que los revises antes de renderizar.
5. En el proyecto ves la forma de onda con las escenas, el texto narrado, el **storyboard editable**, la **biblia**
   (cada personaje con su id, rol y nombre), la vista previa en vivo, la QA y los archivos. **🔁 Re-renderizar esta
   escena** rehace solo una escena.

## 2. Qué detecta del guion
| En el texto | Qué aparece |
|---|---|
| **Animales**: «perro», «elefantes», «oso polar», «serpiente de cascabel», «pez payaso»… (es/en, singular y plural) | uno de **99 animales** dibujados con rigs articulados (cuadrúpedos, aves, peces, pulpos y medusas, insectos, serpientes, gusanos y caracoles) |
| **Personas con rol**: «la doctora», «el bombero», «la reina», «un astronauta», «el granjero», «mi abuela»… | persona con el aspecto del rol: bata y estetoscopio, casco, corona y capa, gorro de chef, canas y gafas… (32 roles) |
| **Edad y género**: artículo («**la** policía» / «**el** policía»), palabras como «niño», «mujer», «abuelo» | variante del personaje (hombre, mujer, niño, mayor) |
| **Nombres propios**: «Pedro corre», «Luna, la gata», «la vaca Lola», «la doctora Ana» | el nombre se une al personaje de **la misma frase**; si no hay nadie, es una persona nueva. Después basta con decir «Luna» |
| **Lugares**: «sabana africana», «granja», «mar», «río», «selva», «desierto», «nieve», «casa», «bosque», «playa», «cielo»… | 18 escenarios por capas con parallax. Si no se nombra ninguno, se usa el **hábitat natural** del protagonista (león → sabana, pulpo → fondo marino, vaca → granja) |
| **Verbos**: camina, corre, vuela, nada, salta, come, mira, habla/ladra/ruge/canta, señala, saluda, se sorprende, duerme… | la acción del personaje, **en el momento exacto** en que se dice la palabra. El sujeto es el personaje nombrado justo antes («un león ruge y **el elefante corre**» → corre el elefante) |
| **Cifras dichas**: «tiene 3 corazones» | contador animado «3 corazones» |
| **Partes del cuerpo**: «la cabeza», «los ojos» | la cámara se acerca a esa parte del personaje |

La misma entidad conserva su **id, diseño y colores** en todas las escenas (`elephant_01`, `doctor_01`…), y todo queda en
la biblia visual, que puedes revisar.

### Animales que el catálogo no tiene
Si el LLM está activo (Colab con ComfyUI), un paso de **diseño de reparto** propone los personajes que faltan
(«quetzal», «tapir»…) como uno de los 6 rigs, con su forma y colores. Antes de usarse se **valida** todo:
- la palabra debe aparecer literalmente en tu texto (el LLM no puede inventar personajes);
- el rig y las opciones deben existir;
- los números se limitan a rangos dibujables y los colores deben ser `#rrggbb`;
- nunca se acepta SVG o JS libre.

Sin LLM, ese paso no hace nada. El catálogo de 99 especies y los 32 roles cubren lo habitual.

### Ampliar el catálogo
- Especies: edita `tools/make_species.py` y ejecuta `python tools/make_species.py vs/assets/species.json`.
- Escenarios: `engine/64_vector_worlds2.js` + su entrada en `vs/assets/library.json`.
- Roles: `vs/cast.py` (`ROLES`).

## 3. La voz y los tiempos
- Cada escena se narra con la voz elegida, se unen en una **pista continua** y cada palabra **de tu guion** (texto
  exacto, no lo que entienda un reconocedor de voz) recibe su tiempo. A partir de ahí el plan, el montaje, el render y la
  QA son los mismos que en *Mi audio → video*: escenas contiguas en frames enteros, subtítulos palabra a palabra y
  textos siempre dentro del cuadro.
- La QA comprueba además «**narración = guion**»: las palabras con tiempo son idénticas a tu guion.
- Renderizar no vuelve a sintetizar la voz: tus correcciones de subtítulos no se pierden.

## 4. Proyectos y compatibilidad
- Los proyectos **nuevos** de tema o guion usan el motor ilustrado. El clásico se elige en *Animación*.
- Los proyectos **antiguos** (creados antes) siguen con el motor clásico, sin cambios.
- *Mi audio → video* no cambia: tu audio nunca se re-sintetiza ni se recorta.

## 5. Demostración reproducible
```bash
cd ComfyUI-ViralStudio
VS_TTS_PYTHON=… VS_HF_BIN=…/hyperframes VS_KOKORO_DIR=…/kokoro \
python tools/demo_guion_a_video.py "En la sabana africana, un elefante camina despacio. …" SALIDA/ --tts kokoro
```
Copia a `SALIDA/` el MP4, el SRT, el plan, la biblia, los manifiestos, la QA, las capturas por escena y `metrics.json`.
Ejemplo incluido en `EJEMPLO_GUION_A_VIDEO/`.

## 6. Límites honestos
- Es ilustración vectorial 2D de perfil con piezas articuladas, no fotorrealismo. Algunas especies poco comunes se
  parecen a su «familia» (un tejón comparte rig con otros cuadrúpedos pequeños).
- Una escena muestra hasta 2 personajes a la vez (el segundo, más al fondo).
- La detección por reglas cubre lo que el texto **dice**. Las frases muy indirectas («el animal más grande de la
  sabana») necesitan nombrar al animal o el LLM.
