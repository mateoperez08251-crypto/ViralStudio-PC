"""Render con la CLI de HyperFrames por capítulos (en paralelo dentro de cada
capítulo, reanudable: un capítulo que no cambió no se vuelve a renderizar),
unión sin recompresión y mezcla del audio final."""
import hashlib
import os
import re
import subprocess
import time

from .config import hyperframes_cmd

_PCT = re.compile(r"(\d{1,3}(?:\.\d+)?)\s?%")
_FRAMES = re.compile(r"(\d+)\s*/\s*(\d+)\s*(?:frames|fr)", re.I)


def _hash_files(paths):
    h = hashlib.sha1()
    for p in paths:
        try:
            with open(p, "rb") as f:
                h.update(f.read())
        except FileNotFoundError:
            h.update(p.encode())
    return h.hexdigest()


def lint(hf_dir, log=print):
    cmd = hyperframes_cmd() + ["lint", hf_dir]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    out = (r.stdout + r.stderr).strip()
    log("[lint] " + out[-800:])
    return r.returncode == 0, out


def render_parts(hf_dir, info, quality="high", workers="auto", fps=30, progress=None, log=print, cancel=None, gpu=False):
    """Renderiza cada part_XX.html a renders/part_XX.mp4. progress(frac 0..1, texto)."""
    rdir = os.path.join(hf_dir, "renders")
    os.makedirs(rdir, exist_ok=True)
    total = sum(c["dur"] for c in info["chapters"]) or 1
    done = 0.0
    outs = []
    engine = os.path.join(hf_dir, "assets", "vs-engine.js")
    for c in info["chapters"]:
        part = os.path.join(hf_dir, c["part"])
        out = os.path.join(rdir, c["part"].replace(".html", ".mp4"))
        key = hashlib.sha1((c.get("part_html") or "").encode()).hexdigest() + _hash_files([os.path.join(hf_dir, "compositions", c["id"] + ".html"), engine]) + f"{quality}{fps}"
        kf = out + ".key"
        if os.path.exists(out) and os.path.exists(kf) and open(kf).read() == key:
            log(f"[render] {c['part']} sin cambios, se reutiliza")
            done += c["dur"]
            outs.append(out)
            if progress:
                progress(done / total, f"Capítulo {c['id']} (en caché)")
            continue
        cmd = hyperframes_cmd() + ["render", hf_dir, "-c", c["part"], "-o", out, "-q", quality, "-w", str(workers), "-f", str(fps)]
        if gpu:
            cmd.append("--gpu")
        log("[render] " + " ".join(cmd[-12:]))
        t0 = time.time()
        # la raíz de un solo capítulo existe solo mientras se renderiza (el proyecto
        # que abre el Studio de HyperFrames tiene una única raíz: index.html)
        with open(part, "w", encoding="utf-8") as f:
            f.write(c.get("part_html") or "")
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        tail = []
        for line in p.stdout:
            line = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", line).strip()
            if not line:
                continue
            tail = (tail + [line])[-40:]
            frac = None
            m = _FRAMES.search(line)
            if m and int(m.group(2)) > 0:
                frac = int(m.group(1)) / int(m.group(2))
            else:
                m = _PCT.search(line)
                if m:
                    frac = min(100.0, float(m.group(1))) / 100.0
            if frac is None:
                # sin progreso explícito: estimación por tiempo (≈1.6× tiempo real por capítulo)
                frac = min(0.95, (time.time() - t0) / max(5.0, c["dur"] * 1.6))
            if progress:
                progress((done + c["dur"] * frac) / total, f"Renderizando {c['id']} · {int(frac * 100)}%")
            if cancel and cancel():
                p.kill()
                raise RuntimeError("Render cancelado")
        p.wait()
        if (p.returncode != 0 or not os.path.exists(out)) and gpu:
            # sin NVENC en esta máquina: se repite con el codificador de CPU
            log("[render] la codificación por GPU falló; reintento con CPU")
            cmd = [x for x in cmd if x != "--gpu"]
            r2 = subprocess.run(cmd, capture_output=True, text=True)
            tail = (r2.stdout + r2.stderr).splitlines()[-40:]
            p.returncode = r2.returncode
            gpu = False
        try:
            os.remove(part)
        except OSError:
            pass
        if p.returncode != 0 or not os.path.exists(out):
            raise RuntimeError("HyperFrames no pudo renderizar " + c["part"] + ":\n" + "\n".join(tail[-15:]))
        with open(kf, "w") as f:
            f.write(key)
        log(f"[render] {c['part']} listo en {time.time() - t0:.0f}s")
        done += c["dur"]
        outs.append(out)
        if progress:
            progress(done / total, f"Capítulo {c['id']} listo")
    return outs


def assemble(parts, mix_wav, out_mp4, log=print):
    """Une los capítulos (copia de vídeo, sin recomprimir) y añade la mezcla."""
    lst = out_mp4 + ".txt"
    with open(lst, "w") as f:
        for p in parts:
            f.write(f"file '{os.path.abspath(p)}'\n")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst]
    if mix_wav and os.path.exists(mix_wav):
        cmd += ["-i", mix_wav, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest"]
    else:
        cmd += ["-map", "0:v:0", "-c:v", "copy"]
    cmd += ["-movflags", "+faststart", out_mp4]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("ffmpeg no pudo unir el video:\n" + r.stderr[-1200:])
    os.remove(lst)
    log(f"[render] video final: {out_mp4}")
    return out_mp4


def social_copy(src, dst):
    """Versión ligera para subir a redes (H.264 CRF 22, faststart)."""
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-c:v", "libx264", "-crf", "22", "-preset", "slow",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", dst], check=True)
    return dst


def thumbnail(src, dst, t=1.2):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", src, "-frames:v", "1", "-q:v", "2", dst], check=True)
    return dst


def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_name,width,height",
                        "-of", "json", path], capture_output=True, text=True)
    import json

    try:
        return json.loads(r.stdout)
    except Exception:
        return {}
