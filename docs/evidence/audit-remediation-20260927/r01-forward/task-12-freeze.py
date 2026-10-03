"""Bind the committed executable source; final proof commits may bridge this frozen source."""
import hashlib, json, pathlib, subprocess, uuid

root = pathlib.Path.cwd()
prefix = "docs/evidence/audit-remediation-20260927/r01-forward/"
scratch = root / ".superpowers/sdd/r01-forward-schema-plan-20261001"
out = scratch / ("task-12-freeze-" + uuid.uuid4().hex[:12])
out.mkdir()
head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
tree = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], text=True).strip()
tracked = subprocess.check_output(["git", "ls-files"], text=True).splitlines()
paths = {p for p in tracked if p.startswith(prefix + "task-12-") and
         not p.startswith(prefix + "task-12-receipts/") and p != prefix + "task-12-source-freeze.json"}
paths |= {p for p in tracked if p.startswith("src/lib/groupEnquiries/atomicForward")}
paths |= {".github/workflows/ci.yml", "package.json", "bun.lock", "tsconfig.json", "eslint.config.js", "vite.config.ts",
          "supabase/rls-tests/helpers/productionSchemaClone.ts", "src/lib/content/serviceSloganCopy.test.ts",
          "src/lib/groupEnquiries/repository.server.ts", "src/lib/groupEnquiries/service.ts", "src/lib/groupEnquiries/service.test.ts",
          "src/routes/api/admin/volunteers/group-enquiries.ts", "src/lib/admin/access.ts",
          "src/lib/operations/releaseSchema.ts", "src/lib/operations/releaseManifest.ts",
          "supabase/migrations/20261003005322_r01_group_enquiry_forward.sql",
          "supabase/migrations/20260926060314_atomic_group_enquiry_audit.sql"}
paths |= {prefix + "task-" + n + "-profile.ts" for n in ["9", "10", "11"]}
bindings = {}
for i, path in enumerate(sorted(paths)):
    if subprocess.check_output(["git", "diff", "HEAD", "--", path]):
        raise ValueError("Uncommitted executable source: " + path)
    raw = (root / path).read_bytes()
    archive = "s%03d.source" % i
    (out / archive).write_bytes(raw)
    bindings[path] = {"rawSha256": hashlib.sha256(raw).hexdigest(),
                      "canonicalSha256": hashlib.sha256(raw.replace(b"\r\n", b"\n")).hexdigest(),
                      "rawGitBlob": hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest(),
                      "rawBytes": len(raw), "archivePath": (out / archive).relative_to(root).as_posix()}
receipt = {"receiptVersion": 1, "mode": "task12-source-freeze", "error": None,
           "sourceCommit": head, "sourceTree": tree, "sourceBase": "f4e96e3484d135d179caea835d913552d96d2dcb",
           "bindings": bindings, "policy": "Committed executable bytes bind all final runs; final evidence commit bridges this source without claiming its own committed HEAD.",
           "migration": bindings["supabase/migrations/20261003005322_r01_group_enquiry_forward.sql"]}
raw = (json.dumps(receipt, indent=2) + "\n").encode()
(out / "receipt.json").write_bytes(raw)
(root / prefix / "task-12-source-freeze.json").write_bytes(raw)
print(json.dumps({"out": str(out), "sourceCommit": head, "sourceTree": tree, "bindings": len(bindings), "migration": receipt["migration"]}))
