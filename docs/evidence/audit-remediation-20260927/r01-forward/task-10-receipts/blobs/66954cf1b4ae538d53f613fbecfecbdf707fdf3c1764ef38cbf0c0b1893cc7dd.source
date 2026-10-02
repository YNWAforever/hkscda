import hashlib,json,os,pathlib,subprocess,datetime
root=pathlib.Path.cwd(); out=root/'docs/evidence/audit-remediation-20260927/r01-forward'; base='592bcebda2dc0154d20684a1a2240cfbdd8ae3d1'
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==base
load=lambda p:json.loads((out/p).read_text(encoding='utf-8'))
green=load('task-6-green-receipts/task-6-green.json'); modern=load('task-6-green-receipts/task-6-green-modern.json'); gates=load('task-6-gate-receipts/task-6-final-gates.json'); proof=load('task-6-db-runtime-proof.json')
assert green['testedExecutableBlobs']==modern['testedExecutableBlobs']
for r in (green,modern):
    assert r['testExit']==0 and len(r['refusals'])==49 and all(x['status']=='55000' and x['preserved'] for x in r['refusals'])
    for k in ['normalBaselineAccepted','normalBaselineRollbackPreserved','migrationRowsPreserved','completeAuthDefaultsNativeLedgerPreserved','unrelatedCatalogPreserved','secondApplyCatalogIdentical','secondApplyRowsIdentical','postTestRowsPreserved','postTestCatalogPreserved','postTestAuthDefaultsNativeLedgerPreserved','templatePreserved','modernPreserved','frozenInputsPreserved']: assert r[k],k
assert gates['frozenInputsPreserved'] and all(g['exit']==0 for g in gates['gates'])
def blob(p,write=False):
    data=(root/p).read_bytes(); args=['git','hash-object']+(['-w'] if write else [])+['--path='+p,p]
    return {'sha256':hashlib.sha256(data).hexdigest(),'canonicalSha256':hashlib.sha256(data.replace(b'\r\n',b'\n')).hexdigest(),'gitBlob':subprocess.check_output(args,text=True).strip()}
current={p:blob(p) for p in gates['testedFinalSourceBlobs']}
for p,h in gates['testedFinalSourceBlobs'].items(): assert current[p]['sha256']==h['sha256'] and current[p]['canonicalSha256']==h['canonicalSha256'],p
changes=[p for p,h in green['testedExecutableBlobs'].items() if h['sha256']!=current[p]['sha256']]
assert changes==['src/lib/crm/http.server.ts'],changes
assert not proof['httpMappingInRuntimeClosure']
for p,h in proof['files'].items(): assert h['sha256']==green['testedExecutableBlobs'][p]['sha256']==blob(p)['sha256'],p
source_paths=['supabase/migrations/20261001213914_r01_crm_atomic_forward.sql','src/lib/crm/atomicForward.database.test.ts','src/lib/crm/atomicForward.http.test.ts','src/lib/crm/http.server.ts','supabase/rls-tests/helpers/runR01CrmForward.ts','docs/evidence/audit-remediation-20260927/migration-manifest.csv','docs/evidence/audit-remediation-20260927/r01-forward/task-6-gates.py']
index=root/'.superpowers/sdd/r01-forward-schema-plan-20261001/task-6-candidate-index'; assert index.resolve().is_relative_to(root.resolve()) and not index.exists()
env=os.environ.copy();env['GIT_INDEX_FILE']=str(index.resolve())
try:
    subprocess.run(['git','read-tree',base],env=env,check=True)
    for p in source_paths:
        h=blob(p,True);subprocess.run(['git','update-index','--add','--cacheinfo','100644,'+h['gitBlob']+','+p],env=env,check=True)
    tree=subprocess.check_output(['git','write-tree'],env=env,text=True).strip()
finally:
    if index.exists(): index.unlink()
receipts={str(p.relative_to(root)).replace('\\','/'):blob(str(p.relative_to(root)).replace('\\','/')) for d in ['task-6-red-receipts','task-6-preflight-receipts','task-6-green-receipts','task-6-http-receipts','task-6-gate-receipts'] for p in sorted((out/d).iterdir()) if p.is_file()}
for p in sorted(out.glob('task-6*')):
    if p.is_file() and p.name!='task-6-source-binding.json': receipts[str(p.relative_to(root)).replace('\\','/')]=blob(str(p.relative_to(root)).replace('\\','/'))
result={'executionParent':base,'branch':'codex/audit-r01-crm-atomic-20261002','testedSourceCandidateTree':tree,'candidateSourcePaths':source_paths,'packagingMeaning':'Candidate tree binds final executable source plus full-gate wrapper before evidence/tracker packaging; packaging HEAD is the commit containing this binding, not the execution parent. No SQL/DB runtime bytes changed after both profile runs. HTTP mapping only was separately ruled/tested/final-gated.','actualDatabaseExecutedSourceMap':green['testedExecutableBlobs'],'finalHttpAndGateSourceMap':current,'differingObservedDbInputs':changes,'qualification':'Both DB receipts retain the historical observed HTTP hash; that file was never imported/executed by the proved DB closure. Do not claim every observed DB input equals final candidate. HTTP mapping three-path actual RED4pass3fail; GREEN7pass20assertions; four final gates include final mapping.','dbRuntimeImportProof':proof,'gates':gates,'rawArtifacts':receipts,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(out/'task-6-source-binding.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'candidateTree':tree,'actualDbInputCount':len(green['testedExecutableBlobs']),'finalGateInputCount':len(current),'differingObservedDbInputs':changes,'rawArtifacts':len(receipts)}))