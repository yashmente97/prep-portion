"""Stamp a new app version. Run before every push: python3 tools/release.py
Installed apps compare version.json with their own version and reload themselves."""
import re, json, datetime, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
v = datetime.datetime.now(datetime.timezone.utc).strftime('%Y.%m.%d-%H%M')
idx = root / 'index.html'
h = idx.read_text()
h = re.sub(r'(<meta name="app-version" content=")[^"]*(")', r'\g<1>' + v + r'\2', h)
h = re.sub(r'\?v=[^"]*"', '?v=' + v + '"', h)
idx.write_text(h)
sw = root / 'sw.js'
sw.write_text(re.sub(r"const CACHE = '[^']*';", f"const CACHE = 'pp-{v}';", sw.read_text()))
(root / 'version.json').write_text(json.dumps({'v': v}) + '\n')
print(v)
