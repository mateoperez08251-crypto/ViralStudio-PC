# Fixtures de prueba del modo «Mi audio → video»

- `narracion_palomas.mp3` (23,0 s, 24 kHz mono, 160 kbps): narración **sintética** generada con Kokoro-82M
  (Apache-2.0, voz `em_alex`) mediante `make_fixture_kokoro.py`. Es un fixture de pruebas, NO un audio del usuario
  ni un audio de los videos de referencia. Incluye una pausa real de 1,6 s (12,3–14,0 s) para probar silencios.

  Texto: «¿Por qué las palomas mueven la cabeza al caminar? Mira a esta paloma en la plaza. Un niño la observa
  desde un banco, sorprendido. Su cuerpo avanza, pero la cabeza se queda quieta en el aire. Luego da un salto rápido
  hacia delante. Lo hace unas quince veces por segundo. Así ve el mundo nítido, como una cámara estable.»

  Regenerar: `python make_fixture_kokoro.py <carpeta_kokoro> narracion_palomas.wav && ffmpeg -i narracion_palomas.wav -b:a 160k narracion_palomas.mp3`
