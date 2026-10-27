import sys, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
k = Kokoro(sys.argv[1] + "/kokoro.onnx", sys.argv[1] + "/voices.bin")
parts = [
 ("¿Por qué las palomas mueven la cabeza al caminar?", 0.45),
 ("Mira a esta paloma en la plaza.", 0.35),
 ("Un niño la observa desde un banco, sorprendido.", 0.4),
 ("Su cuerpo avanza, pero la cabeza se queda quieta en el aire.", 1.6),
 ("Luego da un salto rápido hacia delante.", 0.35),
 ("Lo hace unas quince veces por segundo.", 0.4),
 ("Así ve el mundo nítido, como una cámara estable.", 0.6),
]
out, sr = [np.zeros(int(0.35 * 24000), np.float32)], 24000
for t, pause in parts:
    s, sr = k.create(t, voice="em_alex", speed=1.0, lang="es")
    out += [np.asarray(s, np.float32), np.zeros(int(pause * sr), np.float32)]
x = np.concatenate(out); x = x / np.abs(x).max() * 0.85
sf.write(sys.argv[2], x, sr)
print(len(x) / sr)
