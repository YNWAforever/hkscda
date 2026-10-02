import datetime,hashlib,json,os,pathlib,subprocess
root=pathlib.Path.cwd(); out=root/'docs/evidence/audit-remediation-20260927/r01-forward'; receipt=out/'task-6-fix-2-receipts'; base='8b665fa4c05c20d728a7fb9617312c377618bc07'
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==base
load=lambda p:json.loads((out/p).read_text(encoding='utf-8'))
def blob(p,write=False):
    data=(root/p).read_bytes();args=['git','hash-object']+(['-w'] if write else [])+['--path='+p,p]
    return {'sha256':hashlib.sha256(data).hexdigest(),'canonicalSha256':hashlib.sha256(data.replace(b'\r\n',b'\n')).hexdigest(),'gitBlob':subprocess.check_output(args,text=True).strip()}
rel=lambda p:str(p.relative_to(root)).replace('\\','/')
profiles=[load('task-6-fix-2-receipts/task-6-'+m+'.json') for m in ['green','green-modern','green-component']]
green,modern,component=profiles; gates=load('task-6-fix-2-receipts/task-6-final-gates.json');proof=load('task-6-fix-2-runtime-proof.json');old=load('task-6-fix-1-source-binding.json');original=load('task-6-source-binding.json');diagnosis=load('task-6-fix-2-receipts/diagnosis.json')
assert green['testedExecutableBlobs']==modern['testedExecutableBlobs']==component['testedExecutableBlobs']
for r,count in zip(profiles,[63,63,64]):
    assert r['testExit']==0 and len(r['refusals'])==count and all(x['status']=='55000' and x['preserved'] for x in r['refusals'])
    assert all(x['fixtureChanged'] and x['message']=='R01 CRM table metadata differs: supporter' for x in r['refusals'][-(3 if count==64 else 2):])
    assert all(x['setupComplete'] for x in r['refusals'][49:61])
    assert any('25 pass' in s for s in r['testSummary']) and any('205 expect' in s for s in r['testSummary'])
    for k in ['normalBaselineAccepted','normalBaselineRollbackPreserved','migrationRowsPreserved','completeAuthDefaultsNativeLedgerPreserved','unrelatedCatalogPreserved','secondApplyCatalogIdentical','secondApplyRowsIdentical','postTestRowsPreserved','postTestCatalogPreserved','postTestAuthDefaultsNativeLedgerPreserved','templatePreserved','modernPreserved','frozenInputsPreserved']:assert r[k],k
assert component['componentConstruction']['catalogChangedFacets']==['columns','relations']
assert component['componentConstruction']['rowsPreserved'] and component['componentConstruction']['completeAuthDefaultNativeLedgerPreserved']
assert gates['frozenInputsPreserved'] and len(gates['gates'])==4 and all(g['exit']==0 for g in gates['gates'])
current={p:blob(p) for p in gates['testedFinalSourceBlobs']}
for p,h in gates['testedFinalSourceBlobs'].items():assert current[p]['sha256']==h['sha256'] and current[p]['canonicalSha256']==h['canonicalSha256'],p
for p,h in green['testedExecutableBlobs'].items():assert current[p]['sha256']==h['sha256'],p
assert len(current)==34 and len(green['testedExecutableBlobs'])==28
assert not proof['httpMappingInRuntimeClosure'] and len(proof['files'])==5
for p,h in proof['files'].items():assert h['sha256']==green['testedExecutableBlobs'][p]['sha256']==blob(p)['sha256'],p
sql='supabase/migrations/20261001213914_r01_crm_atomic_forward.sql'; oldsql=subprocess.check_output(['git','show',base+':'+sql]);new=(root/sql).read_bytes();expected=oldsql.replace(b"'3148b717a290aa5be32b446245ddc1ce','8ac590a6fec96f6c2cbaa48e7be16c97'",b"'3148b717a290aa5be32b446245ddc1ce','8ac590a6fec96f6c2cbaa48e7be16c97','6283c96ed21f1197474461a8028892e1'")
assert new==expected and new.count(b'p.pronargdefaults=0 and p.proargdefaults is null')==5
assert diagnosis['normalBaselineAccepted'] and diagnosis['normalBaselineRollbackPreserved'] and diagnosis['actualMigrationResult']['setupComplete'] and diagnosis['actualMigrationResult']['status']=='55000' and diagnosis['fullRollbackPreserved'] and diagnosis['frozenInputsPreserved']
archived_diagnosis=rel(receipt/'diagnosis-executed-script.ts');assert blob(archived_diagnosis)['sha256']=='b38e623350a00130c34f223771b51d35b375eb334f8c8f919167f9f2c78c374a' and blob(archived_diagnosis)['canonicalSha256']=='e8cfd881ea967c103929bae11ca8f9d60b604ad68ede773efc4d9968135d7705'
previous_versions={}
for p,a in {sql:'base-8b-forward.sql','supabase/rls-tests/helpers/runR01CrmForward.ts':'base-8b-runner.ts','docs/evidence/audit-remediation-20260927/migration-manifest.csv':'base-8b-manifest.csv','docs/evidence/audit-remediation-20260927/r01-forward/task-6-generate.ts':'base-8b-generator.ts'}.items():
    archived=rel(receipt/a); prior=old['finalHttpAndGateSourceMap'][p];h=blob(archived);gitdata=subprocess.check_output(['git','show',base+':'+p]);assert h['sha256']==prior['sha256'] and h['canonicalSha256']==hashlib.sha256(gitdata).hexdigest(),p
    previous_versions[p]={'fix1Observed':prior,'exact8bArchive':archived,'archiveBlob':h,'fixBaseGitBlob':subprocess.check_output(['git','rev-parse',base+':'+p],text=True).strip(),'fixBaseCanonicalSHA256':hashlib.sha256(gitdata).hexdigest()}
changed_oldraw=[p for p,h in old['rawArtifacts'].items() if blob(p)['sha256']!=h['sha256']]
qualification=load('task-6-fix-2-receipts/new-worktree-historical-source-qualification.json');assert sorted(changed_oldraw)==sorted(q['path'] for q in qualification)
for q in qualification:
    p=q['path'];data=(root/p).read_bytes();assert hashlib.sha256(data.replace(b'\r\n',b'\n')).hexdigest()==q['canonicalSHA256']
    reconstructed=data.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n');assert hashlib.sha256(reconstructed).hexdigest()==q['oldObservedRawSHA256']
    archived=receipt/('reconstructed-original-8b-'+pathlib.Path(p).name);archived.write_bytes(reconstructed)
    previous_versions[p]={'qualification':'Exact historical raw source reconstruction from canonical Git bytes and recorded raw hash; not a new execution receipt. Original receipt/map unchanged.','fix1Observed':old['rawArtifacts'][p],'reconstructedOriginalArchive':rel(archived),'archiveBlob':blob(rel(archived)),'fixBaseGitBlob':subprocess.check_output(['git','rev-parse',base+':'+p],text=True).strip()}
old_gate_changed=[p for p,h in old['finalHttpAndGateSourceMap'].items() if blob(p)['sha256']!=h['sha256']];assert sorted(old_gate_changed)==sorted(list(previous_versions)[:4])
original_raw_changed=[p for p,h in original['rawArtifacts'].items() if blob(p)['sha256']!=h['sha256']];assert original_raw_changed==['docs/evidence/audit-remediation-20260927/r01-forward/task-6-generate.ts']
source_paths=list(previous_versions)[:4]+['docs/evidence/audit-remediation-20260927/r01-forward/task-6-fix-2-'+s for s in ['diagnose.ts','gates.py','runtime-proof.ts','source-states.ts']]
index=root/'.superpowers/sdd/r01-forward-schema-plan-20261001/task-6-fix-2-candidate-index';assert index.resolve().is_relative_to(root.resolve()) and not index.exists();env=os.environ.copy();env['GIT_INDEX_FILE']=str(index.resolve())
try:
    subprocess.run(['git','read-tree',base],env=env,check=True)
    for p in source_paths:
        h=blob(p,True);subprocess.run(['git','update-index','--add','--cacheinfo','100644,'+h['gitBlob']+','+p],env=env,check=True)
    tree=subprocess.check_output(['git','write-tree'],env=env,text=True).strip()
finally:
    if index.exists():index.unlink()
raw={rel(p):blob(rel(p)) for p in sorted(receipt.iterdir()) if p.is_file()}
for p in sorted(out.glob('task-6-fix-2-*')):
    if p.is_file() and p.name!='task-6-fix-2-source-binding.json':raw[rel(p)]=blob(rel(p))
result={'schema':'r01-task6-fix2-binding-v1','executionParent':base,'branch':'codex/audit-r01-crm-atomic-20261002','testedSourceCandidateTree':tree,'candidateSourcePaths':source_paths,'packagingMeaning':'Candidate binds four own amended source files plus four new fixture/gate/proof/source-state scripts; packaging HEAD contains this binding, evidence and current R01 tracker. Final28 observed DB inputs match all three rehearsals and all34 gate inputs; HTTP is unchanged and excluded from five-file DB runtime closure. No exact PG17.11/bootstrap/provider/production readiness claim.','actualDatabaseExecutedSourceMap':green['testedExecutableBlobs'],'finalHttpAndGateSourceMap':current,'differingObservedDbInputs':[],'dbRuntimeImportProof':proof,'onlySQLChange':'Complete reviewed supporter profile6283 alternative; all prior helper/default/Auth/native/body/owner/ACL/signature guards and definition tail unchanged.','sqlSHA256':blob(sql)['sha256'],'reviewedSourceComponent':load('task-6-fix-2-generated-profiles.json')['supporterAlternative'],'databaseRehearsals':[{k:r[k] for k in ['mode','startedAt','completedAt','testExit','testSummary','normalBaselineAccepted','normalBaselineRollbackPreserved','frozenInputsPreserved']}|{'refusals':len(r['refusals'])} for r in profiles],'gates':gates,'original7fBinding':{'path':'docs/evidence/audit-remediation-20260927/r01-forward/task-6-source-binding.json','blob':blob('docs/evidence/audit-remediation-20260927/r01-forward/task-6-source-binding.json'),'actualDbInputs':22,'finalHttpGateInputs':29,'rawArtifacts':71,'changedCurrentRawArtifactPaths':original_raw_changed,'qualification':'Historical original7f maps/receipts/logs unchanged; authoritative generator changed and original exact archive remains bound by immutable Fix1 originalInputVersions. Old HTTP observation remains separate.'},'previousFix1Binding':{'path':'docs/evidence/audit-remediation-20260927/r01-forward/task-6-fix-1-source-binding.json','blob':blob('docs/evidence/audit-remediation-20260927/r01-forward/task-6-fix-1-source-binding.json'),'actualDbInputs':24,'finalHttpGateInputs':30,'rawArtifacts':71,'changedCurrentObservedSourcePaths':old_gate_changed,'changedCurrentRawArtifactPaths':changed_oldraw,'qualification':'Four legitimate amended source files archived at exact8b observed and Git versions. Three historical metadata scripts normalized CRLF on new checkout; canonical Git versions unchanged and exact old raw source reconstructed against old hashes. All true old receipts/logs/maps remain byte-immutable. Do not claim all original71 current paths unchanged.'},'previousInputVersions':previous_versions,'diagnosisExecutedVersion':{'archive':archived_diagnosis,'blob':blob(archived_diagnosis),'currentFormattedScript':'docs/evidence/audit-remediation-20260927/r01-forward/task-6-fix-2-diagnose.ts','currentBlob':blob('docs/evidence/audit-remediation-20260927/r01-forward/task-6-fix-2-diagnose.ts'),'qualification':'Actual diagnosis ran originalb38/e8 script; current formatted version was not rerun.'},'rawArtifacts':raw,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(out/'task-6-fix-2-source-binding.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'candidateTree':tree,'actualDbInputs':len(green['testedExecutableBlobs']),'finalGateInputs':len(current),'newRawArtifacts':len(raw),'oldRawCurrentDifferences':changed_oldraw,'fullSQLSHA':blob(sql)['sha256']}))
