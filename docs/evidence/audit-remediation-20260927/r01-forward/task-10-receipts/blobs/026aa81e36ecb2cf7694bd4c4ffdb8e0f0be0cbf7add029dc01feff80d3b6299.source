import datetime, hashlib, json, os, pathlib, re, subprocess, sys, time
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
contracts=json.loads((pathlib.Path(__file__).parent/"task-10-receipt-contracts.json").read_text())
def eligible(r, mode, kind="composition"):
    c=contracts[kind]
    flags=c["flags"]+(c.get("componentFlags",[]) if mode=="component" else [])
    if r.get("receiptType")!=kind or r.get("mode")!=mode or mode not in c["modes"]:return False
    if any(r.get(k) is not True for k in flags) or r.get("failedFinalFlags")!=[] or r.get("error") not in (None,""):return False
    if "testExit" in c and (type(r.get("testExit")) is not int or r["testExit"]!=c["testExit"]):return False
    if kind=="composition" and r.get("requiredFinalFlags")!=c["flags"]:return False
    if kind=="gates":
        gs=r.get("gates",[])
        return sorted(g.get("gate","") for g in gs)==["build","lint","tests","typecheck"] and all(type(g.get("exit")) is int and g["exit"]==0 for g in gs)
    return True

def main():
    root=pathlib.Path.cwd()
    receipts=root/".superpowers/sdd/r01-forward-schema-plan-20261001"
    accepted={}
    for mode in ("hosted","modern","component"):
        candidates=[]
        for p in receipts.glob("task-10-"+mode+"-*/receipt.json"):
            r=json.loads(p.read_text())
            if eligible(r,mode):
                candidates.append((r["at"],p,r))
        if not candidates: raise SystemExit("Final both-profile GREEN required: "+mode)
        accepted[mode]=max(candidates,key=lambda x:x[0])
    if any(accepted["hosted"][2]["frozenInputs"] != x[2]["frozenInputs"] for x in accepted.values()):
        raise SystemExit("Final profiles must bind identical executable bytes")
    paths=list(accepted["hosted"][2]["frozenInputs"])
    paths += ["docs/evidence/audit-remediation-20260927/r01-forward/task-10-gates.py","package.json","bun.lock","tsconfig.json","eslint.config.js","vite.config.ts"]
    paths += ["docs/evidence/audit-remediation-20260927/migration-manifest.csv","docs/evidence/audit-remediation-20260927/r01-forward/task-10-package.py"]
    def blobs():
        return {p:{"sha256":hashlib.sha256((root/p).read_bytes()).hexdigest(),"canonicalSha256":hashlib.sha256((root/p).read_bytes().replace(b"\r\n",b"\n")).hexdigest(),"gitBlob":subprocess.check_output(["git","hash-object","--no-filters",p],text=True).strip()} for p in paths}
    for name,expected in accepted["hosted"][2]["frozenInputs"].items():
        if hashlib.sha256((root/name).read_bytes()).hexdigest()!=expected["rawSha256"]: raise SystemExit("Current DB input differs: "+name)
    def state(port,database):
        code='import {localSourceState} from "./supabase/rls-tests/helpers/productionSchemaClone"; console.log(await localSourceState("postgresql://postgres:postgres@127.0.0.1:'+str(port)+'/'+database+'"));'
        return subprocess.check_output(["bun","-e",code],text=True).strip()
    env=os.environ.copy()
    for key in list(env):
        if key.endswith("TEST_DATABASE_URL") or key.endswith("ALLOW_LOCAL_FIXTURES"): env.pop(key)
    env.update(CHECKOUT_POLICY_TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:57322/postgres",SUPABASE_LOCAL_URL="http://127.0.0.1:52321")
    out=receipts/("task-10-gates-"+str(time.time_ns()))
    out.mkdir()
    (out/".gitattributes").write_bytes(b"* -text\n")
    archives={}
    for index,path in enumerate(paths):
        leaf=f"s{index:03}.source"
        (out/leaf).write_bytes((root/path).read_bytes())
        archives[path]=leaf
    receipt={"receiptType":"gates","mode":"local","failedFinalFlags":[],"sourceCommit":subprocess.check_output(["git","rev-parse","HEAD"],text=True).strip(),"startedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(),"testedFinalSourceBlobs":blobs(),"databaseReceipts":{m:str(x[1].relative_to(root)).replace("\\","/") for m,x in accepted.items()},"environment":"loopback modern57322/Auth52321; build54329 ci-placeholder; inherited feature DB opts removed","gates":[],"modernBefore":state(57322,"postgres"),"templateBefore":state(52322,"audit_pr135_20260929")}
    receipt["archivedInputs"]=archives
    for name,args in [("typecheck",["bun","run","typecheck"]),("tests",["bun","test","--isolate","--timeout","30000"]),("lint",["bun","run","lint"]),("build",["bun","run","build"])]:
        if name=="build":env.update(VITE_SUPABASE_URL="http://127.0.0.1:54329",VITE_SUPABASE_ANON_KEY="ci-placeholder-anon-key",SUPABASE_URL="http://127.0.0.1:54329",SUPABASE_SERVICE_ROLE_KEY="ci-placeholder-service-role-key")
        log=out/(name+".log");started=time.monotonic()
        with log.open("xb") as handle: code=subprocess.run(args,env=env,stdout=handle,stderr=subprocess.STDOUT).returncode
        text=log.read_text(encoding="utf-8",errors="replace")
        gate={"gate":name,"command":" ".join(args),"exit":code,"elapsedSeconds":round(time.monotonic()-started,2),"log":log.name,"logSha256":hashlib.sha256(log.read_bytes()).hexdigest()}
        if name=="tests":gate["summary"]=re.findall(r"^\s*\d+ (?:pass|fail|skip|expect\(\) calls)\s*$",text,re.M)
        receipt["gates"].append(gate)
        (out/"receipt.json").write_text(json.dumps(receipt,indent=2)+"\n")
        print(json.dumps(gate),flush=True)
        if code: print(text[-4500:],flush=True)
    receipt.update(frozenInputsPreserved=blobs()==receipt["testedFinalSourceBlobs"],completedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),modernAfter=state(57322,"postgres"),templateAfter=state(52322,"audit_pr135_20260929"))
    receipt["templatePreserved"]=receipt["templateBefore"]==receipt["templateAfter"]
    receipt["failedFinalFlags"]=[k for k in contracts["gates"]["flags"] if receipt.get(k) is not True]
    if any(g["exit"] for g in receipt["gates"]):receipt["failedFinalFlags"].append("gates")
    (out/"receipt.json").write_text(json.dumps(receipt,indent=2)+"\n")
    print(str(out),flush=True)
    sys.exit(int(any(g["exit"] for g in receipt["gates"]) or not receipt["frozenInputsPreserved"] or not receipt["templatePreserved"]))

if __name__=="__main__": main()
