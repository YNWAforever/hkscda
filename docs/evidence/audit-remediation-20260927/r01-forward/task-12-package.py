"""Archive original Task12 proof bytes with only R66's four exact existing references."""
import hashlib, importlib.util, json, pathlib, subprocess

root = pathlib.Path.cwd()
source = pathlib.Path(__file__).with_name("task-12-package-reference.py")
spec = importlib.util.spec_from_file_location("reference", source)
reference = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reference)
scratch = root / ".superpowers/sdd/r01-forward-schema-plan-20261001"
out = root / reference.PREFIX / "task-12-receipts"
blobs = out / "blobs"
blobs.mkdir(parents=True, exist_ok=True)
# Existing staged Task12 binary attributes stay unchanged; the content audit still scans these files.
if (out / ".gitattributes").read_bytes() != b"* -text\nblobs/*.source binary\n":
    raise ValueError("Task12 archival attributes differ")
commands = []
def run(args):
    i = len(commands)
    leaf = scratch / "task-12-package-git"
    leaf.mkdir(exist_ok=True)
    (leaf / (str(i) + ".invocation.json")).write_text(json.dumps(args) + "\n", newline="\n")
    result = subprocess.run(args, cwd=root, capture_output=True)
    (leaf / (str(i) + ".stdout.source")).write_bytes(result.stdout)
    (leaf / (str(i) + ".stderr.source")).write_bytes(result.stderr)
    commands.append({"command": args, "exit": result.returncode})
    if result.returncode:
        raise ValueError("Base reference check failed")
    return result.stdout
verified = reference.verify_existing(root, run)
entries = []
for source_path in sorted(scratch.glob("task-12-*")):
    if source_path.name == "task-12-report.md":
        continue
    files = sorted(source_path.rglob("*")) if source_path.is_dir() else [source_path]
    for file in files:
        if not file.is_file():
            continue
        raw = file.read_bytes()
        original = file.relative_to(root).as_posix()
        shared = reference.resolve_shared(raw, verified)
        if shared:
            entry = reference.translation_entry(original, raw, shared)
        else:
            sha = hashlib.sha256(raw).hexdigest()
            archive = blobs / (sha + ".source")
            if archive.exists() and archive.read_bytes() != raw:
                raise ValueError("Content address collision")
            if not archive.exists():
                archive.write_bytes(raw)
            entry = {"originalPath": original, "archivePath": archive.relative_to(root).as_posix(),
                     "evidenceKind": "new-task12-original-proof", "rawSha256": sha,
                     "canonicalSha256": hashlib.sha256(raw.replace(b"\r\n", b"\n")).hexdigest(),
                     "rawGitBlob": reference.git_blob(raw), "rawBytes": len(raw)}
        entries.append(entry)
translation = {"receiptVersion": 1, "mode": "task12-raw-proofs-exact-four-existing-references",
               "error": None, "baseCommit": reference.BASE, "sharedPins": verified,
               "auditPolicyChanged": False, "task11Writes": False, "r65Applied": False,
               "policy": "Every original execution/archive locator and byte identity is retained. Only four pinned unchanged f4 inputs reference existing Task11 data; references are not new execution evidence. All other new Task12 bytes remain audited normally.",
               "entries": entries, "baseVerificationCommands": commands}
(out / "translation.json").write_text(json.dumps(translation, indent=2) + "\n", newline="\n")
print(json.dumps({"rawFiles": len(entries), "sharedReferences": sum(e["evidenceKind"] == "existing-base-shared-input" for e in entries),
                  "uniqueNewRawBlobs": len(list(blobs.glob("*.source"))), "uniqueNewBytes": sum(p.stat().st_size for p in blobs.glob("*.source"))}))
