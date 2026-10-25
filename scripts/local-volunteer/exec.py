#!/usr/bin/env python3
"""Run one named acceptance phase in this target's verified app container."""
import json
import os
from pathlib import Path
import subprocess
import sys
root=Path(sys.argv[1]).resolve(); phase=sys.argv[2]
assert phase in ['seed','native','browser-stats','browser-worker','verify']
repo=Path(__file__).resolve().parents[2]
subprocess.run([sys.executable,str(repo/'scripts/local-volunteer/provision.py'),str(root),'--check'],check=True)
m=json.loads((root/'target-construction.json').read_text())
env=dict(os.environ)
for k in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']:env.pop(k,None)
docker=['docker','--host=unix:///var/run/docker.sock'];name=m['projectRef']+'-app'
c=json.loads(subprocess.check_output(docker+['container','inspect',name],env=env,text=True))[0]
assert c['Id']==m['appContainerId'] and c['Config']['Labels']['hkscda.fixture']==m['fixtureId'] and set(c['NetworkSettings']['Networks'])=={m['network']}
p=subprocess.run(docker+['exec',name,'bun','scripts/local-volunteer/'+phase+'.ts'],cwd=repo,env=env,text=True,capture_output=True)
(root/(phase+'.log')).write_text(p.stdout+p.stderr)
print((p.stdout+p.stderr)[-10000:]);sys.exit(p.returncode)
