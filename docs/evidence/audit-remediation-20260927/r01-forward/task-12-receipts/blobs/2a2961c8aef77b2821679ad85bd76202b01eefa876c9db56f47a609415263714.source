"""R64 final owned native f4 group candidate integration; native-local Bun behavior NOT RUN."""
import base64,datetime,hashlib,hmac,json,pathlib,re,subprocess,sys,time,uuid
root=pathlib.Path.cwd();scratch=root/'.superpowers/sdd/r01-forward-schema-plan-20261001';route=scratch/'task-11-fix3-diagnosis-1790974606735';vendor=route/'vendor';token=uuid.uuid4().hex;out=scratch/('task-12-native-final-'+token);out.mkdir();pg='hkscda-task12-pg-'+token
base='f4e96e3484d135d179caea835d913552d96d2dcb';freeze=json.loads((root/'docs/evidence/audit-remediation-20260927/r01-forward/task-12-source-freeze.json').read_text());head=freeze['sourceCommit'];created=[];queries={};secret='task11-r55-owned-synthetic-jwt-secret-0000000000'
images={'pg':('public.ecr.aws/supabase/postgres:17.11.0.002','0450166354dc9c1d25f0322ac8b580774d4fb0184d2b087f6e4fe9499c66cf53'),'realtime':('public.ecr.aws/supabase/realtime:v2.140.3','f66c721c71b576f5854c78f86df0c78a98368d900dcf62e4ddd96c6913139999'),'storage':('public.ecr.aws/supabase/storage-api:v1.79.28','1f6c99d3952d78d57129802aa2ae8a80d75e327492cf24742fd0aeaf90967b96'),'auth':('public.ecr.aws/supabase/gotrue:v2.197.0','1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b')}
receipt={'receiptType':'native-metadata-integration-v1','mode':'owned-full1711-f4-group-candidate','receiptVersion':1,'authority':'Ruling64','baselineSourceAdmission':'R64-metadata-only','baselineDiagnosticQualification':'Original R63 after rows absent and NEXT derived; fresh candidate rows/NEXT observed separately','sourceHead':head,'baselineSource':base,'out':str(out),'pg':pg,'CLIQualification':'Intended pinned official2.118 source assembly; actualCIbunx version not emitted, no exactCLI identity claim. Full managed+f4 PG17.11 baseline credit requires all three observed managed jobs, complete migration application and actual catalog capture.','commands':[],'images':{},'inputBindings':[],'migrationInventory':[],'managedJobs':[],'managedJobAttempts':[],'error':None,'cleanup':[],'productionApplied':False,'deployed':False,'operationallyEnabled':False,'heldTask1FiveColumnRepairApplied':False,'heldTask8ScannerProposalApplied':False}
flags=['fullF4BaselineObserved','fullScannerPassed','beforeRowsObserved','afterRowsObserved','zeroRowsBefore','zeroRowsAfter','firstApply','nativeNextObserved','secondApply','secondApplyPreserved','outsideTargetsPreserved','supplementalPreserved','refusalsPassed','fixtureConnectionIdentity','mixedRefusalsPassed','catalogAfterRefusalsPreserved','nativeBehaviorPassed','catalogAfterBehaviorPreserved','finalCatalogPreserved','normalCleanup','protectedSourcesPreserved','frozenInputsPreserved']
frozen=dict(freeze['bindings'])
receipt['frozenInputs']=frozen
receipt['sourceFreeze']=freeze
receipt['nativeLocalBunBehaviorRun']=False
receipt['originalCombinedTransportPreArchived']=True
def sha(raw):return hashlib.sha256(raw).hexdigest()
def blob(raw):return hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
def save():(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8',newline='\n')
def run(args,stdin=None,required=True,timeout=120):
 i=len(receipt['commands']);stem='command-'+str(i).zfill(4);d={'command':args,'exit':None,'stdout':stem+'.stdout.log','stderr':stem+'.stderr.log'}
 (out/(stem+'.invocation.json')).write_text(json.dumps({'command':args,'timeoutSeconds':timeout,'required':required},indent=2)+'\n',encoding='utf-8',newline='\n')
 if stdin is not None:
  assert isinstance(stdin,bytes);leaf=stem+'.stdin.source';(out/leaf).write_bytes(stdin);d['stdinBinding']={'archive':leaf,'rawSha256':sha(stdin),'rawGitBlob':blob(stdin),'bytes':len(stdin),'preArchived':True}
 receipt['commands'].append(d);save()
 try:r=subprocess.run(args,input=stdin,capture_output=True,timeout=timeout)
 except Exception as e:d['error']=str(e);save();raise
 (out/d['stdout']).write_bytes(r.stdout);(out/d['stderr']).write_bytes(r.stderr);d.update({'exit':r.returncode,'stdoutSha256':sha(r.stdout),'stderrSha256':sha(r.stderr)});save()
 if required and r.returncode:raise RuntimeError('Owned command failed '+str(args)+' stderr='+r.stderr.decode(errors='replace')[-3000:])
 return r
def bind(path,label):
 raw=path.read_bytes();archive='i'+str(len(receipt['inputBindings'])).zfill(3)+'.source';(out/archive).write_bytes(raw);b={'label':label,'path':str(path.relative_to(root)).replace('\\','/'),'rawSha256':sha(raw),'canonicalSha256':sha(raw.replace(b'\r\n',b'\n')),'rawGitBlob':blob(raw),'bytes':len(raw),'archive':archive};receipt['inputBindings'].append(b);save();return raw
def inspect(name):return json.loads(run(['docker','inspect',name]).stdout)[0]
def safe(state,name):
 assert state['Name']=='/'+name and not state['Mounts'] and not state['HostConfig']['Binds'] and not state['HostConfig']['PortBindings'],name
 if name==pg:assert state['HostConfig']['NetworkMode']=='none'
 else:assert state['HostConfig']['NetworkMode']=='container:'+receipt['pgId']
def psql(sql,required=True):return run(['docker','exec','-i',pg,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],sql.encode()if isinstance(sql,str)else sql,required)
def capture(label):
 value={}
 for key,q in queries.items():
  if key=='fixtureScope':continue
  sql='begin read only;set local search_path=pg_catalog;select coalesce(jsonb_agg(to_jsonb(q)),\'[]\'::jsonb) from ('+q+')q;rollback;\n';(out/(label+'-'+key+'.sql.source')).write_text(sql,encoding='utf-8',newline='\n');rows=json.loads(psql(sql).stdout);value[key]=rows[0]['catalog']if key=='catalog'else rows[0]['value']if key in ['auth','native','indexes','shapes']else rows
 (out/(label+'.json')).write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8',newline='\n');return value
def jwt(role):
 enc=lambda b:base64.urlsafe_b64encode(b).rstrip(b'=');a=enc(b'{"alg":"HS256","typ":"JWT"}')+b'.'+enc(json.dumps({'iss':'supabase-demo','role':role,'iat':1600000000,'exp':2000000000}).encode());return(a+b'.'+enc(hmac.new(secret.encode(),a,hashlib.sha256).digest())).decode()
def job(kind,env,command,memory='512m'):
 receipt['managedJobAttempts'].append({'kind':kind,'command':command,'environment':env,'imageDigest':images[kind][1]});save()
 name='hkscda-task12-'+kind+'-'+token;image='public.ecr.aws/supabase/'+('storage-api'if kind=='storage'else'gotrue'if kind=='auth'else kind)+'@sha256:'+images[kind][1];args=['docker','create','--name',name,'--network','container:'+pg,'--cpus','1','--memory',memory,'--no-healthcheck']
 for setting in env:args+=['-e',setting]
 args+=[image,*command];run(args);created.append(name);safe(inspect(name),name);run(['docker','start','-a',name],timeout=180);state=inspect(name);safe(state,name);assert state['State']['Status']=='exited'and state['State']['ExitCode']==0;receipt['managedJobs'].append({'kind':kind,'name':name,'command':command,'environment':env,'exit':0,'imageDigest':images[kind][1]});save()

def integration(candidate,before,counts):
 def outside(value):
  copied=json.loads(json.dumps(value));copied['catalog']['functions']=[f for f in copied['catalog']['functions']if not(f['schema']=='public'and f['name']=='update_group_enquiry_with_audit')];copied['functions']=[f for f in copied['functions']if not(f['schema']=='public'and f['name']=='update_group_enquiry_with_audit')];return copied
 def transport(label,sql,required=True,mutator=False):
  raw=sql.encode()if isinstance(sql,str)else sql;path=out/(label+'.transaction.source');path.write_bytes(raw);receipt.setdefault('transactionTransports',[]).append({'label':label,'archive':path.name,'rawSha256':sha(raw),'rawGitBlob':blob(raw),'bytes':len(raw),'preArchived':True,'connectionUser':'supabase_admin'if mutator else'postgres'});save()
  return run(['docker','exec','-i',pg,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','supabase_admin'if mutator else'postgres','-d','postgres'],raw,required)
 transport('first-apply',b'\\set VERBOSITY verbose\nBEGIN;\n'+candidate+b'\nCOMMIT;\n');receipt['firstApply']=True;first=capture('after-first');receipt['outsideTargetsPreserved']=outside(before)==outside(first);receipt['supplementalPreserved']=all(before[k]==first[k]for k in ['auth','native','indexes','shapes'])and outside(before)['functions']==outside(first)['functions'];assert receipt['outsideTargetsPreserved']and receipt['supplementalPreserved']
 target=[f for f in first['functions']if f['schema']=='public'and f['name']=='update_group_enquiry_with_audit'];expected=json.loads((out/'expected-next.json').read_text());receipt['nativeNextTargets']=target;receipt['nativeNextObserved']=target==expected;assert receipt['nativeNextObserved'];save()
 transport('second-apply',b'\\set VERBOSITY verbose\nBEGIN;\n'+candidate+b'\nCOMMIT;\n');receipt['secondApply']=True;second=capture('after-second');receipt['secondApplyPreserved']=first==second;assert first==second;save()
 mutations=json.loads((out/'refusals.json').read_text());assert len(mutations)==14
 values=[]
 for k,q in queries.items():
  if k=='fixtureScope':continue
  expr='(select catalog from ('+q+')captured)'if k=='catalog'else'(select value from ('+q+')captured)'if k in ['auth','native','indexes','shapes']else"(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb)from ("+q+')q)'
  values.extend(["'"+k+"'",expr])
 fullSelect='select jsonb_build_object('+','.join(values)+');\n'
 identitySQL="DO $identity$ BEGIN IF current_user<>'postgres' OR session_user<>'supabase_admin' THEN RAISE EXCEPTION 'Owned group mutator candidate identity differs';END IF;END;$identity$;select 'TASK12_IDENTITY '||jsonb_build_object('current_user',current_user,'session_user',session_user)::text;\n"
 receipt['refusals']=[]
 for label,change in mutations:
  raw='\\set VERBOSITY verbose\nBEGIN;set local search_path=pg_catalog;\n'+fullSelect+change+';\nset local role postgres;\nset local search_path=pg_catalog;\n'+identitySQL+fullSelect+'SAVEPOINT task12_refusal;\n'+identitySQL+'\\set ON_ERROR_STOP off\n'+candidate.decode()+'\n\\echo TASK12_SQLSTATE :SQLSTATE\n\\set ON_ERROR_STOP on\nROLLBACK TO SAVEPOINT task12_refusal;\nset local search_path=pg_catalog;\n'+identitySQL+fullSelect+'ROLLBACK;\n'
  result=transport('refusal-'+label,raw,mutator=True);lines=result.stdout.decode().splitlines();snapshots=[json.loads(line)for line in lines if line.startswith('{')];codes=[line.split()[-1]for line in lines if line.startswith('TASK12_SQLSTATE ')];identities=[json.loads(line[len('TASK12_IDENTITY '):])for line in lines if line.startswith('TASK12_IDENTITY ')]
  assert len(snapshots)==3 and snapshots[0]!=snapshots[1]and snapshots[1]==snapshots[2]and codes==['55000']and b'ERROR:  55000:'in result.stderr and len(re.findall(rb'ERROR:',result.stderr))==1,(label,codes,result.stderr[-500:]);assert identities==[{'current_user':'postgres','session_user':'supabase_admin'}]*3
  receipt['refusals'].append({'label':label,'code':'55000','changed':True,'preserved':True,'identities':identities,'qualification':'Full unchanged candidate under postgres after owned transactional metadata mutation; complete before/changed/after captures and savepoint rollback.'});save()
 receipt['refusalsPassed']=len(receipt['refusals'])==14;receipt['fixtureConnectionIdentity']=all(len(f['identities'])==3 for f in receipt['refusals'])
 # These are complete observed vectors mixed into unobserved combinations, guard-only.
 match=re.search(rb" select p.value->'nextTargets' into v_expected_next[\s\S]*? if v_expected_next is null then raise exception 'R01 group correlated prerequisite or target tuple differs' using errcode='55000';end if;",candidate);assert match;guard=match.group();(out/'mixed-exact-selector.source').write_bytes(guard);receipt['mixedGuardExtraction']={'candidateSha256':sha(candidate),'byteRange':list(match.span()),'guardSha256':sha(guard)}
 literal=lambda value:"'"+json.dumps(value,separators=(',',':'),ensure_ascii=False).replace("'","''")+"'::jsonb"
 receipt['mixedRefusals']=[]
 for i,item in enumerate(json.loads((out/'mixed-vectors.json').read_text())):
  mixedBefore=capture('mix'+str(i)+'-before');assert mixedBefore==second
  script="\\set VERBOSITY verbose\nBEGIN;\nDO $mixed$ DECLARE v_vector jsonb:="+literal(item['vector'])+";v_actual jsonb:="+literal(target)+";v_expected_next jsonb;BEGIN\n"+guard.decode()+"\nEND;$mixed$;\nROLLBACK;\n"
  result=transport('mix'+str(i),script,False);assert result.returncode==3 and b'ERROR:  55000: R01 group correlated prerequisite or target tuple differs'in result.stderr,(item['label'],result.stderr[-500:]);mixedAfter=capture('mix'+str(i)+'-after');assert mixedBefore==mixedAfter
  receipt['mixedRefusals'].append({'label':item['label'],'code':'55000','exit':3,'preserved':True,'qualification':'Actual PostgreSQL guard-only block; exact byte-extracted complete correlated selector. Not a full candidate schema replay.'});save()
 receipt['mixedRefusalsPassed']=len(receipt['mixedRefusals'])==2;final=capture('after-refusals');assert final==second;receipt['catalogAfterRefusalsPreserved']=True
 # Domain behavior on the native engine through psql, independent of the native-local Bun gate.
 receipt['nativeBehavior']=[]
 for label,state,expectedCode in [('staff-update','confirmed',None),('banned-actor','banned','42501'),('unconfirmed-actor','unconfirmed','42501'),('expired-ban','expired',None),('audit-rollback','confirmed','23514')]:
  actor=str(uuid.uuid4());enquiry=str(uuid.uuid4());keyid=str(uuid.uuid4());confirmed='null'if state=='unconfirmed'else'now()';ban="now()+interval '1 day'"if state=='banned'else"now()-interval '1 hour'"if state=='expired'else'null'
  seed="insert into auth.users(id,email,email_confirmed_at,banned_until)values('"+actor+"','"+actor+"@example.invalid',"+confirmed+","+ban+");insert into public.admin_user(auth_user_id,email,role,status)values('"+actor+"','"+actor+"@example.invalid','staff','active');insert into public.group_enquiries(id,organisation,contact_name,contact_email,contact_phone,activity_type,participant_count,idempotency_key,updated_at)values('"+enquiry+"','Task12 native synthetic','Synthetic contact','group@example.invalid','00000000','shelter_visit',15,'"+keyid+"','2020-01-01');"
  call="public.update_group_enquiry_with_audit('"+enquiry+"','"+actor+"','2020-01-01','{\"status\":\"in_progress\"}')"
  extra="alter table public.audit_log add constraint task12_native_audit_reject check(action<>'group_enquiries.update');"if label=='audit-rollback'else''
  command="DO $case$declare r jsonb;begin r:="+call+";if r->>'kind'<>'updated' then raise exception 'Native group success absent';end if;end;$case$;"if expectedCode is None else"DO $case$begin perform "+call+";raise exception 'Native group rejection absent';exception when sqlstate '"+expectedCode+"' then null;end;$case$;"
  status='in_progress'if expectedCode is None else'new';audits=1 if expectedCode is None else 0
  assertion="DO $assert$begin if (select status from public.group_enquiries where id='"+enquiry+"')<>'"+status+"' or (select count(*)from public.audit_log where entity_id='"+enquiry+"')<>"+str(audits)+" then raise exception 'Native group atomic observation differs';end if;end;$assert$;"
  script='BEGIN;'+seed+extra+'set local role service_role;'+command+'set local role postgres;'+assertion+'ROLLBACK;';transport('native-case-'+label,script,mutator=True);receipt['nativeBehavior'].append({'label':label,'exit':0,'expectedCode':expectedCode,'expectedStatus':status,'expectedAudits':audits,'rollback':True});save()
 receipt['nativeBehaviorPassed']=len(receipt['nativeBehavior'])==5;behaviorAfter=capture('after-behavior');receipt['catalogAfterBehaviorPreserved']=second==behaviorAfter;assert receipt['catalogAfterBehaviorPreserved']
 receipt['result']='Owned native17.11 group candidate: actual NEXT, two applies,14 full-candidate refusals,two guard-only mixed vectors,five psql domain transactions. Native-local Bun NOT RUN; real exact-head CI group suite remains separately required.';save()

try:
 assert run(['git','rev-parse','HEAD']).stdout.decode().strip()==head
 receipt['preIntegrationWorkingTree']=run(['git','status','--porcelain']).stdout.decode()
 bind(pathlib.Path(__file__),'executed-driver');bind(root/'docs/evidence/audit-remediation-20260927/r01-forward/task-12-source-freeze.json','source-freeze');bind(scratch/'task-11-fix3-native-transport.ts','executed-native-transport');bind(root/'docs/evidence/audit-remediation-20260927/r01-forward/task-12-native-query-reader.ts','query-reader');bind(root/'docs/evidence/audit-remediation-20260927/r01-forward/task-12-native-codec.ts','finite-oid-codec');bind(scratch/'task-12-ruling64.source','authority64');bind(root/'supabase/rls-tests/helpers/productionSchemaClone.ts','unchanged-full-scanner');bind(root/'docs/evidence/audit-remediation-20260927/r01-forward/task-12-profile.ts','profile-query-source');run(['bun',str(root/'docs/evidence/audit-remediation-20260927/r01-forward/task-12-native-query-reader.ts'),'emit','unused',str(out)]);queries=json.loads((out/'queries.json').read_text());bind(out/'queries.json','actual-queries')
 for p in frozen:
  bind(root/p,'frozen-current');frozen[p]=receipt['inputBindings'][-1]
 for file in sorted(vendor.glob('*.source')):bind(file,'vendor-'+file.name)
 config=run(['git','show',base+':supabase/config.toml']).stdout;(out/'f4-config.toml.source').write_bytes(config);assert not re.search(rb'^\s*auto_expose_new_tables\s*=',config,re.M);assert not run(['git','ls-tree','-r','--name-only',base,'--','supabase/roles.sql','supabase/.temp']).stdout
 receipt['nativeAssembly']=json.loads(run(['bun',str(scratch/'task-11-fix3-native-transport.ts'),'init',str(out)]).stdout);init=(out/'init.sql.source').read_bytes();save()
 start=(vendor/'v2.118.0-internal_db_start_start.go.source').read_text(encoding='utf-8');api=re.search(r'const RevokeDefaultDataApiPrivilegesSql = `([\s\S]*?)`',start).group(1).encode();(out/'api.sql.source').write_bytes(api)
 for kind,(tag,digest)in images.items():
  ref=tag.rsplit(':',1)[0]+'@sha256:'+digest;m=json.loads(run(['docker','image','inspect',ref]).stdout)[0];assert ref in m['RepoDigests'] and m['Architecture']=='amd64' and m['Os']=='linux';receipt['images'][kind]={'observedCITag':tag,'exactLocalDigestReference':ref,'digest':digest,'id':m['Id'],'metadata':m};save()
 receipt['protectedBefore']=json.loads(run(['bun',str(root/'docs/evidence/audit-remediation-20260927/r01-forward/task-12-native-query-reader.ts'),'states','unused',str(out),'before']).stdout);save()
 run(['docker','create','--name',pg,'--network','none','--cpus','1','--memory','1g','--no-healthcheck','-e','POSTGRES_PASSWORD=postgres','-e','JWT_SECRET='+secret,'-e','JWT_EXP=3600','public.ecr.aws/supabase/postgres@sha256:'+images['pg'][1]]);created.append(pg);state=inspect(pg);safe(state,pg);receipt['pgId']=state['Id'];save();run(['docker','cp',str(out/'init.sql.source'),pg+':/etc/postgresql.schema.sql']);run(['docker','start',pg]);deadline=time.monotonic()+120
 while True:
  state=inspect(pg);assert state['State']['Running'];logs=run(['docker','logs',pg]);ready=run(['docker','exec',pg,'pg_isready','-U','postgres'],required=False)
  if b'PostgreSQL init process complete; ready for start up.'in logs.stdout and ready.returncode==0:break
  if time.monotonic()>deadline:raise RuntimeError('Owned PG bootstrap timeout')
  time.sleep(2)
 receipt['runtime']=psql("begin read only;select jsonb_build_object('version',version(),'user',current_user,'database',current_database(),'owner',(select pg_get_userbyid(datdba)from pg_database where datname=current_database()));rollback;").stdout.decode().strip();save()
 key='EAx3IQ/wRG1v47ZD4NE4/9RzBI8Jmil3x0yhcW4V2NHBP6c2iPIzwjofi2Ep4HIG'
 # Pinned ResolveJWKS + ToPublicJWK: default public EC verifier, then synthetic JWT-secret fallback; no third-party provider.
 jwks={'keys':[{'kty':'EC','kid':'b81269f1-21d8-4f2e-b719-c2240a840d90','use':'sig','key_ops':['verify'],'alg':'ES256','ext':True,'crv':'P-256','x':'M5Sjqn5zwC9Kl1zVfUUGvv9boQjCGd45G8sdopBExB4','y':'P6IXMvA2WYXSHSOMTBH2jsw_9rrzGy89FjPf6oOsIxQ'},{'kty':'oct','k':base64.urlsafe_b64encode(secret.encode()).rstrip(b'=').decode()}]};receipt['resolvedSyntheticJWKS']=jwks;save()
 job('realtime',['PORT=4000','DB_HOST=127.0.0.1','DB_PORT=5432','DB_USER=supabase_admin','DB_PASSWORD=postgres','DB_NAME=postgres','DB_AFTER_CONNECT_QUERY=SET search_path TO _realtime','DB_ENC_KEY=supabaserealtime','API_JWT_JWKS='+json.dumps(jwks,separators=(',',':')),'API_JWT_SECRET='+secret,'METRICS_JWT_SECRET='+secret,'APP_NAME=realtime','SECRET_KEY_BASE='+key,'ERL_AFLAGS=-proto_dist inet_tcp','DNS_NODES=\'\'','RLIMIT_NOFILE=','SEED_SELF_HOST=true','RUN_JANITOR=true','MAX_HEADER_LENGTH=4096'],['/app/bin/realtime','eval','{:ok, _} = Application.ensure_all_started(:realtime)\n{:ok, _} = Realtime.Tenants.health_check("realtime-dev")'],'1g')
 job('storage',['DB_INSTALL_ROLES=false','DB_MIGRATIONS_FREEZE_AT=','ANON_KEY='+jwt('anon'),'SERVICE_KEY='+jwt('service_role'),'PGRST_JWT_SECRET='+secret,'DATABASE_URL=postgresql://supabase_storage_admin:postgres@127.0.0.1:5432/postgres','FILE_SIZE_LIMIT=52428800','STORAGE_BACKEND=file','STORAGE_FILE_BACKEND_PATH=/mnt','TENANT_ID=stub','REGION=stub','GLOBAL_S3_BUCKET=stub'],['node','dist/scripts/migrate-call.js'])
 job('auth',['API_EXTERNAL_URL=http://127.0.0.1:9999','GOTRUE_LOG_LEVEL=error','GOTRUE_DB_DRIVER=postgres','GOTRUE_DB_DATABASE_URL=postgresql://supabase_auth_admin:postgres@127.0.0.1:5432/postgres','GOTRUE_SITE_URL=http://127.0.0.1:3000','GOTRUE_JWT_SECRET='+secret],['gotrue','migrate'])
 receipt['officialApplyApiPrivileges']='Pinned native2.118 unset-flag no-op (Option.getOrElse true); legacy Go revoke not executed. No normalization to captured/admitted ACL.';save()
 tree=run(['git','ls-tree','-r','-z',base,'--','supabase/migrations']).stdout
 for entry in tree.split(b'\0'):
  if not entry:continue
  meta,path=entry.split(b'\t',1);path=path.decode()
  if not re.search(r'/\d{14}_[^/]+\.sql$',path):continue
  if receipt['migrationInventory']:assert path>receipt['migrationInventory'][-1]['path']
  oid=meta.split()[2].decode();raw=run(['git','cat-file','blob',oid]).stdout;assert b'\r\n'not in raw and blob(raw)==oid;stem='m'+str(len(receipt['migrationInventory'])).zfill(4);rawpath=out/(stem+'.source');rawpath.write_bytes(raw);receipt['migrationInventory'].append({'path':path,'gitBlob':oid,'rawSha256':sha(raw),'bytes':len(raw),'archive':stem+'.source','exit':None});save();parsed=json.loads(run(['bun',str(scratch/'task-11-fix3-native-transport.ts'),'parse',str(out),str(rawpath)]).stdout);transport=pathlib.Path(str(rawpath)+'.transport.source').read_bytes();receipt['migrationInventory'][-1].update({'parser':parsed,'transportSha256':sha(transport),'transportBytes':len(transport),'transportArchive':rawpath.name+'.transport.source'});save();psql(transport);receipt['migrationInventory'][-1]['exit']=0;save()
 receipt['committedPartialTask1SourceApplied']=any('payment_idempotency_forward'in m['path']for m in receipt['migrationInventory']);receipt['baselineMigrationCount']=len(receipt['migrationInventory']);before=capture('f4-group-baseline');receipt['fullF4BaselineObserved']=True;save()
 counts=[]
 for table in queries['fixtureScope']:
  table=table if'.'in table else'public.'+table;count=psql('BEGIN READ ONLY;select count(*)from '+table+';ROLLBACK;').stdout.decode().strip();assert count=='0',(table,count);counts.append({'table':table,'count':0})
 receipt['domainRowsBefore']=counts;receipt['beforeRowsObserved']=len(counts)==4;receipt['zeroRowsBefore']=all(x['count']==0 for x in counts);scan=run(['bun',str(root/'docs/evidence/audit-remediation-20260927/r01-forward/task-12-native-query-reader.ts'),'scan',pg,str(out)]);receipt['scanner']=json.loads(scan.stdout);receipt['fullScannerPassed']=receipt['scanner']['fullScannerPassed']is True;save()
 candidate=bind(root/'supabase/migrations/20261003005322_r01_group_enquiry_forward.sql','group-candidate')
 integration(candidate,before,counts)

except Exception as e:receipt['error']=str(e);save();raise
finally:
 if pg in created:
  try:
   state=inspect(pg)
   if state['State']['Running']:
    rows=[]
    for table in queries.get('fixtureScope',[]):
     table=table if'.'in table else'public.'+table
     try:
      count=psql('BEGIN READ ONLY;select count(*)from '+table+';ROLLBACK;').stdout.decode().strip();rows.append({'table':table,'count':int(count)})
     except Exception as e:rows.append({'table':table,'error':str(e)})
    receipt['domainRowsAfter']=rows;receipt['afterRowsObserved']=len(rows)==4 and all('count'in row for row in rows);receipt['zeroRowsAfter']=receipt['afterRowsObserved']and all(row['count']==0 for row in rows);save()
    receipt['finalCatalog']=capture('after-final-attempt');receipt['finalCatalogPreserved']=(out/'after-second.json').exists()and receipt['finalCatalog']==json.loads((out/'after-second.json').read_text());save()
  except Exception as e:receipt['error']='; '.join(filter(None,[receipt['error'],'After capture failed: '+str(e)]));save()
 for name in reversed(created):
  try:
   state=inspect(name);safe(state,name);run(['docker','logs',name],required=False)
   if state['State']['Running']:run(['docker','stop','--signal','SIGINT','--timeout','-1',name])
   state=inspect(name);assert not state['State']['Running'];run(['docker','rm','-v',name]);assert not run(['docker','ps','-a','--filter','name=^/'+name+'$','--format','{{.ID}}']).stdout.strip();receipt['cleanup'].append({'name':name,'normalRemoved':True})
  except Exception as e:receipt['cleanup'].append({'name':name,'normalRemoved':False,'error':str(e)});receipt['error']='; '.join(filter(None,[receipt['error'],'Cleanup failed: '+str(e)]))
  save()
 receipt['normalCleanup']=len(receipt['cleanup'])==4 and all(c['normalRemoved']is True for c in receipt['cleanup'])
 if 'protectedBefore'in receipt:
  try:
   receipt['protectedAfter']=json.loads(run(['bun',str(root/'docs/evidence/audit-remediation-20260927/r01-forward/task-12-native-query-reader.ts'),'states','unused',str(out),'after']).stdout);receipt['protectedSourcesPreserved']=receipt['protectedBefore']==receipt['protectedAfter']
  except Exception as e:receipt['protectedSourcesPreserved']=False;receipt['error']='; '.join(filter(None,[receipt['error'],'Protected capture failed: '+str(e)]))
 receipt['frozenInputsPreserved']=all(sha((root/p).read_bytes())==b['rawSha256']for p,b in frozen.items());receipt['requiredFinalFlags']=flags;receipt['failedFinalFlags']=[k for k in flags if receipt.get(k)is not True];save()
 if receipt['error']is None and not receipt['failedFinalFlags']:
  check=run(['bun','-e','import {assertNativeResult} from "./docs/evidence/audit-remediation-20260927/r01-forward/task-12-native-result";import {readFile} from "node:fs/promises";assertNativeResult(JSON.parse(await readFile(process.argv[1],"utf8")));',str(out/'receipt.json')],required=False);receipt['strictConsumerExit']=check.returncode
  if check.returncode:receipt['error']='Strict native result consumer rejected actual receipt'
 receipt['files']={p.name:{'rawSha256':sha(p.read_bytes()),'bytes':p.stat().st_size,'rawGitBlob':blob(p.read_bytes())}for p in out.iterdir()if p.is_file()and p.name!='receipt.json'};save();print(json.dumps({'out':str(out),'pg':pg,'result':receipt.get('result'),'error':receipt['error'],'baselineMigrations':receipt.get('baselineMigrationCount'),'managedJobs':len(receipt['managedJobs']),'nativeNextObserved':receipt.get('nativeNextObserved'),'beforeRowsObserved':receipt.get('beforeRowsObserved'),'afterRowsObserved':receipt.get('afterRowsObserved'),'nativePsqlCases':len(receipt.get('nativeBehavior',[])),'nativeLocalBunBehaviorRun':False,'protectedSourcesPreserved':receipt.get('protectedSourcesPreserved'),'frozenInputsPreserved':receipt['frozenInputsPreserved'],'failedFinalFlags':receipt['failedFinalFlags'],'cleanup':receipt['cleanup']}))

if receipt['error'] is not None or receipt['failedFinalFlags']:sys.exit(1)
