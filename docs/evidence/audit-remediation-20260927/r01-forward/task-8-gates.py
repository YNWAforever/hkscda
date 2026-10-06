"""Four local gates bound to both Task8 focused GREEN executable sources."""
import datetime, hashlib, json, os, pathlib, re, subprocess, sys, time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

root = pathlib.Path.cwd()
evidence = root / "docs/evidence/audit-remediation-20260927/r01-forward"
accepted = {}
for mode in ("hosted", "modern"):
    candidates = []
    for path in (evidence / "task-8-atomic-receipts").glob(mode + "-*/receipt.json"):
        receipt = json.loads(path.read_text())
        flags = ["baselineRollbackPreserved", "onlyTargetsChanged", "helpersPreserved", "migrationRowsPreserved", "migrationExtraPreserved", "secondApplyPreserved", "testsCatalogPreserved", "testsRowsPreserved", "testsExtraPreserved", "templatePreserved", "modernPreserved", "frozenInputsPreserved"]
        if receipt.get("testExit") == 0 and not receipt.get("error") and all(receipt.get(k) is True for k in flags) and len(receipt.get("refusals", [])) == 12:
            candidates.append((receipt["at"], path, receipt))
    if not candidates:
        raise SystemExit("Final focused GREEN absent: " + mode)
    accepted[mode] = max(candidates, key=lambda x: x[0])

frozen = accepted["hosted"][2]["frozenInputs"]
if any(item[2]["frozenInputs"] != frozen for item in accepted.values()):
    raise SystemExit("Final profiles bind different executable bytes")
sha = lambda raw: hashlib.sha256(raw).hexdigest()
if any(sha((root / path).read_bytes()) != expected for path, expected in frozen.items()):
    raise SystemExit("Current source differs from focused profiles")
paths = list(frozen) + ["supabase/rls-tests/helpers/runR01VolunteerForward.ts", "supabase/rls-tests/helpers/runR01VolunteerShapeRed.ts", "docs/evidence/audit-remediation-20260927/r01-forward/task-8-gates.py", "package.json", "bun.lock", "tsconfig.json", "eslint.config.js", "vite.config.ts"]
out = evidence / "task-8-gates-receipts" / str(time.time_ns())
out.mkdir(parents=True)
(out / ".gitattributes").write_bytes(b"* -text\n")
bindings = {}
for index, path in enumerate(paths):
    raw = (root / path).read_bytes()
    leaf = f"s{index:03}.source"
    (out / leaf).write_bytes(raw)
    bindings[path] = {"sha256": sha(raw), "canonicalSha256": sha(raw.replace(b"\r\n", b"\n")), "archive": leaf, "gitBlob": subprocess.check_output(["git", "hash-object", "--no-filters", path], text=True).strip()}
    committed = subprocess.check_output(["git", "show", "HEAD:" + path])
    bindings[path].update(committedGitBlob=subprocess.check_output(["git", "rev-parse", "HEAD:" + path], text=True).strip(), committedSha256=sha(committed), committedCanonicalSha256=sha(committed.replace(b"\r\n", b"\n")))
    if bindings[path]["canonicalSha256"] != bindings[path]["committedCanonicalSha256"]:
        raise SystemExit("Gate input differs from committed source: " + path)

def state(port, database):
    code = 'import {localSourceState} from "./supabase/rls-tests/helpers/productionSchemaClone";console.log(await localSourceState("postgresql://postgres:postgres@127.0.0.1:' + str(port) + '/' + database + '"));'
    return subprocess.check_output(["bun", "-e", code], text=True).strip()

result = {"sourceCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(), "startedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "databaseReceipts": {mode: str(item[1].relative_to(root)).replace("\\", "/") for mode, item in accepted.items()}, "frozenInputs": bindings, "environment": "controller-approved OS-only environment; Bun --no-env-file; all *TEST_DATABASE_URL/*ALLOW_LOCAL_FIXTURES omitted; unavailable loopback59999 ci-placeholder keys; feature DB tests skipped, not acceptance", "gates": [], "productionApplied": False, "deployed": False, "operationallyEnabled": False}
os_keys = {"PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "COMMONPROGRAMFILES", "COMMONPROGRAMFILES(X86)", "PATHEXT", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS"}
env = {key: value for key, value in os.environ.items() if key.upper() in os_keys}
env.update(VITE_SUPABASE_URL="http://127.0.0.1:59999", VITE_SUPABASE_ANON_KEY="ci-placeholder-anon-key", SUPABASE_URL="http://127.0.0.1:59999", SUPABASE_SERVICE_ROLE_KEY="ci-placeholder-service-role-key", SUPABASE_LOCAL_URL="http://127.0.0.1:59999")
try:
    result["modernBefore"] = state(57322, "postgres")
    result["templateBefore"] = state(52322, "audit_pr135_20260929")
    for name, args in [("typecheck", ["bun", "--no-env-file", "run", "typecheck"]), ("tests", ["bun", "--no-env-file", "test", "--isolate", "--timeout", "30000"]), ("lint", ["bun", "--no-env-file", "run", "lint"]), ("build", ["bun", "--no-env-file", "run", "build"])]:
        log = out / (name + ".log")
        start = time.monotonic()
        with log.open("xb") as handle:
            code = subprocess.run(args, env=env, stdout=handle, stderr=subprocess.STDOUT).returncode
        content = log.read_text(encoding="utf-8", errors="replace")
        gate = {"gate": name, "command": args, "exit": code, "elapsedSeconds": round(time.monotonic() - start, 2), "log": log.name, "sha256": sha(log.read_bytes())}
        if name == "tests":
            gate["summary"] = re.findall(r"^\s*\d+ (?:pass|fail|skip|expect\(\) calls)\s*$", content, re.M)
        if name == "lint":
            gate["summary"] = re.findall(r"^.*\d+ problems.*$", content, re.M)
        result["gates"].append(gate)
        (out / "receipt.json").write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(gate), flush=True)
        if code:
            print(content[-6000:], flush=True)
    result["modernAfter"] = state(57322, "postgres")
    result["templateAfter"] = state(52322, "audit_pr135_20260929")
    result["modernPreserved"] = result["modernBefore"] == result["modernAfter"]
    result["templatePreserved"] = result["templateBefore"] == result["templateAfter"]
    result["frozenInputsPreserved"] = all(sha((root / path).read_bytes()) == expected["sha256"] for path, expected in bindings.items())
except Exception as error:
    result["error"] = str(error)
finally:
    result["completedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    (out / "receipt.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"out": str(out), "error": result.get("error"), "frozenInputsPreserved": result.get("frozenInputsPreserved")}), flush=True)
sys.exit(int(bool(result.get("error")) or any(gate["exit"] for gate in result["gates"]) or not all(result.get(k) is True for k in ("modernPreserved", "templatePreserved", "frozenInputsPreserved"))))
