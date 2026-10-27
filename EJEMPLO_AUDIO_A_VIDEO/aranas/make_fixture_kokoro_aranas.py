import sys, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
k = Kokoro(sys.argv[1] + "/kokoro.onnx", sys.argv[1] + "/voices.bin")
parts = [("¿De verdad nos tragamos ocho arañas al año mientras dormimos?", 0.5),
 ("Imagina que duermes con la boca abierta.", 0.4),
 ("Una araña baja del techo por su hilo.", 0.5),
 ("Pero las arañas sienten las vibraciones.", 0.35),
 ("Tu respiración y tu corazón son una alarma de peligro.", 0.6),
 ("Ningún estudio científico ha registrado un solo caso.", 0.4),
 ("Es un dato inventado.", 0.6)]
out = [np.zeros(int(0.3 * 24000), np.float32)]
for t, p in parts:
    s, sr = k.create(t, voice="ef_dora", speed=1.0, lang="es")
    out += [np.asarray(s, np.float32), np.zeros(int(p * sr), np.float32)]
x = np.concatenate(out); x = x / np.abs(x).max() * 0.85
sf.write(sys.argv[2], x, 24000); print(len(x) / 24000)
