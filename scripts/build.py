"""Dependency-free, deterministic XPI packaging. Never touches a Zotero profile."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'src'
manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
output = ROOT / 'dist'
output.mkdir(exist_ok=True)
target = output / f"paper-statistics-{manifest['version']}.xpi"
required = ['manifest.json', 'bootstrap.js', 'main.js', 'core.js', 'statistics-worker.js', 'prefs.js']
assert all((source / n).is_file() for n in required)
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for path in sorted(source.rglob('*')):
        if not path.is_file():
            continue
        info = zipfile.ZipInfo(path.relative_to(source).as_posix(), (2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        z.writestr(info, path.read_bytes())
    for name in ['LICENSE', 'NOTICE']:
        info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, (ROOT / name).read_bytes())
with zipfile.ZipFile(target) as z:
    assert z.testzip() is None
    assert all(n in z.namelist() for n in required)
sha = hashlib.sha256(target.read_bytes()).hexdigest()
(output / (target.name + '.sha256')).write_text(f'{sha}  {target.name}\n', encoding='ascii')
print(json.dumps({'xpi': str(target), 'bytes': target.stat().st_size, 'sha256': sha}, indent=2))
