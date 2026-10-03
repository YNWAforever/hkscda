"""Preserve every original Task11 proof byte in content-addressed Git archives."""
import hashlib, json, pathlib, subprocess

root = pathlib.Path.cwd()
scratch = root / ".superpowers/sdd/r01-forward-schema-plan-20261001"
out = root / "docs/evidence/audit-remediation-20260927/r01-forward/task-11-receipts"
out.mkdir(exist_ok=True)
(out / ".gitattributes").write_bytes(b"* -text\nblobs/*.source binary\n")
blobs = out / "blobs"
blobs.mkdir(exist_ok=True)
translation = out / "translation.json"
entries = json.loads(translation.read_text())["entries"] if translation.exists() else []
seen = {(e["originalPath"], e["rawSha256"]) for e in entries}
for source in sorted(scratch.glob("task-11-*")):
    if source.name == "task-11-report.md":
        continue
    files = sorted(source.rglob("*")) if source.is_dir() else [source]
    for file in files:
        if not file.is_file():
            continue
        raw = file.read_bytes()
        sha = hashlib.sha256(raw).hexdigest()
        archive = blobs / (sha + ".source")
        if not archive.exists():
            archive.write_bytes(raw)
        elif archive.read_bytes() != raw:
            raise RuntimeError("Content address collision")
        original = str(file.relative_to(root)).replace("\\", "/")
        if (original, sha) in seen:
            continue
        seen.add((original, sha))
        entries.append({"originalPath": original, "archivePath": str(archive.relative_to(root)).replace("\\", "/"), "rawSha256": sha, "canonicalSha256": hashlib.sha256(raw.replace(b"\r\n", b"\n")).hexdigest(), "bytes": len(raw), "gitBlob": subprocess.check_output(["git", "hash-object", "--no-filters", str(file)], text=True).strip()})
translation.write_text(json.dumps({"policy": "Original raw failures and successes remain immutable. Binary .source archives preserve raw Git identities and avoid Bun discovery. Each original path and receipt field is retained.", "entries": entries}, indent=2) + "\n", newline="\n")
print(json.dumps({"rawFiles": len(entries), "uniqueRawBlobs": len(list(blobs.glob("*.source"))), "uniqueBytes": sum(p.stat().st_size for p in blobs.glob("*.source"))}))
