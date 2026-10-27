# Ejemplo · «Mi guion → video» con el motor ilustrado

`animales/` se generó con `tools/demo_guion_a_video.py`, a partir de este guion y con la voz Kokoro (local):

> En la sabana africana, un elefante camina despacio. De pronto, un león ruge y el elefante corre. Mientras tanto, en
> el mar, un pulpo nada tranquilo: tiene 3 corazones. En la granja, la vaca Lola mira al granjero. Y en la plaza, una
> paloma vuela asustada porque un perro corre hacia ella.

Nadie eligió a mano los personajes ni los escenarios: salieron del texto.

| Escena | Texto | Escenario | Personajes (acción) |
|---|---|---|---|
| sc001 | En la sabana africana, un elefante camina despacio. | sabana | elephant_01 (camina) |
| sc002 | De pronto, un león ruge y el elefante corre. | sabana | lion_01 · elephant_01 (corre) |
| sc003 | …en el mar, un pulpo nada tranquilo: tiene 3 corazones. | fondo marino | octopus_01 + contador «3 corazones» |
| sc004 | En la granja, la vaca Lola mira al granjero. | granja | cow_01 «Lola» · farmer_01 (sombrero de paja) |
| sc005 | Y en la plaza, una paloma vuela asustada porque un perro corre hacia ella. | plaza | pigeon_01 (vuela) · dog_01 (corre) |

QA **PASS**: 559 frames = ceil(18,627 s × 30); narración continua (desfase 0,0 ms, r = 1,0); **narración = guion** (52
palabras idénticas); zonas seguras; animación visible. Detalle en `metrics.json`; capturas por escena en `qa_frames/` y
`hoja_de_contactos.jpg`.
