"""Final four local gates; consume exact qualified three-profile frozen bytes."""
import datetime, hashlib, json, os, pathlib, re, subprocess, sys, time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
root = pathlib.Path.cwd()
evidence = pathlib.Path(__file__).parent
scratch = root / ".superpowers/sdd/r01-forward-schema-plan-20261001"
flags = ["finalProfilesQualified", "sourceFrozen", "frozenInputsPreserved", "templatePreserved"]

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def check_receipt(path, mode, kind="assertComposition"):
    code = 'import {' + kind + '} from "./docs/evidence/audit-remediation-20260927/r01-forward/task-12-receipt";import {readFile} from "node:fs/promises";const r=JSON.parse(await readFile(process.argv[1],"utf8"));' + kind + '(r' + (',process.argv[2]' if kind == "assertComposition" else '') + ');'
    subprocess.run(["bun", "-e", code, str(path), mode], check=True, capture_output=True)

def state(label):
    code = 'import {protectedCapture} from "./docs/evidence/audit-remediation-20260927/r01-forward/task-12-protected";console.log(JSON.stringify(await protectedCapture(process.argv[1],process.argv[2])));'
    return json.loads(subprocess.check_output(["bun", "-e", code, str(out), label], text=True))

accepted = {}
for mode in ["hosted", "modern", "component"]:
    for path in sorted(scratch.glob("task-12-" + mode + "-*/receipt.json"), reverse=True):
        try:
            check_receipt(path, mode)
            accepted[mode] = (path, json.loads(path.read_text()))
            break
        except subprocess.CalledProcessError:
            continue
    if mode not in accepted:
        raise SystemExit("Exact qualified final profile absent:" + mode)

frozen = accepted["hosted"][1]["frozenInputs"]
if any(r["frozenInputs"] != frozen for _, r in accepted.values()):
    raise SystemExit("Final three profiles do not bind identical executable bytes")
if any(sha((root / p).read_bytes()) != b["rawSha256"] for p, b in frozen.items()):
    raise SystemExit("Current executable source differs from qualified profile")

paths = sorted(set(frozen) | {
    str(p.relative_to(root)).replace("\\", "/") for p in evidence.glob("task-12-*")
    if p.suffix in [".ts", ".py", ".json"] and p.is_file()
} | {"package.json", "bun.lock", "tsconfig.json", "eslint.config.js", "vite.config.ts"})
out = scratch / ("task-12-gates-" + str(time.time_ns()))
out.mkdir()
bindings = {}
for i, path in enumerate(paths):
    raw = (root / path).read_bytes()
    leaf = f"s{i:03}.source"
    (out / leaf).write_bytes(raw)
    bindings[path] = {"rawSha256": sha(raw), "canonicalSha256": sha(raw.replace(b"\r\n", b"\n")), "rawBytes": len(raw), "rawGitBlob": subprocess.check_output(["git", "hash-object", "--no-filters", path], text=True).strip(), "archive": leaf}

r = {"receiptVersion": 1,"receiptType": "gates", "mode": "local", "requiredFinalFlags": flags, "error": None,
     "failedFinalFlags": [], "finalProfilesQualified": True, "sourceFrozen": True,
     "startedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
     "sourceCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
     "frozenInputs": bindings, "databaseReceipts": {m: str(p.relative_to(root)).replace("\\", "/") for m, (p, _) in accepted.items()},
     "environment": "modern57322/Auth52321; build54329 ci-placeholder; inherited feature DB options removed",
     "gates": [], "productionApplied": False, "deployed": False, "operationallyEnabled": False}

def save():
    (out / "receipt.json").write_text(json.dumps(r, indent=2) + "\n", newline="\n")

try:
    r["protectedBefore"] = state("protected-before")
    env = os.environ.copy()
    for key in list(env):
        if key.endswith("TEST_DATABASE_URL") or key.endswith("ALLOW_LOCAL_FIXTURES"):
            env.pop(key)
    env.update(CHECKOUT_POLICY_TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:57322/postgres", SUPABASE_LOCAL_URL="http://127.0.0.1:52321")
    for name, args in [("typecheck", ["bun", "run", "typecheck"]), ("tests", ["bun", "test", "--isolate", "--timeout", "30000"]), ("lint", ["bun", "run", "lint"]), ("build", ["bun", "run", "build"])]:
        if name == "build":
            env.update(VITE_SUPABASE_URL="http://127.0.0.1:54329", VITE_SUPABASE_ANON_KEY="ci-placeholder-anon-key", SUPABASE_URL="http://127.0.0.1:54329", SUPABASE_SERVICE_ROLE_KEY="ci-placeholder-service-role-key")
        log = out / (name + ".log")
        (out / (name + ".invocation.json")).write_text(json.dumps({"command": args, "environment": r["environment"]}) + "\n", newline="\n")
        start = time.monotonic()
        with log.open("xb") as handle:
            exit_code = subprocess.run(args, env=env, stdout=handle, stderr=subprocess.STDOUT).returncode
        content = log.read_text(encoding="utf-8", errors="replace")
        gate = {"gate": name, "command": args, "exit": exit_code, "elapsedSeconds": round(time.monotonic() - start, 2), "log": log.name, "logSha256": sha(log.read_bytes())}
        if name == "tests":
            gate["summary"] = re.findall(r"^\s*\d+ (?:pass|fail|skip|expect\(\) calls)\s*$", content, re.M)
        if name == "lint":
            gate["summary"] = re.findall(r"^.*\d+ problems.*$", content, re.M)
        r["gates"].append(gate)
        save()
        print(json.dumps(gate), flush=True)
        if exit_code:
            print(content[-6500:], flush=True)
    r["frozenInputsPreserved"] = all(sha((root / p).read_bytes()) == b["rawSha256"] for p, b in bindings.items())
except Exception as error:
    r["error"] = str(error)
finally:
    try:
        r["protectedAfter"] = state("protected-after")
        r["templatePreserved"] = r.get("protectedBefore", {}).get("template") == r["protectedAfter"]["template"] and "protectedBefore" in r
        r["sharedModernAggregateChanged"] = r.get("protectedBefore", {}).get("modern") != r["protectedAfter"]["modern"]
        r["sharedModernQualification"] = "R52: full-suite shared modern aggregate observations; no exclusive catalog/Auth/native/ACL preservation claim"
    except Exception as error:
        r["templatePreserved"] = False
        r["error"] = "; ".join(filter(None, [r["error"], "Final protected capture failed: " + str(error)]))
    r["failedFinalFlags"] = [k for k in flags if r.get(k) is not True]
    r["completedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    save()
    r["eligible"] = False
    try:
        check_receipt(out / "receipt.json", "local", "assertGates")
        r["eligible"] = True
    except Exception as error:
        if r["error"] is None and not r["failedFinalFlags"]:
            r["error"] = str(error)
    save()
    print(json.dumps({"out": str(out), "eligible": r["eligible"], "error": r["error"], "failedFinalFlags": r["failedFinalFlags"]}), flush=True)
    sys.exit(0 if r["eligible"] else 1)
