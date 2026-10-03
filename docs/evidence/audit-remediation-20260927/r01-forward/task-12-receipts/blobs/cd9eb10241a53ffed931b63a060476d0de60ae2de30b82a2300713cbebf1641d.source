"""Independently read every original/archive pair and exact immutable base reference."""
import hashlib, importlib.util, json, pathlib, subprocess
root = pathlib.Path.cwd()
source = pathlib.Path(__file__).with_name("task-12-package-reference.py")
spec = importlib.util.spec_from_file_location("reference", source)
reference = importlib.util.module_from_spec(spec); spec.loader.exec_module(reference)
def run(args):
    return subprocess.check_output(args, cwd=root)
verified = reference.verify_existing(root, run)
path = root / reference.PREFIX / "task-12-receipts/translation.json"
value = json.loads(path.read_text())
if (value["receiptVersion"] != 1 or value["mode"] != "task12-raw-proofs-exact-four-existing-references" or
        value["error"] is not None or value["baseCommit"] != reference.BASE or value["sharedPins"] != verified or
        any(value[k] is not False for k in ["auditPolicyChanged", "task11Writes", "r65Applied"])):
    raise ValueError("Exact Task12 packaging contract differs")
seen = set()
for entry in value["entries"]:
    original = root / entry["originalPath"]
    archive = root / entry["archivePath"]
    if entry["originalPath"] in seen:
        raise ValueError("Duplicate original locator")
    seen.add(entry["originalPath"])
    raw = original.read_bytes()
    if archive.read_bytes() != raw or entry["rawSha256"] != hashlib.sha256(raw).hexdigest() or entry["rawBytes"] != len(raw) or entry["rawGitBlob"] != reference.git_blob(raw) or entry["canonicalSha256"] != hashlib.sha256(raw.replace(b"\r\n", b"\n")).hexdigest():
        raise ValueError("Original/raw/canonical/Git/archive mismatch: " + entry["originalPath"])
    shared = reference.resolve_shared(raw, verified)
    if shared:
        if entry != reference.translation_entry(entry["originalPath"], raw, shared):
            raise ValueError("Shared reference differs")
    elif entry["evidenceKind"] != "new-task12-original-proof" or entry["archivePath"] != reference.PREFIX + "task-12-receipts/blobs/" + entry["rawSha256"] + ".source":
        raise ValueError("New payload routed outside its Task12 address")
if not seen:
    raise ValueError("Empty proof package")
if subprocess.check_output(["git", "diff", reference.BASE, "--", reference.PREFIX + "task-11-receipts", "src/lib/content/serviceSloganCopy.test.ts"]):
    raise ValueError("Historical shared data or audit policy changed")
print(json.dumps({"receiptVersion": 1, "mode": "task12-package-independent-pairs", "error": None, "verifiedOriginalArchivePairs": len(seen), "sharedPins": len(verified), "auditPolicyChanged": False, "task11Writes": False}))
