#!/usr/bin/env python3
"""Start the local-only API gateway; launch the real Vite app after fixture seeding."""
import json
import os
from pathlib import Path
import subprocess
import shutil
import sys

root = Path(sys.argv[1]).resolve()
repo = Path(__file__).resolve().parents[2]
subprocess.run([sys.executable,str(repo/'scripts/local-volunteer/provision.py'),str(root),'--check'],check=True)
m=json.loads((root/'target-construction.json').read_text())
assert (root/'migration-installed.json').exists(), 'Apply the guarded source schema and draft first'
assert m['controlRole']=='supabase_admin'
private=json.loads((root/'private.json').read_text())
for name in ['.env','.env.local','.env.development','.env.development.local']:
    assert not (repo/name).exists(), 'Refusing to load an existing application dotenv file'
env=dict(os.environ)
for key in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']:
    env.pop(key,None)
docker=['docker','--host=unix:///var/run/docker.sock']
def run(args):
    return subprocess.check_output(docker+args,env=env,text=True).strip()
# Font support belongs to this test container, not the product styles.
font_source=Path('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')
if font_source.exists():
    (root/'fonts').mkdir(exist_ok=True)
    shutil.copyfile(font_source,root/'fonts/NotoSansCJK-Regular.ttc')
    (root/'fontconfig.xml').write_text('<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><include ignore_missing="yes">/etc/fonts/fonts.conf</include><dir>'+str(root/'fonts')+'</dir><cachedir>'+str(root/'font-cache')+'</cachedir></fontconfig>')
name=m['projectRef']+'-app'
if '--vite' in sys.argv:
    fixture=json.loads((root/'fixture-state.json').read_text())
    c=json.loads(run(['container','inspect',name]))[0]
    assert c['Config']['Labels']['hkscda.fixture']==m['fixtureId'] and set(c['NetworkSettings']['Networks'])=={m['network']}
    run(['exec','-d','--env','VOLUNTEER_JOB_ACTOR_ID='+fixture['accounts']['worker']['id'],name,'bash','-c','exec bun run dev --host 0.0.0.0 --port 59330 > "$LOCAL_ACCEPTANCE_ROOT/vite-private.log" 2>&1'])
    print('Launched actual Vite app in '+name+'; inspect readiness separately')
    sys.exit(0)
assert name not in run(['ps','-a','--format','{{.Names}}']).splitlines(), 'App exists: preserve it and inspect readiness'
variables={
 'LOCAL_ACCEPTANCE_ROOT':str(root),
 'LOCAL_TEST_CONTROL_URL':'postgres://supabase_admin:'+private['controlPassword']+'@db:5432/postgres',
 'SUPABASE_URL':'http://127.0.0.1:59321','VITE_SUPABASE_URL':'http://127.0.0.1:59321',
 'SUPABASE_SERVICE_ROLE_KEY':private['serviceKey'],'VITE_SUPABASE_ANON_KEY':private['anonKey'],
 'APP_URL':'http://127.0.0.1:59330','VITE_PUBLIC_SITE_ORIGIN':'http://127.0.0.1:59330',
 'RESEND_API_KEY':'','STRIPE_SECRET_KEY':'','PAYPAL_CLIENT_SECRET':'','SUPPORTER_RECOVERY_ENABLED':'false',
 'VITE_PUBLIC_DONATION_CHECKOUT_ENABLED':'false','VITE_PUBLIC_IMAGE_TRANSFORMS':'false',
 'NO_PROXY':os.environ.get('NO_PROXY','')+',127.0.0.1,localhost,db,auth,rest,storage',
 'BUN_INSTALL_CACHE_DIR':str(root/'bun-cache'),
}
variables['no_proxy']=variables['NO_PROXY']
path=root/'application.env';path.write_text(''.join(k+'='+v+'\n' for k,v in variables.items()));os.chmod(path,0o600)
image=json.loads(run(['image','inspect','hkscda-tests:node24-chrome']))[0]
container=run(['run','-d','--init','--shm-size=1g','--user',str(os.getuid())+':'+str(os.getgid()),'--name',name,'--label','hkscda.fixture='+m['fixtureId'],'--network',m['network'],'--network-alias','app','--publish','127.0.0.1:59321:59321','--publish','127.0.0.1:59330:59330','--mount','type=bind,src='+str(repo)+',dst='+str(repo),'--mount','type=bind,src=/workspace/.hkscda-tools/node_modules,dst=/workspace/.hkscda-tools/node_modules,readonly','--mount','type=bind,src='+str(root)+',dst='+str(root),'--env-file',str(path),'--env','NO_PROXY='+variables['NO_PROXY'],'--env','no_proxy='+variables['no_proxy'],'-w',str(repo),image['Id'],'bun','scripts/local-volunteer/gateway.ts'])
m['appContainerId']=container;m['appImageId']=image['Id']
(root/'target-construction.json').write_text(json.dumps(m,indent=2)+'\n')
print(json.dumps({'appContainer':name,'id':container,'networkInternal':True,'gateway':'http://127.0.0.1:59321 inside app container','transport':'private Docker network only','productionConnection':False}))
