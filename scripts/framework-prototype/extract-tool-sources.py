"""Extract only the three hash-bound upstream archives into new owned roots."""
import hashlib
import json
import os
import pathlib
import sys
import tarfile

recipe = json.loads(pathlib.Path(sys.argv[1]).read_text())
downloads, output, locks = map(pathlib.Path, sys.argv[2:5])
output.mkdir()
allowed_links = {
    "buildkit": {"examples/kube-consistent-hash": "kubernetes/consistenthash"},
    "runc": {"libcontainer/nsenter/test/escape.c": "../escape.c"},
    "cni": {},
}
for name, source in recipe["contract"]["sources"].items():
    archive = downloads / (name + ".tgz")
    assert archive.stat().st_size == source["bytes"]
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == source["sha256"]
    root = output / name
    root.mkdir()
    prefix = source["repo"].split("/")[-1] + "-" + source["commit"]
    size, count, links = 0, 0, []
    with tarfile.open(archive) as stream:
        for member in stream:
            count += 1
            size += member.size
            assert count < 30000 and size < 512 * 1024**2
            relative = pathlib.PurePosixPath(member.name)
            assert not relative.is_absolute() and ".." not in relative.parts
            assert relative.parts[0] == prefix
            parts = relative.parts[1:]
            if not parts:
                continue
            target = root.joinpath(*parts)
            assert target.resolve().is_relative_to(root.resolve())
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            if member.issym():
                assert allowed_links[name].get("/".join(parts)) == member.linkname
                assert (target.parent / member.linkname).resolve().is_relative_to(root.resolve())
                links.append((target, member.linkname))
                continue
            assert member.isfile()
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("xb") as destination:
                incoming = stream.extractfile(member)
                while chunk := incoming.read(1024 * 1024):
                    destination.write(chunk)
            target.chmod(member.mode & 0o777)
    for target, link in links:
        assert (target.parent / link).exists()
        os.symlink(link, target)
    for filename, lock in source["locks"].items():
        destination = root / filename
        assert hashlib.sha256(destination.read_bytes()).hexdigest() == lock["originalSha256"]
        patched = (locks / lock["file"]).read_bytes()
        assert hashlib.sha256(patched).hexdigest() == lock["sha256"]
        destination.write_bytes(patched)
    print(json.dumps({"source": name, "entries": count, "bytes": size, "internalLinks": len(links), "moduleLocks": "verified and patched"}))
