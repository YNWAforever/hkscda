import hashlib,json,os,pathlib,subprocess,datetime
root=pathlib.Path.cwd(); out=root/'docs/evidence/audit-remediation-20260927/r01-forward'; base='7f7a280f0126cf3e7066fd50fbd2dbc5c8609297'
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==base
load=lambda p:json.loads((out/p).read_text(encoding='utf-8'))
green=load('task-6-fix-1-receipts/task-6-green.json'); modern=load('task-6-fix-1-receipts/task-6-green-modern.json'); gates=load('task-6-fix-1-receipts/task-6-final-gates.json'); proof=load('task-6-fix-1-runtime-proof.json'); original=load('task-6-source-binding.json')
assert green['testedExecutableBlobs']==modern['testedExecutableBlobs']
for r in (green,modern):
    assert r['testExit']==0 and len(r['refusals'])==61 and all(x['status']=='55000' and x['preserved'] for x in r['refusals'])
    assert all(x['setupComplete'] for x in r['refusals'][-12:])
    for k in ['normalBaselineAccepted','normalBaselineRollbackPreserved','migrationRowsPreserved','completeAuthDefaultsNativeLedgerPreserved','unrelatedCatalogPreserved','secondApplyCatalogIdentical','secondApplyRowsIdentical','postTestRowsPreserved','postTestCatalogPreserved','postTestAuthDefaultsNativeLedgerPreserved','templatePreserved','modernPreserved','frozenInputsPreserved']: assert r[k],k
assert gates['frozenInputsPreserved'] and len(gates['gates'])==4 and all(g['exit']==0 for g in gates['gates'])
def blob(p,write=False):
    data=(root/p).read_bytes(); args=['git','hash-object']+(['-w'] if write else [])+['--path='+p,p]
    return {'sha256':hashlib.sha256(data).hexdigest(),'canonicalSha256':hashlib.sha256(data.replace(b'\r\n',b'\n')).hexdigest(),'gitBlob':subprocess.check_output(args,text=True).strip()}
current={p:blob(p) for p in gates['testedFinalSourceBlobs']}
for p,h in gates['testedFinalSourceBlobs'].items(): assert current[p]['sha256']==h['sha256'] and current[p]['canonicalSha256']==h['canonicalSha256'],p
for p,h in green['testedExecutableBlobs'].items(): assert h['sha256']==current[p]['sha256'],p
assert not proof['httpMappingInRuntimeClosure']
for p,h in proof['files'].items(): assert h['sha256']==green['testedExecutableBlobs'][p]['sha256']==blob(p)['sha256'],p
sql='supabase/migrations/20261001213914_r01_crm_atomic_forward.sql'; oldsql=subprocess.check_output(['git','show',base+':'+sql]); new=(root/sql).read_bytes(); marker=b'  -- No writes precede this line.'; assert oldsql.split(marker)[1]==new.split(marker)[1]
assert new.count(b'p.pronargdefaults=0 and p.proargdefaults is null')==5
original_versions={}
for p,a in {sql:'red-executed-forward.sql','supabase/rls-tests/helpers/runR01CrmForward.ts':'base-7f-runner.ts','docs/evidence/audit-remediation-20260927/migration-manifest.csv':'base-7f-manifest.csv','docs/evidence/audit-remediation-20260927/r01-forward/task-6-generate.ts':'base-7f-generator.ts'}.items():
    archived='docs/evidence/audit-remediation-20260927/r01-forward/task-6-fix-1-receipts/'+a; prior=(original['rawArtifacts'] if p.endswith('task-6-generate.ts') else original['finalHttpAndGateSourceMap'])[p]; h=blob(archived); gitdata=subprocess.check_output(['git','show',base+':'+p]); assert h['sha256']==prior['sha256'] and h['canonicalSha256']==hashlib.sha256(gitdata).hexdigest(),p
    original_versions[p]={'originalObserved':prior,'exactOriginalArchive':archived,'archiveBlob':h,'fixBaseGitBlob':subprocess.check_output(['git','rev-parse',base+':'+p],text=True).strip(),'fixBaseCanonicalSHA256':hashlib.sha256(gitdata).hexdigest()}
oldraw_changed=[p for p,h in original['rawArtifacts'].items() if blob(p)['sha256']!=h['sha256']]
assert oldraw_changed==['docs/evidence/audit-remediation-20260927/r01-forward/task-6-generate.ts'],oldraw_changed
source_paths=[sql,'supabase/rls-tests/helpers/runR01CrmForward.ts','docs/evidence/audit-remediation-20260927/migration-manifest.csv','docs/evidence/audit-remediation-20260927/r01-forward/task-6-generate.ts']+['docs/evidence/audit-remediation-20260927/r01-forward/task-6-fix-1-'+s for s in ['gates.py','red.ts','cleanup.ts','runtime-proof.ts','source-states.ts']]
index=root/'.superpowers/sdd/r01-forward-schema-plan-20261001/task-6-fix-1-candidate-index'; assert index.resolve().is_relative_to(root.resolve()) and not index.exists()
env=os.environ.copy();env['GIT_INDEX_FILE']=str(index.resolve())
try:
    subprocess.run(['git','read-tree',base],env=env,check=True)
    for p in source_paths:
        h=blob(p,True);subprocess.run(['git','update-index','--add','--cacheinfo','100644,'+h['gitBlob']+','+p],env=env,check=True)
    tree=subprocess.check_output(['git','write-tree'],env=env,text=True).strip()
finally:
    if index.exists(): index.unlink()
raw={str(p.relative_to(root)).replace('\\','/'):blob(str(p.relative_to(root)).replace('\\','/')) for p in sorted((out/'task-6-fix-1-receipts').iterdir()) if p.is_file()}
for p in sorted(out.glob('task-6-fix-1-*')):
    if p.is_file() and p.name!='task-6-fix-1-source-binding.json': raw[str(p.relative_to(root)).replace('\\','/')]=blob(str(p.relative_to(root)).replace('\\','/'))
result={'schema':'r01-task6-fix1-binding-v1','executionParent':base,'branch':'codex/audit-r01-crm-atomic-20261002','testedSourceCandidateTree':tree,'candidateSourcePaths':source_paths,'packagingMeaning':'Fix1 candidate binds the nine changed/new executable or fixture scripts before evidence/current-tracker packaging. Packaging HEAD is the commit containing this binding. Final SQL/runner/generator/DB test/current HTTP bytes match both actual final rehearsals and four gates. Original7f execution maps remain separate immutable historical evidence.','actualDatabaseExecutedSourceMap':green['testedExecutableBlobs'],'finalHttpAndGateSourceMap':current,'differingObservedDbInputs':[],'dbRuntimeImportProof':proof,'unchangedDefinitionAndAclTail':True,'zeroDefaultContracts':5,'sqlSHA256':blob(sql)['sha256'],'gates':gates,'original7fBinding':{'path':'docs/evidence/audit-remediation-20260927/r01-forward/task-6-source-binding.json','blob':blob('docs/evidence/audit-remediation-20260927/r01-forward/task-6-source-binding.json'),'actualDbInputs':22,'finalHttpGateInputs':29,'rawArtifacts':71,'changedCurrentRawArtifactPaths':oldraw_changed,'qualification':'All true original receipts/logs/maps and the other70 original raw artifacts remain byte-equal. The authoritative source generator legitimately changed; its exact original raw archive and FIX_BASE canonical Git version are bound below. Do not claim original71 current paths unchanged.'},'originalInputVersions':original_versions,'rawArtifacts':raw,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(out/'task-6-fix-1-source-binding.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'candidateTree':tree,'actualDbInputs':len(green['testedExecutableBlobs']),'finalGateInputs':len(current),'newRawArtifacts':len(raw),'oldRawCurrentDifferences':oldraw_changed}))
