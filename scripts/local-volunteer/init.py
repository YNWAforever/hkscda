#!/usr/bin/env python3
"""Create a fresh local acceptance identity/network, never reuse a target directory."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import uuid
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('root',type=Path,help='New private directory outside the git checkout')
a=p.parse_args();root=a.root.resolve();repo=Path(__file__).resolve().parents[2]
assert not root.is_relative_to(repo), 'Keep generated credentials outside git'
assert not root.exists(), 'Preserve existing targets; choose a new directory'
env=dict(os.environ)
for key in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']:env.pop(key,None)
identifier=secrets.token_hex(5)
project='hkscda-volunteer-local-'+identifier
fixture=str(uuid.uuid4());network='hkscda-isolated-'+identifier
command=['docker','--host=unix:///var/run/docker.sock']
root.mkdir(parents=True,mode=0o700)
subprocess.run(command+['network','create','--internal','--label','hkscda.fixture='+fixture,network],env=env,check=True,capture_output=True)
meta={'branch':subprocess.check_output(['git','branch','--show-current'],cwd=repo,text=True).strip(),
 'base':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),
 'apiHost':'127.0.0.1','apiPort':59321,'dbHost':'127.0.0.1','dbPort':59322,'dbName':'postgres',
 'syntheticOnly':True,'productionConnection':False,'controlRole':'supabase_admin',
 'projectRef':project,'fixtureId':fixture,'network':network}
(root/'target-construction.json').write_text(json.dumps(meta,indent=2)+'\n')
print(json.dumps({'root':str(root),'projectRef':project,'fixtureId':fixture,'internalNetwork':network}))
