"""Genera ViralStudio_Colab.ipynb: una celda que lleva dentro el nodo completo."""
import base64, io, json, os, tarfile, re

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = os.path.join(os.path.dirname(HERE), "ComfyUI-ViralStudio")


def keep(ti):
    n = ti.name
    if "__pycache__" in n or n.endswith(".pyc") or "/.git" in n or "/_data" in n or re.search(r"/tmp[a-z0-9_]{6,}(?:/|$)", n) or "/.venv" in n:
        return None
    return ti


buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode="w:gz") as tf:
    tf.add(NODE, arcname="ComfyUI-ViralStudio", filter=keep)
payload = base64.b64encode(buf.getvalue()).decode()
cell = open(os.path.join(HERE, "setup_cell.py"), encoding="utf-8").read().replace('"__PAYLOAD__"', json.dumps(payload))
nb = {
    "nbformat": 4, "nbformat_minor": 0,
    "metadata": {"colab": {"provenance": [], "gpuType": "G4"}, "kernelspec": {"name": "python3", "display_name": "Python 3"},
                 "accelerator": "GPU", "language_info": {"name": "python"}},
    "cells": [
        {"cell_type": "markdown", "metadata": {}, "source": [
            "# 🎬 Viral Studio — videos animados virales con IA abierta\n",
            "Historia (Qwen3.8 en ComfyUI) → voz (Qwen3-TTS) → música (ACE-Step 1.5) → animación por código (**HyperFrames**) → MP4.\n\n",
            "**Uso:** elige GPU (G4 · RTX PRO 6000), ejecuta la celda, pega tu token de Hugging Face y se abrirá el Studio.\n",
            "Primera vez: ~15-25 min (descargas). Después: ~2 min.\n\n",
            "Se abre con un **enlace privado con llave** (túnel cloudflared → puerta con llave). Si el enlace deja de funcionar, ",
            "ejecuta la 2.ª celda «🔗 Enlace y diagnóstico»: tus trabajos siguen aunque el enlace cambie.\n\n",
            "**PC + Colab:** abre `pc/INICIAR_VIRALSTUDIO_PC.bat` en Windows y pega allí la URL base y la llave que imprime esta celda. Las guías .md, la cola y los resultados quedan en tu PC. Mantén `REVISION_VISUAL` activado para instalar el revisor visual Qwen3.5 4B.\n\n",
            "**Nuevo · Mi audio → video:** sube tu narración (MP3/WAV/M4A/FLAC/OGG/AAC o MP4/MOV) y se anima al segundo exacto ",
            "de tu voz con marionetas SVG, fondos 2.5D e infografías. La transcripción es local (faster-whisper); tu audio no se envía a nadie.\n\n",
            "**Nuevo · motor ilustrado en «Mi guion → video» y «Tema → video»:** detecta en tu texto los personajes y animales ",
            "(99 especies, 32 roles, nombres propios) y los crea y anima con el mismo estilo."]},
        {"cell_type": "code", "metadata": {"cellView": "form", "id": "viralstudio"}, "execution_count": None, "outputs": [],
         "source": cell.splitlines(keepends=True)},
    ],
}
util = open(os.path.join(HERE, "util_cell.py"), encoding="utf-8").read()
nb["cells"].append({"cell_type": "code", "metadata": {"cellView": "form", "id": "viralstudio_util"}, "execution_count": None, "outputs": [],
                    "source": util.splitlines(keepends=True)})
# celda de rescate: acceso sin reinstalar para un Colab que ya tiene la versión anterior
gw = base64.b64encode(open(os.path.join(NODE, "vs", "gateway.py"), "rb").read()).decode()
rescue = open(os.path.join(HERE, "rescue_template.py"), encoding="utf-8").read().replace("__GATEWAY__", gw)
open(os.path.join(HERE, "CELDA_RESCATE_acceso.py"), "w", encoding="utf-8").write(rescue)
out = os.path.join(HERE, "ViralStudio_Colab.ipynb")
json.dump(nb, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(out, f"{os.path.getsize(out) / 1024:.0f} KB · payload {len(payload) / 1024:.0f} KB")
