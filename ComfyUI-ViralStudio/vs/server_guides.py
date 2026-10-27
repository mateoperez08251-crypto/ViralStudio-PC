"""Biblioteca Markdown del motor: también disponible directamente desde Colab."""
import json
from pathlib import Path
import threading
import uuid
from aiohttp import web
from .config import data_dir
from .guidance import validate

_lock = threading.RLock()

def folder():
    root = Path(data_dir()) / 'animation_guides'
    root.mkdir(parents=True, exist_ok=True)
    return root

def save_guide(value):
    guide = validate(value)
    if not guide:
        raise ValueError('Escribe o importa una guía Markdown.')
    with _lock:
        root = folder()
        # El JSON es la copia canónica; el .md se conserva para descargar o consultar.
        for suffix, content in [('md', guide['markdown']), ('json', json.dumps(guide, ensure_ascii=False, indent=2))]:
            target = root / (guide['profile'] + '.' + suffix)
            temporary = root / (uuid.uuid4().hex + '.tmp')
            try:
                temporary.write_text(content, encoding='utf-8')
                temporary.replace(target)
            finally:
                temporary.unlink(missing_ok=True)
    return guide

def list_guides():
    result = []
    with _lock:
        for path in sorted(folder().glob('*.json')):
            if path.is_symlink():
                continue
            result.append(validate(json.loads(path.read_text(encoding='utf-8'))))
    return result

def install(routes):
    @routes.get('/viralstudio/api/guides')
    async def get_guides(request):
        try:
            return web.json_response({'enabled_by_default': True, 'guides': list_guides()})
        except (OSError, ValueError) as e:
            return web.json_response({'error': 'No se pudieron leer las guías: ' + str(e)}, status=500)

    @routes.post('/viralstudio/api/guides')
    async def post_guide(request):
        try:
            return web.json_response(save_guide(await request.json()))
        except (ValueError, TypeError) as e:
            return web.json_response({'error': str(e)}, status=400)
