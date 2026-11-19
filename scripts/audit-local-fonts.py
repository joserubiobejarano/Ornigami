"""Read-only embedded metadata audit. Uses the already installed fontTools;
not an application/build dependency and never downloads or rewrites fonts.
"""
import hashlib
import json
from pathlib import Path
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'public/fonts/manifest.json').read_text(encoding='utf-8'))
for entry in manifest['fonts']:
    path = root / 'public/fonts' / entry['file']
    assert hashlib.sha256(path.read_bytes()).hexdigest() == entry['sha256'], path
    font = TTFont(path)
    def names(identifier):
        return sorted({name.toUnicode() for name in font['name'].names if name.nameID == identifier})
    assert names(1) == entry['embeddedFamily'], path
    assert names(16) == entry['typographicFamily'], path
    assert names(0) == entry['copyright'], path
    assert names(14) == entry['licenseURL'], path
    assert [{'tag': a.axisTag, 'min': a.minValue, 'max': a.maxValue, 'default': a.defaultValue}
            for a in font['fvar'].axes] == entry['axes'], path
    notice = (root / 'public/fonts' / entry['licenseFile']).read_text(encoding='utf-8')
    assert entry['copyright'][0] in notice, path
    assert 'SIL OPEN FONT LICENSE Version 1.1' in notice, path
print(f"{len(manifest['fonts'])} programs: hashes, embedded family/copyright/license URL, axes and notices agree")
