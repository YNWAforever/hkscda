"""Package preserved Task8 raw receipts and verify every ZIP member byte-for-byte."""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path.cwd()
evidence = root / "docs/evidence/audit-remediation-20260927/r01-forward"
groups = ["task-8-red-receipts", "task-8-atomic-receipts", "task-8-shape-receipts", "task-8-cli-transport-receipts", "task-8-gates-receipts"]
files = sorted(path for group in groups for path in (evidence / group).rglob("*") if path.is_file())
archive = evidence / "task-8-raw-receipts.zip"
sha = lambda raw: hashlib.sha256(raw).hexdigest()
entries = []
with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
    for path in files:
        raw = path.read_bytes()
        member = path.relative_to(evidence).as_posix()
        bundle.writestr(member, raw)
        entries.append({"path": path.relative_to(root).as_posix(), "member": member, "bytes": len(raw), "sha256": sha(raw)})
with zipfile.ZipFile(archive) as bundle:
    if set(bundle.namelist()) != {entry["member"] for entry in entries}:
        raise RuntimeError("ZIP member inventory differs")
    for entry in entries:
        original = (root / entry["path"]).read_bytes()
        packed = bundle.read(entry["member"])
        if original != packed or len(packed) != entry["bytes"] or sha(packed) != entry["sha256"]:
            raise RuntimeError("ZIP member differs: " + entry["path"])
        entry["byteEqualToOriginal"] = True
manifest = {"archive": archive.relative_to(root).as_posix(), "archiveBytes": archive.stat().st_size, "archiveSha256": sha(archive.read_bytes()), "files": len(entries), "rawBytes": sum(entry["bytes"] for entry in entries), "allMembersByteEqual": True, "originalLocalPathsRetained": True, "normalizationPerformed": False, "entries": entries}
(evidence / "task-8-raw-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(json.dumps({key: value for key, value in manifest.items() if key != "entries"}))
