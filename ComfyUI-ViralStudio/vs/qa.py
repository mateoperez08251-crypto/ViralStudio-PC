"""Control de calidad automático del MP4 final (Guía Maestra V2 §13).
Resultado por comprobación y global: PASS | REVIEW | FAIL. Un REVIEW o FAIL
deja el proyecto en QA_PENDING hasta que una persona lo apruebe."""
import json
import re
import subprocess

ORDER = {"PASS": 0, "REVIEW": 1, "FAIL": 2}


def _ff(args, timeout=900):
    return subprocess.run(["ffmpeg", "-hide_banner", "-nostats", *args], capture_output=True, text=True, timeout=timeout)


def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path], capture_output=True, text=True)
    return json.loads(r.stdout or "{}")


def run_qa(video, expect):
    """expect = {W, H, fps, total, captions, scenes_without_voice, fidelity_issues}"""
    checks = []

    def add(name, status, detail):
        checks.append({"check": name, "status": status, "detail": detail})

    try:
        info = probe(video)
    except Exception as e:
        add("ffprobe", "FAIL", f"no se pudo leer el archivo: {e}")
        return {"status": "FAIL", "checks": checks}
    streams = info.get("streams", [])
    v = next((s for s in streams if s.get("codec_type") == "video"), None)
    a = next((s for s in streams if s.get("codec_type") == "audio"), None)
    add("pistas", "PASS" if v and a else "FAIL", f"video={'sí' if v else 'NO'} audio={'sí' if a else 'NO'}")
    if v:
        okdim = int(v.get("width", 0)) == expect["W"] and int(v.get("height", 0)) == expect["H"]
        add("resolución", "PASS" if okdim else "FAIL", f"{v.get('width')}×{v.get('height')} (esperado {expect['W']}×{expect['H']})")
        num, den = (v.get("r_frame_rate") or "0/1").split("/")
        fps = float(num) / float(den or 1)
        add("fps", "PASS" if abs(fps - expect["fps"]) < 0.05 else "FAIL", f"{fps:.2f} fps (esperado {expect['fps']})")
        add("códec", "PASS" if v.get("codec_name") in ("h264", "hevc") and v.get("pix_fmt", "yuv420p") == "yuv420p" else "REVIEW",
            f"{v.get('codec_name')} {v.get('pix_fmt')}")
    dur = float(info.get("format", {}).get("duration") or 0)
    diff = abs(dur - expect["total"])
    add("duración", "PASS" if diff < 0.25 else "REVIEW" if diff < 1.0 else "FAIL", f"{dur:.2f}s vs línea de tiempo {expect['total']:.2f}s")
    if v and a:
        vd, ad = float(v.get("duration") or dur), float(a.get("duration") or dur)
        add("sincronía A/V", "PASS" if abs(vd - ad) < 0.12 else "REVIEW", f"video {vd:.2f}s · audio {ad:.2f}s")
    # cuadros negros (> 0.5 s) y congelados (> 2.5 s)
    r = _ff(["-i", video, "-vf", "blackdetect=d=0.5:pix_th=0.05,freezedetect=n=-60dB:d=2.5", "-an", "-f", "null", "-"])
    blacks = re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", r.stderr)
    add("cuadros negros", "PASS" if not blacks else "REVIEW", "ninguno" if not blacks else ", ".join(f"{float(x):.1f}-{float(y):.1f}s" for x, y in blacks[:6]))
    frz = re.findall(r"freeze_start: ([\d.]+)", r.stderr)
    add("imagen congelada", "PASS" if not frz else "REVIEW", "ninguna" if not frz else ", ".join(f"{float(x):.1f}s" for x in frz[:6]))
    # sonoridad
    if a:
        r = _ff(["-i", video, "-vn", "-af", "loudnorm=print_format=json", "-f", "null", "-"])
        try:
            m = json.loads(r.stderr[r.stderr.rindex("{"): r.stderr.rindex("}") + 1])
            lufs, tp = float(m["input_i"]), float(m["input_tp"])
            st = "PASS" if -16.5 <= lufs <= -12.5 and tp <= -0.5 else "REVIEW"
            add("sonoridad", st, f"{lufs:.1f} LUFS · pico {tp:.1f} dBTP (objetivo −14 LUFS, ≤ −1 dBTP)")
        except Exception:
            add("sonoridad", "REVIEW", "no se pudo medir")
    # narración y subtítulos
    nv = expect.get("scenes_without_voice") or []
    add("voz en cada escena", "PASS" if not nv else "FAIL", "todas narradas" if not nv else "sin voz: " + ", ".join(nv[:8]))
    if expect.get("captions_enabled", True):
        add("subtítulos", "PASS" if expect.get("captions", 0) > 0 else "REVIEW", f"{expect.get('captions', 0)} grupos sincronizados")
    fi = expect.get("fidelity_issues", 0)
    add("fidelidad narración→imagen", "PASS" if not fi else "REVIEW",
        "cada plano justificado por la narración" if not fi else f"{fi} elemento(s) corregidos automáticamente: revisa el storyboard")
    status = max((c["status"] for c in checks), key=lambda s: ORDER[s]) if checks else "FAIL"
    return {"status": status, "checks": checks, "duration": dur}
