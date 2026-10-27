"""Códigos de error de la Guía Maestra V2 §6: cada fallo se clasifica con una
acción correctiva clara en lugar de un mensaje genérico."""

CODES = {
    "INPUT_INVALID": "Revisa el tema, la duración o el guion de entrada.",
    "MODEL_UNAVAILABLE": "Falta el modelo: ejecuta de nuevo la celda de instalación o elige otro en Ajustes.",
    "NODE_MISSING": "ComfyUI no tiene un nodo necesario: actualiza ComfyUI (la celda de instalación lo hace).",
    "VRAM_OOM": "Sin memoria de GPU: cierra otros trabajos, usa Kokoro o el LLM de 9B en Ajustes.",
    "GPU_DISCONNECTED": "Colab desconectó la GPU: vuelve a ejecutar la celda; el proyecto se reanuda desde donde quedó.",
    "COMFY_PROMPT_FAILED": "ComfyUI rechazó el flujo: mira el registro para el detalle.",
    "ASR_FAILED": "La transcripción falló incluso en CPU: el motivo está en la primera línea. Puedes pegar la "
                  "transcripción a mano («📋 Pegar transcripción») mientras tanto.",
    "TTS_FAILED": "La voz falló: prueba con el motor Kokoro o revisa la muestra de clonado.",
    "RENDER_FAILED": "HyperFrames no pudo renderizar: revisa el registro (lint/check).",
    "FFMPEG_FAILED": "FFmpeg falló al mezclar o unir: revisa el registro.",
    "VISUAL_REVIEW_UNAVAILABLE": "No se completó la revisión visual. Revisa el modelo visual y los nodos de ComfyUI; no se aprueba sin revisar imágenes.",
    "QA_BLOCKED": "El control de calidad encontró problemas: revisa el informe QA.",
    "CANCELLED": "Cancelado por el usuario.",
    "INTERRUPTED": "El proceso se reinició: pulsa «Reanudar» y sigue donde quedó.",
    "UNKNOWN": "Error inesperado: revisa el registro.",
}


class VSError(RuntimeError):
    def __init__(self, code, msg):
        super().__init__(msg)
        self.code = code


def classify(exc):
    if isinstance(exc, VSError):
        return exc.code
    m = str(exc).lower()
    if "cancel" in m:
        return "CANCELLED"
    if "out of memory" in m or "cuda oom" in m or "outofmemory" in m:
        return "VRAM_OOM"
    if "cuda error" in m or "device-side" in m or "no cuda gpus" in m:
        return "GPU_DISCONNECTED"
    if "nodo" in m and "falta" in m or "missing node" in m or "node_missing" in m:
        return "NODE_MISSING"
    if "not found" in m and ("safetensors" in m or "model" in m) or "value_not_in_list" in m or "modelo" in m and "falta" in m:
        return "MODEL_UNAVAILABLE"
    if "comfyui" in m:
        return "COMFY_PROMPT_FAILED"
    if "voz" in m or "tts" in m:
        return "TTS_FAILED"
    if "hyperframes" in m or "render" in m:
        return "RENDER_FAILED"
    if "ffmpeg" in m:
        return "FFMPEG_FAILED"
    return "UNKNOWN"


def describe(exc):
    code = classify(exc)
    return {"code": code, "message": str(exc)[:1500], "action": CODES.get(code, CODES["UNKNOWN"])}
