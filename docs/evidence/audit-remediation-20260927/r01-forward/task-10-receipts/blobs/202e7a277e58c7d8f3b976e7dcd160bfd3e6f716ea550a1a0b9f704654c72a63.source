"""Artifact-only Windows path packaging; never alters executable source bytes."""
from pathlib import Path
import hashlib, json

root = Path.cwd().resolve()
base = root / "docs/evidence/audit-remediation-20260927/r01-forward"
out = base / "task-7-receipts"
original = root / ".superpowers/sdd/r01-forward-schema-plan-20261001/task-7-final-package-originals"
for p in (base, out, original):
    assert p.resolve().is_relative_to(root)
assert not out.exists() and not original.exists()
out.mkdir()
original.mkdir()
wide = lambda p: Path("\\\\?\\" + str(p))
mapping = []
groups = []
for old, short in (("task-7-red-receipts", "r"), ("task-7-green-receipts", "g"), ("task-7-preflight-receipts", "p")):
    source = base / old
    destination = original / old
    assert source.resolve(strict=True).is_relative_to(root)
    assert destination.resolve().is_relative_to(root) and not destination.exists()
    groups.append((source, destination))
    cases = sorted(p.name for p in wide(source).iterdir() if p.is_dir())
    for index, name in enumerate(cases, 1):
        case = out / short / f"c{index:02}"
        case.mkdir(parents=True)
        for count, src in enumerate(sorted(wide(source / name).rglob("*")), 1):
            if not src.is_file():
                continue
            normal = Path(str(src)[4:])
            assert normal.is_relative_to(source)
            leaf = f"s{count:03}.source" if normal.suffix in (".ts", ".sql", ".source") else normal.name
            target = case / leaf
            assert target.resolve().is_relative_to(root) and len(str(target)) < 260
            raw = src.read_bytes()
            with target.open("xb") as handle:
                handle.write(raw)
            assert target.read_bytes() == raw
            mapping.append({"actualPath": str(normal.relative_to(root)).replace("\\", "/"), "packagedPath": str(target.relative_to(root)).replace("\\", "/"), "immutableOriginalPath": str((destination / normal.relative_to(source)).relative_to(root)).replace("\\", "/"), "rawSha256": hashlib.sha256(raw).hexdigest(), "canonicalSha256": hashlib.sha256(raw.replace(b"\r\n", b"\n")).hexdigest()})
    for src in wide(source).iterdir():
        if src.is_file():
            normal = Path(str(src)[4:])
            target = out / short / normal.name
            target.parent.mkdir(parents=True, exist_ok=True)
            assert target.resolve().is_relative_to(root) and len(str(target)) < 260
            raw = src.read_bytes()
            with target.open("xb") as handle:
                handle.write(raw)
            assert target.read_bytes() == raw
            mapping.append({"actualPath": str(normal.relative_to(root)).replace("\\", "/"), "packagedPath": str(target.relative_to(root)).replace("\\", "/"), "immutableOriginalPath": str((destination / normal.relative_to(source)).relative_to(root)).replace("\\", "/"), "rawSha256": hashlib.sha256(raw).hexdigest(), "canonicalSha256": hashlib.sha256(raw.replace(b"\r\n", b"\n")).hexdigest()})
# Every raw file was copied and compared before any directory relocation.
for m in mapping:
    assert hashlib.sha256(wide(root / m["actualPath"]).read_bytes()).hexdigest() == m["rawSha256"]
    assert hashlib.sha256((root / m["packagedPath"]).read_bytes()).hexdigest() == m["rawSha256"]
for source, destination in groups:
    assert source.resolve(strict=True).is_relative_to(root) and destination.resolve().is_relative_to(root)
    wide(source).rename(wide(destination))
for m in mapping:
    assert hashlib.sha256(wide(root / m["immutableOriginalPath"]).read_bytes()).hexdigest() == m["rawSha256"]
(out / ".gitattributes").write_text("* -text\n", encoding="utf-8", newline="\n")
(base / "task-7-packaging-path-bindings.json").write_text(json.dumps({"artifactOnly": True, "shortPathsWereNotExecutionPaths": True, "allRawFilesEqual": True, "fileCount": len(mapping), "preservedEarlierOriginalArchiveFileCount": 231, "bindings": mapping}, indent=2) + "\n", encoding="utf-8", newline="\n")
print(json.dumps({"packagedRawFiles": len(mapping), "originalsPreserved": True, "allDestinationsWithinWorkspace": True, "shortPathsWereNotExecutionPaths": True}))
