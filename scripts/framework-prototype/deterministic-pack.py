"""No install hooks. Reproducible package archive with maps/licenses retained."""
import gzip, io, sys, tarfile
from pathlib import Path
source, output = map(Path, sys.argv[1:])
assert source.is_dir() and not output.exists()
with output.open('xb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0, compresslevel=9) as gz:
    with tarfile.open(fileobj=gz, mode='w|', format=tarfile.GNU_FORMAT) as archive:
        for p in sorted(source.rglob('*'), key=lambda p:p.relative_to(source).as_posix()):
            assert not p.is_symlink(), f'Unexpected package symlink: {p}'
            if not p.is_file(): continue
            name='package/'+p.relative_to(source).as_posix()
            content=p.read_bytes(); info=tarfile.TarInfo(name)
            info.uid=info.gid=info.mtime=0; info.uname=info.gname=''
            info.mode=0o755 if name.startswith('package/dist/bin/') and not name.endswith('.map') else 0o644
            info.size=len(content); archive.addfile(info,io.BytesIO(content))
