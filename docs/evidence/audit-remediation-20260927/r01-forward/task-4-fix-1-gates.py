import datetime, json, os, pathlib, re, subprocess, sys, time

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
root = pathlib.Path.cwd()
phase = sys.argv[1]
assert phase in ('baseline', 'pre-acl', 'final')
env = os.environ.copy()
for key in list(env):
    if key.endswith('TEST_DATABASE_URL') or key.endswith('ALLOW_LOCAL_FIXTURES'):
        env.pop(key)
env.update(CHECKOUT_POLICY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:57322/postgres', SUPABASE_LOCAL_URL='http://127.0.0.1:52321')
out = root / '.superpowers/sdd/r01-forward-schema-plan-20261001'
receipt = {'phase': phase, 'source': subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(), 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'environment':'loopback DB57322/Auth52321; build DB54329 ci-placeholder keys; inherited feature DB opt-ins removed', 'gates': []}
for name, args in [('typecheck',['bun','run','typecheck']),('tests',['bun','test','--isolate','--timeout','30000']),('lint',['bun','run','lint']),('build',['bun','run','build'])]:
    if name == 'build':
        env.update(VITE_SUPABASE_URL='http://127.0.0.1:54329', VITE_SUPABASE_ANON_KEY='ci-placeholder-anon-key', SUPABASE_URL='http://127.0.0.1:54329', SUPABASE_SERVICE_ROLE_KEY='ci-placeholder-service-role-key')
    log = out / f'task-4-fix-1-{phase}-{name}.log'
    started = time.monotonic()
    with log.open('wb') as handle:
        code = subprocess.run(args, env=env, stdout=handle, stderr=subprocess.STDOUT).returncode
    text = log.read_text(encoding='utf-8', errors='replace')
    gate = {'gate':name,'command':' '.join(args),'exit':code,'elapsedSeconds':round(time.monotonic()-started,2),'log':log.name}
    if name == 'tests':
        gate['summary'] = re.findall(r'^\s*\d+ (?:pass|fail|skip|expect\(\) calls)\s*$',text,re.M)
    receipt['gates'].append(gate)
    (out / f'task-4-fix-1-{phase}-gates.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(gate),flush=True)
    if code:
        print(text[-4500:],flush=True)
receipt['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
(out / f'task-4-fix-1-{phase}-gates.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
sys.exit(int(any(g['exit'] for g in receipt['gates'])))
