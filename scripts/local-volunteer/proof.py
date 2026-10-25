#!/usr/bin/env python3
"""Record non-secret physical target and backend binding evidence (read-only)."""
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlparse
root=Path(sys.argv[1]).resolve();repo=Path(__file__).resolve().parents[2]
subprocess.run([sys.executable,str(repo/'scripts/local-volunteer/provision.py'),str(root),'--check'],check=True)
m=json.loads((root/'target-construction.json').read_text());private=json.loads((root/'private.json').read_text())
env=dict(os.environ)
for k in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']:env.pop(k,None)
def run(args,data=None):return subprocess.check_output(['docker','--host=unix:///var/run/docker.sock']+args,env=env,input=data,text=True).strip()
network=json.loads(run(['network','inspect',m['network']]))[0]
assert network['Id']==m['networkId'] and network['Internal'] is True
services={}
expected_env={'auth':'GOTRUE_DB_DATABASE_URL','rest':'PGRST_DB_URI','storage':'DATABASE_URL','app':'LOCAL_TEST_CONTROL_URL'}
for suffix in ['db','auth','rest','storage','app']:
 c=json.loads(run(['container','inspect',m['projectRef']+'-'+suffix]))[0]
 assert c['Config']['Labels']['hkscda.fixture']==m['fixtureId'] and set(c['NetworkSettings']['Networks'])=={m['network']}
 assert c['State']['Running'] is True
 if suffix=='db':assert c['Id']==m['containerId'] and c['Image']==m['images']['postgres']['id']
 elif suffix=='app':assert c['Id']==m['appContainerId'] and c['Image']==m['appImageId']
 else:assert c['Image']==m['images'][suffix]['id']
 variables=dict(value.split('=',1) for value in c['Config']['Env'])
 binding=None
 if suffix in expected_env:
  u=urlparse(variables[expected_env[suffix]])
  assert u.hostname=='db' and u.port==5432 and u.path=='/postgres'
  binding={'host':u.hostname,'port':u.port,'database':u.path[1:]}
 if suffix=='app':
  assert variables['SUPABASE_URL']==variables['VITE_SUPABASE_URL']=='http://127.0.0.1:59321'
  assert variables['SUPABASE_SERVICE_ROLE_KEY']==private['serviceKey'] and variables['VITE_SUPABASE_ANON_KEY']==private['anonKey']
  for key in ['RESEND_API_KEY','STRIPE_SECRET_KEY','PAYPAL_CLIENT_SECRET']:assert not variables.get(key)
 services[suffix]={'containerId':c['Id'],'imageId':c['Image'],'privateAddress':c['NetworkSettings']['Networks'][m['network']]['IPAddress'],
  'aliases':c['NetworkSettings']['Networks'][m['network']]['Aliases'],'observedPublishedPorts':c['NetworkSettings']['Ports'],'databaseBinding':binding}
assert set(network['Containers'])=={s['containerId'] for s in services.values()}
query="select json_build_object('database',current_database(),'systemIdentifier',system_identifier::text,'serverVersion',current_setting('server_version'),'serverAddress',inet_server_addr(),'serverPort',inet_server_port(),'marker',(select row_to_json(t) from local_acceptance.identity t)) from pg_control_system();"
db=json.loads(run(['exec',m['containerId'],'psql','-X','-U','supabase_admin','-d','postgres','-At','-c',query]))
assert db['systemIdentifier']==m['systemIdentifier'] and db['marker']['fixture_id']==m['fixtureId']
result={'dockerEndpoint':'unix:///var/run/docker.sock','projectRef':m['projectRef'],'fixtureId':m['fixtureId'],'network':{'name':m['network'],'id':m['networkId'],'internal':True},'volume':{'name':m['volumeName'],'createdAt':m['volumeCreatedAt']},'database':db,'services':services,
 'application':'http://127.0.0.1:59330 inside the app container','gateway':'http://127.0.0.1:59321 inside the app container',
 'hostLoopbackExposure':'Requested in HostConfig but not published by this internal-network Docker setup; use docker exec. No host-port availability claim.',
 'productionConnection':False,'providerCredentialsConfigured':False,'syntheticOnly':True,'initialEmptyDatabase':m['initialDatabaseState']}
(root/'target-proof.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'projectRef':m['projectRef'],'systemIdentifier':db['systemIdentifier'],'dbHost':'db:5432 on '+m['network'],'services':list(services),'networkInternal':True,'productionConnection':False}))
