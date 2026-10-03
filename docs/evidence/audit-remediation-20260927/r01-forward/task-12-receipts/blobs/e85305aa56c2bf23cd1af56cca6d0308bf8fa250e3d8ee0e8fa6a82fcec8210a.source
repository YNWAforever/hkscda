"""Exact immutable shared input references; no writes to accepted Task11 data."""
import hashlib, json, pathlib, shutil, subprocess, sys, uuid

BASE = "f4e96e3484d135d179caea835d913552d96d2dcb"
PREFIX = "docs/evidence/audit-remediation-20260927/r01-forward/"
PINS = {
    sha: {"rawSha256": sha, "rawBytes": size, "rawGitBlob": blob,
          "baseCommit": BASE, "archivePath": PREFIX + "task-11-receipts/blobs/" + sha + ".source"}
    for sha, size, blob in [
        ("9a10e08a4ae74e315f5f63d67e2cfc4763fa19591bea70d36dd1198b880ef166", 533, "9c3b7503a1d71e4f1ba933e8b152990550935191"),
        ("5cb1e1862df295d6a91d8173b8dfcce1a8ba65a2e46d7a35bef6acabd81f7e6e", 11205, "7a5866dc7e338d282ec026141659fb643d4e2e83"),
        ("642fde7b8e47fbfa7f2c0cf8acb49413b0ad9921efadcbf5d25409818d8d296c", 671, "b2af4e51b9c0e4b5cb2a4e5fbb20c237d51be925"),
        ("f9bb15ea9c82f5df62d00d4815e4a6fb87f0fcd01507bde6e9e0a61206b452a2", 547, "f01abb41a2ff6c2e25eb210f72423fc3cb19d2f3"),
    ]
}

def git_blob(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()

def validate_identity(raw, pin, observed):
    if not isinstance(raw, bytes) or observed != pin:
        raise ValueError("Missing or mismatched existing base identity")
    if (hashlib.sha256(raw).hexdigest() != pin["rawSha256"] or
            len(raw) != pin["rawBytes"] or git_blob(raw) != pin["rawGitBlob"]):
        raise ValueError("Existing base raw bytes differ")
    return pin

def resolve_shared(raw, verified):
    pin = verified.get(hashlib.sha256(raw).hexdigest())
    return validate_identity(raw, pin, pin) if pin else None

def translation_entry(original, raw, identity):
    validate_identity(raw, identity, identity)
    return {"originalPath": original, "archivePath": identity["archivePath"],
            "evidenceKind": "existing-base-shared-input", "baseCommit": identity["baseCommit"],
            "rawSha256": hashlib.sha256(raw).hexdigest(), "canonicalSha256": hashlib.sha256(raw.replace(b"\r\n", b"\n")).hexdigest(),
            "rawGitBlob": git_blob(raw), "rawBytes": len(raw)}

def verify_existing(root, run):
    verified = {}
    for sha, pin in PINS.items():
        tree = run(["git", "ls-tree", BASE, "--", pin["archivePath"]]).decode().strip().split("\t")
        if len(tree) != 2 or tree[1] != pin["archivePath"] or tree[0] != "100644 blob " + pin["rawGitBlob"]:
            raise ValueError("Pinned base object absent or different: " + sha)
        raw = run(["git", "cat-file", "blob", pin["rawGitBlob"]])
        validate_identity(raw, pin, pin)
        validate_identity((root / pin["archivePath"]).read_bytes(), pin, pin)
        attrs = run(["git", "check-attr", "--cached", "text", "diff", "merge", "--", pin["archivePath"]]).decode().splitlines()
        if attrs != [pin["archivePath"] + ": " + key + ": unset" for key in ["text", "diff", "merge"]]:
            raise ValueError("Existing binary attributes differ")
        verified[sha] = pin
    return verified

def main():
    root = pathlib.Path.cwd().resolve()
    scratch = root / ".superpowers/sdd/r01-forward-schema-plan-20261001"
    out = scratch / ("task-12-ref-" + uuid.uuid4().hex[:12])
    out.mkdir()
    count = 0
    def run(args):
        nonlocal count
        count += 1
        leaf = out / ("command-%03d" % count)
        leaf.with_suffix(".invocation.json").write_text(json.dumps({"args": args}) + "\n", newline="\n")
        result = subprocess.run(args, cwd=root, capture_output=True)
        leaf.with_suffix(".stdout.source").write_bytes(result.stdout)
        leaf.with_suffix(".stderr.source").write_bytes(result.stderr)
        leaf.with_suffix(".exit.json").write_text(json.dumps({"exit": result.returncode}) + "\n", newline="\n")
        if result.returncode:
            raise ValueError("Existing input Git check failed: " + str(result.returncode))
        return result.stdout
    source = pathlib.Path(__file__)
    (out / "validator.source").write_bytes(source.read_bytes())
    verified = verify_existing(root, run)
    receipt = {"receiptVersion": 1, "mode": "four-existing-base-references", "baseCommit": BASE,
               "verified": verified, "error": None, "auditPolicyChanged": False, "task11Writes": False,
               "duplicatePreserved": False, "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest()}
    if "--preserve-duplicate" in sys.argv:
        sha = next(iter(PINS))
        relative = PREFIX + "task-12-receipts/blobs/" + sha + ".source"
        duplicate = (root / relative).resolve()
        if not duplicate.is_relative_to(root) or duplicate != root / relative:
            raise ValueError("Owned duplicate path differs")
        raw = duplicate.read_bytes()
        validate_identity(raw, PINS[sha], verified[sha])
        if run(["git", "ls-tree", BASE, "--", relative]).strip():
            raise ValueError("Refusing removal of an existing base artifact")
        staged = run(["git", "ls-files", "--stage", "--", relative]).decode().strip()
        if staged not in ["", "100644 " + PINS[sha]["rawGitBlob"] + " 0\t" + relative]:
            raise ValueError("Owned staged duplicate differs")
        if not run(["git", "check-ignore", str(out.relative_to(root))]).strip():
            raise ValueError("Owned scratch is not ignored")
        receipt["duplicateAlreadyUnindexed"] = staged == ""
        if staged:
            run(["git", "restore", "--staged", "--", relative])
        preserved = out / "duplicate.source"
        shutil.move(str(duplicate), str(preserved))
        validate_identity(preserved.read_bytes(), PINS[sha], verified[sha])
        receipt["duplicatePreserved"] = True
        receipt["duplicateTranslation"] = translation_entry(relative, raw, PINS[sha])
        receipt["preservedDuplicatePath"] = str(preserved.relative_to(root)).replace("\\", "/")
    (out / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", newline="\n")
    print(json.dumps({"out": str(out), "verified": len(verified), "duplicatePreserved": receipt["duplicatePreserved"]}))

if __name__ == "__main__":
    main()
