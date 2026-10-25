#!/usr/bin/env python3
"""Run final local code checks once; never points the generic suite at a database."""
import json
import os
from pathlib import Path
import subprocess
import sys
root=Path(sys.argv[1]).resolve();repo=Path(__file__).resolve().parents[2]
subprocess.run([sys.executable,str(repo/'scripts/local-volunteer/provision.py'),str(root),'--check'],check=True)
m=json.loads((root/'target-construction.json').read_text())
env=dict(os.environ)
for k in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']:env.pop(k,None)
commands=[('script-typecheck',['bunx','tsc','--noEmit','-p','scripts/local-volunteer/tsconfig.json']),
 ('typecheck',['bun','run','typecheck']),
 ('script-lint',['bunx','eslint','scripts/local-volunteer']),
 ('lint',['bun','run','lint']),
 ('tests',['bun','run','test']),
 ('build',['bun','run','build'])]
start=sys.argv[sys.argv.index('--from')+1] if '--from' in sys.argv else commands[0][0]
assert start in [name for name,_ in commands]
results=json.loads((root/'checks.json').read_text()) if '--from' in sys.argv else []
commands=commands[[name for name,_ in commands].index(start):]
for name,cmd in commands:
 # The generic suite asserts the canonical HTTPS origin. Do not leak this
 # harness's browser-only localhost origins into those independent unit tests.
 launch=['env','-u','APP_URL','-u','VITE_PUBLIC_SITE_ORIGIN'] if name=='tests' else []
 command=['docker','--host=unix:///var/run/docker.sock','exec','--env','SUPABASE_LOCAL_URL=http://127.0.0.1:1',m['projectRef']+'-app']+launch+cmd
 print('START '+name,flush=True)
 p=subprocess.run(command,cwd=repo,env=env,text=True,capture_output=True)
 log=root/(name+'.log')
 if log.exists():
  attempt=1
  while (root/(name+'-attempt-'+str(attempt)+'.log')).exists():attempt+=1
  log.rename(root/(name+'-attempt-'+str(attempt)+'.log'))
 log.write_text(p.stdout+p.stderr)
 results.append({'check':name,'command':cmd,'exit':p.returncode})
 (root/'checks.json').write_text(json.dumps(results,indent=2)+'\n')
 print('END '+name+' EXIT '+str(p.returncode)+'\n'+(p.stdout+p.stderr)[-1400:],flush=True)
 if p.returncode:sys.exit(p.returncode)
